'use strict';
// The tile pictures that come with the editor (src/forge/Character3D/previews, baked by
// build-scripts/bake-character-previews.cjs): every choice the builder ships has one, of this version of the pictures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const dir = path.join(__dirname, '../src/forge/Character3D');
const source = fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody'), Model = load('CharacterModel'), Wardrobe = load('CharacterWardrobe'), Hair = load('CharacterHair');
const Species = load('CharacterSpecies'), Props = load('CharacterProps'), Creature = load('CreatureBody'), Cyber = load('CharacterCyberGear');
const VERSION = Number(source.match(/Character3DBuilder\.PREVIEW_VERSION = (\d+);/)[1]);
const REBAKE = 'bake them again: nice -n 19 node build-scripts/bake-character-previews.cjs';
const pack = name => JSON.parse(fs.readFileSync(path.join(dir, 'previews', name + '.json'), 'utf8'));
function builder() {
    const scope = { window: {}, console, performance, setTimeout, clearTimeout, require, RRHumanBody: Body, RRCharacterModel: Model, RRCharacterWardrobe: Wardrobe,
        RRCharacterHair: Hair, RRCharacterProps: Props, RRCreatureBody: Creature };
    vm.runInNewContext(source, scope);
    const b = Object.create(scope.window.Character3DBuilder.prototype);
    Object.assign(b, { recipe: Model.normalize({ gender: 0.2 }), cache: {}, _thumbs: new Map(), _thumbQueue: [], _thumbEpoch: 0, _project: () => ({ path: '/project' }) });
    b._pumpThumbs = () => {};
    return b;
}

test('every choice the builder ships has a baked picture of this version', () => {
    const ours = id => { const d = Wardrobe.BY_ID.get(id); return !!d && !d.transfer; };
    const lists = { species: Species.SPECIES.map(s => s.id), kind: Creature.KINDS.map(k => k.kind), dress: Wardrobe.PRESETS.filter(p => p.items.every(i => ours(i.id))).map(p => p.id),
        garment: Wardrobe.GARMENTS.map(g => g.id).filter(ours), prop: [...Props.BY_ID.keys()], hair: Hair.STYLES.map(s => s.id), facial: Hair.FACIAL.map(s => s.id),
        brows: Hair.BROWS.map(s => s.id), cyberlook: Cyber.LOOKS.map(l => l.id) };
    for (const [kind, ids] of Object.entries(lists)) for (const tag of kind === 'kind' ? ['x'] : kind === 'species' ? ['f', 'm', 'x'] : ['f', 'm']) {
        const p = pack(kind + '-' + tag);
        assert.equal(p.version, VERSION, `${kind}-${tag} is of another version of the pictures; ${REBAKE}`);
        const missing = ids.filter(id => !p.pictures[id]);
        assert.deepEqual(missing, [], `${kind}-${tag} lacks pictures; ${REBAKE}`);
        for (const id of ids.slice(0, 3)) assert.equal(Buffer.from(p.pictures[id], 'base64').subarray(0, 4).toString('latin1'), 'RIFF', `${kind}-${tag} ${id} is a WebP`);
    }
});

test('a tile takes its baked picture at once, with nothing queued, and a project\'s own garment does not', () => {
    const b = builder();
    b._wantThumb('dress', 'farmer');
    assert.equal(b._thumbs.get('dress:farmer').url, 'data:image/webp;base64,' + pack('dress-f').pictures.farmer);
    assert.equal(b._thumbQueue.length, 0);
    b.recipe = Model.normalize({ gender: 0.9 });
    b._wantThumb('dress', 'farmer');
    assert.equal(b._thumbs.get('dress:farmer').url, 'data:image/webp;base64,' + pack('dress-m').pictures.farmer, 'the other sex has its own');
    b._wantThumb('garment', 'not-in-the-catalog');
    assert.equal(b._thumbs.has('garment:not-in-the-catalog'), false);
    assert.equal(b._thumbQueue.length, 1, 'what was not baked is built as before');
});

test('a pack of another version is not used', () => {
    const b = builder();
    b.constructor._shippedPacks = null;
    const real = b.constructor.PREVIEW_VERSION;
    b.constructor.PREVIEW_VERSION = real + 1;
    try { assert.equal(b._shippedThumb('dress:farmer', b._thumbSig('dress')), null); }
    finally { b.constructor.PREVIEW_VERSION = real; b.constructor._shippedPacks = null; }
});
