/**
 * StockInterfaces - baseline interface records for a project's stock scenes
 *
 * A project that never authored an interface opens the User Interfaces
 * section on these: the Title Screen, Main Menu and Game End laid out with
 * the same window math the runtime uses (Scene_Title / Scene_Menu /
 * Scene_GameEnd rects), the project's own terms on the buttons, and each
 * button wired to the action the stock command performs. They are ordinary
 * records: the game keeps its stock scenes until one is called or set as
 * the boot interface, so seeding them changes nothing at play time.
 *
 * List-driven scenes (items, skills, equipment, status, save/load, shop)
 * wait for the List node; the Main Menu's status area uses party codes
 * (\P[n], \PLV[n], \PHP[n]...) and party faces for what a text line can show.
 */
(function(root) {
    'use strict';

    const LINE = 36;
    const PADDING = 12;
    const BUTTON_AREA = 52;
    const COMMAND_WIDTH = 240;
    const FACE = 144;
    const MENU_ROWS = 4;

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
        return Object.assign({ type, id: 1, scene: 'menu', plugin: '', command: '', args: {}, on: true, op: 'set', value: 0, script: '', andClose: false }, extra || {});
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
    }

    const StockInterfaces = {
        KINDS: ['title', 'menu', 'gameEnd'],

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
                nodes: builder.nodes, note: '', stock: kind
            }, extra || {});
        },

        title(data) {
            const system = data.system || {};
            const m = this.metrics(system);
            const offset = system.titleCommandWindow || {};
            const b = new Builder();
            const titleSize = 72;
            b.text(0, String(system.gameTitle || ''), 20, Math.floor(m.height / 4), m.width - 40, {
                name: 'Game title', align: 'center', fontSize: titleSize, height: titleSize
            });
            const height = fittingHeight(3);
            const box = b.box('Commands',
                m.boxX + Math.floor((m.boxWidth - COMMAND_WIDTH) / 2) + (Number(offset.offsetX) || 0),
                m.boxY + m.boxHeight - height - 96 + (Number(offset.offsetY) || 0),
                COMMAND_WIDTH, height);
            const inner = COMMAND_WIDTH - PADDING * 2;
            b.button(box.id, this.term(system, 'newGame'), PADDING, PADDING, inner,
                action('script', { script: 'DataManager.setupNewGame();\nSceneManager.goto(Scene_Map);' }));
            b.button(box.id, this.term(system, 'continue'), PADDING, PADDING + LINE, inner,
                action('scene', { scene: 'load' }),
                { enabled: condition('script', { script: 'DataManager.isAnySavefileExists()' }) });
            b.button(box.id, this.term(system, 'options'), PADDING, PADDING + LINE * 2, inner,
                action('scene', { scene: 'options' }));
            const record = this.record('title', 'Title Screen', b, { background: 'none', cancel: action('none'), firstFocus: 3 });
            record.note = 'Baseline of the stock title screen. Set it as the boot interface to use it; the title graphics stay with the stock scene.';
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
            if (on(0)) entries.push(['item', action('scene', { scene: 'item' })]);
            if (on(1)) entries.push(['skill', action('scene', { scene: 'skill' })]);
            if (on(2)) entries.push(['equip', action('scene', { scene: 'equip' })]);
            if (on(3)) entries.push(['status', action('scene', { scene: 'status' })]);
            if (on(5)) entries.push(['save', action('scene', { scene: 'save' }), condition('script', { script: '$gameSystem.isSaveEnabled()' })]);
            entries.push(['options', action('scene', { scene: 'options' })]);
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
            const rowHeight = Math.floor((m.mainAreaHeight - PADDING * 2) / MENU_ROWS);
            for (let slot = 0; slot < MENU_ROWS; slot++) {
                const n = slot + 1;
                const top = PADDING + rowHeight * slot;
                const visible = slot === 0 ? condition('always') : condition('script', { script: '$gameParty.size() > ' + slot });
                const y = top + Math.floor(rowHeight / 2) - Math.floor(LINE * 1.5);
                b.partyFace(status.id, slot, PADDING + 1, top + 1, { name: 'Face ' + n, visible: condition(visible.type, visible) });
                const x = PADDING + 180;
                b.text(status.id, '\\P[' + n + ']', x, y, 168, { name: 'Name ' + n, visible: condition(visible.type, visible) });
                b.text(status.id, this.basic(system, 1) + ' \\PLV[' + n + ']', x, y + LINE, 168, { name: 'Level ' + n, visible: condition(visible.type, visible) });
                b.text(status.id, '\\PCLASS[' + n + ']', x + 180, y, 168, { name: 'Class ' + n, visible: condition(visible.type, visible) });
                b.text(status.id, this.basic(system, 3) + ' \\PHP[' + n + ']/\\PMHP[' + n + ']', x + 180, y + LINE, 320, { name: 'HP ' + n, visible: condition(visible.type, visible) });
                b.text(status.id, this.basic(system, 5) + ' \\PMP[' + n + ']/\\PMMP[' + n + ']', x + 180, y + LINE + 24, 320, { name: 'MP ' + n, visible: condition(visible.type, visible) });
            }
            const record = this.record('menu', 'Main Menu', b, { firstFocus });
            record.note = 'Baseline of the stock main menu. Formation and gauges wait for the List and Gauge nodes; the stock menu stays in use until this one is called.';
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
            const first = b.button(box.id, this.term(system, 'toTitle'), PADDING, PADDING, inner, action('scene', { scene: 'title' }));
            b.button(box.id, this.term(system, 'cancel'), PADDING, PADDING + LINE, inner, action('close'));
            const record = this.record('gameEnd', 'Game End', b, { firstFocus: first.id });
            record.note = 'Baseline of the stock game end prompt.';
            return record;
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
