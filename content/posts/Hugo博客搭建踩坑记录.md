---
title: "Hugo + PaperMod 博客搭建：从 0 到评论上线，我踩过的坑"
date: 2026-08-30T17:17:00+08:00
draft: false
slug: hugo-blog-build-pitfalls
description: "记录搭这个 Hugo 博客时遇到的几个真实问题：并行 agent 的 race condition、giscus 一直报 Unable to create discussion、repoId 格式不对……以及最后怎么修通的。"
tags:
  - Hugo
  - PaperMod
  - Giscus
  - 踩坑
categories:
  - 随笔
series:
  - 博客搭建
ShowToc: true
TocOpen: true
---

## 起因

上一篇文章里说过我想开个博客记录学习——这篇讲博客本身是怎么搭起来的，以及搭建过程中真实踩过的几个坑。

技术栈选得很朴素：**Hugo**（静态站点生成器）+ **PaperMod**（主题）+ **GitHub Pages**（托管）+ **Giscus**（评论，底层是 GitHub Discussions）。

理论上这套 30 分钟能搞定的事，实际花了整整一个下午加一个晚上——其中大半时间耗在一个看似配置都对、但 Giscus 死活报 `Unable to create discussion` 的问题上。

下面按踩坑顺序记录。

## 1. 一波加 16 个 feature，让 agent 并行做

第一篇文章发出去之后，我列了一堆功能需求：

- 系列文章（taxonomy + 首页云 + 前后篇导航）
- 搜索框点击 bug
- 首页 taxonomy 云（分类 + 标签）
- 自定义 shortcode（alert / card / video）
- 代码语法高亮（chroma CSS）
- 代码块复制按钮
- Giscus 评论
- Mermaid 流程图 + KaTeX 数学公式
- 分享按钮（微博 + 复制链接）
- 多语言支持（加英文）
- 彩虹标签
- 图标科技感
- ……

一共 16 项。我派了 **11 个 agent 同时干**，每只 agent 拿到独立的文件范围，互不重叠，跑完自己 commit + push。

### 第一个坑：race condition

并行执行最大的问题是**两个 agent 的 commit 会混**。

比如 agent A 和 B 都在改 `hugo.yaml`。A 先 commit 完，B 接着在自己的分支上 cherry-pick——结果 B 的 commit message 说"我改了 X、Y、Z"，但实际 diff 里包含了 A 的工作目录里**还没 commit** 的那部分文件。

最后 git history 里有两个 commit 的 message 跟实际 diff 对不上。

{{< alert type="warning" >}}
**经验**：让并行 agent 共享工作目录时，要么每只 agent 在独立的 git worktree 里干活，要么强制要求"改文件 → `git add` → `git commit`"必须在同一个原子操作里完成，不要留中间态。
{{< /alert >}}

最后用 `git reset --hard` + cherry-pick 6 个 commit 全部重写了一遍，commit message 加 NOTE 说明实际改了什么。force-push 后历史干净了。

## 2. Giscus "Unable to create discussion" — 调了 30 分钟

评论系统选 Giscus，因为：

- 不用自己跑后端
- 评论存在 GitHub Discussions 里，**永久不丢**
- 评论就是 Issue，搜索引擎能索引
- 开源、免费

按 Giscus 官网的步骤：装 giscus-app → 开 Discussions → 复制配置——理论上 3 分钟搞定。

但实际部署后，评论框下面一直显示：

```
Unable to create discussion
```

打开 Edge 的 DevTools Console，看到一堆红：

```
POST https://giscus.app/api/discussions 400 (Bad Request)
onDiscussionCreateRequest @ widget-...js:1
```

### 排查一：分类权限

第一反应：是不是分类权限不对？GitHub 默认的 **Announcements** 分类是 maintainer-only，普通用户没权限发。

把分类从 `announcements` 改成 `general`（对所有 GitHub 登录用户开放），push，部署，刷新——**还是 400**。

### 排查二：浏览器设置

第二反应：是不是 Edge 的 Tracking Prevention 在拦截第三方 cookie？

改成「基本」级别，重启浏览器——**还是 400**。

### 排查三：Giscus 后端 session

第三反应：是不是 giscus.app 没拿到我的 session？

直接用 curl 打 giscus 后端 API：

```bash
curl -X POST https://giscus.app/api/discussions \
  -H "Content-Type: application/json" \
  -d '{}'
```

返回：

```json
{ "error": "Invalid or missing access token." }
```

但用户在浏览器里**已经点了 Sign in**，session 应该有。问题不在 session。

### 排查四：读源码

去 GitHub 把 giscus 的源码拉下来读了一遍，找到了关键代码：

`pages/api/discussions/index.ts` 的 POST handler：

```typescript
async function post(req, res) {
  // 1. 验证用户 token — 通过 ✅
  const userToken = req.headers.authorization?.split('Bearer ')[1];
  if (!(await check(userToken))) {
    res.status(403).json({ error: 'Invalid or missing access token.' });
    return;
  }

  // 2. 拿 giscus-app 在本仓库的安装 token — 通过 ✅
  let token: string;
  try {
    token = await getAppAccessToken(repo);
  } catch (error) {
    res.status(403).json({ error: error.message });
    return;
  }

  // 3. 调 GitHub GraphQL createDiscussion mutation
  const response = await createDiscussion(token, params);
  const id = response?.data?.createDiscussion?.discussion?.id;

  if (!id) {
    res.status(400).json({ error: 'Unable to create discussion with request body.' });
    return;
  }

  res.status(200).json({ id });
}
```

**关键发现**：返回 400 是因为**第 3 步**——`createDiscussion` 返回的 JSON 里 `discussion.id` 为空。

也就是说 **GitHub GraphQL 拒绝了 mutation 请求**。

### 排查五：repoId 格式

直接用 GraphQL API 查我们仓库的 node ID：

```bash
gh api graphql -F query='
query {
  repository(owner:"LiMingCoding", name:"LiMingCoding.github.io") {
    id
  }
}'
```

返回：

```json
{ "data": { "repository": { "id": "MDEwOlJlcG9zaXRvcnkzODczMjk0MDY=" } } }
```

而我配置里写的是：

```yaml
giscus:
  repoId: "387329406"  # ❌ 错的！
```

**真根因**：

| ID 格式 | 用途 |
|---|---|
| `387329406` | REST API 的数字 database ID |
| `MDEwOlJlcG9zaXRvcnkzODczMjk0MDY=` | GraphQL 的 node ID（base64） |

giscus.app 的「Configure」页面**给了我们 REST 数字 ID**，但 giscus 后端调的是 **GraphQL mutation**——必须用 node ID 格式。

改完 push，部署，刷新——评论成功发出 🎉

{{< alert type="success" >}}
**经验**：giscus.app 配置页的 `repoId` 是 bug——它显示了数字格式但后端要 base64 格式。**自己用 `gh api graphql` 查一遍**最稳。
{{< /alert >}}

## 3. 一些搭建上的小坑

| 坑 | 解决 |
|---|---|
| GitHub Discussions 没开 | 仓库 Settings → General → Features → 勾选 Discussions |
| giscus-app 没装或权限不对 | github.com/apps/giscus → Install → 选仓库 → 勾 Read+Write |
| Edge 默认 Tracking Prevention 拦截 | edge://settings/privacy → 改成 Basic |
| PaperMod 版本太老不支持 `series` taxonomy | PaperMod ≥ 某版本就支持 |

## 这次踩坑的复盘

1. **并行 agent 的 race condition 没法完全避免**——除非用 git worktree 或者更严格的协议。下次给 agent 派活时，要把"commit 原子性"显式写进 prompt。

2. **第三方 SaaS 的 bug 排查**——giscus 这种封装了 GitHub API 的服务，出错时栈信息全在它的后端。要有勇气**直接读它的源码**，比猜要快。

3. **GraphQL 和 REST 的 ID 体系是两套**——以后调任何 GitHub API，先确认走哪一套、用什么格式的 ID。

## 下一步计划

- 加 RSS 全文输出
- 自部署一个轻量评论镜像（万一哪天 giscus 关了不至于丢评论）
- 把这个系列里每篇都补全正文（开张篇太短了 😅）

---

> 本系列共 2 篇：
> - 上一篇：[你好，这是 LiMing 编程笔记第一篇文章](/posts/hello-world/)
> - 下一篇：待续……
