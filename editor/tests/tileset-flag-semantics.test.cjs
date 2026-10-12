const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const editorSource = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
const objectsSource = runtimeSource('reactor_objects.js');

// What the engine reads out of tileset.flags[tileId].
const engine = {
    passage: flag => flag & 0x0f,
    star: flag => (flag & 0x10) !== 0,
    ladder: flag => (flag & 0x20) !== 0,
    bush: flag => (flag & 0x40) !== 0,
    counter: flag => (flag & 0x80) !== 0,
    damage: flag => (flag & 0x100) !== 0,
    terrainTag: flag => flag >>> 12
};

/** The editor's terrain cycle, lifted from the shipped switch case. */
function cycleTerrain(oldFlag) {
    const at = editorSource.indexOf("case 'terrain':");
    assert.ok(at >= 0, 'the terrain case is present');
    const block = editorSource.slice(at, editorSource.indexOf('break;', at));
    const body = block
        .replace("case 'terrain':", '')
        .replace(/currentFlag =/g, 'return')
        .replace(/const /g, 'const ');
    // eslint-disable-next-line no-new-func
    return new Function('oldFlag', body)(oldFlag);
}

test('the engine bit layout is what the editor targets', () => {
    assert.match(objectsSource, /checkLayeredTilesFlags\(x, y, 0x20\)/, 'ladder');
    assert.match(objectsSource, /checkLayeredTilesFlags\(x, y, 0x40\)/, 'bush');
    assert.match(objectsSource, /checkLayeredTilesFlags\(x, y, 0x80\)/, 'counter');
    assert.match(objectsSource, /checkLayeredTilesFlags\(x, y, 0x100\)/, 'damage floor');
    assert.match(objectsSource, /const tag = flags\[tile\] >> 12;/,
        'and terrainTag is an unmasked shift, which is why the editor cannot mask either');
});

test('setting a terrain tag on an ordinary flag behaves as before', () => {
    for (const [before, expected] of [[0x0000, 1], [0x000f, 1], [0x1000, 2], [0x7000, 0]]) {
        const after = cycleTerrain(before);
        assert.equal(engine.terrainTag(after), expected, `0x${before.toString(16)}`);
        assert.equal(engine.passage(after), engine.passage(before), 'passage is preserved');
    }
});

test('every flag below bit 12 survives a terrain change', () => {
    const flag = 0x0f | 0x10 | 0x20 | 0x40 | 0x80 | 0x100;
    const after = cycleTerrain(flag);
    for (const name of ['passage', 'star', 'ladder', 'bush', 'counter', 'damage']) {
        assert.deepEqual(engine[name](after), engine[name](flag), name);
    }
});

test('a terrain tag set on an out-of-range flag is the tag the game reads', () => {
    // Third-party tooling has been observed writing 32-bit values into this
    // array. Clearing only bits 12-15 left the high bits in place, so the
    // editor showed the tag it had just set while the engine still read a
    // five-digit number from the same flag.
    for (const flag of [46915087, 1030793391, 46913024]) {
        assert.ok(engine.terrainTag(flag) > 15, 'the starting flag is out of range');
        const after = cycleTerrain(flag);
        assert.ok(engine.terrainTag(after) <= 7,
            `0x${flag.toString(16)} still reads ${engine.terrainTag(after)} after editing`);
        assert.equal(engine.passage(after), engine.passage(flag),
            'and the passage bits are still whatever they were');
    }
});

test('the editor reads the tag exactly as the engine does', () => {
    // A masked read would present 0x02CBDE0F as terrain 13 — a plausible value
    // for a flag the engine actually reports as 11453.
    assert.doesNotMatch(editorSource, /const terrainTag = \(flag >> 12\) & 0x0F;/,
        'no masked terrain read remains');
    const reads = editorSource.match(/const terrainTag = flag >>> 12;/g) || [];
    // One renderer, since the unreachable standalone editor UI (which carried
    // the second, and a flag-offset table that disagreed with this one on every
    // sheet) was removed.
    assert.equal(reads.length, 1, 'the palette renderer reads it the engine way');
});

test('the write clears the whole high half, not just one nibble', () => {
    assert.match(editorSource, /currentFlag = \(oldFlag & 0x0FFF\) \| \(nextTerrain << 12\)/);
    assert.doesNotMatch(editorSource, /oldFlag & ~0xF000/);
});
