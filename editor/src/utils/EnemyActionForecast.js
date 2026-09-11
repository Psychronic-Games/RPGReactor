/**
 * Works out which of an enemy's action patterns can actually be chosen, and
 * how often, by mirroring the runtime's own selection code.
 *
 * The rule that surprises people is the rating window. `selectAllActions`
 * (runtime/reactor_objects.js) takes the highest rating among the actions that
 * are valid *at that moment* and discards everything below a threshold measured
 * down from it. A rating is therefore never meaningful on its own: an action
 * dies whenever some better-rated action is valid alongside it, and it revives
 * when that competitor cannot pay its cost.
 *
 * VisuMZ_3_BattleAI replaces `selectAllActions` and moves the threshold, so the
 * rule in force depends on the project's plugin manifest. `rules()` reads it.
 *
 * Everything here is pure: callers pass the database records in and get plain
 * objects back, so the whole module is exercised by tests without a DOM.
 */
(function(root) {
    'use strict';

    const DEFAULT_MAX_TP = 100;

    const TURN = 1, HP = 2, MP = 3, USER_STATE = 4, PARTY_LEVEL = 5,
        SWITCH = 6, TP = 7, TARGET_STATE = 8, USER_LACKS_STATE = 9,
        TARGET_LACKS_STATE = 10;

    const STATE_TYPES = [USER_STATE, USER_LACKS_STATE, TARGET_STATE, TARGET_LACKS_STATE];
    const USER_STATE_TYPES = [USER_STATE, USER_LACKS_STATE];

    /* The engine's own window: ratingZero = max - 3, keep rating > ratingZero. */
    const ENGINE_RULES = Object.freeze({
        source: 'engine', style: 'classic', window: 3, inclusive: false,
        onSpotAI: false, minTurn: 1
    });

    /**
     * Which selection rule the project actually runs.
     *
     * VisuMZ_3_BattleAI's classic style keeps `rating >= max - variance`, which
     * is a different comparison from the engine's `rating > max - 3` as well as
     * a different width. Its `random` and `casual` styles ignore rating
     * entirely; `gambit` always takes the first valid row.
     *
     * `minTurn` is the lowest value a turn condition can ever see. Reactor's
     * `Game_Battler.turnCount` returns `$gameTroop.turnCount() + 1`, so the
     * first battle turn is 1 and a condition on turn 0 is unreachable. Battle
     * AI's on-the-spot mode drops that `+ 1`, and turn 0 becomes reachable.
     *
     * Whether that mode's branch is actually taken also depends on the battle
     * system, which is not knowable here: CoreEngine resolves it through
     * `$gameSystem.getBattleSystem()`, and a plugin command can change it
     * mid-game. So on-the-spot widens the search to include turn 0 rather than
     * trying to decide. Widening can only ever drop a warning, never invent
     * one, which is the safe direction for a panel whose whole value is that
     * its "never fires" verdicts are trustworthy.
     */
    function rules(plugins) {
        const battleAI = (plugins || []).find(p => p && p.status === true && p.name === 'VisuMZ_3_BattleAI');
        if (!battleAI) return { ...ENGINE_RULES };
        const general = parseStruct(battleAI.parameters && battleAI.parameters['General:struct']);
        const style = String(general['EnemyStyleAI:str'] || 'classic').toLowerCase().trim();
        const variance = clamp(Number(general['EnemyRatingVariance:num']), 0, 9, 0);
        const onSpotAI = String(general['OnSpotAI:eval']).trim() === 'true';
        return {
            source: 'battleAI', style, window: variance, inclusive: true,
            onSpotAI, minTurn: onSpotAI ? 0 : 1
        };
    }

    function parseStruct(raw) {
        if (typeof raw !== 'string' || raw === '') return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) { return {}; }
    }

    function clamp(n, min, max, fallback) {
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    }

    /** Reactor stores several conditions per action; MZ data has one. */
    function conditions(action) {
        if (!action) return [];
        if (Array.isArray(action.conditions)) {
            return action.conditions
                .filter(c => c && Number.isInteger(c.type) && c.type > 0)
                .map(c => ({ type: c.type, param1: Number(c.param1) || 0, param2: Number(c.param2) || 0 }));
        }
        const type = Number(action.conditionType) || 0;
        if (type <= 0) return [];
        return [{
            type,
            param1: Number(action.conditionParam1) || 0,
            param2: Number(action.conditionParam2) || 0
        }];
    }

    function maxTp(enemy) {
        const raw = enemy ? enemy.maxTp : undefined;
        const authored = typeof raw === 'number' || (typeof raw === 'string' && String(raw).trim() !== '');
        const stored = authored ? Number(raw) : NaN;
        return Number.isFinite(stored) ? Math.max(0, stored) : DEFAULT_MAX_TP;
    }

    function maxMp(enemy) {
        const n = Number(enemy && enemy.params && enemy.params[1]);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    /** Mirrors Game_Battler.meetsActionCondition. */
    function meets(condition, state) {
        const { type, param1, param2 } = condition;
        switch (type) {
            case TURN:
                return param2 === 0
                    ? state.turn === param1
                    : state.turn > 0 && state.turn >= param1 && state.turn % param2 === param1 % param2;
            case HP: return state.hpRate >= param1 && state.hpRate <= param2;
            case MP: return state.mpRate >= param1 && state.mpRate <= param2;
            case TP: return state.tpRate >= param1 && state.tpRate <= param2;
            case USER_STATE: return state.userStates.has(param1);
            case USER_LACKS_STATE: return !state.userStates.has(param1);
            case TARGET_STATE: return state.targetStates.has(param1);
            case TARGET_LACKS_STATE: return !state.targetStates.has(param1);
            case PARTY_LEVEL: return state.partyLevel >= param1;
            case SWITCH: return state.switches.has(param1);
            default: return false;
        }
    }

    /**
     * Skills by id, for either array shape in circulation.
     *
     * `$dataSkills` is padded with a leading null so index and id agree, but
     * `DatabaseManager.getSkills()` hands back a dense list where they do not:
     * there, entry 43 is skill 44. Indexing straight into that reads a
     * neighbour's costs and quietly changes every answer, so all lookups go
     * through here. An already-built index passes through untouched, which is
     * what keeps the sweep from rebuilding it per grid point.
     */
    function skillIndex(skills) {
        if (skills instanceof Map) return skills;
        const byId = new Map();
        for (const skill of skills || []) if (skill && Number.isFinite(skill.id)) byId.set(skill.id, skill);
        return byId;
    }

    /**
     * Mirrors the part of Game_BattlerBase.canUse an enemy can fail at edit
     * time: an occasion that excludes battle, or a cost it cannot pay. Skill
     * sealing and custom requirements come from traits and plugins, so they are
     * out of reach here and are reported as unmodelled rather than guessed at.
     */
    function canUse(skill, state) {
        if (!skill) return false;
        if (skill.occasion === 2 || skill.occasion === 3) return false;
        if (Number(skill.mpCost || 0) > state.mp) return false;
        if (Number(skill.tpCost || 0) > state.tp) return false;
        return true;
    }

    function validActions(enemy, skills, state) {
        const byId = skillIndex(skills);
        return (enemy.actions || [])
            .map((action, index) => ({ action, index }))
            .filter(({ action }) =>
                conditions(action).every(c => meets(c, state))
                && canUse(byId.get(action.skillId), state));
    }

    /**
     * The surviving pool and each row's share of it.
     *
     * Weight-proportional shares are exact for the engine's rule. Under Battle
     * AI a zero-width window makes every weight zero, and its shuffled draw
     * then picks uniformly; a wider window skews the draw by one step per row,
     * so those shares are flagged inexact rather than dressed up as precise.
     */
    function pool(valid, rules_) {
        if (valid.length === 0) return { ceiling: null, entries: [], exact: true };
        const ceiling = Math.max(...valid.map(v => v.action.rating));
        const zero = ceiling - rules_.window;
        const kept = valid.filter(v => rules_.inclusive ? v.action.rating >= zero : v.action.rating > zero);
        const weights = kept.map(v => v.action.rating - zero);
        const sum = weights.reduce((a, b) => a + b, 0);
        const exact = sum === 0 || rules_.source === 'engine';
        const entries = kept.map((v, i) => ({
            index: v.index,
            action: v.action,
            rating: v.action.rating,
            weight: weights[i],
            chance: sum === 0 ? 1 / kept.length : weights[i] / sum
        }));
        return { ceiling, entries, exact };
    }

    /** One situation: the pool that results from a given battle state. */
    function forecast(enemy, skills, rules_, state) {
        const normalized = normalizeState(enemy, state);
        const valid = validActions(enemy, skillIndex(skills), normalized);
        return { state: normalized, valid, ...pool(valid, rules_) };
    }

    function normalizeState(enemy, state) {
        const tpMax = maxTp(enemy) || DEFAULT_MAX_TP;
        const mpMax = maxMp(enemy);
        const s = state || {};
        const tp = Number.isFinite(s.tp) ? s.tp : tpMax;
        const mp = Number.isFinite(s.mp) ? s.mp : mpMax;
        return {
            turn: Number.isFinite(s.turn) ? s.turn : 1,
            hpRate: Number.isFinite(s.hpRate) ? s.hpRate : 1,
            mp, mpRate: mpMax > 0 ? mp / mpMax : 0,
            tp, tpRate: tpMax > 0 ? tp / tpMax : 0,
            partyLevel: Number.isFinite(s.partyLevel) ? s.partyLevel : 99,
            userStates: toSet(s.userStates),
            targetStates: toSet(s.targetStates),
            switches: toSet(s.switches)
        };
    }

    function toSet(value) {
        if (value instanceof Set) return value;
        return new Set(Array.isArray(value) ? value : []);
    }

    /**
     * Which what-if controls are worth showing. A resource only matters when
     * some condition reads it or some skill charges it, so an enemy whose
     * actions are all free and unconditional gets no controls at all.
     */
    function variables(enemy, skills) {
        const actions = enemy.actions || [];
        const all = actions.flatMap(a => conditions(a));
        const byId = skillIndex(skills);
        const used = type => all.some(c => c.type === type);
        const costs = key => actions.some(a => Number((byId.get(a.skillId) || {})[key] || 0) > 0);
        const ids = types => [...new Set(all.filter(c => types.includes(c.type)).map(c => c.param1))].sort((a, b) => a - b);
        return {
            turn: used(TURN),
            hp: used(HP),
            mp: used(MP) || costs('mpCost'),
            tp: used(TP) || costs('tpCost'),
            partyLevel: used(PARTY_LEVEL),
            userStates: ids(USER_STATE_TYPES),
            targetStates: ids([TARGET_STATE, TARGET_LACKS_STATE]),
            switches: ids([SWITCH])
        };
    }

    /* ---------------------------------------------------------------- audit */

    const MAX_TOGGLE_IDS = 8;      // 2^8 subsets per toggle group
    const MAX_GRID_POINTS = 300000;

    function axisValues(enemy, skills, vars, rules_) {
        const minTurn = Number.isFinite(rules_ && rules_.minTurn) ? rules_.minTurn : 1;
        const byId = skillIndex(skills);
        const all = (enemy.actions || []).flatMap(a => conditions(a));
        const tpMax = maxTp(enemy) || DEFAULT_MAX_TP;
        const mpMax = maxMp(enemy);

        const turns = new Set([minTurn, 1]);
        for (const c of all) {
            if (c.type !== TURN) continue;
            if (c.param2 === 0) { if (c.param1 >= minTurn) turns.add(c.param1); continue; }
            // A repeating window needs one hit and one miss inside the period.
            for (let k = 0; k < 3; k++) turns.add(Math.max(minTurn, c.param1 + c.param2 * k));
            turns.add(Math.max(minTurn, c.param1 + 1));
        }

        const rates = type => {
            const out = new Set([0, 1]);
            for (const c of all) {
                if (c.type !== type) continue;
                out.add(clamp(c.param1, 0, 1, 0));
                out.add(clamp(c.param2, 0, 1, 1));
                if (c.param1 > 0) out.add(clamp(c.param1 - 0.01, 0, 1, 0));
                if (c.param2 < 1) out.add(clamp(c.param2 + 0.01, 0, 1, 1));
            }
            return [...out];
        };

        const resource = (key, max, rateType) => {
            const out = new Set([0, max]);
            for (const a of enemy.actions || []) {
                const cost = Number((byId.get(a.skillId) || {})[key] || 0);
                if (cost > 0 && cost <= max) { out.add(cost); out.add(Math.max(0, cost - 1)); }
            }
            for (const rate of rates(rateType)) out.add(Math.round(rate * max));
            return [...out].filter(v => v >= 0 && v <= max);
        };

        return {
            turns: vars.turn ? [...turns].sort((a, b) => a - b) : [Math.max(minTurn, 1)],
            hpRates: vars.hp ? rates(HP) : [1],
            mps: vars.mp ? resource('mpCost', mpMax, MP) : [mpMax],
            tps: vars.tp ? resource('tpCost', tpMax, TP) : [tpMax],
            partyLevels: vars.partyLevel
                ? [...new Set([1, ...all.filter(c => c.type === PARTY_LEVEL).map(c => c.param1)])]
                : [99],
            userStateSets: subsets(vars.userStates),
            targetStateSets: subsets(vars.targetStates),
            switchSets: subsets(vars.switches)
        };
    }

    function subsets(ids) {
        if (ids.length === 0) return [[]];
        const capped = ids.slice(0, MAX_TOGGLE_IDS);
        const out = [[]];
        for (const id of capped) for (const existing of [...out]) out.push([...existing, id]);
        return out;
    }

    /**
     * Sweeps the battle states that can change an outcome and records, per
     * action row: whether it was ever chosen, whether it was ever even valid,
     * and the lowest ceiling seen while it was valid.
     *
     * That last figure is what separates the two ways of losing. A row that is
     * never valid has a condition or a cost problem. A row that is often valid
     * but whose lowest observed ceiling still outranks it is losing the draw,
     * and the figure names what it has to beat.
     *
     * The sweep is exhaustive over those values, so a row missing from `hit` is
     * genuinely unreachable under the modelled rules. `truncated` says the
     * space was too large to cover, and callers must not report from it.
     */
    function reachable(enemy, skills, rules_) {
        const byId = skillIndex(skills);
        const vars = variables(enemy, byId);
        const axes = axisValues(enemy, byId, vars, rules_);
        const tpMax = maxTp(enemy) || DEFAULT_MAX_TP;
        const mpMax = maxMp(enemy);
        const points = axes.turns.length * axes.hpRates.length * axes.mps.length
            * axes.tps.length * axes.partyLevels.length * axes.userStateSets.length
            * axes.targetStateSets.length * axes.switchSets.length;
        const truncated = points > MAX_GRID_POINTS
            || vars.userStates.length > MAX_TOGGLE_IDS
            || vars.targetStates.length > MAX_TOGGLE_IDS
            || vars.switches.length > MAX_TOGGLE_IDS;
        if (points > MAX_GRID_POINTS) return { hit: null, truncated: true };

        const hit = new Set();
        const everValid = new Set();
        const lowestCeiling = new Map();
        for (const userStates of axes.userStateSets)
            for (const targetStates of axes.targetStateSets)
                for (const switches of axes.switchSets)
                    for (const turn of axes.turns)
                        for (const hpRate of axes.hpRates)
                            for (const mp of axes.mps)
                                for (const tp of axes.tps)
                                    for (const partyLevel of axes.partyLevels) {
                                        const state = {
                                            turn, hpRate, mp, tp, partyLevel,
                                            mpRate: mpMax > 0 ? mp / mpMax : 0,
                                            tpRate: tpMax > 0 ? tp / tpMax : 0,
                                            userStates: new Set(userStates),
                                            targetStates: new Set(targetStates),
                                            switches: new Set(switches)
                                        };
                                        const valid = validActions(enemy, byId, state);
                                        const result = pool(valid, rules_);
                                        for (const { index } of valid) {
                                            everValid.add(index);
                                            const seen = lowestCeiling.get(index);
                                            if (seen === undefined || result.ceiling < seen) {
                                                lowestCeiling.set(index, result.ceiling);
                                            }
                                        }
                                        for (const entry of result.entries) hit.add(entry.index);
                                    }
        return { hit, everValid, lowestCeiling, truncated };
    }

    /**
     * The rows that can never be chosen, each with the reason.
     *
     * Reasons, in the order they are ruled out:
     *   `no-skill`  the skill id points at nothing
     *   `occasion`  the skill is not usable in battle
     *   `cost`      the cost exceeds what this enemy can ever hold
     *   `condition` affordable, but the conditions never hold together
     *   `outranked` valid, but the ceiling always sits above its rating
     *
     * `outranked` carries `ceiling`, the lowest ceiling seen while the row was
     * valid, and `blockers` where a fixed set of rows is responsible: the free,
     * unconditional, battle-usable rows that hold the ceiling up in every state.
     */
    function audit(enemy, skills, rules_) {
        const actions = enemy.actions || [];
        const byId = skillIndex(skills);
        const { hit, everValid, lowestCeiling, truncated } = reachable(enemy, byId, rules_);
        // A partial search can miss the one state that revives an action, so a
        // truncated sweep reports nothing rather than a plausible false alarm.
        if (!hit || truncated) return { dead: [], truncated: true };

        const floor = alwaysValid(enemy, byId);
        const pinned = floor.length ? Math.max(...floor.map(v => v.action.rating)) : null;

        const dead = [];
        actions.forEach((action, index) => {
            if (hit.has(index)) return;
            const skill = byId.get(action.skillId);
            if (!skill) { dead.push({ index, action, reason: 'no-skill' }); return; }
            if (skill.occasion === 2 || skill.occasion === 3) { dead.push({ index, action, reason: 'occasion' }); return; }
            if (Number(skill.mpCost || 0) > maxMp(enemy) || Number(skill.tpCost || 0) > (maxTp(enemy) || DEFAULT_MAX_TP)) {
                dead.push({ index, action, reason: 'cost' }); return;
            }
            if (!everValid.has(index)) { dead.push({ index, action, reason: 'condition' }); return; }
            const ceiling = lowestCeiling.get(index);
            dead.push({
                index, action, reason: 'outranked', ceiling,
                blockers: pinned === ceiling
                    ? floor.filter(v => v.action.rating === ceiling).map(v => v.index)
                    : []
            });
        });
        return { dead, truncated };
    }

    /** Rows that are valid in every battle state, and so pin the ceiling up. */
    function alwaysValid(enemy, skills) {
        const byId = skillIndex(skills);
        return (enemy.actions || [])
            .map((action, index) => ({ action, index }))
            .filter(({ action }) => {
                if (conditions(action).length > 0) return false;
                const skill = byId.get(action.skillId);
                if (!skill || skill.occasion === 2 || skill.occasion === 3) return false;
                return Number(skill.mpCost || 0) === 0 && Number(skill.tpCost || 0) === 0;
            });
    }

    const api = {
        DEFAULT_MAX_TP,
        alwaysValid,
        audit,
        canUse,
        conditions,
        forecast,
        maxMp,
        maxTp,
        meets,
        pool,
        reachable,
        rules,
        skillIndex,
        validActions,
        variables
    };
    root.RREnemyActionForecast = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
