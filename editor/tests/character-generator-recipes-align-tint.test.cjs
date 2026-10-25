// Character Generator (2026-10-23): swatches show the colors Tint All makes, walking sheets are always
// bottom-aligned, and each saved sheet keeps a recipe so the character can be opened again.
// Also the sprite animation's Fill Frames from Sheet helpers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const cgDir = path.join(editorRoot, 'src', 'forge', 'CharacterGenerator');
const read = file => fs.readFileSync(file, 'utf8');

function loadGenerator(registry, extra = {}) {
    const context = {
        console, process, require, window: { addEventListener() {}, removeEventListener() {} }, RR_CHARACTER_REGISTRY: registry,
        RRDialog: { alert: () => {}, confirm: async () => true },
        ...extra
    };
    vm.createContext(context);
    vm.runInContext(read(path.join(cgDir, 'helpers', 'pixel.js')), context);
    vm.runInContext(read(path.join(cgDir, 'helpers', 'palette.js')), context);
    vm.runInContext(read(path.join(cgDir, 'helpers', 'palette_resolve.js')), context);
    vm.runInContext(read(path.join(cgDir, 'CharacterRenderer.js')) + '\n;globalThis.CharacterRenderer = CharacterRenderer;', context);
    vm.runInContext(read(path.join(cgDir, 'CharacterGenerator.js')) + '\n;globalThis.CharacterGenerator = CharacterGenerator;', context);
    return context;
}

const body = {
    id: 'body-psychronic-test', category: 'body', tags: ['male', 'psychronic'], params: [], draw() {},
    template: { palette: { A: { hex: '#ff0000', material: 'cloth' }, B: { hex: '#00ff00' }, C: '#0000ff' }, sheet: [] }
};

test('Tint All: the per-letter swatches show the colors the sheet is drawn with', () => {
    const context = loadGenerator([body]);
    const generator = new context.CharacterGenerator();
    const before = generator._effectivePaletteHexes(body.id);
    assert.deepEqual({ ...before }, { A: '#FF0000', B: '#00FF00', C: '#0000FF' });
    generator.partParams[body.id] = { tintAll: '#808080' };
    const tinted = generator._effectivePaletteHexes(body.id);
    for (const letter of ['A', 'B', 'C']) assert.notEqual(tinted[letter], before[letter], `${letter} follows the tint`);
    generator.partParams[body.id].paletteOverrides = { B: '#123456' };
    assert.equal(generator._effectivePaletteHexes(body.id).B, '#123456', 'a letter set by hand keeps its own color');
    const source = read(path.join(cgDir, 'CharacterGenerator.js'));
    assert.match(source, /const val = paletteOverrides\[letter\] \|\| effectivePalette\[letter\] \|\| baseHex;/, 'the panel draws the drawn color');
    assert.match(source, /if \(!isPaletteKey\) this\._refreshPaletteSwatches\(partId, swatchEl\);/, 'a Tint All change repaints the swatches at once');
});

test('walking sheets are always bottom-aligned, whatever a saved config says', () => {
    const context = loadGenerator([body]);
    const generator = new context.CharacterGenerator();
    assert.equal(generator.templateAlignY, 'bottom');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forge-deploy-cg-'));
    try {
        fs.mkdirSync(path.join(dir, 'forge', 'character_generator'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'forge', 'character_generator', 'config.json'), JSON.stringify({ templateAlignY: 'middle', templateAlignX: 'left' }));
        generator._syncProjectPath = () => dir;
        generator._loadConfig();
        assert.equal(generator.templateAlignY, 'bottom');
        assert.equal(generator.templateAlignX, 'left', 'Align X is still the author\'s');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    const source = read(path.join(cgDir, 'CharacterGenerator.js'));
    assert.doesNotMatch(source, /rr-cgp-align-y/, 'no Align Y control');
});

test('a saved sheet keeps a recipe beside it, and opening it rebuilds the character', () => {
    const hair = { id: 'hair-psychronic-test', category: 'hair', tags: ['male', 'psychronic'], params: [], draw() {} };
    const context = loadGenerator([body, hair]);
    const generator = new context.CharacterGenerator();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forge-deploy-recipe-'));
    try {
        fs.mkdirSync(path.join(dir, 'img', 'characters'), { recursive: true });
        generator._syncProjectPath = () => dir;
        generator._saveConfig = () => {};
        let rendered = 0;
        generator._render = () => { rendered++; };
        generator.activeLayerOrder = [body.id, hair.id, 'gone-part'];
        generator.activePartIds = new Set(generator.activeLayerOrder);
        generator.hiddenPartIds = new Set([hair.id]);
        generator.partParams = { [body.id]: { tintAll: '#336699', paletteOverrides: { A: '#111111' } } };
        generator.gender = 'female';
        generator.templateAlignX = 'right';
        const png = path.join(dir, 'img', 'characters', '$Hero.png');
        generator._writeRecipe(png, generator._proceduralRecipe());
        const recipePath = path.join(dir, 'img', 'characters', '$Hero.character.json');
        assert.ok(fs.existsSync(recipePath), 'the recipe sits beside the sheet');
        assert.deepEqual(generator._savedRecipes().map(r => r.name), ['$Hero']);

        const fresh = new context.CharacterGenerator();
        fresh._syncProjectPath = () => dir;
        fresh._saveConfig = () => {};
        fresh._render = () => { rendered++; };
        const statuses = [];
        fresh._setTemplateStatus = (message, isError) => statuses.push([message, isError]);
        fresh._openRecipe(recipePath);
        assert.deepEqual([...fresh.activeLayerOrder], [body.id, hair.id], 'a part that is no longer installed is left out');
        assert.deepEqual([...fresh.hiddenPartIds], [hair.id]);
        assert.equal(fresh.partParams[body.id].tintAll, '#336699');
        assert.equal(fresh.partParams[body.id].paletteOverrides.A, '#111111');
        assert.equal(fresh.gender, 'female');
        assert.equal(fresh.templateAlignX, 'right');
        assert.equal(fresh.activeTab, 'procedural');
        assert.match(statuses[0][0], /Opened \$Hero\.png\. 1 part\(s\) it used are not installed\./);
        assert.equal(statuses[0][1], true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    const source = read(path.join(cgDir, 'CharacterGenerator.js'));
    assert.match(source, /fs\.writeFileSync\(outPath, Buffer\.from\(base64, 'base64'\)\);\n\s*this\._writeRecipe\(outPath, this\._proceduralRecipe\(\)\);/);
    assert.match(source, /fs\.writeFileSync\(outPath, Buffer\.from\(b64, 'base64'\)\);\n\s*this\._writeRecipe\(outPath, this\._partsRecipe\(\)\);/);
    assert.equal((source.match(/class="rr-cg-open-recipe rr-select"/g) || []).length, 2, 'both save footers can open one');
});

test('Fill Frames from Sheet: one frame per used cell, centered, at full size', () => {
    const source = read(path.join(editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'));
    const context = { console, window: {}, document: {}, module: undefined };
    vm.createContext(context);
    vm.runInContext(source + '\n;globalThis.E = DatabaseAnimationEditor;', context);
    const E = context.E;
    assert.deepEqual(JSON.parse(JSON.stringify(E.framesFromSheetCells(3))), [
        [[0, 0, 0, 100, 0, 0, 255, 1]], [[1, 0, 0, 100, 0, 0, 255, 1]], [[2, 0, 0, 100, 0, 0, 255, 1]]
    ]);
    assert.equal(E.framesFromSheetCells(250).length, 100, 'a sheet has at most 100 patterns');
    // 5 x 3 cells; cells 0..6 drawn, 7 empty, 8 drawn, the rest empty: the last drawn cell decides.
    const drawn = new Set([0, 1, 2, 3, 4, 5, 6, 8]);
    const alphaAt = (x, y) => drawn.has(Math.floor(y / 192) * 5 + Math.floor(x / 192));
    assert.equal(E.usedSheetCells(960, 576, alphaAt), 9);
    assert.equal(E.usedSheetCells(960, 100, alphaAt), 0, 'shorter than one row: no cell');
    assert.match(source, /id="fill-frames-btn"/);
    assert.match(source, /saveState\(\);\n\s*animation\.frames = DatabaseAnimationEditor\.framesFromSheetCells\(count\);/, 'the fill can be undone');
});
