const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const bindings = require(path.join(editorRoot, 'src', 'database', 'Database3DBindings.js'));

function slotPickerCallback(source) {
    const slot=source.slice(source.indexOf('function decorateSlot('));
    const start=slot.indexOf('picker.show('),end=slot.indexOf('resyncWhenClosed();',start);
    assert.ok(start>=0 && end>start,'the shared graphic slot has a picker callback');
    return slot.slice(start,end);
}

test('actor model picker avoids HiDPI resize loops and disposes replaced resources', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'ModelGraphicPicker.js'), 'utf8');
    assert.match(source, /bufferWidth = Math\.floor\(width \* pixelRatio\)/);
    assert.match(source, /canvas\.width !== bufferWidth \|\| canvas\.height !== bufferHeight/);
    assert.match(source, /ModelPreview3D\.disposeObject\(this\._object, this\._template\)/);
    assert.match(source, /readModelAsync\([\s\S]*?\{ beforeBuild \}/);
    assert.match(source, /this\._previewGen = \(this\._previewGen \|\| 0\) \+ 1/);
    assert.match(source, /marker\.geometry\?\.dispose\?\.\(\)/);
});

test('actor thumbnails deduplicate concurrent cold renders', async () => {
    let renders = 0;
    let resolveRender;
    const editor = {
        _thumbs: {},
        projectController: {},
        _renderThumbnail() {
            renders++;
            return new Promise(resolve => { resolveRender = resolve; });
        }
    };
    const spec = { name: 'Hero', file: 'Hero', ext: '.glb' };
    const first = bindings.modelThumbnail(editor, spec);
    const second = bindings.modelThumbnail(editor, spec);
    assert.equal(first, second);
    assert.equal(renders, 1);
    resolveRender('data:image/png;base64,AA==');
    assert.equal(await first, 'data:image/png;base64,AA==');
    assert.equal(editor._thumbs.Hero, 'data:image/png;base64,AA==');
});

test('actor picker confirmation relies on one modal-close refresh', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'Database3DBindings.js'), 'utf8');
    const callback = slotPickerCallback(source);
    assert.doesNotMatch(callback, /sync\(\)/);
    assert.match(source, /render\(\);/);
    assert.doesNotMatch(source, /setTimeout\(render, 2500\)/);
});

test('an actor slot that goes 3D drops the 2D image it replaces', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'Database3DBindings.js'), 'utf8');
    const callback = slotPickerCallback(source);
    // Only a binding that saved and names a model clears anything.
    assert.match(callback, /if \(write\(result\)\s*&& result && result\.name && options\.onBound\) options\.onBound\(result\)/);
    assert.match(source, /const write = spec => options\.setBound \? options\.setBound\(spec\) !== false : trySet\(project\.path, 'actors', id, spec, slot\)/);

    const actorEditor = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseActorEditor.js'), 'utf8');
    assert.match(actorEditor, /slot: 'character'[^\n]*clear2d: \{ characterName: '', characterIndex: 0 \}/);
    assert.match(actorEditor, /slot: 'face'[^\n]*clear2d: \{ faceName: '', faceIndex: 0 \}/);
    assert.match(actorEditor, /slot: 'battler'[^\n]*clear2d: \{ battlerName: '' \}/);
    assert.match(actorEditor, /onBound: \(\) => \{[\s\S]*?Object\.assign\(actor, entry\.clear2d\)/);
});
