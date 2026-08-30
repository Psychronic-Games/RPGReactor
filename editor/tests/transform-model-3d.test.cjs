const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const TransformModel3DEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'TransformModel3DEditor.js'));

test('the command builds as a stock plugin command and reads back', () => {
    const built = TransformModel3DEditor.build({ target: '10002', offsetX: '0.5', offsetY: '-1', offsetZ: '0.25', yaw: '90', pitch: '0', roll: '0', proportional: true, scale: '1.5', duration: '45', wait: true }, 1);
    assert.equal(built.code, 357);
    assert.equal(built.indent, 1);
    assert.deepEqual(built.parameters.slice(0, 3), ['RPGReactor', 'TransformModel3D', 'Transform 3D Model']);
    const args = built.parameters[3];
    assert.equal(args.target, '10002');
    assert.deepEqual([args.offsetX, args.offsetY, args.offsetZ], ['0.5', '-1', '0.25']);
    assert.deepEqual([args.scaleX, args.scaleY, args.scaleZ], ['1.5', '1.5', '1.5'], 'proportional: one scale on every axis');
    assert.equal(args.duration, '45');
    assert.equal(args.wait, 'true');
    const axes = TransformModel3DEditor.build({ proportional: false, scaleX: '2', scaleY: '0.5', scaleZ: '-3' }).parameters[3];
    assert.deepEqual([axes.scaleX, axes.scaleY, axes.scaleZ], ['2', '0.5', '1'], 'a bad axis scale is 1');
});

test('the runtime eases a model from the transform it has to the one it was given', () => {
    const character = {};
    global.Graphics = { frameCount: 100 };
    Reactor3D.transformModel(character, { offset: [2, 0, 0], rotate: [90, 0, 0], scale: [2, 2, 2] }, 60);
    const state = character._reactorTransform;
    assert.deepEqual(state.from.offset, [0, 0, 0], 'from nothing');
    assert.equal(state.duration, 60);
    const mid = Reactor3D.liveTransformAt(state, 130);
    assert.ok(mid.offset[0] > 0.9 && mid.offset[0] < 1.1, `halfway at the half: ${mid.offset[0]}`);
    assert.equal(Reactor3D.liveTransformAt(state, 160).done, true);
    assert.deepEqual(Reactor3D.liveTransformAt(state, 160).scale, [2, 2, 2]);
    // A second command mid-way continues from where the model is.
    global.Graphics.frameCount = 130;
    Reactor3D.transformModel(character, { offset: [0, 0, 0] }, 30);
    assert.ok(character._reactorTransform.from.offset[0] > 0.9, 'from the eased position');
    assert.deepEqual(character._reactorTransform.to.scale, [1, 1, 1], 'unsaid axes return to 1');
    // Applied on top of the pose.
    const object = { position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
    character._reactorTransform = { from: null, to: { offset: [1, 2, 3], rotate: [90, 0, 0], scale: [2, 1, 1] }, frame: 0, duration: 0 };
    Reactor3D.applyLiveTransform(object, character);
    assert.deepEqual([object.position.x, object.position.y, object.position.z], [2, 2, 4]);
    assert.ok(Math.abs(object.rotation.y - Math.PI / 2) < 1e-9);
    assert.equal(object.scale.x, 2);
    delete global.Graphics;
});

test('the command is wired: runtime, picker, list, script, names', () => {
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(runtime, /PluginManager\.registerCommand\("RPGReactor", "TransformModel3D", function\(args\) \{/);
    assert.match(runtime, /Reactor3D\.applyLiveTransform\(object, character\);/, 'applied after the pose every frame');
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandPicker.js'), 'utf8'), /\{ name: 'Transform 3D Model', code: 357, reactor: 'TransformModel3D' \}/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8'), /if \(name === 'TransformModel3D'\) return this\.transformModel3DEditor;/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8'), /src\/event\/commands\/TransformModel3DEditor\.js/);
    assert.match(fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8'), /RR_EVENT_COMMAND_NAMES\[lang\]\['Transform 3D Model'\] = transform\[lang\]/);
});
