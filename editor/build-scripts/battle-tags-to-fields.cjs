#!/usr/bin/env node
/**
 * Moves a project's battle settings out of its records' Notes and into the
 * records themselves.
 *
 *   node editor/build-scripts/battle-tags-to-fields.cjs <project folder> [--write] [--json]
 *
 * Without `--write` it prints, file by file and record by record, what it
 * would move, and changes nothing. With `--write` it moves them, all or
 * nothing: every file is read and planned first, and when one of them cannot
 * be read, is not UTF-8 JSON, or cannot be written, no file is written and
 * each such file is named (exit 1). Run it on a copy first.
 *
 * `--write` also refuses, with a sentence and its own exit code:
 *   3  a project whose `.rpgreactor.lock` names a running editor (that file
 *      is all it checks: close the project there first);
 *   4  a project whose engine copy does not read settings kept in a record
 *      (`js/reactor_fight_tactical.js` is from before them): the moved
 *      settings would be lost in play. Open the project in the editor once,
 *      which refreshes its engine. Without `--write` the same is a warning.
 *
 * What moves: the tags a battle on the map reads, each on the kind of record
 * the game reads it on, into the record's `rrBattle`:
 *
 *   <range: 2-5>  <area: cone 3>  <los: no>      skills, items, weapons     range, area, los
 *   <move: 5>  <jump: 2>                         actors, classes, enemies,  move, jump
 *                                                weapons, armors, states
 *   <ai: ranged>                                 actors, enemies            ai
 *   <fire rate: 4>  <magazine: 8>  <reload: 1.5>
 *   <spread: 3>  <combo: 4>  <projectile: bolt>  weapons                    fireRate, magazine, reload, spread, combo, projectile
 *   <cooldown: 6>                                skills, items              cooldown
 *   <unit character: Name, index>                enemies                    character
 *
 * The game reads a record's own setting before the tag of the same name, so
 * a moved setting plays as its tag did. What stays where it is:
 *   - a tag one of the project's own enabled plugins reads (an entry of
 *     `js/reactor_plugins.js`, or `js/plugins.js`, that is switched on and
 *     has its file in `js/plugins`, whose source holds a note-tag pattern
 *     for that tag's name or takes it from `meta`): listed with the plugin;
 *   - a tag the game reads nothing from (a misspelled one, one on a kind of
 *     record that has no use for it);
 *   - a PSYCHRONIC_PTBS block, and every other line of the Note, with the
 *     line ends it has.
 * A tag the record's own setting already stands over only leaves the Note.
 * Records with nothing to move are not rewritten: in a file of one record a
 * line (the way the editor and RPG Maker write them) only the lines of the
 * records that changed change. A file keeps its mode, and one that is a link
 * is written through to what it points at. Run twice, the second run finds
 * nothing.
 *
 * The same code is what the Database's battle cards use
 * (src/database/TacticsSection.js, `convert`).
 */
const fs = require('node:fs');
const path = require('node:path');

// The editor's own folder: editor/ in a source checkout, the app folder in a packaged editor.
const APP = path.resolve(__dirname, '..');
const T = require(path.join(APP, 'src', 'database', 'TacticsSection.js'));
const RRJson = require(path.join(APP, 'src', 'utils', 'JsonFiles.js'));

const ORDER = ['Actors.json', 'Classes.json', 'Skills.json', 'Items.json', 'Weapons.json', 'Armors.json', 'Enemies.json', 'States.json'];
const ENGINE = path.join('js', 'reactor_fight_tactical.js');
const DRAFT = '.tags-to-fields.tmp';

/** A setting in a few words, for a person to read. */
function said(key, value) {
    if (value === undefined) return 'the record\'s own setting already stands: the tag only leaves the Note';
    if (key === 'range') return `range ${value.min}-${value.max}`;
    if (key === 'area') return `area ${value.shape}${value.size === undefined ? '' : ' ' + value.size}`;
    if (key === 'character') return `character ${value.name}, ${value.index}`;
    return `${key} ${value}`;
}

/**
 * A database file's text with the records of `changed` (index -> record) in
 * place of the ones it holds. A file of one record a line keeps every other
 * line as it is, with its own line ends; any other layout is written again
 * whole, the way the editor writes it (`whole: true`).
 */
function rewrite(source, list, changed) {
    const eol = /\r\n/.test(source) ? '\r\n' : '\n';
    const lines = source.split(eol);
    const body = lines.slice(1, lines.length - (lines[lines.length - 1] === '' ? 2 : 1));
    const framed = /^\uFEFF?\[$/.test(lines[0]) && body.length === list.length
        && body.every((line, index) => line.endsWith(',') === (index < body.length - 1));
    if (framed) {
        let fits = true;
        for (const index of Object.keys(changed)) {
            const at = 1 + Number(index), line = lines[at], comma = line.endsWith(',');
            // The line must be the record it is taken for.
            let held;
            try { held = JSON.parse(comma ? line.slice(0, -1) : line); } catch (error) { held = undefined; }
            if (!held || held.id !== list[index].id) { fits = false; break; }
            lines[at] = JSON.stringify(changed[index]) + (comma ? ',' : '');
        }
        if (fits) return { text: lines.join(eol), whole: false };
    }
    const next = list.map((record, index) => (changed[index] ? changed[index] : record));
    return { text: (source.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '') + RRJson.stringify(next), whole: true };
}

/** Why a file could not be read, in words. */
function unreadable(error) {
    if (error && error.code === 'EACCES') return 'cannot be read (no permission)';
    if (error && error.code === 'EISDIR') return 'is a folder, not a file';
    return `cannot be read (${(error && error.code) || (error && error.message) || 'unknown reason'})`;
}

/**
 * One database file, read and planned; nothing is written here. `{ file,
 * kind, target, mode, records, text, whole, problem }`: `records` are the
 * ones with a tag to move or to leave, `{ id, name, moved, left, before,
 * after }` (`moved` and `left` as `RRTactics.convert` gives them, `before`
 * and `after` the record's Note and `rrBattle`); `text` is what the file
 * holds afterward (null when nothing moves); `target` the file itself, or
 * what it links to; `problem` why it cannot be converted ('not there' for a
 * file the project does not have, which is none).
 */
function convertFile(filePath, kind, context) {
    const out = { file: path.basename(filePath), kind, target: filePath, mode: 0, records: [], text: null, whole: false, problem: '' };
    let raw;
    try {
        out.target = fs.realpathSync(filePath);
        out.mode = fs.statSync(out.target).mode & 0o7777;
        raw = fs.readFileSync(out.target);
    } catch (error) {
        out.problem = error && error.code === 'ENOENT' ? 'not there' : unreadable(error);
        return out;
    }
    // The editor and the game read these files as UTF-8: anything else is left for a person to look at.
    if ((raw[0] === 0xFF && raw[1] === 0xFE) || (raw[0] === 0xFE && raw[1] === 0xFF)) { out.problem = 'is UTF-16 text, not UTF-8'; return out; }
    const marked = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
    let source, list;
    try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(marked ? raw.subarray(3) : raw); } catch (error) { out.problem = 'is not UTF-8 text'; return out; }
    try { list = JSON.parse(source); } catch (error) { out.problem = `is not JSON (${error.message})`; return out; }
    if (!Array.isArray(list)) { out.problem = 'is not a list of records'; return out; }
    const changed = {};
    list.forEach((record, index) => {
        if (!record || typeof record !== 'object') return;
        const done = T.convert(kind, record, context);
        if (!done.moved.length && !done.left.length) return;
        const next = Object.assign({}, record);
        if (done.moved.length) { T.put(next, done); changed[index] = next; }
        out.records.push({ id: record.id, name: record.name || '', moved: done.moved, left: done.left,
            before: { note: record.note, rrBattle: record.rrBattle }, after: { note: next.note, rrBattle: next.rrBattle } });
    });
    if (!Object.keys(changed).length) return out;
    // The byte order mark a Windows tool may have left is kept.
    const written = rewrite((marked ? '\uFEFF' : '') + source, list, changed);
    out.text = written.text;
    out.whole = written.whole;
    return out;
}

/**
 * Who holds the project open, in words, or '' when nobody does: the editor
 * leaves `.rpgreactor.lock` with its process id while a project is open. A
 * lock whose process has gone holds nothing.
 */
function heldBy(project) {
    const lock = path.join(project, '.rpgreactor.lock');
    let pid = 0;
    try { pid = Number(JSON.parse(fs.readFileSync(lock, 'utf8')).pid) || 0; } catch (error) { return ''; }
    if (!(pid > 0)) return '';
    try { process.kill(pid, 0); } catch (error) { if (!error || error.code !== 'EPERM') return ''; }
    return `an editor (process ${pid}) has this project open (${lock})`;
}

/**
 * Why the project's own engine copy would not play moved settings, in
 * words, or '' when it would: its `js/reactor_fight_tactical.js` must be one
 * that reads `rrBattle`.
 */
function oldEngine(project) {
    let source = null;
    try { source = fs.readFileSync(path.join(project, ENGINE), 'utf8'); } catch (error) { source = null; }
    if (source !== null && source.includes('rrBattle')) return '';
    return `this project's engine copy does not read settings kept in a record (${ENGINE.split(path.sep).join('/')} is ${source === null ? 'missing' : 'from before them'}): `
        + 'moved settings would be lost in play. Open the project in the editor once, which refreshes its engine, then run this again';
}

/** Whether a file and the folder it stands in can be written; '' or why not, in words. */
function unwritable(target) {
    try { fs.accessSync(target, fs.constants.W_OK); } catch (error) { return 'cannot be written (the file is read-only)'; }
    try { fs.accessSync(path.dirname(target), fs.constants.W_OK); } catch (error) { return 'cannot be written (its folder is read-only)'; }
    return '';
}

/**
 * Every database file of a project. `{ files, moved, records, left,
 * written, warnings, refused }`: `files` as convertFile gives them (the
 * eight kinds of record, in the Database's order), `moved` the tags that
 * move, `records` the records they are in, `left` the tags that stay for a
 * plugin, `written` the files written. Without `write` nothing is written.
 * With it, either every file that changes is written or none is: `refused`
 * then says why, `{ code, why: [sentences] }` (3 an editor has it open, 4
 * the project's engine copy is too old, 1 a file cannot be read, converted
 * or written).
 */
function convertProject(project, options = {}) {
    const data = path.join(project, 'data');
    const out = { files: [], moved: 0, records: 0, left: 0, written: [], warnings: [], refused: null, pluginTags: {} };
    const engine = oldEngine(project);
    if (engine) out.warnings.push(engine);
    if (options.write) {
        const holder = heldBy(project);
        // An open editor would save its own copy of the records over what is written here, or lose what it has unsaved.
        if (holder) { out.refused = { code: 3, why: [`${holder}. Close the project there first, or run without --write to see what would move`] }; return out; }
        if (engine) { out.refused = { code: 4, why: [engine] }; return out; }
    }
    // The tags the project's own plugins read stay in the Notes for them.
    out.pluginTags = T.scanPluginTags(project, { fs, path });
    const context = { pluginTags: out.pluginTags };
    for (const name of ORDER) {
        const file = convertFile(path.join(data, name), T.FILES[name], context);
        out.files.push(file);
        for (const record of file.records) {
            if (record.moved.length) out.records++;
            out.moved += record.moved.length;
            out.left += record.left.length;
        }
    }
    if (!options.write) return out;
    // All or nothing: one file that cannot be read, converted or written, and none is.
    const why = out.files.filter(file => file.problem && file.problem !== 'not there').map(file => `data/${file.file} ${file.problem}`);
    const changing = out.files.filter(file => file.text !== null);
    for (const file of changing) { const reason = unwritable(file.target); if (reason) why.push(`data/${file.file} ${reason}`); }
    if (why.length) { out.refused = { code: 1, why }; return out; }
    // Every new file is first written beside the old one; only when all of them are there do they take the old ones' places.
    const drafts = [];
    try {
        for (const file of changing) {
            const draft = file.target + DRAFT;
            drafts.push(draft);
            fs.writeFileSync(draft, file.text, 'utf8');
            fs.chmodSync(draft, file.mode);
        }
    } catch (error) {
        for (const draft of drafts) { try { fs.unlinkSync(draft); } catch (gone) { /* it was never made */ } }
        out.refused = { code: 1, why: [`a file could not be written (${(error && error.code) || (error && error.message)}): ${path.basename(drafts[drafts.length - 1], DRAFT)}`] };
        return out;
    }
    changing.forEach((file, index) => {
        fs.renameSync(drafts[index], file.target);
        out.written.push(file.file);
    });
    return out;
}

module.exports = { APP, convertProject, convertFile, rewrite, said, heldBy, oldEngine };

if (require.main === module) {
    const args = process.argv.slice(2), write = args.includes('--write'), json = args.includes('--json');
    const unknown = args.filter(arg => arg.startsWith('--') && !['--write', '--json'].includes(arg));
    const [project, extra] = args.filter(arg => !arg.startsWith('--'));
    if (!project || extra !== undefined || unknown.length) { console.error('usage: battle-tags-to-fields.cjs <project folder> [--write] [--json]'); process.exit(2); }
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) { console.error(`not a project: ${project} (no data/System.json)`); process.exit(2); }
    let done;
    try {
        done = convertProject(project, { write });
    } catch (error) {
        // Whatever went wrong while files were taking their places: said in a sentence.
        console.error(`stopped: ${(error && error.message) || error}. Look at the project's data folder before running this again.`);
        process.exit(1);
    }
    const lost = done.files.filter(file => file.problem && file.problem !== 'not there');
    if (json) {
        console.log(JSON.stringify({ project, write, moved: done.moved, records: done.records, left: done.left, written: done.written, warnings: done.warnings,
            refused: done.refused || undefined, pluginTags: done.pluginTags,
            files: done.files.map(file => ({ file: file.file, kind: file.kind, problem: file.problem || undefined, whole: file.whole || undefined, records: file.records })) }, null, 1));
        process.exit(done.refused ? done.refused.code : lost.length ? 1 : 0);
    }
    if (done.refused && done.refused.code !== 1) { console.error(`nothing was changed: ${done.refused.why[0]}.`); process.exit(done.refused.code); }
    if (!write) for (const warning of done.warnings) console.log(`warning: ${warning}. With --write this project is refused until then.`);
    for (const file of done.files) {
        if (file.problem === 'not there') continue;
        if (file.problem) { console.log(`data/${file.file}: ${file.problem}; left as it is`); continue; }
        if (!file.records.length) continue;
        console.log(`data/${file.file}${file.whole ? ' (not one record a line: written again whole, as the editor writes it)' : ''}`);
        for (const record of file.records) {
            console.log(`  ${String(record.id).padStart(4, '0')} ${record.name}`);
            for (const each of record.moved) console.log(`       ${each.tag}  ->  ${said(each.key, each.value)}`);
            for (const each of record.left) console.log(`       ${each.tag}  stays: the plugin ${each.plugin} reads it`);
        }
    }
    const stays = done.left ? ` ${done.left} tag(s) stay in their Notes for the plugins that read them.` : '';
    if (done.refused) {
        console.error(`nothing was changed: ${done.refused.why.join('; ')}.`);
        process.exit(1);
    }
    if (!done.moved) console.log(`Nothing to move: no record keeps a battle setting in its Note${done.left ? ' but for those a plugin reads' : ''}.${stays}`);
    else if (write) console.log(`Moved ${done.moved} tag(s) in ${done.records} record(s); wrote ${done.written.map(name => 'data/' + name).join(', ')}.${stays}`);
    else console.log(`${done.moved} tag(s) in ${done.records} record(s) would move.${stays} Nothing was changed: run again with --write to move them.`);
    process.exit(lost.length ? 1 : 0);
}
