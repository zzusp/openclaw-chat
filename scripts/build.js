#!/usr/bin/env node
/**
 * Build script for openclaw-chat plugin.
 * 
 * Supports dual-build for OpenClaw and Clawdbot environments.
 * Each build outputs to a separate temp directory, then merges.
 */

import { execSync } from 'child_process';
import { copyFileSync, rmSync, existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const target = process.argv[2] || 'all';

function log(msg) {
  console.log(`[build] ${msg}`);
}

function copyDir(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function buildFor(env) {
  const sdkSource = join(SRC, `sdk.${env}.ts`);
  const sdkDest = join(SRC, 'sdk.ts');
  const tempDist = join(ROOT, `dist-${env}`);
  
  log(`Building for ${env}...`);
  
  // Clean temp dist
  if (existsSync(tempDist)) {
    rmSync(tempDist, { recursive: true });
  }
  
  // Copy the correct SDK file
  log(`  Copying sdk.${env}.ts -> sdk.ts`);
  copyFileSync(sdkSource, sdkDest);
  
  // Run TypeScript compiler to temp directory
  log('  Running tsc...');
  try {
    execSync(`npx tsc --outDir ${tempDist}`, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error(`Build failed for ${env}`);
    process.exit(1);
  }
  
  log(`  Done building for ${env}`);
  return tempDist;
}

function mergeDist(tempDist, env) {
  // Copy index.js -> index.{env}.js
  const indexSrc = join(tempDist, 'index.js');
  const indexDest = join(DIST, `index.${env}.js`);
  if (existsSync(indexSrc)) {
    copyFileSync(indexSrc, indexDest);
    log(`  Created index.${env}.js`);
  }
  
  // Copy index.d.ts -> index.{env}.d.ts
  const dtsSrc = join(tempDist, 'index.d.ts');
  const dtsDest = join(DIST, `index.${env}.d.ts`);
  if (existsSync(dtsSrc)) {
    copyFileSync(dtsSrc, dtsDest);
  }
  
  // Copy src directory (only once, structure is same)
  const srcDir = join(tempDist, 'src');
  const destSrcDir = join(DIST, 'src');
  if (!existsSync(destSrcDir) && existsSync(srcDir)) {
    copyDir(srcDir, destSrcDir);
    log('  Copied src/');
  }
  
  // Rename sdk.js to sdk.{env}.js
  const sdkSrc = join(tempDist, 'src', 'sdk.js');
  const sdkDest = join(DIST, 'src', `sdk.${env}.js`);
  if (existsSync(sdkSrc)) {
    copyFileSync(sdkSrc, sdkDest);
    log(`  Created src/sdk.${env}.js`);
  }
  
  // Copy sdk.d.ts -> sdk.{env}.d.ts
  const sdkDtsSrc = join(tempDist, 'src', 'sdk.d.ts');
  const sdkDtsDest = join(DIST, 'src', `sdk.${env}.d.ts`);
  if (existsSync(sdkDtsSrc)) {
    copyFileSync(sdkDtsSrc, sdkDtsDest);
  }
}

function patchImports() {
  for (const env of ['openclaw', 'clawdbot']) {
    const indexPath = join(DIST, `index.${env}.js`);
    if (existsSync(indexPath)) {
      let content = readFileSync(indexPath, 'utf8');
      content = content.replace('./src/sdk.js', `./src/sdk.${env}.js`);
      writeFileSync(indexPath, content);
      log(`  Patched index.${env}.js to use sdk.${env}.js`);
    }
  }
  
  // Default index.js uses openclaw
  const defaultIndexPath = join(DIST, 'index.js');
  if (existsSync(defaultIndexPath)) {
    let content = readFileSync(defaultIndexPath, 'utf8');
    content = content.replace('./src/sdk.js', './src/sdk.openclaw.js');
    writeFileSync(defaultIndexPath, content);
    log('  Patched index.js to use sdk.openclaw.js');
  }
}

function clean() {
  const sdkTs = join(SRC, 'sdk.ts');
  if (existsSync(sdkTs)) rmSync(sdkTs);
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  for (const env of ['openclaw', 'clawdbot']) {
    const tempDist = join(ROOT, `dist-${env}`);
    if (existsSync(tempDist)) rmSync(tempDist, { recursive: true });
  }
}

// Main
log(`Target: ${target}`);
clean();
mkdirSync(DIST, { recursive: true });

const builds = [];

if (target === 'openclaw' || target === 'all') {
  builds.push({ env: 'openclaw', tempDist: buildFor('openclaw') });
}

if (target === 'clawdbot' || target === 'all') {
  builds.push({ env: 'clawdbot', tempDist: buildFor('clawdbot') });
}

// Merge all builds
for (const { env, tempDist } of builds) {
  mergeDist(tempDist, env);
}

// Set default index.js (openclaw)
const defaultSrc = join(DIST, 'index.openclaw.js');
const defaultDest = join(DIST, 'index.js');
if (existsSync(defaultSrc)) {
  copyFileSync(defaultSrc, defaultDest);
}

// Also copy default d.ts
const defaultDtsSrc = join(DIST, 'index.openclaw.d.ts');
const defaultDtsDest = join(DIST, 'index.d.ts');
if (existsSync(defaultDtsSrc)) {
  copyFileSync(defaultDtsSrc, defaultDtsDest);
}

// Default sdk.js (openclaw)
const defaultSdkSrc = join(DIST, 'src', 'sdk.openclaw.js');
const defaultSdkDest = join(DIST, 'src', 'sdk.js');
if (existsSync(defaultSdkSrc)) {
  copyFileSync(defaultSdkSrc, defaultSdkDest);
}

// Patch imports
patchImports();

// Cleanup temp directories
for (const { tempDist } of builds) {
  if (existsSync(tempDist)) rmSync(tempDist, { recursive: true });
}

// Cleanup src/sdk.ts
const sdkTs = join(SRC, 'sdk.ts');
if (existsSync(sdkTs)) rmSync(sdkTs);

log('Build complete!');
