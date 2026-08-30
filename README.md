# LiMing编程笔记

> 个人技术博客 — Hugo + PaperMod，托管于 GitHub Pages。

## 在线地址

<https://limingcoding.github.io>

## 技术栈

| 项目 | 版本 / 说明 |
|---|---|
| Hugo | extended `0.165.0` |
| 主题 | PaperMod（git submodule 引入） |
| 部署 | GitHub Actions → GitHub Pages |
| 搜索 | Fuse.js + 自定义摘要片段 |

## 本地预览

### 安装 Hugo

需要 **Hugo extended `0.165.0` 或更新**。PaperMod 主题在 `0.146.0+` 才有适配，低于这个版本 build 会失败并报 `partial "head.html" not found`。

最稳的方式：直接下载官方 binary 到 `~/.local/bin/`（不用 sudo、不会污染系统包管理器）：

```bash
# Linux x86_64
HUGO_VERSION=0.165.0
mkdir -p ~/.local/bin
curl -L "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz" \
  | tar xz -C ~/.local/bin hugo
~/.local/bin/hugo version
# 确认 ~/.local/bin 在 $PATH 里（多数 Linux 默认就有）
```

包管理器（**注意系统源可能过旧**）：

```bash
# macOS:    brew install hugo                  # 通常够新
# Debian:   apt 源里的 hugo 经常停在 0.131，build 会失败
#           建议走上面 binary 路线，或加官方源:
#           https://dl.hugo.dev/
```

### 启动预览

```bash
git clone --recurse-submodules https://github.com/LiMingCoding/LiMingCoding.github.io.git
cd LiMingCoding.github.io
hugo server -D
```

打开 <http://localhost:1313> 实时预览（保存即刷新）。

> **已经 clone 过但页面 404？** 说明主题 submodule 没拉取，执行：
> ```bash
> git submodule update --init --recursive
> ```
>
> **build 报 `partial "head.html" not found`？** 说明你本地的 hugo 太旧（`< 0.146`），按上面「安装 Hugo」装一个新版再试。

## 写一篇新文章

```bash
hugo new posts/my-new-post.md
```

`content/posts/my-new-post.md` 编辑完成，把 `draft: true` 改成 `false`（或直接删掉这一行）。

或者直接 `cp content/posts/hello-world.md content/posts/your-title.md` 当模板改写。

## 目录说明

| 路径 | 作用 |
|---|---|
| `hugo.yaml` | 站点配置（标题、菜单、主题参数） |
| `content/posts/*.md` | 博客文章 |
| `content/about.md` | 关于页 |
| `content/archives.md` | 归档页 |
| `content/search.md` | 站内搜索页 |
| `assets/js/fastsearch.js` | 搜索脚本（Fuse.js + 摘要片段） |
| `assets/css/extended/` | 自定义扩展样式 |
| `static/img/` | 静态图片（头像、头图等） |
| `themes/PaperMod/` | 主题（submodule，主题升级时拉取） |
| `.github/workflows/hugo.yml` | 推送到 main 自动构建并部署到 GitHub Pages |

## 部署

- 默认分支是 `main`
- 推送后 GitHub Actions 自动跑 `hugo --minify`，把 `public/` 上传到 GitHub Pages
- 在仓库 **Settings → Pages** 把 Source 设为 "GitHub Actions"

## 主题（PaperMod）

- 仓库：<https://github.com/adityatelange/hugo-PaperMod>
- 当前版本钉在 submodule 上
- 升级主题：`git -C themes/PaperMod fetch && git -C themes/PaperMod checkout <new-tag>`，注意 Hugo 版本要求

## 评论配置

默认 `comments: false`。要加 giscus，参考 PaperMod 文档：[Comments using giscus](https://github.com/adityatelange/hugo-PaperMod/wiki/Features#comments-using-giscus)。