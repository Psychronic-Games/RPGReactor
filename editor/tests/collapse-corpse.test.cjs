'use strict';
// The Corpse Collapse Effect (trait value 8), and what a battle on the map leaves of a fallen unit by its Collapse
// Effect: a body that stays and can be revived, one that does not disappear, one gone at once, one that fades.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const foe = (id, x, y, enemyId = 1) => event(id, x, y, { note: `<unit: enemy ${enemyId}>` });

/** A tactical battle against event 1 (enemy 1, whose Collapse Effect is `type`) and event 2 (enemy 2, stock), nobody taking a turn. */
function battle(type, extra = {}) {
    const w = fightWorld(Object.assign({ tactical: true, events: [foe(1, 12, 8), foe(2, 14, 8, 2)] }, extra));
    for (const enemy of [w.$dataEnemies[1], w.$dataEnemies[2]]) enemy.params[0] = 9000;
    if (type) w.$dataEnemies[1].traits = w.$dataEnemies[1].traits.concat([{ code: 63, dataId: type, value: 1 }]);
    w.$gameFight.start(Object.assign({ mode: 'tactical', canLose: true }, extra.start));
    const fight = w.$gameFight;
    w.run(3);
    fight._wait = 1e6;
    return { w, fight, F: w.ReactorFight, body: w.$gameMap.event(1), unit: fight.unitOfEvent(1) };
}

function kill(fight, unit) {
    fight.battler(unit).addState(1);
    fight.defeat(unit);
}

//-----------------------------------------------------------------------------
// On the map.

test('a Corpse falls and stays for the battle, where anyone walks over it', () => {
    const { w, fight, F, body, unit } = battle(8);
    const through = body.isThrough();
    kill(fight, unit);
    w.run(F.FALL_REST + F.DEFEAT_FADE + F.DEFEAT_HOLD + 30);
    assert.equal(body._erased, false, 'it is still on the map');
    assert.equal(body._reactorPosePitch, 1, 'lying flat');
    assert.equal(body.opacity(), 255, 'and whole');
    assert.equal(body.isThrough(), true, 'nobody is stopped by a body');
    assert.equal(unit.defeated, true);
    assert.equal(fight.isAlive(unit), false, 'it is out of the battle all the same');
    assert.equal(fight.isFading(), false, 'and nothing waits on it');
    assert.equal(through, false, '(it stopped them while it stood)');
});

test('a Corpse that is revived gets up where it lay and is in the battle again', () => {
    const { w, fight, F, body, unit } = battle(8);
    kill(fight, unit);
    w.run(F.FALL_REST + 10);
    fight.battler(unit).revive();
    fight.battler(unit).setHp(50);
    w.run(2);
    assert.equal(unit.defeated, false);
    assert.equal(fight.isAlive(unit), true);
    assert.deepEqual([body._erased, body._reactorPosePitch, body.opacity(), body.isThrough()], [false, 0, 255, false], 'standing, whole, and in the way again');
    assert.equal(fight._fading.length, 0, 'nothing is left to take it off the map');
    // It can fall again, and lies again.
    kill(fight, unit);
    w.run(F.FALL_REST + 4);
    assert.deepEqual([body._erased, body._reactorPosePitch], [false, 1]);
});

test('the bodies go when the battle is decided, and its end waits for them and for nothing else', () => {
    const { w, fight, F, body, unit } = battle(8);
    kill(fight, unit);
    w.run(F.FALL_REST + 40);
    fight.end(F.WIN);
    assert.equal(fight.isFading(), true, 'decided: the body is on its way out');
    w.run(F.DEFEAT_FADE + 6, () => !fight.isActive());
    assert.equal(body._erased, true, 'it faded with the battle');
    w.run(400, () => !fight.isActive());
    assert.equal(fight.isActive(), false, 'and the battle ended');
});

test('a battle that is left, or cut off, leaves no body lying on the map', () => {
    const left = battle(8);
    kill(left.fight, left.unit);
    left.w.run(left.F.FALL_REST + 4);
    left.fight.end(left.F.ESCAPE, true);
    left.w.run(left.F.DEFEAT_FADE + 10, () => !left.fight.isActive());
    assert.equal(left.fight.isActive(), false);
    assert.equal(left.body._erased, true, 'it is off the map as any fallen unit is');
    // Ended on the spot (an event took the party away): nothing is left half down.
    const cut = battle(8);
    kill(cut.fight, cut.unit);
    cut.w.run(cut.F.FALL_REST + 4);
    cut.fight.finish();
    assert.equal(cut.fight.isActive(), false);
    assert.deepEqual([cut.body._erased, cut.body._reactorPosePitch], [true, 0]);
});

test('Instant is gone the next frame, No Disappear stays standing, and every other effect falls, lies a moment and fades', () => {
    const instant = battle(2);
    kill(instant.fight, instant.unit);
    instant.w.run(2);
    assert.equal(instant.body._erased, true, 'Instant: no fall, no wait');

    const stays = battle(3);
    kill(stays.fight, stays.unit);
    stays.w.run(stays.F.FALL_REST + stays.F.DEFEAT_FADE + 60);
    assert.equal(stays.body._erased, false, 'No Disappear: still there');
    assert.ok(!stays.body._reactorPosePitch, 'and still standing');
    assert.equal(stays.body.isThrough(), false, 'in the way as it was');
    assert.equal(stays.fight.isAlive(stays.unit), false);
    stays.fight.end(stays.F.WIN);
    stays.w.run(400, () => !stays.fight.isActive());
    assert.equal(stays.body._erased, true, 'it goes with the battle');

    for (const type of [0, 1, 4, 5, 6, 7]) {
        const fades = battle(type);
        kill(fades.fight, fades.unit);
        fades.w.run(fades.F.FALL_REST - 2);
        assert.deepEqual([fades.body._erased, fades.body._reactorPosePitch], [false, 1], `effect ${type} lies first`);
        fades.w.run(fades.F.DEFEAT_FADE + 6);
        assert.equal(fades.body._erased, true, `effect ${type} then fades`);
    }
});

test('the sound of an enemy going is its own, else its Collapse Effect\'s; Instant has none', () => {
    const F = fightWorld().ReactorFight;
    const world = fightWorld();
    const played = [];
    world.SoundManager.playEnemyCollapse = () => played.push('enemy');
    world.SoundManager.playBossCollapse1 = () => played.push('boss');
    const battler = type => ({ collapseType: () => type });
    for (const type of [0, 1, 2, 3, 8]) world.ReactorFight.collapseSound(battler(type));
    assert.deepEqual(played, ['enemy', 'boss', 'enemy', 'enemy']);
    // One with a sound chosen beside its effect plays that, and is handed the stock one to fall back on.
    const own = [];
    world.ReactorFight.collapseSound({ collapseType: () => 2, playCollapseSe: fallback => own.push(fallback) });
    world.ReactorFight.collapseSound({ collapseType: () => 8, playCollapseSe: fallback => own.push(typeof fallback) });
    assert.deepEqual(own, [null, 'function']);
    assert.equal(typeof F.remainsOf, 'function');
});

test('an ally an event stands for lies where it fell and stands again on the map when the battle is won', () => {
    const ally = event(3, 10, 3, { note: '<unit: actor 3>' });
    const w = fightWorld({ tactical: true, system: { partyMembers: [1, 2] }, events: [foe(1, 17, 12), ally] });
    w.$dataEnemies[1].params[0] = 9000;
    w.$gameFight.start({ mode: 'tactical', canLose: true });
    const fight = w.$gameFight, F = w.ReactorFight, body = w.$gameMap.event(3);
    w.run(3);
    fight._wait = 1e6;
    const unit = fight._units.find(u => u.actorId === 3);
    fight.battler(unit).setHp(0);
    fight.defeat(unit);
    w.run(F.FALL_REST + F.DEFEAT_FADE + 40);
    assert.deepEqual([body._erased, body._reactorPosePitch], [false, 1], 'a body, whatever its Collapse Effect');
    fight.end(F.WIN, true);
    w.run(20, () => !fight.isActive());
    assert.equal(fight.isActive(), false, 'the end does not wait on it');
    assert.equal(w.$gameActors.actor(3).hp, 1, 'got up by the win');
    assert.deepEqual([body._erased, body._reactorPosePitch, body.opacity(), body.isThrough()], [false, 0, 255, false], 'and standing on the map');
});

test('a body is put back lying when the map of a kept battle is read again', () => {
    const { w, fight, F, body, unit } = battle(8, { mapNote: '<battle trigger: 0>', start: { onTransfer: 'keep' } });
    kill(fight, unit);
    w.run(F.FALL_REST + 4);
    assert.equal(body._reactorPosePitch, 1);
    // The map's events are made again (a load, the party's return): this one stands as authored until the battle lays it down.
    w.$gameMap.setupEvents();
    const again = w.$gameMap.event(1);
    assert.ok(!again._reactorPosePitch, '(made again: standing)');
    fight.eraseFallen();
    assert.deepEqual([again._erased, again._reactorPosePitch, again.isThrough()], [false, 1, true]);
    assert.equal(fight._fading.length, 1, 'and it still goes when the battle is decided');
    assert.equal(fight.isFading(), false);
});

//-----------------------------------------------------------------------------
// In a Classic battle: the enemy's sprite.

/** Sprite_Enemy's effects, from the shipped file, on a sprite that records what it is told. */
function spriteWorld() {
    const source = read('runtime/reactor_sprites.js');
    const from = source.indexOf('Sprite_Enemy.prototype.updatePosition = function');
    const to = source.indexOf('// Particle collapse -- Collapse Effect trait values');
    const corpse = source.indexOf('// Corpse -- Collapse Effect trait value 8.');
    const end = source.indexOf('Sprite_Enemy.prototype.updateCorpseRise');
    assert.ok(from > 0 && to > from && corpse > 0 && end > corpse);
    const context = { Math, Game_BattlerBase: { COLLAPSE_CORPSE: 8 }, SoundManager: {} };
    vm.runInNewContext(`
        function Sprite_Enemy() {}
        const Sprite_Battler = { prototype: { updatePosition() { this.x = this._homeX; this.y = this._homeY; } } };
        ${source.slice(from, to)}
        //${source.slice(corpse, source.indexOf('\n};', end) + 3)}
        Sprite_Enemy.prototype.destroyParticleCollapse = function() {};
        Sprite_Enemy.prototype.setBlendColor = function(color) { this.blend = Array.from(color); };
        this.Sprite_Enemy = Sprite_Enemy;
    `, context);
    const enemy = { alive: true, effect: null, type: 8,
        isAlive() { return this.alive; }, isDead() { return !this.alive; }, isHidden: () => false, collapseType() { return this.type; },
        isEffectRequested() { return !!this.effect; }, effectType() { return this.effect; }, clearEffect() { this.effect = null; } };
    const sprite = new context.Sprite_Enemy();
    Object.assign(sprite, { _enemy: enemy, _appeared: true, _effectType: null, _effectDuration: 0, _shake: 0, _corpse: 0, _homeX: 300, _homeY: 400,
        opacity: 255, rotation: 0, width: 120, height: 200, scale: { x: 1, y: 1 }, _stateIconSprite: { visible: true } });
    const frame = () => { sprite.updateEffect(); sprite.updatePosition(); };
    return { context, enemy, sprite, frame, Sprite: context.Sprite_Enemy };
}

test('a Corpse enemy\'s picture goes over onto its side, dimmed, and stays shown', () => {
    const { enemy, sprite, frame, Sprite } = spriteWorld();
    enemy.alive = false; enemy.effect = 'corpseCollapse';
    frame();
    assert.equal(sprite._effectType, 'corpseCollapse');
    assert.equal(sprite._appeared, false);
    assert.ok(sprite._corpse > 0 && sprite._corpse < .1, 'it tips slowly at first');
    for (let i = 0; i < Sprite.CORPSE_FRAMES + 20; i++) frame();
    assert.equal(sprite._effectType, null, 'the effect is over');
    assert.equal(sprite._corpse, 1);
    assert.equal(sprite.rotation, Sprite.CORPSE_TURN * Math.PI / 2, 'flat on its side');
    assert.equal(sprite.opacity, 255, 'and still there');
    assert.deepEqual([...sprite.blend], [...Sprite.CORPSE_SHADE], 'dimmed');
    assert.equal(sprite._stateIconSprite.visible, false, 'with no state icon turned over beside it');
    // Its long side lies on the ground line it stood on, centered where it stood: the picture is 120 wide and 200 tall.
    // (Turned about its feet with its head to the left, the picture reaches from its feet 200 to the left: the feet
    // are put 100 to the right of where it stood, and 60 up.)
    assert.equal(sprite.y, 400 - 60);
    assert.equal(sprite.x, 300 - Sprite.CORPSE_TURN * 100);
    assert.equal(Sprite.CORPSE_TURN, -1);
});

test('a revived Corpse gets up instead of fading in, and one already a body lies as it was left', () => {
    const { enemy, sprite, frame, Sprite } = spriteWorld();
    enemy.alive = false; enemy.effect = 'corpseCollapse';
    for (let i = 0; i < Sprite.CORPSE_FRAMES + 2; i++) frame();
    enemy.alive = true;
    frame();
    assert.equal(sprite._effectType, 'corpseRise');
    assert.equal(sprite._appeared, true);
    assert.equal(sprite.opacity, 255, 'never faint on the way up');
    for (let i = 0; i < Sprite.CORPSE_RISE + 2; i++) frame();
    assert.deepEqual([sprite._corpse, Math.abs(sprite.rotation), sprite.x, sprite.y, sprite._stateIconSprite.visible], [0, 0, 300, 400, true]);
    assert.deepEqual([...sprite.blend], [0, 0, 0, 0], 'the dimness goes with the body');
    // The battle's sprites made again over a body: lying, shown.
    const made = spriteWorld();
    made.enemy.alive = false;
    made.sprite.initVisibility();
    assert.deepEqual([made.sprite._corpse, made.sprite.opacity, made.sprite._appeared], [1, 255, false]);
    // Any other effect on a dead enemy: not shown, as before.
    const other = spriteWorld();
    other.enemy.alive = false; other.enemy.type = 0;
    other.sprite.initVisibility();
    assert.deepEqual([other.sprite._corpse, other.sprite.opacity], [0, 0]);
});

test('Collapse Effect 8 asks for the corpse, with the enemy\'s own sound', () => {
    const objects = read('runtime/reactor_objects_battlers.js');
    assert.match(objects, /case 8:\s*\n\s*this\.requestEffect\("corpseCollapse"\);\s*\n\s*this\.playCollapseSe\(/);
    assert.match(objects, /Game_BattlerBase\.COLLAPSE_CORPSE = 8;/);
    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /case "corpseCollapse":\s*\n\s*this\.startCorpseCollapse\(\)/);
    assert.match(sprites, /case "corpseCollapse":\s*\n\s*this\.updateCorpseCollapse\(\)/);
});

//-----------------------------------------------------------------------------
// In a Battle Room.

test('a Corpse lies in a Battle Room too: its model goes over as far as its sprite, a flat picture turns onto its side on the floor', () => {
    const B = require('../../runtime/reactor_battle_data.js');
    const context = { ReactorBattleData: B, DataManager: { isDatabaseLoaded() { return true; } }, THREE: { AdditiveBlending: 2, NormalBlending: 1 } };
    vm.runInNewContext(read('runtime/reactor_battle_presentation.js'), context);
    const P = context.ReactorBattlePresentation;
    const turned = [];
    const room = { models: new Map([['enemy:0', { object: { rotateX: angle => turned.push(angle) } }]]) };
    P.liePose(room, 'enemy:0', 0);
    P.liePose(room, 'enemy:0', undefined);
    assert.deepEqual(turned, [], 'standing: untouched');
    P.liePose(room, 'enemy:0', .5);
    P.liePose(room, 'enemy:0', 1);
    assert.deepEqual(turned, [-Math.PI / 4, -Math.PI / 2]);
    // A picture 96 wide and 144 tall, 3 tall in the room (so 2 wide): lying, it is 2 high, its middle half a unit lower.
    const frame = { width: 96, height: 144 }, home = { x: 4, y: 5, z: 0, facing: 90 };
    const stood = P.lieBillboard(home, frame, 3, 0);
    assert.deepEqual([stood.rotateZ, stood.z, stood.x, stood.facing], [0, 0, 4, 90], 'standing: where it was, the turn reset');
    const lying = P.lieBillboard(home, frame, 3, 1);
    assert.deepEqual([lying.rotateZ, lying.z], [90, -.5]);
    assert.equal(home.z, 0, 'the sprite\'s own place is not written to');
    const source = read('runtime/reactor_battle_presentation.js');
    assert.match(source, /if\(actor\)P\.fallPose\(room,key,battler\);else P\.liePose\(room,key,sprite\._corpse\);/);
});

//-----------------------------------------------------------------------------
// In the editor.

test('Corpse is the ninth Collapse Effect in the Traits dialog, its summary and its hint, in every language', () => {
    const editor = read('editor/src/database/DatabaseTraitEditor.js');
    assert.match(editor, /\['Normal', 'Boss', 'Instant', 'No Disappear', 'Ash', 'Ember', 'Wisp', 'Shatter', 'Corpse'\]/);
    assert.match(read('editor/src/database/DatabaseCommonUI.js'), /'Wisp Collapse', 'Shatter Collapse', 'Corpse Collapse'\];/);
    const help = read('editor/src/database/TraitHelp.js');
    const hints = help.slice(help.indexOf('static collapseEffects()'), help.indexOf('static partyAbilities()'));
    assert.equal((hints.match(/^\s+'.*',?$/gm) || []).length, 9, 'one hint per effect');
    const i18n = read('editor/src/I18nManager.js');
    const lines = i18n.split('\n').filter(line => line.includes('"Corpse Collapse"'));
    assert.equal(lines.length, 17, 'seventeen languages besides English');
    for (const line of lines) {
        const entry = JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1));
        for (const key of ['Corpse', 'Corpse Collapse', 'The battler falls and stays on the ground. It can be revived.']) {
            assert.ok(entry[key] && entry[key] !== key, `${key} is written out`);
        }
    }
});

//-----------------------------------------------------------------------------
// Which way it falls.

test('one felled by a blow goes over away from it: from the one who struck, or from the middle of a blast', () => {
    const { w, fight, F, body, unit } = battle(8);
    // The body stands at (12, 8).
    const yaw = (x, y) => F.fallYaw({ x, y }, body);
    assert.equal(yaw(10, 8), Math.round(Math.PI / 2 * 1000) / 1000, 'struck from the left: thrown right');
    assert.equal(yaw(14, 8), -Math.round(Math.PI / 2 * 1000) / 1000, 'from the right: thrown left');
    assert.equal(yaw(12, 6), 0, 'from above: thrown down the map');
    assert.equal(Math.abs(yaw(12, 10)), Math.round(Math.PI * 1000) / 1000, 'from below: up it');
    assert.equal(yaw(12, 8), null, 'from its own cell: no way to be thrown');
    assert.equal(F.fallYaw(null, body), null, 'by nobody: none');
    // The one who strikes stands to its left; a single blow comes from there, a blast from its middle.
    const hero = fight._units.find(u => u.party), mover = fight.character(hero);
    mover.locate(10, 8);
    const action = new w.Game_Action(fight.battler(hero)); action.setAttack();
    const run = F.makeRun(fight, hero, action, [unit]);
    run.cell = { x: 12, y: 8 };
    assert.deepEqual({ ...fight.blowFrom(run, action, unit) }, { x: 10, y: 8 });
    const tactics = F.tactics;
    F.tactics = () => ({ area: { shape: 'circle', size: 2 } });
    try {
        run.cell = { x: 12, y: 10 };
        assert.deepEqual({ ...fight.blowFrom(run, action, unit) }, { x: 12, y: 10 }, 'a blast throws outward from its middle');
        run.cell = { x: 12, y: 8 };
        assert.deepEqual({ ...fight.blowFrom(run, action, unit) }, { x: 10, y: 8 }, 'whoever stands on its middle, from the one who threw it');
        F.tactics = () => ({ area: { shape: 'line', size: 4 } });
        run.cell = { x: 14, y: 8 };
        assert.deepEqual({ ...fight.blowFrom(run, action, unit) }, { x: 10, y: 8 }, 'a line runs from the one who struck');
    } finally { F.tactics = tactics; }
});

test('the way it fell stays with the body and goes when it stands', () => {
    const { w, fight, F, body, unit } = battle(8);
    unit.struck = { x: 10, y: 8 };
    kill(fight, unit);
    assert.equal(unit.struck, undefined, 'used once');
    const right = Math.round(Math.PI / 2 * 1000) / 1000;
    assert.equal(body._reactorFallYaw, right);
    assert.equal(unit.fallYaw, right, 'kept for a map that is read again');
    w.run(F.FALL_REST + 4);
    w.$gameMap.setupEvents();
    fight.eraseFallen();
    assert.deepEqual([w.$gameMap.event(1)._reactorPosePitch, w.$gameMap.event(1)._reactorFallYaw], [1, right]);
    fight.battler(unit).revive(); fight.battler(unit).setHp(50);
    w.run(2);
    assert.deepEqual([w.$gameMap.event(1)._reactorPosePitch, w.$gameMap.event(1)._reactorFallYaw, unit.fallYaw], [0, null, undefined]);
    // Fallen by no blow (an event's command, poison): onto its back, as before.
    kill(fight, unit);
    assert.equal(w.$gameMap.event(1)._reactorFallYaw, null);
    // A party member falls the same way, and nothing of it is left when it is up.
    const hero = fight._units.find(u => u.party && fight.character(u) !== w.$gamePlayer) || fight._units.find(u => u.party), walker = fight.character(hero);
    hero.struck = { x: walker._realX, y: walker._realY - 3 };
    fight.battler(hero).setHp(0); fight.defeat(hero);
    assert.equal(walker._reactorFallYaw, 0);
    fight.battler(hero).setHp(20);
    w.run(2);
    assert.deepEqual([walker._reactorFall, walker._reactorPosePitch || 0, walker._reactorFallYaw], [0, 0, null]);
});

test('a model goes over about the level axis across the blow\'s line, and a flat character to the side it was thrown', () => {
    const source = read('runtime/reactor_3d_models.js');
    const at = source.indexOf('Reactor3D.fallAxis = function');
    const context = { Math, Number, THREE: { Vector3: function() { this.set = function(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }; } }, Reactor3D: {} };
    vm.runInNewContext(source.slice(at, source.indexOf('\n};', at) + 3), context);
    const axis = yaw => { const a = context.Reactor3D.fallAxis(yaw); return a && [a.x, a.y, a.z].map(n => Math.round(n * 1000) / 1000 + 0); };
    // Thrown down the map (+z): the top goes toward +z, a turn about +x. Thrown right (+x): about -z.
    assert.deepEqual(axis(0), [1, 0, 0]);
    assert.deepEqual(axis(Math.PI / 2), [0, 0, -1]);
    assert.equal(axis(null), null);
    assert.equal(axis(undefined), null);
    assert.match(source, /const fallAxis = posePitch > 0 \? Reactor3D\.fallAxis\(character\._reactorFallYaw\) : null;\s*\n\s*if \(fallAxis\) object\.rotateOnWorldAxis\(fallAxis, posePitch \* Math\.PI \/ 2\);\s*\n\s*else if \(posePitch\) object\.rotateX\(/);
    assert.match(source, /placed\.fallYaw !== \(character\._reactorFallYaw \?\? null\)/, 'a model that has settled is placed again when the way changes');
    assert.match(read('runtime/reactor_sprites.js'), /const side = typeof fallYaw === "number" && Math\.sin\(fallYaw\) < -0\.01 \? -1 : 1;/);
});
