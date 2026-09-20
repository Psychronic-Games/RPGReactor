/**
 * PieceBuilderManager - the Pieces tab: a 3D tileset painted on a 3D map.
 *
 * A piece is a block of one kind (wall block, floor, pillar, stair, ramp,
 * gable roof, doorway, window, fence) on a cell at a level, turned in
 * quarter turns, wearing a material image from img/materials. Laying them
 * happens in the 3D view (MapEditor3D asks `active` and calls
 * `beginStroke` / `paintAt` / `endStroke` with a cell and level); this owns
 * the chosen piece, the panel and an undo stack of whole piece lists.
 */
class PieceBuilderManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.active = false;
        this.kind = 'wall';
        this.rot = 0;
        this.level = 0;
        this.material = '';
        this.mode = 'place';
        this.structure = '';
        this.selectedGroup = 0;
        this.panel = null;
        this.undoStack = [];
        this.redoStack = [];
        this._stroke = null;
        this._onKeyDown = event => this.handleKey(event);
        this._materialsCache = null;
        // What the next shape, screen or light is made of.
        this.shapeScale = 1;
        this.lastShape = 'cylinder';
        this.screenMedia = '';
        this.lightColour = '#9fd8ff';
        // Sizes chosen in the specs panel, per kind; a stair run's length; the selected piece and its handle mode.
        this.sizes = {};
        this.stairSteps = 1;
        this.selected = 0;
        this.gizmoMode = 'move';
    }

    // ---- Selection: a placed piece picked up again --------------------------

    pieceById(id) { const map = this.currentMap(); return map && id ? (this.elevation()?.pieces(map) || []).find(piece => piece.id === id) || null : null; }
    selectedPiece() { return this.pieceById(this.selected); }
    isShape(kind) { const E = this.elevation(); return !!(E && E.SHAPE_KINDS && E.SHAPE_KINDS.includes(kind)); }

    /** The piece under a target: the one on the cell at the level, else the shape whose footprint covers it. */
    pieceAtTarget(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return null;
        const exact = elevation.pieceAt(map, target.x, target.y, target.z);
        if (exact) return exact;
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        const stack = R && R.piecesAt ? R.piecesAt(map, target.x, target.y) : null;
        if (!stack || !stack.length) return null;
        const wanted = Number.isFinite(target.height) ? target.height : target.z;
        let best = null;
        for (const entry of stack) {
            const top = R.pieceTop(entry, 0.5, 0.5);
            if (wanted < entry.z - 0.05 || wanted > top + 0.05) continue;
            if (!best || entry.z >= best.z) best = entry;
        }
        if (!best) best = stack[stack.length - 1];
        return this.pieceById(best.id);
    }

    selectAt(target) {
        const piece = this.pieceAtTarget(target);
        this.selected = piece ? piece.id : 0;
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return piece;
    }

    clearSelection() { if (!this.selected) return; this.selected = 0; this._syncPanel(); this._ghostChanged(); }

    /** Change the selected piece in place (a material, a turn, a size, a move); the list keeps its ids. */
    updateSelected(patch, record = true) {
        const map = this.currentMap(), elevation = this.elevation();
        const piece = this.selectedPiece();
        if (!map || !elevation || !piece) return false;
        const list = elevation.pieces(map);
        const index = list.findIndex(entry => entry.id === piece.id);
        if (index < 0) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        const before = list[index];
        const next = Object.assign({}, before, patch);
        list[index] = next;
        elevation.restorePieces(map, list);
        const reach = this.isShape(next.kind) ? Math.ceil(Math.max(...(next.size || [1, 1, 1])) / 2) + 1 : 1;
        this.announce(false, { x0: Math.min(before.x, next.x) - reach, y0: Math.min(before.y, next.y) - reach, x1: Math.max(before.x, next.x) + reach, y1: Math.max(before.y, next.y) + reach });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    /** The selected piece's middle to a point of the ground, in tiles (a shape at any quarter, a cell piece on its cell). */
    moveSelectedPieceTo(cx, cy, z, record = true) {
        const piece = this.selectedPiece();
        if (!piece) return false;
        const map = this.currentMap();
        const clamp = (v, max) => Math.max(0, Math.min(max, v));
        if (this.isShape(piece.kind)) {
            const ax = clamp(Math.floor(cx), map.width - 1), ay = clamp(Math.floor(cy), map.height - 1);
            const patch = { x: ax, y: ay, offset: [Math.round((cx - ax - 0.5) * 100) / 100, Math.round((cy - ay - 0.5) * 100) / 100] };
            if (Number.isFinite(z)) patch.z = Math.max(0, Math.round(z * 4) / 4);
            return this.updateSelected(patch, record);
        }
        const patch = { x: clamp(Math.floor(cx), map.width - 1), y: clamp(Math.floor(cy), map.height - 1) };
        if (Number.isFinite(z)) patch.z = Math.max(0, Math.floor(z));
        return this.updateSelected(patch, record);
    }

    turnSelected(steps = 1) {
        const piece = this.selectedPiece();
        if (!piece) return false;
        return this.isShape(piece.kind) ? this.updateSelected({ angle: (((piece.angle || 0) + 90 * steps) % 360 + 360) % 360 }) : this.updateSelected({ rot: ((piece.rot + steps) % 4 + 4) % 4 });
    }

    removeSelected() {
        const map = this.currentMap(), elevation = this.elevation(), piece = this.selectedPiece();
        if (!map || !elevation || !piece) return false;
        this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        elevation.restorePieces(map, elevation.pieces(map).filter(entry => entry.id !== piece.id));
        this.selected = 0;
        const reach = this.isShape(piece.kind) ? Math.ceil(Math.max(...(piece.size || [1, 1, 1])) / 2) + 1 : 1;
        this.announce(false, { x0: piece.x - reach, y0: piece.y - reach, x1: piece.x + reach, y1: piece.y + reach });
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    /** The size the next piece of a kind takes: the panel's choice, else the kind's own. */
    sizeFor(kind) {
        if (this.sizes[kind]) return this.sizes[kind].slice();
        if (kind === 'wedge') return [2, 1, 3];
        return this.shapeSizeFor(kind);
    }
    setSize(kind, size) { this.sizes[kind] = size.map(v => Math.max(0.25, Math.min(60, Math.round(v * 4) / 4))); this._syncPanel(); this._ghostChanged(); }
    /** The way a piece's own +v points for its turn: the direction a stair climbs, a ramp rises. */
    static stepOf(rot) { return [[0, 1], [-1, 0], [0, -1], [1, 0]][((rot % 4) + 4) % 4]; }

    /** The movies and pictures a screen can show. */
    mediaChoices() {
        const projectPath = this.projectPath();
        if (!projectPath || typeof require !== 'function') return [];
        try {
            const fs = require('fs'), path = require('path');
            const list = dir => { try { return fs.readdirSync(path.join(projectPath, ...dir)).filter(f => !f.startsWith('.')); } catch (error) { return []; } };
            const media = list(['movies']).filter(f => /\.(webm|mp4|ogv|m4v)$/i.test(f)).concat(list(['img', 'pictures']).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))).sort();
            if (!this.screenMedia && media.length) this.screenMedia = media.find(f => /starfield/i.test(f)) || media[0];
            return media;
        } catch (error) { return []; }
    }

    /** A shape's size for the next placement: its kind's own, scaled. */
    shapeSizeFor(kind) {
        const E = typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor : null;
        const base = (E && E.SHAPE_DEFAULTS && E.SHAPE_DEFAULTS[kind]) || [2, 2, 2];
        return base.map(v => Math.max(0.25, Math.round(v * this.shapeScale * 4) / 4));
    }

    /**
     * A screen on the wall face pointed at, or a light over the cell: written
     * straight onto the map, no plan, undone with the pieces.
     */
    placeEffectAt(target) {
        const map = this.currentMap(), SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!map || !SP || !target) return false;
        let fx = null;
        if (this.mode === 'screen') {
            if (!target.side || !target.faceCell) { this._flash('build.screenNeedsWall'); return false; }
            const size = this.screenSize || [4, 2.25];
            fx = { type: 'screen', name: 'screen', at: [target.faceCell.x, target.faceCell.y], facing: target.side, width: size[0], height: size[1], z: Math.max(0, Math.round((target.height - size[1] / 2) * 4) / 4), media: this.screenMedia || '' };
        } else if (this.mode === 'light') {
            fx = { type: 'light', name: 'light', at: [target.x, target.y], z: Math.round((target.side ? target.height : target.height + 2.5) * 4) / 4, color: this.lightColour, radius: this.lightRadius || 8, intensity: Number.isFinite(this.lightIntensity) ? this.lightIntensity : 1.2 };
        }
        if (!fx) return false;
        this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        SP.addEffects(map, [fx], null);
        this._effectsChanged();
        return true;
    }

    /** The nearest screen or light within a tile of the cell, taken off the map. */
    removeEffectAt(map, target) {
        const sidecar = map && map.reactor3d;
        if (!sidecar) return false;
        const near = (x, y) => Math.abs(x - (target.x + 0.5)) <= 1 && Math.abs(y - (target.y + 0.5)) <= 1;
        const rows = Array.isArray(sidecar.mediaSurfaces) ? sidecar.mediaSurfaces : [];
        const row = rows.find(r => r && r.target === 'map' && near(Number(r.x), Number(r.y)));
        if (row) { sidecar.mediaSurfaces = rows.filter(r => r !== row); if (!sidecar.mediaSurfaces.length) delete sidecar.mediaSurfaces; this._effectsChanged(); return true; }
        const lights = Array.isArray(sidecar.lights) ? sidecar.lights : [];
        const light = lights.find(l => l && near(Number(l.x), Number(l.y)));
        if (light) { sidecar.lights = lights.filter(l => l !== light); if (!sidecar.lights.length) delete sidecar.lights; this._effectsChanged(); return true; }
        return false;
    }

    _effectsChanged() {
        window.reactor?.lightingManager?.render?.();
        window.reactor?.mediaSurfaceManager?.render?.();
        this.projectController?.mediaSurfacePreviewManager?.refresh?.();
        window.reactor?.mapEditor3D?.refreshLights?.();
        this.announce(false);
    }

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    elevation() { return typeof RRMapElevation !== 'undefined' ? RRMapElevation : (window.RRMapElevation || null); }
    currentMap() { return this.projectController?.getTilemapManager?.()?.currentMap || null; }
    projectPath() {
        const pc = this.projectController;
        const project = pc?.getCurrentProject ? pc.getCurrentProject() : pc?.currentProject;
        return project?.path || null;
    }
    kinds() { return this.elevation()?.PIECE_KINDS || ['wall', 'block', 'floor', 'pillar', 'stair', 'ramp', 'roof', 'doorway', 'window', 'fence']; }

    /** The images under img/materials, each once, as {name, url}. */
    materials(refresh = false) {
        if (this._materialsCache && !refresh) return this._materialsCache;
        const projectPath = this.projectPath();
        let list = [];
        try {
            if (projectPath && typeof RRAssetFiles !== 'undefined' && typeof require === 'function') {
                const path = require('path');
                const directory = path.join(projectPath, 'img', 'materials');
                list = RRAssetFiles.listImages(directory).map(record => ({
                    name: record.imageReference || record.name,
                    url: RRAssetFiles.imageUrlFor(directory, record.imageReference || record.name)
                }));
            }
        } catch (error) {
            console.warn('The materials folder could not be read.', error);
            list = [];
        }
        this._materialsCache = list;
        return list;
    }

    /** The colour a kind shows in the flat map's overlay. */
    static OVERLAY_COLOURS = { wall: 0x9a9a9a, block: 0x8c8c8c, floor: 0xc99a5b, pillar: 0xdcdcdc, stair: 0xa87b4a, ramp: 0xb05a4a, roof: 0xc1443c, doorway: 0x3fa34d, window: 0x5b9fe8, fence: 0xb8864b, glass: 0x9fd8ff, dome: 0xb07a9a, cylinder: 0x8f8fa8, cone: 0xb8a04b, box: 0x8c8c8c, wedge: 0xb05a4a, pyramid: 0xb8a04b, prism: 0xc1443c, tube: 0x8f8fa8, sphere: 0xb07a9a, arch: 0x3fa34d, tunnel: 0x3fa34d, ring: 0xb07a9a, hull: 0x8f8fa8, spike: 0xb8a04b, capsule: 0x8f8fa8, dish: 0x8fa8a8, fin: 0xa88f8f };

    /**
     * What each cell shows in the flat map: its topmost piece's kind and
     * level, so a building reads as a plan from above — walls grey, floors
     * tan, doors green, windows blue, roofs red — one entry per cell.
     */
    static cellSummary(pieces, storey = 5) {
        // The ground storey is the plan: a roof over it is not what an author
        // wants to see from above. A cell with nothing in the ground storey
        // (an overhang, a bridge) shows its topmost piece instead.
        const cells = new Map();
        for (const piece of pieces) {
            const key = piece.x + ',' + piece.y;
            const top = cells.get(key);
            const better = !top
                || (piece.z < storey && top.z >= storey)
                || (piece.z < storey) === (top.z < storey) && (piece.z > top.z || (piece.z === top.z && piece.kind !== 'floor' && top.kind === 'floor'));
            if (better) cells.set(key, { x: piece.x, y: piece.y, z: piece.z, kind: piece.kind });
        }
        return Array.from(cells.values());
    }

    /** The map changed under the tool: the flat overlay follows it. */
    setMap(mapData, tilemapManager) {
        this.tilemapManager = tilemapManager || this.tilemapManager;
        this.selectedGroup = 0;
        this.undoStack = []; this.redoStack = [];
        this.render2D();
        if (this.panel) { this.renderStructures(true); this.refreshStatus(); this._syncPanel(); }
    }

    _ensureOverlay() {
        const parent = this.tilemapManager?.container;
        if (!parent || typeof PIXI === 'undefined') return null;
        if (this.overlay && this.overlay.parent !== parent) {
            this.overlay.parent?.removeChild(this.overlay);
            if (!this.overlay.destroyed) this.overlay.destroy({ children: true });
            this.overlay = null;
        }
        if (!this.overlay) {
            this.overlay = new PIXI.Container();
            this.overlay.label = 'pieces overlay';
            this.overlay.eventMode = 'none';
            parent.addChild(this.overlay);
        }
        return this.overlay;
    }

    /**
     * Draw the pieces on the flat map. Pieces are map content, so this is
     * drawn whichever tab is up: the 2D view is otherwise blind to a house.
     */
    render2D() {
        const container = this._ensureOverlay();
        if (!container) return;
        for (const child of container.removeChildren()) child.destroy({ children: true });
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return;
        const cells = PieceBuilderManager.cellSummary(elevation.pieces(map));
        if (!cells.length) return;
        const tw = this.tilemapManager?.TILE_WIDTH || 48, th = this.tilemapManager?.TILE_HEIGHT || tw;
        const byKind = new Map();
        for (const cell of cells) (byKind.get(cell.kind) || byKind.set(cell.kind, []).get(cell.kind)).push(cell);
        for (const [kind, list] of byKind) {
            const graphics = new PIXI.Graphics();
            for (const cell of list) graphics.rect(cell.x * tw + 1, cell.y * th + 1, tw - 2, th - 2);
            // Higher pieces a little bolder, so an upper floor reads over a lower one.
            graphics.fill({ color: PieceBuilderManager.OVERLAY_COLOURS[kind] || 0x888888, alpha: 0.45 });
            graphics.eventMode = 'none';
            container.addChild(graphics);
        }
    }

    static ICONS = {
        wall: 'M4 4h16v17H4z M4 9h16 M4 15h16 M10 4v5 M14 9v6 M8 15v6',
        block: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
        floor: 'M3 13l9-4 9 4-9 4z M3 13v2l9 4 9-4v-2',
        pillar: 'M8 4h8 M9 4v16 M15 4v16 M7 20h10 M9 6h6',
        stair: 'M3 20h5v-4h4v-4h4v-4h5 M3 20v-4h5 M8 16v-4h4 M12 12V8h4',
        ramp: 'M3 19h18V7z M3 19v2h18v-2',
        roof: 'M3 14l9-9 9 9 M5 14v6h14v-6 M9 20v-4h6v4',
        doorway: 'M5 20V5h14v15 M9 20v-9h6v9',
        window: 'M4 4h16v16H4z M9 8h6v6H9z M12 8v6 M9 11h6',
        fence: 'M5 21V9l2-3 2 3v12 M15 21V9l2-3 2 3v12 M9 12h6 M9 17h6',
        glass: 'M5 3h14v18H5z M8 6l-2 2 M12 6l-6 6 M16 6l-8 8',
        dome: 'M3 17a9 9 0 0 1 18 0 M3 17h18v3H3z M12 8v-3',
        cylinder: 'M5 6a7 2.5 0 0 0 14 0a7 2.5 0 0 0-14 0 M5 6v12a7 2.5 0 0 0 14 0V6',
        cone: 'M12 3l8 16H4z M4 19a8 2 0 0 0 16 0',
        box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
        wedge: 'M4 18h16l-16-9z M4 9v9 M20 18l-2 2H2l2-2',
        pyramid: 'M12 4l9 14H3z M12 4v14 M3 18l9-3 9 3',
        prism: 'M4 18h13L10.5 7z M10.5 7l3-3L20 15l-3 3',
        tube: 'M5 6a7 2.5 0 0 0 14 0a7 2.5 0 0 0-14 0 M5 6v12a7 2.5 0 0 0 14 0V6 M9 6a3 1 0 0 0 6 0a3 1 0 0 0-6 0',
        sphere: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3a4.5 9 0 0 0 0 18',
        arch: 'M4 20V10a8 8 0 0 1 16 0v10 M8 20v-9a4 4 0 0 1 8 0v9 M4 20h4 M16 20h4',
        tunnel: 'M4 19V11a8 8 0 0 1 16 0v8 M8 19v-7a4 4 0 0 1 8 0v7 M4 19h4 M16 19h4 M8 12L5 8 M16 12l3-4',
        ring: 'M12 4a8 4 0 1 0 0 8a8 4 0 1 0 0-8 M12 6.5a3.5 1.5 0 1 0 0 3a3.5 1.5 0 1 0 0-3 M4 8v6a8 4 0 0 0 16 0V8',
        hull: 'M6 5h12l3 3v8l-3 3H6l-3-3V8z M6 5l2 2h8l2-2 M6 19l2-2h8l2 2',
        spike: 'M12 2l4 17H8z M8 19a4 1.5 0 0 0 8 0',
        capsule: 'M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0z M8 9h8 M8 15h8',
        dish: 'M3 8a9 9 0 0 0 18 0 M3 8h18 M12 14v6 M9 20h6',
        fin: 'M4 20h16v-9L13 3H4z M4 11h9'
    };

    initializeUI(container) {
        if (!container) return;
        this.panel = container;
        const t = key => this._t(key);
        if (!container.querySelector('.rr-pieces-panel')) {
            const icon = kind => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${PieceBuilderManager.ICONS[kind]}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
            container.innerHTML = `
                <div class="rr-pieces-panel" style="display: flex; flex-direction: column; gap: 10px; padding: 10px; overflow-y: auto; min-height: 0;">
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.hint">${t('pieces.hint')}</div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="pieces.piece">${t('pieces.piece')}</div>
                    <div class="rr-pieces-kinds" role="radiogroup" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                        ${this.kinds().map(kind => `<button type="button" class="rr-btn-secondary rr-pieces-kind" data-piece-kind="${kind}" role="radio" aria-checked="${kind === this.kind}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px 2px; font-size: 11px;">${icon(kind)}<span data-i18n="pieces.kind.${kind}">${t('pieces.kind.' + kind)}</span></button>`).join('')}
                    </div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="pieces.material">${t('pieces.material')}</div>
                    <div class="rr-pieces-materials" role="radiogroup" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                    <div class="rr-pieces-materials-hint" style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.materialsHint">${t('pieces.materialsHint')}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; align-items: center; font-size: 11px; color: var(--color-text-muted);">
                        <button type="button" class="rr-btn-secondary rr-pieces-turn" style="padding: 5px;"><span data-i18n="pieces.turn">${t('pieces.turn')}</span> <span class="rr-pieces-rot-value" style="color: var(--color-text);">0°</span></button>
                        <div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
                            <button type="button" class="rr-btn-secondary rr-pieces-level-down" style="padding: 4px 8px;" aria-label="-">−</button>
                            <span><span data-i18n="pieces.level">${t('pieces.level')}</span> <span class="rr-pieces-level-value" style="color: var(--color-text);">0</span></span>
                            <button type="button" class="rr-btn-secondary rr-pieces-level-up" style="padding: 4px 8px;" aria-label="+">+</button>
                        </div>
                    </div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="pieces.structure">${t('pieces.structure')}</div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <select class="rr-pieces-structure database-field-value" style="flex: 1; min-width: 0;"></select>
                        <button type="button" class="rr-btn-secondary rr-pieces-stamp" role="radio" aria-checked="false" style="padding: 5px 8px; font-size: 12px; white-space: nowrap;" data-i18n="pieces.stamp">${t('pieces.stamp')}</button>
                    </div>
                    <div class="rr-pieces-structure-hint" style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.stampHint">${t('pieces.stampHint')}</div>
                    <div class="rr-pieces-modes" role="radiogroup" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        ${['place', 'erase', 'move'].map(mode => `<button type="button" class="rr-btn-secondary rr-pieces-mode" data-piece-mode="${mode}" role="radio" aria-checked="${mode === this.mode}" style="padding: 6px 4px; font-size: 12px;" data-i18n="pieces.${mode}">${t('pieces.' + mode)}</button>`).join('')}
                        <button type="button" class="rr-btn-secondary rr-pieces-remove-structure" style="padding: 6px 4px; font-size: 12px;" disabled data-i18n="pieces.removeStructure">${t('pieces.removeStructure')}</button>
                    </div>
                    <div class="rr-pieces-transform" style="display: none; gap: 4px; align-items: center; font-size: 11px; color: var(--color-text-muted);">
                        <button type="button" class="rr-btn-secondary rr-pieces-rotate-structure" style="padding: 5px 8px;" data-i18n="pieces.rotate">${t('pieces.rotate')}</button>
                        <span data-i18n="pieces.scale">${t('pieces.scale')}</span>
                        <button type="button" class="rr-btn-secondary rr-pieces-scale-down" style="padding: 4px 8px;" aria-label="-">−</button>
                        <span class="rr-pieces-scale-value" style="color: var(--color-text);">1</span>
                        <button type="button" class="rr-btn-secondary rr-pieces-scale-up" style="padding: 4px 8px;" aria-label="+">+</button>
                    </div>
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.moveHint">${t('pieces.moveHint')}</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button type="button" class="rr-btn-secondary rr-pieces-undo" style="flex: 1; padding: 5px;" data-i18n="pieces.undo">${t('pieces.undo')}</button>
                        <button type="button" class="rr-btn-secondary rr-pieces-redo" style="flex: 1; padding: 5px;" data-i18n="pieces.redo">${t('pieces.redo')}</button>
                    </div>
                    <button type="button" class="rr-btn-secondary rr-pieces-clear" style="padding: 5px;" data-i18n="pieces.clear">${t('pieces.clear')}</button>
                    <div class="rr-pieces-status" style="font-size: 11px; color: var(--color-text-muted);" data-rr-i18n-skip></div>
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.keys">${t('pieces.keys')}</div>
                </div>`;
            container.querySelectorAll('.rr-pieces-kind').forEach(button => button.addEventListener('click', () => this.setKind(button.dataset.pieceKind)));
            container.querySelectorAll('.rr-pieces-mode').forEach(button => button.addEventListener('click', () => this.setMode(button.dataset.pieceMode)));
            container.querySelector('.rr-pieces-turn').addEventListener('click', () => this.turn());
            container.querySelector('.rr-pieces-level-down').addEventListener('click', () => this.setLevel(this.level - 1));
            container.querySelector('.rr-pieces-level-up').addEventListener('click', () => this.setLevel(this.level + 1));
            container.querySelector('.rr-pieces-undo').addEventListener('click', () => this.undo());
            container.querySelector('.rr-pieces-redo').addEventListener('click', () => this.redo());
            container.querySelector('.rr-pieces-clear').addEventListener('click', () => this.clear());
            container.querySelector('.rr-pieces-remove-structure').addEventListener('click', () => this.removeSelectedGroup());
            container.querySelector('.rr-pieces-rotate-structure').addEventListener('click', () => this.rotateSelected());
            container.querySelector('.rr-pieces-scale-down').addEventListener('click', () => this.scaleSelected(-1));
            container.querySelector('.rr-pieces-scale-up').addEventListener('click', () => this.scaleSelected(1));
            container.querySelector('.rr-pieces-structure').addEventListener('change', event => { this.structure = event.target.value || ''; if (this.structure) this.setMode('stamp'); });
            container.querySelector('.rr-pieces-stamp').addEventListener('click', () => this.setMode(this.mode === 'stamp' ? 'place' : 'stamp'));
        }
        this.renderStructures(true);
        this.renderMaterials(true);
        this.refreshStatus();
        this._syncPanel();
    }

    /** The swatches: a plain one, then every image in img/materials. */
    renderMaterials(refresh = false) {
        const holder = this.panel?.querySelector('.rr-pieces-materials');
        if (!holder) return;
        const materials = this.materials(refresh);
        if (materials.length && !materials.some(entry => entry.name === this.material)) this.material = this.material || '';
        // An <img>, not a CSS background: the editor page cannot load a
        // project file as a stylesheet image, while an image element can.
        const swatch = (name, inner, title) => `<button type="button" class="rr-pieces-material" data-piece-material="${name.replace(/"/g, '&quot;')}" role="radio" aria-checked="${name === this.material}" title="${title.replace(/"/g, '&quot;')}" style="width: 34px; height: 34px; border-radius: 4px; border: 2px solid var(--color-border-input); padding: 0; cursor: pointer; overflow: hidden; background: linear-gradient(135deg, #9a9a9a, #6f6f6f);">${inner}</button>`;
        holder.innerHTML = swatch('', '', this._t('pieces.plain'))
            + materials.map(entry => swatch(entry.name, `<img src="${entry.url.replace(/"/g, '&quot;')}" alt="" draggable="false" style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;">`, entry.name)).join('');
        holder.querySelectorAll('.rr-pieces-material').forEach(button => button.addEventListener('click', () => this.setMaterial(button.dataset.pieceMaterial)));
        const hint = this.panel.querySelector('.rr-pieces-materials-hint');
        if (hint) hint.style.display = materials.length ? 'none' : '';
    }

    /** The plans under 3d/Structures, by name. */
    structures(refresh = false) {
        if (this._structuresCache && !refresh) return this._structuresCache;
        let list = [];
        try {
            const projectPath = this.projectPath();
            if (projectPath && typeof require === 'function') {
                const fs = require('fs'), path = require('path');
                const directory = path.join(projectPath, '3d', 'Structures');
                if (fs.existsSync(directory)) {
                    for (const file of fs.readdirSync(directory).filter(name => /\.json$/i.test(name)).sort()) {
                        try {
                            const plan = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
                            if (plan && Array.isArray(plan.size) && Array.isArray(plan.floors)) list.push({ file, name: plan.name || file.replace(/\.json$/i, ''), plan });
                        } catch (error) { console.warn(`${file} is not a structure plan.`, error); }
                    }
                }
            }
        } catch (error) { list = []; }
        this._structuresCache = list;
        return list;
    }

    renderStructures(refresh = false) {
        const select = this.panel?.querySelector('.rr-pieces-structure');
        if (!select) return;
        const list = this.structures(refresh);
        select.innerHTML = `<option value="">${this._t(list.length ? 'pieces.structureNone' : 'pieces.noStructures')}</option>`
            + list.map(entry => `<option value="${entry.file.replace(/"/g, '&quot;')}">${entry.name.replace(/</g, '&lt;')} (${entry.plan.size[0]}×${entry.plan.size[1]})</option>`).join('');
        select.value = list.some(entry => entry.file === this.structure) ? this.structure : '';
        if (!select.value) this.structure = '';
        select.disabled = !list.length;
    }

    structurePlan() {
        return this.structures().find(entry => entry.file === this.structure)?.plan || null;
    }

    /** A plan's part by file name, for plans made of plans. */
    resolvePlan(name) {
        return this.structures().find(entry => entry.file === name || entry.file === name + '.json' || entry.name === name)?.plan || null;
    }

    /** The plan's own pieces as one geometry at the origin: the stamp's ghost. */
    ghostGeometryFor(plan, rot = 0, scale = 1) {
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!SP || typeof Reactor3D === 'undefined' || !plan) return null;
        const shaped = SP.transform(plan, rot, scale);
        const pieces = SP.build(shaped, 0, 0, 1, 0, name => this.resolvePlan(name));
        return Reactor3D.pieceGeometry(pieces, null);
    }

    /**
     * Put a plan down with its top-left cell at (x, y): the terrain under
     * it is levelled to its mean, whatever stood on the footprint goes, and
     * the plan's pieces take its place — one undo step for the lot.
     */
    stampAt(x, y) {
        const map = this.currentMap(), elevation = this.elevation(), plan = this.structurePlan();
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!map || !elevation || !plan || !SP) return false;
        const [W, H] = plan.size;
        const X0 = Math.max(0, Math.min(map.width - W, Math.floor(x))), Y0 = Math.max(0, Math.min(map.height - H, Math.floor(y)));
        if (W > map.width || H > map.height) return false;
        this.undoStack.push(this._snapshot(map));
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        if (elevation.hasTerrain(map)) {
            const grid = elevation.terrain(map), stride = map.width + 1;
            let sum = 0, n = 0;
            for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) { sum += Number(grid[yy * stride + xx]) || 0; n++; }
            const mean = Math.round((sum / n) * 1000) / 1000;
            for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) grid[yy * stride + xx] = mean;
        }
        const group = elevation.nextPieceGroup(map);
        this._lay(map, plan, { group, plan: this.structure, x: X0, y: Y0, rot: 0, scale: 1 });
        this.announce(true);
        this.refreshStatus();
        return true;
    }

    /** Build a plan's pieces for a structure record: the pad levelled, the footprint cleared, models pushed off. */
    _lay(map, plan, record) {
        const elevation = this.elevation(), SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!elevation || !SP) return false;
        const shaped = SP.transform(plan, record.rot, record.scale);
        const [W, H] = shaped.size;
        const X0 = Math.max(0, Math.min(map.width - W, record.x)), Y0 = Math.max(0, Math.min(map.height - H, record.y));
        if (W > map.width || H > map.height) return false;
        record.x = X0; record.y = Y0;
        if (elevation.hasTerrain(map)) {
            const grid = elevation.terrain(map), stride = map.width + 1;
            let sum = 0, n = 0;
            for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) { sum += Number(grid[yy * stride + xx]) || 0; n++; }
            const mean = Math.round((sum / n) * 1000) / 1000;
            for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) grid[yy * stride + xx] = mean;
        }
        elevation.relocatePropsOff(map, X0, Y0, W, H);
        const kept = elevation.pieces(map).filter(piece => piece.group !== record.group && !(piece.x >= X0 && piece.x < X0 + W && piece.y >= Y0 && piece.y < Y0 + H));
        const firstId = kept.reduce((max, piece) => Math.max(max, piece.id), 0) + 1;
        elevation.restorePieces(map, kept.concat(SP.build(shaped, X0, Y0, firstId, record.group, name => this.resolvePlan(name))));
        record.spots = SP.spots(shaped, X0, Y0, name => this.resolvePlan(name));
        elevation.setStructure(map, record);
        // The building's people: events at its spots, moved with it, kept when edited.
        const wanted = SP.eventsOf(shaped, X0, Y0, name => this.resolvePlan(name));
        // Its screens, lights and animations: surfaces and lights on the map, animations as events.
        const effects = SP.effectsOf(shaped, X0, Y0, name => this.resolvePlan(name));
        if (effects.length || SP.removeGroupEffects(map, record.group)) {
            for (const request of SP.placeEffects(map, record.group, effects)) wanted.push(request);
            window.reactor?.lightingManager?.render?.();
            window.reactor?.mediaSurfaceManager?.render?.();
        }
        if (wanted.length) {
            SP.placeEvents(map, record.group, wanted, name => this.loadEventTemplate(name));
            this._eventsChanged = true;
        }
        window.reactor?.modelPropsManager?.render?.();
        return true;
    }

    /** An event template under 3d/Structures/events, by name. */
    loadEventTemplate(name) {
        try {
            const projectPath = this.projectPath();
            if (!projectPath || typeof require !== 'function') return null;
            const fs = require('fs'), path = require('path');
            const file = path.join(projectPath, '3d', 'Structures', 'events', /\.json$/i.test(name) ? name : name + '.json');
            return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
        } catch (error) { console.warn(`Event template ${name} could not be read.`, error); return null; }
    }

    /** The selected structure, built again from its plan with a changed record. */
    _restamp(map, change) {
        const elevation = this.elevation();
        const record = elevation.structureOf(map, this.selectedGroup);
        if (!record) return false;
        const plan = this.structures().find(entry => entry.file === record.plan)?.plan;
        if (!plan) return false;
        const saved = this._snapshot(map);
        if (!this._lay(map, plan, Object.assign(record, change))) return false;
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announce(true); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    rotateSelected() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        if (elevation.structureOf(map, this.selectedGroup)) return this._restamp(map, { rot: (elevation.structureOf(map, this.selectedGroup).rot + 1) % 4 });
        const saved = elevation.piecesSnapshot(map);
        if (!elevation.rotatePieceGroup(map, this.selectedGroup)) return false;
        this.undoStack.push(saved); this.redoStack.length = 0;
        this.announce(); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    scaleSelected(delta) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const record = elevation.structureOf(map, this.selectedGroup);
        if (!record) return false;
        const scale = Math.max(1, Math.min(4, record.scale + delta));
        return scale === record.scale ? false : this._restamp(map, { scale });
    }

    nudgeSelected(dx, dy) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const bounds = elevation.pieceGroupBounds(map, this.selectedGroup);
        return bounds ? this.moveSelectedTo(bounds.x0 + dx, bounds.y0 + dy) : false;
    }

    /** Move mode, first click: the structure the pointed piece belongs to. */
    selectGroupAt(target) {
        this._selectionChanged = true;
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return false;
        const stack = elevation.pieces(map).filter(piece => piece.x === target.x && piece.y === target.y);
        const piece = stack.find(p => p.z === target.z) || stack.reduce((best, p) => (!best || p.z > best.z ? p : best), null);
        if (!piece) { this.selectedGroup = 0; this._flash('pieces.notStructure'); this._ghostChanged(); return false; }
        if (!piece.group) {
            // A loose piece: everything touching it becomes one building, so a
            // house built by hand moves as one too.
            const saved = elevation.piecesSnapshot(map);
            const group = elevation.groupConnectedPieces(map, target.x, target.y);
            if (!group) { this.selectedGroup = 0; this._flash('pieces.notStructure'); this._ghostChanged(); return false; }
            this.undoStack.push(saved); this.redoStack.length = 0;
            this.selectedGroup = group;
            this._syncPanel();
            this._flash('pieces.grouped', { count: elevation.pieceGroup(map, group).length });
            this._ghostChanged();
            return true;
        }
        this.selectedGroup = piece.group;
        this._syncPanel();
        this.refreshStatus();
        this._ghostChanged();
        return true;
    }

    /** Move mode, second click: the selected structure's top-left cell goes here, ground levelled under it. */
    moveSelectedTo(x, y) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const bounds = elevation.pieceGroupBounds(map, this.selectedGroup);
        if (!bounds) { this.selectedGroup = 0; return false; }
        // A stamped building is built again at the new place; a hand-built group slides.
        if (elevation.structureOf(map, this.selectedGroup)) return this._restamp(map, { x: Math.floor(x), y: Math.floor(y) });
        const W = bounds.x1 - bounds.x0 + 1, H = bounds.y1 - bounds.y0 + 1;
        const X0 = Math.max(0, Math.min(map.width - W, Math.floor(x))), Y0 = Math.max(0, Math.min(map.height - H, Math.floor(y)));
        const saved = this._snapshot(map);
        if (!elevation.movePieceGroup(map, this.selectedGroup, X0, Y0)) return false;
        elevation.relocatePropsOff(map, X0, Y0, W, H);
        this.undoStack.push(saved);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        if (elevation.hasTerrain(map)) {
            const grid = elevation.terrain(map), stride = map.width + 1;
            let sum = 0, n = 0;
            for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) { sum += Number(grid[yy * stride + xx]) || 0; n++; }
            const mean = Math.round((sum / n) * 1000) / 1000;
            for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) grid[yy * stride + xx] = mean;
        }
        this.announce(true);
        this.refreshStatus();
        this._ghostChanged();
        return true;
    }

    /** Everything a building edit can touch: pieces, the ground, the building records. */
    _snapshot(map) {
        const elevation = this.elevation();
        const sidecar = map.reactor3d || {};
        return { pieces: elevation.piecesSnapshot(map), terrain: elevation.terrainSnapshot(map), structures: elevation.structures(map),
            surfaces: JSON.stringify(sidecar.mediaSurfaces || null), lights: JSON.stringify(sidecar.lights || null) };
    }

    removeSelectedGroup() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const saved = this._snapshot(map);
        if (typeof RRStructurePlan !== 'undefined' && RRStructurePlan.removeGroupEvents(map, this.selectedGroup)) this._eventsChanged = true;
        if (typeof RRStructurePlan !== 'undefined' && RRStructurePlan.removeGroupEffects(map, this.selectedGroup)) { window.reactor?.lightingManager?.render?.(); window.reactor?.mediaSurfaceManager?.render?.(); }
        if (!elevation.removePieceGroup(map, this.selectedGroup)) return false;
        this.undoStack.push(saved); this.redoStack.length = 0;
        this.selectedGroup = 0;
        this.announce(); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    selectedGroupBounds() {
        const map = this.currentMap(), elevation = this.elevation();
        return map && elevation && this.selectedGroup ? elevation.pieceGroupBounds(map, this.selectedGroup) : null;
    }

    _flash(key, params) {
        const status = this.panel?.querySelector('.rr-pieces-status');
        if (status) status.textContent = this._t(key, params);
        window.reactor?.buildHotbar?.flash?.(this._t(key, params));
    }

    _syncPanel() {
        this._syncBar();
        const panel = this.panel;
        if (!panel) return;
        const stamp = panel.querySelector('.rr-pieces-stamp');
        if (stamp) stamp.setAttribute('aria-checked', String(this.mode === 'stamp'));
        const remove = panel.querySelector('.rr-pieces-remove-structure');
        if (remove) remove.disabled = !this.selectedGroup;
        const transform = panel.querySelector('.rr-pieces-transform');
        if (transform) {
            const map = this.currentMap(), elevation = this.elevation();
            const record = map && elevation && this.selectedGroup ? elevation.structureOf(map, this.selectedGroup) : null;
            transform.style.display = this.mode === 'move' && this.selectedGroup ? 'flex' : 'none';
            const scaleValue = panel.querySelector('.rr-pieces-scale-value');
            if (scaleValue) scaleValue.textContent = record ? String(record.scale) : '–';
            for (const cls of ['.rr-pieces-scale-down', '.rr-pieces-scale-up']) { const b = panel.querySelector(cls); if (b) b.disabled = !record; }
        }
        panel.querySelectorAll('.rr-pieces-kind').forEach(button => button.setAttribute('aria-checked', String(button.dataset.pieceKind === this.kind)));
        panel.querySelectorAll('.rr-pieces-mode').forEach(button => button.setAttribute('aria-checked', String(button.dataset.pieceMode === this.mode)));
        panel.querySelectorAll('.rr-pieces-material').forEach(button => button.setAttribute('aria-checked', String(button.dataset.pieceMaterial === this.material)));
        const rot = panel.querySelector('.rr-pieces-rot-value');
        if (rot) rot.textContent = (this.rot * 90) + '°';
        const level = panel.querySelector('.rr-pieces-level-value');
        if (level) level.textContent = String(this.level);
    }
    /** The bar over the 3D view follows the same state as the panel. */
    _syncBar() { window.reactor?.buildHotbar?.sync?.(); }

    setKind(kind) { if (this.kinds().includes(kind)) { this.kind = kind; this.mode = 'place'; this._syncPanel(); this._ghostChanged(); } }
    setMode(mode) {
        if (mode !== 'place' && mode !== 'erase' && mode !== 'stamp' && mode !== 'move' && mode !== 'screen' && mode !== 'light' && mode !== 'select') return;
        if (mode !== 'select') this.selected = 0;
        if (mode === 'stamp' && !this.structurePlan()) mode = 'place';
        if (mode !== 'move') this.selectedGroup = 0;
        this.mode = mode; this._syncPanel(); this.refreshStatus(); this._ghostChanged();
    }
    setMaterial(name) { this.material = String(name || ''); this._syncPanel(); }
    turn(steps = 1) { this.rot = ((this.rot + steps) % 4 + 4) % 4; this._syncPanel(); this._ghostChanged(); }
    setLevel(level) {
        const max = this.elevation()?.PIECE_MAX_LEVEL ?? 120;
        this.level = Math.max(0, Math.min(max, Math.floor(Number(level)) || 0));
        this._syncPanel();
        this._ghostChanged();
    }
    _ghostChanged() { window.reactor?.mapEditor3D?.refreshPieceGhost?.(); window.reactor?.mapEditor3D?.refreshSelection?.(); }

    refreshStatus() {
        const status = this.panel?.querySelector('.rr-pieces-status');
        if (!status) return;
        const map = this.currentMap(), elevation = this.elevation();
        const is3D = !!(map && elevation && elevation.hasNote(map));
        if (this.mode === 'move' && this.selectedGroup) {
            status.textContent = this._t('pieces.structureSelected', { count: elevation.pieceGroup(map, this.selectedGroup).length });
            return;
        }
        status.textContent = !map ? '' : !is3D ? this._t('pieces.needs3D') : this._t('pieces.count', { count: elevation.pieces(map).length });
    }

    activate() {
        window.reactor?.claimMapTool?.('pieces');
        this.renderStructures(true);
        const mapEditor = window.reactor?.mapEditor;
        if (!this.active) this._resumeMapEditor = !!mapEditor?.enabled;
        this.active = true;
        mapEditor?.setEnabled?.(false);
        document.addEventListener('keydown', this._onKeyDown);
        const map = this.currentMap();
        if (map && this.elevation()?.hasNote(map)) {
            const toggle = document.getElementById('map-3d-view');
            if (toggle && !toggle.checked) toggle.click();
        }
        this.renderMaterials(true);
        this.refreshStatus();
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this._stroke = null;
        document.removeEventListener('keydown', this._onKeyDown);
        window.reactor?.mapEditor3D?.hidePieceGhost?.();
        const mapEditor = window.reactor?.mapEditor;
        if (mapEditor && this._resumeMapEditor) {
            mapEditor.setEnabled(true);
            mapEditor.setupMapInteraction?.();
        }
    }

    /** The piece as it would be laid at a target `{x, y, z}`. */
    pieceFor(target) {
        const piece = { kind: this.kind, x: target.x, y: target.y, z: target.z, rot: this.rot, material: this.material };
        const E = this.elevation();
        if (E && E.SHAPE_KINDS && E.SHAPE_KINDS.includes(this.kind)) { piece.size = this.sizeFor(this.kind); Object.assign(piece, (this.params && this.params[this.kind]) || {}); }
        return piece;
    }

    /**
     * A stroke starts with the click and lays a piece on every new cell
     * or level the drag reaches; the same cell twice does nothing, so a
     * slow drag and a fast one leave the same row. The 3D view keeps the
     * drag on the plane of the first piece, so a run of walls stays a run
     * and never climbs onto the wall it just laid. A rectangle stroke
     * (Ctrl held) lays the rectangle between the first cell and the
     * pointer instead: a floor or a block fills it, anything else lines
     * its edge, and every move lays it again from the stroke's start so
     * the rectangle follows the pointer.
     */
    beginStroke(target, mode = this.mode, options = {}) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return false;
        const snapshot = elevation.piecesSnapshot(map);
        this.undoStack.push(snapshot);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        this._stroke = { mode, moved: false, last: null, anchor: { x: target.x, y: target.y, z: target.z }, snapshot, rectangle: !!options.rectangle };
        return this.dab(target);
    }

    paintAt(target, options = {}) {
        if (!this._stroke || !target) return false;
        if (options.rectangle || this._stroke.rectangle) return this.layRectangle(target);
        const last = this._stroke.last;
        if (last && last.x === target.x && last.y === target.y && last.z === target.z) return false;
        return this.dab(target);
    }

    /** Kinds that fill a rectangle; the rest line its edge. */
    static fillsRectangle(kind) { return kind === 'floor' || kind === 'block'; }

    /** The cells of the rectangle between the stroke's anchor and `target`, at the anchor's level. */
    rectangleCells(target) {
        const a = this._stroke.anchor;
        const x0 = Math.min(a.x, target.x), x1 = Math.max(a.x, target.x);
        const y0 = Math.min(a.y, target.y), y1 = Math.max(a.y, target.y);
        const fill = this._stroke.mode === 'erase' || PieceBuilderManager.fillsRectangle(this.kind);
        const cells = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (fill || x === x0 || x === x1 || y === y0 || y === y1) cells.push({ x, y, z: a.z });
        }
        return { cells, x0, y0, x1, y1 };
    }

    layRectangle(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target || !this._stroke) return false;
        const last = this._stroke.last;
        if (this._stroke.rectangle && last && last.x === target.x && last.y === target.y) return false;
        this._stroke.rectangle = true;
        this._stroke.last = { x: target.x, y: target.y, z: this._stroke.anchor.z };
        // From the stroke's start again, so a rectangle that shrinks leaves nothing behind.
        elevation.restorePieces(map, this._stroke.snapshot);
        const { cells, x0, y0, x1, y1 } = this.rectangleCells(target);
        const group = elevation.pieceGroupAt(map, this._stroke.anchor.x, this._stroke.anchor.y);
        let changed = false;
        for (const cell of cells) {
            if (this._stroke.mode === 'erase') { if (this.eraseAt(map, cell)) changed = true; continue; }
            const piece = this.pieceFor(cell);
            if (group) piece.group = group;
            if (elevation.setPiece(map, piece)) changed = true;
        }
        if (changed && group && elevation.structureOf(map, group)) {
            elevation.removeStructure(map, group);
            this._flash('pieces.detached');
            this._flashed = true;
        }
        this._lastList = map.reactor3d?.pieces;
        this._stroke.moved = true;
        this.announce(false, { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 });
        return changed;
    }

    dab(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target || !this._stroke) return false;
        this._stroke.last = { x: target.x, y: target.y, z: target.z };
        // A hand edit inside a building: the new piece joins the building,
        // and the building stops following its plan (it would be built
        // again from the plan on the next move and lose the edit), while it
        // still moves and turns as one.
        const group = elevation.pieceGroupAt(map, target.x, target.y);
        const piece = this.pieceFor(target);
        if (group) piece.group = group;
        let changed;
        if (this._stroke.mode === 'erase') changed = this.eraseAt(map, target);
        else if (piece.kind === 'stair' && this.stairSteps > 1) {
            // A run of stairs: each one a cell on and a level up along the way it climbs.
            const [dx, dy] = PieceBuilderManager.stepOf(piece.rot);
            changed = false;
            for (let i = 0; i < this.stairSteps; i++) {
                const step = Object.assign({}, piece, { x: piece.x + dx * i, y: piece.y + dy * i, z: piece.z + i });
                if (step.x < 0 || step.y < 0 || step.x >= map.width || step.y >= map.height) break;
                if (elevation.setPiece(map, step) && this._changedSince(map)) changed = true;
            }
        } else changed = !!elevation.setPiece(map, piece) && this._changedSince(map);
        if (changed && group && elevation.structureOf(map, group)) {
            elevation.removeStructure(map, group);
            this._flash('pieces.detached');
            this._flashed = true;
        }
        // The cells the edit could have changed: the cell and its neighbours
        // (a hidden face between touching walls belongs to both).
        if (changed) {
            this._stroke.moved = true;
            const reach = this.isShape(piece.kind) ? Math.ceil(Math.max(...(piece.size || [1, 1, 1])) / 2) + 1 : Math.max(1, this.stairSteps);
            this.announce(false, { x0: target.x - reach, y0: target.y - reach, x1: target.x + reach, y1: target.y + reach });
        }
        return changed;
    }

    /** setPiece returns the id even when nothing changed; the list identity says whether it did. */
    _changedSince(map) {
        const now = map.reactor3d?.pieces;
        const changed = now !== this._lastList;
        this._lastList = now;
        return changed;
    }

    /** Take the piece at the level, else the top piece on the cell. */
    eraseAt(map, target) {
        const elevation = this.elevation();
        if (elevation.removePiece(map, target.x, target.y, target.z)) return true;
        const stack = elevation.pieces(map).filter(piece => piece.x === target.x && piece.y === target.y);
        if (!stack.length) return this.removeEffectAt(map, target);
        const top = stack.reduce((best, piece) => (piece.z > best.z ? piece : best), stack[0]);
        return elevation.removePiece(map, top.x, top.y, top.z);
    }

    endStroke() {
        if (this._stroke && !this._stroke.moved) this.undoStack.pop();
        this._stroke = null;
        if (this._flashed) this._flashed = false; else this.refreshStatus();
    }

    /** One piece off, outside a stroke: the right-click. */
    removeAt(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return false;
        const saved = elevation.piecesSnapshot(map);
        if (!this.eraseAt(map, target)) return false;
        this.undoStack.push(saved);
        this.redoStack.length = 0;
        this.announce(false, { x0: target.x - 1, y0: target.y - 1, x1: target.x + 1, y1: target.y + 1 });
        this.refreshStatus();
        return true;
    }

    handleKey(event) {
        if (!this.active) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && target.type !== 'range') return;
        if (target?.isContentEditable) return;
        if (window.reactor?.uiManager?.isEditorModalOpenForGlobalShortcuts?.()) return;
        const key = String(event.key || '').toLowerCase();
        if (event.ctrlKey || event.metaKey) {
            if (key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
            else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); this.redo(); }
            return;
        }
        if (event.altKey) return;
        if (this.mode === 'select' && this.selected && key === 'r') { event.preventDefault(); this.turnSelected(event.shiftKey ? -1 : 1); }
        else if (this.mode === 'select' && this.selected && (key === 'delete' || key === 'backspace')) { event.preventDefault(); this.removeSelected(); }
        else if (this.mode === 'select' && this.selected && key === 'escape') { event.preventDefault(); this.clearSelection(); }
        else if (key === 'r' && !(this.mode === 'move' && this.selectedGroup)) { event.preventDefault(); this.turn(event.shiftKey ? -1 : 1); }
        else if (key === 'e') { event.preventDefault(); this.setLevel(this.level + 1); }
        else if (key === 'q') { event.preventDefault(); this.setLevel(this.level - 1); }
        else if (key === 'x') { event.preventDefault(); this.setMode(this.mode === 'erase' ? 'place' : 'erase'); }
        else if ((key === ']' || key === '[') && !(this.mode === 'move' && this.selectedGroup)) { event.preventDefault(); this.shapeScale = Math.max(0.25, Math.min(8, Math.round((this.shapeScale * (key === ']' ? 1.25 : 0.8)) * 100) / 100)); this._syncPanel(); this._ghostChanged(); }
        else if (key === 'm') { event.preventDefault(); this.setMode(this.mode === 'move' ? 'place' : 'move'); }
        else if (this.mode === 'move' && this.selectedGroup && key === 'r') { event.preventDefault(); this.rotateSelected(); }
        else if (this.mode === 'move' && this.selectedGroup && (key === ']' || key === '[')) { event.preventDefault(); this.scaleSelected(key === ']' ? 1 : -1); }
        else if (this.mode === 'move' && this.selectedGroup && /^arrow(left|right|up|down)$/.test(key)) {
            event.preventDefault();
            const step = event.shiftKey ? 5 : 1;
            this.nudgeSelected(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
        }
        else if ((key === 'delete' || key === 'backspace') && this.mode === 'move' && this.selectedGroup) { event.preventDefault(); this.removeSelectedGroup(); }
        else if (key === 'escape' && this.mode === 'move' && this.selectedGroup) { event.preventDefault(); this.selectedGroup = 0; this.refreshStatus(); this._ghostChanged(); }
        else if (key === 'escape' && this.mode !== 'place') { event.preventDefault(); this.setMode('place'); }
    }

    undo() { this._swap(this.undoStack, this.redoStack); }
    redo() { this._swap(this.redoStack, this.undoStack); }
    _swap(from, to) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !from.length) return;
        const entry = from.pop();
        const whole = entry && !Array.isArray(entry) && entry.pieces;
        to.push(whole ? this._snapshot(map) : elevation.piecesSnapshot(map));
        elevation.restorePieces(map, whole ? entry.pieces : entry);
        if (whole) {
            if (entry.terrain) elevation.restoreTerrain(map, entry.terrain); else elevation.clearTerrain(map);
            elevation.restoreStructures(map, entry.structures);
            if (entry.surfaces !== undefined) {
                const sidecar = map.reactor3d || (map.reactor3d = { version: 1 });
                const surfaces = JSON.parse(entry.surfaces), lights = JSON.parse(entry.lights);
                if (surfaces) sidecar.mediaSurfaces = surfaces; else delete sidecar.mediaSurfaces;
                if (lights) sidecar.lights = lights; else delete sidecar.lights;
                this._effectsChanged();
            }
        }
        this.announce(!!whole); this.refreshStatus(); this._syncPanel();
    }

    clear() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !elevation.hasPieces(map)) return;
        this.undoStack.push(elevation.piecesSnapshot(map)); this.redoStack.length = 0;
        elevation.clearPieces(map);
        this.announce(); this.refreshStatus();
    }

    /** The pieces changed: the 3D view lays them down again in place, and the map is dirty. */
    announce(terrainToo = false, region = null) {
        this.render2D();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        // A stamp levels the ground as well: the terrain goes first (in
        // place, the whole map), then the pieces are laid on it. `region`
        // is the cells an edit touched, so only their chunks are relaid.
        if (terrainToo) document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, terrain: true, region: null } }));
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, pieces: true, region: region || null } }));
        // Events came or went with a building: the event tool and the 3D
        // view's markers are redrawn (a plain edit notice rebuilds the view).
        if (this._eventsChanged) {
            this._eventsChanged = false;
            window.reactor?.eventManager?.renderEvents?.();
            document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id } }));
        }
    }
}

if (typeof window !== 'undefined') window.PieceBuilderManager = PieceBuilderManager;
if (typeof module !== 'undefined' && module.exports) module.exports = PieceBuilderManager;
