import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliDir = path.resolve(repoRoot, 'packages', 'cli');

const rulesSrc = path.resolve(repoRoot, 'rules');
const rulesDest = path.resolve(cliDir, 'rules');

// Ensure destination is clean
if (fs.existsSync(rulesDest)) {
  fs.rmSync(rulesDest, { recursive: true, force: true });
}

// Copy rules directory to packages/cli/rules
if (fs.existsSync(rulesSrc)) {
  fs.cpSync(rulesSrc, rulesDest, { recursive: true });
  console.log(`[copy-cli-assets] Copied rules to ${rulesDest}`);
} else {
  console.warn(`[copy-cli-assets] Warning: ${rulesSrc} does not exist.`);
}

// Copy LICENSE and README if not present in cli package
const licenseSrc = path.resolve(repoRoot, 'LICENSE');
const licenseDest = path.resolve(cliDir, 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, licenseDest);
}

const readmeSrc = path.resolve(repoRoot, 'README.md');
const readmeDest = path.resolve(cliDir, 'README.md');
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, readmeDest);
}
