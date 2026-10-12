/*:
 * @target MZ
 * @plugindesc Pain System (VX), for imported games
 * @author Thrall's author; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallPain.js
 *
 * Thrall's Pain menu: ten ways to make the game harder, each set from 0 to 3
 * with left and right (Monstrous off or on), A to clear one, S to max it,
 * Clear Pains to reset all. Each is a variable from 141 to 150; the sum
 * against the Pain Threshold (variable 151, at least 5) shows as a gauge and
 * sets the rewards (gold, drop rate, experience, and a multiplier from 5).
 * Switch 66 locks the menu. Cancel returns to the map.
 *
 * The battle port reads the Pains (enemies' Invincible hits are the Pain
 * of each enemy; a hero's Pain under variable 185 = 23).
 *
 * Event calls: $scene = Scene_Heat.new opens the menu
 * (SceneManager.goto(Scene_ThrallHeat)); battler.pain is
 * battler.rrPain() / rrSetPain(n).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    // A class other code may build by its global name is published as a plain MZ-style constructor: the engine
    // re-wraps every display class on window and calls the original without `new`, which a class cannot take.
    const mzGlobal = (name, Cls) => {
        const F = { [name]: function(...args) { this.initialize(...args); } }[name];
        F.prototype = Cls.prototype;
        Object.setPrototypeOf(F, Cls);
        window[name] = F;
        return F;
    };
    const WLH = 24;
    const vars = (id) => $gameVariables.value(id);
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    const ROWS = [
        { icon: 216, name: 'Goliath', values: ['0%', '50%', '100%', '150%'], help: 'Increase maximum enemy HP' },
        { icon: 121, name: 'Firepower', values: ['0%', '20%', '40%', '60%'], help: 'Increase enemy damage' },
        { icon: 239, name: 'Unstoppable', values: ['0%', '30%', '60%', '90%'], help: 'Increase enemy DEF and DEX' },
        { icon: 51, name: 'Invincible', values: ['0', '1', '2', '3'], help: 'Enemies take no damage for x number of hits' },
        { icon: 223, name: 'Monstrous', values: ['Off', null, null, 'On'], help: 'Bosses present new and unique challenges' },
        { icon: 765, name: 'Burdened', values: ['0', '1', '2', '3'], help: 'Salvage x amount of loot to proceed in a dungeon' },
        { icon: 5, name: 'Horde', values: ['1', '2', '3', '4'], help: 'Minimum number of enemies per encounter', half: true },
        { icon: 49, name: 'Suffocate', values: ['Infinite', '3:00', '2:00', '1:00'], help: 'Time limit per dungeon floor', half: true },
        { icon: 745, name: 'Abyss', values: ['+0%', '+20%', '+40%', '+60%'], help: 'Dungeons have more floors', half: true },
        { icon: 759, name: 'Famine', values: ['-0%', '-20%', '-40%', '-60%'], help: 'Healing items restore less HP' },
        { icon: 743, name: 'Clear Pains', values: null, help: 'Reset all Pains' }
    ];

    class Window_ThrallHeat extends Window_Selectable {
        initialize() {
            super.initialize(new Rectangle(0, 56, 608, 424));
            this.select(0);
            this.activate();
            this.refresh();
        }
        updatePadding() { this.padding = 16; }
        itemHeight() { return WLH; }
        maxItems() { return ROWS.length; }
        maxCols() { return 1; }
        color(n) { return this.rrVxTextColor ? this.rrVxTextColor(n) : ColorManager.textColor(n); }
        normal() { return this.rrVxNormalColor ? this.rrVxNormalColor() : ColorManager.normalColor(); }
        system() { return this.rrVxSystemColor ? this.rrVxSystemColor() : ColorManager.systemColor(); }
        icon(index, x, y) { if (this.rrVxDrawIcon) this.rrVxDrawIcon(index, x, y, true); else this.drawIcon(index, x, y); }
        text(x, y, w, h, t, align = 0) { this.contents.drawText(String(t), x, y, w, h, ['left', 'center', 'right'][align]); }
        // update_cursor: the cursor sits one row below each item (row 0 is the title).
        itemRect(index) { return new Rectangle(0, index * 24 + 24 - this.scrollBaseY(), this.innerWidth, 24); }
        refresh() {
            this.contents.clear();
            for (let i = 0; i < ROWS.length; i++) this.drawRow(i);
        }
        drawItem() {}
        drawRow(index) {
            const sw = this.innerWidth, dw = sw;
            const col = 'rgba(160,160,160,1)';
            const col2 = vars(80) > 0 ? this.normal() : this.color(14);
            let threshold = vars(151);
            if (threshold < 5) threshold = 5;
            let pain = 0;
            for (let i = 141; i <= 150; i++) pain += vars(i);
            if (index === 0) {
                this.changeTextColor(this.system());
                const title = 'Pain Settings';
                this.text(0, 0, dw, WLH, title);
                if ($gameSwitches.value(66)) {
                    const tw = this.contents.measureTextWidth(title);
                    this.icon(744, tw + 4, 0);
                    this.changeTextColor(col2);
                    this.text(tw + 32, 0, dw, WLH, 'Locked');
                }
                let text, gc1, gc2;
                if (pain < threshold) { this.changeTextColor(this.normal()); gc1 = this.color(3); gc2 = this.color(5); text = 'Pain Threshold not met. '; }
                else if (pain === threshold) { this.changeTextColor(this.color(12)); gc1 = this.color(5); gc2 = this.color(12); text = 'Pain Threshold reached! '; }
                else { this.changeTextColor(col2); gc1 = this.color(12); gc2 = this.color(20); text = 'Pain Threshold exceeded! '; }
                text += pain + '/' + threshold;
                const gw = Math.min(idiv(448 * pain, threshold), 448);
                this.text(0, WLH * 13, 576, WLH, text, 1);
                const back = this.rrVxGaugeBackColor ? this.rrVxGaugeBackColor() : ColorManager.gaugeBackColor();
                this.contents.fillRect(64, WLH * 14 + 8, 448, 8, back);
                this.contents.gradientFillRect(64, WLH * 14 + 8, gw, 8, gc1, gc2);
            }
            const row = ROWS[index];
            const dy = WLH * (index + 1);
            this.icon(row.icon, 0, dy);
            this.changeTextColor(this.normal());
            this.text(24, dy, (row.half ? idiv(dw, 2) : idiv(dw, 3)) - 20, WLH, row.name);
            if (row.values) {
                const v = vars(141 + index);
                row.values.forEach((label, i) => {
                    if (label == null) return;
                    const value = index === 4 ? (i === 0 ? 0 : 3) : i;
                    this.changeTextColor(v === value ? (i === 0 ? this.normal() : col2) : col);
                    this.text(idiv(sw * (i + 2), 7), dy, idiv(dw, 4), WLH, label, 1);
                });
            } else {
                // Clear Pains, and the rewards the Pains bring.
                const rewards = Math.min(pain, threshold);
                const y = WLH * 15, ox = idiv(sw, 5);
                this.icon(8, ox - 24, y); this.icon(13, ox * 2 - 24, y); this.icon(238, ox * 3 - 24, y); this.icon(764, ox * 4 - 24, y);
                this.changeTextColor(this.normal());
                this.text(ox, y, ox, WLH, '+' + rewards * 5 + '%');
                this.text(ox * 2, y, ox, WLH, '+' + rewards + '%');
                this.text(ox * 3, y, ox, WLH, '+' + rewards * 2 + '%');
                this.text(ox * 4, y, ox, WLH, rewards >= 5 ? 'x' + rewards : 'x0');
            }
        }
        processHandling() {}
        processCursorMove() {
            if (!this.isCursorMovable()) return;
            const last = this.index();
            if (Input.isRepeated('down')) this.cursorDown(Input.isTriggered('down'));
            if (Input.isRepeated('up')) this.cursorUp(Input.isTriggered('up'));
            if (this.index() !== last) this.playCursorSound();
        }
    }
    mzGlobal('Window_ThrallHeat', Window_ThrallHeat);

    class Scene_ThrallHeat extends Scene_MenuBase {
        create() {
            super.create();
            this._helpWindow = new Window_Base(new Rectangle(0, 0, 608, 56));
            this.addWindow(this._helpWindow);
            this._heatWindow = new Window_ThrallHeat();
            this.addWindow(this._heatWindow);
            this._lastIndex = 100;
        }
        updateHelp() {
            const w = this._helpWindow;
            w.contents.clear();
            w.contents.drawText(ROWS[this._heatWindow.index()].help, 4, 0, 504, 24, 'left');
        }
        update() {
            super.update();
            const w = this._heatWindow;
            if (this._lastIndex !== w.index()) { this._lastIndex = w.index(); this.updateHelp(); }
            if (Input.isTriggered('cancel')) { SoundManager.playCancel(); SceneManager.goto(Scene_Map); return; }
            const i = w.index();
            const locked = $gameSwitches.value(66);
            const v = 141 + i;
            if (Input.isRepeated('left') && i < 10) {
                if (locked) { SoundManager.playBuzzer(); return; }
                $gameVariables.setValue(v, vars(v) - (v === 145 ? 3 : 1));
                if (vars(v) < 0) $gameVariables.setValue(v, 0); else { w.refresh(); SoundManager.playCursor(); }
            } else if (Input.isRepeated('right') && i < 10) {
                if (locked) { SoundManager.playBuzzer(); return; }
                $gameVariables.setValue(v, vars(v) + (v === 145 ? 3 : 1));
                if (vars(v) > 3) $gameVariables.setValue(v, 3); else { w.refresh(); SoundManager.playCursor(); }
            } else if (Input.isTriggered('pageup') && i < 10) {
                if (locked) { SoundManager.playBuzzer(); return; }
                $gameVariables.setValue(v, 0); w.refresh(); SoundManager.playOk();
            } else if (Input.isTriggered('pagedown') && i < 10) {
                if (locked) { SoundManager.playBuzzer(); return; }
                $gameVariables.setValue(v, 3); w.refresh(); SoundManager.playOk();
            } else if (Input.isTriggered('ok') && i === 10) {
                if (locked) { SoundManager.playBuzzer(); return; }
                for (let k = 141; k <= 150; k++) $gameVariables.setValue(k, 0);
                w.refresh(); SoundManager.playOk();
            }
        }
    }
    mzGlobal('Scene_ThrallHeat', Scene_ThrallHeat);
})();
