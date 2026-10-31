/**
 * EditorPaths - where the importers find the editor's own files. Node only.
 * A source checkout keeps runtime/ and template/ beside editor/; a packaged
 * editor holds them inside the app folder.
 *
 * Every import starts from the skeleton: the files in skeleton/, then the
 * system pictures, effects and fonts skeleton-shared.json names in the
 * bundled Demo, and the editor's icon.
 *
 *   editorPackage()            the editor's package.json, parsed
 *   runtime()                  the folder holding reactor_main.js
 *   skeletonFiles()            Map of project path ("img/system/Window.png") → the file it is copied from
 *   skeletonFile(rel)          one of those files; throws when the skeleton has no such file
 *   copySkeleton(dest, skip)   writes the skeleton into dest; skip(rel) leaves a file out
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const SKELETON = path.join(__dirname, 'skeleton');

function find(parts, marker) {
    for (const base of [APP_ROOT, path.dirname(APP_ROOT)]) {
        const folder = path.join(base, ...parts);
        if (fs.existsSync(path.join(folder, marker))) return folder;
    }
    return null;
}

function editorPackage() {
    return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));
}

function runtime() {
    const folder = find(['runtime'], 'reactor_main.js');
    if (!folder) throw new Error('The runtime folder is missing from this copy of RPG Reactor.');
    return folder;
}

let files = null;
function skeletonFiles() {
    if (files) return files;
    const found = new Map();
    const walk = (folder, rel) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const r = rel ? rel + '/' + entry.name : entry.name;
            if (entry.isDirectory()) walk(path.join(folder, entry.name), r);
            else found.set(r, path.join(folder, entry.name));
        }
    };
    walk(SKELETON, '');
    const shared = JSON.parse(fs.readFileSync(path.join(__dirname, 'skeleton-shared.json'), 'utf8'));
    const demo = find(['template', 'Demo'], path.join('data', 'System.json'));
    if (!demo) throw new Error('The bundled Demo project is missing from this copy of RPG Reactor.');
    for (const rel of shared.demo) found.set(rel, path.join(demo, ...rel.split('/')));
    for (const [rel, from] of Object.entries(shared.editor)) found.set(rel, path.join(APP_ROOT, ...from.split('/')));
    for (const [rel, file] of found) {
        if (!fs.existsSync(file)) throw new Error(`The import skeleton's ${rel} is missing from this copy of RPG Reactor.`);
    }
    return (files = found);
}

function skeletonFile(rel) {
    const file = skeletonFiles().get(rel);
    if (!file) throw new Error(`The import skeleton has no ${rel}.`);
    return file;
}

let copySerial = 0;
const copyToken = require('node:crypto').randomBytes(6).toString('hex');
/** Import copies are editable. Replace via a sibling so read-only old copies and linked
 * files do not cause an in-place write to fail or change the source's permissions. */
function copyFile(source, destination) {
    const part = destination + '.part-' + process.pid + '-' + copyToken + '-' + (++copySerial);
    try {
        fs.copyFileSync(source, part);
        fs.chmodSync(part, fs.statSync(part).mode | 0o200);
        if (process.platform === 'win32' && fs.existsSync(destination)) {
            const stat = fs.lstatSync(destination);
            if (stat.isFile()) fs.chmodSync(destination, stat.mode | 0o200);
        }
        fs.renameSync(part, destination);
    } finally { fs.rmSync(part, { force: true }); }
}

function copySkeleton(dest, skip = () => false) {
    for (const [rel, file] of skeletonFiles()) {
        if (skip(rel)) continue;
        const to = path.join(dest, ...rel.split('/'));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        copyFile(file, to);
    }
}

module.exports = { APP_ROOT, editorPackage, runtime, skeletonFiles, skeletonFile, copySkeleton, copyFile };
