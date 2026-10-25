//=============================================================================
// reactor_fight_menu.js - The battle menu of battles on the map
//=============================================================================
//
// What Cancel opens in a battle on the map where there is nothing to step
// back from, in place of the game's pause menu: one window showing a page at
// a time (the menu itself, the units, the goal, the controls, the options,
// and the questions asked before something that cannot be taken back). The
// battle waits behind it.
//
// It stands on the Tactical driver (reactor_fight_tactical.js), whose
// windows, input, hint line, control names and view it uses: they are bound
// below from what that file exports.
//=============================================================================

(function(root) {
    "use strict";

    const F = root.ReactorFight;
    const W = F ? F.Windows : null;
    if (!F || !W) return;
    const In = F.Input, Hints = F.Hints, Controls = F.Controls, View = F.View;
    const frameNow = F.frameNow, sound = F.sound, EMPTY = F.EMPTY;

    if (typeof Window_Command !== "undefined") {
        // The battle menu: what Cancel opens where there is nothing to step back from, in place of the game's pause
        // menu (a battle has no Save, Formation or Equip). One window showing a page at a time: the menu itself, the
        // units (OK looks at one), the goal, the controls, the options, and the questions End Turn and Retreat ask.
        // While it is up the battle waits (Game_Fight.update).
        function Window_FightMenu() { this.initialize(...arguments); }
        Window_FightMenu.prototype = Object.create(Window_Command.prototype);
        Window_FightMenu.prototype.constructor = Window_FightMenu;
        Window_FightMenu.prototype.initialize = function(rect) {
            this._page = "main";
            this._head = EMPTY;
            Window_Command.prototype.initialize.call(this, rect);
            this.openness = 0;
            this.deactivate();
        };
        /** The lines over the rows (a question, a page's title): not rows, never under the cursor. */
        Window_FightMenu.prototype.headHeight = function() {
            return this._head.length ? this._head.length * this.lineHeight() + 8 : 0;
        };
        Window_FightMenu.prototype.itemRect = function(index) {
            const rect = Window_Command.prototype.itemRect.call(this, index);
            rect.y += this.headHeight();
            return rect;
        };
        Window_FightMenu.prototype.overallHeight = function() {
            return Window_Command.prototype.overallHeight.call(this) + this.headHeight();
        };
        // The pages that ask before something that cannot be taken back: the first row is the answer that changes nothing.
        const QUESTIONS = ["endTurn", "retreat", "auto", "fall"];
        Window_FightMenu.prototype.itemTextAlign = function() {
            return this._page === "main" || QUESTIONS.includes(this._page) ? "center" : "left";
        };
        // Cancel is a press here, not a hold: the press that opened the menu, still held, does not shut it again
        // (a stock window answers a held Cancel every few frames).
        Window_FightMenu.prototype.isCancelTriggered = function() {
            return Input.isTriggered("cancel");
        };
        Window_FightMenu.prototype.makeCommandList = function() {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null, page = this._page, t = F.term;
            this._head = EMPTY;
            if (!fight || !fight.isTactical()) return;
            const team = fight._turns === "team", pending = fight.unactedCount();
            if (page === "main") {
                this.addCommand(t("menuResume"), "resume");
                if (team && pending > 0) this.addCommand(t("endTurn"), "endTurn");
                if (fight.canAuto()) this.addCommand(t("auto"), "auto");
                this.addCommand(t("menuUnits"), "units");
                // What every enemy reaches next turn, for a player with no key for it (a gamepad has none).
                this.addCommand(t(fight.showsThreat() ? "menuThreatHide" : "menuThreatShow"), "threat");
                this.addCommand(t("menuGoal"), "goal");
                this.addCommand(t("menuControls"), "controls");
                this.addCommand(t("menuOptions"), "options");
                if (fight.canRetreat()) this.addCommand(t("menuRetreat"), "retreat");
                this.addCommand(TextManager.gameEnd, "gameEnd");
            } else if (page === "units") {
                this._head = [t("menuUnits")];
                for (const row of fight.turnOrder()) {
                    if (row.defeated) continue;
                    const unit = fight.unit(row.unitId), battler = fight.battler(unit);
                    if (!battler) continue;
                    const state = fight.isOnOverwatch(unit) ? t("unitWatch") : row.acted ? t("unitDone") : "";
                    this.addCommand(battler.name(), "unit", true, { unitId: unit.id, team: unit.team, right: (state ? state + "   " : "") + TextManager.hpA + " " + battler.hp + "/" + battler.mhp });
                }
            } else if (page === "goal") {
                this._head = [t("menuGoal")];
                const full = fight.goalText(), now = fight.objectiveText();
                this.addCommand(full, "back");
                if (now && now !== full) this.addCommand(now, "back");
                if (fight.turn() > 0) this.addCommand(t("goalTurn").replace("%1", fight.turn()), "back");
                this.addCommand(t("goalLose"), "back");
            } else if (page === "controls") {
                this._head = [t("menuControls")];
                for (const row of W.controlRows()) this.addCommand(row.name, "back", true, { right: row.keys });
            } else if (page === "options") {
                this._head = [t("menuOptions")];
                const pace = F.pace();
                this.addCommand(t("menuPace"), "pace", true, { right: t(pace === "skip" ? "paceSkip" : pace === "fast" ? "paceFast" : "paceNormal") });
                this.addCommand(t("menuHints"), "hints", true, { right: t(Hints.enabled() ? "on" : "off") });
                this.addCommand(t("menuGameOptions"), "gameOptions");
                this.addCommand(t("menuBack"), "back");
            } else if (page === "endTurn") {
                this._head = t(pending === 1 ? "endTurnAskOne" : "endTurnAsk").replace("%1", pending).split("\n");
                this.addCommand(t("endTurnNo"), "back");
                this.addCommand(t("endTurnYes"), "confirm");
            } else if (page === "retreat") {
                this._head = t("retreatAsk").split("\n");
                this.addCommand(t("retreatNo"), "back");
                this.addCommand(t("retreatYes"), "confirm");
            } else if (page === "auto") {
                this._head = t("autoAsk").split("\n");
                this.addCommand(t("autoNo"), "back");
                this.addCommand(t("autoYes"), "confirm");
            } else if (page === "fall") {
                const ask = fight._tac && fight._tac.fallAsk, battler = ask ? fight.battler(fight.unit(ask.unitId)) : null;
                this._head = t("fallAsk").replace("%1", battler ? battler.name() : "").split("\n");
                this.addCommand(t("fallNo"), "back");
                this.addCommand(t("fallYes"), "confirm");
            }
        };
        // The cursor's row is kept in view with the lines over the rows counted in; the first row shows them too.
        Window_FightMenu.prototype.ensureCursorVisible = function(smooth) {
            const row = this.row();
            if (!(this.innerHeight > 0) || row < 0) return;
            const head = this.headHeight(), top = row === 0 ? 0 : head + row * this.itemHeight(), bottom = head + (row + 1) * this.itemHeight();
            const scrollY = this.scrollY();
            const to = scrollY > top ? top : scrollY < bottom - this.innerHeight ? bottom - this.innerHeight : -1;
            if (to < 0) return;
            if (smooth) this.smoothScrollTo(0, to); else this.scrollTo(0, to);
        };
        Window_FightMenu.prototype.drawAllItems = function() {
            // Every row (a page has few): the lines over them shift which rows are in view.
            for (let i = 0; i < this.maxItems(); i++) { this.drawItemBackground(i); this.drawItem(i); }
            const lines = this._head, top = -this.scrollBaseY();
            this.resetFontSettings();
            this.changePaintOpacity(true);
            this.changeTextColor(ColorManager.systemColor());
            for (let i = 0; i < lines.length; i++) this.drawText(lines[i], 4, top + i * this.lineHeight(), this.innerWidth - 8, "center");
            this.resetTextColor();
        };
        Window_FightMenu.prototype.drawItem = function(index) {
            const rect = this.itemLineRect(index), ext = this._list[index].ext;
            const right = ext && ext.right ? String(ext.right) : "";
            this.resetTextColor();
            this.changePaintOpacity(this.isCommandEnabled(index));
            const rightWidth = right ? Math.min(Math.floor(rect.width * 0.6), this.textWidth(right) + 8) : 0;
            if (ext && ext.team) this.changeTextColor(ext.team === "enemy" ? ColorManager.deathColor() : ColorManager.normalColor());
            this.drawText(this.commandName(index), rect.x, rect.y, rect.width - rightWidth - (right ? 8 : 0), right ? "left" : this.itemTextAlign());
            if (right) {
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(right, rect.x + rect.width - rightWidth, rect.y, rightWidth, "right");
            }
            this.resetTextColor();
        };
        // Left and Right change a setting where the cursor is on one.
        Window_FightMenu.prototype.cursorRight = function() { W.changeOption(this, 1); };
        Window_FightMenu.prototype.cursorLeft = function() { W.changeOption(this, -1); };
        root.Window_FightMenu = Window_FightMenu;

        /** The Controls page: what each control does and the keys or buttons that do it now, for the device used last. */
        W.controlRows = function() {
            const t = F.term, pad = Controls.device === "pad", name = Controls.name, rows = [];
            const add = (term, keys) => { if (keys) rows.push({ name: t(term), keys }); };
            const both = (a, b) => (a && b ? a + " / " + b : a || b);
            add("ctlCursor", t(pad ? "keyPad" : "keyArrows"));
            add("ctlOk", pad ? name("ok") : both(name("ok"), t("keyClick")));
            add("ctlCancel", pad ? name("cancel") : both(name("cancel"), t("keyRightClick")));
            add("ctlNext", name("skip"));
            add("ctlFace", both(name("left"), name("right")));
            if (View.active()) {
                add("ctlView", both(name("viewLeft"), name("viewRight")));
                if (!pad) add("ctlZoom", t("keyWheel"));
                add("ctlLevel", name("level"));
            }
            add("ctlUnit", name("unit"));
            add("ctlThreat", name("threat"));
            if (name("skip")) add("ctlHurry", t("keyHold").replace("%1", name("skip")));
            return rows;
        };

        W.menu = function(scene) {
            scene = scene || (typeof SceneManager !== "undefined" ? SceneManager._scene : null);
            return scene && scene._fightMenuWindow ? scene._fightMenuWindow : null;
        };

        /** Whether the battle menu is up on the scene that is running (the battle waits behind it). */
        W.isMenuOpen = function() {
            const win = W.menu();
            return !!win && !!win._fightOpen;
        };

        /**
         * The window fitted to its page: centered, as tall as its rows as far as the screen allows (then it scrolls).
         * It keeps a margin to the screen's edges unless the margin would cost a row: on a 480 pixel screen the menu's
         * ten rows (with Retreat) are all on the screen, none under a scroll arrow.
         */
        W.fitMenu = function(scene, win) {
            win.clearCommandList();
            win.makeCommandList();
            const page = win._page, rows = Math.max(1, win.maxItems());
            const width = Math.min(Graphics.boxWidth - 16, page === "main" ? 320 : QUESTIONS.includes(page) ? 460 : 560);
            const row = win.itemHeight(), frame = win.padding * 2 + win.headHeight();
            const room = margin => Math.max(1, Math.floor((Graphics.boxHeight - margin - frame) / row));
            const fitting = rows <= room(16) ? rows : room(0);
            const height = Math.min(rows, fitting) * row + frame;
            win.move(Math.round((Graphics.boxWidth - width) / 2), Math.round((Graphics.boxHeight - height) / 2), width, height);
            win.createContents();
            win.refresh();
        };

        /** Show a page of the battle menu (opening it if it is shut). `root` is the page Cancel shuts it from. */
        W.openMenu = function(scene, page, from) {
            if (!scene || !scene.addWindow) return false;
            let win = scene._fightMenuWindow;
            if (!win) {
                win = scene._fightMenuWindow = new Window_FightMenu(new Rectangle(0, 0, 320, scene.calcWindowHeight(4, true)));
                const go = name => () => W.menuPage(scene, name);
                const back = () => W.menuBack(scene);
                win.setHandler("resume", () => W.closeMenu(scene));
                win.setHandler("endTurn", () => { if ($gameFight.unactedCount() > 0) W.menuPage(scene, "endTurn"); else W.menuDo(scene, () => $gameFight.commandEndTurn()); });
                for (const name of ["auto", "units", "goal", "controls", "options", "retreat"]) win.setHandler(name, go(name));
                // Another scene takes the screen over a picture of this one: the menu is gone from it at once, not half shut.
                win.setHandler("gameEnd", () => { W.closeMenu(scene, true); if (typeof Scene_GameEnd !== "undefined") SceneManager.push(Scene_GameEnd); });
                win.setHandler("gameOptions", () => { W.closeMenu(scene, true); if (typeof Scene_Options !== "undefined") SceneManager.push(Scene_Options); });
                win.setHandler("unit", () => { const ext = win.currentExt(); W.menuDo(scene, () => $gameFight.commandLookAt(ext ? ext.unitId : 0)); });
                // Shown or hidden, the menu shuts: the map is what the player asked to see.
                win.setHandler("threat", () => W.menuDo(scene, () => { $gameFight.toggleThreat(); }));
                win.setHandler("pace", () => { W.changeOption(win, 1); win.activate(); });
                win.setHandler("hints", () => { W.changeOption(win, 1); win.activate(); });
                win.setHandler("confirm", () => {
                    const page = win._page;
                    W.menuDo(scene, () => (page === "retreat" ? $gameFight.commandRetreat() : page === "auto" ? $gameFight.commandAuto()
                        : page === "fall" ? $gameFight.commandFallAnswer(true) : $gameFight.commandEndTurn()));
                });
                win.setHandler("back", back);
                win.setHandler("cancel", back);
                win.hide();
                scene.addWindow(win);
            }
            if (!win._fightOpen) { win._root = page; win._from = from || ""; sound("playOk"); }
            win._page = page;
            W.fitMenu(scene, win);
            // A question starts on the answer that changes nothing.
            win.select(0);
            win._fightOpen = true;
            win.show();
            win.open();
            win.activate();
            In.used();
            return true;
        };

        W.menuPage = function(scene, page) {
            W.openMenu(scene, page);
        };

        /** One step back in the menu: from a page to the menu, from the menu (or a question asked from a unit's menu) out of it. */
        W.menuBack = function(scene) {
            const win = scene._fightMenuWindow;
            if (!win) return;
            // No to a fatal fall: the unit stays where it is, its move still to make.
            if (win._page === "fall") $gameFight.commandFallAnswer(false);
            if (win._page === win._root) { W.closeMenu(scene); return; }
            // From a question back to where it was asked; from the game options' row and the like back to the menu.
            const to = win._root, at = win._page;
            win._page = to;
            W.fitMenu(scene, win);
            const index = win.findSymbol(at === "endTurn" ? "endTurn" : at);
            win.select(index >= 0 ? index : 0);
            win.activate();
        };

        /** Shut the battle menu; `atOnce` takes it off the screen this frame (it closes over a few otherwise). */
        W.closeMenu = function(scene, atOnce) {
            const win = scene && scene._fightMenuWindow;
            if (!win || !win._fightOpen) return;
            win._fightOpen = false;
            win.deactivate();
            win.close();
            if (atOnce) { win.openness = 0; win.hide(); }
            // The press that shut it is the menu's: the battle does not read it again as OK or Cancel.
            In.used();
            In._ate = frameNow();
        };

        /** Shut the menu and do what was chosen. */
        W.menuDo = function(scene, command) {
            W.closeMenu(scene);
            const done = command();
            // `In.used` is the menu's own press; the command's sound says whether it took.
            if (done === false) sound("playBuzzer");
        };

        /** The setting under the cursor to its next (or last) value. */
        W.changeOption = function(win, step) {
            const symbol = win.currentSymbol();
            if (symbol === "pace") {
                const at = F.PACES.indexOf(F.pace());
                F.setPace(F.PACES[(at + step + F.PACES.length) % F.PACES.length]);
            } else if (symbol === "hints") {
                if (typeof ConfigManager === "undefined" || !ConfigManager) return;
                ConfigManager.rrFightHints = !Hints.enabled();
                if (ConfigManager.save) ConfigManager.save();
                // Turned on again: every tip is due its times anew (the way to be taught once more).
                if (ConfigManager.rrFightHints) Hints.reset();
                const fight = $gameFight;
                if (fight._tac && fight._tac.hint) { fight._tac.hint.state = ""; fight.touch(); }
            } else {
                return;
            }
            sound("playCursor");
            const index = win.index();
            win.refresh();
            win.select(index);
        };

        /** End Turn chosen from a unit's menu: asked first when other units would lose their turn. */
        W.askEndTurn = function(scene) {
            const fight = $gameFight;
            if (fight.unactedCount() > 0) W.openMenu(scene, "endTurn", "command");
            else if (!fight.commandEndTurn() && scene._fightCommandWindow) scene._fightCommandWindow.activate();
        };

        /** A way that ends in a fatal fall was chosen (Lethal jumps: Ask first): the question, Stay first. */
        W.askFall = function(scene) {
            if (scene) W.openMenu(scene, "fall", "move");
        };

        /** Whether Cancel with nothing to step back from opens the battle menu now. */
        W.canOpenMenu = function() {
            const fight = $gameFight;
            if (W.isMenuOpen() || !fight.isTactical() || !fight.isHere() || !fight.awaitsPlayer()) return false;
            const act = fight._act;
            return act.stage === "pick" || (act.stage === "move" && !(fight._turns === "team" && !act.moved));
        };

        /** Each frame: the menu shuts itself when the battle no longer waits for the player (it ended, an event took over), and Cancel opens it. */
        W.updateMenu = function(scene) {
            const fight = $gameFight, win = scene._fightMenuWindow;
            if (win && win._fightOpen && !(fight.isTactical() && fight.isHere() && fight.awaitsPlayer())) { win._fightOpen = false; win.deactivate(); win.close(); }
            if (In._ate === frameNow() || !W.canOpenMenu()) return;
            if (Input.isTriggered("cancel") || (typeof TouchInput !== "undefined" && TouchInput.isCancelled())) { In._ate = frameNow(); W.openMenu(scene, "main"); }
        };
    }

    /** Whether this frame's menu key belongs to the battle: Cancel just stepped back, or there is something to step back from. */
    F.menuBlocked = function() {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!fight || !fight.isTactical() || !fight.isHere()) return false;
        if (In._ate === frameNow()) return true;
        const state = fight.tacticalState();
        return state !== "unit" && state !== "move" && state !== "idle";
    };

    if (typeof Scene_Map !== "undefined") {
        // Cancel steps back in the battle; the menu opens only where there is nothing to step back from.
        // A camera that holds the mouse gives it back on Escape and calls the menu itself: in a battle that press is
        // Cancel, and where there is nothing to step back from it opens the battle menu. The game's pause menu
        // (Save, Formation, Equip) never opens in a Tactical battle.
        const callMenu = Scene_Map.prototype.callMenu;
        Scene_Map.prototype.callMenu = function() {
            const fight = $gameFight;
            if (fight.isTactical() && fight.isHere()) {
                const taken = In._ate === frameNow() || fight.commandCancel() || F.menuBlocked();
                In._ate = frameNow();
                this.menuCalling = false;
                if (!taken && W.canOpenMenu && W.canOpenMenu()) W.openMenu(this, "main");
                return;
            }
            callMenu.call(this);
        };
        const isMenuCalled = Scene_Map.prototype.isMenuCalled;
        Scene_Map.prototype.isMenuCalled = function() {
            return !F.menuBlocked() && isMenuCalled.call(this);
        };
    }
})(globalThis);
