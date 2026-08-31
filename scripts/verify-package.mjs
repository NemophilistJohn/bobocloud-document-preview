import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const archiveName = `bobocloud.document-preview-${packageMetadata.version}.boboplugin`;
const archive = await readFile(path.join(root, 'artifacts', archiveName));
const files = unzipSync(archive);
assert.ok(files['manifest.json'], 'manifest.json must be at archive root');
const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
assert.equal(manifest.schemaVersion, 2);
assert.deepEqual(manifest.permissions, ['documentViews.register', 'documents.read']);
assert.equal(manifest.contributes.documentViewers.length, 8);
assert.deepEqual(new Set(manifest.contributes.documentViewers.map((viewer) => viewer.entry)), new Set([
  'dist/markdown-view.js', 'dist/csv-view.js', 'dist/excel-view.js', 'dist/pdf-view.js',
  'dist/docx-view.js', 'dist/image-view.js', 'dist/notebook-view.js', 'dist/archive-view.js'
]));
assert.ok(files['dist/docx-worker.js'], 'Word viewer worker must be packaged');
assert.equal(Object.keys(files).some((name) => name.startsWith('node_modules/')), false);
const actualFiles = Object.keys(files).filter((name) => name !== 'manifest.json').sort();
assert.deepEqual(actualFiles, Object.keys(manifest.integrity.files).sort());
for (const name of actualFiles) {
  const digest = createHash('sha256').update(files[name]).digest('hex');
  assert.equal(digest, manifest.integrity.files[name], name + ' integrity mismatch');
}
process.stdout.write(`Verified ${archiveName} (${actualFiles.length} integrity-covered files)\n`);
