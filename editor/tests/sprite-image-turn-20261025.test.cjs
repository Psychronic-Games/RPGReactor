'use strict';
// A character's image turned on top of its sheet: Mirror (faces the other
// way), Flip (upside down), Rotate by any angle about the feet or the middle,
// Reset Image. Route steps store and run them, an event page's Image options
// (page.rrImage) start a page turned, a save keeps the turn, the sprite stays
// on its tile (runtime/reactor_sprites.js reactorApplyImage), and a 3D map's
// billboard turns in its own plane (Reactor3D.turnCharacterBillboard).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld, event, page } = require('./helpers/follower-world.cjs');
const SetMovementRouteEditor = require('../src/event/commands/SetMovementRouteEditor.js');

const repo = path.resolve(__dirname, '..', '..');
const END = { code: 0, parameters: [] };
const step = (op, n) => SetMovementRouteEditor.routeCommand(op, n);
const route = steps => ({ repeat: false, skippable: false, wait: true, list: steps.concat([END]) });

function runList(w, list, eventId = 0) {
    const interpreter = new w.Game_Interpreter();
    interpreter.setup(list.concat([{ code: 0, indent: 0, parameters: [] }]), eventId);
    let frames = 0;
    while (interpreter.isRunning() && frames < 600) { interpreter.update(); w.run(1); frames++; }
}
const setRoute = (who, steps) => ({ code: 205, indent: 0, parameters: [who, route(steps)] });
const plain = v => JSON.parse(JSON.stringify(v));
const turnOf = c => ({ mirror: !!c._rrMirror, flip: !!c._rrFlip, angle: c._reactorSpin || 0, pivot: c._rrSpinPivot || 'feet' });

test('the steps are marked Script entries: a stock runtime leaves them alone, the lists read them', () => {
    for (const op of ['mirroron', 'mirroroff', 'flipon', 'flipoff', 'resetimage']) {
        const cmd = step(op, 1);
        assert.equal(cmd.code, 45);
        assert.equal(SetMovementRouteEditor.parseRouteCommand(cmd).op, op);
        assert.doesNotThrow(() => vm.runInNewContext('(function() { eval(text); }).call(character)', { text: cmd.parameters[0], character: {} }));
    }
    assert.equal(SetMovementRouteEditor.stepText({ op: 'mirroron' }), 'Mirror ON');
    assert.equal(SetMovementRouteEditor.stepText({ op: 'flipoff' }), 'Flip OFF');
    assert.equal(SetMovementRouteEditor.stepText({ op: 'resetimage' }), 'Reset Image');
    // Rotate: an old step reads as it did; a pivot is kept; 0 is 0 (it used to save as 1°).
    const old = step('rotate', 90);
    assert.deepEqual(SetMovementRouteEditor.parseRouteCommand(old), { op: 'rotate', n: 90 });
    assert.match(old.parameters[0], /this\.reactorRotate\(90\);$/);
    const center = step('rotate', { n: 45, pivot: 'center' });
    assert.deepEqual(SetMovementRouteEditor.parseRouteCommand(center), { op: 'rotate', n: 45, pivot: 'center' });
    assert.match(center.parameters[0], /this\.reactorRotate\(45, "center"\);$/);
    assert.equal(SetMovementRouteEditor.stepText({ op: 'rotate', n: 45, pivot: 'center' }), 'Rotate to 45° (About Center)');
    // By degrees from where it stands, or to a direction (the picture's top points that way).
    const by = step('rotate', { n: -30, mode: 'by' });
    assert.deepEqual(SetMovementRouteEditor.parseRouteCommand(by), { op: 'rotate', n: -30, mode: 'by' });
    assert.match(by.parameters[0], /this\.reactorRotateBy\(-30\);$/);
    assert.equal(SetMovementRouteEditor.stepText(SetMovementRouteEditor.parseRouteCommand(by)), 'Rotate by -30°');
    const left = step('rotate', { mode: 'dir', dir: 4, n: 12 });
    assert.deepEqual(SetMovementRouteEditor.parseRouteCommand(left), { op: 'rotate', n: 270, mode: 'dir', dir: 4 });
    assert.equal(SetMovementRouteEditor.stepText(SetMovementRouteEditor.parseRouteCommand(left)), 'Rotate to Left (270°)');
    assert.equal(SetMovementRouteEditor.parseRouteCommand(step('rotate', { n: 0, pivot: 'feet' })).n, 0);
    // The event command list shows the same line.
    const list = fs.readFileSync(path.join(repo, 'editor', 'src', 'event', 'EventCommandList.js'), 'utf8');
    assert.match(list, /SetMovementRouteEditor\.stepText\(step, tt\)/);
});

test('route steps turn the character, a save keeps the turn, Reset Image straightens it', () => {
    const w = followerWorld({ events: [event(1, 8, 8)] });
    const ev = w.$gameMap.event(1);
    assert.deepEqual(turnOf(ev), { mirror: false, flip: false, angle: 0, pivot: 'feet' });
    runList(w, [setRoute(1, [step('mirroron', 1), step('flipon', 1), step('rotate', { n: 90, pivot: 'center' })])], 1);
    assert.deepEqual(turnOf(ev), { mirror: true, flip: true, angle: 90, pivot: 'center' });
    assert.deepEqual(plain(w.$gameMap.event(1).reactorImage()), { mirror: true, flip: true, angle: 90, pivot: 'center' });
    w.saveAndLoad();
    const loaded = w.$gameMap.event(1);
    assert.deepEqual(turnOf(loaded), { mirror: true, flip: true, angle: 90, pivot: 'center' }, 'kept through a save');
    runList(w, [setRoute(1, [step('rotate', { n: 300, mode: 'by' })])], 1);
    assert.equal(loaded._reactorSpin, 30, 'a relative turn goes on from 90 and wraps at 360');
    assert.equal(loaded._rrSpinPivot, undefined);
    runList(w, [setRoute(1, [step('rotate', { mode: 'dir', dir: 2 })])], 1);
    assert.equal(loaded._reactorSpin, 180, 'to Down: upside down');
    runList(w, [setRoute(1, [step('mirroroff', 1)])], 1);
    assert.equal(loaded._rrMirror, undefined);
    assert.equal(loaded._rrFlip, true);
    runList(w, [setRoute(1, [step('resetimage', 1)])], 1);
    assert.deepEqual(turnOf(loaded), { mirror: false, flip: false, angle: 0, pivot: 'feet' });
    // Nothing set is nothing saved: the fields stay out of a plain game's save.
    const saved = JSON.parse(vm.runInContext('JsonEx.stringify($gameMap.event(1))', w));
    for (const key of ['_rrMirror', '_rrFlip', '_rrSpinPivot', '_rrPageImage']) assert.equal(key in saved, false, key);
});

test('a page\'s Image options start it turned; the next plain page puts it straight; a plain page keeps a route\'s turn', () => {
    const turned = page({ rrImage: { mirror: true, flip: true, angle: 180 } });
    const plain = page({ conditions: Object.assign({}, page().conditions, { selfSwitchValid: true, selfSwitchCh: 'A' }) });
    const w = followerWorld({ events: [event(1, 8, 8, { pages: [turned, plain] }), event(2, 10, 8)] });
    const ev = w.$gameMap.event(1);
    assert.deepEqual(turnOf(ev), { mirror: true, flip: true, angle: 180, pivot: 'feet' });
    w.saveAndLoad();
    assert.deepEqual(turnOf(w.$gameMap.event(1)), { mirror: true, flip: true, angle: 180, pivot: 'feet' });
    w.$gameSelfSwitches.setValue([w.$gameMap.mapId(), 1, 'A'], true);
    w.$gameMap.event(1).refresh();
    assert.deepEqual(turnOf(w.$gameMap.event(1)), { mirror: false, flip: false, angle: 0, pivot: 'feet' }, 'the page\'s turn went with the page');
    // A plain event mirrored by a route stays mirrored when it changes to another plain page.
    const other = w.$gameMap.event(2);
    other.reactorMirror(true);
    other._pageIndex = -2;
    other.refresh();
    assert.equal(other._rrMirror, true);
});

/** reactorApplyImage on a stand-in sprite: PIXI-shaped scale, skew, anchor, frame. */
function spriteWorld() {
    const source = fs.readFileSync(path.join(repo, 'runtime', 'reactor_sprites.js'), 'utf8');
    const head = 'Sprite_Character.prototype.reactorApplyImage = function';
    const start = source.indexOf(head);
    const body = source.slice(start, source.indexOf('\n};\n', start) + 4);
    const ctx = { Sprite_Character: function() {}, Math };
    vm.createContext(ctx);
    vm.runInContext(body, ctx);
    const sprite = new ctx.Sprite_Character();
    Object.assign(sprite, { x: 100, y: 200, rotation: 0, scale: { x: 1, y: 1 }, skew: { x: 0, y: 0 }, anchor: { x: 0.5, y: 1 }, _frame: { width: 48, height: 48 } });
    sprite._character = {};
    /** A frame of the sprite: updatePosition puts it back on its feet, the pose code sets the turn, then the image turn. */
    sprite.frame = () => {
        sprite.x = 100; sprite.y = 200;
        sprite.rotation = (sprite._character._reactorSpin || 0) * Math.PI / 180;
        sprite.reactorApplyImage();
        return { x: sprite.x, y: sprite.y, sx: sprite.scale.x, sy: sprite.scale.y };
    };
    return sprite;
}
/** Where the frame's middle is drawn (the sprite's matrix applied to the middle of its frame). */
function middle(s) {
    const lx = s._frame.width * (0.5 - s.anchor.x), ly = s._frame.height * (0.5 - s.anchor.y), r = s.rotation;
    return [s.x + Math.cos(r) * s.scale.x * lx - Math.sin(r) * s.scale.y * ly, s.y + Math.sin(r) * s.scale.x * lx + Math.cos(r) * s.scale.y * ly];
}
const near = (a, b) => assert.ok(Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6, `${a} vs ${b}`);

test('the sprite turns over in its own place and stays on its tile, frame after frame', () => {
    const s = spriteWorld();
    const c = s._character;
    assert.deepEqual(s.frame(), { x: 100, y: 200, sx: 1, sy: 1 }, 'never turned: untouched');
    const home = middle(s);
    c._rrMirror = true;
    assert.deepEqual(s.frame(), { x: 100, y: 200, sx: -1, sy: 1 }, 'mirror: same place');
    c._rrFlip = true;
    for (let i = 0; i < 3; i++) assert.deepEqual(s.frame(), { x: 100, y: 152, sx: -1, sy: -1 }, 'flip: drawn from the head down to the feet, the same box');
    near(middle(s), home);
    // A plugin's zoom of 2 assigned each frame keeps the signs (and its size).
    s.scale.x = 2; s.scale.y = 2;
    s.frame();
    assert.deepEqual([s.scale.x, s.scale.y], [-2, -2]);
    s.scale.x = 1; s.scale.y = 1;
    // Rotate about the middle: the middle does not move.
    c._rrFlip = undefined; c._reactorSpin = 90; c._rrSpinPivot = 'center';
    s.frame();
    near(middle(s), home);
    // About the feet (the old Rotate): the feet stay where they were.
    c._rrSpinPivot = undefined;
    assert.deepEqual(s.frame(), { x: 100, y: 200, sx: -1, sy: 1 });
    // Flip and a turn about the feet: over in place, then turned about the feet with it.
    c._rrFlip = true; c._reactorSpin = 90;
    const f = s.frame();
    assert.ok(Math.abs(f.x - 148) < 1e-6 && Math.abs(f.y - 200) < 1e-6, JSON.stringify(f));
    // Off again: the scale's signs it set are put back, and it leaves the sprite alone after.
    c._rrMirror = undefined; c._rrFlip = undefined; c._reactorSpin = 0;
    assert.deepEqual(s.frame(), { x: 100, y: 200, sx: 1, sy: 1 });
    assert.equal(s._rrImageHeld, null);
    // A plugin's own negative zoom on a never-turned sprite stays its own.
    s.scale.x = -1;
    s.frame();
    assert.equal(s.scale.x, -1);
});

test('a tile-graphic event turns the same way (its frame is one tile)', () => {
    const s = spriteWorld();
    s._frame = { width: 48, height: 48 };
    s._character._rrFlip = true;
    s._character._tileId = 5;
    assert.deepEqual(s.frame(), { x: 100, y: 152, sx: 1, sy: -1 });
});

test('a 3D map\'s billboard rolls in its own plane, about its feet or its middle', () => {
    const w = followerWorld({ events: [] });
    const out = plain(vm.runInContext(`(function() {
        const make = () => { const o = new THREE.Object3D(); o.scale.set(1, 2, 1); o.position.set(5, 0, 5); o.updateMatrixWorld(true); return o; };
        const mid = o => { o.updateMatrixWorld(true); return new THREE.Vector3(0, 0.5, 0).applyMatrix4(o.matrixWorld); };
        const before = mid(make());
        const center = make(); Reactor3D.turnCharacterBillboard(center, Math.PI / 2, true);
        const feet = make(); Reactor3D.turnCharacterBillboard(feet, Math.PI / 2, false);
        const still = make(); Reactor3D.turnCharacterBillboard(still, 0, true);
        return { before: before.toArray(), center: mid(center).toArray(), feetPos: feet.position.toArray(), feetMid: mid(feet).toArray(), still: still.position.toArray(), stillRot: still.rotation.z };
    })()`, w));
    out.before.forEach((v, i) => assert.ok(Math.abs(v - out.center[i]) < 1e-6, 'the middle stays: ' + out.center));
    assert.deepEqual(out.feetPos, [5, 0, 5], 'feet stay');
    assert.ok(out.feetMid[0] > 5.9, 'turned clockwise: the head goes right, ' + out.feetMid);
    assert.deepEqual(out.still, [5, 0, 5]);
    assert.equal(out.stillRot, 0);
});

test('the page editor writes page.rrImage from its controls, and nothing for a page left plain', () => {
    global.RRAssetFiles = { characterFrameCount: name => (/\[f(\d+)\]/i.exec(name) ? Number(/\[f(\d+)\]/i.exec(name)[1]) : 3), isBigCharacter: () => false };
    global.rrEscapeHtml = v => String(v);
    try {
        const EventPageEditor = require('../src/event/EventPageEditor.js');
        const controls = { '.image-turn-mirror': { checked: true }, '.image-turn-flip': { checked: false }, '.image-turn-angle': { value: '90' } };
        const canvas = { style: {} };
        const section = { querySelector: sel => sel === '.character-preview-canvas' ? canvas : sel === '.image-turn-row' ? {} : controls[sel] };
        const pg = { image: { characterName: 'Actor1', characterIndex: 2, direction: 4, pattern: 1 } };
        EventPageEditor.readImageTurn(pg, section);
        assert.deepEqual(pg.rrImage, { mirror: true, angle: 90, pivot: 'center' });
        assert.equal(canvas.style.transform, 'rotate(90deg) scale(-1, 1)', 'the preview turns at once');
        controls['.image-turn-mirror'].checked = false; controls['.image-turn-angle'].value = '0';
        EventPageEditor.readImageTurn(pg, section);
        assert.equal('rrImage' in pg, false, 'all off: plain MZ data again');
        assert.equal(canvas.style.transform, '');
        // The rows: Direction and Pattern dropdowns (0-2, or 0-N-1 for an [fN] sheet), Mirror, Flip, Rotation with its listed angles.
        const editor = Object.create(EventPageEditor.prototype);
        editor._t = k => k;
        const html = editor.imageTurnRow(pg, 0, 'Left');
        assert.match(html, /class="image-dir-select"/);
        assert.match(html, /<option value="4" selected>Left<\/option>/);
        assert.equal((html.match(/image-pattern-select[\s\S]*?<\/select>/)[0].match(/<option/g) || []).length, 3);
        assert.match(html, /<option value="1" selected>2<\/option>/, 'Frame counts from 1; the stored pattern stays 0-based');
        // The usual angles in the theme's dropdown (a <datalist> was the browser's own, unthemed list), Custom for any other.
        for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) assert.match(html, new RegExp(`<option value="${a}"[^>]*>${a}°</option>`));
        assert.match(html, /class="image-turn-angle-pick"/);
        assert.match(html, /<option value="custom">Custom<\/option>/);
        assert.doesNotMatch(html, /<datalist/);
        const wide = editor.imageTurnRow({ image: { characterName: 'Walk[f8]', direction: 2, pattern: 0 } }, 0, 'Down');
        assert.equal((wide.match(/image-pattern-select[\s\S]*?<\/select>/)[0].match(/<option/g) || []).length, 8);
        assert.equal(editor.imageTurnRow({ image: { characterName: '', tileId: 0 } }, 0, 'Down'), '', 'no picture, no controls');
        assert.doesNotMatch(editor.imageTurnRow({ image: { characterName: '', tileId: 12 } }, 0, 'Down'), /image-dir-select/, 'a tile has no direction to pick');
    } finally {
        delete global.RRAssetFiles;
        delete global.rrEscapeHtml;
    }
});

// ---------------------------------------------------------------------------
// Database › Reactor Features: Sprite Transforms (spriteTransforms) off. The route steps and a
// page's Image options do nothing, as in MZ; the editor offers neither; what is stored stays.
// ---------------------------------------------------------------------------

const featuresSource = fs.readFileSync(path.join(repo, 'runtime', 'reactor_features.js'), 'utf8');

test('Sprite Transforms off: Mirror, Flip and Rotate steps and a page\'s Image options do nothing', () => {
    const turned = page({ rrImage: { mirror: true, flip: true, angle: 180 } });
    const w = followerWorld({ events: [event(1, 8, 8, { pages: [turned] }), event(2, 10, 8)], prepare: (map, ctx) => {
        vm.runInContext(featuresSource, ctx);
        ctx.$dataSystem.rrFeatures = { spriteTransforms: false };
    } });
    const straight = { mirror: false, flip: false, angle: 0, pivot: 'feet' };
    assert.deepEqual(turnOf(w.$gameMap.event(1)), straight, 'the page starts plain');
    runList(w, [setRoute(2, [step('mirroron', 1), step('flipon', 1), step('rotate', { n: 90, pivot: 'center' }), step('rotate', { n: 30, mode: 'by' })])], 2);
    assert.deepEqual(turnOf(w.$gameMap.event(2)), straight, 'the route steps are passed over');
    assert.ok(w.$gameMap.event(1).page().rrImage, 'the page keeps its Image options');
    // On again (the default): the same steps turn it.
    delete w.$dataSystem.rrFeatures;
    runList(w, [setRoute(2, [step('mirroron', 1), step('rotate', { n: 90, pivot: 'center' })])], 2);
    assert.deepEqual(turnOf(w.$gameMap.event(2)), { mirror: true, flip: false, angle: 90, pivot: 'center' });
});

test('Sprite Transforms off: the route editor offers no Rotate, Mirror, Flip or Reset Image, and the page editor no turn row', () => {
    const Features = require('../src/ReactorFeatures.js');
    const saved = global.window;
    global.window = { ReactorFeatures: Features };
    global.RRAssetFiles = { characterFrameCount: () => 3, isBigCharacter: () => false };
    global.rrEscapeHtml = v => String(v);
    try {
        let system = {};
        const routeEditor = Object.create(SetMovementRouteEditor.prototype);
        routeEditor.databaseManager = { getSystem: () => system };
        const ops = () => Object.values(routeEditor._buttonDefs()).flat().map(def => def.reactor)
            .filter(op => SetMovementRouteEditor.TRANSFORM_OPS.includes(op));
        assert.deepEqual(ops(), ['rotate', 'mirroron', 'mirroroff', 'flipon', 'flipoff', 'resetimage']);
        system = { rrFeatures: { spriteTransforms: false } };
        assert.deepEqual(ops(), []);
        assert.ok(routeEditor._buttonDefs().column3.some(def => def.code === 41), 'the MZ steps stay');

        const EventPageEditor = require('../src/event/EventPageEditor.js');
        const editor = Object.create(EventPageEditor.prototype);
        editor._t = k => k;
        editor.databaseManager = { getSystem: () => system };
        const pg = { image: { characterName: 'Actor1', direction: 2, pattern: 1 }, rrImage: { mirror: true } };
        const html = editor.imageTurnRow(pg, 0, 'Down');
        assert.match(html, /class="image-dir-select"/, 'Direction and Pattern are MZ\'s and stay');
        assert.doesNotMatch(html, /image-turn-mirror|image-turn-angle/);
        system = {};
        assert.match(editor.imageTurnRow(pg, 0, 'Down'), /class="image-turn-mirror"[^>]*checked/);
        // The preview turns only while the turn row is there.
        const canvas = { style: {} };
        EventPageEditor.turnPreview({ querySelector: sel => (sel === '.character-preview-canvas' ? canvas : null) }, pg);
        assert.equal(canvas.style.transform, '');
    } finally {
        if (saved === undefined) delete global.window; else global.window = saved;
        delete global.RRAssetFiles;
        delete global.rrEscapeHtml;
    }
});

test('every route dialog closes on Cancel and after OK', () => {
    const src = fs.readFileSync(path.join(repo, 'editor/src/event/commands/SetMovementRouteEditor.js'), 'utf8');
    assert.doesNotMatch(src, /cancelBtn\.addEventListener\('click', \(\) => \{\}\)/);
    for (const name of ['_dlgHeight', '_dlgRotate']) {
        const body = src.slice(src.indexOf(`    ${name}(existing, callback) {`), src.indexOf('\n    }\n', src.indexOf(`    ${name}(existing, callback) {`)));
        assert.match(body, /okBtn\.addEventListener\('click', \(\) => \{[\s\S]*callback\([\s\S]*this\._closeDialog\(\);[\s\S]*\}\);/, name);
        assert.match(body, /cancelBtn\.addEventListener\('click', \(\) => this\._closeDialog\(\)\)/, name);
    }
});
