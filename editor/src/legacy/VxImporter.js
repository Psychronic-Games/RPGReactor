/**
 * VxImporter - imports an RPG Maker VX game into a new RPG Reactor project.
 * Node only; LegacyImporter routes a VX folder here.
 *
 * The game may be a project folder (Data/*.rvdata) or a released game
 * (Game.rgss2a); both read through RgssImporter's source. Event commands are
 * reshaped into VX Ace's (VxConvert.aceCommands) and converted by RgssConvert,
 * so Ruby translation, script families and plugin ports apply as for Ace.
 * VX's battle background (the map, blurred, over BattleFloor) and its other
 * runtime rules are the RR_VxCompat plugin.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const M = require('./RubyMarshal.js');
const C = require('./RgssConvert.js');
const V = require('./VxConvert.js');
const R = require('./RgssImporter.js');

/** The script sections every VX project starts with. */
const STOCK_SCRIPTS = new Set(['Vocab', 'Sound', 'Cache', 'Game_Temp', 'Game_System', 'Game_Message', 'Game_Switches', 'Game_Variables', 'Game_SelfSwitches', 'Game_Screen', 'Game_Picture', 'Game_Battler', 'Game_BattleAction', 'Game_Actor', 'Game_Enemy', 'Game_Actors', 'Game_Unit', 'Game_Party', 'Game_Troop', 'Game_Map', 'Game_CommonEvent', 'Game_Character', 'Game_Event', 'Game_Vehicle', 'Game_Player', 'Game_Interpreter', 'Sprite_Base', 'Sprite_Character', 'Sprite_Battler', 'Sprite_Picture', 'Sprite_Timer', 'Spriteset_Weather', 'Spriteset_Map', 'Spriteset_Battle', 'Window_Base', 'Window_Selectable', 'Window_Command', 'Window_Help', 'Window_Gold', 'Window_MenuStatus', 'Window_Item', 'Window_Skill', 'Window_SkillStatus', 'Window_Equip', 'Window_EquipItem', 'Window_EquipStatus', 'Window_Status', 'Window_SaveFile', 'Window_ShopBuy', 'Window_ShopSell', 'Window_ShopNumber', 'Window_ShopStatus', 'Window_NameEdit', 'Window_NameInput', 'Window_NumberInput', 'Window_Message', 'Window_BattleMessage', 'Window_PartyCommand', 'Window_ActorCommand', 'Window_TargetEnemy', 'Window_BattleStatus', 'Window_DebugLeft', 'Window_DebugRight', 'Scene_Base', 'Scene_Title', 'Scene_Map', 'Scene_Menu', 'Scene_Item', 'Scene_Skill', 'Scene_Equip', 'Scene_Status', 'Scene_File', 'Scene_End', 'Scene_Shop', 'Scene_Name', 'Scene_Debug', 'Scene_Battle', 'Scene_Gameover', 'Main']);

/** VX graphics folders and where MZ keeps the same kind of image. System is sorted file by file. */
const GRAPHICS = { Animations: 'img/animations', Battlers: 'img/enemies', Characters: 'img/characters', Faces: 'img/faces', Parallaxes: 'img/parallaxes', Pictures: 'img/pictures' };
const TILE_SHEETS = ['TileA1', 'TileA2', 'TileA3', 'TileA4', 'TileA5', 'TileB', 'TileC', 'TileD', 'TileE'];

function gameIni(src) {
    const b = src.read('Game.ini');
    const text = b ? b.toString('latin1') : '';
    const get = (k) => { const m = new RegExp(`^[ \\t]*${k}[ \\t]*=[ \\t]*(.*)$`, 'mi').exec(text); return m ? m[1].trim() : ''; };
    return { title: get('Title'), rtp: get('RTP') };
}

function open(folder, destination, options) {
    options = options || {};
    folder = path.resolve(folder);
    const src = R.source(folder);
    const data = (name) => { const b = src.read(`Data/${name}.rvdata`); return b ? M.load(b) : null; };
    const vx = {
        actors: data('Actors') || [], classes: data('Classes') || [], skills: data('Skills') || [], items: data('Items') || [], weapons: data('Weapons') || [], armors: data('Armors') || [],
        enemies: data('Enemies') || [], troops: data('Troops') || [], states: data('States') || [], animations: data('Animations') || [], commonEvents: data('CommonEvents') || []
    };
    const system = data('System') || {};
    const infos = data('MapInfos') || {};
    const areasRaw = data('Areas') || {};
    const areas = (areasRaw instanceof Map ? Array.from(areasRaw.values()) : Object.values(areasRaw)).filter(Boolean).sort((a, b) => a.order - b.order || a.id - b.id);
    const scripts = (data('Scripts') || []).map(([id, name, body]) => {
        let text = '';
        try { text = body instanceof Uint8Array || Buffer.isBuffer(body) ? zlib.inflateSync(Buffer.from(body)).toString('utf8') : String(body || ''); } catch (_) { text = ''; }
        return { id, name: String(name || ''), text };
    });
    const mainAt = scripts.findIndex(s => s.name.trim() === 'Main');
    const active = mainAt >= 0 ? scripts.slice(0, mainAt) : scripts;
    const custom = active.filter(s => s.text.trim() && !STOCK_SCRIPTS.has(s.name.trim()));
    const mapIds = (infos instanceof Map ? Array.from(infos.keys()) : Object.keys(infos)).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    const ini = gameIni(src);
    const title = String(system.game_title || '') || ini.title || path.basename(folder);

    function inventory() {
        const count = (arr) => (arr || []).filter(Boolean).length;
        return {
            engine: 'RPG Maker VX', title, archive: src.archive,
            database: Object.fromEntries(Object.entries(vx).map(([k, v]) => [k, count(v)])),
            maps: mapIds.length, areas: areas.length,
            scripts: { sections: scripts.length, custom: custom.length, customLines: custom.reduce((n, s) => n + s.text.split('\n').length, 0), names: custom.map(s => s.name) }
        };
    }

    function importProject() {
        const { PNG } = require('pngjs');
        const log = typeof options.log === 'function' ? options.log : () => {};
        const report = typeof options.progress === 'function' ? options.progress : () => {};
        const span = (from, to) => (done, total, status) => report(from + (to - from) * (total ? Math.min(1, done / total) : 1), status);
        const repo = path.resolve(__dirname, '..', '..', '..');
        const editorPackage = JSON.parse(fs.readFileSync(path.join(repo, 'editor', 'package.json'), 'utf8'));
        const skeleton = path.join(repo, 'template', 'Barebones');
        const runtime = path.join(repo, 'runtime');
        const dest = path.resolve(destination);
        const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
        const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
        const notes = {}, skipped = [], images = {};
        const add = (bucket, key, n = 1) => { bucket[key] = (bucket[key] || 0) + n; };
        const rgba = (png) => ({ width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) });
        if (fs.existsSync(dest) && fs.readdirSync(dest).length && !options.force) throw new Error(`${dest} exists and is not empty.`);
        mkdir(dest);
        const t0 = Date.now();

        log('Copying the project skeleton and runtime…', 'stage');
        report(0, 'Copying the project skeleton and runtime…');
        const copyTree = (from, to, skip = () => false) => {
            for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
                const s = path.join(from, entry.name), d = path.join(to, entry.name);
                if (skip(path.relative(skeleton, s).replace(/\\/g, '/'))) continue;
                if (entry.isDirectory()) { mkdir(d); copyTree(s, d, skip); } else { mkdir(path.dirname(d)); fs.copyFileSync(s, d); }
            }
        };
        copyTree(skeleton, dest, r => (r === 'img' || r === 'img/system' || r.startsWith('img/system/')) ? false : r.startsWith('img/') || r.startsWith('audio/') || r.startsWith('js/'));
        mkdir(path.join(dest, 'js'));
        copyTree(runtime, path.join(dest, 'js'));
        if (fs.existsSync(path.join(skeleton, 'js', 'reactor_plugins.js'))) fs.copyFileSync(path.join(skeleton, 'js', 'reactor_plugins.js'), path.join(dest, 'js', 'reactor_plugins.js'));
        for (const f of [...Object.values(GRAPHICS), ...Object.values(R.AUDIO), 'img/tilesets', 'img/titles1', 'img/titles2', 'img/battlebacks1', 'img/battlebacks2', 'img/sv_actors', 'img/sv_enemies', 'movies']) mkdir(path.join(dest, f));

        // ---- the database ------------------------------------------------------
        log('Converting the database…', 'stage');
        report(0.05, 'Converting the database…');
        const scriptTexts = custom.map(s => s.text);
        const constants = C.scriptConstants(scriptTexts);
        const scriptText = scriptTexts.join('\n');
        const messageCodes = {
            nameBox: /\\\\N[CR]?<|\bname_window\b/i.test(scriptText) && /YEA-MessageSystem|name_window/i.test(scriptText),
            yeaIcons: /YEA-MessageSystem/.test(scriptText),
            messageFace: /Message Face Control|message_face_control/i.test(scriptText)
        };
        const nameTable = (records) => { const out = []; for (const r of records || []) if (r && r.id) out[r.id] = { name: String(r.name || ''), icon: Number(r.icon_index) || 0 }; return out; };
        const families = C.scriptFamilies(scriptTexts);
        C.setContext({ constants, messageCodes, families, names: { items: nameTable(vx.items), weapons: nameTable(vx.weapons), armors: nameTable(vx.armors), skills: nameTable(vx.skills) } });
        const db = V.database(vx, notes);
        const ids = { attack: db.attackSkillId, guard: db.guardSkillId, escape: db.escapeSkillId };
        // Troops, common events and animations have Ace's shape once their commands are.
        const reshaped = {
            troops: vx.troops.map(t => (t ? Object.assign({}, t, { pages: (t.pages || []).map(pg => Object.assign({}, pg, { list: V.aceCommands(pg.list, ids) })) }) : t)),
            commonEvents: vx.commonEvents.map(ce => (ce ? Object.assign({}, ce, { list: V.aceCommands(ce.list, ids) }) : ce)),
            animations: vx.animations
        };
        const ace = C.database(Object.assign({ actors: [], classes: [], skills: [], items: [], weapons: [], armors: [], enemies: [], states: [], tilesets: [] }, reshaped), notes);
        const aliases = C.audioAliases(scriptTexts);
        const aliased = (value) => { const n = C.applyAudioAliases(value, aliases); if (n) add(notes, 'audioAliased', n); return value; };
        aliased(ace.troops); aliased(ace.commonEvents);

        const sheetFiles = new Map(src.files('Graphics/System').map(f => [f.replace(/\.(png|jpg|jpeg|bmp)$/i, '').toLowerCase(), f]));
        const tilesets = [null, {
            id: 1, flags: V.tilesetFlags(system.passages), mode: 1, name: 'VX', note: '',
            tilesetNames: TILE_SHEETS.map(n => (sheetFiles.has(n.toLowerCase()) ? n : ''))
        }];
        const files = { Actors: db.actors, Classes: db.classes, Skills: db.skills, Items: db.items, Weapons: db.weapons, Armors: db.armors, Enemies: db.enemies, Troops: ace.troops, States: db.states, Animations: ace.animations, CommonEvents: ace.commonEvents, Tilesets: tilesets };
        for (const [file, records] of Object.entries(files)) writeJson(path.join(dest, 'data', `${file}.json`), records);
        const base = JSON.parse(fs.readFileSync(path.join(skeleton, 'data', 'System.json'), 'utf8'));
        const sys = aliased(V.system(base, system, db, notes));
        const vocab = scripts.find(s => s.name === 'Vocab');
        if (vocab) Object.assign(sys.terms.messages, C.vocabMessages(vocab.text));
        // RGSS sizes a font by its cell (see RgssConvert.rgssFontScale); VX's default is UmePlus Gothic 20.
        const fontSettings = C.fontDefaults(active.map(s => s.text), constants);
        const fonts = src.files('Fonts').filter(f => /\.(ttf|otf|woff2?)$/i.test(f));
        if (fonts.length) {
            mkdir(path.join(dest, 'fonts'));
            for (const f of fonts) fs.writeFileSync(path.join(dest, 'fonts', path.basename(f)), src.read('Fonts/' + f));
            sys.advanced.mainFontFilename = path.basename(fonts[0]);
        }
        const mainFont = sys.advanced.mainFontFilename && fonts.find(f => path.basename(f) === sys.advanced.mainFontFilename);
        const scale = (mainFont && C.rgssFontScale(src.read('Fonts/' + mainFont))) || 0.787;
        sys.advanced.fontSize = Math.round((typeof fontSettings.size === 'number' ? fontSettings.size : 20) * scale * 10) / 10;
        sys.advanced.fontSizeStep = Math.round(8 * scale * 10) / 10;
        const screen = C.screenSize(active.map(s => s.text), constants);
        if (screen) Object.assign(sys.advanced, { screenWidth: screen[0], screenHeight: screen[1], uiAreaWidth: screen[0], uiAreaHeight: screen[1] });
        if (!sheetFiles.has('title')) { sys.title1Name = ''; skipped.push('Graphics/System/Title: not shipped'); }
        if (/\$imported\[:ve_multi_frames\]|\[f\d+\]/i.test(scriptText) && custom.some(s => /multi.?frame/i.test(s.name + s.text.slice(0, 400)))) sys.rrMultiFrames = true;
        writeJson(path.join(dest, 'data', 'System.json'), sys);

        // A per-map battleback table in the game's scripts (DerVVulf's BATTLEBACK_LIST and its kin): map settings, images from its folder.
        const battlebacks = V.battlebackTable(scriptText);
        if (battlebacks.test) { sys.battleback1Name = battlebacks.test; writeJson(path.join(dest, 'data', 'System.json'), sys); }

        // ---- maps --------------------------------------------------------------
        log(`Writing ${mapIds.length} maps and their events…`, 'stage');
        const mapProgress = span(0.12, 0.4);
        const mapInfos = C.mapInfos(infos);
        mapIds.forEach((id, index) => {
            mapProgress(index, mapIds.length, `Map ${index + 1} of ${mapIds.length}: ${(mapInfos[id] && mapInfos[id].name) || ''}`.trim());
            const file = `Map${String(id).padStart(3, '0')}`;
            const raw = data(file);
            if (!raw) { skipped.push(`Data/${file}.rvdata: missing`); return; }
            const json = C.map(V.reshapeMap(raw, ids), notes);
            json.tilesetId = 1;
            if (battlebacks.maps[id]) { json.battleback1Name = battlebacks.maps[id]; json.specifyBattleback = true; }
            V.applyAreas(json, raw, areas.filter(a => a.map_id === id), notes);
            writeJson(path.join(dest, 'data', `${file}.json`), aliased(json));
        });
        writeJson(path.join(dest, 'data', 'MapInfos.json'), mapInfos);

        // ---- graphics, audio ---------------------------------------------------
        log('Copying graphics and audio…', 'stage');
        const plan = [];
        for (const folderName of src.folders('Graphics')) {
            const key = Object.keys(GRAPHICS).find(k => k.toLowerCase() === folderName.toLowerCase());
            if (folderName.toLowerCase() === 'system') {
                for (const f of src.files('Graphics/System')) {
                    const stem = f.replace(/\.[^.]+$/, '');
                    const target = TILE_SHEETS.some(n => n.toLowerCase() === stem.toLowerCase()) ? 'img/tilesets'
                        : stem.toLowerCase() === 'title' ? 'img/titles1' : 'img/system';
                    plan.push(['Graphics/System/' + f, path.join(target, f), 'System']);
                }
                continue;
            }
            const target = key ? GRAPHICS[key] : 'img/' + folderName;
            if (!key) add(notes, 'scriptGraphicsFolder');
            for (const f of src.files('Graphics/' + folderName)) plan.push(['Graphics/' + folderName + '/' + f, path.join(target, f), folderName]);
        }
        for (const [folderName, target] of Object.entries(R.AUDIO)) for (const f of src.files('Audio/' + folderName)) plan.push(['Audio/' + folderName + '/' + f, path.join(target, f), folderName]);
        for (const f of src.files('Movies')) plan.push(['Movies/' + f, path.join('movies', f), 'Movies']);
        const assetProgress = span(0.4, 0.95);
        plan.forEach(([from, to, bucket], index) => {
            if (index % 10 === 0) assetProgress(index, plan.length, `${bucket}: ${path.basename(from)}`);
            if (/\.(txt|rtf|db|ini)$/i.test(from)) return;
            const bytes = src.read(from);
            if (!bytes) return;
            if (!bytes.length) { add(notes, 'emptyPlaceholder'); return; }
            const out = path.join(dest, R.repairPath(to.replace(/\\/g, '/')));
            mkdir(path.dirname(out));
            // VX's Window.png has Ace's layout.
            if (/^Graphics\/System\/Window\.png$/i.test(from)) {
                try {
                    const baseFile = path.join(skeleton, 'img', 'system', 'Window.png');
                    const baseImg = fs.existsSync(baseFile) ? rgba(PNG.sync.read(fs.readFileSync(baseFile))) : null;
                    const converted = C.windowSkin(rgba(PNG.sync.read(bytes)), baseImg);
                    const png = new PNG({ width: converted.width, height: converted.height });
                    png.data = Buffer.from(converted.data.buffer, converted.data.byteOffset, converted.data.length);
                    fs.writeFileSync(out, PNG.sync.write(png));
                    add(images, bucket);
                    return;
                } catch (error) { skipped.push(`${from}: window skin ${error.message}`); }
            }
            fs.writeFileSync(out, bytes);
            add(images, bucket);
        });

        // Battleback images the table and the events name, from the folder the script read them from.
        if (battlebacks.dir) {
            const named = new Set(Object.values(battlebacks.maps).concat(battlebacks.test ? [battlebacks.test] : []));
            for (const f of fs.readdirSync(path.join(dest, 'data'))) for (const m of fs.readFileSync(path.join(dest, 'data', f), 'utf8').matchAll(/_rrBattleback = \\"([^"\\]+)\\"/g)) named.add(m[1]);
            const from = path.join(dest, battlebacks.dir);
            const have = fs.existsSync(from) ? fs.readdirSync(from) : [];
            for (const name of named) {
                const file = have.find(f => f.replace(/\.[^.]+$/, '').toLowerCase() === name.toLowerCase());
                if (file) { fs.copyFileSync(path.join(from, file), path.join(dest, 'img', 'battlebacks1', name + path.extname(file))); add(images, 'Battlebacks'); }
                else skipped.push(`${battlebacks.dir}/${name}: a battleback the game names but does not ship`);
            }
        }

        // ---- plugins -----------------------------------------------------------
        R.copyAliasedAudio(dest, aliases);
        { const n = R.matchFileCase(dest); if (n) add(notes, 'fileNameCase', n); }
        families.extraPlugins = ['RR_VxCompat'];
        { const n = R.writeFamilyQuests(dest, families, custom.map(s => s.text), constants); if (n) add(notes, 'questsImported', n); }
        const installed = R.installPlugins(dest, families, constants, scriptTexts, skipped, log);

        if (custom.length) {
            const dir = path.join(dest, 'legacy', 'Scripts');
            mkdir(dir);
            custom.forEach((s, i) => fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(3, '0')} ${s.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled'}.rb`), s.text));
        }
        if (ini.rtp) skipped.push(`Game.ini names the ${ini.rtp} RTP: graphics and sounds it expected from there are not in the game folder and were not copied`);

        // ---- identity ----------------------------------------------------------
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.name = 'rr-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        pkg.version = editorPackage.version;
        const [sw, sh] = [sys.advanced.screenWidth, sys.advanced.screenHeight];
        const [ww, wh] = [Math.round(sw * 1.5), Math.round(sh * 1.5)];
        pkg.window = Object.assign({}, pkg.window, { title, width: ww, height: wh, min_width: sw, min_height: sh });
        pkg['chromium-args'] = `--force-color-profile=srgb --window-size=${ww},${wh}`;
        writeJson(path.join(dest, 'package.json'), pkg);
        const now = new Date().toISOString();
        writeJson(path.join(dest, 'project.rpgreactor'), { name: title, version: editorPackage.version, engine: 'RPG Reactor', engineVersion: editorPackage.version, imported: true, importedFrom: 'RPG Maker VX', importedAt: now, created: now, modified: now });

        const summary = { source: folder, engine: 'RPG Maker VX', archive: src.archive, title, writtenAt: now, ms: Date.now() - t0, maps: mapIds.length, approximations: notes, files: images, skipped, scripts: inventory().scripts, plugins: installed.map(p => p.name) };
        fs.writeFileSync(path.join(dest, 'import-report.json'), JSON.stringify(summary, null, 2));
        summary.destination = dest;
        report(1, 'Done');
        log(`Wrote "${title}" to ${dest} in ${(summary.ms / 1000).toFixed(1)} s: ${mapIds.length} maps.`, 'done');
        log(`  Files: ${Object.entries(images).map(([k, v]) => `${k} ${v}`).join(', ')}`, 'info');
        const rubyLeft = (notes.rubyScript || 0) + (notes.moveRouteScript || 0) + (notes.rubyCondition || 0) + (notes.rubyOperand || 0);
        if (notes.rubyTranslated || rubyLeft) log(`  Ruby in events: ${notes.rubyTranslated || 0} translated to JavaScript, ${rubyLeft} kept as comments (they call the game's own scripts).`, rubyLeft ? 'warn' : 'info');
        if (custom.length) log(`  ${custom.length} script sections of the game's own (${summary.scripts.customLines} lines of Ruby) are in legacy/Scripts; their behaviour needs a plugin or a hand port.`, 'warn');
        if (skipped.length) {
            log(`  Skipped ${skipped.length}:`, 'warn');
            for (const s of skipped.slice(0, 10)) log(`    ${s}`, 'warn');
            if (skipped.length > 10) log(`    … and ${skipped.length - 10} more (import-report.json)`, 'warn');
        }
        log('  Details in import-report.json.', 'info');
        return summary;
    }

    return { inventory, importProject };
}

function report(folder, options) { return open(folder, null, options).inventory(); }
function importProject(folder, destination, options) { return open(folder, destination, options).importProject(); }

module.exports = { open, report, importProject, STOCK_SCRIPTS };
