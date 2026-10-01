import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** Drafts render in `astro dev` so you can preview, and are dropped from the build. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) =>
    import.meta.env.PROD ? data.draft !== true : true,
  );
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** ISO-ish, to match the directory-listing look. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Two-digit month and year, e.g. "09 26". */
export function formatMonthYear(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month} ${year}`;
}
