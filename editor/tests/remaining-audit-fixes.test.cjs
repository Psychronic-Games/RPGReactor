const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');

test('Set Event Location exchange writes the character the engine reads', () => {
    // command203 uses params[2] as the OTHER character and params[4] as the
    // direction. The editor stored params[2] as a map id, invented an event id
    // from params[3], and emitted only four parameters — dropping direction.
    const source = read('src/event/commands/SetEventLocationEditor.js');
    assert.doesNotMatch(source, /this\.mapId = params\[2\]/, 'no map id is parsed from that slot');
    assert.match(source, /this\.exchangeCharacterId = params\[2\] \?\? 0;/);
    assert.match(source, /params\.push\(this\.exchangeCharacterId, 0, this\.direction\)/);

    const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(objects, /const character2 = this\.character\(params\[2\]\);/);
    assert.match(objects, /if \(params\[4\] > 0\) \{\s*\n\s*character\.setDirection\(params\[4\]\);/);
});

test('an authored exchange command round-trips unchanged', () => {
    const source = read('src/event/commands/SetEventLocationEditor.js');
    const at = source.indexOf('        const params = [this.characterId, this.type];');
    assert.ok(at >= 0);
    const body = source.slice(at, source.indexOf('\n    }', at));
    const build = new Function(`${body.replace('return {', 'this.__out = {')}\nreturn this.__out;`);

    // The only two authored type-2 commands in the bundled projects.
    for (const authored of [[4, 2, 54, 0, 0], [54, 2, 51, 0, 0]]) {
        const loaded = {
            characterId: authored[0], type: 2,
            exchangeCharacterId: authored[2], direction: authored[4]
        };
        assert.deepEqual(Array.from(build.call(loaded).parameters), authored);
    }
});

test('every odd A1 kind uses the waterfall table, as the engine does', () => {
    // The export path gated the table on Math.floor(tx / 4) === 1, which is
    // false for kinds 9 and 11 — 2,149 and 74 placements in the corpus. They
    // sampled the floor table's rects and drew a different band of the sheet.
    const tilemap = read('src/TilemapManager.js');
    assert.doesNotMatch(tilemap, /Only E-type waterfalls \(tx=4-7\) use waterfall table/);
    assert.doesNotMatch(tilemap, /if \(Math\.floor\(tx \/ 4\) === 1\) \{\s*\n\s*autotileTable = this\.WATERFALL_AUTOTILE_TABLE;/);

    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    assert.match(core, /bx \+= 6;\s*\n\s*autotileTable = Tilemap\.WATERFALL_AUTOTILE_TABLE;/,
        'the engine picks it unconditionally');

    // All three editor paths now agree with the engine.
    const picks = tilemap.match(/autotileTable = this\.WATERFALL_AUTOTILE_TABLE;/g) || [];
    assert.ok(picks.length >= 3, `every render path selects it (${picks.length})`);
});

test('the bucket still floods when the eraser is on', () => {
    // eraseFillArea is implemented and correct but was unreachable: the eraser
    // branch claimed the click before the fill branch could run.
    const source = read('src/MapEditor.js');
    assert.match(source, /this\.currentTool !== 'circle' && this\.currentTool !== 'fill'/);
    assert.match(source, /eraseFillArea/, 'the flood-erase implementation is still present');
});

test('keyboard shortcuts are not gated on NW.js as a whole', () => {
    // Only F5/F11/F12 need NW. The early return also removed Ctrl+S, Ctrl+Z/Y,
    // Ctrl+C/X/V and Delete, leaving the web editor with none at all.
    const source = read('src/UIManager.js');
    const at = source.indexOf('setupKeyboardShortcuts() {');
    const head = source.slice(at, at + 500);
    assert.doesNotMatch(head, /if \(typeof nw === 'undefined'\) return;/);
    assert.match(head, /const hasNw = typeof nw !== 'undefined';/);
    assert.match(source, /if \(!hasNw\) return false;\s*\n\s*if \(!e\.repeat\) nw\.Window\.get\(\)\.toggleFullscreen\(\)/);
    assert.match(source, /const win = typeof nw !== 'undefined' \? nw\.Window\.get\(\) : null;/,
        'and the reload path degrades to location.reload');
});

test('the loop toggle reaches the element that is playing', () => {
    const source = read('src/AudioPlayer.js');
    const at = source.indexOf('toggleLoop() {');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /this\.setChannelLoop\(channel, this\.audioPlayer\.loop\)/);
});

test('saved sidebar sizes are re-applied once sections become visible', () => {
    // loadSavedSizes runs once at startup and skips display:none sections —
    // which every id-bearing section is before a project opens — so the sizes
    // were written to localStorage and then always discarded.
    const source = read('src/SidebarResizer.js');
    const at = source.indexOf('refresh() {');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /this\.loadSavedSizes\(\);/);
    // Order matters: initializeSectionFlexValues would otherwise overwrite them.
    assert.ok(body.indexOf('initializeSectionFlexValues') < body.indexOf('loadSavedSizes'));
});

test('an imported character sheet gets one cell size for every frame', () => {
    // Rounding each cell boundary independently made adjacent cells differ by a
    // pixel whenever the sheet was not divisible by 3x4, and the renderer
    // left-aligns short rows instead of centring them.
    const source = read('src/forge/CharacterGenerator/CharacterGenerator.js');
    assert.match(source, /const cellPixelW = Math\.max\(1, Math\.round\(crop\.cellW\)\);/);
    assert.match(source, /const cellPixelH = Math\.max\(1, Math\.round\(crop\.cellH\)\);/);
    assert.doesNotMatch(source, /w: Math\.max\(1, Math\.min\(source\.width - x0, x1 - x0\)\)/);

    const widthsFor = (W, H) => {
        const cellW = W / 3, cellH = H / 4;
        const cellPixelW = Math.max(1, Math.round(cellW));
        const widths = new Set();
        for (let dir = 0; dir < 4; dir++) {
            for (let frame = 0; frame < 3; frame++) {
                const x0 = Math.round(frame * cellW);
                widths.add(Math.max(1, Math.min(W - x0, cellPixelW)));
            }
        }
        return widths;
    };
    for (const [W, H] of [[100, 140], [110, 150], [98, 132], [122, 160], [50, 80], [144, 192]]) {
        assert.equal(widthsFor(W, H).size, 1, `${W}x${H} frame widths`);
    }
});

test('normalizing a sheet actually equalises frame heights', () => {
    // A single sheet-wide padTop/padBottom left every short frame short, while
    // the tool reported success.
    const source = read('src/forge/CharacterGenerator/CharacterGenerator.js');
    assert.match(source, /const frameDy = Math\.max\(0, h - frame\.length\);/);
    assert.match(source, /for \(let i = 0; i < frameTop; i\+\+\) frame\.unshift\(blankRow\(\)\);/);

    const normalise = (heights, target) => heights.map(length => {
        const dy = Math.max(0, target - length);
        return length + Math.floor(dy / 2) + (dy - Math.floor(dy / 2));
    });
    // The shape a 110x150 import produces: two directions a row shorter.
    const result = normalise([38, 38, 38, 37, 37, 37, 38, 38, 38, 37, 37, 37], 40);
    assert.deepEqual([...new Set(result)], [40]);
});
