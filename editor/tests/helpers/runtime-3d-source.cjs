'use strict';
// The 3D runtime is one namespace across several files: reactor_3d.js and the
// extensions it names (reactor_3d_*.js). A test that reads the source to pin
// a line of code reads all of it, so a section can move between those files
// without the test noticing where it went.
const fs = require('node:fs');
const path = require('node:path');

const runtimeRoot = path.resolve(__dirname, '..', '..', '..', 'runtime');

function runtime3DFiles() {
    const extensions = fs.readdirSync(runtimeRoot)
        .filter(name => /^reactor_3d_.*\.js$/.test(name))
        .sort();
    return ['reactor_3d.js', ...extensions];
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
