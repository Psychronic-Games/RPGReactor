/**
 * Database > User Interfaces: a record is a tree of Box / Image / Text /
 * Button nodes laid out on a canvas at the game's UI size, each button
 * wired to an action. The runtime half is runtime/reactor_ui.js; this file
 * keeps the same node shape and the same anchored layout so what the canvas
 * shows is where the game draws.
 */
class DatabaseUserInterfaceEditor {
    static get NODE_TYPES() { return ['box', 'image', 'text', 'button']; }
    /** Fit text to size never shrinks below this; the runtime pins the same floor. */
    static get MIN_FONT_SIZE() { return 8; }
    static get ANCHORS() {
        return {
            topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0],
            left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
            bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1]
        };
    }
    static get ACTION_TYPES() {
        return ['none', 'close', 'closeAll', 'callInterface', 'commonEvent', 'scene', 'pluginCommand', 'switch', 'variable', 'script'];
    }
    static get SCENES() { return ['menu', 'item', 'skill', 'equip', 'status', 'save', 'load', 'options', 'gameEnd', 'title']; }
    static get CONDITION_TYPES() { return ['always', 'never', 'switch', 'variable', 'script']; }
    static get GRID() { return 8; }

    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.current = null;
        this.selectedId = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.snap = true;
        this.showGrid = true;
        this.scale = 1;
        this.images = new Map();
        this.skin = null;
        this.drag = null;
        this._raf = 0;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    escapeHTML(value) {
        return typeof rrEscapeHtml === 'function' ? rrEscapeHtml(value) : String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    project() {
        return this.projectManager && this.projectManager.getCurrentProject ? this.projectManager.getCurrentProject() : null;
    }

    // ==========================================
    // DEFAULTS AND NORMALIZATION (mirrors runtime/reactor_ui.js)
    // ==========================================

    static defaultNode(type, id) {
        const base = {
            id, type, name: '', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 200, height: 100,
            opacity: 255, visible: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' }
        };
        switch (type) {
            case 'box':
                return Object.assign(base, { fill: 'window', color: '#000000', color2: '#000000', fillOpacity: 160, vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0 });
            case 'image':
                return Object.assign(base, { width: 96, height: 96, fill: 'none', source: 'picture', file: '', index: 0, fit: 'none' });
            case 'text':
                return Object.assign(base, { width: 0, height: 0, fill: 'none', text: 'Text', align: 'left', fontSize: 0, textColor: 0, outline: true, wrap: false, fitText: false });
            case 'button':
                return Object.assign(base, {
                    width: 200, height: 48, fill: 'window', color: '#000000', color2: '#000000', fillOpacity: 160, vertical: true,
                    borderWidth: 0, borderColor: '#ffffff', radius: 0,
                    text: 'Button', align: 'center', fontSize: 0, textColor: 0, outline: true, fitText: false,
                    action: DatabaseUserInterfaceEditor.defaultAction('close'),
                    enabled: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' },
                    highlightColor: '#ffffff', se: null
                });
            default:
                return base;
        }
    }

    static defaultAction(type = 'none') {
        return { type, id: 1, scene: 'menu', plugin: '', command: '', args: {}, on: true, op: 'set', value: 0, script: '', andClose: false };
    }

    /** Fills in whatever an older or hand-edited record is missing, in place. */
    normalizeInterface(entry) {
        if (!entry || typeof entry !== 'object') return entry;
        if (typeof entry.name !== 'string') entry.name = '';
        if (entry.mode !== 'scene' && entry.mode !== 'overlay') entry.mode = 'scene';
        if (!['blur', 'dim', 'none'].includes(entry.background)) entry.background = 'blur';
        entry.cancel = Object.assign(DatabaseUserInterfaceEditor.defaultAction('close'), entry.cancel && typeof entry.cancel === 'object' ? entry.cancel : {});
        if (!Number.isInteger(entry.firstFocus)) entry.firstFocus = 0;
        if (!Array.isArray(entry.nodes)) entry.nodes = [];
        if (typeof entry.note !== 'string') entry.note = '';
        const seen = new Set();
        entry.nodes = entry.nodes.filter(node => node && typeof node === 'object').map(node => {
            const type = DatabaseUserInterfaceEditor.NODE_TYPES.includes(node.type) ? node.type : 'box';
            let id = Number.isInteger(node.id) && node.id > 0 ? node.id : 0;
            if (!id || seen.has(id)) id = this.nextNodeId(entry, seen);
            seen.add(id);
            const merged = Object.assign(DatabaseUserInterfaceEditor.defaultNode(type, id), node, { id, type });
            merged.visible = Object.assign({ type: 'always', id: 1, on: true, op: '==', value: 0, script: '' }, merged.visible || {});
            if (type === 'button') {
                merged.action = Object.assign(DatabaseUserInterfaceEditor.defaultAction('close'), merged.action || {});
                merged.enabled = Object.assign({ type: 'always', id: 1, on: true, op: '==', value: 0, script: '' }, merged.enabled || {});
            }
            return merged;
        });
        entry.nodes = DatabaseUserInterfaceEditor.orderNodes(entry.nodes);
        return entry;
    }

    nextNodeId(entry, extra) {
        let id = 1;
        const used = new Set((entry.nodes || []).map(node => node && node.id));
        if (extra) for (const value of extra) used.add(value);
        while (used.has(id)) id++;
        return id;
    }

    // ==========================================
    // MAIN ENTRY
    // ==========================================

    showUserInterfaceDetail(container, entry) {
        const tt = text => this._t(text);
        this.current = this.normalizeInterface(entry);
        this.selectedId = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.drag = null;
        this.container = container;
        this.skin = null;
        this.images.clear();

        const wrapper = document.createElement('div');
        wrapper.className = 'rr-ui-editor';
        wrapper.innerHTML = `
            <div class="database-section rr-ui-general">
                <div class="database-section-header">${tt('General Settings')}</div>
                <div class="database-section-content">
                    <div class="db-form">
                        <div class="db-row-cols">
                            <div class="db-col">
                                <label>${tt('Name')}</label>
                                <input type="text" class="database-field-value" data-field="name" value="${this.escapeHTML(entry.name)}">
                            </div>
                            <div class="db-col">
                                <label>${tt('Background')}</label>
                                <select class="database-field-value rr-ui-background">
                                    <option value="blur">${tt('Blurred map')}</option>
                                    <option value="dim">${tt('Dimmed map')}</option>
                                    <option value="none">${tt('Map as is')}</option>
                                </select>
                            </div>
                            <div class="db-col">
                                <label>${tt('First Focus')}</label>
                                <select class="database-field-value rr-ui-first-focus"></select>
                            </div>
                            <div class="db-col">
                                <label>${tt('Cancel Key')}</label>
                                <div class="rr-ui-cancel-action"></div>
                            </div>
                            <div class="db-col rr-ui-general-buttons">
                                <label>&nbsp;</label>
                                <button type="button" class="rr-button-primary rr-ui-playtest">${tt('Playtest Interface')}</button>
                            </div>
                            <div class="db-col">
                                <label>${tt('Capture from Game')}</label>
                                <div class="rr-ui-capture-row">
                                    <select class="database-field-value rr-ui-capture-scene">${this.captureSceneOptions()}</select>
                                    <button type="button" class="rr-btn-chip rr-ui-capture">${tt('Capture')}</button>
                                </div>
                                <div class="rr-ui-capture-status"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="rr-ui-workspace">
                <div class="database-section rr-ui-tree-panel">
                    <div class="database-section-header">${tt('Nodes')}</div>
                    <div class="database-section-content">
                        <div class="rr-ui-add-buttons">
                            <button type="button" class="rr-btn-chip" data-add="box">${tt('Box')}</button>
                            <button type="button" class="rr-btn-chip" data-add="image">${tt('Image')}</button>
                            <button type="button" class="rr-btn-chip" data-add="text">${tt('Text')}</button>
                            <button type="button" class="rr-btn-chip" data-add="button">${tt('Button')}</button>
                        </div>
                        <div class="rr-ui-tree"></div>
                        <div class="rr-ui-capture-list"></div>
                        <div class="rr-ui-tree-buttons">
                            <button type="button" class="rr-btn-chip rr-ui-node-up" title="${tt('Send backward')}">&#9650;</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-down" title="${tt('Bring forward')}">&#9660;</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-duplicate">${tt('Duplicate')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-delete">${tt('Delete')}</button>
                        </div>
                    </div>
                </div>
                <div class="database-section rr-ui-canvas-panel">
                    <div class="database-section-header rr-ui-canvas-header">
                        <span>${tt('Layout')}</span>
                        <span class="rr-ui-canvas-tools">
                            <label><input type="checkbox" class="rr-ui-snap" checked> ${tt('Snap')}</label>
                            <label><input type="checkbox" class="rr-ui-grid" checked> ${tt('Grid')}</label>
                            <label class="rr-ui-reference-tools"><input type="checkbox" class="rr-ui-reference" checked> ${tt('Reference')}
                                <input type="range" class="rr-ui-reference-opacity" min="10" max="100" value="60" title="${tt('Reference opacity')}"></label>
                            <button type="button" class="rr-btn-chip rr-ui-undo" title="Ctrl+Z">${tt('Undo')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-redo" title="Ctrl+Y">${tt('Redo')}</button>
                            <span class="rr-ui-size"></span>
                        </span>
                    </div>
                    <div class="database-section-content rr-ui-canvas-host">
                        <canvas class="rr-ui-canvas" tabindex="0"></canvas>
                    </div>
                </div>
                <div class="database-section rr-ui-props-panel">
                    <div class="database-section-header">${tt('Properties')}</div>
                    <div class="database-section-content rr-ui-props"></div>
                </div>
            </div>
            <div class="database-section">
                <div class="database-section-header">${tt('Note')}</div>
                <div class="database-section-content">
                    <textarea class="database-field-value" rows="3" style="width: 100%;" data-field="note">${this.escapeHTML(entry.note)}</textarea>
                </div>
            </div>`;
        container.appendChild(wrapper);
        this.wrapper = wrapper;
        this.canvas = wrapper.querySelector('.rr-ui-canvas');
        this.ctx = this.canvas.getContext('2d');

        wrapper.querySelector('.rr-ui-background').value = entry.background;
        this.reference = null;
        this.showReference = true;
        this.referenceOpacity = 0.6;
        this.capturedSelection = -1;
        this.loadLastCapture();
        this.renderCancelAction();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        this.attachListeners();
        this.loadSkin();
        this.loadGameFont();
        this.fitCanvas();
        this.scheduleRender();
    }

    screenSize() {
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        const advanced = system && system.advanced ? system.advanced : {};
        return {
            width: Number(advanced.uiAreaWidth) || Number(advanced.screenWidth) || 816,
            height: Number(advanced.uiAreaHeight) || Number(advanced.screenHeight) || 624
        };
    }

    touch() {
        if (this.databaseManager) this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    // ==========================================
    // UNDO
    // ==========================================

    snapshot() {
        return JSON.stringify({ nodes: this.current.nodes, firstFocus: this.current.firstFocus });
    }

    pushUndo() {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.redoStack = [];
    }

    restore(serialized) {
        const parsed = JSON.parse(serialized);
        this.current.nodes = parsed.nodes;
        this.current.firstFocus = parsed.firstFocus;
        if (!this.node(this.selectedId)) this.selectedId = 0;
        this.touch();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(this.snapshot());
        this.restore(this.undoStack.pop());
    }

    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(this.snapshot());
        this.restore(this.redoStack.pop());
    }

    // ==========================================
    // NODES
    // ==========================================

    node(id) {
        return this.current.nodes.find(node => node.id === id) || null;
    }

    selected() {
        return this.node(this.selectedId);
    }

    select(id) {
        this.selectedId = id;
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    addNode(type) {
        this.pushUndo();
        const node = DatabaseUserInterfaceEditor.defaultNode(type, this.nextNodeId(this.current));
        const screen = this.screenSize();
        const selected = this.selected();
        if (selected && (selected.type === 'box' || selected.type === 'image')) {
            node.parent = selected.id;
            node.x = 16;
            node.y = 16;
        } else {
            node.x = Math.round((screen.width - node.width) / 2 / 8) * 8;
            node.y = Math.round((screen.height - node.height) / 2 / 8) * 8;
        }
        this.current.nodes.push(node);
        this.touch();
        this.refreshFirstFocus();
        this.select(node.id);
    }

    deleteNode(id) {
        const node = this.node(id);
        if (!node) return;
        this.pushUndo();
        const doomed = new Set([id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const candidate of this.current.nodes) {
                if (!doomed.has(candidate.id) && doomed.has(candidate.parent)) {
                    doomed.add(candidate.id);
                    grew = true;
                }
            }
        }
        this.current.nodes = this.current.nodes.filter(candidate => !doomed.has(candidate.id));
        if (doomed.has(this.current.firstFocus)) this.current.firstFocus = 0;
        this.selectedId = 0;
        this.touch();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    duplicateNode(id) {
        const node = this.node(id);
        if (!node) return;
        this.pushUndo();
        const copy = JSON.parse(JSON.stringify(node));
        copy.id = this.nextNodeId(this.current);
        copy.x += 16;
        copy.y += 16;
        const index = this.current.nodes.indexOf(node);
        this.current.nodes.splice(index + 1, 0, copy);
        this.touch();
        this.refreshFirstFocus();
        this.select(copy.id);
    }

    /** Nodes in draw order: parents before children, siblings as authored. */
    static orderNodes(nodes) {
        const ids = new Set(nodes.map(node => node.id));
        const byParent = new Map();
        for (const node of nodes) {
            const parent = ids.has(node.parent) && node.parent !== node.id ? node.parent : 0;
            if (!byParent.has(parent)) byParent.set(parent, []);
            byParent.get(parent).push(node);
        }
        const ordered = [];
        const visit = (parent, trail) => {
            for (const node of byParent.get(parent) || []) {
                if (trail.has(node.id)) continue;
                ordered.push(node);
                trail.add(node.id);
                visit(node.id, trail);
            }
        };
        visit(0, new Set());
        for (const node of nodes) if (!ordered.includes(node)) ordered.push(node);
        return ordered;
    }

    /** Moves a node past its neighbouring sibling, carrying its subtree. */
    moveNode(id, delta) {
        const node = this.node(id);
        if (!node) return;
        const siblings = this.current.nodes.filter(candidate => candidate.parent === node.parent || (!this.node(candidate.parent) && !this.node(node.parent)));
        const index = siblings.indexOf(node);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= siblings.length) return;
        this.pushUndo();
        const other = siblings[target];
        const a = this.current.nodes.indexOf(node);
        const b = this.current.nodes.indexOf(other);
        this.current.nodes[a] = other;
        this.current.nodes[b] = node;
        this.current.nodes = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes);
        this.touch();
        this.renderTree();
        this.scheduleRender();
    }

    /** Whether making `parentId` the parent of `id` would form a cycle. */
    wouldCycle(id, parentId) {
        let current = parentId;
        let guard = 0;
        while (current && guard++ < 1000) {
            if (current === id) return true;
            const parent = this.node(current);
            current = parent ? parent.parent : 0;
        }
        return false;
    }

    depth(node) {
        let depth = 0;
        let current = this.node(node.parent);
        while (current && depth < 64) {
            depth++;
            current = this.node(current.parent);
        }
        return depth;
    }

    // ==========================================
    // LAYOUT (same math as the runtime)
    // ==========================================

    rects() {
        const screen = this.screenSize();
        const root = { x: 0, y: 0, width: screen.width, height: screen.height };
        const rects = new Map();
        const resolve = (node, trail) => {
            if (rects.has(node.id)) return rects.get(node.id);
            let parentRect = root;
            const parent = this.node(node.parent);
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                parentRect = resolve(parent, trail);
            }
            const measured = node.type === 'text' ? this.measureText(node) : null;
            const width = node.width > 0 ? node.width : (measured ? measured.width : 0);
            const height = node.height > 0 ? node.height : (measured ? measured.height : 0);
            const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor] || [0, 0];
            const rect = {
                x: Math.round(parentRect.x + parentRect.width * ax - width * ax + node.x),
                y: Math.round(parentRect.y + parentRect.height * ay - height * ay + node.y),
                width, height
            };
            rects.set(node.id, rect);
            return rect;
        };
        for (const node of this.current.nodes) resolve(node, new Set());
        return rects;
    }

    // ==========================================
    // TREE
    // ==========================================

    typeLabel(type) {
        return this._t({ box: 'Box', image: 'Image', text: 'Text', button: 'Button' }[type] || type);
    }

    nodeLabel(node) {
        if (node.name) return node.name;
        if ((node.type === 'text' || node.type === 'button') && node.text) return node.text.split('\n')[0].slice(0, 24);
        if (node.type === 'image' && node.file) return node.file;
        return this.typeLabel(node.type) + ' ' + node.id;
    }

    renderTree() {
        const tree = this.wrapper.querySelector('.rr-ui-tree');
        if (!tree) return;
        tree.innerHTML = '';
        if (!this.current.nodes.length) {
            const empty = document.createElement('div');
            empty.className = 'rr-ui-tree-empty';
            empty.textContent = this._t('Add a box, image, text, or button to start.');
            tree.appendChild(empty);
        }
        for (const node of this.current.nodes) {
            const row = document.createElement('div');
            row.className = 'rr-ui-tree-row' + (node.id === this.selectedId ? ' selected' : '');
            row.style.paddingLeft = (8 + this.depth(node) * 14) + 'px';
            row.dataset.id = String(node.id);
            const type = document.createElement('span');
            type.className = 'rr-ui-tree-type rr-ui-type-' + node.type;
            type.textContent = this.typeLabel(node.type);
            const label = document.createElement('span');
            label.className = 'rr-ui-tree-label';
            label.textContent = this.nodeLabel(node);
            row.appendChild(type);
            row.appendChild(label);
            if (node.visible && node.visible.type !== 'always') {
                const flag = document.createElement('span');
                flag.className = 'rr-ui-tree-flag';
                flag.textContent = '◐';
                flag.title = this._t('Conditional visibility');
                row.appendChild(flag);
            }
            tree.appendChild(row);
        }
    }

    refreshFirstFocus() {
        const select = this.wrapper.querySelector('.rr-ui-first-focus');
        if (!select) return;
        select.innerHTML = '';
        const auto = document.createElement('option');
        auto.value = '0';
        auto.textContent = this._t('First button');
        select.appendChild(auto);
        for (const node of this.current.nodes) {
            if (node.type !== 'button') continue;
            const option = document.createElement('option');
            option.value = String(node.id);
            option.textContent = this.nodeLabel(node);
            select.appendChild(option);
        }
        select.value = String(this.current.firstFocus || 0);
        if (select.value !== String(this.current.firstFocus || 0)) {
            this.current.firstFocus = 0;
            select.value = '0';
        }
    }

    // ==========================================
    // PROPERTIES
    // ==========================================

    /** One label + one field on the panel grid; the hint sits under the field. */
    row(label, control, hint = '') {
        return `<label class="rr-ui-l">${label}</label><div class="rr-ui-f">${control}${hint ? `<div class="rr-ui-hint">${hint}</div>` : ''}</div>`;
    }

    /** Two label + field pairs sharing one row; both fields align with single rows. */
    pair(label1, control1, label2, control2, wrapClass = '') {
        const second = `<label class="rr-ui-l2">${label2}</label><div class="rr-ui-f2">${control2}</div>`;
        return `<label class="rr-ui-l">${label1}</label><div class="rr-ui-f1">${control1}</div>`
            + (wrapClass ? `<div class="rr-ui-sub ${wrapClass}">${second}</div>` : second);
    }

    group(title) {
        return `<div class="rr-ui-group">${title}</div>`;
    }

    hintRow(text) {
        return `<div class="rr-ui-hint-row">${text}</div>`;
    }

    selectControl(cls, value, options) {
        return `<select class="database-field-value ${cls}">${options.map(([v, text]) =>
            `<option value="${this.escapeHTML(v)}"${String(v) === String(value) ? ' selected' : ''}>${this.escapeHTML(text)}</option>`).join('')}</select>`;
    }

    numberControl(cls, value, min, max, step = 1) {
        return `<input type="number" class="database-field-value ${cls}" value="${Number(value) || 0}" min="${min}" max="${max}" step="${step}">`;
    }

    textControl(cls, value, placeholder = '') {
        return `<input type="text" class="database-field-value ${cls}" value="${this.escapeHTML(value)}" placeholder="${this.escapeHTML(placeholder)}">`;
    }

    colorControl(cls, value) {
        return `<input type="color" class="rr-ui-color ${cls}" value="${/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}">`;
    }

    checkControl(cls, value, label) {
        return `<label class="rr-ui-check"><input type="checkbox" class="${cls}"${value ? ' checked' : ''}> ${label}</label>`;
    }

    anchorOptions() {
        const tt = text => this._t(text);
        return [
            ['topLeft', tt('Top Left')], ['top', tt('Top')], ['topRight', tt('Top Right')],
            ['left', tt('Left')], ['center', tt('Center')], ['right', tt('Right')],
            ['bottomLeft', tt('Bottom Left')], ['bottom', tt('Bottom')], ['bottomRight', tt('Bottom Right')]
        ];
    }

    parentOptions(node) {
        const options = [['0', this._t('Screen')]];
        for (const candidate of this.current.nodes) {
            if (candidate === node || (candidate.type !== 'box' && candidate.type !== 'image') || this.wouldCycle(node.id, candidate.id)) continue;
            options.push([String(candidate.id), this.nodeLabel(candidate)]);
        }
        return options;
    }

    conditionMarkup(prefix, condition) {
        const tt = text => this._t(text);
        const types = [['always', tt('Always')], ['never', tt('Never')], ['switch', tt('Switch')], ['variable', tt('Variable')], ['script', tt('Script')]];
        const ops = ['==', '!=', '>', '>=', '<', '<='].map(op => [op, op]);
        return `<div class="rr-ui-condition" data-prefix="${prefix}">
            ${this.selectControl(prefix + '-type', condition.type, types)}
            <div class="rr-ui-condition-switch"${condition.type === 'switch' ? '' : ' hidden'}>
                ${this.numberControl(prefix + '-id', condition.id, 1, 9999)}
                ${this.selectControl(prefix + '-on', condition.on ? '1' : '0', [['1', tt('ON')], ['0', tt('OFF')]])}
            </div>
            <div class="rr-ui-condition-variable"${condition.type === 'variable' ? '' : ' hidden'}>
                ${this.numberControl(prefix + '-vid', condition.id, 1, 9999)}
                ${this.selectControl(prefix + '-op', condition.op, ops)}
                ${this.numberControl(prefix + '-value', condition.value, -999999999, 999999999)}
            </div>
            <div class="rr-ui-condition-script"${condition.type === 'script' ? '' : ' hidden'}>
                <textarea class="database-field-value ${prefix}-script" rows="2" placeholder="return $gameParty.gold() > 0;">${this.escapeHTML(condition.script)}</textarea>
            </div>
        </div>`;
    }

    readCondition(root, prefix, target) {
        const q = cls => root.querySelector('.' + prefix + '-' + cls);
        target.type = q('type').value;
        if (target.type === 'switch') {
            target.id = Math.max(1, Math.floor(Number(q('id').value) || 1));
            target.on = q('on').value === '1';
        } else if (target.type === 'variable') {
            target.id = Math.max(1, Math.floor(Number(q('vid').value) || 1));
            target.op = q('op').value;
            target.value = Number(q('value').value) || 0;
        } else if (target.type === 'script') {
            target.script = q('script').value;
        }
        const block = root.querySelector(`.rr-ui-condition[data-prefix="${prefix}"]`);
        if (block) {
            block.querySelector('.rr-ui-condition-switch').hidden = target.type !== 'switch';
            block.querySelector('.rr-ui-condition-variable').hidden = target.type !== 'variable';
            block.querySelector('.rr-ui-condition-script').hidden = target.type !== 'script';
        }
    }

    actionMarkup(prefix, action) {
        const tt = text => this._t(text);
        const types = [
            ['none', tt('Nothing')], ['close', tt('Close this interface')], ['closeAll', tt('Close all interfaces')],
            ['callInterface', tt('Call another interface')], ['commonEvent', tt('Run common event')],
            ['scene', tt('Open scene')], ['pluginCommand', tt('Plugin command')],
            ['switch', tt('Set switch')], ['variable', tt('Change variable')], ['script', tt('Run script')]
        ];
        const interfaces = [];
        for (const entry of this.databaseManager.getUserInterfaces() || []) {
            if (entry && entry.id) interfaces.push([String(entry.id), String(entry.id).padStart(4, '0') + (entry.name ? ': ' + entry.name : '')]);
        }
        const commonEvents = [];
        for (const entry of (this.databaseManager.getCommonEvents ? this.databaseManager.getCommonEvents() : []) || []) {
            if (entry && entry.id) commonEvents.push([String(entry.id), String(entry.id).padStart(4, '0') + (entry.name ? ': ' + entry.name : '')]);
        }
        const scenes = [
            ['menu', tt('Main Menu')], ['item', tt('Items')], ['skill', tt('Skills')], ['equip', tt('Equipment')],
            ['status', tt('Status')], ['save', tt('Save')], ['load', tt('Load')], ['options', tt('Options')],
            ['gameEnd', tt('Game End')], ['title', tt('Title Screen')]
        ];
        const args = Object.keys(action.args || {}).map(key => key + '=' + action.args[key]).join('\n');
        const show = type => action.type === type ? '' : ' hidden';
        return `<div class="rr-ui-action" data-prefix="${prefix}">
            ${this.selectControl(prefix + '-type', action.type, types)}
            <div class="rr-ui-action-callInterface"${show('callInterface')}>
                ${interfaces.length ? this.selectControl(prefix + '-interface', action.id, interfaces) : `<div class="rr-ui-hint">${tt('No other interfaces yet')}</div>`}
            </div>
            <div class="rr-ui-action-commonEvent"${show('commonEvent')}>
                ${commonEvents.length ? this.selectControl(prefix + '-commonEvent', action.id, commonEvents) : `<div class="rr-ui-hint">${tt('No common events yet')}</div>`}
            </div>
            <div class="rr-ui-action-scene"${show('scene')}>
                ${this.selectControl(prefix + '-scene', action.scene, scenes)}
            </div>
            <div class="rr-ui-action-pluginCommand"${show('pluginCommand')}>
                ${this.textControl(prefix + '-plugin', action.plugin, tt('Plugin name'))}
                ${this.textControl(prefix + '-command', action.command, tt('Command name'))}
                <textarea class="database-field-value ${prefix}-args" rows="2" placeholder="${tt('One argument per line: name=value')}">${this.escapeHTML(args)}</textarea>
            </div>
            <div class="rr-ui-action-switch"${show('switch')}>
                ${this.numberControl(prefix + '-switchId', action.id, 1, 9999)}
                ${this.selectControl(prefix + '-on', action.on ? '1' : '0', [['1', tt('ON')], ['0', tt('OFF')]])}
            </div>
            <div class="rr-ui-action-variable"${show('variable')}>
                ${this.numberControl(prefix + '-variableId', action.id, 1, 9999)}
                ${this.selectControl(prefix + '-op', action.op, [['set', tt('Set')], ['add', tt('Add')], ['sub', tt('Subtract')]])}
                ${this.numberControl(prefix + '-value', action.value, -999999999, 999999999)}
            </div>
            <div class="rr-ui-action-script"${show('script')}>
                <textarea class="database-field-value ${prefix}-script" rows="2">${this.escapeHTML(action.script)}</textarea>
            </div>
            <div class="rr-ui-action-andClose"${['pluginCommand', 'switch', 'variable', 'script'].includes(action.type) ? '' : ' hidden'}>
                ${this.checkControl(prefix + '-andClose', action.andClose, tt('Then close this interface'))}
            </div>
        </div>`;
    }

    readAction(root, prefix, target) {
        const q = cls => root.querySelector('.' + prefix + '-' + cls);
        target.type = q('type').value;
        switch (target.type) {
            case 'callInterface': if (q('interface')) target.id = Number(q('interface').value) || 0; break;
            case 'commonEvent': if (q('commonEvent')) target.id = Number(q('commonEvent').value) || 0; break;
            case 'scene': target.scene = q('scene').value; break;
            case 'pluginCommand': {
                target.plugin = q('plugin').value.trim();
                target.command = q('command').value.trim();
                const args = {};
                for (const line of q('args').value.split('\n')) {
                    const eq = line.indexOf('=');
                    if (eq > 0) args[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
                }
                target.args = args;
                break;
            }
            case 'switch':
                target.id = Math.max(1, Math.floor(Number(q('switchId').value) || 1));
                target.on = q('on').value === '1';
                break;
            case 'variable':
                target.id = Math.max(1, Math.floor(Number(q('variableId').value) || 1));
                target.op = q('op').value;
                target.value = Number(q('value').value) || 0;
                break;
            case 'script': target.script = q('script').value; break;
            default: break;
        }
        if (q('andClose')) target.andClose = q('andClose').checked;
        const block = root.querySelector(`.rr-ui-action[data-prefix="${prefix}"]`);
        if (block) {
            for (const type of DatabaseUserInterfaceEditor.ACTION_TYPES) {
                const section = block.querySelector('.rr-ui-action-' + type);
                if (section) section.hidden = target.type !== type;
            }
            block.querySelector('.rr-ui-action-andClose').hidden = !['pluginCommand', 'switch', 'variable', 'script'].includes(target.type);
        }
    }

    renderCancelAction() {
        const host = this.wrapper.querySelector('.rr-ui-cancel-action');
        host.innerHTML = this.actionMarkup('cancel', this.current.cancel);
    }

    renderProperties() {
        const tt = text => this._t(text);
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!panel) return;
        const node = this.selected();
        if (!node) {
            panel.innerHTML = `<div class="rr-ui-hint-row rr-ui-empty">${tt('Select a node on the canvas or in the list.')}</div>`;
            return;
        }
        const fills = [['window', tt('Window skin')], ['color', tt('Solid color')], ['gradient', tt('Gradient')], ['none', tt('None')]];
        const isSurface = node.type === 'box' || node.type === 'button';
        const isLabel = node.type === 'text' || node.type === 'button';
        const colorFill = node.fill === 'color' || node.fill === 'gradient';
        let html = '';
        html += `<div class="rr-ui-prop-title rr-ui-type-${node.type}">${this.typeLabel(node.type)} #${node.id}</div>`;
        html += this.row(tt('Name'), this.textControl('p-name', node.name));
        html += this.row(tt('Parent'), this.selectControl('p-parent', node.parent, this.parentOptions(node)));
        html += this.row(tt('Anchor'), this.selectControl('p-anchor', node.anchor, this.anchorOptions()));
        html += this.pair('X', this.numberControl('p-x', node.x, -9999, 9999), 'Y', this.numberControl('p-y', node.y, -9999, 9999));
        html += this.pair(tt('Width'), this.numberControl('p-width', node.width, 0, 9999), tt('Height'), this.numberControl('p-height', node.height, 0, 9999));
        if (node.type === 'text') html += this.hintRow(tt('Width or height 0 fits the text.'));
        html += this.row(tt('Opacity'), this.numberControl('p-opacity', node.opacity, 0, 255));
        html += this.row(tt('Visible'), this.conditionMarkup('p-visible', node.visible));

        if (isSurface) {
            html += this.group(tt('Surface'));
            html += this.row(tt('Fill'), this.selectControl('p-fill', node.fill, fills));
            html += `<div class="rr-ui-sub rr-ui-fill-color"${colorFill ? '' : ' hidden'}>`;
            html += this.pair(tt('Color'), this.colorControl('p-color', node.color), tt('Color 2'), this.colorControl('p-color2', node.color2), 'rr-ui-gradient-end' + (node.fill === 'gradient' ? '' : ' rr-ui-hidden'));
            html += this.row(tt('Fill Opacity'), this.numberControl('p-fillOpacity', node.fillOpacity, 0, 255));
            html += `<div class="rr-ui-sub rr-ui-gradient-end"${node.fill === 'gradient' ? '' : ' hidden'}>`;
            html += this.row(tt('Direction'), this.selectControl('p-vertical', node.vertical ? '1' : '0', [['1', tt('Vertical')], ['0', tt('Horizontal')]]));
            html += `</div></div>`;
            html += this.pair(tt('Border'), this.numberControl('p-borderWidth', node.borderWidth, 0, 32), tt('Color'), this.colorControl('p-borderColor', node.borderColor));
            html += this.row(tt('Radius'), this.numberControl('p-radius', node.radius, 0, 200));
        }
        if (isLabel) {
            html += this.group(node.type === 'button' ? tt('Label') : tt('Text'));
            html += this.row(tt('Text'), `<textarea class="database-field-value p-text" rows="3">${this.escapeHTML(node.text)}</textarea>`,
                tt('Escape codes work: \\V[n], \\N[n], \\C[n], \\I[n], \\G') + ' ' + tt('Party codes: \\GOLD, \\PLV[n], \\PCLASS[n], \\PHP[n], \\PMHP[n], \\PMP[n], \\PMMP[n], \\PTP[n] (n = party slot)'));
            html += this.row(tt('Align'), this.selectControl('p-align', node.align, [['left', tt('Left')], ['center', tt('Center')], ['right', tt('Right')]]));
            html += this.pair(tt('Size'), this.numberControl('p-fontSize', node.fontSize, 0, 200), tt('Color'), this.numberControl('p-textColor', typeof node.textColor === 'number' ? node.textColor : 0, 0, 31));
            html += this.hintRow(tt('Font size 0 uses the game default; color is a window skin index.'));
            html += this.row('', this.checkControl('p-outline', node.outline, tt('Outline')));
            if (node.type === 'text') html += this.row('', this.checkControl('p-wrap', node.wrap, tt('Wrap')), tt('Wraps at the node width; set a width first.'));
            html += this.row('', this.checkControl('p-fitText', node.fitText, tt('Fit text to size')), tt('Shrinks the font until the text fits inside the node.'));
        }
        if (node.type === 'image') {
            html += this.group(tt('Image'));
            html += this.row(tt('Source'), this.selectControl('p-source', node.source, [['picture', tt('Picture')], ['system', tt('System')], ['face', tt('Face')], ['character', tt('Character')], ['icon', tt('Icon')], ['partyFace', tt('Party face')]]));
            html += `<div class="rr-ui-sub rr-ui-image-file"${node.source === 'icon' || node.source === 'partyFace' ? ' hidden' : ''}>`;
            html += this.row(tt('File'), `<div class="rr-ui-file-row">${this.textControl('p-file', node.file)}<button type="button" class="rr-btn-chip p-browse">…</button></div>`);
            html += `</div>`;
            html += `<div class="rr-ui-sub rr-ui-image-index"${node.source === 'face' || node.source === 'character' || node.source === 'icon' || node.source === 'partyFace' ? '' : ' hidden'}>`;
            html += this.row(tt('Index'), this.numberControl('p-index', node.index, 0, 9999));
            html += `</div>`;
            html += this.row(tt('Fit'), this.selectControl('p-fit', node.fit, [['none', tt('Actual size')], ['stretch', tt('Stretch')], ['contain', tt('Fit inside')]]));
        }
        if (node.type === 'button') {
            html += this.group(tt('Behavior'));
            html += this.row(tt('Action'), this.actionMarkup('p-action', node.action));
            html += this.row(tt('Enabled'), this.conditionMarkup('p-enabled', node.enabled));
            html += this.row(tt('Highlight'), this.colorControl('p-highlightColor', node.highlightColor));
            html += this.row(tt('Sound'), `<div class="rr-ui-file-row">${this.textControl('p-se', node.se ? node.se.name : '', tt('Default'))}<button type="button" class="rr-btn-chip p-se-browse">…</button></div>`);
        }
        panel.innerHTML = html;
    }

    /** Reads every control of the property panel back into the selected node. */
    applyProperties(changedElement) {
        const node = this.selected();
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!node || !panel) return;
        const q = cls => panel.querySelector('.' + cls);
        const num = (cls, min, max, fallback) => {
            const el = q(cls);
            if (!el) return fallback;
            const value = Number(el.value);
            return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
        };
        node.name = q('p-name').value;
        const parent = Number(q('p-parent').value) || 0;
        const anchor = q('p-anchor').value;
        const reparent = parent !== node.parent && !this.wouldCycle(node.id, parent);
        const reanchor = DatabaseUserInterfaceEditor.ANCHORS[anchor] && anchor !== node.anchor;
        if (reparent || reanchor) {
            // A new parent or anchor changes what x/y are measured from;
            // keep the node where it is on screen and re-express the offset.
            const before = this.rects().get(node.id);
            if (reparent) node.parent = parent;
            if (reanchor) node.anchor = anchor;
            if (before) {
                const screen = this.screenSize();
                const parentRect = this.rects().get(node.parent) || { x: 0, y: 0, width: screen.width, height: screen.height };
                const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor];
                node.x = Math.round(before.x - (parentRect.x + parentRect.width * ax - before.width * ax));
                node.y = Math.round(before.y - (parentRect.y + parentRect.height * ay - before.height * ay));
            }
        } else {
            node.x = num('p-x', -9999, 9999, node.x);
            node.y = num('p-y', -9999, 9999, node.y);
        }
        node.width = num('p-width', 0, 9999, node.width);
        node.height = num('p-height', 0, 9999, node.height);
        node.opacity = num('p-opacity', 0, 255, node.opacity);
        this.readCondition(panel, 'p-visible', node.visible);
        if (node.type === 'box' || node.type === 'button') {
            node.fill = q('p-fill').value;
            node.color = q('p-color').value;
            node.color2 = q('p-color2').value;
            node.fillOpacity = num('p-fillOpacity', 0, 255, node.fillOpacity);
            node.vertical = q('p-vertical').value === '1';
            node.borderWidth = num('p-borderWidth', 0, 32, node.borderWidth);
            node.borderColor = q('p-borderColor').value;
            node.radius = num('p-radius', 0, 200, node.radius);
            const fillColor = panel.querySelector('.rr-ui-fill-color');
            if (fillColor) fillColor.hidden = !(node.fill === 'color' || node.fill === 'gradient');
            panel.querySelectorAll('.rr-ui-gradient-end').forEach(el => {
                el.hidden = node.fill !== 'gradient';
                el.classList.toggle('rr-ui-hidden', node.fill !== 'gradient');
            });
        }
        if (node.type === 'text' || node.type === 'button') {
            node.text = q('p-text').value;
            node.align = q('p-align').value;
            node.fontSize = num('p-fontSize', 0, 200, node.fontSize);
            node.textColor = num('p-textColor', 0, 31, 0);
            node.outline = q('p-outline').checked;
            if (node.type === 'text') node.wrap = !!(q('p-wrap') && q('p-wrap').checked);
            node.fitText = !!(q('p-fitText') && q('p-fitText').checked);
        }
        if (node.type === 'image') {
            node.source = q('p-source').value;
            node.file = q('p-file').value.trim();
            node.index = num('p-index', 0, 9999, node.index);
            node.fit = q('p-fit').value;
            panel.querySelector('.rr-ui-image-file').hidden = node.source === 'icon' || node.source === 'partyFace';
            panel.querySelector('.rr-ui-image-index').hidden = !(node.source === 'face' || node.source === 'character' || node.source === 'icon' || node.source === 'partyFace');
        }
        if (node.type === 'button') {
            this.readAction(panel, 'p-action', node.action);
            this.readCondition(panel, 'p-enabled', node.enabled);
            node.highlightColor = q('p-highlightColor').value;
            const se = q('p-se').value.trim();
            node.se = se ? Object.assign({ name: se, volume: 90, pitch: 100, pan: 0 }, node.se || {}, { name: se }) : null;
        }
        this.touch();
        if (changedElement && (changedElement.classList.contains('p-name') || changedElement.classList.contains('p-text') || changedElement.classList.contains('p-file'))) {
            this.renderTree();
            this.refreshFirstFocus();
        }
        if (changedElement && changedElement.classList.contains('p-parent')) this.renderTree();
        if (reparent || reanchor) this.syncPositionFields(node);
        this.scheduleRender();
    }

    // ==========================================
    // LISTENERS
    // ==========================================

    attachListeners() {
        const wrapper = this.wrapper;
        const q = selector => wrapper.querySelector(selector);

        q('[data-field="name"]').addEventListener('input', event => {
            this.current.name = event.target.value;
            this.touch();
        });
        q('[data-field="note"]').addEventListener('input', event => {
            this.current.note = event.target.value;
            this.touch();
        });
        q('.rr-ui-background').addEventListener('change', event => {
            this.current.background = event.target.value;
            this.touch();
            this.scheduleRender();
        });
        q('.rr-ui-first-focus').addEventListener('change', event => {
            this.current.firstFocus = Number(event.target.value) || 0;
            this.touch();
        });
        q('.rr-ui-cancel-action').addEventListener('change', () => {
            this.readAction(q('.rr-ui-cancel-action'), 'cancel', this.current.cancel);
            this.touch();
        });
        q('.rr-ui-cancel-action').addEventListener('input', () => {
            this.readAction(q('.rr-ui-cancel-action'), 'cancel', this.current.cancel);
            this.touch();
        });
        q('.rr-ui-playtest').addEventListener('click', () => this.playtest());
        q('.rr-ui-capture').addEventListener('click', () => this.capture());
        q('.rr-ui-capture-scene').addEventListener('change', event => {
            if (!this.loadCapture(event.target.value)) {
                this.reference = null;
                this.captureStatus(this._t('No capture yet'));
                this.renderCaptureList();
                this.scheduleRender();
            }
        });
        q('.rr-ui-reference').addEventListener('change', event => {
            this.showReference = event.target.checked;
            this.scheduleRender();
        });
        q('.rr-ui-reference-opacity').addEventListener('input', event => {
            this.referenceOpacity = Number(event.target.value) / 100;
            this.scheduleRender();
        });
        q('.rr-ui-capture-list').addEventListener('click', event => {
            const row = event.target.closest('.rr-ui-capture-row-item');
            if (!row) return;
            const index = Number(row.dataset.index);
            if (event.target.closest('.rr-ui-capture-add')) {
                this.addBoxFromCapture(index);
                return;
            }
            this.capturedSelection = this.capturedSelection === index ? -1 : index;
            this.renderCaptureList();
            this.scheduleRender();
        });

        wrapper.querySelectorAll('[data-add]').forEach(button => {
            button.addEventListener('click', () => this.addNode(button.dataset.add));
        });
        q('.rr-ui-tree').addEventListener('click', event => {
            const row = event.target.closest('.rr-ui-tree-row');
            if (row) this.select(Number(row.dataset.id));
        });
        q('.rr-ui-node-up').addEventListener('click', () => this.moveNode(this.selectedId, -1));
        q('.rr-ui-node-down').addEventListener('click', () => this.moveNode(this.selectedId, 1));
        q('.rr-ui-node-duplicate').addEventListener('click', () => this.duplicateNode(this.selectedId));
        q('.rr-ui-node-delete').addEventListener('click', () => this.deleteNode(this.selectedId));
        q('.rr-ui-undo').addEventListener('click', () => this.undo());
        q('.rr-ui-redo').addEventListener('click', () => this.redo());
        q('.rr-ui-snap').addEventListener('change', event => { this.snap = event.target.checked; });
        q('.rr-ui-grid').addEventListener('change', event => { this.showGrid = event.target.checked; this.scheduleRender(); });

        const props = q('.rr-ui-props');
        let propsUndoArmed = true;
        props.addEventListener('focusin', () => { propsUndoArmed = true; });
        const onPropChange = event => {
            if (propsUndoArmed) {
                // One undo step per field visit, not per keystroke.
                this.pushUndo();
                propsUndoArmed = false;
            }
            this.applyProperties(event.target);
        };
        props.addEventListener('input', onPropChange);
        props.addEventListener('change', onPropChange);
        props.addEventListener('click', event => {
            if (event.target.classList.contains('p-browse')) this.browseImage();
            if (event.target.classList.contains('p-se-browse')) this.browseSe();
        });

        this.attachCanvasListeners();

        this._resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => { this.fitCanvas(); this.scheduleRender(); }) : null;
        if (this._resizeObserver) this._resizeObserver.observe(q('.rr-ui-canvas-host'));
    }

    attachCanvasListeners() {
        const canvas = this.canvas;
        const toCanvas = event => {
            const bounds = canvas.getBoundingClientRect();
            return {
                x: (event.clientX - bounds.left) / this.scale,
                y: (event.clientY - bounds.top) / this.scale
            };
        };
        canvas.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            // Measure before focusing: a focus that scrolls the canvas would
            // move the bounds the event's coordinates were taken against.
            const point = toCanvas(event);
            canvas.focus({ preventScroll: true });
            const rects = this.rects();
            const selected = this.selected();
            if (selected) {
                const handle = this.handleAt(rects.get(selected.id), point);
                if (handle) {
                    this.pushUndo();
                    this.drag = { kind: 'resize', handle, node: selected, start: point, origin: { x: selected.x, y: selected.y, width: selected.width, height: selected.height }, rect: rects.get(selected.id) };
                    event.preventDefault();
                    return;
                }
            }
            const hit = this.nodeAt(rects, point);
            if (hit) {
                if (hit.id !== this.selectedId) this.select(hit.id);
                this.pushUndo();
                this.drag = { kind: 'move', node: hit, start: point, origin: { x: hit.x, y: hit.y }, moved: false };
            } else if (this.selectedId) {
                this.select(0);
            }
            event.preventDefault();
        });
        window.addEventListener('mousemove', this._onMouseMove = event => {
            if (!this.drag) {
                if (this.wrapper && this.wrapper.isConnected) this.updateCursor(toCanvas(event));
                return;
            }
            const point = toCanvas(event);
            const dx = point.x - this.drag.start.x;
            const dy = point.y - this.drag.start.y;
            const snap = value => this.snap && !event.altKey ? Math.round(value / DatabaseUserInterfaceEditor.GRID) * DatabaseUserInterfaceEditor.GRID : Math.round(value);
            const node = this.drag.node;
            if (this.drag.kind === 'move') {
                node.x = snap(this.drag.origin.x + dx);
                node.y = snap(this.drag.origin.y + dy);
                this.drag.moved = true;
            } else {
                this.applyResize(node, this.drag, dx, dy, snap);
            }
            this.touch();
            this.syncPositionFields(node);
            this.scheduleRender();
        });
        window.addEventListener('mouseup', this._onMouseUp = () => {
            if (!this.drag) return;
            if (this.drag.kind === 'move' && !this.drag.moved) this.undoStack.pop();
            this.drag = null;
        });
        canvas.addEventListener('keydown', event => {
            const node = this.selected();
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) this.redo(); else this.undo();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
                event.preventDefault();
                this.redo();
                return;
            }
            if (!node) return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
                event.preventDefault();
                this.duplicateNode(node.id);
                return;
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                this.deleteNode(node.id);
                return;
            }
            const step = event.shiftKey ? DatabaseUserInterfaceEditor.GRID : 1;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (moves[event.key]) {
                event.preventDefault();
                this.pushUndo();
                node.x += moves[event.key][0];
                node.y += moves[event.key][1];
                this.touch();
                this.syncPositionFields(node);
                this.scheduleRender();
            }
        });
    }

    detach() {
        if (this._onMouseMove) window.removeEventListener('mousemove', this._onMouseMove);
        if (this._onMouseUp) window.removeEventListener('mouseup', this._onMouseUp);
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._onMouseMove = this._onMouseUp = this._resizeObserver = null;
    }

    syncPositionFields(node) {
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!panel || node !== this.selected()) return;
        const set = (cls, value) => { const el = panel.querySelector('.' + cls); if (el && document.activeElement !== el) el.value = value; };
        set('p-x', node.x);
        set('p-y', node.y);
        set('p-width', node.width);
        set('p-height', node.height);
    }

    applyResize(node, drag, dx, dy, snap) {
        const { handle, origin } = drag;
        const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor] || [0, 0];
        const min = 8;
        let width = origin.width || drag.rect.width;
        let height = origin.height || drag.rect.height;
        let x = origin.x;
        let y = origin.y;
        if (handle.includes('e')) width = Math.max(min, snap(width + dx));
        if (handle.includes('s')) height = Math.max(min, snap(height + dy));
        if (handle.includes('w')) {
            const newWidth = Math.max(min, snap(width - dx));
            x = origin.x + (width - newWidth) * (1 - ax);
            width = newWidth;
        } else if (handle.includes('e')) {
            x = origin.x + (width - (origin.width || drag.rect.width)) * ax;
        }
        if (handle.includes('n')) {
            const newHeight = Math.max(min, snap(height - dy));
            y = origin.y + (height - newHeight) * (1 - ay);
            height = newHeight;
        } else if (handle.includes('s')) {
            y = origin.y + (height - (origin.height || drag.rect.height)) * ay;
        }
        node.width = Math.round(width);
        node.height = Math.round(height);
        node.x = Math.round(x);
        node.y = Math.round(y);
    }

    handleAt(rect, point) {
        if (!rect) return null;
        const size = 8 / this.scale;
        const handles = this.handles(rect);
        for (const [name, hx, hy] of handles) {
            if (Math.abs(point.x - hx) <= size && Math.abs(point.y - hy) <= size) return name;
        }
        return null;
    }

    handles(rect) {
        const { x, y, width: w, height: h } = rect;
        return [
            ['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y],
            ['w', x, y + h / 2], ['e', x + w, y + h / 2],
            ['sw', x, y + h], ['s', x + w / 2, y + h], ['se', x + w, y + h]
        ];
    }

    nodeAt(rects, point) {
        for (let i = this.current.nodes.length - 1; i >= 0; i--) {
            const node = this.current.nodes[i];
            const rect = rects.get(node.id);
            if (!rect) continue;
            if (point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height) return node;
        }
        return null;
    }

    updateCursor(point) {
        const selected = this.selected();
        let cursor = 'default';
        if (selected) {
            const handle = this.handleAt(this.rects().get(selected.id), point);
            if (handle) cursor = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[handle];
        }
        if (cursor === 'default' && this.nodeAt(this.rects(), point)) cursor = 'move';
        this.canvas.style.cursor = cursor;
    }

    // ==========================================
    // PICKERS
    // ==========================================

    browseImage() {
        const node = this.selected();
        const project = this.project();
        if (!node || node.type !== 'image' || !project || !project.path) return;
        const folder = { picture: 'pictures', system: 'system', face: 'faces', character: 'characters' }[node.source];
        if (!folder || !this.parentEditor || typeof this.parentEditor.showImagePicker !== 'function') return;
        const path = require('path');
        const dir = path.join(project.path, 'img', folder);
        let files = [];
        try {
            files = RRAssetFiles.listNames(dir, ['.png']);
        } catch (error) {
            console.error('Error reading image folder:', error);
            return;
        }
        const sheetType = node.source === 'face' ? 'face' : node.source === 'character' ? 'character' : undefined;
        this.parentEditor.showImagePicker(this._t('Select Image'), files, (selectedFile, selectedIndex) => {
            this.pushUndo();
            node.file = selectedFile || '';
            if (sheetType && Number.isInteger(selectedIndex)) node.index = selectedIndex;
            this.touch();
            this.renderTree();
            this.renderProperties();
            this.scheduleRender();
        }, fileName => RRAssetFiles.urlFor(dir, fileName, ['.png']), node.file, Object.assign({
            allowNone: true,
            selectButtonLabel: this._t('Select Image')
        }, sheetType ? { sheetType, currentIndex: node.index || 0 } : {}));
    }

    browseSe() {
        const node = this.selected();
        const project = this.project();
        if (!node || node.type !== 'button' || !project || !project.path) return;
        if (typeof RRAudioPickerModal === 'undefined' || typeof RRAssetFiles === 'undefined') return;
        const path = require('path');
        const sePath = path.join(project.path, 'audio', 'se');
        let files = [];
        try {
            files = RRAssetFiles.listUnique(sePath, RRAssetFiles.AUDIO_EXTENSIONS);
        } catch (error) {
            console.error('Error reading se folder:', error);
            return;
        }
        const current = node.se || { name: '', volume: 90, pitch: 100, pan: 0 };
        RRAudioPickerModal.open({
            title: this._t('Select Sound Effect'),
            folderLabel: 'SE',
            files,
            selected: current.name || '',
            levels: { volume: current.volume, pitch: current.pitch, pan: current.pan },
            loopDefault: false,
            zIndex: 21000,
            onOk: result => {
                this.pushUndo();
                node.se = result && result.name
                    ? { name: result.name, volume: result.volume, pitch: result.pitch, pan: result.pan } : null;
                this.touch();
                this.renderProperties();
            }
        });
    }

    // ------------------------------------------------------------------
    // Capture from game: the live scene as a reference layer.

    static get CAPTURE_SCENES() {
        return [
            ['menu', 'Main Menu'], ['title', 'Title Screen'], ['item', 'Items'], ['skill', 'Skills'],
            ['equip', 'Equipment'], ['status', 'Status'], ['options', 'Options'], ['save', 'Save'],
            ['load', 'Load'], ['shop', 'Shop'], ['gameEnd', 'Game End'], ['battle', 'Battle']
        ];
    }

    captureSceneOptions() {
        return DatabaseUserInterfaceEditor.CAPTURE_SCENES
            .map(([key, label]) => `<option value="${key}">${this.escapeHTML(this._t(label))}</option>`).join('');
    }

    /** Where a project's capture of `sceneKey` lives: the editor's cache, never the project. */
    captureDir(sceneKey) {
        const project = this.project();
        if (!project || !project.path || typeof RREditorCache === 'undefined') return null;
        return RREditorCache.dir('InterfaceCaptures', project.path, String(sceneKey).replace(/[^a-zA-Z0-9]/g, ''));
    }

    captureStatus(text) {
        const status = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-status');
        if (status) status.textContent = text || '';
    }

    async capture() {
        const scene = this.wrapper.querySelector('.rr-ui-capture-scene').value;
        const dir = this.captureDir(scene);
        const project = this.project();
        const manager = this.parentEditor && this.parentEditor.playtestManager;
        if (!dir || !project || !manager || typeof manager.captureScene !== 'function') {
            this.captureStatus(this._t('Capture needs the desktop editor.'));
            return;
        }
        if (this.captureInFlight) return;
        try {
            if (this.parentEditor && typeof this.parentEditor.saveProject === 'function') await this.parentEditor.saveProject();
        } catch (error) {
            console.error('Could not save before the capture:', error);
        }
        const fs = require('fs');
        const path = require('path');
        try {
            fs.mkdirSync(dir, { recursive: true });
            for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
        } catch (error) { /* a fresh folder next */ }
        if (!manager.captureScene(project.path, scene, dir)) {
            this.captureStatus(this._t('Capture failed'));
            return;
        }
        this.captureInFlight = true;
        this.captureStatus(this._t('Capturing…'));
        const started = Date.now();
        const poll = () => {
            if (!this.wrapper || !this.wrapper.isConnected) { this.captureInFlight = false; return; }
            const file = path.join(dir, 'capture.json');
            if (fs.existsSync(file)) {
                this.captureInFlight = false;
                this.loadCapture(scene);
                return;
            }
            if (Date.now() - started > 120000) {
                this.captureInFlight = false;
                this.captureStatus(this._t('Capture failed'));
                return;
            }
            setTimeout(poll, 500);
        };
        setTimeout(poll, 1500);
    }

    /** Read a capture off disk into the reference layer. */
    loadCapture(sceneKey) {
        const dir = this.captureDir(sceneKey);
        if (!dir) return false;
        const fs = require('fs');
        const path = require('path');
        const file = path.join(dir, 'capture.json');
        if (!fs.existsSync(file)) return false;
        let data = null;
        try {
            data = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (error) {
            this.captureStatus(this._t('Capture failed'));
            return false;
        }
        if (!data || data.error) {
            this.captureStatus(this._t('Capture failed') + (data && data.error ? ': ' + data.error : ''));
            return false;
        }
        const reference = { scene: sceneKey, dir, data, image: null };
        if (data.screenFile) {
            const image = new Image();
            image.onload = () => this.scheduleRender();
            image.src = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, data.screenFile)).toString('base64');
            reference.image = image;
        }
        this.reference = reference;
        this.capturedSelection = -1;
        try {
            const project = this.project();
            if (project && project.path && typeof RREditorCache !== 'undefined') {
                localStorage.setItem('rrui.lastCapture.' + RREditorCache.projectKey(project.path), sceneKey);
            }
        } catch (error) { /* no storage */ }
        const label = (DatabaseUserInterfaceEditor.CAPTURE_SCENES.find(([key]) => key === sceneKey) || [sceneKey, sceneKey])[1];
        const when = data.capturedAt ? new Date(data.capturedAt) : null;
        this.captureStatus(`${this._t(label)} · ${data.windows ? data.windows.length : 0} ${this._t('windows')}`
            + (when ? ` · ${when.toLocaleTimeString()}` : ''));
        const select = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-scene');
        if (select) select.value = sceneKey;
        this.renderCaptureList();
        this.scheduleRender();
        return true;
    }

    /** The project's last capture comes back when the tab opens. */
    loadLastCapture() {
        try {
            const project = this.project();
            if (!project || !project.path || typeof RREditorCache === 'undefined') return;
            const scene = localStorage.getItem('rrui.lastCapture.' + RREditorCache.projectKey(project.path));
            if (scene) this.loadCapture(scene);
        } catch (error) { /* nothing to restore */ }
    }

    renderCaptureList() {
        const host = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-list');
        if (!host) return;
        host.innerHTML = '';
        const data = this.reference && this.reference.data;
        if (!data || !data.windows || !data.windows.length) return;
        const head = document.createElement('div');
        head.className = 'rr-ui-capture-head';
        head.textContent = this._t('Captured windows');
        host.appendChild(head);
        data.windows.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = 'rr-ui-tree-row rr-ui-capture-row-item' + (index === this.capturedSelection ? ' selected' : '');
            row.dataset.index = String(index);
            const label = document.createElement('span');
            label.className = 'rr-ui-tree-label';
            label.textContent = `${entry.className}  ${Math.round(entry.x)},${Math.round(entry.y)}  ${Math.round(entry.width)}×${Math.round(entry.height)}`;
            label.title = entry.windowskinName || '';
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'rr-btn-chip rr-ui-capture-add';
            add.textContent = this._t('Add Box');
            add.title = this._t('Start a Box node from this window');
            row.appendChild(label);
            row.appendChild(add);
            host.appendChild(row);
        });
        if (data.plugins && data.plugins.length) {
            const note = document.createElement('div');
            note.className = 'rr-ui-capture-plugins';
            note.textContent = `${this._t('Plugins active in the capture:')} ${data.plugins.length}`;
            note.title = data.plugins.join('\n');
            host.appendChild(note);
        }
    }

    /** A Box node over a captured window's rect, skinned like it. */
    addBoxFromCapture(index) {
        const entry = this.reference && this.reference.data && this.reference.data.windows[index];
        if (!entry) return;
        this.pushUndo();
        const node = this.addNode('box');
        if (!node) return;
        node.name = entry.className;
        node.x = Math.round(entry.x);
        node.y = Math.round(entry.y);
        node.width = Math.round(entry.width);
        node.height = Math.round(entry.height);
        node.anchor = 'topLeft';
        node.parent = 0;
        if (Number.isFinite(entry.backOpacity)) node.opacity = Math.max(0, Math.min(255, Math.round(entry.opacity)));
        this.touch();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    async playtest() {
        const project = this.project();
        const manager = this.parentEditor && this.parentEditor.playtestManager;
        if (!project || !project.path || !manager) return;
        try {
            if (window.reactor && window.reactor.projectController && window.reactor.projectController.saveAll) {
                const saved = await window.reactor.projectController.saveAll();
                if (!saved) return;
            } else {
                await this.databaseManager.saveAllData(project.path);
            }
        } catch (error) {
            console.error('Could not save before the interface playtest:', error);
            return;
        }
        if (typeof manager.playtestInterface === 'function') manager.playtestInterface(project.path, this.current.id);
    }

    // ==========================================
    // CANVAS RENDERING
    // ==========================================

    fitCanvas() {
        const host = this.wrapper.querySelector('.rr-ui-canvas-host');
        const screen = this.screenSize();
        if (!host) return;
        const available = Math.max(200, host.clientWidth - 20);
        this.scale = Math.min(1, available / screen.width);
        this.canvas.width = screen.width;
        this.canvas.height = screen.height;
        this.canvas.style.width = Math.round(screen.width * this.scale) + 'px';
        this.canvas.style.height = Math.round(screen.height * this.scale) + 'px';
        const size = this.wrapper.querySelector('.rr-ui-size');
        if (size) size.textContent = `${screen.width}×${screen.height} · ${Math.round(this.scale * 100)}%`;
    }

    scheduleRender() {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            if (this.wrapper && this.wrapper.isConnected) this.render();
            else this.detach();
        });
    }

    assetUrl(folder, name) {
        const project = this.project();
        if (!project || !project.path || !name) return null;
        try {
            const path = require('path');
            const filePath = path.join(project.path, 'img', folder, name + '.png');
            return window.RPGReactorAssetUrl ? window.RPGReactorAssetUrl(filePath) : 'file://' + filePath.replace(/\\/g, '/');
        } catch (error) {
            return null;
        }
    }

    image(folder, name) {
        const key = folder + '/' + name;
        if (this.images.has(key)) return this.images.get(key);
        const url = this.assetUrl(folder, name);
        const entry = { image: null, failed: !url };
        this.images.set(key, entry);
        if (url) {
            const image = new Image();
            image.onload = () => { entry.image = image; this.scheduleRender(); };
            image.onerror = () => { entry.failed = true; };
            image.src = url;
        }
        return entry;
    }

    loadSkin() {
        this.skin = this.image('system', 'Window');
    }

    skinColor(index) {
        const skin = this.skin && this.skin.image;
        if (!skin) return index === 0 ? '#ffffff' : '#ffff80';
        if (!this._skinCanvas) {
            this._skinCanvas = document.createElement('canvas');
            this._skinCanvas.width = skin.width;
            this._skinCanvas.height = skin.height;
            this._skinCanvas.getContext('2d').drawImage(skin, 0, 0);
            this._skinColors = new Map();
        }
        if (this._skinColors.has(index)) return this._skinColors.get(index);
        let color = '#ffffff';
        try {
            const px = 96 + (index % 8) * 12 + 6;
            const py = 144 + Math.floor(index / 8) * 12 + 6;
            const data = this._skinCanvas.getContext('2d').getImageData(px, py, 1, 1).data;
            color = `rgb(${data[0]},${data[1]},${data[2]})`;
        } catch (error) {
            // Cross-origin skin: the default white is close enough.
        }
        this._skinColors.set(index, color);
        return color;
    }

    /**
     * The project's main game font, loaded once per project into the
     * document so the canvas measures and draws text the way the game does.
     */
    loadGameFont() {
        const project = this.project();
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        const file = system && system.advanced && system.advanced.mainFontFilename;
        if (!project || !project.path || !file || typeof FontFace !== 'function') return;
        const key = project.path + '|' + file;
        if (DatabaseUserInterfaceEditor._fontLoads === undefined) DatabaseUserInterfaceEditor._fontLoads = new Map();
        const loads = DatabaseUserInterfaceEditor._fontLoads;
        if (loads.has(key)) {
            this._gameFontFamily = loads.get(key);
            return;
        }
        const family = 'rr-ui-gamefont-' + loads.size;
        loads.set(key, null);
        let url = null;
        try {
            const path = require('path');
            const filePath = path.join(project.path, 'fonts', file);
            url = window.RPGReactorAssetUrl ? window.RPGReactorAssetUrl(filePath) : 'file://' + filePath.replace(/\\/g, '/');
        } catch (error) {
            return;
        }
        const face = new FontFace(family, `url("${url}")`);
        face.load().then(loaded => {
            document.fonts.add(loaded);
            loads.set(key, family);
            this._gameFontFamily = family;
            this.scheduleRender();
        }).catch(() => {
            // The browser default stays; measurements will be approximate.
        });
    }

    fontFamily() {
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        const fallback = (system && system.advanced && system.advanced.fallbackFonts) || 'sans-serif';
        return this._gameFontFamily ? `"${this._gameFontFamily}", ${fallback}` : fallback;
    }

    fontSize(node) {
        if (node.fontSize > 0) return node.fontSize;
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        return (system && system.advanced && Number(system.advanced.fontSize)) || 26;
    }

    /** The actor in a starting-party slot (System > Starting Party), the editor's stand-in for the play-time party. */
    startingMember(slot) {
        const data = this.databaseManager && this.databaseManager.data;
        if (!data) return null;
        const ids = Array.isArray(data.system && data.system.partyMembers) ? data.system.partyMembers : [];
        const id = ids[Math.max(0, Math.floor(slot))];
        return (id && data.actors && data.actors[id]) || null;
    }

    /** Preview value of a party code for a starting-party slot: level and class from the actor, HP/MP from the class at that level. */
    startingStat(code, slot) {
        const member = this.startingMember(slot);
        if (!member) return '';
        const data = this.databaseManager.data;
        const level = Number(member.initialLevel) || 1;
        const klass = data.classes && data.classes[member.classId];
        const param = index => (klass && klass.params && klass.params[index] && klass.params[index][level]) || 0;
        switch (code) {
            case 'PLV': return String(level);
            case 'PCLASS': return klass ? klass.name : '';
            case 'PHP': case 'PMHP': return String(param(0));
            case 'PMP': case 'PMMP': return String(param(1));
            case 'PTP': return '0';
            default: return '';
        }
    }

    /** Splits text into drawable runs: {text, color, size, icon}. `scale` shrinks the base font (Fit text to size). */
    parseText(node, scale = 1) {
        const ctx = this.ctx;
        const baseSize = scale < 1 ? Math.max(DatabaseUserInterfaceEditor.MIN_FONT_SIZE, Math.round(this.fontSize(node) * scale)) : this.fontSize(node);
        const baseColor = typeof node.textColor === 'string' ? node.textColor : this.skinColor(node.textColor || 0);
        const actors = (this.databaseManager.data && this.databaseManager.data.actors) || [];
        const system = (this.databaseManager.data && this.databaseManager.data.system) || {};
        let text = String(node.text || '');
        text = text.replace(/\\\\/g, '\u0000');
        text = text.replace(/\\V\[(\d+)\]/gi, (m, n) => (system.variables && system.variables[Number(n)]) ? '{' + system.variables[Number(n)] + '}' : '0');
        text = text.replace(/\\N\[(\d+)\]/gi, (m, n) => (actors[Number(n)] && actors[Number(n)].name) || '');
        text = text.replace(/\\P\[(\d+)\]/gi, (m, n) => { const member = this.startingMember(Number(n) - 1); return member ? member.name : ''; });
        text = text.replace(/\\G/gi, system.currencyUnit || 'G');
        text = text.replace(/\\GOLD/gi, '0');
        text = text.replace(/\\(PLV|PCLASS|PHP|PMHP|PMP|PMMP|PTP)\[(\d+)\]/gi, (m, code, n) => this.startingStat(code.toUpperCase(), Number(n) - 1));
        text = text.replace(/\u0000/g, '\\');
        const lines = [];
        let color = baseColor;
        let size = baseSize;
        for (const rawLine of text.split('\n')) {
            const runs = [];
            let rest = rawLine;
            let buffer = '';
            const flush = () => { if (buffer) { runs.push({ text: buffer, color, size }); buffer = ''; } };
            while (rest.length) {
                const match = /^\\(C\[(\d+)\]|I\[(\d+)\]|\{|\}|FS\[(\d+)\]|PX\[\d+\]|PY\[\d+\]|[A-Za-z]+(\[[^\]]*\])?)/.exec(rest);
                if (match) {
                    flush();
                    if (match[2] !== undefined) color = this.skinColor(Number(match[2]));
                    else if (match[3] !== undefined) runs.push({ icon: Number(match[3]), size });
                    else if (match[1] === '{') size = Math.min(108, size + 12);
                    else if (match[1] === '}') size = Math.max(12, size - 12);
                    else if (match[4] !== undefined) size = Number(match[4]);
                    rest = rest.slice(match[0].length);
                } else {
                    buffer += rest[0];
                    rest = rest.slice(1);
                }
            }
            flush();
            lines.push({ runs });
        }
        const spacing = 36 - this.fontSize({ fontSize: 0 });
        const wrapped = node.wrap && node.width > 0 ? this.wrapRuns(lines, node.width) : lines;
        for (const line of wrapped) {
            let tallest = baseSize;
            for (const run of line.runs) tallest = Math.max(tallest, run.size || 0);
            line.height = tallest + spacing;
        }
        void ctx;
        return wrapped;
    }

    /** Greedy word wrap over styled runs; measured with the same font. */
    wrapRuns(lines, maxWidth) {
        const ctx = this.ctx;
        const width = token => {
            if (token.icon !== undefined) return 36;
            ctx.font = `${token.size}px ${this.fontFamily()}`;
            return ctx.measureText(token.text).width;
        };
        const out = [];
        for (const line of lines) {
            const tokens = [];
            for (const run of line.runs) {
                if (run.icon !== undefined) { tokens.push(run); continue; }
                for (const part of run.text.split(/(\s+)/)) {
                    if (part) tokens.push({ text: part, color: run.color, size: run.size, space: /^\s+$/.test(part) });
                }
            }
            let current = [];
            let used = 0;
            for (const token of tokens) {
                const w = width(token);
                if (current.length && !token.space && used + w > maxWidth) {
                    while (current.length && current[current.length - 1].space) current.pop();
                    out.push({ runs: current });
                    current = [];
                    used = 0;
                }
                if (!current.length && token.space) continue;
                current.push(token);
                used += w;
            }
            out.push({ runs: current });
        }
        return out;
    }

    measureRuns(lines) {
        const ctx = this.ctx;
        let width = 0;
        let height = 0;
        for (const line of lines) {
            let lineWidth = 0;
            for (const run of line.runs) {
                if (run.icon !== undefined) {
                    lineWidth += 36;
                } else {
                    ctx.font = `${run.size}px ${this.fontFamily()}`;
                    lineWidth += ctx.measureText(run.text).width;
                }
            }
            width = Math.max(width, lineWidth);
            height += line.height;
        }
        return { width: Math.ceil(width) + 4, height };
    }

    /**
     * The node's lines at the size they draw: parsed, wrapped, and — with
     * Fit text to size — shrunk by the same search the runtime runs, so
     * the canvas and the game agree on the font that fits.
     */
    layoutText(node) {
        let lines = this.parseText(node);
        if (!node.fitText || (!(node.width > 0) && !(node.height > 0))) return lines;
        const inset = node.type === 'button' && node.fill === 'window' ? 24 : 0;
        const fits = candidate => {
            const size = this.measureRuns(candidate);
            return (!(node.width > 0) || size.width <= node.width - inset)
                && (!(node.height > 0) || size.height <= node.height - inset);
        };
        if (fits(lines)) return lines;
        let low = Math.min(1, DatabaseUserInterfaceEditor.MIN_FONT_SIZE / this.fontSize(node));
        let high = 1;
        lines = this.parseText(node, low);
        for (let step = 0; step < 8; step++) {
            const middle = (low + high) / 2;
            const candidate = this.parseText(node, middle);
            if (fits(candidate)) { low = middle; lines = candidate; } else high = middle;
        }
        return lines;
    }

    measureText(node) {
        if (!this.ctx) return { width: 0, height: 0 };
        return this.measureRuns(this.layoutText(node));
    }

    drawText(node, rect) {
        const ctx = this.ctx;
        const lines = this.layoutText(node);
        const iconSet = this.image('system', 'IconSet');
        let y = rect.y;
        if (node.type === 'button') {
            const size = this.measureRuns(lines);
            y = rect.y + Math.max(0, Math.floor((rect.height - size.height) / 2));
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        for (const line of lines) {
            let lineWidth = 0;
            for (const run of line.runs) {
                if (run.icon !== undefined) lineWidth += 36;
                else { ctx.font = `${run.size}px ${this.fontFamily()}`; lineWidth += ctx.measureText(run.text).width; }
            }
            let x = rect.x;
            if (node.align === 'center') x = rect.x + Math.max(0, Math.floor((rect.width - lineWidth) / 2));
            else if (node.align === 'right') x = rect.x + Math.max(0, rect.width - lineWidth);
            for (const run of line.runs) {
                if (run.icon !== undefined) {
                    if (iconSet.image) {
                        ctx.drawImage(iconSet.image, (run.icon % 16) * 32, Math.floor(run.icon / 16) * 32, 32, 32, x + 2, y + (line.height - 32) / 2, 32, 32);
                    }
                    x += 36;
                    continue;
                }
                ctx.font = `${run.size}px ${this.fontFamily()}`;
                ctx.textBaseline = 'alphabetic';
                const baseline = Math.round(y + line.height / 2 + run.size * 0.35);
                if (node.outline) {
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.strokeText(run.text, x, baseline);
                }
                ctx.fillStyle = run.color;
                ctx.fillText(run.text, x, baseline);
                x += ctx.measureText(run.text).width;
            }
            y += line.height;
        }
        ctx.restore();
    }

    roundedPath(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    cssColor(hex, alpha) {
        const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
        return `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${Math.min(255, Math.max(0, alpha)) / 255})`;
    }

    drawSkinWindow(rect) {
        const ctx = this.ctx;
        const skin = this.skin && this.skin.image;
        const { x, y, width: w, height: h } = rect;
        const system = (this.databaseManager.data && this.databaseManager.data.system) || {};
        const backOpacity = (system.advanced && Number(system.advanced.windowOpacity)) || 192;
        if (!skin) {
            ctx.fillStyle = `rgba(0,0,32,${backOpacity / 255})`;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            return;
        }
        const m = 4;
        ctx.save();
        ctx.globalAlpha *= backOpacity / 255;
        ctx.drawImage(skin, 0, 0, 96, 96, x + m, y + m, Math.max(0, w - m * 2), Math.max(0, h - m * 2));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + m, y + m, w - m * 2, h - m * 2);
        ctx.clip();
        for (let ty = y + m; ty < y + h - m; ty += 96) {
            for (let tx = x + m; tx < x + w - m; tx += 96) {
                ctx.drawImage(skin, 0, 96, 96, 96, tx, ty, 96, 96);
            }
        }
        ctx.restore();
        ctx.restore();
        // Frame: 9-slice of (96,0)-(192,96), 24px corners.
        const c = 24;
        const sx = 96, sy = 0, S = 96;
        const draw = (dsx, dsy, dsw, dsh, dx, dy, dw, dh) => { if (dw > 0 && dh > 0) ctx.drawImage(skin, dsx, dsy, dsw, dsh, dx, dy, dw, dh); };
        draw(sx, sy, c, c, x, y, c, c);
        draw(sx + S - c, sy, c, c, x + w - c, y, c, c);
        draw(sx, sy + S - c, c, c, x, y + h - c, c, c);
        draw(sx + S - c, sy + S - c, c, c, x + w - c, y + h - c, c, c);
        draw(sx + c, sy, S - c * 2, c, x + c, y, w - c * 2, c);
        draw(sx + c, sy + S - c, S - c * 2, c, x + c, y + h - c, w - c * 2, c);
        draw(sx, sy + c, c, S - c * 2, x, y + c, c, h - c * 2);
        draw(sx + S - c, sy + c, c, S - c * 2, x + w - c, y + c, c, h - c * 2);
    }

    drawSurface(node, rect) {
        const ctx = this.ctx;
        const { x, y, width: w, height: h } = rect;
        ctx.save();
        if (node.fill === 'window') {
            this.drawSkinWindow(rect);
        } else if (node.fill === 'color' || node.fill === 'gradient') {
            ctx.save();
            if (node.radius > 0) { this.roundedPath(ctx, x, y, w, h, node.radius); ctx.clip(); }
            if (node.fill === 'gradient') {
                const gradient = node.vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
                gradient.addColorStop(0, this.cssColor(node.color, node.fillOpacity));
                gradient.addColorStop(1, this.cssColor(node.color2, node.fillOpacity));
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = this.cssColor(node.color, node.fillOpacity);
            }
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        }
        if (node.borderWidth > 0) {
            const inset = node.borderWidth / 2;
            ctx.strokeStyle = this.cssColor(node.borderColor, 255);
            ctx.lineWidth = node.borderWidth;
            if (node.radius > 0) { this.roundedPath(ctx, x + inset, y + inset, w - node.borderWidth, h - node.borderWidth, Math.max(0, node.radius - inset)); ctx.stroke(); }
            else ctx.strokeRect(x + inset, y + inset, w - node.borderWidth, h - node.borderWidth);
        }
        ctx.restore();
    }

    drawImageNode(node, rect) {
        const ctx = this.ctx;
        const folder = { picture: 'pictures', system: 'system', face: 'faces', character: 'characters', icon: 'system', partyFace: 'faces' }[node.source];
        const member = node.source === 'partyFace' ? this.startingMember(node.index) : null;
        const name = node.source === 'icon' ? 'IconSet' : node.source === 'partyFace' ? (member ? member.faceName : '') : node.file;
        const faceIndex = member ? member.faceIndex : node.index;
        const entry = name ? this.image(folder, name) : null;
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        if (!entry || !entry.image) {
            ctx.fillStyle = 'rgba(128,128,128,0.25)';
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
            ctx.restore();
            return;
        }
        const image = entry.image;
        let sx = 0, sy = 0, sw = image.width, sh = image.height;
        if (node.source === 'face' || node.source === 'partyFace') { sw = 144; sh = 144; sx = (faceIndex % 4) * sw; sy = Math.floor(faceIndex / 4) * sh; }
        else if (node.source === 'character') {
            const big = /^\$/.test(node.file) || /\$/.test(node.file);
            sw = image.width / (big ? 3 : 12); sh = image.height / (big ? 4 : 8);
            const n = big ? 0 : node.index;
            sx = ((n % 4) * 3 + 1) * sw; sy = Math.floor(n / 4) * 4 * sh;
        } else if (node.source === 'icon') { sw = 32; sh = 32; sx = (node.index % 16) * 32; sy = Math.floor(node.index / 16) * 32; }
        let dx = rect.x, dy = rect.y, dw = sw, dh = sh;
        if (node.fit === 'stretch') { dw = rect.width; dh = rect.height; }
        else if (node.fit === 'contain' && sw > 0 && sh > 0) {
            const scale = Math.min(rect.width / sw, rect.height / sh);
            dw = Math.round(sw * scale); dh = Math.round(sh * scale);
            dx = rect.x + Math.floor((rect.width - dw) / 2); dy = rect.y + Math.floor((rect.height - dh) / 2);
        }
        ctx.imageSmoothingEnabled = node.fit !== 'none';
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const screen = this.screenSize();
        const rects = this.rects();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, screen.width, screen.height);
        // Backdrop: what the interface's background setting does to the map.
        ctx.fillStyle = this.current.background === 'dim' ? '#141820' : this.current.background === 'none' ? '#2a3140' : '#1e2430';
        ctx.fillRect(0, 0, screen.width, screen.height);
        if (this.showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            const step = DatabaseUserInterfaceEditor.GRID * 4;
            ctx.beginPath();
            for (let x = step; x < screen.width; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, screen.height); }
            for (let y = step; y < screen.height; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(screen.width, y + 0.5); }
            ctx.stroke();
        }
        // The captured game underneath, locked: what the project shows today.
        const reference = this.showReference ? this.reference : null;
        if (reference && reference.image && reference.image.complete && reference.image.naturalWidth > 0) {
            ctx.globalAlpha = this.referenceOpacity;
            ctx.drawImage(reference.image, 0, 0, screen.width, screen.height);
            ctx.globalAlpha = 1;
        }
        const captured = reference && reference.data && reference.data.windows
            ? reference.data.windows[this.capturedSelection] : null;
        if (captured) {
            ctx.save();
            ctx.strokeStyle = '#ffb648';
            ctx.lineWidth = 2 / this.scale;
            ctx.setLineDash([4 / this.scale, 3 / this.scale]);
            ctx.strokeRect(captured.x, captured.y, captured.width, captured.height);
            ctx.restore();
        }
        const opacities = new Map();
        const opacityOf = (node, trail) => {
            if (opacities.has(node.id)) return opacities.get(node.id);
            const parent = this.node(node.parent);
            let factor = node.opacity / 255;
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                factor *= opacityOf(parent, trail);
            }
            opacities.set(node.id, factor);
            return factor;
        };
        for (const node of this.current.nodes) {
            const rect = rects.get(node.id);
            if (!rect || rect.width <= 0 || rect.height <= 0) continue;
            ctx.globalAlpha = opacityOf(node, new Set());
            switch (node.type) {
                case 'box': this.drawSurface(node, rect); break;
                case 'image': this.drawImageNode(node, rect); break;
                case 'text': this.drawText(node, rect); break;
                case 'button': this.drawSurface(node, rect); this.drawText(node, rect); break;
                default: break;
            }
            ctx.globalAlpha = 1;
        }
        const selected = this.selected();
        const rect = selected ? rects.get(selected.id) : null;
        if (rect) {
            const accent = (typeof ThemeColors !== 'undefined' && ThemeColors.resolve) ? ThemeColors.resolve('--color-accent-bright') : '#4da3ff';
            ctx.save();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2 / this.scale;
            ctx.setLineDash([6 / this.scale, 4 / this.scale]);
            ctx.strokeRect(rect.x, rect.y, Math.max(rect.width, 1), Math.max(rect.height, 1));
            ctx.setLineDash([]);
            const size = 8 / this.scale;
            ctx.fillStyle = accent;
            for (const [, hx, hy] of this.handles(rect)) ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
            ctx.restore();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseUserInterfaceEditor;
}
