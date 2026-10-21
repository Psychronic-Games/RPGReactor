'use strict';
// reactor_core.js and reactor_objects.js are each one script split into parts
// (reactor_core_*.js, reactor_objects_*.js) that reactor_main.js loads back to
// back. A test that reads the source reads every part in that order, so a
// section can move between parts without the test noticing where it went.
const fs = require('node:fs');
const path = require('node:path');

const runtimeRoot = path.resolve(__dirname, '..', '..', '..', 'runtime');

/** The parts of `file` (e.g. 'reactor_objects.js') in the order the game loads them. */
function runtimeParts(file) {
    const stem = file.replace(/\.js$/, '');
    const main = fs.readFileSync(path.join(runtimeRoot, 'reactor_main.js'), 'utf8');
    const listed = Array.from(main.matchAll(/"js\/([^"/]+\.js)"/g), m => m[1])
        .filter(name => name === file || name.startsWith(stem + '_'));
    const onDisk = fs.readdirSync(runtimeRoot).filter(name => name.startsWith(stem + '_') && name.endsWith('.js'));
    const unlisted = onDisk.filter(name => !listed.includes(name)).sort();
    return [...listed, ...unlisted];
}

const cache = new Map();
/** The whole of `file` as the game runs it: its parts joined in load order. */
function runtimeSource(file) {
    if (!cache.has(file)) {
        cache.set(file, runtimeParts(file)
            .map(name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8'))
            .join(''));
    }
    return cache.get(file);
}

module.exports = { runtimeParts, runtimeSource, runtimeRoot };
