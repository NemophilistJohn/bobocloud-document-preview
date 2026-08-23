import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { zipSync } from 'fflate';
import { decodeText, normalizeCell } from '../src/shared/encoding.js';
import { parseDelimited } from '../src/shared/csv-parser.js';
import { inspectZip } from '../src/shared/zip-safety.js';

const root = path.resolve(import.meta.dirname, '..');

test('manifest grants only the isolated document-view capabilities', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.permissions, ['documentViews.register', 'documents.read']);
  assert.equal(manifest.engines.pluginApi, '^1.3.0');
  const viewers = manifest.contributes.documentViewers;
  assert.equal(viewers.length, 4);
  assert.deepEqual(new Set(viewers.flatMap((viewer) => viewer.extensions)), new Set(['.md', '.markdown', '.csv', '.tsv', '.xlsx', '.xlsm', '.xltx', '.pdf']));
  assert.ok(viewers.every((viewer) => viewer.id.startsWith(manifest.id + '.')));
});
test('all plugin locales have identical keys and placeholders', async () => {
  const locales = {};
  for (const locale of ['en', 'zh-CN', 'ja']) {
    locales[locale] = JSON.parse(await readFile(path.join(root, 'language-packs', locale, 'messages.json'), 'utf8'));
  }
  const keys = Object.keys(locales.en).sort();
  for (const locale of ['zh-CN', 'ja']) assert.deepEqual(Object.keys(locales[locale]).sort(), keys);
  for (const key of keys) {
    const expected = [...locales.en[key].matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
    for (const locale of ['zh-CN', 'ja']) {
      assert.deepEqual([...locales[locale][key].matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort(), expected, `${locale}:${key}`);
    }
  }
});

test('CSV and TSV parsing preserves quoted delimiters and explicit tab separation', () => {
  const csv = parseDelimited('name,note\nAlice,"one,two"\nBob,three', '.csv');
  assert.deepEqual(csv.rows, [['name', 'note'], ['Alice', 'one,two'], ['Bob', 'three']]);
  assert.equal(csv.delimiter, ',');
  const tsv = parseDelimited('name\tnote\nA\tB', '.tsv');
  assert.deepEqual(tsv.rows, [['name', 'note'], ['A', 'B']]);
  assert.equal(tsv.delimiter, '\t');
});

test('text and spreadsheet values normalize without executing formulas', () => {
  assert.equal(decodeText(new TextEncoder().encode('hello')).text, 'hello');
  assert.equal(normalizeCell({ formula: 'SUM(A1:A2)', result: 7 }), '=SUM(A1:A2)');
  assert.equal(normalizeCell({ richText: [{ text: 'A' }, { text: 'B' }] }), 'AB');
});

test('XLSX ZIP inspection accepts a normal archive and rejects traversal metadata', () => {
  const safe = zipSync({ '[Content_Types].xml': new TextEncoder().encode('<Types/>') });
  assert.equal(inspectZip(safe).entries, 1);
  const unsafe = zipSync({ '../escape.xml': new TextEncoder().encode('x') });
  assert.throws(() => inspectZip(unsafe), /Unsafe XLSX archive path/);
});

test('view source contains no direct host, filesystem, or network bridge usage', async () => {
  const files = ['extension.js', 'markdown-view.js', 'csv-view.js', 'excel-view.js', 'pdf-view.js'];
  for (const file of files) {
    const source = await readFile(path.join(root, 'src', file), 'utf8');
    assert.doesNotMatch(source, /window\.api|window\.BOBO|ipcRenderer|node:fs|child_process|XMLHttpRequest|WebSocket|fetch\s*\(/, file);
  }
});
