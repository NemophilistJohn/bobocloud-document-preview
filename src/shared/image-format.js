const IMAGE_MIME_TYPES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
});

export function imageMimeType(extension) {
  return IMAGE_MIME_TYPES[String(extension || '').toLowerCase()] || '';
}

export function fitImageScale(width, height, viewportWidth, viewportHeight, rotation = 0) {
  const rotated = Math.abs(Number(rotation) || 0) % 180 === 90;
  const displayWidth = rotated ? height : width;
  const displayHeight = rotated ? width : height;
  if (![displayWidth, displayHeight, viewportWidth, viewportHeight].every((value) => Number.isFinite(value) && value > 0)) return 1;
  return Math.min(1, Math.max(0.05, Math.min(viewportWidth / displayWidth, viewportHeight / displayHeight)));
}
