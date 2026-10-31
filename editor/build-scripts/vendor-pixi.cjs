#!/usr/bin/env node
/** Copy the pinned upstream classic script used offline by editor and runtime. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const editorRoot = path.resolve(__dirname, '..');
const output = path.resolve(editorRoot, '../runtime/libs/pixi.js');

function pixiBundle() {
    const pinned = JSON.parse(fs.readFileSync(path.join(editorRoot, 'package.json'))).dependencies['pixi.js'];
    const upstream = path.join(editorRoot, 'node_modules/pixi.js');
    const version = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'))).version;
    if (version !== pinned) throw new Error(`Installed PixiJS ${version} differs from pinned ${pinned}; run npm ci.`);
    const contents = fs.readFileSync(path.join(upstream, 'dist/pixi.js'));
    if (!contents.subarray(0, 100).toString().includes(`PixiJS - v${version}`)) throw new Error('Unexpected PixiJS browser bundle header.');
    return { version, contents };
}

if (require.main === module) {
    const { version, contents } = pixiBundle();
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(output) || !fs.readFileSync(output).equals(contents)) {
            console.error('runtime/libs/pixi.js is stale; run node editor/build-scripts/vendor-pixi.cjs and sync-runtime.cjs.');
            process.exitCode = 1;
        } else console.log(`PixiJS ${version} offline browser bundle is current.`);
    } else {
        fs.writeFileSync(output, contents);
        console.log(`Wrote runtime/libs/pixi.js from pixi.js@${version} (${Math.round(contents.length / 1024)} KB)`);
    }
}
module.exports = { pixiBundle };
