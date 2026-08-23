const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 256 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

function zipError(message) {
  const error = new Error(message);
  error.code = 'DOCUMENT_ARCHIVE_UNSAFE';
  return error;
}

function dosTimestamp(date, time) {
  if (!date) return '';
  const year = 1980 + ((date >> 9) & 0x7f);
  const month = (date >> 5) & 0x0f;
  const day = date & 0x1f;
  const hour = (time >> 11) & 0x1f;
  const minute = (time >> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  if (!month || !day) return '';
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

export function inspectZip(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 22) throw zipError('Invalid archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Math.max(0, bytes.byteLength - 65557);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw zipError('Invalid archive directory.');
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries || entries === 0xffff || centralOffset === 0xffffffff) {
    throw zipError('Multi-disk and ZIP64 archives are not supported.');
  }
  if ((entries < 1 && options.allowEmpty !== true) || entries > MAX_ENTRIES || centralOffset + centralSize > eocd) {
    throw zipError('Archive directory exceeds the preview limits.');
  }

  let offset = centralOffset;
  let total = 0;
  let totalCompressed = 0;
  const items = [];
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw zipError('Invalid archive entry.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const modifiedTime = view.getUint16(offset + 12, true);
    const modifiedDate = view.getUint16(offset + 14, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    if (flags & 1) throw zipError('Encrypted archives are not supported.');
    if (uncompressed > MAX_ENTRY_UNCOMPRESSED) throw zipError('An archive entry is too large.');
    if (compressed > 0 && uncompressed > 1024 * 1024 && uncompressed / compressed > MAX_COMPRESSION_RATIO) {
      throw zipError('Archive compression ratio exceeds the preview limit.');
    }
    total += uncompressed;
    totalCompressed += compressed;
    if (total > MAX_TOTAL_UNCOMPRESSED) throw zipError('Expanded archive content exceeds the preview limit.');
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw zipError('Invalid archive entry bounds.');
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const normalized = name.replace(/\\/g, '/');
    if (!normalized || /[\u0000-\u001f\u007f]/.test(normalized) || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized) || normalized.split('/').some((part) => part === '..')) {
      throw zipError('Unsafe archive path.');
    }
    const directory = normalized.endsWith('/') || Boolean(externalAttributes & 0x10);
    items.push(Object.freeze({
      path: normalized,
      directory,
      compressedBytes: compressed,
      uncompressedBytes: uncompressed,
      method,
      modified: dosTimestamp(modifiedDate, modifiedTime)
    }));
    offset = end;
  }
  if (offset !== centralOffset + centralSize) throw zipError('Invalid archive directory size.');
  return Object.freeze({
    entries,
    totalCompressedBytes: totalCompressed,
    totalUncompressedBytes: total,
    items: Object.freeze(items)
  });
}
