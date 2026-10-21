const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runtimeSource: joinedRuntime } = require('./helpers/runtime-source.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const commandsDir = path.join(editorRoot, 'src', 'event', 'commands');
const runtimeSource = joinedRuntime('reactor_objects.js');

/**
 * Highest `params[n]` index each interpreter command reads, plus one — i.e. the
 * shortest parameter array the runtime can consume without reading undefined.
 */
function runtimeArity() {
    const arity = new Map();
    const header = /Game_Interpreter\.prototype\.command(\d+)\s*=\s*function/g;
    const starts = [];
    let match;
    while ((match = header.exec(runtimeSource)) !== null) {
        starts.push({ at: match.index, code: Number(match[1]) });
    }
    starts.forEach((entry, i) => {
        const body = runtimeSource.slice(entry.at, i + 1 < starts.length ? starts[i + 1].at : undefined);
        const indices = [...body.matchAll(/params\[(\d+)\]/g)].map(m => Number(m[1]));
        arity.set(entry.code, indices.length ? Math.max(...indices) + 1 : 0);
    });
    return arity;
}

/** Number of top-level elements in an array literal's source text. */
function topLevelCount(source) {
    if (source.trim() === '') return 0;
    let depth = 0, count = 1, quote = null;
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (quote) {
            if (char === '\\') { i++; continue; }
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'" || char === '`') quote = char;
        else if ('([{'.includes(char)) depth++;
        else if (')]}'.includes(char)) depth--;
        else if (char === ',' && depth === 0) count++;
    }
    return count;
}

/** Every `{ code: N, indent: …, parameters: [ … ] }` literal a file builds. */
function emittedCommands(source) {
    const found = [];
    const opener = /code:\s*(\d+)\s*,\s*indent:[^,]*,\s*parameters:\s*\[/g;
    let match;
    while ((match = opener.exec(source)) !== null) {
        let depth = 1, i = match.index + match[0].length, quote = null;
        const start = i;
        while (i < source.length && depth > 0) {
            const char = source[i];
            if (quote) {
                if (char === '\\') { i += 2; continue; }
                if (char === quote) quote = null;
            } else if (char === '"' || char === "'" || char === '`') quote = char;
            else if ('([{'.includes(char)) depth++;
            else if (')]}'.includes(char)) depth--;
            i++;
        }
        found.push({
            code: Number(match[1]),
            count: topLevelCount(source.slice(start, i - 1)),
            line: source.slice(0, match.index).split('\n').length
        });
    }
    return found;
}

// Conditional Branch is genuinely variable-length: its parameter array is sized
// by condition type, so a fixed floor does not apply.
const VARIABLE_LENGTH = new Set([111]);

// When Cancel. The interpreter reads nothing from it — command403 branches on
// interpreter state alone — and the corpus holds a single authored instance,
// [6, null], whose leading value matches neither the choice count nor the
// cancel setting. Emitting a guessed number would be worse than emitting none,
// so this stays excluded until there is enough authored data to explain it.
const UNEXPLAINED_SHAPE = new Set([403]);

test('every command editor emits enough parameters for the interpreter to read', () => {
    const arity = runtimeArity();
    const short = [];
    for (const file of fs.readdirSync(commandsDir).filter(name => name.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(commandsDir, file), 'utf8');
        for (const emitted of emittedCommands(source)) {
            if (VARIABLE_LENGTH.has(emitted.code)) continue;
            const needed = arity.get(emitted.code);
            if (needed === undefined) continue;
            if (emitted.count < needed) {
                short.push(`${file}:${emitted.line} code ${emitted.code} emits ${emitted.count}, interpreter reads ${needed}`);
            }
        }
    }
    assert.deepEqual(short, [],
        `the interpreter reads past the end of these parameter arrays:\n${short.join('\n')}`);
});

test('Scroll Map records Wait for Completion', () => {
    // command204 reads params[3] to decide setWaitMode("scroll"); a three-slot
    // array leaves it undefined, so the option could never be on.
    const source = fs.readFileSync(path.join(commandsDir, 'ScrollMapEditor.js'), 'utf8');
    const scroll = emittedCommands(source).find(entry => entry.code === 204);
    assert.ok(scroll, 'the editor builds a 204');
    assert.equal(scroll.count, 4);
    assert.match(source, /this\.wait = !!params\[3\]/, 'and reads the flag back when reopening');
    assert.match(source, /waitCheckbox/, 'and offers a control for it');
});

test('reopening a Scroll Map keeps a wait flag that is already set', () => {
    // The regression that matters is silent: open an imported command, press OK,
    // and the flag disappears because nothing ever read it.
    const source = fs.readFileSync(path.join(commandsDir, 'ScrollMapEditor.js'), 'utf8');
    const readsBack = /params\[3\]/.test(source);
    const writesOut = /this\.speed,\s*\n\s*this\.wait/.test(source);
    assert.ok(readsBack && writesOut, 'the flag survives a load/save round trip');
});

test('a When [Choice] marker carries the choice text, not just its index', () => {
    const source = fs.readFileSync(path.join(commandsDir, 'ShowChoicesCommandEditor.js'), 'utf8');
    assert.match(source, /code:\s*402,[\s\S]{0,80}parameters:\s*\[i,\s*filteredChoices\[i\]\]/);
    const marker = emittedCommands(source).find(entry => entry.code === 402);
    assert.equal(marker.count, 2);
});

test('the command list labels a choice branch with its text', () => {
    const listSource = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    const at = listSource.indexOf('case 402:');
    assert.ok(at >= 0);
    const block = listSource.slice(at, at + 500);
    assert.match(block, /params\[1\]/, 'the stored text is used');
    assert.match(block, /choiceText \|\|/, 'with the ordinal kept as a fallback for older markers');
});

test('the shapes match what RPG Maker itself writes', () => {
    // Parameter lengths observed in authored project data, vendored because the
    // source projects are private; see helpers/derive-authored-data-shapes.cjs.
    const authored = require(path.join(__dirname, 'helpers', 'authored-data-shapes.json'));
    const lengths = authored.commandParameterLengths;

    assert.deepEqual(lengths['402'], [2],
        'every authored When [Choice] stores index and text');
    assert.ok(lengths['204'].includes(4),
        'authored Scroll Map commands carry the wait flag');

    // What the editor emits has to be a length the engine itself produces,
    // otherwise the project stops round-tripping through other tooling.
    const mismatched = [];
    for (const file of fs.readdirSync(commandsDir).filter(name => name.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(commandsDir, file), 'utf8');
        for (const emitted of emittedCommands(source)) {
            if (VARIABLE_LENGTH.has(emitted.code) || UNEXPLAINED_SHAPE.has(emitted.code)) continue;
            const known = lengths[String(emitted.code)];
            if (!known || known.includes(emitted.count)) continue;
            mismatched.push(`${file}:${emitted.line} code ${emitted.code} emits ${emitted.count}, authored data has ${known.join('/')}`);
        }
    }
    assert.deepEqual(mismatched, [], mismatched.join('\n'));
});
