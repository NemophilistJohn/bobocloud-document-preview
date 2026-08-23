import { lockDownRenderedContent, sanitizeMarkdown } from './shared/document-html.js';
import { createShell, previewError, segmentedControl, showPreviewError, showStatus, t } from './shared/ui.js';

const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;

function safeId(value, used) {
  const base = String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff]+/g, '-').replace(/^-|-$/g, '') || 'section';
  let id = base;
  let sequence = 2;
  while (used.has(id)) id = base + '-' + sequence++;
  used.add(id);
  return id;
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'Markdown preview' });
  showStatus(shell.body, context, 'Loading document...');
  let outline = null;

  try {
    if (context.document.size > MAX_MARKDOWN_BYTES) throw previewError('Markdown file exceeds 8 MiB.');
    const source = await context.readText(MAX_MARKDOWN_BYTES, 'utf-8');
    if (!source.trim()) {
      showStatus(shell.body, context, 'Empty document');
      return () => shell.dispose();
    }

    const layout = document.createElement('div');
    layout.className = 'markdown-layout';
    const article = document.createElement('article');
    article.className = 'markdown-preview';
    article.innerHTML = sanitizeMarkdown(source);
    lockDownRenderedContent(article, { allowEmbeddedImages: true });
    const code = document.createElement('pre');
    code.className = 'markdown-source hidden';
    code.textContent = source;
    outline = document.createElement('nav');
    outline.className = 'markdown-outline hidden';
    outline.setAttribute('aria-label', t(context, 'Outline'));

    const used = new Set();
    for (const heading of article.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      heading.id = safeId(heading.textContent, used);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'outline-item level-' + heading.tagName.slice(1);
      item.textContent = heading.textContent;
      item.addEventListener('click', () => heading.scrollIntoView({ block: 'start' }));
      outline.append(item);
    }

    layout.append(outline, article, code);
    shell.body.replaceChildren(layout);
    const modes = segmentedControl(context, [
      { id: 'preview', labelKey: 'Preview' },
      { id: 'source', labelKey: 'Source' }
    ], 'preview', (mode) => {
      article.classList.toggle('hidden', mode !== 'preview');
      code.classList.toggle('hidden', mode !== 'source');
      outline.classList.toggle('hidden', mode !== 'preview' || outline.childElementCount === 0);
    });
    shell.controls.append(modes);
    outline.classList.toggle('hidden', outline.childElementCount === 0);
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }

  return () => shell.dispose();
}

export { sanitizeMarkdown };
