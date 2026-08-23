import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
for (const directory of ['dist', 'package', 'artifacts']) {
  await rm(path.join(root, directory), { recursive: true, force: true });
}
