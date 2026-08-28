const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { inventoryLocalizationSource } = require('./helpers/i18n-source-audit.cjs');

const editorRoot = path.resolve(__dirname, '..');
const editorPath = path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js');
const source = fs.readFileSync(editorPath, 'utf8');

function methodSource(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `${start} source range exists`);
    return source.slice(from, to);
}

function routedPhrases(start, end) {
    return new Set(inventoryLocalizationSource(methodSource(start, end),
        'src/database/DatabaseTilesetEditor.js').keys());
}

function assertRouted(actual, expected) {
    for (const phrase of expected) {
        assert.ok(actual.has(phrase), `${JSON.stringify(phrase)} is routed through I18n.tText`);
    }
}

test('tileset flag keys and 3D palette text cannot bypass exact-text translation', () => {
    assertRouted(routedPhrases('    static flagKeyRows(mode) {', '    /** Redraw the tools'), [
        'Passable',
        'Blocked',
        'Drawn above characters',
        'Arrow: that side is open',
        'Dot: that side is blocked',
        'Climbed vertically',
        'Covers the lower half of a character',
        'Talked and traded across',
        'Costs HP to stand on',
        'Tag 0-7, read by events and plugins',
        'Flat - lies on the ground',
        'Upright - part of a standing object',
        'Scenery - raises the ground into a mass',
        'Foliage - a cut-out per cell, ground unchanged',
        'Panel - faces a way: a gate, a door, a sign',
        'One declared 3D object',
        'Lies flat within its object',
        'Wall capped with a roof (Roof tool)',
        'The roof another wall is capped with',
        'Key',
        '3D tool',
        'Drag a rectangle to apply the tool. A click is a single tile. Select changes nothing.'
    ]);
});

test('tileset 3D preview text cannot bypass exact-text translation', () => {
    assertRouted(routedPhrases('    refreshTile3DPreview() {', '    /** Drag across the preview'), [
        'Click a tile to preview it in 3D',
        'Flat',
        'Upright',
        'Scenery',
        'Foliage',
        'unclassified — the runtime decides',
        'declared object',
        'single tile',
        '3D preview',
        'Drag to turn'
    ]);
});

test('tileset 3D tool notices cannot bypass exact-text translation', () => {
    const mergePhrases = routedPhrases(
        '    mergeTile3DObject(existingTile, addedTile, addedW, addedH) {',
        '    /**\n     * Forget what is selected in 3D mode.');
    assertRouted(mergePhrases, [
        'The object being extended is no longer there — select it again, then shift-drag.',
        'That is on a different sheet from the object being extended.',
        'That would reach past the edge of the sheet.'
    ]);

    assertRouted(routedPhrases(
        '    applyTile3DTool(drag, imageIndex, tilesX) {',
        '    /** Paint one 3D class onto a tile'), [
        'Start with the wall: click a wall autotile on one of these sheets:',
        'Then click the tile that covers its top.',
        'Wall selected — click its roof, or click this wall again to clear.',
        'Wall selected — now click the tile that covers its top.',
        'Roof cleared — this wall keeps its own art on top.',
        'Roof set.',
        'Cleared',
        'tile — class, object, stand-in and roof.',
        'tiles — class, object, stand-in and roof.',
        'Nothing set on these tiles to clear.',
        'Objects are declared on picture-tile sheets:',
        'An autotile id is a corner arrangement rather than a place in a drawing, so a rectangle of the sheet means nothing here. Use one of these classes instead:',
        'Flat',
        'Upright',
        'Scenery',
        'Foliage',
        'Already part of an object — drag a rectangle to redeclare it, shift-drag to extend it, or use Clear.',
        'That cannot be joined to the object being extended.',
        'Object extended to',
        'Shift-drag again to add more.',
        'Object declared:',
        'Shift-drag another part to add it to this one.'
    ]);
});
