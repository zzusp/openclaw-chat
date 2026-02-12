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

function ensureDependencies() {
  const typesNodePath = join(ROOT, 'node_modules', '@types', 'node');
  const typescriptPath = join(ROOT, 'node_modules', 'typescript');
  
  const needsTypesNode = !existsSync(typesNodePath);
  const needsTypeScript = !existsSync(typescriptPath);
  
  if (needsTypesNode || needsTypeScript) {
    log('Installing required dependencies...');
    const packages = [];
    if (needsTypesNode) packages.push('@types/node');
    if (needsTypeScript) packages.push('typescript');
    
    log(`  Missing: ${packages.join(', ')}`);
    
    try {
      // Force installation by unsetting NODE_ENV and using --include=dev
      // This ensures devDependencies are installed even in production environments
      const env = { ...process.env };
      delete env.NODE_ENV;
      
      // First, try to install all dependencies (including devDependencies)
      log('  Installing all dependencies (including devDependencies)...');
      try {
        execSync('npm install', { 
          cwd: ROOT, 
          stdio: 'inherit',
          env: env
        });
      } catch (fullInstallErr) {
        // If full install fails, try installing just the missing packages
        log('  Installing missing packages directly...');
        execSync(`npm install --no-save ${packages.join(' ')}`, { 
          cwd: ROOT, 
          stdio: 'inherit',
          env: env
        });
      }
      
      // Verify installation - check if files exist now
      if (needsTypesNode && !existsSync(typesNodePath)) {
        // Check if node_modules exists at all
        const nodeModulesPath = join(ROOT, 'node_modules');
        const typesPath = join(ROOT, 'node_modules', '@types');
        if (!existsSync(nodeModulesPath)) {
          throw new Error('node_modules directory not found. Please run: npm install');
        }
        if (!existsSync(typesPath)) {
          throw new Error('@types directory not found. The installation may have failed.');
        }
        // List what's in @types to help debug
        try {
          const typesContents = readdirSync(typesPath);
          throw new Error(`@types/node not found. Found in @types: ${typesContents.join(', ')}`);
        } catch (listErr) {
          throw new Error(`@types/node not found at ${typesNodePath} and cannot list @types directory`);
        }
      }
      if (needsTypeScript && !existsSync(typescriptPath)) {
        throw new Error(`typescript not found at ${typescriptPath} after installation. Please run: npm install`);
      }
      
      log('  Dependencies installed successfully');
    } catch (err) {
      console.error('Failed to install dependencies:', err.message);
      console.error('Please ensure you have run: npm install');
      process.exit(1);
    }
  }
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
  
  // Verify @types/node is available before compiling
  const typesNodePath = join(ROOT, 'node_modules', '@types', 'node');
  if (!existsSync(typesNodePath)) {
    console.error(`Error: @types/node not found at ${typesNodePath}`);
    console.error('Please ensure dependencies are installed: npm install');
    process.exit(1);
  }
  
  try {
    // Try to use local TypeScript first, fallback to npx if not available
    const localTsc = process.platform === 'win32'
      ? join(ROOT, 'node_modules', '.bin', 'tsc.cmd')
      : join(ROOT, 'node_modules', '.bin', 'tsc');
    const tscCommand = existsSync(localTsc)
      ? `"${localTsc}" --outDir "${tempDist}"`
      : `npx --package=typescript tsc --outDir "${tempDist}"`;
    execSync(tscCommand, { cwd: ROOT, stdio: 'inherit', shell: true });
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
ensureDependencies();
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
