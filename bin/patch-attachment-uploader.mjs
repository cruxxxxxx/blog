#!/usr/bin/env node
/**
 * Patch the Attachment Uploader plugin so video uploads keep playing inline.
 *
 * Out of the box the plugin rewrites a non-image attachment to `[name](url)` —
 * a plain link, so the player you had while the clip was local disappears the
 * moment it is uploaded. Obsidian also refuses to embed an external video
 * through `![](url.mp4)`: markdown embeds of remote media only work for images.
 * An HTML <video> tag renders in both Obsidian and the Astro build, so that is
 * what videos are rewritten to.
 *
 * Run after installing or updating the plugin; re-running is a no-op.
 *
 *     node bin/patch-attachment-uploader.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const VAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_MAIN = join(VAULT_ROOT, '.obsidian/plugins/attachment-uploader/main.js');
const MARKER = 'VIDEO_EXTENSION_REGEX';

const HELPER = `var IMAGE_EXTENSION_REGEX = /\\.(avif|bmp|gif|jpeg|jpg|png|svg|webp)$/i;
var VIDEO_EXTENSION_REGEX = /\\.(mp4|webm|mov|m4v)$/i;
function toMediaMarkup(ext, label, url) {
  if (VIDEO_EXTENSION_REGEX.test(ext)) {
    const poster = url.replace(/(\\.[^.?]+)(\\?.*)?$/, "-poster.webp$2");
    return \`<video src="\${url}" poster="\${poster}" controls preload="none" playsinline></video>\`;
  }
  const markdownUrl = toMarkdownUrl(url);
  return IMAGE_EXTENSION_REGEX.test(ext) ? \`![\${label}](\${markdownUrl})\` : \`[\${label}](\${markdownUrl})\`;
}`;

// Each: [what it is, exact text in the shipped bundle, replacement].
const PATCHES = [
  [
    'media markup helper',
    'var IMAGE_EXTENSION_REGEX = /\\.(avif|bmp|gif|jpeg|jpg|png|svg|webp)$/i;',
    HELPER,
  ],
  [
    'upload command rewrite',
    `    const isImage = IMAGE_EXTENSION_REGEX.test(attachment.ext);
    const markdownUrl = toMarkdownUrl(newUrl);
    const replacement = isImage ? \`![\${attachment.name}](\${markdownUrl})\` : \`[\${attachment.name}](\${markdownUrl})\`;`,
    '    const replacement = toMediaMarkup(attachment.ext, attachment.name, newUrl);',
  ],
  [
    'paste/drag insert',
    `    const isImage = IMAGE_EXTENSION_REGEX.test(filename);
    const markdownUrl = toMarkdownUrl(url);
    const markdown = isImage ? \`![\${filename}](\${markdownUrl})\` : \`[\${filename}](\${markdownUrl})\`;`,
    '    const markdown = toMediaMarkup(filename, filename, url);',
  ],
  [
    'open-editor link rewrite',
    `            const isImage = IMAGE_EXTENSION_REGEX.test(file.name);
            const markdownUrl = toMarkdownUrl(newUrl);
            return isImage ? \`![\${altText || file.name}](\${markdownUrl})\` : \`[\${altText || file.name}](\${markdownUrl})\`;`,
    '            return toMediaMarkup(file.name, altText || file.name, newUrl);',
  ],
];

let source = readFileSync(PLUGIN_MAIN, 'utf8');

if (source.includes(MARKER)) {
  console.log('already patched — nothing to do');
  process.exit(0);
}

for (const [label, find, replace] of PATCHES) {
  if (!source.includes(find)) {
    console.error(`could not apply "${label}": the plugin bundle changed shape.`);
    console.error('Re-derive the patch against the new main.js before using video uploads.');
    process.exit(1);
  }
  source = source.replace(find, replace);
}

writeFileSync(PLUGIN_MAIN, source);
console.log(`patched ${PATCHES.length} sites in ${PLUGIN_MAIN}`);
