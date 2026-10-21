/* Shared, side-effect-free Tactical battle HUD: node settings, layout, drawing on a 2D canvas, the stock layout. */
(function(root) {
    'use strict';

    /**
     * ReactorFightHud - the Tactical battle HUD's nodes, the same in the game
     * and on the editor's canvas. It belongs to Tactical battles alone: a
     * Classic battle keeps its own Battle HUD records and stock windows, and
     * the other map modes (Action, First Person) show none of it.
     *
     * Four interface nodes: a Unit Panel (the unit whose turn it is, or the
     * one under the cursor, with the pending action's preview), a Turn Order
     * strip, a Battle Text line (objective, turn, phase banner, hint) and a
     * Tactical Window (places a stock command, skill or item window).
     * Everything here draws from plain values on a canvas context, so the
     * runtime (reactor_ui.js) and the editor draw one picture. A map battle
     * is read through `reader(fight)`: the tactical calls where the battle
     * has them, the same calls answered from the automatic battle where not.
     * Nothing here needs a 3D map, a model or any game global.
     */
    const H = {};

    H.NODE_TYPES = ['fightUnit', 'fightTurnOrder', 'fightInfo', 'fightWindow'];
    // The presentation of a Tactical battle HUD record, the map battle mode it serves, its role and its System field.
    H.MODE = 'tactical';
    H.BATTLE_MODE = 'tactical';
    H.ROLE = 'tactical';
    H.FIELD = 'reactorTacticalInterfaceId';
    // What the first builds called them; read as the same things.
    H.LEGACY_MODE = 'fight';
    H.LEGACY_FIELD = 'reactorFightInterfaceId';
    /** The id System binds as the Tactical battle HUD (0: none of its own, the stock layout plays). */
    H.boundId = function(system) {
        if (!system) return 0;
        const id = Math.floor(Number(system[H.FIELD]) || 0) || Math.floor(Number(system[H.LEGACY_FIELD]) || 0);
        return id > 0 ? id : 0;
    };
    /** The stock tactical windows a Tactical Window node places, by scene property. */
    H.WINDOWS = { command: '_fightCommandWindow', skill: '_fightSkillWindow', item: '_fightItemWindow' };
    H.UNITS = ['active', 'focused'];
    H.UNIT_FIELDS = ['portrait', 'name', 'level', 'hp', 'mp', 'tp', 'states', 'stats', 'preview'];
    H.STATS = ['atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'move', 'jump'];
    H.DEFAULT_STATS = ['atk', 'def', 'mat', 'mdf', 'agi', 'move'];
    H.INFOS = ['objective', 'turn', 'phase', 'hint'];
    H.TEAM_COLORS = { ally: '#4aa8ff', enemy: '#ff5a4a', neutral: '#e6d15a' };
    H.ACTIVE_COLOR = '#ffd34a';
    /** Every word the HUD writes that Terms does not have; a node's `fightLabels` replaces any of them. */
    H.LABELS = {
        atk: 'ATK', def: 'DEF', mat: 'MAT', mdf: 'MDF', agi: 'AGI', luk: 'LUK', move: 'MOV', jump: 'JMP',
        hit: 'Hit', critical: 'Crit', damage: 'Damage', heal: 'Heal', defeats: 'Defeats',
        halfCover: 'Half cover', fullCover: 'Full cover', side: 'Flanked', back: 'From behind',
        highGround: 'High ground', lowGround: 'Low ground', targets: 'targets',
        turn: 'Turn', allyPhase: 'Player Phase', enemyPhase: 'Enemy Phase',
        hintUnit: 'Choose a unit', hintMove: 'Choose where to move', hintCommand: 'Choose an action',
        hintTarget: 'Choose a target', hintEnemy: 'The enemy is moving', hintAlly: 'Your side is moving',
        whyAttack: 'Cannot attack', whySkill: 'No skill to use', whyItem: 'No item to use', whyCost: 'Not enough %1',
        whyUse: 'Cannot be used now', whyRange: 'Out of reach', whyNoTarget: 'No target there', whyNoReach: 'Nobody in reach',
        overwatch: 'Overwatch', auto: 'Auto', wait: 'Wait', endTurn: 'End Turn', watch: 'On watch',
        mount: 'Mount', dismount: 'Dismount'
    };
    /** The commands of the battle's own (the rest are the project's Attack, Skill and Item), in menu order. */
    H.WINDOW_LABELS = ['mount', 'dismount', 'overwatch', 'wait', 'endTurn', 'auto'];
    /** Their icons on the icon sheet, where the project's commands carry icons (a node may name others). */
    H.COMMAND_ICONS = { mount: 502, dismount: 575, overwatch: 236, auto: 237, wait: 191, endTurn: 587 };
    H.GAUGE_STYLES = ['clipped', 'bar'];

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const finite = (value, fallback) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);
    const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

    H.isFightNode = type => H.NODE_TYPES.includes(type);

    /** What a new node of a type starts as (the editor's Add Node, and the base of `normalizeProps`). */
    H.defaultProps = function(type) {
        const shared = { allyColor: H.TEAM_COLORS.ally, enemyColor: H.TEAM_COLORS.enemy, neutralColor: H.TEAM_COLORS.neutral, fightLabels: {} };
        switch (type) {
            case 'fightUnit': return Object.assign(shared, {
                width: 320, height: 148, fill: 'window', fightUnit: 'active', fightFields: H.UNIT_FIELDS.slice(),
                fightStats: H.DEFAULT_STATS.slice(), fightPortrait: 0, hideSameUnit: true, gaugeStyle: 'clipped'
            });
            case 'fightTurnOrder': return Object.assign(shared, {
                width: 480, height: 56, fill: 'none', align: 'center', cellSize: 0, cellGap: 6, maxCells: 0, turnAnimate: true
            });
            case 'fightInfo': return Object.assign(shared, {
                width: 320, height: 32, fill: 'none', fightInfo: 'objective', align: 'left', fontSize: 0, fontBold: false,
                textColor: 0, bannerFrames: 90
            });
            case 'fightWindow': return Object.assign(shared, {
                width: 192, height: 204, fill: 'window', fightWindow: 'command', hideWindow: false, windowColumns: 0,
                slideX: 0, slideY: 0, slideDuration: 12, commandIcons: true, commandAlign: 'left', fitCommands: true,
                overwatchIcon: H.COMMAND_ICONS.overwatch, autoIcon: H.COMMAND_ICONS.auto, waitIcon: H.COMMAND_ICONS.wait, endTurnIcon: H.COMMAND_ICONS.endTurn,
                mountIcon: H.COMMAND_ICONS.mount, dismountIcon: H.COMMAND_ICONS.dismount
            });
            default: return {};
        }
    };

    /** A stored node's map battle settings, every value in range (missing ones at their defaults). */
    H.normalizeProps = function(source, type) {
        const base = H.defaultProps(type);
        if (!H.isFightNode(type)) return base;
        source = source && typeof source === 'object' ? source : {};
        const out = {};
        for (const key of ['allyColor', 'enemyColor', 'neutralColor']) out[key] = isHex(source[key]) ? source[key] : base[key];
        const labels = {};
        if (source.fightLabels && typeof source.fightLabels === 'object') {
            for (const key of Object.keys(H.LABELS)) {
                if (typeof source.fightLabels[key] === 'string' && source.fightLabels[key] !== '') labels[key] = source.fightLabels[key];
            }
        }
        out.fightLabels = labels;
        if (type === 'fightUnit') {
            out.fightUnit = oneOf(source.fightUnit, H.UNITS, 'active');
            out.fightFields = Array.isArray(source.fightFields) ? H.UNIT_FIELDS.filter(key => source.fightFields.includes(key)) : base.fightFields;
            out.fightStats = Array.isArray(source.fightStats) ? source.fightStats.filter(key => H.STATS.includes(key)).slice(0, 9) : base.fightStats;
            out.fightPortrait = clamp(Math.round(finite(source.fightPortrait, 0)), 0, 512);
            out.hideSameUnit = source.hideSameUnit !== false;
            out.gaugeStyle = oneOf(source.gaugeStyle, H.GAUGE_STYLES, 'clipped');
        } else if (type === 'fightTurnOrder') {
            out.cellSize = clamp(Math.round(finite(source.cellSize, 0)), 0, 256);
            out.cellGap = clamp(Math.round(finite(source.cellGap, 6)), 0, 64);
            out.maxCells = clamp(Math.round(finite(source.maxCells, 0)), 0, 99);
            out.turnAnimate = source.turnAnimate !== false;
        } else if (type === 'fightInfo') {
            out.fightInfo = oneOf(source.fightInfo, H.INFOS, 'objective');
            out.bannerFrames = clamp(Math.round(finite(source.bannerFrames, 90)), 10, 600);
        } else if (type === 'fightWindow') {
            out.fightWindow = oneOf(source.fightWindow, Object.keys(H.WINDOWS), 'command');
            out.commandIcons = source.commandIcons !== false;
            out.commandAlign = oneOf(source.commandAlign, ['left', 'center', 'right'], 'left');
            out.fitCommands = source.fitCommands !== false;
            for (const key of H.WINDOW_LABELS) out[key + 'Icon'] = clamp(Math.round(finite(source[key + 'Icon'], H.COMMAND_ICONS[key])), 0, 99999);
        }
        return out;
    };

    H.label = (node, key) => (node && node.fightLabels && node.fightLabels[key]) || H.LABELS[key] || '';
    H.teamColor = (node, team) => (team === 'enemy' ? node.enemyColor : team === 'neutral' ? node.neutralColor : node.allyColor)
        || H.TEAM_COLORS[team] || H.TEAM_COLORS.ally;

    //-------------------------------------------------------------------------
    // Reading a battle. `reader(fight)` answers the tactical calls; where the
    // battle has none of its own (the automatic battle) they are answered
    // from what it does have, so one HUD serves both.

    const fallbacks = new WeakMap();

    function Fallback(fight) {
        this.fight = fight;
        this._order = [];
        this._pool = [];
        this._orderRevision = -1;
        this._info = { battler: null };
        this._empty = [];
    }
    Fallback.prototype.tacticalRevision = function() {
        const fight = this.fight;
        const units = fight._units || this._empty;
        let sum = (fight.turn ? fight.turn() : 0) * 131 + (fight._queue ? fight._queue.length : 0) * 17;
        const act = fight._act;
        if (act) sum += act.unitId * 7919 + (act.targetId || 0) * 104729;
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const battler = unit.gone ? null : fight.battler(unit);
            if (battler) sum += (battler.hp * 31 + battler.mp * 13 + battler.tp) * (i + 1) + (unit.defeated ? 977 : 0);
        }
        return sum;
    };
    Fallback.prototype.tacticalState = function() {
        const unit = this.activeUnit();
        return unit ? (unit.team === 'ally' ? 'acting' : 'enemy') : 'idle';
    };
    Fallback.prototype.activeUnit = function() {
        const act = this.fight._act;
        return act ? this.fight.unit(act.unitId) : null;
    };
    Fallback.prototype.awaitsPlayer = function() { return false; };
    Fallback.prototype.cursor = function() { return null; };
    Fallback.prototype.focusedUnit = function() {
        const act = this.fight._act;
        return act && act.targetId ? this.fight.unit(act.targetId) : null;
    };
    Fallback.prototype.currentTeam = function() {
        if (this.fight._turns === 'initiative') return 'any';
        const unit = this.activeUnit();
        if (unit) this._team = unit.team;
        return this._team || 'ally';
    };
    Fallback.prototype.turnOrder = function() {
        const revision = this.tacticalRevision();
        if (revision === this._orderRevision) return this._order;
        this._orderRevision = revision;
        const fight = this.fight, order = this._order;
        let count = 0;
        const add = (unit, active) => {
            if (!unit || unit.gone) return;
            const entry = this._pool[count] || (this._pool[count] = {});
            entry.unitId = unit.id; entry.team = unit.team; entry.active = active; entry.acted = false; entry.defeated = !!unit.defeated;
            order[count++] = entry;
        };
        add(this.activeUnit(), true);
        for (const entry of fight._queue || this._empty) if (entry.kind === 'unit') add(fight.unit(entry.unitId), false);
        order.length = count;
        return order;
    };
    Fallback.prototype.unitInfo = function(unit) {
        const fight = this.fight, info = this._info;
        const battler = fight.battler(unit);
        const character = fight.character ? fight.character(unit) : null;
        const actor = battler && battler.isActor && battler.isActor();
        info.id = unit.id;
        info.name = battler && battler.name ? battler.name() : '';
        info.team = unit.team;
        info.battler = battler;
        info.level = actor ? battler.level : 0;
        info.faceName = actor && battler.faceName ? battler.faceName() : '';
        info.faceIndex = actor && battler.faceIndex ? battler.faceIndex() : 0;
        info.characterName = character && character.characterName ? character.characterName() : (actor && battler.characterName ? battler.characterName() : '');
        info.characterIndex = character && character.characterIndex ? character.characterIndex() : (actor && battler.characterIndex ? battler.characterIndex() : 0);
        info.model = null;
        info.x = character ? character.x : 0;
        info.y = character ? character.y : 0;
        info.move = unit.move || 0;
        info.jump = 1;
        info.acted = false;
        info.moved = false;
        return info;
    };
    Fallback.prototype.pendingItem = function() { return null; };
    Fallback.prototype.preview = function() { return null; };
    Fallback.prototype.targetsAtCursor = function() { return this._empty; };
    Fallback.prototype.objectiveText = function() {
        const fight = this.fight;
        const objective = fight.objective ? fight.objective() : null;
        if (!objective) return '';
        if (objective.type === 'survive') return 'Survive ' + (objective.turns || 0) + ' turns';
        if (objective.type === 'defeatUnit') {
            const unit = fight.unitOfEvent ? fight.unitOfEvent(objective.eventId) : null;
            const battler = unit ? fight.battler(unit) : null;
            return 'Defeat ' + (battler && battler.name ? battler.name() : 'the leader');
        }
        return objective.type === 'defeatAll' ? 'Defeat all enemies' : '';
    };
    Fallback.prototype.turn = function() { return this.fight.turn ? this.fight.turn() : 0; };
    Fallback.prototype.unit = function(id) { return this.fight.unit(id); };

    /** Every call the HUD makes on a battle; one that lacks any of them is read through the stand-in. */
    H.CALLS = ['tacticalRevision', 'tacticalState', 'activeUnit', 'focusedUnit', 'turnOrder', 'unitInfo', 'pendingItem', 'preview', 'objectiveText', 'turn', 'unit'];

    /** The battle as the HUD reads it: itself when it speaks the tactical calls, else a stand-in over it. */
    H.reader = function(fight) {
        if (!fight) return null;
        let speaks = true;
        for (let i = 0; i < H.CALLS.length && speaks; i++) speaks = typeof fight[H.CALLS[i]] === 'function';
        if (speaks) return fight;
        let reader = fallbacks.get(fight);
        if (!reader) fallbacks.set(fight, reader = new Fallback(fight));
        return reader;
    };

    /** An empty unit view; `fillUnitView` writes into it so a panel keeps one for its whole life. */
    H.newUnitView = function() {
        return { id: 0, name: '', team: 'ally', level: 0, className: '', faceName: '', faceIndex: 0, characterName: '', characterIndex: 0,
            battlerName: '', model: null, area: null, hpShown: -1, hp: 0, mhp: 0, mp: 0, mmp: 0, tp: 0, mtp: 100, showTp: true, vhp: 0, vmhp: 0, vname: '', icons: [], stats: {}, acted: false, moved: false, watch: false, watchText: '', preview: null };
    };

    /** What a panel shows of a unit, as plain values. `preview` is the pending action's forecast on it, or null. */
    H.fillUnitView = function(view, reader, unit, showTp, preview) {
        const info = reader.unitInfo(unit) || {};
        const battler = info.battler || {};
        view.id = info.id || unit.id || 0;
        view.name = String(info.name || '');
        view.team = info.team || unit.team || 'ally';
        view.level = Number(info.level) || 0;
        const klass = battler.currentClass ? battler.currentClass() : null;
        view.className = klass && klass.name ? klass.name : '';
        view.faceName = info.faceName || '';
        view.faceIndex = Number(info.faceIndex) || 0;
        view.characterName = info.characterName || '';
        view.characterIndex = Number(info.characterIndex) || 0;
        // An enemy with neither a face nor a map sprite still has its battle picture.
        view.battlerName = battler.isEnemy && battler.isEnemy() && battler.battlerName ? battler.battlerName() || '' : '';
        view.model = info.model || null;
        view.hp = Number(battler.hp) || 0; view.mhp = Number(battler.mhp) || 0;
        view.mp = Number(battler.mp) || 0; view.mmp = Number(battler.mmp) || 0;
        view.tp = Number(battler.tp) || 0; view.mtp = battler.maxTp ? battler.maxTp() : 100;
        view.showTp = showTp !== false;
        // What it rides, where that has a life of its own: a gauge under the unit's HP.
        const vehicle = info.vehicle || null;
        view.vmhp = vehicle ? Number(vehicle.mhp) || 0 : 0;
        view.vhp = vehicle ? Number(vehicle.hp) || 0 : 0;
        view.vname = vehicle && typeof vehicle.name === 'function' ? vehicle.name() || '' : '';
        view.icons.length = 0;
        const icons = battler.allIcons ? battler.allIcons() : battler.stateIcons ? battler.stateIcons() : null;
        if (icons) for (let i = 0; i < icons.length; i++) view.icons.push(icons[i]);
        const stats = view.stats;
        stats.atk = Number(battler.atk) || 0; stats.def = Number(battler.def) || 0;
        stats.mat = Number(battler.mat) || 0; stats.mdf = Number(battler.mdf) || 0;
        stats.agi = Number(battler.agi) || 0; stats.luk = Number(battler.luk) || 0;
        stats.move = Number(info.move) || 0; stats.jump = Number(info.jump) || 0;
        view.acted = !!info.acted;
        view.moved = !!info.moved;
        // Keeping watch (Overwatch): said on the panel in the battle's own words where it has them.
        view.watch = !!info.overwatch;
        view.watchText = view.watch ? H.battleTerm(reader, 'unitWatch') : '';
        view.preview = preview || null;
        view.area = null;
        return view;
    };

    /** A 32-bit mix of whole numbers: what a panel shows, folded into one number to compare against its last drawing. */
    H.mix = (hash, value) => (Math.imul(hash, 31) + (value | 0)) | 0;

    /** Everything a Unit Panel draws from a unit view, as one number: the same number, the same picture. */
    H.viewKey = function(view) {
        const mix = H.mix, stats = view.stats, preview = view.preview, area = view.area;
        let key = mix(mix(mix(mix(mix(mix(mix(17, view.id), view.hp), view.mhp), view.mp), view.mmp), view.tp), view.level);
        key = mix(mix(mix(mix(mix(mix(mix(mix(key, stats.atk), stats.def), stats.mat), stats.mdf), stats.agi), stats.luk), stats.move), stats.jump);
        key = mix(mix(mix(key, view.team === 'enemy' ? 1 : view.team === 'neutral' ? 2 : 0), view.faceIndex), view.characterIndex);
        for (let i = 0; i < view.icons.length; i++) key = mix(key, view.icons[i]);
        for (let i = 0; i < view.name.length; i++) key = mix(key, view.name.charCodeAt(i));
        key = mix(mix(mix(key, view.watch ? 7 : 3), view.vhp), view.vmhp);
        if (preview) {
            key = mix(mix(mix(mix(key, Math.round(preview.hit * 1000)), Math.round(preview.critical * 1000)), preview.damageMin), preview.damageMax);
            key = mix(mix(mix(mix(mix(key, preview.heals ? 1 : 2), preview.defeats ? 1 : 2), preview.cover), preview.flank === 'back' ? 2 : preview.flank === 'side' ? 1 : 0), Math.sign(preview.height || 0));
        }
        if (area) key = mix(mix(mix(mix(mix(mix(key, area.count), area.index), Math.round(area.hitMin * 1000)), Math.round(area.hitMax * 1000)), area.damageMin), mix(area.damageMax, area.defeats));
        return key;
    };

    /**
     * The unit a Unit Panel shows now, or null when it shows nothing. While an
     * action that lands on several units is aimed, the focused panel steps
     * through them (`cycle` picks which).
     */
    H.panelUnit = function(node, reader, cycle) {
        const active = reader.activeUnit();
        if (node.fightUnit === 'active') return active;
        const focused = reader.focusedUnit();
        const item = reader.pendingItem();
        const targets = item && reader.targetsAtCursor ? reader.targetsAtCursor() : null;
        if (targets && targets.length > 1) return targets[(Number(cycle) || 0) % targets.length];
        if (targets && targets.length === 1 && !focused) return targets[0];
        if (!focused) return null;
        // The unit under the cursor is the acting one: only worth a second panel while an action is aimed at it
        // (a heal on itself), never while the cursor only rests on it with nobody to aim at.
        if (node.hideSameUnit && active && focused.id === active.id && !(item && H.isAimedAt(reader, focused))) return null;
        return focused;
    };

    /** Whether the action being aimed would land on `unit` where the cursor is now. */
    H.isAimedAt = function(reader, unit) {
        if (!unit || !reader.pendingItem()) return false;
        // A battle that cannot say where the action lands is taken at its word for the unit it previews.
        if (typeof reader.targetsAtCursor !== 'function') return true;
        const targets = reader.targetsAtCursor();
        if (targets) for (let i = 0; i < targets.length; i++) if (targets[i] === unit || targets[i].id === unit.id) return true;
        return false;
    };

    /**
     * The aimed action's forecast on the unit a panel shows, or null: only a unit the action would land on has
     * one. The acting unit under its own cursor, or anyone the cursor passes outside the action's reach, has none.
     */
    H.previewFor = function(reader, unit) {
        return H.isAimedAt(reader, unit) ? reader.preview(unit) || null : null;
    };

    /**
     * Every target of the aimed action in one line's worth of numbers:
     * `{ count, index, hitMin, hitMax, damageMin, damageMax, defeats, heals }`
     * written into `out`, or null when it lands on fewer than two units.
     */
    H.areaSummary = function(reader, unit, out) {
        const targets = reader.pendingItem() && reader.targetsAtCursor ? reader.targetsAtCursor() : null;
        if (!targets || targets.length < 2) return null;
        out = out || {};
        out.count = 0; out.index = 0; out.hitMin = 1; out.hitMax = 0; out.damageMin = Infinity; out.damageMax = 0; out.defeats = 0; out.heals = 0;
        for (let i = 0; i < targets.length; i++) {
            const preview = reader.preview(targets[i]);
            if (unit && targets[i].id === unit.id) out.index = i;
            out.count++;
            if (!preview) continue;
            out.hitMin = Math.min(out.hitMin, preview.hit); out.hitMax = Math.max(out.hitMax, preview.hit);
            out.damageMin = Math.min(out.damageMin, preview.damageMin); out.damageMax = Math.max(out.damageMax, preview.damageMax);
            if (preview.defeats) out.defeats++;
            if (preview.heals) out.heals++;
        }
        if (out.damageMin === Infinity) out.damageMin = 0;
        if (out.hitMin > out.hitMax) out.hitMin = out.hitMax;
        return out;
    };

    /** A project's own command words: all capitals? carrying icons? (from its Attack, Skill and Item terms). */
    H.commandStyle = function(terms) {
        const list = (terms || []).filter(term => typeof term === 'string' && term);
        const plain = list.map(term => term.replace(/\\[A-Za-z]+\[[^\]]*\]/g, '').trim());
        return {
            upper: plain.length > 0 && plain.every(term => term === term.toUpperCase() && term !== term.toLowerCase()),
            icons: list.length > 0 && list.every(term => /\\i\[\d+\]/i.test(term))
        };
    };

    /**
     * What Wait or End Turn is called: the node's own word, else the
     * project's (`own`), else the stock word in the project's case.
     */
    H.commandLabel = function(node, key, own, style) {
        const given = node && node.fightLabels && node.fightLabels[key];
        if (given) return given;
        if (own) return own;
        const word = H.LABELS[key] || '';
        return style && style.upper ? word.toUpperCase() : word;
    };

    /**
     * A command of the battle's own as the window writes it: its word, led by
     * its icon as an icon code where the project's commands carry icons
     * (`\\i[n] WAIT`), so the window draws it the way it draws Attack. `hasIcon`
     * says whether the sheet has a picture at an index (none: no code).
     */
    H.commandText = function(node, key, own, style, hasIcon) {
        const label = H.commandLabel(node, key, own, style);
        if (!node || node.commandIcons === false || !style || !style.icons || /\\i\[\d+\]/i.test(label)) return label;
        const icon = Number(node[key + 'Icon']) || 0;
        return icon > 0 && (!hasIcon || hasIcon(icon)) ? '\\i[' + icon + '] ' + label : label;
    };

    /** Whether the HUD draws its own icon beside a command: the project's commands carry icons and the text has none (the sheet had no picture there). */
    H.commandGlyph = function(node, key, label, style) {
        return !!(node && node.commandIcons !== false && style && style.icons && H.WINDOW_LABELS.includes(key) && !/\\i\[\d+\]/i.test(label));
    };

    /**
     * The command window fitted to its list: as wide as its widest row, and as
     * tall as its rows, squeezed (never under `minRow`) to keep the node's
     * height where they allow. `widths` are the rows' text widths.
     */
    H.fitCommands = function(nodeHeight, widths, metrics, out) {
        out = out || {};
        const rows = Math.max(1, widths.length), padding = metrics.padding, full = metrics.lineHeight + 8;
        const minRow = Math.min(full, Math.max(34, (metrics.iconSize || 32) + 2));
        let widest = 0;
        for (let i = 0; i < widths.length; i++) widest = Math.max(widest, widths[i]);
        // Rows share the node's height: taller than stock when they are few, down to an icon and a pixel above and
        // below it when they are many. Past that the window grows instead, away from the edge its anchor holds,
        // rather than crush the icons together.
        out.itemHeight = clamp(Math.floor((nodeHeight - padding * 2) / rows), minRow, Math.round(full * 1.4));
        out.height = rows * out.itemHeight + padding * 2;
        // Rows squeezed into the node's height leave a pixel or two over: the window keeps the node's height.
        if (out.height < nodeHeight && nodeHeight - out.height < rows) out.height = nodeHeight;
        out.width = Math.ceil(widest) + (metrics.itemPadding || 8) * 2 + (metrics.colSpacing || 8) + padding * 2 + 8;
        return out;
    };

    /** The icon the HUD draws for Wait (an hourglass), End Turn (a flag), Mount and Dismount (a wheel and an arrow), `size` square at x, y. */
    H.drawGlyph = function(ctx, key, x, y, size, color) {
        const u = size / 16;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, u * 1.6);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (key === 'wait') {
            ctx.beginPath();
            ctx.moveTo(4 * u, 2.5 * u); ctx.lineTo(12 * u, 2.5 * u);
            ctx.moveTo(4 * u, 13.5 * u); ctx.lineTo(12 * u, 13.5 * u);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(4.8 * u, 2.5 * u); ctx.lineTo(11.2 * u, 2.5 * u); ctx.lineTo(8 * u, 8 * u);
            ctx.lineTo(11.2 * u, 13.5 * u); ctx.lineTo(4.8 * u, 13.5 * u); ctx.lineTo(8 * u, 8 * u);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(6.2 * u, 13 * u); ctx.lineTo(9.8 * u, 13 * u); ctx.lineTo(8 * u, 10 * u);
            ctx.closePath();
            ctx.fill();
        } else if (key === 'auto') {
            ctx.beginPath();
            ctx.moveTo(3 * u, 3 * u); ctx.lineTo(8 * u, 8 * u); ctx.lineTo(3 * u, 13 * u);
            ctx.moveTo(8.5 * u, 3 * u); ctx.lineTo(13.5 * u, 8 * u); ctx.lineTo(8.5 * u, 13 * u);
            ctx.stroke();
        } else if (key === 'overwatch') {
            ctx.beginPath();
            ctx.moveTo(1.5 * u, 8 * u);
            ctx.quadraticCurveTo(8 * u, 1.5 * u, 14.5 * u, 8 * u);
            ctx.quadraticCurveTo(8 * u, 14.5 * u, 1.5 * u, 8 * u);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(8 * u, 8 * u, 2.4 * u, 0, Math.PI * 2);
            ctx.fill();
        } else if (key === 'mount' || key === 'dismount') {
            // A wheel, and an arrow onto it or off it.
            const tip = key === 'mount' ? 5.8 : 1.4, tail = key === 'mount' ? 1.4 : 5.8;
            ctx.beginPath();
            ctx.arc(8 * u, 11 * u, 3.6 * u, 0, Math.PI * 2);
            ctx.moveTo(8 * u, tail * u); ctx.lineTo(8 * u, tip * u);
            ctx.moveTo(5.8 * u, 3.6 * u); ctx.lineTo(8 * u, tip * u); ctx.lineTo(10.2 * u, 3.6 * u);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(4 * u, 2 * u); ctx.lineTo(4 * u, 14 * u);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(4 * u, 2.5 * u); ctx.lineTo(13 * u, 5.5 * u); ctx.lineTo(4 * u, 8.5 * u);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    };

    /**
     * Why the player cannot do what is highlighted, as a label key (`whyCost`
     * comes with what is short in `out.what`), or '' when nothing is in the
     * way. `menu` is the highlighted row: `{ kind: 'command' | 'skill' | 'item',
     * symbol, enabled, item }`, or null with no menu up.
     */
    H.blockedReason = function(reader, menu, terms, out) {
        const state = reader.tacticalState();
        if (out) out.what = '';
        if (menu && menu.enabled === false) {
            // The battle knows why it greyed a choice of its own (nobody in reach): its reason, as a key it or the HUD has words for, comes first.
            const own = menu.kind === 'command' && typeof reader.commandReason === 'function' ? reader.commandReason(menu.symbol) : '';
            if (own && (H.LABELS[own] || H.battleTerm(reader, own))) return own;
            if (menu.kind === 'command') return menu.symbol === 'attack' ? 'whyAttack' : menu.symbol === 'skill' ? 'whySkill' : menu.symbol === 'item' ? 'whyItem' : 'whyUse';
            const active = reader.activeUnit();
            const battler = active ? (reader.unitInfo(active) || {}).battler : null;
            const item = menu.item;
            if (menu.kind === 'skill' && battler && item) {
                const mp = battler.skillMpCost ? battler.skillMpCost(item) : Number(item.mpCost) || 0;
                const tp = battler.skillTpCost ? battler.skillTpCost(item) : Number(item.tpCost) || 0;
                if (mp > battler.mp) { if (out) out.what = terms ? terms.mp : 'MP'; return 'whyCost'; }
                if (tp > battler.tp) { if (out) out.what = terms ? terms.tp : 'TP'; return 'whyCost'; }
            }
            return 'whyUse';
        }
        if (state === 'target') {
            const cursor = reader.cursor ? reader.cursor() : null;
            if (cursor && typeof reader.inRange === 'function' && !reader.inRange(cursor.x, cursor.y)) return 'whyRange';
            const targets = reader.targetsAtCursor ? reader.targetsAtCursor() : null;
            if (targets && targets.length === 0) return 'whyNoTarget';
        }
        return '';
    };

    const reasonOut = { what: '' };

    /** The battle's own words for a key (`term(key)`: its terms, which a project replaces in one place), or '' when it has none. */
    H.battleTerm = function(reader, key) {
        return typeof reader.term === 'function' ? String(reader.term(key) || '') : '';
    };

    /** The words for why a choice cannot be made: the node's own label, else the battle's words for a reason it gave, else the HUD's. */
    H.reasonText = function(node, reader, key) {
        return (node && node.fightLabels && node.fightLabels[key]) || H.battleTerm(reader, key) || H.LABELS[key] || '';
    };

    /** The words for the side whose turn it is ("Player Phase"), or '' where the turns are not by side. */
    H.phaseText = function(node, reader) {
        const team = reader.currentTeam ? reader.currentTeam() : 'any';
        return team === 'ally' ? H.label(node, 'allyPhase') : team === 'enemy' ? H.label(node, 'enemyPhase') : '';
    };

    /** The text of a Battle Text node now. `menu` is the highlighted menu row (see `blockedReason`). */
    H.infoText = function(node, reader, menu, terms) {
        const phase = H.phaseText(node, reader);
        switch (node.fightInfo) {
            case 'objective': return String(reader.objectiveText() || '');
            case 'turn': {
                // Before the first turn (the opening) there is no turn to name.
                const turn = reader.turn ? Number(reader.turn()) || 0 : 0;
                return turn > 0 ? H.label(node, 'turn') + ' ' + turn + (phase ? '  ·  ' + phase : '') : '';
            }
            // The banner as a still picture: what the battle announces (a new goal), else the phase. In a running
            // battle the two take turns on it (`bannerStep`).
            case 'phase': return H.bannerNotice(reader) || phase;
            case 'hint': {
                const state = reader.tacticalState();
                const item = reader.pendingItem();
                // Why what the player is pointing at cannot be done comes before anything else the line could say.
                const why = H.blockedReason(reader, menu || null, terms || null, reasonOut);
                if (why) return (item && item.name && state === 'target' ? item.name + ': ' : '') + H.reasonText(node, reader, why).replace('%1', reasonOut.what);
                // The battle's own line (what the player can do now, taught a control at a time), then the plain name of the stage.
                const own = typeof reader.hintText === 'function' ? String(reader.hintText() || '') : '';
                if (own) return own;
                if (state === 'unit') return H.label(node, 'hintUnit');
                if (state === 'move') return H.label(node, 'hintMove');
                if (state === 'command' || state === 'skill' || state === 'item') return H.label(node, 'hintCommand');
                if (state === 'target') return (item && item.name ? item.name + ': ' : '') + H.label(node, 'hintTarget');
                if (state === 'enemy') return H.label(node, H.movingSide(reader) === 'ally' ? 'hintAlly' : 'hintEnemy');
                return '';
            }
            default: return '';
        }
    };

    /** What the battle itself puts on the phase banner now (`notice()`: a goal that changed), or ''. */
    H.bannerNotice = function(reader) {
        return typeof reader.notice === 'function' ? String(reader.notice() || '') : '';
    };

    /**
     * Whose units are moving by themselves: what the battle says (`actingTeam()`), else the acting unit's side
     * (the player's own under Auto, an ally that fights by itself), else the side whose turn it is. 'enemy'
     * when nothing says.
     */
    H.movingSide = function(reader) {
        let team = typeof reader.actingTeam === 'function' ? reader.actingTeam() : '';
        if (!team) {
            const unit = reader.activeUnit ? reader.activeUnit() : null;
            team = unit && unit.team ? unit.team : reader.currentTeam ? reader.currentTeam() : '';
        }
        return team === 'ally' ? 'ally' : 'enemy';
    };

    //-------------------------------------------------------------------------
    // The names of keys and gamepad buttons, as a hint or a controls page
    // writes them. A battle looks up which key its mapping gives an action
    // and names it here, so every line says the same word for the same key.

    H.KEY_NAMES = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Ctrl', 18: 'Alt', 27: 'Esc', 32: 'Space', 33: 'Page Up', 34: 'Page Down',
        35: 'End', 36: 'Home', 37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 45: 'Insert', 46: 'Delete' };
    H.BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right'];
    // The keys a player knows best, best first: where an action has several keys, a hint names the first of these it has.
    H.KEY_ORDER = [13, 27, 32, 16, 9, 17, 37, 38, 39, 40];

    /** A key by its code: its letter or digit, or its short name; '' for a key that has none. */
    H.keyName = function(code) {
        code = Number(code);
        if (code >= 48 && code <= 57) return String(code - 48);
        if (code >= 65 && code <= 90) return String.fromCharCode(code);
        if (code >= 96 && code <= 105) return 'Num ' + (code - 96);
        if (code >= 112 && code <= 123) return 'F' + (code - 111);
        return H.KEY_NAMES[code] || '';
    };

    /** How well known a key is, lower first: the named keys of H.KEY_ORDER, then letters, digits, the other named keys, the number pad, the function keys. */
    H.keyRank = function(code) {
        code = Number(code);
        const known = H.KEY_ORDER.indexOf(code);
        if (known >= 0) return known;
        if (code >= 65 && code <= 90) return 20 + code - 65;
        if (code >= 48 && code <= 57) return 50 + code - 48;
        if (H.KEY_NAMES[code]) return 60 + code;
        if (code >= 96 && code <= 105) return 200 + code - 96;
        if (code >= 112 && code <= 123) return 220 + code - 112;
        return Infinity;
    };

    /** A gamepad button by its index (the standard layout); '' past the ones every pad has. */
    H.buttonName = function(index) {
        return H.BUTTON_NAMES[Number(index)] || '';
    };

    //-------------------------------------------------------------------------
    // Drawing. A theme gives the fonts, colors, terms and pictures:
    //   font(size, bold) -> CSS font       textColor, systemColor, outlineColor, outlineWidth
    //   gauge: { hp: [a, b], mp: [a, b], tp: [a, b], back }      crisisColor, deathColor
    //   terms: { level, hp, mp, tp }
    //   face(name), character(name), enemy(name), icons() -> a drawable picture, null while it loads, false when there is none
    //   iconSize (32), faceSize (144)

    function write(ctx, theme, value, x, y, w, h, align, color, size, bold) {
        if (value === '' || value == null || w <= 0) return;
        ctx.font = theme.font(size, !!bold);
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
        const ty = Math.round(y + h / 2 + size * 0.35);
        if (theme.outlineWidth > 0) {
            ctx.lineJoin = 'round';
            ctx.strokeStyle = theme.outlineColor;
            ctx.lineWidth = theme.outlineWidth;
            ctx.strokeText(value, tx, ty, w);
        }
        ctx.fillStyle = color;
        ctx.fillText(value, tx, ty, w);
    }

    function rounded(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    H.initials = function(name) {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        const first = Array.from(words[0])[0] || '';
        const second = words.length > 1 ? Array.from(words[words.length - 1])[0] || '' : '';
        return (first + second).toUpperCase();
    };

    /**
     * Which picture stands for a unit: its face, else a portrait of its
     * model, else its map sprite's front frame, else an enemy's battle
     * picture, else its initials. `theme.thumbnail(model)` gives the model's
     * portrait, null while it is being made (a plain figure stands in), false
     * when there is none to be had; nothing here needs a 3D map.
     */
    H.portraitKind = function(view, theme) {
        if (view.faceName) return 'face';
        if (view.model && theme && theme.thumbnail) {
            const picture = theme.thumbnail(view.model);
            if (picture) return 'model';
            if (picture === null) return 'modelPending';
        }
        if (view.characterName) return 'character';
        // A unit shown by a model has no use for its battle picture (often a leftover name with no file).
        if (view.battlerName && !view.model && theme && theme.enemy) return 'battler';
        return 'initials';
    };

    /** A plain figure for a unit whose portrait is not there yet: head and shoulders, in its side's color. */
    H.drawSilhouette = function(ctx, x, y, size, color) {
        ctx.save();
        ctx.globalAlpha *= 0.22;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
        ctx.globalAlpha /= 0.22;
        ctx.globalAlpha *= 0.55;
        ctx.fillStyle = '#c8ccd6';
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size * 0.4, size * 0.19, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + size * 0.14, y + size);
        ctx.quadraticCurveTo(x + size * 0.16, y + size * 0.66, x + size / 2, y + size * 0.64);
        ctx.quadraticCurveTo(x + size * 0.84, y + size * 0.66, x + size * 0.86, y + size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    /** The front-facing standing frame of a character sheet: `[sx, sy, sw, sh]` on a picture `width` x `height`. */
    H.characterFrame = function(name, index, width, height) {
        const sign = String(name).replace(/^.*\//, '').match(/^[!$]+/);
        const big = !!sign && sign[0].includes('$');
        const cw = big ? width / 3 : width / 12;
        const ch = big ? height / 4 : height / 8;
        const bx = big ? 0 : (index % 4) * 3;
        const by = big ? 0 : Math.floor(index / 4) * 4;
        return [(bx + 1) * cw, by * ch, cw, ch];
    };

    /**
     * A unit's picture in a square frame, centered in it with the same inset
     * on every side and never over its border. A face fills the picture's
     * square (its cell is one); a model's portrait likewise; a map sprite is
     * enlarged in whole steps and an enemy's battle picture scaled to fit,
     * both shown whole and centered. `ring`, when given, is the frame's color
     * (the acting unit's gold) with the side's color as a line inside it.
     * Returns false when its picture is still loading.
     */
    H.portraitInset = (size, border) => border + Math.max(1, Math.round(size * 0.025));

    H.drawPortrait = function(ctx, x, y, size, view, theme, color, border, ring) {
        let ready = true;
        const radius = Math.round(size * 0.07);
        const inset = H.portraitInset(size, border) + (ring ? 2 : 0);
        const ix = x + inset, iy = y + inset, inner = size - inset * 2;
        const kind = H.portraitKind(view, theme);
        ctx.save();
        rounded(ctx, x, y, size, size, radius);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        rounded(ctx, ix, iy, inner, inner, Math.max(0, radius - inset));
        ctx.clip();
        if (kind !== 'face') {
            ctx.globalAlpha *= 0.3;
            ctx.fillStyle = color;
            ctx.fillRect(ix, iy, inner, inner);
            ctx.globalAlpha /= 0.3;
        }
        let drawn = false;
        const smooth = ctx.imageSmoothingEnabled;
        if (kind === 'face') {
            const picture = theme.face(view.faceName);
            // null: still loading. false: no such picture, so the initials stand in.
            if (picture) {
                const cell = theme.faceSize || 144;
                ctx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(picture, (view.faceIndex % 4) * cell, Math.floor(view.faceIndex / 4) * cell, cell, cell, ix, iy, inner, inner);
                drawn = true;
            } else if (picture === null) ready = false;
        } else if (kind === 'character') {
            const picture = theme.character(view.characterName);
            if (picture) {
                const frame = H.characterFrame(view.characterName, view.characterIndex, picture.width, picture.height);
                // Whole steps of enlargement keep pixel art sharp; a sprite taller than the picture shows from the head down.
                const scale = Math.max(1, Math.floor(inner / Math.max(1, frame[2], frame[3])));
                const dw = frame[2] * scale, dh = frame[3] * scale;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(picture, frame[0], frame[1], frame[2], frame[3], ix + Math.round((inner - dw) / 2), dh > inner ? iy : iy + Math.round((inner - dh) / 2), dw, dh);
                drawn = true;
            } else if (picture === null) ready = false;
        } else if (kind === 'battler') {
            const picture = theme.enemy(view.battlerName);
            if (picture && picture.width > 1 && picture.height > 1) {
                const scale = Math.min(inner / picture.width, inner / picture.height);
                const dw = Math.round(picture.width * scale), dh = Math.round(picture.height * scale);
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(picture, 0, 0, picture.width, picture.height, ix + Math.round((inner - dw) / 2), iy + Math.round((inner - dh) / 2), dw, dh);
                drawn = true;
            } else if (picture === null) ready = false;
        } else if (kind === 'model') {
            ctx.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(theme.thumbnail(view.model), ix, iy, inner, inner);
            drawn = true;
        } else if (kind === 'modelPending') {
            H.drawSilhouette(ctx, ix, iy, inner, color);
            drawn = true;
            ready = false;
        }
        ctx.imageSmoothingEnabled = smooth;
        if (!drawn) write(ctx, theme, H.initials(view.name), ix, iy, inner, inner, 'center', '#ffffff', Math.max(10, Math.round(inner * 0.42)), true);
        ctx.restore();
        if (border > 0) {
            ctx.save();
            rounded(ctx, x + border / 2, y + border / 2, size - border, size - border, Math.max(0, radius - border / 2));
            ctx.strokeStyle = ring || color;
            ctx.lineWidth = border;
            ctx.stroke();
            if (ring) {
                rounded(ctx, x + border + 0.5, y + border + 0.5, size - border * 2 - 1, size - border * 2 - 1, Math.max(0, radius - border));
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();
        }
        return ready;
    };

    /**
     * Where a Unit Panel's parts sit inside its `width` x `height` contents:
     * the portrait a square the height of the contents (centered when it is
     * capped), the states along its lower edge, and beside it the name, the
     * gauges and the parameters, the whole column centered top to bottom.
     */
    /** The gauge of the vehicle a unit rides: its colours, whatever the theme. */
    H.VEHICLE_GAUGE = ['#b9781a', '#f2b33d'];

    H.unitLayout = function(node, width, height, showTp, forecast, vehicle) {
        const fields = node.fightFields || H.UNIT_FIELDS;
        const has = key => fields.includes(key);
        const clipped = node.gaugeStyle !== 'bar';
        forecast = !!forecast && has('preview');
        // While an action is aimed the forecast is what the panel is for: HP stays, MP, TP and the parameters make room.
        // (`vhp`: the life of what the unit rides, under its own.)
        const rides = !!vehicle && has('hp');
        const gauges = ['hp', 'vhp', 'mp', 'tp'].filter(key => (key === 'vhp' ? rides : has(key)) && (key !== 'tp' || showTp !== false) && (!forecast || key === 'hp'));
        const statKeys = has('stats') && !forecast ? (node.fightStats || H.DEFAULT_STATS) : [];
        const header = has('name') || has('level');
        // Sized as the resting panel is, so the name and HP do not jump when the forecast comes up.
        const restGauges = ['hp', 'mp', 'tp'].filter(key => has(key) && (key !== 'tp' || showTp !== false)).length + (rides ? 1 : 0);
        const restStats = has('stats') ? (node.fightStats || H.DEFAULT_STATS).length : 0;
        const size = has('portrait') ? Math.max(0, Math.floor(Math.min(node.fightPortrait > 0 ? node.fightPortrait : 9999, height, width * 0.42))) : 0;
        // Three parameters to a row where a label and its number have the room, else two.
        let columns = 3, total = 0, unit = 0, gap = 0, x = 0, cw = 0;
        for (;;) {
            total = (header ? 1.15 : 0) + restGauges + Math.ceil(restStats / columns) * 0.85;
            unit = clamp(Math.floor(height / Math.max(1, total)), 12, 46);
            gap = Math.round(unit * 0.45);
            x = size ? size + gap : 0;
            cw = Math.max(1, width - x);
            if (columns === 2 || !restStats || cw / columns >= clamp(Math.round(unit * 0.58), 9, 22) * 4.4) break;
            columns = 2;
        }
        const blockRows = forecast ? 0 : Math.ceil(statKeys.length / columns);
        const icon = has('states') ? (size ? clamp(Math.round(size * 0.2), 14, 32) : clamp(Math.round(unit * 0.95), 14, 32)) : 0;
        const layout = { unit, clipped, font: clamp(Math.round(unit * 0.72), 10, 26), small: clamp(Math.round(unit * 0.58), 9, 22), icon,
            portrait: size ? { x: 0, y: Math.floor((height - size) / 2), width: size, height: size } : null, states: null, header: null, gauges: [], stats: [], block: null, forecast: null };
        if (icon && size) {
            const inset = H.portraitInset(size, Math.max(2, Math.round(unit / 9))) + 2;
            layout.states = { x: inset, y: layout.portrait.y + size - inset - icon, width: size - inset * 2, height: icon, over: true };
        } else if (icon) layout.states = { x: x + Math.floor(cw / 2), y: 0, width: Math.ceil(cw / 2), height: icon, over: false };
        // The column is as tall as its rows; what is left over is shared above and below it.
        let y = Math.max(0, Math.floor((height - total * unit) / 2));
        if (header) {
            const h = Math.round(unit * 1.15);
            layout.header = { x, y, width: cw, height: h };
            y += h;
        }
        for (const key of gauges) {
            layout.gauges.push({ key, x, y: Math.round(y), width: cw, height: unit });
            y += unit;
        }
        if (forecast) {
            const top = Math.round(y + unit * 0.15);
            layout.forecast = { x, y: top, width: cw, height: Math.max(0, Math.floor(height - top)) };
            return layout;
        }
        const rowHeight = Math.round(unit * 0.85);
        const cell = cw / columns;
        statKeys.forEach((key, index) => layout.stats.push({ key, x: Math.round(x + (index % columns) * cell), y: Math.round(y + Math.floor(index / columns) * rowHeight),
            width: Math.floor(cell - (index % columns === columns - 1 ? 0 : Math.max(8, unit * 0.5))), height: rowHeight }));
        if (blockRows) layout.block = { x, y: Math.round(y), width: cw, height: blockRows * rowHeight, rowHeight };
        return layout;
    };

    /** A bar with its top-left and bottom-right corners cut, as a path. */
    function clippedPath(ctx, x, y, w, h, cut) {
        cut = Math.max(0, Math.min(cut, h, w / 2));
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
    }

    /**
     * One gauge row. Clipped: the label in a column of its own, then a tall
     * bar with two corners cut and the numbers on it at its right end; the
     * fill ends on the same slant. Bar: the label and numbers over a thin
     * bar. `mark` is a lighter stretch of the bar from `mark.from` to
     * `mark.to` (0 to 1): what the aimed action would take, or what was just
     * lost.
     */
    H.drawGauge = function(ctx, r, layout, label, value, rate, colors, back, theme, valueColor, mark, markColor) {
        rate = clamp(rate, 0, 1);
        if (!layout.clipped) {
            const bar = Math.max(4, Math.round(layout.unit * 0.26)), by = r.y + r.height - bar - 1;
            ctx.fillStyle = back;
            ctx.fillRect(r.x, by, r.width, bar);
            const fill = Math.round(r.width * rate);
            if (fill > 0) {
                const gradient = ctx.createLinearGradient(r.x, by, r.x + r.width, by);
                gradient.addColorStop(0, colors[0]);
                gradient.addColorStop(1, colors[1]);
                ctx.fillStyle = gradient;
                ctx.fillRect(r.x, by, fill, bar);
            }
            if (mark) {
                ctx.fillStyle = markColor;
                ctx.fillRect(r.x + Math.round(r.width * mark.from), by, Math.max(0, Math.round(r.width * (mark.to - mark.from))), bar);
            }
            write(ctx, theme, label, r.x, r.y, r.width * 0.3, r.height - bar, 'left', theme.systemColor, layout.small, false);
            if (value) write(ctx, theme, value, r.x + r.width * 0.3, r.y, r.width * 0.7, r.height - bar, 'right', valueColor, layout.small, false);
            return;
        }
        const labelWidth = Math.round(layout.small * 2.1);
        const bar = Math.max(8, Math.round(r.height * 0.62)), by = r.y + Math.round((r.height - bar) / 2);
        const bx = r.x + labelWidth, bw = Math.max(8, r.width - labelWidth), cut = Math.round(bar * 0.5);
        write(ctx, theme, label, r.x, r.y, labelWidth - 4, r.height, 'left', theme.systemColor, layout.small, false);
        ctx.save();
        clippedPath(ctx, bx, by, bw, bar, cut);
        ctx.fillStyle = back;
        ctx.fill();
        ctx.clip();
        const fill = Math.round(bw * rate);
        if (fill > 0) {
            const gradient = ctx.createLinearGradient(bx, by, bx + bw, by);
            gradient.addColorStop(0, colors[0]);
            gradient.addColorStop(1, colors[1]);
            // The fill ends on the bar's own slant; a full bar ends where the bar does.
            clippedPath(ctx, bx, by, Math.max(fill, cut * 2), bar, cut);
            ctx.fillStyle = gradient;
            ctx.fill();
            // A lighter upper edge, so the bar reads as a strip and not a flat block.
            ctx.globalAlpha *= 0.22;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bx, by, Math.max(fill, cut * 2), Math.max(1, Math.round(bar * 0.18)));
            ctx.globalAlpha /= 0.22;
        }
        if (mark) {
            ctx.fillStyle = markColor;
            ctx.fillRect(bx + Math.round(bw * mark.from), by, Math.max(0, Math.round(bw * (mark.to - mark.from))), bar);
        }
        ctx.restore();
        if (value) write(ctx, theme, value, bx + cut, by, bw - cut * 2 - 2, bar + 1, 'right', valueColor, clamp(Math.round(bar * 0.86), 9, layout.small), false);
    };

    const markOut = { from: 0, to: 0 };
    // The stretch of an HP bar an aimed blow would take (or that was just lost), and what a heal would give back:
    // colors the numbers on the bar stay readable over.
    H.MARK_COLORS = { loss: 'rgba(214,40,40,0.92)', heal: 'rgba(60,200,110,0.92)' };

    /** A Unit Panel's contents at the origin. Returns false while a picture it needs is still loading. */
    H.drawUnit = function(ctx, width, height, node, view, theme) {
        const fields = node.fightFields || H.UNIT_FIELDS;
        const preview = fields.includes('preview') ? view.preview : null;
        const layout = H.unitLayout(node, width, height, view.showTp, !!preview, view.vmhp > 0);
        const color = H.teamColor(node, view.team);
        let ready = true;
        if (layout.portrait) ready = H.drawPortrait(ctx, 0, layout.portrait.y, layout.portrait.width, view, theme, color, Math.max(2, Math.round(layout.unit / 9)));
        if (view.watch) H.drawWatchTag(ctx, layout, node, view, theme);
        if (layout.header) {
            const r = layout.header;
            // Stepping through an area action's targets: which of how many, where the level was.
            const area = preview && view.area ? view.area : null;
            const level = area ? (area.index + 1) + '/' + area.count
                : fields.includes('level') && view.level > 0 ? theme.terms.level + ' ' + view.level : '';
            const levelWidth = level ? Math.min(r.width * 0.4, layout.font * 3.6) : 0;
            if (fields.includes('name')) write(ctx, theme, view.name, r.x, r.y, r.width - levelWidth - (level ? 6 : 0), r.height - 4, 'left', theme.textColor, layout.font, true);
            if (level) write(ctx, theme, level, r.x + r.width - levelWidth, r.y, levelWidth, r.height - 4, 'right', theme.systemColor, layout.small, false);
            ctx.fillStyle = color;
            ctx.fillRect(r.x, r.y + r.height - 4, r.width, 2);
        }
        for (const r of layout.gauges) {
            if (r.key === 'vhp') {
                H.drawGauge(ctx, r, layout, view.vname || theme.terms.hp, view.vhp + '/' + view.vmhp, view.vmhp > 0 ? view.vhp / view.vmhp : 0,
                    H.VEHICLE_GAUGE, theme.gauge.back, theme, view.vhp <= 0 ? theme.deathColor : view.vhp / view.vmhp < 0.25 ? theme.crisisColor : theme.textColor, null, '');
                continue;
            }
            const value = view[r.key], max = r.key === 'hp' ? view.mhp : r.key === 'mp' ? view.mmp : view.mtp;
            let mark = null, markColor = '';
            if (r.key === 'hp' && max > 0) {
                if (preview) {
                    // What the aimed action would take (or give back).
                    markOut.from = (preview.heals ? value : Math.max(0, value - preview.damageMax)) / max;
                    markOut.to = (preview.heals ? Math.min(max, value + preview.damageMax) : value) / max;
                    mark = markOut; markColor = preview.heals ? H.MARK_COLORS.heal : H.MARK_COLORS.loss;
                } else if (view.hpShown > value) {
                    // What was just lost, running down to where the bar now ends.
                    markOut.from = value / max; markOut.to = Math.min(1, view.hpShown / max);
                    mark = markOut; markColor = H.MARK_COLORS.loss;
                }
            }
            const shown = r.key === 'hp' && view.hpShown >= 0 && view.hpShown < value ? view.hpShown : value;
            const low = r.key === 'hp' && max > 0 && value / max < 0.25;
            H.drawGauge(ctx, r, layout, theme.terms[r.key], max > 0 || r.key === 'hp' ? (r.key === 'tp' ? String(value) : value + '/' + max) : '', max > 0 ? shown / max : 0,
                theme.gauge[r.key], theme.gauge.back, theme, value <= 0 && r.key === 'hp' ? theme.deathColor : low ? theme.crisisColor : theme.textColor, mark, markColor);
        }
        if (layout.states && view.icons.length) {
            const sheet = theme.icons();
            if (sheet) {
                const r = layout.states, cell = theme.iconSize || 32;
                const count = Math.min(view.icons.length, Math.max(1, Math.floor((r.width + 2) / (layout.icon + 2))));
                for (let i = 0; i < count; i++) {
                    const index = view.icons[i];
                    ctx.drawImage(sheet, (index % 16) * cell, Math.floor(index / 16) * cell, cell, cell, r.x + i * (layout.icon + 2), r.y, layout.icon, layout.icon);
                }
            } else if (sheet === null) ready = false;
        }
        if (layout.forecast && preview) H.drawPreview(ctx, layout.forecast, node, preview, theme, view.area || null);
        else for (const r of layout.stats) {
            write(ctx, theme, H.label(node, r.key), r.x, r.y, r.width * 0.6, r.height, 'left', theme.systemColor, layout.small, false);
            write(ctx, theme, String(view.stats[r.key] || 0), r.x + r.width * 0.45, r.y, r.width * 0.55, r.height, 'right', theme.textColor, layout.small, false);
        }
        return ready;
    };

    /** The words for a unit that keeps watch: the node's own label, else the battle's, else the HUD's. */
    H.watchText = function(node, view) {
        return (node && node.fightLabels && node.fightLabels.watch) || view.watchText || H.LABELS.watch;
    };

    /**
     * A unit keeping watch says so on its panel: a dark band across the top of its portrait with the words in the
     * acting color (the states keep the portrait's foot); with no portrait, the same band under the panel's header.
     */
    H.drawWatchTag = function(ctx, layout, node, view, theme) {
        const text = H.watchText(node, view);
        if (!text) return;
        const band = clamp(Math.round(layout.small * 1.5), 12, 30);
        let x = 0, y = 0, width = 0;
        if (layout.portrait) {
            const inset = H.portraitInset(layout.portrait.width, Math.max(2, Math.round(layout.unit / 9)));
            x = inset; y = layout.portrait.y + inset; width = layout.portrait.width - inset * 2;
        } else if (layout.header) {
            x = layout.header.x; y = layout.header.y + layout.header.height; width = layout.header.width;
        } else return;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(x, y, width, band);
        ctx.fillStyle = H.ACTIVE_COLOR;
        ctx.fillRect(x, y + band - 2, width, 2);
        write(ctx, theme, text, x + 2, y, width - 4, band - 2, 'center', H.ACTIVE_COLOR, layout.small, true);
    };

    // The same pen for the other map battle HUDs (reactor_ui_action.js), so a game that changes mode keeps one look.
    H.text = write;
    H.roundedPath = rounded;
    H.clippedPath = clippedPath;

    H.percent = rate => Math.round(clamp(Number(rate) || 0, 0, 1) * 100) + '%';
    H.rangeText = (min, max) => (min === max || max == null ? String(min) : min + '-' + max);

    /** What stands between the blow and its full weight, or adds to it: cover, the side it comes from, the height. */
    H.previewNotes = function(node, preview, out) {
        out = out || [];
        out.length = 0;
        if (preview.cover === 2) out.push(H.label(node, 'fullCover'));
        else if (preview.cover === 1) out.push(H.label(node, 'halfCover'));
        if (preview.flank === 'back') out.push(H.label(node, 'back'));
        else if (preview.flank === 'side') out.push(H.label(node, 'side'));
        if (preview.height > 0) out.push(H.label(node, 'highGround'));
        else if (preview.height < 0) out.push(H.label(node, 'lowGround'));
        return out;
    };

    const notes = [];

    /**
     * The aimed action's forecast, large: hit chance and damage on the first
     * line, critical and what changes the blow on the second (a blow that
     * finishes the target says so on a red band instead), and, for an action
     * that lands on several units, all of them summed up on a third.
     */
    H.drawPreview = function(ctx, rect, node, preview, theme, area) {
        const row = Math.floor(rect.height / (area ? 3 : 2));
        const big = clamp(Math.round(row * (area ? 0.72 : 0.62)), 11, 34);
        const small = clamp(Math.round(row * (area ? 0.56 : 0.46)), 9, 24);
        const amount = H.label(node, preview.heals ? 'heal' : 'damage') + ' ' + H.rangeText(preview.damageMin, preview.damageMax);
        const hit = H.label(node, 'hit') + ' ' + H.percent(preview.hit);
        // The two numbers share the line with a clear gap between them: the type shrinks before they meet.
        ctx.font = theme.font(big, true);
        const measured = text => { const m = ctx.measureText(text); return m && m.width > 0 ? m.width : text.length * big * 0.56; };
        const hitWidth = measured(hit), amountWidth = measured(amount), room = rect.width - big * 0.9;
        const fitted = hitWidth + amountWidth > room ? Math.max(10, Math.floor(big * room / (hitWidth + amountWidth))) : big;
        const share = (hitWidth + big * 0.45) / (hitWidth + amountWidth + big * 0.9);
        write(ctx, theme, hit, rect.x, rect.y, rect.width * share, row, 'left', theme.textColor, fitted, true);
        write(ctx, theme, amount, rect.x + rect.width * share, rect.y, rect.width * (1 - share), row, 'right', preview.heals ? theme.gauge.hp[1] : theme.textColor, fitted, true);
        const y = rect.y + row;
        const crit = preview.critical > 0 ? H.label(node, 'critical') + ' ' + H.percent(preview.critical) : '';
        if (crit) write(ctx, theme, crit, rect.x, y, rect.width * 0.4, row, 'left', theme.crisisColor, small, false);
        if (preview.defeats && !preview.heals) {
            const w = Math.round(rect.width * 0.56), h = Math.round(row * 0.84), x = rect.x + rect.width - w, top = y + Math.round((row - h) / 2);
            ctx.save();
            rounded(ctx, x, top, w, h, Math.round(h * 0.25));
            ctx.fillStyle = theme.deathColor;
            ctx.fill();
            ctx.restore();
            write(ctx, theme, H.label(node, 'defeats').toUpperCase(), x + 4, top, w - 8, h, 'center', '#ffffff', clamp(Math.round(h * 0.66), 10, 30), true);
        } else {
            const words = H.previewNotes(node, preview, notes).join(' · ');
            if (words) write(ctx, theme, words, rect.x + rect.width * (crit ? 0.4 : 0), y, rect.width * (crit ? 0.6 : 1), row, 'right',
                preview.cover > 0 ? theme.systemColor : theme.crisisColor, small, true);
        }
        if (area) {
            const line = area.count + ' ' + H.label(node, 'targets') + ':  ' + H.label(node, 'hit') + ' ' + (area.hitMin === area.hitMax ? H.percent(area.hitMax)
                : Math.round(area.hitMin * 100) + '-' + H.percent(area.hitMax)) + '  ' + H.label(node, area.heals === area.count ? 'heal' : 'damage') + ' ' + H.rangeText(area.damageMin, area.damageMax)
                + (area.defeats ? '  ' + H.label(node, 'defeats') + ' ' + area.defeats : '');
            const top = rect.y + row * 2;
            ctx.fillStyle = theme.gauge.back;
            ctx.fillRect(rect.x, top + 1, rect.width, 1);
            write(ctx, theme, line, rect.x, top + 2, rect.width, rect.height - row * 2 - 2, 'left', area.defeats ? theme.crisisColor : theme.systemColor, small, false);
        }
    };

    // The turn strip's tiles. With no size of its own a tile takes three quarters of the strip's room, so a long
    // order fits; the acting unit's tile is a little larger than the rest (it grows around its own place, into the
    // gaps beside it, so no other tile moves when the turn passes); and before the strip gives up showing everyone
    // it shrinks its tiles to this share of their size.
    H.TURN_REST = 0.75;
    H.TURN_ACTIVE = 1.15;
    H.TURN_SMALL = 0.7;
    // The smallest tile a face still reads in.
    H.TURN_LEAST = 16;

    /**
     * Where the turn tiles sit in a strip `width` x `height`. `order` is the
     * battle's turn order; the fallen are left out. A tile is `out.size`
     * square (the node's Cell Size, else H.TURN_REST of the strip's room),
     * one every `size + cellGap` (three gaps where the other side begins);
     * the acting unit's is `out.big`, centered on its own place and never
     * nearer than a pixel to its neighbors. When everyone fits, everyone
     * has a tile; a long order shrinks the tiles (down to H.TURN_SMALL of
     * their size) until it does. An army does not fit even so: each side
     * then shows its first few (the side whose turn it is takes the larger
     * share, and the acting unit is always among them) and ends in a box with
     * the count of its others; under initiative, where the sides are mixed,
     * the strip ends in one such box. Writes `out.size`, `out.big`, `out.top`
     * (how far down a tile sits so its middle is level with the acting
     * tile's), `out.count`, `out.ids[]`, `out.xs[]`, `out.sizes[]`,
     * `out.entries[]`, and `out.chips` (`out.chipCount` of them: `{ x, count,
     * team }`, team '' for a mixed count), and returns `out`.
     */
    H.turnLayout = function(node, width, height, order, out) {
        out = out || {};
        const ids = out.ids || (out.ids = []), xs = out.xs || (out.xs = []), entries = out.entries || (out.entries = []), sizes = out.sizes || (out.sizes = []);
        const all = out.all || (out.all = []), chips = out.chips || (out.chips = [{ x: 0, count: 0, team: '' }, { x: 0, count: 0, team: '' }]);
        const marker = Math.max(4, Math.round(height * 0.12));
        const room = Math.max(8, height - marker);
        const rest = Math.max(8, Math.min(room, node.cellSize > 0 ? node.cellSize : Math.round(room * H.TURN_REST)));
        const least = Math.min(rest, Math.max(H.TURN_LEAST, Math.round(rest * H.TURN_SMALL)));
        const gap = node.cellGap, limit = node.maxCells > 0 ? node.maxCells : 9999;
        // The acting tile grows into the gaps beside it and stops a pixel short of its neighbors.
        const bigOf = size => Math.min(Math.max(room, size), Math.round(size * H.TURN_ACTIVE), size + 2 * Math.max(0, gap - 1));
        // Everyone standing, and whether the order is one side after the other (team turns) or mixed (initiative).
        all.length = 0;
        let breaks = 0, split = 0;
        for (let i = 0; i < order.length; i++) {
            if (order[i].defeated) continue;
            if (all.length && order[i].team !== all[all.length - 1].team) { breaks++; split = all.length; }
            all.push(order[i]);
        }
        const total = all.length, sides = breaks === 1 ? 2 : 1;
        if (sides === 1) split = total;
        // The room an acting tile's growth takes at the strip's two ends is always kept, so the row stands still whoever acts.
        const used = (boxes, teamGaps, size) => boxes * size + (bigOf(size) - size) + Math.max(0, boxes - 1) * gap + teamGaps * gap * 2;
        // A long order: the tiles shrink until everyone has one, as far as they still read.
        let size = rest;
        let fits = total <= limit && used(total, sides - 1, size) <= width;
        while (!fits && total <= limit && size > least) { size--; fits = used(total, sides - 1, size) <= width; }
        // Counting instead: at the full size where the node's own limit is what cuts the strip short, else at the smallest.
        if (!fits) size = used(Math.min(total, limit + sides), sides - 1, rest) <= width ? rest : least;
        const big = bigOf(size), over = Math.floor((big - size) / 2);
        let count = 0, x = over, chipCount = 0;
        const place = entry => { ids[count] = entry.unitId; xs[count] = entry.active ? x - over : x; sizes[count] = entry.active ? big : size; entries[count] = entry; count++; x += size + gap; };
        const chip = (number, team) => { const c = chips[chipCount++]; c.x = x; c.count = number; c.team = team; x += size + gap; };
        if (fits) {
            for (let i = 0; i < total; i++) { if (i === split && i > 0) x += gap * 2; place(all[i]); }
        } else {
            // Boxes there is room for, count boxes included (the acting tile's extra width set aside).
            let slots = Math.max(1, Math.floor((width - (sides - 1) * gap * 2 + gap - (big - size)) / (size + gap)));
            if (limit < 9999) slots = Math.min(slots, limit + sides);
            // Each side's share of them: the side whose turn it is the larger; a side that needs fewer gives the rest away.
            let first = sides === 2 ? Math.max(1, Math.min(slots - 1, Math.round(slots * 0.6))) : slots, second = slots - first;
            if (sides === 2) {
                if (split <= first) { first = split; second = slots - first; }
                else if (total - split <= second) { second = total - split; first = slots - second; }
            }
            for (let side = 0; side < sides; side++) {
                const from = side === 0 ? 0 : split, to = side === 0 ? split : total, members = to - from, share = side === 0 ? first : second;
                if (side === 1) x += gap * 2;
                if (members <= share) { for (let i = from; i < to; i++) place(all[i]); continue; }
                const shown = Math.max(0, share - 1);
                // The acting unit is always among those shown: first, when it would have been cut.
                let cut = -1;
                for (let i = from + shown; i < to && shown > 0; i++) if (all[i].active) { cut = i; break; }
                if (cut >= 0) place(all[cut]);
                for (let i = from; i < from + shown - (cut >= 0 ? 1 : 0); i++) place(all[i]);
                chip(members - shown, sides === 2 ? all[from].team : '');
            }
        }
        x = Math.max(over, x - gap) + (big - size - over);
        ids.length = xs.length = entries.length = sizes.length = count;
        const shift = node.align === 'right' ? width - x : node.align === 'left' ? 0 : Math.floor((width - x) / 2);
        for (let i = 0; i < count; i++) xs[i] += shift;
        for (let i = 0; i < chipCount; i++) chips[i].x += shift;
        out.chipCount = chipCount;
        out.size = size; out.big = big; out.top = over; out.count = count; out.marker = marker;
        return out;
    };

    /**
     * Which tiles of the strip may slide to their new places. `before[i]` is where tile i stands now (not a
     * number for a tile that was not there) and the tiles are given in their new order, left to right. Tiles
     * that keep their order slide together and never cross; a tile that changes places with others (it acted and
     * goes behind them, the sides swapped) would slide over them, so it goes out and comes up where it belongs.
     * Writes `out[i]`: true for a tile that slides. The longest run that keeps its order slides.
     */
    H.turnSliders = function(before, count, out) {
        out = out || [];
        const length = out._length || (out._length = []), previous = out._previous || (out._previous = []);
        let best = -1;
        for (let i = 0; i < count; i++) {
            out[i] = false;
            length[i] = 0; previous[i] = -1;
            if (!Number.isFinite(before[i])) continue;
            length[i] = 1;
            for (let j = 0; j < i; j++) {
                if (length[j] > 0 && before[j] < before[i] && length[j] + 1 > length[i]) { length[i] = length[j] + 1; previous[i] = j; }
            }
            if (best < 0 || length[i] > length[best]) best = i;
        }
        for (let i = best; i >= 0; i = previous[i]) out[i] = true;
        out.length = count;
        return out;
    };

    /** How many pixels of a tile's HP line are filled: the line is `H.turnHpRect(size, border, out).width` wide. */
    H.turnHpFill = function(width, hp, mhp) {
        if (!(mhp > 0) || !(hp > 0)) return 0;
        return Math.max(1, Math.round(width * clamp(hp / mhp, 0, 1)));
    };

    /** The thin HP line along the foot of a turn tile, inside its frame. */
    H.turnHpRect = function(size, border, out) {
        out = out || {};
        const inset = border + 1;
        out.height = Math.max(2, Math.round(size * 0.08));
        out.x = inset; out.width = Math.max(1, size - inset * 2);
        out.y = size - inset - out.height;
        return out;
    };

    const hpRect = {}, watchMark = {};

    /** The mark of a unit keeping watch: the upper right corner of its turn tile, inside the frame, a third of the tile wide. */
    H.turnWatchMark = function(size, border, out) {
        out = out || {};
        out.size = Math.max(6, Math.round(size * 0.34));
        out.x = size - border - out.size;
        out.y = border;
        return out;
    };

    /**
     * One turn tile at the origin, `size` square with `marker` pixels under it for the acting mark. A unit with
     * life to show has it as a thin line along the tile's foot (low life in the warning color).
     */
    H.drawTurnCell = function(ctx, size, marker, node, entry, view, theme) {
        const color = H.teamColor(node, entry.team);
        // The acting tile wears gold, with its side's color as a line inside it.
        const border = entry.active ? 3 : 2;
        const ready = H.drawPortrait(ctx, 0, 0, size, view, theme, color, border, entry.active ? H.ACTIVE_COLOR : null);
        if (view.mhp > 0) {
            const r = H.turnHpRect(size, border, hpRect), fill = H.turnHpFill(r.width, view.hp, view.mhp);
            ctx.fillStyle = 'rgba(0,0,0,0.78)';
            ctx.fillRect(r.x, r.y - 1, r.width, r.height + 1);
            if (fill > 0) {
                ctx.fillStyle = view.hp / view.mhp < 0.25 ? theme.crisisColor : theme.gauge.hp[1];
                ctx.fillRect(r.x, r.y, fill, r.height);
            }
        }
        if (entry.acted && !entry.active) {
            ctx.save();
            rounded(ctx, 0, 0, size, size, Math.round(size * 0.07));
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fill();
            ctx.restore();
        }
        // Keeping watch: a corner of the tile in the acting color, over the dimming of a unit that has acted.
        if (entry.watch) {
            const r = H.turnWatchMark(size, border, watchMark);
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.beginPath();
            ctx.moveTo(r.x - 2, r.y); ctx.lineTo(r.x + r.size, r.y); ctx.lineTo(r.x + r.size, r.y + r.size + 2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = H.ACTIVE_COLOR;
            ctx.beginPath();
            ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.size, r.y); ctx.lineTo(r.x + r.size, r.y + r.size);
            ctx.closePath();
            ctx.fill();
        }
        if (entry.active) {
            ctx.fillStyle = H.ACTIVE_COLOR;
            ctx.beginPath();
            ctx.moveTo(size / 2 - marker, size + marker);
            ctx.lineTo(size / 2 + marker, size + marker);
            ctx.lineTo(size / 2, size + 1);
            ctx.closePath();
            ctx.fill();
        }
        return ready;
    };

    /** The box that ends a side for the units the strip has no room for: "+N", edged in the side's color. */
    H.drawTurnMore = function(ctx, size, count, theme, color) {
        ctx.save();
        rounded(ctx, 0, 0, size, size, Math.round(size * 0.07));
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        if (color) { ctx.globalAlpha *= 0.3; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha /= 0.3; }
        rounded(ctx, 1, 1, size - 2, size - 2, Math.round(size * 0.07));
        ctx.strokeStyle = color || 'rgba(200,206,220,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        write(ctx, theme, '+' + count, 2, 0, size - 4, size, 'center', theme.textColor, clamp(Math.round(size * (count > 99 ? 0.3 : 0.38)), 9, 28), true);
    };

    /** A whole strip in one pass (the editor's canvas; the game moves one sprite per tile). */
    H.drawTurnOrder = function(ctx, width, height, node, order, viewOf, theme) {
        const layout = H.turnLayout(node, width, height, order, {});
        let ready = true;
        for (let i = 0; i < layout.count; i++) {
            ctx.save();
            ctx.translate(layout.xs[i], layout.entries[i].active ? 0 : layout.top);
            ready = H.drawTurnCell(ctx, layout.sizes[i], layout.marker, node, layout.entries[i], viewOf(layout.ids[i]), theme) && ready;
            ctx.restore();
        }
        for (let i = 0; i < layout.chipCount; i++) {
            const chip = layout.chips[i];
            ctx.save();
            ctx.translate(chip.x, layout.top);
            H.drawTurnMore(ctx, layout.size, chip.count, theme, chip.team ? H.teamColor(node, chip.team) : '');
            ctx.restore();
        }
        return ready;
    };

    /** A Battle Text line at the origin. The phase banner sits on a band of its side's color. */
    H.drawInfo = function(ctx, width, height, node, value, theme, team) {
        if (!value) return;
        const size = node.fontSize > 0 ? node.fontSize : clamp(Math.round(height * 0.62), 10, 72);
        if (node.fightInfo === 'phase') {
            const color = H.teamColor(node, team);
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(0.25, color);
            gradient.addColorStop(0.75, color);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save();
            ctx.globalAlpha *= 0.82;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, 3);
            ctx.fillRect(0, height - 3, width, 3);
            ctx.restore();
            write(ctx, theme, value, 0, 0, width, height, 'center', '#ffffff', size, true);
            return;
        }
        const color = isHex(node.textColor) ? node.textColor : theme.paletteColor ? theme.paletteColor(Number(node.textColor) || 0) : theme.textColor;
        write(ctx, theme, value, 4, 0, width - 8, height, node.align || 'left', color, size, !!node.fontBold);
    };

    /** How visible the phase banner is `frame` frames after its side's turn began (0 to 1). */
    H.bannerAlpha = function(frame, frames) {
        if (frame < 0 || frame >= frames) return 0;
        const edge = Math.min(15, frames / 3);
        return Math.min(1, frame / edge, (frames - frame) / edge);
    };

    // How long what the battle announces stands on the banner, in frames: a sentence takes longer to read than a
    // phase's two words. A banner set to play longer than this keeps its own length.
    H.NOTICE_FRAMES = 150;

    /**
     * A phase banner's own record: the words it plays (`text`, a 'phase' or a 'notice': `kind`), how far it is
     * (`frame` of `span`), how visible (`alpha`), and a notice waiting its turn (`next`). `team` and `notice`
     * are what the battle said when last read.
     */
    H.bannerState = function() {
        return { text: '', kind: '', frame: 0, span: 0, alpha: 0, team: '', notice: '', next: '' };
    };

    function bannerPlay(state, text, kind, span) {
        state.text = text;
        state.kind = kind;
        state.frame = 0;
        state.span = span;
    }

    /**
     * One frame of the phase banner. It plays the phase's words each time the turn passes to a side, and what
     * the battle announces (`notice()`: a new goal) each time that changes. The phase's words come first: they
     * take the banner at once, and a notice that arrives while they play, or that they cut short, plays in full
     * when they are done. `read` is true on a frame the battle changed, with `team`, `phase` (its words) and
     * `notice` as they are now; `hold` keeps the banner where it is (out of sight behind a menu, it would play
     * for nobody). Returns true when what is drawn changed.
     */
    H.bannerStep = function(state, frames, read, team, phase, notice, hold) {
        const long = Math.max(frames, H.NOTICE_FRAMES);
        let redraw = false;
        if (read) {
            if (team !== state.team) {
                state.team = team;
                if (phase) {
                    if (state.kind === 'notice' && state.frame < state.span) state.next = state.text;
                    bannerPlay(state, phase, 'phase', frames);
                }
                // The band is its side's color: what plays is drawn again for the new side.
                redraw = true;
            }
            if (notice !== state.notice) {
                state.notice = notice;
                if (notice && state.kind === 'phase' && state.frame < state.span) state.next = notice;
                else if (notice) { state.next = ''; bannerPlay(state, notice, 'notice', long); redraw = true; }
            }
        }
        if (state.next && state.frame >= state.span) {
            bannerPlay(state, state.next, 'notice', long);
            state.next = '';
            redraw = true;
        }
        state.alpha = state.text ? H.bannerAlpha(state.frame, state.span) : 0;
        if (!hold && state.frame < state.span) state.frame++;
        return redraw;
    };

    //-------------------------------------------------------------------------
    // The stock layout: the acting unit lower left, the unit under the cursor
    // lower right, the turn order across the top, the menus beside the acting
    // unit. Sizes follow the screen, so it reads the same at 816 x 624 and
    // 1920 x 1080, and the middle of the battlefield stays clear.

    H.stockNodes = function(metrics) {
        const width = Number(metrics && metrics.width) || 816, height = Number(metrics && metrics.height) || 624;
        const k = clamp(height / 720, 0.8, 1.6);
        const px = value => Math.round(value * k);
        const margin = px(12), gap = px(8);
        const commandWidth = Math.max(160, px(192));
        // Wide enough for the game's own text size on a small screen, never past half of what the command window leaves.
        const panelWidth = clamp(Math.floor((width - margin * 2 - commandWidth - gap * 2) / 2), 200, Math.max(px(380), 420));
        const stripHeight = px(60);
        const lineHeight = px(28);
        // The stock windows keep the project's own row height.
        const itemHeight = Number(metrics && metrics.itemHeight) || 44, padding = Number(metrics && metrics.padding) || 12;
        const rows = count => count * itemHeight + padding * 2;
        // The panels and the command window beside them are one height on one baseline: tall enough for the seven
        // commands a unit can be offered at once, each row an icon high (a small screen caps it at 37% of its height,
        // and the window grows upward there when all seven show). The window fits its rows into it.
        const iconRow = Math.min(itemHeight, Math.max(34, (Number(metrics && metrics.iconSize) || 32) + 2));
        const panelHeight = Math.max(132, Math.min(Math.max(rows(5), 7 * iconRow + padding * 2), Math.round(height * 0.37)));
        const visible = { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' };
        let id = 0;
        const node = (type, name, props) => Object.assign({ id: ++id, type, name, parent: 0, anchor: 'topLeft', x: 0, y: 0, opacity: 255, visible: Object.assign({}, visible) },
            H.defaultProps(type), props);
        const rowY = margin + stripHeight + px(4);
        // The goal and the turn at the sides; the hint between them has the most to say, and the widest share.
        const side = Math.floor((width - margin * 2) * 0.3);
        return [
            node('fightTurnOrder', 'Turn Order', { anchor: 'top', x: 0, y: margin, width: width - margin * 2, height: stripHeight }),
            node('fightInfo', 'Objective', { anchor: 'topLeft', x: margin, y: rowY, width: side, height: lineHeight, fightInfo: 'objective', align: 'left' }),
            node('fightInfo', 'Hint', { anchor: 'top', x: 0, y: rowY, width: width - margin * 2 - side * 2, height: lineHeight, fightInfo: 'hint', align: 'center', textColor: 6 }),
            node('fightInfo', 'Turn', { anchor: 'topRight', x: -margin, y: rowY, width: side, height: lineHeight, fightInfo: 'turn', align: 'right' }),
            node('fightInfo', 'Phase Banner', { anchor: 'top', x: 0, y: rowY + lineHeight + px(10), width: Math.min(width, px(560)), height: px(52), fightInfo: 'phase', align: 'center' }),
            node('fightUnit', 'Active Unit', { anchor: 'bottomLeft', x: margin, y: -margin, width: panelWidth, height: panelHeight, fightUnit: 'active' }),
            node('fightUnit', 'Focused Unit', { anchor: 'bottomRight', x: -margin, y: -margin, width: panelWidth, height: panelHeight, fightUnit: 'focused' }),
            node('fightWindow', 'Command', { anchor: 'bottomLeft', x: margin + panelWidth + gap, y: -margin, width: commandWidth, height: panelHeight, fightWindow: 'command', slideY: px(24) }),
            // The lists stand on the acting unit's panel, edge to edge with it, as many whole rows as fit.
            node('fightWindow', 'Skills', { anchor: 'bottomLeft', x: margin, y: -(margin + panelHeight + gap), width: panelWidth, height: Math.max(rows(4), px(150)), fightWindow: 'skill',
                windowColumns: 1, slideY: px(24) }),
            node('fightWindow', 'Items', { anchor: 'bottomLeft', x: margin, y: -(margin + panelHeight + gap), width: panelWidth, height: Math.max(rows(4), px(150)), fightWindow: 'item',
                windowColumns: 1, slideY: px(24) })
        ];
    };

    /** The stock HUD as a whole record (what a project with no HUD of its own gets, and what Stock Layout builds). */
    H.stockRecord = function(metrics) {
        return {
            name: 'Tactical Battle', mode: H.MODE, background: 'none', cancel: { type: 'none' }, firstFocus: 0,
            openTransition: 'fade', closeTransition: 'fade', transitionDuration: 12, coordinateSpace: 'screen',
            nodes: H.stockNodes(metrics), stock: H.ROLE, roles: [H.ROLE],
            note: 'Baseline Tactical battle HUD: the acting unit lower left, the unit under the cursor lower right with the aimed action\'s forecast, the turn order across the top.'
        };
    };

    //-------------------------------------------------------------------------
    // A stand-in battle from a project's database: what the editor's canvas
    // shows (a player's unit aiming its first skill at an enemy), and what the
    // tests bind the HUD to.

    H.sampleReader = function(data, options) {
        data = data || {};
        options = options || {};
        const system = data.system || {};
        const actors = (options.party || (Array.isArray(system.partyMembers) ? system.partyMembers.map(id => data.actors && data.actors[id]) : [])).filter(Boolean).slice(0, 4);
        const enemies = (data.enemies || []).filter(entry => entry && entry.name).slice(0, 3);
        const classOf = actor => (data.classes && data.classes[actor.classId]) || null;
        const param = (actor, id) => {
            const klass = classOf(actor);
            return Number(klass && klass.params && klass.params[id] && klass.params[id][Number(actor.initialLevel) || 1]) || 0;
        };
        const units = [], infos = new Map();
        // The first enemy wears the project's first two states, so their icons show where they sit.
        const stateIcons = (data.states || []).filter(state => state && state.iconIndex > 0).slice(0, 2).map(state => state.iconIndex);
        const add = (team, record, isActor, index) => {
            const p = id => (isActor ? param(record, id) : Number(record.params && record.params[id]) || 0);
            const mhp = p(0) || 100, mmp = p(1);
            const rate = team === 'enemy' ? 1 - index * 0.3 : 1 - index * 0.2;
            const battler = { hp: Math.max(1, Math.round(mhp * rate)), mhp, mp: Math.round(mmp * 0.8), mmp, tp: 30 * index, atk: p(2), def: p(3), mat: p(4), mdf: p(5), agi: p(6), luk: p(7),
                allIcons: () => (team === 'enemy' && index === 0 ? stateIcons : []), currentClass: () => (isActor ? classOf(record) : null), maxTp: () => 100 };
            if (!isActor) { battler.isEnemy = () => true; battler.battlerName = () => record.battlerName || ''; }
            const unit = { id: units.length + 1, team, party: isActor, actorId: isActor ? record.id : 0, enemy: isActor ? null : battler, eventId: 0, move: 4, defeated: false, gone: false };
            units.push(unit);
            infos.set(unit.id, { id: unit.id, name: record.name, team, battler, level: isActor ? Number(record.initialLevel) || 1 : 0,
                faceName: isActor ? record.faceName || '' : '', faceIndex: isActor ? Number(record.faceIndex) || 0 : 0,
                characterName: isActor ? record.characterName || '' : '', characterIndex: isActor ? Number(record.characterIndex) || 0 : 0,
                model: options.modelOf ? options.modelOf(record, isActor) || null : null, x: index, y: team === 'enemy' ? 2 : 8, move: 4, jump: 1,
                acted: team === 'ally' && index === 1, moved: false });
        };
        actors.forEach((actor, index) => add('ally', actor, true, index));
        enemies.forEach((enemy, index) => add('enemy', enemy, false, index));
        if (!units.length) {
            add('ally', { id: 1, name: 'Hero', classId: 0, initialLevel: 1 }, true, 0);
            add('enemy', { name: 'Enemy', params: [120, 0, 14, 10, 8, 8, 9, 5] }, false, 0);
        }
        const allies = units.filter(unit => unit.team === 'ally'), foes = units.filter(unit => unit.team === 'enemy');
        const turns = options.turns === 'initiative' ? 'initiative' : 'team';
        const state = { active: allies[0] || units[0], focused: foes[0] || null, revision: 1, state: options.state || 'target', team: options.team || 'ally', turn: 2 };
        // The first real skill (not Attack or Guard, not a list divider).
        const skill = (data.skills || []).find(entry => entry && entry.id > 2 && entry.stypeId > 0 && /^[^\s\-=_#*]/.test(entry.name || '')) || { id: 1, name: 'Attack' };
        const entry = unit => ({ unitId: unit.id, team: unit.team, active: unit === state.active, acted: !!infos.get(unit.id).acted, defeated: unit.defeated });
        const order = turns === 'initiative'
            ? units.slice().sort((a, b) => infos.get(b.id).battler.agi - infos.get(a.id).battler.agi || a.id - b.id).map(entry)
            : [...allies.filter(unit => !infos.get(unit.id).acted), ...allies.filter(unit => infos.get(unit.id).acted), ...foes].map(entry);
        return {
            sample: true, state, units,
            tacticalRevision: () => state.revision,
            tacticalState: () => state.state,
            activeUnit: () => state.active,
            awaitsPlayer: () => true,
            cursor: () => (state.focused ? { x: infos.get(state.focused.id).x, y: infos.get(state.focused.id).y } : null),
            focusedUnit: () => state.focused,
            turnOrder: () => order,
            currentTeam: () => (turns === 'initiative' ? 'any' : state.team),
            unitInfo: unit => infos.get(unit.id),
            unit: id => units.find(unit => unit.id === id) || null,
            pendingItem: () => (state.state === 'target' ? skill : null),
            // `options.area`: the aimed skill lands on every enemy, so the panel steps through them.
            targetsAtCursor: () => (state.state !== 'target' ? [] : options.area ? foes : state.focused ? [state.focused] : []),
            inRange: () => true,
            preview: unit => (state.state === 'target' && unit && unit.team === 'enemy'
                ? (unit === foes[0] ? { hit: 0.85, critical: 0.1, damageMin: 34, damageMax: 41, heals: false, defeats: false, cover: 1, flank: 'side', height: 1 }
                    : { hit: 0.7, critical: 0, damageMin: 52, damageMax: 60, heals: false, defeats: true, cover: 0, flank: 'front', height: 0 }) : null),
            objectiveText: () => 'Defeat all enemies',
            turn: () => state.turn
        };
    };

    root.ReactorFightHud = H;
    if (typeof module !== 'undefined' && module.exports) module.exports = H;
})(typeof window !== 'undefined' ? window : globalThis);
