# Blog

Obsidian vault → Astro → GitHub Pages. Photos on Cloudflare R2.

## First-time setup

Run `./setup.sh`. It installs npm deps, downloads and enables the three
Obsidian plugins, prompts for your GitHub and Cloudflare R2 details, writes
the plugin config, and does a test build. Re-runnable — every prompt defaults
to the current value.

The script is gitignored because it writes credentials; keep a copy if you
plan to set this up on another machine.

## Publishing a post

1. **Write** — new note in `Blogs/`. Use `Templates/post.md` for frontmatter.
2. **Photos** — paste into the note. They land in `Blogs/assets/`.
3. **Upload** — command palette → **Publish Page** (Image Upload Toolkit).
   Uploads to R2 and rewrites the links to absolute URLs.
4. **Ship** — set `draft: false`, commit, push. Actions builds and deploys.

Drafts render in `npm run dev` and are excluded from the production build.

## Frontmatter

```yaml
---
title: Required
description: Shown on the index and in RSS/OG tags
pubDate: 2026-09-13        # required; sorts the index
updatedDate: 2026-09-20    # optional
tags: [film, street]
draft: false
cover: https://<r2-host>/blog/2026/09/frame.webp   # optional hero + OG image
coverAlt: Description of the cover photo
---
```

## Commands

| | |
|---|---|
| `npm run dev` | local preview, drafts visible |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the built output |

## Image Upload Toolkit settings

- Backend: **Cloudflare R2**
- Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- Path: `blog/{year}/{mon}/{filename}` (vars: `{year} {mon} {day} {random} {filename}`)
- **Update original document: ON** — rewrites the note in place instead of
  copying to clipboard.

Pair it with the **Image Converter** plugin (resize + WebP on paste). Upload
Toolkit does no resizing, and a straight-from-camera Zf JPEG is ~12 MB.

## Things that will bite

- **`.obsidian/` is gitignored** and must stay that way. Image Upload Toolkit
  stores the R2 access key and secret in plaintext under
  `.obsidian/plugins/obsidian-image-upload-toolkit/data.json`. This repo is
  public. Check `git status` before committing if you ever touch `.gitignore`.
- **Strip GPS before uploading**, once per batch:
  `exiftool -gps:all= -overwrite_original Blogs/assets/*`
- **Obsidian is set to markdown links, not wikilinks** (`.obsidian/app.json`).
  Astro cannot render `[[wikilinks]]`. Do not turn them back on.
- **No `image.remotePatterns` in the Astro config**, on purpose — see the note
  there.

## Deploy config

`astro.config.mjs` has `SITE` and `BASE` at the top. Set them to match the repo:
a user site (`<username>.github.io`) uses `BASE = '/'`; any other repo name uses
`BASE = '/<repo-name>'`.

Then in the repo: **Settings → Pages → Source → GitHub Actions**.
