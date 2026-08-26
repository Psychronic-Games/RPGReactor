const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(editorRoot, 'src');

// Files whose loss costs the user their work. FsAtomic.js names these in its
// own header as the reason it exists.
const CRITICAL = [
    'System.json', 'MapInfos.json', 'Tilesets.json', 'Actors.json', 'Classes.json',
    'Skills.json', 'Items.json', 'Weapons.json', 'Armors.json', 'Enemies.json',
    'Troops.json', 'States.json', 'Animations.json', 'CommonEvents.json', 'UserInterfaces.json',
    'project.rpgreactor', 'plugins.js', 'reactor_plugins.js'
];
const CRITICAL_PATTERNS = [
    /Map\$\{[^}]*\}\.json/, /Map\d*['"`]\s*\+/, /mapFileName/i, /tilesetsPath/, /mapPath/,
    /Test_['"] \+ filename/
];

function sourceFiles() {
    const found = [];
    const walk = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (full.includes(path.join('CharacterGenerator', 'styles'))) continue;
                walk(full);
            } else if (entry.name.endsWith('.js')) {
                found.push(full);
            }
        }
    };
    walk(srcRoot);
    return found;
}

/** The statement a writeFileSync call sits in, roughly: its own line plus context. */
function writeCalls(text) {
    const calls = [];
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (!/\bwriteFileSync\s*\(/.test(line)) return;
        // The path may be built on preceding lines (const tilesetsPath = …).
        const context = lines.slice(Math.max(0, index - 6), index + 3).join('\n');
        calls.push({ line: index + 1, text: line, context });
    });
    return calls;
}

function targetsCriticalData(call) {
    if (CRITICAL.some(name => call.text.includes(name))) return true;
    if (CRITICAL_PATTERNS.some(pattern => pattern.test(call.text))) return true;
    // A bare variable name resolved just above the call.
    const variable = call.text.match(/writeFileSync\s*\(\s*(?:this\.fs\s*,\s*)?([A-Za-z_$][\w$]*)/);
    if (!variable) return false;
    const assigned = new RegExp(`\\b${variable[1]}\\s*=[^;\\n]*`, 'g');
    const assignments = call.context.match(assigned) || [];
    return assignments.some(text =>
        CRITICAL.some(name => text.includes(name)) || CRITICAL_PATTERNS.some(p => p.test(text)));
}

/** A write is safe if it is the fallback inside an _writeFileAtomic wrapper. */
function isAtomicFallback(call) {
    return /_writeFileAtomic\s*\(\s*fs\s*,\s*filePath/.test(call.context)
        || /function[\s\S]{0,80}writeFileAtomicSync/.test(call.context)
        || /const atomic =/.test(call.context);
}

test('the atomic writer exists and renames into place', () => {
    const source = fs.readFileSync(path.join(srcRoot, 'utils', 'FsAtomic.js'), 'utf8');
    assert.match(source, /renameSync/, 'the destination is replaced by a rename');
    assert.match(source, /fsyncSync/, 'and the contents are flushed before it');
    assert.match(source, /window\.RRWriteFileAtomicSync = writeFileAtomicSync/);
});

test('no critical project file is written with a plain truncate-in-place write', () => {
    // A plain writeFileSync truncates first, so a crash, kill, or full disk
    // between truncate and write destroys the previous good file as well.
    const offenders = [];
    for (const file of sourceFiles()) {
        const text = fs.readFileSync(file, 'utf8');
        for (const call of writeCalls(text)) {
            if (/_writeFileAtomic|RRWriteFileAtomicSync|writeFileAtomicSync/.test(call.text)) continue;
            if (isAtomicFallback(call)) continue;
            if (!targetsCriticalData(call)) continue;
            offenders.push(`${path.relative(editorRoot, file)}:${call.line} ${call.text.trim()}`);
        }
    }
    assert.deepEqual(offenders, [],
        `route these through _writeFileAtomic:\n${offenders.join('\n')}`);
});

test('the tileset database is written atomically', () => {
    // Tilesets.json is the largest database file — an 8192-entry flags array per
    // tileset — so it has the widest window for a partial write.
    const source = fs.readFileSync(path.join(srcRoot, 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(source, /this\._writeFileAtomic\(this\.fs, tilesetsPath, compactJson\)/);
    assert.doesNotMatch(source, /this\.fs\.writeFileSync\(tilesetsPath/);
    assert.match(source, /_writeFileAtomic\(fs, filePath, data, options\)/, 'via the shared wrapper');
});

test('battle test setup does not risk System.json', () => {
    const source = fs.readFileSync(path.join(srcRoot, 'database', 'BattleTestConfigModal.js'), 'utf8');
    assert.match(source, /this\._writeFileAtomic\(fs, path\.join\(dataDir, 'System\.json'\)/);
    assert.doesNotMatch(source, /fs\.writeFileSync\(path\.join\(dataDir, 'System\.json'\)/);
});

test('every wrapper degrades to a plain write when rename is unavailable', () => {
    // Test mocks and the web host shim have no renameSync; the wrapper must not
    // throw there, it must just lose the atomicity guarantee.
    const wrappers = sourceFiles()
        .map(file => ({ file, text: fs.readFileSync(file, 'utf8') }))
        .filter(entry => /_writeFileAtomic\s*\(fs, filePath, data, options\)\s*\{/.test(entry.text));
    assert.ok(wrappers.length >= 5, `wrappers are found (${wrappers.length})`);
    for (const { file, text } of wrappers) {
        const at = text.indexOf('_writeFileAtomic(fs, filePath, data, options) {');
        const body = text.slice(at, at + 500);
        assert.match(body, /typeof fs\.renameSync === 'function'/, path.relative(editorRoot, file));
        assert.match(body, /fs\.writeFileSync\(filePath, data, options\)/, path.relative(editorRoot, file));
    }
});
