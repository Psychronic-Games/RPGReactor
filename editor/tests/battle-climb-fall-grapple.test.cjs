'use strict';
// Battles on the map, up and down (runtime/reactor_physics.js "Battles on the map" and "Grapple",
// runtime/reactor_fight_tactical.js): a unit climbs a wall too high to mantle up to the project's climb height,
// jumps down any height and loses the fall rule's share of its max HP past the safe fall (the number the move
// preview shows), never takes a fall that would leave it with nothing, and a unit wearing a grapple (an armor's
// `rrGrapple`, Database › Armors › Grapple) is pulled up to a roof's edge within its reach. The settings live with
// the other physics in System 2 (`battleClimb`, `climbHeight`, `climbCost`, `battleFall`).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { realWorld, event } = require('./helpers/fight-real-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repo, p), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const unit = (id, x, y, text) => event(id, x, y, { note: `<unit: ${text}>` });

/** A 3D floor with a block of pieces `tall` high on x 8..12, y 8..12: a building whose roof is flat. */
function towerWorld(physics = {}, options = {}) {
    const w = realWorld(Object.assign({ events: [unit(1, 30, 20, 'enemy 1')], start: [5, 10], system: { reactorPhysics: physics } }, options));
    const map = w.$dataMap, side = map.reactor3d, pieces = [];
    let id = 1;
    for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) for (let z = 0; z < (options.tall || 5); z++) pieces.push({ id: id++, kind: 'block', x, y, z, rot: 0, material: '' });
    side.pieces = pieces;
    w.ReactorFight.forgetFootprints();
    w.ReactorPhysics.forgetEdges(map);
    return w;
}
function begin(w) {
    assert.ok(w.$gameFight.start({ mode: 'tactical', turns: 'team' }) > 0);
    w.run(90, () => w.$gameFight.awaitsPlayer());
    return w.$gameFight;
}
const hero = w => w.$gameFight._units.find(u => u.actorId === 1);
/** An actor wears an armor in a slot of its own. */
function wear(w, battler, armor) {
    const item = new w.Game_Item();
    item.setObject(armor);
    battler._equips.push(item);
}
/** Put a unit somewhere at a height, as the battle would find it there. */
function put(w, u, x, y, h) {
    const c = w.$gameFight.character(u);
    c.locate(x, y);
    c._reactorGround = h; c._reactorAlt = h; c._reactorAir = 0;
    w.ReactorFight.forgetFootprints();
}

test('the settings: on by default and safe, read and kept in range; an old project reads them as defaults', () => {
    const map = { width: 4, height: 4, note: '<3d>', reactor3d: { version: 1, mode: '3d' } };
    const make = physics => {
        const c = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: require(path.join(repo, 'runtime', 'reactor_3d.js')), $dataSystem: { reactorPhysics: physics }, $dataMap: map, Input: { keyMapper: {}, gamepadMapper: {} } };
        c.window = c; c.globalThis = c;
        vm.createContext(c);
        vm.runInContext(read('runtime/reactor_controls.js'), c);
        vm.runInContext(read('runtime/reactor_physics.js'), c);
        return c.ReactorPhysics;
    };
    const old = make({ gravity: 1, fallDamage: true }).settings();
    assert.deepEqual([old.battleClimb, old.climbHeight, old.climbCost, old.battleFall], [true, 6, 0.75, 'hurt']);
    assert.equal(old.lethalFall, 'ask');
    const odd = make({ battleClimb: false, climbHeight: 999, climbCost: -2, battleFall: 'sometimes', lethalFall: 'maybe' }).settings();
    assert.deepEqual([odd.battleClimb, odd.climbHeight, odd.climbCost, odd.battleFall, odd.lethalFall], [false, 50, 0, 'hurt', 'ask']);
    assert.equal(make({ lethalFall: 'allow' }).settings().lethalFall, 'allow');
    const P = make({ fallFrom: 6, fallPercent: 10 });
    assert.deepEqual([P.fallShare(6), P.fallShare(8), P.fallShare(30)], [0, 0.2, 1], 'a tenth of max HP a tile past the safe fall, never more than all');
    assert.deepEqual([P.fallHp(500, 0.2), P.fallHp(3, 0.01), P.fallHp(500, 0)], [100, 1, 0]);
    assert.deepEqual([P.climbCostFor(3.1), P.climbCostFor(5.5), P.climbCostFor(10)], [3, 5, 8], 'three quarters of a move point a tile, never less than a mantle');
    // The editor's card writes the same keys, with the same defaults.
    const editor = read('editor/src/database/DatabaseControlsEditor.js');
    assert.match(editor, /battleClimb: true, climbHeight: 6, climbCost: 0\.75, battleFall: 'hurt', lethalFall: 'ask' \}, this\.system\(\)\.reactorPhysics/);
    assert.match(editor, /static LETHAL_FALLS = \[\['ask', 'Ask first'\], \['allow', 'Allowed without asking'\], \['never', 'Not allowed'\]\];/);
    assert.match(editor, /rr-controls-lethalfall[^\n]*p\.lethalFall = event\.target\.value/);
    for (const field of ['climbHeight', 'climbCost']) assert.match(editor, new RegExp(`data-field="${field}"`));
    assert.match(editor, /rr-controls-climb[^\n]*p\.battleClimb = event\.target\.checked/);
    assert.match(editor, /rr-controls-battlefall[^\n]*p\.battleFall = event\.target\.value/);
    assert.match(editor, /static BATTLE_FALLS = \[\['hurt', [^\]]+\], \['safe', [^\]]+\], \['off', [^\]]+\]\];/);
});

test('a wall too high to mantle is climbed to the project\'s climb height, at its price, and not with climbing off', () => {
    const w = towerWorld(), F = w.ReactorFight, G = F.Grid;
    const fight = begin(w), me = hero(w);
    put(w, me, 5, 10, 0);
    G.flood(fight, me, 12);
    assert.equal(G.costAt(7, 10, 0), 2);
    assert.equal(G.costAt(8, 10, 5), 6, 'two steps, then four move points up the five-tile wall');
    assert.deepEqual(Array.from(G.pathTo(8, 10, 5), step => step.kind), ['walk', 'walk', 'climb']);
    // A wall higher than the climb height takes a ladder.
    w.$dataSystem.reactorPhysics.climbHeight = 4;
    w.Graphics.frameCount++; fight._turn++; G.forget();
    G.flood(fight, me, 12);
    assert.equal(G.costAt(8, 10, 5), Infinity, 'five tiles is over a climb of four');
    w.$dataSystem.reactorPhysics = { battleClimb: false };
    w.Graphics.frameCount++; fight._turn++; G.forget();
    G.flood(fight, me, 12);
    assert.equal(G.costAt(8, 10, 5), Infinity, 'with climbing off nobody goes up');
    // The physics plays it as a climb up the wall, slower than a ladder.
    const P = w.ReactorPhysics, c = fight.character(me);
    put(w, me, 7, 10, 0);
    assert.equal(P.playStep(c, { x: 8, y: 10, d: 6, kind: 'climb', height: 5 }), true);
    assert.equal(c._reactorMantle.pull, Math.round(5 * P.CLIMB_FRAMES_PER_TILE));
    assert.ok(c._reactorMantle.pull > 5 / (P.LADDER_SPEED * 2), 'slower than the same height of ladder');
    w.run(400, () => !c._reactorMantle);
    assert.deepEqual([c.x, c.y, Math.round(c._reactorAlt * 100) / 100], [8, 10, 5]);
});

test('a jump down past the safe fall costs the fall rule\'s HP: shown on the way, taken on landing, never all of it', () => {
    const w = towerWorld({ fallFrom: 2, fallPercent: 10 }), F = w.ReactorFight, G = F.Grid;
    const fight = begin(w), me = hero(w), battler = fight.battler(me);
    put(w, me, 10, 10, 5);
    G.flood(fight, me, 12);
    const loss = w.ReactorPhysics.fallHp(battler.mhp, 0.3);
    assert.ok(loss > 0);
    assert.equal(G.lossAt(13, 10, 0), loss, 'five tiles down, three past the safe fall: three tenths of max HP');
    assert.equal(G.lossAt(11, 10, 5), 0, 'the roof itself costs nothing');
    const way = G.pathTo(13, 10, 0), drop = way.find(step => step.kind === 'drop');
    assert.ok(drop && drop.loss === loss, 'the drop on the way carries what it costs');
    // The preview's number: the path to the cursor.
    assert.ok(fight.commandSelectUnit(me.id));
    fight._act.steps = 12;
    fight.setCursor(13, 10, 0);
    assert.equal(fight.pathLoss(), loss, 'the move preview says the same');
    // Walked: the HP goes on landing, not before.
    const before = battler.hp;
    assert.ok(fight.commandMoveTo(13, 10));
    w.run(600, () => fight.tacticalState() === 'command');
    assert.deepEqual([fight.character(me).x, fight.character(me).y], [13, 10]);
    assert.equal(battler.hp, before - loss, 'exactly what the preview said');
    // A unit that decides for itself never takes a fall that would leave it with nothing.
    put(w, me, 10, 10, 5);
    battler.setHp(loss);
    fight._act = { unitId: me.id, steps: 12, stage: 'ai', player: false };
    w.Graphics.frameCount++; fight._turn++; G.forget();
    G.flood(fight, me, 12);
    assert.equal(G.costAt(13, 10, 0), Infinity, 'no fall that would defeat it');
    // "safe": any height, unhurt; "off": no deeper than the safe fall.
    battler.setHp(battler.mhp);
    w.$dataSystem.reactorPhysics.battleFall = 'safe';
    w.Graphics.frameCount++; fight._turn++; G.forget();
    G.flood(fight, me, 12);
    assert.deepEqual([G.costAt(13, 10, 0) < Infinity, G.lossAt(13, 10, 0)], [true, 0]);
    w.$dataSystem.reactorPhysics.battleFall = 'off';
    w.Graphics.frameCount++; fight._turn++; G.forget();
    G.flood(fight, me, 12);
    assert.equal(G.costAt(13, 10, 0), Infinity, 'five tiles is past a safe fall of two');
});

test('a jump that would leave the player\'s unit with no HP: shown as fatal, asked about (Ask first), taken unasked (Allowed), or not offered (Not allowed)', () => {
    const run = (lethalFall, answer) => {
        const w = towerWorld({ fallFrom: 2, fallPercent: 10, lethalFall }), F = w.ReactorFight, G = F.Grid;
        const fight = begin(w), me = hero(w), battler = fight.battler(me);
        put(w, me, 10, 10, 5);
        const loss = w.ReactorPhysics.fallHp(battler.mhp, 0.3);
        battler.setHp(loss);
        assert.ok(fight.commandSelectUnit(me.id));
        fight._act.steps = 12;
        fight.setCursor(13, 10, 0);
        const out = { w, fight, me, battler, F, G, loss, lethal: fight.pathLethal(), shown: fight.pathLoss(), reachable: Array.from(fight.moveCells()).some(c => c.x === 13 && c.y === 10) };
        out.took = fight.commandMoveTo(13, 10, 0);
        out.asked = !!fight._tac.fallAsk;
        if (out.asked && answer !== undefined) out.answered = fight.commandFallAnswer(answer);
        w.run(600, () => fight._act === null || (fight._act && fight._act.stage !== 'walk' && fight._act.stage !== 'move'));
        const c = fight.character(me);
        Object.assign(out, { at: [c.x, c.y], hp: battler.hp, defeated: !!me.defeated, stage: fight._act && fight._act.stage });
        return out;
    };
    const never = run('never');
    assert.deepEqual([never.reachable, never.lethal, never.took], [false, false, false], 'not allowed: not in the move range');
    const no = run('ask', false);
    assert.deepEqual([no.reachable, no.lethal, no.shown, no.asked], [true, true, no.loss, true], 'ask first: reachable, marked fatal with its HP, and asked about');
    assert.deepEqual([no.at, no.hp, no.defeated, no.stage], [[10, 10], no.loss, false, 'move'], 'No: where it was, its move still to make');
    const yes = run('ask', true);
    assert.deepEqual([yes.at, yes.hp, yes.defeated], [[13, 10], 0, true], 'Yes: it falls and is knocked out');
    const allow = run('allow');
    assert.deepEqual([allow.lethal, allow.asked, allow.at, allow.hp, allow.defeated], [true, false, [13, 10], 0, true], 'allowed: taken unasked, still shown as fatal');
    // The words come from the battle's terms (Database › Terms › Battles on the Map).
    assert.deepEqual([yes.F.term('fallYes'), yes.F.term('fallNo'), yes.F.term('fallLethal')], ['Jump', 'Stay', 'Fatal fall']);
    assert.match(read('runtime/reactor_fight_menu.js'), /const QUESTIONS = \["endTurn", "retreat", "auto", "fall"\];/);
});

test('in Action and First Person battles a unit\'s own fall hurts that unit alone, and a wall out of reach is climbed', () => {
    const w = towerWorld({ fallFrom: 2, fallPercent: 10, fallDamage: true });
    assert.ok(w.$gameFight.start({ mode: 'action' }) > 0);
    const fight = w.$gameFight, me = hero(w), other = fight._units.find(u => u.actorId === 2);
    const battler = fight.battler(me), friend = fight.battler(other), settings = w.ReactorPhysics.settings();
    const hp = battler.hp, friendHp = friend.hp;
    w.ReactorPhysics.onLand(fight.character(me), 5, settings);
    assert.equal(battler.hp, hp - w.ReactorPhysics.fallHp(battler.mhp, 0.3));
    assert.equal(friend.hp, friendHp, 'nobody else is hurt');
    // Jump against a wall out of the hands' reach climbs it, in these battles, up to the climb height.
    const P = w.ReactorPhysics, c = fight.character(me);
    c.locate(7, 10); c._reactorGround = 0; c._reactorAlt = 0; c._reactorAir = 0;
    assert.equal(P.battleClimbs(), true);
    assert.equal(P.tryMantle(c, 6), true, 'a five-tile wall');
    assert.equal(c._reactorMantle.pull, Math.round(5 * P.CLIMB_FRAMES_PER_TILE));
    w.run(400, () => !c._reactorMantle);
    assert.deepEqual([c.x, c.y, Math.round(c._reactorAlt * 100) / 100], [8, 10, 5]);
    assert.match(read('runtime/reactor_fight_action.js'), /if \(\(spot\.kind === "ladder" \|\| spot\.kind === "climb"\) && P\.playStep\)/);
    const runtime = read('runtime/reactor_fight.js');
    assert.match(runtime, /Game_Fight\.prototype\.onUnitLanded = function\(character, fell, settings\) \{/);
    assert.match(read('runtime/reactor_physics.js'), /fight\.isActive\(\) && fight\.onUnitLanded && fight\.onUnitLanded\(character, fell, settings\)\) return;/);
});

test('a grapple pulls its wearer up to a roof edge in reach: its own color in the move range, uses and cooldown, the line, the pull, the climb', () => {
    const w = towerWorld({ battleClimb: false }), F = w.ReactorFight, G = F.Grid, P = w.ReactorPhysics;
    w.$dataArmors[1] = { id: 1, name: 'Grappler', atypeId: 1, etypeId: 5, traits: [], params: [0, 0, 0, 0, 0, 0, 0, 0], iconIndex: 0, price: 0, description: '', note: '',
        rrGrapple: { range: 6, height: 10, uses: 2, cooldown: 1, cost: 'move', moveCost: 2 } };
    const fight = begin(w), me = hero(w), battler = fight.battler(me);
    wear(w, battler, w.$dataArmors[1]);
    assert.deepEqual(plain(F.grappleOf(fight, me)), { range: 6, height: 10, uses: 2, cooldown: 1, cost: 'move', moveCost: 2 });
    put(w, me, 3, 10, 0);
    // The map's edges in reach: the near side of the roof, held from the ground beside the wall.
    const edges = P.grappleTargets(w.$dataMap, 3, 10, 0, 6, 10);
    assert.ok(edges.some(e => e.x === 8 && e.y === 10 && e.d === 6 && e.bx === 7 && e.by === 10 && e.to === 5), 'the edge straight ahead');
    assert.ok(!edges.some(e => e.x > 8), 'nothing past the near edge: the hook is caught where the roof begins');
    G.flood(fight, me, 6);
    assert.equal(G.costAt(8, 10, 5), 2, 'the grapple\'s two move points, where climbing is off');
    assert.equal(G.grappledAt(8, 10, 5), true);
    assert.equal(G.costAt(9, 10, 5), 3, 'and the roof is walked on from the edge');
    assert.equal(G.grappledAt(9, 10, 5), false);
    const way = G.pathTo(8, 10, 5);
    assert.deepEqual(plain(way.map(step => [step.kind, step.x, step.y, step.d])), [['grapple', 8, 10, 6]]);
    // In the move range the edges have their own mark.
    assert.ok(fight.commandSelectUnit(me.id));
    fight._act.steps = 6;
    const move = Array.from(fight.moveCells());
    assert.ok(move.some(cell => cell.x === 8 && cell.y === 10 && cell.grapple), 'the edge is a grapple cell');
    assert.ok(!move.some(cell => cell.x === 9 && cell.y === 10 && cell.grapple));
    assert.equal(F.Marks.KINDS.grapple, 9);
    assert.ok(F.Marks.COLORS[9] && F.Marks.CSS[9] && F.Marks.RIM[9]);
    // Taken: the line flies, the body is pulled up to hang under the edge, then it climbs over.
    fight.setCursor(8, 10, 5);
    assert.ok(fight.commandMoveTo(8, 10));
    const c = fight.character(me), hook = {};
    let flew = false, pulled = false, climbed = false;
    w.run(600, () => {
        if (P.grappleHook(c, hook)) { if (hook.out < 1) flew = true; else if (c._realX > 3.5) pulled = true; }
        if (c._reactorMantle) climbed = true;
        return fight.tacticalState() === 'command';
    });
    assert.deepEqual([flew, pulled, climbed], [true, true, true]);
    assert.deepEqual([c.x, c.y, Math.round(c._reactorAlt * 100) / 100], [8, 10, 5]);
    assert.equal(fight._tac.grapples[me.id].count, 1);
    assert.equal(F.grappleFor(fight, me), null, 'cooling down this turn and the next');
    fight._turn += 2;
    assert.ok(F.grappleFor(fight, me), 'ready again after its cooldown');
    fight._tac.grapples[me.id].count = 2;
    assert.equal(F.grappleFor(fight, me), null, 'two uses a battle, both spent');
});

test('a grapple that costs the action: free to move after it, and the turn ends where the way does; the AI weighs no action from there', () => {
    const w = towerWorld({ battleClimb: false }), F = w.ReactorFight, G = F.Grid;
    w.$dataArmors[1] = { id: 1, name: 'Grappler', atypeId: 1, etypeId: 5, traits: [], params: [0, 0, 0, 0, 0, 0, 0, 0], iconIndex: 0, price: 0, description: '', note: '',
        rrGrapple: { range: 6, height: 10, uses: 0, cooldown: 0, cost: 'action', moveCost: 2 } };
    const fight = begin(w), me = hero(w);
    wear(w, fight.battler(me), w.$dataArmors[1]);
    put(w, me, 3, 10, 0);
    G.flood(fight, me, 4);
    assert.equal(G.costAt(8, 10, 5), 0, 'the pull costs no move');
    assert.equal(G.spentAt(8, 10, 5), true);
    assert.equal(G.spentAt(10, 10, 5), true, 'nor does anything walked on from it leave the action');
    assert.equal(G.spentAt(4, 10, 0), false);
    assert.ok(fight.commandSelectUnit(me.id));
    fight._act.steps = 4;
    fight.setCursor(10, 10, 5);
    assert.ok(fight.commandMoveTo(10, 10));
    w.run(600, () => !fight._act || fight._act.unitId !== me.id || fight._act.stage === 'command');
    assert.ok(!fight._act || fight._act.unitId !== me.id, 'its turn ended on arriving: no command after the pull');
    assert.ok(fight._tac.acted[me.id]);
    const source = read('runtime/reactor_fight_tactical.js');
    assert.match(source, /for \(let at = ai\.spent\[index\] \? actions\.length : from; at < actions\.length; at\+\+\)/);
    assert.match(source, /ai\.place = positionScore\(fight, x, y, height\) - ai\.cost\[index\] \* 0\.05 - ai\.loss\[index\] \/ ai\.mhp \* AI\.FALL_WEIGHT;/);
});

test('a unit that decides for itself takes its grapple up to whoever stands on the roof', () => {
    const w = towerWorld({ battleClimb: false }), F = w.ReactorFight, G = F.Grid;
    w.$dataArmors[1] = { id: 1, name: 'Grappler', atypeId: 1, etypeId: 5, traits: [], params: [0, 0, 0, 0, 0, 0, 0, 0], iconIndex: 0, price: 0, description: '', note: '',
        rrGrapple: { range: 6, height: 10, uses: 0, cooldown: 2, cost: 'move', moveCost: 2 } };
    const fight = begin(w), me = hero(w), foe = fight._units.find(u => u.team === 'enemy');
    wear(w, fight.battler(me), w.$dataArmors[1]);
    put(w, me, 3, 10, 0);
    put(w, foe, 10, 10, 5);
    for (const u of fight._units) if (u !== me && u !== foe) put(w, u, 1 + u.id, 25, 0);
    // The hero's turn handed to the hero itself.
    fight._act = { unitId: me.id, steps: F.moveOf(me), stage: 'ai', player: false };
    F.AI.forget();
    let plan = null;
    for (let i = 0; i < 300 && !plan; i++) { F.AI.tick = i + 1; plan = F.AI.think(fight, me, fight.character(me)); }
    assert.ok(plan, 'it decided');
    assert.equal(plan.steps[0] && plan.steps[0].kind, 'grapple', 'up by the grapple: ' + JSON.stringify(plan.steps.map(s => s.kind)));
    assert.ok(plan.steps[plan.steps.length - 1].height > 4.9, 'and it ends on the roof');
});

test('the Database: an armor\'s Grapple section reads, writes and clears rrGrapple; the page builds it', () => {
    const S = require(path.join(repo, 'editor', 'src', 'database', 'GrappleSection.js'));
    assert.equal(S.read({}), null);
    const armor = { id: 3 };
    assert.deepEqual(S.write(armor, null), { range: 6, height: 10, uses: 0, cooldown: 2, cost: 'move', moveCost: 2 }, 'switched on: the defaults');
    const before = armor.rrGrapple;
    S.write(armor, { range: '9', cost: 'action', cooldown: 2.7, height: 999 });
    assert.notEqual(armor.rrGrapple, before, 'a new object');
    assert.deepEqual(armor.rrGrapple, { range: 9, height: 50, uses: 0, cooldown: 2, cost: 'action', moveCost: 2 });
    assert.equal(S.write(armor, null, false), null);
    assert.equal('rrGrapple' in armor, false, 'off: no key at all');
    // The game reads what the card writes, the same way.
    const w = realWorld();
    assert.deepEqual(plain(w.ReactorFight.grappleSpec({ rrGrapple: S.write({}, { range: 4, uses: 1 }) })), { range: 4, height: 10, uses: 1, cooldown: 2, cost: 'move', moveCost: 2 });
    assert.equal(w.ReactorFight.grappleSpec({ rrGrapple: { enabled: false } }), null);
    assert.deepEqual(plain(w.ReactorFight.GRAPPLE_DEFAULTS), plain(S.DEFAULTS));
    assert.match(read('editor/src/database/DatabaseArmorEditor.js'), /window\.RRGrapple\?\.createSection\(\{ record: armor, databaseManager: this\.databaseManager \}\)/);
    assert.match(read('editor/index.html'), /<script src="src\/database\/GrappleSection\.js"><\/script>/);
});
