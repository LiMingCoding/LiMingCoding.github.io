---
title: "02. 硬件体检：SMART 与温度"
date: 2026-09-02T10:10:00+08:00
slug: pve-journey-02-hardware
description: "lm-sensors 装好 + 4 盘 SMART 体检 + 发现 sdc 退化盘。"
draft: false
tags:
  - PVE
  - 硬件
  - SMART
  - 温度
  - 故障
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


# 02. 硬件体检:SMART 与温度

## 目标

给家里 PVE 做一次彻底硬件体检:

1. **温度**:CPU、APU、SSD、HDD 都在合理范围?
2. **SMART**:4 块盘健康度?
3. **寿命预估**:SSD 还剩多少寿命?

## 1. 温度监控:lm-sensors 装好

### 安装

```bash
apt install lm-sensors
sensors-detect    # 一路回车 (选 yes 自动)
modprobe k10temp  # AMD CPU 温度
modprobe amdgpu   # APU 温度
sensors           # 第一次看
```

### 第一次结果

```cmd
k10temp-pci-00c3
Adapter: PCI adapter
Tctl:        +42.6°C   # CPU 温度
Tdie:        +42.6°C   # die 温度

amdgpu-pci-0600
Adapter: PCI adapter
vddgfx:      N/A       # 待机没数(正常)
vddnb:       N/A
edge:        +42.0°C   # APU 边缘温度
```

**结论**: 一切正常。42°C 远低于警戒线(70°C)。

## 2. SMART 体检:4 块盘

### 设备清单

```bash
lsblk -d -o NAME,SIZE,MODEL,SERIAL
# sda  119G  KINGSTON SA400S37120G   (系统A)
# sdb  119G  KINGSTON RBUSC180DS37256GY (系统B)
# sdc  931G  Great Wall GW600 1TB     (退化的 SSD)
# sdd  2.7T  ST3000NM0053-1ZE10Z      (HDD 备份)
```

### 装 smartmontools

```bash
apt install smartmontools
```

### sda (Kingston 120GB) - 系统 A

```bash
smartctl -A /dev/sda
```

- Reallocated_Sector_Ct: **0** ✓
- Wear_Leveling_Count: **85%** (剩 85% 寿命) ✓
- 不支持 self-test (Kingston 低端 SSD)
- 温度:34°C
- **结论:健康**

### sdb (Kingston 128GB) - 系统 B

- Wear_Leveling_Count: **90%** (剩 90%) ✓
- 同样不支持 self-test
- **结论:健康**

### sdc (Great Wall GW600 1TB) - ⚠️ **退化盘**

```bash
smartctl -A /dev/sdc
```

- `Current_Pending_Sector`: 0
- `Reallocated_Sector_Ct`: 0
- **`ATA Error Count: 121`** ⚠️
- **`Offline_Uncorrectable: 1`** ⚠️

```bash
smartctl -t long /dev/sdc
# 跑 long self-test (~30 min)
smartctl -l selftest /dev/sdc
# 90% stuck, 不完成
```

**结论:已退化**。这块 SSD 不是关键盘,装着不重要的数据。**决策:不立刻换,先监控,周末有空替换。**

### sdd (Seagate 3TB HDD) - 备份

- Reallocated_Sector_Ct: 0 ✓
- Temperature_Celsius: 35°C
- self-test 通过 ✓
- **结论:健康**

### 总结表

| 盘 | 型号 | 用途 | 健康度 | 处理 |
|---|---|---|---|---|
| sda | Kingston 120G | 系统A | ✅ 健康 85% 寿命 | 继续用 |
| sdb | Kingston 128G | 系统B | ✅ 健康 90% 寿命 | 继续用 |
| sdc | GW600 1TB | 数据(临时) | ⚠️ **DEGRADED 121 ATA errors** | 监控,周末替换 |
| sdd | ST3000NM0053 3TB | PBS 备份 | ✅ 健康 | 继续用 |

## 3. 温度趋势

```bash
# 跑了一个 sensors loop 看波动
watch -n 5 sensors
```

| 设备 | 闲时 | 满载 | 警戒 |
|---|---|---|---|
| CPU (k10temp Tctl) | 42°C | 65°C | 80°C |
| APU (amdgpu edge) | 42°C | 60°C | 80°C |
| sdc SSD | 47°C | 55°C | 70°C |
| sdd HDD | 35°C | 45°C | 55°C |

**结论**: 温度全部正常,无需额外散热。

## 关键发现

### sdc 退化的事实

1. 121 个 ATA error 不是一次性突发,是长期累积
2. self-test 跑到 90% 卡住(典型坏块导致读不到)
3. 不支持 SMART Replace Sector(便宜 SSD 的通病)
4. 这块盘未来几个月内可能彻底坏

### 应对方案

- [ ] **本周内**:备份 sdc 上的重要数据(虽然不重要)
- [ ] **周末**:换 1TB SSD(可能买便宜点的)
- [ ] **持续**:每周看一次 `smartctl -A /dev/sdc`

## 教训

### 教训 1: 便宜 SSD 不要用来存重要数据

Kingston SA400 / GW600 这些便宜消费级 SSD:
- 没 DRAM cache
- 不支持高级 SMART
- 寿命短(几百 TBW)

**原则**: NAS / 备份盘用企业级(如 Samsung PM893 / Intel DC S3710),系统盘可以便宜。

### 教训 2: SMART 自检不是万能

`sdc self-test 卡在 90%` 证明:当磁盘已经退化严重,SMART 自检会挂掉或失败,不能完全依赖。

**做法**: 监控 `ATA Error Count` + `Current_Pending_Sector`,这些才是早期信号。

### 教训 3: PVE 默认没装 smartmontools / lm-sensors

PVE 安装默认不带硬件监控,需要自己装。

**配置**: 把 `apt install smartmontools lm-sensors` 加到 PVE 装机脚本(如果有)。

## 实操命令清单

```bash
# 安装
apt install smartmontools lm-sensors

# 加载 AMD 温度模块
modprobe k10temp amdgpu

# 一次性看全部 SMART
for d in sda sdb sdc sdd; do
  echo "=== /dev/$d ==="
  smartctl -H -A /dev/$d | head -20
done

# 单盘详细
smartctl -x /dev/sdc | less

# 跑 long self-test (后台)
smartctl -t long /dev/sdc

# 看 self-test 结果
smartctl -l selftest /dev/sdc

# 温度轮询
watch -n 5 sensors
```

## 下一篇

[03. PBS 数据备份迁移 →](/posts/pve-journey-03-pbs-migration/)
