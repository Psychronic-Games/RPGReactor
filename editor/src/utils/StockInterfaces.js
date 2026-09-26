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
 * Save and Load use dedicated semantic slot actions; Items, Skills, Equipment
 * and Shop chain their lists through contexts (a category list filters the
 * item list, a slot list the candidates) and use the Use, Equip, Buy and Sell
 * workflows. Name Input edits the actor's name in a Text Input field with the
 * stock character grid. Battle is a Battle HUD: a party panel with face
 * reactions and ATB, the stock battle windows placed by Battle Window nodes
 * (the actor command follows the active actor), and a Target Cursor.
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
        equip2: 15, optimize: 16, clear: 17, newGame: 18, continue: 19, toTitle: 21, cancel: 22, buy: 24, sell: 25
    };
    const DEFAULT_COMMANDS = {
        item: 'Item', skill: 'Skill', equip: 'Equip', status: 'Status', formation: 'Formation', save: 'Save',
        gameEnd: 'Game End', options: 'Options', newGame: 'New Game', continue: 'Continue', toTitle: 'To Title', cancel: 'Cancel',
        equip2: 'Equip', optimize: 'Optimize', clear: 'Clear', buy: 'Buy', sell: 'Sell'
    };
    const LIST_ROW = 36;
    const selectableHeight = rows => rows * LIST_ROW + PADDING * 2;
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
        KINDS: ['title', 'menu', 'gameEnd', 'status', 'options', 'save', 'load', 'item', 'skill', 'equip', 'shop', 'name', 'battle'],

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
            const actorEnabled = partyEnabled;
            if (on(0)) entries.push(['item', action('scene', { scene: 'item', contextName: 'selectedActor', chooseActor: true }), partyEnabled()]);
            if (on(1)) entries.push(['skill', action('personalSkill', { contextName: 'selectedActor' }), actorEnabled()]);
            if (on(2)) entries.push(['equip', action('personalEquip', { contextName: 'selectedActor' }), actorEnabled()]);
            if (on(3)) entries.push(['status', action('personalStatus', { contextName: 'selectedActor' }), actorEnabled()]);
            if (on(4)) entries.push(['formation', action('formation', { contextName: 'selectedActor' }), condition('script', { script: '$gameParty.size() > 1 && $gameSystem.isFormationEnabled()' })]);
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
            b.list('Actor Panel', 0, 'party', m.boxX, m.boxY + m.mainAreaTop, statusWidth, m.mainAreaHeight, {
                contextName: 'selectedActor', rowLayout: 'actorPanel', rowHeight: 256, portraitSize: 144,
                actorFields: ['portrait', 'name', 'class', 'level', 'hp', 'mp', 'exp', 'states']
            });
            const record = this.record('menu', 'Main Menu', b, { firstFocus });
            record.menuCommandVersion = 2;
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

        /** The help box every list screen opens with, and the text that reads a context's description. */
        helpBox(b, m, contextName, width) {
            const height = fittingHeight(2);
            const box = b.box('Help', m.boxX, m.boxY + m.mainAreaTop, width || m.boxWidth, height);
            const text = b.text(box.id, '{context.description}', PADDING, PADDING, (width || m.boxWidth) - PADDING * 2,
                { name: 'Description', height: height - PADDING * 2, wrap: true, fitText: true, contextName });
            return { box, text, bottom: m.boxY + m.mainAreaTop + height };
        },

        cancelButton(b, system, m) {
            return b.button(0, this.term(system, 'cancel'), m.boxX + m.boxWidth - 132, m.boxY + 8, 120, action('close'), { name: 'Cancel' });
        },

        /**
         * The party panel a Use action picks its target in: on the right, as
         * the stock menu actor window, and shown only while choosing.
         */
        targetPanel(b, m) {
            const top = m.boxY + m.mainAreaTop;
            const height = m.boxHeight - m.mainAreaTop;
            const rowHeight = Math.max(96, Math.floor(height / 4));
            return b.list('Targets', 0, 'party', m.boxX + COMMAND_WIDTH, top, m.boxWidth - COMMAND_WIDTH, height, {
                rowLayout: 'actorPanel', rowHeight, portraitSize: Math.min(FACE, rowHeight - PADDING * 2),
                actorFields: ['portrait', 'name', 'level', 'hp', 'mp', 'states'], contextName: 'target',
                visible: condition('script', { script: 'scene.isSelectingTarget()' })
            });
        },

        item(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            this.cancelButton(b, system, m);
            const help = this.helpBox(b, m, 'selectedItem');
            const bottom = m.boxY + m.boxHeight;
            const categoryHeight = selectableHeight(1);
            const categories = b.list('Categories', 0, 'itemCategories', m.boxX, help.bottom, m.boxWidth, categoryHeight, {
                columns: 4, align: 'center', contextName: 'selectedCategory'
            });
            const items = b.list('Items', 0, 'inventory', m.boxX, help.bottom + categoryHeight, m.boxWidth, bottom - help.bottom - categoryHeight, {
                columns: 2, filterContext: 'selectedCategory', contextName: 'selectedItem', backFocus: categories.id,
                action: action('use', { contextName: 'target' })
            });
            categories.action = action('focusNode', { id: items.id });
            this.targetPanel(b, m);
            const record = this.record('item', 'Items', b, { firstFocus: categories.id });
            record.note = 'Baseline of the stock item screen. A category chooses the items; Use picks a target in the party panel when the item is for allies.';
            return record;
        },

        skill(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            this.cancelButton(b, system, m);
            const help = this.helpBox(b, m, 'selectedSkill');
            const bottom = m.boxY + m.boxHeight;
            const typeHeight = selectableHeight(3);
            const actor = { actorSource: 'menuActor' };
            const types = b.list('Skill Types', 0, 'skillTypes', m.boxX, help.bottom, COMMAND_WIDTH, typeHeight,
                Object.assign({ contextName: 'selectedSkillType' }, actor));
            const status = b.box('Actor', m.boxX + COMMAND_WIDTH, help.bottom, m.boxWidth - COMMAND_WIDTH, typeHeight);
            const face = Math.min(FACE, typeHeight - PADDING * 2);
            b.partyFace(status.id, 0, PADDING, PADDING, Object.assign({ name: 'Face', width: face, height: face }, actor));
            // Name, level and class on the left, the three gauges beside them.
            const textX = PADDING + face + 16;
            const textWidth = Math.max(160, m.boxWidth - COMMAND_WIDTH - textX - PADDING);
            const column = Math.floor((textWidth - PADDING) / 2);
            const gaugeX = textX + column + PADDING;
            b.text(status.id, '{actor.name}', textX, PADDING, column, Object.assign({ name: 'Name', fitText: true, height: LINE }, actor));
            b.text(status.id, this.basic(system, 1) + ' {actor.level}', textX, PADDING + LINE, column, Object.assign({ name: 'Level' }, actor));
            b.text(status.id, '{actor.class}', textX, PADDING + LINE * 2, column, Object.assign({ name: 'Class', fitText: true, height: LINE }, actor));
            b.gauge(status.id, 'hp', gaugeX, PADDING + 6, column, Object.assign({ name: 'HP' }, actor));
            b.gauge(status.id, 'mp', gaugeX, PADDING + LINE + 6, column, Object.assign({ name: 'MP' }, actor));
            b.gauge(status.id, 'tp', gaugeX, PADDING + LINE * 2 + 6, column, Object.assign({ name: 'TP' }, actor));
            const skills = b.list('Skills', 0, 'skills', m.boxX, help.bottom + typeHeight, m.boxWidth, bottom - help.bottom - typeHeight,
                Object.assign({ columns: 2, filterContext: 'selectedSkillType', contextName: 'selectedSkill', backFocus: types.id,
                    rowText: '\\I[{icon}]{name}  {cost}', action: action('use', { contextName: 'target' }) }, actor));
            types.action = action('focusNode', { id: skills.id });
            this.targetPanel(b, m);
            const record = this.record('skill', 'Skills', b, { firstFocus: types.id });
            record.note = 'Baseline of the stock skill screen for the menu actor. Q and W change actor; Use picks a target in the party panel.';
            return record;
        },

        equip(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            this.cancelButton(b, system, m);
            const help = this.helpBox(b, m, 'selectedCandidate');
            const bottom = m.boxY + m.boxHeight;
            const statusWidth = Math.min(312, Math.floor(m.boxWidth * 0.4));
            const actor = { actorSource: 'menuActor' };
            const status = b.box('Actor', m.boxX, help.bottom, statusWidth, bottom - help.bottom);
            b.text(status.id, '{actor.name}', PADDING, PADDING, statusWidth - PADDING * 2, Object.assign({ name: 'Name' }, actor));
            b.list('Parameters', status.id, 'actorParameters', PADDING, PADDING + LINE, statusWidth - PADDING * 2, bottom - help.bottom - LINE - PADDING * 2,
                Object.assign({ fill: 'none', focusable: false, compareContext: 'selectedCandidate' }, actor));
            const rightX = m.boxX + statusWidth;
            const rightWidth = m.boxWidth - statusWidth;
            const commandHeight = fittingHeight(1);
            const commands = b.box('Commands', rightX, help.bottom, rightWidth, commandHeight);
            const third = Math.floor((rightWidth - PADDING * 2) / 3);
            const equip = b.button(commands.id, this.term(system, 'equip2'), PADDING, PADDING, third, action('none'), { name: 'Equip' });
            b.button(commands.id, this.term(system, 'optimize'), PADDING + third, PADDING, third, action('equipOptimize'), { name: 'Optimize' });
            b.button(commands.id, this.term(system, 'clear'), PADDING + third * 2, PADDING, third, action('equipClear'), { name: 'Clear' });
            const listTop = help.bottom + commandHeight;
            const slotHeight = Math.floor((bottom - listTop) / 2);
            const slots = b.list('Slots', 0, 'actorEquipment', rightX, listTop, rightWidth, slotHeight,
                Object.assign({ contextName: 'selectedSlot', rowText: '{paramName}  {valueText}', backFocus: equip.id }, actor));
            const candidates = b.list('Candidates', 0, 'equipCandidates', rightX, listTop + slotHeight, rightWidth, bottom - listTop - slotHeight,
                Object.assign({ columns: 2, filterContext: 'selectedSlot', contextName: 'selectedCandidate', backFocus: slots.id,
                    action: action('equip', { id: slots.id }) }, actor));
            equip.action = action('focusNode', { id: slots.id });
            slots.action = action('focusNode', { id: candidates.id });
            // The help line reads the slot's equipment while the slots have
            // focus and the candidate's otherwise, as the stock screen does.
            help.text.visible = condition('script', { script: `scene.focusedNodeId() !== ${slots.id}` });
            b.text(help.box.id, '{context.description}', PADDING, PADDING, m.boxWidth - PADDING * 2, {
                name: 'Slot description', height: help.box.height - PADDING * 2, wrap: true, fitText: true, contextName: 'selectedSlot',
                visible: condition('script', { script: `scene.focusedNodeId() === ${slots.id}` })
            });
            const record = this.record('equip', 'Equipment', b, { firstFocus: equip.id });
            record.note = 'Baseline of the stock equip screen for the menu actor. The parameters compare against the candidate under the cursor; Q and W change actor.';
            return record;
        },

        shop(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            this.cancelButton(b, system, m);
            const goldWidth = COMMAND_WIDTH;
            const help = this.helpBox(b, m, 'selectedGood', m.boxWidth - goldWidth);
            const gold = b.box('Gold', m.boxX + m.boxWidth - goldWidth, m.boxY + m.mainAreaTop, goldWidth, help.bottom - m.boxY - m.mainAreaTop);
            b.text(gold.id, '\\GOLD \\G', PADDING, PADDING, goldWidth - PADDING * 2, { name: 'Gold', align: 'right' });
            const bottom = m.boxY + m.boxHeight;
            const half = Math.floor(m.boxWidth / 2);
            const goods = b.list(this.term(system, 'buy'), 0, 'shopGoods', m.boxX, help.bottom, half, bottom - help.bottom, {
                contextName: 'selectedGood', rowText: '\\I[{icon}]{name}  {price}', action: action('shopBuy')
            });
            const sellable = condition('script', { script: '!scene.isPurchaseOnly()' });
            const categoryHeight = selectableHeight(2);
            const categories = b.list('Sell Categories', 0, 'itemCategories', m.boxX + half, help.bottom, m.boxWidth - half, categoryHeight, {
                columns: 2, align: 'center', contextName: 'sellCategory', backFocus: goods.id, visible: sellable
            });
            const sell = b.list(this.term(system, 'sell'), 0, 'shopSell', m.boxX + half, help.bottom + categoryHeight, m.boxWidth - half, bottom - help.bottom - categoryHeight, {
                filterContext: 'sellCategory', contextName: 'selectedSell', backFocus: categories.id, visible: sellable, action: action('shopSell')
            });
            categories.action = action('focusNode', { id: sell.id });
            // The help line follows whichever side has focus.
            help.text.visible = condition('script', { script: `scene.focusedNodeId() !== ${sell.id}` });
            b.text(help.box.id, '{context.description}', PADDING, PADDING, m.boxWidth - goldWidth - PADDING * 2, {
                name: 'Sell description', height: help.box.height - PADDING * 2, wrap: true, fitText: true, contextName: 'selectedSell',
                visible: condition('script', { script: `scene.focusedNodeId() === ${sell.id}` })
            });
            const record = this.record('shop', 'Shop', b, { firstFocus: goods.id });
            record.note = 'Baseline of the stock shop. Goods come from Shop Processing; Buy and Sell ask how many in the stock number window. Purchase-only shops hide the sell side.';
            return record;
        },

        name(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            const width = Math.min(m.boxWidth, 480);
            const height = FACE + PADDING * 2;
            const actor = { actorSource: 'sceneActor' };
            const box = b.box('Name', m.boxX + Math.floor((m.boxWidth - width) / 2), m.boxY + m.mainAreaTop, width, height);
            b.partyFace(box.id, 0, PADDING, PADDING, Object.assign({ name: 'Face' }, actor));
            const field = b.add('input', Object.assign({
                name: 'Name field', parent: box.id, x: PADDING + FACE + 16, y: Math.floor((height - LINE - PADDING) / 2),
                width: width - FACE - PADDING * 2 - 16, height: LINE + PADDING, fill: 'none', text: '', align: 'left',
                fontSize: 0, textColor: 0, outline: true, color: '#000000', color2: '#000000', fillOpacity: 160, vertical: true,
                borderWidth: 0, borderColor: '#ffffff', radius: 0, inputTarget: 'actorName', maxLength: 16,
                onScreenKeys: true, autoEdit: true, action: action('close'), enabled: condition('always'), highlightColor: '#ffffff', se: null
            }, actor));
            const record = this.record('name', 'Name Input', b, { firstFocus: field.id });
            record.note = 'Baseline of the stock name input: the field edits the actor Name Input was opened for, with the stock character grid, and closes on OK.';
            return record;
        },

        /**
         * The engine's battle HUD, after the Demo's MOG battle HUD: a 160x170
         * panel per actor in a centred row (the panel art carries the Health,
         * Power and Charge labels), two-row picture meters with a falling
         * damage trail, digit-sheet numbers, the name under it and states one
         * at a time; the command window over the acting actor, wide skill and
         * item windows above the HUD, and cursors for enemies and allies. The
         * art lives in img/system as BattleHud_*; without it the meters and
         * numbers fall back to drawn ones.
         */
        battle(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const b = new Builder();
            const slot = 170, panel = 160, rowHeight = 170;
            const columns = Math.max(1, Math.min(7, Math.floor(m.boxWidth / slot)));
            const hudWidth = columns * slot;
            const hudX = m.boxX + Math.round((m.boxWidth - hudWidth) / 2);
            // 180 above the screen's bottom, as MOG placed it, kept inside the UI area.
            const hudY = Math.min(m.height - 180, m.boxY + m.boxHeight - rowHeight);
            const meter = (key, y) => ({ x: 74, y, width: 65, height: 5, meterImage: 'system/BattleHud_' + key + '_Meter', meterRows: 2 });
            const number = (key, y) => ({ x: 70, y, width: 80, height: 17, numberImage: 'system/BattleHud_' + key + '_Number', align: 'left', valueFormat: 'current' });
            b.list('Party HUD', 0, 'party', hudX, hudY, hudWidth, rowHeight, {
                fill: 'none', rowLayout: 'actorPanel', columns, rowHeight, focusable: false, contextName: 'hudActor',
                actorFields: ['name', 'hp', 'mp', 'tp', 'states'], actorPadding: 0, actorGap: 0, portraitSize: 90,
                actorElements: {
                    custom_1: { kind: 'image', name: 'Panel', file: 'system/BattleHud_Layout', behind: true, x: 0, y: 0, width: panel, height: rowHeight },
                    hp: meter('HP', 49), mp: meter('MP', 84), tp: meter('TP', 119),
                    hpValue: number('HP', 28), mpValue: number('MP', 64), tpValue: number('TP', 99),
                    hpLabel: { visible: false }, mpLabel: { visible: false }, tpLabel: { visible: false },
                    name: { x: 0, y: 132, width: panel, height: 24, fontSize: 18, align: 'center' },
                    states: { x: 10, y: 1, width: 32, height: 32, iconSize: 32, statesMode: 'cycle' }
                }
            });
            b.add('battleWindow', { name: 'Help', x: m.boxX + 10, y: m.boxY + 64, width: m.boxWidth - 15, height: 102, battleWindow: 'help', fill: 'window', slideY: -50 });
            const listY = hudY - 359;
            b.add('battleWindow', { name: 'Skills', x: m.boxX + 10, y: listY, width: m.boxWidth - 15, height: 250, battleWindow: 'skill', windowColumns: 2, slideY: 50 });
            b.add('battleWindow', { name: 'Items', x: m.boxX + 10, y: listY, width: m.boxWidth - 15, height: 250, battleWindow: 'item', windowColumns: 3, slideY: 50 });
            b.add('battleWindow', { name: 'Actor Command', x: -19, y: -383, width: 192, height: 243, battleWindow: 'actorCommand', followActor: true, slideY: 64 });
            b.add('battleWindow', { name: 'Party Command', x: m.boxX + Math.round(m.boxWidth / 2) + 56, y: m.boxY + 134, width: 384, height: 310,
                battleWindow: 'partyCommand', fill: 'none', slideY: -100, file: 'system/BattleHud_Layout_Party', imageX: -450, imageY: -42 });
            b.add('battleWindow', { name: 'Enemy Target', x: m.boxX, y: listY, width: m.boxWidth, height: 180, battleWindow: 'enemy', hideWindow: true });
            b.add('battleWindow', { name: 'Ally Target', x: m.boxX, y: hudY, width: m.boxWidth, height: 180, battleWindow: 'actor', hideWindow: true });
            b.add('battleCursor', { name: 'Target Cursor', x: Math.floor(m.width / 2) - 15, y: Math.floor(m.height / 3), width: 30, height: 19,
                source: 'system', file: 'system/BattleCursor_B', actorFile: 'system/BattleCursor_A', frames: 1, frameSpeed: 8, floatRange: 6,
                showName: true, fontSize: 18, cursorSlide: true });
            const record = this.record('battle', 'Battle', b, { mode: 'battle', background: 'none', cancel: action('none'),
                openTransition: 'slideUp', closeTransition: 'none', transitionDuration: 30, hideStatusWindow: true, firstFocus: 0 });
            record.note = 'Baseline battle HUD after the Demo\'s MOG battle HUD: picture panels, meters and numbers from img/system (BattleHud_*), the command window over the acting actor, and red/blue target cursors. Bind it as Battle in System 2.';
            return record;
        },

        /** One baseline by kind (for Stock Layout on an existing record). */
        buildOne(kind, data) {
            return this.KINDS.includes(kind) ? this[kind](data && typeof data === 'object' ? data : {}) : null;
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
