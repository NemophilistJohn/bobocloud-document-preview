import { embeddedImageSource, lockDownRenderedContent, sanitizeGeneratedHtml, sanitizeMarkdown } from './shared/document-html.js';
import { notebookText, parseNotebook } from './shared/notebook-parser.js';
import { createShell, previewError, searchControl, showPreviewError, showStatus, t } from './shared/ui.js';

const MAX_NOTEBOOK_BYTES = 24 * 1024 * 1024;
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

function appendRichHtml(container, html) {
  const content = document.createElement('div');
  content.className = 'notebook-rich-output rich-document';
  content.innerHTML = sanitizeGeneratedHtml(html);
  lockDownRenderedContent(content, { allowEmbeddedImages: true });
  container.append(content);
}

function appendText(container, value, className = 'notebook-output-text') {
  const text = notebookText(value).replace(ANSI_ESCAPE, '');
  if (!text) return false;
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = text;
  container.append(pre);
  return true;
}

function appendOutput(container, output) {
  if (output.outputType === 'stream') return appendText(container, output.text);
  if (output.outputType === 'error') return appendText(container, output.traceback.join('\n') || output.text, 'notebook-output-text error');
  const data = output.data || {};
  for (const mimeType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    if (data[mimeType]) {
      const source = embeddedImageSource(mimeType, notebookText(data[mimeType]));
      if (!source) continue;
      const image = document.createElement('img');
      image.className = 'notebook-output-image';
      image.alt = '';
      image.src = source;
      container.append(image);
      return true;
    }
  }
  if (data['text/html']) {
    appendRichHtml(container, notebookText(data['text/html']));
    return true;
  }
  if (data['text/markdown']) {
    appendRichHtml(container, sanitizeMarkdown(notebookText(data['text/markdown'])));
    return true;
  }
  if (data['application/json'] !== undefined) {
    const value = typeof data['application/json'] === 'string' ? data['application/json'] : JSON.stringify(data['application/json'], null, 2);
    return appendText(container, value);
  }
  return appendText(container, data['text/plain']);
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'Notebook preview' });
  showStatus(shell.body, context, 'Loading document...');
  let localeSubscription = null;
  try {
    if (context.document.size > MAX_NOTEBOOK_BYTES) throw previewError('Notebook file exceeds 24 MiB.');
    const notebook = parseNotebook(await context.readText(MAX_NOTEBOOK_BYTES, 'utf-8'));
    if (!notebook.cells.length) {
      showStatus(shell.body, context, 'Empty notebook');
      return () => shell.dispose();
    }

    const content = document.createElement('section');
    content.className = 'notebook-view';
    const meta = document.createElement('div');
    meta.className = 'document-meta';
    const cellsHost = document.createElement('div');
    cellsHost.className = 'notebook-cells';
    content.append(meta, cellsHost);
    shell.body.replaceChildren(content);

    const cellNodes = [];
    for (const cell of notebook.cells) {
      const section = document.createElement('section');
      section.className = `notebook-cell ${cell.cellType}`;
      const header = document.createElement('header');
      header.className = 'notebook-cell-header';
      const label = document.createElement('span');
      label.dataset.i18n = cell.cellType === 'code' ? 'Code' : cell.cellType === 'markdown' ? 'Markdown' : 'Raw';
      label.textContent = t(context, label.dataset.i18n);
      const execution = document.createElement('span');
      execution.className = 'notebook-execution';
      execution.textContent = cell.cellType === 'code' ? `In [${cell.executionCount || ' '}]:` : '';
      header.append(label, execution);
      const body = document.createElement('div');
      body.className = 'notebook-cell-body';
      if (cell.cellType === 'markdown') {
        body.classList.add('rich-document');
        body.innerHTML = sanitizeMarkdown(cell.source);
        lockDownRenderedContent(body, { allowEmbeddedImages: true });
      } else {
        const source = document.createElement('pre');
        source.className = 'notebook-source';
        source.textContent = cell.source;
        body.append(source);
      }
      section.append(header, body);

      if (cell.outputs.length) {
        const outputs = document.createElement('div');
        outputs.className = 'notebook-outputs';
        const outputLabel = document.createElement('div');
        outputLabel.className = 'notebook-output-label';
        outputLabel.dataset.i18n = 'Output';
        outputLabel.textContent = t(context, 'Output');
        outputs.append(outputLabel);
        let rendered = false;
        for (const output of cell.outputs) rendered = appendOutput(outputs, output) || rendered;
        if (!rendered) {
          const empty = document.createElement('div');
          empty.className = 'notebook-output-empty';
          empty.dataset.i18n = 'No previewable output';
          empty.textContent = t(context, 'No previewable output');
          outputs.append(empty);
        }
        section.append(outputs);
      }
      cellsHost.append(section);
      cellNodes.push({ section, text: `${cell.source}\n${cell.outputs.map((output) => output.text + '\n' + output.traceback.join('\n')).join('\n')}`.toLocaleLowerCase() });
    }

    let query = '';
    function refresh() {
      const needle = query.trim().toLocaleLowerCase();
      let visible = 0;
      for (const cell of cellNodes) {
        const show = !needle || cell.text.includes(needle);
        cell.section.classList.toggle('hidden', !show);
        if (show) visible += 1;
      }
      meta.textContent = t(context, notebook.truncated ? 'Cells: {count} of {total} (limited)' : 'Cells: {count}', {
        count: visible,
        total: notebook.totalCells
      });
    }
    const search = searchControl(context, (value) => {
      query = value;
      refresh();
    });
    shell.controls.prepend(search.wrapper);
    localeSubscription = context.i18n.onDidChange(refresh);
    refresh();
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }
  return () => {
    if (localeSubscription) localeSubscription.dispose();
    shell.dispose();
  };
}

export { appendOutput };
