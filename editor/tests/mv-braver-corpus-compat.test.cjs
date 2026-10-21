const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
const objects = runtimeSource('reactor_objects.js');
const pixiCompat = fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

function slice(name) {
    const start = compat.indexOf(`    function ${name}() {`);
    const end = compat.indexOf('\n    function ', start + 1);
    assert.ok(start >= 0 && end > start, `${name} is locatable`);
    return compat.slice(start, end);
}

test('an MV plugin that replaces the local-file save functions gets the MV contract behind saveObject and loadObject', async () => {
    const original = { saveToLocalFile() {}, loadFromLocalFile() {}, localFileExists() {}, removeLocalFile() {} };
    const written = {};
    const SM = Object.assign({
        isLocalMode: () => true,
        objectToJson: object => Promise.resolve(JSON.stringify(object)),
        jsonToObject: json => Promise.resolve(JSON.parse(json)),
        zipToJson: zip => Promise.resolve(zip.replace('zip:', '')),
        saveObject() { throw new Error('MZ path'); }, loadObject() { throw new Error('MZ path'); },
        exists() { return 'mz'; }, remove() { return 'mz'; }
    }, original);
    SM.__mvStorageOriginals = { ...original };
    const context = { global: { StorageManager: SM }, StorageManager: SM, mvGameSemantics: true, Promise, JSON, Error, Number, String };
    // The plugin's MV-style replacements: ids, JSON strings, synchronous.
    SM.saveToLocalFile = (id, json) => { written[id] = json; };
    SM.loadFromLocalFile = id => written[id];
    SM.localFileExists = id => id in written;
    SM.removeLocalFile = id => { delete written[id]; };
    vm.runInNewContext(slice('installFinalStorageBridge') + '\ninstallFinalStorageBridge();', context);
    await SM.saveObject('file3', { hp: 10 });
    assert.deepEqual(Object.keys(written), ['3'], 'file3 is MV save id 3');
    await SM.saveObject('global', [null, { title: 'x' }]);
    assert.ok('0' in written, 'global is id 0');
    await SM.saveObject('file0', { autosave: true });
    assert.ok('autosave' in written, "MZ's autosave slot never lands on MV's global index");
    assert.equal(written['0'], JSON.stringify([null, { title: 'x' }]), 'the global index is intact');
    assert.deepEqual(await SM.loadObject('file3'), { hp: 10 });
    assert.equal(SM.exists('file3'), true);
    assert.equal(SM.exists('file9'), false);
    await assert.rejects(SM.loadObject('file9'), /Savefile not found/);
    SM.remove('file3');
    assert.equal(SM.exists('file3'), false);
    SM.isLocalMode = () => false;
    assert.equal(SM.exists('file3'), 'mz', 'off local mode the MZ path is untouched');
});

test('the storage bridge stays out of an MZ game and out of a game whose plugins left the functions alone', () => {
    const make = (mv, replace) => {
        const original = { saveToLocalFile() {}, loadFromLocalFile() {}, localFileExists() {}, removeLocalFile() {} };
        const SM = Object.assign({ isLocalMode: () => true, saveObject: 'mz-save', loadObject: 'mz-load' }, original);
        SM.__mvStorageOriginals = { ...original };
        if (replace) SM.loadFromLocalFile = () => 'json';
        vm.runInNewContext(slice('installFinalStorageBridge') + '\ninstallFinalStorageBridge();', { global: { StorageManager: SM }, StorageManager: SM, mvGameSemantics: mv, Promise, Error });
        return SM;
    };
    assert.equal(make(false, true).loadObject, 'mz-load', 'MZ-authored: untouched');
    assert.equal(make(true, false).loadObject, 'mz-load', 'nothing replaced: untouched');
    assert.notEqual(make(true, true).loadObject, 'mz-load', 'MV with a replacement: bridged');
});

test("MV's double-underscore Bitmap fields and the engine's single-underscore ones are one storage", () => {
    function Bitmap() {}
    let created = 0;
    Bitmap.prototype._createBaseTexture = function(source) { created++; this._baseTexture = { source, update() {} }; };
    vm.runInNewContext(slice('installBitmapBackingFieldCompatibility') + '\ninstallBitmapBackingFieldCompatibility();', { global: { Bitmap }, Bitmap, Object });
    const bitmap = new Bitmap();
    assert.equal(bitmap._canvas, null, 'reads as null before anything exists');
    // The MV plugin's _createCanvas writes the MV names...
    bitmap.__canvas = { width: 4, height: 4 };
    bitmap.__context = { save() {} };
    assert.equal(bitmap._canvas, bitmap.__canvas, '...and the engine sees them');
    assert.equal(bitmap._context, bitmap.__context);
    // ...and the base texture appears on first read, from the canvas, as MV did.
    assert.equal(created, 0);
    assert.equal(bitmap._baseTexture.source, bitmap.__canvas);
    assert.equal(created, 1);
    assert.equal(bitmap._baseTexture, bitmap.__baseTexture, 'made once');
    // The engine's own assignments land in the same place.
    const canvas = { width: 8 };
    bitmap._canvas = canvas;
    assert.equal(bitmap.__canvas, canvas);
    let dirtied = 0;
    bitmap.__baseTexture = { update() { dirtied++; } };
    bitmap._setDirty();
    assert.equal(dirtied, 1);
});

test("MV's frame clock exists, and the synch-off frame path still counts frames and runs effects", () => {
    const SceneManager = { updateFrameCount() { this.frames = (this.frames || 0) + 1; }, updateEffekseer() { this.fx = (this.fx || 0) + 1; }, updateMainNoFpsSynch() { this.ran = (this.ran || 0) + 1; } };
    vm.runInNewContext(slice('installFinalFrameLoopCompatibility') + '\ninstallFinalFrameLoopCompatibility();', { global: { SceneManager }, SceneManager });
    SceneManager.updateMainNoFpsSynch();
    assert.deepEqual([SceneManager.frames, SceneManager.fx, SceneManager.ran], [1, 1, 1]);
    assert.match(compat, /def\(SceneManager, "_getTimeInMsWithoutMobileSafari", function\(\) \{\n\s*return performance\.now\(\);/);
    assert.match(compat, /SceneManager\._deltaTime = 1\.0 \/ 60\.0;/);
});

test('the inert stand-in message sub-window never reaches the scene tree', () => {
    assert.match(compat, /\]\.filter\(window => window && typeof window\.emit === "function"\);/, 'subWindows filters to display objects');
    assert.match(compat, /if \(!window \|\| typeof window\.emit !== "function"\) return undefined;\n\s*return originalAddWindow\.call\(this, window\);/, 'addWindow refuses a non-display object');
});

test('createPictures borrowed onto a scene finds pictureContainerRect', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    function Spriteset_Base() {}
    Spriteset_Base.prototype.pictureContainerRect = () => rect;
    Spriteset_Base.prototype.createPictures = function() { return this.pictureContainerRect(); };
    vm.runInNewContext(slice('installPictureContainerCompatibility') + '\ninstallPictureContainerCompatibility();', { global: { Spriteset_Base }, Spriteset_Base });
    const scene = { createPicturesForCameraCore: Spriteset_Base.prototype.createPictures };
    assert.equal(scene.createPicturesForCameraCore(), rect, 'the scene got the helper lent to it');
    assert.equal(new Spriteset_Base().createPictures(), rect, 'a real spriteset is unchanged');
});

test('Bitmap.bltImage draws from a source bitmap image or canvas and uploads once', () => {
    const start = compat.indexOf('            def(Bitmap.prototype, "bltImage"');
    const end = compat.indexOf('            def(Bitmap.prototype, "_setDirty"', start);
    assert.ok(start >= 0 && end > start);
    const Bitmap = function() {};
    const drawn = [];
    let uploads = 0;
    Object.defineProperty(Bitmap.prototype, 'context', { get() { return { drawImage(...args) { drawn.push(args); } }; } });
    Bitmap.prototype._baseTexture = { update() { uploads++; } };
    vm.runInNewContext(compat.slice(start, end), { Bitmap, def: (o, n, f) => { o[n] = f; } });
    const target = new Bitmap();
    target.bltImage({ _image: 'img' }, 0, 0, 16, 16, 4, 4);
    assert.deepEqual(drawn[0], ['img', 0, 0, 16, 16, 4, 4, 16, 16], 'dw/dh default to the source size');
    target.bltImage({ canvas: 'cv' }, 0, 0, 8, 8, 0, 0, 2, 2);
    assert.equal(drawn[1][0], 'cv', 'a bitmap with no image left draws its canvas');
    target.bltImage({ _image: 'img' }, -1, 0, 8, 8, 0, 0);
    assert.equal(drawn.length, 2, 'a bad rectangle draws nothing');
    assert.equal(uploads, 2);
});

test('window opacity and font size fall back when the advanced block lacks them', () => {
    const grab = name => { const s = objects.indexOf(`Game_System.prototype.${name} = function`); return objects.slice(s, objects.indexOf('\n};', s) + 3); };
    const run = (advanced, name) => vm.runInNewContext(grab(name) + `\nGame_System.prototype.${name}.call({});`, { Game_System: { prototype: {} }, $dataSystem: { advanced } });
    assert.equal(run({}, 'windowOpacity'), 192);
    assert.equal(run({ windowOpacity: 0 }, 'windowOpacity'), 0, 'an authored zero is honoured');
    assert.equal(run({}, 'mainFontSize'), 26);
    assert.equal(run({ fontSize: 20 }, 'mainFontSize'), 20);
    assert.match(compat, /return Number\.isFinite\(value\) \? value : 192;/, 'the MV standardBackOpacity fallback');
});

test('the exported PIXI base classes are callable the ES5 way and still construct and subclass', () => {
    const start = pixiCompat.indexOf('    (function makePixiBaseClassesCallable() {');
    const end = pixiCompat.indexOf('    })();', start) + '    })();'.length;
    assert.ok(start >= 0 && end > start);
    class Container { constructor(tag) { this.tag = tag; this.built = true; } static stat() { return 'static'; } }
    class Sprite extends Container {}
    const PIXI = { Container, Sprite, Graphics: function OldStyle() { this.old = true; } };
    const supered = [];
    vm.runInNewContext(pixiCompat.slice(start, end), { PIXI, window: { PIXISuper: (Real, instance, args) => { supered.push([Real, instance, args]); instance.viaSuper = true; return instance; } }, Reflect, Function, Object, Array, compatLog() {} });
    assert.notEqual(PIXI.Container, Container, 'wrapped');
    assert.equal(PIXI.Graphics.old, undefined);
    assert.equal(PIXI.Graphics.name, 'OldStyle', 'an ES5 function is left alone');
    assert.equal(PIXI.Container.prototype, Container.prototype, 'same prototype');
    assert.equal(PIXI.Container.stat(), 'static', 'statics reachable');
    const built = new PIXI.Container('a');
    assert.equal(built.built, true);
    assert.equal(built.tag, 'a');
    assert.ok(built instanceof PIXI.Container);
    class Sub extends PIXI.Sprite { constructor() { super('s'); this.sub = true; } }
    const sub = new Sub();
    assert.ok(sub.built && sub.sub && sub instanceof Sprite);
    // The MV way: prototype chain first, then the class called as a function.
    function Plugin() { PIXI.Container.call(this, 'p'); }
    Plugin.prototype = Object.create(PIXI.Container.prototype);
    const p = new Plugin();
    assert.equal(p.viaSuper, true, 'a plain call routes through PIXISuper');
    assert.equal(supered[0][0], Container, 'onto the real class');
    assert.deepEqual(supered[0][2], ['p']);
});

test('MV name-entry windows built with an actor and an edit window take MZ rects and are fed through setup', () => {
    const start = compat.indexOf('        if (global.Window_NameEdit && !Window_NameEdit.prototype.initialize.__mvCompatNameSig) {');
    const end = compat.indexOf('        if (global.Window_ShopNumber && !Window_ShopNumber.prototype.initialize.__mvCompatNameSig', start);
    const stop = compat.indexOf('        if (global.Window_ShopNumber', start);
    assert.ok(start >= 0 && stop > start);
    const calls = [];
    class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
    function Window_NameEdit() {}
    Window_NameEdit.prototype.initialize = function(rect) { calls.push(['edit', rect]); this.x = rect.x; this.y = rect.y; this.width = rect.width; this.height = rect.height; this._name = ''; };
    Window_NameEdit.prototype.fittingHeight = n => 36 * n + 24;
    Window_NameEdit.prototype.setup = function(actor, max) { calls.push(['setup', actor.id, max]); };
    Window_NameEdit.prototype.refresh = function() { calls.push(['refresh']); };
    function Window_NameInput() {}
    Window_NameInput.prototype.initialize = function(rect) { calls.push(['input', rect]); };
    Window_NameInput.prototype.fittingHeight = n => 36 * n + 24;
    Window_NameInput.prototype.setEditWindow = function(w) { calls.push(['setEditWindow', w === edit]); };
    const isRectangle = v => v instanceof Rectangle;
    vm.runInNewContext(compat.slice(start, stop), { global: { Window_NameEdit, Window_NameInput }, Window_NameEdit, Window_NameInput, Rectangle, isRectangle, Graphics: { boxWidth: 816, boxHeight: 624 }, Math, Number, def: (o, n, f) => { if (!o[n]) o[n] = f; } });
    const edit = new Window_NameEdit();
    edit.initialize({ id: 3, faceName: () => 'Actor1' }, 8);
    const plain = v => JSON.parse(JSON.stringify(v));
    assert.deepEqual(plain(calls[0][1]), { x: 168, y: 50, width: 480, height: 168 }, "MV's own geometry: centred, above a 9-row input");
    assert.deepEqual(calls.slice(1), [['setup', 3, 8], ['refresh']]);
    const input = new Window_NameInput();
    input.initialize(edit);
    assert.deepEqual(plain(calls[3][1]), { x: 168, y: 50 + 168 + 8, width: 480, height: 348 });
    assert.deepEqual(calls[4], ['setEditWindow', true]);
    calls.length = 0;
    new Window_NameEdit().initialize(new Rectangle(1, 2, 3, 4));
    assert.equal(calls.length, 1, 'an MZ rect passes straight through');
});

test('a status window built MV-style gets its sprite registry on first use', () => {
    function Window_StatusBase() {}
    Window_StatusBase.prototype.hideAdditionalSprites = function() { return Object.values(this._additionalSprites).length; };
    Window_StatusBase.prototype.createInnerSprite = function(key) { this._additionalSprites[key] = { key }; return this._additionalSprites[key]; };
    vm.runInNewContext(slice('installStatusBaseRegistryCompatibility') + '\ninstallStatusBaseRegistryCompatibility();', { global: { Window_StatusBase }, Window_StatusBase, Object });
    const w = new Window_StatusBase();
    assert.equal(w.hideAdditionalSprites(), 0, 'no registry yet, no crash');
    assert.equal(w.createInnerSprite('hp').key, 'hp');
    assert.equal(w.hideAdditionalSprites(), 1);
});

test("PIXI v4's renderer.textureManager frees the GPU side of a texture and leaves the object alone", () => {
    const start = pixiCompat.indexOf('    (function installTextureManagerShim() {');
    const end = pixiCompat.indexOf('    })();', start) + '    })();'.length;
    assert.ok(start >= 0 && end > start);
    class WebGLRenderer {}
    const PIXI = { WebGLRenderer };
    vm.runInNewContext(pixiCompat.slice(start, end), { PIXI, Object });
    const renderer = new WebGLRenderer();
    const tm = renderer.textureManager;
    assert.equal(tm, renderer.textureManager, 'one per renderer');
    const source = { unloaded: 0, unload() { this.unloaded++; }, updated: 0, update() { this.updated++; } };
    const renderTexture = { source };
    tm.destroyTexture(renderTexture);
    assert.equal(source.unloaded, 1, 'v8: the source is unloaded, not destroyed');
    assert.equal(renderTexture.source, source, 'the texture still has its source');
    const base = { disposed: 0, dispose() { this.disposed++; } };
    tm.destroyTexture({ baseTexture: base });
    assert.equal(base.disposed, 1, 'v5-v7: the base texture is disposed');
    tm.updateTexture(renderTexture);
    assert.equal(source.updated, 1);
    tm.destroyTexture(null);
});

test("MZ's mutating traitObjects never reaches a cached states() array", () => {
    function Game_BattlerBase() {}
    const cached = [{ id: 40 }];
    Game_BattlerBase.prototype.states = function() { return cached; };
    Game_BattlerBase.prototype.traitObjects = function() { return this.states(); };
    function Game_Actor() {}
    Game_Actor.prototype = Object.create(Game_BattlerBase.prototype);
    Game_Actor.prototype.traitObjects = function() { const objects = Game_BattlerBase.prototype.traitObjects.call(this); objects.push({ actor: true }, { cls: true }); return objects; };
    vm.runInNewContext(slice('installTraitObjectsCopyCompatibility') + '\ninstallTraitObjectsCopyCompatibility();', { global: { Game_BattlerBase }, Game_BattlerBase, Array });
    const actor = new Game_Actor();
    assert.equal(actor.traitObjects().length, 3, 'the actor still sees its records');
    assert.equal(actor.traitObjects().length, 3, 'and does not accumulate');
    assert.deepEqual(actor.states(), [{ id: 40 }], 'the cached states array is untouched');
});

test('the MV APIs the audit found are supplied: video volume, fade sprite, contents area, slot name, log rect, canvas-to-local', () => {
    const start = compat.indexOf('        // ---- MV APIs the plugin-compat-audit found');
    const end = compat.indexOf('        // ---- end audit gap-fills ----', start);
    assert.ok(start >= 0 && end > start);
    const volumes = [];
    function ScreenSprite() { this.color = null; }
    ScreenSprite.prototype.setWhite = function() { this.color = 'white'; };
    ScreenSprite.prototype.setBlack = function() { this.color = 'black'; };
    const mk = () => function() {};
    const Scene_Base = mk(), Window_Selectable = mk(), Window_EquipSlot = mk(), Window_BattleLog = mk(), Sprite_Button = mk();
    const Graphics = {};
    const Decrypter = {};
    const ctx = { Decrypter, global: { Decrypter, $dataSystem: { hasEncryptedAudio: true }, Graphics, Video: { setVolume: v => volumes.push(v) }, Scene_Base, ScreenSprite, Window_Selectable, Window_EquipSlot, Window_BattleLog, Sprite_Button }, Graphics, Video: { setVolume: v => volumes.push(v) }, Scene_Base, ScreenSprite, Window_Selectable, Window_EquipSlot, Window_BattleLog, Sprite_Button, Rectangle: function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); }, $dataSystem: { equipTypes: ['', 'Weapon', 'Shield'] }, def: (o, n, f) => { if (!o[n]) o[n] = f; } };
    vm.runInNewContext(compat.slice(start, end), ctx);
    Graphics.setVideoVolume(0.4);
    assert.deepEqual(volumes, [0.4]);
    const scene = new Scene_Base(); scene.addChild = c => { scene.child = c; };
    scene.createFadeSprite(true);
    assert.equal(scene._fadeWhite, 1, 'the fade sprite tints the colour filter');
    assert.equal(scene.child, undefined, 'and is never on the display list');
    const win = new Window_Selectable(); Object.assign(win, { padding: 12, width: 100, height: 60 });
    assert.equal(win.isContentsArea(12, 12), true);
    assert.equal(win.isContentsArea(5, 30), false);
    assert.equal(win.isContentsArea(88, 30), false);
    const slot = new Window_EquipSlot(); slot._actor = { equipSlots: () => [1, 2] };
    assert.equal(slot.slotName(1), 'Shield', 'falls back to the equip type table');
    slot.actorSlotName = (actor, i) => 'named ' + i;
    assert.equal(slot.slotName(0), 'named 0', 'MZ actorSlotName wins when present');
    const log = new Window_BattleLog(); log.lineRect = i => ({ line: i });
    assert.deepEqual(log.itemRectForText(3), { line: 3 });
    const button = new Sprite_Button(); button.x = 10; button.y = 20; button.parent = { x: 5, y: 7, parent: null };
    assert.equal(button.canvasToLocalX(100), 85);
    assert.equal(button.canvasToLocalY(100), 73);
    ctx.global.$dataSystem = { hasEncryptedAudio: true };
    assert.equal(Decrypter.hasEncryptedAudio, true, 'MV flag reads the system data');
    assert.equal(Decrypter.hasEncryptedImages, false);
});

test("a scene's _fadeSprite is MV's handle on the fade, backed by MZ's colour filter", () => {
    const start = compat.indexOf('        // ---- MV APIs the plugin-compat-audit found');
    const end = compat.indexOf('        // ---- end audit gap-fills ----', start);
    function ScreenSprite() { this.alpha = 0; }
    ScreenSprite.prototype.setWhite = function() { this.tint = 'white'; };
    ScreenSprite.prototype.setBlack = function() { this.tint = 'black'; };
    function Scene_Base() { this._fadeOpacity = 0; this._fadeWhite = 0; this._colorFilter = {}; this.blends = []; }
    Scene_Base.prototype.updateColorFilter = function() { this.blends.push([this._fadeWhite, this._fadeOpacity]); };
    Scene_Base.prototype.startFadeIn = function(duration, white) { this._fadeWhite = white ? 1 : 0; this._fadeOpacity = 255; this.updateColorFilter(); };
    Scene_Base.prototype.startFadeOut = function(duration, white) { this._fadeWhite = white ? 1 : 0; this._fadeOpacity = 0; this.updateColorFilter(); };
    const mk = () => function() {};
    const ctx = { global: { Scene_Base, ScreenSprite }, Scene_Base, ScreenSprite, Window_Selectable: mk(), Window_EquipSlot: mk(), Window_BattleLog: mk(), Sprite_Button: mk(), Graphics: {}, Rectangle: mk(), $dataSystem: {}, def: (o, n, f) => { if (!o[n]) o[n] = f; } };
    vm.runInNewContext(compat.slice(start, end), ctx);

    // SRD_GameOverCore: `this._fadeSprite.opacity === 0` once the fade-in lands.
    const gameover = new Scene_Base();
    gameover.startFadeIn(24, false);
    assert.equal(gameover._fadeSprite.opacity, 255, 'reads the filter fade at its start');
    gameover._fadeOpacity = 0;
    assert.equal(gameover._fadeSprite.opacity, 0, 'and its end');
    assert.equal(gameover._fadeSprite, gameover._fadeSprite, 'one sprite per scene');
    assert.equal(gameover._fadeSprite.alpha, 0, 'the sprite itself never darkens anything');

    // BraverAutosave: force 255 under a notice, then fadeInForTransfer lifts it.
    const map = new Scene_Base();
    map.createFadeSprite(false);
    map._fadeSprite.opacity = 255;
    assert.equal(map._fadeOpacity, 255, 'a write lands on the filter');
    assert.deepEqual(map.blends.at(-1), [0, 255], 'and refreshes it');
    map.startFadeIn(8, false);
    map._fadeOpacity = 0;
    assert.equal(map._fadeSprite.opacity, 0, 'the transfer fade-in brings it back down');
    map._fadeSprite.opacity = 999;
    assert.equal(map._fadeOpacity, 255, 'clamped like ScreenSprite');
    map._fadeSprite.setWhite();
    assert.equal(map._fadeWhite, 1, 'the tint goes to the filter too');

    // An MV-bodied initialize nulls it; the next fade makes it again.
    const nulled = new Scene_Base();
    nulled._fadeSprite = null;
    assert.equal(nulled._fadeSprite, null, 'an assignment is kept');
    nulled.startFadeOut(8, true);
    assert.ok(nulled._fadeSprite, 'startFadeOut recreates it as MV did');
    assert.equal(nulled._fadeWhite, 1);
    const own = { opacity: 7 };
    nulled._fadeSprite = own;
    assert.equal(nulled._fadeSprite, own, "a plugin's own sprite is kept as assigned");
});

test('an MV front-view battle still gets its hidden actor sprites, as MV made them', () => {
    function Spriteset_Battle() { this._battleField = { children: [], addChild(c) { this.children.push(c); } }; }
    Spriteset_Battle.prototype.createActors = function() { this._actorSprites = []; if (this.sideView) this._actorSprites.push('side'); };
    function Sprite_Actor() {}
    const run = sideView => {
        const ctx = { global: { Spriteset_Battle, Sprite_Actor, $gameSystem: { isSideView: () => sideView }, $gameParty: { maxBattleMembers: () => 4 } }, Spriteset_Battle, Sprite_Actor, Array, $gameSystem: { isSideView: () => sideView }, $gameParty: { maxBattleMembers: () => 4 } };
        vm.runInNewContext(slice('installFrontViewActorSpritesCompatibility') + '\ninstallFrontViewActorSpritesCompatibility();', ctx);
        const set = new Spriteset_Battle(); set.sideView = sideView; set.createActors(); return set;
    };
    const front = run(false);
    assert.equal(front._actorSprites.length, 4, 'one per possible battle member');
    assert.ok(front._actorSprites.every(s => s instanceof Sprite_Actor));
    assert.equal(front._battleField.children.length, 4, 'in the battle field, where the spriteset finds them');
    delete Spriteset_Battle.prototype.createActors.__mvFrontView;
    const side = run(true);
    assert.deepEqual(side._actorSprites, ['side'], 'side view is untouched');
});

test("an MV battle spriteset assigns its battlers in the constructor, so actor.battler() answers before windows exist", () => {
    const calls = [];
    function Spriteset_Battle() { this.initialize(); }
    Spriteset_Battle.prototype.initialize = function() { calls.push('init'); };
    Spriteset_Battle.prototype.updateActors = function() { calls.push('actors'); };
    Spriteset_Battle.prototype.updateEnemies = function() { calls.push('enemies'); throw new Error('not ready'); };
    vm.runInNewContext(slice('installBattleSpritesetFirstUpdateCompatibility') + '\ninstallBattleSpritesetFirstUpdateCompatibility();', { global: { Spriteset_Battle }, Spriteset_Battle, console: { warn() {} } });
    new Spriteset_Battle();
    assert.deepEqual(calls, ['init', 'actors', 'enemies'], 'both run once, and a failure is contained');
});

test("an MV game's BattleManager reports inputting from its phase, as MV did", () => {
    const BattleManager = { _phase: 'ctb', _inputting: false, isInputting() { return this._inputting; } };
    vm.runInNewContext(slice('installInputPhaseCompatibility') + '\ninstallInputPhaseCompatibility();', { global: { BattleManager }, BattleManager });
    assert.equal(BattleManager.isInputting(), false);
    BattleManager._phase = 'input';
    assert.equal(BattleManager.isInputting(), true, "a battle system that only sets the phase is seen");
    BattleManager._phase = 'turn'; BattleManager._inputting = true;
    assert.equal(BattleManager.isInputting(), false, 'and a stale MZ flag does not keep windows open');
});

test('numeric blend modes: a v4-style registration reaches v8 as a named mode on sprites and filters', () => {
    const start = pixiCompat.indexOf('    (function installNumericBlendModes() {');
    const end = pixiCompat.indexOf('    })();', start) + '    })();'.length;
    assert.ok(start >= 0 && end > start);
    class Container { get blendMode() { return this._b; } set blendMode(v) { this._b = v; } }
    class Filter {}
    class GlStateSystem {}
    const PIXI = { Container, Filter, GlStateSystem };
    vm.runInNewContext(pixiCompat.slice(start, end), { PIXI, _isV8Pixi: true, Object, Proxy, Number, String, Array, Set });
    const state = new GlStateSystem();
    state.blendModes[31] = [770, 1];       // SRC_ALPHA, ONE
    state.blendModes[32] = [0, 768];       // ZERO, SRC_COLOR
    assert.ok(PIXI.__reactorOpaqueBlendIds.has(32), 'a pure multiply pair is remembered as opaque');
    assert.ok(!PIXI.__reactorOpaqueBlendIds.has(31));
    const sprite = new Container();
    sprite.blendMode = 31; assert.equal(sprite.blendMode, 'add');
    sprite.blendMode = 32; assert.equal(sprite.blendMode, 'multiply');
    sprite.blendMode = 1; assert.equal(sprite.blendMode, 'add', 'the legacy MV/MZ numbers still map');
    sprite.blendMode = 99; assert.equal(sprite.blendMode, 'normal', 'an unknown number falls back to normal');
    sprite.blendMode = 'screen'; assert.equal(sprite.blendMode, 'screen', 'strings pass through');
    const filter = new Filter();
    assert.equal(filter.blendMode, 'normal');
    filter.blendMode = 32; assert.equal(filter.blendMode, 'multiply');
    PIXI.registerReactorBlendMode(40, 'screen');
    sprite.blendMode = 40; assert.equal(sprite.blendMode, 'screen');
    // PIXI 8.20's Filter has an accessor of its own that takes names only: numbers are translated before it.
    class Filter820 { get blendMode() { return this._state; } set blendMode(v) { this._state = v; } }
    const PIXI2 = { Container: class { get blendMode() { return this._b; } set blendMode(v) { this._b = v; } }, Filter: Filter820, GlStateSystem: class {} };
    vm.runInNewContext(pixiCompat.slice(start, end), { PIXI: PIXI2, _isV8Pixi: true, Object, Proxy, Number, String, Array, Set });
    const tinted = new Filter820();
    tinted.blendMode = 1; assert.equal(tinted.blendMode, 'add', 'an additive light drawn through a filter stays additive');
    tinted.blendMode = 'multiply'; assert.equal(tinted.blendMode, 'multiply');
});

test('plugins\' ES6 classes are left out of the PIXI class upgrade, and a screen tint clamps before premultiplying', () => {
    const at = pixiCompat.indexOf('// An ES6 class (a plugin\'s `class X extends Sprite`)');
    assert.ok(at > 0 && /continue;/.test(pixiCompat.slice(at, at + 400)), 'skipped: wrapping would call it without new');
    const isClass = (f) => /^class\b/.test(Function.prototype.toString.call(f));
    assert.equal(isClass(class Sprite_X {}), true);
    assert.equal(isClass(function Sprite_Y() {}), false);
    const display = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_core_display.js'), 'utf8');
    for (const c of ['r', 'g', 'b']) assert.ok(display.includes(`"  ${c} = a > 0.0 ? clamp(${c} / a + ${c}2, 0.0, 1.0) * a : 0.0;"`), `${c}: clamped straight, then premultiplied`);
});

test("MV's Graphics._createRenderer hook gets a base and runs once after the PIXI app exists", async () => {
    const calls = [];
    const Graphics = { _createPixiApp() { this._renderer = {}; return Promise.resolve('app'); } };
    vm.runInNewContext(slice('installGraphicsCompatibility') + '\ninstallGraphicsCompatibility();', { global: { Graphics }, Graphics, console: { warn: m => calls.push('warn') }, Promise });
    assert.equal(typeof Graphics._createRenderer, 'function', 'a base to chain onto');
    const base = Graphics._createRenderer;
    Graphics._createRenderer = function() { base.call(this); calls.push('plugin hook'); };
    assert.equal(await Graphics._createPixiApp(), 'app');
    await Graphics._createPixiApp();
    assert.deepEqual(calls, ['plugin hook'], 'once, after creation');
});

test("a plugin-owned name box keeps its own open/close lifecycle instead of following the message window", () => {
    const start = compat.indexOf('                Window_Message.prototype.synchronizeNameBox = function() {');
    const end = compat.indexOf('Window_Message.prototype.synchronizeNameBox.__mvCompatWrapped = true;', start);
    assert.ok(start >= 0 && end > start);
    const body = compat.slice(start, end);
    assert.match(body, /if \(nameBox === this\._nameWindow\) return;/, "YEP_MessageCore's _nameWindow is left alone");
    assert.ok(body.indexOf('nameBox === this._nameWindow') < body.indexOf('nameBox.openness = this.openness'), 'the guard runs before the openness sync');
});

test("the MV compat filter bridge forces a v4 pure-multiply filter's output opaque and feeds numeric blends to the render state", () => {
    const start = compat.indexOf('            const constructCompatFilter = function(vertexSrc, fragmentSrc, uniforms, newTarget) {');
    const end = compat.indexOf('            const MVCompatFilter = function(vertexSrc, fragmentSrc, uniforms) {', start);
    assert.ok(start >= 0 && end > start);
    const body = compat.slice(start, end);
    assert.match(body, /fragmentSrc\.replace\(\/\\bvoid\\s\+main[\s\S]*"void rrCompatUserMain\(void\)"\)/, "the plugin's main becomes a helper");
    assert.match(body, /uniform float uReactorOpaque;[\s\S]*if \(uReactorOpaque > 0\.5\) finalColor\.a = 1\.0;/);
    assert.match(body, /Object\.defineProperty\(inst, "blendMode"[\s\S]*this\._state\.blendMode = name;[\s\S]*__reactorOpaqueBlendIds\.has\(Number\(value\)\) \? 1 : 0/);
    assert.doesNotMatch(pixiCompat, /installLegacyFilterBridge/, 'one bridge, in the MV compat layer');
});

test('a pre-built v8 instance still takes the super call arguments the legacy initialize passes', () => {
    const start = pixiCompat.indexOf('    window.PIXISuper = function(PixiClass, instance, args) {');
    const end = pixiCompat.indexOf('\n    };\n', start) + '\n    };\n'.length;
    class Sprite { set texture(t) { this._t = t; } get texture() { return this._t; } }
    class TilingSprite extends Sprite {}
    class Text {}
    const PIXI = { Sprite, TilingSprite, Text };
    const window = {};
    vm.runInNewContext(pixiCompat.slice(start, end), { window, PIXI, Reflect, Object, WeakSet, TypeError });
    const tex = { source: {} };
    const sprite = new Sprite(); sprite.__pixiInitialized = true;
    window.PIXISuper(Sprite, sprite, [tex]);
    assert.equal(sprite.texture, tex, 'the texture from PIXI.Sprite.call(this, texture)');
    const tiling = new TilingSprite(); tiling.__pixiInitialized = true;
    window.PIXISuper(TilingSprite, tiling, [tex, 40, 30]);
    assert.deepEqual([tiling.texture, tiling.width, tiling.height], [tex, 40, 30]);
});

test('an MV-style Sprite_Animation.setup with one target and an MV animation goes to the cell engine', () => {
    const start = compat.indexOf('        var originalSetup = P.setup;');
    const end = compat.indexOf('        P.setup.__mvCompatSetup = true;', start) + '        P.setup.__mvCompatSetup = true;'.length;
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const P = { setup(targets, animation) { calls.push(['mz', targets, animation && animation.effectName]); } };
    const MV = { setup(targets, animation, mirror, delay) { calls.push(['mv', targets, animation.frames.length, mirror, delay]); } };
    vm.runInNewContext(compat.slice(start, end), { P, MV, Array });
    const sprite = Object.create(P);
    const target = { name: 't' };
    sprite.setup(target, { frames: [[]], timings: [] }, false, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(plainArgs(calls[0]))), ['mv', [{ name: 't' }], 1, false, 3], 'MV data on the MV engine, target wrapped');
    assert.equal(calls[0][1][0], target);
    assert.equal(sprite._target, target, 'MV plugins read the singular');
    assert.deepEqual([...sprite._cellSprites], [], 'the cell engine has its list');
    sprite.setup([target], { effectName: 'fx', soundTimings: [], flashTimings: [] }, false, 0);
    assert.equal(calls[1][0], 'mz', 'MZ data on the Effekseer setup');
    function plainArgs(a) { return [a[0], a[1], a[2], a[3], a[4]]; }
});
