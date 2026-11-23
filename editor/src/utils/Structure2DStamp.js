/**
 * Structure2DStamp - placing 2D structures on a 2D map, and keeping the ones placed up to date
 * (docs/DESIGN-2D-STRUCTURES.md).
 *
 * start(file): a picture of the structure follows the pointer over the map, tile by tile; a click places it with its
 * top-left corner there (more clicks, more copies), a right-click on a placed structure removes it, Escape stops.
 * Each placement and removal is one step of the map's undo history ('structures2d'). When a map opens, its placed
 * structures are applied again (RRStructure2D.apply), so a structure changed since stands on it as it is now.
 */
class Structure2DStamp {
    constructor(reactor) {
        this.reactor = reactor;
        this.undoStack = [];
        this.redoStack = [];
        this.file = null;
        this.ghost = null;
    }

    _t(text, params) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) value = value.split(`{${key}}`).join(String(replacement));
        return value;
    }

    tilemap() { return this.reactor?.tilemapManager || null; }
    db() { return this.reactor?.databaseManager || null; }
    planOf() { return Structure2DWorkshop.planOfFrom(this.db()); }
    map() { const map = this.tilemap()?.currentMap; return map && !map.rrWorkshop ? map : null; }

    /** What the game reads made again from the open map's placed structures; the view redrawn when it changed. */
    applyToMap() {
        const map = this.map();
        if (!map || typeof RRStructure2D === 'undefined') return false;
        if (!RRStructure2D.apply(map, this.planOf())) return false;
        this.refreshView();
        return true;
    }

    refreshView() {
        const tilemap = this.tilemap();
        this.reactor?.mapImageLayersManager?.drawFlat?.();
        tilemap?.refreshPassage?.();
        this.reactor?.mediaSurfacePreviewManager?.rescan?.();
        tilemap?.requestRender?.();
    }

    /** A map opened (or the workshop left): stop placing, and bring its structures up to date. */
    mapChanged() {
        this.stop();
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.applyToMap();
    }

    /** Place the structure of this file with the next clicks on the open 2D map. */
    start(file) {
        const tilemap = this.tilemap(), map = this.map(), plan = this.planOf()(file);
        if (!tilemap || !map || !plan) return false;
        if (this.reactor?.mapEditor3D?.enabled) {
            RRDialog.alert(this._t('2D structures go on maps shown in 2D. Turn the 3D view off, then place it.'), { title: this._t('Structures') });
            return false;
        }
        if (!plan.baked || (!plan.baked.below && !plan.baked.over)) {
            RRDialog.alert(this._t('This structure has nothing drawn yet: open it with Build and save it first.'), { title: this._t('Structures') });
            return false;
        }
        this.stop();
        this.file = file;
        this.makeGhost(plan);
        tilemap.cellPicker = {
            cursor: 'copy',
            onHover: (x, y) => this.moveGhost(x, y),
            onCell: (x, y) => this.place(x, y),
            onRight: (x, y) => this.removeAt(x, y),
            onLeave: () => { if (this.ghost) this.ghost.style.display = 'none'; },
            onEscape: () => { this.stop(); if (this.paletteOnS()) this.startSelecting(); }
        };
        this.reactor?.uiManager?.showMapNote?.(this._t('Click to place {name}. Right-click a placed structure to remove it. Esc to stop.', { name: plan.name }), 4000);
        return true;
    }

    stop() {
        const tilemap = this.tilemap();
        if (this.file && tilemap && tilemap.cellPicker && tilemap.cellPicker.onCell && this.ghost) tilemap.cellPicker = null;
        this.stopSelecting();
        const was = this.file;
        this.file = null;
        if (this.ghost) { this.ghost.remove(); this.ghost = null; }
        // The palette's S tab marks the one being placed: no longer.
        const palette = this.reactor?.tilesetPaletteViewer;
        if (was && palette?.currentLayer === 'S') palette.renderStructures2D?.();
    }

    paletteOnS() { return this.reactor?.tilesetPaletteViewer?.currentLayer === 'S'; }

    // ---- Placed structures, picked on the map (the palette's S tab, no structure in hand) ----------------------
    //
    // A click on a placed structure selects it (a gold outline; its name, Remove and Edit in the S tab), a drag moves
    // it tile by tile, Delete removes it, a right-click opens its menu, a double-click opens it in the workshop.
    // Each move and removal is a step of the map's undo history. Owner, 2026-11-22: once placed, a structure could
    // not be selected, moved or removed.

    startSelecting() {
        const tilemap = this.tilemap(), map = this.map();
        if (!tilemap || !map || this.file || this.reactor?.mapEditor3D?.enabled) return false;
        this.selecting = true;
        tilemap.cellPicker = {
            selecting: true,
            cursor: 'default',
            onCell: (x, y, event) => this.pressAt(x, y, event),
            onHover: (x, y) => this.hoverAt(x, y),
            onRight: (x, y, event) => this.menuAt(x, y, event),
            onEscape: () => this.select(null)
        };
        if (!this._keys) {
            this._keys = event => {
                if (!this.selecting || !this.selected || event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
                if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.removeSelected(); }
            };
            window.addEventListener('keydown', this._keys);
            document.getElementById('canvas-container')?.addEventListener('dblclick', event => {
                if (!this.selecting || !this.selected || event.target?.tagName !== 'CANVAS') return;
                this.editSelected();
            });
        }
        return true;
    }

    stopSelecting() {
        const tilemap = this.tilemap();
        if (tilemap?.cellPicker?.selecting) tilemap.cellPicker = null;
        this.selecting = false;
        this.dragging = null;
        this.select(null, true);
    }

    planFor(row) { return row ? this.planOf()(row.file) : null; }

    /** The placed structure under tile x, y selected, or none; the S tab told. */
    select(row, quiet = false) {
        this.selected = row ? row.id : null;
        this.drawOutline();
        if (!quiet && this.paletteOnS()) this.reactor?.tilesetPaletteViewer?.renderStructures2D?.();
    }

    selectedRow() { return (this.map()?.rrStructures2D || []).find(row => row && row.id === this.selected) || null; }

    pressAt(x, y) {
        const map = this.map();
        if (!map) return;
        const row = RRStructure2D.at(map, x, y, this.planOf());
        if (!row) { this.select(null); return; }
        if (row.id !== this.selected) this.select(row);
        // A drag from here moves it, the structure itself following tile by tile (owner, 2026-11-22: only the box
        // moved until it was let go); letting go makes the move one step of the undo.
        this.dragging = { id: row.id, from: [x, y], at: row.at.slice(), to: row.at.slice(), before: JSON.parse(JSON.stringify(map.rrStructures2D || [])) };
        const up = () => { window.removeEventListener('pointerup', up, true); this.drop(); };
        window.addEventListener('pointerup', up, true);
    }

    hoverAt(x, y) {
        const drag = this.dragging, tilemap = this.tilemap();
        if (tilemap) document.getElementById('canvas-container').style.cursor = drag ? 'grabbing' : (RRStructure2D.at(this.map() || {}, x, y, this.planOf()) ? 'grab' : 'default');
        if (!drag) return;
        const to = [drag.at[0] + x - drag.from[0], drag.at[1] + y - drag.from[1]];
        if (to[0] === drag.to[0] && to[1] === drag.to[1]) return;
        drag.to = to;
        const row = (this.map()?.rrStructures2D || []).find(entry => entry && entry.id === drag.id);
        if (row) { row.at = to.slice(); this.applyToMap(); }
        this.drawOutline(drag.to);
    }

    drop() {
        const drag = this.dragging, map = this.map();
        this.dragging = null;
        if (!drag || !map) return;
        const row = (map.rrStructures2D || []).find(entry => entry && entry.id === drag.id);
        // The structure already stands where it was let go (moved as it was dragged): the step is from where it began.
        if (!row || (drag.to[0] === drag.at[0] && drag.to[1] === drag.at[1])) { this.drawOutline(); return; }
        row.at = drag.to.slice();
        this.step(drag.before);
        this.applyToMap();
        this.drawOutline();
        if (this.paletteOnS()) this.reactor?.tilesetPaletteViewer?.renderStructures2D?.();
    }

    removeSelected() {
        const row = this.selectedRow(), map = this.map();
        if (!row || !map) return;
        const before = JSON.parse(JSON.stringify(map.rrStructures2D || []));
        RRStructure2D.remove(map, row.id);
        this.step(before);
        this.applyToMap();
        this.select(null);
    }

    duplicateSelected() {
        const row = this.selectedRow(), map = this.map(), plan = this.planFor(row);
        if (!row || !map || !plan) return;
        const before = JSON.parse(JSON.stringify(map.rrStructures2D || []));
        const copy = RRStructure2D.add(map, row.file, Math.min(map.width - 1, row.at[0] + plan.size[0]), row.at[1]);
        this.step(before);
        this.applyToMap();
        this.select(copy);
    }

    /** The selected structure opened in the workshop (the map comes back when it closes). */
    editSelected() {
        const row = this.selectedRow();
        const entry = row && (this.db()?.data?.structures || []).find(record => record && (record.file === row.file || record.file === row.file + '.json'));
        if (!entry) return;
        this.stop();
        this.reactor?.structure2DWorkshop?.enter?.(entry.id);
    }

    menuAt(x, y, event) {
        const map = this.map();
        const row = map && RRStructure2D.at(map, x, y, this.planOf());
        if (!row || typeof RRContextMenu === 'undefined') { this.select(null); return; }
        this.select(row);
        const plan = this.planFor(row), t = text => this._t(text);
        RRContextMenu.show(event?.clientX ?? 0, event?.clientY ?? 0, [
            { label: `${plan?.name || row.file} · ${row.at[0]}, ${row.at[1]}`, enabled: false },
            { separator: true },
            { label: t('Duplicate'), action: () => this.duplicateSelected() },
            { label: t('Edit Structure'), action: () => this.editSelected() },
            { separator: true },
            { label: t('Remove'), shortcut: 'Del', action: () => this.removeSelected() }
        ]);
    }

    /** The gold outline round the selected structure (or where a drag would put it), kept on it as the map moves. */
    drawOutline(at = null) {
        const row = this.selectedRow(), plan = this.planFor(row), tilemap = this.tilemap();
        if (!row || !plan || !tilemap) {
            if (this.outline) { this.outline.remove(); this.outline = null; }
            cancelAnimationFrame(this._outlineFrame);
            return;
        }
        if (!this.outline) {
            this.outline = document.createElement('div');
            this.outline.className = 'rr-structure2d-selected';
            document.getElementById('canvas-container')?.appendChild(this.outline);
        }
        const place = () => {
            const spot = this.dragging ? this.dragging.to : (at || row.at);
            const box = tilemap.tileBox?.(spot[0], spot[1], plan.size[0], plan.size[1]);
            if (box && this.outline) Object.assign(this.outline.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
            this.outline?.classList.toggle('is-moving', !!this.dragging);
        };
        place();
        cancelAnimationFrame(this._outlineFrame);
        const follow = () => { if (!this.outline) return; place(); this._outlineFrame = requestAnimationFrame(follow); };
        this._outlineFrame = requestAnimationFrame(follow);
    }

    pictureUrl(name) {
        const projectPath = this.reactor?.projectController?.getCurrentProject?.()?.path;
        if (!projectPath || !name) return '';
        return require('url').pathToFileURL(require('path').join(projectPath, 'img', 'parallaxes', ...name.split('/')) + '.png').href;
    }

    makeGhost(plan) {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const ghost = document.createElement('div');
        ghost.className = 'rr-structure2d-ghost';
        for (const name of [plan.baked.below, plan.baked.over]) {
            if (!name) continue;
            const img = document.createElement('img');
            img.src = this.pictureUrl(name);
            img.alt = '';
            ghost.appendChild(img);
        }
        ghost.style.display = 'none';
        ghost.dataset.w = plan.size[0];
        ghost.dataset.h = plan.size[1];
        container.appendChild(ghost);
        this.ghost = ghost;
    }

    moveGhost(x, y) {
        const tilemap = this.tilemap(), ghost = this.ghost;
        if (!tilemap || !ghost) return;
        const box = tilemap.tileBox?.(x, y, Number(ghost.dataset.w), Number(ghost.dataset.h));
        if (!box) return;
        Object.assign(ghost.style, { display: 'block', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
    }

    /** One step: the map's placed structures as they were and as they are now. */
    step(before) {
        const map = this.map();
        this.undoStack.push({ mapId: map.id, before, after: JSON.parse(JSON.stringify(map.rrStructures2D || [])) });
        this.redoStack.length = 0;
        if (this.undoStack.length > 200) this.undoStack.shift();
    }

    place(x, y) {
        const map = this.map();
        if (!map || !this.file) return;
        const before = JSON.parse(JSON.stringify(map.rrStructures2D || []));
        RRStructure2D.add(map, this.file, x, y);
        this.step(before);
        this.applyToMap();
    }

    removeAt(x, y) {
        const map = this.map();
        if (!map) return;
        const row = RRStructure2D.at(map, x, y, this.planOf());
        if (!row) return;
        const before = JSON.parse(JSON.stringify(map.rrStructures2D || []));
        RRStructure2D.remove(map, row.id);
        this.step(before);
        this.applyToMap();
    }

    restore(list) {
        const map = this.map();
        if (!map) return;
        if (list.length) map.rrStructures2D = JSON.parse(JSON.stringify(list)); else delete map.rrStructures2D;
        RRStructure2D.apply(map, this.planOf());
        this.refreshView();
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    undo() {
        const entry = this.undoStack.pop();
        if (!entry) return false;
        this.redoStack.push(entry);
        if (this.map()?.id === entry.mapId) this.restore(entry.before);
        if (!this.selectedRow()) this.select(null);
        return true;
    }

    redo() {
        const entry = this.redoStack.pop();
        if (!entry) return false;
        this.undoStack.push(entry);
        if (this.map()?.id === entry.mapId) this.restore(entry.after);
        return true;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Structure2DStamp;
