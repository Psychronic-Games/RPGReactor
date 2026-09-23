/*:
 * @target MZ
 * @plugindesc Quest Journal (VX Ace), for imported games
 * @author modern algebra; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_QuestJournal.js
 *
 * A quest journal with objectives, set up in the Quests parameter (read from
 * the game's QuestData.setup_quest by the importer). Progress is kept on
 * $gameParty, so a save keeps it.
 *
 * Script calls:
 *   const q = $gameParty.rrQuest(id)   the quest; the first call creates it
 *                                      (and reveals it unless Manual reveal)
 *   q.revealObjective(0, 1)   q.concealObjective(...)
 *   q.completeObjective(...)  q.uncompleteObjective(...)
 *   q.failObjective(...)      q.unfailObjective(...)
 *   q.reveal()   q.conceal()
 *   q.isComplete()   q.isFailed()   q.isActive()
 *   q.name, q.description, q.client, q.location, q.iconIndex, q.level,
 *   q.objectives[i]  (all assignable)
 *   q.completeManually()   q.failManually()   q.activateManually()
 *   q.distributeRewards()  gives the rewards once; true when it did
 *   $gameParty.rrQuestRevealed(id)     without creating it
 *   $gameParty.rrQuestIs(id, "complete" | "failed" | "active")
 *                                      without creating it
 *   $gameParty.rrCallQuestJournal(id)  opens the journal (on that quest)
 *
 * Status rules are the original's: a quest is complete when every prime
 * objective is complete and none failed, failed when any prime objective
 * failed; with no prime objectives it follows the manual status. Finishing a
 * quest runs its common event.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * @param quests
 * @text Quests
 * @type multiline_string
 * @default []
 * @desc JSON array: {id, name, level, iconIndex, description, objectives[], primeObjectives[], banner, client, location, rewards[], commonEventId, priority, customCategories[]}.
 *
 * @param menuName
 * @text Menu command
 * @default Quests
 *
 * @param menuIndex
 * @text Menu position
 * @type number
 * @default 4
 *
 * @param menuAccess
 * @text Show in menu
 * @type boolean
 * @default true
 *
 * @param sceneLabel
 * @text Scene label
 * @default Quest Journal
 *
 * @param manualReveal
 * @text Manual reveal
 * @type boolean
 * @default false
 * @desc Off: a quest appears in the journal as soon as the game first touches it.
 *
 * @param openToLastRevealed
 * @type boolean
 * @default true
 *
 * @param openToLastChanged
 * @type boolean
 * @default true
 *
 * @param listWidth
 * @text List width
 * @type number
 * @default 192
 *
 * @param basicDataWidth
 * @type number
 * @default 240
 *
 * @param categories
 * @default ["all","active","complete","failed"]
 *
 * @param categoryLabels
 * @default {"all":"All Quests","active":"Active Quests","complete":"Complete Quests","failed":"Failed Quests"}
 *
 * @param sortTypes
 * @desc Per category: id, alphabet, level, reveal, change, complete, failed (add _r to reverse).
 * @default {"all":"id","active":"change","complete":"complete","failed":"failed"}
 *
 * @param icons
 * @default {"all":226,"active":236,"complete":238,"failed":227,"client":121,"location":231,"reward_gold":262,"reward_exp":117}
 *
 * @param vocab
 * @type multiline_string
 * @default {"description":"Description","objectives":"Objectives","objective_bullet":"♦","rewards":"Rewards","reward_amount":"x%d","reward_gold":"","reward_exp":"","level":"Rank: ","location":"","client":""}
 *
 * @param levelIcon
 * @desc An icon drawn once per level, 0 for text signals, or a JSON array (one icon per level).
 * @default 125
 *
 * @param levelIconSpace
 * @type number
 * @default 16
 *
 * @param levelSignals
 * @default ["F","E","D","C","B","A","S"]
 *
 * @param failedColor
 * @text Failed text colour
 * @type number
 * @default 10
 *
 * @param descriptionInBox
 * @type boolean
 * @default true
 *
 * @param objectiveIcons
 * @desc JSON {failed, complete, active}: status icons for objectives. Empty draws the numbered bullet instead.
 * @default {}
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_QuestJournal');
    const json = (text, fallback) => {
        try {
            let value = JSON.parse(text);
            if (typeof value === 'string') value = JSON.parse(value);
            return value === undefined || value === null ? fallback : value;
        } catch (_) { return fallback; }
    };
    const QUESTS = new Map(json(params.quests || '[]', []).filter(q => q && q.id !== undefined).map(q => [Number(q.id), q]));
    const MENU_NAME = params.menuName || 'Quests';
    const MENU_INDEX = Number(params.menuIndex || 4);
    const MENU_ACCESS = params.menuAccess !== 'false';
    const SCENE_LABEL = params.sceneLabel === undefined ? 'Quest Journal' : params.sceneLabel;
    const MANUAL_REVEAL = params.manualReveal === 'true';
    const OPEN_TO_REVEALED = params.openToLastRevealed !== 'false';
    const OPEN_TO_CHANGED = params.openToLastChanged !== 'false';
    const LIST_WIDTH = Number(params.listWidth || 192);
    const BASIC_WIDTH = Number(params.basicDataWidth || 240);
    const CATEGORIES = (() => { const c = json(params.categories, null); return Array.isArray(c) && c.length ? c : ['all']; })();
    const CATEGORY_LABELS = json(params.categoryLabels, {});
    const SORT_TYPES = json(params.sortTypes, {});
    const ICONS = json(params.icons, {});
    const VOCAB = json(params.vocab, {});
    const LEVEL_ICON = json(params.levelIcon || '125', 125);
    const LEVEL_SPACE = Number(params.levelIconSpace || 16);
    const LEVEL_SIGNALS = json(params.levelSignals, []);
    const FAILED_COLOR = Number(params.failedColor || 10);
    const DESCRIPTION_IN_BOX = params.descriptionInBox !== 'false';
    const OBJECTIVE_ICONS = json(params.objectiveIcons, {});
    const vocab = key => (VOCAB[key] === undefined ? '' : String(VOCAB[key]));

    // Sorted insert that lands before the first equal element, as the original's binary search did.
    const insertSorted = (array, value, compare = (a, b) => a - b) => {
        let lo = 0, hi = array.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (compare(value, array[mid]) > 0) lo = mid + 1; else hi = mid;
        }
        array.splice(lo, 0, value);
    };
    const ids = args => args.flat(Infinity).map(Number).filter(n => Number.isInteger(n) && n >= 0);
    const intersects = (a, b) => a.some(x => b.includes(x));
    const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

    //-------------------------------------------------------------------------
    // Game_RRQuest

    function Game_RRQuest() { this.initialize(...arguments); }
    window.Game_RRQuest = Game_RRQuest;

    Game_RRQuest.prototype.initialize = function(id) {
        this._id = id;
        this._concealed = MANUAL_REVEAL;
        this._rewardGiven = false;
        this.reset();
    };

    Game_RRQuest.prototype.reset = function() {
        const data = QUESTS.get(this._id) || {};
        const pick = (key, fallback) => (data[key] !== undefined && data[key] !== null && data[key] !== false ? copy(data[key]) : fallback);
        this._name = String(pick('name', '??????'));
        this._level = Number(pick('level', 0)) || 0;
        this.objectives = (pick('objectives', []) || []).map(o => (o == null ? '' : String(o)));
        this._primeObjectives = pick('primeObjectives', this.objectives.map((_, i) => i));
        this.customCategories = pick('customCategories', []);
        this.iconIndex = Number(pick('iconIndex', 0)) || 0;
        this.description = String(pick('description', ''));
        this.banner = String(pick('banner', ''));
        this.bannerHue = Number(pick('bannerHue', 0)) || 0;
        this.commonEventId = Number(pick('commonEventId', 0)) || 0;
        this.rewards = pick('rewards', []);
        this.client = String(pick('client', ''));
        this.location = String(pick('location', ''));
        this.priority = Number(pick('priority', 50));
        this._revealedObjectives = [];
        this._completeObjectives = [];
        this._failedObjectives = [];
        this._manualStatus = 'active';
    };

    Object.defineProperties(Game_RRQuest.prototype, {
        id: { get() { return this._id; }, configurable: true },
        name: {
            get() { return this._name; },
            set(value) { this._name = String(value); $gameParty.rrQuests().addToSort('alphabet', this._id); },
            configurable: true
        },
        level: {
            get() { return this._level; },
            set(value) { this._level = Number(value) || 0; $gameParty.rrQuests().addToSort('level', this._id); },
            configurable: true
        },
        primeObjectives: { get() { return this._primeObjectives; }, configurable: true },
        revealedObjectives: { get() { return this._revealedObjectives; }, configurable: true }
    });

    Game_RRQuest.prototype.revealObjective = function(...args) {
        const valid = ids(args).filter(x => x < this.objectives.length && !this._revealedObjectives.includes(x));
        valid.forEach(x => { if (!this._revealedObjectives.includes(x)) insertSorted(this._revealedObjectives, x); });
        if (valid.length) this.statusChanged();
    };

    Game_RRQuest.prototype.concealObjective = function(...args) {
        const list = ids(args);
        if (intersects(list, this._revealedObjectives)) this.statusChanged();
        this._revealedObjectives = this._revealedObjectives.filter(x => !list.includes(x));
    };

    Game_RRQuest.prototype.completeObjective = function(...args) {
        const valid = ids(args).filter(x => x < this.objectives.length && !this._completeObjectives.includes(x));
        this.revealObjective(valid);
        this.unfailObjective(valid);
        const wasComplete = this.isStatus('complete');
        valid.forEach(x => { if (!this._completeObjectives.includes(x)) insertSorted(this._completeObjectives, x); });
        if (valid.length) this.statusChanged();
        if (this.isStatus('complete') && !wasComplete) {
            if (this.commonEventId > 0) $gameTemp.reserveCommonEvent(this.commonEventId);
            $gameParty.rrQuests().addToSort('complete', this._id);
        }
    };

    Game_RRQuest.prototype.uncompleteObjective = function(...args) {
        const list = ids(args);
        if (intersects(list, this._completeObjectives)) this.statusChanged();
        this._completeObjectives = this._completeObjectives.filter(x => !list.includes(x));
    };

    Game_RRQuest.prototype.failObjective = function(...args) {
        const valid = ids(args).filter(x => x < this.objectives.length && !this._failedObjectives.includes(x));
        this.revealObjective(valid);
        this.uncompleteObjective(valid);
        const wasFailed = this.isStatus('failed');
        valid.forEach(x => { if (!this._failedObjectives.includes(x)) insertSorted(this._failedObjectives, x); });
        if (valid.length) this.statusChanged();
        if (this.isStatus('failed') && !wasFailed) $gameParty.rrQuests().addToSort('failed', this._id);
    };

    Game_RRQuest.prototype.unfailObjective = function(...args) {
        const list = ids(args);
        if (intersects(list, this._failedObjectives)) this.statusChanged();
        this._failedObjectives = this._failedObjectives.filter(x => !list.includes(x));
    };

    Game_RRQuest.prototype.statusChanged = function() {
        const quests = $gameParty.rrQuests();
        quests.addToSort('change', this._id);
        if (OPEN_TO_CHANGED) quests._lastQuestId = this._id;
    };

    Game_RRQuest.prototype.reveal = function() { this._concealed = false; };
    Game_RRQuest.prototype.conceal = function() { this._concealed = true; };
    Game_RRQuest.prototype.isConcealed = function() { return !!this._concealed; };

    Game_RRQuest.prototype.completeManually = function() { this._primeObjectives = []; this._manualStatus = 'complete'; };
    Game_RRQuest.prototype.failManually = function() { this._primeObjectives = []; this._manualStatus = 'failed'; };
    Game_RRQuest.prototype.activateManually = function() { this._manualStatus = 'active'; };

    /** One objective (or all given) in a status: failed / complete / revealed / active. */
    Game_RRQuest.prototype.objectiveStatus = function(status, ...args) {
        const list = ids(args);
        if (!list.length) return false;
        const all = within => list.every(x => within.includes(x));
        switch (status) {
            case 'failed': return intersects(list, this._failedObjectives);
            case 'complete': return all(this._completeObjectives);
            case 'revealed': return all(this._revealedObjectives);
            case 'active': return all(this._revealedObjectives) && !all(this._completeObjectives) && !intersects(list, this._failedObjectives);
        }
        return false;
    };

    Game_RRQuest.prototype.isStatus = function(status) {
        const prime = this._primeObjectives;
        switch (status) {
            case 'failed':
                return prime.length ? intersects(this._failedObjectives, prime) : this._manualStatus === 'failed';
            case 'complete': {
                if (!prime.length) return this._manualStatus === 'complete';
                // Ruby's (prime & complete) == prime: every prime objective done, in prime's order, no duplicates.
                const done = [...new Set(prime.filter(x => this._completeObjectives.includes(x)))];
                return !this.isStatus('failed') && done.length === prime.length && done.every((x, i) => x === prime[i]);
            }
            case 'active': return !this._concealed && !this.isStatus('complete') && !this.isStatus('failed');
            case 'reward': return !!this._rewardGiven;
        }
        return false;
    };

    Game_RRQuest.prototype.isComplete = function() { return this.isStatus('complete'); };
    Game_RRQuest.prototype.isFailed = function() { return this.isStatus('failed'); };
    Game_RRQuest.prototype.isActive = function() { return this.isStatus('active'); };

    Game_RRQuest.prototype.distributeRewards = function() {
        if (this._concealed || this._rewardGiven) return false;
        this._rewardGiven = true;
        for (const reward of this.rewards || []) {
            const [type, a, b] = reward || [];
            const amount = b === undefined || b === null ? 1 : Number(b);
            switch (type) {
                case 'item': case 0: $gameParty.gainItem($dataItems[a], amount); break;
                case 'weapon': case 1: $gameParty.gainItem($dataWeapons[a], amount); break;
                case 'armor': case 2: $gameParty.gainItem($dataArmors[a], amount); break;
                case 'gold': case 3: $gameParty.gainGold(Number(a) || 0); break;
                case 'exp': case 4:
                    for (const actor of $gameParty.members()) actor.changeExp(actor.currentExp() + (Number(a) || 0), true);
                    break;
            }
        }
        return true;
    };

    //-------------------------------------------------------------------------
    // Game_RRQuests: the quests the game has touched, with the orders the
    // journal sorts by kept up to date as things change.

    function Game_RRQuests() { this.initialize(...arguments); }
    window.Game_RRQuests = Game_RRQuests;

    Game_RRQuests.prototype.initialize = function() {
        this._data = {};
        this._sort = { reveal: [], change: [], complete: [], failed: [], id: [], alphabet: [], level: [] };
        this._lastQuestId = 0;
        this._lastCategory = CATEGORIES[0];
        this._disabled = false;
    };

    Game_RRQuests.prototype.get = function(id) {
        id = Number(id);
        if (!Number.isFinite(id)) return null;
        if (!this._data[id]) this.resetQuest(id);
        return this._data[id];
    };

    Game_RRQuests.prototype.setupQuest = function(id) {
        if (this._data[id]) return;
        this._data[id] = new Game_RRQuest(id);
        if (OPEN_TO_REVEALED) this._lastQuestId = id;
        for (const type of Object.keys(this._sort)) this.addToSort(type, id);
    };

    Game_RRQuests.prototype.deleteQuest = function(id) {
        delete this._data[id];
        for (const type of Object.keys(this._sort)) this._sort[type] = this._sort[type].filter(x => x !== id);
    };

    Game_RRQuests.prototype.resetQuest = function(id) {
        this.deleteQuest(id);
        this.setupQuest(id);
    };

    Game_RRQuests.prototype.addToSort = function(type, id) {
        const list = (this._sort[type] || (this._sort[type] = [])).filter(x => x !== id);
        this._sort[type] = list;
        switch (type) {
            case 'reveal': case 'change': case 'complete': case 'failed':
                list.unshift(id);
                break;
            case 'id':
                insertSorted(list, id);
                break;
            case 'alphabet': {
                const name = x => String(this._data[x] ? this._data[x].name : '').toLowerCase();
                insertSorted(list, id, (a, b) => (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0));
                break;
            }
            case 'level': {
                const level = x => (this._data[x] ? this._data[x].level : 0);
                insertSorted(list, id, (a, b) => level(a) - level(b));
                break;
            }
        }
    };

    Game_RRQuests.prototype.isRevealed = function(id) {
        const quest = this._data[Number(id)];
        return !!quest && !quest._concealed;
    };

    Game_RRQuests.prototype.includes = function(id, category) {
        if (!this.isRevealed(id)) return false;
        const quest = this._data[id];
        switch (category) {
            case 'all': return true;
            case 'complete': case 'failed': case 'active': return quest.isStatus(category);
        }
        return (quest.customCategories || []).includes(category);
    };

    /** A category's quests in its sort order, then by priority (lower first). */
    Game_RRQuests.prototype.list = function(category = 'all') {
        let type = String(SORT_TYPES[category] || 'id');
        const reverse = /_r$/.test(type);
        type = type.replace(/_r$/, '');
        const list = (this._sort[type] || this._sort.id).filter(id => this.includes(id, category));
        if (reverse) list.reverse();
        return list.map(id => this._data[id]).sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    };

    //-------------------------------------------------------------------------
    // Game_Party

    Game_Party.prototype.rrQuests = function() {
        if (!this._rrQuests) this._rrQuests = new Game_RRQuests();
        return this._rrQuests;
    };

    Game_Party.prototype.rrQuest = function(id) {
        return this.rrQuests().get(id);
    };

    Game_Party.prototype.rrQuestRevealed = function(id) {
        return this.rrQuests().isRevealed(id);
    };

    Game_Party.prototype.rrQuestIs = function(id, status) {
        return this.rrQuestRevealed(id) && this.rrQuests()._data[Number(id)].isStatus(status);
    };

    Game_Party.prototype.rrCallQuestJournal = function(id) {
        if (this.inBattle()) return;
        if (id) this.rrQuests()._lastQuestId = Number(id);
        SceneManager.push(Scene_RRQuestJournal);
    };

    //-------------------------------------------------------------------------
    // Main menu. Wrapped at boot so the wrap sits outside other plugins' lists.

    const _rrQuestBootStart = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        const proto = Window_MenuCommand.prototype;
        if (MENU_ACCESS && !proto.makeCommandList._rrQuestJournal) {
            const makeCommandList = proto.makeCommandList;
            proto.makeCommandList = function() {
                makeCommandList.apply(this, arguments);
                if (this.findSymbol('rrQuestJournal') >= 0) return;
                const quests = $gameParty.rrQuests();
                this.addCommand(MENU_NAME, 'rrQuestJournal', !quests._disabled && quests.list('all').length > 0);
                this._list.splice(Math.max(0, Math.min(MENU_INDEX, this._list.length - 1)), 0, this._list.pop());
                this.setHandler('rrQuestJournal', () => SceneManager.push(Scene_RRQuestJournal));
            };
            proto.makeCommandList._rrQuestJournal = true;
        }
        _rrQuestBootStart.apply(this, arguments);
    };

    //-------------------------------------------------------------------------
    // Scene

    function Scene_RRQuestJournal() { this.initialize(...arguments); }
    window.Scene_RRQuestJournal = Scene_RRQuestJournal;
    Scene_RRQuestJournal.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRQuestJournal.prototype.constructor = Scene_RRQuestJournal;

    Scene_RRQuestJournal.prototype.helpAreaHeight = function() { return 0; };

    Scene_RRQuestJournal.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const top = this.mainAreaTop();
        const height = this.mainAreaHeight();
        const leftWidth = Math.min(Graphics.boxWidth - 240, Math.max(LIST_WIDTH, Math.floor(Graphics.boxWidth / 3)));
        let y = top;
        if (SCENE_LABEL) {
            this._labelWindow = new Window_RRQuestLabel(new Rectangle(0, y, leftWidth, this.calcWindowHeight(1, false)));
            this.addWindow(this._labelWindow);
            y += this._labelWindow.height;
        }
        this._categoryWindow = new Window_RRQuestCategory(new Rectangle(0, y, leftWidth, this.calcWindowHeight(2, false)));
        this.addWindow(this._categoryWindow);
        y += this._categoryWindow.height;
        this._listWindow = new Window_RRQuestList(new Rectangle(0, y, leftWidth, top + height - y));
        this._listWindow.setHandler('ok', this.onListOk.bind(this));
        this._listWindow.setHandler('cancel', this.popScene.bind(this));
        this._listWindow._rrShiftCategory = this.shiftCategory.bind(this);
        this.addWindow(this._listWindow);
        this._dataWindow = new Window_RRQuestData(new Rectangle(leftWidth, top, Graphics.boxWidth - leftWidth, height));
        this._dataWindow.setHandler('cancel', this.onDataCancel.bind(this));
        this._dataWindow.setHandler('ok', this.onDataCancel.bind(this));
        this.addWindow(this._dataWindow);
        this._listWindow._rrDataWindow = this._dataWindow;
        this.openOnLastQuest();
    };

    Scene_RRQuestJournal.prototype.openOnLastQuest = function() {
        const quests = $gameParty.rrQuests();
        let category = CATEGORIES.includes(quests._lastCategory) ? quests._lastCategory : CATEGORIES[0];
        let index = 0;
        const id = quests._lastQuestId;
        if (id && quests.isRevealed(id)) {
            const order = [category, ...CATEGORIES.filter(c => c !== category)];
            for (const c of order) {
                const at = quests.list(c).findIndex(q => q.id === id);
                if (at >= 0) { category = c; index = at; break; }
            }
        }
        this.setCategory(category);
        this._listWindow.forceSelect(this._listWindow.maxItems() ? index : -1);
    };

    Scene_RRQuestJournal.prototype.setCategory = function(category) {
        this._category = category;
        this._categoryWindow.setCategory(category);
        this._listWindow.setCategory(category);
    };

    Scene_RRQuestJournal.prototype.shiftCategory = function(step) {
        const at = CATEGORIES.indexOf(this._category);
        const next = CATEGORIES[(at + step + CATEGORIES.length) % CATEGORIES.length];
        if (next === this._category) return;
        SoundManager.playCursor();
        this.setCategory(next);
        this._listWindow.forceSelect(this._listWindow.maxItems() ? 0 : -1);
    };

    Scene_RRQuestJournal.prototype.onListOk = function() {
        this._dataWindow.activate();
    };

    Scene_RRQuestJournal.prototype.onDataCancel = function() {
        this._dataWindow.deactivate();
        this._listWindow.activate();
    };

    Scene_RRQuestJournal.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        const quests = $gameParty.rrQuests();
        const quest = this._listWindow.quest();
        quests._lastCategory = this._category;
        quests._lastQuestId = quest ? quest.id : 0;
    };

    //-------------------------------------------------------------------------
    // Windows

    const textColor = n => ColorManager.textColor(n);

    function Window_RRQuestLabel() { this.initialize(...arguments); }
    Window_RRQuestLabel.prototype = Object.create(Window_Base.prototype);
    Window_RRQuestLabel.prototype.constructor = Window_RRQuestLabel;

    Window_RRQuestLabel.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.contents.fontBold = true;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(SCENE_LABEL, 0, 0, this.innerWidth, 'center');
    };

    function Window_RRQuestCategory() { this.initialize(...arguments); }
    Window_RRQuestCategory.prototype = Object.create(Window_Base.prototype);
    Window_RRQuestCategory.prototype.constructor = Window_RRQuestCategory;

    Window_RRQuestCategory.prototype.setCategory = function(category) {
        this._category = category;
        this.contents.clear();
        const iconWidth = ImageManager.iconWidth;
        const step = Math.min(iconWidth + 12, Math.floor(this.innerWidth / CATEGORIES.length));
        let x = Math.floor((this.innerWidth - step * CATEGORIES.length) / 2) + Math.floor((step - iconWidth) / 2);
        const iconY = Math.floor((this.lineHeight() - ImageManager.iconHeight) / 2);
        // The current category is drawn full; the others faded, as the original's hidden cursor did.
        for (const c of CATEGORIES) {
            this.changePaintOpacity(c === category);
            this.drawIcon(Number(ICONS[c]) || 0, x, iconY);
            x += step;
        }
        this.changePaintOpacity(true);
        this.resetTextColor();
        this.drawText(String(CATEGORY_LABELS[category] || ''), 0, this.lineHeight(), this.innerWidth, 'center');
    };

    function Window_RRQuestList() { this.initialize(...arguments); }
    Window_RRQuestList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRQuestList.prototype.constructor = Window_RRQuestList;

    Window_RRQuestList.prototype.initialize = function(rect) {
        this._data = [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.activate();
    };

    Window_RRQuestList.prototype.setCategory = function(category) {
        this._category = category;
        this._data = $gameParty.rrQuests().list(category);
        this.refresh();
    };

    Window_RRQuestList.prototype.maxItems = function() { return this._data.length; };
    Window_RRQuestList.prototype.quest = function() { return this._data[this.index()] || null; };
    Window_RRQuestList.prototype.isCurrentItemEnabled = function() { return !!this.quest() && !!this._rrDataWindow && this._rrDataWindow.canScroll(); };

    // Left/right and page keys switch category while the list keeps the cursor.
    Window_RRQuestList.prototype.cursorRight = function() { if (this._rrShiftCategory) this._rrShiftCategory(1); };
    Window_RRQuestList.prototype.cursorLeft = function() { if (this._rrShiftCategory) this._rrShiftCategory(-1); };
    Window_RRQuestList.prototype.cursorPagedown = function() { if (this._rrShiftCategory) this._rrShiftCategory(1); };
    Window_RRQuestList.prototype.cursorPageup = function() { if (this._rrShiftCategory) this._rrShiftCategory(-1); };

    Window_RRQuestList.prototype.drawItem = function(index) {
        const quest = this._data[index];
        if (!quest) return;
        const rect = this.itemLineRect(index);
        let x = rect.x;
        if (quest.iconIndex) {
            this.drawIcon(quest.iconIndex, x, rect.y + Math.floor((rect.height - ImageManager.iconHeight) / 2));
            x += ImageManager.iconWidth + 4;
        }
        this.changeTextColor(quest.isFailed() ? textColor(FAILED_COLOR) : ColorManager.normalColor());
        this.drawText(quest.name, x, rect.y, rect.x + rect.width - x);
    };

    Window_RRQuestList.prototype.select = function(index) {
        Window_Selectable.prototype.select.call(this, index);
        if (this._rrDataWindow) this._rrDataWindow.setQuest(this.quest());
    };

    Window_RRQuestList.prototype.refresh = function() {
        Window_Selectable.prototype.refresh.call(this);
        if (this._rrDataWindow) this._rrDataWindow.setQuest(this.quest());
    };

    // The detail page: name and level, banner, client, location, description,
    // objectives, rewards, as the original's default layout.
    function Window_RRQuestData() { this.initialize(...arguments); }
    Window_RRQuestData.prototype = Object.create(Window_Selectable.prototype);
    Window_RRQuestData.prototype.constructor = Window_RRQuestData;

    Window_RRQuestData.prototype.initialize = function(rect) {
        this._quest = null;
        this._contentHeight = 0;
        Window_Selectable.prototype.initialize.call(this, rect);
        this.deactivate();
    };

    Window_RRQuestData.prototype.maxItems = function() { return 0; };
    Window_RRQuestData.prototype.contentsHeight = function() { return Math.max(this._contentHeight || 0, this.innerHeight); };
    Window_RRQuestData.prototype.overallHeight = function() { return this.contentsHeight(); };
    Window_RRQuestData.prototype.canScroll = function() { return this._contentHeight > this.innerHeight; };
    // One scroll block taller than the page, so scrolling only moves the origin and never repaints.
    Window_RRQuestData.prototype.scrollBlockHeight = function() { return this.contentsHeight() + 1; };
    Window_RRQuestData.prototype.paint = function() {};

    Window_RRQuestData.prototype.setQuest = function(quest) {
        if (this._quest === quest && quest) return;
        this._quest = quest;
        this.refresh();
    };

    Window_RRQuestData.prototype.processCursorMove = function() {
        if (!this.active) return;
        const step = this.lineHeight() / 2;
        if (Input.isPressed('down')) this.scrollBy(0, step);
        if (Input.isPressed('up')) this.scrollBy(0, -step);
    };

    Window_RRQuestData.prototype.wrap = function(text, width) {
        const lines = [];
        for (const paragraph of String(text || '').split('\n')) {
            let line = '';
            for (const word of paragraph.split(' ')) {
                const next = line ? line + ' ' + word : word;
                if (line && this.textSizeEx(next).width > width) { lines.push(line); line = word; } else line = next;
            }
            lines.push(line);
        }
        return lines;
    };

    Window_RRQuestData.prototype.blocks = function() {
        const quest = this._quest;
        const lh = this.lineHeight();
        const width = this.innerWidth;
        const blocks = [{ kind: 'title', height: lh }];
        if (quest.banner) {
            const bitmap = ImageManager.loadPicture(quest.banner);
            if (!bitmap.isReady()) bitmap.addLoadListener(() => { if (this._quest === quest) this.refresh(); });
            else blocks.push({ kind: 'banner', bitmap, height: bitmap.height });
        }
        if (quest.client) blocks.push({ kind: 'basic', key: 'client', value: quest.client, height: lh });
        if (quest.location) blocks.push({ kind: 'basic', key: 'location', value: quest.location, height: lh });
        if (quest.description) {
            const inset = DESCRIPTION_IN_BOX ? lh : lh / 2;
            const lines = this.wrap(quest.description, width - inset * 2);
            const heading = !!vocab('description') || DESCRIPTION_IN_BOX;
            blocks.push({ kind: 'description', lines, inset, height: (lines.length + (heading ? 1 : 0) + (DESCRIPTION_IN_BOX ? 1 : 0)) * lh });
        }
        if (quest.revealedObjectives.length) {
            const items = quest.revealedObjectives.map(id => {
                const lines = this.wrap(quest.objectives[id], width - lh - (ImageManager.iconWidth + 4));
                return { id, lines };
            });
            blocks.push({ kind: 'objectives', items, height: (vocab('objectives') ? lh : 0) + items.reduce((n, o) => n + o.lines.length * lh, 0) });
        }
        if ((quest.rewards || []).length) blocks.push({ kind: 'rewards', height: lh + quest.rewards.length * lh });
        blocks.push({ kind: 'line', height: lh });
        return blocks;
    };

    Window_RRQuestData.prototype.refresh = function() {
        const blocks = this._quest ? this.blocks() : [];
        this._contentHeight = blocks.reduce((n, b) => n + b.height, 0);
        this.createContents();
        this.scrollTo(0, 0);
        let y = 0;
        for (const block of blocks) {
            this.drawBlock(block, y);
            y += block.height;
        }
    };

    Window_RRQuestData.prototype.drawLine = function(y) {
        const lh = this.lineHeight();
        this.contents.fillRect(0, y + lh / 2, this.innerWidth, 2, 'rgba(0,0,0,0.5)');
        this.contents.fillRect(0, y + lh / 2 - 1, this.innerWidth, 2, textColor(8));
    };

    /** Text over a line, with the line cleared behind it. */
    Window_RRQuestData.prototype.drawHeading = function(text, y, align, bold = true) {
        if (!text) return;
        this.contents.fontBold = bold;
        const lh = this.lineHeight();
        const area = this.innerWidth - 80;
        const tw = Math.min(area, this.textWidth(text) + 8);
        const x = 40 + (align === 'center' ? (area - tw) / 2 : align === 'right' ? area - tw : 0);
        this.contents.clearRect(x, y, tw, lh);
        this.drawText(text, x + 4, y, tw - 4);
        this.contents.fontBold = false;
    };

    Window_RRQuestData.prototype.drawBasic = function(y, icon, label, value) {
        const w0 = BASIC_WIDTH > 0 && BASIC_WIDTH <= this.innerWidth ? BASIC_WIDTH : this.innerWidth;
        let x = (this.innerWidth - w0) / 2;
        let w = w0;
        if (icon) {
            this.drawIcon(icon, x, y + (this.lineHeight() - ImageManager.iconHeight) / 2);
            x += ImageManager.iconWidth + 4;
            w -= ImageManager.iconWidth + 4;
        }
        this.resetTextColor();
        const tw = label ? this.textWidth(label) : 0;
        if (label) this.drawText(label, x, y, tw);
        this.drawText(String(value), x + tw, y, w - tw, 'right');
    };

    Window_RRQuestData.prototype.drawBlock = function(block, y) {
        const quest = this._quest;
        const lh = this.lineHeight();
        const width = this.innerWidth;
        switch (block.kind) {
            case 'title': {
                this.drawLine(y);
                this.changeTextColor(quest.isFailed() ? textColor(FAILED_COLOR) : ColorManager.normalColor());
                this.drawHeading(quest.name, y, 'center', false);
                this.drawLevel(y);
                break;
            }
            case 'banner': {
                const b = block.bitmap;
                if (b.width > width) this.contents.blt(b, 0, 0, b.width, b.height, 0, y, width, b.height);
                else this.contents.blt(b, 0, 0, b.width, b.height, (width - b.width) / 2, y);
                break;
            }
            case 'basic':
                this.drawBasic(y, Number(ICONS[block.key]) || 0, vocab(block.key), block.value);
                break;
            case 'description': {
                let ty = y;
                if (DESCRIPTION_IN_BOX) {
                    const x = lh / 2 - 1, h = (block.lines.length + 1) * lh, w = width - 2 * x;
                    this.drawBox(x, y + lh / 2 - 1, w, h);
                }
                this.resetTextColor();
                if (vocab('description')) this.drawHeading(vocab('description'), y, 'left');
                if (vocab('description') || DESCRIPTION_IN_BOX) ty += lh;
                for (const line of block.lines) { this.drawTextEx(line, block.inset, ty, width - block.inset * 2); ty += lh; }
                break;
            }
            case 'objectives': {
                let ty = y;
                this.resetTextColor();
                if (vocab('objectives')) { this.drawHeading(vocab('objectives'), ty, 'left'); ty += lh; }
                const x = lh / 2;
                for (const { id, lines } of block.items) {
                    const status = quest.objectiveStatus('failed', id) ? 'failed' : quest.objectiveStatus('complete', id) ? 'complete' : 'active';
                    const icon = Number(OBJECTIVE_ICONS[status]) || 0;
                    const bulletWidth = ImageManager.iconWidth + 4;
                    if (icon) this.drawIcon(icon, x, ty + (lh - ImageManager.iconHeight) / 2);
                    else {
                        this.changeTextColor(status === 'failed' ? textColor(FAILED_COLOR) : ColorManager.normalColor());
                        this.drawText(vocab('objective_bullet').replace('%d', id + 1), x, ty, bulletWidth);
                    }
                    const colour = status === 'failed' ? `\\C[${FAILED_COLOR}]` : '';
                    for (const line of lines) { this.drawTextEx(colour + line, x + bulletWidth, ty, width - x - bulletWidth); ty += lh; }
                }
                break;
            }
            case 'rewards': {
                this.drawLine(y);
                this.resetTextColor();
                this.drawHeading(vocab('rewards'), y, 'center');
                (quest.rewards || []).forEach((reward, i) => this.drawReward(reward, y + (i + 1) * lh));
                break;
            }
            case 'line':
                this.drawLine(y);
                break;
        }
    };

    Window_RRQuestData.prototype.drawBox = function(x, y, w, h) {
        const outline = (ox, oy, colour) => {
            this.contents.fillRect(ox, oy, w, 2, colour);
            this.contents.fillRect(ox, oy + h - 2, w, 2, colour);
            this.contents.fillRect(ox, oy, 2, h, colour);
            this.contents.fillRect(ox + w - 2, oy, 2, h, colour);
        };
        outline(x + 1, y + 1, 'rgba(0,0,0,0.5)');
        outline(x, y, textColor(8));
    };

    Window_RRQuestData.prototype.drawLevel = function(y) {
        const level = this._quest.level;
        if (!(level > 0)) return;
        const iconY = y + (this.lineHeight() - ImageManager.iconHeight) / 2;
        const right = this.innerWidth - ImageManager.iconWidth;
        if (Array.isArray(LEVEL_ICON) && LEVEL_ICON.length) {
            this.drawIcon(LEVEL_ICON[level - 1] ?? LEVEL_ICON[LEVEL_ICON.length - 1], right, iconY);
        } else if (Number(LEVEL_ICON) > 0) {
            // Stacked right to left, overlapping as in the original (space scaled to the icon size).
            const space = LEVEL_SPACE * ImageManager.iconWidth / 24;
            for (let i = 0; i < level; i++) this.drawIcon(Number(LEVEL_ICON), right - i * space, iconY);
        } else {
            const text = vocab('level') + (LEVEL_SIGNALS[level - 1] !== undefined ? LEVEL_SIGNALS[level - 1] : String(level));
            this.resetTextColor();
            this.drawText(text, 0, y, this.innerWidth, 'right');
        }
    };

    Window_RRQuestData.prototype.drawReward = function(reward, y) {
        const [type, a, b, c] = reward || [];
        const w = BASIC_WIDTH > 0 && BASIC_WIDTH <= this.innerWidth ? BASIC_WIDTH : this.innerWidth;
        const x = (this.innerWidth - w) / 2;
        const item = type === 'item' || type === 0 ? $dataItems[a] : type === 'weapon' || type === 1 ? $dataWeapons[a] : type === 'armor' || type === 2 ? $dataArmors[a] : null;
        if (item) {
            const amount = b === undefined || b === null ? 1 : Number(b);
            this.resetTextColor();
            this.drawItemName(item, x, y, w - 48);
            if (amount > 1) this.drawText(vocab('reward_amount').replace('%d', amount), x + w - 48, y, 48, 'right');
        } else if (type === 'gold' || type === 3) this.drawBasic(y, Number(ICONS.reward_gold) || 0, vocab('reward_gold'), a || 0);
        else if (type === 'exp' || type === 4) this.drawBasic(y, Number(ICONS.reward_exp) || 0, vocab('reward_exp'), a || 0);
        else if (type === 'string' || type === 5) this.drawBasic(y, Number(a) || 0, c == null ? '' : String(c), b == null ? '' : String(b));
    };
})();
