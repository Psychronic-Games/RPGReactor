const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const os = require('node:os');
const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const ModelGraphicPicker = require(path.join(repoRoot, 'editor', 'src', 'event', 'ModelGraphicPicker.js'));
const AssetFiles = require(path.join(repoRoot, 'editor', 'src', 'utils', 'AssetFiles.js'));
const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');

test('a model note is ignored unless it names a file', () => {
    assert.equal(Reactor3D.modelSpecFromNote(''), null);
    assert.equal(Reactor3D.modelSpecFromNote('hello'), null);
    assert.equal(Reactor3D.modelSpecFromNote('<r3d></r3d>'), null);
    assert.equal(Reactor3D.modelSpecFromNote('<r3d>scale(2)</r3d>'), null);
});

test('a model note refuses path traversal', () => {
    assert.equal(Reactor3D.modelSpecFromNote('<r3d>model(../secret)</r3d>'), null);
    assert.equal(Reactor3D.modelSpecFromNote('<r3d>model(a/b)</r3d>'), null);
    assert.equal(Reactor3D.modelSpecFromNote('<r3d:model:..\\x>'), null);
});

test('a model note reads name, size, scale and yaw', () => {
    const spec = Reactor3D.modelSpecFromNote(
        '<r3d>\nmodel(Hero.glb)\nsize(3)\nscale(0.5)\nyaw(90)\n</r3d>'
    );
    assert.equal(spec.name, 'Hero');
    assert.equal(spec.size, 3);
    assert.equal(spec.scale, 0.5);
    assert.equal(spec.yaw, Math.PI / 2);
    assert.equal(Reactor3D.modelUrl(spec.name), '3d/Hero/source/Hero.glb');
});

test('a compact model note also works', () => {
    const spec = Reactor3D.modelSpecFromNote('<r3d:model:Tank>');
    assert.equal(spec.name, 'Tank');
    assert.equal(spec.size, 2);
    assert.equal(spec.scale, 1);
    assert.equal(spec.yaw, 0);
});

test('facing follows the event direction', () => {
    assert.equal(Reactor3D.characterModelYaw({ direction: () => 2 }), 0);
    assert.equal(Reactor3D.characterModelYaw({ direction: () => 6 }), Math.PI / 2);
    assert.equal(Reactor3D.characterModelYaw({ direction: () => 8 }), Math.PI);
    assert.equal(Reactor3D.characterModelYaw({ direction: () => 4 }), -Math.PI / 2);

    const object = {
        rotation: {
            order: '',
            y: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; }
        },
        updateMatrix() {}
    };
    Reactor3D.applyEventModelPose(object, { yaw: 0, pitch: 0, roll: 0 }, 6);
    assert.equal(object.rotation.y, Math.PI / 2);
    assert.equal(Reactor3D.eventModelFaceName(2), 'front');
    assert.equal(Reactor3D.eventModelFaceName(4), 'left');
    assert.equal(Reactor3D.eventModelFaceName(6), 'right');
    assert.equal(Reactor3D.eventModelFaceName(8), 'back');
    assert.equal(Reactor3D.dir8Yaw(1), -Math.PI / 4);
    assert.equal(Reactor3D.dir8Yaw(3), Math.PI / 4);
    assert.equal(Reactor3D.dir8Yaw(7), -3 * Math.PI / 4);
    assert.equal(Reactor3D.dir8Yaw(9), 3 * Math.PI / 4);
    assert.deepEqual(
        Reactor3D.eventModelInterpolatedMark({ front: [0, 0, 1], left: [-1, 0, 0] }, 1),
        [-0.5, 0, 0.5]
    );
});

test('a model footprint occupies every tile it covers', () => {
    const previous = global.$dataMap;
    const character = {
        _x: 5,
        _y: 5,
        _pageIndex: 0,
        event: () => ({ id: 1 }),
        eventId: () => 1,
        direction: () => 2
    };
    global.$dataMap = { reactor3d: { events: { 1: { 0: { name: 'Car', size: 1 } } } } };
    try {
        assert.equal(Reactor3D.eventModelOccupies(character, 5, 5), true);
        assert.equal(Reactor3D.eventModelOccupies(character, 6, 5), false);
        Reactor3D.setEventModelSpec(global.$dataMap, 1, 0, { name: 'Car', size: 2 });
        assert.equal(Reactor3D.eventModelOccupies(character, 4, 5), true);
        assert.equal(Reactor3D.eventModelOccupies(character, 6, 5), true);
        assert.equal(Reactor3D.eventModelOccupies(character, 7, 5), false);
        assert.equal(Reactor3D.eventModelOccupies(character, 5, 4), true);
        assert.equal(Reactor3D.eventModelOccupies(character, 5, 6), true);
    } finally {
        if (previous === undefined) delete global.$dataMap;
        else global.$dataMap = previous;
    }
});

function firstDemoGlb() {
    const root = path.join(repoRoot, 'template', 'Demo', '3d');
    if (!fs.existsSync(root)) return '';
    for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
        if (!folder.isDirectory()) continue;
        const source = path.join(root, folder.name, 'source');
        if (!fs.existsSync(source)) continue;
        const glb = fs.readdirSync(source).find(name => name.toLowerCase().endsWith('.glb'));
        if (glb) return path.join(source, glb);
    }
    return '';
}

test('a shipped Demo model is a real GLB', () => {
    const glbPath = firstDemoGlb();
    if (!glbPath) return;
    const data = fs.readFileSync(glbPath);
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const parsed = Reactor3D.readGlb(copy);
    assert.equal(parsed.json.asset.version, '2.0');
    assert.ok(parsed.json.meshes.length > 0);
    assert.ok(parsed.bin && parsed.bin.length > 0);
});

test('GLB materials are unlit like the rest of the 3D scene', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /buildGlbTemplate[\s\S]*MeshBasicMaterial/);
    assert.match(source, /buildGlbTemplate[\s\S]*__reactorModel = true/);
    assert.match(source, /material\.__reactorModel/);
    assert.match(source, /userData\.baseColor/);
    assert.match(source, /studioEnvMap/);
    assert.match(source, /flattenModelWorld/);
    assert.match(source, /applyRestSkins/);
    assert.match(source, /skinGeometryAtRest/);
    assert.match(source, /reflectivity/);
    assert.doesNotMatch(source, /buildGlbTemplate[\s\S]*MeshStandardMaterial/);
});

test('a character south of a model is in front of it', () => {
    const previous = global.$dataMap;
    const event = {
        _x: 5, _y: 5, _realX: 5, _realY: 5, _pageIndex: 0,
        event: () => ({ id: 1 }), eventId: () => 1, direction: () => 2
    };
    global.$dataMap = { reactor3d: { events: { 1: { 0: { name: 'Car', size: 2 } } } } };
    try {
        const south = { _realX: 5, _realY: 6 };
        const north = { _realX: 5, _realY: 4 };
        const side = { _realX: 8, _realY: 4 };
        assert.equal(Reactor3D.characterIsBehindModel(south, event), false);
        assert.equal(Reactor3D.characterIsBehindModel(north, event), true);
        assert.equal(Reactor3D.characterIsBehindModel(side, event), false);
    } finally {
        if (previous === undefined) delete global.$dataMap;
        else global.$dataMap = previous;
    }
});

test('a model will not turn into the player', () => {
    const previousMap = global.$dataMap;
    const previousPlayer = global.$gamePlayer;
    const event = {
        _x: 5, _y: 5, _realX: 5, _realY: 5, _pageIndex: 0,
        event: () => ({ id: 1 }), eventId: () => 1, direction: () => 2
    };
    global.$dataMap = { reactor3d: { events: { 1: { 0: { name: 'Car', size: 4 } } } } };
    global.$gamePlayer = { _x: 7, _y: 5 };
    const spec = Reactor3D.characterModelSpec(event);
    const key = Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file);
    const previousEntry = Reactor3D._glbCache[key];
    Reactor3D._glbCache[key] = { template: { userData: { glbSize: { x: 1, y: 1, z: 4 } } } };
    try {
        assert.equal(Reactor3D.eventModelCanFace(event, 2), true);
        assert.equal(Reactor3D.eventModelCanFace(event, 6), false);
    } finally {
        if (previousEntry === undefined) delete Reactor3D._glbCache[key];
        else Reactor3D._glbCache[key] = previousEntry;
        if (previousMap === undefined) delete global.$dataMap;
        else global.$dataMap = previousMap;
        if (previousPlayer === undefined) delete global.$gamePlayer;
        else global.$gamePlayer = previousPlayer;
    }
});

test('a modeled event does not collide with its own footprint', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(source, /event !== this && event\.isNormalPriority/);
});

test('sprites hide when a character model is ready', () => {
    assert.match(sprites, /Reactor3D\.hasCharacterModel\(character\)/);
    assert.match(sprites, /syncCharacterModels/);
    assert.match(sprites, /syncCharacterBillboards/);
    assert.match(sprites, /hasEventModels/);
});

test('sidecar event models win over notes', () => {
    const map = {
        reactor3d: {
            events: { 22: { 0: { name: 'Hero', size: 20, yaw: -90 } } }
        }
    };
    const spec = Reactor3D.eventModelSpec(map, 22, 0);
    assert.equal(spec.name, 'Hero');
    assert.equal(spec.size, 20);
    assert.equal(spec.yaw, -Math.PI / 2);

    Reactor3D.setEventModelSpec(map, 22, 0, {
        name: 'Hero', size: 20, yaw: -90,
        faces: { front: [0.1, 0.4, 0.8], left: [-0.5, 0.2, 0] }
    });
    const withFaces = Reactor3D.eventModelSpec(map, 22, 0);
    assert.deepEqual(withFaces.faces.front, [0.1, 0.4, 0.8]);
    assert.deepEqual(withFaces.faces.left, [-0.5, 0.2, 0]);
    assert.equal(withFaces.faces.back, undefined);

    Reactor3D.setEventModelSpec(map, 22, 0, null);
    assert.equal(Reactor3D.hasEventModels(map), false);

    const character = {
        event: () => ({ id: 7, note: '<r3d:model:FromNote>' }),
        eventId: () => 7,
        _pageIndex: 0
    };
    const previous = global.$dataMap;
    global.$dataMap = {
        reactor3d: { events: { 7: { 0: { name: 'FromSidecar', size: 3 } } } }
    };
    try {
        const chosen = Reactor3D.characterModelSpec(character);
        assert.equal(chosen.name, 'FromSidecar');
        assert.equal(chosen.size, 3);
    } finally {
        if (previous === undefined) delete global.$dataMap;
        else global.$dataMap = previous;
    }
});

test('model notes keep a non-GLB extension', () => {
    const spec = Reactor3D.modelSpecFromNote('<r3d>model(crate.obj)</r3d>');
    assert.equal(spec.name, 'crate');
    assert.equal(spec.ext, '.obj');
    assert.equal(Reactor3D.modelUrl(spec.name, spec.ext), '3d/crate/source/crate.obj');
});

test('OBJ, STL and DXF meshes parse into triangles', () => {
    const obj = Reactor3D.readObj(new TextEncoder().encode(
        'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
    ));
    assert.equal(obj.positions.length, 9);
    assert.deepEqual(Array.from(obj.indices), [0, 1, 2]);

    const asciiStl = Reactor3D.readStl(new TextEncoder().encode(
        'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x\n'
    ));
    assert.equal(asciiStl.positions.length, 9);

    const stl = Buffer.alloc(134);
    stl.writeUInt32LE(1, 80);
    stl.writeFloatLE(1, 96);
    stl.writeFloatLE(1, 112);
    const binary = Reactor3D.readStl(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength));
    assert.equal(binary.positions.length, 9);

    const dxf = Reactor3D.readDxf(new TextEncoder().encode(
        '0\n3DFACE\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n12\n0\n22\n1\n32\n0\n0\nENDSEC\n'
    ));
    assert.equal(dxf.positions.length, 9);
});

test('ASCII FBX and USDA meshes parse into triangles', () => {
    const fbx = Reactor3D.readFbxAscii(
        'Vertices: *9 {\n a: 0,0,0,1,0,0,0,1,0\n}\nPolygonVertexIndex: *3 {\n a: 0,1,-3\n}\n'
    );
    assert.equal(fbx.positions.length, 9);

    const usda = Reactor3D.readUsdaMesh(
        'point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]\nint[] faceVertexCounts = [3]\nint[] faceVertexIndices = [0, 1, 2]\n'
    );
    assert.equal(usda.positions.length, 9);
    assert.deepEqual(Array.from(usda.indices), [0, 1, 2]);
});

test('the model picker lists every supported type', () => {
    const picker = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'event', 'ModelGraphicPicker.js'), 'utf8');
    assert.match(picker, /\.fbx/);
    assert.match(picker, /\.obj/);
    assert.match(picker, /\.usdz/);
    assert.match(picker, /\.stl/);
    assert.match(picker, /\.blend/);
    assert.match(picker, /\.3mf/);
    assert.match(picker, /\.dxf/);
    assert.match(picker, /RRPickerIndex\.createBrowser/);
    assert.match(picker, /RotationGizmo3D/);
    assert.match(picker, /_beginPlaceFace/);
    assert.match(picker, /_rebuildFaceMarkers/);
    assert.match(picker, /faceMarker/);
    assert.match(picker, /3d\/.*\/source/);
    assert.doesNotMatch(picker, /model-type-filter/);
    assert.doesNotMatch(picker, /model-picker-clear/);
    assert.deepEqual(Reactor3D.MODEL_EXTS, ['.glb', '.obj', '.fbx', '.stl', '.usdz', '.3mf', '.dxf', '.blend']);
    assert.deepEqual(Reactor3D.modelUrls('Prop', '.glb', 'mesh'), [
        '3d/Prop/source/mesh.glb',
        '3d/source/mesh.glb'
    ]);
});

test('the picker lists folders and uses the file inside source/', () => {
    const previous = global.RRAssetFiles;
    global.RRAssetFiles = AssetFiles;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-models-'));
    try {
        const source = path.join(root, '3d', 'Prop', 'source');
        fs.mkdirSync(source, { recursive: true });
        fs.writeFileSync(path.join(source, 'mesh.glb'), 'glb');
        const listed = ModelGraphicPicker.listModels(root);
        assert.deepEqual(listed, [{ name: 'Prop', file: 'mesh', ext: '.glb', texture: '' }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        if (previous === undefined) delete global.RRAssetFiles;
        else global.RRAssetFiles = previous;
    }
});

test('the event Image section authors models into the sidecar', () => {
    const pageEditor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'event', 'EventPageEditor.js'), 'utf8');
    assert.match(pageEditor, /image-3d-checkbox/);
    assert.match(pageEditor, /ModelGraphicPicker/);
    assert.match(pageEditor, /event\.index.*event\.dir.*event\.pattern/);
    assert.match(pageEditor, /use3d \? tt\('3D Model'\)/);
    assert.match(pageEditor, /applyEventModelPose/);
    assert.match(pageEditor, /image-dir-btn/);
    assert.match(pageEditor, /requestAnimationFrame\(resolve\)/);
    assert.match(pageEditor, /_fitPreviewCanvas/);
    assert.match(pageEditor, /height: 100%/);
    assert.match(pageEditor, /preview:\s*true/);
    const eventEditor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'event', 'EventEditor.js'), 'utf8');
    assert.match(eventEditor, /map\.reactor3d && map\.reactor3d\.events/);
    assert.match(eventEditor, /pendingModelsBaseline/);
    assert.match(eventEditor, /_writePendingModels/);
    const html = fs.readFileSync(path.join(repoRoot, 'editor', 'index.html'), 'utf8');
    assert.match(html, /src\/event\/ModelGraphicPicker\.js/);
});

test('character billboards keep the canvas texture upright', () => {
    // PlaneGeometry's UVs put v=1 at the top of the texture; three's default
    // flipY (true) for canvas uploads is what makes that the image's top.
    // flipY = false is a glTF convention — applied here it rendered every
    // character head-down on maps with event models.
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = core3d.indexOf('syncCharacterBillboards = function');
    assert.ok(at >= 0);
    const body = core3d.slice(at, core3d.indexOf('_clearCharacterBillboards = function', at));
    assert.match(body, /new THREE\.CanvasTexture\(canvas\)/);
    assert.doesNotMatch(body, /texture\.flipY\s*=\s*false/);
});

test('a gliding model still occupies its trailing tiles', () => {
    // _x/_y sit on the destination tile the moment a step begins; the body is
    // still back at _realX/_realY. Without the union, a character could walk
    // into the middle of a long vehicle from behind mid-step.
    const character = { _x: 25, _y: 32, _realX: 24, _realY: 32 };
    const foot = { halfX: 4.5, halfZ: 1.65 };
    assert.ok(Reactor3D.eventModelContains(character, foot, 20, 32), 'trailing tile stays covered');
    assert.ok(Reactor3D.eventModelContains(character, foot, 29, 32), 'leading tile is covered');
    assert.ok(!Reactor3D.eventModelContains(character, foot, 19, 32), 'beyond the trailing body is free');
});

test('a moving step tests the footprint in both orientations', () => {
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = core3d.indexOf('Reactor3D.eventModelWouldOverlap = function(character, x, y, other, direction)');
    assert.ok(at >= 0, 'wouldOverlap accepts the movement direction');
    const body = core3d.slice(at, core3d.indexOf('\n};', at));
    assert.match(body, /eventModelWorldYaw\(character, spec, direction\)/,
        'the implied facing joins the yaw list, at the mesh world yaw');
    assert.ok(core3d.includes('Reactor3D.eventModelWouldOverlapEvents = function'),
        'model events collide footprint-wide with other events');

    const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(objects, /eventModelWouldOverlapEvents\(this, x, y, this\._reactorMoveDirection\(x, y\)\)/,
        'event-vs-event collision goes through the footprint');
    assert.match(objects, /eventModelWouldOverlap\(this, x, y, \$gamePlayer, this\._reactorMoveDirection\(x, y\)\)/,
        'event-vs-player collision passes the movement direction');
});

test('the rendered model turns at a paced rate instead of pivoting in one frame', () => {
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(core3d, /Reactor3D\.MODEL_TURN_SPEED = /);
    const at = core3d.indexOf('syncCharacterModels = function');
    const body = core3d.slice(at, core3d.indexOf('syncCharacterBillboards = function', at));
    assert.match(body, /holder\.smoothYaw/, 'yaw is eased per holder');
    assert.match(body, /Math\.atan2\(\s*Math\.sin\(targetYaw - holder\.smoothYaw\),/,
        'the swing takes the shortest arc');
});

test('billboards depth-test as if standing upright at their anchor', () => {
    // The lean is a drawing device; depth-testing the leaned geometry buried
    // a sprite's head in the mesh behind it. Depth comes from a vertical twin
    // of each vertex, so in-front/behind settles per pixel by ground row.
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(core3d, /Reactor3D\.straightenBillboardDepth = function/);
    const chars = core3d.indexOf('syncCharacterBillboards = function');
    const charBody = core3d.slice(chars, core3d.indexOf('_updateCharacterBillboard = function', chars));
    assert.match(charBody, /straightenBillboardDepth\(material\)/,
        'character billboards route through the depth straightener');
    const mat = core3d.indexOf('Reactor3D.billboardMaterial = function');
    const matBody = core3d.slice(mat, core3d.indexOf('\n};', core3d.indexOf('onBeforeCompile', mat)));
    assert.match(matBody, /rrVerticalPos/, 'tile cut-outs build the vertical twin');
    assert.match(matBody, /#include <project_vertex>/, 'and override depth after projection');
});

test('a turning model must clear the disc its corners sweep', () => {
    const previousMap = global.$dataMap;
    const previousGraphics = global.Graphics;
    const event = {
        _x: 5, _y: 5, _realX: 5, _realY: 5, _pageIndex: 0,
        event: () => ({ id: 1 }), eventId: () => 1, direction: () => 6
    };
    global.$dataMap = { reactor3d: { events: { 1: { 0: { name: 'Car', size: 4 } } } } };
    const spec = Reactor3D.characterModelSpec(event);
    const key = Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file);
    const previousEntry = Reactor3D._glbCache[key];
    Reactor3D._glbCache[key] = { template: { userData: { glbSize: { x: 1, y: 1, z: 4 } } } };
    try {
        // halfX 0.5, halfZ 2 -> corner radius ~2.06, sweep blocks r < 2.56.
        assert.equal(Number(Reactor3D.eventModelSweepRadius(event, spec).toFixed(2)), 2.06);

        // (6,6) is outside BOTH end rectangles of an east<->south turn but
        // inside the sweep arc — the exact blind spot a bystander stood in.
        const bystander = { _x: 6, _y: 6 };
        assert.equal(Reactor3D.eventModelWouldOverlap(event, 5, 5, bystander), false,
            'not overlapped while the car holds its facing');
        assert.equal(Reactor3D.eventModelWouldOverlap(event, 5, 5, bystander, 2), true,
            'a turning step sweeps the diagonal');
        assert.equal(Reactor3D.eventModelWouldOverlap(event, 5, 5, bystander, 8), true,
            'in either swing direction');
        const far = { _x: 9, _y: 9 };
        assert.equal(Reactor3D.eventModelWouldOverlap(event, 5, 5, far, 2), false,
            'outside the sweep the turn is free');

        // While the mesh is still easing, the footprint covers the arc, so a
        // character cannot step into the swing; it frees once settled.
        global.Graphics = { frameCount: 100 };
        event._reactorTurnStamp = 98;
        assert.equal(Reactor3D.eventModelOccupies(event, 6, 6), true, 'mid-swing blocked');
        event._reactorTurnStamp = 100 - Reactor3D.MODEL_TURN_SWEEP_FRAMES - 1;
        assert.equal(Reactor3D.eventModelOccupies(event, 6, 6), false, 'settled swing frees');
    } finally {
        Reactor3D._glbCache[key] = previousEntry;
        if (previousMap === undefined) delete global.$dataMap;
        else global.$dataMap = previousMap;
        if (previousGraphics === undefined) delete global.Graphics;
        else global.Graphics = previousGraphics;
    }
});

test('an above-characters event billboard rides the above pass', () => {
    // MZ's priority 2 is z=5 — over characters and over the star tiles. In a
    // 3D scene with event models the character billboards live inside the
    // world's depth, so the console screen an author placed over a machine
    // was buried inside it.
    assert.equal(Reactor3D.mapHasAboveEvents({ events: [null, {
        pages: [{ priorityType: 1 }, { priorityType: 2 }]
    }] }), true, 'any page set Above characters counts');
    assert.equal(Reactor3D.mapHasAboveEvents({ events: [{ pages: [{ priorityType: 1 }] }] }), false);
    assert.equal(Reactor3D.mapHasAboveEvents(null), false);

    // setPass keeps models to the ground pass and above-billboards to the
    // above pass; untoggled, billboards re-rendered over the star tiles.
    const stub = {
        _belowGroup: { visible: true }, _aboveGroup: { visible: true },
        _modelsGroup: { visible: true }, _aboveBillboardsGroup: { visible: true },
        _lightGroup: { visible: true }
    };
    Reactor3D.MapScene.prototype.setPass.call(stub, 'above');
    assert.equal(stub._modelsGroup.visible, false);
    assert.equal(stub._aboveBillboardsGroup.visible, true);
    Reactor3D.MapScene.prototype.setPass.call(stub, 'below');
    assert.equal(stub._modelsGroup.visible, true);
    assert.equal(stub._aboveBillboardsGroup.visible, false);
    Reactor3D.MapScene.prototype.setPass.call(stub, 'all');
    assert.equal(stub._modelsGroup.visible, true);
    assert.equal(stub._aboveBillboardsGroup.visible, true);

    // On a model map the star tiles join the characters under one depth
    // buffer ("world") and the upper texture carries only the event overlay
    // ("overlay") — split passes would stamp a structure's top flat over a
    // character standing in front of it.
    Reactor3D.MapScene.prototype.setPass.call(stub, 'world');
    assert.equal(stub._belowGroup.visible, true);
    assert.equal(stub._aboveGroup.visible, true);
    assert.equal(stub._modelsGroup.visible, true);
    assert.equal(stub._aboveBillboardsGroup.visible, false);
    Reactor3D.MapScene.prototype.setPass.call(stub, 'overlay');
    assert.equal(stub._belowGroup.visible, false);
    assert.equal(stub._aboveGroup.visible, false);
    assert.equal(stub._modelsGroup.visible, false);
    assert.equal(stub._aboveBillboardsGroup.visible, true);

    // The tail wrapper that re-clamped models to below/all silently overrode
    // every pass the base method learned — the world pass rendered an empty
    // models group and every character and vehicle vanished.
    const core3dTail = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.doesNotMatch(core3dTail, /_reactorSetPassModels/,
        'setPass owns model visibility itself');
    assert.match(sprites, /modelsInWorld \? "world" : \(split \? "below" : "all"\)/,
        'the sprite pass picker uses world on model maps');

    // Billboards live in the world's depth: a stationary event on a facade
    // cell snaps to that wall's plane (whatever its priority) and is pulled
    // just ahead of the coplanar wall quads — over its pedestal, never over
    // a genuinely nearer character.
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const update = core3d.slice(core3d.indexOf('_updateCharacterBillboard = function'),
        core3d.indexOf('_clearCharacterBillboards = function'));
    assert.match(update, /typeof character\.eventId === "function"/,
        'events snap; the player and followers stay on the ground');
    assert.match(update, /character\.isMoving && character\.isMoving\(\)/,
        'and nothing snaps mid-step');
    assert.match(update, /snapped \|\| character\._priorityType === 2/,
        'the coplanar pull follows the snap or the authored priority');
    assert.match(update, /polygonOffsetFactor = biased \? -4 : 0/);
    // A walking character ON a facade's footprint wins against that wall:
    // their depth is pushed just in front of its plane while their drawn
    // position stays put — pressed against a console or crossing a
    // machine's apron rows, they stay visible.
    assert.match(update, /rrDepthShiftX/);
    assert.match(update, /aheadZ - baseZ/);
    assert.match(sprites, /mapHasAboveEvents/, 'the above pass exists for such maps');
});

test('character billboards take the same footward step as tile cut-outs', () => {
    // Tile cut-outs plant their base half a cell towards the camera; a
    // billboard anchored at plain tile centre drifted off the tile art it
    // was authored over as the camera crossed the map, and only agreed at
    // dead centre — a console screen event slid off its tile-drawn pedestal.
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = core3d.indexOf('_updateCharacterBillboard = function');
    const body = core3d.slice(at, core3d.indexOf('_clearCharacterBillboards = function', at));
    assert.match(body, /camera\.matrixWorld/);
    assert.match(body, /\* 0\.5;/, 'half a cell, matching the shader footward');
    assert.match(body, /_realX \+ 0\.5 \+ footX/, 'applied to the anchor');
    assert.match(body, /_realY \+ 0\.5 \+ footZ/);
    // A decoration whose cell was stood into a facade anchors on that wall's
    // plane, lifted along the same leaning axis the wall's quads use — the
    // registry the builder records for exactly this (facadeAt).
    assert.match(body, /Reactor3D\.facadeAt\(/);
    assert.match(body, /facade\.z \+ footZ/);
    assert.match(body, /up\.(x|y|z) \* facade\.lift/);
});

test('an angled model collides as its rotated rectangle, not its box', () => {
    // At 45 degrees a nine-tile car's axis-aligned box balloons to near
    // square and a character was stopped tiles away from the visible body.
    const previousMap = global.$dataMap;
    const event = {
        _x: 5, _y: 5, _realX: 5, _realY: 5, _pageIndex: 0,
        event: () => ({ id: 1 }), eventId: () => 1, direction: () => 2,
        _reactorDir8: 3
    };
    global.$dataMap = { reactor3d: { events: { 1: { 0: { name: 'Car', size: 4 } } } } };
    const spec = Reactor3D.characterModelSpec(event);
    const key = Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file);
    const previousEntry = Reactor3D._glbCache[key];
    Reactor3D._glbCache[key] = { template: { userData: { glbSize: { x: 1, y: 1, z: 4 } } } };
    try {
        const foot = Reactor3D.eventModelFootprint(event, spec);
        assert.equal(Number(foot.yaw.toFixed(4)), Number((Math.PI / 4).toFixed(4)));
        // Along the diagonal body: inside.
        assert.equal(Reactor3D.eventModelContains(event, foot, 6, 6), true);
        assert.equal(Reactor3D.eventModelContains(event, foot, 4, 4), true);
        // At the axis-aligned box's corner, off the rotated body: outside.
        assert.equal(Reactor3D.eventModelContains(event, foot, 7, 5), false);
        assert.equal(Reactor3D.eventModelContains(event, foot, 5, 8), false);
        // A plain box still tests as a box (older callers and stubs).
        assert.equal(Reactor3D.eventModelContains(event, { halfX: 2, halfZ: 2 }, 7, 5), true);
    } finally {
        Reactor3D._glbCache[key] = previousEntry;
        if (previousMap === undefined) delete global.$dataMap;
        else global.$dataMap = previousMap;
    }
});

test('collision follows the mesh world yaw, not the facing alone', () => {
    // A model posed with an authored yaw in the picker (the Demo motorcycle
    // carries ~163 degrees) stands at spec-yaw-plus-front-aim, and rotating
    // the collision by the facing alone left it crosswise to the visible
    // body — a character clipped into the metal from one side and was
    // stopped short of it from another.
    const previousMap = global.$dataMap;
    const event = {
        _x: 5, _y: 5, _realX: 5, _realY: 5, _pageIndex: 0,
        event: () => ({ id: 1 }), eventId: () => 1, direction: () => 2
    };
    // Front mark on local -X, like a bike modelled lying along X.
    global.$dataMap = { reactor3d: { events: { 1: { 0: {
        name: 'Bike', size: 4, yaw: 0, faces: { front: [-1, 0, 0] }
    } } } } };
    const spec = Reactor3D.characterModelSpec(event);
    const key = Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file);
    const previousEntry = Reactor3D._glbCache[key];
    Reactor3D._glbCache[key] = { template: { userData: { glbSize: { x: 4, y: 1, z: 1 } } } };
    try {
        // Facing down (+Z): the front aim turns local -X onto +Z, i.e. a
        // +90-degree world yaw — the long local-X axis ends up north-south.
        const yaw = Reactor3D.eventModelWorldYaw(event, spec, 2);
        assert.equal(Number(Math.abs(yaw).toFixed(4)), Number((Math.PI / 2).toFixed(4)));
        const foot = Reactor3D.eventModelFootprint(event, spec);
        assert.equal(Reactor3D.eventModelContains(event, foot, 5, 7), true,
            'long axis lies north-south, as the mesh does');
        assert.equal(Reactor3D.eventModelContains(event, foot, 7, 5), false,
            'and not east-west, as facing-only rotation had it');
        // Without a front mark the facing plus authored yaw is all there is.
        delete spec.faces;
        assert.equal(Reactor3D.eventModelWorldYaw(event, spec, 2), 0);
    } finally {
        Reactor3D._glbCache[key] = previousEntry;
        if (previousMap === undefined) delete global.$dataMap;
        else global.$dataMap = previousMap;
    }
});

test('a model file keeps whatever extension case it shipped with', () => {
    // Exporters write Plant_001.OBJ; the lowercase-only listing rule (right
    // for runtime-reconstructed .png/.ogg URLs) hid the file entirely, and
    // the picker reported the folder as empty. Model files are addressed by
    // the exact name the sidecar records, so the case is kept.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-obj-case-'));
    try {
        fs.mkdirSync(path.join(root, '3d', 'monster-plant', 'source'), { recursive: true });
        fs.writeFileSync(path.join(root, '3d', 'monster-plant', 'source', 'Plant_001.OBJ'), 'o');
        const models = ModelGraphicPicker.listModels(root);
        assert.equal(models.length, 1);
        assert.equal(models[0].name, 'monster-plant');
        assert.equal(models[0].file, 'Plant_001');
        assert.equal(models[0].ext, '.OBJ', 'the sidecar records the real extension');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }

    // And a note-based spec with no extension probes upper-case variants too.
    const core3d = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = core3d.indexOf('Reactor3D.loadModel = function');
    const body = core3d.slice(at, core3d.indexOf('\n};', at));
    assert.match(body, /next\.toUpperCase\(\)/);
});

test('an OBJ with texture coordinates keeps them, and the spec its texture', () => {
    // v/vt corners weld per unique pair so the geometry carries one uv
    // attribute; the picker names a colour map from textures/ (preferring
    // the colour pass over normal/emissive companions) and the sidecar
    // carries it to the runtime, extension case intact.
    const obj = [
        'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0',
        'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1',
        'f 1/1 2/2 3/3 4/4'
    ].join('\n');
    const bytes = Buffer.from(obj);
    const mesh = Reactor3D.readObj(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(mesh.positions.length / 3, 4);
    assert.equal(mesh.uvs.length / 2, 4);
    assert.equal(mesh.indices.length, 6, 'the quad fans into two triangles');
    assert.deepEqual([...mesh.uvs.slice(4, 6)], [1, 1]);

    const previousAssets = global.RRAssetFiles;
    global.RRAssetFiles = AssetFiles;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-obj-tex-'));
    try {
        fs.mkdirSync(path.join(root, '3d', 'plant', 'source'), { recursive: true });
        fs.mkdirSync(path.join(root, '3d', 'plant', 'textures'), { recursive: true });
        fs.writeFileSync(path.join(root, '3d', 'plant', 'source', 'Plant_001.OBJ'), obj);
        fs.writeFileSync(path.join(root, '3d', 'plant', 'textures', 'PLANT_NM_002.png'), 'n');
        fs.writeFileSync(path.join(root, '3d', 'plant', 'textures', 'PLANT_CLR_002.jpg'), 'c');
        const model = ModelGraphicPicker.listModels(root)[0];
        assert.equal(model.texture, 'PLANT_CLR_002.jpg', 'the colour pass wins');
        assert.equal(ModelGraphicPicker.colorTextureIn(
            path.join(root, '3d', 'plant', 'textures')), 'PLANT_CLR_002.jpg');

        // The event editor's preview hands the texture through too, falling
        // back to the folder-derived choice for specs saved before the
        // sidecar carried one.
        const pageEditor = fs.readFileSync(
            path.join(repoRoot, 'editor', 'src', 'event', 'EventPageEditor.js'), 'utf8');
        assert.match(pageEditor, /readModel\(buffer, model\.ext \|\| '\.glb', baseUrl, texture\)/);
        assert.match(pageEditor, /ModelGraphicPicker\.colorTextureIn/);

        const mapData = { reactor3d: { events: {} } };
        Reactor3D.setEventModelSpec(mapData, 7, 0,
            { name: 'plant', file: 'Plant_001', ext: '.OBJ', texture: model.texture, size: 2 });
        const written = mapData.reactor3d.events['7']['0'];
        assert.equal(written.ext, '.OBJ', 'extension case survives the sidecar');
        assert.equal(written.texture, 'PLANT_CLR_002.jpg');
        const read = Reactor3D.eventModelSpec(mapData, 7, 0);
        assert.equal(read.ext, '.OBJ');
        assert.equal(read.texture, 'PLANT_CLR_002.jpg');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        if (previousAssets === undefined) delete global.RRAssetFiles;
        else global.RRAssetFiles = previousAssets;
    }
});

test('looking around the model picker never edits the pose', () => {
    // Plain drag used to rotate the MODEL about camera axes — inspecting a
    // model quietly baked pitch/roll into the spec and it stood crooked in
    // game, which read as the face dots being angle-dependent. Left-drag
    // orbits now; posing is deliberate (right- or Ctrl-drag), and Upright /
    // Reset rescue a drifted pose.
    const source = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'event', 'ModelGraphicPicker.js'), 'utf8');
    assert.match(source, /orbit = !ringGrab && !\(e\.button === 2 \|\| e\.ctrlKey \|\| e\.metaKey\)/);
    assert.match(source, /model-angle-level/);
    assert.match(source, /model-angle-reset/);
    assert.match(source, /setAngles\(0, this\.selectedYaw, 0\)/, 'Upright keeps the turn');
    assert.match(source, /setAngles\(0, 0, 0\)/, 'Reset clears everything');
});

test('the picker poses through rings around the model', () => {
    // Free-drag posing about camera axes bled every drag into all three
    // angles at once. The pose controls are rings wrapped around the model
    // now: grab a ring and the model follows the pointer around that one
    // axis, the other two untouched. The rings nest like a gimbal so each
    // always matches the axis it changes, and the arc passing behind the
    // model hides behind it with a faint depth-free twin keeping the circle
    // traceable.
    const source = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'event', 'ModelGraphicPicker.js'), 'utf8');
    assert.match(source, /_buildPoseRings\(\)/);
    assert.match(source, /ringGrab = this\._pickPoseRing\(e\)/, 'pointer down grabs a ring');
    // A grab lands on the line the eye sees: rings are picked by screen
    // distance to the drawn circle, tie-broken at crossings by which ring
    // is drawn on top. Ray-depth picking through fat invisible tubes sent
    // a third of direct clicks to a ring visibly away from the pointer.
    assert.match(source, /Math\.hypot\(sx - event\.clientX, sy - event\.clientY\)/);
    assert.match(source, /b\.camDist < a\.camDist/, 'crossings prefer the ring on top');
    assert.doesNotMatch(source, /poseAxis/, 'no grab tubes to raycast');
    // An armed Front/Back/Left/Right takes total priority: the dot lands
    // the moment the button goes DOWN, on the pressed pixel — no drift
    // window for the orbit to steal. A click-on-release gate kept losing
    // to human hand wobble, which read as the rings interfering.
    assert.match(source, /if \(this\._placingFace && e\.button === 0 && !e\.ctrlKey && !e\.metaKey\) \{\s*\n\s*this\._placeFaceAt\(e\)/);
    // A drag that slips past the modal edge "clicks" the backdrop (click
    // targets the common ancestor of press and release) and cancelled the
    // whole picker, dots and all. Closing needs press AND release there.
    assert.match(source, /if \(e\.target === modal && backdropPressed\) this\._close\(\)/);
    // The overlay strip floats over the scene: its transparent flex gaps
    // must not eat clicks, and the gizmo ball — which reads as a ring
    // control — yields entirely while a side is armed, so a dot click on
    // it lands in the scene. Unarmed, the gizmo works as before.
    assert.match(source, /flex-wrap:wrap;pointer-events:none;/);
    assert.match(source, /gizmoCanvas\.style\.pointerEvents = this\._placingFace \? 'none' : 'auto'/);
    // A near miss still lands: sparse meshes let the ray slip between
    // triangles at spots the eye reads as on the model, and swallowing the
    // click kept the mode armed with the rings away — placement looked
    // refused. The ray's entry into the model's bounds stands in.
    assert.match(source, /raycaster\.ray\.intersectBox\(bounds, new THREE\.Vector3\(\)\)/);
    // And a click past the bounds entirely — out where the rings circle —
    // still means "this side": the ray's nearest approach to the model
    // gives the direction, clamped onto the bounds surface. An armed
    // canvas click is never swallowed.
    assert.match(source, /closestPointToPoint\(centre, new THREE\.Vector3\(\)\)/);
    assert.match(source, /bounds\.clampPoint\(point, point\)/);
    assert.match(source, /this\._dragPoseRing\(e, ringGrab\)/, 'drag follows the grabbed ring');
    // The turn is the signed pointer angle about the ring's own plane, so
    // exactly one euler moves per drag.
    assert.match(source, /crossVectors\(grab\.startVec, vec\)/);
    assert.match(source, /grab\.axis === 'yaw'/);
    // Gimbal nesting: the pitch ring follows the turn, roll follows both.
    assert.match(source, /this\._rings\.pitch\.group\.rotation\.set\(0, yaw, 0\)/);
    assert.match(source, /this\._rings\.roll\.group\.rotation\.set\(pitch, yaw, 0\)/);
    // Depth honesty: the solid pass depth-tests (no depthTest:false on it);
    // only the faint ghost renders through the model.
    assert.match(source, /opacity: 0\.05,\s*\n\s*depthTest: false, depthWrite: false/);
    // The rings whisper until touched — hover brightens one, holding it
    // drops the others — and they leave entirely while a face dot is being
    // placed, whose markers share the same palette.
    assert.match(source, /_emphasizePoseRing\(over \? over\.axis : '', false\)/);
    assert.match(source, /_emphasizePoseRing\(ringGrab\.axis, true\)/);
    assert.match(source, /this\._rings\.root\.visible = !this\._placingFace/);
    // The rings die with the preview.
    assert.match(source, /_disposePreview\(\) \{\s*\n\s*this\._disposePoseRings\(\)/);
    // Turntable fallback for Ctrl/right drags: one axis per gesture, never
    // camera-axis tumble.
    assert.match(source, /this\.selectedYaw = this\._wrapAngle\(this\.selectedYaw \+ dx \* 0\.5\)/);
    assert.doesNotMatch(source, /premultiply/, 'no camera-axis quaternion posing');
});

test('model animation rules normalise and load from the sidecar shape', () => {
    const rules = Reactor3D.readModelAnimationRules({
        animations: [
            { name: 'wheels', part: 'DEF-Wheel', type: 'spin', axis: 'x', trigger: 'moving', perTile: 360 },
            { part: 'V_004', type: 'swing', axis: 'x', trigger: 'action', degrees: 25, period: 30, cycles: 3 },
            { type: 'bob', trigger: 'idle', amount: 0.05, period: 90 },
            { type: 'nonsense', axis: 'w', trigger: 'sometimes' }
        ]
    });
    assert.equal(rules.length, 4);
    assert.deepEqual(
        rules.map(rule => [rule.type, rule.axis, rule.trigger]),
        [['spin', 'x', 'moving'], ['swing', 'x', 'action'], ['bob', 'y', 'idle'], ['spin', 'y', 'always']]
    );
    assert.equal(rules[0].perTile, 360);
    assert.equal(rules[1].name, 'V_004', 'a nameless rule answers to its part');
    assert.equal(Reactor3D.modelRuleDuration(rules[1]), 90, 'cycles times period');
    assert.equal(rules[2].part, '', 'no part means the whole model');
    assert.equal(Reactor3D.modelAnimationUrl('monster-plant'), '3d/monster-plant/model.json');
    assert.equal(Reactor3D.readModelAnimationRules(null).length, 0);
});

test('an OBJ with named groups splits into parts with pivots', () => {
    const obj = [
        'g body',
        'v 0 0 0', 'v 1 0 0', 'v 0 1 0',
        'f 1 2 3',
        'g jaw',
        'v 4 0 0', 'v 6 0 0', 'v 4 2 0',
        'f 4 5 6'
    ].join('\n');
    const mesh = Reactor3D.readObj(new TextEncoder().encode(obj).buffer);
    assert.ok(mesh.groups, 'two named groups split the mesh');
    assert.deepEqual(mesh.groups.map(run => run.name), ['body', 'jaw']);

    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const template = Reactor3D.buildMeshTemplate(mesh, '', '');
    const jaw = template.children.find(child => child.name === 'jaw');
    assert.ok(jaw, 'the jaw is its own mesh');
    assert.equal(jaw.userData.parts.length, 1);
    // Pivot is the group's own centre, in geometry space.
    assert.deepEqual(jaw.userData.parts[0].pivot, [5, 1, 0]);
});

test('animation rules turn a part about its pivot and reset when inactive', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const object = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([4, 0, 0, 6, 0, 0, 5, 1, 0]), 3));
    const wheel = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    wheel.name = 'wheel';
    wheel.userData.parts = [{ name: 'DEF-Wheel.01', pivot: [5, 0, 0] }];
    object.add(wheel);

    const binding = Reactor3D.prepareModelInstance(object);
    assert.equal(binding.root.name, 'anim-root');
    assert.equal(binding.meshes.length, 1);

    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'wheels', part: 'DEF-Wheel', type: 'spin', axis: 'z', trigger: 'moving', perTile: 90 },
        { name: 'sway', part: '', type: 'swing', axis: 'z', trigger: 'idle', degrees: 30, period: 60 }
    ] });

    // One tile of travel at 90 deg/tile: a quarter turn about the axle at
    // x=5, so the mesh origin swings to put the pivot back in place.
    Reactor3D.applyModelAnimation(binding, rules, { frame: 10, moving: true, distance: 1, scale: 1, action: null });
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    assert.ok(wheel.quaternion.angleTo(quarter) < 1e-6, 'quarter turn about z');
    const pivotNow = new THREE.Vector3(5, 0, 0).applyQuaternion(wheel.quaternion).add(wheel.position);
    assert.ok(pivotNow.distanceTo(new THREE.Vector3(5, 0, 0)) < 1e-6, 'the axle stays put');
    assert.equal(binding.root.quaternion.w, 1, 'idle sway is off while moving');

    // Standing still: the wheel resets to rest, the whole model sways.
    Reactor3D.applyModelAnimation(binding, rules, { frame: 15, moving: false, distance: 0, scale: 1, action: null });
    assert.ok(wheel.quaternion.angleTo(quarter) < 1e-6, 'a stopped wheel keeps its angle');
    assert.ok(Math.abs(binding.root.quaternion.z) > 0.01, 'the whole model sways at rest');

    // Actions play by name for period*cycles frames, then stop.
    const bite = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'bite', part: 'DEF-Wheel', type: 'swing', axis: 'x', trigger: 'action', degrees: 20, period: 20, cycles: 2 }
    ] });
    Reactor3D.applyModelAnimation(binding, bite, { frame: 105, moving: false, distance: 0, scale: 1, action: { name: 'bite', frame: 100 } });
    assert.ok(wheel.quaternion.angleTo(new THREE.Quaternion()) > 0.01, 'the bite is playing');
    Reactor3D.applyModelAnimation(binding, bite, { frame: 150, moving: false, distance: 0, scale: 1, action: { name: 'bite', frame: 100 } });
    assert.ok(wheel.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'past its duration the bite has let go');
});

test('the sync loop binds instances, loads rules, and plays queued actions', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /current\.binding = Reactor3D\.prepareModelInstance\(object, object\.__reactorClips\)/);
    // Embedded clips: an animated GLB keeps its hierarchy (no flatten),
    // skinned meshes ride a real Skeleton on the GPU, instances rebind to
    // their own cloned bones, and "clip" rules play clips by name through
    // the same trigger system.
    assert.match(source, /buildAnimatedGlbTemplate/);
    assert.match(source, /new THREE\.SkinnedMesh\(geometry, child\.material\)/);
    assert.match(source, /skinned\.bind\(skeleton, node\.matrixWorld\.clone\(\)\)/);
    assert.match(source, /Reactor3D\.cloneModelTemplate = function/);
    assert.match(source, /const object = Reactor3D\.cloneModelTemplate\(template\)/, 'instances clone through the rebinder');
    assert.match(source, /new THREE\.AnimationMixer\(inner\)/);
    assert.match(source, /rule\.type === "clip"/);
    assert.match(source, /Reactor3D\.loadModelAnimations\(spec\.name\)\.then/);
    assert.match(source, /Reactor3D\.applyModelAnimation\(holder\.binding, holder\.rules/);
    // Part ancestry is stamped BEFORE the flatten bakes the hierarchy away.
    assert.ok(source.indexOf('child.userData.parts = chain') < source.indexOf('this.flattenModelWorld(root);'),
        'ancestry recorded before flattening');
    // The plugin command answers the Play Model Animation event command and
    // is a silent no-op on a stock MZ runtime.
    assert.match(source, /PluginManager\.registerCommand\("RPGReactor", "PlayModelAnimation"/);
    assert.equal(Reactor3D.modelInstanceKey({ eventId: () => 7 }), 'e7');
    assert.equal(Reactor3D.modelInstanceKey({}), 'p');
});

test('the event editor round-trip keeps the model texture', () => {
    // Opening an event rebuilds its model spec into pendingModels and OK
    // writes them back; the rebuild dropped `texture`, so editing anything
    // about an event — movement, a switch — silently stripped its model's
    // colour map and it stood gray in game.
    const source = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'event', 'EventEditor.js'), 'utf8');
    const carried = source.match(/texture: spec\.texture \|\| ''/g) || [];
    assert.equal(carried.length, 2, 'both stored-spec branches carry texture');
});

test('embedded clips build, clone, and play motion through clip rules', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // A minimal glTF: one triangle on a node, one clip turning it 90
    // degrees about Y over one second.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const times = new Float32Array([0, 1]);
    const rotations = new Float32Array([0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    const bin = new Uint8Array(positions.byteLength + times.byteLength + rotations.byteLength);
    bin.set(new Uint8Array(positions.buffer), 0);
    bin.set(new Uint8Array(times.buffer), positions.byteLength);
    bin.set(new Uint8Array(rotations.buffer), positions.byteLength + times.byteLength);
    const json = {
        asset: { version: '2.0' },
        buffers: [{ byteLength: bin.byteLength }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
            { buffer: 0, byteOffset: positions.byteLength, byteLength: times.byteLength },
            { buffer: 0, byteOffset: positions.byteLength + times.byteLength, byteLength: rotations.byteLength }
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
            { bufferView: 2, componentType: 5126, count: 2, type: 'VEC4' }
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ name: 'spinner', mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
        animations: [{
            name: 'turn',
            channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
            samplers: [{ input: 1, output: 2 }]
        }]
    };
    const template = Reactor3D.buildGlbTemplate(json, bin, '');
    assert.equal(template.userData.animated, true, 'a clip-bearing GLB keeps its hierarchy');
    assert.equal(template.__reactorClips.length, 1);
    assert.equal(template.__reactorClips[0].name, 'turn');

    const clone = Reactor3D.cloneModelTemplate(template);
    assert.equal(clone.__reactorClips, template.__reactorClips, 'clips ride along to instances');
    const binding = Reactor3D.prepareModelInstance(clone, clone.__reactorClips);
    assert.ok(binding.mixer, 'clips get a mixer');
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'idle-turn', type: 'clip', clip: 'turn', trigger: 'always' }
    ] });
    assert.equal(Reactor3D.modelRuleDuration(rules[0], binding.clips), 60, 'clip rules last the clip length');

    let spinner = null;
    binding.root.traverse(node => { if (!spinner && node.name === 'spinner') spinner = node; });
    const start = spinner.quaternion.clone();
    for (let frame = 0; frame < 30; frame++) {
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, distance: 0, scale: 1, action: null });
    }
    const angle = spinner.quaternion.angleTo(start) * 180 / Math.PI;
    assert.ok(angle > 20 && angle < 70, 'half a second into the clip the node has visibly turned: ' + angle.toFixed(1));
});
