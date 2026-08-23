import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createShell, iconButton, previewError, searchControl, showPreviewError, showStatus, t } from './shared/ui.js';

const MAX_PDF_BYTES = 64 * 1024 * 1024;
const MAX_SEARCH_PAGES = 500;
const MAX_CANVAS_PIXELS = 16000000;

function renderTextLayer(container, textContent, viewport, query) {
  container.replaceChildren();
  const needle = query.trim().toLocaleLowerCase();
  for (const item of textContent.items || []) {
    if (!item || typeof item.str !== 'string' || !item.str) continue;
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(transform[2], transform[3]);
    const angle = Math.atan2(transform[1], transform[0]);
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = transform[4] + 'px';
    span.style.top = (transform[5] - fontHeight) + 'px';
    span.style.fontSize = fontHeight + 'px';
    span.style.transform = angle ? `rotate(${angle}rad)` : '';
    span.classList.toggle('search-hit', Boolean(needle && item.str.toLocaleLowerCase().includes(needle)));
    container.append(span);
  }
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'PDF preview' });
  showStatus(shell.body, context, 'Loading document...');
  let loadingTask = null;
  let pdf = null;
  let renderTask = null;
  let pageNumber = 1;
  let scale = 1.25;
  let rotation = 0;
  let query = '';
  const textCache = new Map();

  try {
    if (context.document.size > MAX_PDF_BYTES) throw previewError('PDF file exceeds 64 MiB.');
    const bytes = await context.readAll(MAX_PDF_BYTES);
    pdfjsLib.GlobalWorkerOptions.workerSrc = context.assets.url('dist/pdf.worker.min.mjs');
    loadingTask = pdfjsLib.getDocument({
      data: bytes,
      isEvalSupported: false,
      enableXfa: false,
      useWasm: false,
      useSystemFonts: true,
      stopEvent: true
    });
    pdf = await loadingTask.promise;

    const content = document.createElement('section');
    content.className = 'pdf-view';
    const stage = document.createElement('div');
    stage.className = 'pdf-stage';
    const pageSurface = document.createElement('div');
    pageSurface.className = 'pdf-page';
    const canvas = document.createElement('canvas');
    const textLayer = document.createElement('div');
    textLayer.className = 'pdf-text-layer';
    pageSurface.append(canvas, textLayer);
    stage.append(pageSurface);
    content.append(stage);
    shell.body.replaceChildren(content);

    const pageInput = document.createElement('input');
    pageInput.className = 'page-input';
    pageInput.type = 'number';
    pageInput.min = '1';
    pageInput.max = String(pdf.numPages);
    pageInput.value = '1';
    pageInput.setAttribute('aria-label', t(context, 'Page'));
    const pageTotal = document.createElement('span');
    pageTotal.className = 'page-total';
    pageTotal.textContent = '/ ' + pdf.numPages;
    const zoomLabel = document.createElement('button');
    zoomLabel.type = 'button';
    zoomLabel.className = 'zoom-label';
    zoomLabel.title = t(context, 'Reset zoom');

    async function pageText(number, page) {
      if (!textCache.has(number)) textCache.set(number, (page || await pdf.getPage(number)).getTextContent());
      return textCache.get(number);
    }

    async function renderPage() {
      if (renderTask) {
        try { renderTask.cancel(); } catch (_) {}
        renderTask = null;
      }
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale, rotation });
      const deviceScale = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, baseViewport.width * baseViewport.height)));
      canvas.width = Math.max(1, Math.floor(baseViewport.width * deviceScale));
      canvas.height = Math.max(1, Math.floor(baseViewport.height * deviceScale));
      canvas.style.width = Math.floor(baseViewport.width) + 'px';
      canvas.style.height = Math.floor(baseViewport.height) + 'px';
      pageSurface.style.width = Math.floor(baseViewport.width) + 'px';
      pageSurface.style.height = Math.floor(baseViewport.height) + 'px';
      const canvasContext = canvas.getContext('2d', { alpha: false });
      renderTask = page.render({
        canvasContext,
        viewport: baseViewport,
        transform: deviceScale === 1 ? null : [deviceScale, 0, 0, deviceScale, 0, 0]
      });
      try {
        await renderTask.promise;
      } catch (error) {
        if (!error || error.name !== 'RenderingCancelledException') throw error;
        return;
      } finally {
        renderTask = null;
      }
      const textContent = await pageText(pageNumber, page);
      renderTextLayer(textLayer, textContent, baseViewport, query);
      pageInput.value = String(pageNumber);
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    async function goToPage(value) {
      const next = Math.min(pdf.numPages, Math.max(1, Number(value) || 1));
      if (next === pageNumber) return;
      pageNumber = next;
      await renderPage();
    }

    async function findNext(direction) {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return;
      const limit = Math.min(pdf.numPages, MAX_SEARCH_PAGES);
      for (let step = 0; step < limit; step += 1) {
        const candidate = ((pageNumber - 1 + direction * step) % limit + limit) % limit + 1;
        const text = await pageText(candidate);
        if ((text.items || []).some((item) => String(item.str || '').toLocaleLowerCase().includes(needle))) {
          pageNumber = candidate;
          await renderPage();
          return;
        }
      }
    }

    const search = searchControl(context, (value) => {
      query = value;
      void renderPage();
    });
    search.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void findNext(event.shiftKey ? -1 : 1);
    });
    const previous = iconButton(context, 'ChevronLeft', 'Previous page', () => void goToPage(pageNumber - 1));
    const next = iconButton(context, 'ChevronRight', 'Next page', () => void goToPage(pageNumber + 1));
    const zoomOut = iconButton(context, 'ZoomOut', 'Zoom out', () => {
      scale = Math.max(0.5, Math.round((scale - 0.25) * 100) / 100);
      void renderPage();
    });
    const zoomIn = iconButton(context, 'ZoomIn', 'Zoom in', () => {
      scale = Math.min(3, Math.round((scale + 0.25) * 100) / 100);
      void renderPage();
    });
    const rotate = iconButton(context, 'RotateCw', 'Rotate clockwise', () => {
      rotation = (rotation + 90) % 360;
      void renderPage();
    });
    zoomLabel.addEventListener('click', () => {
      scale = 1.25;
      void renderPage();
    });
    pageInput.addEventListener('change', () => void goToPage(pageInput.value));
    shell.controls.append(search.wrapper, previous, pageInput, pageTotal, next, zoomOut, zoomLabel, zoomIn, rotate);
    await renderPage();
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }

  return async () => {
    if (renderTask) {
      try { renderTask.cancel(); } catch (_) {}
    }
    if (loadingTask) {
      try { await loadingTask.destroy(); } catch (_) {}
    }
    shell.dispose();
  };
}

export { renderTextLayer };
