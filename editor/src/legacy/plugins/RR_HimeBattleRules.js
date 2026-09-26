/*:
 * @target MZ
 * @plugindesc Battle Rules (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeBattleRules.js
 *
 * A battle is won or lost by rules instead of "every enemy / every actor
 * down". A rule is written in a map's note, or in a comment on a troop page
 * or on the map event page that starts the battle:
 *   <victory rule: set>        (or add; <defeat rule: …> alike)
 *   cond: $game_troop.members[0].dead?
 *   desc: Defeat the commander
 *   group: 1
 *   </victory rule>
 * Rules in one group must all hold; any one group ends the battle. "set"
 * rules replace the wider ones (event over troop over map over the defaults),
 * "add" rules from the map, troop and event are added as groups of their own.
 * Defeat is checked before victory. Lines are read as written: an indented
 * "cond:" is not seen (the rule then always holds), and a condition stops at
 * its second colon.
 *
 * The conditions were Ruby; the import translated the ones it could into
 * JavaScript (the conditions table). A condition it could not translate is
 * never met, with a console warning when its battle starts. A condition not
 * in the table (written after the import) is read as JavaScript.
 *
 * An event's rules stay for every battle after it until another event starts
 * one, random encounters included. A battle started where no map event runs
 * (a common event with no event) uses no event rules; the original stopped
 * with an error there. With Yanfly's Death Common Events, a defeat rule met
 * while an actor still stands does not end the battle.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param defaultVictory
 * @text Default victory rules
 * @default [["$game_troop.all_dead?","All enemies defeated"]]
 * @desc JSON list of [condition, description]; one group.
 *
 * @param defaultDefeat
 * @text Default defeat rules
 * @default [["$game_party.all_dead?","All allies defeated"]]
 * @desc JSON list of [condition, description]; one group.
 *
 * @param conditions
 * @text Translated conditions
 * @default {}
 * @desc JSON: Ruby condition → JavaScript, or null when it could not be translated.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HimeBattleRules');
    const json = (t, d) => { try { return JSON.parse(t); } catch (_) { return d; } };
    const DEFAULT_VICTORY = json(params.defaultVictory, null) || [['$game_troop.all_dead?', 'All enemies defeated']];
    const DEFAULT_DEFEAT = json(params.defaultDefeat, null) || [['$game_party.all_dead?', 'All allies defeated']];
    const TABLE = Object.assign({ '$game_troop.all_dead?': '$gameTroop.isAllDead()', '$game_party.all_dead?': '$gameParty.isAllDead()', 'true': 'true' },
        json(params.conditions, {}) || {});
    const VICTORY = /<victory rule: (\w+)>(.*?)<\/victory rule>/is;
    const DEFEAT = /<defeat rule: (\w+)>(.*?)<\/defeat rule>/is;

    const emptyRules = () => ({ setVictory: new Map(), addVictory: new Map(), setDefeat: new Map(), addDefeat: new Map() });
    const addTo = (groups, rule) => {
        if (!groups.has(rule.group)) groups.set(rule.group, []);
        groups.get(rule.group).push(rule);
    };
    /** One rule from its lines. Each splits at every colon: the name must start the line, the value is the text up to a second colon. */
    const parseRule = (body) => {
        const rule = { condition: 'true', description: '', group: 1 };
        for (const tag of body.trim().split(/\r?\n/)) {
            const [name, value] = tag.split(':');
            if (!name) continue;
            const key = name.toLowerCase();
            if (key === 'cond') rule.condition = value;
            else if (key === 'desc') rule.description = value;
            else if (key === 'group') rule.group = parseInt(value, 10) || 0;
        }
        return rule;
    };
    const addRule = (rules, rule, category, type) => {
        const t = String(type).toLowerCase();
        if (t !== 'set' && t !== 'add') return;
        addTo(rules[t + category], rule);
    };
    /** A page's comments as the original gathered them: each 108 with its 408 lines. */
    const comments = (list) => {
        const out = [];
        let comment = '';
        for (const cmd of list || []) {
            if (cmd.code === 108) { if (comment) out.push(comment); comment = String(cmd.parameters[0]); }
            else if (cmd.code === 408) comment += '\r\n' + cmd.parameters[0];
        }
        out.push(comment);
        return out;
    };
    // A comment holds at most one victory and one defeat rule; a map note any number.
    const fromComments = (list) => {
        const rules = emptyRules();
        for (const comment of list) {
            for (const [re, category] of [[VICTORY, 'Victory'], [DEFEAT, 'Defeat']]) {
                const m = re.exec(comment);
                if (m) addRule(rules, parseRule(m[2]), category, m[1]);
            }
        }
        return rules;
    };
    const cache = new WeakMap();
    const cached = (obj, make) => { if (!obj) return emptyRules(); if (!cache.has(obj)) cache.set(obj, make(obj)); return cache.get(obj); };
    const mapRules = () => cached($dataMap, (map) => {
        const rules = emptyRules();
        for (const [re, category] of [[VICTORY, 'Victory'], [DEFEAT, 'Defeat']]) {
            for (const m of String(map.note || '').matchAll(new RegExp(re.source, 'gis'))) addRule(rules, parseRule(m[2]), category, m[1]);
        }
        return rules;
    });
    const troopRules = () => cached($gameTroop.troop(), (troop) => fromComments(troop.pages.flatMap(p => comments(p.list))));
    const pageRules = (page) => cached(page, (p) => fromComments(comments(p.list)));
    const eventRules = () => $gameTemp._rrBattleRules || emptyRules();

    // A Battle Processing command keeps the running event's rules for this and later battles.
    const _command301 = Game_Interpreter.prototype.command301;
    Game_Interpreter.prototype.command301 = function(params) {
        const event = $gameMap.event(this._eventId);
        $gameTemp._rrBattleRules = event && event.page() ? pageRules(event.page()) : emptyRules();
        return _command301.call(this, params);
    };

    const compiled = new Map();
    const warned = new Set();
    /** The rule's condition as a function, or null when it cannot be evaluated. */
    const compile = (condition) => {
        const text = String(condition ?? '').trim();
        if (compiled.has(text)) return compiled.get(text);
        let js = Object.prototype.hasOwnProperty.call(TABLE, text) ? TABLE[text] : text;
        let fn = null;
        if (js !== null && js !== '') { try { fn = new Function('return (' + js + ');'); } catch (_) { fn = null; } }
        compiled.set(text, fn);
        return fn;
    };
    const conditionsOf = (defaults, set, add) => {
        const scopes = [eventRules(), troopRules(), mapRules()];
        const base = scopes.find(r => r[set].size);
        const groups = base ? Array.from(base[set].values()) : [defaults.map(([condition, description]) => ({ condition, description, group: 1 }))];
        for (const r of [mapRules(), troopRules(), eventRules()]) groups.push(...r[add].values());
        for (const rule of groups.flat()) {
            const text = String(rule.condition ?? '').trim();
            if (!compile(text) && !warned.has(text)) {
                warned.add(text);
                console.warn('Battle Rules: condition not translated, never met:', text);
            }
        }
        return groups;
    };

    const _setup = BattleManager.setup;
    BattleManager.setup = function() {
        _setup.apply(this, arguments);
        this._rrBrDefeated = false;
        this._rrVictoryConditions = conditionsOf(DEFAULT_VICTORY, 'setVictory', 'addVictory');
        this._rrDefeatConditions = conditionsOf(DEFAULT_DEFEAT, 'setDefeat', 'addDefeat');
    };

    // Ruby truth: only false and nil fail. A condition that throws fails.
    const holds = (rule) => {
        const fn = compile(rule.condition);
        if (!fn) return false;
        try { const v = fn.call(BattleManager); return v !== false && v !== null && v !== undefined; }
        catch (error) {
            const text = String(rule.condition ?? '').trim();
            if (!warned.has(text)) { warned.add(text); console.warn('Battle Rules:', text, error); }
            return false;
        }
    };
    const met = (groups) => (groups || []).some(group => group.length > 0 && group.every(holds));
    BattleManager.rrVictoryConditionsMet = function() { return met(this._rrVictoryConditions); };
    BattleManager.rrDefeatConditionsMet = function() { return met(this._rrDefeatConditions); };

    BattleManager.checkBattleEnd = function() {
        if (!this._phase) return false;
        if ($gameParty.isEscaped()) {
            this.processPartyEscape();
            return true;
        }
        if (this.rrDefeatConditionsMet()) {
            this.processDefeat();
            // A defeat another script turned away (the party still standing) lets the battle go on.
            if (this._phase === 'battleEnd') this._rrBrDefeated = true;
            return this._phase === 'battleEnd' || !!this._rrDeathEvent;
        }
        if (this.rrVictoryConditionsMet()) {
            this.processVictory();
            return true;
        }
        return false;
    };

    // A lost battle ends in defeat even with actors standing: revive and leave, or game over.
    const _updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function() {
        if (this._rrBrDefeated && !this._escaped && !this.isBattleTest() && !$gameParty.isAllDead()) {
            if (this._canLose) {
                $gameParty.reviveBattleMembers();
                SceneManager.pop();
            } else {
                SceneManager.goto(Scene_Gameover);
            }
            return;
        }
        _updateBattleEnd.call(this);
    };
})();
