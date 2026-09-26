/*:
 * @target MZ
 * @plugindesc Equipment Learning (VX Ace), for imported games
 * @author Yami; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YamiEquipLearning.js
 *
 * Weapons and armors teach skills. Each skill a piece names grows while the
 * piece is worn: after a won battle every member gains the Equip EXP of the
 * enemies that fell (1 each unless the enemy's note says otherwise), and 5
 * more at each level gained. Once a skill's points reach what it requires
 * (100 unless the skill's note says otherwise) the actor learns it for good.
 * Points are counted per actor and per skill, so taking the piece off keeps
 * what was earned.
 *
 * Notes:
 *   <el skill: n>     weapons, armors: the piece teaches skill n (repeatable)
 *   <el require: n>   skills: points needed to learn it
 *   <el gain: n>      enemies: points it gives when it falls
 *   <el rate: n%>     classes, actors: the actor's rate (the class's first)
 * One tag is read per note line.
 *
 * On the equipment screen, the game's "Toggle Skills" command swaps the
 * parameter window for the Equip Skills window: the skills of the slot or
 * piece under the cursor, each with a gauge of the points earned and the
 * points needed.
 *
 * The victory screen reads actor.rrEquipExpGained() ("+3 Equip EXP" is
 * actor.rrEquipExpText()) and, for an actor whose skills changed during the
 * reward, is told through BattleManager.rrShowVictoryElLearn(actor, before,
 * learned) when it defines it. Without Victory Aftermath in the game the
 * results are told in the reward messages instead.
 *
 * Script call: $game_actors[n].el_gain(amount) becomes actor.rrElGain(amount).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param vocab
 * @text Name of the points
 * @default  Equip EXP
 *
 * @param learnTitle
 * @text Equip Skills window title
 * @default Equip Skills
 *
 * @param gaugeColor1
 * @type number
 * @default 9
 * @param gaugeColor2
 * @type number
 * @default 1
 *
 * @param enableWindow
 * @text Equip Skills window
 * @type boolean
 * @default true
 *
 * @param enemyKill
 * @text Points per enemy
 * @type number
 * @default 1
 *
 * @param levelUp
 * @text Points per level
 * @type number
 * @default 5
 *
 * @param requireAp
 * @text Points to learn
 * @type number
 * @default 100
 *
 * @param victoryMessage
 * @default %s has earned %s %s!
 * @param victoryLearn
 * @default %s has unlocked new Equip Skills!
 * @param victoryAftermath
 * @default +%s%s
 *
 * @param aftermath
 * @text Victory Aftermath in the game
 * @type boolean
 * @default false
 *
 * @param equipEngine
 * @text Ace Equip Engine in the game
 * @type boolean
 * @default false
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YamiEquipLearning');
    const num = (key, d) => (params[key] === undefined || params[key] === '' ? d : Number(params[key]));
    const str = (key, d) => (params[key] === undefined ? d : String(params[key]));
    const VOCAB = str('vocab', ' Equip EXP'), LEARN_TITLE = str('learnTitle', 'Equip Skills');
    const COLOR1 = num('gaugeColor1', 9), COLOR2 = num('gaugeColor2', 1);
    const ENABLE_WINDOW = params.enableWindow !== 'false';
    const ENEMY_KILL = num('enemyKill', 1), LEVEL_UP = num('levelUp', 5), REQUIRE_AP = num('requireAp', 100);
    const VICTORY_MESSAGE = str('victoryMessage', '%s has earned %s %s!');
    const VICTORY_LEARN = str('victoryLearn', '%s has unlocked new Equip Skills!');
    const VICTORY_AFTERMATH = str('victoryAftermath', '+%s%s');
    const AFTERMATH = params.aftermath === 'true', EQUIP_ENGINE = params.equipEngine === 'true';
    const sprintf = (fmt, ...args) => { let i = 0; return String(fmt).replace(/%%|%s/g, m => (m === '%%' ? '%' : String(args[i++]))); };

    //-------------------------------------------------------------------------
    // Notes: one tag per line, the first that matches
    //-------------------------------------------------------------------------
    const RE = {
        rate: /<(?:EL_RATE|el rate):[ ]*(\d+)(?:[%％])*>/i, gain: /<(?:EL_GAIN|el gain):[ ]*(\d+)>/i,
        skill: /<(?:EL_SKILL|el skill):[ ]*(\d+)>/i, require: /<(?:EL_REQUIRE|el require):[ ]*(\d+)>/i
    };
    const cache = new WeakMap();
    /** { skills, rate, gain, require } of a database object (a copy of a piece reads its own note). */
    const notes = (obj) => {
        if (!obj || typeof obj !== 'object') return { skills: [], rate: null, gain: 0, require: REQUIRE_AP };
        let out = cache.get(obj);
        if (out) return out;
        const isItem = !!(window.$dataItems && $dataItems[obj.id] === obj);
        out = { skills: [], rate: null, gain: isItem ? 0 : ENEMY_KILL, require: REQUIRE_AP };
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            let m;
            if ((m = RE.rate.exec(line))) out.rate = Number(m[1]);
            else if ((m = RE.gain.exec(line))) out.gain = Number(m[1]);
            else if ((m = RE.skill.exec(line))) out.skills.push(Number(m[1]));
            else if ((m = RE.require.exec(line))) out.require = Number(m[1]);
        }
        cache.set(obj, out);
        return out;
    };
    window.RRYamiEquipLearning = { notes, vocab: VOCAB, aftermathFormat: VICTORY_AFTERMATH, learnFormat: VICTORY_LEARN };

    //-------------------------------------------------------------------------
    // Actors: points per skill, learning
    //-------------------------------------------------------------------------
    const A = Game_Actor.prototype;
    A.rrEquipLearning = function() {
        if (!this._rrEquipLearning) this._rrEquipLearning = {};
        return this._rrEquipLearning;
    };
    /** The skill ids the actor's pieces teach, each once. */
    A.rrElSkills = function() {
        const out = [];
        for (const e of this.equips()) if (e) for (const id of notes(e).skills) if (!out.includes(id)) out.push(id);
        return out;
    };
    /** The rate in percent: the class's, else the actor's, else 100. */
    A.rrElRate = function() {
        const c = notes(this.currentClass()).rate, a = notes(this.actor()).rate;
        return c !== null ? c : a !== null ? a : 100;
    };
    A.rrReqElp = function(skillId) { return $dataSkills[skillId] ? notes($dataSkills[skillId]).require : 0; };
    /** Points toward a skill; a skill already learned shows full. */
    A.rrCurElp = function(skillId) {
        if (!$dataSkills[skillId]) return 0;
        if (this.isLearnedSkill(skillId)) return this.rrReqElp(skillId);
        return this.rrEquipLearning()[skillId] || 0;
    };
    A.rrPerElp = function(skillId) { return this.rrCurElp(skillId) / this.rrReqElp(skillId); };
    /**
     * Adds amount × rate / 100 (rounded) to every skill the pieces teach, a learned skill's included, and
     * learns those that reach what they require. Returns the skills newly learned, or false.
     */
    A.rrElGain = function(amount = 0) {
        const ids = this.rrElSkills();
        if (!ids.length || !(amount > 0)) return false;
        const point = Math.round(amount * this.rrElRate() / 100);
        const table = this.rrEquipLearning(), learned = [];
        for (const id of ids) {
            if (!$dataSkills[id]) continue;
            table[id] = (table[id] || 0) + point;
            if (table[id] >= this.rrReqElp(id)) {
                if (!this.isLearnedSkill(id)) learned.push(id);
                this.learnSkill(id);
                table[id] = this.rrReqElp(id);
            }
        }
        return learned.length ? learned.map(id => $dataSkills[id]) : false;
    };
    const _levelUp = A.levelUp;
    A.levelUp = function() {
        _levelUp.call(this);
        this.rrElGain(LEVEL_UP);
    };

    Game_Enemy.prototype.rrElp = function() { return notes(this.enemy()).gain; };
    Game_Troop.prototype.rrElpTotal = function() { return this.deadMembers().reduce((r, e) => r + e.rrElp(), 0); };

    /**
     * The points the victory screen shows for the actor: the fallen enemies', plus one level's worth when
     * the battle's EXP takes the actor past the next level (one only, however many levels), times the rate.
     * Shown whether or not the actor wears a piece that teaches. Kept from before the EXP was gained.
     */
    A.rrEquipExpGained = function() {
        const kept = BattleManager._rrElShown ? BattleManager._rrElShown[this.actorId()] : undefined;
        if (kept !== undefined) return kept;
        let n = $gameTroop.rrElpTotal();
        const exp = Math.floor((BattleManager._rewards ? BattleManager._rewards.exp : $gameTroop.expTotal()) * this.finalExpRate());
        if (this.currentExp() + exp > this.expForLevel(this.level + 1) && !this.isMaxLevel()) n += LEVEL_UP;
        return Math.round(n * this.rrElRate() / 100);
    };
    A.rrEquipExpText = function() { return sprintf(VICTORY_AFTERMATH, this.rrEquipExpGained(), VOCAB); };

    //-------------------------------------------------------------------------
    // Rewards: the points follow the EXP
    //-------------------------------------------------------------------------
    const _setup = BattleManager.setup;
    BattleManager.setup = function() {
        this._rrElShown = null;
        this._rrElResults = [];
        _setup.apply(this, arguments);
    };
    /** [{ actor, before: skill ids before the EXP, learned: skills gained since }] of the last reward. */
    BattleManager.rrEquipLearnResults = function() { return this._rrElResults || []; };

    const _gainExp = BattleManager.gainExp;
    BattleManager.gainExp = function() {
        const members = $gameParty.allMembers();
        const shown = {};
        for (const actor of members) shown[actor.actorId()] = actor.rrEquipExpGained();
        this._rrElShown = shown;
        const before = new Map(members.map(a => [a, a.skills().map(s => s.id)]));
        _gainExp.call(this);
        const total = $gameTroop.rrElpTotal();
        this._rrElResults = [];
        for (const actor of members) {
            const result = actor.rrElGain(total);
            if (AFTERMATH) {
                // The victory screen's page follows any change of skills since before the EXP, a level's own included.
                const ids = actor.skills().map(s => s.id), old = before.get(actor);
                if (ids.length === old.length && ids.every((id, i) => id === old[i])) continue;
                const learned = actor.skills().filter(s => !old.includes(s.id));
                this._rrElResults.push({ actor, before: old, learned });
                if (this.rrShowVictoryElLearn) this.rrShowVictoryElLearn(actor, old, learned);
            } else if (result) {
                this._rrElResults.push({ actor, before: before.get(actor), learned: result });
                $gameMessage.newPage();
                $gameMessage.add(sprintf(VICTORY_LEARN, actor.name()));
                for (const skill of [...new Set(result)]) $gameMessage.add(TextManager.obtainSkill.format(skill.name));
            }
        }
    };
    if (!AFTERMATH) {
        const _displayExp = BattleManager.displayExp;
        BattleManager.displayExp = function() {
            _displayExp.call(this);
            const total = $gameTroop.rrElpTotal();
            if (total <= 0) return;
            const lines = $gameParty.allMembers().map(a => sprintf(VICTORY_MESSAGE, a.name(), Math.round(total * a.rrElRate() / 100), VOCAB));
            $gameMessage.add('\\.' + lines.join('\n'));
        };
    }

    if (!ENABLE_WINDOW) return;

    //-------------------------------------------------------------------------
    // Equip Skills window: frameless, over a back window with the title
    //-------------------------------------------------------------------------
    function Window_RREquipLearning() { this.initialize(...arguments); }
    Window_RREquipLearning.prototype = Object.create(Window_Selectable.prototype);
    Window_RREquipLearning.prototype.constructor = Window_RREquipLearning;
    Window_RREquipLearning.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.opacity = 0;
        this._data = null;
        this._equip = null;
        this._actor = null;
    };
    Window_RREquipLearning.prototype.maxItems = function() { return this._data ? this._data.length : 1; };
    Window_RREquipLearning.prototype.isCurrentItemEnabled = function() { return false; };
    Window_RREquipLearning.prototype.drawItemBackground = function() {};
    Window_RREquipLearning.prototype.setActor = function(actor) { this._actor = actor; };
    // No piece clears the window and keeps the list it had.
    Window_RREquipLearning.prototype.setEquip = function(equip) {
        this.contents.clear();
        this._equip = equip;
        if (!equip) return;
        this._data = notes(equip).skills.map(id => $dataSkills[id]);
        this.refresh();
    };
    Window_RREquipLearning.prototype.item = function() { return this._data ? this._data[this.index()] : null; };
    Window_RREquipLearning.prototype.drawItem = function(index) {
        const skill = this._data && this._data[index];
        if (!skill) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrDrawAp(skill, rect.x + 2, rect.y, rect.width);
        this.rrAceDrawItemName(skill, rect.x, rect.y, true);
    };
    // The gauge is drawn whatever the game's SHOW_GAUGE says: the original never read it.
    Window_RREquipLearning.prototype.rrDrawAp = function(skill, x, y, width) {
        const c1 = ColorManager.textColor(COLOR1), c2 = ColorManager.textColor(COLOR2), n = ColorManager.normalColor();
        if (this._actor) {
            this.rrAceGauge(x, y, width - 4, this._actor.rrPerElp(skill.id), c1, c2);
            this.rrAceDrawCurrentAndMaxValues(x, y, width - 4, this._actor.rrCurElp(skill.id), this._actor.rrReqElp(skill.id), n, n);
        } else {
            this.rrAceGauge(x, y, width - 4, 0, c1, c2);
            this.rrAceDrawCurrentAndMaxValues(x, y, width - 4, 0, notes(skill).require, n, n);
        }
    };
    Window_RREquipLearning.prototype.updateHelp = function() { this._helpWindow.setItem(this.item()); };
    window.Window_RREquipLearning = Window_RREquipLearning;

    function Window_RREquipLearningBack() { this.initialize(...arguments); }
    Window_RREquipLearningBack.prototype = Object.create(Window_Base.prototype);
    Window_RREquipLearningBack.prototype.constructor = Window_RREquipLearningBack;
    Window_RREquipLearningBack.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_RREquipLearningBack.prototype.refresh = function() {
        this.contents.clear();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(LEARN_TITLE, 0, 0, this.contents.width, 'center');
    };
    window.Window_RREquipLearningBack = Window_RREquipLearningBack;

    // The slot and item lists name the piece under the cursor to the window as their help changes.
    for (const W of [Window_EquipSlot, Window_EquipItem]) {
        const _updateHelp = W.prototype.updateHelp;
        W.prototype.updateHelp = function() {
            _updateHelp.call(this);
            if (this._rrEquipLearning) this._rrEquipLearning.setEquip(this.item());
        };
        W.prototype.rrSetEquipLearningWindow = function(window) {
            this._rrEquipLearning = window;
            this.callUpdateHelp();
        };
    }
    Window_EquipItem.prototype.maxCols = function() { return 1; };

    //-------------------------------------------------------------------------
    // Equipment screen: the window over the parameters, toggled by the game's command
    // (without the Ace Equip Engine it is always shown, beside an item list half the screen wide)
    //-------------------------------------------------------------------------
    const E = Scene_Equip.prototype;
    if (!EQUIP_ENGINE) {
        const _itemWindowRect = E.itemWindowRect;
        E.itemWindowRect = function() {
            const rect = _itemWindowRect.call(this);
            rect.width = Math.floor(Graphics.boxWidth / 2);
            return rect;
        };
    }
    const _create = E.create;
    E.create = function() {
        _create.call(this);
        this.rrCreateEquipLearning();
    };
    E.rrCreateEquipLearning = function() {
        const item = this._itemWindow;
        const wx = item.x + item.width, wy = item.y, ww = Graphics.boxWidth - wx, wh = item.height;
        this._rrEquipLearningBack = new Window_RREquipLearningBack(new Rectangle(wx, wy, ww, wh));
        this.addWindow(this._rrEquipLearningBack);
        this._rrEquipLearning = new Window_RREquipLearning(new Rectangle(wx, wy + 24, ww, wh - 24));
        this._rrEquipLearning.setHelpWindow(this._helpWindow);
        this._rrEquipLearning.setActor(this.actor());
        this.addWindow(this._rrEquipLearning);
        this._itemWindow.rrSetEquipLearningWindow(this._rrEquipLearning);
        this._slotWindow.rrSetEquipLearningWindow(this._rrEquipLearning);
        if (EQUIP_ENGINE) {
            this._rrEquipLearningBack.hide();
            this._rrEquipLearning.hide();
        }
    };
    const _onSlotCancel = E.onSlotCancel;
    E.onSlotCancel = function() {
        _onSlotCancel.call(this);
        this._rrEquipLearning.setEquip(null);
    };
    const _onActorChange = E.onActorChange;
    E.onActorChange = function() {
        _onActorChange.call(this);
        this._rrEquipLearning.setActor(this.actor());
        this._rrEquipLearning.setEquip(null);
    };
    /** Toggle Skills: the Equip Skills window in place of the parameters, or back. */
    E.commandLearning = function() {
        const on = !this._rrEquipLearning.visible;
        this._rrEquipLearning.visible = on;
        this._rrEquipLearningBack.visible = on;
        this._statusWindow.visible = !on;
        this._commandWindow.activate();
    };
})();
