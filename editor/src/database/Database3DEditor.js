/**
 * Database section for 3D models: every model folder under 3d/ is listed,
 * its named parts are discovered from the mesh, and animation rules are
 * authored here — written to the model's own `3d/<name>/model.json`, the
 * sidecar the runtime plays. The preview runs the rules live, with the
 * same engine code the game uses.
 *
 * The edit card in the preview's corner is the whole editor: pick a part
 * by clicking the model (or from the card's own dropdown), choose a
 * motion — Pose, Swing, Spin, Bob, or an embedded Clip — and shape it
 * with sliders that move the model live. Duration, trigger, and whether
 * an on-demand pose returns or stays are all on the card; one button
 * saves or updates the animation. The panel lists parts and animations;
 * everything is edited on the card. While a part is being edited the
 * model's ambient animations stand still so nothing fights the hand.
 */
class Database3DEditor {
    _writeFileAtomic(fs, filePath, data, options) {
        const atomic = typeof globalThis.RRWriteFileAtomicSync === 'function'
            ? globalThis.RRWriteFileAtomicSync
            : null;
        if (atomic && fs && typeof fs.renameSync === 'function') atomic(fs, filePath, data, options);
        else fs.writeFileSync(filePath, data, options);
    }

    _readSidecarForUpdate(fs) {
        const sidecarPath = this.rulesPath();
        try {
            return fs.readFileSync(sidecarPath, 'utf8');
        } catch (error) {
            if (error?.code === 'ENOENT') return '';
            // The browser fs does not attach Node error codes, but it can
            // author a new sidecar whose manifest entry is genuinely absent.
            const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
            if (host?.mode === 'web' && !fs.existsSync(sidecarPath)) return '';
            throw error;
        }
    }

    /**
     * Hover highlighting raycasts the whole mesh on the main thread, with
     * no BVH: roughly 0.6 ms per thousand triangles, so a 600k-triangle
     * character costs ~350 ms per pick. Above this budget the highlight
     * waits for a click; below it, a pick only runs once the pointer has
     * rested and the camera has settled, so it never lands mid-orbit.
     */
    static get HOVER_TRIANGLE_BUDGET() { return 150000; }

    static shouldRaycastHover({ now, movedAt, inputAt, dragging, triangles, restMs = 150, settleMs = 250 }) {
        if (dragging) return false;
        if (!Number.isFinite(movedAt)) return false;
        if (now - movedAt < restMs) return false;
        if (Number.isFinite(inputAt) && now - inputAt < settleMs) return false;
        if ((triangles || 0) > Database3DEditor.HOVER_TRIANGLE_BUDGET) return false;
        return true;
    }

    /** Every texture already holds decoded pixels (worker ImageBitmaps or a complete image). */
    /** Resolves when every texture has decoded, or after `limit` ms. */
    static whenTexturesDecoded(textures, limit) {
        return new Promise(resolve => {
            const until = performance.now() + (limit || 0);
            const check = () => {
                if (Database3DEditor.texturesDecoded(textures) || performance.now() >= until) resolve();
                else setTimeout(check, 100);
            };
            check();
        });
    }

    static texturesDecoded(textures) {
        for (const texture of textures || []) {
            if (!texture) continue;
            const image = texture.image;
            // A GLB texture is created empty and given its image when that
            // image has loaded; no image yet means not decoded, not "nothing
            // to decode" - drawn then, the model is a black silhouette.
            if (!image) return false;
            if (typeof image.complete === 'boolean') {
                if (!image.complete || !(image.naturalWidth > 0)) return false;
            } else if (!(image.width > 0)) {
                return false;
            }
        }
        return true;
    }

    /** Per-machine thumbnail cache directory, beside the editor profiles. */
    static thumbnailCacheRoot(proc, pathMod, osMod) {
        if (proc.platform === 'win32') {
            const localAppData = proc.env.LOCALAPPDATA || pathMod.join(osMod.homedir(), 'AppData', 'Local');
            return pathMod.join(localAppData, 'RPGReactor', 'ModelThumbnails');
        }
        if (proc.platform === 'darwin') {
            return pathMod.join(osMod.homedir(), 'Library', 'Application Support', 'RPGReactor', 'ModelThumbnails');
        }
        const cacheRoot = proc.env.XDG_CACHE_HOME || pathMod.join(osMod.homedir(), '.cache');
        return pathMod.join(cacheRoot, 'rpg-reactor', 'model-thumbnails');
    }

    /**
     * Whether an idle preview should draw this frame. Anything active keeps
     * the full refresh rate; a still model repaints ten times a second, which
     * is enough to show any change the activity checks missed and cheap
     * enough to leave open on a laptop.
     */
    static shouldRenderPreview({ now, active, lastRenderAt, idleInterval = 100 }) {
        if (active) return true;
        if (!(lastRenderAt > 0)) return true;
        return now - lastRenderAt >= idleInterval;
    }

    /** Cache file name keyed by the source file's identity and contents stamp. */
    /**
     * Bumped when what a thumbnail looks like changes, or when a run of
     * bad ones has been cached: every entry is then drawn again once.
     * 2: icons drawn before their textures had decoded (black silhouettes)
     *    and icons drawn while shadow samplers were empty (nothing at all)
     *    were cached under 1.
     * 3: render at 512px for sharp detail previews and high-density displays.
     * 4: inspection lighting is independent of the current map.
     */
    static THUMBNAIL_CACHE_VERSION = 4;

    static thumbnailCacheName(sourcePath, size, mtimeMs) {
        const crypto = require('crypto');
        return crypto.createHash('sha1')
            .update(`${sourcePath}|${size}|${Math.round(mtimeMs)}|v${Database3DEditor.THUMBNAIL_CACHE_VERSION}`)
            .digest('hex') + '.png';
    }

    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.selectedName = '';
        this.rawAnimations = [];
        this.rawEffects = [];
        this.selectedEffect = -1;
        this.rawTransform = null;
        this._cardMode = 'part';
        this._modelTab = 'transform';
        this._fxTab = 'offset';
        this.customParts = [];
        this.playRules = [];
        this.partNames = [];
        this.selectedRule = -1;
        this.selectedPart = -1;
        // The card's target: null = nothing chosen, '' = whole model.
        this.selectedPartName = null;
        this._view = { yaw: 30, pitch: 20, distance: 4, pan: { x: 0, y: 0, z: 0 } };
        // Inputs steer the goal; the camera eases toward it every frame,
        // so wheel notches and pointer deltas glide instead of snapping.
        // The pan slides the orbit centre off the model's middle: a wheel
        // zooms toward the pointer, Shift-drag or the middle button pans.
        this._viewGoal = { yaw: 30, pitch: 20, distance: 4, pan: { x: 0, y: 0, z: 0 } };
        this._sim = { walking: false, action: null };
        this._tool = 'orbit';
        this._selectMode = false;
        this._selection = new Map();
        this._selectThrough = false;
        this._selUndo = [];
        this.customPivots = {};
        this._work = Database3DEditor.defaultWork();
        this._workRule = null;
        this._workSuppressed = false;
        this._previewRule = null;
        this._cardTab = 'rotate';
        this._cardCollapsed = false;
        this._editingRule = -1;
        this._hoverName = '';
        // Working edits survive deselection: choosing a target again
        // resumes exactly where its sliders were left, with an undo trail.
        this._poses = {};
        this._undo = {};
        this._pendingUndo = null;
        this._gen = 0;
    }

    static defaultWork() {
        return {
            name: '', motion: 'pose', axis: 'z',
            rotate: [0, 0, 0], move: [0, 0, 0], resize: [1, 1, 1],
            degrees: 15, speed: 90, perTile: 0, amount: 0.1, clip: '', rate: 1,
            period: 30, trigger: 'action', hold: false, repeat: false, effects: [], keys: []
        };
    }

    _t(text, params = {}) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params)) {
            value = value.split(`{${key}}`).join(String(replacement));
        }
        return value;
    }

    _project() {
        return this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
    }

    _ensureProjectCaches() {
        const project = this._project();
        const key = project?.path || '';
        if (this._cacheProjectKey !== undefined && this._cacheProjectKey !== key) {
            this._templates = {};
            this._thumbs = {};
            this._thumbPromises = {};
            this._statsCache = new Map();
            this.selectedName = '';
            this._thumbnailGeneration = (this._thumbnailGeneration || 0) + 1;
        }
        this._cacheProjectKey = key;
    }

    show(detailEl) {
        this._ensureProjectCaches();
        this._detail = detailEl;
        detailEl.innerHTML = `
            <div style="display:flex;flex-direction:row;gap:0;height:100%;min-height:0;">
                <div class="r3d-browser-column" style="width:220px;flex:0 0 220px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);min-height:0;">
                    <div style="padding:6px 10px;font-weight:bold;color:var(--color-text);border-bottom:1px solid var(--color-border);">${this._t('Models')}</div>
                    <div class="database-search-container" style="padding:8px;background-color:var(--color-bg-menubar);border-bottom:1px solid var(--color-border);flex-shrink:0;">
                        <input type="text" class="r3d-model-search" placeholder="${this._t('Search files...')}"
                            style="width:100%;padding:6px 10px;background-color:var(--color-bg-panel);border:1px solid var(--color-border-input);border-radius:3px;color:var(--color-text);font-size:12px;box-sizing:border-box;">
                    </div>
                    <div class="r3d-model-list" style="flex:1;overflow-y:auto;min-height:0;"></div>
                </div>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--color-bg-deep);min-height:0;">
                    <div class="r3d-canvas-wrap" style="position:relative;flex:1;min-height:0;">
                        <canvas class="r3d-db-canvas" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab;"></canvas>
                        <div class="r3d-toolbar" style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:4px;"></div>
                        <div class="r3d-hint" style="position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:3px 10px;background:color-mix(in srgb, var(--color-bg-panel) 80%, transparent);border-radius:10px;font-size:11px;color:var(--color-text-muted);pointer-events:none;display:none;"></div>
                        <div class="r3d-select-bar" style="position:absolute;top:8px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:4px 10px;background:var(--color-bg-panel);border:1px solid var(--color-accent);border-radius:4px;font-size:12px;color:var(--color-text);"></div>
                        <div class="r3d-rig-bar" style="position:absolute;top:8px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:4px 10px;background:var(--color-bg-panel);border:1px solid var(--color-accent);border-radius:4px;font-size:12px;color:var(--color-text);"></div>
                        <div class="r3d-marquee" style="position:absolute;display:none;border:1px dashed var(--color-accent);background:color-mix(in srgb, var(--color-accent) 15%, transparent);pointer-events:none;"></div>
                        <div class="r3d-card" style="position:absolute;right:10px;top:10px;width:280px;max-width:calc(100% - 56px);box-sizing:border-box;display:none;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:6px;padding:10px 12px;box-shadow:0 4px 18px rgba(0,0,0,0.35);"></div>
                        <div class="r3d-stats-card" style="position:absolute;left:8px;bottom:8px;width:272px;max-width:calc(100% - 16px);max-height:55%;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,0.35);overflow:hidden;">
                            <div class="sidebar-header r3d-sec-header" data-sec="stats" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:5px 10px 5px 7px;font-size:11px;">
                                <span class="r3d-sec-toggle" style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">▾</span>
                                <span style="flex:1;">${this._t('What this model costs')}</span>
                                <button type="button" class="rr-btn-secondary r3d-optimize" style="text-transform:none;font-size:11px;padding:2px 8px;"
                                    title="${this._t('Shrink this model in place. The original is kept beside it.')}">${this._t('Optimize…')}</button>
                            </div>
                            <div class="r3d-stats" style="flex:1 1 auto;min-height:0;overflow-y:auto;padding:6px 10px 8px 10px;font-size:11px;"></div>
                        </div>
                    </div>
                    <div class="r3d-sim-bar" style="display:flex;gap:6px;align-items:center;padding:6px 8px;border-top:1px solid var(--color-border);flex-wrap:wrap;"></div>
                </div>
                <div class="r3d-record-column" style="width:300px;flex:0 0 300px;display:flex;flex-direction:column;border-left:1px solid var(--color-border);min-height:0;">
                    <div class="sidebar-header r3d-sec-header" data-sec="parts" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <span class="r3d-sec-toggle" style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">▾</span>
                        <span style="flex:1;">${this._t('Parts')}</span>
                        <button type="button" class="rr-btn-secondary r3d-part-add">${this._t('Add')}</button>
                        <button type="button" class="rr-btn-secondary r3d-part-delete" style="margin-left:6px;">${this._t('Delete')}</button>
                    </div>
                    <div class="r3d-part-list" style="flex:0 0 auto;max-height:110px;overflow-y:auto;border-bottom:1px solid var(--color-border);"></div>
                    <div class="r3d-part-form" style="flex:0 0 auto;padding:0 10px;border-bottom:1px solid var(--color-border);"></div>
                    <div class="sidebar-header r3d-sec-header" data-sec="animations" data-model-record-kind="animation" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <span class="r3d-sec-toggle" style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">▾</span>
                        <span style="flex:1;">${this._t('Animations')}</span>
                        <button type="button" class="rr-btn-secondary r3d-rule-add">${this._t('Add')}</button>
                        <button type="button" class="rr-btn-secondary r3d-rule-delete" style="margin-left:6px;">${this._t('Delete')}</button>
                    </div>
                    <div class="r3d-motions-row" data-model-record-kind="animation" style="display:none;padding:6px 10px;border-bottom:1px solid var(--color-border);">
                        <button type="button" class="rr-btn-secondary r3d-motions" style="width:100%;">${this._t('Motions…')}</button>
                    </div>
                    <div class="r3d-rule-list" data-model-record-kind="animation" style="flex:1;overflow-y:auto;min-height:0;"></div>
                    <div class="r3d-rule-note" data-model-record-kind="animation" style="padding:6px 10px;font-size:11px;color:var(--color-text-muted);border-top:1px solid var(--color-border);">${this._t('Adjust this pose with the sliders in the preview.')}</div>
                    <div class="sidebar-header r3d-sec-header" data-sec="effects" data-model-record-kind="effect" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <span class="r3d-sec-toggle" style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">▾</span>
                        <span style="flex:1;">${this._k('r3dfx.title')}</span>
                        <button type="button" class="rr-btn-secondary r3d-effect-add">${this._t('Add')}</button>
                        <button type="button" class="rr-btn-secondary r3d-effect-delete" style="margin-left:6px;">${this._t('Delete')}</button>
                    </div>
                    <div class="r3d-effect-list" data-model-record-kind="effect" style="flex:0 0 auto;min-height:64px;max-height:96px;overflow-y:auto;border-top:1px solid var(--color-border);"></div>
                    <div class="r3d-effect-form" data-model-record-kind="effect" style="flex:0 0 auto;max-height:46%;overflow-y:auto;padding:0 10px;border-top:1px solid var(--color-border);"></div>
                    <div class="r3d-status" data-model-record-kind="effect" style="padding:4px 10px;font-size:11px;color:var(--color-text-muted);min-height:20px;"></div>
                </div>
            </div>`;
        const optimize = detailEl.querySelector('.r3d-optimize');
        if (optimize) optimize.addEventListener('click', () => this.optimizeSelectedModel());
        const search = detailEl.querySelector('.r3d-model-search');
        search.addEventListener('input', () => this.renderModelList(true));
        search.addEventListener('focus', () => {
            search.style.borderColor = 'var(--color-accent-border-strong)';
            search.style.outline = 'none';
        });
        search.addEventListener('blur', () => {
            search.style.borderColor = 'var(--color-border-input)';
        });
        detailEl.querySelector('.r3d-motions').addEventListener('click', () => this.showMotionPresets());
        detailEl.querySelector('.r3d-rule-add').addEventListener('click', () => this.addRule());
        detailEl.querySelector('.r3d-effect-add').addEventListener('click', () => this.addModelEffect());
        detailEl.querySelector('.r3d-effect-delete').addEventListener('click', () => this.deleteModelEffect());
        // Each section folds from its header (the buttons stay live), and a
        // click on a list's empty space lets go of whatever was selected.
        this._sectionsCollapsed = this._sectionsCollapsed || {};
        detailEl.querySelectorAll('.r3d-sec-header').forEach(header => header.addEventListener('click', event => {
            if (event.target.closest('button')) return;
            this.toggleSection(header.dataset.sec);
        }));
        const clickOff = (selector, clear) => detailEl.querySelector(selector)?.addEventListener('click', event => {
            if (event.target === event.currentTarget) clear();
        });
        clickOff('.r3d-effect-list', () => { this._leaveEffectMode(); this.renderEditCard(); });
        clickOff('.r3d-rule-list', () => { this.selectedRule = -1; this.deselectPart(); });
        clickOff('.r3d-part-list', () => this.deselectPart());
        this._bindModelRecordLists();
        detailEl.querySelector('.r3d-rule-delete').addEventListener('click', () => this.deleteRule());
        detailEl.querySelector('.r3d-part-add').addEventListener('click', () => this.addPart());
        detailEl.querySelector('.r3d-part-delete').addEventListener('click', () => this.deletePart());
        this.renderToolbar();
        this._bindPreviewInput(detailEl.querySelector('.r3d-db-canvas'));
        if (!this._keysBound) {
            this._keysBound = true;
            document.addEventListener('keydown', event => this._onKeyDown(event), true);
        }
        this.renderModelList();
        // A project with no models still gets the panel's own explanation of
        // itself rather than an empty box.
        if (!this.selectedName) this.renderModelStats();
    }

    /**
     * Escape backs out of the current mode; Ctrl+Z/Y drive the undo of
     * whatever is underway — the marquee selection in select mode, the
     * card's work otherwise.
     */
    _onKeyDown(event) {
        if (!this._detail || !this._detail.isConnected) return;
        const consume = () => {
            event.stopPropagation();
            event.preventDefault();
        };
        const recordKind = this._modelRecordListKind(event.target);
        const editingText = event.target?.closest?.('input, textarea, [contenteditable]');
        if (recordKind && !editingText && (event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === 'c' || key === 'v') {
                consume();
                if (key === 'c') this.copyModelRecord(recordKind);
                else this.pasteModelRecord(recordKind);
                return;
            }
        }
        if (this._selectMode) {
            if (event.key === 'Escape') {
                this.cancelSelectMode();
                this.setTool('orbit');
                consume();
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                this.selectionUndo();
                consume();
            }
            return;
        }
        if (this.selectedPartName === null) return;
        const typing = event.target && event.target.tagName === 'INPUT'
            && event.target.type !== 'range';
        if (event.key === 'Escape') {
            this.deselectPart();
            consume();
            return;
        }
        if (typing || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
            this.undoPose();
        } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
            this.redoPose();
        } else {
            return;
        }
        consume();
    }

    _modelRecordListKind(target) {
        if (target?.closest?.('.r3d-effect-list')) return 'effect';
        if (target?.closest?.('.r3d-rule-list')) return 'animation';
        return null;
    }

    _bindModelRecordLists() {
        for (const selector of ['.r3d-rule-list', '.r3d-effect-list']) {
            const list = this._detail.querySelector(selector);
            list.tabIndex = 0;
            list.addEventListener('pointerdown', () => list.focus({ preventScroll: true }));
        }
        // Headers, form padding and the footer belong to the section too;
        // an empty/short effect list must still offer somewhere to paste.
        const column = this._detail.querySelector('.r3d-record-column');
        column.addEventListener('contextmenu', event => {
            if (event.target.closest('input, textarea, select, [contenteditable]')) return;
            const area = event.target.closest('[data-model-record-kind]');
            const kind = area?.dataset.modelRecordKind || (event.target === column ? 'effect' : null);
            if (!kind) return;
            event.preventDefault();
            event.stopPropagation();
            const row = event.target.closest('[data-model-record-index]');
            const index = row ? Number(row.dataset.modelRecordIndex) : -1;
            this._showModelRecordMenu(kind, index, event.clientX, event.clientY);
            this._detail.querySelector(kind === 'effect' ? '.r3d-effect-list' : '.r3d-rule-list')
                .focus({ preventScroll: true });
        });
    }

    _modelRecordIndex(kind) {
        return kind === 'effect' ? this.selectedEffect : this.selectedRule;
    }

    _modelRecordStatus(message) {
        const status = this._detail?.querySelector('.r3d-status');
        if (status) status.textContent = message;
    }

    _modelRecordPayload(kind) {
        const index = this._modelRecordIndex(kind);
        const raw = (kind === 'effect' ? this.rawEffects : this.rawAnimations)[index];
        if (!raw) return null;
        let record = raw;
        if (kind === 'effect' && this._effectWork && this._cardMode === 'effect') record = this._effectWork;
        if (kind === 'animation' && this._editingRule === index && this._cardMode !== 'effect') {
            record = { ...raw, ...this._workValues(), name: this._work.name || raw.name };
        }
        const names = new Set((kind === 'animation' ? record.effects || [] : []).map(step => step?.effect).filter(Boolean));
        return JSON.parse(JSON.stringify({ version: 1, kind, record,
            effects: this.rawEffects.filter(effect => names.has(effect.name)) }));
    }

    copyModelRecord(kind) {
        const payload = this._modelRecordPayload(kind);
        if (!payload) return Promise.resolve(false);
        this._modelRecordClipboard = payload;
        const selection = this._modelSelection;
        // Keep rapid copy/paste ordered even when the browser clipboard is async.
        const write = (this._modelClipboardWrite || Promise.resolve()).catch(() => false).then(() =>
            typeof ReactorClipboard === 'undefined' ? true : ReactorClipboard.write('model3dRecord', payload));
        this._modelClipboardWrite = write.catch(() => false);
        return this._modelClipboardWrite.then(ok => {
            if (selection === this._modelSelection) this._modelRecordStatus(ok ? this._t('Copied') : this._k('db.clipboardWriteFailed'));
            return ok;
        });
    }

    async pasteModelRecord(kind) {
        const selection = this._modelSelection;
        const detail = this._detail;
        const project = this._project();
        if (!this.selectedName || this._loadingPreview) return false;
        try {
            await this._modelClipboardWrite;
            const payload = typeof ReactorClipboard === 'undefined' ? this._modelRecordClipboard
                : (await ReactorClipboard.read('model3dRecord'))?.payload;
            // A permission prompt/read may outlive the destination model or panel.
            if (selection !== this._modelSelection || detail !== this._detail || !detail?.isConnected || project !== this._project()) return false;
            return this._pasteModelRecordPayload(kind, payload);
        } catch (error) {
            if (selection === this._modelSelection) this._modelRecordStatus(error.message || String(error));
            return false;
        }
    }

    _pasteModelRecordPayload(kind, payload) {
        if (!['animation', 'effect'].includes(kind) || payload?.version !== 1 || payload.kind !== kind
            || !payload.record || typeof payload.record !== 'object' || Array.isArray(payload.record)) {
            this._modelRecordStatus(this._t('No matching animation or effect in the clipboard.'));
            return false;
        }
        const record = JSON.parse(JSON.stringify(payload.record));
        const records = kind === 'effect' ? this.rawEffects : this.rawAnimations;
        const uniqueName = (name, entries) => {
            const base = typeof name === 'string' && name.trim() ? name.trim() : kind;
            let result = base, n = 2;
            while (entries.some(entry => entry.name === result)) result = `${base} (${n++})`;
            return result;
        };
        record.name = uniqueName(record.name, records);
        // Named effects used by an animation travel with it. Reuse identical
        // definitions; rename conflicting ones and retarget only the pasted rule.
        if (kind === 'animation' && Array.isArray(record.effects) && Array.isArray(payload.effects)) {
            const renamed = new Map();
            for (const source of payload.effects) {
                if (!source || typeof source.name !== 'string' || renamed.has(source.name)
                    || !record.effects.some(step => step?.effect === source.name)) continue;
                const same = this.rawEffects.find(effect => effect.name === source.name);
                if (same && JSON.stringify(same) === JSON.stringify(source)) {
                    renamed.set(source.name, source.name);
                    continue;
                }
                const effect = JSON.parse(JSON.stringify(source));
                effect.name = uniqueName(effect.name, this.rawEffects);
                this.rawEffects.push(effect);
                renamed.set(source.name, effect.name);
            }
            for (const step of record.effects) if (renamed.has(step?.effect)) step.effect = renamed.get(step.effect);
        }
        records.push(record);
        this.saveRules();
        if (kind === 'effect') this.selectEffect(records.length - 1);
        else this.editRule(records.length - 1);
        this._detail?.querySelector(kind === 'effect' ? '.r3d-effect-list' : '.r3d-rule-list')?.focus({ preventScroll: true });
        return true;
    }

    _showModelRecordMenu(kind, index, x, y) {
        const records = kind === 'effect' ? this.rawEffects : this.rawAnimations;
        const exists = !!records[index];
        const edit = () => kind === 'effect' ? this.selectEffect(index) : this.editRule(index);
        // Right-clicking the current row must preserve its working edits.
        if (exists && (this._modelRecordIndex(kind) !== index || (kind === 'effect') !== (this._cardMode === 'effect'))) edit();
        const selection = this._modelSelection;
        const run = action => () => { if (selection === this._modelSelection && this._detail?.isConnected) return action(); };
        const menu = typeof window !== 'undefined' && window.reactor?.databaseEditorUI;
        menu?.showDatabaseActionMenu(x, y, [
            { label: this._t('Edit'), enabled: exists, action: run(edit) },
            { label: this._t('Copy'), shortcut: 'Ctrl+C', enabled: exists, action: run(() => this.copyModelRecord(kind)) },
            { label: this._t('Paste'), shortcut: 'Ctrl+V', enabled: !!this.selectedName && !this._loadingPreview, action: run(() => this.pasteModelRecord(kind)) },
            { label: this._t('Duplicate'), enabled: exists, action: run(() => this._pasteModelRecordPayload(kind, this._modelRecordPayload(kind))) },
            { separator: true },
            { label: this._t('Delete'), enabled: exists, action: run(() => kind === 'effect' ? this.deleteModelEffect() : this.deleteRule()) }
        ]);
    }

    listModels() {
        const project = this._project();
        if (!project || !project.path || typeof ModelGraphicPicker === 'undefined') return [];
        return ModelGraphicPicker.listModels(project.path);
    }

    renderModelList(fromSearch = false) {
        const list = this._detail.querySelector('.r3d-model-list');
        const search = this._detail.querySelector('.r3d-model-search');
        const needle = search ? search.value.trim().toLowerCase() : '';
        list.innerHTML = '';
        const models = this.listModels();
        const shown = needle
            ? models.filter(m => m.name.toLowerCase().indexOf(needle) >= 0)
            : models;
        if (!shown.length) {
            list.innerHTML = `<div style="padding:10px;color:var(--color-text-muted);font-size:12px;">${this._t('No models in this project')}</div>`;
            return;
        }
        if (!this._openFolders) this._openFolders = new Set();
        // Resolve the auto-selection BEFORE painting: its folder must show
        // open on this very render, or the header's glyph disagrees with
        // the state and the first click appears to do nothing.
        const initial = fromSearch
            ? null
            : (models.find(m => m.name === this.selectedName) || models[0]);
        if (initial && initial.name.indexOf('/') > 0) {
            this._openFolders.add(initial.name.slice(0, initial.name.indexOf('/')));
        }
        const addRow = (entry, indented) => {
            const row = document.createElement('div');
            row.className = 'database-list-item';
            row.dataset.model = entry.name;
            if (indented) row.style.paddingLeft = '22px';
            const icon = document.createElement('span');
            icon.className = 'database-list-icon';
            icon.style.cssText = 'flex:0 0 22px;width:22px;height:22px;margin-right:8px;background-size:contain;background-position:center;background-repeat:no-repeat;border-radius:3px;background-color:var(--color-bg-deep);border:1px solid var(--color-border);';
            const name = document.createElement('span');
            name.className = 'database-list-name';
            name.textContent = indented ? entry.name.slice(entry.name.indexOf('/') + 1) : entry.name;
            name.setAttribute('data-rr-i18n-skip', '1');
            name.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            row.appendChild(icon);
            row.appendChild(name);
            row.addEventListener('click', () => this.selectModel(entry));
            list.appendChild(row);
        };
        // Folders first, collapsed until opened — a search or the current
        // selection reveals what they hold.
        const folders = new Map();
        const roots = [];
        for (const entry of shown) {
            const cut = entry.name.indexOf('/');
            if (cut < 0) {
                roots.push(entry);
                continue;
            }
            const folder = entry.name.slice(0, cut);
            if (!folders.has(folder)) folders.set(folder, []);
            folders.get(folder).push(entry);
        }
        const visible = [];
        for (const [folder, entries] of [...folders.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))) {
            const open = !!needle || this._openFolders.has(folder);
            // A folder is a section header in the editor's family: the dark
            // bar with the accent strip, its chevron and count at the ends.
            const head = document.createElement('div');
            head.className = 'database-list-item r3d-folder-head';
            head.classList.toggle('open', open);
            head.setAttribute('data-rr-i18n-skip', '1');
            head.setAttribute('role', 'button');
            head.setAttribute('aria-expanded', String(open));
            const chevron = document.createElement('span');
            chevron.className = 'r3d-folder-chevron';
            chevron.textContent = '▾';
            const label = document.createElement('span');
            label.className = 'r3d-folder-name';
            label.textContent = folder;
            const count = document.createElement('span');
            count.className = 'r3d-folder-count';
            count.textContent = String(entries.length);
            head.append(chevron, label, count);
            head.addEventListener('click', () => {
                if (this._openFolders.has(folder)) this._openFolders.delete(folder);
                else this._openFolders.add(folder);
                this.renderModelList(true);
            });
            list.appendChild(head);
            if (open) {
                for (const entry of entries) {
                    addRow(entry, true);
                    visible.push(entry);
                }
            }
        }
        for (const entry of roots) {
            addRow(entry, false);
            visible.push(entry);
        }
        this.highlightModel();
        // After the paint: thumbnail work must never sit between the
        // toggle click and the rows appearing.
        setTimeout(() => this._fillThumbnails(visible), 0);
        if (!fromSearch) {
            this.selectModel(initial);
        }
    }

    highlightModel() {
        this._detail.querySelectorAll('.r3d-model-list > .database-list-item').forEach(row => {
            row.classList.toggle('selected', row.dataset.model === this.selectedName);
        });
    }

    _thumbRow(name) {
        return this._detail
            ? this._detail.querySelector('.r3d-model-list [data-model="' + CSS.escape(name) + '"] .database-list-icon')
            : null;
    }

    async _fillThumbnails(entries) {
        this._ensureProjectCaches();
        const generation = this._thumbnailGeneration;
        const project = this._project();
        const current = () => generation === this._thumbnailGeneration && project === this._project()
            && this._detail?.isConnected;
        if (!this._thumbs) this._thumbs = {};
        const apply = (name, url) => {
            const icon = this._thumbRow(name);
            if (icon) icon.style.backgroundImage = `url("${url}")`;
        };
        for (const entry of entries) {
            const cached = this._thumbs[entry.name] || this._readCachedThumbnail(entry);
            if (cached) {
                this._thumbs[entry.name] = cached;
                apply(entry.name, cached);
                continue;
            }
            // An uncached thumbnail loads and renders the whole model in
            // one main-thread chunk. It waits for the list to paint and
            // for the preview to be idle: rendering it under an orbit or
            // a zoom was the stutter people felt in the first seconds.
            await new Promise(resolve => setTimeout(resolve, 0));
            await this._whenPreviewIdle();
            if (!current()) return;
            const url = await this._renderThumbnail(entry);
            if (!current()) return;
            if (!url) continue;
            this._thumbs[entry.name] = url;
            apply(entry.name, url);
            const template = this._templates && this._templates[entry.name];
            const decoded = Database3DEditor.texturesDecoded(template && template.userData.glbTextures);
            if (decoded) {
                this._writeCachedThumbnail(entry, url);
                continue;
            }
            // Textures still decoding after the first draw: one late
            // re-render trades a moment of gray silhouette for the
            // coloured icon, and the coloured one is what gets cached.
            setTimeout(async () => {
                await this._whenPreviewIdle();
                if (!current()) return;
                const again = await this._renderThumbnail(entry);
                if (!current() || !again) return;
                this._thumbs[entry.name] = again;
                apply(entry.name, again);
                this._writeCachedThumbnail(entry, again);
            }, 1600);
        }
    }

    /**
     * Resolves once nothing is competing for the frame: no model loading
     * into the preview, no drag in progress, no orbit or zoom input in the
     * last 600 ms, and no pointer motion over the canvas in the last 300 ms
     * (a hand moving toward a drag). Thumbnail work is the only caller.
     */
    _whenPreviewIdle() {
        return new Promise(resolve => {
            const check = () => {
                if (!this._detail || !this._detail.isConnected) return resolve();
                const now = performance.now();
                const busy = this._loadingPreview || this._dragging
                    || (Number.isFinite(this._lastInputAt) && now - this._lastInputAt < 600)
                    || (Number.isFinite(this._pointerMovedAt) && now - this._pointerMovedAt < 300);
                if (busy) setTimeout(check, 120);
                else resolve();
            };
            check();
        });
    }

    /** Desktop only: the source file's path, size, and mtime name the cache entry. */
    _thumbnailCachePath(entry) {
        if (typeof require !== 'function' || typeof process === 'undefined') return null;
        try {
            const fs = require('fs');
            const path = require('path');
            const project = this._project();
            if (!project || !project.path) return null;
            const file = (entry.file || entry.name) + (entry.ext || '.glb');
            const next = path.join(project.path, '3d', entry.name, 'source', file);
            const sourcePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
            const stat = fs.statSync(sourcePath);
            const root = Database3DEditor.thumbnailCacheRoot(process, path, require('os'));
            return path.join(root, Database3DEditor.thumbnailCacheName(sourcePath, stat.size, stat.mtimeMs));
        } catch (error) {
            return null;
        }
    }

    _readCachedThumbnail(entry) {
        const cachePath = this._thumbnailCachePath(entry);
        if (!cachePath) return null;
        try {
            const fs = require('fs');
            if (!fs.existsSync(cachePath)) return null;
            const bytes = fs.readFileSync(cachePath);
            // An empty picture cached by an earlier, failed render is
            // treated as missing so it is drawn again.
            if (bytes.length <= Database3DEditor.EMPTY_THUMBNAIL_BYTES) return null;
            return 'data:image/png;base64,' + bytes.toString('base64');
        } catch (error) {
            return null;
        }
    }

    _writeCachedThumbnail(entry, dataUrl) {
        const cachePath = this._thumbnailCachePath(entry);
        if (!cachePath || typeof dataUrl !== 'string') return;
        const comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith('data:image/png;base64,') || comma < 0) return;
        try {
            const fs = require('fs');
            const path = require('path');
            fs.mkdirSync(path.dirname(cachePath), { recursive: true });
            fs.writeFileSync(cachePath, Buffer.from(dataUrl.slice(comma + 1), 'base64'));
        } catch (error) {
            // The cache is a convenience; a read-only home just renders again next time.
        }
    }

    async _renderThumbnail(entry, options = {}) {
        // The worker parse runs whenever; the build and the draw wait for
        // an idle preview.
        const template = await this._loadTemplate(entry, { beforeBuild: () => this._whenPreviewIdle() });
        await this._whenPreviewIdle();
        if (!template || typeof THREE === 'undefined') return null;
        // A model's textures decode on their own time after the parse. Drawn
        // before they land, the icon is a black silhouette - and one drawn
        // late enough was cached that way for as long as the file kept its
        // size and date. Wait for them, within reason.
        await Database3DEditor.whenTexturesDecoded(template.userData.glbTextures, 6000);
        await this._whenPreviewIdle();
        // Bound-model previews also request thumbnails outside the 3D tab.
        // Their caller owns the lifetime; the model list retains its detail guard.
        if (options.isCurrent ? !options.isCurrent() : (!this._detail || !this._detail.isConnected)) return null;
        if (!this._thumbRenderer) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            this._thumbRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
            this._thumbRenderer.setClearColor(0x000000, 0);
            this._thumbScene = new THREE.Scene();
            this._thumbCamera = Reactor3D.createCamera({ fov: 40 });
        }
        const object = Reactor3D.cloneModelTemplate
            ? Reactor3D.cloneModelTemplate(template)
            : template.clone(true);
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const scale = 1.6 / span;
        object.scale.setScalar(scale);
        ModelPreview3D.isolateLighting(object);
        this._thumbScene.add(object);
        // Templates stand feet-at-origin: aim mid-height, dead centre
        // (aimCamera adds +0.5 to x/z, so -0.5 targets the true origin).
        Reactor3D.aimCamera(this._thumbCamera,
            { x: -0.5, y: (extent.y * scale) / 2, z: -0.5 }, { yaw: 35, pitch: 18, distance: 2.6 });
        this._thumbCamera.aspect = 1;
        this._thumbCamera.updateProjectionMatrix();
        this._thumbRenderer.render(this._thumbScene, this._thumbCamera);
        this._thumbScene.remove(object);
        object.traverse(node => {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) material?.dispose?.();
        });
        try {
            // A picture with nothing in it is a failed render, not a
            // thumbnail: caching it would show a black square for as long as
            // the file keeps its size and date.
            if (!Database3DEditor.canvasHasPixels(this._thumbRenderer.domElement)) return null;
            return this._thumbRenderer.domElement.toDataURL('image/png');
        } catch (error) {
            return null;
        }
    }

    /** Whether any pixel of a canvas is more than faintly visible. */
    static canvasHasPixels(source) {
        const probe = document.createElement('canvas');
        probe.width = 16;
        probe.height = 16;
        const ctx = probe.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] >= 2) return true;
        return false;
    }

    /** The largest a 64x64 PNG of nothing comes to; a real thumbnail is several times that. */
    static EMPTY_THUMBNAIL_BYTES = 320;

    /** Templates cached per model: the preview and the thumbnails share them. */
    async _loadTemplate(entry, options = {}) {
        this._ensureProjectCaches();
        const project = this._project();
        if (!this._templates) this._templates = {};
        const templates = this._templates;
        if (templates[entry.name]) return templates[entry.name];
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D?.extensionsLoaded?.())
            || (this.projectController.mapEditor3D && this.projectController.mapEditor3D.ensureLibraries
                && await this.projectController.mapEditor3D.ensureLibraries());
        if (!ready) return null;
        const fs = require('fs');
        const path = require('path');
        if (project !== this._project()) return null;
        if (!project || !project.path) return null;
        const file = (entry.file || entry.name) + (entry.ext || '.glb');
        const next = path.join(project.path, '3d', entry.name, 'source', file);
        const filePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
        if (!fs.existsSync(filePath)) return null;
        try {
            // Bytes come through the asset reader: synchronous on desktop, a
            // fetch of the served file in the browser (no sync byte access).
            const data = (typeof RREncryptedAssets !== 'undefined' && RREncryptedAssets.readAssetBytesAsync)
                ? await RREncryptedAssets.readAssetBytesAsync(filePath)
                : fs.readFileSync(filePath);
            if (!data) return null;
            const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const baseUrl = 'file://' + path.dirname(filePath).replace(/\\/g, '/') + '/';
            // The same worker the game uses: container split, JSON parse,
            // and embedded-texture decode off the editor's main thread.
            // beforeBuild holds the main-thread half of the load (scene
            // graph, geometry, materials) until the caller says the thread
            // is free; the worker parse itself never touches it.
            templates[entry.name] = Reactor3D.readModelAsync
                ? await Reactor3D.readModelAsync(buffer, entry.ext || '.glb', baseUrl, entry.texture || '',
                    { beforeBuild: options.beforeBuild })
                : Reactor3D.readModel(buffer, entry.ext || '.glb', baseUrl, entry.texture || '');
            return templates[entry.name];
        } catch (error) {
            return null;
        }
    }

    rulesPath(name) {
        const path = require('path');
        return path.join(this._project().path, '3d', name || this.selectedName, 'model.json');
    }

    /**
     * What a model costs to draw, read straight off its file. Cached against
     * the file's size and mtime, so re-selecting a model is free and a model
     * changed on disk (or by the Optimize action) is re-read.
     */
    modelStats(entry) {
        if (!entry || !window.RRGlbOptimizer) return null;
        const fs = require('fs');
        const path = require('path');
        const filePath = this.sourcePath(entry);
        if (!filePath) return null;
        let stat = null;
        try { stat = fs.statSync(filePath); } catch (error) { return null; }
        const key = `${filePath}|${stat.size}|${stat.mtimeMs}`;
        if (!this._statsCache) this._statsCache = new Map();
        if (this._statsCache.has(key)) return this._statsCache.get(key);

        let stats = null;
        this._statsPending = false;
        try {
            const analysis = this.analyzeModelFile(filePath, entry);
            if (analysis) {
                const largest = (analysis.images || []).reduce((best, image) =>
                    (!best || image.bytes > best.bytes) ? image : best, null);
                stats = {
                    analysis,
                    largestTexture: largest,
                    textureBytes: (analysis.images || []).reduce((sum, image) => sum + image.bytes, 0),
                    fileBytes: stat.size,
                    optimized: this._hasOriginalBeside(fs, path, filePath),
                    levels: []
                };
                // Distance levels are what stops a heavy prop costing its full
                // triangle count from across the map, so whether it has any is
                // half the answer to "why is this one slow".
                let sidecar = {};
                try {
                    const sidecarPath = this.rulesPath(entry.name);
                    if (fs.existsSync(sidecarPath)) sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) || {};
                } catch (error) { sidecar = {}; }
                stats.carvedParts = (sidecar.parts || []).length;
                for (const name of sidecar.lods || []) {
                    const levelPath = path.join(path.dirname(filePath), name);
                    if (!fs.existsSync(levelPath)) continue;
                    try {
                        const level = window.RRGlbOptimizer.analyze(new Uint8Array(fs.readFileSync(levelPath)));
                        if (level) stats.levels.push({ name, triangles: level.triangles });
                    } catch (error) { /* a level that will not read is simply not listed */ }
                }
            }
        } catch (error) {
            // Kept for the console: the panel says only that the cost could not be read.
            this._statsError = error;
            stats = null;
        }
        if (!this._statsPending) this._statsCache.set(key, stats);
        return stats;
    }

    /**
     * The cost panel. Numbers alone do not tell someone which model is making
     * their map slow, so each one that matters is followed by what it means
     * and what can be done about it.
     */
    renderModelStats() {
        const host = this._detail ? this._detail.querySelector('.r3d-stats') : null;
        if (!host) return;
        host.innerHTML = '';
        const entry = this.listModels().find(m => m.name === this.selectedName);
        const muted = 'color:var(--color-text-muted);';
        if (!entry) {
            host.innerHTML = `<div style="${muted}">${this._t('Select a model to see what it costs.')}</div>`;
            return;
        }
        const stats = this.modelStats(entry);
        if (!stats) {
            host.innerHTML = `<div style="${muted}">${this._t('This model’s cost could not be read.')}</div>`;
            return;
        }
        const a = stats.analysis;
        const mb = value => `${(value / 1048576).toFixed(1)} MB`;
        const num = value => value.toLocaleString();

        // Bands chosen against what the runtime does: models under
        // LOD_MIN_TRIANGLES get no distance levels because they are not worth
        // any, and a map's whole frame budget is a few hundred thousand.
        const triangles = a.triangles;
        const band = triangles < 20000 ? { label: this._t('Light'), kind: 'light' }
            : triangles < 150000 ? { label: this._t('Moderate'), kind: 'warning' }
            : triangles < 500000 ? { label: this._t('Heavy'), kind: 'warning' }
            : { label: this._t('Very heavy'), kind: 'heavy' };

        const headline = document.createElement('div');
        headline.style.cssText = 'display:flex;align-items:baseline;gap:6px;margin-bottom:6px;';
        headline.innerHTML = `<span style="font-size:16px;color:var(--color-text);">${num(triangles)}</span>`
            + `<span style="${muted}">${this._t('triangles')}</span>`
            + `<span class="rr-model-cost-badge" data-cost="${band.kind}">${band.label}</span>`;
        host.appendChild(headline);

        const rows = [
            [this._t('Vertices'), num(a.vertices)],
            [this._t('Draw calls'), `${num(a.primitives)}${a.materials ? ` · ${num(a.materials)} ${this._t('materials')}` : ''}`],
            [this._t('Textures'), a.images.length
                ? `${a.images.length} · ${mb(stats.textureBytes)}${stats.largestTexture && stats.largestTexture.width
                    ? ` · ${this._t('largest')} ${stats.largestTexture.width}×${stats.largestTexture.height}` : ''}`
                : this._t('none')],
            [this._t('File'), mb(stats.fileBytes)]
        ];
        if (a.skinned) {
            rows.push([this._t('Rig'), `${num(a.bones)} ${this._t('bones')} · ${num(a.animations)} ${this._t('animations')}`]);
        } else if (a.animations) {
            rows.push([this._t('Animations'), num(a.animations)]);
        }
        rows.push([this._t('Distance levels'), stats.levels.length
            ? stats.levels.map(level => num(level.triangles)).join(' · ')
            : this._t('none')]);

        const table = document.createElement('div');
        table.style.cssText = 'display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:2px;';
        for (const [label, value] of rows) {
            const left = document.createElement('div');
            left.style.cssText = muted;
            left.textContent = label;
            const right = document.createElement('div');
            right.style.cssText = 'color:var(--color-text);text-align:right;';
            right.textContent = value;
            table.append(left, right);
        }
        host.appendChild(table);

        // The actionable half: why this model costs what it does.
        const notes = [];
        if (a.skinned) {
            notes.push(this._t('Characters are posed every frame and are drawn at full detail at every distance — distance levels are not built for them. Their triangle count is paid in full, always.'));
        } else if (triangles >= 150000 && String(entry.ext || '.glb').toLowerCase() !== '.glb') {
            notes.push(this._t('This model costs every one of its triangles at every distance. Optimize converts it to GLB, bundles its textures inside and cuts them.'));
        } else if (triangles >= 150000) {
            notes.push(this._t('This model costs every one of its triangles at every distance. Optimize cuts them — a background prop rarely needs more than a fraction of what a generator gives it.'));
        }
        if (stats.levels.length) {
            notes.push(this._t('This model carries separate distance-level files. They are extra copies of the geometry on disk; optimizing the model clears them.'));
        }
        if (stats.carvedParts) {
            // Parts are triangle ranges into this exact triangle list, so a
            // reduction invalidates them and they have to be re-derived from
            // the new surface. Worth saying, because it is the one thing here
            // that is rebuilt rather than merely preserved.
            notes.push(this._t('{count} carved part(s): stored as triangle ranges, so Optimize re-derives them from the reduced surface.', { count: stats.carvedParts }));
        }
        if (stats.largestTexture && stats.largestTexture.width > 2048) {
            notes.push(this._t('A texture larger than 2K costs memory and load time with almost nothing to show for it on screen. Optimize caps it.'));
        } else if (stats.textureBytes > 8 * 1048576) {
            // A light mesh can still be an expensive model: textures are the
            // larger half of most files, and they cost the same however few
            // triangles they are wrapped around.
            notes.push(this._t('{size} of textures — most of this model’s weight is its pictures, not its shape. Optimize recompresses them.', { size: mb(stats.textureBytes) }));
        }
        const dead = (a.tangentBytes || 0) + (a.floatWeightBytes || 0);
        if (dead > 65536) {
            notes.push(this._t('{size} of this file is data the renderer never reads. Optimize drops it with no visible change.', { size: mb(dead) }));
        }
        if (a.primitives > 24) {
            notes.push(this._t('{count} draw calls: a model split into many pieces costs the frame once per piece, whatever its triangle count.', { count: num(a.primitives) }));
        }
        if (stats.optimized) {
            notes.push(this._t('Already optimized. The original is kept beside it as a .orig file.'));
        }
        for (const note of notes) {
            const line = document.createElement('div');
            line.style.cssText = `${muted}margin-top:6px;line-height:1.35;`;
            line.textContent = note;
            host.appendChild(line);
        }
    }

    /** Whether an original of this model is kept beside it, whatever its format was (`name.glb.orig`, `name.fbx.orig`…). */
    _hasOriginalBeside(fs, path, filePath) {
        try {
            const base = path.basename(filePath, path.extname(filePath)) + '.';
            return fs.readdirSync(path.dirname(filePath)).some(name => name.startsWith(base) && name.endsWith('.orig'));
        } catch (error) { return false; }
    }

    /**
     * A non-GLB model as GLB bytes: read by the runtime's reader for its
     * format, its pictures gathered from the textures folder beside the source
     * (or the bytes the file carried) and embedded, so the GLB stands alone.
     */
    _convertModelToGlb(fs, path, filePath, ext, entry) {
        if (typeof Reactor3D === 'undefined' || !Reactor3D.readModel) throw new Error('The 3D runtime is not loaded.');
        const readers = { '.obj': 'readObj', '.stl': 'readStl', '.dxf': 'readDxf', '.fbx': 'readFbx', '.3mf': 'read3mf', '.usdz': 'readUsdz' };
        const reader = readers[ext];
        if (!reader || typeof Reactor3D[reader] !== 'function') throw new Error('Files of type ' + ext + ' cannot be converted.');
        const bytes = new Uint8Array(fs.readFileSync(filePath));
        const mesh = Reactor3D[reader](bytes);
        const texturesDir = path.join(path.dirname(path.dirname(filePath)), 'textures');
        const images = {};
        const wanted = new Set();
        for (const material of mesh.materials || []) for (const name of [material.texture, material.alpha]) if (name) wanted.add(name);
        if (!(mesh.materials || []).length && entry.texture) wanted.add(entry.texture);
        for (const name of wanted) {
            const found = [path.join(texturesDir, name), path.join(path.dirname(filePath), name)].find(candidate => fs.existsSync(candidate));
            if (!found) continue;
            images[name] = { bytes: new Uint8Array(fs.readFileSync(found)), mimeType: /\.jpe?g$/i.test(found) ? 'image/jpeg' : /\.webp$/i.test(found) ? 'image/webp' : 'image/png' };
        }
        const glb = window.RRGlbOptimizer.fromMesh(mesh, images, { name: entry.name.split('/').pop(), texture: entry.texture || '' });
        return { bytes: glb, images: Object.keys(images).length + (mesh.materials || []).filter(m => m.embedded).length, sourceBytes: bytes.length };
    }

    /** Every model reference in the project's 3D sidecars that named the old extension now names the new one. */
    _retargetModelExtension(fs, path, name, from, to) {
        const project = this._project();
        if (!project || !project.path) return;
        const dataDir = path.join(project.path, 'data');
        let files = [];
        try { files = fs.readdirSync(dataDir).filter(file => /\.r3d\.json$/i.test(file)); } catch (error) { return; }
        const walk = node => {
            let changed = false;
            if (Array.isArray(node)) { for (const item of node) changed = walk(item) || changed; return changed; }
            if (!node || typeof node !== 'object') return false;
            if (node.name === name && String(node.ext || '').toLowerCase() === from) { node.ext = to; changed = true; }
            for (const key of Object.keys(node)) changed = walk(node[key]) || changed;
            return changed;
        };
        for (const file of files) {
            const full = path.join(dataDir, file);
            try {
                const data = JSON.parse(fs.readFileSync(full, 'utf8'));
                if (walk(data)) this._writeFileAtomic(fs, full, JSON.stringify(data, null, 2) + '\n');
            } catch (error) { /* a sidecar that will not parse is left as it is */ }
        }
    }

    /**
     * The cost of any model file: a GLB through the optimizer's analysis, the
     * other formats through the runtime's readers, with each named picture
     * measured from the textures folder beside the source.
     */
    analyzeModelFile(filePath, entry) {
        const fs = require('fs');
        const path = require('path');
        const bytes = new Uint8Array(fs.readFileSync(filePath));
        const ext = String(entry.ext || path.extname(filePath) || '.glb').toLowerCase();
        if (ext === '.glb') return window.RRGlbOptimizer.analyze(bytes);
        // The 3D runtime loads with the first preview; until then a non-GLB has no reader, and the answer is 'not yet' rather than 'cannot'.
        if (typeof Reactor3D === 'undefined' || !Reactor3D.modelCost) { this._statsPending = true; return null; }
        const cost = Reactor3D.modelCost(bytes, ext, entry.texture || '');
        const texturesDir = path.join(path.dirname(path.dirname(filePath)), 'textures');
        for (const image of cost.images) {
            const candidates = [path.join(texturesDir, image.name), path.join(path.dirname(filePath), image.name)];
            const found = candidates.find(candidate => fs.existsSync(candidate));
            if (!found) continue;
            try {
                const data = new Uint8Array(fs.readFileSync(found));
                const type = /\.png$/i.test(found) ? 'image/png' : /\.jpe?g$/i.test(found) ? 'image/jpeg' : /\.webp$/i.test(found) ? 'image/webp' : '';
                const dims = window.RRGlbOptimizer.imageDimensions ? window.RRGlbOptimizer.imageDimensions(data, type) : { width: 0, height: 0 };
                Object.assign(image, { bytes: data.length, width: dims.width || 0, height: dims.height || 0, mimeType: type });
            } catch (error) { /* a picture that will not read is listed unsized */ }
        }
        return cost;
    }

    /** Where a model's own GLB lives, or null if it cannot be found. */
    sourcePath(entry) {
        const fs = require('fs');
        const path = require('path');
        const project = this._project();
        if (!project || !project.path || !entry) return null;
        const file = (entry.file || entry.name) + (entry.ext || '.glb');
        const own = path.join(project.path, '3d', entry.name, 'source', file);
        if (fs.existsSync(own)) return own;
        const shared = path.join(project.path, '3d', 'source', file);
        return fs.existsSync(shared) ? shared : null;
    }

    /**
     * Shrink a model already in the project, in place. Importing offers this
     * once, which does nothing for a model that arrived any other way - copied
     * in by hand, pulled from an asset pack, or imported before the optimizer
     * knew how to reduce it. The original is kept beside the file as
     * `<name>.glb.orig` so the choice stays reversible, and distance levels
     * are rebuilt from whatever comes out.
     */
    async optimizeSelectedModel() {
        const status = this._detail && this._detail.querySelector('.r3d-status');
        const say = message => { if (status) status.textContent = message; };
        const entry = this.listModels().find(m => m.name === this.selectedName);
        if (!entry) return say(this._t('Select a model first.'));
        if (!window.RRGlbOptimizer) return say(this._t('The model optimizer is unavailable.'));
        const fs = require('fs');
        const path = require('path');
        const filePath = this.sourcePath(entry);
        if (!filePath) return say(this._t('This model’s source file could not be found.'));
        const sourceExt = (entry.ext || path.extname(filePath) || '.glb').toLowerCase();

        try {
            // Any other format is first made into a GLB with its pictures inside; the reduction then runs on that, and the GLB is what stays.
            let original = new Uint8Array(fs.readFileSync(filePath));
            let conversion = null;
            if (sourceExt !== '.glb') {
                say(this._t('Converting {name} to GLB…', { name: entry.name }));
                conversion = this._convertModelToGlb(fs, path, filePath, sourceExt, entry);
                original = conversion.bytes;
            }
            const analysis = window.RRGlbOptimizer.analyze(original);
            if (!analysis) return say(this._t('This file could not be read as a GLB.'));
            const ui = (this.projectController && this.projectController.uiManager)
                || (typeof window !== 'undefined' && window.reactor && window.reactor.uiManager);
            if (!ui || typeof ui.showModelOptimizeDialog !== 'function') {
                return say(this._t('The optimizer dialog is unavailable.'));
            }
            const mode = await ui.showModelOptimizeDialog({
                fileName: path.basename(filePath),
                analysis,
                title: this._t('Optimize 3D Model'),
                confirmLabel: this._t('Optimize'),
                keepLabel: this._t('Leave it alone'),
                keepDetail: this._t('Make no change to this model.')
            });
            if (mode === null || mode === 'keep') return;

            const sidecarPath = this.rulesPath(entry.name);
            // Invalid settings must stop optimization before any model or
            // sidecar write; treating them as empty loses rigs and effects.
            const previousText = this._readSidecarForUpdate(fs);
            const previous = previousText ? JSON.parse(previousText) : {};
            if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
                throw new Error('model.json must contain a JSON object');
            }

            const carvedParts = (previous.parts || []).length;
            const settings = Object.assign({
                encodeImage: window.RRGlbOptimizer.canvasEncoder()
            }, window.RRGlbOptimizer.PRESETS[mode]);

            say(this._t('Optimizing {name}…', { name: entry.name }));
            let optimized = await window.RRGlbOptimizer.optimize(original, settings);

            // A carved part is stored as runs of triangle indices, and both
            // reordering and reducing invalidate them: the part that should
            // animate becomes a scattered wrong set and swings through the
            // model. The indices are only how the part is written down though
            // - it is really a region of the surface, and that survives, so it
            // is re-derived from the new geometry rather than the user being
            // told they cannot optimize this model.
            let remappedParts = null;
            let partsNote = '';
            if (carvedParts && optimized && optimized.bytes) {
                remappedParts = window.RRGlbOptimizer.remapParts
                    ? window.RRGlbOptimizer.remapParts(original, optimized.bytes, previous.parts)
                    : null;
                if (remappedParts) {
                    partsNote = ' ' + this._t('{count} carved part(s) re-derived.', { count: carvedParts });
                } else {
                    // The two models could not be paired. Keeping the parts
                    // working matters more than the reduction, so fall back to
                    // the passes that leave the triangle list alone.
                    settings.meshRatio = 0;
                    settings.meshCells = 0;
                    settings.cacheOrder = false;
                    say(this._t('Re-running without geometry changes to keep this model’s parts…'));
                    optimized = await window.RRGlbOptimizer.optimize(original, settings);
                    partsNote = ' ' + this._t('Textures only: its carved parts could not be re-derived.');
                }
            }
            const bytes = optimized && optimized.bytes ? optimized.bytes : null;
            if (!bytes || (bytes === original && !conversion)) return say(this._t('Nothing left to reduce in this model.'));

            // Prove the result loads before it replaces anything. Importing
            // puts every model through this gate; writing in place has to use
            // the same one, or a bad reduction silently destroys the only copy
            // of a model the project has.
            if (typeof ResourceManager !== 'undefined' && ResourceManager.validateModelBytes) {
                try {
                    ResourceManager.validateModelBytes(bytes, '.glb', window.Reactor3D);
                } catch (error) {
                    return say(`${this._t('Optimizing produced a model that will not load; nothing was changed')}: `
                        + (error && error.message ? error.message : error));
                }
            }

            // The backup is written once and never overwritten, so optimizing
            // twice still leaves the file the user actually started with.
            const backup = filePath + '.orig';
            const targetPath = conversion ? filePath.slice(0, -sourceExt.length) + '.glb' : filePath;
            if (!fs.existsSync(backup)) fs.copyFileSync(filePath, backup);
            this._writeFileAtomic(fs, targetPath, Buffer.from(bytes));
            // The converted GLB replaces the source: the old file goes (its backup stands beside it) and every record that named the old extension now names .glb.
            if (conversion) {
                fs.rmSync(filePath, { force: true });
                this._retargetModelExtension(fs, path, entry.name, sourceExt, '.glb');
            }

            // No distance-level files are written here. A level is a second
            // (and third) copy of the geometry on disk, which grows a project
            // faster than the reduction shrinks it - a 54 MB prop pays another
            // 15 MB for levels it may never be far enough away to use. The
            // reduction itself is the win; the base model carries it at every
            // distance. Any levels cut from the OLD geometry are cleared,
            // because they no longer describe the mesh that is now on disk and
            // would snap a prop back to its old shape as it receded.
            let levelNote = '';
            let sidecarChanged = false;
            if ((previous.lods || []).length) {
                const dir = path.dirname(filePath);
                let cleared = 0;
                for (const old of previous.lods) {
                    const stale = path.join(dir, old);
                    if (fs.existsSync(stale)) { fs.rmSync(stale, { force: true }); cleared++; }
                }
                delete previous.lods;
                sidecarChanged = true;
                if (cleared) levelNote = `, ${cleared} ${this._t('stale distance level files removed')}`;
            }
            if (remappedParts) {
                previous.parts = remappedParts;
                sidecarChanged = true;
            }
            // One write, after the mesh is safely on disk: a sidecar pointing
            // at geometry that was never written would be worse than either.
            if (sidecarChanged) {
                this._writeFileAtomic(fs, sidecarPath, JSON.stringify(previous, null, 2) + '\n');
            }

            // Every cache that holds the old geometry has to let go, or the
            // editor keeps drawing the model it loaded at startup.
            delete this._templates[entry.name];
            this._statsCache = null;
            if (typeof RREventPreviewModels !== 'undefined' && RREventPreviewModels.clear) RREventPreviewModels.clear();
            // Through whichever controller can reach the map: the database's
        // stand-in forwards, and the real one is the fallback.
        const controller = this.projectController && typeof this.projectController.refreshMap3DView === 'function'
            ? this.projectController : (window.reactor && window.reactor.projectController);
        if (controller && typeof controller.refreshMap3DView === 'function') controller.refreshMap3DView();
            await this.selectModel(conversion ? (this.listModels().find(m => m.name === entry.name) || entry) : entry);

            const before = ((conversion ? conversion.sourceBytes : original.length) / 1048576).toFixed(1);
            const after = (bytes.length / 1048576).toFixed(1);
            const converted = conversion ? this._t('Converted from {ext} with {count} texture(s) embedded.', { ext: sourceExt.slice(1).toUpperCase(), count: conversion.images }) + ' ' : '';
            const summary = converted + `${this._t('Optimized')} ${entry.name}: ${before}MB → ${after}MB${levelNote}.${partsNote} ` +
                this._t('Original kept as {file}', { file: path.basename(backup) });
            say(summary);
            const stats = this._detail && this._detail.querySelector('.r3d-stats');
            if (stats) {
                const line = document.createElement('div');
                line.style.cssText = 'margin-top:6px;line-height:1.35;color:var(--color-success, #4caf50);';
                line.textContent = summary;
                stats.prepend(line);
            }
        } catch (error) {
            say(`${this._t('Could not optimize this model')}: ${error && error.message ? error.message : error}`);
        }
    }

    loadSidecar() {
        const fs = require('fs');
        let parsed = {};
        try {
            parsed = JSON.parse(fs.readFileSync(this.rulesPath(), 'utf8')) || {};
        } catch (error) {
            parsed = {};
        }
        this.rawAnimations = Array.isArray(parsed.animations) ? parsed.animations : [];
        this.rawEffects = Array.isArray(parsed.effects) ? parsed.effects : [];
        this.selectedEffect = -1;
        this._effectWork = null;
        this.rawTransform = parsed.transform && typeof parsed.transform === 'object' && !Array.isArray(parsed.transform)
            ? parsed.transform : null;
        this._transformWork = null;
        this.rawCollision = parsed.collision === 'box' ? 'box' : 'mesh';
        this.landmarks = parsed.landmarks && typeof parsed.landmarks === 'object' ? parsed.landmarks : {};
        this.customParts = Array.isArray(parsed.parts) ? parsed.parts : [];
        this.customPivots = parsed.pivots && typeof parsed.pivots === 'object'
            && !Array.isArray(parsed.pivots) ? parsed.pivots : {};
        this.customRig = parsed.rig && typeof parsed.rig === 'object'
            && !Array.isArray(parsed.rig) ? parsed.rig : null;
        this._rigBinary = null;
        if (this.customRig && this.customRig.weightsFile && !this.customRig.weights) {
            const path = require('path');
            const file = String(this.customRig.weightsFile);
            if (!/[\\/]/.test(file) && file.indexOf('..') < 0) {
                const binPath = path.join(path.dirname(this.rulesPath()), file);
                const rig = this.customRig;
                const attach = data => {
                    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                    this._rigBinary = buffer;
                    rig.weightsBin = typeof ModelRigger !== 'undefined'
                        ? ModelRigger.decodeWeightsBinary(buffer)
                        : Reactor3D.decodeRigWeightsBinary(buffer);
                };
                try {
                    attach(fs.readFileSync(binPath));
                } catch (error) {
                    // No sync byte access on web: fetch the weights and
                    // re-skin when they land. Until then the rig previews
                    // unskinned, exactly like a rig missing its binary.
                    if (typeof RREncryptedAssets !== 'undefined' && RREncryptedAssets.readAssetBytesAsync) {
                        RREncryptedAssets.readAssetBytesAsync(binPath).then(data => {
                            if (!data || this.customRig !== rig || rig.weightsBin) return;
                            attach(data);
                            if (this.rebuildPlayback) this.rebuildPlayback();
                        }).catch(() => {});
                    }
                }
            }
        }
    }

    /**
     * Merge the authored animations and parts into the sidecar text,
     * preserving any keys other tools may have put there. Pure, so the
     * write path is testable without a project on disk.
     */
    static mergeSidecar(previousText, animations, parts, pivots, effects, transform, collision) {
        let json = {};
        if (previousText) {
            const parsed = JSON.parse(previousText);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('model.json must contain a JSON object');
            }
            json = parsed;
        }
        json.animations = animations || [];
        if (effects && effects.length) json.effects = effects;
        else if (effects) delete json.effects;
        if (transform !== undefined) {
            const identity = !transform || (!(transform.offset || []).some(v => v) && !(transform.rotate || []).some(v => v) && (transform.scale == null || transform.scale === 1));
            if (identity) delete json.transform;
            else json.transform = transform;
        }
        if (collision !== undefined) {
            if (collision === 'box') json.collision = 'box';
            else delete json.collision;
        }
        if (parts && parts.length) json.parts = parts;
        else delete json.parts;
        if (pivots && Object.keys(pivots).length) json.pivots = pivots;
        else delete json.pivots;
        return JSON.stringify(json, null, 2) + '\n';
    }

    /** Every edit writes the model's own sidecar; the runtime reads it as-is. */
    saveRules() {
        const fs = require('fs');
        try {
            const previous = this._readSidecarForUpdate(fs);
            this._writeFileAtomic(fs, this.rulesPath(),
                Database3DEditor.mergeSidecar(previous, this.rawAnimations, this.customParts, this.customPivots, this.rawEffects, this.rawTransform, this.rawCollision));
        } catch (error) {
            this._reportModelSaveError(error);
            throw error;
        }
        this.rebuildPlayback();
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = `${this._t('Saved')} — 3d/${this.selectedName}/model.json`;
        // The map's 3D view keeps a loaded template per model, with the
        // sidecar it was read with: a changed effect trigger or rule went
        // on playing the old way there until the editor was reopened.
        if (typeof RREventPreviewModels !== 'undefined' && RREventPreviewModels.clear) RREventPreviewModels.clear();
        // Through whichever controller can reach the map: the database's
        // stand-in forwards, and the real one is the fallback.
        const controller = this.projectController && typeof this.projectController.refreshMap3DView === 'function'
            ? this.projectController : (window.reactor && window.reactor.projectController);
        if (controller && typeof controller.refreshMap3DView === 'function') controller.refreshMap3DView();
    }

    _reportModelSaveError(error) {
        const message = this._t('Save failed: {error}', { error: error.message || String(error) });
        this._modelRecordStatus(message);
        // Retain the draft for retry and abort the calling edit before it can
        // report success. Native filesystem details supplement the translation.
        if (typeof alert === 'function') alert(message);
    }

    rebuildPlayback() {
        this.playRules = typeof Reactor3D !== 'undefined'
            ? Reactor3D.readModelAnimationRules({ animations: this.rawAnimations })
            : [];
        if (this._binding) {
            this._binding.angles = {};
            this._binding.latch = {};
        }
        this.renderSimBar();
        this._refreshHighlight();
    }

    /** The meshes a part prefix would drive, by the runtime's own matcher. */
    _matchedMeshes(part) {
        if (!this._binding) return [];
        if (!part) return this._binding.meshes.slice();
        const partLower = part.toLowerCase();
        return this._binding.meshes.filter(entry =>
            entry.parts.some(p => p.name.toLowerCase().indexOf(partLower) === 0));
    }

    /**
     * A box around what the selected rule drives, so the choice of part is
     * visible before anything moves.
     */
    _refreshHighlight() {
        if (!this._scene || typeof THREE === 'undefined') return;
        if (this._highlight) {
            this._scene.remove(this._highlight);
            if (this._highlight.geometry) this._highlight.geometry.dispose();
            if (this._highlight.material) this._highlight.material.dispose();
            this._highlight = null;
        }
        const raw = this.rawAnimations[this.selectedRule];
        if (!raw || !this._object) return;
        const box = new THREE.Box3();
        if (raw.part) {
            for (const entry of this._matchedMeshes(raw.part)) {
                this._expandEntry(box, entry);
            }
        } else {
            box.setFromObject(this._object);
        }
        if (box.isEmpty()) return;
        this._highlight = new THREE.Box3Helper(box, 0xffd15c);
        this._highlight.userData.__reactorRule = raw;
        this._scene.add(this._highlight);
    }

    /**
     * The boxes are drawn around meshes that move; recomputing them each
     * frame keeps them wrapped around the part instead of hanging where a
     * pose once stood.
     */
    _updateBoxes() {
        if (typeof THREE === 'undefined') return;
        const fit = (helper, meshes, whole) => {
            if (!helper) return;
            helper.box.makeEmpty();
            if (whole) helper.box.setFromObject(this._object);
            else for (const entry of meshes) this._expandEntry(helper.box, entry);
        };
        if (this._highlight && this._object) {
            const raw = this._highlight.userData.__reactorRule;
            fit(this._highlight, raw.part ? this._matchedMeshes(raw.part) : [], !raw.part);
        }
        if (this._partBox && this.selectedPartName) {
            fit(this._partBox, this._matchedMeshes(this.selectedPartName), false);
        }
        if (this._hoverBox && this._hoverName) {
            fit(this._hoverBox, this._matchedMeshes(this._hoverName), false);
        }
        // The fulcrum rides its part every frame — a marker placed once
        // froze at whatever pose the part held at that instant.
        if (this._pivotMarker && this._pivotAnchor && this._pivotAnchor.mesh.parent
            && this._dragMode !== 'pivotdrag') {
            this._pivotAnchor.mesh.updateWorldMatrix(true, false);
            this._pivotMarker.position.copy(this._pivotAnchor.mesh.localToWorld(
                new THREE.Vector3().fromArray(this._pivotAnchor.pivot)));
        }
    }

    async selectModel(entry) {
        if (!entry) return;
        const selection = this._modelSelection = (this._modelSelection || 0) + 1;
        this._clearModelPreview();
        this.selectedName = entry.name;
        // Read straight off the file, so the cost shows at once rather than
        // waiting on the model to finish loading into the preview.
        this.renderModelStats();
        // Keep the selection visible: its folder stays open in the list.
        if (entry.name.indexOf('/') > 0) {
            if (!this._openFolders) this._openFolders = new Set();
            this._openFolders.add(entry.name.slice(0, entry.name.indexOf('/')));
        }
        this.selectedRule = -1;
        this.selectedPart = -1;
        this.selectedPartName = null;
        this._sim.action = null;
        this._selectMode = false;
        if (this._rigMode) {
            this.exitRigMode();
            this._tool = 'orbit';
            this.renderToolbar();
        }
        this._selection = new Map();
        this._editingRule = -1;
        this._poses = {};
        this._undo = {};
        this._resetWork();
        if (this._highlight && this._scene) {
            this._scene.remove(this._highlight);
            this._highlight = null;
        }
        this.highlightModel();
        this.loadSidecar();
        this.renderPartList();
        this.renderRuleList();
        this.renderEditCard();
        await this._drawPreview(entry);
        if (selection !== this._modelSelection) return;
        // A non-GLB's cost needs the 3D runtime the preview just loaded.
        if (this._statsPending) this.renderModelStats();
        // After the preview: _readEmbeddedClips needs Reactor3D, which on a
        // fresh editor only loads inside _drawPreview's ensureLibraries —
        // reading before it left every clip rule marked unresolved until the
        // model was visited a second time.
        const clips = await this._readEmbeddedClips(entry);
        if (selection !== this._modelSelection) return;
        this.embeddedClips = clips;
        this.rebuildPlayback();
        this.renderPartList();
        this.renderPartForm();
        this.renderRuleList();
        this.renderSelectBar();
        this.renderEditCard();
        this._refreshMotionsButton();
        const status = this._detail.querySelector('.r3d-status');
        if (status) {
            status.textContent = this.embeddedClips.length
                ? `${this._t('Embedded clips')}: ${this.embeddedClips.length}`
                : '';
        }
    }

    /**
     * Clip names baked into a GLB's animation block, surfaced so a "clip"
     * rule can choose among them.
     */
    async _readEmbeddedClips(entry) {
        if ((entry.ext || '.glb').toLowerCase() !== '.glb' || typeof Reactor3D === 'undefined') return [];
        try {
            const fs = require('fs');
            const path = require('path');
            const project = this._project();
            const file = (entry.file || entry.name) + (entry.ext || '.glb');
            const next = path.join(project.path, '3d', entry.name, 'source', file);
            const filePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
            const data = (typeof RREncryptedAssets !== 'undefined' && RREncryptedAssets.readAssetBytesAsync)
                ? await RREncryptedAssets.readAssetBytesAsync(filePath)
                : fs.readFileSync(filePath);
            if (!data) return [];
            const parsed = Reactor3D.readGlb(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            return (parsed.json.animations || []).map(clip => clip.name || '');
        } catch (error) {
            return [];
        }
    }

    async _drawPreview(entry) {
        const gen = ++this._gen;
        this._loadingPreview = true;
        this._refreshHint();
        try {
            return await this._drawPreviewNow(entry, gen);
        } finally {
            if (gen === this._gen) {
                this._loadingPreview = false;
                this._refreshHint();
            }
        }
    }

    async _drawPreviewNow(entry, gen) {
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D?.extensionsLoaded?.())
            || (this.projectController.mapEditor3D && this.projectController.mapEditor3D.ensureLibraries
                && await this.projectController.mapEditor3D.ensureLibraries());
        if (!ready || gen !== this._gen || !canvas.isConnected) return;
        const template = await this._loadTemplate(entry);
        if (!template || gen !== this._gen || !canvas.isConnected) return;
        this._template = template;
        this._viewGoal.pan = { x: 0, y: 0, z: 0 };
        this._view.pan = { x: 0, y: 0, z: 0 };
        if (!this._renderer) {
            this._scene = new THREE.Scene();
            ModelPreview3D.updateBackground(this._scene);
            this._camera = Reactor3D.createCamera({ fov: 40 });
            // Close enough to pick one fingertip on a rig without the near plane cutting the hand.
            this._camera.near = 0.02;
            this._camera.updateProjectionMatrix();
            this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            this._renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) this._renderer.outputColorSpace = THREE.SRGBColorSpace;
            // The animation clock counts 60ths of a second of real time,
            // not rAF ticks — a 120Hz display used to run every rule and
            // clip at double speed.
            let frame = 0;
            const startedAt = performance.now();
            const tick = () => {
                if (!this._renderer || !canvas.isConnected) {
                    this._disposePreview();
                    return;
                }
                frame = Math.round((performance.now() - startedAt) * 0.06);
                const rect = canvas.getBoundingClientRect();
                const width = Math.max(1, Math.round(rect.width));
                const height = Math.max(1, Math.round(rect.height));
                if (canvas.width !== width || canvas.height !== height) {
                    this._renderer.setSize(width, height, false);
                    this._camera.aspect = width / height;
                    this._camera.updateProjectionMatrix();
                }
                if (this._sim.action && frame - this._sim.action.frame >= this._sim.action.until) {
                    // A repeating animation — or a preview of one that plays
                    // on its own (always, while moving…) — starts over.
                    const name = this._sim.action.name;
                    const repeat = name === '__preview'
                        ? (!!this._work.repeat || this._work.trigger !== 'action')
                        : !!(this.playRules || []).find(rule => rule.name === name && rule.repeat);
                    this._sim.action = repeat ? Object.assign({}, this._sim.action, { frame }) : null;
                }
                // The motion being authored rides along as a synthetic rule;
                // Preview swaps in a timed action version of the same work.
                // After previewing a return-to-rest pose the stage keeps the
                // ending — rest — instead of the held pose easing back in,
                // which read as the cannon firing a second time.
                let extra = this._workSuppressed ? null : this._workRule;
                if (this._previewRule && this._sim.action && this._sim.action.name === '__preview') {
                    extra = this._previewRule;
                }
                // Rule positions never shift: suppressed rules are swapped
                // for inert stand-ins IN PLACE, because blends and latches
                // are keyed by index — a filtered array once re-keyed every
                // rule and scrambled latched poses. While something is on
                // the card the ambient animations stand still and the rule
                // being edited steps aside for the card's working copy;
                // explicitly played actions still run.
                const off = rule => ({ ...rule, trigger: 'action', hold: false, name: ' ' });
                let rules = this.playRules;
                if (this.selectedPartName !== null || this._editingRule >= 0) {
                    rules = this.playRules.map((rule, index) => {
                        if (index === this._editingRule) return off(rule);
                        if (this.selectedPartName !== null && rule.trigger !== 'action') return off(rule);
                        return rule;
                    });
                }
                if (extra) rules = rules.concat([extra]);
                // A moving model would slide out from under the marquee, so
                // rules freeze while a selection is being drawn.
                // Once per animation frame, not per display refresh: spin
                // and walk-distance gains accumulate per call.
                if (this._binding && rules.length && !this._selectMode && !this._rigMode && typeof Reactor3D !== 'undefined'
                    && frame !== this._lastAnimFrame) {
                    this._lastAnimFrame = frame;
                    Reactor3D.applyModelAnimation(this._binding, rules, {
                        frame,
                        moving: this._sim.walking,
                        dashing: this._sim.dashing,
                        distance: this._sim.walking ? (this._sim.dashing ? 1 / 8 : 1 / 16) : 0,
                        scale: this._scale,
                        action: this._sim.action
                            ? { name: this._sim.action.name, frame: this._sim.action.frame }
                            : null
                    });
                }
                this._simFrame = frame;
                ModelPreview3D.updateBackground(this._scene);
                this._updatePreviewFx(frame, rules);
                this._updateEffectPreview();
                this._updateHover();
                this._updateBoxes();
                {
                    // Exponential ease toward the input goal (~70ms time
                    // constant, frame-rate independent).
                    const now = performance.now();
                    const dt = Math.min(0.1, (now - (this._viewEaseAt || now)) / 1000);
                    this._viewEaseAt = now;
                    const k = 1 - Math.exp(-dt / 0.07);
                    this._view.yaw += (this._viewGoal.yaw - this._view.yaw) * k;
                    this._view.pitch += (this._viewGoal.pitch - this._view.pitch) * k;
                    this._view.distance += (this._viewGoal.distance - this._view.distance) * k;
                    for (const axis of ['x', 'y', 'z']) this._view.pan[axis] += (this._viewGoal.pan[axis] - this._view.pan[axis]) * k;
                }
                Reactor3D.aimCamera(this._camera, this._orbitCenter(this._view.pan), this._view);
                this._updateRigHover();
                this._updateRigOverlay();
                {
                    const now = performance.now();
                    const goalKey = `${this._viewGoal.yaw}|${this._viewGoal.pitch}|${this._viewGoal.distance}|${this._viewGoal.pan.x}|${this._viewGoal.pan.y}|${this._viewGoal.pan.z}`;
                    if (goalKey !== this._lastGoalKey) {
                        this._lastGoalKey = goalKey;
                        this._lastInputAt = now;
                    }
                    const easing = Math.abs(this._viewGoal.yaw - this._view.yaw) > 0.01
                        || Math.abs(this._viewGoal.pitch - this._view.pitch) > 0.01
                        || Math.abs(this._viewGoal.distance - this._view.distance) > 0.001;
                    const animating = rules.some(rule => rule && rule.trigger !== 'action')
                        || !!this._sim.action || !!this._sim.walking || !!this._workRule || !!this._previewRule
                        // A movie on a surface, or an effect overlay, is
                        // motion too: throttled to the idle rate it played
                        // as a slideshow and read as "not playing".
                        || !!this._fxVideo || !!this._fxLight || !!(this._fxPreview && this._fxPreview.active) || !!this._additionalEffectPreviews?.size;
                    const active = animating || easing || this._dragging || this._loadingPreview
                        || this._selectMode || this._rigMode || this._editingRule >= 0 || this.selectedPartName !== null
                        || (Number.isFinite(this._lastInputAt) && now - this._lastInputAt < 1000)
                        || (Number.isFinite(this._pointerMovedAt) && now - this._pointerMovedAt < 300);
                    if (!Database3DEditor.shouldRenderPreview({ now, active, lastRenderAt: this._lastRenderAt })) {
                        this._raf = requestAnimationFrame(tick);
                        return;
                    }
                    this._lastRenderAt = now;
                }
                Reactor3D.renderScene(this._renderer, this._scene, this._camera);
                this._raf = requestAnimationFrame(tick);
            };
            this._raf = requestAnimationFrame(tick);
        }
        this._rebuildInstance();
    }

    /**
     * Build the live instance from the cached template: cloned, carved
     * along the authored parts (uncarved while a selection is being
     * drawn — triangle indices count over the source geometry), scaled
     * to the preview, and bound for animation.
     */
    _rebuildInstance() {
        if (!this._scene || !this._template || typeof Reactor3D === 'undefined') return;
        if (this._object && this._object.parent) this._object.parent.remove(this._object);
        const template = this._template;
        const object = Reactor3D.cloneModelTemplate
            ? Reactor3D.cloneModelTemplate(template)
            : template.clone(true);
        object.userData.glbSize = template.userData.glbSize;
        // A rig replaces the carve: both count meshes and triangles over
        // the uncarved model, so a model carries one or the other.
        const rig = !this._selectMode && this.customRig && Reactor3D.readModelRig
            ? Reactor3D.readModelRig({ rig: this.customRig }) : null;
        if (rig) {
            Reactor3D.applyModelRig(object, rig);
        } else if (!this._selectMode && Reactor3D.carveModelParts && Reactor3D.readModelParts) {
            Reactor3D.carveModelParts(object, Reactor3D.readModelParts({ parts: this.customParts }));
            if (Reactor3D.applyPivotOverrides) {
                Reactor3D.applyPivotOverrides(object,
                    Reactor3D.readModelPivots({ pivots: this.customPivots }));
            }
        }
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        this._scale = (typeof Reactor3D !== 'undefined' && Reactor3D.EFFECT_PREVIEW_SPAN ? Reactor3D.EFFECT_PREVIEW_SPAN : 1.6) / span;
        object.scale.setScalar(this._scale);
        // Orbit around the model's mid-height, not the ground plane: a
        // tall character aimed at its feet crops its head out of frame.
        // Some skinned exports declare an extent smaller than the mesh they
        // draw; the measured bind-pose bounds win when they stand taller.
        let midHeight = (extent.y * this._scale) / 2;
        const measured = new THREE.Box3().setFromObject(object);
        if (Number.isFinite(measured.min.y) && Number.isFinite(measured.max.y)
            && measured.max.y - measured.min.y > extent.y * this._scale + 1e-6) {
            midHeight = (measured.min.y + measured.max.y) / 2;
        }
        this._viewCenter = { x: -0.5, y: midHeight, z: -0.5 };
        this._binding = Reactor3D.prepareModelInstance(object, object.__reactorClips);
        Reactor3D.bindModelLandmarks(object, Reactor3D.readModelLandmarks({ landmarks: this.landmarks }));
        // Scene-graph plumbing is not a part: exporters wrap models in
        // root/scene/rig nodes that match every mesh at once, and a rule
        // aimed there whirls the whole model about one corner.
        const plumbing = /^(GLTF_SceneRootNode|Sketchfab_model|RootNode|root([._-]?\d+)*$|Scene$|Armature)/i;
        this.partNames = [];
        const seen = new Set();
        for (const meshEntry of this._binding.meshes) {
            for (const part of meshEntry.parts) {
                if (seen.has(part.name) || plumbing.test(part.name)) continue;
                seen.add(part.name);
                this.partNames.push(part.name);
            }
        }
        for (const part of this.customParts) {
            if (part.name && !seen.has(part.name)) {
                seen.add(part.name);
                this.partNames.push(part.name);
            }
        }
        this.partNames.sort();
        // Families collapse numbered siblings (DEF-Wheel.002, .003 …)
        // into one option that drives them all.
        const families = new Map();
        for (const name of this.partNames) {
            const family = name.replace(/([._-]\d+)+$/, '');
            // "Object" is what exporters call everything they didn't
            // name; a family of it drives half the model at once.
            if (!family || family === name || /^Object$/i.test(family)) continue;
            families.set(family, (families.get(family) || 0) + 1);
        }
        this.partFamilies = Array.from(families.entries())
            .filter(([, count]) => count >= 2)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        this._object = object;
        this._previewLighting = ModelPreview3D.isolateLighting(object);
        this._lastInputAt = performance.now();
        let triangles = 0;
        object.traverse(child => {
            if (!child.isMesh && !child.isSkinnedMesh) return;
            const index = child.geometry.getIndex();
            const position = child.geometry.getAttribute('position');
            triangles += Math.floor((index ? index.count : position ? position.count : 0) / 3);
        });
        this._triangleCount = triangles;
        this._scene.add(object);
        this._applyBaseTransform();
        this._syncEffectAnchorMarker();
        // Shader compilation and texture upload land here, in the load
        // gap, instead of trickling through the first seconds of orbiting
        // as one-frame hitches.
        if (this._renderer && this._camera) {
            try {
                this._renderer.compile(this._scene, this._camera);
                for (const texture of (template.userData.glbTextures || [])) {
                    if (texture && texture.image && this._renderer.initTexture) {
                        this._renderer.initTexture(texture);
                    }
                }
            } catch (error) { /* a warm-up failure costs only smoothness */ }
        }
        if (this._rigMode) this._buildRigVisuals();
        this._refreshHighlight();
        this._refreshSelectionOverlay();
        this._refreshPartVisuals();
        this.renderSimBar();
        this.renderEditCard();
        this._refreshHint();
    }

    /** End everything owned by the selected model before another can load. */
    _clearModelPreview() {
        this._stopEffectPreview();
        this._effectWork = null;
        this.selectedEffect = -1;
        this._cardMode = 'part';
        this._modelTab = 'transform';
        if (this._fxMarker) this._fxMarker.visible = false;
        this._sim.action = null;
        this._sim.walking = false;
        this._sim.dashing = false;
        this._fxKey = '';
        this._fxT = -1;
        this._flashHolder = null;
        this._bgFlash = null;
        if (this._scene) ModelPreview3D.updateBackground(this._scene);
        for (const audio of this._previewSounds || []) {
            audio.pause();
            audio.src = '';
        }
        this._previewSounds?.clear();
        this._binding?.mixer?.stopAllAction();
        this._object?.parent?.remove(this._object);
        this._object = null;
        this._binding = null;
        this._template = null;
        this.playRules = [];
        this.partNames = [];
        this.embeddedClips = [];
        this._workRule = null;
        this._previewRule = null;
        this._workSuppressed = false;
        this._hoverName = '';
        this._pivotAnchor = null;
        if (this._pivotMarker) this._pivotMarker.visible = false;
        this._lastAnimFrame = undefined;
    }

    _disposePreview() {
        this._thumbnailGeneration = (this._thumbnailGeneration || 0) + 1;
        this._gen++;
        this._modelSelection = (this._modelSelection || 0) + 1;
        this._loadingPreview = false;
        this._clearModelPreview();
        this._disposeRigVisuals();
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        if (this._renderer) {
            this._renderer.dispose();
            const gl = this._renderer.getContext && this._renderer.getContext();
            const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        this._renderer = null;
        this._disposeEffectQuad();
        if (this._fxPreview) { this._fxPreview.dispose(); this._fxPreview = null; }
        this._stopVideoPreview();
        this._fxMarker = null;
        this._scene = null;
        this._object = null;
        this._binding = null;
    }

    // ------------------------------------------------------------------
    // Tool strip: Orbit looks, Select carves, Pivot places the hinge.

    _tools() {
        return [
            { id: 'orbit', title: this._t('Orbit (drag to look around, click a part to pose it)'), icon:
                '<path d="M8 3a5 5 0 1 1-4.7 3.3" fill="none"/><path d="M3 2.5v4h4" fill="none"/>' },
            { id: 'select', title: this._t('Select part (drag a box; Alt removes)'), icon:
                '<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke-dasharray="2.5 2"/>' },
            { id: 'pivot', title: this._t('Place pivot (click the model)'), icon:
                '<circle cx="8" cy="8" r="2.2" fill="none"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" fill="none"/>' },
            { id: 'rig', title: this._t('Rig (fit a skeleton, then Bind)'), icon:
                '<circle cx="8" cy="3" r="1.6" fill="none"/><path d="M8 4.6v4M8 6l-3.4 2M8 6l3.4 2M8 8.6l-2.4 4.4M8 8.6l2.4 4.4" fill="none"/>' },
            { id: 'face', title: this._t('Face points (eyes, mouth and lips)'), icon:
                '<path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z" fill="none"/><circle cx="8" cy="8" r="2" fill="none"/>' }
        ];
    }

    renderToolbar() {
        const bar = this._detail.querySelector('.r3d-toolbar');
        if (!bar) return;
        bar.innerHTML = '';
        const buttonStyle = active => 'width:28px;height:28px;display:flex;align-items:center;'
            + 'justify-content:center;border-radius:4px;cursor:pointer;'
            + 'border:1px solid ' + (active ? 'var(--color-accent)' : 'var(--color-border)') + ';'
            + 'background:' + (active ? 'var(--color-accent)' : 'var(--color-bg-panel)') + ';'
            + 'color:' + (active ? 'var(--color-accent-on)' : 'var(--color-text)') + ';';
        for (const tool of this._tools()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = tool.title;
            button.style.cssText = buttonStyle(this._tool === tool.id);
            button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${tool.icon}</svg>`;
            button.addEventListener('click', () => this.setTool(tool.id));
            bar.appendChild(button);
        }
    }

    setTool(tool) {
        if (tool === 'select') {
            if (!this._selectMode) this.enterSelectMode();
        } else if (this._selectMode) {
            this.cancelSelectMode();
        }
        if (tool === 'rig' || tool === 'face') {
            if (this._rigMode && this._rigFaceMode !== (tool === 'face')) this.exitRigMode();
            if (!this._rigMode && !this.enterRigMode(tool === 'face')) return;
        } else if (this._rigMode) {
            this.exitRigMode();
        }
        this._tool = tool;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        if (canvas) {
            canvas.style.cursor = tool === 'orbit' ? 'grab' : 'crosshair';
        }
        this.renderToolbar();
        this._refreshHint();
    }

    /** One quiet line over the preview for the states the card can't explain. */
    _refreshHint() {
        const hint = this._detail ? this._detail.querySelector('.r3d-hint') : null;
        if (!hint) return;
        // A large model takes a second or more to build after its worker
        // parse; say so rather than leave the last model on screen.
        if (this._loadingPreview) {
            hint.textContent = this._t('Loading model…');
            hint.style.display = 'block';
            return;
        }
        if (this._selectMode || this._rigMode) {
            hint.style.display = 'none';
            return;
        }
        if (this._tool === 'pivot') {
            hint.textContent = this._t('Click the model to place the pivot, or drag its axes to slide it.');
            hint.style.display = 'block';
            return;
        }
        if (this._tool === 'fxanchor') {
            hint.textContent = this._k('r3dfx.hintPlace');
            hint.style.display = 'block';
            return;
        }
        const hasParts = (this._binding && this._binding.meshes.length > 0) || this.customParts.length > 0;
        if (!hasParts) {
            hint.textContent = this._t('Add a part, then drag a box over the model to choose its triangles.');
            hint.style.display = 'block';
            return;
        }
        hint.style.display = 'none';
    }

    // ------------------------------------------------------------------
    // Part carving

    _selectedPartDef() {
        return this.customParts[this.selectedPart] || null;
    }

    addPart() {
        if (this._selectMode) this.cancelSelectMode();
        if (this.customRig) {
            const status = this._detail.querySelector('.r3d-status');
            if (status) status.textContent = this._t('This model is rigged — remove the rig to carve parts.');
            return;
        }
        let n = this.customParts.length + 1;
        while (this.customParts.some(p => p.name === 'part-' + n)) n++;
        const partName = 'part-' + n;
        this.customParts.push({ name: partName, pivot: null, meshes: {} });
        this.selectedPart = this.customParts.length - 1;
        this.renderPartList();
        this.renderPartForm();
        this.setTool('select');
    }

    deletePart() {
        if (this.selectedPart < 0) return;
        if (this._selectMode) this.cancelSelectMode();
        const removed = this.customParts[this.selectedPart];
        // Effects anchored to the dying part drop back to the model without
        // moving: the offset converts out of the part's frame first.
        if (removed && typeof THREE !== 'undefined' && this._object) {
            for (const raw of this.rawEffects) {
                const anchor = raw && raw.anchor;
                if (!anchor || anchor.part !== removed.name) continue;
                const frame = this._anchorNode(removed.name);
                if (frame && Array.isArray(anchor.offset)) {
                    frame.updateWorldMatrix(true, false);
                    const world = frame.localToWorld(new THREE.Vector3(anchor.offset[0] || 0, anchor.offset[1] || 0, anchor.offset[2] || 0));
                    const local = this._object.worldToLocal(world);
                    anchor.offset = [local.x, local.y, local.z].map(value => Math.round(value * 1000) / 1000);
                }
                anchor.part = '';
            }
            if (this._effectWork && this._effectWork.anchor && this._effectWork.anchor.part === removed.name) {
                const saved = this.rawEffects.find(raw => raw && raw.name === this._effectWork.name);
                if (saved && saved.anchor) this._effectWork.anchor = JSON.parse(JSON.stringify(saved.anchor));
            }
        }
        this.customParts.splice(this.selectedPart, 1);
        this.selectedPart = Math.min(this.selectedPart, this.customParts.length - 1);
        if (removed && this.selectedPartName === removed.name) this.deselectPart();
        this.saveRules();
        this._rebuildInstance();
        this.renderPartList();
        this.renderPartForm();
    }

    /** Selection is drawn against the uncarved mesh, seeded from the part. */
    enterSelectMode() {
        if (typeof Reactor3D === 'undefined' || !this._object) return;
        if (this.customRig) {
            const status = this._detail.querySelector('.r3d-status');
            if (status) status.textContent = this._t('This model is rigged — remove the rig to carve parts.');
            return;
        }
        const part = this._selectedPartDef();
        if (!part) {
            this.addPart();
            return;
        }
        this._selectMode = true;
        this._selection = new Map();
        this._selUndo = [];
        for (const key of Object.keys(part.meshes || {})) {
            const set = new Set(Reactor3D.expandTriRanges(part.meshes[key]));
            if (set.size) this._selection.set(Number(key), set);
        }
        this.renderEditCard();
        this._rebuildInstance();
        this.renderSelectBar();
    }

    // ------------------------------------------------------------------
    // Marquee undo: every drag (and Clear) is one step back.

    _snapshotSelection() {
        return new Map(Array.from(this._selection, ([key, set]) => [key, new Set(set)]));
    }

    _pushSelectionUndo() {
        this._selUndo.push(this._snapshotSelection());
        if (this._selUndo.length > 40) this._selUndo.shift();
    }

    selectionUndo() {
        if (!this._selectMode || !this._selUndo.length) return;
        this._selection = this._selUndo.pop();
        this._refreshSelectionOverlay();
        this.renderSelectBar();
    }

    // ------------------------------------------------------------------
    // Pivots: the fulcrum a part hinges about, movable for every part.

    /** Write a part's pivot override (model space) and re-hinge live. */
    _setPivot(name, pivot) {
        if (!name) return;
        this.customPivots[name] = pivot;
        this.saveRules();
        this._rebuildInstance();
    }

    /** Model-space bounds of any target, for the pivot presets. */
    _targetBounds(name) {
        const custom = this.customParts.find(part => part.name === name);
        if (custom) {
            const bounds = this._partBounds(custom);
            if (bounds) return bounds;
        }
        if (!this._object || typeof THREE === 'undefined') return null;
        const matched = this._matchedMeshes(name);
        if (!matched.length) return null;
        const box = new THREE.Box3();
        for (const entry of matched) box.expandByObject(entry.mesh);
        if (box.isEmpty()) return null;
        // The preview root sits at the origin under a uniform scale, so
        // world coordinates divide straight back into model space.
        box.min.divideScalar(this._scale);
        box.max.divideScalar(this._scale);
        return box;
    }

    _pivotPreset(name, preset) {
        const bounds = this._targetBounds(name);
        if (!bounds) return;
        const center = bounds.getCenter(new THREE.Vector3());
        const pick = {
            center: [center.x, center.y, center.z],
            top: [center.x, bounds.max.y, center.z],
            bottom: [center.x, bounds.min.y, center.z],
            front: [center.x, center.y, bounds.max.z],
            back: [center.x, center.y, bounds.min.z],
            left: [bounds.min.x, center.y, center.z],
            right: [bounds.max.x, center.y, center.z]
        }[preset];
        if (pick) this._setPivot(name, pick);
    }

    applySelection() {
        const part = this._selectedPartDef();
        if (!part) return;
        const meshes = {};
        for (const [index, set] of this._selection) {
            if (set.size) meshes[index] = Reactor3D.compressTriRanges(set);
        }
        part.meshes = meshes;
        if (!part.pivot) {
            const bounds = this._selectionBounds();
            if (bounds) {
                const center = bounds.getCenter(new THREE.Vector3());
                part.pivot = [center.x, center.y, center.z];
            }
        }
        this._selectMode = false;
        this._selection = new Map();
        this.saveRules();
        this._rebuildInstance();
        // A new part claims the effects sitting on it: a video placed on
        // the whole model, later carved into a screen part, follows the
        // screen from now on.
        this._healAllAnchorBindings();
        this.setTool('orbit');
        this.renderSelectBar();
        this.renderPartList();
        this.renderPartForm();
        // Flow straight into posing what was just carved.
        this.selectPartByName(part.name);
    }

    cancelSelectMode() {
        this._selectMode = false;
        this._selection = new Map();
        this._rebuildInstance();
        this.renderSelectBar();
    }

    renderSelectBar() {
        const bar = this._detail ? this._detail.querySelector('.r3d-select-bar') : null;
        if (!bar) return;
        if (!this._selectMode) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = 'flex';
        let count = 0;
        for (const set of this._selection.values()) count += set.size;
        bar.innerHTML = `<span>${count} ${this._t('triangles')} — ${this._t('drag adds, Alt-drag removes')}</span>`;
        const button = (label, handler, primary, title) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = primary ? 'rr-button-primary' : 'rr-btn-secondary';
            el.textContent = label;
            if (title) el.title = title;
            el.addEventListener('click', handler);
            bar.appendChild(el);
            return el;
        };
        // The box takes only what the eye sees unless Through is armed —
        // then it reaches the far side of the model too.
        const through = button(this._t('Through'), () => {
            this._selectThrough = !this._selectThrough;
            this.renderSelectBar();
        }, this._selectThrough, this._t('Select through the model (far side too)'));
        through.style.opacity = this._selectThrough ? '1' : '0.7';
        button('↶', () => this.selectionUndo(), false, this._t('Undo') + ' (Ctrl+Z)');
        button(this._t('Clear'), () => {
            this._pushSelectionUndo();
            this._selection = new Map();
            this._refreshSelectionOverlay();
            this.renderSelectBar();
        }, false);
        button(this._t('Apply'), () => this.applySelection(), true);
        button(this._t('Cancel'), () => this.cancelSelectMode(), false);
    }

    /** Model-space bounds of the current triangle selection. */
    _selectionBounds() {
        if (!this._object || typeof THREE === 'undefined') return null;
        const meshes = Reactor3D.carveTargetMeshes(this._object);
        const box = new THREE.Box3();
        const point = new THREE.Vector3();
        for (const [meshIndex, set] of this._selection) {
            const mesh = meshes[meshIndex];
            if (!mesh || !set.size) continue;
            const relative = this._relativeMatrix(mesh);
            const geometry = mesh.geometry;
            const position = geometry.getAttribute('position');
            const index = geometry.getIndex();
            const vertexAt = index ? (n => index.array[n]) : (n => n);
            for (const tri of set) {
                for (let corner = 0; corner < 3; corner++) {
                    point.fromBufferAttribute(position, vertexAt(tri * 3 + corner));
                    point.applyMatrix4(relative);
                    box.expandByPoint(point);
                }
            }
        }
        return box.isEmpty() ? null : box;
    }

    /** A mesh's transform relative to the model root — model space. */
    _relativeMatrix(mesh) {
        const relative = new THREE.Matrix4();
        for (let node = mesh; node && node !== this._object; node = node.parent) {
            node.updateMatrix();
            relative.premultiply(node.matrix);
        }
        return relative;
    }

    /** Bounds of a saved part's triangles, for the pivot presets. */
    _partBounds(part) {
        if (!this._object || !part || typeof THREE === 'undefined') return null;
        const saved = this._selection;
        this._selection = new Map();
        for (const key of Object.keys(part.meshes || {})) {
            const set = new Set(Reactor3D.expandTriRanges(part.meshes[key]));
            if (set.size) this._selection.set(Number(key), set);
        }
        // Carved previews renumber triangles, so measure on the uncarved
        // template via a scratch clone when the live object is carved.
        let bounds = null;
        if (this._selectMode) {
            bounds = this._selectionBounds();
        } else {
            const live = this._object;
            const scratch = Reactor3D.cloneModelTemplate
                ? Reactor3D.cloneModelTemplate(this._template)
                : this._template.clone(true);
            this._object = scratch;
            bounds = this._selectionBounds();
            this._object = live;
        }
        this._selection = saved;
        return bounds;
    }

    /** Overlay tinting the selected triangles, drawn through the model. */
    _refreshSelectionOverlay() {
        if (!this._scene || typeof THREE === 'undefined') return;
        if (this._selectionOverlay) {
            for (const piece of this._selectionOverlay) {
                if (piece.parent) piece.parent.remove(piece);
                piece.geometry.dispose();
            }
            this._selectionOverlay = null;
        }
        if (!this._selectMode || !this._object) return;
        if (!this._overlayMaterial) {
            this._overlayMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd15c, transparent: true, opacity: 0.55,
                depthTest: false, side: THREE.DoubleSide
            });
        }
        const meshes = Reactor3D.carveTargetMeshes(this._object);
        this._selectionOverlay = [];
        for (const [meshIndex, set] of this._selection) {
            const mesh = meshes[meshIndex];
            if (!mesh || !set.size) continue;
            const geometry = mesh.geometry;
            const index = geometry.getIndex();
            const vertexAt = index ? (n => index.array[n]) : (n => n);
            const ids = [];
            for (const tri of set) {
                ids.push(vertexAt(tri * 3), vertexAt(tri * 3 + 1), vertexAt(tri * 3 + 2));
            }
            const overlay = new THREE.BufferGeometry();
            overlay.setAttribute('position', geometry.getAttribute('position'));
            overlay.setIndex(new THREE.BufferAttribute(Uint32Array.from(ids), 1));
            const piece = new THREE.Mesh(overlay, this._overlayMaterial);
            piece.renderOrder = 10;
            // Never a carve target: overlays must not shift mesh numbering.
            piece.userData.__reactorOverlay = true;
            mesh.add(piece);
            this._selectionOverlay.push(piece);
        }
    }

    /** Boxes for the hovered and the chosen part, plus the pivot axes. */
    _refreshPartVisuals() {
        if (!this._scene || typeof THREE === 'undefined') return;
        for (const key of ['_partBox', '_hoverBox', '_pivotMarker']) {
            if (this[key]) {
                this._scene.remove(this[key]);
                this[key] = null;
            }
        }
        this._pivotAnchor = null;
        if (this._selectMode || !this._object) return;
        const boxFor = name => {
            const matched = this._matchedMeshes(name);
            if (!matched.length) return null;
            const box = new THREE.Box3();
            for (const entry of matched) box.expandByObject(entry.mesh);
            return box.isEmpty() ? null : box;
        };
        if (this._hoverName && this._hoverName !== this.selectedPartName) {
            const box = boxFor(this._hoverName);
            if (box) {
                this._hoverBox = new THREE.Box3Helper(box, 0x9aa4b0);
                this._scene.add(this._hoverBox);
            }
        }
        if (this.selectedPartName) {
            const box = boxFor(this.selectedPartName);
            if (box) {
                this._partBox = new THREE.Box3Helper(box, 0x5cc8ff);
                this._scene.add(this._partBox);
            }
            // The piece whose FIRST name is the part owns the pivot; a
            // nested child (the cannon inside the turret) also carries the
            // name but may be posed by its own rules and would drag the
            // marker along with motion that is not the pivot's.
            const carriers = this._matchedMeshes(this.selectedPartName)
                .map(m => ({ m, part: m.parts.find(p => p.name === this.selectedPartName) }))
                .filter(pair => pair.part);
            const entry = carriers.find(pair => pair.m.parts[0] === pair.part) || carriers[0];
            if (entry) {
                // Fresh matrices: right after a rebuild the new object has
                // never been rendered and localToWorld would read a stale
                // (unscaled) transform — the marker teleported on reselect.
                entry.m.mesh.updateWorldMatrix(true, false);
                const world = entry.m.mesh.localToWorld(
                    new THREE.Vector3().fromArray(entry.part.pivot));
                this._pivotAnchor = { mesh: entry.m.mesh, pivot: entry.part.pivot };
                // The fulcrum usually sits INSIDE the part; drawn with depth
                // testing it was buried in the mesh and impossible to find,
                // let alone grab. It renders through everything.
                this._pivotMarker = new THREE.AxesHelper(0.26);
                this._pivotMarker.material.depthTest = false;
                this._pivotMarker.material.transparent = true;
                this._pivotMarker.renderOrder = 11;
                const knob = new THREE.Mesh(
                    new THREE.SphereGeometry(0.035, 12, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffd15c, depthTest: false, transparent: true, opacity: 0.9 }));
                knob.userData.__reactorOverlay = true;
                knob.renderOrder = 12;
                this._pivotMarker.add(knob);
                this._pivotMarker.position.copy(world);
                this._scene.add(this._pivotMarker);
            }
        }
    }

    renderPartList() {
        const list = this._detail.querySelector('.r3d-part-list');
        if (!list) return;
        list.innerHTML = '';
        // The whole model is a part from the first import: pose it, animate
        // it, anchor effects to it — no carving required. Carved parts are
        // for pieces that move on their own.
        const whole = document.createElement('div');
        whole.textContent = this._t('Whole model');
        whole.style.cssText = 'padding:4px 10px;cursor:pointer;font-size:12px;color:var(--color-text);'
            + (this.selectedPart < 0 && this.selectedPartName === '' ? 'background:var(--color-accent-tint-25);' : '');
        whole.addEventListener('click', () => {
            if (this._selectMode) this.cancelSelectMode();
            this.selectedPart = -1;
            this.renderPartList();
            this.renderPartForm();
            this.selectPartByName('');
        });
        list.appendChild(whole);
        if (!this.customParts.length) {
            const hint = document.createElement('div');
            hint.textContent = this._t('Add a part, then drag a box over the model to choose its triangles.');
            hint.style.cssText = 'padding:6px 10px;color:var(--color-text-muted);font-size:11px;';
            list.appendChild(hint);
            return;
        }
        this.customParts.forEach((part, index) => {
            const row = document.createElement('div');
            let triangles = 0;
            for (const key of Object.keys(part.meshes || {})) {
                for (const [, count] of part.meshes[key]) triangles += count;
            }
            row.textContent = `${part.name} — ${triangles} ${this._t('triangles')}`;
            row.style.cssText = 'padding:4px 10px;cursor:pointer;font-size:12px;color:var(--color-text);'
                + (index === this.selectedPart ? 'background:var(--color-accent-tint-25);' : '');
            row.addEventListener('click', () => {
                if (this._selectMode) this.cancelSelectMode();
                this.selectedPart = index;
                this.renderPartList();
                this.renderPartForm();
                this.selectPartByName(part.name);
            });
            list.appendChild(row);
        });
    }

    renderPartForm() {
        const form = this._detail.querySelector('.r3d-part-form');
        if (!form) return;
        const part = this._selectedPartDef();
        if (!part) {
            form.innerHTML = '';
            return;
        }
        const input = 'style="flex:1;min-width:0;width:100%;padding:3px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);"';
        form.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;margin:7px 0;font-size:12px;color:var(--color-text);">
                <span style="flex:0 0 60px;">${this._t('Name')}</span>
                <input type="text" class="r3d-part-name" value="${rrEscapeHtml(String(part.name))}" ${input}>
            </label>
            <div style="display:flex;align-items:center;gap:6px;margin:7px 0;">
                <button type="button" class="rr-btn-secondary r3d-part-reselect" style="flex:1;">${this._t('Reselect triangles')}</button>
                <select class="r3d-pivot-preset" ${input}>
                    <option value="">${this._t('Pivot preset…')}</option>
                    <option value="center">${this._t('Center')}</option>
                    <option value="top">${this._t('Top')}</option>
                    <option value="bottom">${this._t('Bottom')}</option>
                    <option value="front">${this._t('Front (+Z)')}</option>
                    <option value="back">${this._t('Back (-Z)')}</option>
                    <option value="left">${this._t('Left (-X)')}</option>
                    <option value="right">${this._t('Right (+X)')}</option>
                </select>
            </div>`;
        form.querySelector('.r3d-part-name').addEventListener('change', event => {
            const name = event.target.value.trim();
            if (!name) return;
            const oldName = part.name;
            part.name = name;
            // Rules aimed at the old name follow the rename — and so do
            // effect anchors, or a renamed screen's video falls back to the
            // model origin and stops tracking without a word of warning.
            for (const raw of this.rawAnimations) {
                if (raw.part === oldName) raw.part = name;
            }
            for (const raw of this.rawEffects) {
                if (raw && raw.anchor && raw.anchor.part === oldName) raw.anchor.part = name;
            }
            if (this._effectWork && this._effectWork.anchor && this._effectWork.anchor.part === oldName) {
                this._effectWork.anchor.part = name;
            }
            if (this.selectedPartName === oldName) this.selectedPartName = name;
            if (this._poses[oldName]) {
                this._poses[name] = this._poses[oldName];
                delete this._poses[oldName];
            }
            if (this.customPivots[oldName]) {
                this.customPivots[name] = this.customPivots[oldName];
                delete this.customPivots[oldName];
            }
            this.saveRules();
            this._rebuildInstance();
            this.renderPartList();
            this.renderRuleList();
            this.renderEffectList();
            this.renderEffectForm();
            this.renderEditCard();
        });
        form.querySelector('.r3d-part-reselect').addEventListener('click', () => this.setTool('select'));
        form.querySelector('.r3d-pivot-preset').addEventListener('change', event => {
            const preset = event.target.value;
            event.target.value = '';
            if (preset) this._pivotPreset(part.name, preset);
        });
    }

    // ------------------------------------------------------------------
    // The edit card: the one editor for every animation.

    selectPartByName(name) {
        if (name === null || name === undefined) return;
        if (this._cardMode === 'effect') this._leaveEffectMode();
        this.selectedPartName = name;
        const custom = this.customParts.findIndex(part => part.name === name);
        if (custom >= 0 && this.selectedPart !== custom) {
            this.selectedPart = custom;
            this.renderPartList();
            this.renderPartForm();
        }
        const saved = this._poses[name];
        if (saved) {
            // The sliders resume exactly where this target was left.
            this._applySnapshot(saved);
            const idx = saved.editingRule;
            this._editingRule = Number.isInteger(idx) && this.rawAnimations[idx]
                && (this.rawAnimations[idx].part || '') === name ? idx : -1;
        } else if (name) {
            // A part with exactly one animation opens it for editing —
            // the values on the card are the values that made it.
            const owned = this.rawAnimations
                .map((raw, index) => ({ raw, index }))
                .filter(entry => entry.raw.part === name);
            if (owned.length === 1) {
                this.editRule(owned[0].index);
                return;
            }
            this._editingRule = -1;
            this._resetWork();
        } else {
            this._editingRule = -1;
            this._resetWork();
        }
        this._cardCollapsed = false;
        this.selectedRule = this._editingRule;
        this.renderRuleList();
        this._syncWorkRule();
        this.renderEditCard();
        this._refreshPartVisuals();
        this._refreshHint();
    }

    /** Re-aim the animation on the card at another part, values intact. */
    retargetWork(name) {
        this.selectedPartName = name;
        this._cardCollapsed = false;
        const custom = this.customParts.findIndex(part => part.name === name);
        if (custom >= 0 && this.selectedPart !== custom) {
            this.selectedPart = custom;
            this.renderPartList();
            this.renderPartForm();
        }
        this._syncWorkRule();
        this._rememberPose();
        this.renderEditCard();
        this._refreshPartVisuals();
        this._refreshHint();
    }

    deselectPart() {
        if (this._cardMode === 'effect') this._leaveEffectMode();
        this.selectedPartName = null;
        this._editingRule = -1;
        this.selectedRule = -1;
        this.renderRuleList();
        this._resetWork();
        this.renderEditCard();
        this._refreshPartVisuals();
        this._refreshHint();
    }

    _resetWork() {
        this._work = Database3DEditor.defaultWork();
        if ((this.embeddedClips || []).length) this._work.clip = this.embeddedClips[0];
        this._workRule = null;
        this._previewRule = null;
        this._pendingUndo = null;
    }

    // ------------------------------------------------------------------
    // Work memory and undo. Snapshots capture the whole card; the undo
    // trail is per target and survives clicking away and back.

    _poseSnapshot() {
        return {
            name: this._work.name,
            motion: this._work.motion,
            axis: this._work.axis,
            rotate: this._work.rotate.slice(),
            move: this._work.move.slice(),
            resize: this._work.resize.slice(),
            degrees: this._work.degrees,
            speed: this._work.speed,
            perTile: this._work.perTile,
            amount: this._work.amount,
            clip: this._work.clip,
            rate: this._work.rate,
            period: this._work.period,
            trigger: this._work.trigger,
            hold: this._work.hold,
            effects: JSON.parse(JSON.stringify(this._work.effects || [])),
            editingRule: this._editingRule
        };
    }

    _applySnapshot(snapshot) {
        this._work = {
            name: snapshot.name,
            motion: snapshot.motion,
            axis: snapshot.axis,
            rotate: snapshot.rotate.slice(),
            move: snapshot.move.slice(),
            resize: snapshot.resize.slice(),
            degrees: snapshot.degrees,
            speed: snapshot.speed,
            perTile: snapshot.perTile,
            amount: snapshot.amount,
            clip: snapshot.clip,
            rate: snapshot.rate || 1,
            period: snapshot.period,
            trigger: snapshot.trigger,
            hold: snapshot.hold,
            effects: JSON.parse(JSON.stringify(snapshot.effects || []))
        };
        this._pendingUndo = null;
        this._syncWorkRule();
    }

    _rememberPose() {
        if (this.selectedPartName !== null) {
            this._poses[this.selectedPartName] = this._poseSnapshot();
        }
    }

    _undoFor(name) {
        const key = String(name);
        if (!this._undo[key]) this._undo[key] = { stack: [], redo: [] };
        return this._undo[key];
    }

    /** A slider gesture stashes its starting state on the first tick... */
    _stashUndo() {
        if (!this._pendingUndo) this._pendingUndo = this._poseSnapshot();
    }

    /** ...and commits it as one undo step when the gesture lets go. */
    _commitUndo() {
        if (this.selectedPartName === null) return;
        if (this._pendingUndo) {
            const trail = this._undoFor(this.selectedPartName);
            trail.stack.push(this._pendingUndo);
            if (trail.stack.length > 60) trail.stack.shift();
            trail.redo = [];
            this._pendingUndo = null;
        }
        this._rememberPose();
        this._refreshUndoButtons();
    }

    undoPose() {
        if (this.selectedPartName === null) return;
        const trail = this._undoFor(this.selectedPartName);
        if (this._pendingUndo) this._commitUndo();
        if (!trail.stack.length) return;
        trail.redo.push(this._poseSnapshot());
        this._applySnapshot(trail.stack.pop());
        this._rememberPose();
        this.renderEditCard();
    }

    redoPose() {
        if (this.selectedPartName === null) return;
        const trail = this._undoFor(this.selectedPartName);
        if (!trail.redo.length) return;
        trail.stack.push(this._poseSnapshot());
        this._applySnapshot(trail.redo.pop());
        this._rememberPose();
        this.renderEditCard();
    }

    _refreshUndoButtons() {
        const card = this._detail ? this._detail.querySelector('.r3d-card') : null;
        if (!card || this.selectedPartName === null) return;
        const trail = this._undoFor(this.selectedPartName);
        const undoButton = card.querySelector('.r3d-card-undo');
        const redoButton = card.querySelector('.r3d-card-redo');
        if (undoButton) undoButton.style.opacity = trail.stack.length || this._pendingUndo ? '1' : '0.35';
        if (redoButton) redoButton.style.opacity = trail.redo.length ? '1' : '0.35';
    }

    /** The card's work as a sidecar animation entry for a given trigger. */
    _workValues(triggerOverride) {
        const work = this._work;
        const values = {
            part: this.selectedPartName || '',
            type: work.motion,
            trigger: triggerOverride || work.trigger
        };
        if (work.motion === 'pose') {
            values.rotate = work.rotate.slice();
            values.move = work.move.slice();
            values.resize = work.resize.slice();
            values.period = work.period;
            values.hold = values.trigger === 'action' ? work.hold : false;
            values.repeat = values.trigger === 'action' ? !!work.repeat : false;
            // Keys ride every authored trigger — an Always keyframe timeline
            // loops on its own. Only the live stand-in (triggerOverride: the
            // rule that mirrors the sliders while the hand moves them) goes
            // without, or editing would fight the playing timeline.
            if ((work.keys || []).length && !triggerOverride) {
                values.keys = JSON.parse(JSON.stringify(work.keys));
                values.hold = false;
            }
        } else if (work.motion === 'swing') {
            values.axis = work.axis;
            values.degrees = work.degrees;
            values.period = work.period;
        } else if (work.motion === 'spin') {
            values.axis = work.axis;
            values.speed = work.speed;
            values.perTile = work.perTile;
        } else if (work.motion === 'bob') {
            values.axis = work.axis;
            values.amount = work.amount;
            values.period = work.period;
        } else if (work.motion === 'clip') {
            values.clip = work.clip;
            if (work.rate && work.rate !== 1) values.rate = work.rate;
        }
        if (values.trigger === 'action' && (work.effects || []).length) {
            values.effects = JSON.parse(JSON.stringify(work.effects));
        }
        return values;
    }

    /** Whether the work would visibly move anything at all. */
    _workIsLive() {
        const work = this._work;
        if (work.motion === 'pose') {
            return work.rotate.some(v => v) || work.move.some(v => v)
                || work.resize.some(v => v !== 1) || (work.keys || []).length > 0;
        }
        if (work.motion === 'swing') return work.degrees > 0;
        if (work.motion === 'spin') return work.speed > 0 || work.perTile > 0;
        if (work.motion === 'bob') return work.amount > 0;
        return !!work.clip;
    }

    /**
     * The motion being authored previews through the real engine: it
     * becomes a synthetic always-on rule appended to the play list, so a
     * swing swings and a spin spins while their sliders move.
     */
    _syncWorkRule() {
        // Any edit puts the working pose back on stage.
        this._workSuppressed = false;
        if (this.selectedPartName === null || this._selectMode
            || typeof Reactor3D === 'undefined' || !this._workIsLive()) {
            this._workRule = null;
            return;
        }
        const values = this._workValues('always');
        // An always-pose with a short period holds the pose while editing.
        if (values.type === 'pose') values.period = 8;
        const manual = { ...values };
        manual.name = '__manual';
        this._workRule = Reactor3D.readModelAnimationRules({ animations: [manual] })[0];
    }

    /**
     * Let go of every held pose aimed at a target — editing or previewing
     * a part takes manual control of it, and a latch left armed would pop
     * the pose back up the moment the card lets go.
     */
    _releaseLatches(part) {
        if (!this._binding) return;
        this.playRules.forEach((rule, index) => {
            if (rule.type !== 'pose' || !rule.hold) return;
            if (part !== null && rule.part !== part) return;
            if (this._binding.latch) this._binding.latch[index] = false;
            this._binding.angles[index] = 0;
            // A long action still in flight would re-latch on the very
            // next frame — a 10-second hold quietly undid its release.
            if (this._sim.action && this._sim.action.name === rule.name) {
                this._sim.action = null;
            }
        });
    }

    /** Play the work once, exactly as its trigger will play it in game. */
    previewPose() {
        if (!this._workIsLive() || typeof Reactor3D === 'undefined') return;
        // The preview must visibly play from rest: the card holds the pose
        // at full strength in the same blend slot, which left a held pose
        // nowhere to go — Preview looked dead while the part was selected.
        const slot = this.playRules.length;
        if (this._binding) {
            this._binding.angles[slot] = 0;
            if (this._binding.latch) this._binding.latch[slot] = false;
        }
        this._releaseLatches(this.selectedPartName);
        // A return-to-rest pose must END at rest: the held working pose
        // stands down until the next slider touch. Held poses hand over
        // seamlessly instead, and continuous motions keep playing.
        this._workSuppressed = this._work.motion === 'pose' && !this._work.hold;
        const previewValues = this._workValues('action');
        previewValues.name = '__preview';
        this._previewRule = Reactor3D.readModelAnimationRules({ animations: [previewValues] })[0];
        const duration = Reactor3D.modelRuleDuration(
            this._previewRule, this._binding ? this._binding.clips : null);
        this._sim.action = {
            name: previewValues.name,
            frame: this._simFrame || 0,
            until: this._work.motion === 'pose' && this._work.hold
                ? duration + 30
                : this._work.motion === 'spin' ? 90 : duration
        };
    }

    savePose() {
        if (this.selectedPartName === null || !this._workIsLive()) return;
        const values = this._workValues();
        if (this._editingRule >= 0 && this.rawAnimations[this._editingRule]) {
            if (this._work.name.trim()) values.name = this._work.name.trim();
            if (!values.effects) delete this.rawAnimations[this._editingRule].effects;
            if (!values.keys) delete this.rawAnimations[this._editingRule].keys;
            if (!values.rate) delete this.rawAnimations[this._editingRule].rate;
            Object.assign(this.rawAnimations[this._editingRule], values);
            this.selectedRule = this._editingRule;
        } else {
            let name = this._work.name.trim();
            if (!name) {
                let n = 1;
                const base = (this.selectedPartName || 'model') + '-' + this._work.motion;
                while (this.rawAnimations.some(raw => raw.name === base + (n > 1 ? '-' + n : ''))) n++;
                name = base + (n > 1 ? '-' + n : '');
            }
            this.rawAnimations.push({ name, cycles: 1, ...values });
            this._editingRule = this.rawAnimations.length - 1;
            this.selectedRule = this._editingRule;
        }
        this._work.name = this.rawAnimations[this._editingRule].name;
        this._rememberPose();
        this.saveRules();
        this.renderRuleList();
        this.renderEditCard();
    }

    /** Load an existing animation into the card for slider editing. */
    editRule(index) {
        const raw = this.rawAnimations[index];
        if (!raw) return;
        const rule = typeof Reactor3D !== 'undefined'
            ? Reactor3D.readModelAnimationRules({ animations: [raw] })[0]
            : null;
        if (!rule) return;
        this._editingRule = index;
        this.selectedRule = index;
        this._cardCollapsed = false;
        this._cardMode = 'part';
        this._modelTab = 'animation';
        this.selectedPartName = rule.part;
        this._work = {
            name: rule.name,
            motion: rule.type,
            axis: rule.axis,
            rotate: rule.rotate.slice(),
            move: rule.move.slice(),
            resize: rule.resize.slice(),
            degrees: rule.degrees,
            speed: rule.speed,
            perTile: rule.perTile,
            amount: rule.amount,
            clip: rule.clip,
            rate: rule.rate || 1,
            period: rule.period,
            trigger: rule.trigger,
            hold: rule.hold,
            repeat: !!rule.repeat,
            effects: JSON.parse(JSON.stringify(raw.effects || [])),
            keys: JSON.parse(JSON.stringify(raw.keys || []))
        };
        this._pendingUndo = null;
        const custom = this.customParts.findIndex(part => part.name === rule.part);
        if (custom >= 0) {
            this.selectedPart = custom;
            this.renderPartList();
            this.renderPartForm();
        }
        this._rememberPose();
        this._releaseLatches(rule.part);
        this._syncWorkRule();
        this.renderRuleList();
        this.renderEditCard();
        this._refreshPartVisuals();
        this._refreshHint();
    }

    /** The Duration slider is logarithmic: 0.1 s up close, 10 s out wide. */
    _durationToRaw(frames) {
        const clamped = Math.min(600, Math.max(6, frames));
        return Math.round(100 * Math.log(clamped / 6) / Math.log(100));
    }

    _rawToDuration(raw) {
        return Math.round(6 * Math.pow(100, Math.min(100, Math.max(0, raw)) / 100));
    }

    _durationLabel(frames) {
        const seconds = frames / 60;
        return (seconds < 1 ? seconds.toFixed(2) : seconds.toFixed(1)) + ' s';
    }

    /**
     * The card never leaves: with no target it invites a click, with one
     * it edits, and its × folds it down to a small button.
     */
    renderEditCard() {
        const card = this._detail ? this._detail.querySelector('.r3d-card') : null;
        if (!card) return;
        this._detail.querySelector('.r3d-canvas-wrap')?.classList?.toggle('r3d-face-editing', !!this._rigFaceMode);
        card.classList.toggle('r3d-face-card', !!this._rigFaceMode);
        if (this._rigFaceMode) {
            if (this._rigMode) this._renderFacePointCard(card);
            else card.style.display = 'none';
            return;
        }
        // A clip-only GLB has no parts, but its adopted clip rules still
        // edit on the card (clip choice, speed, trigger, effects).
        const hasParts = (this._binding && this._binding.meshes.length > 0)
            || this.customParts.length > 0
            || (this.embeddedClips || []).length > 0;
        if (this._selectMode || !hasParts) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';
        const headerButton = 'width:22px;height:22px;border:none;background:none;color:var(--color-text-muted);cursor:pointer;font-size:15px;line-height:1;';
        if (this._cardCollapsed) {
            card.style.width = 'auto';
            card.style.padding = '4px';
            card.innerHTML = `<button type="button" class="r3d-card-expand" title="${this._t('Pose')}"
                style="width:30px;height:30px;border:1px solid var(--color-accent);border-radius:5px;cursor:pointer;background:var(--color-bg-panel);color:var(--color-text);font-size:15px;line-height:1;">✥</button>`;
            card.querySelector('.r3d-card-expand').addEventListener('click', () => {
                this._cardCollapsed = false;
                this.renderEditCard();
            });
            return;
        }
        card.style.width = '280px';
        card.style.padding = '10px 12px';
        const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const row = (label, control) => `
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <span style="flex:0 0 62px;font-size:12px;color:var(--color-text);">${label}</span>${control}
            </div>`;
        const selectStyle = 'style="flex:1;min-width:0;padding:3px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);"';
        const header = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <div class="r3d-card-chooser" style="flex:1;min-width:0;display:flex;"></div>
                <button type="button" class="r3d-card-undo" title="${this._t('Undo')} (Ctrl+Z)" style="${headerButton}">↶</button>
                <button type="button" class="r3d-card-redo" title="${this._t('Redo')} (Ctrl+Y)" style="${headerButton}">↷</button>
                <button type="button" class="r3d-card-close" title="${this._t('Close')}" style="${headerButton}">×</button>
            </div>`;
        if (this._cardMode === 'effect' && this._effectWork) {
            this._renderEffectCard(card, header);
            return;
        }
        if (this.selectedPartName === '' && this._modelTab !== 'animation') {
            this._renderTransformCard(card, header);
            return;
        }
        if (this.selectedPartName === null) {
            card.innerHTML = header
                + `<div style="font-size:11px;color:var(--color-text-muted);">${this._t('Click a part of the model to pose it.')}</div>`;
            this._mountCardChooser(card);
            card.querySelector('.r3d-card-close').addEventListener('click', () => {
                this._cardCollapsed = true;
                this.renderEditCard();
            });
            card.querySelector('.r3d-card-undo').style.opacity = '0.35';
            card.querySelector('.r3d-card-redo').style.opacity = '0.35';
            return;
        }
        const work = this._work;
        const axes = [
            { label: 'X', color: '#e5484d' },
            { label: 'Y', color: '#46a758' },
            { label: 'Z', color: '#3e63dd' }
        ];
        const motions = [['pose', this._t('Pose')], ['swing', this._t('Swing')],
            ['spin', this._t('Spin')], ['bob', this._t('Bob')]]
            .concat((this.embeddedClips || []).length || work.motion === 'clip'
                ? [['clip', this._t('Clip')]] : []);
        const sliderRow = (cls, color, label, min, max, step, value, shown) => `
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <span style="flex:0 0 ${color ? '14px' : '62px'};font-weight:${color ? 'bold' : 'normal'};font-size:12px;color:${color || 'var(--color-text)'};">${label}</span>
                <input type="range" class="${cls}" min="${min}" max="${max}" step="${step}" value="${value}"
                    style="flex:1;min-width:0;accent-color:${color || 'var(--color-accent)'};" title="${this._t('Double-click to reset')}">
                <span class="${cls}-val" style="flex:0 0 44px;text-align:right;font-size:11px;color:var(--color-text);">${shown}</span>
            </div>`;
        const axisChips = `
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <span style="flex:0 0 62px;font-size:12px;color:var(--color-text);">${this._t('Axis')}</span>
                <span style="display:flex;gap:4px;flex:1;">
                    ${['x', 'y', 'z'].map((axis, i) => `<button type="button" class="r3d-card-axis" data-axis="${axis}"
                        style="flex:1;padding:3px 0;font-size:11px;font-weight:bold;border-radius:4px;cursor:pointer;
                        border:1px solid ${work.axis === axis ? axes[i].color : 'var(--color-border)'};
                        background:${work.axis === axis ? axes[i].color : 'var(--color-bg-surface)'};
                        color:${work.axis === axis ? '#fff' : 'var(--color-text)'};">${axis.toUpperCase()}</button>`).join('')}
                </span>
            </div>`;
        let body = '';
        const spec = {
            rotate: { min: -180, max: 180, step: 1, value: i => work.rotate[i], show: v => Math.round(v) + '°' },
            offset: { min: -2, max: 2, step: 0.01, value: i => work.move[i], show: v => v.toFixed(2) },
            scale: { min: 10, max: 300, step: 1, value: i => Math.round(work.resize[i] * 100), show: v => Math.round(v) + '%' }
        }[this._cardTab];
        if (work.motion === 'pose') {
            const tabs = [
                { id: 'rotate', label: this._t('Rotate') },
                { id: 'offset', label: this._t('Offset') },
                { id: 'scale', label: this._t('Scale') }
            ];
            body = `
            <div style="display:flex;gap:4px;margin-bottom:8px;">
                ${tabs.map(tab => `<button type="button" class="r3d-card-tab" data-tab="${tab.id}"
                    style="flex:1;padding:4px 0;font-size:12px;border-radius:4px;cursor:pointer;
                    border:1px solid ${tab.id === this._cardTab ? 'var(--color-accent)' : 'var(--color-border)'};
                    background:${tab.id === this._cardTab ? 'var(--color-accent)' : 'var(--color-bg-surface)'};
                    color:${tab.id === this._cardTab ? 'var(--color-accent-on)' : 'var(--color-text)'};font-weight:bold;">${tab.label}</button>`).join('')}
            </div>`
            + axes.map((axis, i) => `
                <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                    <span style="flex:0 0 14px;font-weight:bold;font-size:12px;color:${axis.color};">${axis.label}</span>
                    <input type="range" class="r3d-card-slider" data-i="${i}" min="${spec.min}" max="${spec.max}" step="${spec.step}"
                        value="${spec.value(i)}" style="flex:1;min-width:0;accent-color:${axis.color};" title="${this._t('Double-click to reset')}">
                    <span class="r3d-card-val" data-i="${i}" style="flex:0 0 44px;text-align:right;font-size:11px;color:var(--color-text);">${spec.show(spec.value(i))}</span>
                </div>`).join('');
        } else if (work.motion === 'swing') {
            body = axisChips + sliderRow('r3d-card-degrees', '', this._t('Degrees'),
                1, 90, 1, work.degrees, Math.round(work.degrees) + '°');
        } else if (work.motion === 'spin') {
            body = axisChips
                + sliderRow('r3d-card-spinspeed', '', this._t('Speed'),
                    0, 720, 5, work.speed, Math.round(work.speed) + '°/s')
                + sliderRow('r3d-card-pertile', '', this._t('Per tile'),
                    0, 720, 5, work.perTile, Math.round(work.perTile) + '°');
        } else if (work.motion === 'bob') {
            body = axisChips + sliderRow('r3d-card-amount', '', this._t('Amount (tiles)'),
                0, 0.5, 0.005, work.amount, work.amount.toFixed(2));
        } else {
            const clips = this.embeddedClips || [];
            const clipOptions = clips.map(name =>
                `<option value="${escape(name)}"${name === work.clip ? ' selected' : ''}>${escape(name)}</option>`).join('');
            const stray = work.clip && clips.indexOf(work.clip) < 0
                ? `<option value="${escape(work.clip)}" selected>${escape(work.clip)} ?</option>` : '';
            body = row(this._t('Clip'), `<select class="r3d-card-clip" ${selectStyle}>${clipOptions}${stray}</select>`)
                + sliderRow('r3d-card-rate', '', this._t('Speed'),
                    25, 300, 5, Math.round((work.rate || 1) * 100), Math.round((work.rate || 1) * 100) + '%');
        }
        const editable = this.selectedPartName === ''
            || this._matchedMeshes(this.selectedPartName).length > 0;
        const showDuration = work.motion === 'pose' || work.motion === 'swing' || work.motion === 'bob';
        card.innerHTML = header
            + (editable ? '' : `<div style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px;">${this._t('This part has no triangles yet — use Reselect triangles.')}</div>`)
            + row(this._t('Name'),
                `<input type="text" class="r3d-card-name" value="${escape(work.name)}" ${selectStyle}>`)
            + row(this._t('Type'),
                `<select class="r3d-card-motion" ${selectStyle}>${motions.map(([value, label]) =>
                    `<option value="${value}"${value === work.motion ? ' selected' : ''}>${label}</option>`).join('')}</select>`)
            + body
            + '<div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>'
            + (showDuration ? row(this._t('Duration'),
                `<input type="range" class="r3d-card-speed" min="0" max="100" step="1" value="${this._durationToRaw(work.period)}"
                    style="flex:1;min-width:0;accent-color:var(--color-accent);">
                <span class="r3d-card-seconds" style="flex:0 0 44px;text-align:right;font-size:11px;color:var(--color-text);">${this._durationLabel(work.period)}</span>`) : '')
            + row(this._t('Play when'),
                `<select class="r3d-card-trigger" ${selectStyle}>
                    <option value="action"${work.trigger === 'action' ? ' selected' : ''}>${this._t('On demand')}</option>
                    <option value="moving"${work.trigger === 'moving' ? ' selected' : ''}>${this._t('While moving')}</option>
                    <option value="walking"${work.trigger === 'walking' ? ' selected' : ''}>${this._t('While walking')}</option>
                    <option value="dashing"${work.trigger === 'dashing' ? ' selected' : ''}>${this._t('While dashing')}</option>
                    <option value="idle"${work.trigger === 'idle' ? ' selected' : ''}>${this._t('While idle')}</option>
                    <option value="always"${work.trigger === 'always' ? ' selected' : ''}>${this._t('Always')}</option>
                </select>`)
            + (work.trigger === 'action' ? row(this._k('r3dcard.repeat'),
                `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;">
                    <input type="checkbox" class="r3d-card-repeat"${work.repeat ? ' checked' : ''}> ${this._k('r3dcard.repeatHint')}</label>`) : '')
            // A bone hinges about its own head; pivot presets act on
            // carved parts only and would silently do nothing here.
            + (this.selectedPartName && !this._isRigBoneName(this.selectedPartName)
                ? row(this._t('Pivot'),
                `<select class="r3d-card-pivot" ${selectStyle}>
                    <option value="">${this._t('Pivot preset…')}</option>
                    <option value="center">${this._t('Center')}</option>
                    <option value="top">${this._t('Top')}</option>
                    <option value="bottom">${this._t('Bottom')}</option>
                    <option value="front">${this._t('Front (+Z)')}</option>
                    <option value="back">${this._t('Back (-Z)')}</option>
                    <option value="left">${this._t('Left (-X)')}</option>
                    <option value="right">${this._t('Right (+X)')}</option>
                </select>
                <button type="button" class="r3d-card-pivot-place" title="${this._t('Place pivot (click the model)')}"
                    style="width:26px;height:26px;border:1px solid ${this._tool === 'pivot' ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:4px;cursor:pointer;background:${this._tool === 'pivot' ? 'var(--color-accent)' : 'var(--color-bg-surface)'};color:${this._tool === 'pivot' ? 'var(--color-accent-on)' : 'var(--color-text)'};font-size:13px;line-height:1;">✛</button>`) : '')
            + (work.motion === 'pose' && work.trigger === 'action' && !(work.keys || []).length
                ? row(this._t('At the end'),
                `<select class="r3d-card-hold" ${selectStyle}>
                    <option value="return"${work.hold ? '' : ' selected'}>${this._t('Return to rest')}</option>
                    <option value="hold"${work.hold ? ' selected' : ''}>${this._t('Stay posed')}</option>
                </select>`) : '')
            + (work.motion === 'pose' ? this._keysHtml() : '')
            + (work.trigger === 'action' ? this._effectsHtml() : '')
            + `<div style="display:flex;gap:6px;margin-top:9px;">
                <button type="button" class="rr-btn-secondary r3d-card-preview" style="flex:1;" title="${this._t('Play this animation from rest')}">${this._t('Preview')}</button>
                <button type="button" class="rr-btn-secondary r3d-card-reset" style="flex:1;" title="${this._t('Zero the sliders (undoable)')}">${this._t('Clear')}</button>
            </div>
            <div style="display:flex;gap:6px;margin-top:6px;">
                <button type="button" class="rr-button-primary r3d-card-save" style="flex:1;">
                    ${this._editingRule >= 0 ? this._t('Update animation') : this._t('Save as animation')}</button>
                ${this._editingRule >= 0 ? `<button type="button" class="rr-btn-secondary r3d-card-new"
                    title="${this._t('New animation for this part (keeps the sliders)')}"
                    style="flex:0 0 auto;padding:0 10px;">＋ ${this._t('New')}</button>` : ''}
            </div>`;
        this._bindEditCard(card, spec);
    }

    /** One line per timed effect: when, what, and a way out. */
    _effectSummary(effect) {
        if (effect.effect) return '\u2726 ' + effect.effect;
        if (effect.se && effect.se.name) return '\u266a ' + effect.se.name;
        if (effect.animation) {
            const animations = (this.databaseManager && this.databaseManager.data
                && this.databaseManager.data.animations) || [];
            const record = animations[Number(effect.animation)];
            return '\u25b6 ' + (record && record.name ? record.name : '#' + effect.animation);
        }
        if (effect.flash) {
            return '\u26a1 ' + (effect.flash.target === 'model'
                ? this._t('Model') : this._t('Screen'));
        }
        return '?';
    }

    _effectsHtml() {
        const effects = this._work.effects || [];
        const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const rows = effects.map((effect, index) => {
            const at = Math.round((Number(effect.at) || 0) * 100);
            const open = this._fxOpen === index && effect.flash ? `
                <div style="display:flex;align-items:center;gap:6px;margin:2px 0 4px 20px;font-size:11px;color:var(--color-text);">
                    <select class="r3d-fx-flash-target" data-i="${index}" style="flex:0 0 auto;padding:2px 4px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                        <option value="screen"${effect.flash.target !== 'model' ? ' selected' : ''}>${this._t('Screen')}</option>
                        <option value="model"${effect.flash.target === 'model' ? ' selected' : ''}>${this._t('Model')}</option>
                    </select>
                    <input type="color" class="r3d-fx-flash-color" data-i="${index}"
                        value="${'#' + (effect.flash.color || [255, 255, 255]).slice(0, 3).map(c => Math.min(255, Math.max(0, Number(c) || 0)).toString(16).padStart(2, '0')).join('')}"
                        style="flex:0 0 30px;height:22px;padding:0;border:1px solid var(--color-border-input);background:none;">
                    <input type="range" class="r3d-fx-flash-strength" data-i="${index}" min="0" max="255" step="1"
                        value="${(effect.flash.color || [0, 0, 0, 180])[3] != null ? effect.flash.color[3] : 180}"
                        title="${this._t('Strength')}" style="flex:1;min-width:0;accent-color:var(--color-accent);">
                    <input type="range" class="r3d-fx-flash-duration" data-i="${index}" min="5" max="120" step="1"
                        value="${effect.flash.duration || 20}" title="${this._t('Duration')}"
                        style="flex:1;min-width:0;accent-color:var(--color-accent);">
                </div>` : '';
            return `
                <div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
                    <input type="range" class="r3d-fx-at" data-i="${index}" min="0" max="100" step="1" value="${at}"
                        title="${this._t('When (percent of the animation)')}" style="flex:0 0 74px;accent-color:var(--color-accent);">
                    <span class="r3d-fx-label" data-i="${index}" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--color-text);cursor:pointer;">${at}% \u00b7 ${escape(this._effectSummary(effect))}</span>
                    <button type="button" class="r3d-fx-delete" data-i="${index}" title="${this._t('Delete')}"
                        style="width:18px;height:18px;border:none;background:none;color:var(--color-text-muted);cursor:pointer;font-size:12px;line-height:1;">\u00d7</button>
                </div>` + open;
        }).join('');
        const addButton = (cls, label) => `<button type="button" class="${cls}"
            style="flex:1;padding:3px 0;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid var(--color-border);background:var(--color-bg-surface);color:var(--color-text);">\uff0b ${label}</button>`;
        return `
            <div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>
            <div style="font-size:12px;color:var(--color-text);margin:4px 0;">${this._t('Effects')}</div>
            ${rows}
            <div style="display:flex;gap:4px;margin:4px 0;">
                ${addButton('r3d-fx-add-se', this._t('Sound'))}
                ${addButton('r3d-fx-add-anim', this._t('Animation'))}
                ${addButton('r3d-fx-add-flash', this._t('Flash'))}
                ${this.rawEffects.length ? addButton('r3d-fx-add-named', this._k('r3dfx.named')) : ''}
            </div>`;
    }

    /**
     * The keyframe timeline of an on-demand pose: each stop is a captured
     * set of slider values at a percent of the play. With keys present the
     * animation interpolates rest → stops → rest instead of the single
     * in-and-out blend, so a wind-up-then-strike lives on one card.
     */
    _keysHtml() {
        const keys = this._work.keys || [];
        const rows = keys.map((stop, index) => {
            const at = Math.round((Number(stop.at) || 0) * 100);
            return `
                <div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
                    <input type="range" class="r3d-key-at" data-i="${index}" min="1" max="99" step="1" value="${at}"
                        title="${this._t('When (percent of the animation)')}" style="flex:0 0 74px;accent-color:var(--color-accent);">
                    <span class="r3d-key-label" data-i="${index}" style="flex:1;min-width:0;font-size:11px;color:var(--color-text);">${at}% · ${this._t('Pose')}</span>
                    <button type="button" class="r3d-key-set" data-i="${index}" title="${this._t('Capture the sliders into this key')}"
                        style="padding:1px 8px;font-size:10px;border-radius:4px;cursor:pointer;border:1px solid var(--color-border);background:var(--color-bg-surface);color:var(--color-text);">${this._t('set')}</button>
                    <button type="button" class="r3d-key-delete" data-i="${index}" title="${this._t('Delete')}"
                        style="width:18px;height:18px;border:none;background:none;color:var(--color-text-muted);cursor:pointer;font-size:12px;line-height:1;">×</button>
                </div>`;
        }).join('');
        return `
            <div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>
            <div style="font-size:12px;color:var(--color-text);margin:4px 0;">${this._t('Keyframes')}</div>
            ${rows}
            <div style="display:flex;gap:4px;margin:4px 0;">
                <button type="button" class="r3d-key-add"
                    style="flex:1;padding:3px 0;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid var(--color-border);background:var(--color-bg-surface);color:var(--color-text);">＋ ${this._t('Key from sliders')}</button>
            </div>`;
    }

    _bindKeys(card) {
        const keys = () => this._work.keys || (this._work.keys = []);
        const addButton = card.querySelector('.r3d-key-add');
        if (addButton) {
            addButton.addEventListener('click', () => {
                const list = keys();
                const last = list.length ? list[list.length - 1].at : 0;
                list.push({
                    at: Math.min(0.9, Math.round((last + 0.25) * 20) / 20),
                    rotate: this._work.rotate.slice(),
                    move: this._work.move.slice(),
                    resize: this._work.resize.slice()
                });
                list.sort((a, b) => a.at - b.at);
                this.renderEditCard();
            });
        }
        card.querySelectorAll('.r3d-key-at').forEach(input => {
            input.addEventListener('input', event => {
                const index = Number(event.target.dataset.i);
                if (!keys()[index]) return;
                keys()[index].at = Number(event.target.value) / 100;
                const label = card.querySelector(`.r3d-key-label[data-i="${index}"]`);
                if (label) label.textContent = `${event.target.value}% · ${this._t('Pose')}`;
            });
            input.addEventListener('change', () => {
                keys().sort((a, b) => a.at - b.at);
                this.renderEditCard();
            });
        });
        card.querySelectorAll('.r3d-key-set').forEach(button => {
            button.addEventListener('click', event => {
                const index = Number(event.target.dataset.i);
                if (!keys()[index]) return;
                keys()[index].rotate = this._work.rotate.slice();
                keys()[index].move = this._work.move.slice();
                keys()[index].resize = this._work.resize.slice();
            });
        });
        card.querySelectorAll('.r3d-key-delete').forEach(button => {
            button.addEventListener('click', event => {
                const index = Number(event.target.dataset.i);
                keys().splice(index, 1);
                this.renderEditCard();
            });
        });
    }

    _bindEditCard(card, spec) {
        this._mountCardChooser(card);
        card.querySelector('.r3d-card-close').addEventListener('click', () => {
            this._cardCollapsed = true;
            this.deselectPart();
            this.renderEditCard();
        });
        card.querySelector('.r3d-card-undo').addEventListener('click', () => this.undoPose());
        card.querySelector('.r3d-card-redo').addEventListener('click', () => this.redoPose());
        card.querySelector('.r3d-card-repeat')?.addEventListener('change', event => {
            this._stashUndo();
            this._work.repeat = event.target.checked;
            this._syncWorkRule();
            this._commitUndo();
        });
        card.querySelector('.r3d-card-name').addEventListener('change', event => {
            this._work.name = event.target.value;
            this._rememberPose();
        });
        card.querySelector('.r3d-card-motion').addEventListener('change', event => {
            this._stashUndo();
            this._work.motion = event.target.value;
            if (this._work.motion === 'clip' && !this._work.clip && (this.embeddedClips || []).length) {
                this._work.clip = this.embeddedClips[0];
            }
            this._syncWorkRule();
            this._commitUndo();
            this.renderEditCard();
        });
        card.querySelectorAll('.r3d-card-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this._cardTab = tab.dataset.tab;
                this.renderEditCard();
            });
        });
        card.querySelectorAll('.r3d-card-axis').forEach(chip => {
            chip.addEventListener('click', () => {
                this._stashUndo();
                this._work.axis = chip.dataset.axis;
                this._syncWorkRule();
                this._commitUndo();
                this.renderEditCard();
            });
        });
        const bindSlider = (cls, apply, show) => {
            const slider = card.querySelector('.' + cls);
            if (!slider) return;
            const readout = card.querySelector('.' + cls + '-val');
            slider.addEventListener('input', () => {
                this._stashUndo();
                const value = Number(slider.value);
                apply(value);
                this._syncWorkRule();
                if (readout) readout.textContent = show(value);
            });
            slider.addEventListener('change', () => this._commitUndo());
        };
        const applyPose = (index, value) => {
            this._stashUndo();
            if (this._cardTab === 'rotate') this._work.rotate[index] = value;
            else if (this._cardTab === 'offset') this._work.move[index] = value;
            else this._work.resize[index] = value / 100;
            this._syncWorkRule();
            const readout = card.querySelector(`.r3d-card-val[data-i="${index}"]`);
            if (readout && spec) readout.textContent = spec.show(value);
        };
        card.querySelectorAll('.r3d-card-slider').forEach(slider => {
            const index = Number(slider.dataset.i);
            slider.addEventListener('input', () => applyPose(index, Number(slider.value)));
            slider.addEventListener('change', () => this._commitUndo());
            slider.addEventListener('dblclick', () => {
                slider.value = this._cardTab === 'scale' ? 100 : 0;
                applyPose(index, Number(slider.value));
                this._commitUndo();
            });
        });
        bindSlider('r3d-card-degrees', v => { this._work.degrees = v; }, v => Math.round(v) + '°');
        bindSlider('r3d-card-spinspeed', v => { this._work.speed = v; }, v => Math.round(v) + '°/s');
        bindSlider('r3d-card-pertile', v => { this._work.perTile = v; }, v => Math.round(v) + '°');
        bindSlider('r3d-card-amount', v => { this._work.amount = v; }, v => v.toFixed(2));
        bindSlider('r3d-card-rate', v => { this._work.rate = v / 100; }, v => Math.round(v) + '%');
        const clip = card.querySelector('.r3d-card-clip');
        if (clip) {
            clip.addEventListener('change', event => {
                this._stashUndo();
                this._work.clip = event.target.value;
                this._syncWorkRule();
                this._commitUndo();
            });
        }
        const speed = card.querySelector('.r3d-card-speed');
        if (speed) {
            speed.addEventListener('input', () => {
                this._stashUndo();
                this._work.period = this._rawToDuration(Number(speed.value));
                this._syncWorkRule();
                const label = card.querySelector('.r3d-card-seconds');
                if (label) label.textContent = this._durationLabel(this._work.period);
            });
            speed.addEventListener('change', () => this._commitUndo());
        }
        card.querySelector('.r3d-card-trigger').addEventListener('change', event => {
            this._stashUndo();
            this._work.trigger = event.target.value;
            this._commitUndo();
            this.renderEditCard();
        });
        const hold = card.querySelector('.r3d-card-hold');
        if (hold) {
            hold.addEventListener('change', event => {
                this._stashUndo();
                this._work.hold = event.target.value === 'hold';
                this._commitUndo();
            });
        }
        const pivotPreset = card.querySelector('.r3d-card-pivot');
        if (pivotPreset) {
            pivotPreset.addEventListener('change', event => {
                const preset = event.target.value;
                event.target.value = '';
                if (preset) this._pivotPreset(this.selectedPartName, preset);
            });
        }
        const pivotPlace = card.querySelector('.r3d-card-pivot-place');
        if (pivotPlace) {
            pivotPlace.addEventListener('click', () => {
                this.setTool(this._tool === 'pivot' ? 'orbit' : 'pivot');
                this.renderEditCard();
            });
        }
        this._bindEffects(card);
        this._bindKeys(card);
        card.querySelector('.r3d-card-preview').addEventListener('click', () => this.previewPose());
        card.querySelector('.r3d-card-reset').addEventListener('click', () => {
            this._stashUndo();
            // _resetWork clears the stash; the reset must stay undoable.
            const stashed = this._pendingUndo;
            const editing = this._editingRule;
            this._resetWork();
            this._pendingUndo = stashed;
            this._editingRule = editing;
            this._syncWorkRule();
            this._commitUndo();
            this.renderEditCard();
        });
        card.querySelector('.r3d-card-save').addEventListener('click', () => this.savePose());
        const fresh = card.querySelector('.r3d-card-new');
        if (fresh) {
            // A part with a saved animation opens it for editing, which
            // left no way to give the part a SECOND animation: ＋ detaches
            // from the rule being edited, keeps the sliders, and the next
            // save creates a new one under its own name.
            fresh.addEventListener('click', () => {
                this._editingRule = -1;
                this.selectedRule = -1;
                this._work.name = '';
                this._rememberPose();
                this._syncWorkRule();
                this.renderRuleList();
                this.renderEditCard();
            });
        }
        this._refreshUndoButtons();
    }

    /**
     * Fire the timed effects of whatever action is playing in the
     * preview, editor-side: sounds through a plain Audio element, flashes
     * on the model's materials or the preview background. Database
     * animations need the game runtime and play in game.
     */
    _updatePreviewFx(frame, rules) {
        const action = this._sim.action;
        const key = action ? action.name + ':' + action.frame : '';
        if (this._fxKey !== key) {
            this._fxKey = key;
            this._fxT = -1;
        }
        if (action && typeof Reactor3D !== 'undefined' && Reactor3D.modelEffectsToFire) {
            const t = frame - action.frame;
            for (const rule of rules) {
                if (rule.trigger !== 'action' || rule.name !== action.name) continue;
                const duration = Reactor3D.modelRuleDuration(rule, this._binding ? this._binding.clips : null);
                for (const effect of Reactor3D.modelEffectsToFire(rule, duration, this._fxT, t)) {
                    this._fireEffectPreview(effect);
                }
            }
            this._fxT = t;
        }
        if (this._flashHolder && Reactor3D.updateModelFlash) {
            Reactor3D.updateModelFlash(this._flashHolder);
        }
        this._updateTriggeredEffectPreview();
        if (this._bgFlash && this._scene && this._scene.background) {
            const flash = this._bgFlash;
            const strength = (flash.color[3] / 255) * Math.max(0, 1 - flash.t / flash.duration);
            const base = ModelPreview3D.backgroundColor();
            const color = new THREE.Color().setRGB(flash.color[0] / 255, flash.color[1] / 255,
                flash.color[2] / 255, THREE.SRGBColorSpace);
            this._scene.background.copy(base).lerp(color, strength);
            if (++flash.t > flash.duration) {
                this._bgFlash = null;
                ModelPreview3D.updateBackground(this._scene);
            }
        }
    }

    _fireEffectPreview(effect) {
        if (effect.effect) {
            const raw = this.rawEffects.find(entry => entry && entry.name === effect.effect);
            if (raw) this._playEffectPreview(raw);
            return;
        }
        if (effect.animation) {
            // An inline database animation plays at the model's origin.
            this._playEffectPreview({ animation: effect.animation, anchor: { part: '', offset: [0, 0, 0] }, scale: 1 });
            return;
        }
        if (effect.se) {
            try {
                const path = require('path');
                const url = typeof RRAssetFiles !== 'undefined'
                    ? RRAssetFiles.urlFor(path.join(this._project().path, 'audio', 'se'),
                        effect.se.name, RRAssetFiles.AUDIO_EXTENSIONS)
                    : '';
                if (!url) return;
                const audio = new Audio(url);
                const sounds = this._previewSounds || (this._previewSounds = new Set());
                sounds.add(audio);
                audio.addEventListener('ended', () => sounds.delete(audio), { once: true });
                audio.volume = Math.min(1, Math.max(0, (effect.se.volume !== undefined ? effect.se.volume : 90) / 100));
                audio.playbackRate = Math.min(4, Math.max(0.25, (effect.se.pitch !== undefined ? effect.se.pitch : 100) / 100));
                audio.play().catch(() => sounds.delete(audio));
            } catch (error) {
                // A missing or unplayable file loses its preview, not the card.
            }
        } else if (effect.flash) {
            if (effect.flash.target === 'model' && this._object) {
                this._flashHolder = {
                    object: this._object,
                    flash: { color: effect.flash.color, duration: effect.flash.duration, t: 0 }
                };
            } else {
                this._bgFlash = { color: effect.flash.color, duration: effect.flash.duration, t: 0 };
            }
        }
    }

    //-------------------------------------------------------------------------
    // Model effects
    //
    // The model's own effects: a database animation (MV sheet or Effekseer),
    // optionally a sound, placed at an anchor on the model — a part or bone
    // plus an offset in model space, picked by clicking the model. Rule
    // timelines fire them by name and the Play 3D Effect command fires them
    // on demand. Previewed in the viewport by an overlay that follows the
    // anchor's projected position as the model turns.

    _k(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    _effectDef(raw) {
        if (typeof Reactor3D !== 'undefined' && Reactor3D.readModelEffects) {
            return Reactor3D.readModelEffects({ effects: [raw] })[0] || null;
        }
        return raw || null;
    }

    /** Fold or unfold a sidebar section: stats, parts, animations or effects. */
    toggleSection(name, collapsed) {
        if (!this._detail) return;
        const state = this._sectionsCollapsed || (this._sectionsCollapsed = {});
        state[name] = collapsed === undefined ? !state[name] : !!collapsed;
        const bodies = {
            stats: ['.r3d-stats'],
            parts: ['.r3d-part-list', '.r3d-part-form'],
            animations: ['.r3d-motions-row', '.r3d-rule-list', '.r3d-rule-note'],
            effects: ['.r3d-effect-list', '.r3d-effect-form']
        }[name] || [];
        for (const selector of bodies) {
            const el = this._detail.querySelector(selector);
            if (!el) continue;
            if (state[name]) {
                if (el.dataset.rrDisplay === undefined) el.dataset.rrDisplay = el.style.display || '';
                el.style.display = 'none';
            } else if (el.dataset.rrDisplay !== undefined) {
                // The motions row is shown by its own rule; the rest come back as they were.
                el.style.display = selector === '.r3d-motions-row' && el.dataset.rrDisplay === 'none' ? 'none' : el.dataset.rrDisplay;
                delete el.dataset.rrDisplay;
            }
        }
        const toggle = this._detail.querySelector(`.r3d-sec-header[data-sec="${name}"] .r3d-sec-toggle`);
        if (toggle) toggle.textContent = state[name] ? '▸' : '▾';
    }

    renderEffectList() {
        const list = this._detail ? this._detail.querySelector('.r3d-effect-list') : null;
        if (!list) return;
        list.innerHTML = '';
        if (!this.rawEffects.length) {
            const empty = document.createElement('div');
            empty.textContent = this._k('r3dfx.none');
            empty.style.cssText = 'padding:4px 10px;font-size:11px;color:var(--color-text-muted);';
            list.appendChild(empty);
        }
        this.rawEffects.forEach((raw, index) => {
            const row = document.createElement('div');
            row.dataset.modelRecordIndex = String(index);
            const animations = this.databaseManager?.data?.animations || [];
            const record = raw.type === 'video' ? (raw.video && raw.video.file ? { name: raw.video.file } : null)
                : raw.type === 'light' ? { name: this._lightSummary(raw.light) } : animations[Number(raw.animation)];
            const when = { moving: this._t('While moving'), walking: this._t('While walking'), dashing: this._t('While dashing'), idle: this._t('While idle'), always: this._t('Always') }[raw.trigger];
            row.textContent = `\u2726 ${raw.name || '?'}` + (record && record.name ? ` \u2014 ${record.name}` : '') + (when ? ` \u00b7 ${when}` : '');
            row.style.cssText = 'padding:4px 10px;cursor:pointer;font-size:12px;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
                + (index === this.selectedEffect ? 'background:var(--color-accent-tint-25);' : '');
            row.addEventListener('click', () => this.selectEffect(index));
            list.appendChild(row);
        });
    }

    selectEffect(index) {
        this.selectedEffect = index;
        const raw = this.rawEffects[index];
        this._effectWork = raw ? JSON.parse(JSON.stringify(raw)) : null;
        if (this._effectWork && !Array.isArray(this._effectWork.rotate)) this._effectWork.rotate = [0, 0, 0];
        if (this._tool === 'fxanchor' && !raw) this.setTool('orbit');
        if (this._effectWork) {
            // The effect takes the card; the part it may have been posing
            // steps aside without losing its saved work.
            this._cardMode = 'effect';
            this._cardCollapsed = false;
        } else if (this._cardMode === 'effect') {
            this._cardMode = 'part';
        }
        this._healAnchorBinding(this._effectWork);
        this.renderEffectList();
        this.renderEffectForm();
        this._syncEffectAnchorMarker();
        this.renderEditCard();
        // A video effect previews the moment it is selected: the movie on
        // its surface IS the thing being placed, so it has to be visible
        // while the sliders move it — not only after a press of Play.
        if (this._effectWork && this._effectWork.type === 'video'
            && this._effectWork.video && this._effectWork.video.file) {
            this._stopLightPreview();
            this._fxPreviewDef = this._effectWork;
            this._playVideoPreview(this._effectWork);
        } else if (this._effectWork && this._effectWork.type === 'light') {
            // A light previews the moment it is selected, like a movie: its
            // glow at the anchor is the thing the sliders are placing.
            this._stopVideoPreview();
            this._fxPreviewDef = this._effectWork;
            this._playLightPreview(this._effectWork);
        } else {
            this._stopVideoPreview();
            this._stopLightPreview();
        }
    }

    /** "Spot · #ff8800": what a light effect is, for the list. */
    _lightSummary(light) {
        const spec = light && typeof light === 'object' ? light : {};
        const kind = this._k(spec.type === 'spot' ? 'lit.spot' : spec.type === 'beam' ? 'lit.beam' : 'lit.point');
        const colour = typeof spec.color === 'string' && spec.color ? spec.color : '#ffffff';
        return `${this._k('r3dfx.typeLight')} \u00b7 ${kind} \u00b7 ${colour}`;
    }

    /** A light effect's fields with the runtime's defaults filled in, on the work object. */
    _ensureLightWork(work) {
        if (!work.light || typeof work.light !== 'object') work.light = {};
        const light = work.light;
        const kind = light.type === 'spot' ? 'spot' : light.type === 'beam' ? 'beam' : 'point';
        light.type = kind;
        const number = (key, fallback) => { const n = Number(light[key]); light[key] = Number.isFinite(n) ? n : fallback; };
        if (typeof light.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(light.color)) light.color = '#ffd9a0';
        number('radius', kind === 'spot' ? 6 : kind === 'beam' ? 8 : 3);
        number('intensity', 1);
        number('angle', 70);
        number('width', 0.08);
        number('yaw', 0);
        number('pitch', 0);
        number('flicker', 0);
        number('duration', 0);
        light.occlude = light.occlude !== false;
        light.shadow = light.shadow === true;
        light.body = light.body !== false;
        return light;
    }

    _leaveEffectMode() {
        this._cardMode = 'part';
        this.selectedEffect = -1;
        this._effectWork = null;
        this._stopEffectPreview();
        this._syncEffectAnchorMarker();
        this.renderEffectList();
        this.renderEffectForm();
    }

    /** The card's chooser: everything on the model that can be edited, by type. */
    _mountCardChooser(card) {
        const mount = card.querySelector('.r3d-card-chooser');
        if (!mount || typeof RRSearchSelect === 'undefined') return;
        const bones = [], parts = [];
        for (const name of this.partNames || []) (this._isRigBoneName(name) ? bones : parts).push(name);
        for (const part of this.customParts) if (part && part.name && parts.indexOf(part.name) < 0 && bones.indexOf(part.name) < 0) parts.push(part.name);
        if (this.selectedPartName && this.partNames.indexOf(this.selectedPartName) < 0 && parts.indexOf(this.selectedPartName) < 0 && bones.indexOf(this.selectedPartName) < 0) {
            parts.push(this.selectedPartName);
        }
        const groups = [
            { label: this._k('r3dcard.groupModel'), items: [{ id: '__model', label: this._t('Whole model') }] },
            { label: this._t('Parts'), items: parts.map(name => ({ id: name, label: name })) },
            { label: this._k('r3dcard.groupBones'), items: bones.map(name => ({ id: name, label: name })) },
            { label: this._k('r3dfx.title'), items: this.rawEffects.filter(raw => raw && raw.name).map(raw => ({ id: 'fx:' + raw.name, label: '\u2726 ' + raw.name })) }
        ].filter(group => group.items.length);
        const value = this._cardMode === 'effect' && this._effectWork
            ? 'fx:' + this._effectWork.name
            : this.selectedPartName === '' ? '__model' : (this.selectedPartName || '');
        const chooser = RRSearchSelect.create({
            groups, value, placeholder: '\u2014',
            onChange: id => this._onCardChooserPick(id)
        });
        mount.appendChild(chooser.element);
        this._cardChooser = chooser;
    }

    _onCardChooserPick(id) {
        if (id.startsWith('fx:')) {
            const index = this.rawEffects.findIndex(raw => raw && raw.name === id.slice(3));
            if (index >= 0) this.selectEffect(index);
            return;
        }
        if (this._cardMode === 'effect') this._leaveEffectMode();
        if (id === '__model') {
            this._modelTab = 'transform';
            this.selectPartByName('');
            return;
        }
        // With work on the card, the chooser is the animation's Part: it
        // retargets what is being edited, values intact.
        if (this._workIsLive() && this.selectedPartName !== null) this.retargetWork(id);
        else this.selectPartByName(id);
    }

    /** Shared slider block for a 3-axis field, X/Y/Z coloured like the pose card. */
    _axisSlidersHtml(cls, spec) {
        const axes = [{ label: 'X', color: '#e5484d' }, { label: 'Y', color: '#46a758' }, { label: 'Z', color: '#3e63dd' }];
        return axes.map((axis, i) => `
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <span style="flex:0 0 14px;font-weight:bold;font-size:12px;color:${axis.color};">${axis.label}</span>
                <input type="range" class="${cls}" data-i="${i}" min="${spec.min}" max="${spec.max}" step="${spec.step}"
                    value="${spec.value(i)}" style="flex:1;min-width:0;accent-color:${axis.color};" title="${this._t('Double-click to reset')}">
                <span class="${cls}-val" data-i="${i}" style="flex:0 0 48px;text-align:right;font-size:11px;color:var(--color-text);">${spec.show(spec.value(i))}</span>
            </div>`).join('');
    }

    /**
     * Scale sliders: one for a proportional scale, three for a free one.
     * `scale` is a number when proportional and [x, y, z] when free, which
     * is also how the runtime reads it.
     */
    _scaleSlidersHtml(prefix, scale) {
        const proportional = !Array.isArray(scale);
        const axes = Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1];
        const percent = value => Math.round((Number(value) > 0 ? Number(value) : 1) * 100);
        const check = `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;margin:2px 0 4px;">
            <input type="checkbox" class="${prefix}-proportional"${proportional ? ' checked' : ''}> ${this._k('r3dcard.proportional')}</label>`;
        if (proportional) {
            return check + `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <span style="flex:0 0 14px;font-weight:bold;font-size:12px;color:var(--color-text);">S</span>
                <input type="range" class="${prefix}-scale" data-i="all" min="10" max="400" step="1" value="${percent(axes[0])}" style="flex:1;min-width:0;accent-color:var(--color-accent);" title="${this._t('Double-click to reset')}">
                <span class="${prefix}-scale-val" data-i="all" style="flex:0 0 48px;text-align:right;font-size:11px;color:var(--color-text);">${percent(axes[0])}%</span>
            </div>`;
        }
        return check + this._axisSlidersHtml(prefix + '-scale', {
            min: 10, max: 400, step: 1, value: i => percent(axes[i]), show: v => Math.round(v) + '%'
        });
    }

    _bindScaleSliders(card, prefix, work, live) {
        card.querySelector(`.${prefix}-proportional`)?.addEventListener('change', event => {
            const axes = Array.isArray(work.scale) ? work.scale : [work.scale || 1, work.scale || 1, work.scale || 1];
            work.scale = event.target.checked ? axes[0] : axes.slice();
            live();
            this.renderEditCard();
        });
        card.querySelectorAll(`.${prefix}-scale`).forEach(slider => {
            const which = slider.dataset.i;
            const readout = card.querySelector(`.${prefix}-scale-val[data-i="${which}"]`);
            const apply = () => {
                const value = Math.max(0.1, Number(slider.value) / 100);
                if (which === 'all') work.scale = value;
                else {
                    if (!Array.isArray(work.scale)) work.scale = [work.scale || 1, work.scale || 1, work.scale || 1];
                    work.scale[Number(which)] = value;
                }
                if (readout) readout.textContent = Math.round(Number(slider.value)) + '%';
                live();
            };
            slider.addEventListener('input', apply);
            slider.addEventListener('dblclick', () => { slider.value = 100; apply(); });
        });
    }

    _tabStripHtml(cls, tabs, current) {
        return `<div style="display:flex;gap:4px;margin-bottom:8px;">
            ${tabs.map(tab => `<button type="button" class="${cls}" data-tab="${tab.id}"
                style="flex:1;padding:4px 0;font-size:12px;border-radius:4px;cursor:pointer;
                border:1px solid ${tab.id === current ? 'var(--color-accent)' : 'var(--color-border)'};
                background:${tab.id === current ? 'var(--color-accent)' : 'var(--color-bg-surface)'};
                color:${tab.id === current ? 'var(--color-accent-on)' : 'var(--color-text)'};font-weight:bold;">${tab.label}</button>`).join('')}
        </div>`;
    }

    /** The model's native span, for offset slider ranges. */
    _modelSpan() {
        const size = (this._template && this._template.userData.glbSize) || { x: 1, y: 1.8, z: 1 };
        return Math.max(size.x, size.y, size.z, 0.001);
    }

    /** The card in effect mode: offset, turn and size of the selected effect, with sliders. */
    _renderEffectCard(card, header) {
        const work = this._effectWork;
        const span = this._modelSpan();
        const offset = work.anchor && Array.isArray(work.anchor.offset) ? work.anchor.offset : [0, 0, 0];
        if (!work.anchor) work.anchor = { part: '', offset: [0, 0, 0] };
        if (!Array.isArray(work.rotate)) work.rotate = [0, 0, 0];
        const spec = {
            offset: { min: -span, max: span, step: span / 500, value: i => offset[i] || 0, show: v => Number(v).toFixed(span >= 10 ? 1 : 3) },
            rotate: { min: -180, max: 180, step: 1, value: i => work.rotate[i] || 0, show: v => Math.round(v) + '°' }
        }[this._fxTab === 'scale' ? 'offset' : this._fxTab];
        const isLight = work.type === 'light';
        const tabs = [{ id: 'offset', label: this._t('Offset') }, { id: 'rotate', label: this._t('Rotate') },
            { id: 'scale', label: isLight ? this._k('lit.section.light') : this._t('Scale') }];
        // A light has no scale and turns by its own aim: the Rotate tab is
        // its direction and tilt, the third tab its reach and strength.
        const body = isLight && this._fxTab !== 'offset'
            ? this._lightCardSlidersHtml(work, this._fxTab)
            : this._fxTab === 'scale'
                ? this._scaleSlidersHtml('r3d-fxcard', work.scale)
                : this._axisSlidersHtml('r3d-fxcard-slider', spec);
        const trigger = work.trigger || 'action';
        const triggerOptions = [['action', this._t('On demand')], ['moving', this._t('While moving')], ['walking', this._t('While walking')],
            ['dashing', this._t('While dashing')], ['idle', this._t('While idle')], ['always', this._t('Always')]];
        card.innerHTML = header
            + `<div style="font-size:11px;color:var(--color-text-muted);margin:-4px 0 6px;">${this._k('r3dcard.effectHint')}</div>`
            + this._tabStripHtml('r3d-fxcard-tab', tabs, this._fxTab)
            + body
            + `<div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px;">
                <span style="flex:0 0 62px;font-size:12px;color:var(--color-text);">${this._t('Play when')}</span>
                <select class="r3d-fxcard-trigger" style="flex:1;min-width:0;padding:3px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                    ${triggerOptions.map(([value, label]) => `<option value="${value}"${value === trigger ? ' selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                ${trigger === 'action' ? `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;"><input type="checkbox" class="r3d-fxcard-loop"${work.loop ? ' checked' : ''}> ${this._k('r3dfx.loop')}</label>` : ''}
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;margin-left:auto;"><input type="checkbox" class="r3d-fxcard-place"${this._tool === 'fxanchor' ? ' checked' : ''}> ${this._k('r3dfx.place')}</label>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
                <button type="button" class="rr-btn-secondary r3d-fxcard-play" style="flex:1;">${this._k('r3dfx.play')}</button>
                <button type="button" class="rr-button-primary r3d-fxcard-save" style="flex:1;">${this._k('r3dfx.save')}</button>
            </div>`;
        this._mountCardChooser(card);
        card.querySelector('.r3d-card-close').addEventListener('click', () => {
            this._leaveEffectMode();
            this.renderEditCard();
        });
        card.querySelector('.r3d-card-undo').style.opacity = '0.35';
        card.querySelector('.r3d-card-redo').style.opacity = '0.35';
        card.querySelectorAll('.r3d-fxcard-tab').forEach(tab => tab.addEventListener('click', () => {
            this._fxTab = tab.dataset.tab;
            this.renderEditCard();
        }));
        const live = () => {
            this._syncEffectAnchorMarker();
            if (this._fxPreview && this._fxPreview.active) {
                this._fxPreview.setTransform({ rotate: work.rotate, scale: work.scale });
            }
            this._updateEffectPreview();
            this._lastInputAt = performance.now();
        };
        card.querySelectorAll('.r3d-fxcard-slider').forEach(slider => {
            const readout = card.querySelector(`.r3d-fxcard-slider-val[data-i="${slider.dataset.i}"]`);
            const apply = () => {
                const i = Number(slider.dataset.i);
                const value = Number(slider.value);
                if (this._fxTab === 'rotate') work.rotate[i] = value;
                else work.anchor.offset[i] = Math.round(value * 1000) / 1000;
                if (readout) readout.textContent = spec.show(value);
                live();
            };
            slider.addEventListener('input', apply);
            slider.addEventListener('dblclick', () => { slider.value = this._fxTab === 'rotate' ? 0 : 0; apply(); });
        });
        if (work.type === 'light') {
            const light = this._ensureLightWork(work);
            card.querySelectorAll('.r3d-fxcard-lslider').forEach(slider => {
                const key = slider.dataset.key;
                const apply = () => {
                    light[key] = Number(slider.value);
                    this._afterLightEdit(false);
                };
                slider.addEventListener('input', apply);
                slider.addEventListener('change', () => this._afterLightEdit(true));
                slider.addEventListener('dblclick', () => { slider.value = key === 'intensity' ? '1' : '0'; apply(); this._afterLightEdit(true); });
            });
        } else {
            this._bindScaleSliders(card, 'r3d-fxcard', work, live);
        }
        card.querySelector('.r3d-fxcard-loop')?.addEventListener('change', event => { work.loop = event.target.checked; });
        card.querySelector('.r3d-fxcard-trigger').addEventListener('change', event => {
            work.trigger = event.target.value;
            this._stopEffectPreview();
            this.renderEditCard();
        });
        card.querySelector('.r3d-fxcard-place').addEventListener('change', event => this.setTool(event.target.checked ? 'fxanchor' : 'orbit'));
        card.querySelector('.r3d-fxcard-play').addEventListener('click', () => this._playEffectPreview(work));
        card.querySelector('.r3d-fxcard-save').addEventListener('click', () => this._saveEffectWork());
    }

    /** The card in model mode: the model's own base transform, or its whole-model animations. */
    _renderTransformCard(card, header) {
        if (!this._transformWork) {
            const base = typeof Reactor3D !== 'undefined' && Reactor3D.readModelTransform
                ? Reactor3D.readModelTransform({ transform: this.rawTransform })
                : { offset: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
            this._transformWork = JSON.parse(JSON.stringify(base));
        }
        const work = this._transformWork;
        const span = this._modelSpan();
        const tab = this._cardTab === 'scale' ? 'scale' : this._cardTab === 'rotate' ? 'rotate' : 'offset';
        const spec = {
            offset: { min: -span, max: span, step: span / 500, value: i => work.offset[i] || 0, show: v => Number(v).toFixed(span >= 10 ? 1 : 3) },
            rotate: { min: -180, max: 180, step: 1, value: i => work.rotate[i] || 0, show: v => Math.round(v) + '°' }
        }[tab === 'scale' ? 'offset' : tab];
        const body = tab === 'scale'
            ? this._scaleSlidersHtml('r3d-tcard', work.scale)
            : this._axisSlidersHtml('r3d-tcard-slider', spec);
        card.innerHTML = header
            + this._tabStripHtml('r3d-tcard-mode', [{ id: 'transform', label: this._k('r3dcard.transform') }, { id: 'animation', label: this._t('Animations') }], 'transform')
            + `<div style="font-size:11px;color:var(--color-text-muted);margin:-4px 0 6px;">${this._k('r3dcard.transformHint')}</div>`
            + this._tabStripHtml('r3d-tcard-tab', [{ id: 'offset', label: this._t('Offset') }, { id: 'rotate', label: this._t('Rotate') }, { id: 'scale', label: this._t('Scale') }], tab)
            + body
            + `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;margin-top:8px;" title="${this._k('r3dcard.collisionHint')}">
                <input type="checkbox" class="r3d-tcard-collision"${this.rawCollision === 'mesh' ? ' checked' : ''}> ${this._k('r3dcard.collision')}</label>
            <div style="display:flex;gap:6px;margin-top:10px;">
                <button type="button" class="rr-btn-secondary r3d-tcard-reset" style="flex:1;">${this._t('Clear')}</button>
                <button type="button" class="rr-button-primary r3d-tcard-save" style="flex:1;">${this._k('r3dcard.saveTransform')}</button>
            </div>`;
        this._mountCardChooser(card);
        card.querySelector('.r3d-card-close').addEventListener('click', () => {
            this._cardCollapsed = true;
            this.deselectPart();
            this.renderEditCard();
        });
        card.querySelector('.r3d-card-undo').style.opacity = '0.35';
        card.querySelector('.r3d-card-redo').style.opacity = '0.35';
        card.querySelectorAll('.r3d-tcard-mode').forEach(button => button.addEventListener('click', () => {
            this._modelTab = button.dataset.tab;
            this.renderEditCard();
        }));
        card.querySelectorAll('.r3d-tcard-tab').forEach(button => button.addEventListener('click', () => {
            this._cardTab = button.dataset.tab;
            this.renderEditCard();
        }));
        card.querySelectorAll('.r3d-tcard-slider').forEach(slider => {
            const readout = card.querySelector(`.r3d-tcard-slider-val[data-i="${slider.dataset.i}"]`);
            const apply = () => {
                const i = Number(slider.dataset.i);
                const value = Number(slider.value);
                if (tab === 'rotate') work.rotate[i] = value;
                else work.offset[i] = Math.round(value * 1000) / 1000;
                if (readout) readout.textContent = spec.show(value);
                this._applyBaseTransform();
            };
            slider.addEventListener('input', apply);
            slider.addEventListener('dblclick', () => { slider.value = 0; apply(); });
        });
        this._bindScaleSliders(card, 'r3d-tcard', work, () => this._applyBaseTransform());
        card.querySelector('.r3d-tcard-reset').addEventListener('click', () => {
            this._transformWork = { offset: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
            this._applyBaseTransform();
            this.renderEditCard();
        });
        card.querySelector('.r3d-tcard-collision').addEventListener('change', event => {
            this.rawCollision = event.target.checked ? 'mesh' : 'box';
            this.saveRules();
        });
        card.querySelector('.r3d-tcard-save').addEventListener('click', () => {
            this.rawTransform = JSON.parse(JSON.stringify(this._transformWork));
            this.saveRules();
            this.renderEditCard();
        });
    }

    /** Put the working (or saved) base transform on the placed model. */
    _applyBaseTransform() {
        if (!this._object || typeof Reactor3D === 'undefined' || !Reactor3D.applyModelTransform) return;
        const transform = Reactor3D.readModelTransform({ transform: this._transformWork || this.rawTransform });
        Reactor3D.applyModelTransform(this._object, transform);
        this._syncEffectAnchorMarker();
        this._lastInputAt = performance.now();
    }

    /** Write the selected effect's working copy, keeping rules that fire it by its old name. */
    _saveEffectWork() {
        const work = this._effectWork;
        const index = this.selectedEffect;
        if (!work || index < 0) return;
        const previous = this.rawEffects[index] && this.rawEffects[index].name;
        if (previous && previous !== work.name) {
            for (const raw of this.rawAnimations) {
                for (const effect of raw.effects || []) if (effect.effect === previous) effect.effect = work.name;
            }
        }
        this.rawEffects[index] = JSON.parse(JSON.stringify(work));
        this.saveRules();
        this.renderEffectList();
        this.renderEffectForm();
        this.renderEditCard();
    }

    addModelEffect() {
        const base = 'effect';
        let name = base, n = 2;
        while (this.rawEffects.some(raw => raw && raw.name === name)) name = `${base}${n++}`;
        this.rawEffects.push({ name, animation: 0, anchor: { part: '', offset: [0, 0, 0] }, scale: 1, loop: false });
        this.saveRules();
        this.selectEffect(this.rawEffects.length - 1);
    }

    deleteModelEffect() {
        if (this.selectedEffect < 0 || !this.rawEffects[this.selectedEffect]) return;
        const name = this.rawEffects[this.selectedEffect].name;
        this.rawEffects.splice(this.selectedEffect, 1);
        // Rules that fired it by name lose that step rather than firing nothing.
        for (const raw of this.rawAnimations) {
            if (Array.isArray(raw.effects)) raw.effects = raw.effects.filter(effect => effect.effect !== name);
        }
        this.saveRules();
        this._stopEffectPreview();
        this.selectEffect(Math.min(this.selectedEffect, this.rawEffects.length - 1));
    }

    /** Parts and bones an effect can anchor to, by name. */
    _effectAnchorChoices() {
        const names = [];
        for (const part of this.customParts) if (part && part.name && names.indexOf(part.name) < 0) names.push(part.name);
        if (this._object) {
            this._object.traverse(node => {
                if (node.isBone && node.name && names.indexOf(node.name) < 0) names.push(node.name);
                // A rig's joints are not always Bone objects — a reduced or
                // re-imported model can carry plain nodes in its skeleton —
                // but Place binds to them all the same, so the list must
                // offer them or the form reads the binding as "origin".
                if (node.isSkinnedMesh && node.skeleton) {
                    for (const bone of node.skeleton.bones) {
                        if (bone && bone.name && names.indexOf(bone.name) < 0) names.push(bone.name);
                    }
                }
            });
        }
        return names;
    }

    renderEffectForm() {
        const form = this._detail ? this._detail.querySelector('.r3d-effect-form') : null;
        if (!form) return;
        const work = this._effectWork;
        if (!work) {
            form.innerHTML = '';
            return;
        }
        const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const control = 'flex:1;min-width:0;padding:3px 6px;font-size:11px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;';
        const row = (label, body) => `
            <div style="display:flex;align-items:center;gap:6px;margin:5px 0;">
                <span style="flex:0 0 58px;font-size:11px;color:var(--color-text-muted);">${escape(label)}</span>${body}
            </div>`;
        const animations = this.databaseManager?.data?.animations || [];
        const record = animations[Number(work.animation)];
        const anchor = work.anchor && typeof work.anchor === 'object' ? work.anchor : { part: '', offset: [0, 0, 0] };
        const choices = this._effectAnchorChoices();
        if (anchor.part && choices.indexOf(anchor.part) < 0) choices.unshift(anchor.part);
        const isVideo = work.type === 'video';
        const isLight = work.type === 'light';
        const light = isLight ? this._ensureLightWork(work) : null;
        if (!work.video) work.video = { file: '', width: 0.3, height: 0.2, loop: true, audio: false, volume: 100 };
        // Fractions of the model's size; pixel-era numbers convert on sight.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.videoEffectFraction) {
            work.video.width = Reactor3D.videoEffectFraction(work.video.width, 0.3);
            work.video.height = Reactor3D.videoEffectFraction(work.video.height, 0.2);
        }
        const safeVideo = escape(work.video.file || this._k('r3dfx.chooseVideo'));
        // Authored text is escaped once, up front, and only the escaped
        // strings reach the markup below.
        const safeName = escape(work.name);
        const safeAnimation = escape(record && record.name ? work.animation + ': ' + record.name : this._k('r3dfx.choose'));
        const safeSound = escape(work.se && work.se.name ? work.se.name : this._k('r3dfx.noSound'));
        const buttonStyle = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;';
        form.innerHTML = `
            ${row(this._k('r3dfx.effectName'), `<input type="text" class="r3d-fx-name" value="${safeName}" style="${control}">`)}
            ${row(this._k('r3dfx.type'), `<select class="r3d-fx-type" style="${control}">
                <option value="animation"${isVideo || isLight ? '' : ' selected'}>${escape(this._k('r3dfx.typeAnimation'))}</option>
                <option value="video"${isVideo ? ' selected' : ''}>${escape(this._k('r3dfx.typeVideo'))}</option>
                <option value="light"${isLight ? ' selected' : ''}>${escape(this._k('r3dfx.typeLight'))}</option>
            </select>`)}
            ${isLight ? this._lightRowsHtml(light, work, row, control, escape)
              : isVideo ? row(this._k('r3dfx.video'), `<button type="button" class="rr-btn-secondary r3d-fx-video" style="${buttonStyle}">${safeVideo}</button>`)
                + row(this._k('r3dfx.width'), `<input type="number" class="r3d-fx-vw" min="0.01" max="4" step="0.05" value="${escape(work.video.width)}" style="${control}">
                    <span style="font-size:11px;color:var(--color-text-muted);">${escape(this._k('r3dfx.height'))}</span>
                    <input type="number" class="r3d-fx-vh" min="0.01" max="4" step="0.05" value="${escape(work.video.height)}" style="${control}">`)
                + row('', `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--color-text);"><input type="checkbox" class="r3d-fx-vloop"${work.video.loop !== false ? ' checked' : ''}> ${escape(this._k('r3dfx.loop'))}</label>
                    <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--color-text);margin-left:10px;"><input type="checkbox" class="r3d-fx-vaudio"${work.video.audio ? ' checked' : ''}> ${escape(this._k('r3dfx.audio'))}</label>`)
              : row(this._k('r3dfx.animation'), `<button type="button" class="rr-btn-secondary r3d-fx-pick" style="${buttonStyle}">${safeAnimation}</button>`)}
            ${row(this._k('r3dfx.anchor'), `<select class="r3d-fx-part" style="${control}">
                <option value="">${escape(this._k('r3dfx.origin'))}</option>
                ${choices.map(name => `<option value="${escape(name)}"${name === anchor.part ? ' selected' : ''}>${escape(name)}</option>`).join('')}
            </select>`)}
            ${row('', `<button type="button" class="rr-btn-secondary r3d-fx-place" style="flex:1;border-color:${this._tool === 'fxanchor' ? 'var(--color-accent)' : 'var(--color-border)'};">${escape(this._k('r3dfx.place'))}</button>`)}
            ${row(this._k('r3dfx.sound'), `<button type="button" class="rr-btn-secondary r3d-fx-se" style="${buttonStyle}">${safeSound}</button>
                <button type="button" class="rr-btn-secondary r3d-fx-se-clear" title="${escape(this._k('r3dfx.clearSound'))}" style="flex:0 0 auto;padding:0 8px;">&times;</button>`)}
            <div style="display:flex;gap:6px;margin:8px 0;">
                <button type="button" class="rr-btn-secondary r3d-fx-play" style="flex:1;">${escape(this._k('r3dfx.play'))}</button>
                <button type="button" class="rr-button-primary r3d-fx-save" style="flex:1;">${escape(this._k('r3dfx.save'))}</button>
            </div>`;
        const q = selector => form.querySelector(selector);
        const syncWork = () => {
            work.name = q('.r3d-fx-name').value.trim() || work.name;
            const previous = work.anchor && typeof work.anchor === 'object' ? work.anchor : { part: '', offset: [0, 0, 0] };
            const select = q('.r3d-fx-part');
            const offered = [...select.options].some(option => option.value === (previous.part || ''));
            // A part the list cannot show is not a change of part.
            const part = offered ? select.value : (previous.part || '');
            let offset = previous.offset || [0, 0, 0];
            // A different frame, the same place: the dot must not jump when
            // the anchor part changes, so the offset converts between the
            // old frame and the new one.
            if (part !== (previous.part || '') && this._object && typeof THREE !== 'undefined') {
                const from = (previous.part && this._anchorNode(previous.part)) || this._object;
                const to = (part && this._anchorNode(part)) || this._object;
                from.updateWorldMatrix(true, false);
                to.updateWorldMatrix(true, false);
                const world = from.localToWorld(new THREE.Vector3(offset[0] || 0, offset[1] || 0, offset[2] || 0));
                const local = to.worldToLocal(world);
                offset = [local.x, local.y, local.z].map(value => Math.round(value * 1000) / 1000);
            }
            work.anchor = { part, offset };
            this._syncEffectAnchorMarker();
            if (this._fxVideo) this._updateVideoPreview();
        };
        for (const selector of ['.r3d-fx-name', '.r3d-fx-part']) {
            q(selector).addEventListener('change', syncWork);
            q(selector).addEventListener('input', syncWork);
        }
        q('.r3d-fx-type').addEventListener('change', event => {
            const value = event.target.value;
            work.type = value === 'video' ? 'video' : value === 'light' ? 'light' : 'animation';
            this._stopEffectPreview();
            if (work.type === 'light') {
                this._ensureLightWork(work);
                this._fxPreviewDef = work;
                this._playLightPreview(work);
            }
            this.renderEffectForm();
            this.renderEditCard();
        });
        if (light) this._bindLightRows(form, work, light);
        q('.r3d-fx-video')?.addEventListener('click', () => this._pickEffectVideo());
        const videoField = (selector, apply) => q(selector)?.addEventListener('change', event => { apply(event.target); this._syncEffectAnchorMarker(); });
        videoField('.r3d-fx-vw', el => { work.video.width = Math.min(4, Math.max(0.01, Number(el.value) || work.video.width)); if (this._fxVideo) this._updateVideoPreview(); });
        videoField('.r3d-fx-vh', el => { work.video.height = Math.min(4, Math.max(0.01, Number(el.value) || work.video.height)); if (this._fxVideo) this._updateVideoPreview(); });
        videoField('.r3d-fx-vloop', el => { work.video.loop = el.checked; });
        videoField('.r3d-fx-vaudio', el => { work.video.audio = el.checked; });
        q('.r3d-fx-pick')?.addEventListener('click', () => {
            if (typeof AnimationPickerModal === 'undefined') return;
            AnimationPickerModal.open({
                databaseManager: this.databaseManager,
                projectManager: this.projectController,
                currentId: Number(work.animation) || 0,
                onPick: id => {
                    if (!(Number(id) > 0)) return;
                    work.animation = Number(id);
                    this.renderEffectForm();
                }
            });
        });
        q('.r3d-fx-se').addEventListener('click', () => this._pickModelEffectSe());
        q('.r3d-fx-se-clear').addEventListener('click', () => { delete work.se; this.renderEffectForm(); });
        q('.r3d-fx-place').addEventListener('click', () => this.setTool(this._tool === 'fxanchor' ? 'orbit' : 'fxanchor'));
        q('.r3d-fx-play').addEventListener('click', () => { syncWork(); this._playEffectPreview(work); });
        q('.r3d-fx-save').addEventListener('click', () => { syncWork(); this._saveEffectWork(); });
    }

    /**
     * The rows a light effect edits: kind, colour, reach and shape, aim,
     * flicker, how long a fired light stays, and its switches. Labels are
     * the Lighting panel's own, so the two read the same.
     */
    _lightRowsHtml(light, work, row, control, escape) {
        const slider = (key, label, min, max, step) => row(label,
            `<input type="range" class="r3d-fx-lrange" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${escape(light[key])}" style="flex:1;min-width:0;">
             <input type="number" class="r3d-fx-lnum" data-key="${key}" data-no-stepper min="${min}" max="${max}" step="${step}" value="${escape(light[key])}" style="flex:0 0 58px;padding:3px 4px;font-size:11px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;">`);
        const aimed = light.type !== 'point';
        const kinds = [['point', 'lit.point'], ['spot', 'lit.spot'], ['beam', 'lit.beam']];
        // The Lighting panel's tray, as a list: a candle here is the candle there.
        const presets = (typeof RRMapLights !== 'undefined' && RRMapLights.PRESETS ? RRMapLights.PRESETS : [])
            .filter(preset => !preset.template.compound);
        return row(this._k('r3dfx.lightPreset'), `<select class="r3d-fx-lpreset" style="${control}">
                <option value="">${escape(this._k('r3dfx.lightPresetNone'))}</option>
                ${presets.map(preset => `<option value="${escape(preset.key)}">${escape(this._k(preset.labelKey))}</option>`).join('')}
            </select>`)
            + row(this._k('lit.type'), `<select class="r3d-fx-lkind" style="${control}">
                ${kinds.map(([value, key]) => `<option value="${value}"${value === light.type ? ' selected' : ''}>${escape(this._k(key))}</option>`).join('')}
            </select>`)
            + row(this._k('lit.color'), `<span class="r3d-fx-lcolor" style="flex:1;min-width:0;display:flex;"></span>`)
            + slider('intensity', this._k('lit.intensity'), 0, 4, 0.05)
            + slider('radius', this._k('lit.radius'), 0.1, 60, 0.1)
            + (light.type === 'spot' ? slider('angle', this._k('lit.angle'), 1, 179, 1) : '')
            + (light.type === 'beam' ? slider('width', this._k('lit.width'), 0.005, 1, 0.005) : '')
            + (aimed ? slider('yaw', this._k('lit.yaw'), -180, 180, 1) + slider('pitch', this._k('lit.pitch'), -90, 90, 1) : '')
            + slider('flicker', this._k('lit.flicker'), 0, 1, 0.05)
            + ((work.trigger || 'action') === 'action'
                ? row(this._k('r3dfx.lightDuration'), `<input type="number" class="r3d-fx-ldur" data-no-stepper min="0" max="1000000" step="1" value="${escape(light.duration)}" style="${control}">`)
                : '')
            + row('', `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--color-text);"><input type="checkbox" class="r3d-fx-lflag" data-key="occlude"${light.occlude ? ' checked' : ''}> ${escape(this._k('lit.occlude'))}</label>
                <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--color-text);margin-left:8px;"><input type="checkbox" class="r3d-fx-lflag" data-key="shadow"${light.shadow ? ' checked' : ''}> ${escape(this._k('lit.shadow'))}</label>`)
            + row('', `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--color-text);"><input type="checkbox" class="r3d-fx-lflag" data-key="body"${light.body ? ' checked' : ''}> ${escape(this._k('r3dfx.lightBody'))}</label>`);
    }

    _bindLightRows(form, work, light) {
        const q = selector => form.querySelector(selector);
        const live = () => {
            if (!this._fxLight) { this._fxPreviewDef = work; this._playLightPreview(work); }
            this._updateLightPreview();
            this._lastInputAt = performance.now();
        };
        q('.r3d-fx-lpreset')?.addEventListener('change', event => {
            const template = typeof RRMapLights !== 'undefined' && RRMapLights.presetTemplate
                ? RRMapLights.presetTemplate(event.target.value) : null;
            if (!template) return;
            // Everything a preset says about the light itself; a map
            // placement height and a group tag are not a model light's.
            for (const key of ['type', 'color', 'radius', 'intensity', 'angle', 'width', 'pitch', 'flicker']) {
                if (template[key] !== undefined) light[key] = template[key];
            }
            light.pulse = template.pulse ? Object.assign({}, template.pulse) : null;
            if (template.flicker === undefined) light.flicker = 0;
            this._ensureLightWork(work);
            this.renderEffectForm();
            live();
            this.renderEffectList();
        });
        q('.r3d-fx-lkind')?.addEventListener('change', event => {
            light.type = event.target.value === 'spot' ? 'spot' : event.target.value === 'beam' ? 'beam' : 'point';
            this._ensureLightWork(work);
            this.renderEffectForm();
            live();
        });
        const colourHost = q('.r3d-fx-lcolor');
        if (colourHost) {
            if (typeof RRColourPopover !== 'undefined') {
                colourHost.appendChild(RRColourPopover.swatch(light.color,
                    hex => { light.color = hex; live(); },
                    hex => { light.color = hex; live(); this.renderEffectList(); }));
            } else {
                const field = document.createElement('input');
                field.type = 'text';
                field.value = light.color;
                field.style.cssText = 'flex:1;min-width:0;';
                field.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(field.value)) { light.color = field.value.toLowerCase(); live(); } });
                colourHost.appendChild(field);
            }
        }
        form.querySelectorAll('.r3d-fx-lrange').forEach(range => {
            const number = form.querySelector(`.r3d-fx-lnum[data-key="${range.dataset.key}"]`);
            range.addEventListener('input', () => {
                light[range.dataset.key] = Number(range.value);
                if (number) number.value = range.value;
                live();
                this._syncLightControls();
            });
        });
        form.querySelectorAll('.r3d-fx-lnum').forEach(number => number.addEventListener('change', () => {
            const value = Number(number.value);
            if (!Number.isFinite(value)) return;
            light[number.dataset.key] = Math.min(Number(number.max), Math.max(Number(number.min), value));
            const range = form.querySelector(`.r3d-fx-lrange[data-key="${number.dataset.key}"]`);
            if (range) range.value = String(light[number.dataset.key]);
            number.value = String(light[number.dataset.key]);
            live();
        }));
        q('.r3d-fx-ldur')?.addEventListener('change', event => {
            light.duration = Math.max(0, Math.floor(Number(event.target.value) || 0));
            event.target.value = String(light.duration);
        });
        form.querySelectorAll('.r3d-fx-lflag').forEach(box => box.addEventListener('change', () => {
            light[box.dataset.key] = box.checked;
            live();
        }));
    }

    /**
     * The light's body in the preview scene at its anchor: the sphere, cone
     * or beam the game draws, in the effect's colour. The preview's
     * materials are not the game's lit materials, so the body is what shows
     * — the pool on the model is the game's to draw.
     */
    _playLightPreview(raw) {
        if (typeof THREE === 'undefined' || !this._scene || !this._object || !raw || raw.type !== 'light') return;
        if (this._fxLight && this._fxLight.raw !== raw) this._stopLightPreview();
        if (!this._fxLight) {
            const group = new THREE.Group();
            group.name = 'effect-light-preview';
            const material = typeof Reactor3D !== 'undefined' && Reactor3D.lightBodyMaterial
                ? Reactor3D.lightBodyMaterial()
                : new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
            const geometryFor = kind => {
                if (typeof Reactor3D !== 'undefined') {
                    if (kind === 'spot' && Reactor3D.coneBodyGeometry) return Reactor3D.coneBodyGeometry();
                    if (kind === 'beam' && Reactor3D.beamBodyGeometry) return Reactor3D.beamBodyGeometry();
                    if (kind === 'point' && Reactor3D.sphereBodyGeometry) return Reactor3D.sphereBodyGeometry();
                }
                if (kind === 'spot') { const cone = new THREE.ConeGeometry(1, 1, 24, 1, true); cone.translate(0, -0.5, 0); return cone; }
                if (kind === 'beam') { const tube = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); tube.translate(0, -0.5, 0); return tube; }
                return new THREE.SphereGeometry(1, 20, 14);
            };
            const bodies = {};
            const beamMaterial = typeof Reactor3D !== 'undefined' && Reactor3D.beamBodyMaterial ? Reactor3D.beamBodyMaterial() : material;
            for (const kind of ['point', 'spot', 'beam']) {
                const mesh = new THREE.Mesh(geometryFor(kind), kind === 'beam' ? beamMaterial : material);
                mesh.visible = false;
                mesh.renderOrder = 12;
                mesh.userData.__reactorOverlay = true;
                group.add(mesh);
                bodies[kind] = mesh;
            }
            // The source's bright core is the runtime's: a soft additive dot,
            // not a solid ball.
            const core = new THREE.Sprite(new THREE.SpriteMaterial({
                map: typeof Reactor3D !== 'undefined' && Reactor3D.roundLightTexture ? Reactor3D.roundLightTexture() : null,
                color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
            }));
            core.renderOrder = 13;
            core.userData.__reactorOverlay = true;
            group.add(core);
            this._scene.add(group);
            this._fxLight = { raw, group, bodies, core, material, beamMaterial, shared: !!(typeof Reactor3D !== 'undefined' && Reactor3D.sphereBodyGeometry) };
            this._lightPreviewLit(true);
        }
        this._fxLight.raw = raw;
        this._updateLightPreview();
        this._lastInputAt = performance.now();
    }

    _updateLightPreview() {
        const live = this._fxLight;
        if (!live || !this._object || typeof Reactor3D === 'undefined' || !Reactor3D.effectLight) return;
        const def = this._effectDef(live.raw) || live.raw;
        const light = def && def.light ? Reactor3D.effectLight(this._object, def, 'preview') : null;
        if (!light) { live.group.visible = false; this._hideLightGizmo(); return; }
        // Keep editing handles steady while the body and surface lighting use
        // the same time-based flicker/pulse as native and model lights in-game.
        this._syncLightGizmo(light);
        const animated = Reactor3D.animateLight(def.light, this._simFrame || 0, 0, light.radius, light.intensity);
        light.radius = animated.radius;
        light.intensity = animated.intensity;
        live.group.visible = true;
        const x = light.x + 0.5, y = light.height, z = light.y + 1;
        const colour = new THREE.Color(light.colour);
        const strength = Math.min(1, 0.6 * light.intensity);
        for (const material of [live.material, live.beamMaterial]) {
            if (!material) continue;
            if (material.uniforms) {
                material.uniforms.colour.value.copy(colour);
                material.uniforms.strength.value = strength;
            } else {
                material.color.copy(colour);
            }
        }
        for (const kind of Object.keys(live.bodies)) live.bodies[kind].visible = kind === light.type;
        const body = live.bodies[light.type];
        body.position.set(x, y, z);
        if (light.type === 'point') {
            const haze = light.radius * 0.45;
            body.scale.set(haze, haze, haze);
            body.quaternion.identity();
        } else {
            const yaw = (light.yaw * Math.PI) / 180;
            const pitch = (light.pitch * Math.PI) / 180;
            const aim = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
            body.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim);
            if (light.type === 'spot') {
                const spread = Math.tan((Math.min(light.angle, 178) * Math.PI) / 360) * light.radius;
                body.scale.set(spread, light.radius, spread);
            } else {
                body.scale.set(light.width * 0.5, light.radius, light.width * 0.5);
            }
        }
        live.core.position.set(x, y, z);
        const coreSize = light.type === 'beam' ? Math.max(light.width * 2, 0.06) * 0.5 : Math.min(light.radius, 0.7) * 0.5;
        live.core.scale.set(coreSize, coreSize, 1);
        live.core.material.color.copy(colour);
        live.core.material.opacity = Math.min(1, Reactor3D.VOLUME_GLOW * light.intensity);
        live.core.visible = light.body !== false;
        for (const kind of Object.keys(live.bodies)) if (light.body === false) live.bodies[kind].visible = false;
        // A beam lands on the model when it is aimed at it: the body stops
        // there, a dot sits there, and a small light lights the spot.
        const packed = [light];
        const landed = light.type === 'beam' ? this._beamLanding(live, light, x, y, z) : null;
        if (landed) {
            body.scale.y = landed.distance;
            if (!live.dot) {
                live.dot = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: Reactor3D.roundLightTexture ? Reactor3D.roundLightTexture() : null,
                    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true
                }));
                live.dot.renderOrder = 14;
                live.dot.userData.__reactorOverlay = true;
                live.group.add(live.dot);
            }
            live.dot.visible = light.body !== false;
            live.dot.position.copy(landed.point).addScaledVector(landed.aim, -0.03);
            const dotSize = Math.max(light.width * Reactor3D.BEAM_DOT_SIZE, 0.12);
            live.dot.scale.set(dotSize, dotSize, 1);
            live.dot.material.color.copy(colour);
            live.dot.material.opacity = Math.min(1, Reactor3D.VOLUME_GLOW * 1.8 * light.intensity);
            packed[0] = Object.assign({}, light, { radius: landed.distance });
            packed.push({
                type: 'point', x: landed.point.x - 0.5, y: landed.point.z - 1, height: landed.point.y, groundY: 0,
                radius: Math.max(light.width * Reactor3D.BEAM_DOT_REACH, 0.3), colour: light.colour,
                intensity: light.intensity * Reactor3D.BEAM_DOT_GAIN
            });
        } else if (live.dot) {
            live.dot.visible = false;
        }
        // The model itself takes the light through the game's own shader.
        if (Reactor3D.packLightUniforms) {
            Reactor3D.packLightUniforms(packed, { intensity: this.LIGHT_PREVIEW_AMBIENT, colour: 0xffffff }, this._previewLighting);
        }
    }

    /**
     * Where a previewed beam lands on the model, or null. Kept cheap for a
     * weak machine: rigid meshes are ray-tested for real, a skinned mesh
     * only by its bounds (three tests a skinned mesh triangle by triangle
     * with the skinning applied, which is what made the preview stutter),
     * a mesh the beam starts inside never stops its own beam, and a cast
     * runs at most a few times a second while the beam is moving — the
     * last answer holds in between. The beam's own source sits on the
     * model, so hits within a few centimetres of it are its own skin.
     */
    _beamLanding(live, light, x, y, z) {
        if (!this._object || typeof THREE === 'undefined') return null;
        const key = [x, y, z, light.yaw, light.pitch, light.radius].map(v => Math.round(v * 100) / 100).join(',');
        const now = performance.now();
        if (live.landing && (live.landing.key === key || now - live.landing.at < this.BEAM_LANDING_INTERVAL)) {
            return live.landing.value;
        }
        const yaw = (light.yaw * Math.PI) / 180;
        const pitch = (light.pitch * Math.PI) / 180;
        const aim = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
        const origin = new THREE.Vector3(x, y, z);
        if (!live.targets || live.targetsFor !== this._object) {
            const rigid = [];
            const skinned = [];
            this._object.traverse(node => {
                if (!node.isMesh || (node.userData && node.userData.__reactorOverlay)) return;
                (node.isSkinnedMesh ? skinned : rigid).push(node);
            });
            live.targets = { rigid, skinned };
            live.targetsFor = this._object;
        }
        let best = null;
        if (live.targets.rigid.length) {
            const caster = live.caster || (live.caster = new THREE.Raycaster());
            caster.set(origin, aim);
            caster.near = 0.05;
            caster.far = light.radius;
            const hit = caster.intersectObjects(live.targets.rigid, false)[0];
            if (hit) best = { distance: hit.distance, point: hit.point.clone(), aim };
        }
        if (live.targets.skinned.length) {
            const ray = live.ray || (live.ray = new THREE.Ray());
            const box = live.box || (live.box = new THREE.Box3());
            const point = new THREE.Vector3();
            ray.set(origin, aim);
            for (const mesh of live.targets.skinned) {
                // Posed bounds from the bones, not the vertices: a rig's
                // cached box is whatever the loader left, a walk moves it,
                // and re-skinning sixty thousand vertices to find out costs
                // twenty milliseconds — two dozen bone positions cost none.
                this._skinnedBounds(mesh, box);
                if (box.isEmpty() || box.containsPoint(origin) || !ray.intersectBox(box, point)) continue;
                const distance = point.distanceTo(origin);
                if (distance > 0.05 && distance < light.radius && (!best || distance < best.distance)) {
                    best = { distance, point: point.clone(), aim };
                }
            }
        }
        live.landing = { key, value: best, at: now };
        return best;
    }

    /** How often a moving beam re-asks where it lands, in milliseconds. */
    get BEAM_LANDING_INTERVAL() { return 150; }

    /** A skinned mesh's posed bounds, in world space, from where its bones are. */
    _skinnedBounds(mesh, box) {
        box.makeEmpty();
        const bones = mesh.skeleton ? mesh.skeleton.bones : null;
        if (!bones || !bones.length) return box.setFromObject(mesh);
        const at = this._boneScratch || (this._boneScratch = new THREE.Vector3());
        for (const bone of bones) {
            if (!bone) continue;
            box.expandByPoint(bone.getWorldPosition(at));
        }
        // Flesh stands off its bones by about this much on a character.
        return box.expandByScalar(0.25);
    }

    /** The placed model's span in the preview's own units, for gizmo sizes. */
    _previewSpan() {
        if (!this._object || typeof THREE === 'undefined') return 1.8;
        if (this._previewSpanFor === this._object && this._previewSpanValue) return this._previewSpanValue;
        const size = new THREE.Box3().setFromObject(this._object).getSize(new THREE.Vector3());
        this._previewSpanFor = this._object;
        this._previewSpanValue = Math.max(size.x, size.y, size.z, 0.2);
        return this._previewSpanValue;
    }

    /**
     * The gizmo a prop wears, on the light: arrows slide the anchor along
     * X, Y and Z, the green ring turns the aim and the red ring tilts it.
     * A point light has no aim and wears the arrows alone; nothing rolls.
     * The rings show the aim as it is in the world — the anchor's own turn
     * included — and a drag applies its change to the light's own yaw and
     * pitch, so a light on a turned part turns from where it points.
     */
    _syncLightGizmo(light) {
        if (typeof RRPoseRings3D === 'undefined' || typeof RRAxisArrows3D === 'undefined' || typeof THREE === 'undefined' || !this._scene) return;
        const work = this._effectWork;
        if (!light || this._cardMode !== 'effect' || !work || work.type !== 'light') {
            this._hideLightGizmo();
            return;
        }
        if (!this._fxGizmo) {
            const span = this._previewSpan();
            const rings = RRPoseRings3D.create(THREE, Math.max(0.12, span * 0.2), 'fx-light-rings');
            rings.roll.group.visible = false;
            const arrows = RRAxisArrows3D.create(THREE, Math.max(0.16, span * 0.28), 'fx-light-arrows');
            for (const root of [rings.root, arrows.root]) root.traverse(node => { node.userData.__reactorOverlay = true; });
            this._scene.add(rings.root);
            this._scene.add(arrows.root);
            this._fxGizmo = { rings, arrows };
        }
        const gizmo = this._fxGizmo;
        gizmo.light = light;
        const at = { x: light.x + 0.5, y: light.height, z: light.y + 1 };
        RRPoseRings3D.sync(gizmo.rings, at, light.yaw, -light.pitch, light.type !== 'point');
        RRAxisArrows3D.sync(gizmo.arrows, at, true);
    }

    _hideLightGizmo() {
        if (!this._fxGizmo) return;
        this._fxGizmo.rings.root.visible = false;
        this._fxGizmo.arrows.root.visible = false;
        this._fxGizmo.light = null;
    }

    _disposeLightGizmo() {
        if (!this._fxGizmo) return;
        if (typeof RRPoseRings3D !== 'undefined') RRPoseRings3D.dispose(this._fxGizmo.rings);
        if (typeof RRAxisArrows3D !== 'undefined') RRAxisArrows3D.dispose(this._fxGizmo.arrows);
        this._fxGizmo = null;
        this._fxGizmoHold = null;
    }

    /** An arrow or ring of the light under the pointer, as a hold, or null. */
    _pickLightGizmo(clientX, clientY) {
        const gizmo = this._fxGizmo;
        const work = this._effectWork;
        if (!gizmo || !gizmo.light || !work || !this._camera || !this._object) return null;
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        if (gizmo.arrows.root.visible) {
            const arrow = RRAxisArrows3D.pick(THREE, gizmo.arrows, this._camera, rect, clientX, clientY);
            if (arrow) {
                RRAxisArrows3D.emphasize(gizmo.arrows, arrow.axis, true);
                const start = Reactor3D.effectAnchorWorld(this._object, this._effectDef(work) || work, new THREE.Vector3());
                return { kind: 'arrow', grab: arrow, start };
            }
        }
        if (gizmo.rings.root.visible) {
            const ring = RRPoseRings3D.pick(THREE, gizmo.rings, this._camera, rect, clientX, clientY,
                { yaw: gizmo.light.yaw, pitch: -gizmo.light.pitch, roll: 0 });
            if (ring) {
                RRPoseRings3D.emphasize(gizmo.rings, ring.axis, true);
                const light = this._ensureLightWork(work);
                return { kind: 'ring', grab: ring, startYaw: light.yaw, startPitch: light.pitch };
            }
        }
        return null;
    }

    _dragLightGizmo(hold, clientX, clientY) {
        const work = this._effectWork;
        if (!hold || !work || !this._object || !this._camera) return;
        if (hold.kind === 'arrow') {
            const travel = hold.grab.travel(clientX, clientY);
            const dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[hold.grab.axis];
            const world = hold.start.clone().add(new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(travel));
            // The offset lives in the anchor's own frame, as Place writes it.
            if (!work.anchor) work.anchor = { part: '', offset: [0, 0, 0] };
            const frame = (work.anchor.part && this._anchorNode(work.anchor.part)) || this._object;
            frame.updateWorldMatrix(true, false);
            const local = frame.worldToLocal(world);
            work.anchor.offset = [local.x, local.y, local.z].map(value => Math.round(value * 1000) / 1000);
        } else {
            const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
            const value = RRPoseRings3D.drag(THREE, hold.grab, this._camera, rect, clientX, clientY);
            if (value === null) return;
            const light = this._ensureLightWork(work);
            const delta = value - hold.grab.startValue;
            if (hold.grab.axis === 'yaw') {
                let yaw = hold.startYaw + delta;
                while (yaw > 180) yaw -= 360;
                while (yaw < -180) yaw += 360;
                light.yaw = Math.round(yaw);
            } else {
                light.pitch = Math.max(-90, Math.min(90, Math.round(hold.startPitch - delta)));
            }
        }
        this._afterLightEdit(false);
    }

    _endLightGizmoDrag() {
        if (this._fxGizmo) {
            RRPoseRings3D.emphasize(this._fxGizmo.rings, null, false);
            RRAxisArrows3D.emphasize(this._fxGizmo.arrows, null, false);
        }
        this._fxGizmoHold = null;
        this._afterLightEdit(true);
    }

    /**
     * After any edit of the light — gizmo, card or form: the marker, the
     * preview and the gizmo follow at once, and the other controls show the
     * new numbers without being rebuilt under a drag. A final edit rebuilds
     * everything so the ranges and the list catch up.
     */
    _afterLightEdit(final) {
        this._syncEffectAnchorMarker();
        this._updateEffectPreview();
        this._syncLightControls();
        this._lastInputAt = performance.now();
        if (final) {
            this.renderEditCard();
            this.renderEffectForm();
            this.renderEffectList();
        }
    }

    /** The work light's numbers into every slider and field that shows them. */
    _syncLightControls() {
        const work = this._effectWork;
        const root = this._detail;
        if (!work || !root) return;
        const light = work.light || {};
        const set = (element, value) => { if (element && document.activeElement !== element) element.value = String(value); };
        const shown = (key, value) => (key === 'yaw' || key === 'pitch' || key === 'angle') ? Math.round(value) + '°' : Number(value).toFixed(2);
        root.querySelectorAll('.r3d-fx-lrange, .r3d-fx-lnum').forEach(element => {
            if (light[element.dataset.key] !== undefined) set(element, light[element.dataset.key]);
        });
        root.querySelectorAll('.r3d-fxcard-lslider').forEach(slider => {
            const key = slider.dataset.key;
            if (light[key] === undefined) return;
            set(slider, light[key]);
            const readout = root.querySelector(`.r3d-fxcard-lslider-val[data-key="${key}"]`);
            if (readout) readout.textContent = shown(key, light[key]);
        });
        const offset = work.anchor && Array.isArray(work.anchor.offset) ? work.anchor.offset : [0, 0, 0];
        const span = this._modelSpan();
        root.querySelectorAll('.r3d-fxcard-slider').forEach(slider => {
            if (this._fxTab !== 'offset') return;
            const i = Number(slider.dataset.i);
            set(slider, offset[i] || 0);
            const readout = root.querySelector(`.r3d-fxcard-slider-val[data-i="${i}"]`);
            if (readout) readout.textContent = Number(offset[i] || 0).toFixed(span >= 10 ? 1 : 3);
        });
    }

    /** The card's Rotate and Light tabs for a light effect: its aim, then its reach. */
    _lightCardSlidersHtml(work, tab) {
        const light = this._ensureLightWork(work);
        const aimed = light.type !== 'point';
        const rows = tab === 'rotate'
            ? [{ key: 'yaw', label: this._k('lit.yaw'), min: -180, max: 180, step: 1, enabled: aimed },
               { key: 'pitch', label: this._k('lit.pitch'), min: -90, max: 90, step: 1, enabled: aimed }]
            : [{ key: 'radius', label: this._k('lit.radius'), min: 0.1, max: 30, step: 0.1, enabled: true },
               { key: 'intensity', label: this._k('lit.intensity'), min: 0, max: 4, step: 0.05, enabled: true }]
                .concat(light.type === 'spot' ? [{ key: 'angle', label: this._k('lit.angle'), min: 1, max: 179, step: 1, enabled: true }]
                    : light.type === 'beam' ? [{ key: 'width', label: this._k('lit.width'), min: 0.005, max: 1, step: 0.005, enabled: true }] : []);
        const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const shown = (key, value) => (key === 'yaw' || key === 'pitch' || key === 'angle') ? Math.round(value) + '°' : Number(value).toFixed(2);
        return rows.map(row => `
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;${row.enabled ? '' : 'opacity:0.45;'}">
                <span style="flex:0 0 74px;font-size:11px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escape(row.label)}</span>
                <input type="range" class="r3d-fxcard-lslider" data-key="${row.key}" min="${row.min}" max="${row.max}" step="${row.step}"
                    value="${escape(light[row.key])}"${row.enabled ? '' : ' disabled'} style="flex:1;min-width:0;accent-color:var(--color-accent);" title="${this._t('Double-click to reset')}">
                <span class="r3d-fxcard-lslider-val" data-key="${row.key}" style="flex:0 0 48px;text-align:right;font-size:11px;color:var(--color-text);">${shown(row.key, light[row.key])}</span>
            </div>`).join('')
            + (tab === 'rotate' && !aimed ? `<div style="font-size:11px;color:var(--color-text-muted);margin:2px 0 4px;">${escape(this._k('lit.point'))}</div>` : '');
    }

    /** Dim only while explicitly editing a light; normal model inspection stays bright. */
    get LIGHT_PREVIEW_AMBIENT() {
        const effect = this._effectWork || this.rawEffects?.[this.selectedEffect];
        return this._cardMode === 'effect' && effect?.type === 'light' ? 0.35 : 1;
    }

    /** Effect lights use the inspection model's field, leaving map uniforms untouched. */
    _lightPreviewLit(on) {
        if (typeof Reactor3D === 'undefined' || !this._object) return;
        if (on && Reactor3D.litMaterial) {
            this._object.traverse(node => {
                if (!node.isMesh || node.userData.__reactorOverlay) return;
                for (const material of [node.material].flat().filter(Boolean)) {
                    if (material.__reactorLit) continue;
                    Reactor3D.litMaterial(material);
                    material.needsUpdate = true;
                }
            });
        }
        this._previewLighting = ModelPreview3D.isolateLighting(this._object, this._previewLighting);
        if (!on) {
            this._previewLighting.rrAmbient.value.set([1, 1, 1]);
            this._previewLighting.rrLightCount.value = 0;
        }
    }

    _stopLightPreview() {
        const live = this._fxLight;
        if (!live) return;
        live.group.parent?.remove(live.group);
        for (const kind of Object.keys(live.bodies)) {
            // Shared runtime geometry stays; only the fallback shapes are ours.
            if (!live.shared) live.bodies[kind].geometry.dispose();
        }
        live.core.material.dispose();
        live.material.dispose();
        if (live.dot) live.dot.material.dispose();
        if (live.beamMaterial && live.beamMaterial !== live.material) live.beamMaterial.dispose();
        this._fxLight = null;
        this._disposeLightGizmo();
        this._lightPreviewLit(false);
    }

    /** Choose the video from the project's movies folder. */
    _pickEffectVideo() {
        const work = this._effectWork;
        if (!work) return;
        const lister = typeof MediaSurfaceEditor !== 'undefined'
            ? new MediaSurfaceEditor(this.databaseManager, this.projectController) : null;
        const files = lister
            ? (lister.mediaFiles ? lister.mediaFiles(this._project()) : lister.movieFiles(this._project()))
            : [];
        const picker = window.reactor?.databaseEditorUI;
        const names = files.map(file => file.relativePath);
        if (!names.length) {
            alert(this._k('r3dfx.noVideos'));
            return;
        }
        if (picker && typeof picker.showImagePicker === 'function') {
            // A real URL per file so the picker can actually play the movie
            // in its preview pane; an empty path drew a dead <img> before.
            const path = require('path');
            const urlFor = name => {
                const file = files.find(entry => entry.relativePath === name);
                const isImage = /\.(?:png|jpe?g|webp)$/i.test(String(name || ''));
                const absolute = file ? file.absolutePath
                    : path.join(this._project().path,
                        isImage ? path.join('img', 'pictures') : 'movies', name);
                return typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl
                    ? RRAssetFiles.toUrl(absolute) : 'file://' + absolute;
            };
            picker.showImagePicker(this._k('r3dfx.video'), names, name => {
                if (!name) return;
                work.video.file = name;
                this._stopEffectPreview();
                this._playEffectPreview(work);
                this.renderEffectForm();
            }, urlFor, work.video.file || undefined,
            {
                allowNone: false,
                mediaType: 'video',
                // "Select This Image" would be a lie on a movie file.
                selectButtonLabel: this._k('r3dfx.chooseVideo')
            });
            return;
        }
        const chosen = prompt(this._k('r3dfx.video'), work.video.file || names[0]);
        if (chosen && names.indexOf(chosen) >= 0) {
            work.video.file = chosen;
            this._playEffectPreview(work);
            this.renderEffectForm();
        }
    }

    /**
     * A video effect previews as a plane on the anchor showing the movie,
     * turned and sized as the game will place it: width and height are
     * pixels, a tile being 48 of them, the same rule the surfaces use.
     */
    _playVideoPreview(raw) {
        if (typeof THREE === 'undefined' || !this._scene || !this._object || !raw.video || !raw.video.file) return;
        this._stopVideoPreview();
        const path = require('path');
        const isImage = /\.(?:png|jpe?g|webp)$/i.test(raw.video.file);
        const mediaPath = path.join(this._project().path,
            isImage ? path.join('img', 'pictures') : 'movies', raw.video.file);
        const url = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl
            ? RRAssetFiles.toUrl(mediaPath) : 'file://' + mediaPath;
        let video;
        let texture;
        if (isImage) {
            // A still on the plane: same placement, no playback machinery.
            video = new Image();
            texture = new THREE.Texture();
            video.onload = () => { if(this._fxVideo?.texture!==texture)return;texture.image = video; texture.needsUpdate = true;this._lastInputAt=performance.now(); };
            video.src = url;
        } else {
            video = document.createElement('video');
            video.muted = !raw.video.audio;
            video.loop = raw.video.loop !== false;
            video.playsInline = true;
            video.src = url;
            texture = new THREE.VideoTexture(video);
        }
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
        mesh.userData.__reactorOverlay = true;
        mesh.renderOrder = 20;
        // A child of the model, in the model's units, so it scales with it.
        this._object.add(mesh);
        this._fxVideo = { mesh, video, texture, raw, file:raw.video.file };
        if(!isImage)video.play().catch(() => {});
        this._lastInputAt=performance.now();
        this._updateVideoPreview();
    }

    _stopVideoPreview() {
        const live = this._fxVideo;
        if (!live) return;
        live.video.onload=null;live.video.onerror=null;
        try { live.video.pause?.(); live.video.src = ''; } catch (_) {}
        live.mesh.parent?.remove(live.mesh);
        live.mesh.geometry.dispose();
        live.mesh.material.dispose();
        live.texture.dispose();
        this._fxVideo = null;
    }

    _updateVideoPreview() {
        const live = this._fxVideo;
        if (!live || !this._object) return;
        const def = this._effectDef(live.raw) || live.raw;
        const world = Reactor3D.effectAnchorWorld(this._object, def, new THREE.Vector3());
        if (!world) return;
        if (live.mesh.parent !== this._object) this._object.add(live.mesh);
        live.mesh.position.copy(this._object.worldToLocal(world));
        const axes = Reactor3D.scaleAxes ? Reactor3D.scaleAxes(def.scale) : [1, 1, 1];
        const native = Reactor3D.videoEffectSize(def, this._template && this._template.userData.glbSize);
        live.mesh.scale.set(native[0] * axes[0], native[1] * axes[1], 1);
        const rotate = def.rotate || [0, 0, 0];
        live.mesh.rotation.set(rotate[0] * Math.PI / 180, rotate[1] * Math.PI / 180, rotate[2] * Math.PI / 180, 'YXZ');
        // Anchored to a posed part, the movie turns with the part.
        if (Reactor3D.effectAnchorQuaternion) {
            const pose = Reactor3D.effectAnchorQuaternion(this._object, def, new THREE.Quaternion());
            if (pose.w !== 1) {
                const objectQuat = this._object.getWorldQuaternion(new THREE.Quaternion());
                live.mesh.quaternion.premultiply(objectQuat.clone().invert().multiply(pose).multiply(objectQuat));
            }
        }
        this._lastInputAt = performance.now();
    }

    _pickModelEffectSe() {
        const work = this._effectWork;
        if (!work || typeof RRAudioPickerModal === 'undefined' || typeof RRAssetFiles === 'undefined') return;
        const path = require('path');
        const folder = path.join(this._project().path, 'audio', 'se');
        const current = work.se || { name: '', volume: 90, pitch: 100, pan: 0 };
        RRAudioPickerModal.open({
            title: this._k('r3dfx.sound'),
            folderLabel: 'SE',
            files: RRAssetFiles.listUnique(folder, RRAssetFiles.AUDIO_EXTENSIONS),
            selected: current.name,
            levels: { volume: current.volume, pitch: current.pitch, pan: current.pan },
            loopDefault: false,
            zIndex: 22000,
            onOk: result => {
                work.se = { name: result.name, volume: result.volume, pitch: result.pitch, pan: result.pan };
                this.renderEffectForm();
            }
        });
    }

    /** Click on the model: the hit point becomes the anchor's offset, in the anchor part's space. */
    _placeEffectAnchor(event) {
        const work = this._effectWork;
        if (!work || !this._object || typeof THREE === 'undefined') return;
        const hits = this._raycastPointer(event.clientX, event.clientY) || [];
        const hit = hits.find(entry => !(entry.object.userData && entry.object.userData.__reactorOverlay));
        if (!hit) return;
        // The click BINDS the anchor: land it on a carved part (or a bone)
        // and the effect belongs to that part from then on — a video placed
        // on a screen rides the screen when the arm carrying it swings.
        // Leaving the binding to a dropdown nobody knew about left every
        // anchor on the model origin, where nothing ever tracks.
        let partName = '';
        if (hit.object.isSkinnedMesh && hit.face) {
            partName = this._dominantBoneName(hit.object, hit.face) || '';
        } else if (hit.object.userData.parts && hit.object.userData.parts.length) {
            partName = hit.object.userData.parts[0].name;
        }
        const frame = (partName && this._anchorNode(partName)) || this._object;
        frame.updateWorldMatrix(true, false);
        const local = frame.worldToLocal(hit.point.clone());
        work.anchor = { part: frame === this._object ? '' : partName, offset: [local.x, local.y, local.z].map(value => Math.round(value * 1000) / 1000) };
        this.renderEffectForm();
        this._syncEffectAnchorMarker();
        this.renderEditCard();
    }

    /** Whether the pointer is on a marker sphere, in screen pixels. */
    _pointerNearMarker(marker, clientX, clientY) {
        if (!marker || !marker.visible || !this._camera) return false;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const at = marker.position.clone().project(this._camera);
        const sx = rect.left + (at.x * 0.5 + 0.5) * rect.width;
        const sy = rect.top + (-at.y * 0.5 + 0.5) * rect.height;
        return Math.hypot(clientX - sx, clientY - sy) < 20;
    }

    /** After dragging the anchor marker: its new place, in the anchor's frame. */
    /** The node an anchor part name means, through the runtime's carve-aware lookup. */
    _anchorNode(name) {
        if (!name || !this._object) return null;
        return typeof Reactor3D !== 'undefined' && Reactor3D.effectAnchorNode
            ? Reactor3D.effectAnchorNode(this._object, name)
            : this._object.getObjectByName(name);
    }

    /**
     * An effect saved before anchors bound to parts (anchor.part '') is
     * quietly rebound to the part whose piece contains its point, most
     * specific first — the screen claims the video that sits on it, and
     * from then on the video rides the screen's pose. No part contains
     * the point: it stays on the origin, as authored.
     */
    _healAnchorBinding(work) {
        if (!work || !this._object || typeof THREE === 'undefined') return;
        const anchor = work.anchor && typeof work.anchor === 'object' ? work.anchor : null;
        if (!anchor || anchor.part || !Array.isArray(anchor.offset)) return;
        if (!this.customParts.length) return;
        this._object.updateWorldMatrix(true, true);
        const world = this._object.localToWorld(new THREE.Vector3(anchor.offset[0] || 0, anchor.offset[1] || 0, anchor.offset[2] || 0));
        const span = this._modelSpan() * (this._scale || 1);
        let best = null;
        this._object.traverse(node => {
            if (!node.isMesh || !node.userData.parts || !node.userData.parts.length) return;
            const box = new THREE.Box3().setFromObject(node).expandByScalar(span * 0.02);
            if (!box.containsPoint(world)) return;
            const size = box.getSize(new THREE.Vector3());
            const volume = size.x * size.y * size.z;
            if (!best || volume < best.volume) best = { node, volume };
        });
        if (!best) return;
        const name = best.node.userData.parts[0].name;
        const frame = this._anchorNode(name) || best.node;
        frame.updateWorldMatrix(true, false);
        const local = frame.worldToLocal(world);
        work.anchor = { part: name, offset: [local.x, local.y, local.z].map(value => Math.round(value * 1000) / 1000) };
    }

    /** Rebind every origin-anchored effect to the part that now contains it. */
    _healAllAnchorBindings() {
        let changed = false;
        for (const raw of this.rawEffects) {
            const before = raw && raw.anchor ? raw.anchor.part : null;
            this._healAnchorBinding(raw);
            if (raw && raw.anchor && raw.anchor.part !== before) changed = true;
        }
        if (this._effectWork) this._healAnchorBinding(this._effectWork);
        if (changed) {
            this.saveRules();
            this.renderEffectList();
            this.renderEffectForm();
        }
    }

    _commitAnchorFromMarker() {
        const work = this._effectWork;
        if (!work || !this._fxMarker || !this._object) return;
        const anchor = work.anchor && typeof work.anchor === 'object' ? work.anchor : { part: '', offset: [0, 0, 0] };
        const frame = (anchor.part && this._anchorNode(anchor.part)) || this._object;
        frame.updateWorldMatrix(true, false);
        const local = frame.worldToLocal(this._fxMarker.position.clone());
        work.anchor = { part: anchor.part || '', offset: [local.x, local.y, local.z].map(value => Math.round(value * 1000) / 1000) };
        this.renderEffectForm();
        this.renderEditCard();
        if (this._fxPreview && this._fxPreview.active) this._updateEffectPreview();
    }

    _effectMarker() {
        if (this._fxMarker || typeof THREE === 'undefined' || !this._scene) return this._fxMarker;
        // Sized from the placed model, not its native units: a model built
        // at a hundred units a side is scaled to a couple of tiles here.
        let span = 1.8;
        if (this._object) {
            const box = new THREE.Box3().setFromObject(this._object);
            const size = box.getSize(new THREE.Vector3());
            if (size.length() > 0) span = Math.max(size.x, size.y, size.z);
        }
        const radius = Math.max(0.01, span * 0.02);
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0xff7ad9, depthTest: false, transparent: true, opacity: 0.9 }));
        marker.renderOrder = 31;
        marker.userData.__reactorOverlay = true;
        marker.name = 'effect-anchor';
        this._scene.add(marker);
        this._fxMarker = marker;
        return marker;
    }

    _syncEffectAnchorMarker() {
        const work = this._effectWork;
        if (!work || !this._object || typeof Reactor3D === 'undefined' || !Reactor3D.effectAnchorWorld) {
            if (this._fxMarker) this._fxMarker.visible = false;
            return;
        }
        const marker = this._effectMarker();
        if (!marker) return;
        const world = Reactor3D.effectAnchorWorld(this._object, this._effectDef(work) || work, marker.position);
        marker.visible = !!world;
    }

    _effectPreviewLayer() {
        if (this._fxPreview) return this._fxPreview;
        if (typeof RRAnimationPreviewLayer === 'undefined' || !this._detail) return null;
        const wrap = this._detail.querySelector('.r3d-canvas-wrap');
        if (!wrap) return null;
        this._fxPreview = new RRAnimationPreviewLayer(wrap);
        return this._fxPreview;
    }

    /** Play an effect's database animation (and sound) over the viewport at its anchor. */
    _playEffectPreview(raw) {
        if (!this._object) return;
        if (raw && raw.type === 'light') {
            if (raw.se && raw.se.name) this._fireEffectPreview({ se: raw.se });
            this._stopVideoPreview();
            this._fxPreviewDef = raw;
            this._playLightPreview(raw);
            return;
        }
        if (raw && raw.type === 'video') {
            if (raw.se && raw.se.name) this._fireEffectPreview({ se: raw.se });
            this._fxPreviewDef = raw;
            this._playVideoPreview(raw);
            return;
        }
        this._stopVideoPreview();
        const layer = this._effectPreviewLayer();
        const animations = this.databaseManager?.data?.animations || [];
        const record = animations[Number(raw && raw.animation)];
        if (raw && raw.se && raw.se.name) this._fireEffectPreview({ se: raw.se });
        if (!layer || !record) return;
        // The live object, not a snapshot: placing the anchor or sliding
        // the card moves the playing preview at once.
        this._fxPreviewDef = raw;
        this._fxPreviewRecord = record;
        this._lastInputAt = performance.now();
        // An Effekseer effect is drawn from the preview's own camera onto a
        // quad standing at its anchor, at the view's resolution - the flat
        // overlay was a 1024-pixel square stretched to whatever the zoom
        // asked for, so it blurred, and past its largest size it could no
        // longer follow the anchor. A sprite-sheet animation keeps the overlay.
        if (record.effectName && this._scene && Reactor3D.EffekseerScene && Reactor3D.EffekseerScene.quadFor) {
            this._ensureEffectQuad(layer);
            layer.setWorld({ renderer: this._renderer, projection: this._camera.projectionMatrix.elements, view: this._camera.matrixWorldInverse.elements,
                position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] });
        } else {
            if (this._fxQuad) this._fxQuad.mesh.visible = false;
            layer.setWorld(null);
        }
        layer.play(record, this._project().path, { loop: !!raw.loop || (raw.trigger && raw.trigger !== 'action'), transform: { rotate: raw.rotate || [0, 0, 0], scale: raw.scale } });
        this._updateEffectPreview();
    }

    /** The quad the effect layer's canvas is shown through, in the preview scene. */
    _ensureEffectQuad(layer) {
        if (this._fxQuad && this._fxQuad.scene === this._scene) return this._fxQuad;
        this._disposeEffectQuad();
        const quad = Reactor3D.EffekseerScene.quadFor(layer.fxCanvas);
        // A WebGL canvas reaches three top-down whatever flipY says; the
        // quad flips V itself.
        quad.texture.flipY = false;
        quad.material.uniforms.flip.value = 1;
        quad.scene = this._scene;
        this._scene.add(quad.mesh);
        this._fxQuad = quad;
        return quad;
    }

    _disposeEffectQuad() {
        const quad = this._fxQuad;
        if (!quad) return;
        if (quad.mesh.parent) quad.mesh.parent.remove(quad.mesh);
        quad.texture.dispose();
        quad.material.dispose();
        quad.mesh.geometry.dispose();
        this._fxQuad = null;
    }

    /** Most pixels the effect canvas is drawn at: the view's own, capped as the map view caps it. */
    static EFFECT_PIXELS = 1920 * 1080;

    /**
     * Each frame in world mode: the camera's matrices and the handle's
     * placement go to the layer, the quad stands at the anchor, and its
     * texture is the layer's canvas as of this frame.
     */
    _placeEffectQuad(layer, def, world) {
        const quad = this._fxQuad;
        const camera = this._camera;
        if (!quad || !camera || !this._renderer) return;
        camera.updateMatrixWorld();
        const mesh = quad.mesh;
        const clip = this._effectClip || (this._effectClip = new THREE.Vector4());
        clip.set(world.x, world.y, world.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        if (clip.w <= 0) { mesh.visible = false; return; }
        const record = this._fxPreviewRecord || {};
        const rot = record.rotation || { x: 0, y: 0, z: 0 };
        const rotate = def.rotate || [0, 0, 0];
        const r = Math.PI / 180;
        const axes = Reactor3D.scaleAxes ? Reactor3D.scaleAxes(def.scale) : [1, 1, 1];
        const span = Reactor3D.modelSpanTiles ? (Reactor3D.modelSpanTiles(this._object) || 1) : 1;
        const unit = span / 26 * ((record.scale || 100) / 100);
        const size = this._renderer.getDrawingBufferSize(this._effectSize || (this._effectSize = new THREE.Vector2()));
        const area = size.x * size.y;
        const scale = area > Database3DEditor.EFFECT_PIXELS ? Math.sqrt(Database3DEditor.EFFECT_PIXELS / area) : 1;
        const rect = { x: 0, y: 0, w: size.x, h: size.y, scale };
        layer.setWorld({ renderer: this._renderer,
            projection: camera.projectionMatrix.elements,
            view: camera.matrixWorldInverse.elements,
            position: [world.x, world.y, world.z],
            scale: [unit * axes[0], unit * axes[1], unit * axes[2]],
            rotation: [(rot.x + rotate[0]) * r, (rot.y + rotate[1]) * r + this._object.rotation.y, (rot.z + rotate[2]) * r],
            rect, viewWidth: size.x, viewHeight: size.y
        });
        const uniforms = quad.material.uniforms;
        uniforms.resolution.value.set(size.x, size.y);
        uniforms.rectMin.value.set(0, 0);
        uniforms.rectSize.value.set(1, 1);
        Reactor3D.EffekseerScene.standQuad(mesh, world, camera);
        // A canvas texture is allocated once at its first size; after the
        // view grew, uploads of the bigger canvas failed and the quad kept
        // the last frame. Let go of the GL texture when the size changes.
        if (layer.fx.gpu) { mesh.visible = layer.drawGpuQuad(quad); return; }
        const source = layer.fxCanvas;
        if (quad.texWidth !== source.width || quad.texHeight !== source.height) {
            quad.texWidth = source.width;
            quad.texHeight = source.height;
            quad.texture.dispose();
        }
        quad.texture.needsUpdate = true;
        mesh.visible = !!layer.active;
    }

    _disposeAdditionalEffectPreviews() {
        for(const preview of this._additionalEffectPreviews?.values() || []) this._disposeAdditionalEffectPreview(preview);
        this._additionalEffectPreviews?.clear();
    }

    _disposeAdditionalEffectPreview(preview) {
        preview._stopEffectPreview();
        preview._fxPreview?.dispose(); preview._fxPreview=null;
        preview._disposeEffectQuad();
    }

    _syncAdditionalEffectPreviews(effects) {
        const previews=this._additionalEffectPreviews ||= new Map();
        const active=new Set(effects.map(entry=>entry.index));
        for(const [index,preview] of previews) {
            if(!active.has(index)) {this._disposeAdditionalEffectPreview(preview);previews.delete(index);}
        }
        for(const {raw,index} of effects) {
            let preview=previews.get(index);
            if(!preview) {
                // Each slot owns its playback and quad; model/camera/project
                // references follow the parent as the viewport moves.
                preview=Object.create(this);
                for(const key of ['_fxPreview','_fxQuad','_fxPreviewDef','_fxPreviewRecord','_fxVideo','_fxLight',
                    '_fxTriggered','_fxTriggeredLight','_effectWork','_fxMarker','_effectClip','_effectSize','_additionalEffectPreviews']) preview[key]=null;
                previews.set(index,preview);
            }
            const playing=raw.type==='video'?preview._fxVideo?.file===raw.video?.file:preview._fxPreviewDef?.animation===raw.animation&&preview._fxPreview?.active;
            if(!playing || preview._fxPreviewDef?.type!==raw.type) preview._playEffectPreview(raw);
            else {preview._fxPreviewDef=raw;if(preview._fxVideo)preview._fxVideo.raw=raw;}
        }
    }

    _stopEffectPreview() {
        this._disposeAdditionalEffectPreviews();
        if (this._fxPreview) this._fxPreview.stop();
        if (this._fxQuad) this._fxQuad.mesh.visible = false;
        this._stopVideoPreview();
        this._stopLightPreview();
        this._fxPreviewDef = null;
        this._fxPreviewRecord = null;
        this._fxTriggered = null;
        this._fxTriggeredLight = null;
    }

    /**
     * An effect that plays on its own previews the way a rule does: it
     * runs while the simulated character is in its state (Walk, Dash, or
     * idle between them) and stops when it leaves. The selected effect's
     * unsaved trigger counts, so a change previews before it is saved.
     */
    _updateTriggeredEffectPreview() {
        if (!this._object) return;
        const list = this.rawEffects.map((raw, index) => index === this.selectedEffect && this._effectWork ? this._effectWork : raw);
        const moving = !!this._sim.walking;
        const dashing = !!this._sim.dashing;
        // Keep the main movie/animation and light previews, with independent
        // layers for every additional triggered animation on the model.
        const additional=[];
        let wanted = null;
        let wantedIndex = -1;
        let wantedLight = null;
        let wantedLightIndex = -1;
        list.forEach((raw, index) => {
            const trigger = raw && raw.trigger;
            const isLight = raw && raw.type === 'light';
            const playable = raw && (raw.type === 'video' ? !!(raw.video && raw.video.file)
                : isLight ? true : Number(raw.animation) > 0);
            if (!raw || !trigger || trigger === 'action' || !playable) return;
            const active = trigger === 'always'
                || (trigger === 'moving' && moving)
                || (trigger === 'walking' && moving && !dashing)
                || (trigger === 'dashing' && dashing)
                || (trigger === 'idle' && !moving);
            if (!active) return;
            if (isLight) {
                if (!wantedLight || index === this.selectedEffect) { wantedLight = raw; wantedLightIndex = index; }
            } else if (!wanted) {
                wanted = raw;
                wantedIndex = index;
            } else additional.push({raw,index});
        });
        this._syncAdditionalEffectPreviews(additional);
        const layer = this._fxPreview;
        if (wanted) {
            // Keyed by its place in the list, not its name: typing a new
            // name must not read as a new effect and restart the video.
            const playing = wanted.type === 'video' ? this._fxVideo?.file===wanted.video?.file : !!(layer && layer.active);
            if (this._fxTriggered !== wantedIndex || !playing) {
                this._playEffectPreview(wanted);
                this._fxTriggered = wantedIndex;
            } else if (this._fxPreviewDef !== wanted) {
                // Selecting the effect swaps the record for its working
                // copy (and deselecting swaps back): the preview keeps
                // playing and reads the sliders from the copy, instead of
                // re-applying the saved offset and scale every frame.
                this._fxPreviewDef = wanted;
                if(this._fxVideo)this._fxVideo.raw=wanted;
            }
        } else if (this._fxTriggered !== null && this._fxTriggered !== undefined) {
            if (layer) layer.stop();
            if (this._fxQuad) this._fxQuad.mesh.visible = false;
            this._stopVideoPreview();
            this._fxTriggered = null;
        }
        if (wantedLight) {
            if (this._fxTriggeredLight !== wantedLightIndex || !this._fxLight) {
                this._playLightPreview(wantedLight);
                this._fxTriggeredLight = wantedLightIndex;
            } else if (this._fxLight.raw !== wantedLight) {
                this._fxLight.raw = wantedLight;
            }
        } else if (this._fxTriggeredLight !== null && this._fxTriggeredLight !== undefined) {
            this._stopLightPreview();
            this._fxTriggeredLight = null;
        }
    }

    /** Each frame: keep the overlay on the anchor's projected position, sized to the model. */
    _updateEffectPreview() {
        for(const preview of this._additionalEffectPreviews?.values() || []) preview._updateEffectPreview();
        // The anchor marker rides its part: on a walking character the
        // pink dot must move with the head it was placed on.
        if (this._effectWork && this._effectWork.anchor && this._effectWork.anchor.part) this._syncEffectAnchorMarker();
        if (this._fxVideo) this._updateVideoPreview();
        if (this._fxLight) this._updateLightPreview();
        const layer = this._fxPreview;
        if (!layer || !layer.active || !this._fxPreviewDef || !this._object || !this._camera) return;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const def = this._effectDef(this._fxPreviewDef) || this._fxPreviewDef;
        const world = Reactor3D.effectAnchorWorld(this._object, def, new THREE.Vector3());
        if (!world) return;
        if (layer.world) {
            this._placeEffectQuad(layer, def, world);
            return;
        }
        const at = world.clone().project(this._camera);
        const x = (at.x * 0.5 + 0.5) * rect.width;
        const y = (-at.y * 0.5 + 0.5) * rect.height;
        // The same rule as the game: one native animation pixel is
        // (pixels a tile covers here) / (tile size) screen pixels, and the
        // overlay's 384 native pixels span eight tiles.
        const up = world.clone().add(new THREE.Vector3(0, 1, 0)).project(this._camera);
        const pixelsPerTile = Math.abs(up.y - at.y) * 0.5 * rect.height;
        layer.moveTo(x, y, Math.max(24, pixelsPerTile * 8));
        // Scale 1 is a model-sized frame: the model as shown here.
        layer.setSpan(Reactor3D.modelSpanTiles ? Reactor3D.modelSpanTiles(this._object) : this._modelSpan() * this._scale);
        const rotate = def.rotate || [0, 0, 0];
        layer.setTransform({ rotate: [rotate[0], rotate[1] + this._object.rotation.y * 180 / Math.PI, rotate[2]], scale: def.scale });
    }

    _bindEffects(card) {
        const commitFx = () => {
            this._syncWorkRule();
            this._commitUndo();
            this.renderEditCard();
        };
        const effectAt = el => (this._work.effects || [])[Number(el.dataset.i)];
        card.querySelectorAll('.r3d-fx-at').forEach(slider => {
            slider.addEventListener('input', () => {
                this._stashUndo();
                const effect = effectAt(slider);
                if (effect) effect.at = Number(slider.value) / 100;
            });
            slider.addEventListener('change', () => commitFx());
        });
        card.querySelectorAll('.r3d-fx-delete').forEach(button => {
            button.addEventListener('click', () => {
                this._stashUndo();
                this._work.effects.splice(Number(button.dataset.i), 1);
                this._fxOpen = -1;
                commitFx();
            });
        });
        card.querySelectorAll('.r3d-fx-label').forEach(label => {
            label.addEventListener('click', () => {
                const index = Number(label.dataset.i);
                const effect = (this._work.effects || [])[index];
                if (!effect) return;
                if (effect.effect) {
                    // A click steps to the next named effect on the model.
                    const names = this.rawEffects.map(raw => raw && raw.name).filter(Boolean);
                    if (names.length) {
                        this._stashUndo();
                        effect.effect = names[(names.indexOf(effect.effect) + 1) % names.length];
                        commitFx();
                    }
                } else if (effect.flash) {
                    this._fxOpen = this._fxOpen === index ? -1 : index;
                    this.renderEditCard();
                } else if (effect.se) {
                    this._pickEffectSe(index);
                } else if (effect.animation) {
                    this._pickEffectAnimation(index);
                }
            });
        });
        const bindFlash = (cls, apply) => {
            card.querySelectorAll(cls).forEach(control => {
                control.addEventListener('change', () => {
                    this._stashUndo();
                    const effect = effectAt(control);
                    if (effect && effect.flash) apply(effect.flash, control);
                    commitFx();
                });
            });
        };
        bindFlash('.r3d-fx-flash-target', (flash, el) => { flash.target = el.value; });
        bindFlash('.r3d-fx-flash-color', (flash, el) => {
            const hex = el.value.replace('#', '');
            flash.color = [0, 1, 2].map(i => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
                .concat([flash.color && flash.color[3] != null ? flash.color[3] : 180]);
        });
        bindFlash('.r3d-fx-flash-strength', (flash, el) => {
            flash.color = (flash.color || [255, 255, 255, 180]).slice(0, 3).concat([Number(el.value)]);
        });
        bindFlash('.r3d-fx-flash-duration', (flash, el) => { flash.duration = Number(el.value); });
        card.querySelector('.r3d-fx-add-named')?.addEventListener('click', () => {
            const first = this.rawEffects.find(raw => raw && raw.name);
            if (!first) return;
            this._stashUndo();
            if (!Array.isArray(this._work.effects)) this._work.effects = [];
            this._work.effects.push({ at: 0.5, effect: first.name });
            commitFx();
        });
        const addEffect = effect => {
            this._stashUndo();
            if (!Array.isArray(this._work.effects)) this._work.effects = [];
            this._work.effects.push(effect);
            commitFx();
        };
        const addSe = card.querySelector('.r3d-fx-add-se');
        if (addSe) addSe.addEventListener('click', () => this._pickEffectSe(-1));
        const addAnim = card.querySelector('.r3d-fx-add-anim');
        if (addAnim) addAnim.addEventListener('click', () => this._pickEffectAnimation(-1));
        const addFlash = card.querySelector('.r3d-fx-add-flash');
        if (addFlash) {
            addFlash.addEventListener('click', () => {
                this._fxOpen = (this._work.effects || []).length;
                addEffect({ at: 0.5, flash: { target: 'screen', color: [255, 255, 255, 180], duration: 20 } });
            });
        }
    }

    /** Pick a sound effect through the shared audio picker. */
    _pickEffectSe(index) {
        if (typeof RRAudioPickerModal === 'undefined') return;
        const path = require('path');
        const project = this._project();
        const existing = index >= 0 ? this._work.effects[index] : null;
        const levels = existing && existing.se ? existing.se : {};
        RRAudioPickerModal.open({
            title: this._t('Select Animation SE'),
            folderLabel: 'SE',
            files: typeof RRAssetFiles !== 'undefined'
                ? RRAssetFiles.listUnique(path.join(project.path, 'audio', 'se'), RRAssetFiles.AUDIO_EXTENSIONS)
                : [],
            selected: existing && existing.se ? existing.se.name : '',
            levels: {
                volume: levels.volume !== undefined ? levels.volume : 90,
                pitch: levels.pitch !== undefined ? levels.pitch : 100,
                pan: levels.pan !== undefined ? levels.pan : 0
            },
            zIndex: 10030,
            onOk: result => {
                if (!result || !result.name) return;
                this._stashUndo();
                const se = { name: result.name,
                    volume: result.volume !== undefined ? result.volume : 90,
                    pitch: result.pitch !== undefined ? result.pitch : 100,
                    pan: result.pan !== undefined ? result.pan : 0 };
                if (index >= 0) this._work.effects[index].se = se;
                else {
                    if (!Array.isArray(this._work.effects)) this._work.effects = [];
                    this._work.effects.push({ at: 0.5, se });
                }
                this._syncWorkRule();
                this._commitUndo();
                this.renderEditCard();
            }
        });
    }

    /** Pick a database animation — 2D or Effekseer — to play on the event. */
    _pickEffectAnimation(index) {
        if (typeof AnimationPickerModal === 'undefined') return;
        const existing = index >= 0 ? this._work.effects[index] : null;
        AnimationPickerModal.open({
            databaseManager: this.databaseManager,
            projectManager: this.projectController,
            currentId: existing ? existing.animation : 0,
            onPick: id => {
                if (!(Number(id) > 0)) return;
                this._stashUndo();
                if (index >= 0) this._work.effects[index].animation = Number(id);
                else {
                    if (!Array.isArray(this._work.effects)) this._work.effects = [];
                    this._work.effects.push({ at: 0.5, animation: Number(id) });
                }
                this._syncWorkRule();
                this._commitUndo();
                this.renderEditCard();
            }
        });
    }

    // ------------------------------------------------------------------
    // Preview input: orbit drags look around; a click on the model picks
    // the part under the pointer. Select drags the marquee, Pivot places
    // the hinge. The right button (or Ctrl) always orbits.

    _bindPreviewInput(canvas) {
        const wrap = canvas.parentElement;
        const marquee = wrap.querySelector('.r3d-marquee');
        let mode = null;
        let lastX = 0;
        let lastY = 0;
        let startX = 0;
        let startY = 0;
        let downX = 0;
        let downY = 0;
        let removing = false;
        canvas.addEventListener('contextmenu', event => event.preventDefault());
        canvas.addEventListener('pointerdown', event => {
            // An open dropdown dismisses on this click and nothing else
            // happens — preventDefault would pin its popup open forever.
            const active = document.activeElement;
            if (active && active.tagName === 'SELECT') {
                active.blur();
                return;
            }
            if (this._rigFaceMode && active?.closest?.('.r3d-face-card')) active.blur();
            // The rig tool only claims presses that land on a marker (the
            // branch below); anywhere else the drag orbits as usual.
            const orbit = this._tool === 'orbit' || this._tool === 'rig' || this._tool === 'face'
                || event.button === 2 || event.ctrlKey;
            lastX = downX = event.clientX;
            lastY = downY = event.clientY;
            if (event.button === 0 && !event.ctrlKey && this._rigFaceMode) {
                // Keep the centre dot available for free camera-plane placement.
                const onMarker = this._rigMarkerUnderPointer(event.clientX, event.clientY);
                const hold = !onMarker && this._pickFacePointArrow(event.clientX, event.clientY);
                if (hold) {
                    mode = 'facearrow';
                    this._faceArrowHold = hold;
                    canvas.style.cursor = 'grabbing';
                    event.preventDefault();
                    return;
                }
            }
            // The pivot gizmo is drag-and-drop from any tool: a press on
            // its axes starts sliding the fulcrum in the camera plane.
            if (event.button === 0 && !event.ctrlKey && this._pivotMarker
                && this._pointerNearPivot(event.clientX, event.clientY)) {
                mode = 'pivotdrag';
                this._dragMode = 'pivotdrag';
                canvas.style.cursor = 'move';
                event.preventDefault();
                return;
            }
            // A light's rings and arrows come first: they sit on the anchor.
            if (event.button === 0 && !event.ctrlKey && this._cardMode === 'effect' && this._fxGizmo) {
                const hold = this._pickLightGizmo(event.clientX, event.clientY);
                if (hold) {
                    mode = 'fxgizmo';
                    this._fxGizmoHold = hold;
                    canvas.style.cursor = 'grabbing';
                    event.preventDefault();
                    return;
                }
            }
            // The effect anchor drags in the camera plane, like the pivot.
            if (event.button === 0 && !event.ctrlKey && this._cardMode === 'effect'
                && this._pointerNearMarker(this._fxMarker, event.clientX, event.clientY)) {
                mode = 'fxdrag';
                canvas.style.cursor = 'move';
                event.preventDefault();
                return;
            }
            // Rig markers drag the same way, mirrored to their twin.
            if (event.button === 0 && !event.ctrlKey && this._rigMode) {
                const markerKey = this._rigMarkerUnderPointer(event.clientX, event.clientY);
                if (markerKey) {
                    mode = 'rigdrag';
                    this._rigDragKey = markerKey;
                    canvas.style.cursor = 'move';
                    event.preventDefault();
                    return;
                }
            }
            this._dragging = true;
            this._lastInputAt = performance.now();
            if (event.button === 1 || (orbit && event.shiftKey)) {
                mode = 'pan';
                canvas.style.cursor = 'move';
            } else if (orbit) {
                mode = 'orbit';
                canvas.style.cursor = 'grabbing';
            } else if (this._tool === 'select' && this._selectMode) {
                mode = 'select';
                removing = event.altKey;
                const rect = canvas.getBoundingClientRect();
                startX = event.clientX - rect.left;
                startY = event.clientY - rect.top;
                marquee.style.display = 'block';
                marquee.style.left = startX + 'px';
                marquee.style.top = startY + 'px';
                marquee.style.width = '0px';
                marquee.style.height = '0px';
            } else if (this._tool === 'pivot') {
                mode = 'pivot';
            } else if (this._tool === 'fxanchor') {
                mode = 'fxanchor';
            }
            event.preventDefault();
        });
        canvas.addEventListener('pointermove', event => {
            this._pointer = { x: event.clientX, y: event.clientY };
            this._pointerMovedAt = performance.now();
        });
        window.addEventListener('pointermove', event => {
            if (!mode) return;
            this._lastInputAt = performance.now();
            if (mode === 'orbit') {
                this._viewGoal.yaw -= (event.clientX - lastX) * 0.4;
                this._viewGoal.pitch = Math.min(72, Math.max(5, this._viewGoal.pitch - (event.clientY - lastY) * 0.3));
            } else if (mode === 'pan') {
                this._panView(event.clientX - lastX, event.clientY - lastY);
            } else if (mode === 'select') {
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                marquee.style.left = Math.min(startX, x) + 'px';
                marquee.style.top = Math.min(startY, y) + 'px';
                marquee.style.width = Math.abs(x - startX) + 'px';
                marquee.style.height = Math.abs(y - startY) + 'px';
            } else if (mode === 'pivotdrag' && this._pivotMarker) {
                const point = this._pivotPlanePoint(event.clientX, event.clientY);
                if (point) this._pivotMarker.position.copy(point);
            } else if (mode === 'rigdrag' && this._rigDragKey) {
                this._dragRigMarker(this._rigDragKey, event.clientX, event.clientY);
            } else if (mode === 'facearrow') {
                this._dragFacePointArrow(this._faceArrowHold, event.clientX, event.clientY);
            } else if (mode === 'fxdrag' && this._fxMarker) {
                const point = this._cameraPlanePoint(event.clientX, event.clientY, this._fxMarker.position);
                if (point) this._fxMarker.position.copy(point);
                this._lastInputAt = performance.now();
            } else if (mode === 'fxgizmo' && this._fxGizmoHold) {
                this._dragLightGizmo(this._fxGizmoHold, event.clientX, event.clientY);
            }
            lastX = event.clientX;
            lastY = event.clientY;
        });
        window.addEventListener('pointerup', event => {
            if (!mode) return;
            const stationary = Math.abs(event.clientX - downX) < 3 && Math.abs(event.clientY - downY) < 3;
            if (mode === 'select') {
                marquee.style.display = 'none';
                const rect = canvas.getBoundingClientRect();
                const endX = event.clientX - rect.left;
                const endY = event.clientY - rect.top;
                this._applyMarquee(
                    Math.min(startX, endX), Math.min(startY, endY),
                    Math.max(startX, endX), Math.max(startY, endY), removing);
            } else if (mode === 'pivotdrag') {
                this._dragMode = null;
                const name = this.selectedPartName || (this._selectedPartDef() || {}).name;
                if (name && this._pivotMarker && this._object) {
                    this._object.updateWorldMatrix(true, false);
                    const local = this._object.worldToLocal(this._pivotMarker.position.clone());
                    this._setPivot(name, [local.x, local.y, local.z]);
                }
            } else if (mode === 'rigdrag') {
                this._rigDragKey = null;
                this._rigHoverAt = undefined;
            } else if (mode === 'facearrow') {
                if (this._faceArrows) RRAxisArrows3D.emphasize(this._faceArrows, null, false);
                this._faceArrowHold = null;
            } else if (mode === 'fxdrag') {
                this._commitAnchorFromMarker();
            } else if (mode === 'fxgizmo') {
                this._endLightGizmoDrag();
            } else if (mode === 'pivot' && stationary) {
                this._placePivot(event);
            } else if (mode === 'fxanchor' && stationary) {
                this._placeEffectAnchor(event);
            } else if (mode === 'orbit' && stationary && event.button !== 2 && this._tool === 'orbit') {
                this._pickPart(event);
            }
            mode = null;
            this._dragging = false;
            canvas.style.cursor = this._tool === 'orbit' ? 'grab' : 'crosshair';
        });
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            this._lastInputAt = performance.now();
            // Zoom toward the pointer: the thing under it (a rig marker, else
            // the model's surface) stays put and the camera closes on it, so
            // a few notches land on the fingertip the pointer rests on. The
            // camera stops a hand's width short of that point rather than
            // flying through it.
            const before = this._viewGoal.distance;
            const centre = this._orbitCenterWorld(this._viewGoal.pan);
            const under = centre && this._pointUnderPointer(event.clientX, event.clientY, centre);
            let ratio = event.deltaY > 0 ? 1.15 : 1 / 1.15;
            if (under && ratio < 1) {
                const gap = this._camera.position.distanceTo(under);
                if (gap * ratio < 0.06) ratio = Math.min(1, 0.06 / Math.max(gap, 1e-6));
            }
            this._viewGoal.distance = Math.min(20, Math.max(0.12, before * ratio));
            if (under) {
                const keep = 1 - this._viewGoal.distance / before;
                this._viewGoal.pan.x += (under.x - centre.x) * keep;
                this._viewGoal.pan.y += (under.y - centre.y) * keep;
                this._viewGoal.pan.z += (under.z - centre.z) * keep;
            }
        }, { passive: false });
    }

    _raycastPointer(clientX, clientY) {
        if (!this._object || !this._camera || typeof THREE === 'undefined') return null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        // A skinned mesh is ray-tested against its own cached bounds, which
        // three computes once from the geometry as loaded — for a rigged
        // character that box can be a few centimetres at the origin, and
        // every click on the mascot missed it. Refresh the bounds from the
        // posed skeleton first; a click is rare enough to afford it.
        this._object.traverse(node => {
            if (!node.isSkinnedMesh || typeof node.computeBoundingBox !== 'function') return;
            node.computeBoundingBox();
            node.computeBoundingSphere();
        });
        return raycaster.intersectObject(this._object, true);
    }

    /** The nearest hit that belongs to a poseable part, by its part name. */
    _partUnderPointer(clientX, clientY) {
        const hits = this._raycastPointer(clientX, clientY) || [];
        for (const hit of hits) {
            if (hit.object.userData && hit.object.userData.__reactorOverlay) continue;
            // On a rigged model the poseable thing under the pointer is
            // the bone that owns the face's skin, not the whole mesh.
            if (hit.object.isSkinnedMesh && hit.face) {
                const bone = this._dominantBoneName(hit.object, hit.face);
                if (bone) return { name: bone, hit };
            }
            const parts = hit.object.userData && hit.object.userData.parts;
            if (parts && parts.length) return { name: parts[0].name, hit };
        }
        return null;
    }

    _pickPart(event) {
        // With the effect card up, a click on the model must not swap the
        // card for a part's. A whole-object part made every click on the
        // mesh a dismissal, and the video surface's placement panel seemed
        // to simply vanish. Parts are still reached through their list and
        // the card's chooser; the anchor tool keeps the canvas.
        if (this._cardMode === 'effect') return;
        const found = this._partUnderPointer(event.clientX, event.clientY);
        if (found) {
            this.selectPartByName(found.name);
        } else if (this.selectedPartName !== null) {
            this.deselectPart();
        }
    }

    /** Hover highlight: run from the frame loop, throttled by time. */
    _updateHover() {
        // Placing rig markers hovers markers, not parts: the part raycast is the slow one on a skinned model.
        if (this._selectMode || (this._rigMode && !this._rigFaceMode) || this._tool !== 'orbit' || !this._pointer || !this._object) return;
        const now = performance.now();
        if (!Database3DEditor.shouldRaycastHover({
            now,
            movedAt: this._pointerMovedAt,
            inputAt: this._lastInputAt,
            dragging: this._dragging,
            triangles: this._triangleCount
        })) return;
        const last = this._hoverPointerAt;
        if (last && last.x === this._pointer.x && last.y === this._pointer.y) return;
        this._hoverPointerAt = { x: this._pointer.x, y: this._pointer.y };
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const inside = this._pointer.x >= rect.left && this._pointer.x <= rect.right
            && this._pointer.y >= rect.top && this._pointer.y <= rect.bottom;
        if (inside && this._pointerNearPivot(this._pointer.x, this._pointer.y)) {
            canvas.style.cursor = 'move';
            return;
        }
        const found = inside ? this._partUnderPointer(this._pointer.x, this._pointer.y) : null;
        const name = found ? found.name : '';
        if (name !== this._hoverName) {
            this._hoverName = name;
            canvas.style.cursor = this._tool === 'orbit' ? (name ? 'pointer' : 'grab') : canvas.style.cursor;
            this._refreshPartVisuals();
        } else if (this._tool === 'orbit') {
            canvas.style.cursor = name ? 'pointer' : 'grab';
        }
    }

    /**
     * Whether a screen-space triangle touches the dragged rectangle at
     * all: a vertex inside the box, the box poking into the triangle, or
     * any edge crossing. Centre-only testing missed big triangles the
     * hand had visibly covered — the box would slide over a jaw plate and
     * take nothing.
     */
    static triangleTouchesRect(ax, ay, bx, by, cx, cy, minX, minY, maxX, maxY) {
        const inRect = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
        if (inRect(ax, ay) || inRect(bx, by) || inRect(cx, cy)) return true;
        const side = (x1, y1, x2, y2, px, py) => (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
        const inTriangle = (px, py) => {
            const d1 = side(ax, ay, bx, by, px, py);
            const d2 = side(bx, by, cx, cy, px, py);
            const d3 = side(cx, cy, ax, ay, px, py);
            return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
        };
        if (inTriangle(minX, minY) || inTriangle(maxX, minY)
            || inTriangle(minX, maxY) || inTriangle(maxX, maxY)) return true;
        const crosses = (x1, y1, x2, y2, x3, y3, x4, y4) => {
            const d1 = side(x3, y3, x4, y4, x1, y1);
            const d2 = side(x3, y3, x4, y4, x2, y2);
            const d3 = side(x1, y1, x2, y2, x3, y3);
            const d4 = side(x1, y1, x2, y2, x4, y4);
            return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
        };
        const edges = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
        const box = [
            [minX, minY, maxX, minY], [maxX, minY, maxX, maxY],
            [maxX, maxY, minX, maxY], [minX, maxY, minX, minY]
        ];
        for (const [x1, y1, x2, y2] of edges) {
            for (const [x3, y3, x4, y4] of box) {
                if (crosses(x1, y1, x2, y2, x3, y3, x4, y4)) return true;
            }
        }
        return false;
    }

    /**
     * The interpolated view depth of a screen-space triangle at a point,
     * or null when the point lies outside it. Pure, for the occlusion
     * test below.
     */
    static triangleDepthAt(ax, ay, az, bx, by, bz, cx, cy, cz, px, py) {
        const v0x = bx - ax, v0y = by - ay;
        const v1x = cx - ax, v1y = cy - ay;
        const v2x = px - ax, v2y = py - ay;
        const den = v0x * v1y - v1x * v0y;
        if (Math.abs(den) < 1e-9) return null;
        const u = (v2x * v1y - v1x * v2y) / den;
        const v = (v0x * v2y - v2x * v0y) / den;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) return null;
        return az + u * (bz - az) + v * (cz - az);
    }

    /**
     * Every triangle the dragged rectangle touches joins (or leaves) the
     * selection. By default only triangles the eye can actually see
     * count — a box over a tank's turret must not quietly take the hull
     * behind it — with the Through toggle reaching the far side of the
     * model too, the way a jaw wants both cheeks.
     */
    _applyMarquee(minX, minY, maxX, maxY, removing) {
        if (!this._object || !this._camera || typeof THREE === 'undefined') return;
        if (maxX - minX < 2 && maxY - minY < 2) return;
        this._pushSelectionUndo();
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        this._scene.updateMatrixWorld(true);
        this._camera.updateMatrixWorld(true);
        const toCamera = this._camera.matrixWorldInverse;
        const meshes = Reactor3D.carveTargetMeshes(this._object);
        const world = new THREE.Vector3();
        const view = new THREE.Vector3();
        // First pass: project every triangle once — screen x/y plus view
        // depth per corner, NaN marking behind-camera folds.
        const projected = meshes.map(mesh => {
            const geometry = mesh.geometry;
            const position = geometry.getAttribute('position');
            if (!position) return null;
            const index = geometry.getIndex();
            const vertexAt = index ? (n => index.array[n]) : (n => n);
            const triCount = Math.floor((index ? index.array.length : position.count) / 3);
            const data = new Float64Array(triCount * 9);
            for (let tri = 0; tri < triCount; tri++) {
                for (let corner = 0; corner < 3; corner++) {
                    world.fromBufferAttribute(position, vertexAt(tri * 3 + corner));
                    world.applyMatrix4(mesh.matrixWorld);
                    view.copy(world).applyMatrix4(toCamera);
                    const at = tri * 9 + corner * 3;
                    if (view.z >= 0) {
                        data[at] = NaN;
                        continue;
                    }
                    world.project(this._camera);
                    data[at] = (world.x * 0.5 + 0.5) * rect.width;
                    data[at + 1] = (-world.y * 0.5 + 0.5) * rect.height;
                    data[at + 2] = view.z;
                }
            }
            return { data, triCount };
        });
        // Occlusion grid: triangles bucketed by screen area, so asking
        // "does anything nearer cover this point" only touches neighbours.
        let grid = null;
        const cell = 40;
        const cols = Math.max(1, Math.ceil(rect.width / cell));
        const rows = Math.max(1, Math.ceil(rect.height / cell));
        if (!this._selectThrough) {
            grid = Array.from({ length: cols * rows }, () => []);
            projected.forEach((mesh, meshIndex) => {
                if (!mesh) return;
                const data = mesh.data;
                for (let tri = 0; tri < mesh.triCount; tri++) {
                    const at = tri * 9;
                    if (Number.isNaN(data[at]) || Number.isNaN(data[at + 3]) || Number.isNaN(data[at + 6])) continue;
                    const xs = [data[at], data[at + 3], data[at + 6]];
                    const ys = [data[at + 1], data[at + 4], data[at + 7]];
                    const c0 = Math.max(0, Math.floor(Math.min(...xs) / cell));
                    const c1 = Math.min(cols - 1, Math.floor(Math.max(...xs) / cell));
                    const r0 = Math.max(0, Math.floor(Math.min(...ys) / cell));
                    const r1 = Math.min(rows - 1, Math.floor(Math.max(...ys) / cell));
                    for (let r = r0; r <= r1; r++) {
                        for (let c = c0; c <= c1; c++) {
                            grid[r * cols + c].push(meshIndex * 1048576 + tri);
                        }
                    }
                }
            });
        }
        const occluded = (meshIndex, tri, px, py, pz) => {
            const c = Math.min(cols - 1, Math.max(0, Math.floor(px / cell)));
            const r = Math.min(rows - 1, Math.max(0, Math.floor(py / cell)));
            for (const packed of grid[r * cols + c]) {
                const om = (packed / 1048576) | 0;
                const ot = packed % 1048576;
                if (om === meshIndex && ot === tri) continue;
                const d = projected[om].data;
                const at = ot * 9;
                const z = Database3DEditor.triangleDepthAt(
                    d[at], d[at + 1], d[at + 2], d[at + 3], d[at + 4], d[at + 5],
                    d[at + 6], d[at + 7], d[at + 8], px, py);
                // Nearer means larger view z (less negative); coplanar
                // neighbours fall inside the epsilon and do not occlude.
                if (z !== null && z > pz + 0.008) return true;
            }
            return false;
        };
        projected.forEach((mesh, meshIndex) => {
            if (!mesh) return;
            const data = mesh.data;
            let set = this._selection.get(meshIndex);
            for (let tri = 0; tri < mesh.triCount; tri++) {
                const at = tri * 9;
                if (Number.isNaN(data[at]) || Number.isNaN(data[at + 3]) || Number.isNaN(data[at + 6])) continue;
                if (!Database3DEditor.triangleTouchesRect(
                    data[at], data[at + 1], data[at + 3], data[at + 4], data[at + 6], data[at + 7],
                    minX, minY, maxX, maxY)) continue;
                if (grid) {
                    const px = (data[at] + data[at + 3] + data[at + 6]) / 3;
                    const py = (data[at + 1] + data[at + 4] + data[at + 7]) / 3;
                    const pz = (data[at + 2] + data[at + 5] + data[at + 8]) / 3;
                    if (occluded(meshIndex, tri, px, py, pz)) continue;
                }
                if (removing) {
                    if (set) set.delete(tri);
                } else {
                    if (!set) {
                        set = new Set();
                        this._selection.set(meshIndex, set);
                    }
                    set.add(tri);
                }
            }
        });
        this._refreshSelectionOverlay();
        this.renderSelectBar();
    }

    /** Click the model to put the current target's pivot there. */
    _placePivot(event) {
        const name = this.selectedPartName || (this._selectedPartDef() || {}).name;
        if (!name || !this._object || typeof THREE === 'undefined') return;
        const hits = this._raycastPointer(event.clientX, event.clientY) || [];
        if (!hits.length) return;
        this._object.updateWorldMatrix(true, false);
        const local = this._object.worldToLocal(hits[0].point.clone());
        this._setPivot(name, [local.x, local.y, local.z]);
    }

    /** Whether the pointer is on the pivot gizmo, in screen pixels. */
    _pointerNearPivot(clientX, clientY) {
        if (!this._pivotMarker || !this._camera) return false;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const at = this._pivotMarker.position.clone().project(this._camera);
        const sx = rect.left + (at.x * 0.5 + 0.5) * rect.width;
        const sy = rect.top + (-at.y * 0.5 + 0.5) * rect.height;
        return Math.hypot(clientX - sx, clientY - sy) < 28;
    }

    /** Where the pointer ray crosses the camera-parallel plane through the pivot. */
    _pivotPlanePoint(clientX, clientY) {
        return this._cameraPlanePoint(clientX, clientY, this._pivotMarker.position);
    }

    /** Where the pointer ray crosses the camera-parallel plane through a point. */
    /** The orbit centre in scene units (the model's middle plus the pan), as aimCamera reads it. */
    _orbitCenter(pan) {
        const base = this._viewCenter || { x: -0.5, y: 0, z: -0.5 };
        const offset = pan || { x: 0, y: 0, z: 0 };
        return { x: base.x + offset.x, y: base.y + offset.y, z: base.z + offset.z };
    }

    /** The same point as a world vector (aimCamera looks at the cell centre, half a unit in on x and z). */
    _orbitCenterWorld(pan) {
        if (typeof THREE === 'undefined') return null;
        const centre = this._orbitCenter(pan);
        return new THREE.Vector3(centre.x + 0.5, centre.y, centre.z + 0.5);
    }

    /**
     * The world point under the pointer, for zooming toward it: a rig marker
     * within reach, else where the ray meets the model (a raycast against a
     * skinned mesh refreshes its bounds, so one hit serves a burst of wheel
     * notches), else the orbit centre's own depth.
     */
    _pointUnderPointer(clientX, clientY, centre) {
        if (typeof THREE === 'undefined' || !this._camera) return null;
        if (this._rigMode && this._rigMarkerMeshes) {
            const key = this._rigMarkerUnderPointer(clientX, clientY, 36);
            if (key) return this._rigMarkerMeshes[key].getWorldPosition(new THREE.Vector3());
        }
        if (this._rigSurface) {
            const canvas = this._detail.querySelector('.r3d-db-canvas');
            const rect = canvas.getBoundingClientRect();
            const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(pointer, this._camera);
            const o = raycaster.ray.origin, d = raycaster.ray.direction;
            const hit = this._rigSurface.raycast(o.x, o.y, o.z, d.x, d.y, d.z)[0];
            return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : this._cameraPlanePoint(clientX, clientY, centre);
        }
        const now = performance.now(), last = this._wheelHit;
        if (last && now - last.at < 300 && Math.hypot(last.x - clientX, last.y - clientY) < 6) return last.point || this._cameraPlanePoint(clientX, clientY, centre);
        const hits = this._raycastPointer(clientX, clientY) || [];
        const hit = hits.find(entry => !(entry.object.userData && entry.object.userData.__reactorOverlay));
        this._wheelHit = { at: now, x: clientX, y: clientY, point: hit ? hit.point.clone() : null };
        return this._wheelHit.point || this._cameraPlanePoint(clientX, clientY, centre);
    }

    /** Slide the orbit centre across the view by a pointer delta, so the picture follows the pointer. */
    _panView(dx, dy) {
        if (!this._camera || typeof THREE === 'undefined') return;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const perPixel = 2 * this._view.distance * Math.tan((this._camera.fov * Math.PI) / 360) / Math.max(1, rect.height);
        const right = new THREE.Vector3().setFromMatrixColumn(this._camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this._camera.matrixWorld, 1);
        const move = right.multiplyScalar(-dx * perPixel).add(up.multiplyScalar(dy * perPixel));
        this._viewGoal.pan.x += move.x;
        this._viewGoal.pan.y += move.y;
        this._viewGoal.pan.z += move.z;
    }

    /**
     * Rig markers keep one size on screen: they are scene objects, and
     * zooming onto a hand used to fill the view with one dot. Labels grow
     * as the camera comes in (with the square root of the zoom, up to a
     * readable cap), so finger names read up close and stay small over the
     * whole body. Labels that would land on one another are then thinned.
     */
    _updateRigOverlay() {
        if (!this._rigMode || this._rigFaceMode || !this._rigMarkerMeshes) return;
        const zoom = Math.min(1, Math.max(0.01, this._view.distance / 4));
        const k = zoom;
        let kLabel = Math.sqrt(zoom);
        // No taller than about 22px of text: at that size a hand's worth of names still fits.
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas && canvas.getBoundingClientRect();
        if (rect && rect.height && this._rigLabelBase && this._camera) {
            const worldPerPixel = (2 * this._view.distance * Math.tan((this._camera.fov * Math.PI) / 360)) / rect.height;
            const cap = (46 * worldPerPixel) / (this._rigLabelBase * (this._object ? this._object.scale.y : 1));
            kLabel = Math.min(kLabel, cap);
        }
        if (Math.abs(k - (this._rigOverlayScale || 0)) > 1e-4 || Math.abs(kLabel - (this._rigLabelScale || 0)) > 1e-4) {
            this._rigOverlayScale = k;
            this._rigLabelScale = kLabel;
            for (const marker of this._rigMarkerDefinitions()) {
                const sphere = this._rigMarkerMeshes[marker.key];
                if (sphere) sphere.scale.setScalar(k * (marker.key === this._rigHoverKey ? 1.7 : 1));
                this._placeRigLabel(marker.key);
            }
        }
        this._declutterRigLabels(rect);
    }

    /**
     * Which labels draw this frame: the hovered or dragged marker's always;
     * finger names only once the camera is close; and never one on top of
     * another — the joints' names go first, then the fingers, and a label
     * whose box would cross one already placed stays hidden until the
     * markers are moved apart or the camera comes closer.
     */
    _declutterRigLabels(rect) {
        if (!this._rigMarkerLabels || !this._camera || !rect || !rect.height) return;
        const close = this._view.distance < 0.9;
        const keep = key => key && (key === this._rigHoverKey || key === this._rigDragKey);
        const defs = this._rigMarkerDefinitions().slice().sort((a, b) => (keep(b.key) - keep(a.key)) || ((a.fine ? 1 : 0) - (b.fine ? 1 : 0)));
        const tanHalf = Math.tan((this._camera.fov * Math.PI) / 360);
        const world = new THREE.Vector3(), scale = new THREE.Vector3();
        const placed = [];
        for (const marker of defs) {
            const label = this._rigMarkerLabels[marker.key];
            if (!label) continue;
            if (marker.fine && !close && !keep(marker.key)) { label.visible = false; continue; }
            label.getWorldPosition(world);
            const distance = world.distanceTo(this._camera.position);
            const ndc = world.clone().project(this._camera);
            if (ndc.z > 1 || distance <= 0) { label.visible = false; continue; }
            label.getWorldScale(scale);
            const pxPerUnit = rect.height / (2 * distance * tanHalf);
            const w = scale.x * pxPerUnit, h = scale.y * pxPerUnit;
            const cx = (ndc.x * 0.5 + 0.5) * rect.width, cy = (-ndc.y * 0.5 + 0.5) * rect.height;
            const box = { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 };
            const crosses = placed.some(p => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
            if (crosses && !keep(marker.key)) { label.visible = false; continue; }
            label.visible = true;
            placed.push(box);
        }
    }

    /** The marker under the pointer swells and the cursor offers a grab, so it is plain which one a press will take. */
    _updateRigHover() {
        if (!this._rigMode || this._rigFaceMode || !this._rigMarkerMeshes || !this._pointer || this._rigDragKey) return;
        if (this._pointerMovedAt === this._rigHoverAt) return;
        this._rigHoverAt = this._pointerMovedAt;
        const key = this._rigMarkerUnderPointer(this._pointer.x, this._pointer.y, 12);
        if (key === this._rigHoverKey) return;
        this._rigHoverKey = key;
        this._rigOverlayScale = undefined;
        if (!this._dragging) {
            const canvas = this._detail.querySelector('.r3d-db-canvas');
            if (canvas) canvas.style.cursor = key ? 'pointer' : (this._tool === 'orbit' ? 'grab' : 'crosshair');
        }
    }

    /**
     * The model's surface as a tree over its triangles, built once per
     * instance: what a dragged marker snaps into and what the wheel zooms
     * toward. Overlay meshes (the markers themselves) are left out.
     */
    _buildRigSurface() {
        this._rigSurface = null;
        if (this._rigFaceMode || typeof RRMeshSurfacePicker === 'undefined' || !this._object || typeof THREE === 'undefined') return;
        const started = performance.now();
        this._rigSurface = RRMeshSurfacePicker.build(this._object, THREE, node => !!(node.userData && node.userData.__reactorOverlay));
        this._rigSurfaceMs = performance.now() - started;
        this._refreshRigMarkerFit();
    }

    /** How deep a limb or torso can be for a snap to land in its middle rather than just under the skin. */
    _rigThickness() {
        const size = (this._template && this._template.userData.glbSize) || { x: 1, y: 1.8, z: 1 };
        return Math.max(size.x, size.y, size.z) * (this._scale || 1) * 0.3;
    }

    /** Where the pointer's ray enters the model, moved to the middle of the flesh there, in rig-group space; null off the model. */
    _rigSurfacePoint(clientX, clientY) {
        if (!this._rigSurface || !this._camera || !this._rigGroup) return null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        const o = raycaster.ray.origin, d = raycaster.ray.direction;
        const hit = this._rigSurface.pickFlesh(o.x, o.y, o.z, d.x, d.y, d.z, this._rigThickness());
        if (!hit) return null;
        return this._rigGroup.worldToLocal(new THREE.Vector3().fromArray(hit.point));
    }

    /** Markers inside the model draw solid; one floating outside it draws faint, so a miss shows from any angle. */
    _refreshRigMarkerFit(keys) {
        if (!this._rigSurface || !this._rigMarkerMeshes) return;
        for (const key of keys || Object.keys(this._rigMarkerMeshes)) {
            const sphere = this._rigMarkerMeshes[key];
            if (!sphere) continue;
            const world = sphere.getWorldPosition(new THREE.Vector3());
            const inside = this._rigSurface.inside(world.x, world.y, world.z);
            sphere.userData.__inside = inside;
            sphere.material.opacity = inside ? 0.95 : 0.35;
        }
    }

    /** A marker's label floats just above it, at the overlay's current screen scale. */
    _placeRigLabel(key) {
        const sphere = this._rigMarkerMeshes && this._rigMarkerMeshes[key], label = this._rigMarkerLabels && this._rigMarkerLabels[key];
        if (!sphere || !label) return;
        const k = this._rigOverlayScale || 1, kLabel = this._rigLabelScale || 1;
        label.scale.set(label.userData.__width * kLabel, label.userData.__height * kLabel, 1);
        // Just above the dot: past its radius, then half the label's own height.
        const lift = label.userData.__lift * k + label.userData.__height * kLabel * 0.55;
        label.position.set(sphere.position.x, sphere.position.y + lift, sphere.position.z);
    }

    _cameraPlanePoint(clientX, clientY, anchorWorld) {
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        const normal = new THREE.Vector3();
        this._camera.getWorldDirection(normal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchorWorld);
        const point = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, point) ? point : null;
    }

    // ------------------------------------------------------------------
    // Rigging: fit the humanoid skeleton with draggable joint markers,
    // then Bind computes skin weights and the bones become card parts.
    // A rig and carved parts are exclusive — both count mesh indices and
    // triangles over the uncarved model.

    enterRigMode(faceOnly = false) {
        if (typeof ModelRigger === 'undefined' || !this._object || !this._template) return false;
        const status = this._detail.querySelector('.r3d-status');
        if (this.customParts.length && !faceOnly) {
            if (status) status.textContent = this._t('Remove carved parts before rigging.');
            return false;
        }
        this._rigFaceMode = faceOnly;
        this.deselectPart();
        if (faceOnly) {
            // Fit in the rest pose; existing skin weights and clips stay intact.
            this._stopEffectPreview();
            this._rebuildInstance();
            this._rigMode = true;
            this._rigMarkers = ModelRigger.defaultFaceMarkers(this._template.userData.glbSize);
            this._faceBindings = {};
            const savedPoints = Reactor3D.readModelLandmarks({ landmarks: this.landmarks });
            this._faceInterior = savedPoints.mouth?.interior === 'none' ? 'none' : 'dark';
            this._faceInteriorColor = savedPoints.mouth?.interiorColor || '#080808';
            const head = this.partNames.find(name => /^head$/i.test(name)) || '';
            for (const marker of ModelRigger.FACE_MARKERS) {
                const point = savedPoints[marker.key];
                this._faceBindings[marker.key] = point ? point.part || '' : head;
                if (point && Array.isArray(point.offset)) {
                    const node = Reactor3D.landmarkNode(this._object, point.part) || this._object;
                    const world = node.localToWorld(new THREE.Vector3().fromArray(point.offset));
                    this._rigMarkers[marker.key] = this._object.worldToLocal(world).toArray();
                }
            }
            this._facePoint = 'eyes';
            this._faceMarkerBaseline = JSON.parse(JSON.stringify(this._rigMarkers));
            this._buildRigVisuals();
            this.renderRigBar();
            this.renderEditCard();
            return true;
        }
        // Markers describe the rest pose, so the model holds it while they
        // are placed: an idle clip kept walking Carol out from under her rig.
        this._stopEffectPreview();
        this._rebuildInstance();
        this._rigMode = true;
        this._rigTemplate = (this.customRig && ModelRigger.TEMPLATES[this.customRig.template])
            ? this.customRig.template : (this._rigTemplate || 'humanoid');
        const saved = this.customRig && this.customRig.markers, size = this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 };
        const placed = saved && ModelRigger.markersFor(this._rigTemplate).some(marker => Array.isArray(saved[marker.key]) && saved[marker.key].length === 3);
        this._rigMarkers = placed ? ModelRigger.completeMarkers(saved, this._rigTemplate, size) : ModelRigger.defaultMarkers(size, this._rigTemplate);
        this._buildRigVisuals();
        this.renderRigBar();
        return true;
    }

    exitRigMode() {
        this._rigMode = false;
        this._rigFaceMode = false;
        this._rigDragKey = null;
        this._disposeRigVisuals();
        this.renderRigBar();
        this.renderEditCard();
    }

    _disposeRigVisuals() {
        this._stopMouthPreview();
        if (this._faceArrows) RRAxisArrows3D.dispose(this._faceArrows);
        this._faceArrows = null;
        this._faceArrowHold = null;
        this._rigGroup?.traverse(node => {
            node.geometry?.dispose();
            if (node.material) { node.material.map?.dispose(); node.material.dispose(); }
        });
        if (this._rigGroup && this._rigGroup.parent) this._rigGroup.parent.remove(this._rigGroup);
        this._rigGroup = null;
        this._rigMarkerMeshes = null;
        this._rigBoneLines = null;
        this._rigSurface = null;
        this._rigHoverKey = null;
    }

    /** Marker spheres and the derived bone lines, in model space. */
    _buildRigVisuals() {
        if (typeof THREE === 'undefined' || !this._object) return;
        this._disposeRigVisuals();
        const size = this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 };
        const radius = Math.max(size.x, size.y, size.z) * 0.011;
        const group = new THREE.Group();
        group.name = 'rig-markers';
        group.userData.__reactorOverlay = true;
        this._rigMarkerMeshes = {};
        for (const marker of this._rigMarkerDefinitions()) {
            const side = /L$/.test(marker.key) ? 'L' : (/R$/.test(marker.key) ? 'R' : '');
            const color = side === 'L' ? 0x5aa9ff : side === 'R' ? 0xff6a6a : 0xffd15c;
            const markerRadius = this._rigFaceMode
                ? radius * (marker.key === 'upperLip' || marker.key === 'lowerLip' ? 0.2 : 0.4) : marker.fine ? radius * 0.5 : radius;
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(markerRadius, 12, 10),
                new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
            sphere.renderOrder = 30;
            sphere.userData.__reactorOverlay = true;
            sphere.position.fromArray(this._rigMarkers[marker.key]);
            sphere.visible = !this._rigFaceMode || marker.key === this._facePoint;
            group.add(sphere);
            this._rigMarkerMeshes[marker.key] = sphere;
        }
        const lines = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffd15c, depthTest: false, transparent: true, opacity: 0.75 }));
        lines.renderOrder = 29;
        lines.userData.__reactorOverlay = true;
        group.add(lines);
        this._rigBoneLines = lines;
        // Each marker names its joint right in the viewport — a bare dot
        // gives no clue whether it wants the elbow or the wrist.
        this._rigMarkerLabels = {};
        const labelHeight = Math.max(size.x, size.y, size.z) * (this._rigFaceMode ? 0.025 : 0.05);
        this._rigLabelBase = labelHeight;
        this._fineLabelsShown = undefined;
        this._rigOverlayScale = undefined;
        for (const marker of this._rigMarkerDefinitions()) {
            const sprite = this._makeMarkerLabel(this._t(marker.short || marker.label));
            const height = marker.fine ? labelHeight * 0.7 : labelHeight;
            sprite.userData.__width = height * sprite.userData.__aspect;
            sprite.userData.__height = height;
            sprite.userData.__lift = radius * (marker.fine ? 0.6 : 1.2);
            sprite.scale.set(sprite.userData.__width, height, 1);
            sprite.position.fromArray(this._rigMarkers[marker.key]);
            sprite.position.y += sprite.userData.__lift + height * 0.55;
            sprite.visible = (!this._rigFaceMode || marker.key === this._facePoint) && !marker.fine;
            sprite.userData.__fine = !!marker.fine;
            group.add(sprite);
            this._rigMarkerLabels[marker.key] = sprite;
        }
        this._object.add(group);
        this._rigGroup = group;
        this._refreshRigBones();
        this._syncFacePointVisuals();
        this._buildRigSurface();
    }

    /** A floating text label for one rig marker. */
    _makeMarkerLabel(text) {
        const canvas = document.createElement('canvas');
        const font = 'bold 30px sans-serif';
        const measure = canvas.getContext('2d');
        measure.font = font;
        // Wide enough for its own words: a fixed width clipped the longer names.
        canvas.width = Math.max(64, Math.ceil(measure.measureText(text).width) + 24);
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.font = font;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = 6;
        context.strokeStyle = 'rgba(0,0,0,0.85)';
        context.strokeText(text, canvas.width / 2, 32);
        context.fillStyle = '#ffffff';
        context.fillText(text, canvas.width / 2, 32);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture, depthTest: false, transparent: true, opacity: 0.95
        }));
        sprite.renderOrder = 31;
        sprite.userData.__reactorOverlay = true;
        sprite.userData.__aspect = canvas.width / canvas.height;
        return sprite;
    }

    /** Rebuild the bone preview lines from the current markers. */
    _refreshRigBones() {
        if (!this._rigBoneLines || typeof ModelRigger === 'undefined') return;
        if (this._rigFaceMode) return;
        // The chain through the markers, not the skinning bones: those run past the wrists and ankles by design.
        const bones = (ModelRigger.previewLinks || ModelRigger.bonesFromMarkers)(this._rigMarkers, this._rigTemplate);
        const positions = new Float32Array(bones.length * 6);
        bones.forEach((bone, i) => {
            positions.set(bone.head, i * 6);
            positions.set(bone.tail, i * 6 + 3);
        });
        this._rigBoneLines.geometry.dispose();
        this._rigBoneLines.geometry = new THREE.BufferGeometry();
        this._rigBoneLines.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }

    /** The marker under the pointer, by projected screen distance. */
    _rigMarkerUnderPointer(clientX, clientY, reach = 10) {
        if (!this._rigMarkerMeshes || !this._camera) return null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        let best = null;
        let bestDistance = reach;
        for (const key of Object.keys(this._rigMarkerMeshes)) {
            if (!this._rigMarkerMeshes[key].visible) continue;
            const world = new THREE.Vector3();
            this._rigMarkerMeshes[key].getWorldPosition(world);
            const at = world.project(this._camera);
            const sx = rect.left + (at.x * 0.5 + 0.5) * rect.width;
            const sy = rect.top + (-at.y * 0.5 + 0.5) * rect.height;
            const distance = Math.hypot(clientX - sx, clientY - sy);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = key;
            }
        }
        return best;
    }

    /** Drag a marker in the camera plane; its mirror twin follows reflected. */
    _dragRigMarker(key, clientX, clientY) {
        const sphere = this._rigMarkerMeshes && this._rigMarkerMeshes[key];
        if (!sphere || !this._object) return;
        const anchor = new THREE.Vector3();
        sphere.getWorldPosition(anchor);
        // Into the model under the pointer, at the middle of the flesh there,
        // so the depth is right from every angle; off the model, across the
        // camera plane as before.
        const snapped = this._rigFaceMode ? null : this._rigSurfacePoint(clientX, clientY);
        const point = snapped ? null : this._cameraPlanePoint(clientX, clientY, anchor);
        if (!snapped && !point) return;
        const local = snapped || this._rigGroup.worldToLocal(point.clone());
        if (this._rigFaceMode) {
            this._rigMarkers[key] = local.toArray();
            this._syncFacePointVisuals();
            this._syncFacePointControls();
            return;
        }
        this._rigMarkers[key] = [local.x, local.y, local.z];
        sphere.position.copy(local);
        this._placeRigLabel(key);
        const marker = this._rigMarkerDefinitions().find(entry => entry.key === key);
        if (marker && marker.mirror) {
            this._rigMarkers[marker.mirror] = [-local.x, local.y, local.z];
            this._rigMarkerMeshes[marker.mirror].position.set(-local.x, local.y, local.z);
            this._placeRigLabel(marker.mirror);
        }
        this._refreshRigMarkerFit(marker && marker.mirror ? [key, marker.mirror] : [key]);
        this._refreshRigBones();
    }

    _rigMarkerDefinitions() {
        return this._rigFaceMode ? ModelRigger.FACE_MARKERS : ModelRigger.markersFor(this._rigTemplate);
    }

    renderRigBar() {
        const bar = this._detail ? this._detail.querySelector('.r3d-rig-bar') : null;
        if (!bar) return;
        if (!this._rigMode || this._rigFaceMode) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = 'flex';
        bar.style.width = '';
        bar.style.maxWidth = 'calc(100% - 64px)';
        bar.style.boxSizing = 'border-box';
        bar.style.flexDirection = 'row';
        bar.style.alignItems = 'center';
        bar.style.flexWrap = 'wrap';
        bar.innerHTML = '';
        const label = document.createElement('span');
        label.style.fontWeight = 'bold';
        label.textContent = this._t('Rig');
        bar.appendChild(label);
        const templatePick = document.createElement('select');
        templatePick.style.cssText = 'padding:2px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;font-size:12px;';
        for (const entry of ModelRigger.templates()) {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = this._t(entry.label);
            option.selected = entry.id === this._rigTemplate;
            templatePick.appendChild(option);
        }
        templatePick.addEventListener('change', () => {
            this._rigTemplate = templatePick.value;
            this._rigMarkers = ModelRigger.defaultMarkers(
                this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 }, this._rigTemplate);
            this._buildRigVisuals();
        });
        bar.appendChild(templatePick);
        const bind = document.createElement('button');
        bind.type = 'button';
        bind.className = 'rr-button-primary';
        bind.style.padding = '3px 12px';
        bind.textContent = this._t('Bind rig');
        bind.addEventListener('click', () => this.bindRig());
        bar.appendChild(bind);
        const face = document.createElement('button');
        face.type = 'button';
        face.className = 'rr-btn-secondary';
        face.textContent = this._t('Face points');
        face.addEventListener('click', () => this.setTool('face'));
        bar.appendChild(face);
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'rr-btn-chip';
        reset.textContent = this._t('Reset markers');
        reset.addEventListener('click', () => {
            this._rigMarkers = ModelRigger.defaultMarkers(
                this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 }, this._rigTemplate);
            this._buildRigVisuals();
        });
        bar.appendChild(reset);
        if (this.customRig) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'rr-btn-chip-danger';
            remove.textContent = this._t('Remove rig');
            remove.addEventListener('click', () => this.removeRig());
            bar.appendChild(remove);
        }
        const hint = document.createElement('span');
        hint.style.cssText = 'color:var(--color-text-muted);';
        hint.textContent = this._t('Drag the markers onto the joints; sides mirror.') + ' ' + this._t('Markers snap into the model; a faint one floats outside it.') + ' ' + this._t('Wheel zooms toward the pointer; Shift-drag pans.');
        bar.appendChild(hint);
    }

    /** Face authoring uses the same right-hand card and axis controls as transforms. */
    _renderFacePointCard(card) {
        card.style.display = 'block';
        card.style.width = '280px';
        card.style.padding = '10px 12px';
        card.innerHTML = '';
        const selection = this._modelSelection;
        const key = this._facePoint;
        const pick = document.createElement('select');
        const current = () => this._rigFaceMode && selection === this._modelSelection
            && key === this._facePoint && card.isConnected && card.contains(pick);
        const heading = document.createElement('div');
        heading.className = 'r3d-face-heading';
        const title = document.createElement('strong');
        title.textContent = this._t('Face points');
        heading.appendChild(title);
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'r3d-face-close';
        close.title = this._t('Close'); close.setAttribute('aria-label', close.title);
        close.textContent = '×';
        close.addEventListener('click', () => { if (current()) this.setTool('orbit'); });
        heading.appendChild(close); card.appendChild(heading);
        const row = (text, control) => {
            const label = document.createElement('label');
            label.className = 'r3d-face-field';
            const caption = document.createElement('span'); caption.textContent = text;
            label.append(caption, control); card.appendChild(label);
        };
        pick.className = 'r3d-face-point';
        for (const marker of ModelRigger.FACE_MARKERS) {
            const option = document.createElement('option');
            option.value = marker.key; option.textContent = this._t(marker.label);
            pick.appendChild(option);
        }
        pick.value = key;
        pick.addEventListener('change', () => {
            if (!current()) return;
            this._facePoint = pick.value;
            this._syncFacePointVisuals();
            this.renderEditCard();
        });
        row(this._t('Target'), pick);
        const follow = document.createElement('select');
        follow.className = 'r3d-face-follow';
        follow.title = this._t('Follow part / bone');
        const bound = this._faceBindings[key] || '';
        for (const name of new Set(['', ...this.partNames, bound])) {
            const option = document.createElement('option');
            option.value = name; option.textContent = name || this._t('Whole model'); follow.appendChild(option);
        }
        follow.value = bound;
        follow.addEventListener('change', () => { if (current()) this._faceBindings[key] = follow.value; });
        row(this._t('Follow'), follow);
        const caption = document.createElement('div');
        caption.className = 'r3d-face-position-title';
        caption.textContent = this._t('Position'); card.appendChild(caption);
        const coordinates = document.createElement('div');
        coordinates.className = 'r3d-face-coordinates';
        const span = this._modelSpan();
        coordinates.innerHTML = this._axisSlidersHtml('r3d-face-slider', {
            min: -span, max: span, step: 0.001,
            value: axis => this._rigMarkers[key][axis], show: value => Number(value.toFixed(4))
        });
        card.appendChild(coordinates);
        coordinates.querySelectorAll('.r3d-face-slider').forEach(slider => {
            const axis = Number(slider.dataset.i);
            slider.setAttribute('aria-label', ['X', 'Y', 'Z'][axis]);
            const readout = coordinates.querySelector(`.r3d-face-slider-val[data-i="${axis}"]`);
            const input = document.createElement('input');
            input.type = 'number'; input.step = '0.001';
            input.className = 'r3d-face-number'; input.dataset.i = axis;
            input.style.cssText = 'flex:0 0 86px;min-width:0;width:86px;';
            input.setAttribute('aria-label', ['X', 'Y', 'Z'][axis]);
            readout.replaceWith(input);
            const edit = value => {
                if (!current() || !Number.isFinite(value)) return;
                this._rigMarkers[key][axis] = value;
                this._syncFacePointVisuals();
                this._syncFacePointControls();
            };
            slider.addEventListener('input', () => edit(slider.valueAsNumber));
            slider.addEventListener('dblclick', () => edit(this._faceMarkerBaseline[key][axis]));
            input.addEventListener('input', () => edit(input.valueAsNumber));
            // Reconcile an empty/invalid field on departure without rebuilding a held stepper.
            input.addEventListener('blur', () => { if (current()) this._syncFacePointControls(); });
        });
        if (key !== 'eyes') {
            const interior = document.createElement('select');
            interior.className = 'r3d-face-interior';
            for (const [value, text] of [['dark', 'Dark cavity'], ['none', 'None']]) {
                const option = document.createElement('option'); option.value = value;
                option.textContent = this._t(text); interior.appendChild(option);
            }
            interior.value = this._faceInterior;
            interior.addEventListener('change', () => {
                if (!current()) return;
                this._faceInterior = interior.value; this._stopMouthPreview(); this.renderEditCard();
            });
            row(this._t('Mouth interior'), interior);
            if (this._faceInterior !== 'none') {
                const color = document.createElement('input'); color.type = 'color';
                color.className = 'r3d-face-interior-color'; color.value = this._faceInteriorColor;
                color.addEventListener('input', () => {
                    if (!current()) return;
                    this._faceInteriorColor = color.value; this._stopMouthPreview();
                });
                row(this._t('Color'), color);
            }
            const preview = document.createElement('input');
            preview.type = 'range'; preview.min = 0; preview.max = 1; preview.step = 0.01;
            preview.className = 'r3d-face-mouth-preview'; preview.value = 0;
            preview.addEventListener('input', () => {
                if (!current() || !Reactor3D.Speech) return;
                if (!this._faceSpeechDriver) {
                    Reactor3D.bindModelLandmarks(this._object, this._facePointRecords());
                    this._faceSpeechDriver = Reactor3D.Speech.prepare(this._object);
                }
                this._faceSpeechDriver.apply(preview.valueAsNumber);
                this._lastInputAt = performance.now();
            });
            row(this._t('Preview mouth'), preview);
        }
        const save = document.createElement('button');
        save.type = 'button'; save.className = 'rr-button-primary r3d-face-save';
        save.textContent = this._t('Save face points');
        save.addEventListener('click', () => { if (current()) this.saveFacePoints(); });
        card.appendChild(save);
        const hint = document.createElement('div');
        hint.className = 'r3d-face-help';
        hint.textContent = this._t('Drag points onto the face. Eyes set the first-person camera; mouth and lips are attachment points.');
        card.appendChild(hint);
        this._syncFacePointControls();
    }

    _syncFacePointControls() {
        if (!this._rigFaceMode || !this._detail) return;
        const values = this._rigMarkers[this._facePoint], span = this._modelSpan();
        this._detail.querySelectorAll('.r3d-face-slider, .r3d-face-number').forEach(input => {
            const value = values[Number(input.dataset.i)];
            if (input.type === 'range') {
                // Numeric entry and free dragging may legitimately leave the model bounds.
                input.min = Math.floor(Math.min(-span, value) * 1000) / 1000;
                input.max = Math.ceil(Math.max(span, value) * 1000) / 1000;
            }
            if (input.type === 'range' || document.activeElement !== input) input.value = Number(value.toFixed(4));
        });
    }

    /** Move existing overlay resources; an input or drag never rebuilds the card or meshes. */
    _syncFacePointVisuals() {
        if (!this._rigFaceMode || !this._object || !this._rigMarkerMeshes) return;
        this._stopMouthPreview();
        for (const [key, sphere] of Object.entries(this._rigMarkerMeshes)) {
            sphere.position.fromArray(this._rigMarkers[key]);
            sphere.visible = key === this._facePoint;
            const label = this._rigMarkerLabels?.[key];
            if (label) {
                label.position.copy(sphere.position);
                label.position.y += Math.max(sphere.geometry.parameters.radius * 2.6, label.scale.y * 0.8);
                label.visible = sphere.visible;
            }
        }
        if (typeof RRAxisArrows3D !== 'undefined' && this._scene) {
            if (!this._faceArrows) {
                this._faceArrows = RRAxisArrows3D.create(THREE, Math.max(0.04, this._previewSpan() * 0.12), 'face-point-arrows');
                this._faceArrows.root.traverse(node => { node.userData.__reactorOverlay = true; });
                this._scene.add(this._faceArrows.root);
            }
            const world = this._object.localToWorld(new THREE.Vector3().fromArray(this._rigMarkers[this._facePoint]));
            RRAxisArrows3D.sync(this._faceArrows, world, true);
        }
        this._lastInputAt = performance.now();
    }

    _pickFacePointArrow(clientX, clientY) {
        if (!this._rigFaceMode || !this._faceArrows || !this._object) return null;
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        const grab = RRAxisArrows3D.pick(THREE, this._faceArrows, this._camera, rect, clientX, clientY);
        if (!grab) return null;
        RRAxisArrows3D.emphasize(this._faceArrows, grab.axis, true);
        return { grab, key: this._facePoint, object: this._object,
            start: this._object.localToWorld(new THREE.Vector3().fromArray(this._rigMarkers[this._facePoint])) };
    }

    _dragFacePointArrow(hold, clientX, clientY) {
        if (!hold || !this._rigFaceMode || hold.object !== this._object || hold.key !== this._facePoint) return;
        const world = hold.start.clone();
        world[hold.grab.axis] += hold.grab.travel(clientX, clientY);
        const local = this._object.worldToLocal(world);
        if (!local.toArray().every(Number.isFinite)) return;
        this._rigMarkers[hold.key] = local.toArray();
        this._syncFacePointVisuals();
        this._syncFacePointControls();
    }

    _stopMouthPreview() {
        this._faceSpeechDriver?.dispose();
        this._faceSpeechDriver = null;
        const slider = this._detail?.querySelector('.r3d-face-mouth-preview');
        if (slider) slider.value = 0;
    }

    _facePointRecords() {
        const points = {};
        for (const marker of ModelRigger.FACE_MARKERS) {
            const part = this._faceBindings[marker.key] || '';
            const node = Reactor3D.landmarkNode(this._object, part) || this._object;
            const world = this._object.localToWorld(new THREE.Vector3().fromArray(this._rigMarkers[marker.key]));
            points[marker.key] = { part, offset: node.worldToLocal(world).toArray() };
        }
        points.mouth.interior = this._faceInterior || 'dark';
        points.mouth.interiorColor = this._faceInteriorColor || '#080808';
        return points;
    }

    saveFacePoints() {
        if (!this._rigFaceMode || !this._object) return;
        this._stopMouthPreview();
        const points = this._facePointRecords();
        const fs = require('fs');
        try {
            const previous = this._readSidecarForUpdate(fs);
            const json = previous ? JSON.parse(previous) : {};
            if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('model.json must contain a JSON object');
            json.landmarks = points;
            this._writeFileAtomic(fs, this.rulesPath(), JSON.stringify(json, null, 2) + '\n');
        } catch (error) {
            this._reportModelSaveError(error);
            throw error;
        }
        this.landmarks = points;
        Reactor3D.bindModelLandmarks(this._object, points);
        if (typeof RREventPreviewModels !== 'undefined') RREventPreviewModels.clear?.();
        this.projectController?.refreshMap3DView?.();
        this._modelRecordStatus(this._t('Face points saved.'));
    }

    /**
     * Solve skin weights against the template's meshes and persist the
     * rig. The solve runs on model-space vertices — the same frame carve
     * pivots use — so the runtime's bind reproduces the preview exactly.
     */
    bindRig() {
        if (typeof ModelRigger === 'undefined' || typeof Reactor3D === 'undefined'
            || !this._template) return;
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = this._t('Binding rig…');
        setTimeout(() => {
            const template = this._template;
            template.updateMatrixWorld(true);
            const targets = Reactor3D.carveTargetMeshes(template);
            const meshes = targets.map(mesh => {
                const relative = new THREE.Matrix4();
                for (let node = mesh; node && node !== template; node = node.parent) {
                    node.updateMatrix();
                    relative.premultiply(node.matrix);
                }
                const attribute = mesh.geometry.getAttribute('position');
                const positions = new Float32Array(attribute.count * 3);
                const point = new THREE.Vector3();
                for (let v = 0; v < attribute.count; v++) {
                    point.fromBufferAttribute(attribute, v).applyMatrix4(relative);
                    positions[v * 3] = point.x;
                    positions[v * 3 + 1] = point.y;
                    positions[v * 3 + 2] = point.z;
                }
                const index = mesh.geometry.getIndex();
                return { positions, index: index ? index.array : null };
            });
            const bones = ModelRigger.bonesFromMarkers(this._rigMarkers, this._rigTemplate);
            const size = template.userData.glbSize || { y: 1 };
            const results = ModelRigger.computeWeights(meshes, bones, { height: size.y });
            const built = ModelRigger.buildRigBinary(
                JSON.parse(JSON.stringify(this._rigMarkers)), bones, results, this._rigTemplate);
            this.customRig = built.rig;
            // The preview reads decoded weights straight off the rig; the
            // file write happens in saveRig. weightsBin never reaches JSON.
            this.customRig.weightsBin = ModelRigger.decodeWeightsBinary(built.binary);
            this._rigBinary = built.binary;
            this.saveRig();
            this._rebuildInstance();
            this.renderRigBar();
            this._refreshMotionsButton();
            if (status) {
                const total = meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
                status.textContent = this._t('Rig bound — {bones} bones, {vertices} vertices', {
                    bones: bones.length,
                    vertices: total
                });
            }
        }, 30);
    }

    removeRig() {
        this.customRig = null;
        this._rigBinary = null;
        this.saveRig();
        this._rebuildInstance();
        this.renderRigBar();
        this._refreshMotionsButton();
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = this._t('Rig removed.');
    }

    /** The rig writes its own sidecar key; mergeSidecar leaves it alone. */
    saveRig() {
        const fs = require('fs');
        let json = {};
        const previous = this._readSidecarForUpdate(fs);
        if (previous) {
            const parsed = JSON.parse(previous);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('model.json must contain a JSON object');
            }
            json = parsed;
        }
        if (this.customRig) json.rig = this.customRig;
        else delete json.rig;
        // weightsBin is the in-memory decode; the bytes live in their own
        // file beside the JSON, never inside it.
        this._writeFileAtomic(fs, this.rulesPath(),
            JSON.stringify(json, (key, value) => key === 'weightsBin' ? undefined : value, 2) + '\n');
        const path = require('path');
        const binPath = path.join(path.dirname(this.rulesPath()), 'model.rig.bin');
        if (this.customRig && this._rigBinary) {
            this._writeFileAtomic(fs, binPath, Buffer.from(this._rigBinary));
        } else if (!this.customRig && fs.existsSync(binPath)) {
            fs.rmSync(binPath, { force: true });
        }
    }

    /** The Motions library applies to rigged models only. */
    _refreshMotionsButton() {
        const row = this._detail ? this._detail.querySelector('.r3d-motions-row') : null;
        if (!row) return;
        const available = this.customRig && typeof RigMotionPresets !== 'undefined'
            && RigMotionPresets.forTemplate((this.customRig && this.customRig.template) || 'humanoid').length > 0;
        row.style.display = available ? '' : 'none';
    }

    /**
     * Preset Motions: the plug-and-play library for the rig's template.
     * Applying one drops its rules into the Animations list as ordinary,
     * fully editable animations — reapplying replaces that preset's rules.
     */
    showMotionPresets() {
        if (!this.customRig || typeof RigMotionPresets === 'undefined') return;
        const template = ModelRigger.TEMPLATES[this.customRig.template]
            ? this.customRig.template : 'humanoid';
        const presets = RigMotionPresets.forTemplate(template);
        if (!presets.length) return;

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'rr-modal';
        modal.style.cssText = 'width: min(560px, calc(100vw - 24px));';
        modal.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${this._t('Preset Motions')}</div>
                <button class="rr-modal-close r3d-presets-close" type="button">×</button>
            </div>
            <div class="rr-modal-body">
                <div style="font-size:11px;color:var(--color-text-muted);">${this._t('Starting points — every rule lands in the Animations list, editable like any other.')}</div>
                <div class="r3d-preset-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;"></div>
            </div>
            <div class="rr-modal-footer">
                <button class="rr-btn-secondary r3d-presets-done">${this._t('Close')}</button>
            </div>`;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        modal.querySelector('.r3d-presets-close').addEventListener('click', close);
        modal.querySelector('.r3d-presets-done').addEventListener('click', close);
        // A click on the backdrop no longer closes the dialog: close deliberately.

        const grid = modal.querySelector('.r3d-preset-grid');
        for (const preset of presets) {
            const triggers = [...new Set(preset.rules.map(rule => rule.trigger || 'always'))];
            const applied = () => this.rawAnimations.some(raw => raw.name === preset.name);
            const card = document.createElement('div');
            card.style.cssText = 'border:1px solid var(--color-border);border-radius:6px;'
                + 'padding:8px 10px;background:var(--color-bg-panel);display:flex;flex-direction:column;gap:4px;';
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:bold;font-size:12px;color:var(--color-text);';
            title.textContent = this._t(preset.name);
            const detail = document.createElement('div');
            detail.style.cssText = 'font-size:10px;color:var(--color-text-muted);';
            detail.textContent = `${preset.rules.length} × · ${triggers.map(t => this._t(
                t === 'moving' ? 'While moving' : t === 'walking' ? 'While walking'
                    : t === 'dashing' ? 'While dashing' : t === 'idle' ? 'While idle'
                    : t === 'action' ? 'On demand' : 'Always')).join(', ')}`;
            const apply = document.createElement('button');
            apply.type = 'button';
            apply.className = 'rr-btn-chip';
            // The i18n observer reverts programmatic label changes on
            // translated buttons; this label is dynamic by design.
            apply.setAttribute('data-rr-i18n-skip', '1');
            const refreshLabel = () => {
                apply.textContent = applied() ? `✓ ${this._t('Applied')}` : this._t('Apply');
            };
            refreshLabel();
            apply.addEventListener('click', () => {
                this.applyMotionPreset(preset);
                refreshLabel();
            });
            card.appendChild(title);
            card.appendChild(detail);
            card.appendChild(apply);
            grid.appendChild(card);
        }
    }

    applyMotionPreset(preset) {
        // Reapplying replaces the preset's own rules; hand-authored ones
        // (different names) are untouched.
        this.rawAnimations = this.rawAnimations.filter(raw => raw.name !== preset.name);
        for (const rule of preset.rules) {
            this.rawAnimations.push(JSON.parse(JSON.stringify(rule)));
        }
        this.saveRules();
        this.renderRuleList();
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = `${this._t(preset.name)} — ${this._t('Applied')}`;
    }

    /** Whether a part name belongs to the rig's skeleton. */
    _isRigBoneName(name) {
        return !!(this.customRig && Array.isArray(this.customRig.bones)
            && this.customRig.bones.some(bone => bone.name === name));
    }

    /** The dominant bone under a face of a skinned mesh, for click-to-pose. */
    _dominantBoneName(mesh, face) {
        const skinIndex = mesh.geometry.getAttribute('skinIndex');
        const skinWeight = mesh.geometry.getAttribute('skinWeight');
        if (!skinIndex || !skinWeight || !mesh.skeleton) return null;
        const totals = new Map();
        for (const vertex of [face.a, face.b, face.c]) {
            for (let k = 0; k < 4; k++) {
                const bone = skinIndex.getComponent(vertex, k);
                const weight = skinWeight.getComponent(vertex, k);
                totals.set(bone, (totals.get(bone) || 0) + weight);
            }
        }
        let best = -1;
        let bestWeight = 0;
        for (const [bone, weight] of totals) {
            if (weight > bestWeight) { bestWeight = weight; best = bone; }
        }
        const boneObject = best >= 0 ? mesh.skeleton.bones[best] : null;
        // A file bone the rig names is picked by the rig's name for it.
        const part = boneObject && boneObject.userData && boneObject.userData.parts && boneObject.userData.parts[0];
        return part ? part.name : (boneObject ? boneObject.name : null);
    }

    /** Bounds of a binding entry: geometry for meshes, the segment for bones. */
    _expandEntry(box, entry) {
        const mesh = entry.mesh;
        if (!(mesh.isBone || (mesh.userData && mesh.userData.__reactorClipBone))) {
            box.expandByObject(mesh);
            return;
        }
        mesh.updateWorldMatrix(true, false);
        const head = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
        box.expandByPoint(head);
        let leaf = true;
        for (const child of mesh.children) {
            if (!(child.isBone || (child.userData && child.userData.__reactorClipBone))) continue;
            leaf = false;
            child.updateWorldMatrix(true, false);
            box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld));
        }
        const tail = mesh.userData.__reactorBoneTail;
        if (leaf && tail && this._object) {
            box.expandByPoint(this._object.localToWorld(new THREE.Vector3().fromArray(tail)));
        }
        box.expandByScalar(0.05);
    }

    // ------------------------------------------------------------------
    // Simulation bar and the animation list

    renderSimBar() {
        const bar = this._detail.querySelector('.r3d-sim-bar');
        if (!bar) return;
        bar.innerHTML = '';
        const walk = document.createElement('button');
        walk.type = 'button';
        walk.className = this._sim.walking ? 'rr-button-primary' : 'rr-btn-secondary';
        walk.textContent = this._t('Walk');
        walk.addEventListener('click', () => {
            this._sim.walking = !this._sim.walking;
            if (!this._sim.walking) this._sim.dashing = false;
            this.renderSimBar();
        });
        bar.appendChild(walk);
        const dash = document.createElement('button');
        dash.type = 'button';
        dash.className = this._sim.dashing ? 'rr-button-primary' : 'rr-btn-secondary';
        dash.textContent = this._t('Dash');
        dash.addEventListener('click', () => {
            this._sim.dashing = !this._sim.dashing;
            if (this._sim.dashing) this._sim.walking = true;
            this.renderSimBar();
        });
        bar.appendChild(dash);
        // Multi-bone actions share one name and fire together, so one
        // Play button per NAME — a preset's six rules are one motion.
        const seenActions = new Set();
        this.playRules.forEach((rule, index) => {
            if (rule.trigger !== 'action') return;
            if (seenActions.has(rule.name) && index !== this._editingRule) return;
            seenActions.add(rule.name);
            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'rr-btn-secondary';
            play.textContent = `${this._t('Play')}: ${rule.name}`;
            play.addEventListener('click', () => {
                // The rule on the card steps aside for the working copy,
                // so its Play button previews the card's current values.
                if (index === this._editingRule) {
                    this.previewPose();
                    return;
                }
                this._sim.action = {
                    name: rule.name,
                    frame: this._simFrame || 0,
                    until: Reactor3D.modelRuleDuration(rule, this._binding ? this._binding.clips : null)
                };
            });
            bar.appendChild(play);
        });
        // Held poses latch; give the simulation a way to let go.
        if (this.playRules.some(rule => rule.type === 'pose' && rule.hold)) {
            const rest = document.createElement('button');
            rest.type = 'button';
            rest.className = 'rr-btn-secondary';
            rest.textContent = this._t('Reset pose');
            rest.addEventListener('click', () => {
                if (this._binding) this._binding.latch = {};
                // The in-flight action would re-latch next frame.
                this._sim.action = null;
            });
            bar.appendChild(rest);
        }
    }

    ruleSummary(raw) {
        const type = ['swing', 'bob', 'clip', 'pose'].indexOf(raw.type) >= 0 ? raw.type : 'spin';
        const label = type === 'clip' ? this._t('Clip')
            : type === 'pose' ? this._t('Pose')
            : type === 'swing' ? this._t('Swing') : type === 'bob' ? this._t('Bob') : this._t('Spin');
        const trigger = raw.trigger === 'idle' ? this._t('While idle')
            : raw.trigger === 'moving' ? this._t('While moving')
            : raw.trigger === 'walking' ? this._t('While walking')
            : raw.trigger === 'dashing' ? this._t('While dashing')
            : raw.trigger === 'action' ? this._t('On demand') : this._t('Always');
        const subject = type === 'clip' ? (raw.clip || '?') : (raw.part || this._t('Whole model'));
        return `${raw.name || '?'} — ${label} · ${subject} · ${trigger}`;
    }

    renderRuleList() {
        const list = this._detail.querySelector('.r3d-rule-list');
        list.innerHTML = '';
        this.rawAnimations.forEach((raw, index) => {
            const row = document.createElement('div');
            row.dataset.modelRecordIndex = String(index);
            row.textContent = this.ruleSummary(raw);
            row.style.cssText = 'padding:4px 10px;cursor:pointer;font-size:12px;color:var(--color-text);'
                + (index === this.selectedRule ? 'background:var(--color-accent-tint-25);' : '');
            row.addEventListener('click', () => {
                this.selectedRule = index;
                this.renderRuleList();
                this._refreshHighlight();
                // Any animation opens straight into the card that edits it.
                this.editRule(index);
            });
            list.appendChild(row);
        });
        this._renderEmbeddedClipRows(list);
        this.renderEffectList();
        this.renderEffectForm();
    }

    /**
     * A GLB's baked animation clips, listed under the saved rules so they
     * are playable (and adoptable as on-demand animations) without first
     * authoring a Clip rule on the card.
     */
    _renderEmbeddedClipRows(list) {
        const clips = this.embeddedClips || [];
        if (!clips.length) return;
        const header = document.createElement('div');
        header.textContent = this._t('Embedded clips');
        header.style.cssText = 'padding:8px 10px 2px;font-size:11px;font-weight:bold;'
            + 'color:var(--color-text-muted);border-top:1px solid var(--color-border);margin-top:6px;';
        list.appendChild(header);
        for (const clipName of clips) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 10px;'
                + 'font-size:12px;color:var(--color-text);';
            const label = document.createElement('span');
            label.textContent = clipName;
            label.setAttribute('data-rr-i18n-skip', '1');
            label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'rr-btn-chip';
            play.textContent = '▶';
            play.title = this._t('Play');
            play.setAttribute('data-rr-i18n-skip', '1');
            play.addEventListener('click', () => this.playEmbeddedClip(clipName));
            const added = this.rawAnimations.some(raw => raw.type === 'clip' && raw.clip === clipName);
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'rr-btn-chip';
            add.textContent = added ? '✓' : '＋';
            add.title = this._t('Add');
            add.setAttribute('data-rr-i18n-skip', '1');
            add.disabled = added;
            if (!added) add.addEventListener('click', () => this.addEmbeddedClipRule(clipName));
            row.appendChild(label);
            row.appendChild(play);
            row.appendChild(add);
            list.appendChild(row);
        }
    }

    /** Play a baked clip straight from the list, no rule required. */
    playEmbeddedClip(clipName) {
        if (typeof Reactor3D === 'undefined' || !this._binding) return;
        const values = { type: 'clip', trigger: 'action' };
        values.name = '__preview';
        values.clip = clipName;
        this._previewRule = Reactor3D.readModelAnimationRules({ animations: [values] })[0];
        this._workSuppressed = false;
        this._sim.action = {
            name: values.name,
            frame: this._simFrame || 0,
            until: Reactor3D.modelRuleDuration(this._previewRule, this._binding.clips)
        };
    }

    /** Adopt a baked clip as a saved on-demand animation named after it. */
    addEmbeddedClipRule(clipName) {
        const values = { type: 'clip', trigger: 'action' };
        values.name = clipName;
        values.clip = clipName;
        this.rawAnimations.push(values);
        this.saveRules();
        this.rebuildPlayback();
        this.renderRuleList();
    }

    /** Add opens the card on a fresh, motionless animation. */
    addRule() {
        if (this.selectedPartName === null) this.selectedPartName = '';
        this._editingRule = -1;
        this.selectedRule = -1;
        this._resetWork();
        this._cardCollapsed = false;
        this._syncWorkRule();
        this.renderRuleList();
        this.renderEditCard();
        this._refreshPartVisuals();
        this._refreshHint();
    }

    deleteRule() {
        const index = this.selectedRule;
        if (index < 0 || !this.rawAnimations[index]) return;
        if (this._editingRule === index) {
            this.deselectPart();
        } else if (this._editingRule > index) {
            this._editingRule--;
        }
        // Remembered work points at rules by index; keep it pointing.
        for (const snapshot of Object.values(this._poses)) {
            if (snapshot.editingRule === index) snapshot.editingRule = -1;
            else if (snapshot.editingRule > index) snapshot.editingRule--;
        }
        this.rawAnimations.splice(index, 1);
        this.selectedRule = Math.min(index, this.rawAnimations.length - 1);
        this.saveRules();
        this.renderRuleList();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Database3DEditor;
}
