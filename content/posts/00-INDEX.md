---
title: "PVE 折腾记 (2026-08-31 ~ 2026-09-09)"
date: 2026-09-02T10:01:00+08:00
slug: pve-journey
description: "系列索引：过去 5 天对家庭 PVE 基础设施做的一次全面盘点、迁移与故障排查。"
draft: false
tags:
  - PVE
  - 折腾记
  - 索引
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


# PVE 折腾记 (2026-08-31 ~ 2026-09-09)

> 这是一系列文章,记录过去几天对家庭 PVE (Proxmox VE) 基础设施的全面盘点、迁移和故障排查。
> 时间跨度:2026-05-30 启动 Kopia → 2026-08-30 HHD_3TB metadata 损坏 → 2026-09-01 完成主体工作 → 2026-09-09 观察期满

## 背景

家里一台 PVE 主机跑了很多服务,2-3 天集中时间做了一次彻底盘点:

- **硬件**: AMD CPU + APU,4 块盘(2 SSD + 1 退化的 SSD + 1 HDD)
- **服务**: VM (Windows/Linux/飞牛 NAS),CT (opencode/rustfs/syncthing),PBS 备份
- **目标**: 体检 + 备份迁移 + 替换飞牛 NAS 角色 + 准备长期稳定运行

## 系列目录

### 01. [概述与时间线](/posts/pve-journey-01-overview/)

整体故事脉络、架构决策、最终成果。

### 02. [硬件体检:SMART 与温度](/posts/pve-journey-02-hardware/)

lm-sensors 装好 + 4 盘 SMART 体检 + **发现 sdc 退化盘**。

### 03. [PBS 数据备份迁移](/posts/pve-journey-03-pbs-migration/)

HHD_3TB/backup → backup-mirror 迁移全过程。

### 04. [CT111 Syncthing LXC 部署](/posts/pve-journey-04-ct111-syncthing/)

新建 CT111 + Tailscale 安装 + 替代 VM105 的设计。

### 05. [Syncthing 配置调试](/posts/pve-journey-05-syncthing-debug/)

GUI bind 修复、path attribute 教训、XML 直接编辑的可靠性。

### 06. [16379 个 permission denied 排查](/posts/pve-journey-06-permission-denied/)

最大的故障排查故事:**5 步走错路,1 行 chown 解决**。

### 07. [VM105 迁移与 7 天观察期](/posts/pve-journey-07-vm105-migration/)

飞牛 NAS (VM105) 的退役方案与 7 天观察期制度。

### 08. [调试方法论](/posts/pve-journey-08-debug-methodology/)

这几天沉淀下来的方法论:**先查协议层,再碰磁盘**。

### 09. [经验教训汇总](/posts/pve-journey-09-lessons/)

所有踩坑、原则、工具沉淀的一句话清单。

### 10. [Kopia 数据丢失与复盘](/posts/pve-journey-10-kopia-data-loss/) ⚠️

真实数据丢失事件复盘:HHD_3TB metadata 损坏 → Kopia 仓库受损 → 抢救不完整。

### 11. [RustFS 部署与 Kopia 切换](/posts/pve-journey-11-rustfs-kopia/)

自建 S3 后端(RustFS),Kopia 切到对象存储。

### 12. [硬盘损坏全程记录](/posts/pve-journey-12-hdd-failure/) ⚠️

3 块数据盘不同程度的损坏、SMART 数据、断电记录、未来重构方案。

## 关键数字

| 指标 | 数值 |
|---|---|
| 总耗时 | 5 天 (从 Kopia 部署算起) |
| 完成 todo | 13/13 |
| 同步数据 | 16GB (工作学习) + 40GB (服务物资对账单) + 1GB (共享文件夹) |
| 部署故障数 | 2 (sdc DEGRADED + HHD_3TB 历史 metadata 损坏) |
| Bug 数 | 3 (Syncthing path attribute + 权限 owner + Kopia 数据丢失) |
| 硬件事故 | 1 次 (Kopia 57G 数据受损) |
| Memory 沉淀 | 8 条关键事实 |
| 释放资源 | VM105 + CT102 退役后释放 ~1.5TB |

## 下一篇

[从这里开始阅读 →](/posts/pve-journey-01-overview/)
