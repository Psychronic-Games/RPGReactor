'use strict';
// The 3D runtime is one namespace across several files: reactor_3d.js and the
// extensions it names (reactor_3d_*.js). A test that reads the source to pin
// a line of code reads all of it, so a section can move between those files
// without the test noticing where it went.
const fs = require('node:fs');
const path = require('node:path');

const runtimeRoot = path.resolve(__dirname, '..', '..', '..', 'runtime');

function runtime3DFiles() {
    // The core names its extensions in load order; the same order here, so a
    // test that evaluates the whole runtime sees what the game sees.
    const core = fs.readFileSync(path.join(runtimeRoot, 'reactor_3d.js'), 'utf8');
    const block = core.match(/Reactor3D\.EXTENSIONS = \[([\s\S]*?)\];/);
    const listed = block ? Array.from(block[1].matchAll(/file: "([^"]+)"/g), m => m[1]) : [];
    const onDisk = fs.readdirSync(runtimeRoot).filter(name => /^reactor_3d_.*\.js$/.test(name));
    const unlisted = onDisk.filter(name => !listed.includes(name)).sort();
    return ['reactor_3d.js', ...listed, ...unlisted];
}

let cached = null;
function source3D() {
    if (cached === null) {
        cached = runtime3DFiles()
            .map(name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8'))
            .join('\n');
    }
    return cached;
}

module.exports = { runtime3DFiles, source3D, runtimeRoot };
