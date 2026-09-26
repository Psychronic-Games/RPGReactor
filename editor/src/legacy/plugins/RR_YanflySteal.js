/*:
 * @target MZ
 * @plugindesc Steal Items (VX Ace), for imported games
 * @author Yanfly (popup add-on by the game's author); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflySteal.js
 *
 * Skills and items that steal from enemies. An enemy carries what can be
 * taken from it in its note, each with its chance:
 *   <steal I3: 50%>  <steal W4: 10%>  <steal A2: 5%>  <steal G100: 50%>
 * (item, weapon, armor, or that much gold), and <steal rate: +x%> to make
 * it easier or harder. A skill or item with <steal> takes the first thing on
 * the list whose roll succeeds; <steal item>, <steal weapon>, <steal armour>,
 * <steal gold> limit it to those kinds (repeatable), and "<steal type: +x%>"
 * adds to that kind's chance. <snatch> (and <snatch type>) first opens a
 * list of what the chosen enemy carries, two to a row with each one's
 * chance, and tries for the one picked.
 *
 * The chance of each is its own rate, plus the skill's, plus the thief's
 * luck bonus (the game's formula), plus the thief's actor, class, equipment
 * and states' <steal rate: +x%> and <steal kind rate: +x%>, plus the
 * enemy's own, held between the game's minimum and maximum. A stolen weapon
 * or armor lowers the enemy's parameters by the piece's. Each thing can be
 * taken once per battle. A miss steals nothing.
 *
 * After each steal the battle log names the result (a sound plays for what
 * was taken) and the Skill Display line shows "Stole <name>", "Steal failed"
 * or "Nothing to steal". As in the game, taking the enemy's last thing shows
 * "Nothing to steal", since the line is chosen after the thing has gone.
 * "<steal: +x%>" with a bonus is not read as a steal (the original's patterns
 * never matched it); plain <steal> is.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param failText
 * @default %s couldn't steal an item.
 * @param successText
 * @default %s steals \c[17]%s\c[0] from %s!
 * @param emptyText
 * @default %s has nothing left to steal.
 * @param rateText
 * @default %1.2f%%
 * @param rateSize
 * @type number
 * @default 18
 * @param sounds
 * @type multiline_string
 * @default {"1":{"name":"Item3","volume":100,"pitch":100},"2":{"name":"Equip1","volume":100,"pitch":100},"3":{"name":"Equip2","volume":100,"pitch":100},"4":{"name":"Shop","volume":100,"pitch":100}}
 * @desc JSON: kind (1 item, 2 weapon, 3 armor, 4 gold) → sound.
 * @param maxRate
 * @default 0.9999
 * @param minRate
 * @default 0.0001
 * @param bonusRate
 * @text Luck bonus formula
 * @default ((a.luk / (512 + a.luk)) * 0.3333)
 * @desc JavaScript; a is the thief, b the enemy.
 * @param lowerStats
 * @type boolean
 * @default true
 * @param goldIcon
 * @type number
 * @default 0
 * @param goldDescription
 * @default
 * @param nothingDescription
 * @default
 * @param popups
 * @text Skill Display lines
 * @type boolean
 * @default false
 * @param defaultFontSize
 * @text The game's default font size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflySteal');
    const json = (t, d) => { try { return JSON.parse(t) ?? d; } catch (_) { return d; } };
    const num = (key, d) => (params[key] === undefined || params[key] === '' ? d : Number(params[key]));
    const str = (key, d) => (params[key] === undefined ? d : String(params[key]));
    const FAIL = str('failText', "%s couldn't steal an item."), SUCCESS = str('successText', '%s steals \\c[17]%s\\c[0] from %s!');
    const EMPTY = str('emptyText', '%s has nothing left to steal.');
    const RATE_TEXT = str('rateText', '%1.2f%%'), RATE_SIZE = num('rateSize', 18);
    const SOUNDS = json(params.sounds || '', {});
    const MAX_RATE = num('maxRate', 0.9999), MIN_RATE = num('minRate', 0.0001);
    const LOWER_STATS = params.lowerStats !== 'false';
    const GOLD_ICON = num('goldIcon', 0);
    const GOLD_DESCRIPTION = str('goldDescription', ''), NOTHING_DESCRIPTION = str('nothingDescription', '');
    const POPUPS = params.popups === 'true';
    const BASE_SIZE = num('defaultFontSize', 24) || 24;
    let bonusRate;
    try { bonusRate = new Function('a', 'b', 'item', 'return (' + (params.bonusRate || '0') + ');'); } catch (_) { bonusRate = () => 0; }
    const group = (w, v) => (w && w.rrAceGroup ? w.rrAceGroup(v) : String(v));
    const sprintf = (fmt, ...args) => {
        let i = 0;
        return String(fmt).replace(/%%|%(\d*)\.?(\d*)([sdf])/g, (m, w, p, t) => {
            if (m === '%%') return '%';
            const v = args[i++];
            let s = t === 'f' ? Number(v).toFixed(p === '' ? 6 : Number(p)) : t === 'd' ? String(Math.trunc(Number(v))) : String(v);
            if (w) s = s.padStart(Number(w), ' ');
            return s;
        });
    };

    //-------------------------------------------------------------------------
    // Notes
    //-------------------------------------------------------------------------
    const KIND = { ITEM: 1, ITEMS: 1, WEAPON: 2, WEAPONS: 2, ARMOUR: 3, ARMOURS: 3, ARMOR: 3, ARMORS: 3, GOLD: 4 };
    const RE = {
        rate: /<(?:STEAL_RATE|steal rate):[ ]([+-]\d+)([%％])>/i,
        kindRate: /<(?:STEAL|steal)[ ](.*)[ ](?:RATE|rate):[ ]([+-]\d+)([%％])>/i,
        useKindRate: /<(.*)[ ](.*):[ ]([+-]\d+)([%％])>/i, useKind: /<(.*)[ ](.*)>/i,
        useBlindRate: /<(.*):[ ]([+-]\d+)([%％])>/i, useBlind: /<(.*)>/i,
        enemyItem: /<(?:STEAL|steal)[ ]([IWAG])(\d+):[ ](\d+)([%％])>/i
    };
    const cache = new WeakMap();
    /** Steal rates of an actor, class, weapon, armor or state: [all, item, weapon, armor, gold]. */
    const baseNotes = (obj) => {
        const rate = [0, 0, 0, 0, 0];
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            let m;
            if ((m = RE.rate.exec(line))) rate[0] = Number(m[1]) * 0.01;
            else if ((m = RE.kindRate.exec(line))) {
                const k = KIND[m[1].toUpperCase()];
                if (k) rate[k] = Number(m[2]) * 0.01;
            }
        }
        return { rate };
    };
    // Each line takes the first pattern that matches; a line whose tag is not steal or snatch ends there.
    const usableNotes = (obj) => {
        const out = { type: null, rate: [0, 0, 0, 0, 0], kinds: [] };
        const typeOf = (s) => ({ STEAL: 'steal', SNATCH: 'snatch' })[s.toUpperCase()] || null;
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            let m, t;
            if ((m = RE.useKindRate.exec(line))) {
                if (!(t = typeOf(m[1]))) continue;
                out.type = t;
                const k = KIND[m[2].toUpperCase()];
                if (k) { out.kinds.push(k); out.rate[k] += Number(m[3]) * 0.01; }
            } else if ((m = RE.useKind.exec(line))) {
                if (!(t = typeOf(m[1]))) continue;
                out.type = t;
                const k = KIND[m[2].toUpperCase()];
                if (k) out.kinds.push(k);
            } else if ((m = RE.useBlindRate.exec(line))) {
                if (!(t = typeOf(m[1]))) continue;
                out.type = t;
                out.rate[0] += Number(m[2]) * 0.01;
                out.kinds = [1, 2, 3, 4];
            } else if ((m = RE.useBlind.exec(line))) {
                if (!(t = typeOf(m[1]))) continue;
                out.type = t;
                out.kinds = [1, 2, 3, 4];
            }
        }
        return out;
    };
    const enemyNotes = (obj) => {
        const out = { items: [], rate: 0 };
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            let m;
            if ((m = RE.enemyItem.exec(line))) {
                const kind = { I: 1, W: 2, A: 3, G: 4 }[m[1].toUpperCase()];
                out.items.push({ kind, dataId: Number(m[2]), rate: Number(m[3]) * 0.01 });
            } else if ((m = RE.rate.exec(line))) out.rate = Number(m[1]) * 0.01;
        }
        return out;
    };
    /** The steal settings of a database object, by what it is. */
    const notes = (obj) => {
        if (!obj || typeof obj !== 'object') return { rate: [0, 0, 0, 0, 0], type: null, kinds: [], items: [] };
        let out = cache.get(obj);
        if (out) return out;
        if ($dataEnemies[obj.id] === obj) out = enemyNotes(obj);
        else if (DataManager.isSkill(obj) || DataManager.isItem(obj)) out = usableNotes(obj);
        else out = baseNotes(obj);
        cache.set(obj, out);
        return out;
    };
    const stealType = (item) => (item ? notes(item).type : null);
    const objectOf = (s) => (s.kind === 1 ? $dataItems : s.kind === 2 ? $dataWeapons : s.kind === 3 ? $dataArmors : [])[s.dataId] || null;
    window.RRYanflySteal = { notes, stealType, objectOf, goldIcon: GOLD_ICON };

    //-------------------------------------------------------------------------
    // Battlers: what an enemy still carries, the chance, the steal
    //-------------------------------------------------------------------------
    // The result's stolen thing is cleared with the hit flags.
    const _clearHitFlags = Game_ActionResult.prototype.clearHitFlags;
    Game_ActionResult.prototype.clearHitFlags = function() {
        _clearHitFlags.call(this);
        this.rrStolenItem = null;
    };

    const BB = Game_BattlerBase.prototype;
    BB.rrStealableItems = function() {
        if (!this._rrStealableItems) this._rrStealableItems = [];
        return this._rrStealableItems;
    };
    BB.rrRemoveStealableItem = function(s) {
        const list = this.rrStealableItems(), i = list.indexOf(s);
        if (i >= 0) list.splice(i, 1);
    };
    // An enemy starts each battle with its note's list; the entries are the list's own, compared by identity.
    const _enemySetup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _enemySetup.call(this, enemyId, x, y);
        this._rrStealableItems = notes(this.enemy()).items.slice();
    };

    const B = Game_Battler.prototype;
    B.rrBonusStealRate = function(kind) {
        let n = 0;
        if (this.isActor()) {
            n += notes(this.actor()).rate[kind] + notes(this.currentClass()).rate[kind];
            for (const e of this.equips()) if (e) n += notes(e).rate[kind];
        }
        for (const s of this.states()) if (s) n += notes(s).rate[kind];
        return n;
    };
    /** The chance of `user` taking `s` from this enemy with `item`, between the minimum and maximum. */
    B.rrCalcStealRatio = function(user, item, s) {
        const k = notes(item);
        let rate = s.rate + k.rate[0] + k.rate[s.kind];
        rate += Number(bonusRate(user, this, item)) || 0;
        rate += user.rrBonusStealRate(0) + user.rrBonusStealRate(s.kind);
        rate += this.isEnemy() ? notes(this.enemy()).rate : 0;
        return Math.max(Math.min(MAX_RATE, rate), MIN_RATE);
    };
    B.rrExecuteStealEffect = function(user, item) {
        if (this.isActor() || this.isActor() === user.isActor()) return;
        const type = stealType(item);
        if (!type || !this.rrStealableItems().length) return;
        if (type === 'steal') this.rrApplyStealEffect(user, item);
        if (type === 'snatch') this.rrApplySnatchEffect(user, item);
        this.rrLowerStatsStealEffect();
    };
    B.rrApplyStealEffect = function(user, item) {
        const kinds = notes(item).kinds;
        for (const s of this.rrStealableItems()) {
            if (!kinds.includes(s.kind)) continue;
            if (!(Math.random() < this.rrCalcStealRatio(user, item, s))) continue;
            this._result.rrStolenItem = s;
            this._result.success = true;
            break;
        }
    };
    B.rrApplySnatchEffect = function(user, item) {
        const s = $gameTemp.rrSnatchTarget(user);
        if (!this.rrStealableItems().includes(s)) return;
        if (Math.random() < this.rrCalcStealRatio(user, item, s)) {
            this._result.rrStolenItem = s;
            this._result.success = true;
        }
    };
    B.rrLowerStatsStealEffect = function() {
        const s = this._result.rrStolenItem;
        if (!LOWER_STATS || !s || (s.kind !== 2 && s.kind !== 3)) return;
        const piece = objectOf(s);
        if (!piece) return;
        for (let i = 0; i < 8; i++) this.addParam(i, -piece.params[i]);
    };

    Game_Temp.prototype.rrSnatchTarget = function(battler) { return this._rrSnatch ? this._rrSnatch.get(battler) : undefined; };
    Game_Temp.prototype.rrSetSnatchTarget = function(battler, s) {
        if (!this._rrSnatch) this._rrSnatch = new Map();
        this._rrSnatch.set(battler, s);
    };

    // The steal is tried on each hit, after the user's own gains.
    const _applyItemUserEffect = Game_Action.prototype.applyItemUserEffect;
    Game_Action.prototype.applyItemUserEffect = function(target) {
        _applyItemUserEffect.call(this, target);
        target.rrExecuteStealEffect(this.subject(), this.item());
    };

    //-------------------------------------------------------------------------
    // After each target's results: the log line, the sound and the gain, then the Skill Display line
    //-------------------------------------------------------------------------
    Window_BattleLog.prototype.rrBackOne = function() {
        this._lines.pop();
        this.refresh();
    };
    Window_BattleLog.prototype.rrPlaySe = function(se) { if (se && se.name) AudioManager.playSe(se); };

    /** Takes the stolen thing: off the enemy's list, into the party. Returns its log text. */
    BattleManager.rrStolenItemText = function(target) {
        const s = target.result().rrStolenItem;
        target.rrRemoveStealableItem(s);
        const se = SOUNDS[s.kind];
        if (se) this._logWindow.push('rrPlaySe', { name: String(se.name || ''), volume: Number(se.volume ?? 100), pitch: Number(se.pitch ?? 100), pan: 0 });
        if (s.kind === 4) {
            $gameParty.gainGold(s.dataId);
            return '\\i[' + GOLD_ICON + ']' + group(this._logWindow, s.dataId) + TextManager.currencyUnit;
        }
        const item = objectOf(s);
        if (!item) return '';
        $gameParty.gainItem(item, 1);
        return '\\i[' + item.iconIndex + ']' + item.name;
    };
    BattleManager.rrApplyStealResults = function(target, item) {
        if (!target || target.isActor() || !stealType(item)) return;
        const log = this._logWindow;
        let text;
        if (!target.rrStealableItems().length) text = sprintf(EMPTY, target.name());
        else if (!target.result().rrStolenItem) text = sprintf(FAIL, this._subject.name());
        else text = sprintf(SUCCESS, this._subject.name(), this.rrStolenItemText(target), target.name());
        log.push('addText', text);
        for (let i = 0; i < 3; i++) log.push('wait');
        log.push('rrBackOne');
        if (POPUPS) this.rrShowStealPopup(target);
    };
    /** The Skill Display line, chosen after the thing was taken. */
    BattleManager.rrShowStealPopup = function(target) {
        const log = this._logWindow;
        if (!log.rrAddPopLine) return;
        const stolen = target.result().rrStolenItem;
        if (!target.rrStealableItems().length) log.push('rrAddPopLine', 'Nothing to steal');
        else if (!stolen) log.push('rrAddPopLine', 'Steal failed');
        else if (stolen.kind === 4) log.push('rrAddPopArray', GOLD_ICON, 'Stole ' + stolen.dataId + ' ' + TextManager.currencyUnit);
        else {
            const obj = objectOf(stolen);
            if (obj) log.push('rrAddPopArray', obj.iconIndex, 'Stole ' + obj.name);
        }
        log.push('wait');
    };

    // Where the scene applied an item's effects to a target: each hit target (or its substitute), and the
    // user when a spell is reflected.
    const _applySubstitute = BattleManager.applySubstitute;
    BattleManager.applySubstitute = function(target) {
        const real = _applySubstitute.call(this, target);
        this._rrStealTarget = real;
        return real;
    };
    const _invokeNormalAction = BattleManager.invokeNormalAction;
    BattleManager.invokeNormalAction = function(subject, target) {
        this._rrStealTarget = target;
        _invokeNormalAction.call(this, subject, target);
        this.rrApplyStealResults(this._rrStealTarget, this._action.item());
    };
    const _invokeMagicReflection = BattleManager.invokeMagicReflection;
    BattleManager.invokeMagicReflection = function(subject, target) {
        _invokeMagicReflection.call(this, subject, target);
        this.rrApplyStealResults(subject, this._action.item());
    };

    //-------------------------------------------------------------------------
    // Snatch: the list of what the chosen enemy carries, along the bottom
    //-------------------------------------------------------------------------
    function Window_RRStealList() { this.initialize(...arguments); }
    Window_RRStealList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRStealList.prototype.constructor = Window_RRStealList;
    Window_RRStealList.prototype.initialize = function(enemyWindow) {
        const wh = this.fittingHeight(4);
        Window_Selectable.prototype.initialize.call(this, new Rectangle(0, Graphics.boxHeight - wh, Graphics.boxWidth, wh));
        this._enemyWindow = enemyWindow;
        this._enemy = null;
        this._data = null;
        this.deactivate();
        this.hide();
    };
    Window_RRStealList.prototype.fittingHeight = function(n) { return n * this.lineHeight() + $gameSystem.windowPadding() * 2; };
    Window_RRStealList.prototype.maxCols = function() { return 2; };
    Window_RRStealList.prototype.maxItems = function() { return this._data ? this._data.length : 1; };
    Window_RRStealList.prototype.item = function() { return this._data ? this._data[this.index()] : undefined; };
    Window_RRStealList.prototype.isCurrentItemEnabled = function() { return !!this.item(); };
    Window_RRStealList.prototype.drawItemBackground = function() {};
    Window_RRStealList.prototype.stealSkill = function() { return $gameTemp._rrStealSkill; };
    Window_RRStealList.prototype.refresh = function() {
        this._enemy = this._enemyWindow.enemy();
        const kinds = notes(this.stealSkill()).kinds;
        this._data = this._enemy.rrStealableItems().filter(s => kinds.includes(s.kind));
        Window_Selectable.prototype.refresh.call(this);
        this.show();
        this.activate();
        this.select(0);
    };
    Window_RRStealList.prototype.drawItem = function(index) {
        const s = this._data && this._data[index];
        if (!s) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.resetFontSettings();
        if (s.kind === 4) {
            this.drawIcon(GOLD_ICON, rect.x, rect.y);
            this.drawText(group(this, s.dataId) + TextManager.currencyUnit, rect.x + 24, rect.y, rect.width - 24);
        } else {
            this.rrAceDrawItemName(objectOf(s), rect.x, rect.y, true, rect.width - 24);
        }
        const rate = this._enemy.rrCalcStealRatio(BattleManager.actor(), this.stealSkill(), s);
        this.contents.fontSize = Math.round($gameSystem.mainFontSize() * RATE_SIZE / BASE_SIZE);
        this.drawText(sprintf(RATE_TEXT, rate * 100), rect.x, rect.y, rect.width, 'right');
    };
    Window_RRStealList.prototype.updateHelp = function() {
        const s = this.item();
        if (!this._data || !s) { this._helpWindow.setText(NOTHING_DESCRIPTION); return; }
        if (s.kind === 4) this._helpWindow.setText(GOLD_DESCRIPTION);
        else this._helpWindow.setText(objectOf(s) ? objectOf(s).description : '');
    };
    window.Window_RRStealList = Window_RRStealList;

    const S = Scene_Battle.prototype;
    const _createAllWindows = S.createAllWindows;
    S.createAllWindows = function() {
        _createAllWindows.call(this);
        this._rrStealListWindow = new Window_RRStealList(this._enemyWindow);
        this._rrStealListWindow.setHelpWindow(this._helpWindow);
        this._rrStealListWindow.setHandler('ok', this.rrOnStealOk.bind(this));
        this._rrStealListWindow.setHandler('cancel', this.rrOnStealCancel.bind(this));
        this.addWindow(this._rrStealListWindow);
    };
    /** Whether the skill or item being aimed is a snatch at one enemy (Attack and Guard never are). */
    S.rrShowStealWindow = function() {
        const symbol = this._actorCommandWindow.currentSymbol();
        const action = BattleManager.inputtingAction();
        if (!action || !['skill', 'item'].includes(symbol)) return false;
        const item = action.item();
        $gameTemp._rrStealSkill = item;
        if (!item || action.isForFriend() || !action.needsSelection()) return false;
        return stealType(item) === 'snatch';
    };
    const _onEnemyOk = S.onEnemyOk;
    S.onEnemyOk = function() {
        if (this.rrShowStealWindow()) this.rrActivateStealWindow();
        else _onEnemyOk.call(this);
    };
    // The list takes the place of the lists and the enemy window, under the help; they come back as they were.
    const hidden = (scene) => [scene._skillWindow, scene._itemWindow, scene._enemyWindow, scene._statusAidWindow].filter(Boolean);
    S.rrActivateStealWindow = function() {
        this._rrStealShown = hidden(this).map(w => [w, w.visible]);
        for (const w of hidden(this)) w.hide();
        this._rrStealHelpShown = this._helpWindow.visible;
        this._helpWindow.show();
        this._rrStealListWindow.refresh();
    };
    S.rrShowHiddenStealWindows = function() {
        this._rrStealListWindow.hide();
        this._rrStealListWindow.deactivate();
        for (const [w, visible] of this._rrStealShown || []) w.visible = visible;
        if (this._rrStealHelpShown === false) this._helpWindow.hide();
    };
    S.rrOnStealOk = function() {
        $gameTemp.rrSetSnatchTarget(BattleManager.actor(), this._rrStealListWindow.item());
        this.rrShowHiddenStealWindows();
        _onEnemyOk.call(this);
    };
    S.rrOnStealCancel = function() {
        this.rrShowHiddenStealWindows();
        this._enemyWindow.show();
        this._enemyWindow.activate();
    };
})();
