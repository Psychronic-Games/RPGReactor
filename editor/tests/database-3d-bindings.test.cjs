/**
 * Database 3D bindings: the editor writes data/Database.r3d.json, the
 * runtime reads it back as normalized model specs for actors, enemies,
 * weapons, armors, and items — without touching the MZ database files.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Bindings = require(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DBindings.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

function tempProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-db3d-'));
    fs.mkdirSync(path.join(dir, 'data'));
    return dir;
}

test('bindings roundtrip through data/Database.r3d.json per section', () => {
    const project = tempProject();
    const spec = { name: 'Engineer', file: '', ext: '.glb', size: 2, scale: 1, yaw: 0, pitch: 0, roll: 0, faces: {}, texture: '' };
    Bindings.set(project, 'actors', 1, spec);
    Bindings.set(project, 'weapons', 4, { ...spec, name: 'Sword' });

    assert.equal(Bindings.get(project, 'actors', 1).name, 'Engineer');
    assert.equal(Bindings.get(project, 'weapons', 4).name, 'Sword');
    assert.equal(Bindings.get(project, 'enemies', 1), null);

    const onDisk = JSON.parse(fs.readFileSync(path.join(project, 'data', 'Database.r3d.json'), 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.actors['1'].name, 'Engineer');
    assert.equal(onDisk.weapons['4'].name, 'Sword');
    // No MZ file grew a field: the sidecar is the only artifact.
    assert.deepEqual(fs.readdirSync(path.join(project, 'data')), ['Database.r3d.json']);
    fs.rmSync(project, { recursive: true, force: true });
});

test('clearing the last binding removes the sidecar file entirely', () => {
    const project = tempProject();
    const file = path.join(project, 'data', 'Database.r3d.json');
    Bindings.set(project, 'enemies', 7, { name: 'Slime' });
    assert.ok(fs.existsSync(file));
    Bindings.set(project, 'enemies', 7, null);
    assert.ok(!fs.existsSync(file), 'an empty sidecar is not written');
    assert.equal(Bindings.get(project, 'enemies', 7), null);
    fs.rmSync(project, { recursive: true, force: true });
});

test('the runtime reads editor-written bindings as normalized specs', () => {
    const project = tempProject();
    Bindings.set(project, 'actors', 3, { name: 'Carol', ext: '.glb', size: 2.5, yaw: 90 });
    Bindings.set(project, 'items', 12, { name: 'Potion' });

    const savedSidecar = Reactor3D._databaseSidecar;
    const savedState = Reactor3D._databaseSidecarState;
    Reactor3D._databaseSidecar = Bindings.read(project);
    Reactor3D._databaseSidecarState = 'done';
    try {
        const actor = Reactor3D.databaseModelSpec('actors', 3);
        assert.equal(actor.name, 'Carol');
        assert.equal(actor.size, 2.5);
        assert.ok(Math.abs(actor.yaw - Math.PI / 2) < 1e-9, 'yaw stored in degrees, read in radians');
        assert.equal(Reactor3D.databaseModelSpec('items', 12).name, 'Potion');
        assert.equal(Reactor3D.databaseModelSpec('actors', 99), null);
        assert.equal(Reactor3D.databaseModelSpec('enemies', 3), null);
    } finally {
        Reactor3D._databaseSidecar = savedSidecar;
        Reactor3D._databaseSidecarState = savedState;
    }
    fs.rmSync(project, { recursive: true, force: true });
});

test('normalizeModelSpec fills defaults and rejects nameless entries', () => {
    assert.equal(Reactor3D.normalizeModelSpec(null), null);
    assert.equal(Reactor3D.normalizeModelSpec({}), null);
    const spec = Reactor3D.normalizeModelSpec({ name: 'Engineer' });
    assert.equal(spec.size, 2);
    assert.equal(spec.scale, 1);
    assert.equal(spec.yaw, 0);
    assert.equal(spec.faces, null);
});

test('actor bindings split into character, face, and battler slots', () => {
    const project = tempProject();
    Bindings.set(project, 'actors', 1, { name: 'Engineer' }, 'character');
    Bindings.set(project, 'actors', 1, { name: 'Carol', view: { zoom: 4, y: 0.9 } }, 'face');
    Bindings.set(project, 'actors', 1, { name: 'Carol' }, 'battler');

    assert.equal(Bindings.get(project, 'actors', 1, 'character').name, 'Engineer');
    assert.equal(Bindings.get(project, 'actors', 1, 'face').view.zoom, 4);
    assert.equal(Bindings.get(project, 'actors', 1, 'battler').name, 'Carol');

    // Clearing one slot leaves the others; clearing all removes the entry.
    Bindings.set(project, 'actors', 1, null, 'face');
    assert.equal(Bindings.get(project, 'actors', 1, 'face'), null);
    assert.equal(Bindings.get(project, 'actors', 1, 'character').name, 'Engineer');
    Bindings.set(project, 'actors', 1, null, 'character');
    Bindings.set(project, 'actors', 1, null, 'battler');
    assert.ok(!fs.existsSync(path.join(project, 'data', 'Database.r3d.json')));
    fs.rmSync(project, { recursive: true, force: true });
});

test('a legacy flat actor entry reads as its character slot and migrates', () => {
    const project = tempProject();
    fs.writeFileSync(path.join(project, 'data', 'Database.r3d.json'), JSON.stringify({
        version: 1, actors: { '1': { name: 'Engineer', ext: '.glb' } }
    }));
    assert.equal(Bindings.get(project, 'actors', 1, 'character').name, 'Engineer');
    Bindings.set(project, 'actors', 1, { name: 'Carol' }, 'battler');
    const stored = JSON.parse(fs.readFileSync(path.join(project, 'data', 'Database.r3d.json'), 'utf8'));
    assert.equal(stored.actors['1'].character.name, 'Engineer', 'migrated under a slot key');
    assert.equal(stored.actors['1'].battler.name, 'Carol');

    const saved = Reactor3D._databaseSidecar;
    const savedState = Reactor3D._databaseSidecarState;
    Reactor3D._databaseSidecar = Bindings.read(project);
    Reactor3D._databaseSidecarState = 'done';
    try {
        assert.equal(Reactor3D.databaseModelSpec('actors', 1).name, 'Engineer',
            'the map model is the character slot');
        assert.equal(Reactor3D.actorSlotSpec(1, 'battler').name, 'Carol');
        assert.equal(Reactor3D.actorSlotSpec(1, 'face'), null);
    } finally {
        Reactor3D._databaseSidecar = saved;
        Reactor3D._databaseSidecarState = savedState;
    }
    fs.rmSync(project, { recursive: true, force: true });
});

test('face view framing clamps and survives normalization', () => {
    const spec = Reactor3D.normalizeModelSpec({ name: 'Carol', view: { zoom: 99, y: -3 } });
    assert.equal(spec.view.zoom, 10);
    assert.equal(spec.view.y, 0);
    assert.equal(Reactor3D.normalizeModelSpec({ name: 'Carol' }).view, null);
});

test('movement triggers grade by gait: moving, walking, dashing', () => {
    const walkState = { moving: true, dashing: false };
    const dashState = { moving: true, dashing: true };
    const still = { moving: false, dashing: false };
    assert.equal(Reactor3D.moveTriggerActive('moving', walkState), true);
    assert.equal(Reactor3D.moveTriggerActive('moving', dashState), true);
    assert.equal(Reactor3D.moveTriggerActive('walking', walkState), true);
    assert.equal(Reactor3D.moveTriggerActive('walking', dashState), false);
    assert.equal(Reactor3D.moveTriggerActive('dashing', dashState), true);
    assert.equal(Reactor3D.moveTriggerActive('dashing', walkState), false);
    assert.equal(Reactor3D.moveTriggerActive('moving', still), false);
    assert.equal(Reactor3D.moveTriggerActive('always', walkState), null);
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'w', type: 'swing', part: 'Leg', trigger: 'walking' },
        { name: 'd', type: 'clip', clip: 'Run', trigger: 'dashing' }
    ] });
    assert.equal(rules[0].trigger, 'walking');
    assert.equal(rules[1].trigger, 'dashing');
});

test('models organize into folders: nested names list, resolve, and stay jailed', () => {
    // splitModelRef accepts folder segments and refuses escapes.
    assert.deepEqual(Reactor3D.splitModelRef('Weapons/long-sword'),
        { name: 'Weapons/long-sword', ext: '' });
    assert.equal(Reactor3D.splitModelRef('../../save/evil'), null);
    assert.equal(Reactor3D.splitModelRef('Weapons//x'), null);
    assert.equal(Reactor3D.splitModelRef('Weapons/./x'), null);
    assert.equal(Reactor3D.modelUrl('Weapons/long-sword', '.glb', 'long-sword'),
        '3d/Weapons/long-sword/source/long-sword.glb');

    // The lister finds a model wherever its source/ folder lives.
    global.window = global;
    global.RRAssetFiles = require(path.join(repoRoot, 'editor', 'src', 'utils', 'AssetFiles.js'));
    const Picker = require(path.join(repoRoot, 'editor', 'src', 'event', 'ModelGraphicPicker.js'));
    const project = tempProject();
    for (const dir of [
        ['3d', 'plain', 'source'],
        ['3d', 'Weapons', 'sword', 'source'],
        ['3d', 'Props', 'Town', 'barrel', 'source']
    ]) fs.mkdirSync(path.join(project, ...dir), { recursive: true });
    fs.writeFileSync(path.join(project, '3d', 'plain', 'source', 'plain.glb'), 'x');
    fs.writeFileSync(path.join(project, '3d', 'Weapons', 'sword', 'source', 'sword.glb'), 'x');
    fs.writeFileSync(path.join(project, '3d', 'Props', 'Town', 'barrel', 'source', 'barrel.obj'), 'x');
    const names = Picker.listModels(project).map(entry => entry.name);
    assert.deepEqual(names, ['plain', 'Props/Town/barrel', 'Weapons/sword']);
    const sword = Picker.listModels(project).find(entry => entry.name === 'Weapons/sword');
    assert.equal(sword.file, 'sword');
    fs.rmSync(project, { recursive: true, force: true });
});

test('a model without facing marks turns by its export convention', () => {
    // No marks: the engine assumes the glTF export convention (front
    // toward +Z, the camera side at rest) and derives every direction
    // from it. Marks remain the manual override for odd exports.
    const spun = dir => {
        const object = {
            rotation: {
                order: '', x: 0, y: 0, z: 0,
                set(x, y, z) { this.x = x; this.y = y; this.z = z; }
            },
            updateMatrix() {}
        };
        Reactor3D.applyEventModelPose(object, { yaw: 0, pitch: 0, roll: 0, faces: null }, dir);
        return object.rotation.y;
    };
    assert.equal(spun(2), 0, 'facing the camera is the rest pose');
    assert.equal(spun(8), Math.PI, 'facing away is a half turn');
    assert.equal(spun(6), Math.PI / 2);
    assert.equal(spun(4), -Math.PI / 2);
});
