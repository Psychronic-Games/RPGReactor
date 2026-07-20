// Validates tracked procedural .efkmodel fixtures in both wire and solid
// styles, including the multi-frame (v5) 4D shapes.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const M = require(path.join(repoRoot, 'editor', 'src', 'forge', 'EffekseerGenerator', 'format', 'efk_model.js'));

test('every shape builds and round-trips (wire + solid where applicable)', () => {
    for (const shape of M.SHAPES) {
        for (const style of ['wire', 'solid']) {
            const geo = M.buildGeometry(shape, { thickness: 0.05, style, frames: 8, morphTurns: 1 });
            assert.ok(geo.spawnVertices.length > 0, `${shape}: no spawn vertices`);
            const bytes = M.writeEfkmodel(geo.mesh);
            const back = M.parseEfkmodel(bytes);
            const frames = geo.mesh.frames || [geo.mesh];
            assert.equal(back.frames.length, frames.length, `${shape}/${style}: frame count`);
            for (let i = 0; i < frames.length; i++) {
                assert.equal(back.frames[i].vertices.length, frames[i].vertices.length, `${shape}/${style}: frame ${i} vertices`);
                assert.equal(back.frames[i].faces.length, frames[i].faces.length, `${shape}/${style}: frame ${i} faces`);
                for (const face of back.frames[i].faces) {
                    for (const idx of face) {
                        assert.ok(idx >= 0 && idx < back.frames[i].vertices.length, `${shape}/${style}: face index out of range`);
                    }
                }
            }
        }
    }
});

test('4D shapes are multi-frame v5 with constant topology', () => {
    for (const shape of ['hypercube', 'pentachoron']) {
        const geo = M.buildGeometry(shape, { thickness: 0.05, frames: 16, morphTurns: 2 });
        assert.ok(geo.mesh.frames && geo.mesh.frames.length === 16, `${shape}: expected 16 frames`);
        const bytes = M.writeEfkmodel(geo.mesh);
        const back = M.parseEfkmodel(bytes);
        assert.equal(back.version, 5, `${shape}: expected v5`);
        const v0 = back.frames[0].vertices.length;
        for (const f of back.frames) assert.equal(f.vertices.length, v0, `${shape}: topology changed across frames`);
        // Vertices must actually MOVE across frames (it's an animation).
        const a = back.frames[0].vertices[0].p, b = back.frames[8].vertices[0].p;
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-4, `${shape}: frames are static`);
    }
});

test('spawn model carries corner vertices and no faces', () => {
    const geo = M.buildGeometry('cube', { thickness: 0.05 });
    const spawn = M.spawnModel(geo.spawnVertices);
    assert.equal(spawn.vertices.length, 8, 'cube has 8 corners');
    assert.equal(spawn.faces.length, 0);
    const back = M.parseEfkmodel(M.writeEfkmodel(spawn));
    assert.equal(back.vertices.length, 8);
});
