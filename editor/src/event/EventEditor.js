/**
 * EventEditor - Main event editor panel
 * Handles the overall event editing interface
 */
class EventEditor {
    constructor(mapManager, databaseManager, projectController) {
        this.mapManager = mapManager;
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.currentEvent = null;
        this.sourceEvent = null;
        this.cancelBaseline = null;
        this.onCommit = null;
        this.onCancel = null;
        this.currentPageIndex = 0;
        this.pendingModels = [];
        this.pendingModelsBaseline = [];
        this.clipboard = null; // For copy/paste event pages
        this.commandList = new EventCommandList(this); // Command list manager

        if (typeof window !== 'undefined') {
            const redraw = () => {
                const container = document.querySelector('.event-editor-container');
                if (container && this.currentEvent) this.showEventEditor(container, this.currentEvent);
            };
            window.addEventListener('rr-language-changed', redraw);
            // Back from its own window: the same edits, drawn with live handlers.
            window.addEventListener('rr-event-editor-docked', event => {
                if (event.detail && event.detail.windowGone && this.isOpen()) redraw();
            });
        }
    }

    _t(key, params = {}) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key, params) : key;
    }

    /**
     * Show event editor panel
     */
    showEventEditor(container, event, options = null) {
        const sameEvent = this.currentEvent === event && !options;
        if (!sameEvent) {
            this.sourceEvent = event;
            this.cancelBaseline = this._clone(event);
            this.currentEvent = this._clone(event);
            this.onCommit = options?.onCommit || null;
            this.onAfterCommit = options?.onAfterCommit || null;
            this.needsInitialCommit = options?.isNew === true;
            this.pendingZ = this.needsInitialCommit ? 0 : this._eventZ(event.id);
            this.pendingZBaseline = this.pendingZ;
            this.onCancel = options?.onCancel || null;
            this._loadPendingModels(event);
            this._loadPendingSize(event);
        }
        event = this.currentEvent;
        if (!sameEvent) this.currentPageIndex = 0;

        // Ensure event has at least one page
        if (!event.pages || event.pages.length === 0) {
            event.pages = [this.createDefaultPage()];
        }

        // Clear container
        container.innerHTML = '';
        container.className = 'event-editor-container';
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        `;

        // Create header
        const header = this.createHeader(event);
        container.appendChild(header);

        // Create main content area
        const contentArea = document.createElement('div');
        contentArea.className = 'event-editor-content';
        contentArea.style.cssText = `
            display: flex;
            gap: 12px;
            padding: 12px;
            flex: 1;
            overflow: hidden;
            min-height: 0;
        `;

        // Create left column (event page configuration)
        const leftColumn = this.createLeftColumn(event);
        leftColumn.style.flex = '0 0 400px';
        leftColumn.style.minWidth = '400px';
        leftColumn.style.height = '100%';
        contentArea.appendChild(leftColumn);

        // Create right column (event commands/contents)
        const rightColumn = this.createRightColumn(event);
        rightColumn.style.flex = '1';
        rightColumn.style.minWidth = '400px';
        rightColumn.style.height = '100%';
        contentArea.appendChild(rightColumn);

        container.appendChild(contentArea);

        // Render current page
        this.renderCurrentPage();
        this._bindModalChrome();
    }

    _bindModalChrome() {
        const ok = document.getElementById('event-editor-ok-btn');
        const cancel = document.getElementById('event-editor-cancel-btn');
        const apply = document.getElementById('event-editor-apply-btn');
        if (ok) ok.onclick = () => this.saveAndClose();
        // Cancel drops the edits, asking first when there are any (as Escape and the × do).
        if (cancel) cancel.onclick = () => this.requestClose();
        if (apply) apply.onclick = () => this.applyChanges();
    }

    /**
     * Save changes and close editor
     */
    saveAndClose() {
        if (this._commitChanges()) this._hideEditor();
    }

    /**
     * Apply changes without closing
     */
    applyChanges() {
        return this._commitChanges();
    }

    /**
     * Close the editor
     */
    closeEditor() {
        this.cancelChanges();
    }

    cancelChanges() {
        if (this.cancelBaseline) this.currentEvent = this._clone(this.cancelBaseline);
        this.pendingModels = this._clone(this.pendingModelsBaseline);
        this.pendingZ = this.pendingZBaseline;
        this._autoTicket = (this._autoTicket || 0) + 1;
        // Drafts never write the sidecar until committed. Cancelling must not
        // restore an old height/model over a subsequent map edit.
        if (this.onCancel) this.onCancel(this.sourceEvent);
        this._hideEditor();
    }

    /** Whether the window is showing. */
    isOpen() {
        const modal = typeof document !== 'undefined' ? document.getElementById('event-editor-modal') : null;
        return !!modal && modal.style.display !== 'none' && modal.style.display !== '';
    }

    /**
     * Edits not yet applied, judged as Apply would judge them: the event, its height and size
     * fields, its models, or a new event not yet placed.
     */
    hasUncommittedChanges() {
        if (!this.currentEvent || !this.sourceEvent || !this.isOpen()) return false;
        if (this.needsInitialCommit) return true;
        this._readPositionFields();
        const zChanged = (this.pendingZ != null && this.pendingZ !== this._eventZ(this.currentEvent.id))
            || this._sizeState() !== this.pendingSizeBaseline;
        return zChanged
            || JSON.stringify(this.currentEvent) !== JSON.stringify(this.cancelBaseline)
            || JSON.stringify(this.pendingModels) !== JSON.stringify(this.pendingModelsBaseline);
    }

    /**
     * Before the window leaves this event (another event opened, the map changed): unapplied
     * edits are applied, discarded or kept on the person's word. Resolves true when it may leave.
     */
    async resolvePendingChanges({ closing = false } = {}) {
        if (!this.hasUncommittedChanges()) return true;
        const ui = (typeof window !== 'undefined' && window.reactor && window.reactor.uiManager) || this.projectController?.uiManager;
        const name = this.currentEvent.name || `EV${String(this.currentEvent.id).padStart(3, '0')}`;
        const decision = ui && ui.promptUnsavedChanges
            ? await ui.promptUnsavedChanges(name, { saveLabel: this._t('common.apply') })
            : 'cancel';
        if (decision === 'save') return this.applyChanges();
        if (decision === 'discard') {
            // Leaving for another event keeps the window where it is; closing it closes it.
            if (closing) this.cancelChanges(); else this.leaveEvent();
            return true;
        }
        return false;
    }

    /**
     * Let go of the open event without closing the window, its edits not applied: the next event
     * opens in the same place (the window does not hide, recenter or leave its screen).
     */
    leaveEvent() {
        this._autoTicket = (this._autoTicket || 0) + 1;
        if (this.onCancel) this.onCancel(this.sourceEvent);
        this.pageEditor?._disposeModelPreview?.();
        this.pageEditor = null;
        this.currentPageIndex = 0;
    }

    /** Escape and the window's ×: it closes, asking first about edits not yet applied. */
    async requestClose() {
        if (!this.isOpen()) return false;
        // A field still being typed in takes its value first (its change comes on blur), so Escape asks about it.
        const overlay = typeof document !== 'undefined' ? document.getElementById('event-editor-modal') : null;
        const active = overlay && overlay.ownerDocument && overlay.ownerDocument.activeElement;
        if (active && active !== overlay && overlay.contains(active) && typeof active.blur === 'function') active.blur();
        if (!await this.resolvePendingChanges({ closing: true })) return false;
        if (this.isOpen()) this.cancelChanges();
        return true;
    }

    /** The map is about to change: the window closes, asking first about unapplied edits. */
    async closeForMapChange({ ask = true } = {}) {
        if (!this.isOpen()) return true;
        if (ask && !await this.resolvePendingChanges({ closing: true })) return false;
        if (this.isOpen()) this.cancelChanges();
        return true;
    }

    /** The open event was moved on the map behind the window: its place there is the one shown. */
    followMapMove(event) {
        if (!event || event !== this.sourceEvent || !this.isOpen()) return;
        for (const target of [this.currentEvent, this.cancelBaseline]) {
            if (target) { target.x = event.x; target.y = event.y; }
        }
        for (const [id, value] of [['event-position-x', event.x], ['event-position-y', event.y]]) {
            const field = document.getElementById(id);
            if (field) field.value = String(value);
        }
    }

    _hideEditor() {
        const modal = document.getElementById('event-editor-modal');
        // Popped out, its window hides with it and keeps its screen for the next event.
        if (typeof RREventEditorWindow !== 'undefined' && RREventEditorWindow.isPoppedOut()) RREventEditorWindow.hidePopout();
        if (modal) {
            modal.style.display = 'none';
        }
        // The event it held is no longer outlined on the map.
        this.mapManager?.updateEditingHighlight?.();
        this.pageEditor?._disposeModelPreview?.();
        this.pageEditor = null;
        // Cancel may have taken pages back: nothing keeps pointing at one of them.
        this.currentPageIndex = 0;
    }

    _currentMap() {
        const controller = this.projectController;
        const tilemap = controller && (controller.getTilemapManager
            ? controller.getTilemapManager()
            : controller.tilemapManager);
        return (tilemap && tilemap.currentMap)
            || (this.mapManager && this.mapManager.currentMap)
            || null;
    }

    _storedModelSpec(eventId, pageIndex) {
        const map = this._currentMap();
        if (typeof Reactor3D !== 'undefined' && Reactor3D.eventModelSpec) {
            const spec = Reactor3D.eventModelSpec(map, eventId, pageIndex);
            if (!spec) return null;
            return {
                name: spec.name,
                file: spec.file || '',
                ext: spec.ext || '',
                size: spec.size,
                scale: spec.scale,
                yaw: Math.round(spec.yaw * 180 / Math.PI),
                pitch: Math.round((spec.pitch || 0) * 180 / Math.PI),
                roll: Math.round((spec.roll || 0) * 180 / Math.PI),
                faces: spec.faces ? JSON.parse(JSON.stringify(spec.faces)) : {},
                texture: spec.texture || '',
                ...(spec.variant ? { variant: spec.variant } : {}),
                ...(spec.offset && spec.offset.some(v => v) ? { offset: Array.from(spec.offset) } : {})
            };
        }
        const raw = map && map.reactor3d && map.reactor3d.events
            && map.reactor3d.events[String(eventId)];
        const spec = raw && (raw[String(pageIndex == null ? 0 : pageIndex)] || raw[pageIndex]);
        if (!spec || !spec.name) return null;
        return {
            name: spec.name,
            file: spec.file || '',
            ext: spec.ext || '',
            size: spec.size || 2,
            scale: spec.scale || 1,
            yaw: Number(spec.yaw) || 0,
            pitch: Number(spec.pitch) || 0,
            roll: Number(spec.roll) || 0,
            faces: spec.faces ? JSON.parse(JSON.stringify(spec.faces)) : {},
            texture: spec.texture || '',
            ...(typeof spec.variant === 'string' && spec.variant.trim() ? { variant: spec.variant.trim() } : {}),
            ...(Array.isArray(spec.offset) && spec.offset.some(v => Number(v)) ? { offset: spec.offset.slice(0, 3).map(v => Number(v) || 0) } : {})
        };
    }

    _loadPendingModels(event) {
        const pages = (event && event.pages) || [];
        this.pendingModels = pages.map((_, index) => this.needsInitialCommit ? null : this._storedModelSpec(event && event.id, index));
        this.pendingModelsBaseline = this._clone(this.pendingModels);
    }

    /** The event's height above the ground, from the sidecar. */
    _eventZ(eventId) {
        const map = this._currentMap();
        return map && typeof Reactor3D !== 'undefined' && Reactor3D.eventZAt ? Reactor3D.eventZAt(map, eventId) : 0;
    }

    /** The event's footprint in tiles, from the sidecar. */
    _eventSize(eventId) {
        const map = this._currentMap(), E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null;
        return map && E && E.eventSize ? E.eventSize(map, eventId) : [1, 1];
    }

    /**
     * The size as the draft holds it: `pendingSize` set by hand, or `pendingAuto` with
     * `pendingAutoRect` (`[w, h, ox, oy]`) measured from the event's model. Auto is on for an event
     * that stands as a model and has no size of its own.
     */
    _loadPendingSize(event) {
        const map = this._currentMap(), E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null;
        const own = !this.needsInitialCommit && map && E && E.eventSizeEntry ? E.eventSizeEntry(map, event.id) : null;
        this.pendingSize = own || [1, 1];
        this.pendingAuto = !own && !!this._sizeModel();
        this.pendingAutoRect = !this.needsInitialCommit && map && E && E.eventSizeAuto ? E.eventSizeAuto(map, event.id) : null;
        this._autoChosen = false;
        this.pendingSizeBaseline = this._sizeState();
        if (this.pendingAuto) this.refreshAutoSize();
    }

    _sizeState() {
        return JSON.stringify(this.pendingAuto ? ['auto', this.pendingAutoRect] : ['own', this.pendingSize]);
    }

    /**
     * The model the event stands as: its first page that has one, with the way that page faces. An event with
     * the Vehicle field whose first page shows no picture wears its vehicle's model (as both map views and the
     * game draw it), so that model is the one Auto measures.
     */
    _sizeModel() {
        return EventEditor.sizeModelOf(this.currentEvent, index => this.pendingModels && this.pendingModels[index],
            this.databaseManager && this.databaseManager.data && this.databaseManager.data.vehicles);
    }

    /** `_sizeModel` for any event: `modelAt(page)` is the model a page stands as; `vehicles` the Database's. */
    static sizeModelOf(event, modelAt, vehicles) {
        const pages = (event && event.pages) || [];
        for (let index = 0; index < pages.length; index++) {
            const spec = modelAt(index);
            if (spec && spec.name) return { spec, direction: (pages[index] && pages[index].image && pages[index].image.direction) || 2 };
        }
        const image = pages[0] && pages[0].image;
        if (event && event.rrVehicle && typeof RRVehicles !== 'undefined' && RRVehicles.modelOf
            && !(image && image.characterName) && !(image && image.tileId > 0)) {
            const spec = RRVehicles.modelOf(event, vehicles);
            if (spec && spec.name) return { spec, direction: (image && image.direction) || 2, vehicle: true };
        }
        return null;
    }

    /** The footprint `[w, h, ox, oy]` a model (sizeModelOf) covers, from its read template; null when it cannot be measured. */
    static measureAutoRect(template, model) {
        if (!template || !model || typeof Reactor3D === 'undefined' || !Reactor3D.blockedTilesFor || !Reactor3D.normalizeModelSpec || typeof RRMapElevation === 'undefined') return null;
        const spec = Reactor3D.normalizeModelSpec(model.spec);
        if (!spec) return null;
        // A vehicle is turned so its model's front leads, as the game turns it.
        const front = model.vehicle ? EventEditor.vehicleFront(template.userData.reactorSidecar) : null;
        if (front) spec.faces = Object.assign({}, spec.faces || null, { front });
        return RRMapElevation.footprintOfTiles(Reactor3D.blockedTilesFor(template, template.userData.reactorSidecar, spec, model.direction, 0, 0), 0, 0);
    }

    /**
     * The front a vehicle's model file names (`model.json` › `vehicle.forward`: "+x", "-x", "+z", "-z" or a
     * vector), which the game turns to the way the vehicle faces (reactor_vehicles.js `forwardOf`); null for none.
     */
    static vehicleFront(sidecar) {
        const value = sidecar && sidecar.vehicle && sidecar.vehicle.forward;
        if (typeof value === 'string') return { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] }[value.trim().toLowerCase()] || null;
        if (Array.isArray(value) && value.length >= 3) {
            const x = Number(value[0]), z = Number(value[2]), length = Math.hypot(x, z);
            return length > 1e-6 ? [x / length, 0, z / length] : null;
        }
        return null;
    }

    /**
     * Measure the model's footprint again (its model, model size or facing changed): the tiles its
     * body covers, by the rule the game walks against. A model that has just been given to an event
     * with no size of its own turns Auto on; one taken away turns it off. While the model is still
     * loading the last numbers stay.
     */
    refreshAutoSize() {
        const model = this._sizeModel();
        if (!model) { this.pendingAuto = false; this._showSize(); return; }
        if (!this._autoChosen && !this.pendingAuto && this.pendingSize[0] === 1 && this.pendingSize[1] === 1) this.pendingAuto = true;
        this._showSize();
        if (!this.pendingAuto || typeof RREventPreviewModels === 'undefined' || typeof RRMapElevation === 'undefined') return;
        const controller = this.projectController;
        const project = controller && (controller.getCurrentProject ? controller.getCurrentProject() : controller.currentProject);
        const event = this.currentEvent, ticket = this._autoTicket = (this._autoTicket || 0) + 1;
        Promise.resolve(RREventPreviewModels.templateFor(project, model.spec, controller && controller.mapEditor3D)).then(template => {
            if (!template || ticket !== this._autoTicket || event !== this.currentEvent || !this.pendingAuto) return;
            const rect = EventEditor.measureAutoRect(template, model);
            if (!rect) return;
            this.pendingAutoRect = rect;
            this._showSize();
        }).catch(() => {});
    }

    /** The Size fields as the draft stands: the measured numbers, dimmed, while Auto is on. */
    _showSize() {
        const w = document.getElementById('event-size-w'), h = document.getElementById('event-size-h'), auto = document.getElementById('event-size-auto');
        if (!w || !h) return;
        const shown = this.pendingAuto ? (this.pendingAutoRect || [1, 1]) : (this.pendingSize || [1, 1]);
        w.value = shown[0]; h.value = shown[1];
        w.classList.toggle('is-auto', !!this.pendingAuto); h.classList.toggle('is-auto', !!this.pendingAuto);
        if (auto) {
            auto.checked = !!this.pendingAuto;
            const box = auto.closest('.event-size-auto');
            if (box) box.hidden = !this._sizeModel();
        }
    }

    _readPositionFields() {
        const map = this._currentMap();
        const event = this.currentEvent;
        if (!map || !event) return;
        const number = (id, fallback) => {
            const input = document.getElementById(id);
            const value = input ? Number(input.value) : NaN;
            return Number.isFinite(value) ? value : fallback;
        };
        event.x = Math.max(0, Math.min((map.width || 1) - 1, Math.round(number('event-position-x', event.x))));
        event.y = Math.max(0, Math.min((map.height || 1) - 1, Math.round(number('event-position-y', event.y))));
        this.pendingZ = Math.max(0, number('event-position-z', this.pendingZ || 0));
        // With Auto on the fields show what was measured; the size set by hand is read only when it is off.
        const size = this.pendingSize || [1, 1];
        if (!this.pendingAuto) this.pendingSize = [Math.max(1, Math.round(number('event-size-w', size[0]))), Math.max(1, Math.round(number('event-size-h', size[1])))];
    }

    _writePendingModels() {
        const map = this._currentMap();
        const event = this.currentEvent;
        if (!map || !event || event.id == null) return;
        if (typeof Reactor3D !== 'undefined' && Reactor3D.setEventZ && this.pendingZ != null) {
            Reactor3D.setEventZ(map, event.id, this.pendingZ);
        }
        if (this.pendingSize && typeof RRMapElevation !== 'undefined' && RRMapElevation.setEventSize) {
            // Auto: no size of its own (the game takes the model's body), and what was measured for the editor's picture.
            const auto = !!this.pendingAuto && !!this._sizeModel();
            RRMapElevation.setEventSize(map, event.id, auto ? [1, 1] : this.pendingSize);
            if (RRMapElevation.setEventSizeAuto) RRMapElevation.setEventSizeAuto(map, event.id, auto ? this.pendingAutoRect : null);
        }
        if (typeof Reactor3D !== 'undefined' && Reactor3D.setEventModelSpec) {
            const pageCount = (event.pages || []).length;
            const store = map.reactor3d && map.reactor3d.events && map.reactor3d.events[String(event.id)];
            if (store) {
                Object.keys(store).forEach(page => {
                    if (Number(page) >= pageCount) Reactor3D.setEventModelSpec(map, event.id, page, null);
                });
            }
            (this.pendingModels || []).forEach((spec, index) => {
                // A page with no model clears only a model the sidecar holds: a map with no sidecar gains none.
                if ((!spec || !spec.name) && !(store && store[String(index)])) return;
                Reactor3D.setEventModelSpec(map, event.id, index, spec);
            });
            return;
        }
        const key = String(event.id);
        const pages = {};
        (this.pendingModels || []).forEach((spec, index) => {
            if (!spec || !spec.name) return;
            const written = {
                name: spec.name,
                file: spec.file || '',
                ext: spec.ext || '',
                size: Number(spec.size) > 0 ? Number(spec.size) : 2,
                scale: Number(spec.scale) > 0 ? Number(spec.scale) : 1,
                yaw: Number(spec.yaw) || 0,
                pitch: Number(spec.pitch) || 0,
                roll: Number(spec.roll) || 0
            };
            if (spec.faces && typeof spec.faces === 'object' && Object.keys(spec.faces).length) {
                written.faces = spec.faces;
            }
            if (Array.isArray(spec.offset) && spec.offset.some(v => Number(v))) {
                written.offset = spec.offset.slice(0, 3).map(v => Number(v) || 0);
            }
            if (spec.texture) written.texture = String(spec.texture);
            if (typeof spec.variant === 'string' && spec.variant.trim()) written.variant = spec.variant.trim();
            pages[String(index)] = written;
        });
        if (!Object.keys(pages).length) {
            // No model to write: a map with no sidecar gains none.
            const store = map.reactor3d && map.reactor3d.events;
            if (!store || typeof store !== 'object') return;
            delete store[key];
            if (!Object.keys(store).length) delete map.reactor3d.events;
            return;
        }
        if (!map.reactor3d || typeof map.reactor3d !== 'object') {
            map.reactor3d = { version: 1, mode: '3d' };
        }
        if (!map.reactor3d.events || typeof map.reactor3d.events !== 'object') {
            map.reactor3d.events = {};
        }
        map.reactor3d.events[key] = pages;
    }

    _commitChanges() {
        if (!this.currentEvent || !this.sourceEvent) return false;
        this._readPositionFields();
        const zChanged = (this.pendingZ != null && this.pendingZ !== this._eventZ(this.currentEvent.id))
            || this._sizeState() !== this.pendingSizeBaseline;
        const committed = this._clone(this.currentEvent);
        const eventChanged = JSON.stringify(committed) !== JSON.stringify(this.cancelBaseline);
        const modelsChanged = zChanged
            || JSON.stringify(this.pendingModels) !== JSON.stringify(this.pendingModelsBaseline);
        const changed = this.needsInitialCommit || eventChanged || modelsChanged;
        if (changed) {
            if (this.onCommit) {
                if (this.onCommit(this.sourceEvent, committed, { modelsChanged }) === false) return false;
            } else {
                this._replaceObject(this.sourceEvent, committed);
            }
        }
        if (changed) this._writePendingModels();
        this.needsInitialCommit = false;
        this.pendingZBaseline = this.pendingZ;
        this.pendingSizeBaseline = this._sizeState();
        this.pendingModelsBaseline = this._clone(this.pendingModels);
        this.cancelBaseline = this._clone(committed);
        if (changed) this.onAfterCommit?.();
        return true;
    }

    _clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    _replaceObject(target, source) {
        for (const key of Object.keys(target)) delete target[key];
        Object.assign(target, this._clone(source));
    }

    /**
     * The top of the dialog: a band of the event's own fields (each a small
     * label over its controls, every control one height) and, under it, the
     * page strip: the page tabs with the page buttons at its right end.
     * Laid out in css/styles.css (.event-editor-header, .event-page-strip).
     */
    createHeader(event) {
        const top = document.createElement('div');
        top.className = 'event-editor-top';

        // Some of these strings end in a colon and some do not; the band's labels read alike without.
        const label = key => String(this._t(key)).replace(/\s*[:：]\s*$/, '');
        const size = this.pendingAuto ? (this.pendingAutoRect || [1, 1]) : (this.pendingSize || [1, 1]);
        const sizeHint = rrEscapeHtml(this._t('event.sizeHint'));
        const autoWord = rrEscapeHtml(window.I18n && window.I18n.tText ? window.I18n.tText('Auto') : 'Auto');
        const header = document.createElement('div');
        header.className = 'event-editor-header';
        header.innerHTML = `
            <div class="event-header-text">
                <div class="event-header-field event-header-name">
                    <label class="event-header-label" for="event-name-field">${rrEscapeHtml(label('event.name'))}</label>
                    <input type="text" id="event-name-field" class="event-name-input database-field-value" value="${rrEscapeHtml(event.name)}" data-event-id="${event.id}">
                </div>
                <div class="event-header-field event-header-note">
                    <label class="event-header-label" for="event-note-field">${rrEscapeHtml(label('event.note'))}</label>
                    <div class="event-note-box">
                        <textarea id="event-note-field" class="event-note-input database-field-value" rows="1" spellcheck="false"
                                  data-field="note" data-event-id="${event.id}">${rrEscapeHtml(event.note)}</textarea>
                    </div>
                </div>
            </div>
            <div class="event-header-set">
                <div class="event-header-field">
                    <label class="event-header-label" for="event-position-x">${rrEscapeHtml(label('event.position'))}</label>
                    <div class="event-header-controls">
                        <span>X</span><input type="number" id="event-position-x" class="database-field-value" data-no-stepper min="0" step="1" value="${event.x}">
                        <span>Y</span><input type="number" id="event-position-y" class="database-field-value" data-no-stepper min="0" step="1" value="${event.y}">
                        <span>Z</span><input type="number" id="event-position-z" class="database-field-value" data-no-stepper min="0" step="0.25" value="${this.pendingZ ?? this._eventZ(event.id)}">
                    </div>
                </div>
                <div class="event-header-field">
                    <label class="event-header-label" for="event-size-w" title="${sizeHint}">${rrEscapeHtml(label('event.size'))}</label>
                    <div class="event-header-controls">
                        <span>W</span><input type="number" id="event-size-w" class="database-field-value${this.pendingAuto ? ' is-auto' : ''}" data-no-stepper min="1" max="64" step="1" value="${size[0]}" title="${sizeHint}">
                        <span>H</span><input type="number" id="event-size-h" class="database-field-value${this.pendingAuto ? ' is-auto' : ''}" data-no-stepper min="1" max="64" step="1" value="${size[1]}" title="${sizeHint}">
                        <label class="event-size-auto"${this._sizeModel() ? '' : ' hidden'}><input type="checkbox" id="event-size-auto" class="system-checkbox"${this.pendingAuto ? ' checked' : ''}><span>${autoWord}</span></label>
                    </div>
                </div>
            </div>
        `;
        header.querySelector('.event-header-set').appendChild(this.createUnitRow(event));
        if (typeof RRVehicles !== 'undefined') header.querySelector('.event-header-set').appendChild(this.createVehicleRow(event));

        header.querySelector('.event-name-input').addEventListener('change', (e) => {
            event.name = e.target.value;
        });
        // Size: Auto takes the model's own footprint; typing a number, or unticking, makes it the user's.
        const sizeAuto = header.querySelector('#event-size-auto');
        sizeAuto.addEventListener('change', () => {
            this._autoChosen = true;
            if (sizeAuto.checked) { this.pendingAuto = true; this.refreshAutoSize(); return; }
            this.pendingAuto = false;
            if (this.pendingAutoRect) this.pendingSize = [this.pendingAutoRect[0], this.pendingAutoRect[1]];
            this._showSize();
        });
        for (const id of ['#event-size-w', '#event-size-h']) header.querySelector(id).addEventListener('input', () => {
            if (!this.pendingAuto) return;
            this._autoChosen = true;
            this.pendingAuto = false;
            const w = header.querySelector('#event-size-w'), h = header.querySelector('#event-size-h');
            this.pendingSize = [Math.max(1, Math.round(Number(w.value)) || 1), Math.max(1, Math.round(Number(h.value)) || 1)];
            w.classList.remove('is-auto'); h.classList.remove('is-auto');
            sizeAuto.checked = false;
        });
        // The note rests at one line like every other field and opens over the page strip while it is edited;
        // at rest it says how many more lines it holds.
        const note = header.querySelector('.event-note-input'), noteBox = header.querySelector('.event-note-box');
        const noteLines = () => {
            const more = note.value.replace(/\n+$/, '').split('\n').length - 1;
            if (more > 0) noteBox.dataset.more = '+' + more; else delete noteBox.dataset.more;
        };
        noteLines();
        note.addEventListener('input', noteLines);
        note.addEventListener('blur', () => { note.scrollTop = 0; });
        note.addEventListener('change', (e) => {
            event.note = e.target.value;
        });

        top.appendChild(header);
        top.appendChild(this.createPageStrip(event));
        return top;
    }

    /** The page tabs, with the page buttons as one group at the right end of the same strip. */
    createPageStrip(event) {
        const strip = document.createElement('div');
        strip.className = 'event-page-strip';
        strip.appendChild(this.createPageTabs(event));
        strip.appendChild(this.createPageButtons());
        return strip;
    }

    /** The name a new event is given until the author names it: EV and its number. */
    static isAutomaticName(name) {
        return /^EV\d+$/.test(String(name || ''));
    }

    /** A Database record of a unit: `{ id, name }` from the enemies or the actors; null when there is none. */
    static unitRecord(unit, lists) {
        if (!unit || !(unit.id > 0)) return null;
        const list = unit.record === 'actor' ? lists && lists.actors : lists && lists.enemies;
        return (Array.isArray(list) ? list : []).find(entry => entry && Number(entry.id) === Number(unit.id)) || null;
    }

    /**
     * What the In battle row stores after a change. `current` is the event's
     * `rrUnit` (null: it does not fight yet), `change` the row's controls:
     * `{ team, record: "enemy:6", move: "" | "5", returns }`. Null is "Does not fight".
     * Choosing a side for the first time takes the first enemy (Enemy,
     * Bystander) or the first actor (Ally); a later change of side keeps the record.
     * Move is stored only when one is typed, Comes back only for an enemy.
     */
    static unitRowValue(current, change, lists) {
        const team = change && ['enemy', 'ally', 'neutral'].includes(change.team) ? change.team : '';
        if (!team) return null;
        const first = list => (Array.isArray(list) ? list : []).find(entry => entry && entry.id > 0) || null;
        let record = '', id = 0;
        if (current) {
            const [kind, number] = String(change.record || '').split(':');
            if ((kind === 'enemy' || kind === 'actor') && Math.floor(Number(number) || 0) > 0) { record = kind; id = Math.floor(Number(number)); }
        }
        // A first choice of side, and a fighter that has no record yet, take the first record of the side's kind.
        if (!id && (!current || team !== 'neutral')) {
            const mine = team === 'ally' ? first(lists && lists.actors) : first(lists && lists.enemies);
            const other = team === 'ally' ? first(lists && lists.enemies) : first(lists && lists.actors);
            if (mine) { record = team === 'ally' ? 'actor' : 'enemy'; id = mine.id; }
            else if (other) { record = team === 'ally' ? 'enemy' : 'actor'; id = other.id; }
        }
        const next = Object.assign({}, current || {}, { team, record, id });
        // A bystander needs no record; every fighter has one.
        if (!id) delete next.record;
        const move = String(change.move == null ? '' : change.move).trim();
        if (move !== '') next.move = Math.max(1, Math.min(20, Math.floor(Number(move) || 4)));
        else delete next.move;
        // Comes back is an enemy's only. Set from its box (`returns` given), it is kept only where it differs from
        // what the enemy record says (Database › Enemies), so the event follows its enemy otherwise.
        if (team !== 'enemy') delete next.returns;
        else if (change.returns !== undefined) {
            if (!!change.returns === EventEditor.recordComesBack(next, lists && lists.enemies)) delete next.returns;
            else next.returns = !!change.returns;
        }
        return next;
    }

    /** Whether the enemy record a row fights as comes back by its own setting (`rrBattle.comesBack`). */
    static recordComesBack(row, enemies) {
        return !!row && row.record === 'enemy' && (Array.isArray(enemies) ? enemies : [])
            .some(entry => entry && entry.id === row.id && entry.rrBattle && entry.rrBattle.comesBack === true);
    }

    /** Whether a defeated enemy row stands again when its map is entered: its own Comes back, else its enemy record's. */
    static unitComesBack(row, enemies) {
        if (!row || row.team !== 'enemy') return false;
        return typeof row.returns === 'boolean' ? row.returns : EventEditor.recordComesBack(row, enemies);
    }

    /** A unit an event is by a `<unit: …>` tag (its Note or a page comment) while it has no row; null otherwise. */
    static tagUnit(event) {
        if (!event || event.rrUnit || typeof FightCommandEditor === 'undefined') return null;
        const unit = FightCommandEditor.unitOf(event);
        return unit && unit.from !== 'row' ? unit : null;
    }

    /** What the In battle row shows for a tag unit, and stores once the row is changed: `{ team, record, id, move }`. */
    static tagRow(unit) {
        if (!unit) return null;
        const row = { team: unit.team, record: unit.record, id: unit.id };
        if (!unit.id) delete row.record;
        if (unit.move > 0) row.move = unit.move;
        return row;
    }

    /**
     * The page a tag unit fights on while its other pages sit out: a
     * `<unit: …>` comment is read on the page that holds it, a row on every
     * page, so changing the row would make the event fight on pages
     * where it does not today. 0 when a row changes nothing: a Note tag, a
     * one-page event, a comment on every page.
     */
    static rowWidens(event) {
        const unit = EventEditor.tagUnit(event);
        if (!unit || unit.from !== 'comment') return 0;
        const tagged = page => ((page && page.list) || []).some(command => command && (command.code === 108 || command.code === 408)
            && /<unit\s*:/i.test(String((command.parameters && command.parameters[0]) || '')));
        return (event.pages || []).every(tagged) ? 0 : unit.page;
    }

    /**
     * Makes a tag unit a row: writes `rrUnit` from the tag and takes every
     * `<unit: …>` tag out of the event's Note and its pages' comments (a
     * comment line left empty goes with it). Returns whether the event changed.
     */
    static useUnitRow(event) {
        const unit = EventEditor.tagUnit(event);
        if (!unit) return false;
        const tag = /<unit\s*:\s*[^>]*>/gi;
        event.rrUnit = EventEditor.tagRow(unit);
        const note = String(event.note || '');
        if (/<unit\s*:/i.test(note)) {
            event.note = note.split('\n').map(line => {
                const rest = line.replace(tag, '');
                return rest === line ? line : (rest.trim() === '' ? null : rest);
            }).filter(line => line !== null).join('\n');
        }
        for (const page of event.pages || []) {
            const list = (page && page.list) || [];
            for (let i = list.length - 1; i >= 0; i--) {
                const command = list[i];
                if (!command || (command.code !== 108 && command.code !== 408)) continue;
                const text = String((command.parameters && command.parameters[0]) || '');
                const rest = text.replace(tag, '');
                if (rest === text) continue;
                if (rest.trim() !== '') { command.parameters[0] = rest.trim(); continue; }
                // The line is gone; a comment's next line becomes its first.
                if (command.code === 108 && list[i + 1] && list[i + 1].code === 408) list[i + 1].code = 108;
                list.splice(i, 1);
            }
        }
        return true;
    }

    /**
     * The event in battles on the map (runtime/reactor_fight.js): its side,
     * the Database record it fights as, how far it walks a turn in a Tactical
     * battle, and whether a defeated enemy comes back. Stored as
     * `event.rrUnit`; "Does not fight" removes it. A unit made by a
     * `<unit: …>` tag shows in the same controls; changing one stores the
     * row and takes the tag out.
     */
    /**
     * The Vehicle row: which vehicle of the Vehicles page this event is, and the way it faces. Stored as
     * `event.rrVehicle` (`{ type, yaw }`); "None" removes it. The event is then that vehicle standing on the map:
     * it wears the vehicle's own picture or model unless a page gives it another, and OK boards it (an event
     * that has commands of its own is boarded by Get On Reactor Vehicle instead, so its commands still run).
     */
    createVehicleRow(event) {
        const tt = text => (typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text);
        const types = this.databaseManager.data.vehicles || [null];
        const row = document.createElement('div');
        row.className = 'event-header-field event-vehicle-row';
        const now = RRVehicles.vehicleOf(event);
        const option = (value, label, current) => `<option value="${rrEscapeHtml(value)}"${String(value) === String(current) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`;
        const names = types.map((record, id) => (id > 0 && record && typeof record === 'object' ? option(id, String(id).padStart(4, '0') + ': ' + (record.name || ''), now ? now.type : 0) : '')).join('');
        // One the Database no longer has is shown as itself, not as another.
        const missing = now && !RRVehicles.typeAt(types, now.type) ? option(now.type, '#' + now.type + ' (' + this._t('vehicle.missing') + ')', now.type) : '';
        const turns = [[0, 'Up'], [90, 'Right'], [180, 'Down'], [270, 'Left']];
        const own = now && event.rrVehicle.yaw != null ? Number(event.rrVehicle.yaw) : '';
        const other = own !== '' && !turns.some(([yaw]) => yaw === own) ? option(own, own + '°', own) : '';
        row.innerHTML = `<label class="event-header-label">${rrEscapeHtml(this._t('vehicle.target'))}</label>
            <div class="event-header-controls event-vehicle-fields">
                <select class="event-vehicle-type" data-rr-i18n-skip>${option(0, this._t('vehicle.none'), now ? now.type : 0)}${names}${missing}</select>
                <span class="event-vehicle-more"${now ? '' : ' hidden'}>
                    <label>${rrEscapeHtml(this._t('vehicle.facing'))}</label>
                    <select class="event-vehicle-yaw">${option('', this._t('vehicle.pageFacing'), own)}${turns.map(([yaw, word]) => option(yaw, tt(word), own)).join('')}${other}</select>
                </span>
            </div>`;
        const change = value => {
            const page = event.pages && event.pages[0];
            const commands = !!(page && Array.isArray(page.list) && page.list.some(command => command && command.code !== 0));
            const result = RRVehicles.rowValue(event.rrVehicle, value, { types, commands });
            const was = !!event.rrVehicle;
            if (result.value) event.rrVehicle = result.value; else delete event.rrVehicle;
            // An event still called EV001 takes the vehicle's name.
            const named = result.value ? RRVehicles.nameAfter(event.name, RRVehicles.typeAt(types, result.value.type)) : null;
            if (named) event.name = named;
            // The page's picture is the vehicle's now (or its own again): the editor shows the event as it is.
            const container = typeof document !== 'undefined' ? document.querySelector('.event-editor-container') : null;
            if (container && (was !== !!event.rrVehicle || value.type !== undefined)) this.showEventEditor(container, event);
            else this.pageEditor?.refreshCharacterPreview?.();
        };
        row.querySelector('.event-vehicle-type').addEventListener('change', e => change({ type: Number(e.target.value) }));
        row.querySelector('.event-vehicle-yaw').addEventListener('change', e => { change({ yaw: e.target.value }); this.refreshAutoSize(); });
        return row;
    }

    createUnitRow(event) {
        const tt = (text, params) => (typeof window !== 'undefined' && window.I18n ? (params ? window.I18n.formatText(text, params) : window.I18n.tText(text))
            : String(text).replace(/\{(\w+)\}/g, (token, key) => (params && key in params ? String(params[key]) : token)));
        const lists = { enemies: this.databaseManager.getEnemies() || [], actors: this.databaseManager.getActors() || [] };
        const row = document.createElement('div');
        row.className = 'event-header-field event-unit-row';
        const head = `<label class="event-header-label event-unit-label">${rrEscapeHtml(tt('In battle'))}</label>`;
        const unit = event.rrUnit || EventEditor.tagRow(EventEditor.tagUnit(event));
        const option = (value, label, current) => `<option value="${rrEscapeHtml(value)}"${String(value) === String(current) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`;
        const sides = [['', 'Does not fight'], ['enemy', 'Enemy'], ['ally', 'Ally'], ['neutral', 'Bystander']];
        const records = current => {
            const group = (label, kind, list) => {
                const entries = list.filter(entry => entry && entry.id > 0);
                return entries.length ? `<optgroup label="${rrEscapeHtml(label)}">${entries.map(entry => option(kind + ':' + entry.id, String(entry.id).padStart(4, '0') + ': ' + (entry.name || ''), current)).join('')}</optgroup>` : '';
            };
            const groups = group(tt('Enemies'), 'enemy', lists.enemies) + group(tt('Actors'), 'actor', lists.actors);
            // A bystander may have no record; a record the Database no longer has is shown as itself.
            if (current === '') return option('', tt('No record'), '') + groups;
            return groups.includes(' selected') ? groups : option(current, current.replace(':', ' '), current) + groups;
        };
        const recordOf = value => (value && value.record && value.id > 0 ? value.record + ':' + value.id : '');
        row.innerHTML = `${head}
            <div class="event-header-controls event-unit-fields">
                <select class="event-unit-team">${sides.map(([value, label]) => option(value, tt(label), unit ? unit.team : '')).join('')}</select>
                <span class="event-unit-more">
                    <span class="event-unit-as">${rrEscapeHtml(this._t('event.unitAs'))}</span>
                    <select class="event-unit-id">${records(recordOf(unit))}</select>
                    <label>${rrEscapeHtml(this._t('event.unitMove'))}</label>
                    <input type="number" class="event-unit-move database-field-value" data-no-stepper min="1" max="20" step="1" value="${unit && unit.move ? unit.move : ''}" placeholder="${rrEscapeHtml(tt('Auto'))}" title="${rrEscapeHtml(tt('Tiles a turn in a Tactical battle. Empty: the Move of its Database record, else 4.'))}">
                    <label class="event-unit-returns" title="${rrEscapeHtml(tt('Defeated, it stands here again the next time the map is entered.'))}"><input type="checkbox" class="event-unit-returns-box system-checkbox"${EventEditor.unitComesBack(unit, lists.enemies) ? ' checked' : ''}><span>${rrEscapeHtml(tt('Comes back'))}</span></label>
                </span>
            </div>`;
        const team = row.querySelector('.event-unit-team'), id = row.querySelector('.event-unit-id'), move = row.querySelector('.event-unit-move');
        const more = row.querySelector('.event-unit-more'), returns = row.querySelector('.event-unit-returns'), returnsBox = row.querySelector('.event-unit-returns-box');
        const show = () => {
            more.hidden = !team.value;
            returns.hidden = team.value !== 'enemy';
        };
        const write = async change => {
            const fromBox = !!change && change.target === returnsBox;
            // A tag unit becomes a row at its first change. A comment made it a unit on its own page only: the author is told before that changes.
            const tagged = !!EventEditor.tagUnit(event);
            if (tagged) {
                const page = team.value ? EventEditor.rowWidens(event) : 0;
                if (page > 0) {
                    const agreed = typeof RRDialog !== 'undefined' && await RRDialog.confirm(tt('A row makes it a unit on every page, not only on page {page}.', { page }), { title: tt('In battle') });
                    if (!agreed || this.currentEvent !== event) {
                        team.value = unit.team;
                        id.innerHTML = records(recordOf(unit));
                        move.value = unit.move ? unit.move : '';
                        returnsBox.checked = EventEditor.unitComesBack(unit, lists.enemies);
                        show();
                        return;
                    }
                }
                EventEditor.useUnitRow(event);
            }
            const before = event.rrUnit || null;
            const next = EventEditor.unitRowValue(before, { team: team.value, record: id.value, move: move.value, returns: fromBox ? returnsBox.checked : undefined }, lists);
            if (next) event.rrUnit = next; else delete event.rrUnit;
            // A side chosen for the first time picked its record: the select follows.
            if (next && recordOf(next) !== id.value) id.innerHTML = records(recordOf(next));
            if (next) this._nameAfterUnit(event, next, lists); else this._nameWithoutUnit(event);
            returnsBox.checked = EventEditor.unitComesBack(next, lists.enemies);
            show();
            this.pageEditor?.refreshCharacterPreview?.();
            // The tag left the Note or a page's commands: the editor shows the event as it is now.
            const container = tagged && typeof document !== 'undefined' ? document.querySelector('.event-editor-container') : null;
            if (container) this.showEventEditor(container, event);
        };
        show();
        for (const control of [team, id, move, returnsBox]) control.addEventListener('change', write);
        return row;
    }

    /**
     * The name an event made a unit takes: its record's, while its own is
     * still the automatic one or the one this row gave it (`given`). Null
     * when its name stays: the author typed it, or the record has none.
     */
    static nameAfterUnit(name, unit, lists, given) {
        const record = EventEditor.unitRecord(unit, lists);
        if (!record || !record.name) return null;
        if (!EventEditor.isAutomaticName(name) && name !== given) return null;
        return record.name;
    }

    /**
     * The name an event takes back when it stops being a unit: the one this
     * row replaced (`given.was`), while its name is still the one the row
     * gave (`given.name`). Null when its name stays: the author typed it.
     */
    static nameWithoutUnit(name, given) {
        return given && name === given.name && typeof given.was === 'string' ? given.was : null;
    }

    /** Gives the event its record's name where `nameAfterUnit` says so, in the data and in the Name field. */
    _nameAfterUnit(event, unit, lists) {
        const given = this._unitGivenName && this._unitGivenName.event === event ? this._unitGivenName : null;
        const name = EventEditor.nameAfterUnit(event.name, unit, lists, given ? given.name : null);
        if (name === null) return;
        // The name the row first replaced is kept for the way back.
        const was = given && event.name === given.name ? given.was : event.name;
        event.name = name;
        this._unitGivenName = { event, name, was };
        const field = document.getElementById('event-name-field');
        if (field) field.value = name;
    }

    /** "Does not fight" again: the name this row gave goes back to the one it replaced, in the data and in the Name field. */
    _nameWithoutUnit(event) {
        const given = this._unitGivenName && this._unitGivenName.event === event ? this._unitGivenName : null;
        const name = EventEditor.nameWithoutUnit(event.name, given);
        if (name === null) return;
        event.name = name;
        this._unitGivenName = null;
        const field = document.getElementById('event-name-field');
        if (field) field.value = name;
    }

    /**
     * Create left column: the page's settings
     */
    createLeftColumn(event) {
        const column = document.createElement('div');
        column.className = 'event-left-column';
        column.style.display = 'flex';
        column.style.flexDirection = 'column';
        column.style.minHeight = '0';

        // Page configuration container (will be populated by renderCurrentPage)
        const pageConfig = document.createElement('div');
        pageConfig.className = 'event-page-config';
        pageConfig.style.flex = '1';
        pageConfig.style.overflowY = 'auto';
        pageConfig.style.overflowX = 'hidden';
        pageConfig.style.minHeight = '0';
        column.appendChild(pageConfig);

        return column;
    }

    /**
     * Create page management buttons
     */
    createPageButtons() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'event-page-buttons';

        const buttons = [
            { label: this._t('event.newPage'), action: 'new' },
            { label: this._t('event.copyPage'), action: 'copy' },
            { label: this._t('event.pastePage'), action: 'paste' },
            { label: this._t('event.deletePage'), action: 'delete' },
            { label: this._t('event.clearPage'), action: 'clear' }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = btn.label;
            button.title = btn.label;
            button.className = 'event-page-button';
            button.dataset.action = btn.action;
            buttonContainer.appendChild(button);
        });

        // Add event listeners
        buttonContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('event-page-button')) {
                this.handlePageButtonClick(e.target.dataset.action);
            }
        });

        return buttonContainer;
    }

    /**
     * Create page tabs
     */
    createPageTabs(event) {
        const tabContainer = document.createElement('div');
        tabContainer.className = 'event-page-tabs';

        event.pages.forEach((page, index) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.textContent = this._t('event.page', { number: index + 1 });
            tab.className = 'event-page-tab' + (index === this.currentPageIndex ? ' active' : '');
            tab.dataset.pageIndex = index;

            tab.addEventListener('click', () => {
                this.switchToPage(index);
            });

            tabContainer.appendChild(tab);
        });

        // Many pages scroll inside the strip; the page in view keeps its tab in view when the strip changes size.
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => tabContainer.querySelector('.event-page-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })).observe(tabContainer);
        }

        return tabContainer;
    }

    /**
     * Create right column for event commands/contents
     */
    createRightColumn(event) {
        const column = document.createElement('div');
        column.className = 'event-right-column';
        column.style.display = 'flex';
        column.style.flexDirection = 'column';
        column.style.minHeight = '0';
        column.style.flex = '1';

        const header = document.createElement('div');
        header.style.fontWeight = 'bold';
        header.style.fontSize = '14px';
        header.style.padding = '6px 8px';
        header.style.backgroundColor = 'var(--color-bg-input)';
        header.style.borderRadius = '4px';
        header.style.marginBottom = '6px';
        header.style.flexShrink = '0';
        header.textContent = this._t('event.contents');

        const contentsArea = document.createElement('div');
        contentsArea.className = 'event-contents-area';
        contentsArea.style.flex = '1';
        contentsArea.style.backgroundColor = 'var(--color-bg-surface)';
        contentsArea.style.border = '1px solid var(--color-bg-input-alt)';
        contentsArea.style.borderRadius = '4px';
        contentsArea.style.padding = '8px';
        contentsArea.style.overflowY = 'auto';
        contentsArea.style.minHeight = '0';

        // Placeholder content
        const currentPage = event.pages[this.currentPageIndex];
        if (currentPage && currentPage.list && currentPage.list.length > 0) {
            contentsArea.innerHTML = `
                <div style="color: var(--color-text-muted);">
                    ${this._t('event.commandListPlaceholder', { count: currentPage.list.length })}
                    <br><br>
                    ${this._t('event.commandEditorPlaceholder')}
                </div>
            `;
        } else {
            contentsArea.innerHTML = `<div style="color: var(--color-text-muted);">${this._t('event.noCommandsDefined')}</div>`;
        }

        column.appendChild(header);
        column.appendChild(contentsArea);

        return column;
    }

    /**
     * Render the current page configuration
     */
    renderCurrentPage() {
        const pageConfig = document.querySelector('.event-page-config');
        if (!pageConfig) return;

        pageConfig.innerHTML = '';

        const currentPage = this.currentEvent.pages[this.currentPageIndex];
        if (!currentPage) return;

        // Each render makes a new page editor; the one before it must free its model preview
        // (a WebGL context each: a browser keeps sixteen and drops the oldest, the map view's own in the end).
        this.pageEditor?._disposeModelPreview?.();
        const pageEditor = this.pageEditor = new EventPageEditor(
            this.databaseManager,
            this.projectController,
            this
        );

        pageEditor.renderPageConfiguration(pageConfig, currentPage, this.currentPageIndex);

        // Update right column
        this.updateContentsColumn();

        // Update tab highlighting
        this.updateTabHighlighting();
    }

    /**
     * Update contents column with current page data
     */
    updateContentsColumn() {
        const contentsArea = document.querySelector('.event-contents-area');
        if (!contentsArea) return;

        const currentPage = this.currentEvent.pages[this.currentPageIndex];
        // A refresh that arrives after the dialog closed (a language change) may find the page gone.
        if (!currentPage) return;

        contentsArea.innerHTML = '';

        // Create header with info
        const header = document.createElement('div');
        header.className = 'database-section-header event-commands-banner';
        header.style.marginBottom = '12px';
        header.textContent = this._t('event.commandsTotal', { count: currentPage.list ? currentPage.list.length : 0 });
        contentsArea.appendChild(header);

        // Render interactive command list
        const commandListContainer = document.createElement('div');
        contentsArea.appendChild(commandListContainer);

        this.commandList.renderCommandList(commandListContainer, currentPage, this.currentPageIndex);
    }


    /**
     * Update tab highlighting
     */
    updateTabHighlighting() {
        const tabs = document.querySelectorAll('.event-page-tab');
        tabs.forEach((tab, index) => {
            const active = index === this.currentPageIndex;
            tab.classList.toggle('active', active);
            // With many pages the strip scrolls: the page in view keeps its tab in view.
            if (active) tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        });
    }

    /**
     * Switch to a different page
     */
    switchToPage(pageIndex) {
        this.currentPageIndex = pageIndex;
        this.renderCurrentPage();
    }

    /**
     * Handle page button clicks
     */
    handlePageButtonClick(action) {
        switch (action) {
            case 'new':
                this.addNewPage();
                break;
            case 'copy':
                this.copyCurrentPage();
                break;
            case 'paste':
                this.pasteEventPage();
                break;
            case 'delete':
                this.deleteCurrentPage();
                break;
            case 'clear':
                this.clearCurrentPage();
                break;
        }
    }

    /**
     * Add a new event page
     */
    addNewPage() {
        const newPage = this.createDefaultPage();
        this.currentEvent.pages.push(newPage);
        this.pendingModels.push(null);
        this.currentPageIndex = this.currentEvent.pages.length - 1;

        // Refresh the entire editor
        const container = document.querySelector('.event-editor-container');
        if (container) {
            this.showEventEditor(container, this.currentEvent);
        }
    }

    /**
     * Copy current page to clipboard
     */
    copyCurrentPage() {
        const currentPage = this.currentEvent.pages[this.currentPageIndex];
        this.clipboard = JSON.parse(JSON.stringify(currentPage)); // Deep clone
        // The page's 3D model goes with it.
        const model = this.pendingModels && this.pendingModels[this.currentPageIndex];
        this.clipboardModel = model ? this._clone(model) : null;
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('eventPage', { page: this.clipboard, model: this.clipboardModel });
        }
        console.log('Page copied to clipboard');
    }

    /**
     * Paste event page from clipboard
     */
    async pasteEventPage() {
        const targetEvent = this.currentEvent;
        let pageData = null, modelData = null;
        if (typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('eventPage');
            pageData = clipboardData?.payload?.page || null;
            modelData = clipboardData?.payload?.model || null;
        } else {
            pageData = this.clipboard;
            modelData = this.clipboardModel || null;
        }
        if (this.currentEvent !== targetEvent) return;

        if (!pageData) {
            await RRDialog.alert(this._t('event.noPageClipboard'), { title: this._t('event.pastePage') });
            return;
        }

        // The copy takes the place of the page in view; New Page is how a page is added.
        const pastedPage = JSON.parse(JSON.stringify(pageData)); // Deep clone
        const index = Math.max(0, Math.min(this.currentPageIndex || 0, this.currentEvent.pages.length));
        this.currentEvent.pages[index] = pastedPage;
        if (!this.pendingModels) this.pendingModels = [];
        this.pendingModels[index] = modelData && modelData.name ? this._clone(modelData) : null;
        this.currentPageIndex = index;
        // An Auto size follows the model.
        if (modelData && modelData.name) this.refreshAutoSize();

        // Refresh the entire editor
        const container = document.querySelector('.event-editor-container');
        if (container) {
            this.showEventEditor(container, this.currentEvent);
        }
    }

    /**
     * Delete current page
     */
    async deleteCurrentPage() {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (this.currentEvent.pages.length <= 1) {
            await RRDialog.alert(this._t('event.cannotDeleteLastPage'), { title: this._t('event.deletePage') });
            return;
        }

        // The question is about the page shown when it was asked.
        const event = this.currentEvent;
        const pageIndex = this.currentPageIndex;
        const confirmed = await RRDialog.confirm(this._t('event.deletePageConfirm'), {
            title: this._t('event.deletePage'),
            ok: tt('Delete Page'),
            danger: true
        });
        if (!confirmed || this.currentEvent !== event || this.currentPageIndex !== pageIndex || event.pages.length <= 1) return;

        this.currentEvent.pages.splice(this.currentPageIndex, 1);
        this.pendingModels.splice(this.currentPageIndex, 1);
        this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);

        // Refresh the entire editor
        const container = document.querySelector('.event-editor-container');
        if (container) {
            this.showEventEditor(container, this.currentEvent);
        }
    }

    /**
     * Clear current page (reset to defaults)
     */
    async clearCurrentPage() {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        // The question is about the page shown when it was asked.
        const event = this.currentEvent;
        const pageIndex = this.currentPageIndex;
        const confirmed = await RRDialog.confirm(this._t('event.clearPageConfirm'), {
            title: this._t('event.clearPage'),
            ok: tt('Clear Page'),
            danger: true
        });
        if (!confirmed || this.currentEvent !== event || this.currentPageIndex !== pageIndex) return;

        this.currentEvent.pages[this.currentPageIndex] = this.createDefaultPage();
        this.pendingModels[this.currentPageIndex] = null;
        this.renderCurrentPage();
    }

    /**
     * Create a default event page structure
     */
    createDefaultPage() {
        return {
            conditions: {
                actorId: 1,
                actorValid: false,
                itemId: 1,
                itemValid: false,
                selfSwitchCh: 'A',
                selfSwitchValid: false,
                switch1Id: 1,
                switch1Valid: false,
                switch2Id: 1,
                switch2Valid: false,
                variableId: 1,
                variableValid: false,
                variableValue: 0
            },
            directionFix: false,
            image: {
                tileId: 0,
                characterName: '',
                direction: 2,
                pattern: 0,
                characterIndex: 0
            },
            moveFrequency: 3,
            moveRoute: {
                list: [{ code: 0, indent: null, parameters: [] }],
                repeat: true,
                skippable: false,
                wait: false
            },
            moveSpeed: 3,
            moveType: 0,
            priorityType: 1,
            stepAnime: false,
            through: false,
            trigger: 0,
            walkAnime: true,
            list: [{ code: 0, indent: 0, parameters: [] }]
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventEditor;
}
