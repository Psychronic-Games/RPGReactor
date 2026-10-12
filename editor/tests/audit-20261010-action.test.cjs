'use strict';
// Audit of the Action and First Person battle driver (runtime/reactor_fight_action.js) and the Classic bridge
// (runtime/reactor_fight_classic.js), 2026-10-10: each test is a failure a player could meet, on a 2D map with
// no Reactor3D at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const facing = direction => ({ pages: [page({ image: { tileId: 0, characterName: '', characterIndex: 0, direction, pattern: 1 } })] });
const foe = (w, eventId) => w.$gameFight.unitOfEvent(eventId);

/** A world with weapon types and a few weapons, the enemy tough enough to take more than one blow. */
function world(options = {}) {
    const w = fightWorld(Object.assign({ action: true }, options));
    w.$dataSystem.weaponTypes = ['', 'Sword', 'Rifle', 'Pistol', 'Shotgun', 'Bow', 'Cannon', 'Dagger'];
    const weapon = (id, name, wtypeId, note = '') => ({ id, name, wtypeId, etypeId: 1, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], note, iconIndex: 96 + id, animationId: 0, price: 0, description: '' });
    w.$dataWeapons.push(weapon(1, 'Blade', 1), weapon(2, 'Rifle', 2), weapon(3, 'Pistol', 3), weapon(4, 'Scattergun', 4), weapon(5, 'Bow', 5),
        weapon(6, 'Launcher', 6), weapon(7, 'Knife', 7));
    for (let type = 1; type <= 7; type++) w.$dataClasses[1].traits.push({ code: 51, dataId: type, value: 1 });
    w.$dataEnemies[1].params[0] = 5000;
    w.$dataEnemies[2].params[0] = 5000;
    return w;
}
const equip = (w, weaponId, actorId = 1) => { w.$gameActors.actor(actorId).forceChangeEquip(0, weaponId ? w.$dataWeapons[weaponId] : null); return w.$gameActors.actor(actorId); };
function begin(w, options = {}) {
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'action' }, options)) > 0);
    w.run(3);
    return w.$gameFight;
}
/** Everyone but the player stands where it is. */
const still = w => { for (const u of w.$gameFight._units) if (u !== w.$gameFight.playerUnit()) w.$gameFight.act().ai[u.id] = Object.assign(w.ReactorFight.Action.aiOf(w.$gameFight, w.$gameFight.act(), u, w.$gameFight.character(u)), { state: 'stagger', timer: 100000 }); };
const state = (id, extra) => Object.assign({ id, name: 'State ' + id, restriction: 0, priority: 50, traits: [], removeAtBattleEnd: true, autoRemovalTiming: 0, minTurns: 1, maxTurns: 1,
    removeByDamage: false, chanceByDamage: 100, removeByRestriction: false, removeByWalking: false, stepsToRemove: 100, motion: 0, overlay: 0, note: '', iconIndex: 0,
    message1: '', message2: '', message3: '', message4: '' }, extra);

test('the next weapon comes to every weapon carried in turn, not back and forth between two', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    equip(w, 2);
    w.$gameParty.gainItem(w.$dataWeapons[1], 1);
    w.$gameParty.gainItem(w.$dataWeapons[3], 1);
    const fight = begin(w);
    still(w);
    const held = () => w.$gameActors.actor(1).weapons()[0].name;
    const seen = [held()];
    for (let i = 0; i < 3; i++) {
        assert.equal(fight.actionNextWeapon(1), true);
        seen.push(held());
        w.run(30);
    }
    assert.deepEqual(seen, ['Rifle', 'Pistol', 'Blade', 'Rifle'], 'forward through all three and round again');
    const back = [];
    for (let i = 0; i < 3; i++) {
        assert.equal(fight.actionNextWeapon(-1), true);
        back.push(held());
        w.run(30);
    }
    assert.deepEqual(back, ['Blade', 'Pistol', 'Rifle'], 'and the wheel the other way goes back through them');
    // A weapon the Database locks in the hand (Lock Equip) stays there.
    w.$dataActors[1].traits.push({ code: 53, dataId: 1, value: 1 });
    w.$gameActors.actor(1).refresh();
    assert.equal(w.$gameActors.actor(1).isEquipChangeOk(0), false);
    assert.equal(fight.actionNextWeapon(1), false);
    assert.equal(held(), 'Rifle');
});

test('a state that wears off when its actions end, and a buff, wear off in a battle with no turns', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    // As the stock Stun: cannot move, removed at Action End after one turn.
    w.$dataStates[2] = state(2, { name: 'Stun', restriction: 4, autoRemovalTiming: 1 });
    const fight = begin(w);
    still(w);
    const actor = w.$gameActors.actor(1), enemy = fight.battler(foe(w, 1));
    actor.addState(2);
    enemy.addState(2);
    actor.addBuff(2, 2);
    enemy.addDebuff(3, 2);
    assert.equal(w.$gamePlayer.canMove(), false, 'stunned');
    const A = w.ReactorFight.Action;
    w.run(A.TURN_FRAMES * 4);
    assert.equal(fight.isActive(), true);
    assert.equal(actor.isStateAffected(2), false, 'the player is not stunned for the rest of the battle');
    assert.equal(enemy.isStateAffected(2), false, 'nor an enemy');
    assert.equal(w.$gamePlayer.canMove(), true);
    assert.equal(actor.isBuffAffected(2), false, 'a two-turn buff has run out after four turns');
    assert.equal(enemy.isDebuffAffected(3), false, 'and a debuff');
});

/** A map scene the drivers can stand on, and Input's own key and button maps, there before the battle's files load. */
function withScene(ctx) {
    require('node:vm').runInContext(`
        Scene_Map = function Scene_Map() {};
        for (const name of ["update", "stop", "terminate", "start", "onMapLoaded", "checkGameover", "launchBattle", "createDisplayObjects"]) Scene_Map.prototype[name] = function() {};
        for (const name of ["isMapTouchOk", "isMenuEnabled"]) Scene_Map.prototype[name] = function() { return true; };
        for (const name of ["isMenuCalled", "isBusy"]) Scene_Map.prototype[name] = function() { return false; };
        Input.keyMapper = { 9: "tab", 13: "ok", 16: "shift", 27: "escape", 33: "pageup", 34: "pagedown", 81: "pageup", 87: "pagedown", 88: "escape", 90: "ok" };
        Input.gamepadMapper = { 0: "ok", 1: "cancel", 2: "shift", 3: "menu", 4: "pageup", 5: "pagedown", 12: "up", 13: "down", 14: "left", 15: "right" };
        Input._currentState = {};
    `, ctx);
}

test('another scene over an action battle has the ordinary keys and buttons: a pad\'s Cancel closes the menu', () => {
    const w = world({ controls: true, prepare: withScene, events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    const scene = () => { const s = new w.Scene_Map(); w.SceneManager._scene = s; return s; };
    const map = scene();
    const fight = begin(w);
    still(w);
    map.update();
    assert.equal(w.Input.gamepadMapper[1], 'dodge', 'in the battle B dodges');
    assert.equal(w.Input.gamepadMapper[9], 'menu', 'and Start opens the menu');
    // The menu opens: the map scene stops and ends.
    map.stop();
    map.terminate();
    assert.equal(w.Input.gamepadMapper[1], 'cancel', 'in the menu B is Cancel again');
    assert.equal(w.Input.gamepadMapper[5], 'pagedown');
    assert.equal(w.Input.keyMapper[81], 'pageup', 'and Q the previous actor');
    assert.equal(fight.isAction(), true, 'the battle is still on');
    // Back on the map the battle has its keys again.
    const back = scene();
    back.update();
    assert.equal(w.Input.gamepadMapper[1], 'dodge');
    assert.equal(w.Input.keyMapper[81], 'weapon');
    fight.end(1, true);
    w.run(5, () => !fight.isActive());
    back.update();
    assert.equal(fight.isActive(), false);
    assert.equal(w.Input.gamepadMapper[1], 'cancel');
    assert.equal(w.Input.gamepadMapper[9], undefined);
});

test('a locked opponent that changes sides is let go: a skill from the hotbar does not land on the new ally', () => {
    const w = world({ events: [unit(1, 4, 2, 'enemy 1', facing(2)), unit(2, 12, 9, 'enemy 1', facing(2)), unit(3, 17, 13, 'enemy 1', facing(2))] });
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Power Strike', stypeId: 1, damage: { critical: false, elementId: -1, formula: '500', type: 1, variance: 0 } });
    w.$gameActors.actor(1).learnSkill(3);
    const fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    w.run(2);
    assert.equal(fight.actionLock(), true);
    const turned = foe(w, 1), battler = fight.battler(turned);
    assert.equal(fight.act().player.lock, turned.id);
    fight.setEventSide(1, 'ally');
    assert.equal(turned.team, 'ally');
    // Used at once (a HUD's button between two frames), and again once the battle has had a frame.
    assert.equal(fight.actionUse(1), false, 'nobody in reach to use it on');
    w.run(2);
    assert.equal(fight.act().player.lock, 0, 'the lock is let go');
    assert.equal(fight.actionUse(1), false);
    w.run(60);
    assert.equal(battler.hp, battler.mhp, 'the ally is unhurt');
    // The other way round: an enemy that comes over while it winds up on the player does not finish the blow.
    const other = foe(w, 2), A = w.ReactorFight.Action, st = fight.act(), actor = w.$gameActors.actor(1), hp = actor.hp;
    fight.character(other).locate(w.$gamePlayer.x, w.$gamePlayer.y + 1);
    Object.assign(st.ai[other.id], { state: 'windup', timer: 3, targetId: fight.playerUnit().id, alert: true, skillId: 1, kind: 'melee', reach: 1.5 });
    fight.setEventSide(2, 'ally');
    assert.equal(fight._ending, null, 'an enemy is left: the battle goes on');
    w.run(40);
    assert.equal(st.ai[other.id].state !== 'windup', true, 'the wind-up ran out');
    assert.equal(actor.hp, hp, 'no blow from the new ally');
});

test('a unit that dies by anything but a blow falls like any other: it is defeated, fades and leaves the map', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2)), unit(2, 14, 9, 'enemy 2', facing(2))] });
    const fight = begin(w);
    still(w);
    const fallen = [];
    w.ReactorEvents.on('unitDefeated', payload => fallen.push(payload.eventId));
    // An event's command (Change Enemy State on the troop the battle keeps), not a blow.
    w.$gameTroop.members()[0].addState(1);
    w.run(2);
    assert.deepEqual(Array.from(fallen), [1], 'told the frame after, not at the next turn');
    assert.equal(foe(w, 1).defeated, true);
    w.run(200);
    assert.equal(w.$gameMap.event(1)._erased, true, 'it does not stand on the map as if alive');
    assert.equal(fight.isActive(), true, 'the other enemy still fights');
    // A party member an event knocks out and brings back can fall a second time.
    const member = fight._units.find(u => u.actorId === 2), actor = w.$gameActors.actor(2), follower = fight.character(member);
    actor.addState(1);
    w.run(3);
    assert.equal(member.defeated, true);
    assert.ok(follower._reactorFall > 0, 'it lies where it fell');
    actor.removeState(1);
    w.run(3);
    assert.equal(follower._reactorFall, 0, 'brought back, it stands');
    actor.addState(1);
    w.run(3);
    assert.ok(follower._reactorFall > 0, 'and falls again');
    // The last member of the party, the same way (poison on the walk): the battle is lost there and then.
    const lone = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    lone.$gameParty._actors = [1];
    lone.$gamePlayer.refresh();
    const lost = begin(lone, { canLose: true });
    still(lone);
    const results = [];
    lone.ReactorEvents.on('mapBattleEnd', payload => results.push(payload.result));
    lone.$gameActors.actor(1).addState(1);
    lone.run(5);
    assert.deepEqual(Array.from(results), [2], 'no wait for the turn to pass with the player unable to move');
    assert.equal(lost.isActive(), false);
});

test('an item that revives, on the hotbar: it gets a fallen friend up, and is not spent with nobody to use it on', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    w.$dataItems[3] = Object.assign({}, w.$dataItems[1], { id: 3, name: 'Revive', occasion: 0, scope: 9,
        effects: [{ code: 22, dataId: 1, value1: 1, value2: 0 }, { code: 11, dataId: 0, value1: 0.5, value2: 0 }] });
    w.$gameParty.gainItem(w.$dataItems[3], 2);
    const fight = begin(w);
    still(w);
    const slot = () => fight.actionHud().hotbar.findIndex(entry => entry.kind === 'item' && entry.name === 'Revive') + 1;
    assert.ok(slot() > 0, 'it is on the hotbar');
    // Nobody has fallen: nothing to use it on, and it stays in the bag.
    assert.equal(fight.actionUse(slot()), false);
    assert.equal(w.$gameParty.numItems(w.$dataItems[3]), 2);
    // A friend falls beside the player.
    const friend = w.$gameActors.actor(2), member = fight._units.find(u => u.actorId === 2), body = fight.character(member);
    body.locate(w.$gamePlayer.x + 1, w.$gamePlayer.y);
    friend.addState(1);
    w.run(3);
    assert.equal(friend.isDead(), true);
    assert.equal(fight.actionUse(slot()), true);
    w.run(60);
    assert.equal(w.$gameParty.numItems(w.$dataItems[3]), 1, 'one is spent');
    assert.equal(friend.isAlive(), true, 'and the friend is up');
    assert.ok(friend.hp > 1);
    assert.equal(fight.isAlive(member), true);
    assert.equal(body._reactorFall, 0, 'standing');
});

test('enemies felled as they wind up, and one that leaves, hold off nobody', () => {
    // Three beside the player and a fourth; every one strikes hard enough to show.
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(4)), unit(2, 2, 3, 'enemy 1', facing(8)), unit(3, 1, 2, 'enemy 1', facing(6)), unit(4, 2, 1, 'enemy 1', facing(2))] });
    const fight = begin(w), A = w.ReactorFight.Action, st = fight.act(), player = fight.playerUnit();
    // Followers out of the way and at rest: the player is the only one to strike at.
    for (const u of fight._units) if (u.party && u !== player) { fight.character(u).locate(18, 13); A.aiOf(fight, st, u, fight.character(u)); Object.assign(st.ai[u.id], { state: 'stagger', timer: 100000 }); }
    // Three of them are winding up on the player when they fall.
    for (const id of [1, 2, 3]) {
        const u = foe(w, id), ai = A.aiOf(fight, st, u, fight.character(u));
        Object.assign(ai, { state: 'windup', timer: 20, targetId: player.id, alert: true, skillId: 1, kind: 'melee', reach: 1.5 });
    }
    assert.equal(A.attackersOn(fight, st, player.id), 3);
    for (const id of [1, 2, 3]) fight.battler(foe(w, id)).addState(1);
    w.run(2);
    assert.equal(A.attackersOn(fight, st, player.id), 0, 'the fallen are winding up on nobody');
    // One that left the battle mid-blow, the same.
    const last = foe(w, 4), ai = A.aiOf(fight, st, last, fight.character(last));
    Object.assign(ai, { state: 'windup', timer: 20, targetId: player.id, alert: true, skillId: 1, kind: 'melee', reach: 1.5 });
    assert.equal(A.attackersOn(fight, st, player.id), 1);
    fight.removeUnit(last, true);
    assert.equal(A.attackersOn(fight, st, player.id), 0);
});

test('with three of its fellows felled mid-blow, an enemy beside the player still strikes', () => {
    const w = world({ events: [unit(1, 3, 2, 'enemy 1', facing(4)), unit(2, 2, 3, 'enemy 1', facing(8)), unit(3, 1, 2, 'enemy 1', facing(6)), unit(4, 2, 1, 'enemy 1', facing(2))] });
    const fight = begin(w), A = w.ReactorFight.Action, st = fight.act(), player = fight.playerUnit();
    for (const u of fight._units) if (u.party && u !== player) { fight.character(u).locate(18, 13); A.aiOf(fight, st, u, fight.character(u)); Object.assign(st.ai[u.id], { state: 'stagger', timer: 100000 }); }
    for (const id of [1, 2, 3]) {
        const u = foe(w, id);
        Object.assign(A.aiOf(fight, st, u, fight.character(u)), { state: 'windup', timer: 20, targetId: player.id, alert: true, skillId: 1, kind: 'melee', reach: 1.5 });
        fight.battler(u).addState(1);
    }
    const actor = w.$gameActors.actor(1), hp = actor.hp;
    w.run(600, () => actor.hp < hp);
    assert.ok(actor.hp < hp, 'the fourth attacks within ten seconds');
});

test('the click that closes a message is not an attack when the battle goes on', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    equip(w, 1);
    const fight = begin(w);
    still(w);
    const In = w.ReactorFight.Action.Input;
    const frame = () => { w.$gameMap.update(true); w.$gamePlayer.update(true); };
    w.$gameMessage.add('A battle page speaks.');
    frame();
    assert.equal(fight.isBusy(), true, 'the battle waits for the message');
    // The mouse: down and up on the message, and the wheel turned over it.
    In.left = true; In.leftEdge = true; In.wheel = 1;
    frame();
    In.left = false;
    w.$gameMessage.clear();
    frame();
    frame();
    assert.equal(fight.act().player.swing, null, 'no swing from that click');
    assert.equal(In.wheel, 0, 'nor a change of weapon from that turn of the wheel');
    // A click made while the battle runs still swings.
    In.left = true; In.leftEdge = true;
    frame();
    In.left = false;
    assert.ok(fight.act().player.swing, 'the battle\'s own click');
});

test('a page that runs when a unit enters an area runs in a battle with no turns: the player walks onto the spot', () => {
    const end = { code: 0, indent: 0, parameters: [] };
    const reach = page({ rrFightHook: { on: 'unitEnters', team: 'ally', x0: 4, y0: 2, x1: 4, y1: 2 }, list: [{ code: 121, indent: 0, parameters: [6, 6, 0] }, end] });
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2)), event(5, 18, 13, { pages: [page(), reach] })] });
    const fight = begin(w), A = w.ReactorFight.Action, st = fight.act();
    still(w);
    // The rest of the party stays where it is: only the player walks.
    for (const u of fight._units) if (u.party && u !== fight.playerUnit()) fight.character(u).locate(1, 13);
    w.run(2);
    assert.equal(w.$gameSwitches.value(6), false);
    for (let step = 0; step < 2; step++) {
        assert.equal(w.$gamePlayer.canMove(), true);
        w.$gamePlayer.moveStraight(6);
        w.run(20);
    }
    assert.deepEqual([w.$gamePlayer.x, w.$gamePlayer.y], [4, 2]);
    assert.equal(w.$gameSwitches.value(6), true, 'the page ran');
    assert.equal(fight.isActive(), true);
    // A goal that waits for that switch is met by walking there.
    const goal = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2)), event(5, 18, 13, { pages: [page(), reach] })] });
    const won = begin(goal, { objective: { type: 'switch', switchId: 6 } });
    still(goal);
    for (const u of won._units) if (u.party && u !== won.playerUnit()) won.character(u).locate(1, 13);
    const results = [];
    goal.ReactorEvents.on('mapBattleEnd', payload => results.push(payload.result));
    for (let step = 0; step < 2; step++) { goal.$gamePlayer.moveStraight(6); goal.run(20); }
    goal.run(60);
    assert.deepEqual(Array.from(results), [0], 'reach the place: won');
});

test('a shot in the air when the menu opens is drawn again on the map that comes back, not on the scene that is gone', () => {
    // The map scene as the engine has it: it draws its sprites once more as it ends, and its sprites end with it.
    const prepare = ctx => {
        withScene(ctx);
        require('node:vm').runInContext(`
            Spriteset_Map = function Spriteset_Map() {};
            Spriteset_Map.prototype.update = function() {};
            Scene_Map.prototype.terminate = function() { if (this._spriteset) this._spriteset.update(); };
        `, ctx);
    };
    const w = world({ prepare, events: [unit(1, 12, 2, 'enemy 1', facing(4))] });
    const A = w.ReactorFight.Action, made = [];
    // A stage that flies a shot as a sprite (a map without 3D). A sprite whose scene has ended cannot be placed.
    w.ReactorFight.Stage = {
        makeBody: () => null,
        makeSprite() {
            const sprite = { gone: false, at: 0, visible: false, rotation: 0, set x(value) { if (this.gone) throw new TypeError('Cannot set properties of null (setting \'x\')'); this.at = value; }, get x() { return this.at; }, y: 0 };
            made.push(sprite);
            return sprite;
        },
        screenOf(x, y, z, out) { out.x = x * 48; out.y = y * 48; out.visible = true; return out; },
        dropOverlay(entry) { if (entry.sprite) { entry.sprite.dropped = true; entry.sprite = null; } }
    };
    const scene = () => { const s = new w.Scene_Map(); s._spriteset = new w.Spriteset_Map(); w.SceneManager._scene = s; return s; };
    const frame = s => { w.run(1); s._spriteset.update(); s.update(); };
    equip(w, 5);
    const map = scene(), fight = begin(w);
    still(w);
    w.$gamePlayer.setDirection(6);
    frame(map);
    assert.equal(fight.actionAttack(), true);
    frame(map);
    assert.equal(fight.act().shots.length, 1, 'an arrow is in the air');
    assert.equal(made.length, 1);
    // The menu: the map scene ends, and its sprites with it.
    map.stop();
    map.terminate();
    assert.equal(made.every(sprite => sprite.dropped), true, 'what flew in that scene was taken out of it as it ended');
    for (const sprite of made) sprite.gone = true;
    // Back on the map the arrow is still in the air.
    const back = scene();
    assert.doesNotThrow(() => frame(back));
    assert.equal(fight.act().shots.length, 1);
    assert.equal(made.length, 2, 'and has a sprite of the scene it is seen in now');
    assert.equal(made[1].gone, false);
});

test('an enemy mid-blow still lands it as itself when another enemy leaves the battle', () => {
    const w = world({ events: [unit(1, 12, 9, 'enemy 1', facing(2)), unit(2, 3, 2, 'enemy 2', facing(4))] });
    // The one that strikes hits hard; the one that leaves would barely scratch.
    w.$dataEnemies[2].params[2] = 100;
    const fight = begin(w), A = w.ReactorFight.Action, st = fight.act(), player = fight.playerUnit();
    still(w);
    const leaver = foe(w, 1), striker = foe(w, 2), actor = w.$gameActors.actor(1), hp = actor.hp;
    assert.deepEqual(Array.from(w.$gameTroop.members()), [fight.battler(leaver), fight.battler(striker)]);
    // Its wind-up is over: the blow is on its way.
    Object.assign(st.ai[striker.id], { state: 'windup', timer: 1, targetId: player.id, alert: true, skillId: 1, kind: 'melee', reach: 1.5 });
    w.run(3);
    assert.equal(A.isActing(fight, striker.id), true);
    // A parallel event takes the other enemy out of the battle (Remove Unit).
    fight.removeUnit(leaver, true);
    assert.doesNotThrow(() => w.run(40));
    assert.equal(hp - actor.hp, Math.round((100 * 4 - 10 * 2) * A.PARTY_DAMAGE), 'the blow lands with its own strength (the party\'s share of it)');
});

test('in a battle on the map a turn is the battle\'s own: the party\'s steps do not end turns besides', () => {
    for (const tactical of [false, true]) {
        const w = world({ tactical, events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
        // Wears off at Turn End after five turns, and mends a tenth of the HP each turn.
        w.$dataStates[3] = state(3, { name: 'Mend', autoRemovalTiming: 2, minTurns: 5, maxTurns: 5, traits: [{ code: 22, dataId: 7, value: 0.1 }] });
        const actor = w.$gameActors.actor(1), enemy = () => w.$gameFight.battler(foe(w, 1));
        assert.ok(w.$gameFight.start({ mode: tactical ? 'tactical' : 'action' }) > 0);
        actor.addState(3);
        actor.setHp(100);
        enemy().addState(3);
        // Twenty steps, the walk that ends a turn on the map, with the battle's own clock stopped.
        w.$gameParty._steps = 19;
        w.$gameParty.increaseSteps();
        assert.equal(w.$gameParty.steps() % actor.stepsForTurn(), 0);
        w.$gameParty.onPlayerWalk();
        assert.equal(actor._stateTurns[3], 5, (tactical ? 'Tactical' : 'Action') + ': no turn of the state is spent by walking');
        assert.equal(actor.hp, 100, 'and nothing is mended by it');
        assert.equal(enemy()._stateTurns[3], 5);
        // Out of a battle the walk ends a turn as ever.
        w.$gameFight.end(1, true);
        w.run(10, () => !w.$gameFight.isActive());
        assert.equal(w.$gameFight.isActive(), false);
        actor.addState(3);
        actor.setHp(100);
        w.$gameParty._steps = 39;
        w.$gameParty.increaseSteps();
        w.$gameParty.onPlayerWalk();
        assert.equal(actor._stateTurns[3], 4, 'on the map, twenty steps are a turn');
        assert.equal(actor.hp, 100 + Math.floor(actor.mhp * 0.1));
    }
});

test('a shotgun in a friend\'s hands is one attack a blast, as in the player\'s: a pellet lands its share', () => {
    const w = world({ events: [unit(1, 9, 9, 'enemy 1', facing(4))] });
    equip(w, 4, 2);
    const fight = begin(w), A = w.ReactorFight.Action, st = fight.act();
    still(w);
    const friend = fight._units.find(u => u.actorId === 2), body = fight.character(friend), target = foe(w, 1), battler = fight.battler(target);
    body.locate(6, 9);
    body.setDirection(6);
    const blast = A.profile(w.$gameActors.actor(2));
    assert.equal(blast.pellets, 6);
    // Its wind-up is over: it fires at the enemy three tiles ahead.
    Object.assign(st.ai[friend.id], { state: 'windup', timer: 1, targetId: target.id, alert: true, skillId: 1, kind: 'shot', reach: 8 });
    w.run(40);
    const dealt = battler.mhp - battler.hp, attack = 60 * 4 - 5 * 2;
    assert.ok(dealt > 0, 'the blast lands');
    assert.ok(dealt <= attack * 1.05, `about one attack (${attack}) for the whole blast, not one a pellet: ${dealt}`);
});

test('the pause menu over a battle on the map does not offer what only a battle can aim: a bomb is not spent there for nothing', () => {
    const w = world({ prepare: withScene, events: [unit(1, 12, 9, 'enemy 1', facing(2))] });
    require('node:vm').runInContext('Scene_Item = function Scene_Item() {};', w);
    w.$gameParty.gainItem(w.$dataItems[2], 1);
    w.$gameParty.gainItem(w.$dataItems[1], 1);
    w.$dataSkills[3] = Object.assign({}, w.$dataSkills[1], { id: 3, name: 'Power Strike', stypeId: 1, occasion: 1 });
    const actor = w.$gameActors.actor(1), bomb = w.$dataItems[2], potion = w.$dataItems[1];
    actor.learnSkill(3);
    assert.equal(bomb.occasion, 1, 'the bomb is for battles only');
    w.SceneManager._scene = new w.Scene_Map();
    const fight = begin(w);
    still(w);
    assert.equal(actor.canUse(bomb), true, 'in the battle, on the map, it is usable (the hotbar)');
    assert.equal(actor.canUse(w.$dataSkills[3]), true);
    // The menu opens over the battle: its item list asks the same question.
    w.SceneManager._scene = new w.Scene_Item();
    assert.equal(fight.isHere(), true);
    assert.equal(w.$gameParty.canUse(bomb), false, 'the menu cannot aim it: not offered');
    assert.equal(actor.canUse(w.$dataSkills[3]), false, 'nor a skill for battles only');
    assert.equal(w.$gameParty.canUse(potion), true, 'what the menu can use anywhere stays');
    w.SceneManager._scene = new w.Scene_Map();
    assert.equal(actor.canUse(bomb), true);
});
