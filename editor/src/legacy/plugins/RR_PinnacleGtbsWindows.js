/*:
 * @target MZ
 * @plugindesc GTBS windows (VX Ace): the unit's status, commands, confirmation, options and minimap, for imported games
 * @author GubiD (GTBS 1.5.1.4), Zoro (minimap) and the game's author; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 * @base RR_PinnacleGtbs
 * @orderAfter RR_PinnacleGtbsBattlers
 *
 * @help RR_PinnacleGtbsWindows.js
 *
 * The grid battle's windows: the unit under the cursor at the top right (name,
 * class, HP and SP bars, face, level and experience, its states and buffs in
 * turn; A switches to a compact box), the commands (Move, Attack, each skill
 * type, Passives, Item, then Guard or End Turn), the Yes/No confirmation with
 * the hit, critical and damage forecast over each target, the skill and item
 * lists, the help line at the bottom, the battle log at the top, the options
 * with both sides' banners, unit counts and the minimap.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 */
(() => {
    'use strict';
    const R = window.RRGtbs;
    if (!R) return;
    const { text, U } = R;
    const get = R.get, idiv = R.idiv, V = R.V;
    const vtext = (name) => text(V[name] != null ? V[name] : name);
    const css = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] === undefined ? 255 : c[3]) / 255})`;
    const LH = 24;

    // GTBS's windows update only when the scene asks (they sat in a hash RGSS did not update): the frame
    // update draws, tbsUpdate also reads the keys.
    const tbsWindow = (Klass, Base) => {
        const proto = Klass.prototype;
        proto.update = function() {
            if (this._rrTick) Base.prototype.update.call(this);
            else Window_Base.prototype.update.call(this);
        };
        proto.tbsUpdate = function() {
            this._rrTick = true;
            try { this.update(); } finally { this._rrTick = false; }
        };
        proto.moveTo = moveTo;
        proto.lineHeight = function() { return LH; };
    };
    // move_to: a position on the number pad (1–9).
    function moveTo(pos) {
        if (this._currentPos != null && this._currentPos === pos) return;
        if (pos === 5) { this.x = (Graphics.width - this.width) / 2; this.y = (Graphics.height - this.height) / 2; }
        if ([1, 2, 3].includes(pos)) { this.y = Graphics.height - this.height; if (this.winHelp) this.y -= this.winHelp.height; }
        if (pos === 2) this.y += LH * 2 + 10;
        if ([1, 4, 7].includes(pos)) this.x = 0;
        if ([7, 8, 9].includes(pos)) this.y = 0;
        if ([3, 6, 9].includes(pos)) this.x = Graphics.width - this.width;
        if ([4, 6].includes(pos)) this.y = this.height;
        this._currentPos = pos;
    }
    R.windowMoveTo = moveTo;
    const rect = (x, y, w, h) => new Rectangle(x, y, w, h);
    const drawFace96 = (win, faceName, faceIndex, x, y, enabled = true) => {
        if (!faceName) return;
        const bitmap = ImageManager.loadFace(faceName);
        const draw = () => {
            const pw = bitmap.width / 4 || 96, ph = bitmap.height / 2 || 96;
            win.contents.paintOpacity = enabled ? 255 : 160;
            win.contents.blt(bitmap, (faceIndex % 4) * pw, Math.floor(faceIndex / 4) * ph, pw, ph, x, y, 96, 96);
            win.contents.paintOpacity = 255;
        };
        if (bitmap.isReady()) draw(); else bitmap.addLoadListener(() => { if (win.contents) draw(); });
    };
    const troopIconFor = (classId) => {
        let item = 0;
        for (const [i, val] of Object.entries(R.party.troopTable().troopData())) if (val[0] === classId) item = Number(i);
        return $dataItems[item] ? $dataItems[item].iconIndex : 0;
    };
    // Pinnacle's Window_Base: a character drawn by its middle (from Characters, or the Battlers sheets).
    const drawCenteredCharacter = (win, name, index, x, y) => {
        if (!name) return;
        const bitmap = ImageManager.loadCharacter(name);
        const draw = (b) => {
            const big = ImageManager.isBigCharacter(name);
            const cw = big ? b.width / 3 : b.width / 12, ch = big ? b.height / 4 : b.height / 8;
            win.contents.blt(b, ((index % 4) * 3 + 1) * cw, Math.floor(index / 4) * 4 * ch, cw, ch, x - cw / 2, y - ch / 2);
        };
        if (bitmap.isReady() && !bitmap.isError()) draw(bitmap);
        else bitmap.addLoadListener(() => draw(bitmap));
    };

    //=========================================================================
    // TBS_Window_Help: the help line (three lines tall, the first one showing)
    //=========================================================================
    class TBS_Window_Help extends Window_Help {
        constructor(lines = 2) {
            super(rect(0, 0, Graphics.width, lines * LH + 24));
        }
        text() { return this._text; }
        setText(str, force = false) {
            if (this._text !== str && !this._locked) {
                this._text = str;
                this._locked = force;
                this.refresh();
            }
            if (this.visible === false) { this.show(); this.activate(); this.open(); }
        }
        refresh() {
            this.contents.clear();
            this.drawTextEx(text(String(this._text ?? '')), 4, 0, this.innerWidth);
        }
        lineHeight() { return LH; }
    }
    TBS_Window_Help.prototype.moveTo = moveTo;
    window.TBS_Window_Help = TBS_Window_Help;

    //=========================================================================
    // Commands_All: the unit's commands
    //=========================================================================
    class Commands_All extends Window_ActorCommand {
        constructor() {
            super(rect(0, 0, 128, 24));
            this._actorDisplay = new Window_Base(rect(0, 0, 120, 60));
            this._actorDisplay.visible = false;
        }
        actorDisplay() { return this._actorDisplay; }
        numVisibleRows() { return this.maxItems(); }
        makeCommandList() {
            const a = this._actor;
            if (!a) return;
            const hide = get('HIDE_INACTIVE_COMMANDS', true);
            if (!(hide && a.tbsMovedQ() && !a._tbsExtraMove)) {
                this.addCommand(text(get('Menu_Move', 'Move')), 'move', !a.tbsMovedQ() || (a._tbsExtraMove && a._tbsTilesMoved === 0));
            }
            if (!(hide && a._tbsPerfAction)) this.addCommand(TextManager.attack, 'attack', a.canUse($dataSkills[a.attackSkillId()]));
            const skillTotal = a.skills().slice();
            for (const id of a.addedSkills()) skillTotal.push($dataSkills[id]);
            for (const stypeId of a.addedSkillTypes().slice().sort((x, y) => x - y)) {
                if (!skillTotal.some(s => s && s.stypeId === stypeId)) continue;
                if (!(hide && a._tbsPerfAction)) this.addCommand($dataSystem.skillTypes[stypeId], 'skill', true, stypeId);
            }
            this.addCommand(text('[44'), 'skill', true, 7);
            if (!a.isArmy() && !(hide && a._tbsPerfAction)) this.addCommand(TextManager.item, 'item');
            if (a.tbsPerfactionQ() === false) this.addCommand(TextManager.guard, 'defend', true);
            else this.addCommand(text(get('Menu_Wait', 'Wait')), 'wait', true);
        }
        setup(actor) {
            this._actor = actor;
            this.refresh();
            this.select(0);
            this.activate();
            this.open();
            this._actorDisplay.contents.clear();
            if (actor) this._actorDisplay.drawText(actor.name(), 0, 0, 88);
            this.height = this.maxItems() * LH + 24;
            this.createContents();
            this.refresh();
            this.select(0);
        }
        clearHelp() { if (this._helpWindow) this._helpWindow.setText(''); }
        callUpdateHelp() { if (this._helpWindow) this.updateHelp(); }
        updateHelp() {
            const help = {
                item: 'Help_Item', skill: 'Help_Class_Ability', attack: 'Help_Attack', move: 'Help_Move', status: 'Help_Status',
                defend: 'Help_Defend', wait: 'Help_Wait', escape: 'Help_Escape'
            }[this.currentSymbol()];
            const str = help ? vtext(help) : '';
            this._helpWindow.moveTo(8);
            this._helpWindow.moveTo(2);
            this._helpWindow.setText(str || '');
        }
        select(index) {
            Window_Command.prototype.select.call(this, index);
        }
    }
    tbsWindow(Commands_All, Window_ActorCommand);
    window.Commands_All = Commands_All;

    //=========================================================================
    // Progress_Bar: GTBS's HP/SP bars (100×16, the fill sliding to its value)
    //=========================================================================
    const ANIMATION_TIME = Math.max(1, get('STAT_ANIM_TIME', 2));
    class Progress_Bar {
        constructor(window, ox, oy, type) {
            this._window = window;
            this._ox = ox; this._oy = oy;
            this._width = 100; this._height = 16;
            this._type = type;
            this._current = 0; this._max = 100; this._current2 = 0; this._max2 = 100;
            this._animationCount = 0;
            this._storage = [];
            this.resizeFill();
        }
        bitmap() { return this._window.contents; }
        refresh(current = this._current, max = this._max, force = false) {
            if (!this.animating()) {
                this._current2 = current; this._max2 = max;
                if (this._current !== this._current2 || this._max !== this._max2 || force) {
                    this._animationCount = ANIMATION_TIME;
                    this.resizeFill();
                }
            } else {
                this._animationCount = 1;
                this._storage.push([current, max]);
            }
            this.update();
        }
        animating() { return this._animationCount > 0; }
        perc(current, max) { if (max === 0) return 0; if (max == null) return 1.0; return current / max; }
        resizeFill() {
            this._oldPerc = this.perc(this._current, this._max);
            this._newPerc = this.perc(this._current2, this._max2);
            this._rate = (this._newPerc - this._oldPerc) / ANIMATION_TIME;
        }
        update() {
            if (this.animating()) {
                this._animationCount--;
                this.fill(this._oldPerc + this._rate * (ANIMATION_TIME - this._animationCount));
                if (this._animationCount === 0) { this._current = this._current2; this._max = this._max2; }
            } else if (this._storage.length > 0) {
                const [c, m] = this._storage.shift();
                this.refresh(c, m);
            }
        }
        color(rate) {
            switch (this._type) {
                case 0: return [[80 - 24 * rate, 80 * rate, 14 * rate, 200], [240 - 72 * rate, 240 * rate, 62 * rate, 200]];
                case 1: return [[14 * rate, 80 - 24 * rate, 80 * rate, 200], [62 * rate, 240 - 32 * rate, 240 * rate, 200]];
                case 2: return [[180 * rate, 100 + 32 * rate, 30 * rate, 200], [200 + 10 * rate, 80 - 10 * rate, 30 * rate, 200]];
                default: return [[30 * rate, 150 - 24 * rate, 20 * rate, 200], [50 * rate, 180 - 24 * rate, 30 * rate, 200]];
            }
        }
        fill(rate) {
            const b = this.bitmap();
            b.fontSize = R.fontPx(get('Status_Gauge_Font_Size', 18));
            b.clearRect(this._ox, this._oy, this._width, this._height);
            if (rate >= 1.0) rate = 1;
            // The back: white with its corners cut, a dark gradient inside, drawn at 200.
            b.paintOpacity = 200;
            b.fillRect(this._ox, this._oy, this._width, this._height, '#ffffff');
            b.clearRect(this._ox, this._oy, 1, 1);
            b.clearRect(this._ox + this._width - 1, this._oy, 1, 1);
            b.clearRect(this._ox, this._oy + this._height - 1, 1, 1);
            b.clearRect(this._ox + this._width - 1, this._oy + this._height - 1, 1, 1);
            // (The inner gradient replaced the white in GTBS's own bitmap before it was drawn.)
            b.clearRect(this._ox + 1, this._oy + 1, this._width - 2, this._height - 2);
            b.gradientFillRect(this._ox + 1, this._oy + 1, this._width - 2, this._height - 2, 'rgba(0,0,0,0.78)', 'rgba(75,75,75,0.78)', true);
            const [c1, c2] = this.color(1);
            const fw = Math.max(0, Math.trunc((this._width - 4) * rate));
            if (fw > 0) b.gradientFillRect(this._ox + 2, this._oy + 2, fw, this._height - 4, css(c1), css(c2));
            b.paintOpacity = 255;
            this.setText();
        }
        setSymbol(sym) {
            if (typeof sym !== 'string') return;
            this._symbol = text(sym);
            this.setText();
        }
        setText() {
            if (this._symbol == null) return;
            const b = this.bitmap();
            b.textColor = ColorManager.normalColor();
            b.fontSize = R.fontPx(get('Status_Gauge_Font_Size', 18));
            const ts = b.measureTextWidth(this._symbol);
            b.drawText(this._symbol, this._ox, this._oy, ts * 2, this._height, 'left');
            const str = this._max2 == null ? `${get('Unknown_Text', '??')} / ${get('Unknown_Text', '??')}` : `${Math.trunc(this._current2)} / ${Math.trunc(this._max2)}`;
            b.drawText(str, this._ox, this._oy, this._width, this._height, 'right');
        }
    }

    //=========================================================================
    // Windows_Status_GTBS: the unit under the cursor
    //=========================================================================
    class Windows_Status_GTBS extends Window_Base {
        constructor() {
            super(rect(0, 0, 300, 175));
            this.openness = 255;
            this._attacker = null; this._actor = null; this._skill = null; this._type = 0;
            this._states = []; this._statesAct = null; this._preview = [];
            this.setupGauges();
            this.moveTo(9);
            this.refresh();
            this.winHelp = null;
        }
        lineHeight() { return LH; }
        setupGauges() {
            const types = [0, 1];
            if ($gameSystem.tbsCustBattle() === 'ATB') types.push(2);
            if ($dataSystem.optDisplayTp) types.push(3);
            const spacing = types.length > 3 ? 18 : 24;
            types.forEach((type, i) => {
                const y = spacing * i + 24;
                const bar = new Progress_Bar(this, 0, y, type);
                if (type === 0) { this._hpBar = bar; bar.setSymbol(TextManager.basic(2)); }
                if (type === 1) { this._mpBar = bar; bar.setSymbol(TextManager.basic(4)); }
                if (type === 2) { this._atBar = bar; if (get('Show_Action_Time_value', false)) bar.setSymbol(get('AT_TERM', 'AT')); }
                if (type === 3) { this._tpBar = bar; bar.setSymbol(TextManager.basic(6)); }
            });
        }
        act() { return this._actor; }
        hide() {
            this.visible = false;
            this.clearDmgPreview();
            this.tbsUpdate(null);
        }
        update() { Window_Base.prototype.update.call(this); }
        tbsUpdate(actor = null, nextActor = null, prevActor = null) {
            Window_Base.prototype.update.call(this);
            this.updateKeypress(nextActor);
            if (this._actor !== actor) {
                this._actor = actor;
                this.refresh(!!nextActor);
                if (nextActor && prevActor) this.drawNextprev(nextActor, prevActor);
            } else if (this._actor) {
                this.liteRefresh(nextActor);
            } else {
                this.updateGauges();
            }
        }
        // A switches between the full box and the compact one.
        updateKeypress(nextActor) {
            if (!this._actor) return;
            if (Input.isTriggered('rgssX')) {
                R.setSetting('statusmode', R.setting('statusmode') === 1 ? 0 : 1);
                this.refresh(nextActor);
            }
        }
        updateGauges() {
            this._hpBar.update(); this._mpBar.update();
            if (this._atBar) this._atBar.update();
            if (this._tpBar) this._tpBar.update();
        }
        dmgPreviewQ() { if (this._attacker != null && get('PREVIEW_DAMAGE', true)) this.dmgPreview(this._type, this._attacker, this._skill); }
        drawActorInfo() {
            const a = this._actor;
            this.clearInfo();
            this.resetFontSettings();
            const width = this.contents.width;
            const compact = R.setting('statusmode') === 1;
            if (!compact) this.drawText(text(a.tbsClassName()), 0, 0, width, 'right');
            const x = width - 96, y = 24;
            if (compact) {
                let name = text(a.name());
                if (name.length > 14) name = name.slice(0, 13) + '.';
                this.drawText(name, 0, 0, width);
                this.contents.clearRect(142 - 24, 24, 48, 48);
                if (!(a.isEnemy() && a.isArmy())) this.drawCenteredActorGraphic(a, 142, 48);
                if (!a.isArmy()) this.drawText(R.sprintf('Lv %d %s', a.level, text(a.tbsClassName()).slice(0, 3)), 0, 0, 178, 'right');
            } else {
                this.drawText(a.name(), 0, 0, width);
                this.contents.clearRect(x - 48, y + 46, 144, 98);
                drawFace96(this, a.faceName(), a.faceIndex(), x, y);
                const eq = a.isArmy() && a.isActor() ? a.equips()[0] : null;
                if (eq && $gameActors.actor(eq.id - 100)) {
                    const c = $gameActors.actor(eq.id - 100);
                    this.drawCharacter(c.characterName(), c.characterIndex(), x - 28, y + 10);
                }
            }
            if (a.isArmy() && a.isActor() && !compact) this.drawIcon(troopIconFor(a._classId), width / 2 - 12, 0);
            const tek = text(a.isArmy() ? '[201' : '[202 ');
            if (a.isActor() && !a.isArmy() && !a._tbsNeutral) this.drawExp(width - 96, 110, 96);
            this.contents.drawText(R.sprintf('%s%d', tek, a.level), width - 96, 108, 96, 24, 'center');
        }
        drawCenteredActorGraphic(a, x, y) {
            if (a.isArmy()) {
                const icon = troopIconFor(a._classId);
                for (const [dx, dy] of [[-12, -24], [12, -24], [0, -12], [12, 0], [-12, 0]]) this.drawIcon(icon, x + dx, y + dy + 4);
            } else {
                drawCenteredCharacter(this, a.tbsCharacterName() || (a.characterName ? a.characterName() : ''), a.tbsCharacterIndex(), x, y);
            }
        }
        drawExp(x, y, width) {
            const rate = (this._actor.currentExp() % 100) * 0.01;
            const gy = y + LH - 8;
            this.contents.fillRect(x, gy, width, 6, ColorManager.gaugeBackColor());
            this.contents.gradientFillRect(x, gy, Math.trunc(width * rate), 6, 'rgb(200,200,0)', 'rgb(150,150,0)');
        }
        drawNextprev(nextActor, prevActor) {
            this.contents.clearRect(0, 64, 130, 100);
            this.resetFontSettings();
            if (!nextActor || !prevActor) return;
            const drawOne = (actor, iconY, charY) => {
                if (actor.isArmy()) this.drawIcon(troopIconFor(actor._classId), 20, iconY);
                else this.drawCharacter(actor.characterName(), actor.characterIndex(), 40, charY);
            };
            drawOne(nextActor, 100 + LH, 100 + LH * 2);
            drawOne(prevActor, 100, 100 + LH);
            this.drawText('(W)', 0, 100 + LH, 180);
            this.drawText('(Q)', 0, 100, 180);
            this.drawText(nextActor.name(), 50, 100 + LH, 180);
            this.drawText(prevActor.name(), 50, 100, 180);
        }
        clearInfo() {
            this.contents.clearRect(0, 0, this.contents.width, 24);
            this.contents.clearRect(this.contents.width - 96, 24, 96, 96);
        }
        // The state or buff shown changes every second: its icon, name and turns left.
        refreshStates(force = false) {
            const a = this._actor;
            if (force || a !== this._statesAct || a._states.join() !== this._states.join() || Graphics.frameCount % 60 === 0) {
                this.contents.clearRect(0, 65, 110, this.contents.height - 65);
                this._statesAct = a;
                this._states = a._states.slice();
                this.drawActorIcons(a, 0, this.contents.height - 48);
            }
        }
        drawActorIcons(actor, x, y) {
            const messages = [];
            const shown = actor.states().filter(s => s.iconIndex !== 0);
            const turns = actor.stateTurnNumbers();
            shown.forEach((state, i) => {
                if (turns[i] == null) return;
                const word = ['Turni: %d', 'Turns: %d'][R.setting('language')] || 'Turns: %d';
                messages.push([state.iconIndex, text(state.name), R.sprintf(word, turns[i])]);
            });
            actor._buffs.forEach((lv, i) => {
                if (lv === 0) return;
                messages.push([lv > 0 ? 64 + i : 80 + i, TextManager.param(i), lv > 0 ? '+' + lv : String(lv)]);
            });
            if (!messages.length) return;
            const m = messages[idiv(Graphics.frameCount, 60) % messages.length];
            if (R.setting('statusmode') === 1) return;
            this.resetFontSettings();
            this.drawIcon(m[0], x, y + 12);
            this.drawText(m[1], x + 24, y, 80);
            this.drawText(m[2], x + 24, y + 24, 80);
        }
        refresh(placeMode = false) {
            if (!this.contents) return;
            this.contents.clear();
            if (R.setting('statusmode') === 1) { this.width = 200; this.height = 100; }
            else { this.width = 300; this.height = 175; }
            this.x = Graphics.width - this.width;
            if (this._actor == null) { this.hide(); return; }
            this.contents.clearRect(0, 0, this.contents.width, this.contents.height - 80);
            this.clearDmgPreview();
            this.drawActorInfo();
            this.refreshHp(); this.refreshMp(); this.refreshTp();
            this.updateGauges();
            if (!placeMode) this.refreshStates();
            this.visible = true;
        }
        liteRefresh(nextActor) {
            const a = this._actor;
            if (a.hp !== this._hp || a.mhp !== this._maxhp) this.refreshHp();
            if (a.mp !== this._mp || a.mmp !== this._maxmp) this.refreshMp();
            if (a.tp !== this._tp) this.refreshTp();
            this.updateGauges();
            if (!nextActor) this.refreshStates();
            this.dmgPreviewQ();
        }
        refreshHp() {
            const a = this._actor;
            if (a.tbsHideInfo()) { this._hp = null; this._maxhp = null; } else { this._hp = a.hp; this._maxhp = a.mhp; }
            this._hpBar.refresh(this._hp, this._maxhp, true);
        }
        refreshMp() {
            const a = this._actor;
            if (a.tbsHideInfo()) { this._mp = null; this._maxmp = null; } else { this._mp = a.mp; this._maxmp = a.mmp; }
            this._mpBar.refresh(this._mp, this._maxmp, true);
        }
        refreshTp() {
            const a = this._actor;
            if (a.tbsHideInfo()) { this._tp = null; } else { this._tp = a.tp; }
            if (this._tpBar) this._tpBar.refresh(this._tp, a.maxTp());
        }
        clearDmgPreview() {
            this._attacker = null; this._type = null; this._skill = null;
            for (const w of this._preview) { if (w.parent) w.parent.removeChild(w); w.destroy(); }
            this._preview = [];
        }
        // The forecast over each target. GTBS's attack passed the targets where the skill goes, so an attack
        // previews the unit the box shows.
        dmgPreview(type, attacker, skill = null, target = [this._actor]) {
            if (!get('PREVIEW_DAMAGE', true) || target == null) return;
            if (this._attacker === attacker && this._type === type && this._skill === skill) return;
            this.refresh();
            const actor = this._actor;
            if (!target.includes(this._actor)) this.tbsUpdate(this._attacker);
            this._attacker = attacker; this._type = type; this._skill = skill;
            target = target.slice().sort((a, b) => a.tbsScreenX() - b.tbsScreenX());
            for (const bat of target) {
                if (!bat) continue;
                const result = bat.tbsMakeDmgPreviewData(attacker, attacker.currentAction().item());
                const win = new Window_TBS_Preview(this._preview.length, bat);
                this._preview.push(win);
                if (this.parent) this.parent.addChild(win);
                win.refreshPreview(result);
            }
            this._actor = actor;
            this.visible = true;
        }
        set visible(v) { super.visible = v; if (this._preview) for (const w of this._preview) w.visible = v; }
        get visible() { return super.visible; }
    }
    Windows_Status_GTBS.prototype.moveTo = moveTo;
    window.Windows_Status_GTBS = Windows_Status_GTBS;

    // The forecast: the unit's (short) name, Hit %, Critical % and the damage or healing.
    class Window_TBS_Preview extends Window_Base {
        constructor(index, battler) {
            const width = 100, height = 124;
            let x = Graphics.width / 2 - width / 2;
            index = Math.abs(index);
            if (index !== 0) { if (index % 2 === 0) x += index / 2 * 80; else x -= (index + 1) / 2 * 80; }
            super(rect(x, 225, width, height));
            this._battler = battler;
            this.opacity = 0;
        }
        refreshPreview(result) {
            const b = this.contents;
            let [hit, dmg, , hitStates, remStates, mp, cri] = result;
            b.fontSize = R.fontPx(18);
            const ts = b.measureTextWidth(`Mir ${hit}%`);
            const x = 5, y = 0, w = ts, h = 24;
            hit = Math.max(0, Math.min(100, hit));
            cri = Math.max(0, Math.min(100, cri));
            const name = text(this._battler.name());
            const words = name.split(' ');
            let display = name;
            if (words.length !== 1) display = words.map(wd => wd.slice(0, 3) + (wd.length > 3 ? '.' : '')).join(' ') + ' ';
            b.outlineWidth = 3;
            b.textColor = ColorManager.normalColor();
            b.drawText(display, x, y, w + 10, h, 'left');
            b.drawText(text('[230'), x, y + 16, w, h, 'left');
            b.drawText(`${hit}%`, x, y + 16, w - 8, h, 'right');
            if (dmg > 0) { b.drawText(text('[231'), x, y + 32, w, h, 'left'); b.drawText(`${cri}%`, x, y + 32, w - 8, h, 'right'); }
            let label;
            if (dmg < 0) { dmg = -dmg; b.textColor = 'rgb(0,255,0)'; label = '[233'; }
            else if (mp) { b.textColor = 'rgb(0,0,255)'; label = '[232'; }
            else label = '[232';
            label = text(label);
            if (dmg !== 0) { b.drawText(label, x, y + 48, w, h, 'left'); b.drawText(String(dmg), x - 8, y + 48, w, h, 'right'); }
            else if (!(hitStates.length > 0 || remStates.length > 0)) b.drawText(`${label} ${dmg}`, x, y + 48, w, h, 'left');
            b.textColor = ColorManager.normalColor();
        }
    }
    window.Window_TBS_Preview = Window_TBS_Preview;

    //=========================================================================
    // Command_Confirm: Yes / No under a question
    //=========================================================================
    class Command_Confirm extends Window_Selectable {
        constructor() {
            super(rect(200, 300, 240, 96));
            this.select(-1);
            this.resetCommands();
            this.refreshQuestion('');
        }
        lineHeight() { return LH; }
        maxItems() { return 2; }
        maxCols() { return 2; }
        question() { return this._question; }
        resetCommands() { this._list = [text(V.Yes || 'Yes'), text(V.No || 'No')]; }
        tbsIndex() { return this.visible ? this.index() : 0; }
        refreshQuestion(str) {
            this.contents.fontSize = $gameSystem.mainFontSize();
            const tw = this.contents.measureTextWidth(str);
            this.width = Math.max(240, tw);
            this.x = (Graphics.width - this.width) / 2;
            this.createContents();
            this.contents.clear();
            this.drawItem(0); this.drawItem(1);
            this.select(0);
            this.contents.drawText(str, 0, 0, this.contents.width, LH, 'center');
        }
        itemRect(index) {
            const w = this.contents ? this.contents.width : this.innerWidth;
            return new Rectangle(index === 1 ? w / 2 : 0, 32, w / 2, 28);
        }
        drawItem(index) {
            const r = this.itemRect(index);
            this.resetTextColor();
            this.contents.drawText(this._list[index], r.x, r.y, r.width, r.height, 'center');
        }
        refresh() {}
        // ask: the question for an action (attack, skill, item, wait, move …). Moves, and actions when
        // GTBS confirms none, ask without showing the window.
        ask(type, ...args) {
            let str = '';
            switch (type) {
                case 'move':
                    str = args[0] != null && args[0] > 0 ? R.sprintf(V.Move_Here_with_Cost || '%s %s', args[0], args[1]) : (V.Move_Here || '');
                    this.visible = get('MOVE_CONFIRM', false);
                    break;
                case 'attack': str = V.Attack_Here; this.visible = get('ATTACK_CONFIRM', true); break;
                case 'skill': str = V.Use_Here; this.visible = get('ATTACK_CONFIRM', true); break;
                case 'item': str = V.Use_Item_Here; this.visible = get('ATTACK_CONFIRM', true); break;
                case 'revive': str = R.sprintf(V.Revive_Target || '%s', args[0]); this.visible = get('ATTACK_CONFIRM', true); break;
                case 'place': str = V.Place_Here; this.visible = true; break;
                case 'surrender': str = V.Surrender_Now; break;
                case 'escape': str = R.party.mode() === 'troops' ? V.Escape_Now_Army : V.Escape_Now; break;
                case 'wait': str = args[0]; this.visible = true; break;
                default: break;
            }
            this.refreshQuestion(text(String(str ?? '')));
            this._question = type;
            this.active = true;
        }
    }
    tbsWindow(Command_Confirm, Window_Selectable);
    window.Command_Confirm = Command_Confirm;

    //=========================================================================
    // TBS_Item / TBS_Skill: the lists over the help line moved to the top
    //=========================================================================
    class TBS_Item extends Window_ItemList {
        constructor(helpWindow) {
            super(rect(Graphics.width / 6, helpWindow.height, Graphics.width * 2 / 3, 256));
            this.hide();
            this.setCategory('item');
        }
        lineHeight() { return LH; }
        maxCols() { return 1; }
        includes(item) { return !!item && U.isItem(item) && U.battleOk(item); }
        isEnabled() { return true; }
        show() { this.selectLast(); this.showHelpWindow(); super.show(); this.refresh(); }
        hide() { this.hideHelpWindow(); super.hide(); }
        update() {
            if (this._rrTick) { Window_ItemList.prototype.update.call(this); if (this._helpWindow) this.updateHelp(); }
            else Window_Base.prototype.update.call(this);
        }
    }
    TBS_Item.prototype.tbsUpdate = function() { this._rrTick = true; try { this.update(); } finally { this._rrTick = false; } };
    window.TBS_Item = TBS_Item;
    class TBS_Skill extends Window_SkillList {
        constructor(helpWindow) {
            super(rect(80, helpWindow.height, Graphics.width - 160, 256));
            this.hide();
        }
        lineHeight() { return LH; }
        skill() { return this.item(); }
        show() { this.selectLast(); this.showHelpWindow(); super.show(); }
        hide() { this.hideHelpWindow(); super.hide(); }
        select(index) { super.select(index); if (this._helpWindow && this.active) this.updateHelp(); }
        callUpdateHelp() { if (this._helpWindow) this.updateHelp(); }
    }
    tbsWindow(TBS_Skill, Window_SkillList);
    window.TBS_Skill = TBS_Skill;

    //=========================================================================
    // Window_Full_Status: the status screen, for any unit
    //=========================================================================
    class Window_Full_Status extends Window_Status {
        constructor() {
            super(rect(0, 0, Graphics.width, Graphics.height));
            this.deactivate();
        }
        refresh(actor) {
            if (actor instanceof Game_Battler) { this._actor = actor; }
            if (!this._actor) { Window_StatusBase.prototype.refresh.call(this); return; }
            try {
                Window_Status.prototype.refresh.call(this);
            } catch (_) {
                // A unit the status screen cannot draw (an enemy): its name, face, HP, SP and parameters.
                this.contents.clear();
                const a = this._actor;
                this.resetFontSettings();
                this.drawText(a.name(), 4, 0, 200);
                drawFace96(this, a.faceName(), a.faceIndex(), 4, LH * 2);
                this.drawText(`${TextManager.levelA} ${a.level}`, 120, LH * 2, 120);
                this.drawText(`${TextManager.hpA} ${a.hp}/${a.mhp}`, 120, LH * 3, 200);
                this.drawText(`${TextManager.mpA} ${a.mp}/${a.mmp}`, 120, LH * 4, 200);
                for (let i = 2; i < 8; i++) this.drawText(`${TextManager.param(i)} ${a.param(i)}`, 32, LH * (6 + i), 200);
            }
        }
    }
    tbsWindow(Window_Full_Status, Window_Status);
    window.Window_Full_Status = Window_Full_Status;

    //=========================================================================
    // Battle_Option: End Turn, the animation speed, the goal, Escape or
    // Surrender, Cancel; with both sides' banners and how many each has left
    //=========================================================================
    class Battle_Option extends Window_Selectable {
        constructor() {
            const width = 440;
            super(rect((Graphics.width - width) / 2, Graphics.height - 143, width, 4 * LH - 80));
            this._options = [];
            this.refresh();
        }
        lineHeight() { return LH; }
        maxItems() { return this._options ? this._options.length : 1; }
        maxCols() { return 1; }
        option() { return this._options[this.index()]; }
        itemRect(index) { return new Rectangle(0, index * LH - this.scrollBaseY(), Math.floor((this.innerWidth + 32 - 32) / 3), LH); }
        availableOptions() {
            const out = [];
            if ($gameSystem.tbsCustBattle() === 'TEAM') out.push('End Turn'); else if (get('ACT_LIST', true)) out.push('Act List');
            out.push('Anim');
            out.push('Conditions', BattleManager.canEscape() ? 'Escape' : 'Surrender', 'Cancel');
            return out;
        }
        refresh() {
            this._options = this.availableOptions();
            this.height = (this._options.length + 1) * LH;
            this.createContents();
            const names = { 'End Turn': V.Battle_Option_End_Turn, 'Act List': V.Battle_Option_Act_List, Conditions: V.Battle_Option_Conditions,
                Config: V.Battle_Option_Config, Surrender: V.Surrender, Anim: V.Anim, Escape: V.Escape, Cancel: V.Battle_Option_Cancel };
            this.resetFontSettings();
            for (let i = 0; i < this._options.length; i++) {
                let str;
                if (i === 1) str = R.sprintf('%s%s', text('[116'), text(['[117', '[118', '[119'][R.setting('anim')] || '[117'));
                else str = text(names[this._options[i]] || this._options[i]);
                this.contents.drawText(str, 2, i * LH, 100, LH, 'left');
            }
            this.drawBattleBlock();
        }
        drawBattleBlock() {
            const sc = R.scene();
            if (!sc) return;
            const troops = R.party.mode() === 'troops';
            const playerName = troops ? '[195' : '[194';
            const flag = R.party.flag();
            const type = R.party.troopTable().troopNameflag()[$gameTroop.troopId()];
            const faction = R.party.troopTable().factionNames()[type] || ['', 'Enemy'];
            let pc, pm, ec, em;
            if (troops) {
                const armies = (team) => sc.friendsOf(team).filter(m => m.isArmy());
                pc = armies('actor').reduce((s, a) => s + a.level, 0); pm = armies('actor').reduce((s, a) => s + a.lastLevel, 0);
                ec = armies('enemy').reduce((s, a) => s + a.level, 0); em = armies('enemy').reduce((s, a) => s + a.lastLevel, 0);
            } else {
                pc = sc.friendsOf('actor').filter(m => !m.isDeathStateAffected()).length; pm = sc.friendsOf('actor').length;
                ec = sc.friendsOf('enemy').filter(m => !m.isDeathStateAffected()).length; em = sc.friendsOf('enemy').length;
            }
            const cw = this.contents.width;
            const pr = { x: cw / 3, y: -20, w: cw / 3 }, er = { x: cw * 2 / 3, y: -20, w: cw / 3 };
            const drawFlag = (name, r) => {
                const bmp = ImageManager.loadPicture('Factions/' + name);
                const go = () => { if (!this.contents) return; this.contents.paintOpacity = 160; this.contents.blt(bmp, 0, 0, bmp.width, bmp.height, r.x + r.w / 2 - bmp.width / 2, 0); this.contents.paintOpacity = 255; this.drawBlockTexts(); };
                if (bmp.isReady()) go(); else bmp.addLoadListener(go);
            };
            this._block = { troops, playerName, faction, pc, pm, ec, em, pr, er };
            drawFlag(flag, pr);
            drawFlag(faction[1], er);
            this.drawBlockTexts();
        }
        drawBlockTexts() {
            const k = this._block;
            if (!k) return;
            const { pr, er } = k;
            this.contents.clearRect(pr.x, pr.y + 20, pr.w, LH);
            if (R.setting('language') === 0) {
                this.drawText(k.playerName, pr.x, pr.y + 20, pr.w, 'center');
                this.drawText($gameActors.actor(1).name(), pr.x, LH + pr.y + 20, pr.w, 'center');
            } else {
                this.drawText($gameActors.actor(1).name() + text(k.playerName), pr.x, pr.y + 20, pr.w, 'center');
            }
            this.drawText(text(k.faction[0]), er.x, er.y + 20, pr.w, 'center');
            const unit = text(k.troops ? '[191' : '[192');
            this.drawText(R.sprintf('%s: %d', unit, k.pc), pr.x, pr.y + LH * 4 - 8 + 8, pr.w, 'center');
            this.drawText(R.sprintf('%s: %d', unit, k.ec), er.x, er.y + LH * 4 - 8 + 8, er.w, 'center');
            const pm = k.pm === 0 ? 1 : k.pm, em = k.em === 0 ? 1 : k.em;
            const prate = 0.01 * idiv(k.pc * 100, pm), erate = 0.01 * idiv(k.ec * 100, em);
            const gy = pr.y + LH * 4 + 8 + LH - 8;
            const fillP = Math.trunc(pr.w * prate), fillE = Math.trunc(er.w * erate);
            this.contents.fillRect(pr.x, gy, pr.w, 6, ColorManager.gaugeBackColor());
            this.contents.gradientFillRect(pr.x + pr.w - fillP, gy, fillP, 6, ColorManager.textColor(3), ColorManager.textColor(11));
            this.contents.fillRect(er.x, gy, er.w, 6, ColorManager.gaugeBackColor());
            this.contents.gradientFillRect(er.x, gy, fillE, 6, ColorManager.textColor(10), ColorManager.textColor(18));
            this.drawIcon(562, er.x - 12, pr.y + LH * 4 + 8 + 8);
        }
    }
    tbsWindow(Battle_Option, Window_Selectable);
    window.Battle_Option = Battle_Option;

    //=========================================================================
    // Window_Minimap (Zoro): the map's image with a dot for each unit
    //=========================================================================
    class Window_Minimap extends Window_Base {
        constructor() {
            const w = $gameMap.width() * 8 + 24, h = $gameMap.height() * 8 + 24;
            super(rect(Graphics.width / 2 - w / 2, Graphics.height - 140 - h, w, h));
            this.refresh();
        }
        refresh() {
            this.contents.clear();
            const shot = R.mapshot();
            if (shot && shot._rrMapshotReady) this.contents.blt(shot, 0, 0, shot.width, shot.height, 0, 0, this.contents.width, this.contents.height);
            const sc = R.scene();
            if (!sc) return;
            for (const b of sc.tacticsAll()) {
                if (!b.isAlive()) continue;
                let img;
                if (b.isActor()) img = b.hasSkill(143) ? (b.tbsUnitSize() === 2 ? 'AllyLargeStructureDot' : 'AllyStructureDot') : (b.isArmy() ? 'AllyArmyDot' : 'AllyDot');
                else if (b.isArmy()) img = 'EnemyArmyDot';
                else if (b.hasSkill(143)) img = b.tbsUnitSize() === 2 ? 'EnemyLargeStructureDot' : 'EnemyStructureDot';
                else img = b.tbsUnitSize() === 2 ? 'EnemyLargeDot' : 'EnemyDot';
                const bmp = ImageManager.loadSystem(img);
                const boss = b.collapseType() === 1;
                const go = () => {
                    if (!this.contents) return;
                    this.contents.blt(bmp, 0, 0, bmp.width, bmp.height, b.x * 8, b.y * 8);
                    if (boss) { const crown = ImageManager.loadSystem('Crown'); if (crown.isReady()) this.contents.blt(crown, 0, 0, 9, 8, b.x * 8, b.y * 8); }
                };
                if (bmp.isReady()) go(); else bmp.addLoadListener(go);
            }
        }
    }
    window.Window_Minimap = Window_Minimap;

    //=========================================================================
    // Window_EXP_Earn: levels gained (when experience is not popped)
    //=========================================================================
    class Window_EXP_Earn extends Window_Base {
        constructor(attacker, levels) {
            super(rect(120, 60, 352, levels.size * 32 + 64));
            this.contents.drawText('-LEVEL-', 0, 0, 320, 24, 'center');
            let y = 32;
            for (const [actor, [lv1, lv2]] of levels) {
                this.drawText(actor.name(), 4, y, 160);
                this.changeTextColor(ColorManager.systemColor());
                this.contents.drawText('Lv', 168, y, 24, 32);
                this.contents.drawText(' -→>', 228, y, 24, 32);
                this.resetTextColor();
                this.contents.drawText(String(lv1), 192, y, 32, 32, 'right');
                this.contents.drawText(String(lv2), 254, y, 32, 32);
                y += 32;
            }
        }
    }
    window.Window_EXP_Earn = Window_EXP_Earn;

    //=========================================================================
    // TBS_Window_BattleLog: Ace's battle log (lines 120 px in, on a dark band),
    // the game's "<name> attacks / uses <skill>" line; its results show the
    // hit's sounds and effects and are gone the same frame, as without waits
    //=========================================================================
    class TBS_Window_BattleLog extends Window_Base {
        constructor() {
            super(rect(0, 0, Graphics.width, 6 * LH + 24));
            this.opacity = 0;
            this._lines = [];
            this._back = new Sprite(new Bitmap(this.width, this.height));
            this.addChildToBack(this._back);
            this.refreshLog();
        }
        lineHeight() { return LH; }
        maxLineNumber() { return 6; }
        clear() { this._lines.length = 0; this.refreshLog(); }
        lineNumber() { return this._lines.length; }
        backOne() { this._lines.pop(); this.refreshLog(); }
        backTo(n) { while (this._lines.length > n) this._lines.pop(); this.refreshLog(); }
        addText(str) { this._lines.push(str); this.refreshLog(); }
        replaceText(str) { this._lines.pop(); this._lines.push(str); this.refreshLog(); }
        lastText() { return this._lines[this._lines.length - 1]; }
        refreshLog() {
            const b = this._back.bitmap;
            b.clear();
            b.fillRect(0, this.padding, this.width, this._lines.length * LH, 'rgba(0,0,0,0.25)');
            this.contents.clear();
            this._lines.forEach((line, i) => { this.resetFontSettings(); this.drawTextEx(text(String(line)), 120, i * LH, this.innerWidth); });
        }
        showExpGain(actor, exp) {
            $gameMessage.newPage();
            $gameMessage.add(R.sprintf(V.LOG_Gain_Exp || '%s %d', actor.name(), exp));
        }
        displayUseItem(subject, item) {
            if (U.isSkill(item)) {
                const msg = item.message1 ? ' ' + text(item.message1) + ' ' + text(item.name) : ' ' + text('[1499');
                this.addText(subject.name() + msg);
            } else if (item) {
                this.addText(TextManager.useItem.format(subject.name(), text(item.name)));
            }
        }
        displayActionResults(target, item) {
            const r = target.result();
            if (!r.used) return;
            const last = this.lineNumber();
            this.displayCritical(target);
            this.displayDamage(target, item);
            this.displayAffectedStatus(target);
            if (r.isHit() && !r.success) this.addText(TextManager.actionFailure.format(target.name()));
            this.backTo(last);
        }
        // VE: a critical flashes the map red and shakes it.
        displayCritical(target) {
            if (!target.result().critical) return;
            $gameScreen.startFlash([255, 0, 0, 128], 8);
            $gameScreen.startShake(8, 10, 1);
            this.addText(target.isActor() ? TextManager.criticalToActor : TextManager.criticalToEnemy);
        }
        displayDamage(target, item) {
            const r = target.result();
            if (r.missed) {
                if (!item || U.physical(item)) { SoundManager.playMiss(); this.addText((target.isActor() ? TextManager.actorNoHit : TextManager.enemyNoHit).format(target.name())); }
                else this.addText(TextManager.actionFailure.format(target.name()));
            } else if (r.evaded) {
                if (!item || U.physical(item)) SoundManager.playEvasion(); else SoundManager.playMagicEvasion();
            } else {
                if (!(r.hpDamage === 0 && item && !U.toHp(item))) {
                    if (r.hpDamage > 0 && r.rrHpDrain === 0) this.performDamageEffect(target);
                    if (r.hpDamage < 0) SoundManager.playRecovery();
                    this.addText(String(r.hpDamage));
                }
                if (!target.isDead() && r.mpDamage !== 0) { if (r.mpDamage < 0) SoundManager.playRecovery(); this.addText(String(r.mpDamage)); }
                if (!target.isDead() && r.tpDamage !== 0) { if (r.tpDamage < 0) SoundManager.playRecovery(); this.addText(String(r.tpDamage)); }
            }
        }
        // Ace's perform_damage_effect: the unit blinks and the damage sound plays (an actor's shake was on the
        // troop's screen, which the map does not show).
        performDamageEffect(target) {
            target._spriteEffectType = 'blink';
            if (target.isActor()) SoundManager.playActorDamage(); else SoundManager.playEnemyDamage();
        }
        displayAffectedStatus(target) {
            const r = target.result();
            if (!(r.addedStates.length || r.removedStates.length || r.addedBuffs.length || r.addedDebuffs.length || r.removedBuffs.length)) return;
            for (const id of r.addedStates) {
                if (id === target.deathStateId()) this.performCollapseEffect(target);
            }
        }
        performCollapseEffect(target) {
            if (!$gameParty.inBattle()) return;
            if (target.isActor()) { target._spriteEffectType = 'collapse'; SoundManager.playActorCollapse(); return; }
            switch (target.collapseType()) {
                case 0: target._spriteEffectType = 'collapse'; SoundManager.playEnemyCollapse(); break;
                case 1: target._spriteEffectType = 'boss_collapse'; SoundManager.playBossCollapse1(); break;
                case 2: target._spriteEffectType = 'instant_collapse'; break;
                default: break;
            }
        }
    }
    window.TBS_Window_BattleLog = TBS_Window_BattleLog;
})();
