---
title: "04. CT111 Syncthing LXC 部署"
date: 2026-09-02T10:34:00+08:00
slug: pve-journey-04-ct111-syncthing
description: "新建 CT111 + Tailscale 安装 + 替代 VM105 的设计。"
draft: false
tags:
  - PVE
  - LXC
  - Syncthing
  - Tailscale
  - 内网穿透
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


> [!warning] 敏感信息说明
本文涉及的 CT111 Tailscale IP 已脱敏 (`<ct111-tailscale-ip>`)。实际部署时用 `pct exec 111 -- tailscale ip -4` 查。


# 04. CT111 Syncthing LXC 部署

## 背景

VM105 (飞牛 NAS) 跑 Syncthing 已经很久,问题:
- GUI 经常挂 (web UI 启动失败)
- 想从手机外网访问,需要装 VPN/内网穿透
- VM 太重,跑个 Syncthing 占用资源高

想:搞一个专用 LXC (CT111) 跑 Syncthing + Tailscale,干净可控。

## 整体设计

```cmd
┌─────────────────────────────────────────┐
│ PVE Host                                │
│                                         │
│  ┌──────────┐    ┌─────────────────┐    │
│  │ Tailscale│    │ CT111 (LXC)     │    │
│  │ 100.74.x │◄──►│ - Tailscale     │    │
│  └──────────┘    │ - Syncthing     │    │
│                  │ - /data → HHD   │    │
│                  └─────────────────┘    │
└─────────────────────────────────────────┘
```

设计原则:
- **LXC** 比 VM 轻(启动 2s,空闲 50MB RAM)
- **Tailscale** 自动 NAT 穿透,0 公网端口暴露
- **ZFS bind mount** 直接用 HHD_3TB,不复制数据

## Step 1: 创建 LXC

PVE web UI 创建 CT111:

```cmd
Name: syncthing
Template: debian-12-standard
Disk: 4GB (rootfs,只需要装 tailscale + syncthing)
CPU: 1 core
RAM: 1GB
Network: vmbr0, 192.168.31.109/24
Features: nesting=1   ← 关键!
```

## Step 2: 配置 TUN 透传 (关键!)

LXC 默认不能创建 TUN 设备,Tailscale 需要。

### 编辑 `/etc/pve/lxc/111.conf`

```ini
# 在文件末尾添加:
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
features: nesting=1
```

**注意**:
- `c 10:200 rwm` = char device major=10 minor=200 (/dev/net/tun),rwm = 读写创
- `lxc.mount.entry` bind mount 宿主机的 /dev/net/tun 到 CT111
- `features: nesting=1` 允许嵌套 mount (overlayfs 之类需要)

### ⚠️ 不要写 nesting=0

官方文档说某些情况下可以 `nesting=0`,但 Tailscale 启动需要 mount namespace 嵌套,**实际测试必须 nesting=1**。

### 完整 conf 文件示例

```bash
cat /etc/pve/lxc/111.conf
```

```ini
arch: amd64
cores: 1
features: nesting=1
hostname: syncthing-ct
memory: 1024
net0: name=eth0,bridge=vmbr0,gw=192.168.31.1,hwaddr=BC:24:11:11:11:11,ip=192.168.31.109/24
ostype: debian
rootfs: local-zfs:subvol-111-disk-0,size=4G
swap: 512

# Tailscale tun
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

## Step 3: 启动 CT111

```bash
pct start 111
pct enter 111
```

## Step 4: 装基础工具

CT111 是 minimal Debian,缺很多工具:

```bash
apt update
apt install -y curl wget ca-certificates gnupg sudo
```

## Step 5: 装 Syncthing

### 用官方 repo (不要用 Debian 默认源,版本太旧)

```bash
# 添加 Syncthing GPG key
curl -fsSL https://syncthing.net/release-key.txt | gpg --dearmor -o /usr/share/keyrings/syncthing-archive-keyring.gpg

# 添加 apt source
echo "deb [signed-by=/usr/share/keyrings/syncthing-archive-keyring.gpg] https://apt.syncthing.net/ syncthing stable" > /etc/apt/sources.list.d/syncthing.list

apt update
apt install -y syncthing
```

### 装 systemd unit

Syncthing 提供 `syncthing@.service` template unit,为用户 syncthing 跑:

```bash
# 创建用户 (minimal Debian 没有)
useradd -r -d /var/lib/syncthing -s /bin/bash syncthing

# enable & start
systemctl enable syncthing@syncthing
systemctl start syncthing@syncthing
```

**注意**: service name 必须是 `syncthing@<USERNAME>`,unit 才生效。我最初写成 `syncthing@syncthing.service` 多写了 .service,systemd 找不到 unit。

## Step 6: 装 Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

脚本会:
- 加 apt source
- 装 tailscaled
- enable tailscaled (开机自启)

但**不会**自动 `tailscale up` (要 auth key)。

## Step 7: 配置 bind mount /data

让 CT111 直接用 HHD_3TB,不复制数据:

```bash
# 在 PVE host 上
zfs create HHD_3TB/syncthing
# 自动 mount 到 /HHD_3TB/syncthing

# 改 CT111 conf
echo "mp0: /HHD_3TB/syncthing,mp=/data" >> /etc/pve/lxc/111.conf
```

重启 CT111 后,/data 直接指向 HHD_3TB,容量 2.1TB 可用。

## Step 8: Tailscale up

需要 auth key,从 https://login.tailscale.com/admin/settings/keys 创建。

```bash
pct enter 111
tailscale up --authkey=tskey-auth-XXXXX --hostname=syncthing-ct
```

成功后:

```cmd
100.100.100.100  syncthing-ct  user@  linux   -
```

Tailscale IP 是 **<ct111-tailscale-ip>**。

## Step 9: 验证

```bash
# 从 PVE host ping
ping <ct111-tailscale-ip>
# 0.05ms (走 LAN,不是真的 internet)

# HTTP 测 Syncthing web UI
curl -I http://<ct111-tailscale-ip>:8384
# HTTP/1.1 200 OK

# Syncthing 端口
nc -zv <ct111-tailscale-ip> 22000
# succeeded!
```

## 故障排查

### 故障 1: tailscaled 启动失败

```bash
journalctl -u tailscaled
# "Network device /dev/net/tun not available"
```

**原因**: LXC 没透传 /dev/net/tun。

**修复**: 检查 `lxc.cgroup2.devices.allow: c 10:200 rwm` 和 `lxc.mount.entry` 都在 conf 里。

### 故障 2: Tailscale up 后没拿到 IP

```bash
tailscale status
# LogoutURL: https://login.tailscale.com/a/xxx
# 但 IP 显示 none
```

**原因**: auth key 过期 / 用错。

**修复**: 重新生成 key,重新 `tailscale up`。

### 故障 3: 重启 CT111 后 Tailscale 不自动 up

```bash
systemctl status tailscaled
# active running ✓
tailscale status
# 未连接
```

**原因**: Tailscale state 没持久化,或者没 enable tailscaled。

**修复**:

```bash
systemctl enable tailscaled
# state 文件在 /var/lib/tailscale,持久化
```

### 故障 4: 端口 22000 不通

```bash
# PVE host
nc -zv <ct111-tailscale-ip> 22000
# timeout
```

**原因**: Syncthing 默认 listen 0.0.0.0:22000,但如果改了 `127.0.0.1` 就外不通。

**修复**: 改 config.xml 的 `<listenAddress>` 为 `default`。

## 配置清单

### CT111 配置文件 `/etc/pve/lxc/111.conf`

```ini
arch: amd64
cores: 1
features: nesting=1
hostname: syncthing-ct
memory: 1024
net0: name=eth0,bridge=vmbr0,gw=192.168.31.1,hwaddr=BC:24:11:11:11:11,ip=192.168.31.109/24
ostype: debian
rootfs: local-zfs:subvol-111-disk-0,size=4G
swap: 512
mp0: /HHD_3TB/syncthing,mp=/data

lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

### Syncthing systemd unit

`systemctl enable syncthing@syncthing` (不要加 .service)

### Tailscale config

```bash
tailscale up --authkey=$KEY --hostname=syncthing-ct --accept-routes
```

## 教训

### 教训 1: LXC 三件套记住

Tailscale / WireGuard / TUN 类 daemon 在 LXC 上都要这三件套:

```cmd
features: nesting=1
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

### 教训 2: systemd template unit 别加 .service

`systemctl enable syncthing@syncthing` 不是 `syncthing@syncthing.service`。

### 教训 3: Syncthing web UI 别用 127.0.0.1 bind

默认 `<listenAddress>127.0.0.1:8384</listenAddress>`,从外网访问不到。

内网机器,不用这么严格→ 改成 `0.0.0.0:8384` (或 `default`)。

详见 [05-Syncthing配置调试](/posts/pve-journey-05-syncthing-debug/)。

### 教训 4: LXC bind mount 不用复制数据

`/HHD_3TB/syncthing` 直接 mp0 到 CT111 `/data`,0 复制,0 同步问题,文件路径天然一致。

### 教训 5: ZFS 子集创建用 `zfs create` 而不是 mkdir

```bash
zfs create HHD_3TB/syncthing
# 自动挂载到 /HHD_3TB/syncthing
# 能 zfs snapshot
# 能 quota 限速
```

mkdir 做不到这些。

## 最终状态

```cmd
PVE host
└── CT111 (syncthing-ct)
    ├── IP LAN:     192.168.31.109
    ├── IP Tailscale: <ct111-tailscale-ip>
    ├── tailscale:    up, persistent
    ├── syncthing:    up, GUI 0.0.0.0:8384
    └── /data:        bind mount HHD_3TB/syncthing (2.1TB)
```

## 下一篇

[05. Syncthing 配置调试 →](/posts/pve-journey-05-syncthing-debug/)
