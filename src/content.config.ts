import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { SIZE_PATTERN } from './lib/media.mjs';

const posts = defineCollection({
  // Content lives in the Obsidian folder `Blogs/`, not in `src/`,
  // so Obsidian stays the editing surface.
  loader: glob({ pattern: '**/*.md', base: './Blogs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Absolute R2 URL, written by Image Upload Toolkit
    cover: z.string().url().nullish(),
    coverAlt: z.string().default(''),
    // Same vocabulary as `![alt|400]` in the body: `400`, `400x300` or `60%`.
    // The cover skips markdown, so it cannot carry the size in its own link.
    coverWidth: z
      .string()
      .regex(SIZE_PATTERN, 'expected a width like 400, 400x300 or 60%')
      // nullish, not optional: an empty `coverWidth:` in the template is null.
      .nullish(),
  }),
});

export const collections = { posts };
