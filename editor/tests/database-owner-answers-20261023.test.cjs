'use strict';
// Database fixes approved by the owner on 2026-10-23 (docs/OWNER-QUESTIONS.md A4, A5, A8, A9, B28).
// The real-input checks of the same items live in the GUI runs reported with them; these pin the logic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editor = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editor, file), 'utf8');
const quiet = { log() {}, debug() {}, warn() {}, error() {} };

test('A4: a face or character under its preview is numbered as the picker and the event list number it', () => {
    const source = read('src/DatabaseEditorUI.js');
    assert.match(source, /tag\.textContent = name \? \(index === undefined \? name : `\$\{name\} \(\$\{index\}\)`\) : '';/);
    assert.match(source, /\$\{tt\('index:'\)\} \$\{selectedIndex\}/, 'the picker says the stored index');
    assert.doesNotMatch(source, /\(\$\{index \+ 1\}\)/);
});

test('A5: Cancel asks before unsaved edits are dropped, through the same question as Escape and ×', async () => {
    const elements = Object.fromEntries(['database-viewer', 'database-detail', 'database-close-btn', 'database-ok-btn', 'database-cancel-btn', 'database-apply-btn']
        .map(id => [id, { style: {}, innerHTML: '', classList: { remove() {} }, querySelectorAll: () => [] }]));
    const sandbox = { window: {}, document: { getElementById: id => elements[id], removeEventListener() {} }, console: quiet, setTimeout };
    const Editor = vm.runInNewContext(read('src/DatabaseEditorUI.js') + '\nDatabaseEditorUI', sandbox);
    const ui = Object.create(Editor.prototype);
    const asked = [];
    let answer = false;
    Object.assign(ui, { currentProject: { path: '/game' }, databaseManager: { data: { actors: [null, { id: 1, name: 'Hero' }] }, dataGeneration: 1 }, _detailGeneration: 0, _listGeneration: 0, updateStatus() {},
        callbacks: { showConfirm: async (...args) => { asked.push(args[1]); return answer; } } });
    ui.closeDatabaseViewer = function() { this.closed = (this.closed || 0) + 1; this._dataSnapshot = null; };
    ui.setupDatabaseControls();
    // Nothing changed: Cancel closes at once.
    ui.takeDatabaseSnapshot();
    elements['database-cancel-btn'].onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([ui.closed, asked.length], [1, 0]);
    // A change: Cancel asks; "Cancel" keeps the edit and the Database open.
    ui.takeDatabaseSnapshot();
    ui.databaseManager.data.actors[1].name = 'Edited';
    elements['database-cancel-btn'].onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([ui.closed, asked], [1, ['Close the database and discard the unsaved changes?']]);
    assert.equal(ui.databaseManager.data.actors[1].name, 'Edited');
    // Discard puts the record back and closes; × asks the same way.
    answer = true;
    elements['database-close-btn'].onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([ui.closed, asked.length, ui.databaseManager.data.actors[1].name], [2, 2, 'Hero']);
});

test('A8: every tile starts with RPG Maker\'s flag for its sheet, and holes are filled without touching set flags', () => {
    const S = require('../src/utils/TilesetSheets.js');
    const flags = S.defaultFlags();
    assert.equal(flags.length, 8192);
    assert.equal(flags[0], 0x10, 'tile 0 is a star');
    assert.deepEqual([0, 1, 2, 3, 4, 5, 14, 15].map(kind => flags[2048 + kind * 48]), [0x80f, 0xa0f, 0xe0f, 0xe0f, 0x80f, 0xe0f, 0x80f, 0xe0f], 'A1: water stops walkers; waterfalls are walls');
    assert.equal(flags[4352], 0xe0f, 'A3 roofs and walls');
    assert.deepEqual([flags[5888], flags[5888 + 16], flags[5888 + 47], flags[5888 + 8 * 48]], [0xe00, 0xe02, 0xe0f, 0xe0f], 'A4 tops by their shape, faces closed');
    assert.deepEqual([flags[1], flags[1536], flags[2816]], [0x600, 0x600, 0x600], 'B to E, A5 and A2 open');
    // A tileset written short, with a hole and a null: filled; what was set stays.
    const held = [0x10, 0x0f];
    held[3000] = null;
    held[5000] = 0x0f;
    assert.equal(S.fillFlags(held), 8192 - 3);
    assert.equal(held.length, 8192);
    assert.ok(held.every(Number.isInteger));
    assert.deepEqual([held[1], held[3000], held[5000], held[2048]], [0x0f, 0x600, 0x0f, 0x80f]);
    assert.equal(S.fillFlags(held), 0, 'a whole array is left alone');
});

test('A8: the tileset editor fills a tileset\'s missing flags when it is opened (not an edit) and when a sheet is assigned', () => {
    const RRTilesetSheets = require('../src/utils/TilesetSheets.js');
    const context = { console: quiet, window: {}, document: {}, RRTilesetSheets };
    const Editor = vm.runInNewContext(`${read('src/database/DatabaseTilesetEditor.js')}\nDatabaseTilesetEditor;`, context);
    const editor = Object.create(Editor.prototype);
    const viewed = [];
    editor.parentEditor = { normalizeOnView: (type, entry, fill) => { viewed.push(type); return fill(entry); } };
    const tileset = { id: 3, flags: [16] };
    assert.equal(editor.fillMissingFlags(tileset, { onView: true }), 8191);
    assert.deepEqual([viewed, tileset.flags.length, tileset.flags[2048]], [['tilesets'], 8192, 0x80f]);
    assert.equal(editor.fillMissingFlags(tileset, { onView: true }), 0, 'a whole tileset is not touched again');
    assert.deepEqual(viewed, ['tilesets']);
    const source = read('src/database/DatabaseTilesetEditor.js');
    assert.match(source, /RRTilesetSheets\.setNameAt\(this\.currentTileset\.tilesetNames, layerIndex, baseName\);\s*this\.fillMissingFlags\(this\.currentTileset\);/);
    assert.match(source, /this\.fillMissingFlags\(tileset, \{ onView: true \}\);/);
    assert.doesNotMatch(source, /compact-save-tileset-btn/, 'B28: no Save button of its own; OK and Apply write');
});

test('A9: a troop shows the battleback of the map that starts its battle', () => {
    const Troops = require('../src/database/DatabaseTroopEditor.js');
    const event = list => ({ id: 1, pages: [{ list }] });
    const found = Troops.battlebacksFromMaps([
        { id: 5, map: { specifyBattleback: true, battleback1Name: 'Cave', battleback2Name: 'CaveWall', events: [null, event([{ code: 301, parameters: [0, 2, false, false] }])], encounterList: [{ troopId: 4 }] } },
        { id: 2, map: { specifyBattleback: false, events: [null, event([{ code: 283, parameters: ['Castle', 'Throne'] }, { code: 301, parameters: [0, 3, false, false] }, { code: 301, parameters: [0, 2, false, false] }])] } },
        { id: 7, map: { specifyBattleback: false, events: [null, event([{ code: 301, parameters: [0, 6, false, false] }, { code: 301, parameters: [1, 9, false, false] }])], encounterList: [{ troopId: 8 }] } }
    ]);
    assert.deepEqual(found.get(3), { mapId: 2, battleback1Name: 'Castle', battleback2Name: 'Throne' }, 'a Change Battle Back before the battle');
    assert.deepEqual(found.get(2), { mapId: 2, battleback1Name: 'Castle', battleback2Name: 'Throne' }, 'the lowest map id wins');
    assert.deepEqual(found.get(4), { mapId: 5, battleback1Name: 'Cave', battleback2Name: 'CaveWall' }, 'an encounter on a map that specifies one');
    assert.deepEqual([found.has(6), found.has(8), found.has(9)], [false, false, false], 'no battleback given: the Battle Test one is shown');
});

/** A document just big enough for BattlePresentationEditor's builders. */
function fakeDocument() {
    const make = tag => {
        const node = { tagName: tag.toUpperCase(), children: [], attributes: {}, className: '', style: {}, value: '', textContent: '', open: false,
            classList: { add(name) { node.className = (node.className + ' ' + name).trim(); } },
            setAttribute(k, v) { node.attributes[k] = String(v); }, getAttribute(k) { return node.attributes[k] ?? null; }, removeAttribute(k) { delete node.attributes[k]; },
            append(...items) { for (const item of items) { item.parentNode = node; node.children.push(item); } },
            appendChild(item) { node.append(item); return item; },
            replaceChildren(...items) { node.children = []; node.append(...items); },
            get firstElementChild() { return node.children[0] || null; },
            all() { return node.children.flatMap(child => [child, ...child.all()]); },
            querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
            querySelectorAll(selector) { const name = selector.replace(/^\./, ''); return node.all().filter(child => (selector.startsWith('.') ? child.className.split(' ').includes(name) : child.tagName === selector.toUpperCase())); } };
        Object.defineProperty(node, 'innerText', { get: () => node.textContent });
        return node;
    };
    return { createElement: make };
}

test('B28: a state\'s motion is set in one place, and a choice there clears the other two', () => {
    const document = fakeDocument();
    const B = require('../src/battle/BattleData.js');
    const Editor = vm.runInNewContext(`${read('src/battle/BattlePresentationEditor.js')}\nBattlePresentationEditor;`, { document, window: {}, ReactorBattleData: B, console: quiet });
    const state = { id: 4, name: 'Poison', motion: 1, priority: 70 };
    const db = { data: { states: [null, null, null, null, state], actionSequences: [null, { id: 1, purpose: 'motion', name: 'Woozy', steps: [] }], battlePresentation: B.empty() }, mutationGeneration: 0,
        updateState(id, data) { this.data.states[id] = data; this.mutationGeneration++; } };
    const parent = { databaseManager: db, updateStatus() {}, openDatabase() {}, showDatabaseDetail() {} };
    const editor = new Editor(parent);
    const container = document.createElement('div'), page = document.createElement('div');
    container.append(page);
    editor.stateGraphic(container, state);
    const selects = () => container.all().filter(node => node.tagName === 'SELECT' && node.className.includes('rr-state-motion-select'));
    assert.equal(selects().length, 1, 'one motion list');
    const select = selects()[0];
    const values = select.children.map(option => option.value);
    assert.deepEqual(values.slice(0, 4), ['stock:0', 'stock:1', 'stock:2', 'stock:3'], 'the side-view motions first');
    assert.ok(values.includes('sprite:guard') && values.includes('sequence:1'));
    assert.equal(select.value, 'stock:1', 'Abnormal, from the state itself');
    // Copied out of the vm realm, so deepEqual compares values only.
    const settings = () => JSON.parse(JSON.stringify(db.data.battlePresentation.states?.[4] || {}));
    select.value = 'sequence:1'; select.onchange();
    assert.deepEqual(settings().reaction, { mode: 'sequence', sequenceId: 1 });
    selects()[0].value = 'sprite:guard'; selects()[0].onchange();
    assert.deepEqual([settings().reaction, settings().graphicMotion.motion], [{ mode: 'inherit' }, 'guard'], 'a drawn motion takes the sequence\'s place');
    selects()[0].value = 'stock:2'; selects()[0].onchange();
    assert.deepEqual([state.motion, settings().graphicMotion.motion, settings().reaction.mode], [2, '', 'inherit'], 'Sleep: the state\'s own motion, the others cleared');
    assert.equal(selects()[0].value, 'stock:2');
    assert.doesNotMatch(read('src/database/DatabaseStateEditor.js'), /\[SV\] Motion|data-field="motion"/, 'General no longer has a second motion field');
});

test('B28: the Animations page keeps no Properties section for an Effekseer animation', () => {
    const source = read('src/database/DatabaseAnimationEditor.js');
    assert.doesNotMatch(source, /Effect file, display type, scale and other settings are editable/);
    assert.match(source, /\$\{isSpriteAnimation \? `\s*<div class="anim-editor-properties"/);
});

test('B28: Physics and Swimming are System 2 cards drawn by the Controls editor; Controls keeps the keys', () => {
    const controls = read('src/database/DatabaseControlsEditor.js');
    const render = controls.slice(controls.indexOf('    render() {'), controls.indexOf('    /** The Physics and Swimming cards of 3D maps'));
    assert.doesNotMatch(render, /physics-3d-maps|swimming-3d-maps/, 'not on the Controls page');
    assert.match(controls, /physicsCards\(\) \{[\s\S]*data-section-key="physics-3d-maps"[\s\S]*data-section-key="swimming-3d-maps"/);
    assert.match(read('src/database/DatabaseSystem2Editor.js'), /physics\.showPhysicsIn\(host\);/);
});

test('B28: Battle Room Setup folds its camera numbers and ends on Cancel and OK', () => {
    const source = read('src/battle/BattlePresentationEditor.js');
    assert.match(source, /const numbers=this\.element\('details','rr-battle-camera-numbers'\)/);
    assert.match(source, /const input=this\.number\(numbers,/, 'the seven numbers inside the fold');
    assert.match(source, /footer\.append\(this\.button\('Cancel',cleanup\),ok\)/);
    assert.match(read('css/styles.css'), /\.rr-battle-room-dialog \.rr-battle-room-footer \{ justify-content:flex-end;/);
});

test('B23: a Battle Window that follows the actor is outlined, handled and clicked where it is drawn', () => {
    const Editor = vm.runInNewContext(`${read('src/database/DatabaseUserInterfaceEditor.js')}\nDatabaseUserInterfaceEditor;`, { console: quiet, window: {}, document: {} });
    const ui = Object.create(Editor.prototype);
    ui.designSize = () => ({ width: 1920, height: 1080 });
    ui.screenSize = () => ({ width: 1920, height: 1080 });
    ui.current = { nodes: [
        { id: 1, type: 'list', parent: 0, anchor: 'topLeft', x: 365, y: 900, width: 1190, height: 170, rowLayout: 'actorPanel', dataSource: 'party', columns: 7, rowHeight: 170, fill: 'none' },
        { id: 5, type: 'battleWindow', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 192, height: 245, followActor: true, followTarget: 'model' },
        { id: 6, type: 'battleWindow', parent: 0, anchor: 'topLeft', x: -19, y: -383, width: 192, height: 245, followActor: true, followTarget: 'slot' },
        { id: 7, type: 'battleWindow', parent: 0, anchor: 'topLeft', x: 40, y: 50, width: 100, height: 100, followActor: false }
    ] };
    const plain = rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    const rects = ui.rects(), top = ui.previewActorTop();
    assert.deepEqual(plain(rects.get(5)), { x: top.x - 96, y: top.y - 245, width: 192, height: 245 }, 'centered on the actor, its bottom at the top of the figure');
    assert.deepEqual(plain(rects.get(6)), { x: 365 - 19, y: 900 - 383, width: 192, height: 245 }, 'from the actor\'s row of the party panel');
    assert.deepEqual(plain(rects.get(7)), { x: 40, y: 50, width: 100, height: 100 }, 'a window that does not follow stays where its anchor puts it');
    assert.deepEqual(plain(ui.rects({ raw: true }).get(5)), { x: 0, y: 0, width: 192, height: 245 });
});
