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
            onEscape: () => this.stop()
        };
        this.reactor?.uiManager?.showMapNote?.(this._t('Click to place {name}. Right-click a placed structure to remove it. Esc to stop.', { name: plan.name }), 4000);
        return true;
    }

    stop() {
        const tilemap = this.tilemap();
        if (this.file && tilemap && tilemap.cellPicker && tilemap.cellPicker.onCell && this.ghost) tilemap.cellPicker = null;
        this.file = null;
        if (this.ghost) { this.ghost.remove(); this.ghost = null; }
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
