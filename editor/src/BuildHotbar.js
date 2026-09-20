/**
 * BuildHotbar - building in the world, the way a survival game does it.
 *
 * A bar along the bottom of the 3D view: one slot per thing you can put
 * down (floor, wall, doorway, window, glass, stairs, ramp, roof, pillar,
 * fence, block, a shape, a screen, a light), a hammer that takes things
 * away, and a blueprint slot that stamps a saved building. Above the bar a
 * row for the chosen slot: material swatches for a piece, the shape grid
 * for a shape, the movies and pictures for a screen, colours for a light,
 * the saved buildings for a blueprint. Number keys pick slots, R turns,
 * Q and E move the level, right-click removes, Ctrl-drag lays a box,
 * Ctrl+Z undoes.
 *
 * The PieceBuilderManager stays the model (kind, mode, material, level,
 * strokes, undo); this is its face. Its old sidebar panel is gone.
 */
class BuildHotbar {
    constructor(projectController) {
        this.projectController = projectController;
        this.root = null;
        this.visible = false;
        this._onKeyDown = event => this.handleKey(event);
    }

    static PIECES = ['floor', 'wall', 'doorway', 'window', 'glass', 'stairs', 'ramp', 'roof', 'pillar', 'fence', 'block'];
    static EXTRA = ['shape', 'screen', 'light', 'hammer', 'blueprint'];
    static LIGHT_COLOURS = ['#ffffff', '#fff3d2', '#9fd8ff', '#ffb787', '#ff6b5a', '#7dff9a', '#c48bff', '#ffe36e'];

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    manager() { return this.projectController?.pieceBuilderManager || window.reactor?.pieceBuilderManager || null; }
    editor3D() { return this.projectController?.mapEditor3D || window.reactor?.mapEditor3D || null; }
    currentMap() { return this.projectController?.getTilemapManager?.()?.currentMap || null; }
    is3D() { const map = this.currentMap(); const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null; return !!(map && E && E.hasNote(map)); }

    /** The bar lives over the map canvas; it is made once and shown when building. */
    mount(container) {
        if (this.root || !container) return;
        this.root = document.createElement('div');
        this.root.id = 'build-hotbar';
        this.root.className = 'rr-build-hotbar';
        this.root.style.display = 'none';
        container.appendChild(this.root);
        this.render();
    }

    show() {
        const manager = this.manager();
        if (!this.root || !manager) return;
        this.visible = true;
        this.root.style.display = 'flex';
        manager.activate();
        // The hint under the 3D view says orbit and paint; the bar says the rest.
        document.addEventListener('keydown', this._onKeyDown, true);
        this.render();
        const toggle = document.getElementById('map-build');
        if (toggle && !toggle.checked) toggle.checked = true;
    }

    hide(release = true) {
        if (!this.root) return;
        this.visible = false;
        this.root.style.display = 'none';
        document.removeEventListener('keydown', this._onKeyDown, true);
        if (release) this.manager()?.deactivate();
        const toggle = document.getElementById('map-build');
        if (toggle && toggle.checked) toggle.checked = false;
    }

    toggle(on) { if (on === undefined ? !this.visible : on) this.show(); else this.hide(); }

    /** The slot the manager's state names. */
    activeSlot() {
        const manager = this.manager();
        if (!manager) return 'wall';
        if (manager.mode === 'erase') return 'hammer';
        if (manager.mode === 'stamp' || manager.mode === 'move') return 'blueprint';
        if (manager.mode === 'screen') return 'screen';
        if (manager.mode === 'light') return 'light';
        return BuildHotbar.PIECES.includes(manager.kind) ? manager.kind : 'shape';
    }

    /** Pick a slot: pieces place, the hammer erases, the rest open their row. */
    pick(slot) {
        const manager = this.manager();
        if (!manager) return;
        if (BuildHotbar.PIECES.includes(slot)) manager.setKind(slot);
        else if (slot === 'hammer') manager.setMode('erase');
        else if (slot === 'screen') manager.setMode('screen');
        else if (slot === 'light') manager.setMode('light');
        else if (slot === 'shape') { const kinds = this.shapeKinds(); if (!kinds.includes(manager.kind)) manager.setKind(manager.lastShape || kinds[0]); else manager.setMode('place'); }
        else if (slot === 'blueprint') { const plans = manager.structures(true); if (plans.length) { if (!manager.structure) manager.structure = plans[0].file; manager.setMode('stamp'); } }
        this.render();
    }

    shapeKinds() { return typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor.SHAPE_KINDS : (this.manager()?.kinds() || []).filter(k => !BuildHotbar.PIECES.includes(k)); }

    icon(name) {
        const M = typeof PieceBuilderManager !== 'undefined' ? PieceBuilderManager.ICONS : {};
        if (M[name]) return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${M[name]}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        const own = {
            shape: 'M4 17a8 8 0 0 1 16 0 M4 17h16v3H4z',
            screen: 'M3 5h18v11H3z M9 20h6 M10 9l5 2.5-5 2.5z',
            light: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
            hammer: 'M14 4l6 6-3 3-6-6z M11 7l-8 8 3 3 8-8 M13 5l2-2',
            blueprint: 'M4 4h16v16H4z M8 8h8v8H8z M12 4v4M4 12h4M12 16v4M16 12h4'
        };
        return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${own[name] || ''}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    label(slot) {
        if (BuildHotbar.PIECES.includes(slot)) return this._t('pieces.kind.' + slot);
        return this._t('build.' + slot);
    }

    render() {
        const root = this.root, manager = this.manager();
        if (!root || !manager) return;
        const active = this.activeSlot();
        const slots = BuildHotbar.PIECES.concat(BuildHotbar.EXTRA);
        const button = (slot, index) => `<button type="button" class="rr-build-slot" data-slot="${slot}" aria-pressed="${slot === active}" title="${this.label(slot)}${index < 10 ? ' (' + ((index + 1) % 10) + ')' : ''}">
            ${this.icon(slot === 'shape' && !BuildHotbar.PIECES.includes(manager.kind) && manager.mode === 'place' ? manager.kind : slot)}<span class="rr-build-slot-label">${this.label(slot)}</span>${index < 10 ? `<span class="rr-build-slot-key">${(index + 1) % 10}</span>` : ''}</button>`;
        root.innerHTML = `
            ${this.is3D() ? '' : `<div class="rr-build-note">${this._t('build.needs3D')}</div>`}
            <div class="rr-build-row rr-build-context">${this.contextRow(active)}</div>
            <div class="rr-build-row rr-build-slots">${slots.map(button).join('')}</div>
            <div class="rr-build-hint">${this._t('build.level')} <b class="rr-build-level">${manager.level}</b> · ${this._t('build.keys')}</div>`;
        root.querySelectorAll('.rr-build-slot').forEach(el => el.addEventListener('click', () => this.pick(el.dataset.slot)));
        this.bindContext(active);
    }

    /** The row above the bar: what the chosen slot needs, and nothing else. */
    contextRow(active) {
        const manager = this.manager();
        if (active === 'hammer') return `<span class="rr-build-note">${this._t('build.hammerHint')}</span>`;
        if (active === 'shape') {
            return this.shapeKinds().map(kind => `<button type="button" class="rr-build-chip rr-build-shape" data-kind="${kind}" aria-pressed="${manager.kind === kind && manager.mode === 'place'}" title="${this._t('pieces.kind.' + kind)}">${this.icon(kind)}<span>${this._t('pieces.kind.' + kind)}</span></button>`).join('')
                + `<span class="rr-build-note">${this._t('build.shapeSize', { size: manager.shapeScale === 1 ? '1×' : manager.shapeScale + '×' })}</span>`;
        }
        if (active === 'screen') {
            const media = manager.mediaChoices();
            return `<span class="rr-build-note">${this._t('build.shows')}</span>` + (media.length ? media.map(name => `<button type="button" class="rr-build-chip rr-build-media" data-media="${name}" aria-pressed="${manager.screenMedia === name}" title="${name}">${name.replace(/\.[^.]+$/, '')}</button>`).join('') : `<span class="rr-build-note">${this._t('build.noMedia')}</span>`);
        }
        if (active === 'light') {
            return `<span class="rr-build-note">${this._t('build.colour')}</span>` + BuildHotbar.LIGHT_COLOURS.map(c => `<button type="button" class="rr-build-swatch rr-build-colour" data-colour="${c}" aria-pressed="${manager.lightColour === c}" style="background:${c};" title="${c}"></button>`).join('');
        }
        if (active === 'blueprint') {
            const plans = manager.structures(true);
            if (!plans.length) return `<span class="rr-build-note">${this._t('build.noBlueprints')}</span>`;
            return plans.map(plan => `<button type="button" class="rr-build-chip rr-build-plan" data-file="${plan.file}" aria-pressed="${manager.structure === plan.file && manager.mode === 'stamp'}" title="${plan.name}">${plan.name}</button>`).join('')
                + `<span class="rr-build-note">${this._t('build.blueprintHint')}</span>`;
        }
        // A piece: its material.
        const materials = manager.materials();
        const plain = `<button type="button" class="rr-build-swatch rr-build-material" data-material="" aria-pressed="${!manager.material}" title="${this._t('pieces.plain')}"><span class="rr-build-swatch-plain"></span></button>`;
        return `<span class="rr-build-note">${this._t('pieces.material')}</span>` + plain + materials.map(entry => `<button type="button" class="rr-build-swatch rr-build-material" data-material="${entry.name}" aria-pressed="${manager.material === entry.name}" title="${entry.name}" style="background-image:url('${entry.url}');"></button>`).join('');
    }

    bindContext() {
        const root = this.root, manager = this.manager();
        root.querySelectorAll('.rr-build-material').forEach(el => el.addEventListener('click', () => { manager.setMaterial(el.dataset.material); this.render(); }));
        root.querySelectorAll('.rr-build-shape').forEach(el => el.addEventListener('click', () => { manager.lastShape = el.dataset.kind; manager.setKind(el.dataset.kind); this.render(); }));
        root.querySelectorAll('.rr-build-media').forEach(el => el.addEventListener('click', () => { manager.screenMedia = el.dataset.media; this.render(); }));
        root.querySelectorAll('.rr-build-colour').forEach(el => el.addEventListener('click', () => { manager.lightColour = el.dataset.colour; this.render(); }));
        root.querySelectorAll('.rr-build-plan').forEach(el => el.addEventListener('click', () => { manager.structure = el.dataset.file; manager.setMode('stamp'); this.render(); }));
    }

    /** The manager changed: the bar follows. */
    sync() {
        if (!this.visible || !this.root) return;
        const active = this.activeSlot();
        const wasActive = this.root.querySelector('.rr-build-slot[aria-pressed="true"]')?.dataset.slot;
        if (wasActive !== active) { this.render(); return; }
        const manager = this.manager();
        const level = this.root.querySelector('.rr-build-level');
        if (level) level.textContent = String(manager.level);
        this.root.querySelectorAll('.rr-build-material').forEach(el => el.setAttribute('aria-pressed', String((el.dataset.material || '') === (manager.material || ''))));
        this.root.querySelectorAll('.rr-build-shape').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.kind === manager.kind && manager.mode === 'place')));
        const note = this.root.querySelector('.rr-build-context .rr-build-note:last-child');
        if (note && active === 'shape') note.textContent = this._t('build.shapeSize', { size: manager.shapeScale === 1 ? '1×' : manager.shapeScale + '×' });
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

    /** Number keys pick slots; Escape closes the bar. */
    handleKey(event) {
        if (!this.visible) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (target?.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
        if (window.reactor?.uiManager?.isEditorModalOpenForGlobalShortcuts?.()) return;
        const slots = BuildHotbar.PIECES.concat(BuildHotbar.EXTRA);
        if (/^[0-9]$/.test(event.key)) {
            const index = event.key === '0' ? 9 : Number(event.key) - 1;
            if (slots[index]) { event.preventDefault(); event.stopPropagation(); this.pick(slots[index]); }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = BuildHotbar;
