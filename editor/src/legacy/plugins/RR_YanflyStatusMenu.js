/*:
 * @target MZ
 * @plugindesc Ace Status Menu (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyStatusMenu.js
 *
 * The status screen: a command list on the left (the game's order and
 * names), the actor's face and simple status beside it, the actor's
 * description in the help window, and a page below that follows the
 * command: general (level, stats, experience), a stat graph, properties in
 * three columns, the biography, the actor's skills, or their equipment
 * with the stats. Custom commands open the skill or equip screen (or the
 * difficulty scene); Q and W change the actor.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commands
 * @type multiline_string
 * @default []
 * @desc JSON: [{ symbol, text, enable, show, handler, draw }].
 *
 * @param vocab
 * @type multiline_string
 * @default {}
 * @desc JSON: { parameters, experience, nextTotal, nickname }.
 *
 * @param paramColours
 * @type multiline_string
 * @default {}
 * @desc JSON: { paramId: [[r,g,b], [r,g,b]] }.
 *
 * @param properties
 * @type multiline_string
 * @default [[],[],[]]
 * @desc JSON: three columns of [property, label].
 *
 * @param sizes
 * @type multiline_string
 * @default {}
 * @desc JSON: RGSS font sizes { properties, nickname, equip, base }.
 *
 * @param helpLocation
 * @type select
 * @option none
 * @option top
 * @option middle
 * @option bottom
 * @default none
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyStatusMenu');
    const json = (v, d) => { try { return JSON.parse(v) ?? d; } catch (_) { return d; } };
    const COMMANDS = json(params.commands || '[]', []);
    const VOCAB = Object.assign({ parameters: 'Parameters', experience: 'Experience', nextTotal: 'Next %s Total EXP', nickname: '%s the %s' }, json(params.vocab || '{}', {}));
    const PARAM_COLOURS = json(params.paramColours || '{}', {});
    const PROPERTIES = json(params.properties || '[[],[],[]]', [[], [], []]);
    const SIZES = Object.assign({ properties: 20, nickname: 32, equip: 20, base: 24 }, json(params.sizes || '{}', {}));
    const HELP_LOCATION = String(params.helpLocation || 'none');
    const fontSize = (size) => Math.round($gameSystem.mainFontSize() * size / SIZES.base);
    const rgb = (c) => (Array.isArray(c) ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : ColorManager.normalColor());
    const switchOn = (id) => Number(id) <= 0 || $gameSwitches.value(Number(id));
    const shade = (w) => `rgba(0,0,0,${w.translucentOpacity() / 2 / 255})`;
    const format = (fmt, ...a) => { let i = 0; return String(fmt).replace(/%s/g, () => String(a[i++] ?? '')); };
    // A Ruby "%1.2f%%" of the rate as a percentage.
    const percent = (v) => (Number(v) * 100).toFixed(2) + '%';

    const PROPERTY = {
        hit: 'hit', eva: 'eva', cri: 'cri', cev: 'cev', mev: 'mev', mrf: 'mrf', cnt: 'cnt', hrg: 'hrg', mrg: 'mrg', trg: 'trg',
        tgr: 'tgr', grd: 'grd', rec: 'rec', pha: 'pha', mcr: 'mcr', tcr: 'tcr', pdr: 'pdr', mdr: 'mdr', fdr: 'fdr', exr: 'exr'
    };
    // Rates that other scripts added; a port that provides them answers, otherwise the neutral 100%.
    const EXTRA = { hcr: 'rrHcr', tcr_y: 'rrTcrY', gcr: 'rrGcr', cdr: 'rrCdr', wur: 'rrWur' };

    function Window_RRStatusCommand() { this.initialize(...arguments); }
    Window_RRStatusCommand.prototype = Object.create(Window_Command.prototype);
    Window_RRStatusCommand.prototype.constructor = Window_RRStatusCommand;
    Window_RRStatusCommand.prototype.setActor = function(actor) {
        if (this._actor === actor) return;
        this._actor = actor;
        this.refresh();
    };
    Window_RRStatusCommand.prototype.makeCommandList = function() {
        if (!this._actor) return;
        for (const c of COMMANDS) {
            if (['general', 'parameters', 'properties', 'biography'].includes(c.symbol)) this.addCommand(c.text, c.symbol);
            else if (c.handler && switchOn(c.show)) this.addCommand(c.text, c.symbol, switchOn(c.enable), c);
        }
    };
    // Only commands with a handler take OK; the page commands just show their page.
    Window_RRStatusCommand.prototype.isOkEnabled = function() { return this.isHandled(this.currentSymbol()); };
    Window_RRStatusCommand.prototype.updateHelp = function() {
        if (this._actor) this._helpWindow.setText(this._actor.profile());
    };
    Window_RRStatusCommand.prototype.update = function() {
        Window_Command.prototype.update.call(this);
        if (this._pageWindow && this._lastSymbol !== this.currentSymbol()) {
            this._lastSymbol = this.currentSymbol();
            this._pageWindow.refresh();
        }
    };

    function Window_RRStatusActor() { this.initialize(...arguments); }
    Window_RRStatusActor.prototype = Object.create(Window_Base.prototype);
    Window_RRStatusActor.prototype.constructor = Window_RRStatusActor;
    Window_RRStatusActor.prototype.setActor = function(actor) {
        if (this._actor === actor) return;
        this._actor = actor;
        this.refresh();
    };
    Window_RRStatusActor.prototype.refresh = function() {
        this.contents.clear();
        if (!this._actor) return;
        this.drawActorFace(this._actor, 0, 0, ImageManager.faceWidth, ImageManager.faceHeight);
        this.rrAceDrawActorSimpleStatus(this._actor, 108, Math.floor(this.lineHeight() / 2));
    };

    function Window_RRStatusPage() { this.initialize(...arguments); }
    Window_RRStatusPage.prototype = Object.create(Window_Base.prototype);
    Window_RRStatusPage.prototype.constructor = Window_RRStatusPage;
    Window_RRStatusPage.prototype.initialize = function(rect, commandWindow) {
        this._commandWindow = commandWindow;
        Window_Base.prototype.initialize.call(this, rect);
    };
    Window_RRStatusPage.prototype.setActor = function(actor) {
        if (this._actor === actor) return;
        this._actor = actor;
        this.refresh();
    };
    Window_RRStatusPage.prototype.refresh = function() {
        this.contents.clear();
        this.resetFontSettings();
        if (!this._actor) return;
        const symbol = this._commandWindow.currentSymbol();
        if (symbol === 'general') this.drawGeneral();
        else if (symbol === 'parameters') this.drawGraph();
        else if (symbol === 'properties') this.drawProperties();
        else if (symbol === 'biography' || symbol === 'rename' || symbol === 'retitle') this.drawBiography();
        else {
            const c = this._commandWindow.currentExt();
            if (c && c.draw === 'draw_custom1') this.drawSkills();
            else if (c && c.draw === 'draw_custom2') this.drawEquipment();
        }
    };
    Window_RRStatusPage.prototype.box = function(x, y, w) {
        this.contents.fillRect(x + 1, y + 1, w - 2, this.lineHeight() - 2, shade(this));
    };
    Window_RRStatusPage.prototype.labelled = function(label, value, x, y, w) {
        this.box(x, y, w);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(label, x + 4, y, w - 8);
        this.resetTextColor();
        this.drawText(value, x + 4, y, w - 8, 'right');
    };
    Window_RRStatusPage.prototype.drawGeneral = function() {
        const a = this._actor, lh = this.lineHeight(), cw = this.contents.width, g = (n) => this.rrAceGroup(n);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(VOCAB.parameters, 0, 0, Math.floor(cw / 2), 'center');
        this.drawText(VOCAB.experience, Math.floor(cw / 2), 0, Math.floor(cw / 2), 'center');
        let x = 6;
        const dy = Math.floor(lh / 2), half = Math.floor(cw / 2) - 12, quarter = Math.floor(cw / 4) - 12;
        this.labelled(TextManager.level, g(a.level), x, lh + dy, half);
        this.labelled(TextManager.param(0), g(a.param(0)), x, lh * 2 + dy, half);
        this.labelled(TextManager.param(1), g(a.param(1)), x, lh * 3 + dy, half);
        [2, 4, 6].forEach((p, i) => this.labelled(TextManager.param(p), g(a.param(p)), x, lh * (4 + i) + dy, quarter));
        x += quarter;
        [3, 5, 7].forEach((p, i) => this.labelled(TextManager.param(p), g(a.param(p)), x, lh * (4 + i) + dy, quarter));
        const top = a.isMaxLevel();
        const s1 = g(a.currentExp()), s2 = top ? '-------' : g(a.nextLevelExp() - a.currentExp()), s3 = top ? '-------' : g(a.nextLevelExp());
        const ex = Math.floor(cw / 2) + 12, ey = Math.floor(lh * 3 / 2), ew = Math.floor(cw / 2) - 36;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.expTotal.format(TextManager.exp), ex, ey, ew);
        this.drawText(TextManager.expNext.format(TextManager.level), ex, ey + lh * 2, ew);
        this.drawText(format(VOCAB.nextTotal, TextManager.level), ex, ey + lh * 4, ew);
        this.resetTextColor();
        this.drawText(s1, ex, ey + lh, ew, 'right');
        this.drawText(s2, ex, ey + lh * 3, ew, 'right');
        this.drawText(s3, ex, ey + lh * 5, ew, 'right');
    };
    // Stats 2-7 as gauges, scaled between the lowest and (a third past) the highest.
    Window_RRStatusPage.prototype.drawGraph = function() {
        const a = this._actor, lh = this.lineHeight(), cw = this.contents.width;
        this.contents.fillRect(0, 0, cw, this.contents.height, shade(this));
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(VOCAB.parameters, 0, Math.floor(lh / 3), cw, 'center');
        let max = 1, min = a.paramMax(2);
        for (let i = 2; i <= 7; i++) { max = Math.max(a.param(i), max); min = Math.min(a.param(i), min); }
        if (max !== min) max += min * 0.33;
        for (let i = 2; i <= 7; i++) {
            const rate = max === min ? 1 : ((a.param(i) - min) / (max - min)) * 0.67 + 0.33;
            const y = lh * i - Math.floor(lh / 2);
            const c = PARAM_COLOURS[i] || [];
            this.rrAceGauge(24, y, cw - 48, rate, rgb(c[0]), rgb(c[1]));
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.param(i), 28, y, cw - 56);
            this.resetTextColor();
            this.drawText(this.rrAceGroup(a.param(i)), 18, y, Math.floor((cw - 48) * rate - 8), 'right');
        }
    };
    Window_RRStatusPage.prototype.drawProperties = function() {
        const a = this._actor, cw = this.contents.width, lh = this.lineHeight();
        this.contents.fontSize = fontSize(SIZES.properties);
        const w = Math.floor((cw - 24) / 3) - 24;
        PROPERTIES.forEach((column, n) => {
            const x = 24 + Math.floor((cw - 24) / 3) * n;
            let y = 0;
            for (const [key, label] of column) {
                let value;
                if (PROPERTY[key]) value = a[PROPERTY[key]];
                else if (EXTRA[key]) value = typeof a[EXTRA[key]] === 'function' ? a[EXTRA[key]]() : 1;
                else continue;
                this.labelled(label, percent(value), x, y, w);
                y += lh;
            }
        });
        this.resetFontSettings();
    };
    Window_RRStatusPage.prototype.drawBiography = function() {
        const a = this._actor, lh = this.lineHeight();
        this.contents.fontSize = fontSize(SIZES.nickname);
        this.drawText(format(VOCAB.nickname, a.name(), a.nickname()), 0, 0, this.contents.width, 'center', lh * 2);
        this.resetFontSettings();
        this.drawTextEx(a.profile(), 24, lh * 2, this.contents.width - 24);
    };
    Window_RRStatusPage.prototype.drawText = function(text, x, y, maxWidth, align, height) {
        if (!height) return Window_Base.prototype.drawText.call(this, text, x, y, maxWidth, align);
        this.contents.drawText(text, x, y, maxWidth, height, align);
    };
    // The actor's skills of the types they can use, two to a row.
    Window_RRStatusPage.prototype.drawSkills = function() {
        const a = this._actor, lh = this.lineHeight(), cw = this.contents.width, second = Math.floor(cw / 2) + 16;
        let x = 0, y = 0;
        for (const skill of a.skills()) {
            if (!skill || !a.addedSkillTypes().includes(skill.stypeId)) continue;
            this.rrAceDrawItemName(skill, x, y);
            x = x === second ? 0 : second;
            if (x === 0) y += lh;
            if (y + lh > this.contents.height) return;
        }
    };
    // Each slot's name and item on the left, the eight stats with an arrow on the right.
    Window_RRStatusPage.prototype.drawEquipment = function() {
        const a = this._actor, lh = this.lineHeight(), cw = this.contents.width;
        const slots = a.equipSlots(), equips = a.equips();
        let y = 0;
        for (let i = 0; i < equips.length; i++) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText($dataSystem.equipTypes[slots[i]] || '', 4, y, cw - 4);
            this.resetFontSettings();
            if (equips[i]) this.rrAceDrawItemName(equips[i], 4 + 92, y);
            y += lh;
            if (y + lh > this.contents.height) break;
        }
        const w = Math.floor(Graphics.width * 2 / 5) - 24, x = cw - w, half = Math.floor((Math.floor(Graphics.width * 2 / 5) - 2) / 2);
        y = 0;
        for (let p = 0; p < 8; p++) {
            this.contents.fillRect(x + 1, y + 1, w - 2, lh - 2, shade(this));
            this.contents.fontSize = fontSize(SIZES.equip);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.param(p), x + 4, y, w);
            this.resetTextColor();
            this.drawText(this.rrAceGroup(a.param(p)), x, y, half, 'right');
            this.resetFontSettings();
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('→', x + half, y, 22, 'center');
            y += lh;
            if (y + lh > this.contents.height) break;
        }
    };

    Scene_Status.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const W = Graphics.boxWidth, H = Graphics.boxHeight;
        this._helpWindow = new Window_Help(new Rectangle(0, 0, W, this.calcWindowHeight(2, false)));
        this.addWindow(this._helpWindow);
        const top = this._helpWindow.height;
        this._commandWindow = new Window_RRStatusCommand(new Rectangle(0, top, 160, this.calcWindowHeight(4, true)));
        this._commandWindow.setHelpWindow(this._helpWindow);
        this._commandWindow.setActor(this.actor());
        this._commandWindow.setHandler('cancel', this.popScene.bind(this));
        this._commandWindow.setHandler('pagedown', this.nextActor.bind(this));
        this._commandWindow.setHandler('pageup', this.previousActor.bind(this));
        for (const c of COMMANDS) if (c.handler && this.rrHandler(c.handler)) this._commandWindow.setHandler(c.symbol, this.rrHandler(c.handler));
        this.addWindow(this._commandWindow);
        this._statusWindow = new Window_RRStatusActor(new Rectangle(160, top, W - 160, this.calcWindowHeight(4, false)));
        this._statusWindow.setActor(this.actor());
        this.addWindow(this._statusWindow);
        const y = this._commandWindow.y + this._commandWindow.height;
        this._pageWindow = new Window_RRStatusPage(new Rectangle(0, y, W, H - y), this._commandWindow);
        this._pageWindow.setActor(this.actor());
        this._commandWindow._pageWindow = this._pageWindow;
        this.addWindow(this._pageWindow);
        this.rrRelocate();
        // Back from the skill or equip screen, the cursor is where it was.
        if (Scene_Status._rrIndex !== undefined) {
            this._commandWindow.select(Scene_Status._rrIndex);
            Scene_Status._rrIndex = undefined;
        }
    };
    Scene_Status.prototype.rrRelocate = function() {
        const help = this._helpWindow, command = this._commandWindow, page = this._pageWindow;
        if (HELP_LOCATION === 'none') return;
        if (HELP_LOCATION === 'top') { help.y = 0; command.y = help.height; page.y = command.y + command.height; }
        else if (HELP_LOCATION === 'middle') { command.y = 0; help.y = command.height; page.y = help.y + help.height; }
        else { command.y = 0; page.y = command.height; help.y = page.y + page.height; }
        this._statusWindow.y = command.y;
    };
    Scene_Status.prototype.rrHandler = function(name) {
        const push = (scene) => () => { Scene_Status._rrIndex = this._commandWindow.index(); SceneManager.push(scene); };
        switch (name) {
            case 'command_name1': return push(Scene_Skill);
            case 'command_name2': return push(Scene_Equip);
            case 'command_name5': return window.Scene_RRCscaDifficulty ? push(window.Scene_RRCscaDifficulty) : null;
            // Shown then hidden again at once: the original's toggle always ends with the followers hidden.
            case 'command_name6': return () => { $gamePlayer.followers().hide(); $gamePlayer.refresh(); this._commandWindow.activate(); };
            default: return null;
        }
    };
    Scene_Status.prototype.refreshActor = function() {
        this._commandWindow.setActor(this.actor());
        this._statusWindow.setActor(this.actor());
        this._pageWindow.setActor(this.actor());
        this._commandWindow.callUpdateHelp();
    };
    Scene_Status.prototype.onActorChange = function() {
        Scene_MenuBase.prototype.onActorChange.call(this);
        this.refreshActor();
        this._commandWindow.activate();
    };
    Scene_Status.prototype.needsPageButtons = function() { return true; };
})();
