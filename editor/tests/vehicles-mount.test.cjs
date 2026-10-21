'use strict';
// Fighting from the saddle (runtime/reactor_vehicles_mount.js). A Tactical battle that starts while the party rides
// keeps each rider on its vehicle: the unit moves as the vehicle does, the vehicle goes where its rider goes, and a
// unit gets off and on as a command. Attack asks whose attack it is to be when the vehicle has one, and the
// vehicle's skills are listed after the rider's own; what the vehicle does it does with its own strength, MP and TP.
// The battle screen (Classic) has the same two lists.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { boardWorld, bike } = require('./helpers/vehicles-board-world.cjs');

const list = value => JSON.parse(JSON.stringify(value));

// The battle screen's windows and scene, as much of them as the vehicle file hooks: stood in the game's realm
// before it loads. The skill list records what it draws.
const SCREEN = `
    if (typeof ColorManager === "undefined") ColorManager = {};
    ColorManager.systemColor = () => "system";
    Window_ActorCommand = function() { this._list = []; this._actor = null; this._handlers = {}; };
    Window_ActorCommand.prototype.addCommand = function(name, symbol, enabled = true, ext = null) { this._list.push({ name, symbol, enabled, ext }); };
    Window_ActorCommand.prototype.addAttackCommand = function() { this.addCommand("Attack", "attack", this._actor.canAttack()); };
    Window_ActorCommand.prototype.makeCommandList = function() { this._list = []; this.addAttackCommand(); this.addCommand("Guard", "guard"); };
    Window_ActorCommand.prototype.currentSymbol = function() { return this._symbol || ""; };
    for (const name of ["activate", "deactivate", "hide", "show"]) Window_ActorCommand.prototype[name] = function() { this.last = name; };
    Window_SkillList = function(cols = 2) { this._actor = null; this._stypeId = 0; this._data = []; this._index = 0; this._cols = cols; this.drawn = []; };
    Window_SkillList.prototype.maxCols = function() { return this._cols; };
    Window_SkillList.prototype.includes = function(item) { return !!item && item.stypeId === this._stypeId; };
    Window_SkillList.prototype.setActor = function(actor) { this._actor = actor; };
    Window_SkillList.prototype.setStypeId = function(id) { this._stypeId = id; };
    Window_SkillList.prototype.makeItemList = function() { this._data = this._actor ? this._actor.skills().filter(item => this.includes(item)) : []; };
    Window_SkillList.prototype.isEnabled = function(item) { return !!this._actor && this._actor.canUse(item); };
    Window_SkillList.prototype.isCurrentItemEnabled = function() { return this.isEnabled(this._data[this.index()]); };
    Window_SkillList.prototype.index = function() { return this._index; };
    Window_SkillList.prototype.select = Window_SkillList.prototype.forceSelect = function(index) { this._index = index; };
    Window_SkillList.prototype.item = function() { return this._data[this._index] || null; };
    Window_SkillList.prototype.drawItem = function(index) { const skill = this._data[index]; if (skill) this.drawn.push([index, skill.name, this._actor.name(), this.isEnabled(skill), this._actor.skillMpCost(skill)]); };
    Window_SkillList.prototype.refresh = function() { this.drawn = []; this.makeItemList(); for (let i = 0; i < this._data.length; i++) this.drawItem(i); };
    Window_SkillList.prototype.itemLineRect = function() { return { x: 0, y: 0, width: 300, height: 36 }; };
    Window_SkillList.prototype.textWidth = function(text) { return String(text).length * 10; };
    Window_SkillList.prototype.drawText = function(text) { this.drawn.push(["text", String(text), this._paint]); };
    Window_SkillList.prototype.drawItemName = function(item) { this.drawn.push(["name", item.name, this._paint]); };
    Window_SkillList.prototype.changePaintOpacity = function(on) { this._paint = !!on; };
    for (const name of ["changeTextColor", "resetTextColor", "show", "hide", "activate", "deactivate"]) Window_SkillList.prototype[name] = function() { this.last = name; if (name === "show") this.visible = true; if (name === "hide") this.visible = false; };
    Window_BattleLog = function() { this.said = []; this.shown = []; };
    Window_BattleLog.prototype.displayAction = function(subject, item) { this.said.push(subject.name() + ": " + item.name); };
    Window_BattleLog.prototype.showAttackAnimation = function(subject) { this.shown.push(subject.name()); };
    Window_BattleLog.prototype.startAction = function(subject, action) { this.displayAction(subject, action.item()); this.showAttackAnimation(subject); };
    Window_BattleLog.prototype.endAction = function() {};
    Scene_Battle.prototype.commandAttack = function() { BattleManager.inputtingAction().setAttack(); this.onSelectAction(); };
    Scene_Battle.prototype.commandSkill = function() { this._skillWindow.setActor(BattleManager.actor()); this._skillWindow.setStypeId(1); this._skillWindow.refresh(); };
    Scene_Battle.prototype.commandGuard = function() { BattleManager.inputtingAction().setGuard(); };
    Scene_Battle.prototype.commandItem = function() {};
    Scene_Battle.prototype.onSkillOk = function() { const skill = this._skillWindow.item(); BattleManager.inputtingAction().setSkill(skill.id); BattleManager.actor().setLastBattleSkill(skill); this.onSelectAction(); };
    Scene_Battle.prototype.onSelectAction = function() { this.selected = (this.selected || 0) + 1; };
    Scene_Battle.prototype.onEnemyCancel = function() { this._actorCommandWindow.activate(); };
    Scene_Battle.prototype.onActorCancel = function() {};
`;

function world(extra = {}) {
    const w = boardWorld(Object.assign({ width: 60, height: 30, party: [1, 2, 3], vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 12, 12, { yaw: 180 })],
        before(ctx) { vm.runInContext(SCREEN, ctx, { filename: 'battle-screen' }); },
        prepare(data, w) {
            Object.assign(w.$dataReactorVehicles[1], { classId: 1, initialLevel: 2, equips: [1] });
            w.$dataSystem.equipTypes = ['', 'Gun', 'Armor'];
            w.$dataClasses[1].traits = [{ code: 51, dataId: 1, value: 1 }, { code: 52, dataId: 1, value: 1 }];
            w.$dataWeapons[1] = { id: 1, name: 'Gun', wtypeId: 1, etypeId: 1, params: [0, 0, 30, 0, 0, 0, 0, 0], traits: [], note: '', iconIndex: 0, animationId: 1 };
        } }, extra));
    if (!w.hasAboard) w.stubAboard();
    w.F = w.ReactorFight;
    return w;
}

/** The party rides (the leader on 31, the first follower on 32, the second on foot) and a Tactical battle starts. */
function begin(w, options = {}) {
    w.stand(11, 10, 4);
    assert.equal(w.board(31), true);
    assert.equal(w.V.Convoy.riders().length, 1, 'one follower took the other vehicle');
    assert.ok(w.$gameFight.start(Object.assign({ mode: 'tactical', troopId: 1 }, options)) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    assert.equal(w.$gameFight.awaitsPlayer(), true);
    return w.$gameFight;
}

/** The turn of unit `id`, at its menu. */
function menuOf(w, id) {
    const fight = w.$gameFight;
    if (fight._act.stage === 'pick') assert.equal(fight.commandSelectUnit(id), true);
    assert.equal(fight._act.unitId, id);
    const c = fight.character(fight.unit(id));
    if (fight._act.stage === 'move') assert.equal(fight.commandMoveTo(c.x, c.y), true);
    assert.equal(fight._act.stage, 'command');
    return fight.unit(id);
}
const symbols = (fight, unit) => Array.from(fight.mountCommands(unit), row => row.symbol + (row.enabled ? '' : ' (off)'));

test('a Tactical battle started aboard keeps the party in the saddle: each rider\'s unit names its vehicle and moves as it does', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), F = w.F;
    assert.deepEqual([p._vehicleType, p._rrFree, w.V.idOf(w.V.ridden())], ['reactor', 0, '1:31'], 'riding, and nothing drives it');
    const party = Array.from(fight._units).filter(unit => unit.party);
    assert.deepEqual(party.map(unit => unit.mount || 0), [31, 32, 0]);
    // 20 tiles a second at 0.4 of a tile each: 8. On foot, the battle's own 4.
    assert.deepEqual(party.map(unit => F.moveOf(unit)), [8, 8, 4]);
    assert.deepEqual(party.map(unit => F.jumpOf(unit)), [0, 0, F.jumpOf(party[2])], 'a vehicle climbs nothing');
    assert.deepEqual([w.vehicle(31)._rrBoarded, w.vehicle(32)._rrBoarded], [true, true]);
    const walker = fight.character(party[2]);
    assert.deepEqual([!!walker._rrAboard, !!walker._rrSeated, walker.opacity()], [false, false, 255], 'the one with no vehicle stands in the battle, seen');
    // The vehicle's own setting wins: its class's.
    w.$dataClasses[1].note = '<move: 6>';
    w.$dataClasses[1].meta = { move: ' 6' };
    assert.equal(w.V.Mount.moveOf(w.vehicle(31)), 6);
});

test('the vehicle goes where its rider goes, and its wheels turn by the way it came', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), e = w.vehicle(31);
    assert.equal(fight.commandSelectUnit(1), true);
    assert.equal(fight._act.stage, 'move');
    const far = fight.moveCells().filter(cell => Math.abs(cell.x - p.x) + Math.abs(cell.y - p.y) === 6 && cell.x > p.x)[0];
    assert.ok(far, 'six tiles off is in a vehicle\'s reach');
    const rolled = e._rrTravel || 0;
    assert.equal(fight.commandMoveTo(far.x, far.y, far.h), true);
    w.run(600, () => fight._act && fight._act.stage === 'command');
    assert.deepEqual([p.x, p.y], [far.x, far.y]);
    assert.deepEqual([e._realX, e._realY, e._x, e._y], [p._realX, p._realY, far.x, far.y], 'under its rider');
    assert.ok(Math.abs((e._rrTravel || 0) - rolled - 6) < 0.75, `six tiles rolled: ${(e._rrTravel || 0) - rolled}`);
    assert.deepEqual([e._through, e._rrBoarded, p._vehicleType, p._rrFree], [true, true, 'reactor', 0]);
});

test('Dismount leaves the vehicle parked and in the way; Mount takes it again', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), F = w.F, e = w.vehicle(31);
    const unit = menuOf(w, 1);
    assert.deepEqual(symbols(fight, unit), ['dismount'], 'the one row a vehicle adds');
    assert.equal(fight.commandReason('attack'), 'whyNoReach', 'neither its own attack nor the vehicle\'s reaches anybody from here');
    assert.equal(fight.commandDismount(), true);
    assert.deepEqual([p._vehicleType, unit.mount, e._rrBoarded, e._through, e._rrFree], ['walk', 0, false, false, 1]);
    assert.equal(Math.max(Math.abs(p.x - e._x), Math.abs(p.y - e._y)), 1, 'on a cell beside it');
    assert.equal(F.moveOf(unit), 4, 'on foot it moves as it walks');
    assert.equal(fight.cellTaken(e._x, e._y), true, 'the parked vehicle is in the way');
    assert.deepEqual([fight._act.stage, fight._act.moved, fight._act.locked], ['command', true, true], 'getting off was its move; it may still act');
    assert.deepEqual(symbols(fight, unit), ['mount']);
    assert.equal(fight.commandMount(), true);
    assert.deepEqual([p._vehicleType, unit.mount, e._rrBoarded, w.V.idOf(w.V.ridden())], ['reactor', 31, true, '1:31']);
    assert.deepEqual([p.x, p.y], [e._x, e._y]);
    assert.equal(F.moveOf(unit), 8);
    // A follower does the same with its own, and takes nobody else with it.
    assert.equal(fight.commandWait(), true);
    w.run(600, () => fight.awaitsPlayer());
    const second = menuOf(w, 2), follower = fight.character(second), other = w.vehicle(32);
    assert.equal(fight.commandDismount(), true);
    assert.deepEqual([second.mount, follower._rrSeated, follower._rrRide, other._rrBoarded, other._through], [0, false, null, false, false]);
    assert.deepEqual([p._vehicleType, unit.mount], ['reactor', 31], 'the leader rides on');
    assert.equal(fight.commandMount(), true);
    assert.deepEqual([second.mount, follower._rrSeated, list(follower._rrRide), other._rrBoarded], [32, true, { map: 1, id: 32 }, true]);
});

test('Attack by one who rides a vehicle that can attack asks whose attack: the vehicle\'s is made with its strength', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), battler = w.V.battler(31), leader = w.$gameParty.leader();
    assert.equal(fight.commandSelectUnit(1), true);
    // Beside an enemy.
    const foe = fight._units.find(unit => unit.team === 'enemy'), at = fight.character(foe);
    const cell = fight.moveCells().find(c => Math.abs(c.x - at.x) + Math.abs(c.y - at.y) === 1);
    assert.ok(cell, 'a cell beside the enemy is in reach');
    assert.equal(fight.commandMoveTo(cell.x, cell.y, cell.h), true);
    w.run(600, () => fight._act && fight._act.stage === 'command');
    const unit = fight.unit(1);
    assert.deepEqual(symbols(fight, unit), ['dismount']);
    assert.equal(fight.commandReason('attack'), '');
    assert.equal(fight.vehicleAttacker(unit), battler);
    assert.equal(fight.actingBattler(unit, 'vehicle'), battler);
    assert.equal(fight.actingBattler(unit), leader);
    // Attack opens the list of the two attacks.
    assert.equal(fight.commandAttack(), true);
    assert.deepEqual([fight._act.stage, fight._act.pick], ['skill', 'attack']);
    const rows = new w.Window_SkillList(1);
    rows.setActor(leader);
    fight.rideList(rows, unit);
    rows.refresh();
    assert.deepEqual(Array.from(rows._data, skill => skill.id), [leader.attackSkillId(), battler.attackSkillId()]);
    assert.deepEqual(list(rows._rrVias), ['', 'vehicle']);
    assert.deepEqual(list(rows.drawn.filter(row => row[0] === 'name' || row[0] === 'text')),
        [['name', w.$dataSkills[leader.attackSkillId()].name, true], ['text', leader.name(), true], ['name', 'Gun', true], ['text', 'Motorcycle', true]], 'each by its weapon, and whose it is');
    assert.deepEqual([w.V.Mount.rowEnabled(rows, 0), w.V.Mount.rowEnabled(rows, 1)], [true, true]);
    const subjects = [];
    const apply = w.Game_Action.prototype.apply;
    w.Game_Action.prototype.apply = function(target) { subjects.push(this.subject()); return apply.call(this, target); };
    assert.equal(fight.commandSkill(battler.attackSkillId(), 'vehicle'), true);
    assert.deepEqual([fight._act.stage, list(fight._act.item)], ['target', { kind: 'skill', id: battler.attackSkillId(), via: 'vehicle' }]);
    // Back from the target is the two attacks again; back from them, the menu.
    assert.equal(fight.commandCancel(), true);
    assert.deepEqual([fight._act.stage, fight._act.pick], ['skill', 'attack']);
    assert.equal(fight.commandCancel(), true);
    assert.deepEqual([fight._act.stage, fight._act.pick], ['command', undefined]);
    assert.equal(fight.commandAttack(), true);
    assert.equal(fight.commandSkill(battler.attackSkillId(), 'vehicle'), true);
    assert.equal(fight.commandTarget(at.x, at.y), true);
    w.run(900, () => subjects.length > 0);
    w.Game_Action.prototype.apply = apply;
    assert.ok(subjects.length > 0, 'the attack landed');
    assert.equal(subjects[0], battler, 'the vehicle is the one that attacks');
    assert.deepEqual([p._vehicleType, unit.mount], ['reactor', 31]);
});

test('a skill list for one who rides: its own skills, then the vehicle\'s under its name and what it has to spend', () => {
    const w = world(), fight = begin(w), battler = w.V.battler(31), leader = w.$gameParty.leader();
    w.$dataSkills[90] = Object.assign({}, w.$dataSkills[1], { id: 90, name: 'Boost', stypeId: 2, mpCost: 5, tpCost: 0, scope: 11, occasion: 0 });
    w.$dataSkills[91] = Object.assign({}, w.$dataSkills[1], { id: 91, name: 'Cut', stypeId: 1, mpCost: 3, tpCost: 0, scope: 1, occasion: 0 });
    battler.learnSkill(90);
    leader.learnSkill(91);
    battler._mp = 4; leader._mp = 30;
    const unit = menuOf(w, 1);
    assert.equal(fight.commandOpenSkills(), true);
    for (const cols of [1, 2]) {
        const rows = new w.Window_SkillList(cols);
        rows.setActor(leader);
        rows.setStypeId(1);
        fight.rideList(rows, unit);
        rows.refresh();
        const names = Array.from(rows._data, item => (item ? item.rrRideHeader || item.name : null));
        const own = Array.from(leader.skills()).filter(skill => skill.stypeId === 1).map(skill => skill.name);
        const padded = own.slice();
        while (padded.length % cols) padded.push(null);
        assert.deepEqual(names, padded.concat(cols > 1 ? ['name', 'stats', 'Boost'] : ['name', 'Boost']), `${cols} column(s): the vehicle's begin a row of their own`);
        const boost = names.indexOf('Boost'), cut = names.indexOf('Cut'), header = names.indexOf('name');
        assert.deepEqual([w.V.Mount.viaAt(rows, cut), w.V.Mount.viaAt(rows, boost)], ['', 'vehicle']);
        // Each row is read for the one whose skill it is: the vehicle cannot pay for Boost, the rider can pay for Cut.
        assert.deepEqual(list(rows.drawn.find(row => row[0] === boost)), [boost, 'Boost', 'Motorcycle', false, 5]);
        assert.deepEqual(list(rows.drawn.find(row => row[0] === cut)), [cut, 'Cut', leader.name(), true, 3]);
        assert.ok(rows._actor === leader, 'the list is the rider\'s again once drawn');
        assert.deepEqual([w.V.Mount.rowEnabled(rows, boost), w.V.Mount.rowEnabled(rows, cut), w.V.Mount.rowEnabled(rows, header)], [false, true, false]);
        rows.select(header);
        assert.equal(rows.isCurrentItemEnabled(), false, 'its name is no choice');
        const texts = rows.drawn.filter(row => row[0] === 'text').map(row => row[1]);
        assert.ok(texts.includes('Motorcycle'));
        assert.ok(texts.some(text => text.includes(String(battler.mp)) && text.includes(w.TextManager.mpA)), 'its MP is shown: ' + texts.join(' | '));
    }
    // The vehicle's skill, chosen: used by the vehicle.
    battler._mp = 20;
    assert.equal(fight.commandSkill(90, 'vehicle'), true);
    assert.deepEqual(list(fight._act.item), { kind: 'skill', id: 90, via: 'vehicle' });
    assert.equal(fight.commandCancel(), true);
    assert.equal(fight.commandSkill(90), false, 'not the rider\'s to use');
    // On foot the list is the unit's own.
    assert.equal(fight.commandCancel(), true);
    assert.equal(fight.commandDismount(), true);
    const rows = new w.Window_SkillList(1);
    rows.setActor(leader);
    rows.setStypeId(1);
    fight.rideList(rows, unit);
    rows.refresh();
    assert.equal(rows._rrVias, null);
    assert.equal(Array.from(rows._data).some(item => item && (item.rrRideHeader || item.id === 90)), false);
});

test('when the battle ends the leader rides on, and one who got off is back on the vehicle it left', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w);
    const second = menuOf(w, 2), follower = fight.character(second);
    assert.equal(fight.commandDismount(), true);
    assert.equal(follower._rrSeated, false);
    fight.end(w.F.WIN, true);
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.deepEqual([p._vehicleType, p._rrFree, w.V.idOf(w.V.ridden())], ['reactor', 1, '1:31'], 'driven again');
    assert.deepEqual([follower._rrSeated, list(follower._rrRide), follower._rrFree, w.vehicle(32)._rrBoarded, w.vehicle(32)._rrFree], [true, { map: 1, id: 32 }, 1, true, 2]);
    assert.equal(w.V.Convoy.riders().length, 1);
});

test('a leader who ends the battle on foot leaves every vehicle where it stands', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w);
    menuOf(w, 1);
    assert.equal(fight.commandDismount(), true);
    fight.end(w.F.WIN, true);
    w.run(600, () => !fight.isActive());
    assert.deepEqual([p._vehicleType, w.V.ridden(), w.V.Convoy.riders().length], ['walk', null, 0]);
    assert.deepEqual([w.vehicle(31)._rrBoarded, w.vehicle(32)._rrBoarded, w.vehicle(32)._through], [false, false, false]);
});

test('an Action battle still puts the party on foot', () => {
    const w = world({ action: true }), p = w.$gamePlayer;
    w.stand(11, 10, 4);
    assert.equal(w.board(31), true);
    assert.equal(w.V.Mount.keeps({ mode: 'action' }), false);
    assert.equal(w.V.Mount.keeps({ mode: 'tactical' }), true);
    assert.ok(w.$gameFight.start({ mode: 'action', troopId: 1 }) > 0);
    assert.deepEqual([p._vehicleType, w.vehicle(31)._rrBoarded], ['walk', false]);
    assert.equal(w.$gameFight._units.some(unit => unit.mount > 0), false);
});

/** Puts an enemy's unit on the cell west of (x, y), and answers it. */
function foeBeside(w, x, y) {
    const fight = w.$gameFight, foe = fight._units.find(unit => unit.team === 'enemy');
    vm.runInContext('(function(c, x, y) { Game_CharacterBase.prototype.locate.call(c, x, y); })', w)(fight.character(foe), x - 1, y);
    fight.touch();
    return foe;
}
const ids = units => Array.from(units, unit => unit.id);

test('a rider and its vehicle are two on one cell: an action for one lands on one of them, an action for an area on both', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), battler = w.V.battler(31), leader = w.$gameParty.leader();
    w.$dataSkills[92] = Object.assign({}, w.$dataSkills[1], { id: 92, name: 'Sweep', stypeId: 1, mpCost: 0, tpCost: 0, scope: 2, occasion: 0 });
    const foe = foeBeside(w, p.x, p.y), attack = fight.battler(foe).attackSkillId();
    const vehicle = fight.unit(-31);
    assert.deepEqual([vehicle.vehicle, vehicle.eventId, vehicle.team, fight.battler(vehicle) === battler, fight.character(vehicle) === w.vehicle(31)], [true, 31, 'ally', true, true]);
    assert.equal(fight.vehicleRider(vehicle), fight.unit(1));
    assert.equal(fight._units.includes(vehicle), false, 'no unit of the battle\'s: it has no turn and holds no cell');
    // Nobody chose: the one with the lesser share of its life left, the rider at a tie.
    assert.deepEqual(ids(fight.targetsOf(foe, 'skill', attack, p.x, p.y)), [1]);
    battler.setHp(Math.floor(battler.mhp / 2));
    assert.deepEqual(ids(fight.targetsOf(foe, 'skill', attack, p.x, p.y)), [-31]);
    leader.setHp(1);
    assert.deepEqual(ids(fight.targetsOf(foe, 'skill', attack, p.x, p.y)), [1]);
    // An area takes both.
    const swept = ids(fight.targetsOf(foe, 'skill', 92, p.x, p.y));
    assert.ok(swept.includes(1) && swept.includes(-31), 'both under the area: ' + swept);
    // The blow lands on the vehicle: its life, not its rider's.
    battler.setHp(battler.mhp); leader.setHp(leader.mhp); battler.gainHp(-1);
    const blow = new w.Game_Action(fight.battler(foe));
    blow.setSkill(attack);
    const run = w.F.makeRun(fight, foe, blow, fight.targetsOf(foe, 'skill', attack, p.x, p.y));
    assert.deepEqual(list(run.targetIds), [-31]);
});

test('one kept inside its vehicle is behind it: the other side\'s actions land on the vehicle', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), battler = w.V.battler(31), leader = w.$gameParty.leader();
    w.$dataSkills[92] = Object.assign({}, w.$dataSkills[1], { id: 92, name: 'Sweep', stypeId: 1, mpCost: 0, tpCost: 0, scope: 2, occasion: 0 });
    w.$dataSkills[93] = Object.assign({}, w.$dataSkills[1], { id: 93, name: 'Mend', stypeId: 1, mpCost: 0, tpCost: 0, scope: 7, occasion: 0, damage: Object.assign({}, w.$dataSkills[1].damage, { type: 3 }) });
    w.$dataReactorVehicles[1].rider = 'inside';
    const foe = foeBeside(w, p.x, p.y), attack = fight.battler(foe).attackSkillId();
    assert.equal(fight.isShielded(fight.unit(1)), true);
    leader.setHp(1);
    assert.deepEqual(ids(fight.targetsOf(foe, 'skill', attack, p.x, p.y)), [-31], 'however little life the rider has left');
    const swept = ids(fight.targetsOf(foe, 'skill', 92, p.x, p.y));
    assert.ok(swept.includes(-31) && !swept.includes(1), 'an area too: ' + swept);
    // Its own side still reaches it.
    assert.deepEqual(ids(fight.targetsOf(fight.unit(3), 'skill', 93, p.x, p.y)), [1]);
    // The vehicle falls: nothing stands between.
    battler.setHp(0);
    assert.equal(fight.isShielded(fight.unit(1)), false);
});

test('an action for one aimed where a rider and its vehicle are asks whose it is to be', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), battler = w.V.battler(31), leader = w.$gameParty.leader();
    w.$dataSkills[93] = Object.assign({}, w.$dataSkills[1], { id: 93, name: 'Mend', stypeId: 1, mpCost: 0, tpCost: 0, scope: 7, occasion: 0, damage: Object.assign({}, w.$dataSkills[1].damage, { type: 3 }) });
    const healer = fight.battler(fight.unit(3));
    healer.learnSkill(93);
    battler.setHp(1);
    menuOf(w, 3);
    assert.equal(fight.commandSkill(93), true);
    assert.equal(fight._act.stage, 'target');
    assert.deepEqual(ids(fight.targetPair(p.x, p.y)), [1, -31]);
    assert.equal(fight.commandTarget(p.x, p.y), true);
    assert.deepEqual([fight._act.stage, fight._act.pick, fight._run], ['skill', 'whom', null], 'nothing has begun');
    // The list names the two, each with its life.
    const rows = new w.Window_SkillList(1);
    rows.setActor(healer);
    fight.rideList(rows, fight.unit(3));
    rows.refresh();
    assert.deepEqual(Array.from(rows._data, item => item.rrWhom), ['rider', 'vehicle']);
    const texts = rows.drawn.filter(row => row[0] === 'text').map(row => row[1]);
    assert.ok(texts.includes(leader.name()) && texts.includes('Motorcycle'), texts.join(' | '));
    assert.ok(texts.some(text => text.includes(battler.hp + '/' + battler.mhp)));
    assert.deepEqual([w.V.Mount.rowEnabled(rows, 0), w.V.Mount.rowEnabled(rows, 1)], [true, true]);
    // Back is the aim again; then the vehicle is chosen.
    assert.equal(fight.commandCancel(), true);
    assert.deepEqual([fight._act.stage, fight._act.pick, fight._act.whom], ['target', undefined, undefined]);
    assert.equal(fight.commandTarget(p.x, p.y), true);
    assert.equal(fight.commandWhom('vehicle'), true);
    assert.deepEqual(list(fight._run.targetIds), [-31]);
    assert.deepEqual([fight._act.pick, fight._act.whom], [undefined, undefined]);
});

test('a vehicle whose life is gone is a wreck: its rider is put off it, nobody rides it, and one that is brought back stands', () => {
    const w = world(), p = w.$gamePlayer, fight = begin(w), battler = w.V.battler(31), e = w.vehicle(31), F = w.F;
    const unit = menuOf(w, 1), vehicle = fight.unit(-31);
    battler.setHp(0);
    battler.refresh();
    fight.defeat(vehicle);
    assert.deepEqual([vehicle.defeated, p._vehicleType, unit.mount, e._rrBoarded, e._rrWreck], [true, 'walk', 0, false, true]);
    assert.ok(Math.abs(e._rrLean) > 1, 'a motorcycle lies on its side');
    assert.equal(Math.max(Math.abs(p.x - e._x), Math.abs(p.y - e._y)), 1, 'its rider beside it');
    assert.deepEqual(symbols(fight, unit), [], 'a wreck is not ridden');
    assert.equal(F.moveOf(unit), 4);
    // A revival lands on it: it stands, and is ridden again.
    w.$dataSkills[94] = Object.assign({}, w.$dataSkills[1], { id: 94, name: 'Raise', stypeId: 1, mpCost: 0, tpCost: 0, scope: 9, occasion: 0 });
    assert.deepEqual(ids(fight.targetsOf(fight.unit(3), 'skill', 94, e._x, e._y)), [-31], 'the fallen of its side: the wreck');
    battler.setHp(10);
    fight.afterHit({}, [vehicle]);
    assert.deepEqual([vehicle.defeated, e._rrWreck, e._rrLean], [false, false, 0]);
    assert.deepEqual(symbols(fight, unit), ['mount']);
    // Wrecked again and the battle won: mended as the fallen are.
    battler.setHp(0);
    fight.defeat(vehicle);
    fight.end(F.WIN, true);
    w.run(600, () => !fight.isActive());
    assert.deepEqual([battler.hp, e._rrWreck], [1, false]);
});

test('one who falls goes to the ground and lies there, out of the saddle, until it is brought back', () => {
    const w = world(), fight = begin(w), F = w.F;
    const second = fight.unit(2), follower = fight.character(second), battler = fight.battler(second), other = w.vehicle(32);
    battler.setHp(0);
    fight.defeat(second);
    assert.deepEqual([second.defeated, second.mount, !!follower._rrSeated, other._rrBoarded, other._through], [true, 0, false, false, true]);
    assert.equal(follower._reactorFall, 1);
    w.run(F.FALL_FRAMES + 4);
    assert.equal(follower._reactorPosePitch, 1, 'flat on the ground');
    w.run(200);
    assert.equal(follower._reactorPosePitch, 1, 'and it stays: a body, not a gap');
    assert.equal(follower.isVisible(), true);
    // Brought back: it stands.
    battler.setHp(5);
    w.run(3);
    assert.deepEqual([follower._reactorPosePitch, follower._reactorFall, second.defeated], [0, 0, false]);
});

/** The battle screen with its windows, the party riding (the leader on 31, the first follower on 32, the second on foot). */
function screen(w) {
    w.stand(11, 10, 4);
    assert.equal(w.board(31), true);
    w.$gameParty._inBattle = true;
    const scene = new w.Scene_Battle();
    scene._actorCommandWindow = new w.Window_ActorCommand();
    scene._skillWindow = new w.Window_SkillList(2);
    scene._statusWindow = { hide() { this.shown = false; }, show() { this.shown = true; } };
    return scene;
}
/** `actor` is the one choosing, with a fresh action. */
function choosing(w, actor) {
    actor.clearActions();
    actor.setAction(0, new w.Game_Action(actor));
    w.BattleManager.actor = () => actor;
    w.BattleManager.inputtingAction = () => actor.action(0);
    return actor.action(0);
}

test('on the battle screen an actor who rides keeps the stock commands: Attack asks whose attack', () => {
    const w = world(), M = w.V.Mount, party = Array.from(w.$gameParty.battleMembers()), scene = screen(w);
    assert.deepEqual(party.map(actor => { const e = M.rideOf(actor); return e ? e._eventId : 0; }), [31, 32, 0]);
    const battler = w.V.battler(31), win = scene._actorCommandWindow, rows = scene._skillWindow;
    assert.equal(M.battlerOf(party[0]), battler);
    assert.equal(M.battlerOf(party[2]), null);
    assert.equal(M.attackerOf(party[0]), battler);
    win._actor = party[0];
    win.makeCommandList();
    assert.deepEqual(Array.from(win._list, row => [row.symbol, row.enabled]), [['attack', true], ['guard', true]], 'no row is added');
    // One who cannot attack for himself can still choose Attack while his vehicle can.
    const canAttack = party[0].canAttack;
    party[0].canAttack = () => false;
    win.makeCommandList();
    assert.equal(win._list[0].enabled, true);
    party[0].canAttack = canAttack;
    // Attack: the two attacks are listed, each by its weapon and whose it is.
    let action = choosing(w, party[0]);
    win._symbol = 'attack';
    scene.commandAttack();
    assert.equal(scene.selected, undefined, 'nothing is chosen yet');
    assert.deepEqual([rows.last, list(rows._rrVias), rows._data.length], ['activate', ['', 'vehicle'], 2]);
    assert.deepEqual(list(rows.drawn.filter(row => row[0] === 'name').map(row => row[1])), [w.$dataSkills[party[0].attackSkillId()].name, 'Gun']);
    rows.select(1);
    scene.onSkillOk();
    assert.deepEqual([action._rrVehicleSubject, action.item().id, action.subject() === battler, scene.selected], ['1:31', battler.attackSkillId(), true, 1]);
    // Backing out of the target is the two attacks again.
    scene.onEnemyCancel();
    assert.deepEqual([win.last, rows.last, scene._statusWindow.shown], ['deactivate', 'activate', false]);
    rows.select(0);
    scene.onSkillOk();
    assert.deepEqual([action._rrVehicleSubject, action.subject() === party[0]], ['', true], 'his own attack is his own');
    // On foot, and aboard a wreck: Attack is the stock command.
    for (const actor of [party[2], party[0]]) {
        if (actor === party[0]) battler.addState(battler.deathStateId());
        action = choosing(w, actor);
        scene.selected = 0;
        scene.commandAttack();
        assert.deepEqual([scene.selected, action._rrVehicleSubject, rows._rrRide], [1, '', null]);
    }
    battler.revive();
    // A battle on the map has units of its own: nobody rides by this rule there.
    w.$gameParty._inBattle = false;
    assert.ok(w.$gameFight.start({ mode: 'tactical', troopId: 1 }) > 0);
    assert.equal(M.rideOf(party[0]), null);
});

test('on the battle screen the vehicle\'s skills follow the actor\'s own, and what the vehicle does it is named for and pays for', () => {
    const w = world(), party = Array.from(w.$gameParty.battleMembers()), leader = party[0], BM = w.BattleManager, scene = screen(w);
    const battler = w.V.battler(31), rows = scene._skillWindow;
    w.$dataSkills[90] = Object.assign({}, w.$dataSkills[1], { id: 90, name: 'Boost', stypeId: 2, mpCost: 5, tpCost: 0, scope: 11, occasion: 0 });
    w.$dataSkills[91] = Object.assign({}, w.$dataSkills[1], { id: 91, name: 'Cut', stypeId: 1, mpCost: 3, tpCost: 0, scope: 11, occasion: 0 });
    battler.learnSkill(90);
    leader.learnSkill(91);
    battler._mp = 20; leader._mp = 20;
    const action = choosing(w, leader);
    scene.commandSkill();
    const names = Array.from(rows._data, item => (item ? item.rrRideHeader || item.name : null));
    assert.deepEqual(names.slice(-3), ['name', 'stats', 'Boost']);
    assert.ok(names.includes('Cut'));
    rows.select(names.indexOf('Boost'));
    assert.equal(rows.isCurrentItemEnabled(), true);
    scene.onSkillOk();
    assert.deepEqual([action._rrVehicleSubject, action.item().id, action.subject() === battler], ['1:31', 90, true]);
    assert.notEqual(leader.lastBattleSkill(), w.$dataSkills[90], 'not the actor\'s last skill');
    // The battle plays it: the vehicle is named and pays the cost.
    BM._subject = leader;
    BM._logWindow = new w.Window_BattleLog();
    BM.startAction();
    assert.deepEqual(list(BM._logWindow.said), ['Motorcycle: Boost']);
    assert.deepEqual(list(BM._logWindow.shown), ['Motorcycle']);
    assert.deepEqual([battler.mp, leader.mp], [15, 20]);
    BM.endAction();
    // His own skill from the same list is his own.
    const next = choosing(w, leader);
    scene.commandSkill();
    rows.select(Array.from(rows._data, item => item && item.name).indexOf('Cut'));
    scene.onSkillOk();
    assert.deepEqual([next._rrVehicleSubject, next.item().id, leader.lastBattleSkill() === w.$dataSkills[91]], ['', 91, true]);
    BM.startAction();
    assert.deepEqual(list(BM._logWindow.said).slice(-1), [leader.name() + ': Cut']);
    assert.deepEqual([battler.mp, leader.mp], [15, 17]);
    // One on foot has the stock list.
    choosing(w, party[2]);
    scene.commandSkill();
    assert.deepEqual([rows._rrVias, rows._rrRide], [null, null]);
});

test('on the battle screen a rider and its vehicle are two in one place: who an action lands on', () => {
    const w = world(), M = w.V.Mount, party = Array.from(w.$gameParty.battleMembers()), scene = screen(w);
    const v31 = w.V.battler(31), v32 = w.V.battler(32);
    w.$dataSkills[92] = Object.assign({}, w.$dataSkills[1], { id: 92, name: 'Sweep', stypeId: 1, mpCost: 0, tpCost: 0, scope: 2, occasion: 0 });
    w.$dataSkills[93] = Object.assign({}, w.$dataSkills[1], { id: 93, name: 'Mend', stypeId: 1, mpCost: 0, tpCost: 0, scope: 7, occasion: 0 });
    const enemy = new w.Game_Enemy(1, 0, 0);
    // (An enemy of no troop: the action is told who makes it.)
    const by = action => { action.subject = () => enemy; return action; };
    const strike = by(new w.Game_Action(enemy));
    strike.setAttack();
    const names = targets => Array.from(targets, target => target.name());
    // The other side, one target: the one with the lesser share of its life left, the rider at a tie.
    assert.deepEqual(names(M.withVehicles(strike, [party[0]])), [party[0].name()]);
    v31.setHp(Math.floor(v31.mhp / 2));
    assert.deepEqual(names(M.withVehicles(strike, [party[0]])), ['Motorcycle']);
    assert.deepEqual(names(M.withVehicles(strike, [party[2]])), [party[2].name()], 'one on foot is one');
    // All of them: each rider with its vehicle.
    const sweep = by(new w.Game_Action(enemy));
    sweep.setSkill(92);
    assert.deepEqual(M.withVehicles(sweep, party.slice()).map(target => target === v31 ? 'v31' : target === v32 ? 'v32' : party.indexOf(target)), [0, 'v31', 1, 'v32', 2]);
    // Kept inside: the vehicle in its rider's place, for one and for all.
    w.$dataReactorVehicles[1].rider = 'inside';
    v31.setHp(v31.mhp);
    assert.ok(M.withVehicles(strike, [party[0]])[0] === v31);
    assert.deepEqual(M.withVehicles(sweep, party.slice()).map(target => target === v31 ? 'v31' : target === v32 ? 'v32' : party.indexOf(target)), ['v31', 'v32', 2]);
    delete w.$dataReactorVehicles[1].rider;
    // The party's own action for one: the rider, unless the vehicle was chosen.
    const mend = new w.Game_Action(party[2]);
    mend.setSkill(93);
    assert.ok(M.withVehicles(mend, [party[0]])[0] === party[0]);
    mend._rrVehicleTarget = '1:31';
    assert.ok(M.withVehicles(mend, [party[0]])[0] === v31);
    // Choosing an ally who rides asks which of the two; the answer is kept on the action.
    const rows = scene._skillWindow, action = choosing(w, party[2]);
    action.setSkill(93);
    scene._actorWindow = { index: () => 0, actor: i => party[i], deactivate() {}, hide() { this.hidden = true; }, show() { this.hidden = false; }, activate() { this.active = true; }, select() {} };
    scene.selectNextCommand = function() { this.next = (this.next || 0) + 1; };
    scene.hideSubInputWindows = function() { this.hid = true; };
    scene.onActorOk();
    assert.deepEqual([Array.from(rows._data, item => item.rrWhom), scene._actorWindow.hidden, scene.next], [['rider', 'vehicle'], true, undefined]);
    scene.onSkillCancel();
    assert.deepEqual([scene._actorWindow.hidden, scene._actorWindow.active, scene._rrWhom], [false, true, null], 'back is the allies again');
    scene.onActorOk();
    rows.select(1);
    scene.onSkillOk();
    assert.deepEqual([action._rrVehicleTarget, action._targetIndex, scene.next], ['1:31', 0, 1]);
});

test('after a battle on the battle screen nobody rides a wreck out of it, and a win mends it', () => {
    const lost = world(), a = screen(lost), p = lost.$gamePlayer, v = lost.V.battler(31);
    assert.ok(a);
    v.setHp(0);
    lost.V.Mount.afterClassic(false);
    assert.deepEqual([p._vehicleType, lost.vehicle(31)._rrBoarded, lost.vehicle(31)._rrWreck], ['walk', false, true]);
    const won = world(), b = screen(won), q = won.$gamePlayer, x = won.V.battler(31);
    assert.ok(b);
    x.setHp(0);
    won.V.Mount.afterClassic(true);
    assert.deepEqual([q._vehicleType, x.hp, !!won.vehicle(31)._rrWreck], ['reactor', 1, false]);
    // The game keeps the fallen down after a win: the wreck stays one.
    const kept = world(), c = screen(kept), y = kept.V.battler(31);
    assert.ok(c);
    kept.$dataSystem.reactorBattle = Object.assign({}, kept.$dataSystem.reactorBattle, { reviveAfterBattle: false });
    y.setHp(0);
    kept.V.Mount.afterClassic(true);
    assert.deepEqual([kept.$gamePlayer._vehicleType, y.hp, kept.vehicle(31)._rrWreck], ['walk', 0, true]);
});
