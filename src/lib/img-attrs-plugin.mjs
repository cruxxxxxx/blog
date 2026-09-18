/**
 * Sätteri hast plugin.
 *
 * Markdown images arrive as bare <img> tags — they point at R2, so Astro's
 * image pipeline never sees them. Add lazy-loading and async decoding so a
 * photo-heavy post does not fetch every frame at once.
 *
 * Videos arrive as plain links: Attachment Uploader writes `[clip.mp4](url)`
 * because .mp4 is not an image extension. Swap those for a <video> element.
 * bin/r2-media.sh uploads a poster frame beside every clip under the same
 * name, so the poster URL is derived rather than written into the note.
 */
const VIDEO_URL = /\.(mp4|webm|mov|m4v)$/i;

function isVideoUrl(value) {
  return typeof value === 'string' && VIDEO_URL.test(value.split('?')[0]);
}

function posterUrlFor(src) {
  return src.replace(/(\.[^.?]+)(\?.*)?$/, '-poster.webp$2');
}

function videoElement(src) {
  return {
    type: 'element',
    tagName: 'video',
    properties: {
      src,
      poster: posterUrlFor(src),
      controls: true,
      playsInline: true,
      // The poster carries the preview; bytes only move once someone hits play.
      preload: 'none',
    },
    children: [],
  };
}

export default {
  name: 'img-attrs',
  element: [
    {
      filter: ['img'],
      visit(node, ctx) {
        if (isVideoUrl(node.properties?.src)) {
          ctx.replaceNode(node, videoElement(node.properties.src));
          return;
        }
        if (!node.properties?.loading) {
          ctx.setProperty(node, 'loading', 'lazy');
        }
        if (!node.properties?.decoding) {
          ctx.setProperty(node, 'decoding', 'async');
        }
      },
    },
    {
      filter: ['a'],
      visit(node, ctx) {
        if (isVideoUrl(node.properties?.href)) {
          ctx.replaceNode(node, videoElement(node.properties.href));
        }
      },
    },
  ],
};
