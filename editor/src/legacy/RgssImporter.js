/**
 * RgssImporter - imports an RPG Maker VX Ace game into a new RPG Reactor
 * project. Node only (files and PNGs); LegacyImporter routes an Ace folder
 * here, so the CLI, the editor's worker and the dialog need nothing new.
 *
 * The game may be a project folder (Data/*.rvdata2 on disk) or a released
 * game (Data, and often Graphics, inside Game.rgss3a); both are read through
 * one source that prefers the archive, as the engine does.
 *
 * What converts: the database, tilesets, maps and their events, common events,
 * troops, the system data and its vocabulary, graphics, audio and fonts. What
 * cannot: Ruby. The game's own script sections are copied into the project's
 * legacy/Scripts folder for reference and counted in the report; Script
 * commands and move-route scripts are translated where they only use stock
 * calls and kept as comments otherwise.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const A = require('./RgssArchive.js');
const M = require('./RubyMarshal.js');
const C = require('./RgssConvert.js');

/** The script sections every VX Ace project starts with; anything else is the game's own. */
const STOCK_SCRIPTS = new Set(['Vocab', 'Sound', 'Cache', 'DataManager', 'SceneManager', 'BattleManager', 'Game_Temp', 'Game_System', 'Game_Timer', 'Game_Message', 'Game_Switches', 'Game_Variables', 'Game_SelfSwitches', 'Game_Screen', 'Game_Picture', 'Game_Pictures', 'Game_BaseItem', 'Game_Action', 'Game_ActionResult', 'Game_BattlerBase', 'Game_Battler', 'Game_Actor', 'Game_Enemy', 'Game_Actors', 'Game_Unit', 'Game_Party', 'Game_Troop', 'Game_Map', 'Game_CommonEvent', 'Game_CharacterBase', 'Game_Character', 'Game_Player', 'Game_Follower', 'Game_Followers', 'Game_Vehicle', 'Game_Event', 'Game_Interpreter', 'Sprite_Base', 'Sprite_Character', 'Sprite_Battler', 'Sprite_Picture', 'Sprite_Timer', 'Spriteset_Weather', 'Spriteset_Map', 'Spriteset_Battle', 'Window_Base', 'Window_Selectable', 'Window_Command', 'Window_HorzCommand', 'Window_Help', 'Window_Gold', 'Window_MenuCommand', 'Window_MenuStatus', 'Window_MenuActor', 'Window_ItemCategory', 'Window_ItemList', 'Window_SkillCommand', 'Window_SkillStatus', 'Window_SkillList', 'Window_EquipStatus', 'Window_EquipCommand', 'Window_EquipSlot', 'Window_EquipItem', 'Window_Status', 'Window_SaveFile', 'Window_ShopCommand', 'Window_ShopBuy', 'Window_ShopSell', 'Window_ShopNumber', 'Window_ShopStatus', 'Window_NameEdit', 'Window_NameInput', 'Window_ChoiceList', 'Window_NumberInput', 'Window_KeyItem', 'Window_Message', 'Window_ScrollText', 'Window_MapName', 'Window_BattleLog', 'Window_PartyCommand', 'Window_ActorCommand', 'Window_BattleStatus', 'Window_BattleActor', 'Window_BattleEnemy', 'Window_BattleSkill', 'Window_BattleItem', 'Window_TitleCommand', 'Window_GameEnd', 'Window_DebugLeft', 'Window_DebugRight', 'Scene_Base', 'Scene_Title', 'Scene_Map', 'Scene_MenuBase', 'Scene_Menu', 'Scene_ItemBase', 'Scene_Item', 'Scene_Skill', 'Scene_Equip', 'Scene_Status', 'Scene_File', 'Scene_Save', 'Scene_Load', 'Scene_End', 'Scene_Shop', 'Scene_Name', 'Scene_Debug', 'Scene_Battle', 'Scene_Gameover', 'Main']);

/** Ace graphics folders and where MZ keeps the same kind of image. */
const GRAPHICS = { Animations: 'img/animations', Battlebacks1: 'img/battlebacks1', Battlebacks2: 'img/battlebacks2', Battlers: 'img/enemies', Characters: 'img/characters', Faces: 'img/faces', Parallaxes: 'img/parallaxes', Pictures: 'img/pictures', System: 'img/system', Tilesets: 'img/tilesets', Titles1: 'img/titles1', Titles2: 'img/titles2' };
const AUDIO = { BGM: 'audio/bgm', BGS: 'audio/bgs', ME: 'audio/me', SE: 'audio/se' };
const ARCHIVES = ['Game.rgss3a', 'Game.rgss2a', 'Game.rgssad'];

/**
 * A file name a zip tool mangled: Shift-JIS bytes read as code page 437 and
 * saved as UTF-8 (Battle_01_îÄë║é╠… for Battle_01_月下の…). Returns the name
 * the game's data uses, or the name unchanged when it is not such a name.
 */
const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const CP437_BYTE = new Map(Array.from(CP437_HIGH).map((c, i) => [c, 128 + i]));
function repairName(name) {
    if (!/[^\x00-\x7f]/.test(name)) return name;
    const bytes = [];
    for (const ch of name) {
        const code = ch.charCodeAt(0);
        if (code < 128) bytes.push(code);
        else if (CP437_BYTE.has(ch)) bytes.push(CP437_BYTE.get(ch));
        else return name;
    }
    let decoded;
    try { decoded = new TextDecoder('shift_jis', { fatal: true }).decode(Uint8Array.from(bytes)); } catch (_) { return name; }
    // Only a name that reads as Japanese is taken: Falltür and Höhle are real names that happen to
    // decode to a kanji or two. Mojibake of Shift-JIS nearly always shows box-drawing or Greek
    // letters (the trail bytes), or decodes to several Japanese characters.
    if (/[^\x00-\x7f\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(decoded)) return name;
    const kana = (decoded.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
    const telltale = /[\u2500-\u25ff\u0391-\u03c9\u2190-\u22ff\u2320\u2321\u207f\u00b1\u00b2\u00b7\u00b0\u00f7]/.test(name);
    // (A European name has its accents one at a time; a Shift-JIS pair shows as two high characters together.)
    const paired = /[^\x00-\x7f]{2}/.test(name), alternating = /[^\x00-\x7f][\x40-\x7e][^\x00-\x7f][\x40-\x7e]/.test(name);
    return kana >= 3 || (kana >= 1 && (telltale || paired)) || (kana >= 2 && alternating) ? decoded : name;
}
const repairPath = (rel) => rel.split('/').map(repairName).join('/');

/** A game folder and its archive, read as one tree; the archive wins, as in the engine. */
function source(folder) {
    const dirCache = new Map();
    const entries = (dir) => { if (!dirCache.has(dir)) { try { dirCache.set(dir, fs.readdirSync(dir, { withFileTypes: true })); } catch (_) { dirCache.set(dir, []); } } return dirCache.get(dir); };
    const onDisk = (rel) => {
        let at = folder;
        for (const part of rel.split('/').filter(Boolean)) {
            const hit = entries(at).find(e => e.name === part) || entries(at).find(e => e.name.toLowerCase() === part.toLowerCase());
            if (!hit) return null;
            at = path.join(at, hit.name);
        }
        return at;
    };
    const archiveName = ARCHIVES.find(n => onDisk(n));
    const archive = archiveName ? A.open(fs.readFileSync(onDisk(archiveName))) : null;
    return {
        folder, archive: archiveName || null,
        read(rel) {
            if (archive && archive.has(rel)) return Buffer.from(archive.read(rel));
            const p = onDisk(rel);
            return p && fs.statSync(p).isFile() ? fs.readFileSync(p) : null;
        },
        /** Every file under a folder, relative to it (archive and disk merged, archive spelling first). */
        files(dir) {
            const seen = new Map();
            const prefix = dir.replace(/\/?$/, '/').toLowerCase();
            if (archive) for (const p of archive.list()) if (p.toLowerCase().startsWith(prefix)) { const rel = p.slice(prefix.length); seen.set(rel.toLowerCase(), rel); }
            const root = onDisk(dir);
            const walk = (abs, rel) => { for (const e of entries(abs)) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(abs, e.name), r); else if (!seen.has(r.toLowerCase())) seen.set(r.toLowerCase(), r); } };
            if (root && fs.statSync(root).isDirectory()) walk(root, '');
            return Array.from(seen.values());
        },
        folders(dir) {
            const out = new Map();
            const prefix = dir.replace(/\/?$/, '/').toLowerCase();
            if (archive) for (const p of archive.list()) if (p.toLowerCase().startsWith(prefix)) { const top = p.slice(prefix.length).split('/')[0]; if (p.slice(prefix.length).includes('/')) out.set(top.toLowerCase(), top); }
            const root = onDisk(dir);
            if (root) for (const e of entries(root)) if (e.isDirectory() && !out.has(e.name.toLowerCase())) out.set(e.name.toLowerCase(), e.name);
            return Array.from(out.values());
        }
    };
}

/**
 * JavaScript ports of the published scripts a game carried, installed as the
 * project's plugins (visible and switchable in the Plugin Manager), configured
 * from the scripts' own settings. `read(relativePath)` hands a settings reader
 * a file the game shipped (bytes, or null). Returns the installed entries.
 */
function installPlugins(dest, families, constants, scriptTexts, skipped, log, read = () => null) {
    const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
    const installed = [];
    const wanted = [];
    for (const f of C.FAMILIES.filter(f => families.has(f.key) && f.plugin)) {
        // A port built on another port installs that one first, with this family's settings for it.
        for (const base of f.requires || []) wanted.push({ name: base, parameters: f.parameters });
        wanted.push({ name: f.plugin, parameters: f.requires ? null : f.parameters });
    }
    for (const extra of families.extraPlugins || []) wanted.push(typeof extra === 'string' ? { name: extra } : extra);
    for (const family of wanted) {
        if (installed.some(p => p.name === family.name)) continue;
        const file = path.join(__dirname, 'plugins', family.name + '.js');
        if (!fs.existsSync(file)) continue;
        mkdir(path.join(dest, 'js', 'plugins'));
        fs.copyFileSync(file, path.join(dest, 'js', 'plugins', family.name + '.js'));
        const description = (/@plugindesc\s+(.*)/.exec(fs.readFileSync(file, 'utf8')) || [, ''])[1].trim();
        // A plugin's settings come from the game's own script: a .params.js beside it reads them.
        const extractor = path.join(__dirname, 'plugins', family.name + '.params.js');
        let parameters = family.parameters ? family.parameters(constants) : {};
        if (fs.existsSync(extractor)) {
            try { parameters = Object.assign(parameters, require(extractor).extract({ scripts: scriptTexts, constants, read })); }
            catch (error) { skipped.push(`${family.name}: settings could not be read from the game's script (${error.message}); defaults used`); }
        }
        installed.push({ name: family.name, status: true, description, parameters });
    }
    if (installed.length) {
        const manifest = path.join(dest, 'js', 'reactor_plugins.js');
        let existing = [];
        try { existing = JSON.parse(/\$plugins\s*=\s*(\[[\s\S]*\]);?/.exec(fs.readFileSync(manifest, 'utf8'))[1]); } catch (_) { existing = []; }
        const all = existing.concat(installed);
        // Written beside and renamed into place, so a failed write never leaves a half manifest.
        const temp = manifest + '.part';
        fs.writeFileSync(temp, '// Generated by RPG Maker.\n// Do not edit this file directly.\nvar $plugins =\n[\n' + all.map(p => JSON.stringify(p)).join(',\n') + '\n];\n');
        fs.renameSync(temp, manifest);
        log(`  Installed ${installed.length} plugin${installed.length === 1 ? '' : 's'} ported from the game's scripts: ${installed.map(p => p.name).join(', ')}.`, 'info');
    }
    return installed;
}

/** Aliased audio whose file sits in another folder (an ME table playing a BGM file) is copied to the folder that plays it. */
function copyAliasedAudio(dest, aliases) {
    let copied = 0;
    for (const [kind, table] of Object.entries(aliases || {})) {
        for (const { name, from } of table.values()) {
            if (!from || from === kind) continue;
            const dir = path.join(dest, 'audio', from, path.dirname(name));
            if (!fs.existsSync(dir)) continue;
            for (const f of fs.readdirSync(dir)) {
                if (f.replace(/\.[^.]+$/, '').toLowerCase() !== path.basename(name).toLowerCase()) continue;
                const target = path.join(dest, 'audio', kind, path.dirname(name), f);
                if (fs.existsSync(target)) continue;
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.copyFileSync(path.join(dir, f), target);
                copied++;
            }
        }
    }
    return copied;
}

/** References spelled as their files are on disk (ProjectFiles.matchFileCase). */
const matchFileCase = (dest) => require('./ProjectFiles.js').matchFileCase(dest);

/**
 * Quests a game's journal script defined (a family's `quests(scripts, constants)`),
 * written as Reactor's own: data/ReactorQuests.json, edited in Database › Quests.
 * Returns how many.
 */
function writeFamilyQuests(dest, families, scriptTexts, constants) {
    const records = [];
    for (const family of C.FAMILIES) {
        if (!families.has(family.key) || typeof family.quests !== 'function') continue;
        for (const q of family.quests(scriptTexts, constants) || []) {
            records.push({
                id: records.length + 1, name: q.name || q.key, key: q.key || '', category: q.category || '', iconIndex: q.iconIndex || 0, difficulty: '',
                from: q.from || '', location: q.location || '', description: q.description || '',
                objectives: (q.objectives || []).map(text => ({ text, hidden: false, switchId: 0 })), rewards: (q.rewards || []).map(text => ({ text, hidden: false })),
                subtext: '', quotes: '', activation: { type: 'command', switchId: 0, variableId: 0, operator: '>=', value: 0 }, completion: { type: 'command', switchId: 0 },
                note: `<Imported from: ${family.key}>`
            });
        }
    }
    if (records.length) fs.writeFileSync(path.join(dest, 'data', 'ReactorQuests.json'), JSON.stringify([null].concat(records), null, 2));
    return records.length;
}

function open(folder, destination, options) {
    options = options || {};
    folder = path.resolve(folder);
    const src = source(folder);
    const ext = '.rvdata2';
    const data = (name) => { const b = src.read(`Data/${name}${ext}`); return b ? M.load(b) : null; };
    const ace = {
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
    // Main starts the game loop and never returns, so the sections after it never run.
    const mainAt = scripts.findIndex(s => s.name.trim() === 'Main');
    const active = mainAt >= 0 ? scripts.slice(0, mainAt) : scripts;
    const custom = active.filter(s => s.text.trim() && !STOCK_SCRIPTS.has(s.name));
    const mapIds = (infos instanceof Map ? Array.from(infos.keys()) : Object.keys(infos)).map(Number).filter(n => n > 0).sort((a, b) => a - b);
    const title = String(system.game_title || '') || path.basename(folder);

    function inventory() {
        const count = (arr) => (arr || []).filter(Boolean).length;
        return {
            engine: 'RPG Maker VX Ace', title, archive: src.archive,
            database: Object.fromEntries(Object.entries(ace).map(([k, v]) => [k, count(v)])),
            maps: mapIds.length,
            scripts: { sections: scripts.length, custom: custom.length, customLines: custom.reduce((n, s) => n + s.text.split('\n').length, 0), names: custom.map(s => s.name) }
        };
    }

    // ---- writing the project ---------------------------------------------------
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
        const notes = {};
        const skipped = [];
        const images = {};
        const add = (bucket, key, n = 1) => { bucket[key] = (bucket[key] || 0) + n; };
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
        for (const f of [...Object.values(GRAPHICS), ...Object.values(AUDIO), 'img/sv_actors', 'img/sv_enemies', 'movies']) mkdir(path.join(dest, f));

        log('Converting the database…', 'stage');
        report(0.05, 'Converting the database…');
        const constants = C.scriptConstants(custom.map(s => s.text));
        // What the game's message scripts add, so their text codes convert (see RgssConvert.messageText).
        const scriptText = custom.map(s => s.text).join('\n');
        const messageCodes = {
            nameBox: /YEA-MessageSystem|\\\\N[CR]?<|\bname_window\b/i.test(scriptText),
            yeaIcons: /YEA-MessageSystem/.test(scriptText),
            messageFace: /Message Face Control|message_face_control/i.test(scriptText)
        };
        const nameTable = (records) => { const out = []; for (const r of records || []) if (r && r.id) out[r.id] = { name: String(r.name || ''), icon: Number(r.icon_index) || 0 }; return out; };
        const families = C.scriptFamilies(custom.map(s => s.text));
        C.setContext({ constants, messageCodes, families, names: { items: nameTable(ace.items), weapons: nameTable(ace.weapons), armors: nameTable(ace.armors), skills: nameTable(ace.skills) } });
        const db = C.database(ace, notes);
        // Music a script of the game's plays in place of what its events name.
        const aliases = C.audioAliases(custom.map(s => s.text));
        const aliased = (value) => { const n = C.applyAudioAliases(value, aliases); if (n) add(notes, 'audioAliased', n); return value; };
        aliased(db.troops); aliased(db.commonEvents);
        const files = { Actors: db.actors, Classes: db.classes, Skills: db.skills, Items: db.items, Weapons: db.weapons, Armors: db.armors, Enemies: db.enemies, Troops: db.troops, States: db.states, Animations: db.animations, CommonEvents: db.commonEvents, Tilesets: db.tilesets };
        for (const [file, records] of Object.entries(files)) writeJson(path.join(dest, 'data', `${file}.json`), records);
        const base = JSON.parse(fs.readFileSync(path.join(skeleton, 'data', 'System.json'), 'utf8'));
        const sys = aliased(C.system(base, system, notes));
        const vocab = scripts.find(s => s.name === 'Vocab');
        if (vocab) Object.assign(sys.terms.messages, C.vocabMessages(vocab.text));
        // Fonts the game ships. The main font is the first its scripts name (Font.default_name) that RGSS
        // would find: a shipped file, or a Windows font every player had (Arial), drawn by that CSS family.
        // Ace's own default is VL Gothic.
        const fonts = src.files('Fonts').filter(f => /\.(ttf|otf|woff2?)$/i.test(f));
        const fontSettings = C.fontDefaults(active.map(s => s.text), constants);
        const chosen = C.chooseFont(fontSettings.name, fonts) || C.chooseFont(['VL Gothic'], fonts);
        if (fonts.length) {
            mkdir(path.join(dest, 'fonts'));
            for (const f of fonts) fs.writeFileSync(path.join(dest, 'fonts', path.basename(f)), src.read('Fonts/' + f));
            sys.advanced.mainFontFilename = path.basename((chosen && chosen.file) || fonts[0]);
            add(images, 'Fonts', fonts.length);
        }
        let scale = 0.787;   // VL Gothic's, when the font is not shipped
        if (chosen && chosen.family) {
            sys.advanced.mainFontFilename = '';
            const quote = (n) => (/^[A-Za-z-]+$/.test(n) ? n : `"${n}"`);
            sys.advanced.fallbackFonts = [chosen.family, ...chosen.fallbacks].map(quote).concat(['sans-serif']).join(', ');
            scale = chosen.scale;
            add(notes, 'systemFont');
        } else {
            const mainFont = sys.advanced.mainFontFilename && fonts.find(f => path.basename(f) === sys.advanced.mainFontFilename);
            scale = (mainFont && C.rgssFontScale(src.read('Fonts/' + mainFont))) || scale;
        }
        // RGSS sizes a font by its cell, a browser by its em (see rgssFontScale).
        const rgssSize = typeof fontSettings.size === 'number' ? fontSettings.size : 24;
        sys.advanced.fontSize = Math.round(rgssSize * scale * 10) / 10;
        // \{ and \} step 8 RGSS units in Ace (MZ steps 12 px).
        sys.advanced.fontSizeStep = Math.round(8 * scale * 10) / 10;
        // Yanfly's message system draws the speaker's name without a window, over the message frame.
        const yeaName = (key, d) => { const v = constants[key]; return typeof v === 'number' ? v : d; };
        if (messageCodes.nameBox && /YEA-MessageSystem/.test(scriptText)) {
            sys.advanced.rrNameBox = { opacity: yeaName('NAME_WINDOW_OPACITY', 255), offsetX: yeaName('NAME_WINDOW_X_BUFFER', -20), offsetY: yeaName('NAME_WINDOW_Y_BUFFER', 0) };
        }
        // Runtime rules only an Ace game needs, switched on in its own data (an MV or MZ project never has them):
        // 32 px balloons, and [fN] character sheets when the game carries Victor Engine's Multi Frames.
        sys.rrBalloonSize = 32;

        if (custom.some(s => /\$imported\[:ve_multi_frames\]/.test(s.text))) { sys.rrMultiFrames = true; add(notes, 'multiFrames'); }
        // The screen the game's scripts resized to (most Ace games run at 640×480 through one).
        const screen = C.screenSize(active.map(s => s.text), constants) || [544, 416];
        Object.assign(sys.advanced, { screenWidth: screen[0], screenHeight: screen[1], uiAreaWidth: screen[0], uiAreaHeight: screen[1] });
        if (fontSettings.outline === false) sys.advanced.textOutlineWidth = 0;
        // Shadowed text without an outline (Font.default_shadow): the runtime's 1 px drop shadow stands in for the outline.
        if (fontSettings.shadow === true && fontSettings.outline === false) Object.assign(sys.advanced, { textOutlineWidth: 1, rrTextShadow: true });
        // A "Skip Title" script: the game boots into a new game and has no title screen.
        if (C.skipsTitle(active.map(s => s.text))) { sys.rrSkipTitle = true; add(notes, 'skipTitle'); }
        sys.rrCharacterShiftY = 4;   // VX Ace lifts characters 4 px (shift_y); MZ's is 6
        // Yanfly's System Options names the Options command (on the menu, and on the title with Theo's add-on).
        if (typeof constants['YEA::SYSTEM::COMMAND_NAME'] === 'string') sys.terms.commands[11] = constants['YEA::SYSTEM::COMMAND_NAME'];
        sys.rrChoicesInMessage = true;   // choices are listed inside the message window, after the text
        sys.rrNoItemBackgrounds = true;   // the old engines draw no bar behind each item of a list, only the cursor
        Object.assign(sys, { rrRgssWindows: true, rrMapNameStays: true, rrTouchUiOff: true });   // rows one line tall, the map name through messages, no touch buttons
        sys.rrRgssFades = true;   // Ace's 30-frame fades, and the black held 15 frames on a transfer
        writeJson(path.join(dest, 'data', 'System.json'), sys);

        log(`Writing ${mapIds.length} maps and their events…`, 'stage');
        const mapProgress = span(0.12, 0.4);
        const mapInfos = C.mapInfos(infos);
        // Parallax-mapped ground, sky, light and shadow images (GDS Ultimate Parallax), named as the files are.
        const gds = C.gdsParallaxLayers(custom.map(s => s.text));
        const parallaxFiles = new Map(src.files('Graphics/Parallaxes').map(f => [f.replace(/\.png$/i, '').toLowerCase(), f.replace(/\.png$/i, '')]));
        const imageLayersFor = (id) => {
            if (!gds) return null;
            const out = [];
            for (const g of gds) {
                if (!g.maps.includes(id)) continue;
                const name = parallaxFiles.get(`${id}${g.suffix}`.toLowerCase());
                if (!name) { skipped.push(`Graphics/Parallaxes/${id}${g.suffix}: named by the parallax script but not shipped`); continue; }
                const suffix = name.slice(String(id).length);
                const layer = { name, layer: g.layer };
                if (g.variable) { layer.variable = g.variable; layer.variantName = `${id}-%1${suffix}`; }
                if (g.switch) layer.switch = g.switch;
                out.push(layer);
            }
            if (out.length) add(notes, 'imageLayerMap');
            return out.length ? out : null;
        };
        mapIds.forEach((id, index) => {
            mapProgress(index, mapIds.length, `Map ${index + 1} of ${mapIds.length}: ${(mapInfos[id] && mapInfos[id].name) || ''}`.trim());
            const raw = data(`Map${String(id).padStart(3, '0')}`);
            if (!raw) { skipped.push(`Data/Map${String(id).padStart(3, '0')}${ext}: missing`); return; }
            const json = aliased(C.map(raw, notes));
            const layers = imageLayersFor(id);
            if (layers) json.rrImageLayers = layers;
            writeJson(path.join(dest, 'data', `Map${String(id).padStart(3, '0')}.json`), json);
        });
        writeJson(path.join(dest, 'data', 'MapInfos.json'), mapInfos);

        log('Copying graphics, audio and movies…', 'stage');
        const graphicsFolders = src.folders('Graphics');
        const plan = [];
        for (const folderName of graphicsFolders) {
            const target = GRAPHICS[Object.keys(GRAPHICS).find(k => k.toLowerCase() === folderName.toLowerCase())] || ('img/' + folderName);
            if (!GRAPHICS[folderName]) add(notes, 'scriptGraphicsFolder');
            for (const f of src.files('Graphics/' + folderName)) plan.push(['Graphics/' + folderName + '/' + f, path.join(target, f), folderName]);
        }
        for (const [folderName, target] of Object.entries(AUDIO)) for (const f of src.files('Audio/' + folderName)) plan.push(['Audio/' + folderName + '/' + f, path.join(target, f), folderName]);
        for (const f of src.files('Movies')) plan.push(['Movies/' + f, path.join('movies', f), 'Movies']);
        const assetProgress = span(0.4, 1);
        plan.forEach(([from, to, bucket], index) => {
            if (index % 10 === 0) assetProgress(index, plan.length, `${bucket}: ${path.basename(from)}`);
            if (/\.(txt|rtf|db|ini)$/i.test(from)) return;
            const bytes = src.read(from);
            if (!bytes) return;
            // Zero-byte files are placeholders a script plays something else for (see audioAliases).
            if (!bytes.length) { add(notes, 'emptyPlaceholder'); return; }
            const out = path.join(dest, repairPath(to.replace(/\\/g, '/')));
            mkdir(path.dirname(out));
            if (/^Graphics\/System\/Window\.png$/i.test(from)) {
                try {
                    const skin = PNG.sync.read(bytes), baseFile = path.join(skeleton, 'img', 'system', 'Window.png');
                    const baseImg = fs.existsSync(baseFile) ? PNG.sync.read(fs.readFileSync(baseFile)) : null;
                    const rgba = (png) => ({ width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) });
                    const converted = C.windowSkin(rgba(skin), baseImg ? rgba(baseImg) : null);
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

        copyAliasedAudio(dest, aliases);
        { const n = require('./ProjectFiles.js').copyAcrossAudio(dest); if (n) add(notes, 'audioCopiedAcross', n); }
        { const n = matchFileCase(dest); if (n) add(notes, 'fileNameCase', n); }
        { const n = require('./ProjectFiles.js').raisePictureLimit(dest); if (n) add(notes, 'pictureLimitRaised', n); }
        { const n = require('./ProjectFiles.js').clearMissingSystemFiles(dest); if (n) add(notes, 'systemFileCleared', n); }
        { const n = writeFamilyQuests(dest, families, custom.map(s => s.text), constants); if (n) add(notes, 'questsImported', n); }
        const installed = installPlugins(dest, families, constants, custom.map(s => s.text), skipped, log, (rel) => src.read(rel));

        // The game's own Ruby, kept beside the project for whoever ports it by hand.
        if (custom.length) {
            const dir = path.join(dest, 'legacy', 'Scripts');
            mkdir(dir);
            custom.forEach((s, i) => fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(3, '0')} ${s.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled'}.rb`), s.text));
        }

        // Identity.
        const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
        pkg.name = 'rr-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        pkg.version = editorPackage.version;
        const [sw, sh] = [sys.advanced.screenWidth, sys.advanced.screenHeight];
        const [ww, wh] = [Math.round(sw * 1.5), Math.round(sh * 1.5)];
        pkg.window = Object.assign({}, pkg.window, { title, width: ww, height: wh, min_width: sw, min_height: sh });
        pkg['chromium-args'] = `--force-color-profile=srgb --window-size=${ww},${wh}`;
        writeJson(path.join(dest, 'package.json'), pkg);
        const now = new Date().toISOString();
        writeJson(path.join(dest, 'project.rpgreactor'), { name: title, version: editorPackage.version, engine: 'RPG Reactor', engineVersion: editorPackage.version, imported: true, importedFrom: 'RPG Maker VX Ace', importedAt: now, created: now, modified: now });

        const summary = { source: folder, engine: 'RPG Maker VX Ace', archive: src.archive, title, writtenAt: now, ms: Date.now() - t0, maps: mapIds.length, approximations: notes, files: images, skipped, scripts: inventory().scripts, plugins: installed.map(p => p.name) };
        // Files the game names that are nowhere: listed for the author (MIDI and movies converting later still count as present).
        summary.missingFiles = require('./ProjectFiles.js').missingList(dest);
        if (summary.missingFiles.length) log(`  ${summary.missingFiles.length} files the game names are not in it (listed in the import report).`, 'warn');
        fs.writeFileSync(path.join(dest, 'import-report.json'), JSON.stringify(summary, null, 2));
        summary.destination = dest;
        report(1, 'Done');
        log(`Wrote "${title}" to ${dest} in ${(summary.ms / 1000).toFixed(1)} s: ${mapIds.length} maps.`, 'done');
        log(`  Files: ${Object.entries(images).map(([k, v]) => `${k} ${v}`).join(', ')}`, 'info');
        const ruby = (notes.rubyScript || 0) + (notes.moveRouteScript || 0) + (notes.rubyCondition || 0) + (notes.rubyOperand || 0);
        if (notes.rubyTranslated || ruby) log(`  Ruby in events: ${notes.rubyTranslated || 0} translated to JavaScript, ${ruby} kept as comments (they call the game's own scripts).`, ruby ? 'warn' : 'info');
        if (custom.length) log(`  ${custom.length} script sections of the game's own (${summary.scripts.customLines} lines of Ruby) are in legacy/Scripts; their behaviour needs a plugin or a hand port.`, 'warn');
        if (notes.scriptGraphicsFolder) log(`  ${notes.scriptGraphicsFolder} graphics folders only the game's scripts used were copied under img/.`, 'info');
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

module.exports = { open, report, importProject, source, installPlugins, writeFamilyQuests, copyAliasedAudio, matchFileCase, repairName, repairPath, STOCK_SCRIPTS, GRAPHICS, AUDIO };
