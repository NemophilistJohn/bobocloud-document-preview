const ROW_HEIGHT = 30;
const COLUMN_WIDTH = 148;
const OVERSCAN = 6;

export function createVirtualGrid(container, options) {
  const viewport = document.createElement('div');
  viewport.className = 'data-grid-viewport';
  const surface = document.createElement('div');
  surface.className = 'data-grid-surface';
  viewport.append(surface);
  container.replaceChildren(viewport);

  let rows = options.rows || [];
  let columns = Math.max(1, options.columns || 1);
  let header = options.header || [];
  let columnWidths = options.columnWidths || [];
  let frame = 0;

  function widthAt(column) {
    const value = Number(columnWidths[column]);
    return Number.isFinite(value) && value >= 60 && value <= 600 ? value : COLUMN_WIDTH;
  }

  function offsetAt(column) {
    let offset = 54;
    for (let index = 0; index < column; index += 1) offset += widthAt(index);
    return offset;
  }

  function render() {
    frame = 0;
    const width = Math.max(viewport.clientWidth, offsetAt(columns));
    const height = Math.max(viewport.clientHeight, (rows.length + 1) * ROW_HEIGHT);
    surface.style.width = width + 'px';
    surface.style.height = height + 'px';

    const firstRow = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleRows = Math.ceil(viewport.clientHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const lastRow = Math.min(rows.length, firstRow + visibleRows);
    let firstColumn = 0;
    while (firstColumn < columns && offsetAt(firstColumn + 1) < viewport.scrollLeft) firstColumn += 1;
    firstColumn = Math.max(0, firstColumn - 2);
    let lastColumn = firstColumn;
    while (lastColumn < columns && offsetAt(lastColumn) < viewport.scrollLeft + viewport.clientWidth + 2 * COLUMN_WIDTH) lastColumn += 1;
    const fragment = document.createDocumentFragment();

    const corner = document.createElement('div');
    corner.className = 'grid-cell grid-corner';
    corner.style.transform = `translate(${viewport.scrollLeft}px, ${viewport.scrollTop}px)`;
    fragment.append(corner);

    for (let column = firstColumn; column < lastColumn; column += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grid-cell grid-header';
      cell.style.width = widthAt(column) + 'px';
      cell.style.transform = `translate(${offsetAt(column)}px, ${viewport.scrollTop}px)`;
      cell.textContent = header[column] || columnLabel(column);
      cell.title = cell.textContent;
      if (typeof options.onHeaderClick === 'function') cell.addEventListener('click', () => options.onHeaderClick(column));
      else cell.disabled = true;
      fragment.append(cell);
    }

    for (let rowIndex = firstRow; rowIndex < lastRow; rowIndex += 1) {
      const sourceRow = rows[rowIndex] || [];
      const marker = document.createElement('div');
      marker.className = 'grid-cell grid-row-number';
      marker.style.transform = `translate(${viewport.scrollLeft}px, ${(rowIndex + 1) * ROW_HEIGHT}px)`;
      marker.textContent = String(options.rowNumber ? options.rowNumber(rowIndex) : rowIndex + 1);
      fragment.append(marker);
      for (let column = firstColumn; column < lastColumn; column += 1) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell grid-value';
        cell.style.width = widthAt(column) + 'px';
        cell.style.transform = `translate(${offsetAt(column)}px, ${(rowIndex + 1) * ROW_HEIGHT}px)`;
        const value = sourceRow[column] == null ? '' : String(sourceRow[column]);
        cell.textContent = value;
        cell.title = value;
        fragment.append(cell);
      }
    }
    surface.replaceChildren(fragment);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  viewport.addEventListener('scroll', schedule, { passive: true });
  const observer = new ResizeObserver(schedule);
  observer.observe(viewport);
  render();

  return {
    viewport,
    update(next) {
      rows = next.rows || [];
      columns = Math.max(1, next.columns || columns);
      header = next.header || header;
      columnWidths = next.columnWidths || columnWidths;
      viewport.scrollTop = 0;
      schedule();
    },
    revealRow(index) {
      viewport.scrollTop = Math.max(0, index * ROW_HEIGHT);
      schedule();
    },
    dispose() {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    }
  };
}
export function columnLabel(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
