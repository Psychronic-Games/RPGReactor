/**
 * StockInterfaces - baseline interface records for a project's stock scenes
 *
 * A project that never authored an interface opens the User Interfaces
 * section on these: the Title Screen, Main Menu, Game End, Status, Options,
 * Save, and Load laid out with
 * the same window math the runtime uses (Scene_Title / Scene_Menu /
 * Scene_GameEnd rects), the project's own terms on the buttons, and each
 * button wired to the action the stock command performs. They are ordinary
 * records: the game keeps its stock scenes until one is called or set as
 * a System replacement, so seeding them changes nothing at play time.
 *
 * Save and Load use dedicated semantic slot actions. Item, Skill, Equip, Shop,
 * Name, and Battle remain stock until their workflows are implemented end to end.
 */
(function(root) {
    'use strict';

    const LINE = 36;
    const PADDING = 12;
    const BUTTON_AREA = 52;
    const COMMAND_WIDTH = 240;
    const FACE = 144;

    const COMMANDS = {
        item: 4, skill: 5, equip: 6, status: 7, formation: 8, save: 9, gameEnd: 10, options: 11,
        newGame: 18, continue: 19, toTitle: 21, cancel: 22
    };
    const DEFAULT_COMMANDS = {
        item: 'Item', skill: 'Skill', equip: 'Equip', status: 'Status', formation: 'Formation', save: 'Save',
        gameEnd: 'Game End', options: 'Options', newGame: 'New Game', continue: 'Continue', toTitle: 'To Title', cancel: 'Cancel'
    };
    const DEFAULT_BASIC = ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP', 'EXP', 'EXP'];

    function fittingHeight(lines) {
        return lines * LINE + PADDING * 2;
    }

    function condition(type, extra) {
        return Object.assign({ type: type || 'always', id: 1, on: true, op: '==', value: 0, script: '' }, extra || {});
    }

    function action(type, extra) {
        return Object.assign({ type, id: 1, scene: 'menu', plugin: '', command: '', args: {}, on: true, op: 'set', value: 0, script: '', contextName: 'selection', andClose: false }, extra || {});
    }

    class Builder {
        constructor() {
            this.nodes = [];
        }

        add(type, props) {
            const id = this.nodes.length + 1;
            const node = Object.assign({
                id, type, name: '', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 200, height: 100,
                opacity: 255, visible: condition('always')
            }, props);
            this.nodes.push(node);
            return node;
        }

        box(name, x, y, width, height, extra) {
            return this.add('box', Object.assign({
                name, x, y, width, height, fill: 'window', color: '#000000', color2: '#000000',
                fillOpacity: 160, vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0
            }, extra || {}));
        }

        text(parent, text, x, y, width, extra) {
            return this.add('text', Object.assign({
                parent, text, x, y, width, height: LINE, fill: 'none', align: 'left', fontSize: 0,
                textColor: 0, outline: true, wrap: false, fitText: false
            }, extra || {}));
        }

        button(parent, text, x, y, width, act, extra) {
            return this.add('button', Object.assign({
                parent, text, x, y, width, height: LINE, fill: 'none', color: '#000000', color2: '#000000',
                fillOpacity: 160, vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0,
                align: 'center', fontSize: 0, textColor: 0, outline: true, fitText: false,
                action: act, enabled: condition('always'), highlightColor: '#ffffff', se: null
            }, extra || {}));
        }

        partyFace(parent, slot, x, y, extra) {
            return this.add('image', Object.assign({
                parent, x, y, width: FACE, height: FACE, fill: 'none', source: 'partyFace', file: '',
                index: slot, fit: 'none'
            }, extra || {}));
        }

        gauge(parent, kind, x, y, width, extra) {
            return this.add('gauge', Object.assign({
                parent, x, y, width, height: 24, fill: 'none', gauge: kind,
                actorSource: 'menuActor', actorId: 1, actorVariableId: 1, actorContextName: 'selection', index: 0,
                variableId: 1, max: 100, maxVariableId: 0, label: '', showLabel: true, showValue: true,
                valueFormat: 'currentMax', gaugeColor1: '', gaugeColor2: '', gaugeBackColor: '', gaugeHeight: 0
            }, extra || {}));
        }

        list(name, parent, source, x, y, width, height, extra) {
            return this.add('list', Object.assign({
                name, parent, x, y, width, height, fill: 'window', color: '#000000', color2: '#000000',
                fillOpacity: 160, vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0,
                text: '', align: 'left', fontSize: 0, textColor: 0, outline: true,
                dataSource: source, category: 'all', actorSource: 'menuActor', actorMode: 'party', actorId: 1,
                actorVariableId: 1, actorContextName: 'selection', index: 0, skillTypeId: 0,
                includeAutosave: false, rangeStart: 1, rangeEnd: 10, items: [], rowText: '', rowHeight: LINE,
                contextName: 'selection', selectionVariableId: 0, selectionValue: 'id', action: action('none'),
                enabled: condition('always'), highlightColor: '#ffffff', focusedTextColor: '',
                disabledTextColor: '', disabledOpacity: 160, se: null
            }, extra || {}));
        }
    }

    const StockInterfaces = {
        // New baselines append in phases so every prior ID remains stable.
        KINDS: ['title', 'menu', 'gameEnd', 'status', 'options', 'save', 'load'],

        /** The screen and UI area a project draws in, from System.json. */
        metrics(system) {
            const advanced = (system && system.advanced) || {};
            const width = Number(advanced.screenWidth) || 816;
            const height = Number(advanced.screenHeight) || 624;
            const boxWidth = Number(advanced.uiAreaWidth) || width;
            const boxHeight = Number(advanced.uiAreaHeight) || height;
            return {
                width, height, boxWidth, boxHeight,
                boxX: Math.floor((width - boxWidth) / 2),
                boxY: Math.floor((height - boxHeight) / 2),
                mainAreaTop: BUTTON_AREA,
                mainAreaHeight: boxHeight - BUTTON_AREA
            };
        },

        term(system, key) {
            const commands = system && system.terms && Array.isArray(system.terms.commands) ? system.terms.commands : [];
            const value = commands[COMMANDS[key]];
            return typeof value === 'string' && value.trim() ? value : DEFAULT_COMMANDS[key];
        },

        basic(system, index) {
            const basic = system && system.terms && Array.isArray(system.terms.basic) ? system.terms.basic : [];
            const value = basic[index];
            return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BASIC[index];
        },

        record(kind, name, builder, extra) {
            return Object.assign({
                name, mode: 'scene', background: 'blur', cancel: action('close'), firstFocus: 0,
                coordinateSpace: 'screen', nodes: builder.nodes, note: '', stock: kind, roles: [kind]
            }, extra || {});
        },

        title(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const offset = system.titleCommandWindow || {};
            const b = new Builder();
            if (system.title1Name) b.add('image', { name: 'Title background 1', x: 0, y: 0, width: m.width, height: m.height, fill: 'none', source: 'title1', file: system.title1Name, index: 0, fit: 'stretch' });
            if (system.title2Name) b.add('image', { name: 'Title background 2', x: 0, y: 0, width: m.width, height: m.height, fill: 'none', source: 'title2', file: system.title2Name, index: 0, fit: 'stretch' });
            const titleSize = 72;
            if (system.optDrawTitle !== false) {
                b.text(0, String(system.gameTitle || ''), 20, Math.floor(m.height / 4) + Math.round((48 - (titleSize + 10)) / 2), m.width - 40, {
                    name: 'Game title', align: 'center', fontSize: titleSize, height: 0
                });
            }
            const height = fittingHeight(3);
            const box = b.box('Commands',
                m.boxX + Math.floor((m.boxWidth - COMMAND_WIDTH) / 2) + (Number(offset.offsetX) || 0),
                m.boxY + m.boxHeight - height - 96 + (Number(offset.offsetY) || 0),
                COMMAND_WIDTH, height);
            const inner = COMMAND_WIDTH - PADDING * 2;
            const first = b.button(box.id, this.term(system, 'newGame'), PADDING, PADDING, inner,
                action('titleNewGame'));
            b.button(box.id, this.term(system, 'continue'), PADDING, PADDING + LINE, inner,
                action('titleContinue'),
                { enabled: condition('saveExists') });
            b.button(box.id, this.term(system, 'options'), PADDING, PADDING + LINE * 2, inner,
                action('titleOptions'));
            const record = this.record('title', 'Title Screen', b, { background: 'none', cancel: action('none'), firstFocus: first.id });
            record.note = 'Baseline of the stock title screen. Bind it in System 1 to replace the title.';
            return record;
        },

        menu(data) {
            const system = data.system || {};
            const flags = Array.isArray(system.menuCommands) ? system.menuCommands : [];
            const on = index => flags[index] !== false;
            const m = this.metrics(system);
            const b = new Builder();
            const goldHeight = fittingHeight(1);
            const commandX = m.boxX + m.boxWidth - COMMAND_WIDTH;
            const commands = b.box('Commands', commandX, m.boxY + m.mainAreaTop, COMMAND_WIDTH, m.mainAreaHeight - goldHeight);
            const inner = COMMAND_WIDTH - PADDING * 2;
            const entries = [];
            const partyEnabled = () => condition('script', { script: '$gameParty.exists()' });
            const actorEnabled = () => condition('script', { script: 'return !!scene.context("selectedActor");' });
            if (on(0)) entries.push(['item', action('scene', { scene: 'item' }), partyEnabled()]);
            if (on(1)) entries.push(['skill', action('personalSkill', { contextName: 'selectedActor' }), actorEnabled()]);
            if (on(2)) entries.push(['equip', action('personalEquip', { contextName: 'selectedActor' }), actorEnabled()]);
            if (on(3)) entries.push(['status', action('personalStatus', { contextName: 'selectedActor' }), actorEnabled()]);
            entries.push(['options', action('scene', { scene: 'options' })]);
            if (on(5)) entries.push(['save', action('scene', { scene: 'save' }), condition('script', { script: '!DataManager.isEventTest() && $gameSystem.isSaveEnabled()' })]);
            entries.push(['gameEnd', action('scene', { scene: 'gameEnd' })]);
            let firstFocus = 0;
            entries.forEach(([key, act, enabled], index) => {
                const button = b.button(commands.id, this.term(system, key), PADDING, PADDING + LINE * index, inner, act,
                    enabled ? { enabled } : {});
                if (!firstFocus) firstFocus = button.id;
            });
            const gold = b.box('Gold', commandX, m.boxY + m.mainAreaTop + m.mainAreaHeight - goldHeight, COMMAND_WIDTH, goldHeight);
            b.text(gold.id, '\\GOLD \\G', PADDING, PADDING, COMMAND_WIDTH - PADDING * 2, { name: 'Gold', align: 'right' });
            const statusWidth = m.boxWidth - COMMAND_WIDTH;
            const status = b.box('Party', m.boxX, m.boxY + m.mainAreaTop, statusWidth, m.mainAreaHeight);
            const listWidth = Math.min(280, Math.max(200, Math.floor(statusWidth * 0.35)));
            b.list('Party members', status.id, 'party', PADDING, PADDING, listWidth - PADDING, m.mainAreaHeight - PADDING * 2, {
                actorSource: 'partySlot', contextName: 'selectedActor', rowText: '{name}  ' + this.basic(system, 1) + ' {level}'
            });
            const detailX = listWidth + PADDING;
            const detailWidth = Math.max(0, statusWidth - detailX - PADDING);
            const faceSize = Math.min(FACE, Math.max(96, detailWidth - PADDING * 2));
            b.partyFace(status.id, 0, detailX, PADDING, {
                name: 'Selected face', width: faceSize, height: faceSize, fit: 'contain',
                actorSource: 'context', actorContextName: 'selectedActor'
            });
            const textX = detailX + faceSize + PADDING;
            const textWidth = Math.max(120, statusWidth - textX - PADDING);
            const actor = { actorSource: 'context', actorContextName: 'selectedActor' };
            b.text(status.id, '{actor.name}', textX, PADDING, textWidth, Object.assign({ name: 'Selected name' }, actor));
            b.text(status.id, this.basic(system, 0) + ' {actor.level}  {actor.class}', textX, PADDING + LINE, textWidth, Object.assign({ name: 'Selected level and class' }, actor));
            b.gauge(status.id, 'hp', textX, PADDING + LINE * 2, textWidth, Object.assign({ name: 'Selected HP' }, actor));
            b.gauge(status.id, 'mp', textX, PADDING + LINE * 3, textWidth, Object.assign({ name: 'Selected MP' }, actor));
            b.gauge(status.id, 'exp', textX, PADDING + LINE * 4, textWidth, Object.assign({ name: 'Selected EXP', valueFormat: 'percent' }, actor));
            const record = this.record('menu', 'Main Menu', b, { firstFocus });
            record.note = 'Baseline of the stock main menu. Bind it in System 2 to replace the main / pause menu; the stock menu stays in use until this one is called or bound.';
            return record;
        },

        gameEnd(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            const height = fittingHeight(2);
            const box = b.box('Commands', m.boxX + Math.floor((m.boxWidth - COMMAND_WIDTH) / 2),
                m.boxY + Math.floor((m.boxHeight - height) / 2), COMMAND_WIDTH, height);
            const inner = COMMAND_WIDTH - PADDING * 2;
            const first = b.button(box.id, this.term(system, 'toTitle'), PADDING, PADDING, inner, action('gameEndToTitle'));
            b.button(box.id, this.term(system, 'cancel'), PADDING, PADDING + LINE, inner, action('close'));
            const record = this.record('gameEnd', 'Game End', b, { firstFocus: first.id });
            record.note = 'Baseline of the stock game end prompt.';
            return record;
        },

        status(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            const top = m.boxY + m.mainAreaTop;
            const profileHeight = fittingHeight(2);
            const headerHeight = Math.min(216, Math.max(180, Math.floor(m.mainAreaHeight * 0.36)));
            const bodyHeight = Math.max(120, m.mainAreaHeight - headerHeight - profileHeight);
            const previous = b.button(0, '< ' + this.term(system, 'status'), m.boxX + PADDING, m.boxY + 8, 152,
                action('previousMenuActor'), { name: 'Previous actor' });
            b.button(0, this.term(system, 'status') + ' >', m.boxX + PADDING + 160, m.boxY + 8, 152,
                action('nextMenuActor'), { name: 'Next actor' });
            b.button(0, this.term(system, 'cancel'), m.boxX + m.boxWidth - 132, m.boxY + 8, 120,
                action('close'), { name: 'Cancel' });

            const summary = b.box('Actor summary', m.boxX, top, m.boxWidth, headerHeight);
            const actor = { actorSource: 'menuActor' };
            b.partyFace(summary.id, 0, PADDING, PADDING, Object.assign({ name: 'Face', width: FACE, height: FACE }, actor));
            const textX = PADDING + FACE + 24;
            const textWidth = Math.max(160, m.boxWidth - textX - PADDING);
            b.text(summary.id, '{actor.name}  "{actor.nickname}"', textX, PADDING, textWidth, Object.assign({ name: 'Name and nickname' }, actor));
            b.text(summary.id, '{actor.class}', textX, PADDING + LINE, textWidth, Object.assign({ name: 'Class' }, actor));
            b.text(summary.id, this.basic(system, 0) + ' {actor.level}', textX, PADDING + LINE * 2, 180, Object.assign({ name: 'Level' }, actor));
            b.text(summary.id, this.basic(system, 8) + ' {actor.totalExp}   ' + this.basic(system, 8) + ' -> {actor.nextRequiredExp}',
                textX + 190, PADDING + LINE * 2, Math.max(160, textWidth - 190), Object.assign({ name: 'Experience data' }, actor));
            const gaugeWidth = Math.max(120, Math.floor((textWidth - PADDING) / 2));
            b.gauge(summary.id, 'hp', textX, PADDING + LINE * 3, gaugeWidth, Object.assign({ name: 'HP' }, actor));
            b.gauge(summary.id, 'mp', textX + gaugeWidth + PADDING, PADDING + LINE * 3, gaugeWidth, Object.assign({ name: 'MP' }, actor));
            b.gauge(summary.id, 'tp', textX, PADDING + LINE * 4, gaugeWidth, Object.assign({ name: 'TP' }, actor));
            b.gauge(summary.id, 'exp', textX + gaugeWidth + PADDING, PADDING + LINE * 4, gaugeWidth,
                Object.assign({ name: 'EXP', valueFormat: 'currentMax' }, actor));

            const bodyY = top + headerHeight;
            const paramsWidth = Math.min(300, Math.max(220, Math.floor(m.boxWidth * 0.3)));
            const remainder = m.boxWidth - paramsWidth;
            const equipmentWidth = Math.floor(remainder * 0.55);
            b.list('Parameters', 0, 'actorParameters', m.boxX, bodyY, paramsWidth, bodyHeight, {
                actorSource: 'menuActor', rowText: '{paramName}: {paramValue}'
            });
            b.list('Equipment', 0, 'actorEquipment', m.boxX + paramsWidth, bodyY, equipmentWidth, bodyHeight, {
                actorSource: 'menuActor'
            });
            const statesX = m.boxX + paramsWidth + equipmentWidth;
            const statesWidth = remainder - equipmentWidth;
            const stateDetailHeight = fittingHeight(2);
            b.list('States', 0, 'actorStates', statesX, bodyY, statesWidth, bodyHeight - stateDetailHeight,
                { actorSource: 'menuActor', contextName: 'selectedState' });
            const stateDetail = b.box('Selected state', statesX, bodyY + bodyHeight - stateDetailHeight, statesWidth, stateDetailHeight);
            b.text(stateDetail.id, '{context.description}', PADDING, PADDING, Math.max(0, statesWidth - PADDING * 2),
                { name: 'State description', height: stateDetailHeight - PADDING * 2, wrap: true, fitText: true, contextName: 'selectedState' });
            const profile = b.box('Profile', m.boxX, bodyY + bodyHeight, m.boxWidth, profileHeight);
            b.text(profile.id, '{actor.profile}', PADDING, PADDING, m.boxWidth - PADDING * 2,
                Object.assign({ name: 'Profile', height: profileHeight - PADDING * 2, wrap: true, fitText: true }, actor));

            const record = this.record('status', 'Status', b, { firstFocus: previous.id });
            record.note = 'Read-only baseline of the stock status screen. Bind it in System 2 to replace Status; it follows the current menu actor.';
            return record;
        },

        options(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            const width = Math.min(560, m.boxWidth);
            const height = Math.min(m.boxHeight, fittingHeight(7));
            const list = b.list('Options', 0, 'options', m.boxX + Math.floor((m.boxWidth - width) / 2),
                m.boxY + Math.floor((m.boxHeight - height) / 2), width, height, {
                    rowText: '{name}  {valueText}', action: action('optionChange'), contextName: 'selectedOption'
                });
            const record = this.record('options', 'Options', b, { firstFocus: list.id });
            record.note = 'Baseline of the stock options screen. Left/right and confirmation use MZ option wrapping and volume steps.';
            return record;
        },

        file(data, mode) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            const top = m.boxY + m.mainAreaTop;
            const listWidth = Math.max(320, Math.floor(m.boxWidth * 0.58));
            const detailWidth = m.boxWidth - listWidth;
            b.button(0, this.term(system, 'cancel'), m.boxX + m.boxWidth - 132, m.boxY + 8, 120,
                action('close'), { name: 'Cancel' });
            const slots = b.list(mode === 'save' ? 'Save slots' : 'Load slots', 0, 'saveSlots', m.boxX, top,
                listWidth, m.mainAreaHeight, {
                    includeAutosave: mode === 'load' && system.optAutosave !== false,
                    rowText: '{name}  {playtime}', rowHeight: 72, contextName: 'selectedSave',
                    action: action(mode === 'save' ? 'saveSlot' : 'loadSlot')
                });
            const detail = b.box('Selected slot', m.boxX + listWidth, top, detailWidth, m.mainAreaHeight);
            const inner = Math.max(0, detailWidth - PADDING * 2);
            const selected = { contextName: 'selectedSave' };
            b.text(detail.id, '{context.name}', PADDING, PADDING, inner, Object.assign({ name: 'Slot name' }, selected));
            b.text(detail.id, '{context.title}', PADDING, PADDING + LINE, inner, Object.assign({ name: 'Game title' }, selected));
            b.text(detail.id, '{context.playtime}', PADDING, PADDING + LINE * 2, inner, Object.assign({ name: 'Playtime' }, selected));
            b.text(detail.id, '{context.date}', PADDING, PADDING + LINE * 3, inner, Object.assign({ name: 'Date' }, selected));
            b.text(detail.id, '{context.partyCharacters}', PADDING, PADDING + LINE * 4, inner,
                Object.assign({ name: 'Party characters', height: LINE * 2, wrap: true, fitText: true }, selected));
            const record = this.record(mode, mode === 'save' ? 'Save' : 'Load', b, { firstFocus: slots.id });
            record.note = mode === 'save'
                ? 'Baseline of the stock save screen. Autosave is excluded and the selected manual slot is saved asynchronously.'
                : 'Baseline of the stock load screen. Only existing slots are enabled and successful loads continue to the map.';
            return record;
        },

        save(data) {
            return this.file(data, 'save');
        },

        load(data) {
            return this.file(data, 'load');
        },

        /** Every baseline record, in list order, for a project's data. */
        build(data) {
            const source = data && typeof data === 'object' ? data : {};
            return this.KINDS.map((kind, index) => Object.assign({ id: index + 1 }, this[kind](source)));
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = StockInterfaces;
    root.RRStockInterfaces = StockInterfaces;
})(typeof window !== 'undefined' ? window : globalThis);
