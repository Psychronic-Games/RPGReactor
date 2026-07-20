#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const output = execFileSync('git', [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.js', '*.cjs',
], {
    cwd: repoRoot,
    encoding: 'buffer',
});
const files = output.toString('utf8').split('\0')
    .filter(Boolean)
    .filter(file => fs.existsSync(path.join(repoRoot, file)));
for (const file of files) {
    execFileSync(process.execPath, ['--check', path.join(repoRoot, file)], { stdio: 'inherit' });
}
process.stdout.write(`Syntax checked ${files.length} source JavaScript files.\n`);
