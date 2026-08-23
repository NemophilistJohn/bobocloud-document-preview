import { lockDownRenderedContent, sanitizeGeneratedHtml } from './shared/document-html.js';
import { inspectZip } from './shared/zip-safety.js';
import { createShell, previewError, searchControl, showPreviewError, showStatus, t } from './shared/ui.js';

const MAX_DOCX_BYTES = 48 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 20_000;

function convertDocument(context, buffer) {
  const worker = new Worker(context.assets.url('dist/docx-worker.js'), { name: 'bobocloud-docx-preview' });
  let timer = null;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      worker.terminate();
      reject(previewError('Word document conversion timed out.'));
    }, CONVERSION_TIMEOUT_MS);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      const value = event.data || {};
      if (value.ok === true) resolve(value);
      else reject(new Error(value.message || 'Word conversion failed.'));
      worker.terminate();
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event && event.message || 'Word conversion failed.'));
    };
    worker.postMessage({ buffer }, [buffer]);
  });
  return { promise, dispose() { clearTimeout(timer); worker.terminate(); } };
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'Word preview' });
  showStatus(shell.body, context, 'Loading document...');
  let conversion = null;
  let localeSubscription = null;
  try {
    if (context.document.size > MAX_DOCX_BYTES) throw previewError('Word file exceeds 48 MiB.');
    const bytes = await context.readAll(MAX_DOCX_BYTES);
    inspectZip(bytes);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    conversion = convertDocument(context, buffer);
    const result = await conversion.promise;

    const content = document.createElement('section');
    content.className = 'word-view';
    const meta = document.createElement('div');
    meta.className = 'document-meta';
    const article = document.createElement('article');
    article.className = 'word-preview rich-document';
    article.innerHTML = sanitizeGeneratedHtml(result.html);
    lockDownRenderedContent(article, { allowEmbeddedImages: true });
    if (!article.textContent.trim() && !article.querySelector('img')) {
      showStatus(shell.body, context, 'Empty document');
      return () => shell.dispose();
    }
    content.append(meta, article);
    shell.body.replaceChildren(content);

    const searchable = Array.from(article.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,figcaption'));
    let query = '';
    function refreshMeta() {
      meta.textContent = result.warnings.length
        ? t(context, 'Conversion warnings: {count}', { count: result.warnings.length })
        : t(context, 'Read-only Word preview');
    }
    function refreshSearch() {
      const needle = query.trim().toLocaleLowerCase();
      let first = null;
      for (const node of searchable) {
        const match = Boolean(needle && node.textContent.toLocaleLowerCase().includes(needle));
        node.classList.toggle('search-hit-block', match);
        if (!first && match) first = node;
      }
      if (first) first.scrollIntoView({ block: 'center' });
    }
    const search = searchControl(context, (value) => {
      query = value;
      refreshSearch();
    });
    shell.controls.prepend(search.wrapper);
    localeSubscription = context.i18n.onDidChange(refreshMeta);
    refreshMeta();
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }
  return () => {
    if (conversion) conversion.dispose();
    if (localeSubscription) localeSubscription.dispose();
    shell.dispose();
  };
}

export { convertDocument };
