'use strict';
// What a Tactical battle shows and what it opens to show it (runtime/reactor_fight_tactical.js, "What the view
// opens" and "The way to the cursor"; runtime/reactor_3d_lighting.js, injectCutaway and cutawayMarkBody):
//  - nothing of a unit is cut, thinned or hidden: its model, what it holds, a character standing by;
//  - only the controlled unit inside a room opens its building, with capped walls and eased transitions;
//    roof targets, outdoor units and distant movement marks keep buildings whole; scenery retains its own hold;
//  - the way to the cursor is a square on each of its tiles with a brighter one travelling from the unit to the
//    destination, on 3D maps and on flat ones.
// Logic only: nothing here draws. One 3D world and one flat world serve the whole file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fightWorld, event } = require('./helpers/fight-world.cjs');
const { realWorld } = require('./helpers/fight-real-world.cjs');
const { source3D } = require('./helpers/runtime-3d-source.cjs');

const tacticalSource = fs.readFileSync(path.join(__dirname, '../../runtime/reactor_fight_tactical.js'), 'utf8');
const unit = (id, x, y, text) => event(id, x, y, { note: `<unit: ${text}>` });
const near = (a, b, slack = 1e-4) => Math.abs(a - b) <= slack;

//-----------------------------------------------------------------------------
// The 3D world: a house, a tower of three storeys, an awning, a post and a low wall on an open floor.

let pieceId = 0;
const piece = (kind, x, y, z = 0, extra = {}) => Object.assign({ id: ++pieceId, kind, x, y, z, rot: 0, material: 'Stone' }, extra);
const HOUSE = [10, 10, 15, 15], TOWER = [30, 14, 33, 17], STREET = 9;
function built() {
    const list = [];
    // The house: a floor, a ring of walls (a window with its pane in the south wall) and a flat roof five tiles up.
    for (let y = HOUSE[1]; y <= HOUSE[3]; y++) for (let x = HOUSE[0]; x <= HOUSE[2]; x++) {
        const edge = x === HOUSE[0] || x === HOUSE[2] || y === HOUSE[1] || y === HOUSE[3];
        list.push(piece('floor', x, y, 0), piece('floor', x, y, 5));
        if (edge && x === 12 && y === HOUSE[3]) list.push(piece('window', x, y, 0), piece('glass', x, y, 0, { material: 'Glass' }));
        else if (edge) list.push(piece('wall', x, y, 0));
    }
    // The tower: three storeys of walls, a floor over each.
    for (let level = 0; level < 3; level++) for (let y = TOWER[1]; y <= TOWER[3]; y++) for (let x = TOWER[0]; x <= TOWER[2]; x++) {
        const edge = x === TOWER[0] || x === TOWER[2] || y === TOWER[1] || y === TOWER[3];
        if (edge) list.push(piece('wall', x, y, level * 5));
        list.push(piece('floor', x, y, level * 5 + 5));
    }
    // An awning three tiles up on nothing a unit cannot see past; a post; a wall one tile high.
    for (const [x, y] of [[22, 20], [23, 20], [22, 21], [23, 21]]) list.push(piece('floor', x, y, 3));
    list.push(piece('pillar', 40, 20, 0), piece('block', 44, 20, 0), piece('block', 45, 20, 0));
    // A hut with one room and an overhang all round, a tile wide, lower than its ceiling.
    for (let y = 28; y <= 32; y++) for (let x = 20; x <= 24; x++) {
        const inner = x >= 21 && x <= 23 && y >= 29 && y <= 31;
        if (!inner) { list.push(piece('floor', x, y, 4)); continue; }
        list.push(piece('floor', x, y, 0), piece('floor', x, y, 5));
        if (x !== 22 || y !== 30) list.push(piece('wall', x, y, 0));
    }
    // A rock four tiles high.
    list.push(piece('rock', 50, 12, 0, { size: [3, 4, 3], material: 'Rock' }));
    // A solid block three tiles each way, as high as a storey.
    for (let y = 26; y <= 28; y++) for (let x = 38; x <= 40; x++) list.push(piece('wall', x, y, 0));
    // A street of nine small houses, a tile of open ground between them: one room each, the first with a doorway in its west wall.
    for (let i = 0; i < STREET; i++) for (let y = 42; y <= 46; y++) for (let x = 4 + i * 6; x <= 8 + i * 6; x++) {
        const edge = x === 4 + i * 6 || x === 8 + i * 6 || y === 42 || y === 46;
        list.push(piece('floor', x, y, 0), piece('floor', x, y, 5));
        if (i === 0 && x === 4 && y === 44) list.push(piece('doorway', x, y, 0));
        else if (edge) list.push(piece('wall', x, y, 0));
    }
    return list;
}

let deep = null;
/** The 3D world with a battle begun: the party of two and two enemies, parked in the open until a case puts them somewhere. */
function world3D() {
    if (deep) return deep;
    const w = realWorld({ width: 60, height: 52, sidecar: { pieces: built() }, events: [unit(1, 50, 30, 'enemy 1'), unit(2, 52, 30, 'enemy 2')], start: [5, 30] });
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    const fight = w.$gameFight, F = w.ReactorFight, V = F.View, R = w.Reactor3D, THREE = w.THREE;
    fight._tac.view = fight._tac.view || { own: true, yaw: 45, zoom: 1 };
    fight._tac.view.yaw = 45;
    const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    const scene = { piecesGroup: () => group, pieceMaterial: () => material };
    const eye = { x: 0, y: 0, z: 0 };
    const camera = { getWorldPosition: v => v.set(eye.x, eye.y, eye.z) };
    const units = fight._units.filter(u => !u.gone), chars = units.map(u => fight.character(u));
    deep = { w, fight, F, V, R, THREE, M: F.Marks, scene, group, camera, eye, units, chars,
        /** The tactical camera over a tile from the south-west (the view's quarter 45: it looks north-east). */
        look(x, y) { eye.x = x + 0.5 - 34.65; eye.y = 34.6; eye.z = y + 0.5 + 34.65; },
        /** Everyone back in the open, nothing marked, nothing open, the cursor off. */
        clear() {
            chars.forEach((c, i) => { c.locate(46 + i * 2, 34); c._reactorGround = 0; });
            F.Marks.count = 0;
            fight._act = { player: true, stage: 'move', unitId: units[0].id };
            fight._tac.cursor.on = false;
            V.closeOpenings(scene, true);
        },
        put(i, x, y, h) { chars[i].locate(x, y); chars[i]._reactorGround = h; },
        /** One look at what is in the way (as when the marks change), then `frames` frames of nothing changing. */
        step(frames = 0, changed = true) {
            V.updateOpenings(scene, camera, true, true, changed);
            for (let i = 0; i < frames; i++) { w.Graphics.frameCount++; V.updateOpenings(scene, camera, true, true, false); }
        },
        /** One frame of nothing changing. */
        frame() { w.Graphics.frameCount++; V.updateOpenings(scene, camera, true, true, false); },
        /**
         * The height the shaders cut a point at, as the pieces' shader takes it: nothing outside the one box everything
         * open lies in, nothing under the lowest height, else the lowest of the boxes it is in.
         */
        shaderCut(x, z, y = 1e8) {
            const shared = R.cutawayUniforms(), boxes = shared.rrOpenBox.value, tops = shared.rrOpenTop.value, all = shared.rrOpenAll.value;
            let cut = 1e9;
            if (!(shared.rrOpenCount.value > 0 && y > shared.rrOpenLow.value)) return cut;
            if (!(x >= all[0] && z >= all[1] && x <= all[2] && z <= all[3])) return cut;
            const inside = i => x >= boxes[i * 4] && z >= boxes[i * 4 + 1] && x <= boxes[i * 4 + 2] && z <= boxes[i * 4 + 3];
            // The buildings' footprints first; the walls cut low only for what lies in one.
            for (let i = 0; i < shared.rrOpenFeet.value; i++) if (inside(i)) cut = Math.min(cut, tops[i]);
            if (!(cut < 1e8)) return 1e9;
            for (let i = shared.rrOpenFeet.value; i < shared.rrOpenCount.value; i++) if (inside(i)) cut = Math.min(cut, tops[i]);
            return cut;
        },
        /** The cut of every tile of a ring of walls, as the shaders make it. */
        ring(box) {
            const out = [];
            for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) if (x === box[0] || x === box[2] || y === box[1] || y === box[3]) out.push(this.shaderCut(x + 0.5, y + 0.5));
            return out;
        }
    };
    return deep;
}

test('a house that hides someone is opened at a level: the storey over their floor gone, the walls toward the camera down to a foot, the rest standing', () => {
    const d = world3D(), { V, R } = d;
    d.clear();
    d.look(12, 12);
    d.step(V.OPEN_EASE + 2);
    assert.equal(V.openings().buildings.length, 0, 'nobody behind anything: nothing is opened');
    assert.equal(R.cutawayUniforms().rrOpenCount.value, 0);
    d.put(0, 12, 12, 0.1);
    d.step(V.OPEN_EASE + 2);
    const open = V.openings();
    assert.equal(open.buildings.length, 1, 'the house, and only the house');
    assert.deepEqual(Array.from(open.buildings[0].box), HOUSE);
    const storey = R.PIECE_STOREY - R.CUTAWAY_DROP, foot = 0.1 + V.OPEN_FOOT;
    assert.ok(near(open.buildings[0].level, storey), 'the storey above the floor is what goes: its roof, whole');
    // The camera stands south-west: the west and south walls are between it and the room, and come down from end to end.
    for (const [x, y] of [[10, 10], [10, 11], [10, 13], [10, 14], [10, 15], [11, 15], [13, 15], [15, 15]]) assert.ok(near(V.openAt(x, y), foot), `the wall at ${x},${y} toward the camera is down to a foot (${V.openAt(x, y)})`);
    for (const [x, y] of [[15, 12], [15, 10], [12, 10], [11, 10], [15, 14]]) assert.ok(near(V.openAt(x, y), storey), `the wall at ${x},${y} behind the room stands to the cut (${V.openAt(x, y)})`);
    assert.equal(open.buildings[0].runs, 2, 'two runs of wall: the west side and the south side');
    assert.equal(open.buildings[0].uncut, 0);
    assert.ok(near(V.openAt(12, 12), storey), 'over the room only the roof is gone');
    assert.equal(V.openAt(20, 20), 1e9, 'the ground beside it is whole');
    assert.equal(V.openAt(31, 15), 1e9, 'and so is the tower nobody is behind');
    // What the shaders are told says the same, tile by tile: inside the walls' own tiles and a hair inside their faces.
    for (let y = HOUSE[1]; y <= HOUSE[3]; y++) for (let x = HOUSE[0]; x <= HOUSE[2]; x++) {
        assert.ok(near(d.shaderCut(x + 0.5, y + 0.5), V.openAt(x, y)), `tile ${x},${y}`);
        const wall = x === HOUSE[0] || x === HOUSE[2] || y === HOUSE[1] || y === HOUSE[3];
        if (wall) for (const [u, v] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]]) assert.ok(near(d.shaderCut(x + u, y + v), V.openAt(x, y)), `a corner of the wall's tile ${x},${y}`);
    }
    assert.equal(d.shaderCut(20.5, 20.5), 1e9);
    assert.ok(R.cutawayUniforms().rrOpenCount.value <= R.CUTAWAY_OPENINGS);
    // A casing or a shutter hanging on a wall cut low goes with it: the cut reaches a little past the wall's outer face, never into a wall left standing.
    assert.ok(near(d.shaderCut(10 - 0.2, 13.5), foot), 'past the west wall\'s outer face');
    assert.ok(near(d.shaderCut(11.1, 10.5), storey) && near(d.shaderCut(15.5, 14.9), storey), 'the standing wall beside a low run is not cut into');
    assert.ok(near(d.shaderCut(11 + V.OPEN_FACE - 0.02, 12.5), foot) && near(d.shaderCut(12.5, 15 - V.OPEN_FACE + 0.02), foot), 'but a door\'s casing on the low wall\'s inner face goes with the wall, standing walls beside it or not');
    assert.ok(V.OPEN_FACE >= 0.05 && V.OPEN_FACE < 0.1, 'as far as a casing stands off the face (0.05), no further');
    assert.ok(near(d.shaderCut(HOUSE[2] + 1.2, 12.5), storey), 'a board along the roof\'s edge, a little past the outer tiles, goes with the roof');
    assert.equal(d.shaderCut(HOUSE[2] + 1.6, 12.5), 1e9, 'and no further');
    // The unit steps out: the house is whole again once its time is up.
    d.put(0, 46, 34, 0);
    d.step(V.OPEN_HOLD + V.OPEN_EASE + 3);
    assert.equal(V.openings().buildings.length, 0);
    assert.equal(R.cutawayUniforms().rrOpenCount.value, 0);
});

test('an occupied room eases open and shuts when the selected unit leaves; a cursor cannot hold it open', () => {
    const d=world3D(),{V,R,fight}=d;d.clear();d.look(12,12);d.put(0,12,12,0.1);
    d.step(0);const tops=R.cutawayUniforms().rrOpenTop.value,storey=R.PIECE_STOREY-R.CUTAWAY_DROP;
    assert.ok(V.openings().buildings[0].e<0.3);
    const seen=[];for(let i=0;i<V.OPEN_EASE+1;i++){d.frame();seen.push(tops[0]);}
    for(let i=1;i<seen.length;i++)assert.ok(seen[i]<=seen[i-1]+1e-6);
    assert.ok(near(seen.at(-1),storey));
    const cursor=fight._tac.cursor;Object.assign(cursor,{on:true,x:12,y:12,h:0.1});
    d.put(0,46,34,0);d.step(V.OPEN_EASE+2);
    assert.equal(V.openings().buildings.length,0,'hovering the room does not keep it exposed');
    assert.equal(V.openAt(12,12),1e9);cursor.on=false;
});

test('a selected unit on a roof or outdoors keeps buildings whole, even when someone else is inside', () => {
    const d=world3D(),{V,R}=d;d.clear();d.look(12,12);
    d.put(0,13,12,5.1);d.put(1,12,12,0.1);d.step(V.OPEN_EASE+2);
    assert.equal(V.openings().buildings.length,0,'standing on the roof is not entering its room');
    d.put(0,12,12,0.1);d.step(V.OPEN_EASE+2);
    assert.ok(near(V.openAt(12,12),R.PIECE_STOREY-R.CUTAWAY_DROP));
    d.clear();d.look(44,4);d.put(0,44,4,0);d.step(V.OPEN_EASE+2);
    assert.equal(V.openAt(31,15),1e9,'a distant tower between the camera and the actor stays whole');
});

test('a wall cut low stays a foot over the building\'s own floor whoever stands higher in it: on a table, on a stair, the cursor on a crate', () => {
    const d = world3D(), { V, R, fight } = d;
    d.clear();
    d.look(12, 12);
    d.put(0, 12, 12, 0.1);
    d.step(V.OPEN_EASE + 2);
    const foot = 0.1 + V.OPEN_FOOT, storey = R.PIECE_STOREY - R.CUTAWAY_DROP;
    const low = () => V.openings().buildings[0].low;
    assert.ok(near(low(), foot));
    // A second unit a tile up beside the first (a table), then half a storey up (a stair): the near walls do not rise.
    for (const h of [1.1, 1.3, 2.6]) {
        d.put(1, 13, 13, h);
        d.step(V.OPEN_EASE + 2);
        assert.ok(near(low(), foot), `someone ${h} up: the walls toward the camera stay at ${foot} (${low()})`);
        assert.ok(near(V.openAt(10, 13), foot) && near(d.shaderCut(10.5, 13.5), foot), 'and so the shaders are told');
        assert.ok(near(V.openings().buildings[0].level, storey), 'the storey shown is the same');
    }
    // The cursor on a crate inside, tile by tile: nothing moves.
    d.put(1, 48, 34, 0);
    const cursor = fight._tac.cursor;
    cursor.on = true;
    for (let i = 0; i < 12; i++) {
        cursor.x = 11 + (i % 4); cursor.y = 13; cursor.h = i % 2 ? 1.3 : 0.1;
        d.w.Graphics.frameCount++;
        d.step(0, true);
        assert.ok(near(low(), foot) && near(d.shaderCut(10.5, 13.5), foot), 'the cursor at ' + cursor.h + ': ' + d.shaderCut(10.5, 13.5));
    }
    cursor.on = false;
});

test('standing behind a closed house never opens its walls', () => {
    const d=world3D(),{V}=d;d.clear();d.put(0,19,6,0);d.look(15,10);d.step(V.OPEN_EASE+2);
    assert.equal(V.openings().buildings.length,0);assert.equal(V.openAt(15,10),1e9);
});

test('a wall cut low takes the roof\'s overhang beyond it too: nothing of the eave is left hanging over it', () => {
    const d = world3D(), { V } = d;
    d.clear();
    d.put(0, 22, 30, 0.1);
    d.look(22, 30);
    d.step(V.OPEN_EASE + 2);
    const hut = V.openings().buildings;
    assert.equal(hut.length, 1);
    assert.deepEqual(Array.from(hut[0].box), [20, 28, 24, 32]);
    const foot = 0.1 + V.OPEN_FOOT;
    // The overhang itself is met under the storey's cut (it lies four tiles up): no wall, so the hut's level stays the storey's.
    assert.ok(near(hut[0].level, d.R.PIECE_STOREY - d.R.CUTAWAY_DROP), 'what is met under the cut and is no wall lowers nothing: ' + hut[0].level);
    assert.ok(near(V.openAt(21, 31), foot), 'the corner toward the camera is down to a foot');
    // West of the low west wall and south of the low south wall lies the overhang, and nothing beyond it.
    assert.ok(near(d.shaderCut(20.5, 31.5), foot), 'the overhang beyond the low wall is cut with it (' + d.shaderCut(20.5, 31.5) + ')');
    assert.ok(near(d.shaderCut(21.5, 32.5), foot));
    assert.ok(d.shaderCut(24.5, 29.5) > foot + 1, 'the overhang behind the standing walls is only as open as the storey: ' + d.shaderCut(24.5, 29.5));
    assert.equal(d.shaderCut(18.5, 31.5), 1e9, 'and the ground past the overhang is whole');
    // Someone north-east of the hut: their line to the camera meets the overhang four tiles up, under the storey's cut,
    // then the ceiling. The overhang is no wall: the hut is cut at its storey, not at the overhang.
    d.clear();
    d.put(0, 27, 26, 0);
    d.look(27, 26);
    d.step(V.OPEN_EASE + 2);
    const behind = V.openings().buildings.find(b => b.box[0] === 20);
    assert.equal(behind, undefined, 'a hut in the way stays closed when the selected unit is outside');
});

test('awnings, porches, posts and low walls do not qualify as building interiors', () => {
    const d=world3D(),{V}=d;
    for(const [x,y,h]of [[23,20,0],[20,30,0.1],[41,19,0],[45,19,0]]){
        d.clear();d.put(0,x,y,h);d.look(x,y);d.step(V.OPEN_EASE+2);
        assert.equal(V.openings().buildings.length,0,`outside at ${x},${y}`);
    }
});

test('a rock is land: the view opens nothing for it, and the camera turns for it as it does for a hill', () => {
    const d = world3D(), { V } = d;
    d.clear();
    // North-east of the rock, the camera south-west of it.
    d.put(0, 52, 10, 0);
    d.look(52, 10);
    d.step(V.OPEN_EASE + 2);
    assert.equal(V.openings().buildings.length, 0, 'a rock is not cut open');
    assert.equal(V.landHides(52, 10, 0, 45), true, 'from the south-west the rock hides the tile behind it');
    assert.equal(V.landHides(52, 10, 0, 225), false, 'from the north-east it does not');
    assert.equal(V.landHides(40, 30, 0, 45), false, 'open ground is seen');
    // As that unit's turn begins the view turns to a quarter that shows it.
    const view = d.fight._tac.view, live = V.live;
    V.live = () => ({});
    try {
        assert.equal(V.unblock(d.fight, 52, 10, 0), true);
        assert.notEqual(view.yaw, 45);
        assert.equal(V.landHides(52, 10, 0, view.yaw), false);
    } finally { V.live = live; view.yaw = 45; }
});

test('movement, attack and grapple destination marks never authorize opening a building', () => {
    const d=world3D(),{V,M,fight}=d;d.clear();d.look(12,12);
    const cursor=fight._tac.cursor;Object.assign(cursor,{on:true,x:12,y:12,h:0.1});
    for(const kind of Object.values(M.KINDS)){
        M.count=1;M.x[0]=12;M.y[0]=12;M.h[0]=0.1;M.kind[0]=kind;d.step(V.OPEN_EASE+2);
        assert.equal(V.openings().buildings.length,0,`mark ${kind} is only a preview`);
    }
    d.put(0,12,12,0.1);d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,1);
    cursor.on=false;M.count=0;
});

test('what is cut is capped: a top over every wall the cut passes through, a side where a low wall meets a standing one, and no cap of its own for a pane', () => {
    const d = world3D(), { V, R, group } = d;
    d.clear();
    d.look(12, 12);
    d.put(0, 12, 12, 0.1);
    d.step(V.OPEN_EASE + 2);
    assert.ok(group.children.length > 0, 'caps are laid in the pieces\' group');
    const storey = R.PIECE_STOREY - R.CUTAWAY_DROP, foot = 0.1 + V.OPEN_FOOT;
    const tops = new Map(), sides = [];
    for (const mesh of group.children) {
        assert.equal(mesh.userData.pieceCap, true);
        const p = mesh.geometry.getAttribute('position').array;
        assert.equal(p.length % 18, 0);
        assert.equal(mesh.geometry.getAttribute('uv').count, p.length / 3);
        assert.ok(mesh.geometry.getAttribute('normal'), 'lit as the walls are');
        for (let i = 0; i < p.length; i += 18) {
            const xs = [], ys = [], zs = [];
            for (let k = 0; k < 18; k += 3) { xs.push(p[i + k]); ys.push(p[i + k + 1]); zs.push(p[i + k + 2]); }
            const flat = Math.max(...ys) - Math.min(...ys) < 1e-6;
            if (flat) { const key = Math.min(...xs) + ',' + Math.min(...zs); assert.ok(!tops.has(key), 'one top per tile: ' + key); tops.set(key, ys[0]); }
            else sides.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), lo: Math.min(...ys), hi: Math.max(...ys) });
        }
    }
    // Every wall tile of the ring has a top, a hair under where it is cut; the pane in the window's tile adds none.
    let ring = 0;
    for (let y = HOUSE[1]; y <= HOUSE[3]; y++) for (let x = HOUSE[0]; x <= HOUSE[2]; x++) {
        const edge = x === HOUSE[0] || x === HOUSE[2] || y === HOUSE[1] || y === HOUSE[3];
        if (!edge) { assert.ok(!tops.has(x + ',' + y), 'no cap over the room'); continue; }
        ring++;
        assert.ok(near(tops.get(x + ',' + y), V.openAt(x, y) - 0.01, 1e-3), `the wall at ${x},${y} is capped at its cut`);
    }
    assert.equal(tops.size, ring);
    // Where the low west wall's end meets the standing north wall (10,10 is low; 11,10 stands): a side from the foot to the cut, in the standing wall's tile.
    const corner = sides.find(s => near(s.x0, 11 + V.OPEN_FACE, 0.01) && near(s.x1, 11 + V.OPEN_FACE, 0.01) && s.z0 >= 10 - 1e-6 && s.z1 <= 11 + 1e-6);
    assert.ok(corner, 'a side closes the standing wall where its neighbour was cut low');
    assert.ok(near(corner.lo, foot - 0.01, 1e-3) && near(corner.hi, storey - 0.01, 1e-3), `from the low cut to the storey's (${corner.lo} to ${corner.hi})`);
    assert.ok(corner.x0 > 11 + V.OPEN_FACE && corner.x0 < 11 + V.OPEN_FACE + 0.01, 'inside the standing wall by what the low wall\'s cut takes of it, and a hair');
    // Shut: the caps go with it.
    d.clear();
    assert.equal(group.children.length, 0);
    assert.equal(V.openings().caps, 0);
});

test('scenery in the way is cut off above its foot and whole again after; a character standing there never is', () => {
    const d = world3D(), { V, R, THREE, w } = d;
    d.clear();
    const model = (x, z, wide, tall) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(wide, tall, wide), new THREE.MeshBasicMaterial()); mesh.position.set(x, tall / 2, z); new THREE.Group().add(mesh); mesh.parent.updateMatrixWorld(true); return mesh; };
    // A tree and a bystander with a model, both between the camera and the unit; and a tree off to the side.
    const tree = { eventId: () => 10004, _erased: false }, other = { eventId: () => 10005, _erased: false }, person = { eventId: () => 7, _erased: false };
    // And in the way too: a tree that is not drawn, and a crate two tiles high at the unit's feet.
    const unseen = { eventId: () => 10006, _erased: false }, crate = { eventId: () => 10007, _erased: false };
    const holders = new Map([[tree, { object: model(27, 23, 4, 9) }], [other, { object: model(40, 30, 4, 9) }], [person, { object: model(29.5, 21.5, 1, 3) }],
        [unseen, { object: model(28, 22.4, 3, 9) }], [crate, { object: model(29.9, 21.1, 2, 2) }]]);
    holders.get(unseen).object.visible = false;
    const events = w.$gameMap.events, holderFor = R.modelHolderFor;
    w.$gameMap.events = () => [tree, other, person, unseen, crate];
    R.modelHolderFor = character => holders.get(character) || null;
    try {
        const stump = c => { const u = holders.get(c).object.material.userData.rrFightStump; return u ? u.value : 1e9; };
        d.put(0, 30, 20, 0);
        d.look(30, 20);
        d.step(V.OPEN_EASE + 2);
        assert.ok(near(stump(tree), V.OPEN_STUMP), 'the tree in the way keeps its foot: ' + stump(tree));
        assert.equal(stump(other), 1e9, 'a tree that hides nobody is whole');
        assert.equal(stump(person), 1e9, 'a character is never scenery, wherever it stands');
        assert.equal(stump(unseen), 1e9, 'what is not drawn is not asked about');
        assert.equal(stump(crate), 1e9, 'what a unit is seen over is left whole');
        assert.equal(V.openings().scenery, 1);
        // The unit stands there a long while, then walks off: the tree stays cut a while from that moment, then grows
        // back over a few frames and is whole.
        d.step(V.OPEN_HOLD * 3, false);
        d.w.Graphics.frameCount++;
        d.put(0, 46, 34, 0);
        d.step(V.OPEN_HOLD - V.OPEN_EASE - 6);
        assert.ok(near(stump(tree), V.OPEN_STUMP), 'held: ' + stump(tree));
        let between = 0;
        for (let i = 0; i < V.OPEN_HOLD + V.OPEN_EASE; i++) { d.step(1, false); if (stump(tree) > V.OPEN_STUMP + 0.1 && stump(tree) < 1e8) between++; }
        assert.ok(between >= 3, 'it comes back over a few frames, not in one: ' + between);
        assert.equal(stump(tree), 1e9);
        assert.equal(V.openings().scenery, 0);
        // The battle's view goes away with the tree cut: it is put back.
        d.put(0, 30, 20, 0);
        d.step(V.OPEN_EASE + 2);
        assert.ok(near(stump(tree), V.OPEN_STUMP));
        // The tree is taken out of the scene while it is cut (its event erased, its model let go): it is off the list in a few frames, not held.
        const object = holders.get(tree).object, parent = object.parent;
        parent.remove(object);
        d.w.Graphics.frameCount++;
        d.step(V.OPEN_EASE + 2);
        assert.equal(V.openings().scenery, 0, 'gone from the scene, gone from the list');
        assert.equal(stump(tree), 1e9);
        parent.add(object);
        d.w.Graphics.frameCount++;
        d.step(V.OPEN_EASE + 2);
        assert.ok(near(stump(tree), V.OPEN_STUMP));
        V.closeOpenings(d.scene, true);
        assert.equal(stump(tree), 1e9);
    } finally { w.$gameMap.events = events; R.modelHolderFor = holderFor; }
});

test('while the tactical camera looks the map\'s own corridor and its see-through pass rest, and between changes a frame works nothing out', () => {
    const d = world3D(), { V, R, THREE, w, fight } = d;
    d.clear();
    const scene = Object.create(R.MapScene.prototype), group = new THREE.Group();
    scene.piecesGroup = () => group;
    scene.pieceMaterial = () => new THREE.MeshBasicMaterial();
    scene._pieceGhosts = [{ visible: true }, { visible: true }];
    scene._cutLook = true;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(12.5 - 34.65, 34.6, 12.5 + 34.65);
    camera.updateMatrixWorld(true);
    const before = w.SceneManager._scene;
    w.SceneManager._scene = { _spriteset: { _reactor3d: { scene, camera } } };
    const refresh = V.refreshOpenings;
    let asked = 0;
    V.refreshOpenings = function() { asked++; return refresh.apply(this, arguments); };
    try {
        assert.equal(V.active(), true, 'the tactical camera is the view');
        d.put(0, 12, 12, 0.1);
        fight.touch();
        w.Graphics.frameCount = 1201;
        // The map's own cut was on (the party stood in a house as the battle began).
        const capped = [];
        scene._cutState = '4.35:9,9,16,16';
        scene.updateCutCaps = (map, top, box) => capped.push([top, box]);
        scene.updateCutaway(camera, w.$dataMap, w.$gamePlayer, [d.chars[1]]);
        const shared = R.cutawayUniforms();
        assert.deepEqual(capped, [[1e9, null]], 'the caps over the map\'s own cut come off: the battle\'s openings are the whole cut');
        assert.equal(scene._cutState, 'none');
        assert.equal(shared.rrCutRadius.value, 0, 'no corridor: nothing is ghosted and no model is thinned on a sight line');
        assert.equal(shared.rrCutTop.value, 1e9);
        assert.equal(scene._cutLook, false, 'the see-through pass is not drawn at all');
        assert.ok(scene._pieceGhosts.every(ghost => ghost.visible === false));
        assert.equal(shared.rrCutBattle.value, 1);
        assert.ok(shared.rrOpenCount.value > 0, 'the house is opened by the battle\'s own cut');
        assert.ok(shared.rrFightBox.value[2] > shared.rrFightBox.value[0], 'the battle\'s ground is still told to the pointer and to the numbers over units');
        assert.ok(near(shared.rrFightLevel.value[1], 0 + 1.1, 0.2), 'and the pointer\'s floor is the ground the battle stands on');
        // Nothing changes: the frames after cost a look at the clock (the player is asked; no unit walks).
        assert.equal(fight.awaitsPlayer(), true);
        const first = asked;
        for (let i = 0; i < 200; i++) { w.Graphics.frameCount++; scene.updateCutaway(camera, w.$dataMap, w.$gamePlayer, [d.chars[1]]); }
        assert.equal(asked, first, 'no sight line is walked again while nothing moves');
        assert.equal(V.openings().buildings[0].e, 1);
        // A unit on a roof somewhere does not lift the pointer's floor for everyone.
        d.put(1, 31, 15, 15.1);
        fight.touch();
        w.Graphics.frameCount++;
        scene.updateCutaway(camera, w.$dataMap, w.$gamePlayer, []);
        w.Graphics.frameCount++;
        scene.updateCutaway(camera, w.$dataMap, w.$gamePlayer, []);
        assert.ok(shared.rrFightLevel.value[1] < 2, 'the floor stays the ground: ' + shared.rrFightLevel.value[1]);
        // The battle ends: everything shuts and the map's own cut is the map's again.
        fight._tac.view.own = false;
        for (let i = 0; i < V.OPEN_EASE + 3; i++) { w.Graphics.frameCount++; scene.updateCutaway(camera, w.$dataMap, w.$gamePlayer, []); }
        assert.equal(shared.rrOpenCount.value, 0);
        assert.equal(V.openings().buildings.length, 0);
        assert.equal(shared.rrFightBox.value[2], 0);
    } finally {
        fight._tac.view.own = true;
        V.refreshOpenings = refresh;
        w.SceneManager._scene = before;
        V.closeOpenings(scene, true);
        d.clear();
    }
});

test('what a unit holds is part of its body whenever it came to the hand; the shaders cut at a level and thin nothing over a battle', () => {
    const d = world3D(), { R, THREE } = d;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial());
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2), new THREE.MeshBasicMaterial());
    const character = { eventId: () => 3 };
    const holderFor = R.modelHolderFor, count = R.MapHeld.count;
    R.modelHolderFor = c => (c === character ? { object: body } : null);
    try {
        assert.equal(R.cutawayMarkBody(character), true);
        assert.equal(body.material.userData.rrCutBody.value, 1);
        // The weapon arrives later, as it does: a moment after the battle began.
        R.MapHeld.states.set(R.modelInstanceKey(character), { character, record: { object: weapon } });
        R.MapHeld.count = R.MapHeld.states.size;
        assert.equal(R.cutawayMarkBody(character), false, 'the body was marked already');
        assert.equal(weapon.material.userData.rrCutBody.value, 1, 'and what it holds now is marked with it');
        // Another weapon in the same hand later still.
        const second = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1), new THREE.MeshBasicMaterial());
        R.MapHeld.states.get(R.modelInstanceKey(character)).record = { object: second };
        R.cutawayMarkBody(character);
        assert.equal(second.material.userData.rrCutBody.value, 1);
    } finally { R.MapHeld.states.delete(R.modelInstanceKey(character)); R.MapHeld.count = count; R.modelHolderFor = holderFor; }
    // And a thing made to be held is a body's from the moment it is made: no frame of it thins before the next look.
    const made = R.MapHeld.build(d.w.boxModel(0.2, 0.2, 2), null, { name: 'Weapons/Test', ext: '.glb', size: 2, scale: 1 });
    let materials = 0, marked = 0;
    made.traverse(node => { if (node.material) { materials++; if (node.material.userData.rrCutBody && node.material.userData.rrCutBody.value === 1) marked++; } });
    assert.ok(materials > 0 && marked === materials, 'every material of a held thing is marked as it is built (' + marked + ' of ' + materials + ')');
    const source = source3D();
    assert.ok(!/rrFightHides/.test(source), 'nothing is judged by where its sight line lands any more');
    assert.ok(!/rrFa\b/.test(source), 'and no dither is laid over a battle\'s ground');
    assert.match(source, /"if \(rrCutBody < 0\.5 && vRRWorldPos\.y > rrFightStump\) discard;"/, 'scenery in the way is cut at a height; a body never');
    assert.match(source, /shader\.uniforms\.rrFightStump = material\.userData\.rrFightStump \|\| \(material\.userData\.rrFightStump = \{ value: 1e9 \}\);/, 'whole until it is in the way');
    assert.match(source, /"\\tvec2 rrOpenAt = vRRWorldPos\.xz - rrFaceN\.xz \* 0\.02;"/, 'a wall\'s face is asked a hair inside its own tile');
    assert.match(source, /"\\t\\t\\tif \(vRRWorldPos\.y > rrOpenCut\) discard;"/, 'what is opened is gone above its level, whole under it');
    assert.match(source, /"if \(rrOpenCount > 0 && vRRWorldPos\.y > rrOpenLow\) \{"/, 'and costs nothing where nothing is opened, nor under the lowest cut');
    assert.match(source, /"\\tif \(rrOpenAt\.x >= rrOpenAll\.x && rrOpenAt\.y >= rrOpenAll\.y && rrOpenAt\.x <= rrOpenAll\.z && rrOpenAt\.y <= rrOpenAll\.w\) \{"/, 'nor outside the one box everything open lies in');
    assert.match(source, /"\\t\\t\\tif \(rrJ >= rrOpenFeet\) break;"/, 'the footprints are asked first');
    assert.match(source, /"\\t\\tif \(rrOpenCut < 1e8\) \{"/, 'and the walls cut low only by what lies in one');
    assert.match(source, /"\\t\\t\\t\\tif \(rrJ < rrOpenFeet\) continue;"/);
    assert.ok(!/rrFightEye/.test(source), 'nothing unread is bound to every shader');
    // A shader made from it declares what it uses, for a piece and for a model.
    for (const flags of [{ __reactorPieces: true }, { __reactorModel: true }]) {
        const material = Object.assign({ userData: {} }, flags), shader = { uniforms: {}, fragmentShader: 'varying vec3 vRRWorldPos;\nvoid main() {\n\t#include <map_fragment>\n}' };
        R.injectCutaway(material, shader);
        assert.equal(material.userData.rrFightStump.value, 1e9);
        assert.equal(shader.uniforms.rrOpenCount.value, R.cutawayUniforms().rrOpenCount.value);
        assert.equal(/rrOpenBox\[/.test(shader.fragmentShader), !!flags.__reactorPieces, 'only what is built asks the openings');
        assert.equal(/rrFightStump\) discard/.test(shader.fragmentShader), !!flags.__reactorModel);
        if (flags.__reactorPieces) assert.match(shader.fragmentShader, new RegExp('uniform vec4 rrOpenBox\\[' + R.CUTAWAY_OPENINGS + '\\];\\nuniform float rrOpenTop\\[' + R.CUTAWAY_OPENINGS + '\\];\\nuniform int rrOpenCount;\\nuniform int rrOpenFeet;\\nuniform vec4 rrOpenAll;\\nuniform float rrOpenLow;'));
    }
    assert.equal(R.cutawayUniforms().rrOpenBox.value.length, 4 * R.CUTAWAY_OPENINGS);
});

test('cursor and roof previews do not change an occupied room or rebuild its caps', () => {
    const d=world3D(),{V,fight,scene,w}=d;d.clear();d.put(0,12,12,0.1);d.look(12,12);d.step(V.OPEN_EASE+2);
    const cursor=fight._tac.cursor,group=scene.piecesGroup;let capped=0;
    scene.piecesGroup=()=>{capped++;return group();};const before=d.ring(HOUSE);
    try{for(let i=0;i<80;i++){
        Object.assign(cursor,{on:true,x:i%2?12:31,y:i%2?12:15,h:i%2?5.1:15.1});w.Graphics.frameCount++;d.step(0,true);
        assert.deepEqual(d.ring(HOUSE),before);assert.equal(V.openings().buildings.length,1);
    }assert.equal(capped,0);}finally{scene.piecesGroup=group;cursor.on=false;}
});

test('only the controlled active unit can open a room; unselected allies and enemies cannot', () => {
    const d=world3D(),{V,fight,units}=d;d.clear();d.look(12,12);d.put(0,12,12,0.1);d.step(V.OPEN_EASE+2);
    assert.equal(V.openings().buildings.length,1);
    fight._act.unitId=units[1].id;d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,0,'the selected ally is outdoors');
    const enemy=units.find(u=>!fight.isPlayerUnit(u));
    if(enemy){const i=units.indexOf(enemy);d.put(i,12,12,0.1);fight._act.unitId=enemy.id;d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,0,'an enemy turn does not disclose its room');}
    fight._act.unitId=null;d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,0,'no selected unit opens nothing');
});

test('a village of reachable destinations stays whole; only the occupied building takes opening slots', () => {
    const d=world3D(),{V,R,M}=d;d.clear();d.look(12,12);
    M.count=0;for(let y=2;y<10;y+=2)for(let x=2;x<50;x+=3){const i=M.count++;M.x[i]=x;M.y[i]=y;M.h[i]=0.1;M.kind[i]=M.KINDS.move;}
    d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,0);assert.equal(R.cutawayUniforms().rrOpenCount.value,0);
    d.put(0,12,12,0.1);d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,1);
    assert.deepEqual(Array.from(V.openings().buildings[0].box),HOUSE);assert.ok(R.cutawayUniforms().rrOpenCount.value<=R.CUTAWAY_OPENINGS);M.count=0;
});

test('what the shaders are told is whole at every frame: every box inside the one box, the lowest height the lowest, nothing cut outside or under them', () => {
    const d = world3D(), { V, R } = d;
    d.clear();
    const shared = R.cutawayUniforms(), boxes = shared.rrOpenBox.value, tops = shared.rrOpenTop.value, all = shared.rrOpenAll.value;
    const whole = when => {
        const n = shared.rrOpenCount.value;
        let least = 1e9;
        for (let i = 0; i < n; i++) {
            assert.ok(boxes[i * 4] >= all[0] && boxes[i * 4 + 1] >= all[1] && boxes[i * 4 + 2] <= all[2] && boxes[i * 4 + 3] <= all[3], when + ': box ' + i + ' lies in the one box');
            least = Math.min(least, tops[i]);
        }
        if (n) assert.equal(shared.rrOpenLow.value, least, when + ': the lowest height is the lowest of them');
        // The footprints come first, and every other box lies inside the footprints: its corners and its middle.
        const feet = shared.rrOpenFeet.value;
        assert.ok(feet <= n && (n === 0 || feet > 0), when + ': footprints first');
        const footed = (x, z) => { for (let i = 0; i < feet; i++) if (x >= boxes[i * 4] && z >= boxes[i * 4 + 1] && x <= boxes[i * 4 + 2] && z <= boxes[i * 4 + 3]) return true; return false; };
        for (let i = feet; i < n; i++) {
            const x0 = boxes[i * 4] + 0.01, z0 = boxes[i * 4 + 1] + 0.01, x1 = boxes[i * 4 + 2] - 0.01, z1 = boxes[i * 4 + 3] - 0.01;
            for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) assert.ok(footed(x, z), `${when}: box ${i} lies in a footprint (${x}, ${z})`);
        }
        return n;
    };
    d.look(12, 12);
    d.put(0, 12, 12, 0.1);
    d.step(0);
    for (let i = 0; i < V.OPEN_EASE + 2; i++) { assert.ok(whole('opening, frame ' + i) > 0); d.frame(); }
    // The one box is the house and a little past it, not the map.
    assert.ok(all[0] > HOUSE[0] - 2 && all[1] > HOUSE[1] - 2 && all[2] < HOUSE[2] + 3 && all[3] < HOUSE[3] + 3, 'the one box is as small as what is open: ' + Array.from(all));
    assert.ok(near(shared.rrOpenLow.value, 0.1 + V.OPEN_FOOT), 'the lowest cut is a wall\'s foot');
    assert.equal(d.shaderCut(12.5, 12.5, 0.2), 1e9, 'the floor of the room is under every cut: it asks about no box');
    assert.equal(d.shaderCut(31.5, 15.5, 12), 1e9, 'and the tower is outside the one box');
    // Someone behind the tower as well: the one box grows to hold both.
    d.put(1, 44, 4, 0);
    d.look(28, 8);
    d.step(0);
    for (let i = 0; i < V.OPEN_EASE + 2; i++) { whole('two open, frame ' + i); d.frame(); }
    if (V.openings().buildings.length > 1) assert.ok(all[2] >= TOWER[2] + 1 && all[0] <= HOUSE[0], 'it holds everything open');
    // Shutting, frame by frame, then nothing.
    d.put(0, 46, 34, 0); d.put(1, 48, 34, 0);
    d.step(V.OPEN_HOLD - 2);
    for (let i = 0; i < V.OPEN_EASE + 6; i++) { whole('shutting, frame ' + i); d.frame(); }
    assert.equal(shared.rrOpenCount.value, 0);
});

test('the occupied storey follows the actor on stairs, not the cursor on a roof', () => {
    const d=world3D(),{V,R,fight}=d;d.clear();d.look(12,12);const storey=R.PIECE_STOREY-R.CUTAWAY_DROP;
    for(const h of [0.1,1.1,2.1]){d.put(0,12,12,h);Object.assign(fight._tac.cursor,{on:true,x:12,y:12,h:5.1});d.step(V.OPEN_EASE+2);assert.ok(near(V.openAt(12,12),storey),`actor at ${h}`);}
    d.clear();d.put(0,31,15,5.1);d.look(31,15);d.step(V.OPEN_EASE+2);
    assert.ok(near(V.openAt(31,15),2*R.PIECE_STOREY-R.CUTAWAY_DROP),'inside the next storey');
    d.put(0,31,15,15.1);d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,0,'on the tower roof');fight._tac.cursor.on=false;
});

test('a doorway is part of the wall it stands in: the run comes down through it, casing and all', () => {
    const d = world3D(), { V, R, M } = d;
    d.clear();
    d.put(0, 6, 44, 0.1);
    M.count = 1; M.x[0] = 6; M.y[0] = 44; M.h[0] = 0.1; M.kind[0] = M.KINDS.move;
    d.look(6, 44);
    d.step(V.OPEN_EASE + 2);
    const foot = 0.1 + V.OPEN_FOOT, open = V.openings().buildings;
    assert.equal(open.length, 1);
    assert.equal(open[0].runs, 2, 'the west side and the south side, each one run');
    for (let y = 42; y <= 46; y++) assert.ok(near(V.openAt(4, y), foot) && near(d.shaderCut(4.5, y + 0.5), foot), `the west wall at 4,${y}, the doorway's tile among them (${V.openAt(4, y)})`);
    assert.ok(near(d.shaderCut(4 - 0.2, 44.5), foot), 'and what hangs on its outer face');
    assert.ok(near(V.openAt(6, 42), R.PIECE_STOREY - R.CUTAWAY_DROP), 'the wall behind the room stands');
    M.count = 0;
    d.clear();
});

test('a solid block never becomes a room merely because it hides the selected unit', () => {
    const d=world3D(),{V}=d;d.clear();d.put(0,41,25,0);d.look(40,26);d.step(V.OPEN_EASE+2);
    assert.equal(V.openings().buildings.length,0);for(let y=26;y<=28;y++)for(let x=38;x<=40;x++)assert.equal(d.shaderCut(x+0.5,y+0.5),1e9);
});

test('the map camera also opens only around the controlled unit, including when it is not the leader', () => {
    const d = world3D(), { R, THREE, w, fight, units } = d;
    d.clear(); d.put(0, 12, 12, 0.1); d.put(1, 46, 34, 0.1);
    const scene = Object.create(R.MapScene.prototype), camera = new THREE.PerspectiveCamera();
    scene.setCutLook = () => {}; scene.updateCutCaps = () => {};
    camera.position.set(-20, 35, 45); camera.updateMatrixWorld(true);
    fight._tac.view.own = false;
    const update = () => scene.updateCutaway(camera, w.$dataMap, w.$gamePlayer, []);
    try {
        fight._act.unitId = units[1].id; update();
        assert.equal(R.cutawayUniforms().rrCutTop.value, 1e9, 'the leader inside does not open a house for the selected outdoor ally');
        d.put(1, 12, 12, 0.1); d.put(0, 46, 34, 0.1); update();
        assert.ok(R.cutawayUniforms().rrCutTop.value < 10, 'the selected follower inside opens its room');
        fight._act.unitId = 0; update();
        assert.equal(R.cutawayUniforms().rrCutTop.value, 1e9, 'no selection reveals no room');
        fight._act.unitId = units[2].id; d.put(2, 12, 12, 0.1); update();
        assert.equal(R.cutawayUniforms().rrCutTop.value, 1e9, 'an enemy cannot reveal the interior');
    } finally { fight._tac.view.own = true; }
});

test('actual threshold crossing updates openings without a cursor change or a completed move', () => {
    const d=world3D(),{V,fight,w,chars}=d;d.clear();d.look(12,12);
    const c=chars[0];c.locate(12,12);c._realX=9;c._realY=12;c._reactorGround=0.1;
    d.step(V.OPEN_EASE+2);assert.equal(V.openings().buildings.length,0,'the logical destination is already inside, but the body is outside');
    c._realX=12;for(let i=0;i<V.OPEN_EASE+3;i++)d.frame();assert.equal(V.openings().buildings.length,1,'the body crossed the threshold');
    let calls=0;const refresh=V.refreshOpenings;V.refreshOpenings=function(...a){calls++;return refresh.apply(this,a);};
    try{for(let i=0;i<24;i++)d.frame();assert.equal(calls,0,'a still actor does not rescan the map');}
    finally{V.refreshOpenings=refresh;}
    c.locate(9,12);for(let i=0;i<V.OPEN_EASE+3;i++)d.frame();assert.equal(V.openings().buildings.length,0);
});

test('movement picking uses the visible roof outside and the revealed room floor inside', () => {
    const d = world3D(), { F, V, R, fight, w } = d;
    d.clear(); d.put(0, 9, 12, 0.1); d.look(12, 12); d.step(V.OPEN_EASE + 2);
    const G = F.Grid, In = F.Input;
    fight.ensureFlood(fight.activeUnit(), 20);
    const saved = { live: V.live, active: V.active, ground: R.groundTileFromRay, flood: fight.ensureFlood,
        reached: G.reachedAt, stop: G.canStopAt, grapple: G.grappledAt, ray: In._ray };
    // A camera ray crosses two reachable surfaces. The old broad battle rectangle
    // incorrectly skipped the roof even though the outdoor actor kept it visible.
    V.live = () => ({ camera: { updateMatrixWorld() {} } }); V.active = () => true;
    In._ray = { setFromCamera() {}, ray: { origin: { x: 12.5, y: 20, z: 12.5 }, direction: { x: 0, y: -1, z: 0 } } };
    In._point = new w.THREE.Vector2();
    R.groundTileFromRay = () => ({ x: 12, y: 12 }); fight.ensureFlood = () => {};
    G.reachedAt = (x, y, out) => { out[0] = 5.1; out[1] = 1; out[2] = 0.1; out[3] = 1; return 2; };
    G.canStopAt = () => true; G.grappledAt = () => false; fight._act.steps = 20;
    R.cutawayUniforms().rrFightBox.value.splice(0, 4, 0, 0, 59, 51);
    R.cutawayUniforms().rrFightLevel.value[1] = 1.1;
    try {
        assert.ok(near(In.pick(100, 100).h, 5.1), 'closed building roof is selectable');
        d.put(0, 12, 12, 0.1); d.step(V.OPEN_EASE + 2);
        assert.ok(near(In.pick(100, 100).h, 0.1), 'occupied room is selectable through its actual opening');
        G.grappledAt = () => true;
        assert.ok(near(In.pick(100, 100).h, 5.1), 'a grapple can still select the roof edge from inside');
    } finally {
        V.live = saved.live; V.active = saved.active; R.groundTileFromRay = saved.ground; fight.ensureFlood = saved.flood;
        G.reachedAt = saved.reached; G.canStopAt = saved.stop; G.grappledAt = saved.grapple; In._ray = saved.ray;
    }
});

test('the travelling square: from the unit to the destination in the same time however long the way, tile by tile, easing in and out of each', () => {
    const M = world3D().M;
    const whole = M.WAY_PASS + M.WAY_REST;
    assert.ok(whole >= 54 && whole <= 66, 'about a pass a second: ' + whole + ' frames');
    for (const count of [2, 5, 20, 64]) {
        let last = -1, peak = -1;
        for (let frame = 0; frame < M.WAY_PASS; frame++) {
            const place = M.wayPulse(frame, count);
            assert.ok(place >= last, 'it only goes forward');
            last = place;
            // The tile it lights most this frame.
            let best = -1, glow = 0;
            for (let i = 1; i < count; i++) if (M.wayGlow(i, place) > glow) { glow = M.wayGlow(i, place); best = i; }
            assert.ok(best >= peak, 'tile by tile toward the destination');
            if (best > peak) peak = best;
        }
        assert.equal(peak, count - 1, 'it reaches the destination within the pass (' + count + ' tiles)');
        assert.equal(M.wayPulse(0, count), 0, 'setting off from the unit\'s tile');
        for (let frame = M.WAY_PASS; frame < whole; frame++) assert.ok(Number.isNaN(M.wayPulse(frame, count)), 'then a rest');
        assert.equal(M.wayPulse(whole, count), 0, 'and again');
    }
    assert.ok(Number.isNaN(M.wayPulse(10, 1)) && Number.isNaN(M.wayPulse(10, 0)), 'no way, no pulse');
    assert.equal(M.wayGlow(3, 3), 1);
    assert.equal(M.wayGlow(3, 4), 0);
    assert.equal(M.wayGlow(3, 2), 0);
    assert.ok(near(M.wayGlow(3, 3.5), 0.5) && M.wayGlow(3, 3.1) > 0.95 && M.wayGlow(3, 3.9) < 0.05, 'eased, not a step');
});

test('on a 3D map each tile of the way carries a square on its own ground, the destination a larger one, a tile someone stands on none; a frame moves the travelling pair and makes nothing', () => {
    const d = world3D(), { w, fight, M, THREE, R } = d;
    d.clear();
    const me = d.units.find(u => u.actorId === 1), c = fight.character(me);
    c.locate(5, 30); c._reactorGround = 0;
    if (fight._act && fight._act.stage !== 'pick') fight.commandCancel();
    assert.ok(fight.commandSelectUnit(me.id));
    fight.setCursor(9, 30);
    M.collect(fight);
    assert.equal(M.wayCount, 5);
    // The tiles of the way keep the color of where the unit can go: no pale band under the squares.
    for (let i = 0; i < M.count; i++) assert.notEqual(M.kind[i], M.KINDS.path);
    // Stairs: each tile half a tile higher than the last.
    const ground = R.groundHeightAt;
    R.groundHeightAt = (map, x) => (Math.floor(x) - 5) * 0.5;
    const group = new THREE.Group(), live = { scene: { belowGroup: () => group, _meshes: [], _materials: [] } };
    const at = (mesh, i) => Array.from(mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16));
    const tint = (mesh, i) => Array.from(mesh.instanceColor.array.slice(i * 3, i * 3 + 3));
    try {
        w.Graphics.frameCount = 3000;
        M.drawWay3D(live);
        const mesh = M.way.mesh;
        assert.equal(mesh.parent, group);
        assert.equal(M.way.squares, 2 * 3 + 4, 'an edge and a square on each of the three tiles between, four for the destination');
        const on = new Map();
        for (let i = 0; i < M.way.squares; i++) {
            const m = at(mesh, i), x = m[12] - 0.5;
            assert.ok(Number.isInteger(x) && x >= 6 && x <= 9, 'on a tile of the way past the unit\'s own: ' + x);
            assert.ok(near(m[13] - (x - 5) * 0.5, 0.1, 0.03), `the square on tile ${x} lies on that tile's ground (${m[13]})`);
            on.set(x, Math.max(on.get(x) || 0, m[0]));
        }
        for (const x of [6, 7, 8]) assert.ok(near(on.get(x), M.WAY_SQUARE + M.WAY_RIM * 2), 'a square inset in its tile, with its edge');
        assert.ok(on.get(9) > on.get(8) + 0.2 && on.get(9) < 1, 'the destination is plainly the end: larger, inside its tile');
        assert.ok(!on.has(5), 'none under the unit: its ring is there');
        // A pass, frame by frame: the travelling square is on one tile after another, toward the destination, brighter than the quiet ones.
        const quiet = tint(mesh, 4), array = mesh.instanceMatrix.array, spriteset = { _reactor3d: live };
        let peak = 0, lit = 0;
        for (let frame = 0; frame < M.WAY_PASS + M.WAY_REST; frame++) {
            w.Graphics.frameCount = 3000 + frame;
            M.pulseWay(spriteset);
            assert.equal(mesh.count, M.way.squares + 4, 'the same instances every frame');
            assert.equal(mesh.instanceMatrix.array, array, 'and the same buffer');
            let brightest = -1, size = 0;
            for (let k = 0; k < 2; k++) {
                const m = at(mesh, M.way.squares + k * 2 + 1);
                if (!(m[0] > 0)) continue;
                const x = m[12] - 0.5;
                assert.ok(x >= 6 && x <= 9, 'never on the unit\'s own tile');
                assert.ok(near(m[13] - (x - 5) * 0.5, 0.125, 0.03), 'on that tile\'s ground, over its square');
                if (m[0] > size) { size = m[0]; brightest = x; }
            }
            if (frame >= M.WAY_PASS) { assert.equal(brightest, -1, 'resting: nothing travels'); continue; }
            if (brightest < 0) continue;
            lit++;
            assert.ok(brightest >= peak, 'forward only');
            peak = brightest;
            const colors = [tint(mesh, M.way.squares + 1), tint(mesh, M.way.squares + 3)];
            assert.ok(colors.some(color => color[0] >= quiet[0] - 1e-6), 'no dimmer than a quiet square');
        }
        assert.equal(peak, 9, 'it ends on the destination');
        assert.ok(lit > M.WAY_PASS * 0.7, 'and is somewhere on the way for most of the pass');
        // The cost stands past the destination, the way the unit arrives (here: east), on the ground there.
        const made = { Sprite: w.Sprite, Bitmap: w.Bitmap, project: R.projectToScreen };
        const pool = sprites(w), stage = Object.assign(new w.Sprite(), { _reactor3d: Object.assign({ camera: {} }, live) });
        R.projectToScreen = (camera, x, y, z, out) => { out.x = x * 10; out.y = z * 10; return out; };
        try {
            M.placeCost(stage);
            assert.equal(M.way.label.visible, true);
            assert.ok(near(M.way.label.x, (9.5 + 0.9) * 10, 1) && near(M.way.label.y - 17, 30.5 * 10, 1), `past the end, not over it (${M.way.label.x}, ${M.way.label.y})`);
            void pool;
        } finally { w.Sprite = made.Sprite; w.Bitmap = made.Bitmap; R.projectToScreen = made.project; M.way.label = null; }
        // A close shot hides the marks: the way goes with them.
        M.hidden = true;
        M.update(spriteset);
        assert.equal(mesh.visible, false, 'the way\'s squares are not drawn over a close shot');
        M.hidden = false; M.wasHidden = false; mesh.visible = true;
        // Someone stands on a tile of the way (an ally passed through): that tile carries nothing.
        const unitAt = fight.unitAt;
        fight.unitAt = (x, y) => (x === 7 && y === 30 ? me : null);
        M.drawWay3D(live);
        fight.unitAt = unitAt;
        assert.equal(M.way.squares, 2 * 2 + 4);
        assert.equal(M.wayOn[2], 0);
        for (let i = 0; i < M.way.squares; i++) assert.notEqual(at(mesh, i)[12], 7.5);
        // The way changes: the frame it does, the old one is gone.
        fight.setCursor(5, 30);
        M.collect(fight);
        M.drawWay3D(live);
        assert.equal(mesh.count, 0);
        assert.equal(mesh.visible, false);
        M.pulseWay(spriteset);
        assert.equal(mesh.count, 0, 'and a frame later nothing has come back');
    } finally { R.groundHeightAt = ground; fight.commandCancel(); d.clear(); }
});

//-----------------------------------------------------------------------------
// The flat map.

function sprites(w) {
    let made = 0;
    function Sprite(bitmap) { made++; this.bitmap = bitmap || null; this.children = []; this.parent = null; this.visible = true; this.x = 0; this.y = 0; this.z = 0; this.opacity = 255; this.anchor = { x: 0, y: 0 }; this.scale = { x: 1, y: 1 }; }
    Sprite.prototype.addChild = function(child) { child.parent = this; this.children.push(child); return child; };
    Sprite.prototype.addChildAt = function(child, index) { child.parent = this; this.children.splice(index, 0, child); return child; };
    Sprite.prototype.setFrame = function() {};
    function Bitmap(width, height) { this.width = width; this.height = height; this.rects = []; }
    Bitmap.prototype.fillRect = function(x, y, wide, high, color) { this.rects.push([x, y, wide, high, color]); };
    Bitmap.prototype.drawText = function() {};
    w.Sprite = Sprite; w.Bitmap = Bitmap;
    return { count: () => made, tilemap: new Sprite() };
}

test('on a flat map the same: a square sprite on each tile of the way, the destination\'s own, two travelling sprites that move and fade, nothing made per frame, gone the frame the way or the battle is', () => {
    const w = fightWorld({ tactical: true, events: [unit(1, 12, 9, 'enemy 1')] });
    w.$dataActors[1].note = '<move: 5>';
    const pool = sprites(w);
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    const fight = w.$gameFight, F = w.ReactorFight, M = F.Marks, me = fight._units.find(u => u.actorId === 1);
    const spriteset = Object.assign(new w.Sprite(), { _tilemap: pool.tilemap, _reactor3d: null });
    assert.ok(fight.commandSelectUnit(me.id));
    fight.setCursor(5, 3);
    w.Graphics.frameCount = 500;
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.equal(M.wayCount, 5);
    const way = M.way, tw = w.$gameMap.tileWidth(), th = w.$gameMap.tileHeight();
    assert.equal(way.layer.parent, pool.tilemap, 'its own layer under the characters');
    const shown = way.sprites.filter(sprite => sprite.visible);
    assert.equal(shown.length, 4, 'a square on each tile past the unit\'s own');
    for (let i = 1; i < M.wayCount; i++) assert.ok(shown.some(sprite => sprite.x === M.wayX[i] * tw && sprite.y === M.wayY[i] * th), 'tile ' + i);
    assert.ok(!shown.some(sprite => sprite.x === M.wayX[0] * tw && sprite.y === M.wayY[0] * th), 'none under the unit');
    const end = shown.find(sprite => sprite.x === M.wayX[4] * tw && sprite.y === M.wayY[4] * th);
    assert.ok(shown.filter(sprite => sprite.bitmap === end.bitmap).length === 1, 'the destination has a picture of its own');
    // The pictures: a dark edge under a lighter square, inset in the tile; the destination's larger.
    const span = bitmap => Math.max(...bitmap.rects.map(rect => rect[2]));
    assert.ok(span(shown.find(sprite => sprite !== end).bitmap) < tw * 0.6 && span(end.bitmap) > tw * 0.7 && span(end.bitmap) < tw);
    assert.equal(way.pulses.length, 2);
    assert.equal(way.label.visible, true, 'the cost beside the end');
    // Past the destination, the way the unit arrives: not over the square on the tile before it.
    const ox = M.wayX[4] - M.wayX[3], oy = M.wayY[4] - M.wayY[3], lx = way.label.x - (M.wayX[4] + 0.5) * tw, ly = way.label.y - 17 - (M.wayY[4] + 0.5) * th;
    assert.ok(lx * ox + ly * oy > tw * 0.5, `the number stands past the end (${lx}, ${ly} for a step of ${ox}, ${oy})`);
    assert.ok(Math.abs(way.label.x - (M.wayX[3] + 0.5) * tw) + Math.abs(way.label.y - 17 - (M.wayY[3] + 0.5) * th) > tw, 'clear of the tile before');
    const cells = way.layer.children.length, made = pool.count();
    // A pass, frame by frame.
    let peak = 0, lit = 0;
    for (let frame = 0; frame < M.WAY_PASS + M.WAY_REST; frame++) {
        w.Graphics.frameCount = 500 + frame;
        M.update(spriteset);
        M.placeCost(spriteset);
        const on = way.pulses.filter(sprite => sprite.visible);
        if (frame >= M.WAY_PASS) { assert.equal(on.length, 0, 'resting'); continue; }
        if (!on.length) continue;
        lit++;
        const best = on.reduce((a, b) => (a.opacity >= b.opacity ? a : b));
        const index = Array.from({ length: M.wayCount }, (_, i) => i).find(i => near(best.x, (M.wayX[i] + 0.5) * tw) && near(best.y, (M.wayY[i] + 0.5) * th));
        assert.ok(index >= 1, 'in the middle of a tile of the way, never the unit\'s own');
        assert.ok(index >= peak, 'forward only');
        peak = index;
        for (const sprite of on) assert.ok(sprite.opacity > 0 && sprite.opacity <= 255 && sprite.scale.x > 0.3 && sprite.scale.x <= 1.05);
    }
    assert.equal(peak, 4, 'it ends on the destination');
    assert.ok(lit > M.WAY_PASS * 0.7);
    assert.equal(pool.count(), made, 'no sprite was made while it travelled');
    assert.equal(way.layer.children.length, cells);
    // A close shot hides the marks: the way, its travelling square and its number go that frame, and come back as they were.
    w.Graphics.frameCount = 500 + 20;
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.ok(way.layer.visible && way.pulses.some(sprite => sprite.visible) && way.label.visible, 'in the middle of a pass');
    M.hidden = true;
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.equal(way.layer.visible, false, 'the squares');
    assert.ok(way.pulses.every(sprite => !sprite.visible), 'the travelling square');
    assert.equal(way.label.visible, false, 'the number');
    M.drawWay2D(spriteset, true);
    assert.equal(way.layer.visible, false, 'laid again while hidden, it stays hidden');
    M.hidden = false;
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.ok(way.layer.visible && way.label.visible, 'back in the picture after the shot');
    assert.equal(way.sprites.filter(sprite => sprite.visible).length, 4);
    // The cursor back on the unit: the way is gone that frame.
    fight.setCursor(me && fight.character(me).x, fight.character(me).y);
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.equal(M.wayCount, 0);
    assert.ok(way.sprites.every(sprite => !sprite.visible) && way.pulses.every(sprite => !sprite.visible));
    assert.equal(way.label.visible, false);
    // A cost left over with no way to show it by: no number.
    const cost = M.wayCost;
    M.wayCost = 3;
    M.placeCost(spriteset);
    assert.equal(way.label.visible, false, 'no way, no number');
    M.wayCost = cost;
    // Shown again, then the battle ends: gone that frame too.
    fight.setCursor(5, 3);
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.equal(way.sprites.filter(sprite => sprite.visible).length, 4);
    fight.end(F.WIN);
    M.update(spriteset);
    M.placeCost(spriteset);
    assert.ok(way.sprites.every(sprite => !sprite.visible) && way.pulses.every(sprite => !sprite.visible), 'nothing of the way outlives the battle');
    assert.equal(way.label.visible, false);
});

test('the arrow is gone: no bands, no head, nothing of it left to draw', () => {
    assert.ok(!/M\.arrow\b/.test(tacticalSource));
    assert.ok(!/WAY_HEAD|WAY_DARK|wayBitmap\(|sideOf\(/.test(tacticalSource));
    assert.ok(!/markCells\(path, K\.path\)/.test(tacticalSource), 'and no pale band under the way');
    assert.ok(!/flagScenery|cutSubjects|rrFightProp/.test(tacticalSource), 'nor the scenery flags and the corridors that thinned what stood near the pointer');
    const M = world3D().M;
    assert.equal(M.arrow, undefined);
    assert.equal(typeof M.pulseWay, 'function');
});
