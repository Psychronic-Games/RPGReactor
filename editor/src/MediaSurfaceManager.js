/** Permanent map decorations, authored with the same panel as media commands. */
class MediaSurfaceManager {
    constructor(projectController, databaseManager) {
        this.projectController = projectController;
        this.databaseManager = databaseManager;
        this.undo = []; this.redo = [];
        this._thumbnailQueue = [];
        this._thumbnailJobs = new Set();
        this._videoThumbnails = new Map();
        this._thumbnailGeneration = 0;
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
        this.render(); this.syncHistoryButtons(); this.projectController?.mediaSurfacePreviewManager?.syncToolInteraction?.(); return true;
    }
    close() {
        this.cancelPlacement?.();
        this._stopThumbnails();
        this._videoThumbnails.clear();
        if (this.panel) { if (window.reactor?.undockMapPanel) window.reactor.undockMapPanel(this.panel); else this.panel.remove(); }
        const wasOpen = !!this.panel;
        this.panel = null;
        if (wasOpen) { const map = window.reactor?.mapEditor; window.reactor?.uiManager?.updateUndoRedoButtons?.(!!map?.canUndo?.(), !!map?.canRedo?.()); }
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
        this._stopThumbnails();
        panel.replaceChildren();
        const header = document.createElement('div'); header.className = 'rr-modal-header';
        const icon = document.createElement('img'); icon.src = 'images/icon-media-surfaces.svg'; icon.alt = ''; icon.className = 'media-surfaces-icon';
        const title = document.createElement('div'); title.className = 'rr-modal-title'; title.id = 'rr-map-media-surfaces-title'; title.setAttribute('data-i18n-text-source','Media Surfaces'); title.textContent = this.t('Media Surfaces');
        header.append(icon, title, this.button('×', () => this.close(), 'rr-modal-close')); panel.append(header);
        const body = document.createElement('div'); body.className = 'rr-modal-body';
        body.classList.add('media-surfaces-body', 'rr-accent-scrollbar');
        const help = document.createElement('p'); help.setAttribute('data-i18n-text-source','Images and videos that belong to this map. Save the map to keep your changes.'); help.textContent = this.t('Images and videos that belong to this map. Save the map to keep your changes.');
        help.className = 'media-surfaces-help'; body.append(help);
        body.append(this.button('Place Surface…', () => this.place(), 'rr-button-primary'));
        if (!this.rows().length) { const empty = document.createElement('p'); empty.className = 'media-surfaces-empty'; empty.setAttribute('data-i18n-text-source','No map surfaces yet.'); empty.textContent = this.t('No map surfaces yet.'); body.append(empty); }
        for (const row of this.rows()) {
            const item = document.createElement('article'); item.className = 'media-surface-card';
            const file = String(row.movie || row.file || '');
            const edit = this.button('', () => this.edit(Number(row.id)), 'media-surface-open');
            edit.removeAttribute('data-i18n-text-source');
            edit.title = `${row.id}: ${file || this.t('Media Surface')}`;
            edit.setAttribute('aria-label', edit.title);
            const info = document.createElement('span'); info.className = 'media-surface-info';
            const name = document.createElement('span'); name.className = 'media-surface-name'; name.setAttribute('data-rr-i18n-skip','');
            name.textContent = file || this.t('Media Surface');
            const meta = document.createElement('span'); meta.className = 'media-surface-meta';
            const id = document.createElement('span'); id.className = 'media-surface-id'; id.textContent = `#${row.id}`; id.setAttribute('data-rr-i18n-skip','');
            const kind = document.createElement('span'); kind.className = 'media-surface-kind';
            const label = /\.(?:png|jpe?g|webp)$/i.test(file) ? 'Image' : 'Video';
            kind.setAttribute('data-i18n-text-source',label); kind.textContent = this.t(label);
            meta.append(id, kind);
            const position = document.createElement('span'); position.className = 'media-surface-position'; position.setAttribute('data-rr-i18n-skip','');
            const value = n => Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : 0;
            position.textContent = `X ${value(row.x)} · Y ${value(row.y)} · Z ${value(row.z)}`;
            info.append(name, meta, position); edit.append(this._thumbnail(file), info);
            const actions = document.createElement('div'); actions.className = 'media-surface-actions';
            const duplicate = this.button('Duplicate', () => this.duplicate(Number(row.id)), 'rr-btn-secondary');
            duplicate.dataset.action = 'duplicate-surface';
            actions.append(duplicate, this.button('Delete', () => {
                this.change(this.rows().filter(value => value !== row)); this.render();
            }, 'rr-button-danger')); item.append(edit, actions); body.append(item);
        }
        const history = document.createElement('div'); history.className = 'media-surfaces-history';
        const undo = this.button('Undo', () => this.history(this.undo, this.redo)); undo.disabled = !this.undo.length;
        const redo = this.button('Redo', () => this.history(this.redo, this.undo)); redo.disabled = !this.redo.length;
        history.append(undo, redo); panel.append(body, history);
    }

    /** The same validated project paths and decrypted/Web URLs used by the map preview. */
    _thumbnailUrl(file) {
        const Editor = typeof MediaSurfaceEditor !== 'undefined' ? MediaSurfaceEditor : require('./event/commands/MediaSurfaceEditor.js');
        if (!Editor.safeMoviePath(file)) return '';
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        if (!project?.path) return '';
        const path = require('path');
        const assets = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : require('./utils/AssetFiles.js');
        return assets.toUrl(path.join(project.path, Editor.isImageFile(file) ? 'img/pictures' : 'movies', ...file.split('/')));
    }

    _thumbnail(file) {
        const holder = document.createElement('span'); holder.className = 'media-surface-thumbnail'; holder.setAttribute('aria-hidden','true');
        const image = /\.(?:png|jpe?g|webp)$/i.test(file);
        holder.innerHTML = image
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 4-6 5 8"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/></svg>';
        let url;
        try { url = this._thumbnailUrl(file); } catch (_) { url = ''; }
        if (!url) { holder.classList.add('is-unavailable'); return holder; }
        if (image) this._showThumbnail(holder, url);
        else if (this._videoThumbnails.has(url)) this._showThumbnail(holder, this._videoThumbnails.get(url));
        else {
            this._thumbnailQueue.push({ url, holder, generation: this._thumbnailGeneration });
            this._pumpThumbnails();
        }
        return holder;
    }

    _showThumbnail(holder, url) {
        const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('load', () => holder.classList.add('is-loaded'), { once: true });
        img.addEventListener('error', () => { img.remove(); holder.classList.add('is-unavailable'); }, { once: true });
        img.src = url; holder.append(img);
    }

    _stopThumbnails() {
        this._thumbnailGeneration++;
        this._thumbnailQueue.length = 0;
        for (const stop of Array.from(this._thumbnailJobs)) stop();
    }

    /** Snapshot at most two videos at once, then release their decoders. Nothing autoplays. */
    _pumpThumbnails() {
        while (this._thumbnailQueue.length && this._thumbnailJobs.size < 2) {
            const { url, holder, generation } = this._thumbnailQueue.shift();
            if (this._videoThumbnails.has(url)) { this._showThumbnail(holder, this._videoThumbnails.get(url)); continue; }
            const video = document.createElement('video');
            video.muted = true; video.playsInline = true; video.preload = 'auto';
            let timer, done = false;
            const stop = () => {
                if (done) return;
                done = true; clearTimeout(timer);
                for (const [name, listener] of listeners) video.removeEventListener(name, listener);
                video.pause(); video.removeAttribute('src'); video.load();
                this._thumbnailJobs.delete(stop);
            };
            const finish = data => {
                if (done) return;
                stop();
                if (generation !== this._thumbnailGeneration) return;
                if (data) {
                    this._videoThumbnails.set(url, data);
                    while (this._videoThumbnails.size > 48) this._videoThumbnails.delete(this._videoThumbnails.keys().next().value);
                    this._showThumbnail(holder, data);
                } else holder.classList.add('is-unavailable');
                this._pumpThumbnails();
            };
            const capture = () => {
                if (video.seeking || !video.videoWidth || !video.videoHeight) return;
                try {
                    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
                    const scale = Math.min(160 / video.videoWidth, 100 / video.videoHeight);
                    const width = video.videoWidth * scale, height = video.videoHeight * scale;
                    canvas.getContext('2d').drawImage(video, (160-width)/2, (100-height)/2, width, height);
                    finish(canvas.toDataURL('image/png'));
                } catch (_) { finish(null); }
            };
            const listeners = [
                ['loadedmetadata', () => { try { if (video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2); } catch (_) {} }],
                ['loadeddata', capture], ['seeked', capture], ['error', () => finish(null)]
            ];
            this._thumbnailJobs.add(stop);
            for (const [name, listener] of listeners) video.addEventListener(name, listener);
            timer = setTimeout(() => finish(null), 8000);
            video.src = url; video.load();
        }
    }
    write(rows) {
        const map = this.map(); if (map !== this.boundMap) return;
        if (rows.length) { map.reactor3d ||= {version:1}; map.reactor3d.mediaSurfaces = this.copy(rows); }
        else if (map.reactor3d) delete map.reactor3d.mediaSurfaces;
        this.projectController.mediaSurfacePreviewManager?.rescan();
    }
    change(rows) { this.undo.push(this.copy(this.rows())); this.redo = []; this.write(rows); this.syncHistoryButtons(); }
    history(from, to) { if (!from.length) return; to.push(this.copy(this.rows())); this.write(from.pop()); this.render(); this.syncHistoryButtons(); }
    /** What Ctrl+Z and the toolbar's Undo/Redo step while the panel is open. */
    historyOwner() { return { undo: () => this.history(this.undo, this.redo), redo: () => this.history(this.redo, this.undo) }; }
    syncHistoryButtons() { if (this.panel) window.reactor?.uiManager?.updateUndoRedoButtons?.(this.undo.length > 0, this.redo.length > 0); }
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
        this._stopThumbnails();
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
