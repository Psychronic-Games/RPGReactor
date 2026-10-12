'use strict';
// The stock vehicles (Boat, Ship, Airship) are stored as RPG Maker stores
// them: System.json > boat / ship / airship, each with characterName,
// characterIndex, bgm { name, pan, pitch, volume }, startMapId, startX and
// startY. Database > Vehicles shows and sets the image and the BGM, System 1
// the starting positions; a project made in RPG Maker MZ or MV keeps the
// fields in that shape through a load, an edit on the real pages and a save.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createPages } = require('./helpers/database-pages.cjs');

const editorRoot = path.resolve(__dirname, '..');
const RRJson = require('../src/utils/JsonFiles.js');
const bindings = require('../src/database/Database3DBindings.js');
const DatabaseManager = vm.runInNewContext(fs.readFileSync(path.join(editorRoot, 'src/DatabaseManager.js'), 'utf8') + '\nDatabaseManager;', {
    RRJson, RRDatabase3DBindings: bindings, process, require, nw: {},
    console: { log() {}, warn() {}, error() {} }
});

//-----------------------------------------------------------------------------
// System.json as each editor writes it: the keys in its order, one line.

const audio = (name, volume = 90) => ({ name, pan: 0, pitch: 100, volume });
const vehicle = (name, index, bgm, start = [0, 0, 0]) => `{"bgm":{"name":"${bgm}","pan":0,"pitch":100,"volume":90},"characterIndex":${index},"characterName":"${name}","startMapId":${start[0]},"startX":${start[1]},"startY":${start[2]}}`;
const VEHICLES = {
    boat: vehicle('Vehicle', 0, 'Ship1'),
    ship: vehicle('Vehicle', 1, 'Ship2', [3, 14, 9]),
    airship: vehicle('$BigShip', 3, 'Ship3')
};
/** A value as RPG Maker writes it. */
const text = value => JSON.stringify(value);
const shared = {
    armorTypes: text(['', 'General Armor', 'Magic Armor']), attackMotions: text([{ type: 0, weaponImageId: 0 }, { type: 1, weaponImageId: 1 }]),
    battleBgm: text(audio('Battle1')), battleback1Name: '"Grassland"', battleback2Name: '"Grassland"', battlerHue: '0', battlerName: '"Dragon"',
    currencyUnit: '"G"', defeatMe: text(audio('Defeat1')), editMapId: '1', elements: text(['', 'Physical', 'Fire']), equipTypes: text(['', 'Weapon', 'Shield']),
    gameTitle: '"Sample"', gameoverMe: text(audio('Gameover1')), locale: '"en_US"', magicSkills: text([1]), menuCommands: text([true, true, true, true, true, true]),
    optDisplayTp: 'true', optDrawTitle: 'true', optExtraExp: 'false', optFloorDeath: 'false', optFollowers: 'true', optSideView: 'false', optSlipDeath: 'false', optTransparent: 'false',
    partyMembers: text([1, 2]), skillTypes: text(['', 'Magic', 'Special']), sounds: text([audio('Cursor2'), audio('Decision1')]),
    startMapId: '1', startX: '8', startY: '6', switches: text(['', 'Door open']),
    terms: text({ basic: ['Level', 'Lv'], commands: ['Fight', 'Escape'], params: ['Max HP'], messages: { alwaysDash: 'Always Dash' } }),
    testBattlers: text([{ actorId: 1, equips: [1, 1, 2, 3, 0], level: 1 }]), testTroopId: '4', title1Name: '"Castle"', title2Name: '""', titleBgm: text(audio('Theme6')),
    variables: text(['', 'Gold found']), versionId: '11223344', victoryMe: text(audio('Victory1')), weaponTypes: text(['', 'Dagger', 'Sword']), windowTone: text([0, 0, 0, 0])
};
const MV_KEYS = ['airship', 'armorTypes', 'attackMotions', 'battleBgm', 'battleback1Name', 'battleback2Name', 'battlerHue', 'battlerName', 'boat', 'currencyUnit', 'defeatMe', 'editMapId',
    'elements', 'equipTypes', 'gameTitle', 'gameoverMe', 'locale', 'magicSkills', 'menuCommands', 'optDisplayTp', 'optDrawTitle', 'optExtraExp', 'optFloorDeath', 'optFollowers', 'optSideView',
    'optSlipDeath', 'optTransparent', 'partyMembers', 'ship', 'skillTypes', 'sounds', 'startMapId', 'startX', 'startY', 'switches', 'terms', 'testBattlers', 'testTroopId', 'title1Name', 'title2Name',
    'titleBgm', 'variables', 'versionId', 'victoryMe', 'weaponTypes', 'windowTone'];
const MZ_ONLY = {
    advanced: text({ gameId: 51234567, screenWidth: 816, screenHeight: 624, uiAreaWidth: 816, uiAreaHeight: 624, numberFontFilename: 'mplus-2p-bold-sub.woff', fallbackFonts: 'Verdana, sans-serif',
        fontSize: 26, mainFontFilename: 'mplus-1m-regular.woff', windowOpacity: 192, screenScale: 1 }),
    battleSystem: '0', itemCategories: text([true, true, true, true]), optAutosave: 'true', optKeyItemsNumber: 'false',
    titleCommandWindow: text({ background: 0, offsetX: 0, offsetY: 0 }), tileSize: '48'
};
const MZ_KEYS = ['advanced', 'airship', 'armorTypes', 'attackMotions', 'battleBgm', 'battleback1Name', 'battleback2Name', 'battlerHue', 'battlerName', 'battleSystem', 'boat', 'currencyUnit',
    'defeatMe', 'editMapId', 'elements', 'equipTypes', 'gameTitle', 'gameoverMe', 'itemCategories', 'locale', 'magicSkills', 'menuCommands', 'optAutosave', 'optDisplayTp', 'optDrawTitle',
    'optExtraExp', 'optFloorDeath', 'optFollowers', 'optKeyItemsNumber', 'optSideView', 'optSlipDeath', 'optTransparent', 'partyMembers', 'ship', 'skillTypes', 'sounds', 'startMapId', 'startX',
    'startY', 'switches', 'terms', 'testBattlers', 'testTroopId', 'title1Name', 'title2Name', 'titleBgm', 'titleCommandWindow', 'variables', 'versionId', 'victoryMe', 'weaponTypes', 'windowTone', 'tileSize'];
const systemText = (keys, vehicles = VEHICLES) => '{' + keys.filter(key => !(key in VEHICLES) || vehicles[key])
    .map(key => `"${key}":${vehicles[key] || shared[key] || MZ_ONLY[key]}`).join(',') + '}';
const SHAPES = { 'RPG Maker MZ': MZ_KEYS, 'RPG Maker MV': MV_KEYS };

/** A project folder holding that System.json and nothing else, opened as the editor opens one. */
async function open(t, source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-vehicle-storage-'));
    fs.mkdirSync(path.join(dir, 'data'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'data', 'System.json');
    fs.writeFileSync(file, source);
    const manager = new DatabaseManager();
    manager.fs = fs; manager.path = path;
    assert.equal(await manager.loadAllData(dir), true);
    const saved = async () => { assert.equal(await manager.saveAllData(dir), true); return JSON.parse(fs.readFileSync(file, 'utf8')); };
    return { dir, file, manager, system: manager.getSystem(), pages: createPages(manager, { projectPath: dir }), saved };
}

/** What a page shows of a stock vehicle. */
const shown = page => ({
    image: page.querySelector('.graphic-preview-name').textContent,
    bgm: page.querySelector('.vehicle-sound-browse[data-sound="bgm"]').textContent,
    drawn: page.querySelector('.vehicle-sprite-preview').calls.filter(call => call[0] === 'drawImage').map(call => call.slice(1, 5))
});
const bgmButton = page => page.querySelector('.vehicle-sound-browse[data-sound="bgm"]');
/** The keys both hold, compared as text: the same values in the same order inside. */
const changedKeys = (before, after) => Object.keys(before).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

//-----------------------------------------------------------------------------

for (const [maker, keys] of Object.entries(SHAPES)) {
    test(`${maker}: Vehicles shows each stock vehicle's image and BGM from System.json, and looking changes nothing`, async t => {
        const { system, pages } = await open(t, systemText(keys));
        const before = JSON.stringify(system);
        assert.deepEqual(shown(pages.vehicle('boat')), { image: 'Vehicle', bgm: 'Ship1', drawn: [[48, 0, 48, 48]] });
        // Index 1 of an eight-character sheet: the second block, facing down, mid-step.
        assert.deepEqual(shown(pages.vehicle('ship')), { image: 'Vehicle', bgm: 'Ship2', drawn: [[4 * 48, 0, 48, 48]] });
        assert.deepEqual(shown(pages.vehicle('airship')).image, '$BigShip');
        assert.equal(shown(pages.vehicle('airship')).bgm, 'Ship3');
        assert.equal(JSON.stringify(system), before, 'viewing the three rows writes nothing');
        // The starting positions are System 1's; the stock rows of Vehicles carry no second set.
        assert.equal(pages.vehicle('ship').querySelector('.vehicle-location-browse'), null);
        const row = pages.system1().querySelectorAll('.system-pos-row').find(each => each.dataset.posOwner === 'ship');
        assert.deepEqual(['mapId', 'x', 'y'].map(part => row.querySelector(`[data-pos-part="${part}"]`).value), ['3', '14', '9']);
    });

    test(`${maker}: an image and a BGM set in Vehicles, and a start set in System 1, are saved in RPG Maker's fields and shape`, async t => {
        const source = systemText(keys);
        const { system, pages, saved, manager } = await open(t, source);
        const original = JSON.parse(source);

        // Boat: another cell of another sheet, through the sheet picker's answer.
        let page = pages.vehicle('boat');
        page.querySelector('.vehicle-image-browse').onclick();
        assert.deepEqual([pages.opened.images[0].name, pages.opened.images[0].index], ['Vehicle', 0], 'the picker opens on the cell in use');
        pages.opened.images[0].callback({ characterName: 'Vehicle2', characterIndex: 6, pattern: 2, direction: 8 });
        assert.equal(page.querySelector('.graphic-preview-name').textContent, 'Vehicle2');
        // Ship: another BGM, as the audio picker's OK hands it over.
        page = pages.vehicle('ship');
        bgmButton(page).onclick();
        assert.equal(pages.opened.sounds[0].selected, 'Ship2', 'the picker opens on the BGM in use');
        assert.deepEqual({ ...pages.opened.sounds[0].levels }, { name: 'Ship2', pan: 0, pitch: 100, volume: 90 });
        pages.opened.sounds[0].onOk({ name: 'Sea Road', volume: 75, pitch: 110, pan: -20 });
        assert.equal(bgmButton(page).textContent, 'Sea Road');
        // Airship: no BGM at all, the picker's (None).
        page = pages.vehicle('airship');
        bgmButton(page).onclick();
        pages.opened.sounds[1].onOk({ name: '', volume: 90, pitch: 100, pan: 0 });
        // System 1: the airship's start, typed; the boat's, from the map picker; one of the page's own switches.
        page = pages.system1();
        const row = owner => page.querySelectorAll('.system-pos-row').find(each => each.dataset.posOwner === owner);
        row('airship').querySelector('[data-pos-part="mapId"]').choose('2');
        row('airship').querySelector('[data-pos-part="x"]').choose('31');
        row('airship').querySelector('[data-pos-part="y"]').choose('7');
        row('boat').querySelector('.system-pos-picker-btn').click();
        pages.opened.maps[0].onConfirm({ mapId: 5, x: 40, y: 12 });
        pages.check(page.querySelector('.system-checkbox[data-field="optDrawTitle"]'), false);

        assert.ok(manager.getDirtyKeys().includes('system'));
        const after = await saved();
        const expected = {
            boat: '{"bgm":{"name":"Ship1","pan":0,"pitch":100,"volume":90},"characterIndex":6,"characterName":"Vehicle2","startMapId":5,"startX":40,"startY":12}',
            ship: '{"bgm":{"name":"Sea Road","pan":-20,"pitch":110,"volume":75},"characterIndex":1,"characterName":"Vehicle","startMapId":3,"startX":14,"startY":9}',
            airship: '{"bgm":{"name":"","pan":0,"pitch":100,"volume":90},"characterIndex":3,"characterName":"$BigShip","startMapId":2,"startX":31,"startY":7}'
        };
        for (const key of Object.keys(expected)) {
            assert.equal(JSON.stringify(after[key]), expected[key], `${key}: the same fields in the same order, nothing added`);
            assert.equal(JSON.stringify(system[key]), expected[key]);
        }
        // Everything else the project had is as it was, in its place.
        assert.deepEqual(changedKeys(original, after).sort(), ['airship', 'boat', 'optDrawTitle', 'ship', 'versionId']);
        assert.equal(after.optDrawTitle, false);
        assert.deepEqual(Object.keys(after).filter(key => key in original), Object.keys(original), 'no key lost or moved');
        // And it reads back the same.
        const again = new DatabaseManager();
        again.fs = fs; again.path = path;
        assert.equal(await again.loadAllData(manager.projectPath), true);
        const reopened = createPages(again, {});
        assert.deepEqual([shown(reopened.vehicle('boat')).image, shown(reopened.vehicle('ship')).bgm], ['Vehicle2', 'Sea Road']);
    });

    test(`${maker}: saving System 1 or System 2 keeps the vehicles' image and BGM as they are`, async t => {
        const source = systemText(keys);
        const { pages, saved } = await open(t, source);
        const original = JSON.parse(source);
        // Each page is opened and one of its own settings changed.
        let page = pages.system1();
        page.querySelector('.system-text-field[data-system-field="gameTitle"]').choose('Renamed');
        page = pages.system2();
        pages.check(page.querySelector('.sys2-menu-cmd[data-idx="4"]'), false);
        const after = await saved();
        for (const key of ['boat', 'ship', 'airship']) assert.equal(JSON.stringify(after[key]), VEHICLES[key], `${key} is written back as it was read`);
        assert.deepEqual([after.gameTitle, after.menuCommands[4]], ['Renamed', false]);
        assert.deepEqual(changedKeys(original, after).sort(), ['gameTitle', 'menuCommands', 'versionId']);
    });
}

test('a System.json without a vehicle gains it in RPG Maker\'s shape on the first edit, and not by looking', async t => {
    const { system, pages, saved } = await open(t, systemText(MZ_KEYS, { boat: VEHICLES.boat, airship: VEHICLES.airship }));
    assert.equal('ship' in system, false);
    let page = pages.vehicle('ship');
    assert.deepEqual(shown(page), { image: '', bgm: 'vehicle.musicUnchanged', drawn: [] });
    assert.equal('ship' in system, false, 'the page draws without writing');
    page.querySelector('.vehicle-image-browse').onclick();
    pages.opened.images[0].callback({ characterName: 'Vehicle', characterIndex: 2 });
    assert.equal(JSON.stringify(system.ship), '{"bgm":{"name":"","pan":0,"pitch":100,"volume":90},"characterIndex":2,"characterName":"Vehicle","startMapId":0,"startX":0,"startY":0}');
    // A vehicle whose BGM was lost gets the four fields back with the pick.
    delete system.boat.bgm;
    page = pages.vehicle('boat');
    bgmButton(page).onclick();
    pages.opened.sounds[0].onOk({ name: 'Harbor', volume: 60, pitch: 100, pan: 0 });
    assert.deepEqual({ ...system.boat.bgm }, { name: 'Harbor', pan: 0, pitch: 100, volume: 60 });
    const after = await saved();
    assert.deepEqual(after.ship, JSON.parse(JSON.stringify(system.ship)));
    assert.equal(after.boat.bgm.name, 'Harbor');
});

test('a project made here: the Demo keeps its vehicles through the same pages', async t => {
    const demo = path.join(editorRoot, '..', 'template', 'Demo', 'data', 'System.json');
    if (!fs.existsSync(demo)) { t.skip('no Demo project in this checkout'); return; }
    const source = fs.readFileSync(demo, 'utf8');
    const original = JSON.parse(source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source);
    const { pages, saved } = await open(t, source);
    for (const key of ['boat', 'ship', 'airship']) {
        const page = pages.vehicle(key);
        assert.equal(shown(page).image, original[key].characterName);
        assert.equal(shown(page).bgm, original[key].bgm.name || 'vehicle.musicUnchanged');
    }
    pages.check(pages.system1().querySelector('.system-checkbox[data-field="optDrawTitle"]'), !original.optDrawTitle);
    const after = await saved();
    for (const key of ['boat', 'ship', 'airship']) assert.equal(JSON.stringify(after[key]), JSON.stringify(original[key]));
    assert.deepEqual(changedKeys(original, after).sort(), ['optDrawTitle', 'versionId']);
});
