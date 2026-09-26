/*:
 * @target MZ
 * @plugindesc Ace Equip Engine (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyEquipEngine.js
 *
 * The equipment screen: the commands (Equip, Optimize, Remove All and the
 * game's own) in a column at the top left, the actor's face and status
 * beside them, and below, the equipment slots on the left (the list of
 * items for a slot takes their place) and every parameter on the right,
 * current → new while an item is chosen. The command last chosen is
 * selected again when the screen next opens.
 *
 * Actors and classes set their own slots in the note:
 *   <equip slots>            one slot per line: weapon, shield, head, body,
 *   weapon                   accessory (or armor, armour, etc, other), a type
 *   equip type: 3            name from the settings, or "equip type: n"
 *   </equip slots>
 * An actor's slots come before its class's, a class's before the default.
 * "equip type: n" of one of the first five types makes two slots of it, as
 * the original did. With dual wield the second slot holds a weapon.
 *   <starting gear: n, n>     armors the actor starts with (actors)
 *   <fixed equip: n, n>       those types cannot be changed
 *   <sealed equip: n, n>      nothing can be put on those types
 *                             (actors, classes, weapons, armors, states)
 *   <equip type: n> or <equip type: name>   the armor's type (armors)
 * Note tags number the types as the original did, from 0 (weapon); the
 * database here counts from 1, so tag type n is type n + 1.
 *
 * Each type can be kept from being taken off, or left alone by Optimize and
 * Remove All, in the settings. Optimize picks the best piece by the
 * original's measure (attack and magic count twice for a weapon, defence and
 * magic defence for an armor). Change Equipment in an event puts the piece
 * in the first empty slot of its type.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param defaultSlots
 * @text Default slots
 * @default [1,2,3,4,5]
 * @desc JSON list of equipment types for actors and classes without <equip slots>.
 *
 * @param types
 * @text Equipment types
 * @type multiline_string
 * @default {}
 * @desc JSON: type → { name, removable, optimize }. Names are used for types past the database's.
 *
 * @param commands
 * @type multiline_string
 * @default [{"symbol":"equip"},{"symbol":"optimize"},{"symbol":"clear"}]
 * @desc JSON: [{ symbol, text, enable, show, handler }]. equip/optimize/clear are the built-in ones.
 *
 * @param statusFontSize
 * @type number
 * @default 20
 * @desc RGSS font size of the parameter window.
 *
 * @param removeIcon
 * @type number
 * @default 0
 * @param removeText
 * @default
 * @param nothingIcon
 * @type number
 * @default 0
 * @param nothingText
 * @default
 *
 * @param statusRows
 * @text Parameter rows
 * @type select
 * @option engine
 * @option adjustLimits
 * @default engine
 * @desc adjustLimits: Ace Adjust Limits redrew the rows (no shading, value at 112, arrow at 110).
 *
 * @param limitsFontSize
 * @type number
 * @default 20
 * @desc RGSS font size of the rows Ace Adjust Limits drew.
 *
 * @param defaultFontSize
 * @text The game's default font size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyEquipEngine');
    const json = (t, d) => { try { return JSON.parse(t) ?? d; } catch (_) { return d; } };
    const DEFAULT_SLOTS = json(params.defaultSlots || '[1,2,3,4,5]', [1, 2, 3, 4, 5]).map(Number);
    const TYPES = json(params.types || '{}', {});
    const COMMANDS = json(params.commands || '', [{ symbol: 'equip' }, { symbol: 'optimize' }, { symbol: 'clear' }]);
    const num = (key, d) => (params[key] === undefined || params[key] === '' ? d : Number(params[key]));
    const STATUS_FONT = num('statusFontSize', 20), LIMITS_FONT = num('limitsFontSize', 20);
    const REMOVE_ICON = num('removeIcon', 0), REMOVE_TEXT = String(params.removeText ?? '');
    const NOTHING_ICON = num('nothingIcon', 0), NOTHING_TEXT = String(params.nothingText ?? '');
    const LIMITS_ROWS = String(params.statusRows) === 'adjustLimits';
    const BASE_SIZE = num('defaultFontSize', 24) || 24;
    const fontSize = (size) => Math.round($gameSystem.mainFontSize() * size / BASE_SIZE);
    const group = (w, v) => (w.rrAceGroup ? w.rrAceGroup(v) : String(v));

    // A type missing from the settings is removable and optimized (the original stopped with an error).
    const typeOf = (etypeId) => TYPES[etypeId] || { name: '', removable: true, optimize: true };
    /** The name of an equipment type: the database's for the first five, the settings' past them. */
    TextManager.rrEquipType = function(etypeId) {
        if (etypeId >= 1 && etypeId <= 5) return $dataSystem.equipTypes[etypeId] || '';
        return TYPES[etypeId] ? String(TYPES[etypeId].name) : '';
    };

    //-------------------------------------------------------------------------
    // Note tags (type numbers as the original's, from 0; stored here from 1)
    //-------------------------------------------------------------------------
    const RE = {
        slotsOn: /<(?:EQUIP_SLOTS|equip slots)>/i, slotsOff: /<\/(?:EQUIP_SLOTS|equip slots)>/i,
        typeInt: /<(?:EQUIP_TYPE|equip type):[ ]*(\d+)>/i, typeStr: /<(?:EQUIP_TYPE|equip type):[ ]*(.*)>/i,
        gear: /<(?:STARTING_GEAR|starting gear):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        fixed: /<(?:FIXED_EQUIP|fixed equip):[ ](\d+(?:\s*,\s*\d+)*)>/i, sealed: /<(?:SEALED_EQUIP|sealed equip):[ ](\d+(?:\s*,\s*\d+)*)>/i
    };
    const numbers = (s) => (s.match(/\d+/g) || []).map(Number).filter(n => n > 0);
    const typeIds = () => Object.keys(TYPES).map(Number);
    const slotType = (line) => {
        const up = line.toUpperCase();
        let m;
        if ((m = /EQUIP TYPE[ ](\d+)/i.exec(up) || /EQUIP TYPE:[ ](\d+)/i.exec(up))) {
            const id = Number(m[1]) + 1, out = [];
            // Both checks push: one of the first five types that is also in the settings is listed twice.
            if (id >= 1 && id <= 5) out.push(id);
            if (TYPES[id]) out.push(id);
            return out;
        }
        if (/WEAPON/i.test(up)) return [1];
        if (/SHIELD/i.test(up)) return [2];
        if (/HEAD/i.test(up)) return [3];
        if (/BODY/i.test(up) || /ARMOR/i.test(up) || /ARMOUR/i.test(up)) return [4];
        if (/ETC/i.test(up) || /OTHER/i.test(up) || /ACCESSOR/i.test(up)) return [5];
        const text = up.replace(/ /g, '');
        const id = typeIds().find(t => String(TYPES[t].name).toUpperCase().replace(/ /g, '') === text);
        return id === undefined ? [] : [id];
    };
    const cache = new WeakMap();
    /** { slots, fixed, sealed, gear } read from a database object's note. */
    const notes = (obj) => {
        if (!obj || typeof obj !== 'object') return { slots: [], fixed: [], sealed: [], gear: [] };
        if (cache.has(obj)) return cache.get(obj);
        const out = { slots: [], fixed: [], sealed: [], gear: [], etypeId: null };
        const actorOrClass = obj === $dataActors[obj.id] || obj === $dataClasses[obj.id];
        const isActor = obj === $dataActors[obj.id], isArmor = obj === $dataArmors[obj.id];
        let on = false, m;
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            if (RE.slotsOn.test(line)) { if (actorOrClass) on = true; }
            else if (RE.slotsOff.test(line)) { if (actorOrClass) on = false; }
            else if ((m = RE.gear.exec(line))) { if (isActor) out.gear.push(...numbers(m[1])); }
            else if ((m = RE.fixed.exec(line))) out.fixed.push(...numbers(m[1]).map(n => n + 1));
            else if ((m = RE.sealed.exec(line))) out.sealed.push(...numbers(m[1]).map(n => n + 1));
            else if ((m = RE.typeInt.exec(line))) { if (isArmor) out.etypeId = Math.max(1, Number(m[1])) + 1; }
            else if ((m = RE.typeStr.exec(line))) {
                if (!isArmor) continue;
                const id = typeIds().find(t => String(TYPES[t].name).toUpperCase() === m[1].toUpperCase());
                if (id !== undefined) out.etypeId = Math.max(2, id);
            } else if (on) out.slots.push(...slotType(line));
        }
        if (obj === $dataClasses[obj.id] && !out.slots.length) out.slots = DEFAULT_SLOTS.slice();
        cache.set(obj, out);
        return out;
    };
    // An armor's <equip type> is its type from the start.
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_isDatabaseLoaded.call(this)) return false;
        if (!this._rrEquipEngine) {
            this._rrEquipEngine = true;
            for (const armor of $dataArmors) {
                const t = armor && notes(armor).etypeId;
                if (t) armor.etypeId = t;
            }
        }
        return true;
    };

    //-------------------------------------------------------------------------
    // Actors: slots, fixed and sealed types, starting gear, optimize
    //-------------------------------------------------------------------------
    const A = Game_Actor.prototype;
    A.rrEquipSlotsNormal = function() {
        const own = notes(this.actor()).slots;
        return own.length ? own : notes(this.currentClass()).slots;
    };
    A.equipSlots = function() {
        const slots = this.rrEquipSlotsNormal().slice();
        if (this.isDualWield() && slots.length >= 2) slots[1] = 1;
        return slots;
    };
    A.rrSlotList = function(etypeId) {
        const out = [];
        this.equipSlots().forEach((e, i) => { if (e === etypeId) out.push(i); });
        return out;
    };
    /** The first empty slot of the type, else its first slot (undefined when it has none). */
    A.rrEmptySlot = function(etypeId) {
        const list = this.rrSlotList(etypeId);
        const empty = list.find(i => !this._equips[i] || this._equips[i].isNull());
        return empty !== undefined ? empty : list[0];
    };
    // The database's starting equipment goes by type into the first empty slot of it, then <starting gear>.
    A.initEquips = function(equips) {
        const slots = this.equipSlots();
        this._equips = slots.map(() => new Game_Item());
        equips.forEach((itemId, i) => {
            const etypeId = (i === 1 && this.isDualWield() ? 0 : i) + 1;
            const slotId = this.rrEmptySlot(etypeId);
            if (slotId !== undefined) this._equips[slotId].setEquip(etypeId === 1, itemId);
        });
        this.refresh();
        for (const id of notes(this.actor()).gear) {
            const armor = $dataArmors[id];
            if (!armor || !this.equipSlots().includes(armor.etypeId)) continue;
            this._equips[this.rrEmptySlot(armor.etypeId)].setEquip(armor.etypeId === 1, armor.id);
        }
        this.refresh();
    };
    const collect = (actor, key) => {
        const out = new Set([...notes(actor.actor())[key], ...notes(actor.currentClass())[key]]);
        for (const obj of actor.equips().concat(actor.states())) if (obj) notes(obj)[key].forEach(t => out.add(t));
        return [...out];
    };
    A.rrFixedEtypes = function() { return collect(this, 'fixed'); };
    A.rrSealedEtypes = function() { return collect(this, 'sealed'); };
    const _isEquipTypeLocked = A.isEquipTypeLocked;
    A.isEquipTypeLocked = function(etypeId) {
        return this.rrFixedEtypes().includes(etypeId) || _isEquipTypeLocked.call(this, etypeId);
    };
    const _isEquipTypeSealed = A.isEquipTypeSealed;
    A.isEquipTypeSealed = function(etypeId) {
        return this.rrSealedEtypes().includes(etypeId) || _isEquipTypeSealed.call(this, etypeId);
    };
    // Slots that appear after a class change start empty rather than missing.
    A.rrFillSlots = function() {
        for (let i = 0; i < this._equips.length; i++) if (!this._equips[i]) this._equips[i] = new Game_Item();
    };
    const _equips = A.equips;
    A.equips = function() {
        this.rrFillSlots();
        return _equips.call(this);
    };
    // Taking a piece off is refused for a type that is not removable, and during Optimize for one it leaves alone.
    const _changeEquip = A.changeEquip;
    A.changeEquip = function(slotId, item) {
        if (!item) {
            const type = typeOf(this.equipSlots()[slotId]);
            if (!(this._rrOptimizeClear ? type.optimize : type.removable)) return;
        }
        if (!this._equips[slotId]) this._equips[slotId] = new Game_Item();
        _changeEquip.call(this, slotId, item);
    };
    const _forceChangeEquip = A.forceChangeEquip;
    A.forceChangeEquip = function(slotId, item) {
        if (!this._equips[slotId]) this._equips[slotId] = new Game_Item();
        _forceChangeEquip.call(this, slotId, item);
    };
    /** VX Ace's measure of a piece: attack and magic count twice for a weapon, defence and magic defence for an armor. */
    A.rrAcePerformance = function(item) {
        const sum = item.params.reduce((a, b) => a + b, 0);
        return DataManager.isWeapon(item) ? item.params[2] + item.params[4] + sum : item.params[3] + item.params[5] + sum;
    };
    // Types marked not to optimize keep what they hold; the others take the best piece (the first of equals) that is not worse than nothing.
    A.optimizeEquipments = function() {
        this._rrOptimizeClear = true;
        this.clearEquipments();
        this._rrOptimizeClear = false;
        const slots = this.equipSlots();
        for (let i = 0; i < slots.length; i++) {
            if (!this.isEquipChangeOk(i) || !typeOf(this.equipSlots()[i]).optimize) continue;
            let best = null, bestValue = -Infinity;
            for (const item of $gameParty.equipItems()) {
                if (item.etypeId !== this.equipSlots()[i] || !this.canEquip(item)) continue;
                const value = this.rrAcePerformance(item);
                if (value >= 0 && value > bestValue) { best = item; bestValue = value; }
            }
            this.changeEquip(i, best);
        }
    };

    // Change Equipment: a piece goes to the first empty slot of its type; "None" empties the slot numbered by the type.
    Game_Interpreter.prototype.command319 = function(params) {
        const actor = $gameActors.actor(params[0]);
        if (!actor) return true;
        const etypeId = params[1], itemId = params[2];
        let slotId;
        if (etypeId === 1 && itemId !== 0) {
            if (!actor.equipSlots().includes(1)) return true;
            slotId = actor.rrEmptySlot(1);
        } else if (itemId !== 0) {
            const item = $dataArmors[itemId];
            if (!item || !actor.equipSlots().includes(item.etypeId)) return true;
            slotId = actor.rrEmptySlot(item.etypeId);
        } else {
            slotId = etypeId - 1;
        }
        if (slotId === undefined || slotId >= actor.equipSlots().length) return true;
        const weapon = actor.equipSlots()[slotId] === 1;
        actor.changeEquip(slotId, (weapon ? $dataWeapons : $dataArmors)[itemId] || null);
        return true;
    };

    Window_StatusBase.prototype.actorSlotName = function(actor, index) {
        return TextManager.rrEquipType(actor.equipSlots()[index]);
    };

    //-------------------------------------------------------------------------
    // Parameter window: all eight parameters, current → new
    //-------------------------------------------------------------------------
    const S = Window_EquipStatus.prototype;
    S.refresh = function() {
        this.contents.clear();
        for (let i = 0; i < 8; i++) this.rrDrawParamRow(0, this.lineHeight() * i, i);
    };
    S.rrDrawParamRow = function(dx, dy, paramId) {
        const cw = this.contents.width, lh = this.lineHeight();
        if (LIMITS_ROWS) {
            this.rrDrawParamName(dx + 4, dy, paramId, LIMITS_FONT);
            if (this._actor) this.rrDrawCurrentParam(dy, paramId, dx + 112);
            this.resetFontSettings();
            this.rrDrawRightArrow(dx + 110, dy);
            if (this._tempActor) this.rrDrawNewParam(dy, paramId, LIMITS_FONT);
        } else {
            const colour = 'rgba(0, 0, 0, ' + (this.translucentOpacity() / 2 / 255) + ')';
            this.contents.fillRect(dx + 1, dy + 1, cw - 2, lh - 2, colour);
            this.rrDrawParamName(dx + 4, dy, paramId, STATUS_FONT);
            const drx = Math.floor((cw + 22) / 2);
            if (this._actor) this.rrDrawCurrentParam(dy, paramId, drx);
            this.resetFontSettings();
            this.rrDrawRightArrow(drx, dy);
            if (this._tempActor) this.rrDrawNewParam(dy, paramId, STATUS_FONT);
        }
        this.resetFontSettings();
    };
    S.rrDrawParamName = function(x, y, paramId, size) {
        this.contents.fontSize = fontSize(size);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.param(paramId), x, y, this.contents.width);
    };
    // The current value keeps the name's font size and ends at `right`.
    S.rrDrawCurrentParam = function(y, paramId, right) {
        this.resetTextColor();
        this.drawText(group(this, this._actor.param(paramId)), 0, y, right, 'right');
    };
    S.rrDrawRightArrow = function(x, y) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText('→', x, y, 22, 'center');
    };
    S.rrDrawNewParam = function(y, paramId, size) {
        this.contents.fontSize = fontSize(size);
        const value = this._tempActor.param(paramId);
        this.changeTextColor(ColorManager.paramchangeTextColor(value - this._actor.param(paramId)));
        this.drawText(group(this, value), 0, y, this.contents.width - 4, 'right');
    };

    //-------------------------------------------------------------------------
    // Command window: one column, four rows
    //-------------------------------------------------------------------------
    const switchOn = (id) => Number(id) <= 0 || $gameSwitches.value(Number(id));
    Window_EquipCommand.prototype.maxCols = function() { return 1; };
    Window_EquipCommand.prototype.makeCommandList = function() {
        for (const c of COMMANDS) {
            if (c.symbol === 'equip') this.addCommand(TextManager.equip2, 'equip');
            else if (c.symbol === 'optimize') this.addCommand(TextManager.optimize, 'optimize');
            else if (c.symbol === 'clear') this.addCommand(TextManager.clear, 'clear');
            else if (switchOn(c.show)) this.addCommand(String(c.text || ''), c.symbol, switchOn(c.enable));
        }
    };
    const _processOk = Window_EquipCommand.prototype.processOk;
    Window_EquipCommand.prototype.processOk = function() {
        $gameTemp._rrSceneEquipIndex = this.index();
        _processOk.call(this);
    };

    //-------------------------------------------------------------------------
    // Slot window: type name, then the piece (or the nothing icon and text)
    //-------------------------------------------------------------------------
    Window_EquipSlot.prototype.drawItem = function(index) {
        if (!this._actor) return;
        const rect = this.itemLineRect(index), lh = this.lineHeight();
        const enabled = this.isEnabled(index);
        this.changeTextColor(ColorManager.systemColor());
        this.changePaintOpacity(enabled);
        this.drawText(this.actorSlotName(this._actor, index), rect.x, rect.y, 92, lh);
        this.changePaintOpacity(true);
        const item = this.itemAt(index);
        const dx = rect.x + 92, dw = this.contents.width - dx - 24;
        if (item) {
            this.rrAceDrawItemName(item, dx, rect.y, enabled, dw);
        } else {
            this.changePaintOpacity(false);
            this.resetTextColor();
            this.drawIcon(NOTHING_ICON, dx, rect.y, false);
            this.drawText(NOTHING_TEXT, dx + 24, rect.y, dw - 24);
            this.changePaintOpacity(true);
        }
    };

    //-------------------------------------------------------------------------
    // Item window: one column, the empty entry (remove icon and text) only for a removable type
    //-------------------------------------------------------------------------
    const I = Window_EquipItem.prototype;
    I.includes = function(item) {
        if (!item && this._actor) return !!typeOf(this._actor.equipSlots()[this._slotId]).removable;
        if (!item) return true;
        if (!DataManager.isWeapon(item) && !DataManager.isArmor(item)) return false;
        if (this._slotId < 0 || !this._actor) return false;
        if (item.etypeId !== this._actor.equipSlots()[this._slotId]) return false;
        return this._actor.canEquip(item);
    };
    I.isEnabled = function(item) {
        if (!item && this._actor) return !!typeOf(this._actor.equipSlots()[this._slotId]).removable;
        return !!this._actor && this._actor.canEquip(item);
    };
    I.drawItem = function(index) {
        const item = this.itemAt(index);
        const rect = this.itemRect(index);
        rect.width -= 4;
        if (!item) {
            this.drawIcon(REMOVE_ICON, rect.x, rect.y);
            this.drawText(REMOVE_TEXT, rect.x + 24, rect.y, rect.width - 24);
            return;
        }
        const enabled = this.isEnabled(item);
        this.rrAceDrawItemName(item, rect.x, rect.y, enabled, this.contents.width - rect.x - 24);
        this.changePaintOpacity(enabled);
        this.rrAceDrawItemNumber(rect, item);
        this.changePaintOpacity(true);
    };
    // Choosing a piece plays the OK sound before the Equip sound.
    I.playOkSound = function() { Window_Selectable.prototype.playOkSound.call(this); };

    //-------------------------------------------------------------------------
    // Actor window: face and simple status, beside the commands
    //-------------------------------------------------------------------------
    function Window_RREquipActor() { this.initialize(...arguments); }
    Window_RREquipActor.prototype = Object.create(Window_Base.prototype);
    Window_RREquipActor.prototype.constructor = Window_RREquipActor;
    Window_RREquipActor.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._actor = null;
    };
    Window_RREquipActor.prototype.setActor = function(actor) {
        if (this._actor === actor) return;
        this._actor = actor;
        this.refresh();
    };
    Window_RREquipActor.prototype.refresh = function() {
        this.contents.clear();
        const actor = this._actor;
        if (!actor) return;
        const face = ImageManager.loadFace(actor.faceName());
        if (!face.isReady()) { face.addLoadListener(() => { if (this._actor === actor) this.refresh(); }); return; }
        this.drawActorFace(actor, 0, 0, ImageManager.faceWidth, ImageManager.faceHeight);
        this.rrAceDrawActorSimpleStatus(actor, 108, Math.floor(this.lineHeight() / 2));
    };
    window.Window_RREquipActor = Window_RREquipActor;

    //-------------------------------------------------------------------------
    // Scene: commands 160 wide and four rows tall at the top left, the actor beside them, the help under
    // them (a Yanfly Menu Engine game places it top, middle or bottom), then the slots or items (three
    // fifths wide) and the parameters (two fifths) to the bottom of the screen
    //-------------------------------------------------------------------------
    const E = Scene_Equip.prototype;
    E.rrEquipLayout = function() {
        const W = Graphics.boxWidth, H = Graphics.boxHeight;
        const lines = Number(PluginManager.parameters('RR_CustomItemMenu').helpLines) || 2;
        const where = String(PluginManager.parameters('RR_YanflyMenu').helpLocation || 'top');
        const hh = this.calcWindowHeight(lines, false), ch = this.calcWindowHeight(4, false);
        const sw = W - Math.floor(W * 2 / 5), bh = H - hh - ch;
        let cy = hh, hy = 0, sy = hh + ch;
        if (where === 'middle') { cy = 0; hy = ch; sy = ch + hh; }
        else if (where === 'bottom') { cy = 0; sy = ch; hy = ch + bh; }
        return {
            help: new Rectangle(0, hy, W, hh), command: new Rectangle(0, cy, 160, ch), actor: new Rectangle(160, cy, W - 160, ch),
            slot: new Rectangle(0, sy, sw, bh), status: new Rectangle(sw, sy, W - sw, bh)
        };
    };
    E.helpWindowRect = function() { return this.rrEquipLayout().help; };
    E.statusWindowRect = function() { return this.rrEquipLayout().status; };
    E.commandWindowRect = function() { return this.rrEquipLayout().command; };
    E.slotWindowRect = function() { return this.rrEquipLayout().slot; };
    E.itemWindowRect = function() { return this.rrEquipLayout().slot; };

    const _createCommandWindow = E.createCommandWindow;
    E.createCommandWindow = function() {
        _createCommandWindow.call(this);
        const w = this._commandWindow;
        if ($gameTemp._rrSceneEquipIndex != null) w.select($gameTemp._rrSceneEquipIndex);
        $gameTemp._rrSceneEquipIndex = null;
        // A command of another script calls that script's method on this screen; without it, it does nothing.
        for (const c of COMMANDS) {
            if (['equip', 'optimize', 'clear'].includes(c.symbol)) continue;
            w.setHandler(c.symbol, () => {
                if (typeof this[c.handler] === 'function') this[c.handler]();
                else this._commandWindow.activate();
            });
        }
        this._actorWindow = new Window_RREquipActor(this.rrEquipLayout().actor);
        this.addWindow(this._actorWindow);
    };
    const _refreshActor = E.refreshActor;
    E.refreshActor = function() {
        _refreshActor.call(this);
        if (this._actorWindow) this._actorWindow.setActor(this.actor());
    };
    const _commandOptimize = E.commandOptimize;
    E.commandOptimize = function() {
        _commandOptimize.call(this);
        this._actorWindow.refresh();
    };
    const _commandClear = E.commandClear;
    E.commandClear = function() {
        _commandClear.call(this);
        this._actorWindow.refresh();
    };
    const _onSlotOk = E.onSlotOk;
    E.onSlotOk = function() {
        this._itemWindow.refresh();
        _onSlotOk.call(this);
    };
    const _onItemOk = E.onItemOk;
    E.onItemOk = function() {
        _onItemOk.call(this);
        this._actorWindow.refresh();
    };
})();
