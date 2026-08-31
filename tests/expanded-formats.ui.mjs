import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { requireHostTests, resolveHostClient } from './support/host-client.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const hostClient = resolveHostClient(repositoryRoot);
const packageVersion = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')).version;
const artifact = process.env.BOBOCLOUD_PLUGIN_ARTIFACT || path.join(repositoryRoot, 'artifacts', `bobocloud.document-preview-${packageVersion}.boboplugin`);
const hostAvailable = existsSync(path.join(hostClient, 'main', 'plugins.js'))
  && existsSync(path.join(hostClient, 'node_modules', 'electron'))
  && existsSync(artifact);
requireHostTests(hostAvailable, 'Document preview Electron UI integration');

function electronPath() {
  const executable = process.platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(hostClient, 'node_modules', 'electron', 'dist', executable);
}

function makeDocx() {
  const entries = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly Report</w:t></w:r></w:p><w:p><w:r><w:t>BOBOCloud document preview is ready.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Format</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>DOCX</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Supported</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>'
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)]))));
}

function makeBmp(width = 640, height = 360) {
  const rowSize = Math.ceil(width * 3 / 4) * 4;
  const imageSize = rowSize * height;
  const output = Buffer.alloc(54 + imageSize);
  output.write('BM', 0, 'ascii');
  output.writeUInt32LE(output.length, 2);
  output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(width, 18);
  output.writeInt32LE(height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(24, 28);
  output.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = 54 + y * rowSize + x * 3;
      output[offset] = Math.round(255 * x / width);
      output[offset + 1] = Math.round(255 * y / height);
      output[offset + 2] = x < width / 2 ? 48 : 230;
    }
  }
  return output;
}

async function createWorkspace(root) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'report.docx'), makeDocx());
  await writeFile(path.join(root, 'diagram.bmp'), makeBmp());
  await writeFile(path.join(root, 'analysis.ipynb'), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      { id: 'intro', cell_type: 'markdown', metadata: {}, source: ['# Notebook preview\n', '<script>window.parent.__unsafe = true</script>'] },
      {
        id: 'run', cell_type: 'code', metadata: {}, execution_count: 7, source: ['print("ready")'],
        outputs: [{ output_type: 'display_data', metadata: {}, data: { 'text/html': '<b>Rendered output</b><script>unsafe()</script>' } }]
      }
    ]
  }, null, 2));
  await writeFile(path.join(root, 'bundle.zip'), Buffer.from(zipSync({
    'docs/': new Uint8Array(),
    'docs/readme.txt': strToU8('Archive preview'),
    'bin/tool.js': strToU8('console.log("ready")')
  })));
}

async function activeDocumentFrame(page) {
  const iframe = page.locator('#document-view-host iframe.document-view-frame:not([hidden])').last();
  await iframe.waitFor({ state: 'visible', timeout: 20_000 });
  const handle = await iframe.elementHandle();
  const frame = await handle.contentFrame();
  assert.ok(frame, 'active document iframe should have a content frame');
  return { iframe, frame };
}

async function openDocument(page, workspace, name) {
  await page.evaluate(({ filePath, fileName }) => window.BOBO.workspace.openFile(filePath, fileName), {
    filePath: path.join(workspace, name),
    fileName: name
  });
  return activeDocumentFrame(page);
}

async function stop(app) {
  if (!app) return;
  try { await app.evaluate(({ app: electronApp }) => electronApp.exit(0)); } catch (_) {}
}

test('expanded formats render in isolated document views', { skip: !hostAvailable, timeout: 120_000 }, async (t) => {
  const hostRequire = createRequire(path.join(hostClient, 'package.json'));
  const { _electron: electron } = hostRequire('playwright');
  const { createPluginController } = hostRequire('./main/plugins.js');
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'bobo-document-preview-expanded-'));
  const workspace = path.join(sandbox, 'workspace');
  const appData = path.join(sandbox, 'appdata');
  const home = path.join(sandbox, 'home');
  const evidence = path.join(repositoryRoot, 'test-results');
  await createWorkspace(workspace);
  await Promise.all([mkdir(appData, { recursive: true }), mkdir(home, { recursive: true }), mkdir(evidence, { recursive: true })]);
  let app;
  t.after(async () => {
    await stop(app);
    await rm(sandbox, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  });

  app = await electron.launch({
    executablePath: electronPath(),
    cwd: hostClient,
    args: ['.', '--user-data-dir=' + path.join(sandbox, 'chromium')],
    env: {
      ...process.env,
      APPDATA: appData,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(sandbox, 'xdg-config'),
      BOBO_FORCE_FIRST_RUN: '0',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.waitForFunction(() => document.documentElement.dataset.boboReady === 'true' && window.BOBO.documentViews, null, { timeout: 25_000 });
  await page.evaluate(async (workspacePath) => {
    const opened = await window.api.pickWorkspace(workspacePath);
    await window.BOBO.workspace.applyWorkspace(opened.rootPath, opened.tree, opened.workspaceIdentity, opened.leaveToken);
  }, workspace);

  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  const installer = createPluginController({
    app: { getPath: () => userData, getVersion: () => '2.6.1' },
    ipcMain: { handle() {} },
    getWindow: () => null,
    getWorkspaceIdentity: () => ({ rootPath: workspace, workspaceIdentity: 1 }),
    hostVersion: '2.6.1'
  });
  await installer.installArchiveFromPath(artifact);
  await page.evaluate(async (id) => {
    await window.api.plugins.refresh();
    await window.api.plugins.enable(id);
  }, 'bobocloud.document-preview');
  await page.waitForFunction(() => Boolean(window.BOBO.documentViews.find('report.docx')), null, { timeout: 20_000 });

  let active = await openDocument(page, workspace, 'report.docx');
  await active.frame.waitForFunction(() => document.querySelector('.word-preview, .preview-state.error'), null, { timeout: 30_000 });
  const wordFailure = active.frame.locator('.preview-state.error');
  if (await wordFailure.count()) {
    const message = await wordFailure.getAttribute('title') || await wordFailure.innerText() || 'Word preview failed';
    const workerSource = await readFile(path.join(repositoryRoot, 'dist', 'docx-worker.js'), 'utf8');
    const wordBytes = await readFile(path.join(workspace, 'report.docx'));
    const diagnostic = await active.frame.evaluate(({ source, base64 }) => new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const finish = (value) => { worker.terminate(); URL.revokeObjectURL(url); resolve(value); };
      worker.onmessage = (event) => finish(event.data);
      worker.onerror = (event) => finish({ workerError: event.message || 'unknown' });
      worker.postMessage({ buffer: bytes.buffer }, [bytes.buffer]);
    }), { source: workerSource, base64: wordBytes.toString('base64') });
    assert.fail(`${message}; worker: ${JSON.stringify(diagnostic)}; page errors: ${pageErrors.join(' | ') || 'none'}`);
  }
  await active.frame.locator('.word-preview').waitFor({ state: 'visible' });
  assert.match(await active.frame.locator('.word-preview').innerText(), /Quarterly Report[\s\S]*Supported/);
  assert.equal(await active.frame.locator('.word-preview script,.word-preview iframe,.word-preview object,.word-preview embed').count(), 0);
  assert.equal(await active.iframe.getAttribute('sandbox'), 'allow-scripts');
  assert.deepEqual(await active.frame.evaluate(() => ({ api: typeof window.api, bobo: typeof window.BOBO, origin: location.origin })), {
    api: 'undefined', bobo: 'undefined', origin: 'null'
  });
  await page.screenshot({ path: path.join(evidence, 'expanded-word.png') });

  active = await openDocument(page, workspace, 'diagram.bmp');
  await active.frame.waitForFunction(() => document.querySelector('.image-surface img, .preview-state.error'), null, { timeout: 20_000 });
  const imageFailure = active.frame.locator('.preview-state.error');
  if (await imageFailure.count()) assert.fail(await imageFailure.getAttribute('title') || await imageFailure.innerText() || 'Image preview failed');
  const image = active.frame.locator('.image-surface img');
  await image.waitFor({ state: 'visible', timeout: 20_000 });
  assert.deepEqual(await image.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight })), { width: 640, height: 360 });
  assert.match(await active.frame.locator('.image-meta').innerText(), /640 x 360/);
  await page.screenshot({ path: path.join(evidence, 'expanded-image.png') });

  active = await openDocument(page, workspace, 'analysis.ipynb');
  await active.frame.locator('.notebook-cell').first().waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await active.frame.locator('.notebook-cell').count(), 2);
  assert.match(await active.frame.locator('.notebook-cells').innerText(), /Notebook preview[\s\S]*Rendered output/);
  assert.equal(await active.frame.locator('.notebook-cells script').count(), 0);
  await page.screenshot({ path: path.join(evidence, 'expanded-notebook.png') });

  active = await openDocument(page, workspace, 'bundle.zip');
  await active.frame.locator('.grid-value').first().waitFor({ state: 'visible', timeout: 20_000 });
  assert.match(await active.frame.locator('.data-grid-viewport').innerText(), /docs\/readme\.txt/);
  assert.match(await active.frame.locator('.data-meta').innerText(), /3/);
  await page.screenshot({ path: path.join(evidence, 'expanded-archive.png') });

  assert.deepEqual(pageErrors, []);
});
