// Database > Structures: the floor plan shows what the 3D view shows, materials
// are picked per role, and a roof may be one slope (a slanted roof).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');
const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
const F = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructureFloors.js'));
const demoPlan = name => JSON.parse(read(`template/Demo/3d/Structures/${name}.json`));

function loadThree() {
    global.self = global; global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    return global.THREE;
}

function loadEditor() {
    const context = {
        console, window: {}, document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
        require, setTimeout, clearTimeout, module: { exports: {} }, rrEscapeHtml: text => String(text)
    };
    context.window = context;
    context.Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    context.RRStructurePlan = context.RRStructurePlan || context.module.exports;
    vm.runInNewContext(read('editor/src/utils/StructureFloors.js'), context);
    vm.runInNewContext(read('editor/src/database/DatabaseStructureEditor.js') + '\n;globalThis.DatabaseStructureEditor = DatabaseStructureEditor;', context);
    return context;
}

/** A page with a structure open, its drawing switched off. */
function openEditor(raw, resolve = () => null) {
    const context = loadEditor();
    const E = context.DatabaseStructureEditor;
    const editor = new E(null, { getCurrentProject: () => null }, null, null);
    for (const name of ['renderInspector', 'renderMore', 'renderTools', 'renderBar', 'renderSide', 'renderFloorTabs', 'schedulePreview', 'render', 'drawPaint', 'requestPlanRedraw']) editor[name] = () => {};
    editor._detail = null;
    editor.parentEditor = { _markDatabaseMutation() {}, refreshDatabaseListLabel() {} };
    editor.materials = () => ['Stone', 'Wood', 'Plaster', 'RoofTile', 'Timber', 'Thatch'];
    editor.resolve = name => { const plan = resolve(name); return plan ? E.normalizePlan(plan) : null; };
    const plan = E.normalizePlan(raw);
    editor.current = { entry: { id: 1, name: plan.name, file: plan.name + '.json', plan }, plan };
    editor._paint = { floor: 0, tool: 'room', dir: 'north', roofPitch: null };
    editor._sel = []; editor._history = []; editor._future = [];
    return { editor, plan, E, context };
}

const cottage = roof => ({ name: 'Hut', size: [10, 9], storey: 5, materials: { wall: 'Stone', inner: 'Plaster', floor: 'Wood', roof: 'RoofTile' },
    floors: [{ rooms: { room: [1, 1, 8, 7] }, doors: [['room', 'outside', 2]] }], roof, windows: { every: 0, width: 2 } });

test('a slanted roof is one slope: a wedge of wall under a slab of roof, tall on the side it rises to', () => {
    const THREE = loadThree();
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    for (const high of ['north', 'east', 'south', 'west']) {
        const plan = cottage({ pitch: 3, style: 'shed', high });
        const pieces = SP.build(plan);
        assert.equal(pieces.filter(p => p.kind === 'ramp').length, 0, 'no gable ramps');
        const roofZ = 5;
        const wedge = pieces.find(p => p.kind === 'wedge'), slab = pieces.find(p => p.kind === 'box' && p.tilt);
        assert.ok(wedge && slab, 'a wedge and a slab');
        assert.equal(wedge.material, 'Stone', 'the wedge closes the ends in the wall\'s material');
        assert.equal(slab.material, 'RoofTile');
        assert.equal(wedge.z, roofZ);
        assert.equal(slab.z * 4, Math.round(slab.z * 4), 'the slab stands on a quarter level, where a shape can');
        assert.equal(slab.tilt, Math.round(slab.tilt), 'at a whole degree');
        const map = { width: 10, height: 9, reactor3d: { version: 1, elevation: new Array(90).fill(0), pieces } };
        const box = piece => new THREE.Box3().setFromBufferAttribute(R.pieceGeometry([Object.assign({ id: 1 }, piece)], map).attributes.position);
        // The building's box is cells 0..9 by 0..8 (the room and its walls).
        const wb = box(wedge);
        assert.ok(Math.abs(wb.min.x - 0) < 0.02 && Math.abs(wb.max.x - 10) < 0.02 && Math.abs(wb.min.z - 0) < 0.02 && Math.abs(wb.max.z - 9) < 0.02, `${high}: the wedge covers the building's box exactly`);
        const run = high === 'north' || high === 'south' ? 9 : 10;
        assert.ok(Math.abs((wb.max.y - wb.min.y) - 3) < 0.25 * run / 9, `${high}: about three levels up`);
        // The high side is where the wedge's top is: read the top's own corners.
        const position = R.pieceGeometry([Object.assign({ id: 1 }, wedge)], map).attributes.position;
        let top = null;
        for (let i = 0; i < position.count; i++) if (!top || position.getY(i) > top[1]) top = [position.getX(i), position.getY(i), position.getZ(i)];
        const where = { north: top[2] < 0.1, south: top[2] > 8.9, west: top[0] < 0.1, east: top[0] > 9.9 }[high];
        assert.ok(where, `${high}: the top edge is on the ${high} side`);
        // The slab lies just over the wedge's slope and reaches past the walls as eaves.
        const sb = box(slab);
        assert.ok(sb.min.x < -0.5 && sb.max.x > 10.5 && sb.min.z < -0.5 && sb.max.z > 9.5, `${high}: eaves on every side`);
        assert.ok(sb.max.y > wb.max.y && sb.max.y - wb.max.y < 1.2, `${high}: the slab tops the wedge`);
        const slabPos = R.pieceGeometry([Object.assign({ id: 1 }, slab)], map).attributes.position;
        const rise = (wb.max.y - wb.min.y) / run;
        const heightOver = (x, y, z) => {
            const s = { south: z, north: 9 - z, east: x, west: 10 - x }[high];
            return y - (wb.min.y + s * rise);
        };
        let least = Infinity, most = -Infinity;
        for (let i = 0; i < slabPos.count; i++) { const h = heightOver(slabPos.getX(i), slabPos.getY(i), slabPos.getZ(i)); least = Math.min(least, h); most = Math.max(most, h); }
        assert.ok(least > 0 && least < 0.12, `${high}: the slab's underside lies a hair over the slope (${least.toFixed(3)})`);
        assert.ok(most < 0.45, `${high}: and its top a slab's thickness over it (${most.toFixed(3)})`);
    }
});

test('a slanted roof: its high side turns with the plan, the file keeps it, and a built structure can be re-roofed with one', () => {
    const { E } = openEditor(cottage({ pitch: 3, style: 'shed', high: 'north' }));
    const turned = SP.transform(cottage({ pitch: 3, style: 'shed', high: 'north' }), 1, 1);
    assert.equal(turned.roof.high, 'east', 'a quarter turn clockwise: north becomes east');
    const raw = cottage({ pitch: 3, style: 'shed', high: 'west' });
    const back = E.trimPlan(E.normalizePlan(JSON.parse(JSON.stringify(raw))));
    assert.deepEqual({ ...back.roof }, { pitch: 3, style: 'shed', high: 'west' });
    assert.equal(E.normalizePlan(cottage({ pitch: 2, style: 'gable', high: 'west' })).roof.high, undefined, 'a gable has no high side');
    assert.equal(E.normalizePlan(cottage({ pitch: 2, style: 'dome' })).roof.style, undefined, 'an unknown style is dropped');
    // A structure in pieces: Rebuild roof lays the same wedge and slab over its top floor.
    const built = { size: [8, 7], storey: 5, height: 1, materials: { wall: 'Stone', roof: 'RoofTile' }, pieces: [], roof: { pitch: null, style: 'shed', high: 'south' } };
    F.paintFloor(built, 0, F.rectCells(1, 1, 6, 5), 'Wood');
    F.paintWall(built, 0, F.outlineCells(1, 1, 6, 5), 'Stone', 'Wood');
    F.rebuildRoof(built, { style: 'shed', pitch: 2, plan: SP });
    const wedge = built.pieces.find(p => p.kind === 'wedge'), slab = built.pieces.find(p => p.kind === 'box');
    assert.ok(wedge && slab && !built.pieces.some(p => p.kind === 'ramp'));
    assert.equal(wedge.angle, 0, 'rising to the south');
    assert.deepEqual([wedge.size[0], wedge.size[2]], [6, 5], 'over the footprint of the top floor');
    F.rebuildRoof(built, { style: 'gable', plan: SP });
    assert.ok(!built.pieces.some(p => p.kind === 'wedge') && built.pieces.some(p => p.kind === 'ramp'), 'and a gable again takes the slanted one away');
});

test('the floor plan is drawn from what the structure builds: a lot shows its house, a hamlet its cottages', () => {
    const lot = demoPlan('Lot-Cottage');
    assert.ok(lot.pieces.length > 0 && lot.floors.length > 0, 'the Demo lot is a described house with pieces of its own beside it');
    const { editor, plan } = openEditor(lot);
    assert.equal(F.isDescribed(plan), true, 'rooms make a plan described, whatever else it holds');
    const built = editor._builtPieces(plan);
    const walls = built.filter(p => p.kind === 'wall' && p.z === 0).length;
    assert.ok(walls > 10, 'the plan\'s pieces include the house\'s walls');
    assert.ok(built.length > plan.pieces.length, 'not only the lot\'s own pieces');
    assert.equal(built.length, SP.build(plan, 0, 0, 1, 0, () => null).length, 'exactly what the 3D view is given');
    assert.equal(editor._builtPieces(plan), built, 'built once until the plan changes');
    editor.markDirty();
    assert.notEqual(editor._builtPieces(plan), built, 'and again after a change');
    // Two floors described, fences on the ground: both floors have tabs.
    const twoUp = openEditor(demoPlan('Lot-TwoUp'));
    assert.equal(twoUp.editor._floorCount(twoUp.plan), 2);
    assert.equal(twoUp.plan.height, 2, 'and the plan is as tall as its floors');
    // A plan of parts shows the parts' floors, not the default height.
    const hamlet = openEditor(demoPlan('Hamlet'), name => demoPlan(String(name).replace(/\.json$/i, '')));
    assert.equal(F.isDescribed(hamlet.plan), false, 'parts are other plans: nothing here to build out');
    assert.ok(hamlet.editor._builtPieces(hamlet.plan).some(p => p.kind === 'wall'), 'the hamlet\'s plan shows its cottages');
    assert.equal(hamlet.editor._floorCount(hamlet.plan), 1);
});

test('painting a described lot builds its rooms out and keeps its own pieces, paths and parts', () => {
    const { editor, plan } = openEditor(demoPlan('Lot-Cottage'));
    const own = plan.pieces.length, paths = plan.paths.length;
    const before = editor._builtPieces(plan).filter(p => !Array.isArray(p.size)).length;
    editor.applyPaint('wall', { x: 0, y: 0 }, { x: 0, y: 0 });
    assert.equal(plan.floors.length, 0, 'the rooms are pieces now');
    assert.ok(plan.pieces.length > own + 20, 'the house joined the lot\'s own pieces');
    assert.equal(plan.paths.length, paths, 'the paving stays paving');
    const after = editor._builtPieces(plan).filter(p => !Array.isArray(p.size)).length;
    assert.ok(Math.abs(after - before) <= 2, 'and the plan builds what it built, plus the wall just painted');
    assert.equal(editor.undo(), true);
    assert.equal(editor.current.plan.floors.length, 1, 'undo brings the description back');
});

test('a material picked for walls, floors or the roof re-dresses the building; the pointer over one only shows it', () => {
    const { editor, plan } = openEditor(cottage({ pitch: 2 }));
    assert.equal(editor._roleMaterial('wall'), 'Stone');
    assert.equal(editor._roleMaterial('floor'), 'Wood');
    assert.equal(editor._roleMaterial('roof'), 'RoofTile');
    // Hover: the built pieces wear it, the plan goes back when the pointer leaves.
    editor.previewRole('wall', 'Timber');
    assert.ok(editor._builtPieces(plan).some(p => p.kind === 'wall' && p.material === 'Timber'), 'shown while the pointer is over it');
    editor.previewRole('wall', null);
    assert.equal(plan.materials.wall, 'Stone', 'and taken back');
    assert.equal(editor._history.length, 0, 'a preview is not an edit');
    // Pick: kept, one undo step.
    editor.dressRole('wall', 'Timber');
    assert.equal(plan.materials.wall, 'Timber');
    assert.equal(plan.materials.inner, 'Plaster', 'the inner walls keep theirs');
    assert.equal(editor._history.length, 1);
    assert.ok(editor._builtPieces(plan).filter(p => p.kind === 'wall').every(p => p.material === 'Timber'));
    editor.dressRole('roof', 'Thatch');
    assert.ok(editor._builtPieces(plan).some(p => p.kind === 'ramp' && p.material === 'Thatch'));
    editor.undo(); editor.undo();
    assert.deepEqual([editor.current.plan.materials.wall, editor.current.plan.materials.roof], ['Stone', 'RoofTile']);

    // A building in pieces: the role's pieces wearing the old material change; others keep theirs.
    const built = openEditor({ name: 'Built', size: [8, 7], storey: 5 });
    const bp = built.plan;
    F.paintFloor(bp, 0, F.rectCells(1, 1, 6, 5), 'Wood');
    F.paintWall(bp, 0, F.outlineCells(1, 1, 6, 5), 'Stone', 'Wood');
    F.paintWall(bp, 0, [[3, 2], [3, 3]], 'Plaster', 'Wood');
    bp.height = 1;
    built.editor.markDirty();
    assert.equal(built.editor._roleMaterial('wall'), 'Stone', 'the swatch shows what most walls wear');
    built.editor.dressRole('wall', 'Timber');
    assert.equal(bp.pieces.filter(p => p.kind === 'wall' && p.material === 'Timber').length, 18);
    assert.equal(bp.pieces.filter(p => p.kind === 'wall' && p.material === 'Plaster').length, 2, 'the plaster partition stays plaster');
    assert.ok(bp.pieces.filter(p => p.kind === 'floor').every(p => p.material === 'Wood'), 'floors are another role');
    built.editor.dressRole('floor', 'Stone');
    assert.ok(bp.pieces.filter(p => p.kind === 'floor').every(p => p.material === 'Stone'));
    assert.equal(built.editor._roleMaterial('floor'), 'Stone');
    // With pieces selected, only they change.
    built.editor._paint.tool = 'select';
    built.editor._sel = bp.pieces.filter(p => p.kind === 'wall' && p.material === 'Plaster');
    built.editor.dressRole('wall', 'Wood');
    assert.equal(bp.pieces.filter(p => p.kind === 'wall' && p.material === 'Wood').length, 2);
    assert.equal(bp.pieces.filter(p => p.kind === 'wall' && p.material === 'Timber').length, 18, 'the rest of the walls are untouched');
    // New painting uses the role's material.
    built.editor._sel = []; built.editor._paint.tool = 'wall';
    built.editor.applyPaint('wall', { x: 0, y: 6 }, { x: 0, y: 6 });
    assert.equal(bp.pieces.find(p => p.kind === 'wall' && p.x === 0 && p.y === 6).material, 'Timber');
});

test('the roof settings act at once: a described building takes them, one in pieces is re-roofed', () => {
    const { editor, plan } = openEditor(cottage({ pitch: 2 }));
    editor.setRoof({ style: 'shed' });
    assert.equal(plan.roof.style, 'shed');
    assert.ok(editor._builtPieces(plan).some(p => p.kind === 'wedge'), 'the described building builds its slanted roof');
    editor.setRoof({ high: 'east' });
    assert.equal(plan.roof.high, 'east');
    editor.setRoof({ pitch: 4 });
    assert.equal(plan.roof.pitch, 4);
    editor.setRoof({ style: 'gable' });
    assert.equal(plan.roof.high, undefined, 'the high side goes with the slanted style');
    assert.equal(editor._history.length, 4, 'each one an undo step');
    const built = openEditor({ name: 'Built', size: [8, 7], storey: 5 });
    F.paintFloor(built.plan, 0, F.rectCells(1, 1, 6, 5), 'Wood');
    F.paintWall(built.plan, 0, F.outlineCells(1, 1, 6, 5), 'Stone', 'Wood');
    built.plan.height = 1;
    built.editor.setRoof({ style: 'shed' });
    assert.ok(built.plan.pieces.some(p => p.kind === 'wedge' && p.z === 5), 'the built structure gets the roof laid');
    built.editor.setRoof({ style: 'flat' });
    assert.ok(!built.plan.pieces.some(p => p.kind === 'wedge') && built.plan.pieces.some(p => p.kind === 'block' && p.z === 5));
});

test('every Demo structure builds, and its plan shows walls wherever the building has them', () => {
    const folder = path.join(repoRoot, 'template', 'Demo', '3d', 'Structures');
    const resolve = name => { const file = path.join(folder, String(name).replace(/\.json$/i, '') + '.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };
    for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.json') && name !== 'Manor.json')) {
        const { editor, plan } = openEditor(JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')), resolve);
        const whole = SP.build(plan, 0, 0, 1, 0, editor.resolve);
        assert.equal(editor._builtPieces(plan).length, whole.length, `${file}: the plan is drawn from every piece the building has`);
        const walls = whole.filter(p => F.WALLISH.includes(p.kind));
        if (walls.length) assert.ok(editor._floorCount(plan) >= F.occupiedFloors({ storey: plan.storey, pieces: whole }), `${file}: a floor tab for every storey with walls`);
    }
});

test('a shape is on the plan of every floor it stands through, and a finish has a colour where nothing reflects', () => {
    const { E } = openEditor({ name: 'T', size: [8, 8], storey: 5 });
    assert.equal(E.shapeRise({ size: [6, 11, 6] }), 11);
    assert.ok(Math.abs(E.shapeRise({ size: [2, 0.25, 5.66], tilt: 45 }) - (0.25 + 5.66) * Math.SQRT1_2) < 1e-9, 'a tilted slab rises by its lean');
    assert.equal(E.surfaceOf({ finish: 'gold' }).tint, '#ffcc55', 'a finish by name is its preset');
    assert.deepEqual({ ...E.surfaceLook({ reflect: 1, gloss: 1, metal: 1, tint: '#ffcc55', texture: 0 }) }, { color: '#ffcc55', pictured: false }, 'gold is gold');
    assert.deepEqual({ ...E.surfaceLook({ reflect: 1, gloss: 1, metal: 1, tint: '#ffffff', texture: 0 }) }, { color: '#d5dde6', pictured: false }, 'an untinted mirror is silver');
    assert.equal(E.surfaceLook({ reflect: 0.9, gloss: 0.9, metal: 0, tint: '#ffffff', texture: 1 }).pictured, true, 'gloss keeps the material\'s picture');
    assert.equal(E.surfaceLook({ reflect: 0, tint: '#ff0000' }), null, 'no reflection, no finish');
    assert.equal(E.surfaceLook(null), null);
});

test('the plan draws a tower on each floor it rises through and the whole building from above', () => {
    // A two-floor house with a tower beside it: a tall box, a gold bell and a pyramid cap above the top floor.
    const raw = { name: 'Tower', size: [14, 10], storey: 5, materials: { wall: 'Stone', floor: 'Wood', roof: 'RoofTile' },
        floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 2]] }, { rooms: { loft: [1, 1, 6, 8] }, doors: [] }], roof: { pitch: 2 }, windows: { every: 0, width: 2 },
        shapes: [{ kind: 'box', at: [11, 5], z: 0, size: [4, 12, 4], material: 'Stone' }, { kind: 'pyramid', at: [11, 5], z: 12, size: [4.4, 4, 4.4], material: 'RoofTile' }] };
    const { editor, plan, context } = openEditor(raw);
    plan.pieces.push({ kind: 'cone', x: 11, y: 5, z: 6, rot: 0, material: '', size: [1.5, 1.5, 1.5], angle: 0, surface: { reflect: 1, gloss: 1, metal: 1, tint: '#ffcc55', texture: 0 } });
    // A canvas that records what is drawn, enough for drawPaint.
    const calls = [];
    const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'createPattern' ? () => null : (...args) => { calls.push([k, args]); }), set: (t, k, v) => { t[k] = v; if (k === 'fillStyle') calls.push(['fillStyle', [v]]); return true; } });
    const canvas = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 440 }) };
    editor._detail = { querySelector: sel => (sel === '.rr-structures-paint' ? canvas : null) };
    context.window.devicePixelRatio = 1;
    delete editor.drawPaint;     // the real one
    const shapesOn = floor => { editor._paint.floor = floor; editor._paint.above = false; editor.drawPaint(); return Array.from(editor._paintIndex.shapes.get(floor) || [], p => p.kind); };
    assert.deepEqual(shapesOn(0), ['box'], 'the tower stands on the ground floor\'s plan');
    assert.deepEqual(shapesOn(1), ['box', 'cone'], 'and through the upper floor, the bell hanging in it');
    assert.equal(editor._paintIndex.shapeList.length, editor._builtPieces(plan).filter(p => Array.isArray(p.size)).length, 'every shape is known to the view from above, eaves included');
    assert.ok(editor._paintIndex.shapeList.some(p => p.kind === 'box' && p.tilt), 'the gable\'s eaves among them');
    // From above: drawn lowest first, the pyramid cap after the tower it stands on, the roof after the floors.
    editor._paint.above = true;
    calls.length = 0;
    editor.drawPaint();
    const order = editor._paintIndex.above.items;
    assert.ok(order.every((item, i) => i === 0 || item.top >= order[i - 1].top), 'the lower is drawn first');
    const last = order[order.length - 1];
    assert.equal(last.shape && last.shape.kind, 'pyramid', 'the tower\'s cap is the highest thing and drawn last');
    assert.ok(order.some(item => item.piece && item.piece.kind === 'ramp'), 'the roof\'s slopes are in the view from above');
    assert.ok(calls.some(([name, args]) => name === 'fillStyle' && args[0] === '#ffcc55'), 'the gold bell is drawn gold');
    // Nothing is painted from above: a press on the plan does nothing.
    const before = JSON.stringify(plan);
    editor.applyPaint = () => { throw new Error('painted from above'); };
    assert.equal(JSON.stringify(plan), before);
});

test('a material tile shows the material in use, and names what none is called', () => {
    const P = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MaterialPopup.js'));
    const html = P.tile({ cls: 'x', value: 'Stone', url: 'img/materials/Stone.png', blank: 'Plain', attrs: 'data-role="wall"' });
    assert.match(html, /class="rr-material-tile x"/);
    assert.match(html, /data-value="Stone"/);
    assert.match(html, /background-image:url\('img\/materials\/Stone\.png'\)/);
    assert.match(html, /rr-material-tile-name">Stone</);
    const none = P.tile({ value: '', blank: 'Plain' });
    assert.match(none, /rr-material-tile-face is-plain"/);
    assert.match(none, /rr-material-tile-name">Plain</);
    assert.match(P.tile({ value: 'A"b<c', url: '' }), /data-value="A&quot;b&lt;c"/, 'a name is escaped');
    // Both panels use it, and the Build panel no longer lists every material in a scrolling strip.
    assert.match(read('editor/src/BuildHotbar.js'), /RRMaterialPopup\.tile\(/);
    assert.match(read('editor/src/database/DatabaseStructureEditor.js'), /RRMaterialPopup\.open\(/);
    assert.doesNotMatch(read('editor/css/styles.css'), /\.rr-build-swatches\s*\{/);
    assert.match(read('editor/index.html'), /src\/utils\/MaterialPopup\.js/);
});

test('the workshop banner leaves the Build panel clear', () => {
    const css = read('editor/css/styles.css');
    const banner = css.match(/\.rr-workshop-banner \{[^}]*\}/)[0], panel = css.match(/\.rr-build-panel \{[^}]*\}/)[0];
    const px = (block, prop) => Number(block.match(new RegExp(prop + ':\\s*(\\d+)px'))[1]);
    assert.ok(px(banner, 'right') >= px(panel, 'right') + px(panel, 'width') + 8, 'the banner ends before the panel begins');
});
