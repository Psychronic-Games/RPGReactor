const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const Hud = require('../../runtime/reactor_ui_action.js');
const Tactical = require('../../runtime/reactor_ui_fight.js');
const Stock = require('../src/utils/StockInterfaces.js');
const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');

/** A 2D context that only counts what was asked of it. */
function fakeContext() {
    const calls = { fillText: [], drawImage: 0, images: [], paths: 0 };
    const gradient = { addColorStop() {} };
    return new Proxy({ calls }, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
            if (key === 'fillText') return (text, x, y) => calls.fillText.push([String(text), Math.round(x), Math.round(y)]);
            if (key === 'drawImage') return (...args) => { calls.drawImage++; calls.images.push(args.slice(1)); };
            if (key === 'beginPath') return () => { calls.paths++; };
            if (key === 'measureText') return text => ({ width: String(text).length * 10 });
            return () => {};
        },
        set(target, key, value) { target[key] = value; return true; }
    });
}

const theme = () => ({
    font: (size, bold) => `${bold ? 'bold ' : ''}${size}px test`,
    textColor: '#ffffff', systemColor: '#84aaff', outlineColor: 'rgba(0,0,0,0.6)', outlineWidth: 3, crisisColor: '#ffff40', deathColor: '#ff2020',
    gauge: { hp: ['#e08040', '#f0c040'], mp: ['#4080c0', '#40c0f0'], tp: ['#00a040', '#00e060'], back: '#202040' },
    terms: { level: 'Lv', hp: 'HP', mp: 'MP', tp: 'TP' }, iconSize: 32, faceSize: 144,
    face: () => ({ width: 576, height: 288 }), character: () => false, icons: () => ({ width: 512, height: 640 }), thumbnail: () => false
});

const database = {
    system: { partyMembers: [1], optDisplayTp: true, terms: { basic: ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP'], commands: [] }, advanced: { screenWidth: 1280, screenHeight: 720 } },
    actors: [null, { id: 1, name: 'Reid', classId: 1, initialLevel: 3, faceName: 'Actor1', faceIndex: 0, characterName: 'Actor1', characterIndex: 0, equips: [2] }],
    classes: [null, { id: 1, name: 'Soldier', params: [0, 1, 2, 3, 4, 5, 6, 7].map(p => [0, 100 + p, 110 + p, 120 + p, 130 + p]) }],
    enemies: [null, { id: 1, name: 'Bat', params: [200, 0, 30, 30, 30, 30, 30, 30] }],
    weapons: [null, { id: 1, name: 'Sword', iconIndex: 97 }, { id: 2, name: 'Rifle', iconIndex: 110 }],
    skills: [null, { id: 1, name: 'Attack', stypeId: 0 }, { id: 2, name: 'Guard', stypeId: 0 }, { id: 3, name: 'Fire', stypeId: 1, iconIndex: 64, mpCost: 5 },
        { id: 4, name: 'Dash', stypeId: 1, iconIndex: 70, tpCost: 10 }, { id: 5, name: 'Heal', stypeId: 1, iconIndex: 72, mpCost: 8 }],
    items: [null, { id: 1, name: 'Potion', itypeId: 1, iconIndex: 176 }],
    states: [null, { id: 1, name: 'KO', iconIndex: 1 }, { id: 2, name: 'Poison', iconIndex: 2 }]
};

function overlaps(a, b) { return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height; }

function stockRects(mode, width, height) {
    const anchors = { topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0], center: [0.5, 0.5], bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1] };
    const rects = {};
    for (const node of Hud.stockNodes(mode, { width, height })) {
        const [ax, ay] = anchors[node.anchor];
        rects[node.name] = { x: Math.round(width * ax - node.width * ax + node.x), y: Math.round(height * ay - node.height * ay + node.y), width: node.width, height: node.height };
    }
    return rects;
}

test('the runtime and the editor draw the Action HUD from one file, byte for byte, loaded after the Tactical one it shares a pen with', () => {
    assert.equal(read('editor/src/utils/ActionHud.js'), read('runtime/reactor_ui_action.js'));
    assert.match(read('editor/index.html'), /src\/utils\/FightHud\.js[\s\S]*src\/utils\/ActionHud\.js[\s\S]*src\/utils\/StockInterfaces\.js/);
    assert.match(read('runtime/reactor_main.js'), /"js\/reactor_ui_fight\.js",\s*"js\/reactor_ui_action\.js",\s*"js\/reactor_ui\.js"/);
    for (const name of ['text', 'roundedPath', 'clippedPath', 'drawGauge', 'drawPortrait']) assert.equal(typeof Tactical[name], 'function', name);
});

test('two presentations, two roles, two System fields; one set of eight nodes whose settings come back in range', () => {
    assert.deepEqual(Object.keys(Hud.MODES), ['action', 'firstPerson']);
    assert.deepEqual([Hud.MODES.action.field, Hud.MODES.firstPerson.field], ['reactorActionInterfaceId', 'reactorFirstPersonInterfaceId']);
    assert.deepEqual([Hud.boundId({ reactorActionInterfaceId: 4 }, 'action'), Hud.boundId({ reactorActionInterfaceId: 4 }, 'firstPerson'), Hud.boundId({ reactorTacticalInterfaceId: 4 }, 'action'),
        Hud.boundId({ reactorFirstPersonInterfaceId: 7 }, 'firstPerson'), Hud.boundId({}, 'tactical')], [4, 0, 0, 7, 0]);
    assert.equal(Hud.NODE_TYPES.length, 8);
    for (const type of Hud.NODE_TYPES) {
        const defaults = Hud.defaultProps(type);
        for (const [key, kind, label, value] of Hud.SETTINGS[type]) {
            assert.ok(['select', 'check', 'number', 'color'].includes(kind) && typeof label === 'string' && label, `${type}.${key}`);
            assert.deepEqual(defaults[key], value);
        }
        assert.deepEqual(Hud.normalizeProps({}, type), Object.assign(Object.fromEntries(Hud.SETTINGS[type].map(setting => [setting[0], setting[3]])), { actionLabels: {} }));
    }
    const cross = Hud.normalizeProps({ crossStyle: 'star', crossColor: 'red', crossLength: 999, hitMarker: 0, actionLabels: { reloading: 'Loading', nothing: 'x' } }, 'actionCrosshair');
    assert.deepEqual([cross.crossStyle, cross.crossColor, cross.crossLength, cross.hitMarker], ['cross', '#ffffff', 40, false]);
    assert.deepEqual(cross.actionLabels, { reloading: 'Loading' });
    assert.deepEqual(Hud.normalizeProps({}, 'fightUnit'), {}, 'nothing for a node that is not its own');
});

test('the crosshair: four styles, the spread as its gap, hit and kill markers, dimmed while reloading, gone while dashing', () => {
    const hud = Hud.sampleHud(database).hud;
    const state = (changes, sprinting) => { const copy = JSON.parse(JSON.stringify(hud)); Object.assign(copy.crosshair, changes.crosshair || {}); Object.assign(copy.ammo, changes.ammo || {}); Object.assign(copy.weapon, changes.weapon || {}); return Hud.crossState(copy, sprinting, {}); };
    const rest = state({});
    assert.deepEqual(rest, { gap: 12, onTarget: 1, hit: 0, kill: 0, aiming: 0, reload: 0, sprinting: 0, ranged: 1 });
    // The key changes with what is drawn and with nothing else: a spread that moves under two pixels is the same picture.
    assert.equal(Hud.crossKey(state({ crosshair: { spread: 12.8 } })), Hud.crossKey(rest));
    assert.notEqual(Hud.crossKey(state({ crosshair: { spread: 15 } })), Hud.crossKey(rest));
    const keys = [state({ crosshair: { hit: 9 } }), state({ crosshair: { kill: 9 } }), state({ crosshair: { onTarget: false } }), state({ crosshair: { aiming: true } }),
        state({ ammo: { reload: 0.5 } }), state({}, true), state({ weapon: { ranged: false } })].map(Hud.crossKey);
    assert.equal(new Set([...keys, Hud.crossKey(rest)]).size, 8, 'each state is its own picture');
    assert.equal(state({ crosshair: { spread: 500 } }).gap, 40, 'never wider than the sprite');
    assert.equal(state({ ammo: { reload: 0.999 } }).reload, 12);
    for (const crossStyle of Hud.CROSS_STYLES) {
        const node = Object.assign(Hud.defaultProps('actionCrosshair'), { crossStyle });
        for (const changes of [{}, { crosshair: { hit: 5 } }, { crosshair: { kill: 5 } }, { ammo: { reload: 0.4 } }, { weapon: { ranged: false } }]) {
            const ctx = fakeContext();
            Hud.drawCrosshair(ctx, 96, node, state(changes));
            assert.ok(ctx.calls.paths > 0, `${crossStyle}: something is drawn`);
            assert.equal(ctx.calls.fillText.length, 0);
        }
    }
    // A kill is drawn apart from a hit: more strokes (its ring).
    const node = Hud.defaultProps('actionCrosshair');
    const strokes = changes => { const ctx = fakeContext(); Hud.drawCrosshair(ctx, 96, node, state(changes)); return ctx.calls.paths; };
    assert.ok(strokes({ crosshair: { kill: 5 } }) > strokes({ crosshair: { hit: 5 } }));
    assert.ok(strokes({ crosshair: { hit: 5 } }) > strokes({}));
    assert.equal(strokes({ crosshair: { hit: 5 } }), (() => { const ctx = fakeContext(); Hud.drawCrosshair(ctx, 96, Object.assign({}, node, { hitMarker: true }), state({ crosshair: { hit: 5 } })); return ctx.calls.paths; })());
    assert.equal((() => { const ctx = fakeContext(); Hud.drawCrosshair(ctx, 96, Object.assign({}, node, { hitMarker: false }), state({ crosshair: { hit: 5 } })); return ctx.calls.paths; })(), strokes({}));
});

test('vitals: HP large on a clipped gauge, MP and TP smaller side by side, the portrait only where asked for', () => {
    const { hud, unit } = Hud.sampleHud(database);
    for (const [width, height] of [[256, 64], [306, 88], [450, 144]]) {
        for (const showPortrait of [false, true]) {
            const node = Object.assign(Hud.defaultProps('actionVitals'), { showPortrait });
            const layout = Hud.vitalsLayout(node, width, height);
            for (const part of [layout.header, layout.hp, layout.mp, layout.tp]) assert.ok(part.x >= 0 && part.y >= 0 && part.x + part.width <= width + 1 && part.y + part.height <= height + 1, JSON.stringify(part));
            assert.ok(layout.hp.height > layout.mp.height, 'HP is the tall one');
            assert.deepEqual([layout.mp.y, layout.mp.width], [layout.tp.y, layout.tp.width]);
            assert.ok(layout.tp.x >= layout.mp.x + layout.mp.width + 8);
            assert.equal(!!layout.portrait, showPortrait);
            if (showPortrait) assert.ok(Math.abs(layout.portrait.y - (height - layout.portrait.y - layout.portrait.size)) <= 1 && layout.hp.x > layout.portrait.size);
            const ctx = fakeContext();
            Hud.drawVitals(ctx, width, height, node, hud, unit, theme());
            const words = ctx.calls.fillText.map(call => call[0]);
            for (const word of ['Reid', 'HP', hud.hp + '/' + hud.mhp, 'MP', String(hud.mp), 'TP', '35']) assert.ok(words.includes(word), `missing ${word} in ${words}`);
            // Two state icons, and the face when it is shown.
            assert.equal(ctx.calls.drawImage, 2 + (showPortrait ? 1 : 0));
        }
    }
    const bare = Object.assign(Hud.defaultProps('actionVitals'), { showMp: false, showTp: false, showName: false, showStates: false });
    const layout = Hud.vitalsLayout(bare, 300, 40);
    assert.deepEqual([layout.header, layout.mp, layout.tp], [null, null, null]);
});

test('the weapon: magazine large and reserve small, a reload bar, a blade\'s combo steps, the carried weapons on a switch', () => {
    const sample = Hud.sampleHud(database);
    const node = Hud.defaultProps('actionWeapon');
    const words = (hud, extra) => { const ctx = fakeContext(); Hud.drawWeapon(ctx, 220, 80, node, hud, theme(), extra); return ctx.calls; };
    let calls = words(sample.hud, sample.extra);
    const text = () => calls.fillText.map(call => call[0]);
    // The battle keeps no reserve: the magazine's count alone, over the magazine drawn round by round (ten pips).
    assert.deepEqual(text(), ['1/3', 'Rifle', '7']);
    assert.equal(calls.drawImage, 1, 'the weapon\'s icon');
    const big = (() => { const copy = JSON.parse(JSON.stringify(sample.hud)); Object.assign(copy.ammo, { magazine: 22, capacity: 30 }); return copy; })();
    assert.ok(words(big, sample.extra).paths < words(Object.assign({}, big, { ammo: Object.assign({}, big.ammo, { capacity: 12, magazine: 9 }) }), sample.extra).paths + 2, 'a long magazine is one bar');
    // A reserve the battle counts is written beside the magazine; a reload shows its word, and the bar fills.
    const reloading = JSON.parse(JSON.stringify(sample.hud));
    Object.assign(reloading.ammo, { magazine: 0, reserve: 24, reload: 0.5 });
    calls = words(reloading, sample.extra);
    assert.deepEqual(text(), ['1/3', 'Rifle', 'Reloading', '0', '/ 24']);
    const magazine = calls.fillText.find(call => call[0] === '0'), reserve = calls.fillText.find(call => call[0] === '/ 24');
    assert.ok(magazine[1] < reserve[1], 'the magazine, then the reserve');
    calls = (() => { const ctx = fakeContext(); Hud.drawWeapon(ctx, 220, 80, Object.assign({}, node, { showReserve: false }), reloading, theme(), sample.extra); return ctx.calls; })();
    assert.ok(!text().includes('/ 24'));
    // The weapon's own model as its picture, when there is one.
    calls = words(sample.hud, Object.assign({}, sample.extra, { picture: { width: 128, height: 128 } }));
    assert.equal(calls.images[0].length, 4, 'drawn whole, not cut from the icon sheet');
    // A blade: no magazine, its combo's steps as pips.
    const blade = Hud.sampleHud(database, { melee: true });
    calls = words(blade.hud, blade.extra);
    assert.ok(!text().includes('7') && !text().some(word => word.startsWith('/')));
    const plain = (() => { const ctx = fakeContext(); Hud.drawWeapon(ctx, 220, 80, Object.assign({}, node, { showCombo: false }), blade.hud, theme(), blade.extra); return ctx.calls; })();
    assert.ok(calls.paths >= plain.paths + 3, 'three steps, three pips');
    // Just switched: the row of carried weapons takes the name's place.
    calls = words(sample.hud, Object.assign({}, sample.extra, { switching: true, carried: [110, 97, 98] }));
    assert.ok(!text().includes('Rifle'));
    assert.equal(calls.drawImage, 3);
});

test('the hotbar: every slot framed on one row, its key and cost, a shade while it cools, dimmed when it cannot be used', () => {
    const sample = Hud.sampleHud(database);
    const node = Hud.defaultProps('actionHotbar');
    const count = sample.hud.hotbar.length;
    assert.equal(count, 4);
    const layout = Hud.hotbarLayout(node, 440, 56, count, {});
    assert.deepEqual([layout.size, layout.step, layout.y], [56, 62, 0]);
    assert.equal(layout.x0, Math.floor((440 - (4 * 62 - 6)) / 2), 'centered');
    assert.equal(Hud.hotbarLayout(node, 200, 56, 8, {}).size, Math.floor(206 / 8) - 6, 'eight slots shrink to fit the width');
    assert.equal(Hud.hotbarLayout(Object.assign({}, node, { slotSize: 40 }), 440, 56, 4, {}).size, 40);
    const ctx = fakeContext();
    Hud.drawHotbar(ctx, 440, 56, node, sample.hud, theme(), Object.assign(sample.extra, { costColors: ['', '', '', ''] }));
    assert.deepEqual(ctx.calls.fillText.map(call => call[0]), ['1', '5', '2', '10', '3', '8', '4']);
    assert.equal(ctx.calls.drawImage, 4);
    // Keys come from the game's own key map, whatever the player bound.
    assert.deepEqual(Hud.hotbarKeys({ 49: 'hotbar1', 81: 'hotbar2', 112: 'hotbar3', 9: 'hotbar4', 50: 'ok' }, 4), ['1', 'Q', 'F1', 'Tab']);
    assert.deepEqual(Hud.hotbarKeys(null, 2), ['', '']);
    assert.deepEqual([Hud.keyName(65), Hud.keyName(57), Hud.keyName(32), Hud.keyName(999)], ['A', '9', 'Space', '']);
});

test('the target, the world bars, the damage marks and the text lines draw what the battle hands over', () => {
    const sample = Hud.sampleHud(database, { locked: true });
    let ctx = fakeContext();
    Hud.drawTarget(ctx, 360, 48, Hud.defaultProps('actionTarget'), sample.hud, theme());
    assert.deepEqual(ctx.calls.fillText.map(call => call[0]), ['[ Bat ]', '120/200']);
    ctx = fakeContext();
    Hud.drawTarget(ctx, 360, 48, Hud.defaultProps('actionTarget'), Object.assign({}, sample.hud, { target: null }), theme());
    assert.deepEqual([ctx.calls.fillText.length, ctx.calls.paths], [0, 0], 'no target, nothing drawn');
    ctx = fakeContext();
    Hud.drawWorldBar(ctx, 64, 8, Hud.defaultProps('actionBars'), 0.5, true);
    Hud.drawLockMarker(ctx, 58, '#ffff40');
    Hud.drawDamageArc(ctx, 320, '#d82828');
    Hud.drawVignette(ctx, 160, 90, '#d82828');
    assert.equal(ctx.calls.fillText.length, 0);
    // The low-HP edge: nothing above the threshold, stronger the lower the HP, nothing for the fallen.
    const node = Hud.defaultProps('actionDamage');
    assert.equal(Hud.vignetteAlpha(node, 31, 100), 0);
    assert.ok(Hud.vignetteAlpha(node, 29, 100) > 0 && Hud.vignetteAlpha(node, 5, 100) > Hud.vignetteAlpha(node, 29, 100) && Hud.vignetteAlpha(node, 5, 100) <= 0.85);
    assert.equal(Hud.vignetteAlpha(node, 0, 100), 0);
    assert.equal(Hud.vignetteAlpha(Object.assign({}, node, { showVignette: false }), 5, 100), 0);
    ctx = fakeContext();
    Hud.drawInfo(ctx, 320, 32, Hud.defaultProps('actionInfo'), sample.hud, theme(), []);
    assert.deepEqual(ctx.calls.fillText.map(call => call[0]), ['Defeat all enemies']);
    ctx = fakeContext();
    Hud.drawInfo(ctx, 320, 88, Object.assign(Hud.defaultProps('actionInfo'), { actionInfo: 'feed', feedLines: 2 }), sample.hud, theme(), [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    assert.deepEqual(ctx.calls.fillText.map(call => call[0]), ['a', 'b'], 'the newest lines, as many as the node holds');
});

test('the two stock layouts: against the edges, nothing but the crosshair near the middle, at 4:3 and 16:9', () => {
    for (const mode of ['firstPerson', 'action']) {
        for (const [width, height] of [[816, 624], [1024, 768], [1280, 720], [1920, 1080]]) {
            const rects = stockRects(mode, width, height), at = `${mode} ${width}x${height}`;
            for (const [name, rect] of Object.entries(rects)) assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, `${at}: ${name} leaves the screen`);
            const cross = rects.Crosshair;
            assert.deepEqual([cross.x + cross.width / 2, cross.y + cross.height / 2], [width / 2, height / 2], `${at}: the crosshair is the middle`);
            const middle = { x: width * 0.3, y: height * 0.22, width: width * 0.4, height: height * 0.56 };
            for (const name of ['Vitals', 'Weapon', 'Hotbar', 'Target', 'Objective', 'Notices']) assert.ok(!overlaps(rects[name], middle), `${at}: ${name} covers the middle`);
            // Vitals lower left, weapon lower right, the hotbar between them on one baseline, none touching.
            const bottom = rect => rect.y + rect.height;
            assert.ok(rects.Vitals.x < width * 0.05 && rects.Weapon.x + rects.Weapon.width > width * 0.95);
            assert.deepEqual([bottom(rects.Vitals), bottom(rects.Weapon)], [bottom(rects.Hotbar), bottom(rects.Hotbar)], `${at}: one baseline`);
            assert.equal(rects.Vitals.height, rects.Weapon.height);
            assert.ok(!overlaps(rects.Hotbar, rects.Vitals) && !overlaps(rects.Hotbar, rects.Weapon), `${at}: the hotbar touches a panel`);
            assert.ok(rects.Hotbar.x - (rects.Vitals.x + rects.Vitals.width) >= 8 && rects.Weapon.x - (rects.Hotbar.x + rects.Hotbar.width) >= 8, `${at}: no gap round the hotbar`);
            assert.ok(Math.abs((rects.Hotbar.x + rects.Hotbar.width / 2) - width / 2) <= 1);
            assert.ok(!overlaps(rects.Target, rects.Objective) && !overlaps(rects.Target, rects.Notices));
            assert.deepEqual([rects.Damage.width, rects.Damage.height], [width, height]);
        }
    }
    // Third person: the same pieces, larger, with the portrait and the mark on the locked opponent.
    const first = Hud.stockNodes('firstPerson', { width: 1280, height: 720 }), third = Hud.stockNodes('action', { width: 1280, height: 720 });
    assert.deepEqual(first.map(node => node.type), third.map(node => node.type));
    const named = (nodes, name) => nodes.find(node => node.name === name);
    assert.ok(named(third, 'Vitals').height > named(first, 'Vitals').height && named(third, 'Weapon').width > named(first, 'Weapon').width);
    assert.deepEqual([named(first, 'Vitals').showPortrait, named(third, 'Vitals').showPortrait, named(first, 'Enemy Bars').lockMarker, named(third, 'Enemy Bars').lockMarker], [false, true, false, true]);
    assert.deepEqual([Hud.stockRecord('action').mode, Hud.stockRecord('firstPerson').mode, Hud.stockRecord('action').roles, Hud.stockRecord('nonsense').mode], ['action', 'firstPerson', ['action'], 'action']);
});

//-----------------------------------------------------------------------------
// The runtime, against stubs for the engine classes it extends.

function loadRuntime({ system = {}, interfaces = [] } = {}) {
    class Bitmap {
        constructor(width, height) { this.width = width; this.height = height; this.context = fakeContext(); this.clears = 0; }
        clear() { this.clears++; this.context.calls.fillText.length = 0; }
        fillAll() {}
        isReady() { return true; }
    }
    function Window_Base() { this.initialize(...arguments); }
    Window_Base.prototype.initialize = function(rect) {
        Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true, alpha: 1, children: [], parent: null });
        this.updatePadding();
        this.createContents();
    };
    Window_Base.prototype.updatePadding = function() { this.padding = 12; };
    Window_Base.prototype.contentsWidth = function() { return this.width - this.padding * 2; };
    Window_Base.prototype.contentsHeight = function() { return this.height - this.padding * 2; };
    Window_Base.prototype.createContents = function() { this.contents = new Bitmap(this.contentsWidth(), this.contentsHeight()); };
    Window_Base.prototype.update = function() {};
    Window_Base.prototype.addChild = function(child) { this.children.push(child); child.parent = this; };
    Window_Base.prototype.destroy = function() { this.destroyed = true; };
    let sprites = 0;
    class Sprite {
        constructor(bitmap) { sprites++; Object.assign(this, { bitmap, x: 0, y: 0, alpha: 1, opacity: 255, rotation: 0, visible: true, parent: null, children: [] }); this.anchor = { set() {} }; this.scale = { set() {} }; }
        addChild(child) { this.children.push(child); child.parent = this; }
        addChildAt(child, index) { this.children.splice(index, 0, child); child.parent = this; }
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; }
        destroy() { this.destroyed = true; }
    }
    const stub = () => { const C = function() {}; C.prototype.initialize = function() {}; return C; };
    const SceneBattle = stub();
    SceneBattle.prototype.createDisplayObjects = function() { this.built = (this.built || 0) + 1; };
    SceneBattle.prototype.update = function() { this.frames = (this.frames || 0) + 1; };
    for (const name of ['isTimeActive', 'needsInputWindowChange', 'onEnemyCancel', 'onActorCancel', 'onSkillOk', 'onSkillCancel', 'commandSkill']) SceneBattle.prototype[name] = function() { return true; };
    const layer = { x: 0, y: 0, children: [], addChildAt(child, index) { this.children.splice(index, 0, child); child.parent = this; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; } };
    const listeners = {};
    const sandbox = {
        console, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' }, require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true }, Bitmap, Sprite, Window_Base, Window_Selectable: stub(),
        Scene_MenuBase: stub(), Scene_Boot: stub(), Scene_Map: stub(), Scene_Battle: SceneBattle, Scene_Title: stub(), Scene_Menu: stub(), Scene_Status: stub(),
        Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(),
        TouchInput: { isTriggered: () => false, x: 0, y: 0 }, BattleManager: { actor: () => null, isTpb: () => false },
        Graphics: { width: 1280, height: 720, boxWidth: 1280, boxHeight: 720 },
        DataManager: { isTitleSkip: () => false }, ConfigManager: { save() {} }, PluginManager: { registerCommand() {} },
        SceneManager: { _stack: [], _scene: null, push() {}, goto() {} },
        ColorManager: new Proxy({}, { get: (_, key) => () => '#' + String(key).length.toString(16).padStart(6, '0') }),
        TextManager: { levelA: 'Lv', hpA: 'HP', mpA: 'MP', tpA: 'TP' },
        ImageManager: { iconWidth: 32, faceWidth: 144, loadFace: () => new Bitmap(576, 288), loadCharacter: () => new Bitmap(576, 384), loadSystem: () => new Bitmap(512, 640) },
        Input: { keyMapper: { 49: 'hotbar1', 50: 'hotbar2', 51: 'hotbar3', 52: 'hotbar4' } },
        ReactorEvents: { on(name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); }, off(name, fn) { listeners[name] = (listeners[name] || []).filter(entry => entry !== fn); },
            emit(name, payload) { for (const fn of listeners[name] || []) fn(payload); } },
        ReactorFight: { stockActionHud: undefined },
        $dataSystem: Object.assign({ variables: [], optDisplayTp: true }, system),
        $dataSkills: database.skills, $dataItems: database.items,
        $gameSystem: { mainFontFace: () => 'test, sans-serif', windowPadding: () => 12, windowOpacity: () => 192 },
        $gameMap: { mapId: () => 1 }, $gameSwitches: { value: () => false }, $gameVariables: { value: () => 0 },
        $gameActors: { actor: () => null }, $gameParty: { members: () => [], inBattle: () => false, numItems: () => 3 },
        $gamePlayer: { isDashing: () => false, isMoving: () => false },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('runtime/reactor_ui_fight.js'), sandbox);
    vm.runInContext(read('runtime/reactor_ui_action.js'), sandbox);
    vm.runInContext(read('runtime/reactor_ui.js'), sandbox);
    sandbox.$dataUserInterfaces = interfaces;
    sandbox.__layer = layer;
    sandbox.__listeners = listeners;
    sandbox.__sprites = () => sprites;
    sandbox.__scene = { _windowLayer: layer, children: [layer], addWindow(window) { layer.children.push(window); },
        addChildAt(child, index) { this.children.splice(index, 0, child); child.parent = this; }, removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; } };
    sandbox.__battleScene = () => Object.assign(new SceneBattle(), { _windowLayer: layer, addWindow(window) { layer.children.push(window); } });
    return sandbox;
}

/** A battle that hands over the contract's HUD object, updated in place as the real one is. */
function fakeFight(mode = 'firstPerson') {
    const hud = Hud.sampleHud(database).hud;
    hud.crosshair.x = 640; hud.crosshair.y = 360; hud.damage.pulse = 0; hud.damage.angle = null;
    hud.enemies = [{ unitId: 2, hp: 120, mhp: 200, x: 400, y: 200, visible: true, alerted: false }, { unitId: 3, hp: 80, mhp: 80, x: 700, y: 220, visible: true, alerted: false }];
    hud.target = null;
    const battler = { isActor: () => true, name: () => 'Reid', faceName: () => 'Actor1', faceIndex: () => 0, allIcons: () => [2], skillMpCost: skill => skill.mpCost || 0, skillTpCost: skill => skill.tpCost || 0 };
    const unit = { id: 1, team: 'ally' };
    let revision = 1;
    return { hud, isActive: () => true, isHere: () => true, mode: () => mode, isAction: () => true, actionHud: () => hud, actionRevision: () => revision,
        unit: () => unit, battler: () => battler, character: () => null, bump() { revision++; } };
}

const windowOf = (hud, name) => hud._nodeWindows.find(window => window.node().name === name);

test('the HUD exists while a battle of its mode runs, takes over from the battle\'s built-in one, and gives it back', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    assert.equal(typeof sandbox.Reactor3D, 'undefined', 'no 3D runtime is needed');
    UI.updateActionScene(scene);
    assert.equal(scene._reactorActionHud, null);
    const fight = sandbox.$gameFight = fakeFight('firstPerson');
    UI.updateActionScene(scene);
    // Made on one frame and drawn from the next.
    assert.ok(scene._reactorActionHud && scene._reactorActionHud._nodeWindows.every(window => window.visible === false));
    UI.updateActionScene(scene);
    const hud = scene._reactorActionHud;
    assert.deepEqual([hud._interface.mode, hud._interface.name, hud._actionMode], ['firstPerson', 'First Person Battle', 'firstPerson']);
    assert.deepEqual(Array.from(hud._nodeWindows, window => window.node().type).sort(), ['actionHotbar', 'actionInfo', 'actionInfo', 'actionTarget', 'actionVitals', 'actionWeapon']);
    assert.deepEqual(Array.from(hud._actionNodes, entry => entry.node.type), ['actionDamage', 'actionBars', 'actionCrosshair'], 'three nodes are sprites, not windows');
    assert.equal(sandbox.ReactorFight.stockActionHud, false, 'the battle\'s own small HUD stands down');
    assert.equal(sandbox.__listeners.unitDefeated.length, 1);
    assert.equal(scene.children.indexOf(hud._actionLayer), 0, 'the sprites sit under the windows');
    // Another mode: this HUD goes and that mode's comes.
    fight.mode = () => 'action';
    UI.updateActionScene(scene);
    assert.notEqual(scene._reactorActionHud, hud);
    assert.equal(scene._reactorActionHud._interface.mode, 'action');
    assert.equal(windowOf(scene._reactorActionHud, 'Vitals').node().showPortrait, true);
    // Tactical, Classic: not this HUD's business.
    for (const mode of ['tactical', 'classic']) {
        fight.mode = () => mode;
        UI.updateActionScene(scene);
        assert.equal(scene._reactorActionHud, null, mode);
        assert.deepEqual([sandbox.__layer.children.length, scene.children.length, sandbox.__listeners.unitDefeated.length, sandbox.ReactorFight.stockActionHud], [0, 1, 0, true], mode);
    }
});

test('a map scene that ends under a battle takes its HUD with it: the feed\'s listener, its pictures, and the built-in HUD\'s stand-down', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI;
    const mapScene = () => Object.assign(new sandbox.Scene_Map(), sandbox.__scene, { children: [sandbox.__layer] });
    sandbox.$gameFight = fakeFight('action');
    // The menu is opened and shut three times in one battle: each time the map's scene is destroyed and made anew.
    let scene = null;
    for (let visit = 0; visit < 3; visit++) {
        scene = mapScene();
        UI.updateActionScene(scene);
        UI.updateActionScene(scene);
        assert.ok(scene._reactorActionHud, 'visit ' + visit);
        assert.equal(sandbox.__listeners.unitDefeated.length, 1, 'one HUD hears who fell, visit ' + visit);
        if (typeof scene.destroy === 'function') scene.destroy();
        assert.equal(sandbox.__listeners.unitDefeated.length, 0, 'the scene gone, nothing of it listens');
        assert.equal(scene._reactorActionHud, null);
        assert.equal(sandbox.__layer.children.length, 0, 'its windows are off the layer');
        assert.equal(sandbox.ReactorFight.stockActionHud, true, 'and the built-in HUD is not left standing down');
    }
    // The battle over on a later scene: the built-in HUD is the battle's again.
    scene = mapScene();
    UI.updateActionScene(scene);
    UI.updateActionScene(scene);
    sandbox.$gameFight = null;
    UI.updateActionScene(scene);
    assert.deepEqual([sandbox.__listeners.unitDefeated.length, sandbox.ReactorFight.stockActionHud], [0, true]);
    // A scene with no battle HUD, and one whose HUD failed, end as they always did.
    const quiet = mapScene();
    quiet._reactorActionHud = false;
    quiet._reactorFightHud = false;
    quiet.destroy();
    assert.equal(quiet._reactorActionHud, null);
});

test('each node is drawn again only when what it shows changes; the crosshair, bars and marks are sprites that only move', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight('firstPerson');
    UI.updateActionScene(scene);
    UI.updateActionScene(scene);
    const hud = scene._reactorActionHud, state = hud._actionState, data = fight.hud;
    const names = ['Vitals', 'Weapon', 'Hotbar', 'Objective'];
    const clears = () => names.map(name => windowOf(hud, name).contents.clears);
    const text = name => windowOf(hud, name).contents.context.calls.fillText.map(call => call[0]);
    assert.ok(text('Vitals').includes('Reid') && text('Weapon').includes('7') && text('Objective').includes('Defeat all enemies'));
    assert.deepEqual(text('Hotbar').filter(word => /^[1-4]$/.test(word)), ['1', '2', '3', '4'], 'the keys the player has bound');
    assert.equal(windowOf(hud, 'Target').visible, false, 'nothing aimed at: no target bar');
    assert.equal(windowOf(hud, 'Notices').visible, false);
    for (let i = 0; i < 25; i++) UI.updateActionScene(scene);
    // Sixty frames with the aim point wandering (the per-frame fields) and nothing else: not one drawing, not one new sprite.
    const before = clears(), sprites = sandbox.__sprites(), crossDraws = state.crossSprite.bitmap.clears;
    for (let i = 0; i < 60; i++) { data.crosshair.x = 640 + i; data.crosshair.spread = 12 + (i % 2) * 0.4; UI.updateActionScene(scene); }
    assert.deepEqual(clears(), before);
    assert.deepEqual([sandbox.__sprites(), state.crossSprite.bitmap.clears], [sprites, crossDraws]);
    assert.equal(state.crossSprite.x, 699, 'the crosshair follows the aim by moving');
    // A shot: only the weapon is drawn again.
    data.ammo.magazine = 6;
    UI.updateActionScene(scene);
    assert.deepEqual(clears(), [before[0], before[1] + 1, before[2], before[3]]);
    assert.ok(text('Weapon').includes('6'));
    // A hit taken: only the vitals; their flash is a sprite that fades, not a drawing.
    data.hp -= 10; data.damage.pulse = 1; data.damage.angle = 180;
    UI.updateActionScene(scene);
    assert.deepEqual(clears(), [before[0] + 1, before[1] + 1, before[2], before[3]]);
    const vitals = windowOf(hud, 'Vitals');
    assert.equal(vitals._flash.opacity, 110);
    assert.deepEqual([state.arcSprite.visible, Math.round(state.arcSprite.rotation * 100)], [true, 314], 'the arc turns toward the hit');
    for (let i = 9; i >= 0; i--) { data.damage.pulse = i / 10; UI.updateActionScene(scene); }
    assert.deepEqual(clears(), [before[0] + 1, before[1] + 1, before[2], before[3]], 'fading costs no drawing');
    assert.deepEqual([vitals._flash.opacity, state.arcSprite.visible], [0, false]);
    // A cooldown: the hotbar alone, at most 24 drawings for the whole of it however many frames it lasts.
    const hot = windowOf(hud, 'Hotbar').contents.clears;
    for (let i = 600; i >= 0; i--) { data.hotbar[0].cooldown = i / 600; UI.updateActionScene(scene); }
    const drawn = windowOf(hud, 'Hotbar').contents.clears - hot;
    assert.ok(drawn >= 20 && drawn <= 25, `${drawn} drawings over 600 frames`);
    assert.deepEqual([clears()[0], clears()[1], clears()[3]], [before[0] + 1, before[1] + 1, before[3]]);
    // A reload: the weapon in at most 41 steps, the crosshair in at most 13.
    const weapon = windowOf(hud, 'Weapon').contents.clears, cross = state.crossSprite.bitmap.clears;
    for (let i = 0; i <= 300; i++) { data.ammo.reload = i < 300 ? (i + 1) / 301 : 0; UI.updateActionScene(scene); }
    assert.ok(windowOf(hud, 'Weapon').contents.clears - weapon <= 42 && state.crossSprite.bitmap.clears - cross <= 14);
    // An opponent comes under the crosshair: the target bar shows, drawn once; its HP changing draws it once more.
    data.target = { unitId: 2, name: 'Bat', hp: 120, mhp: 200, team: 'enemy', locked: false };
    UI.updateActionScene(scene);
    const target = windowOf(hud, 'Target');
    assert.equal(target.visible, true);
    const targetDraws = target.contents.clears;
    for (let i = 0; i < 20; i++) UI.updateActionScene(scene);
    assert.equal(target.contents.clears, targetDraws);
    data.target.hp = 90;
    UI.updateActionScene(scene);
    assert.equal(target.contents.clears, targetDraws + 1);
    // The battle says something else changed (another objective): the line is drawn again, once.
    data.objective = 'Survive 3 turns';
    fight.bump();
    UI.updateActionScene(scene);
    assert.equal(clears()[3], before[3] + 1);
    assert.ok(text('Objective').includes('Survive 3 turns'));
    // An opponent falls: a notice, which runs out by itself.
    sandbox.ReactorEvents.emit('unitDefeated', { unitId: 3, team: 'enemy', battler: { name: () => 'Bat' } });
    UI.updateActionScene(scene);
    assert.deepEqual(text('Notices'), ['Bat defeated']);
    assert.equal(windowOf(hud, 'Notices').visible, true);
    for (let i = 0; i < 260; i++) UI.updateActionScene(scene);
    assert.equal(windowOf(hud, 'Notices').visible, false);
    assert.equal(state.feedPool.length, 1, 'its line is kept for the next notice');
});

test('world bars come from a pool: only opponents just hit or aimed at, only the ones on screen, and the lock mark in third person', () => {
    const sandbox = loadRuntime();
    const UI = sandbox.ReactorUI, scene = sandbox.__scene;
    const fight = sandbox.$gameFight = fakeFight('action');
    const data = fight.hud;
    UI.updateActionScene(scene);
    const state = scene._reactorActionHud._actionState;
    const node = scene._reactorActionHud._actionNodes.find(entry => entry.node.type === 'actionBars').node;
    for (let i = 0; i < 5; i++) UI.updateActionScene(scene);
    assert.deepEqual([state.bars.length, state.barsShown], [0, 0], 'nobody hit, nobody aimed at: no bar, no sprite');
    // One is hit: one bar, over its head, for a while.
    data.enemies[0].hp = 100;
    UI.updateActionScene(scene);
    assert.deepEqual([state.bars.length, state.barsShown, state.bars[0].visible], [1, 1, true]);
    assert.deepEqual([state.bars[0].x, state.bars[0].y], [400 - node.barWidth / 2, 200 - node.barHeight]);
    const draws = state.bars[0].bitmap.clears;
    data.enemies[0].x = 420;
    for (let i = 0; i < 30; i++) UI.updateActionScene(scene);
    assert.deepEqual([state.bars[0].x, state.bars[0].bitmap.clears], [420 - node.barWidth / 2, draws], 'it follows by moving');
    // The other is aimed at and locked: a second bar, and the mark on it.
    data.target = { unitId: 3, name: 'Slime', hp: 80, mhp: 80, team: 'enemy', locked: true };
    UI.updateActionScene(scene);
    assert.deepEqual([state.bars.length, state.barsShown], [2, 2]);
    assert.deepEqual([state.lockSprite.visible, state.lockSprite.x], [true, 700]);
    // One leaves the screen: its bar is hidden, the sprite kept.
    data.enemies[0].visible = false;
    UI.updateActionScene(scene);
    assert.deepEqual([state.barsShown, state.bars.length, state.bars[1].visible], [1, 2, false]);
    // After the node's time the hit one's bar goes; the aimed one's stays; no sprite is ever made again.
    data.enemies[0].visible = true;
    const made = sandbox.__sprites();
    for (let i = 0; i < node.barFrames + 5; i++) UI.updateActionScene(scene);
    assert.deepEqual([state.barsShown, state.bars.length, sandbox.__sprites()], [1, 2, made]);
    data.target = null;
    UI.updateActionScene(scene);
    assert.deepEqual([state.barsShown, state.lockSprite.visible], [0, false]);
    // First person has no mark in the world.
    const first = loadRuntime();
    first.$gameFight = fakeFight('firstPerson');
    first.$gameFight.hud.target = { unitId: 3, name: 'Slime', hp: 80, mhp: 80, team: 'enemy', locked: true };
    first.ReactorUI.updateActionScene(first.__scene);
    assert.equal(first.__scene._reactorActionHud._actionState.lockSprite, null);
});

test('four kinds of battle, four HUDs, none reading another\'s record or nodes', () => {
    const box = id => ({ id, type: 'box', name: 'Box ' + id, x: 10 * id, y: 0, width: 100, height: 40, fill: 'color' });
    const classic = { id: 8, name: 'Battle', mode: 'battle', coordinateSpace: 'screen', roles: ['battle'], nodes: [box(1), { id: 2, type: 'actionVitals', x: 0, y: 0, width: 300, height: 90 }, { id: 3, type: 'actionCrosshair', x: 0, y: 0, width: 96, height: 96 }] };
    const tactical = Object.assign({ id: 9 }, Tactical.stockRecord({ width: 1280, height: 720 }));
    tactical.nodes = [...tactical.nodes, { id: 90, type: 'actionHotbar', x: 0, y: 0, width: 400, height: 56 }];
    const action = Object.assign({ id: 10 }, Hud.stockRecord('action', { width: 1280, height: 720 }), { name: 'Mine' });
    action.nodes = [...action.nodes, { id: 90, type: 'fightUnit', x: 0, y: 0, width: 300, height: 140 }, { id: 91, type: 'fightWindow', x: 0, y: 0, width: 200, height: 200 }];
    const first = Object.assign({ id: 11 }, Hud.stockRecord('firstPerson', { width: 1280, height: 720 }), { name: 'Mine too' });
    const interfaces = [null, null, null, null, null, null, null, null, classic, tactical, action, first];
    const bound = { reactorBattleInterfaceId: 8, reactorTacticalInterfaceId: 9, reactorActionInterfaceId: 10, reactorFirstPersonInterfaceId: 11 };
    let sandbox = loadRuntime({ system: bound, interfaces });
    let UI = sandbox.ReactorUI;
    assert.deepEqual([UI.battleInterface().name, UI.fightInterface().name, UI.actionInterface('action').name, UI.actionInterface('firstPerson').name], ['Battle', 'Tactical Battle', 'Mine', 'Mine too']);
    assert.equal(UI.actionInterface('tactical'), null);
    // Each field takes only a record of its own presentation: anything else plays that mode's stock layout.
    for (const wrong of [8, 9, 11]) {
        const ui = loadRuntime({ system: { reactorActionInterfaceId: wrong }, interfaces }).ReactorUI;
        assert.deepEqual([ui.actionInterface('action').name, ui.actionInterface('action').mode], ['Action Battle', 'action'], `record ${wrong} bound as the Action HUD`);
    }
    assert.equal(loadRuntime({ system: { reactorBattleInterfaceId: 10 }, interfaces }).ReactorUI.battleInterface(), null);
    assert.equal(loadRuntime({ system: { reactorTacticalInterfaceId: 10 }, interfaces }).ReactorUI.fightInterface().name, 'Tactical Battle');
    // A Classic battle: its record's own box, and nothing of the Action nodes dropped into it by hand.
    const battle = sandbox.__battleScene();
    sandbox.$gameFight = fakeFight('action');
    battle.createDisplayObjects();
    for (let i = 0; i < 3; i++) battle.update();
    assert.deepEqual(Array.from(sandbox.__layer.children, window => window.node().name), ['Box 1']);
    assert.deepEqual([battle._reactorActionHud, battle._reactorFightHud, battle._reactorBattleHud._actionNodes], [undefined, undefined, undefined]);
    assert.equal(sandbox.ReactorFight.stockActionHud, undefined, 'and the Action battle\'s built-in HUD is not touched from there');
    // On the map, an Action battle: the Action record; its Tactical nodes are nothing; the Tactical HUD stays away.
    sandbox = loadRuntime({ system: bound, interfaces });
    UI = sandbox.ReactorUI;
    sandbox.$gameFight = fakeFight('action');
    UI.updateActionScene(sandbox.__scene);
    UI.updateFightScene(sandbox.__scene);
    const hud = sandbox.__scene._reactorActionHud;
    assert.equal(hud._interface.name, 'Mine');
    assert.ok(!hud._nodeWindows.some(window => window.node().type.startsWith('fight')) && hud._fightNodes === undefined);
    assert.equal(sandbox.__scene._reactorFightHud, null);
    // A Tactical battle: the Tactical record; its Action node is nothing; the Action HUD stays away.
    sandbox = loadRuntime({ system: bound, interfaces });
    UI = sandbox.ReactorUI;
    const reader = Tactical.sampleReader(database);
    sandbox.$gameFight = Object.assign(reader, { isActive: () => true, isHere: () => true, mode: () => 'tactical' });
    UI.updateActionScene(sandbox.__scene);
    UI.updateFightScene(sandbox.__scene);
    assert.equal(sandbox.__scene._reactorActionHud, null);
    const tacticalHud = sandbox.__scene._reactorFightHud;
    assert.ok(tacticalHud._nodeWindows.length > 0 && !tacticalHud._nodeWindows.some(window => window.node().type.startsWith('action')) && tacticalHud._actionNodes === undefined);
    assert.equal(sandbox.ReactorFight.stockActionHud, undefined);
    // The Classic and Tactical records read the same with and without the Action half's settings on their nodes.
    assert.doesNotMatch(JSON.stringify(UI.normalizeInterface(classic).nodes.filter(node => node.type === 'box')), /crossStyle|slotSize|barFrames|actionLabels/);
    assert.doesNotMatch(JSON.stringify(UI.normalizeInterface(tactical).nodes.filter(node => node.type.startsWith('fight'))), /crossStyle|slotSize|barFrames|actionLabels/);
});

//-----------------------------------------------------------------------------
// The editor.

test('the editor offers the two roles, their presentations, the eight nodes and two stock layouts, each kept to its own', () => {
    const previous = { window: global.window, escape: global.rrEscapeHtml, document: global.document, stock: global.RRStockInterfaces };
    global.window = {};
    global.rrEscapeHtml = value => String(value);
    global.document = { createElement: () => ({ className: '', innerHTML: '' }) };
    global.RRStockInterfaces = Stock;
    try {
        const roles = Object.fromEntries(Editor.REPLACEMENT_ROLES.map(([role, label, field]) => [role, [label, field]]));
        assert.deepEqual([roles.action, roles.firstPerson], [['Action Battle', 'reactorActionInterfaceId'], ['First Person Battle', 'reactorFirstPersonInterfaceId']]);
        assert.equal(new Set(Editor.REPLACEMENT_ROLES.map(role => role[2])).size, Editor.REPLACEMENT_ROLES.length);
        for (const type of Hud.NODE_TYPES) {
            assert.ok(Editor.NODE_TYPES.includes(type) && Editor.isActionNode(type));
            const node = Editor.defaultNode(type, 3);
            assert.deepEqual([node.id, node.type, node.width, node.height], [3, type, Hud.SIZES[type][0], Hud.SIZES[type][1]]);
        }
        assert.equal(Editor.isActionNode('fightUnit'), false);
        assert.deepEqual(Stock.KINDS.slice(13, 16), ['tactical', 'action', 'firstPerson']);
        const records = Stock.build({ system: database.system });
        assert.deepEqual(records.slice(14, 16).map(record => [record.id, record.name, record.mode, record.stock, record.roles]),
            [[15, 'Action Battle', 'action', 'action', ['action']], [16, 'First Person Battle', 'firstPerson', 'firstPerson', ['firstPerson']]]);
        assert.deepEqual(records[14].nodes, Hud.stockNodes('action', { width: 1280, height: 720 }), 'the editor builds the layout the game falls back to');
        assert.deepEqual(records[15].nodes, Hud.stockNodes('firstPerson', { width: 1280, height: 720 }));
        assert.deepEqual(records.slice(0, 14).map(record => record.stock).slice(12), ['battle', 'tactical'], 'earlier baselines keep their ids');
        // Use As: each presentation fills its own role and no other.
        const editor = new Editor({ data: database }, null, null, null);
        const modes = ['scene', 'battle', 'tactical', 'action', 'firstPerson'];
        for (const mode of modes) {
            editor.current = { mode };
            assert.deepEqual(['menu', 'battle', 'tactical', 'action', 'firstPerson'].filter(role => editor.roleFitsMode(role)), [mode === 'scene' ? 'menu' : mode], mode);
        }
        const record = editor.normalizeInterface(JSON.parse(JSON.stringify(Object.assign({ id: 15 }, records[14]))));
        assert.deepEqual([record.mode, record.nodes.length], ['action', 9]);
        assert.equal(record.nodes.find(node => node.type === 'actionVitals').showPortrait, true);
        // Stock Layout over a bound record of another kind takes off the binding it can no longer fill.
        const system = Object.assign({}, database.system, { reactorTacticalInterfaceId: 9, reactorBattleInterfaceId: 8 });
        const manager = { data: Object.assign({}, database, { system }), getSystem: () => system };
        const lay = Object.create(Editor.prototype);
        Object.assign(lay, { databaseManager: manager, wrapper: null, _t: text => text,
            current: lay.normalizeInterface.call({ databaseManager: manager, nextNodeId: Editor.prototype.nextNodeId, screenMetrics: Editor.prototype.screenMetrics }, Object.assign({ id: 9 }, Tactical.stockRecord({ width: 1280, height: 720 }))),
            undoStack: [], redoStack: [], selectedIds: new Set(), selectedId: 0, renderTree() {}, renderProperties() {}, refreshFirstFocus() {}, scheduleRender() {} });
        assert.equal(lay.applyStockLayout('firstPerson'), true);
        assert.deepEqual([lay.current.mode, system.reactorTacticalInterfaceId, system.reactorBattleInterfaceId], ['firstPerson', 0, 8]);
        assert.ok(!Stock.buildOne('battle', { system: database.system }).nodes.some(node => Hud.isActionNode(node.type)));
        assert.ok(!Stock.buildOne('tactical', { system: database.system }).nodes.some(node => Hud.isActionNode(node.type)));
    } finally {
        global.window = previous.window; global.rrEscapeHtml = previous.escape; global.document = previous.document;
        if (previous.stock === undefined) delete global.RRStockInterfaces; else global.RRStockInterfaces = previous.stock;
    }
});

test('the editor canvas draws the Action HUD with the game\'s own drawing: the same words in the same places', () => {
    const editor = new Editor({ data: database }, null, null, null);
    editor._t = text => text;
    const record = editor.normalizeInterface(Object.assign({ id: 16 }, Hud.stockRecord('firstPerson', { width: 1280, height: 720 })));
    editor.current = record;
    editor.scale = 1;
    editor.ctx = fakeContext();
    editor.skin = { image: null };
    editor.image = () => ({ image: null, failed: true });
    editor.drawSurface = () => {};
    const draw = name => {
        editor.ctx.calls.fillText.length = 0;
        const node = record.nodes.find(entry => entry.name === name);
        editor.drawActionNode(node, { x: 0, y: 0, width: node.width, height: node.height });
        return editor.ctx.calls.fillText.map(call => call.join(','));
    };
    const sample = editor.actionPreview();
    const game = (name, paint) => {
        const node = record.nodes.find(entry => entry.name === name);
        const ctx = fakeContext(), pad = node.fill === 'window' ? 24 : 0;
        paint(ctx, node, node.width - pad, node.height - pad, editor.fightTheme(node));
        return ctx.calls.fillText.map(call => call.join(','));
    };
    assert.deepEqual(draw('Vitals'), game('Vitals', (ctx, node, w, h, look) => Hud.drawVitals(ctx, w, h, node, sample.hud, sample.unit, look)));
    assert.deepEqual(draw('Weapon'), game('Weapon', (ctx, node, w, h, look) => Hud.drawWeapon(ctx, w, h, node, sample.hud, look, sample.extra)));
    assert.deepEqual(draw('Hotbar'), game('Hotbar', (ctx, node, w, h, look) => Hud.drawHotbar(ctx, w, h, node, sample.hud, look, sample.extra)));
    assert.deepEqual(draw('Target'), game('Target', (ctx, node, w, h, look) => Hud.drawTarget(ctx, w, h, node, sample.hud, look)));
    assert.ok(draw('Vitals').some(call => call.startsWith('Reid')) && draw('Weapon').some(call => call.startsWith('Rifle')));
    assert.deepEqual(draw('Objective').map(call => call.split(',')[0]), ['Defeat all enemies']);
    for (const name of ['Crosshair', 'Enemy Bars', 'Damage']) { const paths = editor.ctx.calls.paths; assert.deepEqual(draw(name), []); assert.ok(editor.ctx.calls.paths > paths || name === 'Enemy Bars', name); }
    // In a record that is not an Action HUD the game draws nothing for these nodes, and the canvas says so with an outline alone.
    record.mode = 'tactical';
    assert.deepEqual(draw('Vitals'), []);
});
