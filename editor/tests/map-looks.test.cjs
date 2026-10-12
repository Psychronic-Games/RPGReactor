/**
 * What is placed is seen and found, with Battle Setup open or closed.
 *
 * A battle unit with no picture of its own is drawn in both map views as
 * the game's look rule says (its record's model, its character sheet, its
 * battler picture, else a plain figure in its side's color), on a ring in
 * its side's color while Event mode is on or Battle Setup is open. The
 * sidebar's Events list marks a unit's row with its side and a click on any
 * row brings the event into the map view in use.
 *
 * Both classes run for real here: three.js and the runtime's height rules
 * for the 3D view, a small PIXI and a small page for the 2D view.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
global.Reactor3D = global.Reactor3D || R;
global.RRMapElevation = require(path.join(editorRoot, 'src/utils/MapElevation.js'));
global.ReactorFightLook = require(path.join(editorRoot, 'src/utils/FightLook.js'));
global.RRBattleCheck = require(path.join(editorRoot, 'src/utils/BattleCheck.js'));

//-----------------------------------------------------------------------------
// A page and a PIXI small enough to run the drawing in.

/** A canvas whose pixels can be set by drawing a picture that carries some (`_pixels`), and read back. */
function fakeCanvas() {
    const canvas = { width: 300, height: 150, _pixels: null, calls: [] };
    const own = {
        drawImage(source, ...rest) { canvas.calls.push(['drawImage', source, ...rest]); if (source && source._pixels && rest.length <= 2) canvas._pixels = source._pixels; },
        getImageData(x, y, w, h) { return { data: canvas._pixels || new Uint8ClampedArray(w * h * 4).fill(255) }; },
        putImageData(pixels) { canvas._pixels = pixels.data; },
        measureText(text) { return { width: String(text).length * 12 }; }
    };
    const context = new Proxy(own, {
        // Anything else is taken and noted; what a call hands back (a gradient) takes its own calls.
        get: (target, key) => (key in target ? target[key] : (...args) => { canvas.calls.push([key, ...args]); return { addColorStop() {} }; }),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    canvas.getContext = () => context;
    return canvas;
}

/** An element of the sidebar: classes, data, style properties, listeners fired by hand, class and attribute selectors. */
function element(tag) {
    const listeners = {};
    const el = { tagName: String(tag).toUpperCase(), className: '', dataset: {}, title: '', textContent: '', children: [], scrollTop: 0, scrolled: 0 };
    el.style = { properties: {}, setProperty(name, value) { this.properties[name] = value; } };
    const names = () => el.className.split(/\s+/).filter(Boolean);
    el.classList = {
        add: name => { if (!names().includes(name)) el.className = names().concat(name).join(' '); },
        remove: name => { el.className = names().filter(entry => entry !== name).join(' '); },
        contains: name => names().includes(name)
    };
    el.appendChild = child => { el.children.push(child); child.parent = el; return child; };
    el.addEventListener = (type, handler) => { (listeners[type] = listeners[type] || []).push(handler); };
    el.fire = type => { for (const handler of listeners[type] || []) handler({ type, stopPropagation() {}, preventDefault() {}, clientX: 0, clientY: 0 }); };
    el.scrollIntoView = () => { el.scrolled++; };
    const matches = (node, selector) => {
        const attribute = /\[data-event-id="(\d+)"\]/.exec(selector);
        if (attribute && String(node.dataset.eventId) !== attribute[1]) return false;
        return selector.replace(/\[[^\]]*\]/g, '').split('.').filter(Boolean).every(name => node.className.split(/\s+/).includes(name));
    };
    el.querySelectorAll = selector => el.children.filter(child => matches(child, selector));
    el.querySelector = selector => el.querySelectorAll(selector)[0] || null;
    Object.defineProperty(el, 'innerHTML', { get: () => el._html || '', set: value => { el.children.length = 0; el._html = value; } });
    return el;
}

function fakeDocument() {
    const byId = { 'events-list': element('div'), 'events-section': element('div'), sidebar: element('div') };
    return { byId, getElementById: id => byId[id] || null, createElement: tag => (tag === 'canvas' ? fakeCanvas() : element(tag)), dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
}

function fakePixi() {
    class Container {
        constructor() { this.children = []; this.x = 0; this.y = 0; this.parent = null; this.label = ''; this.visible = true; this.scale = { x: 1, y: 1, set(x, y) { this.x = x; this.y = y === undefined ? x : y; } }; }
        addChild(child) { return this.addChildAt(child, this.children.length); }
        addChildAt(child, index) { child.parent?.removeChild(child); this.children.splice(index, 0, child); child.parent = this; return child; }
        removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) { this.children.splice(i, 1); child.parent = null; } return child; }
        removeChildren() { const gone = this.children.splice(0); for (const child of gone) child.parent = null; return gone; }
        getChildIndex(child) { const i = this.children.indexOf(child); if (i < 0) throw new Error('not a child'); return i; }
        setChildIndex(child, index) { this.children.splice(this.getChildIndex(child), 1); this.children.splice(index, 0, child); }
        destroy() { this.destroyed = true; this.parent?.removeChild(this); }
    }
    class Graphics extends Container {
        constructor() { super(); this.draws = []; }
        clear() { this.draws.length = 0; return this; }
    }
    for (const op of ['rect', 'ellipse', 'poly', 'moveTo', 'lineTo']) Graphics.prototype[op] = function(...args) { this.draws.push({ op, args }); return this; };
    for (const op of ['fill', 'stroke']) Graphics.prototype[op] = function(style) { this.draws.push({ op, style }); return this; };
    class Text extends Container { constructor(options) { super(); this.text = options.text; this.resolution = options.resolution; this.anchor = { set() {} }; } }
    class Sprite extends Container {
        constructor(texture) { super(); this.texture = texture; this.anchor = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y === undefined ? x : y; } }; }
    }
    class Texture { constructor(options) { Object.assign(this, options); } static from(source) { return new Texture({ source, made: 'from' }); } }
    class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
    return { Container, Graphics, Text, Sprite, Texture, Rectangle };
}

global.PIXI = fakePixi();
global.document = fakeDocument();
global.ThemeColors = { resolve: name => (name === '--color-accent' ? '#3366cc' : null) };
const EventManager = require(path.join(editorRoot, 'src/EventManager.js'));
global.EventManager = EventManager;
const MapEditor3D = require(path.join(editorRoot, 'src/MapEditor3D.js'));
// No picture file is on disk here: a test that draws one stands its own reader in. A picture asked for over and
// over is answered a few times, then never, so a reader that forgets what it read ends a test instead of holding it.
let strayReads = 0;
EventManager.readPicture = () => (++strayReads > 20 ? new Promise(() => {}) : Promise.resolve(null));

//-----------------------------------------------------------------------------
// One project: its Database, its model bindings, its picture files.

const PROJECT = path.join(path.sep, 'projects', 'looks');
const ENEMY = '#ff5a4a', ALLY = '#4aa8ff', NEUTRAL = '#e6d15a';
const database = {
    actors: [null, { id: 1, name: 'Katie', characterName: 'Actor1', characterIndex: 3 }, { id: 2, name: 'Dex', characterName: '' }],
    enemies: [null,
        { id: 1, name: 'Raider', battlerName: '', battlerHue: 0, note: '' },
        { id: 2, name: 'Goblin Scout', battlerName: 'Goblin', battlerHue: 200, note: '' },
        { id: 3, name: 'Nobody', battlerName: '', battlerHue: 0, note: '' },
        { id: 4, name: 'Sheet Soldier', battlerName: '', battlerHue: 0, note: '<unit character: Actor1, 2>' },
        { id: 5, name: 'Lost Picture', battlerName: 'Gone', battlerHue: 0, note: '' }],
    system: { optSideView: false },
    bindings: { enemies: { 1: { name: 'Enemies/Raider', size: 2 } }, actors: { 2: { character: { name: 'Actors/Dex', size: 2 } } } },
    files: new Set(['enemies/Goblin', 'sv_enemies/Goblin', 'characters/Actor1', 'characters/People1'])
};
global.RRDatabase3DBindings = { read: () => database.bindings };
global.RRAssetFiles = {
    findImage: (directory, name) => (database.files.has(path.basename(directory) + '/' + name) ? { absolutePath: path.join(directory, name + '.png') } : null),
    imageUrlFor: (directory, name) => 'file://' + path.join(directory, name + '.png'),
    isBigCharacter: () => false,
    characterFrameCount: () => 3
};
global.reactor = {
    projectController: { getCurrentProject: () => ({ path: PROJECT }) },
    databaseManager: { data: { battlePresentation: null }, getActors: () => database.actors, getEnemies: () => database.enemies, getSystem: () => database.system }
};

const blank = () => ({ tileId: 0, characterName: '', direction: 2, pattern: 1, characterIndex: 0 });
const page = (image, list) => ({ image: image || blank(), list: list || [{ code: 0, indent: 0, parameters: [] }], trigger: 0, moveSpeed: 3, stepAnime: false });
const unit = (team, record, id) => ({ team, record, id });
/** A 16 by 12 map with one event of each look, and two that are no units. */
function mapOf() {
    const events = [null,
        { id: 1, name: 'Grocer', note: '', x: 1, y: 1, pages: [page(Object.assign(blank(), { characterName: 'People1', characterIndex: 1 }))] },
        { id: 2, name: 'Raider', note: '', x: 3, y: 3, pages: [page()], rrUnit: unit('enemy', 'enemy', 1) },
        { id: 3, name: 'Goblin Scout', note: '', x: 5, y: 3, pages: [page(Object.assign(blank(), { direction: 4 }))], rrUnit: unit('enemy', 'enemy', 2) },
        { id: 4, name: 'Nobody', note: '', x: 7, y: 3, pages: [page()], rrUnit: unit('enemy', 'enemy', 3) },
        { id: 5, name: 'Sheet Soldier', note: '', x: 3, y: 6, pages: [page()], rrUnit: unit('enemy', 'enemy', 4) },
        { id: 6, name: 'Katie', note: '', x: 5, y: 6, pages: [page()], rrUnit: unit('ally', 'actor', 1) },
        { id: 7, name: 'Bystander', note: '', x: 7, y: 6, pages: [page()], rrUnit: unit('neutral', 'enemy', 3) },
        { id: 8, name: 'Own Picture', note: '', x: 9, y: 3, pages: [page(Object.assign(blank(), { characterName: 'People1', characterIndex: 2 }))], rrUnit: unit('enemy', 'enemy', 2) },
        { id: 9, name: 'Second Page', note: '', x: 9, y: 6, pages: [page(), page(null, [{ code: 108, indent: 0, parameters: ['<unit: enemy 3>'] }, { code: 0, indent: 0, parameters: [] }])] },
        { id: 10, name: 'Sign', note: '', x: 11, y: 3, pages: [page()] },
        { id: 11, name: 'Lost Picture', note: '', x: 11, y: 6, pages: [page()], rrUnit: unit('enemy', 'enemy', 5) },
        { id: 12, name: 'Dex', note: '', x: 13, y: 3, pages: [page()], rrUnit: unit('ally', 'actor', 2) }];
    return { id: 5, width: 16, height: 12, note: '', events, reactor3d: { version: 1, mode: '3d', elevation: new Array(16 * 12).fill(0) } };
}
const eventOf = (map, id) => map.events.find(event => event && event.id === id);
const sources = () => { EventManager._lookSources = null; return EventManager.lookSources(); };
const plain = value => JSON.parse(JSON.stringify(value));

/** An event manager on a map, with the 2D map's layers as the editor lays them. */
function manager(map = mapOf()) {
    EventManager._lookSources = null;
    const m = Object.create(EventManager.prototype);
    const container = new PIXI.Container();
    m.currentMap = map;
    m.tilemapManager = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container, renders: 0, requestRender() { this.renders++; } };
    m.eventPreviewContainer = container.addChild(new PIXI.Container());
    m.eventPreviewContainer.label = 'event previews';
    m.eventContainer = container.addChild(new PIXI.Container());
    m.eventContainer.label = 'events';
    container.addChild(new PIXI.Graphics()).label = 'selection';
    m.eventSprites = new Map();
    m.selectedEvent = null;
    m.labelResolution = () => 1;
    m.frames = [];
    m.characterFrame = (image, pattern) => { m.frames.push([image.characterName, image.characterIndex]); return { width: 48, height: 48, texture: new PIXI.Texture({ sheet: image.characterName, index: image.characterIndex, pattern }) }; };
    // The placed models' layer, made by its first drawing as the editor's is.
    const props = { currentMap: map, asked: [], render() {
        if (!this.container) { this.container = container.addChild(new PIXI.Container()); this.container.label = 'model props'; }
        this.asked = m.modelPreviewProps();
    } };
    m.projectController = { modelPropsManager: props, getCurrentProject: () => ({ path: PROJECT }) };
    global.reactor.eventManager = m;
    return m;
}
const labels = m => m.tilemapManager.container.children.map(child => child.label);

//-----------------------------------------------------------------------------
// The look of a unit (SPEC-v2 4.3)

test('a unit with no picture of its own stands as the look rule says, with Battle Setup closed', () => {
    assert.equal(typeof RRBattleSetup, 'undefined', 'no card is loaded here');
    const map = mapOf(), from = sources();
    const look = id => EventManager.unitLook(eventOf(map, id), map, from);
    assert.equal(look(1), null, 'an event that does not fight has no look to work out');
    assert.equal(look(10), null);
    assert.deepEqual(plain(look(2)), { kind: 'model', team: 'enemy', color: ENEMY, spec: { name: 'Enemies/Raider', size: 2 }, page: 0, unit: plain(RRBattleCheck.unitOf(eventOf(map, 2))) },
        'the model the Database gives its record');
    assert.deepEqual([look(3).kind, look(3).folder, look(3).name, look(3).hue], ['picture', 'enemies', 'Goblin', 200], 'else its battler picture, hue and all');
    assert.deepEqual([look(4).kind, look(4).color], ['figure', ENEMY], 'else a plain figure in its side\'s color');
    assert.deepEqual([look(5).kind, look(5).characterName, look(5).characterIndex], ['character', 'Actor1', 2], 'an enemy\'s <unit character: ...>');
    assert.deepEqual([look(6).kind, look(6).characterName, look(6).characterIndex, look(6).color], ['character', 'Actor1', 3, ALLY], 'an actor\'s character graphic');
    assert.deepEqual([look(7).kind, look(7).color, look(7).team], ['figure', NEUTRAL, 'neutral'], 'a bystander');
    assert.equal(look(8).kind, 'own', 'an event with a picture of its own keeps it');
    assert.equal(look(11).kind, 'figure', 'a battler picture whose file is not there is no picture');
    assert.deepEqual([look(12).kind, look(12).spec.name], ['model', 'Actors/Dex'], 'an actor\'s model is its character slot');
    // The answer is the rule's own: nothing is decided twice.
    for (const id of [2, 3, 4, 5, 6, 7, 11, 12]) {
        const event = eventOf(map, id), told = RRBattleCheck.unitOf(event);
        const given = { own: false, record: (told.record === 'actor' ? database.actors : database.enemies)[told.id], model: EventManager.boundModel(told, from), sideView: false, exists: from.exists };
        assert.deepEqual(plain(Object.assign({}, look(id), { page: undefined, unit: undefined })), plain(ReactorFightLook.resolve(told, given)), `event ${id}`);
    }
    // A side-view game stands its enemies as their side-view pictures.
    database.system.optSideView = true;
    try { assert.equal(EventManager.unitLook(eventOf(map, 3), map, sources()).folder, 'sv_enemies'); } finally { database.system.optSideView = false; }
});

test('the page drawn: Preview Event\'s choice wins, else the page an event is a unit on', () => {
    const map = mapOf();
    assert.equal(EventManager.previewPage(map, eventOf(map, 1)), null, 'an event that does not fight is its square alone');
    assert.equal(EventManager.previewPage(map, eventOf(map, 2)), 0, 'a row: its first page');
    assert.equal(EventManager.previewPage(map, eventOf(map, 9)), 1, 'a <unit: ...> comment: the page it is on');
    assert.equal(EventManager.unitLook(eventOf(map, 9), map, sources()).page, 1);
    // Preview Event shows the first page of event 9: it is no unit there.
    map.reactor3d.eventPreviews = { 9: 0, 2: 0, 1: 0 };
    assert.equal(EventManager.previewPage(map, eventOf(map, 9)), 0);
    assert.equal(EventManager.unitLook(eventOf(map, 9), map, sources()), null, 'the page chosen is drawn as that page');
    assert.equal(EventManager.previewPage(map, eventOf(map, 1)), 0, 'and any event can be previewed, as before');
    assert.equal(EventManager.chosenPreviewPage(map, eventOf(map, 4)), null, 'a unit is drawn with no choice made');
    // Both views ask the one function.
    assert.equal(MapEditor3D.previewPageIndex(map, eventOf(map, 4)), 0);
    assert.equal(MapEditor3D.previewPageIndex(map, eventOf(map, 10)), null);
    const m = manager(map);
    assert.equal(m.getEventPreviewPage(eventOf(map, 4)), 0);
    // What an event is, is read again when its row, its Note or its pages' commands change, in place or not.
    const sign = eventOf(map, 10), nobody = eventOf(map, 4);
    assert.equal(EventManager.unitOf(sign), null);
    sign.pages[0].list.unshift({ code: 108, indent: 0, parameters: ['<unit: ally actor 1>'] });
    assert.deepEqual([EventManager.unitOf(sign).team, EventManager.unitOf(sign).page, EventManager.previewPage(map, sign)], ['ally', 1, 0]);
    assert.equal(EventManager.unitOf(nobody).team, 'enemy');
    nobody.rrUnit.team = 'neutral';
    assert.equal(EventManager.unitOf(nobody).team, 'neutral');
    nobody.rrUnit = unit('ally', 'enemy', 3);
    assert.equal(EventManager.unitOf(nobody).team, 'ally');
    delete nobody.rrUnit;
    assert.equal(EventManager.unitOf(nobody), null);
    nobody.note = '<unit: enemy 3>';
    assert.deepEqual([EventManager.unitOf(nobody).team, EventManager.unitOf(nobody).id], ['enemy', 3]);
});

test('Battle Setup\'s lookOf gives the answer when it is loaded, so the card\'s tiles and the map agree', () => {
    const map = mapOf(), asked = [];
    global.RRBattleSetup = { lookOf: (told, event, given) => { asked.push([told.id, event.id, given.own, !!given.record]); return { kind: 'figure', team: told.team, color: '#123456' }; } };
    try {
        const look = EventManager.unitLook(eventOf(map, 3), map, sources());
        assert.deepEqual([look.kind, look.color, look.page], ['figure', '#123456', 0]);
        assert.deepEqual(asked, [[2, 3, false, true]], 'it is told the unit, the event and what the map knows of them');
        // A card that cannot answer leaves the rule's answer.
        global.RRBattleSetup = { lookOf: () => { throw new Error('not ready'); } };
        assert.equal(EventManager.unitLook(eventOf(map, 3), map, sources()).kind, 'picture');
    } finally { delete global.RRBattleSetup; }
});

test('2D: a unit is drawn as what it is, over the models and under the outlines, its feet on its tile', async () => {
    const m = manager();
    // The battler picture is read from the project: 100 by 80 with its art in the box 20..59 by 10..69.
    const pixels = new Uint8ClampedArray(100 * 80 * 4);
    for (let y = 10; y < 70; y++) for (let x = 20; x < 60; x++) pixels.set([200, 40, 40, 255], (y * 100 + x) * 4);
    const read = EventManager.readPicture, wanted = [];
    // (A picture asked for over and over is answered three times, then never: the count below says so.)
    EventManager.readPicture = (project, folder, name) => { wanted.push([project, folder, name]); return wanted.length > 3 ? new Promise(() => {}) : Promise.resolve({ naturalWidth: 100, naturalHeight: 80, _pixels: pixels.slice() }); };
    EventManager._lookArts.clear();
    try {
        m.renderEventPreviews();
        for (const child of m.unitLookLayer.children) assert.ok(child.texture, 'every unit drawn has a picture');
        const figure = () => m.unitLookLayer.children.find(child => child.x === (7 + 0.5) * 48 && child.y === 4 * 48 - 6);
        assert.ok(figure(), 'the plain figure stands at once, feet where a character\'s stand');
        assert.deepEqual([figure().anchor.x, figure().anchor.y], [0.5, 1]);
        assert.deepEqual([figure().texture.source.width, figure().texture.source.height], [48, 72], 'one tile wide, a tile and a half tall');
        assert.deepEqual(wanted, [[PROJECT, 'enemies', 'Goblin']], 'the one picture is read once (the one whose file is gone is not asked for)');
        await new Promise(resolve => setImmediate(resolve));
        // The picture arrived: the previews were drawn again with it.
        const at = (x, y) => m.unitLookLayer.children.filter(child => child.x === (x + 0.5) * 48 && child.y === (y + 1) * 48 - 6);
        assert.equal(at(5, 3).length, 1, 'the battler picture stands on its tile');
        assert.deepEqual([at(5, 3)[0].texture.source.width, at(5, 3)[0].texture.source.height], [48, 72], 'its art alone (40 by 60 of the 100 by 80 file), fit to the tiles a unit takes');
        assert.equal(at(7, 3).length, 1);
        assert.equal(at(11, 6).length, 1, 'a missing picture stands as the figure');
        assert.equal(at(7, 6).length, 1, 'the bystander too');
        // The record's sheet, cut as an event's own picture is.
        assert.ok(m.frames.some(([name, index]) => name === 'Actor1' && index === 2), 'the enemy\'s <unit character:> sheet');
        assert.ok(m.frames.some(([name, index]) => name === 'Actor1' && index === 3), 'the actor\'s sheet');
        assert.equal(at(3, 6)[0].texture.sheet, 'Actor1');
        assert.equal(at(9, 3)[0].texture.sheet, 'People1', 'a unit with a picture of its own shows that picture');
        assert.equal(m.unitLookLayer.children.length, 8, 'every unit but the two that stand as models: 3, 4, 5, 6, 7, 8, 9 (its page 2) and 11');
        assert.equal(m.eventPreviewContainer.children.length, 0, 'an event that does not fight is not drawn at real size unasked');
        // The models go to the placed models' layer, as a previewed model does.
        assert.deepEqual(m.projectController.modelPropsManager.asked.map(entry => [entry.id, entry.name, entry.x, entry.y]), [[-2, 'Enemies/Raider', 3, 3], [-12, 'Actors/Dex', 13, 3]]);
        // Rings over the events' squares; pictures over the models; outlines over both.
        const order = labels(m);
        assert.ok(order.indexOf('unit looks') === order.indexOf('model props') + 1, order.join(' | '));
        assert.ok(order.indexOf('event outlines') === order.indexOf('unit looks') + 1, order.join(' | '));
        assert.equal(m.eventOutlines.size, 10, 'each unit drawn has its outline');
        // Drawn again: the layers keep their places and nothing is left behind.
        m.renderEventPreviews();
        assert.deepEqual(labels(m), order);
        assert.equal(m.unitLookLayer.children.length, 8);
        assert.deepEqual(wanted.length, 1, 'the picture is kept, not read again');
    } finally { EventManager.readPicture = read; EventManager._lookArts.clear(); }
});

test('2D: Preview Event still wins over a unit\'s look', () => {
    const map = mapOf();
    // The Goblin Scout gets a second page with a picture of its own, and Preview Event shows it.
    eventOf(map, 3).pages.push(page(Object.assign(blank(), { characterName: 'People1', characterIndex: 5 })));
    map.reactor3d.eventPreviews = { 3: 1 };
    const m = manager(map);
    EventManager._lookArts.clear();
    m.renderEventPreviews();
    const sprite = m.unitLookLayer.children.find(child => child.x === 5.5 * 48);
    assert.deepEqual([sprite.texture.sheet, sprite.texture.index], ['People1', 5], 'the chosen page\'s own picture, not the battler picture');
    assert.equal(EventManager.unitLook(eventOf(map, 3), map).kind, 'own');
});

test('2D: a unit with a typed size stands that many times bigger, in the middle of its tiles', () => {
    const map = mapOf();
    RRMapElevation.setEventSize(map, 4, [2, 2]);
    const m = manager(map);
    EventManager._lookArts.clear();
    m.renderEventPreviews();
    // Two tiles wide and three tall, its feet on the lower edge of the tiles it takes, half a tile on.
    const figure = m.unitLookLayer.children.find(child => child.x === (7 + 0.5 + 0.5) * 48);
    assert.ok(figure, 'the figure stands in the middle of its footprint');
    assert.equal(figure.y, (3 + 0.5 + 1) * 48 - EventManager.CHARACTER_LIFT);
    assert.deepEqual([figure.texture.source.width, figure.texture.source.height], [96, 144]);
});

test('2D: the ring is drawn only while Event mode is on or Battle Setup is open', () => {
    const map = mapOf();
    RRMapElevation.setEventSize(map, 2, [3, 3]);
    const m = manager(map);
    m.projectController.mapEditor3D = { synced: 0, syncUnitRings() { this.synced++; } };
    EventManager._lookArts.clear();
    m.renderEventPreviews();
    assert.ok(!m.unitRingLayer || !m.unitRingLayer.visible, 'neither: no ring');
    m.eventMode = true;
    assert.equal(m.eventMode, true);
    const layer = m.unitRingLayer;
    assert.ok(layer && layer.visible, 'Event mode on: the rings appear without anything else being drawn again');
    assert.equal(labels(m).indexOf('unit rings'), labels(m).indexOf('events') + 1, 'directly over the events\' squares');
    assert.equal(m.projectController.mapEditor3D.synced, 1, 'and the 3D view is told');
    const rings = layer.draws.filter(draw => draw.op === 'ellipse');
    const strokes = layer.draws.filter(draw => draw.op === 'stroke').map(draw => draw.style.color);
    assert.equal(rings.length / 2, 10, 'one ring (its disc and its edge) for each of the 10 units, a unit that keeps its own picture too');
    const count = color => strokes.filter(entry => entry === parseInt(color.slice(1), 16)).length;
    assert.deepEqual([count(ENEMY), count(ALLY), count(NEUTRAL)], [7, 2, 1], 'each in its side\'s color');
    // Round the tile for an ordinary unit, round the whole footprint for a sized one.
    const ringAt = (x, y) => rings.find(draw => draw.args[0] === x * 48 && draw.args[1] === y * 48).args;
    assert.deepEqual(ringAt(5.5, 3.5).slice(2), [48 * EventManager.RING_REACH, 48 * EventManager.RING_REACH]);
    assert.deepEqual(ringAt(3.5, 3.5).slice(2), [3 * 48 * EventManager.RING_REACH, 3 * 48 * EventManager.RING_REACH], 'the 3 by 3 Raider');
    // The notch points the way the unit faces: the Goblin Scout faces left.
    const notches = layer.draws.filter(draw => draw.op === 'poly').map(draw => draw.args[0]);
    assert.ok(notches.some(points => points[0] < 5.5 * 48 - 48 * EventManager.RING_REACH && points[1] === 3.5 * 48), 'a tip left of the Goblin Scout\'s ring');
    m.eventMode = false;
    assert.equal(layer.visible, false, 'Event mode off: gone');
    assert.equal(layer.draws.length, 0);
    assert.equal(m.projectController.mapEditor3D.synced, 2);
    m.eventMode = false;
    assert.equal(m.projectController.mapEditor3D.synced, 2, 'the same value again draws nothing');
    // Battle Setup open, Event mode off.
    global.RRBattleSetup = { isOpen: () => true };
    try {
        m.syncUnitRings();
        assert.equal(layer.visible, true);
        assert.equal(layer.draws.filter(draw => draw.op === 'ellipse').length / 2, 10);
    } finally { delete global.RRBattleSetup; }
    m.syncUnitRings();
    assert.equal(layer.visible, false);
});

test('2D: a unit\'s outline is its side\'s color; the selected one keeps the accent', () => {
    const map = mapOf(), m = manager(map);
    const tone = outline => outline.draws.filter(draw => draw.op === 'stroke').pop().style.color;
    assert.equal(tone(m.createEventOutline(eventOf(map, 6))), parseInt(ALLY.slice(1), 16));
    assert.equal(tone(m.createEventOutline(eventOf(map, 4))), parseInt(ENEMY.slice(1), 16));
    assert.equal(tone(m.createEventOutline(eventOf(map, 7))), parseInt(NEUTRAL.slice(1), 16));
    assert.equal(tone(m.createEventOutline(eventOf(map, 10))), 0xffffff, 'any other event: white');
    m.selectedEvent = eventOf(map, 4);
    assert.equal(tone(m.createEventOutline(eventOf(map, 4))), EventManager.selectedTone());
});

//-----------------------------------------------------------------------------
// The Events list (SPEC-v2 4.9)

test('the Events list marks a unit\'s row with its side', () => {
    const map = mapOf(), m = manager(map);
    global.document = fakeDocument();
    m.updateEventsList();
    const rows = document.byId['events-list'].children;
    assert.equal(rows.length, 12);
    const row = id => rows.find(entry => Number(entry.dataset.eventId) === id);
    assert.deepEqual([row(4).dataset.side, row(4).style.properties['--rr-unit-side'], row(4).title, row(4).textContent], ['enemy', ENEMY, 'Enemy', '004: Nobody']);
    assert.deepEqual([row(6).dataset.side, row(6).style.properties['--rr-unit-side'], row(6).title], ['ally', ALLY, 'Ally']);
    assert.deepEqual([row(7).dataset.side, row(7).style.properties['--rr-unit-side'], row(7).title], ['neutral', NEUTRAL, 'Bystander']);
    assert.equal(row(9).dataset.side, 'enemy', 'a unit made by a comment is marked too');
    assert.deepEqual([row(1).dataset.side, row(1).title, row(10).dataset.side], [undefined, '', undefined], 'an event that does not fight has no mark');
    // The stylesheet draws the mark from the row's side.
    const css = fs.readFileSync(path.join(editorRoot, 'css/styles.css'), 'utf8');
    const rule = /#events-list \.event-list-item\[data-side\]::before \{([^}]*)\}/.exec(css);
    assert.ok(rule, 'the dot\'s rule');
    assert.match(rule[1], /border-radius: 50%/);
    assert.match(rule[1], /background: var\(--rr-unit-side/);
});

test('a click on a row turns on Event mode, selects the event and brings it into the 2D view', () => {
    const map = mapOf(), m = manager(map);
    map.width = 200; map.height = 200;
    eventOf(map, 4).x = 76; eventOf(map, 4).y = 59;
    global.document = fakeDocument();
    const moves = [];
    Object.assign(m.tilemapManager, {
        viewportSize: () => ({ width: 1179, height: 872 }),
        // The view never shows past the map's edges.
        setViewportTransform(x, y, scale) {
            const width = map.width * 48 * scale, height = map.height * 48 * scale;
            this.container.x = Math.max(1179 - width, Math.min(0, x)); this.container.y = Math.max(872 - height, Math.min(0, y));
            moves.push([x, y, scale]);
        },
        updateScrollbars() { this.bars = (this.bars || 0) + 1; }
    });
    const selected = [], steps = [];
    m.selectEvent = event => { m.selectedEvent = event; selected.push(event.id); steps.push('select ' + event.id); m.updateEventListSelection(); };
    m.selectTile = (x, y) => { m.tile = [x, y]; };
    m.editEvent = event => { m.edited = event.id; };
    // The map tool's own work (the map's listeners, the start markers) is the toolbar's test.
    m.setEventMode = on => { steps.push('mode ' + on); m.eventMode = on; };
    let keys = null;
    global.RRPickerIndex = { bindListNavigation: (list, options) => { keys = options; } };
    try { m.updateEventsList(); } finally { delete global.RRPickerIndex; }
    const rows = document.byId['events-list'].children, row = id => rows.find(entry => Number(entry.dataset.eventId) === id);
    assert.equal(m.eventMode, false);
    row(4).fire('click');
    assert.deepEqual(steps, ['mode true', 'select 4'], 'Event mode first: the tool that was in hand lets go before the event is picked up');
    assert.equal(m.eventMode, true);
    assert.deepEqual(selected, [4]);
    assert.ok(row(4).classList.contains('selected'));
    // The middle of tile (76, 59) in the middle of a 1179 by 872 view.
    assert.deepEqual(moves, [[1179 / 2 - 76.5 * 48, 872 / 2 - 59.5 * 48, 1]]);
    const onScreen = [m.tilemapManager.container.x + 76.5 * 48, m.tilemapManager.container.y + 59.5 * 48];
    assert.deepEqual(onScreen, [1179 / 2, 872 / 2]);
    assert.deepEqual(m.tile, [76, 59]);
    assert.equal(m.tilemapManager.bars, 1, 'the scroll bars follow');
    // At another zoom the zoom is kept.
    m.tilemapManager.container.scale.set(0.5);
    row(4).fire('click');
    assert.deepEqual(moves[1], [1179 / 2 - 76.5 * 24, 872 / 2 - 59.5 * 24, 0.5]);
    // An event by the map's edge comes as near the middle as the map allows.
    row(1).fire('click');
    assert.deepEqual([m.tilemapManager.container.x, m.tilemapManager.container.y], [0, 0]);
    // In Event mode a click only moves the selection.
    assert.deepEqual(steps.filter(step => step.startsWith('mode')), ['mode true']);
    // A row that is not a unit works the same; a double click still opens the event.
    row(10).fire('dblclick');
    assert.equal(m.edited, 10);
    // Selecting from the map itself does not move the view.
    const before = moves.length;
    m.selectEventById(6);
    assert.equal(moves.length, before);
    assert.deepEqual(selected.slice(-1), [6]);
    // The arrow keys in the list bring each row's event into view as a click does, in Event mode too.
    m.eventMode = false;
    keys.select(row(7));
    assert.deepEqual(selected.slice(-1), [7]);
    assert.equal(moves.length, before + 1);
    assert.equal(keys.isSelected(row(7)), true);
    assert.equal(m.eventMode, true);
    // A row whose event is gone from the map changes nothing.
    m.eventMode = false;
    map.events[7] = null;
    row(7).fire('click');
    assert.equal(m.eventMode, false);
    assert.deepEqual(selected.slice(-1), [7]);
});

test('Event mode from a row of the Events list is the toolbar tool\'s Event mode', () => {
    const map = mapOf(), m = manager(map);
    global.document = fakeDocument();
    m.selectEvent = event => { m.selectedEvent = event; };
    m.centerOnEvent = () => {};
    const calls = [];
    m.setEventMode = on => { calls.push('own ' + on); m.eventMode = on; };
    // The app's own switch: it claims the map for the event tool, lights its button and says so in the status line.
    const app = { eventManager: m, toggleEventMode() { calls.push('toolbar'); m.eventMode = !m.eventMode; } };
    const previous = global.window;
    global.window = { reactor: app };
    try {
        m.updateEventsList();
        const row = id => document.byId['events-list'].children.find(entry => Number(entry.dataset.eventId) === id);
        row(3).fire('click');
        assert.deepEqual([calls, m.eventMode, m.selectedEvent.id], [['toolbar'], true, 3]);
        // Already on: the toolbar's switch is a toggle and is left alone.
        row(4).fire('click');
        assert.deepEqual([calls, m.eventMode, m.selectedEvent.id], [['toolbar'], true, 4]);
        // A double click is two clicks and then the editor: the mode is on by the time it opens.
        m.eventMode = false;
        m.editEvent = event => { calls.push('edit ' + event.id + ' in mode ' + m.eventMode); };
        row(1).fire('click'); row(1).fire('click'); row(1).fire('dblclick');
        assert.deepEqual(calls, ['toolbar', 'toolbar', 'edit 1 in mode true']);
        // Another manager than the app's (a second map view) switches itself.
        app.eventManager = {};
        m.eventMode = false;
        row(3).fire('click');
        assert.deepEqual(calls.slice(-1), ['own true']);
    } finally {
        if (previous === undefined) delete global.window; else global.window = previous;
    }
});

test('with the 3D view up, a click on a row frames the event there and leaves the 2D view alone', () => {
    const map = mapOf(), m = manager(map);
    global.document = fakeDocument();
    const view = { framed: [], on: true, isEnabled() { return this.on; }, frameEvent(id) { this.framed.push(id); return this.answer !== false; } };
    m.projectController.mapEditor3D = view;
    let moved = 0;
    Object.assign(m.tilemapManager, { viewportSize: () => ({ width: 800, height: 600 }), setViewportTransform() { moved++; } });
    m.selectEvent = event => { m.selectedEvent = event; };
    m.selectTile = () => {};
    m.setEventMode = on => { m.eventMode = on; };
    m.updateEventsList();
    const row = id => document.byId['events-list'].children.find(entry => Number(entry.dataset.eventId) === id);
    row(3).fire('click');
    assert.deepEqual(view.framed, [3]);
    assert.equal(moved, 0);
    assert.equal(m.eventMode, true, 'the row turns Event mode on in the 3D view as well');
    // A 3D view that cannot frame it (not built yet) and a 3D view switched off fall back to the 2D view.
    view.answer = false;
    row(3).fire('click');
    assert.equal(moved, 1);
    view.on = false;
    row(3).fire('click');
    assert.deepEqual(view.framed, [3, 3]);
    assert.equal(moved, 2);
});

//-----------------------------------------------------------------------------
// The 3D view

const VIEW = { left: 420, top: 127, width: 1179, height: 872 };

/** A 3D view on a map: a camera, a scene's worth of lists, and the event manager the editor hands it. */
function viewOf(map, m = manager(map)) {
    const view = Object.create(MapEditor3D.prototype);
    view.projectController = { getTilemapManager: () => ({ currentMap: map }), eventManager: m, getCurrentProject: () => ({ path: PROJECT }) };
    view.canvas = { getBoundingClientRect: () => VIEW, style: {} };
    view.view = { yaw: 0, pitch: 34, distance: 24, target: { x: 0, y: 0, z: 0 } };
    view.camera = R.createCamera({ fov: 40 });
    view.camera.aspect = VIEW.width / VIEW.height;
    view.camera.updateProjectionMatrix();
    view.mapScene = { _meshes: [], scene: () => view._scene || (view._scene = new THREE.Scene()) };
    view.eventGroup = new THREE.Group();
    view.billboards = []; view.labels = []; view.pickables = []; view.animatedEvents = [];
    view.LABEL_DISTANCE = 45; view.LABEL_REFERENCE = 24;
    view.enabled = true; view._rebuildGeneration = 1;
    m.projectController.mapEditor3D = view;
    return view;
}
const screenOf = (view, x, y, z) => { const v = new THREE.Vector3(x, y, z).project(view.camera); return [(v.x + 1) / 2 * VIEW.width, (1 - v.y) / 2 * VIEW.height]; };
/** How far the camera looks from a point, in degrees, and how far it stands from it. */
function aimAt(view, x, y, z) {
    view.camera.updateMatrixWorld(true);
    const looks = view.camera.getWorldDirection(new THREE.Vector3()), to = new THREE.Vector3(x, y, z).sub(view.camera.position), far = to.length();
    return { off: Math.acos(Math.max(-1, Math.min(1, looks.dot(to.normalize())))) * 180 / Math.PI, far };
}
const markerOf = (view, id) => view.pickables.find(mesh => mesh.userData.event.id === id && mesh.userData.box);

test('3D: a click on a row frames the event: the target on its tile, a tile about 48 pixels', () => {
    const map = mapOf();
    map.width = 200; map.height = 200;
    map.reactor3d.elevation = new Array(200 * 200).fill(0);
    const tank = eventOf(map, 2);
    tank.x = 76; tank.y = 59;
    const view = viewOf(map);
    global.document = fakeDocument();
    // The opening zoom of a 200 by 200 map: its middle from 180 tiles away, a tile under 7 pixels.
    view.frameMap(map);
    assert.equal(view.view.distance, 180);
    const tileBefore = Math.abs(screenOf(view, 77, 0, 59.5)[0] - screenOf(view, 76, 0, 59.5)[0]);
    assert.ok(tileBefore < 8, `a tile is ${tileBefore.toFixed(1)} px at the opening zoom`);
    assert.equal(view.frameEvent(2), true);
    // The camera looks at the middle of the event's tile, from where a tile there is about 48 pixels.
    const aim = aimAt(view, 76.5, 0, 59.5);
    assert.ok(aim.off < 0.01, `the camera looks ${aim.off.toFixed(3)} degrees off the unit`);
    const [sx, sy] = screenOf(view, 76.5, 0, 59.5);
    assert.ok(Math.abs(sx - VIEW.width / 2) < 0.5 && Math.abs(sy - VIEW.height / 2) < 0.5, `the unit is at ${sx.toFixed(1)}, ${sy.toFixed(1)} of ${VIEW.width} by ${VIEW.height}`);
    const tile = Math.abs(screenOf(view, 77, 0, 59.5)[0] - screenOf(view, 76, 0, 59.5)[0]);
    assert.ok(Math.abs(tile - MapEditor3D.FRAME_TILE_PIXELS) < 1, `a tile is ${tile.toFixed(2)} px`);
    assert.equal(MapEditor3D.FRAME_TILE_PIXELS, 48);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 34], 'the angle the author looks from is kept');
    // From closer in, the author's zoom is kept; only the target moves.
    Object.assign(view.view, { yaw: 30, pitch: 50, distance: 9 });
    assert.equal(view.frameEvent(4), true);
    assert.deepEqual([view.view.yaw, view.view.pitch, view.view.distance], [30, 50, 9]);
    assert.ok(aimAt(view, 7.5, 0, 3.5).off < 0.01);
    // A wider footprint: where its marker stands (half a tile on for an even size).
    RRMapElevation.setEventSize(map, 4, [2, 2]);
    view.frameEvent(4);
    assert.ok(aimAt(view, 8, 0, 4).off < 0.01);
    // An event that is not on this map, and a view with no camera, frame nothing.
    assert.equal(view.frameEvent(99), false);
    view.camera = null;
    assert.equal(view.frameEvent(4), false);
    assert.equal(MapEditor3D.distanceForTile(0, 40, 48), 0);
    assert.equal(MapEditor3D.distanceForTile(872, 40, 0), 0);
});

test('3D: the framed target and a unit\'s model stand on the ground under the event, the terrain\'s fall with it', async () => {
    const map = mapOf();
    // A lake bed: the terrain 26 tiles down round the Raider at (3, 3), level ground elsewhere.
    map.reactor3d.terrainWidth = map.width;
    map.reactor3d.terrain = [];
    for (let z = 0; z <= map.height; z++) for (let x = 0; x <= map.width; x++) map.reactor3d.terrain.push(x <= 5 && z <= 5 ? -26 : 0);
    const raider = eventOf(map, 2);
    assert.equal(R.elevationAt(map, 3, 3), 0, 'the tile\'s own elevation knows nothing of the terrain');
    assert.equal(MapEditor3D.eventFeet(map, raider), -26);
    R.setEventZ(map, 2, 1.5);
    assert.equal(MapEditor3D.eventFeet(map, raider), -24.5, 'the event\'s own height on top');
    R.setEventZ(map, 2, 0);
    const view = viewOf(map);
    global.document = fakeDocument();
    view.frameEvent(2);
    assert.equal(view.view.target.y, -26, 'the view turns to the bed, where the unit is');
    // The unit's model, loaded as the editor loads one.
    const asked = [];
    global.RREventPreviewModels = {
        templateFor: async (project, spec) => { asked.push(spec.name); return new THREE.Group(); },
        instance: () => { const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.6), new THREE.MeshBasicMaterial())); return model; }
    };
    view.animateModel = () => null; view.movesOnItsOwn = () => false; view.playModelEffects = () => {};
    try {
        view._buildOneEvent(raider, {}, map, 1);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(asked, ['Enemies/Raider'], 'the model the Database gives the record, with no page of the event naming one');
        const marker = markerOf(view, 2), model = view.eventGroup.children.find(child => child.userData.modelPreview);
        assert.ok(model, 'the model stands in the view');
        const boxFeet = marker.userData.box.position.y - marker.userData.boxHeight / 2;
        assert.equal(boxFeet, -26);
        assert.equal(model.position.y, boxFeet, 'the model stands where the event\'s box stands, not 26 tiles over it');
        assert.deepEqual([model.position.x, model.position.z], [3.5, 3.5]);
        // The unit is its model: the stand-in cube is not drawn, and still answers a click.
        assert.equal(marker.visible, false);
        assert.ok(view.pickables.includes(marker));
        assert.equal(marker.userData.model, model);
        // The ring goes round the model where the model is wider than the tile: 3 across, 0.6 deep.
        const ring = marker.userData.ring;
        assert.deepEqual(ring.userData.radii, [1.5, EventManager.RING_REACH]);
        assert.ok(Math.abs(ring.position.y - (-26 + MapEditor3D.RING_LIFT)) < 1e-9, 'flat on the bed');
        // The event is moved (a drag, the terrain brush under it): ring, model and its click box go with it.
        raider.x = 10; raider.y = 8;
        view.placeEvent(marker);
        assert.deepEqual(model.position.toArray(), [10.5, 0, 8.5], 'up on the level ground now');
        assert.deepEqual([ring.position.x, ring.position.z], [10.5, 8.5]);
        assert.ok(Math.abs(ring.position.y - MapEditor3D.RING_LIFT) < 1e-9);
        // Taken by its model, the whole event goes: the model on the ground, its box, ring and name with it.
        raider.x = 12; raider.y = 2;
        view.placeEvent(model);
        assert.deepEqual(model.position.toArray(), [12.5, 0, 2.5]);
        assert.deepEqual([marker.userData.box.position.x, marker.userData.box.position.z], [12.5, 2.5]);
        assert.deepEqual([ring.position.x, ring.position.z], [12.5, 2.5]);
        assert.deepEqual([marker.userData.label.position.x, marker.userData.label.position.z], [12.5, 2.5]);
        raider.x = 10; raider.y = 8;
        view.placeEvent(marker);
        const middle = model.userData.pickBox.getCenter(new THREE.Vector3()), size = model.userData.pickBox.getSize(new THREE.Vector3());
        for (const [got, wanted] of [[middle.x, 10.5], [middle.y, 0], [middle.z, 8.5], [size.x, 3], [size.y, 2], [size.z, 0.6]]) assert.ok(Math.abs(got - wanted) < 1e-6, `${got} for ${wanted}`);
    } finally { delete global.RREventPreviewModels; }
});

test('3D: a view switched off and on again looks where it was left (not at the sky)', () => {
    const map = mapOf(), view = viewOf(map);
    global.document = fakeDocument();
    view.frameMap(map);
    assert.equal(view.aimNewCamera(), true, 'the first camera is aimed');
    Object.assign(view.view, { yaw: 30, pitch: 42, distance: 30, target: { x: 8, y: 0, z: 6 } });
    view.applyCamera();
    assert.ok(aimAt(view, 8.5, 0, 6.5).off < 0.01);
    assert.equal(view.aimNewCamera(), false, 'a camera already aimed is left to the author');
    // Another map is shown in 2D: the view goes, and with it its camera. The map it had framed is remembered.
    view._framedMap = '5:16x12';
    view.camera = null;
    assert.equal(view.aimNewCamera(), false);
    // Back on the map: a new camera, which looks down its own axis from the middle of the world until it is aimed.
    view.camera = R.createCamera({ fov: 40 });
    const unaimed = aimAt(view, 8.5, 0, 6.5);
    assert.ok(unaimed.off > 30, `a new camera looks ${unaimed.off.toFixed(0)} degrees away from the map`);
    assert.equal(view.aimNewCamera(), true);
    const aimed = aimAt(view, 8.5, 0, 6.5);
    assert.ok(aimed.off < 0.01 && Math.abs(aimed.far - 30) < 1e-6, 'it looks where the author left the view');
    assert.equal(view.aimNewCamera(), false);
    // A rebuild aims a camera made since the last one, whether or not the map is framed anew.
    const source = fs.readFileSync(path.join(editorRoot, 'src/MapEditor3D.js'), 'utf8');
    const start = source.search(/\n    async rebuild\(/), rebuild = source.slice(start, start + source.slice(start + 1).indexOf('\n    }\n'));
    assert.match(rebuild, /if \(framing !== this\._framedMap\) \{\s*this\._framedMap = framing;\s*this\.frameMap\(mapData\);\s*\}\s*(?:\/\/[^\n]*\n\s*)*this\.aimNewCamera\(\);/);
});

test('3D: a unit\'s ring lies face up, round the tiles it takes, notched the way it faces', () => {
    for (const direction of [2, 4, 6, 8]) {
        const shape = MapEditor3D.unitRingShape(0.44, 0.44, direction), position = shape.positions;
        assert.equal(position.length % 3, 0);
        assert.equal(shape.index.length % 3, 0);
        const corner = i => new THREE.Vector3(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
        for (let i = 0; i < shape.index.length; i += 3) {
            const a = corner(shape.index[i]), b = corner(shape.index[i + 1]), c = corner(shape.index[i + 2]);
            const normal = b.clone().sub(a).cross(c.clone().sub(a));
            assert.ok(normal.y > 0, `triangle ${i / 3} of a ring facing ${direction} faces up`);
        }
        // Flat, inside its radii but for the arrowhead, whose tip is on the facing side.
        const [dx, dz] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction];
        let tip = 0;
        for (let i = 0; i < position.length; i += 3) {
            assert.equal(position[i + 1], 0);
            const radius = Math.hypot(position[i], position[i + 2]);
            if (radius > 0.44 + 1e-9) { tip++; assert.ok(Math.abs(position[i] - dx * (0.44 + MapEditor3D.RING_NOTCH)) < 1e-9 && Math.abs(position[i + 2] - dz * (0.44 + MapEditor3D.RING_NOTCH)) < 1e-9); }
        }
        assert.equal(tip, 1, 'one tip outside the ring');
    }
    const wide = MapEditor3D.unitRingShape(1.32, 0.44, 2);
    assert.ok(Math.max(...wide.positions.filter((value, i) => i % 3 === 0)) > 1.3, 'an ellipse for a body wider than it is deep');
});

test('3D: every unit is built as what it is, with its side\'s box and a ring that follows Event mode', async () => {
    const map = mapOf(), m = manager(map), view = viewOf(map, m);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    const sheets = { Actor1: { width: 576, height: 384 }, People1: { width: 576, height: 384 } };
    // The Goblin's file: 100 by 80, its art 80 wide and 40 tall inside a margin.
    const pixels = new Uint8ClampedArray(100 * 80 * 4);
    for (let y = 30; y < 70; y++) for (let x = 10; x < 90; x++) pixels.set([40, 160, 40, 255], (y * 100 + x) * 4);
    const read = EventManager.readPicture;
    let reads = 0;
    EventManager.readPicture = () => (++reads > 3 ? new Promise(() => {}) : Promise.resolve({ naturalWidth: 100, naturalHeight: 80, _pixels: pixels.slice() }));
    try {
        for (const event of map.events) if (event && ![2, 12].includes(event.id)) view._buildOneEvent(event, sheets, map, 1);
        // The picture is still being read: its card stands empty, and is drawn when the picture arrives.
        const card = markerOf(view, 3).material.map, drawn = () => card.image.calls.filter(call => call[0] === 'drawImage');
        assert.equal(drawn().length, 0);
        const version = card.version;
        await new Promise(resolve => setImmediate(resolve));
        // 80 by 40 fit into a card of 256 by 384: the full width, a third of the height, standing on the lower edge.
        assert.deepEqual(drawn().map(call => call.slice(6)), [[0, 384 - 128, 256, 128]]);
        assert.ok(card.version > version, 'and sent to the graphics card');
        assert.equal(reads, 1, 'one reading serves both goblins');
        assert.deepEqual([card.image.width, card.image.height], [256, 384]);
    } finally { EventManager.readPicture = read; }
    const part = id => { const marker = markerOf(view, id); return { marker, ring: marker.userData.ring || null, box: marker.userData.box }; };
    // The plain figure and the battler picture: a billboard a tile wide and a tile and a half tall, feet on the tile.
    for (const id of [3, 4, 7, 11]) {
        const { marker } = part(id);
        assert.ok(marker.material.map, `event ${id} stands as a picture`);
        assert.deepEqual([marker.geometry.parameters.width, marker.geometry.parameters.height], [ReactorFightLook.TILES_WIDE, ReactorFightLook.TILES_TALL]);
        assert.equal(marker.position.y - marker.geometry.parameters.height / 2, 0, 'standing on the ground');
        assert.ok(view.billboards.includes(marker), 'turned to the viewer, as a character is');
    }
    // The record's character sheet, as an event's own sheet is drawn.
    for (const id of [5, 6]) assert.deepEqual([part(id).marker.geometry.parameters.width, part(id).marker.geometry.parameters.height], [1, 1]);
    assert.equal(part(8).marker.geometry.parameters.height, 1, 'a unit with its own picture keeps it');
    // An event that does not fight: its trigger's color, no ring.
    assert.equal(part(10).marker.geometry.type, 'BoxGeometry');
    assert.equal(part(10).box.userData.color, 0xff6b6b);
    assert.equal(part(10).ring, null);
    assert.equal(part(1).ring, null);
    // Units: the box and the ring in the side's color.
    const hex = color => parseInt(color.slice(1), 16);
    assert.deepEqual([part(4).box.userData.color, part(4).ring.material.color.getHex()], [hex(ENEMY), hex(ENEMY)]);
    assert.deepEqual([part(6).box.userData.color, part(6).ring.material.color.getHex()], [hex(ALLY), hex(ALLY)]);
    assert.deepEqual([part(7).box.userData.color, part(7).ring.material.color.getHex()], [hex(NEUTRAL), hex(NEUTRAL)]);
    assert.ok(part(9).ring, 'a unit made by a comment has its ring');
    assert.ok(Math.abs(part(4).ring.position.y - MapEditor3D.RING_LIFT) < 1e-9, 'just over the ground');
    assert.deepEqual([part(4).ring.position.x, part(4).ring.position.z], [7.5, 3.5]);
    assert.equal(part(3).ring.userData.facing, 4, 'the Goblin Scout faces left');
    // Event mode is off and no card is open: the rings are built and not drawn.
    const rings = view.pickables.map(marker => marker.userData.ring).filter(Boolean);
    assert.equal(rings.length, 8, 'the eight units built here');
    assert.ok(rings.every(ring => ring.visible === false));
    const built = view.eventGroup.children.length;
    m.eventMode = true;
    assert.ok(rings.every(ring => ring.visible === true), 'Event mode on: they appear');
    assert.equal(view.eventGroup.children.length, built, 'and nothing was built again');
    m.eventMode = false;
    assert.ok(rings.every(ring => ring.visible === false));
    global.RRBattleSetup = { isOpen: () => true };
    try { assert.equal(view.syncUnitRings(), true); assert.ok(rings.every(ring => ring.visible === true), 'Battle Setup open: they appear'); } finally { delete global.RRBattleSetup; }
    assert.equal(view.syncUnitRings(), true);
    assert.equal(view.syncUnitRings(), false, 'nothing to change, nothing drawn');
    // A sized unit: its billboard and its ring take its size.
    RRMapElevation.setEventSize(map, 4, [2, 2]);
    const big = view.unitPictureSprite(eventOf(map, 4), EventManager.unitLook(eventOf(map, 4), map), map);
    assert.deepEqual([big.geometry.parameters.width, big.geometry.parameters.height], [2, 3]);
});

test('3D: the character sheets records give their units are loaded with the events\' own', async () => {
    const map = mapOf(), view = viewOf(map);
    view.path = path;
    view.projectPath = () => PROJECT;
    const asked = [];
    global.Image = class { set src(value) { asked.push(value); setImmediate(() => this.onload()); } };
    try {
        const sheets = await view.loadCharacterSheets(map);
        assert.deepEqual(Object.keys(sheets).sort(), ['Actor1', 'People1'], 'People1 is two events\' own picture; Actor1 is only what an actor and an enemy record give');
        assert.equal(asked.length, 2);
    } finally { delete global.Image; }
});

test('3D: what a unit looks like is part of what the view compares, so a record\'s new look reaches the map', () => {
    const map = mapOf(), view = viewOf(map);
    const nobody = eventOf(map, 4), before = view._eventIdentity(nobody, map);
    assert.equal(view._eventIdentity(nobody, map), before);
    assert.equal(view.eventColor(nobody), parseInt(ENEMY.slice(1), 16));
    // The record gets a battler picture.
    database.enemies[3].battlerName = 'Goblin';
    EventManager._lookSources = null;
    try {
        assert.notEqual(view._eventIdentity(nobody, map), before, 'the picture is new: the event is built again');
        assert.equal(EventManager.unitLook(nobody, map).kind, 'picture');
    } finally { database.enemies[3].battlerName = ''; EventManager._lookSources = null; }
    assert.equal(view._eventIdentity(nobody, map), before);
    // Its side changes.
    nobody.rrUnit = unit('ally', 'enemy', 3);
    assert.notEqual(view._eventIdentity(nobody, map), before);
    assert.equal(view.eventColor(nobody), parseInt(ALLY.slice(1), 16));
    // It stops fighting: an ordinary event again, in its trigger's color.
    delete nobody.rrUnit;
    assert.equal(view.eventColor(nobody), 0xff6b6b);
    assert.equal(MapEditor3D.previewModelSpec(map, eventOf(map, 2), 0).name, 'Enemies/Raider', 'a unit\'s model is its record\'s');
    assert.equal(MapEditor3D.previewModelSpec(map, eventOf(map, 10), 0), null);
});

test('3D: an event built again gives back the pictures drawn for it, and an unchanged map only follows the rings', async () => {
    const map = mapOf();
    map.events = map.events.filter(event => !event || [4, 7, 10].includes(event.id));
    const m = manager(map), view = viewOf(map, m);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    view._eventSnapshot = new Map();
    for (const id of [4, 7, 10]) { view._buildOneEvent(eventOf(map, id), {}, map, 1); view._eventSnapshot.set(id, view._eventIdentity(eventOf(map, id), map)); }
    Object.assign(view, { select() {}, disposeEffectPlays() {}, syncEventArrows() {}, refreshPassage() { this.passages = (this.passages || 0) + 1; }, loadCharacterSheets: async () => ({}) });
    const frames = [];
    global.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    try {
        const run = async () => { view.refreshEvents(); await frames.pop()(); };
        const figure = markerOf(view, 4), label = figure.userData.label, ring = figure.userData.ring;
        let gone = 0, shared = 0;
        label.material.map.addEventListener('dispose', () => { gone++; });
        figure.material.map.addEventListener('dispose', () => { shared++; });
        // Nothing changed: nothing is built, and the rings follow Event mode.
        m._eventMode = true;
        await run();
        assert.equal(markerOf(view, 4), figure);
        assert.equal(ring.visible, true);
        assert.equal(gone, 0);
        // The unit changes side: its pieces are built again and the picture drawn for it alone is given back.
        // (The author looks from the east, from half the distance names are drawn full size at.)
        Object.assign(view.view, { yaw: 90, distance: 12 });
        eventOf(map, 4).rrUnit = unit('ally', 'enemy', 3);
        await run();
        assert.notEqual(markerOf(view, 4), figure);
        const rebuilt = markerOf(view, 4);
        assert.deepEqual([rebuilt.rotation.y, rebuilt.userData.label.rotation.y], [-Math.PI / 2, -Math.PI / 2], 'the new picture and name face the eye where it is now');
        assert.deepEqual([rebuilt.userData.label.visible, rebuilt.userData.label.scale.x], [true, 0.5], 'the name at the size the distance gives it');
        assert.equal(gone, 1, 'its name plate\'s picture');
        assert.equal(shared, 0, 'the enemy side\'s plain figure is every such unit\'s picture: it stays');
        assert.notEqual(markerOf(view, 4).material.map, figure.material.map, 'it stands as the ally side\'s figure now');
        assert.equal(view.eventGroup.children.includes(ring), false, 'the old ring went with it');
        assert.equal(markerOf(view, 4).userData.ring.material.color.getHex(), parseInt(ALLY.slice(1), 16));
        assert.equal(markerOf(view, 4).userData.ring.visible, true);
        // A ring that was not built again still follows: Event mode went off while another event changed.
        const bystander = markerOf(view, 7).userData.ring;
        assert.equal(bystander.visible, true);
        m._eventMode = false;
        eventOf(map, 4).rrUnit = unit('enemy', 'enemy', 3);
        await run();
        assert.equal(markerOf(view, 7).userData.ring, bystander, 'the bystander was left as it stood');
        assert.equal(bystander.visible, false);
        assert.equal(markerOf(view, 4).userData.ring.visible, false);
    } finally { delete global.requestAnimationFrame; }
});

//-----------------------------------------------------------------------------
// A unit's side, whatever page is drawn

const hexOf = color => parseInt(color.slice(1), 16);

test('a unit drawn on another page by Preview Event keeps its side: ring, outline, box and list mark', () => {
    const map = mapOf();
    // "Second Page" (9) is an enemy on its page 2; Preview Event shows its page 1, which has a picture of its own and faces right.
    eventOf(map, 9).pages[0] = page(Object.assign(blank(), { characterName: 'People1', characterIndex: 4, direction: 6 }));
    // The Goblin Scout (a unit on every page) gets a second page that faces up, and Preview Event shows it.
    eventOf(map, 3).pages.push(page(Object.assign(blank(), { direction: 8 })));
    map.reactor3d.eventPreviews = { 9: 0, 3: 1 };
    const m = manager(map), view = viewOf(map, m);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    const second = eventOf(map, 9);
    assert.equal(EventManager.unitLook(second, map), null, 'the page drawn is not the page it is a unit on');
    assert.deepEqual(EventManager.unitSide(second, map), { team: 'enemy', color: ENEMY }, 'it is an enemy all the same');
    assert.equal(EventManager.unitSide(eventOf(map, 10), map), null, 'an event that does not fight has no side');
    assert.deepEqual(EventManager.unitSide(eventOf(map, 7), map), { team: 'neutral', color: NEUTRAL });
    assert.deepEqual(m.unitSide(eventOf(map, 6)), { team: 'ally', color: ALLY });
    // 2D: its ring, notched the way the page drawn faces; its outline in its side's color; the chosen page's picture.
    m.eventMode = true;
    m.renderEventPreviews();
    const rings = m.unitRingLayer.draws.filter(draw => draw.op === 'ellipse');
    assert.ok(rings.some(draw => draw.args[0] === 9.5 * 48 && draw.args[1] === 6.5 * 48), 'its ring is drawn');
    const tips = m.unitRingLayer.draws.filter(draw => draw.op === 'poly').map(draw => draw.args[0]);
    assert.ok(tips.some(points => points[0] > 9.5 * 48 + 48 * EventManager.RING_REACH && points[1] === 6.5 * 48), 'a tip right of its ring');
    assert.ok(tips.some(points => points[0] === 5.5 * 48 && points[1] < 3.5 * 48 - 48 * EventManager.RING_REACH), 'the Goblin Scout\'s notch is its second page\'s facing: a tip above its ring');
    assert.equal(tips.some(points => points[0] < 5.5 * 48 - 48 * EventManager.RING_REACH && points[1] === 3.5 * 48), false, 'not its first page\'s');
    const tone = outline => outline.draws.filter(draw => draw.op === 'stroke').pop().style.color;
    assert.equal(tone(m.eventOutlines.get(9)), hexOf(ENEMY));
    const sprite = m._previewSprites.get(9).sprite;
    assert.deepEqual([sprite.texture.sheet, sprite.texture.index], ['People1', 4], 'the picture is the chosen page\'s');
    m.updateEventsList();
    const row = document.byId['events-list'].children.find(entry => Number(entry.dataset.eventId) === 9);
    assert.deepEqual([row.dataset.side, row.style.properties['--rr-unit-side']], ['enemy', ENEMY]);
    // 3D: the box and the ring.
    view._buildOneEvent(second, { People1: { width: 576, height: 384 } }, map, 1);
    const marker = markerOf(view, 9);
    assert.equal(marker.userData.box.userData.color, hexOf(ENEMY));
    assert.equal(view.eventColor(second), hexOf(ENEMY));
    assert.ok(marker.userData.ring, 'its ring is built');
    assert.deepEqual([marker.userData.ring.material.color.getHex(), marker.userData.ring.userData.facing, marker.userData.ring.visible], [hexOf(ENEMY), 6, true]);
    assert.equal(marker.userData.unit, true);
    view._buildOneEvent(eventOf(map, 3), {}, map, 1);
    assert.equal(markerOf(view, 3).userData.ring.userData.facing, 8, 'the notch of the page drawn');
    // Where a look is drawn, the ring is the look's color: the card's tiles and the map cannot differ.
    global.RRBattleSetup = { lookOf: told => ({ kind: 'figure', team: told.team, color: '#123456' }) };
    try { assert.equal(EventManager.unitSide(eventOf(map, 4), map).color, '#123456'); } finally { delete global.RRBattleSetup; }
});

//-----------------------------------------------------------------------------
// Looks said outside the map

test('a record\'s new look reaches both map views when the Database closes, with no event edited', async () => {
    const map = mapOf();
    map.events = map.events.filter(event => !event || [3, 4, 10, 11].includes(event.id));
    const m = manager(map), view = viewOf(map, m);
    const doc = global.document = fakeDocument();
    const viewer = doc.byId['database-viewer'] = element('div');
    const announced = [];
    doc.dispatchEvent = event => { announced.push(event.type); };
    const watches = [];
    global.MutationObserver = class { constructor(callback) { this.callback = callback; watches.push(this); } observe(target, options) { this.target = target; this.options = options; } };
    const frames = [];
    global.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    // Every frame asked for is run, the pictures being read arrive, and what they asked for is run too.
    const settle = async () => {
        for (let round = 0; round < 3; round++) {
            while (frames.length) await frames.shift()();
            await new Promise(resolve => setImmediate(resolve));
        }
    };
    const pixels = new Uint8ClampedArray(100 * 80 * 4);
    for (let y = 10; y < 70; y++) for (let x = 20; x < 60; x++) pixels.set([200, 40, 40, 255], (y * 100 + x) * 4);
    const read = EventManager.readPicture;
    let reads = 0;
    EventManager.readPicture = () => (++reads > 6 ? new Promise(() => {}) : Promise.resolve({ naturalWidth: 100, naturalHeight: 80, _pixels: pixels.slice() }));
    EventManager._lookArts.clear();
    EventManager._databaseWatch = null;
    Object.assign(m, { createCharacterSprite: () => null, updateSelectionHighlight() {} });
    Object.assign(view, { select() {}, disposeEffectPlays() {}, syncEventArrows() {}, refreshPassage() {}, loadCharacterSheets: async () => ({}) });
    try {
        view._eventSnapshot = new Map();
        for (const id of [3, 4, 10, 11]) { view._buildOneEvent(eventOf(map, id), {}, map, 1); view._eventSnapshot.set(id, view._eventIdentity(eventOf(map, id), map)); }
        m.renderEvents();
        await settle();
        assert.equal(watches.length, 1, 'one watch on the Database window');
        assert.equal(watches[0].target, viewer);
        assert.deepEqual(watches[0].options, { attributes: true, attributeFilter: ['class'] });
        const at2D = id => { const event = eventOf(map, id); return m.unitLookLayer.children.find(child => child.x === (event.x + 0.5) * 48 && child.y === (event.y + 1) * 48 - 6); };
        const before = { nobody2D: at2D(4).texture, lost2D: at2D(11).texture, nobody3D: markerOf(view, 4), lost3D: markerOf(view, 11), scout3D: markerOf(view, 3), figure: markerOf(view, 4).material.map };
        assert.equal(EventManager.unitLook(eventOf(map, 4), map).kind, 'figure');
        assert.equal(EventManager.unitLook(eventOf(map, 11), map).kind, 'figure');
        // The Database opens over the map: nothing is drawn for that.
        const drawn = announced.length;
        viewer.classList.add('active');
        watches[0].callback();
        assert.equal(announced.length, drawn);
        // In it, Nobody's record is given the Goblin's picture, and the file Lost Picture's record names is put into the project.
        database.enemies[3].battlerName = 'Goblin';
        database.files.add('enemies/Gone');
        // OK closes it. No event was edited.
        viewer.classList.remove('active');
        watches[0].callback();
        assert.deepEqual(announced.slice(drawn), ['rr-events-changed'], 'the events are drawn again and the 3D view is told');
        await settle();
        assert.equal(EventManager.unitLook(eventOf(map, 4), map).kind, 'picture');
        assert.equal(EventManager.unitLook(eventOf(map, 11), map).kind, 'picture', 'the file is looked for again');
        assert.notEqual(at2D(4).texture, before.nobody2D, '2D: Nobody stands as the picture');
        assert.notEqual(at2D(11).texture, before.lost2D);
        assert.notEqual(markerOf(view, 4), before.nobody3D, '3D: its pieces were built again');
        assert.notEqual(markerOf(view, 4).material.map, before.figure, 'from the picture, not the plain figure');
        assert.notEqual(markerOf(view, 11), before.lost3D);
        assert.equal(markerOf(view, 3), before.scout3D, 'a unit whose record did not change is left standing');
        // Opened and closed with nothing changed (Cancel): drawn again, nothing built again.
        const kept = markerOf(view, 4), told = announced.length;
        viewer.classList.add('active');
        watches[0].callback();
        viewer.classList.remove('active');
        watches[0].callback();
        await settle();
        assert.equal(announced.length, told + 1);
        assert.equal(markerOf(view, 4), kept);
        // One watch for the editor, however often the events are drawn; a page without the window sets none.
        m.renderEvents();
        await settle();
        assert.equal(watches.length, 1);
        EventManager._databaseWatch = null;
        delete doc.byId['database-viewer'];
        assert.equal(EventManager.watchDatabase(), false);
        // With no map open there is nothing to draw.
        m.currentMap = null;
        assert.equal(EventManager.looksChanged(), false);
    } finally {
        database.enemies[3].battlerName = '';
        database.files.delete('enemies/Gone');
        EventManager.readPicture = read;
        EventManager._lookArts.clear();
        EventManager._lookSources = null;
        EventManager._databaseWatch = null;
        delete global.MutationObserver;
        delete global.requestAnimationFrame;
    }
});

//-----------------------------------------------------------------------------
// A drag on the 2D map

test('2D: a dragged event\'s picture or model, its name and its ring go with it tile by tile', () => {
    const map = mapOf();
    // The Grocer is no unit: Preview Event draws its first page.
    map.reactor3d.eventPreviews = { 1: 0 };
    const m = manager(map);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    Object.assign(m, { saveState() {}, resetMapClickTracking() {}, selectTile(x, y) { this.tile = [x, y]; }, updateSelectionHighlight() {} });
    let modelDraws = 0;
    const props = m.projectController.modelPropsManager, render = props.render;
    props.render = function() { modelDraws++; return render.call(this); };
    m.eventMode = true;
    m.renderEventPreviews();
    // The events' own squares, as the map draws them.
    for (const event of map.events) {
        if (!event) continue;
        const square = m.eventContainer.addChild(new PIXI.Container());
        square.x = event.x * 48; square.y = event.y * 48;
        m.eventSprites.set(event.id, square);
    }
    // The pointer holds the event by the middle of its square and is moved to the middle of tile (x, y).
    const drag = (event, x, y) => {
        m.isDragging = true; m.draggedEvent = event; m.dragOffset = { x: 24, y: 24 };
        m.updateDrag({ data: { getLocalPosition: () => ({ x: x * 48 + 24, y: y * 48 + 24 }) } });
    };
    const ringsAt = () => m.unitRingLayer.draws.filter(draw => draw.op === 'ellipse').map(draw => [draw.args[0] / 48, draw.args[1] / 48]);
    const has = (list, x, y) => list.some(([a, b]) => a === x && b === y);
    // The plain figure (Nobody, at 7, 3) is taken two tiles down.
    const nobody = eventOf(map, 4), figure = m._previewSprites.get(4).sprite, name = m.eventNames.get(4).sprite;
    assert.deepEqual([figure.x, figure.y], [7.5 * 48, 4 * 48 - 6]);
    const drawnBefore = modelDraws;
    drag(nobody, 7, 5);
    assert.deepEqual([nobody.x, nobody.y], [7, 5]);
    assert.deepEqual([m.eventSprites.get(4).x, m.eventSprites.get(4).y], [7 * 48, 5 * 48], 'its square');
    assert.deepEqual([m.eventOutlines.get(4).x, m.eventOutlines.get(4).y], [7 * 48, 5 * 48], 'its outline');
    assert.equal(m._previewSprites.get(4).sprite, figure, 'the same picture, moved, not drawn again');
    assert.equal(figure.parent, m.unitLookLayer);
    assert.deepEqual([figure.x, figure.y], [7.5 * 48, 6 * 48 - 6], 'its picture, feet on the new tile');
    assert.deepEqual([name.x, name.y], [7 * 48 + 24, 5 * 48 + 42], 'its name');
    assert.ok(has(ringsAt(), 7.5, 5.5) && !has(ringsAt(), 7.5, 3.5), 'its ring');
    assert.equal(modelDraws, drawnBefore, 'the placed models\' layer is not drawn again for a picture');
    // A unit that stands as a model (the Raider): the models' layer draws it on the new tile.
    const raider = eventOf(map, 2);
    drag(raider, 3, 4);
    assert.equal(modelDraws, drawnBefore + 1, 'once for the tile it crossed');
    assert.deepEqual(props.asked.filter(entry => entry.id === -2).map(entry => [entry.x, entry.y]), [[3, 4]]);
    assert.ok(has(ringsAt(), 3.5, 4.5) && !has(ringsAt(), 3.5, 3.5));
    assert.deepEqual([m.eventNames.get(2).sprite.x, m.eventNames.get(2).sprite.y], [3 * 48 + 24, 4 * 48 + 42]);
    // A unit drawn from its record's sheet.
    const katie = eventOf(map, 6), sheet = m._previewSprites.get(6).sprite;
    drag(katie, 5, 7);
    assert.deepEqual([sheet.x, sheet.y], [5.5 * 48, 8 * 48 - 6]);
    // An event that is no unit, drawn by Preview Event under its square: its picture goes with it, and no ring is drawn for it.
    const grocer = eventOf(map, 1), own = m._previewSprites.get(1).sprite, rings = ringsAt().length, renders = m.tilemapManager.renders;
    assert.equal(own.parent, m.eventPreviewContainer);
    drag(grocer, 1, 2);
    assert.deepEqual([own.x, own.y], [1.5 * 48, 3 * 48 - 6]);
    assert.equal(ringsAt().length, rings);
    assert.ok(m.tilemapManager.renders > renders, 'and the map is drawn');
    // Over a tile another event stands on, nothing moves.
    drag(nobody, 7, 6);
    assert.deepEqual([nobody.x, nobody.y, figure.y], [7, 5, 6 * 48 - 6]);
    // A sized unit's picture stays in the middle of its tiles.
    RRMapElevation.setEventSize(map, 11, [2, 2]);
    m.renderEventPreviews();
    const lost = eventOf(map, 11), big = m._previewSprites.get(11).sprite;
    assert.deepEqual([big.x, big.y], [(11 + 1) * 48, (6 + 1.5) * 48 - 6]);
    drag(lost, 12, 8);
    assert.deepEqual([lost.x, lost.y], [12, 8]);
    assert.deepEqual([big.x, big.y], [(12 + 1) * 48, (8 + 1.5) * 48 - 6]);
    assert.ok(has(ringsAt(), 13, 9), 'its ring round the middle of its two by two tiles');
    m.isDragging = false; m.draggedEvent = null;
});

test('2D: an outlined event\'s name is written over what stands on it, and stays sharp at any zoom', () => {
    const map = mapOf();
    RRMapElevation.setEventSize(map, 7, [2, 2]);
    const m = manager(map);
    EventManager._lookArts.clear();
    m.labelResolution = () => 2;
    m.eventMode = true;
    m.renderEventPreviews();
    const order = labels(m);
    assert.equal(order.indexOf('event names'), order.indexOf('event outlines') + 1, order.join(' | '));
    assert.ok(order.indexOf('event outlines') > order.indexOf('unit looks') && order.indexOf('unit looks') > order.indexOf('unit rings'), order.join(' | '));
    const names = () => m.eventNameLayer.children;
    assert.deepEqual(names().map(name => name.text).sort(), map.events.filter(event => event && ![1, 10].includes(event.id)).map(event => event.name).sort(), 'each of the ten units');
    const nameOf = id => m.eventNames.get(id).sprite;
    assert.deepEqual([nameOf(4).text, nameOf(4).x, nameOf(4).y, nameOf(4).resolution], ['Nobody', 7 * 48 + 24, 3 * 48 + 42, 2], 'where its square writes it: the middle of its lower edge');
    assert.deepEqual([nameOf(7).x, nameOf(7).y], [7.5 * 48 + 24, 6.5 * 48 + 42], 'a two by two unit: in the square in the middle of its tiles');
    assert.equal(m.eventNames.has(10), false, 'an event with nothing drawn on it has its name in its square alone');
    // The zoom changes: the names are drawn again at the pixels it needs, with the squares' own.
    m.labelResolution = () => 5;
    m.updateLabelResolution();
    assert.ok(names().every(name => name.resolution === 5));
    // Drawn again: one of each, the layers where they were.
    m.renderEventPreviews();
    assert.equal(names().length, 10);
    assert.deepEqual(labels(m), order);
    // An event without a name has none to write.
    eventOf(map, 4).name = '';
    m.renderEventPreviews();
    assert.equal(m.eventNames.has(4), false);
    assert.equal(names().length, 9);
    // The placed models' layer made by a later drawing than the first: the units' layers take their places by it then.
    const late = manager(mapOf()), models = late.projectController.modelPropsManager;
    late.projectController.modelPropsManager = null;
    late.renderEventPreviews();
    assert.equal(labels(late).includes('model props'), false);
    late.projectController.modelPropsManager = models;
    late.renderEventPreviews();
    const then = labels(late);
    assert.equal(then.indexOf('unit looks'), then.indexOf('model props') + 1, then.join(' | '));
    assert.equal(then.indexOf('event outlines'), then.indexOf('unit looks') + 1, then.join(' | '));
    assert.equal(then.indexOf('event names'), then.indexOf('event outlines') + 1, then.join(' | '));
});

//-----------------------------------------------------------------------------
// The ring on uneven ground

test('3D: a unit\'s ring lies on the ground as it rises and falls, and is drawn over what stands on it', () => {
    const map = mapOf();
    // The land rises half a tile for each tile east.
    map.reactor3d.terrainWidth = map.width;
    map.reactor3d.terrain = [];
    for (let z = 0; z <= map.height; z++) for (let x = 0; x <= map.width; x++) map.reactor3d.terrain.push(x * 0.5);
    const view = viewOf(map);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    const nobody = eventOf(map, 4);
    view._buildOneEvent(nobody, {}, map, 1);
    const ring = markerOf(view, 4).userData.ring, corners = ring.geometry.getAttribute('position');
    const onGround = label => {
        assert.equal(ring.geometry.getAttribute('position'), corners, 'the ring keeps the corners it was built with');
        for (let i = 0; i < corners.count; i++) {
            const ground = R.groundHeightAt(map, ring.position.x + corners.getX(i), ring.position.z + corners.getZ(i));
            assert.ok(Math.abs(ring.position.y + corners.getY(i) - (ground + MapEditor3D.RING_LIFT)) < 1e-5, `${label}: corner ${i} lies ${(ring.position.y + corners.getY(i) - ground).toFixed(3)} over the ground`);
        }
    };
    assert.equal(MapEditor3D.eventFeet(map, nobody), 7.5 * 0.5);
    assert.ok(Math.abs(ring.position.y - (7.5 * 0.5 + MapEditor3D.RING_LIFT)) < 1e-9, 'its middle at the unit\'s feet');
    onGround('built');
    assert.ok(Math.abs(corners.getY(0) - EventManager.RING_REACH * 0.5) < 1e-5, 'its east rim higher than its middle by the slope');
    const heights = Array.from({ length: corners.count }, (unused, i) => corners.getY(i));
    assert.ok(Math.min(...heights) < -0.2 && Math.max(...heights) > 0.2, 'tilted, not flat');
    // Drawn over what stands on it (grass, a slope's shoulder), just under an event's box drawn on top.
    assert.deepEqual([ring.material.depthTest, ring.material.depthWrite, ring.material.transparent, ring.renderOrder], [false, false, true, MapEditor3D.RING_ORDER]);
    assert.ok(MapEditor3D.RING_ORDER < 998);
    // Moved (a drag, the terrain brush): laid again where it is now.
    nobody.x = 11; nobody.y = 8;
    view.placeEvent(markerOf(view, 4));
    assert.ok(Math.abs(ring.position.y - (11.5 * 0.5 + MapEditor3D.RING_LIFT)) < 1e-9);
    onGround('moved');
    // A model wider than the tile, its middle a tile east of the unit's: the ring goes round it and is laid again, from the unit's feet.
    view.fitUnitRing(markerOf(view, 4), new THREE.Box3(new THREE.Vector3(10.5, 0, 8), new THREE.Vector3(14.5, 3, 9)));
    assert.deepEqual(ring.userData.radii, [2, 0.5]);
    assert.deepEqual([ring.position.x, ring.position.z, ring.userData.shift], [12.5, 8.5, [1, 0]]);
    assert.ok(Math.abs(ring.position.y - (11.5 * 0.5 + MapEditor3D.RING_LIFT)) < 1e-9, 'its height is still the unit\'s feet');
    onGround('round a model');

    // Level land with a cliff: two cells east of a unit whose model is four tiles wide, the land stands five tiles up. That is not ground its ring lies on.
    const flat = mapOf(), other = viewOf(flat);
    flat.reactor3d.elevation[6 * flat.width + 9] = 5;
    assert.equal(R.groundHeightAt(flat, 9.2, 6.5), 5);
    other._buildOneEvent(eventOf(flat, 7), {}, flat, 1);
    other.fitUnitRing(markerOf(other, 7), new THREE.Box3(new THREE.Vector3(5.5, 0, 6), new THREE.Vector3(9.5, 3, 7)));
    const wide = markerOf(other, 7).userData.ring;
    assert.deepEqual(wide.userData.radii, [2, 0.5]);
    const overCell = (at, i) => Math.floor(wide.position.x + at.getX(i)) === 9 && Math.floor(wide.position.z + at.getZ(i)) === 6;
    let overCliff = 0;
    const level = wide.geometry.getAttribute('position');
    for (let i = 0; i < level.count; i++) {
        if (overCell(level, i)) overCliff++;
        assert.equal(level.getY(i), 0, `corner ${i} stays level`);
    }
    assert.ok(overCliff > 2, 'some of its corners reach over the cliff\'s cell');
    // A low step there is ground: those corners lie on it.
    flat.reactor3d.elevation[6 * flat.width + 9] = 0.5;
    other.placeEvent(markerOf(other, 7));
    const stepped = wide.geometry.getAttribute('position');
    let onStep = 0;
    for (let i = 0; i < stepped.count; i++) {
        assert.equal(stepped.getY(i), overCell(stepped, i) ? 0.5 : 0);
        if (overCell(stepped, i)) onStep++;
    }
    assert.equal(onStep, overCliff);
    // What is built counts the same way: a floor slab's thickness is ground the ring lies on, a wall's top is not.
    flat.reactor3d.elevation[6 * flat.width + 9] = 0;
    const laid = () => { const at = wide.geometry.getAttribute('position'); return Array.from({ length: at.count }, (unused, i) => [overCell(at, i), at.getY(i)]); };
    flat.reactor3d.pieces = [{ id: 1, kind: 'floor', x: 9, y: 6, z: 0, rot: 0, material: '' }];
    const slab = R.groundHeightAt(flat, 9.2, 6.5);
    assert.ok(slab > 0 && slab <= MapEditor3D.RING_STEP, `a floor slab is ${slab} tiles thick`);
    other.placeEvent(markerOf(other, 7));
    for (const [over, y] of laid()) assert.ok(Math.abs(y - (over ? slab : 0)) < 1e-6);
    flat.reactor3d.pieces = [{ id: 1, kind: 'wall', x: 9, y: 6, z: 0, rot: 0, material: '' }];
    assert.ok(R.groundHeightAt(flat, 9.2, 6.5) > MapEditor3D.RING_STEP);
    other.placeEvent(markerOf(other, 7));
    for (const [, y] of laid()) assert.equal(y, 0);
});

//-----------------------------------------------------------------------------
// Seeing what a row click frames

/** A level, two-sided sheet from (x0, z0) to (x1, z1) at height y: ground, a canopy, a roof. */
function sheet(x0, z0, x1, z1, y) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.updateMatrixWorld(true);
    return mesh;
}

test('3D: a row click looks from where the event is seen: over a canopy, round it, in under a roof, never from under water', () => {
    const big = () => {
        const map = mapOf();
        map.width = 200; map.height = 200;
        map.reactor3d.elevation = new Array(200 * 200).fill(0);
        Object.assign(eventOf(map, 2), { x: 76, y: 59 });
        return map;
    };
    const reach = MapEditor3D.distanceForTile(VIEW.height, 40, 48);
    /** A view at the opening zoom of the map, over level ground and whatever else is laid. */
    const start = (laid, map = big()) => {
        const view = viewOf(map);
        view.frameMap(map);
        view.mapScene._meshes.push(sheet(-100, -100, 300, 300, 0), ...laid);
        return view;
    };
    const sees = (view, x = 76.5, z = 59.5, id = 2) => view.sightBlocked(view.camera.position.clone(), new THREE.Vector3(x, view.view.target.y + MapEditor3D.SIGHT_RISE, z), eventOf(view.currentMap(), id)) === null;
    global.document = fakeDocument();

    // Open ground: the angle the author looks from is kept.
    let view = start([]);
    assert.equal(view.frameEvent(2), true);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 34]);
    assert.ok(Math.abs(view.view.distance - reach) < 1e-9);
    assert.ok(sees(view));

    // A canopy six tiles up, south of the unit, between the eye and the unit: the view looks from steeper on the same side.
    view = start([sheet(56, 61, 97, 101, 6)]);
    const blocked = view.sightBlocked(MapEditor3D.eyeAt({ x: 76, y: 0, z: 59 }, 0, 34, reach, new THREE.Vector3()), new THREE.Vector3(76.5, 0.8, 59.5), eventOf(view.currentMap(), 2));
    assert.ok(blocked > 5 && blocked < reach, `from the author's angle the canopy is met ${blocked} tiles from the eye`);
    view.frameEvent(2);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 75]);
    assert.ok(Math.abs(view.view.distance - reach) < 1e-9, 'a tile stays the working size');
    assert.ok(sees(view));
    assert.ok(aimAt(view, 76.5, 0, 59.5).off < 0.01, 'the unit is in the middle of the view');
    assert.ok(MapEditor3D.eyeAt(view.view.target, 0, 75, reach, new THREE.Vector3()).distanceTo(view.camera.position) < 1e-9, 'the eye asked about is where the camera stands');

    // The canopy reaches over the unit: no steeper angle sees under it, and the view goes round to the other side.
    view = start([sheet(56, 59.6, 97, 101, 6)]);
    view.frameEvent(2);
    assert.deepEqual([view.view.yaw, view.view.pitch], [180, 34]);
    assert.ok(sees(view));
    assert.ok(aimAt(view, 76.5, 0, 59.5).off < 0.01);
    // An author already looking from steeper than the angles tried keeps that pitch on the other side.
    view = start([sheet(56, 59.6, 97, 101, 6)]);
    Object.assign(view.view, { yaw: 10, pitch: 80 });
    view.frameEvent(2);
    assert.deepEqual([view.view.yaw, view.view.pitch], [190, 80]);

    // A roof over everything: seen from nowhere at the working distance, so the view comes in under it at the author's angle.
    view = start([sheet(-100, -100, 300, 300, 5)]);
    view.frameEvent(2);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 34]);
    assert.ok(view.view.distance >= MapEditor3D.NEAREST_VIEW && view.view.distance < 5 / Math.sin(34 * Math.PI / 180), `the eye stands ${view.view.distance.toFixed(2)} tiles off`);
    assert.ok(view.camera.position.y < 5, 'under the roof');
    assert.ok(sees(view));
    // A ceiling too low to get under: the author's view is kept at the working distance.
    view = start([sheet(-100, -100, 300, 300, 1.2)]);
    view.frameEvent(2);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 34]);
    assert.ok(Math.abs(view.view.distance - reach) < 1e-9);

    // A placed model stands in the way: the view looks over it. The unit's own model does not cover the unit.
    view = start([]);
    const wall = new THREE.Group();
    wall.add(new THREE.Mesh(new THREE.BoxGeometry(6, 12, 2), new THREE.MeshBasicMaterial()));
    wall.position.set(76.5, 6, 66);
    wall.userData.propId = 4;
    view.propGroup = new THREE.Group();
    view.propGroup.add(wall);
    const body = new THREE.Group();
    body.add(new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
    body.position.set(76.5, 4, 59.5);
    Object.assign(body.userData, { modelPreview: true, event: eventOf(view.currentMap(), 2) });
    view.eventGroup.add(body);
    view.propGroup.updateMatrixWorld(true);
    view.eventGroup.updateMatrixWorld(true);
    view.frameEvent(2);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 75]);
    assert.ok(sees(view));
    // Another unit behind that body: the body covers it from the south and from above, so it is looked at from the north.
    Object.assign(eventOf(view.currentMap(), 4), { x: 76, y: 57 });
    Object.assign(view.view, { yaw: 0, pitch: 34 });
    view.frameEvent(4);
    assert.deepEqual([view.view.yaw, view.view.pitch], [180, 34]);
    assert.ok(sees(view, 76.5, 57.5, 4));
    // The ray asked with is given back as it was: a pick after it reaches as far as before.
    assert.equal(view._raycaster.far, Infinity);

    // A unit on a lake's bed, fifteen tiles under the surface: from the author's angle the eye would be under water.
    const lake = big();
    lake.reactor3d.terrainWidth = 200;
    lake.reactor3d.terrain = new Array(201 * 201).fill(0);
    for (let z = 40; z <= 120; z++) for (let x = 40; x <= 120; x++) lake.reactor3d.terrain[z * 201 + x] = -15;
    lake.reactor3d.water = [{ x0: 40, y0: 40, x1: 119, y1: 119, level: 0 }];
    view = viewOf(lake);
    view.frameMap(lake);
    assert.equal(MapEditor3D.eventFeet(lake, eventOf(lake, 2)), -15);
    assert.equal(MapEditor3D.underWater(lake, MapEditor3D.eyeAt({ x: 76, y: -15, z: 59 }, 0, 34, reach, new THREE.Vector3())), true);
    view.frameEvent(2);
    assert.equal(view.view.target.y, -15);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 55]);
    assert.ok(view.camera.position.y > 0, `the eye is ${view.camera.position.y.toFixed(1)} tiles over the water`);
    assert.equal(MapEditor3D.underWater(lake, new THREE.Vector3(76.5, 2, 80)), false);
    assert.equal(MapEditor3D.underWater(lake, new THREE.Vector3(10.5, -1, 10.5)), false, 'dry land');
    assert.equal(MapEditor3D.underWater(lake, new THREE.Vector3(-4, -1, 80)), false, 'past the map\'s edge');
    // A view with no scene built frames the tile as it is.
    view = viewOf(big());
    view.mapScene = null;
    assert.equal(view.frameEvent(2), true);
    assert.deepEqual([view.view.yaw, view.view.pitch], [0, 34]);
});

//-----------------------------------------------------------------------------
// The view after it was switched off and on, through a real rebuild

test('3D: a rebuild frames a map once, keeps the author\'s view after that, and aims a camera made since', async () => {
    const map = mapOf();
    map.events = map.events.filter(event => !event || [4, 10].includes(event.id));
    const m = manager(map), view = viewOf(map, m);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    // The map's scene stands in for the runtime's: the events are built for real.
    const MapScene = Reactor3D.MapScene;
    Reactor3D.MapScene = class { constructor() { this._meshes = []; this._scene = new THREE.Scene(); } scene() { return this._scene; } setPass() {} destroy() {} };
    view.projectController.getTilemapManager = () => ({ currentMap: map, currentTileset: { id: 1, flags: [] } });
    Object.assign(view, {
        renderer: {}, mapScene: null, eventGroup: null, _cachedProjectPath: undefined,
        projectPath: () => PROJECT, beginModelUse() {}, sweepModelUse() {}, previewBudgetError: () => null, attachSidecar() {}, loadClassification() {},
        loadSheets: async () => ({}), loadParallaxes: async () => ({}), loadMaterials: async () => ({}),
        clearScene() { this.eventGroup = null; this.mapScene = null; }, applyAtmosphere() {}, buildGrid() {}, buildHoverCell() {}, buildProps() {}, drawPassage() {}
    });
    try {
        // The map opens: framed whole, its middle in the middle of the view.
        assert.equal(await view.rebuild(), true);
        assert.equal(view._framedMap, '5:16x12');
        assert.ok(aimAt(view, 8.5, 0, 6.5).off < 0.01);
        assert.equal(view.eventGroup.children.length > 0, true, 'its events are built');
        // The author turns and comes in; an edit builds the scene again and the view stays.
        Object.assign(view.view, { yaw: 30, pitch: 42, distance: 9, target: { x: 3, y: 0, z: 4 } });
        view.applyCamera();
        assert.equal(await view.rebuild(), true);
        assert.deepEqual([view.view.yaw, view.view.pitch, view.view.distance, view.view.target.x], [30, 42, 9, 3]);
        assert.ok(aimAt(view, 3.5, 0, 4.5).off < 0.01);
        // The view is switched off (another map is shown in 2D): its camera and renderer go, the map it framed is remembered.
        view.enabled = false; view.camera = null; view.renderer = null;
        assert.equal(await view.rebuild(), false);
        // Switched on again: a new renderer and a new camera, which looks down its own axis from the middle of the world.
        view.enabled = true; view.renderer = {}; view.camera = R.createCamera({ fov: 40 });
        assert.ok(aimAt(view, 3.5, 0, 4.5).off > 30);
        assert.equal(await view.rebuild(), true);
        const aim = aimAt(view, 3.5, 0, 4.5);
        assert.ok(aim.off < 0.01 && Math.abs(aim.far - 9) < 1e-6, `the new camera looks ${aim.off.toFixed(2)} degrees off where the view was left, ${aim.far.toFixed(2)} tiles away`);
        assert.deepEqual([view.view.yaw, view.view.pitch, view.view.distance], [30, 42, 9], 'and the view is the author\'s still');
        // A rebuild overtaken by a newer one builds nothing; the newer one aims the camera made before both.
        view.camera = R.createCamera({ fov: 40 });
        const first = view.rebuild(), second = view.rebuild();
        assert.deepEqual([await first, await second], [false, true]);
        assert.ok(aimAt(view, 3.5, 0, 4.5).off < 0.01);
        // A map of another size is framed anew.
        map.width = 20; map.reactor3d.elevation = new Array(20 * 12).fill(0);
        assert.equal(await view.rebuild(), true);
        assert.equal(view._framedMap, '5:20x12');
        assert.ok(aimAt(view, 10.5, 0, 6.5).off < 0.01);
    } finally { Reactor3D.MapScene = MapScene; }
});

//-----------------------------------------------------------------------------
// One picture for every unit of a look

test('3D: units of one look share one picture, whatever their size, and it is given back with the project', () => {
    const map = mapOf(), view = viewOf(map);
    global.document = fakeDocument();
    EventManager._lookArts.clear();
    EventManager._lookSources = null;
    RRMapElevation.setEventSize(map, 11, [2, 2]);
    for (const id of [4, 7, 11]) view._buildOneEvent(eventOf(map, id), {}, map, 1);
    const card = id => markerOf(view, id).material.map;
    assert.equal(card(4), card(11), 'two enemy figures, one of them twice the size');
    assert.notEqual(card(4), card(7), 'the bystander\'s figure is another color');
    assert.deepEqual([markerOf(view, 11).geometry.parameters.width, markerOf(view, 11).geometry.parameters.height], [2, 3]);
    assert.deepEqual([card(4).image.width, card(4).image.height], [MapEditor3D.UNIT_CARD_PIXELS, 384]);
    assert.equal(card(4).image.calls.filter(call => call[0] === 'drawImage').length, 1, 'drawn once for all of them');
    assert.notEqual(markerOf(view, 4).material, markerOf(view, 11).material, 'each unit has its own material: the selected one alone is lit');
    assert.equal(EventManager._lookArts.size, 2, 'one art for each side seen');
    const gone = [];
    for (const id of [4, 7]) card(id).addEventListener('dispose', () => { gone.push(id); });
    // A unit built again leaves the picture to the others.
    MapEditor3D.disposeOwnPictures(markerOf(view, 4));
    assert.deepEqual(gone, []);
    // A picture drawn for one thing alone goes with it.
    const label = markerOf(view, 4).userData.label;
    let labelGone = 0;
    label.material.map.addEventListener('dispose', () => { labelGone++; });
    MapEditor3D.disposeOwnPictures(label);
    assert.equal(labelGone, 1);
    // Another project is opened: the arts kept for this one are dropped and their pictures given back to the graphics card.
    const controller = global.reactor.projectController, project = controller.getCurrentProject;
    try {
        controller.getCurrentProject = () => ({ path: path.join(path.sep, 'projects', 'another') });
        EventManager.lookSources();
        assert.deepEqual(gone.sort(), [4, 7]);
        assert.equal(EventManager._lookArts.size, 0);
    } finally { controller.getCurrentProject = project; EventManager._lookSources = null; }
});
