/*:
 * @target MZ
 * @plugindesc Job Board and Thrall's Game_System (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallJobBoard.js
 *
 * The guild's Job Board: the board's jobs on the left, the accepted ones
 * (up to 7) on the right, the selected job's description, location, reward
 * and level below. Confirm takes a job, or puts an accepted repeatable job
 * back; left and right move between the lists; cancel leaves.
 *
 * Thrall kept the game's own lists on the system, saved with it: the jobs
 * on the board and the accepted ones ([type, location, floor, reward icon,
 * level, cleared]), the blackjack deck and hands, the tutorials seen, the
 * craftable weapon and armour lists, and the loot pity lists. Events read
 * and change them as arrays.
 *
 * Script calls ($gameSystem):
 *   rrAcceptedJobs(), rrJobs(), rrDeck(), rrHand1(), rrHand2(),
 *   rrTutorials(), rrWeaponList(), rrArmorList(), rrWeaponTypes(),
 *   rrArmorTypes()                  the lists; rrSetList(name, array)
 *   rrGenerateJobs(count, locations) generate_jobs
 *   rrJobDetail(id)                  job_detail: a job's, place's or floor's text
 *   rrCheckFloor(location), rrGetJobIndex(location)   the job on this floor
 *   rrCheckCleared(), rrGetClearedIndex()             a cleared job
 *   rrValidator(), rrTimeCheck()     the save stamps (Scene_File sets them)
 *   SceneManager.push(Scene_RRThrallJobBoard)          Scene_JobBoard
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param jobDetails
 * @text Job texts
 * @desc JSON: [from, to, text] for each of job_detail's branches; null text: the floor number and "F".
 * @type note
 * @default "[]"
 *
 * @param maxFloors
 * @text Floors per dungeon
 * @desc generate_jobs' max_floors, for locations 301, 302 …
 * @default 5,7,7,9
 *
 * @param dungeonLevels
 * @text Dungeon levels
 * @desc generate_jobs' dungeon_level, for locations 301, 302 …
 * @default 6,13,13,18
 *
 * @param rewardIcons
 * @text Reward icons
 * @desc generate_jobs' icons: gold, then uncommon, rare and epic weapon, armour and item.
 * @default 8,229,232,235,230,233,236,231,234,237
 *
 * @param deliveryIcons
 * @text Delivery icons
 * @desc The requested item's icon for delivery jobs 204-213.
 * @default 145,158,164,165,166,167,144,148,159,168
 */
(() => {
    'use strict';
    const PLUGIN = 'RR_ThrallJobBoard';
    const P = PluginManager.parameters(PLUGIN);
    const json = (s, d) => {
        try { let v = s ? JSON.parse(s) : d; if (typeof v === 'string') v = JSON.parse(v); return Array.isArray(v) ? v : d; } catch (_) { return d; }
    };
    const nums = (s, d) => { const v = String(s || '').split(/[,\s]+/).filter(Boolean).map(Number); return v.length ? v : d; };
    const DETAILS = json(P.jobDetails, []);
    const MAX_FLOORS = nums(P.maxFloors, [5, 7, 7, 9]);
    const DUNGEON_LEVELS = nums(P.dungeonLevels, [6, 13, 13, 18]);
    const REWARD_ICONS = nums(P.rewardIcons, [8, 229, 232, 235, 230, 233, 236, 231, 234, 237]);
    const DELIVERY_ICONS = nums(P.deliveryIcons, [145, 158, 164, 165, 166, 167, 144, 148, 159, 168]);
    const WLH = 24;
    const rand = (n) => { n = Math.abs(Math.trunc(n)); return n === 0 ? 0 : Math.floor(Math.random() * n); };
    const at = (list, i) => (i < 0 ? list[list.length + i] : list[i]);
    /** Ruby's == on the lists' entries (arrays, strings, numbers). */
    const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
    /** Array#delete: every entry equal to `value` goes. */
    const remove = (list, value) => { for (let i = list.length - 1; i >= 0; i--) if (same(list[i], value)) list.splice(i, 1); };

    // ---- Game_System -----------------------------------------------------------------------------------
    const LISTS = {
        AcceptedJobs: () => [], Jobs: () => [], Deck: () => [], Hand1: () => [], Hand2: () => [], WeaponList: () => [], ArmorList: () => [],
        WeaponTypes: () => [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5], ArmorTypes: () => [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3],
        Tutorials: () => [false, false, false, false, false, false, false, false, false]
    };
    for (const [name, initial] of Object.entries(LISTS)) {
        Game_System.prototype['rr' + name] = function() {
            const field = '_rr' + name;
            if (!Array.isArray(this[field])) this[field] = initial();
            return this[field];
        };
    }
    /** `$game_system.deck = [...]` and the like: an event sets one of the lists. */
    Game_System.prototype.rrSetList = function(name, value) {
        if (LISTS[name]) this['_rr' + name] = Array.isArray(value) ? value : value == null ? null : [value];
        return value;
    };
    const _systemInit = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _systemInit.call(this);
        for (const [name, initial] of Object.entries(LISTS)) this['_rr' + name] = initial();
        this._rrTimeCheck = 0;
        this._rrValidator = 0;
    };
    Game_System.prototype.rrValidator = function() { return this._rrValidator ?? 0; };
    Game_System.prototype.rrTimeCheck = function() { return this._rrTimeCheck ?? 0; };

    /** job_detail(x): a job's title or description, a location's name (with a trailing space), "3F" for floor 403. */
    Game_System.prototype.rrJobDetail = function(x) {
        for (const [from, to, text] of DETAILS) {
            if (x >= from && x <= to) return text === null ? String(x - from + 1) + 'F' : text;
        }
        return '';
    };
    /** generate_jobs: up to `iterations` repeatable jobs for the board, in the first `locations` dungeons. */
    Game_System.prototype.rrGenerateJobs = function(iterations, locations) {
        if (locations > 3) locations -= 2;   // fewer arenas and story places
        const accepted = this.rrAcceptedJobs();
        this._rrJobs = [];
        const jobs = this._rrJobs;
        const dungeonId = [1, 2, 3, 4];
        for (let n = 1; n <= iterations; n++) {
            let type = rand(4) + 201;
            if (type === 204) type = rand(10) + 204;   // a delivery
            let destination = 0;
            for (let tries = 1; tries <= 10; tries++) {
                destination = dungeonId[rand(locations)] + 300;
                let total = 0;
                for (const j of accepted) if (j[1] === destination) total++;
                for (const j of jobs) if (j[1] === destination) total++;
                if (total < MAX_FLOORS[destination - 301]) break;
                destination = 0;
            }
            if (destination === 0 || Number.isNaN(destination)) continue;
            let floor = 0, valid = false;
            for (let tries = 1; tries <= 10; tries++) {
                floor = rand(MAX_FLOORS[destination - 301]) + 401;
                valid = !accepted.some(j => j[2] === floor && j[1] === destination) && !jobs.some(j => j[2] === floor && j[1] === destination);
                if (valid) break;
            }
            if (!valid) continue;
            const r = rand(20);
            const reward = r <= 1 ? REWARD_ICONS[rand(3) + 7] : r <= 6 ? REWARD_ICONS[rand(3) + 4] : REWARD_ICONS[rand(4)];
            const members = $gameParty.members();
            const partyLevel = members.length ? Math.floor(members.reduce((s, m) => s + m.level, 0) / members.length) : 0;
            const level = Math.min(DUNGEON_LEVELS[destination - 301], partyLevel);
            jobs.push([type, destination, floor, reward, level, false]);
        }
    };
    /** check_floor(dungeon): an uncleared accepted job on this floor ($game_variables[16]) of this dungeon. */
    Game_System.prototype.rrCheckFloor = function(dungeon) {
        return this.rrAcceptedJobs().some(j => dungeon === j[1] && j[2] - 400 === $gameVariables.value(16) && !j[5]);
    };
    /** get_job_index(dungeon): that job's place in the accepted list (0 when there is none, as in the original). */
    Game_System.prototype.rrGetJobIndex = function(dungeon) {
        const i = this.rrAcceptedJobs().findIndex(j => dungeon === j[1] && j[2] - 400 === $gameVariables.value(16) && !j[5]);
        return i < 0 ? 0 : i;
    };
    Game_System.prototype.rrCheckCleared = function() { return this.rrAcceptedJobs().some(j => j[5]); };
    Game_System.prototype.rrGetClearedIndex = function() {
        const i = this.rrAcceptedJobs().findIndex(j => j[5]);
        return i < 0 ? 0 : i;
    };

    // ---- windows ------------------------------------------------------------------------------------
    const vx = {
        normal(w) { return w.rrVxNormalColor ? w.rrVxNormalColor() : ColorManager.normalColor(); },
        system(w) { return w.rrVxSystemColor ? w.rrVxSystemColor() : ColorManager.systemColor(); },
        text(w, x, y, width, height, text, align = 0) {
            if (w.rrVxDrawText) w.rrVxDrawText(x, y, width, height, text, align);
            else w.contents.drawText(String(text), x, y, width, height, ['left', 'center', 'right'][align] || 'left');
        },
        icon(w, index, x, y, enabled = true) { if (w.rrVxDrawIcon) w.rrVxDrawIcon(index, x, y, enabled); else w.drawIcon(index, x, y); }
    };
    const detail = (x) => $gameSystem.rrJobDetail(x);
    const vxWindow = (proto) => {
        proto.updatePadding = function() { this.padding = 16; };
        proto.lineHeight = function() { return WLH; };
    };

    /** A list of jobs: the board's (x 0) or the accepted ones (x 304). */
    function Window_RRThrallJobBoard() { this.initialize(...arguments); }
    Window_RRThrallJobBoard.prototype = Object.create(Window_Selectable.prototype);
    Window_RRThrallJobBoard.prototype.constructor = Window_RRThrallJobBoard;
    vxWindow(Window_RRThrallJobBoard.prototype);
    Window_RRThrallJobBoard.prototype.itemHeight = function() { return WLH; };
    Window_RRThrallJobBoard.prototype.cursorPagedown = function() {};
    Window_RRThrallJobBoard.prototype.cursorPageup = function() {};
    Window_RRThrallJobBoard.prototype.initialize = function(x, active) {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(x, 56, 304, 320));
        this._data = [];
        this._accepted = false;
        if (active) { this.select(0); this.activate(); } else { this.deselect(); this.deactivate(); }
    };
    Window_RRThrallJobBoard.prototype.maxItems = function() { return this._data.length; };
    Window_RRThrallJobBoard.prototype.setData = function(jobs, accepted) {
        this._data = jobs.slice();
        this._accepted = !!accepted;
        this.refresh();
    };
    Window_RRThrallJobBoard.prototype.drawItem = function(index) {
        const job = this._data[index];
        if (!job) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.changeTextColor(vx.normal(this));
        let text;
        if (job[0] < 101) { vx.icon(this, 227, rect.x, rect.y); text = 'Story Mission'; }
        else if (job[0] < 201) { vx.icon(this, 228, rect.x, rect.y); text = 'Side Mission'; }
        else {
            vx.icon(this, this._accepted ? 225 : 224, rect.x, rect.y);
            text = detail(job[0] + 300) + ' - ' + detail(job[1]);
        }
        vx.text(this, rect.x + 24, rect.y, rect.width, 24, text);
    };

    /** The selected job: title, description, location and floor, reward and level. */
    function Window_RRThrallJobDetails() { this.initialize(...arguments); }
    Window_RRThrallJobDetails.prototype = Object.create(Window_Base.prototype);
    Window_RRThrallJobDetails.prototype.constructor = Window_RRThrallJobDetails;
    vxWindow(Window_RRThrallJobDetails.prototype);
    Window_RRThrallJobDetails.prototype.initialize = function() {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 376, 608, 104));
    };
    /** refresh(index, jobs, wind): `wind` 0 the board's job, otherwise an accepted one. */
    Window_RRThrallJobDetails.prototype.refresh = function(index, jobs, wind) {
        this.contents.clear();
        const job = at(jobs, index);
        if (!jobs.length || !job) return;
        const width = this.contents.width;
        const label = (x, y, text) => { this.changeTextColor(vx.system(this)); vx.text(this, x, y, width, 24, text); return this.textWidth(text); };
        if (job[0] < 101) {
            vx.icon(this, 227, 0, 0);
            this.changeTextColor(vx.normal(this));
            vx.text(this, 24, 0, width, 24, detail(job[0]));
            vx.text(this, 0, WLH, width, 24, 'Story Mission');
            return;
        }
        let text;
        if (job[0] < 201) { vx.icon(this, 228, 0, 0); text = detail(job[0]); }
        else { vx.icon(this, wind === 0 ? 224 : 225, 0, 0); text = detail(job[0] + 300); }
        this.changeTextColor(vx.normal(this));
        vx.text(this, 24, 0, width, 24, text);
        let x = label(0, WLH, 'Description: ');
        this.changeTextColor(vx.normal(this));
        text = detail(job[0]);
        vx.text(this, x, WLH, width, 24, text);
        if (job[0] >= 204 && job[0] <= 213) vx.icon(this, DELIVERY_ICONS[job[0] - 204], x + this.textWidth(text), WLH);
        x = label(0, WLH * 2, 'Location: ');
        this.changeTextColor(vx.normal(this));
        text = detail(job[1]);
        if (job[2] > 0) text += detail(job[2]);
        vx.text(this, x, WLH * 2, width, 24, text);
        this.changeTextColor(vx.system(this));
        vx.text(this, 288, WLH * 2, 144, 24, 'Reward: ');
        vx.icon(this, job[3], this.textWidth('Reward: ') + 288, WLH * 2);
        if (job[4] > 0) {
            this.changeTextColor(vx.system(this));
            vx.text(this, 432, WLH * 2, 144, 24, 'Level: ');
            this.changeTextColor(vx.normal(this));
            vx.text(this, this.textWidth('Level: ') + 432, WLH * 2, width, 24, String(job[4]));
        }
    };

    /** "Job Board" over the board, "Accepted Jobs n/7" over the accepted list. */
    function Window_RRThrallJobLabel() { this.initialize(...arguments); }
    Window_RRThrallJobLabel.prototype = Object.create(Window_Base.prototype);
    Window_RRThrallJobLabel.prototype.constructor = Window_RRThrallJobLabel;
    vxWindow(Window_RRThrallJobLabel.prototype);
    Window_RRThrallJobLabel.prototype.initialize = function(x, type) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, 0, 304, 56));
        this.refresh(type);
    };
    Window_RRThrallJobLabel.prototype.refresh = function(type) {
        this.contents.clear();
        this.changeTextColor(vx.normal(this));
        vx.text(this, 0, 0, 272, 24, type === 0 ? 'Job Board' : `Accepted Jobs ${$gameSystem.rrAcceptedJobs().length}/7`, 1);
    };

    // ---- Scene_JobBoard ---------------------------------------------------------------------------------
    const trig = (i) => (Input.rrGamepadTriggered ? Input.rrGamepadTriggered(i) : Input.isTriggered(['shift', 'escape', 'ok', 'pageup', 'pagedown', 'rgssX', 'rgssY', 'rgssZ', 'up', 'left', 'down', 'right'][i]));
    const CANCEL = 1, CONFIRM = 2, LEFT = 9, RIGHT = 11;
    const setIndex = (win, i) => { win.select(i); if (i >= 0 && win.maxItems() > 0) win.ensureCursorVisible(false); };

    function Scene_RRThrallJobBoard() { this.initialize(...arguments); }
    Scene_RRThrallJobBoard.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallJobBoard.prototype.constructor = Scene_RRThrallJobBoard;
    Scene_RRThrallJobBoard.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._jobWindow = new Window_RRThrallJobBoard(0, true);
        this._acceptedWindow = new Window_RRThrallJobBoard(304, false);
        this._detailsWindow = new Window_RRThrallJobDetails();
        this._jobLabelWindow = new Window_RRThrallJobLabel(0, 0);
        this._acceptLabelWindow = new Window_RRThrallJobLabel(304, 1);
        for (const w of [this._jobWindow, this._acceptedWindow, this._detailsWindow, this._jobLabelWindow, this._acceptLabelWindow]) this.addWindow(w);
        this._lastIndex = 0;
        this._tempIndex = 0;
        this.refreshJobs();
        this.refreshAccepted();
        this._jobWindow.setData(this._jobs, false);
        this._acceptedWindow.setData(this._accepted, true);
        this._detailsWindow.refresh(0, this._jobs, 0);
    };
    Scene_RRThrallJobBoard.prototype.refreshJobs = function() { this._jobs = $gameSystem.rrJobs().slice(); };
    Scene_RRThrallJobBoard.prototype.refreshAccepted = function() { this._accepted = $gameSystem.rrAcceptedJobs().slice(); };
    Scene_RRThrallJobBoard.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const board = this._jobWindow, mine = this._acceptedWindow;
        if (this._lastIndex !== board.index() && board.index() >= 0) {
            this._lastIndex = board.index();
            this._detailsWindow.refresh(board.index(), this._jobs, 0);
        } else if (this._lastIndex !== mine.index() && mine.index() >= 0) {
            this._lastIndex = mine.index();
            this._detailsWindow.refresh(mine.index(), this._accepted, 1);
        }
        if (trig(CANCEL)) {
            SoundManager.playCancel();
            this.returnScene();
        } else if (trig(CONFIRM) && board.index() >= 0) {
            // Take the job.
            if (this._accepted.length < 7 && this._jobs.length) {
                const job = this._jobs[board.index()];
                $gameSystem.rrAcceptedJobs().push(job);
                remove($gameSystem.rrJobs(), job);
                this.refreshJobs();
                this.refreshAccepted();
                mine.setData(this._accepted, true);
                if (board.index() > this._jobs.length - 1) setIndex(board, board.index() - 1);
                if (board.index() < 0) setIndex(board, 0);
                board.setData(this._jobs, false);
                this._detailsWindow.refresh(board.index(), this._jobs, 0);
                this._acceptLabelWindow.refresh(1);
                SoundManager.playOk();
            } else SoundManager.playBuzzer();
        } else if (trig(CONFIRM) && mine.index() >= 0) {
            // Put a repeatable job back on the board (story and side missions stay).
            const job = this._accepted.length ? this._accepted[mine.index()] : null;
            if (job && job[0] >= 200) {
                $gameSystem.rrJobs().push(job);
                remove($gameSystem.rrAcceptedJobs(), job);
                this.refreshJobs();
                this.refreshAccepted();
                board.setData(this._jobs, false);
                if (mine.index() > this._accepted.length - 1) setIndex(mine, mine.index() - 1);
                if (mine.index() < 0) setIndex(mine, 0);
                mine.setData(this._accepted, true);
                this._detailsWindow.refresh(mine.index(), this._accepted, 0);
                this._acceptLabelWindow.refresh(1);
                SoundManager.playOk();
            } else SoundManager.playBuzzer();
        } else if (trig(RIGHT)) {
            if (board.index() >= 0) {
                const temp = board.index();
                board.deselect();
                board.deactivate();
                setIndex(mine, this._tempIndex);
                this._tempIndex = temp;
                mine.activate();
                this._detailsWindow.refresh(mine.index(), this._accepted, 1);
                SoundManager.playCursor();
            }
        } else if (trig(LEFT)) {
            if (mine.index() >= 0) {
                const temp = mine.index();
                mine.deselect();
                mine.deactivate();
                setIndex(board, this._tempIndex);
                this._tempIndex = temp;
                board.activate();
                this._detailsWindow.refresh(board.index(), this._jobs, 0);
                SoundManager.playCursor();
            }
        }
    };
    /** $scene = Scene_Map.new. */
    Scene_RRThrallJobBoard.prototype.returnScene = function() {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };

    Object.assign(window, { Scene_RRThrallJobBoard, Window_RRThrallJobBoard, Window_RRThrallJobDetails, Window_RRThrallJobLabel });
})();
