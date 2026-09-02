---
title: "05. Syncthing 配置调试"
date: 2026-09-02T10:18:00+08:00
slug: pve-journey-05-syncthing-debug
description: "GUI bind 修复、path attribute 教训、XML 直接编辑的可靠性。"
draft: false
tags:
  - PVE
  - Syncthing
  - 调试
  - REST API
  - XML
categories:
  - PVE
series:
  - PVE 折腾记 (2026-08-31 ~ 2026-09-09)
ShowToc: true
TocOpen: false
---


# 05. Syncthing 配置调试

## 背景

CT111 装好 Syncthing 后,有几个问题要修:

1. **GUI 无法外部访问**: 默认 127.0.0.1:8384
2. **工作学习 folder path 错**: 装在 4GB rootfs,应该在 /data (2.1TB)
3. **REST API 调用 "200 但没改"**: PUT 改 folder path 没生效

## 1. 修 GUI bind

### 问题

```bash
# 从 PVE host 测
curl -I http://192.168.31.109:8384
# Connection refused
```

### 排查

```bash
# CT111 里
ss -tlnp | grep 8384
# tcp  LISTEN  127.0.0.1:8384  ...
```

只 listen 在 loopback,外网访问不到。

### 修

编辑 `/var/lib/syncthing/.config/syncthing/config.xml`:

```xml
<gui>
    <address>0.0.0.0:8384</address>   <!-- 改这里 -->
    ...
</gui>
```

### 重启服务

```bash
systemctl restart syncthing@syncthing
```

### 验证

```bash
curl -I http://192.168.31.109:8384
# HTTP/1.1 200 OK ✓
```

## 2. Folder path 错位

### 问题

CT111 跑了几个小时,发现 `工作学习` 文件夹路径错了:

```cmd
/var/lib/syncthing/工作学习  (在 4GB rootfs)
```

应该在:

```cmd
/data/工作学习 (HHD_3TB bind mount, 2.1TB)
```

### 为什么错?

我手动建文件夹时,Syncthing 默认用 `~/<folder-name>` 路径,rootfs 上 4GB 空间。

### 修复方案

不能 GUI 里改 path(Syncthing GUI 不让改 path,只能 delete + recreate)。

两种方法:
1. **GUI**: 删除 folder,加回来,选新 path
2. **XML**: 直接改 config.xml

我先用 REST API 试,**没生效**(见下文),最后用 XML。

### 坑: REST API 看似成功但没改

```bash
# GET 当前 config
curl -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/config/folders | jq

# PUT 修改 path
curl -X PUT -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nsylc-yh8lq",
    "label": "工作学习",
    "path": "/data/工作学习",
    ...
  }' \
  http://127.0.0.1:8384/rest/config/folders/nsylc-yh8lq

# 返回 200 ✓
# 但是 XML 里 path 没变 ✗
```

**原因**: REST API PUT 改文件夹配置需要完整 folder object,缺字段就被静默丢弃。

### 修复: 直接 sed config.xml

```python
import re
xml = open("/var/lib/syncthing/.config/syncthing/config.xml").read()

old = '<folder id="nsylc-yh8lq" label="工作学习" path="/var/lib/syncthing/工作学习"'
new = '<folder id="nsylc-yh8lq" label="工作学习" path="/data/工作学习"'

xml2 = xml.replace(old, new)
assert old not in xml2 and new in xml2

open("/var/lib/syncthing/.config/syncthing/config.xml","w").write(xml2)
```

```bash
systemctl restart syncthing@syncthing
```

### 验证

```bash
ls -la /data/
# 工作学习/    → 路径正确
# 共享文件夹/  → 路径正确
# 同步文件夹/  → 路径正确
```

全部 3 个文件夹都搬到 /data 了。

## 3. folder marker missing

修完 path,Syncthing 报 "folder marker missing":

```cmd
folder nsylc-yh8lq error: folder marker missing
```

`.stfolder/` 是 Syncthing 在每个文件夹根目录的标记,表示"这是 Syncthing folder"。

### 修

```bash
mkdir /data/工作学习/.stfolder
```

但这是 root 创建的,会引发 [下一个故事](/posts/pve-journey-06-permission-denied/)...

## 4. Syncthing XML 结构 (血的教训)

`<folder>` 元素的结构:

```xml
<folder id="nsylc-yh8lq" label="工作学习" path="/data/工作学习" type="sendreceive" ...>
    <filesystemType>basic</filesystemType>
    <device id="DEVICE1" introducedBy=""/>
    <device id="DEVICE2" introducedBy=""/>
    <device id="DEVICE3" introducedBy=""/>
    <minDiskFree unit="%">5</minDiskFree>
    ...
    <versioning>
        <cleanupIntervalS>3600</cleanupIntervalS>
        ...
    </versioning>
</folder>
```

**易错点**:
- `path` 是 **attribute**,不是 child element
- `device id=` 是 **child element**,在 `<folder>` 里嵌套
- `label` 也是 attribute

我最初用 regex 找 `<folder>...</folder>` 块,**没匹配到 device**(因为 regex 太严格)。

### 正确解析

用 `xml.etree.ElementTree`:

```python
import xml.etree.ElementTree as ET
tree = ET.parse("/var/lib/syncthing/.config/syncthing/config.xml")
root = tree.getroot()

for f in root.findall("folder"):
    label = f.get("label", "?")
    fid = f.get("id", "?")
    path = f.get("path", "?")
    devs = [d.get("id") for d in f.findall("device")]
    print(f"{label} ({fid}): {path}")
    print(f"  shared with: {devs}")
```

## 5. 排查工具箱

### 看连接状态

```bash
curl -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/system/connections | jq
```

每个 device:
- `connected`: bool
- `inBytesTotal` / `outBytesTotal`
- `address`: 当前连接 IP

### 看文件夹状态

```bash
curl -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/db/status?folder=$FOLDER_ID | jq
```

- `globalBytes`: 所有设备累加
- `localBytes`: 本机
- `needBytes`: 还需下载
- `pullErrors`: 拉取错误数
- `state`: idle/syncing/scanning

### 看事件 (最有价值!)

```bash
curl -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/events?limit=100 | jq
```

事件类型:
- `FolderSummary`: 每个文件夹状态更新
- `ItemFinished`: 单个文件 sync 完成(含 error)
- `FolderErrors`: 文件夹级错误
- `DeviceConnected` / `DeviceDisconnected`

### 触发 rescan

```bash
curl -X POST -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/db/scan?folder=$FOLDER_ID
```

## 6. 配置文件路径

```cmd
/var/lib/syncthing/.config/syncthing/
├── config.xml          ← 主配置
├── cert.pem            ← HTTPS 证书 (自己签的)
├── key.pem             ← HTTPS key
├── csrftokens.txt      ← CSRF tokens
├── index-v2/           ← 文件索引 (BoltDB)
└── ...
```

**重要**: 修改 config.xml 后**必须重启 syncthing 服务**,否则不生效。

## 7. API Key

API key 在 config.xml 里:

```xml
<gui>
    <apiKey>XXXXXXXXXXXXX</apiKey>
    ...
</gui>
```

任何 REST API 调用都要:

```bash
curl -H "X-API-Key: $KEY" http://127.0.0.1:8384/rest/...
```

## 教训

### 教训 1: Syncthing 改配置直接改 XML,别用 REST API

REST API 看似返回 200,但字段缺失 / 类型错 / path attribute 不让改时,**PUT 静默失败**。

**原则**: 改 path、device list 这种结构,用 sed/Python 改 config.xml,重启服务。

### 教训 2: GUI 不让改 path,只能 delete + recreate

Syncthing GUI 设计上**path 不可改**(防止误改导致数据丢失)。

如果 path 错了,GUI 流程是:
1. Delete folder (注意: 不要勾 "delete remote files")
2. Add folder,选新 path
3. 接受其他设备的 introduction

XML 流程(更快,但要 restart):
1. sed 改 path attribute
2. `systemctl restart syncthing@syncthing`

### 教训 3: process UID 要对应目录 owner

我手动 `mkdir /data/工作学习/.stfolder` 是 root,导致整个目录树 owner 是 root,Syncthing (uid 100xxx) 写不进子目录。

详见 [06-16379个permission-denied排查](/posts/pve-journey-06-permission-denied/)。

### 教训 4: GUI 改完别忘了 restart service

某些修改(比如 device list)在 GUI 上改了后,Syncthing 自己会 reload。但 path 这种涉及 filesystem 的,**必须 restart**。

## 故障排查清单

| 现象 | 看哪里 | 怎么修 |
|---|---|---|
| GUI 访问不到 | `ss -tlnp` 看 listen | 改 `<address>0.0.0.0:8384</address>` |
| 某文件夹 sync 不动 | `/rest/db/status?folder=$ID` | 看 state / needBytes |
| 16379 permission denied | `/rest/events?limit=1000` | chown -R syncthing:syncthing |
| 22000 不通 | `ss -tlnp \| grep 22000` | 改 `<listenAddress>default</listenAddress>` |
| folder marker missing | ls -la folder root | `mkdir .stfolder` + chown |

## 下一篇

[06. 16379 个 permission denied 排查 →](/posts/pve-journey-06-permission-denied/)
