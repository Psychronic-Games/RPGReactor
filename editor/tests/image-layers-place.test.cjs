'use strict';
// Image layers placed at a tile (fit "place", `at`: a placed 2D structure's pictures, docs/DESIGN-2D-STRUCTURES.md):
// the stored form, where the game draws one on a 2D map (scrolling, a looping map) and that a 3D map leaves it out,
// and where the editor draws it in "Save map as image". The other fits are tested in image-layers-runtime.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const modulePath = path.join(root, 'runtime', 'reactor_image_layers.js');
const source = fs.readFileSync(modulePath, 'utf8');
const L = require(modulePath);

test('fit "place" and its tile: normalized to whole tiles, written only for a placed picture, other fields kept', () => {
    assert.ok(L.FITS.includes('place'));
    assert.deepEqual(L.normalize({ name: 'Inn-below', layer: 'ground', fit: 'place', at: [3, 4] }).at, [3, 4]);
    assert.deepEqual(L.normalize({ name: 'Inn-below', fit: 'place' }).at, [0, 0], 'no tile given: the map\'s top left');
    assert.deepEqual(L.normalize({ name: 'Inn-below', fit: 'place', at: [2.7, '5'] }).at, [2, 5], 'whole tiles');
    assert.deepEqual(L.normalize({ name: 'Inn-below', fit: 'place', at: ['x', null] }).at, [0, 0]);
    assert.deepEqual(L.normalize({ name: 'Town', fit: 'map', at: [3, 4] }).at, [0, 0], 'a tile means nothing to a picture the size of the map');
    assert.equal(L.normalize({ name: 'Inn', layer: 'same', fit: 'place', at: [1, 1] }).fit, 'map', 'same as characters keeps forcing "map"');
    for (const layer of ['back', 'ground', 'over']) assert.equal(L.normalize({ name: 'Inn', layer, fit: 'place' }).fit, 'place', layer);

    const stored = { name: 'Inn-3f9a2c-below', layer: 'ground', fit: 'place', at: [3, 4], structure2d: 2 };
    assert.equal(JSON.stringify(L.write(L.normalize(stored))), JSON.stringify(stored), 'read back as it was written, its tag kept');
    assert.deepEqual(L.write({ name: 'Inn', layer: 'over', fit: 'place' }), { name: 'Inn', layer: 'over', fit: 'place', at: [0, 0] }, 'a placed picture always says where');
    assert.deepEqual(L.write({ name: 'Town', layer: 'ground', at: [3, 4] }), { name: 'Town', layer: 'ground' }, 'and no other picture does');
    assert.deepEqual(L.list({ rrImageLayers: [stored] })[0].structure2d, 2);
    assert.equal(L.drawnOn3D(L.normalize({ name: 'Inn', layer: 'over', fit: 'place' })), false, 'a 3D map draws it no more than a picture locked to the map');
    assert.equal(L.scrolls(L.normalize({ name: 'Inn', fit: 'place', drift: [5, 5] })), false);
    assert.match(source, /"place"  at its own size, its top-left corner on tile `at`/, 'the header lists it');
});

/** Just enough of the engine for the module's hooks: every picture loads at once at its given size. */
function makeGame({ layers, map: mapOptions = {}, sizes = {} }) {
    class Bitmap {
        static load(url) {
            const bitmap = new Bitmap();
            const name = decodeURIComponent(url).replace(/^img\/parallaxes\//, '').replace(/\.png$/, '');
            const size = sizes[name] || [96, 144];
            bitmap._image = { width: size[0], height: size[1] };
            bitmap._loadingState = 'loaded';
            return bitmap;
        }
        addLoadListener(listener) { listener(this); }
        isError() { return false; }
        destroy() { this.destroyed = true; }
        get width() { return this._image.width; }
        get height() { return this._image.height; }
    }
    Bitmap._loadWatchList = [];
    class Sprite {
        constructor() { this.x = 0; this.y = 0; this.visible = true; this.opacity = 255; this.scale = { x: 1, y: 1 }; }
        setFrame(x, y, width, height) { this.frame = [x, y, width, height]; }
        destroy() { this.destroyed = true; }
    }
    class TilingSprite extends Sprite { constructor() { super(); this.origin = { x: 0, y: 0 }; } move() {} }
    const tilemap = { children: [], addChild(child) { child.parent = this; this.children.push(child); return child; } };
    const map = Object.assign({ id: 3, width: 20, height: 15, displayX: 0, displayY: 0, loopX: false, loopY: false }, mapOptions);
    function Spriteset_Map() { this.x = 0; this.y = 0; this.scale = { x: 1, y: 1 }; this._baseSprite = { x: 0, y: 0, scale: { x: 1, y: 1 } }; this.createTilemap(); }
    Spriteset_Map.prototype.createTilemap = function() { this._tilemap = tilemap; };
    Spriteset_Map.prototype.update = function() {};
    Spriteset_Map.prototype.destroy = function() {};
    function Game_Map() {}
    Object.assign(Game_Map.prototype, {
        mapId: () => map.id, tileWidth: () => 48, tileHeight: () => 48, width: () => map.width, height: () => map.height,
        displayX: () => map.displayX, displayY: () => map.displayY, isLoopHorizontal: () => map.loopX, isLoopVertical: () => map.loopY,
        requestRefresh() {}
    });
    const context = vm.createContext({
        console, Bitmap, Sprite, TilingSprite, Spriteset_Map, Game_Map,
        Utils: { encodeURI: text => encodeURIComponent(text).replace(/%2F/g, '/') },
        ImageManager: { _imageExtensions: ['.png'] },
        Graphics: { width: 816, height: 624 },
        $gameMap: new Game_Map(),
        $gameSwitches: { value: () => false },
        $gameVariables: { value: () => 0 },
        $dataMap: { width: map.width, height: map.height, rrImageLayers: layers }
    });
    vm.runInContext(source, context);
    const spriteset = new context.Spriteset_Map();
    return { map, spriteset, tilemap, layers: () => spriteset._rrImageLayers.layers, update() { spriteset.update(); } };
}

test('on a 2D map a placed picture lies at its own size with its top-left corner on its tile, and moves with the map', () => {
    const game = makeGame({ layers: [
        { name: 'Inn-below', layer: 'ground', fit: 'place', at: [3, 4], structure2d: 1 },
        { name: 'Inn-over', layer: 'over', fit: 'place', at: [3, 4], structure2d: 1 },
        { name: 'Town', layer: 'ground' }
    ] });
    game.update();
    const [below, over, town] = game.layers();
    assert.deepEqual([below.kind, over.kind, town.kind], ['map', 'map', 'map'], 'one sprite each, as a picture locked to the map');
    assert.deepEqual([below.sprite.x, below.sprite.y], [3 * 48, 4 * 48]);
    assert.deepEqual([over.sprite.x, over.sprite.y], [3 * 48, 4 * 48]);
    assert.deepEqual([town.sprite.x, town.sprite.y], [0, 0]);
    assert.equal(below.sprite.visible, true);
    assert.deepEqual([below.sprite.scale.x, below.sprite.scale.y], [1, 1], 'its own size');
    assert.ok(below.sprite.z < over.sprite.z, 'below the characters and above them');
    // The map scrolls: the picture keeps to its tile, on the tiles' own whole pixels.
    game.map.displayX = 2.5;
    game.map.displayY = 1 / 3;
    game.update();
    assert.deepEqual([below.sprite.x, below.sprite.y], [3 * 48 - 120, 4 * 48 - 16]);
    assert.deepEqual([town.sprite.x, town.sprite.y], [-120, -16]);
});

test('on a looping map a placed picture is drawn once per lap, each at its tile in that lap', () => {
    const game = makeGame({ map: { loopX: true, width: 20, height: 15 }, layers: [{ name: 'Inn-below', layer: 'ground', fit: 'place', at: [18, 2] }] });
    game.map.displayX = 19;
    game.update();
    const [layer] = game.layers();
    assert.equal(layer.kind, 'laps');
    const span = 20 * 48;
    const xs = layer.copies.map(copy => copy.x);
    // Lap after lap the picture's left lies at its tile less the scroll, a lap apart.
    for (const x of xs) assert.equal(((x - (18 * 48 - 19 * 48)) % span + span) % span, 0, `x ${x} is the tile's place in some lap`);
    assert.ok(xs.some(x => x === -48), 'the copy in view, a tile left of the screen\'s edge');
    assert.ok(xs.some(x => x === -48 + span) || xs.some(x => x === -48 - span));
    assert.ok(layer.copies.every(copy => copy.y === 2 * 48), 'it does not loop down: it lies on its row');
});

test('a map shown in 3D draws no placed picture, as it draws no picture locked to the map', () => {
    const game = makeGame({ layers: [{ name: 'Inn-over', layer: 'over', fit: 'place', at: [3, 4] }] });
    game.spriteset._reactor3d = {};
    game.update();
    const [layer] = game.layers();
    assert.equal(layer.drawn, false);
    assert.equal(layer.sprite.visible, false, 'its sprite (made while the map was flat) is hidden');
});

test('Save map as image draws a placed picture with its top-left corner on its tile', async () => {
    global.ReactorImageLayers = L;
    global.RRMapImageLayers = require('../src/MapImageLayersEditor.js');
    const Manager = require('../src/MapImageLayersManager.js');
    const manager = new Manager(null, null);
    manager.ensureRuntime = async () => true;
    manager.is3DMap = () => false;
    manager._image = async name => ({ name, naturalWidth: 96, naturalHeight: 144 });
    const calls = [];
    const ctx = { save() {}, restore() {}, drawImage(image, ...at) { calls.push([image.name, ...at]); } };
    const map = { width: 20, height: 15, rrImageLayers: [
        { name: 'Inn-below', layer: 'ground', fit: 'place', at: [3, 4], structure2d: 1 },
        { name: 'Town', layer: 'ground' },
        { name: 'Inn-over', layer: 'over', fit: 'place', at: [3, 4], structure2d: 1 }
    ] };
    assert.equal(await manager.drawToCanvas(ctx, map, 'ground'), 2);
    assert.deepEqual(calls, [['Inn-below', 144, 192], ['Town', 0, 0]]);
    calls.length = 0;
    await manager.drawToCanvas(ctx, map, 'over');
    assert.deepEqual(calls, [['Inn-over', 144, 192]]);
    // The flat view puts its sprite at the same place, and follows the tile when the layer is made again elsewhere.
    const node = { destroyed: false, position: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } } };
    manager._placeAt(node, L.normalize(map.rrImageLayers[0]));
    assert.deepEqual([node.position.x, node.position.y], [144, 192]);
    manager._placeAt(node, L.normalize({ name: 'Inn-below', fit: 'place', at: [5, 1] }));
    assert.deepEqual([node.position.x, node.position.y], [240, 48]);
});
