import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { buildAll } from './build.mjs';

const root = path.resolve(import.meta.dirname, '..');
const packageRoot = path.join(root, 'package');
const artifacts = path.join(root, 'artifacts');

async function filesUnder(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) result.push(...await filesUnder(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result.sort();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixedZipMtime() {
  // ZIP stores local DOS date components. Constructing a UTC instant would
  // encode different metadata in different runner time zones.
  return new Date(2026, 0, 1, 0, 0, 0);
}

export function createDeterministicArchive(entries) {
  const names = Object.keys(entries).sort((left, right) => {
    if (left === 'manifest.json') return -1;
    if (right === 'manifest.json') return 1;
    return left.localeCompare(right);
  });
  const zipEntries = {};
  for (const name of names) zipEntries[name] = [entries[name], { mtime: fixedZipMtime() }];
  return Buffer.from(zipSync(zipEntries, { level: 9 }));
}

export async function packagePlugin() {
  await buildAll();
  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await mkdir(artifacts, { recursive: true });

  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const packageFiles = [
    ...await filesUnder(path.join(root, 'dist'), 'dist'),
    ...await filesUnder(path.join(root, 'language-packs'), 'language-packs')
  ].sort();
  const integrityFiles = {};
  for (const relative of packageFiles) integrityFiles[relative] = sha256(await readFile(path.join(root, relative)));
  manifest.integrity = { algorithm: 'sha256', files: integrityFiles };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(manifestPath, manifestBytes);
  await writeFile(path.join(packageRoot, 'manifest.json'), manifestBytes);

  const archiveEntries = { 'manifest.json': manifestBytes };
  for (const relative of packageFiles) {
    const source = await readFile(path.join(root, relative));
    const destination = path.join(packageRoot, ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, relative), destination);
    archiveEntries[relative] = source;
  }

  const archiveName = `${manifest.id}-${manifest.version}.boboplugin`;
  const archive = createDeterministicArchive(archiveEntries);
  const archivePath = path.join(artifacts, archiveName);
  await Promise.all([
    rm(archivePath, { force: true }),
    rm(archivePath + '.sha256', { force: true })
  ]);
  await writeFile(archivePath, archive);
  await writeFile(archivePath + '.sha256', sha256(archive) + '  ' + archiveName + '\n');
  process.stdout.write(`${archivePath}\nSHA-256 ${sha256(archive)}\n`);
  return { archivePath, sha256: sha256(archive), manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await packagePlugin();
