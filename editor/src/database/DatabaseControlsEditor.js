/**
 * DatabaseControlsEditor - Database › Controls.
 *
 * Which keys and gamepad buttons do what in the game, starting from RPG
 * Maker's own mapping, and the project's jumping and gravity on 3D maps.
 * Written to System.json: `reactorControls` (only once anything differs from
 * the stock mapping) and `reactorPhysics`. The runtime (reactor_controls.js,
 * reactor_physics.js) applies them; a map may set its own gravity and jump in
 * Map Properties.
 *
 * A key is added by pressing it: "+" listens for the next key or button. A
 * key belongs to one action, except Jump's keys, which jump only on 3D maps
 * and keep their other action everywhere else (Space confirms in menus).
 */
class DatabaseControlsEditor {
    static ACTIONS = [
        ['ok', 'Confirm'], ['escape', 'Cancel / Menu'], ['shift', 'Dash'], ['pageup', 'Previous page'], ['pagedown', 'Next page'],
        ['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['debug', 'Debug (playtest)']
    ];
    static PAD_ACTIONS = [
        ['ok', 'Confirm'], ['cancel', 'Cancel'], ['menu', 'Menu'], ['shift', 'Dash'], ['pageup', 'Previous page'], ['pagedown', 'Next page'],
        ['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right']
    ];
    static DEFAULT_KEYS = {
        9: 'tab', 13: 'ok', 16: 'shift', 17: 'control', 18: 'control', 27: 'escape', 32: 'ok', 33: 'pageup', 34: 'pagedown',
        37: 'left', 38: 'up', 39: 'right', 40: 'down', 45: 'escape', 81: 'pageup', 87: 'pagedown', 88: 'escape', 90: 'ok',
        96: 'escape', 98: 'down', 100: 'left', 102: 'right', 104: 'up', 120: 'debug'
    };
    static DEFAULT_GAMEPAD = { 0: 'ok', 1: 'cancel', 2: 'shift', 3: 'menu', 4: 'pageup', 5: 'pagedown', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
    static DEFAULT_JUMP_KEYS = [32];
    static DEFAULT_JUMP_BUTTONS = [2];
    static BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right'];
    static GRAVITY_PRESETS = [['1', 'Earth'], ['0.38', 'Mars'], ['0.166', 'Moon'], ['0.5', 'Low'], ['2', 'Heavy']];

    constructor(databaseManager, projectController, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this._capture = null;
        this._onCaptureKey = event => this.captureKey(event);
    }

    _t(text, params) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) value = value.split(`{${key}}`).join(String(replacement));
        return value;
    }

    system() { return this.databaseManager.getSystem ? this.databaseManager.getSystem() : this.databaseManager.data.system; }

    /** The controls as the game will have them: the project's, else the stock ones. */
    controls() {
        const own = this.system().reactorControls || {};
        return {
            keys: own.keys && typeof own.keys === 'object' ? Object.assign({}, own.keys) : Object.assign({}, DatabaseControlsEditor.DEFAULT_KEYS),
            gamepad: own.gamepad && typeof own.gamepad === 'object' ? Object.assign({}, own.gamepad) : Object.assign({}, DatabaseControlsEditor.DEFAULT_GAMEPAD),
            jump: own.jump !== false,
            jumpKeys: Array.isArray(own.jumpKeys) ? own.jumpKeys.map(Number) : DatabaseControlsEditor.DEFAULT_JUMP_KEYS.slice(),
            jumpButtons: Array.isArray(own.jumpButtons) ? own.jumpButtons.map(Number) : DatabaseControlsEditor.DEFAULT_JUMP_BUTTONS.slice()
        };
    }

    /** Write the controls back, leaving System.json untouched while they are the stock ones. */
    saveControls(controls) {
        const system = this.system();
        const same = (a, b) => JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map(k => [k, b[k]]));
        const stock = same(controls.keys, DatabaseControlsEditor.DEFAULT_KEYS) && same(controls.gamepad, DatabaseControlsEditor.DEFAULT_GAMEPAD)
            && controls.jump && JSON.stringify(controls.jumpKeys) === JSON.stringify(DatabaseControlsEditor.DEFAULT_JUMP_KEYS)
            && JSON.stringify(controls.jumpButtons) === JSON.stringify(DatabaseControlsEditor.DEFAULT_JUMP_BUTTONS);
        if (stock) delete system.reactorControls;
        else system.reactorControls = { keys: controls.keys, gamepad: controls.gamepad, jump: controls.jump, jumpKeys: controls.jumpKeys, jumpButtons: controls.jumpButtons };
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
        this.parentEditor?._markDatabaseMutation?.();
    }

    physics() {
        return Object.assign({ gravity: 1, jumpHeight: 1.25, fallDamage: false, fallFrom: 6, fallPercent: 10, fallCommonEvent: 0 }, this.system().reactorPhysics || {});
    }

    savePhysics(physics) {
        this.system().reactorPhysics = physics;
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
        this.parentEditor?._markDatabaseMutation?.();
    }

    /** A key's name as the keyboard shows it. */
    static keyName(code) {
        const names = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Ctrl', 18: 'Alt', 27: 'Esc', 32: 'Space', 33: 'Page Up', 34: 'Page Down',
            35: 'End', 36: 'Home', 37: '←', 38: '↑', 39: '→', 40: '↓', 45: 'Insert', 46: 'Delete', 186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`', 219: '[', 220: '\\', 221: ']', 222: "'" };
        const n = Number(code);
        if (names[n]) return names[n];
        if (n >= 48 && n <= 57) return String.fromCharCode(n);
        if (n >= 65 && n <= 90) return String.fromCharCode(n);
        if (n >= 96 && n <= 105) return 'Num ' + (n - 96);
        if (n >= 112 && n <= 123) return 'F' + (n - 111);
        return 'Key ' + n;
    }

    static buttonName(index) { return DatabaseControlsEditor.BUTTON_NAMES[Number(index)] || 'Button ' + index; }

    showControlsDetail(container) {
        this.container = container;
        this.render();
    }

    render() {
        const container = this.container;
        if (!container) return;
        const tt = text => this._t(text);
        const controls = this.controls(), physics = this.physics();
        const chip = (label, data) => `<span class="rr-controls-chip">${rrEscapeHtml(label)}<button type="button" class="rr-controls-remove" ${data} title="${rrEscapeHtml(tt('Remove'))}" aria-label="${rrEscapeHtml(tt('Remove'))}">×</button></span>`;
        const add = data => `<button type="button" class="rr-btn-chip rr-controls-add" ${data} title="${rrEscapeHtml(tt('Press a key or button to add it'))}">+</button>`;
        const listening = (kind, action) => this._capture && this._capture.kind === kind && this._capture.action === action;
        const keyRow = ([action, label]) => {
            const codes = Object.keys(controls.keys).filter(code => controls.keys[code] === action).map(Number).sort((a, b) => a - b);
            return `<tr><td>${rrEscapeHtml(tt(label))}</td><td>${codes.map(code => chip(DatabaseControlsEditor.keyName(code), `data-kind="key" data-code="${code}"`)).join('')}${listening('key', action) ? `<span class="rr-controls-listen">${rrEscapeHtml(tt('Press a key…'))}</span>` : add(`data-kind="key" data-action="${action}"`)}</td></tr>`;
        };
        const padRow = ([action, label]) => {
            const buttons = Object.keys(controls.gamepad).filter(b => controls.gamepad[b] === action).map(Number).sort((a, b) => a - b);
            return `<tr><td>${rrEscapeHtml(tt(label))}</td><td>${buttons.map(b => chip(DatabaseControlsEditor.buttonName(b), `data-kind="pad" data-code="${b}"`)).join('')}${listening('pad', action) ? `<span class="rr-controls-listen">${rrEscapeHtml(tt('Press a gamepad button…'))}</span>` : add(`data-kind="pad" data-action="${action}"`)}</td></tr>`;
        };
        const jumpRow = (kind, list, name) => `<tr class="rr-controls-jump"><td>${rrEscapeHtml(tt('Jump (3D maps)'))}</td><td>${list.map(code => chip(name(code), `data-kind="${kind}-jump" data-code="${code}"`)).join('')}${listening(kind + '-jump', 'jump') ? `<span class="rr-controls-listen">${rrEscapeHtml(tt(kind === 'key' ? 'Press a key…' : 'Press a gamepad button…'))}</span>` : add(`data-kind="${kind}-jump" data-action="jump"`)}</td></tr>`;
        const commonEvents = [[0, tt('(none)')]].concat((this.databaseManager.data.commonEvents || []).filter(Boolean).map(e => [e.id, `${String(e.id).padStart(4, '0')}: ${e.name || ''}`]));
        const presetValue = DatabaseControlsEditor.GRAVITY_PRESETS.some(([v]) => Number(v) === Number(physics.gravity)) ? String(DatabaseControlsEditor.GRAVITY_PRESETS.find(([v]) => Number(v) === Number(physics.gravity))[0]) : 'custom';
        container.innerHTML = `
            <div class="rr-controls">
                <div class="database-section rr-controls-card">
                    <div class="database-section-header">${rrEscapeHtml(tt('Keyboard'))}</div>
                    <div class="database-section-content">
                        <table class="rr-controls-table"><tbody>${DatabaseControlsEditor.ACTIONS.map(keyRow).join('')}${jumpRow('key', controls.jumpKeys, DatabaseControlsEditor.keyName)}</tbody></table>
                        <div class="rr-controls-note">${rrEscapeHtml(tt('Jump keys jump only on 3D maps; everywhere else they keep what they do above (Space confirms in menus).'))}</div>
                    </div>
                </div>
                <div class="database-section rr-controls-card">
                    <div class="database-section-header">${rrEscapeHtml(tt('Gamepad'))}</div>
                    <div class="database-section-content">
                        <table class="rr-controls-table"><tbody>${DatabaseControlsEditor.PAD_ACTIONS.map(padRow).join('')}${jumpRow('pad', controls.jumpButtons, DatabaseControlsEditor.buttonName)}</tbody></table>
                        <button type="button" class="rr-btn-secondary rr-controls-reset">${rrEscapeHtml(tt('Reset keys and buttons to the defaults'))}</button>
                    </div>
                </div>
                <div class="database-section rr-controls-card">
                    <div class="database-section-header">${rrEscapeHtml(tt('Jumping and gravity (3D maps)'))}</div>
                    <div class="database-section-content rr-controls-form">
                        <label class="rr-controls-check"><input type="checkbox" class="rr-controls-jumpon"${controls.jump ? ' checked' : ''}> ${rrEscapeHtml(tt('Players can jump'))}</label>
                        <label>${rrEscapeHtml(tt('Jump height'))}</label><div><input type="number" class="database-field-value rr-controls-num" data-field="jumpHeight" min="0" max="20" step="0.05" value="${physics.jumpHeight}"> <span class="rr-controls-unit">${rrEscapeHtml(tt('tiles'))}</span></div>
                        <label>${rrEscapeHtml(tt('Gravity'))}</label><div class="rr-controls-inline"><select class="database-field-value rr-controls-gravity">${DatabaseControlsEditor.GRAVITY_PRESETS.map(([v, l]) => `<option value="${v}"${presetValue === v ? ' selected' : ''}>${rrEscapeHtml(tt(l))}</option>`).join('')}<option value="custom"${presetValue === 'custom' ? ' selected' : ''}>${rrEscapeHtml(tt('Custom'))}</option></select>
                            <input type="number" class="database-field-value rr-controls-num" data-field="gravity" min="0.01" max="10" step="0.01" value="${physics.gravity}"> <span class="rr-controls-unit">${rrEscapeHtml(tt('× Earth'))}</span></div>
                        <label class="rr-controls-check"><input type="checkbox" class="rr-controls-fall"${physics.fallDamage ? ' checked' : ''}> ${rrEscapeHtml(tt('Long falls hurt'))}</label>
                        <label>${rrEscapeHtml(tt('Safe fall'))}</label><div><input type="number" class="database-field-value rr-controls-num" data-field="fallFrom" min="0" max="200" step="1" value="${physics.fallFrom}"> <span class="rr-controls-unit">${rrEscapeHtml(tt('tiles'))}</span></div>
                        <label>${rrEscapeHtml(tt('Damage per tile beyond'))}</label><div><input type="number" class="database-field-value rr-controls-num" data-field="fallPercent" min="0" max="100" step="1" value="${physics.fallPercent}"> <span class="rr-controls-unit">${rrEscapeHtml(tt('% of max HP'))}</span></div>
                        <label>${rrEscapeHtml(tt('Or run a common event'))}</label><select class="database-field-value rr-controls-event">${commonEvents.map(([id, name]) => `<option value="${id}"${Number(physics.fallCommonEvent) === Number(id) ? ' selected' : ''}>${rrEscapeHtml(name)}</option>`).join('')}</select>
                        <div class="rr-controls-note rr-controls-span">${rrEscapeHtml(tt('Gravity 1 is Earth. A map can set its own in Map Properties › 3D (the Moon, a low-gravity station).'))}</div>
                    </div>
                </div>
            </div>`;
        this.bind();
    }

    bind() {
        const root = this.container;
        root.querySelectorAll('.rr-controls-add').forEach(button => button.addEventListener('click', () => this.startCapture(button.dataset.kind, button.dataset.action)));
        root.querySelectorAll('.rr-controls-remove').forEach(button => button.addEventListener('click', () => this.remove(button.dataset.kind, Number(button.dataset.code))));
        root.querySelector('.rr-controls-reset').addEventListener('click', () => {
            const system = this.system();
            const jump = this.controls().jump;
            delete system.reactorControls;
            if (!jump) system.reactorControls = { jump: false };
            this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
            this.parentEditor?._markDatabaseMutation?.();
            this.render();
        });
        root.querySelector('.rr-controls-jumpon').addEventListener('change', event => { const c = this.controls(); c.jump = event.target.checked; this.saveControls(c); });
        root.querySelector('.rr-controls-fall').addEventListener('change', event => { const p = this.physics(); p.fallDamage = event.target.checked; this.savePhysics(p); });
        root.querySelector('.rr-controls-event').addEventListener('change', event => { const p = this.physics(); p.fallCommonEvent = Math.max(0, Number(event.target.value) || 0); this.savePhysics(p); });
        root.querySelector('.rr-controls-gravity').addEventListener('change', event => {
            if (event.target.value === 'custom') return;
            const p = this.physics(); p.gravity = Number(event.target.value); this.savePhysics(p);
            root.querySelector('.rr-controls-num[data-field="gravity"]').value = p.gravity;
        });
        root.querySelectorAll('.rr-controls-num').forEach(input => input.addEventListener('change', () => {
            const p = this.physics();
            const n = Number(input.value);
            if (!Number.isFinite(n)) return;
            p[input.dataset.field] = Math.max(Number(input.min), Math.min(Number(input.max), n));
            this.savePhysics(p);
            if (input.dataset.field === 'gravity') this.render();
        }));
    }

    remove(kind, code) {
        const c = this.controls();
        if (kind === 'key') delete c.keys[code];
        else if (kind === 'pad') delete c.gamepad[code];
        else if (kind === 'key-jump') c.jumpKeys = c.jumpKeys.filter(k => k !== code);
        else if (kind === 'pad-jump') c.jumpButtons = c.jumpButtons.filter(k => k !== code);
        this.saveControls(c);
        this.render();
    }

    /** Listen for the next key (or gamepad button) and give it to an action. */
    startCapture(kind, action) {
        this.stopCapture();
        this._capture = { kind, action };
        this.render();
        if (kind.startsWith('key')) document.addEventListener('keydown', this._onCaptureKey, true);
        else this._padTimer = setInterval(() => this.pollPad(), 50);
    }

    stopCapture() {
        document.removeEventListener('keydown', this._onCaptureKey, true);
        clearInterval(this._padTimer);
        this._padTimer = null;
        this._capture = null;
    }

    captureKey(event) {
        if (!this._capture) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        // keyCode is what Input.keyMapper is keyed by; `code` stands in when a keyboard layer leaves it 0.
        const byCode = { Space: 32, Enter: 13, Escape: 27, Tab: 9, ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17, AltLeft: 18, AltRight: 18,
            ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, PageUp: 33, PageDown: 34, Insert: 45, Delete: 46, Home: 36, End: 35, Backspace: 8 };
        let code = event.keyCode || byCode[event.code] || 0;
        if (!code && /^Key[A-Z]$/.test(event.code || '')) code = event.code.charCodeAt(3);
        if (!code && /^Digit[0-9]$/.test(event.code || '')) code = 48 + Number(event.code.slice(5));
        if (!code) return;
        this.assign(this._capture.kind, this._capture.action, code);
    }

    pollPad() {
        if (!this._capture || !navigator.getGamepads) return;
        for (const pad of navigator.getGamepads()) {
            if (!pad) continue;
            const index = pad.buttons.findIndex(b => b && b.pressed);
            if (index >= 0) { this.assign(this._capture.kind, this._capture.action, index); return; }
        }
    }

    /** A key or button goes to one action (it leaves any other); a jump key keeps its other action. */
    assign(kind, action, code) {
        const c = this.controls();
        if (kind === 'key') c.keys[code] = action;
        else if (kind === 'pad') c.gamepad[code] = action;
        else if (kind === 'key-jump' && !c.jumpKeys.includes(code)) c.jumpKeys.push(code);
        else if (kind === 'pad-jump' && !c.jumpButtons.includes(code)) c.jumpButtons.push(code);
        this.stopCapture();
        this.saveControls(c);
        this.render();
    }

    detach() { this.stopCapture(); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseControlsEditor;
