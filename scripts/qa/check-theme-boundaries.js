#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const engineDir = path.join(root, 'engine');

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    return fullPath.endsWith('.js') ? [fullPath] : [];
  }));
  return files.flat();
}

async function main() {
  const files = await collectFiles(engineDir);
  const violations = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (/from ['"].*public\//.test(line) || /from ['"].*campaign-config/.test(line)) {
        violations.push({
          file: path.relative(root, file),
          line: index + 1,
          type: 'ui-import',
          source: line.trim(),
        });
      }
      if (/window\.|document\./.test(line)) {
        violations.push({
          file: path.relative(root, file),
          line: index + 1,
          type: 'browser-global',
          source: line.trim(),
        });
      }
    });
  }

  const report = {
    checkedFiles: files.length,
    violations,
    ok: violations.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
