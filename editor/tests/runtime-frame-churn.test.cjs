/**
 * A heap allocation profile of the Demo (250 MB in 8.5 s of walking) named
 * the per-frame churn: three rebuilding shader parameters for double-sided
 * transparent materials it renders twice, event notes re-parsed by regex
 * every frame, scratch vectors and rectangles created per sprite per frame,
 * Points and Rectangles built through the ES6 bridge, and the hidden 2D
 * tilemap still painting under a 3D map. These pin the fixes.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const r3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

test('every double-sided transparent material renders in one pass', () => {
    const blocks = r3d.match(/new THREE\.MeshBasicMaterial\(\{[\s\S]*?\}\)/g) || [];
    const twoSidedTransparent = blocks.filter(b => /transparent: true/.test(b) && /side: THREE\.DoubleSide/.test(b));
    assert.ok(twoSidedTransparent.length >= 5, `found ${twoSidedTransparent.length} double-sided transparent materials`);
    for (const block of twoSidedTransparent) {
        if (/blending: THREE\.AdditiveBlending/.test(block)) {
            // Additive light adds itself twice across the two passes and the
            // authored intensities were tuned against that: it stays two-pass.
            assert.match(block, /forceSinglePass: false/, 'the lights material keeps both passes');
            continue;
        }
        assert.match(block, /forceSinglePass: true/, block.slice(0, 80));
    }
});

test('a model note parses once, however often it is asked', () => {
    Reactor3D._noteSpecCache = null;
    const note = '<r3d>model(Hero.glb)\nsize(2)</r3d>';
    const first = Reactor3D.modelSpecFromNote(note);
    assert.equal(first.name, 'Hero');
    assert.equal(Reactor3D.modelSpecFromNote(note), first, 'the same object comes back');
    assert.equal(Reactor3D.modelSpecFromNote(''), null);
    assert.equal(Reactor3D.modelSpecFromNote('nothing here'), null);
    assert.equal(Reactor3D._noteSpecCache.get('nothing here'), null, 'misses are remembered too');
});

test('projection and stand scale reuse scratch vectors, and per-part name lowering is cached', () => {
    global.self = global; global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    global.Graphics = { width: 816, height: 624 };
    const camera = new global.THREE.PerspectiveCamera(40, 816 / 624, 0.1, 100);
    camera.position.set(0, 5, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const a = Reactor3D.projectToScreen(camera, 0, 0, 0);
    const b = Reactor3D.projectToScreen(camera, 1, 0, 0);
    assert.ok(Math.abs(a.x - 408) < 2 && a.visible, 'the origin projects to the screen centre');
    assert.ok(b.x > a.x, 'a point to the right lands to the right');
    assert.equal(Reactor3D._projectScratch.x !== undefined, true, 'one scratch vector serves every call');
    assert.match(r3d, /const right = \(this\._standRightScratch \|\| \(this\._standRightScratch = new THREE\.Vector3\(\)\)\)\.set\(1, 0, 0\)/);
    assert.match(r3d, /if \(part\.nameLower === undefined \|\| part\.nameLowerOf !== part\.name\) \{/);
    assert.match(r3d, /if \(rule\._partLowerOf !== rule\.part\) \{/);
    assert.doesNotMatch(r3d.slice(r3d.indexOf('Reactor3D.applyModelAnimation = function'), r3d.indexOf('Reactor3D.applyModelAnimation = function') + 20000), /entry\.parts\[d\]\.name\.toLowerCase\(\)/);
});

test('Points and Rectangles are plain field writes on PIXI 8, and window per-frame measures reuse their scratch', () => {
    assert.match(core, /Point\.prototype\.initialize = function\(x, y\) \{[\s\S]*?if \(PIXI\.TextureSource\) \{\s*this\.x = x \|\| 0;\s*this\.y = y \|\| 0;\s*return;/);
    assert.match(core, /Rectangle\.prototype\.initialize = function\(x, y, width, height\) \{[\s\S]*?if \(PIXI\.TextureSource\) \{\s*this\.type = "rectangle";/);
    assert.match(core, /const rect = this\._clampedCursorScratch \|\| \(this\._clampedCursorScratch = new Rectangle\(0, 0, 0, 0\)\);/);
    assert.match(core, /worldTransform\.apply\(this\._filterOriginScratch, this\._filterPosScratch\)/);
    // A hidden tilemap (a 3D map in its place) paints nothing until shown.
    assert.match(core, /const hidden = this\._lowerLayer\.visible === false && this\._upperLayer\.visible === false;\s*if \(\s*!hidden && \(/);
});
