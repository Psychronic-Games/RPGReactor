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

/**
 * A browser-game storefront's upload rules (itch: 1000 files, 500 MB extracted) as warning
 * lines for a web build under root; none when it fits. Warn, never block.
 */
function storefrontWarnings(root) {
    const files = listFiles(root).concat(fs.existsSync(path.join(root, ...INDEX_PATH.split('/'))) ? [INDEX_PATH] : []);
    const megabytes = files.reduce((sum, file) => sum + fs.statSync(path.join(root, ...file.split('/'))).size, 0) / 1048576;
    const warnings = [];
    if (files.length > 1000) warnings.push(`Warning: ${files.length} files — some browser-game storefronts reject uploads over 1000 files.`);
    if (megabytes > 500) warnings.push(`Warning: ${megabytes.toFixed(0)} MB extracted — some browser-game storefronts reject uploads over 500 MB extracted.`);
    return warnings;
}

module.exports = { INDEX_PATH, listFiles, writeWebFileIndex, storefrontWarnings };
