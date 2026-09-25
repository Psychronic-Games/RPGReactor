/**
 * The 2000/2003 save screen in imported games.
 *
 * RPG Maker 2003's Save and Load show a title bar over 64 px slot windows
 * between 8 px bands in the system graphic's background colour; a slot shows
 * the file number, the party leader's name, level and HP, and the faces of the
 * first four party members. Deep 8 makes its "Speicherort" actor the leader
 * with a picture of the save location as its face, which is the thumbnail its
 * players see. The importer writes System.json rrLegacySaveScreen and the
 * runtime lays the scene out that way (EasyRPG's Scene_File, Window_SaveFile).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repo = path.resolve(__dirname, '..', '..');
const K = require('../src/legacy/LegacyConvert.js');

test('the imported window skin carries 2003\'s scroll arrows in MZ\'s arrow cells', () => {
    const system = K.blank(160, 80);
    const paint = (x0, y0, w, h, rgb) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * 160 + x) * 4; system.data.set([...rgb, 255], i); } };
    paint(40, 8, 16, 8, [10, 200, 30]);    // up arrow
    paint(40, 16, 16, 8, [200, 20, 40]);   // down arrow
    const skin = K.windowSkin(system, null);
    const px = (x, y) => Array.from(skin.data.slice((y * skin.width + x) * 4, (y * skin.width + x) * 4 + 4));
    // MZ's Window._refreshArrows: up at (132, 24), down at (132, 60), 24x12 each
    assert.deepEqual(px(136, 26), [10, 200, 30, 255]);
    assert.deepEqual(px(151, 33), [10, 200, 30, 255]);
    assert.deepEqual(px(136, 62), [200, 20, 40, 255]);
    assert.deepEqual(px(151, 69), [200, 20, 40, 255]);
    assert.equal(px(133, 25)[3], 0, 'centred, with the cell\'s edge left clear');
});

test('the importer asks for the 2003 save screen in the system graphic\'s background colour', () => {
    const importer = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'LegacyImporter.js'), 'utf8');
    assert.match(importer, /i = \(32 \* img\.width\) \* 4;/, 'pixel (0, 32), as EasyRPG reads it');
    assert.match(importer, /system\.rrLegacySaveScreen = \{ background \};/);
});

test('the runtime lays Save and Load out as 2003 did, only when an import asks', () => {
    const windows = fs.readFileSync(path.join(repo, 'runtime', 'reactor_windows.js'), 'utf8');
    const block = windows.slice(windows.indexOf('// ---- the 2000/2003 save screen'));
    assert.ok(block.length > 100);
    assert.match(block, /const legacy = \(\) => typeof \$dataSystem !== "undefined" && \$dataSystem && \$dataSystem\.rrLegacySaveScreen;/);
    assert.match(block, /if \(legacy\(\) && leader\) info\.rrLeader = \{ name: leader\.name\(\), level: leader\.level, hp: leader\.hp \};/, 'the leader is saved only for imports');
    assert.match(block, /const SLOT_HEIGHT = 64, BAND = 8;/);
    assert.match(block, /88 \+ i \* 56, 0,/, 'four faces 56 px apart after the text, as Window_SaveFile draws them');
    assert.match(block, /legacy\(\) && mode === "save" \? false : autosave/, 'Save lists no autosave row');
    assert.match(block, /Graphics\.width - Graphics\.boxWidth/, 'the whole screen, not MZ\'s box');
    // every override falls through to the stock behaviour without the flag
    for (const name of ['helpWindowRect', 'listWindowRect', 'needsCancelButton', 'createBackground']) {
        assert.match(block, new RegExp(`Scene_File\\.prototype\\.${name} = function\\(\\) \\{\\s*if \\(!legacy\\(\\)\\) return _${name}\\.call\\(this\\);|return legacy\\(\\) \\? false : _${name}\\.call\\(this\\);`), name);
    }
    assert.doesNotThrow(() => new Function(block));
});

test('Database › System 2 shows the import-only rules for saving, missing files and arithmetic, in every locale', () => {
    const editor = fs.readFileSync(path.join(repo, 'editor', 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8');
    for (const p of ['rrSkipMissingAudio', 'rrSkipMissingImages', 'rrLegacySaveScreen', 'rrLegacyVariableLimit']) assert.match(editor, new RegExp(`path: '${p}'`), p);
    assert.match(editor, /system\.rrLegacySaveScreen = system\.rrLegacySaveScreen \|\| this\._rrSaveScreenKept \|\| \{ background: '#000000' \};/, 'switching the save screen back on keeps its band colour');
    const deep = fs.readFileSync(path.join(repo, 'editor', 'src', 'I18nDeepTranslations.js'), 'utf8');
    for (const label of ['Skip Missing Sounds', 'Skip Missing Images', 'RPG Maker 2003 Save Screen', 'Variable Limit (2000/2003 Arithmetic)']) {
        assert.equal(deep.split(JSON.stringify(label) + ': ').length - 1, 17, label);
    }
});
