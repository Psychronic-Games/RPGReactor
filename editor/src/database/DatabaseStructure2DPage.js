/**
 * DatabaseStructure2DPage - Database › Structures for a 2D structure (docs/DESIGN-2D-STRUCTURES.md).
 *
 * Its name and plot, Build (the phantom map, Structure2DWorkshop.js), Use on the map, and the structure as it stands,
 * with its passability painted right on it: X blocked, O open, * open with its art over the characters, or no mark
 * (its tiles decide). A change here is the Database's like any other; saving the Database draws the structure again
 * where it must and brings every map it stands on up to date (DatabaseManager.follow2DStructures).
 */
class DatabaseStructure2DPage {
    /** Zoom: as the map's wheel (10% a notch, about the pointer), from 10% to 800%, the canvas at most 8192 px a side. */
    static ZOOM_MIN = 0.1;
    static ZOOM_MAX = 8;
    static CANVAS_MAX = 8192;

    constructor(editor) {
        this.editor = editor;
        this.tool = 'X';
        this.current = null;
        this._draw = 0;
    }

    _t(text, params) { return this.editor._t ? this.editor._t(text, params) : text; }

    show(detailEl, entry) {
        this.detail = detailEl;
        this.current = { entry, plan: entry.plan };
        const tt = text => rrEscapeHtml(this._t(text));
        detailEl.innerHTML = `
            <div class="rr-structure2d-page">
                <div class="rr-structures-bar rr-structure2d-bar"></div>
                <div class="rr-structure2d-body">
                    <div class="rr-structure2d-stage">
                        <div class="rr-structure2d-view rr-accent-scrollbar"><canvas class="rr-structure2d-canvas"></canvas></div>
                        <p class="rr-structure2d-empty" hidden></p>
                        <div class="rr-structure2d-zoom" role="group" aria-label="${tt('Zoom')}">
                            <button type="button" class="rr-btn-chip" data-zoom="out" title="${tt('Zoom out')}" aria-label="${tt('Zoom out')}">−</button>
                            <span class="rr-structure2d-zoom-value" aria-live="polite"></span>
                            <button type="button" class="rr-btn-chip" data-zoom="in" title="${tt('Zoom in')}" aria-label="${tt('Zoom in')}">+</button>
                            <button type="button" class="rr-btn-chip" data-zoom="fit" title="${tt('The whole structure in view')}">${tt('Fit')}</button>
                        </div>
                    </div>
                    <div class="rr-structure2d-side">
                        <div class="lit-section"><div class="lit-section-header">${tt('Passability')}</div>
                            <div class="rr-structure2d-tools"></div>
                        </div>
                        <div class="lit-section"><div class="lit-section-header">${tt('Layers')}</div><div class="rr-structure2d-summary"></div></div>
                    </div>
                </div>
            </div>`;
        this.renderBar();
        this.renderTools();
        this.renderSummary();
        this.bindPaint(detailEl.querySelector('.rr-structure2d-canvas'));
        this.bindZoom(detailEl.querySelector('.rr-structure2d-view'));
        this.drawPreview();
    }

    markDirty() {
        this.editor.nameIfNew?.call({ current: this.current, parentEditor: this.editor.parentEditor });
        this.editor.parentEditor?._markDatabaseMutation?.();
    }

    renderBar() {
        const bar = this.detail?.querySelector('.rr-structure2d-bar');
        if (!bar || !this.current) return;
        const { plan, entry } = this.current, S = RRStructure2D;
        const tt = text => rrEscapeHtml(this._t(text));
        const empty = !plan.layers.some(layer => (layer.kind === 'tiles' && layer.tiles.some(Boolean)) || (layer.kind === 'picture' && layer.picture));
        const number = (i, title) => `<input type="number" class="database-field-value rr-structure2d-size" data-i="${i}" value="${plan.size[i]}" min="${S.SIZE_MIN}" max="${S.SIZE_MAX}" step="1" style="width:52px;" title="${tt(title)}">`;
        bar.innerHTML = `
            <label class="rr-structure2d-label">${tt('Name')}<input type="text" class="database-field-value rr-structure2d-name" value="${rrEscapeHtml(plan.name)}" style="width:150px;"></label>
            <label class="rr-structure2d-label">${tt('Plot')}${number(0, 'Width in tiles')}<span>×</span>${number(1, 'Height in tiles')}</label>
            <label class="rr-structures-3d" title="${tt('On: a 3D structure, built of pieces. Off: a 2D one, of tiles, pictures and media surfaces, for 2D maps.')}"><input type="checkbox" class="rr-structures-3d-check"><span>3D</span></label>
            <button type="button" class="rr-button-primary rr-structure2d-build rr-btn-with-icon" style="margin-left:auto;"><svg class="rr-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20 13.4 10.6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M13 4.2 19.8 11 17 13.8 10.2 7Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span>${tt('Build')}</span></button>
            <button type="button" class="rr-btn-secondary rr-structure2d-use rr-btn-with-icon"${plan.baked ? '' : ' disabled'} title="${tt(plan.baked ? 'Place it on a 2D map' : 'Build and save it first')}"><svg class="rr-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21.5s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5-6.5 11.2-6.5 11.2Z" fill="currentColor"/><circle cx="12" cy="10.3" r="2.4" fill="var(--rr-btn-icon-hole, #000)"/></svg><span>${tt('Use on the map')}</span></button>`;
        bar.querySelector('.rr-structure2d-name').addEventListener('input', event => {
            entry.name = event.target.value; plan.name = event.target.value;
            this.editor.parentEditor?.refreshDatabaseListLabel?.(entry, 'structures');
            this.markDirty();
        });
        for (const input of bar.querySelectorAll('.rr-structure2d-size')) input.addEventListener('change', async () => {
            const w = Number(bar.querySelector('[data-i="0"]').value), h = Number(bar.querySelector('[data-i="1"]').value);
            if ((w < plan.size[0] || h < plan.size[1]) && !await RRDialog.confirm(this._t('Make the plot smaller? What stands outside it goes.'), { title: this._t('Structures'), ok: this._t('Resize'), danger: true })) { this.renderBar(); return; }
            if (S.resize(plan, w, h)) { plan._needsBake = true; this.markDirty(); this.drawPreview(); }
            this.renderBar();
        });
        bar.querySelector('.rr-structures-3d-check').addEventListener('change', async event => {
            // On: a 3D structure. What is built in 2D does not carry over, so a built one asks first.
            if (!empty && !await RRDialog.confirm(this._t('Make this a 3D structure? What is built in 2D is cleared.'), { title: this._t('Structures'), ok: this._t('Make it 3D'), danger: true })) { event.target.checked = false; return; }
            entry.plan = DatabaseStructureEditor.newPlan(plan.name);
            this.markDirty();
            this.editor.showStructureDetail(this.detail, entry);
        });
        bar.querySelector('.rr-structure2d-build').addEventListener('click', () => {
            if (!entry.name) { entry.name = plan.name; this.editor.parentEditor?.refreshDatabaseListLabel?.(entry, 'structures'); }
            window.reactor?.structure2DWorkshop?.open(entry);
        });
        bar.querySelector('.rr-structure2d-use').addEventListener('click', () => this.useOnMap());
    }

    renderTools() {
        const box = this.detail?.querySelector('.rr-structure2d-tools');
        if (!box) return;
        const tt = text => rrEscapeHtml(this._t(text));
        const button = (id, label, title) => `<button type="button" class="rr-btn-chip rr-structure2d-tool${this.tool === id ? ' is-on' : ''}" data-tool="${id}" title="${tt(title)}">${label}</button>`;
        box.innerHTML = button('X', `<b>X</b> ${tt('Blocked')}`, 'Blocked') + button('O', `<b>O</b> ${tt('Open')}`, 'Open') + button('*', `<b>★</b> ${tt('Under')}`, 'Walk underneath: open, its art over the characters') + button('edge', `${Structure2DWorkshop.ICONS.sides} ${tt('Sides')}`, 'Block one side: click near a cell\'s edge to block it, again to open it') + button('clear', rrEscapeHtml(this._t('Clear')), 'No mark: its tiles decide');
        box.onclick = event => { const b = event.target.closest('[data-tool]'); if (b) { this.tool = b.dataset.tool; this.renderTools(); } };
    }

    renderSummary() {
        const box = this.detail?.querySelector('.rr-structure2d-summary');
        if (!box || !this.current) return;
        const db = this.editor.databaseManager, plan = this.current.plan;
        box.innerHTML = plan.layers.slice().reverse().map(layer => `<div class="rr-structure2d-summary-row"><strong>${rrEscapeHtml(layer.name)}</strong><span>${rrEscapeHtml(layer.kind === 'tiles' ? (db?.getTileset?.(layer.tilesetId)?.name || '#' + layer.tilesetId) : (layer.picture || this._t('(no picture)')))}</span></div>`).join('')
            // Its videos and images too, under the layers.
            + (plan.surfaces || []).map(row => `<div class="rr-structure2d-summary-row"><strong>${rrEscapeHtml(String(row.movie || '').split('/').pop() || this._t('Media Surface'))}</strong><span>${rrEscapeHtml(this._t(typeof MediaSurfaceEditor !== 'undefined' && MediaSurfaceEditor.isImageFile(row.movie) ? 'Image' : 'Video'))}</span></div>`).join('');
    }

    /** The structure as it stands (every layer, hidden ones too), its marks over it. */
    async drawPreview() {
        const canvas = this.detail?.querySelector('.rr-structure2d-canvas');
        const emptyNote = this.detail?.querySelector('.rr-structure2d-empty');
        if (!canvas || !this.current || typeof Structure2DWorkshop === 'undefined') return;
        const { plan } = this.current, T = Structure2DWorkshop.TILE, [W, H] = plan.size;
        const draw = ++this._draw;
        let drawn = null;
        try {
            drawn = await Structure2DWorkshop.drawLayers(plan, plan.layers, {
                tilemap: window.reactor?.tilemapManager, db: this.editor.databaseManager,
                projectPath: this.editor.projectController?.getCurrentProject?.()?.path, split: false
            });
        } catch (error) { console.warn('[2D structure] preview', error); }
        if (draw !== this._draw || !canvas.isConnected) return;
        this._art = drawn && drawn.drewBelow ? drawn.below : null;
        this._artSize = [W * T, H * T];
        if (emptyNote) { emptyNote.hidden = !!this._art; emptyNote.textContent = this._t('Nothing built yet: press Build.'); }
        // A structure shown for the first time, or resized, opens fitted to the view; a redraw keeps the zoom chosen.
        const key = `${this.current.entry.id}:${W}x${H}`;
        if (this._fitKey !== key || this._fitted) { this._fitKey = key; this._fitted = true; this._scale = this.fitZoom(); }
        this.drawMarks();
    }

    /** The zoom at which the whole plot fills the view, its margin kept. */
    fitZoom() {
        const view = this.detail?.querySelector('.rr-structure2d-view'), [w, h] = this._artSize || [48, 48];
        const room = view ? [view.clientWidth - 24, view.clientHeight - 24] : [640, 480];
        const D = DatabaseStructure2DPage;
        return Math.max(D.ZOOM_MIN, Math.min(D.ZOOM_MAX, room[0] / w, room[1] / h, D.CANVAS_MAX / Math.max(w, h)));
    }

    /** Zoom to `zoom`, keeping the plot's point under (clientX, clientY), or the view's middle, where it is. */
    zoomTo(zoom, clientX, clientY) {
        const view = this.detail?.querySelector('.rr-structure2d-view'), canvas = view?.querySelector('canvas');
        if (!view || !canvas || !this._artSize) return;
        const D = DatabaseStructure2DPage, [w, h] = this._artSize;
        zoom = Math.max(D.ZOOM_MIN, Math.min(D.ZOOM_MAX, D.CANVAS_MAX / Math.max(w, h), zoom));
        const box = view.getBoundingClientRect(), art = canvas.getBoundingClientRect();
        const px = clientX ?? box.left + box.width / 2, py = clientY ?? box.top + box.height / 2;
        const u = (px - art.left) / Math.max(1, art.width), v = (py - art.top) / Math.max(1, art.height);
        this._scale = zoom;
        this._fitted = false;
        this.drawMarks();
        const after = canvas.getBoundingClientRect();
        view.scrollLeft += (after.left + u * after.width) - px;
        view.scrollTop += (after.top + v * after.height) - py;
    }

    /** The structure at the zoom: its art (pixel for pixel when enlarged), the tile grid, the marks. */
    drawMarks() {
        const canvas = this.detail?.querySelector('.rr-structure2d-canvas');
        if (!canvas || !this.current || !this._artSize) return;
        const zoom = this._scale || 1, { plan } = this.current, cell = Structure2DWorkshop.TILE * zoom;
        const width = Math.max(1, Math.round(this._artSize[0] * zoom)), height = Math.max(1, Math.round(this._artSize[1] * zoom));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = zoom < 1;
        ctx.fillStyle = '#1b1d22'; ctx.fillRect(0, 0, width, height);
        if (this._art) ctx.drawImage(this._art, 0, 0, width, height);
        this.drawSurfaces(ctx, zoom);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        for (let x = 0; x <= plan.size[0]; x++) { ctx.beginPath(); ctx.moveTo(Math.min(width - 0.5, x * cell + 0.5), 0); ctx.lineTo(Math.min(width - 0.5, x * cell + 0.5), height); ctx.stroke(); }
        for (let y = 0; y <= plan.size[1]; y++) { ctx.beginPath(); ctx.moveTo(0, Math.min(height - 0.5, y * cell + 0.5)); ctx.lineTo(width, Math.min(height - 0.5, y * cell + 0.5)); ctx.stroke(); }
        DatabaseStructure2DPage.drawMarksOn(ctx, plan.passage, cell, 0, 0);
        const value = this.detail?.querySelector('.rr-structure2d-zoom-value');
        if (value) value.textContent = `${Math.round(zoom * 100)}%`;
    }

    /**
     * The structure's videos and images where they stand, as the plot and a map show them: a frame of each (the
     * saved pictures hold only tiles and pictures; a video plays live), its corners as the map's preview places
     * them, a ▶ on a video. Owner, 2026-11-22: a video made in the workshop did not show here.
     */
    drawSurfaces(ctx, zoom) {
        const plan = this.current?.plan;
        if (!plan?.surfaces?.length || typeof MediaSurfaceEditor === 'undefined' || typeof MediaSurfacePreviewManager === 'undefined') return;
        const T = Structure2DWorkshop.TILE;
        for (const row of plan.surfaces) {
            const state = Object.assign(MediaSurfaceEditor.defaults(), row);
            let corners;
            try { corners = MediaSurfacePreviewManager.prototype._transformedCorners.call({}, state); } catch (error) { continue; }
            const lift = Number(state.height) * Math.abs(Number(state.scaleY) || 1) / 2;
            const ax = (Number(state.x) + 0.5) * T, ay = (Number(state.y) + 0.5) * T - lift;
            const pts = corners.map(corner => [(ax + corner.x) * zoom, (ay + corner.y) * zoom]);
            const frame = this.surfaceFrame(state.movie);
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, Number(state.opacity ?? 255) / 255));
            if (frame) {
                const w = frame.width, h = frame.height;
                ctx.setTransform((pts[1][0] - pts[0][0]) / w, (pts[1][1] - pts[0][1]) / w, (pts[3][0] - pts[0][0]) / h, (pts[3][1] - pts[0][1]) / h, pts[0][0], pts[0][1]);
                ctx.drawImage(frame, 0, 0);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
            ctx.globalAlpha = 1;
            ctx.beginPath();
            pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            ctx.closePath();
            if (!frame) { ctx.fillStyle = 'rgba(16,21,29,0.85)'; ctx.fill(); }
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(232,197,71,0.85)'; ctx.stroke();
            if (!MediaSurfaceEditor.isImageFile(state.movie)) {
                const cx = pts.reduce((sum, p) => sum + p[0], 0) / 4, cy = pts.reduce((sum, p) => sum + p[1], 0) / 4, r = Math.max(8, Math.min(22, 12 * zoom));
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#e8c547'; ctx.beginPath(); ctx.moveTo(cx - r * 0.35, cy - r * 0.5); ctx.lineTo(cx + r * 0.55, cy); ctx.lineTo(cx - r * 0.35, cy + r * 0.5); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        }
    }

    /** A still of a video (a moment in) or an image, kept per file; the preview drawn again once it is in. */
    surfaceFrame(movie) {
        if (!movie) return null;
        this._frames = this._frames || new Map();
        const kept = this._frames.get(movie);
        if (kept !== undefined) return kept || null;
        this._frames.set(movie, false);
        const projectPath = this.editor.projectController?.getCurrentProject?.()?.path;
        if (!projectPath || typeof require !== 'function') return null;
        const image = MediaSurfaceEditor.isImageFile(movie);
        const file = require('path').join(projectPath, ...(image ? ['img', 'pictures'] : ['movies']), ...String(movie).split('/'));
        const url = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl ? RRAssetFiles.toUrl(file) : require('url').pathToFileURL(file).href;
        const keep = source => {
            const w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
            if (!w || !h) return;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            try { canvas.getContext('2d').drawImage(source, 0, 0); } catch (error) { return; }
            this._frames.set(movie, canvas);
            if (this.detail?.isConnected) this.drawMarks();
        };
        if (image) {
            const img = new Image();
            img.onload = () => keep(img);
            img.src = url;
        } else {
            const video = document.createElement('video');
            video.muted = true; video.preload = 'auto';
            video.onloadeddata = () => { try { video.currentTime = Math.min(0.5, (video.duration || 1) / 2); } catch (error) { keep(video); } };
            video.onseeked = () => { keep(video); video.removeAttribute('src'); try { video.load(); } catch (error) { /* gone */ } };
            video.src = url;
        }
        return null;
    }

    /** The wheel zooms about the pointer (as on the map); a middle-button drag moves the view; the buttons zoom too.
     *  While the view is fitted it stays fitted as the window is resized. */
    bindZoom(view) {
        if (!view) return;
        view.addEventListener('wheel', event => {
            event.preventDefault();
            this.zoomTo((this._scale || 1) * (event.deltaY > 0 ? 1 / 1.1 : 1.1), event.clientX, event.clientY);
        }, { passive: false });
        let pan = null;
        view.addEventListener('mousedown', event => {
            if (event.button !== 1) return;
            event.preventDefault();
            pan = { x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop };
            view.classList.add('is-panning');
        });
        window.addEventListener('mousemove', event => {
            if (!pan) return;
            view.scrollLeft = pan.left - (event.clientX - pan.x);
            view.scrollTop = pan.top - (event.clientY - pan.y);
        });
        window.addEventListener('mouseup', () => { if (pan) { pan = null; view.classList.remove('is-panning'); } });
        this.detail?.querySelector('.rr-structure2d-zoom')?.addEventListener('click', event => {
            const which = event.target.closest('[data-zoom]')?.dataset.zoom;
            if (which === 'in') this.zoomTo((this._scale || 1) * 1.25);
            else if (which === 'out') this.zoomTo((this._scale || 1) / 1.25);
            else if (which === 'fit') { this._scale = this.fitZoom(); this._fitted = true; this.drawMarks(); view.scrollLeft = 0; view.scrollTop = 0; }
        });
        if (typeof ResizeObserver !== 'undefined') {
            this._resize?.disconnect();
            this._resize = new ResizeObserver(() => {
                if (!view.isConnected) { this._resize.disconnect(); return; }
                if (this._fitted && this._artSize) { const zoom = this.fitZoom(); if (Math.abs(zoom - (this._scale || 0)) > 0.001) { this._scale = zoom; this.drawMarks(); } }
            });
            this._resize.observe(view);
        }
    }

    /** X, O and ★ glyphs on a 2D context, one per marked cell (`cell` pixels a tile, the plot's corner at ox, oy). */
    static drawMarksOn(ctx, passage, cell, ox, oy) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.max(10, Math.round(cell * 0.55))}px sans-serif`;
        for (const [key, mark] of Object.entries(passage || {})) {
            const at = RRStructure2D.cellOf(key);
            if (!at) continue;
            // Blocked on some sides (dN): a red bar along each.
            const sides = /^d(\d+)$/.exec(String(mark));
            if (sides) {
                const bits = Number(sides[1]), px = ox + at[0] * cell, py = oy + at[1] * cell, e = Math.max(3, Math.round(cell * 0.1));
                ctx.fillStyle = 'rgba(200,40,40,0.12)'; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
                ctx.fillStyle = '#ff5050';
                if (bits & 8) ctx.fillRect(px + 1, py + 1, cell - 2, e);
                if (bits & 1) ctx.fillRect(px + 1, py + cell - 1 - e, cell - 2, e);
                if (bits & 2) ctx.fillRect(px + 1, py + 1, e, cell - 2);
                if (bits & 4) ctx.fillRect(px + cell - 1 - e, py + 1, e, cell - 2);
                continue;
            }
            const cx = ox + at[0] * cell + cell / 2, cy = oy + at[1] * cell + cell / 2;
            ctx.fillStyle = mark === 'X' ? 'rgba(200,40,40,0.35)' : mark === 'O' ? 'rgba(40,160,80,0.30)' : 'rgba(255,200,0,0.30)';
            ctx.fillRect(ox + at[0] * cell + 1, oy + at[1] * cell + 1, cell - 2, cell - 2);
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            const glyph = mark === '*' ? '★' : mark;
            ctx.strokeText(glyph, cx, cy);
            ctx.fillStyle = mark === 'X' ? '#ff6b6b' : mark === 'O' ? '#6bff9b' : '#ffd700';
            ctx.fillText(glyph, cx, cy);
        }
        ctx.restore();
    }

    bindPaint(canvas) {
        if (!canvas) return;
        let painting = false;
        const cellAt = event => {
            const r = canvas.getBoundingClientRect(), cell = Structure2DWorkshop.TILE * (this._scale || 1) * (r.width / canvas.width);
            return [Math.floor((event.clientX - r.left) / cell), Math.floor((event.clientY - r.top) / cell)];
        };
        const paint = event => {
            const plan = this.current?.plan;
            if (!plan) return;
            const [x, y] = cellAt(event);
            if (x < 0 || y < 0 || x >= plan.size[0] || y >= plan.size[1]) return;
            const key = `${x},${y}`, before = plan.passage[key];
            if (this.tool === 'edge') {
                // Sides: the side of the cell nearest the click blocked, or opened again.
                const r = canvas.getBoundingClientRect(), cell = Structure2DWorkshop.TILE * (this._scale || 1) * (r.width / canvas.width);
                const fx = (event.clientX - r.left) / cell - x, fy = (event.clientY - r.top) / cell - y;
                const side = [[fy, 8], [1 - fy, 1], [fx, 2], [1 - fx, 4]].sort((a, b) => a[0] - b[0])[0][1];
                plan.passage[key] = RRStructure2D.edgeMark((RRStructure2D.markBits(before) || 0) ^ side);
            } else if (this.tool === 'clear') delete plan.passage[key]; else plan.passage[key] = this.tool;
            if (plan.passage[key] === before) return;
            // The cells follow at once; the pictures (a ★ moves art over the characters) when the Database is saved.
            if (plan.baked) plan.baked.cells = RRStructure2D.cells(plan, id => this.editor.databaseManager?.getTileset?.(id)?.flags || null);
            plan._needsBake = true;
            this.markDirty();
            this.drawMarks();
        };
        canvas.addEventListener('mousedown', event => { if (event.button !== 0) return; painting = true; paint(event); });
        // Sides takes one click a side; the other tools paint along a drag.
        canvas.addEventListener('mousemove', event => { if (painting && this.tool !== 'edge') paint(event); });
        window.addEventListener('mouseup', () => { painting = false; });
    }

    /** Onto a 2D map: the Database saves and closes as OK does, then a click on the map places it. */
    useOnMap() {
        const entry = this.current?.entry;
        if (!entry) return;
        document.getElementById('database-ok-btn')?.click();
        const started = Date.now();
        const settle = () => {
            const viewer = document.getElementById('database-viewer');
            const closed = !viewer || viewer.style.display === 'none' || viewer.offsetParent === null;
            if ((!closed || !entry.file) && Date.now() - started < 5000) return setTimeout(settle, 100);
            if (entry.file) window.reactor?.tilemapManager?.startStructure2DStamp?.(entry.file);
        };
        setTimeout(settle, 100);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseStructure2DPage;
