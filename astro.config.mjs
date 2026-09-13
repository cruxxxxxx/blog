import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import imgAttrs from './src/lib/img-attrs-plugin.mjs';

// ─── EDIT THESE TWO ─────────────────────────────────────────────
// User/org site (repo named `<username>.github.io`):
//    SITE = 'https://<username>.github.io'   BASE = '/'
// Project site (any other repo name):
//    SITE = 'https://<username>.github.io'   BASE = '/<repo-name>'
// Custom domain:
//    SITE = 'https://example.com'            BASE = '/'
const SITE = 'https://cruxxxxxx.github.io';
const BASE = '/blog';
// ────────────────────────────────────────────────────────────────

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { theme: 'github-dark', wrap: true },
    processor: satteri({ hastPlugins: [imgAttrs] }),
  },
  // No `image.remotePatterns` on purpose: photos are already web-sized on R2.
  // Allowlisting the host would make Astro download every image at build time
  // just to infer its dimensions, which slows CI and breaks when R2 hiccups.
});
