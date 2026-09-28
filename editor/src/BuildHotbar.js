/**
 * BuildHotbar - building in the world, the way a survival game does it.
 *
 * A bar along the bottom of the 3D view: Select, then one slot per thing
 * you can put down (floor, wall, doorway, window, glass, stairs, ramp,
 * roof, pillar, fence, block, a shape, a screen, a light), a hammer that
 * takes things away, and a blueprint slot that stamps a saved building.
 * A panel at the side holds the specs of whatever is in hand or selected:
 * which way it faces, its material, its size and settings, a stair run's
 * steps, a screen's media, a light's colour, the blueprint to stamp.
 * Number keys pick slots, R turns, Q and E move the level, right-click
 * removes, Ctrl-drag lays a box, Ctrl+Z undoes. Select picks a placed
 * piece up again: the panel then edits it, a drag moves it, a shape wears
 * handles to move, turn and size it, Delete removes it.
 *
 * The PieceBuilderManager stays the model (kind, mode, material, level,
 * strokes, selection, undo); this is its face.
 *
 * The bar has three groups, switched at its left end: Build (the above),
 * Terrain (the ground's brushes and the water: raise, lower, smooth,
 * flatten, pour, drain, and a sheet's look), whose model is the
 * TerrainManager, and Models (3D models stood on the map: Select, Remove,
 * the Library, then the models in hand this session and on this map), whose
 * model is the ModelPropsManager. The panel shows the settings of whichever
 * is in hand; for Models it is the prop's own panel (placement, transform,
 * playback). Build's Select picks a placed model too, turning to Models.
 */
class BuildHotbar {
    constructor(projectController) {
        this.projectController = projectController;
        this.root = null;
        this.panel = null;
        this.visible = false;
        this._onKeyDown = event => this.handleKey(event);
    }

    static PIECES = ['floor', 'wall', 'doorway', 'window', 'glass', 'stair', 'ladder', 'ramp', 'roof', 'pillar', 'fence', 'block'];
    static EXTRA = ['shape', 'screen', 'light', 'hammer', 'blueprint'];
    static SLOTS = ['select'].concat(BuildHotbar.PIECES, BuildHotbar.EXTRA);
    /** The Terrain group: the ground's brushes, then the water. Each is a TerrainManager mode. */
    static TERRAIN = ['raise', 'lower', 'smooth', 'flatten', 'pour', 'drain', 'look'];
    static TERRAIN_MODE = { raise: 'raise', lower: 'lower', smooth: 'smooth', flatten: 'flatten', pour: 'fill', drain: 'drain', look: 'look' };
    /** The Models group's fixed slots; the models themselves follow as model0, model1... */
    static MODELS = ['mselect', 'mremove', 'library'];
    static GROUPS = ['build', 'terrain', 'models'];
    /** The kinds whose facing matters: they climb, slope, open or run one way. */
    /** The longest stair run or ladder: as high as a piece may stand. */
    static get MAX_RUN() { return (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_MAX_LEVEL) || 240; }
    static FACING = ['stair', 'ladder', 'ramp', 'doorway', 'window', 'fence', 'roof', 'glass'];

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    _tt(text) { return window.I18n ? window.I18n.tText(text) : text; }
    manager() { return this.projectController?.pieceBuilderManager || window.reactor?.pieceBuilderManager || null; }
    terrain() { return this.projectController?.terrainManager || window.reactor?.terrainManager || null; }
    props() { return this.projectController?.modelPropsManager || window.reactor?.modelPropsManager || null; }
    /** Which group the bar shows: Terrain or Models while that tool holds the map. */
    group() { const tool = window.reactor?.mapTool; return tool === 'terrain' ? 'terrain' : tool === 'models' ? 'models' : 'build'; }
    slots() {
        const group = this.group();
        if (group === 'terrain') return BuildHotbar.TERRAIN;
        if (group === 'models') return BuildHotbar.MODELS.concat((this.props()?.libraryModels() || []).map((_, i) => 'model' + i));
        return BuildHotbar.SLOTS;
    }
    currentMap() { return this.projectController?.getTilemapManager?.()?.currentMap || null; }
    is3D() { const map = this.currentMap(); const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null; return !!(map && E && E.hasNote(map)); }

    /** The bar and the panel live over the map canvas; made once, shown when building. */
    mount(container) {
        if (this.root || !container) return;
        this.root = document.createElement('div');
        this.root.id = 'build-hotbar';
        this.root.className = 'rr-build-hotbar';
        this.root.style.display = 'none';
        container.appendChild(this.root);
        this.panel = document.createElement('div');
        this.panel.id = 'build-panel';
        this.panel.className = 'rr-build-panel rr-accent-scrollbar';
        this.panel.style.display = 'none';
        container.appendChild(this.panel);
        this.render();
    }

    show() {
        const manager = this.manager();
        if (!this.root || !manager) return;
        const opening = !this.visible;
        this.visible = true;
        this.root.style.display = 'flex';
        this.panel.style.display = 'flex';
        manager.activate();
        // Opened, the bar starts in Select: a click picks up, nothing is laid by accident.
        if (opening && manager.mode !== 'select') manager.setMode('select');
        document.addEventListener('keydown', this._onKeyDown, true);
        this.render();
    }

    hide(release = true) {
        if (!this.root) return;
        this.visible = false;
        this.root.style.display = 'none';
        this.panel.style.display = 'none';
        document.removeEventListener('keydown', this._onKeyDown, true);
        if (release) { this.manager()?.deactivate(); window.reactor?.claimMapTool?.('paint'); }
    }

    toggle(on) { if (on === undefined ? !this.visible : on) this.show(); else this.hide(); }

    /** The slot the manager's state names. */
    /** Whether Lighting or Media Surfaces holds the map while the bar is up. */
    docked() { const owner = window.reactor?.mapTool; return owner === 'lighting' ? 'light' : owner === 'media' ? 'screen' : null; }

    activeSlot() {
        const manager = this.manager();
        if (!manager) return 'wall';
        if (this.group() === 'terrain') {
            const mode = this.terrain()?.mode;
            return BuildHotbar.TERRAIN.find(slot => BuildHotbar.TERRAIN_MODE[slot] === mode) || 'raise';
        }
        if (this.group() === 'models') {
            const props = this.props();
            if (!props || props.tool === 'erase') return 'mremove';
            if (!props.placing()) return 'mselect';
            const index = props.libraryModels().findIndex(entry => entry.name === props.model.name);
            return index >= 0 ? 'model' + index : 'mselect';
        }
        const docked = this.docked();
        if (docked) return docked;
        if (manager.mode === 'select') return 'select';
        if (manager.mode === 'erase') return 'hammer';
        if (manager.mode === 'stamp' || manager.mode === 'move') return 'blueprint';
        if (manager.kind === 'wedge') return 'ramp';
        return BuildHotbar.PIECES.includes(manager.kind) ? manager.kind : 'shape';
    }

    /** The models tool takes the map (the bar stays), its panel in the bar's side panel. */
    enterModels() {
        const props = this.props();
        if (!props) return null;
        if (!props.active) {
            this._modelsBody = null;
            props.activate();
            window.reactor?.eventManager?.eventMode && window.reactor.eventManager.setEventMode(false);
        }
        return props;
    }

    /** Pick up a placed model (or just turn to Models in Select, with no id). */
    selectModel(id) {
        const props = this.enterModels();
        if (!props) return;
        props.tool = 'select';
        if (id) props.select(id);
        this._lastModels = 'mselect';
        this.render();
    }

    /** Pick a slot: pieces place, the hammer erases, Select picks up, the rest open their specs. */
    pick(slot) {
        const manager = this.manager();
        if (!manager) return;
        // A models slot: Select picks up, Remove takes away, the Library opens the picker, a model is placed.
        if (BuildHotbar.MODELS.includes(slot) || /^model\d+$/.test(slot)) {
            const props = this.enterModels();
            if (!props) return;
            if (slot === 'library') { props.openModelPicker(); this.render(); return; }
            this._lastModels = slot;
            if (slot === 'mselect') props.tool = 'select';
            else if (slot === 'mremove') { props.tool = 'erase'; props.select(null); }
            else {
                const entry = props.libraryModels()[Number(slot.slice(5))];
                if (entry) props.chooseModel(entry);
            }
            this.render();
            return;
        }
        // A terrain slot: the terrain tool takes the map (the bar stays) in that mode.
        if (BuildHotbar.TERRAIN.includes(slot)) {
            const terrain = this.terrain();
            if (!terrain) return;
            if (!terrain.active) terrain.activate();
            terrain.setMode(BuildHotbar.TERRAIN_MODE[slot]);
            this._lastTerrain = slot;
            this.render();
            return;
        }
        if (this.group() !== 'build') manager.activate();
        // Screens and lights have their own editors: the slot opens the one for the map, and the bar stays.
        if (slot === 'screen') { if (this.docked() !== 'screen') window.reactor?.mediaSurfaceManager?.open?.(); return; }
        if (slot === 'light') { if (this.docked() !== 'light') window.reactor?.lightingManager?.setActive?.(true); return; }
        if (this.docked()) manager.activate();
        this._lastBuild = slot;
        if (slot === 'select') manager.setMode('select');
        else if (slot === 'ramp') manager.setKind('wedge');
        else if (BuildHotbar.PIECES.includes(slot)) manager.setKind(slot);
        else if (slot === 'hammer') manager.setMode('erase');
        else if (slot === 'shape') { const kinds = this.shapeKinds(); if (!kinds.includes(manager.kind) || manager.kind === 'wedge') manager.setKind(manager.lastShape || 'cylinder'); else manager.setMode('place'); }
        else if (slot === 'blueprint') { const plans = manager.structures(true); if (plans.length) { if (!manager.structure) manager.structure = plans[0].file; manager.setMode('stamp'); } }
        this.render();
    }

    shapeKinds() { return typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor.SHAPE_KINDS : (this.manager()?.kinds() || []).filter(k => !BuildHotbar.PIECES.includes(k)); }

    icon(name, size = 26) {
        const M = typeof PieceBuilderManager !== 'undefined' ? PieceBuilderManager.ICONS : {};
        const own = {
            select: 'M5 3l14 9-6 1.5L10 20z',
            shape: 'M4 17a8 8 0 0 1 16 0 M4 17h16v3H4z',
            screen: 'M3 5h18v11H3z M9 20h6 M10 9l5 2.5-5 2.5z',
            light: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
            hammer: 'M14 4l6 6-3 3-6-6z M11 7l-8 8 3 3 8-8 M13 5l2-2',
            blueprint: 'M4 4h16v16H4z M8 8h8v8H8z M12 4v4M4 12h4M12 16v4M16 12h4',
            move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
            turn: 'M19 12a7 7 0 1 1-2-4.9M17 3v4h4',
            size: 'M4 20v-7M4 20h7M4 20l6-6M20 4v7M20 4h-7M20 4l-6 6',
            ramp: 'M4 18h16l-16-9z',
            // The terrain group.
            raise: 'M3 20h18 M5 20c2-5 12-5 14 0 M12 13V4 M9 7l3-3 3 3',
            lower: 'M3 12h4c1 6 9 6 10 0h4 M12 3v7 M9 7l3 3 3-3',
            smooth: 'M3 9c3-4 6 4 9 0s6 4 9 0 M3 16c3-1.5 6 1.5 9 0s6 1.5 9 0',
            flatten: 'M3 18h18 M3 13h18 M8 8l4-4 4 4',
            pour: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
            drain: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z M4 4l16 16',
            look: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M18 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
            undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
            redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
            level: 'M3 16h18 M5 12h14 M4 8h16',
            build: 'M4 20V10l8-6 8 6v10z M9 20v-6h6v6',
            terrain: 'M2 19l6-9 4 5 3-3 7 7z',
            // The models group: a cube; Select, Remove and the Library within it.
            models: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
            mselect: 'M5 3l14 9-6 1.5L10 20z',
            mremove: 'M14 4l6 6-3 3-6-6z M11 7l-8 8 3 3 8-8 M13 5l2-2',
            library: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z'
        };
        const path = own[name] || M[name] || '';
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    label(slot) {
        if (BuildHotbar.PIECES.includes(slot)) return this._t('pieces.kind.' + slot);
        if (slot === 'mselect') return this._t('build.select');
        if (slot === 'mremove') return this._t('build.hammer');
        if (slot === 'library') return this._t('build.library');
        if (/^model\d+$/.test(slot)) return (this.props()?.libraryModels()[Number(slot.slice(5))]?.name || '').split('/').pop();
        if (BuildHotbar.TERRAIN.includes(slot)) return this._t({ pour: 'terrain.waterPour', drain: 'terrain.drain', look: 'terrain.lookShort' }[slot] || 'terrain.' + slot);
        return this._t('build.' + slot);
    }

    render() {
        const root = this.root, manager = this.manager();
        if (!root || !manager) return;
        const active = this.activeSlot();
        const group = this.group(), terrain = group === 'terrain';
        const slots = this.slots();
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const face = slot => {
            if (!/^model\d+$/.test(slot)) return this.icon(slot === 'shape' && active === 'shape' ? manager.kind : slot);
            const url = this.modelThumb(this.props()?.libraryModels()[Number(slot.slice(5))]);
            return url ? `<img class="rr-build-slot-thumb" src="${url}" alt="">` : this.icon('models');
        };
        const button = slot => `<button type="button" class="rr-build-slot${/^model\d+$/.test(slot) ? ' rr-build-slot-model' : ''}" data-slot="${slot}" aria-pressed="${slot === active}" title="${escape(this.label(slot))}">
            ${face(slot)}<span class="rr-build-slot-label">${escape(this.label(slot))}</span></button>`;
        root.innerHTML = `
            ${this.is3D() ? '' : `<div class="rr-build-note">${this._t('build.needs3D')}</div>`}
            <div class="rr-build-row rr-build-slots">
                <div class="rr-build-groups" role="radiogroup">${BuildHotbar.GROUPS.map(g => `<button type="button" class="rr-build-group" data-group="${g}" role="radio" aria-checked="${g === group}" title="${this._t('build.group.' + g)}">${this.icon(g, 18)}<span>${this._t('build.group.' + g)}</span></button>`).join('')}</div>
                ${slots.map(button).join('')}</div>
            <div class="rr-build-hint">${terrain ? this._t('terrain.keys') : group === 'models' ? this._t('build.modelKeys') : `${this._t('build.level')} <b class="rr-build-level">${manager.level}</b> · ${this._t('build.keys')}`}</div>`;
        this._slotsKey = slots.join('|');
        root.querySelectorAll('.rr-build-slot').forEach(el => el.addEventListener('click', () => this.pick(el.dataset.slot)));
        root.querySelectorAll('.rr-build-group').forEach(el => el.addEventListener('click', () => {
            const to = el.dataset.group;
            if (to === group) return;
            const last = this._lastModels && this.slots().includes(this._lastModels) ? this._lastModels : 'mselect';
            this.pick(to === 'terrain' ? (this._lastTerrain || 'raise') : to === 'models' ? (/^model/.test(last) && !this.props()?.libraryModels().length ? 'mselect' : last) : (this._lastBuild || 'select'));
        }));
        if (this.panel && this.visible) this.panel.style.display = this.docked() ? 'none' : 'flex';
        this.renderPanel();
    }

    /** A model's picture for its slot, or null while it is drawn (the bar redraws when it lands). */
    modelThumb(entry) {
        if (!entry || typeof RREventPreviewModels === 'undefined' || typeof Reactor3D === 'undefined' || !Reactor3D.normalizeModelSpec) return null;
        this._thumbs = this._thumbs || new Map();
        const known = this._thumbs.get(entry.name);
        if (known !== undefined) return known;
        this._thumbs.set(entry.name, null);
        const spec = Reactor3D.normalizeModelSpec({ name: entry.name, ext: entry.ext, file: entry.file, texture: entry.texture, size: 1, scale: 1 });
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        if (!spec || !project) return null;
        Promise.resolve(RREventPreviewModels.thumbnail(project, spec, window.reactor?.mapEditor3D || this.projectController?.mapEditor3D, 64, 2)).then(result => {
            if (!result?.url) { this._thumbs.delete(entry.name); return; }
            this._thumbs.set(entry.name, result.url);
            if (this.visible && this.group() === 'models') this.render();
        }).catch(() => this._thumbs.delete(entry.name));
        return null;
    }

    /** The Models group's panel: the prop panel itself, mounted once and kept (it syncs itself). */
    renderModelsPanel() {
        const panel = this.panel, props = this.props();
        if (!panel || !props) return;
        if (this._modelsBody && panel.contains(this._modelsBody) && props.panel === this._modelsBody) return;
        panel.innerHTML = `<div class="rr-build-panel-head">${this.icon('models', 20)}<span>${this._t('build.group.models')}</span></div><div class="rr-build-panel-body rr-build-models-body"></div>`;
        this._modelsBody = panel.querySelector('.rr-build-models-body');
        // With the room of the side panel, the transform card opens first.
        if (!props._activeSection) props._activeSection = 'transform';
        props.initializeUI(this._modelsBody);
    }

    // ---- The specs panel ------------------------------------------------------

    /** What the panel edits: the selected piece when there is one, else what the slot will place. */
    subject() {
        const manager = this.manager();
        if (manager.mode === 'select' && manager.selectionIds().length > 1) return { kind: 'many', placed: true, count: manager.selectionIds().length };
        const piece = manager.mode === 'select' ? manager.selectedPiece() : null;
        if (piece) return { piece, kind: piece.kind, shape: manager.isShape(piece.kind), placed: true };
        const active = this.activeSlot();
        if (active === 'select' || active === 'hammer' || active === 'blueprint') return { kind: active, placed: false };
        return { kind: manager.kind, shape: manager.isShape(manager.kind), placed: false };
    }

    renderPanel() {
        const panel = this.panel, manager = this.manager();
        if (!panel || !manager) return;
        if (this.group() === 'terrain') { this._modelsBody = null; this.renderTerrainPanel(); return; }
        if (this.group() === 'models') { this.renderModelsPanel(); return; }
        this._modelsBody = null;
        const s = this.subject();
        const tt = text => this._tt(text);
        // The dock's convention (Lighting, Media Surfaces): a card per group, its header on an accent strip.
        const section = (title, body) => body ? `<div class="lit-section rr-build-section"><div class="lit-section-header">${title}</div><div class="lit-section-body">${body}</div></div>` : '';
        let foot = '';
        const num = (cls, label, value, min, max, step, key, axis) => `<label class="rr-build-field${axis ? ' mp-axis-' + axis : ''}"><span${axis ? ' class="mp-axis-label"' : ''}>${label}</span><input type="number" class="database-field-value ${cls}" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
        // A row with a slider: the slider edits live (one undo step per drag), the number when it is typed.
        const slide = (cls, label, value, min, max, step, key, axis, span) => {
            const lo = span ? Math.max(min, Math.floor(value - span)) : min, hi = span ? Math.min(max, Math.ceil(value + span)) : max;
            return `<div class="mp-transform-row rr-build-slide mp-axis-${axis}"><span class="mp-axis-label">${label}</span><input type="range" class="rr-build-slider" data-for="${cls}" data-key="${key}" min="${lo}" max="${hi}" step="${step}" value="${value}" data-no-stepper><input type="number" class="database-field-value ${cls}" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}" data-no-stepper></div>`;
        };
        const swatches = current => `<div class="rr-build-swatches"><button type="button" class="rr-build-swatch rr-build-material" data-material="" aria-pressed="${!current}" title="${this._t('pieces.plain')}"><span class="rr-build-swatch-plain"></span></button>`
            + manager.materials().map(entry => `<button type="button" class="rr-build-swatch rr-build-material" data-material="${entry.name}" aria-pressed="${current === entry.name}" title="${entry.name}" style="background-image:url('${entry.url}');"></button>`).join('') + '</div>';
        const FINISHES = ['', 'mirror', 'chrome', 'polished', 'glossy', 'gold'];
        const PRESETS = (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_FINISHES) || {};
        const surfaceOf = p => p ? (p.surface || (p.finish && PRESETS[p.finish]) || null) : null;
        const sameSurface = (a, b) => (!a && !b) || (!!a && !!b && ['reflect', 'gloss', 'metal', 'texture'].every(k => Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-6) && String(a.tint || '#ffffff').toLowerCase() === String(b.tint || '#ffffff').toLowerCase());
        // The finishes as presets, then the surface's own sliders (as a 3D model's Surface has).
        const finishes = holder => {
            const current = surfaceOf(holder);
            const chips = `<div class="rr-build-finishes">${FINISHES.map(f => `<button type="button" class="rr-build-chip rr-build-finish" data-finish="${f}" aria-pressed="${sameSurface(current, f ? PRESETS[f] : null)}">${f === 'mirror' ? this._t('build.finish.mirror') : tt(f ? f[0].toUpperCase() + f.slice(1) : 'Plain')}</button>`).join('')}</div>`;
            const v = current || { reflect: 0, gloss: 0.8, metal: 0, texture: 0, tint: '#ffffff' };
            // The rest show only through the reflection: dimmed while it is 0, their values kept.
            const dim = key => key !== 'reflect' && !(v.reflect > 0) ? ' is-dimmed' : '';
            const row = (key, label) => `<div class="mp-transform-row rr-build-slide rr-surface-row${dim(key)}" data-surface="${key}"><span class="mp-axis-label">${label}</span><input type="range" class="rr-build-slider" data-for="rr-build-surface" data-key="${key}" min="0" max="1" step="0.01" value="${v[key] || 0}" data-no-stepper><input type="number" class="database-field-value rr-build-surface" data-key="${key}" value="${Math.round((v[key] || 0) * 100)}" min="0" max="100" step="1" data-no-stepper></div>`;
            return chips + row('reflect', tt('Reflection')) + row('gloss', tt('Gloss')) + row('metal', tt('Metal')) + row('texture', tt('Texture'))
                + `<div class="mp-transform-row rr-surface-row${dim('tint')}" data-surface="tint"><span class="mp-axis-label">${tt('Tint')}</span>${typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch('rr-build-surface-tint', v.tint || '#ffffff') : ''}</div>`;
        };
        const facing = rot => `<div class="rr-build-facing">${[[2, '↑'], [3, '→'], [0, '↓'], [1, '←']].map(([r, arrow]) => `<button type="button" class="rr-build-chip rr-build-rot" data-rot="${r}" aria-pressed="${r === rot}">${arrow}</button>`).join('')}<span class="rr-build-note">R</span></div>`;
        let head, body = '';
        if (s.kind === 'many') {
            head = this._t('build.selectedMany', { count: s.count });
            body = section(this._t('pieces.material'), swatches(null)) + section(this._t('build.finish'), finishes(manager.selectionPieces ? manager.selectionPieces()[0] || null : null))
                + `<div class="rr-build-note rr-build-wrap">${this._t('build.manyHint')}</div>`;
            foot = `<button type="button" class="rr-btn-secondary rr-build-turn-all">${this.icon('turn', 16)}<span>${tt('Turn')}</span></button><button type="button" class="rr-btn-secondary rr-build-remove">${this._t('build.remove')}</button>`;
        } else if (s.kind === 'select') {
            head = this._t('build.select');
            body = `<div class="rr-build-note rr-build-wrap">${this._t('build.nothingSelected')}</div><div class="rr-build-note rr-build-wrap">${this._t('build.boxHint')}</div>`;
        } else if (s.kind === 'hammer') {
            head = this._t('build.hammer');
            body = `<div class="rr-build-note rr-build-wrap">${this._t('build.hammerHint')}</div>`;
        } else if (s.kind === 'blueprint') {
            const plans = manager.structures(true);
            head = this._t('build.blueprint');
            // A building picked up in move mode that came from a plan can be laid again from it.
            const map = this.currentMap(), E = manager.elevation();
            const record = manager.mode === 'move' && manager.selectedGroup && E && map ? E.structureOf(map, manager.selectedGroup) : null;
            if (record) foot = `<button type="button" class="rr-btn-secondary rr-build-relay" title="${tt('Lay this building again from its plan as the plan is now.')}">${tt('Rebuild from plan')}</button>`;
            body = plans.length
                ? section(tt('Name'), `<select class="database-field-value rr-build-plan">${plans.map(plan => `<option value="${plan.file}" ${manager.structure === plan.file ? 'selected' : ''}>${plan.name}</option>`).join('')}</select>`) + `<div class="rr-build-note rr-build-wrap">${this._t('build.blueprintHint')}</div>`
                : `<div class="rr-build-note rr-build-wrap">${this._t('build.noBlueprints')}</div>`;
        } else {
            // A piece or a shape, in hand or placed: facing, material, size, settings, and for a stair run its steps.
            const piece = s.piece || null;
            const kind = s.kind;
            head = (s.placed ? this._t('build.selected') + ': ' : '') + (kind === 'wedge' ? this._t('pieces.kind.ramp') : this._t('pieces.kind.' + kind));
            const rot = piece ? (s.shape ? Math.round(((piece.angle || 0) / 90) % 4) : piece.rot) : (s.shape ? 0 : manager.rot);
            // Which shape: every one, in hand or placed (a placed one changes kind and keeps its size and place).
            if (s.shape && kind !== 'wedge') body += section(tt('Shape'), `<div class="rr-build-shapes">${this.shapeKinds().filter(k => k !== 'wedge').map(k => `<button type="button" class="rr-build-chip rr-build-shape" data-shape="${k}" aria-pressed="${k === kind}" title="${this._t('pieces.kind.' + k)}">${this.icon(k, 20)}<span>${this._t('pieces.kind.' + k)}</span></button>`).join('')}</div>`);
            if (!s.shape && (BuildHotbar.FACING.includes(kind) || s.placed)) body += section(this._t('build.direction'), facing(rot));
            body += section(this._t('pieces.material'), swatches(piece ? piece.material : manager.material));
            body += section(this._t('build.finish'), finishes(piece || { finish: manager.finish, surface: manager.surface }));
            // A flight's steps and width, in hand or placed (a placed flight is laid again from its foot).
            const flight = kind === 'stair' && s.placed && manager.stairFlight ? manager.stairFlight(piece) : null;
            if (kind === 'stair') body += section(tt('Size'), num('rr-build-steps', this._t('build.steps'), flight ? flight.steps : manager.stairSteps, 1, BuildHotbar.MAX_RUN, 1, 'steps')
                + num('rr-build-stairwidth', this._t('build.stairWidth'), flight ? flight.width : manager.stairWidth, 1, 20, 1, 'width'));
            // A ladder's height, in hand or placed: a placed one grows or shrinks from its foot.
            // A ladder's height and width, in hand or placed (a placed one is laid again from its foot).
            const ladder = kind === 'ladder' && piece && manager.ladderFlight ? manager.ladderFlight(piece) : null;
            if (kind === 'ladder') body += section(tt('Size'), num('rr-build-ladderheight', tt('Height'), ladder ? ladder.height : manager.ladderHeight, 0.5, BuildHotbar.MAX_RUN, 0.1, 'height')
                + num('rr-build-ladderwidth', tt('Width'), ladder ? ladder.width : manager.ladderWidth, 0.5, 20, 0.1, 'width'));
            if (s.shape) {
                const size = piece ? piece.size : manager.sizeFor(kind);
                const labels = kind === 'wedge' ? [tt('Width'), tt('Height'), tt('Length')] : [tt('Width'), tt('Height'), tt('Depth')];
                body += section(tt('Size'), [0, 1, 2].map(i => slide('rr-build-size', labels[i], size[i], 0.25, 60, 0.05, String(i), ['x', 'y', 'z'][i], Math.max(4, size[i]))).join(''));
                if (piece) {
                    const shapeAt = [piece.x + 0.5 + (piece.offset ? piece.offset[0] || 0 : 0), piece.y + 0.5 + (piece.offset ? piece.offset[1] || 0 : 0)];
                    // In the handles' colours: red X, green up, blue Z; the rings alike (tilt about red, turn about green, roll about blue).
                    body += section(this._t('build.handles'), slide('rr-build-pos', 'X', shapeAt[0], 0, 999, 0.05, 'x', 'x', 4) + slide('rr-build-pos', tt('Up'), piece.z, 0, 120, 0.05, 'z', 'y', 6) + slide('rr-build-pos', 'Z', shapeAt[1], 0, 999, 0.05, 'y', 'z', 4)
                        + slide('rr-build-turn', tt('Tilt'), piece.tilt || 0, 0, 359, 1, 'tilt', 'x') + slide('rr-build-turn', tt('Turn'), piece.angle || 0, 0, 359, 1, 'angle', 'y') + slide('rr-build-turn', tt('Roll'), piece.roll || 0, 0, 359, 1, 'roll', 'z'));
                }
                const own = (typeof DatabaseStructureEditor !== 'undefined' && DatabaseStructureEditor.SHAPE_PARAMS[kind]) || {};
                let settings = '';
                if ('sides' in own) settings += num('rr-build-param', tt('Sides'), piece?.sides ?? manager.params?.[kind]?.sides ?? own.sides, 3, 32, 1, 'sides');
                if ('taper' in own) settings += num('rr-build-param', tt('Top') + ' %', Math.round((piece?.taper ?? manager.params?.[kind]?.taper ?? own.taper) * 100), 0, 100, 5, 'taper');
                if ('sweep' in own) settings += num('rr-build-param', tt('Around') + ' °', piece?.sweep ?? manager.params?.[kind]?.sweep ?? own.sweep, 15, 360, 15, 'sweep');
                if ('thick' in own) settings += num('rr-build-param', tt('Wall') + ' %', Math.round((piece?.thick ?? manager.params?.[kind]?.thick ?? own.thick) * 100), 2, 100, 2, 'thick');
                if (settings) body += section(this._t('build.settings'), settings);
            }
            if (s.placed) foot = `<button type="button" class="rr-btn-secondary rr-build-remove">${this._t('build.remove')}</button>`;
        }
        panel.innerHTML = `<div class="rr-build-panel-head">${this.icon(s.kind === 'wedge' ? 'ramp' : s.kind === 'many' ? 'select' : s.kind, 20)}<span>${head}</span></div>`
            + `<div class="rr-build-panel-body">${body}</div>` + (foot ? `<div class="lit-section-footer rr-build-panel-foot">${foot}</div>` : '');
        this.bindPanel(s);
    }

    bindPanel(s) {
        const panel = this.panel, manager = this.manager();
        const placed = !!s.piece || s.kind === 'many';
        const edit = (patch, pending) => { if (s.kind === 'many') manager.updateSelection(patch); else if (placed) manager.updateSelected(patch); else pending(); this.renderPanel(); };
        panel.querySelectorAll('.rr-build-shape').forEach(el => el.addEventListener('click', () => {
            const kind = el.dataset.shape;
            if (s.piece) {
                // Changing a placed shape keeps its place and size but takes the new shape's own settings.
                const own = (typeof DatabaseStructureEditor !== 'undefined' && DatabaseStructureEditor.SHAPE_PARAMS[kind]) || {};
                const patch = Object.assign({ kind }, own);
                manager.updateSelected(patch);
            } else { manager.lastShape = kind; manager.setKind(kind); }
            this.render();
        }));
        panel.querySelector('.rr-build-relay')?.addEventListener('click', () => { manager.relayFromPlan(); this.renderPanel(); });
        panel.querySelector('.rr-build-turn-all')?.addEventListener('click', () => { manager.turnSelection(); this.renderPanel(); });
        // A preset chip sets the surface to the preset's (the sliders then start from it).
        const presets = (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_FINISHES) || {};
        panel.querySelectorAll('.rr-build-finish').forEach(el => el.addEventListener('click', () => {
            const f = el.dataset.finish, surface = f && presets[f] ? Object.assign({}, presets[f]) : null;
            edit({ finish: f, surface }, () => { manager.finish = f; manager.surface = surface; });
        }));
        // The surface's own values: sliders live (one undo step a drag), numbers in percent, the tint by the colour popup.
        const currentSurface = () => {
            // Many selected: they start from the first one's surface (gold stays gold while a slider moves).
            const holder = s.kind === 'many' ? (manager.selectionPieces()[0] || null) : (placed ? manager.selectedPiece() : { finish: manager.finish, surface: manager.surface });
            const base = holder ? (holder.surface || (holder.finish && presets[holder.finish])) : null;
            return Object.assign({ reflect: 0, gloss: 0.8, metal: 0, texture: 0, tint: '#ffffff' }, base || {});
        };
        const setSurface = (patch, record) => {
            const surface = Object.assign(currentSurface(), patch);
            // Kept whatever the reflection: at 0 it shows nothing, and raising it again brings the rest back.
            const plain = !surface.reflect && !surface.metal && !surface.texture && Math.abs(surface.gloss - 0.8) < 1e-6 && String(surface.tint).toLowerCase() === '#ffffff';
            const value = { finish: '', surface: plain ? null : surface };
            if (patch.reflect !== undefined) panel.querySelectorAll('.rr-surface-row:not([data-surface="reflect"])').forEach(row => row.classList.toggle('is-dimmed', !(surface.reflect > 0)));
            if (s.kind === 'many') manager.updateSelection(value, record);
            else if (placed) manager.updateSelected(value, record);
            else { manager.finish = ''; manager.surface = value.surface; }
        };
        panel.querySelectorAll('input.rr-build-surface').forEach(el => el.addEventListener('change', () => {
            const n = Number(el.value); if (!Number.isFinite(n)) { this.renderPanel(); return; }
            setSurface({ [el.dataset.key]: Math.max(0, Math.min(100, n)) / 100 }, true); this.renderPanel();
        }));
        const surfaceTint = panel.querySelector('.rr-build-surface-tint');
        if (surfaceTint && typeof RRColorPopup !== 'undefined') RRColorPopup.bind(surfaceTint, hex => setSurface({ tint: hex }, false));
        panel.querySelectorAll('.rr-build-material').forEach(el => el.addEventListener('click', () => edit({ material: el.dataset.material }, () => manager.setMaterial(el.dataset.material))));
        panel.querySelectorAll('.rr-build-rot').forEach(el => el.addEventListener('click', () => { const r = Number(el.dataset.rot); edit(s.shape ? { angle: r * 90 } : { rot: r }, () => { manager.rot = r; manager._syncPanel(); manager._ghostChanged(); }); }));
        panel.querySelectorAll('.rr-build-size').forEach(el => el.addEventListener('change', () => {
            const i = Number(el.dataset.key), v = Number(el.value);
            if (!Number.isFinite(v) || v <= 0) { this.renderPanel(); return; }
            const size = (placed ? s.piece.size : manager.sizeFor(s.kind)).slice(); size[i] = Math.max(0.25, Math.min(60, Math.round(v * 20) / 20));
            edit({ size }, () => manager.setSize(s.kind, size));
        }));
        panel.querySelectorAll('.rr-build-pos').forEach(el => el.addEventListener('change', () => {
            const v = Number(el.value); if (!Number.isFinite(v) || !placed) { this.renderPanel(); return; }
            const cx = s.piece.x + 0.5 + (s.piece.offset ? s.piece.offset[0] || 0 : 0), cy = s.piece.y + 0.5 + (s.piece.offset ? s.piece.offset[1] || 0 : 0);
            if (el.dataset.key === 'z') manager.updateSelected({ z: Math.max(0, Math.round(v * 20) / 20) }); else manager.moveSelectedPieceTo(el.dataset.key === 'x' ? v : cx, el.dataset.key === 'y' ? v : cy);
            this.renderPanel();
        }));
        panel.querySelectorAll('.rr-build-turn').forEach(el => el.addEventListener('change', () => { const v = ((Math.round(Number(el.value)) || 0) % 360 + 360) % 360; if (placed) manager.updateSelected({ [el.dataset.key]: v }); this.renderPanel(); }));
        // Sliders: live while dragged, the number beside them following, one undo step on release.
        panel.querySelectorAll('.rr-build-slider').forEach(el => {
            const number = el.parentElement.querySelector('input[type=number]');
            let snapshot = null;
            el.addEventListener('pointerdown', () => { snapshot = placed || s.kind === 'many' ? manager._snapshot(manager.currentMap()) : null; });
            el.addEventListener('input', () => {
                const v = Number(el.value), key = el.dataset.key, kind = el.dataset.for;
                number.value = kind === 'rr-build-surface' ? Math.round(v * 100) : el.value;
                if (kind === 'rr-build-surface') { if (placed || !s.piece) setSurface({ [key]: v }, false); return; }
                if (kind === 'rr-build-size') {
                    const size = (placed ? manager.selectedPiece().size : manager.sizeFor(s.kind)).slice(); size[Number(key)] = v;
                    if (placed) manager.updateSelected({ size }, false); else manager.setSize(s.kind, size);
                } else if (!placed) return;
                else if (kind === 'rr-build-turn') manager.updateSelected({ [key]: v }, false);
                else if (key === 'z') manager.updateSelected({ z: v }, false);
                else {
                    const now = manager.selectedPiece();
                    const cx = now.x + 0.5 + (now.offset ? now.offset[0] || 0 : 0), cy = now.y + 0.5 + (now.offset ? now.offset[1] || 0 : 0);
                    manager.moveSelectedPieceTo(key === 'x' ? v : cx, key === 'y' ? v : cy, undefined, false);
                }
            });
            el.addEventListener('change', () => {
                if (snapshot) { manager.undoStack.push(snapshot); if (manager.undoStack.length > 50) manager.undoStack.shift(); manager.redoStack.length = 0; }
                snapshot = null;
                el.blur();
                this.renderPanel();
            });
        });
        panel.querySelectorAll('.rr-build-param').forEach(el => el.addEventListener('change', () => {
            const key = el.dataset.key; let v = Number(el.value); if (!Number.isFinite(v)) { this.renderPanel(); return; }
            if (key === 'taper' || key === 'thick') v = Math.max(0, Math.min(1, Math.round(v) / 100)); else if (key === 'sides') v = Math.max(3, Math.min(32, Math.round(v))); else v = Math.max(15, Math.min(360, Math.round(v)));
            edit({ [key]: v }, () => { manager.params = manager.params || {}; manager.params[s.kind] = Object.assign({}, manager.params[s.kind], { [key]: v }); manager._ghostChanged(); });
        }));
        panel.querySelector('.rr-build-steps')?.addEventListener('change', event => {
            const steps = Math.max(1, Math.min(BuildHotbar.MAX_RUN, Math.round(Number(event.target.value)) || 1));
            if (s.piece && s.piece.kind === 'stair' && manager.setStairFlight) { const f = manager.stairFlight(s.piece); manager.setStairFlight(s.piece, steps, f ? f.width : 1); }
            else manager.stairSteps = steps;
            this.renderPanel();
        });
        // A ladder's size in tiles, fractions allowed (1.5 wide, 5.5 tall).
        const ladderSize = (key, value) => {
            const size = manager.constructor.clampLadderSize(value, key === 'height' ? BuildHotbar.MAX_RUN : 20);
            if (s.piece) { const f = manager.ladderFlight(s.piece); manager.setLadderSize(s.piece, key === 'height' ? size : (f ? f.height : 1), key === 'width' ? size : (f ? f.width : 1)); }
            else if (key === 'height') manager.ladderHeight = size; else manager.ladderWidth = size;
            manager._ghostChanged?.();
            this.renderPanel();
        };
        panel.querySelector('.rr-build-ladderheight')?.addEventListener('change', event => ladderSize('height', event.target.value));
        panel.querySelector('.rr-build-ladderwidth')?.addEventListener('change', event => ladderSize('width', event.target.value));
        panel.querySelector('.rr-build-stairwidth')?.addEventListener('change', event => {
            const width = Math.max(1, Math.min(20, Math.round(Number(event.target.value)) || 1));
            if (s.piece && s.piece.kind === 'stair' && manager.setStairFlight) { const f = manager.stairFlight(s.piece); manager.setStairFlight(s.piece, f ? f.steps : 1, width); }
            else manager.stairWidth = width;
            this.renderPanel();
        });
        panel.querySelectorAll('.rr-build-mode').forEach(el => el.addEventListener('click', () => { manager.gizmoMode = el.dataset.mode; manager._ghostChanged(); this.renderPanel(); }));
        panel.querySelector('.rr-build-remove')?.addEventListener('click', () => { manager.removeSelection(); this.renderPanel(); });
        panel.querySelector('.rr-build-plan')?.addEventListener('change', event => { manager.structure = event.target.value; manager.setMode('stamp'); });
    }

    /**
     * The Terrain group's panel: a brush's size and strength, how to pour or
     * drain, or a water sheet's look; undo, redo and flattening the whole map
     * as icons along the foot.
     */
    renderTerrainPanel() {
        const panel = this.panel, terrain = this.terrain();
        if (!panel || !terrain) return;
        const slot = this.activeSlot(), t = key => this._t(key);
        const section = (title, body) => `<div class="lit-section rr-build-section"><div class="lit-section-header">${title}</div><div class="lit-section-body">${body}</div></div>`;
        const range = (cls, label, value, min, max, step, shown) => `<label class="rr-build-range"><span>${label}</span><input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" value="${value}" data-no-stepper><b class="${cls}-value">${shown}</b></label>`;
        const note = key => `<div class="rr-build-note rr-build-wrap">${t(key)}</div>`;
        let body = '';
        if (['raise', 'lower', 'smooth', 'flatten'].includes(slot)) {
            body = section(t('terrain.brush'), range('rr-build-tradius', t('terrain.radius'), terrain.radius, 1, 12, 0.5, terrain.radius)
                + range('rr-build-tstrength', t('terrain.strength'), terrain.strength, 0.05, 1, 0.05, terrain.strength)) + note('terrain.hint.brush');
        } else if (slot === 'pour') {
            body = note('terrain.hint.pour');
        } else if (slot === 'drain') {
            body = note('terrain.hint.drain');
        } else {
            const look = terrain.waterLook;
            const keys = ['reflect', 'gloss', 'tint', 'colour', 'clear', 'waves', 'glow'];
            const same = preset => keys.every(key => (preset[key] ?? '') === (look[key] ?? ''));
            const swatch = (cls, value) => typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch(cls, value) : `<input type="color" class="${cls}" value="${value}">`;
            // The liquid (what it is), then how it reflects.
            body = section(t('terrain.liquid'), `<div class="rr-build-finishes">${Object.keys(TerrainManager.WATER_LOOKS).map(p => `<button type="button" class="rr-build-chip rr-build-look" data-preset="${p}" aria-pressed="${same(TerrainManager.WATER_LOOKS[p])}"><span>${t('terrain.look.' + p)}</span></button>`).join('')}</div>`
                // No colour of its own is water's depth blue, shown as such.
                + `<div class="rr-build-range"><span>${t('terrain.look.colour')}</span>${swatch('rr-build-tcolour', look.colour || '#2a5f96')}</div>`
                + range('rr-build-tclear', t('terrain.look.clear'), look.clear ?? 0.6, 0, 1, 0.01, Math.round((look.clear ?? 0.6) * 100) + '%')
                + range('rr-build-twaves', t('terrain.look.waves'), look.waves ?? 1, 0, 2, 0.01, Math.round((look.waves ?? 1) * 100) + '%')
                + range('rr-build-tglow', t('terrain.look.glow'), look.glow ?? 0, 0, 1, 0.01, Math.round((look.glow ?? 0) * 100) + '%'))
                + section(t('terrain.waterLook'), range('rr-build-treflect', t('terrain.look.reflect'), look.reflect, 0, 1, 0.01, Math.round(look.reflect * 100) + '%')
                + range('rr-build-tgloss', t('terrain.look.gloss'), look.gloss, 0, 1, 0.01, Math.round(look.gloss * 100) + '%')
                + `<div class="rr-build-range"><span>${t('terrain.look.tint')}</span>${swatch('rr-build-ttint', look.tint)}</div>`);
            // Which sheet these change: the one clicked in the 3D view, outlined there.
            const chosen = terrain.selectedRegion ? terrain.selectedRegion() : null;
            body = (chosen ? `<div class="rr-build-note rr-build-wrap rr-build-tselected">${t('terrain.look.selected').replace('{w}', chosen.x1 - chosen.x0 + 1).replace('{h}', chosen.y1 - chosen.y0 + 1)}</div>` : note('terrain.look.pick')) + body;
        }
        const status = terrain.statusText ? terrain.statusText() : '';
        const iconButton = (cls, icon, key) => `<button type="button" class="rr-btn-secondary rr-build-icon-btn ${cls}" title="${t(key)}" aria-label="${t(key)}">${this.icon(icon, 16)}</button>`;
        panel.innerHTML = `<div class="rr-build-panel-head">${this.icon(slot, 20)}<span>${this.label(slot)}</span></div>`
            + `<div class="rr-build-panel-body">${body}${status ? `<div class="rr-build-note rr-build-wrap rr-build-tstatus">${status}</div>` : ''}</div>`
            + `<div class="lit-section-footer rr-build-panel-foot">${iconButton('rr-build-tundo', 'undo', 'terrain.undo')}${iconButton('rr-build-tredo', 'redo', 'terrain.redo')}${['raise', 'lower', 'smooth', 'flatten'].includes(slot) ? iconButton('rr-build-tclear', 'level', 'terrain.clear') : ''}</div>`;
        const bindRange = (cls, apply, show) => panel.querySelector('.' + cls)?.addEventListener('input', event => {
            apply(Number(event.target.value));
            panel.querySelector('.' + cls + '-value').textContent = show(Number(event.target.value));
        });
        bindRange('rr-build-tradius', v => { terrain.radius = v; }, v => v);
        bindRange('rr-build-tstrength', v => { terrain.strength = v; }, v => v);
        // The look's sliders edit the selected sheet as they move (one undo step a drag), else only the look in hand.
        const lookRange = (cls, key) => {
            bindRange(cls, v => { if (terrain.editLook) terrain.editLook({ [key]: v }, 'live'); else terrain.waterLook[key] = v; }, v => Math.round(v * 100) + '%');
            panel.querySelector('.' + cls)?.addEventListener('change', () => terrain.editLook?.({}, 'commit'));
        };
        lookRange('rr-build-treflect', 'reflect');
        lookRange('rr-build-tgloss', 'gloss');
        lookRange('rr-build-tclear', 'clear');
        lookRange('rr-build-twaves', 'waves');
        lookRange('rr-build-tglow', 'glow');
        // A colour from the popup: live as it moves, kept a moment after the last change.
        const colourInput = key => hex => {
            if (terrain.editLook) terrain.editLook({ [key]: hex }, 'live'); else terrain.waterLook[key] = hex;
            clearTimeout(this._lookCommit);
            this._lookCommit = setTimeout(() => terrain.editLook?.({}, 'commit'), 450);
        };
        const colour = panel.querySelector('.rr-build-tcolour');
        if (colour && colour.tagName === 'BUTTON') RRColorPopup.bind(colour, colourInput('colour'));
        else colour?.addEventListener('input', event => colourInput('colour')(event.target.value));
        const tint = panel.querySelector('.rr-build-ttint');
        if (tint && tint.tagName === 'BUTTON') RRColorPopup.bind(tint, colourInput('tint'));
        else tint?.addEventListener('input', event => colourInput('tint')(event.target.value));
        panel.querySelectorAll('.rr-build-look').forEach(el => el.addEventListener('click', () => {
            const preset = TerrainManager.WATER_LOOKS[el.dataset.preset];
            if (terrain.editLook) terrain.editLook(Object.assign({}, preset), 'commit'); else Object.assign(terrain.waterLook, preset);
            this.renderTerrainPanel();
        }));
        panel.querySelector('.rr-build-tundo').addEventListener('click', () => { terrain.undo(); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-tredo').addEventListener('click', () => { terrain.redo(); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-tclear')?.addEventListener('click', () => { terrain.clear(); this.renderTerrainPanel(); });
    }

    /** The manager changed: the bar and the panel follow. */
    sync() {
        if (!this.visible || !this.root) return;
        if (this.group() !== 'build') {
            // Terrain and Models: redraw when the slot in hand or the models on offer change.
            const shown = this.root.querySelector('.rr-build-slot[aria-pressed="true"]')?.dataset.slot;
            const groupShown = this.root.querySelector('.rr-build-group[aria-checked="true"]')?.dataset.group;
            if (shown !== this.activeSlot() || groupShown !== this.group() || this._slotsKey !== this.slots().join('|')) this.render();
            return;
        }
        const active = this.activeSlot();
        const wasActive = this.root.querySelector('.rr-build-slot[aria-pressed="true"]')?.dataset.slot;
        if (wasActive !== active) { this.render(); return; }
        const manager = this.manager();
        const level = this.root.querySelector('.rr-build-level');
        if (level) level.textContent = String(manager.level);
        // A selection change or a live drag redraws the panel, without stealing a field being typed in.
        if (document.activeElement && this.panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
        const piece = manager.selectedPiece?.();
        const shape = JSON.stringify([manager.selected, manager.selectedIds, manager.mode, manager.kind, manager.material, manager.rot, manager.gizmoMode, piece && piece.kind, piece && piece.material, piece && piece.rot]);
        const key = shape + JSON.stringify(piece || null);
        if (key === this._panelKey) return;
        // The same piece moved, turned or sized (a handle drag): the numbers follow in place.
        // Rebuilding the whole panel on every pointer move made the drag stutter.
        if (shape === this._panelShape && piece && this.refreshPanelValues(piece)) { this._panelKey = key; return; }
        this._panelKey = key; this._panelShape = shape;
        this.renderPanel();
    }

    /** Put a placed shape's place, turns and size into the panel's fields; false when the panel has none to take them. */
    refreshPanelValues(piece) {
        const panel = this.panel;
        if (!panel || !panel.querySelector('.rr-build-pos, .rr-build-size')) return false;
        const round = n => Math.round(n * 100) / 100;
        const values = {
            'rr-build-pos': { x: round(piece.x + 0.5 + (piece.offset ? piece.offset[0] || 0 : 0)), y: round(piece.y + 0.5 + (piece.offset ? piece.offset[1] || 0 : 0)), z: piece.z },
            'rr-build-turn': { angle: piece.angle || 0, tilt: piece.tilt || 0, roll: piece.roll || 0 },
            'rr-build-size': { 0: (piece.size || [])[0], 1: (piece.size || [])[1], 2: (piece.size || [])[2] }
        };
        for (const [cls, byKey] of Object.entries(values)) {
            for (const input of panel.querySelectorAll(`input.${cls}, input.rr-build-slider[data-for="${cls}"]`)) {
                const value = byKey[input.dataset.key];
                if (value === undefined || input === document.activeElement) continue;
                if (input.type === 'range') { if (value > Number(input.max)) input.max = Math.ceil(value); if (value < Number(input.min)) input.min = Math.floor(value); }
                input.value = value;
            }
        }
        return true;
    }

    /** A line that shows for a moment over the bar: why a click did nothing, what just happened. */
    flash(text) {
        if (!this.root || !this.visible) return;
        let note = this.root.querySelector('.rr-build-flash');
        if (!note) { note = document.createElement('div'); note.className = 'rr-build-flash'; this.root.prepend(note); }
        note.textContent = text;
        note.classList.add('is-shown');
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => note.classList.remove('is-shown'), 2400);
    }

    /** Number keys pick slots. */
    handleKey(event) {
        if (!this.visible) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (target?.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
        if (window.reactor?.uiManager?.isEditorModalOpenForGlobalShortcuts?.()) return;
        if (/^[0-9]$/.test(event.key)) {
            const index = event.key === '0' ? 9 : Number(event.key) - 1;
            const slots = this.slots();
            if (slots[index]) { event.preventDefault(); event.stopPropagation(); this.pick(slots[index]); }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = BuildHotbar;
