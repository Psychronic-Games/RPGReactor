/*:
 * @target MZ
 * @plugindesc Variable Quests by Molegato (VX Ace), for imported games
 * @author Molegato; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MolegatoQuests.js
 *
 * A journal of entries by category: the category's name at the top left
 * with the next and previous categories' icons (Left and Right turn them),
 * the entries of it whose switch is on beneath, and the chosen entry on the
 * right: its title, its picture from img/system and its text. Confirm or
 * cancel closes it. (This game uses it as its Guide.)
 *
 * Script call: SceneManager.push(Scene_RRMolegatoQuests).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param quests
 * @text Entries
 * @desc JSON: [[title, switch, category icon, picture, description, text, …tasks], …]
 * @default []
 *
 * @param categories
 * @text Categories
 * @desc JSON: the category icons in order.
 * @default []
 *
 * @param categoryNames
 * @text Category names
 * @desc JSON: { icon: name }.
 * @default {}
 *
 * @param solvedColor
 * @text Done entry colour
 * @type number
 * @default 3
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_MolegatoQuests');
    const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
    const QUESTS = json(P.quests, []);
    const CATEGORIES = json(P.categories, []);
    const NAMES = json(P.categoryNames, {});
    const DONE_COLOR = Number(P.solvedColor) || 3;
    const key = (t) => (window.RRKeyedText ? RRKeyedText.resolve(t) : t);

    /** A task is a switch, or [variable, at least]. */
    const taskDone = (task) => (Array.isArray(task) ? $gameVariables.value(task[0]) >= task[1] : $gameSwitches.value(task));
    const questDone = (quest) => quest.slice(6).every(t => taskDone(Array.isArray(t) ? t[0] : t));

    class Window_RRMolegatoQuestCategory extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._category = CATEGORIES[0];
            this.refresh();
        }
        setCategory(c) { this._category = c; this.refresh(); }
        refresh() {
            this.contents.clear();
            const i = CATEGORIES.indexOf(this._category), n = CATEGORIES.length;
            const prev = CATEGORIES[(i - 1 + n) % n], next = CATEGORIES[(i + 1) % n];
            const lh = this.lineHeight(), w = this.innerWidth;
            this.contents.drawText(key(NAMES[this._category] || ''), 0, 0, w, lh, 'center');
            this.drawIcon(prev, 10, 0);
            this.drawIcon(next, w - 32, 0);
            this.contents.drawText('<', 0, 0, w, lh, 'left');
            this.contents.drawText('>', 0, 0, w, lh, 'right');
        }
    }

    class Window_RRMolegatoQuestList extends Window_Selectable {
        initialize(rect) {
            this._category = CATEGORIES[0];
            this._data = [];
            super.initialize(rect);
            this.refresh();
            if (this.maxItems() > 0) this.select(0);
        }
        setCategory(c) { this._category = c; this.refresh(); }
        maxCols() { return 1; }
        maxItems() { return this._data ? this._data.length : 1; }
        item() { return this._data && this.index() >= 0 ? this._data[this.index()] : null; }
        makeItemList() { this._data = QUESTS.filter(q => $gameSwitches.value(q[1]) && q[2] === this._category); }
        refresh() {
            this.makeItemList();
            super.refresh();
        }
        drawItem(index) {
            const quest = this._data[index];
            if (!quest) return;
            const rect = this.itemRect(index);
            rect.width -= 34;
            rect.x += 24;
            const done = questDone(quest);
            this.drawIcon(quest[2], 0, rect.y, done);
            if (done && quest[4] !== 'HIDDEN') this.changeTextColor(ColorManager.textColor(DONE_COLOR));
            this.contents.drawText(key(quest[0]), rect.x, rect.y, rect.width, rect.height, 'left');
            this.resetTextColor();
        }
        updateHelp() {}
        processHandling() {
            super.processHandling();
            if (!this.isOpenAndActive()) return;
            if (this.isHandled('left') && Input.isTriggered('left')) this.callHandler('left');
            else if (this.isHandled('right') && Input.isTriggered('right')) this.callHandler('right');
        }
        cursorLeft() {}
        cursorRight() {}
    }

    class Window_RRMolegatoQuestStatus extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._index = 0;
            this._list = null;
        }
        setList(list) { this._list = list; this.refresh(); }
        refresh() {
            this.contents.clear();
            const quest = this._list && this._list.item();
            if (!quest) return;
            const lh = this.lineHeight();
            this.changeTextColor(ColorManager.systemColor());
            this.contents.drawText(key(quest[0]), 0, 0, this.innerWidth, lh, 'center');
            let gap = 48;
            if (quest[3]) {
                const rect = this.rrPinnacleDrawSystem ? this.rrPinnacleDrawSystem(quest[3], this.innerWidth / 2, 48, 0.5, 0) : null;
                if (rect) gap = rect[3];
            }
            this.resetTextColor();
            const text = String(quest[5] || '').replace(/\r/g, '').split('\n').map(line => key(line) + '\n').join('');
            this.drawTextEx(text, 0, gap);
        }
        update() {
            super.update();
            if (this._list && this._index !== this._list.index()) {
                this._index = this._list.index();
                this.refresh();
            }
        }
    }

    class Scene_RRMolegatoQuests extends Scene_MenuBase {
        create() {
            super.create();
            const third = Math.floor(Graphics.boxWidth / 3);
            this._infoWindow = new Window_RRMolegatoQuestStatus(new Rectangle(third, 0, Math.floor(Graphics.boxWidth * 2 / 3), Graphics.boxHeight));
            this.addWindow(this._infoWindow);
            this._catWindow = new Window_RRMolegatoQuestCategory(new Rectangle(0, 0, third, 50));
            this.addWindow(this._catWindow);
            this._itemWindow = new Window_RRMolegatoQuestList(new Rectangle(0, 50, third, Graphics.boxHeight - 50));
            this._itemWindow.setHandler('cancel', this.popScene.bind(this));
            this._itemWindow.setHandler('ok', this.popScene.bind(this));
            this._itemWindow.setHandler('left', () => this.changeCategory(-1));
            this._itemWindow.setHandler('right', () => this.changeCategory(1));
            this._itemWindow.activate();
            this.addWindow(this._itemWindow);
            this._infoWindow.setList(this._itemWindow);
            // The images the entries show, so their text sits under them from the first frame.
            for (const q of QUESTS) if (q[3]) ImageManager.loadSystem(q[3]);
        }
        helpAreaHeight() { return 0; }
        needsCancelButton() { return false; }
        changeCategory(step) {
            const i = CATEGORIES.indexOf(this._itemWindow._category);
            const next = CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length];
            this._itemWindow.setCategory(next);
            this._catWindow.setCategory(next);
            this._itemWindow.activate();
            this._itemWindow.select(0);
            this._infoWindow.refresh();
        }
    }
    window.Scene_RRMolegatoQuests = Scene_RRMolegatoQuests;
})();
