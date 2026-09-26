/*:
 * @target MZ
 * @plugindesc Extra Parameter Formulas (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyExtraParamFormulas.js
 *
 * Hit, evasion, critical rates and the other extra and special parameters
 * come from the game's formulas: n is worked out from the battler's stats,
 * then the rate from n and the database value (base_hit …). The formulas
 * keep Ruby's arithmetic: whole numbers divide to a whole number, so
 * (atk + luk) / 2 with atk 6 and luk 3 is 4.
 *
 * Formulas may use + - * / ( ), numbers, n, base_<rate>, the stats (mhp,
 * mmp, atk, def, mat, mdf, agi, luk, also as self.def) and level.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param formulas
 * @type multiline_string
 * @default {}
 * @desc JSON: { hit: [n formula, rate formula], … }.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyExtraParamFormulas');
    let FORMULAS = {};
    try { FORMULAS = JSON.parse(params.formulas || '{}') || {}; } catch (_) { FORMULAS = {}; }
    const STATS = { mhp: 0, mmp: 1, atk: 2, def: 3, mat: 4, mdf: 5, agi: 6, luk: 7 };

    /**
     * A Ruby arithmetic expression compiled to a function of (battler, vars). Values carry whether they
     * are whole numbers: Integer op Integer stays whole and divides by flooring, anything with a Float is a Float.
     */
    function compile(source) {
        const tokens = String(source).match(/\d+\.\d+|\d+|self\.\w+|[A-Za-z_]\w*|[-+*/()]/g) || [];
        let i = 0;
        const peek = () => tokens[i], next = () => tokens[i++];
        const num = (v, int) => ({ v, int });
        const op = (a, o, b) => {
            const int = a.int && b.int;
            if (o === '+') return num(a.v + b.v, int);
            if (o === '-') return num(a.v - b.v, int);
            if (o === '*') return num(a.v * b.v, int);
            if (int) return num(b.v === 0 ? 0 : Math.floor(a.v / b.v), true);
            return num(a.v / b.v, false);
        };
        const primary = () => {
            const t = next();
            if (t === '(') { const v = expr(); next(); return v; }
            if (t === '-') { const v = primary(); return (b, vars) => { const x = v(b, vars); return num(-x.v, x.int); }; }
            if (/^\d+\.\d+$/.test(t)) { const v = Number(t); return () => num(v, false); }
            if (/^\d+$/.test(t)) { const v = Number(t); return () => num(v, true); }
            const name = t.replace(/^self\./, '');
            if (STATS[name] !== undefined) return (b) => num(Math.floor(b.param(STATS[name])), true);
            if (name === 'level') return (b) => num(b.level || 0, true);
            return (b, vars) => (vars[name] !== undefined ? vars[name] : num(0, true));
        };
        const term = () => {
            let left = primary();
            while (peek() === '*' || peek() === '/') { const o = next(), l = left, r = primary(); left = (b, v) => op(l(b, v), o, r(b, v)); }
            return left;
        };
        const expr = () => {
            let left = term();
            while (peek() === '+' || peek() === '-') { const o = next(), l = left, r = term(); left = (b, v) => op(l(b, v), o, r(b, v)); }
            return left;
        };
        return expr();
    }

    for (const [name, pair] of Object.entries(FORMULAS)) {
        if (!Array.isArray(pair) || !Object.getOwnPropertyDescriptor(Game_BattlerBase.prototype, name)) continue;
        const nOf = compile(pair[0]), rateOf = compile(pair[1]);
        const base = Object.getOwnPropertyDescriptor(Game_BattlerBase.prototype, name).get;
        if (!base) continue;
        Object.defineProperty(Game_BattlerBase.prototype, name, {
            configurable: true,
            get() {
                const vars = {};
                vars['base_' + name] = num0(base.call(this));
                vars.n = nOf(this, vars);
                return rateOf(this, vars).v;
            }
        });
    }
    function num0(v) { return { v: Number(v) || 0, int: false }; }
})();
