const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const DatabaseTilesetEditor = require(
    path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'));
const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');

function bareEditor() {
    const editor = Object.create(DatabaseTilesetEditor.prototype);
    editor.currentTileset = { flags: [] };
    editor.repaintClickedCanvas = () => {};
    editor.notifyTilesetSaved = () => {};
    return editor;
}

test('each passage brush writes its value over any starting flag', () => {
    const editor = bareEditor();
    editor.passageBrush = 'o';
    assert.equal(editor.passageBrushFlag(0x0F), 0);
    editor.passageBrush = 'x';
    assert.equal(editor.passageBrushFlag(0), 0x0F);
    assert.equal(editor.passageBrushFlag(0x10), 0x0F);
    editor.passageBrush = 'star';
    assert.equal(editor.passageBrushFlag(0x0F), 0x10);
    // Bits outside passage/star — ladder, bush, counter, damage, terrain —
    // belong to other modes and must survive a passability paint.
    editor.passageBrush = 'o';
    assert.equal(editor.passageBrushFlag(0x0F | 0x40 | (3 << 12)), 0x40 | (3 << 12));
    // Repainting the same value is a no-op, which is what makes a drag that
    // recrosses a tile safe.
    editor.passageBrush = 'x';
    assert.equal(editor.passageBrushFlag(0x0F), 0x0F);
});

test('writing a flag mirrors autotiles across all 48 shapes', () => {
    const editor = bareEditor();
    let repaints = 0;
    let saves = 0;
    editor.repaintClickedCanvas = () => repaints++;
    editor.notifyTilesetSaved = () => saves++;
    assert.equal(editor.writeTileFlag(null, 0, false, 2048, 0x0F), true);
    assert.equal(editor.currentTileset.flags[2048], 0x0F);
    assert.equal(editor.currentTileset.flags[2048 + 47], 0x0F);
    assert.equal(repaints, 1);
    assert.equal(saves, 1);
    // The same value again changes nothing and announces nothing.
    assert.equal(editor.writeTileFlag(null, 0, false, 2048, 0x0F), false);
    assert.equal(saves, 1);
    // A normal B-E tile stays a single slot.
    assert.equal(editor.writeTileFlag(null, 0, false, 10, 0x10), true);
    assert.equal(editor.currentTileset.flags[11], undefined);
});

test('the Key doubles as a passability palette', () => {
    const key = DatabaseTilesetEditor.flagKey('passability', 'x');
    assert.match(key, /data-passage-brush="o"/);
    assert.match(key, /data-passage-brush="x"/);
    assert.match(key, /data-passage-brush="star"/);
    assert.match(key, /Click a mark to paint it/);
    // Other modes keep a plain, non-clickable key.
    const ladder = DatabaseTilesetEditor.flagKey('ladder');
    assert.doesNotMatch(ladder, /data-passage-brush/);
});

test('the sheet canvases carry the brush drag and the click honors the brush', () => {
    assert.match(source, /attachPassageBrushDrag\(canvas, index, isSplitSheet\)/);
    assert.match(source, /attachPassageBrushDrag\(canvas, imageIndex, isSplitSheet\)/);
    const clickAt = source.indexOf("case 'passability':");
    const clickBody = source.slice(clickAt, source.indexOf('break;', clickAt));
    assert.match(clickBody, /this\.passageBrush/,
        'a picked mark paints instead of cycling');
});

test('the Key and its tool palettes stay pinned while the sheet scrolls', () => {
    // A sheet is up to 32 display rows; without stickiness the brushes were a
    // full scroll away from the tiles being painted.
    assert.match(source, /id="flag-mode-key"[^>]*position: sticky; top: 0/);
});
