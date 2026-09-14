/**
 * The relative path of every file in a web build, written into the build as
 * js/reactor_files.json. A browser cannot read the directory it was served
 * from, so this is how the runtime corrects a request's filename casing there
 * (a project made on Windows asks for "Slash1.ogg" and ships "slash1.ogg";
 * the desktop runtime reads the disk, the web runtime reads this list).
 */
const fs = require('fs');
const path = require('path');

const INDEX_PATH = 'js/reactor_files.json';

/** Every file under root as a sorted, forward-slashed relative path, the index itself left out. */
function listFiles(root) {
    const files = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) files.push(path.relative(root, full).split(path.sep).join('/'));
        }
    };
    walk(root);
    return files.filter(file => file !== INDEX_PATH).sort();
}

/** Writes the index under root and returns how many files it names. */
function writeWebFileIndex(root) {
    const files = listFiles(root);
    const target = path.join(root, ...INDEX_PATH.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ files }));
    return files.length;
}

module.exports = { INDEX_PATH, listFiles, writeWebFileIndex };
