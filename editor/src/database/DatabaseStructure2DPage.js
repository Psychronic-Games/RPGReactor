/**
 * DatabaseStructure2DPage - Database › Structures for a 2D structure (docs/DESIGN-2D-STRUCTURES.md).
 *
 * Its name and plot, Build (the phantom map, Structure2DWorkshop.js), Use on the map, and the structure as it stands,
 * with its passability painted right on it: X blocked, O open, * open with its art over the characters, or no mark
 * (its tiles decide). A change here is the Database's like any other; saving the Database draws the structure again
 * where it must and brings every map it stands on up to date (DatabaseManager.follow2DStructures).
 */
class DatabaseStructure2DPage {
    static PREVIEW_MAX = 640;

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
                    <div class="rr-structure2d-view rr-accent-scrollbar"><canvas class="rr-structure2d-canvas"></canvas><p class="rr-structure2d-empty" hidden></p></div>
                    <div class="rr-structure2d-side">
                        <div class="lit-section"><div class="lit-section-header">${tt('Passability')}</div>
                            <div class="rr-structure2d-tools"></div>
                            <p class="rr-structure2d-note">${tt('Paint on the structure: X blocked, O open, ★ walk underneath (its art over the characters). A cell with no mark follows its tiles. Placed structures follow these marks when the Database is saved.')}</p>
                        </div>
                        <div class="lit-section"><div class="lit-section-header">${tt('Layers')}</div><div class="rr-structure2d-summary"></div></div>
                    </div>
                </div>
            </div>`;
        this.renderBar();
        this.renderTools();
        this.renderSummary();
        this.bindPaint(detailEl.querySelector('.rr-structure2d-canvas'));
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
            <span class="rr-structure2d-kind">${tt('2D structure')}</span>
            ${empty ? `<button type="button" class="rr-btn-secondary rr-structure2d-to3d" title="${tt('Make this empty structure a 3D one')}">${tt('Make it 3D')}</button>` : ''}
            <button type="button" class="rr-button-primary rr-structure2d-build" style="margin-left:auto;">${tt('Build')}</button>
            <button type="button" class="rr-btn-secondary rr-structure2d-use"${plan.baked ? '' : ' disabled'} title="${tt(plan.baked ? 'Place it on a 2D map' : 'Build and save it first')}">${tt('Use on the map')}</button>`;
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
        bar.querySelector('.rr-structure2d-to3d')?.addEventListener('click', () => {
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
        box.innerHTML = button('X', 'X', 'Blocked') + button('O', 'O', 'Open') + button('*', '★', 'Walk underneath: open, its art over the characters') + button('clear', rrEscapeHtml(this._t('Clear')), 'Back to what its tiles say');
        box.onclick = event => { const b = event.target.closest('[data-tool]'); if (b) { this.tool = b.dataset.tool; this.renderTools(); } };
    }

    renderSummary() {
        const box = this.detail?.querySelector('.rr-structure2d-summary');
        if (!box || !this.current) return;
        const db = this.editor.databaseManager, plan = this.current.plan;
        box.innerHTML = plan.layers.slice().reverse().map(layer => `<div class="rr-structure2d-summary-row"><strong>${rrEscapeHtml(layer.name)}</strong><span>${rrEscapeHtml(layer.kind === 'tiles' ? (db?.getTileset?.(layer.tilesetId)?.name || '#' + layer.tilesetId) : (layer.picture || this._t('(no picture)')))}</span></div>`).join('')
            + `<p class="rr-structure2d-note">${rrEscapeHtml(this._t('Build opens it on a phantom map: paint its tiles with any tileset, add pictures and media surfaces, and mark its passability there too.'))}</p>`;
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
        const scale = Math.min(2, DatabaseStructure2DPage.PREVIEW_MAX / Math.max(W * T, H * T));
        this._scale = scale;
        canvas.width = Math.round(W * T * scale); canvas.height = Math.round(H * T * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1b1d22'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (drawn) ctx.drawImage(drawn.below, 0, 0, canvas.width, canvas.height);
        this._base = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (emptyNote) { emptyNote.hidden = !!(drawn && drawn.drewBelow); emptyNote.textContent = this._t('Nothing built yet: press Build.'); }
        this.drawMarks();
    }

    drawMarks() {
        const canvas = this.detail?.querySelector('.rr-structure2d-canvas');
        if (!canvas || !this._base || !this.current) return;
        const ctx = canvas.getContext('2d'), { plan } = this.current, cell = Structure2DWorkshop.TILE * this._scale;
        ctx.putImageData(this._base, 0, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        for (let x = 0; x <= plan.size[0]; x++) { ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, canvas.height); ctx.stroke(); }
        for (let y = 0; y <= plan.size[1]; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(canvas.width, y * cell + 0.5); ctx.stroke(); }
        DatabaseStructure2DPage.drawMarksOn(ctx, plan.passage, cell, 0, 0);
    }

    /** X, O and ★ glyphs on a 2D context, one per marked cell (`cell` pixels a tile, the plot's corner at ox, oy). */
    static drawMarksOn(ctx, passage, cell, ox, oy) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.max(10, Math.round(cell * 0.55))}px sans-serif`;
        for (const [key, mark] of Object.entries(passage || {})) {
            const at = RRStructure2D.cellOf(key);
            if (!at) continue;
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
            if (this.tool === 'clear') delete plan.passage[key]; else plan.passage[key] = this.tool;
            if (plan.passage[key] === before) return;
            // The cells follow at once; the pictures (a ★ moves art over the characters) when the Database is saved.
            if (plan.baked) plan.baked.cells = RRStructure2D.cells(plan, id => this.editor.databaseManager?.getTileset?.(id)?.flags || null);
            plan._needsBake = true;
            this.markDirty();
            this.drawMarks();
        };
        canvas.addEventListener('mousedown', event => { if (event.button !== 0) return; painting = true; paint(event); });
        canvas.addEventListener('mousemove', event => { if (painting) paint(event); });
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
