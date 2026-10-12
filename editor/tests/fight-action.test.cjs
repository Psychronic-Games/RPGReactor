'use strict';
// Action and First Person battles on the map (runtime/reactor_fight_action.js):
// the note tags and their defaults, shots and swings through the stock battle
// math, the magazine, the combo, the dodge, what the other units do, outcomes,
// saves made mid-fight, and that nothing changes in Tactical or Classic. The
// world is a 2D map with no Reactor3D at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const facing = direction => ({ pages: [page({ image: { tileId: 0, characterName: '', characterIndex: 0, direction, pattern: 1 } })] });
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);

/** A world with weapon types and a few weapons, the enemy tough enough to take more than one blow. */
function world(options = {}) {
    const w = fightWorld(Object.assign({ action: true }, options));
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Rifle', 'Pistol', 'Shotgun', 'Bow', 'Cannon', 'Dagger'];
    const weapon = (id, name, wtypeId, note = '') => ({ id, name, wtypeId, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note, iconIndex: 96 + id, animationId: 0, price: 0, description: '' });
    w.$dataWeapons.push(weapon(1, 'Blade', 1), weapon(2, 'Rifle', 2), weapon(3, 'Pistol', 3), weapon(4, 'Scattergun', 4), weapon(5, 'Bow', 5),
        weapon(6, 'Launcher', 6), weapon(7, 'Knife', 7), weapon(8, 'Tuned Rifle', 2, '<range: 3-9>\n<fire rate: 5> <magazine: 4><reload: 0.5> <spread: 0>'));
    for (let type = 1; type <= 7; type++) w.$dataClasses[1].traits.push({ code: 51, dataId: type, value: 1 });
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataEnemies[2].params[0] = 5000;
    return w;
}
const equip = (w, weaponId, actorId = 1) => { w.$gameActors.actor(actorId).forceChangeEquip(0, weaponId ? w.$dataWeapons[weaponId] : null); return w.$gameActors.actor(actorId); };
/** Start an action battle and let its first frames pass. */
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'action' }, options)) > 0);
    w.run(3);
    return w.$gameFight;
}
const still = w => { for (const u of w.$gameFight._units) if (u !== w.$gameFight.playerUnit()) w.$gameFight.act().ai[u.id] = Object.assign(w.ReactorFight.Action.aiOf(w.$gameFight, w.$gameFight.act(), u, w.$gameFight.character(u)), { state: 'stagger', timer: 100000 }); };

test('tags: fire rate, magazine, reload, spread, projectile, combo and cooldown, beside the tactical ones', () => {
    const A = world().ReactorFight.Action;
    assert.equal(A.parse('a plain note'), null);
    const tags = A.parse('<range: 2-6>\n<Fire Rate: 4.5> <magazine: 20><reload: 1.5>\n<spread: 2.5><projectile: Rocket><combo: 4><cooldown: 3>');
    assert.deepEqual({ ...tags }, { fireRate: 4.5, magazine: 20, reload: 1.5, spread: 2.5, combo: 4, cooldown: 3, projectile: 'rocket' });
    assert.equal(A.parse('<projectile: laser>'), null, 'an unknown projectile is no tag');
});

test('defaults: a weapon is what its type says, a tag changes one thing, bare hands punch', () => {
    const w = world(), A = w.ReactorFight.Action;
    const of = id => A.profile(equip(w, id));
    const rifle = of(2);
    assert.deepEqual([rifle.ranged, rifle.rate, rifle.magazine, rifle.reload, rifle.projectile, rifle.pellets], [true, 24, 10, 96, 'bullet', 1]);
    assert.ok(Math.abs(rifle.damage - 0.4) < 1e-9, 'about one attack a second of held fire');
    const pistol = of(3);
    assert.deepEqual([pistol.rate, pistol.magazine, pistol.spread], [20, 12, 3]);
    const shotgun = of(4);
    assert.deepEqual([shotgun.pellets, shotgun.magazine], [6, 6]);
    const bow = of(5);
    assert.deepEqual([bow.projectile, bow.magazine, bow.speed > 0], ['arrow', 0, true]);
    assert.deepEqual([of(6).projectile, of(6).blast], ['rocket', 1.5]);
    const blade = of(1);
    assert.deepEqual([blade.ranged, blade.combo, blade.reach, blade.magazine], [false, 3, 1.6, 0]);
    assert.deepEqual([of(7).combo, of(7).reach], [4, 1.2]);
    const tuned = of(8);
    assert.deepEqual([tuned.rate, tuned.magazine, tuned.reload, tuned.spread], [12, 4, 30, 0]);
    const bare = of(0);
    assert.deepEqual([bare.ranged, bare.combo, bare.reach], [false, 2, 1.1]);
    assert.equal(A.cooldownOf(w.$dataSkills[1]), 120);
    assert.equal(A.cooldownOf(w.$dataItems[1]), 60);
    assert.equal(A.cooldownOf(Object.assign({}, w.$dataSkills[1], { note: '<cooldown: 0.5>' })), 30);
});

test('with the tactical driver loaded, a shot carries 2.5 times the tactical range', () => {
    const w = world({ tactical: true }), A = w.ReactorFight.Action;
    assert.equal(A.profile(equip(w, 2)).range, 7 * 2.5, 'a rifle reaches 7 tiles in Tactical');
    assert.equal(A.profile(equip(w, 8)).range, 9 * 2.5, 'the weapon\'s own <range> tag');
    assert.equal(A.profile(equip(w, 3)).range, 4 * 2.5);
});

test('an action battle has no turns: the player walks, the queue never starts, and a turn passes every four seconds', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    const turns = [];
    w.ReactorEvents.on('mapBattleTurnStart', payload => turns.push(payload.turn));
    const fight = begin(w);
    still(w);
    assert.equal(fight.isAction(), true);
    assert.equal(fight._queue.length, 0);
    assert.equal(fight.turn(), 0);
    assert.equal(w.$gamePlayer.canMove(), true, 'the battle does not hold the player');
    w.$gamePlayer.moveStraight(6);
    w.run(40);
    assert.equal(w.$gamePlayer.x, 3);
    w.run(w.ReactorFight.Action.TURN_FRAMES);
    assert.equal(fight.turn(), 1);
    assert.deepEqual(Array.from(turns), [1]);
    assert.equal(fight.isActive(), true);
});

test('a rifle fires where the weapon points: the shot is the attack through the stock math, scaled by the fire rate', () => {
    const w = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2)), unit(2, 2, 8, 'enemy 1', facing(2))] });
    equip(w, 2);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    const shots = [];
    w.ReactorEvents.on('fightShot', payload => shots.push(payload.targetId));
    const target = foe(w, 1), battler = fight.battler(target);
    assert.equal(fight.actionAttack(), true);
    // a.atk * 4 - b.def * 2 = 60 * 4 - 5 * 2 = 230, times 0.4 for a rifle's 2.5 shots a second.
    assert.equal(battler.mhp - battler.hp, 92);
    assert.deepEqual(Array.from(shots), [target.id]);
    assert.equal(fight.battler(foe(w, 2)).hp, 5000, 'one off the line is not hit');
    assert.equal(fight.actionAttack(), false, 'not again until the weapon has cycled');
    w.run(24);
    assert.equal(fight.actionAttack(), true);
    assert.equal(battler.mhp - battler.hp, 184);
    const hud = fight.actionHud();
    assert.deepEqual([hud.ammo.magazine, hud.ammo.capacity, hud.weapon.ranged, hud.weapon.name], [8, 10, true, 'Rifle']);
    assert.equal(hud.crosshair.onTarget, true);
    assert.equal(hud.target.unitId, target.id);
});

test('a shot aimed away hits nobody, and a body in the way takes it', () => {
    const w = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2)), unit(2, 5, 2, 'enemy 2', facing(2))] });
    equip(w, 8);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    fight.actionAttack();
    assert.equal(fight.battler(foe(w, 2)).hp < 5000, true, 'the nearer one is struck');
    assert.equal(fight.battler(foe(w, 1)).hp, 5000);
    w.run(13);
    w.$gamePlayer.setDirection(2);
    fight.actionAttack();
    assert.equal(fight.battler(foe(w, 1)).hp, 5000);
});

test('a magazine empties, reloads over its time and fills; R reloads early', () => {
    const w = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2))] });
    equip(w, 8);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    const reloads = [];
    w.ReactorEvents.on('fightReload', payload => reloads.push(payload.frames));
    for (let i = 0; i < 4; i++) { assert.equal(fight.actionAttack(), true, 'shot ' + (i + 1)); w.run(12); }
    assert.equal(fight.actionHud().ammo.magazine, 0);
    assert.equal(fight.actionAttack(), false, 'an empty weapon reloads instead');
    assert.deepEqual(Array.from(reloads), [30]);
    w.run(10);
    assert.ok(fight.actionHud().ammo.reload > 0);
    assert.equal(fight.actionAttack(), false, 'no shot mid-reload');
    w.run(25);
    assert.equal(fight.actionHud().ammo.magazine, 4);
    assert.equal(fight.actionAttack(), true);
    w.run(12);
    assert.equal(fight.actionReload(), true);
    assert.equal(fight.actionReload(), false, 'already reloading');
});

test('Repeats and states come through a shot as they do in a Classic battle', () => {
    const w = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2))] });
    w.$dataStates[4] = Object.assign({}, w.$dataStates[1], { id: 4, name: 'Marked', restriction: 0, autoRemovalTiming: 0 });
    w.$dataSkills[1] = Object.assign({}, w.$dataSkills[1], { repeats: 2, effects: [{ code: 21, dataId: 4, value1: 1, value2: 0 }] });
    equip(w, 8);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    const hits = [];
    w.ReactorEvents.on('fightImpact', payload => hits.push(payload.hits));
    fight.actionAttack();
    const battler = fight.battler(foe(w, 1));
    // Two hits of 230 at a fifth (five shots a second).
    assert.equal(battler.mhp - battler.hp, 92);
    assert.equal(battler.isStateAffected(4), true);
    assert.deepEqual(Array.from(hits), [2]);
});

test('an arrow flies and lands when it arrives; a step aside and it passes', () => {
    const w = world({ events: [unit(1, 8, 2, 'enemy 1', facing(2))] });
    equip(w, 5);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    const battler = fight.battler(foe(w, 1));
    assert.equal(fight.actionAttack(), true);
    assert.equal(battler.hp, 5000, 'still in the air');
    assert.equal(fight.act().shots.length, 1);
    w.run(15);
    assert.ok(battler.hp < 5000, 'it arrived');
    assert.equal(fight.act().shots.length, 0);
    // Again, with the target gone from the line before it arrives.
    w.run(60);
    const before = battler.hp;
    fight.actionAttack();
    const target = fight.character(foe(w, 1));
    target.locate(8, 5);
    w.run(30);
    assert.equal(battler.hp, before);
    assert.equal(fight.act().shots.length, 0, 'it flew its range and is gone');
});

test('a blade chains its combo: click, click, click; each step lands on who stands in its arc and reach', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(2)), unit(2, 1, 2, 'enemy 2', facing(2)), unit(3, 6, 2, 'enemy 2', facing(2))] });
    equip(w, 1);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    const swings = [];
    w.ReactorEvents.on('fightSwing', payload => swings.push(payload.step + '/' + payload.steps));
    const front = fight.battler(foe(w, 1)), behind = fight.battler(foe(w, 2)), far = fight.battler(foe(w, 3));
    assert.equal(fight.actionAttack(), true);
    assert.equal(fight.actionHud().combo, 1);
    w.run(6);
    assert.equal(fight.actionAttack(), true, 'a click mid-swing is kept for the next step');
    w.run(20);
    // 230 at half for the first step.
    assert.equal(front.mhp - front.hp >= 115, true);
    assert.deepEqual(Array.from(swings), ['1/3', '2/3']);
    w.run(8);
    fight.actionAttack();
    w.run(60);
    assert.deepEqual(Array.from(swings), ['1/3', '2/3', '3/3']);
    // Steps one and two land half and six tenths of an attack, the last a whole one.
    assert.equal(front.mhp - front.hp, 115 + 138 + 230);
    assert.equal(behind.hp, 5000, 'one behind the swing is not struck');
    assert.equal(far.hp, 5000, 'nor one out of reach');
    assert.equal(fight.actionHud().combo, 0);
    // Left alone, the chain starts over.
    w.run(40);
    fight.actionAttack();
    assert.equal(swings[swings.length - 1], '1/3');
});

test('an enemy notices, closes in, winds up and strikes; one who has not seen the player stands where it is', () => {
    const w = world({ events: [unit(1, 8, 2, 'enemy 1', facing(4)), unit(2, 14, 12, 'enemy 2', facing(2))] });
    const all = [];
    w.ReactorEvents.on('fightAlert', payload => all.push('alert ' + payload.unitId));
    w.ReactorEvents.on('fightWindup', payload => all.push('windup ' + payload.unitId));
    const fight = begin(w);
    const near = foe(w, 1), away = foe(w, 2), actor = w.$gameActors.actor(1);
    // The follower stands by, so the blow is the player's to take.
    fight.act().ai[fight._units.find(u => u.actorId === 2).id] = { state: 'stagger', timer: 100000 };
    const hp = actor.hp;
    w.run(420, () => actor.hp < hp);
    assert.ok(actor.hp < hp, 'the blow landed');
    assert.equal(hp - actor.hp, (30 * 4 - 10 * 2) * w.ReactorFight.Action.PARTY_DAMAGE, 'the attack through the stock math, at the party\'s share');
    assert.deepEqual(all.filter(line => line.endsWith(' ' + near.id)).slice(0, 2), ['alert ' + near.id, 'windup ' + near.id]);
    const c = fight.character(near);
    assert.ok(Math.abs(c.x - w.$gamePlayer.x) + Math.abs(c.y - w.$gamePlayer.y) <= 2, 'it came to the player');
    assert.equal(fight.act().ai[away.id].state, 'idle');
    assert.deepEqual([fight.character(away).x, fight.character(away).y], [14, 12]);
    assert.ok(fight.actionHud().damage.pulse > 0, 'the HUD pulses when the player is hurt');
});

test('a dodge at the right moment: the blow misses, and the dodge needs a rest before the next', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(4))] });
    // Alone: a friend who has stepped behind the player is where the hop would land (the test of bodies covers that).
    w.$gameParty.removeActor(2);
    const fight = begin(w);
    const actor = w.$gameActors.actor(1), enemy = foe(w, 1);
    const winding = () => fight.act().ai[enemy.id] && fight.act().ai[enemy.id].state === 'windup' && fight.act().ai[enemy.id].timer <= 3;
    assert.ok(w.run(400, winding) < 400, 'it winds up');
    const dodges = [];
    w.ReactorEvents.on('fightDodge', payload => dodges.push(payload.unitId));
    assert.equal(fight.actionDodge(), true);
    assert.equal(fight.actionDodge(), false, 'not again at once');
    assert.equal(fight.actionHud().dodging, true);
    w.run(40);
    assert.equal(actor.hp, actor.mhp, 'nothing landed');
    assert.equal(dodges.length, 1);
    assert.notDeepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [2, 2], 'the hop carried the player off the spot');
});

test('guarding takes the edge off a blow', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(4))] });
    const fight = begin(w);
    const actor = w.$gameActors.actor(1), A = w.ReactorFight.Action;
    A.Input.virtual.guard = true;
    w.run(400, () => actor.hp < actor.mhp);
    assert.equal(actor.mhp - actor.hp, Math.round(100 * A.GUARD_RATE * A.PARTY_DAMAGE));
    assert.equal(fight.actionHud().guarding, true);
    A.Input.virtual.guard = false;
});

test('a ranged enemy shoots a bolt that flies; out of its line it passes', () => {
    const w = world({ tactical: true, events: [unit(1, 9, 2, 'enemy 1', facing(4))] });
    w.$dataSkills[1] = Object.assign({}, w.$dataSkills[1], { note: '<range: 2-5>' });
    w.$dataEnemies[1].note = '<ai: ranged>';
    const fight = begin(w);
    const actor = w.$gameActors.actor(1);
    fight.act().ai[fight._units.find(u => u.actorId === 2).id] = { state: 'stagger', timer: 100000 };
    w.$gameActors.actor(2).addState(1);
    assert.ok(w.run(600, () => fight.act().shots.length > 0) < 600, 'it fired');
    assert.equal(actor.hp, actor.mhp, 'the bolt is in the air');
    const c = fight.character(foe(w, 1));
    assert.ok(Math.abs(c.x - w.$gamePlayer.x) >= 3, 'it kept its distance');
    w.run(60, () => actor.hp < actor.mhp);
    assert.equal(actor.mhp - actor.hp, 100 * w.ReactorFight.Action.PARTY_DAMAGE);
});

test('a guard raised just as the blow lands turns it aside whole and staggers who struck', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(4))] });
    const fight = begin(w);
    const actor = w.$gameActors.actor(1), A = w.ReactorFight.Action, enemy = foe(w, 1);
    const guards = [];
    w.ReactorEvents.on('fightGuard', payload => guards.push(payload.perfect));
    const run = () => fight.act().runs.find(entry => entry.run.subjectId === enemy.id);
    assert.ok(w.run(400, () => run() && run().run.frame >= 9) < 400, 'its blow is on the way');
    A.Input.virtual.guard = true;
    w.run(12);
    assert.equal(actor.hp, actor.mhp, 'nothing got through');
    assert.deepEqual(Array.from(guards), [true]);
    assert.equal(fight.act().ai[enemy.id].state, 'stagger');
    A.Input.virtual.guard = false;
});

test('a swing is stood for: no walking mid-swing, no dodge before its blow has had its chance, and a hit holds the battle an instant', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(2))] });
    equip(w, 1);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    fight.actionAttack();
    w.run(2);
    assert.equal(w.$gamePlayer.canMove(), false);
    assert.equal(fight.actionDodge(), false, 'committed');
    const clock = () => fight.act().clock;
    w.run(8, () => fight.act().stop > 0);
    assert.ok(fight.act().stop > 0, 'the blade landed and the battle holds');
    const at = clock();
    w.run(2);
    assert.equal(clock(), at, 'nothing moves on during the hold');
    w.run(30);
    assert.equal(w.$gamePlayer.canMove(), true);
    assert.equal(fight.actionDodge(), true);
});

test('the hotbar: a skill is used on the opponent aimed at, pays its cost and rests for its cooldown', () => {
    const w = world({ events: [unit(1, 4, 2, 'enemy 1', facing(2))] });
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Power Strike', mpCost: 5, animationId: 0, stypeId: 1, note: '<cooldown: 1>',
        damage: { critical: false, elementId: -1, formula: '500', type: 1, variance: 0 } });
    w.$gameActors.actor(1).learnSkill(3);
    w.$gameParty.gainItem(w.$dataItems[2], 1);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    w.run(2);
    const actor = w.$gameActors.actor(1), battler = fight.battler(foe(w, 1)), mp = actor.mp;
    const bar = fight.actionHud().hotbar.map(slot => slot.kind + ':' + slot.name);
    assert.deepEqual(Array.from(bar), ['skill:Power Strike', 'item:Bomb']);
    assert.equal(fight.actionUse(1), true);
    assert.equal(actor.mp, mp - 5);
    assert.equal(fight.actionUse(1), false, 'resting');
    assert.equal(w.$gamePlayer.canMove(), false, 'the skill roots the player while it plays');
    w.run(40);
    assert.equal(battler.mhp - battler.hp, 500, 'a skill lands whole');
    assert.equal(w.$gamePlayer.canMove(), true);
    assert.ok(fight.actionHud().hotbar[0].cooldown > 0);
    w.run(40);
    assert.equal(fight.actionUse(1), true);
    w.run(40);
    assert.equal(fight.actionUse(2), true, 'the bomb');
    w.run(40);
    assert.equal(battler.mhp - battler.hp, 1050);
    assert.equal(w.$gameParty.numItems(w.$dataItems[2]), 0);
});

test('the lock takes the opponent nearest the weapon\'s line, then the next, and lets go of one that falls', () => {
    const w = world({ events: [unit(1, 6, 2, 'enemy 1', facing(2)), unit(2, 6, 5, 'enemy 2', facing(2))] });
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(fight.actionLock(), true);
    assert.equal(fight.actionHud().target.unitId, foe(w, 1).id);
    assert.equal(fight.actionHud().target.locked, true);
    fight.actionLock();
    assert.equal(fight.actionHud().target.unitId, foe(w, 2).id);
    fight.battler(foe(w, 2)).addState(1);
    w.run(2);
    assert.equal(fight.act().player.lock, 0);
});

test('weapons change in hand: the next one the actor can equip comes out of the bag', () => {
    const w = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2))] });
    equip(w, 2);
    w.$gameParty.gainItem(w.$dataWeapons[1], 1);
    const fight = begin(w);
    still(w);
    assert.equal(fight.actionHud().weapon.count, 2);
    assert.equal(fight.actionNextWeapon(1), true);
    assert.equal(w.$gameActors.actor(1).weapons()[0].name, 'Blade');
    assert.equal(fight.actionHud().weapon.ranged, false);
    assert.equal(w.$gameParty.numItems(w.$dataWeapons[2]), 1, 'the rifle went back into the bag');
});

test('the goals and branches are the fight\'s own: defeating everyone wins, a fallen party loses', () => {
    const win = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2))] });
    win.$dataEnemies[1].params[0] = 60;
    equip(win, 2);
    const fight = begin(win);
    still(win);
    win.$gamePlayer.setDirection(6);
    const ends = [];
    win.ReactorEvents.on('mapBattleEnd', payload => ends.push(payload.result));
    fight.actionAttack();
    win.run(30);
    assert.equal(fight.isActive(), true, 'the fallen lies a while before the battle is called');
    assert.ok(win.$gameMap.event(1)._reactorPosePitch > 0.9, 'it fell over');
    win.run(200);
    assert.deepEqual(Array.from(ends), [0]);
    assert.equal(fight.isActive(), false);
    assert.equal(win.$gamePlayer.canMove(), true);

    const lose = world({ events: [unit(1, 3, 2, 'enemy 1', facing(4))] });
    lose.$dataEnemies[1].params[2] = 5000;
    const lost = begin(lose, { canLose: true });
    const results = [];
    lose.ReactorEvents.on('mapBattleEnd', payload => results.push(payload.result));
    lose.run(1500, () => results.length > 0);
    assert.deepEqual(Array.from(results), [2]);
    assert.equal(lost.isActive(), false);
    assert.ok(lose.$gameActors.actor(1).isAlive(), 'a battle that can be lost revives the party');
    assert.equal(lose.pushed.includes('goto:Scene_Gameover'), false);
});

test('when the leader falls the next member standing takes the lead', () => {
    const w = world({ events: [unit(1, 9, 9, 'enemy 1', facing(2))] });
    const fight = begin(w);
    still(w);
    w.$gameActors.actor(1).addState(1);
    w.run(3);
    assert.equal(w.$gameParty.leader().actorId(), 2);
    assert.equal(fight.playerUnit().actorId, 2);
    assert.equal(fight.isActive(), true);
});

test('the party gets its own order back when the battle ends, also after a save and load mid-battle and with a member who joined', () => {
    for (const result of [0, 1, 2]) {
        const w = world({ events: [unit(1, 9, 9, 'enemy 1', facing(2))] });
        const fight = begin(w);
        still(w);
        const before = Array.from(w.$gameParty._actors);
        assert.ok(before.length >= 2);
        w.$gameActors.actor(before[0]).addState(1);
        w.run(3);
        assert.equal(w.$gameParty.leader().actorId(), before[1], 'the next member leads');
        assert.deepEqual(Array.from(fight.act().order), before, 'the order is kept in the battle\'s saved state');
        // A save and load mid-battle keeps it: the state is plain data.
        fight._action = JSON.parse(JSON.stringify(fight._action));
        fight.end(result);
        w.run(200, () => !fight.isActive());
        assert.equal(fight.isActive(), false);
        assert.deepEqual(Array.from(w.$gameParty._actors), before, `result ${result}: the order is back`);
    }
    // Someone joins and someone leaves during the battle: those still there keep their order, the newcomer follows.
    const w = world({ events: [unit(1, 9, 9, 'enemy 1', facing(2))] });
    const fight = begin(w);
    still(w);
    const before = Array.from(w.$gameParty._actors);
    w.$gameActors.actor(before[0]).addState(1);
    w.run(3);
    const A = w.ReactorFight.Action, st = fight.act();
    const joined = [1, 2, 3, 4, 5, 6, 7, 8].find(id => !before.includes(id) && w.$dataActors[id]) || before[before.length - 1];
    const gone = before[2];
    w.$gameParty._actors = [before[1], joined, before[0]].concat(before.slice(3)).filter((id, i, list) => list.indexOf(id) === i);   // one left, one joined
    const expected = before.filter(id => id !== gone || id === joined).concat(before.includes(joined) ? [] : [joined]);
    A.restoreOrder(st);
    assert.deepEqual(Array.from(w.$gameParty._actors), expected);
    assert.equal(st.order, null, 'given back once');
    // No leader ever fell: nothing is touched.
    const untouched = Array.from(w.$gameParty._actors);
    A.restoreOrder(st);
    assert.deepEqual(Array.from(w.$gameParty._actors), untouched);
});

test('a save made mid-fight loads and plays on: the magazine, a shot in the air, who the enemy is after', () => {
    const w = world({ events: [unit(1, 9, 2, 'enemy 1', facing(4))] });
    equip(w, 5);
    const fight = begin(w);
    w.$gamePlayer.setDirection(6);
    w.run(30);
    fight.actionAttack();
    w.run(2);
    assert.equal(fight.act().shots.length, 1);
    const saved = w.JsonEx.stringify(w.DataManager.makeSaveContents());
    w.DataManager.extractSaveContents(w.JsonEx.parse(saved));
    const loaded = w.$gameFight;
    assert.notEqual(loaded, fight);
    assert.equal(loaded.isAction(), true);
    assert.equal(loaded.act().shots.length, 1);
    const battler = loaded.battler(loaded.unitOfEvent(1));
    w.run(40);
    assert.ok(battler.hp < 5000, 'the arrow in the air arrived after the load');
    assert.ok(loaded.act().ai[loaded.unitOfEvent(1).id], 'the enemy kept its state');
});

test('nothing changes in a Tactical battle with the action driver loaded, and one mode leaves nothing for the next', () => {
    const w = world({ tactical: true, events: [unit(1, 9, 2, 'enemy 1', facing(4))] });
    w.$dataEnemies[1].params[0] = 60;
    const F = w.ReactorFight;
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(30, () => w.$gameFight.awaitsPlayer());
    assert.equal(w.$gameFight.isAction(), false);
    assert.equal(w.$gameFight.actionHud(), null);
    assert.equal(w.$gameFight._action, null);
    assert.equal(w.$gameFight.actionAttack(), false);
    assert.equal(w.$gamePlayer.canMove(), false, 'a tactical battle moves the party itself');
    assert.equal(w.$gameFight.turn(), 1, 'its rounds are its own');
    w.$gameFight.end(F.ESCAPE, true);
    w.run(10);
    assert.equal(w.$gameFight.isActive(), false);
    // Now an action battle on the same map, then a tactical one again.
    equip(w, 2);
    begin(w);
    assert.equal(w.$gameFight.isAction(), true);
    assert.equal(w.$gameFight.isTactical(), false);
    assert.equal(w.$gameFight.tacticalState(), 'idle');
    assert.equal(F.isHeld(), false);
    w.$gameFight.end(F.ESCAPE, true);
    w.run(10);
    assert.equal(w.$gameFight._action, null);
    assert.equal(F.Action.Input.left, false);
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(30, () => w.$gameFight.awaitsPlayer());
    assert.equal(w.$gameFight.awaitsPlayer(), true);
});

test('an army holds up: forty units, a few thinking each frame, and no unit count is assumed', () => {
    const events = [];
    for (let i = 0; i < 20; i++) events.push(unit(i + 1, 12 + (i % 5), 2 + Math.floor(i / 5) * 3, 'enemy 1'));
    for (let i = 0; i < 18; i++) events.push(unit(30 + i, 4 + (i % 3), 4 + Math.floor(i / 3), 'ally enemy 2'));
    const w = world({ events });
    const fight = begin(w), A = w.ReactorFight.Action;
    assert.equal(fight.units().length, 40);
    let most = 0;
    for (let i = 0; i < 400; i++) { w.run(1); most = Math.max(most, A._thinks); }
    assert.ok(most > 0 && most <= A.THINK_BUDGET, 'thinking is rationed: ' + most);
    assert.equal(fight.isActive(), true);
    assert.ok(Object.keys(fight.act().ai).length >= 38, 'every unit but the player has its own state');
    const hud = fight.actionHud();
    assert.ok(hud.enemies.length <= 24, 'the HUD lists the nearest, not all');
});

test('firstPerson is the same driver', () => {
    const w = world({ events: [unit(1, 7, 2, 'enemy 1', facing(2))] });
    equip(w, 2);
    const fight = begin(w, { mode: 'firstPerson' });
    still(w);
    w.$gamePlayer.setDirection(6);
    assert.equal(fight.isAction(), true);
    assert.equal(fight.actionAttack(), true);
    assert.ok(fight.battler(foe(w, 1)).hp < 5000);
});

test('the battle\'s keys are set while it runs and given back exactly', () => {
    const file = path.join(__dirname, '..', '..', 'runtime', 'reactor_controls.js');
    const ctx = { Input: { keyMapper: { 70: 'own', 82: 'debug', 32: 'ok' }, gamepadMapper: { 1: 'cancel', 3: 'menu' } }, $dataSystem: {} };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis;', ctx);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'reactor_controls.js' });
    const C = ctx.ReactorControls;
    C.setAction(true);
    assert.equal(ctx.Input.keyMapper[70], 'attack');
    assert.equal(ctx.Input.keyMapper[82], 'reload');
    assert.equal(ctx.Input.keyMapper[49], 'hotbar1');
    assert.equal(ctx.Input.gamepadMapper[7], 'attack');
    assert.equal(ctx.Input.gamepadMapper[1], 'dodge');
    ctx.Input.keyMapper[86] = 'changed meanwhile';
    C.setAction(false);
    assert.deepEqual({ ...ctx.Input.keyMapper }, { 70: 'own', 82: 'debug', 32: 'ok', 86: 'changed meanwhile' });
    assert.deepEqual({ ...ctx.Input.gamepadMapper }, { 1: 'cancel', 3: 'menu' });
    // A project's own keys.
    ctx.$dataSystem.reactorControls = { actionKeys: { 88: 'attack' }, actionButtons: {} };
    C.setAction(true);
    assert.equal(ctx.Input.keyMapper[88], 'attack');
    assert.equal(ctx.Input.keyMapper[70], 'own');
    C.setAction(false);
    assert.equal(ctx.Input.keyMapper[88], undefined);
});

test('the driver is registered wherever the runtime\'s files are listed', () => {
    const repo = path.join(__dirname, '..', '..');
    const main = fs.readFileSync(path.join(repo, 'runtime', 'reactor_main.js'), 'utf8');
    assert.ok(main.indexOf('"js/reactor_fight_stage.js"') < main.indexOf('"js/reactor_fight_action.js"'), 'after the stage it plays through');
    assert.ok(main.indexOf('"js/reactor_fight_tactical.js"') < main.indexOf('"js/reactor_fight_action.js"'));
    assert.ok(main.indexOf('"js/reactor_fight_action.js"') < main.indexOf('"js/reactor_plugins.js"'));
    for (const name of ['build-scripts/build.js', 'build-scripts/build-worker.js', 'build-scripts/dist-editor-worker.js']) {
        assert.ok(fs.readFileSync(path.join(repo, 'editor', name), 'utf8').includes("'reactor_fight_action.js'"), name);
    }
});

test('a model small in the view has its motion sampled less often: the same rule in every mode', () => {
    // Pinned on the source and on the pure rule: reactor_3d_models.js needs three.js to load whole.
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d_models.js'), 'utf8');
    const start = source.indexOf('Reactor3D.ANIMATION_SMALL = ');
    const end = source.indexOf('Reactor3D.MapScene.prototype.syncCharacterModels = ');
    assert.ok(start > 0 && end > start);
    const R = { instanceSpan: () => 3 };
    new Function('Reactor3D', 'Graphics', '$gamePlayer', source.slice(start, end))(R, { frameCount: 0 }, null);
    // A camera at the origin looking down -z (three's convention: the third column of its world matrix is +z).
    const camera = { position: { x: 0, y: 0, z: 0 }, fov: 50, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
    assert.equal(R.animationStride(0, 0, -5, 3, camera), 1, 'plain to see: every frame');
    assert.equal(R.animationStride(0, 0, -80, 3, camera), 2, 'small in the view: every other frame');
    assert.equal(R.animationStride(0, 0, -200, 3, camera), 4, 'a speck: every fourth');
    assert.equal(R.animationStride(0, 0, 30, 3, camera), 4, 'behind the eye: every fourth');
    assert.equal(R.animationStride(0, 0, 2, 3, camera), 1, 'right behind the eye it may still show: every frame');
    assert.equal(R.animationStride(0, 0, -80, 3, null), 1, 'no camera, no rule');
    // A narrow view (a long lens, the tactical view) makes the same body larger: it keeps its every frame.
    assert.equal(R.animationStride(0, 0, -80, 3, Object.assign({}, camera, { fov: 12 })), 1);
    // A unit in the tactical view (about 50 tiles off, 7% of the view's height) keeps every frame.
    assert.equal(R.animationStride(0, 0, -50, 3, Object.assign({}, camera, { fov: 45 })), 1);
    // The player's body and a model playing an action are always sampled; the rest take turns.
    const object = { position: { x: 0, y: 0, z: -80 } }, holder = {};
    assert.equal(R.animationDue({ action: {} }, {}, object, camera), true);
    let due = 0;
    for (let frame = 0; frame < 8; frame++) { due += new Function('Reactor3D', 'Graphics', '$gamePlayer', 'holder', 'object', 'camera', 'return Reactor3D.animationDue(holder, {}, object, camera);')(R, null, null, holder, object, camera) ? 1 : 0; }
    assert.ok(holder.strideAt > 0);
    assert.match(source, /holder\.rules\.length && Reactor3D\.animationDue\(holder, character, object, lodCamera\)\) \{/);
});

test('in a battle a lost mouse capture opens nothing: a line says how to take it back, and Escape is still the menu', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_fight_action.js'), 'utf8');
    // The map reads a lost capture as Escape; while an action battle runs that rule is held off every frame.
    assert.match(source, /if \(A\.relative\(\)\) look\.suppressMenuUntil = Math\.max\(look\.suppressMenuUntil \|\| 0, Date\.now\(\) \+ 600\);/);
    assert.match(source, /A\.mouseFree = A\.relative\(\) && !hold && !look\.locked/);
    // Escape itself: the capture let go within half a second of the key, either order.
    assert.match(source, /if \(live\(\) && Date\.now\(\) - \(A\._escapeAt \|\| 0\) < 500\) A\.callMenu\(\);/);
    // (Each press of it: the menu having been asked for once does not stop the next.)
    assert.match(source, /event\.type === "keyup" && Date\.now\(\) - \(A\._freedAt \|\| 0\) < 500 && Date\.now\(\) - \(A\._menuAsked \|\| 0\) > 500\) A\.callMenu\(\);/);
    // A battle kept running on a map the party has left does not keep the battle's keys on the next map.
    assert.match(source, /else if \(A\._entered && !\(fight && fight\.isAction\(\) && fight\.isHere\(\)\)\) \{ A\._entered = false;/);
    assert.match(source, /A\.promptText = "Click to take the mouse";/);
    assert.match(source, /mouseFree: false, notice: "" \};/);
    // The roof rules: a blow struck at arm's length needs its target within reach of height too.
    const A = world().ReactorFight.Action;
    assert.equal(A.LEVEL_REACH, 1.6);
    assert.equal(typeof A.climbSpots, 'function');
    assert.equal(typeof A.climbTo, 'function');
    assert.match(source, /dodged = A\.gap\(this, from, to\) > run\.reach \|\| A\.levelGap\(from, to\) > A\.LEVEL_REACH;/);
    assert.match(source, /ai\.kind === "melee" \? A\.levelGap\(character, to\) <= A\.LEVEL_REACH : sees \|\| !!ai\.lobbed\)/);
});

test('the driver\'s own pictures (its small HUD, the mouse line) are freed with their sprites', () => {
    const w = world({ events: [unit(1, 9, 9, 'enemy 1', facing(2))] });
    const A = w.ReactorFight.Action, freed = [];
    const picture = (name, own) => ({ _rrAction: own, destroy() { freed.push(name); } });
    const layer = { _bitmap: null, children: [{ _bitmap: picture('bar', true), children: [{ _bitmap: picture('text', true) }] }, { _bitmap: picture('skin', false) }] };
    A.freePictures(layer);
    A.freePictures(layer);
    A.freePictures(null);
    assert.deepEqual(freed, ['bar', 'text'], 'its own, once; nothing shared');
    const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../runtime/reactor_fight_action.js'), 'utf8');
    assert.equal((source.match(/new Bitmap\(/g) || []).length, 1, 'every picture the driver makes is one it frees');
    assert.equal((source.match(/freePictures\(this\.(sprite|layer)\);/g) || []).length, 3, 'the HUD, the mouse line and the notice line');
});

test('a tactical battle\'s keys: named actions on the ordinary keys by default, a project\'s own, given back exactly, nothing left held', () => {
    const file = path.join(__dirname, '..', '..', 'runtime', 'reactor_controls.js');
    const make = system => {
        const ctx = { Input: { keyMapper: { 33: 'pageup', 81: 'pageup', 34: 'pagedown', 17: 'control', 9: 'tab', 16: 'shift', 13: 'ok' },
            gamepadMapper: { 0: 'ok', 2: 'shift', 4: 'pageup', 5: 'pagedown' }, _currentState: { shift: true } }, $dataSystem: system || {} };
        vm.createContext(ctx);
        vm.runInContext('window = globalThis;', ctx);
        vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'reactor_controls.js' });
        return ctx;
    };
    const ctx = make(), C = ctx.ReactorControls;
    assert.equal(C.isTactical(), false);
    C.setTactical(true);
    assert.equal(C.isTactical(), true);
    // The ordinary keys' actions, and the view's own keys on W A S D and E, which nothing else used.
    assert.deepEqual({ ...ctx.Input.keyMapper }, { 33: 'viewLeft', 81: 'viewLeft', 34: 'viewRight', 69: 'viewRight', 87: 'panUp', 65: 'panLeft', 83: 'panDown', 68: 'panRight', 17: 'level', 9: 'unit', 16: 'skip', 13: 'ok' });
    assert.deepEqual({ ...ctx.Input.gamepadMapper }, { 0: 'ok', 2: 'skip', 4: 'viewLeft', 5: 'viewRight', 10: 'unit', 11: 'level' }, 'the level and the unit take R3 and L3');
    assert.equal(ctx.Input._currentState.shift, false, 'a key held across the change is let go');
    ctx.Input.keyMapper[34] = 'changed meanwhile';
    ctx.Input._currentState.skip = true;
    C.setTactical(false);
    assert.deepEqual({ ...ctx.Input.keyMapper }, { 33: 'pageup', 81: 'pageup', 34: 'changed meanwhile', 17: 'control', 9: 'tab', 16: 'shift', 13: 'ok' });
    assert.deepEqual({ ...ctx.Input.gamepadMapper }, { 0: 'ok', 2: 'shift', 4: 'pageup', 5: 'pagedown' });
    assert.equal(ctx.Input._currentState.skip, false);
    // A button that already does something is not taken for the level or the unit.
    const busy = make();
    busy.Input.gamepadMapper[11] = 'menu';
    busy.ReactorControls.setTactical(true);
    assert.equal(busy.Input.gamepadMapper[11], 'menu');
    assert.equal(busy.Input.gamepadMapper[10], 'unit');
    // A project's own keys and buttons: only those.
    const own = make({ reactorControls: { tacticalKeys: { 65: 'viewLeft', 68: 'viewRight' }, tacticalButtons: { 6: 'skip' } } });
    own.ReactorControls.setTactical(true);
    assert.equal(own.Input.keyMapper[65], 'viewLeft');
    assert.equal(own.Input.keyMapper[33], 'pageup', 'Page Up is no longer the view\'s');
    assert.equal(own.Input.gamepadMapper[6], 'skip');
    assert.equal(own.Input.gamepadMapper[4], 'pageup');
    own.ReactorControls.setTactical(false);
    assert.equal(own.Input.keyMapper[65], undefined);
});
