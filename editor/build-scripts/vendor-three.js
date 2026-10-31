#!/usr/bin/env node
/**
 * Bundle the pinned Three.js ES modules into the offline classic script used by
 * both the editor and games. Since r187, upstream's CommonJS entry delegates to
 * ESM and cannot be wrapped directly. esbuild is a build-time dependency only.
 *
 * Run through codex-check:
 *   node editor/build-scripts/vendor-three.js [--check]
 * Then sync the canonical runtime to bundled projects with sync-runtime.cjs.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const editorRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(editorRoot, '../runtime/libs/three.js');

function bundleThree() {
    const manifestPath = path.join(editorRoot, 'node_modules/three/package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const revision = manifest.version.split('.')[1];
    const banner = `/**
 * Three.js r${revision} (npm three@${manifest.version}) — MIT.
 * Copyright 2010-2026 Three.js Authors. See THIRD_PARTY_NOTICES.md.
 *
 * GENERATED FILE — do not edit. Regenerate with:
 *   node editor/build-scripts/vendor-three.js
 *
 * The pinned upstream ES modules are bundled by esbuild into a self-contained
 * classic script. Editor and game pages share this offline global THREE API.
 */
(function (root) {`;
    const result = require('esbuild').buildSync({
        absWorkingDir: editorRoot,
        entryPoints: ['node_modules/three/' + manifest.module.replace(/^\.\//, '')],
        bundle: true,
        platform: 'browser',
        format: 'iife',
        globalName: 'THREE',
        target: 'es2022',
        legalComments: 'inline',
        minify: false,
        keepNames: true,
        write: false,
        metafile: true,
        banner: { js: banner },
        footer: { js: "    root.THREE = { ...THREE };\n})(typeof globalThis !== 'undefined' ? globalThis : window);" }
    });
    if (Object.values(result.metafile.outputs).some(o => o.imports.length)) {
        throw new Error('Three.js browser bundle must not have external imports');
    }
    return { version: manifest.version, contents: result.outputFiles[0].contents };
}

function main() {
    const { version, contents } = bundleThree();
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(Buffer.from(contents))) {
            console.error('runtime/libs/three.js is stale; regenerate the pinned browser bundle.');
            process.exitCode = 1;
        } else console.log(`Three.js ${version} browser bundle is current.`);
        return;
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, contents);
    console.log(`Wrote runtime/libs/three.js from three@${version} (${Math.round(contents.length / 1024)} KB)`);
}
if (require.main === module) main();
module.exports = { bundleThree };
