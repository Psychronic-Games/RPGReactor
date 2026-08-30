/**
 * Model props: 3D models placed on the map from the palette's M tab.
 *
 * A prop is a model from the project's `3d/` folder standing on the map with
 * a position, a lift, a pose (yaw/pitch/roll), a facing for the flat map, a
 * size in tiles and a scale, kept in the map's sidecar (`reactor3d.props`,
 * see `RRMapElevation`). On the 2D canvas a prop is drawn as the same
 * thumbnail Preview Event uses and moved a tile at a time; in the 3D view
 * (`MapEditor3D`) it is the model itself, placed freely and turned with pose
 * rings. In the running game the runtime stands each prop in the map as a
 * model-bound event, which is what gives it collision.
 */
class ModelPropsManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.tilemapManager = null;
        this.currentMap = null;
        this.container = null;          // PIXI container of prop sprites
        this.active = false;            // the M tab is up
        this.selectedId = null;
        this.model = null;              // the list entry a new prop is placed from
        this.fields = { size: 2, scale: 1, direction: 2, z: 0, passable: false, yaw: 0, pitch: 0, roll: 0, animation: '', repeat: false, effect: '' };
        this._undo = [];
        this._redo = [];
        this._textures = new Map();
        this._sprites = new Map();
        this._listeners = [];
        this._onKeyDown = event => this._handleKeyDown(event);
    }

    _t(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    elevation() {
        return (typeof RRMapElevation !== 'undefined' && RRMapElevation)
            || (typeof window !== 'undefined' && window.RRMapElevation) || null;
    }

    project() {
        const pc = this.projectController;
        return pc?.getCurrentProject ? pc.getCurrentProject() : pc?.currentProject || null;
    }

    mapEditor3D() {
        return this.projectController?.mapEditor3D || window.reactor?.mapEditor3D || null;
    }

    props() {
        const elevation = this.elevation();
        return elevation && this.currentMap ? elevation.props(this.currentMap) : [];
    }

    prop(id) {
        const elevation = this.elevation();
        return elevation && this.currentMap ? elevation.propById(this.currentMap, id) : null;
    }

    //-------------------------------------------------------------------------
    // Map

    /** Follow the loaded map: props are map content, drawn whether or not the tab is up. */
    setMap(mapData, tilemapManager) {
        this.tilemapManager = tilemapManager || this.tilemapManager;
        this.currentMap = mapData || null;
        this.selectedId = null;
        this._ensureContainer();
        this.render();
        this._syncPanel();
    }

    _ensureContainer() {
        const parent = this.tilemapManager?.container;
        if (!parent || typeof PIXI === 'undefined') return null;
        if (this.container && this.container.parent !== parent) {
            this.container.parent?.removeChild(this.container);
            this.container.destroy({ children: true });
            this.container = null;
            this._sprites.clear();
        }
        if (!this.container) {
            this.container = new PIXI.Container();
            this.container.label = 'model props';
            parent.addChild(this.container);
        }
        return this.container;
    }

    //-------------------------------------------------------------------------
    // 2D drawing

    /** Redraw every prop sprite from the sidecar. */
    render() {
        const container = this._ensureContainer();
        if (!container) return;
        for (const child of container.removeChildren()) child.destroy({ children: false });
        this._ghost = null;
        this._sprites.clear();
        const tw = this.tilemapManager?.TILE_WIDTH || 48;
        const th = this.tilemapManager?.TILE_HEIGHT || tw;
        this._drawFootprint(container, tw, th);
        const props = this.props().slice().sort((a, b) => a.y - b.y || a.id - b.id);
        for (const prop of props) {
            const sprite = this._spriteFor(prop, tw, th);
            if (!sprite) continue;
            sprite.x = (prop.x + 0.5) * tw;
            sprite.y = (prop.y + 0.5) * th - prop.z * th;
            sprite.eventMode = 'none';
            if (prop.id === this.selectedId) sprite.tint = 0xffe08a;
            this._sprites.set(prop.id, sprite);
            container.addChild(sprite);
        }
    }

    /**
     * The tiles the selected prop blocks, in red under its sprite: the
     * game's rule on the model's mesh at this size and facing, so the
     * footprint is seen, not guessed. Drawn when the template is in.
     */
    _drawFootprint(container, tw, th) {
        const prop = this.prop(this.selectedId);
        if (!prop || typeof RREventPreviewModels === 'undefined' || typeof Reactor3D === 'undefined'
            || !Reactor3D.blockedTilesFor || !Reactor3D.normalizeModelSpec || typeof PIXI === 'undefined') return;
        const spec = Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(prop));
        if (!spec) return;
        const generation = (this._footprintGeneration = (this._footprintGeneration || 0) + 1);
        RREventPreviewModels.templateFor(this.project(), spec, this.mapEditor3D()).then(template => {
            if (!template || generation !== this._footprintGeneration || container.destroyed) return;
            const tiles = Reactor3D.blockedTilesFor(template, template.userData.reactorSidecar, spec, prop.direction, prop.x, prop.y);
            if (!tiles.length) return;
            const graphics = new PIXI.Graphics();
            for (const tile of tiles) {
                graphics.rect(tile.x * tw + 1, tile.y * th + 1, tw - 2, th - 2);
            }
            graphics.fill({ color: 0xff5a5a, alpha: 0.28 });
            graphics.eventMode = 'none';
            container.addChildAt(graphics, 0);
        }).catch(() => {});
    }

    _spriteFor(prop, tw, th) {
        if (typeof RREventPreviewModels === 'undefined') return null;
        if (typeof Reactor3D === 'undefined' || !Reactor3D.normalizeModelSpec) {
            const map3d = this.mapEditor3D();
            if (map3d?.ensureLibraries && !this._loadingLibraries) {
                this._loadingLibraries = map3d.ensureLibraries().then(ready => {
                    this._loadingLibraries = null;
                    if (ready) this.render();
                }).catch(() => { this._loadingLibraries = null; });
            }
            return this._placeholder(prop, tw, th);
        }
        const spec = Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(prop));
        if (!spec) return null;
        const pixels = Math.round(spec.size * spec.scale * Math.max.apply(null, spec.stretch || [1]) * tw);
        const key = `${spec.name}|${spec.ext || ''}|${spec.file || ''}@${pixels}:${prop.direction}:${prop.yaw}:${prop.pitch}:${prop.roll}:${(spec.stretch || []).join(',')}`;
        let texture = this._textures.get(key);
        if (texture === undefined) {
            this._textures.set(key, null);
            RREventPreviewModels.thumbnail(this.project(), spec, this.mapEditor3D(), pixels, prop.direction).then(result => {
                if (!result) {
                    this._textures.delete(key);
                    setTimeout(() => this.render(), 2000);
                    return;
                }
                const image = new Image();
                image.onload = () => {
                    this._textures.set(key, { texture: PIXI.Texture.from(image), anchorX: result.anchorX, anchorY: result.anchorY });
                    this.render();
                };
                image.src = result.url;
            });
        }
        if (!texture) return this._placeholder(prop, tw, th);
        const sprite = new PIXI.Sprite(texture.texture);
        sprite.anchor.set(texture.anchorX, texture.anchorY);
        return sprite;
    }

    /** A footprint outline while the thumbnail renders, so the prop can still be found and moved. */
    _placeholder(prop, tw, th) {
        const graphics = new PIXI.Graphics();
        const span = Math.max(1, prop.size * prop.scale);
        const w = span * tw, h = span * th;
        graphics.rect(-w / 2, -h / 2, w, h).stroke({ width: 2, color: 0x2fbfb0, alpha: 0.9 });
        graphics.rect(-w / 2, -h / 2, w, h).fill({ color: 0x2fbfb0, alpha: 0.12 });
        return graphics;
    }

    static specOf(prop) {
        return {
            name: prop.name, ext: prop.ext, file: prop.file, texture: prop.texture,
            size: prop.size, scale: prop.scale, stretch: prop.stretch, yaw: prop.yaw, pitch: prop.pitch, roll: prop.roll
        };
    }

    /** The topmost prop whose drawn sprite covers a map-pixel point. */
    propAtPoint(px, py) {
        const entries = [...this._sprites.entries()].reverse();
        for (const [id, sprite] of entries) {
            const bounds = sprite.getBounds ? sprite.getLocalBounds() : null;
            if (!bounds) continue;
            const left = sprite.x + bounds.x * (sprite.scale?.x || 1);
            const top = sprite.y + bounds.y * (sprite.scale?.y || 1);
            if (px >= left && px <= left + bounds.width && py >= top && py <= top + bounds.height) return this.prop(id);
        }
        return null;
    }

    //-------------------------------------------------------------------------
    // Editing

    _changed(ids = []) {
        this.render();
        this._syncPanel();
        const map3d = this.mapEditor3D();
        if (map3d?.isEnabled?.()) map3d.refreshProps?.(ids);
        this.tilemapManager?.refreshPassage?.();
        map3d?.refreshPassage?.();
        this.projectController?.videoSurfacePreviewManager?.refresh?.();
    }

    //-------------------------------------------------------------------------
    // Undo: whole-list snapshots of the map's props, per map, Ctrl+Z / Ctrl+Y
    // while the tab is up. Small lists, so a copy per edit is nothing.

    _tx(text) {
        return (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
    }

    _snapshot() {
        return JSON.stringify(this.currentMap?.reactor3d?.props || []);
    }

    /** The map editor whose Undo/Redo the props share, when there is one. */
    _mapEditor() {
        return this.projectController?.mapEditor || window.reactor?.mapEditor || null;
    }

    pushUndo() {
        if (!this.currentMap) return;
        const mapEditor = this._mapEditor();
        if (mapEditor && typeof mapEditor.recordPropsState === 'function') {
            // One history for the map: a placed prop undoes with Ctrl+Z and
            // the toolbar like a painted tile does.
            mapEditor.recordPropsState(this._snapshot());
            return;
        }
        this._undo.push(this._snapshot());
        if (this._undo.length > 100) this._undo.shift();
        this._redo = [];
    }

    /** Snapshot and restore for the map editor's history. */
    snapshotProps() {
        return this._snapshot();
    }

    restoreProps(snapshot) {
        this._restore(snapshot);
    }

    _restore(snapshot) {
        const elevation = this.elevation();
        if (!elevation || !this.currentMap) return;
        const list = JSON.parse(snapshot);
        if (list.length) elevation.ensure(this.currentMap).props = list;
        else if (this.currentMap.reactor3d) delete this.currentMap.reactor3d.props;
        if (this.selectedId && !this.prop(this.selectedId)) this.selectedId = null;
        this._changed();
    }

    undo() {
        const mapEditor = this._mapEditor();
        if (mapEditor && typeof mapEditor.recordPropsState === 'function') { mapEditor.undo(); return true; }
        if (!this._undo.length) return false;
        this._redo.push(this._snapshot());
        this._restore(this._undo.pop());
        return true;
    }

    redo() {
        const mapEditor = this._mapEditor();
        if (mapEditor && typeof mapEditor.recordPropsState === 'function') { mapEditor.redo(); return true; }
        if (!this._redo.length) return false;
        this._undo.push(this._snapshot());
        this._restore(this._redo.pop());
        return true;
    }

    /** Put a new prop at map coordinates (tiles, fractional allowed) from the chosen model. */
    place(x, y) {
        const elevation = this.elevation();
        if (!elevation || !this.currentMap || !this.model) return 0;
        this.pushUndo();
        const id = elevation.addProp(this.currentMap, {
            name: this.model.name, ext: this.model.ext, file: this.model.file, texture: this.model.texture,
            x, y, z: this.fields.z, direction: this.fields.direction,
            yaw: this.fields.yaw, pitch: this.fields.pitch, roll: this.fields.roll,
            size: this.fields.size, scale: this.fields.scale, passable: this.fields.passable,
            animation: this.fields.animation, repeat: this.fields.repeat, effect: this.fields.effect
        });
        if (id) {
            this.selectedId = id;
            this._changed([id]);
        }
        return id;
    }

    update(id, patch, options = {}) {
        const elevation = this.elevation();
        if (!elevation || !this.currentMap) return false;
        if (!options.silent) this.pushUndo();
        const changed = elevation.updateProp(this.currentMap, id, patch);
        if (changed) this._changed([id]);
        return changed;
    }

    remove(id) {
        const elevation = this.elevation();
        if (!elevation || !this.currentMap) return false;
        this.pushUndo();
        const removed = elevation.removeProp(this.currentMap, id);
        if (removed) {
            if (this.selectedId === id) this.selectedId = null;
            this._changed([id]);
        }
        return removed;
    }

    select(id, options = {}) {
        this.selectedId = id || null;
        const prop = this.prop(this.selectedId);
        if (prop) {
            // The panel's fields become the selected prop's, so the next
            // placement repeats it unless something is changed first.
            this.fields = { size: prop.size, scale: prop.scale, direction: prop.direction, z: prop.z, passable: prop.passable,
                yaw: prop.yaw, pitch: prop.pitch, roll: prop.roll, animation: prop.animation || '', repeat: !!prop.repeat, effect: prop.effect || '' };
            this.model = { name: prop.name, ext: prop.ext, file: prop.file, texture: prop.texture };
        }
        this.render();
        this._syncPanel();
        if (!options.fromThree) this.mapEditor3D()?.selectProp?.(this.selectedId);
    }

    //-------------------------------------------------------------------------
    // 2D pointer

    activate() {
        if (this.active) return;
        this.active = true;
        const mapEditor = window.reactor?.mapEditor;
        this._resumeMapEditor = !!mapEditor?.enabled;
        mapEditor?.setEnabled?.(false);
        this._bindPointer();
        document.addEventListener('keydown', this._onKeyDown);
        const mapEditor3D = this.mapEditor3D();
        if (mapEditor3D && this.selectedId) mapEditor3D.selectProp?.(this.selectedId);
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this._hideGhost(true);
        this._unbindPointer();
        document.removeEventListener('keydown', this._onKeyDown);
        this.mapEditor3D()?.selectProp?.(null);
        const mapEditor = window.reactor?.mapEditor;
        if (mapEditor && this._resumeMapEditor) {
            mapEditor.setEnabled(true);
            mapEditor.setupMapInteraction?.();
        }
        this.drag = null;
    }

    _bindPointer() {
        const container = this.tilemapManager?.container;
        if (!container || this._listeners.length) return;
        const on = (type, handler) => {
            container.on(type, handler);
            this._listeners.push([container, type, handler]);
        };
        on('pointerdown', event => this._pointerDown(event, container));
        on('pointermove', event => this._pointerMove(event, container));
        on('pointerup', event => this._pointerUp(event));
        on('pointerupoutside', event => this._pointerUp(event));
        on('pointerleave', () => this._hideGhost());
    }

    _unbindPointer() {
        for (const [container, type, handler] of this._listeners) container.off(type, handler);
        this._listeners = [];
    }

    _pointerDown(event, container) {
        if (!this.active || !this.currentMap || event.data.button !== 0) return;
        const original = event.data.originalEvent;
        if (original?.shiftKey || original?.ctrlKey) return;
        const pos = event.data.getLocalPosition(container);
        const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
        const hit = this.propAtPoint(pos.x, pos.y);
        if (hit) {
            this.select(hit.id);
            this.pushUndo();
            this.drag = { id: hit.id, offsetX: pos.x / tw - 0.5 - hit.x, offsetY: pos.y / th - 0.5 - hit.y, moved: false };
            if (container) container.cursor = 'grabbing';
            return;
        }
        const tileX = Math.floor(pos.x / tw), tileY = Math.floor(pos.y / th);
        if (tileX < 0 || tileY < 0 || tileX >= this.currentMap.width || tileY >= this.currentMap.height) return;
        if (!this.model) {
            this.select(null);
            return;
        }
        this.place(tileX, tileY);
    }

    _pointerMove(event, container) {
        if (!this.active) return;
        if (!this.drag) {
            // The 3D view owns the ghost while it is up: the flat stage still
            // hears the pointer under it, and hiding from here on a 2D sprite
            // hit (an unrelated spot in 3D) made the 3D ghost flicker.
            if (this.mapEditor3D()?.isEnabled?.()) return;
            // Hovering with a model in hand: show what a click would place.
            const pos = event.data.getLocalPosition(container);
            const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
            const gx = Math.floor(pos.x / tw), gy = Math.floor(pos.y / th);
            if (this.model && !this.propAtPoint(pos.x, pos.y) && gx >= 0 && gy >= 0) this._showGhost(gx, gy);
            else this._hideGhost();
            return;
        }
        const pos = event.data.getLocalPosition(container);
        const tw = this.tilemapManager.TILE_WIDTH, th = this.tilemapManager.TILE_HEIGHT;
        // The flat map moves props a tile at a time; free placement is the 3D view's.
        const x = Math.round(pos.x / tw - 0.5 - this.drag.offsetX);
        const y = Math.round(pos.y / th - 0.5 - this.drag.offsetY);
        const prop = this.prop(this.drag.id);
        if (!prop || (prop.x === x && prop.y === y)) return;
        this.drag.moved = true;
        this.update(this.drag.id, { x, y }, { silent: true });
    }

    _pointerUp() {
        if (!this.drag) return;
        this.drag = null;
        const container = this.tilemapManager?.container;
        if (container) container.cursor = 'default';
    }

    _handleKeyDown(event) {
        this._handleUndoKeys(event);
        if (!this.active || !this.selectedId) return;
        const tag = event.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            this.remove(this.selectedId);
        }
    }

    _handleUndoKeys(event) {
        if (!this.active) return;
        // With a map editor the toolbar's own Ctrl+Z handler steps this history; a second handler would step it twice.
        if (this._mapEditor() && typeof this._mapEditor().recordPropsState === 'function') return;
        const tag = event.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
        if (!(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) { if (this.undo()) event.preventDefault(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { if (this.redo()) event.preventDefault(); }
    }

    //-------------------------------------------------------------------------
    // Panel

    initializeUI(container) {
        if (!container) return;
        this.panel = container;
        const t = key => this._t(key);
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const stepper = (id, min, max, step, value) => `
            <div class="rr-number-stepper" style="min-width: 0;">
                <input type="number" id="${id}" class="rr-number-stepper-input" min="${min}" max="${max}" step="${step}" value="${value}"
                    style="flex:1;min-width:0;width:100%;box-sizing:border-box;padding:4px 6px;border:0;background:transparent;color:var(--color-text);font-size:11px;">
                <div class="rr-number-stepper-buttons">
                    <button type="button" tabindex="-1" data-props-step="1" data-target="${id}" aria-label="+">&#9650;</button>
                    <button type="button" tabindex="-1" data-props-step="-1" data-target="${id}" aria-label="-">&#9660;</button>
                </div>
            </div>`;
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; height: 100%; min-height: 0; overflow-y: auto; background-color: var(--color-bg-menubar);">
                <div style="padding: 8px; background-color: var(--color-bg-list-item); border-bottom: 1px solid var(--color-border);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div id="model-props-preview" title="${escape(t('props.choose'))}" style="flex: 0 0 64px; width: 64px; height: 64px; border: 1px solid var(--color-border); border-radius: 3px; background: var(--color-bg-deep); display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;"></div>
                        <div style="flex: 1; min-width: 0;">
                            <div id="model-props-name" style="font-size: 11px; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escape(t('props.noModel'))}</div>
                            <div id="model-props-status" style="font-size: 10px; color: var(--color-text-muted); margin-top: 2px;">${escape(t('props.hintChoose'))}</div>
                            <button type="button" id="model-props-choose" class="map-props-btn primary" style="margin-top: 6px; padding: 3px 10px; font-size: 10px;">${escape(t('props.choose'))}</button>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; margin-top: 8px; font-size: 10px; color: var(--color-text-muted);">
                        <label style="grid-column: 1 / -1;">${escape(t('props.size'))}${stepper('model-props-size', 0.1, 64, 0.5, 2)}</label>
                        <label>${escape(t('props.direction'))}
                            <select id="model-props-direction" style="width: 100%; margin-top: 2px; font-size: 11px; padding: 3px 4px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;">
                                <option value="2">${escape(t('props.dirDown'))}</option>
                                <option value="4">${escape(t('props.dirLeft'))}</option>
                                <option value="6">${escape(t('props.dirRight'))}</option>
                                <option value="8">${escape(t('props.dirUp'))}</option>
                            </select>
                        </label>
                        <label>${escape(t('props.lift'))}${stepper('model-props-z', 0, 512, 0.25, 0)}</label>
                        <label>${escape(t('props.animation'))}
                            <select id="model-props-animation" style="width: 100%; margin-top: 2px; font-size: 11px; padding: 3px 4px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;"></select>
                            <label style="display: flex; align-items: center; gap: 4px; margin-top: 3px; color: var(--color-text); cursor: pointer;"><input type="checkbox" id="model-props-repeat"> ${escape(t('props.repeat'))}</label>
                        </label>
                        <label>${escape(t('props.effect'))}
                            <select id="model-props-effect" style="width: 100%; margin-top: 2px; font-size: 11px; padding: 3px 4px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;"></select>
                        </label>
                        <label style="grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; color: var(--color-text); cursor: pointer;">
                            <input type="checkbox" id="model-props-passable"> ${escape(t('props.passable'))}
                        </label>
                    </div>
                    <div id="model-props-card" style="margin-top: 8px; padding: 6px; background: var(--color-bg-deep); border: 1px solid var(--color-border); border-radius: 3px; font-size: 10px; color: var(--color-text-muted);">
                        <div id="model-props-card-tabs" style="display: flex; gap: 4px; margin-bottom: 6px;"></div>
                        <div id="model-props-card-body"></div>
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <button type="button" id="model-props-remove" class="map-props-btn" style="padding: 3px 10px; font-size: 10px;" disabled>${escape(t('props.remove'))}</button>
                        <button type="button" id="model-props-deselect" class="map-props-btn" style="padding: 3px 10px; font-size: 10px;" disabled>${escape(t('props.deselect'))}</button>
                    </div>
                </div>
                <div style="padding: 8px 10px; font-size: 10px; color: var(--color-text-muted); line-height: 1.4;">${escape(t('props.hintPlace'))}</div>
            </div>`;
        const byId = id => container.querySelector('#' + id);
        byId('model-props-choose')?.addEventListener('click', () => this.openModelPicker());
        byId('model-props-preview')?.addEventListener('click', () => this.openModelPicker());
        const readFields = () => {
            const number = (id, fallback) => {
                const value = Number(byId(id)?.value);
                return Number.isFinite(value) ? value : fallback;
            };
            this.fields = {
                // One size: the model's longest side in tiles. An old prop's
                // separate scale is folded into it the first time it is edited.
                size: Math.max(0.1, number('model-props-size', 2)),
                scale: 1,
                direction: Number(byId('model-props-direction')?.value) || 2,
                z: Math.max(0, number('model-props-z', 0)),
                passable: !!byId('model-props-passable')?.checked,
                yaw: this.fields.yaw || 0, pitch: this.fields.pitch || 0, roll: this.fields.roll || 0,
                animation: byId('model-props-animation')?.value || '',
                repeat: !!byId('model-props-repeat')?.checked,
                effect: byId('model-props-effect')?.value || ''
            };
            if (this.selectedId) this.update(this.selectedId, this.fields);
        };
        for (const id of ['model-props-size', 'model-props-z']) byId(id)?.addEventListener('change', readFields);
        byId('model-props-direction')?.addEventListener('change', readFields);
        byId('model-props-passable')?.addEventListener('change', readFields);
        byId('model-props-animation')?.addEventListener('change', readFields);
        byId('model-props-repeat')?.addEventListener('change', readFields);
        byId('model-props-effect')?.addEventListener('change', readFields);
        container.querySelectorAll('[data-props-step]').forEach(button => button.addEventListener('click', () => {
            const input = byId(button.dataset.target);
            if (!input) return;
            const direction = Number(button.dataset.propsStep) > 0 ? 1 : -1;
            try { direction > 0 ? input.stepUp() : input.stepDown(); } catch (_) {
                input.value = (Number(input.value) || 0) + direction * (Number(input.step) || 1);
            }
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }));
        byId('model-props-remove')?.addEventListener('click', () => { if (this.selectedId) this.remove(this.selectedId); });
        byId('model-props-deselect')?.addEventListener('click', () => this.select(null));
        this._syncPanel();
    }

    /**
     * Pick the model in the same picker events use: it shows the model,
     * turns it with the rings and sets its size, and that pose becomes the
     * prop's (or the selected prop's) base pose.
     */
    openModelPicker() {
        if (typeof ModelGraphicPicker === 'undefined') return;
        const picker = new ModelGraphicPicker(this.projectController);
        const current = this.model ? Object.assign({}, this.model, {
            size: this.fields.size, yaw: this.fields.yaw, pitch: this.fields.pitch, roll: this.fields.roll
        }) : null;
        picker.show(current, spec => {
            if (!spec || !spec.name) return;
            this.fields.size = spec.size > 0 ? spec.size : this.fields.size;
            this.fields.yaw = Number(spec.yaw) || 0;
            this.fields.pitch = Number(spec.pitch) || 0;
            this.fields.roll = Number(spec.roll) || 0;
            const model = { name: spec.name, ext: spec.ext, file: spec.file, texture: spec.texture || '' };
            if (this.selectedId) {
                this.model = model;
                this.update(this.selectedId, Object.assign({}, model, {
                    size: this.fields.size, yaw: this.fields.yaw, pitch: this.fields.pitch, roll: this.fields.roll
                }));
            } else {
                this.chooseModel(model);
            }
        }, {});
    }

    /** Action rule names and effect names the chosen model declares. */
    _modelChoices() {
        const project = this.project();
        const name = this.model && this.model.name;
        if (!project?.path || !name) return { actions: [], effects: [] };
        // Every rule, on demand or not: a continuous one plays on its own,
        // but listing it says what the model does.
        const actions = ModelPropsManager.modelRuleNames(project.path, name);
        // Effects with their trigger too: an "always" one plays on every
        // instance whether or not it is chosen here.
        const effects = ModelPropsManager.modelEffectNames(project.path, name);
        return { actions, effects };
    }

    /** Effect names with their trigger, e.g. "Animated Screen (always)". */
    static modelEffectNames(projectPath, modelName) {
        if (!projectPath || !modelName || typeof require !== 'function') return [];
        const fs = require('fs');
        const path = require('path');
        try {
            const parsed = JSON.parse(fs.readFileSync(path.join(projectPath, '3d', ...String(modelName).split('/'), 'model.json'), 'utf8'));
            const names = [];
            for (const effect of parsed.effects || []) {
                if (effect && effect.name && !names.some(entry => entry.name === effect.name)) {
                    names.push({ name: String(effect.name), trigger: effect.trigger || 'action' });
                }
            }
            return names;
        } catch (error) {
            return [];
        }
    }

    /** Rule names with their trigger, e.g. "sway (always)". */
    static modelRuleNames(projectPath, modelName) {
        if (!projectPath || !modelName || typeof require !== 'function') return [];
        const fs = require('fs');
        const path = require('path');
        try {
            const parsed = JSON.parse(fs.readFileSync(path.join(projectPath, '3d', ...String(modelName).split('/'), 'model.json'), 'utf8'));
            const names = [];
            for (const rule of parsed.animations || []) {
                if (rule && rule.name && !names.some(entry => entry.name === rule.name)) {
                    names.push({ name: String(rule.name), trigger: rule.trigger || 'action' });
                }
            }
            return names;
        } catch (error) {
            return [];
        }
    }

    _fillChoiceSelects() {
        const panel = this.panel;
        if (!panel) return;
        const { actions, effects } = this._modelChoices();
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const fill = (id, entries, current) => {
            const select = panel.querySelector('#' + id);
            if (!select) return;
            const list = entries.map(entry => (typeof entry === 'string' ? { name: entry, trigger: '' } : entry));
            if (current && !list.some(entry => entry.name === current)) list.unshift({ name: current, trigger: '' });
            select.innerHTML = `<option value="">${escape(this._t('props.none'))}</option>`
                + list.map(entry => `<option value="${escape(entry.name)}"${entry.name === current ? ' selected' : ''}>${escape(entry.name)}${entry.trigger && entry.trigger !== 'action' ? ` (${escape(entry.trigger)})` : ''}</option>`).join('');
            select.value = current || '';
            select.disabled = !this.model;
        };
        fill('model-props-animation', actions, this.fields.animation || '');
        fill('model-props-effect', effects, this.fields.effect || '');
        const repeat = panel.querySelector('#model-props-repeat');
        if (repeat) { repeat.checked = !!this.fields.repeat; repeat.disabled = !this.model; }
    }

    chooseModel(model) {
        // The animation and effect chosen belong to a model: picking the
        // same model again (to place another) keeps them, so a row of
        // consoles all get the screen chosen once; a different model starts
        // with none, since its names are different.
        const same = this.model && model && this.model.name === model.name && this.model.file === model.file;
        this.model = model;
        // A new model means a new placement, not a swap of the selected one.
        this.selectedId = null;
        if (!same) {
            this.fields.animation = '';
            this.fields.effect = '';
        }
        this.render();
        this._syncPanel();
        this.mapEditor3D()?.selectProp?.(null);
    }

    _syncPanel() {
        const panel = this.panel;
        if (!panel) return;
        const byId = id => panel.querySelector('#' + id);
        const prop = this.prop(this.selectedId);
        const shown = prop || null;
        const name = byId('model-props-name');
        const status = byId('model-props-status');
        if (name) name.textContent = shown ? shown.name : (this.model ? this.model.name : this._t('props.noModel'));
        if (status) {
            status.textContent = shown
                ? this._t('props.selected', { id: shown.id, x: shown.x, y: shown.y })
                : (this.model ? this._t('props.hintPlace') : this._t('props.hintChoose'));
        }
        if (byId('model-props-size')) byId('model-props-size').value = Math.round(this.fields.size * (this.fields.scale || 1) * 100) / 100;
        if (byId('model-props-direction')) byId('model-props-direction').value = String(this.fields.direction);
        if (byId('model-props-z')) byId('model-props-z').value = this.fields.z;
        if (byId('model-props-passable')) byId('model-props-passable').checked = !!this.fields.passable;
        if (byId('model-props-remove')) byId('model-props-remove').disabled = !shown;
        this._syncCard();
        if (byId('model-props-deselect')) byId('model-props-deselect').disabled = !shown;
        this._fillChoiceSelects();
        this._syncPreview(shown ? ModelPropsManager.specOf(shown) : (this.model ? { name: this.model.name, ext: this.model.ext, file: this.model.file, texture: this.model.texture, size: 1, scale: 1, yaw: this.fields.yaw, pitch: this.fields.pitch, roll: this.fields.roll } : null), shown ? shown.direction : this.fields.direction);
    }

    //-------------------------------------------------------------------------
    // Transform card: sliders for the selected prop's place, turn and size,
    // live on the map (and in 3D) as they move, with the number beside each.

    /** The values the card shows: the selected prop's, else the next placement's. */
    _cardValues() {
        const prop = this.prop(this.selectedId);
        const source = prop || this.fields;
        const stretch = Array.isArray(source.stretch) ? source.stretch : [1, 1, 1];
        return {
            x: prop ? prop.x : null, y: prop ? prop.y : null, z: source.z || 0,
            yaw: source.yaw || 0, pitch: source.pitch || 0, roll: source.roll || 0,
            size: Math.round((source.size || 2) * (source.scale || 1) * 100) / 100,
            sx: stretch[0], sy: stretch[1], sz: stretch[2]
        };
    }

    _cardRows() {
        const v = this._cardValues();
        const tab = this._cardTab || 'offset';
        if (tab === 'rotate') {
            return [['yaw', this._tx('Yaw'), -180, 180, 1, v.yaw, '°'], ['pitch', this._tx('Pitch'), -180, 180, 1, v.pitch, '°'], ['roll', this._tx('Roll'), -180, 180, 1, v.roll, '°']];
        }
        if (tab === 'scale') {
            const proportional = this._cardProportional !== false && v.sx === 1 && v.sy === 1 && v.sz === 1 ? true : this._cardProportional === true;
            const rows = [['size', this._t('props.size'), 0.1, 20, 0.05, v.size, '']];
            if (!proportional) rows.push(['sx', 'X', 0.1, 4, 0.01, v.sx, '×'], ['sy', 'Y', 0.1, 4, 0.01, v.sy, '×'], ['sz', 'Z', 0.1, 4, 0.01, v.sz, '×']);
            return rows;
        }
        const x = v.x == null ? 0 : v.x, y = v.y == null ? 0 : v.y;
        return [['x', 'X', Math.max(0, x - 4), x + 4, 0.05, x, ''], ['y', 'Y', Math.max(0, y - 4), y + 4, 0.05, y, ''], ['z', 'Z', 0, 32, 0.05, v.z, '']];
    }

    /** Build the card for the current tab and selection; sliders edit live. */
    _renderCard() {
        const panel = this.panel;
        const tabs = panel && panel.querySelector('#model-props-card-tabs');
        const body = panel && panel.querySelector('#model-props-card-body');
        if (!tabs || !body) return;
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const tab = this._cardTab || 'offset';
        tabs.innerHTML = [['offset', this._tx('Coordinates')], ['rotate', this._tx('Rotate')], ['scale', this._tx('Scale')]]
            .map(([id, label]) => `<button type="button" class="map-props-btn${id === tab ? ' primary' : ''}" data-card-tab="${id}" style="flex: 1; padding: 2px 4px; font-size: 10px;">${escape(label)}</button>`).join('');
        const v = this._cardValues();
        const hasProp = !!this.prop(this.selectedId);
        const rows = this._cardRows();
        const proportional = !rows.some(r => r[0] === 'sx');
        body.innerHTML = rows.map(([key, label, min, max, step, value, unit]) => `
            <div style="display: grid; grid-template-columns: 26px 1fr 58px; gap: 4px; align-items: center; margin: 2px 0;${(key === 'x' || key === 'y') && !hasProp ? ' opacity: 0.4;' : ''}">
                <span style="color: var(--color-text);">${escape(label)}</span>
                <input type="range" class="mp-card-slider" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" style="width: 100%; min-width: 0;"${(key === 'x' || key === 'y') && !hasProp ? ' disabled' : ''}>
                <input type="number" class="mp-card-num" data-key="${key}" data-no-stepper min="${key === 'x' || key === 'y' ? 0 : min}" max="${key === 'x' || key === 'y' ? 9999 : max}" step="${step}" value="${value}" title="${escape(unit)}"
                    style="width: 100%; box-sizing: border-box; font-size: 10px; padding: 2px 3px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;"${(key === 'x' || key === 'y') && !hasProp ? ' disabled' : ''}>
            </div>`).join('')
            + (tab === 'scale' ? `<label style="display: flex; align-items: center; gap: 6px; margin-top: 4px; color: var(--color-text); cursor: pointer;"><input type="checkbox" class="mp-card-proportional"${proportional ? ' checked' : ''}> ${escape(this._t('r3dcard.proportional'))}</label>` : '');
        tabs.querySelectorAll('[data-card-tab]').forEach(button => button.addEventListener('click', () => {
            this._cardTab = button.dataset.cardTab;
            this._renderCard();
        }));
        const apply = (key, raw, live) => {
            const value = Number(raw);
            if (!Number.isFinite(value)) return;
            this._cardApply(key, value, live);
        };
        body.querySelectorAll('.mp-card-slider').forEach(slider => {
            slider.addEventListener('input', () => {
                const num = body.querySelector(`.mp-card-num[data-key="${slider.dataset.key}"]`);
                if (num) num.value = slider.value;
                apply(slider.dataset.key, slider.value, true);
            });
            slider.addEventListener('change', () => { this._cardUndoPushed = false; });
        });
        body.querySelectorAll('.mp-card-num').forEach(num => num.addEventListener('change', () => {
            const slider = body.querySelector(`.mp-card-slider[data-key="${num.dataset.key}"]`);
            if (slider) slider.value = num.value;
            apply(num.dataset.key, num.value, false);
            this._cardUndoPushed = false;
        }));
        const box = body.querySelector('.mp-card-proportional');
        if (box) box.addEventListener('change', () => {
            this._cardProportional = box.checked;
            if (box.checked) this._cardApply('stretch', [1, 1, 1], false);
            this._renderCard();
        });
        this._cardFor = `${this.selectedId || ''}|${tab}|${this.model ? this.model.name : ''}`;
    }

    /** One card value changed: patch the selected prop (undo once per drag), or the next placement's fields. */
    _cardApply(key, value, live) {
        let patch;
        if (key === 'size') patch = { size: value, scale: 1 };
        else if (key === 'stretch') patch = { stretch: value };
        else if (key === 'sx' || key === 'sy' || key === 'sz') {
            const v = this._cardValues();
            const stretch = [v.sx, v.sy, v.sz];
            stretch[{ sx: 0, sy: 1, sz: 2 }[key]] = value;
            patch = { stretch };
        } else patch = { [key]: value };
        const id = this.selectedId;
        if (id && this.prop(id)) {
            if (!this._cardUndoPushed) { this.pushUndo(); this._cardUndoPushed = true; }
            this._cardLive = true;
            this.update(id, patch, { silent: true });
            this._cardLive = false;
            if (!live) this._cardUndoPushed = false;
            return;
        }
        if ('x' in patch || 'y' in patch) return;
        if ('size' in patch) { this.fields.size = patch.size; this.fields.scale = 1; }
        else if ('stretch' in patch) this.fields.stretch = patch.stretch;
        else Object.assign(this.fields, patch);
        this._syncPanel();
    }

    /** Keep the card's numbers true without rebuilding it mid-drag. */
    _syncCard() {
        const panel = this.panel;
        if (!panel || !panel.querySelector('#model-props-card-body')) return;
        const key = `${this.selectedId || ''}|${this._cardTab || 'offset'}|${this.model ? this.model.name : ''}`;
        // A different prop, tab or model: build the card afresh. The same
        // one, mid-drag or not: only its numbers move.
        if (this._cardFor !== key) { this._renderCard(); return; }
        const v = this._cardValues();
        const values = { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, roll: v.roll, size: v.size, sx: v.sx, sy: v.sy, sz: v.sz };
        for (const input of panel.querySelectorAll('.mp-card-slider, .mp-card-num')) {
            const next = values[input.dataset.key];
            if (next == null) continue;
            if (document.activeElement === input) continue;
            if (String(input.value) !== String(next)) input.value = next;
        }
    }

    /** The prop the next click would place, as a spec, or null without a model. */
    _placementSpec() {
        if (!this.model || typeof Reactor3D === 'undefined' || !Reactor3D.normalizeModelSpec) return null;
        // Asked on every pointer move: the same spec object comes back until a field changes.
        const f = this.fields;
        const key = `${this.model.name}|${this.model.ext}|${this.model.file}|${this.model.texture}|${f.size}|${f.scale}|${(f.stretch || []).join(',')}|${f.yaw}|${f.pitch}|${f.roll}`;
        if (this._placementSpecKey === key && this._placementSpecValue) return this._placementSpecValue;
        this._placementSpecKey = key;
        this._placementSpecValue = Reactor3D.normalizeModelSpec(ModelPropsManager.specOf({
            name: this.model.name, ext: this.model.ext, file: this.model.file, texture: this.model.texture,
            size: f.size, scale: f.scale, stretch: f.stretch, yaw: f.yaw, pitch: f.pitch, roll: f.roll
        }));
        return this._placementSpecValue;
    }

    /** A half-seen copy of the model under the cursor on the flat map: what a click would place. */
    _showGhost(x, y) {
        const container = this._ensureContainer();
        if (!container || !this.model) return;
        const tw = this.tilemapManager?.TILE_WIDTH || 48;
        const th = this.tilemapManager?.TILE_HEIGHT || tw;
        const fake = { id: 0, name: this.model.name, ext: this.model.ext, file: this.model.file, texture: this.model.texture,
            x, y, z: this.fields.z, direction: this.fields.direction, yaw: this.fields.yaw, pitch: this.fields.pitch, roll: this.fields.roll,
            size: this.fields.size, scale: this.fields.scale, stretch: this.fields.stretch };
        if (this._ghost && (this._ghost.parent !== container || this._ghostKey !== `${this.model.name}|${fake.size}|${fake.scale}|${fake.direction}`)) {
            this._ghost.parent?.removeChild(this._ghost);
            this._ghost = null;
        }
        if (!this._ghost) {
            const sprite = this._spriteFor(fake, tw, th);
            if (!sprite) return;
            sprite.alpha = 0.5;
            sprite.eventMode = 'none';
            container.addChild(sprite);
            this._ghost = sprite;
            this._ghostKey = `${this.model.name}|${fake.size}|${fake.scale}|${fake.direction}`;
        }
        this._ghost.visible = true;
        this._ghost.x = (x + 0.5) * tw;
        this._ghost.y = (y + 0.5) * th - fake.z * th;
    }

    _hideGhost(also3D = false) {
        if (this._ghost) this._ghost.visible = false;
        if (also3D) this.mapEditor3D()?.hidePlacementGhost?.();
    }

    _syncPreview(rawSpec, direction) {
        const box = this.panel?.querySelector('#model-props-preview');
        if (!box) return;
        if (!rawSpec || typeof RREventPreviewModels === 'undefined' || typeof Reactor3D === 'undefined' || !Reactor3D.normalizeModelSpec) {
            box.innerHTML = '';
            if (rawSpec) {
                const map3d = this.mapEditor3D();
                if (map3d?.ensureLibraries && !this._loadingLibraries) {
                    this._loadingLibraries = map3d.ensureLibraries().then(ready => {
                        this._loadingLibraries = null;
                        if (ready) this._syncPanel();
                    }).catch(() => { this._loadingLibraries = null; });
                }
            }
            return;
        }
        const spec = Reactor3D.normalizeModelSpec(Object.assign({}, rawSpec, { size: 1, scale: 1 }));
        if (!spec) { box.innerHTML = ''; return; }
        const token = (this._previewToken = (this._previewToken || 0) + 1);
        RREventPreviewModels.thumbnail(this.project(), spec, this.mapEditor3D(), 60, direction || 2).then(result => {
            if (token !== this._previewToken) return;
            if (!result) { box.innerHTML = ''; return; }
            box.innerHTML = `<img src="${result.url}" alt="" style="max-width: 100%; max-height: 100%; image-rendering: pixelated;">`;
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelPropsManager;
}
