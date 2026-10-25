/**
 * Database > 3D Models: the handles on a selected effect, the card tab that
 * picks them, deleting a section's row, and what counts as unsaved.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const Editor = require('../src/database/Database3DEditor.js');
const Handles = require('../src/utils/SizeHandles3D.js');

const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
    const e = new Editor({}, { currentProject: {} });
    e.selectedName = 'Model';
    e._t = e._k = text => text;
    e.saveRules = () => { e.saved = (e.saved || 0) + 1; };
    e.renderEffectList = () => {};
    e.renderEditCard = () => {};
    e._refreshUnsaved = () => {};
    e._leaveEffectMode = () => { e.selectedEffect = -1; e._effectWork = null; e._cardMode = 'part'; e.left = true; };
    return e;
}

test('a size handle is measured along the line from the centre through it', () => {
    const centre = [100, 100], grip = [150, 100];
    assert.equal(Handles.factor(centre, grip, [150, 100]), 1, 'where the drag began');
    assert.equal(Handles.factor(centre, grip, [200, 100]), 2, 'twice as far out');
    assert.equal(Handles.factor(centre, grip, [125, 180]), 0.5, 'movement across the line does not count');
    assert.equal(Handles.factor(centre, grip, [40, 100]), 0.02, 'past the centre it stops at next to nothing, never negative');
    assert.equal(Handles.factor(centre, centre, [300, 300]), 1, 'a handle on the centre (an edge-on surface) changes nothing');
});

test('an edge changes one side, a corner both in proportion', () => {
    const start = { width: 0.3, height: 0.2 };
    assert.deepEqual(Handles.resize({ x: 1, y: 0 }, start, 2), { width: 0.6, height: 0.2 }, 'right edge: width');
    assert.deepEqual(Handles.resize({ x: -1, y: 0 }, start, 0.5), { width: 0.15, height: 0.2 }, 'left edge: width');
    assert.deepEqual(Handles.resize({ x: 0, y: 1 }, start, 1.5), { width: 0.3, height: 0.3 }, 'top edge: height');
    assert.deepEqual(Handles.resize({ x: 1, y: -1 }, start, 2), { width: 0.6, height: 0.4 }, 'corner: both');
    // Limits: an edge stops at them, a corner stops with its proportion intact.
    assert.deepEqual(Handles.resize({ x: 1, y: 0 }, start, 100, { min: 0.01, max: 4 }), { width: 4, height: 0.2 });
    assert.deepEqual(Handles.resize({ x: 1, y: 1 }, start, 100, { min: 0.01, max: 4 }), { width: 4, height: 2.667 });
    assert.deepEqual(Handles.resize({ x: 1, y: 1 }, start, 0.001, { min: 0.01, max: 4 }), { width: 0.015, height: 0.01 });
    assert.equal(Handles.QUAD.filter(handle => handle.x && handle.y).length, 4, 'four corners');
    assert.equal(Handles.QUAD.filter(handle => !handle.x !== !handle.y).length, 4, 'four edges');
});

test('one size (a light\'s reach, an animation\'s scale) follows its one handle', () => {
    assert.equal(Handles.uniform(1, 1.5), 1.5);
    assert.equal(Handles.uniform(3, 100, { min: 0.1, max: 60, places: 1 }), 60);
    assert.equal(Handles.uniform(3, 0.001, { min: 0.1, max: 60, places: 1 }), 0.1);
    assert.deepEqual(Handles.uniform([1, 2, 1], 2), [2, 4, 2], 'a free scale keeps its shape');
    assert.deepEqual(Handles.uniform([1, 2, 1], 100, { min: 0.1, max: 4 }), [2, 4, 2], 'and stops when its largest axis does');
});

test('a point is on a media surface when it is inside its four screen corners', () => {
    const quad = [[10, 10], [110, 20], [100, 80], [0, 70]];
    assert.equal(Handles.inside(quad, 50, 45), true);
    assert.equal(Handles.inside(quad, 150, 45), false);
    assert.equal(Handles.inside([[10, 10], null, [100, 80], [0, 70]], 50, 45), false, 'a corner behind the camera is no surface to grab');
});

test('the card\'s tab picks the handles the effect wears', () => {
    assert.equal(Editor.effectTool('effect'), 'move', 'what it is: it can still be slid');
    assert.equal(Editor.effectTool('offset'), 'move');
    assert.equal(Editor.effectTool('rotate'), 'turn');
    assert.equal(Editor.effectTool('scale'), 'size');
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    // The shared arrows and rings, and the size handles beside them: no gizmo of the page's own.
    assert.match(source, /RRAxisArrows3D\.sync\(gizmo\.arrows, at, tool === 'move'\);/);
    assert.match(source, /RRPoseRings3D\.sync\(gizmo\.rings, here, work\.rotate\[1\], work\.rotate\[0\], tool === 'turn'\);/, 'yaw is the Y number, pitch the X');
    assert.match(source, /RRSizeHandles3D\.place\(THREE, size, tool === 'size' \? RRSizeHandles3D\.QUAD\.map/);
    assert.match(source, /turn: \{ yaw: 1, pitch: 0, roll: 2 \}\[ring\.axis\]/, 'each ring turns the number it shows');
    // One step back per drag, and the handles are picked before the model behind them.
    assert.match(source, /_endEffectGizmoDrag\(\) \{[\s\S]{0,400}this\._afterEffectEdit\(true\);/);
    assert.match(source, /if \(final\) \{\s*this\._fxCheckpoint\(\);/);
});

test('a row deletes its own effect; another row\'s card and its unsaved work stay', () => {
    const e = fixture();
    e.rawEffects = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    e.rawAnimations = [{ name: 'fire', effects: [{ at: 0, effect: 'A' }, { at: 0.5, effect: 'C' }] }];
    e.selectedEffect = 2; e._effectWork = { name: 'C', scale: 3 }; e._cardMode = 'effect';
    e.deleteModelEffectAt(0);
    assert.deepEqual(e.rawEffects.map(raw => raw.name), ['B', 'C']);
    assert.equal(e.selectedEffect, 1, 'the open card still points at its effect');
    assert.deepEqual(e._effectWork, { name: 'C', scale: 3 }, 'with the work on it');
    assert.deepEqual(clone(e.rawAnimations[0].effects), [{ at: 0.5, effect: 'C' }], 'a rule that fired the deleted one loses that step');
    assert.equal(e.saved, 1);
    assert.equal(e.left, undefined);
    // The Delete key (and the row's own button on the selected row) removes the one in hand.
    assert.equal(e.deleteSelectedRow('effects'), true);
    assert.deepEqual(e.rawEffects.map(raw => raw.name), ['B']);
    assert.equal(e.left, true, 'its card closes');
    assert.equal(e.deleteSelectedRow('effects'), false, 'nothing selected: nothing deleted');
    assert.equal(e.deleteSelectedRow('parts'), false);
});

test('an effect\'s card steps back one gesture at a time', () => {
    const e = fixture();
    e._detail = null;
    e._stopEffectPreview = () => {};
    e._syncEffectAnchorMarker = () => {};
    e._syncEffectGizmo = () => {};
    const work = e._effectWork = { name: 'Flag', type: 'animation', rotate: [0, 0, 0], video: { file: '', width: 0.3, height: 0.2 } };
    e._cardMode = 'effect';
    e._fxCheckpoint();
    work.video.width = 0.5; work.video.width = 0.6;
    e._fxCheckpoint();
    work.rotate[1] = 90;
    e._fxCheckpoint();
    e.undoEffect();
    assert.equal(e._effectWork, work, 'the same object: the preview holds it');
    assert.deepEqual([work.video.width, work.rotate[1]], [0.6, 0], 'the turn is taken back');
    e.undoEffect();
    assert.equal(work.video.width, 0.3, 'then the whole drag of the size, as one step');
    e.redoEffect();
    assert.equal(work.video.width, 0.6);
});

test('unsaved is what a Save button has not written yet', () => {
    const e = fixture();
    e._detail = {};
    assert.deepEqual(e.pendingKinds(), []);
    e._cardMode = 'effect';
    e._effectWork = { name: 'Flag', scale: 1 };
    e._fxBaseline = JSON.stringify(e._effectWork);
    assert.deepEqual(e.pendingKinds(), []);
    e._effectWork.scale = 2;
    assert.deepEqual(e.pendingKinds(), ['effect']);
    e._rigMode = true; e._rigFaceMode = false; e._rigTemplate = 'humanoid'; e._rigMarkers = { head: [0, 1, 0] };
    e._rigBaseline = e._rigSnapshot();
    assert.deepEqual(e.pendingKinds(), ['effect']);
    e._rigMarkers.head = [0, 1.1, 0];
    assert.deepEqual(e.pendingKinds(), ['rig', 'effect'], 'a moved marker is unsaved until Save rig');
    assert.equal(e.hasPending(), true);
    // The footer saves them; Cancel and leaving ask first.
    const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.equal((ui.match(/if \(models\(\) && !\(await models\(\)\.savePending\(\)\)\) return;/g) || []).length, 2, 'OK and Apply save the page first');
    assert.match(ui, /const cancelAsked = \(\) => afterModels\(\(\) => this\.requestCloseDatabase\(cancelAndClose\)\);/);
    assert.match(ui, /models\.settlePending\(\)\.then\(go => \{ if \(go\) this\.openDatabase\(type, \{ select \}\); \}\);/, 'another section waits for the answer');
});

// ---- Which variants wear an effect: the editor's side of `variants` on an effect ----

const Panel = require('../src/database/ModelVariantsPanel.js');

test('an effect\'s list of variants: all, some, one, and what a row says', () => {
    const variants = [{ name: 'Black' }, { name: 'Parade', media: { plate: false } }];
    const flag = { name: 'flag', type: 'video' };
    assert.deepEqual(Panel.wornBy(flag, variants), ['', 'Black', 'Parade'], 'no list: every variant, the model\'s own first');
    assert.equal(Panel.wornSummary(flag, variants, 'Model\'s own', '{name} only', 'No variant'), '');
    Panel.setWornBy(flag, ['Black'], variants);
    assert.deepEqual(flag.variants, ['Black']);
    assert.equal(Panel.wears(flag, 'Black', variants), true);
    assert.equal(Panel.wears(flag, '', variants), false, 'the model\'s own look is ""');
    assert.equal(Panel.wornSummary(flag, variants, 'Model\'s own', '{name} only', 'No variant'), 'Black only');
    Panel.setWornBy(flag, ['Parade', ''], variants);
    assert.deepEqual(flag.variants, ['', 'Parade'], 'kept in the model\'s order');
    assert.equal(Panel.wornSummary(flag, variants, 'Model\'s own', '{name} only', 'No variant'), 'Model\'s own, Parade');
    Panel.setWornBy(flag, ['', 'Black', 'Parade'], variants);
    assert.equal('variants' in flag, false, 'every one of them is no list');
    Panel.setWornBy(flag, [], variants);
    assert.equal('variants' in flag, false, 'and so is none: an effect is never hidden by an empty list');
    assert.deepEqual(Panel.trimWorn([' Black ', 'Black', 3, null, '']), ['Black', '']);
    assert.equal(Panel.trimWorn([]), null);
    // The first way a variant left a surface off still reads as not worn, and is rewritten as the effect's list.
    const plate = { name: 'plate', type: 'video' };
    assert.deepEqual(Panel.wornBy(plate, variants), ['', 'Black']);
    assert.equal(Panel.migrateOff([plate, flag], variants), true);
    assert.deepEqual(plate.variants, ['', 'Black']);
    assert.equal('media' in variants[1], false, 'the mark is gone from the variant');
    assert.equal(Panel.migrateOff([plate, flag], variants), false);
});

test('renaming, deleting and copying a variant keep the effects\' lists true', () => {
    const effects = [{ name: 'flag', variants: ['Black'] }, { name: 'lamp', variants: ['', 'Black'] }, { name: 'muzzle' }];
    assert.equal(Panel.renameWorn(effects, 'Black', 'Night'), true);
    assert.deepEqual(effects.map(effect => effect.variants), [['Night'], ['', 'Night'], undefined]);
    assert.equal(Panel.copyWorn(effects, 'Night', 'Night 2'), true, 'a variant made from another wears what it wears');
    assert.deepEqual(effects.map(effect => effect.variants), [['Night', 'Night 2'], ['', 'Night', 'Night 2'], undefined]);
    assert.equal(Panel.copyWorn(effects, '', 'Day'), true);
    assert.deepEqual(effects[1].variants, ['', 'Night', 'Night 2', 'Day']);
    Panel.removeWorn(effects, 'Night 2'); Panel.removeWorn(effects, 'Day');
    assert.equal(Panel.removeWorn(effects, 'Night'), true);
    assert.deepEqual(effects[1].variants, [''], 'it leaves a list others are in');
    assert.deepEqual(effects[0].variants, ['Night'], 'an effect only it wore keeps the name: it shows nowhere, never everywhere');
    assert.equal(Panel.wornSummary(effects[0], [{ name: 'Parade' }], 'Model\'s own', '{name} only', 'No variant'), 'No variant');
});

test('the list is saved tidy, and a pasted effect names only the variants its new model has', () => {
    const effects = [{ name: 'a', variants: [' Black ', 'Black', 7] }, { name: 'b', variants: [] }, { name: 'c', variants: 'Black' }, { name: 'd' }];
    const json = JSON.parse(Editor.mergeSidecar('{"variants":[{"name":"Black"}],"rig":{"template":"humanoid"}}', [], [], {}, effects));
    assert.deepEqual(json.effects, [{ name: 'a', variants: ['Black'] }, { name: 'b' }, { name: 'c' }, { name: 'd' }]);
    assert.deepEqual(json.variants, [{ name: 'Black' }], 'the rest of the file is as it was');
    assert.equal(json.rig.template, 'humanoid');
    const e = fixture();
    e.rawVariants = [{ name: 'Black' }, { name: 'Parade' }];
    assert.deepEqual(e._tidyWorn({ name: 'x', variants: ['Black', 'Desert'] }).variants, ['Black']);
    assert.equal('variants' in e._tidyWorn({ name: 'x', variants: ['Desert'] }), false, 'none of them here: every variant');
    assert.equal('variants' in e._tidyWorn({ name: 'x', variants: ['', 'Black', 'Parade'] }), false);
    // The effect card's chips and the variant card's ticks write this one list; a use reads it in the runtime.
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(source, /class="r3d-fchip r3d-fx-worn-all" aria-pressed="\$\{everyLook\}"/);
    assert.match(source, /ModelVariantsPanel\.setWornBy\(work, now, this\.rawVariants\);/);
    assert.match(source, /index !== this\.selectedEffect && !this\.variantsPanel\.shows\(raw\)\) return;/, 'the preview plays what the variant in view wears');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'ModelVariantsPanel.js'), 'utf8');
    assert.match(panel, /host\._fxFromVariant = true;\s*host\._fxTab = 'offset';/, 'Place keeps the variant worn and comes back to its card');
    assert.match(panel, /if \(\(host\.rawVariants \|\| \[\]\)\.length\) extra\.variants = \[host\._variant \|\| ''\];/, '+ adds a surface only this variant wears');
    assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d_effects.js'), 'utf8'),
        /if \(wearing !== null && Array\.isArray\(raw\.variants\) && raw\.variants\.length && raw\.variants\.indexOf\(wearing\) < 0\) continue;/);
});

test('a picture is added to a model\'s textures folder through the Resource Manager\'s own import', () => {
    const os = require('os');
    const Importer = require('../src/ResourceManager.js');
    const assetFiles = require('../src/utils/AssetFiles.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-variant-texture-'));
    try {
        fs.mkdirSync(path.join(root, '3d', 'Vehicles', 'Tank'), { recursive: true });
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
        const base = { importer: Importer, modelName: 'Vehicles/Tank', fs, path, assetFiles, projectRoot: root,
            writeAtomic: (io, file, data) => io.writeFileSync(file, data) };
        assert.deepEqual(Panel.textureFolder('Vehicles/Tank').path, '3d/Vehicles/Tank/textures');
        const first = Panel.importTextureBytes({ ...base, sourceName: 'Desert Camo.PNG', sourceBytes: png });
        assert.equal(first.collision, false);
        assert.equal(path.relative(root, first.destination).replace(/\\/g, '/'), '3d/Vehicles/Tank/textures/Desert Camo.png', 'the folder is made, the extension is lower case');
        assert.deepEqual(fs.readdirSync(path.join(root, '3d', 'Vehicles', 'Tank', 'textures')), ['Desert Camo.png']);
        // The same name again is not written over until it is approved.
        const again = Panel.importTextureBytes({ ...base, sourceName: 'Desert Camo.png', sourceBytes: png });
        assert.equal(again.collision, true);
        assert.equal(Panel.importTextureBytes({ ...base, sourceName: 'Desert Camo.png', sourceBytes: png, replaceRecords: again.existing }).collision, false);
        // What is not a picture, or not a safe name, is refused.
        assert.throws(() => Panel.importTextureBytes({ ...base, sourceName: 'fake.png', sourceBytes: Buffer.from('not a png') }), /not a valid PNG/);
        assert.throws(() => Panel.importTextureBytes({ ...base, sourceName: 'notes.txt', sourceBytes: png }), /extension is not valid/);
        assert.throws(() => Panel.importTextureBytes({ ...base, sourceName: '../escape.png', sourceBytes: png }), /safe filename/);
        // The name it lands under is one a variant may keep.
        assert.equal(Panel.trimVariant({ name: 'Desert', texture: path.basename(first.destination) }).texture, 'Desert Camo.png');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'ModelVariantsPanel.js'), 'utf8');
    assert.match(panel, /\{ id: 'color', label: this\._t\('Color'\) \}, \{ id: 'texture', label: this\._t\('Texture'\) \}/, 'the Texture tab is always there');
    assert.match(panel, /This model has no other textures yet\. Add a picture to use instead of its own\./);
});
