'use strict';
// The Victory interface: what a won battle shows. The shared half
// (runtime/reactor_ui_victory.js, the same text as editor/src/utils/VictoryHud.js)
// is tested as plain values and on a recording canvas; the runtime half
// (reactor_ui.js, BattleManager's victory step, the level-up message rule)
// against stubs for the engine classes it extends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const V = require('../../runtime/reactor_ui_victory.js');
const Stock = require('../src/utils/StockInterfaces.js');
const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');

const SCREENS = [[640, 480], [816, 624], [1280, 720], [1920, 1080]];

function fakeContext() {
    const calls = { fillText: [], drawImage: 0, styles: [] };
    const gradient = { addColorStop() {} };
    const state = { tx: 0, ty: 0, stack: [] };
    return new Proxy({ calls }, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient') return () => gradient;
            if (key === 'save') return () => state.stack.push([state.tx, state.ty]);
            if (key === 'restore') return () => { const at = state.stack.pop(); if (at) { state.tx = at[0]; state.ty = at[1]; } };
            if (key === 'translate') return (x, y) => { state.tx += x; state.ty += y; };
            if (key === 'fillText') return (text, x, y) => calls.fillText.push([String(text), Math.round(x + state.tx), Math.round(y + state.ty)]);
            if (key === 'drawImage') return () => { calls.drawImage++; };
            if (key === 'measureText') return text => ({ width: String(text).length * 9 });
            return () => {};
        },
        set(target, key, value) { target[key] = value; if (key === 'fillStyle' || key === 'strokeStyle') calls.styles.push(String(value)); return true; }
    });
}

const theme = () => ({
    font: (size, bold) => `${bold ? 'bold ' : ''}${size}px test`,
    textColor: '#ffffff', systemColor: '#84aaff', outlineColor: 'rgba(0,0,0,0.6)', outlineWidth: 3, crisisColor: '#ffff40', deathColor: '#ff2020',
    gauge: { hp: ['#e08040', '#f0c040'], mp: ['#4080c0', '#40c0f0'], tp: ['#00a040', '#00e060'], back: '#202040' },
    terms: { level: 'Lv', hp: 'HP', mp: 'MP', tp: 'TP', exp: 'EXP', currency: 'G', params: ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'],
        obtainExp: '%1 %2 received!', obtainGold: '%1\\G found!' },
    own: {}, paletteColor: () => '#ffffff', iconSize: 32, faceSize: 144,
    face: () => ({ width: 576, height: 288 }), character: () => ({ width: 576, height: 384 }), icons: () => ({ width: 512, height: 640 }), thumbnail: () => false
});

const database = (screen = [1280, 720]) => ({
    system: { partyMembers: [1, 2, 3], currencyUnit: 'G', advanced: { screenWidth: screen[0], screenHeight: screen[1] },
        terms: { basic: ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP', 'EXP', 'EXP'], params: ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'], messages: {} } },
    actors: [null, { id: 1, name: 'Reid', classId: 1, initialLevel: 3, faceName: 'Actor1', faceIndex: 0 }, { id: 2, name: 'Priscilla', classId: 1, initialLevel: 5, faceName: 'Actor1', faceIndex: 1 },
        { id: 3, name: 'Gale', classId: 1, initialLevel: 2, faceName: '', characterName: 'Actor1', characterIndex: 2 }],
    classes: [null, { id: 1, expParams: [30, 20, 30, 30], params: [0, 1, 2, 3, 4, 5, 6, 7].map(p => Array.from({ length: 100 }, (_, level) => 20 + level * (p + 2))), learnings: [{ level: 4, skillId: 4 }] }],
    skills: [null, { id: 1, name: 'Attack', stypeId: 0 }, { id: 2, name: 'Guard', stypeId: 0 }, { id: 3, name: '-----Magic', stypeId: 1 }, { id: 4, name: 'Fire', stypeId: 1, iconIndex: 64 }],
    items: [null, { id: 1, name: 'Potion', itypeId: 1, iconIndex: 176, description: 'Restores 500 HP to one ally.' }, { id: 2, name: 'Gate Key', itypeId: 2, iconIndex: 195, description: 'Opens the north gate.' }],
    weapons: [null, { id: 1, name: 'Sword', wtypeId: 1, iconIndex: 97, description: 'A plain blade.' }],
    armors: [null, { id: 1, name: 'Shield', atypeId: 1, etypeId: 2, iconIndex: 128, description: '' }]
});

const snapshot = (level, exp, extra = {}) => Object.assign({ actorId: 1, name: 'Reid', level, exp, params: [100, 20, 10, 10, 10, 10, 10, 10], skills: [], dead: false, reserve: false }, extra);
const curve = level => (level - 1) * 100;
const sizeOf = node => ({ width: node.width, height: node.height });
const stockNodes = (width, height) => V.stockNodes({ width, height }).map(node => Object.assign(node, V.normalizeProps(node, node.type)));

//-----------------------------------------------------------------------------
// The shared half

test('the editor carries the same file the game runs, and the game boots it before the interfaces', () => {
    assert.equal(read('editor/src/utils/VictoryHud.js'), read('runtime/reactor_ui_victory.js'));
    const main = read('runtime/reactor_main.js');
    assert.ok(main.indexOf('"js/reactor_ui_victory.js"') > 0 && main.indexOf('"js/reactor_ui_victory.js"') < main.indexOf('"js/reactor_ui.js"'));
    for (const file of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) assert.ok(read('editor/build-scripts/' + file).includes("'reactor_ui_victory.js'"), file);
    const page = read('editor/index.html');
    assert.ok(page.indexOf('src/utils/VictoryHud.js') > page.indexOf('src/utils/FightHud.js') && page.indexOf('src/utils/VictoryHud.js') < page.indexOf('src/utils/StockInterfaces.js'));
});

test('a stored node is read with every setting in range, and a missing one at its default', () => {
    const party = V.normalizeProps({ columns: 99, fillFrames: 1, barColor1: 'red', showLevel: false, victoryLabels: { levelUp: 'Rank Up!', nothing: 'x', max: '' } }, 'victoryParty');
    assert.equal(party.columns, 8);
    assert.equal(party.fillFrames, 10);
    assert.equal(party.barColor1, '#44ff88');
    assert.equal(party.showLevel, false);
    assert.equal(party.showBar, true);
    assert.deepEqual(party.victoryLabels, { levelUp: 'Rank Up!' });
    assert.equal(V.normalizeProps({ victoryText: 'nonsense', victoryPage: 'rewards' }, 'victoryText').victoryText, 'title');
    assert.equal(V.normalizeProps({ victoryPage: 'rewards' }, 'victoryText').victoryPage, 'rewards');
    assert.deepEqual(V.normalizeProps({}, 'box'), {});
    for (const type of V.NODE_TYPES) assert.deepEqual(V.normalizeProps(V.defaultProps(type), type), Object.fromEntries(Object.entries(V.defaultProps(type)).filter(([key]) => V.SETTINGS[type].some(s => s[0] === key) || key === 'victoryLabels')));
    // A node shows on the page of its type; any other node on the page it names, else on every page.
    assert.equal(V.pageOf({ type: 'victoryRewards', victoryPage: 'exp' }), 'rewards');
    assert.equal(V.pageOf({ type: 'box', victoryPage: 'levelUp' }), 'levelUp');
    assert.equal(V.pageOf({ type: 'box' }), '');
    assert.equal(V.pageOf({ type: 'victoryText', victoryPage: 'nonsense' }), '');
});

test('a word is the node\'s own, else the project\'s battle term, else the stock word', () => {
    assert.equal(V.label({ victoryLabels: { title: 'Triumph' } }, 'title', { own: { victoryTitle: 'Won' } }), 'Triumph');
    assert.equal(V.label({ victoryLabels: {} }, 'title', { own: { victoryTitle: 'Won' } }), 'Won');
    assert.equal(V.label({}, 'title', { own: {} }), 'Victory!');
    assert.equal(V.termKey('levelUpTitle'), 'victoryLevelUpTitle');
    for (const [type, keys] of Object.entries(V.NODE_LABELS)) {
        for (const key of Array.isArray(keys) ? keys : Object.values(keys).flat()) assert.ok(V.LABELS[key], `${type} names the word ${key}`);
    }
});

test('a member is what the actor was before and is after: nothing is worked out again', () => {
    const before = snapshot(3, 250, { skills: [{ id: 1, name: 'Attack' }] });
    const after = snapshot(5, 470, { params: [140, 20, 14, 10, 10, 10, 11, 10], skills: [{ id: 1, name: 'Attack' }, { id: 9, name: 'Cleave', iconIndex: 77 }] });
    const member = V.member(before, after, curve, false);
    assert.deepEqual([member.level0, member.level1, member.exp0, member.exp1], [3, 5, 250, 470]);
    assert.deepEqual(member.floors, [200, 300, 400, 500], 'the start of each level from the old one to the one after the new');
    assert.deepEqual(member.skills, [{ id: 9, name: 'Cleave', iconIndex: 77 }]);
    assert.deepEqual(member.params1.map((value, id) => value - member.params0[id]), [40, 0, 4, 0, 0, 0, 1, 0]);
    // The bar starts where it was, rolls over at each level and ends where it is.
    const at = {};
    assert.deepEqual(Object.assign({}, V.memberAt(member, 0, at)), { level: 3, exp: 250, gained: 0, max: false, into: 50, need: 100, rate: 0.5 });
    assert.equal(V.memberAt(member, 0.25, at).level, 4, '305 EXP is in level 4');
    assert.deepEqual(Object.assign({}, V.memberAt(member, 1, at)), { level: 5, exp: 470, gained: 220, max: false, into: 70, need: 100, rate: 0.7 });
    // An actor at its last level shows a full bar.
    const capped = V.member(snapshot(98, 9750), snapshot(99, 9900), curve, true);
    assert.equal(V.memberAt(capped, 1, at).max, true);
    assert.equal(at.rate, 1);
    assert.equal(V.memberAt(capped, 0, at).max, false, 'not yet at the last level while the bar fills toward it');
    // A member who gained nothing (EXP for reserve members off) is shown as it is.
    const idle = V.member(snapshot(2, 150), snapshot(2, 150), curve, false);
    assert.equal(V.memberAt(idle, 1, at).gained, 0);
    assert.deepEqual(idle.skills, []);
});

test('the things found are listed once each with how many, marked by kind', () => {
    const potion = { id: 1, name: 'Potion', itypeId: 1 }, key = { id: 1, name: 'Key', itypeId: 2 }, sword = { id: 1, name: 'Sword', wtypeId: 1 }, shield = { id: 1, name: 'Shield', atypeId: 1 };
    const grouped = V.groupItems([potion, sword, potion, shield, key, potion, null]);
    assert.deepEqual(grouped.map(entry => [entry.kind, entry.name, entry.count]), [['item', 'Potion', 3], ['weapon', 'Sword', 1], ['armor', 'Shield', 1], ['keyItem', 'Key', 1]]);
    assert.deepEqual(V.groupItems(null), []);
});

test('the pages: Experience always, Level Up when someone gained a level, Rewards when something was found', () => {
    const nodes = stockNodes(816, 624);
    const quiet = { exp: 40, gold: 0, items: [], members: [V.member(snapshot(2, 110), snapshot(2, 150), curve, false)] };
    assert.deepEqual(V.pages(nodes, quiet, sizeOf).map(page => page.kind), ['exp'], 'no level, nothing found: one page, one press');
    const gold = Object.assign({}, quiet, { gold: 30 });
    assert.deepEqual(V.pages(nodes, gold, sizeOf).map(page => page.kind), ['exp', 'rewards']);
    const sample = V.sampleSummary(database());
    assert.deepEqual(V.pages(nodes, sample, sizeOf).map(page => page.kind), ['exp', 'levelUp', 'rewards']);
    // More than a page holds: the kind takes more pages, never a cut-off list.
    const many = Object.assign({}, sample, { items: Array.from({ length: 30 }, (_, id) => ({ kind: 'item', id, name: 'Item ' + id, iconIndex: 1, description: '', count: 1 })) });
    const pages = V.pages(nodes, many, sizeOf).filter(page => page.kind === 'rewards');
    assert.ok(pages.length > 1);
    assert.equal(pages.reduce((sum, page) => sum + page.count, 0), 31, 'the gold and every thing found are on some page');
    assert.equal(pages[1].from, pages[0].count);
    // A record without a node has no page of that kind; one with none of them still has a page to close.
    assert.deepEqual(V.pages(nodes.filter(node => node.type !== 'victoryLevels'), sample, sizeOf).map(page => page.kind), ['exp', 'rewards']);
    assert.deepEqual(V.pages(nodes.filter(node => !V.isVictoryNode(node.type)), sample, sizeOf).map(page => page.kind), ['exp']);
    // A page where nobody gained EXP has no fill to wait for.
    const none = { exp: 0, gold: 0, items: [], members: [V.member(snapshot(2, 150), snapshot(2, 150), curve, false)] };
    assert.equal(V.pages(nodes, none, sizeOf)[0].frames, 0);
    assert.equal(V.pages(nodes, quiet, sizeOf)[0].frames, 90);
    // Reserve members show only when they gained EXP, and only where the node says so.
    const party = nodes.find(node => node.type === 'victoryParty');
    const reserve = { members: [V.member(snapshot(2, 110), snapshot(2, 150), curve, false), V.member(snapshot(2, 110, { reserve: true }), snapshot(2, 150, { reserve: true }), curve, false),
        V.member(snapshot(2, 110, { reserve: true }), snapshot(2, 110, { reserve: true }), curve, false)] };
    assert.equal(V.shownMembers(reserve, party).length, 2);
    assert.equal(V.shownMembers(reserve, Object.assign({}, party, { showReserve: false })).length, 1);
});

function runOf(summary, screen = [816, 624]) {
    const nodes = stockNodes(...screen);
    const run = V.newRun(summary, V.pages(nodes, summary, sizeOf), nodes.find(node => node.type === 'victoryParty'));
    return run;
}

test('a patient player presses once a page; a first press finishes a fill and a second moves on', () => {
    const summary = V.sampleSummary(database());
    const run = runOf(summary);
    assert.equal(run.pages.length, 3);
    // Nothing is heard for the first frames, so the key that ended the battle does not skip a page.
    assert.equal(V.step(run, { ok: true }), 0);
    assert.equal(run.index, 0);
    let presses = 0, levels = 0;
    for (let frame = 0; frame < 2000 && !run.closed; frame++) {
        const press = !V.isFilling(run) && run.lock === 0;
        if (press) presses++;
        const events = V.step(run, { ok: press });
        if (events & V.EVENT_LEVEL) levels++;
    }
    assert.equal(run.closed, true);
    assert.equal(presses, run.pages.length, 'never more presses than pages');
    assert.ok(levels >= 1, 'a level gained during the fill is announced');
    // An impatient one: the press during the fill finishes it, with its level-up announced at once.
    const hasty = runOf(summary);
    hasty.lock = 0;
    V.step(hasty, {});
    assert.equal(V.isFilling(hasty), true);
    const events = V.step(hasty, { ok: true });
    assert.equal(events & V.EVENT_SKIP, V.EVENT_SKIP);
    assert.equal(events & V.EVENT_LEVEL, V.EVENT_LEVEL);
    assert.equal(hasty.index, 0, 'still on the page');
    assert.equal(V.isFilling(hasty), false);
    assert.equal(V.progress(hasty), 1);
    assert.deepEqual(hasty.levels, hasty.members.map(member => member.level1));
    // The full bars are seen before the next press counts.
    assert.equal(V.step(hasty, { ok: true }), 0);
    assert.equal(hasty.index, 0);
    for (let frame = 1; frame < V.LOCK_FRAMES; frame++) V.step(hasty, {});
    assert.equal(V.step(hasty, { ok: true }), V.EVENT_PAGE);
    assert.equal(hasty.index, 1);
});

test('a player who presses as fast as they can still sees every page', () => {
    const summary = V.sampleSummary(database());
    const run = runOf(summary);
    // Eight presses a second from before the first page opens.
    const seen = run.pages.map(() => 0);
    let presses = 0, frames = 0;
    for (; frames < 2000 && !run.closed; frames++) {
        const index = run.index, press = frames % 7 === 0;
        if (press) presses++;
        V.step(run, { ok: press });
        if (!run.closed && run.index === index) seen[index]++;
    }
    assert.equal(run.closed, true);
    for (const [index, shown] of seen.entries()) assert.ok(shown >= V.LOCK_FRAMES, `page ${index + 1} was up for ${shown} frames`);
    assert.ok(seen[0] >= V.LOCK_FRAMES * 2, 'the first page: once as it opens, once more with its bars full');
    assert.ok(frames < 180, `and it is still over in ${frames} frames`);
    // Cancel twice in a row: the last page is seen before the second one closes it.
    const skipped = runOf(summary);
    skipped.lock = 0;
    V.step(skipped, { cancel: true });
    let waited = 0;
    while (!skipped.closed && waited < 100) { V.step(skipped, { cancel: true }); waited++; }
    assert.ok(waited > V.LOCK_FRAMES);
    // A held key is not slowed: each page still leaves by itself after its moment.
    const held = runOf(summary);
    let heldFrames = 0;
    while (!held.closed && heldFrames < 1000) { V.step(held, { held: true }); heldFrames++; }
    assert.ok(heldFrames < 150, `held through in ${heldFrames} frames`);
});

test('Cancel goes to the last page and closes from there; a held key runs the fill faster and moves on by itself', () => {
    const summary = V.sampleSummary(database());
    const run = runOf(summary);
    run.lock = 0;
    const events = V.step(run, { cancel: true });
    assert.equal(run.index, run.pages.length - 1);
    assert.equal(events & V.EVENT_LEVEL, V.EVENT_LEVEL, 'the levels passed over are still announced, once');
    assert.equal(run.closed, false);
    assert.equal(V.step(run, { cancel: true }), 0, 'the page it jumped to is seen first');
    run.lock = 0;
    assert.equal(V.step(run, { cancel: true }), V.EVENT_CLOSE);
    assert.equal(run.closed, true);
    assert.equal(V.step(run, { ok: true }), 0, 'a closed run takes nothing more');
    // Held: the fill is over in a quarter of its frames, and each page is left after a moment by itself.
    const held = runOf(summary);
    held.lock = 0;
    let frames = 0;
    while (V.isFilling(held) && frames < 1000) { V.step(held, { held: true }); frames++; }
    assert.ok(frames <= Math.ceil(90 / V.FAST) + 1, `the fill took ${frames} frames held`);
    for (let frame = 0; frame < 2000 && !held.closed; frame++) V.step(held, { held: true });
    assert.equal(held.closed, true);
    // Not held, nothing pressed: it waits on its page for as long as it takes.
    const waiting = runOf(summary);
    for (let frame = 0; frame < 2000; frame++) V.step(waiting, {});
    assert.equal(waiting.index, 0);
    assert.equal(waiting.closed, false);
});

test('the stock layout stands inside the screen at every size, each page\'s node inside the panel', () => {
    for (const [width, height] of SCREENS) {
        const record = Stock.buildOne('victory', database([width, height]));
        assert.equal(record.mode, 'victory');
        assert.deepEqual(record.roles, ['victory']);
        const byId = new Map(record.nodes.map(node => [node.id, node]));
        const rectOf = node => {
            const parent = byId.get(node.parent);
            const frame = parent ? rectOf(parent) : { x: 0, y: 0, width, height };
            const [ax, ay] = Editor.ANCHORS[node.anchor];
            return { x: frame.x + frame.width * ax - node.width * ax + node.x, y: frame.y + frame.height * ay - node.height * ay + node.y, width: node.width, height: node.height };
        };
        const panel = rectOf(record.nodes.find(node => node.name === 'Panel'));
        assert.ok(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= height, `${width}x${height}: the panel is on the screen`);
        assert.ok(Math.abs(panel.x * 2 + panel.width - width) <= 1 && Math.abs(panel.y * 2 + panel.height - height) <= 1, 'in its middle');
        for (const node of record.nodes.filter(entry => entry.parent)) {
            const rect = rectOf(node);
            assert.ok(rect.x >= panel.x && rect.y >= panel.y && rect.x + rect.width <= panel.x + panel.width && rect.y + rect.height <= panel.y + panel.height, `${width}x${height}: ${node.name} is inside the panel`);
        }
        // The page nodes do not run under the title above them or the hint below.
        const title = rectOf(record.nodes.find(node => node.name === 'Title')), hint = rectOf(record.nodes.find(node => node.name === 'What OK does'));
        for (const type of ['victoryParty', 'victoryLevels', 'victoryRewards']) {
            const rect = rectOf(record.nodes.find(node => node.type === type));
            assert.ok(rect.y >= title.y + title.height && rect.y + rect.height <= hint.y, `${width}x${height}: ${type} between the title and the hint`);
        }
        // A party of three shares one row; two level-ups share one page.
        const nodes = record.nodes.map(node => Object.assign({}, node, V.normalizeProps(node, node.type)));
        const party = nodes.find(node => node.type === 'victoryParty');
        const grid = V.partyGrid(party, party.width, party.height, 3);
        assert.deepEqual([grid.cols, grid.rows], [3, 1]);
        assert.ok(grid.cellWidth >= 132 && grid.cellHeight >= 128);
        assert.deepEqual(V.pages(nodes, V.sampleSummary(database([width, height])), sizeOf).map(page => page.kind), ['exp', 'levelUp', 'rewards'], `${width}x${height}: three pages`);
    }
});

test('every page draws its words inside its node, at every screen size', () => {
    for (const [width, height] of SCREENS) {
        const summary = V.sampleSummary(database([width, height]));
        const nodes = stockNodes(width, height);
        const pages = V.pages(nodes, summary, sizeOf);
        const run = V.newRun(summary, pages, nodes.find(node => node.type === 'victoryParty'));
        run.lock = 0;
        for (const page of pages) {
            while (V.isFilling(run)) V.step(run, {});
            for (const node of nodes.filter(entry => V.isVictoryNode(entry.type) && (!V.pageOf(entry) || V.pageOf(entry) === page.kind))) {
                const ctx = fakeContext();
                if (node.type === 'victoryParty') V.drawParty(ctx, node.width, node.height, node, run, page, theme(), 'all');
                else if (node.type === 'victoryLevels') V.drawLevels(ctx, node.width, node.height, node, summary, page, theme());
                else if (node.type === 'victoryRewards') V.drawRewards(ctx, node.width, node.height, node, summary, page, theme());
                else V.drawText(ctx, node.width, node.height, node, V.textOf(node, run, theme()), theme());
                if (node.type !== 'victoryText' || V.textOf(node, run, theme())) assert.ok(ctx.calls.fillText.length > 0, `${width}x${height}: ${node.name} writes something on ${page.kind}`);
                for (const [text, x, y] of ctx.calls.fillText) {
                    assert.ok(x >= -1 && x <= node.width + 1 && y >= 0 && y <= node.height + 2, `${width}x${height}: "${text}" at ${x},${y} is inside ${node.name} (${node.width}x${node.height})`);
                }
            }
            run.lock = 0;
            V.step(run, { ok: true });
        }
        assert.equal(run.closed, true);
    }
});

test('what each page says: the levels, the EXP gained, the parameters with their gains, the skills, the rewards with their kinds', () => {
    const summary = V.sampleSummary(database());
    const nodes = stockNodes(1280, 720);
    const pages = V.pages(nodes, summary, sizeOf);
    const run = V.newRun(summary, pages, nodes.find(node => node.type === 'victoryParty'));
    run.lock = 0;
    const texts = (draw) => { const ctx = fakeContext(); draw(ctx); return ctx.calls.fillText.map(call => call[0]); };
    const party = nodes.find(node => node.type === 'victoryParty');
    // Before the fill: everyone at the level they had, nothing gained yet, no Level Up mark.
    const start = texts(ctx => V.drawParty(ctx, party.width, party.height, party, run, pages[0], theme(), 'all'));
    assert.ok(start.includes('Reid') && start.includes('Lv 3') && start.includes('+0 EXP'));
    assert.ok(!start.includes('Level Up!'));
    // The cards and names are one layer, the numbers another: a frame of the fill draws the second alone.
    const fixed = texts(ctx => V.drawParty(ctx, party.width, party.height, party, run, pages[0], theme(), 'static'));
    const moving = texts(ctx => V.drawParty(ctx, party.width, party.height, party, run, pages[0], theme(), 'moving'));
    assert.ok(fixed.includes('Reid') && !fixed.includes('Lv 3'));
    assert.ok(!moving.includes('Reid') && moving.includes('Lv 3'));
    while (V.isAnimating(run)) V.step(run, {});
    const end = texts(ctx => V.drawParty(ctx, party.width, party.height, party, run, pages[0], theme(), 'all'));
    const reid = summary.members[0];
    assert.ok(end.includes('Lv 4') && end.includes(`+${reid.exp1 - reid.exp0} EXP`) && end.includes('Level Up!'));
    assert.ok(end.includes(`${reid.exp1 - reid.floors[1]} / ${reid.floors[2] - reid.floors[1]}`), 'the bar reads what is in the new level');
    // Level Up: old and new level, each parameter with its gain, the skill learned.
    const levels = nodes.find(node => node.type === 'victoryLevels');
    const up = texts(ctx => V.drawLevels(ctx, levels.width, levels.height, levels, summary, pages[1], theme()));
    assert.ok(up.includes('Lv 3  →  4') && up.includes('Max HP') && up.includes('Luck') && up.includes('New skills') && up.includes('Fire'));
    assert.ok(up.includes('+' + (reid.params1[0] - reid.params0[0])), 'the gain is the difference between before and after');
    // Rewards: the gold, every thing found with its count, description and kind.
    const rewards = nodes.find(node => node.type === 'victoryRewards');
    const found = texts(ctx => V.drawRewards(ctx, rewards.width, rewards.height, rewards, summary, pages[2], theme()));
    for (const word of ['120 G', 'Gold found', 'Potion', '×2', 'Item', 'Restores 500 HP to one ally.', 'Sword', 'Weapon', 'Shield', 'Armor', 'Gate Key', 'Key Item']) assert.ok(found.includes(word), word);
    // The texts follow the page.
    const title = nodes.find(node => node.name === 'Title'), hint = nodes.find(node => node.name === 'What OK does'), counter = nodes.find(node => node.name === 'Page');
    const fresh = V.newRun(summary, pages, party);
    assert.equal(V.textOf(title, fresh, theme()), 'Victory!');
    assert.equal(V.textOf(hint, fresh, theme()), '', 'no hint while the bars fill');
    assert.equal(V.textOf(nodes.find(node => node.name === 'EXP received'), fresh, theme()), `${summary.exp} EXP received!`);
    assert.equal(V.textOf(Object.assign({}, title, { victoryText: 'gold' }), fresh, theme()), '120G found!');
    assert.equal(V.textOf(hint, run, theme()), 'Continue');
    assert.equal(V.textOf(counter, run, theme()), '1 / 3');
    V.step(run, { ok: true });
    assert.equal(V.textOf(title, run, theme()), 'Level Up');
    run.lock = 0;
    V.step(run, { ok: true });
    assert.equal(V.textOf(title, run, theme()), 'Rewards');
    assert.equal(V.textOf(hint, run, theme()), 'Close');
    // A long description is cut to two lines, never run past its card.
    const ctx = fakeContext();
    const lines = V.wrap(ctx, 'word '.repeat(60), 200, 2, []);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].endsWith('…') && lines[1].length * 9 <= 200 + 9);
    assert.equal(V.plain('\\C[2]Fire\\C[0] hits \\I[64]all\\! foes'), 'Fire hits all foes');
});

//-----------------------------------------------------------------------------
// The editor

test('Victory is a presentation, a role and a stock layout; its nodes are ordinary nodes of the record', () => {
    assert.ok(Editor.NODE_TYPES.includes('victoryParty') && Editor.NODE_TYPES.includes('victoryText'));
    assert.deepEqual(Editor.REPLACEMENT_ROLES.find(role => role[0] === 'victory'), ['victory', 'Victory', 'reactorVictoryInterfaceId']);
    assert.ok(Editor.HUD_MODES.includes('victory'), 'the role fits the Victory presentation alone');
    assert.equal(Stock.KINDS[Stock.KINDS.length - 1], 'victory', 'appended, so every earlier baseline keeps its ID');
    const built = Stock.build(database());
    assert.equal(built[Stock.KINDS.indexOf('victory')].name, 'Victory');
    const editor = new Editor({ data: database() }, null, null, null);
    editor.screenMetrics = () => ({ width: 1280, height: 720, boxWidth: 1280, boxHeight: 720, boxX: 0, boxY: 0 });
    const record = editor.normalizeInterface(Object.assign({ id: 17 }, Stock.buildOne('victory', database())));
    assert.equal(record.mode, 'victory');
    assert.deepEqual(record.roles, ['victory']);
    assert.deepEqual(record.design, { width: 1280, height: 720 });
    const party = record.nodes.find(node => node.type === 'victoryParty');
    assert.equal(party.fillFrames, 90);
    assert.equal(party.barColor1, '#44ff88');
    // A new node from + Add Node carries the shared defaults.
    const added = Editor.defaultNode('victoryRewards', 99);
    assert.equal(added.weaponColor, '#ff6644');
    assert.equal(added.fill, 'none');
    // A box may name the page it shows on; a record that names none stores none.
    const box = record.nodes.find(node => node.type === 'box');
    assert.equal('victoryPage' in box, false);
    const paged = editor.normalizeInterface({ id: 18, mode: 'victory', nodes: [{ id: 1, type: 'box', victoryPage: 'rewards' }, { id: 2, type: 'box', victoryPage: 'nonsense' }] });
    assert.equal(paged.nodes[0].victoryPage, 'rewards');
    assert.equal('victoryPage' in paged.nodes[1], false);
});

test('the editor names the plugin that keeps the victory for itself, and not one that only wraps it', () => {
    const how = (source, name) => Editor.victoryStepOf(source, name);
    // A plugin that puts its own function in place of the step, never calling the one it replaced.
    assert.equal(how('const _pv = BattleManager.processVictory;\nBattleManager.processVictory = function() { this.makeRewards(); this.custom(); };'), 'replaces');
    assert.equal(how('BattleManager.processVictory = function() { if (a) { b(); } };'), 'replaces');
    // Through a short name for BattleManager, with brackets, by Object.assign, or by naming another function.
    assert.equal(how('const BM = BattleManager;\nBM.processVictory = function() { this.makeRewards(); this.endBattle(0); };'), 'replaces');
    assert.equal(how("BattleManager['processVictory'] = function() { this.endBattle(0); };"), 'replaces');
    assert.equal(how('Object.assign(BattleManager, { processVictory() { this.endBattle(0); } });'), 'replaces');
    assert.equal(how('const _old = BattleManager.processVictory;\nBattleManager.processVictory = myVictory;\nfunction other() { _old.call(this); }'), 'replaces');
    // One that wraps it and calls on: the engine's step still runs, so the interface shows.
    assert.equal(how('var _old = BattleManager.processVictory;\nBattleManager.processVictory = function() { $gameTemp.flag = false; _old.call(this); };'), '');
    assert.equal(how('Yanfly.X.BattleManager_processVictory = BattleManager.processVictory;\nBattleManager.processVictory = function() {\n if (x) { y(); }\n Yanfly.X.BattleManager_processVictory.apply(this, arguments);\n};'), '');
    // The old function kept without a semicolon, called through an arrow, or handed to Object.assign.
    assert.equal(how('var _old = BattleManager.processVictory\nBattleManager.processVictory = function() {\n  $gameTemp.x = 1;\n  _old.call(this);\n};'), '');
    assert.equal(how('const _pv = BattleManager.processVictory;\nBattleManager.processVictory = function() { const run = () => _pv.apply(this, arguments); run(); };'), '');
    assert.equal(how('const _pv = BattleManager.processVictory;\nObject.assign(BattleManager, { processVictory() { _pv.call(this); } });'), '');
    // The old function kept by another plugin's file is called on as well.
    assert.equal(how('BattleManager.processVictory = function () {\n    this._victoryPhase = true;\n    Yanfly.BEC.BattleManager_processVictory.call(this);\n};'), '');
    // A wording of the rewards of its own is the plugin's victory; one that only adds a line keeps the game's message lines.
    assert.equal(how('BattleManager.displayRewards=function(){}'), 'replaces');
    assert.equal(how('const _pv = BattleManager.processVictory;\nBattleManager.processVictory = function() { _pv.call(this); };\nBattleManager.displayRewards = function () {};'), 'replaces');
    assert.equal(how('Yanfly.JP.BattleManager_displayRewards = BattleManager.displayRewards;\nBattleManager.displayRewards = function() { Yanfly.JP.BattleManager_displayRewards.call(this); this.displayJpGain(); };'), 'words');
    // Not a replacement: a comparison, another function, a call, another object's function of the name, a line in a comment.
    assert.equal(how('if (BattleManager.processVictory === mine) BattleManager.makeRewards = function() {};'), '');
    assert.equal(how('if (won) BattleManager.processVictory();'), '');
    assert.equal(how('MyBattleManager.processVictory = function() {};'), '');
    assert.equal(how('// BattleManager.displayRewards = function() {} was removed in 1.2\nvar x = 1;'), '');
    assert.equal(how('/* BattleManager.processVictory = function() {}; */\nvar url = "http://example.com/a"; var y = 2;'), '');
    assert.equal(how(''), '');
    assert.equal(Editor.stripComments('a = "//not"; // gone\nb = /\\//; /* gone\n too */ c = `//kept`;'), 'a = "//not"; \nb = /\\//;   c = `//kept`;');
    // Protected code cannot be read: a plugin named for the victory, or one that names the step and keeps no old
    // function, may run the victory; one that keeps the old function under a name is a wrapper.
    const scrambled = Array.from({ length: 30 }, (_, i) => 'var _0x' + (0x1a2b + i).toString(16) + '=1;').join('');
    assert.equal(Editor.isProtectedSource(scrambled), true);
    assert.equal(Editor.isProtectedSource('var _0x12ab = 1;'), false);
    assert.equal(how(scrambled + "['drawText','processVictory','_victoryWindow']", 'Olivia_VictorySequenceUI'), 'unreadable');
    assert.equal(how(scrambled + "['processVictory','value']", 'Some_Plugin'), 'unreadable');
    assert.equal(how(scrambled + "['BattleManager_processVictory','processVictory']", 'VisuMZ_1_BattleCore'), '');
    assert.equal(how(scrambled + "['BattleManager_processVictory','processVictory']", 'VisuMZ_3_VictoryAftermath'), 'unreadable');
    assert.equal(how(scrambled + "['update']", 'Some_VictoryPlugin'), '', 'one that never names the step');
    // The Demo's own two: its victory plugin replaces the step, its HP gauge plugin only wraps it.
    const plugin = name => path.join(repoRoot, 'template', 'Demo', 'js', 'plugins', name + '.js');
    if (fs.existsSync(plugin('PSYCHRONIC_MegaVictoryMZ'))) assert.equal(how(fs.readFileSync(plugin('PSYCHRONIC_MegaVictoryMZ'), 'utf8'), 'PSYCHRONIC_MegaVictoryMZ'), 'replaces');
    if (fs.existsSync(plugin('MOG_HPGauge'))) assert.equal(how(fs.readFileSync(plugin('MOG_HPGauge'), 'utf8'), 'MOG_HPGauge'), '');
    assert.deepEqual(Editor.enabledPlugins('// Generated\nvar $plugins =\n[\n{"name":"A","status":true,"description":"","parameters":{}},\n{"name":"B","status":false,"description":"","parameters":{}}\n];\n'), ['A']);
    assert.deepEqual(Editor.enabledPlugins('broken'), []);
    // The line says what each plugin does and what to turn off.
    const line = Editor.victoryNoticeText([{ name: 'PSYCHRONIC_MegaVictoryMZ', how: 'replaces' }], text => text);
    assert.match(line, /^PSYCHRONIC_MegaVictoryMZ runs the victory itself/);
    assert.match(line, /Turn PSYCHRONIC_MegaVictoryMZ off in the Plugin Manager/);
    assert.match(Editor.victoryNoticeText([{ name: 'YEP_JobPoints', how: 'words' }], text => text), /^YEP_JobPoints adds its own lines to the victory messages, so Classic battles show the messages and not this interface\. Turn YEP_JobPoints off/);
    assert.match(Editor.victoryNoticeText([{ name: 'Olivia_VictorySequenceUI', how: 'unreadable' }], text => text), /^Olivia_VictorySequenceUI may run the victory itself: its code is protected and cannot be checked\. If Classic battles do not show this interface, turn Olivia_VictorySequenceUI off/);
    const both = Editor.victoryNoticeText([{ name: 'A', how: 'words' }, { name: 'B', how: 'replaces' }, { name: 'C', how: 'replaces' }], text => text);
    assert.match(both, /^B, C runs the victory itself.* A adds its own lines/);
    assert.doesNotMatch(both, /A runs|B adds/);
    assert.equal(Editor.victoryNoticeText([], text => text), '');
});

test('the page stepper and the plugin line are written again when the editor\'s language changes', () => {
    const german = { Experience: 'Erfahrung', 'Level Up': 'Stufenaufstieg' };
    assert.equal(Editor.victoryPageLabel('Experience', 0, 3, text => german[text] || text), 'Erfahrung · 1/3');
    assert.equal(Editor.victoryPageLabel('Rewards', 2, 3, text => text), 'Rewards · 3/3');
    for (const name of Object.values(Editor.VICTORY_PAGE_NAMES)) assert.ok(name);
    // The editor hears the switch for as long as its page is up, and no longer.
    const listeners = new Map();
    const before = globalThis.window;
    globalThis.window = { addEventListener: (type, listener) => listeners.set(type, listener), removeEventListener: (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); } };
    try {
        const editor = new Editor({ data: database() }, null, null, null);
        let refreshed = 0;
        editor.refreshVictoryControls = () => { refreshed++; };
        editor.followLanguage();
        editor.followLanguage();
        assert.equal(listeners.size, 1);
        listeners.get('rr-language-changed')();
        assert.equal(refreshed, 1);
        editor.detach();
        assert.equal(listeners.has('rr-language-changed'), false);
    } finally {
        if (before === undefined) delete globalThis.window; else globalThis.window = before;
    }
    // The page is bound where its other window listeners are.
    const source = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    assert.match(source, /this\.drag = null;\n        \}\);\n        this\.followLanguage\(\);/);
});

//-----------------------------------------------------------------------------
// The runtime, against stubs for the engine classes it extends.

/** The source of one top-level `name = function() { ... };` of a runtime file. */
function functionSource(source, name) {
    const from = source.indexOf(name + ' = function');
    assert.ok(from >= 0, name);
    const to = source.indexOf('\n};', from);
    return source.slice(from, to + 3);
}

function loadRuntime({ system = {}, interfaces = [], screen = [1280, 720] } = {}) {
    // `pictures.ready` false: every picture file is still loading.
    const pictures = { ready: true };
    class Bitmap {
        constructor(width, height) { this.width = width; this.height = height; this.context = fakeContext(); this.fontSize = 26; this.clears = 0; this._canvas = { width, height }; }
        clear() { this.clears++; this.context.calls.fillText.length = 0; this.context.calls.drawImage = 0; }
        isReady() { return pictures.ready; }
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
    Window_Base.prototype.createContents = function() { this.contents = new Bitmap(this.contentsWidth(), this.contentsHeight()); this.contentsBack = new Bitmap(this.contentsWidth(), this.contentsHeight()); };
    Window_Base.prototype.update = function() {};
    Window_Base.prototype.destroy = function() { this.destroyed = true; };
    const stub = () => { const C = function() {}; C.prototype.initialize = function() {}; return C; };
    const SceneBattle = stub();
    SceneBattle.prototype.createDisplayObjects = function() {};
    SceneBattle.prototype.update = function() { this.frames = (this.frames || 0) + 1; };
    SceneBattle.prototype.terminate = function() { this.terminated = true; };
    for (const name of ['isTimeActive', 'needsInputWindowChange', 'onEnemyCancel', 'onActorCancel']) SceneBattle.prototype[name] = function() { return true; };
    const SceneMap = stub();
    SceneMap.prototype.update = function() {};
    SceneMap.prototype.terminate = function() {};
    SceneMap.prototype.isMenuEnabled = function() { return true; };
    SceneMap.prototype.createDisplayObjects = function() {};
    function Game_Player() {}
    Game_Player.prototype.canMove = function() { return true; };
    const layer = () => ({ x: 0, y: 0, children: [], addChild(child) { this.children.push(child); child.parent = this; }, addChildAt(child, index) { this.children.splice(index, 0, child); child.parent = this; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; } });
    const log = { messages: [], sounds: [], ended: [], gained: 0 };
    const input = { ok: false, cancel: false, held: false, cleared: 0, touch: false };
    const listeners = {};
    const sandbox = {
        console, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' }, require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true }, Bitmap, Window_Base, Window_Selectable: stub(),
        Scene_MenuBase: stub(), Scene_Boot: stub(), Scene_Map: SceneMap, Scene_Battle: SceneBattle, Scene_Title: stub(), Scene_Menu: stub(), Scene_Status: stub(),
        Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(), Game_Player,
        Input: { isTriggered: name => input[name], isLongPressed: name => name === 'ok' && input.held, clear() { input.cleared++; } },
        TouchInput: { isTriggered: () => input.touch, isCancelled: () => false, isLongPressed: () => false, clear() {}, x: 0, y: 0 },
        document: { addEventListener(type, listener) { (listeners[type] || (listeners[type] = [])).push(listener); } },
        Graphics: { width: screen[0], height: screen[1], boxWidth: screen[0], boxHeight: screen[1] },
        DataManager: { isTitleSkip: () => false }, ConfigManager: { save() {} },
        PluginManager: { registerCommand() {} },
        SceneManager: { _stack: [], _scene: null, push() {}, goto() {}, pop() { log.popped = (log.popped || 0) + 1; } },
        SoundManager: { playOk() { log.sounds.push('ok'); }, playCursor() { log.sounds.push('cursor'); }, playUseItem() { log.sounds.push('useItem'); } },
        AudioManager: { playSe(se) { log.sounds.push('se:' + se.name); } },
        ColorManager: new Proxy({}, { get: (_, key) => () => '#' + String(key).length.toString(16).padStart(6, '0') }),
        TextManager: { levelA: 'Lv', hpA: 'HP', mpA: 'MP', tpA: 'TP', expA: 'EXP', exp: 'EXP', level: 'Level', currencyUnit: 'G', obtainExp: '%1 %2 received!', obtainGold: '%1\\G found!',
            victory: '%1 was victorious!', levelUp: '%1 is now %2 %3!', obtainSkill: '%1 learned!', obtainItem: '%1 found!', param: id => 'P' + id },
        ImageManager: { iconWidth: 32, faceWidth: 144, loadFace: () => new Bitmap(576, 288), loadCharacter: () => new Bitmap(576, 384), loadSystem: () => new Bitmap(512, 640) },
        $dataSystem: Object.assign({ variables: [] }, system),
        $gameSystem: { mainFontFace: () => 'test, sans-serif', windowPadding: () => 12, windowOpacity: () => 192 },
        $gameMap: { mapId: () => 1 }, $gameSwitches: { value: () => false }, $gameVariables: { value: () => 0 },
        $gameActors: { actor: () => null },
        $gameMessage: { add(text) { log.messages.push(text); }, newPage() {} },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    // The engine's own victory step and level-up rule, as the runtime files state them.
    const managers = read('runtime/reactor_managers.js'), battlers = read('runtime/reactor_objects_battlers.js');
    vm.runInContext(`
        var BattleManager = {
            _rewards: null, _phase: "",
            playVictoryMe() {}, replayBgmAndBgs() {},
            endBattle(result) { __log.ended.push(result); this._phase = "battleEnd"; },
            updateBattleEnd() { SceneManager.pop(); this._phase = ""; },
            makeRewards() { this._rewards = { gold: 80, exp: 60, items: __drops.slice() }; },
            gainRewards() { __log.gained++; $gameParty.gainGold(this._rewards.gold); for (const item of this._rewards.items) $gameParty.gainItem(item, 1); for (const actor of $gameParty.allMembers()) actor.gainExp(this._rewards.exp); }
        };
        function Game_Battler() {}
        Game_Battler.prototype.performRecovery = function() {};
        function Game_Actor() {}
        Game_Actor.prototype.performDamage = function() {};
        Game_Actor.prototype.performActionStart = function() {};
        ${functionSource(managers, 'BattleManager.processVictory')}
        ${functionSource(managers, 'BattleManager.showVictoryInterface')}
        ${functionSource(managers, 'BattleManager.displayVictoryMessage')}
        ${functionSource(managers, 'BattleManager.displayRewards')}
        ${functionSource(managers, 'BattleManager.displayExp')}
        ${functionSource(managers, 'BattleManager.displayGold')}
        ${functionSource(managers, 'BattleManager.displayDropItems')}
        ${functionSource(battlers, 'Game_Actor.prototype.shouldDisplayLevelUp')}
        ${functionSource(battlers, 'Game_Actor.prototype.displayLevelUp')}
        String.prototype.format = function() { return this.replace(/%([0-9]+)/g, (s, n) => arguments[Number(n) - 1]); };
    `.replace(/__log/g, 'globalThis.__log').replace(/__drops/g, 'globalThis.__drops'), Object.assign(sandbox, { __log: log, __drops: [] }));
    // A party of two: each gains EXP at its own rate, levels every 100 and learns a skill at level 3.
    const skills = { 1: { id: 1, name: 'Attack', iconIndex: 76 }, 7: { id: 7, name: 'Cleave', iconIndex: 77 } };
    const actor = (id, name, level, exp, rate) => Object.assign(vm.runInContext('new Game_Actor()', sandbox), {
        _id: id, _name: name, level, _level: level, _exp: exp, _rate: rate, _skills: [1], _dead: false,
        actorId() { return this._id; }, name() { return this._name; }, currentExp() { return this._exp; }, expForLevel: lv => (lv - 1) * 100, isMaxLevel() { return this.level >= 99; },
        param(paramId) { return 50 + this.level * (paramId + 1); }, skills() { return this._skills.map(skillId => skills[skillId]); }, isDead() { return this._dead; },
        isBattleMember: () => true, faceName: () => 'Actor1', faceIndex() { return this._id - 1; }, characterName: () => 'Actor1', characterIndex: () => 0,
        gainExp(amount) {
            const show = this.shouldDisplayLevelUp(), before = this.level;
            this._exp += Math.round(amount * this._rate);
            while (this._exp >= this.level * 100) { this.level++; this._level = this.level; if (this.level === 3) this._skills.push(7); }
            if (show && this.level > before) this.displayLevelUp([]);
        }
    });
    const party = { gold: 0, items: [], members: [actor(1, 'Reid', 2, 170, 1), actor(2, 'Priscilla', 4, 310, 1.5)] };
    sandbox.$gameParty = { members: () => party.members, allMembers: () => party.members, battleMembers: () => party.members, leader: () => party.members[0], inBattle: () => true, name: () => 'Reid\'s Party',
        removeBattleStates() {}, performVictory() {},
        gainGold(amount) { party.gold += amount; }, gainItem(item, count) { for (let i = 0; i < count; i++) party.items.push(item); } };
    vm.runInContext(read('runtime/reactor_ui_victory.js'), sandbox);
    vm.runInContext(read('runtime/reactor_ui_fight.js'), sandbox);
    vm.runInContext(read('runtime/reactor_ui.js'), sandbox);
    sandbox.$dataUserInterfaces = interfaces;
    const scene = Class => Object.assign(new Class(), { _windowLayer: layer(), addWindow(window) { this._windowLayer.addChild(window); } });
    sandbox.__mouseDown = (button = 0) => { for (const listener of listeners.mousedown || []) listener({ button }); };
    return Object.assign(sandbox, { __party: party, __input: input, __pictures: pictures, __layer: layer, __battleScene: () => scene(sandbox.Scene_Battle), __mapScene: () => scene(sandbox.Scene_Map) });
}

const victoryRecord = (screen = [1280, 720]) => Object.assign({ id: 3 }, Stock.buildOne('victory', database(screen)), { design: { width: screen[0], height: screen[1] } });
const inUse = (extra = {}) => loadRuntime(Object.assign({ system: { reactorVictoryInterfaceId: 3 }, interfaces: [null, null, null, victoryRecord()] }, extra));

test('no Victory interface in use: a won battle words and gives its rewards as before', () => {
    const game = loadRuntime();
    assert.equal(game.ReactorVictory.isInUse(), false);
    assert.equal(game.ReactorVictory.run({ exp: 60, gold: 80, items: [] }), false);
    assert.equal(game.__party.gold, 0, 'nothing was given: the caller does it');
    game.BattleManager.processVictory();
    assert.deepEqual(Array.from(game.__log.messages), ['Reid\'s Party was victorious!', '\\.60 EXP received!', '\\.80\\G found!', 'Reid is now Level 3!', 'Priscilla is now Level 5!']);
    assert.equal(game.__log.gained, 1);
    assert.deepEqual(Array.from(game.__log.ended), [0]);
    assert.equal(game.ReactorVictory.isRunning(), false);
    // A record of another presentation bound by mistake is not a Victory interface.
    const wrong = loadRuntime({ system: { reactorVictoryInterfaceId: 3 }, interfaces: [null, null, null, { id: 3, mode: 'scene', nodes: [] }] });
    assert.equal(wrong.ReactorVictory.isInUse(), false);
});

test('a Victory interface in use: the game\'s own functions give the rewards, no message is written, and what is shown is what was given', () => {
    const game = inUse();
    const sword = { id: 4, name: 'Sword', wtypeId: 1, iconIndex: 97, description: 'A blade.' }, potion = { id: 1, name: 'Potion', itypeId: 1, iconIndex: 176, description: '' };
    game.__drops.push(potion, sword, potion);
    assert.equal(game.ReactorVictory.isInUse(), true);
    game.BattleManager.processVictory();
    assert.deepEqual(Array.from(game.__log.messages), [], 'no victory lines and no level-up lines');
    assert.equal(game.__log.gained, 1, 'gainRewards ran once, so a plugin\'s additions to it still apply');
    assert.deepEqual(Array.from(game.__log.ended), [0], 'the battle is ended as won at once, as before');
    assert.equal(game.__party.gold, 80);
    assert.equal(game.__party.items.length, 3);
    assert.equal(game.ReactorVictory.isRunning(), true);
    assert.equal(game.ReactorVictory.isGiving(), false);
    const summary = game.ReactorVictory._session.summary;
    assert.deepEqual([summary.exp, summary.gold], [60, 80]);
    const [reid, priscilla] = summary.members;
    // Reid: 170 + 60 = 230, level 2 to 3, learned Cleave. Priscilla gains at 1.5: 310 + 90 = 400, level 4 to 5.
    assert.deepEqual([reid.level0, reid.level1, reid.exp0, reid.exp1], [2, 3, 170, 230]);
    assert.deepEqual([priscilla.level0, priscilla.level1, priscilla.exp0, priscilla.exp1], [4, 5, 310, 400], 'her own rate shows: the number shown is the number given');
    assert.deepEqual(Array.from(reid.skills, skill => skill.name), ['Cleave']);
    assert.deepEqual(Array.from(priscilla.skills), []);
    assert.equal(reid.params1[0] - reid.params0[0], 1);
    assert.deepEqual(Array.from(summary.items, item => [item.kind, item.name, item.count]), [['item', 'Potion', 2], ['weapon', 'Sword', 1]]);
    // A level gained outside the victory is still a message.
    game.__party.members[0].gainExp(100);
    assert.deepEqual(Array.from(game.__log.messages), ['Reid is now Level 4!']);
});

test('the battle waits for the player: it ends when the interface is closed, with one press a page', () => {
    const game = inUse();
    game.BattleManager.processVictory();
    game.BattleManager.updateBattleEnd();
    assert.equal(game.__log.popped, undefined, 'held while the result is read');
    const scene = game.__battleScene();
    scene._reactorBattleHud = { _nodeWindows: [{ visible: true }], update() {}, updateBattle() {} };
    scene.update();
    const session = game.ReactorVictory._session;
    assert.ok(session.overlay && session.run, 'opened over the battle scene on its first frame');
    assert.equal(game.__input.cleared, 1, 'the key that ended the battle is let go');
    assert.deepEqual(Array.from(session.run.pages, page => page.kind), ['exp', 'levelUp', 'rewards']);
    assert.equal(scene._reactorBattleHud._nodeWindows[0].visible, false, 'the battle\'s own HUD stands down');
    const windows = session.overlay._nodeWindows;
    const shown = () => Array.from(windows).filter(window => window.visible).map(window => window.node().name);
    const frame = (keys = {}) => { Object.assign(game.__input, { ok: false, cancel: false, held: false }, keys); scene.update(); };
    for (let i = 0; i < 20; i++) frame();
    assert.deepEqual(shown(), ['Backdrop', 'Panel', 'Title', 'EXP received', 'Party Experience', 'What OK does', 'Page']);
    const party = windows.find(window => window.node().type === 'victoryParty');
    assert.ok(party.contentsBack.context.calls.fillText.some(call => call[0] === 'Reid'), 'the names are on the layer that stays');
    // While the bars fill, the layer that stays is not drawn again.
    const back = party.contentsBack.clears, front = party.contents.clears;
    for (let i = 0; i < 30; i++) frame();
    assert.equal(party.contentsBack.clears, back);
    assert.ok(party.contents.clears > front + 20, 'the bars and numbers are');
    let presses = 0;
    for (let i = 0; i < 2000 && game.ReactorVictory.isRunning(); i++) {
        const press = !game.ReactorVictoryHud.isFilling(session.run) && session.run.lock === 0 && i % 3 === 0;
        if (press) presses++;
        frame({ ok: press });
        if (session.run.index === 1 && !session.run.closed) assert.deepEqual(shown(), ['Backdrop', 'Panel', 'Title', 'Level Up', 'What OK does', 'Page']);
        if (session.run.index === 2 && !session.run.closed) assert.deepEqual(shown(), ['Backdrop', 'Panel', 'Title', 'Rewards', 'What OK does', 'Page']);
    }
    assert.equal(presses, 3);
    assert.equal(game.ReactorVictory.isRunning(), false);
    // Reid gains his level halfway through the fill, Priscilla as it ends: each is heard.
    assert.equal(game.__log.sounds.filter(sound => sound === 'useItem').length, 2, 'the level-up sound, the game\'s Use Item sound where the node names none');
    assert.equal(game.__log.sounds.filter(sound => sound === 'cursor').length, 2, 'a page turned');
    assert.equal(game.__log.sounds.filter(sound => sound === 'ok').length, 1, 'the close');
    game.BattleManager.updateBattleEnd();
    assert.equal(game.__log.popped, 1, 'the battle ends as it always did');
    // It fades away by itself and leaves nothing behind.
    for (let i = 0; i < 30; i++) frame();
    assert.equal(game.ReactorVictory._session, null);
    assert.equal(scene._windowLayer.children.length, 0);
    assert.ok(windows.length === 0 || windows.every(window => window.destroyed));
    // Members who gain their levels within a few frames of each other share one sound; the node's own sound is the one played.
    const record = victoryRecord();
    Object.assign(record.nodes.find(node => node.type === 'victoryParty'), { se: { name: 'Chime', volume: 90, pitch: 100, pan: 0 } });
    const together = loadRuntime({ system: { reactorVictoryInterfaceId: 3 }, interfaces: [null, null, null, record] });
    together.__party.members[1]._exp = 370;
    together.__party.members[1]._rate = 1;
    together.BattleManager.processVictory();
    const chorus = together.__battleScene();
    for (let i = 0; i < 200; i++) chorus.update();
    assert.deepEqual(Array.from(together.__log.sounds), ['se:Chime']);
    // And none where the node turns it off.
    const silent = victoryRecord();
    Object.assign(silent.nodes.find(node => node.type === 'victoryParty'), { levelUpSound: false });
    const mute = loadRuntime({ system: { reactorVictoryInterfaceId: 3 }, interfaces: [null, null, null, silent] });
    mute.BattleManager.processVictory();
    const hushed = mute.__battleScene();
    for (let i = 0; i < 200; i++) hushed.update();
    assert.deepEqual(Array.from(mute.__log.sounds), []);
    // Still: nothing is drawn again while a page rests.
    const still = inUse();
    still.BattleManager.processVictory();
    const quiet = still.__battleScene();
    quiet.update();
    const run = still.ReactorVictory._session.run;
    for (let i = 0; i < 200; i++) quiet.update();
    assert.equal(still.ReactorVictoryHud.isAnimating(run), false);
    const clears = still.ReactorVictory._session.overlay._nodeWindows.map(window => window.contents.clears);
    for (let i = 0; i < 60; i++) quiet.update();
    assert.deepEqual(still.ReactorVictory._session.overlay._nodeWindows.map(window => window.contents.clears), clears);
});

test('a plugin that runs the victory itself keeps it; one that only wraps the step leaves the interface to show', () => {
    // What a plugin does once the engine has loaded: keep the old function, put its own in its place.
    // One that replaces the step and never calls the engine's: the engine's step, and so the interface, never runs.
    const replaced = inUse();
    replaced.BattleManager.processVictory = function() { this.makeRewards(); this.gainRewards(); this.endBattle(0); };
    replaced.BattleManager.processVictory();
    assert.equal(replaced.ReactorVictory.isRunning(), false);
    assert.equal(replaced.__log.gained, 1);
    // One that wraps it (the Demo's MOG_HPGauge clears a flag first) and calls on: the interface shows.
    const wrapped = inUse();
    const engine = wrapped.BattleManager.processVictory;
    let flagged = 0;
    wrapped.BattleManager.processVictory = function() { flagged++; engine.call(this); };
    wrapped.BattleManager.processVictory();
    assert.equal(flagged, 1);
    assert.equal(wrapped.ReactorVictory.isRunning(), true);
    assert.deepEqual(Array.from(wrapped.__log.messages), []);
    // One that words the rewards its own way keeps its words: the interface stands down and the lines play.
    const worded = inUse();
    assert.equal(worded.ReactorVictory.standsDown(), false);
    const stock = worded.BattleManager.displayRewards;
    worded.BattleManager.displayRewards = function() { stock.apply(this, arguments); worded.$gameMessage.add('Bonus!'); };
    assert.equal(worded.ReactorVictory.standsDown(), true);
    worded.BattleManager.processVictory();
    assert.equal(worded.ReactorVictory.isRunning(), false);
    assert.ok(worded.__log.messages.includes('\\.60 EXP received!') && worded.__log.messages.includes('Bonus!'), 'the game\'s lines and the plugin\'s play');
    assert.equal(worded.__log.gained, 1);
    // On the map no plugin runs the victory: the call still shows the interface.
    assert.equal(worded.ReactorVictory.run({ exp: 10, gold: 0, items: [] }), true);
    // No engine file after reactor_ui.js puts another function in place of displayRewards, or every game would stand down.
    const main = read('runtime/reactor_main.js');
    const later = Array.from(main.matchAll(/"js\/(reactor_[a-z0-9_]+\.js)"/g), match => match[1]);
    for (const file of later.slice(later.indexOf('reactor_ui.js') + 1)) {
        assert.doesNotMatch(read('runtime/' + file), /BattleManager\s*\.\s*displayRewards\s*=(?!=)/, file);
    }
});

test('over the map: one call gives the rewards, holds the party and the menu, and says when the player has closed it', () => {
    const game = inUse({ screen: [816, 624], interfaces: [null, null, null, victoryRecord([816, 624])] });
    const player = new game.Game_Player(), scene = game.__mapScene();
    let closed = 0;
    assert.equal(game.ReactorVictory.run({ exp: 60, gold: 25, items: [{ id: 2, name: 'Key', itypeId: 2 }] }, { onClose: () => closed++ }), true);
    assert.equal(game.__party.gold, 25, 'given by the default: gold, items and each member\'s EXP');
    assert.equal(game.__party.items.length, 1);
    assert.equal(game.__party.members[0].currentExp(), 230);
    assert.deepEqual(Array.from(game.__log.messages), []);
    assert.equal(game.ReactorVictory.run({ exp: 1 }), false, 'one at a time');
    assert.equal(player.canMove(), false);
    assert.equal(scene.isMenuEnabled(), false);
    scene.update();
    const session = game.ReactorVictory._session;
    assert.ok(session.overlay._nodeWindows.length > 0);
    for (let i = 0; i < 2000 && game.ReactorVictory.isRunning(); i++) { game.__input.cancel = i % 5 === 0 && i > 20; scene.update(); }
    assert.equal(closed, 1, 'told once');
    assert.equal(player.canMove(), true, 'control is back the moment it closes');
    assert.equal(scene.isMenuEnabled(), true);
    // A caller's own way of giving is used in place of the default.
    const own = inUse();
    let gave = null;
    own.ReactorVictory.run({ exp: 60, gold: 99, items: [] }, { give: rewards => { gave = rewards.gold; own.__party.members[0].gainExp(rewards.exp); } });
    assert.equal(gave, 99);
    assert.equal(own.__party.gold, 0);
    assert.equal(own.ReactorVictory._session.summary.members[1].exp1, 310, 'only what was given is shown');
    // The map is left while it is up (a transfer, Game Over): whoever waits is told and nothing is left behind.
    const leaving = inUse();
    let told = 0;
    leaving.ReactorVictory.run({ exp: 5, gold: 0, items: [] }, { onClose: () => told++ });
    const map = leaving.__mapScene();
    map.update();
    map.terminate();
    assert.equal(told, 1);
    assert.equal(leaving.ReactorVictory._session, null);
    assert.equal(map._windowLayer.children.length, 0);
    // An interface that fails never holds the game.
    const broken = inUse();
    let freed = 0;
    broken.ReactorVictory.run({ exp: 5, gold: 0, items: [] }, { onClose: () => freed++ });
    broken.ReactorVictoryHud.step = () => { throw new Error('test'); };
    const errors = console.error;
    console.error = () => {};
    try { const failing = broken.__mapScene(); failing.update(); } finally { console.error = errors; }
    assert.equal(freed, 1);
    assert.equal(broken.ReactorVictory.isRunning(), false);
    // Whoever is told of a failure may start the next one at once, and it stays.
    const again = inUse();
    let next = null;
    again.ReactorVictory.run({ exp: 5, gold: 0, items: [] }, { onClose: () => { next = again.ReactorVictory.run({ exp: 0, gold: 4, items: [] }); } });
    const step = again.ReactorVictoryHud.step;
    again.ReactorVictoryHud.step = () => { throw new Error('test'); };
    console.error = () => {};
    try { again.__mapScene().update(); } finally { console.error = errors; }
    again.ReactorVictoryHud.step = step;
    assert.equal(next, true);
    assert.equal(again.ReactorVictory.isRunning(), true);
    assert.equal(again.__party.gold, 4);
});

test('a record laid out for another screen is fitted like a scene: its panel stays in the middle', () => {
    const game = inUse({ screen: [1920, 1080] });
    const record = game.ReactorVictory.record();
    assert.ok(record.fit && Math.abs(record.fit.scale - 1.5) < 0.001);
    const backdrop = record.nodes.find(node => node.name === 'Backdrop'), panel = record.nodes.find(node => node.name === 'Panel');
    assert.deepEqual([backdrop.width, backdrop.height], [record.fit.width, record.fit.height], 'the backdrop still covers the screen');
    assert.deepEqual([panel.anchor, panel.x, panel.y], ['center', 0, 0]);
    const fitApi = require('../src/utils/InterfaceFit.js');
    const fitted = fitApi.fit(victoryRecord(), { width: 640, height: 480 }, 26);
    const small = fitted.nodes.find(node => node.name === 'Panel');
    assert.ok(Math.abs(small.x) <= 1 && Math.abs(small.y) <= 1, 'the editor previews it the same way');
});

test('the words of the victory come from the record, the project\'s battle terms and Terms', () => {
    const game = inUse({ system: { reactorVictoryInterfaceId: 3, reactorBattle: { terms: { victoryTitle: 'Sieg!', victoryContinue: 'Weiter' } } } });
    game.BattleManager.processVictory();
    const scene = game.__battleScene();
    for (let i = 0; i < 200; i++) scene.update();
    const text = name => game.ReactorVictory._session.overlay._nodeWindows.find(window => window.node().name === name)._victoryText;
    assert.equal(text('Title'), 'Sieg!');
    assert.equal(text('What OK does'), 'Weiter');
    assert.equal(text('EXP received'), '60 EXP received!');
    const theme = game.ReactorUI.victoryTheme();
    assert.deepEqual(Array.from(theme.terms.params), ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
});

test('a term that carries the game\'s icon code is drawn with its icon, never as the code', () => {
    const coded = Object.assign(theme(), {});
    coded.terms = Object.assign({}, coded.terms, { exp: '\\i[305] Knowledge', currency: '\\i[314]' });
    const summary = V.sampleSummary(database());
    const nodes = stockNodes(1280, 720);
    const pages = V.pages(nodes, summary, sizeOf);
    const run = V.newRun(summary, pages, nodes.find(node => node.type === 'victoryParty'));
    const party = nodes.find(node => node.type === 'victoryParty');
    const ctx = fakeContext();
    V.drawParty(ctx, party.width, party.height, party, run, pages[0], coded, 'moving');
    const words = ctx.calls.fillText.map(call => call[0]);
    assert.ok(words.includes('+0 ') && words.includes(' Knowledge'), 'the words either side of the icon');
    assert.ok(words.every(word => !word.includes('\\')), 'no code is written out');
    assert.equal(ctx.calls.drawImage, 3, 'one icon a member');
    // The game's own line, and the gold's amount with the currency icon.
    const line = fakeContext();
    V.drawText(line, 400, 30, nodes.find(node => node.name === 'EXP received'), V.textOf(nodes.find(node => node.name === 'EXP received'), run, coded), coded);
    assert.deepEqual(line.calls.fillText.map(call => call[0]), [summary.exp + ' ', ' Knowledge received!']);
    assert.equal(line.calls.drawImage, 1);
    assert.equal(V.strip('a \\C[2]b\\C[0] c'), 'a b c');
});

test('every row of a Level Up page is laid out alike, and a lone reward stands in the middle', () => {
    const summary = V.sampleSummary(database());
    assert.deepEqual(summary.members.map(member => member.skills.length), [1, 0, 0], 'the first learned a skill, the second did not');
    const nodes = stockNodes(1280, 720);
    const pages = V.pages(nodes, summary, sizeOf);
    const levels = nodes.find(node => node.type === 'victoryLevels');
    const ctx = fakeContext();
    V.drawLevels(ctx, levels.width, levels.height, levels, summary, pages[1], theme());
    const at = word => ctx.calls.fillText.filter(call => call[0] === word).map(call => call[1]);
    assert.equal(at('Max HP').length, 2);
    assert.equal(at('Max HP')[0], at('Max HP')[1], 'the parameters start at the same place in both rows');
    assert.equal(at('Luck')[0], at('Luck')[1]);
    assert.equal(at('New skills').length, 1, 'the heading only where a skill was learned');
    // Gold alone: its card in the middle of the node, left to right and top to bottom.
    const rewards = nodes.find(node => node.type === 'victoryRewards');
    const alone = { exp: 10, gold: 30, items: [], members: summary.members };
    const page = V.pages(nodes, alone, sizeOf).find(entry => entry.kind === 'rewards');
    const card = fakeContext();
    V.drawRewards(card, rewards.width, rewards.height, rewards, alone, page, theme());
    const [, x, y] = card.calls.fillText.find(call => call[0] === '30 G');
    const grid = V.rewardsGrid(rewards, rewards.width, rewards.height);
    assert.ok(x > rewards.width / 4 && x < rewards.width / 2, `the amount is written at ${x} of ${rewards.width}`);
    assert.ok(Math.abs(y - rewards.height / 2) < grid.cardHeight, `at ${y} of ${rewards.height}`);
});

test('a mouse click is one step, however the engine reports it afterwards', () => {
    const game = inUse();
    game.BattleManager.processVictory();
    const scene = game.__battleScene();
    for (let i = 0; i < 200; i++) scene.update();
    const run = game.ReactorVictory._session.run;
    assert.equal(run.index, 0);
    // The button goes down; TouchInput reports the same click on the next frame (or, on a 3D map, never).
    game.__mouseDown();
    scene.update();
    assert.equal(run.index, 1, 'the click moved on');
    game.__input.touch = true;
    scene.update();
    game.__input.touch = false;
    scene.update();
    assert.equal(run.index, 1, 'and its echo did not move on again');
    // A touch with no mouse button (a touch screen) is a step by itself.
    for (let i = 0; i < 30; i++) scene.update();
    game.__input.touch = true;
    scene.update();
    game.__input.touch = false;
    assert.equal(run.index, 2);
    // Another button is not OK.
    for (let i = 0; i < 30; i++) scene.update();
    game.__mouseDown(2);
    scene.update();
    assert.equal(run.closed, false);
});

test('a picture that arrives after the page opened is drawn on the frame it arrives, during the fill and after it', () => {
    const partyOf = game => game.ReactorVictory._session.overlay._nodeWindows.find(window => window.node().type === 'victoryParty');
    for (const late of [1, 2, 5, 120]) {
        const game = inUse();
        game.__pictures.ready = false;
        game.BattleManager.processVictory();
        const scene = game.__battleScene();
        scene.update();
        const party = partyOf(game);
        for (let i = 1; i < late; i++) scene.update();
        assert.equal(party.contentsBack.context.calls.drawImage, 0, `${late} frames: no face to draw yet`);
        game.__pictures.ready = true;
        scene.update();
        assert.equal(party.contentsBack.context.calls.drawImage, 2, `${late} frames: both faces are on the layer that stays`);
        // Drawn once: the layer is left alone again afterwards.
        for (let i = 0; i < 150; i++) scene.update();
        const clears = party.contentsBack.clears;
        for (let i = 0; i < 60; i++) scene.update();
        assert.equal(party.contentsBack.clears, clears);
    }
    // The Level Up page waits for its faces the same way.
    const paged = inUse();
    paged.BattleManager.processVictory();
    const battle = paged.__battleScene();
    for (let i = 0; i < 150; i++) battle.update();
    paged.__pictures.ready = false;
    paged.__input.ok = true;
    battle.update();
    paged.__input.ok = false;
    const levels = paged.ReactorVictory._session.overlay._nodeWindows.find(window => window.node().type === 'victoryLevels');
    assert.equal(paged.ReactorVictory._session.run.index, 1);
    for (let i = 0; i < 5; i++) battle.update();
    assert.equal(levels.contents.context.calls.drawImage, 0);
    paged.__pictures.ready = true;
    battle.update();
    assert.ok(levels.contents.context.calls.drawImage >= 2, 'the two who gained a level');
    // A model's portrait still being made: a plain figure stands in, and nothing is drawn again until it is there.
    const modeled = inUse();
    modeled.Reactor3D = { actorSlotSpec: () => ({ name: 'Hero', ext: 'glb' }) };
    for (const member of modeled.__party.members) member.faceName = () => '';
    let portrait = null;
    modeled.ReactorUI.fightThumbnail = () => portrait;
    modeled.BattleManager.processVictory();
    const room = modeled.__battleScene();
    for (let i = 0; i < 150; i++) room.update();
    const waiting = partyOf(modeled);
    const before = waiting.contentsBack.clears;
    for (let i = 0; i < 60; i++) room.update();
    assert.equal(waiting.contentsBack.clears, before, 'waiting for a portrait draws nothing');
    assert.equal(waiting.contentsBack.context.calls.drawImage, 0);
    portrait = { width: 128, height: 128 };
    modeled.ReactorUI.FightPortraits.version++;
    room.update();
    assert.equal(waiting.contentsBack.clears, before + 1);
    assert.equal(waiting.contentsBack.context.calls.drawImage, 2);
});

test('a Classic battle\'s own windows stand down while the result is read, and until the battle scene is gone', () => {
    const game = inUse();
    game.BattleManager.processVictory();
    const scene = game.__battleScene();
    const status = { closes: 0, close() { this.closes++; } };
    scene._statusWindow = status;
    // The battle's HUD shows its windows again on every frame of its own update.
    const hudWindow = { visible: true };
    scene._reactorBattleHud = { _nodeWindows: [hudWindow], update() { hudWindow.visible = true; }, updateBattle() {} };
    scene.update();
    assert.equal(status.closes, 1, 'the status window is closed, as the victory messages close it');
    assert.equal(hudWindow.visible, false);
    const session = game.ReactorVictory._session;
    for (let i = 0; i < 2000 && game.ReactorVictory.isRunning(); i++) {
        game.__input.ok = !game.ReactorVictoryHud.isFilling(session.run) && session.run.lock === 0;
        scene.update();
        assert.equal(hudWindow.visible, false);
    }
    game.__input.ok = false;
    assert.equal(game.ReactorVictory.isRunning(), false);
    // Closed, fading, gone: the HUD does not come back for the scene's own fade-out.
    const closes = status.closes;
    for (let i = 0; i < 40; i++) { scene.update(); assert.equal(hudWindow.visible, false, `frame ${i} after the close`); }
    assert.equal(game.ReactorVictory._session, null);
    assert.equal(status.closes, closes + 40);
    // The next battle's scene is a new one: nothing of it is touched before its own victory.
    const next = game.__battleScene();
    const fresh = { visible: true };
    next._reactorBattleHud = { _nodeWindows: [fresh], update() { fresh.visible = true; }, updateBattle() {} };
    next._statusWindow = { closes: 0, close() { this.closes++; } };
    for (let i = 0; i < 10; i++) next.update();
    assert.equal(fresh.visible, true);
    assert.equal(next._statusWindow.closes, 0);
    // Over the map (a battle fought on it, Playtest Interface) no window of the scene is closed.
    const map = inUse();
    const ground = map.__mapScene();
    ground._statusWindow = { closes: 0, close() { this.closes++; } };
    map.ReactorVictory.run({ exp: 5, gold: 0, items: [] });
    for (let i = 0; i < 30; i++) ground.update();
    assert.ok(map.ReactorVictory._session.overlay);
    assert.equal(ground._statusWindow.closes, 0);
});

test('the next victory may be started the moment one is closed, also from its onClose', () => {
    const game = inUse();
    const scene = game.__mapScene();
    const closeIt = () => {
        for (let i = 0; i < 2000 && game.ReactorVictory.isRunning(); i++) {
            const run = game.ReactorVictory._session.run;
            game.__input.ok = !!run && !game.ReactorVictoryHud.isFilling(run) && run.lock === 0;
            scene.update();
        }
        game.__input.ok = false;
    };
    let second = null, told = 0;
    assert.equal(game.ReactorVictory.run({ exp: 10, gold: 5, items: [] }, {
        onClose: () => { second = game.ReactorVictory.run({ exp: 0, gold: 7, items: [] }, { onClose: () => told++ }); }
    }), true);
    closeIt();
    assert.equal(second, true, 'started from inside onClose');
    assert.equal(game.__party.gold, 12, 'and its rewards given');
    // closeIt went on to read the second one to its end, too.
    assert.equal(told, 1);
    assert.equal(game.ReactorVictory.isRunning(), false);
    // While the closed one still fades: isRunning() is false, so run() works, and the old one is taken down at once.
    const fading = game.ReactorVictory._session;
    assert.ok(fading && fading.closed && fading.overlay, 'still fading away');
    assert.equal(game.ReactorVictory.run({ exp: 0, gold: 1, items: [] }), true);
    assert.equal(fading.overlay, null);
    assert.equal(scene._windowLayer.children.length, 0);
    scene.update();
    const third = game.ReactorVictory._session;
    assert.notEqual(third, fading);
    assert.equal(scene._windowLayer.children.length, third.overlay._nodeWindows.length, 'only the new one is on the screen');
    // Still one at a time while one is being read.
    assert.equal(game.ReactorVictory.run({ exp: 0, gold: 1, items: [] }), false);
    assert.equal(game.__party.gold, 13);
    // onClose is told once: closed by the player, then its scene ends while it fades.
    let once = 0;
    const leaving = inUse();
    leaving.ReactorVictory.run({ exp: 0, gold: 0, items: [] }, { onClose: () => once++ });
    const map = leaving.__mapScene();
    for (let i = 0; i < 2000 && leaving.ReactorVictory.isRunning(); i++) { leaving.__input.cancel = i % 40 === 39; map.update(); }
    assert.equal(once, 1);
    assert.ok(leaving.ReactorVictory._session, 'fading');
    map.terminate();
    assert.equal(once, 1);
    assert.equal(leaving.ReactorVictory._session, null);
    // A scene that ends under it tells onClose, and nothing can be shown from there: the caller words the rewards itself.
    const ending = inUse();
    let refused = null;
    ending.ReactorVictory.run({ exp: 0, gold: 3, items: [] }, { onClose: () => { refused = ending.ReactorVictory.run({ exp: 0, gold: 9, items: [] }); } });
    const gone = ending.__mapScene();
    gone.update();
    gone.terminate();
    assert.equal(refused, false);
    assert.equal(ending.__party.gold, 3);
    assert.equal(ending.ReactorVictory._session, null);
    assert.equal(ending.ReactorVictory.run({ exp: 0, gold: 9, items: [] }), true, 'and the next scene can show one again');
});

test('a battle whose scene never shows the interface still ends', () => {
    const game = inUse();
    game.BattleManager.processVictory();
    const warn = console.warn;
    console.warn = () => {};
    try {
        for (let i = 1; i < game.ReactorVictory.OPEN_FRAMES; i++) game.BattleManager.updateBattleEnd();
        assert.equal(game.__log.popped, undefined, 'a second is given for a scene to open it');
        game.BattleManager.updateBattleEnd();
    } finally { console.warn = warn; }
    assert.equal(game.__log.popped, 1);
    assert.equal(game.ReactorVictory.isRunning(), false);
    assert.equal(game.ReactorVictory._session, null);
    assert.equal(game.__party.gold, 80, 'the rewards were given all the same');
    // One a scene has opened waits for as long as the player reads.
    const read = inUse();
    read.BattleManager.processVictory();
    const scene = read.__battleScene();
    scene.update();
    for (let i = 0; i < 600; i++) { read.BattleManager.updateBattleEnd(); scene.update(); }
    assert.equal(read.__log.popped, undefined);
    assert.equal(read.ReactorVictory.isRunning(), true);
});

test('asking whether a Victory interface is in use builds nothing', () => {
    const game = inUse();
    let built = 0;
    const normalize = game.ReactorUI.normalizeInterface;
    game.ReactorUI.normalizeInterface = function() { built++; return normalize.apply(this, arguments); };
    for (let i = 0; i < 100; i++) assert.equal(game.ReactorVictory.isInUse(), true);
    assert.equal(built, 0);
    assert.equal(game.ReactorVictory.record().mode, 'victory');
    assert.equal(built, 1, 'the record is laid out when a victory is shown');
    // A record stored under another id than the one bound is not the bound record.
    const moved = loadRuntime({ system: { reactorVictoryInterfaceId: 3 }, interfaces: [null, null, null, Object.assign(victoryRecord(), { id: 4 })] });
    assert.equal(moved.ReactorVictory.isInUse(), false);
    assert.equal(moved.ReactorVictory.record(), null);
});

test('on a large screen the members\' cards grow with it, and a full party stands in two rows', () => {
    const partyAt = (width, height) => stockNodes(width, height).find(node => node.type === 'victoryParty');
    const large = partyAt(1920, 1080);
    // Three members: one row, each card filled by its parts.
    const three = V.partyGrid(large, large.width, large.height, 3);
    assert.deepEqual([three.cols, three.rows], [3, 1]);
    const card = V.partyCard(large, three.cellWidth, three.cellHeight, {}, three.most);
    assert.ok(card.block >= three.cellHeight * 0.8, `the parts take ${card.block} of a card ${three.cellHeight} high`);
    assert.ok(card.face >= 256 && card.face <= 288, `the portrait is ${card.face}: larger, never past twice its picture`);
    assert.ok(card.name >= 38, `the name is written at ${card.name}`);
    // Eight members: two rows of four, not one row of eight small cards.
    const eight = V.partyGrid(large, large.width, large.height, 8);
    assert.deepEqual([eight.cols, eight.rows, eight.per], [4, 2, 8]);
    assert.ok(V.partyCard(large, eight.cellWidth, eight.cellHeight, {}, eight.most).name >= 24);
    // On the smaller screens three members stand as they did: the same card, portrait and type.
    const medium = partyAt(1280, 720), grid = V.partyGrid(medium, medium.width, medium.height, 3);
    const same = V.partyCard(medium, grid.cellWidth, grid.cellHeight, {}, grid.most);
    assert.deepEqual([grid.cellWidth, grid.cellHeight, same.face, same.name], [334, 450, 216, 32]);
    // The columns an author sets are kept.
    const two = V.partyGrid(Object.assign({}, large, { columns: 2 }), large.width, large.height, 4);
    assert.deepEqual([two.cols, two.rows], [2, 2]);
    // At every size and party: the rows stand inside the node, a card holds its parts, and eight members share a page.
    for (const [width, height] of SCREENS) {
        const node = partyAt(width, height);
        for (let count = 1; count <= 8; count++) {
            const g = V.partyGrid(node, node.width, node.height, count);
            const c = V.partyCard(node, g.cellWidth, g.cellHeight, {}, g.most);
            const label = `${width}x${height}, ${count} members`;
            assert.ok(g.per >= count, `${label}: one page`);
            assert.ok(g.cols * g.cellWidth + (g.cols - 1) * g.gap <= node.width, `${label}: as wide as the node at most`);
            assert.ok(g.rows * g.cellHeight + (g.rows - 1) * g.gap <= node.height, `${label}: as tall as the node at most`);
            assert.ok(c.block + c.pad * 2 <= g.cellHeight + 1, `${label}: parts ${c.block} in a card ${g.cellHeight}`);
            assert.ok(c.block >= g.cellHeight * 0.75, `${label}: the card is filled (${c.block} of ${g.cellHeight})`);
            assert.ok(g.cellWidth <= Math.round(g.cellHeight * 1.15), `${label}: no card much wider than tall`);
        }
    }
    // A caller that gives an object has it filled, and none is made.
    const out = {};
    assert.equal(V.partyGrid(large, large.width, large.height, 3, out), out);
});

test('what the summary and the cards say of the unusual cases', () => {
    // EXP taken away by the rewards (a plugin's penalty) is shown as nothing gained, never as a bar running backwards.
    const lost = V.member(snapshot(3, 250), snapshot(3, 240), curve, false);
    assert.equal(lost.exp1, 250);
    assert.equal(V.memberAt(lost, 1, {}).gained, 0);
    // The skills listed are those of the levels gained: a member who gained none lists none.
    const taught = V.member(snapshot(3, 250, { skills: [{ id: 1, name: 'Attack' }] }), snapshot(3, 280, { skills: [{ id: 1, name: 'Attack' }, { id: 9, name: 'Cleave' }] }), curve, false);
    assert.deepEqual(taught.skills, []);
    // A fallen member's card and picture frame are gray; a standing one's are the bar's color.
    const nodes = stockNodes(1280, 720), party = nodes.find(node => node.type === 'victoryParty');
    const drawn = dead => {
        const summary = { exp: 10, gold: 0, items: [], members: [V.member(snapshot(2, 110, { dead }), snapshot(2, 110, { dead }), curve, false)] };
        const run = V.newRun(summary, V.pages(nodes, summary, sizeOf), party);
        const ctx = fakeContext();
        V.drawParty(ctx, party.width, party.height, party, run, run.pages[0], theme(), 'static');
        return ctx.calls.styles.join(' ');
    };
    const gray = V.rgba('#8a8f9a', 0.4), color = V.rgba(party.barColor2, 0.4);
    assert.ok(drawn(true).includes(gray) && !drawn(true).includes(color));
    assert.ok(drawn(false).includes(color) && !drawn(false).includes(gray));
});

test('members who gain their levels a few frames apart share one sound', () => {
    const game = inUse();
    // Reid reaches level 3 at 200 EXP, halfway through his fill; Priscilla level 5 at 400, a little past halfway.
    Object.assign(game.__party.members[1], { _exp: 368, _rate: 1 });
    game.BattleManager.processVictory();
    const scene = game.__battleScene();
    scene.update();
    const run = game.ReactorVictory._session.run;
    const frames = [];
    for (let i = 0; i < 200; i++) {
        const levels = run.levels.join();
        scene.update();
        if (run.levels.join() !== levels) frames.push(i);
    }
    assert.equal(frames.length, 2, 'the two levels are gained on different frames');
    assert.ok(frames[1] - frames[0] < game.ReactorVictory.SOUND_FRAMES);
    assert.deepEqual(Array.from(game.__log.sounds), ['useItem']);
});

test('the Victory nodes are made in a Victory record alone, and a Victory record is never built as a scene', () => {
    const game = inUse();
    const scene = game.__mapScene();
    // An overlay that carries a Victory node by mistake: the node makes no window.
    const overlay = game.ReactorUI.createOverlay(scene, game.ReactorUI.normalizeInterface({ id: 5, mode: 'overlay', coordinateSpace: 'screen', nodes: [
        { id: 1, type: 'box', x: 0, y: 0, width: 100, height: 40 }, Object.assign({ id: 2, type: 'victoryParty', x: 0, y: 50 }, V.defaultProps('victoryParty'))] }));
    assert.deepEqual(Array.from(overlay._nodeWindows, window => window.node().type), ['box']);
    // Playtest Interface opens a Victory record as a scene: the scene builds none of its nodes (the interface draws them).
    game.Scene_MenuBase.prototype.create = function() { this._windowLayer = game.__layer(); };
    game.Scene_MenuBase.prototype.addWindow = function(window) { this._windowLayer.addChild(window); };
    const preview = new game.Scene_ReactorUI();
    preview.prepare(3);
    preview.create();
    assert.equal(preview._interface.mode, 'victory');
    assert.equal(preview._nodeWindows.length, 0);
    assert.equal(preview._windowLayer.children.length, 0);
});

test('a layer of a Victory record that stands off-center keeps its place round the middle on another screen', () => {
    // Designed at 1280x720, played at 816x624: the design frame stands in the middle of a taller screen.
    const record = { id: 3, mode: 'victory', coordinateSpace: 'screen', design: { width: 1280, height: 720 }, nodes: [{ id: 1, type: 'box', anchor: 'topLeft', x: 200, y: 60, width: 300, height: 100 }] };
    const game = loadRuntime({ screen: [816, 624], system: { reactorVictoryInterfaceId: 3 }, interfaces: [null, null, null, record] });
    const fitted = game.ReactorVictory.record();
    assert.ok(fitted.fit && fitted.fit.height > 720);
    const box = fitted.nodes[0];
    assert.equal(box.x, 200);
    assert.equal(box.y, 60 + Math.round((fitted.fit.height - 720) / 2), 'moved down with the frame, not left at the top edge as a HUD layer would be');
});
