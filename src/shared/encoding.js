export function decodeText(bytes) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch (_) {
    try {
      return { text: new TextDecoder('gb18030', { fatal: false }).decode(bytes), encoding: 'GB18030' };
    } catch (_) {
      return { text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), encoding: 'UTF-8' };
    }
  }
}
export function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.formula === 'string') return '=' + value.formula;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (typeof value.text === 'string') return value.text;
    if (typeof value.hyperlink === 'string') return value.text || value.hyperlink;
    if (value.error) return String(value.error);
    if (value.result !== undefined) return normalizeCell(value.result);
  }
  return String(value);
}
