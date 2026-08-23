import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const names = (await readdir(path.join(root, 'artifacts'))).filter((name) => name.endsWith('.boboplugin'));
assert.equal(names.length, 1, 'exactly one .boboplugin artifact is required');
const archive = await readFile(path.join(root, 'artifacts', names[0]));
const files = unzipSync(archive);
assert.ok(files['manifest.json'], 'manifest.json must be at archive root');
const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
assert.equal(manifest.schemaVersion, 2);
assert.deepEqual(manifest.permissions, ['documentViews.register', 'documents.read']);
assert.equal(Object.keys(files).some((name) => name.startsWith('node_modules/')), false);
const actualFiles = Object.keys(files).filter((name) => name !== 'manifest.json').sort();
assert.deepEqual(actualFiles, Object.keys(manifest.integrity.files).sort());
for (const name of actualFiles) {
  const digest = createHash('sha256').update(files[name]).digest('hex');
  assert.equal(digest, manifest.integrity.files[name], name + ' integrity mismatch');
}
process.stdout.write(`Verified ${names[0]} (${actualFiles.length} integrity-covered files)\n`);
