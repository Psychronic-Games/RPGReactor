'use strict';
/**
 * What each test file depends on, read from the source rather than guessed from a run: a test depends on every code
 * file it names, and on everything those name in turn. Naming too much only costs a rerun; a test that reads
 * folders or project data, whose inputs can't be read this way, is never skipped.
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const tests = path.resolve(__dirname, '..'), editor = path.dirname(tests), repo = path.dirname(editor);
const ROOTS = [path.join(editor, 'src'), path.join(tests, 'helpers'), path.join(repo, 'runtime'), path.join(editor, 'build-scripts')];
/** Inputs a name can't reach: such a test always runs. */
const OPEN_INPUTS = /readdirSync|readdir\(|\bglob\b|template[/'"]|['"/]docs['"/]|\.github|package(-lock)?\.json|index\.html|-panel\.html|child_process|'css'|\.css\b/;
// A reference is a file name (`FlightCraft.js`) or a distinctive quoted name (`'FlightCraft'`), never a bare word:
// `build` or `test` in passing tied every file to every other.
const FILE_NAME = /([\w$-]+)\.(?:c|m)?js\b/g, QUOTED = /['"`]([\w$-]*(?:[A-Z_-])[\w$-]*)['"`]/g;

function codeFiles(root, out = []) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) { if (!['node_modules', 'libs', 'data'].includes(entry.name)) codeFiles(full, out); }
        else if (/\.(c|m)?js$/.test(entry.name)) out.push(full);
    }
    return out;
}

const baseOf = file => path.basename(file).replace(/\.[^.]+$/, '');

function namesIn(text) {
    const names = new Set();
    for (const pattern of [FILE_NAME, QUOTED]) for (const match of text.matchAll(pattern)) names.add(match[1]);
    return names;
}

/** { nodes: name -> { files, uses, hash }, closure(name) }: one node per base name, as source refers to files by it. */
function buildGraph() {
    const nodes = new Map();
    for (const root of ROOTS) for (const file of codeFiles(root)) {
        const name = baseOf(file), text = fs.readFileSync(file);
        const node = nodes.get(name) || { uses: new Set(), hash: crypto.createHash('sha1') };
        node.hash.update(text);
        for (const used of namesIn(text.toString('utf8'))) node.uses.add(used);
        nodes.set(name, node);
    }
    for (const node of nodes.values()) { node.uses = [...node.uses].filter(name => nodes.has(name)); node.hash = node.hash.digest('hex'); }
    // reactor_core.js and reactor_objects.js are each one script split into `_parts`, found by their prefix. The helper
    // reads reactor_main.js only for their order: a test of the core does not load every runtime file through it.
    for (const stem of ['reactor_core', 'reactor_objects']) if (nodes.has(stem)) for (const name of nodes.keys()) if (name.startsWith(stem + '_')) nodes.get(stem).uses.push(name);
    const source = nodes.get('runtime-source');
    if (source) source.uses = source.uses.filter(name => name !== 'reactor_main');
    return nodes;
}

/** The code a set of names reaches, itself included. */
function reach(nodes, start) {
    const seen = new Set(), stack = [...start];
    while (stack.length) {
        const name = stack.pop();
        if (seen.has(name) || !nodes.has(name)) continue;
        seen.add(name);
        stack.push(...nodes.get(name).uses);
    }
    return seen;
}

/** A test file's facts: `open` (never skipped), the code it reaches, and the fingerprint of it all. */
function describe(nodes, testFile, salt = '') {
    const text = fs.readFileSync(path.join(tests, testFile));
    const words = namesIn(text.toString('utf8')), reached = [...reach(nodes, [...words])].sort();
    const hash = crypto.createHash('sha1').update(salt).update(text);
    for (const name of reached) hash.update(name).update(nodes.get(name).hash);
    return { file: testFile, open: OPEN_INPUTS.test(text.toString('utf8')), reached, fingerprint: hash.digest('hex') };
}

module.exports = { buildGraph, reach, describe, baseOf };
