const MAX_CELLS = 1000;
const MAX_OUTPUTS_PER_CELL = 100;

export function notebookText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item == null ? '' : item)).join('');
  return String(value == null ? '' : value);
}

function normalizeOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  return {
    outputType: String(output.output_type || ''),
    name: String(output.name || ''),
    text: notebookText(output.text),
    traceback: Array.isArray(output.traceback) ? output.traceback.map((line) => String(line)).slice(0, 200) : [],
    data: output.data && typeof output.data === 'object' && !Array.isArray(output.data) ? output.data : {},
    executionCount: output.execution_count == null ? null : String(output.execution_count)
  };
}

export function parseNotebook(source) {
  const parsed = JSON.parse(String(source || ''));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.cells)) {
    throw new Error('Invalid Jupyter Notebook document.');
  }
  const cells = parsed.cells.slice(0, MAX_CELLS).map((cell, index) => {
    const value = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {};
    const cellType = value.cell_type === 'markdown' || value.cell_type === 'code' || value.cell_type === 'raw' ? value.cell_type : 'raw';
    const outputs = Array.isArray(value.outputs)
      ? value.outputs.slice(0, MAX_OUTPUTS_PER_CELL).map(normalizeOutput).filter(Boolean)
      : [];
    return {
      id: String(value.id || index + 1),
      cellType,
      source: notebookText(value.source),
      executionCount: value.execution_count == null ? null : String(value.execution_count),
      outputs
    };
  });
  return {
    nbformat: Number.isInteger(parsed.nbformat) ? parsed.nbformat : 0,
    cells,
    truncated: parsed.cells.length > cells.length,
    totalCells: parsed.cells.length
  };
}
