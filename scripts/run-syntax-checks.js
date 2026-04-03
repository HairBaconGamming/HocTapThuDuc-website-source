const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const TARGETS = [
  'server.js',
  'scheduler.js',
  'controllers',
  'middlewares',
  'models',
  'routes',
  'services',
  'utils',
  path.join('public', 'js')
];

function walk(entryPath, bucket) {
  const fullPath = path.join(ROOT, entryPath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    if (fullPath.endsWith('.js')) {
      bucket.push(fullPath);
    }
    return;
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, bucket);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      bucket.push(path.join(ROOT, relativePath));
    }
  }
}

const files = [];
for (const target of TARGETS) {
  walk(target, files);
}

const uniqueFiles = Array.from(new Set(files)).sort();
const failures = [];

for (const file of uniqueFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failures.push({
      file: path.relative(ROOT, file),
      output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    });
  }
}

if (failures.length > 0) {
  console.error('Syntax check failed.\n');
  for (const failure of failures) {
    console.error(`- ${failure.file}`);
    if (failure.output) {
      console.error(failure.output);
    }
    console.error('');
  }
  process.exit(1);
}

console.log(`Syntax OK: ${uniqueFiles.length} files checked.`);
