---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
# slug: ""        # 自定义 URL slug，留空就按 title 生成（中文标题会被 URL-encode）
# description: "" # SEO 摘要，会出现在 RSS 和 meta description
# tags: []        # 标签，例如: [Python, 异步]
# categories: []  # 分类，例如: [编程笔记]
# ShowToc: true   # 是否显示右侧目录
# cover:
#   image: ""     # 头图相对路径，例如: /img/post-foo.png
#   alt: ""
---

正文写在这里。完成后把 `draft: true` 改成 `false`（或删掉这一行）才会发布。
