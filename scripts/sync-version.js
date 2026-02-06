#!/usr/bin/env node
/**
 * Sync manifest versions with package.json version.
 * 
 * Run automatically via npm version hook, or manually:
 *   node scripts/sync-version.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

const manifests = ['openclaw.plugin.json', 'clawdbot.plugin.json'];

for (const file of manifests) {
  const path = join(ROOT, file);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.version = version;
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[sync-version] ${file} -> ${version}`);
}

console.log('[sync-version] Done');
