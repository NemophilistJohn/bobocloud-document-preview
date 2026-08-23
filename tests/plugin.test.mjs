import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { zipSync } from 'fflate';
import { decodeText, normalizeCell } from '../src/shared/encoding.js';
import { parseDelimited } from '../src/shared/csv-parser.js';
import { compressionRatio } from '../src/archive-view.js';
import { fitImageScale, imageMimeType } from '../src/shared/image-format.js';
import { notebookText, parseNotebook } from '../src/shared/notebook-parser.js';
import { inspectZip } from '../src/shared/zip-safety.js';

const root = path.resolve(import.meta.dirname, '..');

test('manifest grants only the isolated document-view capabilities', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.permissions, ['documentViews.register', 'documents.read']);
  assert.equal(manifest.engines.pluginApi, '^1.3.0');
  const viewers = manifest.contributes.documentViewers;
  assert.equal(viewers.length, 8);
  assert.deepEqual(new Set(viewers.flatMap((viewer) => viewer.extensions)), new Set([
    '.md', '.markdown', '.csv', '.tsv', '.xlsx', '.xlsm', '.xltx', '.pdf',
    '.docx', '.docm', '.dotx', '.dotm',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.ico',
    '.ipynb', '.zip', '.jar', '.war', '.ear', '.apk', '.whl', '.epub', '.vsix', '.nupkg'
  ]));
  assert.ok(viewers.every((viewer) => viewer.id.startsWith(manifest.id + '.')));
  const word = viewers.find((viewer) => viewer.id.endsWith('.word'));
  assert.deepEqual(word.resources, ['dist/view.css', 'dist/docx-worker.js']);
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

test('archive inspection exposes central-directory metadata and rejects traversal paths', () => {
  const safe = zipSync({
    'docs/': new Uint8Array(),
    'docs/readme.txt': new TextEncoder().encode('preview')
  });
  const archive = inspectZip(safe);
  assert.equal(archive.entries, 2);
  assert.deepEqual(archive.items.map((item) => item.path), ['docs/', 'docs/readme.txt']);
  assert.equal(archive.items[0].directory, true);
  assert.equal(archive.items[1].uncompressedBytes, 7);
  const unsafe = zipSync({ '../escape.xml': new TextEncoder().encode('x') });
  assert.throws(() => inspectZip(unsafe), /Unsafe archive path/);
});

test('image format helpers map safe MIME types and calculate rotation-aware fitting', () => {
  assert.equal(imageMimeType('.JPEG'), 'image/jpeg');
  assert.equal(imageMimeType('.svg'), '');
  assert.equal(fitImageScale(1200, 600, 600, 600), 0.5);
  assert.equal(fitImageScale(1200, 600, 600, 600, 90), 0.5);
  assert.equal(fitImageScale(600, 1200, 600, 300, 90), 0.5);
  assert.equal(fitImageScale(64, 48, 1000, 800), 1);
  assert.equal(compressionRatio({ compressedBytes: 22, uncompressedBytes: 20 }), '0%');
});

test('Jupyter parsing is data-only and normalizes cell and output sources', () => {
  const notebook = parseNotebook(JSON.stringify({
    nbformat: 4,
    cells: [
      { cell_type: 'markdown', source: ['# Title\n', 'Text'] },
      {
        cell_type: 'code',
        execution_count: 3,
        source: ['print("ready")'],
        outputs: [
          { output_type: 'stream', text: ['ready\n'] },
          { output_type: 'display_data', data: { 'text/html': '<script>unsafe()</script><b>safe</b>' } }
        ]
      }
    ]
  }));
  assert.equal(notebook.nbformat, 4);
  assert.equal(notebook.cells[0].source, '# Title\nText');
  assert.equal(notebook.cells[1].executionCount, '3');
  assert.equal(notebook.cells[1].outputs[0].text, 'ready\n');
  assert.equal(notebookText(['a', 'b']), 'ab');
});

test('view source contains no direct host, filesystem, or network bridge usage', async () => {
  const files = [
    'extension.js', 'markdown-view.js', 'csv-view.js', 'excel-view.js', 'pdf-view.js',
    'docx-view.js', 'docx-worker.js', 'image-view.js', 'notebook-view.js', 'archive-view.js'
  ];
  for (const file of files) {
    const source = await readFile(path.join(root, 'src', file), 'utf8');
    assert.doesNotMatch(source, /window\.api|window\.BOBO|ipcRenderer|node:fs|child_process|XMLHttpRequest|WebSocket|fetch\s*\(/, file);
  }
});

test('Word conversion dependency is exact and documented for redistribution', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.equal(packageJson.dependencies.mammoth, '1.12.1');
  assert.match(notices, /Mammoth\.js \| 1\.12\.1 \| BSD-2-Clause/);
});
