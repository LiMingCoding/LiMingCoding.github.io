---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
# slug: ""        # 自定义 URL；留空则用文件名（content/posts/foo.md → /posts/foo/）
# description: "" # SEO 摘要，会出现在 RSS 和 meta description
# tags: []        # 标签，例如: [Python, 异步]
# categories: []  # 分类，例如: [编程笔记]
# series: []      # 系列文章（多篇同系列），例如: ["Hugo折腾笔记"]；按发布时间升序显示
ShowToc: true      # 是否显示右侧目录（默认开启；如不需要可注释掉）
TocOpen: false     # 目录默认折叠；改成 true 让目录默认展开
comments: true     # 是否显示评论区（giscus）
# cover:
#   image: ""     # 头图相对路径，例如: /img/post-foo.png
#   alt: ""
---

正文写在这里。完成后把 `draft: true` 改成 `false`（或删掉这一行）才会发布。
