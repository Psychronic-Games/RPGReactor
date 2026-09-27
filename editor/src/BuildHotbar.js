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
 * The bar has two groups, switched at its left end: Build (the above) and
 * Terrain (the ground's brushes and the water: raise, lower, smooth,
 * flatten, pour, drain, and a sheet's look), whose model is the
 * TerrainManager. The panel shows the settings of whichever is in hand.
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
    /** The kinds whose facing matters: they climb, slope, open or run one way. */
    /** The longest stair run or ladder: as high as a piece may stand. */
    static get MAX_RUN() { return (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_MAX_LEVEL) || 240; }
    static FACING = ['stair', 'ladder', 'ramp', 'doorway', 'window', 'fence', 'roof', 'glass'];

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    _tt(text) { return window.I18n ? window.I18n.tText(text) : text; }
    manager() { return this.projectController?.pieceBuilderManager || window.reactor?.pieceBuilderManager || null; }
    terrain() { return this.projectController?.terrainManager || window.reactor?.terrainManager || null; }
    /** Which group the bar shows: Terrain while the terrain tool holds the map. */
    group() { return window.reactor?.mapTool === 'terrain' ? 'terrain' : 'build'; }
    slots() { return this.group() === 'terrain' ? BuildHotbar.TERRAIN : BuildHotbar.SLOTS; }
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
        this.visible = true;
        this.root.style.display = 'flex';
        this.panel.style.display = 'flex';
        manager.activate();
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
        const docked = this.docked();
        if (docked) return docked;
        if (manager.mode === 'select') return 'select';
        if (manager.mode === 'erase') return 'hammer';
        if (manager.mode === 'stamp' || manager.mode === 'move') return 'blueprint';
        if (manager.kind === 'wedge') return 'ramp';
        return BuildHotbar.PIECES.includes(manager.kind) ? manager.kind : 'shape';
    }

    /** Pick a slot: pieces place, the hammer erases, Select picks up, the rest open their specs. */
    pick(slot) {
        const manager = this.manager();
        if (!manager) return;
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
        if (this.group() === 'terrain') manager.activate();
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
            terrain: 'M2 19l6-9 4 5 3-3 7 7z'
        };
        const path = own[name] || M[name] || '';
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    label(slot) {
        if (BuildHotbar.PIECES.includes(slot)) return this._t('pieces.kind.' + slot);
        if (BuildHotbar.TERRAIN.includes(slot)) return this._t({ pour: 'terrain.waterPour', drain: 'terrain.drain', look: 'terrain.lookShort' }[slot] || 'terrain.' + slot);
        return this._t('build.' + slot);
    }

    render() {
        const root = this.root, manager = this.manager();
        if (!root || !manager) return;
        const active = this.activeSlot();
        const terrain = this.group() === 'terrain';
        const slots = this.slots();
        const button = (slot, index) => `<button type="button" class="rr-build-slot" data-slot="${slot}" aria-pressed="${slot === active}" title="${this.label(slot)}${index < 10 ? ' (' + ((index + 1) % 10) + ')' : ''}">
            ${this.icon(slot === 'shape' && active === 'shape' ? manager.kind : slot)}<span class="rr-build-slot-label">${this.label(slot)}</span>${index < 10 ? `<span class="rr-build-slot-key">${(index + 1) % 10}</span>` : ''}</button>`;
        root.innerHTML = `
            ${this.is3D() ? '' : `<div class="rr-build-note">${this._t('build.needs3D')}</div>`}
            <div class="rr-build-row rr-build-slots">
                <div class="rr-build-groups" role="radiogroup">${['build', 'terrain'].map(g => `<button type="button" class="rr-build-group" data-group="${g}" role="radio" aria-checked="${(g === 'terrain') === terrain}" title="${this._t('build.group.' + g)}">${this.icon(g, 18)}<span>${this._t('build.group.' + g)}</span></button>`).join('')}</div>
                ${slots.map(button).join('')}</div>
            <div class="rr-build-hint">${terrain ? this._t('terrain.keys') : `${this._t('build.level')} <b class="rr-build-level">${manager.level}</b> · ${this._t('build.keys')}`}</div>`;
        root.querySelectorAll('.rr-build-slot').forEach(el => el.addEventListener('click', () => this.pick(el.dataset.slot)));
        root.querySelectorAll('.rr-build-group').forEach(el => el.addEventListener('click', () => {
            if ((el.dataset.group === 'terrain') === terrain) return;
            this.pick(el.dataset.group === 'terrain' ? (this._lastTerrain || 'raise') : (this._lastBuild || 'select'));
        }));
        if (this.panel && this.visible) this.panel.style.display = this.docked() ? 'none' : 'flex';
        this.renderPanel();
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
        if (this.group() === 'terrain') { this.renderTerrainPanel(); return; }
        const s = this.subject();
        const tt = text => this._tt(text);
        // The dock's convention (Lighting, Media Surfaces): a card per group, its header on an accent strip.
        const section = (title, body) => body ? `<div class="lit-section rr-build-section"><div class="lit-section-header">${title}</div><div class="lit-section-body">${body}</div></div>` : '';
        let foot = '';
        const num = (cls, label, value, min, max, step, key) => `<label class="rr-build-field"><span>${label}</span><input type="number" class="database-field-value ${cls}" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
        const swatches = current => `<div class="rr-build-swatches"><button type="button" class="rr-build-swatch rr-build-material" data-material="" aria-pressed="${!current}" title="${this._t('pieces.plain')}"><span class="rr-build-swatch-plain"></span></button>`
            + manager.materials().map(entry => `<button type="button" class="rr-build-swatch rr-build-material" data-material="${entry.name}" aria-pressed="${current === entry.name}" title="${entry.name}" style="background-image:url('${entry.url}');"></button>`).join('') + '</div>';
        const facing = rot => `<div class="rr-build-facing">${[[2, '↑'], [3, '→'], [0, '↓'], [1, '←']].map(([r, arrow]) => `<button type="button" class="rr-build-chip rr-build-rot" data-rot="${r}" aria-pressed="${r === rot}">${arrow}</button>`).join('')}<span class="rr-build-note">R</span></div>`;
        let head, body = '';
        if (s.kind === 'many') {
            head = this._t('build.selectedMany', { count: s.count });
            body = section(this._t('pieces.material'), swatches(null))
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
            if (kind === 'stair' && !s.placed) body += section(tt('Size'), num('rr-build-steps', this._t('build.steps'), manager.stairSteps, 1, BuildHotbar.MAX_RUN, 1, 'steps')
                + num('rr-build-stairwidth', this._t('build.stairWidth'), manager.stairWidth, 1, 20, 1, 'width'));
            // A ladder's height, in hand or placed: a placed one grows or shrinks from its foot.
            if (kind === 'ladder') body += section(tt('Size'), num('rr-build-ladderheight', tt('Height'), piece ? manager.ladderStack(piece).length : manager.ladderHeight, 1, BuildHotbar.MAX_RUN, 1, 'height'));
            if (s.shape) {
                const size = piece ? piece.size : manager.sizeFor(kind);
                const labels = kind === 'wedge' ? [tt('Width'), tt('Height'), tt('Length')] : [tt('Width'), tt('Height'), tt('Depth')];
                body += section(tt('Size'), [0, 1, 2].map(i => num('rr-build-size', labels[i], size[i], 0.25, 60, 0.25, String(i))).join(''));
                if (piece) {
                    const shapeAt = [piece.x + 0.5 + (piece.offset ? piece.offset[0] || 0 : 0), piece.y + 0.5 + (piece.offset ? piece.offset[1] || 0 : 0)];
                    body += section(this._t('build.handles'), `<div class="rr-build-modes">${['move', 'turn', 'size'].map(m => `<button type="button" class="rr-build-chip rr-build-mode" data-mode="${m}" aria-pressed="${manager.gizmoMode === m}" title="${tt(m === 'move' ? 'Move' : m === 'turn' ? 'Turn' : 'Size')}">${this.icon(m, 18)}<span>${tt(m === 'move' ? 'Move' : m === 'turn' ? 'Turn' : 'Size')}</span></button>`).join('')}</div>`
                        + num('rr-build-pos', 'X', shapeAt[0], 0, 999, 0.25, 'x') + num('rr-build-pos', 'Y', shapeAt[1], 0, 999, 0.25, 'y') + num('rr-build-pos', tt('Up'), piece.z, 0, 120, 0.25, 'z')
                        + num('rr-build-turn', tt('Turn'), piece.angle || 0, 0, 359, 5, 'angle') + num('rr-build-turn', tt('Tilt'), piece.tilt || 0, 0, 359, 5, 'tilt') + num('rr-build-turn', tt('Roll'), piece.roll || 0, 0, 359, 5, 'roll'));
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
        panel.querySelectorAll('.rr-build-material').forEach(el => el.addEventListener('click', () => edit({ material: el.dataset.material }, () => manager.setMaterial(el.dataset.material))));
        panel.querySelectorAll('.rr-build-rot').forEach(el => el.addEventListener('click', () => { const r = Number(el.dataset.rot); edit(s.shape ? { angle: r * 90 } : { rot: r }, () => { manager.rot = r; manager._syncPanel(); manager._ghostChanged(); }); }));
        panel.querySelectorAll('.rr-build-size').forEach(el => el.addEventListener('change', () => {
            const i = Number(el.dataset.key), v = Number(el.value);
            if (!Number.isFinite(v) || v <= 0) { this.renderPanel(); return; }
            const size = (placed ? s.piece.size : manager.sizeFor(s.kind)).slice(); size[i] = Math.max(0.25, Math.min(60, Math.round(v * 4) / 4));
            edit({ size }, () => manager.setSize(s.kind, size));
        }));
        panel.querySelectorAll('.rr-build-pos').forEach(el => el.addEventListener('change', () => {
            const v = Number(el.value); if (!Number.isFinite(v) || !placed) { this.renderPanel(); return; }
            const cx = s.piece.x + 0.5 + (s.piece.offset ? s.piece.offset[0] || 0 : 0), cy = s.piece.y + 0.5 + (s.piece.offset ? s.piece.offset[1] || 0 : 0);
            if (el.dataset.key === 'z') manager.updateSelected({ z: Math.max(0, Math.round(v * 4) / 4) }); else manager.moveSelectedPieceTo(el.dataset.key === 'x' ? v : cx, el.dataset.key === 'y' ? v : cy);
            this.renderPanel();
        }));
        panel.querySelectorAll('.rr-build-turn').forEach(el => el.addEventListener('change', () => { const v = ((Math.round(Number(el.value)) || 0) % 360 + 360) % 360; if (placed) manager.updateSelected({ [el.dataset.key]: v }); this.renderPanel(); }));
        panel.querySelectorAll('.rr-build-param').forEach(el => el.addEventListener('change', () => {
            const key = el.dataset.key; let v = Number(el.value); if (!Number.isFinite(v)) { this.renderPanel(); return; }
            if (key === 'taper' || key === 'thick') v = Math.max(0, Math.min(1, Math.round(v) / 100)); else if (key === 'sides') v = Math.max(3, Math.min(32, Math.round(v))); else v = Math.max(15, Math.min(360, Math.round(v)));
            edit({ [key]: v }, () => { manager.params = manager.params || {}; manager.params[s.kind] = Object.assign({}, manager.params[s.kind], { [key]: v }); manager._ghostChanged(); });
        }));
        panel.querySelector('.rr-build-steps')?.addEventListener('change', event => { manager.stairSteps = Math.max(1, Math.min(BuildHotbar.MAX_RUN, Math.round(Number(event.target.value)) || 1)); this.renderPanel(); });
        panel.querySelector('.rr-build-ladderheight')?.addEventListener('change', event => {
            const height = Math.max(1, Math.min(BuildHotbar.MAX_RUN, Math.round(Number(event.target.value)) || 1));
            if (s.piece) manager.setLadderHeight(s.piece, height); else manager.ladderHeight = height;
            this.renderPanel();
        });
        panel.querySelector('.rr-build-stairwidth')?.addEventListener('change', event => { manager.stairWidth = Math.max(1, Math.min(20, Math.round(Number(event.target.value)) || 1)); this.renderPanel(); });
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
            const same = preset => ['reflect', 'gloss', 'tint'].every(key => preset[key] === look[key]);
            body = section(t('terrain.waterLook'), `<div class="rr-build-modes">${['water', 'mercury', 'plain'].map(p => `<button type="button" class="rr-build-chip rr-build-look" data-preset="${p}" aria-pressed="${same(TerrainManager.WATER_LOOKS[p])}"><span>${t('terrain.look.' + p)}</span></button>`).join('')}</div>`
                + range('rr-build-treflect', t('terrain.look.reflect'), look.reflect, 0, 1, 0.01, Math.round(look.reflect * 100) + '%')
                + range('rr-build-tgloss', t('terrain.look.gloss'), look.gloss, 0, 1, 0.01, Math.round(look.gloss * 100) + '%')
                + `<label class="rr-build-range"><span>${t('terrain.look.tint')}</span><input type="color" class="rr-build-ttint" value="${look.tint}"></label>`) + note('terrain.look.hint');
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
        bindRange('rr-build-treflect', v => { terrain.waterLook.reflect = v; }, v => Math.round(v * 100) + '%');
        bindRange('rr-build-tgloss', v => { terrain.waterLook.gloss = v; }, v => Math.round(v * 100) + '%');
        panel.querySelector('.rr-build-ttint')?.addEventListener('input', event => { terrain.waterLook.tint = event.target.value; });
        panel.querySelectorAll('.rr-build-look').forEach(el => el.addEventListener('click', () => {
            Object.assign(terrain.waterLook, TerrainManager.WATER_LOOKS[el.dataset.preset]);
            this.renderTerrainPanel();
        }));
        panel.querySelector('.rr-build-tundo').addEventListener('click', () => { terrain.undo(); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-tredo').addEventListener('click', () => { terrain.redo(); this.renderTerrainPanel(); });
        panel.querySelector('.rr-build-tclear')?.addEventListener('click', () => { terrain.clear(); this.renderTerrainPanel(); });
    }

    /** The manager changed: the bar and the panel follow. */
    sync() {
        if (!this.visible || !this.root) return;
        if (this.group() === 'terrain') {
            const shown = this.root.querySelector('.rr-build-slot[aria-pressed="true"]')?.dataset.slot;
            if (shown !== this.activeSlot()) this.render();
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
        const key = JSON.stringify([manager.selected, manager.selectedIds, manager.mode, manager.kind, manager.material, manager.rot, manager.gizmoMode, manager.selectedPiece?.()]);
        if (key !== this._panelKey) { this._panelKey = key; this.renderPanel(); }
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
