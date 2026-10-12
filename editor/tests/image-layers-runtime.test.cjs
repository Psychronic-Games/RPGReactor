'use strict';
// Map image layers in the game (runtime/reactor_image_layers.js): the stored form, the picture a variable
// chooses, conditions, where a layer is drawn on 2D and 3D maps, layers that repeat in one direction, the order
// of "same as characters" strips among the characters, the tiles solid paint blocks, and what the map loop does
// (and does not do) each frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const modulePath = path.join(root, 'runtime', 'reactor_image_layers.js');
const source = fs.readFileSync(modulePath, 'utf8');
const L = require(modulePath);

// ---------------------------------------------------------------------------------------------------------------
// A stand-in game: just enough of the engine for the module's hooks to run, with every object it could create counted.
// ---------------------------------------------------------------------------------------------------------------

/** A picture described by its alpha: `alphaAt(x, y)` for a picture of `width` x `height` pixels. */
const picture = (width, height, alphaAt) => ({ width, height, alphaAt });

function makeGame(options = {}) {
    const counts = { sprites: 0, tilings: 0, loads: 0, frames: 0, switchReads: 0, variableReads: 0, canvases: 0, moves: 0 };
    const loads = [];
    const draws = [];                    // every drawImage of a sampling canvas: where it put the picture, and whether it smoothed
    const files = options.files || {};   // name → picture, for loads that finish by themselves

    class Bitmap {
        static load(url) {
            const bitmap = new Bitmap();
            bitmap._url = url;
            bitmap._loadingState = 'loading';
            bitmap._listeners = [];
            counts.loads++;
            loads.push(bitmap);
            Bitmap._loadWatchList.push(bitmap);
            const name = decodeURIComponent(url).replace(/^img\/parallaxes\//, '').replace(/\.png$/, '');
            if (options.autoLoad !== false) {
                if (files[name]) bitmap.finish(files[name]); else bitmap.fail();
            }
            return bitmap;
        }
        finish(image) {
            this._image = image;
            this._loadingState = 'loaded';
            for (const listener of this._listeners.splice(0)) listener(this);
        }
        fail() { this._loadingState = 'error'; }
        /** What the engine does in a project that skips missing images: a blank bitmap, reported as loaded. */
        degrade() { this._degradedToBlank = true; this._loadingState = 'none'; for (const listener of this._listeners.splice(0)) listener(this); }
        addLoadListener(listener) { if (this._loadingState === 'loaded') listener(this); else this._listeners.push(listener); }
        isError() { return this._loadingState === 'error'; }
        destroy() { this.destroyed = true; }
        get width() { return this._image ? this._image.width : 0; }
        get height() { return this._image ? this._image.height : 0; }
    }
    Bitmap._loadWatchList = [];
    // The engine's watch over loading pictures. It runs about once a second whatever scene is up; a failed picture
    // it finds on its list is tried again and, after a few tries, reported.
    const retried = [];
    Bitmap._sweepStalledLoads = function() {
        for (const bitmap of Bitmap._loadWatchList) if (bitmap._loadingState === 'error') retried.push(bitmap._url);
    };

    class Sprite {
        constructor() { counts.sprites++; this.x = 0; this.y = 0; this.visible = true; this.opacity = 255; this.blendMode = 0; this.scale = { x: 1, y: 1 }; this.frame = null; this.spriteId = Sprite.next++; }
        set bitmap(value) { this._bitmap = value; }
        get bitmap() { return this._bitmap; }
        setFrame(x, y, width, height) { counts.frames++; this.frame = [x, y, width, height]; }
        destroy() { this.destroyed = true; }
    }
    Sprite.next = 1;
    class TilingSprite {
        constructor() { counts.tilings++; this.x = 0; this.y = 0; this.visible = true; this.opacity = 255; this.blendMode = 0; this.origin = { x: 0, y: 0 }; this.size = null; }
        set bitmap(value) { this._bitmap = value; }
        get bitmap() { return this._bitmap; }
        move(x, y, width, height) { counts.moves++; this.x = x; this.y = y; this.size = [width, height]; }
        destroy() { this.destroyed = true; }
    }

    const tilemap = {
        children: [],
        addChild(child) { child.parent = this; this.children.push(child); return child; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
    };
    function Spriteset_Map() { this.x = 0; this.y = 0; this.scale = { x: 1, y: 1 }; this._baseSprite = { x: 0, y: 0, scale: { x: 1, y: 1 } }; this._reactorBuiltForMapId = map.id; this.baseUpdates = 0; this.createTilemap(); }
    Spriteset_Map.prototype.createTilemap = function() { this._tilemap = tilemap; };
    // The engine's own update: it moves the spriteset for a shake, and the tilemap inside it sorts its children.
    Spriteset_Map.prototype.update = function() { this.baseUpdates++; if (game.duringBaseUpdate) game.duringBaseUpdate(this); };
    Spriteset_Map.prototype.destroy = function() { this.destroyed = true; };
    function Scene_Map() {}
    Scene_Map.prototype.isReady = function() { return true; };

    const map = Object.assign({ id: 7, width: 21, height: 15, tile: 48, displayX: 0, displayY: 0, loopX: false, loopY: false, passable: () => true }, options.map);
    function Game_Map() {}
    Game_Map.prototype.checkPassage = function(x, y, bit) { return map.passable(x, y, bit); };
    Game_Map.prototype.isPassable = function(x, y, d) { return this.checkPassage(x, y, (1 << (d / 2 - 1)) & 0x0f); };
    Game_Map.prototype.isBoatPassable = function(x, y) { return this.checkPassage(x, y, 0x0200); };
    Game_Map.prototype.isShipPassable = function(x, y) { return this.checkPassage(x, y, 0x0400); };
    Game_Map.prototype.isAirshipLandOk = function(x, y) { return this.checkPassage(x, y, 0x0800) && this.checkPassage(x, y, 0x0f); };
    Game_Map.prototype.requestRefresh = function() { this.refreshRequests = (this.refreshRequests || 0) + 1; };
    Game_Map.prototype.roundXWithDirection = (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0);
    Game_Map.prototype.roundYWithDirection = (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0);
    // A step as the engine asks it: the tile left and the tile entered must both allow it.
    function Game_CharacterBase() {}
    Game_CharacterBase.prototype.isMapPassable = function(x, y, d) {
        return $gameMap.isPassable(x, y, d) && $gameMap.isPassable($gameMap.roundXWithDirection(x, d), $gameMap.roundYWithDirection(y, d), 10 - d);
    };
    Object.assign(Game_Map.prototype, {
        mapId: () => map.id, tileWidth: () => map.tile, tileHeight: () => map.tile, width: () => map.width, height: () => map.height,
        displayX: () => map.displayX, displayY: () => map.displayY, isLoopHorizontal: () => map.loopX, isLoopVertical: () => map.loopY
    });
    const $gameMap = new Game_Map();
    const switches = {}, variables = {};
    const ImageManager = { _imageExtensions: ['.png', '.jpg'], cleared: 0, clear() { this.cleared++; } };

    // A canvas that scales the way a real one does without smoothing: each pixel of it whose center the drawing
    // covers is the picture pixel under that center.
    const document = {
        createElement() {
            counts.canvases++;
            const canvas = { width: 0, height: 0 };
            canvas.getContext = () => ({
                imageSmoothingEnabled: true,
                clearRect() { canvas.drawn = null; },
                // The whole picture, put at dx, dy and scaled to dw x dh; the canvas cuts what falls outside it.
                drawImage(image, dx, dy, dw, dh) {
                    assert.equal(arguments.length, 5, 'the picture is drawn whole: a part of a large picture is copied out first, which is slow');
                    canvas.drawn = { image, sx: 0, sy: 0, sw: image.width, sh: image.height, dx, dy, dw, dh };
                    draws.push({ dx, dy, smoothed: this.imageSmoothingEnabled });
                },
                getImageData(x, y, width, height) {
                    const data = new Uint8ClampedArray(width * height * 4);
                    const d = canvas.drawn;
                    for (let j = 0; d && j < height; j++) for (let i = 0; i < width; i++) {
                        if (i + 0.5 < d.dx || i + 0.5 >= d.dx + d.dw || j + 0.5 < d.dy || j + 0.5 >= d.dy + d.dh) continue;
                        const px = Math.floor(d.sx + (i + 0.5 - d.dx) * d.sw / d.dw), py = Math.floor(d.sy + (j + 0.5 - d.dy) * d.sh / d.dh);
                        if (px < 0 || py < 0 || px >= d.image.width || py >= d.image.height) continue;
                        data[(j * width + i) * 4 + 3] = d.image.alphaAt(px, py);
                    }
                    return { data };
                }
            });
            return canvas;
        }
    };

    const context = vm.createContext({
        console: { warn(...args) { (context.warnings = context.warnings || []).push(args.join(' ')); } },
        Bitmap, Sprite, TilingSprite, Spriteset_Map, Scene_Map, Game_Map, Game_CharacterBase, ImageManager, document,
        SceneManager: { _scene: null },
        Utils: { encodeURI: text => encodeURIComponent(text).replace(/%2F/g, '/') },
        Graphics: { width: 816, height: 624 },
        $gameMap,
        $gameSwitches: { value(id) { counts.switchReads++; return !!switches[id]; } },
        $gameVariables: { value(id) { counts.variableReads++; return variables[id] || 0; } },
        $dataMap: { width: map.width, height: map.height, rrImageLayers: options.layers }
    });
    if (options.pixi8) context.PIXI = { TextureSource: function() {} };
    vm.runInContext(source, context);

    const game = {
        context, counts, loads, draws, retried, map, tilemap, Bitmap, ImageManager, api: context.ReactorImageLayers,
        walker: new Game_CharacterBase(),
        setSwitch(id, value) { switches[id] = value; $gameMap.requestRefresh(); },
        setVariable(id, value) { variables[id] = value; $gameMap.requestRefresh(); },
        open() { game.spriteset = new context.Spriteset_Map(); context.SceneManager._scene = { _spriteset: game.spriteset }; return game.spriteset; },
        /** Whether a character standing on x, y can step in direction d (2 down, 4 left, 6 right, 8 up). */
        canStep(x, y, d) { return game.walker.isMapPassable(x, y, d); },
        update(times = 1) { for (let i = 0; i < times; i++) game.spriteset.update(); },
        layers() { return Array.from(game.spriteset._rrImageLayers.layers); },
        blocked(x, y) { return !$gameMap.isPassable(x, y, 2); }
    };
    return game;
}

const TILE = 48;
const solid = picture(21 * TILE, 15 * TILE, () => 255);

// ---------------------------------------------------------------------------------------------------------------
// The stored form
// ---------------------------------------------------------------------------------------------------------------

test('the module loads with no game global present, in a bare context and through require', () => {
    const bare = vm.createContext({});
    vm.runInContext(source, bare);
    assert.equal(typeof bare.ReactorImageLayers.normalize, 'function');
    assert.equal(typeof bare.ReactorImageLayers.isTileBlocked, 'function');
    assert.deepEqual([...L.POSITIONS], ['back', 'ground', 'same', 'over']);
    assert.deepEqual([...L.FITS], ['map', 'repeat', 'fill']);
    assert.deepEqual([...L.BLENDS], ['normal', 'add', 'multiply', 'screen']);
    assert.deepEqual([...L.OPS], ['=', '>=', '<=']);
});

test('normalize gives every field its default and never changes what it was given', () => {
    const stored = Object.freeze({ name: 'Town_ground' });
    assert.deepEqual(L.normalize(stored), {
        name: 'Town_ground', layer: 'ground', fit: 'map', drift: [0, 0], follow: 1, opacity: 255, blendMode: 0,
        switch: 0, when: null, fade: 0, variable: 0, variantName: '', versions: null, repeat: 'both', z: null
    });
    const full = { name: 'Fog', layer: 'over', fit: 'repeat', drift: [12, -4], follow: 0.5, opacity: 140, blendMode: 2, switch: 7,
        when: { variable: 3, op: '>=', value: 3 }, fade: 1.5, variable: 9, variantName: 'Fog-%1', versions: { 1: 'Fog_night', 2: 'Fog_winter' }, repeat: 'x', z: 6 };
    const before = JSON.stringify(full);
    const record = L.normalize(full);
    assert.deepEqual(record, full);
    assert.equal(JSON.stringify(full), before);
    record.drift[0] = 99; record.when.value = 99; record.versions[1] = 'Other';
    assert.equal(JSON.stringify(full), before, 'drift, when and versions are copies');
    // The list of pictures keeps whole numbers with a name; anything else in it is dropped, and an empty list is none.
    assert.deepEqual(L.normalize({ name: 'A', versions: { 2: 'B', '-1': 'C', x: 'no', 3: '', 1.5: 'half', 4: 7, ' ': 'blank' } }).versions, { 2: 'B', '-1': 'C' });
    assert.equal(L.normalize({ name: 'A', versions: {} }).versions, null);
    assert.equal(L.normalize({ name: 'A', versions: ['A', 'B'] }).versions, null, 'a list is an object of values, not an array');
    // One direction only means something for a picture that repeats.
    assert.deepEqual(['x', 'y', 'both', 'z', undefined].map(repeat => L.normalize({ name: 'A', fit: 'repeat', repeat }).repeat), ['x', 'y', 'both', 'both', 'both']);
    assert.deepEqual(['map', 'fill'].map(fit => L.normalize({ name: 'A', fit, repeat: 'x' }).repeat), ['both', 'both']);
    assert.deepEqual([...L.REPEATS], ['both', 'x', 'y']);
    assert.equal(L.normalize({ name: 'A', layer: 'light' }).layer, 'ground', 'an unknown position is the default one');
    assert.equal(L.normalize({ name: 'A', layer: 'same', fit: 'repeat' }).fit, 'map', 'same as characters is always locked to the map');
    assert.equal(L.normalize({ name: 'A', when: { variable: 0, op: '=', value: 1 } }).when, null);
    assert.equal(L.normalize({ name: 'A', opacity: 999 }).opacity, 255);
    assert.equal(L.normalize(null).name, '');
});

test('write round-trips what imports and the old card wrote, byte for byte, and drops defaults', () => {
    const stored = [
        { name: '43_Ground', layer: 'ground', variable: 12, variantName: '43-%1_Ground' },
        { name: '43_light', layer: 'over', switch: 5 },
        { name: '43_shadow', layer: 'over', variable: 13, variantName: '43-%1_shadow', switch: 6 },
        { name: 'Space-01', layer: 'over' },
        { name: 'Town_light', layer: 'over', variable: 2, variantName: 'Town_light', switch: 3, opacity: 128, blendMode: 1 },
        { name: 'Town_ground', layer: 'ground', myPluginNote: { a: 1 } }
    ];
    for (const layer of stored) assert.equal(JSON.stringify(L.write(L.normalize(layer))), JSON.stringify(layer));
    assert.deepEqual(L.write({ name: 'A', layer: 'ground', fit: 'map', drift: [0, 0], follow: 1, opacity: 255, blendMode: 0, switch: 0, when: null, fade: 0, variable: 0, variantName: '', versions: null, repeat: 'both', z: null }),
        { name: 'A', layer: 'ground' });
    // The list of pictures is written only when it has rows and a variable chooses among them; one direction only for a repeating layer.
    assert.equal(JSON.stringify(L.write({ name: 'Town', layer: 'ground', variable: 4, versions: { 2: 'Town_winter', 1: 'Town_night' } })),
        '{"name":"Town","layer":"ground","variable":4,"versions":{"1":"Town_night","2":"Town_winter"}}');
    assert.deepEqual(L.write({ name: 'Town', layer: 'ground', variable: 4, versions: {} }), { name: 'Town', layer: 'ground', variable: 4 }, 'no rows: no list in the file');
    assert.deepEqual(L.write({ name: 'Town', layer: 'ground', versions: { 1: 'Town_night' } }), { name: 'Town', layer: 'ground' }, 'no variable: no list in the file');
    assert.equal(JSON.stringify(L.write({ name: '43_Ground', layer: 'ground', variable: 12, variantName: '43-%1_Ground', versions: { 5: 'Flood' } })),
        '{"name":"43_Ground","layer":"ground","variable":12,"variantName":"43-%1_Ground","versions":{"5":"Flood"}}', 'an import\'s pattern keeps its place; rows added to it follow');
    assert.deepEqual(L.write({ name: 'Hills', layer: 'back', fit: 'repeat', repeat: 'x', follow: 0.5 }), { name: 'Hills', layer: 'back', fit: 'repeat', repeat: 'x', follow: 0.5 });
    assert.deepEqual(L.write({ name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', drift: [0, 300] }), { name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', drift: [0, 300] });
    assert.deepEqual(L.write({ name: 'Fog', layer: 'over', fit: 'repeat', repeat: 'both' }), { name: 'Fog', layer: 'over', fit: 'repeat' }, 'both directions is the default and is not written');
    assert.deepEqual(L.write({ name: 'A', layer: 'over', repeat: 'x' }), { name: 'A', layer: 'over' }, 'a picture locked to the map has no direction to repeat in');
    const listed = { name: 'Town', layer: 'ground', variable: 4, versions: { 1: 'Town_night', 2: 'Town_winter' } };
    assert.equal(JSON.stringify(L.write(L.normalize(listed))), JSON.stringify(listed), 'a layer with rows reads back as it was written');
    assert.deepEqual(L.write({ name: 'Fog', layer: 'over', fit: 'repeat', drift: [12, 0], follow: 0, opacity: 140, blendMode: 3, when: { variable: 3, op: '>=', value: 3 }, fade: 2, z: 7 }),
        { name: 'Fog', layer: 'over', opacity: 140, blendMode: 3, fit: 'repeat', drift: [12, 0], follow: 0, when: { variable: 3, op: '>=', value: 3 }, fade: 2, z: 7 });
    assert.deepEqual(L.write({ name: 'A', layer: 'over', variantName: 'A-%1' }), { name: 'A', layer: 'over' }, 'a pattern with no variable is not stored');
    assert.deepEqual(L.list({ rrImageLayers: [{ name: 'A' }, null, { name: '' }, { name: 'B', layer: 'over' }] }).map(layer => layer.name), ['A', 'B']);
    assert.deepEqual(L.list({}), []);
});

test('the picture a variable chooses: its row first, then an import\'s pattern, then the layer\'s own', () => {
    // Rows only: a value with a row shows that picture, every other value the layer's own.
    const rows = { name: 'Town', layer: 'ground', variable: 4, versions: { 1: 'Town_night', 2: 'Town_winter', 7: 'Town_flood' } };
    assert.deepEqual([0, 1, 2, 3, 7, 8, -1].map(value => L.pictureName(rows, value)), ['Town', 'Town_night', 'Town_winter', 'Town', 'Town_flood', 'Town', 'Town']);
    assert.deepEqual([undefined, null, NaN, Infinity, 1.5].map(value => L.pictureName(rows, value)), ['Town', 'Town', 'Town', 'Town', 'Town']);
    assert.equal(L.pictureName(rows, '2'), 'Town_winter', 'a value written as text finds its row');
    // A variable can be negative, and a row can be for such a value; the tool's "look at the layer's own picture" asks with null.
    const deep = L.normalize({ name: 'Town', layer: 'ground', variable: 4, versions: { '-3': 'Town_deep', 0: 'Town_dawn' } });
    assert.deepEqual([-3, -2, 0, null].map(value => L.pictureName(deep, value)), ['Town_deep', 'Town', 'Town_dawn', 'Town']);
    assert.equal(L.pictureName(L.normalize(rows), 2), 'Town_winter', 'the same from a normalized record');
    // An import's pattern only: every value but 0 names a file by it.
    const imported = { name: '43_Ground', layer: 'ground', variable: 12, variantName: '43-%1_Ground' };
    assert.equal(L.pictureName(imported, 0), '43_Ground');
    assert.equal(L.pictureName(imported, 2), '43-2_Ground');
    assert.equal(L.pictureName(imported, undefined), '43_Ground');
    assert.equal(L.pictureName(imported, NaN), '43_Ground');
    assert.equal(L.pictureName({ name: 'A', variantName: '%1/A-%1' }, 2), '2/A-2', 'everywhere the pattern asks for it');
    assert.equal(L.pictureName({ name: 'A', variantName: 'A-%1' }, '$&'), 'A-$&', 'a value written as text goes in as it is');
    // Both: the row wins for its value, the pattern names the others, 0 is the layer's own unless it has a row.
    const both = Object.assign({}, imported, { versions: { 2: 'Flooded', 0: 'Dawn' } });
    assert.deepEqual([0, 1, 2, 3].map(value => L.pictureName(both, value)), ['Dawn', '43-1_Ground', 'Flooded', '43-3_Ground']);
    // Neither: a variable with no row and no pattern never changes the picture, whatever files lie beside it.
    assert.deepEqual([0, 1, 3].map(value => L.pictureName({ name: 'Town_ground', layer: 'ground', variable: 4 }, value)), ['Town_ground', 'Town_ground', 'Town_ground']);
    assert.equal(L.pictureName({ name: '7_Ground', variable: 4 }, 1), '7_Ground', 'no name rule is worked out from the picture\'s name');
    // A value that is the name of something every object has is not a row.
    assert.equal(L.pictureName({ name: 'A', variable: 1, versions: { 1: 'B' } }, 'constructor'), 'A');
    assert.equal(L.pictureName(null, 3), '');
});

test('shown: a switch, each of the three tests at, under and over its value, both together, and neither', () => {
    assert.equal(L.shown({ name: 'A' }, false, 0), true, 'no condition: always');
    assert.equal(L.shown({ name: 'A', switch: 7 }, false, 0), false);
    assert.equal(L.shown({ name: 'A', switch: 7 }, true, 0), true);
    const at = (op, value) => L.shown({ name: 'A', when: { variable: 3, op, value: 3 } }, false, value);
    assert.deepEqual([at('=', 2), at('=', 3), at('=', 4)], [false, true, false]);
    assert.deepEqual([at('>=', 2), at('>=', 3), at('>=', 4)], [false, true, true]);
    assert.deepEqual([at('<=', 2), at('<=', 3), at('<=', 4)], [true, true, false]);
    const both = { name: 'A', switch: 7, when: { variable: 3, op: '>=', value: 3 } };
    assert.deepEqual([L.shown(both, true, 3), L.shown(both, false, 3), L.shown(both, true, 2), L.shown(both, false, 2)], [true, false, false, false]);
    assert.equal(L.shown({ name: 'A', variable: 9, versions: { 1: 'B' } }, false, 0), true, 'the variable that changes the picture never hides a layer');
    assert.equal(L.passes(null, 0), true);
});

test('a 3D map draws only the screen layers above characters', () => {
    const drawn = [];
    for (const layer of L.POSITIONS) for (const fit of L.FITS) if (L.drawnOn3D(L.normalize({ name: 'A', layer, fit }))) drawn.push(layer + ' ' + fit);
    assert.deepEqual(drawn, ['over repeat', 'over fill']);
    assert.equal(L.drawn(L.normalize({ name: 'A', layer: 'ground' }), false), true);
    assert.equal(L.drawn(L.normalize({ name: 'A', layer: 'ground' }), true), false);
});

test('origin of a repeating layer: follow 0, 0.5 and 1, drift right and down, wrapped by the picture', () => {
    const at = (spec, seconds, x, y, w, h) => L.origin(Object.assign({ name: 'A', fit: 'repeat' }, spec), seconds, x, y, 48, 48, w, h);
    assert.deepEqual(at({ follow: 1 }, 0, 2.5, 1), { x: 120, y: 48 }, 'follow 1 lies on the map');
    assert.deepEqual(at({ follow: 0.5 }, 0, 2.5, 1), { x: 60, y: 24 }, 'follow 0.5 moves half as far');
    assert.deepEqual(at({ follow: 0 }, 0, 2.5, 1), { x: 0, y: 0 }, 'follow 0 stays on the screen');
    assert.deepEqual(at({ drift: [10, 5] }, 1, 0, 0), { x: -10, y: -5 }, 'a positive drift moves the picture right and down');
    assert.deepEqual(at({ drift: [10, 5] }, 1, 0, 0, 256, 256), { x: 246, y: 251 }, 'wrapped into the picture');
    assert.deepEqual(at({ follow: 1 }, 0, 100, 100, 256, 256), { x: 4800 % 256, y: 4800 % 256 });
    // An hour of drifting stays inside the picture and is the same place as the remainder says.
    assert.deepEqual(at({ drift: [37, 0] }, 3600, 0, 0, 256, 256), { x: ((-37 * 3600) % 256 + 256) % 256, y: 0 });
    // The tilemap scrolls its tiles by ceil(displayX * tileWidth): a layer on the map lands on the same pixel.
    assert.equal(at({ follow: 1 }, 0, 31 / 32, 0).x, Math.ceil(31 / 32 * 48));
    assert.deepEqual(at({ follow: 1 }, 0, 1 / 192, 1 / 192), { x: 1, y: 1 }, 'a quarter of a pixel of scroll is already the next pixel, as it is for the tiles');
    const out = { x: 0, y: 0 };
    assert.equal(L.origin({ name: 'A', fit: 'repeat' }, 0, 1, 1, 48, 48, 0, 0, out), out, 'a given object is filled, none is made');
});

test('origin of a layer that repeats in one direction: it wraps and scrolls there, and lies once in the other', () => {
    const at = (spec, seconds, x, y, w, h) => L.origin(Object.assign({ name: 'A', fit: 'repeat' }, spec), seconds, x, y, 48, 48, w, h);
    // Across only: x as any repeating layer; y is how far the view's top is below the picture's top, never wrapped.
    assert.deepEqual(at({ repeat: 'x', follow: 0.5 }, 0, 20, 10, 512, 256), { x: 480, y: 240 });
    assert.deepEqual(at({ repeat: 'x', follow: 0.5 }, 0, 40, 30, 512, 256), { x: 960 % 512, y: 720 }, 'past the picture\'s height it goes on: the strip has scrolled away upward');
    assert.deepEqual(at({ repeat: 'x', follow: 1 }, 0, 0, -3.75, 512, 256), { x: 0, y: -180 }, 'a view above the map: the strip lies below the view\'s top');
    assert.deepEqual(at({ repeat: 'x', follow: 0 }, 0, 40, 30, 512, 256), { x: 0, y: 0 }, 'follow 0: fixed to the top of the screen');
    assert.deepEqual(at({ repeat: 'x', drift: [10, 5] }, 2, 0, 0, 512, 256), { x: 512 - 20, y: 0 }, 'it scrolls across; the speed down the screen does not count');
    // Down only: the same the other way round.
    assert.deepEqual(at({ repeat: 'y', follow: 0.5 }, 0, 40, 30, 256, 512), { x: 960, y: 720 % 512 });
    assert.deepEqual(at({ repeat: 'y', drift: [10, 300] }, 1, 0, 0, 256, 512), { x: 0, y: 512 - 300 }, 'it scrolls down; the speed across does not count');
    assert.deepEqual(at({ repeat: 'y', follow: 0 }, 0, 40, 30, 256, 512), { x: 0, y: 0 });
    // The whole pixels the tiles land on, in both directions.
    assert.deepEqual(at({ repeat: 'x', follow: 1 }, 0, 1 / 192, 1 / 192, 512, 256), { x: 1, y: 1 });
    // A layer scrolls by itself only where it repeats.
    const scrolls = (repeat, drift) => L.scrolls(L.normalize({ name: 'A', fit: 'repeat', repeat, drift }));
    assert.deepEqual([scrolls('both', [0, 0]), scrolls('both', [3, 0]), scrolls('both', [0, 3])], [false, true, true]);
    assert.deepEqual([scrolls('x', [3, 0]), scrolls('x', [0, 3]), scrolls('y', [3, 0]), scrolls('y', [0, 3])], [true, false, false, true]);
    assert.equal(L.scrolls(L.normalize({ name: 'A', fit: 'map', drift: [3, 3] })), false);
    assert.equal(L.scrolls(null), false);
});

test('depth: each position, stored order within a position, and z overriding it', () => {
    assert.deepEqual([L.depth({ layer: 'back' }, 0), L.depth({ layer: 'ground' }, 0), L.depth({ layer: 'same' }, 0), L.depth({ layer: 'over' }, 0)], [-1, 0.5, 3, 9]);
    assert.ok(L.depth({ layer: 'back' }, 5) < 0, 'behind the lower tiles');
    assert.ok(L.depth({ layer: 'ground' }, 5) > 0 && L.depth({ layer: 'ground' }, 5) < 1, 'over the lower tiles, under every character');
    assert.ok(L.depth({ layer: 'over' }, 0) > 5, 'over the upper tiles and the characters above them');
    assert.ok(L.depth({ layer: 'over' }, 2) > L.depth({ layer: 'over' }, 1), 'a later layer is on top');
    assert.equal(L.depth({ layer: 'same' }, 4), 3, 'strips tie with the characters');
    assert.equal(L.depth({ layer: 'ground', z: 6 }, 0), 6);
    assert.equal(L.depth({ layer: 'same', z: 5 }, 3), 5);
});

test('a strip sorts in front of a character on its row or above, behind one on a row below', () => {
    // The tilemap's own comparator, and where the engine puts a character's feet.
    const display = fs.readFileSync(path.join(root, 'runtime', 'reactor_core_display.js'), 'utf8');
    const compareSource = display.match(/Tilemap\.prototype\._compareChildOrder = function\(a, b\) \{[\s\S]*?\n\};/);
    assert.ok(compareSource, 'the tilemap comparator is in reactor_core_display.js');
    function Tilemap() {}
    vm.runInNewContext(compareSource[0], { Tilemap });
    const compare = Tilemap.prototype._compareChildOrder;
    const objects = fs.readFileSync(path.join(root, 'runtime', 'reactor_objects_map.js'), 'utf8');
    assert.match(objects, /this\.scrolledY\(\) \* th \+ th - this\.shiftY\(\) - this\.jumpHeight\(\)/, 'a character sorts by the bottom of its tile less its shift');
    const feet = (row, displayY, shiftY) => Math.floor((row - displayY) * TILE + TILE - shiftY);
    for (const displayY of [0, 3, 2.53125, 7.96875]) {
        for (const shiftY of [6, 0]) {
            const strip = { z: L.depth({ layer: 'same' }, 0), y: L.stripY(9, displayY, TILE), _reactorSortY: L.stripSortY(9, displayY, TILE), spriteId: 1 };
            const character = row => ({ z: 3, y: feet(row, displayY, shiftY), spriteId: 50 });
            assert.ok(compare(character(8), strip) < 0, 'a character one row above is drawn before the strip: behind it');
            assert.ok(compare(character(9), strip) < 0, 'a character on the strip\'s own row is behind it');
            assert.ok(compare(character(10), strip) > 0, 'a character one row below is drawn after the strip: in front of it');
            assert.equal(strip.y, 9 * TILE - Math.ceil(displayY * TILE), 'the strip lies on its row of tiles');
        }
    }
    // Lower characters (z 1) stay under every strip, upper ones (z 5) over every strip.
    const strip = { z: 3, y: 0, _reactorSortY: L.stripSortY(0, 0, TILE), spriteId: 1 };
    assert.ok(compare({ z: 1, y: 900, spriteId: 2 }, strip) < 0);
    assert.ok(compare({ z: 5, y: -900, spriteId: 2 }, strip) > 0);
});

test('fades step toward their target and ease at both ends', () => {
    assert.equal(L.fadeStep(0, 1, 0), 1, 'no fade: at once');
    assert.ok(Math.abs(L.fadeStep(0, 1, 2) - 1 / 120) < 1e-12);
    assert.equal(L.fadeStep(0.999, 1, 2), 1);
    assert.equal(L.fadeStep(0.001, 0, 2), 0);
    let level = 0, steps = 0;
    while (level < 1) { level = L.fadeStep(level, 1, 0.5); steps++; }
    assert.equal(steps, 30, 'half a second is thirty frames');
    assert.deepEqual([L.ease(0), L.ease(0.5), L.ease(1), L.ease(-1), L.ease(2)], [0, 0.5, 1, 0, 1]);
});

// ---------------------------------------------------------------------------------------------------------------
// What blocks
// ---------------------------------------------------------------------------------------------------------------

/** The blocked grid of a made-up picture on a 3 x 3 tile map, through the same canvas path the game uses. */
function gridOf(alphaAt, width = 3 * TILE, height = 3 * TILE, columns = 3, rows = 3) {
    const game = makeGame({ layers: [] });
    return Array.from(game.api.solidGrid(picture(width, height, alphaAt), columns, rows, TILE, TILE));
}
const center = (x, y) => x >= TILE && x < 2 * TILE && y >= TILE && y < 2 * TILE;
const only = index => { const grid = new Array(9).fill(0); for (const i of [].concat(index)) grid[i] = 1; return grid; };

test('solid paint blocks: a block, a thin fence line, a tree trunk; soft shadows, specks and empty tiles do not', () => {
    assert.deepEqual(gridOf((x, y) => center(x, y) ? 255 : 0), only(4), 'a solid block blocks its tile and no other');
    // A fence line 6 pixels wide, standing in the middle column from top to bottom.
    assert.deepEqual(gridOf((x) => x >= 69 && x < 75 ? 255 : 0), only([1, 4, 7]), 'a thin fence line blocks every tile it crosses');
    // The same line lying across the middle row.
    assert.deepEqual(gridOf((x, y) => y >= 69 && y < 75 ? 255 : 0), only([3, 4, 5]));
    // A fence drawn by hand: a post 8 wide and two rails 5 tall.
    assert.deepEqual(gridOf((x, y) => center(x, y) && ((x - TILE) < 8 || (y >= 68 && y < 73) || (y >= 81 && y < 86)) ? 255 : 0), only(4));
    // A trunk 16 wide and 40 tall on the middle tile.
    assert.deepEqual(gridOf((x, y) => x >= 64 && x < 80 && y >= 56 && y < 96 ? 255 : 0), only(4));
    assert.deepEqual(gridOf(() => 110), only([]), 'a soft shadow over everything blocks nothing');
    assert.deepEqual(gridOf(() => 169), only([]), 'paint just under two-thirds opaque blocks nothing');
    assert.deepEqual(gridOf(() => 170), only([0, 1, 2, 3, 4, 5, 6, 7, 8]), 'two-thirds opaque is solid');
    // Stray pixels: a few specks and one 12 x 12 blot.
    assert.deepEqual(gridOf((x, y) => (x % 17 === 3 && y % 19 === 5) || (x >= 60 && x < 72 && y >= 60 && y < 72) ? 255 : 0), only([]), 'specks and a small blot block nothing');
    assert.deepEqual(gridOf(() => 0), only([]), 'an empty picture blocks nothing');
    // A wall drawn up to 3 pixels over the edges of its tile does not take the tiles around it; one drawn 6 over does.
    for (const over of [1, 2, 3]) {
        assert.deepEqual(gridOf((x, y) => x >= TILE - over && x < 2 * TILE + over && y >= TILE - over && y < 2 * TILE + over ? 255 : 0), only(4), `${over} pixels over`);
    }
    assert.deepEqual(gridOf((x, y) => x >= TILE - 6 && x < 2 * TILE + 6 && y >= TILE && y < 2 * TILE ? 255 : 0), only([3, 4, 5]));
    // A picture 100 pixels wide reaches 4 pixels into the third tile: a twelfth of it, which does not block.
    assert.deepEqual(gridOf(() => 255, 100, TILE, 3, 1), [1, 1, 0]);
});

test('a thin fence blocks wherever it is drawn: the same answer at every pixel offset', () => {
    // A fence drawn by hand along the middle row: two rails `rail` pixels tall across every tile, and in each tile a
    // post `post` pixels wide. The drawing is moved down and right one pixel at a time through a whole sampling step
    // and back to where it began.
    const fence = (rail, post, dx, dy) => (x, y) => {
        const ty = y - TILE - dy, tx = ((x - dx) % TILE + TILE) % TILE;
        if (ty < 0 || ty >= TILE) return 0;
        const onRail = (ty >= 20 && ty < 20 + rail) || (ty >= 32 && ty < 32 + rail);
        const onPost = tx >= 20 && tx < 20 + post && ty >= 14 && ty < 40;
        return onRail || onPost ? 255 : 0;
    };
    for (const [rail, post] of [[3, 5], [3, 6], [4, 6], [5, 8]]) {
        for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) {
            assert.deepEqual(gridOf(fence(rail, post, dx, dy)), only([3, 4, 5]), `rails ${rail}, post ${post}, moved ${dx} right and ${dy} down`);
        }
    }
    // Rails with no post at all (the run between two posts): two lines 3 pixels thick are an eighth of the tile,
    // and are counted at every offset down the tile. Read at every sixth pixel, a rail fell between two points.
    for (let dy = 0; dy < 30; dy++) {
        assert.deepEqual(gridOf((x, y) => (y >= TILE + dy && y < TILE + dy + 3) || (y >= TILE + dy + 12 && y < TILE + dy + 15) ? 255 : 0), only([3, 4, 5]), `two rails from ${dy} pixels down the tile`);
    }
    // And upright: two posts 3 pixels wide in every tile of the middle column.
    for (let dx = 0; dx < 30; dx++) {
        assert.deepEqual(gridOf((x) => (x >= TILE + dx && x < TILE + dx + 3) || (x >= TILE + dx + 12 && x < TILE + dx + 15) ? 255 : 0), only([1, 4, 7]), `two posts from ${dx} pixels into the tile`);
    }
    // One such line alone is a sixteenth of the tile and never blocks, wherever it is.
    for (let dy = 0; dy < 6; dy++) assert.deepEqual(gridOf((x, y) => y >= TILE + 20 + dy && y < TILE + 23 + dy ? 255 : 0), only([]));
});

test('the picture is read without smoothing, in the middle of a pixel, and a large one in bands', () => {
    const game = makeGame({ layers: [] });
    // 48 pixel tiles: every third pixel, the point already inside a pixel.
    game.api.solidGrid(picture(96, 96, () => 255), 2, 2, 48, 48);
    assert.deepEqual(game.draws.pop(), { dx: 0, dy: 0, smoothed: false });
    // 32 pixel tiles: every second pixel, which lands on the line between two; read half a pixel over
    // (the picture is put a quarter of a point up and left, which is half a pixel of it).
    game.api.solidGrid(picture(64, 64, () => 255), 2, 2, 32, 32);
    assert.deepEqual(game.draws.pop(), { dx: -0.25, dy: -0.25, smoothed: false });
    // Pixels 1, 3, 5 ... are the ones read: a picture solid only on its even pixels reads as empty, on its odd ones as full.
    assert.deepEqual(Array.from(game.api.solidGrid(picture(64, 64, (x) => x % 2 === 0 ? 255 : 0), 2, 2, 32, 32)), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(game.api.solidGrid(picture(64, 64, (x) => x % 2 === 1 ? 255 : 0), 2, 2, 32, 32)), [1, 1, 1, 1]);
    assert.deepEqual(Array.from(game.api.solidGrid(picture(64, 64, (x, y) => x < 32 && y < 32 ? 255 : 0), 2, 2, 32, 32)), [1, 0, 0, 0]);
    // 16 pixel tiles: every pixel.
    assert.deepEqual(Array.from(game.api.solidGrid(picture(32, 16, (x) => x >= 16 && x < 18 ? 255 : 0), 2, 1, 16, 16)), [0, 1], '2 of 16 pixels across is an eighth');
    assert.deepEqual(Array.from(game.api.solidGrid(picture(32, 16, (x) => x === 16 ? 255 : 0), 2, 1, 16, 16)), [0, 0]);
});

test('a picture smaller than the map blocks only where it reaches, and the pure rule reads plain or RGBA samples', () => {
    assert.deepEqual(gridOf(() => 255, TILE, 2 * TILE), only([0, 3]), 'tiles the picture does not reach are free');
    const samples = L.SOLID.samples;
    assert.deepEqual([samples, L.SOLID.count * 8], [16, samples * samples], 'sixteen points a side, an eighth of them to block');
    const plain = new Uint8Array(2 * samples * samples);          // two tiles side by side
    for (let j = 0; j < samples; j++) plain[j * 2 * samples + samples] = 255;   // the left column of points of the second tile
    assert.deepEqual(Array.from(L.solidTiles(plain, 2, 1)), [0, 0], 'a sixteenth of the tile does not block');
    for (let j = 0; j < samples; j++) plain[j * 2 * samples + samples + 1] = 255;   // and the column beside it
    assert.deepEqual(Array.from(L.solidTiles(plain, 2, 1)), [0, 1], 'an eighth does');
    const rgba = new Uint8Array(plain.length * 4);
    plain.forEach((value, index) => { rgba[index * 4 + 3] = value; });
    assert.deepEqual(Array.from(L.solidTiles(rgba, 2, 1, 4, 3)), [0, 1]);
    assert.equal(L.isSolidAt(L.solidTiles(plain, 2, 1), 2, 1, 1, 0), true);
    assert.equal(L.isSolidAt(L.solidTiles(plain, 2, 1), 2, 1, 2, 0), false, 'outside the map nothing is solid');
    assert.equal(L.solidGrid(picture(48, 48, () => 255), 1, 1, 48, 48), null, 'no document: no grid');
});

test('a large map is read in bands and gives the same grid as one pass', () => {
    // 200 x 200 tiles is four times the budget of one read: the grid must not depend on where a band ends.
    const columns = 200, rows = 200;
    const alphaAt = (x, y) => (Math.floor(x / TILE) * 7 + Math.floor(y / TILE) * 13) % 5 === 0 ? 255 : 0;
    const game = makeGame({ layers: [] });
    const grid = game.api.solidGrid(picture(columns * TILE, rows * TILE, alphaAt), columns, rows, TILE, TILE);
    let wrong = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) if (grid[y * columns + x] !== ((x * 7 + y * 13) % 5 === 0 ? 1 : 0)) wrong++;
    assert.equal(wrong, 0);
    assert.equal(game.counts.canvases, 1, 'one small canvas, reused for every band');
    assert.deepEqual(game.draws.map(draw => draw.dy), [0, -800, -1600, -2400], 'four bands of fifty rows, the picture moved up 800 points for each');
});

// ---------------------------------------------------------------------------------------------------------------
// The running game
// ---------------------------------------------------------------------------------------------------------------

test('a map without layers gets nothing: no sprite, no load, passability untouched', () => {
    for (const layers of [undefined, [], [{ name: '' }]]) {
        const game = makeGame({ layers, map: { passable: (x, y) => !(x === 2 && y === 2) } });
        game.open();
        game.update(10);
        assert.equal(game.spriteset._rrImageLayers, null);
        assert.equal(game.tilemap.children.length, 0);
        assert.deepEqual([game.counts.sprites, game.counts.tilings, game.counts.loads, game.counts.switchReads, game.counts.variableReads], [0, 0, 0, 0, 0]);
        assert.equal(game.spriteset.baseUpdates, 10, 'the spriteset\'s own update still runs');
        assert.equal(game.blocked(2, 2), true);
        assert.equal(game.blocked(3, 2), false);
        assert.equal(game.api.isTileBlocked(2, 2), false);
    }
});

test('a map shown in 2D draws a map-locked layer on the tiles\' own pixels, at its position\'s depth', () => {
    const game = makeGame({ files: { Town_ground: solid, Town_roofs: solid }, map: { displayX: 2.5, displayY: 1 },
        layers: [{ name: 'Town_ground', layer: 'ground' }, { name: 'Town_roofs', layer: 'over', opacity: 128, blendMode: 1 }] });
    game.open();
    const [ground, roofs] = game.layers();
    assert.deepEqual([ground.sprite.visible, ground.sprite.x, ground.sprite.y, ground.sprite.z], [true, -120, -48, 0.5]);
    assert.equal(ground.sprite.bitmap._url, 'img/parallaxes/Town_ground.png');
    assert.deepEqual([roofs.sprite.z > 9, roofs.sprite.opacity, roofs.sprite.blendMode], [true, 128, 1]);
    // A slow walk scrolls by fractions of a pixel: the layer moves with the tiles, never a pixel apart from them.
    game.map.displayX = 2.5 + 1 / 32;
    game.update();
    assert.equal(ground.sprite.x, -Math.ceil((2.5 + 1 / 32) * 48));
    // A quarter of a pixel past a whole one: the tiles are already on the next pixel, and so is the layer.
    game.map.displayX = 2.5 + 1 / 192; game.map.displayY = 1 + 1 / 192;
    game.update();
    assert.deepEqual([ground.sprite.x, ground.sprite.y], [-121, -49]);
});

test('a switch, a variable test and both together show and hide a layer; a hidden layer starts hidden', () => {
    const game = makeGame({ files: { A: solid }, layers: [
        { name: 'A', layer: 'over', switch: 7 },
        { name: 'A', layer: 'over', when: { variable: 3, op: '>=', value: 3 } },
        { name: 'A', layer: 'over', switch: 7, when: { variable: 3, op: '>=', value: 3 } }] });
    game.open();
    const visible = () => game.layers().map(layer => layer.sprite.visible);
    assert.deepEqual(visible(), [false, false, false], 'nothing flashes when the map opens');
    game.setSwitch(7, true); game.update();
    assert.deepEqual(visible(), [true, false, false]);
    game.setVariable(3, 2); game.update();
    assert.deepEqual(visible(), [true, false, false]);
    game.setVariable(3, 3); game.update();
    assert.deepEqual(visible(), [true, true, true], 'at least 3, crossed upward');
    game.setVariable(3, 2); game.update();
    assert.deepEqual(visible(), [true, false, false], 'and crossed downward');
    game.setSwitch(7, false); game.setVariable(3, 5); game.update();
    assert.deepEqual(visible(), [false, true, false]);
});

test('a fade eases the opacity in and out, and a map never opens mid-fade', () => {
    const game = makeGame({ files: { A: solid }, layers: [{ name: 'A', layer: 'over', switch: 7, fade: 0.5, opacity: 200 }] });
    game.open();
    const [layer] = game.layers();
    assert.equal(layer.sprite.visible, false);
    game.setSwitch(7, true); game.update();
    assert.equal(layer.sprite.visible, true);
    assert.ok(layer.sprite.opacity > 0 && layer.sprite.opacity < 5, 'the first frame of a fade is almost clear');
    game.update(14);
    assert.ok(Math.abs(layer.sprite.opacity - 100) < 1, 'half way through, half the layer\'s opacity');
    game.update(15);
    assert.equal(layer.sprite.opacity, 200);
    game.setSwitch(7, false); game.update(15);
    assert.equal(layer.sprite.visible, true, 'still fading out');
    assert.ok(Math.abs(layer.sprite.opacity - 100) < 1);
    game.update(15);
    assert.equal(layer.sprite.visible, false);
    // The menu and back: the map is built again with the switch on, and the layer is simply there.
    game.setSwitch(7, true);
    game.open();
    assert.deepEqual([game.layers()[0].sprite.visible, game.layers()[0].sprite.opacity], [true, 200]);
});

test('a repeating layer covers the view, follows the map by its rate and drifts in whole pixels without growing', () => {
    const fog = picture(256, 256, () => 120);
    const game = makeGame({ files: { Fog: fog, Hills: fog }, map: { displayX: 4, displayY: 2 }, layers: [
        { name: 'Fog', layer: 'over', fit: 'repeat', drift: [30, 0], follow: 0, blendMode: 2 },
        { name: 'Hills', layer: 'back', fit: 'repeat', follow: 0.5 }] });
    game.open();
    const [mist, hills] = game.layers();
    assert.deepEqual(mist.sprite.size, [816, 624], 'as large as the screen');
    assert.deepEqual([mist.sprite.z, hills.sprite.z], [9, -1 + 0.0001]);
    assert.deepEqual([mist.sprite.blendMode, hills.sprite.blendMode], [2, 0], 'multiply, as the data numbers it before PIXI 8');
    assert.deepEqual([hills.sprite.origin.x, hills.sprite.origin.y], [96, 48], 'half of 4 and 2 tiles');
    game.update(599);                       // ten seconds since the map opened
    assert.equal(mist.sprite.origin.x, ((-300 % 256) + 256) % 256, 'ten seconds at 30 a second, wrapped by the picture');
    assert.equal(mist.sprite.origin.y, 0);
    for (let i = 0; i < 4000; i++) { game.update(); assert.ok(mist.sprite.origin.x >= 0 && mist.sprite.origin.x < 256 && Number.isInteger(mist.sprite.origin.x)); }
    game.map.displayX = 6; game.update();
    assert.equal(hills.sprite.origin.x, 144);
    assert.equal(mist.sprite.origin.y, 0, 'a layer that stays on the screen ignores the scroll');
    // The game's resolution changes: the layers cover the new screen. While it holds still they are not touched.
    const moves = game.counts.moves;
    game.update(20);
    assert.equal(game.counts.moves, moves, 'a view that did not change is not written again');
    game.context.Graphics.width = 1280; game.context.Graphics.height = 720;
    game.update();
    assert.deepEqual([mist.sprite.size, hills.sprite.size], [[1280, 720], [1280, 720]]);
    // PIXI 8 names its blend modes.
    const named = makeGame({ pixi8: true, files: { Fog: fog }, layers: [{ name: 'Fog', layer: 'over', fit: 'repeat', blendMode: 2 }, { name: 'Fog', layer: 'over', fit: 'repeat', blendMode: 1 }] });
    named.open();
    assert.deepEqual(named.layers().map(layer => layer.sprite.blendMode), ['multiply', 'add']);
});

test('a layer that follows a looping map does not jump when the view crosses the seam', () => {
    const tile = picture(100, 100, () => 255);
    const game = makeGame({ files: { Far: tile }, map: { loopX: true, displayX: 20 }, layers: [{ name: 'Far', layer: 'back', fit: 'repeat', follow: 0.5 }] });
    game.open();
    const [far] = game.layers();
    const seen = [];
    for (const x of [20, 20.5, 0, 0.5, 1]) { game.map.displayX = x; game.update(); seen.push(far.sprite.origin.x); }
    // Half a tile of scroll is 12 pixels at follow 0.5, across the seam as anywhere else.
    const steps = seen.slice(1).map((value, index) => ((value - seen[index]) % 100 + 100) % 100);
    assert.deepEqual(steps, [12, 12, 12, 12]);
});

test('a fill layer covers exactly the screen, whatever the picture\'s size and the 2D camera zoom', () => {
    const game = makeGame({ files: { Vignette: picture(408, 312, () => 200) }, layers: [{ name: 'Vignette', layer: 'over', fit: 'fill' }] });
    game.open();
    const [layer] = game.layers();
    assert.deepEqual([layer.sprite.x, layer.sprite.y, layer.sprite.scale.x, layer.sprite.scale.y], [0, 0, 2, 2]);
    game.spriteset._baseSprite.scale.x = 2;       // the map is drawn at twice its size
    game.update();
    assert.deepEqual([layer.sprite.scale.x, layer.sprite.scale.y], [1, 1], 'half as large in the map\'s space is the whole screen');
});

test('a map shown in 3D draws its screen layers over the view and builds nothing for the others', () => {
    const game = makeGame({ files: { Fog: solid, Vignette: solid, Ground: solid, Trees: solid }, map: { displayX: 40, displayY: 30 }, layers: [
        { name: 'Ground', layer: 'ground' },
        { name: 'Trees', layer: 'same' },
        { name: 'Fog', layer: 'over', fit: 'repeat', follow: 1, drift: [0, 60] },
        { name: 'Vignette', layer: 'over', fit: 'fill' },
        { name: 'Ground', layer: 'over' },
        { name: 'Fog', layer: 'ground', fit: 'repeat' }] });
    const createTilemap = game.context.Spriteset_Map.prototype.createTilemap;
    game.context.Spriteset_Map.prototype.createTilemap = function() { this._reactor3d = { scene: {} }; createTilemap.call(this); };
    game.open();
    game.update(60);
    const layers = game.layers();
    assert.deepEqual(layers.map(layer => !!(layer.sprite || layer.strips)), [false, false, true, true, false, false]);
    assert.deepEqual([game.counts.sprites, game.counts.tilings], [1, 1]);
    assert.deepEqual(game.loads.map(bitmap => bitmap._url).sort(), ['img/parallaxes/Fog.png', 'img/parallaxes/Vignette.png'], 'pictures of layers a 3D map does not draw are not loaded');
    assert.deepEqual([layers[2].sprite.visible, layers[3].sprite.visible], [true, true]);
    assert.equal(layers[2].sprite.origin.x, 0, 'on the screen: the map\'s scroll does not count');
    assert.equal(layers[2].sprite.origin.y, ((-61) % 720 + 720) % 720, 'it still drifts');
    assert.equal(game.blocked(3, 3), false, 'and nothing blocks');
    // The 3D view gave up and the map is drawn in 2D after all: every layer appears.
    game.spriteset._reactor3d = null;
    game.update();
    assert.deepEqual(game.layers().map(layer => !!(layer.sprite || layer.strips)), [true, true, true, true, true, true]);
    assert.equal(game.blocked(3, 3), true);
});

test('numbered versions: the picture follows the variable, a missing version shows the base and raises nothing', () => {
    const game = makeGame({ files: { '7_Ground': solid, '7-1_Ground': solid, '7-2_Ground': solid }, layers: [{ name: '7_Ground', layer: 'ground', variable: 4, variantName: '7-%1_Ground' }] });
    game.open();
    const [layer] = game.layers();
    const shown = () => layer.sprite.bitmap._url;
    assert.equal(shown(), 'img/parallaxes/7_Ground.png');
    game.setVariable(4, 1); game.update();
    assert.equal(shown(), 'img/parallaxes/7-1_Ground.png');
    game.setVariable(4, 2); game.update();
    assert.equal(shown(), 'img/parallaxes/7-2_Ground.png');
    const before = game.counts.loads;
    game.setVariable(4, 5); game.update(3);
    assert.equal(shown(), 'img/parallaxes/7_Ground.png', 'no file for 5: the base picture');
    assert.equal(game.counts.loads, before + 1, 'the missing file was asked for once');
    const missing = game.loads[game.loads.length - 1];
    assert.equal(missing.destroyed, true);
    assert.equal(game.Bitmap._loadWatchList.includes(missing), false, 'the engine\'s load watch no longer holds it, so it cannot retry or report it');
    assert.equal(game.context.warnings, undefined, 'a missing version is silent');
    // Other switches and variables change: the missing file is not asked for again.
    game.setSwitch(9, true); game.setVariable(8, 3); game.update(5);
    assert.equal(game.counts.loads, before + 1);
    // The variable changes and comes back: now it is tried again.
    game.setVariable(4, 1); game.update();
    game.setVariable(4, 5); game.update(2);
    assert.equal(game.counts.loads, before + 2);
    assert.equal(shown(), 'img/parallaxes/7_Ground.png');
    assert.equal(layer.sprite.visible, true, 'a layer is never hidden by its versions');
    // The menu and back: the map is built again with the variable still at 5, and the disk is not asked again.
    game.spriteset.destroy();
    game.open();
    game.update(3);
    assert.equal(game.counts.loads, before + 2, 'nothing was loaded again for the map built a second time');
    assert.equal(game.layers()[0].sprite.bitmap._url, 'img/parallaxes/7_Ground.png');
    // A transfer clears the map's images, and with them what is known to be missing.
    game.context.ImageManager.clear();
    assert.equal(game.api._state.gone.size, 0);
});

test('listed pictures: the picture follows the variable row by row, any other value and a missing file show the layer\'s own', () => {
    const game = makeGame({ files: { Town: solid, Town_night: solid, Town_winter: solid, 'Town-5': solid },
        layers: [{ name: 'Town', layer: 'ground', variable: 4, versions: { 1: 'Town_night', 2: 'Town_winter', 3: 'Town_gone' } }] });
    game.open();
    const [layer] = game.layers();
    const shown = () => layer.sprite.bitmap._url;
    assert.equal(shown(), 'img/parallaxes/Town.png');
    game.setVariable(4, 1); game.update();
    assert.equal(shown(), 'img/parallaxes/Town_night.png');
    game.setVariable(4, 2); game.update();
    assert.equal(shown(), 'img/parallaxes/Town_winter.png');
    const loads = game.counts.loads;
    game.setVariable(4, 5); game.update(2);
    assert.equal(shown(), 'img/parallaxes/Town.png', 'no row for 5: the layer\'s own picture, though a file named Town-5 lies in the folder');
    assert.equal(game.counts.loads, loads, 'and nothing is asked of the disk for it');
    game.setVariable(4, 3); game.update(3);
    assert.equal(shown(), 'img/parallaxes/Town.png', 'the row of 3 names a file that is not there: the layer\'s own picture');
    assert.equal(game.counts.loads, loads + 1, 'the missing file was asked for once');
    assert.equal(game.context.warnings, undefined, 'and it is silent');
    assert.equal(game.Bitmap._loadWatchList.filter(bitmap => bitmap._loadingState === 'error').length, 0, 'the engine is left no failed picture to retry');
    assert.equal(layer.sprite.visible, true, 'the layer is never hidden by its variable');
    game.setVariable(4, 2); game.update();
    assert.equal(shown(), 'img/parallaxes/Town_winter.png');
    assert.equal(game.counts.loads, loads + 1, 'a picture shown before is not loaded again');
    // An imported layer the author added a row to: the row for its value, the pattern for the others.
    const mixed = makeGame({ files: { '7_Ground': solid, '7-1_Ground': solid, Flooded: solid },
        layers: [{ name: '7_Ground', layer: 'ground', variable: 4, variantName: '7-%1_Ground', versions: { 2: 'Flooded' } }] });
    mixed.open();
    const seen = [];
    for (const value of [0, 1, 2, 3]) { mixed.setVariable(4, value); mixed.update(2); seen.push(mixed.layers()[0].sprite.bitmap._url); }
    assert.deepEqual(seen, ['img/parallaxes/7_Ground.png', 'img/parallaxes/7-1_Ground.png', 'img/parallaxes/Flooded.png', 'img/parallaxes/7_Ground.png']);
});

test('a layer that repeats across only lies once down the screen and moves there with the map; down only, the same sideways', () => {
    const strip = picture(512, 256, () => 255), rain = picture(300, 400, () => 120);
    const game = makeGame({ files: { Hills: strip, Rain: rain, Fog: rain, Fall: rain }, map: { width: 60, height: 40, displayX: 4, displayY: 2 }, layers: [
        { name: 'Hills', layer: 'back', fit: 'repeat', repeat: 'x', follow: 0.5, drift: [0, 99] },
        { name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', follow: 0, drift: [50, 300] },
        { name: 'Fog', layer: 'over', fit: 'repeat', drift: [30, 0] },
        { name: 'Fall', layer: 'ground', fit: 'repeat', repeat: 'y', follow: 1 }] });
    game.open();
    const [hills, shower, fog, fall] = game.layers();
    // A column that lies on the map (a waterfall): four tiles of scroll put its left edge four tiles left of the screen's.
    assert.deepEqual([fall.sprite.size, fall.sprite.x, fall.sprite.origin.x, fall.sprite.origin.y], [[300, 624], -192, 0, 96]);
    // As wide as the screen and as tall as the picture: one row of it.
    assert.deepEqual(hills.sprite.size, [816, 256]);
    assert.deepEqual([hills.sprite.origin.x, hills.sprite.origin.y], [96, 0], 'across it starts as any repeating layer; down it starts at its own top');
    assert.deepEqual([hills.sprite.x, hills.sprite.y], [0, -48], 'two tiles down the map at half speed: the strip stands one tile above the screen\'s top');
    // As tall as the screen and as wide as the picture: one column of it, fixed to the screen's left at follow 0.
    assert.deepEqual(shower.sprite.size, [300, 624]);
    assert.deepEqual([shower.sprite.x, shower.sprite.y, shower.sprite.origin.x], [0, 0, 0]);
    assert.deepEqual(fog.sprite.size, [816, 624], 'a layer that repeats both ways still covers the screen');
    // The map scrolls both ways: the strip loops across and moves up as a whole; nothing is made or resized.
    const counts = Object.assign({}, game.counts);
    const seen = [];
    for (const [x, y] of [[4, 2], [10, 2], [10, 8], [24, 30]]) { game.map.displayX = x; game.map.displayY = y; game.update(); seen.push([hills.sprite.origin.x, hills.sprite.y, hills.sprite.origin.y]); }
    assert.deepEqual(seen, [[96, -48, 0], [240, -48, 0], [240, -192, 0], [576 % 512, -720, 0]]);
    assert.deepEqual([fall.sprite.x, fall.sprite.origin.x, fall.sprite.origin.y], [-24 * 48, 0, (30 * 48) % 400], 'the waterfall moved left with the map and tiles on down it');
    assert.deepEqual(hills.sprite.size, [816, 256]);
    assert.deepEqual([game.counts.sprites, game.counts.tilings, game.counts.moves], [counts.sprites, counts.tilings, counts.moves], 'scrolling makes nothing and resizes nothing');
    // The speed down the screen of an across-only layer, and across of a down-only one, does nothing.
    game.update(60);
    assert.equal(hills.sprite.y, -720, 'the strip does not slide away');
    assert.equal(shower.sprite.x, 0);
    assert.ok(shower.sprite.origin.y > 0 && shower.sprite.origin.y < 400, 'the rain falls, wrapped by its picture');
    assert.equal(shower.sprite.origin.x, 0);
    // A screen shake moves the map: the strip moves with it by as much as it follows the map.
    game.map.displayX = 0; game.map.displayY = 0; game.update();
    game.duringBaseUpdate = spriteset => { spriteset.x = 0; spriteset.y = 16; };
    game.update();
    assert.deepEqual([hills.sprite.x, hills.sprite.y, shower.sprite.y], [0, -8, -16], 'half of the 16 pixels for follow 0.5; the rain stays on the screen');
    game.duringBaseUpdate = null;
});

test('one-direction layers on a 3D map lie on the screen: the strip at its top, the column at its left', () => {
    const strip = picture(512, 256, () => 255);
    const game = makeGame({ files: { Clouds: strip, Rain: strip }, map: { displayX: 40, displayY: 30 }, layers: [
        { name: 'Clouds', layer: 'over', fit: 'repeat', repeat: 'x', follow: 1, drift: [20, 0] },
        { name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', follow: 1, drift: [0, 60] }] });
    const createTilemap = game.context.Spriteset_Map.prototype.createTilemap;
    game.context.Spriteset_Map.prototype.createTilemap = function() { this._reactor3d = { scene: {} }; createTilemap.call(this); };
    game.open();
    game.update(60);
    const [clouds, shower] = game.layers();
    assert.deepEqual([clouds.sprite.size, clouds.sprite.x, clouds.sprite.y, clouds.sprite.origin.y], [[816, 256], 0, 0, 0]);
    assert.equal(clouds.sprite.origin.x, 512 - 20, 'it still scrolls across: 61 frames at 20 pixels a second, on whole pixels');
    assert.deepEqual([shower.sprite.size, shower.sprite.x, shower.sprite.y, shower.sprite.origin.x], [[512, 624], 0, 0, 0]);
    assert.equal(shower.sprite.origin.y, 256 - 61);
});

test('a looping map: a layer that repeats one way stays in the lap in view the other way', () => {
    const strip = picture(512, 256, () => 255);
    const game = makeGame({ files: { Hills: strip }, map: { loopX: true, loopY: true, width: 40, height: 40, displayX: 39, displayY: 39 },
        layers: [{ name: 'Hills', layer: 'back', fit: 'repeat', repeat: 'x', follow: 1 }] });
    game.open();
    const [hills] = game.layers();
    const seen = [];
    for (const [x, y] of [[39, 39], [39.5, 39.5], [0, 0], [0.5, 0.5]]) { game.map.displayX = x; game.map.displayY = y; game.update(); seen.push([hills.sprite.origin.x, hills.sprite.y]); }
    // Across, half a tile is 24 pixels at the seam as anywhere; down, the strip lies on the map's top row, which is in view again after the seam.
    const steps = seen.slice(1).map((value, index) => ((value[0] - seen[index][0]) % 512 + 512) % 512);
    assert.deepEqual(steps, [24, 24, 24]);
    assert.deepEqual(seen.map(value => value[1]), [-1872, -1896, 0, -24]);
});

test('a missing base picture draws nothing, says so once, and never reaches the engine\'s error screen', () => {
    const game = makeGame({ files: {}, layers: [{ name: 'Gone', layer: 'ground' }, { name: 'Gone', layer: 'over' }] });
    game.open();
    game.update(5);
    assert.equal(game.context.warnings.length, 1);
    assert.match(game.context.warnings[0], /img\/parallaxes\/Gone/);
    assert.equal(game.api._state.pictures.size, 0);
    assert.equal(game.Bitmap._loadWatchList.length, 0);
    assert.equal(game.loads.every(bitmap => bitmap.destroyed), true);
    // The source never touches ImageManager's cache, where an error would stop the next scene.
    assert.doesNotMatch(source, /ImageManager\.(loadParallax|loadBitmap|_cache)/);
});

test('the map opens once its layers\' pictures have loaded or failed, and never waits forever', () => {
    const game = makeGame({ autoLoad: false, layers: [{ name: 'Slow', layer: 'ground' }, { name: 'Gone', layer: 'over' }, { name: 'Never', layer: 'over' }] });
    game.open();
    const scene = new game.context.Scene_Map();
    scene._spriteset = game.spriteset;
    assert.equal(scene.isReady(), false);
    game.loads[0].finish(solid);
    assert.equal(scene.isReady(), false, 'two still loading');
    game.loads[1].fail();
    assert.equal(scene.isReady(), false, 'one still loading');
    assert.equal(game.layers()[0].sprite.bitmap, game.loads[0]);
    let polls = 0;
    while (!scene.isReady() && polls < 1000) polls++;
    assert.ok(polls > 500 && polls < 700, 'about ten seconds of frames, then the map opens without the picture');
    const empty = new game.context.Scene_Map();
    assert.equal(empty.isReady(), true, 'a scene with no spriteset yet is not held');
});

test('same as characters: one strip per row of the screen, moved and re-framed as the map scrolls, nothing created', () => {
    const scenery = picture(60 * TILE, 40 * TILE, () => 0);
    const game = makeGame({ files: { Scenery: scenery }, map: { width: 60, height: 40 }, layers: [{ name: 'Scenery', layer: 'same' }] });
    game.open();
    const [layer] = game.layers();
    assert.equal(layer.strips.length, Math.ceil(624 / 48) + 1, 'the rows the screen can show, plus one');
    assert.equal(game.counts.sprites, layer.strips.length);
    const rows = () => Array.from(layer.strips).filter(strip => strip.visible).map(strip => strip.frame[1] / TILE);
    assert.deepEqual(rows(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.ok(layer.strips.every(strip => strip.z === 3 && strip.frame[2] === 60 * TILE && strip.frame[3] === TILE));
    game.map.displayX = 3.25; game.map.displayY = 10.5; game.update();
    assert.deepEqual(rows(), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    assert.ok(layer.strips.every(strip => strip.x === -156));
    assert.deepEqual(Array.from(layer.strips).slice(0, 2).map(strip => [strip.y, strip._reactorSortY]), [[-24, 24.5], [24, 72.5]]);
    assert.equal(layer.strips[0]._reactorSortY, L.stripSortY(10, 10.5, TILE));
    // Scrolling a whole screen down the map, a sixteenth of a tile a frame.
    const frames = game.counts.frames;
    for (let i = 0; i < 16 * 13; i++) { game.map.displayY += 1 / 16; game.update(); }
    assert.equal(game.counts.sprites, layer.strips.length, 'no sprite was created while the map scrolled');
    assert.ok(game.counts.frames - frames <= 14 * 14, 'a strip is re-framed only when its row changes');
    // The bottom of the map: rows past the picture are not drawn.
    game.map.displayY = 38.5; game.update();
    assert.deepEqual(rows(), [38, 39]);
});

test('solid tiles of a same-as-characters layer stop walking, boats, ships and landing, in every direction', () => {
    // A house on tiles 3..4 x 2..3, with a soft shadow on tile 5,3.
    const sheet = picture(21 * TILE, 15 * TILE, (x, y) => {
        const tx = x / TILE, ty = y / TILE;
        if (tx >= 3 && tx < 5 && ty >= 2 && ty < 4) return 255;
        if (tx >= 5 && tx < 6 && ty >= 3 && ty < 4) return 90;
        return 0;
    });
    const game = makeGame({ files: { Scenery: sheet }, layers: [{ name: 'Scenery', layer: 'same' }] });
    const map = game.context.$gameMap;
    assert.equal(game.blocked(3, 2), false, 'before the map is shown the layer is not there');
    game.open();
    for (const [x, y] of [[3, 2], [4, 2], [3, 3], [4, 3]]) {
        assert.deepEqual([2, 4, 6, 8].map(d => map.isPassable(x, y, d)), [false, false, false, false], `tile ${x},${y} is closed on all four sides`);
        assert.deepEqual([map.isBoatPassable(x, y), map.isShipPassable(x, y), map.isAirshipLandOk(x, y)], [false, false, false]);
        assert.equal(game.api.isTileBlocked(x, y), true);
    }
    for (const [x, y] of [[2, 2], [5, 2], [5, 3], [3, 1], [3, 4], [0, 0], [20, 14]]) {
        assert.deepEqual([2, 4, 6, 8].map(d => map.isPassable(x, y, d)), [true, true, true, true], `tile ${x},${y} is open`);
        assert.equal(game.api.isTileBlocked(x, y), false);
    }
    assert.equal(game.api.isTileBlocked(-1, 2), false);
    assert.equal(game.api.isTileBlocked(21, 2), false);
    assert.equal(game.counts.canvases, 1, 'the picture was read once');
    // The menu and back: the same picture, the same grid, not read again.
    game.spriteset.destroy();
    assert.equal(game.blocked(3, 2), false, 'no map on the screen: nothing blocks');
    game.open();
    assert.equal(game.blocked(3, 2), true);
    assert.equal(game.counts.canvases, 1);
    // Another map's data: the grid of the map left behind does not apply to it.
    game.context.$dataMap = { width: 21, height: 15 };
    assert.equal(game.blocked(3, 2), false);
});

test('the blocked tiles go while the layer is hidden by its switch, and follow the picture when the version changes', () => {
    const house = at => picture(21 * TILE, 15 * TILE, (x, y) => Math.floor(x / TILE) === at && Math.floor(y / TILE) === 2 ? 255 : 0);
    const game = makeGame({ files: { Town: house(3), 'Town-1': house(6) }, layers: [{ name: 'Town', layer: 'same', switch: 7, variable: 4, versions: { 1: 'Town-1' } }] });
    game.open();
    assert.equal(game.blocked(3, 2), false, 'the switch is off: the layer is hidden and blocks nothing');
    game.setSwitch(7, true); game.update();
    assert.deepEqual([game.blocked(3, 2), game.blocked(6, 2)], [true, false]);
    game.setVariable(4, 1); game.update();
    assert.deepEqual([game.blocked(3, 2), game.blocked(6, 2)], [false, true], 'version 1 has its house elsewhere');
    game.setVariable(4, 0); game.update();
    assert.deepEqual([game.blocked(3, 2), game.blocked(6, 2)], [true, false]);
    assert.equal(game.counts.canvases, 2, 'each picture was read once, not once per change');
    game.setSwitch(7, false); game.update();
    assert.deepEqual([game.blocked(3, 2), game.blocked(6, 2)], [false, false]);
    assert.equal(game.api._state.solids, null, 'nothing is consulted while it is hidden');
});

test('a frame on which nothing changed reads no switch or variable and creates nothing', () => {
    const fog = picture(256, 256, () => 120);
    const game = makeGame({ files: { Ground: solid, Trees: solid, Fog: fog, Vignette: fog, '7_Ground': solid, '7-2_Ground': solid }, layers: [
        { name: 'Fog', layer: 'back', fit: 'repeat', follow: 0.5 },
        { name: '7_Ground', layer: 'ground', variable: 4, variantName: '7-%1_Ground' },
        { name: 'Trees', layer: 'same' },
        { name: 'Fog', layer: 'over', fit: 'repeat', drift: [20, 5], blendMode: 1, switch: 7, fade: 1 },
        { name: 'Fog', layer: 'over', fit: 'repeat', drift: [-8, 0], blendMode: 2, when: { variable: 3, op: '>=', value: 3 } },
        { name: 'Vignette', layer: 'over', fit: 'fill' }] });
    game.setVariable(4, 2); game.setVariable(3, 3);
    game.open();
    game.update(5);
    const counts = Object.assign({}, game.counts);
    const layers = game.layers();
    const names = layers.map(layer => layer.name);
    const origins = layers.map(layer => layer.sprite && layer.sprite.origin);
    const children = game.tilemap.children.length;
    for (let i = 0; i < 600; i++) { game.map.displayX += 1 / 32; game.map.displayY += 1 / 64; game.update(); }
    assert.deepEqual([game.counts.switchReads, game.counts.variableReads], [counts.switchReads, counts.variableReads], 'conditions are not read again until something changes');
    assert.deepEqual([game.counts.sprites, game.counts.tilings, game.counts.loads, game.counts.canvases], [counts.sprites, counts.tilings, counts.loads, counts.canvases]);
    assert.equal(game.tilemap.children.length, children);
    layers.forEach((layer, index) => {
        assert.equal(layer.name, names[index]);
        if (layer.sprite) assert.equal(layer.sprite.origin, origins[index], 'the origin is written into the same object every frame');
    });
    assert.equal(layers[1].name, '7-2_Ground');
    // Something else changes every frame (a parallel event counting): the layers' pictures are not named or loaded again.
    for (let i = 0; i < 100; i++) { game.setVariable(15, i); game.update(); }
    assert.deepEqual([game.counts.sprites, game.counts.tilings, game.counts.loads, game.counts.canvases], [counts.sprites, counts.tilings, counts.loads, counts.canvases]);
    assert.equal(layers[1].name, '7-2_Ground');
    // A hidden layer costs a flag: its sprite is not moved while it is off.
    const hidden = layers[3];
    assert.equal(hidden.live, false);
    const origin = Object.assign({}, hidden.sprite.origin);
    game.update(30);
    assert.deepEqual(Object.assign({}, hidden.sprite.origin), origin);
});

test('pictures are let go with the map\'s other images, and a destroyed map releases its hold on passability', () => {
    const sheet = picture(21 * TILE, 15 * TILE, (x, y) => x < TILE && y < TILE ? 255 : 0);
    const game = makeGame({ files: { Scenery: sheet, Fog: sheet }, layers: [{ name: 'Scenery', layer: 'same' }, { name: 'Fog', layer: 'over', fit: 'repeat' }] });
    for (let transfer = 0; transfer < 10; transfer++) {
        game.open();
        game.update(3);
        assert.equal(game.api._state.pictures.size, 2);
        assert.equal(game.blocked(0, 0), true);
        // A transfer: the engine clears its images while the old map still exists, then the old map is destroyed.
        game.context.ImageManager.clear();
        assert.equal(game.api._state.pictures.size, 0);
        game.spriteset.destroy();
        assert.equal(game.spriteset._rrImageLayers, null);
        assert.equal(game.api._state.solids, null);
        assert.equal(game.blocked(0, 0), false);
    }
    assert.equal(game.ImageManager.cleared, 10, 'the engine\'s own clearing still ran');
    assert.equal(game.loads.length, 20);
    assert.equal(game.loads.every(bitmap => bitmap.destroyed), true, 'every picture loaded for a map left behind was destroyed');
});

test('a spriteset whose map the game has left holds still', () => {
    const game = makeGame({ files: { A: solid }, layers: [{ name: 'A', layer: 'ground' }] });
    game.open();
    const [layer] = game.layers();
    game.map.id = 9;                        // the game moved on; this spriteset was built for map 7
    game.map.displayX = 5;
    game.update();
    assert.equal(layer.sprite.x, 0);
});

test('a character standing where a layer turns solid can step off it in every direction, and nobody steps onto it', () => {
    const gate = picture(21 * TILE, 15 * TILE, (x, y) => Math.floor(y / TILE) === 5 && (Math.floor(x / TILE) === 5 || Math.floor(x / TILE) === 9 || Math.floor(x / TILE) === 10) ? 255 : 0);
    const game = makeGame({ files: { Gate: gate }, layers: [{ name: 'Gate', layer: 'same', switch: 7 }] });
    game.open();
    const off = (x, y) => [2, 4, 6, 8].map(d => game.canStep(x, y, d));
    const onto = (x, y) => [[x, y - 1, 2], [x + 1, y, 4], [x - 1, y, 6], [x, y + 1, 8]].map(([fromX, fromY, d]) => game.canStep(fromX, fromY, d));
    assert.deepEqual([off(5, 5), onto(5, 5)], [[true, true, true, true], [true, true, true, true]], 'the gate is off: a tile like any other');
    game.setSwitch(7, true); game.update();
    assert.deepEqual(off(5, 5), [true, true, true, true], 'the gate closed on someone: they are not held where they stand');
    assert.deepEqual(onto(5, 5), [false, false, false, false], 'and once off it there is no way back on');
    assert.equal(game.blocked(5, 5), true, 'asked of the map, the tile is closed on every side');
    assert.equal(game.api.isTileBlocked(5, 5), true);
    // Two solid tiles side by side: stepping off one never means stepping onto the other.
    assert.deepEqual(off(9, 5), [true, true, false, true], 'down, left and up are open; right is the other solid tile');
    assert.deepEqual(off(10, 5), [true, false, true, true]);
    // The map's own tiles still answer for the tile left: an impassable tile under the paint holds as it always did.
    game.map.passable = (x, y) => !(x === 5 && y === 5);
    assert.deepEqual(off(5, 5), [false, false, false, false]);
    assert.equal(game.api._state.leaving, false, 'nothing is left noted once a step has been answered');
    // No solid layer on the map: the engine's own question is passed on untouched.
    const plain = makeGame({ layers: [], map: { passable: (x, y) => !(x === 2 && y === 2) } });
    plain.open();
    assert.deepEqual([plain.canStep(2, 2, 6), plain.canStep(1, 2, 6), plain.canStep(3, 3, 6)], [false, false, true]);
});

test('a drifting layer goes on from where it was when the map is built again, and starts over on another map', () => {
    const fog = picture(256, 256, () => 120);
    const game = makeGame({ files: { Fog: fog }, layers: [{ name: 'Fog', layer: 'over', fit: 'repeat', drift: [30, 12] }] });
    const at = frames => [(((Math.ceil(-30 * frames / 60)) % 256) + 256) % 256, (((Math.ceil(-12 * frames / 60)) % 256) + 256) % 256];
    const origin = () => [game.layers()[0].sprite.origin.x, game.layers()[0].sprite.origin.y];
    game.open(); game.update(149);
    assert.deepEqual(origin(), at(150));
    // The menu and back, a battle and back, a transfer inside the map: the spriteset is built again.
    game.spriteset.destroy(); game.open();
    assert.deepEqual(origin(), at(151), 'one frame on, not back at the start');
    game.update(300);
    assert.deepEqual(origin(), at(451));
    // Another map: its layers start their drift at the beginning.
    game.spriteset.destroy(); game.map.id = 8; game.open();
    assert.deepEqual(origin(), at(1));
});

test('a layer whose own picture is missing shows its versions, and nothing at all in between', () => {
    const sheet = picture(21 * TILE, 15 * TILE, (x, y) => x < TILE && y < TILE ? 255 : 0);
    const game = makeGame({ files: { 'Ghost-1': sheet }, layers: [{ name: 'Ghost', layer: 'same', variable: 4, versions: { 1: 'Ghost-1', 2: 'Ghost-2' } }, { name: 'Ghost', layer: 'over', variable: 4, variantName: 'Ghost-%1' }] });
    game.open(); game.update(3);
    const seen = () => { const [rows, over] = game.layers(); return [rows.strips.filter(strip => strip.visible).length, over.sprite.visible, game.blocked(0, 0)]; };
    assert.deepEqual(seen(), [0, false, false]);
    game.setVariable(4, 1); game.update(3);
    assert.deepEqual(seen(), [14, true, true], 'version 1 has a file');
    game.setVariable(4, 0); game.update(3);
    assert.deepEqual(seen(), [0, false, false], 'back at 0: the picture of version 1 is not left on the screen, and does not block');
    game.setVariable(4, 1); game.update(3);
    assert.deepEqual(seen(), [14, true, true]);
    game.setVariable(4, 2); game.update(3);
    assert.deepEqual(seen(), [0, false, false], 'a version with no file shows the layer\'s own picture, which is nothing');
    assert.deepEqual(game.context.warnings, ['Image layer: img/parallaxes/Ghost is missing; the layer draws nothing.'], 'said once for the map, not at every change');
    // The menu and back with the variable at 2: nothing is drawn and the disk is not asked again.
    const loads = game.counts.loads;
    game.spriteset.destroy(); game.open(); game.update(3);
    assert.deepEqual([seen(), game.counts.loads, game.context.warnings.length], [[0, false, false], loads, 1]);
    assert.equal(game.Bitmap._loadWatchList.filter(bitmap => bitmap._loadingState === 'error').length, 0);
});

test('a version dropped before its load ends is let go when it fails: the engine is never left a failed picture to retry', () => {
    const game = makeGame({ autoLoad: false, layers: [{ name: 'G', layer: 'ground', variable: 4, variantName: 'G-%1' }] });
    game.open();
    game.loads[0].finish(solid); game.update();
    const [layer] = game.layers();
    const find = name => game.loads.filter(bitmap => bitmap._url === `img/parallaxes/${name}.png`).pop();
    const failedAndWatched = () => game.Bitmap._loadWatchList.filter(bitmap => bitmap._loadingState === 'error').length;
    game.setVariable(4, 3); game.update();          // G-3 is loading
    assert.equal(layer.sprite.bitmap, game.loads[0], 'the picture shown stays until the new one has arrived');
    assert.equal(layer.sprite.visible, true);
    game.setVariable(4, 2); game.update();          // G-2 is loading; nobody waits for G-3 any more
    find('G-3').fail(); find('G-2').finish(solid); game.update();
    assert.equal(layer.sprite.bitmap, find('G-2'));
    assert.deepEqual([find('G-3').destroyed, game.Bitmap._loadWatchList.includes(find('G-3'))], [true, false]);
    assert.deepEqual([...game.api._state.pictures.keys()], ['G', 'G-2']);
    assert.equal(game.api._state.orphans.length, 0);
    // A variable that counts: thirty values with no file, one a frame, each load failing a moment after it began.
    for (let value = 100; value < 130; value++) {
        game.setVariable(4, value); game.update();
        const before = find('G-' + (value - 1));
        if (before) before.fail();
    }
    find('G-129').fail(); game.update(2);
    assert.equal(layer.sprite.bitmap, game.loads[0], 'the last value has no file: the layer\'s own picture');
    assert.deepEqual([failedAndWatched(), game.api._state.pictures.size, game.api._state.orphans.length], [0, 2, 0]);
    assert.equal(game.loads.filter(bitmap => bitmap._loadingState === 'error').every(bitmap => bitmap.destroyed), true);
    // The value comes back before its picture failed: one load, shown when it arrives.
    game.setVariable(4, 7); game.update();
    game.setVariable(4, 8); game.update();
    game.setVariable(4, 7); game.update();
    assert.equal(game.loads.filter(bitmap => bitmap._url === 'img/parallaxes/G-7.png').length, 1);
    find('G-7').finish(solid); find('G-8').fail(); game.update();
    assert.deepEqual([layer.sprite.bitmap === find('G-7'), failedAndWatched(), game.api._state.orphans.length], [true, 0, 0]);
    // The map is left for the menu while a dropped picture is still loading and fails there: gone when the map is back.
    game.setVariable(4, 9); game.update();
    game.setVariable(4, 7); game.update();
    game.spriteset.destroy();
    find('G-9').fail();
    game.open();
    assert.deepEqual([failedAndWatched(), find('G-9').destroyed], [0, true]);
    // It fails in the very frame the map is left: let go as the map goes, not ten seconds into the menu.
    game.setVariable(4, 11); game.update();
    game.setVariable(4, 7); game.update();
    find('G-11').fail();
    game.spriteset.destroy();
    assert.deepEqual([failedAndWatched(), find('G-11').destroyed], [0, true]);
    game.open();
    // A transfer while pictures are still loading: every one leaves the engine's watch before it is destroyed.
    game.setVariable(4, 10); game.update();
    game.context.ImageManager.clear();
    assert.equal(game.Bitmap._loadWatchList.length, 0);
    assert.equal(game.loads.every(bitmap => bitmap.destroyed), true);
});

test('a picture that fails while the menu is open is let go before the engine\'s load watch can retry or report it', () => {
    const game = makeGame({ autoLoad: false, layers: [{ name: 'G', layer: 'ground', variable: 4, variantName: 'G-%1' }] });
    game.open();
    game.loads[0].finish(solid); game.update();
    const find = name => game.loads.filter(bitmap => bitmap._url === `img/parallaxes/${name}.png`).pop();
    // Version 6 is asked for and dropped, version 5 is the one the layer waits for: both still loading as the menu opens.
    game.setVariable(4, 6); game.update();
    game.setVariable(4, 5); game.update();
    game.spriteset.destroy();
    game.Bitmap._sweepStalledLoads();
    assert.deepEqual([find('G-5').destroyed, find('G-6').destroyed], [undefined, undefined], 'a picture that is only slow is left alone');
    // Both fail while the menu is up, and the engine looks at its loading pictures.
    find('G-6').fail(); find('G-5').fail();
    game.Bitmap._sweepStalledLoads();
    assert.deepEqual(game.retried, [], 'the engine found no failed picture of a layer on its list');
    assert.deepEqual([find('G-5').destroyed, find('G-6').destroyed, game.Bitmap._loadWatchList.length], [true, true, 1]);
    assert.deepEqual([...game.api._state.pictures.keys()], ['G']);
    assert.equal(game.api._state.orphans.length, 0);
    // Back on the map with the variable still at 5: the layer's own picture, and the disk is not asked again.
    const loads = game.counts.loads;
    game.open(); game.update(2);
    assert.equal(game.layers()[0].sprite.bitmap, game.loads[0]);
    assert.equal(game.counts.loads, loads);
    // A picture still loading when the map comes back is the one the new map waits for: one load, shown when it arrives.
    game.setVariable(4, 7); game.update();
    game.spriteset.destroy();
    game.Bitmap._sweepStalledLoads();
    game.open();
    find('G-7').finish(solid); game.update();
    assert.equal(game.layers()[0].sprite.bitmap, find('G-7'));
    assert.equal(game.loads.filter(bitmap => bitmap._url === 'img/parallaxes/G-7.png').length, 1);
    assert.deepEqual([game.retried, game.api._state.orphans.length], [[], 0]);
    // The engine's own watch still runs, and still sees what is not a layer's picture.
    const other = game.Bitmap.load('img/pictures/Other.png');
    other.fail();
    game.Bitmap._sweepStalledLoads();
    assert.deepEqual(game.retried, ['img/pictures/Other.png']);
});

test('a blank the engine hands back for a missing file counts as missing, not as a picture', () => {
    const game = makeGame({ autoLoad: false, layers: [{ name: '7_Ground', layer: 'ground', variable: 4, versions: { 1: '7_Night' } }] });
    game.open();
    game.loads[0].finish(solid); game.update();
    game.setVariable(4, 1); game.update();
    game.loads[1].degrade(); game.update();
    assert.equal(game.layers()[0].sprite.bitmap, game.loads[0], 'the layer\'s own picture, not a blank');
    assert.equal(game.loads[1].destroyed, true);
});

test('a shaken or zoomed screen stays covered: a fill layer keeps to the screen, a repeating one moves with the map as far as it follows it', () => {
    const fog = picture(256, 256, () => 120);
    const game = makeGame({ files: { Vignette: picture(816, 624, () => 200), Fog: fog }, map: { displayX: 2 }, layers: [
        { name: 'Vignette', layer: 'over', fit: 'fill' },
        { name: 'Fog', layer: 'over', fit: 'repeat' },
        { name: 'Fog', layer: 'over', fit: 'repeat', follow: 0 }] });
    game.open();
    const [vignette, onMap, onScreen] = game.layers();
    assert.deepEqual([vignette.sprite.x, onMap.sprite.x, onMap.sprite.origin.x, onScreen.sprite.origin.x], [0, 0, 96, 0]);
    // The engine's own update moves the spriteset 24 pixels right for a shake; the layers answer in the same frame.
    game.duringBaseUpdate = spriteset => { spriteset.x = 24; };
    game.update();
    assert.deepEqual([vignette.sprite.x, vignette.sprite.scale.x, vignette.sprite.scale.y], [-24, 1, 1], 'the fill layer is back over exactly the screen');
    assert.deepEqual([onMap.sprite.x, onMap.sprite.size, onScreen.sprite.x], [-24, [816, 624], -24], 'the repeating layers start at the screen\'s edge');
    assert.equal(onMap.sprite.origin.x, 96 - 24, 'a layer that lies on the map shakes with it');
    assert.equal(onScreen.sprite.origin.x, 0, 'a layer that stays on the screen does not');
    game.duringBaseUpdate = spriteset => { spriteset.x = -18; };
    game.update();
    assert.deepEqual([vignette.sprite.x, onMap.sprite.x, onMap.sprite.origin.x, onScreen.sprite.origin.x], [18, 18, 96 + 18, 0]);
    // A screen zoom of 2 about the middle of the screen, as Game_Screen asks it of the spriteset.
    game.duringBaseUpdate = spriteset => { spriteset.scale.x = spriteset.scale.y = 2; spriteset.x = -408; spriteset.y = -312; };
    game.update();
    assert.deepEqual([vignette.sprite.x, vignette.sprite.y, vignette.sprite.scale.x, vignette.sprite.scale.y], [204, 156, 0.5, 0.5], 'half the size in a space drawn twice as large');
    assert.deepEqual([onMap.sprite.x, onMap.sprite.y, onMap.sprite.size], [204, 156, [408, 312]]);
    assert.deepEqual([onMap.sprite.origin.x, onMap.sprite.origin.y, onScreen.sprite.origin.x], [(96 + 204) % 256, 156, 0]);
    // The 2D camera zoom scales the map inside the spriteset; both count.
    game.spriteset._baseSprite.scale.x = 2;
    game.update();
    assert.deepEqual([vignette.sprite.x, vignette.sprite.scale.x, onMap.sprite.size], [102, 0.25, [204, 156]]);
    const moves = game.counts.moves;
    game.update(10);
    assert.equal(game.counts.moves, moves, 'while the view holds still nothing is written again');
});

test('the layers on the map are placed before the engine sorts its sprites, the layers on the screen after it has moved', () => {
    const game = makeGame({ files: { Trees: solid, Ground: solid }, layers: [{ name: 'Trees', layer: 'same', blendMode: 1, opacity: 200, switch: 7, fade: 0.5 }, { name: 'Ground', layer: 'ground' }] });
    game.setSwitch(7, true);
    game.open();
    const [trees, ground] = game.layers();
    const during = [];
    game.duringBaseUpdate = () => { during.push([trees.strips[0].y, trees.strips[0]._reactorSortY, trees.strips[0].frame[1], ground.sprite.y]); };
    game.map.displayY = 1.5; game.update();
    // Row 1 is the first in view: its top is 24 pixels above the screen, and it sorts just past its bottom.
    assert.deepEqual(during.pop(), [L.stripY(1, 1.5, TILE), L.stripSortY(1, 1.5, TILE), TILE, -72]);
    assert.deepEqual([L.stripY(1, 1.5, TILE), L.stripSortY(1, 1.5, TILE)], [-24, 24.5]);
    // Blend mode and opacity reach every strip, and a fade is drawn on them as on any layer.
    assert.ok(trees.strips.every(strip => strip.blendMode === 1 && strip.opacity === 200));
    game.setSwitch(7, false); game.update(15);
    assert.ok(trees.strips.every(strip => Math.abs(strip.opacity - 200 * L.ease(0.5)) < 1e-9), 'half way out: half the layer\'s opacity');
    assert.equal(game.blocked(3, 3), false, 'a layer on its way out no longer blocks');
    game.update(15);
    assert.equal(trees.strips.some(strip => strip.visible), false);
});

test('a picture locked to a looping map is drawn lap by lap, a lap being the map: no jump at the seam, whatever the picture\'s size', () => {
    const small = picture(10 * TILE, 15 * TILE, () => 255);
    const wide = picture(30 * TILE, 15 * TILE, () => 255);
    const game = makeGame({ files: { Small: small, Whole: solid, Wide: wide, Trees: solid }, map: { loopX: true }, layers: [
        { name: 'Small', layer: 'ground' }, { name: 'Whole', layer: 'over', blendMode: 1, opacity: 128 }, { name: 'Wide', layer: 'back' }, { name: 'Trees', layer: 'same' }] });
    game.open();
    const [little, whole, large, trees] = game.layers();
    const span = 21 * TILE;
    assert.deepEqual([little.kind, whole.kind, little.copies.length], ['laps', 'laps', 2], 'the laps a screen can show');
    assert.deepEqual([little.copies[0].frame, whole.copies[0].frame, large.copies[0].frame], [[0, 0, 480, 720], [0, 0, 1008, 720], [0, 0, 1008, 720]], 'a picture wider than the map is cut at the map\'s edge');
    assert.ok(whole.copies.every(copy => copy.blendMode === 1 && copy.opacity === 128 && copy.visible));
    assert.equal(trees.strips.length, 14 * 2, 'a row of strips once per lap');
    const mod = value => ((value % span) + span) % span;
    let before = null;
    // Across the map and over its seam: 20.9375 tiles is 3 pixels short of a lap.
    for (const displayX of [0, 5, 10, 20, 20.9375, 0, 0.0625, 7.5]) {
        game.map.displayX = displayX; game.update();
        const scroll = Math.ceil(displayX * TILE);
        for (const layer of [little, whole]) {
            assert.equal(mod(layer.copies[0].x), mod(-scroll), `the picture's left edge is the map's at ${displayX}`);
            assert.equal(layer.copies[1].x - layer.copies[0].x, span);
            assert.ok(layer.copies[0].x <= -TILE && layer.copies[1].x + span >= 816 + TILE, `the screen and a tile each side are inside the laps at ${displayX}`);
        }
        assert.deepEqual([mod(trees.strips[0].x), trees.strips[1].x - trees.strips[0].x, trees.strips[0].y, trees.strips[1].y], [mod(-scroll), span, 0, 0]);
        assert.ok(trees.strips[0].x <= -TILE && trees.strips[1].x + span >= 816 + TILE);
        if (before !== null) assert.equal(mod(before - little.copies[0].x), mod(scroll - before.scroll), 'the picture moved as far as the map did');
        before = Object.assign(Number(little.copies[0].x), { scroll });
    }
    // A map that loops both ways: laps across and down.
    const both = makeGame({ files: { Whole: solid }, map: { loopX: true, loopY: true, displayX: 3, displayY: 14.5 }, layers: [{ name: 'Whole', layer: 'ground' }] });
    both.open();
    const copies = both.layers()[0].copies;
    assert.equal(copies.length, 4);
    for (const copy of copies) assert.deepEqual([mod(copy.x), ((copy.y % 720) + 720) % 720], [mod(-144), 720 - 696]);
    assert.deepEqual([copies[1].x - copies[0].x, copies[2].y - copies[0].y, copies[3].x - copies[2].x], [span, 720, span]);
    // A map that does not loop keeps its one plain sprite.
    const plain = makeGame({ files: { Small: small }, layers: [{ name: 'Small', layer: 'ground' }] });
    plain.open();
    assert.deepEqual([plain.layers()[0].kind, plain.layers()[0].copies], ['map', null]);
});

test('ReactorImageLayers.refresh() builds the running map\'s layers again from a changed list and leaves nothing of the old ones', () => {
    const game = makeGame({ files: { A: solid, B: solid }, layers: [{ name: 'A', layer: 'ground' }, { name: 'B', layer: 'same' }] });
    game.open();
    const old = game.layers().flatMap(layer => layer.strips || [layer.sprite]);
    assert.equal(game.blocked(0, 0), true);
    game.context.$dataMap.rrImageLayers = [{ name: 'B', layer: 'over', fit: 'fill' }];
    game.api.refresh();
    assert.ok(old.every(sprite => sprite.destroyed && !game.tilemap.children.includes(sprite)));
    const layers = game.layers();
    assert.deepEqual([layers.length, layers[0].kind, layers[0].sprite.visible, layers[0].sprite.bitmap._url], [1, 'fill', true, 'img/parallaxes/B.png']);
    assert.equal(game.tilemap.children.length, 1);
    assert.equal(game.blocked(0, 0), false, 'the layer that blocked is gone from the list');
    assert.equal(game.counts.loads, 2, 'pictures already loaded are not loaded again');
    // The list is emptied: nothing remains.
    game.context.$dataMap.rrImageLayers = [];
    game.api.refresh();
    assert.deepEqual([game.spriteset._rrImageLayers, game.tilemap.children.length], [null, 0]);
});

test('the game loads the module after the sprites and scenes it hooks and before compatibility, and ships it', () => {
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    const scripts = read('runtime/reactor_main.js').match(/const\s+scriptUrls\s*=\s*(\[[\s\S]*?\]);/)[1];
    const at = name => scripts.indexOf(`"js/${name}"`);
    assert.ok(at('reactor_image_layers.js') > 0);
    for (const before of ['reactor_objects_map.js', 'reactor_objects_legacy.js', 'reactor_scenes.js', 'reactor_sprites.js', 'reactor_managers.js']) {
        assert.ok(at(before) < at('reactor_image_layers.js'), `${before} loads first`);
    }
    assert.ok(at('reactor_image_layers.js') < at('reactor_mv_compat.js'));
    for (const file of ['editor/build-scripts/build.js', 'editor/build-scripts/build-worker.js', 'editor/build-scripts/dist-editor-worker.js']) {
        assert.match(read(file), /'reactor_image_layers\.js'/, `${file} ships it`);
    }
    // The block that used to live in the sprites file is gone from it: one module owns the layers.
    assert.doesNotMatch(read('runtime/reactor_sprites.js'), /rrImageLayer|RR_IMAGE_LAYER/);
});
