/**
 * A sized event on the map: its footprint is centred on its own tile, as the
 * game counts it, its own square stands in the middle of that footprint (its
 * tile for an odd size, half a tile on for an even one), and with a preview
 * drawn over it (a page's graphic or its model at real size) its outline is
 * still seen, above the model layer.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const MapElevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
const source3D = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');

/** Just enough PIXI to build an event's sprite and read what was drawn. */
function fakePixi() {
    class Container {
        constructor() { this.children = []; this.x = 0; this.y = 0; this.parent = null; this.label = ''; }
        addChild(child) { return this.addChildAt(child, this.children.length); }
        addChildAt(child, index) { child.parent?.removeChild(child); this.children.splice(index, 0, child); child.parent = this; return child; }
        removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) { this.children.splice(i, 1); child.parent = null; } return child; }
        removeChildren() { const gone = this.children.splice(0); for (const child of gone) child.parent = null; return gone; }
        getChildIndex(child) { return this.children.indexOf(child); }
        destroy() { this.destroyed = true; }
    }
    class Graphics extends Container {
        constructor() { super(); this.draws = []; }
        clear() { this.draws.length = 0; return this; }
        rect(...args) { this.draws.push({ rect: args }); return this; }
        fill(style) { this.draws.push({ fill: style }); return this; }
        stroke(style) { this.draws.push({ stroke: style }); return this; }
    }
    class Text extends Container { constructor(options) { super(); this.text = options.text; this.anchor = { set() {} }; } }
    class Sprite extends Container {}
    return { Container, Graphics, Text, Sprite };
}

function manager(accent = '#3366cc') {
    const PIXI = fakePixi();
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    const EventManager = vm.runInNewContext(`${source}\nEventManager;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, RRMapElevation: MapElevation, PIXI,
        ThemeColors: { resolve: name => (name === '--color-accent' ? accent : null) }
    });
    const m = Object.create(EventManager.prototype);
    m.currentMap = { width: 40, height: 30, events: [null,
        { id: 1, x: 5, y: 5, name: 'Gate', pages: [{ image: { tileId: 0, characterName: '' } }] },
        { id: 2, x: 20, y: 8, name: 'Plain', pages: [{ image: { tileId: 0, characterName: '' } }] },
        { id: 3, x: 10, y: 20, name: 'Tank', pages: [{ image: { tileId: 0, characterName: '' } }] }] };
    MapElevation.setEventSize(m.currentMap, 1, [3, 2]);
    MapElevation.setEventSize(m.currentMap, 3, [4, 4]);
    m.tilemapManager = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: new PIXI.Container() };
    m.eventSprites = new Map();
    m.selectedEvent = null;
    m.labelResolution = () => 1;
    return { m, PIXI, EventManager };
}

const rects = graphics => graphics.draws.filter(d => d.rect).map(d => d.rect);

test('the marker of a sized event is offset to the middle of its footprint', () => {
    const map = { width: 9, height: 9, events: [] };
    assert.deepEqual(MapElevation.eventMarkerOffset(map, 7), [0, 0], 'an ordinary event stands on its tile');
    MapElevation.setEventSize(map, 7, [3, 2]);
    assert.deepEqual(MapElevation.eventMarkerOffset(map, 7), [0, 0.5], '3 wide: its own tile is the middle; 2 deep: half a tile on');
    assert.deepEqual(MapElevation.eventFootprintOrigin(map, 7), [-1, 0], 'the footprint starts a tile left of it');
    MapElevation.setEventSize(map, 7, [4, 4]);
    assert.deepEqual(MapElevation.eventMarkerOffset(map, 7), [0.5, 0.5], 'an even size: the middle is a corner four tiles share');
    assert.deepEqual(MapElevation.eventFootprintOrigin(map, 7), [-1, -1]);
    assert.deepEqual(MapElevation.eventSize(map, 7), [4, 4], 'and the footprint itself is untouched');
    assert.equal(map.reactor3d.eventSizeAnchor, 'center', 'the map says its footprints are centred');
    MapElevation.setEventSize(map, 7, [1, 1]);
    assert.equal(map.reactor3d.eventSizeAnchor, undefined, 'the mark goes with the last footprint');
    assert.equal(map.reactor3d.eventSize, undefined);
});

test('2D: the footprint is drawn round the event\'s tile, its square in the middle of it', () => {
    const { m } = manager();
    const sprite = m.createEventSprite(m.currentMap.events[1]);
    assert.deepEqual([sprite.x, sprite.y], [5 * 48, 5 * 48], 'the sprite sits at the event\'s own tile, the footprint\'s middle tile');
    assert.deepEqual(rects(sprite._rrArea)[0], [0, 0, 3 * 48, 2 * 48], 'the footprint covers 3 by 2 tiles');
    assert.deepEqual([sprite._rrArea.x, sprite._rrArea.y], [-48, 0], 'from a tile left of the event: centred on it');
    assert.deepEqual([sprite._rrMarker.x, sprite._rrMarker.y], [0, 24], 'the square, its graphic and its name stand in the middle');
    assert.deepEqual(rects(sprite._rrSquare)[0], [0, 0, 48, 48], 'one tile, inside the marker');
    assert.ok(sprite._rrMarker.children.some(child => child.text === 'Gate'), 'the name rides with the square');
    const plain = m.createEventSprite(m.currentMap.events[2]);
    assert.equal(plain._rrArea, undefined, 'an ordinary event has no footprint drawn');
    assert.deepEqual([plain._rrMarker.x, plain._rrMarker.y], [0, 0]);
    const tank = m.createEventSprite(m.currentMap.events[3]);
    assert.deepEqual([tank._rrArea.x, tank._rrArea.y], [-48, -48], '4 by 4: a tile up and left of the event');
    assert.deepEqual([tank._rrMarker.x, tank._rrMarker.y], [24, 24], 'its square on the corner the four middle tiles share');
});

test('2D: selecting a sized event tones its footprint and its square, and keeps the footprint its size', () => {
    const { m } = manager('#3366cc');
    const event = m.currentMap.events[1];
    const sprite = m.createEventSprite(event);
    m.eventSprites.set(event.id, sprite);
    m.selectedEvent = event;
    m.updateEventSpriteBorder(event.id, true);
    assert.deepEqual(rects(sprite._rrArea)[0], [0, 0, 144, 96], 'the footprint is still the footprint (it used to be redrawn as one tile)');
    const { EventManager } = manager('#3366cc');
    const accent = EventManager.readableTone(0x3366cc);
    assert.equal(sprite._rrArea.draws.find(d => d.stroke).stroke.color, accent, 'in the theme\'s accent');
    assert.equal(sprite._rrSquare.draws.find(d => d.stroke).stroke.color, accent, 'with its square');
    m.updateEventSpriteBorder(event.id, false);
    assert.equal(sprite._rrSquare.draws.find(d => d.stroke).stroke.color, 0xffffff, 'and white again when it is let go');
});

test('theme colours are read as numbers, with a fallback', () => {
    const { EventManager } = manager();
    assert.equal(EventManager.colorNumber('#e0b020', 1), 0xe0b020);
    assert.equal(EventManager.colorNumber('#fc0', 1), 0xffcc00);
    assert.equal(EventManager.colorNumber('rgb(10, 20, 30)', 1), (10 << 16) | (20 << 8) | 30);
    assert.equal(EventManager.colorNumber('rgba(255 128 0 / 0.5)', 1), 0xff8000);
    assert.equal(EventManager.colorNumber('var(--color-accent)', 0xFFD700), 0xFFD700, 'a token the canvas cannot read falls back');
    assert.equal(EventManager.colorNumber(null, 7), 7);
    // The selected tone is drawn over the map: a light theme's dark accent is lightened, a bright one kept.
    assert.equal(EventManager.readableTone(0xd4af37), 0xd4af37, 'gold reads as it is');
    const lightened = EventManager.readableTone(0x00639e);
    const luminance = c => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
    assert.ok(luminance(lightened) >= 0.4 && (lightened & 255) > ((lightened >> 16) & 255), 'a dark blue becomes a light blue');
    assert.equal(EventManager.selectedTone(), EventManager.readableTone(0x3366cc));
});

test('2D: a previewed event keeps an outline above the model layer; others have none', () => {
    const { m, PIXI } = manager();
    const parent = m.tilemapManager.container;
    m.eventContainer = new PIXI.Container(); m.eventContainer.label = 'events';
    const models = new PIXI.Container(); models.label = 'model props';
    const overlay = new PIXI.Container(); overlay.label = 'lighting-overlay';
    for (const layer of [m.eventContainer, models, overlay]) parent.addChild(layer);
    m.currentMap.reactor3d.eventPreviews = { 3: 0 };
    m.renderEventOutlines();
    const outlines = parent.children.find(child => child.label === 'event outlines');
    assert.ok(outlines, 'an outline layer');
    assert.equal(parent.getChildIndex(outlines), parent.getChildIndex(models) + 1, 'directly above the models');
    assert.ok(parent.getChildIndex(outlines) < parent.getChildIndex(overlay), 'and under the editor\'s own overlays');
    assert.equal(outlines.children.length, 1, 'only the previewed event');
    const outline = m.eventOutlines.get(3);
    assert.deepEqual([outline.x, outline.y], [10 * 48, 20 * 48]);
    const drawn = rects(outline);
    assert.deepEqual(drawn[0], [-47.5, -47.5, 4 * 48 - 1, 4 * 48 - 1], 'its footprint, round its tile');
    assert.deepEqual(drawn[2], [24.5, 24.5, 47, 47], 'and its own square in the middle');
    assert.ok(!outline.draws.some(d => d.fill), 'edges only: the model shows through');
    assert.equal(outline.draws.filter(d => d.stroke).pop().stroke.color, 0xffffff, 'white while it is not selected');
    // Selected: the accent.
    m.eventSprites.set(3, m.createEventSprite(m.currentMap.events[3]));
    m.selectedEvent = m.currentMap.events[3];
    m.updateEventSpriteBorder(3, true);
    const selected = m.eventOutlines.get(3);
    assert.notEqual(selected, outline, 'redrawn');
    assert.equal(outlines.children.length, 1);
    assert.equal(selected.draws.filter(d => d.stroke).pop().stroke.color, m.constructor.selectedTone());
    // A second render keeps one layer, in place.
    m.renderEventOutlines();
    assert.equal(parent.children.filter(child => child.label === 'event outlines').length, 1);
    assert.equal(parent.getChildIndex(outlines), parent.getChildIndex(models) + 1);
    // No preview: no outline.
    delete m.currentMap.reactor3d.eventPreviews;
    m.renderEventOutlines();
    assert.equal(outlines.children.length, 0);
});

test('2D: the selection and the hover outline cover a sized event\'s whole footprint', () => {
    const { m, PIXI } = manager();
    m.selectionHighlight = new PIXI.Graphics();
    m.selectedTileX = 5; m.selectedTileY = 5;
    m.updateSelectionHighlight();
    assert.deepEqual(rects(m.selectionHighlight)[0], [4 * 48, 5 * 48, 3 * 48, 2 * 48]);
    m.selectedTileX = 20; m.selectedTileY = 8;
    m.updateSelectionHighlight();
    assert.deepEqual(rects(m.selectionHighlight)[0], [20 * 48, 8 * 48, 48, 48], 'an ordinary event: its tile');
    m.eventMode = true;
    m.hoverHighlight = new PIXI.Graphics();
    m.selectedTileX = null; m.selectedTileY = null;
    m.updateHoverHighlight({ data: { getLocalPosition: () => ({ x: 4 * 48 + 5, y: 6 * 48 + 5 }) } });
    assert.deepEqual(rects(m.hoverHighlight)[0], [4 * 48, 5 * 48, 3 * 48, 2 * 48], 'hovering the far corner of the footprint lights all of it');
    assert.equal(m.getEventAt(7, 5), undefined, 'a tile past the footprint is nobody\'s');
    assert.equal(m.getEventAt(4, 6).id, 1);
    // Another event may stand beside the footprint, not on it.
    assert.equal(m.canPlaceEvent(m.currentMap.events[2], 7, 5), true);
    assert.equal(m.canPlaceEvent(m.currentMap.events[2], 6, 6), false);
    assert.equal(m.canPlaceEvent({ id: null }, 7, 5, [3, 1]), false, 'a pasted 3 wide event reaches a tile left of where it is put');
    assert.equal(m.canPlaceEvent({ id: null }, 8, 5, [3, 1]), true);
});

test('3D: the marker and its label stand in the middle of the footprint; the box stays on the footprint', () => {
    const start = source3D.search(/\n    placeEvent\(mesh\) \{/);
    const body = source3D.slice(start, source3D.indexOf('\n    }\n', start));
    assert.match(body, /RRMapElevation\.eventMarkerOffset\(mapData, event\.id\)/);
    assert.match(body, /const markerX = x \+ offsetX, markerZ = facade \? z : z \+ offsetZ;/);
    assert.match(body, /mesh\.position\.set\(markerX,/);
    assert.match(body, /mesh\.userData\.label\?\.position\.set\(markerX,[^;]*markerZ\)/);
    assert.match(body, /mesh\.userData\.box\?\.position\.set\(x, elevation \+ mesh\.userData\.boxHeight \/ 2, z\)/, 'the box is placed from the event\'s own tile');
    assert.match(source3D, /translate\(\.\.\.MapEditor3D\.eventBoxShift\(footprint, origin\)\)/, 'and shifted to the footprint, which starts `origin` tiles from it');
    const MapEditor3D = vm.runInNewContext(`${source3D}\nMapEditor3D;`, { console, window: {}, document: { addEventListener() {} } });
    assert.deepEqual([...MapEditor3D.eventBoxShift([3, 3], [-1, -1])], [0, 0, 0], 'an odd size: the box is round the event\'s tile');
    assert.deepEqual([...MapEditor3D.eventBoxShift([2, 2], [0, 0])], [0.5, 0, 0.5], 'an even one: round the corner its marker stands on');
    assert.deepEqual([...MapEditor3D.eventBoxShift([4, 3], [-1, -1])], [0.5, 0, 0]);
});

test('3D: the box of a previewed model and of the selected event is drawn over everything', () => {
    const body = name => { const start = source3D.search(new RegExp(`\\n    ${name}\\(`)); return source3D.slice(start, source3D.indexOf('\n    }\n', start)); };
    assert.match(body('eventBoxOnTop'), /box\.material\.depthTest = !on;[\s\S]*box\.renderOrder = on \? 998 : 0;/);
    assert.match(body('previewEventModel'), /marker\.userData\.modelShown = true; this\.eventBoxOnTop\(marker\.userData\.box, true\)/, 'a model standing on its event does not hide the event\'s box');
    assert.match(body('highlightEventBox'), /this\.eventBoxOnTop\(box, on \|\| mesh\.userData\.modelShown === true\)/, 'selected: over everything; let go: by depth again unless a model stands on it');
    assert.match(body('highlight'), /if \(mesh\.userData\.modelPreview\) \{\s*const marker = this\.eventMarker\(mesh\.userData\.event\);\s*if \(marker\) this\.highlightEventBox\(marker, on\);/, 'selecting the model lights its event\'s box');
    assert.match(body('selectedEventColor'), /EventManager\.selectedTone\(\)/, 'the same accent the 2D map uses');
});

test('3D: a sized event is taken hold of by any tile of its footprint and keeps that tile under the pointer', () => {
    const MapEditor3D = vm.runInNewContext(`${source3D}\nMapEditor3D;`, { console, window: {}, document: { addEventListener() {} } });
    const event = { id: 1, x: 10, y: 10 };
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 10, y: 10 }, [3, 3], [-1, -1])], [0, 0], 'by its marker in the middle: its own tile');
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 11, y: 9 }, [3, 3], [-1, -1])], [1, -1], 'by a corner');
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 9, y: 11 }, [3, 3], [-1, -1])], [-1, 1], 'by the opposite one');
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 10, y: 10 }, [1, 1])], [0, 0]);
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 10, y: 3 }, [3, 3], [-1, -1])], [0, 0], 'ground far behind a tall marker: its own tile');
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 12, y: 10 }, [3, 3], [-1, -1])], [0, 0], 'a tile past the footprint is not on it');
    assert.deepEqual([...MapEditor3D.eventGrabOffset(event, { x: 10, y: 3 }, [1, 1])], [0, 0]);
    assert.match(source3D, /this\.dragEventTo\(this\.pointer\.drag, \{ x: tile\.x - heldX, y: tile\.y - heldY \}\)/);
    const start = source3D.search(/\n    eventAt\(clientX, clientY, tile = undefined\) \{/);
    const body = source3D.slice(start, source3D.indexOf('\n    }\n', start));
    assert.match(body, /this\.eventManager\(\)\?\.getEventAt\?\.\(at\.x, at\.y\)/, 'a tile of a sized event\'s footprint answers with the event');
    assert.match(body, /if \(event && \(event\.x !== at\.x \|\| event\.y !== at\.y\)\) return this\.eventMarker\(event\);/, 'by a tile of its footprint other than its own: an ordinary one is picked by its marker');
});

test('a map saved with footprints counted right and down is converted: the events move, the tiles covered stay', () => {
    const tiles = (map, id) => {
        const event = map.events.find(e => e && e.id === id);
        const [w, h] = MapElevation.eventSize(map, id), [ox, oy] = MapElevation.eventFootprintOrigin(map, id);
        const out = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push((event.x + ox + x) + ',' + (event.y + oy + y));
        return out.sort();
    };
    const old = () => ({ width: 40, height: 40, events: [null, { id: 1, x: 5, y: 5 }, { id: 2, x: 20, y: 20 }, { id: 3, x: 9, y: 30 }, { id: 4, x: 1, y: 1 }],
        reactor3d: { version: 1, eventSize: { 1: [3, 2], 2: [4, 4], 3: [2, 5] } } });
    const map = old();
    assert.equal(MapElevation.eventSizeCentered(map), false, 'no mark: counted from the event\'s tile, as 0.98.8 wrote it');
    const before = [1, 2, 3].map(id => tiles(map, id));
    assert.deepEqual(before[0], ['5,5', '5,6', '6,5', '6,6', '7,5', '7,6']);
    assert.equal(MapElevation.convertEventSizes(map), true);
    assert.equal(map.reactor3d.eventSizeAnchor, 'center');
    assert.deepEqual([1, 2, 3].map(id => tiles(map, id)), before, 'every footprint covers the tiles it covered');
    assert.deepEqual(map.events.slice(1).map(e => [e.x, e.y]), [[6, 5], [21, 21], [9, 32], [1, 1]], 'each sized event stands on its footprint\'s middle tile; the others stay');
    assert.deepEqual(map.reactor3d.eventSize, { 1: [3, 2], 2: [4, 4], 3: [2, 5] }, 'the sizes are as they were');
    assert.equal(MapElevation.convertEventSizes(map), false, 'once');
    assert.deepEqual(map.events.slice(1).map(e => [e.x, e.y]), [[6, 5], [21, 21], [9, 32], [1, 1]]);
    // A map with no sized events is left alone, mark and all.
    const plain = { width: 9, height: 9, events: [null, { id: 1, x: 2, y: 2 }], reactor3d: { version: 1 } };
    assert.equal(MapElevation.convertEventSizes(plain), false);
    assert.equal(plain.reactor3d.eventSizeAnchor, undefined);
    // Setting a size on an unconverted map converts it first, so one map never holds both.
    const mixed = old();
    MapElevation.setEventSize(mixed, 4, [3, 3]);
    assert.deepEqual([mixed.events[1].x, mixed.events[4].x, mixed.reactor3d.eventSizeAnchor], [6, 1, 'center']);
    // The editor does it as it reads the sidecar.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    const start = source.indexOf('    loadMapSidecar(mapData) {');
    assert.match(source.slice(start, source.indexOf('\n    }\n', start)), /mapData\.reactor3d = sidecar;[\s\S]*elevation\.convertEventSizes\(mapData\)/);
});

test('the game counts a centred footprint from its middle tile, draws an even one half a tile on, and reads an unmarked map as before', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    const from = source.indexOf('Reactor3D.EVENT_SIZE_MAX = 64;'), to = source.indexOf('/** The height a character may rise to');
    assert.ok(from > 0 && to > from);
    function Game_Character() {}
    Game_Character.prototype.screenX = function() { return this._x * 48 + 24; };
    Game_Character.prototype.screenY = function() { return this._y * 48 + 48; };
    function Game_Event() {}
    Game_Event.prototype = Object.create(Game_Character.prototype);
    Game_Event.prototype.pos = function(x, y) { return this._x === x && this._y === y; };
    const context = { Reactor3D: {}, Game_Character, Game_Event, $dataMap: null, $gameMap: { tileWidth: () => 48, tileHeight: () => 48 }, Math, Number, Array, Object, String };
    vm.runInNewContext(source.slice(from, to) + '\nReactor3D.installEventFootprints();', context);
    const event = (id, x, y) => Object.assign(new Game_Event(), { _eventId: id, _x: x, _y: y });
    const covered = e => { const out = []; for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (e.pos(x, y)) out.push(x + ',' + y); return out; };
    // Centred.
    context.$dataMap = { reactor3d: { eventSizeAnchor: 'center', eventSize: { 1: [3, 3], 2: [2, 2], 3: [4, 1] } } };
    assert.deepEqual(covered(event(1, 10, 10)), ['9,9', '10,9', '11,9', '9,10', '10,10', '11,10', '9,11', '10,11', '11,11'], '3 by 3: a tile every way');
    assert.deepEqual(covered(event(2, 10, 10)), ['10,10', '11,10', '10,11', '11,11'], '2 by 2: its tile and the one on');
    assert.deepEqual(covered(event(3, 10, 10)), ['9,10', '10,10', '11,10', '12,10'], '4 wide: one before, two after');
    assert.deepEqual(covered(event(9, 4, 4)), ['4,4'], 'an event with no size is its tile');
    assert.deepEqual([event(1, 10, 10).screenX(), event(1, 10, 10).screenY()], [504, 528], 'an odd size is drawn on its tile');
    assert.deepEqual([event(2, 10, 10).screenX(), event(2, 10, 10).screenY()], [528, 552], 'an even one half a tile on, at its footprint\'s middle');
    assert.deepEqual([event(3, 10, 10).screenX(), event(3, 10, 10).screenY()], [528, 528], 'along the even axis only');
    assert.equal(context.Reactor3D.eventGraphicOffset(event(1, 10, 10)), null, 'nothing to add for an odd size');
    assert.deepEqual([...context.Reactor3D.eventGraphicOffset(event(2, 10, 10))], [0.5, 0.5]);
    // No mark (a 0.98.8 map nobody has opened in the editor since): right and down, drawn on its tile.
    context.$dataMap = { reactor3d: { eventSize: { 1: [3, 3], 2: [2, 2] } } };
    assert.deepEqual(covered(event(1, 10, 10)), ['10,10', '11,10', '12,10', '10,11', '11,11', '12,11', '10,12', '11,12', '12,12']);
    assert.deepEqual([event(2, 10, 10).screenX(), event(2, 10, 10).screenY()], [504, 528]);
    assert.equal(context.Reactor3D.eventGraphicOffset(event(2, 10, 10)), null);
    // The editor's rule and the game's agree on every size.
    for (let w = 1; w <= 7; w++) for (let h = 1; h <= 7; h++) {
        const map = { width: 30, height: 30, events: [null, { id: 1, x: 10, y: 10 }], reactor3d: { version: 1 } };
        MapElevation.setEventSize(map, 1, [w, h]);
        context.$dataMap = map;
        const [ox, oy] = MapElevation.eventFootprintOrigin(map, 1);
        const mine = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mine.push((10 + ox + x) + ',' + (10 + oy + y));
        assert.deepEqual(covered(event(1, 10, 10)).sort(), mine.sort(), `${w} by ${h}`);
        const offset = context.Reactor3D.eventGraphicOffset(event(1, 10, 10)) || [0, 0];
        assert.deepEqual([...offset], MapElevation.eventMarkerOffset(map, 1), `${w} by ${h}: the editor's marker is where the game draws`);
    }
    // The model and the 3D picture take the same half tile.
    assert.match(source, /object\.position\.set\(character\._realX \+ 0\.5 \+ middleX \+ offset\[0\] \+ holdX,/);
    assert.match(source, /let baseX = character\._realX \+ 0\.5 \+ footX \+ \(middle \? middle\[0\] : 0\);/);
});

test('a model event sizes itself: the tiles its body covers, kept for the editor\'s picture and never as a size of its own', () => {
    assert.deepEqual(MapElevation.footprintOfTiles([{ x: 3, y: 4 }, { x: 7, y: 6 }], 5, 5), [5, 3, -2, -1], 'the box of the tiles, from the event');
    assert.deepEqual(MapElevation.footprintOfTiles([{ x: 0, y: 0 }], 0, 0), [1, 1, 0, 0]);
    assert.deepEqual(MapElevation.footprintOfTiles([{ x: 2, y: 0 }, { x: 3, y: 0 }], 0, 0), [4, 1, 0, 0], 'the event\'s own tile is always inside');
    assert.equal(MapElevation.footprintOfTiles([], 0, 0), null, 'nothing measured yet');
    assert.deepEqual(MapElevation.footprintOfTiles([{ x: -100, y: 0 }, { x: 100, y: 0 }], 0, 0).slice(0, 2), [64, 1], 'no larger than an event can be');
    const map = { width: 40, height: 40, events: [null, { id: 1, x: 10, y: 10 }], reactor3d: { version: 1 } };
    assert.equal(MapElevation.setEventSizeAuto(map, 1, [7, 19, -3, -9]), true);
    assert.deepEqual(MapElevation.eventSize(map, 1), [7, 19], 'the editor draws the measured footprint');
    assert.deepEqual(MapElevation.eventFootprintOrigin(map, 1), [-3, -9], 'round the model as it stands');
    assert.deepEqual(MapElevation.eventMarkerOffset(map, 1), [0, 0], 'the model stands on its own tile');
    assert.equal(map.reactor3d.eventSize, undefined, 'and the game is given no size: it takes the model\'s body');
    assert.equal(map.reactor3d.eventSizeAnchor, undefined);
    assert.equal(MapElevation.setEventSizeAuto(map, 1, [7, 19, -3, -9]), false, 'the same again changes nothing');
    // A size set by hand wins and is centred; back to 1 by 1 the measured one shows again.
    MapElevation.setEventSize(map, 1, [3, 1]);
    assert.deepEqual([MapElevation.eventSize(map, 1), MapElevation.eventFootprintOrigin(map, 1), MapElevation.eventSizeAuto(map, 1)], [[3, 1], [-1, 0], null]);
    MapElevation.setEventSize(map, 1, [1, 1]);
    assert.deepEqual(MapElevation.eventSize(map, 1), [7, 19]);
    assert.equal(MapElevation.setEventSizeAuto(map, 1, null), true);
    assert.equal(map.reactor3d.eventSizeAuto, undefined, 'forgotten whole');
    assert.deepEqual(MapElevation.eventSize(map, 1), [1, 1]);
    // The Event Editor: Auto writes no size of the event's own; unticked it writes the numbers.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventEditor.js'), 'utf8');
    assert.match(source, /RRMapElevation\.setEventSize\(map, event\.id, auto \? \[1, 1\] : this\.pendingSize\);/);
    assert.match(source, /RRMapElevation\.setEventSizeAuto\(map, event\.id, auto \? this\.pendingAutoRect : null\);/);
    assert.match(source, /id="event-size-auto"/);
    assert.match(source, /Reactor3D\.blockedTilesFor\(template, template\.userData\.reactorSidecar, spec, model\.direction, 0, 0\)/, 'measured by the rule the game walks against');
    const page = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventPageEditor.js'), 'utf8');
    assert.match(page, /this\.parentEditor\.refreshAutoSize\?\.\(\);/, 'again when the model, its size or its facing changes');
});

test('an event with the Vehicle field and no picture of its own measures its vehicle\'s model for Auto', () => {
    const EventEditor = require(path.join(editorRoot, 'src', 'event', 'EventEditor.js'));
    const previous = global.RRVehicles;
    global.RRVehicles = require(path.join(editorRoot, 'src', 'event', 'VehicleSetup.js'));
    try {
        const model = { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2', size: 4 };
        const editor = Object.create(EventEditor.prototype);
        editor.databaseManager = { data: { vehicles: [null, { id: 1, name: 'Motorcycle', model, graphic3d: true }] } };
        editor.pendingModels = [null];
        editor.currentEvent = { id: 3, rrVehicle: { type: 1 }, pages: [{ image: { characterName: '', tileId: 0, direction: 4 } }] };
        const sized = editor._sizeModel();
        assert.equal(sized && sized.spec.name, model.name, 'Auto has the vehicle\'s model to measure');
        assert.equal(sized.direction, 4, 'facing the way its page faces');
        assert.equal(sized.vehicle, true);
        assert.deepEqual(EventEditor.vehicleFront({ vehicle: { forward: '-x' } }), [-1, 0, 0], 'the front the model file names, as the game reads it');
        assert.equal(EventEditor.vehicleFront({}), null);
        // A picture on the page is what the event shows: no vehicle model, nothing to measure.
        editor.currentEvent.pages[0].image.characterName = 'Vehicle';
        assert.equal(editor._sizeModel(), null);
        // A model of the page's own wins over the vehicle's.
        editor.currentEvent.pages[0].image.characterName = '';
        editor.pendingModels = [{ name: 'Actors/Fleagus' }];
        assert.equal(editor._sizeModel().spec.name, 'Actors/Fleagus');
    } finally { global.RRVehicles = previous; }
});

test('a map\'s model events take their Auto size when drawn, without the Event Editor, and a clean map stays clean', async () => {
    const EventManager = require(path.join(editorRoot, 'src', 'EventManager.js'));
    const EventEditor = require(path.join(editorRoot, 'src', 'event', 'EventEditor.js'));
    const saved = { RRMapElevation: global.RRMapElevation, RREventPreviewModels: global.RREventPreviewModels, EventEditor: global.EventEditor, Reactor3D: global.Reactor3D, RRVehicles: global.RRVehicles, window: global.window };
    global.RRMapElevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
    global.RRVehicles = require(path.join(editorRoot, 'src', 'event', 'VehicleSetup.js'));
    global.EventEditor = EventEditor;
    global.window = { THREE: {}, reactor: {} };
    const template = { userData: { reactorSidecar: { vehicle: { forward: '-x' } } } };
    global.RREventPreviewModels = { templateFor: async () => template };
    const measured = [];
    global.Reactor3D = { extensionsLoaded: () => true, eventModelSpec: () => null, normalizeModelSpec: spec => ({ ...spec }),
        blockedTilesFor: (t, sidecar, spec, direction) => { measured.push(spec.faces && spec.faces.front); return [{ x: 0, y: -2 }, { x: 0, y: 2 }]; } };
    try {
        const map = { id: 1, width: 20, height: 20, events: [null, { id: 1, x: 5, y: 5, rrVehicle: { type: 1 }, pages: [{ image: { characterName: '', tileId: 0, direction: 2 } }] }] };
        const manager = Object.create(EventManager.prototype);
        manager.currentMap = map;
        manager.databaseManager = { data: { vehicles: [null, { id: 1, name: 'Motorcycle', model: { name: 'Vehicles/bike', size: 4 } }] } };
        let dirty = false, captured = 0, drawn = 0;
        manager.tilemapManager = { savedMapState: '{}', isMapDirty: () => dirty, captureSavedMapState: () => captured++ };
        manager.renderEvents = () => drawn++;
        assert.equal(await manager.refreshAutoSizes(), true);
        assert.deepEqual(map.reactor3d.eventSizeAuto['1'], [1, 5, 0, -2], 'the vehicle event covers its bike, along the way it faces');
        assert.deepEqual(measured[0], [-1, 0, 0], 'turned by the front its model file names');
        assert.equal(captured, 1, 'a map with no edits of its own does not read as changed');
        assert.equal(drawn, 1);
        assert.equal(await manager.refreshAutoSizes(), false, 'measured once: nothing to draw again');
        // A size set by hand is the user's: never measured over.
        map.reactor3d.eventSize = { '1': [2, 2] }; delete map.reactor3d.eventSizeAuto;
        assert.equal(await manager.refreshAutoSizes(), false);
        assert.equal(map.reactor3d.eventSizeAuto, undefined);
    } finally { Object.assign(global, saved); }
});
