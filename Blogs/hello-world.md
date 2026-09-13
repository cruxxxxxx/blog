---
title: Hello world
description: First post — checking the pipeline end to end.
pubDate: 2026-09-13
tags:
  - meta
draft: false
---

Blog is live. Written in Obsidian, photos on Cloudflare R2, built by Astro,
served from GitHub Pages.

## How a post gets published

1. Write here in Obsidian. Paste photos — they land in `Blogs/assets/`.
2. Run **Publish Page** (Image Upload Toolkit) — uploads to R2, rewrites links.
3. Commit and push. GitHub Actions builds and deploys.

Flip `draft: true` to `false` when it is ready. Drafts show in `npm run dev`
and never reach the build.
