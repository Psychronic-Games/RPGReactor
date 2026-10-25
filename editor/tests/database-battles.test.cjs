'use strict';
// Database > System 1: the one Battles card, the one party-size number and
// the Save and open Battle Setup button; Database > Terms: the words of
// battles on the map. The cards are run from their own markup against the
// editors' real writers, and what they store is read back by the game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld } = require('./helpers/fight-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const escapeHtml = text => String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeHtml = text => String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const LOCALES = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];

//-----------------------------------------------------------------------------
// A reader for the markup a card writes: elements with attributes, fields with
// values, listeners fired by hand, and the selectors the editors use
// (tag, #id, .class, [attribute], a descendant).

function page(html) {
    const element = (tag, attributes) => {
        const node = {
            tag, attributes, children: [], parent: null, text: '', listeners: {},
            hidden: 'hidden' in attributes, disabled: 'disabled' in attributes, checked: 'checked' in attributes,
            value: attributes.value !== undefined ? unescapeHtml(attributes.value) : '',
            dataset: {},
            getAttribute(name) { return name in this.attributes ? unescapeHtml(this.attributes[name]) : null; },
            hasAttribute(name) { return name in this.attributes; },
            setAttribute(name, value) { this.attributes[name] = escapeHtml(value); },
            addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); },
            fire(type) { for (const handler of this.listeners[type] || []) handler({ target: this, type }); },
            /** Set a field as a user would and tell its listeners. */
            choose(value) { if (this.attributes.type === 'checkbox') this.checked = !!value; else this.value = String(value); this.fire('input'); this.fire('change'); },
            get className() { return this.attributes.class || ''; },
            get textContent() { return this.text + this.children.map(child => child.textContent).join(''); },
            set textContent(value) { this.children = []; this.text = String(value); },
            closest(selector) { for (let at = this; at && at.matches; at = at.parent) if (at.tag !== 'root' && selector.split(',').some(one => at.matches(one.trim()))) return at; return null; },
            get classList() { const names = this.className.split(/\s+/).filter(Boolean); return { contains: name => names.includes(name) }; },
            matches(selector) {
                const found = /^([a-z]+)?((?:[#.][\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i.exec(selector);
                if (!found) throw new Error('selector not read: ' + selector);
                if (found[1] && found[1].toLowerCase() !== this.tag) return false;
                for (const [, kind, name, attribute, wanted] of (found[2] || '').matchAll(/([#.])([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
                    if (kind === '#' && this.attributes.id !== name) return false;
                    if (kind === '.' && !this.classList.contains(name)) return false;
                    if (attribute && (!(attribute in this.attributes) || (wanted !== undefined && this.attributes[attribute] !== wanted))) return false;
                }
                return true;
            },
            under(chain) {
                if (!chain.length) return true;
                for (let at = this.parent; at; at = at.parent) if (at.matches && at.matches(chain[chain.length - 1])) return at.under(chain.slice(0, -1));
                return false;
            },
            querySelectorAll(selectors) {
                const found = [];
                const walk = node => { for (const child of node.children) { if (selectors.split(',').some(one => { const chain = one.trim().split(/\s+/); return child.matches(chain[chain.length - 1]) && child.under(chain.slice(0, -1)); })) found.push(child); walk(child); } };
                walk(this);
                return found;
            },
            querySelector(selectors) { return this.querySelectorAll(selectors)[0] || null; }
        };
        for (const [name, value] of Object.entries(attributes)) if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = unescapeHtml(value);
        return node;
    };
    const root = element('root', {});
    let at = root;
    for (const [, close, tag, rest, text] of html.matchAll(/<(\/)?([a-z0-9]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|([^<]+)/gi)) {
        if (text !== undefined) { at.text += unescapeHtml(text.replace(/\s+/g, ' ')); continue; }
        if (close) { if (at.parent) at = at.parent; continue; }
        const attributes = {};
        for (const [, name, value] of rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[name] = value === undefined ? '' : value;
        const node = element(tag.toLowerCase(), attributes);
        node.parent = at;
        at.children.push(node);
        if (!['input', 'br', 'img'].includes(node.tag)) at = node;
    }
    // A list shows its selected option, else its first.
    for (const select of root.querySelectorAll('select')) {
        const options = select.querySelectorAll('option');
        const chosen = options.find(option => 'selected' in option.attributes) || options[0];
        select.value = chosen ? unescapeHtml(chosen.attributes.value) : '';
    }
    return root;
}

const shownRows = (card, mark) => card.querySelectorAll(`.system-battle-mode-grid [${mark}]`).filter(row => !row.hidden).length;
const hiddenRows = (card, mark) => card.querySelectorAll(`.system-battle-mode-grid [${mark}]`).filter(row => row.hidden).length;

//-----------------------------------------------------------------------------
// The editors, loaded as the page loads them.

/** An element a card is written into: its markup as written, and the same markup read for whoever asks it for a part. */
function cardElement() {
    let html = '', read = null;
    return {
        style: {}, className: '',
        get innerHTML() { return html; },
        set innerHTML(value) { html = String(value); read = null; },
        /** The markup as read, with whatever was set on its parts since. */
        tree() { return read || (read = page(html)); },
        querySelector(selector) { return this.tree().querySelector(selector); },
        querySelectorAll(selector) { return this.tree().querySelectorAll(selector); }
    };
}

function system1(globals = {}) {
    const window = Object.assign({}, globals.window);
    const context = Object.assign({
        console: { log() {}, debug() {}, warn() {}, error() {} }, window, rrEscapeHtml: escapeHtml, setTimeout,
        document: { createElement: () => cardElement(), getElementById: () => null, querySelector: () => null }
    }, globals, { window });
    const Editor = vm.runInNewContext(`${read('src/database/DatabaseSystem1Editor.js')}\nDatabaseSystem1Editor;`, context);
    const editor = Object.create(Editor.prototype);
    Object.assign(editor, {
        databaseManager: { mutationGeneration: 0, getTroops: () => [], getCommonEvents: () => [], getMaxBattleMembers: () => 4 },
        projectManager: { getCurrentProject: () => ({ path: '/game' }) },
        parentEditor: { _databaseSession: 1 }
    });
    return { Editor, editor, window, context };
}

/** The Battles card of a System.json, drawn and wired. */
function battles(system, globals) {
    const loaded = system1(globals);
    const section = loaded.editor.createBattlesSection(system);
    const card = page(section.innerHTML);
    loaded.editor.wireBattles(card, system);
    return Object.assign(loaded, { section, card, field: selector => card.querySelector(selector) });
}

function shell(globals = {}) {
    const window = Object.assign({}, globals.window);
    return vm.runInNewContext(`${read('src/DatabaseEditorUI.js')}\nDatabaseEditorUI;`,
        Object.assign({ console: { log() {}, debug() {}, warn() {}, error() {} }, alert() {}, rrEscapeHtml: escapeHtml }, globals, { window }));
}

const startBattle = (mode, troopId = 0) => ({ code: 357, indent: 0, parameters: ['RPGReactor', 'StartMapBattle', 'Start Battle on Map', { mode, troopId }] });
const mapWith = (note, commands = []) => ({ id: 3, note, events: [null, { id: 1, pages: [{ list: commands.concat([{ code: 0, indent: 0, parameters: [] }]) }] }] });

/** A project's data folder held in memory, served as Node's file modules serve a disk. */
function memoryFolder(files = {}) {
    const held = {}, reads = [];
    let clock = 0;
    const name = file => file.split('/').pop();
    const folder = {
        reads,
        /** Writes a file: an object as JSON, a text as it is. */
        put(file, value) { held[file] = { text: typeof value === 'string' ? value : JSON.stringify(value), mtimeMs: ++clock }; return folder; },
        remove(file) { delete held[file]; return folder; },
        node: { path: { join: (...parts) => parts.join('/') }, fs: { promises: {
            readdir: async () => Object.keys(held),
            stat: async file => { if (!held[name(file)]) throw new Error('no such file'); return { mtimeMs: held[name(file)].mtimeMs, size: held[name(file)].text.length }; },
            readFile: async file => { reads.push(name(file)); return held[name(file)].text; }
        } } }
    };
    for (const [file, value] of Object.entries(files)) folder.put(file, value);
    return folder;
}

/** The on-map modes the card counts for a game of `mode` whose map files are these. */
async function modesOnDisk(Editor, folder, mode = 'classic', more = {}) {
    return Array.from(Editor.modesInUse(Object.assign({ mode, maps: await Editor.readMapModes('/game/data', folder.node) }, more))).sort();
}

//-----------------------------------------------------------------------------
// One card.

test('System 1 has one Battles card: the mode, the Classic rows, the Tactical rows, the button', () => {
    const { section, card, field } = battles({ optSideView: true, battleSystem: 2, reactorBattle: { mode: 'tactical', turns: 'initiative' } });
    assert.match(section.innerHTML, /<div class="database-section-header" data-section-key="battles">Battles<\/div>/, 'named for the folding of the page');
    assert.match(section.className, /\bsystem-battles-card\b/);
    // Every row is a cell of one label | field grid.
    const grid = card.querySelector('.system-battle-mode-grid');
    for (const selector of ['.system-battle-mode', '.system-battle-screen', '.system-battle-system', '.system-battle-turns', '.system-battle-view', '.system-battle-cinematic', '.system-battle-slowmo', '.system-battle-pace', '.system-battle-revive']) {
        assert.ok(grid.querySelector(selector), `${selector} is on the grid`);
    }
    assert.deepEqual(field('.system-battle-mode').querySelectorAll('option').map(option => option.attributes.value), ['classic', 'tactical', 'action', 'firstPerson']);
    assert.equal(field('.system-battle-mode').value, 'tactical');
    assert.deepEqual(field('.system-battle-screen').querySelectorAll('option').map(option => option.textContent.trim()), ['Front view', 'Side view']);
    assert.equal(field('.system-battle-screen').value, 'side', 'the stored screen');
    assert.deepEqual(field('.system-battle-system').querySelectorAll('option').map(option => option.textContent.trim()), ['Turn-based', 'Time progress (active)', 'Time progress (wait)']);
    assert.equal(field('.system-battle-system').value, '2', 'the stored turn system');
    assert.equal(field('.system-battle-turns').value, 'initiative');
    // Each field has its label beside it.
    for (const id of ['system-battle-mode', 'system-battle-screen', 'system-battle-system', 'system-battle-turns', 'system-battle-view', 'system-battle-cinematic', 'system-battle-pace']) {
        assert.ok(grid.querySelector(`label[for="${id}"]`), `${id} has a label`);
    }
    assert.equal(card.querySelector('label[for="system-battle-screen"]').textContent.trim(), 'Screen');
    assert.equal(card.querySelector('label[for="system-battle-system"]').textContent.trim(), 'Turns');
    // The three cards it replaces are gone, and so is the second party-size field.
    const source = read('src/database/DatabaseSystem1Editor.js');
    for (const key of ['battle-screen', 'battle-system', 'battle-mode']) assert.doesNotMatch(source, new RegExp(`keyedSection\\('${key}'`), `no ${key} card`);
    assert.equal((source.match(/keyedSection\('battles'/g) || []).length, 1);
    assert.doesNotMatch(source, /Party members in battle|system-battle-party/);
    assert.equal(card.querySelector('.system-battle-party'), null);
});

test('a game with no stored battle settings reads as Classic, front view, turn-based', () => {
    const { field, card } = battles({});
    assert.equal(field('.system-battle-mode').value, 'classic');
    assert.equal(field('.system-battle-screen').value, 'front');
    assert.equal(field('.system-battle-system').value, '0');
    assert.equal(field('.system-battle-turns').value, 'team');
    assert.equal(field('.system-battle-view').value, 'isometric');
    assert.equal(field('.system-battle-cinematic').value, 'some');
    assert.equal(field('.system-battle-pace').value, 'normal');
    assert.equal(field('.system-battle-slowmo').checked, true);
    assert.equal(field('.system-battle-revive').checked, true);
    assert.equal(shownRows(card, 'data-tactical'), 0, 'nothing of Tactical in a Classic game');
    // Action and First Person have no rows of their own here: no heading stands over nothing.
    assert.equal(card.querySelectorAll('[data-action]').length, 0, 'no Action and First Person heading without rows');
    assert.equal(shownRows(card, 'data-on-map'), 0, 'nor of battles on the map');
    for (const mode of ['tactical', 'action', 'firstPerson']) {
        const shown = battles({ reactorBattle: { mode } }).card;
        assert.equal(shownRows(shown, 'data-tactical') > 0, mode === 'tactical', `${mode}: turn settings belong to Tactical combat`);
        assert.equal(shown.querySelector('[data-on-map].system-battle-group').textContent.trim(), 'Battles on the Map');
    }
});

test('the Classic rows write the battle screen and the turn system', () => {
    const system = { optSideView: false, battleSystem: 0 };
    const { field, editor } = battles(system);
    field('.system-battle-screen').choose('side');
    assert.equal(system.optSideView, true);
    field('.system-battle-system').choose('1');
    assert.equal(system.battleSystem, 1);
    field('.system-battle-system').choose('2');
    assert.equal(system.battleSystem, 2);
    field('.system-battle-screen').choose('front');
    assert.equal(system.optSideView, false);
    assert.equal(editor.databaseManager.mutationGeneration, 4, 'the Database knows each change');
    assert.equal('reactorBattle' in system, false, 'the battle screen is not a battle-on-the-map setting');
});

//-----------------------------------------------------------------------------
// The Tactical rows.

test('the Tactical rows show whenever the game, a map or a command fights Tactical', () => {
    // The game's own mode.
    assert.ok(shownRows(battles({ reactorBattle: { mode: 'tactical', turns: 'team' } }).card, 'data-tactical') >= 9);
    // A Classic game whose open map carries the tag, its name in any letter case.
    const tagged = battles({}, { window: { reactor: { eventManager: { currentMap: mapWith('A field.\n<BATTLE Mode: tactical>') } } } });
    assert.equal(tagged.field('.system-battle-mode').value, 'classic');
    assert.equal(hiddenRows(tagged.card, 'data-tactical'), 0, 'every Tactical row shows');
    assert.equal(tagged.field('.system-battle-turns').hidden, false);
    // ... or has a Start Battle on Map that names Tactical.
    assert.equal(hiddenRows(battles({}, { window: { reactor: { eventManager: { currentMap: mapWith('', [startBattle('tactical')]) } } } }).card, 'data-tactical'), 0);
    // ... or keeps its mode in the 3D sidecar.
    assert.equal(hiddenRows(battles({}, { window: { reactor: { eventManager: { currentMap: Object.assign(mapWith(''), { reactor3d: { battle: { mode: 'tactical' } } }) } } } }).card, 'data-tactical'), 0);
    // A troop's own mode, a troop page and a common event count too.
    for (const [troops, commonEvents] of [
        [[null, { id: 1, reactorBattle: { mode: 'tactical' }, pages: [] }], []],
        [[null, { id: 1, pages: [{ list: [{ code: 357, parameters: ['RPGReactor', 'ChangeBattleMode', 'Change Battle Mode', { mode: 'tactical', scope: 'map' }] }] }] }], []],
        [[], [null, { id: 1, list: [startBattle('tactical')] }]]
    ]) {
        const loaded = system1();
        Object.assign(loaded.editor.databaseManager, { getTroops: () => troops, getCommonEvents: () => commonEvents });
        const card = page(loaded.editor.createBattlesSection({}).innerHTML);
        assert.equal(hiddenRows(card, 'data-tactical'), 0, JSON.stringify([troops, commonEvents]).slice(0, 80));
    }
    // Another mode on the map is not Tactical: its rows stay away, the on-map rows show.
    const action = battles({}, { window: { reactor: { eventManager: { currentMap: mapWith('<battle mode: action>', [startBattle('firstPerson'), startBattle('')]) } } } });
    assert.equal(shownRows(action.card, 'data-tactical'), 0);
    assert.equal(hiddenRows(action.card, 'data-on-map'), 0);
});

test('a Classic game with one Tactical map sets its turn order', () => {
    const system = { reactorBattle: { mode: 'classic', turns: 'team' } };
    const { field, card } = battles(system, { window: { reactor: { eventManager: { currentMap: mapWith('<battle mode: tactical>') } } } });
    assert.equal(field('.system-battle-turns').hidden, false, 'the row is there to set');
    field('.system-battle-turns').choose('initiative');
    assert.deepEqual(plain(system.reactorBattle), { mode: 'classic', turns: 'initiative' });
    // The game: Classic by itself, Tactical with initiative order on that map.
    const world = fightWorld({ system: plain(system), mapNote: '<battle mode: tactical>' });
    assert.equal(world.ReactorFight.resolveTurns(), 'initiative');
    assert.equal(world.ReactorFight.resolveMode(1), 'tactical');
    // The line under the heading says why the rows are there; it goes when the game itself is Tactical.
    const why = card.querySelector('.system-battle-mode-grid [data-tactical-elsewhere]');
    assert.equal(why.hidden, false);
    assert.match(why.textContent, /A map or a command of this game fights Tactical\./);
    field('.system-battle-mode').choose('tactical');
    assert.equal(why.hidden, true);
    assert.equal(hiddenRows(card, 'data-tactical'), 0);
});

test('choosing a mode shows its rows at once and hides them again when nothing else uses them', () => {
    const system = {};
    const { field, card } = battles(system);
    assert.equal(shownRows(card, 'data-tactical') + shownRows(card, 'data-on-map'), 0);
    field('.system-battle-mode').choose('tactical');
    assert.equal(hiddenRows(card, 'data-tactical'), 0);
    assert.equal(hiddenRows(card, 'data-on-map'), 0);
    assert.equal(card.querySelector('.system-battle-mode-grid [data-tactical-elsewhere]').hidden, true, 'the game is Tactical: no reason to give');
    field('.system-battle-mode').choose('action');
    assert.equal(shownRows(card, 'data-tactical'), 0, 'Action has no turn order');
    assert.equal(hiddenRows(card, 'data-on-map'), 0);
    field('.system-battle-mode').choose('classic');
    assert.equal(shownRows(card, 'data-tactical') + shownRows(card, 'data-on-map'), 0);
    assert.equal('reactorBattle' in system, false, 'back to all default stores nothing');
    // What a hidden row holds is kept: a Tactical game's settings survive a visit to Classic.
    const kept = { reactorBattle: { mode: 'tactical', turns: 'initiative', view: 'map' } };
    const second = battles(kept);
    second.field('.system-battle-mode').choose('classic');
    assert.deepEqual(plain(kept.reactorBattle), { mode: 'classic', turns: 'initiative', view: 'map' });
});

test('a map file on disk is read as the open map is, whatever the order or length of a command\'s arguments', async () => {
    const { Editor } = system1();
    const start = args => ({ code: 357, indent: 0, parameters: ['RPGReactor', 'StartMapBattle', 'Start Battle on Map', args] });
    // A Tactical game: a start that names no mode adds nothing there, so each file shows what it names itself.
    const named = async (map, sidecar) => {
        const folder = memoryFolder({ 'Map001.json': map });
        if (sidecar !== undefined) folder.put('Map001.r3d.json', sidecar);
        return (await modesOnDisk(Editor, folder, 'tactical')).filter(mode => mode !== 'tactical');
    };
    const cases = [
        ['a tag in the Note', { note: 'x\n<battle mode: action>', events: [] }, undefined],
        ['the tag as it is typed', { note: '<Battle  Mode : firstPerson >', events: [] }, undefined],
        ['the tag\'s name in capitals', { note: '<BATTLE MODE: action>', events: [] }, undefined],
        ['the tag with a tab and a line break in it', { note: '<battle\tmode:\naction>', events: [] }, undefined],
        ['Classic and a start rule', { note: '<battle mode: classic>\n<battle trigger: 6>', events: [] }, undefined],
        ['two starts', mapWith('', [startBattle('firstPerson'), startBattle('action')]), undefined],
        ['a start that names no mode beside a Change Battle Mode', mapWith('', [startBattle(''), { code: 357, parameters: ['RPGReactor', 'ChangeBattleMode', '', { mode: 'action', scope: 'game' }] }]), undefined],
        ['a 3D sidecar as the editor writes it', mapWith(''), { version: 1, battle: { trigger: 5, mode: 'action' } }],
        ['a sidecar whose battle block has an object before the mode', mapWith(''), { version: 1, battle: { costs: { 7: 2 }, mode: 'action' } }],
        ['a sidecar that says battle somewhere else', mapWith(''), { version: 1, pieces: [{ battle: { mode: 'action' } }] }],
        ['the mode after a text with a closing bracket', mapWith('', [start({ goalText: 'Defeat [the boss]', mode: 'action' })]), undefined],
        ['the mode after a list', mapWith('', [start({ units: [3, 4], mode: 'action' })]), undefined],
        ['the mode after another object', mapWith('', [start({ bgm: { name: 'Battle1', volume: 90 }, mode: 'action' })]), undefined],
        ['the mode after 4100 characters', mapWith('', [start({ goalText: 'x'.repeat(4100), mode: 'action' })]), undefined],
        ['another plugin\'s command', mapWith('', [{ code: 357, indent: 0, parameters: ['Other', 'StartMapBattle', '', { mode: 'action' }] }]), undefined],
        ['the comment line under a command', mapWith('', [{ code: 657, indent: 0, parameters: ['Mode = action'] }]), undefined],
        ['a tag in an event\'s own Note', { note: '', events: [null, { id: 1, note: '<battle mode: action>', pages: [] }] }, undefined],
        ['a tag in a Show Text', mapWith('', [{ code: 401, indent: 0, parameters: ['Type <battle mode: action> in the Note.'] }]), undefined],
        ['a mode the game does not know by that name', mapWith('<battle mode: skirmish>', [startBattle('ACTION')]), { battle: { mode: 'firstperson' } }],
        ['the tag\'s mode in another letter case', mapWith('<battle mode: Action>', []), undefined],
        ['words only', { note: 'a tactical retreat in battle mode', events: [] }, undefined]
    ];
    for (const [name, map, sidecar] of cases) {
        // The file's answer is the open map's: the same map, held in memory with its sidecar.
        const open = Array.from(Editor.modesInUse({ mode: 'tactical', openMap: Object.assign({}, map, sidecar === undefined ? {} : { reactor3d: sidecar }) }))
            .filter(mode => mode !== 'tactical').sort();
        assert.deepEqual(await named(map, sidecar), open, name);
        // ... and written with line breaks and indents it says the same.
        const pretty = memoryFolder({ 'Map001.json': JSON.stringify(map, null, 2) });
        if (sidecar !== undefined) pretty.put('Map001.r3d.json', JSON.stringify(sidecar, null, 4));
        assert.deepEqual((await modesOnDisk(Editor, pretty, 'tactical')).filter(mode => mode !== 'tactical'), open, `${name}, pretty-printed`);
    }
    const said = name => cases.find(one => one[0] === name);
    for (const name of ['a tag in the Note', 'the tag\'s name in capitals', 'the tag with a tab and a line break in it', 'a start that names no mode beside a Change Battle Mode', 'a 3D sidecar as the editor writes it',
        'a sidecar whose battle block has an object before the mode', 'the mode after a text with a closing bracket', 'the mode after a list', 'the mode after another object', 'the mode after 4100 characters']) {
        assert.deepEqual(await named(said(name)[1], said(name)[2]), ['action'], name);
    }
    assert.deepEqual(await named(said('the tag as it is typed')[1]), ['firstPerson']);
    assert.deepEqual(await named(said('the tag\'s mode in another letter case')[1]), ['action'], 'the game reads a tag\'s mode in any letter case');
    assert.deepEqual(await named(said('two starts')[1]), ['action', 'firstPerson']);
    for (const name of ['Classic and a start rule', 'a sidecar that says battle somewhere else', 'another plugin\'s command', 'the comment line under a command', 'a tag in an event\'s own Note', 'a tag in a Show Text',
        'a mode the game does not know by that name', 'words only']) {
        assert.deepEqual(await named(said(name)[1], said(name)[2]), [], name);
    }
    // A file that could say nothing is not parsed; one that is not JSON, or starts with a byte-order mark, is no trouble.
    assert.equal(Editor.fileFacts(JSON.stringify(mapWith('', [{ code: 241, indent: 0, parameters: [{ name: 'Battle1', volume: 90 }] }]))), null, 'a battle theme is no battle');
    assert.equal(Editor.fileFacts('{"battleback1Name":"Grassland","note":"mode"}'), null);
    assert.equal(Editor.fileFacts('<battle mode: action> StartMapBattle {'), null, 'a broken file names nothing');
    assert.equal(Editor.fileFacts(''), null);
    assert.equal(Editor.fileFacts('"StartMapBattle"'), null, 'a text that is no map');
    assert.deepEqual(plain(Editor.fileFacts('﻿' + JSON.stringify({ note: '<battle mode: action>' }))), { own: 'action', named: [], starts: [] });
    assert.deepEqual(plain(Editor.fileFacts('﻿' + JSON.stringify({ battle: { mode: 'action' } }), true)), { own: 'action' });
    assert.equal(Editor.fileFacts(JSON.stringify({ battle: { mode: 'siege' } }), true), null);
    // Of a project's files only those whose text could name a mode or start a battle are parsed.
    let parsed = 0;
    const counting = system1({ JSON: { parse: text => { parsed++; return JSON.parse(text); }, stringify: JSON.stringify } }).Editor;
    const quiet = Object.assign(mapWith('', [{ code: 241, indent: 0, parameters: [{ name: 'Battle1', volume: 90 }] }]), { battleback1Name: 'Grassland', displayName: 'Hard mode' });
    const project = memoryFolder({ 'Map001.json': quiet, 'Map001.r3d.json': { version: 1, pieces: [] }, 'Map002.json': mapWith('', [startBattle('action')]),
        'Map002.r3d.json': { version: 1, battle: { trigger: 5 } }, 'Map003.json': quiet });
    assert.deepEqual(await modesOnDisk(counting, project), ['action']);
    assert.deepEqual(project.reads.slice().sort(), ['Map001.json', 'Map001.r3d.json', 'Map002.json', 'Map002.r3d.json', 'Map003.json']);
    assert.equal(parsed, 2, 'the map with the start and the sidecar with a battle block');
    // A parsed list of commands: the modes named, and the troop of each start that names none.
    const starts = [];
    assert.deepEqual(Array.from(Editor.commandModes([startBattle('tactical'), startBattle('', 4), startBattle('classic'), { code: 357, parameters: ['Other', 'StartMapBattle', '', { mode: 'action' }] },
        { code: 357, parameters: ['RPGReactor', 'ChangeBattleMode', '', { mode: 'default', scope: 'map' }] }], new Set(), starts)), ['tactical']);
    assert.deepEqual(starts, [4, 0], 'a Change Battle Mode starts nothing');
    assert.deepEqual(plain(Editor.mapFacts(mapWith('<battle mode: classic>', [startBattle('action'), startBattle('', 2)]))), { own: 'classic', named: ['action'], starts: [2] });
    assert.deepEqual(plain(Editor.mapFacts(null)), { own: '', named: [], starts: [] });
    assert.equal(Editor.modeName('firstPerson'), 'firstPerson');
    for (const none of ['FIRSTPERSON', 'Tactical', ' tactical', 'retreat', '', null, undefined, 3]) assert.equal(Editor.modeName(none), '', JSON.stringify(none));
});

test('a Start Battle on Map that names no mode counts for the mode the game fights it in', () => {
    const { Editor } = system1();
    const run = (world, troopId, mode) => { try { world.PluginManager.callCommand({ _eventId: 1, setWaitMode() {} }, 'RPGReactor', 'StartMapBattle', { troopId, mode }); } catch (error) { /* no battle */ } };
    /** A battle really started: its mode, or '' when the command starts none on the map. */
    const battleOf = ({ game, note = '', sidecar = null, troop = '', mode = '', troopId = 0 }) => {
        const world = fightWorld({ system: game ? { reactorBattle: { mode: game, turns: 'team' } } : {}, mapNote: note, mapSidecar: sidecar, tactical: true, action: true });
        if (troop) world.$dataTroops[1].reactorBattle = { mode: troop };
        run(world, troopId, mode);
        return world.$gameFight.isActive() && world.ReactorFight.isOnMap(world.$gameFight.mode()) ? world.$gameFight.mode() : '';
    };
    // The many cases below ask one game for the mode it would start the battle in, without starting it.
    const shared = fightWorld({ system: {}, tactical: true, action: true });
    let asked = '';
    shared.$gameFight.start = options => { asked = options && options.mode; return 0; };
    const fought = ({ game, note = '', sidecar = null, troop = '', mode = '', troopId = 0 }) => {
        if (game) shared.$dataSystem.reactorBattle = { mode: game, turns: 'team' }; else delete shared.$dataSystem.reactorBattle;
        shared.$dataMap.note = note;
        if (sidecar) shared.$dataMap.reactor3d = sidecar; else delete shared.$dataMap.reactor3d;
        if (troop) shared.$dataTroops[1].reactorBattle = { mode: troop }; else delete shared.$dataTroops[1].reactorBattle;
        asked = '';
        run(shared, troopId, mode);
        return shared.ReactorFight.isOnMap(asked) ? asked : '';
    };
    for (const one of [{ game: 'classic' }, { game: '' }, { game: 'action' }, { game: 'classic', note: '<battle mode: action>' }, { game: 'tactical', note: '<battle mode: classic>' },
        { game: 'classic', mode: 'firstPerson' }, { game: 'classic', troop: 'action', troopId: 1 }]) {
        assert.equal(fought(one), battleOf(one), `${JSON.stringify(one)}: the mode asked for is the mode of the battle that starts`);
    }
    // The rule itself, against the game as it stands.
    assert.equal(fought({ game: 'classic' }), Editor.START_FALLBACK,
        'where the mode in force is Classic the game no longer fights such a start as the card counts it: set DatabaseSystem1Editor.START_FALLBACK '
        + '(editor/src/database/DatabaseSystem1Editor.js) to what the game fights there, \'\' for no battle on the map');
    assert.ok(Editor.START_FALLBACK === '' || Editor.MAP_MODES.includes(Editor.START_FALLBACK));
    const troops = mode => [{ id: 1, pages: [], reactorBattle: mode ? { mode } : undefined }];
    let fallbacks = 0, inForce = 0;
    for (const game of ['', 'classic', 'tactical', 'action', 'firstPerson']) {
        for (const [note, sidecar] of [['', null], ['<battle mode: classic>', null], ['<battle mode: action>', null], ['<battle mode: tactical>', null], ['<battle mode: action>', { battle: { mode: 'classic' } }], ['', { battle: { mode: 'firstPerson' } }]]) {
            for (const [troop, troopId] of [['', 0], ['classic', 1], ['action', 1], ['action', 0]]) {
                for (const mode of ['', 'classic', 'default', 'Tactical', 'action']) {
                    const said = JSON.stringify({ game, note, sidecar, troop, troopId, mode });
                    const battle = fought({ game, note, sidecar, troop, mode, troopId });
                    const map = Object.assign(mapWith(note, [startBattle(mode, troopId)]), sidecar ? { reactor3d: sidecar } : {});
                    const facts = { mode: game || 'classic', troops: troops(troop) };
                    // What is named somewhere, whatever the command does: the game's mode, the troop's, the map's own, the command's.
                    const namedModes = [game, troop, Editor.mapMode(map), mode].filter(one => Editor.MAP_MODES.includes(one));
                    const expected = Array.from(new Set(namedModes.concat(battle ? [battle] : []))).sort();
                    // The open map, the same map on disk, and the same command in a common event that runs on that map.
                    assert.deepEqual(Array.from(Editor.modesInUse(Object.assign({ openMap: map }, facts))).sort(), expected, `${said}: the open map`);
                    const file = [Object.assign(Editor.fileFacts(JSON.stringify(map)) || { named: [], starts: [] }, { own: Editor.mapMode(map) })];
                    assert.deepEqual(Array.from(Editor.modesInUse(Object.assign({ maps: file }, facts))).sort(), expected, `${said}: the map's file`);
                    if (battle && !namedModes.includes(battle)) fallbacks++;
                    if (battle && !Editor.MAP_MODES.includes(mode)) inForce++;
                }
            }
        }
    }
    assert.ok(Editor.START_FALLBACK ? fallbacks >= 20 : fallbacks === 0, `${fallbacks} starts fought in a mode nothing names`);
    // (90 of the cases since a start that names no mode starts nothing where the mode in force is Classic.)
    assert.ok(inForce >= 80, `the cases do start battles in the mode in force (${inForce})`);
    // A troop page or a common event runs on any map: only the troop and the game are known there.
    const anywhere = (game, list, troop) => Array.from(Editor.modesInUse({ mode: game, troops: troops(troop), commonEvents: [{ id: 1, list }] })).sort();
    assert.deepEqual(anywhere('classic', [startBattle('')]), Editor.START_FALLBACK ? [Editor.START_FALLBACK] : []);
    assert.deepEqual(anywhere('action', [startBattle('')]), ['action']);
    assert.deepEqual(anywhere('classic', [startBattle('', 1)], 'action'), ['action'], 'the start\'s own troop fights Action');
    assert.deepEqual(anywhere('classic', [startBattle('', 2)], 'action').includes('action'), true);
    assert.deepEqual(Array.from(Editor.modesInUse({ mode: 'classic', troops: [{ id: 1, pages: [{ list: [startBattle('')] }] }] })), Editor.START_FALLBACK ? [Editor.START_FALLBACK] : [], 'a troop page');
    // The card: a Classic game whose one battle on the map names no mode shows the rows of the battle it will fight.
    const card = battles({}, { window: { reactor: { eventManager: { currentMap: mapWith('', [startBattle('')]) } } } }).card;
    assert.equal(shownRows(card, 'data-on-map') > 0, !!Editor.START_FALLBACK);
    assert.equal(shownRows(card, 'data-tactical') > 0, Editor.START_FALLBACK === 'tactical');
    assert.equal(card.querySelector('.system-battle-mode-grid [data-tactical-elsewhere]').hidden, Editor.START_FALLBACK !== 'tactical');
});

test('the card reads a map\'s own mode and a command\'s mode as the game reads them', async () => {
    const { Editor } = system1();
    const world = fightWorld({ system: {}, tactical: true });
    const F = world.ReactorFight;
    const notes = ['', '<battle mode: tactical>', '<BATTLE MODE: tactical>', '<Battle  Mode : tactical >', '<battle mode: TACTICAL>', '<battle mode: Tactical>',
        '<battle mode: firstPerson>', '<battle mode: firstperson>', '<battle mode: action>\n<battle mode: tactical>', '<battle mode: Tactical>\n<battle mode: tactical>',
        '<battle mode: classic>', 'a tactical retreat', '<battlemode:action>', '<battle\tmode:\ntactical>', null];
    const sidecars = [undefined, {}, { battle: {} }, { battle: { mode: 'tactical' } }, { battle: { mode: 'Tactical' } }, { battle: { mode: 'classic' } }, { battle: { mode: 'firstPerson' } }];
    let onMap = 0;
    for (const note of notes) for (const reactor3d of sidecars) {
        const map = { note, reactor3d, events: [] }, said = JSON.stringify(map);
        const game = F.mapMode(map);
        assert.equal(Editor.mapMode(map), game, `${said}: the map's own mode`);
        assert.deepEqual(Array.from(Editor.modesInUse({ mode: 'classic', openMap: map })), F.isOnMap(game) ? [game] : [], `${said}: what the open map adds`);
        // Its files on disk say the same, whichever of the two is read first.
        for (const order of [['Map001.json', 'Map001.r3d.json'], ['Map001.r3d.json', 'Map001.json']]) {
            const folder = memoryFolder();
            for (const file of order) {
                if (file === 'Map001.json') folder.put(file, { note, events: [] });
                else if (reactor3d !== undefined) folder.put(file, reactor3d);
            }
            assert.deepEqual(await modesOnDisk(Editor, folder), F.isOnMap(game) ? [game] : [], `${said}: the map's files, ${order[0]} first`);
        }
        if (F.isOnMap(game)) onMap++;
    }
    assert.ok(onMap >= 20, 'the cases do name modes');
    assert.equal(Editor.mapMode(null), '');
    // A command: Change Battle Mode sets the mode the game then fights in; Start Battle on Map fights in the mode it names.
    for (const mode of ['tactical', 'action', 'firstPerson', 'classic', 'Tactical', 'TACTICAL', 'firstperson', 'default', '', undefined]) {
        const changed = fightWorld({ system: {}, tactical: true });
        changed.PluginManager.callCommand({ _eventId: 1, setWaitMode() {} }, 'RPGReactor', 'ChangeBattleMode', { mode, scope: 'game' });
        const game = changed.ReactorFight.resolveMode(1);
        const command = name => ({ code: 357, indent: 0, parameters: ['RPGReactor', name, '', { mode, troopId: 0 }] });
        assert.deepEqual(Array.from(Editor.commandModes([command('ChangeBattleMode')])), F.isOnMap(game) ? [game] : [], `Change Battle Mode ${JSON.stringify(mode)}`);
        assert.deepEqual(await modesOnDisk(Editor, memoryFolder({ 'Map001.json': mapWith('', [command('ChangeBattleMode')]) })), F.isOnMap(game) ? [game] : [], `the same command in a map file`);
        // Start Battle on Map names the mode it fights in (one that names none: the test after the next).
        assert.deepEqual(Array.from(Editor.commandModes([command('StartMapBattle')])), F.isOnMap(mode) ? [mode] : [], `Start Battle on Map ${JSON.stringify(mode)}`);
    }
});

test('the web edition reads no disk, and a scan that ends after a change of project marks nothing', async () => {
    const host = { web: true };
    assert.equal(system1({ process, require, window: { RPGReactorWebHost: host, RPGReactorHost: host } }).Editor.nodeFiles(), null, 'the web host has no disk of the user\'s');
    const desktop = system1({ process, require }).Editor.nodeFiles();
    assert.ok(desktop && typeof desktop.fs.promises.readdir === 'function' && typeof desktop.path.join === 'function', 'a desktop reads the project folder');
    assert.equal(system1().Editor.nodeFiles(), null, 'no Node, no disk');
    // The first project's files are still being read when another project is opened, read, and found to fight Tactical.
    const { Editor, editor } = system1();
    let project = '/first';
    const finish = {};
    editor.projectManager = { getCurrentProject: () => ({ path: project }) };
    Editor.readMapModes = folder => new Promise(resolve => { finish[folder] = resolve; });
    const first = page(editor.createBattlesSection({}).innerHTML);
    editor.wireBattles(first, {});
    project = '/second';
    const card = page(editor.createBattlesSection({}).innerHTML);
    editor.wireBattles(card, {});
    assert.deepEqual(Object.keys(finish), ['/first/data', '/second/data'], 'each project\'s maps are read');
    finish['/second/data']([{ own: 'tactical' }]);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(hiddenRows(card, 'data-tactical'), 0, 'the second project fights Tactical');
    finish['/first/data']([]);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(hiddenRows(page(editor.createBattlesSection({}).innerHTML), 'data-tactical'), 0, 'what the first project\'s maps said, arriving late, takes nothing from the second');
    // And a first project that fights Tactical tells the second nothing.
    const other = system1();
    let open = '/first', late;
    other.editor.projectManager = { getCurrentProject: () => ({ path: open }) };
    other.Editor.readMapModes = () => new Promise(resolve => { late = resolve; });
    other.editor.wireBattles(page(other.editor.createBattlesSection({}).innerHTML), {});
    open = '/second';
    late([{ own: 'tactical' }]);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(shownRows(page(other.editor.createBattlesSection({}).innerHTML), 'data-tactical'), 0, 'the second project is not told what the first one\'s maps said');
    // What a project's files said while it was open is not shown for the next project, whose files are still being read.
    const kept = system1();
    let now = '/first';
    kept.editor.projectManager = { getCurrentProject: () => ({ path: now }) };
    kept.Editor.readMapModes = folder => (folder === '/first/data' ? Promise.resolve([{ own: 'tactical' }]) : new Promise(() => {}));
    const firstCard = page(kept.editor.createBattlesSection({}).innerHTML);
    kept.editor.wireBattles(firstCard, {});
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(hiddenRows(firstCard, 'data-tactical'), 0, 'the first project fights Tactical');
    now = '/second';
    const nextCard = page(kept.editor.createBattlesSection({}).innerHTML);
    kept.editor.wireBattles(nextCard, {});
    assert.equal(shownRows(nextCard, 'data-tactical'), 0, 'the second project is drawn without the first one\'s answer');
    // With the project unchanged the same answer does show.
    project = '/first';
    const again = system1();
    again.editor.projectManager = { getCurrentProject: () => ({ path: '/first' }) };
    again.Editor.readMapModes = async () => [{ named: ['tactical'] }];
    const shown = page(again.editor.createBattlesSection({}).innerHTML);
    again.editor.wireBattles(shown, {});
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(hiddenRows(shown, 'data-tactical'), 0);
});

test('the map files are scanned once per Database session and read again only when they change', async () => {
    const { Editor, editor } = system1();
    const files = {
        '/game/data/Map001.json': { text: JSON.stringify(mapWith('')), mtimeMs: 1 },
        '/game/data/Map002.json': { text: JSON.stringify(mapWith('', [startBattle('tactical')])), mtimeMs: 1 },
        '/game/data/Map002.r3d.json': { text: JSON.stringify({ battle: { mode: 'action' } }), mtimeMs: 1 },
        '/game/data/System.json': { text: '{"reactorBattle":{"mode":"firstPerson"}}', mtimeMs: 1 }
    };
    const reads = [];
    const node = { path: { join: (...parts) => parts.join('/') }, fs: { promises: {
        readdir: async () => Object.keys(files).map(file => file.split('/').pop()),
        stat: async file => ({ mtimeMs: files[file].mtimeMs, size: files[file].text.length }),
        readFile: async file => { reads.push(file.split('/').pop()); return files[file].text; }
    } } };
    const inUse = async () => Array.from(Editor.modesInUse({ mode: 'classic', maps: await Editor.readMapModes('/game/data', node) })).sort();
    assert.deepEqual(plain(await Editor.readMapModes('/game/data', node)), [{ own: 'action', named: ['tactical'], starts: [] }], 'one answer per map that says something: Map002, with its sidecar\'s mode');
    assert.deepEqual(await inUse(), ['action', 'tactical']);
    assert.deepEqual(reads.sort(), ['Map001.json', 'Map002.json', 'Map002.r3d.json'], 'only the maps and their sidecars');
    reads.length = 0;
    assert.deepEqual(await inUse(), ['action', 'tactical']);
    assert.deepEqual(reads, [], 'nothing changed: nothing is read');
    files['/game/data/Map002.json'] = { text: JSON.stringify(mapWith('')), mtimeMs: 2 };
    assert.deepEqual(await inUse(), ['action']);
    assert.deepEqual(reads, ['Map002.json']);
    assert.equal(await Editor.readMapModes('/game/data', null), null, 'the web edition has no disk to read');
    assert.deepEqual(plain(await Editor.readMapModes('/game/data', { path: node.path, fs: { promises: { readdir: async () => { throw new Error('no folder'); } } } })), [], 'a project with no data folder names nothing');
    // The page: a find shows the rows of a card already on screen, and the session is scanned once.
    let scans = 0;
    Editor.readMapModes = async () => { scans++; return [{ own: '', named: ['tactical'], starts: [] }]; };
    const card = page(editor.createBattlesSection({}).innerHTML);
    assert.equal(shownRows(card, 'data-tactical'), 0, 'before the files are read');
    editor.wireBattles(card, {});
    editor.wireBattles(card, {});
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(scans, 1);
    assert.equal(hiddenRows(card, 'data-tactical'), 0, 'a map on disk fights Tactical');
    assert.equal(card.querySelector('.system-battle-mode-grid [data-tactical-elsewhere]').hidden, false);
    // The page drawn again in the same session knows at once; the next session looks again.
    assert.equal(hiddenRows(page(editor.createBattlesSection({}).innerHTML), 'data-tactical'), 0);
    editor.parentEditor._databaseSession = 2;
    editor.wireBattles(card, {});
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(scans, 2);
});

//-----------------------------------------------------------------------------
// What the card stores.

test('the card writes System.json as the game reads it and keeps what is not its own', () => {
    const system = { reactorBattle: { mode: 'classic', turns: 'team', terms: { wait: 'Hold' }, partySize: 6, custom: { any: 1 } } };
    const { field, editor } = battles(system);
    field('.system-battle-mode').choose('tactical');
    field('.system-battle-turns').choose('initiative');
    field('.system-battle-view').choose('map');
    field('.system-battle-cinematic').choose('every');
    field('.system-battle-slowmo').choose(false);
    field('.system-battle-pace').choose('fast');
    field('.system-battle-revive').choose(false);
    assert.deepEqual(plain(system.reactorBattle), {
        mode: 'tactical', turns: 'initiative', terms: { wait: 'Hold' }, partySize: 6, custom: { any: 1 },
        view: 'map', cinematic: { level: 'every', slowMotion: false }, pace: 'fast', reviveAfterBattle: false
    });
    assert.equal(editor.databaseManager.mutationGeneration, 7);
    // The game reads every one of them.
    const world = fightWorld({ system: plain(system), tactical: true });
    const F = world.ReactorFight;
    assert.equal(F.resolveMode(1), 'tactical');
    assert.equal(F.resolveTurns(), 'initiative');
    assert.equal(F.systemSettings().view, 'map');
    assert.equal(F.pace(), 'fast', 'what a new player starts with');
    assert.equal(F.systemSettings().reviveAfterBattle, false);
    assert.equal(F.term('wait'), 'Hold');
    // Each back to its default stores nothing of the card's; the rest stays.
    field('.system-battle-mode').choose('classic');
    field('.system-battle-turns').choose('team');
    field('.system-battle-view').choose('isometric');
    field('.system-battle-cinematic').choose('some');
    field('.system-battle-slowmo').choose(true);
    field('.system-battle-pace').choose('normal');
    field('.system-battle-revive').choose(true);
    assert.deepEqual(plain(system.reactorBattle), { mode: 'classic', turns: 'team', terms: { wait: 'Hold' }, partySize: 6, custom: { any: 1 } });
    // With nothing else stored the key goes.
    const bare = { reactorBattle: { mode: 'action', turns: 'team' } };
    battles(bare).field('.system-battle-mode').choose('classic');
    assert.equal('reactorBattle' in bare, false);
    // A camera that cannot be skipped is a hand-written setting: the card keeps it.
    const skip = { reactorBattle: { mode: 'tactical', turns: 'team', cinematic: { level: 'some', slowMotion: true, skip: false } } };
    battles(skip).field('.system-battle-view').choose('map');
    assert.deepEqual(plain(skip.reactorBattle.cinematic), { level: 'some', slowMotion: true, skip: false });
});

test('the card shows every stored setting, and touching one control loses none of the others', () => {
    const stored = { optSideView: true, battleSystem: 1,
        reactorBattle: { mode: 'firstPerson', turns: 'initiative', view: 'map', cinematic: { level: 'every', slowMotion: false }, pace: 'fast', reviveAfterBattle: false } };
    const before = plain(stored);
    const { field } = battles(stored);
    assert.equal(field('.system-battle-mode').value, 'firstPerson');
    assert.equal(field('.system-battle-screen').value, 'side');
    assert.equal(field('.system-battle-system').value, '1', 'Time progress (active)');
    assert.equal(field('.system-battle-turns').value, 'initiative');
    assert.equal(field('.system-battle-view').value, 'map');
    assert.equal(field('.system-battle-cinematic').value, 'every');
    assert.equal(field('.system-battle-slowmo').checked, false);
    assert.equal(field('.system-battle-pace').value, 'fast');
    assert.equal(field('.system-battle-revive').checked, false);
    // Each control told to store what it shows leaves the file as it was.
    for (const selector of ['.system-battle-mode', '.system-battle-screen', '.system-battle-system', '.system-battle-turns', '.system-battle-view', '.system-battle-cinematic', '.system-battle-slowmo', '.system-battle-pace', '.system-battle-revive']) {
        field(selector).fire('change');
        assert.deepEqual(plain(stored), before, `${selector} kept every stored setting`);
    }
    // The other stored values of each list.
    const other = { battleSystem: 2, reactorBattle: { mode: 'action', turns: 'team', cinematic: { level: 'off', slowMotion: true }, pace: 'skip' } };
    const second = battles(other);
    assert.equal(second.field('.system-battle-mode').value, 'action');
    assert.equal(second.field('.system-battle-system').value, '2');
    assert.equal(second.field('.system-battle-cinematic').value, 'off');
    assert.equal(second.field('.system-battle-slowmo').checked, true);
    assert.equal(second.field('.system-battle-pace').value, 'skip');
    assert.equal(second.field('.system-battle-revive').checked, true);
    // A mode the game does not know by that name is Classic in the game, and on the card.
    for (const mode of ['Tactical', 'TACTICAL', 'firstperson', 'siege', 7]) {
        const system = { reactorBattle: { mode, turns: 'team' } };
        assert.equal(battles(system).field('.system-battle-mode').value, fightWorld({ system: plain(system) }).ReactorFight.resolveMode(1), JSON.stringify(mode));
    }
});

test('a control set and set back leaves System.json reading as the Database found it, whatever the project stored', () => {
    // The Database asks before it drops changes by comparing its data, as text, with what it opened: after a change
    // that was taken back the text must be the same, the place of every key included.
    const choices = { '.system-battle-mode': ['classic', 'tactical', 'action', 'firstPerson'], '.system-battle-turns': ['team', 'initiative'], '.system-battle-view': ['isometric', 'map'],
        '.system-battle-cinematic': ['some', 'off', 'every'], '.system-battle-slowmo': [true, false], '.system-battle-pace': ['normal', 'fast', 'skip'], '.system-battle-revive': [true, false] };
    const shown = field => (field.attributes.type === 'checkbox' ? field.checked : field.value);
    const forms = [
        { mode: 'classic', turns: 'team' }, { turns: 'team', mode: 'classic' }, { mode: 'classic' }, { turns: 'team' }, {}, undefined,
        { mode: 'tactical', turns: 'initiative' },
        { pace: 'fast', view: 'map', mode: 'tactical', turns: 'team', cinematic: { slowMotion: false, level: 'every' }, reviveAfterBattle: false, terms: { wait: 'Hold', auto: 'Go' }, partySize: 6 },
        { mode: 'action', turns: 'team', cinematic: { level: 'some', slowMotion: true, skip: false }, custom: { b: 1, a: 2 } }
    ];
    for (const stored of forms) {
        // The settings stand among System's other keys, as in a real file.
        const system = Object.assign({ gameTitle: 'Game', maxBattleMembers: 5 }, stored === undefined ? {} : { reactorBattle: plain(stored) }, { reactorVictoryInterfaceId: 9, versionId: 1 });
        const before = JSON.stringify(system);
        const loaded = battles(system);
        const set = (selector, value) => loaded.field(selector).choose(value);
        for (const [selector, values] of Object.entries(choices)) {
            const was = shown(loaded.field(selector)), other = values.find(value => value !== was);
            loaded.field(selector).fire('change');
            assert.equal(JSON.stringify(system), before, `${before}: ${selector} told to store what it shows`);
            set(selector, other);
            assert.notEqual(JSON.stringify(system), before, `${before}: ${selector} changed`);
            set(selector, was);
            assert.equal(JSON.stringify(system), before, `${before}: ${selector} set back`);
        }
        // Every control changed, then each set back, the last changed first.
        const was = Object.fromEntries(Object.keys(choices).map(selector => [selector, shown(loaded.field(selector))]));
        for (const [selector, values] of Object.entries(choices)) set(selector, values.find(value => value !== was[selector]));
        assert.notEqual(JSON.stringify(system), before);
        for (const selector of Object.keys(choices).reverse()) set(selector, was[selector]);
        assert.equal(JSON.stringify(system), before, `${before}: all changed and all set back`);
        // The page left and shown again in the same Database session, with a change in between.
        set('.system-battle-mode', choices['.system-battle-mode'].find(value => value !== was['.system-battle-mode']));
        const again = page(loaded.editor.createBattlesSection(system).innerHTML);
        loaded.editor.wireBattles(again, system);
        again.querySelector('.system-battle-mode').choose(was['.system-battle-mode']);
        assert.equal(JSON.stringify(system), before, `${before}: set back on the page shown again`);
        // What the game reads is what was stored.
        assert.equal(fightWorld({ system: plain(system) }).ReactorFight.resolveMode(1), (stored && stored.mode) || 'classic');
    }
    // The words on Terms: a word cleared and typed again, a first word typed and cleared, the only word cleared and typed again.
    const Shell = shell();
    for (const stored of [{ mode: 'tactical', turns: 'team', terms: { wait: 'Hold', auto: 'Go', endTurnAsk: 'Done?\nReally?' } }, { terms: { wait: 'Hold' } }, { mode: 'classic', turns: 'team' }, undefined]) {
        const system = Object.assign({ gameTitle: 'Game' }, stored === undefined ? {} : { reactorBattle: plain(stored) }, { reactorVictoryInterfaceId: 9 });
        const before = JSON.stringify(system);
        const ui = Object.create(Shell.prototype);
        ui.databaseManager = { mutationGeneration: 0 };
        ui.system1Editor = system1().editor;
        const had = stored && stored.terms && stored.terms.wait;
        ui.setBattleWord(system, 'wait', had ? '' : 'Hold');
        assert.notEqual(JSON.stringify(system), before, `${before}: a word changed`);
        ui.setBattleWord(system, 'wait', had ? 'Wai' : 'Hol');
        ui.setBattleWord(system, 'wait', had || '');
        assert.equal(JSON.stringify(system), before, `${before}: the word as it was`);
        if (stored && stored.terms && stored.terms.endTurnAsk) {
            ui.setBattleWord(system, 'endTurnAsk', '');
            ui.setBattleWord(system, 'endTurnAsk', 'Done?\\nReally?');
            assert.equal(JSON.stringify(system), before, 'a two-line word cleared and typed again');
        }
    }
    // The party size: Use Existing Limit, then the number that was there.
    const sized = { gameTitle: 'Game', maxBattleMembers: 5, reactorBattle: { mode: 'tactical', turns: 'team' }, versionId: 1 };
    const sizedBefore = JSON.stringify(sized);
    const party = system1().editor;
    party.setPartyLimit(sized, null);
    assert.notEqual(JSON.stringify(sized), sizedBefore);
    party.setPartyLimit(sized, 5);
    assert.equal(JSON.stringify(sized), sizedBefore, 'Max Battle Members back where it stood');
    // After Apply the saved state is the one to come back to.
    const applied = { gameTitle: 'Game', reactorBattle: { mode: 'tactical', turns: 'team', view: 'map', pace: 'fast' }, versionId: 1 };
    const live = battles(applied);
    live.editor.parentEditor._dataSnapshot = 'opened';
    live.field('.system-battle-turns').choose('initiative');
    live.editor.parentEditor._dataSnapshot = 'applied';
    const saved = JSON.stringify(applied);
    live.field('.system-battle-view').choose('isometric');
    assert.notEqual(JSON.stringify(applied), saved);
    live.field('.system-battle-view').choose('map');
    assert.equal(JSON.stringify(applied), saved, 'set and set back after Apply reads as what Apply saved');
    live.field('.system-battle-turns').choose('team');
    assert.notEqual(JSON.stringify(applied), saved, 'and the state before Apply is a change now');
    // A key the session did not find stays after the ones it found, where it was added.
    const grown = { gameTitle: 'Game', reactorBattle: { mode: 'tactical', turns: 'team' }, versionId: 1 };
    const growing = battles(grown);
    growing.editor.setPartyLimit(grown, 3);
    growing.field('.system-battle-mode').choose('classic');
    growing.field('.system-battle-mode').choose('tactical');
    assert.deepEqual(Object.keys(grown), ['gameTitle', 'reactorBattle', 'versionId', 'maxBattleMembers']);
    assert.equal(JSON.stringify(grown), '{"gameTitle":"Game","reactorBattle":{"mode":"tactical","turns":"team"},"versionId":1,"maxBattleMembers":3}');
    // The next Database session starts from what is stored then.
    const system = { reactorBattle: { mode: 'classic', turns: 'team' }, versionId: 1 };
    const first = battles(system);
    first.field('.system-battle-mode').choose('tactical');
    first.editor.parentEditor._databaseSession = 2;
    const second = page(first.editor.createBattlesSection(system).innerHTML);
    first.editor.wireBattles(second, system);
    second.querySelector('.system-battle-mode').choose('classic');
    assert.equal('reactorBattle' in system, false, 'a game that stored Tactical and goes back to Classic stores nothing');
    // Settings that say more than the defaults are not "the defaults as stored".
    const more = { reactorBattle: { mode: 'classic', turns: 'team', pace: 'fast' } };
    battles(more).field('.system-battle-pace').choose('normal');
    assert.equal('reactorBattle' in more, false);
    // Another System (the data put back by Cancel, another project) is asked for itself, whatever the session says.
    const shared = system1().editor;
    const one = { reactorBattle: { mode: 'classic', turns: 'team' } }, other = {};
    const oneCard = page(shared.createBattlesSection(one).innerHTML);
    shared.wireBattles(oneCard, one);
    oneCard.querySelector('.system-battle-mode').fire('change');
    const otherCard = page(shared.createBattlesSection(other).innerHTML);
    shared.wireBattles(otherCard, other);
    otherCard.querySelector('.system-battle-mode').choose('tactical');
    otherCard.querySelector('.system-battle-mode').choose('classic');
    assert.equal('reactorBattle' in other, false, 'what the first stored is not written into the second');
    // Two values that say the same read the same, whatever the order of their keys.
    const E = system1().Editor;
    assert.equal(E.canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } }), E.canonical({ a: { c: 3, d: [2, { y: 2, z: 1 }] }, b: 1 }));
    assert.notEqual(E.canonical({ a: [1, 2] }), E.canonical({ a: [2, 1] }), 'a list keeps its order');
    assert.notEqual(E.canonical({ a: 1 }), E.canonical({ a: '1' }));
});

test('the fallen get up after a win unless the checkbox says otherwise, and the game agrees', () => {
    const system = { reactorBattle: { mode: 'action', turns: 'team', reviveAfterBattle: false } };
    const { field, card } = battles(system);
    assert.equal(field('.system-battle-revive').checked, false, 'the stored setting');
    assert.equal(hiddenRows(card, 'data-on-map'), 0, 'shown in a game that fights on the map');
    assert.equal(card.querySelector('.system-battle-check[data-on-map]').textContent.trim(), 'The fallen get up after a win');
    field('.system-battle-revive').choose(true);
    assert.equal('reviveAfterBattle' in system.reactorBattle, false, 'getting up is the absence of the key');
    assert.notEqual(fightWorld({ system: plain(system) }).ReactorFight.systemSettings().reviveAfterBattle, false);
    assert.match(fs.readFileSync(path.join(runtimeRoot, 'reactor_fight.js'), 'utf8'), /systemSettings\(\)\.reviveAfterBattle !== false/, 'the key the game reads');
});

//-----------------------------------------------------------------------------
// One party-size number.

/**
 * How many of the party fight in the game, loaded in the game's order: the
 * runtime, then the plugins (a party plugin replaces the party's count with
 * its own limit), then the battle presentation's limit.
 */
function partyInGame(system, pluginLimit = 0) {
    const world = fightWorld({ system: plain(system) });
    for (const file of ['reactor_battle_data.js', 'reactor_battle_presentation.js']) vm.runInContext(fs.readFileSync(path.join(runtimeRoot, file), 'utf8'), world, { filename: file });
    if (pluginLimit) vm.runInContext(`Game_Party.prototype.maxBattleMembers = function() { return ${pluginLimit}; };`, world);
    world.ReactorBattlePresentation.installPartyLimit();
    return world.$gameParty.maxBattleMembers();
}

test('with a party plugin on, Max Battle Members shows the plugin\'s limit: a stored party size is not what the game uses', () => {
    const { Editor, editor } = system1();
    const BattleData = require(path.join(runtimeRoot, 'reactor_battle_data.js'));
    const limitOf = BattleData.maxBattleMembers || globalThis.ReactorBattleData.maxBattleMembers;
    const manager = editor.databaseManager;
    manager.data = {};
    manager.getPluginManifest = function() { return this.plugins; };
    manager.getMaxBattleMembers = function() { return limitOf(this.data.system, this.plugins); };
    const plugin = (status = true, name = 'PSYCHRONIC_PartySystemMZ', key = 'maxBattleMembers') => ({ name, status, parameters: { [key]: '7' } });
    const shows = (system, plugins) => { manager.data.system = system; manager.plugins = plugins; return editor.partyLimit(system); };
    for (const system of [{}, { reactorBattle: { partySize: 6 } }, { maxBattleMembers: 5 }, { maxBattleMembers: 5, reactorBattle: { partySize: 3 } }]) {
        const said = JSON.stringify(system);
        assert.equal(shows(system, [plugin()]), partyInGame(system, 7), `${said} with the plugin on: the field shows the game's number`);
        assert.equal(shows(system, [plugin(false)]), partyInGame(system), `${said} with the plugin off`);
        assert.equal(shows(system, [{ name: 'Other', status: true, parameters: { maxBattleMembers: '9' } }]), partyInGame(system), `${said} with another plugin`);
    }
    assert.equal(shows({ reactorBattle: { partySize: 6 } }, [plugin()]), 7, 'the plugin\'s limit, not the stored 6');
    assert.equal(editor.partyLimitSource({ reactorBattle: { partySize: 6 } }), 'plugin');
    assert.equal(shows({ reactorBattle: { partySize: 6 } }, []), 6);
    assert.equal(editor.partyLimitSource({ reactorBattle: { partySize: 6 } }), 'stored');
    assert.equal(editor.partyLimitSource({ maxBattleMembers: 3 }), 'set');
    assert.equal(editor.partyLimitSource({}), 'stock');
    assert.equal(editor.partyLimitSource({ maxBattleMembers: 0 }), 'stock', 'a number the game does not take is not a set one');
    // The party plugins the editor knows are the ones the shared limit rule reads a number from, each by its own parameter.
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_battle_data.js'), 'utf8');
    const known = /const keys = \{([^}]+)\}/.exec(source);
    assert.ok(known, 'the shared rule names its party plugins');
    const named = Array.from(known[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g), found => [found[1], found[2]]);
    assert.deepEqual(named.map(pair => pair[0]).sort(), plain(Editor.PARTY_PLUGINS).sort());
    for (const [name, key] of named) {
        assert.equal(limitOf({}, [plugin(true, name, key)]), 7, `${name} sets the limit`);
        assert.equal(Editor.hasPartyPlugin([plugin(true, name, key)]), true);
        assert.equal(Editor.hasPartyPlugin([plugin(false, name, key)]), false);
    }
    assert.equal(Editor.hasPartyPlugin(null), false);
});

test('the Max Battle Members field stores the number typed, the one shown too, and Use Existing Limit clears both numbers', () => {
    const { editor } = system1();
    const manager = editor.databaseManager;
    manager.plugins = [];
    manager.getPluginManifest = function() { return this.plugins; };
    manager.getMaxBattleMembers = function() { return this.plugins.length ? 7 : 4; };
    const draw = system => {
        const row = page('<input id="system-max-battle-members" type="number" value="0"><button id="system-party-limit-reset"></button><p id="system-party-limit-hint"></p>');
        editor.wirePartyLimit(row, system);
        const field = row.querySelector('#system-max-battle-members');
        return { field, hint: row.querySelector('#system-party-limit-hint'), reset: row.querySelector('#system-party-limit-reset'),
            /** Type a number and leave the field. A field tells of a change only when the number is another one. */
            type(text) { const shown = String(field.value); field.value = text; field.fire('input'); if (String(text) !== shown) field.fire('change'); field.fire('blur'); } };
    };
    const OWN = 'Maximum actors in battle. Additional party members are reserves.', EXISTING = 'Using the existing party limit. Edit to set the database limit.';
    // A stored size: shown, and typing another number leaves one number.
    const stored = { reactorBattle: { mode: 'tactical', turns: 'team', partySize: 6 } };
    let row = draw(stored);
    assert.equal(String(row.field.value), '6');
    assert.equal(row.hint.textContent, OWN, 'a stored size is the project\'s own number');
    row.type('5');
    assert.equal(stored.maxBattleMembers, 5);
    assert.deepEqual(plain(stored.reactorBattle), { mode: 'tactical', turns: 'team' }, 'the stored size went with it');
    assert.equal(String(row.field.value), '5');
    // Typing the number shown stores it.
    const same = { reactorBattle: { partySize: 6 } };
    row = draw(same);
    row.type('6');
    assert.deepEqual(plain(same), { maxBattleMembers: 6 }, 'the number shown, typed, is the database\'s number now');
    // Leaving the field without typing stores nothing.
    const untouched = { reactorBattle: { partySize: 6 } };
    row = draw(untouched);
    row.field.fire('blur');
    assert.deepEqual(plain(untouched), { reactorBattle: { partySize: 6 } });
    // A number the game does not take is not stored, and the field shows the game's number again.
    const kept = { maxBattleMembers: 3 };
    row = draw(kept);
    for (const bad of ['0', '100', '3.5', '', '-2']) { row.type(bad); assert.equal(kept.maxBattleMembers, 3, JSON.stringify(bad)); assert.equal(String(row.field.value), '3'); }
    // Use Existing Limit: neither number stays.
    const both = { maxBattleMembers: 9, reactorBattle: { mode: 'action', turns: 'team', partySize: 6 } };
    row = draw(both);
    assert.equal(row.hint.textContent, OWN);
    row.reset.fire('click');
    assert.deepEqual(plain(both), { reactorBattle: { mode: 'action', turns: 'team' } });
    assert.equal(String(row.field.value), '4');
    assert.equal(row.hint.textContent, EXISTING);
    // With a party plugin on, a stored size is not the number: the plugin's shows, as an existing limit; typing it sets the database's.
    manager.plugins = [{ name: 'PSYCHRONIC_PartySystemMZ', status: true, parameters: { maxBattleMembers: '7' } }];
    const plugged = { reactorBattle: { partySize: 6 } };
    row = draw(plugged);
    assert.equal(String(row.field.value), '7');
    assert.equal(row.hint.textContent, EXISTING);
    row.type('7');
    assert.deepEqual(plain(plugged), { maxBattleMembers: 7 });
    assert.equal(row.hint.textContent, OWN);
    assert.ok(manager.mutationGeneration >= 4, 'the Database knows each change');
    // The page wires the field through this function.
    const source = read('src/database/DatabaseSystem1Editor.js');
    assert.match(source, /this\.wirePartyLimit\(container, system\);/);
    assert.match(source, /<p id="system-party-limit-hint"/);
    assert.match(source, /<button id="system-party-limit-reset"/);
});

test('Max Battle Members is the one party-size number, and shows what the game uses', () => {
    const inGame = partyInGame;
    const { Editor, editor } = system1();
    const BattleData = require(path.join(runtimeRoot, 'reactor_battle_data.js'));
    const limitOf = BattleData.maxBattleMembers || globalThis.ReactorBattleData.maxBattleMembers;
    editor.databaseManager.data = {};
    editor.databaseManager.plugins = [];
    editor.databaseManager.getPluginManifest = function() { return this.plugins; };
    editor.databaseManager.getMaxBattleMembers = function() { return limitOf(this.data.system, this.plugins); };
    const shows = system => { editor.databaseManager.data.system = system; return editor.partyLimit(system); };
    for (const system of [{}, { maxBattleMembers: 7 }, { reactorBattle: { partySize: 6 } }, { reactorBattle: { partySize: 3 }, maxBattleMembers: 5 }, { reactorBattle: { partySize: 150 } }, { reactorBattle: { partySize: 0 } }]) {
        assert.equal(shows(system), inGame(system), `${JSON.stringify(system)}: the field shows the game's number`);
    }
    // Setting the number leaves one number: a stored battle party size goes with it.
    const stored = { reactorBattle: { mode: 'tactical', turns: 'team', partySize: 6, terms: { wait: 'Hold' } } };
    assert.equal(shows(stored), 6, 'a stored size is read as before');
    editor.setPartyLimit(stored, 3);
    assert.equal(stored.maxBattleMembers, 3);
    assert.deepEqual(plain(stored.reactorBattle), { mode: 'tactical', turns: 'team', terms: { wait: 'Hold' } });
    assert.equal(shows(stored), 3);
    assert.equal(inGame(stored), 3);
    // Back to the project's own limit: neither is kept, and settings that say nothing more go.
    const only = { maxBattleMembers: 9, reactorBattle: { partySize: 6 } };
    editor.setPartyLimit(only, null);
    assert.deepEqual(plain(only), {});
    assert.equal(shows(only), 4);
    assert.equal(inGame(only), 4);
    assert.ok(editor.databaseManager.mutationGeneration >= 2);
    assert.equal(Editor.storedPartySize({ reactorBattle: { partySize: '8' } }), 8);
    assert.equal(Editor.storedPartySize({ reactorBattle: { partySize: -2 } }), 0);
    // The card's writer never touches a stored size, and the page has one field for the number.
    const source = read('src/database/DatabaseSystem1Editor.js');
    assert.equal((source.match(/type="number"[^>]*system-|id="system-max-battle-members"/g) || []).filter(found => /max-battle-members/.test(found)).length, 1);
    assert.match(source, /value="\$\{this\.partyLimit\(system\)\}"/);
});

//-----------------------------------------------------------------------------
// Save and open Battle Setup.

/** Waits until `done()` holds, however late a busy machine runs its timers; gives up after `limit` ms. */
async function until(done, limit = 5000) {
    const end = Date.now() + limit;
    while (!done() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 2));
}

function databaseWindow({ saves = true } = {}) {
    const log = [];
    const viewer = { active: true, classList: { contains: name => name === 'active' && viewer.active } };
    const ok = { onclick: async () => { log.push('ok'); await new Promise(resolve => setTimeout(resolve, 1)); if (saves) { log.push('saved'); viewer.active = false; } else log.push('save failed'); } };
    const document = { createElement: () => ({ style: {}, className: '', innerHTML: '' }), getElementById: id => (id === 'database-viewer' ? viewer : id === 'database-ok-btn' ? ok : null), querySelector: () => null };
    const setup = { open() { log.push('card'); return true; }, openAfterDatabase() { log.push('armed'); return true; } };
    return { log, viewer, ok, document, window: { RRBattleSetup: setup, reactor: { eventManager: { currentMap: mapWith('') } } } };
}

test('Save and open Battle Setup saves as OK does, closes the Database and opens the card', async () => {
    const database = databaseWindow();
    const { field, editor } = battles({}, { document: database.document, window: database.window });
    const button = field('.system-battle-setup');
    assert.equal(button.textContent.trim(), 'Save and open Battle Setup', 'it says what it does');
    assert.equal(button.hidden, false, 'in a Classic game too');
    assert.equal(button.disabled, false);
    button.fire('click');
    button.fire('click');
    await until(() => database.log.includes('card'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(database.log, ['ok', 'saved', 'card'], 'one save, then the card, and only after the Database has closed');
    assert.equal(await editor.saveAndOpenBattleSetup(), false, 'the Database is closed: nothing more to do');
    // The Database opened again later: the button saves and opens again.
    database.viewer.active = true;
    button.fire('click');
    await until(() => database.log.length >= 6, 1500);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(database.log, ['ok', 'saved', 'card', 'ok', 'saved', 'card'], 'a second Database session');
    // ... and after a save that failed, the next press tries again.
    const failing = databaseWindow({ saves: false });
    const retry = battles({}, { document: failing.document, window: failing.window });
    assert.equal(await retry.editor.saveAndOpenBattleSetup(), false);
    assert.equal(await retry.editor.saveAndOpenBattleSetup(), false);
    assert.deepEqual(failing.log, ['ok', 'save failed', 'ok', 'save failed']);
});

test('after Save and open Battle Setup the keyboard is on the card, never on the button that opens the Database', async () => {
    // The closing Database hands the keyboard back to the control that opened it; a key still held would press that
    // control and open the Database over the card.
    const database = databaseWindow();
    const focus = { log: [] };
    const body = { name: 'body' };
    const control = name => ({ name, attributes: {}, focus() { database.document.activeElement = this; focus.log.push(name); }, blur() { if (database.document.activeElement === this) database.document.activeElement = body; },
        hasAttribute(key) { return key in this.attributes; }, setAttribute(key, value) { this.attributes[key] = String(value); } });
    const opener = control('opener'), panel = control('card');
    database.document.body = body;
    database.document.activeElement = body;
    const save = database.ok.onclick;
    const seen = [];
    database.ok.onclick = async () => {
        await save();
        // As the Database's own close does: the keyboard goes back to the opener, and the next key event is on its way.
        opener.focus();
        setTimeout(() => seen.push(database.document.activeElement.name), 0);
    };
    database.window.RRBattleSetup = { _state: {}, open() { database.log.push('card'); this._state.panel = panel; return true; } };
    const { editor, Editor } = battles({}, { document: database.document, window: database.window });
    assert.equal(await editor.saveAndOpenBattleSetup(), true);
    assert.deepEqual(seen, ['body'], 'a key event that arrives before the card opens finds nothing to press');
    assert.equal(database.document.activeElement, panel, 'the keyboard is on the card');
    assert.equal(panel.attributes.tabindex, '-1', 'the card takes the keyboard without joining the Tab order');
    // A card that brings its own way to take the keyboard is asked.
    const own = { asked: 0, focus() { this.asked++; } };
    assert.equal(Editor.focusBattleSetup(own), true);
    assert.equal(own.asked, 1);
    // A card that is not found is no error, and one that already has a place in the Tab order keeps it.
    assert.equal(Editor.focusBattleSetup({}), false);
    const placed = control('placed');
    placed.attributes.tabindex = '0';
    assert.equal(Editor.focusBattleSetup({ _state: { panel: placed } }), true);
    assert.equal(placed.attributes.tabindex, '0');
    // A save that fails moves nothing.
    const failing = databaseWindow({ saves: false });
    failing.document.body = body;
    failing.document.activeElement = opener;
    assert.equal(await battles({}, { document: failing.document, window: failing.window }).editor.saveAndOpenBattleSetup(), false);
    assert.equal(failing.document.activeElement, opener);
});

test('the card does not open when the save fails, nor when the Database is closed by Cancel', async () => {
    const database = databaseWindow({ saves: false });
    const { field, editor } = battles({ reactorBattle: { mode: 'tactical', turns: 'team' } }, { document: database.document, window: database.window });
    assert.equal(await editor.saveAndOpenBattleSetup(), false);
    assert.deepEqual(database.log, ['ok', 'save failed'], 'the Database stayed open: no card');
    // Cancel closes the Database later: nothing was left waiting for it.
    database.viewer.active = false;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(database.log, ['ok', 'save failed']);
    // Choosing a mode and pressing Cancel never reaches the card.
    const second = databaseWindow();
    const page2 = battles({}, { document: second.document, window: second.window });
    page2.field('.system-battle-mode').choose('tactical');
    second.viewer.active = false;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(second.log, []);
    assert.doesNotMatch(read('src/database/DatabaseSystem1Editor.js'), /openAfterDatabase/, 'nothing opens the card on whatever closes the Database');
    assert.ok(field('.system-battle-setup'));
});

test('the button waits for a map: with none open it is off and the line beside it says why', () => {
    const { field, card } = battles({ reactorBattle: { mode: 'action', turns: 'team' } });
    const button = field('.system-battle-setup');
    assert.equal(button.disabled, true);
    const why = card.querySelector('.system-battle-actions .system-battle-setup-why');
    assert.ok(why, 'the reason is on the card, not only in a tooltip');
    assert.equal(why.textContent.trim(), 'Open a map first.');
    assert.equal(why.hidden, false);
    assert.equal(why.getAttribute('data-i18n'), 'db.battles.setupNoMap', 'it follows the editor\'s language');
    assert.equal(button.getAttribute('aria-describedby'), why.getAttribute('id'), 'and is read out with the button');
    assert.equal(button.getAttribute('title'), null, 'one reason, said once');
    // With a map open there is nothing to explain.
    const open = battles({}, { window: { reactor: { eventManager: { currentMap: mapWith('') } } } });
    assert.equal(open.field('.system-battle-setup').disabled, false);
    assert.equal(open.card.querySelector('.system-battle-setup-why'), null);
    assert.equal(open.field('.system-battle-setup').getAttribute('aria-describedby'), null);
});

test('Battle Setup\'s link to the game\'s mode opens System 1 on the Battles card', async () => {
    const opened = [], acts = [];
    const header = { click() { acts.push('unfold'); } };
    const select = { focus() { acts.push('focus'); } };
    const card = { classList: { contains: name => name === 'is-collapsed' }, scrollIntoView() { acts.push('scroll'); }, querySelector: selector => (selector === '.database-section-header' ? header : selector === '.system-battle-mode' ? select : null) };
    const { Editor } = system1({
        window: { reactor: { openDatabase: type => opened.push(type) } },
        document: { createElement: () => ({ style: {} }), getElementById: () => null, querySelector: selector => (selector === '#database-detail .system-battles-card' ? card : null) }
    });
    assert.equal(Editor.openBattles(), true);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(opened, ['system1']);
    assert.deepEqual(acts, ['unfold', 'scroll', 'focus'], 'a folded card is opened, brought into view, its mode list ready');
    assert.equal(system1().Editor.openBattles(), false, 'no editor, nothing to open');
});

//-----------------------------------------------------------------------------
// Terms: the words of battles on the map.

/** Every word the game looks up in System.json reactorBattle.terms, with its stock English. */
function runtimeWords() {
    const world = fightWorld({ tactical: true, action: true });
    const F = world.ReactorFight, words = {};
    // The battle's tables: TERMS and whatever table of words stands beside it (FIELD_TERMS, THREAT_TERMS).
    const tables = Object.keys(F).filter(name => /TERMS$/.test(name) && F[name] && typeof F[name] === 'object');
    for (const name of tables) for (const [key, text] of Object.entries(F[name])) if (typeof text === 'string') words[key] = text;
    // The battle HUD asks the battle's words for the reason a choice is grayed before it uses its own.
    const H = require(path.join(runtimeRoot, 'reactor_ui_fight.js'));
    for (const [key, text] of Object.entries(H.LABELS)) if (/^why[A-Z]/.test(key) && !(key in words)) words[key] = text;
    // The Action driver keeps its two lines beside the table.
    words.lead = F.Action.leadText;
    words.takeMouse = F.Action.promptText;
    // The Victory interface's labels, under `victory` + the label's name.
    const V = require(path.join(runtimeRoot, 'reactor_ui_victory.js'));
    for (const [key, text] of Object.entries(V.LABELS)) words[V.termKey(key)] = text;
    return { words, world, V, H, tables };
}

/** Every key the battle's own code asks its words for by name: [key, the file that asks]. */
function askedWords() {
    const asked = new Map();
    for (const name of fs.readdirSync(runtimeRoot)) {
        if (!/^reactor_fight.*\.js$/.test(name)) continue;
        const text = fs.readFileSync(path.join(runtimeRoot, name), 'utf8');
        for (const found of text.matchAll(/\b(?:F\.term|fieldTerm|\.term|t)\(\s*"([A-Za-z]\w*)"/g)) if (!asked.has(found[1])) asked.set(found[1], name);
    }
    return asked;
}

test('Terms lists every word a battle on the map shows, each with the game\'s stock English', () => {
    const Shell = shell();
    const { words, tables } = runtimeWords();
    assert.ok(tables.includes('TERMS') && Object.keys(words).length >= 100, 'the game\'s tables were found: ' + tables.join(', '));
    const editorWords = plain(Shell.BATTLE_WORDS);
    const missing = Object.keys(words).filter(key => !(key in editorWords));
    const dead = Object.keys(editorWords).filter(key => !(key in words));
    const changed = Object.keys(words).filter(key => key in editorWords && editorWords[key] !== words[key]);
    const line = key => `        ${key}: ${JSON.stringify(words[key])},`;
    assert.deepEqual(missing, [], 'the game has words Database > Terms does not offer. Add to DatabaseEditorUI.BATTLE_WORDS (editor/src/DatabaseEditorUI.js):\n' + missing.map(line).join('\n'));
    assert.deepEqual(dead, [], 'Database > Terms offers words the game never reads: remove them from DatabaseEditorUI.BATTLE_WORDS');
    assert.deepEqual(changed, [], 'the stock English differs from the game\'s. In DatabaseEditorUI.BATTLE_WORDS it should read:\n' + changed.map(line).join('\n'));
    assert.ok(Object.keys(editorWords).length >= 100);
    // A word the battle asks for by name is one of them, whichever table holds its English.
    const unknown = Array.from(askedWords()).filter(([key]) => !(key in editorWords)).map(([key, file]) => `${key} (${file})`);
    assert.deepEqual(unknown, [], 'the battle asks for words Database > Terms does not offer: add them to DatabaseEditorUI.BATTLE_WORDS, and their table to runtimeWords() of this test');
});

test('the battle words are a group of their own on Terms, each word\'s English as the placeholder', () => {
    const Shell = shell();
    const ui = Object.create(Shell.prototype);
    const system = { reactorBattle: { mode: 'tactical', turns: 'team', terms: { wait: 'Hold', endTurnAsk: 'Done?\nReally?', homebrew: 'Mine' } } };
    const html = ui.battleWordsPanel(system);
    assert.match(html, /<section class="rr-terms-panel rr-terms-battle-panel database-section rr-db-fold" data-section-key="battle-words">\s*<header class="database-section-header rr-db-fold-header" data-i18n-text-source="Battles on the Map">Battles on the Map<\/header>/, 'a panel that folds by its own name');
    const panel = page(html);
    const rows = panel.querySelectorAll('.rr-terms-message-row');
    const byKey = new Map(rows.map(row => [row.querySelector('input').dataset.key, row]));
    for (const [key, english] of Object.entries(plain(Shell.BATTLE_WORDS))) {
        const row = byKey.get(key);
        assert.ok(row, `${key} has a row`);
        const shown = english.replace(/\n/g, '\\n');
        assert.equal(unescapeHtml(row.querySelector('input').getAttribute('placeholder')), shown, `${key}: its English is the placeholder`);
        assert.equal(row.querySelector('span').textContent, shown.replace(/\s+/g, ' '), `${key}: and names the row`);
    }
    assert.equal(byKey.get('wait').querySelector('input').value, 'Hold', 'the project\'s own word is in the field');
    assert.equal(byKey.get('overwatch').querySelector('input').value, '', 'a stock word leaves it empty');
    assert.equal(byKey.get('endTurnAsk').querySelector('input').value, 'Done?\\nReally?', 'a line break is written \\n');
    // A word the project stores that the editor does not know is still shown, last.
    assert.equal(byKey.get('homebrew').querySelector('input').value, 'Mine');
    assert.equal(byKey.get('homebrew').querySelector('span').textContent, 'homebrew');
    const headings = panel.querySelectorAll('.rr-terms-message-group').map(heading => heading.textContent.trim());
    assert.deepEqual(headings, ['Commands', 'Grayed choices', 'Goal', 'Notices', 'Battle menu', 'Control hints', 'Controls page', 'Action and First Person', 'Victory', 'Other words']);
    assert.deepEqual(page(ui.battleWordsPanel({})).querySelectorAll('.rr-terms-message-group').map(heading => heading.textContent.trim()).slice(-1), ['Victory'], 'no Other group without such a word');
    // Every word is in exactly one group.
    assert.equal(rows.length, Object.keys(plain(Shell.BATTLE_WORDS)).length + 1);
    for (const [key, group] of [['wait', 'commands'], ['whyNoReach', 'reasons'], ['whyAttack', 'reasons'], ['whyCost', 'reasons'], ['goalTurn', 'goal'],
        ['unitPlaced', 'notices'], ['unitsPlaced', 'notices'], ['unitNoRoom', 'notices'], ['unitWatch', 'menu'], ['menuThreatShow', 'menu'], ['tipThreat', 'tips'], ['ctlThreat', 'controls'], ['menuResume', 'menu'], ['paceFast', 'menu'], ['on', 'menu'], ['endTurnAsk', 'menu'], ['endTurn', 'commands'],
        ['auto', 'commands'], ['autoAsk', 'menu'], ['unitDone', 'menu'], ['tipAuto', 'tips'], ['orClick', 'tips'], ['overwatch', 'commands'], ['ctlOk', 'controls'], ['keyHold', 'controls'],
        ['lead', 'action'], ['takeMouse', 'action'], ['victoryTitle', 'victory'], ['homebrew', 'other']]) {
        assert.equal(Shell.battleWordGroup(key), group, key);
    }
    // The page draws the panel under Commands and wires its fields.
    const source = read('src/DatabaseEditorUI.js');
    assert.match(source, /rr-terms-fields-four">\$\{renderArrayFields\('commands', arrays\.commands\)\}<\/div>\s*<\/section>\s*\$\{this\.battleWordsPanel\(system\)\}/);
    assert.match(source, /this\.wireBattleWords\(detailEl, system\);/);
});

test('each battle word\'s field stores what is typed and has the text fields\' menu', () => {
    const Shell = shell();
    const ui = Object.create(Shell.prototype);
    const menus = [];
    ui.databaseManager = { mutationGeneration: 0 };
    ui.attachTextFieldContextMenu = input => menus.push(input.dataset.key);
    const system = {};
    const panel = page(ui.battleWordsPanel(system));
    ui.wireBattleWords(panel, system);
    const fields = panel.querySelectorAll('.rr-term-battle-input');
    assert.deepEqual(menus.slice().sort(), fields.map(field => field.dataset.key).sort(), 'every field has the menu (Cut, Copy, Paste, Select All)');
    assert.equal(menus.length, Object.keys(plain(Shell.BATTLE_WORDS)).length);
    const type = (key, text) => { const field = fields.find(one => one.dataset.key === key); field.value = text; field.fire('input'); };
    type('wait', 'Hold');
    type('victoryTitle', 'We won!');
    assert.deepEqual(plain(system), { reactorBattle: { terms: { wait: 'Hold', victoryTitle: 'We won!' } } });
    type('wait', '');
    type('victoryTitle', '');
    assert.deepEqual(plain(system), {});
    assert.equal(ui.databaseManager.mutationGeneration, 4);
});

test('battle words that are not text, or a words table that is no table, are read as no word and written over', () => {
    const Shell = shell();
    const ui = Object.create(Shell.prototype);
    ui.databaseManager = { mutationGeneration: 0 };
    // A word stored as a number, a list or nothing is not a word of the project: its field is empty, as the game shows the stock word.
    const odd = { reactorBattle: { mode: 'tactical', turns: 'team', terms: { wait: 7, overwatch: ['Watch'], endTurn: null, auto: true, homebrew: 3, mine: 'Mine' } } };
    const panel = page(ui.battleWordsPanel(odd));
    const field = key => panel.querySelectorAll('.rr-term-battle-input').find(input => input.dataset.key === key);
    for (const key of ['wait', 'overwatch', 'endTurn', 'auto']) assert.equal(field(key).value, '', `${key}: no word`);
    assert.equal(field('homebrew'), undefined, 'a key of the project\'s own that holds no text is not listed');
    assert.equal(field('mine').value, 'Mine');
    const F = fightWorld({ system: plain(odd), tactical: true }).ReactorFight;
    for (const key of ['wait', 'overwatch', 'endTurn', 'auto']) assert.equal(F.term(key), Shell.BATTLE_WORDS[key], `${key}: the game shows the stock word`);
    // A words table that is a text, a number or missing: the first word typed makes it a table.
    for (const terms of ['x', 7, true, null, undefined]) {
        const system = { reactorBattle: { mode: 'tactical', turns: 'team', terms } };
        assert.deepEqual(plain(Shell.battleWordsOf(system)), {}, `${JSON.stringify(terms)}: no words to list`);
        assert.equal(page(ui.battleWordsPanel(system)).querySelectorAll('.rr-term-battle-input').length, Object.keys(plain(Shell.BATTLE_WORDS)).length);
        ui.setBattleWord(system, 'wait', '');
        assert.deepEqual(plain(system.reactorBattle).terms, terms === undefined ? undefined : terms, `${JSON.stringify(terms)}: an empty field touches nothing`);
        ui.setBattleWord(system, 'wait', 'Hold');
        assert.deepEqual(plain(system.reactorBattle), { mode: 'tactical', turns: 'team', terms: { wait: 'Hold' } }, `${JSON.stringify(terms)}: the word is stored`);
        assert.equal(fightWorld({ system: plain(system), tactical: true }).ReactorFight.term('wait'), 'Hold');
    }
    // Battle settings that are no table at all.
    const broken = { reactorBattle: 'tactical' };
    ui.setBattleWord(broken, 'wait', 'Hold');
    assert.deepEqual(plain(broken), { reactorBattle: { terms: { wait: 'Hold' } } });
});

test('a battle word typed on Terms is the word the game shows; an empty field is the stock word again', () => {
    const Shell = shell();
    const ui = Object.create(Shell.prototype);
    ui.databaseManager = { mutationGeneration: 0 };
    const system = {};
    ui.setBattleWord(system, 'wait', 'Hold');
    ui.setBattleWord(system, 'endTurnAsk', '%1 left.\\nStop here?');
    ui.setBattleWord(system, 'lead', '%1 steps up');
    ui.setBattleWord(system, 'victoryTitle', 'We won!');
    assert.deepEqual(plain(system), { reactorBattle: { terms: { wait: 'Hold', endTurnAsk: '%1 left.\nStop here?', lead: '%1 steps up', victoryTitle: 'We won!' } } });
    assert.equal(ui.databaseManager.mutationGeneration, 4, 'the Database knows it changed');
    // The game.
    const { V } = runtimeWords();
    const world = fightWorld({ system: plain(system), tactical: true, action: true });
    const F = world.ReactorFight;
    assert.equal(F.term('wait'), 'Hold');
    assert.equal(F.term('endTurnAsk'), '%1 left.\nStop here?', 'the line break is a real one in the file');
    assert.equal(F.term('overwatch'), 'Overwatch', 'an untouched word is the stock one');
    assert.equal(F.resolveMode(1), 'classic', 'words alone change nothing else');
    assert.equal(V.label(null, 'title', { own: world.$dataSystem.reactorBattle.terms }), 'We won!');
    assert.match(fs.readFileSync(path.join(runtimeRoot, 'reactor_fight_action.js'), 'utf8'), /\(terms && terms\.lead\) \|\| A\.leadText/, 'the Action driver reads its line from the same table');
    // Emptied fields go back to the stock words, and nothing is left behind.
    ui.setBattleWord(system, 'wait', '');
    assert.equal('wait' in system.reactorBattle.terms, false);
    for (const key of ['endTurnAsk', 'lead', 'victoryTitle']) ui.setBattleWord(system, key, '');
    assert.deepEqual(plain(system), {}, 'no empty tables in System.json');
    // The words live beside the card's settings and neither loses the other.
    const tactical = { reactorBattle: { mode: 'tactical', turns: 'initiative' } };
    ui.setBattleWord(tactical, 'wait', 'Hold');
    ui.setBattleWord(tactical, 'wait', '');
    assert.deepEqual(plain(tactical.reactorBattle), { mode: 'tactical', turns: 'initiative' });
    ui.setBattleWord(tactical, 'missing', '');
    assert.deepEqual(plain(tactical.reactorBattle), { mode: 'tactical', turns: 'initiative' });
});

test('enemy reach, a unit with no room and the reasons for a grayed choice are words of the game that Terms renames', () => {
    const Shell = shell();
    const ui = Object.create(Shell.prototype);
    ui.databaseManager = { mutationGeneration: 0 };
    const system = { reactorBattle: { mode: 'tactical', turns: 'team' } };
    const typed = { menuThreatShow: 'Show danger', menuThreatHide: 'Hide danger', tipThreat: '%1: danger', ctlThreat: 'Danger zones',
        unitPlaced: '%1 was shoved aside', unitsPlaced: '%1 were shoved aside', unitNoRoom: '%1 is stuck',
        whyAttack: 'No strike', whySkill: 'No art', whyItem: 'No goods', whyCost: 'Short of %1', whyUse: 'Not now', whyRange: 'Too far', whyNoTarget: 'Nobody there', whyNoReach: 'Nobody near' };
    for (const [key, text] of Object.entries(typed)) {
        assert.ok(Object.hasOwn(Shell.BATTLE_WORDS, key), `${key} has a row on Terms`);
        ui.setBattleWord(system, key, text);
    }
    const { H, words } = runtimeWords();
    const F = fightWorld({ system: plain(system), tactical: true }).ReactorFight;
    for (const [key, text] of Object.entries(typed)) assert.equal(F.term(key), text, `${key}: the battle shows the project's word`);
    // The HUD's line for a grayed choice asks the battle's words before its own.
    const reasons = Object.keys(typed).filter(key => /^why/.test(key));
    assert.deepEqual(reasons.slice().sort(), Object.keys(H.LABELS).filter(key => /^why[A-Z]/.test(key)).sort(), 'every reason the HUD can give');
    for (const key of reasons) assert.equal(H.reasonText({}, { term: asked => F.term(asked) }, key), typed[key], `${key}: the reason line`);
    // With nothing typed each is the stock word, the one Terms names the row with.
    const stock = fightWorld({ system: {}, tactical: true }).ReactorFight;
    for (const key of Object.keys(typed)) {
        const shown = /^why/.test(key) ? H.reasonText({}, { term: asked => stock.term(asked) }, key) : (stock.term(key) || words[key]);
        assert.equal(shown, Shell.BATTLE_WORDS[key], `${key}: the stock word`);
    }
});

test('a battle word of nothing but spaces is no word, and a word with quotes or a tag stays one field', () => {
    const Shell = shell();
    const ui = Object.create(Shell.prototype);
    ui.databaseManager = { mutationGeneration: 0 };
    const system = {};
    ui.setBattleWord(system, 'victoryTitle', '   ');
    assert.deepEqual(plain(system), {}, 'spaces are not stored');
    ui.setBattleWord(system, 'wait', 'Hold');
    ui.setBattleWord(system, 'wait', ' \t ');
    ui.setBattleWord(system, 'endTurnAsk', '\\n');
    assert.deepEqual(plain(system), {}, 'spaces typed over a word, or a line break alone, are the stock word again');
    ui.setBattleWord(system, 'wait', ' Hold on ');
    assert.equal(system.reactorBattle.terms.wait, ' Hold on ', 'a word keeps the spaces typed around it');
    // Quotes, a tag and an ampersand in a project's word.
    const tricky = { reactorBattle: { terms: { wait: 'Say "hold" <b>now</b> & \'wait\'', homebrew: '<i>"x"</i>', endTurnAsk: '"A"\n<B>' } } };
    const html = ui.battleWordsPanel(tricky);
    assert.doesNotMatch(html, /<b>|<i>|<B>/, 'a typed tag is text');
    const panel = page(html);
    const rows = panel.querySelectorAll('.rr-terms-message-row');
    assert.equal(rows.length, Object.keys(plain(Shell.BATTLE_WORDS)).length + 1, 'every row is still there');
    const field = key => panel.querySelectorAll('.rr-term-battle-input').find(input => input.dataset.key === key);
    assert.equal(field('wait').value, 'Say "hold" <b>now</b> & \'wait\'');
    assert.equal(field('homebrew').value, '<i>"x"</i>');
    assert.equal(field('endTurnAsk').value, '"A"\\n<B>');
    assert.equal(field('overwatch').value, '');
    // A stock word with a quote keeps its row and its placeholder.
    assert.equal(field('ctlThreat').getAttribute('placeholder'), "Every enemy's reach");
    assert.equal(field('tipLevel').getAttribute('placeholder'), "%1: the tile's next level");
});

//-----------------------------------------------------------------------------
// Words.

test('every word of the card and of the Terms group is hand-translated in the 17 languages', () => {
    const sandbox = { window: { dispatchEvent() {} }, document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class { constructor(type) { this.type = type; } }, console };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    const tables = vm.runInNewContext(['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js'].map(read).join('\n')
        + '\n({ keyed: RR_I18N_STRINGS, text: RR_TEXT_TRANSLATIONS, manager: window.I18n });', sandbox);
    const { Editor } = system1();
    const Shell = shell();
    const keyed = Object.assign({}, plain(Editor.TEXT), plain(Shell.BATTLE_WORD_TEXT));
    assert.ok(Object.keys(keyed).length >= 26);
    for (const [key, english] of Object.entries(keyed)) {
        assert.equal(tables.keyed.en[key], english, `${key}: the English table has the source's words`);
        for (const locale of LOCALES) {
            const value = tables.keyed[locale] && tables.keyed[locale][key];
            assert.ok(value && value !== english, `${locale} translates ${key} (${JSON.stringify(value)})`);
            assert.deepEqual((value.match(/%\d|\\n/g) || []).sort(), (english.match(/%\d|\\n/g) || []).sort(), `${locale} keeps the marks of ${key}`);
        }
    }
    // The literal words the card writes through the text tables: each stands on the card with its English beside it.
    const drawn = page(Editor.prototype.createBattlesSection.call(system1().editor, { reactorBattle: { mode: 'tactical', turns: 'team' } }).innerHTML);
    const literals = ['Battles'].concat(drawn.querySelectorAll('[data-i18n-text-source]').map(node => node.getAttribute('data-i18n-text-source')));
    assert.ok(literals.includes('Front view') && literals.includes("The map's own camera") && literals.includes('Slow motion on kills') && literals.length >= 20, `${literals.length} literal words`);
    for (const english of literals.concat(['Battles on the Map'])) {
        for (const locale of LOCALES) {
            tables.manager.setLanguage(locale, { persist: false, force: true });
            // A word that reads the same in a language is still in its table.
            assert.ok(Object.hasOwn(tables.text[locale], english) || tables.manager.tText(english) !== english, `${locale} translates ${JSON.stringify(english)}`);
        }
    }
    // With the editor in another language the card reads in it; the battle words stay the game's English.
    tables.manager.setLanguage('de', { persist: false, force: true });
    const german = system1({ window: { I18n: tables.manager } });
    const html = german.editor.createBattlesSection({ reactorBattle: { mode: 'tactical', turns: 'team' } }).innerHTML;
    assert.match(html, /data-section-key="battles">Kämpfe</);
    assert.match(html, /<label for="system-battle-screen" data-i18n="db\.battles\.screen">Ansicht<\/label>/);
    assert.match(html, /Speichern und Kampfaufbau öffnen/);
    assert.doesNotMatch(html, />\s*(Screen|Turns|Classic battles|Enemy turn speed|Save and open Battle Setup)\s*</);
    const GermanShell = shell({ window: { I18n: tables.manager } });
    const terms = Object.create(GermanShell.prototype).battleWordsPanel({});
    assert.match(terms, /<div class="rr-terms-message-group" data-i18n="db\.battleWords\.menu">Kampfmenü<\/div>/);
    assert.match(terms, /placeholder="Overwatch"/, 'the placeholder is what the game shows, not a translation');
    // The label pass translates placeholders it finds on a page. It must leave these alone: they are the game's
    // words. "Wait" and "Options" are words the editor's own tables translate.
    const fields = page(terms).querySelectorAll('.rr-term-battle-input');
    assert.notEqual(tables.manager.tText('Wait'), 'Wait');
    const plainField = page('<input type="text" placeholder="Wait">').querySelector('input');
    tables.manager._applyPlaceholder(plainField);
    assert.notEqual(plainField.getAttribute('placeholder'), 'Wait', 'what the pass does to an ordinary placeholder');
    for (const field of fields) {
        const before = field.getAttribute('placeholder');
        tables.manager._applyPlaceholder(field);
        assert.equal(field.getAttribute('placeholder'), before, `${field.dataset.key}: the placeholder stays the game's English`);
    }
    assert.equal(fields.find(field => field.dataset.key === 'wait').getAttribute('placeholder'), 'Wait');
    assert.equal(fields.find(field => field.dataset.key === 'endTurnAsk').getAttribute('placeholder'), '%1 units have not acted.\\nEnd the turn?');
    assert.match(terms, /<div class="rr-terms-battle-list" data-rr-i18n-skip>/, 'and the rows are no labels of the editor');
    tables.manager.setLanguage('en', { persist: false, force: true });
});

//-----------------------------------------------------------------------------
// A change of the editor's language with the pages on screen.

/**
 * A document small enough to run the label manager's language switch over
 * the markup a page wrote: elements with attributes, text as text nodes, the
 * selectors the manager asks for (a tag, a class, an attribute, lists of them).
 */
function liveDocument() {
    const simple = one => /^[\w.#-]*(?:\[[\w-]+(?:="[^"]*")?\])*$/.test(one);
    class Element {
        constructor(tag, attributes = {}) { this.tagName = tag.toUpperCase(); this.attributes = Object.assign({}, attributes); this.childNodes = []; this.parentElement = null; this.nodeType = 1; }
        append(...nodes) { for (const node of nodes) { node.parentElement = this; this.childNodes.push(node); } return this; }
        get children() { return this.childNodes.filter(node => node.nodeType === 1); }
        get textContent() { return this.childNodes.map(node => (node.nodeType === 3 ? node.nodeValue : node.textContent)).join(''); }
        set textContent(value) { this.childNodes = []; this.append({ nodeType: 3, nodeValue: String(value), parentElement: null }); }
        getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
        matches(selectors) {
            return String(selectors).split(',').map(one => one.trim()).some(one => {
                // (Selectors with a descendant, a child or a state belong to other pages.)
                if (!one || !simple(one)) return false;
                const tag = /^[a-z][\w-]*/i.exec(one);
                if (tag && tag[0].toUpperCase() !== this.tagName) return false;
                for (const [, name] of one.matchAll(/\.([\w-]+)/g)) if (!String(this.attributes.class || '').split(/\s+/).includes(name)) return false;
                for (const [, name, value] of one.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (!this.hasAttribute(name) || (value !== undefined && this.attributes[name] !== value)) return false;
                return true;
            });
        }
        closest(selectors) { for (let node = this; node; node = node.parentElement) if (node.matches(selectors)) return node; return null; }
        elements() { return this.children.flatMap(node => [node, ...node.elements()]); }
        querySelectorAll(selectors) { return this.elements().filter(node => node.matches(selectors)); }
        querySelector(selectors) { return this.querySelectorAll(selectors)[0] || null; }
    }
    /** A page as elements of this document: its markup, or the markup already read (`page()`'s answer). */
    const build = source => {
        const copy = node => {
            const attributes = {};
            for (const [name, value] of Object.entries(node.attributes)) attributes[name] = unescapeHtml(value);
            const element = new Element(node.tag, attributes);
            if (node.text.trim()) element.append({ nodeType: 3, nodeValue: node.text.trim(), parentElement: null });
            for (const child of node.children) element.append(copy(child));
            return element;
        };
        return (typeof source === 'string' ? page(source) : source).children.map(copy);
    };
    const body = new Element('body');
    const document = {
        body, documentElement: {}, readyState: 'complete', title: '', addEventListener() {},
        querySelectorAll: selectors => body.querySelectorAll(selectors),
        createTreeWalker(root) {
            const texts = [];
            const visit = node => node.childNodes.forEach(child => (child.nodeType === 3 ? texts.push(child) : visit(child)));
            visit(root);
            let index = 0;
            return { nextNode: () => texts[index++] || null };
        }
    };
    return { document, body, build, Element };
}

/** The label manager over a live document, in English. */
function liveLabels() {
    const live = liveDocument();
    const window = { dispatchEvent() {}, document: live.document };
    const sandbox = { window, document: live.document, localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class { constructor(type) { this.type = type; } }, console };
    window.localStorage = sandbox.localStorage;
    const manager = vm.runInNewContext(['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js'].map(read).join('\n') + '\nwindow.I18n;', sandbox);
    return Object.assign(live, { manager });
}

test('every word of the Battles card carries its key or its English, the title too', () => {
    const { Editor, editor } = system1();
    const section = editor.createBattlesSection({ reactorBattle: { mode: 'tactical', turns: 'team' } });
    assert.equal(section.querySelector('.database-section-header').getAttribute('data-i18n-text-source'), 'Battles', 'the title names its English');
    const card = page(section.innerHTML);
    const walk = node => [node, ...node.children.flatMap(walk)];
    const worded = walk(card).filter(node => node.tag !== 'root' && node.text.trim());
    assert.ok(worded.length >= 30, `${worded.length} elements show words`);
    for (const node of worded) {
        if (node.matches('.database-section-header')) continue;
        const key = node.getAttribute('data-i18n'), english = node.getAttribute('data-i18n-text-source');
        assert.ok(key || english, `<${node.tag}> "${node.text.trim()}" names where its words come from`);
        if (key) assert.equal(plain(Editor.TEXT)[key], node.text.trim(), `${key} is the card's word`);
        else assert.equal(english, node.text.trim(), 'in English the word is its own source');
        // A marked element holds its words and nothing else: writing them again cannot wipe a control.
        assert.equal(node.children.length, 0, `"${node.text.trim()}" stands alone in its element`);
    }
    // The reason a disabled button gives is one of those words (no map is open in this page).
    assert.ok(worded.some(node => node.getAttribute('data-i18n') === 'db.battles.setupNoMap'));
    // The Terms panel: its own words by key, its title by its English; the rows are the game's words and carry neither.
    const terms = page(Object.create(shell().prototype).battleWordsPanel({}));
    const header = terms.querySelector('.rr-db-fold-header');
    assert.equal(header.getAttribute('data-i18n-text-source'), 'Battles on the Map');
    for (const node of [terms.querySelector('.rr-terms-battle-hint'), ...terms.querySelectorAll('.rr-terms-message-columns span'), ...terms.querySelectorAll('.rr-terms-message-group')]) {
        const key = node.getAttribute('data-i18n');
        assert.ok(key && plain(shell().BATTLE_WORD_TEXT)[key] === node.textContent.trim(), `"${node.textContent.trim()}" names its key`);
    }
    for (const row of terms.querySelectorAll('.rr-terms-message-row span')) assert.equal(row.getAttribute('data-i18n') || row.getAttribute('data-i18n-text-source'), null);
});

test('a change of language with System 1 and Terms on screen relabels the Battles card and the battle words, and comes back to the same English', () => {
    const { manager, body, build, Element } = liveLabels();
    const loaded = system1({ window: { I18n: manager } });
    // System 1 as the page shows it: the Battles card, and the Music card's "Battle" row beside it.
    const section = loaded.editor.createBattlesSection({ reactorBattle: { mode: 'tactical', turns: 'team' } });
    const card = new Element('div', { class: 'database-section system-battles-card' }).append(...build(section.tree()));
    const music = new Element('td').append({ nodeType: 3, nodeValue: manager.tText('Battle'), parentElement: null });
    const terms = new Element('div').append(...build(Object.create(shell({ window: { I18n: manager } }).prototype).battleWordsPanel({})));
    body.append(card, music, terms);
    const words = () => ({
        title: card.querySelector('.database-section-header').textContent,
        mode: card.querySelector('label[for="system-battle-mode"]').textContent,
        screen: card.querySelector('label[for="system-battle-screen"]').textContent,
        turns: card.querySelector('label[for="system-battle-system"]').textContent,
        tactical: card.querySelector('option[value="tactical"]').textContent,
        fast: card.querySelector('option[value="fast"]').textContent,
        slow: card.querySelector('.system-battle-check').querySelector('span').textContent,
        group: card.querySelector('.system-battle-group').textContent,
        button: card.querySelector('.system-battle-setup').textContent,
        termsTitle: terms.querySelector('.rr-db-fold-header').textContent,
        termsHint: terms.querySelector('.rr-terms-battle-hint').textContent,
        termsGroups: terms.querySelectorAll('.rr-terms-message-group').map(node => node.textContent).join(' | '),
        firstWord: terms.querySelector('.rr-terms-message-row').querySelector('span').textContent
    });
    const english = words();
    assert.equal(english.title, 'Battles');
    assert.equal(english.termsGroups.split(' | ')[0], 'Commands');
    for (const locale of ['ja', 'de', 'ar']) {
        manager.setLanguage(locale, { persist: false });
        const shown = words();
        assert.equal(shown.title, manager.tText('Battles'), `${locale}: the title`);
        assert.equal(shown.mode, manager.tText('Battle mode'));
        assert.equal(shown.screen, manager.t('db.battles.screen'));
        assert.equal(shown.turns, manager.t('db.battles.turns'));
        assert.equal(shown.tactical, manager.tText('Tactical'));
        assert.equal(shown.fast, manager.t('db.battles.paceFast'));
        assert.equal(shown.slow, manager.tText('Slow motion on kills'));
        assert.equal(shown.group, manager.t('db.battles.classic'));
        assert.equal(shown.button, manager.t('db.battles.setup'));
        assert.equal(shown.termsTitle, manager.tText('Battles on the Map'));
        assert.equal(shown.termsHint, manager.t('db.battleWords.hint'));
        assert.equal(shown.termsGroups.split(' | ')[0], manager.t('db.battleWords.commands'), `${locale}: the headings among the game's words`);
        assert.equal(shown.firstWord, 'Wait', `${locale}: the game's word stays the game's English`);
        for (const [name, text] of Object.entries(shown)) if (name !== 'firstWord') assert.notEqual(text, english[name], `${locale}: ${name} is translated`);
        // The checkbox is still in its label.
        assert.ok(card.querySelector('.system-battle-slowmo') && card.querySelector('.system-battle-revive'), `${locale}: the checkboxes are still there`);
    }
    // The Music card's "Battle" row stands on the same page. The label manager knows one English source for a
    // rendered label, so the card's title reads unlike that row in every language (where a language has one word
    // for "Battle" and "Battles", the title says "battle settings"), and each comes back as itself.
    for (const locale of LOCALES) {
        manager.setLanguage(locale, { persist: false });
        assert.notEqual(manager.tText('Battles'), manager.tText('Battle'), `${locale}: the card's title is not the Music card's Battle row`);
        assert.equal(card.querySelector('.database-section-header').textContent, manager.tText('Battles'));
        assert.equal(music.textContent, manager.tText('Battle'));
    }
    manager.setLanguage('ja', { persist: false });
    manager.setLanguage('en', { persist: false });
    assert.deepEqual(words(), english, 'back in English every word is the one the page was drawn with');
    assert.equal(music.textContent, 'Battle', 'and the Music card\'s row is still its own word');
});
