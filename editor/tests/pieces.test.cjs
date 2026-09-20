// Pieces: the 3D tileset. Blocks on cells at levels, turned in quarter
// turns, wearing a material; the runtime stands characters on their tops
// and blocks what cannot be stepped onto through the terrain's rise rule.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

function loadThree() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return global.THREE;
}
function loadElevation() {
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    return context.RRMapElevation;
}
const mapWith = pieces => ({ width: 8, height: 8, reactor3d: { version: 1, elevation: new Array(64).fill(0), pieces } });

test('the editor keeps one piece per cell and level, in a fresh array each time', () => {
    const E = loadElevation();
    const map = { width: 8, height: 8, reactor3d: { version: 1 } };
    assert.equal(E.hasPieces(map), false);
    const id = E.setPiece(map, { kind: 'block', x: 2, y: 3, z: 0, rot: 5, material: ' Stone ' });
    assert.equal(id, 1);
    const first = map.reactor3d.pieces;
    assert.deepEqual({ ...E.pieceAt(map, 2, 3, 0) }, { id: 1, kind: 'block', x: 2, y: 3, z: 0, rot: 1, material: 'Stone' });
    assert.equal(E.setPiece(map, { kind: 'block', x: 2, y: 3, z: 0, rot: 1, material: 'Stone' }), 1, 'the same piece again changes nothing');
    assert.equal(map.reactor3d.pieces, first, 'and writes nothing');
    assert.equal(E.setPiece(map, { kind: 'floor', x: 2, y: 3, z: 0, material: 'Wood' }), 1, 'a different piece on the same cell and level replaces it, keeping the id');
    assert.notEqual(map.reactor3d.pieces, first, 'every change is a new array, which is what the runtime indexes by');
    assert.equal(E.setPiece(map, { kind: 'block', x: 2, y: 3, z: 1, material: 'Stone' }), 2, 'a level up is another piece');
    assert.equal(E.setPiece(map, { kind: 'block', x: 9, y: 3, z: 0 }), 0, 'off the map: nothing');
    assert.equal(E.setPiece(map, { kind: 'castle', x: 1, y: 1, z: 0 }), 0, 'an unknown kind: nothing');
    assert.deepEqual([...E.pieceMaterials(map)], ['Stone', 'Wood']);
    const saved = E.piecesSnapshot(map);
    assert.equal(E.removePiece(map, 2, 3, 1), true);
    assert.equal(E.removePiece(map, 2, 3, 1), false);
    assert.equal(E.pieces(map).length, 1);
    E.restorePieces(map, saved);
    assert.equal(E.pieces(map).length, 2);
    E.clearPieces(map);
    assert.equal(map.reactor3d.pieces, undefined, 'no pieces: no key');
    // A built map is written even when its ground is flat.
    const source = read('editor/src/utils/MapElevation.js');
    assert.match(source, /!roomed && !propped && !built && !lit/);
});

test('the runtime stands on piece tops, climbs stairs, and blocks what is too tall', () => {
    loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const map = mapWith([
        { id: 1, kind: 'floor', x: 1, y: 1, z: 0, rot: 0, material: 'Wood' },
        { id: 2, kind: 'block', x: 2, y: 1, z: 0, rot: 0, material: 'Stone' },
        { id: 3, kind: 'stair', x: 4, y: 1, z: 0, rot: 0, material: 'Stone' },
        { id: 4, kind: 'floor', x: 4, y: 2, z: 1, rot: 0, material: 'Wood' },
        { id: 9, kind: 'block', x: 4, y: 2, z: 0, rot: 0, material: 'Stone' },
        { id: 10, kind: 'floor', x: 6, y: 6, z: 0, rot: 0, material: 'Wood' },
        { id: 11, kind: 'roof', x: 6, y: 6, z: 2, rot: 0, material: 'RoofTile' },
        { id: 12, kind: 'doorway', x: 7, y: 6, z: 0, rot: 0, material: 'Stone' },
        { id: 13, kind: 'block', x: 7, y: 6, z: 5, rot: 0, material: 'Stone' },
        { id: 14, kind: 'floor', x: 5, y: 7, z: 2, rot: 0, material: 'Wood' },
        { id: 15, kind: 'wall', x: 0, y: 7, z: 0, rot: 0, material: 'Stone' },
        { id: 16, kind: 'stair', x: 2, y: 7, z: 1, rot: 0, material: 'Stone' },
        { id: 17, kind: 'floor', x: 1, y: 6, z: 1, rot: 0, material: 'Wood' },
        { id: 5, kind: 'stair', x: 6, y: 1, z: 0, rot: 2, material: 'Stone' },
        { id: 6, kind: 'doorway', x: 1, y: 4, z: 0, rot: 0, material: 'Stone' },
        { id: 7, kind: 'block', x: 3, y: 5, z: 0, rot: 0, material: 'Stone' },
        { id: 8, kind: 'block', x: 3, y: 5, z: 1, rot: 0, material: 'Stone' }
    ]);
    assert.equal(R.hasPieces(map), true);
    assert.equal(R.piecesOf(map).length, 17);
    assert.equal(R.piecesAt(map, 3, 5).length, 2, 'a stack is two pieces on one cell');
    assert.ok(Math.abs(R.groundHeightAt(map, 1.5, 1.5) - 0.1) < 1e-9, 'a floor slab is a small step up');
    assert.equal(R.groundHeightAt(map, 2.5, 1.5), 1, 'a block\'s top is a level up');
    assert.equal(R.groundHeightAt(map, 3.5, 5.5), 2, 'the top of a stack');
    assert.equal(R.groundHeightAt(map, 1.5, 4.5), 0, 'a doorway is walked through on the ground');
    assert.ok(Math.abs(R.groundHeightAt(map, 4.5, 2.5) - 1.1) < 1e-9, 'a floor on a block is a platform');
    assert.ok(Math.abs(R.groundHeightAt(map, 6.5, 6.5) - 0.1) < 1e-9, 'a roof two levels up leaves the floor under it walkable');
    assert.equal(R.groundHeightAt(map, 7.5, 6.5), 0, 'a block over a storey-tall doorway leaves the doorway open');
    assert.equal(R.groundHeightAt(map, 5.5, 7.5), 0, 'a floor two levels up is a bridge, walked under');
    assert.ok(Math.abs(R.groundHeightAt(map, 1.5, 6.5) - 1.1) < 1e-9, 'a floor one level up is a raised floor');
    assert.equal(R.groundHeightAt(map, 0.5, 7.5), R.PIECE_STOREY, 'a wall is a storey tall');
    assert.equal(R.PIECE_STOREY, 5, 'a 3 m storey: the bundled characters stand three tiles, so a tile is 0.6 m');
    const door = R.pieceGeometry([{ id: 1, kind: 'doorway', x: 0, y: 0, z: 0, rot: 0, material: '' }], mapWith([]));
    assert.ok(new THREE.Box3().setFromBufferAttribute(door.attributes.position).min.y >= R.PIECE_STOREY - 0.6 - 1e-6, 'a doorway is only its lintel: the opening is the whole cell, so two make a wide door');
    assert.ok(Math.abs(R.groundHeightAt(map, 2.5, 7.5) - 1.5) < 1e-9, 'the second stair of a climb, a level up, is still climbed');
    // A staircase up a whole storey, one cell per tile, onto a platform of blocks with a floor on top.
    const climb = [];
    for (let i = 0; i < 5; i++) climb.push({ id: 100 + i, kind: 'stair', x: 3, y: 1 + i, z: i, rot: 0, material: '' });
    for (let z = 0; z < 5; z++) climb.push({ id: 200 + z, kind: 'block', x: 3, y: 6, z, rot: 0, material: '' });
    climb.push({ id: 300, kind: 'floor', x: 3, y: 6, z: 5, rot: 0, material: 'Wood' });
    // A roof of ramps over a floor stays a roof.
    climb.push({ id: 400, kind: 'floor', x: 6, y: 2, z: 0, rot: 0, material: 'Wood' }, { id: 401, kind: 'ramp', x: 6, y: 2, z: 5, rot: 0, material: 'RoofTile' });
    const stairs = mapWith(climb);
    // A walker climbs with the height it has: each step is judged from where the last one left it.
    let standing = 0;
    for (let i = 0; i < 5; i++) {
        assert.equal(R.terrainBlocks(stairs, 3, i, 3, 1 + i, standing), false, 'step ' + i + ' of the climb is open');
        standing = R.groundHeightAt(stairs, 3.5, 1.5 + i, standing);
    }
    assert.equal(R.terrainBlocks(stairs, 3, 5, 3, 6, standing), false, 'the top stair steps onto the platform');
    assert.equal(R.groundHeightAt(stairs, 3.5, 3.5, 0), 0, 'from the ground, a stair two levels up is out of reach: the space under it is walked');
    assert.ok(Math.abs(R.groundHeightAt(stairs, 3.5, 6.5) - 5.1) < 1e-9);
    assert.equal(R.terrainBlocks(stairs, 2, 6, 3, 6), true, 'the platform is a storey up from the ground beside it');
    assert.ok(Math.abs(R.groundHeightAt(stairs, 6.5, 2.5) - 0.1) < 1e-9, 'a ramp roof five levels up is not walked on');
    // Two floors: a ground-floor slab, an upper floor a storey up, a roof over that. Where you stand decides.
    const house = mapWith([
        { id: 1, kind: 'floor', x: 2, y: 2, z: 0, rot: 0, material: 'Wood' },
        { id: 2, kind: 'floor', x: 2, y: 2, z: 5, rot: 0, material: 'Wood' },
        { id: 3, kind: 'ramp', x: 2, y: 2, z: 10, rot: 0, material: 'RoofTile' },
        { id: 4, kind: 'floor', x: 3, y: 2, z: 5, rot: 0, material: 'Wood' },
        { id: 5, kind: 'stair', x: 4, y: 2, z: 4, rot: 1, material: '' }
    ]);
    assert.ok(Math.abs(R.groundHeightAt(house, 2.5, 2.5) - 0.1) < 1e-9, 'downstairs by default');
    assert.ok(Math.abs(R.groundHeightAt(house, 2.5, 2.5, 0.1) - 0.1) < 1e-9, 'downstairs stays downstairs under the upper floor');
    assert.ok(Math.abs(R.groundHeightAt(house, 2.5, 2.5, 4.6) - 5.1) < 1e-9, 'arriving at the top of the stairs, the upper floor');
    assert.ok(Math.abs(R.groundHeightAt(house, 2.5, 2.5, 5.1) - 5.1) < 1e-9, 'upstairs stays upstairs, and the roof above is not climbed');
    assert.equal(R.terrainBlocks(house, 3, 2, 2, 2, 5.1), false, 'walking the upper floor');
    assert.equal(R.terrainBlocks(house, 4, 2, 3, 2, 4.5), false, 'off the top stair onto the upper floor');
    assert.equal(R.terrainBlocks(house, 2, 2, 3, 2, 0.1), false, 'downstairs, a cell with only an upper floor over it is walked under');
    assert.equal(R.groundHeightAt(house, 3.5, 2.5, 0.1), 0, 'and the ground there is the ground');
    const doors = mapWith([{ id: 1, kind: 'doorway', x: 1, y: 1, z: 0, rot: 0, material: '' }, { id: 2, kind: 'doorway', x: 1, y: 1, z: 5, rot: 0, material: '' }, { id: 3, kind: 'floor', x: 2, y: 1, z: 5, rot: 0, material: '' }]);
    assert.equal(R.groundHeightAt(doors, 1.5, 1.5, 0), 0, 'a ground-floor doorway is the ground');
    assert.equal(R.groundHeightAt(doors, 1.5, 1.5, 5.1), 5, 'an upstairs doorway is its own threshold, level with the floor beside it');
    assert.equal(R.terrainBlocks(doors, 2, 1, 1, 1, 5.1), false, 'walked through from the upper floor');
    // The game keeps the height on the character and forgets it on locate.
    const objects = read('runtime/reactor_objects.js');
    assert.match(objects, /Reactor3D\.terrainBlocks\(\$dataMap, x, y, x2, y2, this\._reactorGround\)/);
    assert.match(objects, /Game_CharacterBase\.prototype\.locate = function\(x, y\) \{[\s\S]{0,200}this\._reactorGround = undefined;/);
    assert.match(objects, /this\._reactorGround = character\._reactorGround;/, 'a follower copying the leader copies the floor');
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /character\._reactorGround = ground;/);
    const walker = { _realX: 2, _realY: 2 };
    R.characterGround(house, walker);
    assert.ok(Math.abs(walker._reactorGround - 0.1) < 1e-9);
    walker._reactorGround = 5.1; walker._realX = 3;
    assert.ok(Math.abs(R.characterGround(house, walker) - 5.1) < 1e-9, 'a character upstairs walks the upper floor');
    assert.equal(R.pieceHeight('doorway'), R.PIECE_STOREY); assert.equal(R.pieceHeight('block'), 1);
    assert.deepEqual(R.piecesAt(map, 3, 5).map(p => p.z), [0, 1], 'a stack is read from the ground up');
    // A stair facing south (rot 0) rises from its north edge to its south edge.
    assert.ok(Math.abs(R.groundHeightAt(map, 4.5, 1.05) - 0.05) < 1e-9);
    assert.ok(Math.abs(R.groundHeightAt(map, 4.5, 1.5) - 0.5) < 1e-9);
    assert.ok(Math.abs(R.groundHeightAt(map, 4.5, 1.95) - 0.95) < 1e-9);
    // Turned twice, it rises the other way.
    assert.ok(Math.abs(R.groundHeightAt(map, 6.5, 1.05) - 0.95) < 1e-9, 'rot 2: high at the north edge');
    assert.ok(Math.abs(R.groundHeightAt(map, 6.5, 1.95) - 0.05) < 1e-9);
    // Passability: onto a floor yes, into a block no, up the stair onto the level-1 floor yes.
    assert.equal(R.terrainBlocks(map, 0, 1, 1, 1), false, 'onto the floor slab');
    assert.equal(R.terrainBlocks(map, 1, 1, 2, 1), true, 'into a block');
    assert.equal(R.terrainBlocks(map, 4, 0, 4, 1), false, 'onto the stair\'s low end');
    assert.equal(R.terrainBlocks(map, 4, 1, 4, 2), false, 'up the stair onto the floor above');
    assert.equal(R.terrainBlocks(map, 3, 2, 4, 2), true, 'from the ground straight onto the level-1 floor');
    assert.equal(R.terrainBlocks(map, 0, 4, 1, 4), false, 'through a doorway');
    assert.equal(R.terrainBlocks(mapWith([]), 0, 0, 1, 0), false, 'no pieces, no terrain: nothing to judge');
    // Bad entries are dropped, not thrown on.
    const messy = mapWith([{ kind: 'block', x: 20, y: 1, z: 0 }, { kind: 'tower', x: 1, y: 1, z: 0 }, null, { kind: 'block', x: 1, y: 1, z: -3, rot: -1 }]);
    assert.deepEqual(R.piecesOf(messy).map(p => [p.kind, p.z, p.rot]), [['block', 0, 3]]);
});

test('every kind makes closed, outward-facing geometry that a turn moves as one', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    for (const kind of R.PIECE_KINDS) {
        for (const rot of [0, 1, 2, 3]) {
            const geometry = R.pieceGeometry([{ id: 1, kind, x: 3, y: 4, z: 2, rot, material: '' }], mapWith([]));
            const position = geometry.attributes.position;
            assert.ok(position.count >= 3 && position.count % 3 === 0, kind + ' is triangles');
            assert.equal(geometry.attributes.uv.count, position.count);
            assert.equal(geometry.attributes.color.count, position.count);
            const box = new THREE.Box3().setFromBufferAttribute(position);
            assert.ok(box.min.x >= 3 - 1e-6 && box.max.x <= 4 + 1e-6 && box.min.z >= 4 - 1e-6 && box.max.z <= 5 + 1e-6, kind + ' rot ' + rot + ' stays in its cell');
            assert.ok(box.min.y >= 2 - 1e-6 && box.max.y <= 2 + Math.max(R.pieceHeight(kind), 1.5) + 1e-6, kind + ' stays in its levels');
            if (R.pieceHeight(kind) > 1) assert.ok(box.max.y > 2 + R.pieceHeight(kind) - 0.1, kind + ' stands a storey tall');
            // Every face winds outward: the centroid-to-face dot with the normal is positive.
            const centre = box.getCenter(new THREE.Vector3());
            const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
            let inward = 0;
            for (let i = 0; i < position.count; i += 3) {
                a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
                n.copy(b).sub(a).cross(c.clone().sub(a));
                const mid = a.clone().add(b).add(c).divideScalar(3);
                if (['wall', 'block', 'floor', 'ramp', 'roof'].includes(kind) && n.dot(mid.sub(centre)) < -1e-6) inward++;
            }
            assert.equal(inward, 0, kind + ' rot ' + rot + ' has no inward face');
        }
    }
    // A stair turned once rises along the cell's east-west axis instead.
    const stair = p => R.pieceGeometry([{ id: 1, kind: 'stair', x: 0, y: 0, z: 0, rot: p, material: '' }], mapWith([]));
    const top = geometry => { const pos = geometry.attributes.position; let best = null; for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.99) { const v = new THREE.Vector3().fromBufferAttribute(pos, i); best = best ? best.add(v) : v; } return best; };
    assert.ok(top(stair(0)).z > 0, 'rot 0: the high step is on the south side');
    assert.ok(top(stair(1)).x < top(stair(0)).x + 1e-6, 'rot 1 turns it');
    // Grounds under pieces: a piece on a raised cell is emitted at that height.
    const raised = mapWith([]); raised.reactor3d.elevation[4 * 8 + 3] = 2;
    const g = R.pieceGeometry([{ id: 1, kind: 'floor', x: 3, y: 4, z: 0, rot: 0, material: '' }], raised);
    assert.ok(Math.abs(new THREE.Box3().setFromBufferAttribute(g.attributes.position).min.y - 2) < 1e-6);
});

test('the scene lays pieces down per material and can lay them again alone', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    const map = mapWith([
        { id: 1, kind: 'block', x: 1, y: 1, z: 0, rot: 0, material: 'Stone' },
        { id: 2, kind: 'block', x: 2, y: 1, z: 0, rot: 0, material: 'Stone' },
        { id: 3, kind: 'floor', x: 3, y: 1, z: 0, rot: 0, material: 'Wood' },
        { id: 4, kind: 'pillar', x: 4, y: 1, z: 0, rot: 0, material: '' }
    ]);
    const canvas = { width: 4, height: 4 };
    const asked = [];
    const load = name => { asked.push(name); return name === 'Stone' ? { image: canvas, width: 4, height: 4 } : null; };
    scene.addPieces(map, load);
    assert.equal(scene._pieceMeshes.length, 3, 'one mesh per material per chunk; these four pieces share one chunk');
    assert.deepEqual(asked.sort(), ['Stone', 'Wood']);
    const stone = scene._pieceMeshes.find(m => m.userData.pieceMaterial === 'Stone');
    assert.ok(stone.material.map && stone.material.map.wrapS === THREE.RepeatWrapping, 'a material image repeats');
    assert.equal(stone.geometry.attributes.position.count, 2 * 8 * 3, 'two blocks side by side on the ground: four faces each (no bottom, no shared face), eight triangles');
    assert.equal(scene._pieceMeshes.find(m => m.userData.pieceMaterial === 'Wood').material.map, null, 'a missing image draws plain');
    assert.equal(stone.matrixAutoUpdate, false, 'still, like the rest of the world');
    assert.equal(scene._meshes.length, 3);
    map.reactor3d.pieces = map.reactor3d.pieces.slice(0, 1);
    const again = scene.updatePieces(map, load);
    assert.equal(again.length, 1);
    assert.equal(scene._meshes.length, 1, 'the old piece meshes left the scene\'s list');
    assert.equal(scene._piecesGroup.children.length, 1);
    assert.equal(asked.length, 2, 'textures are made once per scene');
    assert.equal(again[0].material, stone.material, 'and so are materials: chunks share them');
    // Chunks: pieces far apart are separate meshes, and an edit relays only its own chunk.
    const wide = { width: 64, height: 64, reactor3d: { version: 1, elevation: new Array(64 * 64).fill(0), pieces: [
        { id: 1, kind: 'block', x: 1, y: 1, z: 0, rot: 0, material: 'Stone' }, { id: 2, kind: 'block', x: 40, y: 40, z: 0, rot: 0, material: 'Stone' }, { id: 3, kind: 'block', x: 41, y: 40, z: 0, rot: 0, material: 'Stone' }
    ] } };
    const chunked = Object.create(R.MapScene.prototype);
    chunked._scene = new THREE.Scene(); chunked._meshes = []; chunked._materials = []; chunked._textures = [];
    chunked.addPieces(wide, load);
    assert.equal(chunked._pieceMeshes.length, 2, 'two chunks, one material');
    const far = chunked._pieceMeshes.find(m => m.userData.pieceChunk === R.pieceChunkKey(40, 40));
    const near = chunked._pieceMeshes.find(m => m.userData.pieceChunk === R.pieceChunkKey(1, 1));
    wide.reactor3d.pieces = wide.reactor3d.pieces.concat([{ id: 4, kind: 'block', x: 2, y: 1, z: 0, rot: 0, material: 'Stone' }]);
    const relaid = chunked.updatePieces(wide, load, { x0: 1, y0: 0, x1: 3, y1: 2 });
    assert.equal(relaid.length, 1, 'one chunk relaid');
    assert.equal(relaid[0].userData.pieceChunk, R.pieceChunkKey(1, 1));
    assert.ok(chunked._pieceMeshes.includes(far), 'the far chunk was left alone');
    assert.ok(!chunked._pieceMeshes.includes(near), 'the edited chunk was replaced');
    assert.equal(chunked._pieceMeshes.length, 2);
    assert.match(read('editor/src/PieceBuilderManager.js'), /this\.announce\(false, \{ x0: target\.x - 1, y0: target\.y - 1, x1: target\.x \+ 1, y1: target\.y \+ 1 \}\)/, 'a dab names its cells');
    assert.match(read('editor/src/MapEditor3D.js'), /scene\.updatePieces\(mapData, name => materials\[name\] \|\| null, region\);/);
    // The game's default loader asks ImageManager for img/materials.
    assert.match(read('runtime/reactor_3d.js'), /ImageManager\.loadBitmap\("img\/materials\/", name\)/);
    assert.match(read('runtime/reactor_3d.js'), /this\.addPieces\(mapData, settings\.loadMaterial \|\| \(name => Reactor3D\.defaultMaterialLoader\(name\)\)\);/);
});

test('the 3D-B tab is registered everywhere a palette tab has to be, with its strings', () => {
    const palette = read('editor/src/TilesetPaletteViewer.js');
    assert.match(palette, /createLayerTab\('B', TilesetPaletteViewer\.tabIcon\('pieces'\), '3D-B'\)/, 'the tab');
    assert.match(palette, /if \(layerName !== 'M' && layerName !== 'T' && layerName !== 'B'\) this\.lastPaintLayer = layerName;/, 'not a paint layer');
    assert.match(palette, /layerName === 'B' \? 'pieces' : 'paint'/, 'claims the map for its own tool');
    assert.match(palette, /piecesContainer\.style\.display = layerName === 'B' \? 'flex' : 'none'/, 'shows its container');
    assert.match(palette, /if \(layerName !== 'B'\) this\.onPiecesTabLeft\?\.\(\);/);
    assert.match(palette, /\} else if \(layerName === 'B'\) \{[\s\S]*this\.onPiecesTabSelected\?\.\(\);/);
    const main = read('editor/src/main.js');
    assert.match(main, /if \(owner !== 'pieces'\) this\.pieceBuilderManager\?\.deactivate\(\);/, 'another owner puts the tool down');
    assert.match(main, /owner==='pieces'&&tab\.dataset\.layer==='B'/, 'the tab lights');
    assert.match(main, /palette\?\.currentLayer === 'B'\) palette\.selectLayer\(palette\.lastPaintLayer \|\| 'A'\)/, 'a drawing button returns to painting');
    assert.match(main, /onPiecesTabSelected = \(\) => \{/);
    assert.match(main, /new PieceBuilderManager\(this\.projectController\)/);
    assert.match(read('editor/index.html'), /src\/PieceBuilderManager\.js/);
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /if \(event\?\.detail\?\.pieces && this\.updatePiecesInPlace\(event\.detail\.region \|\| null\)\) return;/, 'a piece edit never rebuilds the scene');
    assert.match(view, /loadMaterial: name => materials\[name\] \|\| null/);
    assert.match(view, /if \(this\.canEditPieces\(\)\) \{\s*const manager = this\.pieceManager\(\);\s*const target = this\.pieceTargetAt\(event\.clientX, event\.clientY, \{ erase: true \}\);/, 'a right-click pulls a piece off');
    const i18n = read('editor/src/I18nManager.js');
    for (const key of ['pieces.hint', 'pieces.piece', 'pieces.kind.wall', 'pieces.kind.block', 'pieces.kind.fence', 'pieces.material', 'pieces.plain', 'pieces.materialsHint', 'pieces.turn', 'pieces.level', 'pieces.place', 'pieces.erase', 'pieces.undo', 'pieces.redo', 'pieces.clear', 'pieces.keys', 'pieces.needs3D', 'pieces.count']) {
        assert.equal((i18n.match(new RegExp('"' + key.replace(/\./g, '\\.') + '": "', 'g')) || []).length, 18, key + ' in 18 locales');
    }
    // The manager's stroke: one piece per new cell or level, undo per stroke, a right-click outside a stroke.
    const context = { console, window: {}, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js'), context);
    const map = { id: 3, width: 8, height: 8, reactor3d: { version: 1 } };
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    manager.material = 'Stone';
    assert.equal(manager.beginStroke({ x: 1, y: 1, z: 0 }), true);
    assert.equal(manager.paintAt({ x: 1, y: 1, z: 0 }), false, 'the same cell again lays nothing');
    assert.equal(manager.paintAt({ x: 2, y: 1, z: 0 }), true);
    assert.equal(manager.paintAt({ x: 2, y: 1, z: 1 }), true, 'a level up on the same cell is another piece');
    manager.endStroke();
    assert.equal(context.RRMapElevation.pieces(map).length, 3);
    assert.equal(manager.undoStack.length, 1, 'one stroke, one undo step');
    assert.equal(context.RRMapElevation.pieceAt(map, 1, 1, 0).kind, 'wall', 'the tool starts on the two-tall wall');
    manager.turn(); manager.setKind('floor');
    manager.beginStroke({ x: 5, y: 5, z: 0 }); manager.endStroke();
    assert.deepEqual({ ...context.RRMapElevation.pieceAt(map, 5, 5, 0) }, { id: 4, kind: 'floor', x: 5, y: 5, z: 0, rot: 1, material: 'Stone' });
    assert.equal(manager.removeAt({ x: 2, y: 1, z: 7 }), true, 'a right-click above a stack takes its top piece');
    assert.equal(context.RRMapElevation.pieceAt(map, 2, 1, 1), null);
    assert.equal(context.RRMapElevation.pieceAt(map, 2, 1, 0).kind, 'wall');
    manager.undo();
    assert.equal(context.RRMapElevation.pieces(map).length, 4);
    manager.undo(); manager.undo();
    assert.equal(context.RRMapElevation.hasPieces(map), false);
    manager.redo();
    assert.equal(context.RRMapElevation.pieces(map).length, 3);
    manager.setMode('erase');
    manager.beginStroke({ x: 1, y: 1, z: 0 }); manager.endStroke();
    assert.equal(context.RRMapElevation.pieceAt(map, 1, 1, 0), null, 'erase mode takes the piece under the pointer');
});

test('a structure plan builds rooms, walls, doors on shared walls, a stairwell and a roof, and the engine can walk it', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const SP = require(path.resolve(__dirname, '..', '..', 'editor/src/utils/StructurePlan.js'));
    const plan = {
        name: 'Cottage', size: [14, 10], storey: 5,
        materials: { wall: 'Stone', inner: 'Plaster', floor: 'Wood', wet: 'Stone', roof: 'RoofTile', stair: 'Wood' },
        floors: [
            { rooms: { hall: [1, 1, 6, 8], kitchen: [8, 1, 12, 8] }, doors: [['hall', 'outside', 2], ['hall', 'kitchen', 2]], wet: ['kitchen'] },
            { rooms: { landing: [1, 1, 6, 8], bedroom: [8, 1, 12, 8] }, doors: [['landing', 'bedroom', 2]] }
        ],
        stairs: [{ floor: 0, from: [5, 7], dir: 'north', width: 1 }],
        roof: { pitch: 2 }, windows: { every: 6, width: 2 }
    };
    assert.deepEqual(SP.sharedWall(plan.floors[0].rooms, plan.size, 'hall', 'kitchen').map(c => c.join(',')), ['7,1', '7,2', '7,3', '7,4', '7,5', '7,6', '7,7', '7,8'], 'the wall column between the two rooms');
    assert.deepEqual(SP.doorCells(plan.floors[0].rooms, plan.size, ['hall', 'kitchen', 2]).map(c => c.join(',')), ['7,4', '7,5'], 'a two-wide door centred on it');
    assert.deepEqual(SP.doorCells(plan.floors[0].rooms, plan.size, ['hall', 'outside', 2]).map(c => c.join(',')), ['3,9', '4,9'], 'the front door on the south wall');
    // A two-thick wall gets a door two deep.
    const thick = { hall: [1, 1, 6, 8], kitchen: [9, 1, 12, 8] };
    assert.deepEqual(SP.doorCells(thick, [14, 10], ['hall', 'kitchen', 2]).map(c => c.join(',')).sort(), ['7,4', '7,5', '8,4', '8,5']);
    assert.deepEqual({ ...SP.entrance(plan) }, { door: [4, 9], outside: [4, 10] });
    const pieces = SP.build(plan, 10, 10, 7);
    assert.equal(pieces[0].id, 7, 'ids continue from the map\'s');
    const at = (x, y, z) => pieces.filter(p => p.x === 10 + x && p.y === 10 + y && p.z === z).map(p => p.kind).sort().join('+');
    assert.equal(at(0, 0, 0), 'floor+wall'); assert.equal(at(7, 4, 0), 'doorway+floor'); assert.equal(at(7, 2, 0), 'floor+wall'); assert.equal(at(3, 9, 0), 'doorway+floor');
    assert.equal(at(9, 3, 0), 'floor'); assert.equal(pieces.find(p => p.x === 19 && p.y === 13 && p.z === 0).material, 'Stone', 'a wet room has the wet floor');
    assert.equal(at(5, 7, 0), 'stair'); assert.equal(at(5, 3, 4), 'stair', 'five steps north');
    assert.equal(at(5, 5, 5), '', 'the floor above the stairs is open');
    assert.equal(at(5, 8, 5), 'floor', 'and closed beside them');
    assert.equal(at(7, 4, 5), 'doorway+floor', 'an upstairs door, with a threshold under it');
    assert.equal(at(3, 0, 10), 'ramp'); assert.equal(at(3, 9, 10), 'ramp'); assert.equal(at(3, 4, 12), 'floor', 'a flat top between the pitches');
    assert.equal(at(3, 4, 10), 'floor', 'a ceiling over the top-floor room, under the roof');
    assert.equal(at(7, 4, 10), '', 'none over a wall');
    assert.equal(at(0, 3, 10), 'block', 'a gable closes the end');
    assert.equal(at(0, 3, 11), 'block'); assert.equal(at(0, 1, 10), 'block'); assert.equal(at(0, 1, 11), 'ramp', 'and steps with the pitch: one block under the second row of ramps');
    // Turned a quarter: the size swaps, the rooms turn, the stair runs east, doors still land on shared walls.
    const turned = SP.transform(plan, 1, 1);
    assert.deepEqual(turned.size, [10, 14]);
    assert.deepEqual(turned.floors[0].rooms.hall, [1, 1, 8, 6]);
    assert.deepEqual(turned.floors[0].rooms.kitchen, [1, 8, 8, 12]);
    assert.equal(turned.stairs[0].dir, 'east'); assert.deepEqual(turned.stairs[0].from, [2, 5]);
    assert.equal(SP.doorCells(turned.floors[0].rooms, turned.size, ['hall', 'kitchen', 2]).map(c => c.join(',')).join(' '), '4,7 5,7');
    const turnedPieces = SP.build(turned, 0, 0, 1, 3);
    assert.ok(turnedPieces.every(p => p.group === 3), 'stamped pieces carry the group');
    const turnedWalk = SP.validate(turned, turnedPieces, 0, 0, 30, 30, R);
    assert.deepEqual(Object.values(turnedWalk.report).map(r => r.reached), [true, true, true, true], 'the turned house is walked to every room');
    // Grown twice: rooms twice as big, walls two thick, doors twice as wide, the storey unchanged.
    const grown = SP.transform(plan, 0, 2);
    assert.deepEqual(grown.size, [28, 20]); assert.deepEqual(grown.floors[0].rooms.hall, [2, 2, 13, 17]); assert.equal(grown.floors[0].doors[1][2], 4);
    assert.equal(grown.storey, 5);
    assert.deepEqual(Object.values(SP.validate(grown, SP.build(grown, 0, 0), 0, 0, 40, 40, R).report).map(r => r.reached), [true, true, true, true]);
    // Groups: a stamped building moves, turns and grows as one; a tree on its footprint is set down beside it.
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    const E = context.RRMapElevation;
    const map = { width: 40, height: 40, reactor3d: { version: 1 } };
    E.addProp(map, { name: 'Tree', ext: '.glb', file: 'Tree.glb', x: 12, y: 12, z: 0 });
    E.restorePieces(map, SP.build(plan, 10, 10, 1, E.nextPieceGroup(map)));
    E.setStructure(map, { group: 1, plan: 'Cottage.json', x: 10, y: 10, rot: 0, scale: 1 });
    assert.deepEqual({ ...E.pieceGroupBounds(map, 1) }, { x0: 10, y0: 10, x1: 23, y1: 19 });
    assert.equal(E.relocatePropsOff(map, 10, 10, 14, 10), 1);
    assert.deepEqual([E.props(map)[0].x, E.props(map)[0].y], [8, 12], 'the tree stands two cells clear of the nearest wall (left and top tie; left wins)');
    assert.equal(E.movePieceGroup(map, 1, 20, 20), true);
    assert.deepEqual({ ...E.pieceGroupBounds(map, 1) }, { x0: 20, y0: 20, x1: 33, y1: 29 });
    assert.equal(E.movePieceGroup(map, 1, 30, 30), false, 'off the map: refused');
    assert.equal(E.rotatePieceGroup(map, 1), true);
    assert.deepEqual({ ...E.pieceGroupBounds(map, 1) }, { x0: 20, y0: 20, x1: 29, y1: 33 }, 'turned about its corner');
    assert.equal(E.structureOf(map, 1).plan, 'Cottage.json');
    const records = E.structures(map);
    assert.equal(E.restoreStructures(map, []), true); assert.equal(E.structureOf(map, 1), null);
    assert.equal(E.restoreStructures(map, records), true); assert.equal(E.structureOf(map, 1).x, 10, 'records restore with an undo');
    assert.match(read('editor/src/PieceBuilderManager.js'), /elevation\.restoreStructures\(map, entry\.structures\);/);
    // A hand-built house: the loose pieces touching one become a building.
    const loose = { width: 20, height: 20, reactor3d: { version: 1 } };
    for (let x = 2; x <= 5; x++) { E.setPiece(loose, { kind: 'wall', x, y: 2, z: 0 }); E.setPiece(loose, { kind: 'wall', x, y: 6, z: 0 }); }
    for (let y = 3; y <= 5; y++) { E.setPiece(loose, { kind: 'wall', x: 2, y, z: 0 }); E.setPiece(loose, { kind: 'wall', x: 5, y, z: 0 }); E.setPiece(loose, { kind: 'floor', x: 3, y, z: 0 }); E.setPiece(loose, { kind: 'floor', x: 4, y, z: 0 }); }
    E.setPiece(loose, { kind: 'block', x: 3, y: 3, z: 1 });
    E.setPiece(loose, { kind: 'fence', x: 12, y: 12, z: 0 });
    assert.equal(E.pieceGroupAt(loose, 3, 3), 0);
    const made = E.groupConnectedPieces(loose, 4, 2);
    assert.equal(made, 1);
    assert.equal(E.pieceGroup(loose, 1).length, 8 + 6 + 6 + 1, 'walls, floors and the stacked block, all touching');
    assert.equal(E.pieceAt(loose, 12, 12, 0).group, undefined, 'the fence across the yard is not part of it');
    assert.equal(E.pieceGroupAt(loose, 3, 4), 1, 'a cell inside the footprint belongs to the building');
    assert.equal(E.groupConnectedPieces(loose, 15, 15), 0, 'nothing there: nothing grouped');
    const manager2 = read('editor/src/PieceBuilderManager.js');
    assert.match(manager2, /const group = elevation\.groupConnectedPieces\(map, target\.x, target\.y\);/, 'Move mode on a loose piece groups its neighbours');
    assert.match(manager2, /if \(changed && group && elevation\.structureOf\(map, group\)\) \{\s*elevation\.removeStructure\(map, group\);/, 'a hand edit detaches the plan');
    assert.match(manager2, /if \(group\) piece\.group = group;/, 'and the new piece joins the building');
    E.setStructure(map, { group: 9, plan: 'Gone.json', x: 0, y: 0, rot: 0, scale: 1 });
    E.setPiece(map, { kind: 'block', x: 30, y: 30, z: 0 });
    assert.equal(E.structureOf(map, 9), null, 'a record with no pieces is dropped on the next write');
    assert.equal(E.removePieceGroup(map, 1), true);
    assert.equal(E.structureOf(map, 1), null, 'the record goes with the pieces');
    const managerSource = read('editor/src/PieceBuilderManager.js');
    assert.match(managerSource, /if \(elevation\.structureOf\(map, this\.selectedGroup\)\) return this\._restamp\(map, \{ x: Math\.floor\(x\), y: Math\.floor\(y\) \}\);/, 'a stamped building is built again where it goes');
    assert.match(managerSource, /const shaped = SP\.transform\(plan, record\.rot, record\.scale\);/);
    assert.match(managerSource, /elevation\.relocatePropsOff\(map, X0, Y0, W, H\);/);
    const report = SP.validate(plan, pieces, 10, 10, 40, 40, R);
    assert.deepEqual(Object.fromEntries(Object.entries(report.report).map(([k, v]) => [k, v.reached])), { hall: true, kitchen: true, landing: true, bedroom: true }, 'every room on both floors is walked to from the front door');
    assert.ok(report.report.bedroom.steps > report.report.landing.steps);
    // A plan whose rooms do not touch has no door between them, and the walk says so.
    const broken = JSON.parse(JSON.stringify(plan)); broken.floors[0].doors = [['hall', 'outside', 2]];
    const walk = SP.validate(broken, SP.build(broken, 0, 0), 0, 0, 30, 30, R);
    assert.equal(walk.report.kitchen.reached, false);
    // The panel offers the plans and stamps one on a click; the CLI stamps one on a project.
    const manager = read('editor/src/PieceBuilderManager.js');
    assert.match(manager, /path\.join\(projectPath, '3d', 'Structures'\)/);
    assert.match(managerSource, /elevation\.restorePieces\(map, kept\.concat\(SP\.build\(shaped, X0, Y0, firstId, record\.group, name => this\.resolvePlan\(name\)\)\)\);/, 'a stamp keeps what stands off the footprint, tags its own pieces, and resolves its parts');
    assert.match(manager, /return \{ pieces: elevation\.piecesSnapshot\(map\), terrain: elevation\.terrainSnapshot\(map\), structures: elevation\.structures\(map\) \};/, 'one undo step: pieces, ground and building records');
    assert.match(read('editor/src/MapEditor3D.js'), /if \(target && this\.pieceManager\(\)\.mode === 'stamp'\) \{[\s\S]{0,300}this\.pieceManager\(\)\.stampAt\(target\.x, target\.y\);/);
    assert.match(read('editor/index.html'), /src\/utils\/StructurePlan\.js/);
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', '..', 'editor/build-scripts/build-structure.cjs')));
    const demo = JSON.parse(read('template/Demo/3d/Structures/Manor.json'));
    assert.deepEqual(demo.size, [64, 44]);
    const i18n = read('editor/src/I18nManager.js');
    for (const key of ['pieces.structure', 'pieces.stamp', 'pieces.stampHint', 'pieces.structureNone', 'pieces.noStructures', 'pieces.move', 'pieces.moveHint', 'pieces.removeStructure', 'pieces.notStructure', 'pieces.structureSelected', 'pieces.rotate', 'pieces.scale', 'pieces.detached', 'pieces.grouped']) {
        assert.equal((i18n.match(new RegExp('"' + key.replace(/\./g, '\\.') + '": "', 'g')) || []).length, 18, key + ' in 18 locales');
    }
});

test('inside a building the roof and the wall in the camera\'s way are cut around the player', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /Reactor3D\.injectCutaway\(this, shader\);/, 'every lit material asks; only piece materials answer');
    assert.match(runtime, /if \(vRRWorldPos\.y > rrCutTop && vRRWorldPos\.x >= rrCutBox\.x/);
    // Faces between touching walls are not emitted: a row of three walls has no inner faces.
    const row = mapWith([1, 2, 3].map(i => ({ id: i, kind: 'wall', x: i, y: 1, z: 0, rot: 0, material: '' })));
    const rowTris = R.pieceGeometry(R.piecesOf(row), row).attributes.position.count / 3;
    const lone = R.pieceGeometry([{ id: 1, kind: 'wall', x: 1, y: 1, z: 0, rot: 0, material: '' }], mapWith([])).attributes.position.count / 3;
    assert.equal(lone, 10, 'a lone wall on the ground: five faces, ten triangles (no bottom)');
    assert.equal(rowTris, 3 * 10 - 4 * 2, 'three in a row: the four faces they press together are gone');
    assert.match(runtime, /if \(rrBayer < rrThin\) discard;/, 'a wall in the way is dithered thin, not cut');
    assert.match(runtime, /!\(material\.__reactorPieces \|\| material\.__reactorModel\)/, 'placed models thin in the sight line too');
    assert.match(runtime, /material\.__reactorPieces \? "if \(vRRWorldPos\.y > rrCutTop/, 'but only pieces lose their storey');
    assert.match(runtime, /rrAlong < rrSightLength - 3\.5\) \{"/, 'a model stops thinning well before the party, so the party never dissolves');
    assert.match(runtime, /vRRWorldPos\.y > rrCutFocus\.y - 1\.2/, 'floors under the player are never thinned');
    assert.match(read('runtime/reactor_sprites.js'), /state\.scene\.updateCutaway\(state\.viewport\.camera \? state\.viewport\.camera\(\) : null, \$dataMap, \$gamePlayer\);/);
    const house = mapWith([
        { id: 1, kind: 'floor', x: 2, y: 2, z: 0, rot: 0, material: 'Wood' },
        { id: 2, kind: 'floor', x: 2, y: 2, z: 5, rot: 0, material: 'Wood' },
        { id: 3, kind: 'ramp', x: 2, y: 2, z: 10, rot: 0, material: 'RoofTile' },
        { id: 4, kind: 'doorway', x: 3, y: 2, z: 0, rot: 0, material: '' }
    ]);
    assert.ok(R.pieceCoverAt(house, 2.5, 2.5, 0.1), 'downstairs, the upper floor is overhead');
    assert.ok(R.pieceCoverAt(house, 2.5, 2.5, 5.1), 'upstairs, the roof is overhead');
    assert.equal(R.pieceCoverAt(house, 3.5, 2.5, 0), null, 'a doorway lintel alone is not a roof');
    assert.equal(R.pieceCoverAt(house, 6.5, 6.5, 0), null, 'open ground');
    assert.deepEqual({ ...R.pieceCoverAt(house, 2.5, 2.5, 0.1) }, { x0: 2 - R.CUTAWAY_REACH, y0: 2 - R.CUTAWAY_REACH, x1: 3 + R.CUTAWAY_REACH, y1: 3 + R.CUTAWAY_REACH }, 'hand-laid: a stretch around the cell');
    const grouped = mapWith([{ id: 1, kind: 'floor', x: 4, y: 4, z: 5, rot: 0, material: '', group: 7 }, { id: 2, kind: 'wall', x: 6, y: 7, z: 0, rot: 0, material: '', group: 7 }]);
    assert.deepEqual({ ...R.pieceCoverAt(grouped, 4.5, 4.5, 0) }, { x0: 4, y0: 4, x1: 7, y1: 8 }, 'stamped: the building\'s own footprint');
    const scene = Object.create(R.MapScene.prototype);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(10, 8, 12); camera.updateMatrixWorld();
    const shared = R.cutawayUniforms();
    scene.updateCutaway(camera, house, { _realX: 2, _realY: 2 });
    assert.ok(Math.abs(shared.rrCutTop.value - 4.5) < 1e-9, 'downstairs: cut half a tile under the upper floor');
    assert.deepEqual(shared.rrCutBox.value, [2 - R.CUTAWAY_REACH, 2 - R.CUTAWAY_REACH, 3 + R.CUTAWAY_REACH, 3 + R.CUTAWAY_REACH]);
    assert.deepEqual(shared.rrCutEye.value, [10, 8, 12]);
    assert.ok(Math.abs(shared.rrCutFocus.value[1] - 1.6) < 1e-9, 'the sight line ends at chest height');
    assert.equal(shared.rrCutRadius.value, R.CUTAWAY_RADIUS);
    scene.updateCutaway(camera, house, { _realX: 2, _realY: 2, _reactorGround: 5.1 });
    assert.ok(Math.abs(shared.rrCutTop.value - 9.5) < 1e-9, 'upstairs: the roof goes, the storey stays');
    scene.updateCutaway(camera, house, { _realX: 6, _realY: 6 });
    assert.equal(shared.rrCutTop.value, 1e9, 'outside: nothing overhead is cut');
    assert.equal(shared.rrCutRadius.value, R.CUTAWAY_RADIUS, 'but a wall in the way still opens');
    scene.updateCutaway(null, house, null);
    assert.equal(shared.rrCutRadius.value, 0, 'no player, no cut: the editor');
    const materialSource = runtime.slice(runtime.indexOf('Reactor3D.MapScene.prototype.pieceMaterial'), runtime.indexOf('Reactor3D.MapScene.prototype.layPieceChunks'));
    assert.match(materialSource, /material\.__reactorPieces = true;/);
});

test('the flat map shows a building as a plan from above', () => {
    const context = { console, window: {}, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js'), context);
    const M = context.PieceBuilderManager;
    const cells = M.cellSummary([
        { x: 1, y: 1, z: 0, kind: 'floor' }, { x: 1, y: 1, z: 0, kind: 'wall' },
        { x: 2, y: 1, z: 0, kind: 'floor' }, { x: 2, y: 1, z: 5, kind: 'floor' }, { x: 2, y: 1, z: 10, kind: 'ramp' },
        { x: 3, y: 1, z: 0, kind: 'doorway' }, { x: 3, y: 1, z: 0, kind: 'floor' }
    ]);
    assert.deepEqual([...cells.map(c => [c.x, c.y, c.kind, c.z].join(':'))], ['1:1:wall:0', '2:1:floor:0', '3:1:doorway:0'], 'the ground storey is the plan: a roof over a floor is not shown, and on one level a wall or door beats the slab under it');
    assert.deepEqual([...M.cellSummary([{ x: 5, y: 5, z: 10, kind: 'ramp' }, { x: 5, y: 5, z: 5, kind: 'floor' }]).map(c => c.kind + ':' + c.z)], ['ramp:10'], 'nothing in the ground storey: the topmost piece');
    for (const kind of ['wall', 'block', 'floor', 'pillar', 'stair', 'ramp', 'roof', 'doorway', 'window', 'fence']) assert.ok(M.OVERLAY_COLOURS[kind] > 0, kind + ' has a colour');
    // Drawn on the tilemap's container, whichever tab is up, and after every edit.
    const drawn = [];
    context.PIXI = { Container: class { constructor() { this.children = []; this.destroyed = false; } addChild(c) { this.children.push(c); c.parent = this; } removeChildren() { const c = this.children; this.children = []; return c; } removeChild() {} destroy() { this.destroyed = true; } },
        Graphics: class { constructor() { this.rects = []; } rect(x, y, w, h) { this.rects.push([x, y, w, h]); return this; } fill(style) { this.style = style; drawn.push(this); return this; } destroy() {} } };
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    const map = { id: 1, width: 8, height: 8, reactor3d: { version: 1, pieces: [{ id: 1, kind: 'wall', x: 2, y: 3, z: 0, rot: 0, material: '' }, { id: 2, kind: 'floor', x: 3, y: 3, z: 0, rot: 0, material: '' }] } };
    const stage = new context.PIXI.Container();
    const manager = new M({ getTilemapManager: () => ({ currentMap: map, container: stage, TILE_WIDTH: 48, TILE_HEIGHT: 48 }) });
    manager.setMap(map, { currentMap: map, container: stage, TILE_WIDTH: 48, TILE_HEIGHT: 48 });
    assert.equal(stage.children.length, 1, 'one overlay container on the map');
    assert.equal(drawn.length, 2, 'one graphics per kind');
    assert.deepEqual(drawn.find(g => g.style.color === M.OVERLAY_COLOURS.wall).rects, [[2 * 48 + 1, 3 * 48 + 1, 46, 46]]);
    assert.match(read('editor/src/main.js'), /this\.pieceBuilderManager\?\.setMap\(/, 'every loaded map hands itself to the overlay');
    assert.match(read('editor/src/PieceBuilderManager.js'), /announce\(terrainToo = false, region = null\) \{\s*this\.render2D\(\);/, 'every edit redraws it');
});

test('the camera never stands inside a wall or roof, and a cut roof does not stop it', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const house = mapWith([
        { id: 1, kind: 'wall', x: 4, y: 2, z: 0, rot: 0, material: '' },
        { id: 2, kind: 'floor', x: 2, y: 2, z: 0, rot: 0, material: '' },
        { id: 3, kind: 'ramp', x: 2, y: 2, z: 5, rot: 0, material: '', group: 3 },
        { id: 4, kind: 'doorway', x: 3, y: 2, z: 0, rot: 0, material: '' },
        { id: 5, kind: 'stair', x: 6, y: 2, z: 0, rot: 0, material: '' }
    ]);
    assert.equal(R.pieceSolidAt(house, 4.5, 2.5, 2.5), true, 'inside a wall');
    assert.equal(R.pieceSolidAt(house, 4.5, 2.5, 5.5), false, 'above it');
    assert.equal(R.pieceSolidAt(house, 2.5, 0.05, 2.5), false, 'a floor is open');
    assert.equal(R.pieceSolidAt(house, 3.5, 2.5, 2), false, 'a doorway is open');
    assert.equal(R.pieceSolidAt(house, 2.5, 5.5, 2.5), true, 'inside a roof ramp');
    assert.equal(R.pieceSolidAt(house, 2.5, 5.5, 2.5, { top: 4.5, box: [2, 2, 3, 3] }), false, 'a cut-away roof is not solid');
    assert.equal(R.pieceSolidAt(house, 6.5, 0.1, 2.2), true, 'inside a stair\'s low step');
    assert.equal(R.pieceSolidAt(house, 6.5, 0.4, 2.2), false, 'just over the low end of the slope');
    assert.equal(R.pieceSolidAt(house, 6.5, 0.5, 2.8), true, 'inside the stair\'s high end');
    const camera = new THREE.PerspectiveCamera();
    const focus = { x: 2.5, y: 1.3, z: 2.5 };
    camera.position.set(8.5, 2.5, 2.5); camera.updateMatrixWorld();
    assert.equal(R.clearCameraPath(camera, focus, house), false, 'a wall between camera and player is left to the fade');
    assert.equal(camera.position.x, 8.5);
    camera.position.set(4.5, 2.5, 2.5); camera.updateMatrixWorld();
    assert.equal(R.clearCameraPath(camera, focus, house), true, 'a camera inside the wall comes out of it');
    assert.ok(camera.position.x < 4 && camera.position.x > 2.5, 'on the player\'s side of the wall at x 4: ' + camera.position.x.toFixed(2));
    camera.position.set(2.5, 8, 6.5); camera.updateMatrixWorld();
    assert.equal(R.clearCameraPath(camera, focus, house), false, 'a clear line is left alone');
    assert.equal(R.clearCameraPath(camera, focus, mapWith([])), false, 'no pieces: nothing to do');
    assert.equal((read('runtime/reactor_3d.js').match(/keepOutOfWalls\(camera, resolved\);/g) || []).length, 2, 'the game camera asks after aiming, on both paths');
});

test('a plan of plans: parts, paths and named spots stamp as one and walk as one', () => {
    loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const SP = require(path.resolve(__dirname, '..', '..', 'editor/src/utils/StructurePlan.js'));
    const cottage = JSON.parse(read('template/Demo/3d/Structures/Cottage.json'));
    const hamlet = JSON.parse(read('template/Demo/3d/Structures/Hamlet.json'));
    const resolve = name => (name === 'Cottage.json' ? cottage : null);
    const pieces = SP.build(hamlet, 100, 100, 1, 9, resolve);
    assert.ok(pieces.length > 4 * 600, 'four cottages and the paths');
    assert.ok(pieces.every(p => p.group === 9), 'one building: the hamlet');
    assert.ok(pieces.some(p => p.kind === 'floor' && p.material === 'Sand' && p.x === 109 && p.y === 120), 'a sand path');
    const ids = new Set(pieces.map(p => p.id));
    assert.equal(ids.size, pieces.length, 'ids stay unique across parts');
    const spots = SP.spots(hamlet, 100, 100, resolve);
    assert.deepEqual([...spots.start], [109, 120]); assert.deepEqual([...spots['north.bed']], [106, 106]);
    assert.deepEqual([...spots['east.bed']], [149, 108], 'a part turned once carries its spots turned');
    const walk = SP.validate(hamlet, pieces, 100, 100, 200, 200, R, resolve);
    assert.ok(walk, 'a plan of parts starts from its start spot');
    assert.deepEqual([...walk.start && [walk.start.x, walk.start.y]], [109, 120]);
    const missed = Object.entries(walk.report).filter(([, r]) => !r.reached).map(([k]) => k);
    assert.deepEqual(missed, [], 'every room of every cottage is walked to from the start');
    assert.ok('north.room' in walk.report && 'west.kitchen' in walk.report);
    // Turning the hamlet turns its parts about the whole.
    const turned = SP.transform(hamlet, 1, 1);
    assert.deepEqual(turned.size, [48, 64]);
    assert.equal(turned.parts[0].rot, 1); assert.deepEqual([...turned.spots.start], [48 - 1 - 20, 9]);
    // The editor: the stamp ghost is the building itself, records keep spots, sibling plans resolve by name.
    const manager = read('editor/src/PieceBuilderManager.js');
    assert.match(manager, /ghostGeometryFor\(plan, rot = 0, scale = 1\)/);
    assert.match(manager, /record\.spots = SP\.spots\(shaped, X0, Y0, name => this\.resolvePlan\(name\)\);/);
    assert.match(read('editor/src/MapEditor3D.js'), /const silhouette = stamp && !bounds \? manager\.ghostGeometryFor\(stamp\) : null;/);
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    const E = context.RRMapElevation;
    const map = { width: 10, height: 10, reactor3d: { version: 1 } };
    E.setPiece(map, { kind: 'wall', x: 1, y: 1, z: 0 }); map.reactor3d.pieces[0].group = 1;
    E.setStructure(map, { group: 1, plan: 'Hamlet.json', x: 0, y: 0, rot: 0, scale: 1, spots: { well: [3, 4] } });
    assert.deepEqual({ ...E.structureOf(map, 1).spots }, { well: [3, 4] });
});

test('a plan places events at its spots; a hand-edited event survives a re-stamp; a removed building takes its events', () => {
    const SP = require(path.resolve(__dirname, '..', '..', 'editor/src/utils/StructurePlan.js'));
    const cottage = JSON.parse(read('template/Demo/3d/Structures/Cottage.json'));
    const hamlet = JSON.parse(read('template/Demo/3d/Structures/Hamlet.json'));
    const resolve = name => (name === 'Cottage.json' ? cottage : null);
    const wanted = SP.eventsOf(hamlet, 100, 100, resolve);
    assert.equal(wanted.length, 4, 'one villager per cottage');
    assert.deepEqual([...wanted.map(w => w.key)], ['north.table', 'east.table', 'south.table', 'west.table']);
    assert.deepEqual([...wanted[0].at], [109, 110]);
    const template = JSON.parse(read('template/Demo/3d/Structures/events/villager.json'));
    const map = { width: 200, height: 200, events: [null, { id: 1, name: 'Existing', note: '', x: 5, y: 5, pages: [] }] };
    const placed = SP.placeEvents(map, 8, wanted, name => (name === 'villager' ? template : null));
    assert.equal(placed.length, 4);
    assert.equal(placed[0].id, 2, 'ids continue after the map\'s own');
    assert.equal(placed[0].name, 'Villager'); assert.equal(placed[0].note, '<structure:8><spot:north.table>');
    assert.equal(placed[0].pages[0].list[1].parameters[0], 'Welcome to North Haven.', 'the template\'s page');
    assert.notEqual(placed[0].pages, template.pages, 'a copy, not the template itself');
    assert.equal(map.events.filter(Boolean).length, 5);
    // A person edits the villager's page by hand; the building is moved and stamped again: the event moves, the page stays.
    placed[0].pages[0].list[1].parameters[0] = 'Mind the well.';
    const moved = SP.placeEvents(map, 8, SP.eventsOf(hamlet, 120, 100, resolve), () => template);
    assert.equal(moved.length, 4); assert.equal(map.events.filter(Boolean).length, 5, 'no duplicates');
    assert.deepEqual([map.events[2].x, map.events[2].y], [129, 110], 'moved with the building');
    assert.equal(map.events[2].pages[0].list[1].parameters[0], 'Mind the well.', 'the hand edit survives');
    // A spot the plan drops loses its event; a removed building loses them all; the map's own event stays.
    const fewer = JSON.parse(JSON.stringify(hamlet)); fewer.parts = fewer.parts.slice(0, 2);
    SP.placeEvents(map, 8, SP.eventsOf(fewer, 120, 100, resolve), () => template);
    assert.equal(map.events.filter(Boolean).length, 3);
    assert.equal(SP.removeGroupEvents(map, 8), 2);
    assert.deepEqual([...map.events.filter(Boolean).map(e => e.name)], ['Existing']);
    // A missing template still makes a plain event; a spot off the map is skipped.
    const small = { width: 4, height: 4, events: [null] };
    const plain = SP.placeEvents(small, 1, [{ key: 'a', name: 'A', template: 'nope', direction: 8, at: [1, 1] }, { key: 'b', name: 'B', template: '', direction: 2, at: [9, 9] }], () => null);
    assert.equal(plain.length, 1); assert.equal(plain[0].pages[0].image.direction, 8);
    // The editor and the CLI both place, and the Manor's Steward is on North Haven.
    assert.match(read('editor/src/PieceBuilderManager.js'), /SP\.placeEvents\(map, record\.group, wanted, name => this\.loadEventTemplate\(name\)\);/);
    assert.match(read('editor/src/PieceBuilderManager.js'), /RRStructurePlan\.removeGroupEvents\(map, this\.selectedGroup\)/);
    assert.match(read('editor/build-scripts/build-structure.cjs'), /SP\.placeEvents\(map, group, SP\.eventsOf\(plan, X0, Y0, resolve\), loadTemplate\)/);
    const north = JSON.parse(read('template/Demo/data/Map005.json'));
    const steward = north.events.find(e => e && e.name === 'Steward');
    assert.ok(steward && /<structure:\d+><spot:desk>/.test(steward.note), 'the Steward is tagged with his building and spot');
});
