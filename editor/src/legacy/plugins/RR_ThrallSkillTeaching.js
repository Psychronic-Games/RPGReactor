/*:
 * @target MZ
 * @plugindesc Skill Teaching Equipment & Items (VX), for imported games
 * @author modern algebra (rmrk.net); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallSkillTeaching.js
 *
 * A weapon, armour or item with \ls[skill] or \ls[skill, level] in its note
 * teaches that skill: equipment while it is worn (and only from that level
 * on), an item when it is used. Taking the equipment off forgets the skills
 * it taught. In Thrall a weapon carrying element 30 (the Talented shard) also
 * teaches skills 220-224.
 *
 * Kept as the original behaves:
 *   - A skill the actor goes on to learn some other way stays "taught by
 *     equipment" (forgotten with it) unless the actor knows the skill whose
 *     id is twice its own plus one: the script asks skill_learn? of a
 *     number, and Ruby 1.8 answers with that number's object id.
 *   - The skill tree clears an actor's skills after setup, so skills the
 *     starting equipment teaches are not known until it is changed.
 *   - Items teach only above the level they name (equipment from it).
 *
 * Script calls: actor.rrRelearnEquipSkills(slot) re-reads the equipment in
 * a slot (the Talented shard calls it); RRThrallSkillTeaching.skillIds(item).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param talentElement
 * @text Talented element
 * @desc A weapon with this element teaches the Talented skills.
 * @type number
 * @default 30
 *
 * @param talentSkills
 * @text Talented skills
 * @default 220,221,222,223,224
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallSkillTeaching');
    const TALENT_ELEMENT = Number(params.talentElement || 30);
    const TALENT_SKILLS = String(params.talentSkills || '220,221,222,223,224').split(/[,\s]+/).map(Number).filter(Boolean);
    const VX = () => window.RRThrallVx || null;

    /** The weapon's elements: the battle rules' VX record, else its attack-element traits. */
    const weaponElements = (weapon) => {
        const r = VX() && VX().weapon ? VX().weapon(weapon.id) : null;
        if (r && r.element_set) return r.element_set;
        return (weapon.traits || []).filter(t => t.code === 31).map(t => t.dataId);
    };
    /** RPG::BaseItem#skill_ids: [[skillId, minLevel], …]. */
    function skillIds(item) {
        if (!item || DataManager.isSkill(item)) return [];
        const out = [];
        const re = /\\ls\[(\w+),*\s*(\d*?)\]/gi;
        for (const m of String(item.note || '').matchAll(re)) out.push([parseInt(m[1], 10) || 0, parseInt(m[2], 10) || 0]);
        if (DataManager.isWeapon(item) && weaponElements(item).includes(TALENT_ELEMENT)) for (const id of TALENT_SKILLS) out.push([id, 1]);
        return out;
    }
    window.RRThrallSkillTeaching = { skillIds };

    const A = Game_Actor.prototype;
    A.rrUnnaturalSkills = function() { return this._rrUnnaturalSkills || (this._rrUnnaturalSkills = []); };
    A.rrLearnUnnaturally = function(skillId) {
        this._rrUnnaturalLearning = true;
        this.learnSkill(skillId);
        this._rrUnnaturalLearning = false;
    };
    A.rrForgetEquipSkills = function(item) {
        const unnatural = this.rrUnnaturalSkills();
        for (const [id] of skillIds(item)) {
            if (unnatural.includes(id)) this.forgetSkill(id);
            const at = unnatural.indexOf(id);
            if (at >= 0) unnatural.splice(at, 1);
        }
    };
    A.rrLearnEquipSkills = function(item) {
        for (const [id, level] of skillIds(item)) if (!this.isLearnedSkill(id) && !(this._level < level)) this.rrLearnUnnaturally(id);
    };
    /** change_equip(slot, actor.weapon_id): a number is no item, so only the skills are read again. */
    A.rrRelearnEquipSkills = function(slotId) {
        const item = this.equips()[slotId] || null;
        this.rrForgetEquipSkills(item);
        this.rrLearnEquipSkills(this.equips()[slotId] || null);
    };

    const _changeEquip = A.changeEquip;
    A.changeEquip = function(slotId, item) {
        this.rrForgetEquipSkills(this.equips()[slotId] || null);
        _changeEquip.call(this, slotId, item);
        this.rrLearnEquipSkills(this.equips()[slotId] || null);
    };
    const _setup = A.setup;
    A.setup = function(actorId) {
        this._rrUnnaturalSkills = [];
        _setup.call(this, actorId);
        for (const item of this.equips()) if (item) this.rrLearnEquipSkills(item);
    };
    const _levelUp = A.levelUp;
    A.levelUp = function() {
        _levelUp.call(this);
        for (const item of this.equips()) if (item) this.rrLearnEquipSkills(item);
    };
    const _learnSkill = A.learnSkill;
    A.learnSkill = function(skillId) {
        const unnatural = this.rrUnnaturalSkills();
        if (this._rrUnnaturalLearning) {
            if (!unnatural.includes(skillId)) unnatural.push(skillId);
        } else if (this._skills.includes(skillId * 2 + 1)) {   // skill_learn?(skill_id): the Fixnum's object id
            const at = unnatural.indexOf(skillId);
            if (at >= 0) unnatural.splice(at, 1);
        }
        _learnSkill.call(this, skillId);
    };

    // Items: Game_Battler#item_test / item_effect (the battle rules' VX versions).
    const B = Game_BattlerBase.prototype;
    const mzItem = (item) => (item && DataManager.isItem(item) ? item : item ? $dataItems[item.id] : null);
    if (typeof B.rrVxItemTest === 'function') {
        const _test = B.rrVxItemTest;
        B.rrVxItemTest = function(user, item) {
            let effective = _test.call(this, user, item);
            if (this.isActor()) for (const [id, level] of skillIds(mzItem(item))) effective = effective || (!this.isLearnedSkill(id) && this._level > level);
            return effective;
        };
    }
    if (typeof B.rrVxItemEffect === 'function') {
        const _effect = B.rrVxItemEffect;
        B.rrVxItemEffect = function(user, item) {
            _effect.call(this, user, item);
            if (this.isActor()) for (const [id, level] of skillIds(mzItem(item))) if (this._level > level) this.learnSkill(id);
        };
    }
})();
