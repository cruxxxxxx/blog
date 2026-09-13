import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    cover: z.string().url().optional(),
    coverAlt: z.string().default(''),
  }),
});

export const collections = { posts };
