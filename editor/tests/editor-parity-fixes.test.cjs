const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');

/** How the engine turns a tile id into a source rect on the B-E sheet. */
function engineFrame(tileId) {
    return {
        sx: ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * 48,
        sy: (Math.floor((tileId % 256) / 8) % 16) * 48
    };
}

/** The shipped conversion, lifted so the real code is what gets exercised. */
function liftTileConversion() {
    const source = read('src/EventManager.js');
    // Anchor on the definition, not the earlier call sites.
    const at = source.indexOf('\n    convertToTileId(layer, x, y) {');
    assert.ok(at >= 0, 'the conversion is defined');
    const end = source.indexOf('\n    }', at);
    const body = source.slice(source.indexOf('{', at) + 1, end);
    // eslint-disable-next-line no-new-func
    const fn = new Function('layer', 'x', 'y', body);
    return (x, y, layer) => fn.call({}, layer, x, y);
}

test('an event graphic taken from the right half of a B-E palette gets the right tile', () => {
    // TilesetPaletteViewer reports x in 0..15 for the split B-E sheets, and
    // MapEditor folds x>=8 into y+=16. EventManager did not, so every
    // right-half selection was saved as a different tile's id.
    const convert = liftTileConversion();
    const mapEditorFold = (x, y) => (x >= 8 ? (y + 16) * 8 + (x - 8) : y * 8 + x);

    for (const [x, y] of [[8, 0], [9, 3], [15, 15], [12, 7], [3, 2], [0, 0], [7, 15]]) {
        const fromEvent = convert(x, y, 'B', []);
        const fromMap = mapEditorFold(x, y);
        assert.equal(fromEvent, fromMap, `palette B (${x},${y})`);
        assert.deepEqual(engineFrame(fromEvent), engineFrame(fromMap));
    }
});

test('the C, D and E pages keep their base offsets after the fold', () => {
    const convert = liftTileConversion();
    for (const [layer, base] of [['B', 0], ['C', 256], ['D', 512], ['E', 768]]) {
        assert.equal(convert(0, 0, layer, []), base, `${layer} origin`);
        assert.equal(convert(8, 0, layer, []), base + 128, `${layer} right half`);
        assert.equal(convert(15, 15, layer, []), base + 255, `${layer} last tile`);
    }
});

test('plugin command metadata does not overwrite plugin parameter defaults', () => {
    // @default lines inside a @command/@arg block belong to the command
    // argument. Without a reset they landed on the last real @param, so the
    // Plugin Manager wrote wrong defaults into js/plugins.js.
    const source = read('src/PluginManager.js');
    const at = source.indexOf('parsePluginParameters(source) {');
    assert.ok(at >= 0);
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /token\.tag === 'command' \|\| token\.tag === 'arg'/,
        'the parser resets on a command block');
    assert.match(body, /currentParam = null;\s*\n\s*continue;/);

    const metaAt = source.indexOf('parsePluginParameterMetadata(source)');
    assert.ok(metaAt >= 0);
    assert.match(source.slice(metaAt, metaAt + 1500), /token\.tag === 'command'/);
});

test('the two plugin annotation parsers agree on every bundled plugin', () => {
    // Both are lifted from source and run over the real plugin corpus; any
    // parameter where they disagree is a default that would be written wrong.
    const source = read('src/PluginManager.js');
    const lift = signature => {
        const at = source.indexOf(signature);
        assert.ok(at >= 0, signature);
        return source.slice(source.indexOf('{', at) + 1, source.indexOf('\n    }', at));
    };
    const host = {
        normalizeAnnotationLine: new Function('line', lift('normalizeAnnotationLine(line) {'))
    };
    host.cleanAnnotationValue = new Function('value', lift('cleanAnnotationValue(value) {')).bind(host);
    host.splitAnnotationLine = new Function('line', lift('splitAnnotationLine(line) {')).bind(host);
    host.parsePluginParameters = new Function('source', lift('parsePluginParameters(source) {')).bind(host);

    const templates = path.join(repoRoot, 'template', 'Demo', 'js', 'plugins');
    if (!fs.existsSync(templates)) return; // the bundled Demo is the only tracked plugin set

    let scanned = 0;
    for (const file of fs.readdirSync(templates).filter(name => name.endsWith('.js'))) {
        const text = fs.readFileSync(path.join(templates, file), 'utf8');
        if (!/@command\s+/.test(text)) continue;
        scanned++;
        const parsed = host.parsePluginParameters(text);
        // Re-derive with an explicit reset and compare.
        const block = (text.match(/\/\*:([\s\S]*?)\*\//) || [])[0] || '';
        const expected = {};
        let current = null;
        for (const line of block.split('\n')) {
            const tokens = host.splitAnnotationLine(host.normalizeAnnotationLine(line));
            for (const token of tokens) {
                if (token.tag === 'command' || token.tag === 'arg') { current = null; continue; }
                if (token.tag === 'param') { current = token.value || null; continue; }
                if (token.tag === 'default' && current) expected[current] = token.value;
            }
        }
        for (const [key, value] of Object.entries(expected)) {
            assert.equal(parsed[key], value, `${file} :: ${key}`);
        }
    }
    assert.ok(scanned >= 0, `scanned ${scanned} plugins with command blocks`);
});

test('the System 1 music rows target the slots the engine reads', () => {
    // Only Title and Battle are `<type>Bgm`. Victory/Defeat/Game Over are ME
    // (and Game Over is spelled gameoverMe), and vehicle BGM nests inside the
    // vehicle object. Synthesising `<type>Bgm` read six empty slots and wrote
    // six keys nothing consumes.
    const source = read('src/database/DatabaseSystem1Editor.js');
    const at = source.indexOf('static resolveMusicSlot(system, type) {');
    assert.ok(at >= 0, 'the resolver exists');
    const resolve = new Function('system', 'type',
        source.slice(source.indexOf('{', at) + 1, source.indexOf('\n    }', at)));

    const system = {
        titleBgm: { name: 'T' }, battleBgm: { name: 'B' },
        victoryMe: { name: 'V' }, defeatMe: { name: 'D' }, gameoverMe: { name: 'G' },
        boat: { bgm: { name: 'Bo' } }, ship: { bgm: { name: 'Sh' } }, airship: { bgm: { name: 'Ai' } }
    };
    const expected = { title: 'T', battle: 'B', victory: 'V', defeat: 'D', gameOver: 'G', boat: 'Bo', ship: 'Sh', airship: 'Ai' };
    for (const [type, name] of Object.entries(expected)) {
        assert.equal(resolve(system, type).get().name, name, type);
    }

    assert.doesNotMatch(source, /system\[`\$\{type\}Bgm`\]/, 'no synthesised read remains');
    assert.doesNotMatch(source, /system\[`\$\{identifier\}Bgm`\]/, 'no synthesised write remains');
});

test('writing a music slot does not invent a key the engine ignores', () => {
    const source = read('src/database/DatabaseSystem1Editor.js');
    const at = source.indexOf('static resolveMusicSlot(system, type) {');
    const resolve = new Function('system', 'type',
        source.slice(source.indexOf('{', at) + 1, source.indexOf('\n    }', at)));

    const system = {};
    resolve(system, 'victory').ensure().name = 'Jingle';
    assert.equal(system.victoryMe.name, 'Jingle');
    assert.equal('victoryBgm' in system, false);

    resolve(system, 'gameOver').ensure().name = 'Over';
    assert.equal(system.gameoverMe.name, 'Over', 'lowercase, as System.json spells it');

    resolve(system, 'boat').ensure().name = 'Sail';
    assert.equal(system.boat.bgm.name, 'Sail');
    assert.equal('boatBgm' in system, false);
});

test('a new animation declares how it displays over multiple targets', () => {
    const ui = read('src/DatabaseEditorUI.js');
    assert.match(ui, /animations: \{[^}]*displayType: 0/);
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /animation\.displayType === 0/,
        'the engine tests it strictly, so it cannot be absent');
});

test('the trait and effect tables refresh against an element that exists', () => {
    // `.database-detail-panel` is created nowhere; the pane is #database-detail.
    // The refresh was a silent no-op, so the table kept showing stale rows and a
    // second Delete removed a row the user had not selected.
    for (const file of ['DatabaseSkillEditor.js', 'DatabaseItemEditor.js', 'DatabaseWeaponEditor.js',
        'DatabaseArmorEditor.js', 'DatabaseStateEditor.js']) {
        const source = read(path.join('src', 'database', file));
        assert.doesNotMatch(source, /querySelector\('\.database-detail-panel'\)/, file);
        assert.match(source, /getElementById\('database-detail'\)/, file);
    }
    const html = read('index.html');
    assert.match(html, /id="database-detail"/);
    assert.equal(/class="database-detail-panel"/.test(html), false,
        'the class the old selector looked for really does not exist');
});
