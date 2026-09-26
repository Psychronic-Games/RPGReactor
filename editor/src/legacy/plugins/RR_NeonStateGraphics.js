/*:
 * @target MZ
 * @plugindesc State Graphics (VX Ace), for imported games
 * @author Neon Black; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_NeonStateGraphics.js
 *
 * While a battler has a state, the state's note can change its graphics and
 * name; the highest-priority state that changes one wins:
 *   battler gfx["name" hue]        character gfx["name" index]
 *   face gfx["name" index]         name change["name"]
 * Prefixed "actor " or "enemy " with ids after the value, a line applies to
 * those actors or enemies only (actor battler gfx["name" 0 1, 2]) and comes
 * before the plain line of the same state. "stack gfx[n]" after a line keeps
 * it to stack level n; without stacking states the level is always 1.
 *
 * The walking graphic follows at once: the player is refreshed after every
 * skill or item takes effect and after Change State. A battler graphic set
 * by a state stays through the battler's collapse. Enemies have no face or
 * walking graphic to change.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const RE = {
        actor: /actor (battler|character|face) gfx\["(.+)" (\d+) ([\d, ]+)\]/i,
        enemy: /enemy (battler|character|face) gfx\["(.+)" (\d+) ([\d, ]+)\]/i,
        common: /(battler|character|face) gfx\["(.+)" (\d+)\]/i,
        name: /(actor |enemy )?name change\["(.+)"([\d, ]*)\]/i,
        stack: /stack gfx\[(\d+)\]/i
    };
    const BITS = { battler: ['battler', 'battler_hue'], character: ['chara', 'chara_ind'], face: ['face', 'face_ind'] };

    // { id: { bit: { stackLevel: value } } }, ids positive for actors, negative for enemies, 0 for everyone.
    function changes(state) {
        if (state._rrGfx) return state._rrGfx;
        const out = {};
        const put = (value, number, ids, bit, numBit, pos, invert) => {
            for (const raw of ids) {
                const id = invert ? -Math.trunc(Number(String(raw).trim()) || 0) : Math.trunc(Number(String(raw).trim()) || 0);
                const table = out[id] || (out[id] = {});
                (table[bit] || (table[bit] = {}))[pos] = value;
                if (numBit) (table[numBit] || (table[numBit] = {}))[pos] = number;
            }
        };
        for (const line of String(state.note || '').split(/[\r\n]+/)) {
            const s = RE.stack.exec(line);
            const pos = s ? Number(s[1]) : 0;
            let m;
            if ((m = RE.actor.exec(line))) put(m[2], Number(m[3]), m[4].split(','), ...BITS[m[1].toLowerCase()], pos, false);
            else if ((m = RE.enemy.exec(line))) put(m[2], Number(m[3]), m[4].split(','), ...BITS[m[1].toLowerCase()], pos, true);
            else if ((m = RE.common.exec(line))) put(m[2], Number(m[3]), [0], ...BITS[m[1].toLowerCase()], pos, false);
            else if ((m = RE.name.exec(line))) {
                const kind = (m[1] || '').toLowerCase();
                const ids = kind ? m[3].split(',') : [0];
                put(m[2], 0, ids, 'name', null, pos, kind === 'enemy ');
            }
        }
        Object.defineProperty(state, '_rrGfx', { value: out, configurable: true });
        return out;
    }

    // Stacking states are not part of these games: every state sits at level 1.
    Game_BattlerBase.prototype.rrStateStack = function() { return 1; };
    // The value a state gives for one graphic, from the highest-priority state that has one, or null.
    Game_BattlerBase.prototype.rrStateGraphicBit = function(bit) {
        const id = this.isEnemy() ? -this._enemyId : this._actorId;
        for (const state of this.states()) {
            if (!state) continue;
            const table = changes(state);
            const pos = this.rrStateStack(state.id);
            let ary = table[id] && table[id][bit];
            if (!ary && table[0]) ary = table[0][bit];
            if (ary) {
                if (ary[pos] !== undefined) return ary[pos];
                if (ary[0] !== undefined) return ary[0];
            }
        }
        return null;
    };

    const A = Game_Actor.prototype;
    for (const [method, bit] of [['faceName', 'face'], ['faceIndex', 'face_ind'], ['characterName', 'chara'], ['characterIndex', 'chara_ind'], ['name', 'name']]) {
        const original = A[method];
        A[method] = function() {
            const value = this.rrStateGraphicBit(bit);
            return value !== null ? value : original.call(this);
        };
    }
    // The battler graphic is remembered while alive, so a collapsing battler keeps it.
    const _actorBattlerName = A.battlerName;
    A.battlerName = function() {
        if (this.isAlive()) this._rrHeldBattlerName = this.rrStateGraphicBit('battler');
        return this._rrHeldBattlerName || _actorBattlerName.call(this);
    };
    A.rrBattlerHue = function() {
        const value = this.rrStateGraphicBit('battler_hue');
        return value !== null ? value : 0;
    };

    const E = Game_Enemy.prototype;
    const _enemyBattlerName = E.battlerName;
    E.battlerName = function() {
        if (this.isAlive()) this._rrHeldBattlerName = this.rrStateGraphicBit('battler');
        return this._rrHeldBattlerName || _enemyBattlerName.call(this);
    };
    const _enemyBattlerHue = E.battlerHue;
    E.battlerHue = function() {
        const value = this.rrStateGraphicBit('battler_hue');
        return value !== null ? value : _enemyBattlerHue.call(this);
    };
    const _originalName = E.originalName;
    E.originalName = function() {
        const value = this.rrStateGraphicBit('name');
        return value !== null ? value : _originalName.call(this);
    };

    // The player's walking graphic follows a state as soon as it lands or goes.
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _apply.call(this, target);
        if ($gamePlayer) $gamePlayer.refresh();
    };
    const _command313 = Game_Interpreter.prototype.command313;
    Game_Interpreter.prototype.command313 = function(params) {
        const result = _command313.call(this, params);
        $gamePlayer.refresh();
        return result;
    };

    // A new battler graphic while the battler is alive but not yet shown leaves it to appear as it would have.
    const _initVisibility = Sprite_Enemy.prototype.initVisibility;
    Sprite_Enemy.prototype.initVisibility = function() {
        if (this._rrVisibilitySet && !this._appeared && this._enemy && this._enemy.isAlive()) return;
        this._rrVisibilitySet = true;
        _initVisibility.call(this);
    };
})();
