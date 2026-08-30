---
title: "Hugo 完全教程：从零搭建到高级定制"
date: 2026-08-30T09:00:00+08:00
draft: false
slug: hugo-complete-tutorial
description: "一篇 Hugo 综合教程：从安装、配置、写第一篇 post，到自定义 taxonomy、shortcode、Go template 覆盖主题布局、性能调优。配实际可运行示例。"
tags:
  - Hugo
  - 教程
  - 静态站点
  - PaperMod
categories:
  - 技术
series:
  - 博客搭建
ShowToc: true
TocOpen: false
---

> 本文是 [Hugo + PaperMod 博客搭建：从 0 到评论上线，我踩过的坑](/posts/hugo-blog-build-pitfalls/) 的「完整版」——上篇是叙事版，这篇是参考手册版。读这一篇就能掌握搭建这个博客用到的全部 Hugo 知识。

## 1. 什么是 Hugo

**Hugo** 是一个用 Go 写的**静态站点生成器**（Static Site Generator, SSG）。你写 Markdown，Hugo 编译成 HTML，浏览器直接读 HTML 文件。

跟同类对比：

| 工具 | 语言 | 特点 |
|---|---|---|
| **Hugo** | Go | **快**——几千页也毫秒级编译 |
| Jekyll | Ruby | 老牌，GitHub Pages 原生支持 |
| Hexo | Node.js | 中文社区多 |
| Gatsby | React + GraphQL | 适合复杂前端 |
| Astro | 多框架 | 现代，新兴 |

Hugo 的最大卖点是**速度**——几千篇文章的站，一次完整 build 通常 < 1 秒。本地 `hugo server` 改一行就热更新，几乎无感。

> {{< alert type="info" >}}
> Hugo 是「无依赖」工具——单文件可执行（~30 MB），不装 Node、不装 Ruby、不装数据库。丢任何机器上都能跑。
> {{< /alert >}}

## 2. 安装

### macOS

```bash
brew install hugo
```

### Linux

```bash
# Debian/Ubuntu
sudo apt install hugo

# 或最新版（推荐）
snap install hugo --channel=extended
```

> {{< alert type="warning" >}}
> 装 **`extended`** 版本——后面要用 Hugo Pipes 处理 SCSS，普通版不支持。
> {{< /alert >}}

### Windows

```bash
choco install hugo-extended
# 或 scoop install hugo-extended
```

### 验证

```bash
hugo version
# hugo v0.158.0+extended ...
```

## 3. 初始化一个新站

```bash
hugo new site my-blog
cd my-blog
```

生成结构：

```
my-blog/
├── archetypes/      # 内容模板（每类 post 的 front matter 默认值）
├── assets/          # 会被 Hugo Pipes 处理的资源（CSS、JS、图片）
├── content/         # 你的 Markdown 文章
├── data/            # 结构化数据（YAML/JSON/TOML）
├── layouts/         # 模板（HTML/Go templates）
├── public/          # 编译输出（最终部署的静态文件）
├── static/          # 不处理的静态资源（favicon、robots.txt 等）
├── themes/          # 主题
└── hugo.yaml        # 配置文件
```

## 4. 装主题

```bash
git init
git submodule add https://github.com/adityatelange/hugo-PaperMod themes/PaperMod
```

在 `hugo.yaml` 里启用：

```yaml
theme: PaperMod
```

`themes/` 是子模块，要随仓库一起 clone 时用：

```bash
git submodule update --init --recursive
```

## 5. 第一个 post

```bash
hugo new posts/hello-world.md
```

`archetypes/default.md` 是模板（这个博客里我们的 archetype 注释了所有可用字段）。生成的 post 长这样：

```markdown
---
title: "Hello World"
date: 2026-01-01T00:00:00+08:00
draft: true
---

正文写在这里……
```

`draft: true` 表示**草稿**——本地预览能看到，`hugo` 构建时会被忽略。发布前改 `false` 或删掉。

## 6. 启动 dev server

```bash
hugo server -D
```

- `-D` 或 `--buildDrafts`：显示 draft 文章
- 默认监听 `http://localhost:1313`
- 改文件**自动热更新**——浏览器刷新就能看到

## 7. 构建生产版本

```bash
hugo
```

输出到 `public/` 目录。整个目录就是静态站点，丢任何静态托管就行（GitHub Pages、Vercel、Netlify、Nginx 都可）。

## 8. Markdown 速览

Hugo 用 Goldmark 解析 Markdown，支持 GFM（GitHub Flavored Markdown）扩展：

````markdown
# H1 / ## H2 / ### H3

**加粗** *斜体* ~~删除线~~

[链接文字](https://example.com)

![图片 alt](/img/foo.png)

- 无序列表
- 项目 2

1. 有序列表
2. 项目 2

- [x] 任务列表

> 引用块

```python
print("代码块带语法高亮")
```

| 表格 | 列 2 |
|---|---|
| 内容 | 内容 |

行内 `code` 反引号
````

代码块支持语法高亮（Hugo 内置 Chroma），指定语言就行：

````
```python
def foo():
    return "hi"
```
````

## 9. Front matter 完全指南

Front matter 是 post 顶部的 YAML（或 TOML/JSON），给 Hugo 机器读。**可用的字段远不止你看到的那些**：

```yaml
---
title: "文章标题"             # 必填，会显示在页面、H1、列表、RSS
date: 2026-01-01T10:00:00+08:00  # 发布时间（带时区）
draft: false                # 是否草稿
slug: "my-url-path"         # 自定义 URL（覆盖默认规则）
description: "SEO 摘要"     # meta description 和 RSS 摘要
tags: [A, B]                # 标签（taxonomy）
categories: [X]             # 分类（taxonomy）
series: [Y]                 # 自定义 taxonomy（需在 hugo.yaml 启用）
weight: 1                   # 排序权重（在 list 页可用）
summary: "自定义摘要"       # 不写则自动取前 70 字
ShowToc: true               # 显示右侧目录
TocOpen: false              # 目录默认折叠
cover:                      # 头图
  image: "/img/cover.jpg"
  alt: "封面图描述"
---
```

### 日期的时区

`+08:00` 是东八区时间。Hugo 默认按 UTC 存，**时区错了可能导致「未来时间」post 不显示**。要么删掉时区，要么写对时区。

## 10. 配置文件 hugo.yaml

从 Hugo 0.110 开始推荐用 YAML（之前是 TOML）。基本结构：

```yaml
baseURL: "https://yoursite.com/"
title: 我的博客
theme: PaperMod

# 默认语言
defaultContentLanguage: zh-cn
defaultContentLanguageInSubdir: false

# 多语言（先跳过，看 §16 高级话题）
languages:
  zh-cn:
    languageName: 简体中文
    weight: 1

# 内容组织
pagination:
  pagerSize: 10

# 主题参数（每个主题自定义字段不同）
params:
  env: production
  description: 站点描述
  ShowReadingTime: true
  ShowShareButtons: true

# Permalinks（URL 规则）
permalinks:
  posts: /posts/:slug/

# Taxonomies（自定义分类法）
taxonomies:
  category: categories
  tag: tags
  series: series

# 输出格式
outputs:
  home: [HTML, RSS]
```

> {{< alert type="info" >}}
> 想知道某个字段是干啥的？三个办法：
> 1. 读主题的 `hugo.yaml` 或 `exampleSite/`——主题作者会示范
> 2. 读主题的 `layouts/_partials/`——看哪些字段被消费了
> 3. Hugo 文档：https://gohugo.io/getting-started/
> {{< /alert >}}

## 11. 内容组织

### Sections

`content/posts/` 就是一个 **section**——Hugo 自动把它当列表页（`/posts/`）。默认行为：

- `content/posts/foo.md` → 渲染成 `/posts/foo/`（单页）
- `content/posts/_index.md` → 渲染成 `/posts/`（列表页）
- `content/posts/` 本身 → 列表页

### Page Bundles

Hugo 推荐「**Page Bundle**」——把一篇 post 的所有资源（图片、附件）放在同名文件夹里：

```
content/posts/
└── my-trip/
    ├── index.md         # post 正文
    ├── cover.jpg        # 被 index.md 引用
    └── photos/
        └── day1.jpg
```

这样 `index.md` 里写 `![](/photos/day1.jpg)`，Hugo 自动处理路径。**搬文章时不会丢图**。

### Archetypes

每类内容的「默认 front matter 模板」。比如想让所有 post 默认 `draft: true`：

`archetypes/posts.md`：

```markdown
---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
tags: []
categories: []
ShowToc: true
---
```

然后 `hugo new posts/foo.md` 会自动套这个模板。

> {{< alert type="success" >}}
> 我们这个博客的 `archetypes/default.md` 注释了所有常用字段，新文章创建时一眼能看到能用什么。
> {{< /alert >}}

## 12. Taxonomies

**Taxonomy** = 分类法。Hugo 内置支持任意多套分类，常见的有：

- **tags**（标签）：一篇文章可以多个，扁平
- **categories**（分类）：一篇文章通常一个，层级
- 任意自定义：比如「系列」「作者」「难度」

启用方式（在 `hugo.yaml`）：

```yaml
taxonomies:
  category: categories
  tag: tags
  series: series    # 自定义
```

post front matter 写：

```yaml
tags: [Hugo, 教程]
categories: [技术]
series: [博客搭建]
```

Hugo 自动生成：
- `/tags/` —— 所有标签
- `/tags/hugo/` —— 该标签下的所有 post
- `/categories/技术/` —— 该分类下的所有 post
- `/series/博客搭建/` —— 该系列的所有 post

PaperMod 内置渲染这些列表页，不用写模板。

### 排序：weight

列表页默认按 `date` 倒序。想手动控制顺序：

```yaml
weight: 1   # 越小越靠前
```

混合用法（有的有 weight 有的没有）会出现奇怪的排序——无 weight 的全归 0，会挤到最前。**要么全设 weight，要么全不设**。

## 13. Shortcodes

Shortcode = Hugo 的「组件」机制，让 Markdown 调用预定义的 HTML 模板。

### 内置 shortcode

````markdown
{{< figure src="/img/foo.jpg" title="标题" >}}

{{< youtube "dQw4w9WgXcQ" >}}

{{< highlight python >}}
def foo():
    pass
{{< /highlight >}}
````

### 自定义 shortcode

放在 `layouts/_shortcodes/<name>.html`。

举例——一个简单的「笔记」框：

`layouts/_shortcodes/note.html`：

```go-html-template
<aside class="note">
  <strong>📝 笔记：</strong>
  <div class="note-body">{{ .Inner }}</div>
</aside>
```

用法：

```markdown
{{</* note */>}}
这里是笔记内容
{{</* /note */>}}
```

> 上面是举例。围栏代码块里的 shortcode 语法默认仍会被 Hugo 解析，想原样展示要用 `/` 开头的转义形式（`/*` 和 `*/` 包裹），或放在 HTML 注释里。

调用方式：

- 不带内容的 shortcode：尖括号百分号 + name + 空格 + 任意参数 + 百分号尖括号
- 带内容的 shortcode：同上开始，中间写 HTML/Markdown，结尾用同名结束标签加 `/`

> Hugo 处理 fenced 代码块里的 `{{&lt;` 和反引号里的 `{{&lt;` 都照样当 shortcode 解析。文档里要展示 shortcode 语法本身，得用 `/` 前后包裹（开头 `{{&lt; /* name */ >}}` 形式），或者用 HTML 注释包起来。
### 实战：我们的 alert / card / video

我们博客里写了三个 shortcode，都在 `layouts/_shortcodes/`：

| Shortcode | 用途 | 是否需要 inner |
|---|---|---|
| `alert` | 4 种 variant 的提示框（info/success/warning/danger） | 需要 |
| `card` | 带图片的链接卡片 | 自闭合 |
| `video` | 嵌入 YouTube / Bilibili / 自托管视频 | 自闭合 |

`video` 的核心是**根据 URL 判断平台并出对应 iframe**：

```go-html-template
{{- $url := .Get "src" -}}
{{- if findRE "youtube" $url -}}
  {{- /* 提取 video id，输出 youtube iframe */ -}}
{{- else if findRE "bilibili" $url -}}
  {{- /* 提取 bvid，输出 bilibili iframe */ -}}
{{- else -}}
  {{- /* 原样输出 <video> 标签 */ -}}
{{- end -}}
```

## 14. 模板系统（Go templates）

Hugo 用 **Go template** 写 HTML。**这是 Hugo 最难也最有威力的一块**——能完全控制输出。

### 基础语法

```go-html-template
{{ /* 注释 */ }}

{{ $var := "值" }}                  {{/* 定义变量 */}}
{{ $var }}                          {{/* 输出变量 */}}

{{ if .IsHome }}首页{{ else }}非首页{{ end }}

{{ range .Pages }}
  <a href="{{ .Permalink }}">{{ .Title }}</a>
{{ end }}

{{ partial "header.html" . }}       {{/* 调用 partial */}}

{{ .Content }}                      {{/* 渲染 markdown 正文 */}}
```

`.`（点）是当前 context。`partial "x" .` 的第二个参数 `.` 是传给 partial 的 context。

### Hugo 对象导航

最重要的几个 `.Site`、`Page`、`Permalink`：

```go-html-template
.Site.Title                          # 站点标题
.Site.Pages                          # 所有页面
.Site.RegularPages                   # 普通页面（排除 taxonomy 列表）
.Site.RegularPages | first 5         # 取前 5
.Site.Params                         # hugo.yaml 的 params 段
where .Site.RegularPages "Section" "posts"   # 按 section 过滤
.Title                               # 当前页标题
.RelPermalink                        # 当前页相对 URL
.Content                             # 当前页正文（已渲染 HTML）
.RawContent                          # 当前页原始 markdown
.Pages                               # 当前 section/page 的子页
.GetTerms "tags"                     # 当前页的某个 taxonomy terms
```

### 内置函数（高频）

| 函数 | 用途 |
|---|---|
| `len`, `first`, `last`, `slice` | 集合操作 |
| `sort`, `where`, `group` | 排序、过滤、分组 |
| `findRE`, `strings.Contains` | 正则、字符串包含 |
| `printf`, `safeHTML` | 格式化、标记为安全 HTML |
| `time.Format` | 时间格式化 |
| `default` | 提供默认值 |
| `partial`, `template` | 引入子模板 |
| `dict` | 构造 map（传多参数给 partial） |

> {{< alert type="warning" >}}
> Hugo 的函数链是**管道**风格：`$result | func1 | func2`。中间结果是第一个参数。
> {{< /alert >}}

### 写一个自定义 list 模板

`layouts/_default/list.html`（默认列表页）：

```go-html-template
{{ define "main" }}
<main>
  <h1>{{ .Title }}</h1>
  <ul>
    {{ range .Pages.ByDate.Reverse }}
    <li>
      <time>{{ .Date.Format "2006-01-02" }}</time>
      <a href="{{ .RelPermalink }}">{{ .Title }}</a>
    </li>
    {{ end }}
  </ul>
</main>
{{ end }}
```

## 15. 覆盖主题（Override）

**这是 Hugo 最 powerful 的特性**——不用 fork 主题就能改任何东西。

主题文件在 `themes/PaperMod/layouts/...`。Hugo 查找顺序：**项目根目录的 `layouts/` 优先于 `themes/`**。

所以你想改 PaperMod 的某段 HTML：

1. 找到那个文件：`themes/PaperMod/layouts/_partials/header.html`
2. 复制到你的项目：**`layouts/_partials/header.html`**
3. 改它——主题的同路径文件被忽略

### 实战：我们的 extend_post_content.html

PaperMod 默认提供了 hook：`layouts/_partials/extend_post_content.html`——如果这个文件存在，会被自动插入到 post 正文**之后**。

我们在那里挂了：

- **系列文章 box**（显示「本文属于系列 X」+ 上下篇）
- **双链 box**（显示「引用本文」）

完整逻辑见 `layouts/_partials/extend_post_content.html` 和 `layouts/_partials/backlinks.html`。

### 实战：双链的 Go template

`layouts/_partials/backlinks.html` 的核心逻辑：

```go-html-template
{{- $current := . -}}
{{- $currentRel := $current.RelPermalink -}}
{{- $needle := printf `href="%s"` $currentRel -}}

{{- $links := slice -}}
{{- range where .Site.RegularPages "Section" "posts" -}}
  {{- if and (ne .RelPermalink $currentRel) (strings.Contains .Content $needle) -}}
    {{- $links = $links | append . -}}
  {{- end -}}
{{- end -}}

{{- if $links -}}
  <aside class="backlinks">
    <h3>🔗 引用本文 ({{ len $links }})</h3>
    <ul>
      {{ range $links }}
        <li><a href="{{ .RelPermalink }}">{{ .Title }}</a></li>
      {{ end }}
    </ul>
  </aside>
{{- end -}}
```

**关键 trick**：用 `.Content`（渲染后 HTML）而不是 `.RawContent`（markdown）来搜链接——因为前者不管你是 `{{&lt; ref >}}` 还是 `/posts/foo/` 还是绝对 URL，**都规范化成同一个 `href="/posts/foo/"`**。

## 16. 多语言（高级）

Hugo 支持**多语言站**，每种语言一套内容树：

```
content/
├── posts/
│   ├── hello.md      ← 中文
│   └── _index.md
└── en/
    └── posts/
        └── hello.md  ← 英文
```

配置：

```yaml
defaultContentLanguage: zh-cn
defaultContentLanguageInSubdir: false   # 默认语言不放子目录

languages:
  zh-cn:
    languageName: 简体中文
    weight: 1
  en:
    languageName: English
    weight: 2
```

Hugo 自动按**文件名 + slug** 配对翻译版，PaperMod 自动加语言切换器。

> {{< alert type="warning" >}}
> 我们试过加英文，但只有一个英文 post 时语言切换器体验很糟（找不到对应翻译就跳英文首页）。**至少要 5+ 篇英文才有意义开双语。**
> {{< /alert >}}

## 17. 部署

### GitHub Pages + Actions

`.github/workflows/hugo.yaml`：

```yaml
name: Deploy Hugo site to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive   # 拉主题子模块
      - uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: '0.158.0'
          extended: true
      - name: Build
        run: hugo --minify
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

我们的部署比这还简化——直接 `actions/checkout` + `actions/setup-hugo` + `actions/upload-pages-artifact` + `actions/deploy-pages`，是 GitHub 官方 Pages 部署流程。

### 静态托管的其他选项

| 平台 | 适合 |
|---|---|
| **GitHub Pages** | 开源项目、个人站，免费 |
| Vercel | 配合 SSG + Serverless Functions |
| Netlify | 表单、Functions、Identity |
| Cloudflare Pages | 全球 CDN，免费额度大 |

## 18. 性能调优

### 构建期

```bash
hugo --minify              # 压缩 HTML/CSS/JS
hugo --gc                  # 清理缓存
HUGO_NUMWORKERMULTIPLIER=4 hugo  # 多核并行（默认自动检测）
```

### 配置期

```yaml
# 只在 home 页生成 RSS
outputs:
  home: [HTML, RSS]
  section: [HTML]
  taxonomy: [HTML]
  term: [HTML]

# 关闭不用的输出
disableKinds: ["RSS", "sitemap"]
```

### 图片

```yaml
# assets/ 下的图片自动处理
params:
  images:
    quality: 85
```

`assets/img/foo.jpg` 在 markdown 里用 `{{&lt; imgproc foo Fill "800x400" >}}` 可以自动裁剪。

### 缓存

```bash
hugo --ignoreCache   # 强制重新生成（调试时用）
```

## 19. 调试技巧

### 看 Hugo 在 build 时干啥

```bash
hugo --logLevel debug
hugo --templateMetrics   # 看每个模板耗时
hugo --printPathWarnings # 看路径相关 warning
```

### 看 page 有什么变量

```go-html-template
<!-- 临时插到模板里 dump 所有变量 -->
<pre>{{ debug.Dump . }}</pre>
```

或者只 dump 一个：

```go-html-template
<pre>{{ printf "%#v" . }}</pre>
```

### 常见坑

| 坑 | 解决 |
|---|---|
| post 不显示 | 检查 `draft: false` + `date` 不是未来 |
| 日期乱序 | `date` 必须能 parse；混用 ISO 字符串和 time.Time 会出问题 |
| 改主题没生效 | 检查是不是放在 `themes/` 而非项目根目录的 `layouts/` |
| 分类页 404 | `hugo.yaml` 加 `taxonomies:` 配置 |
| 主题版本太老 | PaperMod ≥ 某版本才支持某些 feature |

## 20. 资源

- **官方文档**：https://gohugo.io/documentation/
- **PaperMod 文档**：https://github.com/adityatelange/hugo-PaperMod/wiki
- **Hugo 论坛**：https://discourse.gohugo.io/
- **我们的博客源码**：每篇文章的 front matter 和模板都开源在 GitHub

## 小结

Hugo 的核心模型其实很简洁：

1. **Markdown 文件** → 内容
2. **hugo.yaml** → 配置
3. **主题** → 默认模板
4. **layouts/** → 自定义覆盖
5. **`hugo` 命令** → 一行编译

学会这五件事，剩下都是细节。**遇到问题先想：是配置不对？是主题问题？还是我的 override 没生效？**——这三类各查各的，效率最高。

---

下一篇打算写「GitHub Actions 完整指南——从零配置到部署」——配合这个博客的部署流程讲。有想看的具体话题告诉我。
