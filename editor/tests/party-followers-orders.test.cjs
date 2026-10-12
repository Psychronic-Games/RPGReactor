'use strict';
// A follower out of the line (runtime/reactor_objects_followers.js): a route
// from Set Movement Route never waits on the party it stepped out of, a route
// a plugin or a script gives is the stock one, the others keep their places
// until the leader walks on, an order survives the walk back after a battle,
// a hidden follower leaves no hole in the file, and an order or Hide stays
// with the actor when the party's order changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld, event, page } = require('./helpers/follower-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const party = size => Array.from({ length: size }, (_, i) => i + 1);
const step = code => ({ code, parameters: [] });
const END = { code: 0, indent: 0, parameters: [] };
const FORMATIONS = [null, 'loose', 'rank', 'wedge', 'column', 'scattered'];
const tiles = list => Array.from(list, f => f.x + ',' + f.y).join(' ');
const still = (id, x, y) => event(id, x, y, { pages: [page({ priorityType: 1 })] });

/** Set Movement Route as the editor writes it, with the dialog's defaults: Wait for Completion ticked, Skip If Cannot Move not. */
const setRoute = (who, codes, options = {}) => ({ code: 205, indent: 0,
    parameters: [who, Object.assign({ repeat: false, skippable: false, wait: true, list: codes.map(step).concat([step(0)]) }, options)] });
const switchOn = id => ({ code: 121, indent: 0, parameters: [id, id, 0] });

/** Runs a list as the map's own event until it is over or `limit` frames have passed; `each` is called every frame. */
function runEvent(w, list, limit = 600, each = null) {
    w.$gameMap._interpreter.setup(list.concat([END]), 0);
    return w.run(limit, () => { if (each) each(); return !w.$gameMap.isEventRunning(); });
}

/** Everything of the party that a frame can change, as text. */
function snapshot(w) {
    const p = w.$gamePlayer;
    return [p].concat(p.followers()._data).map(c => [c.x, c.y, c._realX.toFixed(4), c._realY.toFixed(4), c.direction(), c.moveSpeed(), c.opacity(), c.pattern(),
        c.isThrough(), c.isTransparent(), c._jumpCount, c.characterName()].join(':')).join(' ');
}

//-----------------------------------------------------------------------------
// Set Movement Route on a follower.

test('a route that steps a follower out of the line and back: the event goes on, the follower is where the route says, nobody else has moved', () => {
    const WAYS = { 'up, down': [4, 1], 'down, up': [1, 4], 'left, right': [2, 3], 'right, left': [3, 2], 'up 2, down 2': [4, 4, 1, 1] };
    for (const size of [4, 7]) {
        for (const formation of FORMATIONS) {
            const w = followerWorld({ width: 40, height: 24, start: [10, 12], party: party(size), system: { maxBattleMembers: size } });
            const p = w.$gamePlayer, F = p.followers(), base = w.Game_Followers.CHARACTER_ID;
            if (formation) F.setFormation(formation);
            w.walk(6, 6); w.rest();
            for (let place = 1; place < size; place++) {
                for (const [name, codes] of Object.entries(WAYS)) {
                    const label = `${formation || 'stock file'} of ${size}, Follower ${place}: ${name}`;
                    const follower = F._data[place - 1], from = [follower.x, follower.y];
                    const others = () => tiles(Array.from(F._data).filter(f => f !== follower));
                    const before = others();
                    let moved = 0, away = 0;
                    w.$gameSwitches.setValue(3, false);
                    runEvent(w, [setRoute(base + place, codes), switchOn(3)], 600, () => {
                        if (others() !== before) moved++;
                        if (!follower.pos(from[0], from[1])) away++;
                    });
                    assert.equal(w.$gameMap.isEventRunning(), false, `${label}: the event that waits for the route goes on`);
                    assert.equal(w.$gameSwitches.value(3), true, label);
                    assert.equal(p.canMove(), true, `${label}: the player can move again`);
                    assert.ok(away >= 16 * codes.length / 2, `${label}: it did walk`);
                    assert.deepEqual([follower.x, follower.y], from, `${label}: back on the tile it left`);
                    assert.equal(moved, 0, `${label}: nobody stepped into the place it left while the leader stood`);
                    assert.equal(follower.rrIsHeld(), true, `${label}: it stays where the route ended`);
                    // Told to follow, it is a follower in its own place again and the line is as it was.
                    F.order(place, 'follow');
                    w.run(30);
                    assert.equal(follower.rrIsHeld(), false, label);
                    assert.equal(follower.isThrough(), true, label);
                    assert.deepEqual([follower.x, follower.y], from, `${label}: in the place it had`);
                    assert.equal(others(), before, `${label}: and nobody else has moved`);
                }
            }
        }
    }
});

test('a step of a follower\'s route is never refused by a member of the party: the leader, one that follows, one that stays', () => {
    // The stock file heading east: the leader to the right of Follower 1, Follower 2 to its left.
    for (const [name, code, dx] of [['Move Left, onto Follower 2', 2, -1], ['Move Right, onto the leader', 3, 1]]) {
        const w = followerWorld({ width: 40, height: 24, start: [10, 12] });
        const p = w.$gamePlayer, F = p.followers(), base = w.Game_Followers.CHARACTER_ID;
        w.walk(6, 6); w.rest();
        const first = F._data[0], x = first.x;
        runEvent(w, [setRoute(base + 1, [code]), switchOn(3)]);
        assert.equal(w.$gameMap.isEventRunning(), false, `${name}: the event goes on`);
        assert.deepEqual([first.x, first.y], [x + dx, 12], `${name}: the step was taken`);
        assert.equal(p.canMove(), true);
    }
    // A follower that stays is in the leader's way, not in the way of a route.
    const w = followerWorld({ width: 40, height: 24, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers(), base = w.Game_Followers.CHARACTER_ID;
    w.walk(6, 6); w.rest();
    F.order(2, 'stay');
    const first = F._data[0], second = F._data[1];
    runEvent(w, [setRoute(base + 1, [2, 2]), switchOn(3)]);
    assert.equal(w.$gameMap.isEventRunning(), false, 'through one that stays: the event goes on');
    assert.deepEqual([first.x, first.y], [second.x - 1, 12]);
    assert.equal(p.canPass(second.x + 1, 12, 4), false, 'the leader does not walk onto the one that stays');
});

test('a follower on a route is a body to the map and to events, and the leader does not walk through it', () => {
    const w = followerWorld({ width: 40, height: 24, start: [10, 12], walls: [[15, 14]], events: [still(1, 15, 10)] });
    const p = w.$gamePlayer, F = p.followers(), base = w.Game_Followers.CHARACTER_ID;
    w.walk(6, 6); w.rest();
    const first = F._data[0];
    assert.deepEqual([first.x, first.y], [15, 12]);
    // Up two: the event stands on the second tile. With Skip If Cannot Move the route passes the step.
    runEvent(w, [setRoute(base + 1, [4, 4, 3], { skippable: true }), switchOn(3)]);
    assert.equal(w.$gameMap.isEventRunning(), false);
    assert.deepEqual([first.x, first.y], [16, 11], 'one up, not onto the event, then right');
    assert.equal(first.isThrough(), false);
    assert.equal(p.canPass(16, 12, 8), false, 'in the leader\'s way where the route left it');
    // Down two from (15, 12): the wall is on the second tile.
    F.order(1, 'follow'); w.rest();
    assert.deepEqual([first.x, first.y], [15, 12]);
    runEvent(w, [setRoute(base + 1, [1, 1, 2], { skippable: true }), switchOn(4)]);
    assert.deepEqual([first.x, first.y], [14, 13], 'one down, not into the wall, then left');
});

test('the others keep their places while one is out of the line and the leader stands; they close up when it walks on', () => {
    for (const formation of [null, 'loose', 'wedge', 'rank', 'column']) {
        const w = followerWorld({ width: 60, height: 30, start: [10, 12], party: party(7), system: { maxBattleMembers: 7 } });
        const p = w.$gamePlayer, F = p.followers(), label = formation || 'stock file';
        if (formation) F.setFormation(formation);
        w.walk(6, 8); w.rest();
        const before = tiles(F._data), rest = () => tiles(Array.from(F._data).slice(2));
        const others = rest();
        // A cutscene: Follower 1 is sent off, Follower 2 stays. The leader stands: nobody else moves.
        F.order(1, 'goto', { x: p.x + 3, y: p.y + 6 });
        F.order(2, 'stay');
        let moved = 0;
        w.run(400, () => { if (rest() !== others) moved++; return false; });
        assert.deepEqual([F._data[0].x, F._data[0].y], [p.x + 3, p.y + 6], `${label}: Follower 1 came to its tile, out of the middle of the party`);
        assert.equal(moved, 0, `${label}: nobody else moved`);
        // All follow: each is back in a place of the line as it stood (two of a formation may have traded).
        F.order('all', 'follow');
        w.rest(2000);
        assert.equal(F._rrHeld, 0);
        assert.deepEqual(tiles(F._data).split(' ').sort(), before.split(' ').sort(), `${label}: the line as it stood`);
        if (!formation || formation === 'loose') assert.equal(tiles(F._data), before, `${label}: a file in its order`);
        if (!formation) assert.equal(F.rrIsActive(), false, 'and the stock step has the file again');
        // Follower 1 stays and the leader walks on: the rest close up behind it, in their order in a file.
        F.order(1, 'stay');
        const first = F._data[0], at = [first.x, first.y];
        w.walk(6, 7); w.rest();
        assert.deepEqual([first.x, first.y], at, `${label}: the one that stays`);
        const walking = Array.from(F._data).slice(1);
        assert.equal(new Set(walking.map(f => f.x + ',' + f.y)).size, 5, `${label}: each on a tile of its own`);
        assert.ok(walking.every(f => Math.abs(f.x - p.x) <= 5 && Math.abs(f.y - p.y) <= 3), `${label}: with the leader (${tiles(walking)})`);
        if (!formation || formation === 'loose') {
            assert.equal(tiles(walking), [1, 2, 3, 4, 5].map(n => (p.x - n) + ',12').join(' '), `${label}: Follower 2 leads the file, nobody came round from the back`);
        }
    }
});

test('a follower sent to a tile or called back steps through the members that follow and stops beside the leader', () => {
    // A rank of six stands all round Follower 1.
    const w = followerWorld({ width: 60, height: 30, start: [10, 12], party: party(7), system: { maxBattleMembers: 7 } });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    w.walk(6, 8); w.rest();
    const first = F._data[0];
    assert.deepEqual([first.x, first.y], [p.x - 1, p.y], 'in the middle of the rank, behind the leader');
    F.order(1, 'goto', { x: p.x - 6, y: p.y });
    w.rest(2000);
    assert.deepEqual([first.x, first.y], [p.x - 6, p.y], 'out through the row behind it');
    // Called back along the row the leader stands in: it stops beside the leader, never on it.
    first.locate(p.x + 6, p.y);
    F.order(1, 'come');
    let onLeader = 0;
    w.run(600, () => { if (first.pos(p.x, p.y)) onLeader++; return !first.rrIsHeld(); });
    assert.equal(first.rrIsHeld(), false, 'it follows again');
    assert.equal(onLeader, 0);
});

test('Come makes for where the leader is now, and a follower told to stay takes no step whoever asks', () => {
    const w = followerWorld({ width: 70, height: 30, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers(), first = F._data[0];
    w.walk(6, 10); w.rest();
    F.order(1, 'goto', { x: p.x + 24, y: 12 });
    w.rest(3000);
    assert.deepEqual([first.x, first.y], [p.x + 24, 12]);
    // Called back; meanwhile the leader walks eight tiles toward it. It stops at the leader, not where the leader was.
    F.order(1, 'come');
    const was = p.x;
    let west = first.x;
    w.hold(6);
    w.run(8 * 16 + 4, () => { west = Math.min(west, first.x); return p.x >= was + 8 && !p.isMoving(); });
    w.hold(0);
    w.run(1200, () => { west = Math.min(west, first.x); return !first.rrIsHeld() && !first.isMoving(); });
    assert.equal(first.rrIsHeld(), false);
    assert.ok(west >= p.x - 1, `it never walked past the leader to where the leader had been (west to ${west}, the leader at ${p.x})`);
    // Stay.
    F.order(1, 'stay');
    const at = [first.x, first.y];
    for (const d of [2, 4, 6, 8]) {
        first.moveStraight(d);
        assert.equal(first.isMovementSucceeded(), false, `asked to step ${d}`);
    }
    first.moveDiagonally(4, 8);
    assert.equal(first.isMovementSucceeded(), false);
    w.run(40);
    assert.deepEqual([first.x, first.y], at);
});

//-----------------------------------------------------------------------------
// Routes from plugins and scripts.

/** The same play in any world: the party walks, a follower is given a route as plugins give one, the leader walks on and back through them. */
function playPluginRoute(w, give) {
    const frames = [];
    const run = n => { for (let i = 0; i < n; i++) { w.run(1); frames.push(snapshot(w)); } };
    const hold = (d, n) => { w.hold(d); run(n); };
    hold(6, 100); hold(0, 30);
    give(w);
    run(160);
    hold(6, 120); hold(4, 200); hold(2, 60); hold(0, 30);
    return frames;
}

test('a route a plugin or a script gives a follower is the stock one, frame for frame: it is walked through and follows again', t => {
    const options = { width: 50, height: 30, start: [8, 12] };
    const route = { repeat: false, skippable: false, wait: false, list: [step(4), step(4), step(19), { code: 15, parameters: [30] }, step(3), step(0)] };
    const gives = {
        'forceMoveRoute on the follower': w => w.$gamePlayer.followers().follower(1).forceMoveRoute(JSON.parse(JSON.stringify(route))),
        'Set Movement Route with -3': w => w.$gameMap._interpreter.setup([{ code: 205, indent: 0, parameters: [-3, JSON.parse(JSON.stringify(route))] }, END], 0)
    };
    for (const [name, give] of Object.entries(gives)) {
        const now = followerWorld(options), stock = followerWorld(Object.assign({ without: ['reactor_objects_followers.js'] }, options));
        const a = playPluginRoute(now, give), b = playPluginRoute(stock, give);
        for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `${name}: frame ${i}`);
        const F = now.$gamePlayer.followers(), p = now.$gamePlayer;
        assert.equal(F._rrHeld || 0, 0, `${name}: nobody was taken out of the line`);
        assert.ok(Array.from(F._data).every(f => f.isThrough() && !f.rrIsHeld()), `${name}: all walked through, as followers are`);
        assert.ok(Array.from(F._data).every(f => Math.abs(f.x - p.x) + Math.abs(f.y - p.y) <= 3), `${name}: all with the leader`);
        assert.ok(new Set(a).size > 300, 'and the party did walk');
    }
    // Against the runtime as it stood before the followers' work, where this checkout has it.
    const baseline = path.join(repo, 'scratchpad', 'ux-pass', 'baseline', 'runtime');
    if (!fs.existsSync(path.join(baseline, 'reactor_main.js'))) return t.diagnostic('no baseline runtime in this checkout: compared with the stock functions only');
    const give = gives['forceMoveRoute on the follower'];
    const a = playPluginRoute(followerWorld(options), give), b = playPluginRoute(followerWorld(Object.assign({ runtime: baseline }, options)), give);
    for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `baseline runtime, frame ${i}`);
});

test('Follower Move Routes (the imported games\' plugin): a <move character: -N> route leaves the followers followers', () => {
    const source = fs.readFileSync(path.join(repo, 'editor', 'src', 'legacy', 'plugins', 'RR_HimeFollowerRoutes.js'), 'utf8');
    const list = [];
    // The party spreads out round the leader, as such games' cutscenes begin: each follower a route of its own.
    for (const [id, codes] of [[-2, [2, 2]], [-3, [3, 3]], [-4, [4, 4]]]) {
        list.push({ code: 108, indent: 0, parameters: [`<move character: ${id}>`] });
        list.push({ code: 205, indent: 0, parameters: [-1, { repeat: false, skippable: false, wait: true, list: codes.map(step).concat([step(0)]) }] });
    }
    list.push(switchOn(3), END);
    const play = w => {
        vm.runInContext(source, w, { filename: 'RR_HimeFollowerRoutes.js' });
        const frames = [], run = n => { for (let i = 0; i < n; i++) { w.run(1); frames.push(snapshot(w)); } };
        w.hold(8); run(80); w.hold(0); run(30);
        w.$gameMap._interpreter.setup(JSON.parse(JSON.stringify(list)), 0);
        run(200);
        // The leader walks back down through where they stand, then on.
        w.hold(2); run(160); w.hold(6); run(100); w.hold(0); run(30);
        return frames;
    };
    const options = { width: 40, height: 30, start: [20, 20] };
    const now = followerWorld(options), stock = followerWorld(Object.assign({ without: ['reactor_objects_followers.js'] }, options));
    const a = play(now), b = play(stock);
    for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `frame ${i}`);
    const p = now.$gamePlayer, F = p.followers();
    assert.equal(now.$gameSwitches.value(3), true, 'the cutscene ended');
    assert.ok(p.y >= 23, `the leader walked back through the party (it stands at ${p.x},${p.y})`);
    assert.ok(Array.from(F._data).every(f => f.isThrough() && !f.rrIsHeld()));
});

test('Tyruswoo Follower Control (Star Shift Rebellion): followers sent out by its routes fall in again when the leader walks on', t => {
    const game = path.join(repo, 'template', 'Star Shift Rebellion');
    if (!fs.existsSync(path.join(game, 'js', 'plugins', 'TYR_FollowerControl.js'))) return t.skip('the game is not in this checkout');
    const common = JSON.parse(fs.readFileSync(path.join(game, 'data', 'CommonEvents.json'), 'utf8'))[15];
    const w = followerWorld({ width: 40, height: 30, start: [20, 20] });
    // An MV plugin reads the command's parameters from the interpreter, and logs each command.
    vm.runInContext(`(function() {
        const run = Game_Interpreter.prototype.executeCommand;
        Game_Interpreter.prototype.executeCommand = function() { const c = this.currentCommand(); this._params = c && c.parameters ? c.parameters : []; return run.call(this); };
        PluginManager.parameters = PluginManager.parameters || function() { return {}; };
        console = { log() {}, warn() {}, error() {} };
    })();`, w);
    vm.runInContext(fs.readFileSync(path.join(game, 'js', 'plugins', 'TYR_FollowerControl.js'), 'utf8'), w, { filename: 'TYR_FollowerControl.js' });
    const p = w.$gamePlayer, F = p.followers();
    w.walk(8, 4); w.rest();
    w.$gameMap._interpreter.setup(common.list, 0);
    w.run(1200, () => !w.$gameMap.isEventRunning());
    w.run(120);
    assert.ok(Array.from(F._data).some(f => f.x !== p.x), 'the routes sent them out to the sides');
    w.walk(8, 6); w.rest();
    for (const [i, f] of Array.from(F._data).entries()) {
        assert.ok(Math.max(Math.abs(f.x - p.x), Math.abs(f.y - p.y)) <= 4, `Follower ${i + 1} was left behind at ${f.x},${f.y} (the leader is at ${p.x},${p.y})`);
        assert.equal(f.isThrough(), true, `Follower ${i + 1} is walked through, as a follower is`);
    }
});

test('in a formation a script\'s route on a follower is not cut short, and the follower walks back to its place afterwards', () => {
    const w = followerWorld({ width: 50, height: 30, start: [8, 12] });
    const p = w.$gamePlayer, F = p.followers(), first = F._data[0];
    F.setFormation('wedge');
    w.walk(6, 8); w.rest();
    const place = [first.x, first.y];
    // Two tiles up, a wait far longer than the formation gives a walk of its own to stand, two more.
    first.forceMoveRoute({ repeat: false, skippable: false, wait: false, list: [step(4), step(4), { code: 15, parameters: [200] }, step(4), step(4), step(0)] });
    w.run(180);
    assert.equal(first.isMoveRouteForcing(), true, 'still on its route while it waits');
    assert.deepEqual([first.x, first.y], [place[0], place[1] - 2]);
    assert.equal(first.rrIsHeld(), false, 'and it was not taken out of the line');
    let top = first.y;
    w.run(600, () => { top = Math.min(top, first.y); return !first.isMoveRouteForcing() && !first.isMoving() && first.pos(place[0], place[1]); });
    assert.equal(top, place[1] - 4, 'the route was walked to its end');
    assert.deepEqual([first.x, first.y], place, 'then back to its place in the wedge');
});

test('the script call for a route: followers().route(who, moveRoute) is Set Movement Route on a follower', () => {
    const w = followerWorld({ width: 40, height: 24, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    w.walk(6, 6); w.rest();
    const sent = F.route({ actorId: 3 }, { repeat: false, skippable: false, wait: false, list: [step(1), step(1), step(0)] });
    assert.equal(Array.from(sent).length, 1);
    const second = F._data[1];
    assert.equal(second.rrIsHeld(), true);
    w.rest();
    assert.deepEqual([second.x, second.y], [14, 14]);
    w.walk(6, 4); w.rest();
    assert.deepEqual([second.x, second.y], [14, 14], 'it stays where the route ended');
    assert.equal(Array.from(F.route(9, { list: [step(0)] })).length, 0, 'a place nobody walks in is nobody');
    assert.equal(Array.from(F.route(1, null)).length, 0);
    assert.equal(F._data[0].rrIsHeld(), false);
});

//-----------------------------------------------------------------------------
// Orders and a battle on the map; Hide; the party's order.

test('orders given while the party walks back after a battle on the map are kept', () => {
    for (const formation of [null, 'wedge']) {
        const w = followerWorld({ width: 60, height: 30, start: [10, 12], events: [event(1, 24, 12, { note: '<unit: enemy 1>' })] });
        const p = w.$gamePlayer, F = p.followers(), label = formation || 'stock file';
        if (formation) F.setFormation(formation);
        w.walk(6, 6); w.rest();
        w.$gameFight.start({ mode: 'tactical', troopId: 0, canEscape: true, canLose: true });
        w.run(30);
        // The battle leaves the party spread out.
        F._data[0].locate(19, 8); F._data[1].locate(20, 16); F._data[2].locate(13, 15);
        w.run(10);
        w.$gameFight.end(w.ReactorFight.WIN);
        w.run(600, () => !w.$gameFight.isActive());
        assert.ok(F._rrRegroup, `${label}: the walk back is under way`);
        const first = F._data[0], second = F._data[1], third = F._data[2], at = [first.x, first.y];
        F.order(1, 'stay');
        F.order(2, 'goto', { x: 30, y: 20 });
        assert.equal(!!F._rrRegroup, false, `${label}: the order ends that walk`);
        w.rest(2000);
        assert.deepEqual([first.x, first.y], at, `${label}: the follower told to stay was not moved`);
        assert.equal(first.isThrough(), false, `${label}: and it stands in the way as a body`);
        assert.deepEqual([second.x, second.y], [30, 20], `${label}: the one sent to a tile arrived`);
        assert.equal(second.isThrough(), false);
        assert.equal(third.isThrough(), true, `${label}: the third follows`);
        assert.ok(Math.abs(third.x - p.x) <= 2 && Math.abs(third.y - p.y) <= 2, `${label}: and came to the leader by itself (${third.x},${third.y}; the leader ${p.x},${p.y})`);
    }
});

test('a hidden follower leaves no hole in the single file, and has its place again when it is shown', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    w.walk(6, 5); w.rest();
    assert.deepEqual(w.places(), ['14,12', '13,12', '12,12']);
    F.order(2, 'hide');
    const before = tiles(F._data);
    w.run(60);
    assert.equal(tiles(F._data), before, 'nobody moves while the leader stands');
    w.walk(6, 6); w.rest();
    assert.deepEqual(w.places(), ['20,12', '19,12'], 'the third walks right behind the first');
    assert.equal(F.rrIsActive(), false, 'and the stock step has the file');
    w.walk(2, 4); w.rest();
    assert.deepEqual(w.places(), ['21,15', '21,14'], 'round a corner too');
    F.order(2, 'show');
    w.walk(6, 5); w.rest();
    assert.deepEqual(w.places(), [(p.x - 1) + ',16', (p.x - 2) + ',16', (p.x - 3) + ',16'], 'three in a file again, in their order');
    assert.equal(F.rrIsActive(), false);
});

test('an order and Hide stay with the actor when the party\'s order changes', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    const actorOf = f => (f.actor() ? f.actor().actorId() : 0);
    const staying = list => Array.from(list._data).filter(f => f.rrIsHeld());
    w.walk(6, 5); w.rest();
    // The party is actors 1, 2, 3, 4: Follower 2 is actor 3. It stays.
    F.order(2, 'stay');
    const objects = Array.from(F._data), at = [objects[1].x, objects[1].y];
    assert.equal(actorOf(objects[1]), 3);
    w.walk(6, 4); w.rest();
    const walking = [objects[0].x, objects[0].y];
    // The menu's Formation: the second and third members change places.
    w.$gameParty.swapOrder(1, 2);
    assert.deepEqual(Array.from(F._data), objects, 'each follower object still stands for its place in the line');
    assert.deepEqual(Array.from(F._data, f => f._memberIndex), [1, 2, 3]);
    assert.deepEqual(Array.from(F._data, actorOf), [3, 2, 4]);
    assert.deepEqual(staying(F).map(actorOf), [3], 'the one that stays is still actor 3');
    const body = staying(F)[0];
    assert.equal(body, objects[0], 'it is the first follower now, as actor 3 is the second member');
    assert.deepEqual([body.x, body.y, body.isThrough()], [at[0], at[1], false], 'on the tile it was told to stay on');
    assert.equal(body.characterIndex(), w.$gameActors.actor(3).characterIndex(), 'and looks like actor 3');
    assert.deepEqual([objects[1].x, objects[1].y, objects[1].rrIsHeld(), objects[1].isThrough()], [walking[0], walking[1], false, true], 'actor 2 walks with the leader, where it was walking');
    // Named by its actor, the order finds the same body.
    assert.equal(Array.from(F.order({ actorId: 3 }, 'stay'))[0], body);
    // A save keeps who it is.
    w.saveAndLoad();
    const F2 = w.$gamePlayer.followers(), kept = staying(F2)[0];
    assert.deepEqual([kept.x, kept.y, actorOf(kept)], [at[0], at[1], 3]);
    // Hidden: actor 4 is hidden as Follower 3; moved up the party it is still the one not seen.
    F2.order(3, 'hide');
    w.$gameParty.swapOrder(2, 3);
    assert.deepEqual(Array.from(F2._data, actorOf), [3, 4, 2]);
    assert.deepEqual(Array.from(F2._data).filter(f => !f.isVisible()).map(actorOf), [4]);
    assert.deepEqual(Array.from(F2._data, f => f._memberIndex), [1, 2, 3]);
    // The one that stays becomes the leader: its order is over, and the body falls in for whoever it shows now.
    w.$gameParty.swapOrder(0, 1);
    assert.equal(F2._rrHeld, 0, 'no follower stands for actor 3 any more: nobody stays');
    assert.ok(Array.from(F2._data).every(f => !f.rrIsHeld() && f.isThrough()));
    assert.deepEqual(Array.from(F2._data).filter(f => !f.isVisible()).map(actorOf), [4], 'actor 4 is still hidden');
    // One that leaves the party: Hide ends with it.
    w.$gameParty.removeActor(4);
    assert.equal(F2._rrUnseen, 0);
    assert.ok(Array.from(F2._data).every(f => !f._rrHidden));
});
