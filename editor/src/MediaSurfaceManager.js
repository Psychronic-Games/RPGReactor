/** Permanent map decorations, authored with the same panel as media commands. */
class MediaSurfaceManager {
    constructor(projectController, databaseManager) {
        this.projectController = projectController;
        this.databaseManager = databaseManager;
        this.undo = []; this.redo = [];
    }
    t(text) { return window.I18n?.tText?.(text) || text; }
    map() { return this.projectController?.tilemapManager?.currentMap; }
    rows() { return this.map()?.reactor3d?.mediaSurfaces || []; }
    copy(value) { return JSON.parse(JSON.stringify(value)); }
    toggle() { if (this.panel || this.editor?.modal) this.close(); else this.open(); }
    open() {
        const map = this.map(); if (!map) return false;
        if (window.reactor?.claimMapTool) window.reactor.claimMapTool('media');
        else if (this.projectController?.eventManager?.eventMode) {
            window.reactor?.disableEventModeIfActive?.();
        }
        if (this.boundMap !== map) { this.undo = []; this.redo = []; this.boundMap = map; }
        if (!this.panel) {
            const panel = document.createElement('section');
            panel.className = 'rr-modal media-surfaces-panel';
            panel.setAttribute('aria-labelledby', 'rr-map-media-surfaces-title');
            if (window.reactor?.mapSideDock?.()) panel.style.cssText = 'display:flex;flex-direction:column;';
            else panel.style.cssText = 'position:fixed;right:14px;top:120px;width:min(360px,calc(100vw - 28px));max-height:calc(100vh - 150px);display:flex;flex-direction:column;z-index:20500;box-shadow:0 8px 30px #0009;';
            this.panel = panel;
            if (!window.reactor?.dockMapPanel?.(panel)) document.body.appendChild(panel);
        }
        this.panel.hidden = false;
        document.querySelector('[data-action="media-surfaces"]')?.classList.add('active');
        this.render(); this.projectController?.mediaSurfacePreviewManager?.syncToolInteraction?.(); return true;
    }
    close() {
        this.cancelPlacement?.();
        if (this.panel) { if (window.reactor?.undockMapPanel) window.reactor.undockMapPanel(this.panel); else this.panel.remove(); }
        this.panel = null;
        document.querySelector('[data-action="media-surfaces"]')?.classList.remove('active');
        this.editor?.close(true);
        this.projectController?.mediaSurfacePreviewManager?.syncToolInteraction?.();
        window.reactor?.releaseMapTool?.('media');
    }
    button(text, action, className = '') {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'rr-button ' + className; button.setAttribute('data-i18n-text-source',text); button.textContent = this.t(text);
        button.addEventListener('click', action); return button;
    }
    render() {
        const panel = this.panel; if (!panel) return;
        panel.replaceChildren();
        const header = document.createElement('div'); header.className = 'rr-modal-header';
        const title = document.createElement('div'); title.className = 'rr-modal-title'; title.id = 'rr-map-media-surfaces-title'; title.setAttribute('data-i18n-text-source','Media Surfaces'); title.textContent = this.t('Media Surfaces');
        header.append(title, this.button('×', () => this.close(), 'rr-modal-close')); panel.append(header);
        const body = document.createElement('div'); body.className = 'rr-modal-body';
        body.style.cssText = 'padding:12px;overflow:auto;display:flex;flex-direction:column;gap:10px;';
        const help = document.createElement('p'); help.setAttribute('data-i18n-text-source','Images and videos that belong to this map. Save the map to keep your changes.'); help.textContent = this.t('Images and videos that belong to this map. Save the map to keep your changes.');
        help.style.cssText = 'margin:0;color:var(--color-text-muted);font-size:12px;line-height:1.5;'; body.append(help);
        body.append(this.button('Place Surface…', () => this.place(), 'rr-button-primary'));
        if (!this.rows().length) { const empty = document.createElement('p'); empty.setAttribute('data-i18n-text-source','No map surfaces yet.'); empty.textContent = this.t('No map surfaces yet.'); body.append(empty); }
        for (const row of this.rows()) {
            const item = document.createElement('div'); item.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:6px;background:var(--color-bg-deep);';
            const edit = this.button(`${row.id}: ${row.movie || row.file || 'Media Surface'}`, () => this.edit(Number(row.id)));
            edit.style.cssText = 'flex:1;min-width:0;text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            edit.setAttribute('data-rr-i18n-skip',''); edit.title = edit.textContent;
            const actions = document.createElement('div'); actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
            const duplicate = this.button('Duplicate', () => this.duplicate(Number(row.id)));
            duplicate.dataset.action = 'duplicate-surface';
            actions.append(duplicate, this.button('Delete', () => {
                this.change(this.rows().filter(value => value !== row)); this.render();
            })); item.append(edit, actions); body.append(item);
        }
        const history = document.createElement('div'); history.style.cssText = 'display:flex;gap:8px;';
        const undo = this.button('Undo', () => this.history(this.undo, this.redo)); undo.disabled = !this.undo.length;
        const redo = this.button('Redo', () => this.history(this.redo, this.undo)); redo.disabled = !this.redo.length;
        history.append(undo, redo); body.append(history); panel.append(body);
    }
    write(rows) {
        const map = this.map(); if (map !== this.boundMap) return;
        if (rows.length) { map.reactor3d ||= {version:1}; map.reactor3d.mediaSurfaces = this.copy(rows); }
        else if (map.reactor3d) delete map.reactor3d.mediaSurfaces;
        this.projectController.mediaSurfacePreviewManager?.rescan();
    }
    change(rows) { this.undo.push(this.copy(this.rows())); this.redo = []; this.write(rows); }
    history(from, to) { if (!from.length) return; to.push(this.copy(this.rows())); this.write(from.pop()); this.render(); }
    nextId() {
        const used = new Set(MediaSurfacePreviewManager.scanMap(this.map()).map(row => Number(row.id)));
        let id = 1; while (used.has(id) && id <= 999999) id++; return id;
    }
    duplicate(id) {
        if (this.editor?.modal || !this.open()) return false;
        this.cancelPlacement?.();
        const rows = this.rows().slice(), index = rows.findIndex(row => Number(row.id) === Number(id));
        if (index < 0) return false;
        const copyId = this.nextId(); if (copyId > 999999) return false;
        // Keep the exact pose: arbitrary offsets can bury copies in walls or ceilings.
        rows.splice(index + 1, 0, {...this.copy(rows[index]), id:copyId});
        this.change(rows);
        this.edit(copyId);
        return copyId;
    }
    place() {
        const pc = this.projectController, m = pc.mapEditor3D, tm = pc.tilemapManager;
        const input = m?.enabled ? (m.inputSurface || m.canvas) : tm?.app?.canvas;
        if (!input) return this.edit(null);
        this.cancelPlacement?.();
        const button = this.panel?.querySelector('.rr-button-primary');
        if (button) { button.setAttribute('data-i18n-text-source','Click the map to place · Esc cancels'); button.textContent = this.t('Click the map to place · Esc cancels'); }
        const finish = () => { input.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); this.cancelPlacement = null; input.style.cursor = ''; this.render(); };
        const key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); } };
        const down = event => {
            if (event.button !== 0 || event.ctrlKey || event.altKey || event.shiftKey) return;
            let position;
            if (m?.enabled) {
                const rect = input.getBoundingClientRect();
                m._raycaster ||= new THREE.Raycaster();
                m._raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2), m.camera);
                const hit = m.raycastMapMeshes();
                if (hit) {
                    const p = hit.point, x = p.x-.5, y = p.z-.5;
                    const face = hit.face || m._raycaster.intersectObject(hit.object, false)[0]?.face;
                    const normal = face?.normal.clone().transformDirection(hit.object.matrixWorld);
                    if (normal && normal.dot(m._raycaster.ray.direction) > 0) normal.negate();
                    const quaternion = normal ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal) : new THREE.Quaternion();
                    const rotation = new THREE.Euler().setFromQuaternion(quaternion,'XYZ');
                    const nudge = normal?.clone().multiplyScalar(.015) || new THREE.Vector3();
                    position = {x:x+nudge.x,y:y+nudge.z,z:p.y+nudge.y-Reactor3D.elevationAt(this.map(),Math.round(x),Math.round(y))-90/(tm.TILE_SIZE||48),
                        rotationX:rotation.x*180/Math.PI,rotationY:rotation.y*180/Math.PI,rotationZ:rotation.z*180/Math.PI};
                }
            } else {
                const rect = input.getBoundingClientRect(), screen = tm.app.renderer.screen;
                const p = tm.container.toLocal(new PIXI.Point((event.clientX-rect.left)*screen.width/rect.width,(event.clientY-rect.top)*screen.height/rect.height));
                position = {x:p.x/(tm.TILE_SIZE||48)-.5,y:p.y/(tm.TILE_SIZE||48)-.5};
            }
            if (!position) return;
            event.preventDefault(); event.stopImmediatePropagation(); finish(); this.edit(null, Object.fromEntries(Object.entries(position).map(([key,value])=>[key,Math.round(value*100)/100])));
        };
        this.cancelPlacement = finish; input.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true); input.style.cursor = 'crosshair';
    }
    edit(id, position = {}) {
        if (!this.open()) return false;
        this.cancelPlacement?.();
        const map = this.map(), existing = id == null ? null : this.rows().find(row => Number(row.id) === Number(id));
        if (id != null && !existing) return false;
        const m = this.projectController.mapEditor3D;
        const args = existing || {...MediaSurfaceEditor.defaults(), id:this.nextId(), target:'map', x:m?.view?.target?.x ?? map.width/2,
            y:m?.view?.target?.z ?? map.height/2, ...position};
        const command = {code:357,indent:0,parameters:['RPGReactor','ShowVideoSurface','Show Media Surface',args]};
        this.editor ||= new MediaSurfaceEditor(this.databaseManager, this.projectController);
        this.panel.style.display = 'none';
        return this.editor.show(command, built => {
            if (built && this.map() === map) {
                const rows = this.rows().slice(), index = existing ? rows.indexOf(existing) : -1;
                const value = {...built.parameters[3],target:'map',wait:'false'};
                if (existing && index < 0) return;
                if (index >= 0) rows[index] = value; else rows.push(value);
                this.change(rows);
            }
            if (this.panel && this.map() === map) { this.panel.style.display = 'flex'; this.render(); }
        }, 'ShowVideoSurface', {type:'map',mapSurface:true,currentMap:map,editing:!!existing,source:{mapId:map.id,surfaceId:id},
            duplicate:built=>this.duplicate(Number(built.parameters[3].id)),
            validate:data=>this.rows().some(row=>row!==existing && Number(row.id)===Number(data.id)) ? ['This Surface ID is already used on the map.'] : []});
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = MediaSurfaceManager;
