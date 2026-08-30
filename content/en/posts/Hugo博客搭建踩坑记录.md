---
title: "Hugo + PaperMod Blog Setup: From Zero to Comments Live — The Potholes I Hit"
date: 2026-08-30T17:17:00+08:00
draft: false
slug: hugo-blog-build-pitfalls
description: "Real problems I hit while building this Hugo blog: the race condition that polluted my git history when parallel agents ran, and the four-hour debug of giscus's 'Unable to create discussion' — which turned out to be a repoId format mismatch."
tags:
  - Hugo
  - PaperMod
  - Giscus
  - Debugging
categories:
  - Essays
series:
  - Blog Setup
ShowToc: true
TocOpen: true
---

## Why this post

In my previous post I said I wanted to start a blog to record what I learn. This one is about how I actually built the blog itself — and the real problems I hit along the way.

The stack I picked is plain: **Hugo** (static site generator) + **PaperMod** (theme) + **GitHub Pages** (hosting) + **Giscus** (comments, backed by GitHub Discussions).

In theory this is a 30-minute setup. In practice it took an entire afternoon plus an evening — most of it burned on a problem that looked like a config issue but was actually something deeper: Giscus kept reporting `Unable to create discussion` no matter what I changed.

Here's the play-by-play.

## 1. Sixteen features, eleven parallel agents

After the first post went live, I lined up a long wishlist:

- Series support (taxonomy + homepage cloud + prev/next nav)
- Search box click bug
- Homepage taxonomy cloud (categories + tags)
- Custom shortcodes (alert / card / video)
- Syntax highlighting (chroma CSS)
- Code block copy buttons
- Giscus comments
- Mermaid diagrams + KaTeX math
- Share buttons (Weibo + copy link)
- Multi-language support (add English)
- Rainbow-colored tags
- Tech-feel icon glow
- …and a few more

That's 16 items. I dispatched **eleven agents in parallel**, each with a disjoint file scope, each told to commit + push when finished.

### First pothole: race condition

The biggest problem with running agents in parallel is that **their commits can interleave**.

Say agent A and agent B both touch `hugo.yaml`. A commits first. B then cherry-picks A's work — but A's working tree has files that A *intended to commit later*. B's `git add` happily grabs those files too.

The result: two commits whose messages don't match their actual diffs. Git history gets corrupted.

{{< alert type="warning" >}}
**Lesson**: when multiple agents share a working tree, either give each one its own git worktree, or enforce atomic "edit → `git add` → `git commit`" with no intermediate state.
{{< /alert >}}

In the end I used `git reset --hard` + cherry-picked all six commits back, rewriting the messages with a NOTE clarifying what each one really contained. After force-push, history was clean.

## 2. Giscus "Unable to create discussion" — a 30-minute debug

I picked Giscus for comments because:

- No backend to run
- Comments live in GitHub Discussions — **never get lost**
- Comments are issues — searchable by Google
- Open source, free

Following Giscus's official steps: install the giscus app → enable Discussions → copy config — should take three minutes.

After deploy, the comment widget kept showing:

```
Unable to create discussion
```

Opened Edge DevTools, found a sea of red:

```
POST https://giscus.app/api/discussions 400 (Bad Request)
onDiscussionCreateRequest @ widget-...js:1
```

### Diagnosis 1: Category permissions

First instinct: is it a category permission issue? GitHub's default **Announcements** category is maintainer-only — regular users can't post.

Switched from `announcements` to `general` (open to all logged-in GitHub users), pushed, redeployed, refreshed — **still 400**.

### Diagnosis 2: Browser settings

Second instinct: is Edge's Tracking Prevention blocking third-party cookies?

Changed it to "Basic" level, restarted the browser — **still 400**.

### Diagnosis 3: Giscus backend session

Third instinct: does Giscus's backend not have my session?

Hit the Giscus API directly with curl:

```bash
curl -X POST https://giscus.app/api/discussions \
  -H "Content-Type: application/json" \
  -d '{}'
```

Got back:

```json
{ "error": "Invalid or missing access token." }
```

But I'd already clicked "Sign in" in the browser. The session should be there. The issue isn't the session.

### Diagnosis 4: Read the source

I pulled Giscus's source from GitHub and read through it. Found the key code in `pages/api/discussions/index.ts`:

```typescript
async function post(req, res) {
  // 1. Validate user token — passed ✅
  const userToken = req.headers.authorization?.split('Bearer ')[1];
  if (!(await check(userToken))) {
    res.status(403).json({ error: 'Invalid or missing access token.' });
    return;
  }

  // 2. Get giscus-app's installation token for this repo — passed ✅
  let token: string;
  try {
    token = await getAppAccessToken(repo);
  } catch (error) {
    res.status(403).json({ error: error.message });
    return;
  }

  // 3. Call GitHub GraphQL createDiscussion mutation
  const response = await createDiscussion(token, params);
  const id = response?.data?.createDiscussion?.discussion?.id;

  if (!id) {
    res.status(400).json({ error: 'Unable to create discussion with request body.' });
    return;
  }

  res.status(200).json({ id });
}
```

**Key finding**: the 400 comes from **step 3** — `createDiscussion` returns JSON with an empty `discussion.id`.

In other words: **GitHub's GraphQL API is rejecting the mutation**.

### Diagnosis 5: repoId format

Queried my repo's node ID directly via GraphQL:

```bash
gh api graphql -F query='
query {
  repository(owner:"LiMingCoding", name:"LiMingCoding.github.io") {
    id
  }
}'
```

Got back:

```json
{ "data": { "repository": { "id": "MDEwOlJlcG9zaXRvcnkzODczMjk0MDY=" } } }
```

But what I had in my config was:

```yaml
giscus:
  repoId: "387329406"  # ❌ wrong!
```

**The actual root cause**:

| ID format | Use |
|---|---|
| `387329406` | REST API numeric database ID |
| `MDEwOlJlcG9zaXRvcnkzODczMjk0MDY=` | GraphQL node ID (base64) |

Giscus's "Configure" page **gave me the REST numeric ID**, but the backend calls **GraphQL mutation** — which needs the node ID format.

After fixing it, pushing, deploying, and refreshing — the comment went through 🎉

{{< alert type="success" >}}
**Lesson**: the `repoId` on giscus.app's config page is buggy — it displays the numeric format but the backend wants base64. **Look it up yourself via `gh api graphql`** — that's the reliable way.
{{< /alert >}}

## 3. A few smaller potholes

| Problem | Fix |
|---|---|
| GitHub Discussions not enabled | Repo Settings → General → Features → check Discussions |
| Giscus app not installed or wrong perms | github.com/apps/giscus → Install → pick repo → check Read+Write |
| Edge's default Tracking Prevention blocking | edge://settings/privacy → switch to Basic |
| PaperMod version too old for `series` taxonomy | PaperMod ≥ some-recent-version supports it |

## Retrospective

1. **Race conditions with parallel agents can't be fully avoided** — unless you use git worktrees or stricter protocols. Next time I dispatch agents, I'll write "commit atomicity" into the prompt explicitly.

2. **Debugging third-party SaaS bugs** — services like Giscus that wrap GitHub's API hide their stack traces. Be willing to **read their source code** directly — it's faster than guessing.

3. **GraphQL and REST have two different ID systems** — for any future GitHub API call, confirm which one you're using and what ID format it needs.

## Next steps

- Full-text RSS output
- Self-host a lightweight comment mirror (in case Giscus ever shuts down)
- Flesh out the rest of the series posts (the opening one is too short 😅)
