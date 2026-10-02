#!/usr/bin/env node
/**
 * Publish raw media that was committed from the phone.
 *
 * Notes written in Obsidian mobile drop their photos and videos in
 * `Blogs/inbox/` (un-ignored, unlike the desktop's `Blogs/assets/`). On push,
 * GitHub Actions runs this script, which for every note linking to an inbox
 * file:
 *   - photos: rotate upright, resize to MAX_PHOTO_WIDTH, re-encode as WebP
 *     (sharp drops all metadata, GPS included) and upload to R2
 *   - videos: hand off to bin/r2-media.sh (same ffmpeg settings as desktop)
 *   - rewrite the link in the note to the R2 URL and delete the inbox file
 *
 * The repo is public, so the raw file is already in git history by now.
 * Anything that arrived with GPS or camera metadata (i.e. not cleaned on the
 * phone first) is reported as a privacy issue so the workflow flags it loudly.
 *
 * Env: R2_KEY, R2_SECRET, R2_ENDPOINT, R2_BUCKET, R2_PUBLIC (only needed when
 * there is something to upload). Flags: --dry-run (no upload, no writes).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const VAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = join(VAULT_ROOT, 'Blogs');
const INBOX_DIR = join(POSTS_DIR, 'inbox');
const VIDEO_SCRIPT = join(VAULT_ROOT, 'bin', 'r2-media.sh');

const MAX_PHOTO_WIDTH = 1600;
const WEBP_QUALITY = 80;

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff']);
const PASSTHROUGH_EXTENSIONS = new Set(['.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']);

// ![alt](path), [text](path), src="path", and `cover: path` in frontmatter
const MARKDOWN_LINK = /(!?\[[^\]]*\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g;
const HTML_SRC = /(\b(?:src|poster)=")([^"]+)(")/g;
const COVER_LINE = /^(cover:\s*)(\S.*?)(\s*)$/gm;

const dryRun = process.argv.includes('--dry-run');
const privacyIssues = [];
const uploadedByPath = new Map();

async function main() {
  const notes = listMarkdownFiles(POSTS_DIR);
  let changedNotes = 0;

  for (const notePath of notes) {
    if (await publishNoteMedia(notePath)) {
      changedNotes += 1;
    }
  }

  if (!dryRun) {
    deletePublishedInboxFiles();
  }
  warnAboutOrphans();
  reportPrivacyIssues();
  console.log(`process-media: ${uploadedByPath.size} file(s) published, ${changedNotes} note(s) updated`);
}

function listMarkdownFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (fullPath !== INBOX_DIR && entry.name !== 'assets') {
        files.push(...listMarkdownFiles(fullPath));
      }
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

const LINK_PATTERNS = [MARKDOWN_LINK, HTML_SRC, COVER_LINE];

async function publishNoteMedia(notePath) {
  const original = readFileSync(notePath, 'utf8');

  // Publish first (async), then rewrite every link from the finished map.
  for (const pattern of LINK_PATTERNS) {
    for (const [, , link] of original.matchAll(pattern)) {
      await publishIfInboxFile(notePath, link);
    }
  }

  const replaceLink = (match, before, link, after) => {
    const url = uploadedByPath.get(resolveLocalLink(notePath, link));
    return url ? `${before}${url}${after}` : match;
  };

  const updated = original
    .replace(MARKDOWN_LINK, replaceLink)
    .replace(HTML_SRC, replaceLink)
    .replace(COVER_LINE, replaceLink);

  if (updated === original) {
    return false;
  }
  console.log(`process-media: updated ${relative(VAULT_ROOT, notePath)}`);
  if (!dryRun) {
    writeFileSync(notePath, updated);
  }
  return true;
}

/** Returns the public URL when `link` points at a file in the inbox. */
async function publishIfInboxFile(notePath, link) {
  const filePath = resolveLocalLink(notePath, link);
  if (filePath && !uploadedByPath.has(filePath)) {
    uploadedByPath.set(filePath, await publishFile(filePath));
  }
}

function resolveLocalLink(notePath, link) {
  const bare = link.replace(/^<|>$/g, '').split(/[?#]/)[0];
  if (/^[a-z]+:/i.test(bare)) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    decoded = bare;
  }
  const candidates = [resolve(dirname(notePath), decoded), resolve(VAULT_ROOT, decoded)];
  return candidates.find((candidate) => isInInbox(candidate) && existsSync(candidate)) ?? null;
}

function isInInbox(filePath) {
  const fromInbox = relative(INBOX_DIR, filePath);
  return fromInbox !== '' && !fromInbox.startsWith('..');
}

async function publishFile(filePath) {
  const extension = extname(filePath).toLowerCase();
  checkPrivacy(filePath, extension);

  if (VIDEO_EXTENSIONS.has(extension)) {
    return publishVideo(filePath);
  }
  if (PHOTO_EXTENSIONS.has(extension)) {
    return await publishPhoto(filePath, extension);
  }
  if (PASSTHROUGH_EXTENSIONS.has(extension)) {
    return uploadToR2(filePath, objectKey(filePath, readFileSync(filePath), extension), 'image/gif');
  }
  console.warn(`process-media: skipping ${relativeName(filePath)} (unsupported type)`);
  return null;
}

async function publishPhoto(filePath, extension) {
  const workDir = mkdtempSync(join(tmpdir(), 'process-media-'));
  try {
    const source = isHeic(extension) ? convertHeicToJpeg(filePath, workDir) : filePath;
    const webpPath = join(workDir, 'photo.webp');
    const webp = await toUprightWebp(source);
    writeFileSync(webpPath, webp);
    console.log(`process-media: ${relativeName(filePath)} ${kilobytes(statSync(filePath).size)} -> ${kilobytes(webp.length)}`);
    return uploadToR2(webpPath, objectKey(filePath, webp, '.webp'), 'image/webp');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function toUprightWebp(source) {
  // sharp keeps no metadata unless asked to, so EXIF (and GPS) is dropped here.
  // .rotate() bakes the EXIF orientation into the pixels first.
  return sharp(source)
    .rotate()
    .resize({ width: MAX_PHOTO_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

function isHeic(extension) {
  return extension === '.heic' || extension === '.heif';
}

// The prebuilt sharp on Linux cannot decode HEIC, so go through libheif.
function convertHeicToJpeg(filePath, workDir) {
  const jpegPath = join(workDir, 'photo.jpg');
  execFileSync('heif-convert', ['-q', '95', filePath, jpegPath], { stdio: ['ignore', 'ignore', 'inherit'] });
  return jpegPath;
}

function publishVideo(filePath) {
  if (dryRun) {
    return `https://dry-run.invalid/${basename(filePath)}`;
  }
  const output = execFileSync(VIDEO_SCRIPT, [filePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = output.split('\n').find((line) => line.startsWith('https://'));
  if (!url) {
    throw new Error(`r2-media.sh printed no URL for ${relativeName(filePath)}`);
  }
  return url.trim();
}

function objectKey(filePath, contents, extension) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 8);
  return `blog/${year}/${month}/${slugify(filePath)}-${digest}${extension}`;
}

function slugify(filePath) {
  const stem = basename(filePath, extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return stem || 'photo';
}

function uploadToR2(localPath, key, contentType) {
  if (dryRun) {
    return `https://dry-run.invalid/${key}`;
  }
  const { R2_KEY, R2_SECRET, R2_ENDPOINT, R2_BUCKET, R2_PUBLIC } = requireR2Env();
  execFileSync('aws', [
    's3', 'cp', localPath, `s3://${R2_BUCKET}/${key}`,
    '--endpoint-url', R2_ENDPOINT,
    '--content-type', contentType,
    '--only-show-errors',
  ], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: R2_KEY,
      AWS_SECRET_ACCESS_KEY: R2_SECRET,
      AWS_DEFAULT_REGION: 'auto',
      AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
    },
  });
  return `${R2_PUBLIC.replace(/\/$/, '')}/${key}`;
}

function requireR2Env() {
  const names = ['R2_KEY', 'R2_SECRET', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC'];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`process-media: missing ${missing.join(', ')} (set them as repo secrets)`);
  }
  return process.env;
}

// ── privacy ────────────────────────────────────────────────────────────────

// A cleaned photo (Shortcut: convert with "Preserve Metadata" off) carries no
// EXIF at all, whatever its size. Camera make/model means it skipped that step.
// Videos aren't run through the Shortcut, so for them only location counts.
function checkPrivacy(filePath, extension) {
  const metadata = readMetadata(filePath);
  if (metadata.GPSLatitude !== undefined || metadata.GPSCoordinates !== undefined) {
    privacyIssues.push(`${relativeName(filePath)}: has GPS location data`);
  } else if (!VIDEO_EXTENSIONS.has(extension) && (metadata.Make || metadata.Model)) {
    privacyIssues.push(`${relativeName(filePath)}: still has camera metadata (${[metadata.Make, metadata.Model].filter(Boolean).join(' ')}), run it through the "Blog photo" Shortcut first`);
  }
}

function readMetadata(filePath) {
  try {
    const output = execFileSync('exiftool', ['-j', '-n', '-q', '-q', '-GPSLatitude', '-GPSCoordinates', '-Make', '-Model', filePath], { encoding: 'utf8' });
    return JSON.parse(output)[0] ?? {};
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('process-media: exiftool not installed, skipping privacy check');
    }
    return {};
  }
}

function reportPrivacyIssues() {
  if (privacyIssues.length === 0) {
    return;
  }
  console.log('::error title=Raw media in public git history::' + privacyIssues.join(' | '));
  for (const issue of privacyIssues) {
    console.warn(`process-media: PRIVACY ${issue}`);
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `privacy_issues=${privacyIssues.join(' | ')}\n`);
  }
}

// ── housekeeping ───────────────────────────────────────────────────────────

function deletePublishedInboxFiles() {
  for (const [filePath, url] of uploadedByPath) {
    if (url) {
      rmSync(filePath);
    }
  }
}

function warnAboutOrphans() {
  if (!existsSync(INBOX_DIR)) {
    return;
  }
  for (const name of readdirSync(INBOX_DIR)) {
    const filePath = join(INBOX_DIR, name);
    if (name.startsWith('.') || uploadedByPath.has(filePath)) {
      continue;
    }
    console.warn(`process-media: ${relativeName(filePath)} is not linked from any note, leaving it`);
  }
}

function relativeName(filePath) {
  return relative(VAULT_ROOT, filePath);
}

function kilobytes(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

await main();
