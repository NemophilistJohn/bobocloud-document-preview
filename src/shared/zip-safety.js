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
export function inspectZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 22) throw zipError('Invalid XLSX archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Math.max(0, bytes.byteLength - 65557);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw zipError('Invalid XLSX archive directory.');
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries || entries === 0xffff || centralOffset === 0xffffffff) {
    throw zipError('Multi-disk and ZIP64 XLSX archives are not supported.');
  }
  if (entries < 1 || entries > MAX_ENTRIES || centralOffset + centralSize > eocd) {
    throw zipError('XLSX archive directory exceeds the preview limits.');
  }

  let offset = centralOffset;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw zipError('Invalid XLSX archive entry.');
    }
    const flags = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (flags & 1) throw zipError('Encrypted XLSX archives are not supported.');
    if (uncompressed > MAX_ENTRY_UNCOMPRESSED) throw zipError('An XLSX archive entry is too large.');
    if (compressed > 0 && uncompressed > 1024 * 1024 && uncompressed / compressed > MAX_COMPRESSION_RATIO) {
      throw zipError('XLSX archive compression ratio exceeds the preview limit.');
    }
    total += uncompressed;
    if (total > MAX_TOTAL_UNCOMPRESSED) throw zipError('Expanded XLSX content exceeds the preview limit.');
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw zipError('Invalid XLSX archive entry bounds.');
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const normalized = name.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
      throw zipError('Unsafe XLSX archive path.');
    }
    offset = end;
  }
  if (offset !== centralOffset + centralSize) throw zipError('Invalid XLSX archive directory size.');
  return Object.freeze({ entries, totalUncompressedBytes: total });
}
