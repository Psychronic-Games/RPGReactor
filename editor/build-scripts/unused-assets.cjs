'use strict';
/**
 * Unused files: the asset files a project's game can never load, so a deployment can leave them out.
 *
 *   analyze(projectRoot, { keep })  every asset file with whether it is used and why (nothing is changed)
 *   prune(targetRoot, analysis)     removes the unused files from a copy of the project (a staging folder,
 *                                   a web build), matched by path without extension, so an encrypted or
 *                                   converted copy (Battle1.ogg_, a WAV made OGG) loses the same files
 *   readSettings / writeSettings    the project's own Always include list (deploy.rpgreactor.json)
 *
 * RPG Maker's "Exclude unused files" looks only at what the database and events name, so a picture a
 * plugin shows, a sound a plugin parameter names or a face a HUD builds from an actor's number is left
 * out and the game breaks. This keeps a file when anything at all could name it:
 *
 *   - its name appears in the project's text: every data file (Reactor's sidecars included), the plugin
 *     list with its parameters, the source of every plugin switched on, the runtime, index.html, the CSS;
 *   - code builds names from a fixed start ("Face_" + id, `Face_${id}`, "Face_%1"): every file with that
 *     start is kept;
 *   - it belongs to something kept: a 3D model's whole folder, a material's _normal/_rough companions,
 *     the textures and models an Effekseer effect loads;
 *   - a playtest loaded it (asset-usage.rpgreactor.json, written by the runtime in test play);
 *   - it matches the project's Always include list.
 *
 * Only files under the asset folders are ever left out (img, audio, movies, effects, 3d, fonts) and plugin
 * files the plugin list never names; img/system (fixed sheets the runtime loads by name), data, scripts
 * and everything else always ship. Names are compared without case, as Windows and the web build find
 * them. When in doubt a file is kept: a build a little larger than it needs to be still plays.
 */
const fs = require('node:fs');
const path = require('node:path');

const ASSET_ROOTS = new Set(['img', 'audio', 'movies', 'effects', '3d', 'fonts']);
const ALWAYS_KEPT = ['img/system/'];
const USAGE_FILE = 'asset-usage.rpgreactor.json';
const SETTINGS_FILE = 'deploy.rpgreactor.json';
const MATERIAL_COMPANION = /^(.+?)_(normal|rough|roughness|metal|metallic|ao|height|disp|displacement|emissive|orm|n|r)$/;
// A name character: what a file name is made of, other than a space or a dot (those are checked the slow way).
const NAME_RUN = /[a-z0-9_\-\u00c0-\uffff]+/g;
const PLAIN_NAME = /^[a-z0-9_\-\u00c0-\uffff]+$/;
// Working files of art programs: a game never loads them.
const SOURCE_ART = /\.(psd|psb|xcf|kra|ora|blend|blend1|aseprite|ase|clip|sai|ai|max|ma|mb|spp|sbs|sbsar)$/i;
// An asset folder named in code: a plugin that lists a folder's files may load any of them.
const ASSET_FOLDER = /(?:img|audio|movies|effects|3d|fonts)\/[a-z0-9_\-\/]*/g;

const posix = rel => rel.split(path.sep).join('/');
/** A file's identity across copies: its path without its last extension, lower case. */
const keyOf = rel => posix(rel).replace(/\.[^./]*$/, '').toLowerCase();

function walk(root, rel = '', out = []) {
    let entries = [];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
    for (const entry of entries) {
        const child = rel ? rel + '/' + entry.name : entry.name;
        if (entry.isDirectory()) walk(root, child, out);
        else if (entry.isFile()) out.push(child);
    }
    return out;
}

const readText = file => { try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; } };

/** JSON as one canonical line: escapes undone (\u00e9, \/), so names read as they are spelled. */
function jsonText(file) {
    const raw = readText(file);
    try { return JSON.stringify(JSON.parse(raw)); } catch (_) { return raw; }
}

/** The plugin list ($plugins in js/plugins.js or js/reactor_plugins.js): [{ name, status }], or null if there is none. */
function pluginList(root) {
    let found = null;
    for (const name of ['reactor_plugins.js', 'plugins.js']) {
        const text = readText(path.join(root, 'js', name));
        const start = text.indexOf('[', text.indexOf('$plugins'));
        const end = text.lastIndexOf(']');
        if (text.indexOf('$plugins') < 0 || start < 0 || end < start) continue;
        try {
            const list = JSON.parse(text.slice(start, end + 1));
            if (Array.isArray(list)) found = (found || []).concat(list.filter(p => p && typeof p.name === 'string'));
        } catch (_) {
            // A list that isn't plain JSON: its names, each taken as switched on.
            found = (found || []).concat([...text.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => ({ name: m[1], status: true })));
        }
    }
    return found;
}

/** The texture, model and material paths inside an Effekseer effect (UTF-16 strings), relative to the effect; null if unreadable. */
function effectResources(file) {
    let bytes;
    try { bytes = fs.readFileSync(file); } catch (_) { return null; }
    if (bytes.length < 4 || bytes.toString('latin1', 0, 4) !== 'EFKE') return null;
    const found = [];
    const text = bytes.toString('latin1');
    // UTF-16LE text: a printable byte, then a zero, four times or more.
    for (const match of text.matchAll(/(?:[\x20-\x7e]\x00){4,}/g)) {
        const value = Buffer.from(match[0], 'latin1').toString('utf16le');
        if (/\.(png|jpe?g|dds|tga|efkmodel|efkmat|efkmatd|mqo|wav|ogg)$/i.test(value)) found.push(value.replace(/\\/g, '/'));
    }
    return found;
}

/**
 * Every fixed start code builds names from: "Face_" + id, 'Battler' + n, `Face_${id}`, "Face_%1", "Face_{id}".
 * At least three characters, so a short start ("rr", "c") doesn't keep half a folder.
 */
function namePrefixes(text, out) {
    for (const m of text.matchAll(/(["'`])([a-z0-9_\-]{3,})\1\s*\+/g)) out.add(m[2]);
    for (const m of text.matchAll(/([a-z0-9_\-]{3,})\$\{/g)) out.add(m[1]);
    for (const m of text.matchAll(/([a-z0-9_\-]{3,})(?:%\d|%[ds]|\{[a-z]*\})/g)) out.add(m[1]);
    return out;
}

/** Glob patterns (one per entry; * within a folder, ** across folders) as one test on a project-relative path. */
function patternTest(patterns) {
    const tests = (patterns || []).map(p => String(p).trim().replace(/\\/g, '/').replace(/^\/+/, '')).filter(Boolean).map(p => {
        const source = p.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
        // A folder keeps everything in it; a name without an extension matches any extension.
        return new RegExp('^' + source + '(\\.[^/]*)?(/.*)?$', 'i');
    });
    return rel => tests.some(t => t.test(rel));
}

function readSettings(root) {
    try {
        const settings = JSON.parse(fs.readFileSync(path.join(root, SETTINGS_FILE), 'utf8'));
        return { keep: Array.isArray(settings.keep) ? settings.keep.map(String) : [] };
    } catch (_) { return { keep: [] }; }
}

function writeSettings(root, settings) {
    const keep = (settings.keep || []).map(s => String(s).trim()).filter(Boolean);
    fs.writeFileSync(path.join(root, SETTINGS_FILE), JSON.stringify({ keep }, null, 2) + '\n');
}

/** The files playtests loaded, as keys. */
function usageRecord(root) {
    try {
        const record = JSON.parse(fs.readFileSync(path.join(root, USAGE_FILE), 'utf8'));
        return new Set((record.files || []).map(keyOf));
    } catch (_) { return new Set(); }
}

/** The project's text, lower case: what could name a file; and the asset folders code lists whole. */
function corpus(root, plugins) {
    const parts = [], listedFolders = new Set();
    for (const rel of walk(root, 'data')) if (/\.json$/i.test(rel) && !/\/Test_[^/]*\.json$/i.test(rel)) parts.push(jsonText(path.join(root, rel)));
    for (const name of fs.existsSync(path.join(root, 'js')) ? fs.readdirSync(path.join(root, 'js')) : []) {
        if (/\.js$/i.test(name)) parts.push(readText(path.join(root, 'js', name)));
    }
    // Plugins switched off are never loaded, so their code names nothing (their parameters are in the list above).
    for (const plugin of plugins || []) {
        if (plugin.status === false) continue;
        const code = readText(path.join(root, 'js', 'plugins', plugin.name + '.js'));
        parts.push(code);
        if (/readdir/i.test(code)) for (const folder of code.toLowerCase().match(ASSET_FOLDER) || []) listedFolders.add(folder.replace(/\/+$/, '') + '/');
    }
    parts.push(readText(path.join(root, 'index.html')));
    for (const rel of walk(root, 'css')) parts.push(readText(path.join(root, rel)));
    for (const rel of walk(root, '3d/Structures')) if (/\.json$/i.test(rel)) parts.push(jsonText(path.join(root, rel)));
    return { text: parts.join('\n').toLowerCase(), listedFolders };
}

class Evidence {
    constructor(text) {
        this.text = text;
        this.tokens = new Set(text.match(NAME_RUN) || []);
        this.prefixes = namePrefixes(text, new Set());
    }
    add(text) {
        text = text.toLowerCase();
        this.text += '\n' + text;
        for (const token of text.match(NAME_RUN) || []) this.tokens.add(token);
        namePrefixes(text, this.prefixes);
    }
    /** The name (lower case, folder/name allowed) appears whole: not as part of a longer name. */
    names(name) {
        const base = name.slice(name.lastIndexOf('/') + 1);
        if (PLAIN_NAME.test(base)) return this.tokens.has(base);
        for (let at = this.text.indexOf(base); at >= 0; at = this.text.indexOf(base, at + 1)) {
            const before = this.text[at - 1], after = this.text[at + base.length];
            if ((!before || !/[a-z0-9_\-\u00c0-\uffff]/.test(before)) && (!after || !/[a-z0-9_\-\u00c0-\uffff]/.test(after))) return true;
        }
        return false;
    }
    prefix(name) {
        const base = name.slice(name.lastIndexOf('/') + 1);
        for (const p of this.prefixes) if (base.length > p.length && base.startsWith(p)) return p;
        return null;
    }
}

/**
 * Every asset file of the project, used or not, with the reason. `keep` adds patterns to the project's
 * own Always include list; `usage: false` ignores the playtest record.
 */
function analyze(root, options = {}) {
    root = path.resolve(root);
    const plugins = pluginList(root);
    const { text, listedFolders } = corpus(root, plugins);
    const evidence = new Evidence(text);
    const kept = patternTest(readSettings(root).keep.concat(options.keep || []));
    const played = options.usage === false ? new Set() : usageRecord(root);
    const files = walk(root).filter(rel => ASSET_ROOTS.has(rel.split('/')[0]) || /^js\/plugins\/[^/]+\.js$/i.test(rel));
    const verdict = new Map();
    const decide = (rel, reason) => { if (!verdict.has(rel)) verdict.set(rel, reason); };
    const ruled = (rel, name) => {
        if (kept(rel)) return 'in the Always include list';
        if (SOURCE_ART.test(rel)) return null;
        if ([...listedFolders].some(folder => rel.toLowerCase().startsWith(folder))) return 'in a folder a plugin lists';
        if (played.has(keyOf(rel))) return 'loaded in a playtest';
        if (evidence.names(name)) return 'named in the project';
        const start = evidence.prefix(name);
        if (start) return `built from "${start}" in the project's code`;
        return null;
    };

    // Plugin files: a file the plugin list never names can't be switched on.
    const listed = plugins && new Set(plugins.map(p => p.name.toLowerCase()));
    for (const rel of files.filter(r => r.startsWith('js/'))) {
        const name = rel.slice('js/plugins/'.length, -3).toLowerCase();
        decide(rel, !listed || listed.has(name) || kept(rel) ? 'in the plugin list' : null);
    }

    // 3D models: a folder holding source/ is one model, named by its path under 3d/; it ships whole or not at all.
    const modelOf = new Map();
    for (const rel of files.filter(r => r.startsWith('3d/'))) {
        const parts = rel.split('/');
        for (let i = parts.length - 2; i >= 1; i--) {
            if (parts[i] === 'source' && i >= 2) { modelOf.set(rel, parts.slice(1, i).join('/')); break; }
        }
    }
    const models = new Map();
    for (const [rel, model] of modelOf) if (!models.has(model)) models.set(model, []);
    for (const [rel, model] of modelOf) models.get(model).push(rel);
    for (const rel of files) {
        if (!rel.startsWith('3d/') || modelOf.has(rel)) continue;
        const parts = rel.split('/');
        for (let i = parts.length - 1; i >= 2; i--) {
            const model = parts.slice(1, i).join('/');
            if (models.has(model)) { modelOf.set(rel, model); models.get(model).push(rel); break; }
        }
    }
    for (const [model, members] of models) {
        const name = model.toLowerCase();
        let reason = members.map(rel => kept(rel) ? 'in the Always include list' : played.has(keyOf(rel)) ? 'loaded in a playtest' : null).find(Boolean)
            || (evidence.names(name) ? 'named in the project' : null);
        for (const rel of members) decide(rel, reason && (!SOURCE_ART.test(rel) || kept(rel)) ? reason : null);
        // What a kept model's own files name (its effects, sounds, pictures) is part of the project's text.
        if (reason) for (const rel of members) if (/\.json$/i.test(rel)) evidence.add(jsonText(path.join(root, rel)));
    }

    // Effects: an effect by its name; the textures and models in effects/ by the kept effects that load them.
    const effectFiles = files.filter(r => r.startsWith('effects/'));
    const loaded = new Set();
    let unreadable = false;
    for (const rel of effectFiles.filter(r => /\.efkefc$/i.test(r))) {
        const reason = ruled(rel, keyOf(rel).slice('effects/'.length));
        decide(rel, reason);
        if (!reason) continue;
        const resources = effectResources(path.join(root, rel));
        if (!resources) { unreadable = true; continue; }
        const dir = path.posix.dirname(rel);
        for (const resource of resources) loaded.add(keyOf(path.posix.normalize(dir + '/' + resource)));
    }
    for (const rel of effectFiles) {
        if (verdict.has(rel)) continue;
        if (loaded.has(keyOf(rel))) decide(rel, 'loaded by an effect that ships');
        else if (unreadable) decide(rel, 'an effect that ships could not be read');
        else decide(rel, ruled(rel, keyOf(rel).slice('effects/'.length)));
    }

    // Everything else, by name: folder/name for a picture in a subfolder of its folder.
    for (const rel of files) {
        if (verdict.has(rel)) continue;
        if (ALWAYS_KEPT.some(dir => rel.startsWith(dir)) && !SOURCE_ART.test(rel)) { decide(rel, 'loaded by the runtime by name'); continue; }
        const parts = rel.split('/');
        const depth = parts[0] === 'img' || parts[0] === 'audio' ? 2 : 1;
        const name = keyOf(rel).split('/').slice(depth).join('/');
        let reason = ruled(rel, name);
        if (!reason && parts[0] === 'img' && parts[1] === 'materials') {
            const companion = MATERIAL_COMPANION.exec(path.posix.basename(name));
            if (companion && evidence.names(companion[1])) reason = 'a companion of a material that ships';
        }
        decide(rel, reason);
    }

    const list = files.map(rel => {
        let size = 0;
        try { size = fs.statSync(path.join(root, rel)).size; } catch (_) {}
        const reason = verdict.get(rel) || (SOURCE_ART.test(rel) ? 'a working file of an art program' : 'nothing in the project names it');
        return { path: rel, size, used: !!verdict.get(rel), reason };
    });
    const unused = list.filter(f => !f.used);
    return {
        files: list,
        unused,
        unusedBytes: unused.reduce((sum, f) => sum + f.size, 0),
        keptCount: list.length - unused.length,
        playtestRecord: played.size > 0,
    };
}

/** Removes the analysis's unused files from a copy of the project, and asset folders left empty. Returns the count removed. */
function prune(target, analysis) {
    // A file by its own path first; a renamed copy (Battle1.ogg_, a WAV made OGG) by its path without extension,
    // and only when nothing that ships shares that path (tree.blend goes, tree.glb beside it stays).
    const exact = rel => rel.toLowerCase();
    const unusedPaths = new Set(analysis.unused.map(f => exact(f.path)));
    const usedPaths = new Set(analysis.files.filter(f => f.used).map(f => exact(f.path)));
    const unusedKeys = new Set(analysis.unused.map(f => keyOf(f.path)));
    const usedKeys = new Set(analysis.files.filter(f => f.used).map(f => keyOf(f.path)));
    const goes = rel => unusedPaths.has(exact(rel)) || (!usedPaths.has(exact(rel)) && unusedKeys.has(keyOf(rel)) && !usedKeys.has(keyOf(rel)));
    let removed = 0;
    for (const rel of walk(target)) {
        const top = rel.split('/')[0];
        if (!(ASSET_ROOTS.has(top) || rel.startsWith('js/plugins/')) || !goes(rel)) continue;
        fs.rmSync(path.join(target, rel), { force: true });
        removed++;
    }
    const clear = dir => {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
        for (const entry of entries) if (entry.isDirectory()) clear(path.join(dir, entry.name));
        if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    };
    for (const top of ASSET_ROOTS) for (const entry of fs.existsSync(path.join(target, top)) ? fs.readdirSync(path.join(target, top), { withFileTypes: true }) : []) {
        if (entry.isDirectory()) clear(path.join(target, top, entry.name));
    }
    return removed;
}

/** One line for a build log: how many files and megabytes stay out. */
function describe(analysis) {
    const mb = (analysis.unusedBytes / 1024 / 1024).toFixed(1);
    return `${analysis.unused.length} unused file${analysis.unused.length === 1 ? '' : 's'} (${mb} MB) left out; ${analysis.keptCount} asset files ship`
        + (analysis.playtestRecord ? '' : '. No playtest record yet: play the game once from the editor to add what it loads');
}

module.exports = { analyze, prune, describe, readSettings, writeSettings, keyOf, effectResources, namePrefixes, patternTest, USAGE_FILE, SETTINGS_FILE, ASSET_ROOTS };
