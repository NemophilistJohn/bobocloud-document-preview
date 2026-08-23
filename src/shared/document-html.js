import DOMPurify from 'dompurify';
import { marked } from 'marked';

const EMBEDDED_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon);base64,/i;
const FORBIDDEN_TAGS = ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'video', 'audio', 'canvas'];
const FORBIDDEN_ATTRIBUTES = ['style', 'srcdoc', 'autofocus', 'formaction'];

export function sanitizeGeneratedHtml(source) {
  return DOMPurify.sanitize(String(source || ''), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTRIBUTES
  });
}

export function sanitizeMarkdown(source) {
  const html = marked.parse(String(source || ''), { gfm: true, breaks: false, async: false });
  return sanitizeGeneratedHtml(html);
}

export function lockDownRenderedContent(root, options = {}) {
  for (const anchor of root.querySelectorAll('a[href]')) {
    anchor.title = anchor.getAttribute('href') || '';
    anchor.removeAttribute('href');
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
  }
  for (const image of root.querySelectorAll('img')) {
    const source = image.getAttribute('src') || '';
    image.removeAttribute('srcset');
    if (options.allowEmbeddedImages !== true || !EMBEDDED_IMAGE.test(source)) {
      image.replaceWith(document.createTextNode(image.alt || ''));
    }
  }
  return root;
}

export function embeddedImageSource(mimeType, base64) {
  const source = `data:${String(mimeType || '').toLowerCase()};base64,${String(base64 || '').replace(/\s+/g, '')}`;
  return EMBEDDED_IMAGE.test(source) ? source : '';
}
