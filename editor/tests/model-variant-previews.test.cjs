// A use of a model that names a variant shows that variant wherever the editor
// draws it: the model picker's preview and the Database slot's thumbnail wear
// the variant's surface, color and texture, and a thumbnail of one look is never
// served for another.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
global.Reactor3D = R;
const Panel = require(path.join(repoRoot, 'editor', 'src', 'database', 'ModelVariantsPanel.js'));
global.ModelVariantsPanel = Panel;
const Bindings = require(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DBindings.js'));
const Database3DEditor = require(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'));

function project(sidecar) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-variant-previews-'));
    fs.mkdirSync(path.join(dir, '3d', 'Actors', 'Hero'), { recursive: true });
    fs.writeFileSync(path.join(dir, '3d', 'Actors', 'Hero', 'model.json'), JSON.stringify(sidecar));
    return dir;
}

const gold = { reflect: 1, gloss: 1, metal: 1, tint: '#ffcc55', texture: 0 };
const sidecar = {
    variants: [
        { name: 'Gold', surface: gold },
        { name: 'Guard', color: { mode: 'colorize', color: '#2f86a0', strength: 0.5, lightness: 0 } },
        { name: 'Bare', surface: false }
    ]
};

test('a variant that only changes the surface is worn by the preview, and the model\'s own look takes it off again', () => {
    const dir = project(sidecar);
    try {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: new THREE.Texture() });
        R.litMaterial(material);
        const object = new THREE.Group();
        object.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
        const worn = Panel.wear(object, dir, 'Actors/Hero', 'Gold');
        assert.deepEqual(worn.surface, gold);
        assert.equal(worn.look, null);
        const shine = R.shineOf(material);
        assert.ok(shine, 'the material shines');
        assert.equal(material.userData.rrShine.vector.x, 1);
        assert.equal('#' + material.userData.rrShine.tint.getHexString(), '#ffcc55');
        Panel.wear(object, dir, 'Actors/Hero', '');
        assert.equal(R.shineOf(material), null, 'the model\'s own look has no surface');
        Panel.wear(object, dir, 'Actors/Hero', 'Guard');
        assert.ok(R.lookOf(material), 'a color variant adjusts the picture');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('what a use wears is read as the game reads it: its variant\'s, else the model\'s own', () => {
    const dir = project(Object.assign({ surface: { reflect: 0.4, gloss: 0.5, metal: 0, tint: '#ffffff', texture: 1 } }, sidecar));
    try {
        const own = Panel.lookOf(dir, 'Actors/Hero', '');
        assert.equal(own.surface.reflect, 0.4);
        assert.equal(Panel.lookOf(dir, 'Actors/Hero', 'Guard').surface.reflect, 0.4, 'a variant that says no surface keeps the model\'s');
        assert.equal(Panel.lookOf(dir, 'Actors/Hero', 'Bare').surface, null, 'a variant can take the surface off');
        assert.deepEqual(Panel.lookOf(dir, 'Actors/Missing', 'Gold'), { surface: null, look: null });
        assert.equal(Panel.lookStamp({ surface: null, look: null }), '');
        assert.notEqual(Panel.lookStamp(own), Panel.lookStamp(Panel.lookOf(dir, 'Actors/Hero', 'Gold')));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('each look has its own thumbnail, in memory and on disk; a model wearing nothing keeps the key it had', () => {
    const dir = project(sidecar);
    try {
        const spec = variant => Object.assign({ name: 'Actors/Hero' }, variant ? { variant } : null);
        const key = variant => Bindings.thumbnailKey(spec(variant), Panel.lookOf(dir, 'Actors/Hero', variant));
        assert.equal(key(''), 'Actors/Hero', 'shared with the 3D Models list');
        const keys = ['', 'Gold', 'Guard', 'Bare'].map(key);
        assert.equal(new Set(keys).size, keys.length);
        // An edit of a variant's look is another thumbnail.
        const edited = JSON.parse(JSON.stringify(sidecar));
        edited.variants[0].surface.tint = '#ffffff';
        fs.writeFileSync(path.join(dir, '3d', 'Actors', 'Hero', 'model.json'), JSON.stringify(edited));
        assert.notEqual(key('Gold'), keys[1]);
        const name = (worn = '') => Database3DEditor.thumbnailCacheName('/p/3d/Actors/Hero/source/Hero.glb', 1000, 5, worn);
        assert.equal(name(), name(''), 'nothing worn: the cache entry is the one it always was');
        assert.notEqual(name(), name(Panel.lookStamp({ surface: gold, look: null })));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the slot, the thumbnail render and the picker all carry the variant', () => {
    const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
    const bindings = read('editor/src/database/Database3DBindings.js');
    assert.match(bindings, /\.\.\.\(spec\.variant \? \{ variant: spec\.variant \} : null\), \.\.\.\(key !== spec\.name \? \{ worn \} : null\)/, 'the render is asked for the look the use wears');
    assert.equal((bindings.match(/\(bound\(\)\.variant \|\| ''\) === \(spec\.variant \|\| ''\)|\(still\.variant \|\| ''\) === \(spec\.variant \|\| ''\)/g) || []).length, 2,
        'a thumbnail of another variant never lands in a slot');
    const editor = read('editor/src/database/Database3DEditor.js');
    assert.match(editor, /ModelVariantsPanel\.applyWorn\(object, entry\.worn\)/);
    assert.match(editor, /ModelVariantsPanel\.lookStamp\(entry\.worn\)/);
    const picker = read('editor/src/event/ModelGraphicPicker.js');
    assert.doesNotMatch(picker, /if \(this\.selectedVariant\) this\._wearVariant\(\)/, 'the preview wears the model\'s own surface too');
});
