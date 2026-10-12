/**
 * LegacyImporter - imports an RPG Maker 2000/2003 project into a new RPG
 * Reactor project. Node only (files and PNGs); the editor runs it in a
 * worker and the CLI (`build-scripts/import-legacy-project.cjs`) calls it
 * directly. The conversion itself is in the pure modules beside this one:
 * LcfReader (the files), LegacyConvert (tilesets, maps, images),
 * LegacyDatabase (records) and LegacyCommands (event commands).
 *
 *   report(source, { encoding })                      → what the project holds
 *   importProject(source, destination, options)       → the written project's summary (a promise for 2000/2003)
 *
 * options: maps (array of ids), skipAssets, force, encoding, language (a Language/<name>
 * folder of EasyRPG-style .po files, baked into every text), log(message).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = require('./LcfReader.js');
const K = require('./LegacyConvert.js');
const C = require('./LegacyCommands.js');
const D = require('./LegacyDatabase.js');
const F = require('./LegacyFont.js');
const PF = require('./ProjectFiles.js');
const LL = require('./LegacyLanguages.js');

function printReport(report) {
    const line = (s = '') => console.log(s);
    const { database, maps, commands } = report;
    line(`${report.engine} project "${report.title || '(untitled)'}" at ${report.source}`);
    line(`Text read as ${report.encoding}; ${maps.count} maps, ${database.commonevents} common events, ${commands.total} event commands, read in ${report.readMs} ms.`);
    line(); line('Database');
    for (const [k, v] of Object.entries(database)) line(`  ${k.padEnd(18)} ${String(v).padStart(6)}`);
    line(`  ${'switches named'.padEnd(18)} ${String(report.switchesNamed).padStart(6)} of ${database.switches}`);
    line(`  ${'variables named'.padEnd(18)} ${String(report.variablesNamed).padStart(6)} of ${database.variables}`);
    line(); line(`Maps: ${maps.count} (${maps.areas} areas in the tree), ${maps.totalEvents} events on ${maps.totalPages} pages; largest ${maps.largest ? `${maps.largest.width}×${maps.largest.height} "${maps.largest.name}"` : 'none'}.`);
    if (maps.start) line(`  Party starts on map ${maps.start.party_map_id} at (${maps.start.party_x}, ${maps.start.party_y}).`);
    if (maps.missingFiles.length) line(`  Map files missing: ${maps.missingFiles.join(', ')}`);
    line(); line('Event commands by what the import does with them');
    const words = { direct: 'one Reactor command', approx: 'a Reactor command with a documented difference', structural: 'folded into another command', comment: 'kept as a comment', none: 'nothing to carry', unknown: 'unknown code' };
    for (const [t, n] of Object.entries(commands.byTarget).sort((a, b) => b[1] - a[1])) line(`  ${t.padEnd(11)} ${String(n).padStart(7)}  ${words[t]}`);
    line(); line('Most used commands');
    for (const c of commands.list.slice(0, 20)) line(`  ${String(c.code).padStart(6)} ${(c.name || '?').padEnd(30)} ${String(c.count).padStart(7)}  ${c.target}`);
    if (commands.unknownCodes.length) line(`  Unknown codes: ${commands.unknownCodes.map(u => `${u.code}×${u.count}`).join(', ')}`);
    line();
    if (report.dynrpg.total) {
        line(`DynRPG comment commands: ${report.dynrpg.total} in ${report.dynrpg.families.length} families`);
        for (const f of report.dynrpg.families.slice(0, 25)) line(`  ${f.name.padEnd(28)} ${String(f.count).padStart(6)}`);
        if (report.dynrpg.families.length > 25) line(`  … and ${report.dynrpg.families.length - 25} more`);
        line();
    }
    line('Assets');
    for (const [folder, a] of Object.entries(report.assets)) {
        if (a.formats) line(`  ${folder.padEnd(14)} ${String(a.files).padStart(5)} files  ${Object.entries(a.formats).map(([e, n]) => `${e}×${n}`).join(' ')}`);
        else line(`  ${folder.padEnd(14)} ${String(a.files).padStart(5)} files  ${a.expected ? `standard ${a.expected}, ${a.offSize} other` : 'free size'}${a.other ? `, ${a.other} not PNG` : ''}  [${a.sizes.join(' ')}]`);
    }
    line();
    if (report.missingFiles.length) {
        line(`Files the data names that are not on disk: ${report.missingFiles.length}`);
        for (const m of report.missingFiles.slice(0, 15)) line(`  ${m.file.padEnd(40)} ×${m.uses}  first seen in ${m.where}`);
        if (report.missingFiles.length > 15) line(`  … and ${report.missingFiles.length - 15} more`);
    } else line('Every file the data names is on disk.');
}

/**
 * The RPG Maker 2000 or 2003 RTP folder: options.rtpPath, else the variable
 * EasyRPG reads (RPG2K_RTP_PATH / RPG2K3_RTP_PATH), else the path the Windows
 * installer writes to the registry, then folders the author chose before
 * (options.known), where the installers put it (and the same under Wine's
 * default prefix), EasyRPG's own RTP folders, and an RTP folder beside the
 * game (options.source). A folder counts when it holds CharSet and ChipSet.
 */
function rtpCandidates(engine, options = {}) {
    const is2003 = /2003/.test(String(engine || ''));
    const env = is2003 ? [process.env.RPG2K3_RTP_PATH, process.env.RPG2K_RTP_PATH] : [process.env.RPG2K_RTP_PATH, process.env.RPG2K3_RTP_PATH];
    const version = is2003 ? ['RPG2003', 'RPG Maker 2003'] : ['RPG2000', 'RPG Maker 2000'];
    const found = [options.rtpPath, ...env, ...registryRtp(is2003), ...(options.known || [])];
    const programFiles = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:\\Program Files (x86)', 'C:\\Program Files'];
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (home) programFiles.push(path.join(home, '.wine', 'drive_c', 'Program Files (x86)'), path.join(home, '.wine', 'drive_c', 'Program Files'));
    for (const base of programFiles.filter(Boolean)) {
        for (const vendor of ['ASCII', 'Enterbrain', 'KADOKAWA', 'Common Files/Enterbrain', path.join('Steam', 'steamapps', 'common')]) {
            for (const v of version) found.push(path.join(base, vendor, v, 'RTP'));
        }
    }
    // Where Import Project downloads the official RTP, then EasyRPG Player's folders: $XDG_DATA_HOME/rtp/2000, the system share.
    const year = is2003 ? '2003' : '2000';
    const downloaded = require('./RtpManager.js').downloadFolder(engine);
    // An unpack beside an RTP the user keeps there lands in <folder>-2.
    for (const d of [downloaded, downloaded + '-donmiguel', downloaded + '-other']) found.push(d, d + '-2');
    const xdg = process.env.XDG_DATA_HOME || (home && path.join(home, '.local', 'share'));
    if (xdg) found.push(path.join(xdg, 'rtp', year));
    found.push(path.join('/usr/share/rtp', year), path.join('/usr/local/share/rtp', year));
    if (home) found.push(path.join(home, 'Library', 'Application Support', 'RTP', year));
    // An RTP folder kept with the game: inside it, or beside it.
    if (options.source) {
        const game = path.resolve(options.source);
        for (const dir of [game, path.dirname(game)]) for (const name of ['RTP', `RTP ${year}`, `RTP${year}`, `RPG${year === '2000' ? '2000' : '2003'} RTP`]) found.push(path.join(dir, name));
    }
    return found.filter(Boolean);
}

function isRtpFolder(dir) {
    try { const names = fs.readdirSync(dir).map(n => n.toLowerCase()); return names.includes('charset') && names.includes('chipset'); } catch (_) { return false; }
}

/** The RTP paths the Windows installers record (HKCU/HKLM, 32-bit view too); none elsewhere. */
function registryRtp(is2003) {
    if (process.platform !== 'win32') return [];
    const keys = is2003
        ? ['Software\\Enterbrain\\RPG2003', 'Software\\ASCII\\RPG2003', 'Software\\WOW6432Node\\Enterbrain\\RPG2003']
        : ['Software\\ASCII\\RPG2000', 'Software\\Enterbrain\\RPG2000', 'Software\\WOW6432Node\\ASCII\\RPG2000'];
    const out = [];
    for (const hive of ['HKCU', 'HKLM']) for (const key of keys) {
        try {
            const text = require('child_process').execFileSync('reg', ['query', `${hive}\\${key}`, '/v', 'RuntimePackagePath'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
            const m = /RuntimePackagePath\s+REG_\w+\s+(.+)/i.exec(text);
            if (m) out.push(m[1].trim());
        } catch (_) { /* key absent */ }
    }
    return out;
}

/**
 * The RTP to import from: options.rtpPath when it is one; otherwise, of every
 * RTP found, the one answering to most of the names the game uses
 * (options.referenced, by RTP folder), the first found on a tie or without them.
 * None when options.noRtp says the author chose to import without one.
 */
function findRtp(engine, options = {}) {
    if (options.noRtp) return null;
    const seen = new Set(), folders = [];
    for (const dir of rtpCandidates(engine, options)) {
        const full = path.resolve(dir);
        if (!seen.has(full) && isRtpFolder(full)) { seen.add(full); folders.push(full); }
    }
    if (!folders.length) return null;
    if (options.rtpPath && folders[0] === path.resolve(options.rtpPath)) return folders[0];
    if (!options.referenced || folders.length === 1) return folders[0];
    const RM = require('./RtpManager.js');
    let best = folders[0], bestHits = -1;
    for (const dir of folders) { const hits = RM.coverage(dir, engine, options.referenced); if (hits > bestHits) { best = dir; bestHits = hits; } }
    return best;
}

/**
 * The 2000/2003 bitmap font: the game ships it in the old engines' few cases,
 * otherwise RPG Maker's installer put it in the system's fonts. Looked for in
 * the game, options.fontPath (a file or a folder), the RTP and the folder above
 * it, then the font folders of Windows, Wine, Linux and macOS. Null when absent.
 */
function findLegacyFont(wanted, roots) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    const system = [
        path.join(windir, 'Fonts'),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'),
        home && path.join(home, '.wine', 'drive_c', 'windows', 'Fonts'),
        home && path.join(home, '.local', 'share', 'fonts'),
        home && path.join(home, '.fonts'),
        '/usr/local/share/fonts', '/usr/share/fonts',
        home && path.join(home, 'Library', 'Fonts'), '/Library/Fonts'
    ];
    const lower = wanted.map(n => n.toLowerCase());
    const look = (dir, depth) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
        for (const name of lower) { const hit = entries.find(e => e.isFile() && e.name.toLowerCase() === name); if (hit) return path.join(dir, hit.name); }
        if (depth > 0) for (const e of entries) if (e.isDirectory()) { const hit = look(path.join(dir, e.name), depth - 1); if (hit) return hit; }
        return null;
    };
    for (const root of roots.filter(Boolean)) {
        try { if (fs.statSync(root).isFile()) { if (lower.includes(path.basename(root).toLowerCase())) return root; continue; } } catch (_) { continue; }
        const hit = look(root, 1);
        if (hit) return hit;
    }
    for (const dir of system.filter(Boolean)) { const hit = look(dir, 2); if (hit) return hit; }
    return null;
}

/**
 * The engine a game's own RPG_RT.exe is, from its version resource as EasyRPG
 * Player reads it: 1.6.x is RPG Maker 2000's English release, 1.0.x and 1.1.x
 * are RPG Maker 2003. A 2000 database is often shipped with the 2003 runtime
 * (A Blurred Line's Steam release), which then decides its menus and battles.
 * Null when there is no exe or no version to read.
 */
function runtimeEngine(folder) {
    let exe = null;
    try { const name = fs.readdirSync(folder).find(n => n.toLowerCase() === 'rpg_rt.exe'); if (name) exe = fs.readFileSync(path.join(folder, name)); } catch (_) { return null; }
    if (!exe) return null;
    const key = Buffer.from('FileVersion\0', 'utf16le');
    const at = exe.indexOf(key);
    if (at < 0) return null;
    let p = at + key.length;
    while (p + 1 < exe.length && exe[p] === 0 && exe[p + 1] === 0) p += 2;   // padding to the value
    let value = '';
    for (; p + 1 < exe.length && value.length < 32; p += 2) { const c = exe.readUInt16LE(p); if (!c) break; value += String.fromCharCode(c); }
    const m = /^(\d+)[.,]\s*(\d+)/.exec(value);
    if (!m || m[1] !== '1') return null;
    return m[2] === '6' ? 'RPG Maker 2000' : (m[2] === '0' || m[2] === '1') ? 'RPG Maker 2003' : null;
}

function open(source, destination, options) {
    options = options || {};
    source = path.resolve(source);
/** Windows projects are case-insensitive; find `name` under `root` whatever its spelling. */
    function resolveInsensitive(root, name) {
        const parts = name.split(/[\\/]/).filter(Boolean);
        let at = root;
        for (const part of parts) {
            if (!fs.existsSync(at)) return null;
            const entries = fs.readdirSync(at);
            const hit = entries.find(e => e === part) || entries.find(e => e.toLowerCase() === part.toLowerCase());
            if (!hit) return null;
            at = path.join(at, hit);
        }
        return fs.existsSync(at) ? at : null;
    }
    const files = {
        read: (name) => { const p = resolveInsensitive(source, name); return p && fs.statSync(p).isFile() ? fs.readFileSync(p) : null; },
        list: (dir) => { const p = resolveInsensitive(source, dir); return p && fs.statSync(p).isDirectory() ? fs.readdirSync(p) : []; }
    };
    
    const started = Date.now();
    const project = L.readProject(files, { encoding: options.encoding || undefined });
    const db = project.database;
    // The runtime the game shipped with plays it: its menus, battles and limits follow the exe, its data the database.
    db.runtime = runtimeEngine(source) || db.engine;
    const count = (arr) => (arr || []).filter(Boolean).length;
    
    // ---- inventory ------------------------------------------------------------
    function inventory() {
        const database = {};
        for (const key of ['actors', 'classes', 'skills', 'items', 'enemies', 'troops', 'states', 'attributes', 'animations', 'chipsets', 'terrains', 'commonevents', 'switches', 'variables', 'battleranimations']) database[key] = count(db[key]);
        const mapInfos = (project.tree ? project.tree.maps : []).filter(Boolean);
        const maps = [];
        let largest = null, totalEvents = 0, totalPages = 0;
        for (const info of mapInfos) {
            if (info.type !== 1) continue;
            const map = project.maps[info.id];
            if (!map) continue;
            const events = count(map.events);
            const pages = (map.events || []).filter(Boolean).reduce((n, e) => n + count(e.pages), 0);
            totalEvents += events; totalPages += pages;
            const entry = { id: info.id, name: info.name, parent: info.parent_map, width: map.width, height: map.height, chipset: map.chipset_id, events, pages, parallax: map.parallax_name || null };
            maps.push(entry);
            if (!largest || map.width * map.height > largest.width * largest.height) largest = entry;
        }
        const byCode = new Map(), dyn = new Map();
        let commandTotal = 0;
        const tally = (commands, where) => {
            for (const c of commands || []) {
                commandTotal++;
                const e = byCode.get(c.code) || { code: c.code, name: L.COMMAND_NAMES[c.code] || null, target: L.COMMAND_TARGETS[c.code] || 'unknown', count: 0, where: new Set() };
                e.count++; e.where.add(where); byCode.set(c.code, e);
                if (c.code === 12410 || c.code === 22410) { const name = L.dynCommand(c.string); if (name) dyn.set(name, (dyn.get(name) || 0) + 1); }
            }
        };
        for (const ce of (db.commonevents || []).filter(Boolean)) tally(ce.event_commands, 'common events');
        for (const t of (db.troops || []).filter(Boolean)) for (const pg of (t.pages || []).filter(Boolean)) tally(pg.event_commands, 'troop pages');
        for (const id in project.maps) for (const e of (project.maps[id].events || []).filter(Boolean)) for (const pg of (e.pages || []).filter(Boolean)) tally(pg.event_commands, 'map events');
        const commands = Array.from(byCode.values()).map(e => ({ ...e, where: Array.from(e.where) })).sort((a, b) => b.count - a.count);
        const targets = {};
        for (const c of commands) targets[c.target] = (targets[c.target] || 0) + c.count;
        const dynFamilies = Array.from(dyn.entries()).map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
        const assets = {};
        for (const folder of Object.keys(L.IMAGE_SPECS)) {
            const names = files.list(folder);
            if (!names.length) continue;
            const sizes = new Map();
            let png = 0, other = 0;
            for (const n of names) {
                const full = path.join(resolveInsensitive(source, folder), n);
                if (!fs.statSync(full).isFile()) continue;
                if (/\.png$/i.test(n)) { png++; const s = pngSize(full); const key = s ? `${s[0]}x${s[1]}` : 'unreadable'; sizes.set(key, (sizes.get(key) || 0) + 1); } else other++;
            }
            const spec = L.IMAGE_SPECS[folder];
            const expected = spec.width ? `${spec.width}x${spec.height}` : null;
            const offSize = expected ? Array.from(sizes.entries()).filter(([k]) => k !== expected).reduce((n, [, v]) => n + v, 0) : 0;
            assets[folder] = { files: png + other, png, other, expected, offSize, sizes: Array.from(sizes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`) };
        }
        for (const folder of ['Music', 'Sound', 'Movie']) {
            const names = files.list(folder);
            if (!names.length) continue;
            const ext = {};
            for (const n of names) { const e = (n.match(/\.([a-z0-9]+)$/i) || [, '(none)'])[1].toLowerCase(); ext[e] = (ext[e] || 0) + 1; }
            assets[folder] = { files: names.length, formats: ext };
        }
        const listed = {};
        const has = (folder, name) => { if (!name) return true; if (!listed[folder]) listed[folder] = new Set(files.list(folder).map(n => n.replace(/\.[^.]+$/, '').toLowerCase())); return listed[folder].has(String(name).toLowerCase()); };
        const missing = new Map();
        const note = (folder, name, where) => { if (!has(folder, name)) { const k = `${folder}/${name}`; const m = missing.get(k) || { file: k, uses: 0, where }; m.uses++; missing.set(k, m); } };
        for (const c of (db.chipsets || []).filter(Boolean)) note('ChipSet', c.chipset_name, `chipset ${c.id}`);
        for (const a of (db.actors || []).filter(Boolean)) { note('CharSet', a.character_name, `actor ${a.id}`); note('FaceSet', a.face_name, `actor ${a.id}`); }
        for (const e of (db.enemies || []).filter(Boolean)) note('Monster', e.battler_name, `enemy ${e.id}`);
        for (const a of (db.animations || []).filter(Boolean)) note(a.large ? 'Battle2' : 'Battle', a.animation_name, `animation ${a.id}`);
        const sys = db.system || {};
        note('Title', sys.title_name, 'system'); note('GameOver', sys.gameover_name, 'system'); note('System', sys.system_name, 'system'); note('System2', sys.system2_name, 'system');
        for (const m of maps) { const map = project.maps[m.id]; if (map.parallax_flag) note('Panorama', map.parallax_name, `map ${m.id}`); for (const e of (map.events || []).filter(Boolean)) for (const pg of (e.pages || []).filter(Boolean)) note('CharSet', pg.character_name, `map ${m.id} event ${e.id}`); }
        return {
            source: path.resolve(source), engine: db.engine, title: (project.ini.RPG_RT && project.ini.RPG_RT.GameTitle) || null, encoding: project.encoding, readMs: Date.now() - started,
            database, switchesNamed: (db.switches || []).filter(s => s && s.name).length, variablesNamed: (db.variables || []).filter(v => v && v.name).length,
            maps: { count: maps.length, areas: mapInfos.filter(m => m.type === 2).length, missingFiles: project.missing, largest, totalEvents, totalPages, start: project.tree ? project.tree.start : null },
            commands: { total: commandTotal, byTarget: targets, unknownCodes: commands.filter(c => !c.name).map(c => ({ code: c.code, count: c.count })), list: commands },
            dynrpg: { total: dynFamilies.reduce((n, f) => n + f.count, 0), families: dynFamilies },
            assets, missingFiles: Array.from(missing.values()).sort((a, b) => b.uses - a.uses), mapList: maps
        };
    }
    
    function pngSize(file) {
        const fd = fs.openSync(file, 'r');
        const head = Buffer.alloc(24);
        fs.readSync(fd, head, 0, 24, 0);
        fs.closeSync(fd);
        if (head.toString('latin1', 1, 4) !== 'PNG') return null;
        return [head.readUInt32BE(16), head.readUInt32BE(20)];
    }
    
    
    // ---- writing the project ---------------------------------------------------
    const { PNG } = require('pngjs');
    const EditorPaths = require('./EditorPaths.js');
    const editorPackage = EditorPaths.editorPackage();
    // Found when an import starts; a report does not need it.
    let runtime = null;
    
    /** Decode a PNG to RGBA, and make palette entry 0 transparent when `key` is set (the 2000/2003 rule). */
    function decodePng(bytes, key) {
        const png = PNG.sync.read(bytes);
        const img = { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
        if (key) {
            const first = paletteFirst(bytes);
            if (first) K.keyColour(img, first[0], first[1], first[2]);
        }
        return img;
    }
    /** The first PLTE entry of a PNG, or null when it has no palette. */
    function paletteFirst(bytes) {
        let pos = 8;
        while (pos + 8 <= bytes.length) {
            const len = bytes.readUInt32BE(pos), type = bytes.toString('latin1', pos + 4, pos + 8);
            if (type === 'PLTE') return [bytes[pos + 8], bytes[pos + 9], bytes[pos + 10]];
            if (type === 'IDAT' || type === 'IEND') return null;
            pos += 12 + len;
        }
        return null;
    }
    function encodePng(img) {
        const png = new PNG({ width: img.width, height: img.height });
        png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
        return PNG.sync.write(png);
    }
    
    const notes = { maps: {}, images: {}, skipped: [] };
    const addNote = (bucket, key, n = 1) => { bucket[key] = (bucket[key] || 0) + n; };
    const safeName = (name) => String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
    const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
    const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
    
    function copyTree(from, to) {
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
            const s = path.join(from, entry.name), d = path.join(to, entry.name);
            if (entry.isDirectory()) { mkdir(d); copyTree(s, d); } else { mkdir(path.dirname(d)); fs.copyFileSync(s, d); }
        }
    }
    
    let assetProgress = null;
    const stepAsset = (folder, name) => {
        if (!assetProgress) return;
        assetProgress.done++;
        // Every file would flood the channel; a few hundred updates read as smooth.
        if (assetProgress.done % 10 === 0 || assetProgress.done === assetProgress.total) assetProgress.report(assetProgress.done, assetProgress.total, `${folder}: ${name}`);
    };
    const countFiles = (dir) => { let n = 0; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1; return n; };

    /** Every file of a source image folder, decoded, written to a project folder; subfolders kept. */
    // Node's zlib releases each stream's memory on a later turn of the event loop, never inside a
    // synchronous run: decoding thousands of pictures without a pause held gigabytes, and inside the
    // editor (where the worker shares the page's process) that crashed it. The image passes breathe.
    const breathe = () => new Promise(resolve => setImmediate(resolve));
    let sinceBreath = 0;
    const maybeBreathe = async () => { if (++sinceBreath >= 16) { sinceBreath = 0; await breathe(); } };

    async function importImages(folder, target, options) {
        const root = options.root !== undefined ? options.root : resolveInsensitive(source, folder);
        if (!root) return 0;
        let written = 0;
        const walk = async (dir, rel) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) { await walk(full, path.join(rel, entry.name)); continue; }
                if (!/\.png$/i.test(entry.name)) {
                    // Another image format is art the game meant to show; saves, notes and the like left in an art folder are not.
                    if (/\.(bmp|xyz|jpe?g|gif)$/i.test(entry.name)) notes.skipped.push(`${folder}/${path.join(rel, entry.name)}: not PNG`);
                    continue;
                }
                const base = entry.name.replace(/\.png$/i, '');
                // From the RTP, only what the game names.
                if (options.only && !options.only.has(((options.rename ? options.rename(base) : base)).toLowerCase()) && !options.only.has(path.join(rel, base).replace(/\\/g, '/').toLowerCase())) continue;
                const keying = typeof options.key === 'function' ? options.key(base) : options.key;
                const outDir = path.join(destination, target, rel);
                await maybeBreathe();
                const bytes = fs.readFileSync(full);
                stepAsset(folder, entry.name);
                for (const [key, suffix] of keying === 'both' ? [[true, ''], [false, ' (opaque)']] : [[!!keying, '']]) {
                    let img;
                    try { img = decodePng(bytes, key); }
                    catch (error) { notes.skipped.push(`${folder}/${entry.name}: ${error.message}`); break; }
                    if (options.transform) img = options.transform(img, entry.name);
                    const outName = (options.rename ? options.rename(base) : base) + suffix + '.png';
                    mkdir(outDir);
                    fs.writeFileSync(path.join(outDir, safeName(outName)), encodePng(img));
                    written++;
                }
            }
        };
        await walk(root, '');
        addNote(notes.images, folder, written);
        return written;
    }
    
    function importAudio(folder, target, from = {}) {
        const root = from.root !== undefined ? from.root : resolveInsensitive(source, folder);
        if (!root) return 0;
        let written = 0;
        mkdir(path.join(destination, target));
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (from.only && !from.only.has(entry.name.replace(/\.[^.]+$/, '').toLowerCase())) continue;
            stepAsset(folder, entry.name);
            // The old engine found "Song.ogg.ogg" when the data asked for "Song.ogg"; the runtime wants one extension.
            let name = entry.name;
            const doubled = /^(.*\.(ogg|mp3|wav|flac|m4a|mid|midi))\.\2$/i.exec(name);
            if (doubled) { name = doubled[1]; addNote(notes.images, 'renamed', 1); }
            fs.copyFileSync(path.join(root, entry.name), path.join(destination, target, safeName(name)));
            written++;
        }
        addNote(notes.images, folder, written);
        return written;
    }
    
    // The RTP view an import made (a temporary folder for Don Miguel's names) goes when the import ends, however it ends.
    let rtpCleanup = null;
    async function importProject() {
        try { return await importBody(); } finally { if (rtpCleanup) { rtpCleanup(); rtpCleanup = null; } }
    }

    async function importBody() {
        // log(message, level): level is 'stage', 'info', 'warn' or 'done'; a console ignores it.
        const log = typeof options.log === 'function' ? options.log : () => {};
        // progress(fraction 0..1, status): the import's weight is mostly maps and pictures.
        const report = typeof options.progress === 'function' ? options.progress : () => {};
        const span = (from, to) => (done, total, status) => report(from + (to - from) * (total ? Math.min(1, done / total) : 1), status);
        const dest = path.resolve(destination);
        runtime = EditorPaths.runtime();
        if (fs.existsSync(dest) && fs.readdirSync(dest).length && !options.force) throw new Error(`${dest} exists and is not empty.`);
        mkdir(dest);
        const t0 = Date.now();
        const title = (project.ini.RPG_RT && project.ini.RPG_RT.GameTitle) || path.basename(source);
        const sys = db.system || {};
        // A game built with FullPackageFlag=1 carries everything; otherwise it may take files from the RTP.
        const needsRtp = String((project.ini.RPG_RT || {}).FullPackageFlag || '0').trim() !== '1';
        // Which RTP the game's names are, and the RTP on hand that answers to most of them. An RTP made for
        // other names (the official one for a game made with Don Miguel's, or the reverse) is read through a
        // temporary copy holding each file under both names; files no RTP on hand has are reported.
        const RM = require('./RtpManager.js');
        const shipped = (folder, name) => ['.png', '.bmp', '.xyz', '.wav', '.mid', '.ogg', '.mp3'].some(e => !!resolveInsensitive(source, path.join(folder, name + e)));
        const referenced = needsRtp ? RM.referencedNames(db, project.tree, shipped) : null;
        const rtpUse = referenced ? RM.classify(db.engine, referenced) : null;
        const rtpFound = needsRtp ? findRtp(db.engine, Object.assign({ source, referenced }, options)) : null;
        if (rtpFound) log(`  RTP: ${rtpFound}`, 'info');
        const rtpView = rtpFound ? RM.translatedView(rtpFound, db.engine) : { folder: null, cleanup() {} };
        const rtp = rtpView.folder;
        rtpCleanup = rtpView.cleanup;
        if (rtpFound && rtp !== rtpFound && rtpUse && /^donMiguel/.test(rtpUse.variant) && RM.isOfficial(rtpFound, db.engine)) log('  The game names its RTP files as Don Miguel\'s English RTP did; the official names stand in for them.', 'info');
        const addonMissing = rtp && rtpUse ? rtpUse.addon.filter(ref => { const [folder, name] = ref.split('/'); return !['.png', '.wav', '.mid'].some(e => resolveInsensitive(rtp, path.join(folder, name + e))); }) : [];
        if (addonMissing.length) {
            notes.skipped.push(`Don Miguel's RTP Addon: the game uses ${addonMissing.length} files only it has (${addonMissing.join(', ')}); choose a Don Miguel RTP (a folder, or his RTPE.exe)`);
            log(`  ${addonMissing.length} files come from Don Miguel's RTP Addon, which this RTP does not have: ${addonMissing.join(', ')}.`, 'warn');
        }

        log('Copying the project skeleton and runtime…', 'stage');
        report(0, 'Copying the project skeleton and runtime…');
        // 1. Skeleton: an empty project with its system pictures (icons, balloons, window skin), then the runtime.
        EditorPaths.copySkeleton(dest, r => {
            if (options.skipAssets && r === 'img/system/Window.png' && fs.existsSync(path.join(dest, 'img', 'system', 'Window.png'))) return true;   // a converted skin survives a data-only re-import
            return r.startsWith('js/');
        });
        mkdir(path.join(dest, 'js'));
        for (const entry of fs.readdirSync(runtime, { withFileTypes: true })) {
            const s = path.join(runtime, entry.name), d = path.join(dest, 'js', entry.name);
            if (entry.isDirectory()) { mkdir(d); copyTree(s, d); } else fs.copyFileSync(s, d);
        }
        fs.copyFileSync(EditorPaths.skeletonFile('js/reactor_plugins.js'), path.join(dest, 'js', 'reactor_plugins.js'));
        for (const folder of ['audio/bgm', 'audio/bgs', 'audio/me', 'audio/se', 'img/animations', 'img/characters', 'img/enemies', 'img/faces', 'img/parallaxes', 'img/pictures', 'img/tilesets', 'img/titles1', 'img/titles2', 'img/battlebacks1', 'img/battlebacks2', 'img/sv_actors', 'img/sv_enemies', 'movies']) mkdir(path.join(dest, folder));
    
        log('Converting the database…', 'stage');
        report(0.04, 'Converting the database…');
        // 2. The database, whose item kinds and actors the events need. A chosen language (the game's
        // EasyRPG-style Language/<name>/*.po files) is baked into every text as it converts.
        const dbNotes = {};
        const translator = options.language ? makeTranslator(options.language) : null;
        if (options.language && !translator) notes.skipped.push(`Language/${options.language}: no translation files found; the original text is kept`);
        const converted = D.convert(db, project.tree, dbNotes, translator);
        const decoder = new TextDecoder(project.encoding);
        converted.ctx.decode = (bytes) => decoder.decode(bytes);
        // Show Picture chooses per call whether palette entry 0 is transparent; the file is keyed once, so a
        // picture shown both ways gets a second, opaque copy and the opaque-only ones are written opaque.
        const pictureUse = {};
        const effectPictures = new Set();   // picture ids any event gives a rotation or wave, so a later plain move can stop it
        {
            const scan = (cmds) => { for (const c of cmds || []) { if ((c.code === 11110 || c.code === 11120) && (c.parameters[12] === 1 || c.parameters[12] === 2)) effectPictures.add(c.parameters[0]); if (c.code === 11110 && c.string) { const u = pictureUse[C.stripExt(c.string)] || (pictureUse[C.stripExt(c.string)] = { keyed: 0, opaque: 0 }); if (c.parameters[7] > 0) u.keyed++; else u.opaque++; } } };
            for (const ce of (db.commonevents || [])) if (ce) scan(ce.event_commands);
            for (const t of (db.troops || [])) if (t) for (const pg of (t.pages || [])) if (pg) scan(pg.event_commands);
            for (const id in project.maps) for (const e of (project.maps[id].events || [])) if (e) for (const pg of (e.pages || [])) if (pg) scan(pg.event_commands);
        }
        converted.ctx.effectPictures = effectPictures;
        const pictureKeying = (name) => { const u = pictureUse[name]; return !u || !u.opaque ? true : !u.keyed ? false : 'both'; };
        converted.ctx.pictureFile = (name, transparentColor) => (!transparentColor && pictureKeying(name) === 'both' ? name + ' (opaque)' : name);
        const convertCommands = (commands) => C.convertList(commands, converted.ctx).list;
        const convertRoute = (moves) => C.convertRoute(moves, converted.ctx);
        for (const [file, records] of [['Actors', converted.actors], ['Classes', converted.classes], ['Skills', converted.skills], ['Items', converted.items], ['Weapons', converted.weapons], ['Armors', converted.armors], ['Enemies', converted.enemies], ['Troops', converted.troops], ['States', converted.states], ['Animations', converted.animations], ['CommonEvents', converted.commonEvents]]) {
            writeJson(path.join(dest, 'data', `${file}.json`), records.map(r => r || null));
        }
    
        log(`Re-cutting ${(db.chipsets || []).filter(Boolean).length} chipsets into tilesets…`, 'stage');
        const tilesetProgress = span(0.12, 0.3);
        // 2. Tilesets: one MZ tileset per chipset, four sheets each.
        const tilesets = [null];
        const chipsets = (db.chipsets || []).filter(Boolean);
        const sheetCache = new Map();
        for (const [index, chipset] of chipsets.entries()) {
            tilesetProgress(index, chipsets.length, `Tileset ${index + 1} of ${chipsets.length}`);
            await breathe();
            const stem = `chip${String(chipset.id).padStart(3, '0')}`;
            const names = { A1: '', A2: '', B: '', C: '' };
            const file = chipset.chipset_name ? (resolveInsensitive(source, path.join('ChipSet', chipset.chipset_name + '.png')) || (rtp && resolveInsensitive(rtp, path.join('ChipSet', chipset.chipset_name + '.png')))) : null;
            if (file && rtp && file.startsWith(rtp)) addNote(notes.images, 'fromRtp', 1);
            if (file) {
                let sheets = sheetCache.get(file);
                if (!sheets) {
                    try { sheets = K.chipsetToSheets(decodePng(fs.readFileSync(file), true)); }
                    catch (error) { notes.skipped.push(`ChipSet/${chipset.chipset_name}: ${error.message}`); sheets = null; }
                    sheetCache.set(file, sheets);
                }
                if (sheets) for (const key of Object.keys(names)) { names[key] = `${stem}_${key}`; fs.writeFileSync(path.join(dest, 'img', 'tilesets', `${names[key]}.png`), encodePng(sheets[key])); }
            } else if (chipset.chipset_name) notes.skipped.push(`ChipSet/${chipset.chipset_name}: missing, tileset ${chipset.id} has no images`);
            const tileset = K.tilesetJson(chipset, db.terrains, names);
            tileset.note = `<rrTerrain:${JSON.stringify(K.terrainMap(chipset))}>`;
            tilesets[chipset.id] = tileset;
        }
        writeJson(path.join(dest, 'data', 'Tilesets.json'), tilesets);
    
        log('Writing the maps and their events…', 'stage');
        const mapProgress = span(0.3, 0.55);
        // 3. Maps and the tree.
        const wanted = Array.isArray(options.maps) && options.maps.length ? new Set(options.maps.map(Number)) : null;
        const infos = K.mapInfos(project.tree);
        if (translator) for (const info of infos) if (info) { const v = translator.field('maps.name', info.name); if (v !== undefined) info.name = v; }
        const written = [];
        const baseMaps = new Map();   // file → the map as written, for the language packs
        const mapFor = (info, map, commands, route) => {
            const out = K.mapJson(map, project.tree, info.id, map.chipset_id || 1, commands, route);
            out.json.displayName = '';
            const back = K.mapBattleback(map, db.chipsets[map.chipset_id || 1], db.terrains);
            if (back) { out.json.specifyBattleback = true; out.json.battleback1Name = back; }
            return out;
        };
        const mapCount = infos.filter(Boolean).length;
        let mapIndex = 0;
        for (const info of infos) {
            if (!info) continue;
            mapProgress(mapIndex++, mapCount, `Map ${mapIndex} of ${mapCount}: ${info.name || ''}`.trim());
            const map = project.maps[info.id];
            if (!map || (wanted && !wanted.has(info.id))) { if (wanted) infos[info.id] = null; continue; }
            const { json, notes: mapNotes } = mapFor(info, map, convertCommands, convertRoute);
            writeJson(path.join(dest, 'data', `Map${String(info.id).padStart(3, '0')}.json`), json);
            baseMaps.set(`Map${String(info.id).padStart(3, '0')}.json`, json);
            for (const [k, n] of Object.entries(mapNotes)) addNote(notes.maps, k, n);
            written.push(info.id);
        }
        for (const stale of fs.readdirSync(path.join(dest, 'data'))) if (/^Map\d+\.json$/.test(stale) && !written.includes(parseInt(stale.slice(3), 10))) fs.unlinkSync(path.join(dest, 'data', stale));   // Map1000.json is map 1000
        writeJson(path.join(dest, 'data', 'MapInfos.json'), infos.map(i => i || null));
    
        // 4. System: the old engine's framework.
        const base = JSON.parse(fs.readFileSync(EditorPaths.skeletonFile('data/System.json'), 'utf8'));
        const system = D.system(K.systemJson(base, db, project.tree, project.ini), db, project.tree, dbNotes);
        if (translator) {   // terms are translated by value: the 2003 term table was laid into MZ's
            const walk = (obj) => { for (const k of Object.keys(obj)) { const v = obj[k]; if (typeof v === 'string') { const t = translator.term(v); if (t !== undefined) obj[k] = t; } else if (v && typeof v === 'object') walk(v); } };
            walk(system.terms);
            system.rrLanguage = options.language;
        }
        if (wanted && !wanted.has(system.startMapId)) { system.startMapId = written[0] || 1; system.editMapId = system.startMapId; }
        {   // Save and Load as 2003 laid them out; the bands between its windows are the system graphic's background colour (pixel 0,32).
            let background = '#000000';
            const systemFile = sys.system_name ? resolveInsensitive(source, path.join('System', sys.system_name + '.png')) : null;
            if (systemFile) {
                try {
                    const img = decodePng(fs.readFileSync(systemFile), false), i = (32 * img.width) * 4;
                    if (img.height > 32) background = '#' + [0, 1, 2].map(k => img.data[i + k].toString(16).padStart(2, '0')).join('');
                } catch (error) { /* an unreadable graphic keeps black; the skin conversion reports it */ }
            }
            system.rrLegacySaveScreen = { background };
        }
        {   // Picture slots: the game's own ids (2003 allows 1000), then room for named sprites above them.
            let maxPicture = 0;
            const scan = (cmds) => { for (const c of cmds || []) if ((c.code === 11110 || c.code === 11120 || c.code === 11130) && c.parameters[1] !== 1) maxPicture = Math.max(maxPicture, c.parameters[0] || 0, c.code === 11130 && c.parameters[1] === 2 ? (c.parameters[2] || 0) : 0); };
            for (const ce of (db.commonevents || [])) if (ce) scan(ce.event_commands);
            for (const t of (db.troops || [])) if (t) for (const pg of (t.pages || [])) if (pg) scan(pg.event_commands);
            for (const id in project.maps) for (const e of (project.maps[id].events || [])) if (e) for (const pg of (e.pages || [])) if (pg) scan(pg.event_commands);
            const base = Math.max(100, maxPicture) + 1;
            system.advanced.rrNamedSpriteBase = base;
            system.advanced.picturesUpperLimit = base + 399;
        }
        if (system.title1Name && !resolveInsensitive(source, path.join('Title', system.title1Name + '.png'))) { notes.skipped.push(`Title/${system.title1Name}: named by the game but not on disk; no title image`); system.title1Name = ''; }
        {   // The game font: the 2003 bitmap font (Mincho RM2000 or Gothic RMG2000) becomes a TrueType file drawn dot for dot.
            const wanted = sys.font_id === 0 ? ['RMG2000.fon', 'RM2000.fon'] : ['RM2000.fon', 'RMG2000.fon'];
            let fontFile = null;
            for (const folder of ['', 'fonts', 'Font', 'Fonts']) for (const name of wanted) { const p = resolveInsensitive(source, folder ? path.join(folder, name) : name); if (p && !fontFile) fontFile = p; }
            if (!fontFile) fontFile = findLegacyFont(wanted, [options.fontPath, rtpFound, rtpFound && path.dirname(rtpFound)]);
            if (fontFile && !fontFile.startsWith(source)) log(`  Game font: ${fontFile}`, 'info');
            if (fontFile) {
                try {
                    const decoder = new TextDecoder(project.encoding || 'windows-1252');
                    const font = F.convert(fs.readFileSync(fontFile), { decode: (code) => decoder.decode(Uint8Array.of(code)) });
                    if (!font) throw new Error('no bitmap font inside');
                    mkdir(path.join(dest, 'fonts'));
                    fs.writeFileSync(path.join(dest, 'fonts', font.name + '.ttf'), font.ttf);
                    system.advanced.mainFontFilename = font.name + '.ttf';
                    system.advanced.numberFontFilename = font.name + '.ttf';
                    system.advanced.fontSize = font.height;
                    addNote(notes.images, `font:${font.name}`, font.glyphs);
                } catch (error) { notes.skipped.push(`${path.basename(fontFile)}: ${error.message}; the template font stands in`); }
            } else notes.skipped.push('RM2000.fon: the game font is neither with the game nor installed; the template font stands in (set it with --font or put RM2000.fon in the RTP folder or the system fonts)');
        }
        const plugins = [];   // the importer's own plugins this game gets
        {   // 4b. Language packs: a game that switches language while it plays (EasyRPG's set_language) gets
            // every other language it ships as the texts that differ from the data just written (RR_Language.js).
            const switches = (notes.maps['dynrpg:easyrpg_set_language'] || 0) + (dbNotes['dynrpg:easyrpg_set_language'] || 0) > 0;
            const baseName = translator ? options.language : 'default';
            const others = switches ? ['default', ...languages()].filter(n => n !== baseName) : [];
            const packs = [];
            if (others.length) log(`Writing ${others.length} language pack${others.length === 1 ? '' : 's'} for the game's language switch…`, 'stage');
            const base = { 'MapInfos.json': infos.map(i => i || null), 'System.json': { terms: system.terms } };
            for (const [file, records] of [['Actors', converted.actors], ['Classes', converted.classes], ['Skills', converted.skills], ['Items', converted.items], ['Weapons', converted.weapons], ['Armors', converted.armors], ['Enemies', converted.enemies], ['Troops', converted.troops], ['States', converted.states], ['Animations', converted.animations], ['CommonEvents', converted.commonEvents]]) base[`${file}.json`] = records.map(r => r || null);
            for (const name of others) {
                const tr = name === 'default' ? null : makeTranslator(name);
                if (name !== 'default' && !tr) continue;
                const other = D.convert(db, project.tree, {}, tr);
                other.ctx.decode = converted.ctx.decode; other.ctx.effectPictures = effectPictures; other.ctx.pictureFile = converted.ctx.pictureFile;
                const cmds = (commands) => C.convertList(commands, other.ctx).list, route = (moves) => C.convertRoute(moves, other.ctx);
                const texts = { 'MapInfos.json': K.mapInfos(project.tree).map(i => i || null) };
                if (tr) for (const info of texts['MapInfos.json']) if (info) { const v = tr.field('maps.name', info.name); if (v !== undefined) info.name = v; }
                for (const info of texts['MapInfos.json']) if (info && !baseMaps.has(`Map${String(info.id).padStart(3, '0')}.json`)) texts['MapInfos.json'][info.id] = infos[info.id] || null;
                {   // terms: the stock conversion, then the pack's translation by value
                    const terms = JSON.parse(JSON.stringify(D.system(K.systemJson(JSON.parse(fs.readFileSync(EditorPaths.skeletonFile('data/System.json'), 'utf8')), db, project.tree, project.ini), db, project.tree, {}).terms));
                    const walk = (obj) => { for (const k of Object.keys(obj)) { const v = obj[k]; if (typeof v === 'string') { const t = tr ? tr.term(v) : undefined; if (t !== undefined) obj[k] = t; } else if (v && typeof v === 'object') walk(v); } };
                    walk(terms);
                    texts['System.json'] = { terms };
                }
                for (const [file, records] of [['Actors', other.actors], ['Classes', other.classes], ['Skills', other.skills], ['Items', other.items], ['Weapons', other.weapons], ['Armors', other.armors], ['Enemies', other.enemies], ['Troops', other.troops], ['States', other.states], ['Animations', other.animations], ['CommonEvents', other.commonEvents]]) texts[`${file}.json`] = records.map(r => r || null);
                for (const [file] of baseMaps) { const id = parseInt(file.slice(3), 10); texts[file] = mapFor(infos[id], project.maps[id], cmds, route).json; }
                const stats = { wholeLists: 0 };
                const files = {};
                let count = 0;
                for (const [file, json] of Object.entries(texts)) {
                    const ops = LL.diff(file.startsWith('Map') && file !== 'MapInfos.json' ? baseMaps.get(file) : base[file], json, stats);
                    if (ops.length) { files[file] = ops; count += ops.length; }
                }
                mkdir(path.join(dest, 'data', 'Languages'));
                writeJson(path.join(dest, 'data', 'Languages', `${name}.json`), { language: name, files });
                packs.push(name);
                addNote(notes.images, `languagePack:${name}`, count);
                if (stats.wholeLists) addNote(notes.maps, 'languagePackWholeList', stats.wholeLists);
                log(`  ${name}: ${count} texts in ${Object.keys(files).length} files.`, 'info');
            }
            if (packs.length) {
                system.rrLanguages = packs;
                plugins.push('RR_Language');
            }
        }
        // EasyRPG Player's fast-forward keys (hold F or G), which players of these games expect
        plugins.push({ name: 'RR_FastForward', parameters: () => ({ speedA: '3', speedB: '10' }) });
        require('./RgssImporter.js').installPlugins(dest, Object.assign(new Set(), { extraPlugins: plugins }), {}, [], notes.skipped, log);
        writeJson(path.join(dest, 'data', 'System.json'), system);
    
        log('Copying images and audio…', 'stage');
        // 5. Images and audio.
        if (!options.skipAssets) {
        const assetFolders = ['CharSet', 'FaceSet', 'Panorama', 'Picture', 'Picture 2', 'Monster', 'Battle', 'Battle2', 'Backdrop', 'Title', 'GameOver', 'System', 'System2', 'Frame', 'Music', 'Sound'];
        let assetTotal = 0;
        for (const folder of assetFolders) { const root = resolveInsensitive(source, folder); if (root) assetTotal += countFiles(root); }
        assetProgress = { done: 0, total: assetTotal, report: span(0.57, 1) };
        await importImages('CharSet', 'img/characters', { key: true, transform: K.reorderCharset, rename: K.charsetName });
        await importImages('FaceSet', 'img/faces', { key: true });
        await importImages('Panorama', 'img/parallaxes', { key: false });
        await importImages('Picture', 'img/pictures', { key: pictureKeying });
        await importImages('Picture 2', 'img/pictures/Picture 2', { key: pictureKeying });
        await importImages('Monster', 'img/enemies', { key: true });
        await importImages('Battle', 'img/animations', { key: true, transform: (img) => K.scaleNearest(img, 2) });
        await importImages('Battle2', 'img/animations', { key: true, transform: (img) => K.scaleNearest(img, 1.5) });
        await importImages('Backdrop', 'img/battlebacks1', { key: false });
        await importImages('Title', 'img/titles1', { key: false });
        await importImages('GameOver', 'img/system', { key: false, rename: () => 'GameOver' });
        await importImages('System', 'img/system', { key: true });
        {   // the game's window skin, over the stock Window.png for the parts 2003 had no equivalent of
            const skinFile = sys.system_name ? resolveInsensitive(source, path.join('System', sys.system_name + '.png')) : null;
            const baseFile = EditorPaths.skeletonFile('img/system/Window.png');
            if (skinFile) {
                try {
                    const skin = K.windowSkin(decodePng(fs.readFileSync(skinFile), true), fs.existsSync(baseFile) ? decodePng(fs.readFileSync(baseFile), false) : null);
                    fs.writeFileSync(path.join(dest, 'img', 'system', 'Window.png'), encodePng(skin));
                } catch (error) { notes.skipped.push(`System/${sys.system_name}: window skin ${error.message}`); }
            }
        }
        await importImages('System2', 'img/system', { key: true });
        await importImages('Frame', 'img/system', { key: true });
        importAudio('Music', 'audio/bgm');
        importAudio('Sound', 'audio/se');
        }
        // Files the game named from the RTP (RPG Maker's standard package, installed with the engine, not the game).
        if (!options.skipAssets && rtp) {
            const missing = PF.missingReferences(dest);
            const lower = (folder) => new Set(Array.from(missing.get(folder) || []).map(n => n.toLowerCase()));
            const before = JSON.stringify(notes.images);
            const fromRtp = [
                ['CharSet', 'img/characters', { key: true, transform: K.reorderCharset, rename: K.charsetName }],
                ['FaceSet', 'img/faces', { key: true }], ['Panorama', 'img/parallaxes', { key: false }], ['Picture', 'img/pictures', { key: pictureKeying }],
                ['Monster', 'img/enemies', { key: true }], ['Battle', 'img/animations', { key: true, transform: (img) => K.scaleNearest(img, 2) }],
                ['Battle2', 'img/animations', { key: true, transform: (img) => K.scaleNearest(img, 1.5) }], ['Backdrop', 'img/battlebacks1', { key: false }], ['Title', 'img/titles1', { key: false }]
            ];
            let filled = 0;
            for (const [folder, target, opts] of fromRtp) {
                const only = lower(target);
                if (only.size) filled += await importImages(folder, target, Object.assign({}, opts, { root: resolveInsensitive(rtp, folder), only }));
            }
            for (const [folder, target] of [['Music', 'audio/bgm'], ['Music', 'audio/me'], ['Sound', 'audio/se']]) {
                const only = lower(target);
                if (only.size) filled += importAudio(folder, target, { root: resolveInsensitive(rtp, folder), only });
            }
            notes.images = JSON.parse(before);
            if (filled) { addNote(notes.images, 'fromRtp', filled); log(`  ${filled} files the game takes from the RTP were copied from ${rtp}.`, 'info'); }
        } else if (!options.skipAssets && !rtp && needsRtp) {
            notes.skipped.push('The game uses RPG Maker\'s RTP, which is not installed or not found: files it takes from there are missing (set the RTP folder with --rtp or the RPG2K_RTP_PATH / RPG2K3_RTP_PATH variable)');
        }
        if (!options.skipAssets) {
            const across = PF.copyAcrossAudio(dest);
            if (across) addNote(notes.images, 'audioCopiedAcross', across);
            const cased = PF.matchFileCase(dest);
            if (cased) addNote(notes.maps, 'fileNameCase', cased);
            const cleared = PF.clearMissingSystemFiles(dest);
            if (cleared) addNote(notes.maps, 'systemFileCleared', cleared);
        }
    
        // 6. Project identity.
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.name = PF.packageName(safeName(title));
        pkg.version = editorPackage.version;
        pkg.window = Object.assign({}, pkg.window, { title, width: 640, height: 480, min_width: 320, min_height: 240 });
        pkg['chromium-args'] = '--force-color-profile=srgb --window-size=640,480';
        writeJson(path.join(dest, 'package.json'), pkg);
        const now = new Date().toISOString();
        writeJson(path.join(dest, 'project.rpgreactor'), { name: title, version: editorPackage.version, engine: 'RPG Reactor', engineVersion: editorPackage.version, imported: true, importedFrom: db.engine, importedAt: now, created: now, modified: now });
    
        const summary = { source: path.resolve(source), engine: db.engine, runtime: db.runtime, encoding: project.encoding, title, writtenAt: now, ms: Date.now() - t0, tilesets: chipsets.length, maps: written.length, approximations: Object.assign({}, notes.maps, dbNotes), files: notes.images, skipped: notes.skipped, stage: 'assets, tilesets, maps, database, events and their commands; DynRPG comment commands converted where Reactor has an equivalent' };
        // Files the game names that are nowhere: listed for the author (MIDI and movies converting later still count as present).
        summary.missingFiles = require('./ProjectFiles.js').missingList(dest);
        if (summary.missingFiles.length) log(`  ${summary.missingFiles.length} files the game names are not in it (listed in the import report).`, 'warn');
        if (rtpUse) summary.rtp = { folder: rtpFound, names: rtpUse.variant, addonFiles: rtpUse.addon, addonMissing };
        fs.writeFileSync(path.join(dest, 'import-report.json'), JSON.stringify(summary, null, 2));
        summary.destination = dest;
    
        report(1, 'Done');
        const approx = Object.assign({}, notes.maps, dbNotes);
        const sum = (prefix) => Object.entries(approx).filter(([k]) => k.startsWith(prefix)).reduce((n, [, v]) => n + v, 0);
        const dynConverted = sum('dynrpg:'), dynKept = sum('dynrpgKept:');
        const plain = Object.entries(approx).filter(([k]) => !k.startsWith('dynrpg')).sort((a, b) => b[1] - a[1]);
        log(`Wrote "${title}" to ${dest} in ${(summary.ms / 1000).toFixed(1)} s: ${summary.tilesets} tilesets, ${summary.maps} maps.`, 'done');
        log(`  Files: ${Object.entries(notes.images).map(([k, v]) => `${k} ${v}`).join(', ')}`, 'info');
        if (dynConverted || dynKept) log(`  DynRPG plugin commands: ${dynConverted} converted to Reactor screen features, ${dynKept} kept as comments.`, dynKept ? 'warn' : 'info');
        if (plain.length) log(`  Approximated: ${plain.map(([k, v]) => `${k} ${v}`).join(', ')}`, 'warn');
        if (notes.skipped.length) {
            log(`  Skipped ${notes.skipped.length}:`, 'warn');
            for (const skipped of notes.skipped.slice(0, 10)) log(`    ${skipped}`, 'warn');
            if (notes.skipped.length > 10) log(`    … and ${notes.skipped.length - 10} more (import-report.json)`, 'warn');
        }
        log('  Details in import-report.json.', 'info');
        return summary;
    }
    
    
    /** The languages the game ships (its Language/<name> folders holding .po files). */
    function languages() {
        const root = resolveInsensitive(source, 'Language');
        if (!root || !fs.statSync(root).isDirectory()) return [];
        return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && fs.readdirSync(path.join(root, e.name)).some(f => /\.po$/i.test(f))).map(e => e.name);
    }

    /** A translator over one language's merged .po tables: text(), lines() for a message box, field(ctx, value), term(value). */
    function makeTranslator(language) {
        const dir = resolveInsensitive(source, path.join('Language', language));
        if (!dir) return null;
        const merged = {};
        let entries = 0;
        for (const file of fs.readdirSync(dir)) {
            if (!/\.po$/i.test(file)) continue;
            const parsed = L.parsePo(fs.readFileSync(path.join(dir, file), 'utf8'));
            for (const [ctx, map] of Object.entries(parsed)) { const target = merged[ctx] || (merged[ctx] = {}); for (const [k, v] of Object.entries(map)) { target[k] = v; entries++; } }
        }
        if (!entries) return null;
        const messages = merged[''] || {};
        const terms = {};
        for (const [ctx, map] of Object.entries(merged)) if (ctx.startsWith('terms.')) Object.assign(terms, map);
        addNote(notes.images, `language:${language}`, entries);
        return {
            text: (s) => (Object.prototype.hasOwnProperty.call(messages, s) ? messages[s] : s),
            lines: (lines) => { const whole = lines.join('\n'); if (Object.prototype.hasOwnProperty.call(messages, whole)) return messages[whole].split('\n'); return lines.map(l => (Object.prototype.hasOwnProperty.call(messages, l) ? messages[l] : l)); },
            field: (ctx, value) => (merged[ctx] && Object.prototype.hasOwnProperty.call(merged[ctx], value) ? merged[ctx][value] : undefined),
            term: (value) => (Object.prototype.hasOwnProperty.call(terms, value) ? terms[value] : undefined)
        };
    }

    return { inventory, printReport, importProject, project, languages };
}

/** A VX Ace folder goes to RgssImporter, VX to VxImporter, XP to XpImporter; everything else here is 2000/2003. */
const RGSS_IMPORTERS = { ace: './RgssImporter.js', vx: './VxImporter.js', xp: './XpImporter.js' };
const rgssKind = (source) => { const kind = probe(source).kind; return RGSS_IMPORTERS[kind] ? kind : null; };
const rgssImporter = (source) => require(RGSS_IMPORTERS[rgssKind(source)]);
function report(source, options) { return rgssKind(source) ? rgssImporter(source).report(source, options) : open(source, null, options).inventory(); }
/** The languages a game ships, without reading the game: its Language/<name> folders holding .po files. */
function languages(source) {
    const hit = (dir, name) => { try { return fs.readdirSync(dir).find(e => e.toLowerCase() === name.toLowerCase()) || null; } catch (_) { return null; } };
    const name = hit(source, 'Language');
    if (!name) return [];
    const root = path.join(source, name);
    try {
        if (!fs.statSync(root).isDirectory()) return [];
        return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && fs.readdirSync(path.join(root, e.name)).some(f => /\.po$/i.test(f))).map(e => e.name);
    } catch (_) { return []; }
}

/**
 * What a folder holds, cheaply (the database and map tree, not the maps):
 * { kind: '2000' | '2003' | 'xp' | 'vx' | 'ace' | 'mv' | 'mz' | 'reactor' | null, engine, title, maps, languages, packed }.
 * An XP/VX/Ace game is known by its editor project file, its Data files or its
 * packed archive (Game.rgssad / .rgss2a / .rgss3a) and its Game.ini library.
 */
function probe(folder) {
    const none = { kind: null, engine: '', title: '', maps: 0, languages: [], packed: false };
    let names;
    try { names = fs.readdirSync(folder); } catch (_) { return none; }
    const lower = new Map(names.map(n => [n.toLowerCase(), n]));
    const has = (name) => lower.has(name.toLowerCase());
    const ext = (e) => names.some(n => n.toLowerCase().endsWith(e));
    const iniOf = (file) => { try { return fs.readFileSync(path.join(folder, lower.get(file.toLowerCase())), 'latin1'); } catch (_) { return ''; } };
    const iniValue = (text, key) => { const m = new RegExp('^\\s*' + key + '\\s*=\\s*(.*?)\\s*$', 'mi').exec(text); return m ? m[1] : ''; };
    if (has('RPG_RT.ldb')) {
        const out = Object.assign({}, none, { kind: '2003', engine: 'RPG Maker 2000/2003', languages: languages(folder) });
        out.title = iniValue(iniOf('RPG_RT.ini'), 'GameTitle') || path.basename(folder);
        // A game built with FullPackageFlag=1 carries everything; otherwise it may take files from the RTP.
        out.needsRtp = iniValue(iniOf('RPG_RT.ini'), 'FullPackageFlag') !== '1';
        let encoding = iniValue(iniOf('RPG_RT.ini'), 'Encoding');
        try {
            const bytes = fs.readFileSync(path.join(folder, lower.get('rpg_rt.ldb')));
            if (!encoding || /^auto$/i.test(encoding)) encoding = L.detectEncoding(L.textSamples(bytes));
            const db = L.readDatabase(bytes, encoding);
            out.engine = db.engine || out.engine;
            out.kind = out.engine === 'RPG Maker 2000' ? '2000' : '2003';
            out.runtime = runtimeEngine(folder) || out.engine;
            // Which RTP its names belong to, from the database and the map tree (the maps themselves are not read).
            if (out.needsRtp) {
                const RM = require('./RtpManager.js');
                let tree = null;
                try { if (has('RPG_RT.lmt')) tree = L.readMapTree(fs.readFileSync(path.join(folder, lower.get('rpg_rt.lmt')))); } catch (_) { /* no tree */ }
                const exts = ['.png', '.bmp', '.xyz', '.wav', '.mid', '.ogg', '.mp3'];
                const shipped = (sub, name) => { try { const dir = lower.get(sub.toLowerCase()); return !!dir && fs.readdirSync(path.join(folder, dir)).some(f => exts.some(e => f.toLowerCase() === (name + e).toLowerCase())); } catch (_) { return false; } };
                out.rtpRefs = RM.referencedNames(db, tree, shipped);
                out.rtpUse = RM.classify(db.engine, out.rtpRefs);
            }
        } catch (_) { /* unreadable: still a 2000/2003 folder, the import will say why */ }
        // The title is in the game's code page (a Japanese game's is Shift_JIS), as the import reads it.
        try { const t = L.parseIni(new TextDecoder(L.normalizeEncoding(encoding)).decode(fs.readFileSync(path.join(folder, lower.get('rpg_rt.ini'))))).RPG_RT?.GameTitle; if (t) out.title = t; } catch (_) { /* no ini */ }
        try { if (has('RPG_RT.lmt')) out.maps = L.readMapTree(fs.readFileSync(path.join(folder, lower.get('rpg_rt.lmt')))).maps.filter(m => m && m.type === 1).length; } catch (_) { /* tree unreadable */ }
        return out;
    }
    const data = lower.has('data') ? (() => { try { return fs.readdirSync(path.join(folder, lower.get('data'))).map(n => n.toLowerCase()); } catch (_) { return []; } })() : [];
    if (has('project.rpgreactor')) return Object.assign({}, none, { kind: 'reactor', engine: 'RPG Reactor', title: path.basename(folder) });
    if (data.includes('system.json') && (has('js') || has('www'))) {
        const scripts = (() => { try { return fs.readdirSync(path.join(folder, lower.get('js') || lower.get('www'))).map(n => n.toLowerCase()); } catch (_) { return []; } })();
        const mz = scripts.some(n => n.startsWith('rmmz_')) || has('game.rmmzproject');
        return Object.assign({}, none, { kind: mz ? 'mz' : 'mv', engine: mz ? 'RPG Maker MZ' : 'RPG Maker MV', title: path.basename(folder) });
    }
    // In the code page the game's editor wrote it in (a Japanese title is Shift_JIS).
    const ini = (() => { try { return require('./RgssImporter.js').iniText(fs.readFileSync(path.join(folder, lower.get('game.ini')))); } catch (_) { return ''; } })();
    const library = iniValue(ini, 'Library').toLowerCase();
    // A game keeping its text in Local/<Language>.csv files offers those languages.
    const keyedLanguages = () => { try { return require('./KeyedLocalization.js').languages((dir) => require('./RgssImporter.js').source(folder).files(dir)); } catch (_) { return []; } };
    const rgss = (kind, engine, project, archive, data2, lib) => (ext(project) || has(archive) || data.some(n => n.endsWith(data2)) || library.startsWith(lib))
        ? Object.assign({}, none, { kind, engine, title: iniValue(ini, 'Title') || path.basename(folder), packed: has(archive), maps: data.filter(n => /^map\d+\./.test(n) && n.endsWith(data2)).length, languages: has('Local') ? keyedLanguages() : [] }) : null;
    return rgss('ace', 'RPG Maker VX Ace', '.rvproj2', 'Game.rgss3a', '.rvdata2', 'rgss3')
        || rgss('vx', 'RPG Maker VX', '.rvproj', 'Game.rgss2a', '.rvdata', 'rgss2')
        || rgss('xp', 'RPG Maker XP', '.rxproj', 'Game.rgssad', '.rxdata', 'rgss1')
        || none;
}
/** The game is never written to: the new project may not be its folder, inside it, or a folder holding it. */
function checkDestination(source, destination) {
    const src = path.resolve(source), dest = path.resolve(destination);
    const within = (outer, inner) => { const rel = path.relative(outer, inner); return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)); };
    if (within(src, dest) || within(dest, src)) throw new Error(`${dest} is the game's own folder or holds it; choose a folder outside the game.`);
}
function importProject(source, destination, options) {
    checkDestination(source, destination);
    return rgssKind(source) ? rgssImporter(source).importProject(source, destination, options) : open(source, destination, options).importProject();
}

module.exports = { findRtp, rtpCandidates, findLegacyFont, runtimeEngine, open, report, printReport, importProject, languages, probe };
