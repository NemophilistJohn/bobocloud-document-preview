import { fitImageScale, imageMimeType } from './shared/image-format.js';
import { createShell, humanFileSize, iconButton, previewError, showPreviewError, showStatus, t } from './shared/ui.js';

const MAX_IMAGE_BYTES = 48 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 100_000_000;

function waitForImage(image) {
  if (image.complete) {
    return image.naturalWidth ? Promise.resolve() : Promise.reject(new Error('Image decoding failed.'));
  }
  return new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', () => reject(new Error('Image decoding failed.')), { once: true });
  });
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'Image preview' });
  showStatus(shell.body, context, 'Loading document...');
  let objectUrl = '';
  let resizeObserver = null;
  let localeSubscription = null;
  try {
    if (context.document.size > MAX_IMAGE_BYTES) throw previewError('Image file exceeds 48 MiB.');
    const mimeType = imageMimeType(context.document.extension);
    if (!mimeType) throw new Error('Unsupported image format.');
    const bytes = await context.readAll(MAX_IMAGE_BYTES);
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));

    const content = document.createElement('section');
    content.className = 'image-view';
    const meta = document.createElement('div');
    meta.className = 'document-meta image-meta';
    const stage = document.createElement('div');
    stage.className = 'image-stage';
    const inner = document.createElement('div');
    inner.className = 'image-stage-inner';
    const surface = document.createElement('div');
    surface.className = 'image-surface';
    const image = document.createElement('img');
    image.alt = context.document.name;
    image.src = objectUrl;
    surface.append(image);
    inner.append(surface);
    stage.append(inner);
    content.append(meta, stage);
    shell.body.replaceChildren(content);
    await waitForImage(image);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
      throw previewError('Image dimensions exceed preview limits.');
    }

    let rotation = 0;
    let scale = 1;
    let fitted = true;
    const zoomLabel = document.createElement('button');
    zoomLabel.type = 'button';
    zoomLabel.className = 'zoom-label';
    zoomLabel.dataset.i18nTitle = 'Reset zoom';
    zoomLabel.title = t(context, 'Reset zoom');

    function refreshMeta() {
      meta.textContent = t(context, '{width} x {height} pixels | {size}', {
        width: image.naturalWidth,
        height: image.naturalHeight,
        size: humanFileSize(context.document.size)
      });
    }
    function update() {
      const rotated = rotation % 180 !== 0;
      const width = (rotated ? image.naturalHeight : image.naturalWidth) * scale;
      const height = (rotated ? image.naturalWidth : image.naturalHeight) * scale;
      surface.style.width = Math.max(1, Math.round(width)) + 'px';
      surface.style.height = Math.max(1, Math.round(height)) + 'px';
      image.style.width = Math.max(1, Math.round(image.naturalWidth * scale)) + 'px';
      image.style.height = Math.max(1, Math.round(image.naturalHeight * scale)) + 'px';
      image.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
      inner.style.width = Math.max(stage.clientWidth, width + 48) + 'px';
      inner.style.height = Math.max(stage.clientHeight, height + 48) + 'px';
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }
    function fit() {
      scale = fitImageScale(image.naturalWidth, image.naturalHeight, Math.max(1, stage.clientWidth - 48), Math.max(1, stage.clientHeight - 48), rotation);
      fitted = true;
      update();
    }
    function zoom(multiplier) {
      fitted = false;
      scale = Math.min(8, Math.max(0.05, scale * multiplier));
      update();
    }

    const fitButton = iconButton(context, 'Maximize2', 'Fit to window', fit);
    const zoomOut = iconButton(context, 'ZoomOut', 'Zoom out', () => zoom(0.8));
    const zoomIn = iconButton(context, 'ZoomIn', 'Zoom in', () => zoom(1.25));
    const rotate = iconButton(context, 'RotateCw', 'Rotate clockwise', () => {
      rotation = (rotation + 90) % 360;
      if (fitted) fit(); else update();
    });
    zoomLabel.addEventListener('click', () => {
      fitted = false;
      scale = 1;
      update();
    });
    shell.controls.append(fitButton, zoomOut, zoomLabel, zoomIn, rotate);
    localeSubscription = context.i18n.onDidChange(refreshMeta);
    resizeObserver = new ResizeObserver(() => { if (fitted) fit(); else update(); });
    resizeObserver.observe(stage);
    refreshMeta();
    fit();
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }
  return () => {
    if (resizeObserver) resizeObserver.disconnect();
    if (localeSubscription) localeSubscription.dispose();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    shell.dispose();
  };
}
