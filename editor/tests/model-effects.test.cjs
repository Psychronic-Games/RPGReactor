const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a model declares named effects with an anchor, and rules fire them by name', () => {
    const effects = Reactor3D.readModelEffects({ effects: [
        { name: 'spark', animation: '12', anchor: { part: 'Head', offset: [0, '1.2', 0] }, scale: 2, loop: true, se: { name: 'Bell' } },
        { name: '', animation: 1 },
        { name: 'spark', animation: 3 },
        { name: 'flash', flash: { target: 'model', color: [255, 0, 0, 200], duration: 10 } }
    ] });
    assert.equal(effects.length, 2, 'unnamed and duplicate names are dropped');
    assert.deepEqual(effects[0].anchor, { part: 'Head', offset: [0, 1.2, 0] });
    assert.equal(effects[0].animation, 12);
    assert.equal(effects[0].loop, true);
    assert.equal(effects[0].se.volume, 90);
    assert.equal(effects[1].animation, 0);
    assert.equal(effects[1].flash.target, 'model');
    assert.equal(Reactor3D.modelEffectByName(effects, 'spark'), effects[0]);
    assert.equal(Reactor3D.modelEffectByName(effects, 'nope'), null);

    const rules = Reactor3D.readModelAnimationRules({ animations: [{ name: 'zap', trigger: 'action', effects: [{ at: 0.5, effect: 'spark' }, { at: 0.2, animation: 4 }] }] });
    assert.deepEqual(rules[0].effects[0], { at: 0.5, effect: 'spark' });
    assert.equal(rules[0].effects[1].animation, 4);
});

test('effects queue per character and are taken once', () => {
    const character = { eventId: () => 42 };
    Reactor3D.playModelEffect(character, 'spark');
    Reactor3D.playModelEffect(character, 'boom');
    assert.deepEqual(Reactor3D.takeModelEffects(character), ['spark', 'boom']);
    assert.deepEqual(Reactor3D.takeModelEffects(character), []);
});

test('the runtime plays anchored animations through a stand-in target and registers the command', () => {
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /PluginManager\.registerCommand\("RPGReactor", "PlayModelEffect"/);
    assert.match(runtime, /sprite\._targets = \[standIn\];/);
    assert.match(runtime, /const sprite = list\.length > count \? list\[list\.length - 1\] : null;/, 'the stock factory returns nothing');
    assert.match(runtime, /current\.effects = sidecar \? Reactor3D\.readModelEffects\(sidecar\) : \[\];/);
    assert.match(runtime, /for \(const name of Reactor3D\.takeModelEffects\(character\)\)/);
    assert.match(runtime, /Reactor3D\.updateAnchoredAnimations\(holder\);/);
    assert.match(read('runtime/reactor_main.js'), /runtime revision: 20260829\.44/);
});

test('the editor wires the Play 3D Effect command and the Effects section', () => {
    const PlayModelEffectEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'PlayModelEffectEditor.js'));
    const os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pme-'));
    fs.mkdirSync(path.join(root, '3d', 'Props', 'console'), { recursive: true });
    fs.writeFileSync(path.join(root, '3d', 'Props', 'console', 'model.json'), JSON.stringify({ effects: [{ name: 'boot', animation: 3 }, { name: 'alarm', animation: 4 }] }));
    assert.deepEqual(PlayModelEffectEditor.modelActionNames(root, 'Props/console'), ['boot', 'alarm']);
    fs.rmSync(root, { recursive: true, force: true });
    const source = read('editor/src/event/commands/PlayModelEffectEditor.js');
    assert.match(source, /'PlayModelEffect',\s*'Play 3D Effect',/);
    assert.match(read('editor/src/event/EventCommandPicker.js'), /reactor: 'PlayModelEffect'/);
    assert.match(read('editor/src/event/EventCommandList.js'), /if \(name === 'PlayModelEffect'\) return this\.playModelEffectEditor;/);
    assert.equal((read('editor/src/database/DatabaseCommonEventEditor.js').match(/getEditor\('playModelEffect', PlayModelEffectEditor\)/g) || []).length, 2);

    const db3d = read('editor/src/database/Database3DEditor.js');
    for (const method of ['renderEffectList()', 'renderEffectForm()', 'addModelEffect()', 'deleteModelEffect()', '_placeEffectAnchor(event)', '_playEffectPreview(raw)', '_updateEffectPreview()']) {
        assert.ok(db3d.includes('    ' + method), method);
    }
    assert.match(db3d, /static mergeSidecar\(previousText, animations, parts, pivots, effects, transform, collision\)/);
    assert.match(db3d, /this\.customPivots, this\.rawEffects, this\.rawTransform, this\.rawCollision\)\);/);
    assert.match(db3d, /mode === 'fxanchor' && stationary/);
    assert.match(db3d, /if \(effect\.effect\) \{\s*const raw = this\.rawEffects\.find/);
    const html = read('editor/index.html');
    assert.match(html, /src\/utils\/AnimationPreviewLayer\.js/);
    assert.match(html, /src\/event\/commands\/PlayModelEffectEditor\.js/);
    const layer = read('editor/src/utils/AnimationPreviewLayer.js');
    assert.match(layer, /premultipliedAlpha: true, alpha: true/, 'the overlay is transparent over the model');
});

test('the picker previews on black by default and does not scroll', () => {
    const picker = read('editor/src/database/AnimationPickerModal.js');
    assert.match(picker, /class="anim-picker-stage"[^>]*overflow: hidden/);
    assert.match(picker, /max-height: calc\(100% - 64px\)/);
    assert.match(read('editor/src/utils/ThemeColors.js'), /\|\| CHOICES\[2\];/);
    assert.match(read('editor/src/TilesetPaletteViewer.js'), /createLayerTab\('M', TilesetPaletteViewer\.tabIcon\('model3d'\), '3D-M'\)/);
});

test('a model base transform wraps every instance and effects carry a turn', () => {
    const transform = Reactor3D.readModelTransform({ transform: { offset: [1, '2', 'x'], rotate: [0, 90, 0], scale: '2' } });
    assert.deepEqual(transform, { offset: [1, 2, 0], rotate: [0, 90, 0], scale: 2 });
    assert.equal(Reactor3D.isIdentityTransform(Reactor3D.readModelTransform({})), true);
    assert.equal(Reactor3D.isIdentityTransform(transform), false);
    const effects = Reactor3D.readModelEffects({ effects: [{ name: 'a', animation: 1, rotate: [10, 'b', 30], scale: 2 }] });
    assert.deepEqual(effects[0].rotate, [10, 0, 30]);
    const rules = Reactor3D.readModelAnimationRules({ animations: [{ name: 'idle-loop', trigger: 'action', repeat: true }] });
    assert.equal(rules[0].repeat, true);
    const runtime = read('runtime/reactor_3d.js');
    assert.equal((runtime.match(/applyModelTransform\(object, (?:this|Reactor3D)\.readModelTransform\(sidecar\)\)/g) || []).length, 5, 'every instance site applies the base transform');
    assert.match(runtime, /sprite\._animation = Object\.assign\(\{\}, animation, \{/, 'effect turn and size ride on a copy of the record');
    assert.match(runtime, /holder\.action = rule && \(rule\.repeat \|\| holder\.action\.repeat\)/, 'a repeating action starts over');
    assert.match(read('runtime/reactor_main.js'), /runtime revision: 20260829\.44/);
});

test('the 3D editor card chooses model, parts, bones and effects, and edits each with sliders', () => {
    const db3d = read('editor/src/database/Database3DEditor.js');
    assert.match(db3d, /class="r3d-card" style="position:absolute;right:10px;top:10px;/, 'the card sits in the upper right');
    assert.equal((db3d.match(/class="sidebar-header r3d-sec-header"/g) || []).length, 3, 'section headers use the accent-strip convention and fold');
    for (const method of ['_mountCardChooser(card)', '_onCardChooserPick(id)', '_renderEffectCard(card, header)', '_renderTransformCard(card, header)', '_applyBaseTransform()', '_saveEffectWork()', '_commitAnchorFromMarker()']) {
        assert.ok(db3d.includes('    ' + method), method);
    }
    assert.match(db3d, /r3dcard\.groupModel[\s\S]*?r3dcard\.groupBones[\s\S]*?r3dfx\.title/, 'chooser groups by type');
    assert.match(db3d, /mode = 'fxdrag';/);
    assert.match(db3d, /repeat: !!rule\.repeat,/);
    assert.match(db3d, /this\.customPivots, this\.rawEffects, this\.rawTransform, this\.rawCollision\)\);/);
    assert.doesNotMatch(db3d, /class="r3d-card-part"/, 'the native select is gone');
    const select = require(path.join(editorRoot, 'src', 'utils', 'SearchSelect.js'));
    assert.equal(typeof select.create, 'function');
    assert.match(read('editor/index.html'), /src\/utils\/SearchSelect\.js/);
    const layer = read('editor/src/utils/AnimationPreviewLayer.js');
    assert.match(layer, /setTransform\(transform\)/);
    assert.match(read('editor/src/utils/EventPreviewModels.js'), /Reactor3D\.applyModelTransform\(object, template\.userData\.reactorTransform\)/);
});

test('effects play on their own by state, and scale proportionally or per axis', () => {
    assert.deepEqual(Reactor3D.readScale([2, 'x', 0.5], 1), [2, 1, 0.5]);
    assert.equal(Reactor3D.readScale('1.5', 1), 1.5);
    assert.deepEqual(Reactor3D.scaleAxes(2), [2, 2, 2]);
    const effects = Reactor3D.readModelEffects({ effects: [{ name: 'a', animation: 1, trigger: 'moving', scale: [2, 1, 1] }, { name: 'b', animation: 1, trigger: 'bogus' }] });
    assert.equal(effects[0].trigger, 'moving');
    assert.equal(effects[1].trigger, 'action');
    assert.equal(Reactor3D.isIdentityTransform(Reactor3D.readModelTransform({ transform: { scale: [1, 1, 1] } })), true);
    assert.equal(Reactor3D.isIdentityTransform(Reactor3D.readModelTransform({ transform: { scale: [1, 2, 1] } })), false);

    // Triggered effects spawn while active and stop when the state ends.
    const spawned = [];
    const stopped = [];
    const fake = Object.create(Reactor3D);
    fake.spawnAnchoredAnimation = function(effect, character, holder) {
        const entry = { effect, sprite: {}, standIn: {}, loop: true };
        (holder.anchored || (holder.anchored = [])).push(entry);
        spawned.push(effect.name);
    };
    fake.stopAnchoredAnimation = function(entry) { stopped.push(entry.triggered); entry.done = true; };
    const holder = { effects: effects, anchored: [] };
    fake.updateTriggeredEffects(holder, {}, { moving: true, dashing: false });
    assert.deepEqual(spawned, ['a']);
    assert.equal(holder.anchored[0].triggered, 'a');
    fake.updateTriggeredEffects(holder, {}, { moving: true, dashing: false });
    assert.deepEqual(spawned, ['a'], 'not spawned twice while live');
    fake.updateTriggeredEffects(holder, {}, { moving: false, dashing: false });
    assert.deepEqual(stopped, ['a']);

    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /Reactor3D\.updateTriggeredEffects\(holder, character, \{/);
    assert.match(runtime, /this\._handle\.setScale\(uniform \* axes\[0\], uniform \* axes\[1\], uniform \* axes\[2\]\);/);
    assert.match(read('runtime/reactor_main.js'), /runtime revision: 20260829\.44/);
    const db3d = read('editor/src/database/Database3DEditor.js');
    assert.match(db3d, /this\._fxPreviewDef = raw;/, 'the preview follows the live effect');
    assert.match(db3d, /_scaleSlidersHtml\(prefix, scale\)/);
    assert.match(db3d, /class="r3d-fxcard-trigger"/);
    assert.match(db3d, /_updateTriggeredEffectPreview\(\) \{/);
    assert.match(read('editor/src/utils/AnimationPreviewLayer.js'), /fx\.handle\.setScale\(base \* extra\.scale\[0\], base \* extra\.scale\[1\], base \* extra\.scale\[2\]\);/);
});

test('every number field gets the themed stepper', () => {
    const steppers = require(path.join(editorRoot, 'src', 'utils', 'NumberSteppers.js'));
    assert.equal(typeof steppers.enhance, 'function');
    assert.equal(steppers.wants({ tagName: 'INPUT', type: 'number', dataset: {}, classList: { contains: () => false }, parentElement: { classList: { contains: () => false } } }), true);
    assert.equal(steppers.wants({ tagName: 'INPUT', type: 'number', dataset: { noStepper: '' }, classList: { contains: () => false }, parentElement: { classList: { contains: () => false } } }), false);
    assert.equal(steppers.wants({ tagName: 'INPUT', type: 'number', dataset: {}, classList: { contains: () => false }, parentElement: { classList: { contains: name => name === 'rr-number-stepper' } } }), false, 'hand-authored steppers are left alone');
    const html = read('editor/index.html');
    assert.ok(html.indexOf('src/utils/NumberSteppers.js') < html.indexOf('src/database/Database3DEditor.js'), 'loaded before the panels that make number fields');
    assert.match(read('editor/css/theme.css'), /input\[type="number"\]::-webkit-inner-spin-button/);
});

test('video effects, mesh collision, repeat and player-relative controls are wired', () => {
    const fx = Reactor3D.readModelEffects({ effects: [{ name: 'screen', type: 'video', video: { file: 'ui/screen.webm', width: 0.5, height: 0.25, audio: true }, anchor: { offset: [0, 1, 0] } }] })[0];
    assert.equal(fx.type, 'video');
    assert.deepEqual(fx.video, { file: 'ui/screen.webm', width: 0.5, height: 0.25, loop: true, audio: true, volume: 100 });
    // Sizes are fractions of the model; pixel-era numbers read as 96 px = the model's width.
    assert.deepEqual(Reactor3D.videoEffectSize(fx, { x: 10, y: 4, z: 3 }), [5, 2.5]);
    assert.equal(Reactor3D.videoEffectFraction(96, 0.3), 1);
    assert.equal(Reactor3D.videoEffectFraction('', 0.3), 0.3);
    assert.equal(Reactor3D.readModelCollision({ collision: 'box' }), 'box');
    assert.equal(Reactor3D.readModelCollision({}), 'mesh', 'the mesh footprint is the default');
    assert.equal(Reactor3D.pointInTriangle2D(0, 0, -1, -1, 1, -1, 0, 2), true);
    assert.equal(Reactor3D.pointInTriangle2D(5, 5, -1, -1, 1, -1, 0, 2), false);
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /if \(foot\.mask\) return foot\.mask\.touches\(localX, localZ\);/);
    assert.match(runtime, /Reactor3D\._sidecarJson\[name\] = parsed \|\| null;/);
    assert.match(runtime, /Game_Player\.prototype\.moveByInput = function\(\) \{/);
    assert.match(runtime, /repeat: !!\(options && options\.repeat\)/);
    assert.match(runtime, /rule && \(rule\.repeat \|\| holder\.action\.repeat\)/);
    assert.match(runtime, /Reactor3D\.spawnVideoEffect = function\(effect, character, holder\)/);
    assert.match(read('runtime/reactor_video_surfaces.js'), /anchor: anchor,/);
    assert.match(read('runtime/reactor_video_surfaces.js'), /Reactor3D\.effectAnchorWorld\(holder\.object, \{ anchor: descriptor\.anchor \}/);
    assert.match(read('runtime/reactor_main.js'), /runtime revision: 20260829\.44/);
    const db3d = read('editor/src/database/Database3DEditor.js');
    assert.match(db3d, /class="r3d-fx-type"/);
    assert.match(db3d, /_playVideoPreview\(raw\) \{/);
    assert.match(db3d, /class="r3d-tcard-collision"/);
    assert.match(db3d, /this\.rawTransform, this\.rawCollision\)\);/);
    const editor3d = read('editor/src/MapEditor3D.js');
    assert.match(editor3d, /animateModels\(now\) \{/);
    assert.match(editor3d, /ray\.intersectBox\(box, point\)/, 'props pick by bounding box');
    const manager = read('editor/src/ModelPropsManager.js');
    assert.match(manager, /undo\(\) \{[\s\S]*?this\._restore\(this\._undo\.pop\(\)\);/);
    assert.match(manager, /id="model-props-repeat"/);
    assert.match(read('editor/src/utils/EventPreviewModels.js'), /function animate\(object, template\)/);
});

test('an anchored effect scales with its instance and hides behind the face it sits on', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const effects = Reactor3D.readModelEffects({ effects: [
        { name: 'Front', animation: 1, anchor: { offset: [0, 1, 1] } },
        { name: 'Ring', animation: 1, anchor: { offset: [0, 0, 0] }, occlude: false }
    ] });
    assert.equal(effects[0].occlude, true, 'faces hide by default');
    assert.equal(effects[1].occlude, false, 'occlude: false opts out');

    // Scale 1 is a model-sized frame: a 20-tile model on a 720-px screen of
    // 48-px tiles is 20 * 48 / 720 of the animation's own screen-sized draw.
    const object = new THREE.Group();
    object.userData.glbSize = { x: 2, y: 2, z: 2 };
    object.scale.setScalar(20 / 2);
    assert.equal(+Reactor3D.modelSpanTiles(object).toFixed(3), 20);
    const previousGraphics = global.Graphics, previousMap = global.$gameMap;
    global.Graphics = { height: 720 };
    global.$gameMap = { tileHeight: () => 48 };
    try {
        assert.equal(+Reactor3D.effectModelScale(object).toFixed(4), +(20 * 48 / 720).toFixed(4));
        object.scale.setScalar(1.6 / 2);
        assert.equal(+Reactor3D.effectModelScale(object).toFixed(4), +(1.6 * 48 / 720).toFixed(4), 'the database preview model is 1.6 tiles');
        assert.equal(Reactor3D.effectModelScale({ userData: {} }), 1, 'no size, no scaling');
    } finally {
        global.Graphics = previousGraphics; global.$gameMap = previousMap;
    }

    object.scale.setScalar(1);
    object.updateMatrixWorld(true);
    const layerSource = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'AnimationPreviewLayer.js'), 'utf8');
    assert.match(layerSource, /setSpan\(tiles\)/, 'the preview layer takes the model span');
    assert.match(layerSource, /const q = this\.span \/ OVERLAY_TILES;/, 'and projects Effekseer against it');
    const camera = new THREE.PerspectiveCamera();
    const previous = global.SceneManager;
    global.SceneManager = { _scene: { _spriteset: { _reactor3d: { camera } } } };
    try {
        const holder = { object };
        const entry = {};
        camera.position.set(0, 1, 10);
        assert.equal(Reactor3D.effectFacesCamera(holder, effects[0], entry), true, 'the front face shows from the front');
        camera.position.set(0, 1, -10);
        assert.equal(Reactor3D.effectFacesCamera(holder, effects[0], entry), false, 'and hides from behind');
        assert.equal(Reactor3D.effectFacesCamera(holder, effects[1], {}), true, 'opted out, it always shows');
        const inside = Reactor3D.readModelEffects({ effects: [{ name: 'Core', animation: 1, anchor: { offset: [0, 1, 0] } }] })[0];
        assert.equal(Reactor3D.effectFacesCamera(holder, inside, {}), true, 'an anchor deep inside belongs to no face');
        const base = Reactor3D.readModelEffects({ effects: [{ name: 'Base', animation: 1, anchor: { offset: [0, 0.05, 0] } }] })[0];
        camera.position.set(0, 5, 0);
        assert.equal(Reactor3D.effectFacesCamera(holder, base, {}), true, 'the underside is never a face');
    } finally {
        global.SceneManager = previous;
    }
});

test('anchored Effekseer effects go into the 3D scene at the anchor, in world units, at the anchor depth', () => {
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const scene = Reactor3D.EffekseerScene;
    assert.equal(scene.begin(null, { effectName: 'x' }), null, 'no viewport, no play');
    assert.equal(scene.begin({ _scene: {} }, { name: 'MV sheet' }, {}), null, 'an MV animation stays on the overlay');
    // sync() takes the numbers; the handle is touched only in render().
    const object = new THREE.Group();
    object.userData.glbSize = { x: 1, y: 2, z: 1 };
    object.scale.setScalar(10);   // a 20-tile model
    object.updateMatrixWorld(true);
    const play = { animation: { scale: 100 }, world: new THREE.Vector3(), scale: [1, 1, 1], rotation: [0, 0, 0] };
    scene.sync(play, { object }, { anchor: { offset: [0, 1, 0] } }, [2.05, 2.05, 2.05], [0, 90, 0]);
    assert.ok(play.placed);
    assert.deepEqual(play.world.toArray().map(v => +v.toFixed(2)), [0, 10, 0], 'the anchor, in the world');
    assert.equal(+play.scale[0].toFixed(3), +(20 / 26 * 2.05).toFixed(3), 'one Effekseer unit = span * scale / 26 tiles');
    assert.equal(+play.rotation[1].toFixed(4), +(Math.PI / 2).toFixed(4));
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /Graphics\.effekseer[\s\S]*efx\.drawHandle\(handle\)/, 'drawn with the overlay context: Effekseer cannot draw on the scene\'s WebGL 2 one, and a second context fights the first');
    assert.match(source, /ctx\.drawImage\(overlay, 0, overlay\.height - height, width, height, 0, 0, width, height\)/, 'the corner is copied out of the overlay canvas');
    assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8'), /if \(this\._reactorInScene\) return;/, 'the hidden sprite leaves the handle alone');
    assert.match(source, /gl_Position = vec4\(position\.xy, depth, 1\.0\)/, 'a screen quad standing at the anchor depth');
    assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8'), /Reactor3D\.EffekseerScene\.render\(state\.viewport\)/, 'drawn before the passes');
});
