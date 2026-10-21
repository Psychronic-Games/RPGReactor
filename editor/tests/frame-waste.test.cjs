/**
 * Draws a frame made and threw away, and what stops them.
 *
 * North Haven's village square, no water in sight, drew the whole scene three
 * more times a frame for its lakes' mirror pictures, and every piece chunk a
 * second time for a see-through pass whose shader discarded all of it: half
 * the frame's CPU on a fast desktop. A water sheet now asks whether it put a
 * pixel on screen before it takes a picture, and a ghost chunk is drawn only
 * where a corridor crosses it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;
const source = name => fs.readFileSync(path.join(repoRoot, 'runtime', name), 'utf8');

/** A GL whose occlusion queries answer `passed` as it stands when they are read. */
function fakeGl() {
    const gl = {
        ANY_SAMPLES_PASSED_CONSERVATIVE: 0x8D6A, QUERY_RESULT: 0x8866, QUERY_RESULT_AVAILABLE: 0x8867,
        made: 0, begun: 0, ended: 0, deleted: 0, lost: false, ready: true, passed: false,
        isContextLost() { return this.lost; },
        createQuery() { return { id: this.made++ }; },
        beginQuery() { this.begun++; },
        endQuery() { this.ended++; },
        deleteQuery() { this.deleted++; },
        getQueryParameter(query, what) {
            if (what === this.QUERY_RESULT_AVAILABLE) return this.ready;
            return this.passed ? 1 : 0;
        }
    };
    return gl;
}

/** The game's globals, which mark a running game for the runtime, for the length of `fn`. */
function inGame(fn) {
    const saved = { Graphics: global.Graphics, SceneManager: global.SceneManager };
    global.Graphics = { frameCount: 0 };
    global.SceneManager = {};
    const sight = Reactor3D.WaterSight, kept = { frame: sight._frame, camera: sight._camera, enabled: sight.enabled };
    try { return fn(); } finally {
        global.Graphics = saved.Graphics; global.SceneManager = saved.SceneManager;
        sight._frame = kept.frame; sight._camera = kept.camera; sight.enabled = kept.enabled;
        Reactor3D.Mirrors._rendering = false;
    }
}

function drawSheet(mesh, gl, camera) {
    const renderer = { getContext: () => gl };
    mesh.onBeforeRender(renderer, null, camera);
    mesh.onAfterRender(renderer, null, camera);
}

test('a water sheet counts as seen until its draws say otherwise, and for a while after its last pixel', () => {
    inGame(() => {
        const sight = Reactor3D.WaterSight, camera = new THREE.PerspectiveCamera(), mesh = new THREE.Mesh();
        // Behind a hill.
        const gl = fakeGl();
        sight.begin(camera);
        sight.watch(mesh);
        assert.equal(sight.seen(mesh), true, 'a sheet just laid has its picture while the first answers come');
        for (let frame = 0; frame < sight.HOLD; frame++) { sight.begin(camera); drawSheet(mesh, gl, camera); }
        assert.equal(sight.seen(mesh), true, 'still inside the hold');
        sight.begin(camera);
        assert.equal(sight.seen(mesh), false, 'no pixel for the whole hold: no picture');
        assert.equal(gl.begun, gl.ended, 'every query begun round a draw is ended after it');
        // Round the hill: a pixel on screen.
        gl.passed = true;
        sight.begin(camera); drawSheet(mesh, gl, camera);
        sight.begin(camera); drawSheet(mesh, gl, camera);
        assert.equal(sight.seen(mesh), true, 'the sheet came into view: its picture is back');
    });
});

test('only the frame\'s own draw is asked: not a mirror\'s eye, the capture, another camera, or an answer still on its way', () => {
    inGame(() => {
        const sight = Reactor3D.WaterSight, camera = new THREE.PerspectiveCamera(), other = new THREE.PerspectiveCamera(), mesh = new THREE.Mesh();
        const gl = fakeGl();
        sight.begin(camera);
        sight.watch(mesh);
        drawSheet(mesh, gl, other);
        assert.equal(gl.begun, 0, 'a shadow row\'s or a mirror\'s camera asks nothing');
        Reactor3D.Mirrors._rendering = true;
        drawSheet(mesh, gl, camera);
        Reactor3D.Mirrors._rendering = false;
        assert.equal(gl.begun, 0, 'nor a draw inside a mirror picture');
        Reactor3D.Reflections._capturing = true;
        drawSheet(mesh, gl, camera);
        Reactor3D.Reflections._capturing = false;
        assert.equal(gl.begun, 0, 'nor the capture');
        drawSheet(mesh, gl, camera);
        assert.equal(gl.begun, 1);
        gl.ready = false;
        drawSheet(mesh, gl, camera);
        drawSheet(mesh, gl, camera);
        assert.equal(gl.begun, 1, 'one question at a time');
        assert.equal(gl.made, 1);
        gl.lost = true; gl.ready = true;
        drawSheet(mesh, gl, camera);
        assert.equal(gl.begun, 1, 'nothing is asked of a lost context');
        // A restored context made none of the old queries: the old one is dropped, not read.
        gl.lost = false;
        Reactor3D.contextGeneration++;
        try {
            drawSheet(mesh, gl, camera);
            assert.equal(gl.deleted, 0, 'the lost context\'s query is not handed to the new one');
            assert.equal(gl.begun, 2);
        } finally { Reactor3D.contextGeneration--; }
    });
});

test('outside a game every sheet is seen, and the switch gives the old behavior back', () => {
    const sight = Reactor3D.WaterSight, mesh = new THREE.Mesh();
    const saved = { Graphics: global.Graphics, frame: sight._frame };
    delete global.Graphics;
    try {
        sight.watch(mesh);
        sight._frame += sight.HOLD * 10;
        assert.equal(sight.active(), false, 'the editor draws a frame when something changes: an answer would wait for the next');
        assert.equal(sight.seen(mesh), true);
    } finally { global.Graphics = saved.Graphics; sight._frame = saved.frame; }
    inGame(() => {
        sight.begin(null);
        sight.watch(mesh);
        sight._frame += sight.HOLD + 5;
        assert.equal(sight.seen(mesh), false);
        sight.enabled = false;
        assert.equal(sight.seen(mesh), true);
    });
    assert.equal(sight.seen(new THREE.Mesh()), true, 'a sheet nobody watches is not judged');
});

test('a sheet is watched as it is laid, and the mirrors pass by one out of sight', () => {
    assert.match(source('reactor_3d_world.js'), /this\._waterMeshes\.push\(mesh\);\n\s*if \(Reactor3D\.WaterSight\) Reactor3D\.WaterSight\.watch\(mesh\);/);
    assert.match(source('reactor_3d.js'), /if \(Reactor3D\.WaterSight\) Reactor3D\.WaterSight\.begin\(camera\);/, 'each frame names the camera whose draws count');
    assert.match(source('reactor_3d_lighting.js'), /const own = object\.userData && object\.userData\.rrMirrorPlane;\n\s*if \(own\) \{\n\s*\/\/[^\n]*\n\s*if \(Reactor3D\.WaterSight && !Reactor3D\.WaterSight\.seen\(object\)\) continue;/);
});

test('mirror pictures are drawn at the size the frame is', () => {
    const lighting = source('reactor_3d_lighting.js');
    assert.match(lighting, /Math\.min\(1080, size\.y\) \* \(Reactor3D\.MIRROR_AT_VIEW_SCALE !== false && scale > 0 && scale < 1 \? scale : 1\)/);
    assert.match(source('reactor_3d.js'), /Reactor3D\.Mirrors\.update\(renderer, scene, camera, mirrors, null, [^\n]+, scale\);/);
    assert.equal(Reactor3D.MIRROR_AT_VIEW_SCALE, true);
});

test('a segment and a rectangle', () => {
    const crosses = Reactor3D.segmentCrossesRect;
    assert.equal(crosses(0, 0, 10, 10, 4, 4, 6, 6), true, 'through the middle');
    assert.equal(crosses(0, 5, 10, 5, 4, 4, 6, 6), true, 'level');
    assert.equal(crosses(5, 0, 5, 10, 4, 4, 6, 6), true, 'upright');
    assert.equal(crosses(5, 5, 5, 5, 4, 4, 6, 6), true, 'a point inside');
    assert.equal(crosses(8, 0, 0, 8, 4, 4, 6, 6), true, 'touching a corner');
    assert.equal(crosses(0, 0, 3, 3, 4, 4, 6, 6), false, 'stopping short');
    assert.equal(crosses(0, 0, 10, 0, 4, 1, 6, 3), false, 'passing beside');
    assert.equal(crosses(0, 0, 0, 10, 4, 4, 6, 6), false, 'upright, beside');
    assert.equal(crosses(7, 0, 0, 7, 4, 4, 6, 6), false, 'cutting the corner off outside it');
    assert.equal(crosses(0, 0, 10, 10, 6, 4, 4, 6), false, 'an empty rectangle is crossed by nothing');
});

/** A scene with a ghost mesh over each of `boxes` ([x0, z0, x1, z1]). */
function ghostScene(boxes) {
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene._pieceGhosts = boxes.map(([x0, z0, x1, z1]) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x0, 0, z0, x1, 0, z0, x1, 5, z1, x0, 5, z1]), 3));
        const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        ghost.visible = true;
        return ghost;
    });
    return scene;
}

test('only the ghost chunks a corridor crosses are drawn; with nobody hidden, none', () => {
    const scene = ghostScene([[0, 0, 16, 16], [16, 0, 32, 16], [32, 0, 48, 16], [0, 32, 16, 48]]);
    const shown = () => scene._pieceGhosts.map(ghost => ghost.visible);
    const eye = { x: 8, y: 12, z: 8 };
    scene.cullCutGhosts(eye, [], 0, 0.6);
    assert.deepEqual(shown(), [false, false, false, false], 'no corridor: the pass draws nothing, so nothing is drawn');
    // One corridor, from the eye in the first chunk to a character in the second.
    scene.cullCutGhosts(eye, [20, 1.5, 8], 1, 0.6);
    assert.deepEqual(shown(), [true, true, false, false]);
    // A second, to a character standing just outside the last chunk's edge: its width reaches in.
    scene.cullCutGhosts(eye, [20, 1.5, 8, 8, 1.5, 31.5], 2, 0.6);
    assert.deepEqual(shown(), [true, true, false, true], 'a chunk within the corridor\'s width of the line is drawn');
    scene.cullCutGhosts(eye, [20, 1.5, 8, 8, 1.5, 31], 2, 0.6);
    assert.deepEqual(shown(), [true, true, false, false], 'and one just past it is not');
    scene.cullCutGhosts(eye, [], 0, 0.6);
    assert.deepEqual(shown(), [false, false, false, false]);
});

test('chunks laid while nobody is hidden are hidden too, and the cut going on or off starts over', () => {
    const scene = ghostScene([[0, 0, 16, 16]]);
    const eye = { x: 8, y: 12, z: 8 };
    scene.cullCutGhosts(eye, [], 0, 0.6);
    // A rock chunk arrives from its worker, shown as `addPieceChunkMesh` leaves it while the cut is on.
    const late = ghostScene([[16, 0, 32, 16]])._pieceGhosts[0];
    scene._pieceGhosts.push(late);
    scene.cullCutGhosts(eye, [], 0, 0.6);
    assert.equal(late.visible, false, 'the next frame hides it');
    // An edit lays the list again as a new array.
    scene._pieceGhosts = scene._pieceGhosts.slice();
    scene._pieceGhosts[0].visible = true;
    scene.cullCutGhosts(eye, [], 0, 0.6);
    assert.equal(scene._pieceGhosts[0].visible, false);
    scene.setCutLook(true);
    assert.ok(scene._pieceGhosts.every(ghost => ghost.visible), 'the cut switched on shows all, as it did');
    scene.cullCutGhosts(eye, [], 0, 0.6);
    assert.ok(scene._pieceGhosts.every(ghost => !ghost.visible), 'and the frame\'s own look hides them again');
});

test('the ghost switch shows every chunk again, and a ghost that cannot be measured stays shown', () => {
    const scene = ghostScene([[0, 0, 16, 16], [64, 64, 80, 80]]);
    const eye = { x: 8, y: 12, z: 8 };
    scene.cullCutGhosts(eye, [], 0, 0.6);
    Reactor3D.CUT_GHOST_CULL = false;
    try {
        scene.cullCutGhosts(eye, [], 0, 0.6);
        assert.ok(scene._pieceGhosts.every(ghost => ghost.visible), 'as before: all shown while the cut is on');
    } finally { Reactor3D.CUT_GHOST_CULL = true; }
    const bare = { visible: false };
    scene._pieceGhosts.push(bare);
    scene.cullCutGhosts(eye, [10, 1.5, 8], 1, 0.6);
    assert.equal(bare.visible, true);
    assert.equal(scene._pieceGhosts[1].visible, false);
    assert.match(source('reactor_3d_lighting.js'), /shared\.rrCutRadius\.value = Reactor3D\.CUTAWAY_RADIUS;\n\s*this\.cullCutGhosts\(eye, foci, count, shared\.rrGhostWidth\.value\);/, 'every frame of the game, from the corridors it has just found');
});

test('a door asks how far each character stands without making anything', () => {
    const doors = source('reactor_3d_doors.js');
    const body = doors.slice(doors.indexOf('const reachOf = (door, character) => {'), doors.indexOf('/** Whether a character faces toward a door\'s middle. */'));
    assert.ok(body.length > 100);
    assert.doesNotMatch(body, /R\.doorAxes\(|R\.doorPoint\(|return \{/, 'no axes record, no point array, no answer object per door and character');
    assert.match(body, /reach\.off = [^\n]+\n\s*reach\.away = Math\.abs\(away\);\n\s*return reach;/);
    assert.match(doors, /const r = reachOf\(door, c\), off = r\.off, away = r\.away;/, 'the shared answer is read at once');
});
