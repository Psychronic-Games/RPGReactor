'use strict';
// Tests run on GitHub's machines as well as on the desktop, and those have none of the desktop's folders. A test that
// made a folder under ~/.cache passed here and failed there, after a release was tagged on it (owner, 2026-11-22: "I
// have no trust that it's actually fixed"). The rule was in a note; it is checked here, with the suite, instead.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(name => name.endsWith('.test.cjs') && name !== path.basename(__filename))
    .concat(fs.readdirSync(path.join(dir, 'helpers')).filter(name => name.endsWith('.cjs')).map(name => path.join('helpers', name)));

test('no test writes under the home folder or names a path of this desktop', () => {
    const found = [];
    for (const name of files) {
        fs.readFileSync(path.join(dir, name), 'utf8').split('\n').forEach((line, index) => {
            const where = `${name}:${index + 1}`;
            // Making, writing or removing something under the home folder (os.homedir()): use os.tmpdir().
            if (/homedir\(\)/.test(line) && /\b(mkdtemp|mkdir|writeFile|appendFile|cpSync|copyFile|rmSync|rename|symlink)\w*\(/.test(line)) found.push(`${where} writes under the home folder`);
            if (/homedir\(\)\s*,\s*['"]\.cache['"]/.test(line)) found.push(`${where} uses ~/.cache`);
            // This desktop's own folders.
            if (/\/home\/doug\b|\/mnt\/sda1\/Dropbox|Dropbox\/Family Room/.test(line)) found.push(`${where} names a folder of this desktop`);
        });
    }
    assert.deepEqual(found, [], 'tests run on machines with none of these:\n' + found.join('\n'));
});
