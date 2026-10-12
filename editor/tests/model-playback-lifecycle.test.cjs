const test = require('node:test');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const assert = require('node:assert/strict');
require('../../runtime/libs/three.js');
const R = require('../../runtime/reactor_3d.js');

function setup(t) {
    const character = {}, rules = ['open', 'close'].map(name => ({ name, type: 'rotate', trigger: 'always', period: 10, cycles: 1, repeat: false }));
    t.mock.method(R, 'modelInstanceKey', () => 'probe');
    t.mock.method(R, 'fireModelEffect', () => {});
    R._modelActions = {};
    return { character, holder: { character, spec: 'prop', object: {}, binding: { clips: [] }, rules } };
}

test('prop sequences continue for several cycles after menu teardown, preserving the paused phase', t => {
    const { character, holder } = setup(t);
    holder.rules[1].repeat = true; // The last rule's own repeat must not trap the whole placement sequence.
    R.playModelSequence(character, ['open', 'close'], true);
    R.advanceModelAction(holder, character, 100);
    R.advanceModelAction(holder, character, 104);
    t.mock.method(R, 'currentFrame', () => 104);
    R.pauseModelPlayback(holder);
    const rebuilt = { character, spec: 'prop', object: {}, binding: { clips: [] }, rules: [] };
    R.advanceModelAction(rebuilt, character, 1000);
    assert.equal(rebuilt.action.name, 'open');
    assert.equal(rebuilt.action.until - 1000, 6, 'menu time does not consume the paused action');
    const plays = [];
    for (let frame = 1001; frame < 1070; frame++) {
        R.advanceModelAction(rebuilt, character, frame);
        if (rebuilt.action && plays.at(-1) !== rebuilt.action.name) plays.push(rebuilt.action.name);
    }
    assert.deepEqual(plays.slice(0, 5), ['open', 'close', 'open', 'close', 'open']);
});

test('stop during a menu and completed one-shot plays do not restart; unrelated models do not inherit state', t => {
    const { character, holder } = setup(t);
    R.playModelAnimation(character, 'open'); R.advanceModelAction(holder, character, 1);
    t.mock.method(R, 'currentFrame', () => 3); R.pauseModelPlayback(holder);
    R.playModelAnimation(character, '');
    const rebuilt = { ...holder, action: null };
    R.advanceModelAction(rebuilt, character, 100);
    assert.equal(rebuilt.action, null); assert.equal(R._modelActions.probe, undefined);
    R.pauseModelPlayback(rebuilt); R.advanceModelAction(rebuilt, character, 200);
    assert.equal(rebuilt.action, null);
    holder.action = null; R.playModelAnimation(character, 'open'); R.advanceModelAction(holder, character, 201);
    R.advanceModelAction(holder, character, 212); assert.equal(holder.action, null);
    R.pauseModelPlayback(holder); R.advanceModelAction(rebuilt, character, 300);
    assert.equal(rebuilt.action, null);
    holder.action = { name: 'open', frame: 300, until: 310 }; R.pauseModelPlayback(holder);
    const changed = { ...holder, spec: 'other', action: null };
    R.advanceModelAction(changed, character, 400); assert.equal(changed.action, null);
});

test('2D holders resume the same repeats and timed or toggled effect lights as 3D holders', t => {
    const { character, holder } = setup(t);
    holder.lights = { timed: { effect: { name: 'timed' }, until: 50 }, steady: { effect: { name: 'steady' }, until: 0 } };
    R.playModelAnimation(character, 'open', { repeat: true }); R.advanceModelAction(holder, character, 10);
    R.advanceModelAction(holder, character, 15);
    t.mock.method(R, 'currentFrame', () => 15); R.pauseModelPlayback(holder);
    const flat = { character, key: 'prop', flat: true, binding: { clips: [] }, rules: [] };
    R.advanceModelAction(flat, character, 100);
    assert.equal(flat.action.until, 105); assert.equal(flat.lights.timed.until, 135); assert.equal(flat.lights.steady.until, 0);
    R.advanceModelAction(flat, character, 106); assert.equal(flat.action.name, 'open');
    assert.equal(flat.action.frame, 106); assert.equal(flat.action.repeat, true);
});

test('flat ambient translates linear brightness into display brightness, including tint and endpoints', () => {
    assert.equal(R.flatAmbientTint({ intensity: 0, colour: 0xffffff }), 0);
    assert.equal(R.flatAmbientTint({ intensity: 1, colour: 0xffffff }), 0xffffff);
    assert.equal(R.flatAmbientTint({ intensity: 0.25, colour: 0xffffff }), 0x898989);
    assert.equal(R.flatAmbientTint({ intensity: 0.25, colour: 0xff0000 }), 0x890000);
});

test('flat anchors follow the rendered model and carried lights reach the flat compositor', t => {
    const T = global.THREE, object = new T.Group(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const holder = { flat: true, object, camera, size: 100, unit: 96, sprite: { x: 300, y: 200, anchor: { x: 0.5, y: 0.5 } } };
    const effect = { name: 'lamp', anchor: { part: '', offset: [0.5, 0.5, 0] }, light: { type: R.LIGHT_POINT, radius: 2, intensity: 1, colour: 0xffffff, width: 1 } };
    holder.lights = { lamp: { effect, until: 0 } };
    assert.deepEqual(R.flatModelAnchor(holder, effect), { x: 325, y: 175 });
    t.mock.method(R, 'modelInstances', () => new Map([['prop', holder]]));
    global.$gameMap = { tileWidth: () => 48, tileHeight: () => 48, displayX: () => 2, displayY: () => 3 };
    t.after(() => delete global.$gameMap);
    const [light] = R.modelEffectLights();
    assert.equal(light.x, 325 / 48 + 2); assert.equal(light.y, 175 / 48 + 3);
    assert.equal(light.radius, 4); assert.equal(light.height, 0);
    assert.equal(R.lightingEnabled({}), true, 'an active prop lamp enables 2D lighting');
});

test('placement speed and live speed changes adjust the clock without restarting or changing another prop', t => {
    const { character, holder } = setup(t);
    character.event = () => ({ reactorProp: { animationSpeed: 50 } });
    R.playModelAnimation(character, 'open', { repeat: true });
    assert.equal(R.advanceModelAction(holder, character, 100), 100);
    assert.equal(R.advanceModelAction(holder, character, 108), 104);
    const began = holder.action.frame;
    R.setModelAnimationSpeed(character, 200);
    assert.equal(R.advanceModelAction(holder, character, 110), 108);
    assert.equal(holder.action.frame, began, 'speed change keeps the current play');
    assert.equal(R.modelAnimationSpeed({}), 100, 'other instances keep their speed');
    R.advanceModelAction(holder, character, 111);
    assert.equal(holder.action.frame, 110, 'the next loop uses the same accelerated clock');
    assert.equal(holder.action.until, 120);
});

test('prop speed survives normalization and a placement copy, while old maps remain at 100%', () => {
    require('../src/utils/MapElevation.js');
    const E = global.RRMapElevation, map = { width: 5, height: 5 };
    const id = E.addProp(map, { name: 'Props/fan', x: 1, y: 1, animationSpeed: 175 });
    const saved = JSON.parse(JSON.stringify(E.propById(map, id)));
    assert.equal(saved.animationSpeed, 175);
    const copied = E.addProp(map, { ...saved, id: undefined, x: 2 });
    assert.equal(E.propById(map, copied).animationSpeed, 175);
    E.updateProp(map, id, { animationSpeed: 50 });
    assert.equal(E.propById(map, id).animationSpeed, 50);
    const runtimeMap={width:5,height:5,events:[null],reactor3d:{props:[{...saved,animations:['open','close'],effects:['glow','hum']}]}};
    R.installProps(runtimeMap);const event=runtimeMap.events[R.PROP_EVENT_BASE+saved.id];
    assert.equal(R.modelAnimationSpeed({ event: () => event }), 175);
    assert.deepEqual(event.reactorProp.animations,['open','close']);assert.deepEqual(event.reactorProp.effects,['glow','hum']);
});

test('flat spotlight texture narrows to its source and all light bodies stay translucent', t => {
    let pixels;
    global.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: image => { pixels = image.data; } }) }) };
    t.after(() => { delete global.document; delete R._flatConeLightCanvas; });
    const canvas = R.flatConeLightCanvas(); assert.equal(R.flatConeLightCanvas(), canvas, 'generated only once');
    const alpha = (x, y) => pixels[(y * 512 + x) * 4 + 3];
    assert.ok(alpha(256, 470) > 150, 'the source has a bright core');
    assert.equal(alpha(100, 470), 0, 'the old rectangular texture leaked outside the cone');
    assert.ok(alpha(256, 128) < alpha(256, 384), 'the beam fades with distance');
    for (const type of [R.LIGHT_POINT, R.LIGHT_SPOT, R.LIGHT_BEAM]) {
        assert.ok(R.flatLightOpacity({ type, intensity: 1.25 }) < 1);
        assert.ok(R.flatLightOpacity({ type, intensity: 4 }) < 1);
        assert.equal(R.flatLightOpacity({ type, intensity: 0 }), 0);
    }
});

test('moving parts expand the flat render area without changing their screen scale or ground anchor', t => {
    const T=global.THREE, object=new T.Group(), mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());object.add(mesh);
    const camera=new T.OrthographicCamera(), framing=R.frameModelSprite(object,100,camera);
    const sprite={anchor:{x:.5,y:.5+24/framing.pixels},setFrame(x,y,w,h){this.width=w;this.height=h;}};
    const state={object,camera,sprite,size:framing.pixels,radius:framing.radius,pixelsPerUnit:framing.pixels/(2*framing.radius),anchorY:.5};
    global.Bitmap=class { constructor(w,h){this.width=w;this.height=h;} };
    t.after(()=>delete global.Bitmap);
    assert.equal(R.expandModelSpriteFrame(state),false);
    const density=state.pixelsPerUnit;mesh.position.x=3;
    assert.equal(R.expandModelSpriteFrame(state),true);assert.ok(state.radius>3.5);
    assert.ok(Math.abs(state.pixelsPerUnit-density)<1,'pixel density is retained');
    assert.ok(Math.abs((sprite.anchor.y-.5)*state.size-24)<1e-8,'ground anchor stays fixed');
    const size=state.size;mesh.position.x=0;
    assert.equal(R.expandModelSpriteFrame(state),false);assert.equal(state.size,size,'returning limbs do not reallocate/shrink the texture');
});

test('skinned frame bounds follow posed bones and cache vertex-derived boxes', t => {
    const T=global.THREE, object=new T.Group(), geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,1,0],3));
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute([0,0,0,0,0,0,0,0],4));
    geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0],4));
    const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial()),bone=new T.Bone();mesh.add(bone);object.add(mesh);object.updateMatrixWorld(true);mesh.bind(new T.Skeleton([bone]));
    const first=R.prepareFlatModelBounds(object),second=R.prepareFlatModelBounds(object);
    assert.equal(first[0].bones,second[0].bones,'rebuilding a sprite reuses its vertex-derived bounds');
    const camera=new T.OrthographicCamera(),framing=R.frameModelSprite(object,80,camera);
    const state={object,camera,bounds:first,radius:framing.radius,pixelsPerUnit:80,size:framing.pixels,anchorY:.5,sprite:{anchor:{},setFrame(){}}};
    global.Bitmap=class{};t.after(()=>delete global.Bitmap);
    bone.position.x=5;
    assert.equal(R.expandModelSpriteFrame(state),true);
    const actual=mesh.getVertexPosition(1,new T.Vector3()).applyMatrix4(mesh.matrixWorld);
    assert.ok(actual.length()<state.radius,'a vertex beyond the rest box fits the expanded frame');
});

test('raised monitor props sort in front of a ground-level vehicle instead of sorting by lifted screen Y', t => {
    global.$gameMap={tileHeight:()=>48};t.after(()=>delete global.$gameMap);
    const monitor={eventId:()=>R.PROP_EVENT_BASE+6,screenY:()=>27.96*48,_reactorLift:9.56};
    const motorcycle={eventId:()=>24,screenY:()=>25*48,_reactorLift:0};
    assert.ok(R.flatModelSortY(monitor)>monitor.screenY()+9*48, 'lift contributes to depth even without a 3D tile-prop registry');
    assert.ok(R.flatModelSortY(monitor)>R.flatModelSortY(motorcycle));
    const fs=require('fs'),vm=require('vm'),source=runtimeSource('reactor_core.js');
    const compare=vm.runInNewContext('('+source.match(/Tilemap.prototype._compareChildOrder = (function\(a, b\) \{[\s\S]*?\n\});/)[1]+')');
    const a={z:3,y:(27.96-9.56)*48,_reactorSortY:R.flatModelSortY(monitor)},b={z:3,y:25*48,_reactorSortY:R.flatModelSortY(motorcycle)};
    assert.ok(compare(a,b)>0);assert.ok(compare({z:5,y:0},a)>0,'explicit tile/event priority still wins');
    assert.ok(compare({z:3,y:10},{z:3,y:20})<0,'ordinary sprites retain normal Y ordering');
    const sort=vm.runInNewContext('('+source.match(/Tilemap.prototype._sortChildren = (function\(\) \{[\s\S]*?\n\});/)[1]+')',{PIXI:{}});
    const tilemap={children:[a,b],_compareChildOrder:(x,y)=>(x.z-y.z)||(x.y-y.y)};
    sort.call(tilemap);assert.deepEqual(tilemap.children,[b,a],'a plugin comparator cannot discard model depth');

});
