import Papa from 'papaparse';

export const MAX_CSV_ROWS = 100000;
export const MAX_CSV_CELLS = 2000000;

export function parseDelimited(text, extension) {
  const rows = [];
  let cells = 0;
  let truncated = false;
  let delimiter = extension === '.tsv' ? '\t' : '';
  const errors = [];
  const result = Papa.parse(text, {
    delimiter,
    skipEmptyLines: 'greedy',
    step(value, parser) {
      const row = Array.isArray(value.data) ? value.data.map((cell) => String(cell == null ? '' : cell)) : [];
      if (rows.length >= MAX_CSV_ROWS || cells + row.length > MAX_CSV_CELLS) {
        truncated = true;
        parser.abort();
        return;
      }
      rows.push(row);
      cells += row.length;
      if (value.errors && value.errors.length && errors.length < 20) errors.push(...value.errors.slice(0, 20 - errors.length));
    }
  });
  delimiter = result && result.meta && result.meta.delimiter ? result.meta.delimiter : delimiter;
  return { rows, cells, truncated, delimiter, errors };
}
