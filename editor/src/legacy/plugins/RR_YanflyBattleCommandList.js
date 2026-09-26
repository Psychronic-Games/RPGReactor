/*:
 * @target MZ
 * @plugindesc Yanfly Engine Ace - Battle Command List (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyBattleCommandList.js
 *
 * The battle commands come from lists:
 *   - An actor's commands are the <command list> in its note, else its
 *     class's, else the default list below. One command per line:
 *       <command list>
 *       ATTACK          the attack command
 *       SKILL LIST      every skill type the actor has
 *       DEFEND          the guard command
 *       ITEMS           the item command
 *       SKILL TYPE x    skill type x, when the actor has it
 *       SKILL x         uses skill x straight away
 *       ITEM x          uses item x straight away
 *       EQUIP           changes equipment (with the Command Equip port)
 *       </command list>
 *     A skill type already listed is not listed twice. AUTOBATTLE and
 *     SUBCLASS LIST need scripts that have no port and add nothing.
 *   - A skill or item used as a command shows <command name: text> from its
 *     note instead of its name; <command hide until learn> (skills),
 *     <command hide until usable> and <command hide until switch: x> keep
 *     it off the list until the actor has learned it, can use it, or switch
 *     x is ON. It is greyed out while the actor cannot pay for it (skills)
 *     or the party has none (items).
 *   - The party commands (Fight, Escape and the game's own) come in the
 *     order set below. A command of the game's own does nothing when chosen.
 *
 * Under the Classical ATB port a SKILL x or ITEM x that needs no target is
 * chosen but not confirmed, so the actor's commands open again, as in the
 * original.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param partyCommands
 * @text Party commands
 * @default ["fight","escape"]
 * @desc JSON list: fight, escape, or a custom command's symbol.
 *
 * @param customPartyCommands
 * @text Custom party commands
 * @type multiline_string
 * @default {}
 * @desc JSON: symbol → [name, enable switch, show switch].
 *
 * @param defaultActorCommands
 * @text Default actor commands
 * @default ["ATTACK","SKILL LIST","DEFEND","ITEMS"]
 * @desc JSON list used by actors and classes without <command list>.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyBattleCommandList');
    const json = (v, d) => { try { return v ? JSON.parse(v) ?? d : d; } catch (_) { return d; } };
    const PARTY_COMMANDS = json(params.partyCommands, ['fight', 'escape']);
    const CUSTOM_PARTY = json(params.customPartyCommands, {});
    const DEFAULT_ACTOR = json(params.defaultActorCommands, ['ATTACK', 'SKILL LIST', 'DEFEND', 'ITEMS']).map(s => String(s).toUpperCase());

    const RE = {
        on: /<(?:COMMAND_LIST|command list)>/i, off: /<\/(?:COMMAND_LIST|command list)>/i,
        name: /<(?:COMMAND NAME|command name):[ ](.*)>/i,
        learn: /<(?:COMMAND_HIDE_UNTIL_LEARN|command hide until learn)>/i,
        usable: /<(?:COMMAND_HIDE_UNTIL_USABLE|command hide until usable)>/i,
        switch: /<(?:COMMAND_HIDE_UNTIL_SWITCH|command hide until switch):[ ](\d+)>/i
    };
    const lines = (obj) => String((obj && obj.note) || '').split(/[\r\n]+/);
    const listCache = new WeakMap(), tagCache = new WeakMap();

    /** The upper-cased lines inside <command list>; a class without them has the default list. */
    const commandList = (obj, isClass) => {
        if (!obj || typeof obj !== 'object') return [];
        if (!listCache.has(obj)) {
            const out = [];
            let inside = false;
            for (const line of lines(obj)) {
                if (RE.on.test(line)) inside = true;
                else if (RE.off.test(line)) inside = false;
                else if (inside) out.push(line.toUpperCase());
            }
            listCache.set(obj, out.length === 0 && isClass ? DEFAULT_ACTOR : out);
        }
        return listCache.get(obj);
    };
    /** A skill's or item's command tags. */
    const commandTags = (item) => {
        if (!tagCache.has(item)) {
            const t = { name: item.name, learn: false, usable: false, switch: 0 };
            for (const line of lines(item)) {
                let m;
                if ((m = RE.name.exec(line))) t.name = m[1];
                else if (RE.learn.test(line)) t.learn = true;
                else if (RE.usable.test(line)) t.usable = true;
                else if ((m = RE.switch.exec(line))) t.switch = Number(m[1]);
            }
            tagCache.set(item, t);
        }
        return tagCache.get(item);
    };

    Game_Actor.prototype.rrBattleCommands = function() {
        const own = commandList(this.actor(), false);
        return own.length ? own : commandList(this.currentClass(), true);
    };

    //-------------------------------------------------------------------------
    // Party commands
    //-------------------------------------------------------------------------
    Window_PartyCommand.prototype.makeCommandList = function() {
        for (const command of PARTY_COMMANDS) {
            if (command === 'fight') this.addCommand(TextManager.fight, 'fight');
            else if (command === 'escape') this.addCommand(TextManager.escape, 'escape', BattleManager.canEscape());
            else if (!['combatlog', 'autobattle', 'party'].includes(command)) this.rrAddCustomCommand(command);
        }
    };
    Window_PartyCommand.prototype.rrAddCustomCommand = function(command) {
        const custom = CUSTOM_PARTY[command];
        if (!Array.isArray(custom)) return;
        const [text, enableSwitch, showSwitch] = custom;
        if (Number(showSwitch) > 0 && !$gameSwitches.value(Number(showSwitch))) return;
        const enabled = Number(enableSwitch) <= 0 || $gameSwitches.value(Number(enableSwitch));
        this.addCommand(String(text), command, enabled);
    };

    //-------------------------------------------------------------------------
    // Actor commands
    //-------------------------------------------------------------------------
    const W = Window_ActorCommand.prototype;
    W.rrBattleCommandList = true;
    W.makeCommandList = function() {
        if (!this._actor) return;
        this._rrStypeList = [];
        for (const command of this._actor.rrBattleCommands()) {
            const c = command.toUpperCase();
            let m;
            if (/ATTACK/.test(c)) this.addAttackCommand();
            else if (/SKILL LIST/.test(c)) this.addSkillCommands();
            else if (/DEFEND/.test(c)) this.addGuardCommand();
            else if (/ITEMS/.test(c)) this.addItemCommand();
            else if ((m = /SKILL TYPE[ ](\d+)/.exec(c))) this.rrAddSkillTypeCommand(Number(m[1]));
            else if ((m = /SKILL[ ](\d+)/.exec(c))) this.rrAddSkillIdCommand(Number(m[1]));
            else if ((m = /ITEM[ ](\d+)/.exec(c))) this.rrAddItemIdCommand(Number(m[1]));
            else if (/AUTOBATTLE/.test(c)) continue;
            else if (/EQUIP/.test(c)) { if (this.rrAddEquipCommand) this.rrAddEquipCommand(); }
        }
    };
    // Skill types in the order the actor gained them, each once.
    W.addSkillCommands = function() {
        for (const stypeId of this._actor.addedSkillTypes()) {
            if (!this._rrStypeList.includes(stypeId)) this.rrAddSkillTypeCommand(stypeId);
        }
    };
    W.rrAddSkillTypeCommand = function(stypeId) {
        if (!this._actor.addedSkillTypes().includes(stypeId) || this._rrStypeList.includes(stypeId)) return;
        this._rrStypeList.push(stypeId);
        this.addCommand($dataSystem.skillTypes[stypeId], 'skill', true, stypeId);
    };
    W.rrHideUntilSwitch = function(item) {
        const id = commandTags(item).switch;
        return id > 0 && !$gameSwitches.value(id);
    };
    W.rrAddSkillIdCommand = function(skillId) {
        const skill = $dataSkills[skillId], actor = this._actor;
        if (!skill) return;
        const tags = commandTags(skill);
        if (tags.learn && !actor.isLearnedSkill(skillId) && !actor.addedSkills().includes(skillId)) return;
        if (tags.usable && !actor.canUse(skill)) return;
        if (this.rrHideUntilSwitch(skill)) return;
        this.addCommand(tags.name, 'use_skill', actor.meetsSkillConditions(skill), skillId);
    };
    W.rrAddItemIdCommand = function(itemId) {
        const item = $dataItems[itemId], actor = this._actor;
        if (!item) return;
        const tags = commandTags(item);
        if (tags.usable && !actor.canUse(item)) return;
        if (this.rrHideUntilSwitch(item)) return;
        this.addCommand(tags.name, 'use_item', actor.meetsItemConditions(item), itemId);
    };
    const _setup = W.setup;
    W.setup = function(actor) {
        _setup.call(this, actor);
        this.show();
    };

    //-------------------------------------------------------------------------
    // Scene_Battle
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    const _createActorCommandWindow = SB.createActorCommandWindow;
    SB.createActorCommandWindow = function() {
        _createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler('use_skill', this.rrCommandUseSkill.bind(this));
        this._actorCommandWindow.setHandler('use_item', this.rrCommandUseItem.bind(this));
    };
    const _startActorCommandSelection = SB.startActorCommandSelection;
    SB.startActorCommandSelection = function() {
        _startActorCommandSelection.call(this);
        this._actorCommandWindow.show();
    };
    SB.rrCommandRedraw = function(actor) {
        if (this.rrStatusRedrawTarget) this.rrStatusRedrawTarget(actor);
        else this._statusWindow.drawItem($gameParty.battleMembers().indexOf(actor));
    };
    SB.rrCommandUseSkill = function() {
        const skill = $dataSkills[this._actorCommandWindow.currentExt()], actor = BattleManager.actor();
        actor.inputtingAction().setSkill(skill.id);
        actor.setLastBattleSkill(skill);
        this.rrCommandRedraw(actor);
        this.rrCommandChooseTarget(skill, this._skillWindow);
    };
    SB.rrCommandUseItem = function() {
        const item = $dataItems[this._actorCommandWindow.currentExt()], actor = BattleManager.actor();
        actor.inputtingAction().setItem(item.id);
        this.rrCommandRedraw(actor);
        this.rrCommandChooseTarget(item, this._itemWindow);
    };
    // With the Ace Battle Engine port the scope picks the target window; without it, the stock rules.
    SB.rrCommandChooseTarget = function(item, list) {
        if (this.rrChooseTarget) return this.rrChooseTarget(item, list);
        const action = BattleManager.actor().inputtingAction();
        if (!action.needsSelection()) this.selectNextCommand();
        else if (action.isForOpponent()) this.startEnemySelection();
        else this.startActorSelection();
    };
    for (const name of ['onActorOk', 'onEnemyOk']) {
        const base = SB[name];
        SB[name] = function() {
            base.call(this);
            this._actorCommandWindow.show();
        };
    }
    // Cancelling the target of a SKILL x or ITEM x command goes back to the commands.
    for (const name of ['onActorCancel', 'onEnemyCancel']) {
        const base = SB[name];
        SB[name] = function() {
            base.call(this);
            if (!['use_skill', 'use_item'].includes(this._actorCommandWindow.currentSymbol())) return;
            this._helpWindow.hide();
            this._statusWindow.show();
            this._actorCommandWindow.activate();
            this.rrCommandRedraw(BattleManager.actor());
        };
    }
})();
