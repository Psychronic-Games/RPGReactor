// Pieces: the 3D tileset. Blocks on cells at levels, turned in quarter
// turns, wearing a material; the runtime stands characters on their tops
// and blocks what cannot be stepped onto through the terrain's rise rule.
const { source3D } = require('./helpers/runtime-3d-source.cjs');
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
    assert.equal(E.setPiece(map, { kind: 'floor', x: 2, y: 3, z: 0, material: 'Wood' }), 2, 'a floor slab shares a cell and level with what stands on it: another piece');
    assert.notEqual(map.reactor3d.pieces, first, 'every change is a new array, which is what the runtime indexes by');
    assert.equal(E.setPiece(map, { kind: 'wall', x: 2, y: 3, z: 0, material: 'Stone' }), 1, 'a wall on the block\'s slot replaces the block, keeping the id, and the slab stays');
    assert.equal(E.pieces(map).length, 2);
    assert.equal(E.setPiece(map, { kind: 'block', x: 2, y: 3, z: 1, material: 'Stone' }), 3, 'a level up is another piece');
    assert.equal(E.setPiece(map, { kind: 'block', x: 9, y: 3, z: 0 }), 0, 'off the map: nothing');
    assert.equal(E.setPiece(map, { kind: 'castle', x: 1, y: 1, z: 0 }), 0, 'an unknown kind: nothing');
    assert.deepEqual([...E.pieceMaterials(map)], ['Stone', 'Wood']);
    const saved = E.piecesSnapshot(map);
    assert.equal(E.removePiece(map, 2, 3, 1), true);
    assert.equal(E.removePiece(map, 2, 3, 1), false);
    assert.equal(E.pieces(map).length, 2);
    assert.equal(E.removePiece(map, 2, 3, 0), true, 'the wall goes first');
    assert.equal(E.pieces(map)[0].kind, 'floor', 'the slab is still there');
    E.restorePieces(map, saved);
    assert.equal(E.pieces(map).length, 3);
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
    const runtime = source3D();
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
    assert.equal(stone.geometry.attributes.position.count, 2 * 10 * 3, 'two blocks side by side on the ground: five faces each (a bottom, no shared face), ten triangles');
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
    assert.match(source3D(), /ImageManager\.loadBitmap\("img\/materials\/", name\)/);
    assert.match(source3D(), /this\.addPieces\(mapData, settings\.loadMaterial \|\| \(name => Reactor3D\.defaultMaterialLoader\(name\)\)\);/);
});

test('building happens in the world: the hammer in the toolbar opens a bar over the 3D view, and the pieces tab is gone', () => {
    const paletteSource = read('editor/src/TilesetPaletteViewer.js');
    assert.doesNotMatch(paletteSource, /createLayerTab\('P'/, 'no pieces tab in the palette');
    const htmlSource = read('editor/index.html');
    assert.match(htmlSource, /data-action="build-tool"/, 'the Build button in the toolbar beside Lighting and Media');
    assert.doesNotMatch(htmlSource, /id="map-build"/, 'no checkbox in the map bar');
    assert.match(htmlSource, /src\/utils\/ShapeGizmo3D\.js/, 'the shared handles are loaded');
    assert.match(read('editor/src/UIManager.js'), /case 'build-tool':\s*window\.reactor\?\.buildHotbar\?\.toggle\(\);/, 'the button toggles the bar');
    assert.match(htmlSource, /src\/BuildHotbar\.js/, 'the bar is loaded');
    assert.match(htmlSource, /src\/PieceBuilderManager\.js/);
    const mainSource = read('editor/src/main.js');
    assert.match(mainSource, /this\.buildHotbar = new BuildHotbar\(this\.projectController\)/);
    assert.match(mainSource, /this\.buildHotbar\.mount\(document\.getElementById\('canvas-container'\)\)/, 'mounted over the map canvas');
    assert.match(mainSource, /\['\[data-action="build-tool"\]','pieces'\]/, 'the button lights while building');
    assert.match(mainSource, /if \(owner !== 'pieces'\) \{ this\.pieceBuilderManager\?\.deactivate\(\); this\.buildHotbar\?\.hide\(false\); \}/, 'another owner puts the tool down and the bar away');
    assert.match(mainSource, /new PieceBuilderManager\(this\.projectController\)/);
    const barSource = read('editor/src/BuildHotbar.js');
    assert.match(barSource, /static PIECES = \['floor', 'wall', 'doorway', 'window', 'glass', 'stair', 'ramp', 'roof', 'pillar', 'fence', 'block'\]/, 'the slots a child reaches for first, by the kinds\' own names');
    assert.match(barSource, /static SLOTS = \['select'\]\.concat/, 'Select comes first');
    assert.match(barSource, /static EXTRA = \['shape', 'screen', 'light', 'hammer', 'blueprint'\]/);
    assert.match(barSource, /if \(\/\^\[0-9\]\$\/\.test\(event\.key\)\)/, 'number keys pick slots');
    const managerSrc = read('editor/src/PieceBuilderManager.js');
    assert.match(managerSrc, /mode !== 'screen' && mode !== 'light'/, 'screens and lights are modes of the one tool');
    assert.match(managerSrc, /placeEffectAt\(target\) \{/);
    assert.match(managerSrc, /if \(!stack\.length\) return this\.removeEffectAt\(map, target\);/, 'the hammer takes screens and lights too');
    // Select: a placed piece is picked up, edited in place, moved, turned and removed; a stair run climbs; a ramp is a sized wedge.
    const ctx2 = { console, window: {}, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    ctx2.window = ctx2;
    ctx2.Reactor3D = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), ctx2);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js'), ctx2);
    const map2 = { id: 4, width: 12, height: 12, reactor3d: { version: 1 } };
    const m = new ctx2.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map2 }) });
    const E2 = ctx2.RRMapElevation;
    m.material = 'Stone';
    m.beginStroke({ x: 2, y: 2, z: 0 }); m.endStroke();
    m.setKind('stair'); m.stairSteps = 3; m.rot = 3;
    m.beginStroke({ x: 4, y: 4, z: 0 }); m.endStroke();
    const stairs = E2.pieces(map2).filter(p => p.kind === 'stair');
    assert.equal(JSON.stringify(stairs.map(p => [p.x, p.y, p.z])), JSON.stringify([[4, 4, 0], [5, 4, 1], [6, 4, 2]]), 'three stairs climb east, one cell on and one level up each');
    m.setKind('wedge');
    assert.deepEqual([...m.pieceFor({ x: 0, y: 0, z: 0 }).size], [2, 1, 3], 'the ramp slot is a wedge two wide, one tall, three long');
    m.setSize('wedge', [3, 1.5, 6]);
    assert.deepEqual([...m.pieceFor({ x: 0, y: 0, z: 0 }).size], [3, 1.5, 6], 'the panel sizes it');
    m.beginStroke({ x: 8, y: 8, z: 0 }); m.endStroke();
    m.setMode('select');
    const wall = m.selectAt({ x: 2, y: 2, z: 0, height: 0.5 });
    assert.equal(wall && wall.kind, 'wall', 'the wall is picked up');
    assert.equal(m.updateSelected({ material: 'Steel' }), true);
    assert.equal(E2.pieces(map2).find(p => p.id === wall.id).material, 'Steel', 'painted in place, same id');
    m.turnSelected();
    assert.equal(m.selectedPiece().rot, 1, 'turned');
    m.moveSelectedPieceTo(5.5, 6.5);
    assert.deepEqual([m.selectedPiece().x, m.selectedPiece().y], [5, 6], 'moved to the cell');
    const before = m.undoStack.length;
    m.undo();
    assert.deepEqual([m.pieceById(wall.id).x, m.pieceById(wall.id).y], [2, 2], 'undo brings it back');
    assert.ok(before > 0);
    const ramp = m.selectAt({ x: 8, y: 8, z: 0, height: 0.3 });
    assert.equal(ramp && ramp.kind, 'wedge', 'a shape is picked up through its footprint');
    m.moveSelectedPieceTo(8.25, 9.75, 1);
    assert.deepEqual([m.selectedPiece().x, m.selectedPiece().y, ...m.selectedPiece().offset, m.selectedPiece().z], [8, 9, -0.25, 0.25, 1], 'a shape moves to any quarter tile and height');
    m.removeSelected();
    assert.equal(E2.pieces(map2).some(p => p.kind === 'wedge'), false, 'removed');
    assert.equal(m.selected, 0);
    // A box dragged round pieces selects them all: painted, moved, turned and removed together, one undo step each.
    m.setMode('place'); m.setKind('wall'); m.rot = 0; m.material = 'Stone';
    m.beginStroke({ x: 1, y: 7, z: 0 }); m.endStroke();
    m.beginStroke({ x: 3, y: 7, z: 0 }); m.endStroke();
    m.setKind('block');
    m.beginStroke({ x: 1, y: 9, z: 1 }); m.endStroke();
    m.setMode('select');
    assert.equal(m.selectInBox(3, 9, 1, 7), 3, 'three pieces in the box, any level, corners in any order');
    assert.equal(m.selectionIds().length, 3);
    const boxIds = m.selectionIds().slice();
    assert.equal(m.updateSelection({ material: 'Steel' }), true);
    assert.equal(E2.pieces(map2).filter(p => boxIds.includes(p.id) && p.material === 'Steel').length, 3, 'one swatch paints them all');
    const byCell = (a, b) => a[0] - b[0] || a[1] - b[1];
    m.moveSelectionBy(2, 1);
    assert.equal(JSON.stringify(m.selectionPieces().map(p => [p.x, p.y, p.z]).sort(byCell)), JSON.stringify([[3, 8, 0], [3, 10, 1], [5, 8, 0]]), 'moved together, levels kept');
    m.moveSelectionBy(20, 0);
    assert.equal(Math.max(...m.selectionPieces().map(p => p.x)), 11, 'a move is cut down so nothing leaves the map');
    m.moveSelectionBy(-6, 0);
    m.turnSelection();
    assert.equal(JSON.stringify(m.selectionPieces().map(p => [p.x, p.y, p.rot]).sort(byCell)), JSON.stringify([[3, 8, 1], [5, 8, 1], [5, 10, 1]]), 'a quarter turn carries each piece round the box and turns it');
    const undoDepth = m.undoStack.length;
    m.undo();
    assert.equal(JSON.stringify(m.selectionPieces().map(p => [p.x, p.y]).sort(byCell)), JSON.stringify([[3, 8], [3, 10], [5, 8]]), 'undo takes the turn back in one step');
    assert.equal(m.undoStack.length, undoDepth - 1);
    assert.equal(m.selectAt({ x: 3, y: 8, z: 0, height: 0.5 }).id, boxIds[0], 'a press on one of the box keeps the box');
    assert.equal(m.selectionIds().length, 3);
    m.removeSelection();
    assert.equal(E2.pieces(map2).filter(p => boxIds.includes(p.id)).length, 0, 'all removed');
    assert.equal(m.selectionIds().length, 0);
    m.undo();
    assert.equal(E2.pieces(map2).filter(p => boxIds.includes(p.id)).length, 3, 'and back');
    const viewSource = read('editor/src/MapEditor3D.js');
    assert.match(viewSource, /if \(ground\) this\.pointer\.band = \{ start: ground, end: ground, planeY, started: false \};/, 'a press in select mode arms the box; a drag starts it');
    assert.ok(viewSource.includes("selectInBox(box.x0, box.y0, box.x1, box.y1)"));
    assert.ok(viewSource.includes("manager.moveSelectionBy(dx, dy, false)"), "dragging a selected piece moves the whole box");
    const barSrc2 = read('editor/src/BuildHotbar.js');
    assert.match(barSrc2, /build.selectedMany/);
    for (const key of ['build.selectedMany', 'build.manyHint', 'build.boxHint']) assert.equal((read('editor/src/I18nManager.js').match(new RegExp('"' + key.replace(/\./g, '\\.') + '":', 'g')) || []).length, 18, key + ' in 18 locales');
    assert.match(viewSource, /if \(event\?\.detail\?\.pieces && this\.updatePiecesInPlace\(event\.detail\.region \|\| null\)\) return;/, 'a piece edit never rebuilds the scene');
    assert.match(viewSource, /loadMaterial: name => materials\[name\] \|\| null/);
    assert.match(viewSource, /return \{ x, y, z: Math\.min\(max, z\), side: sideName, faceCell, height: Math\.max\(0, rel\), top \};/, 'a target knows the face it points at');
    assert.match(viewSource, /mode === 'screen' \|\| this\.pieceManager\(\)\.mode === 'light'\)\) \{[\s\S]{0,300}placeEffectAt\(target\)/, 'a click places a screen or a light');
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

test('a rectangle stroke lines its edge with walls, fills it with floors, and follows the pointer', () => {
    const context = { console, window: {}, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js'), context);
    const E = context.RRMapElevation;
    const map = { id: 3, width: 8, height: 8, reactor3d: { version: 1 } };
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    manager.material = 'Stone';
    // Ctrl held from the click: the rectangle between the first cell and the pointer, walls round its edge.
    assert.equal(manager.beginStroke({ x: 1, y: 1, z: 0 }, undefined, { rectangle: true }), true);
    assert.equal(manager.paintAt({ x: 4, y: 3, z: 0 }, { rectangle: true }), true);
    assert.equal(E.pieces(map).length, 10, 'a 4 by 3 rectangle: ten cells on its edge, none inside');
    assert.equal(E.pieceAt(map, 2, 2, 0), null, 'the inside is open');
    assert.equal(manager.paintAt({ x: 2, y: 2, z: 0 }), true, 'once a rectangle, the stroke stays one');
    assert.equal(E.pieces(map).length, 4, 'a rectangle that shrinks leaves nothing behind');
    assert.equal(manager.paintAt({ x: 2, y: 2, z: 0 }), false, 'the same corner again lays nothing');
    manager.endStroke();
    assert.equal(manager.undoStack.length, 1, 'one rectangle, one undo step');
    manager.undo();
    assert.equal(E.hasPieces(map), false);
    manager.redo();
    // Ctrl pressed after the click: the run so far becomes a rectangle from where it started. Floors fill.
    manager.setKind('floor');
    manager.beginStroke({ x: 0, y: 0, z: 2 });
    manager.paintAt({ x: 1, y: 0, z: 2 });
    assert.equal(manager.paintAt({ x: 2, y: 2, z: 2 }, { rectangle: true }), true);
    const floors = E.pieces(map).filter(piece => piece.kind === 'floor');
    assert.equal(floors.length, 9, 'a 3 by 3 floor fills its rectangle');
    assert.ok(floors.every(piece => piece.z === 2), 'at the level of the first piece');
    manager.endStroke();
    // An erase rectangle takes everything at that level inside it.
    manager.setMode('erase');
    manager.beginStroke({ x: 0, y: 0, z: 2 }, undefined, { rectangle: true });
    manager.paintAt({ x: 2, y: 2, z: 2 });
    manager.endStroke();
    assert.equal(E.pieces(map).filter(piece => piece.kind === 'floor').length, 0);
    assert.equal(E.pieces(map).length, 4, 'the walls at level 0 were not in its way');
});

test('a placing stroke stays on the plane of its first piece; an erasing one follows the pieces', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const source = read('editor/src/MapEditor3D.js');
    const MapEditor3D = vm.runInNewContext(source + '\nMapEditor3D;', {
        console: Object.assign(Object.create(console), { warn() {}, error() {} }), window: {},
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
        Reactor3D: R, THREE, require, setTimeout, clearTimeout
    });
    const view = new MapEditor3D({});
    const map = mapWith([]);
    view.currentMap = () => map;
    view.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
    view.pieceManager = () => ({ level: 0, mode: 'place' });
    view.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    view.camera.position.set(5.5, 12, 5.5); view.camera.lookAt(5.5, 0, 5.5);
    view.camera.updateProjectionMatrix(); view.camera.updateMatrixWorld();
    // The stroke began three levels up on cell (5,5): its plane is three tiles above that cell's ground.
    view.pointer = { pieceStroke: view.pieceStrokePlane({ x: 5, y: 5, z: 3 }) };
    assert.deepEqual({ ...view.pointer.pieceStroke }, { z: 3, planeY: 3 });
    assert.deepEqual({ ...view.pieceStrokeTargetAt(100, 100) }, { x: 5, y: 5, z: 3 }, 'straight down from the camera: the anchor cell, at the stroke\'s level');
    const moved = view.pieceStrokeTargetAt(140, 100);
    assert.equal(moved.z, 3, 'the drag stays at the level whatever it crosses');
    assert.ok(moved.x > 5 && moved.y === 5, 'and moves with the pointer along the plane');
    view.camera.lookAt(5.5, 40, 5.5); view.camera.updateMatrixWorld();
    assert.equal(view.pieceStrokeTargetAt(100, 100), null, 'a camera looking up never meets the plane: the drag lands nowhere');
    view.pieceManager = () => ({ level: 0, mode: 'erase' });
    assert.deepEqual({ ...view.pieceStrokePlane({ x: 5, y: 5, z: 3 }) }, { erase: true }, 'erasing keeps following the pieces themselves');
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
    assert.deepEqual(Object.fromEntries(Object.entries(report.report).map(([k, v]) => [k, v.reached])), { hall: true, kitchen: true, 'landing (2)': true, 'bedroom (2)': true }, 'every room on both floors is walked to from the front door');
    assert.ok(report.report['bedroom (2)'].steps > report.report['landing (2)'].steps);
    // A plan whose rooms do not touch has no door between them, and the walk says so.
    const broken = JSON.parse(JSON.stringify(plan)); broken.floors[0].doors = [['hall', 'outside', 2]];
    const walk = SP.validate(broken, SP.build(broken, 0, 0), 0, 0, 30, 30, R);
    assert.equal(walk.report.kitchen.reached, false);
    // The panel offers the plans and stamps one on a click; the CLI stamps one on a project.
    const manager = read('editor/src/PieceBuilderManager.js');
    assert.match(manager, /path\.join\(projectPath, '3d', 'Structures'\)/);
    assert.match(managerSource, /elevation\.restorePieces\(map, kept\.concat\(SP\.build\(shaped, X0, Y0, firstId, record\.group, name => this\.resolvePlan\(name\)\)\)\);/, 'a stamp keeps what stands off the footprint, tags its own pieces, and resolves its parts');
    assert.match(manager, /return \{ pieces: elevation\.piecesSnapshot\(map\), terrain: elevation\.terrainSnapshot\(map\), structures: elevation\.structures\(map\),\s*surfaces: JSON\.stringify\(sidecar\.mediaSurfaces \|\| null\), lights: JSON\.stringify\(sidecar\.lights \|\| null\) \};/, 'one undo step: pieces, ground and building records');
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
    const runtime = source3D();
    assert.match(runtime, /Reactor3D\.injectCutaway\(this, shader\);/, 'every lit material asks; only piece materials answer');
    assert.match(runtime, /if \(vRRWorldPos\.y > rrCutTop && vRRWorldPos\.x >= rrCutBox\.x/);
    // Faces between touching walls are not emitted: a row of three walls has no inner faces.
    const row = mapWith([1, 2, 3].map(i => ({ id: i, kind: 'wall', x: i, y: 1, z: 0, rot: 0, material: '' })));
    const rowTris = R.pieceGeometry(R.piecesOf(row), row).attributes.position.count / 3;
    const lone = R.pieceGeometry([{ id: 1, kind: 'wall', x: 1, y: 1, z: 0, rot: 0, material: '' }], mapWith([])).attributes.position.count / 3;
    assert.equal(lone, 12, 'a lone wall on the ground: six faces (the bottom is what a cut wall shows from above)');
    assert.equal(rowTris, 3 * 12 - 4 * 2, 'three in a row: the four faces they press together are gone');
    // On a shaped map too, wherever the neighbours stand on the same ground; a step in the ground between them keeps the faces (no seam).
    const shaped = mapWith([1, 2, 3].map(i => ({ id: i, kind: 'wall', x: i, y: 1, z: 0, rot: 0, material: '' })));
    shaped.reactor3d.terrain = new Array((shaped.width + 1) * (shaped.height + 1)).fill(1.5); shaped.reactor3d.terrainWidth = shaped.width;
    assert.ok(R.hasTerrain(shaped));
    assert.equal(R.pieceGeometry(R.piecesOf(shaped), shaped).attributes.position.count / 3, 3 * 12 - 4 * 2, 'a shaped map that is level under the row hides the same faces (they were a sawtooth through every cut wall)');
    const winRow = mapWith([{ id: 1, kind: 'wall', x: 1, y: 1, z: 0, rot: 0, material: '' }, { id: 2, kind: 'window', x: 2, y: 1, z: 0, rot: 0, material: '' }, { id: 3, kind: 'wall', x: 3, y: 1, z: 0, rot: 0, material: '' }]);
    const winAlone = R.pieceGeometry([{ id: 2, kind: 'window', x: 2, y: 1, z: 0, rot: 0, material: '' }], mapWith([])).attributes.position.count / 3;
    assert.equal(winAlone, 2 * 12, 'a lone window: a sill and a header, six faces each');
    assert.equal(R.pieceGeometry(R.piecesOf(winRow), winRow).attributes.position.count / 3, 2 * 12 + winAlone - 2 * 2 - 2 * 2 * 2, 'a window set between walls: each wall drops its face against the window, the sill and header drop theirs against each wall, the faces round the hole stay');
    const stepped = mapWith([1, 2, 3].map(i => ({ id: i, kind: 'wall', x: i, y: 1, z: 0, rot: 0, material: '' })));
    stepped.reactor3d.terrain = new Array((stepped.width + 1) * (stepped.height + 1)).fill(0).map((v, i) => (i % (stepped.width + 1)) >= 4 ? 1 : 0); stepped.reactor3d.terrainWidth = stepped.width;
    assert.equal(R.pieceGeometry(R.piecesOf(stepped), stepped).attributes.position.count / 3, 3 * 12 - 2 * 2, 'a step under the third keeps the two faces on either side of that step, and no others');
    assert.match(runtime, /if \(rrBayer < rrThin\) discard;/, 'a wall in the way is dithered thin, not cut');
    { const map = mapWith([{ id: 1, kind: 'wall', x: 4, y: 4, z: 0, rot: 0, material: '', group: 3 }, { id: 2, kind: 'floor', x: 4, y: 4, z: 5, rot: 0, material: '', group: 3 }]); const cover = R.pieceCoverAt(map, 4.5, 4.5, 0); assert.deepEqual(cover, { x0: 4 - R.CUTAWAY_MARGIN, y0: 4 - R.CUTAWAY_MARGIN, x1: 5 + R.CUTAWAY_MARGIN, y1: 5 + R.CUTAWAY_MARGIN }, 'the cut box reaches a hair past the outer faces'); }
    assert.match(runtime, /this\.setPieceSides\(cutState === "none" \? THREE\.FrontSide : THREE\.DoubleSide\);/, 'piece materials are two-sided while a cut is on, so a sliced wall reads as solid');
    assert.match(runtime, /if \(vRRCutPos\.y > rrCutTop && vRRCutPos\.x >= rrCutBox\.x[^\n]*discard;\\n\\t#include <alphatest_fragment>/, 'the shadow pass takes the storey cut too: a cut roof casts no shadow into the room');
    assert.match(runtime, /if \(cutState !== this\._cutState\) \{\n\s*this\._cutState = cutState;\n\s*if \(Reactor3D\.Shadows && Reactor3D\.Shadows\.invalidate\) Reactor3D\.Shadows\.invalidate\(\);/, 'the static shadows are drawn again when the cut changes');
    { const THREEx = loadThree(); const stone = new THREEx.MeshBasicMaterial(); stone.__reactorPieces = true; const caster = R.Shadows.casterMaterialFor(stone, false); assert.ok(caster.__rrCaster && typeof caster.onBeforeCompile === 'function' && caster.customProgramCacheKey() === 'reactor3d-caster-pieces', 'pieces get their own caster material'); assert.equal(R.Shadows.casterMaterialFor(new THREEx.MeshBasicMaterial(), false).customProgramCacheKey, THREEx.Material.prototype.customProgramCacheKey, 'other casters are unchanged'); }
    // A floor slab shows only the faces that can be seen: none inside a
    // wall's cell, no seam against the slab next door, and its underside
    // only where nothing stands beneath (the ceiling of the room below).
    const tris = (pieces, map) => R.pieceGeometry(pieces, map).attributes.position.count / 3;
    const loneFloor = mapWith([{ id: 1, kind: 'floor', x: 1, y: 1, z: 0, rot: 0, material: '' }]);
    assert.equal(tris(R.piecesOf(loneFloor), loneFloor), 10, 'a lone slab on the ground: top and four sides');
    const underWall = mapWith([{ id: 1, kind: 'floor', x: 1, y: 1, z: 0, rot: 0, material: '' }, { id: 2, kind: 'wall', x: 1, y: 1, z: 0, rot: 0, material: '' }]);
    assert.equal(tris(R.piecesOf(underWall).filter(q => q.kind === 'floor'), underWall), 0, 'a slab under a wall is never seen: no band of floor round the foot of a building');
    const pair = mapWith([{ id: 1, kind: 'floor', x: 1, y: 1, z: 0, rot: 0, material: '' }, { id: 2, kind: 'floor', x: 2, y: 1, z: 0, rot: 0, material: '' }]);
    assert.equal(tris(R.piecesOf(pair), pair), 2 * 10 - 2 * 2, 'two slabs side by side: the seam between them is gone');
    const ceiling = mapWith([{ id: 1, kind: 'floor', x: 1, y: 1, z: 5, rot: 0, material: '' }]);
    assert.equal(tris(R.piecesOf(ceiling), ceiling), 12, 'a slab over an open room keeps its underside: it is the ceiling');
    const overWall = mapWith([{ id: 1, kind: 'wall', x: 1, y: 1, z: 0, rot: 0, material: '' }, { id: 2, kind: 'floor', x: 1, y: 1, z: 5, rot: 0, material: '' }]);
    assert.equal(tris(R.piecesOf(overWall).filter(q => q.kind === 'floor'), overWall), 10, 'a slab resting on a wall has no underside to show');
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
    { const m = R.CUTAWAY_MARGIN; assert.deepEqual({ ...R.pieceCoverAt(grouped, 4.5, 4.5, 0) }, { x0: 4 - m, y0: 4 - m, x1: 7 + m, y1: 8 + m }, 'stamped: the building\'s own footprint, a hair past its outer faces'); }
    const scene = Object.create(R.MapScene.prototype);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(10, 8, 12); camera.updateMatrixWorld();
    const shared = R.cutawayUniforms();
    scene.updateCutaway(camera, house, { _realX: 2, _realY: 2 });
    assert.ok(Math.abs(shared.rrCutTop.value - 4.5) < 1e-9, 'downstairs: cut half a tile under the upper floor');
    // A camera under that ceiling (first person, a low orbit) keeps it:
    // cutting it from there shows the sky through the room.
    camera.position.set(3, 2.5, 4); camera.updateMatrixWorld();
    scene.updateCutaway(camera, house, { _realX: 2, _realY: 2 });
    assert.equal(shared.rrCutTop.value, 1e9, 'a camera under the ceiling sees the ceiling');
    assert.equal(shared.rrCutRadius.value, R.CUTAWAY_RADIUS, 'the wall in its way still thins');
    camera.position.set(10, 8, 12); camera.updateMatrixWorld();
    scene.updateCutaway(camera, house, { _realX: 2, _realY: 2 });
    assert.ok(Math.abs(shared.rrCutTop.value - 4.5) < 1e-9, 'and from above, the cut returns');
    assert.deepEqual(shared.rrCutBox.value, [2 - R.CUTAWAY_REACH, 2 - R.CUTAWAY_REACH, 3 + R.CUTAWAY_REACH, 3 + R.CUTAWAY_REACH]);
    assert.deepEqual(shared.rrCutEye.value, [10, 8, 12]);
    assert.ok(Math.abs(shared.rrCutFocus.value[1] - 1.6) < 1e-9, 'the sight line ends at chest height');
    assert.equal(shared.rrCutRadius.value, R.CUTAWAY_RADIUS);
    camera.position.set(10, 12, 12); camera.updateMatrixWorld();
    scene.updateCutaway(camera, house, { _realX: 2, _realY: 2, _reactorGround: 5.1 });
    assert.ok(Math.abs(shared.rrCutTop.value - 9.5) < 1e-9, 'upstairs, seen from above the roof: the roof goes, the storey stays');
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
    assert.equal((source3D().match(/keepOutOfWalls\(camera, resolved\);/g) || []).length, 2, 'the game camera asks after aiming, on both paths');
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

test('the round pieces: a shape has a size and a turn, blocks its round footprint, and builds as a mesh', () => {
    const THREE = loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const map = { width: 20, height: 20, reactor3d: { version: 1, elevation: new Array(400).fill(0), pieces: [
        { id: 1, kind: 'cylinder', x: 5, y: 5, z: 0, rot: 0, material: 'Stone', size: [5, 8, 5] },
        { id: 2, kind: 'dome', x: 5, y: 5, z: 8, rot: 0, material: 'RoofTile', size: [5, 2.5, 5] },
        { id: 3, kind: 'cone', x: 12, y: 5, z: 0, rot: 0, material: 'Thatch', size: [3, 4, 3], angle: 30 },
        { id: 4, kind: 'dome', x: 12, y: 12, z: 0, rot: 0, material: '' } ] } };
    const list = R.piecesOf(map);
    assert.equal(list.length, 4);
    assert.deepEqual([...list[0].size], [5, 8, 5], 'a shape keeps its size');
    assert.equal(list[2].angle, 30, 'and its turn');
    assert.deepEqual([...list[3].size], [1, 1, 1], 'a shape with no size is one cell');
    assert.equal(R.pieceFootprint(list[0]).length, 21, 'a five-wide cylinder covers a round footprint, not a square');
    assert.equal(R.pieceFootprint(list[3]).length, 1);
    assert.ok(Math.abs(R.pieceSurfaceAt(map, 5.5, 5.5, 0) - 10.5) < 1e-9, 'the tower with its dome is ten and a half tiles tall');
    assert.ok(Math.abs(R.pieceSurfaceAt(map, 7.5, 5.5, 0) - 10.5) < 1e-9, 'and just as tall at its rim');
    assert.equal(R.pieceSurfaceAt(map, 9.5, 5.5, 0), 0, 'the ground beside it is the ground');
    assert.equal(R.terrainBlocks(map, 8, 5, 7, 5, 0), true, 'a step into the tower is blocked');
    assert.equal(R.terrainBlocks(map, 2, 3, 3, 3, 0), false, 'the corner outside the round footprint is walkable');
    const geometry = R.pieceGeometry(list, map);
    assert.ok(geometry.attributes.position.count / 3 > 600, 'domes, a cylinder and a cone are many triangles');
    // Every shape is a closed solid wound outward: its signed volume (the divergence theorem over
    // its triangles) is the true solid's, within the rounding of its segments. A dome wound the
    // other way showed its inside from outside, and came out with a negative volume here.
    const arch = 1 - (0.7 * 0.5 + Math.PI * 0.35 * 0.35 / 2);
    // An octagon fitted to the cell has apothem one half; a hexagon fitted to it is three quarters of the cell.
    const octagon = 8 * 0.25 * Math.tan(Math.PI / 8);
    const volumes = { box: 1, wedge: 0.5, pyramid: 1 / 3, prism: 0.5, cylinder: Math.PI / 4, tube: Math.PI / 4 * (1 - 0.49), cone: Math.PI / 12, dome: Math.PI / 6, sphere: Math.PI / 6, arch, tunnel: arch, ring: 2 * Math.PI * Math.PI * 0.4 * 0.1 * 0.5,
        hull: (octagon + octagon * 0.64 + octagon * 0.8) / 3, spike: 0.75 / 3, capsule: Math.PI / 8 + 2 * (2 / 3 * Math.PI * 0.25 * 0.25), dish: 0.0886, fin: 0.7 };
    assert.deepEqual(Object.keys(volumes).sort(), [...R.SHAPE_KINDS].sort(), 'every shape kind has a known volume');
    for (const kind of R.SHAPE_KINDS) {
        const out = { positions: [], uvs: [], colors: [] };
        R.emitPiece({ kind, x: 2, y: 2, z: 0, rot: 0, material: '', size: [1, 1, 1] }, 0, out, null);
        const P = out.positions;
        let volume = 0;
        for (let i = 0; i + 8 < P.length; i += 9) {
            const a = [P[i] - 2.5, P[i + 1], P[i + 2] - 2.5], b = [P[i + 3] - 2.5, P[i + 4], P[i + 5] - 2.5], c = [P[i + 6] - 2.5, P[i + 7], P[i + 8] - 2.5];
            volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        }
        assert.ok(Math.abs(volume - volumes[kind]) / volumes[kind] < 0.05, `${kind}: volume ${volume.toFixed(4)} is the solid's ${volumes[kind].toFixed(4)}`);
    }
    // A hull's settings: four sides and no taper is a box; a spike with sides is a tapered prism; a plain shape carries none.
    const square = R.normalizePiece({ kind: 'hull', x: 1, y: 1, size: [1, 1, 1], sides: 4, taper: 1 }, map);
    assert.deepEqual([square.sides, square.taper], [4, 1]);
    const boxy = { positions: [], uvs: [], colors: [] };
    R.emitPiece(square, 0, boxy, null);
    assert.equal(boxy.positions.length / 9, 8 + 4 + 4, 'four sides: four quads and two caps of four triangles');
    boxy.positions.forEach((v, i) => { if (i % 3 !== 1) assert.ok(v >= 1 - 1e-9 && v <= 2 + 1e-9, 'a four-sided hull fills its cell exactly, like a box'); });
    assert.deepEqual({ ...R.shapeParams({ kind: 'hull' }) }, { sides: 8, taper: 0.8 }, 'a hull wears eight sides and a slight taper until told otherwise');
    assert.equal('sides' in R.normalizePiece({ kind: 'box', x: 1, y: 1, sides: 9 }, map), false, 'a box has no sides setting');
    // Round shapes go part way round: a half cylinder is half the volume, a horseshoe tube opens forward.
    const half = { positions: [], uvs: [], colors: [] };
    R.emitPiece(R.normalizePiece({ kind: 'cylinder', x: 2, y: 2, size: [1, 1, 1], sweep: 180 }, map), 0, half, null);
    let halfVolume = 0;
    for (let i = 0; i + 8 < half.positions.length; i += 9) { const P = half.positions; const a = [P[i] - 2.5, P[i + 1], P[i + 2] - 2.5], b = [P[i + 3] - 2.5, P[i + 4], P[i + 5] - 2.5], c = [P[i + 6] - 2.5, P[i + 7], P[i + 8] - 2.5]; halfVolume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }
    assert.ok(Math.abs(halfVolume - Math.PI / 8) < 0.01, 'a cylinder swept half way is half a cylinder, closed by two flat faces');
    const horseshoe = R.pieceFootprint(R.normalizePiece({ kind: 'tube', x: 10, y: 10, size: [10, 1, 8], sweep: 220 }, map));
    assert.ok(!horseshoe.some(c => c[1] < 8), 'a horseshoe swept 220 degrees is open at the front (north)');
    assert.ok(horseshoe.some(c => c[1] > 12), 'and solid at the back');
    // A hollow shape's wall can be thin: a rail ring blocks a narrow band, not a quarter of its width.
    const fat = R.pieceFootprint(R.normalizePiece({ kind: 'ring', x: 10, y: 10, size: [20, 1, 20] }, map)).length;
    const thin = R.pieceFootprint(R.normalizePiece({ kind: 'ring', x: 10, y: 10, size: [20, 1, 20], thick: 0.04 }, map)).length;
    assert.ok(thin < fat / 2, `a thin ring blocks far fewer cells (${thin}) than a fat one (${fat})`);
    assert.equal(R.normalizePiece({ kind: 'ring', x: 1, y: 1, thick: 0.04 }, map).thick, 0.04);
    // Glass is a see-through pane the height of a wall; a Glow material is lit from within.
    assert.ok(R.PIECE_KINDS.includes('glass'));
    assert.equal(R.pieceHeight('glass'), R.PIECE_STOREY);
    assert.deepEqual({ ...R.materialLook('Glass') }, { glass: true, glow: false });
    assert.deepEqual({ ...R.materialLook('ConsoleGlow') }, { glass: false, glow: true });
    assert.deepEqual({ ...R.materialLook('Stone') }, { glass: false, glow: false });
    assert.match(read('runtime/reactor_3d_lighting.js'), /mix\(rrLight\(vRRWorldPos\), vec3\(1\.0\), rrSelfLit\)/, 'the lit shader lets a self-lit material ignore the lights');
    // Hollow shapes block only their walls: a tube's middle, an arch's opening, are walked into.
    const tube = R.normalizePiece({ kind: 'tube', x: 10, y: 10, size: [6, 5, 6] }, map);
    const tubeCells = R.pieceFootprint(tube).map(c => c.join(','));
    assert.ok(!tubeCells.includes('10,10'), 'the middle of a tube is open');
    assert.ok(tubeCells.includes('7,10') || tubeCells.includes('8,10'), 'its wall blocks');
    const archway = R.normalizePiece({ kind: 'arch', x: 10, y: 10, size: [3, 4, 1] }, map);
    assert.deepEqual(R.pieceFootprint(archway).map(c => c.join(',')).sort(), ['11,10', '9,10'], 'an arch is its two posts; the way through is open');
    assert.equal(R.pieceFootprint(R.normalizePiece({ kind: 'box', x: 10, y: 10, size: [2, 1, 2], offset: [0.5, 0.5] }, map)).length, 4, 'a two-tile box with its middle on a cell corner covers its four cells');
    assert.equal(R.pieceFootprint(R.normalizePiece({ kind: 'box', x: 10, y: 10, size: [2, 1, 2] }, map)).length, 9, 'centred on a cell it overhangs half of each neighbour, and those block too');
    // A long low wedge is a ramp: its top rises along its length, in steps under the walking limit.
    const rampMap = { width: 20, height: 20, reactor3d: { version: 1, elevation: new Array(400).fill(0), pieces: [{ id: 1, kind: 'wedge', x: 5, y: 5, z: 0, rot: 0, size: [2, 1, 4], angle: 0 }] } };
    assert.deepEqual([3, 4, 5, 6, 7].map(y => Math.round(R.pieceSurfaceAt(rampMap, 5.5, y + 0.5, 0) * 100) / 100), [0, 0.25, 0.5, 0.75, 1], 'the surface rises a quarter per cell');
    assert.equal(R.terrainBlocks(rampMap, 5, 3, 5, 4, 0), false, 'walked up');
    const steepMap = { width: 20, height: 20, reactor3d: { version: 1, elevation: new Array(400).fill(0), pieces: [{ id: 1, kind: 'wedge', x: 5, y: 5, z: 0, rot: 0, size: [2, 3, 2], angle: 0 }] } };
    assert.equal(R.terrainBlocks(steepMap, 5, 4, 5, 5, 0.75), true, 'a steep one blocks');
    // A rolled column lies along the ground, resting on it, and its footprint is long.
    const lying = R.normalizePiece({ kind: 'cylinder', x: 5, y: 5, z: 0, size: [2, 8, 2], roll: 90 }, map);
    assert.equal(lying.roll, 90, 'the roll is kept');
    const lyingCells = R.pieceFootprint(lying);
    assert.equal(Math.max(...lyingCells.map(c => c[0])) - Math.min(...lyingCells.map(c => c[0])), 8, 'eight tiles long across the ground');
    assert.ok(Math.abs(R.pieceTop(lying) - 2) < 1e-9, 'and two tiles tall, on the ground rather than floating at its pivot');
    // A shape stands at a quarter tile, nudged by an offset; a plain shape carries neither field.
    const nudged = R.normalizePiece({ kind: 'dome', x: 1, y: 1, z: 10.5, size: [4, 2], offset: [0.3, -0.25], tilt: 0 }, map);
    assert.equal(nudged.z, 10.5);
    assert.deepEqual([...nudged.offset], [0.3, -0.25]);
    assert.deepEqual([...R.shapeCentre(nudged)], [1.8, 1.25]);
    assert.equal('tilt' in nudged, false);
    assert.equal(R.normalizePiece({ kind: 'wall', x: 1, y: 1, z: 2.5 }, map).z, 2, 'a cell piece still stands on a whole level');
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.max.y - 10.5) < 1e-6, 'the mesh reaches the dome\'s top');
    assert.ok(geometry.boundingBox.min.x >= 2.9 && geometry.boundingBox.min.x <= 3.1, 'the cylinder spans its width about its cell');
    // The palette lists the kinds with their own icons and names in every locale.
    const palette = read('editor/src/PieceBuilderManager.js');
    for (const kind of ['dome', 'cylinder', 'cone']) assert.match(palette, new RegExp(`\\b${kind}: '`), kind + ' has an icon');
    assert.match(read('editor/src/utils/MapElevation.js'), /'window', 'fence', 'glass'\]/, 'the editor keeps the same kinds');
});
