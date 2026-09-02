---
title: "11. RustFS 部署与 Kopia 切换"
date: 2026-09-02T10:46:00+08:00
slug: pve-journey-11-rustfs-kopia
description: "自建 S3 后端（RustFS），Kopia 切到对象存储。"
draft: false
tags:
  - PVE
  - Kopia
  - RustFS
  - S3
  - 切换
  - LXC
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


> [!info] CT110 实际 IP 是 DHCP 分配的 (`192.168.31.128`),不是手写固定的
> 部署后用 `pct exec 110 -- ip -4 addr | grep inet` 查实际 IP。Tailscale IP (`100.115.66.48`) 也可能变。


> [!warning] 敏感信息说明
本文涉及的 RustFS `SECRET_KEY` 已脱敏为 `<your-secret-key>`。部署时用你生成的随机密钥,生产建议从环境变量读取。

# 11. RustFS 部署与 Kopia 切换

## 背景

2026-08-30 发现 HHD_3TB 池 metadata 损坏、Kopia 仓库受损后,决定:

1. **不**把 Kopia 留在 local FS (风险太高)
2. **要**给 Kopia 一个更可靠的后端 → S3
3. **要**这个 S3 在自己控制之下 → 自建 (RustFS, 不依赖 AWS)

**自建 S3** 的好处:
- 数据在自己机器上 (PVE 内)
- 无月费、无 egress 费
- 隐私可控
- 替代品多 (MinIO / Garage / SeaweedFS)

**为什么选 RustFS 而不是 MinIO?**

| 项 | MinIO | RustFS |
|---|---|---|
| 语言 | Go | Rust |
| 二进制大小 | ~100MB | 243MB (musl 静态) |
| 内存占用 | 100-200MB | ~65MB |
| 启动时间 | 1-2s | <1s |
| API 兼容性 | S3 v2/v4 | S3 v4 |
| 资源占用 | 中 | 低 |
| 上游活跃度 | 稳定 | 新 (preview) |

RustFS 优势:
- 极低内存占用 (我的 CT110 只 1GB RAM,得省着用)
- 静态链接,无依赖
- 简洁

劣势:
- 还是 preview 版本 (1.0.0-rc.5-preview.2)
- 社区小
- 有 bug 风险

**权衡**: RustFS preview 风险 vs MinIO 高占用 → 我选 RustFS(数据可恢复性,出问题再换 MinIO 即可)。

## 设计

```cmd
[各备份客户端 PC]
        │
        │ kopia push (HTTPS, S3 API)
        ↓
┌──────────────────────────────────────────┐
│ CT110 (LXC, rustfs)                      │
│  - RustFS daemon: 192.168.31.128:9000    │
│  - /data → HHD_3TB/rustfs-data (zfs)     │
└──────────────────────────────────────────┘
        │
        ↓
   ┌─────────────────────────────────────┐
   │ HHD_3TB/rustfs-data/ (zfs)          │
   │  - quota 500G                      │
   │  - compression lz4                │
   │  - recordsize 1M                  │
   │  - 含所有 Kopia S3 objects        │
   └─────────────────────────────────────┘
```

## CT110 部署

### LXC 配置

```yaml
CTID: 110
hostname: rustfs
OS: Debian 12
arch: amd64
cores: 2
memory: 1024 MB
swap: 512 MB
rootfs: SSD_1TB:subvol-110-disk-0, 8 GB   # 系统盘 SSD
mp0: /HHD_3TB/rustfs-data, mp=/data      # 数据盘 HDD
net0: name=eth0, bridge=vmbr0, firewall=1, ip=dhcp
features: nesting=1
unprivileged: 1                          # ← 隔离
onboot: 1                                # ← 自动启动
lxc.cgroup2.devices.allow: c 10:200 rwm  # ← Tailscale tun
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

设计要点:
- **unprivileged**: 隔离 PVE host,LXC 内的 uid 0 ≠ PVE host uid 0
- **onboot=1**: PVE 启动时自动启动(数据流不能断)
- **TUN 透传**: 未来接 Tailscale (虽然当前没启用)

### ZFS dataset

```bash
zfs create -o mountpoint=/HHD_3TB/rustfs-data HHD_3TB/rustfs-data
zfs set quota=500G HHD_3TB/rustfs-data
zfs set compression=lz4 HHD_3TB/rustfs-data
zfs set recordsize=1M HHD_3TB/rustfs-data
zfs set atime=off HHD_3TB/rustfs-data
```

设计要点:
- **quota 500G**: 限制最大用量,避免撑爆 HHD_3TB 池
- **compression lz4**: 几乎无 CPU 成本,普遍能省 30-50%
- **recordsize 1M**: RustFS 写大对象多,1M 是 ZFS 推荐的最大 recordsize
- **atime off**: 不记录访问时间,减少 write

**注意**: 父目录需要 `chmod 777`,让 CT102 (unprivileged, 在 CT 里映射成 uid 100000+) 能写。

```bash
chmod 777 /HHD_3TB/rustfs-data
```

## RustFS 安装

### 下载

```bash
wget https://github.com/rustfs/rustfs/releases/download/1.0.0-rc.5-preview.2/rustfs-linux-x86_64-musl-v1.0.0-rc.5-preview.2.zip

# SHA256: 10c161ac18b39505d554825fdea0f8695d4ca562b5d4377d0e7af6b1011ad20f
```

验证 checksum(非常重要,preview 版本):

```bash
sha256sum rustfs-linux-x86_64-musl-v1.0.0-rc.5-preview.2.zip
# 比对官方 SHA256
```

### 安装

```bash
unzip rustfs-linux-x86_64-musl-v1.0.0-rc.5-preview.2.zip
mv rustfs /usr/local/bin/rustfs
chmod +x /usr/local/bin/rustfs
```

243 MB,**单文件静态链接**,无任何依赖。

### 配置

`/etc/rustfs/env`:

```bash
RUSTFS_VOLUMES=/data
RUSTFS_ADDRESS=0.0.0.0:9000
RUSTFS_CONSOLE_ADDRESS=0.0.0.0:9001
RUSTFS_CONSOLE_ENABLE=true
RUSTFS_ACCESS_KEY=admin
RUSTFS_SECRET_KEY=<your-secret-key>
RUSTFS_REGION=us-east-1
```

**注意**:
- `ACCESS_KEY` / `SECRET_KEY` 是 S3 凭证,改默认!
- 内网用 `RUSTFS_ADDRESS=0.0.0.0`(绑所有接口),**别用 127.0.0.1**

### systemd unit

(我自己写)

```ini
[Unit]
Description=RustFS Object Storage
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/rustfs/env
ExecStart=/usr/local/bin/rustfs
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now rustfs
systemctl status rustfs
```

### 验证

```bash
# 看资源占用
ps -ef | grep rustfs
# /usr/local/bin/rustfs  ←  应该是单进程

# 资源占用
top -p $(pidof rustfs)
# RAM ~65MB,几乎不动 CPU

# 端口监听
ss -tlnp | grep -E "9000|9001"
# 0.0.0.0:9000  ← S3 API
# 0.0.0.0:9001  ← Web console
```

## 客户端验证

### mc (MinIO client)

```bash
# 装 mc
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc

# 配置 alias
mc alias set rustfs http://192.168.31.128:9000 admin <your-secret-key>

# 测试
mc mb rustfs/test-bucket  # ← 创建测试 bucket
mc cp /etc/hostname rustfs/test-bucket/
mc ls rustfs/test-bucket
mc cat rustfs/test-bucket/hostname
```

### aws-cli

```bash
apt install awscli
aws configure
# AWS Access Key ID: admin
# AWS Secret Access Key: <your-secret-key>
# Default region: us-east-1
# Default output format: json

aws --endpoint-url http://192.168.31.128:9000 s3 ls
```

### kopia (重点!)

```bash
kopia repository create s3 \
  --bucket=kopia-backup \
  --endpoint=http://192.168.31.128:9000 \
  --access-key=admin \
  --secret-access-key=<your-secret-key> \
  --disable-tls

# 测试 push
kopia snapshot create /tmp/test-data
kopia snapshot list
# 应该能看到新快照
```

**注意**: `--disable-tls` 是因为 RustFS 没配 TLS 证书(内网用)。

生产环境应该上 TLS,否则 S3 secret key 在网络上裸跑。

## Tailscale (未来)

CT110 conf 留了 TUN 透传配置,但当时没立即启用 Tailscale。

后续可以:
1. PVE 启 Tailscale
2. CT110 启 Tailscale
3. 各客户端通过 100.x.x.x 访问 RustFS
4. 不再需要 VPN

## Kopia 数据迁移

### 旧仓库: `/SSD_1TB/kopia_rescue/KopiaRepo`

这个目录里有从 HHD_3TB 抢救出来的 Kopia 数据(部分可能损坏)。

**决策**: **不继续使用**。
- 完整性未知
- 怕 dedup 的 manifest 损坏导致 push 新数据时被污染
- 决定从头开始,接受"丢失已抢救的部分"这个现实

### 新仓库: RustFS S3 上的 kopia-backup bucket

从零开始建立:

```bash
# 在 CT110 上
aws --endpoint-url http://192.168.31.128:9000 s3 mb s3://kopia-backup

# 在每个客户端 PC 上
kopia repository create s3 \
  --bucket=kopia-backup \
  --endpoint=http://192.168.31.128:9000 \
  --access-key=admin \
  --secret-access-key=... \
  --disable-tls

# 设置保留策略
kopia policy set --global \
  --keep-annual=3 \
  --keep-monthly=24 \
  --keep-weekly=4 \
  --keep-daily=7 \
  --keep-hourly=48

# Push 当前数据
kopia snapshot create /home/user/work
kopia snapshot create /home/user/bills
```

### 迁移现状 (2026-09-02)

- [ ] 各 PC 客户端还没配置(家里电脑 / 公司电脑 / redmi-pad-se 都没接到 CT111 设备 ID)
- [ ] 等所有客户端接入后,统一做初始 snapshot push

## 关键决策

### 1. 自建 S3 vs AWS S3

**自建 (RustFS)**:
- ✅ 数据在自己控制下
- ✅ 无月费 / 无 egress
- ❌ 单点故障 (一台机器)
- ❌ 异地备份没解决

**AWS S3 / Backblaze B2**:
- ✅ 真异地 + 高可用
- ❌ 有月费 (但很便宜,$5/TB/月)
- ❌ egress 费贵

**决策**: 先自建 + **马上**接 Backblaze B2 做异地副本。

### 2. RustFS vs MinIO

RustFS 优势 (内存 / 启动),但 preview 版本。

如果 RustFS 出问题:
- 数据在 zfs dataset 上,不丢
- MinIO 可以读同一个目录(都是 S3 对象)
- 5 分钟切换

**决策**: RustFS + MinIO fallback plan。

### 3. CT102 是否销毁

**销毁**:
- ✅ 释放 SSD_1TB 上 1.5GB
- ❌ 失去旧 Kopia 仓库(已经决定不用了)

**保留**:
- ❌ 占用资源(空 LXC, ~1.5GB)
- ✅ 万一想从旧仓库抢救点东西还能进

**决策**: 销毁(2026-09-01)。

## 教训

### 教训 1: 备份后端选 S3 而不是 local FS

**为什么 local FS 后端脆弱**:
- 文件系统 metadata 损坏 → 整个仓库可能不可信
- 没内置 checksum 验证
- 单点

**为什么 S3 后端更可靠**:
- object-level checksum
- object storage 通常内部多副本
- 即使本地 metadata 坏,对象还在

**原则**: **任何 Kopia / restic / borg 仓库,后端用 S3 / SFTP / 异地,别用本机 local FS**。

### 教训 2: 任何 preview 版本工具都要准备 fallback

RustFS 1.0.0-rc.5-preview.2 是 preview,**有 bug 风险**。

应对:
- 数据放 ZFS dataset(可挂到任何 S3 兼容 server)
- 准备 MinIO binary 作为 fallback
- 监控 RustFS 进程存活

### 教训 3: 不要在 metadata 损坏的池上跑新服务

RustFS 数据盘 /HHD_3TB/rustfs-data 还是在 HHD_3TB 池上。

虽然 metadata 损坏已经被 zpool clear 清掉,但底层池还是单盘 HDD。

更稳: 切到 SSD_1TB (mirror 池)。但 SSD_1TB 现在 DEGRADED。

**现状**: 三池 (rpool / SSD_1TB / HHD_3TB) 都有问题。

详见 [12-硬盘损坏全程记录](/posts/pve-journey-12-hdd-failure/)。

### 教训 4: 别忘了上 TLS

当前 RustFS 走 HTTP,S3 secret key 裸跑在内网。

风险:
- 内网被攻破 → secret key 泄露 → 所有 S3 bucket 数据可读
- 同事/家人能截获流量

**未来**: 上 Caddy reverse proxy + 自签证书,或者 Let's Encrypt。

## 实操命令清单

```bash
# 看 RustFS 状态
systemctl status rustfs
journalctl -u rustfs -n 50 --no-pager

# S3 操作 (在装了 aws-cli / mc 的机器上)
mc ls rustfs/
mc du rustfs/kopia-backup

# kopia 客户端
kopia repository status
kopia snapshot list
kopia maintenance run --full

# RustFS 数据盘使用
du -sh /HHD_3TB/rustfs-data
zfs list HHD_3TB/rustfs-data
```

## 当前架构

```cmd
                    ┌──────────────────┐
                    │ PVE host         │
                    │  - rpool (mirror)│
                    │  - SSD_1TB(DEG!) │
                    │  - HHD_3TB       │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ↓                    ↓                    ↓
   CT104 (opencode)    CT110 (rustfs)       CT111 (syncthing)
        ↓                    ↓                    ↓
   /data/opencode    /data (HHD_3TB/rustfs)  /data (HHD_3TB/syncthing)
                          │
                          ↓ S3 objects
                    ┌─────────────────────┐
                    │ kopia clients (PCs) │
                    │  (待接入)            │
                    └─────────────────────┘
```

## 未来工作

- [ ] CT110 上 Tailscale (config 已留)
- [ ] 各 PC 接 kopia 客户端到 RustFS S3
- [ ] 上 TLS (Caddy / Let's Encrypt)
- [ ] Backblaze B2 异地副本 (每月 $0.5 足够)
- [ ] 监控 zpool status 任何 DEGRADED 立即告警
- [ ] 每月一次实际恢复演练

## 下一篇

[12. 硬盘损坏全程记录 →](/posts/pve-journey-12-hdd-failure/)
