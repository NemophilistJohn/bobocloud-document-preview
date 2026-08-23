import mammoth from 'mammoth';

const MAX_EMBEDDED_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EMBEDDED_IMAGES_TOTAL = 16 * 1024 * 1024;
const MAX_HTML_BYTES = 16 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon']);

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

self.onmessage = async (event) => {
  const buffer = event.data && event.data.buffer;
  if (!(buffer instanceof ArrayBuffer)) {
    self.postMessage({ ok: false, message: 'Invalid Word document bytes.' });
    return;
  }
  let embeddedBytes = 0;
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      idPrefix: 'bobo-docx-',
      convertImage: mammoth.images.imgElement(async (image) => {
        const contentType = String(image.contentType || '').toLowerCase();
        if (!IMAGE_TYPES.has(contentType)) return { src: '' };
        const imageBuffer = await image.readAsArrayBuffer();
        if (imageBuffer.byteLength > MAX_EMBEDDED_IMAGE_BYTES || embeddedBytes + imageBuffer.byteLength > MAX_EMBEDDED_IMAGES_TOTAL) {
          return { src: '' };
        }
        embeddedBytes += imageBuffer.byteLength;
        return { src: `data:${contentType};base64,${bytesToBase64(imageBuffer)}` };
      })
    });
    if (new TextEncoder().encode(result.value).byteLength > MAX_HTML_BYTES) throw new Error('Converted Word document exceeds the preview limit.');
    self.postMessage({
      ok: true,
      html: result.value,
      warnings: (result.messages || []).slice(0, 100).map((item) => String(item && item.message || '')).filter(Boolean)
    });
  } catch (error) {
    self.postMessage({ ok: false, message: String(error && error.message || 'Word conversion failed.').slice(0, 1000) });
  }
};
