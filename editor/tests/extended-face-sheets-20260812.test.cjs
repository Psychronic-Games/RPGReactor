const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');
require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));
const FaceSheet = globalThis.RRFaceSheet;

test('face sheet geometry retains four 144px columns and derives rows from height', () => {
    assert.deepEqual(FaceSheet.metrics(288), { columns: 4, rows: 2, count: 8, faceSize: 144 });
    assert.deepEqual(FaceSheet.metrics({ naturalHeight: 576 }), { columns: 4, rows: 4, count: 16, faceSize: 144 });
    assert.deepEqual(FaceSheet.sourceRect(13, 576), { x: 144, y: 432, width: 144, height: 144 });
    assert.equal(FaceSheet.sourceRect(16, 576), null);
});

test('face sheet helper loads with AssetFiles before all editor consumers', () => {
    const html = source('index.html');
    const helper = html.indexOf('src/utils/AssetFiles.js');
    assert.ok(helper >= 0);
    for (const consumer of [
        'src/event/commands/MessageCommandEditor.js',
        'src/event/commands/ChangeActorImagesEditor.js',
        'src/DatabaseEditorUI.js'
    ]) {
        assert.ok(helper < html.indexOf(consumer), consumer);
    }
});

test('face consumers use loaded image height instead of fixed two-row limits', () => {
    const database = source('src/DatabaseEditorUI.js');
    const message = source('src/event/commands/MessageCommandEditor.js');
    const actorImages = source('src/event/commands/ChangeActorImagesEditor.js');

    assert.match(database, /RRFaceSheet\.metrics\(img\)/);
    assert.match(database, /RRFaceSheet\.sourceRect\(entry\.faceIndex \|\| 0, faceImg\)/);
    assert.doesNotMatch(database, /isFaceSheet \? 2/);
    assert.match(message, /for \(let i = 0; i < sheet\.count; i\+\+\)/);
    assert.match(message, /RRFaceSheet\.sourceRect\(this\.faceIndex, faceSheet\)/);
    assert.doesNotMatch(message, /for \(let i = 0; i < 8; i\+\+\)/);
    assert.match(actorImages, /RRFaceSheet\.metrics\(image\)\.count - 1/);
    assert.doesNotMatch(actorImages, /faceIdxInput\.max = 7/);
});
