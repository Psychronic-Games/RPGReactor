'use strict';
// Can Receive (Conditional Branch › Reactor) and the Treasure quick event's
// inventory-space check. The condition is a Script branch the codec tags, so it
// reopens as itself and reads as a sentence in the list; a chest built with the
// check runs through the game's own Game_Interpreter and Game_Party here, and a
// full party gets the failure text and nothing else, so the chest stays closed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const ReactorEventCommandCodec = require('../src/event/commands/ReactorEventCommandCodec.js');
const ConditionalBranchEditor = require('../src/event/commands/ConditionalBranchEditor.js');
const EventCommandList = require('../src/event/EventCommandList.js');
const plain = value => JSON.parse(JSON.stringify(value));

const managerSource = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
const EventManager = vm.runInNewContext(`${managerSource}\nEventManager;`, {
    console: { log() {}, warn() {}, error() {} },
    ConditionalBranchEditor
});

function manager() {
    const instance = Object.create(EventManager.prototype);
    instance.currentMap = { width: 20, height: 15, events: [null] };
    instance.getNextEventId = EventManager.prototype.getNextEventId;
    return instance;
}

function chest(config) {
    return manager().buildQuickEvent('treasure', 1, 1, { characterName: '!Chest', ...config });
}

const FAILURE = 'You cannot carry all of this item. Make room and try again.';

// ---- The game: the shipped interpreter and party, with a stub map and message --------

function world() {
    const context = { console, Math, JSON };
    vm.createContext(context);
    vm.runInContext('Number.prototype.clamp = function(a, b) { return Math.min(Math.max(this, a), b); };', context);
    for (const file of ['reactor_objects_interpreter.js', 'reactor_objects_battlers.js']) {
        vm.runInContext(fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8'), context, { filename: file });
    }
    const log = { messages: [], routes: [], selfSwitches: {} };
    vm.runInContext(`
        var $dataSystem = {};
        var $dataItems = [null, { id: 1, name: 'Potion', note: '' }, { id: 2, name: 'Ether', note: '<Max: 3>' }];
        var $dataWeapons = [null, { id: 1, name: 'Sword', note: '' }];
        var $dataArmors = [null, { id: 1, name: 'Shield', note: '' }];
        var DataManager = {
            isItem: item => !!item && $dataItems.includes(item),
            isWeapon: item => !!item && $dataWeapons.includes(item),
            isArmor: item => !!item && $dataArmors.includes(item)
        };
        var ImageManager = { loadFace() {}, loadPicture() {} };
        var Game_Followers = { placeOfCharacterId: () => 0 };
        var $gameSystem = {};
        var $gameParty = Object.create(Game_Party.prototype);
        $gameParty.initAllItems();
        $gameParty.inBattle = () => false;
    `, context);
    context.$gameMap = {
        mapId: () => 1, refreshIfNeeded() {}, requestRefresh() {},
        event: () => ({ forceMoveRoute: route => log.routes.push(route), isMoveRouteForcing: () => false })
    };
    context.$gameMessage = {
        isBusy: () => false, setFaceImage() {}, setFacePlay() {}, setBackground() {}, setPositionType() {}, setSpeakerName() {},
        add: text => log.messages.push(text)
    };
    context.$gameSelfSwitches = { setValue: (key, value) => { log.selfSwitches[key.join(',')] = value; } };
    const run = list => {
        log.messages.length = 0;
        log.routes.length = 0;
        const interpreter = new context.Game_Interpreter();
        interpreter.setup(list, 7);
        for (let steps = 0; interpreter._list; steps++) {
            assert.ok(steps < 500, 'the event list ends');
            interpreter.executeCommand();
        }
    };
    const party = context.$gameParty;
    const table = { item: '$dataItems', weapon: '$dataWeapons', armor: '$dataArmors' };
    const entry = (type, id) => vm.runInContext(`${table[type]}[${id}]`, context);
    const count = (type, id) => party.numItems(entry(type, id));
    const give = (type, id, amount) => party.gainItem(entry(type, id), amount);
    const claimed = () => log.selfSwitches['1,7,A'] === true;
    return { context, log, run, party, entry, count, give, claimed };
}

// ---- The Conditional Branch editor -----------------------------------------------------

test('Can Receive sits on the Reactor tab and saves as a tagged Script condition that reopens as itself', () => {
    const reactorTab = ConditionalBranchEditor.TABS.find(tab => tab.label === 'Reactor');
    assert.ok(reactorTab.types.includes(18));
    for (const [type, table] of [['item', '$dataItems'], ['weapon', '$dataWeapons'], ['armor', '$dataArmors']]) {
        const editor = new ConditionalBranchEditor(null, null);
        Object.assign(editor, { conditionType: 18, capacityType: type, capacityItemId: 4, capacityAmount: 6 });
        const command = editor.buildCommands()[0];
        assert.equal(command.code, 111);
        assert.equal(command.parameters.length, 2);
        assert.equal(command.parameters[0], 12, 'a Script condition RPG Maker and the runtime both run');
        const parsed = ReactorEventCommandCodec.parseCommand(command, 'itemCapacityCondition');
        assert.deepEqual(plain(parsed.data), { type, id: 4, amount: 6 });
        assert.ok(parsed.body.includes(`${table}[4]`), type);

        const reopened = new ConditionalBranchEditor(null, null);
        reopened.parseCommand(command);
        assert.equal(reopened.conditionType, 18);
        assert.deepEqual([reopened.capacityType, reopened.capacityItemId, reopened.capacityAmount], [type, 4, 6]);
        assert.deepEqual(reopened.buildCommands()[0], command);
    }
});

test('an edited or malformed Can Receive script reopens as the author\'s own Script', () => {
    const editor = new ConditionalBranchEditor(null, null);
    Object.assign(editor, { conditionType: 18, capacityType: 'item', capacityItemId: 1, capacityAmount: 2 });
    const edited = editor.buildCommands()[0];
    edited.parameters[1] = edited.parameters[1].replace('+2<=', '+2<');
    const reopened = new ConditionalBranchEditor(null, null);
    reopened.parseCommand(edited);
    assert.equal(reopened.conditionType, 12);
    assert.equal(reopened.scriptText, edited.parameters[1]);
    assert.deepEqual(reopened.buildCommands()[0].parameters, edited.parameters, 'saved untouched, byte for byte');

    for (const data of [{ type: 'gold', id: 1, amount: 1 }, { type: 'item', id: 1, amount: 0 },
        { type: 'item', id: 1.5, amount: 1 }, { type: 'item', id: 1, amount: 1, extra: true }]) {
        const text = ReactorEventCommandCodec.createText('itemCapacityCondition', data, 'true');
        const other = new ConditionalBranchEditor(null, null);
        other.parseCommand({ code: 111, indent: 0, parameters: [12, text] });
        assert.equal(other.conditionType, 12, JSON.stringify(data));
    }
    assert.throws(() => ConditionalBranchEditor.createItemCapacityText({ type: 'item', id: 1, amount: 0 }));
});

test('the event list reads Can Receive as a sentence, and an edited one as a Script', () => {
    const list = Object.create(EventCommandList.prototype);
    list.eventEditor = { databaseManager: {
        getItem: id => [null, { id: 1, name: 'Potion' }][id],
        getWeapon: () => null,
        getArmor: id => [null, { id: 1, name: 'Shield' }][id]
    } };
    const describe = data => list.getCommandInfo({ code: 111, indent: 0, parameters: [12,
        ConditionalBranchEditor.createItemCapacityText(data)] }, { list: [] }, 0).description;
    assert.equal(describe({ type: 'item', id: 1, amount: 5 }), 'Can Receive Item: #1 Potion × 5');
    assert.equal(describe({ type: 'armor', id: 1, amount: 1 }), 'Can Receive Armor: #1 Shield × 1');
    assert.equal(describe({ type: 'weapon', id: 9, amount: 2 }), 'Can Receive Weapon: Weapon #9 (Missing) × 2');

    const text = ConditionalBranchEditor.createItemCapacityText({ type: 'item', id: 1, amount: 5 }) + ' || true';
    const edited = list.getCommandInfo({ code: 111, indent: 0, parameters: [12, text] }, { list: [] }, 0).description;
    assert.match(edited, /^Script: /);
});

// ---- The Treasure quick event ----------------------------------------------------------

test('item, weapon and armor chests wrap the whole claim in Can Receive, with the failure text in Else', () => {
    for (const [rewardKind, code] of [['item', 126], ['weapon', 127], ['armor', 128]]) {
        const event = chest({ rewardKind, rewardId: 3, amount: 4, message: 'Found it.' });
        const list = event.pages[0].list;
        assert.deepEqual(plain(list.map(command => [command.code, command.indent])), [
            [111, 0], [205, 1], [505, 1], [505, 1], [505, 1], [505, 1], [505, 1], [505, 1], [505, 1],
            [code, 1], [101, 1], [401, 1], [123, 1], [0, 1],
            [411, 0], [101, 1], [401, 1], [0, 1], [412, 0], [0, 0]
        ], rewardKind);
        const parsed = ReactorEventCommandCodec.parseCommand(list[0], 'itemCapacityCondition');
        assert.deepEqual(plain(parsed.data), { type: rewardKind, id: 3, amount: 4 });
        const texts = list.filter(command => command.code === 401).map(command => command.parameters[0]);
        assert.deepEqual(plain(texts), ['Found it.', FAILURE], 'the success text, then the default failure text');
        assert.deepEqual(plain(list.find(command => command.code === 123).parameters), ['A', 0]);

        const reopened = new ConditionalBranchEditor(null, null);
        reopened.parseCommand(list[0]);
        assert.equal(reopened.conditionType, 18, 'the chest\'s branch edits in the Conditional Branch dialog');
    }
    const custom = chest({ rewardKind: 'item', rewardId: 1, amount: 1, failMessage: 'Too heavy.' });
    assert.equal(custom.pages[0].list.filter(command => command.code === 401)[1].parameters[0], 'Too heavy.');
});

test('gold chests, and chests with the check turned off, are built exactly as before', () => {
    const legacy = list => plain(list.map(command => [command.code, command.indent]));
    const route = [[205, 0], [505, 0], [505, 0], [505, 0], [505, 0], [505, 0], [505, 0], [505, 0]];
    const gold = chest({ rewardKind: 'gold', amount: 50, checkSpace: true });
    assert.deepEqual(legacy(gold.pages[0].list), [...route, [125, 0], [101, 0], [401, 0], [123, 0], [0, 0]]);
    const unchecked = chest({ rewardKind: 'weapon', rewardId: 2, amount: 1, checkSpace: false });
    assert.deepEqual(legacy(unchecked.pages[0].list), [...route, [127, 0], [101, 0], [401, 0], [123, 0], [0, 0]]);
    assert.equal(gold.pages[1].conditions.selfSwitchCh, 'A');
});

test('a fractional amount or id becomes a whole number before it reaches the condition', () => {
    const event = chest({ rewardKind: 'item', rewardId: 2.7, amount: 3.9 });
    const parsed = ReactorEventCommandCodec.parseCommand(event.pages[0].list[0], 'itemCapacityCondition');
    assert.deepEqual(plain(parsed.data), { type: 'item', id: 2, amount: 3 });
    assert.deepEqual(plain(event.pages[0].list.find(command => command.code === 126).parameters), [2, 0, 0, 3]);
});

// ---- Running a generated chest in the game ---------------------------------------------

test('the whole stack must fit: empty, exact fit, short by one, full and over the cap', () => {
    for (const type of ['item', 'weapon', 'armor']) {
        const list = chest({ rewardKind: type, rewardId: 1, amount: 5 }).pages[0].list;
        for (const [held, opens] of [[0, true], [94, true], [95, false], [99, false], [120, false]]) {
            const game = world();
            if (held) game.party[{ item: '_items', weapon: '_weapons', armor: '_armors' }[type]][1] = held;
            game.run(list);
            const label = `${type}, holding ${held}`;
            assert.equal(game.count(type, 1), opens ? held + 5 : held, label);
            assert.equal(game.claimed(), opens, label);
            assert.equal(game.log.routes.length, opens ? 1 : 0, `${label}: the lid opens only on success`);
            assert.deepEqual(game.log.messages, [opens ? 'You found treasure!' : FAILURE], label);
        }
    }
});

test('a blocked chest opens once room is made, and grants the reward exactly once', () => {
    const list = chest({ rewardKind: 'item', rewardId: 1, amount: 5 }).pages[0].list;
    const game = world();
    game.give('item', 1, 97);
    game.run(list);
    assert.equal(game.count('item', 1), 97);
    assert.equal(game.claimed(), false);
    game.give('item', 1, -3);
    game.run(list);
    assert.equal(game.count('item', 1), 99);
    assert.equal(game.claimed(), true);
});

test('the cap is asked of the live party each time: a plugin\'s <Max: x>, zero and no limit at all', () => {
    const game = world();
    const reactorMax = game.party.maxItems;
    // VisuStella Items & Equips Core's rule: <Max: x> on the entry, else its default.
    game.party.maxItems = item => (/<Max:\s*(\d+)>/i.exec(item.note) ? Number(RegExp.$1) : 99);
    const ether = amount => chest({ rewardKind: 'item', rewardId: 2, amount }).pages[0].list;
    game.run(ether(4));
    assert.equal(game.count('item', 2), 0, '<Max: 3> holds back a stack of 4');
    game.run(ether(3));
    assert.equal(game.count('item', 2), 3, 'and lets a stack of 3 through');

    game.party.maxItems = () => 0;
    game.run(chest({ rewardKind: 'weapon', rewardId: 1, amount: 1 }).pages[0].list);
    assert.equal(game.count('weapon', 1), 0, 'a cap of zero takes nothing');

    game.party.maxItems = () => Infinity;
    game.party._armors[1] = 1e6;
    game.run(chest({ rewardKind: 'armor', rewardId: 1, amount: 9 }).pages[0].list);
    assert.equal(game.count('armor', 1), 1e6 + 9, 'no limit, no block');

    game.party.maxItems = reactorMax;
    game.context.$dataSystem.rrHigherLimits = true;
    game.party._items[1] = 500;
    game.run(chest({ rewardKind: 'item', rewardId: 1, amount: 5 }).pages[0].list);
    assert.equal(game.count('item', 1), 505, 'Reactor\'s higher limits (9999) apply when the project turns them on');
});

test('a deleted database entry fails the check quietly and gives nothing', () => {
    const game = world();
    game.run(chest({ rewardKind: 'item', rewardId: 42, amount: 1 }).pages[0].list);
    assert.equal(game.claimed(), false);
    assert.deepEqual(game.log.messages, [FAILURE]);
    assert.deepEqual(plain(game.party._items), {});
});

test('a gold chest pays out as it always has', () => {
    const game = world();
    game.context.$gameParty._gold = 0;
    game.context.$gameParty.maxGold = () => 99999999;
    game.run(chest({ rewardKind: 'gold', amount: 50 }).pages[0].list);
    assert.equal(game.context.$gameParty._gold, 50);
    assert.equal(game.claimed(), true);
});
