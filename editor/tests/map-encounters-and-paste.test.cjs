// Map Properties encounters and the map tree's Paste Map placement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const controllerSource = fs.readFileSync(path.join(root, 'editor', 'src', 'ProjectController.js'), 'utf8');
const ProjectController = vm.runInNewContext(`${controllerSource}\nProjectController;`, {
    console, process, require, nw: {}, document: { getElementById: () => null }
});

function encounterRow(troopId, regions) {
    const regionsRadio = { checked: regions !== null };
    const rangeContainer = { _regionsRadio: regionsRadio, _regionsInput: { value: regions || '' } };
    return {
        children: [{}, {}, rangeContainer],
        querySelector: sel => sel === 'select' ? { value: String(troopId) } : { value: '10' }
    };
}

function formWith(rows) {
    const doc = { querySelectorAll: sel => sel === '#map-encounters-list > div' ? rows : [] };
    const Controller = vm.runInNewContext(`${controllerSource}\nProjectController;`, {
        console, process, require, nw: {}, document: doc
    });
    return Object.create(Controller.prototype);
}

test('a Whole Map encounter is stored with no regions, as the game reads it', () => {
    const list = formWith([encounterRow(1, null), encounterRow(3, '5, 7')]).getEncounterListFromForm();
    assert.deepEqual(JSON.parse(JSON.stringify(list)), [
        { troopId: 1, weight: 10, regionSet: [] },
        { troopId: 3, weight: 10, regionSet: [5, 7] }
    ]);
});

test('Regions chosen with no valid region falls back to the whole map', () => {
    const list = formWith([encounterRow(2, '0, x')]).getEncounterListFromForm();
    assert.deepEqual([...list[0].regionSet], []);
});

test('the game counts a stored [0] (older editor builds) as the whole map', () => {
    const src = fs.readFileSync(path.join(root, 'runtime', 'reactor_objects_map.js'), 'utf8');
    const start = src.indexOf('Game_Player.prototype.meetsEncounterConditions');
    const body = src.slice(start, src.indexOf('};', start) + 2);
    const ctx = { Game_Player: function () {} };
    vm.runInNewContext(body, ctx);
    const player = region => Object.assign(Object.create(ctx.Game_Player.prototype), { regionId: () => region });
    const meets = (set, region) => player(region).meetsEncounterConditions({ regionSet: set });
    for (const region of [0, 5]) {
        assert.equal(meets([], region), true);
        assert.equal(meets([0], region), true);
    }
    assert.equal(meets([5], 5), true);
    assert.equal(meets([5], 0), false);
    assert.equal(meets([5, 6], 6), true);
    assert.equal(meets([0, 5], 0), true);
    assert.equal(meets([0, 5], 6), false);
});

function treeMenu(method, ...args) {
    const controller = Object.create(ProjectController.prototype);
    controller._t = key => key;
    controller._tt = text => text;
    controller.currentProject = { maps: [null, { id: 1, parentId: 0, order: 0 }, { id: 2, parentId: 0, order: 1 }, { id: 3, parentId: 0, order: 2 }] };
    controller.tilemapManager = { currentMap: { id: 1 } };
    const calls = [];
    controller.pasteMap = anchor => calls.push(anchor);
    let items = [];
    controller.showContextMenuItems = (x, y, list) => { items = list; };
    controller[method](0, 0, ...args);
    items.find(item => item.label === 'mapCtx.pasteMap').action();
    return calls;
}

test("Paste Map from a map's menu places the copy after that map, not after the open one", () => {
    assert.deepEqual(treeMenu('showMapContextMenu', 3), [3]);
});

test('Paste Map from the empty part of the tree places the copy at the end of the top level', () => {
    assert.deepEqual(treeMenu('showMapListContextMenu'), [null]);
});

test('placement after a map, and at the end of the top level', () => {
    const controller = Object.create(ProjectController.prototype);
    controller.currentProject = { maps: [null, { id: 1, parentId: 0, order: 0 }, { id: 2, parentId: 0, order: 1 }, { id: 3, parentId: 0, order: 2 }] };
    assert.deepEqual({ ...controller.getMapInsertPlacement(2) }, { parentId: 0, order: 1.5 });
    assert.deepEqual({ ...controller.getMapInsertPlacement(null) }, { parentId: 0, order: 3 });
});
