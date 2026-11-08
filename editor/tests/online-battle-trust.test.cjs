// What a shared battle's host takes from other games: only their own units, and only numbers any weapon has.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtime = path.resolve(__dirname, '..', '..', 'runtime');

function loadAction(fight) {
    const sent = [], fired = [], landed = [];
    const scope = {
        console, performance: { now: () => 0 },
        ReactorOnlineBattle: { send: message => sent.push(message), guests: new Map() },
        ReactorFight: { Action: { fire: (f, unit, ...args) => fired.push({ unit, args }), land: (f, unit, targets, kind, id, rate) => landed.push({ unit, targets, rate }) } }
    };
    vm.createContext(scope);
    // The module's object only: its hooks into ReactorFight.Action are installed by a block that needs the whole game.
    const source = fs.readFileSync(path.join(runtime, 'reactor_online_action.js'), 'utf8');
    vm.runInContext(source.slice(0, source.indexOf('if (typeof ReactorFight !== "undefined"')) + '\nthis.ReactorOnlineAction = ReactorOnlineAction;', scope);
    return { A: scope.ReactorOnlineAction, sent, fired, landed };
}

function fight(units) {
    return {
        unit: id => units.find(unit => unit.id === id) || null,
        character: unit => ({ unit }),
        playerUnit: () => null,
        isAlive: unit => !unit.dead,
        playMotion() {}
    };
}

test('a guest\'s shot is shown and passed on only for the unit that guest plays', () => {
    const units = [{ id: 1, remoteSlot: 3 }, { id: 2, remoteSlot: 4 }];
    const { A, sent, fired } = loadAction();
    const f = fight(units), shot = { t: 'afire', u: 2, args: [{ pellets: 1, range: 10 }, 0, 0, 0, 0, 1, 0, 0, false, 2] };
    A.onHost(f, shot, 3);
    assert.equal(fired.length, 0, 'slot 3 does not shoot for slot 4\'s unit');
    assert.equal(sent.length, 0);
    A.onHost(f, { ...shot, u: 1 }, 3);
    assert.equal(fired.length, 1);
    assert.equal(sent.length, 1);
});

test('a shot\'s numbers are held to what a weapon has before any game draws it', () => {
    const { A } = loadAction();
    const [profile, ...rest] = A.fairShot([{ pellets: 1e9, range: Infinity, speed: 1e12, blast: 99, damage: 50, spread: 720 }, 0, 0, 0, 0, NaN, 0, 1, false, 1e6, 0, 0, 0]);
    assert.deepEqual([profile.pellets, profile.range, profile.speed, profile.blast, profile.damage, profile.spread], [16, 0, 400, 10, 1, 90]);
    assert.equal(rest[4], 0, 'a direction that is not a number is none');
    assert.equal(rest[8], 90, 'spread at most a quarter turn');
    assert.equal(A.fairShot([null]), null);
    assert.equal(A.fairShot('x'), null);
});

test('a guest\'s blow lands only from its own unit, at most a whole blow', () => {
    const units = [{ id: 1, remoteSlot: 3 }, { id: 9 }];
    const { A, landed } = loadAction();
    const f = fight(units);
    A.onHost(f, { t: 'ahit', u: 1, kind: 'attack', id: 1, rate: 40, targets: [9] }, 4);
    assert.equal(landed.length, 0, 'not from another slot');
    A.onHost(f, { t: 'ahit', u: 1, kind: 'attack', id: 1, rate: 40, targets: [9] }, 3);
    assert.equal(landed.length, 1);
    assert.equal(landed[0].rate, 1);
});

// A guest the host dropped is refused by bSay (403) from then on: it must not send the same lines for the rest of the battle.
function loadBattle() {
    const posts = [];
    const scope = {
        console, performance: { now: () => 0 }, fetch: async () => ({ ok: true, json: async () => ({ next: 0, lines: [] }) }),
        $gameMap: { mapId: () => 1 },
        ReactorOnline: { slot: 3, nonce: 'n', token: 't', request: () => 'url', post: async (action) => { posts.push(action); const error = new Error('Not in this battle.'); error.status = 403; throw error; } }
    };
    vm.createContext(scope);
    const source = fs.readFileSync(path.join(runtime, 'reactor_online_battle.js'), 'utf8');
    const start = source.indexOf('const ReactorOnlineBattle = {'), end = source.indexOf('// ---- The battle, online ----');
    vm.runInContext(source.slice(start, end) + '\nthis.ReactorOnlineBattle = ReactorOnlineBattle;', scope);
    return { B: scope.ReactorOnlineBattle, posts };
}

test('a guest refused by the battle long after any beat would name it leaves, instead of resending forever', async () => {
    const { B, posts } = loadBattle();
    let lost = 0;
    B.onLost = () => { lost++; };
    B.role = 'guest'; B.id = 'abcdef0123456789';
    B.outbox.push({ t: 'plan', n: 1 });
    // Refused while joining: kept and retried (the host's next beat names this player).
    await B.exchange(1000);
    assert.equal(B.outbox.length, 1);
    assert.equal(lost, 0);
    await B.exchange(1000 + B.BEAT_MS);
    assert.equal(lost, 0, 'a beat may still be on its way');
    await B.exchange(1000 + B.GONE_MS * 2 + 1);
    assert.equal(lost, 1, 'refused far past a beat: out of the battle');
    assert.equal(posts.length, 3);
});
