import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { requireHostTests, resolveHostClient } from './support/host-client.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const hostClient = resolveHostClient(repositoryRoot);
const packageVersion = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')).version;
const defaultArtifact = path.join(repositoryRoot, 'artifacts', `bobocloud.document-preview-${packageVersion}.boboplugin`);
const artifact = process.env.BOBOCLOUD_PLUGIN_ARTIFACT || (existsSync(defaultArtifact) ? defaultArtifact : '');
const hostAvailable = Boolean(hostClient && artifact && existsSync(artifact));
requireHostTests(hostAvailable, 'Document preview host integration');

test('the real archive installs and reads through the API 1.3 document broker', { skip: !hostAvailable }, async (t) => {
  const require = createRequire(import.meta.url);
  const { createPluginController } = require(path.join(hostClient, 'main', 'plugins.js'));
  const root = await mkdtemp(path.join(os.tmpdir(), 'bobocloud-document-preview-host-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspaceRoot = path.join(root, 'workspace');
  await mkdir(workspaceRoot);
  const samplePath = path.join(workspaceRoot, 'sample.pdf');
  await writeFile(samplePath, Buffer.from('%PDF-1.7\npreview-test\n'));
  const handlers = new Map();
  const sender = { id: 41, once() {}, isDestroyed: () => false, send() {} };
  const workspace = { rootPath: workspaceRoot, workspaceIdentity: 7 };
  const controller = createPluginController({
    app: { getPath: () => root, getVersion: () => '2.6.1' },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openPath: async () => '' },
    getWindow: () => ({ isDestroyed: () => false, webContents: sender }),
    getWorkspaceIdentity: () => ({ ...workspace }),
    resolveWorkspaceFile(candidate) {
      const filePath = path.resolve(candidate);
      const relative = path.relative(workspaceRoot, filePath);
      if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('outside workspace');
      return { filePath, workspaceIdentity: workspace.workspaceIdentity };
    }
  });
  controller.registerIpc();
  await controller.initialize();

  const installed = await controller.installArchiveFromPath(path.resolve(artifact));
  assert.equal(installed.id, 'bobocloud.document-preview');
  assert.deepEqual(installed.grantedPermissions, ['documentViews.register', 'documents.read']);
  await controller.setEnabled(installed.id, true);

  for (const kind of ['markdown', 'csv', 'excel', 'pdf', 'word', 'image', 'notebook', 'archive']) {
    const viewerId = `bobocloud.document-preview.${kind}`;
    const loaded = await controller.loadDocumentView(installed.id, viewerId);
    assert.match(loaded.entry.source, /activate/);
    assert.equal(JSON.stringify(loaded).includes(root), false);
    const authorized = await controller.rpc(installed.id, 'documentViews.register', { id: viewerId, title: kind });
    assert.equal(authorized.authorized, true);
    assert.equal(authorized.method, 'documentViews.register');
    assert.equal(authorized.permission, 'documentViews.register');
    assert.deepEqual(authorized.viewer, { ...loaded.viewer, title: kind });
  }

  const event = { sender };
  const opened = await handlers.get('plugins:document-open')(event, {
    pluginId: installed.id,
    viewerId: 'bobocloud.document-preview.pdf',
    filePath: samplePath
  });
  assert.equal(opened.name, 'sample.pdf');
  assert.equal(JSON.stringify(opened).includes(workspaceRoot), false);
  const chunk = await handlers.get('plugins:document-read')(event, { documentId: opened.documentId, offset: 0, length: 8 });
  assert.equal(Buffer.from(chunk.data).toString('utf8'), '%PDF-1.7');
  assert.deepEqual(await handlers.get('plugins:document-close')(event, { documentId: opened.documentId }), { closed: true });
});
