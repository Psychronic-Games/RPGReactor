'use strict';
// Battle Setup's card (src/event/BattleSetup.js), run: it draws itself into a
// small document and is driven the way a user drives it, with clicks on its
// buttons, choices in its lists and keys, and its 3D preview stands in a
// real three.js scene. What is asserted is what the map, its Note and the
// editor around the card are left with. The card's DOM-free half is
// battle-setup.test.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// The game's 3D world, its physics and three.js, read before there is a document, as the editor's Node tools read them.
const V = require('../build-scripts/validate-battle.cjs');
const world = V.world();
const THREE = globalThis.THREE;
const R = world.Reactor3D;
const { createDocument } = require('./helpers/card-dom.cjs');
const { document, window: page } = createDocument();
globalThis.window = globalThis;
globalThis.document = document;
globalThis.addEventListener = page.addEventListener;
globalThis.removeEventListener = page.removeEventListener;
// The editor's map shortcuts are set on the window after every file has loaded: this one stands for them.
const B = require('../src/event/BattleSetup.js');
const C = require('../src/utils/BattleCheck.js');
const shortcuts = [];
page.addEventListener('keydown', event => { shortcuts.push(event.key); }, true);

const editorRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

//-----------------------------------------------------------------------------
// A small Database, maps, the map's event manager and the editor round the card.

const actors = [null, { id: 1, name: 'Ren', characterName: 'Actor1', characterIndex: 0 }, { id: 2, name: 'Mira', characterName: 'Actor1', characterIndex: 1 }];
const enemies = [null, { id: 1, name: 'Bat', battlerName: 'Bat', note: '' }, { id: 2, name: 'Slime', battlerName: '', note: '' }, { id: 3, name: '', battlerName: '' }, { id: 4, name: 'Tank', battlerName: 'Tank', note: '' }];
const system = { partyMembers: [1], optSideView: false };
// Tile 1 is open ground, tile 2 a wall nobody walks onto.
const tilesets = [null, { id: 1, flags: [0x10, 0, 0x0f] }];

const END = { code: 0, indent: 0, parameters: [] };
const pageOf = (more = {}) => Object.assign({ conditions: {}, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 }, priorityType: 1, through: false, trigger: 0, moveType: 0, list: [END] }, more);
const ev = (id, x, y, more = {}) => Object.assign({ id, name: 'EV' + String(id).padStart(3, '0'), note: '', x, y, pages: [pageOf()] }, more);
const unit = (id, x, y, recordId = 1, more = {}) => ev(id, x, y, Object.assign({ name: enemies[recordId].name, rrUnit: { team: 'enemy', record: 'enemy', id: recordId } }, more));

/** A 2D map of open ground, 20 by 15, with walls on the tiles named. */
function flat(events = [], more = {}, walls = []) {
    const width = 20, height = 15, data = new Array(width * height * 6).fill(0);
    for (let i = 0; i < width * height; i++) data[i] = 1;
    for (const [x, y] of walls) data[y * width + x] = 2;
    const list = [null];
    for (const event of events) list[event.id] = event;
    return Object.assign({ id: 1, width, height, tilesetId: 1, note: '', data, events: list }, more);
}

let nextPiece = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextPiece++, kind, x, y, z, rot: 0, material: '' }, more || {});
/**
 * A 3D map, 14 by 14, of level ground with: a deck two up over (2, 2); a
 * pitched roof whose slopes run up from (6..7, 5) and (6..7, 9) to a flat
 * ridge three up and three tiles deep over (6..7, 6..8), its middle row
 * beside no slope; a flat roof three up over (11..12, 3..4) that no slope
 * runs up to, with a roof's slope coming down onto it from (10, 3); a
 * roofing slab laid at a gentle tilt over (9..11, 11..13); a ramp laid on
 * the ground at (12, 8); and a deck three up over (2, 6) with a lower
 * wing's slope ending a tile under it at (2, 5).
 */
function village(events = []) {
    const list = [null], data = new Array(14 * 14 * 6).fill(0);
    for (const event of events) list[event.id] = event;
    for (let i = 0; i < 14 * 14; i++) data[i] = 1;
    return {
        id: 2, width: 14, height: 14, tilesetId: 1, note: '<3d>', data, events: list,
        reactor3d: {
            version: 1, mode: '3d', width: 14, height: 14, elevation: new Array(196).fill(0),
            pieces: [piece('floor', 2, 2, 2),
                piece('floor', 6, 6, 3), piece('floor', 7, 6, 3), piece('floor', 6, 7, 3), piece('floor', 7, 7, 3), piece('floor', 6, 8, 3), piece('floor', 7, 8, 3),
                piece('ramp', 6, 5, 2, { rot: 0 }), piece('ramp', 7, 5, 2, { rot: 0 }), piece('ramp', 6, 9, 2, { rot: 2 }), piece('ramp', 7, 9, 2, { rot: 2 }),
                piece('floor', 11, 3, 3), piece('floor', 12, 3, 3), piece('floor', 11, 4, 3), piece('floor', 12, 4, 3), piece('ramp', 10, 3, 3, { rot: 1 }),
                piece('box', 10, 12, 3.25, { size: [3, 0.15, 3], tilt: 12 }), piece('ramp', 12, 8, 0),
                piece('floor', 2, 6, 3), piece('ramp', 2, 5, 1, { rot: 0 })]
        }
    };
}

// EventManager's makers, verbatim, so the events are the ones the editor would make.
const managerSource = read('src/EventManager.js');
const method = name => { const start = managerSource.indexOf(`    ${name}(`); return managerSource.slice(start, managerSource.indexOf('\n    }\n', start) + 6); };
const Makers = new Function(`return class { constructor(map) { this.currentMap = map; }\n${method('getNextEventId')}\n${method('makeDefaultEventPage')}\n${method('makeQuickEvent')}\n}`)();
/** A map's event manager, as far as the card asks it: its history steps the events alone, as the editor's does, and a redraw says the events changed. */
class Manager extends Makers {
    constructor(map) { super(map); Object.assign(this, { eventMode: true, saved: 0, drawn: 0, selectedEvent: null, undoStack: [], redoStack: [], shown: [], projectController: { getCurrentProject: () => null } }); }
    getEventAt(x, y) { return (this.currentMap.events || []).find(event => event && event.x === x && event.y === y) || null; }
    snapshot() { return JSON.parse(JSON.stringify(this.currentMap.events || [])); }
    saveState() { this.saved++; this.undoStack.push(this.snapshot()); this.redoStack = []; }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    step(from, to) {
        if (!from.length) return;
        to.push(this.snapshot());
        this.currentMap.events = from.pop();
        if (this.selectedEvent) this.selectedEvent = this.currentMap.events.find(event => event && event.id === this.selectedEvent.id) || null;
        this.renderEvents();
    }
    undo() { this.step(this.undoStack, this.redoStack); }
    redo() { this.step(this.redoStack, this.undoStack); }
    renderEvents() { this.drawn++; document.dispatchEvent({ type: 'rr-events-changed' }); }
    selectEvent(event) { this.selectedEvent = event; }
    deleteEvent(event) { this.saveState(); this.currentMap.events[event.id] = null; if (this.selectedEvent === event) this.selectedEvent = null; this.renderEvents(); }
    centerOnEvent(event) { this.shown.push(event.id); }
    _setEventModels() {}
    _setEventPlacement() {}
}

/** The 2D view as far as the card moves it. */
function tilemapOf(scale) {
    const moves = [];
    return { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: { scale: { x: scale } }, moves, viewportSize: () => ({ width: 800, height: 600 }), minimumZoomScale: () => 0.1,
        setViewportTransform(x, y, zoom) { moves.push([x, y, zoom]); this.container.scale.x = zoom; } };
}

// The editor's page round the card: the toolbar's button, the map's side dock, the Database's list.
document.body.innerHTML = '<button class="tool-button" data-action="battle-setup" aria-pressed="false"></button><div id="workspace"><div id="canvas-container"></div><aside id="map-side-dock"></aside></div>'
    + '<div id="database-viewer"><button class="database-add-btn"></button><div id="database-list"><div class="database-list-item" data-entry-id="1"></div><div class="database-list-item" data-entry-id="2"></div></div></div>';
const dock = document.getElementById('map-side-dock');
const toolbar = document.querySelector('.tool-button');
const clicked = [];
document.querySelector('.database-add-btn').addEventListener('click', () => clicked.push('add'));
for (const item of document.querySelectorAll('.database-list-item')) item.addEventListener('click', () => clicked.push('record ' + item.dataset.entryId));

/**
 * The card open on a map: `run(card)` with `card.manager`, `card.app`
 * (what the editor was asked for) and `card.$`/`card.$$` to find the
 * card's parts. `more`: `enemies` (another list of them), `globals`,
 * `shut` (do not open it).
 */
async function withCard(map, more, run) {
    const options = more || {}, manager = new Manager(map), state = B._state, kept = {};
    const asked = { pages: [], saves: 0, plays: [], battles: 0 };
    const app = {
        asked, eventManager: manager, databaseManager: { data: { actors, enemies: options.enemies || enemies, tilesets, system }, getSystem: () => system },
        dockMapPanel(panel) { dock.appendChild(panel); return true; },
        undockMapPanel(panel) { panel.remove(); },
        openDatabase(name) { asked.pages.push(name); },
        projectController: { saveAll: async () => { asked.saves++; return true; } },
        playtestManager: { playtestAt(home, at, how) { asked.plays.push({ home, at, how }); return true; } }
    };
    const globals = Object.assign({ reactor: app, DatabaseSystem1Editor: { openBattles() { asked.battles++; } } }, options.globals || {});
    for (const key of Object.keys(globals)) { kept[key] = Object.getOwnPropertyDescriptor(globalThis, key); globalThis[key] = globals[key]; }
    const card = { manager, app, asked, state, $: selector => state.panel.querySelector(selector), $$: selector => state.panel.querySelectorAll(selector) };
    Object.assign(state, { manager: null, map: null, brush: null, pick: null, verdict: null, occupancy: null, report: null, props: null, propsKey: '', team: 'enemy', search: '', more: false, started: null, tilesKey: '', ghost3D: null, ghostKey3D: '', lastHover: null });
    state.bound.clear(); state.bodies.clear(); state.arts.clear(); state.talls.clear(); state.roofs.clear();
    shortcuts.length = 0; clicked.length = 0;
    try {
        if (!options.shut) assert.equal(B.open(manager), true);
        return await run(card);
    } finally {
        B.close();
        // Pictures still being made for this card are done before the next one opens.
        await Promise.resolve(state.painting).catch(() => {});
        await Promise.resolve(state.drawing).catch(() => {});
        Object.assign(state, { manager: null, map: null, started: null, ghost3D: null, ghostKey3D: '', lastHover: null });
        for (const key of Object.keys(globals)) { if (kept[key]) Object.defineProperty(globalThis, key, kept[key]); else delete globalThis[key]; }
    }
}

const tileOf = (card, id) => card.$$('.rr-battle-setup-tile').find(button => button.dataset.id === String(id));
const sentence = card => card.$('.rr-battle-setup-sentence').textContent.replace(/\s+/g, ' ').trim();
const lineOf = (card, words) => card.$$('.rr-battle-setup-line').find(line => line.textContent.includes(words));

//-----------------------------------------------------------------------------
// The card and its lists.

test('the card opens docked with its button pressed, and its lists write the map\'s two tags', async () => {
    const map = flat([unit(1, 5, 5)], { note: 'A quiet road.' });
    await withCard(map, null, card => {
        assert.equal(card.state.panel.parentNode, dock, 'in the map\'s side dock');
        assert.deepEqual([B.isOpen(), toolbar.classList.contains('active'), toolbar.getAttribute('aria-pressed')], [true, true, 'true']);
        assert.equal(card.$('.rr-battle-setup-title').textContent, 'Battle Setup');
        // Battle mode: a named mode writes the tag and says so; the game's mode takes it out.
        assert.deepEqual(card.$$('.rr-battle-setup-mode option').map(option => option.value), ['', 'classic', 'tactical', 'action'], 'no First Person on a 2D map');
        card.$('.rr-battle-setup-mode').choose('action');
        assert.equal(map.note, 'A quiet road.\n<battle mode: action>');
        assert.equal(card.$('.rr-battle-setup-mode').getAttribute('title'), 'Action: you walk and fight in real time. · this map only', 'what the mode plays like is the list\'s tooltip, not a line of the card');
        assert.equal(card.$('.rr-battle-setup-plays'), null);
        assert.equal(card.$('.rr-battle-setup-mode').value, 'action', 'the list shows the map\'s own mode');
        card.$('.rr-battle-setup-mode').choose('tactical');
        assert.equal(map.note, 'A quiet road.\n<battle mode: tactical>');
        card.$('.rr-battle-setup-mode').choose('');
        assert.equal(map.note, 'A quiet road.');
        assert.equal(card.$('.rr-battle-setup-mode').getAttribute('title'), 'Classic: the separate battle screen. Walk up to an enemy placed here and it opens.');
        // Starts: each choice is the tag written in full.
        assert.equal(card.$('.rr-battle-setup-starts').value, 'near');
        card.$('.rr-battle-setup-starts').choose('event');
        assert.equal(map.note, 'A quiet road.\n<battle trigger: 0>');
        assert.equal(sentence(card), 'Enemies: 1. No event starts a battle yet: add Start Battle on Map to one.');
        card.$('.rr-battle-setup-starts').choose('open');
        assert.equal(map.note, 'A quiet road.\n<battle trigger: open>');
        assert.equal(card.$('#rr-battle-setup-distance'), null, 'the distance shows with "comes near" alone');
        card.$('.rr-battle-setup-starts').choose('near');
        assert.equal(map.note, 'A quiet road.\n<battle trigger: 6>');
        // The distance: a whole number from 1 to 50, whatever is typed.
        const typed = text => { card.$('#rr-battle-setup-distance').choose(text); return map.note; };
        assert.equal(typed('3'), 'A quiet road.\n<battle trigger: 3>');
        assert.equal(card.$$('.rr-battle-setup-starts option')[0].textContent, 'When the party comes near (3)');
        assert.equal(typed('99'), 'A quiet road.\n<battle trigger: 50>');
        assert.equal(typed('-3'), 'A quiet road.\n<battle trigger: 1>', 'never "an event says so" by a slip of the key');
        assert.equal(typed('7.9'), 'A quiet road.\n<battle trigger: 7>');
        assert.equal(typed('soon'), 'A quiet road.\n<battle trigger: 6>');
        // Nothing is folded away: the distance stands under Starts, on the same grid, and the game's mode is the list's first choice.
        assert.equal(card.$('.rr-battle-setup-more'), null);
        assert.equal(card.$('#rr-battle-setup-distance').parentNode.parentNode, card.$('.rr-battle-setup-starts').parentNode);
        assert.equal(card.$$('.rr-battle-setup-mode option')[0].textContent, 'The game\'s mode (Classic)');
        assert.equal(card.$('.rr-battle-setup-game'), null);
    });
});

test('a tile clicked is in hand, clicked again or Esc puts it down; Place as changes the side and what is offered', async () => {
    await withCard(flat(), null, card => {
        assert.deepEqual(card.$$('.rr-battle-setup-tile').map(button => button.textContent), ['Bat', 'Slime', 'Tank'], 'records with no name are left out');
        assert.equal(card.$('.rr-battle-setup-search'), null, 'no search box for a few records');
        assert.equal(card.$('[data-part="hint"]').textContent, 'Click an enemy, then click the map.');
        tileOf(card, 2).click();
        assert.deepEqual(card.state.brush, { team: 'enemy', record: 'enemy', id: 2, direction: 2 });
        assert.deepEqual([tileOf(card, 2).getAttribute('aria-pressed'), tileOf(card, 1).getAttribute('aria-pressed'), B.holding()], ['true', 'false', true]);
        assert.equal(card.$('[data-part="hint"]').textContent, 'Click the map to place Slime. R turns it, right-click removes one, Esc stops.');
        // A click on the map stands one; the unit stays in hand.
        assert.equal(B.placeAt(card.manager, 4, 4), true);
        assert.deepEqual([card.manager.currentMap.events[1].name, card.state.brush.id], ['Slime', 2]);
        // The same tile again puts it down; another tile takes its place in the hand.
        tileOf(card, 2).click();
        assert.deepEqual([card.state.brush, B.holding(), tileOf(card, 2).getAttribute('aria-pressed')], [null, false, 'false']);
        tileOf(card, 2).click();
        tileOf(card, 1).click();
        assert.equal(card.state.brush.id, 1);
        // Esc puts it down; R turned it first.
        document.body.key('r');
        assert.equal(card.state.brush.direction, 4);
        document.body.key('R', { shiftKey: true });
        assert.equal(card.state.brush.direction, 2);
        document.body.key('Escape');
        assert.deepEqual([card.state.brush, card.$('[data-part="hint"]').textContent], [null, 'Click an enemy, then click the map.']);
        // Place as: the side placed, Actors then Enemies under headings, nothing left in hand.
        tileOf(card, 1).click();
        card.$('.rr-battle-setup-side').choose('ally');
        assert.deepEqual([card.state.team, card.state.brush], ['ally', null]);
        assert.deepEqual(card.$$('.rr-battle-setup-group').map(group => group.textContent), ['Actors', 'Enemies']);
        assert.deepEqual(card.$$('.rr-battle-setup-tile').map(button => button.dataset.record + ' ' + button.textContent), ['actor Ren', 'actor Mira', 'enemy Bat', 'enemy Slime', 'enemy Tank']);
        assert.equal(card.$('[data-part="hint"]').textContent, 'Click one above, then click the map.');
        card.$$('.rr-battle-setup-tile')[0].click();
        assert.equal(B.placeAt(card.manager, 8, 8), true);
        assert.deepEqual(card.manager.currentMap.events[2].rrUnit, { team: 'ally', record: 'actor', id: 1 });
        card.$('.rr-battle-setup-side').choose('neutral');
        tileOf(card, 4).click();
        assert.equal(B.placeAt(card.manager, 9, 9), true);
        assert.deepEqual(card.manager.currentMap.events[3].rrUnit, { team: 'neutral', record: 'enemy', id: 4 });
    });
});

test('the tiles get a search box above 12 records; an empty Database says so, with a button to a new enemy', async () => {
    const many = [null].concat(Array.from({ length: 13 }, (unused, at) => ({ id: at + 1, name: at === 6 ? 'Slime King' : 'Raider ' + (at + 1), battlerName: 'Bat', note: '' })));
    await withCard(flat(), { enemies: many }, card => {
        assert.equal(card.$$('.rr-battle-setup-tile').length, 13);
        card.$('.rr-battle-setup-search').choose('slime', 'input');
        assert.deepEqual(card.$$('.rr-battle-setup-tile').map(button => button.textContent), ['Slime King']);
        assert.equal(document.activeElement, card.$('.rr-battle-setup-search'), 'the keyboard stays in the box while its tiles are drawn again');
        card.$('.rr-battle-setup-search').choose('zz', 'input');
        assert.deepEqual([card.$$('.rr-battle-setup-tile').length, card.$('.rr-battle-setup-empty').textContent], [0, 'Nothing matches.']);
        card.$('.rr-battle-setup-search').choose('12', 'input');
        assert.deepEqual(card.$$('.rr-battle-setup-tile').map(button => button.textContent), ['Raider 12'], 'by its number too');
    });
    await withCard(flat(), { enemies: [null] }, async card => {
        assert.equal(card.$('.rr-battle-setup-empty').textContent, 'No enemies in the Database yet.New enemy…');
        assert.equal(card.$('.rr-battle-setup-play').disabled, true);
        card.$('.rr-battle-setup-new').click();
        await tick(90);
        assert.deepEqual([card.asked.pages, clicked], [['enemies'], ['add']], 'Database > Enemies, on a new record');
    });
});

test('the selected unit: its number is never the part cut short, Facing turns it, R turns it, Remove takes it off', async () => {
    const map = flat([unit(1, 5, 5), unit(2, 7, 5), ev(3, 9, 9, { name: 'Door' })]);
    await withCard(map, null, card => {
        assert.equal(card.$('[data-part="unit"]').hidden, true, 'no unit selected: no row');
        card.manager.selectEvent(map.events[2]);
        B.sync(card.manager);
        const row = card.$('[data-part="unit"]');
        assert.equal(row.hidden, false);
        assert.deepEqual([card.$('.rr-battle-setup-unit-text').textContent, card.$('.rr-battle-setup-unit-id').textContent], ['Bat', '(002)']);
        assert.equal(card.$('.rr-battle-setup-unit-id').parentNode, card.$('.rr-battle-setup-unit-name'));
        assert.match(read('css/styles.css'), /\.rr-battle-setup-unit-text \{ flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}\n\.rr-battle-setup-unit-id \{ flex: 0 0 auto; white-space: nowrap; \}/);
        assert.deepEqual(card.$$('[data-face]').map(button => button.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false'], 'left, up, down, right: it faces down');
        card.$('[data-face="8"]').click();
        assert.deepEqual([B.facingOf(map.events[2]), card.manager.saved, card.$('[data-face="8"]').getAttribute('aria-pressed')], [8, 1, 'true']);
        // R, with nothing in hand, turns the selected unit a quarter; Shift+R the other way. One undo step each.
        document.body.key('r');
        assert.deepEqual([B.facingOf(map.events[2]), card.manager.saved], [6, 2]);
        document.body.key('R', { shiftKey: true });
        assert.deepEqual([B.facingOf(map.events[2]), card.manager.saved], [8, 3]);
        // A field has its own keys: an r typed into one turns nothing.
        card.$('.rr-battle-setup-mode').key('r');
        assert.equal(B.facingOf(map.events[2]), 8);
        // Remove: off the map, as one undo step, and the row goes.
        card.$('.rr-battle-setup-remove').click();
        assert.deepEqual([map.events[2], card.manager.saved, card.$('[data-part="unit"]').hidden], [null, 4, true]);
        assert.equal(sentence(card), 'Enemies: 1. Walk within 6 tiles of one and the battle starts.');
        // An event that is no unit has no row.
        card.manager.selectEvent(map.events[3]);
        B.sync(card.manager);
        assert.equal(card.$('[data-part="unit"]').hidden, true);
    });
});

//-----------------------------------------------------------------------------
// The one sentence, its lines and Play this battle.

test('the sentence: its count shows every unit, each line\'s button goes to the fix, and Play is off while nothing would start', async () => {
    // Slime has no picture; unit 3 stands on a wall.
    const map = flat([unit(1, 3, 3), unit(2, 16, 11, 2), unit(3, 9, 5)], {}, [[9, 5]]);
    await withCard(map, null, async card => {
        card.manager.tilemapManager = tilemapOf(1);
        assert.equal(sentence(card), 'Enemies: 3. Walk within 6 tiles of one and the battle starts.');
        assert.equal(card.$('.rr-battle-setup-play').disabled, false);
        // The count is a button: every unit comes into view.
        card.$('.rr-battle-setup-count').click();
        assert.equal(card.manager.tilemapManager.moves.length, 1);
        const zoom = card.manager.tilemapManager.moves[0][2];
        assert.ok(zoom <= 1 && 16 * 48 * zoom <= 800 && 11 * 48 * zoom <= 600, 'from (3, 3) to (16, 11), all in the view');
        // A unit where nothing can stand: [Show] selects it and brings it into view.
        const standing = lineOf(card, 'stands where nothing can stand');
        assert.equal(standing.textContent, 'Bat (003) stands where nothing can stand. Nobody can walk onto this tile.Show');
        standing.querySelector('.rr-battle-setup-fix').click();
        assert.deepEqual([card.manager.selectedEvent, card.manager.shown], [map.events[3], [3]]);
        assert.equal(card.$('.rr-battle-setup-unit-id').textContent, '(003)', 'and the card shows it as the selected unit');
        // A record with no picture: [Give it one] opens its record in the Database.
        const plain = lineOf(card, 'has no picture');
        assert.equal(plain.textContent, 'Slime has no picture: it stands as a plain figure.Give it one');
        plain.querySelector('.rr-battle-setup-fix').click();
        await tick(90);
        assert.deepEqual([card.asked.pages, clicked], [['enemies'], ['record 2']]);
        // Nothing would start a battle: the sentence is amber and Play is off.
        card.$('.rr-battle-setup-starts').choose('event');
        assert.equal(sentence(card), 'Enemies: 3. No event starts a battle yet: add Start Battle on Map to one.');
        assert.deepEqual([card.$('.rr-battle-setup-sentence').classList.contains('is-warn'), card.$('.rr-battle-setup-play').disabled], [true, true]);
        assert.equal(card.$('.rr-battle-setup-play').click(), null, 'a disabled button is not pressed');
        assert.equal(card.asked.plays.length, 0);
    });
    // No enemy at all: the next step, and nothing to play.
    await withCard(flat(), null, card => {
        assert.equal(sentence(card), 'No enemies yet. Click one above, then click the map.');
        assert.deepEqual([card.$('.rr-battle-setup-count'), card.$('.rr-battle-setup-play').disabled], [null, true]);
    });
    // Nobody in the party: the line's button goes to the Database's System page.
    const lonely = Object.assign({}, system, { partyMembers: [] });
    await withCard(flat([unit(1, 3, 3)]), null, card => {
        card.app.databaseManager.getSystem = () => lonely;
        B.sync(card.manager);
        lineOf(card, 'Nobody is in the party.').querySelector('.rr-battle-setup-fix').click();
        assert.deepEqual(card.asked.pages, ['system1']);
    });
});

test('Play this battle saves, then opens the game by the enemy the author last worked on', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-card-play-'));
    try {
        const map = flat([unit(1, 3, 3), unit(2, 16, 11)]);
        await withCard(map, null, async card => {
            card.manager.projectController.getCurrentProject = () => ({ path: home });
            let order = '';
            card.app.projectController.saveAll = async () => { order += 'save '; return true; };
            card.app.playtestManager.playtestAt = (where, at, how) => { order += 'play'; card.asked.plays.push({ where, at, how }); return true; };
            // The last thing worked on is the far unit: the party is put by that one, four tiles off, facing it.
            card.manager.selectEvent(map.events[2]);
            B.sync(card.manager);
            card.$('.rr-battle-setup-play').click();
            await tick(20);
            assert.equal(order, 'save play');
            assert.deepEqual(card.asked.plays, [{ where: home, at: { mapId: 1, x: 12, y: 11, direction: 6 }, how: { playat: true, mode: 'classic' } }]);
            card.manager.selectEvent(map.events[1]);
            card.$('.rr-battle-setup-play').click();
            await tick(20);
            assert.deepEqual(card.asked.plays[1].at, { mapId: 1, x: 3, y: 7, direction: 8 });
            // A project that could not be saved is not played.
            card.app.projectController.saveAll = async () => false;
            card.$('.rr-battle-setup-play').click();
            await tick(20);
            assert.equal(card.asked.plays.length, 2);
        });
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

//-----------------------------------------------------------------------------
// What follows the map.

test('closing shows units as plain events again and releases the button; the card reads another map, and Event mode ending closes it', async () => {
    const map = flat([unit(1, 5, 5)]), other = flat([], { id: 2, note: '<battle trigger: open>\n<battle mode: tactical>' });
    await withCard(map, null, card => {
        assert.equal(B.previewPage(map.events[1]), 0, 'open: a unit is drawn as what it is');
        assert.equal(B.teamTone(map.events[1]), 0xff5a4a);
        const drawn = card.manager.drawn;
        tileOf(card, 1).click();
        card.$('.rr-battle-setup-close').click();
        assert.deepEqual([B.isOpen(), card.state.panel.isConnected, toolbar.classList.contains('active'), toolbar.getAttribute('aria-pressed')], [false, false, false, 'false']);
        assert.deepEqual([B.previewPage(map.events[1]), B.teamTone(map.events[1]), B.holding()], [null, null, false], 'shut: plain events, and nothing in hand');
        assert.equal(card.manager.drawn, drawn + 1, 'the events are drawn again, once');
        assert.equal(B.placeAt(card.manager, 8, 8), false, 'a click on the map is the map\'s again');
        // The button opens it again; a second press closes it.
        assert.equal(B.toggle(card.manager), true);
        assert.equal(card.state.panel.parentNode, dock);
        assert.equal(B.toggle(card.manager), false);
        assert.equal(B.toggle(card.manager), true);
        // Another map opened in the editor: the card is that map's.
        card.manager.currentMap = other;
        card.manager.renderEvents();
        assert.equal(sentence(card), 'No enemies yet. Click one above, then click the map.');
        assert.deepEqual([card.$('.rr-battle-setup-starts').value, card.$('.rr-battle-setup-mode').value], ['open', 'tactical'], 'its start and its mode');
        // Leaving Event mode closes it.
        card.manager.eventMode = false;
        B.sync(card.manager);
        assert.equal(B.isOpen(), false);
        card.manager.eventMode = true;
    });
});

test('undoing the first unit takes the start it wrote out of the Note; doing it again writes it again; a unit taken off by hand keeps it', async () => {
    const map = flat([], { note: 'A quiet road.' });
    await withCard(map, null, card => {
        tileOf(card, 1).click();
        assert.equal(B.placeAt(card.manager, 5, 5), true);
        assert.equal(map.note, 'A quiet road.\n<battle trigger: 6>');
        card.manager.undo();
        assert.deepEqual([map.events.filter(Boolean).length, map.note], [0, 'A quiet road.'], 'the map is as it was');
        assert.equal(sentence(card), 'No enemies yet. Click one above, then click the map.');
        card.manager.redo();
        assert.deepEqual([map.events.filter(Boolean).length, map.note], [1, 'A quiet road.\n<battle trigger: 6>']);
        card.manager.undo();
        assert.equal(map.note, 'A quiet road.');
        // Placed again after the undo: written again, as for any first unit.
        assert.equal(B.placeAt(card.manager, 6, 6), true);
        assert.equal(map.note, 'A quiet road.\n<battle trigger: 6>');
        // A second unit undone leaves the Note alone.
        assert.equal(B.placeAt(card.manager, 7, 7), true);
        card.manager.undo();
        assert.deepEqual([map.events.filter(Boolean).length, map.note], [1, 'A quiet road.\n<battle trigger: 6>']);
        // The first unit taken off by hand: the start chosen for the map stays.
        card.manager.deleteEvent(map.events.find(Boolean));
        assert.deepEqual([map.events.filter(Boolean).length, map.note], [0, 'A quiet road.\n<battle trigger: 6>']);
    });
    // A start chosen on the card after the first unit is the author's: the undo of the unit leaves it.
    const chosen = flat([], { note: '' });
    await withCard(chosen, null, card => {
        tileOf(card, 1).click();
        B.placeAt(card.manager, 5, 5);
        card.$('.rr-battle-setup-starts').choose('open');
        card.manager.undo();
        assert.equal(chosen.note, '<battle trigger: open>');
    });
    // The sidecar's distance, moved into the Note by the first unit, is back in the sidecar after the undo; and the undo is followed with the card shut.
    const sided = flat([], { note: '', reactor3d: { battle: { trigger: 9 } } });
    await withCard(sided, null, card => {
        tileOf(card, 1).click();
        B.placeAt(card.manager, 5, 5);
        assert.deepEqual([sided.note, sided.reactor3d.battle], ['<battle trigger: 9>', undefined]);
        B.close();
        card.manager.undo();
        assert.deepEqual([sided.note, sided.reactor3d.battle], ['', { trigger: 9 }]);
    });
});

//-----------------------------------------------------------------------------
// The keyboard.

test('a key pressed with the keyboard on the card is the card\'s, not the map\'s', async () => {
    await withCard(flat([unit(1, 5, 5)]), null, async card => {
        const button = tileOf(card, 2);
        // Enter on a button of the card presses it, and the map's shortcuts never hear of it.
        button.focus();
        button.key('Enter');
        assert.deepEqual([shortcuts, card.state.brush && card.state.brush.id], [[], 2]);
        // The arrows are not the map's either.
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) tileOf(card, 2).key(key);
        assert.deepEqual(shortcuts, []);
        // A field and a list are left to the map's shortcuts, which pass a field by themselves; Delete and the keys held with Ctrl stay the map's.
        card.$('.rr-battle-setup-mode').key('ArrowDown');
        tileOf(card, 2).key('Delete');
        tileOf(card, 2).key('z', { ctrlKey: true });
        assert.deepEqual(shortcuts.splice(0), ['ArrowDown', 'Delete', 'z']);
        // On the map the keys are the map's.
        document.body.key('ArrowDown');
        document.body.key('Enter');
        assert.deepEqual(shortcuts.splice(0), ['ArrowDown', 'Enter']);
        // The card shut: nothing of it is in the way.
        B.close();
        document.body.key('Enter');
        toolbar.key('ArrowLeft');
        assert.deepEqual(shortcuts.splice(0), ['Enter', 'ArrowLeft']);
    });
    // This listener is the window's first because the card's file loads before the editor sets its shortcuts.
    const html = read('index.html');
    assert.ok(html.indexOf('src/event/BattleSetup.js') > 0 && html.indexOf('src/event/BattleSetup.js') < html.indexOf('src/UIManager.js') && html.indexOf('src/UIManager.js') < html.indexOf('src/main.js'));
    assert.match(read('src/UIManager.js'), /setupKeyboardShortcuts\(\) \{[\s\S]{0,400}?window\.addEventListener\('keydown', \(e\) => \{/);
});

test('a list of the card that opens gives the keyboard to its own field, so the arrows choose in the list', async () => {
    await withCard(flat([unit(1, 5, 5)]), null, async card => {
        // The editor dresses every list: the field inside a wrapper, with a trigger beside it; its list is a popup on the page that takes the keyboard.
        const dress = field => { const wrapper = document.createElement('div'), trigger = document.createElement('div'); trigger.className = 'rr-shim-trigger'; field.parentNode.appendChild(wrapper); wrapper.appendChild(field); wrapper.appendChild(trigger); return trigger; };
        const popupFor = () => { const popup = document.createElement('div'); popup.className = 'rr-shim-popup'; document.body.appendChild(popup); popup.focus(); return popup; };
        // Opened with the mouse.
        const starts = card.$('.rr-battle-setup-starts'), trigger = dress(starts);
        trigger.click();
        const popup = popupFor();
        assert.equal(document.activeElement, popup);
        await tick(5);
        assert.equal(document.activeElement, starts, 'the keyboard is on the list\'s field');
        // A letter typed while the list hangs open is not a choice made unseen; the arrows and Enter are the list's.
        assert.equal(starts.key('a').defaultPrevented, true);
        assert.equal(starts.key('ArrowDown').defaultPrevented, false);
        assert.equal(starts.key('Enter').defaultPrevented, false);
        popup.remove();
        assert.equal(starts.key('a').defaultPrevented, false, 'the list shut: the field is an ordinary field');
        // Opened with the keyboard: the field had it, the popup took it, the field has it back.
        const mode = card.$('.rr-battle-setup-mode');
        dress(mode);
        mode.focus();
        const second = popupFor();
        await tick(5);
        assert.equal(document.activeElement, mode);
        second.remove();
        // A list that is not the card's (the keyboard was elsewhere, and no list of the card was just clicked) keeps the keyboard where its own code put it.
        toolbar.focus();
        await tick(600);
        const stray = popupFor();
        await tick(5);
        assert.equal(document.activeElement, stray);
        stray.remove();
    });
});

//-----------------------------------------------------------------------------
// The preview in the 3D view.

/** The 3D view as far as the card asks it: a real scene, a camera straight down over (`cx`, `cy`) with a tile `pixels` wide on a 1000-pixel canvas, and what was done to it. */
function view3D(manager, cx, cy, pixels) {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000), scene = new THREE.Scene();
    const editor = {
        camera, scene, renders: 0, propGroup: new THREE.Group(),
        canvas: { title: '', getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
        view: { target: new THREE.Vector3(cx, 0, cy), distance: 500 / pixels },
        mapScene: { scene: () => scene }, currentMap: () => manager.currentMap, eventManager: () => manager,
        isEnabled: () => true, requestRender() { editor.renders++; }, refreshEvents() {},
        // The view's distance is half the width it shows, in tiles.
        applyCamera() {
            const half = editor.view.distance, at = editor.view.target;
            Object.assign(camera, { left: -half, right: half, top: half, bottom: -half });
            camera.position.set(at.x, 100, at.z);
            camera.up.set(0, 0, -1);
            camera.lookAt(at.x, 0, at.z);
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld(true);
        },
        /** Where a point of the world is on the screen. */
        screen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * 1000, y: (1 - v.y) / 2 * 1000 }; }
    };
    editor.applyCamera();
    manager.projectController.mapEditor3D = editor;
    return editor;
}

/** The pointer over a tile's surface at a height: what the 3D view tells the card. */
const pointAt = (editor, x, y, height, level) => [{ x, y, height, level }, null, editor.screen(x + 0.5, Number.isFinite(level) ? level : height, y + 0.5)];

/** The models of the editor as far as the preview asks: one model three tiles tall, whose material carries a variant's look in its program. */
function modelsOf() {
    const made = [], template = new THREE.Group();
    return {
        made, template,
        templateFor: async () => template,
        texturesDecoded: () => true,
        thumbnail: async () => null,
        instance(from, spec, direction) {
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            material.onBeforeCompile = function look() {};
            material.customProgramCacheKey = () => 'look';
            material.userData.rrLook = { a: { x: 1 }, b: { x: 0.5 } };
            const geometry = new THREE.BoxGeometry(1, 3, 1);
            geometry.translate(0, 1.5, 0);
            // The box the file states for it is a sliver, as a rigged model's can be: its vertices say three tiles.
            geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-0.01, 0, -0.01), new THREE.Vector3(0.01, 0.02, 0.01));
            const model = new THREE.Group();
            model.add(new THREE.Mesh(geometry, material));
            made.push({ model, material, spec, direction });
            return model;
        }
    };
}
const TANK_SPEC = { name: 'Vehicles/Tank', ext: '.glb' }, JOLT = { name: 'Actors/Jolt', ext: '.glb', file: 'Jolt' };
const bindings = { get: (home, section, id) => (section === 'enemies' && id === 4 ? TANK_SPEC : null) };
const inWorld = more => ({ globals: Object.assign({ RRDatabase3DBindings: bindings }, more) });
const ghostOf = () => B._state.ghost3D;
const modelIn = ghost => ghost.children.find(child => child.isGroup);

test('a preview never under 28 pixels tall is life size wherever it already shows that tall', () => {
    assert.equal(B.PREVIEW_MIN, 28);
    assert.equal(B.previewGrow(25, 3), 1, 'three tiles tall at 25 pixels a tile: 75 pixels');
    assert.equal(B.previewGrow(48, 3), 1);
    assert.equal(B.previewGrow(48, 0.5), 28 / 24);
    assert.equal(B.previewGrow(7, 3), 28 / 21);
    assert.equal(B.previewGrow(7, 4), 1);
    assert.equal(B.previewGrow(0, 3), 1, 'nothing measured: nothing changed');
});

test('the 2D preview stands on the tile under the pointer, never under 28 pixels tall, gray where a click would do nothing', async () => {
    // The 2D view's drawing, as far as the preview asks it.
    class Container {
        constructor() { Object.assign(this, { children: [], parent: null, x: 0, y: 0, visible: true, destroyed: false, scale: { x: 1, y: 1, set(value) { this.x = value; this.y = value; } } }); }
        addChild(child) { child.parent = this; this.children.push(child); return child; }
        removeChild(child) { this.children = this.children.filter(each => each !== child); child.parent = null; }
        destroy() { this.destroyed = true; if (this.parent) this.parent.removeChild(this); }
    }
    class Graphics extends Container { constructor() { super(); this.fills = []; } fill(style) { this.fills.push(style.color); return this; } }
    for (const shape of ['rect', 'ellipse', 'stroke', 'moveTo', 'lineTo', 'poly']) Graphics.prototype[shape] = function() { return this; };
    class Sprite extends Container { constructor() { super(); this.anchor = { set() {} }; } }
    const PIXI = { Container, Graphics, Sprite, Texture: { from: canvas => ({ canvas }) } };
    const map = flat([], {}, [[9, 5]]);
    await withCard(map, { globals: { PIXI } }, async card => {
        const layer = new Container(), tilemap = Object.assign(tilemapOf(1), { container: layer, renders: 0, requestRender() { tilemap.renders++; } });
        card.manager.tilemapManager = tilemap;
        tileOf(card, 1).click();
        B.hover2D(card.manager, { x: 4, y: 6 });
        const ghost = card.state.ghost2D;
        assert.deepEqual([ghost.parent, ghost.visible, ghost.x, ghost.y, ghost.scale.x], [layer, true, 4 * 48, 6 * 48, 1], 'at a zoom one works at: life size, on its tile');
        assert.equal(ghost.children[0].fills[0], 0xff5a4a, 'on a ring in its side\'s color');
        await tick(5);
        assert.equal(ghost.children.length, 2, 'its look stands on the ring');
        // From far off, a tile six pixels wide: enlarged about its feet until it is 28 pixels tall.
        layer.scale.x = 0.125;
        B.hover2D(card.manager, { x: 4, y: 6 });
        const tall = card.state.ghostTall2D, grow = 28 / (tall * 0.125);
        assert.ok(tall > 0 && Math.abs(ghost.scale.x - grow) < 1e-9, `${ghost.scale.x} for a look ${tall} pixels tall`);
        assert.deepEqual([ghost.x, ghost.y], [4 * 48 - (grow - 1) * 24, 6 * 48 - (grow - 1) * 48]);
        // A tile nobody walks onto: gray, and the hint says why.
        layer.scale.x = 1;
        B.hover2D(card.manager, { x: 9, y: 5 });
        assert.notEqual(card.state.ghost2D, ghost, 'drawn again');
        assert.deepEqual([card.state.ghost2D.children[0].fills[0], card.state.ghost2D.scale.x, card.$('[data-part="hint"]').textContent], [0x9a9a9a, 1, 'Nobody can walk onto this tile.']);
        // The pointer off the map: no preview.
        B.hover2D(card.manager, null);
        assert.equal(card.state.ghost2D.visible, false);
    });
});

test('the 3D preview is the record\'s own look, faint, life size, on the surface the pointer met', async () => {
    const models = modelsOf(), map = village();
    await withCard(map, inWorld({ RREventPreviewModels: models }), async card => {
        card.manager.projectController.getCurrentProject = () => ({ path: '/project' });
        const editor = view3D(card.manager, 7, 7, 25);
        // This model's body is one tile, whichever way it faces.
        for (const facing of [2, 4, 6, 8]) card.state.bodies.set(JSON.stringify([R.normalizeModelSpec(TANK_SPEC), facing]), null);
        tileOf(card, 4).click();
        // Over the deck two up: the preview stands on the deck.
        B.hover3D(editor, ...pointAt(editor, 2, 2, 2.1));
        await tick(5);
        const ghost = ghostOf(), shown = models.made[models.made.length - 1];
        assert.deepEqual([ghost.visible, ghost.parent === editor.scene, ghost.userData.refused], [true, true, false]);
        assert.deepEqual([ghost.position.x, ghost.position.y, ghost.position.z], [2.5, 2.1, 2.5]);
        assert.equal(shown.direction, 2);
        // Its materials are the model's own, made see-through as they are: the look in their program is still there.
        const mesh = modelIn(ghost).children[0];
        assert.equal(mesh.material, shown.material);
        assert.deepEqual([mesh.material.onBeforeCompile.name, mesh.material.customProgramCacheKey(), mesh.material.userData.rrLook.a.x], ['look', 'look', 1]);
        assert.deepEqual([mesh.material.transparent, mesh.material.opacity, mesh.material.depthWrite, mesh.material.color.getHex()], [true, 0.6, false, 0xffffff]);
        // Three tiles tall at 25 pixels a tile: life size.
        assert.equal(card.state.ghostTall3D, 3);
        assert.equal(ghost.scale.x, 1);
        // On open ground it stands on the ground; R turns it.
        B.hover3D(editor, ...pointAt(editor, 5, 9, 0));
        assert.deepEqual([ghostOf().position.x, ghostOf().position.y, ghostOf().position.z, ghostOf().scale.x], [5.5, 0, 9.5, 1]);
        document.body.key('r');
        assert.equal(card.state.ghostTall3D, 3, 'built again facing left: its height is known before its model is in');
        await tick(5);
        assert.deepEqual([models.made[models.made.length - 1].direction, ghostOf().scale.x, card.state.ghostTall3D], [4, 1, 3]);
        // From far off (7 pixels a tile, 21 pixels tall) it is enlarged to 28 pixels, and no more.
        editor.view.distance = 500 / 7;
        editor.applyCamera();
        B.hover3D(editor, ...pointAt(editor, 5, 9, 0));
        assert.ok(Math.abs(ghostOf().scale.x - 28 / 21) < 1e-6, String(ghostOf().scale.x));
        // A refused place: gray, on the surface the pointer met, with the reason on the hint line.
        editor.view.distance = 10;
        editor.applyCamera();
        B.hover3D(editor, ...pointAt(editor, 6, 6, 3.1));
        await tick(5);
        const refused = ghostOf();
        assert.deepEqual([refused.userData.refused, refused.position.y, card.$('[data-part="hint"]').textContent], [true, 3.1, 'Nothing can stand on this roof.']);
        const gray = modelIn(refused).children[0].material;
        assert.deepEqual([gray.opacity, gray.color.getHex()], [0.3, 0x9a9a9a]);
        assert.equal(card.$('[data-part="hint"]').classList.contains('is-refused'), true);
        // The pointer gone: no preview, and the hint says the next step again.
        B.hover3D(editor, null);
        assert.deepEqual([ghostOf().visible, card.$('[data-part="hint"]').textContent], [false, 'Click the map to place Tank. R turns it, right-click removes one, Esc stops.']);
    });
    // A model whose instance shares its materials with the model read from the file is copied before it is made faint.
    const shared = { clone() { return { color: null, copied: true }; } }, node = { material: shared };
    B.fadeModel({ traverse: visit => visit(node) }, true, false);
    assert.deepEqual([node.material.copied, node.material.opacity, shared.opacity], [true, 0.6, undefined]);
});

/** A 3D map, 30 by 30, with one hall: a flat roof top twelve tiles square, five up, over (9..20, 9..20), a roof's slope running up to each of its four sides; and a deck as high over (24..26, 10..12), two tiles of open ground from the hall. */
function hall() {
    const data = new Array(30 * 30 * 6).fill(0), pieces = [];
    for (let i = 0; i < 30 * 30; i++) data[i] = 1;
    for (let y = 9; y <= 20; y++) for (let x = 9; x <= 20; x++) pieces.push(piece('floor', x, y, 5));
    for (let at = 9; at <= 20; at++) pieces.push(piece('ramp', at, 8, 4, { rot: 0 }), piece('ramp', at, 21, 4, { rot: 2 }), piece('ramp', 8, at, 4, { rot: 3 }), piece('ramp', 21, at, 4, { rot: 1 }));
    for (let y = 10; y <= 12; y++) for (let x = 24; x <= 26; x++) pieces.push(piece('floor', x, y, 5));
    return { id: 3, width: 30, height: 30, tilesetId: 1, note: '<3d>', data, events: [null], reactor3d: { version: 1, mode: '3d', width: 30, height: 30, elevation: new Array(900).fill(0), pieces } };
}

test('a wide roof top is the roof to its middle, and the same answer on every tile of it', async () => {
    const map = hall();
    await withCard(map, inWorld(), card => {
        const editor = view3D(card.manager, 15, 15, 48);
        tileOf(card, 1).click();
        const why = (x, y) => { const verdict = B.judge(card.manager, x, y, B.whereOf(editor, { x, y, height: 5.1 }, null)); return verdict.ok ? 'z ' + verdict.z : verdict.why; };
        // The middle of the top is six tiles from any slope.
        assert.equal(why(14, 14), 'roof');
        const answers = new Set();
        for (let y = 9; y <= 20; y++) for (let x = 9; x <= 20; x++) answers.add(why(x, y));
        assert.deepEqual(Array.from(answers), ['roof'], 'all 144 tiles');
        // A deck as high that no slope runs up to is no part of it, whatever was learned of the hall; nor is the ground between.
        const deck = new Set();
        for (let y = 10; y <= 12; y++) for (let x = 24; x <= 26; x++) deck.add(why(x, y));
        assert.deepEqual([Array.from(deck), B.roofAt(map, 25, 11, 5.1), B.roofAt(map, 23, 11, 0)], [['z 5.1'], false, false]);
    });
});

test('a roof takes nobody by a click: its slopes, its flat ridge and a roofing slab; a deck and a flat roof do', async () => {
    const map = village();
    await withCard(map, inWorld(), card => {
        const editor = view3D(card.manager, 7, 7, 48);
        tileOf(card, 1).click();
        const judged = (x, y, height) => { const verdict = B.judge(card.manager, x, y, B.whereOf(editor, { x, y, height }, null)); return verdict.ok ? 'z ' + verdict.z : verdict.why + ': ' + verdict.whyText; };
        assert.equal(judged(6, 5, 2.5), 'roof: Nothing can stand on this roof.', 'a slope');
        assert.equal(judged(6, 6, 3.1), 'roof: Nothing can stand on this roof.', 'the flat ridge the slopes run up to');
        assert.equal(judged(7, 8, 3.1), 'roof: Nothing can stand on this roof.');
        assert.equal(judged(6, 7, 3.1), 'roof: Nothing can stand on this roof.', 'its middle row, beside no slope, is the same ridge');
        assert.equal(judged(10, 12, 3.71), 'roof: Nothing can stand on this roof.', 'a slab laid at a tilt the physics walks as level');
        assert.equal(judged(2, 2, 2.1), 'z 2.1', 'a deck');
        assert.equal(judged(11, 4, 3.1), 'z 3.1', 'a flat roof no slope runs up to');
        assert.equal(judged(11, 3, 3.1), 'z 3.1', 'a slope that comes down onto it is not its roof');
        assert.equal(judged(2, 6, 3.1), 'z 3.1', 'nor is a lower wing\'s slope that ends a tile under a deck');
        assert.equal(judged(5, 9, 0), 'z 0', 'the ground beside a slope');
        // A ramp laid on the ground is the tile's own floor: walked, and stood on.
        const ramp = world.ReactorPhysics.levelsAt(map, 12, 8);
        assert.deepEqual([ramp.length, ramp[0].kind, B.roofAt(map, 12, 8, ramp[0].top), judged(12, 8, ramp[0].top)], [1, 'ramp', false, 'z 0']);
        // Asked directly.
        assert.deepEqual([B.roofAt(map, 6, 7, 3.1), B.roofAt(map, 2, 2, 2.1), B.roofAt(map, 11, 3, 3.1), B.roofAt(map, 5, 9, 0), B.roofAt(map, 6, 6, NaN)], [true, false, false, false, false]);
        // A new plain event may still be opened on the ridge: its dialog shows the Z it would stand at.
        assert.equal(B.liftAt(map, 6, 7, 3.1), 3.1);
        // The click: nothing is stood on the ridge; one is stood on the deck, with its Z.
        assert.equal(B.placeAt(card.manager, 6, 6, B.whereOf(editor, { x: 6, y: 6, height: 3.1 }, null)), true);
        assert.equal(map.events.filter(Boolean).length, 0);
        assert.equal(B.placeAt(card.manager, 2, 2, B.whereOf(editor, { x: 2, y: 2, height: 2.1 }, null)), true);
        assert.deepEqual([map.events[1].x, map.events[1].y, R.eventZAt(map, 1)], [2, 2, 2.1]);
    });
});

test('a pointer on a placed model is refused; one that can be walked through is not; the test is not made again while the pointer rests', async () => {
    const map = village();
    map.reactor3d.props = [{ id: 7, name: 'Nature/Oak', x: 3, y: 11 }, { id: 8, name: 'Nature/Grass', x: 9, y: 2, passable: true }];
    await withCard(map, inWorld(), card => {
        const editor = view3D(card.manager, 7, 7, 48);
        let casts = 0;
        const canopy = (id, x, y) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 3), new THREE.MeshBasicMaterial());
            mesh.position.set(x + 0.5, 2, y + 0.5);
            mesh.userData.propId = id;
            mesh.updateMatrixWorld(true);
            const raycast = mesh.raycast.bind(mesh);
            mesh.raycast = (...given) => { casts++; return raycast(...given); };
            editor.propGroup.add(mesh);
        };
        canopy(7, 3, 11);
        canopy(8, 9, 2);
        tileOf(card, 1).click();
        // Under the oak's canopy, a tile away from its trunk: the ground is free, the pointer is on the tree.
        const under = pointAt(editor, 4, 11, 0);
        B.hover3D(editor, ...under);
        assert.deepEqual([card.state.verdict.ok, card.state.verdict.why, card.$('[data-part="hint"]').textContent], [false, 'taken', 'Something is already here.']);
        assert.equal(casts, 1);
        B.hover3D(editor, ...under);
        B.hover3D(editor, ...under);
        assert.equal(casts, 1, 'the pointer rests: asked once');
        assert.equal(B.placeAt(card.manager, 4, 11, B.whereOf(editor, under[0], under[2])), true);
        assert.equal(map.events.filter(Boolean).length, 0, 'the click does nothing');
        assert.equal(casts, 2, 'a click asks again, whatever was asked a moment ago');
        // Grass one walks through is no tree: the unit is stood in it.
        const grass = pointAt(editor, 10, 2, 0);
        B.hover3D(editor, ...grass);
        assert.equal(card.state.verdict.ok, true);
        assert.equal(B.placeAt(card.manager, 10, 2, B.whereOf(editor, grass[0], grass[2])), true);
        assert.deepEqual([map.events[1].x, map.events[1].y], [10, 2]);
        // Open ground with no model over it.
        const open = pointAt(editor, 9, 7, 0);
        B.hover3D(editor, ...open);
        assert.equal(card.state.verdict.ok, true);
    });
});

test('a click from far off in the 3D view places, and the view comes in on the new unit', async () => {
    const map = village();
    await withCard(map, inWorld(), card => {
        const editor = view3D(card.manager, 7, 7, 7);
        tileOf(card, 1).click();
        const far = pointAt(editor, 3, 9, 0);
        assert.equal(B.placeAt(card.manager, 3, 9, B.whereOf(editor, far[0], far[2])), true);
        assert.deepEqual([map.events[1].x, map.events[1].y], [3, 9]);
        assert.deepEqual([editor.view.target.x, editor.view.target.y, editor.view.target.z], [3.5, 0, 9.5], 'the new unit in the middle of the view');
        assert.ok(Math.abs(500 / editor.view.distance - 48) < 0.01, 'a tile is 48 pixels: ' + 500 / editor.view.distance);
        // At a size one can work at the view is left where it is.
        const target = editor.view.target.clone(), distance = editor.view.distance;
        const near = pointAt(editor, 4, 11, 0);
        assert.equal(B.placeAt(card.manager, 4, 11, B.whereOf(editor, near[0], near[2])), true);
        assert.deepEqual([editor.view.target.equals(target), editor.view.distance], [true, distance]);
        // A refused click from far off moves nothing.
        editor.view.distance = 500 / 7;
        editor.applyCamera();
        const roof = pointAt(editor, 6, 6, 3.1);
        assert.equal(B.placeAt(card.manager, 6, 6, B.whereOf(editor, roof[0], roof[2])), true);
        assert.deepEqual([map.events.filter(Boolean).length, editor.view.distance], [2, 500 / 7]);
    });
});

test('two quick clicks with a unit in hand are two clicks: the 3D view opens no event', async () => {
    await withCard(flat(), null, card => {
        assert.equal(B.holding(), false);
        tileOf(card, 1).click();
        assert.equal(B.holding(), true);
        document.body.key('Escape');
        assert.equal(B.holding(), false);
    });
    await withCard(flat(), { shut: true }, async () => {
        assert.equal(B.holding(), false);
        const asked = B.pickTile({ unit: { team: 'enemy', record: 'enemy', id: 1 } });
        assert.equal(B.holding(), true, 'a command\'s dialog is picking a tile');
        document.body.key('Escape');
        assert.equal(await asked, null);
        assert.equal(B.holding(), false);
    });
    const view = read('src/MapEditor3D.js');
    const body = view.slice(view.indexOf('    handleDoubleClick(event) {'), view.indexOf('\n    }\n', view.indexOf('    handleDoubleClick(event) {')));
    assert.match(body, /event\.preventDefault\(\);\s*\/\/[^\n]*\n\s*if \(typeof window !== 'undefined' && window\.RRBattleSetup\?\.holding\?\.\(\)\) return;\s*const cube = this\.eventAt\(/, 'before any event is looked for or opened');
});

//-----------------------------------------------------------------------------
// The tiles' pictures.

test('a model\'s picture that has to be drawn waits for the card\'s first moments and a quiet moment of the page, one at a time', { timeout: 10000 }, async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-card-shots-')), cache = path.join(home, 'cache');
    const folder = path.join(home, '3d', 'Actors', 'Jolt');
    fs.mkdirSync(path.join(folder, 'source'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'source', 'Jolt.glb'), 'glb');
    const url = 'data:image/png;base64,' + Buffer.alloc(600, 7).toString('base64');
    const spec = JOLT;
    let busy = 0, most = 0, idle = 0;
    const drawnAt = [];
    const models = { thumbnail: async () => { most = Math.max(most, ++busy); drawnAt.push(Date.now()); await tick(15); busy--; return { url }; }, templateFor: async () => null };
    const globals = { Database3DEditor: { thumbnailCacheRoot: () => cache }, RREventPreviewModels: models, requestIdleCallback: (run, how) => { idle++; assert.deepEqual(how, { timeout: 1000 }); setTimeout(run, 0); } };
    try {
        await withCard(flat(), { globals }, async card => {
            delete card.state.ownShots;
            const opened = card.state.openedAt;
            assert.ok(Date.now() - opened < 200, 'the card has just opened');
            const shots = await Promise.all([2, 4, 6].map(facing => B.modelShot({ path: home }, spec, null, facing)));
            assert.deepEqual(shots.map(shot => shot.url), [url, url, url]);
            assert.ok(drawnAt[0] - opened >= 295, `the first is drawn ${drawnAt[0] - opened} ms after the card opened`);
            assert.deepEqual([most, idle, fs.readdirSync(cache).length], [1, 3, 3], 'one at a time, each in a quiet moment, each kept');
            // One kept from before is not drawn and waits for nothing.
            const before = Date.now(), again = await B.modelShot({ path: home }, spec, null, 2);
            assert.deepEqual([again.kept, drawnAt.length, idle], [true, 3, 3]);
            assert.ok(Date.now() - before < 100);
        });
    } finally { delete B._state.ownShots; fs.rmSync(home, { recursive: true, force: true }); }
});

test('the card\'s own picture of a model: one buffer for every picture, its programs built before it is drawn, read back in a later frame, its renderer gone with the card', { timeout: 10000 }, async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-card-own-')), cache = path.join(home, 'cache');
    const folder = path.join(home, '3d', 'Actors', 'Jolt');
    fs.mkdirSync(path.join(folder, 'source'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'source', 'Jolt.glb'), 'glb');
    const order = [];
    let renderers = 0, disposed = 0, frames = 0;
    class Renderer {
        constructor(given) { renderers++; this.domElement = given.canvas; }
        setClearColor() {}
        setSize(width, height) { order.push(`size ${width}x${height}`); }
        setViewport(...corner) { order.push('into ' + corner.join(' ')); }
        compileAsync(scene) { order.push('compile ' + scene.children.filter(child => child.isGroup).length); return tick(20).then(() => { order.push('built'); }); }
        render() { order.push('draw at frame ' + frames); }
        dispose() { disposed++; }
    }
    const fake = Object.create(THREE, { WebGLRenderer: { value: Renderer } });
    const models = modelsOf();
    models.texturesDecoded = () => true;
    models.disposeInstance = () => { order.push('gone'); };
    const frame = R.frameModelSprite;
    const sides = [128, 96, 300];
    R.frameModelSprite = () => ({ pixels: sides.shift() });
    const picture = (side, corner) => ({ url: 'data:image/png;base64,' + Buffer.from(`picture ${side}x${side} drawn 1`).toString('base64'), cut: corner });
    try {
        await withCard(flat(), { globals: { THREE: fake, Database3DEditor: { thumbnailCacheRoot: () => cache }, RREventPreviewModels: models,
            requestAnimationFrame: run => setTimeout(() => { frames++; order.push('frame'); run(); }, 2) } }, async card => {
            card.state.ownShots = true;
            card.state.openedAt = 0;
            const cuts = [], create = document.createElement;
            document.createElement = tag => { const made = create(tag); if (tag === 'canvas') cuts.push(made); return made; };
            let shots;
            try { shots = await Promise.all([2, 4, 6].map(facing => B.modelShot({ path: home }, JOLT, null, facing))); } finally { document.createElement = create; }
            // Each picture is the corner drawn into (the buffer's lower left), cut out at its own size.
            assert.deepEqual(shots.map(shot => shot.url), [picture(128).url, picture(96).url, picture(300).url]);
            // (Other canvases are the tiles' own drawings of the plain figure.)
            assert.deepEqual(cuts.filter(canvas => canvas.calls && canvas.calls.length === 1 && canvas.calls[0].length === 9).map(canvas => canvas.calls), [
                [['drawImage', 0, 256 - 128, 128, 128, 0, 0, 128, 128]], [['drawImage', 0, 256 - 96, 96, 96, 0, 0, 96, 96]], [['drawImage', 0, 0, 300, 300, 0, 0, 300, 300]]]);
            const drawing = order.filter(entry => entry !== 'frame');
            assert.deepEqual(drawing.map(entry => entry.replace(/ at frame \d+$/, '')), [
                'size 256x256', 'into 0 0 128 128', 'compile 1', 'built', 'draw', 'gone',
                'into 0 0 96 96', 'compile 1', 'built', 'draw', 'gone',
                'size 300x300', 'into 0 0 300 300', 'compile 1', 'built', 'draw', 'gone'
            ], 'one model on the stage at a time, built before it is drawn; the buffer laid out once, and again only for a larger picture');
            // Between a draw and the picture read back from it (the model leaves the stage after that) the page has drawn a frame.
            for (let at = 0; at < order.length; at++) if (/^draw/.test(order[at])) assert.ok(order.slice(at + 1, order.indexOf('gone', at)).includes('frame'), 'a frame after ' + order[at]);
            assert.deepEqual([renderers, disposed, !!card.state.stage], [1, 0, true], 'one renderer for all three');
            B.close();
            assert.deepEqual([disposed, card.state.stage], [1, null]);
        });
    } finally { R.frameModelSprite = frame; delete B._state.ownShots; fs.rmSync(home, { recursive: true, force: true }); }
});
