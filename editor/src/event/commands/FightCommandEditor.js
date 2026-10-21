/**
 * The on-map battle commands — Reactor commands stored as MZ plugin commands
 * (code 357, plugin "RPGReactor"), read by runtime/reactor_fight.js; a stock
 * MZ runtime ignores them.
 *
 *   StartMapBattle    a battle on the map: who fights, the goal, what a transfer does
 *   SpawnUnit         a new unit, as an event, on a tile, by an event or from variables
 *   ChangeUnitSide    an event fights as an ally, an enemy or a bystander from now on
 *   RemoveUnit        a unit leaves the battle (no reward)
 *   EndMapBattle      ends it as a win, an escape or a loss
 *   ChangeBattleGoal  a new goal for the battle that is running
 *   ChangeBattleMode  the mode for the whole game, this map, or the next battle
 *   SetTerrainCost    what a step onto a region or a terrain tag costs in a Tactical battle
 *
 * Each dialog is a form over a plain object: `formOf` reads the stored
 * arguments into it and `argsOf` writes it back onto a copy of them, so an
 * argument the form does not show stays as it was. `summary` is the line the
 * event list shows. The three have no DOM and are what the tests drive.
 */
class FightCommandEditor {
    static NAMES = ['ChangeBattleMode', 'StartMapBattle', 'ChangeBattleGoal', 'ChangeUnitSide', 'SpawnUnit', 'RemoveUnit', 'EndMapBattle', 'SetTerrainCost'];
    static LABELS = {
        ChangeBattleMode: 'Change Battle Mode', StartMapBattle: 'Start Battle on Map', ChangeBattleGoal: 'Change Battle Goal', ChangeUnitSide: 'Change Unit Side', SpawnUnit: 'Spawn Unit',
        RemoveUnit: 'Remove Unit', EndMapBattle: 'End Battle on Map', SetTerrainCost: 'Set Terrain Cost'
    };
    /** A dialog's title where it says more than the command's name. */
    static TITLES = { SetTerrainCost: 'Set Terrain Cost (Tactical)' };
    /** What wins a battle on the map: the same choices when it starts and when the goal changes part way. */
    static GOALS = [['defeatAll', 'Defeat every enemy'], ['survive', 'Survive a number of turns'], ['defeatUnit', 'Defeat one unit'],
        ['switch', 'A switch is ON'], ['variable', 'A variable reaches a value']];
    /**
     * The one or two numbers a goal needs: `when` the goal it belongs to, `arg` where the command keeps it,
     * `cls` its field in a form. Shared by this dialog and the map's Battle Setup card.
     */
    static GOAL_FIELDS = [
        { when: 'survive', cls: 'survive', label: 'Turns to survive', arg: 'turnsToSurvive', fallback: 5, min: 1, max: 999 },
        { when: 'defeatUnit', cls: 'unit', label: 'Event', arg: 'unitEventId', fallback: 1, min: 1, max: 9999 },
        { when: 'switch', cls: 'goalswitch', label: 'Switch', arg: 'goalSwitchId', fallback: 1, min: 1, max: 9999 },
        { when: 'variable', cls: 'goalvariable', label: 'Variable', arg: 'goalVariableId', fallback: 1, min: 1, max: 9999 },
        { when: 'variable', cls: 'goalvariable', field: 'goalvalue', label: 'Value', arg: 'goalValue', fallback: 1, min: -99999999, max: 99999999 }
    ];

    /** A goal as the command stores it: the objective and only the numbers it needs, read through `value(field)`. */
    static goalArgs(objective, value, target = {}) {
        target.objective = FightCommandEditor.GOALS.some(([key]) => key === objective) ? objective : 'defeatAll';
        for (const field of FightCommandEditor.GOAL_FIELDS) {
            if (field.when !== target.objective) continue;
            const number = Math.floor(Number(value(field.field || field.cls)) || 0);
            target[field.arg] = field.min < 0 ? number : Math.max(field.min, number);
        }
        return target;
    }

    static MODES = [['classic', 'Classic'], ['tactical', 'Tactical'], ['action', 'Action'], ['firstPerson', 'First Person']];
    /** The modes that fight on the map. */
    static ON_MAP = ['tactical', 'action', 'firstPerson'];
    static SCOPES = [['game', 'The whole game'], ['map', 'This map'], ['next', 'The next battle']];
    static RESULTS = [['win', 'A win (with rewards)'], ['escape', 'An escape'], ['lose', 'A loss']];
    static SIDES = [['ally', 'Ally'], ['enemy', 'Enemy'], ['neutral', 'Bystander']];
    static TURNS = [['team', 'Team turns'], ['initiative', 'Initiative order']];
    /** How a Tactical battle on a 3D map is seen: from the isometric battle view, or through the map's own camera. */
    static VIEWS = [['isometric', 'Isometric'], ['map', "The map's own camera"]];
    /** What a step costs in a Tactical battle: 0 shuts the tile, 1 is the ordinary step. */
    static COSTS = [['0', 'Blocked'], ['2', 'Slow (2 steps)'], ['3', 'Slow (3 steps)'], ['1', 'Normal']];
    static TERRAINS = [['region', 'Region'], ['terrain', 'Terrain Tag']];
    static FACINGS = [[2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];
    /** A unit put on a tile, in a list line, by the way it faces. */
    static FACING_LINES = [[2, '{unit} at ({x}, {y}), facing down'], [4, '{unit} at ({x}, {y}), facing left'], [6, '{unit} at ({x}, {y}), facing right'], [8, '{unit} at ({x}, {y}), facing up']];
    /** The tiles a battle takes units from where the map's Note gives no distance. */
    static REACH = 6;

    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController || null;
    }

    static supports(name) {
        return FightCommandEditor.NAMES.includes(name);
    }

    static _t(text, params) {
        if (typeof window === 'undefined' || !window.I18n) {
            return params ? String(text).replace(/\{(\w+)\}/g, (m, key) => (key in params ? String(params[key]) : m)) : text;
        }
        return params ? window.I18n.formatText(text, params) : window.I18n.tText(text);
    }

    _t(text, params) {
        return FightCommandEditor._t(text, params);
    }

    _manager() {
        return this.databaseManager || (typeof window !== 'undefined' && window.reactor && window.reactor.databaseManager) || null;
    }

    //-------------------------------------------------------------------------
    // What the forms and the list lines look names up in.

    /**
     * The Database lists, the open map and the event being edited:
     * `{ enemies, actors, troops, switches, variables, system, map, event }`.
     * Anything given in `overrides` wins; the rest comes from the running editor.
     */
    static context(overrides) {
        const given = overrides || {};
        const app = typeof window !== 'undefined' && window.reactor ? window.reactor : null;
        const manager = given.databaseManager || (app && app.databaseManager) || null;
        const data = (manager && manager.data) || {};
        const system = given.system || (manager && manager.getSystem ? manager.getSystem() : data.system) || null;
        const events = app && app.eventManager ? app.eventManager : null;
        const editor = events && events.eventEditor ? events.eventEditor : null;
        const context = {
            enemies: data.enemies || null, actors: data.actors || null, troops: data.troops || null,
            switches: system ? system.switches : null, variables: system ? system.variables : null, system,
            map: events ? events.currentMap : null, event: editor ? editor.currentEvent : null
        };
        for (const key of Object.keys(given)) if (key !== 'databaseManager' && given[key] !== undefined) context[key] = given[key];
        return context;
    }

    static isMode(mode) {
        return FightCommandEditor.MODES.some(([value]) => value === mode);
    }

    /** `<battle mode: x>` in a map's Note, in any letter case; '' when the Note names none. */
    static noteMode(note) {
        const match = /<battle\s*mode\s*:\s*(\w+)\s*>/i.exec(String(note || ''));
        const word = match ? match[1].toLowerCase() : '';
        const hit = FightCommandEditor.MODES.find(([value]) => value.toLowerCase() === word);
        return hit ? hit[0] : '';
    }

    /** Whether a map is drawn in 3D: `<3d>` in its Note, unless its sidecar says otherwise. */
    static is3DMap(map) {
        if (!map) return false;
        const sidecar = map.reactor3d && typeof map.reactor3d.mode === 'string' ? map.reactor3d.mode : null;
        return /<3d>/i.test(String(map.note || '')) && (sidecar === null || sidecar === '3d');
    }

    /**
     * The mode a battle started on the open map would use: the map's own
     * (its Note, else its sidecar), else the game's, else Classic. Battle
     * Setup's answer is used when it gives one.
     */
    static modeInForce(context) {
        const c = context || {};
        const setup = typeof RRBattleSetup !== 'undefined' ? RRBattleSetup : null;
        if (setup && typeof setup.modeInForce === 'function' && c.map) {
            const answer = setup.modeInForce(c.map, c.system);
            const mode = answer && typeof answer === 'object' ? answer.mode : answer;
            if (FightCommandEditor.isMode(mode)) return mode;
        }
        const noted = FightCommandEditor.noteMode(c.map && c.map.note);
        if (noted) return noted;
        const sidecar = c.map && c.map.reactor3d && c.map.reactor3d.battle;
        if (sidecar && FightCommandEditor.isMode(sidecar.mode)) return sidecar.mode;
        const game = c.system && c.system.reactorBattle ? c.system.reactorBattle.mode : '';
        return FightCommandEditor.isMode(game) ? game : 'classic';
    }

    /** Whether an event has a Start Battle on Map command on any page. */
    static isStarter(event) {
        return !!event && (event.pages || []).some(page => ((page && page.list) || []).some(command => FightCommandEditor.isStart(command)));
    }

    static isStart(command) {
        return !!command && command.code === 357 && Array.isArray(command.parameters)
            && command.parameters[0] === 'RPGReactor' && command.parameters[1] === 'StartMapBattle';
    }

    /**
     * When a map starts its battle by itself, as its Note says:
     * `{ kind: 'near', tiles }`, `{ kind: 'open' }` or `{ kind: 'events' }`
     * (`<battle trigger: N | open | 0>`); null when the Note has no tag.
     */
    static startOf(note) {
        const match = /<battle\s*trigger\s*:\s*(\w+)\s*>/i.exec(String(note || ''));
        if (!match) return null;
        if (match[1].toLowerCase() === 'open') return { kind: 'open' };
        const tiles = Math.floor(Number(match[1]));
        if (!Number.isFinite(tiles)) return null;
        return tiles > 0 ? { kind: 'near', tiles: Math.min(50, tiles) } : { kind: 'events' };
    }

    /** A Note with `<battle trigger: 0>`: the map waits for its events. Every other line is kept. */
    static leftToEvents(note) {
        const source = String(note || ''), tag = /<battle\s*trigger\s*:\s*[^>]*>/gi;
        if (tag.test(source)) return source.replace(/<battle\s*trigger\s*:\s*[^>]*>/gi, '<battle trigger: 0>');
        return source + (source && !source.endsWith('\n') ? '\n' : '') + '<battle trigger: 0>';
    }

    /** `enemy 5`, `ally 2`, `neutral enemy 12`, `move 3` as `{ team, record, id, move }`, the way the game reads a `<unit: …>` tag. */
    static parseUnitText(text) {
        const words = String(text || '').toLowerCase().replace(/[,:]/g, ' ').split(/\s+/).filter(Boolean);
        const unit = { team: '', record: '', id: 0, move: 0 };
        for (let i = 0; i < words.length; i++) {
            const word = words[i], next = Number(words[i + 1]);
            if (word === 'move' && Number.isFinite(next)) { unit.move = Math.max(0, Math.min(20, Math.floor(next))); i++; continue; }
            if (word === 'actor' || word === 'enemy' || word === 'ally') {
                if (Number.isFinite(next) && next > 0) {
                    unit.record = word === 'enemy' ? 'enemy' : 'actor';
                    unit.id = Math.floor(next);
                    if (!unit.team) unit.team = word === 'enemy' ? 'enemy' : 'ally';
                    i++;
                } else if (word !== 'actor') unit.team = word;
                continue;
            }
            if (word === 'neutral') unit.team = 'neutral';
        }
        if (!unit.team || (unit.team !== 'neutral' && !(unit.record && unit.id > 0))) return null;
        return unit;
    }

    /**
     * The unit an event is: its In battle row, else a `<unit: …>` tag in its
     * Note or in a comment on any page. `{ team, record, id, move, from, page }`
     * with `from` "row", "note" or "comment" (`page` from 1); null for any other event.
     */
    static unitOf(event) {
        if (!event) return null;
        const row = event.rrUnit;
        if (row && FightCommandEditor.SIDES.some(([side]) => side === row.team)) {
            const record = row.record === 'actor' || row.record === 'enemy' ? row.record : '';
            const id = record ? Math.max(0, Math.floor(Number(row.id) || 0)) : 0;
            return { team: row.team, record: id > 0 ? record : '', id, move: Math.max(0, Math.floor(Number(row.move) || 0)), from: 'row', page: 0 };
        }
        const tag = /<unit\s*:\s*([^>]+)>/i;
        const noted = tag.exec(String(event.note || ''));
        if (noted) {
            const unit = FightCommandEditor.parseUnitText(noted[1]);
            return unit ? Object.assign(unit, { from: 'note', page: 0 }) : null;
        }
        const pages = event.pages || [];
        for (let index = 0; index < pages.length; index++) {
            for (const command of (pages[index] && pages[index].list) || []) {
                if (!command || (command.code !== 108 && command.code !== 408)) continue;
                const found = tag.exec(String((command.parameters && command.parameters[0]) || ''));
                const unit = found ? FightCommandEditor.parseUnitText(found[1]) : null;
                if (unit) return Object.assign(unit, { from: 'comment', page: index + 1 });
            }
        }
        return null;
    }

    static _pad(id, width = 4) {
        return String(Math.max(0, Math.floor(Number(id) || 0))).padStart(width, '0');
    }

    static _record(list, id) {
        return (Array.isArray(list) ? list : []).find(entry => entry && Number(entry.id) === Number(id)) || null;
    }

    /** `0006: Raider` for a Database record, a switch or a variable; the number alone when it has no name. */
    static _numbered(id, name) {
        return FightCommandEditor._pad(id) + (name ? ': ' + name : '');
    }

    /** A map event by id; null when the map has none there. */
    static _event(context, id) {
        const events = context && context.map && context.map.events;
        return (Array.isArray(events) ? events : []).find(event => event && Number(event.id) === Number(id)) || null;
    }

    /**
     * The map's events for a select, as `[value, label]`: This event and
     * Player where asked for, then units, then every other event, each as
     * `012: Rhea Voss`. A stored id the map no longer has is listed as itself.
     * Where "This event" is offered the event being edited is left out, unless
     * the stored command names it by its number: then it is listed by name.
     */
    static eventChoices(context, options = {}) {
        const t = FightCommandEditor._t, c = context || {};
        const choices = [];
        if (options.self) choices.push(['0', t('This event')]);
        if (options.player) choices.push(['-1', t('Player')]);
        const stored = Math.floor(Number(options.stored) || 0);
        const own = options.self && c.event ? Number(c.event.id) : 0;
        const events = ((c.map && c.map.events) || []).filter(event => event && (Number(event.id) !== own || stored === own));
        const label = event => FightCommandEditor._pad(event.id, 3) + ': ' + (event.name || '');
        const units = events.filter(event => FightCommandEditor.unitOf(event));
        for (const event of units.concat(events.filter(event => !units.includes(event)))) choices.push([String(event.id), label(event)]);
        if (stored > 0 && !choices.some(([value]) => value === String(stored))) {
            choices.push([String(stored), t('{id}: (no such event)', { id: FightCommandEditor._pad(stored, 3) })]);
        }
        return choices;
    }

    /**
     * How many enemy units a battle started by this command would take:
     * every one on the map, or those within the map's start distance of the
     * event (where the party is taken to stand). A Classic battle takes rows only, 8 at most.
     */
    static fighters(context, who, mode) {
        const c = context || {}, map = c.map;
        if (!map) return 0;
        const start = FightCommandEditor.startOf(map.note);
        const reach = start && start.kind === 'near' ? start.tiles : FightCommandEditor.REACH;
        const near = (who !== 'map' || mode === 'classic') && c.event && Number.isFinite(Number(c.event.x));
        let count = 0;
        for (const event of map.events || []) {
            const unit = FightCommandEditor.unitOf(event);
            if (!unit || unit.team !== 'enemy') continue;
            if (mode === 'classic' && unit.from !== 'row') continue;
            if (near) {
                const dx = event.x - c.event.x, dy = event.y - c.event.y;
                if (dx * dx + dy * dy > reach * reach) continue;
            }
            count++;
        }
        return mode === 'classic' ? Math.min(8, count) : count;
    }

    //-------------------------------------------------------------------------
    // The forms.

    static _int(value) {
        return Math.floor(Number(value) || 0);
    }

    static _bool(value) {
        return value === true || value === 'true';
    }

    /** The goal's fields of a form, from stored arguments. */
    static _goalForm(args) {
        const int = FightCommandEditor._int;
        return {
            objective: FightCommandEditor.GOALS.some(([key]) => key === args.objective) ? args.objective : 'defeatAll',
            turnsToSurvive: Math.max(1, int(args.turnsToSurvive) || 5),
            unitEventId: Math.max(0, int(args.unitEventId)),
            goalSwitchId: Math.max(0, int(args.goalSwitchId)),
            goalVariableId: Math.max(0, int(args.goalVariableId)),
            goalValue: args.goalValue === undefined || args.goalValue === '' ? 1 : int(args.goalValue),
            goalText: typeof args.goalText === 'string' ? args.goalText : ''
        };
    }

    /**
     * A dialog's values for a stored command; `stored` null is a new command
     * and gives the defaults a new one starts with.
     */
    static formOf(name, stored, context) {
        const fresh = !stored || typeof stored !== 'object';
        const args = fresh ? {} : stored;
        const int = FightCommandEditor._int, bool = FightCommandEditor._bool;
        if (name === 'StartMapBattle') {
            return Object.assign({
                mode: typeof args.mode === 'string' ? args.mode : '',
                // A command stored before "Who fights" existed takes every unit on the map.
                who: args.who === 'near' ? 'near' : args.who === 'map' ? 'map' : (fresh ? 'near' : 'map'),
                troopId: Math.max(0, int(args.troopId)),
                turns: args.turns === 'team' || args.turns === 'initiative' ? args.turns : '',
                view: args.view === 'map' || args.view === 'isometric' ? args.view : '',
                onTransfer: args.onTransfer === 'keep' ? 'keep' : 'escape',
                canEscape: fresh ? true : bool(args.canEscape),
                canLose: bool(args.canLose),
                wait: fresh ? true : bool(args.wait),
                resultVariable: Math.max(0, int(args.resultVariable))
            }, FightCommandEditor._goalForm(args));
        }
        if (name === 'ChangeBattleGoal') return FightCommandEditor._goalForm(args);
        if (name === 'SpawnUnit') {
            const record = args.record === 'actor' ? 'actor' : 'enemy';
            const list = context ? (record === 'actor' ? context.actors : context.enemies) : null;
            const first = (Array.isArray(list) ? list : []).find(entry => entry && entry.id > 0);
            const id = int(args.id) > 0 ? int(args.id) : (first ? first.id : 1);
            const at = fresh ? 'event' : (args.at === 'event' || args.at === 'variables' ? args.at : 'cell');
            const tile = !fresh && at === 'cell' && args.x !== undefined && args.y !== undefined;
            // A new command faces down; a stored one with no facing has none (0) until one is chosen.
            const direction = [2, 4, 6, 8].includes(int(args.direction)) ? int(args.direction) : (fresh ? 2 : 0);
            return {
                who: record + ':' + id,
                team: FightCommandEditor.SIDES.some(([side]) => side === args.team) ? args.team : (record === 'actor' ? 'ally' : 'enemy'),
                at,
                tileX: tile ? Math.max(0, int(args.x)) : null, tileY: tile ? Math.max(0, int(args.y)) : null,
                varX: at === 'variables' ? Math.max(0, int(args.x)) : 0, varY: at === 'variables' ? Math.max(0, int(args.y)) : 0,
                eventId: int(args.eventId) < 0 ? -1 : Math.max(0, int(args.eventId)),
                direction,
                count: Math.max(1, Math.min(99, int(args.count) || 1)),
                template: Math.max(0, int(args.template)),
                stay: bool(args.stay)
            };
        }
        if (name === 'ChangeUnitSide') {
            return { eventId: Math.max(0, int(args.eventId)), team: args.team === undefined ? 'ally' : (FightCommandEditor.SIDES.some(([side]) => side === args.team) ? args.team : '') };
        }
        if (name === 'RemoveUnit') return { eventId: Math.max(0, int(args.eventId)), keep: bool(args.keep) };
        if (name === 'EndMapBattle') return { result: args.result === 'escape' || args.result === 'lose' ? args.result : 'win' };
        if (name === 'ChangeBattleMode') {
            return {
                // A new command names Tactical; a stored mode the game does not know is its own setting, as the game reads it.
                mode: FightCommandEditor.isMode(args.mode) ? args.mode : (args.mode === undefined ? 'tactical' : 'default'),
                scope: FightCommandEditor.SCOPES.some(([scope]) => scope === args.scope) ? args.scope : 'game'
            };
        }
        if (name === 'SetTerrainCost') {
            // 0 shuts the tile; any number of steps above one that a stored command names is kept; anything else is the ordinary step.
            const cost = Number(args.cost);
            return {
                type: args.type === 'terrain' ? 'terrain' : 'region',
                id: args.id === undefined ? 1 : Math.max(0, int(args.id)),
                cost: args.cost === undefined || args.cost === '' || cost === 0 ? '0' : (Number.isFinite(cost) && cost > 1 ? String(cost) : '1')
            };
        }
        return {};
    }

    /** The costs a Set Terrain Cost form offers, as `[value, label]`: the stock ones, and the form's own when it is another number. */
    static costChoices(form) {
        const t = FightCommandEditor._t;
        const choices = FightCommandEditor.COSTS.map(([value, label]) => [value, t(label)]);
        const own = String(form && form.cost);
        if (Number(own) > 1 && !choices.some(([value]) => value === own)) {
            choices.splice(choices.length - 1, 0, [own, t('Slow ({steps} steps)', { steps: own })]);
        }
        return choices;
    }

    /**
     * Which of a dialog's rows show, by the class they carry (`fc-when-<key>`):
     * a goal's fields under the goal chosen, the rows that mean nothing in a
     * Classic battle hidden, the Tactical rows in a Tactical battle only.
     */
    static shown(name, form, context) {
        const shown = {};
        if (name !== 'StartMapBattle' && name !== 'ChangeBattleGoal') return shown;
        const mode = name === 'StartMapBattle' ? FightCommandEditor.formMode(form, context) : '';
        const onMap = mode !== 'classic';
        shown.onmap = onMap;
        shown.survive = onMap && form.objective === 'survive';
        shown.unit = onMap && form.objective === 'defeatUnit';
        shown.goalswitch = onMap && form.objective === 'switch';
        shown.goalvariable = onMap && form.objective === 'variable';
        shown.goaltext = onMap && (form.objective === 'switch' || form.objective === 'variable');
        if (name === 'StartMapBattle') {
            shown.tactical = mode === 'tactical';
            shown.wait = !!form.wait;
            shown.troop = form.troopId > 0;
        }
        return shown;
    }

    /**
     * The Battle mode choices of Start Battle on Map, as `[value, label]`:
     * the map's mode in force first, then the modes fought on the map. First
     * Person is offered on a 3D map; a stored mode is always offered as itself.
     */
    static modeChoices(form, context) {
        const F = FightCommandEditor, t = F._t;
        const modeName = mode => t((F.MODES.find(([value]) => value === mode) || ['', mode])[1]);
        const stored = form && form.mode;
        const choices = [['', t("This map's mode ({mode})", { mode: modeName(F.modeInForce(context)) })]];
        for (const mode of F.ON_MAP) if (mode !== 'firstPerson' || F.is3DMap(context && context.map) || stored === mode) choices.push([mode, modeName(mode)]);
        if (stored && !choices.some(([mode]) => mode === stored)) choices.push([stored, modeName(stored)]);
        return choices;
    }

    /** The Enemies line of Start Battle on Map: `{ words, warn }`, a warning where no enemy would be in the battle. */
    static enemiesLine(form, context) {
        const F = FightCommandEditor, t = F._t;
        const mode = F.formMode(form, context), count = F.fighters(context, form.who, mode), troop = form.troopId > 0;
        if (count === 0) {
            return troop ? { words: t('Only the troop would fight.'), warn: false }
                : { words: t('No enemy would be in this battle. Place some with Battle Setup, or pick a troop under More.'), warn: true };
        }
        const near = form.who !== 'map' || mode === 'classic';
        const words = t(near ? '{count} near the party would fight.' : '{count} on this map would fight.', { count });
        return { words: troop ? words + ' ' + t('The troop fights beside them.') : words, warn: false };
    }

    /** The line that says the map starts a battle by itself; '' where it waits for its events. */
    static startsLine(context) {
        const start = FightCommandEditor.startOf(context && context.map && context.map.note);
        if (!start || start.kind === 'events') return '';
        return FightCommandEditor._t(start.kind === 'open' ? 'This map also starts a battle when it opens.' : 'This map also starts a battle when the party comes near.');
    }

    /** The side a Spawn Unit record fights on until one is chosen by hand: an actor an ally, an enemy an enemy. */
    static recordSide(who) {
        return String(who || '').startsWith('actor') ? 'ally' : 'enemy';
    }

    /** Whether a Spawn Unit form's side still follows its record. */
    static followsRecord(form) {
        return form.team === FightCommandEditor.recordSide(form.who);
    }

    /** Whether a dialog's More opens with it: something under it is set. */
    static moreOpen(name, form) {
        if (name === 'StartMapBattle') return form.who === 'map' || form.troopId > 0 || !!form.turns || !!form.view || form.onTransfer !== 'escape' || form.resultVariable > 0;
        if (name === 'SpawnUnit') return form.count > 1 || form.template > 0 || !!form.stay;
        return false;
    }

    /** A Facing button pressed: the form faces that way; the one already chosen pressed again leaves it with none. */
    static faced(form, direction) {
        const next = [2, 4, 6, 8].includes(Number(direction)) ? Number(direction) : 0;
        form.direction = form.direction === next ? 0 : next;
        return form;
    }

    /** A tile picked on the map, written into a Spawn Unit form: the tile, and the facing when the pick turned the unit. */
    static picked(form, tile) {
        if (!tile) return form;
        form.tileX = Math.max(0, Math.floor(Number(tile.x) || 0));
        form.tileY = Math.max(0, Math.floor(Number(tile.y) || 0));
        if ([2, 4, 6, 8].includes(Number(tile.direction))) form.direction = Number(tile.direction);
        return form;
    }

    /**
     * What OK does with a form: `{ problem }` in words when it cannot be
     * stored, else `{ commands }`, the block the event list takes.
     */
    static store(name, stored, form, context, indent = 0) {
        const problem = FightCommandEditor.problemOf(name, form);
        if (problem) return { problem, commands: null };
        return { problem: '', commands: FightCommandEditor.block(name, FightCommandEditor.argsOf(name, stored, form, context), indent) };
    }

    /** "Leave it to events": the map's Note with `<battle trigger: 0>`. Returns whether the map changed. */
    static leaveToEvents(map) {
        if (!map) return false;
        const next = FightCommandEditor.leftToEvents(map.note);
        if (next === map.note) return false;
        map.note = next;
        return true;
    }

    /** The mode a Start Battle on Map form would fight in: the one it names, else the map's mode in force. */
    static formMode(form, context) {
        return FightCommandEditor.ON_MAP.includes(form.mode) ? form.mode : FightCommandEditor.modeInForce(context);
    }

    /**
     * A problem that keeps a form from being stored, in words; '' when it can be.
     * A tile and both variables must be chosen: nothing falls back to (0, 0).
     */
    static problemOf(name, form) {
        const t = FightCommandEditor._t;
        if (name === 'SpawnUnit') {
            if (form.at === 'cell' && (form.tileX === null || form.tileY === null)) return t('Pick the tile first.');
            if (form.at === 'variables' && !(form.varX > 0 && form.varY > 0)) return t('Choose both variables first.');
        }
        return '';
    }

    /**
     * The arguments a form stores: a copy of the stored ones with the form's
     * values written over it. An optional argument (`view`, `goalText`,
     * `resultVariable`, `count`, `template`, `stay`) is written when it is set
     * and, when it is not, kept as its empty value only if it was stored.
     * A form opened and stored with nothing changed stores what was there.
     */
    static argsOf(name, stored, form, context) {
        const before = stored && typeof stored === 'object' ? stored : {};
        const built = JSON.parse(JSON.stringify(before));
        const int = FightCommandEditor._int;
        const optional = (key, value, empty) => {
            if (value !== empty) built[key] = value;
            else if (key in before) built[key] = empty;
            else delete built[key];
        };
        const goal = () => {
            const keys = { survive: 'turnsToSurvive', unit: 'unitEventId', goalswitch: 'goalSwitchId', goalvariable: 'goalVariableId', goalvalue: 'goalValue' };
            FightCommandEditor.goalArgs(form.objective, key => form[keys[key]], built);
            // The words a switch or a variable goal is shown as. The other goals word themselves:
            // a change to one of them takes the words of the goal that was there with it.
            if (built.objective === 'switch' || built.objective === 'variable') optional('goalText', String(form.goalText || '').trim(), '');
            else if (built.objective !== FightCommandEditor._goalForm(before).objective) delete built.goalText;
        };
        if (name === 'StartMapBattle') {
            built.mode = form.mode;
            built.who = form.who === 'map' ? 'map' : 'near';
            built.troopId = Math.max(0, int(form.troopId));
            built.turns = form.turns;
            optional('view', form.view, '');
            goal();
            built.onTransfer = form.onTransfer;
            built.canEscape = !!form.canEscape;
            built.canLose = !!form.canLose;
            built.wait = !!form.wait;
            optional('resultVariable', Math.max(0, int(form.resultVariable)), 0);
        } else if (name === 'ChangeBattleGoal') {
            goal();
        } else if (name === 'SpawnUnit') {
            const [record, id] = String(form.who || '').split(':');
            built.record = record === 'actor' ? 'actor' : 'enemy';
            built.id = Math.max(0, int(id));
            built.team = form.team;
            built.at = form.at;
            if (form.at === 'event') built.eventId = int(form.eventId);
            else if (form.at === 'variables') { built.x = Math.max(0, int(form.varX)); built.y = Math.max(0, int(form.varY)); }
            else { built.x = Math.max(0, int(form.tileX)); built.y = Math.max(0, int(form.tileY)); }
            // A facing is written when one is chosen; with none, what was stored (or nothing) stays.
            if ([2, 4, 6, 8].includes(int(form.direction))) built.direction = int(form.direction);
            else if ([2, 4, 6, 8].includes(int(before.direction))) delete built.direction;
            optional('count', Math.max(1, Math.min(99, int(form.count) || 1)), 1);
            optional('template', Math.max(0, int(form.template)), 0);
            optional('stay', !!form.stay, false);
        } else if (name === 'ChangeUnitSide') {
            built.eventId = Math.max(0, int(form.eventId));
            built.team = form.team;
        } else if (name === 'RemoveUnit') {
            built.eventId = Math.max(0, int(form.eventId));
            built.keep = !!form.keep;
        } else if (name === 'EndMapBattle') {
            built.result = form.result;
        } else if (name === 'ChangeBattleMode') {
            built.mode = form.mode;
            built.scope = form.scope;
        } else if (name === 'SetTerrainCost') {
            const type = form.type === 'terrain' ? 'terrain' : 'region';
            built.type = type;
            built.id = Math.max(type === 'terrain' ? 0 : 1, int(form.id));
            built.cost = Number(form.cost);
        }
        return built;
    }

    /** The command as stored; params[2] is its label. */
    static build(name, args, indent = 0) {
        return {
            code: 357,
            indent,
            parameters: ['RPGReactor', name, FightCommandEditor.LABELS[name] || name, args]
        };
    }

    /**
     * What OK hands to the event list. A Start Battle on Map that waits is
     * followed by its branch rows, as Battle Processing's are: If Win always,
     * If Escape when the party can escape, If Lose when the game goes on after
     * a loss, then the end row. Every other command is the command alone.
     */
    static block(name, args, indent = 0) {
        const command = FightCommandEditor.build(name, args, indent);
        if (name !== 'StartMapBattle' || !FightCommandEditor._bool(args && args.wait)) return [command];
        const row = code => [{ code, indent, parameters: [] }, { code: 0, indent: indent + 1, parameters: [] }];
        return [command].concat(row(601), FightCommandEditor._bool(args.canEscape) ? row(602) : [], FightCommandEditor._bool(args.canLose) ? row(603) : [],
            [{ code: 604, indent, parameters: [] }]);
    }

    //-------------------------------------------------------------------------
    // The list lines.

    /** One line for the event list, in the editor's language. */
    static summary(name, args, context) {
        args = args || {};
        const F = FightCommandEditor, t = F._t, c = F.context(context);
        const int = F._int, bool = F._bool;
        const modeName = mode => { const hit = F.MODES.find(([value]) => value === mode); return hit ? t(hit[1]) : ''; };
        const eventName = id => { const event = F._event(c, id); return event && event.name ? event.name : ''; };
        // "This event", "Conscript (event 20)" or, for an event the map does not have, "Event 20".
        const who = id => {
            if (!(int(id) > 0)) return t('This event');
            return eventName(id) ? t('{name} (event {id})', { name: eventName(id), id: int(id) }) : t('Event {id}', { id: int(id) });
        };
        const named = (list, id) => { const names = Array.isArray(list) ? list : []; return F._pad(id) + (names[id] ? ' ' + names[id] : ''); };
        const goal = start => {
            if (args.objective === 'survive') return t(start ? 'Survive {turns} turns' : 'survive {turns} turns', { turns: int(args.turnsToSurvive) || 1 });
            if (args.objective === 'defeatUnit') {
                const id = int(args.unitEventId), name = eventName(id);
                if (name) return t(start ? 'Defeat {name} (event {id})' : 'defeat {name} (event {id})', { name, id });
                return t(start ? 'Defeat event {event}' : 'defeat event {event}', { event: id });
            }
            if (args.objective === 'switch') return t(start ? 'Until switch {switch} is ON' : 'until switch {switch} is ON', { switch: named(c.switches, int(args.goalSwitchId)) });
            if (args.objective === 'variable') {
                return t(start ? 'Until variable {variable} ≥ {value}' : 'until variable {variable} ≥ {value}', { variable: named(c.variables, int(args.goalVariableId)), value: int(args.goalValue) });
            }
            return t(start ? 'Defeat every enemy' : 'defeat every enemy');
        };
        if (name === 'StartMapBattle') {
            const chosen = F.ON_MAP.includes(args.mode) ? args.mode : '';
            const resolved = chosen || F.modeInForce(c);
            let head = chosen ? modeName(chosen) : t("This map's mode ({mode})", { mode: modeName(resolved) });
            if (int(args.troopId) > 0) {
                const troop = F._record(c.troops, int(args.troopId));
                head = t('{mode} against troop {troop}', { mode: head, troop: F._numbered(int(args.troopId), troop && troop.name) });
            }
            // A Classic battle has one goal.
            let line = t('{mode}: {goal}', { mode: head, goal: resolved === 'classic' ? t('defeat every enemy') : goal(false) });
            const more = [];
            if (resolved !== 'classic' && args.who !== 'near') more.push(t('every unit on this map'));
            if (resolved === 'tactical' && args.view === 'map') more.push(t("the map's own camera"));
            if (resolved === 'tactical' && args.view === 'isometric') more.push(t('the isometric view'));
            if (more.length) line += ' · ' + more.join(' · ');
            if (!bool(args.wait)) line += ' ' + t('(the event carries on)');
            return line;
        }
        if (name === 'ChangeBattleGoal') return goal(true);
        if (name === 'ChangeUnitSide') {
            const params = { who: who(args.eventId) };
            if (args.team === 'enemy') return t('{who} fights as an enemy', params);
            if (args.team === 'ally') return t('{who} fights as an ally', params);
            if (args.team === 'neutral') return t('{who} becomes a bystander', params);
            return t('{who} goes back to its own side', params);
        }
        if (name === 'SpawnUnit') {
            const actor = args.record === 'actor';
            const record = F._record(actor ? c.actors : c.enemies, int(args.id));
            const base = record && record.name ? record.name : `${t(actor ? 'Actor' : 'Enemy')} ${F._pad(args.id)}`;
            const team = F.SIDES.some(([side]) => side === args.team) ? args.team : (actor ? 'ally' : 'enemy');
            let unit = t(team === 'ally' ? '{unit} (ally)' : team === 'neutral' ? '{unit} (bystander)' : '{unit} (enemy)', { unit: base });
            if (int(args.count) > 1) unit = t('{count} × {unit}', { count: int(args.count), unit });
            let line;
            if (args.at === 'event') {
                const id = int(args.eventId);
                if (id < 0) line = t('{unit} next to the player', { unit });
                else if (id === 0) line = t('{unit} next to this event', { unit });
                else if (eventName(id)) line = t('{unit} next to {name} (event {id})', { unit, name: eventName(id), id });
                else line = t('{unit} next to event {id}', { unit, id });
            } else if (args.at === 'variables') {
                line = t('{unit} at the tile in variables {x} and {y}', { unit, x: F._pad(args.x), y: F._pad(args.y) });
            } else {
                const facing = F.FACING_LINES.find(([direction]) => direction === int(args.direction));
                line = facing ? t(facing[1], { unit, x: int(args.x), y: int(args.y) }) : t('{unit} at ({x}, {y})', { unit, x: int(args.x), y: int(args.y) });
            }
            return bool(args.stay) ? line + ' · ' + t('stays after the battle') : line;
        }
        if (name === 'RemoveUnit') {
            return t(bool(args.keep) ? '{who} leaves the battle and stays on the map' : '{who} leaves the battle and the map', { who: who(args.eventId) });
        }
        if (name === 'EndMapBattle') return t(args.result === 'lose' ? 'As a loss' : args.result === 'escape' ? 'As an escape' : 'As a win');
        if (name === 'ChangeBattleMode') {
            const scope = args.scope === 'map' || args.scope === 'next' ? args.scope : 'game';
            if (!F.isMode(args.mode)) {
                return t(scope === 'map' ? "This map goes back to the game's own mode" : scope === 'next' ? 'The next battle goes back to its own mode' : 'The game goes back to its own mode');
            }
            const mode = modeName(args.mode);
            return t(scope === 'map' ? '{mode} for this map' : scope === 'next' ? '{mode} for the next battle' : '{mode} for the whole game', { mode });
        }
        if (name === 'SetTerrainCost') {
            const region = args.type !== 'terrain', id = int(args.id), cost = Number(args.cost);
            if (cost === 0) return t(region ? 'Region {id} is blocked' : 'Terrain tag {id} is blocked', { id });
            if (!(cost > 1)) return t(region ? 'Region {id} is normal again' : 'Terrain tag {id} is normal again', { id });
            return t(region ? 'Region {id} costs {steps} steps' : 'Terrain tag {id} costs {steps} steps', { id, steps: cost });
        }
        return '';
    }

    //-------------------------------------------------------------------------
    // The dialogs.

    /**
     * Opens the dialog for `command` (null: a new command named by `nameHint`).
     * `callback` gets the commands to store, as `block` gives them, or null on Cancel.
     * `hooks.beforeStore(commands)` is asked before OK stores: it resolves
     * false to keep the dialog open with nothing stored.
     */
    show(command, callback, nameHint, hooks) {
        const F = FightCommandEditor;
        const params = (command && command.parameters) || [];
        const name = F.supports(params[1]) ? params[1] : (F.supports(nameHint) ? nameHint : 'StartMapBattle');
        const stored = command && params[3] && typeof params[3] === 'object' ? params[3] : null;
        const context = F.context({ databaseManager: this._manager() });
        const form = F.formOf(name, stored, context);
        const t = (text, values) => this._t(text, values);
        const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const options = (list, current) => list.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`).join('');
        const tr = list => list.map(([value, label]) => [value, t(label)]);
        const select = (key, list, current) => `<select class="fc-${key} database-field-value">${options(list, current)}</select>`;
        const number = (key, value, min = 0, max = 9999) => `<input type="number" class="fc-${key} fc-number database-field-value" value="${esc(value)}" min="${min}" max="${max}" step="1">`;
        const check = (key, label, on, cls = '') => `<label class="fc-check fc-wide${cls ? ' ' + cls : ''}"><input type="checkbox" class="fc-${key}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
        const row = (label, inner, cls = '') => `<div class="fc-row${cls ? ' ' + cls : ''}"><span class="fc-label">${esc(label)}</span><div class="fc-field">${inner}</div></div>`;
        const hint = (text, cls = '') => `<div class="fc-hint${cls ? ' ' + cls : ''}">${esc(text)}</div>`;
        // A sentence with fields in it: the words around each `{slot}` stay text, the slot becomes its control.
        const sentence = (text, slots) => t(text).split(/(\{\w+\})/).map(part => {
            const slot = /^\{(\w+)\}$/.exec(part);
            return slot && slots[slot[1]] !== undefined ? slots[slot[1]] : (part.trim() ? `<span class="fc-words">${esc(part.trim())}</span>` : '');
        }).join('');
        const named = (list, id) => (id > 0 ? F._numbered(id, Array.isArray(list) ? list[id] : '') : t('None'));
        // A switch or a variable, chosen in the stock picker and shown as "0003: Name".
        const picker = (key, kind, id, clearable = false) => `<span class="fc-pick" data-key="${key}" data-kind="${kind}">`
            + `<input type="hidden" class="fc-${key}" value="${esc(id)}">`
            + `<button type="button" class="fc-pick-open rr-btn-browse">${esc(named(kind === 'switch' ? context.switches : context.variables, id))}</button>`
            + (clearable ? `<button type="button" class="fc-pick-clear rr-btn-browse" title="${esc(t('None'))}"${id > 0 ? '' : ' hidden'}>&times;</button>` : '') + '</span>';
        const records = () => {
            const group = (label, kind, list) => {
                const entries = (Array.isArray(list) ? list : []).filter(entry => entry && entry.id > 0);
                return entries.length ? `<optgroup label="${esc(t(label))}">${options(entries.map(entry => [kind + ':' + entry.id, F._numbered(entry.id, entry.name)]), form.who)}</optgroup>` : '';
            };
            const html = group('Enemies', 'enemy', context.enemies) + group('Actors', 'actor', context.actors);
            return html.includes(' selected') ? html : `<option value="${esc(form.who)}" selected>${esc(form.who.replace(':', ' '))}</option>` + html;
        };
        // The goal and the fields its choice needs, each a sentence under it.
        const goalRows = () => {
            const units = F.eventChoices(context, { stored: form.unitEventId });
            const unit = form.unitEventId > 0 ? form.unitEventId : (units[0] ? units[0][0] : 0);
            return row(t('To win'), select('objective', tr(F.GOALS), form.objective), 'fc-when-onmap')
                + row('', sentence('Survive {turns} turns', { turns: number('turnsToSurvive', form.turnsToSurvive, 1, 999) }), 'fc-when-survive')
                + row('', sentence('Defeat {unit}', { unit: select('unitEventId', units.length ? units : [['0', t('None')]], unit) }), 'fc-when-unit')
                + row('', sentence('Switch {switch} is ON', { switch: picker('goalSwitchId', 'switch', form.goalSwitchId || 1) }), 'fc-when-goalswitch')
                + row('', sentence('Variable {variable} reaches {value}', { variable: picker('goalVariableId', 'variable', form.goalVariableId || 1), value: number('goalValue', form.goalValue, -99999999, 99999999) }), 'fc-when-goalvariable')
                + row(t('Shown as'), `<input type="text" class="fc-goalText database-field-value" value="${esc(form.goalText)}" maxlength="60" title="${esc(t('The words the banner and the goal line show.'))}">`, 'fc-when-goaltext');
        };
        const more = inner => `<button type="button" class="fc-more-toggle fc-wide" aria-expanded="false"><span class="fc-more-mark">&#9656;</span>${esc(t('More'))}</button>${inner}`;

        let body = '';
        if (name === 'StartMapBattle') {
            const system = (context.system && context.system.reactorBattle) || {};
            const gameTurns = t(system.turns === 'initiative' ? 'Initiative order' : 'Team turns');
            const gameView = t(system.view === 'map' ? "The map's own camera" : 'Isometric');
            body += row(t('Battle mode'), select('mode', F.modeChoices(form, context), form.mode));
            body += row(t('Enemies'), '<span class="fc-enemies"></span>');
            body += goalRows();
            body += check('canEscape', t('The party can escape'), form.canEscape);
            body += check('canLose', t('The game goes on if the party loses'), form.canLose);
            body += check('wait', t('Wait here until the battle ends'), form.wait);
            body += hint(t('Adds If Win, If Escape and If Lose under the command.'), 'fc-when-wait');
            body += `<div class="fc-wide fc-starts" hidden><span class="fc-starts-text"></span><button type="button" class="fc-leave rr-btn-browse">${esc(t('Leave it to events'))}</button></div>`;
            body += more(
                row(t('Who fights'), select('who', tr([['near', 'The units near the party'], ['map', 'Every unit on this map']]), form.who), 'fc-more fc-when-onmap')
                + row(t('Troop'), select('troopId', [['0', t('None')]].concat(this._records('troops')), String(form.troopId)), 'fc-more')
                + hint(t('Its members appear round the party.'), 'fc-more fc-when-troop')
                + row(t('Turn order'), select('turns', [['', t("The game's ({value})", { value: gameTurns })]].concat(tr(F.TURNS)), form.turns), 'fc-more fc-when-tactical')
                + row(t('Tactical view'), select('view', [['', t("The game's ({value})", { value: gameView })]].concat(tr(F.VIEWS)), form.view), 'fc-more fc-when-tactical')
                + row(t('If the party leaves the map'), select('onTransfer', tr([['escape', 'End it as an escape'], ['keep', 'Keep it for their return']]), form.onTransfer), 'fc-more fc-when-onmap')
                + row(t('Result also into variable'), picker('resultVariable', 'variable', form.resultVariable, true), 'fc-more'));
        } else if (name === 'ChangeBattleGoal') {
            body += goalRows();
        } else if (name === 'ChangeUnitSide') {
            body += row(t('Who'), select('eventId', F.eventChoices(context, { self: true, stored: form.eventId }), form.eventId));
            body += row(t('Side'), select('team', tr(F.SIDES).concat([['', t('Its own side again')]]), form.team));
        } else if (name === 'SpawnUnit') {
            const where = (value, label, inner) => `<div class="fc-where" data-at="${value}"><label class="fc-check"><input type="radio" name="fc-at" class="fc-at" value="${value}"${form.at === value ? ' checked' : ''}><span>${esc(label)}</span></label>${inner}</div>`;
            const templates = [['0', t('None')]].concat(F.eventChoices(context, { stored: form.template }));
            body += row(t('Who'), `<select class="fc-who database-field-value">${records()}</select>`);
            body += row(t('Side'), select('team', tr([['enemy', 'Enemy'], ['ally', 'Ally'], ['neutral', 'Bystander']]), form.team));
            body += row(t('Where'), `<div class="fc-stack">`
                + where('cell', t('On a tile'), `<span class="fc-tile"></span><button type="button" class="fc-pick-tile rr-btn-browse">${esc(t('Pick on the map…'))}</button>`)
                + where('event', t('Next to'), select('eventId', F.eventChoices(context, { self: true, player: true, stored: form.eventId }), form.eventId))
                + where('variables', t('At the tile in variables'), `<span class="fc-words">X</span>${picker('varX', 'variable', form.varX)}<span class="fc-words">Y</span>${picker('varY', 'variable', form.varY)}`)
                + '</div>');
            body += row(t('Facing'), `<div class="fc-seg" title="${esc(t('With none chosen it faces as its pages say.'))}">${F.FACINGS.map(([value, label]) => `<button type="button" class="fc-face${form.direction === value ? ' is-on' : ''}" data-direction="${value}">${esc(t(label))}</button>`).join('')}</div>`);
            body += more(
                row(t('How many'), number('count', form.count, 1, 99) + `<span class="fc-words">${esc(t('The others take the nearest free tiles.'))}</span>`, 'fc-more')
                + row(t('Copy pages from'), select('template', templates, form.template), 'fc-more')
                + check('stay', t('Stays on the map after the battle'), form.stay, 'fc-more'));
        } else if (name === 'RemoveUnit') {
            body += row(t('Who'), select('eventId', F.eventChoices(context, { self: true, stored: form.eventId }), form.eventId));
            body += check('keep', t('It stays on the map as a bystander'), form.keep);
            body += hint(t('No reward is given.'));
        } else if (name === 'EndMapBattle') {
            body += row(t('End it as'), select('result', tr(F.RESULTS), form.result));
        } else if (name === 'ChangeBattleMode') {
            body += row(t('Battle mode'), select('mode', tr(F.MODES).concat([['default', t("The game's own setting")]]), form.mode));
            body += row(t('For'), select('scope', tr(F.SCOPES), form.scope));
            body += hint(t('Classic is the separate battle screen; Tactical, Action and First Person fight on the map.'));
        } else if (name === 'SetTerrainCost') {
            body += row(t('Tiles with'), select('type', tr(F.TERRAINS), form.type) + number('id', form.id, 0, 255));
            body += row(t('A step costs'), select('cost', F.costChoices(form), form.cost));
            body += hint(t('In Tactical battles, from now on.'));
        }
        body += '<div class="fc-problem fc-wide" hidden></div>';

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        // Over the event editor and the command picker, under the pickers this dialog opens.
        modal.style.zIndex = '10004';
        const label = F.TITLES[name] || F.LABELS[name];
        const title = F.TITLES[name] ? t(label) : (window.I18n && window.I18n.tEventCommandName ? window.I18n.tEventCommandName(label) : label);
        modal.innerHTML = `
            <div class="rr-modal fc-modal fc-modal-${name}" style="width:min(520px,94vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${esc(title)}</div>
                    <button type="button" class="rr-modal-close fc-cancel">&times;</button>
                </div>
                <div class="rr-modal-body fc-body">${body}</div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary fc-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary fc-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const $ = key => modal.querySelector('.fc-' + key);
        const all = selector => Array.from(modal.querySelectorAll(selector));

        // The form follows its controls: a control's class is its field.
        const read = () => {
            for (const key of Object.keys(form)) {
                const control = $(key);
                if (!control || control.name === 'fc-at') continue;
                if (control.type === 'checkbox') form[key] = control.checked;
                else if (control.type === 'number' || control.type === 'hidden') form[key] = Math.floor(Number(control.value) || 0);
                else form[key] = control.value;
            }
            const at = modal.querySelector('.fc-at:checked');
            if (at) form.at = at.value;
            return form;
        };
        const showWhen = (cls, on) => all('.fc-when-' + cls).forEach(el => { el.dataset['off' + cls] = on ? '' : '1'; });
        const apply = () => all('.fc-row, .fc-hint, .fc-check').forEach(el => {
            const off = Object.keys(el.dataset).some(key => key.startsWith('off') && el.dataset[key] === '1');
            const folded = el.classList.contains('fc-more') && !modal.classList.contains('fc-more-open');
            el.hidden = off || folded;
        });
        const refresh = () => {
            read();
            const shown = F.shown(name, form, context);
            for (const key of Object.keys(shown)) showWhen(key, shown[key]);
            if (name === 'StartMapBattle') {
                const line = F.enemiesLine(form, context), box = $('enemies');
                box.textContent = line.words;
                box.classList.toggle('fc-warn', line.warn);
                const starts = F.startsLine(context);
                $('starts').hidden = !starts;
                $('starts-text').textContent = starts;
            }
            if (name === 'StartMapBattle' || name === 'ChangeBattleGoal') {
                const words = $('goalText');
                if (words) words.placeholder = F.summary('ChangeBattleGoal', Object.assign({}, form, { goalText: '' }), context);
            } else if (name === 'SpawnUnit') {
                all('.fc-where').forEach(line => line.classList.toggle('is-on', line.dataset.at === form.at));
                all('.fc-face').forEach(button => button.classList.toggle('is-on', Number(button.dataset.direction) === form.direction));
                $('tile').textContent = form.tileX === null ? t('(not picked)') : `(${form.tileX}, ${form.tileY})`;
            }
            apply();
            const problem = $('problem');
            if (problem && !problem.hidden) { problem.hidden = true; problem.textContent = ''; }
        };

        modal.addEventListener('change', event => {
            if (name === 'SpawnUnit' && event.target === $('who') && follows) {
                // The side follows the record until it is chosen by hand.
                $('team').value = F.recordSide($('who').value);
            }
            if (name === 'SpawnUnit' && event.target === $('team')) follows = false;
            refresh();
        });
        let follows = name === 'SpawnUnit' && F.followsRecord(form);
        modal.addEventListener('input', event => { if (event.target.type === 'number' || event.target.type === 'text') read(); });

        const toggle = $('more-toggle');
        if (toggle) {
            const open = on => {
                modal.classList.toggle('fc-more-open', on);
                toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
                toggle.querySelector('.fc-more-mark').innerHTML = on ? '&#9662;' : '&#9656;';
                apply();
            };
            toggle.addEventListener('click', () => open(!modal.classList.contains('fc-more-open')));
            // Open from the start when something under it is set.
            open(F.moreOpen(name, form));
        }

        // Switches and variables through the stock picker.
        all('.fc-pick').forEach(pick => {
            const input = pick.querySelector('input'), button = pick.querySelector('.fc-pick-open'), clear = pick.querySelector('.fc-pick-clear');
            const kind = pick.dataset.kind, names = () => (kind === 'switch' ? context.switches : context.variables);
            const set = id => {
                input.value = String(id);
                button.textContent = named(names(), id);
                if (clear) clear.hidden = !(id > 0);
                refresh();
            };
            button.addEventListener('click', () => {
                if (typeof SwitchVariablePicker === 'undefined') return;
                new SwitchVariablePicker(this._manager(), this._projectController()).show(kind, Number(input.value) || 1, id => { if (id) set(id); });
            });
            if (clear) clear.addEventListener('click', () => set(0));
        });

        if (name === 'SpawnUnit') {
            all('.fc-face').forEach(button => button.addEventListener('click', () => {
                F.faced(form, button.dataset.direction);
                refresh();
            }));
            // A press anywhere on a line chooses that line.
            all('.fc-where').forEach(line => line.addEventListener('pointerdown', () => {
                const radio = line.querySelector('.fc-at');
                if (radio.checked) return;
                radio.checked = true;
                refresh();
            }, true));
            $('pick-tile').addEventListener('click', async () => {
                const [record, id] = String($('who').value).split(':');
                const picked = await this.pickTile(modal, { unit: { team: $('team').value, record, id: Number(id) || 0 }, x: form.tileX, y: form.tileY, direction: form.direction }, context);
                F.picked(form, picked);
                refresh();
            });
        }
        if (name === 'StartMapBattle') {
            $('leave').addEventListener('click', () => {
                // The map's own Note: it is the map that changes, whatever becomes of this dialog.
                if (!F.leaveToEvents(context.map)) return;
                const setup = typeof RRBattleSetup !== 'undefined' ? RRBattleSetup : null;
                if (setup && typeof setup.syncMapTrigger === 'function') setup.syncMapTrigger();
                refresh();
            });
        }
        refresh();

        // The dialog's keys: the focus starts inside and stays there, Escape is Cancel, Enter is OK.
        const keys = typeof RRKeyboardNavigation !== 'undefined' && RRKeyboardNavigation.modal ? RRKeyboardNavigation.modal(modal, { onEscape: () => cancel() }) : null;
        let closed = false, asking = false;
        const close = () => {
            closed = true;
            if (keys) { keys.leave(); if (typeof keys.dispose === 'function') keys.dispose(); }
            if (typeof document.removeEventListener === 'function') document.removeEventListener('keydown', onPageKey);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };
        const cancel = () => { if (closed || asking) return; close(); callback(null); };
        const accept = async () => {
            if (closed || asking) return;
            read();
            const result = F.store(name, stored, form, context, (command && command.indent) || 0);
            if (result.problem) {
                const box = $('problem');
                box.textContent = result.problem;
                box.hidden = false;
                return;
            }
            if (hooks && typeof hooks.beforeStore === 'function') {
                asking = true;
                let go = false;
                try { go = await hooks.beforeStore(result.commands); } finally { asking = false; }
                if (!go) return;
            }
            close();
            callback(result.commands);
        };
        all('.fc-cancel').forEach(button => button.addEventListener('click', cancel));
        $('ok').addEventListener('click', accept);
        const onKey = event => {
            if (!FightCommandEditor.confirmsOn(event)) return;
            event.preventDefault();
            accept();
        };
        modal.addEventListener('keydown', onKey);
        // A click on the dialog's own words leaves the focus on the page: Enter there is the dialog's while nothing it opened lies over it.
        const onPageKey = event => { if (event.target === document.body && FightCommandEditor.onTop(modal)) onKey(event); };
        if (typeof document.addEventListener === 'function') document.addEventListener('keydown', onPageKey);
        if (keys) {
            const first = keys.enter();
            // A list the editor dresses up after it is added gives the focus up: the same control takes it again once
            // that is done. The dialog is entered once, so the focus still goes back to what opened it.
            setTimeout(() => { if (!closed && first && !modal.contains(document.activeElement)) first.focus({ preventScroll: true }); }, 0);
        }
    }

    /** Whether `overlay` is what lies in the middle of the window: nothing opened from it is over it. */
    static onTop(overlay) {
        if (typeof document.elementFromPoint !== 'function' || typeof window === 'undefined') return true;
        const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return !!hit && overlay.contains(hit);
    }

    /** Whether a key press in a dialog is OK: Enter anywhere but on a button, a list or a text area, which use it themselves. */
    static confirmsOn(event) {
        if (!event || event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
        const tag = String((event.target && event.target.tagName) || '').toUpperCase();
        return tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'TEXTAREA';
    }

    _projectController() {
        return this.projectController || (typeof window !== 'undefined' && window.reactor && window.reactor.projectController) || null;
    }

    /** A database list as [id, "0001: Name"]. */
    _records(kind) {
        const manager = this._manager();
        const list = manager && manager.data ? manager.data[kind] : null;
        return (Array.isArray(list) ? list : []).filter(entry => entry && entry.id > 0)
            .map(entry => [String(entry.id), FightCommandEditor._numbered(entry.id, entry.name || '')]);
    }

    /**
     * One tile of the open map, picked by the user: `{ x, y, direction }`, or
     * null when nothing was picked. Battle Setup's pick on the live map is
     * used when it is there (the dialogs step aside for it); otherwise the
     * map's picture in the position picker.
     */
    pickTile(modal, request, context) {
        const setup = typeof RRBattleSetup !== 'undefined' ? RRBattleSetup : null;
        if (setup && typeof setup.pickTile === 'function') {
            const hidden = [modal, document.getElementById('event-editor-modal')].filter(element => element && element.style.display !== 'none')
                .map(element => [element, element.style.display]);
            hidden.forEach(([element]) => { element.style.display = 'none'; });
            const back = () => hidden.forEach(([element, display]) => { element.style.display = display; });
            return Promise.resolve().then(() => setup.pickTile(request)).then(picked => { back(); return picked || null; }, () => { back(); return null; });
        }
        const map = context.map, controller = this._projectController();
        if (!map || typeof TransferPlayerEditor === 'undefined' || !controller) return Promise.resolve(null);
        const mapId = Number(map.id) || Number(controller.tilemapManager && controller.tilemapManager.currentMapId) || 0;
        return new Promise(resolve => {
            new TransferPlayerEditor(this._manager(), controller).showMapPicker({
                mapId, x: request.x === null ? (context.event ? context.event.x : 0) : request.x, y: request.y === null ? (context.event ? context.event.y : 0) : request.y,
                title: this._t('Pick a tile'), thisMapOnly: true,
                onConfirm: location => resolve({ x: location.x, y: location.y }),
                onCancel: () => resolve(null)
            });
        });
    }
}

if (typeof globalThis !== 'undefined') globalThis.FightCommandEditor = FightCommandEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = FightCommandEditor;
