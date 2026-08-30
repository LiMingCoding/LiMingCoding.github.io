---
title: "VS Code Remote-SSH 终端无法输入中文的踩坑记录"
date: 2026-08-30T05:34:42Z
draft: false
description: "记录在 Win11 下用 VS Code Remote-SSH 连接远程服务器时，集成终端无法输入中文的问题，以及几个实测可用的替代方案。"
tags:
  - VS Code
  - Remote-SSH
  - 踩坑
categories:
  - 工具
ShowToc: true
---

## 问题

用 Win11 的 VS Code 通过 Remote-SSH 连远程服务器，集成终端里切到中文输入法，打字没反应——候选窗不出来，或者敲完回车只出来几个字母。编辑器区域输入中文倒是正常的，就终端不行。

## 原因

这不是配置问题，是 **VS Code Remote 架构的限制**。

远程终端的输入由服务器端的 pty 进程处理，而 Windows 本地的 IME（输入法）组合事件没法正确传递到远程 pty。简单说：本地输入法在"组合"中文字的时候，远程终端那边根本收不到这些中间事件。

所以不管怎么改设置，大概率都治不了根。

## 我试过但没用的设置

网上常见的建议，我都试了，**没解决**：

- 关闭 GPU 加速：`"terminal.integrated.gpuAcceleration": "off"`
- 开启实验性 IME：`"terminal.integrated.experimentalIme": true`
- 调整 scrollback 大小
- 重启 VS Code、重装 Remote-SSH 插件

如果你的情况不一样，这些设置可以试试，但别抱太大期望。

## 实测可用的方案

### 方案一：用 Windows Terminal 直接连 SSH

Win11 自带 Windows Terminal，中文输入完全正常，没有任何 IME 问题。

```bash
ssh user@服务器IP
```

需要终端输入中文的场景（比如 `mkdir 中文目录`），直接在 Windows Terminal 里操作就行。

**这是我目前最推荐的方式。**

### 方案二：命令面板发送文本

偶尔需要在 VS Code 终端里输中文，又不想切窗口：

1. `Ctrl+Shift+P` 打开命令面板
2. 输入 `send`，选择 **Terminal: Send Text to Active Terminal**
3. 在弹出的输入框里打中文（这里的 IME 是正常的）
4. 回车，文本会发送到当前终端

缺点是每次都要走命令面板，频繁使用比较麻烦。

### 方案三：编辑器写好再粘贴

1. 在编辑器区域输入中文内容
2. 复制
3. 终端里 `Ctrl+V` 粘贴

适合一次性粘贴长文本，不适合频繁交互。

### 方案四：Hugo 博客的日常操作绕开终端中文

写博客的时候，其实**根本不需要在终端里输入中文**：

```bash
# 文件名用英文 slug
hugo new posts/my-post.md
```

然后打开文件，在编辑器里写中文标题：

```yaml
---
title: "我的中文标题"
---
```

编辑器的中文输入是正常的，只有终端不行。所以文件名保持英文，中文内容全在编辑器里写，完全绕开这个问题。