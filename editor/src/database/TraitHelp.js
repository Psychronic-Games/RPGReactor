/**
 * TraitHelp - one sentence per trait, and per choice inside a trait's dropdown.
 *
 * A trait row says what it is called, not what it does. "Sp-Parameter" does not
 * say that its values multiply where "Ex-Parameter" sums them; "Attack Element"
 * does not say that several of them resolve to the target's worst rate rather
 * than to a product. Those are the things an author actually has to know, and
 * until now the only place they were written down was the engine source.
 *
 * Every sentence here describes what `runtime/reactor_objects.js` really does,
 * checked against it rather than against RPG Maker's documentation - the two
 * disagree in a few places, and the runtime wins.
 *
 * Rows carry their sentence as hover help (see utils/HoverHelp.js). Dropdown
 * choices carry theirs on the <option>'s `title`, which SelectThemingShim
 * already renders as a second line in the popup - the same road ActionScopes
 * takes.
 */
class TraitHelp {
    /** One translated sentence per trait code, keyed by the code the data stores. */
    static rows() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const rowHelp = {
            11: 'Multiplies the damage this battler takes from one element. Rates from separate traits multiply together, and 0% blocks the element outright.',
            12: 'Multiplies the chance a debuff on this parameter lands. Traits multiply together, so 0% makes the battler immune to it.',
            13: 'Multiplies the chance this state lands on the battler. Certain Hit actions ignore it.',
            14: 'Makes the battler immune to this state, and erases it if it is already there.',
            21: 'Multiplies one of the eight main parameters. Separate traits multiply together, and buffs apply on top of the result.',
            22: 'Adds to one of the ten extra parameters. Every matching trait is summed, so these stack additively.',
            23: 'Multiplies one of the ten special parameters. Separate traits multiply together.',
            31: 'The element the Attack command counts as. With more than one, the highest rate the target has among them decides the damage.',
            32: 'Gives the Attack command a chance to inflict this state. Chances from separate traits are summed.',
            33: 'Added to the action speed when this battler uses the Attack command.',
            34: 'Extra hits for the Attack command. Values are summed, and a negative total counts as none.',
            35: 'Replaces the normal attack with this skill. If several apply, the highest database ID wins.',
            41: 'Unlocks a skill type, so the battler can use the skills it has learned under it.',
            42: 'Blocks every skill of this type, learned ones included.',
            43: 'Grants this skill without learning it. It still cannot be used while its skill type is sealed.',
            44: 'Blocks this one skill.',
            51: 'Lets this battler equip weapons of this type.',
            52: 'Lets this battler equip armor of this type.',
            53: 'Freezes the slot: whatever is equipped there cannot be changed or removed.',
            54: 'Empties the slot and stops anything being equipped in it.',
            55: 'Changes what the equipment slots of this battler are.',
            61: 'A chance of one extra action this turn. Each trait is rolled on its own, so several can stack.',
            62: 'Switches on one fixed battler behaviour.',
            63: 'Changes the animation played on defeat. Enemies only - actors ignore it.',
            64: 'A party-wide effect, active while this battler is in the party.'
        };
        const translated = {};
        for (const code of Object.keys(rowHelp)) translated[code] = tt(rowHelp[code]);
        return translated;
    }

    /**
     * The ten Ex-Parameters, in stored dataId order. These are the rows where a
     * label is most misleading: Hit Rate and Evasion Rate both apply to Physical
     * Attack alone, and Critical Evasion is subtracted rather than rolled.
     */
    static exParams() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const exParamHelp = [
            'Chance to land a Physical Attack. Certain Hit and Magical Attack ignore it.',
            'Chance to dodge a Physical Attack. Magical and Certain Hit ignore it.',
            'Chance of a critical hit, on skills and items that allow one.',
            'Subtracted from the critical rate of the attacker, so a negative value makes criticals likelier.',
            'Chance to dodge a Magical Attack. Physical and Certain Hit ignore it.',
            'Chance to bounce a Magical Attack back at its caster. Healing spells reflect too.',
            'Chance to answer a Physical Attack with a normal attack. The counterer has to be able to move.',
            'Share of Max HP recovered each regeneration tick: end of turn in battle, every 20 steps on the map.',
            'Share of Max MP recovered each regeneration tick.',
            'Share of Max TP recovered each regeneration tick.'
        ].map(tt);
        return exParamHelp;
    }

    /** The ten Sp-Parameters, in stored dataId order. */
    static spParams() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const spParamHelp = [
            'Weight in enemy target selection. At 200% the battler is picked twice as often as one at 100%.',
            'Strength of the Guard command. Guard halves damage; above 100% cuts more, below 100% cuts less.',
            'Multiplies the HP and MP this battler receives from healing.',
            'Multiplies healing from items only, applied after Recovery Effect. Outside battle the best value in the party is used.',
            'Multiplies the MP cost of the skills of this battler.',
            'Multiplies TP gained, both from taking damage and from the TP gain of a skill.',
            'Multiplies damage taken from skills and items whose hit type is Physical Attack.',
            'Multiplies damage taken from skills and items whose hit type is Magical Attack.',
            'Multiplies damage from damage floors. The base amount is 10 per step.',
            'Multiplies experience gained, reserve members included.'
        ].map(tt);
        return spParamHelp;
    }

    /** The four Special Flags, in stored dataId order. */
    static specialFlags() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const flagHelp = [
            'The battler chooses its own actions each turn, taking whichever scores highest.',
            'Guards every turn without spending the command. The battler has to be able to move.',
            'Takes hits aimed at allies below a quarter of their Max HP. Certain Hit actions cannot be intercepted.',
            'Carries TP between battles instead of starting each one on a random 0-24.'
        ].map(tt);
        return flagHelp;
    }

    /** The four Collapse Effects, in stored dataId order. */
    static collapseEffects() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const collapseHelp = [
            'The default fade-out, with the usual collapse sound.',
            'The tinted ribbon-split collapse used for bosses.',
            'The sprite vanishes at once, with no animation.',
            'The sprite stays on screen after defeat.',
            'The sprite breaks into drifting motes and blows away.',
            'The sprite burns away into rising embers and sparks.'
        ].map(tt);
        return collapseHelp;
    }

    /** The six Party Abilities, in stored dataId order. */
    static partyAbilities() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const partyHelp = [
            'Steps count half as much towards the next random encounter.',
            'Random encounters stop entirely. Battles started by an event still run.',
            'The party can never be caught by a surprise attack.',
            'Quadruples the chance of a preemptive strike.',
            'Doubles the gold won from battle.',
            'Doubles the drop rate of enemy items.'
        ].map(tt);
        return partyHelp;
    }

    /** The two Slot Types, in stored dataId order. */
    static slotTypes() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const slotHelp = [
            'The normal slot layout for this battler.',
            'The second slot becomes a copy of the first - usually a second weapon in place of the shield.'
        ].map(tt);
        return slotHelp;
    }

    /**
     * The runtime methods that decide a trait, so PluginOverrides can say which
     * installed plugins have replaced them. Naming the method rather than
     * guessing at behaviour is the whole point: the editor can prove a plugin
     * rewrote `elementRate`, and cannot know what it rewrote it into.
     */
    static rowMethods(code) {
        const methods = {
            11: ['elementRate', 'calcElementRate', 'elementsMaxRate'],
            12: ['debuffRate'],
            13: ['stateRate'],
            14: ['stateResistSet', 'isStateResist'],
            21: ['paramRate', 'param'],
            22: ['xparam'],
            23: ['sparam'],
            31: ['attackElements', 'calcElementRate'],
            32: ['attackStates', 'attackStatesRate', 'itemEffectAddAttackState'],
            33: ['attackSpeed', 'speed'],
            34: ['attackTimesAdd', 'numRepeats'],
            35: ['attackSkillId'],
            41: ['addedSkillTypes', 'skillTypes'],
            42: ['isSkillTypeSealed'],
            43: ['addedSkills', 'skills'],
            44: ['isSkillSealed'],
            51: ['isEquipWtypeOk'],
            52: ['isEquipAtypeOk'],
            53: ['isEquipTypeLocked'],
            54: ['isEquipTypeSealed'],
            55: ['slotType', 'isDualWield', 'equipSlots'],
            61: ['actionPlusSet', 'makeActionTimes'],
            62: ['specialFlag', 'isAutoBattle', 'isGuard', 'isSubstitute', 'isPreserveTp'],
            63: ['collapseType', 'performCollapse'],
            64: ['partyAbility']
        };
        return methods[code] || [];
    }

    /**
     * The methods a single dropdown choice runs through, where they are narrower
     * than the row's. An Ex-Parameter row rides on `xparam` whichever entry is
     * picked, but Hit Rate is spent in `itemHit` and Counter Attack in `itemCnt`,
     * and those are replaced by different plugins.
     */
    static optionMethods(code, dataId) {
        const perOption = {
            22: [['itemHit'], ['itemEva'], ['itemCri'], ['itemCri'], ['itemEva'], ['itemMrf'],
                ['itemCnt'], ['regenerateHp'], ['regenerateMp'], ['regenerateTp']],
            23: [['randomTarget', 'tgrSum'], ['applyGuard'], ['itemEffectRecoverHp', 'makeDamageValue'],
                ['itemEffectRecoverHp', 'itemEffectRecoverMp'], ['skillMpCost'],
                ['chargeTpByDamage', 'applyItemUserEffect'], ['makeDamageValue'], ['makeDamageValue'],
                ['executeFloorDamage', 'basicFloorDamage'], ['finalExpRate', 'gainExp']]
        };
        const table = perOption[code];
        const own = table && table[dataId] ? table[dataId] : [];
        return [...new Set([...TraitHelp.rowMethods(code), ...own])];
    }

    /**
     * A row's hover help: the sentence, plus a line naming any installed plugin
     * that has replaced the methods behind it. The plugin line is omitted when
     * nothing overrides them, which is the common case in a fresh project.
     */
    static rowTip(code) {
        const sentence = TraitHelp.rows()[code];
        if (!sentence) return '';
        const note = TraitHelp.overrideNote(TraitHelp.rowMethods(code));
        return note ? `${sentence}\n${note}` : sentence;
    }

    /** A dropdown choice's help, with the same plugin line appended. */
    static optionTip(code, dataId, sentence) {
        if (!sentence) return '';
        const note = TraitHelp.overrideNote(TraitHelp.optionMethods(code, dataId));
        return note ? `${sentence}\n${note}` : sentence;
    }

    /** The "Modified by ..." line, or '' when no installed plugin touches these. */
    static overrideNote(methods) {
        const overrides = globalThis.RRPluginOverrides;
        return overrides ? overrides.note(methods) : '';
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.TraitHelp = TraitHelp;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TraitHelp;
}
