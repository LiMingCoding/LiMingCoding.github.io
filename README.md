# 黎明编程笔记

> 个人技术博客 — Hugo + PaperMod，托管于 GitHub Pages。

## 在线地址

<https://limingcoding.github.io>

## 本地预览

```bash
# 安装 Hugo extended ≥ 0.112.4（推荐 0.131.x）
# macOS:  brew install hugo
# Debian: sudo apt install hugo
# 其他:   https://github.com/gohugoio/hugo/releases

git clone --recurse-submodules https://github.com/LiMingCoding/LiMingCoding.github.io.git
cd LiMingCoding.github.io
hugo server -D
```

打开 <http://localhost:1313> 实时预览（保存即刷新）。

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
| `static/img/` | 静态图片（头像、头图等） |
| `themes/PaperMod/` | 主题（submodule，主题升级时拉取） |
| `.github/workflows/hugo.yml` | 推送到 main 自动构建并部署到 GitHub Pages |

## 部署

- 默认分支是 `main`
- 推送后 GH Actions 自动跑 `hugo --minify`，把 `public/` 上传到 GitHub Pages
- 在仓库 **Settings → Pages** 把 Source 设为 "GitHub Actions"

## 主题（PaperMod）

- 仓库：<https://github.com/adityatelange/hugo-PaperMod>
- 当前版本：`v8.0`（钉在 submodule 上）
- 升级主题：`git -C themes/PaperMod fetch && git -C themes/PaperMod checkout <new-tag>`，注意 Hugo 版本要求

## 关闭评论

默认 `comments: false`。要加 giscus，参考 PaperMod 文档：[Comments using giscus](https://github.com/adityatelange/hugo-PaperMod/wiki/Features#comments-using-giscus)。
