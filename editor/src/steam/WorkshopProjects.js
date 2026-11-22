/**
 * Whole projects as Steam Workshop items: a template, a sample or a game to learn from, shared from the Forge's
 * Steam Workshop page and opened from it as a new project.
 *
 * What goes up, and what comes back down, is the project's own content and nothing that runs by itself:
 *   - its data, pictures, audio, models, effects, fonts and Forge designs (the file types in ASSET_EXTENSIONS);
 *   - its plugins (js/plugins/*.js) and their list, which come back with every plugin turned off;
 *   - never the engine (the rest of js/), index.html, package.json, saves, links, hidden files or programs: the
 *     editor installs its own engine when the project is opened, as for any project;
 *   - never a file on the list in stock-asset-hashes.json (by content).
 * The same rules are applied when an item is opened, so an item made some other way is held to them too.
 */
(function(root) {
    'use strict';
    const fs = () => require('fs'), path = () => require('path');

    const FORMAT = 'rpg-reactor-project';
    const VERSION = 1;
    const MANIFEST = 'rpg-reactor-project.json';
    const TAG = 'Project';
    const MAX_MANIFEST = 1024 * 1024;
    /** Data and assets a project is made of. A script is kept only as a plugin, under js/plugins. */
    const ASSET_EXTENSIONS = new Set([
        'json', 'txt', 'md', 'csv', 'css',
        'png', 'jpg', 'jpeg', 'webp', 'gif', 'jxl', 'bmp', 'ico', 'psd',
        'ogg', 'm4a', 'mp3', 'wav', 'opus', 'flac',
        'webm', 'mp4',
        'glb', 'gltf', 'bin', 'vrm', 'fbx', 'obj', 'mtl',
        'efkefc', 'efkmat', 'efkmodel', 'efkcurve',
        'ttf', 'otf', 'woff', 'woff2',
        'rpgreactor', 'rmmzproject', 'rpgproject',
        'rpgmvp', 'rpgmvo', 'rpgmvm', 'png_', 'ogg_', 'm4a_'
    ]);
    /** Folders at the project's root that are never shared: saves, packages, builds, a playtest's copy of the Forge. */
    const SKIP_TOP = new Set(['save', 'node_modules', 'dist', 'build', 'deploy', 'output', 'reactor-builder']);
    /** Files at the project's root that the editor makes for itself. */
    const SKIP_ROOT_FILES = new Set(['index.html', 'package.json', 'package-lock.json']);
    const PLUGIN_LISTS = ['plugins.js', 'reactor_plugins.js'];
    /** Where this project notes the Workshop item it went up as (with the designs' own notes). */
    const PUBLISHED_KEY = 'project/';

    let stockHashes = null;
    function stock() {
        if (stockHashes) return stockHashes;
        try {
            const file = path().join(__dirname_(), 'stock-asset-hashes.json');
            stockHashes = JSON.parse(fs().readFileSync(file, 'utf8')).hashes || {};
        } catch (_) { stockHashes = {}; }
        return stockHashes;
    }
    // This file's folder: under NW.js scripts load from index.html, so src/steam is found from the app's root.
    function __dirname_() {
        if (typeof __dirname !== 'undefined' && /steam$/.test(__dirname)) return __dirname;
        const base = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
        const p = path();
        for (const dir of [p.join(base, 'src', 'steam'), p.join(base, 'editor', 'src', 'steam')]) if (fs().existsSync(p.join(dir, 'stock-asset-hashes.json'))) return dir;
        return p.join(base, 'src', 'steam');
    }
    function fingerprint(file) {
        return require('crypto').createHash('sha256').update(fs().readFileSync(file)).digest('hex').slice(0, 20);
    }

    /**
     * Whether a file at `rel` (forward slashes, relative to the project) may be in a shared project: answers '' when
     * it may, else why not ('engine', 'program', 'hidden', 'save', 'type').
     */
    function excluded(rel) {
        const parts = rel.split('/');
        if (parts.some(part => !part || part === '.' || part === '..')) return 'path';
        if (parts.some(part => part.startsWith('.'))) return 'hidden';
        if (parts.length > 1 && SKIP_TOP.has(parts[0].toLowerCase())) return 'save';
        if (parts.length === 1 && SKIP_ROOT_FILES.has(parts[0].toLowerCase())) return 'engine';
        if (parts.length === 1 && /^rpgmaker-runtime-backup(-\d+)?\.zip$/i.test(parts[0])) return 'engine';
        if (parts.length === 1 && parts[0] === MANIFEST) return 'engine';
        if (parts[0] === 'forge' && parts[1] === 'workshop.json' && parts.length === 2) return 'save';
        const ext = (parts[parts.length - 1].match(/\.([^.]+)$/) || [])[1];
        const lower = ext ? ext.toLowerCase() : '';
        if (parts[0] === 'js') {
            if (parts.length === 2 && PLUGIN_LISTS.includes(parts[1])) return '';
            if (parts.length === 3 && parts[1] === 'plugins' && lower === 'js') return '';
            return 'engine';
        }
        if (!lower || !ASSET_EXTENSIONS.has(lower)) return 'type';
        return '';
    }

    /**
     * What sharing this project would send: { files: [{ rel, size }], bytes, left: { stock: [rel], other: count },
     * plugins: [name] }. Links and anything excluded() refuses are left out.
     */
    function collect(projectPath) {
        const io = fs(), p = path(), files = [], left = { stock: [], other: 0 };
        const hashes = stock();
        let bytes = 0;
        const walk = (dir, rel) => {
            for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
                const childRel = rel ? rel + '/' + entry.name : entry.name, full = p.join(dir, entry.name);
                if (entry.isSymbolicLink()) { left.other++; continue; }
                if (entry.isDirectory()) {
                    if (entry.name.startsWith('.') || (!rel && SKIP_TOP.has(entry.name.toLowerCase()))) continue;
                    walk(full, childRel);
                    continue;
                }
                if (!entry.isFile()) continue;
                if (excluded(childRel)) { left.other++; continue; }
                if (Object.keys(hashes).length && /\.(png|jpe?g|webp|ogg|m4a|mp3|wav|efkefc|efkmodel|efkmat|mp4|webm|rpgmvp|rpgmvo|rpgmvm)$/i.test(entry.name) && hashes[fingerprint(full)]) {
                    left.stock.push(childRel);
                    continue;
                }
                const size = io.statSync(full).size;
                files.push({ rel: childRel, size });
                bytes += size;
            }
        };
        walk(projectPath, '');
        const plugins = files.filter(f => /^js\/plugins\/[^/]+\.js$/.test(f.rel)).map(f => f.rel.slice(11, -3));
        return { files, bytes, left, plugins };
    }

    /** The project's settings that the engine files carried: whether index.html runs MV's rules. */
    function mvCompat(projectPath) {
        try { return /\$reactorMvCompat\s*=\s*true/.test(fs().readFileSync(path().join(projectPath, 'index.html'), 'utf8')); } catch (_) { return false; }
    }

    /**
     * Lay the project out as a Workshop item under `stageRoot`: { contentPath, folder, count, bytes, left }. The
     * preview is written by the caller (a picture of the project, at most 1 MB) at `folder/preview.jpg`.
     */
    function stage(stageRoot, projectPath, { title = '' } = {}) {
        const io = fs(), p = path();
        const list = collect(projectPath);
        if (!list.files.some(f => f.rel === 'data/System.json')) throw new Error('This project has no data/System.json.');
        const folder = p.join(stageRoot, 'project-' + Date.now().toString(36)), content = p.join(folder, 'content');
        io.mkdirSync(content, { recursive: true });
        for (const file of list.files) {
            const to = p.join(content, ...file.rel.split('/'));
            io.mkdirSync(p.dirname(to), { recursive: true });
            io.copyFileSync(p.join(projectPath, ...file.rel.split('/')), to);
        }
        const manifest = { format: FORMAT, version: VERSION, title: String(title || p.basename(projectPath)).slice(0, 128), mvCompat: mvCompat(projectPath), files: list.files.length, plugins: list.plugins };
        io.writeFileSync(p.join(content, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
        return { contentPath: content, folder, count: list.files.length, bytes: list.bytes, left: list.left };
    }

    /**
     * A subscribed item's folder, read: { kind: 'project', name, mvCompat, plugins, folder } when it is a shared
     * project, null when it is something else (a design), or an Error when it is a project this editor can't open.
     */
    function readItem(folder) {
        const io = fs(), file = path().join(folder, MANIFEST);
        let stat;
        try { stat = io.lstatSync(file); } catch (_) { return null; }
        if (!stat.isFile() || stat.size > MAX_MANIFEST) return new Error('This Workshop item is not a project RPG Reactor can open.');
        let manifest;
        try { manifest = JSON.parse(io.readFileSync(file, 'utf8')); } catch (_) { return new Error('This Workshop item is not a project RPG Reactor can open.'); }
        if (!manifest || manifest.format !== FORMAT || !(manifest.version >= 1)) return new Error('This Workshop item is not a project RPG Reactor can open.');
        if (manifest.version > VERSION) return new Error('This project needs a newer RPG Reactor.');
        let system;
        try { system = io.lstatSync(path().join(folder, 'data', 'System.json')); } catch (_) { system = null; }
        if (!system || !system.isFile()) return new Error('This Workshop item is not a project RPG Reactor can open.');
        const name = String(manifest.title || '').trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '').replace(/^\.+/, '').slice(0, 64) || 'Workshop Project';
        return { kind: 'project', name, mvCompat: manifest.mvCompat === true, plugins: Array.isArray(manifest.plugins) ? manifest.plugins.map(String).slice(0, 500) : [], folder };
    }

    /** A plugin list (js/plugins.js) as data, every plugin turned off; null when it is not plain data. */
    function pluginsOff(text) {
        const match = /^\s*(?:\/\/[^\n]*\n\s*)*var\s+\$plugins\s*=\s*([\s\S]*?);?\s*$/.exec(String(text || ''));
        if (!match) return null;
        let list;
        try { list = JSON.parse(match[1]); } catch (_) { return null; }
        if (!Array.isArray(list)) return null;
        const clean = list.filter(entry => entry && typeof entry === 'object' && typeof entry.name === 'string')
            .map(entry => Object.assign({}, entry, { status: false }));
        return 'var $plugins =\n' + JSON.stringify(clean, null, 0).replace(/\},\{/g, '},\n{') + ';\n';
    }

    /**
     * Copy a read item into `destination` (a folder that must not exist yet), by the same rules it was shared by,
     * with its plugins turned off. Answers { files, left }. The caller installs the engine (ProjectManager) next.
     */
    function copyInto(item, destination) {
        const io = fs(), p = path();
        if (io.existsSync(destination)) throw new Error('A folder of that name is already there.');
        io.mkdirSync(destination, { recursive: true });
        const hashes = stock();
        let files = 0, left = 0;
        const walk = (dir, rel) => {
            for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
                const childRel = rel ? rel + '/' + entry.name : entry.name, full = p.join(dir, entry.name);
                if (entry.isSymbolicLink()) { left++; continue; }
                if (entry.isDirectory()) { if (!entry.name.startsWith('.')) walk(full, childRel); continue; }
                if (!entry.isFile() || excluded(childRel)) { left++; continue; }
                if (Object.keys(hashes).length && /\.(png|jpe?g|webp|ogg|m4a|mp3|wav|efkefc|efkmodel|efkmat|mp4|webm)$/i.test(entry.name) && hashes[fingerprint(full)]) { left++; continue; }
                const to = p.join(destination, ...childRel.split('/'));
                io.mkdirSync(p.dirname(to), { recursive: true });
                if (childRel.startsWith('js/') && PLUGIN_LISTS.includes(childRel.slice(3))) {
                    io.writeFileSync(to, pluginsOff(io.readFileSync(full, 'utf8')) || 'var $plugins = [];\n');
                } else {
                    io.copyFileSync(full, to);
                }
                files++;
            }
        };
        walk(item.folder, '');
        return { files, left };
    }

    /** Tests hand in their own list. */
    function useStockHashes(hashes) { stockHashes = hashes || {}; }

    const api = { useStockHashes, FORMAT, VERSION, MANIFEST, TAG, PUBLISHED_KEY, ASSET_EXTENSIONS, excluded, collect, mvCompat, stage, readItem, pluginsOff, copyInto };
    root.RRWorkshopProjects = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
