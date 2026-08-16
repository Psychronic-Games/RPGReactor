const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
const EventManager = vm.runInNewContext(`${source}\nEventManager;`, {
    console: { log() {}, warn() {}, error() {} }
});

function managerWithMap() {
    const manager = Object.create(EventManager.prototype);
    manager.currentMap = { width: 20, height: 15, events: [null] };
    manager.getNextEventId = EventManager.prototype.getNextEventId;
    return manager;
}

function codes(event, page = 0) {
    return JSON.parse(JSON.stringify(event.pages[page].list.map(command => [command.code, command.indent])));
}

const plain = value => JSON.parse(JSON.stringify(value));

test('Transfer quick event creates a below-character player-touch transfer', () => {
    const manager = managerWithMap();
    const event = manager.buildQuickEvent('transfer', 3, 4, {
        destination: { mapId: 8, x: 11, y: 6 }, direction: 2, fadeType: 1
    });
    assert.equal(event.name, 'Transfer');
    assert.equal(event.pages[0].priorityType, 0);
    assert.equal(event.pages[0].trigger, 1);
    assert.deepEqual(plain(event.pages[0].list[0].parameters), [0, 8, 11, 6, 2, 1]);
    assert.deepEqual(codes(event), [[201, 0], [0, 0]]);
});

test('Door quick event animates itself and transfers the player', () => {
    const manager = managerWithMap();
    const event = manager.buildQuickEvent('door', 2, 2, {
        characterName: '!Door1', characterIndex: 2,
        destination: { mapId: 4, x: 5, y: 7 },
        se: { name: 'Open1', volume: 90, pitch: 100, pan: 0 }
    });
    const page = event.pages[0];
    assert.equal(page.directionFix, true);
    assert.equal(page.image.characterName, '!Door1');
    assert.deepEqual(codes(event), [
        [205, 0], [505, 0], [505, 0], [505, 0], [505, 0], [505, 0],
        [505, 0], [505, 0], [201, 0], [0, 0]
    ]);
    assert.deepEqual(plain(page.list.at(-2).parameters), [0, 4, 5, 7, 0, 0]);
    assert.equal(page.list[0].parameters[1].wait, true);
});

test('Treasure quick event supports every reward command and an opened page', () => {
    const manager = managerWithMap();
    const rewardCases = [
        ['gold', 0, 125, [0, 0, 3]],
        ['item', 4, 126, [4, 0, 0, 3]],
        ['weapon', 5, 127, [5, 0, 0, 3, false]],
        ['armor', 6, 128, [6, 0, 0, 3, false]]
    ];
    for (const [rewardKind, rewardId, code, parameters] of rewardCases) {
        const event = manager.buildQuickEvent('treasure', 1, 1, {
            characterName: '!Chest', rewardKind, rewardId, amount: 3, message: 'Found it.'
        });
        const reward = event.pages[0].list.find(command => command.code === code);
        assert.deepEqual(plain(reward.parameters), parameters, rewardKind);
        assert.deepEqual(plain(event.pages[0].list.at(-2)), { code: 123, indent: 0, parameters: ['A', 0] });
        assert.equal(event.pages[1].conditions.selfSwitchValid, true);
        assert.equal(event.pages[1].conditions.selfSwitchCh, 'A');
        assert.equal(event.pages[1].image.direction, 8);
    }
});

test('Inn quick event branches on gold, charges, fades, and recovers the party', () => {
    const manager = managerWithMap();
    const event = manager.buildQuickEvent('inn', 6, 9, { price: 125, currency: 'G' });
    const list = event.pages[0].list;
    assert.deepEqual(plain(list.find(command => command.code === 111).parameters), [7, 125, 0]);
    assert.deepEqual(plain(list.find(command => command.code === 125).parameters), [1, 0, 125]);
    assert.deepEqual(plain(list.find(command => command.code === 314).parameters), [0, 0]);
    assert.deepEqual(codes(event), [
        [101, 0], [401, 0], [102, 0], [402, 0], [111, 1], [125, 2],
        [221, 2], [230, 2], [314, 2], [222, 2], [411, 1], [101, 2],
        [401, 2], [412, 1], [402, 0], [404, 0], [0, 0]
    ]);
});

test('Quick event commit validates and creates one undo step', () => {
    const manager = managerWithMap();
    let saves = 0;
    let renders = 0;
    let selected = null;
    manager.saveState = () => { saves++; };
    manager.renderEvents = () => { renders++; };
    manager.selectEvent = event => { selected = event; };
    manager.getEventAt = (x, y) => manager.currentMap.events.find(event => event?.x === x && event?.y === y) || null;
    const event = manager.buildQuickEvent('transfer', 2, 3, {
        destination: { mapId: 2, x: 4, y: 5 }
    });
    assert.equal(manager.commitQuickEvent(event), true);
    assert.equal(manager.currentMap.events[event.id], event);
    assert.equal(saves, 1);
    assert.equal(renders, 1);
    assert.equal(selected, event);
    assert.equal(manager.commitQuickEvent(manager.buildQuickEvent('inn', 2, 3)), false,
        'an occupied target is rejected without another undo state');
    assert.equal(saves, 1);
});

test('Event context menu exposes all four MZ quick-event generators', () => {
    assert.match(source, /quickEvent\.title/);
    for (const kind of ['transfer', 'door', 'treasure', 'inn']) {
        assert.match(source, new RegExp(`showQuickEventDialog\\('${kind}'`));
    }
});
