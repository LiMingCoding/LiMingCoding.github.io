---
title: "06. 16379 个 permission denied 排查"
date: 2026-09-02T10:22:00+08:00
slug: pve-journey-06-permission-denied
description: "最大的故障排查故事：5 步走错路，1 行 chown 解决。"
draft: false
tags:
  - PVE
  - Syncthing
  - 权限
  - chown
  - 踩坑
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


# 06. 16379 个 permission denied 排查

## 问题

CT111 Syncthing 部署好,三个文件夹都加了:

- ✅ 共享文件夹: inSync (立刻)
- ✅ 服务、物资对账单: 27GB/40GB (持续 sync, 18 MB/s)
- ❌ **工作学习**: 0/16GB,完全没动

用户报告:"VM105 也有工作学习文件夹,怎么没同步?"

## 第一步:确认 VM105 真有数据

从 CT111 端看:

```bash
curl -H "X-API-Key: $KEY" \
  http://127.0.0.1:8384/rest/db/status?folder=nsylc-yh8lq | jq
```

```json
{
  "globalBytes": 17718404663,    ← 16.5GB!VM105 确实有
  "localBytes": 0,                ← 但 CT111 没有
  "needBytes": 17718404663,       ← CT111 想拉
  "pullErrors": 16379,            ← 16379 个错误!
  "state": "idle"
}
```

**结论**: VM105 确实有 16.5GB,CT111 想拉,但 **16379 个 pull 错误** 拦住了。

## 第二步:看具体错误

`/rest/events?limit=500`:

```cmd
[2026-09-02T01:20:21] ItemFinished: {
  'action': 'update',
  'error': 'mkdir /data/工作学习/.obsidian: permission denied',
  'folder': 'nsylc-yh8lq',
  'item': '.obsidian',
  'type': 'dir'
}

[2026-09-02T01:20:21] ItemFinished: {
  'error': 'mkdir /data/工作学习/.space: permission denied',
  'item': '.space'
}

[2026-09-02T01:20:21] ItemFinished: {
  'error': 'mkdir /data/工作学习/0未整理文件: permission denied',
  'item': '0未整理文件'
}
... (重复 16379 次)
```

**关键错误**: `mkdir /data/工作学习/.obsidian: permission denied`

## 第三步:为什么?

```bash
ls -lad /data
# drwxrwxrwx 5 nobody nogroup   /data    ← 0777,谁都能写

ls -lad /data/工作学习
# drwxr-xr-x 3 root root        /data/工作学习   ← 我手动 mkdir 用的 root!

ls -lad /data/共享文件夹
# drwxr-xr-x 17 syncthing syncthing   /data/共享文件夹   ← Syncthing 自己创建的,owner 正确

ls -lad /data/同步文件夹
# drwxr-xr-x 3 syncthing syncthing   /data/同步文件夹  ← 同上
```

**根因**: 

我在修 [Syncthing folder marker missing](/posts/pve-journey-05-syncthing-debug/) 时手动跑了:

```bash
mkdir /data/工作学习/.stfolder
```

这命令是 **root** 跑的,导致 `/data/工作学习/` 整个目录 tree owner 变成 `root:root`。

Syncthing 进程用户是 `syncthing` (uid 100xxx),可以:
- 写入 `/data/` (0777,任何用户可写)
- 进入 `/data/工作学习/` (0755,任何用户可进入)
- ❌ **不能在 `/data/工作学习/` 下创建子目录** (因为 owner 是 root)

Syncthing 想建 `.obsidian/` `.space/` `0未整理文件/` 这些 VM105 上有的目录,**全部失败**。

## 第四步:走错的弯路

> 这一步完全没必要,记录下来提醒自己

我先怀疑是 mount 路径不对,试了:

1. `qemu-nbd -r -c /dev/nbd0 /dev/zd16` → 失败(选错盘)
2. 重连 `/dev/zd80` → VM105 boot 盘,64GB
3. 重连 `/dev/zd32` → VM105 数据盘,500GB,**但是 Linux RAID member** (`linux_raid_member` 类型)
4. `mount -o ro /dev/nbd1p1 /mnt/vm105` → 失败(不能直接 mount RAID member)
5. `zfs send SSD_1TB/vm-105-disk-1@inspect > /tmp/vm105-disk.raw` → 慢,放弃

总共花了 5+ 步去尝试读取 VM105 磁盘,**完全跑偏**。

**正解**: 看 CT111 自己的 `/rest/events` 就能看到错误信息,**根本不需要碰 VM105**。

详见 [08-调试方法论](/posts/pve-journey-08-debug-methodology/)。

## 第五步:修复

一行命令:

```bash
pct exec 111 -- chown -R syncthing:syncthing /data/工作学习
```

验证:

```bash
ls -lad /data/工作学习
# drwxr-xr-x 18 syncthing syncthing   ← owner 改对了 ✓
```

## 第六步:验证修复

触发 rescan:

```bash
curl -X POST -H "X-API-Key: $KEY" \
  "http://127.0.0.1:8384/rest/db/scan?folder=nsylc-yh8lq"
```

等 60 秒,再看 status:

```json
{
  "state": "syncing",
  "localBytes": 6733956046,    ← 6.7GB 已拉!
  "inSyncBytes": 6998206045,
  "needBytes": 10772144410,
  "pullErrors": 0,              ← 0 错误!
  "errors": 0
}
```

**40% 同步完成,0 错误**。

## 完整的修复过程

### 命令清单

```bash
# 1. 进入 CT111
pct exec 111 -- bash

# 2. 确认问题
pct exec 111 -- ls -lad /data/工作学习
# drwxr-xr-x 3 root root  ...

# 3. 修复 (1 行)
pct exec 111 -- chown -R syncthing:syncthing /data/工作学习

# 4. 验证 owner
pct exec 111 -- ls -lad /data/工作学习
# drwxr-xr-x 18 syncthing syncthing  ...

# 5. 触发 rescan
API_KEY=$(pct exec 111 -- grep -oP '<apikey>\K[^<]+' /var/lib/syncthing/.config/syncthing/config.xml | tr -d '\r')
pct exec 111 -- curl -sS -X POST -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:8384/rest/db/scan?folder=nsylc-yh8lq"

# 6. 等 1 分钟,看 status
pct exec 111 -- curl -sS -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:8384/rest/db/status?folder=nsylc-yh8lq" | python3 -m json.tool
```

## 关键诊断点

### 1. `pullErrors` 不是 0 立刻说明有问题

```cmd
pullErrors: 16379   ← 这是关键信号
```

正常工作的文件夹应该是 `pullErrors: 0`。

### 2. `/rest/events` 里有完整的错误 message

```cmd
error: 'mkdir /data/工作学习/.obsidian: permission denied'
```

直接告诉你哪里、什么权限、什么操作失败。

### 3. 对比成功的文件夹

```bash
ls -lad /data/*/ 
# 看哪个文件夹 owner 不是 syncthing,就是元凶
```

## 教训

### 教训 1: 永远不要用 root 给 daemon 用的目录 mkdir ⭐

`/data/工作学习/` 这个目录将来要给 `syncthing` 用户读写,**绝不能用 root mkdir**。

**正确的修法**:

```bash
pct exec 111 -u syncthing -- mkdir -p /data/工作学习/.stfolder
# 或
mkdir /data/工作学习/.stfolder && chown -R syncthing:syncthing /data/工作学习
```

(已存 memory,下次不再踩)

### 教训 2: 先看本端可观测面,再去碰远端磁盘

我先想去 mount VM105 磁盘读它的 config.xml,**完全没必要**。

CT111 自己的 `/rest/events` 已经把错误原因写得清清楚楚
(`mkdir /data/工作学习/.obsidian: permission denied`)。

**原则**: 排查 sync 问题时,**先查本端的 status/events/log**,别先动远端磁盘。

详见 [08-调试方法论](/posts/pve-journey-08-debug-methodology/)。

### 教训 3: Syncthing 错误不会自我暴露

Syncthing 不报警、不 banner、不弹窗。16379 个 error 就静静躺在 `/rest/events` 里。

**应对**: 监控脚本定期检查 `pullErrors` / `errors` 字段:

```bash
#!/bin/bash
# /usr/local/bin/syncthing-healthcheck.sh
API_KEY=$(...)
STATS=$(curl -sS -H "X-API-Key: $API_KEY" http://127.0.0.1:8384/rest/db/status?folder=$1)

ERR=$(echo "$STATS" | python3 -c "import json,sys; print(json.load(sys.stdin).get('pullErrors',0))")
if [ "$ERR" -gt 0 ]; then
  echo "WARNING: folder $1 has $ERR pull errors"
  exit 1
fi
```

### 教训 4: 进程 UID 检查应该自动化

```bash
# 任何时候新部署 daemon,问这 4 个问题:
# 1. 它跑在哪个 UID? (ps -ef | grep daemon)
# 2. 数据目录 owner 是谁?
# 3. 写入路径是否在 UID 可写范围?
# 4. 测试: sudo -u daemon touch /data/test_file
```

我这次栽在第 2 步:数据目录 owner 是 root,daemon UID 是 syncthing,**完全错配**。

## 复盘

| 步骤 | 时间 | 效果 |
|---|---|---|
| 1. 确认 VM105 有数据 | 30s | ✅ 1 行 API |
| 2. 看 pull error | 30s | ✅ 1 行 events |
| **3. 走错路去 mount VM105** | **10 分钟** | **❌ 跑偏** |
| 4. 回到正轨,看 /data owner | 30s | ✅ ls -lad |
| 5. chown 修复 | 10s | ✅ 1 行 |
| 6. 验证 sync 恢复 | 1 分钟 | ✅ |

**正确的总耗时**: ~3 分钟
**实际总耗时**: ~15 分钟
**跑偏代价**: 12 分钟,5+ 步尝试

## 记忆沉淀

```cmd
MEMORY: CT111 /data/<folder> 不能用 root mkdir
       (必须 syncthing 用户创建或事后 chown)
       否则 daemon 写不进子目录
```

## 下一篇

[07. VM105 迁移与 7 天观察期 →](/posts/pve-journey-07-vm105-migration/)
