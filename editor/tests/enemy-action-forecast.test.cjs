const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const forecast = require('../src/utils/EnemyActionForecast.js');

const repoRoot = path.resolve(__dirname, '..', '..');

/* A skill list indexed by id, the shape $dataSkills has. */
function skillList(entries) {
    const skills = [null];
    for (const entry of entries) skills[entry.id] = { occasion: 1, mpCost: 0, tpCost: 0, ...entry };
    return skills;
}

function enemy(actions, extra = {}) {
    return { id: 1, name: 'Test', params: [100, 100, 10, 10, 10, 10, 10, 10], actions, ...extra };
}

function always(skillId, rating) {
    return { skillId, rating, conditionType: 0, conditionParam1: 0, conditionParam2: 0 };
}

function when(skillId, rating, type, param1 = 0, param2 = 0) {
    return { skillId, rating, conditionType: type, conditionParam1: param1, conditionParam2: param2 };
}

const ENGINE = forecast.rules([]);
const BATTLE_AI_ZERO = forecast.rules([{
    name: 'VisuMZ_3_BattleAI', status: true,
    parameters: { 'General:struct': JSON.stringify({ 'EnemyStyleAI:str': 'classic', 'EnemyRatingVariance:num': '0' }) }
}]);

test('the engine rule keeps ratings within three of the ceiling', () => {
    const skills = skillList([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    const e = enemy([always(1, 5), always(2, 4), always(3, 3), always(4, 2)]);
    const result = forecast.forecast(e, skills, ENGINE, {});
    assert.equal(result.ceiling, 5);
    // ratingZero is 2, and the filter is strictly greater, so rating 2 is out.
    assert.deepEqual(result.entries.map(entry => entry.rating), [5, 4, 3]);
    // Weights are rating - ratingZero: 3, 2 and 1 out of 6.
    assert.deepEqual(result.entries.map(entry => entry.weight), [3, 2, 1]);
    assert.equal(result.entries[0].chance, 0.5);
    assert.equal(result.exact, true);
});

test('a zero-width Battle AI window keeps only the ceiling, and picks uniformly', () => {
    const skills = skillList([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const e = enemy([always(1, 5), always(2, 5), always(3, 4)]);
    const result = forecast.forecast(e, skills, BATTLE_AI_ZERO, {});
    assert.deepEqual(result.entries.map(entry => entry.action.skillId), [1, 2]);
    assert.equal(result.entries[0].chance, 0.5);
    // Every weight is zero, so the shuffled draw is uniform rather than skewed.
    assert.equal(result.exact, true);
});

test('reads the rule in force from the plugin manifest', () => {
    assert.deepEqual(ENGINE, {
        source: 'engine', style: 'classic', window: 3, inclusive: false,
        onSpotAI: false, minTurn: 1
    });
    assert.equal(BATTLE_AI_ZERO.source, 'battleAI');
    assert.equal(BATTLE_AI_ZERO.window, 0);
    assert.equal(BATTLE_AI_ZERO.inclusive, true);
    // A disabled Battle AI leaves the engine in charge.
    const disabled = forecast.rules([{ name: 'VisuMZ_3_BattleAI', status: false, parameters: {} }]);
    assert.equal(disabled.source, 'engine');
});

test('a cost the enemy can never pay makes an action dead', () => {
    const skills = skillList([{ id: 1 }, { id: 2, mpCost: 500 }]);
    const e = enemy([always(1, 5), always(2, 9)]);
    const { dead } = forecast.audit(e, skills, ENGINE);
    assert.deepEqual(dead.map(d => [d.action.skillId, d.reason]), [[2, 'cost']]);
});

test('a condition that can never hold is named as such, not as a rating problem', () => {
    // Turn 0 with no interval: battle turns start at 1, so this never fires.
    const skills = skillList([{ id: 1 }]);
    const e = enemy([when(1, 3, 1, 0, 0)]);
    const { dead } = forecast.audit(e, skills, ENGINE);
    assert.deepEqual(dead.map(d => d.reason), ['condition']);
});

test('a free unconditional action pins the ceiling and outranks the rows below it', () => {
    const skills = skillList([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const e = enemy([always(1, 5), always(2, 4), always(3, 1)]);

    const engine = forecast.audit(e, skills, ENGINE);
    assert.deepEqual(engine.dead.map(d => d.action.skillId), [3]);
    assert.equal(engine.dead[0].reason, 'outranked');
    assert.equal(engine.dead[0].ceiling, 5);
    // The row holding the ceiling up is named so the editor can point at it.
    assert.deepEqual(engine.dead[0].blockers, [0]);

    // The same data under a zero-width window loses the rating-4 row too.
    const live = forecast.audit(e, skills, BATTLE_AI_ZERO);
    assert.deepEqual(live.dead.map(d => d.action.skillId), [2, 3]);
});

test('a cost can lower the ceiling and revive a row that looks outranked', () => {
    const skills = skillList([{ id: 1 }, { id: 2, tpCost: 15 }]);
    const e = enemy([always(1, 4), always(2, 5)]);
    // With no TP banked the rating-5 row is unusable, so rating 4 wins outright.
    const opening = forecast.forecast(e, skills, BATTLE_AI_ZERO, { tp: 0 });
    assert.deepEqual(opening.entries.map(entry => entry.action.skillId), [1]);
    // Once it is affordable the ceiling rises and the rating-4 row drops out.
    const later = forecast.forecast(e, skills, BATTLE_AI_ZERO, { tp: 15 });
    assert.deepEqual(later.entries.map(entry => entry.action.skillId), [2]);
    // So neither row is dead, even though one is invisible half the time.
    assert.deepEqual(forecast.audit(e, skills, BATTLE_AI_ZERO).dead, []);
});

test('an expensive low-rated row is outranked whenever it is affordable', () => {
    // The 50-cost row is only payable at a TP level that also affords the
    // 5-cost row above it, so it never reaches the ceiling.
    const skills = skillList([{ id: 1, tpCost: 5 }, { id: 2, tpCost: 50 }]);
    const e = enemy([always(1, 5), always(2, 2)]);
    const { dead } = forecast.audit(e, skills, BATTLE_AI_ZERO);
    assert.deepEqual(dead.map(d => [d.action.skillId, d.reason, d.ceiling]), [[2, 'outranked', 5]]);
});

test('multi-condition rows are met only when every condition holds', () => {
    const skills = skillList([{ id: 1 }]);
    const e = enemy([{
        skillId: 1, rating: 5,
        conditions: [{ type: 4, param1: 7, param2: 0 }, { type: 9, param1: 8, param2: 0 }]
    }]);
    const both = forecast.forecast(e, skills, ENGINE, { userStates: [7] });
    assert.equal(both.entries.length, 1);
    const blocked = forecast.forecast(e, skills, ENGINE, { userStates: [7, 8] });
    assert.equal(blocked.entries.length, 0);
});

test('only the variables that can change an outcome are offered as controls', () => {
    const skills = skillList([{ id: 1 }, { id: 2, tpCost: 10 }]);
    const bare = forecast.variables(enemy([always(1, 5)]), skills);
    assert.deepEqual(bare, {
        turn: false, hp: false, mp: false, tp: false, partyLevel: false,
        userStates: [], targetStates: [], switches: []
    });

    const rich = forecast.variables(enemy([when(1, 5, 2, 0, 0.5), always(2, 4)]), skills);
    assert.equal(rich.hp, true);
    assert.equal(rich.tp, true, 'a TP cost makes the TP control meaningful');
    assert.equal(rich.turn, false);

    const stateful = forecast.variables(enemy([when(1, 5, 4, 7), when(2, 4, 8, 9)]), skills);
    assert.deepEqual(stateful.userStates, [7]);
    assert.deepEqual(stateful.targetStates, [9]);
});

test('an unauthored Max TP falls back to the runtime default', () => {
    assert.equal(forecast.maxTp({}), 100);
    assert.equal(forecast.maxTp({ maxTp: 40 }), 40);
    assert.equal(forecast.maxTp({ maxTp: '0' }), 0);
});

test('the modelled rule still matches the runtime it mirrors', () => {
    // The whole panel is wrong if selectAllActions changes shape, so pin the
    // two things the model depends on: the window width and the comparison.
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    const body = source.slice(source.indexOf('Game_Enemy.prototype.selectAllActions'));
    assert.match(body, /const ratingZero = ratingMax - 3;/);
    assert.match(body, /actionList\.filter\(a => a\.rating > ratingZero\)/);
});

test('skills are found by id, not by array position', () => {
    // DatabaseManager.getSkills() drops the leading null $dataSkills carries, so
    // index and id disagree and a positional lookup reads a neighbour's costs.
    const dense = [
        { id: 1, name: 'Attack', occasion: 1, mpCost: 0, tpCost: 0 },
        { id: 2, name: 'Costly', occasion: 1, mpCost: 0, tpCost: 15 }
    ];
    const e = enemy([always(1, 4), always(2, 5)]);
    // With no TP the rating-5 row is unusable, so the rating-4 row wins.
    const opening = forecast.forecast(e, dense, BATTLE_AI_ZERO, { tp: 0 });
    assert.deepEqual(opening.entries.map(entry => entry.action.skillId), [1]);
    assert.deepEqual(forecast.audit(e, dense, BATTLE_AI_ZERO).dead, []);

    // The same data padded the way $dataSkills is must answer identically.
    const padded = [null, ...dense];
    assert.deepEqual(
        forecast.forecast(e, padded, BATTLE_AI_ZERO, { tp: 0 }).entries.map(x => x.action.skillId),
        opening.entries.map(x => x.action.skillId));
});

test('a missing skill is reported rather than treated as free', () => {
    const skills = skillList([{ id: 1 }]);
    const e = enemy([always(1, 5), always(99, 9)]);
    const { dead } = forecast.audit(e, skills, ENGINE);
    assert.deepEqual(dead.map(d => [d.action.skillId, d.reason]), [[99, 'no-skill']]);
});

const BATTLE_AI_ON_SPOT = forecast.rules([{
    name: 'VisuMZ_3_BattleAI', status: true,
    parameters: { 'General:struct': JSON.stringify({
        'EnemyStyleAI:str': 'classic', 'EnemyRatingVariance:num': '0', 'OnSpotAI:eval': 'true'
    }) }
}]);

test('on-the-spot turn counting is read from the manifest', () => {
    assert.equal(ENGINE.onSpotAI, false);
    assert.equal(ENGINE.minTurn, 1, 'turnCount is $gameTroop.turnCount() + 1, so turn 1 is first');
    assert.equal(BATTLE_AI_ZERO.onSpotAI, false);
    assert.equal(BATTLE_AI_ZERO.minTurn, 1);
    assert.equal(BATTLE_AI_ON_SPOT.onSpotAI, true);
    assert.equal(BATTLE_AI_ON_SPOT.minTurn, 0, 'on-the-spot drops the +1, so turn 0 is reachable');
});

test('a turn-0 gate is only called dead when turn 0 is genuinely out of reach', () => {
    const skills = skillList([{ id: 1 }]);
    const e = enemy([when(1, 3, 1, 0, 0)]);
    // Engine and ordinary Battle AI: the first turn is 1, so turn 0 never comes.
    assert.deepEqual(forecast.audit(e, skills, ENGINE).dead.map(d => d.reason), ['condition']);
    assert.deepEqual(forecast.audit(e, skills, BATTLE_AI_ZERO).dead.map(d => d.reason), ['condition']);
    // On-the-spot counting can reach turn 0, so the warning must be withheld.
    assert.deepEqual(forecast.audit(e, skills, BATTLE_AI_ON_SPOT).dead, []);
});

test('widening the turn floor never invents a warning', () => {
    // Whatever else changes, the on-the-spot sweep searches a superset of the
    // ordinary one, so it can only ever report fewer unreachable rows.
    const skills = skillList([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const e = enemy([when(1, 5, 1, 0, 0), when(2, 5, 1, 2, 0), always(3, 1)]);
    const narrow = forecast.audit(e, skills, BATTLE_AI_ZERO).dead.map(d => d.index);
    const wide = forecast.audit(e, skills, BATTLE_AI_ON_SPOT).dead.map(d => d.index);
    for (const index of wide) assert.ok(narrow.includes(index), `row ${index} warned only when widened`);
});
