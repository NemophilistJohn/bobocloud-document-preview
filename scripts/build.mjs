import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const MAX_VIEW_FILE_BYTES = 8 * 1024 * 1024;

export async function buildAll() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: {
      extension: 'src/extension.js',
      'markdown-view': 'src/markdown-view.js',
      'csv-view': 'src/csv-view.js',
      'excel-view': 'src/excel-view.js',
      'pdf-view': 'src/pdf-view.js'
    },
    outdir: 'dist',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome130'],
    minify: true,
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': '"production"',
      global: 'globalThis'
    }
  });
  await cp(path.join(root, 'src', 'view.css'), path.join(dist, 'view.css'));
  await cp(path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'), path.join(dist, 'pdf.worker.min.mjs'));

  for (const fileName of ['markdown-view.js', 'csv-view.js', 'excel-view.js', 'pdf-view.js', 'pdf.worker.min.mjs', 'view.css']) {
    const info = await stat(path.join(dist, fileName));
    if (info.size > MAX_VIEW_FILE_BYTES) throw new Error(fileName + ' exceeds the 8 MiB document-view resource limit.');
  }
  return dist;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await buildAll();
