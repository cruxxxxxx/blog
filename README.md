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
4. **Videos** — paste, then command palette → **Upload editor attachments**
   (Attachment Uploader). See below.
5. **Ship** — set `draft: false`, commit, push. Actions builds and deploys.

## Videos

Image Upload Toolkit only knows about image formats, so videos go through a
second plugin, **Attachment Uploader**, configured to hand every `.mp4 .mov
.m4v .webm .avi .mkv` in the note to `bin/r2-media.sh`. That script:

- re-encodes with ffmpeg — H.264, max 1280px wide, CRF 26, AAC 128k,
  `+faststart` so playback starts before the file finishes downloading
- strips all metadata (`-map_metadata -1`), which covers GPS
- grabs a WebP poster frame at 0.5s
- uploads both to `blog/{year}/{mon}/` in the same bucket, named
  `<slug>-<content hash>.mp4` and `<slug>-<content hash>-poster.webp`
- prints the public URL, which the plugin writes back into the note

R2 credentials are read at runtime from the Image Upload Toolkit config, so
they live in exactly one (gitignored) place.

The note ends up with an HTML `<video>` tag, so the clip keeps playing inline
in Obsidian and renders the same on the site:

```html
<video src="https://<r2-host>/blog/2026/09/walk-ab12cd34.mp4"
       poster="https://<r2-host>/blog/2026/09/walk-ab12cd34-poster.webp"
       controls preload="none" playsinline></video>
```

That needs a patch: the plugin ships rewriting non-images to `[name](url)`, a
plain link with no player, and Obsidian will not embed a remote video through
`![](url.mp4)` either — markdown embeds of external media only work for
images. `bin/patch-attachment-uploader.mjs` applies the change and is a no-op
when already applied. **Re-run it after every plugin update**, or videos go
back to being dead links:

```
node bin/patch-attachment-uploader.mjs
```

`src/lib/img-attrs-plugin.mjs` is the safety net: any leftover link or image
pointing at a video extension still renders as a `<video>` with a derived
poster.

## Sizing photos and videos

By default media sits at its natural size and only shrinks when it is wider
than the column — a 1280px photo fills the column, a 400px one does not. To
override, use Obsidian's size syntax:

| | |
|---|---|
| `![alt\|400](url)` | 400px wide |
| `![alt\|400x300](url)` | 400×300 |
| `![alt\|60%](url)` | 60% of the column |

The first two are Obsidian's own, so the note previews at the size it renders.
The percentage is only understood by the site; Obsidian shows it full width and
leaves `\|60%` in the alt text.

Videos are HTML, so size them with an attribute on the tag — `width="400"` or
`style="width:60%"`. Both work in Obsidian and in the build. Set one dimension
and the other follows: `height: auto` is in the stylesheet.

The cover never passes through markdown, so it takes its size from the
`coverWidth` frontmatter field instead, in the same vocabulary. A bad value
fails the build with `expected a width like 400, 400x300 or 60%`.

A cover can be a video: point `cover` at an `.mp4` and it renders as a player
with its poster frame, while `og:image` and the RSS enclosure fall back to the
poster — a feed or a link preview cannot use an mp4.

Originals stay in `Blogs/assets/` (gitignored). Set **Delete original after
upload** in the plugin settings if you would rather they did not.

Tunables are at the top of `bin/r2-media.sh`: `MAX_WIDTH`, `CRF`,
`AUDIO_BITRATE`. Higher CRF = smaller and worse; 23 is near-transparent, 28 is
visibly soft on detailed footage.

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
coverWidth: 60%            # optional; 400, 400x300 or a percentage
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
