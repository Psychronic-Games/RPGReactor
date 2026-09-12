/**
 * Event model panel: a card docked over the 3D map view whenever the
 * selected event stands as a 3D model there. Offset, turn and size edit the
 * model live in the scene, as the Props panel does for props, so the door can
 * be nudged against the wall without opening and closing the event window
 * to check each try.
 *
 * The event itself never moves: the offset is the model's alone, kept on the
 * event's `Map###.r3d.json` entry the same way the event window writes it.
 * One drag is one undo step on the event manager's stack.
 */
class EventModelPanel {
    constructor(projectController) {
        this.projectController = projectController;
        this.panel = null;
        this.event = null;
        this.tab = 'offset';
        this._undoPushed = false;
        this._onEventsChanged = () => { if (this.event) this.sync(this.event); };
        if (typeof document !== 'undefined') document.addEventListener('rr-events-changed', this._onEventsChanged);
    }

    _tx(text) {
        return (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
    }

    mapEditor3D() {
        return this.projectController?.mapEditor3D || null;
    }

    eventManager() {
        return (typeof window !== 'undefined' && window.reactor?.eventManager) || this.projectController?.eventManager || null;
    }

    map() {
        return this.mapEditor3D()?.currentMap?.() || this.projectController?.getTilemapManager?.()?.currentMap || null;
    }

    /** The previewed page's index: the page the 3D view stands the model for. */
    pageIndex(event) {
        const map = this.map();
        const preview = typeof MapEditor3D !== 'undefined' && MapEditor3D.previewPageIndex ? MapEditor3D.previewPageIndex(map, event) : null;
        return preview == null ? 0 : preview;
    }

    /** The raw sidecar entry for the event's previewed page, or null. */
    rawSpec(event) {
        const map = this.map();
        const pages = map?.reactor3d?.events?.[String(event?.id)];
        const raw = pages && (pages[String(this.pageIndex(event))] || null);
        return raw && raw.name ? raw : null;
    }

    /** The model standing in the scene for this event, or null. */
    placed(event) {
        const group = this.mapEditor3D()?.eventGroup;
        if (!group || !event) return null;
        return group.children.find(child => child.userData?.modelPreview && child.userData.event?.id === event.id) || null;
    }

    /** Show the card for an event with a model in the 3D view; hide it otherwise. */
    sync(event) {
        const editor = this.mapEditor3D();
        const usable = event && editor?.isEnabled?.() && this.rawSpec(event) && this.placed(event);
        if (!usable) { this.hide(); return; }
        const changed = !this.event || this.event.id !== event.id;
        this.event = event;
        if (!this.panel) this._build();
        this._syncHeader();
        if (changed || this._rowsFor !== this.tab) this._renderRows();
        else this._syncValues();
        this.panel.style.display = '';
    }

    hide() {
        this.event = null;
        if (this.panel) this.panel.style.display = 'none';
    }

    dispose() {
        if (typeof document !== 'undefined') document.removeEventListener('rr-events-changed', this._onEventsChanged);
        this.panel?.remove();
        this.panel = null;
        this.event = null;
    }

    //-------------------------------------------------------------------------
    // Card

    _build() {
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const workspace = document.getElementById('workspace');
        const infoBar = document.getElementById('map-info-content');
        let top = 44;
        if (workspace && infoBar) {
            const workspaceTop = workspace.getBoundingClientRect().top;
            top = Math.max(0, Math.round(infoBar.getBoundingClientRect().bottom - workspaceTop)) + 6;
        }
        if (workspace && !workspace.style.position) workspace.style.position = 'relative';
        const panel = document.createElement('div');
        panel.id = 'event-model-panel';
        panel.className = 'event-model-panel';
        panel.style.cssText = (workspace ? 'position:absolute;top:' + top + 'px;right:8px;z-index:900;' : 'position:fixed;top:84px;right:12px;z-index:9000;') + 'width:272px;';
        panel.innerHTML = `
            <div class="emp-header">
                <div class="emp-titles">
                    <div class="emp-title">${escape(this._tx('Event Model'))}</div>
                    <div class="emp-subtitle" id="event-model-panel-event"></div>
                </div>
                <button type="button" class="rr-btn-secondary emp-close" aria-label="${escape(this._tx('Close'))}" title="${escape(this._tx('Close'))}">×</button>
            </div>
            <div class="emp-tabs" id="event-model-panel-tabs"></div>
            <div id="event-model-panel-rows"></div>
            <div class="emp-footer">
                <span class="emp-hint">${escape(this._tx('Moves the model only; the event keeps its tile'))}</span>
                <button type="button" class="map-props-btn emp-reset">${escape(this._tx('Reset'))}</button>
            </div>`;
        panel.querySelector('.emp-close').addEventListener('click', () => this.hide());
        panel.querySelector('.emp-reset').addEventListener('click', () => this._reset());
        panel.addEventListener('keydown', e => e.stopPropagation());
        (workspace || document.body).appendChild(panel);
        this.panel = panel;
        this._renderTabs();
    }

    _renderTabs() {
        const tabs = this.panel.querySelector('#event-model-panel-tabs');
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        tabs.innerHTML = [['offset', this._tx('Offset')], ['rotate', this._tx('Rotate')], ['scale', this._tx('Scale')]]
            .map(([id, label]) => `<button type="button" class="map-props-btn${id === this.tab ? ' primary' : ''}" data-tab="${id}">${escape(label)}</button>`).join('');
        tabs.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
            this.tab = button.dataset.tab;
            this._renderTabs();
            this._renderRows();
        }));
    }

    _syncHeader() {
        const label = this.panel.querySelector('#event-model-panel-event');
        const raw = this.rawSpec(this.event);
        const name = raw ? String(raw.name).split('/').pop() : '';
        label.textContent = `${String(this.event.id).padStart(3, '0')}: ${this.event.name || ''} · ${name}`;
        label.title = raw ? raw.name : '';
    }

    /** The card's values, in the units the sidecar keeps (tiles, degrees). */
    values() {
        const raw = this.rawSpec(this.event) || {};
        const offset = Array.isArray(raw.offset) ? raw.offset : [0, 0, 0];
        return {
            ox: Number(offset[0]) || 0, oy: Number(offset[1]) || 0, oz: Number(offset[2]) || 0,
            yaw: Number(raw.yaw) || 0, pitch: Number(raw.pitch) || 0, roll: Number(raw.roll) || 0,
            size: Math.round((Number(raw.size) > 0 ? Number(raw.size) : 2) * (Number(raw.scale) > 0 ? Number(raw.scale) : 1) * 100) / 100
        };
    }

    rows() {
        const v = this.values();
        if (this.tab === 'rotate') {
            return [['yaw', this._tx('Yaw'), -180, 180, 1, v.yaw], ['pitch', this._tx('Pitch'), -180, 180, 1, v.pitch], ['roll', this._tx('Roll'), -180, 180, 1, v.roll]];
        }
        if (this.tab === 'scale') return [['size', this._tx('Size'), 0.1, 32, 0.05, v.size]];
        const span = k => Math.max(2, Math.ceil(Math.abs(k)) + 1);
        return [
            ['ox', 'X', -span(v.ox), span(v.ox), 0.01, v.ox, this._tx('Tiles east of the event')],
            ['oy', 'Y', -span(v.oy), span(v.oy), 0.01, v.oy, this._tx('Tiles south of the event')],
            ['oz', 'Z', -span(v.oz), span(v.oz), 0.01, v.oz, this._tx('Tiles above the event')]
        ];
    }

    _renderRows() {
        const body = this.panel.querySelector('#event-model-panel-rows');
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        body.innerHTML = this.rows().map(([key, label, min, max, step, value, title]) => `
            <div class="mp-transform-row" title="${escape(title || '')}">
                <span>${escape(label)}</span>
                <input type="range" class="emp-slider" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
                <input type="number" class="emp-num" data-key="${key}" step="${step}" value="${value}">
            </div>`).join('');
        body.querySelectorAll('.emp-slider').forEach(slider => {
            slider.addEventListener('input', () => {
                const num = body.querySelector(`.emp-num[data-key="${slider.dataset.key}"]`);
                if (num) num.value = slider.value;
                this._apply(slider.dataset.key, Number(slider.value), true);
            });
            slider.addEventListener('change', () => this._endDrag());
        });
        body.querySelectorAll('.emp-num').forEach(num => num.addEventListener('change', () => {
            const value = Number(num.value);
            if (!Number.isFinite(value)) return;
            const slider = body.querySelector(`.emp-slider[data-key="${num.dataset.key}"]`);
            if (slider) {
                if (value < Number(slider.min)) slider.min = Math.floor(value) - 1;
                if (value > Number(slider.max)) slider.max = Math.ceil(value) + 1;
                slider.value = value;
            }
            this._apply(num.dataset.key, value, false);
            this._endDrag();
        }));
        this._rowsFor = this.tab;
    }

    /** Keep the numbers true after an undo or an edit made elsewhere, without rebuilding mid-drag. */
    _syncValues() {
        const v = this.values();
        for (const input of this.panel.querySelectorAll('.emp-slider, .emp-num')) {
            const next = v[input.dataset.key];
            if (next == null || document.activeElement === input) continue;
            if (String(input.value) !== String(next)) input.value = next;
        }
    }

    //-------------------------------------------------------------------------
    // Edits

    /** One value changed: write it to the sidecar and move the model in the scene. */
    _apply(key, value, live) {
        const event = this.event;
        const map = this.map();
        const raw = this.rawSpec(event);
        if (!event || !map || !raw || typeof Reactor3D === 'undefined' || !Reactor3D.setEventModelSpec) return;
        if (!this._undoPushed) { this.eventManager()?.saveState?.(); this._undoPushed = true; }
        const next = Object.assign({}, raw);
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        if (key === 'ox' || key === 'oy' || key === 'oz') {
            const offset = (Array.isArray(raw.offset) ? raw.offset : [0, 0, 0]).slice(0, 3).map(n => Number(n) || 0);
            offset[{ ox: 0, oy: 1, oz: 2 }[key]] = Math.round(clamp(value, -64, 64) * 1000) / 1000;
            next.offset = offset;
        } else if (key === 'size') {
            next.size = clamp(value, 0.1, 64);
            next.scale = 1;
        } else {
            next[key] = Math.round(clamp(value, -180, 180) * 100) / 100;
        }
        Reactor3D.setEventModelSpec(map, event.id, this.pageIndex(event), next);
        this._place();
        if (!live) this._endDrag();
    }

    _reset() {
        const raw = this.rawSpec(this.event);
        if (!raw) return;
        const next = Object.assign({}, raw);
        if (this.tab === 'offset') delete next.offset;
        else if (this.tab === 'rotate') { next.yaw = 0; next.pitch = 0; next.roll = 0; }
        else { next.size = 2; next.scale = 1; }
        this.eventManager()?.saveState?.();
        this._undoPushed = true;
        Reactor3D.setEventModelSpec(this.map(), this.event.id, this.pageIndex(this.event), next);
        this._place();
        this._renderRows();
        this._endDrag();
    }

    /** Stand the placed model where the sidecar now says, without a rebuild. */
    _place() {
        const editor = this.mapEditor3D();
        const object = this.placed(this.event);
        const map = this.map();
        if (!editor || !object || !map) return;
        const spec = Reactor3D.eventModelSpec(map, this.event.id, this.pageIndex(this.event));
        if (!spec) return;
        const event = this.event;
        const elevation = Reactor3D.elevationAt(map, event.x, event.y) + (Reactor3D.eventZAt ? Reactor3D.eventZAt(map, event.id) : 0);
        const offset = spec.offset || [0, 0, 0];
        object.position.set(event.x + 0.5 + offset[0], elevation + offset[2], event.y + 0.5 + offset[1]);
        const extent = object.userData.glbSize;
        if (extent) {
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            const uniform = (spec.size > 0 ? spec.size : 2) / span * (spec.scale > 0 ? spec.scale : 1);
            const stretch = spec.stretch || [1, 1, 1];
            object.scale.set(uniform * stretch[0], uniform * stretch[1], uniform * stretch[2]);
        }
        const page = event.pages?.[this.pageIndex(event)] || event.pages?.[0];
        if (Reactor3D.applyEventModelPose) Reactor3D.applyEventModelPose(object, spec, page?.image?.direction || 2);
        else object.rotation.set(spec.pitch || 0, spec.yaw || 0, spec.roll || 0);
        object.updateMatrixWorld(true);
        if (object.userData.pickBox && typeof THREE !== 'undefined') object.userData.pickBox = new THREE.Box3().setFromObject(object);
        // A static caster moved: the cached shadow rows must be drawn again.
        if (Reactor3D.Shadows?.invalidate) Reactor3D.Shadows.invalidate();
        editor.noteEventModelEdited?.(event);
        editor.requestRender?.();
    }

    /** A drag or a typed value is over: one undo step, and the 2D previews follow. */
    _endDrag() {
        if (!this._undoPushed) return;
        this._undoPushed = false;
        this.eventManager()?.renderEvents?.();
    }
}

if (typeof window !== 'undefined') window.EventModelPanel = EventModelPanel;
if (typeof module !== 'undefined' && module.exports) module.exports = EventModelPanel;
