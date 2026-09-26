/*:
 * @target MZ
 * @plugindesc BATTLE_HELP_WINDOW (VX Ace), for imported games
 * @author Unknown; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_BattleHelpWindow.js
 *
 * A two-line help window at the top of the battle screen describes the
 * highlighted battle command, sliding down from above each time the command
 * window opens:
 *   - Attack and Guard show the description of the actor's attack or guard
 *     skill; a skill or item used as a command (Battle Command List's
 *     SKILL x and ITEM x) shows its own description.
 *   - A skill type, and every other command (Items, Equip, Fight, Escape
 *     …), shows the text set for it below.
 * The window hides while the command window is inactive (the actor's) or a
 * message shows (the party's), and whenever the command has no text. It
 * never shows while the hide switch is ON.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param descriptions
 * @text Command texts
 * @type multiline_string
 * @default {}
 * @desc JSON: skill type id or command symbol → text.
 *
 * @param hideSwitch
 * @text Hide switch
 * @type switch
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_BattleHelpWindow');
    const json = (v, d) => { try { return v ? JSON.parse(v) ?? d : d; } catch (_) { return d; } };
    const DESC = json(params.descriptions, {});
    const HIDE_SWITCH = Number(params.hideSwitch) || 0;
    const hidden = () => HIDE_SWITCH > 0 && $gameSwitches.value(HIDE_SWITCH);
    const desc = (key) => (key == null ? undefined : DESC[String(key)]);
    const blank = (text) => text == null || text === '';

    const makeHelp = () => {
        const help = new Window_Help(new Rectangle(0, 0, Graphics.boxWidth, Scene_Base.prototype.calcWindowHeight(2, false)));
        help.visible = false;
        return help;
    };
    // Starts 400 above the screen and comes down 25 a frame.
    const slide = (help) => { if (help.y < 0) help.y += 25; };
    const setText = (help, text) => help.setText(text == null ? '' : String(text));

    const wrap = (Win, name, fn) => {
        const base = Win.prototype[name];
        Win.prototype[name] = function(...args) {
            const result = base.apply(this, args);
            if (this._rrCommandHelp) fn.call(this, this._rrCommandHelp);
            return result;
        };
    };
    for (const Win of [Window_ActorCommand, Window_PartyCommand]) {
        const _initialize = Win.prototype.initialize;
        Win.prototype.initialize = function(...args) {
            _initialize.apply(this, args);
            this._rrCommandHelp = makeHelp();
        };
        wrap(Win, 'open', function(help) {
            help.y = -400;
            if (!hidden()) help.visible = true;
        });
        wrap(Win, 'close', function(help) { help.visible = false; });
    }

    wrap(Window_ActorCommand, 'update', function(help) {
        slide(help);
        const actor = this._actor;
        if (!actor) return;
        const ext = this.currentExt();
        let text;
        switch (this.currentSymbol()) {
            case 'skill': text = desc(ext); break;
            case 'attack': text = $dataSkills[actor.attackSkillId()]?.description; break;
            case 'guard': text = $dataSkills[actor.guardSkillId()]?.description; break;
            case 'use_skill': text = $dataSkills[ext]?.description; break;
            case 'use_item': text = $dataItems[ext]?.description; break;
            default: text = desc(this.currentSymbol());
        }
        setText(help, text);
        if (this.visible && this.active) { if (!hidden()) help.visible = true; }
        else help.visible = false;
        if (blank(text)) help.visible = false;
    });
    // The party's window is never hidden for being inactive, only by a message showing, closing or no text.
    wrap(Window_PartyCommand, 'update', function(help) {
        slide(help);
        const text = desc(this.currentSymbol());
        setText(help, text);
        if (!$gameMessage.isBusy() && this.active && !hidden()) help.visible = true;
        if (blank(text)) help.visible = false;
    });

    // Each help window goes in with its command window, under the battle's own help window.
    const SB = Scene_Battle.prototype;
    for (const [create, key] of [['createPartyCommandWindow', '_partyCommandWindow'], ['createActorCommandWindow', '_actorCommandWindow']]) {
        const base = SB[create];
        SB[create] = function() {
            base.call(this);
            const help = this[key]._rrCommandHelp;
            if (help) this.addWindow(help);
        };
    }
})();
