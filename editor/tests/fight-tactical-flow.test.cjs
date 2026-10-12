'use strict';
// The flow of a Tactical battle a player follows (runtime/reactor_fight_tactical.js): the pace of the units that
// decide for themselves (one at a time by default, the fast and skip settings, armies), the battle menu and the
// questions it asks, End Turn and Retreat, the goal as it counts down and changes, the hint line's tips with the
// names of the keys in force, and the turn strip's click.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const world = (options = {}) => {
    const w = fightWorld(Object.assign({ tactical: true }, options));
    // The player's options are kept by the game's own config file: nothing is written from a test.
    w.ConfigManager.save = () => {};
    return w;
};
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const mira = w => w.$gameFight._units.find(u => u.actorId === 2);
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);
const at = (w, u) => { const c = w.$gameFight.character(u); return [c.x, c.y]; };
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
/** The other side's phase, frame by frame, until the player's next pick: the feed with the frame of each event. */
function watchPhase(w, fight, each, limit = 20000) {
    const feed = [];
    let frame = 0;
    for (const name of ['fightUnitTurn', 'fightMoveStart', 'fightMoveEnd', 'fightAim', 'fightFire', 'fightImpact', 'fightActionEnd']) {
        w.ReactorEvents.on(name, p => feed.push({ name, id: p.unitId, frame, quick: !!p.quick, side: !!p.side }));
    }
    const turn = fight.turn();
    assert.ok(fight.commandEndTurn());
    while (frame < limit && fight.isActive() && !(fight.tacticalState() === 'unit' && fight.turn() > turn)) {
        w.run(1); frame++;
        if (fight._tac && each) each(frame);
    }
    return { feed, frames: frame };
}
const KEYS = { 9: 'tab', 13: 'ok', 16: 'shift', 17: 'control', 27: 'escape', 33: 'pageup', 34: 'pagedown', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 45: 'escape', 81: 'pageup', 87: 'pagedown', 88: 'escape', 90: 'ok' };
const PAD = { 0: 'ok', 1: 'cancel', 2: 'shift', 3: 'menu', 4: 'pageup', 5: 'pagedown', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const mapped = w => { w.Input.keyMapper = Object.assign({}, KEYS); w.Input.gamepadMapper = Object.assign({}, PAD); return w; };

test('the normal pace: the other side acts one unit at a time in the strip\'s order, each turn from its look to its result before the next begins', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 6, 4, 'enemy 1'), unit(3, 7, 3, 'enemy 1'), unit(4, 8, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataSkills[1].note = '<range: 1-3>';                                           // each of the four has someone in reach
    w.$dataSkills[1].damage.formula = '5';                                           // nobody falls: four whole turns
    const F = w.ReactorFight, fight = begin(w);
    assert.equal(F.pace(), 'normal', 'the pace a new player starts with');
    assert.equal(fight.isWatched(), true);
    const order = Array.from(fight._tac.order).filter(id => fight.unit(id).team === 'enemy');
    const stages = new Set(), readyAt = {}, aimAt = {};
    let together = 0, shownWhileDeciding = 0, idle = 0, lookFocus = true, readyCursor = true;
    const { feed } = watchPhase(w, fight, frame => {
        const tac = fight._tac, act = fight._act;
        together = Math.max(together, (tac.movers || []).length + (tac.runs || []).length + (tac.aside || []).length);
        if (!act || act.player) { const next = fight._queue[0]; if (fight.tacticalState() === 'idle' && next && next.kind === 'unit' && !fight.isPlayerUnit(fight.unit(next.unitId))) idle++; return; }
        stages.add(act.stage);
        if (act.stage === 'ready' && readyAt[act.unitId] === undefined) readyAt[act.unitId] = frame;
        if ((act.stage === 'aim' || act.stage === 'perform') && aimAt[act.unitId] === undefined) aimAt[act.unitId] = frame;
        const own = fight.character(fight.unit(act.unitId));
        if (act.stage === 'plan' && fight.activeUnit()) shownWhileDeciding++;
        // The view goes to the unit before it does anything, and its target is pointed at before the blow.
        if (act.stage === 'look' && !(tac.focus.x === own.x && tac.focus.y === own.y && fight.activeUnit() === fight.unit(act.unitId))) lookFocus = false;
        if (act.stage === 'ready' && !(fight.cursor() && fight.cursor().x === act.plan.cx && fight.cursor().y === act.plan.cy)) readyCursor = false;
    });
    assert.equal(together, 0, 'nobody walks or acts beside the unit whose turn is watched');
    assert.ok(feed.every(e => !e.quick && !e.side), 'nothing is played quick');
    assert.deepEqual(feed.filter(e => e.name === 'fightUnitTurn').map(e => e.id), order, 'in the turn strip\'s order');
    for (const stage of ['plan', 'look', 'walk', 'ready', 'aim', 'perform', 'rest']) assert.ok(stages.has(stage), `a watched turn goes through "${stage}"`);
    assert.equal(shownWhileDeciding, 0, 'a unit still deciding is not shown as acting');
    assert.equal(idle, 0, 'between two units the state stays "enemy" (a HUD\'s line does not blink)');
    assert.ok(lookFocus, 'the view is on the unit while it is looked at');
    assert.ok(readyCursor, 'the cursor is on the cell it aims at before the action begins');
    // Each unit's events are its own stretch of the phase, with the beats between them.
    const aims = feed.filter(e => e.name === 'fightAim');
    assert.ok(aims.length >= 3, `those in reach struck (${aims.length})`);
    for (const aim of aims) {
        const began = feed.find(e => e.name === 'fightUnitTurn' && e.id === aim.id), end = feed.find(e => e.name === 'fightActionEnd' && e.id === aim.id);
        assert.ok(aim.frame - began.frame >= F.BEAT_LOOK + F.BEAT_AIM, `unit ${aim.id}: looked at, then aimed (${aim.frame - began.frame} frames)`);
        assert.ok(feed.find(e => e.name === 'fightImpact' && e.id === aim.id), 'its blow landed');
        assert.ok(aimAt[aim.id] - readyAt[aim.id] >= F.BEAT_AIM, `unit ${aim.id}: its target was pointed at for a beat before the blow (${aimAt[aim.id] - readyAt[aim.id]} frames)`);
        const next = feed.find(e => e.name === 'fightUnitTurn' && e.frame > began.frame);
        if (next) assert.ok(next.frame - end.frame >= F.BEAT_REST, `the result is read before the next unit begins (${next.frame - end.frame} frames)`);
        if (next) assert.ok(!feed.some(e => e.id !== aim.id && e.frame > began.frame && e.frame < end.frame), 'and no other unit does anything meanwhile');
    }
});

test('the pace by size and setting: a ten against ten battle is watched unit by unit, the fast pace plays it side by side, an army is fast at any setting, skip is quick at any size', () => {
    const lineup = n => Array.from({ length: n }, (_, i) => unit(i + 1, 8 + (i % 3), 1 + (i % 13), 'enemy 1'));
    const phase = (n, pace) => {
        const w = world({ events: lineup(n), system: pace ? { reactorBattle: { pace } } : {} });
        w.$dataSkills[1].note = '<range: 1-9>';
        w.$dataSkills[1].damage.formula = '3';
        w.$dataEnemies[1].params[0] = 9000;
        const fight = begin(w);
        const flags = { watched: fight.isWatched(), overlaps: fight.overlaps(), crowded: fight.isCrowded(), army: fight.isArmy(), standing: fight.standing() };
        let together = 0;
        const { feed, frames } = watchPhase(w, fight, () => { together = Math.max(together, (fight._tac.runs || []).length + (fight._act && (fight._act.stage === 'perform' || fight._act.stage === 'aim') ? 1 : 0)); });
        return Object.assign(flags, { together, frames, quick: feed.filter(e => e.name === 'fightAim' && e.quick).length, aims: feed.filter(e => e.name === 'fightAim').length });
    };
    // Eighteen enemies and the party of two: twenty standing, as ten against ten.
    const normal = phase(18, '');
    assert.equal(normal.standing, 20);
    assert.deepEqual([normal.watched, normal.overlaps, normal.crowded, normal.army], [true, false, false, false]);
    assert.equal(normal.together, 1, 'one action at a time');
    assert.equal(normal.quick, 0);
    assert.ok(normal.aims >= 10, `and every unit in reach had its turn (${normal.aims})`);
    const fast = phase(18, 'fast');
    assert.deepEqual([fast.watched, fast.overlaps], [false, true]);
    assert.ok(fast.together >= 3, `the fast pace plays them side by side (${fast.together})`);
    assert.ok(fast.frames < normal.frames / 3, `in a fraction of the time (${fast.frames} against ${normal.frames} frames)`);
    // Twenty-six enemies: an army. The setting does not slow it down.
    const army = phase(26, ''), armyFast = phase(26, 'fast');
    assert.deepEqual([army.watched, army.overlaps, army.crowded, army.army], [false, true, true, true]);
    assert.ok(army.quick > 0 && army.together >= 3);
    assert.ok(army.frames <= armyFast.frames * 1.1, `an army plays as fast at the normal setting (${army.frames}) as at the fast one (${armyFast.frames})`);
    // An army stays one to its end: the pace does not change under the player as its lines thin out.
    const w = world({ events: lineup(26) }), fight = begin(w);
    assert.equal(fight.isArmy(), true);
    for (const u of fight.units({ team: 'enemy' }).slice(0, 12)) { fight.battler(u).setHp(0); fight.defeat(u); }
    assert.equal(fight.standing(), 16);
    assert.deepEqual([fight.isArmy(), fight.isWatched()], [true, false], 'still an army with sixteen standing');
    // Skip: a skirmish of six plays quick.
    const six = phase(6, ''), skip = phase(6, 'skip');
    assert.deepEqual([skip.overlaps, skip.crowded], [true, true]);
    assert.ok(skip.quick > 0, 'its actions are quick');
    assert.ok(skip.frames < six.frames / 3, `${skip.frames} against ${six.frames} frames`);
});

test('the normal pace: units that only close in far from the party walk together off to the side, the view stays theirs only while no turn is watched; a walk near the party is watched', () => {
    const far = [unit(1, 17, 2, 'enemy 1'), unit(2, 17, 4, 'enemy 1'), unit(3, 17, 6, 'enemy 1'), unit(4, 17, 8, 'enemy 1')];
    let w = world({ events: far });
    let fight = begin(w);
    const F = w.ReactorFight;
    let aside = 0, movers = 0, shown = 0, followed = true;
    const stages = new Set();
    let run = watchPhase(w, fight, () => {
        const tac = fight._tac, act = fight._act;
        aside = Math.max(aside, (tac.aside || []).length);
        movers = Math.max(movers, (tac.movers || []).length);
        if (act && !act.player) stages.add(act.stage);
        if (fight.activeUnit() && fight.activeUnit().team === 'enemy') shown++;
        // With no turn watched, the view goes with the first of those walking aside.
        if ((tac.aside || []).length && (!act || act.stage === 'plan' || act.stage === 'hold')) {
            const lead = fight.character(fight.unit(tac.aside[0].unitId));
            if (Math.abs(tac.focus.x - lead._realX) > 0.01 || Math.abs(tac.focus.y - lead._realY) > 0.01) followed = false;
        }
    });
    assert.equal(aside, 3, 'three walk at once');
    assert.equal(movers, 0, 'and not as an army does (the view does not pull back for them)');
    assert.ok(stages.has('hold'), 'the fourth waits for a place');
    assert.equal(shown, 0, 'none of them is shown as the acting unit');
    assert.ok(followed, 'the view goes with them while nothing else is shown');
    assert.equal(run.feed.filter(e => e.name === 'fightMoveStart').length, 4);
    assert.equal(run.feed.filter(e => e.name === 'fightMoveEnd').length, 4);
    for (const u of fight.units({ team: 'enemy' })) { const c = fight.character(u); assert.equal(c.isThrough(), false); assert.equal(c.moveSpeed(), 4); assert.ok(c.x < 17, 'it closed in'); }
    assert.equal((fight._tac.aside || []).length, 0);
    assert.equal(new Set(fight.units({ team: 'enemy' }).map(u => at(w, u).join(','))).size, 4, 'each on its own cell');

    // One that ends its walk near the party: its turn is watched (looked at, then it walks), though it only moves.
    w = world({ events: [unit(1, 10, 2, 'enemy 1')] });
    fight = begin(w);
    const seen = new Set();
    let wasAside = 0;
    run = watchPhase(w, fight, () => { const act = fight._act; if (act && !act.player) seen.add(act.stage); wasAside = Math.max(wasAside, (fight._tac.aside || []).length); });
    assert.equal(wasAside, 0);
    for (const stage of ['look', 'walk', 'rest']) assert.ok(seen.has(stage), stage);
    const turn = run.feed.find(e => e.name === 'fightUnitTurn'), start = run.feed.find(e => e.name === 'fightMoveStart');
    assert.ok(start.frame - turn.frame >= w.ReactorFight.BEAT_LOOK, `the view rested on it before it walked (${start.frame - turn.frame} frames)`);
    assert.equal(F.ASIDE, w.ReactorFight.ASIDE);
});

test('the pace is the player\'s setting, kept with the game\'s options; a project says what a new player starts with', () => {
    let w = world();
    const F = w.ReactorFight;
    assert.deepEqual(Array.from(F.PACES), ['normal', 'fast', 'skip']);
    assert.equal(F.pace(), 'normal');
    assert.equal(F.setPace('fast'), 'fast');
    assert.equal(w.ConfigManager.makeData().rrFightPace, 'fast');
    assert.equal(F.setPace('warp'), 'fast', 'an unknown pace changes nothing');
    w.ConfigManager.applyData({ rrFightPace: 'skip', rrFightHints: false });
    assert.equal(F.pace(), 'skip');
    assert.equal(F.Hints.enabled(), false);
    w.ConfigManager.applyData({});
    assert.equal(F.pace(), 'normal', 'a config with none plays the normal pace');
    assert.equal(F.Hints.enabled(), true);
    assert.equal(w.ConfigManager.makeData().rrFightPace, undefined);
    w = world({ system: { reactorBattle: { pace: 'fast', hints: false } } });
    assert.equal(w.ReactorFight.pace(), 'fast', 'the project\'s own');
    assert.equal(w.ReactorFight.Hints.enabled(), false);
    w.ReactorFight.setPace('normal');
    assert.equal(w.ReactorFight.pace(), 'normal', 'the player\'s choice over the project\'s');
    assert.ok(w.ReactorFight.ARMY > 20 && w.ReactorFight.ARMY >= w.ReactorFight.CROWD, 'ten against ten is no army');
});

test('End Turn counts who would lose their turn, Retreat ends the battle as an escape where it may be left, and both say no when they do not apply', () => {
    let w = world({ events: [unit(1, 15, 8, 'enemy 1')] });
    let fight = begin(w);
    assert.equal(fight.unactedCount(), 2, 'at the pick: both');
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.equal(fight.unactedCount(), 1, 'in a unit\'s own menu: the others');
    assert.ok(fight.commandWait());
    w.run(30, () => fight.awaitsPlayer());
    assert.equal(fight.unactedCount(), 1);
    assert.ok(fight.commandSelectUnit(mira(w).id));
    assert.equal(fight.unactedCount(), 0, 'the last unit: End Turn is its Wait');
    assert.equal(fight.canRetreat(), false, 'a battle started without Can Escape is not left');
    assert.equal(fight.commandRetreat(), false);
    assert.ok(fight.isActive() && !fight._ending);

    w = world({ events: [unit(1, 15, 8, 'enemy 1')] });
    fight = begin(w, { canEscape: true });
    const serial = fight.serial();
    assert.equal(fight.canRetreat(), true);
    assert.ok(fight.commandRetreat());
    assert.equal(fight._ending.result, w.ReactorFight.ESCAPE, 'through the battle\'s own end');
    w.run(120, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.equal(fight.resultOf(serial), w.ReactorFight.ESCAPE);
    assert.ok(w.messages.some(text => /escape/.test(text)), 'with the game\'s own escape line');
    const init = world({ events: [unit(1, 15, 8, 'enemy 1')] });
    assert.equal(begin(init, { turns: 'initiative' }).unactedCount(), 0, 'under initiative there is no side\'s turn to end');
});

test('the goal line counts what is left, the goal in full stays for the menu, and a goal that changes is announced once', () => {
    let w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 15, 8, 'enemy 2')] });
    let fight = begin(w);
    const F = w.ReactorFight;
    assert.equal(fight.objectiveText(), 'Enemies left: 2');
    assert.equal(fight.goalText(), 'Defeat all enemies');
    assert.equal(fight.notice(), '', 'nothing is announced as a battle begins');
    const before = fight.tacticalRevision();
    fight.battler(foe(w, 1)).setHp(0);
    fight.defeat(foe(w, 1));
    assert.equal(fight.objectiveText(), 'Enemies left: 1');
    assert.ok(fight.tacticalRevision() > before, 'and the HUD is told');
    // A new goal: said on the banner for a while, then gone.
    fight.setObjective({ type: 'defeatUnit', eventId: 2 });
    assert.equal(fight.goalText(), 'Defeat Bat');
    assert.equal(fight.objectiveText(), 'Defeat Bat');
    assert.equal(fight.notice(), 'New goal: Defeat Bat');
    w.run(F.NOTICE_FRAMES - 1);
    assert.equal(fight.notice(), 'New goal: Defeat Bat');
    const shown = fight.tacticalRevision();
    w.run(1);
    assert.equal(fight.notice(), '');
    assert.ok(fight.tacticalRevision() > shown, 'the HUD is told when it ends');
    fight.setObjective({ type: 'defeatUnit', eventId: 2 });
    assert.equal(fight.notice(), '', 'the same goal set again is no news');
    w.$dataSystem.reactorBattle = { terms: { goalChanged: 'Now: %1', goalEnemiesLeft: '%1 to go' } };
    fight.setObjective({ type: 'defeatAll' });
    assert.equal(fight.notice(), 'Now: Defeat all enemies', 'in the project\'s own words');
    assert.equal(fight.objectiveText(), '1 to go');

    // Holding out: the turns left, the one being played included.
    w = world({ events: [unit(1, 17, 12, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    fight = begin(w, { objective: { type: 'survive', turns: 3 } });
    assert.equal(fight.goalText(), 'Survive 3 turns');
    assert.equal(fight.objectiveText(), 'Survive: 3 turns left');
    for (const left of ['Survive: 2 turns left', 'Survive: last turn']) {
        const turn = fight.turn();
        assert.ok(fight.commandEndTurn());
        w.run(600, () => fight.awaitsPlayer() && fight.turn() > turn);
        assert.equal(fight.objectiveText(), left);
    }
});

test('the key names in force: the best known key of an action, a letter before Page Up, the pad\'s buttons for a pad', () => {
    const w = mapped(world()), C = w.ReactorFight.Controls;
    assert.equal(C.label('ok'), 'Enter', 'Enter before Z');
    assert.equal(C.label('cancel'), 'Esc', 'a key that says "escape" cancels');
    assert.equal(C.label('pageup'), 'Q', 'a letter before Page Up');
    assert.equal(C.label('shift'), 'Shift');
    assert.equal(C.label('jump'), '', 'an action with no key has no name');
    delete w.Input.keyMapper[81];
    assert.equal(C.label('pageup'), 'PgUp');
    assert.equal(C.label('ok', 'pad'), 'A');
    assert.equal(C.label('cancel', 'pad'), 'B');
    assert.equal(C.label('pageup', 'pad'), 'LB');
    assert.deepEqual([C.keyName(49), C.keyName(113), C.keyName(100), C.keyName(222)], ['1', 'F2', 'Num 4', '']);
    // The battle's own actions are read from the bindings in force: the ordinary action each stands on until the battle's own keys are.
    assert.equal(C.name('viewRight'), 'W');
    assert.equal(C.name('viewLeft'), 'PgUp', 'Q was taken away above');
    assert.equal(C.name('skip'), 'Shift');
    assert.equal(C.name('unit'), 'Tab');
    w.ReactorControls = { isTactical: () => true };
    w.Input.keyMapper = { 69: 'viewRight', 70: 'skip' };
    assert.equal(C.name('viewRight'), 'E');
    assert.equal(C.name('skip'), 'F');
});

test('the hint line teaches one thing at a time with the keys in force, a few times each, then gives way; the player or the project turns it off', () => {
    let w = mapped(world({ events: [unit(1, 17, 12, 'enemy 1')] }));
    const F = w.ReactorFight;
    let fight = begin(w);
    assert.equal(fight.hintText(), 'Choose a unit: Enter or click');
    const revision = fight.tacticalRevision();
    w.run(F.Hints.FRAMES);
    assert.equal(fight.hintText(), 'Shift: next unit', 'a player who lingers is shown the next');
    assert.ok(fight.tacticalRevision() > revision, 'and the HUD is told');
    w.run(F.Hints.FRAMES);
    assert.equal(fight.hintText(), 'Esc or right-click: battle menu');
    // A gamepad in the hand: its buttons, and no mouse.
    F.Controls.used('pad');
    assert.equal(fight.hintText(), 'B: battle menu');
    F.Controls.used('keys');
    // Another stage, another tip.
    assert.ok(fight.commandSelectUnit(hero(w).id));
    w.run(1);
    assert.equal(fight.hintText(), 'Where to move: Enter or click');
    w.run(F.Hints.FRAMES);
    assert.equal(fight.hintText(), 'Enter on its own tile: stay');
    assert.ok(fight.commandMoveTo(3, 3));
    w.run(200, () => fight.tacticalState() === 'command');
    w.run(1);
    assert.equal(fight.hintText(), 'Left Right: turn the unit');
    w.run(F.Hints.FRAMES);
    assert.equal(fight.hintText(), 'Esc or right-click: undo the move');
    assert.ok(fight.commandWait());
    w.run(30, () => fight.awaitsPlayer());
    assert.ok(fight.commandEndTurn());
    w.run(600, () => fight.tacticalState() === 'enemy');
    assert.equal(fight.hintText(), 'Hold Shift to hurry', 'while the other side moves');
    // Counted with the save, a tip once each time it has been read: each tip its few times, then none.
    const seen = w.$gameSystem._rrBattle.hints;
    assert.equal(seen['tipPick@unit'], 1, 'read once so far: the second pick passed at once');
    assert.equal(seen['tipMenu@unit'], undefined, 'a tip the player moved on from at once was not read');
    w.run(600, () => fight.awaitsPlayer());
    for (let i = 0; i < 12; i++) w.run(F.Hints.FRAMES);
    assert.equal(fight.hintText(), '', 'every tip of the stage has had its times: the plain stage line stands');
    assert.equal(seen['tipPick@unit'], F.Hints.TIMES);
    assert.equal(seen['tipNext@unit'], F.Hints.TIMES);
    assert.equal(seen['tipMenu@unit'], F.Hints.TIMES);

    // Off for the player, and off for a project.
    w = mapped(world({ events: [unit(1, 15, 8, 'enemy 1')] }));
    w.ConfigManager.rrFightHints = false;
    assert.equal(begin(w).hintText(), '');
    w = mapped(world({ events: [unit(1, 15, 8, 'enemy 1')], system: { reactorBattle: { hints: false } } }));
    assert.equal(begin(w).hintText(), '');
    // A project's own words.
    w = mapped(world({ events: [unit(1, 15, 8, 'enemy 1')], system: { reactorBattle: { terms: { tipPick: 'Pick someone (%1)', orClick: '%1 / click' } } } }));
    assert.equal(begin(w).hintText(), 'Pick someone (Enter / click)');
    // Every tip fits the hint line of a 640 pixel screen (about 34 letters) with the stock keys, mouse or pad.
    w = mapped(world());
    for (const device of ['keys', 'pad']) {
        w.ReactorFight.Controls.used(device);
        for (const tip of w.ReactorFight.Hints.LIST) {
            const text = w.ReactorFight.Hints.textOf(tip);
            assert.ok(text.length <= 34, `${device}: "${text}" is ${text.length} letters`);
            assert.ok(!/%\d/.test(text), `${device}: "${text}" has a name for every control`);
        }
    }
    // No keys to name (a mapping that gives none): no tip is shown half written; one that names no key is shown as it is.
    w = world({ events: [unit(1, 15, 8, 'enemy 1')] });
    const bare = begin(w);
    assert.equal(bare.hintText(), 'Battle menu: Auto plays the turn');
    for (const tip of w.ReactorFight.Hints.LIST) if (tip.keys.length) assert.equal(w.ReactorFight.Hints.textOf(tip), '', tip.key);
});

test('whose units move by themselves: the other side, or the player\'s own under Auto', () => {
    const w = world({ system: { partyMembers: [1, 2, 3] }, events: [unit(1, 12, 6, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 9000;
    const fight = begin(w);
    assert.ok(fight.commandAuto());
    const teams = new Set();
    let turn2 = false;
    for (let i = 0; i < 4000 && !turn2; i++) {
        w.run(1);
        if (fight.tacticalState() === 'enemy') teams.add(fight.currentTeam() + ':' + fight.actingTeam());
        turn2 = fight.tacticalState() === 'unit' && fight.turn() === 2;
    }
    assert.deepEqual(Array.from(teams).sort(), ['ally:ally', 'enemy:enemy']);
});

test('Attack with nobody in reach says why, and a click on the turn strip looks at the unit without clicking the map under it', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 500;
    const fight = begin(w), me = hero(w);
    assert.equal(fight.commandReason('attack'), '', 'asked outside a unit\'s menu: nothing');
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(2, 2));
    assert.equal(fight.tacticalState(), 'command');
    assert.equal(fight.commandReason('attack'), 'whyNoReach');
    assert.equal(w.ReactorFight.term('whyNoReach'), 'Nobody in reach');
    assert.equal(fight.commandReason('wait'), '');
    // The words on the hint line are the battle's: a project's own term is what the HUD writes there.
    const Hud = require('../../runtime/reactor_ui_fight.js');
    const hintLine = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'hint' }), grayed = { kind: 'command', symbol: 'attack', enabled: false };
    assert.equal(Hud.infoText(hintLine, fight, grayed), 'Nobody in reach');
    const stock = w.$dataSystem.reactorBattle;
    w.$dataSystem.reactorBattle = { terms: { whyNoReach: 'Too far to strike' } };
    assert.equal(fight.term('whyNoReach'), 'Too far to strike');
    assert.equal(Hud.infoText(hintLine, fight, grayed), 'Too far to strike');
    w.$dataSystem.reactorBattle = stock;
    assert.ok(fight.commandCancel());
    assert.ok(fight.commandMoveTo(5, 2));
    w.run(200, () => fight.tacticalState() === 'command');
    assert.equal(fight.commandReason('attack'), '', 'beside the enemy the blow has someone to land on');
    assert.ok(fight.commandWait());
    w.run(30, () => fight.awaitsPlayer());
    assert.equal(fight.tacticalState(), 'unit');
    // The strip: the HUD says which unit a point of the screen is; the battle looks at it and the map is not clicked.
    const enemy = foe(w, 1), [ex, ey] = at(w, enemy);
    // The tile clicked lies over the cell one of the player's own units stands on: a click that reached the map would pick it.
    const [mx, my] = at(w, mira(w));
    const sx = mx * 48 + 10, sy = my * 48 + 10;
    let asked = null, strip = true, used = 0;
    w.ReactorUI = { fightStripUnit: (x, y) => { asked = [x, y]; return strip && x === sx ? enemy.id : 0; } };
    w.$gameMap.canvasToMapX = x => Math.floor(x / 48); w.$gameMap.canvasToMapY = y => Math.floor(y / 48);
    const inputUsed = w.ReactorFight.Input.used;
    w.ReactorFight.Input.used = function() { used++; return inputUsed.apply(this, arguments); };
    w.TouchInput.x = sx; w.TouchInput.y = sy;
    w.TouchInput.isTriggered = () => true;
    w.Graphics.frameCount++; w.run(1);
    assert.deepEqual(asked, [sx, sy]);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [ex, ey], 'the cursor went to the unit of the tile');
    assert.deepEqual([fight._tac.focus.x, fight._tac.focus.y], [ex, ey], 'and the view with it');
    assert.equal(fight.tacticalState(), 'unit', 'nothing on the map was picked');
    assert.equal(fight.activeUnit(), null, 'the unit under the tile was not picked');
    assert.equal(used, 1, 'the press is the strip\'s: the map\'s keys and pointer are told it was used');
    w.ReactorFight.Input.used = inputUsed;
    // A press that is not on the strip is the map's as before.
    strip = false;
    w.TouchInput.x = mx * 48 + 12; w.TouchInput.y = my * 48 + 12;
    w.TouchInput.isTriggered = () => false;
    w.Graphics.frameCount++; w.run(1);
    w.TouchInput.isTriggered = () => true;
    w.Graphics.frameCount++; w.run(1);
    w.TouchInput.isTriggered = () => false;
    assert.equal(fight.activeUnit(), mira(w));
    assert.equal(fight.commandLookAt(9999), false);
});

/** A world with stand-in windows and a map scene, so the stock windows and the battle menu run as in the game. */
function windowed(options = {}) {
    const w = fightWorld(Object.assign({ tactical: false }, options));
    vm.runInContext(`
        Rectangle = function(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; };
        Window_Command = function() { this.initialize(...arguments); };
        Object.assign(Window_Command.prototype, {
            initialize(rect) { this._list = []; this._handlers = {}; this._index = -1; this.active = false; this.openness = 255; this.visible = true; this.padding = 12; this.innerWidth = 300; this.innerHeight = 300; this.move(rect.x, rect.y, rect.width, rect.height); this.refresh(); },
            clearCommandList() { this._list = []; }, makeCommandList() {},
            addCommand(name, symbol, enabled = true, ext = null) { this._list.push({ name, symbol, enabled, ext }); },
            maxItems() { return this._list.length; }, itemHeight() { return 44; }, lineHeight() { return 36; },
            refresh() { this.clearCommandList(); this.makeCommandList(); },
            select(index) { this._index = index; }, index() { return this._index; }, row() { return this._index; },
            currentData() { return this._list[this._index] || null; },
            currentSymbol() { const data = this.currentData(); return data ? data.symbol : null; },
            currentExt() { const data = this.currentData(); return data ? data.ext : null; },
            findSymbol(symbol) { return this._list.findIndex(entry => entry.symbol === symbol); },
            commandSymbol(index) { return this._list[index].symbol; }, commandName(index) { return this._list[index].name; },
            isCommandEnabled(index) { return this._list[index].enabled; },
            setHandler(symbol, method) { this._handlers[symbol] = method; },
            activate() { this.active = true; }, deactivate() { this.active = false; },
            open() { this.openness = 255; }, close() { this.openness = 0; }, show() { this.visible = true; }, hide() { this.visible = false; },
            move(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; },
            createContents() {}, itemRect() { return { x: 0, y: 0, width: 0, height: 0 }; }, overallHeight() { return this.maxItems() * this.itemHeight(); }, drawAllItems() {},
            setActor() {}, item() { return null; },
            // What the real window does on OK and on Cancel.
            isCancelTriggered() { return Input.isRepeated("cancel"); },
            ok() { const data = this.currentData(); if (!this.active || !data || !data.enabled) return false; this.deactivate(); this._handlers[data.symbol](); return true; },
            cancel() { if (!this.active) return false; this.deactivate(); this._handlers.cancel(); return true; }
        });
        Window_SkillList = function() { this.initialize(...arguments); };
        Window_SkillList.prototype = Object.create(Window_Command.prototype);
        Window_ItemList = function() { this.initialize(...arguments); };
        Window_ItemList.prototype = Object.create(Window_Command.prototype);
        Scene_Map = function() { this.windows = []; this.menuCalls = 0; this.menuCalling = false; };
        Object.assign(Scene_Map.prototype, {
            update() {}, terminate() {}, start() {}, isFastForward() { return false; }, callMenu() { this.menuCalls++; },
            isMenuCalled() { return Input.isTriggered("menu"); }, addWindow(window) { this.windows.push(window); }, calcWindowHeight(rows) { return rows * 44 + 24; }
        });
        Scene_GameEnd = function Scene_GameEnd() {};
        Scene_Options = function Scene_Options() {};
    `, w);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../runtime/reactor_fight_tactical.js'), 'utf8'), w, { filename: 'reactor_fight_tactical.js' });
    // The battle menu is its own file, loaded after the driver it stands on.
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../runtime/reactor_fight_menu.js'), 'utf8'), w, { filename: 'reactor_fight_menu.js' });
    w.ConfigManager.save = () => {};
    w.scene = new w.Scene_Map();
    w.SceneManager._scene = w.scene;
    let held = '';
    w.Input.isTriggered = name => name === held;
    /** One frame of the map scene with a key pressed in it (or none): the windows first (`windows`), then the map and the battle, then the scene's own keys. */
    w.frame = (key, windows) => {
        held = key || '';
        w.Graphics.frameCount++;
        if (windows) windows();
        w.run(1);
        if (w.scene.isMenuCalled() && !w.ReactorFight.menuBlocked()) w.scene.callMenu();
        w.scene.update();
        held = '';
    };
    w.menu = () => w.scene._fightMenuWindow;
    w.rows = () => Array.from(w.menu()._list, entry => entry.symbol);
    w.choose = symbol => { const win = w.menu(); win.select(win.findSymbol(symbol)); assert.ok(win.ok(), symbol); };
    return w;
}

test('Cancel with nothing to step back from opens the battle menu, never the game\'s; the battle waits behind it; End Turn asks before units lose their turn', () => {
    const w = windowed({ events: [unit(1, 15, 8, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight, W = F.Windows, fight = begin(w);
    assert.equal(W.isMenuOpen(), false);
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), true, 'Cancel at "Choose a unit"');
    assert.equal(w.scene.menuCalls, 0, 'the game\'s pause menu did not open');
    assert.deepEqual(w.rows(), ['resume', 'endTurn', 'auto', 'units', 'threat', 'goal', 'controls', 'options', 'gameEnd'], 'no Retreat in a battle that cannot be left');
    assert.equal(w.menu().index(), 0);
    // The battle waits: no frame of it passes, no key reaches the map.
    const tick = F.AI.tick;
    w.frame('ok'); w.frame();
    assert.equal(F.AI.tick, tick);
    assert.equal(fight.tacticalState(), 'unit');
    // End Turn: asked, with the count; the cursor starts on the answer that changes nothing.
    w.choose('endTurn');
    assert.deepEqual(Array.from(w.menu()._head), ['2 units have not acted.', 'End the turn?']);
    assert.deepEqual(w.rows(), ['back', 'confirm']);
    assert.equal(w.menu().index(), 0);
    assert.ok(w.menu().ok());
    assert.equal(W.isMenuOpen(), true, '"Keep playing" goes back to the menu');
    assert.equal(w.menu().currentSymbol(), 'endTurn');
    assert.equal(fight.unactedCount(), 2, 'and nobody lost a turn');
    w.frame('cancel', () => assert.ok(w.menu().cancel()));
    assert.equal(W.isMenuOpen(), false, 'Cancel on the menu shuts it, and the same press does not open it again');
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), true);
    w.choose('endTurn'); w.choose('confirm');
    assert.equal(W.isMenuOpen(), false);
    assert.notEqual(fight.tacticalState(), 'unit', 'the turn ended');
    // The other side's phase: Cancel and the menu key do nothing, and the game's menu stays shut.
    w.frame('cancel'); w.frame('menu');
    w.scene.callMenu();
    assert.equal(W.isMenuOpen(), false);
    assert.equal(w.scene.menuCalls, 0);
    for (let i = 0; i < 600 && !(fight.awaitsPlayer() && fight.turn() === 2); i++) w.frame();
    assert.equal(fight.turn(), 2);

    // From a unit's own menu: asked for the others; with nobody else left it is the unit's Wait and asks nothing.
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(2, 2));
    w.frame();
    const command = w.scene._fightCommandWindow;
    assert.ok(command && command.active);
    assert.equal(command._list.find(entry => entry.symbol === 'attack').enabled, false, 'Attack is grayed with nobody in reach');
    command.select(command.findSymbol('endTurn'));
    assert.ok(command.ok());
    assert.equal(W.isMenuOpen(), true);
    assert.deepEqual(Array.from(w.menu()._head), ['1 unit has not acted.', 'End the turn?']);
    w.frame();
    assert.equal(command.active, false, 'the unit\'s menu waits behind the question');
    assert.ok(w.menu().cancel());
    assert.equal(W.isMenuOpen(), false);
    w.frame(); w.frame();
    assert.ok(command.active, 'and is back when the question is answered no');
    assert.equal(command.currentSymbol(), 'endTurn');
    assert.equal(fight.tacticalState(), 'command');
    assert.ok(fight.commandWait());
    for (let i = 0; i < 30 && !fight.awaitsPlayer(); i++) w.frame();
    assert.ok(fight.commandSelectUnit(fight.pendingUnits()[0].id));
    assert.ok(fight.commandMoveTo(fight.cursor().x, fight.cursor().y));
    w.frame();
    command.select(command.findSymbol('endTurn'));
    assert.ok(command.ok());
    assert.equal(W.isMenuOpen(), false, 'the last unit: nothing to ask');
    assert.notEqual(fight.tacticalState(), 'command');
});

test('the battle menu\'s pages: units to look at, the goal, the controls with the keys in force, the options, Retreat with its question, the game\'s Game End', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight, W = F.Windows, fight = begin(w, { canEscape: true });
    w.scene.callMenu();
    assert.equal(W.isMenuOpen(), true, 'a camera that calls the menu itself gets the battle menu');
    assert.deepEqual(w.rows(), ['resume', 'endTurn', 'auto', 'units', 'threat', 'goal', 'controls', 'options', 'retreat', 'gameEnd']);
    // Units: every unit standing, the player's first; OK looks at one.
    w.choose('units');
    assert.deepEqual(Array.from(w.menu()._list, entry => entry.name), ['Ren', 'Mira', 'Slime']);
    assert.match(w.menu()._list[2].ext.right, /HP 60\/60/);
    w.menu().select(2);
    assert.ok(w.menu().ok());
    assert.equal(W.isMenuOpen(), false);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], [15, 8], 'the cursor and the view went to the unit chosen');
    assert.deepEqual([fight._tac.focus.x, fight._tac.focus.y], [15, 8]);
    w.frame();
    assert.equal(fight.tacticalState(), 'unit', 'the press that chose it did not pick anything on the map');
    // Goal.
    w.frame('cancel');
    w.choose('goal');
    assert.deepEqual(Array.from(w.menu()._list, entry => entry.name), ['Defeat all enemies', 'Enemies left: 1', 'Turn 1', 'You lose if your party falls']);
    assert.ok(w.menu().ok());
    assert.equal(w.menu()._page, 'main');
    assert.equal(w.menu().currentSymbol(), 'goal', 'back on the row it came from');
    // Controls: this project's keys.
    w.choose('controls');
    const controls = Object.fromEntries(Array.from(w.menu()._list, entry => [entry.name, entry.ext.right]));
    assert.equal(controls['Choose, confirm'], 'Enter / Click');
    assert.equal(controls['Back, battle menu'], 'Esc / Right-click');
    assert.equal(controls['Next unit or target'], 'Shift');
    assert.equal(Array.from(W.controlRows()).filter(row => row.keys === 'Shift').length, 1, 'the key means one thing: no second row gives it another');
    assert.equal(controls['Hurry the other side'], 'Shift (hold)');
    assert.equal(controls['Turn the unit'], 'Left / Right');
    assert.equal(controls['Back to the unit'], 'Tab');
    assert.equal(controls['Turn the view'], undefined, 'the view\'s keys only where the battle has its own view');
    F.Controls.used('pad');
    assert.equal(Object.fromEntries(Array.from(W.controlRows(), row => [row.name, row.keys]))['Choose, confirm'], 'A');
    F.Controls.used('keys');
    assert.ok(w.menu().cancel());
    // Options: the pace and the hints, changed by OK or Left and Right, kept with the game's options.
    w.choose('options');
    assert.deepEqual(w.rows(), ['pace', 'hints', 'gameOptions', 'back']);
    assert.equal(w.menu()._list[0].ext.right, 'Normal');
    w.menu().select(0);
    assert.ok(w.menu().ok());
    assert.equal(F.pace(), 'fast');
    assert.equal(w.menu()._list[0].ext.right, 'Fast');
    assert.ok(w.menu().active, 'the page stays up');
    w.menu().cursorRight();
    assert.equal(F.pace(), 'skip');
    assert.equal(w.menu()._list[0].ext.right, 'Skip to my turn');
    w.menu().cursorLeft(); w.menu().cursorLeft();
    assert.equal(F.pace(), 'normal');
    w.menu().select(1);
    assert.equal(w.menu()._list[1].ext.right, 'On');
    w.menu().cursorRight();
    assert.equal(F.Hints.enabled(), false);
    assert.equal(w.menu()._list[1].ext.right, 'Off');
    assert.equal(w.ConfigManager.makeData().rrFightHints, false);
    w.choose('gameOptions');
    assert.deepEqual(Array.from(w.pushed), ['Scene_Options']);
    assert.equal(W.isMenuOpen(), false);
    assert.equal(w.menu().visible, false, 'off the screen at once: the next scene\'s backdrop is a picture of this one');
    // Game End is the game's own.
    w.frame('cancel');
    assert.equal(w.menu().visible, true);
    w.choose('gameEnd');
    assert.deepEqual(Array.from(w.pushed), ['Scene_Options', 'Scene_GameEnd']);
    assert.equal(w.menu().visible, false);
    // Retreat: asked, the cursor on staying.
    w.frame('cancel');
    w.choose('retreat');
    assert.deepEqual(Array.from(w.menu()._head), ['Leave the battle?']);
    assert.equal(w.menu().currentSymbol(), 'back');
    w.choose('back');
    assert.ok(fight.isActive() && !fight._ending);
    w.choose('retreat'); w.choose('confirm');
    assert.equal(fight._ending.result, F.ESCAPE);
    assert.equal(W.isMenuOpen(), false);
    for (let i = 0; i < 120 && fight.isActive(); i++) w.frame();
    assert.equal(fight.isActive(), false);
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), false, 'no battle, no battle menu');

    // Initiative turns: a unit's move has nothing to step back to, so Cancel there is the menu; it has no side's turn to end.
    const v = windowed({ events: [unit(1, 15, 8, 'enemy 1')] });
    const duel = begin(v, { turns: 'initiative' });
    assert.equal(duel.tacticalState(), 'move');
    v.frame('cancel');
    assert.equal(v.ReactorFight.Windows.isMenuOpen(), true);
    assert.deepEqual(v.rows(), ['resume', 'units', 'threat', 'goal', 'controls', 'options', 'gameEnd']);
    v.frame('cancel', () => assert.ok(v.menu().cancel()));
    assert.equal(duel.tacticalState(), 'move', 'and shutting it leaves the unit where it was');
});

test('the battle menu fits the screen: every row of the menu on a 480 pixel screen, a margin kept where it costs no row, a long list scrolling inside the screen', () => {
    const w = windowed({ events: [unit(1, 15, 8, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    const W = w.ReactorFight.Windows;
    begin(w, { canEscape: true });
    const row = 44, frame = 24;
    const shown = () => (w.menu().height - frame - w.menu().headHeight()) / row;
    // A 640x480 game: the box the windows live in is 8 pixels smaller each way.
    w.Graphics.boxWidth = 632; w.Graphics.boxHeight = 472;
    w.frame('cancel');
    assert.equal(w.rows().length, 10, 'the menu at its longest: End Turn, Auto and Retreat all apply');
    assert.equal(shown(), 10, 'all ten rows are on the screen: Game End is not under a scroll arrow');
    assert.ok(w.menu().y >= 0 && w.menu().y + w.menu().height <= 472, 'inside the screen');
    assert.ok(w.menu().x >= 8 && w.menu().x + w.menu().width <= 632 - 8);
    // A page with few rows keeps its margin and is as tall as its rows.
    w.choose('options');
    assert.equal(shown(), 4);
    assert.ok(w.menu().y >= 8);
    assert.ok(w.menu().cancel());
    // A list longer than the screen takes what the screen has and scrolls.
    w.menu().makeCommandList = function() { this._head = ['Units']; for (let i = 0; i < 30; i++) this.addCommand('Unit ' + i, 'back'); };
    W.fitMenu(w.scene, w.menu());
    assert.equal(w.menu().maxItems(), 30);
    assert.equal(shown(), 9, 'nine rows under the page\'s title');
    assert.ok(w.menu().y >= 0 && w.menu().y + w.menu().height <= 472);
    delete w.menu().makeCommandList;
    // A screen with room to spare: the same menu with its margin.
    w.Graphics.boxWidth = 808; w.Graphics.boxHeight = 616;
    W.fitMenu(w.scene, w.menu());
    assert.equal(shown(), 10);
    assert.ok(w.menu().y >= 8 && w.menu().y + w.menu().height <= 616 - 8);
});

test('a unit that joins while the other side acts is shown first: the next unit\'s turn waits for the view, then rests on its unit before it does anything', () => {
    const setup = () => {
        const w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 6, 4, 'enemy 1')] });
        w.$dataEnemies[1].params[0] = 9000;
        w.$dataSkills[1].note = '<range: 1-3>';
        w.$dataSkills[1].damage.formula = '5';
        return w;
    };
    /** The phase with something done to the view as the second enemy's turn begins (`turn`), as it is looked at (`look`) or as it is about to strike (`ready`). */
    const phase = (w, hooks) => {
        const F = w.ReactorFight, fight = begin(w), second = foe(w, 2);
        const seen = { F, second, from: -1, actAt: -1, lookAt: -1, readyAt: -1, aimAt: -1, farthest: 0, focusAtAct: null, displayAtAct: NaN, joined: null, shownEarly: 0 };
        let now = 0;
        w.ReactorEvents.on('fightUnitTurn', p => { if (p.unitId === second.id) { seen.from = now; if (hooks.turn) seen.joined = hooks.turn(fight, F); } });
        watchPhase(w, fight, frame => {
            now = frame;
            const act = fight._act;
            if (!act || act.unitId !== second.id) return;
            if (seen.from >= 0 && seen.actAt < 0) {
                if (act.stage === 'plan' || act.stage === 'look') seen.farthest = Math.max(seen.farthest, w.$gameMap._displayX);
                else { seen.actAt = frame; seen.focusAtAct = [fight._tac.focus.x, fight._tac.focus.y]; seen.displayAtAct = w.$gameMap._displayX; }
                // While the view is still with whoever joined, the unit is not shown as the one acting.
                if (frame - seen.from < F.View.VISIT_FRAMES - 2 && fight.activeUnit()) seen.shownEarly++;
            }
            if (act.stage === 'look' && seen.lookAt < 0) { seen.lookAt = frame; if (hooks.look) hooks.look(fight, F); }
            if (act.stage === 'ready' && seen.readyAt < 0) { seen.readyAt = frame; if (hooks.ready) hooks.ready(fight, F); }
            if ((act.stage === 'aim' || act.stage === 'perform') && seen.aimAt < 0) seen.aimAt = frame;
        });
        return seen;
    };
    // Reinforcements at the far corner as the second enemy's turn begins.
    let w = setup();
    let seen = phase(w, { turn: fight => fight.spawn({ record: 'enemy', id: 1, x: 18, y: 13 }) });
    const F = seen.F;
    assert.ok(seen.joined, 'someone joined');
    assert.ok(seen.farthest > 2, `the view went to whoever joined (${seen.farthest.toFixed(2)})`);
    assert.ok(seen.actAt - seen.from >= F.View.VISIT_FRAMES + F.BEAT_LOOK, `the unit did nothing until the view was back and had rested on it (${seen.actAt - seen.from} frames)`);
    assert.equal(seen.shownEarly, 0, 'and was not shown as acting over a picture of the newcomers');
    assert.ok(seen.lookAt - seen.from >= F.View.VISIT_FRAMES, `its look began when the view was free (${seen.lookAt - seen.from} frames)`);
    assert.ok(seen.displayAtAct < 0.5, `the view was back on it when it began (${seen.displayAtAct.toFixed(2)})`);
    assert.ok(seen.aimAt > seen.actAt, 'then its turn played');
    // The same phase with nobody joining: no wait.
    w = setup();
    const plain = phase(w, {});
    assert.ok(plain.actAt - plain.from < F.BEAT_LOOK + 12, `with the view at home the turn begins after its look (${plain.actAt - plain.from} frames)`);
    // A view that never comes back is taken back: the battle never waits on it for good.
    w = setup();
    seen = phase(w, { turn: (fight, F) => { F.View.visit(fight, 18, 13, NaN, 100000); return true; } });
    assert.ok(seen.actAt - seen.from >= F.BEAT_AWAY, 'it waited as long as it may');
    assert.ok(seen.actAt - seen.from <= F.BEAT_AWAY + F.BEAT_LOOK + 12, `and no longer (${seen.actAt - seen.from} frames)`);
    assert.ok(seen.displayAtAct < 0.5, 'with the view back on the unit');
    // The view called away while the unit is looked at: the look starts over when the view is back.
    w = setup();
    seen = phase(w, { look: (fight, F) => F.View.visit(fight, 18, 13, NaN, 50) });
    assert.ok(seen.actAt - seen.lookAt >= 50 + F.BEAT_LOOK, `the look waited for the view and was counted anew (${seen.actAt - seen.lookAt} frames)`);
    assert.ok(seen.displayAtAct < 0.5, 'with the view back on the unit');
    // The view called away as the unit is about to strike: the blow waits for it too.
    w = setup();
    seen = phase(w, { ready: (fight, F) => F.View.visit(fight, 18, 13, NaN, 50) });
    assert.ok(seen.aimAt - seen.readyAt >= 50 + F.BEAT_AIM, `the blow waited for the view and its beat (${seen.aimAt - seen.readyAt} frames)`);
    // A battle that plays itself on a map with no opening, a unit spawned as it starts: nothing has been looked at
    // yet, so the view starts from the first unit; whoever joined has its time, and the battle does not wait out
    // a view that was never sent anywhere.
    w = setup();
    w.ReactorFight.autoBattle = true;
    const auto = w.$gameFight;
    assert.ok(auto.start({ mode: 'tactical' }) > 0);
    assert.ok(auto.spawn({ record: 'enemy', id: 1, x: 18, y: 13 }));
    let first = -1, frame = 0;
    for (const name of ['fightMoveStart', 'fightAim']) w.ReactorEvents.on(name, () => { if (first < 0) first = frame; });
    for (frame = 1; frame <= 400 && first < 0; frame++) w.run(1);
    assert.ok(first >= F.View.VISIT_FRAMES, `the first unit waited while the newcomer was shown (${first} frames)`);
    assert.ok(first < F.BEAT_AWAY, `and no longer than that (${first} frames)`);
});

test('the normal pace: the view stays on the unit whose turn is watched while others walk aside', () => {
    // Two that only close in from far away, then one that strikes from where the party is.
    const w = world({ events: [unit(1, 17, 10, 'enemy 1'), unit(2, 17, 12, 'enemy 1'), unit(3, 5, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataSkills[1].note = '<range: 1-3>';
    w.$dataSkills[1].damage.formula = '5';
    const fight = begin(w), striker = foe(w, 3);
    let both = 0, stolen = 0;
    const { feed } = watchPhase(w, fight, () => {
        const tac = fight._tac, act = fight._act;
        if (!act || act.unitId !== striker.id || !(tac.aside || []).length) return;
        if (act.stage !== 'look' && act.stage !== 'ready' && act.stage !== 'rest') return;
        both++;
        const own = fight.character(striker);
        if (Math.abs(tac.focus.x - own.x) > 0.01 || Math.abs(tac.focus.y - own.y) > 0.01) stolen++;
    });
    assert.ok(feed.some(e => e.name === 'fightAim' && e.id === striker.id), 'the striker struck');
    assert.ok(both > 10, `its turn was watched while the others still walked (${both} frames)`);
    assert.equal(stolen, 0, 'and the view never left it for them');
});

test('the next-unit key on a move puts the unit down and goes to the next: no key ends a unit\'s turn by accident', () => {
    const w = mapped(windowed({ system: { partyMembers: [1, 2, 3] }, events: [unit(1, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight, fight = begin(w);
    const party = [1, 2, 3].map(id => fight._units.find(u => u.actorId === id));
    const cursorOn = u => { const c = fight.character(u), cursor = fight.cursor(); return !!cursor && cursor.x === c.x && cursor.y === c.y; };
    assert.equal(fight.commandNextUnit(), false, 'at "Choose a unit" there is nobody to put down');
    // Each unit picked in turn, the key pressed on its move: back to "Choose a unit" with the cursor on the next, round the whole side.
    for (let i = 0; i < 3; i++) {
        assert.ok(fight.commandSelectUnit(party[i].id));
        assert.equal(fight.tacticalState(), 'move');
        w.frame('shift');
        assert.equal(fight.tacticalState(), 'unit', 'the unit was put down');
        assert.ok(cursorOn(party[(i + 1) % 3]), `the cursor went to the next unit (${i})`);
        assert.equal(fight.unactedCount(), 3, 'and nobody\'s turn was spent');
        assert.deepEqual(party.map(u => !!fight._tac.acted[u.id]), [false, false, false]);
    }
    // The last one left: the key comes back to it.
    assert.ok(fight.commandSelectUnit(party[0].id)); assert.ok(fight.commandWait());
    for (let i = 0; i < 30 && !fight.awaitsPlayer(); i++) w.frame();
    assert.ok(fight.commandSelectUnit(party[1].id)); assert.ok(fight.commandWait());
    for (let i = 0; i < 30 && !fight.awaitsPlayer(); i++) w.frame();
    assert.ok(fight.commandSelectUnit(party[2].id));
    w.frame('shift');
    assert.equal(fight.tacticalState(), 'unit');
    assert.ok(cursorOn(party[2]));
    assert.equal(!!fight._tac.acted[party[2].id], false);
    // The hint line says so on a move, and that Wait is what ends a turn.
    assert.ok(F.Hints.LIST.some(tip => tip.key === 'tipNext' && tip.state === 'move'));
    assert.ok(F.Hints.LIST.some(tip => tip.key === 'tipWait' && tip.state === 'command'));
    assert.equal(F.Hints.textOf(F.Hints.LIST.find(tip => tip.key === 'tipWait')), 'Wait ends this unit\'s turn');
    assert.equal(F.TERMS.ctlWait, undefined, 'no control is listed as ending a unit\'s turn');

    // Initiative turns: there is no other unit to go to, and the key spends nothing.
    const v = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    const duel = begin(v, { turns: 'initiative' });
    const mine = duel.activeUnit();
    assert.equal(duel.tacticalState(), 'move');
    v.frame('shift'); v.frame();
    assert.equal(duel.tacticalState(), 'move', 'the unit still waits to be moved');
    assert.equal(duel.activeUnit(), mine);
    assert.equal(!!duel._tac.acted[mine.id], false);
});

test('Auto asks before the player\'s units are handed to themselves, from the battle menu and from a unit\'s menu', () => {
    const w = mapped(windowed({ system: { partyMembers: [1, 2, 3] }, events: [unit(1, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight, W = F.Windows, fight = begin(w);
    assert.equal(fight.canAuto(), true);
    w.frame('cancel');
    w.choose('auto');
    assert.equal(w.menu()._page, 'auto');
    assert.deepEqual(Array.from(w.menu()._head), ['Your units act by themselves', 'for the rest of this turn?']);
    assert.deepEqual(w.rows(), ['back', 'confirm']);
    assert.deepEqual(Array.from(w.menu()._list, entry => entry.name), ['Keep playing', 'Let them act']);
    assert.equal(w.menu().index(), 0, 'the cursor starts on the answer that changes nothing');
    assert.ok(w.menu().ok());
    assert.equal(w.menu()._page, 'main');
    assert.equal(w.menu().currentSymbol(), 'auto', 'back on the row it came from');
    assert.notEqual(fight._tac.autoTurn, fight.turn(), 'nothing was handed over');
    assert.equal(fight.unactedCount(), 3);
    w.choose('auto'); w.choose('confirm');
    assert.equal(W.isMenuOpen(), false);
    assert.equal(fight._tac.autoTurn, fight.turn(), 'the turn plays itself once the player said so');
    for (let i = 0; i < 4000 && !(fight.awaitsPlayer() && fight.turn() === 2); i++) w.frame();
    assert.equal(fight.turn(), 2);
    // From a unit's own menu: the same question; "Keep playing" gives the unit's menu back.
    assert.ok(fight.commandSelectUnit(fight.pendingUnits()[0].id));
    assert.ok(fight.commandMoveTo(fight.cursor().x, fight.cursor().y));
    w.frame();
    const command = w.scene._fightCommandWindow;
    assert.ok(command && command.active);
    command.deactivate();
    command._handlers.auto();
    assert.equal(W.isMenuOpen(), true);
    assert.equal(w.menu()._page, 'auto');
    assert.notEqual(fight._tac.autoTurn, fight.turn());
    w.choose('back');
    assert.equal(W.isMenuOpen(), false);
    w.frame(); w.frame();
    assert.ok(command.active, 'the unit\'s menu is back');
    assert.equal(fight.tacticalState(), 'command');
    // The tip that says where Auto is shows only where the menu offers it.
    const tip = F.Hints.LIST.find(entry => entry.key === 'tipAuto');
    assert.equal(tip.state, 'unit');
    assert.equal(tip.when(fight), false, 'not from inside a unit\'s turn');
    assert.equal(F.Hints.textOf(tip), 'Battle menu: Auto plays the turn');
});

test('a held Cancel opens the battle menu once: the menu answers a press, not a key still held', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    const W = w.ReactorFight.Windows;
    begin(w);
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), true);
    // The key still down: the engine repeats it, the menu does not take that for a new press.
    w.Input.isRepeated = name => name === 'cancel';
    w.Input.isTriggered = () => false;
    assert.equal(w.Window_Command.prototype.isCancelTriggered.call(w.menu()), true, 'a stock window would');
    assert.equal(w.menu().isCancelTriggered(), false);
    w.Input.isTriggered = name => name === 'cancel';
    assert.equal(w.menu().isCancelTriggered(), true, 'a new press shuts it');
});

test('"Skip to my turn" hurries the other side only: the player\'s own walk keeps its pace', () => {
    const w = mapped(windowed({ events: [unit(1, 9, 2, 'enemy 1')] }));
    w.$dataEnemies[1].params[0] = 9000;
    const F = w.ReactorFight, fight = begin(w);
    const hurried = () => w.scene.isFastForward();
    /** How often the scene hurried during the player's own walk, and during the other side's phase after it. */
    const play = step => {
        const turn = fight.turn(), me = fight.pendingUnits()[0], c = fight.character(me);
        assert.ok(fight.commandSelectUnit(me.id));
        assert.ok(fight.commandMoveTo(c.x, c.y + step));
        let own = 0, walked = 0, other = 0, theirs = 0;
        for (let i = 0; i < 200 && fight.tacticalState() === 'moving'; i++) { walked++; if (hurried()) own++; w.frame(); }
        assert.ok(walked > 5, 'the walk was played');
        assert.ok(fight.commandWait());
        for (let i = 0; i < 30 && !fight.awaitsPlayer(); i++) w.frame();
        assert.ok(fight.commandEndTurn());
        for (let i = 0; i < 3000 && !(fight.awaitsPlayer() && fight.turn() > turn); i++) { w.frame(); if (fight.tacticalState() === 'enemy') { theirs++; if (hurried()) other++; } }
        return { own, other, theirs };
    };
    assert.equal(F.pace(), 'normal');
    let seen = play(3);
    assert.deepEqual([seen.own, seen.other], [0, 0], 'the normal pace hurries nothing');
    assert.ok(seen.theirs > 0);
    F.setPace('skip');
    seen = play(-3);
    assert.equal(seen.own, 0, 'at skip the player\'s own walk keeps its pace');
    assert.ok(seen.theirs > 0 && seen.other === seen.theirs, `and every frame of the other side's phase is hurried (${seen.other} of ${seen.theirs})`);
    // The dash key held hurries whatever the battle plays by itself, at any pace.
    F.setPace('normal');
    const me = fight.pendingUnits()[0], c = fight.character(me);
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(c.x, c.y + 3));
    w.frame();
    assert.equal(fight.tacticalState(), 'moving');
    assert.equal(hurried(), false);
    w.Input.isPressed = name => name === 'shift';
    assert.equal(hurried(), true);
});

test('a tip counts as shown once it has been read: stages passed through at once spend nothing, a tip the line does not show is not read, and the same words at two stages have their own times', () => {
    const Hud = require('../../runtime/reactor_ui_fight.js');
    const hintLine = Object.assign(Hud.defaultProps('fightInfo'), { fightInfo: 'hint' });
    let w = mapped(world({ events: [unit(1, 16, 2, 'enemy 1'), unit(2, 16, 6, 'enemy 1')] }));
    const H = w.ReactorFight.Hints;
    let fight = begin(w);
    const seen = () => Object.assign({}, w.$gameSystem._rrBattle.hints);
    assert.ok(H.READ >= 60 && H.READ < H.FRAMES, 'a second and more to read a tip, and it is read before the next takes its place');
    // A unit picked and put down twelve times over, two frames between presses: forty-eight frames, half of them on each stage.
    const first = fight.pendingUnits()[0].id;
    w.run(2);
    for (let i = 0; i < 12; i++) { assert.ok(fight.commandSelectUnit(first)); w.run(2); assert.ok(fight.commandCancel()); w.run(2); }
    assert.deepEqual(seen(), {}, 'nothing stood on the line long enough to be read');
    assert.equal(fight.hintText(), 'Choose a unit: Enter or click', 'and the first tip is still the one being taught');
    // What was read in pieces adds up; a tip that stays on the line is one showing however long it stands.
    let more = 0;
    while (!seen()['tipPick@unit'] && more < H.READ * 2) { w.run(1); more++; }
    assert.ok(more > H.READ / 2 && more <= H.READ - 12, `the frames it stood each of the twelve times before count toward the reading (${more} more of ${H.READ})`);
    assert.deepEqual(seen(), { 'tipPick@unit': 1 });
    w.run(H.READ * 2);
    assert.deepEqual(seen(), { 'tipPick@unit': 1 });
    // The next time the stage comes round the tip not yet read is the one shown.
    assert.ok(fight.commandSelectUnit(first)); w.run(1);
    assert.equal(fight.hintText(), 'Where to move: Enter or click');
    assert.ok(fight.commandCancel()); w.run(1);
    assert.equal(fight.hintText(), 'Shift: next unit');

    // Every tip is counted by itself: the same words at two stages are two tips.
    const ids = H.LIST.map(tip => H.idOf(tip));
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ['tipBack@move', 'tipBack@target', 'tipNext@unit', 'tipNext@move', 'tipLevel']) assert.ok(ids.includes(id), id);

    // Aiming: the tip is read while the line shows it, and not while the line says why the cell cannot be struck.
    w = mapped(world({ events: [unit(1, 6, 2, 'enemy 1')] }));
    w.$dataEnemies[1].params[0] = 9000;
    fight = begin(w);
    // "Back" has had its times on a move: on a target it is still to be taught.
    Object.assign(w.ReactorFight.Hints.seen(), { 'tipBack@move': 3, 'tipTarget@target': 2, 'tipNextTarget@target': 3 });
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(5, 2));
    w.run(200, () => fight.tacticalState() === 'command');
    assert.ok(fight.commandAttack());
    w.run(1);
    assert.equal(fight.tacticalState(), 'target');
    assert.equal(fight.hintText(), 'Esc or right-click: back', 'the tip of this stage, whatever the same words have been shown elsewhere');
    assert.equal(Hud.infoText(hintLine, fight), fight.hintText(), 'on the target the line shows the tip');
    assert.ok(fight.setCursor(5, 3));
    assert.equal(fight.targetsAtCursor().length, 0);
    assert.notEqual(Hud.infoText(hintLine, fight), fight.hintText(), 'on an empty cell the line says why instead');
    w.run(w.ReactorFight.Hints.READ * 2);
    assert.equal(seen()['tipBack@target'], undefined, 'a tip nobody could see was not read');
    assert.ok(fight.setCursor(6, 2));
    w.run(w.ReactorFight.Hints.READ);
    assert.equal(seen()['tipBack@target'], 1);
    assert.equal(seen()['tipBack@move'], 3);

    // The battle ending: no tip is written over its last moments.
    assert.notEqual(fight.hintText(), '');
    fight.end(w.ReactorFight.ESCAPE);
    assert.ok(fight._ending);
    assert.equal(fight.hintText(), '');
});

test('in a unit\'s menu a tip is not read while the cursor is on a grayed command, nor behind the battle menu; turning the tips on again starts the teaching over', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight, H = F.Hints, W = F.Windows, fight = begin(w);
    const seen = () => Object.assign({}, w.$gameSystem._rrBattle.hints);
    const frames = n => { for (let i = 0; i < n; i++) w.frame(); };
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(2, 2));
    frames(2);
    const command = w.scene._fightCommandWindow;
    assert.ok(command.active);
    assert.equal(command.currentSymbol(), 'attack');
    assert.equal(command.isCommandEnabled(command.index()), false, 'the cursor starts on Attack, grayed with nobody in reach');
    assert.equal(fight.hintText(), 'Left Right: turn the unit');
    frames(H.READ * 2);
    assert.equal(seen()['tipFace@command'], undefined, 'the line says "Nobody in reach" there: the tip under it was not read');
    // Nor does its time on the line run under the reason: however long the cursor rests there, the same tip waits.
    frames(H.FRAMES);
    assert.equal(fight.hintText(), 'Left Right: turn the unit');
    command.select(command.findSymbol('wait'));
    frames(H.READ);
    assert.equal(seen()['tipFace@command'], 1, 'on a row that can be chosen the line shows the tip, and it is read');
    assert.ok(fight.commandWait());
    for (let i = 0; i < 30 && !fight.awaitsPlayer(); i++) w.frame();
    // Behind the battle menu nothing is read.
    assert.equal(fight.tacticalState(), 'unit');
    frames(2);
    const before = seen();
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), true);
    frames(H.READ * 2);
    assert.deepEqual(seen(), before);
    // Options: Control hints off, then on again: every tip is due its times anew.
    Object.assign(H.seen(), { 'tipPick@unit': H.TIMES, 'tipMenu@unit': H.TIMES });
    w.choose('options');
    w.menu().select(w.menu().findSymbol('hints'));
    w.menu().cursorRight();
    assert.equal(H.enabled(), false);
    assert.notDeepEqual(seen(), {}, 'turned off, the counts are kept');
    w.menu().cursorRight();
    assert.equal(H.enabled(), true);
    assert.deepEqual(seen(), {}, 'turned on again, the teaching starts over');
    assert.ok(w.menu().cancel()); assert.ok(w.menu().cancel());
    assert.equal(W.isMenuOpen(), false);
    frames(2);
    assert.equal(fight.hintText(), 'Choose a unit: Enter or click');
});

test('what every enemy reaches is on the screen: a tip where the move is chosen, a row of the Controls page, and a battle menu row that shows and hides it', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight, H = F.Hints, W = F.Windows, fight = begin(w);
    assert.equal(F.Controls.name('threat'), 'T', 'the key the battle gives the action');
    const tip = H.LIST.find(entry => entry.key === 'tipThreat');
    assert.equal(tip.state, 'move');
    assert.equal(H.textOf(tip), 'T: show enemy reach');
    const rows = () => Object.fromEntries(Array.from(W.controlRows(), row => [row.name, row.keys]));
    assert.equal(rows()['Every enemy\'s reach'], 'T');
    // The battle menu: one row, named for what it will do; choosing it shuts the menu so the map is seen.
    assert.equal(fight.showsThreat(), false);
    w.frame('cancel');
    assert.ok(w.rows().includes('threat'));
    assert.equal(w.menu()._list.find(entry => entry.symbol === 'threat').name, 'Show enemy reach');
    w.choose('threat');
    assert.equal(fight.showsThreat(), true);
    assert.equal(W.isMenuOpen(), false);
    w.frame(); w.frame('cancel');
    assert.equal(w.menu()._list.find(entry => entry.symbol === 'threat').name, 'Hide enemy reach');
    w.choose('threat');
    assert.equal(fight.showsThreat(), false);
    // The tip offers to show the reach: the moment it is shown the tip gives way to the next one, and it is not
    // offered while the reach stays on the screen; hidden again, it is due again.
    Object.assign(H.seen(), { 'tipMove@move': 3, 'tipStay@move': 3 });
    const pick = () => { assert.ok(fight.commandSelectUnit(hero(w).id)); w.frame(); w.frame(); assert.equal(fight.tacticalState(), 'move'); };
    const putDown = () => { assert.ok(fight.commandCancel()); w.frame(); assert.equal(fight.tacticalState(), 'unit'); };
    w.frame();
    pick();
    assert.equal(fight.hintText(), 'T: show enemy reach');
    assert.equal(fight.toggleThreat(), true);
    w.frame();
    assert.ok(fight.hintText() && fight.hintText() !== 'T: show enemy reach', 'shown: the line teaches the next thing (' + fight.hintText() + ')');
    putDown(); pick();
    assert.notEqual(fight.hintText(), 'T: show enemy reach', 'not offered while the reach is on the screen');
    assert.equal(fight.toggleThreat(), false);
    putDown(); pick();
    assert.equal(fight.hintText(), 'T: show enemy reach', 'hidden again: the tip has not had its times');
    putDown();
    // A gamepad has no button for it: no tip and no Controls row name one, the menu row is the way.
    F.Controls.used('pad');
    assert.equal(H.textOf(tip), '');
    assert.equal(rows()['Every enemy\'s reach'], undefined);
    w.frame(); w.frame('cancel');
    assert.ok(w.rows().includes('threat'));
    F.Controls.used('keys');
    // The stock words are in the battle's one table, beside the rest of the menu's, the tips' and the Controls page's.
    for (const key of ['menuThreatShow', 'menuThreatHide', 'tipThreat', 'ctlThreat']) assert.equal(F.TERMS[key], F.term(key), key);
    assert.equal(F.THREAT_TERMS, undefined, 'no second table of the driver\'s words');
    // A project's own words.
    w.$dataSystem.reactorBattle = { terms: { tipThreat: '%1 = danger', ctlThreat: 'Danger', menuThreatShow: 'Danger on' } };
    assert.equal(H.textOf(tip), 'T = danger');
    assert.equal(rows().Danger, 'T');
    W.menuBack(w.scene); w.frame(); w.frame('cancel');
    assert.equal(w.menu()._list.find(entry => entry.symbol === 'threat').name, 'Danger on');
});

test('the battle menu is not one of the stock windows of a unit\'s turn: a HUD that draws its own commands still gets it on Cancel', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    const F = w.ReactorFight, W = F.Windows, fight = begin(w);
    F.stockWindows = false;
    assert.equal(W.canOpenMenu(), true);
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), true, 'Cancel at "Choose a unit"');
    assert.equal(w.scene.menuCalls, 0);
    assert.ok(w.rows().includes('endTurn') && w.rows().includes('options') && w.rows().includes('gameEnd'));
    w.frame('cancel', () => assert.ok(w.menu().cancel()));
    w.frame();
    w.scene.callMenu();
    assert.equal(W.isMenuOpen(), true, 'and from a camera that calls the menu itself');
    w.frame('cancel', () => assert.ok(w.menu().cancel()));
    // The unit's own menu stays the HUD's to draw.
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(2, 2));
    w.frame(); w.frame();
    assert.equal(fight.tacticalState(), 'command');
    assert.equal(w.scene._fightCommandWindow, undefined);
});

test('the battle menu shuts itself when the battle stops waiting for the player, and the game\'s menu key is the battle\'s while there is something to step back from', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    const F = w.ReactorFight, W = F.Windows, fight = begin(w);
    w.frame('cancel');
    assert.equal(W.isMenuOpen(), true);
    // An event's message takes over (a hook, a common event): the menu is not left standing over it.
    const busy = w.$gameMessage.isBusy;
    w.$gameMessage.isBusy = () => true;
    assert.equal(fight.awaitsPlayer(), false);
    w.frame();
    assert.equal(W.isMenuOpen(), false);
    assert.equal(w.menu().active, false);
    w.$gameMessage.isBusy = busy;
    // In a unit's menu the game's menu key does not reach the scene: Cancel there steps back.
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(2, 2));
    w.frame();
    assert.equal(fight.tacticalState(), 'command');
    w.Input.isTriggered = name => name === 'menu';
    assert.equal(w.scene.isMenuCalled(), false);
    assert.ok(fight.commandCancel()); assert.ok(fight.commandCancel());
    assert.equal(fight.tacticalState(), 'unit');
    w.Graphics.frameCount++;
    assert.equal(w.scene.isMenuCalled(), true, 'with nothing to step back from the key is the menu\'s');
    // The dash key hurries nothing over a message: the words are read at their own pace.
    w.Input.isTriggered = () => false;
    assert.ok(fight.commandEndTurn());
    for (let i = 0; i < 600 && fight.tacticalState() !== 'enemy'; i++) w.frame();
    w.Input.isPressed = name => name === 'shift';
    assert.equal(w.scene.isFastForward(), true);
    w.$gameMessage.isBusy = () => true;
    assert.equal(w.scene.isFastForward(), false);
});

test('the normal pace in numbers: half a second on a result, a watched walk at a pace the eye follows, and a battle that ends leaves the walkers aside as they were', () => {
    // The result of one unit's action stands for at least half a second before the next unit's turn begins.
    let w = world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 6, 4, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataSkills[1].note = '<range: 1-3>';
    w.$dataSkills[1].damage.formula = '5';
    let fight = begin(w);
    let { feed } = watchPhase(w, fight);
    const ends = feed.filter(e => e.name === 'fightActionEnd'), turns = feed.filter(e => e.name === 'fightUnitTurn');
    assert.equal(ends.length, 2);
    assert.ok(turns[1].frame - ends[0].frame >= 30, `the first result is read before the second unit begins (${turns[1].frame - ends[0].frame} frames)`);
    assert.ok(feed.find(e => e.name === 'fightAim').frame - turns[0].frame >= 30, 'and a unit is looked at, then its target, before it strikes');

    // A walk the player watches is taken at speed 5; the unit has its own speed back when it arrives.
    w = world({ events: [unit(1, 9, 2, 'enemy 1')] });
    w.$dataEnemies[1].params[0] = 9000;
    fight = begin(w);
    const walker = fight.character(foe(w, 1)), own = walker.moveSpeed();
    const speeds = new Set();
    watchPhase(w, fight, () => { if (fight._act && fight._act.stage === 'walk' && fight._act.watched) speeds.add(walker.moveSpeed()); });
    assert.deepEqual(Array.from(speeds), [5]);
    assert.equal(walker.moveSpeed(), own);

    // Units walking off to the side when the battle ends stop there with their own speed and solidity back.
    w = world({ events: [unit(1, 17, 2, 'enemy 1'), unit(2, 17, 4, 'enemy 1')] });
    fight = begin(w);
    const walkers = [1, 2].map(id => fight.character(foe(w, id)));
    const was = walkers.map(c => [c.isThrough(), c.moveSpeed()]);
    assert.ok(fight.commandEndTurn());
    w.run(600, () => (fight._tac.aside || []).length === 2);
    assert.equal(fight._tac.aside.length, 2, 'both walk aside');
    assert.deepEqual(walkers.map(c => [c.isThrough(), c.moveSpeed()]), [[true, 5], [true, 5]]);
    fight.end(w.ReactorFight.ESCAPE);
    w.run(200, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.deepEqual(walkers.map(c => [c.isThrough(), c.moveSpeed()]), was);
});

test('looking at a unit while aiming moves the view and leaves the aim alone; the next-unit command is the team turn\'s only; the hurry tip is not taught where there is nothing to hurry', () => {
    let w = mapped(world({ events: [unit(1, 6, 2, 'enemy 1'), unit(2, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].params[0] = 9000;
    w.$dataEnemies[1].note = '<move: 0>';
    const F = w.ReactorFight;
    let fight = begin(w);
    assert.ok(fight.commandSelectUnit(hero(w).id));
    assert.ok(fight.commandMoveTo(5, 2));
    w.run(200, () => fight.tacticalState() === 'command');
    assert.ok(fight.commandAttack());
    assert.equal(fight.tacticalState(), 'target');
    const aimed = [fight.cursor().x, fight.cursor().y];
    // A tile of the strip clicked: the far enemy is looked at, the cursor stays on the target.
    assert.ok(fight.commandLookAt(foe(w, 2).id));
    assert.deepEqual([fight._tac.focus.x, fight._tac.focus.y], [15, 8]);
    assert.deepEqual([fight.cursor().x, fight.cursor().y], aimed);
    assert.equal(fight.tacticalState(), 'target');
    // The other side's phase: the hurry tip at the normal and fast pace, none at "skip" (the phase is hurried already).
    assert.ok(fight.commandCancel()); assert.ok(fight.commandWait());
    w.run(30, () => fight.awaitsPlayer());
    const hurry = F.Hints.LIST.find(tip => tip.key === 'tipHurry');
    assert.equal(hurry.when(fight), true);
    F.setPace('fast');
    assert.equal(hurry.when(fight), true);
    F.setPace('skip');
    assert.equal(hurry.when(fight), false);
    assert.ok(fight.commandEndTurn());
    let tips = 0, frames = 0;
    for (let i = 0; i < 2000 && !(fight.awaitsPlayer() && fight.turn() === 2); i++) { w.run(1); if (fight.tacticalState() === 'enemy') { frames++; if (fight.hintText()) tips++; } }
    assert.ok(frames > 0);
    assert.equal(tips, 0, 'at "Skip to my turn" the line keeps to "The enemy is moving"');
    F.setPace('normal');
    assert.ok(fight.commandEndTurn());
    w.run(600, () => fight.tacticalState() === 'enemy');
    w.run(2);
    assert.equal(fight.hintText(), 'Hold Shift to hurry');

    // Initiative turns: a unit's turn is its own, there is nobody to go to.
    w = mapped(world({ events: [unit(1, 15, 8, 'enemy 1')] }));
    fight = begin(w, { turns: 'initiative' });
    assert.equal(fight.tacticalState(), 'move');
    const mine = fight.activeUnit();
    assert.equal(fight.commandNextUnit(), false);
    assert.equal(fight.activeUnit(), mine);
    assert.equal(fight.tacticalState(), 'move');
});

test('a unit on watch is marked for the HUD (its panel and its turn tile), and a unit that cannot turn says so', () => {
    const w = mapped(windowed({ events: [unit(1, 15, 8, 'enemy 1')] }));
    w.$dataEnemies[1].note = '<move: 0>';
    w.$dataSkills[1].note = '<range: 1-4>';                                          // a reach of two or more may keep watch
    const fight = begin(w), me = hero(w);
    const row = () => fight.turnOrder().find(entry => entry.unitId === me.id);
    assert.equal(row().watch, false);
    assert.equal(fight.unitInfo(me).overwatch, false);
    assert.ok(fight.commandSelectUnit(me.id));
    assert.ok(fight.commandMoveTo(2, 2));
    w.frame();
    // Left and Right turn the unit; one that cannot turn (its body has no room, its direction is fixed) is refused, with the buzzer.
    const character = fight.character(me), command = w.scene._fightCommandWindow;
    const sounds = [];
    for (const name of ['playCursor', 'playBuzzer']) w.SoundManager[name] = () => sounds.push(name);
    const facing = character.direction();
    command.cursorRight();
    assert.notEqual(character.direction(), facing);
    assert.equal(fight._act.faced, true);
    assert.deepEqual(sounds, ['playCursor']);
    fight._act.faced = false;
    const turned = character.direction();
    character.setDirectionFix(true);
    assert.equal(fight.commandFace(facing), false, 'it did not turn');
    command.cursorLeft();
    assert.equal(character.direction(), turned);
    assert.equal(fight._act.faced, false, 'and the facing is not taken as chosen');
    assert.deepEqual(sounds, ['playCursor', 'playBuzzer']);
    character.setDirectionFix(false);
    // Overwatch: the unit's row of the turn order and its details say it keeps watch, until its side moves again.
    assert.ok(fight.commandOverwatch());
    assert.equal(row().watch, true);
    assert.equal(fight.unitInfo(me).overwatch, true);
    const Hud = require('../../runtime/reactor_ui_fight.js');
    const view = Hud.fillUnitView(Hud.newUnitView(), fight, me, true, null);
    assert.deepEqual([view.watch, view.watchText], [true, 'On watch'], 'in the battle\'s own words');
    for (let i = 0; i < 30 && !fight.awaitsPlayer(); i++) w.frame();
    assert.ok(fight.commandEndTurn());
    for (let i = 0; i < 900 && !(fight.awaitsPlayer() && fight.turn() === 2); i++) w.frame();
    assert.equal(fight.turn(), 2);
    assert.equal(row().watch, false, 'its side\'s next turn: the watch is over');
});
