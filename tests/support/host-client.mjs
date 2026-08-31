import { existsSync } from 'node:fs';
import path from 'node:path';

function isHostClient(candidate) {
  return Boolean(candidate && existsSync(path.join(candidate, 'main', 'plugins.js')));
}

export function resolveHostClient(repositoryRoot) {
  const configured = String(process.env.BOBOCLOUD_HOST_CLIENT || '').trim();
  if (configured) {
    const candidate = path.resolve(configured);
    return isHostClient(candidate) ? candidate : '';
  }
  return [
    path.resolve(repositoryRoot, '..', 'my-electron-app', 'client'),
    path.resolve(repositoryRoot, '..', 'client'),
    path.resolve(repositoryRoot, 'host', 'client')
  ].find(isHostClient) || '';
}

export function requireHostTests(hostAvailable, label) {
  if (process.env.BOBOCLOUD_REQUIRE_HOST_TESTS === '1' && !hostAvailable) {
    throw new Error(`${label} is required but BOBOCLOUD_HOST_CLIENT or its dependencies are unavailable.`);
  }
}
