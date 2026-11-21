'use strict';
// The README tells a source checkout which NW.js to download (issue 90: a newer NW.js than the
// checkout was built for closed the editor on Open, New and Import Project). Keep it on the pin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { NW_VERSION } = require('../build-scripts/release-config.cjs');

test('the README names the NW.js version the release config pins', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
    const step = readme.split('\n').find(line => line.includes('https://dl.nwjs.io/') && /^\d+\.\s/.test(line));
    assert.ok(step, 'the README has a numbered step that downloads NW.js');
    assert.match(step, new RegExp(`\\*\\*${NW_VERSION.replace(/\./g, '\\.')}\\*\\*`), `the download step names ${NW_VERSION}`);
});
