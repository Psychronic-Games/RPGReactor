// Battle flow under native action sequences, found in Star Shift Rebellion's truck battle: an area hit
// lands on every target at once, a walk home is not cut short by Return, an authored entry starts at
// home, a repeated victory request does not restart the victory, and a battle engine plugin keeps its battlers.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const runtime = process.env.RR_FLOW_RUNTIME || path.join(__dirname, '../../runtime');
const B = require(path.join(runtime, 'reactor_battle_data.js'));
const motion = steps => ({ id: 1, version: 1, purpose: 'motion', steps });

function load(globals) {
    const context = Object.assign({ ReactorBattleData: B, console, DataManager: { isDatabaseLoaded: () => true } }, globals);
    vm.runInNewContext(fs.readFileSync(path.join(runtime, 'reactor_battle_presentation.js'), 'utf8'), context);
    return context.ReactorBattlePresentation;
}

function impactHarness(targets) {
    const calls = [], log = { _methods: [], push(name, ...params) { this._methods.push({ name, params }); } };
    const battler = id => ({ id, isAlive: () => true, isActor: () => false, startDamagePopup() {} });
    const user = battler(0), byId = new Map(), list = targets.map(id => byId.get(id) || byId.set(id, battler(id)).get(id));
    user.friendsUnit = () => ({ members: () => [user] }); user.opponentsUnit = () => ({ members: () => [...byId.values()] });
    const sprite = x => ({ x, y: 200, _homeX: x, _homeY: 200, _offsetX: 0, _offsetY: 0, opacity: 255, rotation: 0, scale: { x: 1, y: 1, set() {} }, getColorTone: () => [0, 0, 0, 0], setColorTone() {}, getBlendColor: () => [0, 0, 0, 0], setBlendColor() {}, startMotion() {} });
    const sprites = new Map([[user, sprite(50)], ...[...byId.values()].map((b, i) => [b, sprite(300 + i * 100)])]);
    const action = { item: () => ({ damage: { type: 1 } }), makeDamageValue: () => 100, evalDamageFormula: () => 99, calcElementRate: () => 1 };
    const manager = { _action: action, _targets: list.slice(), _logWindow: log, _spriteset: { findTargetSprite: b => sprites.get(b) },
        invokeAction(subject, target) { calls.push(target.id); log.push('pushBaseLine'); log.push('popupDamage', target); log.push('performDamage', target); log.push('addText', 'hit ' + target.id); log.push('waitForNewLine'); log.push('popBaseLine'); } };
    const P = load({ SceneManager: {}, $gameParty: { battleMembers: () => [user] }, $gameTroop: { members: () => [...byId.values()] } });
    return { adapter: P.adapter(manager, user, list), calls, log };
}

test('an all-targets impact lands on every distinct target on the same update, popups ahead of the log lines', () => {
    const h = impactHarness([1, 2, 3]);
    h.adapter.cue(B.step('impact', { role: 'allTargets' }), 0);
    assert.deepEqual(h.calls, [1, 2, 3], 'all three targets resolved by the impact itself');
    assert.equal(h.adapter.pendingImpact, false);
    const names = h.log._methods.map(m => m.name);
    assert.deepEqual(names.slice(0, 6), ['popupDamage', 'performDamage', 'popupDamage', 'performDamage', 'popupDamage', 'performDamage']);
    assert.deepEqual(names.filter(n => n === 'addText').length, 3);
});

test('a repeated target is hit again on the next update, after every other target', () => {
    const h = impactHarness([1, 1, 2, 2]);
    h.adapter.cue(B.step('impact', { role: 'allTargets' }), 0);
    assert.deepEqual(h.calls, [1, 2]);
    assert.equal(h.adapter.pendingImpact, true);
    h.adapter.resolveNext();
    assert.deepEqual(h.calls, [1, 2, 1, 2]);
    assert.equal(h.adapter.pendingImpact, false);
});

test('Return starts after a walk home begun in Execute has ended, instead of cutting it', () => {
    const sequence = { id: 1, version: 1, purpose: 'action', steps: [
        B.step('move', { phase: 'execute', anchor: 'home', duration: 22, speed: 3.2, concurrent: true }),
        B.step('wait', { phase: 'execute', duration: 1 }),
        B.step('move', { phase: 'return', anchor: 'home', duration: 3, speed: 0.4 }),
    ] };
    const context = { homes: { user: { x: 0, y: 0, z: 0 }, target: { x: 8, y: 0, z: 0 } }, target: { x: 8, y: 0, z: 0 } };
    const cues = B.timeline({ ...sequence, steps: [B.step('move', { phase: 'movement', anchor: 'target', duration: 10 }), ...sequence.steps] }, context);
    const walk = cues[1], back = cues[3];
    assert.equal(walk.cut, undefined, 'the walk home is not cut');
    assert.ok(back.start >= walk.end, `return starts at ${back.start}, walk ends at ${walk.end}`);
    const at = B.evaluate({ steps: cues.map(c => c.step), _timeline: cues }, walk.start + Math.floor((walk.end - walk.start) / 2), context);
    assert.ok(at.user.x > 1 && at.user.x < 7, 'halfway home at half the walk: ' + at.user.x);
});

function graphicsHarness(scripts = []) {
    const calls = [];
    function Sprite_Actor() {}
    Object.assign(Sprite_Actor.prototype, { updateBitmap() {}, updateFrame() {}, update() {}, startMotion() {}, updateTargetPosition() {}, setupWeaponAnimation() {},
        startEntryMotion() { calls.push('stock entry'); }, startMove(...a) { calls.push(['move', ...a]); } });
    function Game_Actor() {}
    Object.assign(Game_Actor.prototype, { isSpriteVisible: () => true, performVictory() { calls.push('victory'); } });
    const scene = { _spriteset: { findTargetSprite: b => b._sprite } };
    const P = load({ Sprite_Actor, Game_Actor, SceneManager: { _scene: scene }, BattleManager: {}, PluginManager: { _scripts: scripts } });
    P.settings = B.empty(); P.sequences = [null, motion([B.step('wait', { duration: 2 })])];
    P.settings.actors[1] = { states: { entry: { mode: 'sequence', sequenceId: 1 }, victory: { mode: 'sequence', sequenceId: 1 } }, graphic: { mode: 'character', name: '$Hero', index: 0 } };
    P.installGraphics();
    const actor = Object.assign(Object.create(Game_Actor.prototype), { actorId: () => 1, isActor: () => true, currentClass: () => ({ id: 0 }), states: () => [], canMove: () => true, actor: () => ({ note: '' }) });
    const sprite = Object.assign(Object.create(Sprite_Actor.prototype), { _actor: actor });
    actor._sprite = sprite;
    return { P, calls, actor, sprite };
}

test('an actor with an authored entry state starts at home instead of the stock 30-frame run in', () => {
    const h = graphicsHarness();
    h.sprite.startEntryMotion();
    assert.deepEqual(h.calls, [['move', 0, 0, 0]]);
});

test('victory asked for every frame keeps playing instead of restarting', () => {
    const h = graphicsHarness();
    h.actor.performVictory();
    assert.equal(h.actor._rrReaction, 'victory');
    const motionStart = h.sprite._rrGraphicMotion;
    // The state machine takes the reaction and plays it.
    delete h.actor._rrReaction; h.sprite._rrStateName = 'victory';
    h.sprite._rrGraphicFrame = 30;
    h.actor.performVictory();
    assert.equal(h.actor._rrReaction, undefined, 'no new reaction while it plays');
    assert.equal(h.sprite._rrGraphicMotion, motionStart, 'the victory motion keeps its start frame');
    // Once it has ended, a new request plays it again.
    h.sprite._rrStateName = 'idle';
    h.actor.performVictory();
    assert.equal(h.actor._rrReaction, 'victory');
});

test("Victor's Battle Motions keeps the battlers: no Reactor graphic, entry or battler states", () => {
    const h = graphicsHarness(['VE_BasicModule', 'VE_BattleMotions', 'VE_BattlerGraphicSetup']);
    assert.equal(h.P.graphicFor(h.actor), null);
    assert.equal(h.P.authoredState(h.actor, 'entry'), false);
    h.sprite.startEntryMotion();
    assert.deepEqual(h.calls, ['stock entry']);
    const ss = { battlerSprites: () => [h.sprite] };
    h.P.updateStates(ss);
    assert.equal(h.sprite._rrStatePlayer, undefined);
    assert.equal(h.sprite._rrStateName, undefined);
});

test('without a battle engine plugin the same battler keeps its Reactor graphic', () => {
    const h = graphicsHarness(['VE_BasicModule', 'VE_ActiveTimeBattle']);
    assert.equal(h.P.graphicFor(h.actor)?.name, '$Hero');
});
