#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliPkgDir = path.resolve(repoRoot, 'packages', 'cli');

console.log('=== FlappyCode Smoke Install Test (P1-A4) ===');

// 1. Ensure CLI package is built
console.log('[1/5] Building flappycode package...');
execSync('pnpm --filter flappycode build', { cwd: repoRoot, stdio: 'inherit' });

// 2. Create isolated temporary workspace
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappycode-smoke-'));
const packDir = path.join(tmpDir, 'pack');
const prefixDir = path.join(tmpDir, 'prefix');
fs.mkdirSync(packDir, { recursive: true });
fs.mkdirSync(prefixDir, { recursive: true });

try {
  // 3. Pack tarball
  console.log(`[2/5] Packing tarball into ${packDir}...`);
  const packOutput = execSync(`pnpm pack --pack-destination "${packDir}"`, {
    cwd: cliPkgDir,
    encoding: 'utf8',
  });
  console.log(packOutput.trim());

  const tgzFiles = fs.readdirSync(packDir).filter((f) => f.endsWith('.tgz'));
  if (tgzFiles.length === 0) {
    throw new Error('No .tgz file found in pack destination.');
  }
  const tgzPath = path.join(packDir, tgzFiles[0]);
  const stats = fs.statSync(tgzPath);
  const sizeKb = Math.round(stats.size / 1024);
  console.log(`Tarball created: ${tgzFiles[0]} (${sizeKb} KB)`);

  // Verify size is under budget (5MB)
  if (stats.size > 5 * 1024 * 1024) {
    throw new Error(`Tarball size (${sizeKb} KB) exceeds 5MB budget!`);
  }

  // Verify tarball contents with tar -tzf
  console.log('[3/5] Verifying tarball contents...');
  const tarList = execSync(`tar -tzf "${tgzPath}"`, { encoding: 'utf8' });
  const entries = tarList.split(/\r?\n/).filter(Boolean);

  const requiredEntries = [
    'package/dist/cli.js',
    'package/rules/RULES.md',
    'package/rules/categories/frontend.md',
    'package/package.json',
  ];

  for (const req of requiredEntries) {
    if (!entries.some((e) => e.includes(req.replace('package/', '')))) {
      throw new Error(`Missing expected entry in tarball: ${req}`);
    }
  }

  // Check no unwanted sensitive files
  const forbiddenPatterns = [/\.env/, /\.git\b/, /node_modules/];
  for (const entry of entries) {
    for (const pat of forbiddenPatterns) {
      if (pat.test(entry)) {
        throw new Error(`Forbidden file found in tarball: ${entry}`);
      }
    }
  }
  console.log(`Tarball contents verified (${entries.length} entries, no leaked credentials or build artifacts).`);

  // 4. Install into isolated global prefix
  console.log(`[4/5] Installing globally with prefix ${prefixDir}...`);
  execSync(`npm install -g --prefix "${prefixDir}" "${tgzPath}"`, {
    cwd: tmpDir,
    stdio: 'inherit',
  });

  // 5. Test running the installed binary
  console.log('[5/5] Executing installed flappycode binary...');
  
  // Locate binary in prefix
  const isWindows = process.platform === 'win32';
  let binCmd = path.join(prefixDir, 'bin', 'flappycode');
  if (isWindows) {
    const cmdCandidate = path.join(prefixDir, 'flappycode.cmd');
    if (fs.existsSync(cmdCandidate)) {
      binCmd = cmdCandidate;
    } else {
      // Fallback to node executing the entrypoint directly in installed node_modules
      binCmd = `node "${path.join(prefixDir, 'node_modules', 'flappycode', 'dist', 'cli.js')}"`;
    }
  }

  const runCmd = (args, options = {}) => {
    return execSync(`${binCmd} ${args}`, {
      cwd: tmpDir,
      encoding: 'utf8',
      ...options,
    });
  };

  // Check --version
  const versionOutput = runCmd('--version');
  console.log(`✔ flappycode --version -> ${versionOutput.trim()}`);
  if (!versionOutput.includes('0.0.0-dev')) {
    throw new Error(`Unexpected version output: ${versionOutput}`);
  }

  // Check --help
  const helpOutput = runCmd('--help');
  console.log('✔ flappycode --help -> output received');
  if (!helpOutput.includes('Multi-Provider') || !helpOutput.includes('COMMANDS')) {
    throw new Error(`Unexpected help output: ${helpOutput}`);
  }

  // Check rules command
  const rulesOutput = runCmd('rules');
  console.log(`✔ flappycode rules -> ${rulesOutput.trim().split('\n')[1] || rulesOutput.trim()}`);
  if (!rulesOutput.includes('Loaded rules:')) {
    throw new Error(`Unexpected rules output: ${rulesOutput}`);
  }

  // Check headless run without --approve-plan exits 3
  try {
    runCmd('run "test prompt"', { stdio: 'pipe' });
    throw new Error('Expected flappycode run without --approve-plan to fail with exit code 3');
  } catch (err) {
    const exitCode = err.status ?? err.exitCode;
    if (exitCode !== 3) {
      throw new Error(`Expected exit code 3, got ${exitCode} (${err.message})`);
    }
    console.log('✔ flappycode run requires --approve-plan (exited code 3 as expected)');
  }

  // Check headless run with --approve-plan succeeds
  const runOutput = runCmd('run "test prompt" --approve-plan');
  console.log(`✔ flappycode run --approve-plan -> ${runOutput.trim()}`);
  if (!runOutput.includes('"status":"queued"')) {
    throw new Error(`Unexpected run output: ${runOutput}`);
  }

  console.log('\n✅ ALL SMOKE INSTALL TESTS PASSED!\n');
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors on Windows
  }
}
