//=============================================================================
// reactor_quests.js - RPG Reactor quests
//
// A quest is a record in data/ReactorQuests.json, authored in Database >
// Quests (its own file and global: plugins own data/Quests.json and
// $dataReactorQuests - YEP_QuestJournal, GS_QuestSystem - and must keep them): a
// name, a category, who gives it and where, a description, objectives and
// rewards (each can start hidden), and the rule that makes it appear -
// an event command, a switch, a variable, or the start of the game. The
// player's progress lives on $gameSystem, so it saves with the game.
//
//   $gameSystem.quests()            the progress record (Game_Quests)
//     .discover(id) .complete(id) .fail(id) .reset(id) .status(id)
//     .setObjective(id, index, "show" | "hide" | "complete" | "fail" | "reset")
//     .setReward(id, index, visible) .setTracked(id) .tracked()
//     .known() .completed() .failed()
//   ReactorQuests.find(idOrKey)     the data record by id or key
//   Scene_Quest                     the quest log; "Quests" in the main menu
//
// Plugin commands (plugin "RPGReactor"): QuestSet, QuestObjective,
// QuestReward, OpenQuestLog - the event editor offers them under
// Reactor > Game Flow. A stock MZ runtime ignores all of it.
//=============================================================================

(function() {
    "use strict";

    const ReactorQuests = {};
    window.ReactorQuests = ReactorQuests;
    ReactorQuests.DATA_URL = "data/ReactorQuests.json";
    ReactorQuests.STATUS = { HIDDEN: "hidden", KNOWN: "known", COMPLETED: "completed", FAILED: "failed" };
    ReactorQuests.OBJECTIVE = { HIDDEN: "hidden", OPEN: "open", DONE: "done", FAILED: "failed" };

    //-------------------------------------------------------------------------
    // Data

    /** Loads the quests file once; missing or malformed means none. */
    ReactorQuests.load = function() {
        if (this._state) return;
        this._state = "loading";
        const finish = parsed => {
            window.$dataReactorQuests = Array.isArray(parsed) ? parsed : [];
            this._state = "done";
        };
        try {
            if (typeof Utils !== "undefined" && Utils.isNwjs()) {
                const fs = require("fs");
                const path = require("path");
                const full = path.join(path.dirname(process.mainModule.filename), this.DATA_URL);
                if (!fs.existsSync(full)) return finish(null);
                return finish(JSON.parse(fs.readFileSync(full, "utf8")));
            }
        } catch (error) {
            console.warn("ReactorQuests: could not read " + this.DATA_URL, error);
            return finish(null);
        }
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", this.DATA_URL);
            xhr.overrideMimeType("application/json");
            xhr.onload = () => {
                let parsed = null;
                if (xhr.status < 400) {
                    try { parsed = JSON.parse(xhr.responseText); } catch (error) { parsed = null; }
                }
                finish(parsed);
            };
            xhr.onerror = () => finish(null);
            xhr.send();
        } catch (error) {
            finish(null);
        }
    };

    ReactorQuests.isReady = function() {
        this.load();
        return this._state === "done";
    };

    /** Every authored quest, in id order. */
    ReactorQuests.quests = function() {
        return (window.$dataReactorQuests || []).filter(quest => quest && quest.id > 0);
    };

    /** A quest by numeric id or by its key. */
    ReactorQuests.find = function(idOrKey) {
        const list = window.$dataReactorQuests || [];
        const id = Number(idOrKey);
        if (id > 0 && list[id]) return list[id];
        const key = String(idOrKey == null ? "" : idOrKey).trim();
        if (!key) return null;
        return list.find(quest => quest && quest.key === key) || null;
    };

    /** The project's quest log settings from System.json, with defaults. */
    ReactorQuests.settings = function() {
        const stored = (typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorQuests) || {};
        return {
            menuCommand: stored.menuCommand !== false,
            commandName: stored.commandName || "Quests",
            allLabel: stored.allLabel || "All"
        };
    };

    /**
     * Whether the main menu offers Reactor's quest log: it is the game's log,
     * the command is on, and there is something to show.
     */
    ReactorQuests.menuEnabled = function() {
        return this.logMode() === "reactor" && this.settings().menuCommand && this.quests().length > 0;
    };

    //-------------------------------------------------------------------------
    // Which quest log the game uses
    //
    // Database > Quests chooses between Reactor's own log and VisuStella's
    // Quest System (System.json reactorQuests.log). With VisuStella's, the
    // editor writes these quests into that plugin's parameters, and every
    // change of progress made here - by event command, by a rule, by script -
    // is passed on to it by key, so the log the player opens moves with the
    // events that were authored against Reactor's quests.

    /** The game's log: "visustella" only when it was chosen and the plugin is running. */
    ReactorQuests.logMode = function() {
        const stored = (typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorQuests) || {};
        return stored.log === "visustella" && this.visustellaRunning() ? "visustella" : "reactor";
    };

    ReactorQuests.visustellaRunning = function() {
        return !!(window.Imported && window.Imported.VisuMZ_2_QuestSystem)
            && typeof Game_System.prototype.setQuestStatus === "function";
    };

    /** A quest's key in VisuStella's list: its own, or one made from its id (the editor writes the same). */
    ReactorQuests.keyOf = function(quest) {
        const key = String((quest && quest.key) || "").trim();
        return key || "ReactorQuest" + (quest ? quest.id : 0);
    };

    /** Run apply(key, $gameSystem) against VisuStella's log when it is the game's. */
    ReactorQuests.mirror = function(quest, apply) {
        if (!quest || this.logMode() !== "visustella" || typeof $gameSystem === "undefined" || !$gameSystem) return;
        apply(this.keyOf(quest), $gameSystem);
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        if (scene && typeof scene.refreshQuestTrackerWindow === "function") scene.refreshQuestTrackerWindow();
    };

    /** Reactor's objective states as the ones VisuStella's setQuestObjectives takes. */
    ReactorQuests.OBJECTIVE_TO_VISUSTELLA = { open: "show", hidden: "remove", done: "complete", failed: "fail" };

    /** The category names in the order they first appear among the given quests. */
    ReactorQuests.categoriesOf = function(quests) {
        const seen = [];
        for (const quest of quests) {
            const name = String(quest.category || "").trim();
            if (!seen.includes(name)) seen.push(name);
        }
        return seen;
    };

    //-------------------------------------------------------------------------
    // Game_Quests - the player's progress, kept on $gameSystem

    function Game_Quests() {
        this.initialize(...arguments);
    }
    window.Game_Quests = Game_Quests;
    ReactorQuests.Game_Quests = Game_Quests;

    Game_Quests.prototype.initialize = function() {
        this._status = {};
        this._objectives = {};
        this._rewards = {};
        this._order = [];
        this._tracked = 0;
        this._started = false;
    };

    Game_Quests.prototype.status = function(id) {
        return this._status[id] || ReactorQuests.STATUS.HIDDEN;
    };

    Game_Quests.prototype.isKnown = function(id) {
        return this.status(id) !== ReactorQuests.STATUS.HIDDEN;
    };

    Game_Quests.prototype.isActive = function(id) {
        return this.status(id) === ReactorQuests.STATUS.KNOWN;
    };

    Game_Quests.prototype.isCompleted = function(id) {
        return this.status(id) === ReactorQuests.STATUS.COMPLETED;
    };

    Game_Quests.prototype.isFailed = function(id) {
        return this.status(id) === ReactorQuests.STATUS.FAILED;
    };

    /** The quest appears in the log, its objectives and rewards at their authored visibility. */
    Game_Quests.prototype.discover = function(id) {
        const quest = ReactorQuests.find(id);
        if (!quest) return false;
        id = quest.id;
        if (this.isKnown(id)) return false;
        this._status[id] = ReactorQuests.STATUS.KNOWN;
        if (!this._order.includes(id)) this._order.push(id);
        if (!this._objectives[id]) {
            this._objectives[id] = (quest.objectives || []).map(objective =>
                objective && objective.hidden ? ReactorQuests.OBJECTIVE.HIDDEN : ReactorQuests.OBJECTIVE.OPEN);
        }
        if (!this._rewards[id]) {
            this._rewards[id] = (quest.rewards || []).map(reward => !(reward && reward.hidden));
        }
        ReactorQuests.mirror(quest, (key, system) => system.setQuestStatus(key, "known"));
        return true;
    };

    Game_Quests.prototype.complete = function(id) {
        const quest = ReactorQuests.find(id);
        if (!quest) return false;
        this.discover(quest.id);
        this._status[quest.id] = ReactorQuests.STATUS.COMPLETED;
        if (this._tracked === quest.id) this._tracked = 0;
        ReactorQuests.mirror(quest, (key, system) => system.setQuestStatus(key, "completed"));
        return true;
    };

    Game_Quests.prototype.fail = function(id) {
        const quest = ReactorQuests.find(id);
        if (!quest) return false;
        this.discover(quest.id);
        this._status[quest.id] = ReactorQuests.STATUS.FAILED;
        if (this._tracked === quest.id) this._tracked = 0;
        ReactorQuests.mirror(quest, (key, system) => system.setQuestStatus(key, "failed"));
        return true;
    };

    /** Back to never heard of: the log forgets it and its objectives start over. */
    Game_Quests.prototype.reset = function(id) {
        const quest = ReactorQuests.find(id);
        if (!quest) return false;
        delete this._status[quest.id];
        delete this._objectives[quest.id];
        delete this._rewards[quest.id];
        this._order = this._order.filter(other => other !== quest.id);
        if (this._tracked === quest.id) this._tracked = 0;
        ReactorQuests.mirror(quest, (key, system) => {
            system.setQuestStatus(key, "remove");
            // Its objectives and rewards start over too: the plugin keeps them by upper-case key.
            const data = system.questData();
            const upper = key.toUpperCase();
            for (const field of ["objectives", "objectivesCompleted", "objectivesFailed", "rewards", "rewardsClaimed", "rewardsDenied"]) {
                if (data[field]) delete data[field][upper];
            }
        });
        return true;
    };

    /** Objective states for a quest, one per authored objective. */
    Game_Quests.prototype.objectiveStates = function(id) {
        const quest = ReactorQuests.find(id);
        if (!quest) return [];
        const states = this._objectives[quest.id] || [];
        return (quest.objectives || []).map((objective, index) =>
            states[index] || (objective && objective.hidden ? ReactorQuests.OBJECTIVE.HIDDEN : ReactorQuests.OBJECTIVE.OPEN));
    };

    /**
     * Change one objective (0-based index) or every objective ("all"):
     * "show", "hide", "complete", "fail" or "reset" (open again). Discovers
     * the quest first if it has to, and completes a quest whose rule is
     * "every shown objective complete" when that becomes true.
     */
    Game_Quests.prototype.setObjective = function(id, index, state) {
        const quest = ReactorQuests.find(id);
        if (!quest) return false;
        this.discover(quest.id);
        const states = this.objectiveStates(quest.id);
        const apply = (value, at) => {
            switch (state) {
                case "show": return value === ReactorQuests.OBJECTIVE.HIDDEN ? ReactorQuests.OBJECTIVE.OPEN : value;
                case "hide": return ReactorQuests.OBJECTIVE.HIDDEN;
                case "complete": return ReactorQuests.OBJECTIVE.DONE;
                case "fail": return ReactorQuests.OBJECTIVE.FAILED;
                case "reset": return ReactorQuests.OBJECTIVE.OPEN;
                default: return value;
            }
        };
        let changed;
        if (index === "all") {
            this._objectives[quest.id] = states.map(apply);
            changed = states.map((value, at) => at);
        } else {
            const at = Number(index);
            if (!(at >= 0 && at < states.length)) return false;
            states[at] = apply(states[at], at);
            this._objectives[quest.id] = states;
            changed = [at];
        }
        this._mirrorObjectives(quest, changed);
        this._checkCompletion(quest);
        return true;
    };

    /** Pass some objectives' current states (0-based indices) on to VisuStella's log. */
    Game_Quests.prototype._mirrorObjectives = function(quest, indices) {
        const states = this.objectiveStates(quest.id);
        ReactorQuests.mirror(quest, (key, system) => {
            const groups = {};
            for (const at of indices) {
                const target = ReactorQuests.OBJECTIVE_TO_VISUSTELLA[states[at]];
                if (target) (groups[target] = groups[target] || []).push(at + 1);
            }
            for (const target of Object.keys(groups)) system.setQuestObjectives(key, groups[target], target);
        });
    };

    /** Whether every objective the player can see is complete (and there is at least one). */
    Game_Quests.prototype.allShownObjectivesDone = function(id) {
        const shown = this.objectiveStates(id).filter(state => state !== ReactorQuests.OBJECTIVE.HIDDEN);
        return shown.length > 0 && shown.every(state => state === ReactorQuests.OBJECTIVE.DONE);
    };

    Game_Quests.prototype._checkCompletion = function(quest) {
        if (!this.isActive(quest.id)) return;
        const rule = quest.completion && quest.completion.type;
        if (rule === "objectives" && this.allShownObjectivesDone(quest.id)) this.complete(quest.id);
    };

    /** Reward visibility for a quest, one flag per authored reward. */
    Game_Quests.prototype.rewardsShown = function(id) {
        const quest = ReactorQuests.find(id);
        if (!quest) return [];
        const shown = this._rewards[quest.id] || [];
        return (quest.rewards || []).map((reward, index) =>
            shown[index] !== undefined ? !!shown[index] : !(reward && reward.hidden));
    };

    Game_Quests.prototype.setReward = function(id, index, visible) {
        const quest = ReactorQuests.find(id);
        if (!quest) return false;
        this.discover(quest.id);
        const shown = this.rewardsShown(quest.id);
        let ids;
        if (index === "all") {
            this._rewards[quest.id] = shown.map(() => !!visible);
            ids = shown.map((value, at) => at + 1);
        } else {
            const at = Number(index);
            if (!(at >= 0 && at < shown.length)) return false;
            shown[at] = !!visible;
            this._rewards[quest.id] = shown;
            ids = [at + 1];
        }
        ReactorQuests.mirror(quest, (key, system) => system.setQuestRewards(key, ids, visible ? "show" : "remove"));
        return true;
    };

    Game_Quests.prototype.setTracked = function(id) {
        const quest = id ? ReactorQuests.find(id) : null;
        this._tracked = quest && this.isActive(quest.id) ? quest.id : 0;
        if (ReactorQuests.logMode() === "visustella" && typeof $gameSystem !== "undefined" && $gameSystem) {
            $gameSystem.setTrackedQuest(this._tracked ? ReactorQuests.keyOf(quest) : "");
        }
    };

    Game_Quests.prototype.tracked = function() {
        return this._tracked && this.isActive(this._tracked) ? this._tracked : 0;
    };

    /** Known quests as data records, in the order they were discovered. */
    Game_Quests.prototype.known = function() {
        return this._order.map(id => ReactorQuests.find(id)).filter(quest => quest && this.isKnown(quest.id));
    };

    Game_Quests.prototype.active = function() {
        return this.known().filter(quest => this.isActive(quest.id));
    };

    Game_Quests.prototype.completed = function() {
        return this.known().filter(quest => this.isCompleted(quest.id));
    };

    Game_Quests.prototype.failed = function() {
        return this.known().filter(quest => this.isFailed(quest.id));
    };

    /**
     * The rules that run on their own, once a frame on the map: a quest
     * that appears at the start of the game, when a switch is on or a
     * variable reaches a value; an objective that completes with a switch;
     * a quest that completes with a switch. Switches read through
     * $gameSwitches, so anything that sets one - an event, a plugin, a
     * script - moves the quest along without knowing it exists.
     */
    Game_Quests.prototype.update = function() {
        if (typeof $gameSwitches === "undefined" || !$gameSwitches) return;
        const quests = ReactorQuests.quests();
        if (!quests.length) return;
        const starting = !this._started;
        this._started = true;
        for (const quest of quests) {
            const id = quest.id;
            if (!this.isKnown(id)) {
                const rule = quest.activation || {};
                let appear = false;
                switch (rule.type) {
                    case "start": appear = starting || true; break;
                    case "switch": appear = rule.switchId > 0 && $gameSwitches.value(rule.switchId); break;
                    case "variable": appear = rule.variableId > 0 && ReactorQuests.compare($gameVariables.value(rule.variableId), rule.operator, rule.value); break;
                    default: appear = false;
                }
                if (appear) this.discover(id);
                continue;
            }
            if (!this.isActive(id)) continue;
            const states = this.objectiveStates(id);
            let changed = false;
            (quest.objectives || []).forEach((objective, index) => {
                if (!objective || !(objective.switchId > 0)) return;
                if (states[index] === ReactorQuests.OBJECTIVE.OPEN && $gameSwitches.value(objective.switchId)) {
                    states[index] = ReactorQuests.OBJECTIVE.DONE;
                    changed = true;
                }
            });
            if (changed) {
                this._objectives[id] = states;
                this._mirrorObjectives(quest, states.map((value, at) => at));
            }
            const done = quest.completion || {};
            if (done.type === "switch" && done.switchId > 0 && $gameSwitches.value(done.switchId)) {
                this.complete(id);
            } else if (changed || done.type === "objectives") {
                this._checkCompletion(quest);
            }
        }
    };

    ReactorQuests.compare = function(actual, operator, wanted) {
        const a = Number(actual) || 0;
        const b = Number(wanted) || 0;
        switch (operator) {
            case "==": return a === b;
            case "<=": return a <= b;
            case "<": return a < b;
            case ">": return a > b;
            case "!=": return a !== b;
            default: return a >= b;
        }
    };

    //-------------------------------------------------------------------------
    // Game_System carries the record so it saves with everything else.

    Game_System.prototype.quests = function() {
        if (!(this._reactorQuests instanceof Game_Quests)) {
            const previous = this._reactorQuests;
            this._reactorQuests = new Game_Quests();
            // A save written by a build that stored a plain object.
            if (previous && typeof previous === "object") Object.assign(this._reactorQuests, previous);
        }
        return this._reactorQuests;
    };

    const _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        _Game_Map_update.apply(this, arguments);
        if (sceneActive && typeof $gameSystem !== "undefined" && $gameSystem && ReactorQuests.quests().length) {
            $gameSystem.quests().update();
        }
    };

    //-------------------------------------------------------------------------
    // Plugin commands

    const questIdOf = args => {
        const raw = args && (args.questId !== undefined ? args.questId : args.quest);
        const quest = ReactorQuests.find(raw);
        return quest ? quest.id : 0;
    };
    const indexOf = raw => {
        const text = String(raw == null ? "" : raw).trim().toLowerCase();
        if (!text || text === "all") return "all";
        const n = Number(text);
        return n >= 1 ? n - 1 : "all";
    };

    PluginManager.registerCommand("RPGReactor", "QuestSet", function(args) {
        const id = questIdOf(args);
        if (!id) return;
        const record = $gameSystem.quests();
        switch (String(args.action || "discover")) {
            case "discover": record.discover(id); break;
            case "complete": record.complete(id); break;
            case "fail": record.fail(id); break;
            case "reset": record.reset(id); break;
            case "track": record.discover(id); record.setTracked(id); break;
            case "untrack": if (record.tracked() === id) record.setTracked(0); break;
        }
    });

    PluginManager.registerCommand("RPGReactor", "QuestObjective", function(args) {
        const id = questIdOf(args);
        if (!id) return;
        $gameSystem.quests().setObjective(id, indexOf(args.objective), String(args.state || "complete"));
    });

    PluginManager.registerCommand("RPGReactor", "QuestReward", function(args) {
        const id = questIdOf(args);
        if (!id) return;
        $gameSystem.quests().setReward(id, indexOf(args.reward), String(args.state || "show") !== "hide");
    });

    PluginManager.registerCommand("RPGReactor", "OpenQuestLog", function(args) {
        // Once VisuStella's Quest System loads, the global Scene_Quest is its own.
        if (ReactorQuests.logMode() === "visustella") {
            SceneManager.push(window.Scene_Quest);
            return;
        }
        if (args && args.questId) {
            const id = questIdOf(args);
            if (id) Scene_Quest.openOn = id;
        }
        SceneManager.push(Scene_Quest);
    });

    //-------------------------------------------------------------------------
    // The main menu

    /**
     * The command goes in as the menu finishes building its list, where
     * addOriginalCommands would have put it (after Formation), and brings its
     * own handler. It used to ride addOriginalCommands and
     * Scene_Menu.createCommandWindow, but VisuStella's MainMenuCore replaces
     * both outright, so neither the command nor its handler reached the menu.
     * A MainMenuCore submenu keeps its own list.
     */
    ReactorQuests.addMenuCommand = function(commandWindow) {
        if (!this.menuEnabled()) return;
        if (typeof commandWindow.currentSubcategory === "function" && commandWindow.currentSubcategory()) return;
        if (commandWindow.findSymbol("reactorQuest") >= 0) return;
        commandWindow.addCommand(this.settings().commandName, "reactorQuest", true);
        const list = commandWindow._list;
        const command = list.pop();
        const formation = list.findIndex(entry => entry.symbol === "formation");
        const options = list.findIndex(entry => entry.symbol === "options");
        list.splice(formation >= 0 ? formation + 1 : options >= 0 ? options : list.length, 0, command);
        commandWindow.setHandler("reactorQuest", () => SceneManager.push(Scene_Quest));
    };

    // Wrapped at boot, once every plugin has loaded, so the wrap sits outside
    // whatever a plugin did to the menu's list.
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        const proto = Window_MenuCommand.prototype;
        if (typeof proto.makeCommandList === "function" && !proto.makeCommandList._reactorQuests) {
            const makeCommandList = proto.makeCommandList;
            proto.makeCommandList = function() {
                makeCommandList.apply(this, arguments);
                ReactorQuests.addMenuCommand(this);
            };
            proto.makeCommandList._reactorQuests = true;
        }
        _Scene_Boot_start.apply(this, arguments);
    };

    //-------------------------------------------------------------------------
    // Scene_Quest - the quest log

    function Scene_Quest() {
        this.initialize(...arguments);
    }
    window.Scene_Quest = Scene_Quest;
    ReactorQuests.Scene_Quest = Scene_Quest;
    Scene_Quest.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Quest.prototype.constructor = Scene_Quest;
    /** A quest id to land on when the scene opens (set by OpenQuestLog). */
    Scene_Quest.openOn = 0;

    Scene_Quest.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createCategoryWindow();
        this.createListWindow();
        this.createDetailWindow();
        this._categoryWindow.setListWindow(this._listWindow);
        this._listWindow.setDetailWindow(this._detailWindow);
        this._categoryWindow.refresh();
        this._listWindow.refresh();
        const wanted = Scene_Quest.openOn;
        Scene_Quest.openOn = 0;
        if (wanted) this._listWindow.selectQuest(wanted);
        this._categoryWindow.activate();
    };

    Scene_Quest.prototype.categoryWindowRect = function() {
        const wx = 0;
        const wy = this.mainAreaTop();
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(1, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Quest.prototype.listWindowRect = function() {
        const top = this.categoryWindowRect();
        const wx = 0;
        const wy = top.y + top.height;
        const ww = Math.floor(Graphics.boxWidth * 0.38);
        const wh = this.mainAreaHeight() - top.height;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Quest.prototype.detailWindowRect = function() {
        const list = this.listWindowRect();
        return new Rectangle(list.x + list.width, list.y, Graphics.boxWidth - list.width, list.height);
    };

    Scene_Quest.prototype.createCategoryWindow = function() {
        this._categoryWindow = new Window_QuestCategory(this.categoryWindowRect());
        this._categoryWindow.setHandler("ok", this.onCategoryOk.bind(this));
        this._categoryWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._categoryWindow);
    };

    Scene_Quest.prototype.createListWindow = function() {
        this._listWindow = new Window_QuestList(this.listWindowRect());
        this._listWindow.setHandler("ok", this.onListOk.bind(this));
        this._listWindow.setHandler("cancel", this.onListCancel.bind(this));
        this.addWindow(this._listWindow);
    };

    Scene_Quest.prototype.createDetailWindow = function() {
        this._detailWindow = new Window_QuestDetail(this.detailWindowRect());
        this._detailWindow.setHandler("cancel", this.onDetailCancel.bind(this));
        this.addWindow(this._detailWindow);
    };

    Scene_Quest.prototype.onCategoryOk = function() {
        if (this._listWindow.maxItems() > 0) {
            this._listWindow.activate();
            if (this._listWindow.index() < 0) this._listWindow.select(0);
        } else {
            this._categoryWindow.activate();
        }
    };

    Scene_Quest.prototype.onListOk = function() {
        // OK on a quest pins it as the tracked quest, or unpins it again;
        // reading the detail never needs a mode of its own.
        const quest = this._listWindow.quest();
        const record = $gameSystem.quests();
        if (quest && record.isActive(quest.id)) {
            record.setTracked(record.tracked() === quest.id ? 0 : quest.id);
            this._listWindow.refresh();
            this._detailWindow.refresh();
        }
        this._listWindow.activate();
    };

    Scene_Quest.prototype.onListCancel = function() {
        this._listWindow.deselect();
        this._categoryWindow.activate();
    };

    Scene_Quest.prototype.onDetailCancel = function() {
        this._listWindow.activate();
    };

    Scene_Quest.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        // The detail scrolls with the shoulder buttons or the right stick
        // while the list is active, so a long description never traps the
        // cursor.
        if (this._listWindow.active || this._categoryWindow.active) {
            if (Input.isRepeated("pagedown")) this._detailWindow.scrollBy(this._detailWindow.lineHeight() * 3);
            if (Input.isRepeated("pageup")) this._detailWindow.scrollBy(-this._detailWindow.lineHeight() * 3);
        }
    };

    //-------------------------------------------------------------------------
    // Window_QuestCategory - "All" and every category a known quest carries

    function Window_QuestCategory() {
        this.initialize(...arguments);
    }
    window.Window_QuestCategory = Window_QuestCategory;
    Window_QuestCategory.prototype = Object.create(Window_HorzCommand.prototype);
    Window_QuestCategory.prototype.constructor = Window_QuestCategory;

    Window_QuestCategory.prototype.initialize = function(rect) {
        Window_HorzCommand.prototype.initialize.call(this, rect);
        this._listWindow = null;
    };

    Window_QuestCategory.prototype.maxCols = function() {
        return Math.max(1, this._list ? this._list.length : 1);
    };

    Window_QuestCategory.prototype.makeCommandList = function() {
        this.addCommand(ReactorQuests.settings().allLabel, "all", true, "");
        const known = $gameSystem.quests().known();
        for (const category of ReactorQuests.categoriesOf(known)) {
            if (category) this.addCommand(category, "category", true, category);
        }
    };

    // A category name takes text codes - an imported one usually carries a
    // colour - and Window_Command draws with drawText, which prints them.
    Window_QuestCategory.prototype.drawItem = function(index) {
        const rect = this.itemLineRect(index);
        const name = this.commandName(index);
        const width = this.textSizeEx(name).width;
        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));
        this.drawTextEx(name, rect.x + Math.max(0, (rect.width - width) / 2), rect.y, rect.width);
    };

    Window_QuestCategory.prototype.setListWindow = function(listWindow) {
        this._listWindow = listWindow;
    };

    Window_QuestCategory.prototype.update = function() {
        Window_HorzCommand.prototype.update.call(this);
        if (this._listWindow && this._lastIndex !== this.index()) {
            this._lastIndex = this.index();
            this._listWindow.setCategory(this.currentSymbol() === "all" ? null : this.currentExt());
        }
    };

    //-------------------------------------------------------------------------
    // Window_QuestList - the known quests of the chosen category

    function Window_QuestList() {
        this.initialize(...arguments);
    }
    window.Window_QuestList = Window_QuestList;
    Window_QuestList.prototype = Object.create(Window_Selectable.prototype);
    Window_QuestList.prototype.constructor = Window_QuestList;

    Window_QuestList.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._category = null;
        this._data = [];
        this._detailWindow = null;
    };

    Window_QuestList.prototype.setCategory = function(category) {
        if (this._category === category) return;
        this._category = category;
        this.refresh();
        this.scrollTo(0, 0);
    };

    Window_QuestList.prototype.setDetailWindow = function(detailWindow) {
        this._detailWindow = detailWindow;
        this.callUpdateHelp();
    };

    Window_QuestList.prototype.maxItems = function() {
        return this._data.length;
    };

    Window_QuestList.prototype.quest = function() {
        return this._data[this.index()] || null;
    };

    Window_QuestList.prototype.makeItemList = function() {
        const record = $gameSystem.quests();
        // Active first, then completed, then failed: what the player can
        // still do is what they opened the log for.
        const rank = quest => (record.isActive(quest.id) ? 0 : record.isCompleted(quest.id) ? 1 : 2);
        this._data = record.known()
            .filter(quest => this._category === null || String(quest.category || "").trim() === this._category)
            .sort((a, b) => rank(a) - rank(b));
    };

    Window_QuestList.prototype.selectQuest = function(id) {
        const index = this._data.findIndex(quest => quest.id === id);
        if (index >= 0) this.select(index);
    };

    Window_QuestList.prototype.drawItem = function(index) {
        const quest = this._data[index];
        if (!quest) return;
        const rect = this.itemLineRect(index);
        const record = $gameSystem.quests();
        let mark = "";
        if (record.isCompleted(quest.id)) mark = "\\C[24]" + ReactorQuests.MARK_DONE + "\\C[0] ";
        else if (record.isFailed(quest.id)) mark = "\\C[2]" + ReactorQuests.MARK_FAILED + "\\C[0] ";
        else if (record.tracked() === quest.id) mark = "\\C[17]" + ReactorQuests.MARK_TRACKED + "\\C[0] ";
        const icon = quest.iconIndex > 0 ? "\\I[" + quest.iconIndex + "]" : "";
        this.changePaintOpacity(record.isActive(quest.id));
        this.drawTextEx(mark + icon + String(quest.name || ""), rect.x, rect.y, rect.width);
        this.changePaintOpacity(true);
    };

    Window_QuestList.prototype.refresh = function() {
        this.makeItemList();
        Window_Selectable.prototype.refresh.call(this);
    };

    Window_QuestList.prototype.select = function(index) {
        Window_Selectable.prototype.select.call(this, index);
        if (this._detailWindow) this._detailWindow.setQuest(this.quest());
    };

    ReactorQuests.MARK_DONE = "●";
    // The game font draws a hollow circle as a narrow zero; a grey dot reads as "still to do" beside the green one.
    ReactorQuests.MARK_OPEN = "•";
    ReactorQuests.MARK_FAILED = "×";
    ReactorQuests.MARK_TRACKED = "▶";

    //-------------------------------------------------------------------------
    // Window_QuestDetail - the chosen quest, scrolling when it runs long

    function Window_QuestDetail() {
        this.initialize(...arguments);
    }
    window.Window_QuestDetail = Window_QuestDetail;
    Window_QuestDetail.prototype = Object.create(Window_Selectable.prototype);
    Window_QuestDetail.prototype.constructor = Window_QuestDetail;

    Window_QuestDetail.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._quest = null;
        this._contentHeight = 0;
        this.refresh();
    };

    Window_QuestDetail.prototype.setQuest = function(quest) {
        if (this._quest === quest) return;
        this._quest = quest;
        this.scrollTo(0, 0);
        this.refresh();
    };

    Window_QuestDetail.prototype.maxItems = function() { return 0; };
    Window_QuestDetail.prototype.overallHeight = function() { return Math.max(this._contentHeight, this.innerHeight); };

    Window_QuestDetail.prototype.scrollBy = function(amount) {
        const max = Math.max(0, this.overallHeight() - this.innerHeight);
        this.scrollTo(0, Math.max(0, Math.min(max, this.scrollY() + amount)));
    };

    /** Text in the window's width, wrapped at spaces; codes ride through untouched. */
    Window_QuestDetail.prototype.wrap = function(text, width) {
        const lines = [];
        for (const paragraph of String(text == null ? "" : text).split("\n")) {
            const words = paragraph.split(" ");
            let line = "";
            for (const word of words) {
                const candidate = line ? line + " " + word : word;
                if (line && this.textSizeEx(candidate).width > width) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            lines.push(line);
        }
        return lines;
    };

    Window_QuestDetail.prototype.refresh = function() {
        const quest = this._quest;
        // Measure first, then size the contents to what will be drawn: the
        // window scrolls its contents, so a long quest is never cut off.
        const width = this.innerWidth - this.itemPadding() * 2;
        const lineHeight = this.lineHeight();
        const blocks = quest ? this.blocksFor(quest, width) : [];
        const lines = blocks.reduce((sum, block) => sum + block.lines.length, 0) + Math.max(0, blocks.length - 1);
        this._contentHeight = Math.max(this.innerHeight, lines * lineHeight + this.itemPadding());
        this.contents.destroy();
        this.contents = new Bitmap(this.innerWidth, this._contentHeight);
        this.contentsBack.destroy();
        this.contentsBack = new Bitmap(this.innerWidth, this._contentHeight);
        this.resetFontSettings();
        let y = 0;
        const x = this.itemPadding();
        for (const block of blocks) {
            for (const line of block.lines) {
                this.drawTextEx(line, x, y, width);
                y += lineHeight;
            }
            y += lineHeight;
        }
        if (this._quest === null) {
            this.changePaintOpacity(false);
            this.drawText(ReactorQuests.settings().commandName, 0, 0, this.innerWidth, "center");
            this.changePaintOpacity(true);
        }
    };

    /** The quest as titled blocks of already-wrapped lines. */
    Window_QuestDetail.prototype.blocksFor = function(quest, width) {
        const record = $gameSystem.quests();
        const blocks = [];
        const icon = quest.iconIndex > 0 ? "\\I[" + quest.iconIndex + "]" : "";
        const head = [icon + String(quest.name || "")];
        const meta = [];
        if (quest.difficulty) meta.push(String(quest.difficulty));
        if (quest.from) meta.push(String(quest.from));
        if (quest.location) meta.push(String(quest.location));
        if (meta.length) head.push("\\C[8]" + meta.join("  •  ") + "\\C[0]");
        if (record.isCompleted(quest.id)) head.push("\\C[24]" + ReactorQuests.MARK_DONE + " " + ReactorQuests.text("complete") + "\\C[0]");
        else if (record.isFailed(quest.id)) head.push("\\C[2]" + ReactorQuests.MARK_FAILED + " " + ReactorQuests.text("failed") + "\\C[0]");
        else if (record.tracked() === quest.id) head.push("\\C[17]" + ReactorQuests.MARK_TRACKED + " " + ReactorQuests.text("tracked") + "\\C[0]");
        blocks.push({ lines: head });
        if (quest.description) blocks.push({ lines: this.wrap(quest.description, width) });
        const states = record.objectiveStates(quest.id);
        const objectives = [];
        (quest.objectives || []).forEach((objective, index) => {
            const state = states[index];
            if (!objective || state === ReactorQuests.OBJECTIVE.HIDDEN) return;
            const mark = state === ReactorQuests.OBJECTIVE.DONE ? "\\C[24]" + ReactorQuests.MARK_DONE + "\\C[0] "
                : state === ReactorQuests.OBJECTIVE.FAILED ? "\\C[2]" + ReactorQuests.MARK_FAILED + "\\C[0] "
                : "\\C[8]" + ReactorQuests.MARK_OPEN + "\\C[0] ";
            const wrapped = this.wrap(objective.text, width - this.textWidth("●  "));
            objectives.push(mark + wrapped[0]);
            for (const rest of wrapped.slice(1)) objectives.push("    " + rest);
        });
        if (objectives.length) blocks.push({ lines: ["\\C[16]" + ReactorQuests.text("objectives") + "\\C[0]"].concat(objectives) });
        const shown = record.rewardsShown(quest.id);
        const rewards = [];
        (quest.rewards || []).forEach((reward, index) => {
            if (!reward || !shown[index]) return;
            rewards.push(...this.wrap(reward.text, width));
        });
        if (rewards.length) blocks.push({ lines: ["\\C[16]" + ReactorQuests.text("rewards") + "\\C[0]"].concat(rewards) });
        if (quest.subtext) blocks.push({ lines: this.wrap(quest.subtext, width) });
        if (quest.quotes) blocks.push({ lines: this.wrap(quest.quotes, width).map(line => "\\C[8]" + line + "\\C[0]") });
        return blocks;
    };

    /** The log's own labels, replaceable per project from System.json. */
    ReactorQuests.text = function(key) {
        const settings = (typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorQuests) || {};
        const labels = settings.labels || {};
        const fallback = { objectives: "Objectives", rewards: "Rewards", complete: "Complete", failed: "Failed", tracked: "Tracked" };
        return labels[key] || fallback[key] || key;
    };

    //-------------------------------------------------------------------------
    // Boot: the file loads with the database, and the scene waits for it.

    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        _Scene_Boot_create.apply(this, arguments);
        ReactorQuests.load();
    };

    const _Scene_Boot_isReady = Scene_Boot.prototype.isReady;
    Scene_Boot.prototype.isReady = function() {
        return _Scene_Boot_isReady.apply(this, arguments) && ReactorQuests.isReady();
    };
})();
