/**
 * XpImporter - imports an RPG Maker XP game into a new RPG Reactor project.
 * Node only; LegacyImporter routes an XP folder here.
 *
 * The game may be a project folder (Data/*.rxdata) or a released game
 * (Game.rgssad); both read through RgssImporter's source.
 *
 * XP differs from MZ more than Ace does, and every difference lands in
 * something the author can see and edit: tilesets are re-cut into MZ sheets
 * (XpConvert), the database is re-expressed in MZ's eight parameters
 * (XpDatabase), XP's fog, transitions, event opacity and battle arithmetic
 * are the RR_XpCompat plugin, configured in the Plugin Manager, and its
 * settings read from map notes and event comments the importer writes.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const M = require('./RubyMarshal.js');
const C = require('./RgssConvert.js');
const X = require('./XpConvert.js');
const D = require('./XpDatabase.js');
const R = require('./RgssImporter.js');

/** The script sections every XP project starts with. */
const STOCK_SCRIPTS = new Set(['Game_Temp', 'Game_System', 'Game_Switches', 'Game_Variables', 'Game_SelfSwitches', 'Game_Screen', 'Game_Picture', 'Game_Battler 1', 'Game_Battler 2', 'Game_Battler 3', 'Game_BattleAction', 'Game_Actor', 'Game_Enemy', 'Game_Actors', 'Game_Party', 'Game_Troop', 'Game_Map', 'Game_CommonEvent', 'Game_Character 1', 'Game_Character 2', 'Game_Character 3', 'Game_Event', 'Game_Player', 'Sprite_Character', 'Sprite_Battler', 'Sprite_Picture', 'Sprite_Timer', 'Spriteset_Map', 'Spriteset_Battle', 'Arrow_Base', 'Arrow_Enemy', 'Arrow_Actor', 'Interpreter 1', 'Interpreter 2', 'Interpreter 3', 'Interpreter 4', 'Interpreter 5', 'Interpreter 6', 'Interpreter 7', 'Window_Base', 'Window_Selectable', 'Window_Command', 'Window_Help', 'Window_Gold', 'Window_PlayTime', 'Window_Steps', 'Window_MenuStatus', 'Window_Item', 'Window_Skill', 'Window_SkillStatus', 'Window_Target', 'Window_EquipLeft', 'Window_EquipRight', 'Window_EquipItem', 'Window_Status', 'Window_SaveFile', 'Window_ShopCommand', 'Window_ShopBuy', 'Window_ShopSell', 'Window_ShopNumber', 'Window_ShopStatus', 'Window_NameEdit', 'Window_NameInput', 'Window_InputNumber', 'Window_Message', 'Window_PartyCommand', 'Window_BattleStatus', 'Window_BattleResult', 'Window_DebugLeft', 'Window_DebugRight', 'Scene_Title', 'Scene_Map', 'Scene_Menu', 'Scene_Item', 'Scene_Skill', 'Scene_Equip', 'Scene_Status', 'Scene_File', 'Scene_Save', 'Scene_Load', 'Scene_End', 'Scene_Battle 1', 'Scene_Battle 2', 'Scene_Battle 3', 'Scene_Battle 4', 'Scene_Shop', 'Scene_Name', 'Scene_Gameover', 'Scene_Debug', 'Main']);

/** XP graphics folders copied as they are, and where MZ keeps the same kind of image. */
const GRAPHICS = { Animations: 'img/animations', Battlebacks: 'img/battlebacks1', Battlers: 'img/enemies', Panoramas: 'img/parallaxes', Pictures: 'img/pictures', Titles: 'img/titles1', Fogs: 'img/fogs', Transitions: 'img/transitions', Gameovers: 'img/gameovers', Faces: 'img/faces' };
/** Folders consumed into something else: characters are renamed, tilesets re-cut, icons packed, window skins converted. */
const CONVERTED = new Set(['characters', 'tilesets', 'autotiles', 'icons', 'windowskins']);

function gameIni(src) {
    const b = src.read('Game.ini');
    const text = b ? b.toString('latin1') : '';
    const get = (k) => { const m = new RegExp(`^[ \\t]*${k}[ \\t]*=[ \\t]*(.*)$`, 'mi').exec(text); return m ? m[1].trim() : ''; };
    return { title: get('Title'), rtp: [get('RTP1'), get('RTP2'), get('RTP3')].filter(Boolean) };
}

function open(folder, destination, options) {
    options = options || {};
    folder = path.resolve(folder);
    const src = R.source(folder);
    const data = (name) => { const b = src.read(`Data/${name}.rxdata`); return b ? M.load(b) : null; };
    const xp = {
        actors: data('Actors') || [], classes: data('Classes') || [], skills: data('Skills') || [], items: data('Items') || [], weapons: data('Weapons') || [], armors: data('Armors') || [],
        enemies: data('Enemies') || [], troops: data('Troops') || [], states: data('States') || [], animations: data('Animations') || [], commonEvents: data('CommonEvents') || [], tilesets: data('Tilesets') || []
    };
    const system = data('System') || {};
    const infos = data('MapInfos') || {};
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
    const title = ini.title || path.basename(folder);

    function inventory() {
        const count = (arr) => (arr || []).filter(Boolean).length;
        return {
            engine: 'RPG Maker XP', title, archive: src.archive,
            database: Object.fromEntries(Object.entries(xp).map(([k, v]) => [k, count(v)])),
            maps: mapIds.length,
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
        const readPng = (rel) => { const b = src.read(rel); if (!b) return null; try { return rgba(PNG.sync.read(b)); } catch (_) { return null; } };
        const writePng = (file, img) => { const png = new PNG({ width: img.width, height: img.height }); png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length); mkdir(path.dirname(file)); fs.writeFileSync(file, PNG.sync.write(png)); };
        /** A graphic by its XP name (no extension), in any of the formats RGSS loads. */
        const findGraphic = (folderName, name) => {
            if (!name) return null;
            const files = graphicFiles(folderName);
            return files.find(f => f.replace(/\.(png|jpg|jpeg|bmp)$/i, '').toLowerCase() === name.toLowerCase()) || null;
        };
        const fileCache = new Map();
        const graphicFiles = (folderName) => { if (!fileCache.has(folderName)) fileCache.set(folderName, src.files('Graphics/' + folderName)); return fileCache.get(folderName); };
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
        for (const f of [...Object.values(GRAPHICS), ...Object.values(R.AUDIO), 'img/characters', 'img/tilesets', 'img/faces', 'img/sv_actors', 'img/sv_enemies', 'img/battlebacks2', 'img/titles2', 'movies']) mkdir(path.join(dest, f));

        // ---- the database ------------------------------------------------------
        log('Converting the database…', 'stage');
        report(0.05, 'Converting the database…');
        const constants = C.scriptConstants(custom.map(s => s.text));
        const scriptText = custom.map(s => s.text).join('\n');
        const families = C.scriptFamilies(custom.map(s => s.text));
        C.setContext({ constants, messageCodes: {}, families, names: {} });
        const ruby = (source, kind, context) => C.ruby(source, kind, Object.assign({ constants }, context));

        // Icons are one file each in XP; MZ reads them from one IconSet sheet, 16 across.
        const iconNames = new Map();
        const iconFiles = graphicFiles('Icons').filter(f => /\.png$/i.test(f));
        if (iconFiles.length) {
            const perRow = 16, size = 24;
            const sheet = X.blank(perRow * size, Math.ceil((iconFiles.length + 1) / perRow) * size);
            iconFiles.forEach((f, i) => {
                const img = readPng('Graphics/Icons/' + f);
                if (!img) return;
                const index = i + 1;
                X.blit(sheet, img, 0, 0, size, size, (index % perRow) * size, Math.floor(index / perRow) * size);
                iconNames.set(f.replace(/\.png$/i, '').toLowerCase(), index);
            });
            writePng(path.join(dest, 'img', 'system', 'IconSet.png'), sheet);
            add(images, 'Icons', iconFiles.length);
        }
        const icons = (name) => iconNames.get(String(name || '').toLowerCase()) || 0;
        const db = D.database(xp, notes, icons);
        const troops = X.troops(xp.troops, notes, ruby);
        const commonEvents = X.commonEvents(xp.commonEvents, notes, ruby);

        // ---- tilesets ----------------------------------------------------------
        log('Re-cutting tilesets into MZ sheets…', 'stage');
        const tilesetProgress = span(0.1, 0.2);
        const tilesets = [null];
        const bases = [];
        const cutSheets = new Map();
        const tilesetList = xp.tilesets.filter(Boolean);
        tilesetList.forEach((ts, index) => {
            tilesetProgress(index, tilesetList.length, `Tileset ${ts.id}: ${ts.name || ''}`);
            const image = ts.tileset_name ? findGraphic('Tilesets', ts.tileset_name) : null;
            if (ts.tileset_name && !image) skipped.push(`Graphics/Tilesets/${ts.tileset_name}: not shipped (RTP?)`);
            const autotiles = (ts.autotile_names || []).map(n => {
                const f = findGraphic('Autotiles', n);
                if (n && !f) skipped.push(`Graphics/Autotiles/${n}: not shipped (RTP?)`);
                return f ? readPng('Graphics/Autotiles/' + f) : null;
            });
            const { sheets, autotiles: b } = X.tilesetSheets(image ? readPng('Graphics/Tilesets/' + image) : null, autotiles);
            bases[ts.id] = b;
            const names = {};
            const stem = `XP${String(ts.id).padStart(3, '0')}`;
            for (const [key, img] of Object.entries(sheets)) {
                if (!img) continue;
                // B–E only depend on the tileset image, so tilesets sharing one share the sheets.
                const shared = /^[B-E]$/.test(key) ? `${ts.tileset_name}_${key}` : null;
                if (shared && cutSheets.has(shared)) { names[key] = cutSheets.get(shared); continue; }
                const name = shared ? `${String(ts.tileset_name).replace(/[\\/:*?"<>|]/g, '_')}_${key}` : `${stem}_${key}`;
                writePng(path.join(dest, 'img', 'tilesets', name + '.png'), img);
                if (shared) cutSheets.set(shared, name);
                names[key] = name;
                add(images, 'Tilesets');
            }
            tilesets[ts.id] = X.tilesetRecord(ts, names, X.tilesetFlags(ts, b));
        });
        for (let i = 1; i < tilesets.length; i++) if (tilesets[i] === undefined) tilesets[i] = null;

        // Music a script of the game's plays in place of what its events name.
        const aliases = C.audioAliases(custom.map(s => s.text));
        const aliased = (value) => { const n = C.applyAudioAliases(value, aliases); if (n) add(notes, 'audioAliased', n); return value; };
        aliased(troops); aliased(commonEvents);
        const files = { Actors: db.actors, Classes: db.classes, Skills: db.skills, Items: db.items, Weapons: db.weapons, Armors: db.armors, Enemies: db.enemies, Troops: troops, States: db.states, Animations: db.animations, CommonEvents: commonEvents, Tilesets: tilesets };
        for (const [file, records] of Object.entries(files)) writeJson(path.join(dest, 'data', `${file}.json`), records);
        const base = JSON.parse(fs.readFileSync(path.join(skeleton, 'data', 'System.json'), 'utf8'));
        const sys = aliased(D.system(base, system, title, notes));
        sys.rrGuardSkillId = db.guardSkillId;
        // Every XP character sheet is one character, four frames a row ($name[f4]).
        sys.rrMultiFrames = true;
        sys.rrBalloonSize = 32;
        const fontSettings = C.fontDefaults(active.map(s => s.text), constants);
        if (typeof fontSettings.size === 'number') sys.advanced.fontSize = fontSettings.size;
        const screen = C.screenSize(active.map(s => s.text), constants);
        if (screen) Object.assign(sys.advanced, { screenWidth: screen[0], screenHeight: screen[1], uiAreaWidth: screen[0], uiAreaHeight: screen[1] });
        if (system.windowskin_name) sys.rrWindowskin = String(system.windowskin_name);
        // XP's own message codes take one number; lists belong to the game's message script, which is not here.
        if (custom.some(s => /gsub!?\(\/\\\\\[?[A-Za-z]/.test(s.text))) sys.advanced.rrCodeLists = true;
        // A title or battleback the game does not ship (a script drew its own) would stop the game loading.
        for (const [key, folderName] of [['title1Name', 'Titles'], ['battleback1Name', 'Battlebacks']]) {
            if (sys[key] && !findGraphic(folderName, sys[key])) { skipped.push(`Graphics/${folderName}/${sys[key]}: named by the system data but not shipped`); sys[key] = ''; }
        }
        writeJson(path.join(dest, 'data', 'System.json'), sys);

        // ---- maps --------------------------------------------------------------
        log(`Writing ${mapIds.length} maps and their events…`, 'stage');
        const mapProgress = span(0.2, 0.45);
        const mapInfos = C.mapInfos(infos);
        mapIds.forEach((id, index) => {
            mapProgress(index, mapIds.length, `Map ${index + 1} of ${mapIds.length}: ${(mapInfos[id] && mapInfos[id].name) || ''}`.trim());
            const file = `Map${String(id).padStart(3, '0')}`;
            const raw = data(file);
            if (!raw) { skipped.push(`Data/${file}.rxdata: missing`); return; }
            const ts = xp.tilesets[raw.tileset_id] || null;
            const json = aliased(X.map(raw, ts, bases[raw.tileset_id] || [], notes, ruby));
            // XP names a map in MapInfos only; MZ shows displayName on entry, which XP never did.
            writeJson(path.join(dest, 'data', `${file}.json`), json);
        });
        writeJson(path.join(dest, 'data', 'MapInfos.json'), mapInfos);

        // ---- graphics, audio ---------------------------------------------------
        log('Copying graphics and audio…', 'stage');
        const plan = [];
        for (const folderName of src.folders('Graphics')) {
            const lower = folderName.toLowerCase();
            if (CONVERTED.has(lower)) continue;
            const key = Object.keys(GRAPHICS).find(k => k.toLowerCase() === lower);
            const target = key ? GRAPHICS[key] : 'img/' + folderName;
            if (!key) add(notes, 'scriptGraphicsFolder');
            for (const f of graphicFiles(folderName)) plan.push(['Graphics/' + folderName + '/' + f, path.join(target, f), folderName]);
        }
        for (const f of graphicFiles('Characters')) plan.push(['Graphics/Characters/' + f, path.join('img/characters', path.dirname(f), X.characterName(path.basename(f).replace(/\.png$/i, '')) + '.png'), 'Characters']);
        for (const [folderName, target] of Object.entries(R.AUDIO)) for (const f of src.files('Audio/' + folderName)) plan.push(['Audio/' + folderName + '/' + f, path.join(target, f), folderName]);
        const assetProgress = span(0.45, 0.95);
        plan.forEach(([from, to, bucket], index) => {
            if (index % 10 === 0) assetProgress(index, plan.length, `${bucket}: ${path.basename(from)}`);
            if (/\.(txt|rtf|db|ini)$/i.test(from)) return;
            const bytes = src.read(from);
            if (!bytes) return;
            // Zero-byte files are placeholders a script plays something else for (see audioAliases).
            if (!bytes.length) { add(notes, 'emptyPlaceholder'); return; }
            const out = path.join(dest, R.repairPath(to.replace(/\\/g, '/')));
            mkdir(path.dirname(out));
            fs.writeFileSync(out, bytes);
            add(images, bucket);
        });
        // XP's game-over image is MZ's img/system/GameOver.png.
        const gameover = findGraphic('Gameovers', system.gameover_name);
        if (gameover) fs.writeFileSync(path.join(dest, 'img', 'system', 'GameOver.png'), src.read('Graphics/Gameovers/' + gameover));
        // Window skins: each converted into MZ's layout under img/windowskins (Change Windowskin picks
        // among them); the game's own becomes img/system/Window.png.
        const baseSkinFile = path.join(skeleton, 'img', 'system', 'Window.png');
        const baseSkin = fs.existsSync(baseSkinFile) ? rgba(PNG.sync.read(fs.readFileSync(baseSkinFile))) : null;
        // A game whose system data names no skin sets one from an event: the skin events pick most.
        const skinCounts = notes.windowskinNames || {};
        // Failing both, a full skin the game's scripts load by name.
        const scriptSkins = Array.from(scriptText.matchAll(/windowskin\(\s*"([^"]+)"\s*\)/g)).map(m => m[1])
            .filter(n => { const f = findGraphic('Windowskins', n); const img = f && readPng('Graphics/Windowskins/' + f); return img && img.width === 192 && img.height === 128; });
        const defaultSkin = String(system.windowskin_name || '') || Object.keys(skinCounts).sort((a, b) => skinCounts[b] - skinCounts[a])[0] || scriptSkins[0] || '';
        for (const f of graphicFiles('Windowskins').filter(n => /\.png$/i.test(n))) {
            const skin = readPng('Graphics/Windowskins/' + f);
            if (!skin) continue;
            // Only full skins (192×128) convert; the rest are images scripts draw themselves.
            const full = skin.width === 192 && skin.height === 128;
            if (full) {
                const converted = X.windowSkin(skin, baseSkin);
                writePng(path.join(dest, 'img', 'windowskins', f), converted);
                if (f.replace(/\.png$/i, '').toLowerCase() === defaultSkin.toLowerCase()) writePng(path.join(dest, 'img', 'system', 'Window.png'), converted);
            } else {
                mkdir(path.join(dest, 'img', 'windowskins'));
                fs.writeFileSync(path.join(dest, 'img', 'windowskins', f), src.read('Graphics/Windowskins/' + f));
            }
            add(images, 'Windowskins');
        }

        // ---- plugins -----------------------------------------------------------
        // XP's own rules (fog, transitions, event opacity, battle arithmetic, 40 fps movement) always come along.
        families.extraPlugins = [{ name: 'RR_ShazMultiFog', parameters: () => ({ keepOnTransfer: 'false', folder: 'img/fogs/' }) }, 'RR_XpCompat'];
        R.copyAliasedAudio(dest, aliases);
        { const n = R.matchFileCase(dest); if (n) add(notes, 'fileNameCase', n); }
        { const n = R.writeFamilyQuests(dest, families, custom.map(s => s.text), constants); if (n) add(notes, 'questsImported', n); }
        const installed = R.installPlugins(dest, families, constants, custom.map(s => s.text), skipped, log);

        if (custom.length) {
            const dir = path.join(dest, 'legacy', 'Scripts');
            mkdir(dir);
            custom.forEach((s, i) => fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(3, '0')} ${s.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled'}.rb`), s.text));
        }
        if (ini.rtp.length) skipped.push(`Game.ini names the ${ini.rtp.join(', ')} RTP: graphics and sounds it expected from there are not in the game folder and were not copied`);

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
        writeJson(path.join(dest, 'project.rpgreactor'), { name: title, version: editorPackage.version, engine: 'RPG Reactor', engineVersion: editorPackage.version, imported: true, importedFrom: 'RPG Maker XP', importedAt: now, created: now, modified: now });

        const summary = { source: folder, engine: 'RPG Maker XP', archive: src.archive, title, writtenAt: now, ms: Date.now() - t0, maps: mapIds.length, approximations: notes, files: images, skipped, scripts: inventory().scripts, plugins: installed.map(p => p.name) };
        fs.writeFileSync(path.join(dest, 'import-report.json'), JSON.stringify(summary, null, 2));
        summary.destination = dest;
        report(1, 'Done');
        log(`Wrote "${title}" to ${dest} in ${(summary.ms / 1000).toFixed(1)} s: ${mapIds.length} maps.`, 'done');
        log(`  Files: ${Object.entries(images).map(([k, v]) => `${k} ${v}`).join(', ')}`, 'info');
        const rubyLeft = (notes.rubyScript || 0) + (notes.moveRouteScript || 0) + (notes.rubyCondition || 0);
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
