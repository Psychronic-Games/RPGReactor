const test = require('node:test');
const assert = require('node:assert/strict');
require('../../runtime/libs/three.js');
const THREE = global.THREE;
const R = require('../../runtime/reactor_3d.js');
global.Reactor3D = R;
const S = require('../../runtime/reactor_3d_speech.js').Speech;
const Command = require('../src/event/commands/SpeakModel3DEditor.js');
function chunk(values, channels = 1) {
    let reads = 0;
    return { duration: values.length / 600, sampleRate: 600, length: values.length, numberOfChannels: channels,
        getChannelData(c) { reads++; return Float32Array.from(values, v => c ? -v : v); }, get reads() { return reads; } };
}

test('speech caches multichannel RMS envelopes, closes on silence and tracks chunk boundaries', () => {
    const a = chunk([...Array(60).fill(0), ...Array(60).fill(0.2), ...Array(60).fill(0)], 2);
    S.envelope(a); const buffer = { _buffers: [a, a] };
    assert.equal(S.levelAt(buffer, 0.03), 0);
    assert.ok(S.levelAt(buffer, 0.15) > 0.8, 'opposite channel phases do not cancel RMS');
    assert.equal(S.levelAt(buffer, 0.26), 0);
    assert.ok(S.levelAt(buffer, 0.45) > 0.8);
    for (let i = 0; i < 100; i++) S.levelAt(buffer, i / 200);
    assert.equal(a.reads, 2, 'one read per channel, no PCM scanning during ticks');
});

test('existing mouth morphs and jaws retain their base pose and do not accumulate movement', () => {
    const object = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    object.add(mesh); mesh.morphTargetDictionary = { mouthOpen: 0 }; mesh.morphTargetInfluences = [0.2];
    const driver = S.prepare(object);
    driver.apply(0.4); assert.ok(Math.abs(mesh.morphTargetInfluences[0] - 0.6) < 1e-9);
    driver.apply(0.4); assert.ok(Math.abs(mesh.morphTargetInfluences[0] - 0.6) < 1e-9);
    driver.restore(); assert.equal(mesh.morphTargetInfluences[0], 0.2);
    const other = new THREE.Group(), jaw = new THREE.Bone(), skin = new THREE.SkinnedMesh();
    jaw.name = 'Jaw'; jaw.rotation.x = 0.1; skin.skeleton = { bones: [jaw] }; other.add(skin);
    const talk = S.prepare(other); assert.equal(talk.kind, 'jaw');
    talk.apply(1); const angle = jaw.rotation.x; talk.apply(1); assert.equal(jaw.rotation.x, angle);
    talk.restore(); assert.ok(Math.abs(jaw.rotation.x - 0.1) < 1e-9);
});

test('designated lips generate an isolated GPU morph while shared geometry and distant vertices stay intact', () => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const original = new THREE.BufferGeometry();
    original.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.91, 0.2, 0, 0.89, 0.2, 0, 0.2, 0], 3));
    const mesh = new THREE.Mesh(original, new THREE.MeshBasicMaterial()); object.add(mesh);
    R.bindModelLandmarks(object, { mouth: { part: '', offset: [0, 0.9, 0.2] },
        upperLip: { part: '', offset: [0, 0.91, 0.2] }, lowerLip: { part: '', offset: [0, 0.89, 0.2] } });
    const driver = S.prepare(object); assert.equal(driver.kind, 'lipMorph');
    assert.notEqual(mesh.geometry, original); assert.equal(original.morphAttributes.position, undefined);
    const target = mesh.geometry.morphAttributes.position[0];
    assert.ok(target.getY(0) > original.getAttribute('position').getY(0));
    assert.ok(target.getY(1) < original.getAttribute('position').getY(1));
    assert.equal(target.getY(2), original.getAttribute('position').getY(2));
    driver.apply(0.8); assert.equal(mesh.morphTargetInfluences[0], 0.8);
    driver.restore(); assert.equal(mesh.morphTargetInfluences[0], 0);
    driver.dispose(); assert.equal(mesh.geometry, original);
});

test('attached voice buffers follow audio time and reset on stop without stopping externally owned audio', t => {
    const character = { id: 'speaker' }, object = new THREE.Group(), mesh = new THREE.Mesh(); object.add(mesh);
    mesh.morphTargetDictionary = { jawOpen: 0 }; mesh.morphTargetInfluences = [0];
    const pcm = chunk([...Array(60).fill(0), ...Array(60).fill(0.2), ...Array(60).fill(0)]);
    let playing = true, position = 0.15, stopped = 0;
    const buffer = { _buffers: [pcm], isPlaying: () => playing, seek: () => position, stop() { stopped++; } };
    t.mock.method(R, 'modelInstanceKey', c => c.id);
    S.attach(character, buffer); const scene = { _modelInstances: new Map([['speaker', { object }]]) };
    S.tick(scene); assert.ok(mesh.morphTargetInfluences[0] > 0.8);
    position = 0.26; S.tick(scene); assert.equal(mesh.morphTargetInfluences[0], 0);
    playing = false; S.tick(scene); assert.equal(S.active.has(character), false); assert.equal(stopped, 0);
});

test('voice-only commands retain audio settings, followers and stop operations', () => {
    const command = Command.build({ target: -2, speaker: 'Captain', text: 'Hello\nCrew', audio: 'voices/hello', pitch: 120, wait: false }, 3);
    assert.deepEqual(command.parameters.slice(0, 3), ['RPGReactor', 'SpeakModel3D', 'Speak 3D Dialogue']);
    assert.equal(command.indent, 3); assert.equal('text' in command.parameters[3], false);
    assert.equal('speaker' in command.parameters[3], false); assert.equal(command.parameters[3].pitch, '120');
    assert.equal(command.parameters[3].wait, 'false'); assert.equal(command.parameters[3].target, '-2');
    assert.equal(Command.build({ operation: 'stop' }).parameters[3].operation, 'stop');
});

test('speech ignores message state, waits only for voice, and stops or fails without hanging', t => {
    const names = ['Game_Interpreter', 'PluginManager', 'AudioManager', '$gameMessage', '$gamePlayer'];
    const previous = names.map(name => global[name]);
    const character = {}, follower = {}, buffers = [], commands = {};
    global.Game_Interpreter = class {
        character() { return character; }
        setWaitMode(mode) { this._waitMode = mode; }
        updateWaitMode() { return false; }
    };
    global.$gamePlayer = { followers: () => ({ follower: () => follower }) };
    global.PluginManager = { registerCommand(plugin, name, callback) { commands[name] = callback; } };
    let busy = true;
    const lines = [];
    global.$gameMessage = { isBusy: () => busy, setFaceImage() {}, setBackground() {}, setPositionType() {},
        setSpeakerName(name) { this.speaker = name; }, add(text) { lines.push(text); busy = true; } };
    global.AudioManager = {
        createBuffer() { const buffer = { _buffers: [], playing: false, failed: false, isPlaying() { return this.playing; },
            isError() { return this.failed; }, play() { this.playing = true; }, stop() { this.playing = false; this.stopped = true; }, destroy() { this.destroyed = true; } };
            buffers.push(buffer); return buffer; }, updateSeParameters() {}
    };
    t.mock.method(R, 'modelHolderFor', () => null);
    t.after(() => { S.stop(character); S.stop(follower); names.forEach((name, i) => { if (previous[i] === undefined) delete global[name]; else global[name] = previous[i]; }); });
    S.install(); const interpreter = new Game_Interpreter();
    commands.SpeakModel3D.call(interpreter, { target: -1, audio: 'voice', text: 'One\nTwo', speaker: 'Captain', wait: 'true' });
    assert.equal(buffers.length, 1, 'a busy message does not delay voice playback');
    assert.deepEqual(lines, [], 'legacy text arguments cannot modify the message window');
    assert.equal($gameMessage.speaker, undefined);
    assert.equal(interpreter.updateWaitMode(), true);
    buffers[0].playing = false; assert.equal(interpreter.updateWaitMode(), false);
    assert.equal(buffers[0].destroyed, true);
    commands.SpeakModel3D.call(interpreter, { target: -2, audio: 'voice', wait: 'true' });
    assert.equal(S.active.has(follower), true);
    buffers[1].failed = true; assert.equal(interpreter.updateWaitMode(), false, 'failed audio releases wait');
    commands.SpeakModel3D.call(interpreter, { target: -2, audio: 'voice', wait: 'false' });
    assert.equal(interpreter._waitMode, '', 'non-waiting speech leaves the next Show Text free to run');
    busy = true;
    commands.SpeakModel3D.call(new Game_Interpreter(), { target: -2, operation: 'stop', text: 'old text' });
    assert.equal(S.active.has(follower), false, 'stop works immediately even while a message is busy');
    assert.equal(buffers[2].stopped, true);
});

test('generated lips use the skinned bind pose instead of raw exported vertex units', () => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 91, 20, 0, 89, 20, 0, 20, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array(12).fill(0), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()), bone = new THREE.Bone();
    mesh.add(bone); object.add(mesh); object.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([bone]));
    bone.scale.setScalar(0.01); object.updateMatrixWorld(true);
    R.bindModelLandmarks(object, { mouth: { part: '', offset: [0, 0.9, 0.2] } });
    const driver = S.prepare(object); assert.equal(driver.kind, 'lipMorph');
    const morph = mesh.geometry.morphAttributes.position[0];
    assert.ok(morph.getY(1) < 89, 'mouth vertices are selected in model space and displaced back in mesh space');
    assert.equal(morph.getY(2), 20, 'the torso stays unchanged');
    driver.dispose(); assert.equal(mesh.geometry, geometry);
});

test('speech binds imported mesh transforms before the first renderer update', () => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 91, 20, 0, 89, 20, 0, 20, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array(12).fill(0), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()), bone = new THREE.Bone();
    mesh.add(bone); object.add(mesh); object.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([bone]));
    mesh.scale.setScalar(0.01);
    // The importer/clone has changed transforms; no renderer has traversed it yet.
    object.updateWorldMatrix(true, true);
    R.bindModelLandmarks(object, { mouth: { part: '', offset: [0, 0.9, 0.2] } });
    const driver = S.prepare(object);
    assert.equal(driver.kind, 'lipMorph');
    const morph = mesh.geometry.morphAttributes.position[0];
    assert.ok(morph.getY(1) < 89);
    assert.equal(morph.getY(2), 20);
    driver.dispose();
});

test('generated lips split bridging triangles, preserve rest surfaces and fill the opening with an owned dark cavity', () => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    const original = new THREE.BufferGeometry();
    original.setAttribute('position', new THREE.Float32BufferAttribute([-.02,.88,.2, .02,.88,.2, .02,.92,.2, -.02,.92,.2], 3));
    original.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1], 2));
    original.setIndex([0,1,2,0,2,3]); original.addGroup(0,3,0);original.addGroup(3,3,1);
    const mesh = new THREE.Mesh(original, [new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()]); object.add(mesh);
    const points = { mouth: {part:'',offset:[0,.9,.2],interior:'dark',interiorColor:'#140808'},
        upperLip:{part:'',offset:[0,.91,.2]},lowerLip:{part:'',offset:[0,.89,.2]} };
    R.bindModelLandmarks(object,points);
    const driver=S.prepare(object), geometry=mesh.geometry;
    assert.ok(geometry.attributes.position.count>4);assert.equal(original.attributes.position.count,4);
    assert.equal(original.index.count,6);assert.deepEqual(geometry.groups.map(g=>g.materialIndex),[0,1]);
    const area = g => {
        const p=g.attributes.position, ids=g.index;let total=0;
        for(let at=0;at<ids.count;at+=3){const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ids.getX(at+j)));total+=new THREE.Triangle(...v).getArea();}
        return total;
    };
    assert.ok(Math.abs(area(geometry)-area(original))<1e-8,'the closed face keeps its area');
    for(const value of geometry.attributes.uv.array)assert.ok(value>=0&&value<=1);
    const cavity=mesh.children.find(m=>m.name==='Reactor mouth interior');assert.ok(cavity);
    assert.equal(cavity.material.color.getHexString(),'140808');assert.equal(cavity.visible,false);
    driver.apply(1);assert.equal(cavity.visible,true);
    const morph=geometry.morphAttributes.position.at(-1);
    for(let at=0;at<geometry.index.count;at+=3){
        const y=[0,1,2].map(j=>morph.getY(geometry.index.getX(at+j))-.9);
        assert.ok(!(y.some(v=>v>1e-7)&&y.some(v=>v< -1e-7)),'no face stretches across the opening');
    }
    assert.ok([...cavity.geometry.attributes.position.array,...cavity.geometry.morphAttributes.position[0].array].every(Number.isFinite));
    driver.restore();assert.equal(cavity.visible,false);driver.dispose();
    assert.equal(mesh.geometry,original);assert.equal(cavity.parent,null);
    points.mouth.interior='none';R.bindModelLandmarks(object,points);
    const noInterior=S.prepare(object);assert.equal(mesh.children.length,0);noInterior.dispose();
});

test('new mouth-seam vertices retain normalized bone weights and meet in the captured skinned rest pose', () => {
    const object=new THREE.Group();object.userData.glbSize={x:1,y:1,z:1};
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.02,.88,.2,.02,.88,.2,.02,.92,.2,-.02,.92,.2],3));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0],4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
    geometry.setIndex([0,1,2,0,2,3]);
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()), a=new THREE.Bone(),b=new THREE.Bone();
    mesh.add(a,b);object.add(mesh);object.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([a,b]));b.position.y=.002;
    R.bindModelLandmarks(object,{mouth:{part:'',offset:[0,.9,.2]},upperLip:{part:'',offset:[0,.91,.2]},lowerLip:{part:'',offset:[0,.89,.2]}});
    const driver=S.prepare(object);object.updateMatrixWorld(true);mesh.skeleton.update();
    const g=mesh.geometry;
    for(let i=4;i<g.attributes.position.count;i++){
        const sum=[0,1,2,3].reduce((n,c)=>n+g.attributes.skinWeight.getComponent(i,c),0);
        assert.ok(Math.abs(sum-1)<1e-6);
        assert.ok(Math.abs(mesh.getVertexPosition(i,new THREE.Vector3()).y-.9)<1e-6);
    }
    assert.ok(mesh.children.some(n=>n.isSkinnedMesh&&n.skeleton===mesh.skeleton));
    driver.dispose();assert.equal(mesh.geometry,geometry);
});
