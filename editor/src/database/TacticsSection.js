/**
 * TacticsSection - a record's combat settings, grouped by where they apply:
 * Shared Combat Settings (targeting, AI behavior and enemy appearance),
 * Tactical Battles (turn-based movement and climbing), and Action and
 * First Person Battles (weapon behavior and hotbar cooldowns).
 *
 * Everything is stored in the record itself, as `rrBattle`, each key
 * there only while the record sets it:
 *
 *   range: { min, max }               tiles, counted in steps (|dx| + |dy|)
 *   area: { shape, size }             self | single | circle | square | line | cone | cross | all
 *   los: false                        needs no line of sight
 *   move: N, jump: N                  a unit's own; added (may be negative) on equipment and states
 *   ai: "aggressive" | "ranged" | "support"
 *   fireRate, magazine, reload, spread, combo                on weapons
 *   projectile: "bullet" | "arrow" | "bolt" | "rocket" | "none"
 *   cooldown                                                 on skills and items
 *   character: { name, index }        an enemy's picture on the map
 *
 * The game reads a setting there first (runtime/reactor_fight_tactical.js,
 * reactor_fight_action.js, reactor_fight_look.js) and, for whatever the
 * record does not set, the tag of the same name in its Note: `<range: 2-5>`,
 * `<area: cone 3>`, `<los: no>`, `<move: 5>`, `<jump: 2>`, `<ai: ranged>`,
 * `<fire rate: 4>`, `<magazine: 8>`, `<reload: 1.5>`, `<spread: 3>`,
 * `<combo: 4>`, `<projectile: bolt>`, `<cooldown: 6>`, `<unit character:
 * Name, index>`. A PSYCHRONIC_PTBS block (`<PTBS> scope: circle(3,0) aoe:
 * circle(2,0) move_points: 4 </PTBS>`) is read as the same things, after
 * both. The cards show what the game will do, wherever it is written.
 *
 * Looking at a record writes nothing. A change gives the record a new
 * `rrBattle` object (the game compares the object), without the keys that
 * are back at Automatic, or none when nothing is left. The tag of the
 * setting changed leaves the Note in the same step, and with it the card's
 * other tags of that record move into `rrBattle`, so the Note cannot
 * contradict the card. A PTBS block is never rewritten, and every other
 * line of the Note is kept as it is.
 *
 * The pure half (reading, change, reset, convert, defaults, the cell
 * shapes, which card a record gets and what each says and clears) has no
 * DOM and is what the tests drive; createSection builds the cards and their
 * pictures.
 */
(function(root) {
    'use strict';

    const SHAPES = ['self', 'single', 'circle', 'square', 'line', 'cone', 'cross', 'all'];
    const SIZED = ['circle', 'square', 'line', 'cone', 'cross'];
    const AI = ['aggressive', 'ranged', 'support'];
    const DEFAULT_MOVE = 4, DEFAULT_JUMP = 1;

    // The tags, by the patterns the game reads them with.
    const RANGE = /<range\s*:\s*(\d+)\s*(?:-\s*(\d+)\s*)?>/i;
    const AREA = /<area\s*:\s*(self|single|circle|square|line|cone|cross|all)(?:\s+(\d+))?\s*>/i;
    const LOS = /<los\s*:\s*(\w+)\s*>/i;
    const MOVE = /<move\s*:\s*([+-]?\d+)\s*>/i;
    const JUMP = /<jump\s*:\s*([+-]?\d+)\s*>/i;
    const AI_TAG = /<ai\s*:\s*(\w+)\s*>/i;
    const CHARACTER = /<unit\s*character\s*:\s*([^,>]+?)\s*(?:,\s*(\d+)\s*)?>/i;
    // Action and First Person battles.
    const COMBAT_TAGS = {
        fireRate: /<fire\s*rate\s*:\s*([\d.]+)\s*>/i, magazine: /<magazine\s*:\s*(\d+)\s*>/i, reload: /<reload\s*:\s*([\d.]+)\s*>/i,
        spread: /<spread\s*:\s*([\d.]+)\s*>/i, combo: /<combo\s*:\s*(\d+)\s*>/i, cooldown: /<cooldown\s*:\s*([\d.]+)\s*>/i,
        projectile: /<projectile\s*:\s*(\w+)\s*>/i
    };
    const PROJECTILES = ['bullet', 'arrow', 'bolt', 'rocket', 'none'];
    const TAGS = Object.assign({ range: RANGE, area: AREA, los: LOS, move: MOVE, jump: JUMP, ai: AI_TAG, character: CHARACTER }, COMBAT_TAGS);
    const TACTICAL_KEYS = ['range', 'area', 'los', 'move', 'jump', 'ai'];
    const COMBAT_NUMBERS = ['fireRate', 'magazine', 'reload', 'spread', 'combo', 'cooldown'];
    const COMBAT_KEYS = COMBAT_NUMBERS.concat(['projectile']);
    const PTBS = /<PTBS>([\s\S]*?)<\/PTBS>/i;

    const whole = value => Math.max(0, Math.floor(Number(value) || 0));
    /** A number as it is shown in a field: no trailing zeros, at most two decimals. */
    const tidy = value => String(Math.round(Math.max(0, Number(value) || 0) * 100) / 100);
    const text = value => (value === null || value === undefined ? '' : String(value));

    /** The rule a unit's look follows, the game's own (src/utils/FightLook.js). */
    const Look = () => root.ReactorFightLook || (typeof module !== 'undefined' && module.exports ? require('../utils/FightLook.js') : null);

    //-------------------------------------------------------------------------
    // Reading: a record's own settings, the tags of its Note, and the two as the game reads them.

    /** A PTBS block as the same things; null without one. */
    function parsePtbs(note) {
        const block = PTBS.exec(text(note));
        if (!block) return null;
        const out = {};
        const scope = /scope\s*:\s*(circle|line)\s*\(\s*(\d+)\s*(?:,\s*(\d+))?/i.exec(block[1]);
        if (scope) {
            const max = Number(scope[2]), min = Math.min(max, Number(scope[3]) || 0);
            out.range = { min, max };
            if (scope[1].toLowerCase() === 'line') out.area = { shape: 'line', size: max };
        }
        const aoe = /aoe\s*:\s*(circle|square|line|cross)\s*\(\s*(\d+)/i.exec(block[1]);
        if (aoe) {
            const size = Number(aoe[2]);
            out.area = size > 0 ? { shape: aoe[1].toLowerCase(), size } : { shape: 'single', size: 0 };
        }
        const move = /move_points\s*:\s*(\d+)/i.exec(block[1]);
        if (move) out.move = Number(move[1]);
        return out;
    }

    /** The plain tags of one note, without the PTBS block. */
    function parseTags(note) {
        const source = text(note), out = {};
        const range = RANGE.exec(source);
        if (range) {
            const a = Number(range[1]);
            if (range[2] === undefined) out.range = { min: Math.min(1, a), max: a };
            else out.range = { min: Math.min(a, Number(range[2])), max: Math.max(a, Number(range[2])) };
        }
        const area = AREA.exec(source);
        if (area) {
            const shape = area[1].toLowerCase();
            out.area = { shape, size: SIZED.includes(shape) ? Math.max(1, Number(area[2]) || 1) : 0 };
        }
        const los = LOS.exec(source);
        if (los) out.los = !/^(no|none|false|off|0)$/i.test(los[1]);
        const move = MOVE.exec(source);
        if (move) out.move = Number(move[1]);
        const jump = JUMP.exec(source);
        if (jump) out.jump = Number(jump[1]);
        const ai = AI_TAG.exec(source);
        if (ai && AI.includes(ai[1].toLowerCase())) out.ai = ai[1].toLowerCase();
        return out;
    }

    /** What one note says: the plain tags over the PTBS block. Null when it says nothing. */
    function parse(note) {
        const tags = parseTags(note), ptbs = parsePtbs(note);
        const out = Object.assign({}, ptbs || {}, tags);
        return Object.keys(out).length ? out : null;
    }

    /** The action tags of one note (`fireRate`, `magazine`, `reload`, `spread`, `combo`, `cooldown`, `projectile`), or null. */
    function parseCombat(note) {
        const source = text(note), tags = {};
        for (const key of COMBAT_NUMBERS) {
            const match = COMBAT_TAGS[key].exec(source);
            if (match) tags[key] = Number(match[1]);
        }
        const projectile = COMBAT_TAGS.projectile.exec(source);
        if (projectile && PROJECTILES.includes(projectile[1].toLowerCase())) tags.projectile = projectile[1].toLowerCase();
        return Object.keys(tags).length ? tags : null;
    }

    /** A value the game takes for a whole number (a reach, a size, a Move), or null. */
    const counted = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Math.trunc(Number(value)) || 0);

    /**
     * The record's own settings: what its `rrBattle` holds, each read as the
     * game reads it (a value the game would not take is not there). Null
     * when it sets nothing. The tags of the Note are not read here.
     */
    function own(record) {
        const held = record && record.rrBattle;
        if (!held || typeof held !== 'object') return null;
        const out = {};
        if (held.range && typeof held.range === 'object') {
            const max = counted(held.range.max);
            if (max !== null && max >= 0) {
                const min = counted(held.range.min);
                out.range = { min: Math.max(0, Math.min(max, min === null ? Math.min(1, max) : min)), max };
            }
        }
        if (held.area && typeof held.area === 'object') {
            const shape = String(held.area.shape || '').toLowerCase();
            if (SHAPES.includes(shape)) out.area = { shape, size: SIZED.includes(shape) ? Math.max(1, counted(held.area.size) || 1) : 0 };
        }
        if (typeof held.los === 'boolean') out.los = held.los;
        const move = counted(held.move), jump = counted(held.jump);
        if (move !== null) out.move = move;
        if (jump !== null) out.jump = jump;
        const ai = typeof held.ai === 'string' ? held.ai.toLowerCase() : '';
        if (ai && AI.includes(ai)) out.ai = ai;
        for (const key of COMBAT_NUMBERS) {
            const value = held[key];
            if (value === null || value === undefined || value === '' || !(Number(value) >= 0)) continue;
            out[key] = key === 'magazine' || key === 'combo' ? Math.floor(Number(value)) : Number(value);
        }
        const projectile = typeof held.projectile === 'string' ? held.projectile.toLowerCase() : '';
        if (projectile && PROJECTILES.includes(projectile)) out.projectile = projectile;
        const rule = Look(), sheet = rule ? rule.ownCharacter(record) : null;
        if (sheet) out.character = { name: sheet.characterName, index: sheet.characterIndex };
        return Object.keys(out).length ? out : null;
    }

    const picked = (from, keys) => { const out = {}; if (from) for (const key of keys) if (from[key] !== undefined) out[key] = from[key]; return out; };
    const orNull = out => (Object.keys(out).length ? out : null);

    /**
     * A record's reach, area, sight, Move, Climb and AI preset as a Tactical
     * battle reads them: its own setting, else its tag, else its PTBS block.
     * Only what is set; null when nothing is.
     */
    function recordTactics(record) {
        const entry = record || {};
        return orNull(Object.assign({}, parse(entry.note) || {}, picked(own(entry), TACTICAL_KEYS)));
    }

    /** How a weapon fires or swings and a skill's or an item's cooldown as an Action battle reads them: the record's own setting, else its tag. */
    function recordCombat(record) {
        const entry = record || {};
        return orNull(Object.assign({}, parseCombat(entry.note) || {}, picked(own(entry), COMBAT_KEYS)));
    }

    /** An enemy's picture on the map, `{ characterName, characterIndex }`: its own setting, else its `<unit character:>` tag. Null without one. */
    function recordCharacter(record) {
        const rule = Look();
        return rule && record ? rule.ownCharacter(record) || rule.unitCharacter(record.note) : null;
    }

    /** Where the setting the game uses comes from: 'field' (the record's own), 'tag', 'ptbs', or '' when nothing sets it. */
    function sourceOf(record, key) {
        const entry = record || {}, held = own(entry);
        if (held && held[key] !== undefined) return 'field';
        if (key === 'character') return Look() && Look().unitCharacter(entry.note) ? 'tag' : '';
        const tags = COMBAT_KEYS.includes(key) ? parseCombat(entry.note) : parseTags(entry.note);
        if (tags && tags[key] !== undefined) return 'tag';
        const ptbs = COMBAT_KEYS.includes(key) ? null : parsePtbs(entry.note);
        return ptbs && ptbs[key] !== undefined ? 'ptbs' : '';
    }

    /** Whether the record names a reach, an area or a line-of-sight rule. */
    function hasAction(record) {
        const found = recordTactics(typeof record === 'string' ? { note: record } : record);
        return !!(found && (found.range || found.area || found.los !== undefined));
    }

    /**
     * The note without the tags of `patterns`. A tag goes wherever the game
     * reads it, over two lines too. A line that held nothing else goes with
     * its own line end, so a note that uses CRLF keeps CRLF on every line
     * it keeps. Blank lines that stood round such a line do not pile up:
     * between kept lines the wider of the two gaps stays, at the start or
     * the end of the note they go with it, and a note left with nothing but
     * blank lines is empty. The words and the spacing of every other line
     * are not touched. A PTBS block is never rewritten: what stands inside
     * one stays.
     */
    function without(note, patterns) {
        const source = text(note);
        if (!patterns || !patterns.length) return source;
        const unused = seed => { let mark = seed; while (source.includes(mark)) mark += '\u0001'; return mark; };
        const hold = unused('\u0000'), gone = unused('\u0002'), blocks = [];
        let open = source.replace(new RegExp(PTBS.source, 'gi'), block => { blocks.push(block); return hold + (blocks.length - 1) + hold; });
        let found = false;
        for (const pattern of patterns) open = open.replace(new RegExp(pattern.source, 'gi'), () => { found = true; return gone; });
        if (!found) return source;
        // The note as lines, each with the line end it has.
        const lines = [], ends = /\r\n|\n|\r/g;
        let at = 0;
        for (let end = ends.exec(open); end; end = ends.exec(open)) { lines.push({ words: open.slice(at, end.index), end: end[0] }); at = ends.lastIndex; }
        if (at < open.length) lines.push({ words: open.slice(at), end: '' });
        const isBlank = part => !part.cut && part.words.trim() === '';
        // What is kept, with a cut where tags' lines stood (tags' lines with only blank lines between them: one cut).
        const parts = [];
        for (const line of lines) {
            if (!line.words.includes(gone)) { parts.push(line); continue; }
            const rest = line.words.split(gone).join('');
            if (rest.trim() !== '') { parts.push({ words: rest, end: line.end }); continue; }
            let back = parts.length;
            while (back > 0 && isBlank(parts[back - 1])) back--;
            if (back > 0 && parts[back - 1].cut) parts.length = back; else parts.push({ cut: true });
        }
        for (let index = parts.length - 1; index >= 0; index--) {
            if (!parts[index].cut) continue;
            let before = 0, after = 0;
            while (index - 1 - before >= 0 && isBlank(parts[index - 1 - before])) before++;
            while (index + 1 + after < parts.length && isBlank(parts[index + 1 + after])) after++;
            const first = index === 0, last = index === parts.length - 1;
            const dropAfter = first ? after : last ? 0 : Math.min(before, after), dropBefore = last && !first ? before : 0;
            parts.splice(index + 1, dropAfter);
            parts.splice(index - dropBefore, dropBefore + 1);
            index -= dropBefore;
        }
        if (parts.every(isBlank)) return '';
        // A note that did not end with a line end does not end with one now.
        const tail = parts[parts.length - 1], final = lines[lines.length - 1];
        const out = parts.map((part, index) => part.words + (part === tail && final.end === '' ? '' : part.end)).join('');
        return blocks.length ? out.split(hold).map((piece, index) => (index % 2 ? blocks[Number(piece)] : piece)).join('') : out;
    }

    /** The note without one tag (`without`). */
    const strip = (note, pattern) => without(note, [pattern]);

    //-------------------------------------------------------------------------
    // Plugins that read the same tags.
    //
    // An imported game's own plugin may read a tag of the same name from the
    // Note (`<cooldown: 5>` is Yanfly's Skill Cooldowns' too). Such a tag
    // stays in the Note: a card writes the record's own setting, which the
    // game reads first, and leaves the tag for the plugin. A plugin reads a
    // tag when its source holds a note-tag pattern for that tag's name, in
    // its code or its help text, or takes it from a record's `meta`. A
    // longer tag that only has the word in it (`<aoe range: 3>`, `<cooldown
    // rate: 50%>`) is another tag.

    // Each tag's name as it is spelled; the words of a name may be joined by anything short.
    const TAG_WORDS = { range: 'range', area: 'area', los: 'los', move: 'move', jump: 'jump', ai: 'ai', character: 'unit character',
        fireRate: 'fire rate', magazine: 'magazine', reload: 'reload', spread: 'spread', combo: 'combo', cooldown: 'cooldown', projectile: 'projectile' };
    const TAG_KEY = {};
    for (const key of Object.keys(TAG_WORDS)) TAG_KEY[TAG_WORDS[key].replace(/ /g, '')] = key;
    const TAG_NAMES = Object.values(TAG_WORDS).map(words => words.replace(/ /g, '[^a-z0-9<>\\r\\n]{0,12}')).join('|');
    // What stands between a note tag's brackets, in a pattern (`/<(?:COOLDOWN):[ ](\d+)>/i`) or in a help text
    // (`<Cooldown: x>`). A comparison in code is none: it has a name or a bracket before its `<`, or a space after it.
    const TAG_BODY = /(?<![\w$)\]])<(?!\s)([^<>\r\n]{1,200})>/g;
    const TAG_NAME = new RegExp('(?<![a-z0-9_.$])(?:' + TAG_NAMES + ')(?![a-z0-9_$(])', 'gi');
    // The name is the whole name the pattern reads: before it only what opens a group, other names it reads as
    // well (`COOL_DOWN|`) and room for spaces; after it, to the colon, only more such names, the group's end and
    // room for spaces.
    const TAG_LEAD = /^(?:\(\?:|\(|[\w ]*\w\||\\s[*+?]?|\[ \][*+?]?|[ \t])*$/;
    const TAG_REST = /^(?:\|[\w ]*\w)*\)?(?:\\s[*+?]?|\[ \][*+?]?|[ \t])*$/;
    // A tag taken from what the engine keeps of a Note: `item.meta.cooldown`, `meta['fire rate']`.
    const TAG_META = new RegExp('(?<![a-z0-9_$])meta\\s*(?:\\.\\s*|\\[\\s*[\'"`])(' + TAG_NAMES + ')(?![a-z0-9_$])', 'gi');

    /** The tags (by their key) a plugin's source reads from a Note. */
    function tagsRead(source) {
        const found = [], code = text(source), all = Object.keys(TAG_WORDS).length;
        const keyOf = name => TAG_KEY[name.toLowerCase().replace(/[^a-z]/g, '')];
        TAG_BODY.lastIndex = 0;
        for (let body = TAG_BODY.exec(code); body && found.length < all; body = TAG_BODY.exec(code)) {
            const words = body[1];
            if (words.indexOf(':') < 0) continue;
            TAG_NAME.lastIndex = 0;
            for (let name = TAG_NAME.exec(words); name; name = TAG_NAME.exec(words)) {
                const key = keyOf(name[0]);
                if (!key || found.includes(key)) continue;
                const after = words.slice(name.index + name[0].length), colon = after.indexOf(':');
                if (colon >= 0 && TAG_REST.test(after.slice(0, colon)) && TAG_LEAD.test(words.slice(0, name.index))) found.push(key);
            }
        }
        TAG_META.lastIndex = 0;
        for (let taken = TAG_META.exec(code); taken && found.length < all; taken = TAG_META.exec(code)) {
            const key = keyOf(taken[1]);
            if (key && !found.includes(key)) found.push(key);
        }
        return found;
    }

    /** The names of the plugins a plugin list has switched on (the text of `js/reactor_plugins.js` or `js/plugins.js`), in its order. */
    function enabledPlugins(manifest) {
        const list = /(?:var|let|const)\s+\$plugins\s*=\s*(\[[\s\S]*\]);/.exec(text(manifest));
        let plugins = [];
        try { plugins = list ? JSON.parse(list[1]) : []; } catch (error) { plugins = []; }
        return (Array.isArray(plugins) ? plugins : []).filter(plugin => plugin && plugin.status === true && typeof plugin.name === 'string' && plugin.name).map(plugin => plugin.name);
    }

    const nodeFiles = () => { try { return typeof require === 'function' ? { fs: require('fs'), path: require('path') } : null; } catch (error) { return null; } };
    // The plugin list the game runs, as the editor finds it.
    const MANIFESTS = ['reactor_plugins.js', 'plugins.js'];

    /** A project's plugin list: `{ file, stamp }`, `file` '' when it has none. `stamp` changes when the list is saved again. */
    function manifestOf(folder, files) {
        for (const name of MANIFESTS) {
            const file = files.path.join(folder, 'js', name);
            try { const stat = files.fs.statSync(file); return { file, stamp: `${file}:${stat.mtimeMs}:${stat.size}` }; } catch (error) { /* the next one */ }
        }
        return { file: '', stamp: '' };
    }

    /**
     * The tags a project's own enabled plugins read: `{ cooldown:
     * 'YEP_X_SkillCooldowns', ... }`, each with the first plugin of the list
     * that reads it. An enabled plugin is an entry of the project's plugin
     * list that is switched on and has its file in `js/plugins`. Read at
     * once (the script's way); `files` is `{ fs, path }`.
     */
    function scanPluginTags(folder, files = nodeFiles()) {
        const tags = {};
        if (!folder || !files) return tags;
        const manifest = manifestOf(folder, files);
        if (!manifest.file) return tags;
        let names = [];
        try { names = enabledPlugins(files.fs.readFileSync(manifest.file, 'utf8')); } catch (error) { return tags; }
        for (const name of names) {
            let source = '';
            try { source = files.fs.readFileSync(files.path.join(folder, 'js', 'plugins', name + '.js'), 'utf8'); } catch (error) { continue; }
            for (const key of tagsRead(source)) if (!tags[key]) tags[key] = name;
        }
        return tags;
    }

    // What was found for each project folder: { stamp, tags (null while its plugins are being read), ready }.
    const pluginScans = new Map();

    /**
     * The same answer for the cards, read once for a project and kept until
     * its plugin list is saved again: `{ tags, ready }`. The plugins are
     * read one file at a time with the page free to draw between them;
     * `tags` is null until that is done and `ready` resolves with it. A
     * project with no plugin list has no such tags, at once.
     */
    function pluginTags(folder, files = nodeFiles()) {
        if (!folder || !files) return { stamp: '', tags: {}, ready: Promise.resolve({}) };
        const manifest = manifestOf(folder, files), known = pluginScans.get(folder);
        if (known && known.stamp === manifest.stamp) return known;
        const scan = { stamp: manifest.stamp, tags: manifest.file ? null : {}, ready: null };
        const read = async () => {
            const tags = {}, all = Object.keys(TAG_WORDS).length;
            const names = enabledPlugins(await files.fs.promises.readFile(manifest.file, 'utf8'));
            for (const name of names) {
                let source = '';
                try { source = await files.fs.promises.readFile(files.path.join(folder, 'js', 'plugins', name + '.js'), 'utf8'); } catch (error) { continue; }
                for (const key of tagsRead(source)) if (!tags[key]) tags[key] = name;
                if (Object.keys(tags).length >= all) break;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            return tags;
        };
        scan.ready = (manifest.file ? read().catch(() => ({})) : Promise.resolve({})).then(tags => { scan.tags = tags; return tags; });
        pluginScans.set(folder, scan);
        return scan;
    }

    //-------------------------------------------------------------------------
    // What a record gets when left alone.

    /** An untagged weapon's reach, by the name of its type. */
    function weaponTypeReach(name) {
        const type = text(name).toLowerCase();
        if (/rifle|cannon/.test(type)) return { min: 2, max: 7 };
        if (/pistol/.test(type)) return { min: 1, max: 4 };
        if (/bow|gun|crossbow|launcher/.test(type)) return { min: 2, max: 5 };
        return { min: 1, max: 1 };
    }

    /** A skill's or item's reach and area by its Scope. */
    function scopeDefaults(scope) {
        const value = Math.floor(Number(scope) || 0);
        if (value === 1) return { range: { min: 1, max: 4 }, area: { shape: 'single', size: 0 } };
        if (value >= 2 && value <= 6) return { range: { min: 1, max: 4 }, area: { shape: 'circle', size: 2 } };
        if (value === 7 || value === 9 || value === 12) return { range: { min: 0, max: 3 }, area: { shape: 'single', size: 0 } };
        if (value === 8 || value === 10 || value === 13 || value === 14) return { range: { min: 0, max: 0 }, area: { shape: 'circle', size: 3 } };
        return { range: { min: 0, max: 0 }, area: { shape: 'self', size: 0 } };
    }

    const UNARMED = { min: 1, max: 1 }, SINGLE = { shape: 'single', size: 0 };

    /**
     * Attack, or a physical skill, aimed at enemies: what it does not say
     * itself, the equipped weapon says (each of reach, area and sight on its own).
     */
    function weaponSkill(kind, record) {
        if (kind !== 'skill' || !record) return false;
        const scope = Math.floor(Number(record.scope) || 0);
        return (Number(record.id) === 1 || Number(record.hitType) === 1) && scope >= 1 && scope <= 6;
    }

    /**
     * The record's reach, area and line of sight as the battle reads them:
     * its own setting, else its tag, else what it gets left alone.
     * `kind` is 'skill', 'item' or 'weapon'; `context` gives `weaponTypes`
     * (System's names). `auto.range` / `auto.area` say the value is the one an
     * untouched record gets; `weapon.range` / `weapon.area` that the equipped
     * weapon may decide it in play (the value given is the one without a
     * weapon, or with one that says nothing).
     */
    function effective(kind, record, context) {
        const entry = record || {}, found = recordTactics(entry) || {};
        const byWeapon = weaponSkill(kind, entry), names = (context && context.weaponTypes) || [];
        const scoped = scopeDefaults(entry.scope);
        const base = kind === 'weapon'
            ? { range: weaponTypeReach(names[entry.wtypeId] || ''), area: SINGLE }
            : { range: byWeapon ? UNARMED : scoped.range, area: scoped.area };
        const area = found.area || base.area;
        const range = area.shape === 'self' ? { min: 0, max: 0 } : found.range || base.range;
        return {
            range, area,
            los: found.los !== false,
            auto: { range: !found.range, area: !found.area },
            weapon: { range: byWeapon && !found.range, area: byWeapon && !found.area }
        };
    }

    /** Whether the reach is one a line of sight applies to. */
    const sighted = value => value.area.shape !== 'self' && value.area.shape !== 'all' && value.range.max > 1;

    /**
     * How far a unit moves and climbs as the battle reads it, before what
     * its equipment and states add: its own setting or tag, else (an actor)
     * its class's, else 4 tiles and 1 level. `context.classOf(id)` gives a
     * class record. `base` is what the record gets with nothing of its own;
     * `own.move` / `own.jump` say the number is the record's own.
     */
    function unitStats(kind, record, context) {
        const entry = record || {}, found = recordTactics(entry) || {};
        const cls = kind === 'actor' && context && typeof context.classOf === 'function' ? context.classOf(entry.classId) : null;
        const inherited = (cls && recordTactics(cls)) || {};
        const held = value => Math.max(0, Math.min(30, value));
        const base = { move: held(inherited.move !== undefined ? inherited.move : DEFAULT_MOVE), jump: held(inherited.jump !== undefined ? inherited.jump : DEFAULT_JUMP) };
        const own = { move: found.move !== undefined, jump: found.jump !== undefined };
        return { move: own.move ? held(found.move) : base.move, jump: own.jump ? held(found.jump) : base.jump, base, own };
    }

    const sameRange = (a, b) => a.min === b.min && a.max === b.max;
    const sameArea = (a, b) => a.shape === b.shape && (!SIZED.includes(a.shape) || whole(a.size) === whole(b.size));

    //-------------------------------------------------------------------------
    // Action and First Person battles: what a weapon is and how fast it works.

    // What a weapon is when its note says nothing, by its type's name; the first that matches.
    const COMBAT_TYPES = [
        [/shotgun/, { ranged: true, fireRate: 1.2, magazine: 6, reload: 2.2, spread: 9, projectile: 'bullet', pellets: 6 }],
        [/pistol/, { ranged: true, fireRate: 3, magazine: 12, reload: 1.2, spread: 3, projectile: 'bullet' }],
        [/rifle/, { ranged: true, fireRate: 2.5, magazine: 10, reload: 1.6, spread: 1.5, projectile: 'bullet' }],
        [/cannon|launcher/, { ranged: true, fireRate: 0.7, magazine: 1, reload: 2.2, spread: 1, projectile: 'rocket' }],
        [/crossbow|bow/, { ranged: true, fireRate: 1.2, magazine: 0, reload: 0, spread: 2, projectile: 'arrow' }],
        [/gun/, { ranged: true, fireRate: 6, magazine: 30, reload: 2, spread: 3.5, projectile: 'bullet' }],
        [/dagger|knife|claw/, { ranged: false, fireRate: 3.5, combo: 4, reach: 1.2 }]
    ];
    const COMBAT_MELEE = { ranged: false, fireRate: 2.6, combo: 3, reach: 1.6 };
    const COOLDOWN = { skill: 2, item: 1 };

    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    /**
     * A weapon in an Action battle, its own settings and tags over its type's defaults:
     * `{ ranged, projectile, fireRate, magazine, reload, spread, combo,
     * pellets, reach }`, with `auto.<field>` true where the value is the one
     * an untouched weapon gets.
     */
    function combatProfile(weapon, context) {
        const entry = weapon || {}, tags = recordCombat(entry) || {};
        const names = (context && context.weaponTypes) || [], type = text(names[entry.wtypeId]).toLowerCase();
        const found = COMBAT_TYPES.find(([pattern]) => pattern.test(type)), base = found ? found[1] : COMBAT_MELEE;
        const projectile = tags.projectile !== undefined ? tags.projectile : base.ranged ? base.projectile : 'none';
        const ranged = projectile !== 'none' && (base.ranged || tags.projectile !== undefined);
        const spread = tags.spread !== undefined ? tags.spread : base.spread || 2;
        return {
            ranged, projectile: ranged ? projectile : 'none',
            fireRate: clamp(Number(tags.fireRate) || base.fireRate || 2.5, 0.2, 20),
            magazine: ranged ? Math.max(0, Math.round(tags.magazine !== undefined ? tags.magazine : base.magazine || 0)) : 0,
            reload: tags.reload !== undefined ? tags.reload : base.reload || 0,
            spread, aimSpread: spread / 4,
            combo: clamp(Math.round(tags.combo || base.combo || 3), 1, 5),
            pellets: ranged ? Math.max(1, base.pellets || 1) : 1,
            reach: ranged ? 0 : base.reach || 1.6,
            auto: { fireRate: tags.fireRate === undefined, magazine: tags.magazine === undefined, reload: tags.reload === undefined,
                spread: tags.spread === undefined, combo: tags.combo === undefined, projectile: tags.projectile === undefined }
        };
    }

    /** A skill's or an item's seconds on the hotbar before it can be used again: `{ cooldown, auto }`. */
    function cooldownOf(kind, record) {
        const tags = recordCombat(record) || {};
        return { cooldown: tags.cooldown !== undefined ? tags.cooldown : COOLDOWN[kind] || 2, auto: tags.cooldown === undefined };
    }

    /** What a combo's steps deal, as shares of one attack: the last a whole one. */
    function comboShares(steps) {
        const count = clamp(Math.round(steps) || 1, 1, 5), shares = [];
        for (let step = 1; step <= count; step++) shares.push(step >= count ? 1 : Math.min(1, 0.4 + 0.1 * step));
        return shares;
    }

    /** `Rifle-like: 2.5 shots a second, 10 in the magazine` in plain words, through `tt`. */
    function describeCombat(profile, tt) {
        const t = tt || (x => x);
        if (!profile.ranged) return `${t('Melee')}, ${t('Combo')} ${profile.combo}`;
        return `${t(PROJECTILE_LABELS[profile.projectile])}, ${tidy(profile.fireRate)}/${t('s')}` + (profile.magazine > 0 ? `, ${t('Magazine')} ${profile.magazine}` : '');
    }

    const PROJECTILE_LABELS = { bullet: 'Bullet', arrow: 'Arrow', bolt: 'Bolt', rocket: 'Rocket', none: 'Melee' };

    //-------------------------------------------------------------------------
    // Cells, for the picture. Distance is |dx| + |dy|.

    /** The cells a reach of min..max covers round (0, 0). */
    function reachCells(min, max) {
        const cells = [];
        for (let y = -max; y <= max; y++) for (let x = -max; x <= max; x++) {
            const d = Math.abs(x) + Math.abs(y);
            if (d >= min && d <= max) cells.push({ x, y });
        }
        return cells;
    }

    /** One of four directions from the user toward a cell: the longer way, the vertical one on a tie. */
    function directionTo(user, target) {
        const dx = target.x - user.x, dy = target.y - user.y;
        if (!dx && !dy) return { x: 0, y: 1 };
        return Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    }

    /**
     * The cells an area lands on, with the user at `user` and the cursor on
     * `target`. `all` returns null: it is every unit of a side, not cells.
     */
    function areaCells(area, user, target) {
        const shape = area && area.shape || 'single', n = Math.max(1, whole(area && area.size));
        const cells = [];
        if (shape === 'all') return null;
        if (shape === 'self') return [{ x: user.x, y: user.y }];
        if (shape === 'single') return [{ x: target.x, y: target.y }];
        if (shape === 'circle' || shape === 'square') {
            for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) {
                if (shape === 'circle' && Math.abs(x) + Math.abs(y) > n) continue;
                cells.push({ x: target.x + x, y: target.y + y });
            }
            return cells;
        }
        if (shape === 'cross') {
            cells.push({ x: target.x, y: target.y });
            for (let i = 1; i <= n; i++) cells.push({ x: target.x + i, y: target.y }, { x: target.x - i, y: target.y }, { x: target.x, y: target.y + i }, { x: target.x, y: target.y - i });
            return cells;
        }
        const d = directionTo(user, target);
        for (let i = 1; i <= n; i++) {
            if (shape === 'line') { cells.push({ x: user.x + d.x * i, y: user.y + d.y * i }); continue; }
            // A cone: one cell wide next to the user, two wider with every step.
            for (let side = -(i - 1); side <= i - 1; side++) cells.push({ x: user.x + d.x * i + d.y * side, y: user.y + d.y * i + d.x * side });
        }
        return cells;
    }

    //-------------------------------------------------------------------------
    // Words.

    const SHAPE_LABELS = { self: 'The user', single: 'One target', circle: 'Circle', square: 'Square', line: 'Line', cone: 'Cone', cross: 'Cross', all: 'Everyone on a side' };

    function describeRange(range, t) {
        const distance = range.max === 0 ? t('own tile') : range.min === range.max ? String(range.max) : `${range.min}-${range.max}`;
        return `${t('Target range')} ${distance}`;
    }

    /** A reach and an area as short plain text, through `tt`; `areaOnly` leaves the reach out. */
    function describe(value, tt, areaOnly) {
        const t = tt || (x => x), range = value.range, area = value.area;
        const label = t(SHAPE_LABELS[area.shape] || 'One target') + (SIZED.includes(area.shape) ? ' ' + Math.max(1, whole(area.size)) : '');
        if (areaOnly || area.shape === 'self' || area.shape === 'all') return label;
        return `${describeRange(range, t)}, ${label}`;
    }

    //-------------------------------------------------------------------------
    // The cards: which a record gets, what each says of it and what each clears.

    const esc = value => (typeof root.rrEscapeHtml === 'function' ? root.rrEscapeHtml(value) : text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    const ACTION_KINDS = ['skill', 'item', 'weapon'];
    const UNIT_KINDS = ['actor', 'class', 'enemy'];
    const BONUS_KINDS = ['weapon', 'armor', 'state'];
    const KINDS = ['skill', 'item', 'weapon', 'armor', 'state', 'actor', 'class', 'enemy'];

    // Where each kind of record is kept: its key in the Database's data, and its file.
    const DATA_KEYS = { actor: 'actors', class: 'classes', skill: 'skills', item: 'items', weapon: 'weapons', armor: 'armors', enemy: 'enemies', state: 'states' };
    const FILES = { 'Actors.json': 'actor', 'Classes.json': 'class', 'Skills.json': 'skill', 'Items.json': 'item', 'Weapons.json': 'weapon', 'Armors.json': 'armor', 'Enemies.json': 'enemy', 'States.json': 'state' };

    /**
     * The combat cards. `key` is the name a card's fold is remembered by, the
     * same in every language; `fights` is the way of fighting it is for
     * (the Database folds a card nobody touched while the project never
     * fights that way); `kinds` are the records that get it.
     */
    const CARDS = {
        shared: { key: 'sharedCombat', title: 'Shared Combat Settings', fights: 'map-battles', kinds: ['actor', 'enemy', ...ACTION_KINDS] },
        tactical: { key: 'tactics', title: 'Tactical Battles', fights: 'tactical-battles', kinds: [...UNIT_KINDS, ...BONUS_KINDS] },
        action: { key: 'action', title: 'Action and First Person Battles', fights: 'action-battles', kinds: ACTION_KINDS }
    };

    /** The cards a kind of record gets, in the order they stand on its page. */
    function cardsFor(kind) {
        return Object.keys(CARDS).filter(name => CARDS[name].kinds.includes(kind));
    }

    /** Which combat modes use this card; also controls its initial fold. */
    function fightsFor(card, kind) {
        return CARDS[card].fights;
    }

    /** One title for the same group on every record page. */
    function titleFor(card, kind) {
        return CARDS[card].title;
    }

    /** The settings a card holds on a kind of record: the ones its Automatic chip takes out, as keys of `rrBattle` and as tags. */
    function ownTags(card, kind) {
        if (card === 'action') return kind === 'weapon' ? ['fireRate', 'magazine', 'reload', 'spread', 'combo', 'projectile'] : kind === 'skill' || kind === 'item' ? ['cooldown'] : [];
        if (card === 'shared') {
            if (ACTION_KINDS.includes(kind)) return ['range', 'area', 'los'];
            if (kind === 'enemy') return ['ai', 'character'];
            return kind === 'actor' ? ['ai'] : [];
        }
        return card === 'tactical' && (UNIT_KINDS.includes(kind) || BONUS_KINDS.includes(kind)) ? ['move', 'jump'] : [];
    }

    //-------------------------------------------------------------------------
    // Writing. Nothing here changes a record: each answer is `{ note, rrBattle }`, what the record holds afterward.

    // The limits of the cards' number fields. A value set through a card is held to them; what a tag or a script
    // says is read as it is.
    const LIMITS = { reach: [0, 30], size: [1, 20], unitMove: [0, 30], unitJump: [0, 20], bonus: [-20, 20],
        fireRate: [0, 20], magazine: [0, 999], reload: [0, 30], spread: [0, 45], combo: [0, 5], cooldown: [0, 600] };
    const within = (value, limit) => Math.max(limit[0], Math.min(limit[1], value));

    const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const sameSettings = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
    const hundredths = value => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;

    /**
     * The record's Note and settings after `patch` (a setting by its key;
     * null takes it out). `rrBattle` is a new object, undefined when
     * nothing is left in it. A key of the patch loses its tag in the Note,
     * so the two cannot disagree, but for a tag one of the project's plugins
     * reads (`keep`: such tags by key): that one stays for the plugin.
     */
    function stored(record, patch, keep) {
        const entry = record || {}, next = Object.assign({}, plainObject(entry.rrBattle) ? entry.rrBattle : null), taken = [];
        for (const key of Object.keys(patch || {})) {
            if (!TAGS[key]) continue;
            if (patch[key] === null || patch[key] === undefined) delete next[key]; else next[key] = patch[key];
            if (!(keep && keep[key])) taken.push(TAGS[key]);
        }
        return { note: without(entry.note, taken), rrBattle: Object.keys(next).length ? next : undefined };
    }

    /** A setting as `rrBattle` holds it. */
    function fieldOf(key, value) {
        if (key === 'range') return { min: value.min, max: value.max };
        if (key === 'area') return SIZED.includes(value.shape) ? { shape: value.shape, size: value.size } : { shape: value.shape };
        if (key === 'character') return { name: value.name, index: value.index };
        return value;
    }

    /**
     * The tags of a record among `keys`, as settings. `patch` holds each as
     * `rrBattle` stores it; `moved` says what was found: `{ key, tag,
     * value }`, `value` undefined for a tag the record's own setting already
     * stands over (that tag only leaves the Note). A tag one of the
     * project's plugins reads (`keep`) is not moved: `left` names it and the
     * plugin, `{ key, tag, plugin }`. A tag the game reads nothing from
     * stays where it is.
     */
    function tagMoves(record, keys, keep) {
        const entry = record || {}, note = text(entry.note), held = own(entry) || {};
        const tags = Object.assign({}, parseTags(note), parseCombat(note));
        const rule = Look(), sheet = rule ? rule.unitCharacter(note) : null;
        if (sheet) tags.character = { name: sheet.characterName, index: sheet.characterIndex };
        const patch = {}, moved = [], left = [];
        for (const key of keys) {
            const value = tags[key];
            if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) continue;
            const tag = TAGS[key].exec(note)[0];
            if (keep && keep[key]) { left.push({ key, tag, plugin: keep[key] }); continue; }
            const set = held[key] !== undefined;
            // A tag inside a PTBS block cannot leave the Note: once the record has its own setting there is nothing to do.
            if (set && strip(note, TAGS[key]) === note) continue;
            patch[key] = set ? entry.rrBattle[key] : fieldOf(key, value);
            moved.push({ key, tag, value: set ? undefined : patch[key] });
        }
        return { patch, moved, left };
    }

    /**
     * What the record holds after a card set `values` (a setting by its
     * key; null or '' for Automatic). A number is held to its field's
     * limits. A value the record gets anyway is not kept. With the change,
     * the card's tags of that record become its own settings, so the Note
     * says nothing of the card afterward; the other card's tags and every
     * other line stay, and so does a tag one of the project's plugins reads
     * (`context.pluginTags`): the setting is written and stands over it.
     */
    function change(card, kind, record, context, values) {
        const entry = record || {}, keys = ownTags(card, kind), asked = values || {}, keep = (context && context.pluginTags) || null;
        const patch = tagMoves(entry, keys, keep).patch;
        // The record with nothing of its own for one setting (a plugin's tag stays, and is still read).
        const bare = key => {
            const settings = Object.assign({}, plainObject(entry.rrBattle) ? entry.rrBattle : null);
            delete settings[key];
            return Object.assign({}, entry, { rrBattle: settings, note: keep && keep[key] ? text(entry.note) : strip(entry.note, TAGS[key]) });
        };
        for (const key of keys) {
            if (!(key in asked)) continue;
            const value = asked[key];
            if (value === null || value === undefined || value === '') { patch[key] = null; continue; }
            if (key === 'range' || key === 'area') {
                const wanted = key === 'range' ? { min: within(whole(value.min), LIMITS.reach), max: within(whole(value.max), LIMITS.reach) }
                    : { shape: value.shape, size: within(Math.max(1, whole(value.size)), LIMITS.size) };
                const left = effective(kind, bare(key), context);
                const same = key === 'range' ? sameRange(wanted, left.range) : sameArea(wanted, left.area);
                // What the equipped weapon would decide is kept when set, even at the unarmed value.
                patch[key] = same && !(left.auto[key] && left.weapon[key]) ? null : fieldOf(key, wanted);
            } else if (key === 'los') {
                patch.los = value === false ? false : null;
            } else if (key === 'move' || key === 'jump') {
                // On equipment and states the number is added: none is nothing set. A unit that moves 0 tiles is.
                const bonus = BONUS_KINDS.includes(kind);
                const number = within(Math.trunc(Number(value) || 0), bonus ? LIMITS.bonus : key === 'move' ? LIMITS.unitMove : LIMITS.unitJump);
                patch[key] = bonus && number === 0 ? null : number;
            } else if (key === 'ai') {
                patch.ai = AI.includes(value) && value !== 'aggressive' ? value : null;
            } else if (key === 'character') {
                const name = text(value.name).trim();
                patch.character = name ? { name, index: Math.min(7, whole(value.index)) } : null;
            } else if (key === 'projectile') {
                patch.projectile = !PROJECTILES.includes(value) || value === combatProfile(bare(key), context).projectile ? null : value;
            } else if (key === 'cooldown') {
                const number = within(hundredths(value), LIMITS.cooldown);
                patch.cooldown = number === cooldownOf(kind, bare(key)).cooldown ? null : number;
            } else {
                const number = within(key === 'magazine' || key === 'combo' ? whole(value) : hundredths(value), LIMITS[key]);
                patch[key] = number === combatProfile(bare(key), context)[key] ? null : number;
            }
        }
        return stored(entry, patch, keep);
    }

    /**
     * What the record holds with a card's own settings and own tags taken
     * out; the other card's and every other line stay, and a tag one of the
     * project's plugins reads (`context.pluginTags`) stays too.
     */
    function reset(card, kind, record, context) {
        const patch = {};
        for (const key of ownTags(card, kind)) patch[key] = null;
        return stored(record, patch, (context && context.pluginTags) || null);
    }

    /**
     * Every tag the game reads on this kind of record, as the record's own
     * settings: `{ note, rrBattle, moved, left }`, `moved` and `left` as
     * tagMoves gives them (`left`: the tags a plugin of the project reads,
     * `context.pluginTags`, which stay). A record with nothing to move comes
     * back as it is.
     */
    function convert(kind, record, context) {
        const entry = record || {}, keys = Object.keys(TAGS).filter(key => cardsFor(kind).some(card => ownTags(card, kind).includes(key))), keep = (context && context.pluginTags) || null;
        const found = tagMoves(entry, keys, keep);
        if (!found.moved.length) return { note: text(entry.note), rrBattle: entry.rrBattle, moved: [], left: found.left };
        return Object.assign(stored(entry, found.patch, keep), { moved: found.moved, left: found.left });
    }

    /** Whether an answer differs from what the record holds. */
    function differs(record, result) {
        return result.note !== text(record.note) || !sameSettings(result.rrBattle, record.rrBattle);
    }

    /** Writes an answer onto a record: its Note, and `rrBattle` as the new object or not at all. */
    function put(record, result) {
        if (result.note !== text(record.note)) record.note = result.note;
        if (result.rrBattle) record.rrBattle = result.rrBattle;
        else delete record.rrBattle;
        return record;
    }

    /**
     * What a card's title line says of a record, and whether the record
     * sets something in that card: `{ text, tagged }`. Left alone, the text
     * starts with "Automatic:" and says what the record gets by itself.
     */
    function summarize(card, kind, record, context, tt) {
        const t = tt || (x => x), entry = record || {};
        const said = (tagged, words) => (tagged ? '' : t('Automatic') + ': ') + words;
        if (card === 'action') {
            if (kind === 'weapon') {
                const tags = recordCombat(entry) || {}, tagged = ownTags(card, kind).some(key => tags[key] !== undefined);
                return { text: said(tagged, describeCombat(combatProfile(entry, context), t)), tagged };
            }
            const value = cooldownOf(kind, entry);
            return { text: said(!value.auto, `${t('Cooldown')} ${tidy(value.cooldown)} ${t('s')}`), tagged: !value.auto };
        }
        const found = recordTactics(entry) || {}, parts = [];
        let tagged = false;
        if (card === 'shared' && ACTION_KINDS.includes(kind)) {
            const value = effective(kind, entry, context);
            const sight = sighted(value) || value.weapon.range;
            tagged = !value.auto.range || !value.auto.area || found.los === false;
            const ranged = !['self', 'all'].includes(value.area.shape);
            const range = value.weapon.range && ranged ? t("Uses equipped weapon's range") : value.weapon.area ? describeRange(value.range, t) : describe(value, t);
            const area = value.weapon.area ? ' · ' + t("Uses equipped weapon's area") : value.weapon.range && ranged ? ' · ' + describe(value, t, true) : '';
            parts.push(said(tagged, range + area) + (found.los === false && sight ? ' · ' + t('no line of sight needed') : ''));
        }
        if (card === 'shared' && (kind === 'actor' || kind === 'enemy')) {
            tagged = !!found.ai || (kind === 'enemy' && !!recordCharacter(entry));
            const behavior = { aggressive: 'Up close', ranged: 'From a distance', support: 'Supporting allies' };
            parts.push(said(tagged, t(behavior[found.ai] || behavior.aggressive)));
            const sheet = kind === 'enemy' ? recordCharacter(entry) : null;
            if (sheet) parts.push(sheet.characterName);
        }
        if (card === 'tactical' && UNIT_KINDS.includes(kind)) {
            tagged = found.move !== undefined || found.jump !== undefined;
            parts.push(said(tagged, `${t('Move range')} ${unitStats(kind, entry, context).move}`));
        }
        if (card === 'tactical' && BONUS_KINDS.includes(kind)) {
            tagged = tagged || !!found.move || !!found.jump;
            if (found.move) parts.push(`${t('Move range')} ${found.move > 0 ? '+' : ''}${found.move}`);
            if (found.jump) parts.push(`${t('Climb')} ${found.jump > 0 ? '+' : ''}${found.jump}`);
        }
        return { text: parts.join(' · '), tagged };
    }

    //-------------------------------------------------------------------------
    // The pictures.

    const color = (token, fallback) => (root.ThemeColors && root.ThemeColors.resolve ? root.ThemeColors.resolve(token, fallback) : fallback) || fallback;

    /**
     * Draws the picture: the unit in the middle, `reach` cells in one color,
     * `area` cells in another (null area: none). `radius` is how many cells
     * show each way from the unit; `everyone` tints the whole grid.
     */
    function drawGrid(canvas, { radius, reach, area, target, everyone }) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const size = canvas.width, count = radius * 2 + 1, cell = size / count;
        // Cells sit on whole pixels, each from one edge to the next, so they tile with no seam at any size.
        const edge = i => Math.round(i * size / count);
        const rect = (x, y) => { const cx = x + radius, cy = y + radius; return [edge(cx), edge(cy), edge(cx + 1) - edge(cx), edge(cy + 1) - edge(cy)]; };
        const line = color('--color-border', '#3a3a3a'), back = color('--color-bg-panel', '#1b1b1b');
        const reachFill = color('--color-text-strong', '#ffffff'), areaFill = color('--color-accent', '#e0b020'), unit = color('--color-text-strong', '#ffffff');
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = back;
        ctx.fillRect(0, 0, size, size);
        const inside = c => Math.abs(c.x) <= radius && Math.abs(c.y) <= radius;
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = reachFill;
        for (const c of reach) if (inside(c)) { const [x, y, w, h] = rect(c.x, c.y); ctx.fillRect(x, y, w, h); }
        ctx.globalAlpha = everyone ? 0.4 : 0.8;
        ctx.fillStyle = areaFill;
        if (everyone) ctx.fillRect(0, 0, size, size);
        // Cells too small for a margin are filled whole.
        const inset = cell >= 8 ? 1 : 0;
        for (const c of area || []) if (inside(c)) { const [x, y, w, h] = rect(c.x, c.y); ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2); }
        // One line at every cell's edge, fainter as the cells get small, so the grid stays even and does not drown the picture.
        ctx.globalAlpha = cell >= 8 ? 1 : Math.max(0.35, cell / 8);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
            const p = Math.min(size - 0.5, edge(i) + 0.5);
            ctx.moveTo(p, 0); ctx.lineTo(p, size);
            ctx.moveTo(0, p); ctx.lineTo(size, p);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (target && inside(target)) {
            const [x, y, w, h] = rect(target.x, target.y);
            ctx.strokeStyle = unit;
            ctx.lineWidth = 2;
            if (cell >= 8) ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
            else ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
        }
        // The unit: a pawn in the middle cell, a plain dot when the cell is too small for one.
        const [ux, uy, uw, uh] = rect(0, 0), mid = uw / 2;
        ctx.fillStyle = back;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(ux + inset, uy + inset, uw - inset * 2, uh - inset * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = unit;
        ctx.beginPath();
        if (cell < 9) {
            ctx.arc(ux + mid, uy + uh / 2, Math.max(1.5, cell * 0.38), 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        ctx.arc(ux + mid, uy + uh * 0.34, uw * 0.19, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ux + mid, uy + uh * 0.92, uw * 0.33, Math.PI, 0);
        ctx.fill();
    }

    /**
     * The Action picture. A ranged weapon: the cone a shot may stray in,
     * unaimed and (inside it) aimed, and a pip for every shot in the
     * magazine. A melee weapon: its arc at its reach, and the combo as steps
     * as tall as the share of an attack each deals.
     */
    function drawCombat(canvas, profile) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const size = canvas.width, back = color('--color-bg-panel', '#1b1b1b'), line = color('--color-border', '#3a3a3a');
        const soft = color('--color-text-strong', '#ffffff'), accent = color('--color-accent', '#e0b020');
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = back;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
        const ox = 22, oy = 70, DEG = Math.PI / 180;
        const wedge = (half, length, fill, alpha) => {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.arc(ox, oy, length, -half * DEG, half * DEG);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        };
        if (profile.ranged) {
            // Spread: drawn at its own angle, never thinner than a line.
            const length = size - ox - 10;
            wedge(Math.max(0.6, profile.spread), length, soft, 0.24);
            wedge(Math.max(0.3, profile.aimSpread), length, accent, 0.85);
            // The magazine: a pip a shot, ten to a row.
            const shown = Math.min(profile.magazine, 40), per = 10, pip = 13, gap = 4, left = 12, top = 138;
            ctx.fillStyle = soft;
            for (let i = 0; i < shown; i++) {
                const x = left + (i % per) * (pip + gap), y = top + Math.floor(i / per) * 13;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(x, y, pip, 8);
            }
            ctx.globalAlpha = 1;
            if (profile.magazine === 0) {
                // No magazine: one long bar, never empty.
                ctx.globalAlpha = 0.8;
                ctx.fillRect(left, top, size - left * 2, 8);
                ctx.globalAlpha = 1;
            }
        } else {
            // The swing: a 120 degree arc at the weapon's reach (one tile is 44 px here).
            wedge(60, Math.max(20, profile.reach * 44), soft, 0.24);
            // The combo: a step a swing, as tall as its share of an attack.
            const shares = comboShares(profile.combo), width = 26, gap = 8, left = 12, floor = 186, tall = 62;
            shares.forEach((share, index) => {
                const h = Math.round(tall * share), x = left + index * (width + gap);
                ctx.fillStyle = index === shares.length - 1 ? accent : soft;
                ctx.globalAlpha = index === shares.length - 1 ? 0.9 : 0.55;
                ctx.fillRect(x, floor - h, width, h);
            });
            ctx.globalAlpha = 1;
        }
        // The unit.
        ctx.fillStyle = soft;
        ctx.beginPath();
        ctx.arc(ox, oy - 5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ox, oy + 13, 10, Math.PI, 0);
        ctx.fill();
    }

    /** The cell the picture aims at while the pointer is elsewhere: as far as it reaches, to the right. */
    function restingTarget(value) {
        if (value.area.shape === 'self' || value.area.shape === 'all') return { x: 0, y: 0 };
        return { x: Math.max(value.range.max, value.range.min), y: 0 };
    }

    /** How many cells the picture shows each way: one past the furthest cell it must hold, from 4 up to one past the fields' highest number. */
    const MAX_RADIUS = 31;
    const radiusFor = need => Math.max(4, Math.min(MAX_RADIUS, whole(need) + 1));

    /** What the picture shows for a reach and an area, the pointer on `pointer` (a cell, or null). */
    function picture(value, pointer) {
        const own = value.area.shape === 'self', everyone = value.area.shape === 'all';
        const spread = SIZED.includes(value.area.shape) ? Math.max(1, whole(value.area.size)) : 0;
        const far = own || everyone ? 0 : value.range.max;
        // A line or a cone runs from the user; any other area lies round the cell aimed at, furthest out at full reach.
        const need = ['line', 'cone'].includes(value.area.shape) ? Math.max(far, spread) : far + spread;
        const radius = radiusFor(need);
        // Only the cells the picture has room for: a reach typed as a tag may be any number.
        const reach = own || everyone ? [] : reachCells(value.range.min, Math.min(value.range.max, radius));
        const aimed = pointer && reach.some(c => c.x === pointer.x && c.y === pointer.y) ? pointer : restingTarget(value);
        return { radius, reach, area: areaCells(value.area, { x: 0, y: 0 }, aimed), target: own || everyone ? null : aimed, everyone };
    }

    //-------------------------------------------------------------------------
    // The cards on the page.

    // The reach as one phrase, so each language puts its own words round the two numbers.
    const REACH_PHRASE = '{min} to {max} tiles';

    /**
     * The fields of a reach in the order and with the words of the
     * language: the phrase is cut at its two numbers, each number is a
     * field, and what follows the last one is the unit. A translation that
     * does not hold each number once is not used.
     */
    function reachRow(tt) {
        const said = text((tt || (x => x))(REACH_PHRASE));
        const once = token => said.split(token).length === 2;
        const phrase = once('{min}') && once('{max}') ? said : REACH_PHRASE;
        const pieces = phrase.split(/\{(min|max)\}/), last = pieces.length - 1;
        return pieces.map((piece, index) => {
            if (index % 2) return `<input type="number" class="database-field-value rr-tactics-${piece}" data-no-stepper min="${LIMITS.reach[0]}" max="${LIMITS.reach[1]}" step="1">`;
            const words = piece.trim();
            return words ? `<span class="rr-tactics-word${index === last ? ' rr-tactics-reach-unit' : ''}">${esc(words)}</span>` : '';
        }).join('');
    }

    const CARD_HINTS = {
        shared: 'Used by Tactical, Action and First Person battles.',
        tactical: 'Turn-based movement. Action battles use map movement and physics.',
        action: 'Real-time attacks and cooldowns. First Person uses the same combat rules.'
    };

    /** A card as HTML: its title line, its fields on the shared form grid and, where it has one, its picture. */
    function cardHtml(name, kind, tt) {
        const t = tt || (x => x);
        const word = value => esc(t(value));
        const number = (label, cls, unit, min, max, step, mark = '') => `
            <label${mark}>${word(label)}</label>
            <span class="rr-tactics-inline"${mark}>
                <input type="number" class="database-field-value ${cls}" data-no-stepper min="${min}" max="${max}" step="${step}">
                <span class="rr-tactics-word">${word(unit)}</span>
            </span>`;
        let rows = '', picture = false;
        if (name === 'action') {
            // A gun has a magazine, a reload and a spread; a blade has a combo: the card shows the rows of the weapon it holds.
            const hides = (label, key, unit, step) => number(label, 'rr-combat-' + key, unit, LIMITS[key][0], LIMITS[key][1], step, ` data-combat="${key}"`);
            if (kind === 'weapon') {
                rows = `
            <label>${word('Fires')}</label>
            <span class="rr-tactics-inline"><select class="database-field-value rr-combat-projectile"></select></span>`
                    + hides('Attack rate', 'fireRate', 'a second', '0.1') + hides('Magazine', 'magazine', 'shots', '1')
                    + hides('Reload', 'reload', 'seconds', '0.1') + hides('Spread', 'spread', 'degrees', '0.5')
                    + hides('Combo', 'combo', 'swings', '1');
                picture = true;
            } else {
                rows = hides('Cooldown', 'cooldown', 'seconds', '0.5');
            }
        } else {
            if (name === 'shared' && ACTION_KINDS.includes(kind)) {
                rows += `
            <label class="rr-tactics-range-label">${word('Target range')}</label>
            <div class="rr-tactics-range">
                <select class="database-field-value rr-tactics-range-source" hidden></select>
                <span class="rr-tactics-inline rr-tactics-range-values">${reachRow(t)}</span>
            </div>
            <span class="rr-tactics-hint rr-tactics-range-hint">${word('How far away you can select a target.')}</span>
            <label>${word('Area of effect')}</label>
            <span class="rr-tactics-inline">
                <select class="database-field-value rr-tactics-shape"></select>
            </span>
            <span class="rr-tactics-hint">${word('Scope chooses who can be affected; this sets the shape of the area.')}</span>
            <label class="rr-tactics-size-label" hidden>${word('Radius')}</label>
            <span class="rr-tactics-inline rr-tactics-size-values" hidden>
                <input type="number" class="database-field-value rr-tactics-size" data-no-stepper min="${LIMITS.size[0]}" max="${LIMITS.size[1]}" step="1">
                <span class="rr-tactics-word">${word('tiles')}</span>
            </span>
            <label class="rr-tactics-check"><input type="checkbox" class="system-checkbox rr-tactics-los"><span>${word('Needs a clear line of sight')}</span></label>`;
                picture = true;
            }
            if (name === 'tactical' && UNIT_KINDS.includes(kind)) {
                rows += number('Move range', 'rr-tactics-move', 'tiles a turn', LIMITS.unitMove[0], LIMITS.unitMove[1], 1) + number('Climb', 'rr-tactics-jump', 'levels a step', LIMITS.unitJump[0], LIMITS.unitJump[1], 1);
                picture = true;
            }
            if (name === 'shared' && (kind === 'actor' || kind === 'enemy')) {
                rows += `
            <label>${word('Fights')}</label>
            <span class="rr-tactics-inline"><select class="database-field-value rr-tactics-ai">
                <option value="aggressive">${word('Up close')}</option>
                <option value="ranged">${word('From a distance')}</option>
                <option value="support">${word('Supporting allies')}</option>
            </select></span>`;
                // An enemy's picture on the map: the sheet picked, the way to pick one and the way back, and what it stands as left alone.
                if (kind === 'enemy') rows += `
            <label>${word('On the map')}</label>
            <span class="rr-tactics-inline rr-tactics-look">
                <canvas class="rr-tactics-sprite" width="48" height="48"></canvas>
                <span class="rr-tactics-look-name"></span>
                <button type="button" class="rr-btn-chip rr-tactics-look-change">${word('Choose a picture...')}</button>
                <button type="button" class="rr-btn-chip rr-tactics-look-auto" hidden>${word('Automatic')}</button>
            </span>
            <span class="rr-tactics-hint rr-tactics-look-hint" hidden></span>`;
            }
            if (name === 'tactical' && BONUS_KINDS.includes(kind)) rows += number('Move range', 'rr-tactics-move', 'tiles more or fewer', LIMITS.bonus[0], LIMITS.bonus[1], 1) + number('Climb', 'rr-tactics-jump', 'levels more or fewer', LIMITS.bonus[0], LIMITS.bonus[1], 1);
        }
        return `
            <div class="database-section-header rr-tactics-header"><span class="rr-tactics-title">${word(titleFor(name, kind))}</span><span class="rr-tactics-summary"></span><button type="button" class="rr-btn-chip rr-tactics-reset" hidden>${word('Automatic')}</button></div>
            <div class="database-section-content rr-tactics-body">
                <div class="rr-tactics-scope">${word(CARD_HINTS[name])}</div>
                <div class="db-form rr-tactics-form">${rows}</div>
                ${picture ? '<div class="rr-tactics-picture">' + (name === 'shared' ? `<span class="rr-tactics-preview-title">${word('Tactical targeting preview')}</span>` : '') + '<canvas width="198" height="198"></canvas><div class="rr-tactics-legend"></div>' + (name === 'shared' ? '<span class="rr-tactics-preview-hint" hidden></span>' : '') + '</div>' : ''}
            </div>`;
    }

    // The fields of a record's page that change what its cards show.
    const WATCHED = ['note', 'scope', 'hitType', 'wtypeId', 'classId'];

    // Who listens on each pane: host -> the watchers whose cards were placed in it.
    const watchers = new WeakMap();

    /**
     * Listens on the page for the Note typed by hand, the Scope, the Hit
     * Type, a weapon's type and an actor's class, and calls `react(field,
     * value)` for a field of this record (`kind`, `id`) outside the cards
     * (`anchor`). The page keeps one pane and replaces what is in it: the
     * cards of a record shown earlier must never act on a field of the
     * record shown now, and must not be kept alive by the pane. So a
     * watcher whose cards have left the pane is taken off when the next
     * record's cards arrive, and takes itself off should it still hear
     * something. Returns the function that stops listening.
     */
    function watchPage(host, anchor, kind, id, react) {
        let live = watchers.get(host);
        if (!live) watchers.set(host, live = new Set());
        for (const earlier of live) if (!host.contains(earlier.anchor)) earlier.stop();
        const hear = event => {
            if (!host.contains(anchor)) { stop(); return; }
            const target = event.target, field = target && target.dataset && target.dataset.field;
            if (!WATCHED.includes(field) || anchor.contains(target)) return;
            // Typing is followed in the Note alone; the other fields say their value when it is set.
            if (event.type === 'input' && field !== 'note') return;
            const owner = typeof target.getAttribute === 'function' ? target.getAttribute(`data-${kind}-id`) : null;
            if (owner !== null && owner !== undefined && String(owner) !== String(id)) return;
            react(field, target.value);
        };
        const watcher = { anchor, stop: null };
        const stop = () => {
            host.removeEventListener('change', hear);
            host.removeEventListener('input', hear);
            live.delete(watcher);
        };
        watcher.stop = stop;
        live.add(watcher);
        host.addEventListener('change', hear);
        host.addEventListener('input', hear);
        return stop;
    }

    // The Database's own way of keeping a changed record of each kind.
    const UPDATERS = { actor: 'updateActor', class: 'updateClass', skill: 'updateSkill', item: 'updateItem', weapon: 'updateWeapon', armor: 'updateArmor', enemy: 'updateEnemy', state: 'updateState' };

    /**
     * What the cards of one record share: the record as it stands on the
     * page (its own settings, and the Note in the page's own field once the
     * cards stand there), the one way a change is kept, and each other's
     * redraw. Reading writes nothing.
     */
    function recordLink(options) {
        const { kind, record, databaseManager } = options;
        const project = () => options.projectManager || (root.reactor && root.reactor.projectController) || null;
        const folder = () => {
            if (databaseManager && databaseManager.projectPath) return databaseManager.projectPath;
            const from = project(), open = from ? (typeof from.getCurrentProject === 'function' ? from.getCurrentProject() : from.currentProject) : null;
            return (open && open.path) || '';
        };
        // The tags the project's own plugins read: found once for the project, while its first record is shown.
        const scan = options.pluginTags ? { tags: options.pluginTags, ready: Promise.resolve(options.pluginTags) } : pluginTags(folder());
        const context = {
            weaponTypes: (databaseManager && databaseManager.getSystem && databaseManager.getSystem() || {}).weaponTypes || [],
            // An actor moves and climbs as its class does until it says otherwise itself.
            classOf: id => (databaseManager && typeof databaseManager.getClass === 'function' ? databaseManager.getClass(id) : null),
            get pluginTags() { return scan.tags || {}; }
        };
        const redraws = [];
        let anchor = null, noteField = null, writing = false;
        const host = () => (anchor ? anchor.closest('#database-detail') || anchor.parentElement : null);
        const findNote = () => {
            if (noteField && noteField.isConnected) return noteField;
            const from = host();
            noteField = from ? from.querySelector(`textarea[data-field="note"][data-${kind}-id="${record.id}"]`) : null;
            return noteField;
        };
        // The record the Database holds under this id: the one its page's fields write to, and the one that is saved.
        const kept = () => {
            const list = databaseManager && databaseManager.data ? databaseManager.data[DATA_KEYS[kind]] : null;
            const held = Array.isArray(list) ? list[record.id] : null;
            return held && typeof held === 'object' ? held : record;
        };
        // The Note's field shows every line end as a line feed. While it shows what the record holds, the record's
        // own text is the Note, with the line ends it has; text typed there since takes the line ends the Note uses.
        const note = () => {
            const field = findNote();
            if (!field) return text(record.note);
            const held = text(kept().note), shown = text(field.value);
            if (shown === held || shown === held.replace(/\r\n?/g, '\n')) return held;
            return /\r\n/.test(held) && !/(^|[^\r])\n/.test(held) ? shown.replace(/\r\n|\n/g, '\r\n') : shown;
        };
        const live = () => Object.assign({}, record, { note: note(), rrBattle: kept().rrBattle });
        const redraw = () => { for (const each of redraws) each(); };
        // Whether the cards still stand on the page: the pane shows one record at a time.
        const standing = () => { const pane = anchor ? anchor.closest('#database-detail') : null; return !anchor || (pane ? pane.contains(anchor) : anchor.isConnected !== false && !!anchor.parentElement); };
        /**
         * Keeps what a card gave (`{ note, rrBattle }`) and redraws every card once. The record's settings are
         * replaced by the new object, or taken off; the Note goes through the page's own field, which keeps it
         * as it keeps a Note typed by hand, and the record then holds it with its own line ends.
         */
        const commit = result => {
            const before = live();
            if (!sameSettings(result.rrBattle, before.rrBattle)) {
                const target = kept();
                for (const each of target === record ? [record] : [target, record]) {
                    if (result.rrBattle) each.rrBattle = result.rrBattle;
                    else delete each.rrBattle;
                }
                const update = databaseManager ? databaseManager[UPDATERS[kind]] : null;
                if (typeof update === 'function') update.call(databaseManager, record.id, target);
            }
            if (result.note !== before.note) {
                record.note = result.note;
                const field = findNote();
                if (field) {
                    field.value = result.note;
                    writing = true;
                    try { field.dispatchEvent(new Event('change', { bubbles: true })); } finally { writing = false; }
                    const target = kept();
                    if (target.note !== result.note) target.note = result.note;
                    record.note = result.note;
                } else if (options.onNoteChange) {
                    options.onNoteChange(result.note);
                }
            }
            redraw();
        };
        return {
            context, redraws, note, live, project, folder, commit,
            /**
             * Does what a card asks (`make()` gives `{ note, rrBattle }`), then `then()`: at once, or as soon as
             * the project's plugins have been read, should that still be going on.
             */
            act(make, then) {
                const run = () => { commit(make()); if (then) then(); };
                if (scan.tags) run();
                else scan.ready.then(() => { if (standing()) run(); });
            },
            /** What an enemy with this record stands as on the map, by the game's own rule: its 3D model, its sheet, its battler picture or a plain figure. */
            stands(entry) {
                const rule = Look();
                if (!rule) return { kind: 'figure' };
                const bindings = root.RRDatabase3DBindings, where = folder();
                let model = null;
                if (bindings && typeof bindings.get === 'function' && where) {
                    try { model = bindings.get(where, 'enemies', record.id); } catch (error) { model = null; }
                }
                const system = databaseManager && databaseManager.getSystem ? databaseManager.getSystem() : null;
                return rule.resolve({ team: 'enemy', record: 'enemy', id: record.id }, { model, record: entry, sideView: !!(system && system.optSideView) });
            },
            /** `element` is what the page places: once it stands there the cards follow the page's fields. */
            place(element) {
                anchor = element;
                // What the plugins read may arrive after the cards: they say it then.
                if (!scan.tags) scan.ready.then(() => { if (standing()) redraw(); });
                setTimeout(() => {
                    const from = host();
                    if (from) watchPage(from, anchor, kind, record.id, (field, value) => {
                        if (writing) return;
                        if (field !== 'note') record[field] = Math.floor(Number(value) || 0);
                        redraw();
                    });
                    redraw();
                }, 0);
            }
        };
    }

    // The field of each setting's row, and what the row says while the Note keeps a tag for a plugin.
    const KEPT_ROWS = { range: '.rr-tactics-min', area: '.rr-tactics-shape', los: '.rr-tactics-los', move: '.rr-tactics-move', jump: '.rr-tactics-jump', ai: '.rr-tactics-ai',
        character: '.rr-tactics-look-change', fireRate: '.rr-combat-fireRate', magazine: '.rr-combat-magazine', reload: '.rr-combat-reload', spread: '.rr-combat-spread',
        combo: '.rr-combat-combo', cooldown: '.rr-combat-cooldown', projectile: '.rr-combat-projectile' };
    const KEPT_WORDS = 'Its tag stays in the Note: the plugin {name} reads it.';

    // What an enemy stands as while it has no picture of its own, by what the game's rule answers.
    const LOOK_HINTS = { model: 'Its 3D model.', picture: 'Its battler picture.', figure: 'A plain figure in its side\'s color.' };

    /** A picture file of the project as something an image can load; '' when there is none or no file access. */
    function pictureUrl(folder, kind, name) {
        try {
            const files = root.RRAssetFiles, path = typeof require === 'function' ? require('path') : null;
            return files && path && folder && name ? files.urlFor(path.join(folder, 'img', kind), name, ['.png']) || '' : '';
        } catch (error) { return ''; }
    }

    /**
     * Draws what an enemy stands as in the small box of its row: the frame
     * of its sheet that faces down, mid-step (`sheet`), else what the game
     * gives it (`stands`): its battler picture, or a plain figure. A 3D
     * model is not drawn here. `folder` is the project's.
     */
    function drawLook(canvas, folder, sheet, stands) {
        const ctx = canvas.getContext('2d'), rule = Look();
        if (!ctx) return;
        const width = canvas.width, height = canvas.height, turn = canvas._rrTurn = (canvas._rrTurn || 0) + 1;
        ctx.clearRect(0, 0, width, height);
        if (!sheet && stands.kind === 'figure' && rule) { rule.drawFigure(ctx, 4, 2, width - 8, height - 4, stands.color); return; }
        const battler = !sheet && stands.kind === 'picture';
        if ((!sheet && !battler) || typeof root.Image !== 'function') return;
        const url = sheet ? pictureUrl(folder, 'characters', sheet.characterName) : pictureUrl(folder, stands.folder, stands.name);
        if (!url) return;
        const image = new root.Image();
        image.onload = () => {
            // A later record or a later choice has the box by now.
            if (canvas._rrTurn !== turn) return;
            let sx = 0, sy = 0, sw = image.width, sh = image.height;
            if (sheet) {
                const files = root.RRAssetFiles, big = !!(files && files.isBigCharacter(sheet.characterName));
                const frames = files && files.characterFrameCount ? files.characterFrameCount(sheet.characterName) : 3;
                const index = big ? 0 : sheet.characterIndex;
                sw = image.width / (big ? frames : frames * 4);
                sh = image.height / (big ? 4 : 8);
                sx = ((index % 4) * frames + Math.min(1, frames - 1)) * sw;
                sy = Math.floor(index / 4) * 4 * sh;
            }
            const scale = Math.min(width / sw, height / sh, sheet ? 2 : 1e9);
            const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
            ctx.clearRect(0, 0, width, height);
            ctx.imageSmoothingEnabled = !sheet && scale < 1;
            ctx.drawImage(image, sx, sy, sw, sh, Math.round((width - w) / 2), height - h, w, h);
            if (battler && stands.hue && rule) {
                // A battler's hue, turned as the battle turns it.
                try { const pixels = ctx.getImageData(0, 0, width, height); rule.rotateHue(pixels.data, stands.hue); ctx.putImageData(pixels, 0, 0); } catch (error) { /* shown unturned */ }
            }
        };
        image.src = url;
    }

    /** The Tactical card's fields and picture: `fill()` shows the record, `paint()` draws the grid. */
    function tacticalParts(section, kind, link, tt, repaint, name = 'tactical') {
        const action = name === 'shared' && ACTION_KINDS.includes(kind), unitKind = name === 'tactical' && UNIT_KINDS.includes(kind), bonus = name === 'tactical' && BONUS_KINDS.includes(kind);
        const context = link.context, q = selector => section.querySelector(selector);
        const pictureBox = q('.rr-tactics-picture'), canvas = pictureBox ? pictureBox.querySelector('canvas') : null, legend = q('.rr-tactics-legend');
        const min = q('.rr-tactics-min'), max = q('.rr-tactics-max'), shape = q('.rr-tactics-shape'), size = q('.rr-tactics-size'), los = q('.rr-tactics-los');
        const rangeSource = q('.rr-tactics-range-source'), rangeValues = q('.rr-tactics-range-values'), rangeBox = q('.rr-tactics-range'), rangeLabel = q('.rr-tactics-range-label'), rangeHint = q('.rr-tactics-range-hint');
        const sizeLabel = q('.rr-tactics-size-label'), sizeValues = q('.rr-tactics-size-values'), previewHint = q('.rr-tactics-preview-hint');
        const move = q('.rr-tactics-move'), jump = q('.rr-tactics-jump'), ai = q('.rr-tactics-ai');
        const sprite = q('.rr-tactics-sprite'), lookName = q('.rr-tactics-look-name'), lookChange = q('.rr-tactics-look-change'), lookAuto = q('.rr-tactics-look-auto'), lookHint = q('.rr-tactics-look-hint');
        let pointer = null;

        const paint = () => {
            if (sprite) { const entry = link.live(); drawLook(sprite, link.folder(), recordCharacter(entry), link.stands(entry)); }
            if (!canvas) return;
            let shown;
            if (action) {
                shown = picture(effective(kind, link.live(), context), pointer);
                legend.innerHTML = `<span><i class="rr-tactics-key is-reach"></i>${esc(tt('Target range'))}</span><span><i class="rr-tactics-key is-area"></i>${esc(tt('Area of effect'))}</span>`;
            } else {
                const steps = unitStats(kind, link.live(), context).move;
                shown = { radius: radiusFor(steps), reach: steps > 0 ? reachCells(1, steps) : [], area: null, target: null, everyone: false };
                legend.innerHTML = `<span><i class="rr-tactics-key is-reach"></i>${esc(tt('Move range'))} ${steps}</span>`;
            }
            canvas._rrRadius = shown.radius;
            drawGrid(canvas, shown);
        };

        // Empty fields show what the record gets by itself.
        const fill = () => {
            const entry = link.live(), found = recordTactics(entry) || {};
            if (action) {
                const value = effective(kind, entry, context);
                const sized = SIZED.includes(value.area.shape), ranged = value.area.shape !== 'self' && value.area.shape !== 'all';
                min.value = value.auto.range ? '' : value.range.min;
                max.value = value.auto.range ? '' : value.range.max;
                min.placeholder = String(value.range.min);
                max.placeholder = String(value.range.max);
                const inherits = weaponSkill(kind, entry);
                rangeSource.hidden = !inherits;
                rangeSource.innerHTML = `<option value="">${esc(tt("Uses equipped weapon's range"))}</option><option value="custom">${esc(tt('Custom range'))}</option>`;
                rangeSource.value = value.auto.range ? '' : 'custom';
                rangeValues.hidden = value.weapon.range;
                rangeBox.hidden = rangeLabel.hidden = rangeHint.hidden = !ranged;
                min.disabled = max.disabled = !ranged;
                const automatic = effective(kind, Object.assign({}, entry, {
                    rrBattle: Object.assign({}, entry.rrBattle, { area: undefined }),
                    note: context.pluginTags?.area ? entry.note : strip(entry.note, TAGS.area)
                }), context);
                const autoLabel = automatic.weapon.area ? tt("Uses equipped weapon's area") : tt('Automatic') + ': ' + describe(automatic, tt, true);
                shape.innerHTML = `<option value="">${esc(autoLabel)}</option>` + SHAPES.map(name => `<option value="${name}">${esc(tt(SHAPE_LABELS[name]))}</option>`).join('');
                shape.value = value.auto.area ? '' : value.area.shape;
                sizeLabel.hidden = sizeValues.hidden = size.hidden = !sized;
                sizeLabel.textContent = tt(['line', 'cone'].includes(value.area.shape) ? 'Length' : 'Radius');
                // The displayed default is editable: changing its dimension makes this record's own area.
                size.disabled = !sized;
                if (sized) size.value = Math.max(1, whole(value.area.size));
                previewHint.hidden = !(value.weapon.range && ranged || value.weapon.area);
                previewHint.textContent = tt('Preview without an equipped weapon.');
                const sight = sighted(value) || value.weapon.range;
                los.checked = value.los && sight;
                los.disabled = !sight;
            }
            if (unitKind) {
                const stats = unitStats(kind, entry, context);
                move.value = found.move !== undefined ? found.move : '';
                move.placeholder = String(stats.base.move);
                jump.value = found.jump !== undefined ? found.jump : '';
                jump.placeholder = String(stats.base.jump);
            }
            if (ai) ai.value = found.ai || 'aggressive';
            if (bonus) {
                move.value = found.move || '';
                move.placeholder = '0';
                jump.value = found.jump || '';
                jump.placeholder = '0';
            }
            if (lookName) {
                const sheet = recordCharacter(entry), stands = link.stands(entry);
                lookName.textContent = sheet ? sheet.characterName : tt('Automatic');
                lookName.title = sheet ? `${sheet.characterName}, ${sheet.characterIndex}` : '';
                lookName.classList.toggle('is-automatic', !sheet);
                lookAuto.hidden = !sheet;
                // The box holds a picture: a 3D model is not drawn in it, so it is not shown for one.
                sprite.hidden = !sheet && stands.kind === 'model';
                // Left alone, what the game gives it; with a picture picked, a word when the game shows something else.
                const words = sheet ? (stands.kind === 'model' ? 'Its 3D model is shown instead.' : '') : LOOK_HINTS[stands.kind] || '';
                lookHint.textContent = words ? tt(words) : '';
                lookHint.hidden = !words;
            }
        };

        // A value set is the record's own setting; a field emptied is automatic again.
        const set = (values, then) => link.act(() => change(name, kind, link.live(), context, values), then);
        if (action) {
            rangeSource.addEventListener('change', () => {
                const value = effective(kind, link.live(), context);
                set({ range: rangeSource.value === 'custom' ? value.range : null }, () => {
                    if (rangeSource.value === 'custom' && typeof max.focus === 'function') max.focus();
                });
            });
            const range = () => {
                if (min.value.trim() === '' && max.value.trim() === '') return null;
                const value = effective(kind, link.live(), context);
                const a = min.value.trim() === '' ? value.range.min : whole(min.value);
                const b = max.value.trim() === '' ? Math.max(a, value.range.max) : whole(max.value);
                return { min: Math.min(a, b), max: Math.max(a, b) };
            };
            // A reach field emptied is Automatic again, as every other field is.
            min.addEventListener('change', () => set({ range: min.value.trim() === '' ? null : range() }));
            max.addEventListener('change', () => set({ range: max.value.trim() === '' ? null : range() }));
            shape.addEventListener('change', () => {
                if (!shape.value) return set({ area: null });
                const current = effective(kind, link.live(), context).area;
                set({ area: { shape: shape.value, size: SIZED.includes(shape.value) ? (SIZED.includes(current.shape) ? Math.max(1, whole(current.size)) : 2) : 0 } });
            });
            size.addEventListener('change', () => set({ area: { shape: effective(kind, link.live(), context).area.shape, size: Math.max(1, whole(size.value)) } }));
            los.addEventListener('change', () => set({ los: los.checked }));
            // The pointer aims the area inside the reach.
            canvas.classList.add('is-aimed');
            canvas.addEventListener('pointermove', event => {
                const box = canvas.getBoundingClientRect(), radius = canvas._rrRadius || 4, cell = box.width / (radius * 2 + 1);
                const next = { x: Math.floor((event.clientX - box.left) / cell) - radius, y: Math.floor((event.clientY - box.top) / cell) - radius };
                if (pointer && pointer.x === next.x && pointer.y === next.y) return;
                pointer = next;
                repaint();
            });
            canvas.addEventListener('pointerleave', () => { pointer = null; repaint(); });
        }
        const number = (field, key) => field && field.addEventListener('change', () => {
            const raw = field.value.trim();
            set({ [key]: raw === '' ? null : Math.trunc(Number(raw) || 0) });
        });
        number(move, 'move');
        number(jump, 'jump');
        if (ai) ai.addEventListener('change', () => set({ ai: ai.value }));
        if (lookChange) {
            lookChange.addEventListener('click', () => {
                // The sheet picker is a class of the page: a name in its scope, not a property of the window.
                const Picker = typeof CharacterGraphicPicker !== 'undefined' ? CharacterGraphicPicker : root.CharacterGraphicPicker, from = link.project();
                if (typeof Picker !== 'function' || !from) return;
                const sheet = recordCharacter(link.live());
                new Picker(from).show(sheet ? sheet.characterName : '', sheet ? sheet.characterIndex : 0, 1, 2, result => {
                    // The picker's Clear hands back no name: Automatic again.
                    // The keyboard goes back to the button that opened the picker.
                    set({ character: result && result.characterName ? { name: result.characterName, index: result.characterIndex } : null }, () => { if (typeof lookChange.focus === 'function') lookChange.focus(); });
                });
            });
            lookAuto.addEventListener('click', () => {
                const page = section.ownerDocument || root.document;
                const focused = !!page && page.activeElement === lookAuto;
                // The chip leaves with the picture: the focus it held goes to the button beside it.
                set({ character: null }, () => { if (focused && lookAuto.hidden && typeof lookChange.focus === 'function') lookChange.focus(); });
            });
        }
        return { fill, paint };
    }

    /** The Action and First Person card's fields and picture: `fill()` shows the record, `paint()` draws the weapon. */
    function actionParts(section, kind, link, tt) {
        const context = link.context, q = selector => section.querySelector(selector);
        const canvas = q('canvas'), legend = q('.rr-tactics-legend'), projectile = q('.rr-combat-projectile');
        const input = key => q('.rr-combat-' + key);

        const paint = () => {
            if (!canvas) return;
            const profile = combatProfile(link.live(), context);
            drawCombat(canvas, profile);
            legend.innerHTML = profile.ranged
                ? `<span><i class="rr-tactics-key is-reach"></i>${esc(tt('Spread'))}</span><span><i class="rr-tactics-key is-area"></i>${esc(tt('Aimed'))}</span>`
                : `<span><i class="rr-tactics-key is-reach"></i>${esc(tt('Reach'))}</span><span><i class="rr-tactics-key is-area"></i>${esc(tt('Last swing'))}</span>`;
        };

        // The record without one setting: nothing of its own for it, and no tag.
        const without = (entry, key) => {
            const settings = Object.assign({}, entry.rrBattle && typeof entry.rrBattle === 'object' ? entry.rrBattle : null);
            delete settings[key];
            return Object.assign({}, entry, { rrBattle: settings, note: strip(entry.note, TAGS[key]) });
        };

        // Empty fields show what the record gets by itself.
        const fill = () => {
            if (kind !== 'weapon') {
                const entry = link.live(), value = cooldownOf(kind, entry), field = input('cooldown');
                field.value = value.auto ? '' : tidy(value.cooldown);
                field.placeholder = tidy(cooldownOf(kind, without(entry, 'cooldown')).cooldown);
                return;
            }
            const weapon = link.live(), profile = combatProfile(weapon, context), tags = recordCombat(weapon) || {};
            const bare = combatProfile(without(weapon, 'projectile'), context);
            projectile.innerHTML = `<option value="">${esc(tt('Automatic') + ': ' + tt(PROJECTILE_LABELS[bare.projectile]))}</option>`
                + PROJECTILES.map(name => `<option value="${name}">${esc(tt(PROJECTILE_LABELS[name]))}</option>`).join('');
            projectile.value = profile.auto.projectile ? '' : (tags.projectile || '');
            for (const key of ['fireRate', 'magazine', 'reload', 'spread', 'combo']) {
                const field = input(key);
                field.value = profile.auto[key] ? '' : tidy(tags[key]);
                field.placeholder = tidy(profile[key]);
            }
            const shown = { fireRate: true, magazine: profile.ranged, reload: profile.ranged, spread: profile.ranged, combo: !profile.ranged };
            for (const key of Object.keys(shown)) section.querySelectorAll(`[data-combat="${key}"]`).forEach(el => { el.hidden = !shown[key]; });
        };

        // A value typed is the record's own setting, a field emptied is automatic again.
        const set = values => link.act(() => change('action', kind, link.live(), context, values));
        for (const key of ownTags('action', kind)) {
            const field = input(key);
            if (field && field !== projectile) field.addEventListener('change', () => set({ [key]: field.value.trim() === '' ? null : Math.max(0, Number(field.value) || 0) }));
        }
        if (projectile) projectile.addEventListener('change', () => set({ projectile: projectile.value || null }));
        return { fill, paint };
    }

    /**
     * One card of a record: 'shared', 'tactical' or 'action'. It folds like every
     * Database section (the shell's RRDatabaseSections): folded, its title
     * line still says what the record does in that kind of battle.
     */
    function createCard(name, options, link) {
        const { kind } = options, card = CARDS[name];
        const tt = t => (root.I18n ? root.I18n.tText(t) : t);
        const page = document, section = page.createElement('div');
        section.className = 'database-section rr-tactics-section';
        section.dataset.kind = kind;
        section.dataset.card = name;
        // The name the fold is remembered by, the same in every language.
        section.dataset.sectionKey = card.key;
        // Nobody having folded or opened it, the card is folded while the project never fights this way,
        // except for a record that already sets something in it, by a setting of its own or by a tag.
        section.dataset.sectionDefault = fightsFor(name, kind);
        if (summarize(name, kind, link.live(), link.context).tagged) section.dataset.sectionInUse = 'true';
        section.innerHTML = cardHtml(name, kind, tt);

        const header = section.querySelector('.rr-tactics-header');
        const summary = section.querySelector('.rr-tactics-summary'), chip = section.querySelector('.rr-tactics-reset');
        const parts = (name === 'action' ? actionParts : tacticalParts)(section, kind, link, tt, () => draw(), name);
        const draw = () => {
            // A folded card shows no picture: it is drawn when the card opens.
            if (section.classList.contains('is-collapsed')) return;
            parts.paint();
        };
        // A tag one of the project's plugins reads stays in the Note: its row says so, under the field.
        const stays = {};
        const said = key => {
            if (stays[key]) return stays[key];
            const field = section.querySelector(KEPT_ROWS[key]);
            const row = field ? (key === 'character' ? section.querySelector('.rr-tactics-look-hint') : field.closest('.rr-tactics-inline') || field.closest('.rr-tactics-check')) : null;
            if (!row || !row.parentNode) return null;
            const line = page.createElement('span');
            line.className = 'rr-tactics-hint rr-tactics-kept';
            line.hidden = true;
            const rows = Array.from(row.parentNode.children);
            row.parentNode.insertBefore(line, rows[rows.indexOf(row) + 1] || null);
            stays[key] = { line, row: key === 'character' ? section.querySelector('.rr-tactics-look') : row };
            return stays[key];
        };
        const keptLines = live => {
            const left = tagMoves(live, ownTags(name, kind), link.context.pluginTags).left, shown = {};
            for (const each of left) {
                const found = said(each.key);
                if (!found) continue;
                shown[each.key] = true;
                found.line.textContent = tt(KEPT_WORDS).replace('{name}', each.plugin);
                found.line.title = each.tag;
                // A row the card does not show for this weapon says nothing either.
                found.line.hidden = !!found.row.hidden;
            }
            for (const key of Object.keys(stays)) if (!shown[key]) stays[key].line.hidden = true;
        };
        link.redraws.push(() => {
            parts.fill();
            const live = link.live(), told = summarize(name, kind, live, link.context, tt);
            summary.textContent = told.text;
            // The whole line, for a card too narrow to show it.
            summary.title = told.text;
            // The chip is there while it has something to take out: what a PTBS block sets, and a tag a plugin
            // reads, is read and never rewritten.
            chip.hidden = !(told.tagged && differs(live, reset(name, kind, live, link.context)));
            keptLines(live);
            draw();
        });
        chip.addEventListener('click', () => {
            const shown = section.ownerDocument || root.document;
            const focused = !!shown && shown.activeElement === chip;
            // The chip leaves once nothing is set: the focus it held stays on its card, on the title line.
            link.act(() => reset(name, kind, link.live(), link.context), () => { if (focused && chip.hidden && typeof header.focus === 'function') header.focus(); });
        });
        section.addEventListener('rr-section-fold', event => { if (event.target === section && !event.detail.collapsed) draw(); });
        return section;
    }

    /**
     * Combat cards stacked in one place. While every card
     * in it is folded the stack says so itself (`is-collapsed`), so a page
     * that gives a folded card the whole row gives it to the stack too.
     */
    function stackOf(cards) {
        const stack = document.createElement('div');
        stack.className = 'rr-battle-cards';
        stack.append(...cards);
        stack.addEventListener('rr-section-fold', () => stack.classList.toggle('is-collapsed', cards.every(card => card.classList.contains('is-collapsed'))));
        return stack;
    }

    /** The applicable shared, Tactical and Action cards, each owning its fields and reset. */
    function createSection(options) {
        const names = cardsFor(options.kind);
        if (!names.length) return null;
        const link = recordLink(options);
        const cards = names.map(name => createCard(name, options, link));
        const element = cards.length > 1 ? stackOf(cards) : cards[0];
        for (const redraw of link.redraws) redraw();
        link.place(element);
        return element;
    }

    const api = {
        SHAPES, SIZED, AI, DEFAULT_MOVE, DEFAULT_JUMP, SHAPE_LABELS, KINDS, FILES, DATA_KEYS, LIMITS,
        parse, parseTags, parsePtbs, parseCombat, hasAction, strip, without,
        own, recordTactics, recordCombat, recordCharacter, sourceOf,
        effective, sighted, weaponSkill, weaponTypeReach, scopeDefaults, unitStats,
        PROJECTILES, combatProfile, cooldownOf, comboShares, describeCombat,
        change, reset, convert, differs, put,
        tagsRead, enabledPlugins, scanPluginTags, pluginTags,
        reachCells, areaCells, directionTo, describe, picture, drawGrid,
        CARDS, CARD_HINTS, cardsFor, fightsFor, titleFor, ownTags, ownKeys: ownTags, summarize, cardHtml, reachRow, watchPage, createSection
    };
    root.RRTactics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
