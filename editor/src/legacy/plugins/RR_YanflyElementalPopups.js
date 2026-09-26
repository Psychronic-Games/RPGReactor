/*:
 * @target MZ
 * @plugindesc Elemental Popups (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyElementalPopups.js
 *
 * HP damage popups of the Ace Battle Engine take the colour (and size, zoom
 * and font) of the element of the skill that dealt them: its own element,
 * or for a Normal Attack element the attacker's attack element that hurts
 * the target most. An element missing from the table, and healing, MP and
 * other popups, keep the Battle Engine's own look.
 *
 * The rules are added under "ELEMENT_n" names, laid out as the Battle
 * Engine's (zoom1, zoom2, size, bold, italic, red, green, blue, font), in
 * window.RRYanflyElementalPopups.rules. A popup made while a skill applies
 * with the rule "HP_DMG" is made with the element's rule instead; the rule
 * name is also left on the target's result as rrElementPopupRule.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param rules
 * @type multiline_string
 * @default {}
 * @desc JSON: { "ELEMENT_n": [zoom1, zoom2, size, bold, italic, red, green, blue, [font names]] }.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyElementalPopups');
    let RULES = {};
    try { RULES = JSON.parse(params.rules || '{}') || {}; } catch (_) { RULES = {}; }
    const api = window.RRYanflyElementalPopups = { rules: RULES };

    /** The popup rule for HP damage from `item` by `user` on this battler. */
    Game_Battler.prototype.rrElementPopupTag = function(user, item) {
        if (!item) return 'HP_DMG';
        let text = 'ELEMENT_';
        if (item.damage.elementId < 0) {
            const elements = user.attackElements();
            if (!elements.length) return 'HP_DMG';
            const rate = Math.max(...elements.map(id => this.elementRate(id)));
            const hit = elements.find(id => this.elementRate(id) === rate);
            if (hit !== undefined) text += hit;
        } else {
            text += item.damage.elementId;
        }
        return Object.prototype.hasOwnProperty.call(api.rules, text) ? text : 'HP_DMG';
    };

    // The tag holds while the skill applies to this battler.
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        const tag = target.rrElementPopupTag(this.subject(), this.item());
        target._rrElementPopupTag = tag;
        try {
            _apply.call(this, target);
        } finally {
            target._rrElementPopupTag = null;
        }
        target.result().rrElementPopupRule = tag;
    };

    // The Battle Engine's popup (when it is in the game) makes HP damage with the element's rule.
    const wrap = (proto) => {
        if (!Object.prototype.hasOwnProperty.call(proto, 'rrCreatePopup') || proto.rrCreatePopup._rrElemental) return;
        const base = proto.rrCreatePopup;
        const wrapped = function(value, rules = 'DEFAULT', ...rest) {
            if (rules === 'HP_DMG' && this._rrElementPopupTag) rules = this._rrElementPopupTag;
            return base.call(this, value, rules, ...rest);
        };
        wrapped._rrElemental = true;
        proto.rrCreatePopup = wrapped;
    };
    const install = () => { wrap(Game_BattlerBase.prototype); wrap(Game_Battler.prototype); };
    install();
    const _start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        install();
        _start.call(this);
    };
})();
