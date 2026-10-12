'use strict';
// Action Sequences on the live map (runtime/reactor_fight_stage.js): the grid's
// distance rule, the built-in sequences, a run played through the shared
// sequence player on map characters (no Reactor3D, then a 3D stand-in), its
// timing against the timeline, the unit back on its cell, runs cut short and
// resumed, hit reactions, and the steps shared with the battle scene.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { fightWorld, event } = require('./helpers/fight-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const source = file => fs.readFileSync(path.join(runtimeRoot, file), 'utf8');

/** The fight world with the sequence data, the presentation and the stage loaded; one enemy beside the player. */
function stageWorld({ events = [event(1, 3, 2, { note: '<unit: enemy 1>' })], sequences = null, settings = null, before = null } = {}) {
    const w = fightWorld({ events });
    if (before) before(w);
    for (const file of ['reactor_battle_data.js', 'reactor_battle_presentation.js', 'reactor_fight_stage.js']) vm.runInContext(source(file), w, { filename: file });
    const P = w.ReactorBattlePresentation;
    P.state = 'ready';
    if (sequences) P.sequences = sequences;
    if (settings) P.settings = Object.assign(w.ReactorBattleData.empty(), settings);
    w.$dataEnemies[1].params[0] = 5000;
    // Every Stage.update is noted: the frame, where the acting unit is drawn, the enemy's HP.
    const S = w.ReactorFight.Stage, update = S.update;
    w.trace = [];
    S.update = function(ctx) {
        const more = update.call(this, ctx);
        const c = ctx.character;
        w.trace.push({ frame: ctx.run.frame, x: c._realX, y: c._realY, tx: c._x, ty: c._y, z: c._rrStage ? c._rrStage.z : 0, applied: !!ctx.run.applied, more, user: c });
        return more;
    };
    return w;
}

/** Runs until the first staged run has ended and everyone is back on a cell. */
function playOne(w, limit = 2000) {
    w.$gameFight.start({ mode: 'tactical' });
    w.run(limit, () => w.trace.length > 0 && !w.trace.at(-1).more && !w.ReactorFight.Stage.isBusy());
    return w.trace.slice(0, w.trace.findIndex(entry => !entry.more) + 1);
}

const plain = value => JSON.parse(JSON.stringify(value));

test('the grid rule: a strike stops short of the target cell, steps are half length along the line to the target', () => {
    const S = stageWorld().ReactorFight.Stage;
    const home = { x: 5, y: 5, facing: 90 }, east = { x: 6, y: 5 }, north = { x: 5, y: 2 }, far = { x: 12, y: 5 };
    const goal = (step, facing, from = home) => plain(S.mapGoal(step, from, home, facing));
    assert.deepEqual(goal({ anchor: 'approach', x: -1.2 }, east), { x: 5.4, y: 5, z: 0 }, 'beside the target: 0.6 from its middle');
    assert.deepEqual(goal({ anchor: 'target', x: 0 }, east), { x: 5.4, y: 5, z: 0 }, 'a move onto the target stops at its cell');
    assert.deepEqual(goal({ anchor: 'approach', x: -4 }, east), { x: 5, y: 5, z: 0 }, 'a long standoff never backs past home');
    const lunge = goal({ anchor: 'approach', x: -1.2 }, far);
    assert.equal(lunge.x, 6.5, 'from afar the lunge is clamped to MAX_TRAVEL');
    const up = goal({ anchor: 'approach', x: -1.2 }, north);
    assert.ok(Math.abs(up.x - 5) < 1e-9 && Math.abs(up.y - 3.5) < 1e-9, 'the approach follows the line to the target, whichever way it lies');
    const step = goal({ anchor: 'home', x: 1 }, north);
    assert.ok(Math.abs(step.x - 5) < 1e-9 && Math.abs(step.y - 4.5) < 1e-9, 'a step forward is half a tile, toward the target');
    assert.deepEqual(goal({ anchor: 'home', x: 0, y: 0 }, east, { x: 5.4, y: 5 }), { x: 5, y: 5, z: 0 }, 'home is the cell');
    assert.deepEqual(goal({ moveMode: 'position', x: 400, y: 300 }, east), { x: 5, y: 5, z: 0 }, 'a screen position means home');
    assert.deepEqual(goal({ moveMode: 'backward', x: 1 }, east, { x: 5.4, y: 5 }), { x: 4.9, y: 5, z: 0 }, 'a step back from where the unit is');
});

test('mapSequence turns every single move into a place on the grid and splits a move of all targets', () => {
    const w = stageWorld(), S = w.ReactorFight.Stage, B = w.ReactorBattleData;
    const homes = { user: { x: 2, y: 2, facing: 90 }, target: { x: 4, y: 2 }, target0: { x: 4, y: 2 }, target1: { x: 4, y: 3 } };
    const sequence = { id: 1, version: 1, steps: [
        B.step('move', { anchor: 'approach', x: -1.2, duration: 10 }),
        B.step('move', { role: 'allTargets', moveMode: 'backward', x: 1, duration: 6 }),
        B.step('impact', { role: 'allTargets' }),
        B.step('move', { duration: 10 })] };
    const mapped = S.mapSequence(sequence, homes);
    assert.equal(mapped.steps.length, 5, 'the move of both targets is two moves');
    assert.deepEqual([mapped.steps[0].moveMode, mapped.steps[0].x, mapped.steps[0].y], ['position', 3.4, 2]);
    assert.deepEqual([mapped.steps[1].role, mapped.steps[1].targetIndex, mapped.steps[1].concurrent], ['target', 0, true]);
    assert.deepEqual([mapped.steps[2].role, mapped.steps[2].targetIndex, !!mapped.steps[2].concurrent], ['target', 1, false]);
    assert.ok(mapped.steps[1].x > 4, 'a target steps back away from the user');
    assert.deepEqual([mapped.steps[4].x, mapped.steps[4].y], [2, 2], 'the return ends on the cell');
    assert.equal(sequence.steps[0].moveMode, 'anchor', 'the authored sequence is untouched');
    assert.deepEqual(Array.from(B.validateSequence(mapped)), [], 'and the mapped one is still a valid sequence');
});

test('an action with no sequence gets a built-in one of its kind, each a valid sequence of about forty frames', () => {
    const w = stageWorld(), S = w.ReactorFight.Stage, B = w.ReactorBattleData;
    const action = flags => Object.assign({ item: () => ({ animationId: 1 }), isAttack: () => false, isPhysical: () => false, isRecover: () => false, isForFriend: () => false, isForAll: () => false }, flags);
    const isItem = w.DataManager.isItem;
    assert.equal(S.kindOf(action({ isAttack: () => true, isPhysical: () => true }), { reach: 1 }), 'melee');
    assert.equal(S.kindOf(action({ isAttack: () => true, isPhysical: () => true }), { reach: 4 }), 'ranged');
    assert.equal(S.kindOf(action({}), { reach: 3 }), 'magic');
    assert.equal(S.kindOf(action({ isRecover: () => true }), {}), 'recovery');
    assert.equal(S.kindOf(action({ isForAll: () => true, isPhysical: () => true }), {}), 'area');
    w.DataManager.isItem = () => true;
    assert.equal(S.kindOf(action({}), {}), 'item');
    w.DataManager.isItem = isItem;
    for (const kind of ['melee', 'ranged', 'magic', 'item', 'recovery', 'area']) {
        const sequence = S.defaultSequence(kind, { reach: kind === 'melee' ? 1 : 4 });
        assert.deepEqual(Array.from(B.validateSequence(sequence)), [], kind + ' validates');
        assert.equal(sequence.steps.filter(step => step.type === 'impact').length, 1, kind + ' lands one result');
        const length = B.duration(sequence);
        assert.ok(length >= 24 && length <= 60, kind + ' lasts ' + length + ' frames');
        assert.ok(sequence.steps.every(step => S.supports(step)), kind + ' uses steps the stage plays');
    }
    assert.ok(S.defaultSequence('ranged', { reach: 4 }).steps.some(step => step.type === 'projectile'), 'a ranged attack flies something');
    assert.ok(!S.defaultSequence('item', { self: true }).steps.some(step => step.type === 'projectile'), 'an item on oneself is not thrown');
});

test('with no Action Sequences at all a melee attack lunges, lands, and the unit is back on its cell (no Reactor3D)', () => {
    const w = stageWorld();
    assert.equal(typeof w.Reactor3D, 'undefined');
    const run = playOne(w);
    assert.ok(run.length >= 24 && run.length <= 60, 'played ' + run.length + ' frames');
    const user = run[0].user;
    assert.ok(run.every(entry => entry.tx === user._x && entry.ty === user._y), 'the unit never left its cell');
    const reach = Math.max(...run.map(entry => Math.abs(entry.x - entry.tx) + Math.abs(entry.y - entry.ty)));
    assert.ok(reach > 0.25 && reach <= 0.31, 'it lunged ' + reach + ' tiles toward the target, as far as two bodies allow');
    const landed = run.findIndex(entry => entry.applied);
    assert.ok(landed > 0 && landed < run.length - 1, 'the result landed mid-sequence, at the lunge');
    assert.ok(Math.abs(run[landed].x - run[landed].tx) + Math.abs(run[landed].y - run[landed].ty) > 0.25, 'at the end of the lunge');
    assert.equal(w.$gameFight.unitOfEvent(1).enemy.hp, 5000 - (60 * 4 - 5 * 2), 'the stock formula, once');
    assert.equal(user._realX, user._x);
    assert.equal(user._realY, user._y);
    assert.equal(user._rrStage, undefined, 'nobody is left on the stage');
    assert.equal(w.$gameMap.event(1)._rrStage, undefined);
    assert.equal(w.ReactorFight.Stage.isBusy(), false);
});

test('each built-in kind plays to a landed result with the unit back on its cell', () => {
    for (const kind of ['melee', 'ranged', 'magic', 'item', 'recovery', 'area']) {
        const w = stageWorld({ events: [event(1, kind === 'melee' ? 3 : 4, 2, { note: '<unit: enemy 1>' })] });
        const S = w.ReactorFight.Stage;
        S.kindOf = () => kind;
        w.ReactorFight.inReachOverride = true;
        const run = playOne(w, 4000);
        assert.ok(run.length > 0, kind + ' played');
        assert.ok(run.some(entry => entry.applied), kind + ' landed its result');
        const user = run[0].user;
        assert.equal(user._realX, user._x, kind + ': back on the cell');
        assert.equal(user._rrStage, undefined, kind + ': off the stage');
    }
});

const strike = B => ({ id: 1, version: 1, name: 'Test Strike', steps: [
    B.step('direction', { direction: 'targets', duration: 0 }),
    B.step('motion', { motion: 'attack', duration: 0 }),
    B.step('move', { anchor: 'approach', x: -1.2, duration: 12, easing: 'linear' }),
    B.step('wait', { duration: 5 }),
    B.step('impact', { role: 'allTargets' }),
    B.step('wait', { duration: 9 }),
    B.step('move', { duration: 12, easing: 'linear' }),
    B.step('motion', { motion: 'idle', duration: 0 })] });

test('an assigned sequence lands its result on the frame the timeline says, as the battle scene would', () => {
    const w = stageWorld({ before: world => { world.assign = true; } });
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation;
    P.sequences = [null, strike(B)];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    w.$gameFight.start({ mode: 'tactical' });
    w.run(2);
    const enemy = w.$gameFight.unitOfEvent(1), hero = w.$gameFight.units().find(unit => unit !== enemy && w.$gameFight.character(unit) === w.$gamePlayer);
    assert.deepEqual(plain(w.ReactorFight.Stage.sequenceInfo({ unitId: hero.id, kind: 'skill', itemId: 1, targetIds: [enemy.id] })), { cameraSteps: 0, impactAt: [17], length: 38 }, 'the camera can ask what a run will be before it starts');
    assert.equal(w.$gamePlayer._rrStage, undefined, 'asking stages nobody');
    w.run(2000, () => w.trace.length > 0 && !w.trace.at(-1).more && !w.ReactorFight.Stage.isBusy());
    const run = w.trace.slice(0, w.trace.findIndex(entry => !entry.more) + 1);
    const timeline = B.timeline(strike(B));
    const impactAt = timeline.find(cue => cue.step.type === 'impact').start;
    assert.equal(impactAt, 17);
    const landed = run.find(entry => entry.applied);
    assert.equal(landed.frame, impactAt, 'the blow lands on the timeline frame');
    assert.equal(run.at(-1).frame, timeline[0].total, 'and the run is as long as the timeline');
    const mid = run.find(entry => entry.frame === 6);
    assert.ok(Math.abs((mid.x - mid.tx) - 0.15) < 1e-9, 'halfway through a twelve-frame move to 0.3 the unit is 0.15 out');
    assert.ok(run.filter(entry => entry.frame >= 12 && entry.frame <= 26).every(entry => Math.abs((entry.x - entry.tx) - 0.3) < 1e-9), 'it holds beside the target through the blow');
});

test('every kind of step reaches the stage: data, screen, held items, the camera, a projectile, branches', () => {
    const calls = { held: [], camera: [], start: [] };
    const w = stageWorld();
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation, F = w.ReactorFight;
    F.heldItem = (character, op, options) => { if (['show', 'move', 'hide'].includes(op)) calls.held.push([op, options && options.hold, !!(options && options.battler), !!(options && options.targetCharacter)]); };
    F.Director = { isBusy: () => false, sequenceStart: info => calls.start.push(info), sequenceCamera: (step, context) => { calls.camera.push([step.anchor, !!context.user, !!context.target]); return true; } };
    const flash = [], shake = [], balloons = [];
    w.$gameScreen.startFlash = (color, duration) => flash.push(duration);
    w.$gameScreen.startShake = (power, speed, duration) => shake.push(power);
    w.$gameTemp.requestBalloon = (character, id) => balloons.push(id);
    let seen = null;
    const steps = [
        B.step('weapon', { mode: 'show', iconSource: 'weapon', attachment: 'rightHand', duration: 0 }),
        B.step('camera', { anchor: 'target', duration: 6 }),
        B.step('branch', { condition: 'a.hp > 0' }),
        B.step('switch', { switchId: 8, operation: 'on' }),
        B.step('else', {}),
        B.step('switch', { switchId: 7, operation: 'on' }),
        B.step('end', {}),
        B.step('variable', { variableId: 2, operation: 'set', amount: 'a.atk' }),
        B.step('jump', { height: 1, duration: 8 }),
        B.step('weapon', { mode: 'move', x: 0.2, duration: 6 }),
        B.step('balloon', { balloonId: 3 }),
        B.step('flash', { red: 255, green: 255, blue: 255, alpha: 160, duration: 8 }),
        B.step('shake', { power: 4, speed: 5, duration: 8 }),
        B.step('projectile', { iconSource: 'color', destination: 'allTargets', duration: 10, arc: 1 }),
        B.step('formula', { operation: 'set', formula: '77' }),
        B.step('impact', { role: 'allTargets' }),
        B.step('hp', { role: 'user', amount: '-5', percent: 'points', show: 'show' }),
        B.step('opacity', { opacity: 100, duration: 4 }),
        B.step('weapon', { visible: false, duration: 0 }),
        B.step('wait', { duration: 4 })];
    P.sequences = [null, { id: 1, version: 1, name: 'Everything', steps }];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    const update = F.Stage.update;
    F.Stage.update = function(ctx) { const more = update.call(this, ctx); const flying = F.Stage.projectile(); if (flying && !seen) seen = plain(flying); return more; };
    const before = w.$gameActors.actor(1).hp;
    const run = playOne(w);
    assert.ok(run.length > 20);
    assert.deepEqual(calls.held.map(call => call[0]), ['show', 'move', 'hide', 'hide'], 'weapon steps go to the held-item hook, and the run puts away what it showed');
    assert.deepEqual(calls.held[0].slice(1), ['fist', true, true], 'with the step, the battler and the target');
    assert.deepEqual(calls.camera, [['target', true, true]], 'a camera step goes to the director');
    assert.equal(calls.start.length, 1);
    assert.equal(calls.start[0].cameraSteps, 1);
    assert.equal(calls.start[0].impactAt.length, 1);
    assert.equal(w.$gameSwitches.value(8), true, 'the taken branch ran');
    assert.equal(w.$gameSwitches.value(7), false, 'the other did not');
    assert.equal(w.$gameVariables.value(2), 60, 'an expression sees the user');
    assert.deepEqual([flash, shake, balloons], [[8], [4], [3]]);
    assert.ok(run.some(entry => entry.z > 0.5), 'the jump lifted the unit');
    assert.ok(seen && seen.t >= 0 && seen.t < 1 && seen.y === 0, 'a projectile in flight is reported to the camera, flat on a 2D map');
    assert.equal(w.$gameFight.unitOfEvent(1).enemy.hp, 5000 - 77, "the sequence's formula replaced the skill's");
    assert.equal(w.$gameActors.actor(1).hp, before - 5, 'Change HP reached the user');
    assert.equal(run[0].user._opacity, 255, 'opacity is given back');
    assert.equal(run[0].user._rrStage, undefined);
});

test('a run cut short puts everyone back at once; a run resumed after a load does not land twice', () => {
    const w = stageWorld();
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation, F = w.ReactorFight;
    P.sequences = [null, strike(B)];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    w.$gameFight.start({ mode: 'tactical' });
    w.run(2000, () => w.trace.length > 0 && w.trace.at(-1).frame === 8);
    const user = w.trace[0].user;
    assert.ok(user._realX !== user._x, 'mid-lunge');
    const run = w.$gameFight._run;
    F.Stage.end(run, run._ctx, true);
    assert.equal(user._realX, user._x, 'snapped home');
    assert.equal(user._rrStage, undefined);
    assert.equal(F.Stage.isBusy(), false);

    // Resumed: the same run, twenty frames in and already landed.
    const resumed = { subjectId: run.subjectId, targetIds: run.targetIds.slice(), kind: 'skill', itemId: 1, attack: true, frame: 20, applied: true };
    const ctx = Object.assign({}, run._ctx, { run: resumed });
    const hp = w.$gameFight.unitOfEvent(1).enemy.hp;
    assert.equal(F.Stage.begin(resumed, ctx), true);
    assert.ok(Math.abs((user._realX - user._x) - 0.3) < 1e-9, 'rebuilt at its frame: beside the target');
    assert.equal(w.$gameFight.unitOfEvent(1).enemy.hp, hp, 'nothing landed again');
    let frames = 0;
    while (F.Stage.update(ctx) && frames++ < 100);
    assert.equal(resumed.frame, 38, 'it played on to the end of the timeline');
    F.Stage.end(resumed, ctx, false);
    for (let i = 0; i < 20; i++) w.$gameMap.update(true);
    assert.equal(user._realX, user._x);
    assert.equal(user._rrStage, undefined);
});

test('a struck unit flinches and a missed one sidesteps, then both stand on their cells', () => {
    const w = stageWorld();
    const F = w.ReactorFight;
    w.$gameFight.start({ mode: 'tactical' });
    w.run(3);
    const unit = w.$gameFight.unitOfEvent(1), target = w.$gameMap.event(1);
    const attacker = w.$gameFight.units().find(u => u !== unit);
    F.Stage.react({ unitId: attacker.id, targetId: unit.id, damage: 10 });
    let moved = 0;
    for (let i = 0; i < 6; i++) { w.$gameMap.update(false); moved = Math.max(moved, Math.abs(target._realX - target._x) + Math.abs(target._realY - target._y)); }
    assert.ok(moved > 0.05 && moved < 0.3, 'flinched ' + moved);
    for (let i = 0; i < 12; i++) w.$gameMap.update(false);
    assert.equal(target._realX, target._x);
    assert.equal(target._rrStage, undefined);
    F.Stage.react({ unitId: attacker.id, targetId: unit.id, missed: true });
    w.$gameMap.update(false); w.$gameMap.update(false); w.$gameMap.update(false);
    assert.ok(Math.abs(target._realX - target._x) + Math.abs(target._realY - target._y) > 0.05, 'sidestepped');
    for (let i = 0; i < 20; i++) w.$gameMap.update(false);
    assert.equal(target._realY, target._y);
    F.Stage.react({ unitId: attacker.id, targetId: unit.id, heal: true });
    assert.equal(target._rrStage, undefined, 'a heal moves nobody');
});

test('on a 3D map a model plays the motion and pose steps through its own rules and is lifted in the world', () => {
    const holders = new Map();
    const w = stageWorld({ before: world => {
        vm.runInContext(`
            Reactor3D = {
                viewport: () => ({ camera: () => ({}) }), shouldRender3D: () => true,
                characterGround: () => 2, characterHeightTiles: () => 2,
                projectToScreen: (camera, x, y, z, out) => Object.assign(out || {}, { x: x * 10, y: 500 - y * 10, visible: true }),
                modelInstanceKey: character => character,
                modelHolderFor: character => Reactor3D.holders.get(character) || null,
                holders: null
            };
        `, world);
        world.Reactor3D.holders = holders;
        vm.runInContext('ReactorBattleRoomView = { prepareMotions() {}, aimTurnOf: (record, part, at) => 33 + at.x };', world);
    } });
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation, F = w.ReactorFight;
    const steps = strike(B).steps;
    steps.splice(4, 0, B.step('motion', { motion: '__pose', parts: [{ part: 'RightUpperArm', rotate: [0, 0, 90] }, { part: 'Turret', aim: 'target' }], duration: 6 }));
    steps.splice(2, 0, B.step('jump', { height: 1, duration: 6, concurrent: true }));
    P.sequences = [null, { id: 1, version: 1, name: 'Posed', steps }];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    const holder = { object: {}, binding: { clips: [] }, rules: [{ trigger: 'action', name: 'Attack', type: 'clip' }], animationFrame: 100 };
    holders.set(w.$gamePlayer, holder);
    const seen = { actions: new Set(), lift: 0, posed: false };
    const update = F.Stage.update;
    F.Stage.update = function(ctx) {
        const more = update.call(this, ctx);
        if (holder.action) seen.actions.add(holder.action.name);
        seen.posed = seen.posed || holder.rules.some(rule => String(rule.name).startsWith('pose:'));
        const turret = holder.rules.find(rule => rule.part === 'Turret'); if (turret) seen.aim = turret.keys[1].rotate[1];
        seen.lift = Math.max(seen.lift, w.$gamePlayer._reactorLift || 0);
        return more;
    };
    const run = playOne(w);
    assert.ok(run.length > 0);
    assert.ok(seen.actions.has('Attack'), "the model's own Attack motion played");
    assert.ok([...seen.actions].some(name => name.startsWith('pose:')), 'then the pose step, as its own action');
    assert.ok(seen.posed, 'with its pose rules on the model');
    assert.equal(seen.aim, 33 + 3, 'a part that aims is turned to the target, measured on the model as the battle scene measures it');
    assert.ok(seen.lift > 0.5, 'the jump is height in the world');
    assert.equal(holder.action, null, 'the model is given back to its idle');
    assert.ok(!holder.rules.some(rule => String(rule.name).startsWith('pose:')), 'with no pose rules left on it');
    assert.equal(w.$gamePlayer._reactorLift || 0, 0);
    assert.equal(w.$gamePlayer._rrStage, undefined);
});

test('the steps that change game data are one function for the battle scene and the map', () => {
    const w = stageWorld();
    const P = w.ReactorBattlePresentation;
    const text = source('reactor_battle_presentation.js');
    assert.match(text, /const shared=P\.gameCue\(step,\{chosen,subject,number,audioSaved,feedback:/, "the battle scene's adapter hands its data steps to P.gameCue");
    assert.equal(text.split("if(step.type==='switch')").length, 2, 'and keeps no copy of them');
    assert.match(source('reactor_fight_stage.js'), /P\.gameCue\(step, \{ chosen, subject, number: amount/, 'so does the stage');
    const shown = [];
    const battler = w.$gameActors.actor(1), hp = battler.hp;
    assert.deepEqual(plain(P.gameCue({ type: 'hp', amount: '-12', percent: 'points', show: 'show' }, { chosen: [battler], subject: battler, number: v => Number(v), audioSaved: {}, feedback: b => shown.push(b) })), {});
    assert.equal(battler.hp, hp - 12);
    assert.equal(shown.length, 1);
    P.gameCue({ type: 'variable', variableId: 3, operation: 'add', amount: 4 }, { chosen: [], subject: battler, number: v => Number(v), audioSaved: {} });
    assert.equal(w.$gameVariables.value(3), 4);
    assert.equal(P.gameCue({ type: 'motion' }, { chosen: [], subject: battler, number: Number, audioSaved: {} }), null, 'a step that is not its own is left to the caller');
    assert.equal(P.evalSequence('a.atk + b.def', battler, { def: 5 }, null), 65);
});

test('bodies set the standoff: reach meets the body, never inside either, and two that stand too near step back', () => {
    const w = stageWorld(), S = w.ReactorFight.Stage;
    const home = { x: 5, y: 5, facing: 90 }, east = { x: 6, y: 5 }, far = { x: 9, y: 5 };
    const goal = (step, facing, clear, from = home) => plain(S.mapGoal(step, from, home, facing, clear));
    assert.deepEqual(goal({ anchor: 'approach', x: -1.2 }, east, 0.7), { x: 5.3, y: 5, z: 0 }, 'beside it: up to the bodies');
    assert.deepEqual(goal({ anchor: 'approach', x: -1.2 }, east, 1.3), { x: 4.7, y: 5, z: 0 }, 'two large bodies on adjacent cells: back off, as far as their clearance');
    assert.deepEqual(goal({ anchor: 'approach', x: -1.2 }, east, 2.5), { x: 4.5, y: 5, z: 0 }, 'but half a pace at most');
    assert.deepEqual(goal({ anchor: 'approach', x: -1.2 }, far, 2.5), { x: 6.5, y: 5, z: 0 }, 'from afar: stop where the reach meets the body');
    assert.deepEqual(goal({ anchor: 'home', x: 1 }, east, 1.3), { x: 4.7, y: 5, z: 0 }, 'a step forward never ends inside the body ahead');
    assert.deepEqual(goal({ anchor: 'home' }, east, 1.3), { x: 5, y: 5, z: 0 }, 'and home is still the cell');
    assert.deepEqual(goal({ moveMode: 'forward', x: 2 }, east, 1.3, { x: 4.7, y: 5 }), { x: 4.7, y: 5, z: 0 });
    // What the clearance is made of: sprites, then models measured by their footprint.
    const sprite = { _x: 5, _y: 5 }, other = { _x: 6, _y: 5 };
    assert.ok(Math.abs(S.clearance(sprite, null, other) - 0.7) < 1e-9, 'two sprites: a body and an arm');
    assert.ok(Math.abs(S.clearance(sprite, { weapons: () => [{ id: 1 }] }, other) - (0.3 + 0.85 * 0.6)) < 1e-9, 'a weapon reaches farther');
    vm.runInContext(`Reactor3D = { characterModelSpec: c => c.spec, characterHeightTiles: c => c.tall, databaseModelSpec: (kind, id) => ({ size: 1.5, scale: 1 }),
        eventModelFootprint: (c, spec) => ({ rawX: spec.halfX, rawZ: spec.halfZ, yaw: 0 }) };`, w);
    const person = { _x: 5, _y: 5, tall: 3, spec: { halfX: 1.2, halfZ: 0.3 } }, giant = { _x: 6, _y: 5, tall: 4, spec: { halfX: 1.6, halfZ: 0.6 } };
    const tank = { _x: 6, _y: 5, tall: 2, spec: { halfX: 1.5, halfZ: 4 } };
    assert.ok(Math.abs(S.bodyRadius(person, 1, 0) - 0.3) < 1e-9, 'a standing figure is as deep as its body, whatever its arms span');
    assert.ok(Math.abs(S.bodyRadius(tank, 1, 0) - 1.5) < 1e-9 && Math.abs(S.bodyRadius(tank, 0, 1) - 4) < 1e-9, 'a vehicle is its footprint toward the other');
    const unarmed = S.clearance(person, null, giant), armed = S.clearance(person, { weapons: () => [{ id: 1 }] }, giant);
    assert.ok(Math.abs(unarmed - (0.6 + 0.85 * 0.36 * 3)) < 1e-9, 'an arm of a figure three tiles tall');
    assert.ok(Math.abs(armed - (0.6 + 0.85 * (0.36 * 3 + 0.8 * 1.5))) < 1e-9, 'and the length of the sword in it');
    assert.ok(S.clearance(tank, null, person) >= 0.3 + 1.5 + 0.1, 'a ram stops at the body');
    assert.ok(Math.abs(S.hitHeight(giant) - 2.2) < 1e-9 && Math.abs(S.hitHeight(giant, 1) - 2.2) < 1e-9, "a shot lands mid-body: the sequence's one tile is a shin on a tall model");
    assert.equal(S.hitHeight(giant, 3), 3, 'a height the step gives is kept');
});

test('an action that repeats lands each hit on its own, a few frames apart; a sequence that lands its own hits lands one per Apply step', () => {
    const impacts = w => { const seen = []; w.ReactorEvents.on('fightImpact', p => seen.push([p.hit, p.hits, w.trace.length])); return seen; };
    // Repeats 3, one Apply step.
    const w = stageWorld();
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation;
    w.$dataSkills[1].repeats = 3;
    P.sequences = [null, strike(B)];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    const seen = impacts(w);
    const run = playOne(w);
    assert.deepEqual(seen.map(hit => hit.slice(0, 2)), [[1, 3], [2, 3], [3, 3]], 'three results');
    const gap = w.ReactorFight.Stage.HIT_GAP;
    assert.deepEqual([seen[1][2] - seen[0][2], seen[2][2] - seen[1][2]], [gap, gap], 'spaced, not together');
    assert.equal(w.$gameFight.unitOfEvent(1).enemy.hp, 5000 - 3 * 230, 'each for the full formula');
    assert.ok(run.length >= 38 + 2 * gap - 1 && run.length <= 38 + 2 * gap + 1, 'the sequence held while they landed: ' + run.length);
    assert.equal(run.at(-1).applied, true);
    assert.equal(run[0].user._realX, run[0].user._x);

    // Three Apply steps, authored: one each, whatever Repeats says.
    const a = stageWorld();
    const Ba = a.ReactorBattleData, Pa = a.ReactorBattlePresentation;
    a.$dataSkills[1].repeats = 2;
    const steps = [Ba.step('motion', { motion: 'attack', duration: 4 })];
    for (let i = 0; i < 3; i++) steps.push(Ba.step('impact', { role: 'allTargets' }), Ba.step('wait', { duration: 5 }));
    Pa.sequences = [null, { id: 1, version: 1, name: 'Triple', hitPolicy: 'authored', steps }];
    Pa.settings = Object.assign(Ba.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    const hits = impacts(a);
    const played = playOne(a);
    assert.deepEqual(hits.map(hit => hit.slice(0, 2)), [[1, 3], [2, 3], [3, 3]]);
    assert.deepEqual([hits[1][2] - hits[0][2], hits[2][2] - hits[1][2]], [5, 5], 'on the frames the sequence put them');
    assert.equal(a.$gameFight.unitOfEvent(1).enemy.hp, 5000 - 3 * 230, 'three, not Repeats times three and not two');
    assert.equal(played.length, 19, 'nothing held');

    // A target that falls on the second of five hits takes no more, and the sequence moves on.
    const d = stageWorld();
    const Bd = d.ReactorBattleData, Pd = d.ReactorBattlePresentation;
    d.$dataSkills[1].repeats = 5;
    Pd.sequences = [null, strike(Bd)];
    Pd.settings = Object.assign(Bd.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    const fell = impacts(d);
    d.$gameFight.start({ mode: 'tactical' });
    d.run(3);
    d.$gameFight.unitOfEvent(1).enemy._hp = 300;
    d.run(2000, () => d.trace.length > 0 && !d.trace.at(-1).more);
    assert.equal(fell.length, 2, 'two hits, then it is down');
    assert.equal(d.$gameFight.unitOfEvent(1).enemy.hp, 0);
});

test('several runs play at once on different units, each landing its own result; a run can play at double pace, away from the camera', () => {
    const w = stageWorld({ events: [event(1, 3, 2, { note: '<unit: enemy 1>' }), event(2, 8, 8, { note: '<unit: enemy 1>' }), event(3, 9, 8, { note: '<unit: actor 3>' })] });
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation, F = w.ReactorFight, S = F.Stage;
    const steps = strike(B).steps;
    steps.splice(1, 0, B.step('camera', { anchor: 'target', duration: 0 }));
    P.sequences = [null, { id: 1, version: 1, name: 'Strike', steps }];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    const camera = [];
    F.Director = { isBusy: () => false, sequenceStart: info => camera.push(info.unitId), sequenceCamera: () => { camera.push('step'); return true; } };
    const fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    w.run(2);
    fight.update = function() {};
    const unit = id => fight.unitOfEvent(id), hero = fight.units().find(u => fight.character(u) === w.$gamePlayer);
    for (const id of [1, 2]) unit(id).enemy._hp = 5000;
    const make = (subject, target, extra) => {
        const action = new w.Game_Action(fight.battler(subject)); action.setAttack();
        const run = Object.assign(F.makeRun(fight, subject, action, [target]), extra);
        const character = fight.character(subject), tc = fight.character(target);
        return { run, ctx: { fight, run, action, subject, character, targets: [target], targetCharacters: [tc], cell: null, frame: 0 }, character };
    };
    const a = make(hero, unit(1), {}), b = make(unit(3), unit(2), { rate: 2, side: true });
    assert.equal(S.begin(a.run, a.ctx), true);
    assert.equal(S.begin(b.run, b.ctx), true);
    let frames = 0, aDone = 0, bDone = 0, both = false;
    while ((!aDone || !bDone) && frames++ < 200) {
        if (!aDone && !S.update(a.ctx)) { aDone = frames; S.end(a.run, a.ctx, false); }
        if (!bDone && !S.update(b.ctx)) { bDone = frames; S.end(b.run, b.ctx, false); }
        both = both || (a.character._realX !== a.character._x && b.character._realX !== b.character._x);
        w.$gameMap.update(false);
    }
    assert.ok(both, 'both units were out of their cells at the same time');
    assert.equal(aDone, 38, 'the full run at its own pace');
    assert.equal(bDone, 19, 'the side run in half the frames');
    assert.deepEqual([a.run.applied, b.run.applied, a.run.hits, b.run.hits], [true, true, 1, 1]);
    assert.equal(unit(1).enemy.hp, 5000 - 230);
    assert.ok(unit(2).enemy.hp < 5000, 'each landed on its own target');
    assert.deepEqual(camera, [hero.id, 'step'], 'only the main run is announced to the camera');
    for (let i = 0; i < 20; i++) w.$gameMap.update(false);
    for (const c of [a.character, b.character]) { assert.equal(c._realX, c._x); assert.equal(c._rrStage, undefined); }
    assert.equal(S.isBusy(), false);
});

test('with the map, before any battle: what its units and the party can play is readied one action a frame, once a session', () => {
    const spawn = { code: 357, indent: 0, parameters: ['RPGReactor', 'SpawnUnit', '', { record: 'enemy', id: 1, team: 'enemy' }] };
    const w = stageWorld({ events: [event(1, 3, 2, { note: '<unit: enemy 1>' }), event(2, 9, 9, {})] });
    const B = w.ReactorBattleData, P = w.ReactorBattlePresentation, S = w.ReactorFight.Stage;
    // The Attack plays a sequence whose shot flies a picture and plays an effect animation.
    P.sequences = [null, { id: 1, version: 1, name: 'Shot', steps: [B.step('projectile', { iconSource: 'picture', name: 'Bolt', animationId: 3 }), B.step('impact', { role: 'allTargets' })] }];
    P.settings = Object.assign(B.empty(), { skills: { 1: { mode: 'sequence', sequenceId: 1 } } });
    w.$dataAnimations[3] = { id: 3, effectName: 'Burst', flashTimings: [], soundTimings: [] };
    const loaded = [];
    w.ImageManager.loadPicture = name => { loaded.push('picture ' + name); return {}; };
    w.ImageManager.loadSystem = name => { loaded.push('system ' + name); return {}; };
    w.EffectManager = { load: name => { loaded.push('effect ' + name); } };
    // The records a battle here can bring: the unit event's, and what an event spawns (each once).
    w.$dataMap.events[2].pages[0].list = [spawn, spawn, { code: 0, indent: 0, parameters: [] }];
    assert.deepEqual(plain(S.mapRecords(w.$dataMap)), [{ record: 'enemy', id: 1 }]);
    S.warmMap();
    const queued = S._warm.map(entry => (entry.battler.isActor() ? 'a' + entry.battler.actorId() : 'e' + entry.battler.enemyId()) + ':' + entry.skillId);
    assert.ok(queued.includes('e1:1') && queued.includes('a1:1') && queued.includes('a2:1'), `the unit's record and the party (${queued})`);
    assert.ok(S._warm.every(entry => entry.character === null), 'nobody stands on the map for it');
    assert.equal(new Set(queued).size, queued.length, 'each record and skill once');
    // On the quiet map the stage works through it one action a frame.
    const before = S._warm.length;
    w.$gameMap.update(true);
    assert.equal(S._warm.length, before - 1);
    for (let i = 0; i < 40 && S._warm.length; i++) w.$gameMap.update(true);
    assert.equal(S._warm.length, 0);
    assert.ok(loaded.includes('picture Bolt') && loaded.includes('effect Burst'), `the sequence's picture and effect were asked for (${loaded})`);
    // Asked again (the map scene starts after a menu): nothing is queued twice.
    S.warmMap();
    assert.equal(S._warm.length, 0, 'readied once a session: ' + S._warm.map(entry => S.warmKey(entry.battler, entry.skillId)).join(' ') + ' / ' + [...S._warmed].join(' '));
    // The battle's own warm-up then has only each unit's model to prepare.
    w.$gameFight.start({ mode: 'tactical' });
    assert.ok(S._warm.length > 0 && S._warm.every(entry => entry.skillId === 0), 'no record is resolved again at battle start');
    w.$gameFight.end(1, true);
    // Another weapon in the hand is another sequence: that actor is readied again; a battle running is left alone.
    const actor = w.$gameActors.actor(1), weapons = actor.weapons;
    actor.weapons = () => [{ id: 7 }];
    S.warmMap();
    assert.equal(S._warm.filter(entry => entry.skillId).length, 0, 'the battle is still closing');
    for (let i = 0; i < 600 && w.$gameFight.isActive(); i++) { w.$gameMap.update(true); w.$gameFight.update(); }
    assert.ok(!w.$gameFight.isActive());
    S.warmMap();
    assert.deepEqual(Array.from(S._warm.filter(entry => entry.skillId), entry => entry.battler.actorId() + ':' + entry.skillId), ['1:1']);
    actor.weapons = weapons;
});

test('a place for a spawned unit: the nearest free cell that can be stood on, asking the map only about cells nobody holds', () => {
    const w = stageWorld({ events: [event(1, 3, 2, { note: '<unit: enemy 1>' }), event(2, 4, 3, {})] });
    w.$gameFight.start({ mode: 'tactical' });
    const fight = w.$gameFight, map = w.$gameMap, real = { passable: map.isPassable, events: map.eventsXyNt };
    const asked = { passable: [], events: [] };
    map.eventsXyNt = function(x, y) { asked.events.push(x + ',' + y); return real.events.call(this, x, y); };
    map.isPassable = function(x, y, d) { if (d === 2) asked.passable.push(x + ',' + y); return !(x === 2 && y === 1) && real.passable.call(this, x, y, d); };
    try {
        const unit = fight.units().find(entry => entry.eventId === 1), player = w.$gamePlayer;
        assert.ok(unit && fight.unitAt(3, 2) === unit);
        w.$gameMap.event(2).setThrough(false);
        const spot = fight.freeSpotNear(3, 2, 1);
        // Around (3,2), in ring order: a wall at (2,1) is passed over, as is the plain event at (4,3) and wherever the party stands.
        const ring = [[2, 1], [2, 2], [2, 3], [3, 1], [3, 3], [4, 1], [4, 2], [4, 3]];
        const free = ([x, y]) => !(x === 2 && y === 1) && !(x === 4 && y === 3) && !player.pos(x, y) && !fight.unitAt(x, y) && [2, 4, 6, 8].some(d => real.passable.call(map, x, y, d));
        const expected = ring.find(free);
        assert.deepEqual([spot.x, spot.y], expected, 'the first free cell of the nearest ring');
        // A cell a unit or the player holds is settled without asking the map who stands on it or how it can be walked.
        const held = ring.filter(([x, y]) => player.pos(x, y) || fight.unitAt(x, y)).map(cell => cell.join(','));
        for (const cell of held) assert.ok(!asked.events.includes(cell) && !asked.passable.includes(cell), `nothing asked about ${cell}`);
        assert.ok(!asked.passable.includes('4,3') || expected.join(',') !== '4,3', 'an event\'s cell is never offered');
        // Asked from the unit's own cell with the ring at 1, its cell is not in the ring; a far search passes cells by the same rules.
        const far = fight.freeSpotNear(3, 2, 3);
        assert.ok(far && Math.max(Math.abs(far.x - 3), Math.abs(far.y - 2)) >= 3);
    } finally { map.isPassable = real.passable; map.eventsXyNt = real.events; }
});
