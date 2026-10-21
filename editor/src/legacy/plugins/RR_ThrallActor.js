/*:
 * @target MZ
 * @plugindesc Game_Actor, Window_Skill and Scene_Skill (VX), for imported games
 * @author Thrall's author (on Enterbrain's RGSS2 classes); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallActor.js
 *
 * What Thrall changed in VX's own Game_Actor, Window_Skill and Scene_Skill,
 * outside battle arithmetic:
 *   - Experience: level n+1 costs 130 x 1.1^(n-1) more than level n, every
 *     actor alike; at most 9,999,999 EXP. Change Level stops at level 70.
 *     The experience strings read "-------" at the top level.
 *   - No double experience from armour.
 *   - Each level up's message adds "<name> earned a Skill Point!" with the
 *     skill point icon.
 *   - Changing the body armour changes the actor's walking graphic: the
 *     digits at the end of its file name follow the armour's icon (and, for
 *     some, its defence), e.g. $Mel to $Mel41.
 *   - Overkill (Fury) is kept per actor and cleared when the actor falls.
 *   - The skill list shows a charging skill's remaining turns in place of
 *     its MP cost (not for Aura while anyone has state 20, Stalking while
 *     the actor has state 7, Battle Cry while it has state 26).
 *   - Scene_Skill stays MZ's: Thrall's menu opens the skill tree instead,
 *     and the game's own edit to it only changed which keys it read.
 *
 * The battle getters Thrall wrote into Game_Actor (stats, hit, evasion,
 * critical, element and state rates, attack animation) are run by
 * RR_ThrallBattlers (rrVx*), which has them for every actor.
 *
 * Script calls (the importer translates the game's Ruby):
 *   actor.rrMonAtk() / rrMonDef() / rrMonSpi() / rrMonAgi()   m.mon_atk …
 *   actor.rrExpList()                                        m.exp_list
 *   actor.rrVxOverkill() / rrVxSetOverkill(n)                member.overkill
 *   actor.rrVxExpS() / rrVxNextExpS() / rrVxNextRestExpS()   exp_s …
 *   actor.rrVxDoAutoRecovery()                               do_auto_recovery
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param maxLevel
 * @text Change Level limit
 * @type number
 * @default 70
 *
 * @param skillPointIcon
 * @text Skill point icon
 * @type number
 * @default 173
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallActor');
    const CHANGE_LEVEL_MAX = Number(params.maxLevel || 70);
    const POINT_ICON = Number(params.skillPointIcon || 173);
    const EXP_CAP = 9999999;
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    const VX = () => window.RRThrallVx || null;
    /** The VX record of an MZ data object, when the battlers port keeps them. */
    const vxOf = (obj) => (obj && VX() && VX().of ? VX().of(obj) : null);

    //-------------------------------------------------------------------------
    // Experience (make_exp_list): every actor shares one curve
    //-------------------------------------------------------------------------
    let EXP_LIST = null;
    function expList() {
        if (EXP_LIST) return EXP_LIST;
        const list = new Array(101).fill(0);
        let b = 130.0;
        const n = 1.1;
        for (let i = 2; i <= 99; i++) {
            list[i] = list[i - 1] + Math.trunc(b);
            b = b * n;
        }
        list[1] = list[100] = 0;
        return (EXP_LIST = list);
    }
    Game_Actor.prototype.rrExpList = function() { return expList().slice(); };
    Game_Actor.prototype.expForLevel = function(level) { return expList()[level] || 0; };
    Game_Actor.prototype.isMaxLevel = function() {
        return this._level >= this.maxLevel() || !(expList()[this._level + 1] > 0);
    };
    Game_Actor.prototype.changeExp = function(exp, show) {
        this._exp[this._classId] = Math.min(Math.max(exp, 0), EXP_CAP);
        const lastLevel = this._level;
        const lastSkills = this.skills();
        while (!this.isMaxLevel() && this.currentExp() >= this.nextLevelExp()) this.levelUp();
        while (this._level > 1 && this.currentExp() < this.currentLevelExp()) this.levelDown();
        this._hp = Math.min(this._hp, this.mhp);
        this._mp = Math.min(this._mp, this.mmp);
        if (show && this._level > lastLevel) this.displayLevelUp(this.findNewSkills(lastSkills));
    };
    Game_Actor.prototype.gainExp = function(exp) {
        this.changeExp(this.currentExp() + exp, this.shouldDisplayLevelUp());
    };
    Game_Actor.prototype.changeLevel = function(level, show) {
        level = Math.min(Math.max(level, 1), CHANGE_LEVEL_MAX);
        this.changeExp(this.expForLevel(level), show);
    };
    Game_Actor.prototype.rrVxExpS = function() { return expList()[this._level + 1] > 0 ? this.currentExp() : '-------'; };
    Game_Actor.prototype.rrVxNextExpS = function() { return expList()[this._level + 1] > 0 ? expList()[this._level + 1] : '-------'; };
    Game_Actor.prototype.rrVxNextRestExpS = function() {
        return expList()[this._level + 1] > 0 ? expList()[this._level + 1] - this.currentExp() : '-------';
    };
    Game_Actor.prototype.displayLevelUp = function(newSkills) {
        $gameMessage.newPage();
        $gameMessage.add(TextManager.levelUp.format(this._name, TextManager.level, this._level));
        $gameMessage.add(`\\.\\ic[${POINT_ICON}] ${this._name} earned a Skill Point!`);
        for (const skill of newSkills) $gameMessage.add(TextManager.obtainSkill.format(skill.name));
    };

    //-------------------------------------------------------------------------
    // The monster base's stats by level (mon_atk …): the actor's own curve
    //-------------------------------------------------------------------------
    const curve = (actor, paramId) => {
        const cls = $dataClasses[actor._classId];
        const row = cls && cls.params && cls.params[paramId];
        return row ? row[Math.min(actor._level, row.length - 1)] || 0 : 0;
    };
    Game_Actor.prototype.rrMonAtk = function() { return curve(this, 2); };
    Game_Actor.prototype.rrMonDef = function() { return curve(this, 3); };
    Game_Actor.prototype.rrMonSpi = function() { return curve(this, 4); };
    Game_Actor.prototype.rrMonAgi = function() { return curve(this, 6); };
    /** base_maxhp, when the battlers port is off: the curve. */
    if (typeof Game_Actor.prototype.rrVxBaseMaxhp !== 'function') Game_Actor.prototype.rrVxBaseMaxhp = function() { return curve(this, 0); };

    //-------------------------------------------------------------------------
    // Overkill (Fury)
    //-------------------------------------------------------------------------
    const _setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _setup.call(this, actorId);
        this._rrOverkill = 0;
    };
    Game_Actor.prototype.rrVxOverkill = function() { return this._rrOverkill || 0; };
    Game_Actor.prototype.rrVxSetOverkill = function(v) { this._rrOverkill = Number(v) || 0; };
    const _performCollapse = Game_Actor.prototype.performCollapse;
    Game_Actor.prototype.performCollapse = function() {
        if ($gameParty.inBattle() && this.isDead()) this._rrOverkill = 0;
        _performCollapse.call(this);
    };

    /** do_auto_recovery: each auto-HP-recover armour heals a twentieth of max HP. */
    Game_Actor.prototype.rrVxDoAutoRecovery = function() {
        if (this.isDead()) return;
        for (const item of this.armors()) {
            const r = vxOf(item);
            const recovers = r ? r.auto_hp_recover : (item.traits || []).some(t => t.code === 22 && t.dataId === 7 && t.value > 0);
            if (recovers) this.setHp(this.hp + idiv(this.mhp, 20));
        }
    };

    //-------------------------------------------------------------------------
    // Body armour picks the walking graphic: [icon, armour digit, cape digit];
    // a 0 takes the armour's defence (def % 6 + 1).
    //-------------------------------------------------------------------------
    const ARMOR_ICONS = [[608, 4, 4], [609, 1, 1], [610, 3, 3], [611, 5, 5], [612, 2, 0], [613, 1, 0],
        [614, 3, 0], [615, 5, 0], [616, 4, 0], [617, 3, 0], [618, 1, 0], [619, 2, 0], [620, 1, 0],
        [621, 3, 0], [622, 2, 0], [623, 6, 0], [624, 0, 3], [625, 4, 0], [626, 6, 0], [627, 5, 0],
        [628, 0, 1], [629, 0, 5], [630, 0, 4], [631, 0, 1], [632, 0, 2], [633, 0, 4], [634, 0, 6],
        [635, 0, 3], [636, 0, 6], [637, 6, 0], [638, 6, 0], [639, 4, 0], [640, 6, 0], [641, 5, 0],
        [642, 2, 0], [643, 1, 0], [644, 2, 0], [645, 3, 0], [646, 6, 0], [647, 0, 4], [648, 0, 6],
        [649, 0, 4], [650, 0, 6], [651, 5, 0], [652, 0, 6], [653, 0, 1], [654, 0, 2], [655, 0, 3],
        [656, 0, 5], [657, 0, 1], [658, 0, 2], [659, 0, 3], [660, 0, 5], [661, 0, 1], [662, 0, 2],
        [663, 0, 3], [664, 0, 5], [665, 0, 1], [666, 0, 2], [667, 0, 3], [668, 0, 5], [669, 0, 1],
        [670, 0, 2], [671, 0, 3], [724, 0, 2], [736, 4, 4]];
    const BODY_SLOT = 3;
    /** The graphic's name for this body armour (nil: none). */
    function armorCharacterName(name, item) {
        let cn = String(name);
        // Twice: a trailing digit goes, by String#slice!, at its first place in the name.
        for (let i = 0; i < 2; i++) {
            const last = cn[cn.length - 1];
            if (last !== undefined && /^[0-9]$/.test(last)) { const at = cn.indexOf(last); cn = cn.slice(0, at) + cn.slice(at + 1); }
        }
        if (item) {
            const def = vxOf(item) ? vxOf(item).def : (item.params ? item.params[3] : 0);
            for (const [icon, a, c] of ARMOR_ICONS) {
                if (item.iconIndex !== icon) continue;
                const r = idiv(def, 6);
                const x = a === 0 ? def - r * 6 + 1 : a;
                const y = c === 0 ? def - r * 6 + 1 : c;
                cn = cn + String(x) + String(y);
                break;
            }
        }
        return cn;
    }
    Game_Actor.rrArmorCharacterName = armorCharacterName;
    const _changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        _changeEquip.call(this, slotId, item);
        const after = this._equips[slotId] ? this._equips[slotId].object() : null;
        // VX returns before any change when the party has none of the item.
        if (slotId === BODY_SLOT && (!item || after === item)) {
            this._characterName = armorCharacterName(this._characterName, item || null);
            if ($gamePlayer) $gamePlayer.refresh();
        }
    };

    //-------------------------------------------------------------------------
    // Window_Skill: the remaining turns of a charging skill in place of its cost
    //-------------------------------------------------------------------------
    const WS = Window_SkillList.prototype;
    WS.maxCols = function() { return 2; };
    WS.rrVxSkillCost = function(skill) {
        const actor = this._actor;
        const record = VX() && VX().skill ? VX().skill(skill.id) : null;
        if (record && actor.rrVxCalcMpCost) return actor.rrVxCalcMpCost(record);
        return actor.skillMpCost(skill);
    };
    WS.rrVxTurnsShown = function(skill) {
        const actor = this._actor;
        if (skill.id === 95) return !$gameParty.members().some(m => m.isStateAffected(20));   // Aura
        if (skill.id === 127) return !actor.isStateAffected(7);   // Stalking
        if (skill.id === 160) return !actor.isStateAffected(26);   // Battle Cry, under Rage
        return true;
    };
    WS.drawItem = function(index) {
        const skill = this.itemAt(index);
        if (!skill || !this._actor) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        const enabled = this.isEnabled(skill);
        this.rrVxDrawItemName(skill, rect.x, rect.y, enabled);
        const opacity = this.contents.paintOpacity;
        this.contents.paintOpacity = enabled ? 255 : 128;
        this.changeTextColor(this.rrVxNormalColor());
        const turns = this._actor.rrGetScTurns ? this._actor.rrGetScTurns(skill) : 0;
        if (turns > 0) {
            if (this.rrVxTurnsShown(skill)) this.rrVxDrawText(rect.x, rect.y, rect.width, rect.height, turns, 2);
        } else {
            const cost = this.rrVxSkillCost(skill);
            if (cost !== 0) this.rrVxDrawText(rect.x, rect.y, rect.width, rect.height, cost, 2);
        }
        this.contents.paintOpacity = opacity;
    };
    WS.updateHelp = function() { this._helpWindow.setText(this.item() ? this.item().description : ''); };
})();
