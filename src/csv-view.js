import { parseDelimited } from './shared/csv-parser.js';
import { decodeText } from './shared/encoding.js';
import { createShell, previewError, searchControl, showPreviewError, showStatus, t } from './shared/ui.js';
import { createVirtualGrid, columnLabel } from './shared/virtual-grid.js';

const MAX_CSV_BYTES = 32 * 1024 * 1024;
export async function activate(context) {
  const shell = createShell(context, { titleKey: 'CSV preview' });
  showStatus(shell.body, context, 'Loading document...');
  let grid = null;
  try {
    if (context.document.size > MAX_CSV_BYTES) throw previewError('CSV file exceeds 32 MiB.');
    const bytes = await context.readAll(MAX_CSV_BYTES);
    const decoded = decodeText(bytes);
    const parsed = parseDelimited(decoded.text, context.document.extension);
    if (!parsed.rows.length) {
      showStatus(shell.body, context, 'Empty document');
      return () => shell.dispose();
    }

    const header = parsed.rows[0];
    const sourceRows = parsed.rows.slice(1);
    const columns = Math.max(1, ...parsed.rows.map((row) => row.length));
    while (header.length < columns) header.push(columnLabel(header.length));
    let rows = sourceRows;
    let query = '';
    let sortColumn = -1;
    let sortDirection = 1;

    const content = document.createElement('section');
    content.className = 'data-view';
    const meta = document.createElement('div');
    meta.className = 'data-meta';
    meta.textContent = t(context, parsed.truncated ? 'Rows: {count} (limited)' : 'Rows: {count}', { count: sourceRows.length }) + ' | ' + decoded.encoding;
    content.append(meta);
    const gridHost = document.createElement('div');
    gridHost.className = 'data-grid-host';
    content.append(gridHost);
    shell.body.replaceChildren(content);

    function refresh() {
      const needle = query.trim().toLocaleLowerCase();
      rows = needle ? sourceRows.filter((row) => row.some((cell) => cell.toLocaleLowerCase().includes(needle))) : [...sourceRows];
      if (sortColumn >= 0) {
        rows.sort((left, right) => left[sortColumn]?.localeCompare(right[sortColumn] || '', undefined, { numeric: true, sensitivity: 'base' }) * sortDirection);
      }
      meta.textContent = t(context, parsed.truncated ? 'Rows: {count} (limited)' : 'Rows: {count}', { count: rows.length }) + ' | ' + decoded.encoding;
      grid.update({ rows, columns, header });
    }

    grid = createVirtualGrid(gridHost, {
      rows,
      columns,
      header,
      onHeaderClick(column) {
        if (sortColumn === column) sortDirection *= -1;
        else {
          sortColumn = column;
          sortDirection = 1;
        }
        refresh();
      }
    });
    const search = searchControl(context, (value) => {
      query = value;
      refresh();
    });
    shell.controls.prepend(search.wrapper);
  } catch (error) {
    showPreviewError(shell.body, context, error);
  }
  return () => {
    if (grid) grid.dispose();
    shell.dispose();
  };
}
