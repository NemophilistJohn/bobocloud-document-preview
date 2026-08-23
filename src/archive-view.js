import { inspectZip } from './shared/zip-safety.js';
import { createShell, humanFileSize, previewError, searchControl, showPreviewError, showStatus, t } from './shared/ui.js';
import { createVirtualGrid } from './shared/virtual-grid.js';

const MAX_ARCHIVE_BYTES = 96 * 1024 * 1024;

function compressionRatio(item) {
  if (!item.uncompressedBytes) return '-';
  return Math.max(0, Math.round((1 - item.compressedBytes / item.uncompressedBytes) * 100)) + '%';
}

export async function activate(context) {
  const shell = createShell(context, { titleKey: 'Archive preview' });
  showStatus(shell.body, context, 'Loading document...');
  let grid = null;
  let localeSubscription = null;
  try {
    if (context.document.size > MAX_ARCHIVE_BYTES) throw previewError('Archive file exceeds 96 MiB.');
    const archive = inspectZip(await context.readAll(MAX_ARCHIVE_BYTES), { allowEmpty: true });
    if (!archive.items.length) {
      showStatus(shell.body, context, 'Empty archive');
      return () => shell.dispose();
    }

    const content = document.createElement('section');
    content.className = 'data-view archive-view';
    const meta = document.createElement('div');
    meta.className = 'data-meta';
    const gridHost = document.createElement('div');
    gridHost.className = 'data-grid-host';
    content.append(meta, gridHost);
    shell.body.replaceChildren(content);

    let query = '';
    let sortColumn = 0;
    let sortDirection = 1;
    function visibleItems() {
      const needle = query.trim().toLocaleLowerCase();
      const values = needle ? archive.items.filter((item) => item.path.toLocaleLowerCase().includes(needle)) : [...archive.items];
      values.sort((left, right) => {
        const fields = [
          [left.path, right.path],
          [left.directory ? 0 : 1, right.directory ? 0 : 1],
          [left.compressedBytes, right.compressedBytes],
          [left.uncompressedBytes, right.uncompressedBytes],
          [compressionRatio(left), compressionRatio(right)]
        ];
        const [a, b] = fields[sortColumn] || fields[0];
        return (typeof a === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })) * sortDirection;
      });
      return values;
    }
    function refresh() {
      const items = visibleItems();
      const rows = items.map((item) => [
        item.path,
        t(context, item.directory ? 'Folder' : 'File'),
        humanFileSize(item.compressedBytes),
        humanFileSize(item.uncompressedBytes),
        compressionRatio(item)
      ]);
      meta.textContent = t(context, 'Entries: {count} | Expanded: {size}', { count: items.length, size: humanFileSize(archive.totalUncompressedBytes) });
      grid.update({
        rows,
        columns: 5,
        header: ['Path', 'Type', 'Compressed', 'Size', 'Ratio'].map((key) => t(context, key)),
        columnWidths: [360, 100, 130, 130, 90]
      });
    }
    grid = createVirtualGrid(gridHost, {
      rows: [],
      columns: 5,
      header: ['Path', 'Type', 'Compressed', 'Size', 'Ratio'].map((key) => t(context, key)),
      columnWidths: [360, 100, 130, 130, 90],
      onHeaderClick(column) {
        if (sortColumn === column) sortDirection *= -1;
        else { sortColumn = column; sortDirection = 1; }
        refresh();
      }
    });
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
    if (grid) grid.dispose();
    if (localeSubscription) localeSubscription.dispose();
    shell.dispose();
  };
}

export { compressionRatio };
