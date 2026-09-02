---
title: "03. PBS 数据备份迁移"
date: 2026-09-02T10:14:00+08:00
slug: pve-journey-03-pbs-migration
description: "HHD_3TB/backup → backup-mirror 迁移全过程。"
draft: false
tags:
  - PVE
  - PBS
  - 备份
  - ZFS
  - 迁移
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


# 03. PBS 数据备份迁移

## 背景

PBS (Proxmox Backup Server) 数据原来存在 `HHD_3TB/backup`,500G 数据:

```cmd
zfs list
HHD_3TB/backup      500G   510G   /HHD_3TB/backup
```

这名字太通用了:
- 容易和别的 backup 混
- 名字不代表内容(它现在是 PBS datastore)
- 想改成 `backup-mirror` 表明是镜像策略的备份

## 方案

不需要复杂工具,直接 zfs rename + PBS 配置改路径:

```cmd
1. 停 PBS 服务 (避免正在写入时改名)
2. zfs rename HHD_3TB/backup HHD_3TB/backup-mirror
3. 改 /etc/proxmox-backup/datastore.cfg
4. 起 PBS 服务
```

## 执行过程

### Step 1: 停 PBS

```bash
systemctl stop proxmox-backup proxmox-backup-proxy
# 确认停掉
systemctl is-active proxmox-backup proxmox-backup-proxy
# 应该输出 inactive
```

### Step 2: zfs rename

```bash
zfs rename HHD_3TB/backup HHD_3TB/backup-mirror
# 秒级完成(只改 metadata,不挪数据)
zfs list | grep backup
# HHD_3TB/backup-mirror  500G   510G   /HHD_3TB/backup-mirror
```

### Step 3: 改 PBS datastore 配置

```bash
cat /etc/proxmox-backup/datastore.cfg
# 原:
# datastore: backup
#   path /HHD_3TB/backup/pbs_datastore
```

编辑 `/etc/proxmox-backup/datastore.cfg`:

```ini
datastore: backup-mirror
        path /HHD_3TB/backup-mirror/pbs_datastore
        gc-schedule daily
        prune-schedule daily
```

**两个改的地方**:
- `datastore: backup` → `datastore: backup-mirror`
- `path /HHD_3TB/backup` → `path /HHD_3TB/backup-mirror`

### Step 4: 起 PBS + 验证

```bash
systemctl start proxmox-backup
systemctl start proxmox-backup-proxy
# 验证
proxmox-backup-manager datastore list
# 应该看到 backup-mirror
```

### Step 5: PVE 端备份任务改 datastore 名

PVE 主机上,所有 `vzdump` 任务 / 自动备份 cron 要改 datastore 名:

```bash
# /etc/pve/jobs.cfg
# 把所有 backup 改成 backup-mirror
```

## 关键点

### ZFS rename 不动数据

zfs rename 只改 metadata:
- 不复制任何 block
- 不消耗 IO
- 秒级完成
- 路径变了但数据原封不动

这就是 ZFS 比 ext4 强的地方:rename 几乎是免费的。

### 路径双层的原因

PBS 配置的路径是 `/HHD_3TB/backup-mirror/pbs_datastore`,不是 `/HHD_3TB/backup-mirror` 本身。

为什么?因为 ZFS dataset 已经挂载到 `backup-mirror` 根,PBS 数据在其内部一个子目录 `pbs_datastore/`。这样 ZFS snapshot 也包含 PBS 数据。

```cmd
/HHD_3TB/backup-mirror/        ← ZFS dataset mountpoint
└── pbs_datastore/             ← PBS 内部目录
    ├── chunks/
    ├── indexes/
    ├── snapshots/
    └── ...
```

### 销毁旧 dataset

```bash
# 验证 PBS 完全切到新路径后再做
zfs destroy HHD_3TB/backup
# 500GB 释放
```

**警告**: 旧 dataset 上**没有**重要数据(已经是 PBS 内部数据),所以 destroy 安全。但**先验证 PBS 跑通,再 destroy**。

## 实际操作踩坑

### 坑 1: PBS 启动时检查路径存在性

PBS 启动会验证 datastore 路径存在且可写。如果路径不存在,启动失败。

**正确顺序**: zfs rename → 改 config → 起 PBS

如果 config 路径写错了,起 PBS 会报错但不破坏数据。改对再起就行。

### 坑 2: PVE 端 vzdump cron job

PVE 主机上的备份 job(`/etc/pve/jobs.cfg`)datastore 名是字符串匹配,如果还指着 "backup",会报错说找不到 datastore。

```bash
# 改 jobs.cfg
sed -i 's/datastore: backup$/datastore: backup-mirror/' /etc/pve/jobs.cfg
```

## 验证清单

```bash
# 1. PBS 服务健康
systemctl is-active proxmox-backup
# active

# 2. PBS datastore 列表
proxmox-backup-manager datastore list
# 看到 backup-mirror

# 3. PVE 端 datastore 可见
pvesm status
# backup-mirror  enabled  active

# 4. 跑一次测试备份
vzdump 9000 --storage backup-mirror --mode snapshot
# (9000 是测试 VM ID)
```

## 教训

### 教训 1: ZFS rename 几乎免费

迁移几百 GB 数据用 ZFS rename,而不是 `cp -a` 或 `rsync`,**秒级完成**,0 IO,0 风险。

**原则**: 能用 ZFS 层级解决的迁移,就别碰数据 copy。

### 教训 2: 服务名要规范

`backup` → `backup-mirror` 看起来是小事,但:
- 以后 grep / audit 容易找
- 含义清晰(这是镜像策略,不是 gold backup)
- 跟另一个 `backup-primary` 区分开

**原则**: 服务起名要有 `角色-策略-类型` 维度。

### 教训 3: 修改前停服务,不要想当然

PBS 改名一定要停服务。ZFS rename 不会破坏正在写入,但 PBS 启动检查会失败。

**原则**: 任何 datastore / database 路径修改,先停服务,改完起服务。

## 最终状态

```cmd
HHD_3TB/backup-mirror  500G  used  /HHD_3TB/backup-mirror
  └── pbs_datastore/          ← PBS 数据

PBS: 11h+ uptime
PVE: 备份 cron 都已切到 backup-mirror
旧 backup: 已 destroy (释放 500GB)
```

## 下一篇

[04. CT111 Syncthing LXC 部署 →](/posts/pve-journey-04-ct111-syncthing/)
