/**
 * LegacyImporter - imports an RPG Maker 2000/2003 project into a new RPG
 * Reactor project. Node only (files and PNGs); the editor runs it in a
 * worker and the CLI (`build-scripts/import-legacy-project.cjs`) calls it
 * directly. The conversion itself is in the pure modules beside this one:
 * LcfReader (the files), LegacyConvert (tilesets, maps, images),
 * LegacyDatabase (records) and LegacyCommands (event commands).
 *
 *   report(source, { encoding })                      → what the project holds
 *   importProject(source, destination, options)       → the written project's summary
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
    const repo = path.resolve(__dirname, '..', '..', '..');
    const editorPackage = JSON.parse(fs.readFileSync(path.join(repo, 'editor', 'package.json'), 'utf8'));
    const skeleton = path.join(repo, 'template', 'Barebones');
    const runtime = path.join(repo, 'runtime');
    
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
    
    function copyTree(from, to, skip = () => false) {
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
            const s = path.join(from, entry.name), d = path.join(to, entry.name);
            if (skip(path.relative(skeleton, s))) continue;
            if (entry.isDirectory()) { mkdir(d); copyTree(s, d, skip); } else { mkdir(path.dirname(d)); fs.copyFileSync(s, d); }
        }
    }
    
    /** Every file of a source image folder, decoded, written to a project folder; subfolders kept. */
    function importImages(folder, target, options) {
        const root = resolveInsensitive(source, folder);
        if (!root) return 0;
        let written = 0;
        const walk = (dir, rel) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) { walk(full, path.join(rel, entry.name)); continue; }
                if (!/\.png$/i.test(entry.name)) { notes.skipped.push(`${folder}/${path.join(rel, entry.name)}: not PNG`); continue; }
                const base = entry.name.replace(/\.png$/i, '');
                const keying = typeof options.key === 'function' ? options.key(base) : options.key;
                const outDir = path.join(destination, target, rel);
                const bytes = fs.readFileSync(full);
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
        walk(root, '');
        addNote(notes.images, folder, written);
        return written;
    }
    
    function importAudio(folder, target) {
        const root = resolveInsensitive(source, folder);
        if (!root) return 0;
        let written = 0;
        mkdir(path.join(destination, target));
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (/\.(mid|midi)$/i.test(entry.name)) notes.skipped.push(`${folder}/${entry.name}: MIDI is not played by the runtime`);
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
    
    function importProject() {
        const log = typeof options.log === 'function' ? options.log : () => {};
        const dest = path.resolve(destination);
        if (fs.existsSync(dest) && fs.readdirSync(dest).length && !options.force) throw new Error(`${dest} exists and is not empty.`);
        mkdir(dest);
        const t0 = Date.now();
        const title = (project.ini.RPG_RT && project.ini.RPG_RT.GameTitle) || path.basename(source);
        const sys = db.system || {};
    
        log('Copying the project skeleton and runtime…');
        // 1. Skeleton: the Barebones template minus its art and music, then the runtime.
        // Everything but the template's art, music and runtime; img/system (icons, balloons, window skin) does come.
        copyTree(skeleton, dest, rel => {
            const r = rel.replace(/\\/g, '/');
            if (options.skipAssets && r === 'img/system/Window.png' && fs.existsSync(path.join(dest, 'img', 'system', 'Window.png'))) return true;   // a converted skin survives a data-only re-import
            if (r === 'img' || r === 'img/system' || r.startsWith('img/system/')) return false;
            return r.startsWith('img/') || r.startsWith('audio/') || r.startsWith('js/');
        });
        mkdir(path.join(dest, 'js'));
        for (const entry of fs.readdirSync(runtime, { withFileTypes: true })) {
            const s = path.join(runtime, entry.name), d = path.join(dest, 'js', entry.name);
            if (entry.isDirectory()) { mkdir(d); copyTree(s, d); } else fs.copyFileSync(s, d);
        }
        if (fs.existsSync(path.join(skeleton, 'js', 'reactor_plugins.js'))) fs.copyFileSync(path.join(skeleton, 'js', 'reactor_plugins.js'), path.join(dest, 'js', 'reactor_plugins.js'));
        for (const folder of ['audio/bgm', 'audio/bgs', 'audio/me', 'audio/se', 'img/animations', 'img/characters', 'img/enemies', 'img/faces', 'img/parallaxes', 'img/pictures', 'img/tilesets', 'img/titles1', 'img/titles2', 'img/battlebacks1', 'img/battlebacks2', 'img/sv_actors', 'img/sv_enemies', 'movies']) mkdir(path.join(dest, folder));
    
        log('Converting the database…');
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
            const scan = (cmds) => { for (const c of cmds || []) { if ((c.code === 11110 || c.code === 11120) && (c.parameters[12] === 1 || c.parameters[12] === 2)) effectPictures.add(c.parameters[0]); if (c.code === 11110 && c.string) { const u = pictureUse[c.string.replace(/\.[^.]+$/, '')] || (pictureUse[c.string.replace(/\.[^.]+$/, '')] = { keyed: 0, opaque: 0 }); if (c.parameters[7] > 0) u.keyed++; else u.opaque++; } } };
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
    
        log(`Re-cutting ${(db.chipsets || []).filter(Boolean).length} chipsets into tilesets…`);
        // 2. Tilesets: one MZ tileset per chipset, four sheets each.
        const tilesets = [null];
        const chipsets = (db.chipsets || []).filter(Boolean);
        const sheetCache = new Map();
        for (const chipset of chipsets) {
            const stem = `chip${String(chipset.id).padStart(3, '0')}`;
            const names = { A1: '', A2: '', B: '', C: '' };
            const file = chipset.chipset_name ? resolveInsensitive(source, path.join('ChipSet', chipset.chipset_name + '.png')) : null;
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
    
        log('Writing the maps and their events…');
        // 3. Maps and the tree.
        const wanted = Array.isArray(options.maps) && options.maps.length ? new Set(options.maps.map(Number)) : null;
        const infos = K.mapInfos(project.tree);
        if (translator) for (const info of infos) if (info) { const v = translator.field('maps.name', info.name); if (v !== undefined) info.name = v; }
        const written = [];
        for (const info of infos) {
            if (!info) continue;
            const map = project.maps[info.id];
            if (!map || (wanted && !wanted.has(info.id))) { if (wanted) infos[info.id] = null; continue; }
            const { json, notes: mapNotes } = K.mapJson(map, project.tree, info.id, map.chipset_id || 1, convertCommands, convertRoute);
            json.displayName = '';
            const back = K.mapBattleback(map, db.chipsets[map.chipset_id || 1], db.terrains);
            if (back) { json.specifyBattleback = true; json.battleback1Name = back; }
            writeJson(path.join(dest, 'data', `Map${String(info.id).padStart(3, '0')}.json`), json);
            for (const [k, n] of Object.entries(mapNotes)) addNote(notes.maps, k, n);
            written.push(info.id);
        }
        for (const stale of fs.readdirSync(path.join(dest, 'data'))) if (/^Map\d+\.json$/.test(stale) && !written.includes(Number(stale.slice(3, 6)))) fs.unlinkSync(path.join(dest, 'data', stale));
        writeJson(path.join(dest, 'data', 'MapInfos.json'), infos.map(i => i || null));
    
        // 4. System: the old engine's framework.
        const base = JSON.parse(fs.readFileSync(path.join(skeleton, 'data', 'System.json'), 'utf8'));
        const system = D.system(K.systemJson(base, db, project.tree, project.ini), db, project.tree, dbNotes);
        if (translator) {   // terms are translated by value: the 2003 term table was laid into MZ's
            const walk = (obj) => { for (const k of Object.keys(obj)) { const v = obj[k]; if (typeof v === 'string') { const t = translator.term(v); if (t !== undefined) obj[k] = t; } else if (v && typeof v === 'object') walk(v); } };
            walk(system.terms);
            system.rrLanguage = options.language;
        }
        if (wanted && !wanted.has(system.startMapId)) { system.startMapId = written[0] || 1; system.editMapId = system.startMapId; }
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
            } else notes.skipped.push('RM2000.fon: the game font is not in the project; the template font stands in');
        }
        writeJson(path.join(dest, 'data', 'System.json'), system);
    
        log('Copying images and audio…');
        // 5. Images and audio.
        if (!options.skipAssets) {
        importImages('CharSet', 'img/characters', { key: true, transform: K.reorderCharset, rename: K.charsetName });
        importImages('FaceSet', 'img/faces', { key: true });
        importImages('Panorama', 'img/parallaxes', { key: false });
        importImages('Picture', 'img/pictures', { key: pictureKeying });
        importImages('Picture 2', 'img/pictures/Picture 2', { key: pictureKeying });
        importImages('Monster', 'img/enemies', { key: true });
        importImages('Battle', 'img/animations', { key: true, transform: (img) => K.scaleNearest(img, 2) });
        importImages('Battle2', 'img/animations', { key: true, transform: (img) => K.scaleNearest(img, 1.5) });
        importImages('Backdrop', 'img/battlebacks1', { key: false });
        importImages('Title', 'img/titles1', { key: false });
        importImages('GameOver', 'img/system', { key: false, rename: () => 'GameOver' });
        importImages('System', 'img/system', { key: true });
        {   // the game's window skin, over the stock Window.png for the parts 2003 had no equivalent of
            const skinFile = sys.system_name ? resolveInsensitive(source, path.join('System', sys.system_name + '.png')) : null;
            const baseFile = path.join(skeleton, 'img', 'system', 'Window.png');
            if (skinFile) {
                try {
                    const skin = K.windowSkin(decodePng(fs.readFileSync(skinFile), true), fs.existsSync(baseFile) ? decodePng(fs.readFileSync(baseFile), false) : null);
                    fs.writeFileSync(path.join(dest, 'img', 'system', 'Window.png'), encodePng(skin));
                } catch (error) { notes.skipped.push(`System/${sys.system_name}: window skin ${error.message}`); }
            }
        }
        importImages('System2', 'img/system', { key: true });
        importImages('Frame', 'img/system', { key: true });
        importAudio('Music', 'audio/bgm');
        importAudio('Sound', 'audio/se');
        }
    
        // 6. Project identity.
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.name = 'rr-' + safeName(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        pkg.version = editorPackage.version;
        pkg.window = Object.assign({}, pkg.window, { title, width: 640, height: 480, min_width: 320, min_height: 240 });
        pkg['chromium-args'] = '--force-color-profile=srgb --window-size=640,480';
        writeJson(path.join(dest, 'package.json'), pkg);
        const now = new Date().toISOString();
        writeJson(path.join(dest, 'project.rpgreactor'), { name: title, version: editorPackage.version, engine: 'RPG Reactor', engineVersion: editorPackage.version, imported: true, importedFrom: db.engine, importedAt: now, created: now, modified: now });
    
        const summary = { source: path.resolve(source), engine: db.engine, encoding: project.encoding, title, writtenAt: now, ms: Date.now() - t0, tilesets: chipsets.length, maps: written.length, approximations: Object.assign({}, notes.maps, dbNotes), files: notes.images, skipped: notes.skipped, stage: 'assets, tilesets, maps, database, events and their commands; DynRPG comment commands kept as comments' };
        fs.writeFileSync(path.join(dest, 'import-report.json'), JSON.stringify(summary, null, 2));
        summary.destination = dest;
    
        log(`Wrote "${title}" to ${dest} in ${summary.ms} ms: ${summary.tilesets} tilesets, ${summary.maps} maps.`);
        log(`  Files: ${Object.entries(notes.images).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        const approx = Object.assign({}, notes.maps, dbNotes);
        if (Object.keys(approx).length) console.log(`  Approximated: ${Object.entries(approx).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        if (notes.skipped.length) { console.log(`  Skipped ${notes.skipped.length}:`); for (const s of notes.skipped.slice(0, 10)) console.log(`    ${s}`); if (notes.skipped.length > 10) console.log(`    … and ${notes.skipped.length - 10} more`); }
        log(`  DynRPG comment commands are kept as comments. Details in import-report.json.`);
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

function report(source, options) { return open(source, null, options).inventory(); }
function languages(source) { return open(source, null, {}).languages(); }
function importProject(source, destination, options) { return open(source, destination, options).importProject(); }

module.exports = { open, report, printReport, importProject, languages };
