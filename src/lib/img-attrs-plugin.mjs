/**
 * Sätteri hast plugin.
 *
 * Markdown images arrive as bare <img> tags — they point at R2, so Astro's
 * image pipeline never sees them. Add lazy-loading and async decoding so a
 * photo-heavy post does not fetch every frame at once.
 */
export default {
  name: 'img-attrs',
  element: {
    filter: ['img'],
    visit(node, ctx) {
      if (!node.properties?.loading) {
        ctx.setProperty(node, 'loading', 'lazy');
      }
      if (!node.properties?.decoding) {
        ctx.setProperty(node, 'decoding', 'async');
      }
    },
  },
};
