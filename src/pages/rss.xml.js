import rss from '@astrojs/rss';
import { previewImageFor } from '../lib/media.mjs';
import { getPublishedPosts } from '../lib/posts';
import { SITE_TITLE, SITE_DESCRIPTION } from '../site';

export async function GET(context) {
  const posts = await getPublishedPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description ?? '',
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: `/${post.id}`,
      ...(post.data.cover && {
        enclosure: {
          url: previewImageFor(post.data.cover),
          type: 'image/webp',
          length: 0,
        },
      }),
    })),
  });
}
