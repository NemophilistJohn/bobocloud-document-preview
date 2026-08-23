import readExcelFile from 'read-excel-file/browser';
import { normalizeCell } from './shared/encoding.js';
import { inspectZip } from './shared/zip-safety.js';
import { createShell, previewError, searchControl, showPreviewError, showStatus, t } from './shared/ui.js';
import { createVirtualGrid, columnLabel } from './shared/virtual-grid.js';

const MAX_EXCEL_BYTES = 40 * 1024 * 1024;
const MAX_ROWS = 50000;
const MAX_COLUMNS = 512;
const MAX_CELLS = 1000000;

function sheetData(worksheet) {
  const sourceRows = Array.isArray(worksheet.data) ? worksheet.data : [];
  const rowLimit = Math.min(sourceRows.length, MAX_ROWS);
  const sourceColumnCount = sourceRows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
  const columnLimit = Math.min(sourceColumnCount, MAX_COLUMNS);
  const rows = [];
  let cells = 0;
  let truncated = sourceRows.length > rowLimit || sourceColumnCount > columnLimit;
  for (let rowIndex = 0; rowIndex < rowLimit; rowIndex += 1) {
    const sourceRow = Array.isArray(sourceRows[rowIndex]) ? sourceRows[rowIndex] : [];
    const row = [];
    for (let columnIndex = 0; columnIndex < Math.min(sourceRow.length, columnLimit); columnIndex += 1) {
      if (cells >= MAX_CELLS) {
        truncated = true;
        break;
      }
      row[columnIndex] = normalizeCell(sourceRow[columnIndex]);
      cells += 1;
    }
    rows.push(row);
    if (cells >= MAX_CELLS) break;
  }
  return { rows, columns: Math.max(1, columnLimit), truncated, cells };
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'Excel preview' });
  showStatus(shell.body, context, 'Loading document...');
  let grid = null;
  try {
    if (context.document.size > MAX_EXCEL_BYTES) throw previewError('Excel file exceeds 40 MiB.');
    const bytes = await context.readAll(MAX_EXCEL_BYTES);
    inspectZip(bytes);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const worksheets = await readExcelFile(buffer);
    if (!worksheets.length) {
      showStatus(shell.body, context, 'Empty workbook');
      return () => shell.dispose();
    }

    const cache = new Map();
    const sheetsData = worksheets.map((worksheet, index) => ({
      id: index + 1,
      name: String(worksheet.sheet || `Sheet ${index + 1}`),
      data: worksheet.data
    }));
    let active = sheetsData[0];
    let query = '';
    const content = document.createElement('section');
    content.className = 'data-view workbook-view';
    const sheets = document.createElement('div');
    sheets.className = 'sheet-tabs';
    sheets.setAttribute('role', 'tablist');
    const meta = document.createElement('div');
    meta.className = 'data-meta';
    const gridHost = document.createElement('div');
    gridHost.className = 'data-grid-host';
    content.append(sheets, meta, gridHost);
    shell.body.replaceChildren(content);

    function getData(sheet) {
      if (!cache.has(sheet.id)) cache.set(sheet.id, sheetData(sheet));
      return cache.get(sheet.id);
    }

    function refresh() {
      const data = getData(active);
      const needle = query.trim().toLocaleLowerCase();
      const rows = needle ? data.rows.filter((row) => row.some((cell) => String(cell || '').toLocaleLowerCase().includes(needle))) : data.rows;
      meta.textContent = t(context, data.truncated ? 'Rows: {count} (limited)' : 'Rows: {count}', { count: rows.length });
      grid.update({ rows, columns: data.columns, header: Array.from({ length: data.columns }, (_, index) => columnLabel(index)) });
      for (const button of sheets.children) {
        const selected = Number(button.dataset.sheetId) === active.id;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      }
    }

    const first = getData(active);
    grid = createVirtualGrid(gridHost, {
      rows: first.rows,
      columns: first.columns,
      header: Array.from({ length: first.columns }, (_, index) => columnLabel(index))
    });
    for (const worksheet of sheetsData) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sheet-tab';
      button.dataset.sheetId = String(worksheet.id);
      button.textContent = worksheet.name;
      button.title = worksheet.name;
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => {
        active = worksheet;
        refresh();
      });
      sheets.append(button);
    }
    const search = searchControl(context, (value) => {
      query = value;
      refresh();
    });
    shell.controls.prepend(search.wrapper);
    refresh();
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }
  return () => {
    if (grid) grid.dispose();
    shell.dispose();
  };
}

export { sheetData };
