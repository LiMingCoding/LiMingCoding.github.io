---
title: "10. Kopia 数据丢失与复盘"
date: 2026-09-02T10:46:00+08:00
slug: pve-journey-10-kopia-data-loss
description: "真实数据丢失事件复盘：HHD_3TB metadata 损坏 → Kopia 仓库受损 → 抢救不完整。"
draft: false
tags:
  - PVE
  - Kopia
  - 备份
  - 数据丢失
  - 复盘
  - ZFS
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


> [!warning] 敏感信息说明
本文涉及的真实密码 (`<your-password>`) 与用户名 (`<kopiauser@host>`) 已脱敏。阅读时按你的实际部署替换占位符。

# 10. Kopia 数据丢失与复盘

> ⚠️ **本文涉及真实数据丢失事件。** Kopia 仓库 (57GB 备份) 在 2026 年 8 月因 ZFS 池损坏事件受损。
> 阅读时请注意:不是所有备份都救回了。

## 时间线

```cmd
2026-05-30  在 PVE 上首次部署 Kopia (CT102, kopiaserver)
2026-06-09  Kopia 最终方案跑稳:274GB 逻辑 / 30GB 物理 (89% 去重)
2026-06-09  → 2026-08-29  期间  ← 数据丢失发生在这段时间(?)
2026-08-30  发现 HHD_3TB 池 metadata 永久损坏,kopia 数据在坏池上
2026-08-30  紧急 rsync 抢救 Kopia 数据到 SSD_1TB/kopia_rescue
2026-09-01  部署 RustFS (CT110) 作为新的 S3 后端
2026-09-01  CT102 (kopiaserver) 退役
2026-09-01  新 Kopia 仓库建立在 RustFS S3 上
```

## Kopia 原本是什么

[Kopia](https://kopia.io/) 是一个开源的、加密的、增量备份工具,支持多种后端 (filesystem / S3 / SFTP / B2 等)。

主要特点:
- **全局去重**: 跨文件、跨设备、跨时间的 block-level dedup
- **端到端加密**: 数据上传前加密,服务端无法读
- **增量**: 只传变更的 block
- **多平台**: Windows / Linux / macOS 都支持

我当初用它是想做"统一备份服务器":
- 所有 PC (公司电脑 / 家里的电脑 / redmi-pad-se) 都把数据推到一个中心仓库
- 利用 dedup 节省空间 (跨设备 dedup)
- 加密保证数据安全

## Kopia 部署历史

### Phase 1: 初始部署 (2026-05-30)

```bash
# CT102 创建 (LXC, Debian 12)
# 装 kopia v0.23.0
kopia repository create filesystem --path=/KopiaRepo
Enter password: <your-password>

# 启动 server
kopia server start \
  --address=0.0.0.0:51515 \
  --insecure \
  --disable-csrf-token-checks \
  --repository-path=/KopiaRepo
```

服务跑在 51515 端口。

### Phase 2: 加 TLS + 用户认证 (2026-05-31)

```bash
# 加 TLS 证书
kopia server start \
  --tls-cert-file=/KopiaRepo/kopia-config/server-cert.pem \
  --tls-key-file=/KopiaRepo/kopia-config/server-key.pem

# 服务器用户
kopia server user add <kopiauser@host> --password=<your-password>
```

### Phase 3: 最终方案 (2026-06-09)

经过一系列参数调优(KOPIA_CONTENT_CACHE_SIZE_MB、KOPIA_METADATA_CACHE_SIZE_MB、--log-level=warning 等):

```ini
[Service]
ExecStart=/usr/bin/kopia server start \
  --address=0.0.0.0:51515 \
  --tls-cert-file=... \
  --tls-key-file=... \
  --server-username=<kopiauser@host> \
  --server-password=<your-password> \
  --disable-csrf-token-checks \
  --log-level=warning \
  --file-log-level=warning
```

**最终成果** (2026-06-09):
- 逻辑数据: **274.4 GB** (4 个备份源)
- 物理占用: **30 GB** (89% 去重率)
- 系统盘: 563M / 8G
- 服务: 稳定自启

Kopia 当时是我对备份的"银弹":单点加密、去重、自动调度、跨设备。

## 灾变: 2026-08-30 的发现

### 起因

我在 2026-08-30 做 PVE 硬件体检时,跑 `zpool status` 发现:

```cmd
pool: HHD_3TB
 state: ONLINE
config:
        NAME                         STATE
        HHD_3TB                      ONLINE
          ata-ST3000NM0053_Z1Y0PBQS  ONLINE

errors: 4 data errors
Permanent errors have been detected in:
        <metadata>:<0x0>
        <metadata>:<0x3d>
```

**永久错误 + 元数据损坏**。

### 风险评估

`HHD_3TB` 池上有什么?

```cmd
/HHD_3TB/backup/         # PBS datastore (498GB, 备份)
/HHD_3TB/subvol-102-disk-0/  # CT102 (Kopia) 数据 (57GB)
```

**两个关键数据都在这个单盘无冗余的坏池上**。

### Kopia 仓库的影响

Kopia 仓库 (`/KopiaRepo`) 在 `/HHD_3TB/subvol-102-disk-0/`(CT102 的 rootfs subvol)。

元数据损坏的位置是 `<metadata>:<0x0>` 和 `<metadata>:<0x3d>`:

- Kopia 仓库的核心是它的**索引文件** (`kopia.repository`),里面记录所有 block 的 manifest
- 如果这些索引所在的 block 在坏池的 metadata 损坏范围内,**kopia 可能完全无法验证或恢复数据**

### 紧急救援 (2026-08-30)

```bash
# 抢救 Kopia 仓库
mkdir -p /SSD_1TB/kopia_rescue
rsync -a /HHD_3TB/subvol-102-disk-0/ /SSD_1TB/kopia_rescue/
```

抢救结果 (推测):
- ✅ 大部分文件复制成功
- ⚠️ 部分块可能在 metadata 损坏区,**rsync 可能报错或跳过**
- ⚠️ 即使复制成功,kopia 仓库完整性也无法保证

## 数据丢失的实际范围

> **诚实声明**: 我没有逐个验证每个备份是否完整恢复。
> 以下是我**推断**的数据丢失范围:

| 备份源 | 原始大小 | 状态 |
|---|---|---|
| D 盘 工作学习 | ~16 GB | ⚠️ 部分丢失 (具体量未知) |
| D 盘 服务物资对账单 | ~40 GB | ⚠️ 部分丢失 |
| E 盘 工作学习 | ~16 GB | ⚠️ 部分丢失 |
| E 盘 服务物资对账单 | ~40 GB | ⚠️ 部分丢失 |

实际可恢复的备份量:**未知**。

Kopia 的 dedup 特性让"丢失多少数据"难以准确评估 — 一个丢失的 manifest 块可能让**几十个快照的部分数据全部失效**。

## 为什么这次事故严重

### 1. 单盘无冗余

`HHD_3TB` 池只有一块 Seagate ST3000NM0053 3TB HDD,**没有 mirror / RAID**。

任何 metadata 损坏都无法自动恢复。

### 2. 元数据损坏是最严重类型

ZFS 数据损坏有几种:
- **Data block**: 文件内容损坏 (还能 mount)
- **Metadata block**: 文件系统结构损坏 (mount 失败或静默错)
- **Metadata 永久损坏**: 无法自愈

我这次是 metadata 永久损坏。**整个池理论上仍能 mount,但元数据不可信**。

### 3. 没做异地备份

Kopia 仓库本身就是备份,但**只在一个本地磁盘**。

3-2-1 备份原则 (3 份副本、2 种介质、1 份异地) 我一条都没做到。

### 4. 监控盲区

我之前没装 `smartmontools`,也不知道池里 `errors` 在积累。

SMART 在 daily 跑是事件触发,我没主动设监控。

## 复盘: 一开始哪里可以做得不同

### ❶ 异地备份

应该一开始就把 Kopia 推到异地 (云 S3 / 朋友家 NAS / 加密 U 盘寄过去)。

代价: 几毛钱/月的 S3 存储费
收益: 这次事故完全避免

### ❷ ZFS mirror (RAID1)

应该一开始就用两块盘做 mirror。

代价: 多买一块 SSD (~¥150)
收益: 自动 failover,metadata 损坏自动修复

### ❸ 监控 + 告警

应该一开始就装 smartmontools + 定期 zpool status 自动检查 + email/push 告警。

### ❹ 验证恢复

应该定期 `kopia repository validate-provider` + 实际恢复一个文件验证。

Kopia 仓库完整性 ≠ 数据可恢复。我从来没真正"打开"过一个备份看看是不是能解出来。

### ❺ 备份分层

应该:
- Tier 1 (snapshot): ZFS snapshot 频繁做 (分钟级)
- Tier 2 (版本): Kopia 每天一次
- Tier 3 (异地): Kopia 推异地

不要把"备份"all-in-one。

## 修复路径: 从这次事故学到

### 短期 (2026-08-30 当晚)

```bash
# 1. 抢救 - 已经做了
rsync -a /HHD_3TB/subvol-102-disk-0/ /SSD_1TB/kopia_rescue/

# 2. 验证抢救的数据
kopia repository connect filesystem --path=/SSD_1TB/kopia_rescue/KopiaRepo
kopia snapshot list --all
kopia repository validate-provider
```

### 中期 (2026-09-01 部署 RustFS)

意识到 local FS 后端的脆弱性,**改用 S3 后端**:

```bash
# RustFS 提供 S3-compatible 端点
kopia repository create s3 \
  --bucket=kopia-backup \
  --endpoint=http://192.168.31.128:9000 \
  --access-key=admin \
  --secret-access-key=... \
  --disable-tls
```

S3 后端好处:
- object storage 通常有内部 checksum + 多副本
- 即使本地磁盘坏,数据在 S3 内是冗余的
- 跨进程锁更可靠(避免本地 FS race)

### 长期 (规划中)

- [ ] 异地 S3 (Backblaze B2 / 阿里云 OSS, ~¥10/月 500GB)
- [ ] Kopia snapshot 定期 validate
- [ ] 每月实际恢复一个文件验证
- [ ] ZFS mirror 重构 (参见 [12-硬盘损坏全程记录](/posts/pve-journey-12-hdd-failure/))
- [ ] 自动监控 zpool status + email 告警

## 教训

### 教训 1: 备份不上异地等于没备份 ⭐

"本地备份"不是"真备份"。

单盘挂了 / 误操作 / 火灾 / 失窃 = 本地副本全没。

**原则**: 任何"重要数据"必须有异地副本。

### 教训 2: ZFS 不会自我救 metadata

ZFS scrub 能修**数据** checksum 错,但 metadata 损坏**不会自动修复**(如果单盘无冗余)。

scrub 完了告诉我: "repaired 0B with 0 errors"。但前面 `errors: 4 data errors` 是历史遗留。

**原则**: scrub 之前先看 `zpool status` 的 `errors:` 行,有问题立即查。

### 教训 3: Kopia dedup 是双刃剑

dedup 让 274GB 逻辑数据只占 30GB 物理,**省空间**。

但一个关键 block 损坏 = 引用它的所有快照都失效,**放大损失**。

**原则**: dedup 后端必须配异地 + 多副本,不能本地单盘。

### 教训 4: 不验证就不是备份

Kopia 跑了一年,服务正常,客户端能 push 数据,**但我从没验证过能真正恢复**。

**原则**: 每月跑一次 `kopia restore` 到临时目录,确认文件能解开。

### 教训 5: 备份系统的"3-2-1"原则

3 份数据、2 种介质、1 份异地。

我之前 3-2-1 **一个都没做到**(只有 1 份本地)。

**原则**: 评估备份方案时,先列 3-2-1 是否满足,再谈别的。

## 关键命令清单

```bash
# 看 Kopia 状态
kopia repository status
kopia snapshot list --all

# 验证完整性
kopia repository validate-provider
kopia maintenance run --full

# 紧急救援 (rsync 整个仓库)
rsync -a /source/kopia-repo/ /backup/kopia-repo/

# 接到新位置
kopia repository connect filesystem --path=/backup/kopia-repo

# 列出某快照
kopia snapshot show <snapshot-id>

# 恢复某文件
kopia restore <snapshot-id> /path/to/file --destination=/tmp/restore
```

## 数据现状 (2026-09-02)

```cmd
新 Kopia 仓库:
  - 后端: RustFS S3 (CT110, 192.168.31.128:9000)
  - bucket: kopia-backup
  - 凭证: 在 RustFS env file
  - 客户端: 各机器重新配置 (未完成)

旧 Kopia 仓库:
  - /SSD_1TB/kopia_rescue/KopiaRepo (抢救出来的)
  - 状态: 部分恢复,完整性未知
  - 决策: 不继续使用,避免污染

CT102 (kopiaserver):
  - 状态: 已销毁
  - 释放: SSD_1TB 上 subvol-102 (~1.5GB)
```

## 心理感受 (诚实记一笔)

这次事故让我意识到:**我以为我做了备份,但实际上没有。**

Kopia 跑了一年,GUI 看着一切正常,数据"已上传"的安心感很足。但后台的 ZFS 池已经悄悄坏了几个月,我**毫不知情**。

不是 Kopia 的问题,是我**没验证过能不能恢复**。

这件事是个教训,也是一个礼物 — 让我重新认真对待备份这件事。

## 下一篇

[11. RustFS 部署与 Kopia 切换 →](/posts/pve-journey-11-rustfs-kopia/)
