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
    /** Above this a scroll zooms toward the model's box rather than ray-testing its triangles. */
    static get WHEEL_RAYCAST_BUDGET() { return 30000; }

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
     * Whether the preview should draw this frame. Anything active keeps the
     * full refresh rate, and a change that asked for a frame (`dirty`) gets
     * one; a still model is not drawn again at all. It used to repaint ten
     * times a second to catch changes the activity checks missed, which kept
     * an integrated GPU busy for a picture that never changed: those changes
     * now say so (any input in the window, a hover, a texture landing, a
     * theme switch, a resize).
     */
    static shouldRenderPreview({ active, dirty, lastRenderAt }) {
        if (active || dirty) return true;
        return !(lastRenderAt > 0);
    }

    /** Input anywhere in the document that can change what the preview shows, dialogs it opens included. */
    static PREVIEW_INPUT_EVENTS = ['pointerdown', 'pointerup', 'wheel', 'input', 'change', 'click', 'keydown', 'keyup', 'drop'];

    /** Ask the preview for a second of full-rate frames: an edit may take a few frames to settle. */
    _invalidatePreview() {
        this._invalidatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this._previewDirty = true;
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
        // The model's variants (model.json › variants) and the one in view ('' is the model's own look).
        this.rawVariants = [];
        this._variant = '';
        this.variantsPanel = typeof ModelVariantsPanel !== 'undefined' ? new ModelVariantsPanel(this) : null;
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
        this._sim = { walking: false, jumping: false, swimming: false, climbing: false, riding: false, action: null };
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
        // A motion (every pose rule sharing a name) is edited as one, on one timeline.
        this.motionEditor = typeof RRMotionEditor !== 'undefined' ? new RRMotionEditor(this) : null;
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
            this._releaseAllTemplates();
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
        // One anatomy for every section of the column: title, count, one Add.
        const sectionHead = (sec, title, add) => `
                        <div class="lit-section-header r3d-sec-header" data-sec="${sec}" tabindex="0" role="button" aria-expanded="true">
                            <span class="r3d-sec-toggle">▾</span>
                            <span class="r3d-sec-title">${title}</span>
                            <span class="r3d-sec-count" data-rr-i18n-skip="1"></span>
                            <button type="button" class="r3d-sec-add ${add}" title="${this._t('Add')}" aria-label="${this._t('Add')}">${Database3DEditor.icon('add')}</button>
                        </div>`;
        detailEl.innerHTML = `
            <div style="display:flex;flex-direction:row;gap:0;height:100%;min-height:0;">
                <div class="r3d-browser-column" style="width:220px;flex:0 0 220px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);min-height:0;">
                    <div class="database-section-title">${window.I18n?.tDbType ? window.I18n.tDbType('reactor3d', '3D Models') : '3D Models'}</div>
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
                        <div class="r3d-sim-bar r3d-preview-states" role="group"></div>
                        <div class="r3d-marquee" style="position:absolute;display:none;border:1px dashed var(--color-accent);background:color-mix(in srgb, var(--color-accent) 15%, transparent);pointer-events:none;"></div>
                        <div class="r3d-card" style="position:absolute;right:10px;top:10px;width:280px;max-width:calc(100% - 56px);box-sizing:border-box;display:none;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:6px;padding:10px 12px;box-shadow:0 4px 18px rgba(0,0,0,0.35);"></div>
                        <div class="r3d-stats-card" style="position:absolute;left:8px;bottom:8px;width:272px;max-width:calc(100% - 16px);max-height:55%;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,0.35);overflow:hidden;">
                            <div class="sidebar-header r3d-sec-header" data-sec="stats" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:5px 10px 5px 7px;font-size:11px;">
                                <span class="r3d-sec-toggle" style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">▾</span>
                                <span style="flex:1;">${this._t('Model Specifications')}</span>
                                <button type="button" class="rr-btn-secondary r3d-optimize" style="text-transform:none;font-size:11px;padding:2px 8px;"
                                    title="${this._t('Shrink this model in place. The original is kept beside it.')}">${this._t('Optimize…')}</button>
                            </div>
                            <div class="r3d-stats" style="flex:1 1 auto;min-height:0;overflow-y:auto;padding:6px 10px 8px 10px;font-size:11px;"></div>
                        </div>
                    </div>
                </div>
                <div class="r3d-record-column" style="width:300px;flex:0 0 300px;display:flex;flex-direction:column;border-left:1px solid var(--color-border);min-height:0;">
                    <div class="lit-section r3d-sec" data-sec="parts">
                        ${sectionHead('parts', this._t('Parts'), 'r3d-part-add')}
                        <div class="r3d-sec-body">
                            <div class="r3d-part-list r3d-rows"></div>
                        </div>
                    </div>
                    <div class="lit-section r3d-sec" data-sec="animations" data-model-record-kind="animation">
                        ${sectionHead('animations', this._t('Animations'), 'r3d-rule-add')}
                        <div class="r3d-sec-body">
                            <div class="r3d-rule-list r3d-rows"></div>
                            <div class="r3d-rule-note r3d-sec-note" style="border-top:1px solid var(--color-border);">${this._t('Adjust this pose with the sliders in the preview.')}</div>
                            <div class="r3d-motions-row r3d-sec-foot" style="display:none;">
                                <button type="button" class="rr-btn-secondary r3d-motions">${this._t('Motions…')}</button>
                            </div>
                        </div>
                    </div>
                    <div class="lit-section r3d-sec" data-sec="effects" data-model-record-kind="effect">
                        ${sectionHead('effects', this._k('r3dfx.title'), 'r3d-effect-add')}
                        <div class="r3d-sec-body">
                            <div class="r3d-effect-list r3d-rows"></div>
                        </div>
                    </div>
                    <div class="lit-section r3d-sec" data-sec="look">
                        ${sectionHead('look', this._t('Variants'), 'r3d-look-add')}
                        <div class="r3d-sec-body">
                            <div class="r3d-look-list r3d-rows"></div>
                        </div>
                    </div>
                    <div class="r3d-status" role="status" aria-live="polite"></div>
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
        detailEl.querySelector('.r3d-rule-add').addEventListener('click', () => this._afterEffectWork(() => this.addRule()));
        detailEl.querySelector('.r3d-effect-add').addEventListener('click', () => this.addModelEffect());
        detailEl.querySelector('.r3d-look-add').addEventListener('click', () => this.variantsPanel.add());
        // Each section folds from its header (the buttons stay live), and a
        // click on a list's empty space lets go of whatever was selected.
        // The cost card starts as its one line: it sits over the preview.
        this._sectionsCollapsed = this._sectionsCollapsed || { stats: true };
        // Each section opens the way the user left it in this project.
        detailEl.querySelectorAll('.r3d-sec-header').forEach(header => {
            const name = header.dataset.sec;
            this._sectionsCollapsed[name] = this._recalledSection(name);
            header.addEventListener('click', event => {
                if (event.target.closest('button, input, label')) return;
                this.toggleSection(name);
                this._rememberSection(name);
            });
            header.addEventListener('keydown', event => {
                if (event.target !== header || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                this.toggleSection(name);
                this._rememberSection(name);
            });
        });
        for (const name of Object.keys(this._sectionsCollapsed)) this.toggleSection(name, this._sectionsCollapsed[name]);
        // A change made on an effect's card is one step back.
        detailEl.querySelector('.r3d-card').addEventListener('change', () => {
            if (this._cardMode === 'effect') this._fxCheckpoint();
            else this._refreshUnsaved();
        });
        const clickOff = (selector, clear) => detailEl.querySelector(selector)?.addEventListener('click', event => {
            if (event.target === event.currentTarget) clear();
        });
        clickOff('.r3d-effect-list', () => { if (this._cardMode === 'effect') this.closeEffectCard(); });
        clickOff('.r3d-rule-list', () => this._afterEffectWork(() => { this.selectedRule = -1; this.deselectPart(); }));
        clickOff('.r3d-part-list', () => this._afterEffectWork(() => this.deselectPart()));
        clickOff('.r3d-look-list', () => this.variantsPanel.closeCard());
        this._bindModelRecordLists();
        detailEl.querySelector('.r3d-part-add').addEventListener('click', () => this._afterEffectWork(() => this.addPart()));
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
        // A dialog over the page (Preset Motions, a picker) takes its own keys.
        if (event.target && event.target.closest && event.target.closest('.rr-modal-overlay')) return;
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
        // With a section's list in hand: Delete removes the selected row, the arrows move the selection.
        const rows = !editingText && event.target?.closest?.('.r3d-rows');
        if (rows && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (event.key === 'Delete') {
                if (this.deleteSelectedRow(rows.closest('.r3d-sec')?.dataset.sec)) consume();
                return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
                const all = [...rows.querySelectorAll('.r3d-row:not(.is-plain)')];
                const at = all.findIndex(row => row.classList.contains('is-selected'));
                const next = event.key === 'Enter' ? all[Math.max(0, at)] : all[at < 0 ? 0 : Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
                if (next && (event.key === 'Enter' || next !== all[at])) next.click();
                consume();
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
        // An effect's card and a look's card have their own steps back.
        if ((this._cardMode === 'effect' || this._cardMode === 'look') && (event.ctrlKey || event.metaKey) && !event.altKey
            && !(event.target && event.target.tagName === 'INPUT' && event.target.type !== 'range' && event.target.type !== 'checkbox')) {
            const key = event.key.toLowerCase();
            const back = key === 'z' && !event.shiftKey, forward = key === 'y' || (key === 'z' && event.shiftKey);
            if (back || forward) {
                if (this._cardMode === 'look') { if (back) this.variantsPanel.undo(); else this.variantsPanel.redo(); }
                else if (back) this.undoEffect();
                else this.redoEffect();
                consume();
                return;
            }
        }
        if (event.key === 'Escape' && (this._cardMode === 'effect' || this._cardMode === 'look') && !(this.motionEditor && this.motionEditor.active)) {
            if (this._tool === 'fxanchor') this.setTool('orbit');
            else if (this._cardMode === 'look') this.variantsPanel.closeCard();
            else this.closeEffectCard();
            consume();
            return;
        }
        // Escape leaves the Motion editor before it would close the database.
        if (event.key === 'Escape' && this.motionEditor && this.motionEditor.active) {
            this.motionEditor.close();
            consume();
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
        // Every section's list takes the keyboard: the arrows move its selection, Delete removes the row.
        for (const selector of ['.r3d-part-list', '.r3d-rule-list', '.r3d-effect-list', '.r3d-look-list']) {
            const list = this._detail.querySelector(selector);
            if (!list) continue;
            list.tabIndex = 0;
            list.setAttribute?.('role', 'listbox');
            list.addEventListener('pointerdown', event => { if (!event.target?.closest?.('input, button')) list.focus({ preventScroll: true }); });
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

    /** A pasted effect names only the variants this model has; with none of them, every variant wears it. */
    _tidyWorn(effect) {
        if (!effect || !('variants' in effect)) return effect;
        const names = [''].concat((this.rawVariants || []).map(variant => variant.name));
        const list = (Array.isArray(effect.variants) ? effect.variants : []).filter(name => names.includes(name));
        if (list.length && list.length < names.length) effect.variants = list;
        else delete effect.variants;
        return effect;
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
                const effect = this._tidyWorn(JSON.parse(JSON.stringify(source)));
                effect.name = uniqueName(effect.name, this.rawEffects);
                this.rawEffects.push(effect);
                renamed.set(source.name, effect.name);
            }
            for (const step of record.effects) if (renamed.has(step?.effect)) step.effect = renamed.get(step.effect);
        }
        if (kind === 'effect') this._tidyWorn(record);
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
            // Another model, once this one's unsaved work is saved or let go.
            row.addEventListener('click', async () => { if (await this.settlePending()) this.selectModel(entry); });
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

    /**
     * A loaded model is kept while the preview shows it, and the newest few
     * beside it so stepping back is free; the rest are given back
     * (RRModelRelease), as is one loaded only to draw its thumbnail.
     */
    static TEMPLATES_KEPT = 1;
    /** Thumbnail pictures held in memory; the rest are read back from the on-disk cache. */
    static THUMBNAILS_KEPT = 256;
    /** The thumbnail renderer and its context are dropped this long after the last thumbnail. */
    static THUMBNAIL_RENDERER_REST_MS = 4000;

    _touchTemplate(name) {
        const order = this._templateOrder || (this._templateOrder = []);
        const at = order.indexOf(name);
        if (at >= 0) order.splice(at, 1);
        order.push(name);
    }

    /** Give one loaded model back. The one in the preview stays unless `force`. */
    _releaseTemplate(name, force = false) {
        const template = this._templates && this._templates[name];
        if (!template) return false;
        if (!force && (template === this._template || name === this._pinnedTemplate)) return false;
        delete this._templates[name];
        const order = this._templateOrder || [];
        const at = order.indexOf(name);
        if (at >= 0) order.splice(at, 1);
        const release = typeof RRModelRelease !== 'undefined' ? RRModelRelease : null;
        if (release) {
            // What a model that stays also draws from stays.
            const keep = new Set();
            for (const other of Object.values(this._templates)) release.resourcesOf(other, keep);
            release.releaseTemplate(template, keep);
        }
        return true;
    }

    /** The oldest loaded models beyond the few kept are given back. */
    _trimTemplates() {
        const order = this._templateOrder || [];
        const loose = order.filter(name => this._templates && this._templates[name]
            && this._templates[name] !== this._template && name !== this._pinnedTemplate);
        let gone = 0;
        while (loose.length > Database3DEditor.TEMPLATES_KEPT) { if (this._releaseTemplate(loose.shift())) gone++; }
        return gone;
    }

    _releaseAllTemplates() {
        for (const name of Object.keys(this._templates || {})) this._releaseTemplate(name, true);
        this._templateOrder = [];
        this._pinnedTemplate = '';
        this._thumbOnly = null;
    }

    /** The oldest thumbnail pictures beyond the bound leave memory. */
    _trimThumbs() {
        const names = Object.keys(this._thumbs || {});
        for (let i = 0; i < names.length - Database3DEditor.THUMBNAILS_KEPT; i++) delete this._thumbs[names[i]];
    }

    _dropThumbRenderer() {
        clearTimeout(this._thumbRendererTimer);
        this._thumbRendererTimer = null;
        const renderer = this._thumbRenderer;
        this._thumbRenderer = null;
        this._thumbScene = null;
        this._thumbCamera = null;
        if (!renderer) return;
        if (typeof RRModelRelease !== 'undefined') RRModelRelease.dropRenderer(renderer);
        else { try { renderer.dispose(); } catch (error) { /* gone */ } }
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
        if (!(this._templates && this._templates[entry.name])) (this._thumbOnly || (this._thumbOnly = new Set())).add(entry.name);
        const template = await this._loadTemplate(entry, { beforeBuild: () => this._whenPreviewIdle() });
        await this._whenPreviewIdle();
        if (!template || typeof THREE === 'undefined') return null;
        this._trimThumbs();
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
            if (typeof RRModelRelease !== 'undefined') RRModelRelease.track(this._thumbRenderer, 'model-thumbnails');
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
        // The thumbnail is a picture from here on: a model loaded only to draw it is given back
        // (one drawn before its textures landed is kept for the late re-render), and the renderer
        // goes with its context a few seconds after the last thumbnail.
        const settled = Database3DEditor.texturesDecoded(template.userData.glbTextures);
        clearTimeout(this._thumbRendererTimer);
        this._thumbRendererTimer = setTimeout(() => this._dropThumbRenderer(), Database3DEditor.THUMBNAIL_RENDERER_REST_MS);
        try {
            // A picture with nothing in it is a failed render, not a
            // thumbnail: caching it would show a black square for as long as
            // the file keeps its size and date.
            if (!Database3DEditor.canvasHasPixels(this._thumbRenderer.domElement)) return null;
            return this._thumbRenderer.domElement.toDataURL('image/png');
        } catch (error) {
            return null;
        } finally {
            if (settled && this._thumbOnly && this._thumbOnly.delete(entry.name)) this._releaseTemplate(entry.name);
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
        if (templates[entry.name]) { this._touchTemplate(entry.name); return templates[entry.name]; }
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
            if (templates === this._templates) { this._touchTemplate(entry.name); this._trimTemplates(); }
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
            notes.push(this._t('Characters always draw at full detail.'));
        } else if (triangles >= 150000 && String(entry.ext || '.glb').toLowerCase() !== '.glb') {
            notes.push(this._t('Heavy at every distance. Optimize converts it to GLB and cuts triangles.'));
        } else if (triangles >= 150000) {
            notes.push(this._t('Heavy at every distance. Optimize cuts triangles.'));
        }
        if (stats.levels.length) {
            notes.push(this._t('Has separate distance-level files. Optimize clears them.'));
        }
        if (stats.carvedParts) {
            // Parts are triangle ranges into this exact list: a reduction rebuilds them.
            notes.push(this._t('{count} carved part(s). Optimize rebuilds them.', { count: stats.carvedParts }));
        }
        if (stats.largestTexture && stats.largestTexture.width > 2048) {
            notes.push(this._t('Textures over 2K waste memory. Optimize caps them.'));
        } else if (stats.textureBytes > 8 * 1048576) {
            // A light mesh can still be an expensive model: textures are the
            // larger half of most files, and they cost the same however few
            // triangles they are wrapped around.
            notes.push(this._t('{size} of textures. Optimize recompresses them.', { size: mb(stats.textureBytes) }));
        }
        const dead = (a.tangentBytes || 0) + (a.floatWeightBytes || 0);
        if (dead > 65536) {
            notes.push(this._t('{size} of unused data. Optimize drops it.', { size: mb(dead) }));
        }
        if (a.primitives > 24) {
            notes.push(this._t('{count} draw calls, one per piece.', { count: num(a.primitives) }));
        }
        if (stats.optimized) {
            notes.push(this._t('Already optimized (original kept as .orig).'));
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
                if (walk(data)) this._writeFileAtomic(fs, full, (typeof RRJson !== 'undefined' && RRJson.stringify ? RRJson.stringify(data) : JSON.stringify(data, null, 2)) + '\n');
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
                this._writeFileAtomic(fs, sidecarPath, (typeof RRJson !== 'undefined' && RRJson.stringify ? RRJson.stringify(previous) : JSON.stringify(previous, null, 2)) + '\n');
            }

            // Every cache that holds the old geometry has to let go, or the
            // editor keeps drawing the model it loaded at startup.
            this._releaseTemplate(entry.name, true);
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
        this.rawSurface = parsed.surface && typeof parsed.surface === 'object' && !Array.isArray(parsed.surface) ? parsed.surface : null;
        this._surfaceLast = null;
        this.rawVariants = (Array.isArray(parsed.variants) ? parsed.variants : []).filter(v => v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim());
        this._variant = '';
        if (this._cardMode === 'look') this._cardMode = 'part';
        // A media surface a variant left off the first way is now the effect's own list: the next save of the variants writes both.
        this._wornMigrated = typeof ModelVariantsPanel !== 'undefined' && ModelVariantsPanel.migrateOff(this.rawEffects, this.rawVariants);
        this.variantsPanel?.render();
        this.rawCollision = parsed.collision === 'box' ? 'box' : 'mesh';
        this.landmarks = parsed.landmarks && typeof parsed.landmarks === 'object' ? parsed.landmarks : {};
        this.customParts = Array.isArray(parsed.parts) ? parsed.parts : [];
        this.customPivots = parsed.pivots && typeof parsed.pivots === 'object'
            && !Array.isArray(parsed.pivots) ? parsed.pivots : {};
        this.customRig = parsed.rig && typeof parsed.rig === 'object'
            && !Array.isArray(parsed.rig) ? parsed.rig : null;
        this.defaultMotions = parsed.defaultMotions !== false;
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
    static mergeSidecar(previousText, animations, parts, pivots, effects, transform, collision, surface) {
        let json = {};
        if (previousText) {
            const parsed = JSON.parse(previousText);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('model.json must contain a JSON object');
            }
            json = parsed;
        }
        json.animations = animations || [];
        // An effect's list of the variants that wear it is names, once each; an empty one says nothing and goes.
        for (const effect of effects || []) {
            if (!effect || typeof effect !== 'object' || !('variants' in effect)) continue;
            const names = Array.isArray(effect.variants) ? [...new Set(effect.variants.filter(name => typeof name === 'string').map(name => name.trim()))] : [];
            if (names.length) effect.variants = names;
            else delete effect.variants;
        }
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
        // A surface that reflects nothing is no surface: the file's own metal stands.
        if (surface !== undefined) {
            if (surface && Number(surface.reflect) > 0) json.surface = surface;
            else delete json.surface;
        }
        if (parts && parts.length) json.parts = parts;
        else delete json.parts;
        if (pivots && Object.keys(pivots).length) json.pivots = pivots;
        else delete json.pivots;
        return (typeof RRJson !== 'undefined' && RRJson.stringify ? RRJson.stringify(json) : JSON.stringify(json, null, 2)) + '\n';
    }

    /** Every edit writes the model's own sidecar; the runtime reads it as-is. */
    saveRules() {
        const fs = require('fs');
        try {
            const previous = this._readSidecarForUpdate(fs);
            this._writeFileAtomic(fs, this.rulesPath(),
                Database3DEditor.mergeSidecar(previous, this.rawAnimations, this.customParts, this.customPivots, this.rawEffects, this.rawTransform, this.rawCollision, this.rawSurface));
        } catch (error) {
            this._reportModelSaveError(error);
            throw error;
        }
        this.rebuildPlayback();
        this._setStatus(`${this._t('Saved')} — 3d/${this.selectedName}/model.json`);
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
        // One notice at a time: a save that fails again while the first notice
        // is unread (a slider saves at every pause of a drag) only renews the
        // status line, or the notices would queue one behind the other.
        if (typeof RRDialog === 'undefined' || this._saveErrorNotice) return;
        const notice = Promise.resolve(RRDialog.alert(message, { title: this._k('menu.models3d'), kind: 'error' }));
        const closed = () => { if (this._saveErrorNotice === notice) this._saveErrorNotice = null; };
        this._saveErrorNotice = notice;
        notice.then(closed, closed);
    }

    rebuildPlayback() {
        this.playRules = typeof Reactor3D !== 'undefined'
            // With the rig, so the preview plays its default motions as the game does.
            ? Reactor3D.readModelAnimationRules({ animations: this.rawAnimations, rig: this.customRig, defaultMotions: this.defaultMotions })
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
        this.renderPartList();        this.renderRuleList();
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
        // The model in the preview is held; the one before it joins the few kept.
        this._pinnedTemplate = entry.name;
        if (this._thumbOnly) this._thumbOnly.delete(entry.name);
        this._touchTemplate(entry.name);
        this._trimTemplates();
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
            if (typeof RRModelRelease !== 'undefined') RRModelRelease.track(this._renderer, 'model-preview');
            this._renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) this._renderer.outputColorSpace = THREE.SRGBColorSpace;
            // The animation clock counts 60ths of a second of real time,
            // not rAF ticks — a 120Hz display used to run every rule and
            // clip at double speed.
            let frame = 0;
            const startedAt = performance.now();
            // The canvas is measured when it reports a resize, not on every
            // frame: reading its rectangle forces a layout.
            let sizeDirty = true;
            this._unwatchPreviewSize = ModelPreview3D.watchSize(canvas, () => { sizeDirty = true; });
            // Edits made anywhere — the card beside the canvas, a colour
            // dialog over it — ask for frames; nothing else wakes a still
            // preview.
            this._previewInputListener = () => this._invalidatePreview();
            for (const type of Database3DEditor.PREVIEW_INPUT_EVENTS) document.addEventListener(type, this._previewInputListener, true);
            this._previewDirty = true;
            const tick = () => {
                if (!this._renderer || !canvas.isConnected) {
                    this._disposePreview();
                    return;
                }
                frame = Math.round((performance.now() - startedAt) * 0.06);
                if (sizeDirty || !this._unwatchPreviewSize) {
                    sizeDirty = false;
                    const rect = canvas.getBoundingClientRect();
                    const width = Math.max(1, Math.round(rect.width));
                    const height = Math.max(1, Math.round(rect.height));
                    // The drawing buffer is the CSS size times the pixel ratio; comparing CSS pixels to it
                    // resized (and cleared) the buffer on every frame at any display scale but 100%.
                    const ratio = this._renderer.getPixelRatio();
                    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
                        this._renderer.setSize(width, height, false);
                        this._camera.aspect = width / height;
                        this._camera.updateProjectionMatrix();
                        this._previewDirty = true;
                    }
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
                // The Motion editor shows its motion at the playhead, and nothing else moves.
                if (this.motionEditor && this.motionEditor.active) rules = this.motionEditor.previewRules(this.playRules, frame);
                // Decided before any per-frame work: a still model skips the
                // animation, effect and box updates as well as the draw, and
                // only the hover checks run (a hover that changes a part's
                // outline asks for a frame through _refreshPartVisuals).
                const now = performance.now();
                {
                    const goalKey = `${this._viewGoal.yaw}|${this._viewGoal.pitch}|${this._viewGoal.distance}|${this._viewGoal.pan.x}|${this._viewGoal.pan.y}|${this._viewGoal.pan.z}`;
                    if (goalKey !== this._lastGoalKey) {
                        this._lastGoalKey = goalKey;
                        this._lastInputAt = now;
                    }
                }
                const theme = ModelPreview3D.themeKey();
                if (theme !== this._previewTheme) { this._previewTheme = theme; this._previewDirty = true; }
                const textureVersion = ModelPreview3D.textureVersionSum(this._previewTextures);
                if (textureVersion !== this._previewTextureVersion) {
                    this._previewTextureVersion = textureVersion;
                    this._previewDirty = true;
                }
                const easing = Math.abs(this._viewGoal.yaw - this._view.yaw) > 0.01
                    || Math.abs(this._viewGoal.pitch - this._view.pitch) > 0.01
                    || Math.abs(this._viewGoal.distance - this._view.distance) > 0.001
                    || ['x', 'y', 'z'].some(axis => Math.abs(this._viewGoal.pan[axis] - this._view.pan[axis]) > 0.0001);
                const animating = rules.some(rule => rule && rule.trigger !== 'action')
                    || !!this._sim.action || !!this._sim.walking || !!this._sim.jumping || !!this._sim.swimming || !!this._sim.climbing || !!this._sim.riding || !!this._workRule || !!this._previewRule
                    // A movie on a surface, or an effect overlay, is
                    // motion too: throttled to the idle rate it played
                    // as a slideshow and read as "not playing".
                    || !!this._fxVideo || !!this._fxLight || !!(this._fxPreview && this._fxPreview.active) || !!this._additionalEffectPreviews?.size
                    || !!this._bgFlash || !!this._flashHolder;
                // Motions fade out over a few frames once they stop; the
                // second after anything animated lets them come to rest.
                if (animating) this._animatedAt = now;
                const active = animating || easing || this._dragging || this._loadingPreview
                    || this._selectMode || this._rigMode || this._editingRule >= 0 || this.selectedPartName !== null
                    || (Number.isFinite(this._animatedAt) && now - this._animatedAt < 1000)
                    || (Number.isFinite(this._invalidatedAt) && now - this._invalidatedAt < 1000)
                    || (Number.isFinite(this._lastInputAt) && now - this._lastInputAt < 1000)
                    || (Number.isFinite(this._pointerMovedAt) && now - this._pointerMovedAt < 300);
                if (!Database3DEditor.shouldRenderPreview({ active, dirty: this._previewDirty, lastRenderAt: this._lastRenderAt })) {
                    this._updateHover();
                    this._updateRigHover();
                    if (!this._previewDirty) {
                        this._raf = requestAnimationFrame(tick);
                        return;
                    }
                }
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
                        airborne: this._previewAirborne(frame),
                        swimming: !!this._sim.swimming,
                        climbing: !!this._sim.climbing,
                        // Seated on a vehicle: the riding motion alone plays, as in the game.
                        riding: !!this._sim.riding,
                        distance: this._sim.walking ? (this._sim.dashing ? 1 / 8 : 1 / 16) : 0,
                        scale: this._scale,
                        // A move is in tiles; the preview draws the model 1.6 units tall where the game
                        // draws a character 3 tiles tall, so moves shrink to the same share of the body.
                        moveScale: (Reactor3D.EFFECT_PREVIEW_SPAN || 1.6) / 3,
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
                this._previewDirty = false;
                this._lastRenderAt = now;
                if (ModelPreview3D.render(this._renderer, this._scene, this._camera)) this._previewDirty = true;
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
        // A GLB's images decode after the first draw; their version numbers
        // tell a still preview when one has landed.
        this._previewTextures = ModelPreview3D.collectTextures(template, object);
        this._previewTextureVersion = -1;
        this._previewDirty = true;
        let triangles = 0;
        this._skinned = false;
        object.traverse(child => {
            if (child.isSkinnedMesh) this._skinned = true;
            if (!child.isMesh && !child.isSkinnedMesh) return;
            const index = child.geometry.getIndex();
            const position = child.geometry.getAttribute('position');
            triangles += Math.floor((index ? index.count : position ? position.count : 0) / 3);
        });
        this._triangleCount = triangles;
        this._scene.add(object);
        // A skinned model's ray-test surface is skinned once, in a quiet moment after it appears.
        this._snapshot = null;
        if (this._skinned) setTimeout(() => { if (this._object === object && !this._snapshot) this._skinnedSnapshot(); }, 400);
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
        this._sim.jumping = false;
        this._sim.swimming = false;
        this._sim.climbing = false;
        this._sim.riding = false;
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
        if (this.motionEditor && this.motionEditor.active) this.motionEditor.close();
        this._binding?.mixer?.stopAllAction();
        this._object?.parent?.remove(this._object);
        this._object = null;
        this._binding = null;
        this._template = null;
        this._pinnedTemplate = '';
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
        this._unwatchPreviewSize?.();
        this._unwatchPreviewSize = null;
        if (this._previewInputListener && typeof document !== 'undefined') {
            for (const type of Database3DEditor.PREVIEW_INPUT_EVENTS) document.removeEventListener(type, this._previewInputListener, true);
        }
        this._previewInputListener = null;
        this._previewTextures = [];
        // The page is closing: every model it loaded and both renderers are given back.
        this._releaseAllTemplates();
        this._dropThumbRenderer();
        if (this._renderer) {
            if (typeof RRModelRelease !== 'undefined') RRModelRelease.dropRenderer(this._renderer);
            else {
                this._renderer.dispose();
                const gl = this._renderer.getContext && this._renderer.getContext();
                const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
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
        // The tool in use names itself beside its icon; the others name themselves under the pointer.
        const labels = { orbit: this._t('Look around'), select: this._t('Select'), pivot: this._t('Pivot'), rig: this._t('Rig'), face: this._t('Face points') };
        const current = this._tool === 'fxanchor' ? 'orbit' : this._tool;
        for (const tool of this._tools()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = tool.title;
            button.className = 'r3d-tool' + (current === tool.id ? ' is-on' : '');
            button.setAttribute('aria-pressed', current === tool.id ? 'true' : 'false');
            button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${tool.icon}</svg><span></span>`;
            button.querySelector('span').textContent = labels[tool.id] || '';
            button.addEventListener('click', () => this.requestTool(tool.id));
            bar.appendChild(button);
        }
        // The variant the preview is wearing, when it is not the model's own: a click takes it off.
        if (this._variant && this.variantsPanel) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'r3d-tool r3d-variant-chip';
            chip.title = this._t("Model's own");
            chip.innerHTML = `${Database3DEditor.icon('look')}<span data-rr-i18n-skip="1"></span><b aria-hidden="true">\u00d7</b>`;
            chip.querySelector('span').textContent = this._variant;
            chip.addEventListener('click', () => this.variantsPanel.wear(''));
            bar.appendChild(chip);
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
            if (!this._rigMode) {
                if (!this.enterRigMode(tool === 'face')) return;
                // The markers as the tool opened them: unsaved is measured from here.
                this._markSaved(tool);
            }
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
        if (this._rigHasBones()) {
            const status = this._detail.querySelector('.r3d-status');
            if (status) status.textContent = this._t('This model is rigged — remove the rig to carve parts.');
            return;
        }
        let n = this.customParts.length + 1;
        while (this.customParts.some(p => p.name === 'part-' + n)) n++;
        const partName = 'part-' + n;
        this.customParts.push({ name: partName, pivot: null, meshes: {} });
        this.selectedPart = this.customParts.length - 1;
        this.renderPartList();        this.setTool('select');
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
        this.renderPartList();    }

    /** Selection is drawn against the uncarved mesh, seeded from the part. */
    enterSelectMode() {
        if (typeof Reactor3D === 'undefined' || !this._object) return;
        if (this._rigHasBones()) {
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
        this.renderPartList();        // Flow straight into posing what was just carved.
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
        this._previewDirty = true;
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
        this._sectionCount('parts', this.customParts.length);
        const whole = this._row({ icon: 'model', name: this._t('Whole model'), skip: false,
            selected: this.selectedPart < 0 && this.selectedPartName === '' });
        whole.addEventListener('click', () => this._afterEffectWork(() => {
            if (this._selectMode) this.cancelSelectMode();
            this.selectedPart = -1;
            this.renderPartList();
            this.selectPartByName('');
        }));
        list.appendChild(whole);
        if (!this.customParts.length) {
            const hint = document.createElement('div');
            hint.className = 'r3d-sec-note';
            hint.textContent = this._t('Add a part, then drag a box over the model to choose its triangles.');
            list.appendChild(hint);
            return;
        }
        this.customParts.forEach((part, index) => {
            let triangles = 0;
            for (const key of Object.keys(part.meshes || {})) {
                for (const [, count] of part.meshes[key]) triangles += count;
            }
            const row = this._row({
                icon: 'part', name: part.name, note: `${triangles} ${this._t('triangles')}`, selected: index === this.selectedPart,
                actions: this._partRowActions(part, index)
            });
            row.addEventListener('click', () => this._afterEffectWork(() => {
                if (this._selectMode) this.cancelSelectMode();
                this.selectedPart = index;
                this.renderPartList();
                this.selectPartByName(part.name);
            }));
            if (this._renamingPart === index) this._renameInRow(row, part.name, name => this.renamePart(part, name), () => { this._renamingPart = -1; this.renderPartList(); });
            list.appendChild(row);
        });
    }

    /** A part's name as shown: one its file damaged is shown without the damage (RRPartNames); the stored name stays. */
    static partLabel(name) {
        return typeof RRPartNames !== 'undefined' ? RRPartNames.readable(name) : name;
    }

    /**
     * One row of a column section: its type's icon, its name, a muted line
     * about it, and its own actions (shown on the row under the pointer, on
     * the selected row, and while one of them has the keyboard).
     */
    _row({ icon, name, note = '', selected = false, skip = true, actions = [] }) {
        const row = document.createElement('div');
        row.className = 'r3d-row' + (selected ? ' is-selected' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', selected ? 'true' : 'false');
        row.innerHTML = `<span class="r3d-row-icon">${Database3DEditor.icon(icon)}</span><span class="r3d-row-text"><span class="r3d-row-name"></span><span class="r3d-row-note"></span></span><span class="r3d-row-actions"></span>`;
        const label = row.querySelector('.r3d-row-name');
        label.textContent = Database3DEditor.partLabel(name);
        if (skip) label.setAttribute('data-rr-i18n-skip', '1');
        const about = row.querySelector('.r3d-row-note');
        about.textContent = note;
        about.setAttribute('data-rr-i18n-skip', '1');
        row.querySelector('.r3d-row-text').title = note ? `${name} · ${note}` : String(name);
        const host = row.querySelector('.r3d-row-actions');
        for (const action of actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'r3d-row-action' + (action.cls ? ' ' + action.cls : '');
            button.title = action.title;
            button.setAttribute('aria-label', action.title);
            button.innerHTML = Database3DEditor.icon(action.icon);
            button.disabled = !!action.disabled;
            button.addEventListener('click', event => { event.stopPropagation(); action.run(event); });
            host.appendChild(button);
        }
        return row;
    }

    /** A row's name becomes a field: Enter or leaving it renames, Escape leaves it as it was. */
    _renameInRow(row, current, rename, done) {
        const label = row.querySelector('.r3d-row-name');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'r3d-row-rename';
        input.value = current;
        label.replaceWith(input);
        row.querySelector('.r3d-row-note').style.display = 'none';
        let over = false;
        const finish = keep => {
            if (over) return;
            over = true;
            const name = input.value.trim();
            done();
            if (keep && name && name !== current) rename(name);
        };
        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(true); }
            else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true));
        setTimeout(() => { if (input.isConnected) { input.focus(); input.select(); } }, 0);
    }

    /** The number beside a section's title. */
    _sectionCount(name, count) {
        const el = this._detail && this._detail.querySelector(`.r3d-sec-header[data-sec="${name}"] .r3d-sec-count`);
        if (el) el.textContent = count > 0 ? String(count) : '';
    }

    /** The small line drawings of the page: section rows, their actions, the card's title. */
    static icon(name) {
        const body = {
            add: '<path d="M8 3.5v9M3.5 8h9"/>',
            check: '<path d="M3.5 8.5l3 3 6-7"/>',
            delete: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
            play: '<path d="M5.5 3.5l7 4.5-7 4.5z" fill="currentColor" stroke="none"/>',
            rename: '<path d="M3 13l.6-2.8 7-7 2.2 2.2-7 7zM9.4 4.4l2.2 2.2"/>',
            reselect: '<rect x="3" y="3" width="10" height="10" stroke-dasharray="2.2 2"/>',
            model: '<path d="M8 2l5 2.8v6.4L8 14l-5-2.8V4.8z"/>',
            part: '<path d="M8 2l5 2.8v6.4L8 14l-5-2.8V4.8zM3 4.8l5 2.8 5-2.8M8 7.6V14"/>',
            motion: '<path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.2M12.6 2.6v2.6H10"/>',
            clip: '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M5.5 3.5v9M10.5 3.5v9"/>',
            media: '<rect x="2" y="3.5" width="12" height="8" rx="1"/><path d="M6 13.5h4"/>',
            light: '<path d="M8 2.5a3.6 3.6 0 0 0-2 6.6V11h4V9.1a3.6 3.6 0 0 0-2-6.6zM6.5 13.2h3"/>',
            spark: '<path d="M8 2.5l1.3 4.2 4.2 1.3-4.2 1.3L8 13.5l-1.3-4.2L2.5 8l4.2-1.3z"/>',
            look: '<path d="M8 2.5c2.2 2.6 3.8 4.6 3.8 6.6a3.8 3.8 0 0 1-7.6 0c0-2 1.6-4 3.8-6.6z"/>',
            place: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>'
        }[name] || '';
        return `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }

    /** A carved part is renamed, has its triangles chosen again and is deleted from its own row. */
    _partRowActions(part, index) {
        return [
            { icon: 'rename', title: this._t('Rename'), run: () => { this._renamingPart = index; this.renderPartList(); } },
            { icon: 'reselect', title: this._t('Reselect triangles'), cls: 'r3d-part-reselect', run: () => { this.selectedPart = index; this.renderPartList(); this.selectPartByName(part.name); this.setTool('select'); } },
            { icon: 'delete', title: this._t('Delete'), cls: 'is-danger', run: () => { this.selectedPart = index; this.deletePart(); } }
        ];
    }

    /** Give a carved part another name, and everything that named it the new one. */
    renamePart(part, wanted) {
        const name = String(wanted || '').trim();
        if (!part || !name || name === part.name || this.customParts.some(other => other !== part && other.name === name)) return;
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
    }

    // ------------------------------------------------------------------
    // The edit card: the one editor for every animation.

    selectPartByName(name) {
        if (name === null || name === undefined) return;
        if (this._cardMode === 'effect') this._leaveEffectMode();
        else if (this._cardMode === 'look') this.variantsPanel.closeCard();
        this.selectedPartName = name;
        const custom = this.customParts.findIndex(part => part.name === name);
        if (custom >= 0 && this.selectedPart !== custom) {
            this.selectedPart = custom;
            this.renderPartList();        }
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
            this.renderPartList();        }
        this._syncWorkRule();
        this._rememberPose();
        this.renderEditCard();
        this._refreshPartVisuals();
        this._refreshHint();
    }

    deselectPart() {
        if (this._cardMode === 'effect') this._leaveEffectMode();
        else if (this._cardMode === 'look') this.variantsPanel.closeCard();
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
        if (this._cardMode === 'look') this.variantsPanel.closeCard();
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
            this.renderPartList();        }
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
            if (this._rigMode) { this._renderFacePointCard(card); this._refreshUnsaved(); }
            else card.style.display = 'none';
            return;
        }
        // A clip-only GLB has no parts, but its adopted clip rules still
        // edit on the card (clip choice, speed, trigger, effects).
        const hasParts = (this._binding && this._binding.meshes.length > 0)
            || this.customParts.length > 0
            || (this.embeddedClips || []).length > 0;
        // A look's card and an effect's are the same card: no padding of the box's own, one width.
        if (this._cardMode === 'look' && this.variantsPanel && !this._selectMode) {
            card.style.display = 'block';
            card.style.width = '300px';
            card.style.padding = '0';
            this.variantsPanel.renderCard(card);
            return;
        }
        if (this._selectMode || !hasParts) {
            card.style.display = 'none';
            return;
        }
        card.style.display = 'block';
        const headerButton = 'width:22px;height:22px;border:none;background:none;color:var(--color-text-muted);cursor:pointer;font-size:15px;line-height:1;';
        // Nothing to pose yet: the card waits folded; a click on the model opens it.
        if (this._cardCollapsed || (this.selectedPartName === null && this._cardMode !== 'effect' && this._editingRule < 0 && !this._cardOpened)) {
            card.style.width = 'auto';
            card.style.padding = '4px';
            card.innerHTML = `<button type="button" class="r3d-card-expand" title="${this._t('Click a part of the model to pose it.')}"
                style="height:30px;padding:0 9px;display:flex;align-items:center;gap:6px;border:1px solid var(--color-accent);border-radius:5px;cursor:pointer;background:var(--color-bg-panel);color:var(--color-text);font-size:12px;line-height:1;"><span style="font-size:15px;">✥</span>${this._t('Pose')}</button>`;
            card.querySelector('.r3d-card-expand').addEventListener('click', () => {
                this._cardCollapsed = false;
                this._cardOpened = true;
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
            card.style.width = '300px';
            card.style.padding = '0';
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
                this._cardOpened = false;
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
                    <option value="jumping"${work.trigger === 'jumping' ? ' selected' : ''}>${this._t('While jumping')}</option>
                    <option value="swimming"${work.trigger === 'swimming' ? ' selected' : ''}>${this._t('While swimming')}</option>
                    <option value="treading"${work.trigger === 'treading' ? ' selected' : ''}>${this._t('While treading water')}</option>
                    <option value="climbing"${work.trigger === 'climbing' ? ' selected' : ''}>${this._t('While climbing')}</option>
                    <option value="riding"${work.trigger === 'riding' ? ' selected' : ''}>${this._t('While riding')}</option>
                    <option value="idle"${work.trigger === 'idle' ? ' selected' : ''}>${this._t('While idle')}</option>
                    <option value="always"${work.trigger === 'always' ? ' selected' : ''}>${this._t('Always')}</option>
                </select>`)
            // A jump clip plays once and holds through the fall unless it repeats.
            + (work.trigger === 'action' || (work.trigger === 'jumping' && work.type === 'clip') ? row(this._k('r3dcard.repeat'),
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

    /**
     * How a section was left in this project (the Database's shared memory
     * of folds, page "reactor3d"); never touched, it is open, and the cost
     * card is its one line.
     */
    _recalledSection(name) {
        const memory = typeof window !== 'undefined' ? window.RRDatabaseSections : null;
        let folded;
        try { folded = memory ? memory.recall(this._project()?.path || '', 'reactor3d', name) : undefined; } catch (error) { folded = undefined; }
        return folded === undefined ? name === 'stats' : folded;
    }

    /** Keep a fold the user just made. */
    _rememberSection(name) {
        const memory = typeof window !== 'undefined' ? window.RRDatabaseSections : null;
        try { memory?.remember(this._project()?.path || '', 'reactor3d', name, !!this._sectionsCollapsed?.[name]); } catch (error) { /* this session only */ }
    }

    /** Fold or unfold a sidebar section: stats, parts, animations or effects. */
    toggleSection(name, collapsed) {
        if (!this._detail) return;
        const state = this._sectionsCollapsed || (this._sectionsCollapsed = {});
        state[name] = collapsed === undefined ? !state[name] : !!collapsed;
        // A folded section is its header line; the cost card folds to its own.
        const stats = name === 'stats' ? this._detail.querySelector('.r3d-stats') : null;
        if (stats) stats.style.display = state[name] ? 'none' : '';
        this._detail.querySelector(`.r3d-sec[data-sec="${name}"]`)?.classList?.toggle('is-collapsed', state[name]);
        const header = this._detail.querySelector(`.r3d-sec-header[data-sec="${name}"]`);
        if (header?.setAttribute) header.setAttribute('aria-expanded', state[name] ? 'false' : 'true');
        const toggle = header?.querySelector?.('.r3d-sec-toggle');
        if (toggle) toggle.textContent = state[name] ? '▸' : '▾';
    }

    // ------------------------------------------------------------------
    // Saving. Everything on this page is written to the model's own file
    // by the page: a look and a surface as they change, and a rig, face
    // points, an effect and the model's transform by their Save button.
    // What a Save button has not yet written is "unsaved": its button says
    // so, the status line says so, the Database's OK and Apply save it, and
    // leaving it (another model, another tool, Cancel) asks first.

    _rigSnapshot() {
        return JSON.stringify({ template: this._rigTemplate, markers: this._rigMarkers });
    }

    /** The face points as they are being edited: where the markers are, what each follows, the mouth's lining. */
    _faceSnapshot() {
        return JSON.stringify({ markers: this._rigMarkers, follows: this._faceBindings, interior: this._faceInterior, color: this._faceInteriorColor, open: this._faceMouthOpen });
    }

    /** What has changed since it was last saved: 'rig', 'face', 'effect', 'transform'. */
    pendingKinds() {
        const kinds = [];
        if (!this._detail || !this.selectedName) return kinds;
        if (this._rigMode && !this._rigFaceMode && this._rigBaseline !== undefined && this._rigSnapshot() !== this._rigBaseline) kinds.push('rig');
        if (this._rigMode && this._rigFaceMode && this._faceBaseline !== undefined && this._faceSnapshot() !== this._faceBaseline) kinds.push('face');
        if (this._cardMode === 'effect' && this._effectWork && this._fxBaseline !== undefined && JSON.stringify(this._effectWork) !== this._fxBaseline) kinds.push('effect');
        if (this._transformWork && typeof Reactor3D !== 'undefined' && Reactor3D.readModelTransform) {
            const saved = Reactor3D.readModelTransform({ transform: this.rawTransform });
            if (['offset', 'rotate', 'scale'].some(key => JSON.stringify(this._transformWork[key]) !== JSON.stringify(saved[key]))) kinds.push('transform');
        }
        return kinds;
    }

    hasPending() {
        return this.pendingKinds().length > 0;
    }

    /** What a kind of unsaved work is called. */
    _pendingName(kind) {
        if (kind === 'rig') return this._t('Rig');
        if (kind === 'face') return this._t('Face points');
        if (kind === 'effect') return this._k('r3dfx.named');
        return this._k('r3dcard.transform');
    }

    /** A rig or face tool was entered, or its work saved: unsaved is measured from here. */
    _markSaved(kind) {
        if (kind === 'rig') this._rigBaseline = this._rigMode && !this._rigFaceMode ? this._rigSnapshot() : undefined;
        if (kind === 'face') this._faceBaseline = this._rigMode && this._rigFaceMode ? this._faceSnapshot() : undefined;
        this._refreshUnsaved();
    }

    /** Each Save button and the status line say whether there is anything unsaved. */
    _refreshUnsaved() {
        if (!this._detail || !this._detail.querySelectorAll) return;
        const kinds = this.pendingKinds();
        this._detail.querySelectorAll('.r3d-save').forEach(button => button.classList.toggle('is-unsaved', kinds.includes(button.dataset.kind)));
        const status = this._detail.querySelector('.r3d-status');
        if (!status) return;
        if (kinds.length) {
            this._unsavedText = `${this._t('Unsaved')}: ${kinds.map(kind => this._pendingName(kind)).join(', ')}`;
            status.textContent = this._unsavedText;
            status.classList.add('is-unsaved');
        } else if (status.classList.contains('is-unsaved')) {
            // A result written over the mark (Saved, Rig bound) stays; the mark itself goes.
            status.classList.remove('is-unsaved');
            if (status.textContent === this._unsavedText) status.textContent = '';
        }
    }

    /** The page's one status line: a result (saved, removed, an error) replaces the unsaved mark it answers. */
    _setStatus(message) {
        const status = this._detail && this._detail.querySelector('.r3d-status');
        if (!status) return;
        status.classList?.remove('is-unsaved');
        status.textContent = message;
    }

    /** Look and Surface are written a moment after a change: write now what is waiting. */
    flushAutosaves() {
        this.variantsPanel?.flush();
        if (this._surfaceSave) {
            clearTimeout(this._surfaceSave);
            this._surfaceSave = null;
            this.saveSurface();
        }
    }

    /** Save whatever is unsaved on the page. Resolves false when something could not be saved. */
    async savePending(only = null) {
        if (!this._detail) return true;
        this.flushAutosaves();
        const kinds = this.pendingKinds().filter(kind => !only || only.includes(kind));
        try {
            if (kinds.includes('effect')) this._saveEffectWork();
            if (kinds.includes('transform')) this.saveTransform();
            if (kinds.includes('face')) this.saveFacePoints();
            if (kinds.includes('rig')) await this.saveRigFromBar();
        } catch (error) {
            console.error('3D model save failed:', error);
            return false;
        }
        const left = this.pendingKinds().filter(kind => !only || only.includes(kind));
        if (kinds.length && !left.length) this._setStatus(`${this._t('Saved')} — 3d/${this.selectedName}/model.json`);
        return !left.length;
    }

    /** Let go of whatever is unsaved. */
    discardPending(only = null) {
        const kinds = this.pendingKinds().filter(kind => !only || only.includes(kind));
        if (kinds.includes('effect')) { this._leaveEffectMode(); this.renderEditCard(); }
        if (kinds.includes('transform')) { this._transformWork = null; this._applyBaseTransform(); this.renderEditCard(); }
        if (kinds.includes('rig') || kinds.includes('face')) this.setTool('orbit');
        this._refreshUnsaved();
    }

    /**
     * Before leaving unsaved work (another model, another tool, the page,
     * Cancel): ask once whether to save it or let it go. Resolves true when
     * there is nothing unsaved left in the way, false when the answer was
     * to stay.
     */
    async settlePending(only = null) {
        if (!this._detail) return true;
        this.flushAutosaves();
        const kinds = this.pendingKinds().filter(kind => !only || only.includes(kind));
        if (!kinds.length) return true;
        if (this._settling) return this._settling;
        const subject = `${this.selectedName} (${kinds.map(kind => this._pendingName(kind)).join(', ')})`;
        const ui = typeof window !== 'undefined' && window.reactor && window.reactor.uiManager;
        this._settling = (async () => {
            const decision = ui && ui.promptUnsavedChanges ? await ui.promptUnsavedChanges(subject) : 'save';
            if (decision === 'save') return this.savePending(only);
            if (decision === 'discard') { this.discardPending(only); return true; }
            return false;
        })();
        try {
            return await this._settling;
        } finally {
            this._settling = null;
        }
    }

    /** The rig bar's Save: bind (when the template has bones) and write the rig, then say so. */
    async saveRigFromBar() {
        if (!this._rigMode || this._rigFaceMode) return;
        this.bindRig();
        // The bind runs on a short timer of its own; this waits for it.
        await new Promise(resolve => setTimeout(resolve, 80));
        this._markSaved('rig');
        this.renderRigBar();
    }

    /** Do what would take the card from an effect, once its unsaved work is saved or let go (asked, as everywhere). */
    _afterEffectWork(then) {
        if (!this.pendingKinds().includes('effect')) return then();
        this.settlePending(['effect']).then(go => { if (go) then(); });
    }

    /** Switch tools from the toolbar: leaving the rig or the face points with unsaved markers asks first. */
    async requestTool(tool) {
        if (this._rigMode && tool !== this._tool && !(await this.settlePending(['rig', 'face']))) return;
        this.setTool(tool);
    }

    /** Write the model's own transform, as its card's Save does. */
    saveTransform() {
        if (!this._transformWork) return;
        this.rawTransform = JSON.parse(JSON.stringify(this._transformWork));
        this.saveRules();
        this.renderEditCard();
        this._refreshUnsaved();
    }

    /** Delete the selected row of a section (the Delete key, with that section's list in hand). */
    deleteSelectedRow(section) {
        if (section === 'parts') { if (this.selectedPart < 0) return false; this.deletePart(); return true; }
        if (section === 'animations') { if (!this.rawAnimations[this.selectedRule]) return false; this.deleteRule(); return true; }
        if (section === 'effects') { if (!this.rawEffects[this.selectedEffect]) return false; this.deleteModelEffect(); return true; }
        if (section === 'look') return !!(this.variantsPanel && this.variantsPanel.remove());
        return false;
    }

    renderEffectList() {
        const list = this._detail ? this._detail.querySelector('.r3d-effect-list') : null;
        if (!list) return;
        list.innerHTML = '';
        this._sectionCount('effects', this.rawEffects.length);
        if (!this.rawEffects.length) {
            const empty = document.createElement('div');
            empty.className = 'r3d-sec-note';
            empty.textContent = this._t('Lights, screens and animations that ride on the model. + adds one.');
            list.appendChild(empty);
        }
        this.rawEffects.forEach((raw, index) => {
            const animations = this.databaseManager?.data?.animations || [];
            const record = raw.type === 'video' ? (raw.video && raw.video.file ? { name: raw.video.file } : null)
                : raw.type === 'light' ? { name: this._lightSummary(raw.light) } : animations[Number(raw.animation)];
            const when = { moving: this._t('While moving'), walking: this._t('While walking'), dashing: this._t('While dashing'), jumping: this._t('While jumping'), swimming: this._t('While swimming'), treading: this._t('While treading water'), climbing: this._t('While climbing'), idle: this._t('While idle'), always: this._t('Always') }[raw.trigger];
            const row = this._row({
                icon: raw.type === 'video' ? 'media' : raw.type === 'light' ? 'light' : 'spark',
                name: raw.name || '?',
                // Which variants wear it comes first: it is what ties this row to the Variants below.
                note: [this.variantsPanel ? this.variantsPanel.wornNote(raw) : '', record && record.name, when].filter(Boolean).join(' \u00b7 '),
                selected: index === this.selectedEffect,
                actions: [
                    { icon: 'play', title: this._k('r3dfx.play'), run: () => this._playEffectPreview(index === this.selectedEffect && this._effectWork ? this._effectWork : raw) },
                    { icon: 'delete', title: this._t('Delete'), cls: 'is-danger', run: () => this.deleteModelEffectAt(index) }
                ]
            });
            row.dataset.modelRecordIndex = String(index);
            row.addEventListener('click', () => { if (index !== this.selectedEffect || this._cardMode !== 'effect') this.requestSelectEffect(index); });
            list.appendChild(row);
        });
    }

    /** Open another effect's card, once the one in hand is saved or let go. */
    async requestSelectEffect(index) {
        if (await this.settlePending()) this.selectEffect(index);
    }

    selectEffect(index) {
        if (this._cardMode === 'look') this.variantsPanel.closeCard();
        this._fxFromVariant = false;
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
            this._fxTab = 'effect';
        } else if (this._cardMode === 'effect') {
            this._cardMode = 'part';
        }
        this._healAnchorBinding(this._effectWork);
        this._fxTrail = [];
        this._fxRedo = [];
        this._fxSeen = undefined;
        this._fxBaseline = undefined;
        this.renderEffectList();
        this.variantsPanel?.renderList();
        this._syncEffectAnchorMarker();
        this.renderEditCard();
        // What the card opened with is what "unsaved" is measured against.
        this._fxBaseline = this._fxSeen = this._effectWork ? JSON.stringify(this._effectWork) : undefined;
        this._refreshUnsaved();
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
        this._fxBaseline = this._fxSeen = undefined;
        if (this._tool === 'fxanchor') this.setTool('orbit');
        this._stopEffectPreview();
        this._syncEffectAnchorMarker();
        this._syncEffectGizmo();
        this.renderEffectList();
        this._refreshUnsaved();
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
            { label: this._t('Parts'), items: parts.map(name => ({ id: name, label: Database3DEditor.partLabel(name) })) },
            { label: this._k('r3dcard.groupBones'), items: bones.map(name => ({ id: name, label: Database3DEditor.partLabel(name) })) },
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
        if (this.pendingKinds().includes('effect')) {
            this.settlePending(['effect']).then(go => { if (go) this._onCardChooserPick(id); else this.renderEditCard(); });
            return;
        }
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

    /** The head of an effect's or a look's card: its name (renamed in place), undo, redo, close. */
    _cardHeadHtml(icon, name, { rename = true, undo = false, redo = false } = {}) {
        return `<div class="lit-section-header r3d-fcard-head">
                <span class="r3d-row-icon">${Database3DEditor.icon(icon)}</span>
                <input type="text" class="r3d-fcard-title" value="${rrEscapeHtml(String(name == null ? '' : name))}" aria-label="${this._t('Name')}"${rename ? ` title="${this._t('Rename')}"` : ' disabled'} data-rr-i18n-skip="1">
                <button type="button" class="r3d-card-undo" title="${this._t('Undo')} (Ctrl+Z)"${undo ? '' : ' disabled'}>↶</button>
                <button type="button" class="r3d-card-redo" title="${this._t('Redo')} (Ctrl+Y)"${redo ? '' : ' disabled'}>↷</button>
                <button type="button" class="r3d-card-close" title="${this._t('Close')}">×</button>
            </div>`;
    }

    /** The tabs of an effect's or a look's card: one tab's rows show at a time. */
    _cardTabsHtml(cls, tabs, current) {
        return `<div class="r3d-fcard-tabs" role="tablist">${tabs.map(tab => `<button type="button" role="tab" class="${cls} r3d-fcard-tab${tab.id === current ? ' is-on' : ''}" data-tab="${tab.id}" aria-selected="${tab.id === current}">${tab.label}</button>`).join('')}</div>`;
    }

    /** One row of a card: its label, then its control, on the card's shared grid. */
    _cardRow(label, body, cls = '') {
        return `<span class="r3d-flabel${cls ? ' ' + cls : ''}" title="${label}">${label}</span><div class="r3d-ffield${cls ? ' ' + cls : ''}">${body}</div>`;
    }

    /** X, Y and Z sliders as rows of a card's grid. */
    _axisRowsHtml(cls, spec) {
        const axes = [{ label: 'X', color: '#e5484d' }, { label: 'Y', color: '#46a758' }, { label: 'Z', color: '#3e63dd' }];
        return axes.map((axis, i) => `<span class="r3d-flabel is-axis" style="color:${axis.color};">${axis.label}</span>
            <div class="r3d-ffield"><input type="range" class="${cls}" data-i="${i}" min="${spec.min}" max="${spec.max}" step="${spec.step}"
                value="${spec.value(i)}" style="accent-color:${axis.color};" title="${this._t('Double-click to reset')}">
                <span class="${cls}-val r3d-fvalue" data-i="${i}">${spec.show(spec.value(i))}</span></div>`).join('');
    }

    /** Scale sliders as rows of a card's grid: one when proportional, three when free. */
    _scaleRowsHtml(prefix, scale) {
        const proportional = !Array.isArray(scale);
        const axes = Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1];
        const percent = value => Math.round((Number(value) > 0 ? Number(value) : 1) * 100);
        const check = this._cardRow('', `<label class="r3d-fcheck"><input type="checkbox" class="${prefix}-proportional"${proportional ? ' checked' : ''}> ${this._k('r3dcard.proportional')}</label>`);
        if (!proportional) {
            return this._axisRowsHtml(prefix + '-scale', { min: 10, max: 400, step: 1, value: i => percent(axes[i]), show: v => Math.round(v) + '%' }) + check;
        }
        return this._cardRow(this._t('Scale'), `<input type="range" class="${prefix}-scale" data-i="all" min="10" max="400" step="1" value="${percent(axes[0])}" title="${this._t('Double-click to reset')}">
            <span class="${prefix}-scale-val r3d-fvalue" data-i="all">${percent(axes[0])}%</span>`) + check;
    }

    /** The handles a card tab puts on the selected effect: arrows move it, rings turn it, size handles size it. */
    static effectTool(tab) {
        return tab === 'rotate' ? 'turn' : tab === 'scale' ? 'size' : 'move';
    }

    /** An effect's fields as the card edits them, defaults filled in. */
    _normalizeEffectWork(work) {
        if (!work.anchor || typeof work.anchor !== 'object') work.anchor = { part: '', offset: [0, 0, 0] };
        if (!Array.isArray(work.anchor.offset)) work.anchor.offset = [0, 0, 0];
        if (!Array.isArray(work.rotate)) work.rotate = [0, 0, 0];
        if (work.type === 'light') this._ensureLightWork(work);
        if (!work.video) work.video = { file: '', width: 0.3, height: 0.2, loop: true, audio: false, volume: 100 };
        // Fractions of the model's size; pixel-era numbers convert on sight.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.videoEffectFraction) {
            work.video.width = Reactor3D.videoEffectFraction(work.video.width, 0.3);
            work.video.height = Reactor3D.videoEffectFraction(work.video.height, 0.2);
        }
        return work;
    }

    /**
     * The card of the selected effect: its name in the title, then one tab
     * at a time. Effect is what it is, what it shows and when it plays;
     * Offset, Rotate and Scale place it, and each puts its own handles on
     * the effect in the preview (arrows, rings, size handles).
     */
    _renderEffectCard(card, header) {
        const work = this._normalizeEffectWork(this._effectWork);
        const span = this._modelSpan();
        const offset = work.anchor.offset;
        const isLight = work.type === 'light', isVideo = work.type === 'video';
        if (!['effect', 'offset', 'rotate', 'scale'].includes(this._fxTab)) this._fxTab = 'effect';
        const spec = {
            offset: { min: -span, max: span, step: span / 500, value: i => offset[i] || 0, show: v => Number(v).toFixed(span >= 10 ? 1 : 3) },
            rotate: { min: -180, max: 180, step: 1, value: i => work.rotate[i] || 0, show: v => Math.round(v) + '°' }
        }[this._fxTab === 'rotate' ? 'rotate' : 'offset'];
        const tabs = [{ id: 'effect', label: this._t('Effect') }, { id: 'offset', label: this._t('Offset') }, { id: 'rotate', label: this._t('Rotate') },
            { id: 'scale', label: isLight ? this._k('lit.section.light') : this._t('Scale') }];
        // A light has no scale and turns by its own aim: the Rotate tab is
        // its direction and tilt, the last tab its reach and strength.
        const sizeMax = Math.max(work.video.width, work.video.height) > 2 ? 4 : 2;
        const sizeRow = (key, label) => this._cardRow(label, `<input type="range" class="r3d-fxcard-size" data-key="${key}" min="0.01" max="${sizeMax}" step="0.01" value="${Number(work.video[key])}" title="${this._k('r3dfx.width')}">
            <span class="r3d-fxcard-size-val r3d-fvalue" data-key="${key}">${Number(work.video[key]).toFixed(2)}</span>`);
        const hint = { offset: this._t('Drag an arrow, or drag the effect itself across the model.'),
            rotate: isLight && work.light.type === 'point' ? '' : this._t('Drag a ring to turn it.'),
            scale: isVideo ? this._t('Drag an edge for one side, a corner for both.') : this._t('Drag the handle to resize it.') }[this._fxTab] || '';
        const body = this._fxTab === 'effect' ? ''
            : isLight && this._fxTab !== 'offset' ? this._lightCardSlidersHtml(work, this._fxTab)
                : this._fxTab === 'scale' ? (isVideo ? sizeRow('width', this._t('Width')) + sizeRow('height', this._t('Height')) : '') + this._scaleRowsHtml('r3d-fxcard', work.scale)
                    : this._axisRowsHtml('r3d-fxcard-slider', spec);
        card.innerHTML = `<div class="r3d-fcard">`
            + this._cardHeadHtml(isVideo ? 'media' : isLight ? 'light' : 'spark', work.name, { undo: (this._fxTrail || []).length > 0, redo: (this._fxRedo || []).length > 0 })
            + this._cardTabsHtml('r3d-fxcard-tab', tabs, this._fxTab)
            + (hint ? `<div class="r3d-fcard-hint">${hint}</div>` : '')
            + (this._fxTab === 'effect' ? '<div class="r3d-effect-form r3d-fgrid" data-model-record-kind="effect"></div>' : `<div class="r3d-fgrid">${body}</div>`)
            + `<div class="r3d-fcard-foot"><button type="button" class="rr-button-primary r3d-fxcard-save r3d-save" data-kind="effect">${this._k('r3dfx.save')}</button></div>
            </div>`;
        if (this._fxTab === 'effect') this.renderEffectForm();
        card.querySelector('.r3d-card-close').addEventListener('click', () => this.closeEffectCard());
        card.querySelector('.r3d-card-undo').addEventListener('click', () => this.undoEffect());
        card.querySelector('.r3d-card-redo').addEventListener('click', () => this.redoEffect());
        card.querySelector('.r3d-fcard-title').addEventListener('change', event => {
            const name = event.target.value.trim();
            if (name) work.name = name;
            event.target.value = work.name;
        });
        card.querySelectorAll('.r3d-fxcard-tab').forEach(tab => tab.addEventListener('click', () => {
            this._fxTab = tab.dataset.tab;
            this.renderEditCard();
            this._syncEffectGizmo();
            this._lastInputAt = performance.now();
        }));
        const live = () => {
            this._syncEffectAnchorMarker();
            if (this._fxPreview && this._fxPreview.active) {
                this._fxPreview.setTransform({ rotate: work.rotate, scale: work.scale });
            }
            this._updateEffectPreview();
            this._lastInputAt = performance.now();
        };
        card.querySelectorAll('.r3d-fxcard-size').forEach(slider => {
            const readout = card.querySelector(`.r3d-fxcard-size-val[data-key="${slider.dataset.key}"]`);
            slider.addEventListener('input', () => {
                work.video[slider.dataset.key] = Math.min(4, Math.max(0.01, Number(slider.value) || 0.01));
                if (readout) readout.textContent = Number(work.video[slider.dataset.key]).toFixed(2);
                live();
            });
        });
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
                    this._afterEffectEdit(false);
                };
                slider.addEventListener('input', apply);
                slider.addEventListener('change', () => this._afterEffectEdit(true));
                slider.addEventListener('dblclick', () => { slider.value = key === 'intensity' ? '1' : '0'; apply(); this._afterEffectEdit(true); });
            });
        } else {
            this._bindScaleSliders(card, 'r3d-fxcard', work, live);
        }
        card.querySelector('.r3d-fxcard-save').addEventListener('click', () => this._saveEffectWork());
        this._refreshUnsaved();
    }

    /** Close the effect's card, its work saved or let go first. Opened from a variant's card, it goes back there. */
    async closeEffectCard() {
        if (!(await this.settlePending(['effect']))) return;
        const back = this._fxFromVariant && this.variantsPanel;
        this._leaveEffectMode();
        if (back) this.variantsPanel.select(this._variant || '');
        else this.renderEditCard();
    }

    // The effect card's own undo: one step per gesture (a drag of a handle
    // or a slider, a choice, a name), on the card's work until it is saved.

    /** A gesture on the effect ended: what the work was before it is a step back. */
    _fxCheckpoint() {
        const work = this._effectWork;
        if (!work) return;
        const now = JSON.stringify(work);
        if (this._fxSeen !== undefined && now !== this._fxSeen) {
            (this._fxTrail || (this._fxTrail = [])).push(this._fxSeen);
            if (this._fxTrail.length > 60) this._fxTrail.shift();
            this._fxRedo = [];
        }
        this._fxSeen = now;
        const root = this._detail && this._detail.querySelector('.r3d-card');
        const undo = root && root.querySelector('.r3d-card-undo'), redo = root && root.querySelector('.r3d-card-redo');
        if (undo) undo.disabled = !this._fxTrail || !this._fxTrail.length;
        if (redo) redo.disabled = !this._fxRedo || !this._fxRedo.length;
        this._refreshUnsaved();
    }

    undoEffect() {
        this._fxCheckpoint();
        this._fxStep(this._fxTrail || (this._fxTrail = []), this._fxRedo || (this._fxRedo = []));
    }

    redoEffect() {
        this._fxCheckpoint();
        this._fxStep(this._fxRedo || (this._fxRedo = []), this._fxTrail || (this._fxTrail = []));
    }

    /** Put the work back to a kept state; the object stays the same one, since the preview holds it. */
    _fxStep(from, to) {
        const work = this._effectWork;
        if (!work || !from.length) return;
        to.push(JSON.stringify(work));
        const text = from.pop();
        for (const key of Object.keys(work)) delete work[key];
        Object.assign(work, JSON.parse(text));
        this._fxSeen = text;
        this._stopEffectPreview();
        this._fxPreviewDef = work;
        if (work.type === 'video' && work.video && work.video.file) this._playVideoPreview(work);
        else if (work.type === 'light') this._playLightPreview(work);
        this._syncEffectAnchorMarker();
        this.renderEditCard();
        this._syncEffectGizmo();
        this._lastInputAt = performance.now();
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
            + this._tabStripHtml('r3d-tcard-mode', Database3DEditor.modelTabs(this), 'transform')
            + `<div style="font-size:11px;color:var(--color-text-muted);margin:-4px 0 6px;">${this._k('r3dcard.transformHint')}</div>`
            + this._tabStripHtml('r3d-tcard-tab', [{ id: 'offset', label: this._t('Offset') }, { id: 'rotate', label: this._t('Rotate') }, { id: 'scale', label: this._t('Scale') }], tab)
            + body
            + `<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;margin-top:8px;" title="${this._k('r3dcard.collisionHint')}">
                <input type="checkbox" class="r3d-tcard-collision"${this.rawCollision === 'mesh' ? ' checked' : ''}> ${this._k('r3dcard.collision')}</label>
            <div style="display:flex;gap:6px;margin-top:10px;">
                <button type="button" class="rr-btn-secondary r3d-tcard-reset" style="flex:1;">${this._t('Clear')}</button>
                <button type="button" class="rr-button-primary r3d-tcard-save r3d-save" data-kind="transform" style="flex:1;">${this._k('r3dcard.saveTransform')}</button>
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
        card.querySelector('.r3d-tcard-save').addEventListener('click', () => this.saveTransform());
        this._refreshUnsaved();
    }

    /** The whole model's card tabs: its placement, its animations. */
    static modelTabs(editor) {
        return [{ id: 'transform', label: editor._k('r3dcard.transform') }, { id: 'animation', label: editor._t('Animations') }];
    }

    /** Ready-made surfaces: a mirror, gold, a lacquer, satin metal. */
    static SURFACE_PRESETS = [
        ['Chrome', { reflect: 1, gloss: 0.95, metal: 1, tint: '#ffffff', texture: 0 }],
        ['Polished', { reflect: 0.9, gloss: 0.9, metal: 0.55, tint: '#ffffff', texture: 0.85 }],
        ['Glossy', { reflect: 0.9, gloss: 0.9, metal: 0, tint: '#ffffff', texture: 1 }],
        ['Gold', { reflect: 1, gloss: 0.85, metal: 1, tint: '#ffcc55', texture: 0.2 }],
        ['Brushed', { reflect: 0.8, gloss: 0.45, metal: 1, tint: '#dfe3e8', texture: 0.35 }]
    ];

    /**
     * The model's surface, in its own section of the column: a switch for
     * reflections in the header; under it the look (presets, how much it
     * reflects, how glossy, how metal, the reflection's tint). Changes show
     * on the preview at once and are written to model.json a moment later.
     */
    renderSurfaceForm() {
        // The Surface tab of a look's card: the model's own surface, or the variant's in view.
        const form = this._detail && this._detail.querySelector('.r3d-surface-form');
        if (!form) return;
        // The model's surface, or with a variant in view that variant's (its own, else a copy of the model's that becomes its own on the first change).
        const panel = this.variantsPanel && this.variantsPanel.record() ? this.variantsPanel : null;
        const held = panel ? panel.surfaceInView() : this.rawSurface;
        const surface = held && Number(held.reflect) > 0 ? held : null;
        const keep = value => { if (panel) panel.setSurface(value); else this.rawSurface = value; };
        const tt = text => rrEscapeHtml(this._t(text));
        const row = (label, body, cls) => this._cardRow(label, body, cls);
        const own = panel ? panel.surfaceOwnRow() : '';
        const switchRow = row(tt('Reflections'), `<label class="r3d-fcheck"><input type="checkbox" class="r3d-surface-on"${surface ? ' checked' : ''}${this.selectedName ? '' : ' disabled'}> ${tt(surface ? 'On' : 'Off')}</label>`);
        // The rest show only through the reflection: dimmed while it is 0.
        const dim = field => field !== 'reflect' && !(surface.reflect > 0) ? 'is-dimmed' : '';
        const slider = (field, label) => row(tt(label), `<input type="range" class="r3d-surface" data-field="${field}" min="0" max="1" step="0.01" value="${surface[field]}">
            <span class="r3d-surface-value r3d-fvalue" data-field="${field}">${Math.round(surface[field] * 100)}%</span>`, `${field === 'reflect' ? '' : 'rr-surface-row '}${dim(field)}`);
        if (surface && surface.texture === undefined) surface.texture = 0;
        const same = look => ['reflect', 'gloss', 'metal', 'tint', 'texture'].every(key => look[key] === surface[key]);
        form.innerHTML = own + switchRow + (!surface
            ? `<div class="r3d-fnote">${tt('Off. Switch on for chrome, gold or a glossy finish.')}</div>`
            : `<div class="r3d-fseg" style="grid-column:1 / -1;">${Database3DEditor.SURFACE_PRESETS.map(([name, look]) => `<button type="button" class="r3d-surface-preset" data-preset="${name}" aria-pressed="${same(look)}">${tt(name)}</button>`).join('')}</div>`
                + slider('reflect', 'Reflection') + slider('gloss', 'Gloss') + slider('metal', 'Metal') + slider('texture', 'Texture')
                + row(tt('Tint'), typeof RRColorPopup !== 'undefined' ? RRColorPopup.swatch('r3d-surface-tint', surface.tint || '#ffffff') : `<input type="color" class="r3d-surface-tint" value="${surface.tint || '#ffffff'}">`, `rr-surface-row ${dim('tint')}`));
        if (panel) panel.bindSurfaceOwn(form);
        const on = form.querySelector('.r3d-surface-on');
        on.addEventListener('change', () => {
            if (panel) panel.begin();
            if (on.checked) {
                // Back to the look it had, else the file's own metal, else chrome.
                const glb = this._object ? this._fileShine() : null;
                keep(Object.assign({}, this._surfaceLast || glb || Database3DEditor.SURFACE_PRESETS[0][1]));
            } else {
                if (held) this._surfaceLast = held;
                keep(null);
            }
            if (panel) panel.end();
            this._applyBaseTransform();
            this.saveSurface();
            this.renderSurfaceForm();
            this.variantsPanel?.renderList();
        });
        if (!surface) return;
        // Only the file is written: a full save rebuilds the animation playback, and
        // restarting the model's motion on every nudge of a slider made it jump.
        const changed = () => {
            // A variant following the model's surface takes the changed one as its own; its row says so
            // without the form being rebuilt under a drag.
            if (panel && panel.record().surface === undefined) {
                panel.setSurface(surface);
                panel.renderList();
                const holder = document.createElement('div');
                holder.innerHTML = panel.surfaceOwnRow();
                if (holder.children.length === 2 && form.children.length >= 2) {
                    form.children[1].replaceWith(holder.children[1]);
                    form.children[0].replaceWith(holder.children[0]);
                    panel.bindSurfaceOwn(form);
                }
            }
            this._applyBaseTransform();
            clearTimeout(this._surfaceSave);
            this._surfaceSave = setTimeout(() => { this._surfaceSave = null; this.saveSurface(); }, 300);
        };
        form.querySelectorAll('.r3d-surface').forEach(input => input.addEventListener('input', () => {
            if (panel && !panel._pending) panel.begin();
            surface[input.dataset.field] = Number(input.value);
            form.querySelector(`.r3d-surface-value[data-field="${input.dataset.field}"]`).textContent = Math.round(surface[input.dataset.field] * 100) + '%';
            if (input.dataset.field === 'reflect') form.querySelectorAll('.rr-surface-row').forEach(el => el.classList.toggle('is-dimmed', !(surface.reflect > 0)));
            changed();
        }));
        form.querySelectorAll('.r3d-surface').forEach(input => input.addEventListener('change', () => { if (panel) panel.end(); }));
        const tint = form.querySelector('.r3d-surface-tint');
        if (typeof RRColorPopup !== 'undefined' && tint.tagName === 'BUTTON') RRColorPopup.bind(tint, hex => { surface.tint = hex; changed(); });
        else tint.addEventListener('input', event => { surface.tint = event.target.value; changed(); });
        form.querySelectorAll('.r3d-surface-preset').forEach(button => button.addEventListener('click', () => {
            const preset = Database3DEditor.SURFACE_PRESETS.find(([name]) => name === button.dataset.preset);
            if (!preset) return;
            if (panel) panel.begin();
            Object.assign(surface, preset[1]);
            changed();
            if (panel) panel.end();
            this.renderSurfaceForm();
        }));
    }

    /** Write the surface to model.json, leaving the preview's animation running. */
    saveSurface() {
        // With a variant in view the surface is that variant's: its own writer keeps the rest of the file.
        if (this.variantsPanel && this.variantsPanel.record()) { this.variantsPanel.save(); return; }
        const fs = require('fs');
        try {
            const previous = this._readSidecarForUpdate(fs);
            this._writeFileAtomic(fs, this.rulesPath(),
                Database3DEditor.mergeSidecar(previous, this.rawAnimations, this.customParts, this.customPivots, this.rawEffects, this.rawTransform, this.rawCollision, this.rawSurface));
        } catch (error) {
            this._reportModelSaveError(error);
            return;
        }
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = `${this._t('Saved')} — 3d/${this.selectedName}/model.json`;
        if (typeof RREventPreviewModels !== 'undefined' && RREventPreviewModels.clear) RREventPreviewModels.clear();
    }

    /** The shine the model's own file declares (polished metal), if any: a starting point, never on by itself. */
    _fileShine() {
        let found = null;
        this._object?.traverse(node => {
            if (found || !node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (material?.userData?.glbShine) { found = Object.assign({}, material.userData.glbShine); break; }
            }
        });
        return found;
    }

    /** Put the working (or saved) base transform on the placed model. */
    _applyBaseTransform() {
        if (!this._object || typeof Reactor3D === 'undefined' || !Reactor3D.applyModelTransform) return;
        const transform = Reactor3D.readModelTransform({ transform: this._transformWork || this.rawTransform, surface: this.rawSurface, variants: this.rawVariants },
            this.variantsPanel ? this.variantsPanel.previewSpec() : null);
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
            // A look names the media surface it changes: it follows the new name too.
            let looks = false;
            for (const variant of this.rawVariants || []) {
                if (!variant || !variant.media || !Object.prototype.hasOwnProperty.call(variant.media, previous)) continue;
                variant.media[work.name] = variant.media[previous];
                delete variant.media[previous];
                looks = true;
            }
            if (looks) this.variantsPanel?.save();
        }
        this.rawEffects[index] = JSON.parse(JSON.stringify(work));
        this.saveRules();
        // The save tidies the list of variants: the card's work follows, so it does not read as changed.
        if (this.rawEffects[index].variants) work.variants = this.rawEffects[index].variants.slice(); else delete work.variants;
        this._fxBaseline = this._fxSeen = JSON.stringify(work);
        this.renderEffectList();
        this.variantsPanel?.renderList();
        this.renderEditCard();
        this._refreshUnsaved();
    }

    addModelEffect(extra = null) {
        const base = 'effect';
        let name = base, n = 2;
        while (this.rawEffects.some(raw => raw && raw.name === name)) name = `${base}${n++}`;
        this.rawEffects.push(Object.assign({ name, animation: 0, anchor: { part: '', offset: [0, 0, 0] }, scale: 1, loop: false }, extra));
        this.saveRules();
        this.selectEffect(this.rawEffects.length - 1);
    }

    deleteModelEffect() {
        this.deleteModelEffectAt(this.selectedEffect);
    }

    /** Delete the effect of one row. Another row's card, and the work on it, stays as it is. */
    deleteModelEffectAt(index) {
        if (index < 0 || !this.rawEffects[index]) return;
        const name = this.rawEffects[index].name;
        this.rawEffects.splice(index, 1);
        // Rules that fired it by name lose that step rather than firing nothing.
        for (const raw of this.rawAnimations) {
            if (Array.isArray(raw.effects)) raw.effects = raw.effects.filter(effect => effect.effect !== name);
        }
        this.saveRules();
        if (index !== this.selectedEffect) {
            if (index < this.selectedEffect) this.selectedEffect--;
            this.renderEffectList();
            return;
        }
        this._leaveEffectMode();
        this.renderEditCard();
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
        const control = '';
        const row = (label, body) => this._cardRow(escape(label), body);
        const animations = this.databaseManager?.data?.animations || [];
        const record = animations[Number(work.animation)];
        this._normalizeEffectWork(work);
        // A choice made in a picker lands here: it is a step back like any other.
        this._fxCheckpoint();
        const anchor = work.anchor;
        const choices = this._effectAnchorChoices();
        if (anchor.part && choices.indexOf(anchor.part) < 0) choices.unshift(anchor.part);
        const isVideo = work.type === 'video';
        const isLight = work.type === 'light';
        const light = isLight ? work.light : null;
        const safeVideo = escape(work.video.file || this._k('r3dfx.chooseVideo'));
        // Authored text is escaped once, up front, and only the escaped
        // strings reach the markup below.
        const safeAnimation = escape(record && record.name ? work.animation + ': ' + record.name : this._k('r3dfx.choose'));
        const safeSound = escape(work.se && work.se.name ? work.se.name : this._k('r3dfx.noSound'));
        const trigger = work.trigger || 'action';
        const triggerOptions = [['action', this._t('On demand')], ['moving', this._t('While moving')], ['walking', this._t('While walking')],
            ['dashing', this._t('While dashing')], ['jumping', this._t('While jumping')], ['swimming', this._t('While swimming')], ['treading', this._t('While treading water')], ['climbing', this._t('While climbing')], ['idle', this._t('While idle')], ['always', this._t('Always')]];
        const placing = this._tool === 'fxanchor';
        // Which variants wear it: every one, or the chosen ones. Only a model with variants is asked.
        const looks = typeof ModelVariantsPanel !== 'undefined' && (this.rawVariants || []).length
            ? [''].concat(this.rawVariants.map(variant => variant.name)) : [];
        const wornBy = looks.length ? ModelVariantsPanel.wornBy(work, this.rawVariants) : [];
        const everyLook = wornBy.length === looks.length;
        const wornRow = !looks.length ? '' : `<span class="r3d-flabel is-top" title="${escape(this._t('Shown in'))}">${escape(this._t('Shown in'))}</span>
            <div class="r3d-ffield r3d-fchips">
                <button type="button" class="r3d-fchip r3d-fx-worn-all" aria-pressed="${everyLook}">${escape(this._t('All variants'))}</button>
                ${looks.map(name => `<button type="button" class="r3d-fchip r3d-fx-worn" data-variant="${escape(name)}" aria-pressed="${!everyLook && wornBy.includes(name)}"${name ? ' data-rr-i18n-skip="1"' : ''}>${escape(name || this._t("Model's own"))}</button>`).join('')}
            </div>`;
        const silent = !safeSound || !(work.se instanceof Object) || !work.se.name;
        // What it is; what it shows; what it follows; when it plays; its sound.
        form.innerHTML = `
            ${row(this._k('r3dfx.type'), `<select class="r3d-fx-type">
                <option value="animation"${isVideo || isLight ? '' : ' selected'}>${escape(this._k('r3dfx.typeAnimation'))}</option>
                <option value="video"${isVideo ? ' selected' : ''}>${escape(this._k('r3dfx.typeVideo'))}</option>
                <option value="light"${isLight ? ' selected' : ''}>${escape(this._k('r3dfx.typeLight'))}</option>
            </select>`)}
            ${isLight ? this._lightRowsHtml(light, work, row, control, escape)
              : isVideo ? row(this._t('Media'), `<button type="button" class="r3d-fbtn r3d-fx-video" title="${escape(this._k('r3dfx.chooseVideo'))}" data-rr-i18n-skip="1">${safeVideo}</button>`)
                + row('', `<label class="r3d-fcheck"><input type="checkbox" class="r3d-fx-vloop"${work.video.loop !== false ? ' checked' : ''}> ${escape(this._k('r3dfx.loop'))}</label>
                    <label class="r3d-fcheck"><input type="checkbox" class="r3d-fx-vaudio"${work.video.audio ? ' checked' : ''}> ${escape(this._k('r3dfx.audio'))}</label>`)
              : row(this._k('r3dfx.animation'), `<button type="button" class="r3d-fbtn r3d-fx-pick" data-rr-i18n-skip="1">${safeAnimation}</button>`)}
            ${row(this._t('Follows'), `<select class="r3d-fx-part">
                <option value="">${escape(this._k('r3dfx.origin'))}</option>
                ${choices.map(name => `<option value="${escape(name)}"${name === anchor.part ? ' selected' : ''} data-rr-i18n-skip="1">${escape(name)}</option>`).join('')}
            </select>
            <button type="button" class="r3d-fbtn is-square r3d-fx-place${placing ? ' is-on' : ''}" aria-pressed="${placing}" title="${escape(this._k('r3dfx.place'))}" aria-label="${escape(this._k('r3dfx.place'))}">${Database3DEditor.icon('place')}</button>`)}
            ${wornRow}
            ${row(this._t('Play when'), `<select class="r3d-fxcard-trigger">
                ${triggerOptions.map(([value, label]) => `<option value="${value}"${value === trigger ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
            ${trigger === 'action' ? `<label class="r3d-fcheck"><input type="checkbox" class="r3d-fxcard-loop"${work.loop ? ' checked' : ''}> ${escape(this._k('r3dfx.loop'))}</label>` : ''}`)}
            ${row(this._k('r3dfx.sound'), `<button type="button" class="r3d-fbtn r3d-fx-se" data-rr-i18n-skip="1">${safeSound}</button>
                <button type="button" class="r3d-fbtn is-square r3d-fx-se-clear" title="${escape(this._k('r3dfx.clearSound'))}" aria-label="${escape(this._k('r3dfx.clearSound'))}"${silent ? ' disabled' : ''}>&times;</button>`)}`;
        const q = selector => form.querySelector(selector);
        const syncWork = () => {
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
        q('.r3d-fx-part').addEventListener('change', syncWork);
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
        q('.r3d-fx-place').addEventListener('click', () => { this.setTool(this._tool === 'fxanchor' ? 'orbit' : 'fxanchor'); this.renderEffectForm(); });
        q('.r3d-fxcard-loop')?.addEventListener('change', event => { work.loop = event.target.checked; });
        // All variants, or a click on one for only that one; more clicks add and take away, and none left is all again.
        q('.r3d-fx-worn-all')?.addEventListener('click', () => { delete work.variants; this.renderEffectForm(); });
        form.querySelectorAll('.r3d-fx-worn').forEach(chip => chip.addEventListener('click', () => {
            const name = chip.dataset.variant;
            const now = everyLook ? [] : wornBy.slice();
            const at = now.indexOf(name);
            if (at >= 0) now.splice(at, 1); else now.push(name);
            ModelVariantsPanel.setWornBy(work, now, this.rawVariants);
            this.renderEffectForm();
        }));
        q('.r3d-fxcard-trigger').addEventListener('change', event => {
            work.trigger = event.target.value;
            this._stopEffectPreview();
            this.renderEditCard();
        });
    }

    /**
     * The rows a light effect edits: kind, colour, reach and shape, aim,
     * flicker, how long a fired light stays, and its switches. Labels are
     * the Lighting panel's own, so the two read the same.
     */
    _lightRowsHtml(light, work, row, control, escape) {
        const slider = (key, label, min, max, step) => row(label,
            `<input type="range" class="r3d-fx-lrange" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${escape(light[key])}">
             <input type="number" class="r3d-fx-lnum" data-key="${key}" data-no-stepper min="${min}" max="${max}" step="${step}" value="${escape(light[key])}">`);
        const kinds = [['point', 'lit.point'], ['spot', 'lit.spot'], ['beam', 'lit.beam']];
        // The Lighting panel's tray, as a list: a candle here is the candle there.
        const presets = (typeof RRMapLights !== 'undefined' && RRMapLights.PRESETS ? RRMapLights.PRESETS : [])
            .filter(preset => !preset.template.compound);
        return row(this._k('r3dfx.lightPreset'), `<select class="r3d-fx-lpreset" style="${control}">
                <option value="">${escape(this._k('r3dfx.lightPresetNone'))}</option>
                ${presets.map(preset => `<option value="${escape(preset.key)}">${escape(this._k(preset.labelKey))}</option>`).join('')}
            </select>`)
            + row(this._t('Kind'), `<select class="r3d-fx-lkind" title="${escape(this._k('lit.type'))}" style="${control}">
                ${kinds.map(([value, key]) => `<option value="${value}"${value === light.type ? ' selected' : ''}>${escape(this._k(key))}</option>`).join('')}
            </select>`)
            + row(this._k('lit.color'), `<span class="r3d-fx-lcolor" style="flex:1;min-width:0;display:flex;"></span>`)
            // Its aim is the card's Rotate tab and its reach and strength the Light tab, with their handles.
            + slider('flicker', this._k('lit.flicker'), 0, 1, 0.05)
            + ((work.trigger || 'action') === 'action'
                ? row(this._k('r3dfx.lightDuration'), `<input type="number" class="r3d-fx-ldur" data-no-stepper min="0" max="1000000" step="1" value="${escape(light.duration)}" style="flex:1 1 0;width:100%;">`)
                : '')
            + row('', `<label class="r3d-fcheck"><input type="checkbox" class="r3d-fx-lflag" data-key="occlude"${light.occlude ? ' checked' : ''}> ${escape(this._k('lit.occlude'))}</label>
                <label class="r3d-fcheck"><input type="checkbox" class="r3d-fx-lflag" data-key="shadow"${light.shadow ? ' checked' : ''}> ${escape(this._k('lit.shadow'))}</label>`)
            + row('', `<label class="r3d-fcheck"><input type="checkbox" class="r3d-fx-lflag" data-key="body"${light.body ? ' checked' : ''}> ${escape(this._k('r3dfx.lightBody'))}</label>`);
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
        if (!light) { live.group.visible = false; this._syncLightGizmo(null); return; }
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
        // The light as the preview placed it this frame: its handles read the aim from here.
        this._fxGizmoLight = light || null;
        this._syncEffectGizmo();
    }

    /** Where an effect sits in the preview and the frame its own turn is measured in (its anchor's). */
    _effectFrame(def) {
        const at = Reactor3D.effectAnchorWorld(this._object, def, new THREE.Vector3());
        if (!at) return null;
        const turn = this._object.getWorldQuaternion(new THREE.Quaternion());
        if (Reactor3D.effectAnchorQuaternion) {
            const pose = Reactor3D.effectAnchorQuaternion(this._object, def, new THREE.Quaternion());
            if (pose.w !== 1) turn.premultiply(pose);
        }
        return { at, turn };
    }

    /** A media surface's half width and half height as world vectors, as the preview draws it. */
    _effectQuad(def, frame) {
        const axes = Reactor3D.scaleAxes ? Reactor3D.scaleAxes(def.scale) : [1, 1, 1];
        // A surface with no picture chosen yet still has its size: the card's own numbers.
        const sized = def.video ? def : { video: (this._effectWork && this._effectWork.video) || { width: 0.3, height: 0.2 } };
        const native = Reactor3D.videoEffectSize(sized, this._template && this._template.userData.glbSize);
        const grow = this._object.getWorldScale(new THREE.Vector3());
        const rotate = def.rotate || [0, 0, 0];
        const turn = frame.turn.clone().multiply(new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotate[0] * Math.PI / 180, rotate[1] * Math.PI / 180, rotate[2] * Math.PI / 180, 'YXZ')));
        return {
            right: new THREE.Vector3(native[0] * axes[0] * grow.x / 2, 0, 0).applyQuaternion(turn),
            up: new THREE.Vector3(0, native[1] * axes[1] * grow.y / 2, 0).applyQuaternion(turn)
        };
    }

    /**
     * The handles on the selected effect, on the thing itself. The shared
     * axis arrows slide it (the Effect and Offset tabs), the shared pose
     * rings turn it (Rotate), and size handles size it (the last tab): a
     * media surface's edges and corners, a light's reach as a ring, one
     * handle for an animation. A media surface is also outlined as its own
     * rectangle on every tab. A light's rings show its aim as it is in the
     * world, the anchor's own turn included, and nothing rolls a light.
     * Every handle stays one size on screen.
     */
    _syncEffectGizmo() {
        if (typeof RRPoseRings3D === 'undefined' || typeof RRAxisArrows3D === 'undefined' || typeof RRSizeHandles3D === 'undefined'
            || typeof THREE === 'undefined' || typeof Reactor3D === 'undefined' || !Reactor3D.effectAnchorWorld || !this._scene || !this._camera || !this._detail) return;
        const work = this._effectWork;
        const def = this._cardMode === 'effect' && work && this._object ? this._effectDef(work) || work : null;
        const frame = def ? this._effectFrame(def) : null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        if (!frame || !canvas) {
            this._hideEffectGizmo();
            return;
        }
        if (!this._fxGizmo) {
            // Made small and grown to size: the rings' tube has a floor, which gives them the arrows' weight at this size.
            const rings = RRPoseRings3D.create(THREE, this.EFFECT_RING_BASE, 'fx-rings');
            const arrows = RRAxisArrows3D.create(THREE, 1, 'fx-arrows');
            this._fxGizmo = { rings, arrows };
            // The rings sit in the effect's own frame, so each one turns the number it shows.
            const turn = new THREE.Group();
            turn.name = 'fx-turn-frame';
            turn.add(rings.root);
            const size = RRSizeHandles3D.create(THREE, 'fx-size');
            Object.assign(this._fxGizmo, { turn, size });
            for (const root of [turn, arrows.root, size.root]) {
                root.traverse(node => { node.userData.__reactorOverlay = true; });
                this._scene.add(root);
            }
        }
        const gizmo = this._fxGizmo;
        const rect = canvas.getBoundingClientRect();
        const tool = Database3DEditor.effectTool(this._fxTab);
        const isLight = work.type === 'light', isVideo = work.type === 'video';
        const light = isLight ? this._fxGizmoLight : null;
        const at = light ? new THREE.Vector3(light.x + 0.5, light.height, light.y + 1) : frame.at;
        const unit = RRSizeHandles3D.pixelWorld(THREE, this._camera, rect, at);
        gizmo.at = at;
        gizmo.arrows.length = unit * 78;
        gizmo.arrows.root.scale.setScalar(gizmo.arrows.length);
        RRAxisArrows3D.sync(gizmo.arrows, at, tool === 'move');
        gizmo.rings.radius = unit * 62;
        gizmo.rings.root.scale.setScalar(gizmo.rings.radius / this.EFFECT_RING_BASE);
        gizmo.turn.position.copy(at);
        const here = { x: 0, y: 0, z: 0 };
        if (isLight) {
            const aim = light || work.light || {};
            gizmo.turn.quaternion.identity();
            gizmo.rings.roll.group.visible = false;
            RRPoseRings3D.sync(gizmo.rings, here, aim.yaw, -aim.pitch, tool === 'turn' && aim.type !== 'point');
        } else {
            gizmo.turn.quaternion.copy(frame.turn);
            gizmo.rings.roll.group.visible = true;
            RRPoseRings3D.sync(gizmo.rings, here, work.rotate[1], work.rotate[0], tool === 'turn');
        }
        // An effect sits on the model's surface, so half of every ring is inside the model: it shows through.
        // The handle under the pointer is lit, the rest stay plain to see.
        if (!this._fxGizmoHold) {
            const over = this._fxGizmoHover || {};
            for (const key of ['yaw', 'pitch', 'roll']) {
                gizmo.rings[key].solid.material.opacity = over.kind === 'ring' && over.axis === key ? 1 : 0.75;
                gizmo.rings[key].ghost.material.opacity = over.kind === 'ring' && over.axis === key ? 0.6 : 0.3;
            }
            RRAxisArrows3D.emphasize(gizmo.arrows, over.kind === 'arrow' ? over.axis : null, false);
            RRSizeHandles3D.emphasize(gizmo.size, over.kind === 'size' ? over.index : -1);
        }
        const size = gizmo.size;
        size.root.visible = true;
        gizmo.sizeKind = null;
        gizmo.quad = null;
        if (isVideo) {
            const quad = this._effectQuad(def, frame);
            const corner = (x, y) => at.clone().addScaledVector(quad.right, x).addScaledVector(quad.up, y);
            gizmo.quad = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
            RRSizeHandles3D.outline(size, gizmo.quad);
            // On a small surface the handles stand off its edges, so eight of them never sit on one spot.
            const reach = 22 * unit;
            const wide = Math.max(1, reach / Math.max(quad.right.length(), 1e-6)), tall = Math.max(1, reach / Math.max(quad.up.length(), 1e-6));
            RRSizeHandles3D.place(THREE, size, tool === 'size' ? RRSizeHandles3D.QUAD.map(handle => corner(handle.x * wide, handle.y * tall)) : [], this._camera, rect);
            gizmo.sizeKind = 'quad';
        } else if (tool === 'size') {
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this._camera.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this._camera.quaternion);
            if (isLight) {
                // The reach, as a ring facing the camera at the edge of the glow the preview draws, grabbed anywhere on it.
                // Never larger than the view can hold: a far-reaching light keeps a ring that can be grabbed.
                const reach = Math.max(unit * 28, Math.min((Number((light || work.light || {}).radius) || 1) * 0.45, unit * 0.36 * Math.min(rect.width, rect.height)));
                const ring = [];
                for (let i = 0; i < 64; i++) {
                    const angle = i / 64 * Math.PI * 2;
                    ring.push(at.clone().addScaledVector(right, Math.cos(angle) * reach).addScaledVector(up, Math.sin(angle) * reach));
                }
                RRSizeHandles3D.outline(size, ring);
                RRSizeHandles3D.place(THREE, size, [ring[0]], this._camera, rect);
                gizmo.sizeKind = 'reach';
            } else {
                const scale = Reactor3D.scaleAxes ? Math.max(...Reactor3D.scaleAxes(work.scale)) : Number(work.scale) || 1;
                const far = unit * 56 * Math.max(0.4, Math.min(3, scale)) * Math.SQRT1_2;
                const grip = at.clone().addScaledVector(right, far).addScaledVector(up, far);
                RRSizeHandles3D.outline(size, [at.clone(), grip]);
                RRSizeHandles3D.place(THREE, size, [grip], this._camera, rect);
                gizmo.sizeKind = 'uniform';
            }
        } else {
            RRSizeHandles3D.outline(size, []);
            RRSizeHandles3D.place(THREE, size, [], this._camera, rect);
        }
        // The anchor's own dot stays small: the handles are what is grabbed.
        if (this._fxMarker && this._fxMarker.userData.radius) this._fxMarker.scale.setScalar(Math.max(1e-6, unit * 4.5 / this._fxMarker.userData.radius));
    }

    /** The rings are created this big and grown to their size on screen. */
    get EFFECT_RING_BASE() { return 0.5; }

    /** The handle of the selected effect under the pointer, for lighting it: { kind, axis | index }, or null. */
    _effectGizmoUnder(clientX, clientY) {
        const gizmo = this._fxGizmo, work = this._effectWork;
        if (!gizmo || !gizmo.at || !work || !this._camera) return null;
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        if (gizmo.size.root.visible && gizmo.size.shown) {
            const index = RRSizeHandles3D.pick(THREE, gizmo.size, this._camera, rect, clientX, clientY);
            if (index >= 0) return { kind: 'size', index };
        }
        if (gizmo.rings.root.visible) {
            const ring = RRPoseRings3D.pick(THREE, gizmo.rings, this._camera, rect, clientX, clientY, null);
            if (ring) return { kind: 'ring', axis: ring.axis };
        }
        if (gizmo.arrows.root.visible) {
            const arrow = RRAxisArrows3D.pick(THREE, gizmo.arrows, this._camera, rect, clientX, clientY);
            if (arrow) return { kind: 'arrow', axis: arrow.axis };
        }
        return null;
    }

    _hideEffectGizmo() {
        if (!this._fxGizmo) return;
        this._fxGizmo.rings.root.visible = false;
        this._fxGizmo.arrows.root.visible = false;
        this._fxGizmo.size.root.visible = false;
        this._fxGizmo.at = null;
        this._fxGizmo.quad = null;
    }

    _disposeEffectGizmo() {
        if (!this._fxGizmo) return;
        if (typeof RRPoseRings3D !== 'undefined') RRPoseRings3D.dispose(this._fxGizmo.rings);
        if (typeof RRAxisArrows3D !== 'undefined') RRAxisArrows3D.dispose(this._fxGizmo.arrows);
        if (typeof RRSizeHandles3D !== 'undefined') RRSizeHandles3D.dispose(this._fxGizmo.size);
        this._fxGizmo.turn?.parent?.remove(this._fxGizmo.turn);
        this._fxGizmo = null;
        this._fxGizmoHold = null;
    }

    /** A handle of the selected effect under the pointer (a size handle, an arrow, a ring), as a hold, or null. */
    _pickEffectGizmo(clientX, clientY) {
        const gizmo = this._fxGizmo;
        const work = this._effectWork;
        if (!gizmo || !gizmo.at || !work || !this._camera || !this._object) return null;
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        const centre = RRSizeHandles3D.screen(THREE, this._camera, rect, gizmo.at);
        if (gizmo.size.root.visible && gizmo.size.shown && centre) {
            let index = RRSizeHandles3D.pick(THREE, gizmo.size, this._camera, rect, clientX, clientY);
            let grip = index >= 0 ? RRSizeHandles3D.screen(THREE, this._camera, rect, gizmo.size.handles[index].position) : null;
            if (index < 0 && gizmo.sizeKind === 'reach') {
                const edge = RRSizeHandles3D.screen(THREE, this._camera, rect, gizmo.size.handles[0].position);
                const away = Math.hypot(clientX - centre[0], clientY - centre[1]);
                if (edge && Math.abs(away - Math.hypot(edge[0] - centre[0], edge[1] - centre[1])) <= 7) { index = 0; grip = [clientX, clientY]; }
            }
            if (index >= 0 && grip) {
                RRSizeHandles3D.emphasize(gizmo.size, index);
                const hold = { kind: 'size', size: gizmo.sizeKind, centre, grip };
                if (hold.size === 'quad') {
                    hold.handle = RRSizeHandles3D.QUAD[index];
                    hold.start = { width: Number(work.video.width), height: Number(work.video.height) };
                } else if (hold.size === 'reach') {
                    hold.start = this._ensureLightWork(work).radius;
                } else {
                    hold.start = Array.isArray(work.scale) ? work.scale.slice() : (Number(work.scale) > 0 ? Number(work.scale) : 1);
                }
                return hold;
            }
        }
        if (gizmo.rings.root.visible && work.type !== 'light') {
            const ring = RRPoseRings3D.pick(THREE, gizmo.rings, this._camera, rect, clientX, clientY,
                { yaw: work.rotate[1], pitch: work.rotate[0], roll: work.rotate[2] });
            if (ring) {
                RRPoseRings3D.emphasize(gizmo.rings, ring.axis, true);
                return { kind: 'ring', grab: ring, turn: { yaw: 1, pitch: 0, roll: 2 }[ring.axis] };
            }
        }
        if (gizmo.arrows.root.visible) {
            const arrow = RRAxisArrows3D.pick(THREE, gizmo.arrows, this._camera, rect, clientX, clientY);
            if (arrow) {
                RRAxisArrows3D.emphasize(gizmo.arrows, arrow.axis, true);
                const start = Reactor3D.effectAnchorWorld(this._object, this._effectDef(work) || work, new THREE.Vector3());
                return { kind: 'arrow', grab: arrow, start };
            }
        }
        const aim = this._fxGizmoLight;
        if (gizmo.rings.root.visible && aim) {
            const ring = RRPoseRings3D.pick(THREE, gizmo.rings, this._camera, rect, clientX, clientY,
                { yaw: aim.yaw, pitch: -aim.pitch, roll: 0 });
            if (ring) {
                RRPoseRings3D.emphasize(gizmo.rings, ring.axis, true);
                const light = this._ensureLightWork(work);
                return { kind: 'ring', grab: ring, startYaw: light.yaw, startPitch: light.pitch };
            }
        }
        return null;
    }

    _dragEffectGizmo(hold, clientX, clientY) {
        const work = this._effectWork;
        if (!hold || !work || !this._object || !this._camera) return;
        if (hold.kind === 'size') {
            // A size handle: how far the pointer has gone along the line from the centre through it.
            const by = RRSizeHandles3D.factor(hold.centre, hold.grip, [clientX, clientY]);
            if (hold.size === 'quad') Object.assign(work.video, RRSizeHandles3D.resize(hold.handle, hold.start, by, { min: 0.01, max: 4, places: 3 }));
            else if (hold.size === 'reach') this._ensureLightWork(work).radius = RRSizeHandles3D.uniform(hold.start, by, { min: 0.1, max: 60, places: 1 });
            else work.scale = RRSizeHandles3D.uniform(hold.start, by, { min: 0.1, max: 4, places: 2 });
        } else if (hold.kind === 'ring' && hold.turn !== undefined) {
            const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
            const value = RRPoseRings3D.drag(THREE, hold.grab, this._camera, rect, clientX, clientY);
            if (value === null) return;
            work.rotate[hold.turn] = Math.round(value);
        } else if (hold.kind === 'arrow') {
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
        this._afterEffectEdit(false);
    }

    _endEffectGizmoDrag() {
        if (this._fxGizmo) {
            RRPoseRings3D.emphasize(this._fxGizmo.rings, null, false);
            RRAxisArrows3D.emphasize(this._fxGizmo.arrows, null, false);
            RRSizeHandles3D.emphasize(this._fxGizmo.size, -1);
        }
        this._fxGizmoHold = null;
        this._afterEffectEdit(true);
    }

    /**
     * After any edit of the effect by a handle or the card: the marker, the
     * preview and the handles follow at once, and the card shows the new
     * numbers without being rebuilt under a drag. A final edit is one step
     * back, and rebuilds the card and the list so they catch up.
     */
    _afterEffectEdit(final) {
        const work = this._effectWork;
        this._syncEffectAnchorMarker();
        if (work && this._fxPreview && this._fxPreview.active) this._fxPreview.setTransform({ rotate: work.rotate, scale: work.scale });
        this._updateEffectPreview();
        this._syncEffectControls();
        this._lastInputAt = performance.now();
        if (final) {
            this._fxCheckpoint();
            this.renderEditCard();
            this.renderEffectList();
        }
    }

    /** The work's numbers into the card's sliders, whichever tab is showing. */
    _syncEffectControls() {
        this._syncLightControls();
        const work = this._effectWork;
        const root = this._detail && this._detail.querySelector('.r3d-card');
        if (!work || !root) return;
        const set = (element, value) => { if (element && document.activeElement !== element) element.value = String(value); };
        if (this._fxTab === 'rotate' && work.type !== 'light') {
            root.querySelectorAll('.r3d-fxcard-slider').forEach(slider => {
                const i = Number(slider.dataset.i);
                set(slider, work.rotate[i] || 0);
                const readout = root.querySelector(`.r3d-fxcard-slider-val[data-i="${i}"]`);
                if (readout) readout.textContent = Math.round(work.rotate[i] || 0) + '°';
            });
        }
        root.querySelectorAll('.r3d-fxcard-size').forEach(slider => {
            const value = Number(work.video && work.video[slider.dataset.key]) || 0;
            set(slider, value);
            const readout = root.querySelector(`.r3d-fxcard-size-val[data-key="${slider.dataset.key}"]`);
            if (readout) readout.textContent = value.toFixed(2);
        });
        const axes = Array.isArray(work.scale) ? work.scale : [work.scale, work.scale, work.scale];
        root.querySelectorAll('.r3d-fxcard-scale').forEach(slider => {
            const percent = Math.round((Number(axes[slider.dataset.i === 'all' ? 0 : Number(slider.dataset.i)]) || 1) * 100);
            set(slider, percent);
            const readout = root.querySelector(`.r3d-fxcard-scale-val[data-i="${slider.dataset.i}"]`);
            if (readout) readout.textContent = percent + '%';
        });
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
        return rows.map(row => this._cardRow(escape(row.label), `<input type="range" class="r3d-fxcard-lslider" data-key="${row.key}" min="${row.min}" max="${row.max}" step="${row.step}"
                    value="${escape(light[row.key])}"${row.enabled ? '' : ' disabled'} title="${this._t('Double-click to reset')}">
                <span class="r3d-fxcard-lslider-val r3d-fvalue" data-key="${row.key}">${shown(row.key, light[row.key])}</span>`, row.enabled ? '' : 'is-dimmed')).join('')
            + (tab === 'rotate' && !aimed ? `<div class="r3d-fnote">${escape(this._k('lit.point'))}</div>` : '');
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
        this._fxGizmoLight = null;
        this._disposeEffectGizmo();
        this._lightPreviewLit(false);
    }

    /** Choose the video from the project's movies folder. */
    /** Choose a picture or a movie from the project's media, as an effect's video is chosen. */
    async _pickMediaFile(current, onPick) {
        const lister = typeof MediaSurfaceEditor !== 'undefined'
            ? new MediaSurfaceEditor(this.databaseManager, this.projectController) : null;
        const files = lister
            ? (lister.mediaFiles ? lister.mediaFiles(this._project()) : lister.movieFiles(this._project()))
            : [];
        const names = files.map(file => file.relativePath);
        if (!names.length) { RRDialog.alert(this._k('r3dfx.noVideos'), { title: this._k('menu.models3d'), kind: 'warning' }); return; }
        const picker = window.reactor?.databaseEditorUI;
        if (!picker || typeof picker.showImagePicker !== 'function') {
            const chosen = await RRDialog.prompt(this._k('r3dfx.video'), { title: this._k('menu.models3d'), value: current || names[0] });
            if (chosen && names.indexOf(chosen) >= 0) onPick(chosen);
            return;
        }
        const path = require('path');
        const urlFor = name => {
            const file = files.find(entry => entry.relativePath === name);
            const isImage = /\.(?:png|jpe?g|webp)$/i.test(String(name || ''));
            const absolute = file ? file.absolutePath
                : path.join(this._project().path, isImage ? path.join('img', 'pictures') : 'movies', name);
            return typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl ? RRAssetFiles.toUrl(absolute) : 'file://' + absolute;
        };
        picker.showImagePicker(this._k('r3dfx.video'), names, name => { if (name) onPick(name); }, urlFor, current || undefined,
            { allowNone: false, mediaType: 'video', selectButtonLabel: this._k('r3dfx.chooseVideo') });
    }

    async _pickEffectVideo() {
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
            RRDialog.alert(this._k('r3dfx.noVideos'), { title: this._k('menu.models3d'), kind: 'warning' });
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
        const chosen = await RRDialog.prompt(this._k('r3dfx.video'), { title: this._k('menu.models3d'), value: work.video.file || names[0] });
        // The effect being edited may have been closed or changed while the question was up.
        if (this._effectWork !== work) return;
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
        // A variant in view shows its own picture on the surface.
        const shown = this.variantsPanel ? this.variantsPanel.mediaFileFor(raw) || raw.video.file : raw.video.file;
        const isImage = /\.(?:png|jpe?g|webp)$/i.test(shown);
        const mediaPath = path.join(this._project().path,
            isImage ? path.join('img', 'pictures') : 'movies', shown);
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
        // A variant in view can leave the surface off.
        mesh.visible = !(this.variantsPanel && this.variantsPanel.mediaOff(raw));
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
        if (!this._anchorAtPointer(event.clientX, event.clientY, true)) return;
        this._fxCheckpoint();
        this.renderEffectForm();
        this._syncEffectAnchorMarker();
        this.renderEditCard();
    }

    /** Put the anchor on the model's surface under the pointer; false when the pointer is off the model. */
    _anchorAtPointer(clientX, clientY, refreshSkin) {
        const work = this._effectWork;
        if (!work || !this._object || typeof THREE === 'undefined') return false;
        const hits = this._raycastPointer(clientX, clientY, { refreshSkin }) || [];
        const hit = hits.find(entry => !(entry.object.userData && entry.object.userData.__reactorOverlay));
        if (!hit) return false;
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
        return true;
    }

    /**
     * A drag of the effect itself: it slides over the model's surface under
     * the pointer (and belongs to the part it lands on, as a click of Place
     * on model does), and off the model it follows the pointer in the plane
     * facing the camera.
     */
    _slideEffectAnchor(clientX, clientY) {
        if (!this._effectWork || !this._fxMarker) return;
        if (!this._anchorAtPointer(clientX, clientY, false)) {
            const point = this._cameraPlanePoint(clientX, clientY, this._fxMarker.position);
            if (!point) return;
            this._fxMarker.position.copy(point);
            this._commitAnchorFromMarker();
        }
        this._afterEffectEdit(false);
    }

    /** Whether the pointer is on the selected effect: its dot, or anywhere on a media surface. */
    _pointerOnEffect(clientX, clientY) {
        if (this._pointerNearMarker(this._fxMarker, clientX, clientY)) return true;
        const quad = this._fxGizmo && this._fxGizmo.quad;
        if (!quad || !this._camera || typeof RRSizeHandles3D === 'undefined') return false;
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        return RRSizeHandles3D.inside(quad.map(corner => RRSizeHandles3D.screen(THREE, this._camera, rect, corner)), clientX, clientY);
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
        marker.userData.radius = radius;
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
        const swimming = !!this._sim.swimming;
        const jumping = !!this._sim.jumping && !swimming;
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
            // Only what the variant in view wears; the effect in hand always shows.
            if (this.variantsPanel && index !== this.selectedEffect && !this.variantsPanel.shows(raw)) return;
            const active = trigger === 'always'
                || (trigger === 'moving' && moving)
                || (trigger === 'walking' && moving && !dashing)
                || (trigger === 'dashing' && dashing)
                || (trigger === 'jumping' && jumping)
                || (trigger === 'swimming' && swimming && moving)
                || (trigger === 'treading' && swimming && !moving)
                || (trigger === 'climbing' && !!this._sim.climbing)
                || (trigger === 'idle' && !moving && !jumping && !swimming && !this._sim.climbing);
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
        // A light's preview places its own handles; every other effect's are placed here.
        if (this._fxLight) this._updateLightPreview();
        else if (this._fxGizmo || this._cardMode === 'effect') this._syncEffectGizmo();
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
            // A click picks from the pose as it stands now; a hover uses the kept one.
            this._clickRefresh = true;
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
            // An effect's handles come first: they sit on the effect, over the model behind them.
            if (event.button === 0 && !event.ctrlKey && this._cardMode === 'effect' && this._fxGizmo) {
                const hold = this._pickEffectGizmo(event.clientX, event.clientY);
                if (hold) {
                    mode = 'fxgizmo';
                    this._fxGizmoHold = hold;
                    canvas.style.cursor = 'grabbing';
                    event.preventDefault();
                    return;
                }
            }
            // The effect itself (its dot, or a media surface anywhere on it) slides over the model.
            // While placing, a press anywhere is a place to put it, the surface's own area included.
            if (event.button === 0 && !event.ctrlKey && this._cardMode === 'effect' && this._tool !== 'fxanchor'
                && this._pointerOnEffect(event.clientX, event.clientY)) {
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
            // An effect's handle lights under the pointer, so it is plain which one a press will take.
            if (this._cardMode === 'effect' && this._fxGizmo && !mode) {
                const over = this._effectGizmoUnder(event.clientX, event.clientY);
                if (JSON.stringify(over) !== JSON.stringify(this._fxGizmoHover || null)) {
                    this._fxGizmoHover = over;
                    this._lastInputAt = performance.now();
                }
                canvas.style.cursor = over ? 'pointer' : (this._tool === 'orbit' ? 'grab' : 'crosshair');
            }
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
                this._dragRigMarker(this._rigDragKey, event.clientX, event.clientY, event);
            } else if (mode === 'facearrow') {
                this._dragFacePointArrow(this._faceArrowHold, event.clientX, event.clientY);
            } else if (mode === 'fxdrag' && this._fxMarker) {
                this._slideEffectAnchor(event.clientX, event.clientY);
            } else if (mode === 'fxgizmo' && this._fxGizmoHold) {
                this._dragEffectGizmo(this._fxGizmoHold, event.clientX, event.clientY);
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
                this._endFaceDrag();
                this._refreshUnsaved();
            } else if (mode === 'facearrow') {
                if (this._faceArrows) RRAxisArrows3D.emphasize(this._faceArrows, null, false);
                this._faceArrowHold = null;
                this._refreshUnsaved();
            } else if (mode === 'fxdrag') {
                if (!stationary) this._afterEffectEdit(true);
            } else if (mode === 'fxgizmo') {
                this._endEffectGizmoDrag();
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
            // In proportion to the scroll: a notch (about 100) is 15%, and a
            // smooth-scrolling wheel's many small events add up to the same.
            const lines = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
            let ratio = Math.pow(1.15, Math.max(-3, Math.min(3, lines / 100)));
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

    _raycastPointer(clientX, clientY, { refreshSkin = true } = {}) {
        if (!this._object || !this._camera || typeof THREE === 'undefined') return null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        // A skinned model is tested against its rest pose through a tree over
        // its triangles: three re-poses every vertex of a skinned mesh per ray
        // (190-300 ms on a 150k character), which froze every hover and every
        // scroll. The rest pose is where the idle stands, give or take.
        if (this._skinned && typeof RRMeshBvh !== 'undefined') {
            this._object.updateMatrixWorld(true);
            const proxies = this._skinnedSnapshot(refreshSkin && this._clickRefresh);
            this._clickRefresh = false;
            const hit = RRMeshBvh.raycastMeshes(raycaster.ray, proxies, THREE);
            if (!hit) return [];
            const mesh = hit.object.mesh;
            const index = mesh.geometry.getIndex();
            const t = hit.triangle * 3;
            const face = index ? { a: index.getX(t), b: index.getX(t + 1), c: index.getX(t + 2) } : { a: t, b: t + 1, c: t + 2 };
            return [{ point: hit.point, distance: hit.distance, object: mesh, face, faceIndex: hit.triangle }];
        }
        // A skinned mesh is ray-tested against its own cached bounds, which
        // three computes once from the geometry as loaded — for a rigged
        // character that box can be a few centimetres at the origin, and
        // every click on the mascot missed it. Refresh the bounds from the
        // posed skeleton first; a click is rare enough to afford it.
        if (refreshSkin) {
            this._skinBoundsAt = performance.now();
            this._object.traverse(node => {
                if (!node.isSkinnedMesh || typeof node.computeBoundingBox !== 'function') return;
                node.computeBoundingBox();
                node.computeBoundingSphere();
            });
        }
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
        // the card's chooser; the anchor tool keeps the canvas. A look's card stays up the same way.
        if (this._cardMode === 'effect' || this._cardMode === 'look') return;
        const found = this._partUnderPointer(event.clientX, event.clientY);
        // With a motion open, a click on the model picks that part's track.
        if (this.motionEditor && this.motionEditor.active) {
            if (found) this.motionEditor.pickPart(found.name);
            return;
        }
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
        // One zoom point per scroll: a notch within 300 ms of the last, near the same spot, keeps it
        // (every notch renews the wait, so a long scroll never ray-tests again), and a model too heavy
        // to test on every scroll zooms toward the view's plane like empty space does.
        const now = performance.now(), last = this._wheelHit;
        if (last && now - last.at < 300 && Math.hypot(last.x - clientX, last.y - clientY) < 6) { last.at = now; return last.point || this._cameraPlanePoint(clientX, clientY, centre); }
        // A skinned or heavy model is not ray-tested on a scroll: three poses every
        // vertex of a skinned mesh to test it (190-300 ms on a 150k character, a
        // freeze at the start of every scroll). The zoom only needs a point to
        // close on: where the pointer's ray enters the model's box.
        if (this._skinned || (this._triangleCount || 0) > Database3DEditor.WHEEL_RAYCAST_BUDGET) {
            const point = this._pointerBoxPoint(clientX, clientY);
            this._wheelHit = { at: now, x: clientX, y: clientY, point };
            return point || this._cameraPlanePoint(clientX, clientY, centre);
        }
        const hits = this._raycastPointer(clientX, clientY, { refreshSkin: false }) || [];
        const hit = hits.find(entry => !(entry.object.userData && entry.object.userData.__reactorOverlay));
        this._wheelHit = { at: now, x: clientX, y: clientY, point: hit ? hit.point.clone() : null };
        return this._wheelHit.point || this._cameraPlanePoint(clientX, clientY, centre);
    }

    /**
     * A skinned model's surface as it stands, for ray tests: every vertex
     * skinned once (as three draws it) into a plain geometry with a tree
     * over it. Kept per instance and taken again on a click (`fresh`), so a
     * hover or a scroll never pays for skinning.
     */
    _skinnedSnapshot(fresh = false) {
        if (!fresh && this._snapshot && this._snapshot.object === this._object) return this._snapshot.proxies;
        const proxies = [];
        const v = new THREE.Vector3();
        this._object.traverse(node => {
            if (!(node.isMesh || node.isSkinnedMesh) || !node.visible || (node.userData && node.userData.__reactorOverlay)) return;
            let geometry = node.geometry;
            if (node.isSkinnedMesh && typeof node.getVertexPosition === 'function') {
                const position = node.geometry.getAttribute('position');
                const out = new Float32Array(position.count * 3);
                for (let i = 0; i < position.count; i++) { node.getVertexPosition(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(out, 3));
                if (node.geometry.getIndex()) geometry.setIndex(node.geometry.getIndex());
            }
            proxies.push({ mesh: node, geometry, matrixWorld: node.matrixWorld, visible: true, material: node.material });
        });
        this._snapshot = { object: this._object, proxies };
        return proxies;
    }

    /** Where the pointer's ray enters the model's box (its bind-pose box, kept per instance), or null. */
    _pointerBoxPoint(clientX, clientY) {
        if (!this._object || !this._camera) return null;
        if (!this._boxFor || this._boxFor !== this._object) {
            this._boxFor = this._object;
            this._object.updateMatrixWorld(true);
            this._pointerBox = new THREE.Box3().setFromObject(this._object);
        }
        if (!this._pointerBox || this._pointerBox.isEmpty()) return null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const raycaster = this._boxRaycaster || (this._boxRaycaster = new THREE.Raycaster());
        raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this._camera);
        return raycaster.ray.intersectBox(this._pointerBox, new THREE.Vector3());
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
     * Rig markers and their labels keep one size on screen whatever the
     * zoom, each sized from its own distance to the camera: a dot big
     * enough to see and grab on a fingertip, and text that stays readable.
     */
    // Label heights are the sprite's: its text is a bit under half of it (13px and 11px type).
    static get RIG_MARKER_PX() { return { joint: 14, fine: 10, label: 28, fineLabel: 24, hover: 1.5 }; }

    _updateRigOverlay() {
        if (this._rigMode && this._rigFaceMode) { this._updateFaceOverlay(); return; }
        if (!this._rigMode || this._rigFaceMode || !this._rigMarkerMeshes || !this._camera) return;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas && canvas.getBoundingClientRect();
        if (!rect || !rect.height) return;
        const px = Database3DEditor.RIG_MARKER_PX;
        const tanHalf = Math.tan((this._camera.fov * Math.PI) / 360);
        const groupScale = (this._object ? this._object.scale.y : 1) || 1;
        const world = this._rigWorldScratch || (this._rigWorldScratch = new THREE.Vector3());
        for (const marker of this._rigMarkerDefinitions()) {
            const sphere = this._rigMarkerMeshes[marker.key];
            if (!sphere) continue;
            sphere.getWorldPosition(world);
            // Model units per screen pixel at this marker's depth.
            const perPixel = (2 * Math.max(1e-4, world.distanceTo(this._camera.position)) * tanHalf) / rect.height / groupScale;
            const hover = marker.key === this._rigHoverKey || marker.key === this._rigDragKey ? px.hover : 1;
            const radius = sphere.geometry.parameters.radius || 1;
            sphere.scale.setScalar(((marker.fine ? px.fine : px.joint) * hover / 2) * perPixel / radius);
            const label = this._rigMarkerLabels && this._rigMarkerLabels[marker.key];
            if (label) {
                const height = (marker.fine ? px.fineLabel : px.label) * perPixel;
                label.scale.set(height * label.userData.__aspect, height, 1);
                // Just above the dot: past its radius, then half the label's own height.
                label.position.set(sphere.position.x, sphere.position.y + radius * sphere.scale.x + height * 0.6, sphere.position.z);
            }
        }
        this._rigOverlayScale = 1;
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
        if (!this._rigMode || !this._rigMarkerMeshes || !this._pointer || this._rigDragKey) return;
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
        if (typeof RRMeshSurfacePicker === 'undefined' || !this._object || typeof THREE === 'undefined') return;
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
    _rigSurfacePoint(clientX, clientY, onSurface = false) {
        if (!this._rigSurface || !this._camera || !this._rigGroup) return null;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        const o = raycaster.ray.origin, d = raycaster.ray.direction;
        // A marker for a place on the surface (a tip, a muzzle, a trigger) lands just under the skin; the rest in the middle.
        const hit = this._rigSurface.pickFlesh(o.x, o.y, o.z, d.x, d.y, d.z, onSurface ? this._rigThickness() * 0.01 : this._rigThickness());
        if (!hit) return null;
        return this._rigGroup.worldToLocal(new THREE.Vector3().fromArray(hit.point));
    }

    /** Where a template's markers start: from the model's own shape for a thing held in a hand, else from its size. */
    _rigDefaultMarkers() {
        if ((ModelRigger.TEMPLATES[this._rigTemplate] || {}).vehicle) return this._riderMarkers(false);
        const size = this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 };
        let held = null;
        if (typeof Reactor3D !== 'undefined' && Reactor3D.heldMarkerDefaults && Reactor3D.HELD_RIGS[this._rigTemplate] && this._object) {
            // The model alone is read: the rig's own dots are taken off it for the moment.
            const group = this._rigGroup && this._rigGroup.parent === this._object ? this._rigGroup : null;
            if (group) this._object.remove(group);
            delete this._object.userData.__heldShape;
            try { held = Reactor3D.heldMarkerDefaults(this._object, this._rigTemplate); } catch (error) { held = null; }
            delete this._object.userData.__heldShape;
            if (group) this._object.add(group);
        }
        return held || ModelRigger.defaultMarkers(size, this._rigTemplate);
    }

    /**
     * A held thing's middle under the pointer: where the pointer's ray crosses the plane that halves it side to
     * side (through its long axis and the way its bulk hangs), in rig-group space. A grip, a muzzle and a stock
     * are marked there, whatever plates the model is built from. Null for other templates, or seen edge-on.
     */
    _rigHeldMiddlePoint(clientX, clientY) {
        if (typeof Reactor3D === 'undefined' || !Reactor3D.HELD_RIGS || !Reactor3D.HELD_RIGS[this._rigTemplate] || !this._object || !this._camera || !this._rigGroup) return null;
        if (!this._rigHeldPlane || this._rigHeldPlane.object !== this._object) {
            const group = this._rigGroup.parent === this._object ? this._rigGroup : null;
            if (group) this._object.remove(group);
            delete this._object.userData.__heldShape;
            let shape = null;
            try { shape = Reactor3D.heldShape(this._object); } catch (error) { shape = null; }
            delete this._object.userData.__heldShape;
            if (group) this._object.add(group);
            if (!shape) return null;
            const axis = new THREE.Vector3().fromArray(shape.axis), down = new THREE.Vector3().fromArray(shape.down);
            const on = new THREE.Vector3().fromArray(shape.handle ? shape.line : shape.base);
            if (shape.handle) on.setComponent(shape.axis.findIndex(n => n !== 0), 0);
            this._rigHeldPlane = { object: this._object, point: on, normal: new THREE.Vector3().crossVectors(axis, down).normalize() };
        }
        const canvas = this._detail.querySelector('.r3d-db-canvas'), rect = canvas.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this._camera);
        this._object.updateMatrixWorld(true);
        const point = this._object.localToWorld(this._rigHeldPlane.point.clone()), normal = this._rigHeldPlane.normal.clone().transformDirection(this._object.matrixWorld);
        if (Math.abs(raycaster.ray.direction.dot(normal)) < 0.15) return null;
        const hit = raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point), new THREE.Vector3());
        return hit ? this._rigGroup.worldToLocal(hit) : null;
    }

    /** Whether the model's rig has bones (a held thing's rig is markers only). */
    _rigHasBones() {
        return !!(this.customRig && Array.isArray(this.customRig.bones) && this.customRig.bones.length);
    }

    /** Markers inside the model draw solid; one floating outside it draws faint, so a miss shows from any angle. */
    _refreshRigMarkerFit(keys) {
        // Face markers lie on the surface itself: inside or outside says nothing about them.
        if (this._rigFaceMode || !this._rigSurface || !this._rigMarkerMeshes) return;
        // A held thing's markers sit on its middle plane, between the plates it is built from: none is drawn faint.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.HELD_RIGS && Reactor3D.HELD_RIGS[this._rigTemplate]) return;
        for (const key of keys || Object.keys(this._rigMarkerMeshes)) {
            const sphere = this._rigMarkerMeshes[key];
            if (!sphere) continue;
            const world = sphere.getWorldPosition(new THREE.Vector3());
            const inside = this._rigSurface.inside(world.x, world.y, world.z);
            sphere.userData.__inside = inside;
            sphere.material.opacity = inside ? 0.95 : 0.35;
        }
    }

    /** A marker's label floats just above it; the overlay pass sizes both each frame. */
    _placeRigLabel(key) {
        const sphere = this._rigMarkerMeshes && this._rigMarkerMeshes[key], label = this._rigMarkerLabels && this._rigMarkerLabels[key];
        if (!sphere || !label) return;
        const radius = (sphere.geometry.parameters.radius || 0) * sphere.scale.x;
        label.position.set(sphere.position.x, sphere.position.y + radius + label.scale.y * 0.6, sphere.position.z);
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
        // (Every model opens the tool, and every kind of rig is offered: what a model with carved parts cannot
        // take, a skeleton, is said in the bar beside Save, where the kind is chosen.)
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
            this._faceMouthOpen = Number.isFinite(savedPoints.mouth?.open) ? Math.max(0, Math.min(2, savedPoints.mouth.open)) : 1;
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
            this._initMouthRing(savedPoints);
            this._faceMarkerBaseline = JSON.parse(JSON.stringify(this._rigMarkers));
            this._buildRigVisuals();
            // A ring worked out from the old points lies on a flat plane: lay it on the face.
            if (this._mouthRingDerived) { this._snapMouthRingToFace(); this._syncFacePointVisuals(); }
            this.renderRigBar();
            this.renderEditCard();
            return true;
        }
        // Markers describe the rest pose, so the model holds it while they
        // are placed: an idle clip kept walking Carol out from under her rig.
        this._stopEffectPreview();
        this._rebuildInstance();
        this._rigMode = true;
        // It opens on the kind the model already has: its rig's; else a rider's, for a model whose file has a seat;
        // else the kind used last. Any other is a choice of the bar's list.
        const saved = this.customRig && ModelRigger.TEMPLATES[this.customRig.template] ? this.customRig.template : '';
        this._rigTemplate = saved || (this._hasRiderSeat() ? 'rider' : (this._rigTemplate || 'humanoid'));
        this._rigMarkers = this._rigStartMarkers();
        this._buildRigVisuals();
        this.renderRigBar();
        return true;
    }

    /** Whether the model's file gives a rider a seat (model.json > vehicle > seats). */
    _hasRiderSeat() {
        const sidecar = this._sidecarObject(), block = sidecar && sidecar.vehicle;
        const seat = block && typeof block === 'object' && Array.isArray(block.seats) ? block.seats[0] : null;
        return !!(seat && typeof seat === 'object' && seat.seat);
    }

    /** Where the markers of the chosen kind start: the model's saved ones, else that kind's first guess. */
    _rigStartMarkers() {
        if ((ModelRigger.TEMPLATES[this._rigTemplate] || {}).vehicle) return this._riderMarkers(true);
        const saved = this.customRig && this.customRig.template === this._rigTemplate ? this.customRig.markers : null;
        const size = this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 };
        const placed = saved && ModelRigger.markersFor(this._rigTemplate).some(marker => Array.isArray(saved[marker.key]) && saved[marker.key].length === 3);
        return placed ? ModelRigger.completeMarkers(saved, this._rigTemplate, size) : this._rigDefaultMarkers();
    }

    /** Whether the chosen kind binds a skeleton, which a model with carved parts cannot take (both count the model's meshes and triangles uncarved). */
    _rigNeedsUncarved() {
        const template = ModelRigger.TEMPLATES[this._rigTemplate];
        return !!template && !template.markersOnly && this.customParts.length > 0;
    }

    /**
     * The kind of vehicle this model is, '' when it is none: the kind of the Vehicles record that wears it, else a
     * motorcycle for a model whose own file carries a `vehicle` block.
     */
    _vehicleKind() {
        const records = this.databaseManager && this.databaseManager.data && Array.isArray(this.databaseManager.data.vehicles) ? this.databaseManager.data.vehicles : [];
        const record = records.find(row => row && row.model && row.model.name === this.selectedName);
        if (record) return typeof record.kind === 'string' && record.kind ? record.kind : 'motorcycle';
        const sidecar = this._sidecarObject();
        return sidecar && sidecar.vehicle && typeof sidecar.vehicle === 'object' && !Array.isArray(sidecar.vehicle) ? 'motorcycle' : '';
    }

    /** The model's model.json as it stands on disk, null when it has none or it does not read. */
    _sidecarObject() {
        try {
            const text = this._readSidecarForUpdate(require('fs'));
            const parsed = text ? JSON.parse(text) : null;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Where a rider's dots start: where the game seats a rider on this model (its file's seat, or the game's own
     * guess from the model's shape and kind); `fromFile` false asks for the guess alone, which is what Reset goes
     * back to. The vehicle's left is kept for mirroring: its file may face any way.
     */
    _riderMarkers(fromFile) {
        const size = this._template.userData.glbSize || { x: 1, y: 1.8, z: 1 };
        const markers = ModelRigger.defaultMarkers(size, 'rider');
        this._riderLeft = null;
        const vehicles = typeof Reactor3D !== 'undefined' ? Reactor3D.Vehicles : null;
        if (!vehicles || typeof vehicles.read !== 'function' || !this._object) return markers;
        // The model alone is measured: the rig's own dots are taken off it for the moment.
        const group = this._rigGroup && this._rigGroup.parent === this._object ? this._rigGroup : null;
        if (group) this._object.remove(group);
        try {
            const sidecar = fromFile ? this._sidecarObject() : null;
            // (Only the block is handed over, so the guess is the same whatever else the file holds.)
            const block = vehicles.read(sidecar && sidecar.vehicle ? { vehicle: sidecar.vehicle } : null, vehicles.boxOf(this._object), this._vehicleKind() || 'motorcycle');
            const seat = block && block.seats && block.seats[0];
            for (const marker of ModelRigger.markersFor('rider')) {
                const at = seat && seat[marker.key] && seat[marker.key].at;
                if (Array.isArray(at) && at.length === 3 && at.every(Number.isFinite)) markers[marker.key] = at.slice();
            }
            if (block && Array.isArray(block.left) && block.left.length === 3) this._riderLeft = block.left.slice();
        } catch (error) {
            console.warn('The rider\'s places could not be read from the model.', error);
        } finally {
            if (group) this._object.add(group);
        }
        return markers;
    }

    /** A marker's twin on the other side: across the model's middle, which for a vehicle's rider is the vehicle's own. */
    _rigMirrorPoint(local) {
        const left = (ModelRigger.TEMPLATES[this._rigTemplate] || {}).vehicle ? this._riderLeft : null;
        if (!left) return [-local.x, local.y, local.z];
        const reach = 2 * (local.x * left[0] + local.y * left[1] + local.z * left[2]);
        return [local.x - reach * left[0], local.y - reach * left[1], local.z - reach * left[2]];
    }

    /**
     * A `vehicle` block with a rider's five points set on its first seat. Whatever else the block and the seat say
     * is kept (which part a hand rides, the posture), and the seat is no longer one the game guessed.
     */
    static withRiderMarkers(block, markers) {
        const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
        const out = plain(block) ? JSON.parse(JSON.stringify(block)) : {};
        const seats = Array.isArray(out.seats) ? out.seats : [];
        const seat = plain(seats[0]) ? seats[0] : {};
        for (const key of ['seat', 'handL', 'handR', 'footL', 'footR']) {
            const at = markers && markers[key];
            if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) continue;
            seat[key] = Object.assign({}, plain(seat[key]) ? seat[key] : {}, { at: at.map(value => Math.round(value * 1000) / 1000) });
        }
        seats[0] = seat;
        out.seats = seats;
        if (Array.isArray(out.guessed)) {
            out.guessed = out.guessed.filter(name => name !== 'seats');
            if (!out.guessed.length) delete out.guessed;
        }
        return out;
    }

    /** The rider's dots written to the model's file (model.json > vehicle > seats), every other key in its place. */
    saveVehicleRider() {
        const fs = require('fs');
        const previous = this._readSidecarForUpdate(fs);
        const sidecar = previous ? JSON.parse(previous) : {};
        const block = Database3DEditor.withRiderMarkers(sidecar && sidecar.vehicle, this._rigMarkers);
        this._writeFileAtomic(fs, this.rulesPath(), RRVehicles.mergeModel(previous, block));
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
            // A dark rim, so a dot reads on a pale surface as well as a dark one.
            if (!this._rigFaceMode) {
                const rim = new THREE.Mesh(sphere.geometry, new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.8 }));
                rim.scale.setScalar(1.35);
                rim.renderOrder = 29.5;
                rim.userData.__reactorOverlay = true;
                rim.raycast = () => {};
                sphere.add(rim);
            }
            sphere.position.fromArray(this._rigMarkers[marker.key]);
            sphere.visible = !this._rigFaceMode || this._faceMarkerVisible(marker.key);
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
        if (this._rigFaceMode) { this._refreshMouthRing(); return; }
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
    _dragRigMarker(key, clientX, clientY, modifiers) {
        if (this._rigFaceMode) { this._dragFaceMarker(key, clientX, clientY, modifiers); return; }
        const sphere = this._rigMarkerMeshes && this._rigMarkerMeshes[key];
        if (!sphere || !this._object) return;
        const anchor = new THREE.Vector3();
        sphere.getWorldPosition(anchor);
        // Into the model under the pointer, at the middle of the flesh there,
        // so the depth is right from every angle; off the model, across the
        // camera plane as before.
        const placing = this._rigMarkerDefinitions().find(entry => entry.key === key);
        const snapped = (placing && placing.surface ? null : this._rigHeldMiddlePoint(clientX, clientY)) || this._rigSurfacePoint(clientX, clientY, !!(placing && placing.surface));
        const point = snapped ? null : this._cameraPlanePoint(clientX, clientY, anchor);
        if (!snapped && !point) return;
        const local = snapped || this._rigGroup.worldToLocal(point.clone());
        this._rigMarkers[key] = [local.x, local.y, local.z];
        sphere.position.copy(local);
        this._placeRigLabel(key);
        const marker = this._rigMarkerDefinitions().find(entry => entry.key === key);
        if (marker && marker.mirror) {
            const twin = this._rigMirrorPoint(local);
            this._rigMarkers[marker.mirror] = twin;
            this._rigMarkerMeshes[marker.mirror].position.fromArray(twin);
            this._placeRigLabel(marker.mirror);
        }
        this._refreshRigMarkerFit(marker && marker.mirror ? [key, marker.mirror] : [key]);
        this._refreshRigBones();
    }

    _rigMarkerDefinitions() {
        return this._rigFaceMode ? this._faceMarkerDefinitions() : ModelRigger.markersFor(this._rigTemplate);
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
        const riding = !!(ModelRigger.TEMPLATES[this._rigTemplate] || {}).vehicle, carved = this._rigNeedsUncarved();
        for (const entry of ModelRigger.templates()) {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = this._t(entry.label);
            option.selected = entry.id === this._rigTemplate;
            templatePick.appendChild(option);
        }
        templatePick.addEventListener('change', () => {
            this._rigTemplate = templatePick.value;
            this._rigMarkers = this._rigStartMarkers();
            this._buildRigVisuals();
            this.renderRigBar();
        });
        bar.appendChild(templatePick);
        // The rig's buttons share one size: the main action highlighted, removing in red.
        const sized = button => { button.style.cssText = 'height:26px;padding:0 12px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;white-space:nowrap;'; return button; };
        const bind = sized(document.createElement('button'));
        bind.type = 'button';
        // The one button that saves the rig: it writes the markers, and binds the model to the skeleton they make.
        bind.className = 'rr-button-primary r3d-save';
        bind.dataset.kind = 'rig';
        bind.textContent = this._t(riding ? 'Save rider' : 'Save rig');
        bind.title = this._t(riding ? 'Saves where a rider sits, holds on and rests its feet to the model.' : 'Saves the rig to the model. With a skeleton, the model is bound to it too.');
        bind.addEventListener('click', () => this.saveRigFromBar());
        bind.disabled = carved;
        if (carved) { bind.style.opacity = '0.5'; bind.style.cursor = 'not-allowed'; }
        bar.appendChild(bind);
        if (!riding) {
            const face = sized(document.createElement('button'));
            face.type = 'button';
            face.className = 'rr-btn-secondary';
            face.textContent = this._t('Face points');
            face.addEventListener('click', () => this.requestTool('face'));
            bar.appendChild(face);
        }
        const reset = sized(document.createElement('button'));
        reset.type = 'button';
        reset.className = 'rr-btn-secondary';
        reset.textContent = this._t('Reset markers');
        reset.addEventListener('click', () => {
            this._rigMarkers = this._rigDefaultMarkers();
            this._buildRigVisuals();
            this._refreshUnsaved();
        });
        bar.appendChild(reset);
        if (this.customRig && !riding) {
            const remove = sized(document.createElement('button'));
            remove.type = 'button';
            remove.className = 'rr-button-danger';
            remove.textContent = this._t('Remove rig');
            remove.addEventListener('click', () => this.removeRig());
            bar.appendChild(remove);
        }
        // The way out of the tool, in the bar that says the tool is on.
        const leave = sized(document.createElement('button'));
        leave.type = 'button';
        leave.className = 'rr-btn-secondary';
        leave.textContent = this._t('Close');
        leave.addEventListener('click', () => this.requestTool('orbit'));
        bar.appendChild(leave);
        // One line of what to do; the finer points wait in its tooltip.
        const hint = document.createElement('span');
        hint.style.cssText = 'flex:1 1 100%;color:var(--color-text-muted);';
        hint.textContent = this._t(carved ? 'This rig type binds a skeleton, which a model with carved parts cannot take. Remove its parts first, or choose a type that only places markers.'
            : riding ? 'Drag the dots to where a rider sits, holds on and rests its feet; sides mirror.' : 'Drag the markers onto the joints; sides mirror.');
        if (carved) hint.style.color = 'var(--color-warning-text, var(--color-text))';
        hint.title = this._t('Markers snap into the model; a faint one floats outside it.') + ' ' + this._t('Wheel zooms toward the pointer; Shift-drag pans.');
        bar.appendChild(hint);
        this._refreshUnsaved();
    }

    /**
     * The face card: which target (the eyes, or the mouth's ring), what it follows, and for the mouth
     * its lining and a preview. The picture is the control; a single point's numbers wait under Advanced.
     */
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
        const row = (text, control, host = card) => {
            const label = document.createElement('label');
            label.className = 'r3d-face-field';
            const caption = document.createElement('span'); caption.textContent = text;
            label.append(caption, control); host.appendChild(label);
        };
        pick.className = 'r3d-face-point';
        // With a ring the lips are its own upper and lower middles, not targets of their own.
        for (const marker of ModelRigger.FACE_MARKERS) {
            if (this._hasMouthRing() && (marker.key === 'upperLip' || marker.key === 'lowerLip')) continue;
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
            option.value = name; option.textContent = name ? Database3DEditor.partLabel(name) : this._t('Whole model'); follow.appendChild(option);
        }
        follow.value = bound;
        follow.addEventListener('change', () => { if (current()) this._faceBindings[key] = follow.value; });
        row(this._t('Follow'), follow);
        const ring = key === 'mouth' && this._hasMouthRing();
        if (!ring) {
            // One point: dragged in the view, or set by number here.
            const advanced = document.createElement('details');
            advanced.className = 'r3d-face-advanced';
            advanced.open = !!this._faceAdvancedOpen;
            advanced.addEventListener('toggle', () => { this._faceAdvancedOpen = advanced.open; });
            const summary = document.createElement('summary');
            summary.textContent = this._t('Advanced'); advanced.appendChild(summary);
            const caption = document.createElement('div');
            caption.className = 'r3d-face-position-title';
            caption.textContent = this._t('Position'); advanced.appendChild(caption);
            const coordinates = document.createElement('div');
            coordinates.className = 'r3d-face-coordinates';
            const span = this._modelSpan();
            coordinates.innerHTML = this._axisSlidersHtml('r3d-face-slider', {
                min: -span, max: span, step: 0.001,
                value: axis => this._rigMarkers[key][axis], show: value => Number(value.toFixed(4))
            });
            advanced.appendChild(coordinates);
            card.appendChild(advanced);
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
        }
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
            if (this._hasMouthRing()) {
                // How far the ring's mouth opens: shown open as soon as it is changed.
                const open = document.createElement('input');
                open.type = 'range'; open.min = 0; open.max = 2; open.step = 0.05;
                open.className = 'r3d-face-mouth-open'; open.value = Number.isFinite(this._faceMouthOpen) ? this._faceMouthOpen : 1;
                open.addEventListener('change', () => {
                    if (!current()) return;
                    const slider = this._detail.querySelector('.r3d-face-mouth-preview'), shown = slider ? slider.valueAsNumber || 0 : 0;
                    this._faceMouthOpen = open.valueAsNumber; this._stopMouthPreview();
                    if (slider) { slider.value = shown > 0 ? shown : 1; slider.dispatchEvent(new Event('input', { bubbles: true })); }
                });
                row(this._t('Mouth opening'), open);
            }
            const preview = document.createElement('input');
            preview.type = 'range'; preview.min = 0; preview.max = 1; preview.step = 0.01;
            preview.className = 'r3d-face-mouth-preview'; preview.value = 0;
            preview.addEventListener('input', () => {
                if (!current() || !Reactor3D.Speech) return;
                if (!this._faceSpeechDriver) {
                    Reactor3D.bindModelLandmarks(this._object, Reactor3D.readModelLandmarks({ landmarks: this._facePointRecords() }));
                    this._faceSpeechDriver = Reactor3D.Speech.prepare(this._object);
                }
                this._faceSpeechDriver.apply(preview.valueAsNumber);
                this._lastInputAt = performance.now();
            });
            row(this._t('Preview mouth'), preview);
        }
        const save = document.createElement('button');
        save.type = 'button'; save.className = 'rr-button-primary r3d-face-save r3d-save'; save.dataset.kind = 'face';
        save.textContent = this._t('Save face points');
        save.addEventListener('click', () => { if (current()) this.saveFacePoints(); });
        card.appendChild(save);
        const hint = document.createElement('div');
        hint.className = 'r3d-face-help';
        hint.textContent = ring
            ? this._t('Drag the markers onto the lips; the two sides mirror (hold Alt to move one side). Drag the middle dot to move the whole mouth, Shift-drag a marker to resize it.')
            : this._t('Drag points onto the face. Eyes set the first-person camera; mouth and lips are attachment points.');
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
            sphere.visible = this._faceMarkerVisible(key);
            const label = this._rigMarkerLabels?.[key];
            if (label) {
                label.position.copy(sphere.position);
                label.position.y += Math.max(sphere.geometry.parameters.radius * 2.6, label.scale.y * 0.8);
                label.visible = sphere.visible && key === 'eyes';
            }
        }
        this._refreshMouthRing();
        // The arrows are for a single point; the ring is dragged by its own markers.
        const single = !(this._facePoint === 'mouth' && this._hasMouthRing());
        if (typeof RRAxisArrows3D !== 'undefined' && this._scene) {
            if (!this._faceArrows && single) {
                this._faceArrows = RRAxisArrows3D.create(THREE, Math.max(0.04, this._previewSpan() * 0.12), 'face-point-arrows');
                this._faceArrows.root.traverse(node => { node.userData.__reactorOverlay = true; });
                this._scene.add(this._faceArrows.root);
            }
            if (this._faceArrows) {
                const world = this._object.localToWorld(new THREE.Vector3().fromArray(this._rigMarkers[this._facePoint]));
                RRAxisArrows3D.sync(this._faceArrows, world, single);
                this._faceArrows.root.visible = single;
            }
        }
        this._rigOverlayScale = undefined;
        this._lastInputAt = performance.now();
    }

    _pickFacePointArrow(clientX, clientY) {
        if (!this._rigFaceMode || !this._faceArrows || !this._object || this._faceArrows.root.visible === false) return null;
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
        const ring = this._hasMouthRing();
        if (ring) this._deriveMouthPoints();
        const points = {};
        const record = (key, bindingKey = key) => {
            const part = this._faceBindings[bindingKey] || '';
            const node = Reactor3D.landmarkNode(this._object, part) || this._object;
            const world = this._object.localToWorld(new THREE.Vector3().fromArray(this._rigMarkers[key]));
            return { part, offset: node.worldToLocal(world).toArray() };
        };
        // With a ring the lips follow the mouth's own part: they are its upper and lower middles.
        for (const marker of ModelRigger.FACE_MARKERS) points[marker.key] = record(marker.key, ring && marker.key !== 'eyes' ? 'mouth' : marker.key);
        points.mouth.interior = this._faceInterior || 'dark';
        points.mouth.interiorColor = this._faceInteriorColor || '#080808';
        if (ring && Number.isFinite(this._faceMouthOpen) && this._faceMouthOpen !== 1) points.mouth.open = this._faceMouthOpen;
        if (ring) points.mouth.outline = Object.fromEntries(Database3DEditor.MOUTH_RING.map(marker => [marker.ring, record(marker.key, 'mouth').offset]));
        return points;
    }

    // ---- The mouth's ring: eight markers round the lips, dragged like a rig's --------------------

    /** The ring's markers in ring order; left and right are the character's own, colored as a rig's sides are. */
    static get MOUTH_RING() {
        return [
            { key: 'mouthCornerL', ring: 'cornerL', label: 'Left corner', mirror: 'mouthCornerR' },
            { key: 'mouthUpperL', ring: 'upperL', label: 'Upper lip', mirror: 'mouthUpperR' },
            { key: 'mouthUpperM', ring: 'upperM', label: 'Upper lip' },
            { key: 'mouthUpperR', ring: 'upperR', label: 'Upper lip', mirror: 'mouthUpperL' },
            { key: 'mouthCornerR', ring: 'cornerR', label: 'Right corner', mirror: 'mouthCornerL' },
            { key: 'mouthLowerR', ring: 'lowerR', label: 'Lower lip', mirror: 'mouthLowerL' },
            { key: 'mouthLowerM', ring: 'lowerM', label: 'Lower lip' },
            { key: 'mouthLowerL', ring: 'lowerL', label: 'Lower lip', mirror: 'mouthLowerR' }
        ];
    }
    /** Marker sizes on screen, in pixels: a ring marker, a single point or the ring's middle, and the swell under the pointer. */
    static get FACE_MARKER_PX() { return { ring: 9, point: 13, label: 24, hover: 1.5 }; }

    _hasMouthRing() {
        return !!this._rigMarkers && Database3DEditor.MOUTH_RING.every(marker => Array.isArray(this._rigMarkers[marker.key]));
    }

    /** The markers Face points draws: the eyes, and for the mouth its middle (the handle that moves it whole) and its ring. */
    _faceMarkerDefinitions() {
        if (!this._hasMouthRing()) return ModelRigger.FACE_MARKERS;
        return ModelRigger.FACE_MARKERS.filter(marker => marker.key === 'eyes' || marker.key === 'mouth').concat(Database3DEditor.MOUTH_RING);
    }

    _faceMarkerVisible(key) {
        if (key === 'eyes') return this._facePoint === 'eyes';
        if (!this._hasMouthRing()) return key === this._facePoint;
        return this._facePoint === 'mouth';
    }

    /** The ring as model-space points in ring order, or null without one. */
    _mouthRingPoints() {
        if (!this._hasMouthRing()) return null;
        return Database3DEditor.MOUTH_RING.map(marker => new THREE.Vector3().fromArray(this._rigMarkers[marker.key]));
    }

    /** The saved ring, or the ring the three old points imply (not saved until Save face points). */
    _initMouthRing(savedPoints) {
        this._mouthRingDerived = false;
        const speech = typeof Reactor3D !== 'undefined' ? Reactor3D.Speech : null;
        if (!speech || !speech.outlineFromPoints || !this._rigMarkers || !this._rigMarkers.mouth) return;
        const saved = savedPoints && savedPoints.mouth && savedPoints.mouth.outline;
        if (saved) {
            const node = Reactor3D.landmarkNode(this._object, savedPoints.mouth.part) || this._object;
            for (const marker of Database3DEditor.MOUTH_RING) {
                this._rigMarkers[marker.key] = this._object.worldToLocal(node.localToWorld(new THREE.Vector3().fromArray(saved[marker.ring]))).toArray();
            }
            return;
        }
        const at = key => (Array.isArray(this._rigMarkers[key]) ? new THREE.Vector3().fromArray(this._rigMarkers[key]) : null);
        const size = (this._template && this._template.userData.glbSize) || { y: 1 };
        const implied = speech.outlineFromPoints({ mouth: at('mouth'), upperLip: at('upperLip'), lowerLip: at('lowerLip') }, Math.max(0.0001, Number(size.y) || 1));
        if (!implied) return;
        Database3DEditor.MOUTH_RING.forEach((marker, i) => { this._rigMarkers[marker.key] = implied[i].toArray(); });
        this._mouthRingDerived = true;
    }

    /** Mouth, Upper lip and Lower lip as the ring gives them: the lip line's middle and the upper and lower middles. */
    _deriveMouthPoints() {
        const ring = this._mouthRingPoints();
        if (!ring) return;
        this._rigMarkers.upperLip = ring[2].toArray();
        this._rigMarkers.lowerLip = ring[6].toArray();
        this._rigMarkers.mouth = ring[2].clone().add(ring[6]).multiplyScalar(0.5).toArray();
    }

    /** The mouth's own frame from the ring as it stands, or null (reactor_3d_speech.js `outlineShape`). */
    _mouthRingShape() {
        const ring = this._mouthRingPoints(), speech = typeof Reactor3D !== 'undefined' ? Reactor3D.Speech : null;
        return ring && speech && speech.outlineShape ? speech.outlineShape(ring, { open: this._faceMouthOpen, outward: new THREE.Vector3(0, 0, 1) }) : null;
    }

    /** Where the face's surface lies under a screen point, in the markers' own space; null off the model. */
    _faceSurfacePoint(clientX, clientY) {
        if (!this._rigSurface || !this._camera || !this._rigGroup) return null;
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this._camera);
        const o = raycaster.ray.origin, d = raycaster.ray.direction;
        const hit = this._rigSurface.raycast(o.x, o.y, o.z, d.x, d.y, d.z)[0];
        return hit ? this._rigGroup.worldToLocal(new THREE.Vector3(hit.x, hit.y, hit.z)) : null;
    }

    /** A model-space point moved onto the face along `forward` (model space): the nearest surface in front of or behind it, within `reach`. */
    _onFace(local, forward, reach) {
        if (!this._rigSurface || !this._rigGroup) return local;
        const world = this._rigGroup.localToWorld(local.clone());
        const direction = forward.clone().transformDirection(this._rigGroup.matrixWorld);
        const scale = this._rigGroup.getWorldScale(new THREE.Vector3()).y || 1, far = reach * scale;
        const start = world.clone().addScaledVector(direction, far);
        const hit = this._rigSurface.raycast(start.x, start.y, start.z, -direction.x, -direction.y, -direction.z).find(entry => entry.t <= far * 2);
        return hit ? this._rigGroup.worldToLocal(new THREE.Vector3(hit.x, hit.y, hit.z)) : local;
    }

    /** Lay every ring marker on the face: its depth alone changes (a model faces +Z). */
    _snapMouthRingToFace() {
        const shape = this._mouthRingShape();
        if (!shape || !this._rigSurface) return;
        const reach = Math.max(shape.width, shape.tall) * 1.5;
        for (const marker of Database3DEditor.MOUTH_RING) {
            this._rigMarkers[marker.key] = this._onFace(new THREE.Vector3().fromArray(this._rigMarkers[marker.key]), new THREE.Vector3(0, 0, 1), reach).toArray();
        }
        this._deriveMouthPoints();
    }

    /** A marker's place on screen, in client pixels. */
    _markerScreen(local) {
        const rect = this._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        const at = this._rigGroup.localToWorld(new THREE.Vector3().fromArray(local)).project(this._camera);
        return [rect.left + (at.x * 0.5 + 0.5) * rect.width, rect.top + (-at.y * 0.5 + 0.5) * rect.height];
    }

    /** Where a screen point puts a marker: on the face under it, else across the camera plane through `fallback`. */
    _faceDropPoint(clientX, clientY, fallback) {
        const snapped = this._faceSurfacePoint(clientX, clientY);
        if (snapped) return snapped;
        const anchor = this._rigGroup.localToWorld(new THREE.Vector3().fromArray(fallback));
        const point = this._cameraPlanePoint(clientX, clientY, anchor);
        return point ? this._rigGroup.worldToLocal(point) : null;
    }

    /**
     * A drag in Face points. The eyes, and a mouth without a ring, move across the camera plane. A
     * ring marker follows the pointer over the face and its twin mirrors across the mouth's middle
     * (Alt: this side alone); with Shift the whole ring grows or shrinks about its middle. The
     * mouth's middle dot carries the whole ring. Every marker lands on the face.
     */
    _dragFaceMarker(key, clientX, clientY, modifiers) {
        const sphere = this._rigMarkerMeshes && this._rigMarkerMeshes[key];
        if (!sphere || !this._object || !this._rigGroup) return;
        const ringMarker = Database3DEditor.MOUTH_RING.find(marker => marker.key === key);
        if (!this._hasMouthRing() || (!ringMarker && key !== 'mouth')) {
            const point = this._cameraPlanePoint(clientX, clientY, sphere.getWorldPosition(new THREE.Vector3()));
            if (!point) return;
            this._rigMarkers[key] = this._rigGroup.worldToLocal(point.clone()).toArray();
            this._syncFacePointVisuals();
            this._syncFacePointControls();
            return;
        }
        if (!this._faceDrag || this._faceDrag.key !== key) {
            const slider = this._detail.querySelector('.r3d-face-mouth-preview');
            const start = Object.fromEntries(Database3DEditor.MOUTH_RING.map(marker => [marker.key, this._rigMarkers[marker.key].slice()]));
            const shape = this._mouthRingShape();
            this._faceDrag = {
                key, start, shape, preview: slider ? slider.valueAsNumber || 0 : 0,
                screen: Object.fromEntries(Object.entries(start).map(([name, local]) => [name, this._markerScreen(local)])),
                middle: this._markerScreen(this._rigMarkers.mouth),
                middleX: (start.mouthUpperM[0] + start.mouthLowerM[0]) / 2,
                resize: !!(modifiers && modifiers.shiftKey) && !!ringMarker
            };
        }
        const drag = this._faceDrag;
        const place = (name, sx, sy) => {
            const local = this._faceDropPoint(sx, sy, drag.start[name]);
            if (local) this._rigMarkers[name] = local.toArray();
        };
        if (key === 'mouth') {
            // The whole mouth: every marker by the pointer's travel, each onto the face where it lands.
            const dx = clientX - drag.middle[0], dy = clientY - drag.middle[1];
            for (const marker of Database3DEditor.MOUTH_RING) place(marker.key, drag.screen[marker.key][0] + dx, drag.screen[marker.key][1] + dy);
        } else if (drag.resize) {
            // Bigger or smaller about its middle, by how far the pointer stands from it.
            const from = Math.hypot(drag.screen[key][0] - drag.middle[0], drag.screen[key][1] - drag.middle[1]);
            const factor = from > 1 ? Math.max(0.2, Math.min(5, Math.hypot(clientX - drag.middle[0], clientY - drag.middle[1]) / from)) : 1;
            for (const marker of Database3DEditor.MOUTH_RING) {
                place(marker.key, drag.middle[0] + (drag.screen[marker.key][0] - drag.middle[0]) * factor, drag.middle[1] + (drag.screen[marker.key][1] - drag.middle[1]) * factor);
            }
        } else {
            place(key, clientX, clientY);
            if (ringMarker.mirror && !(modifiers && modifiers.altKey)) {
                const mine = this._rigMarkers[key];
                // The twin stands straight across the middle and only its depth follows the face (a model
                // faces +Z), and only a little: where the face is not there on that side it keeps the depth
                // of the marker it mirrors.
                const twin = new THREE.Vector3(2 * drag.middleX - mine[0], mine[1], mine[2]);
                const reach = (drag.shape ? Math.max(drag.shape.width, drag.shape.tall) : this._modelSpan() * 0.05) * 0.3;
                this._rigMarkers[ringMarker.mirror] = this._onFace(twin, new THREE.Vector3(0, 0, 1), reach).toArray();
            }
        }
        this._deriveMouthPoints();
        this._syncFacePointVisuals();
    }

    /** A drag is over: the mouth preview, shut while the markers moved, opens again as it was. */
    _endFaceDrag() {
        const drag = this._faceDrag;
        this._faceDrag = null;
        if (!drag || !(drag.preview > 0) || !this._rigFaceMode) return;
        const slider = this._detail && this._detail.querySelector('.r3d-face-mouth-preview');
        if (!slider) return;
        slider.value = drag.preview;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /** The ring's closed line and the lip line across it, redrawn from the markers. */
    _refreshMouthRing() {
        if (!this._rigBoneLines || !this._rigGroup || typeof THREE === 'undefined') return;
        const ring = this._facePoint === 'mouth' ? this._mouthRingPoints() : null;
        const positions = [];
        if (ring) ring.forEach((point, i) => { positions.push(...point.toArray(), ...ring[(i + 1) % 8].toArray()); });
        this._rigBoneLines.geometry.dispose();
        this._rigBoneLines.geometry = new THREE.BufferGeometry();
        this._rigBoneLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        this._rigBoneLines.visible = !!ring;
        if (!this._mouthLipLine || this._mouthLipLine.parent !== this._rigGroup) {
            this._mouthLipLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.85 }));
            this._mouthLipLine.renderOrder = 29;
            this._mouthLipLine.userData.__reactorOverlay = true;
            this._mouthLipLine.raycast = () => {};
            this._rigGroup.add(this._mouthLipLine);
        }
        // Corner to corner through the middle of each upper and lower pair: where the mouth parts.
        const line = ring ? [ring[4], ring[3].clone().lerp(ring[5], 0.5), ring[2].clone().lerp(ring[6], 0.5), ring[1].clone().lerp(ring[7], 0.5), ring[0]] : [];
        this._mouthLipLine.geometry.dispose();
        this._mouthLipLine.geometry = new THREE.BufferGeometry().setFromPoints(line);
        this._mouthLipLine.visible = !!ring;
    }

    /** Face markers keep one size on screen, swell under the pointer, and name themselves there. */
    _updateFaceOverlay() {
        if (!this._rigMarkerMeshes || !this._camera || !this._detail) return;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas && canvas.getBoundingClientRect();
        if (!rect || !rect.height) return;
        const px = Database3DEditor.FACE_MARKER_PX;
        const tanHalf = Math.tan((this._camera.fov * Math.PI) / 360);
        const groupScale = (this._object ? this._object.scale.y : 1) || 1;
        const world = this._rigWorldScratch || (this._rigWorldScratch = new THREE.Vector3());
        for (const marker of this._faceMarkerDefinitions()) {
            const sphere = this._rigMarkerMeshes[marker.key], label = this._rigMarkerLabels && this._rigMarkerLabels[marker.key];
            if (!sphere) continue;
            if (!sphere.visible) { if (label) label.visible = false; continue; }
            sphere.getWorldPosition(world);
            const perPixel = (2 * Math.max(1e-4, world.distanceTo(this._camera.position)) * tanHalf) / rect.height / groupScale;
            const active = marker.key === this._rigHoverKey || marker.key === this._rigDragKey;
            const radius = sphere.geometry.parameters.radius || 1;
            sphere.scale.setScalar(((marker.ring ? px.ring : px.point) * (active ? px.hover : 1) / 2) * perPixel / radius);
            if (!label) continue;
            const height = px.label * perPixel;
            label.scale.set(height * label.userData.__aspect, height, 1);
            label.position.set(sphere.position.x, sphere.position.y + radius * sphere.scale.x + height * 0.6, sphere.position.z);
            // The eyes name themselves always; a mouth marker under the pointer, so eight names never crowd the lips.
            label.visible = active || marker.key === 'eyes' || !this._hasMouthRing();
        }
        this._rigOverlayScale = 1;
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
            this._writeFileAtomic(fs, this.rulesPath(), (typeof RRJson !== 'undefined' && RRJson.stringify ? RRJson.stringify(json) : JSON.stringify(json, null, 2)) + '\n');
        } catch (error) {
            this._reportModelSaveError(error);
            throw error;
        }
        this.landmarks = points;
        Reactor3D.bindModelLandmarks(this._object, points);
        if (typeof RREventPreviewModels !== 'undefined') RREventPreviewModels.clear?.();
        this.projectController?.refreshMap3DView?.();
        this._markSaved('face');
        this._setStatus(this._t('Face points saved.'));
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
        // A thing held in a hand (Blade or tool, Gun) has markers only: they are saved as they stand, nothing is bound.
        if (this._rigNeedsUncarved()) {
            if (status) status.textContent = this._t('Remove carved parts before rigging.');
            return;
        }
        if (ModelRigger.TEMPLATES[this._rigTemplate] && ModelRigger.TEMPLATES[this._rigTemplate].vehicle) {
            // A rider's dots are the vehicle's seat, not a rig: the model's rig, if it has one, is left as it is.
            try {
                this.saveVehicleRider();
                if (status) status.textContent = this._t('Rider saved.');
            } catch (error) {
                this._reportModelSaveError(error);
            }
            return;
        }
        if (ModelRigger.TEMPLATES[this._rigTemplate] && ModelRigger.TEMPLATES[this._rigTemplate].markersOnly) {
            const hadBones = this._rigHasBones();
            this.customRig = { template: this._rigTemplate, markers: JSON.parse(JSON.stringify(this._rigMarkers)) };
            this._rigBinary = null;
            this.saveRig();
            if (hadBones) this._rebuildInstance();
            this.renderRigBar();
            this._refreshMotionsButton();
            if (status) status.textContent = this._t('Markers saved.');
            return;
        }
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
        } else if ((!this.customRig || !this.customRig.bones) && fs.existsSync(binPath)) {
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
        // Escape closes this dialog, not the database under it.
        const keys = typeof RRKeyboardNavigation !== 'undefined' && RRKeyboardNavigation.modal
            ? RRKeyboardNavigation.modal(overlay, { onEscape: () => close() }) : null;
        const close = () => { keys?.leave?.(); overlay.remove(); };
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
                    : t === 'dashing' ? 'While dashing' : t === 'jumping' ? 'While jumping' : t === 'swimming' ? 'While swimming' : t === 'treading' ? 'While treading water' : t === 'climbing' ? 'While climbing' : t === 'riding' ? 'While riding' : t === 'idle' ? 'While idle'
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
        keys?.enter?.();
    }

    /** Whether the model plays its rig's default motions (the sidecar's `defaultMotions`). */
    setDefaultMotions(on) {
        this.defaultMotions = !!on;
        const fs = require('fs');
        try {
            const previous = this._readSidecarForUpdate(fs);
            const json = previous ? JSON.parse(previous) : {};
            if (on) delete json.defaultMotions; else json.defaultMotions = false;
            this._writeFileAtomic(fs, this.rulesPath(), (typeof RRJson !== 'undefined' && RRJson.stringify ? RRJson.stringify(json) : JSON.stringify(json, null, 2)) + '\n');
        } catch (error) {
            this._reportModelSaveError(error);
            return;
        }
        this.rebuildPlayback();
        this.renderRuleList();
    }

    /**
     * Keep every remembered rule index (the card's rule, the list's
     * selection, each part's remembered work) on the same rule after the
     * list was rebuilt from `before`; a rule that is gone leaves -1.
     */
    _followRuleIndexes(before) {
        const after = this.rawAnimations;
        const follow = index => Number.isInteger(index) && index >= 0 && before[index] ? after.indexOf(before[index]) : -1;
        this._editingRule = follow(this._editingRule);
        this.selectedRule = follow(this.selectedRule);
        for (const snapshot of Object.values(this._poses || {})) snapshot.editingRule = follow(snapshot.editingRule);
    }

    applyMotionPreset(preset) {
        // Reapplying replaces the preset's own rules; hand-authored ones
        // (different names) are untouched.
        const before = this.rawAnimations;
        this.rawAnimations = this.rawAnimations.filter(raw => raw.name !== preset.name);
        for (const rule of preset.rules) {
            this.rawAnimations.push(JSON.parse(JSON.stringify(rule)));
        }
        this._followRuleIndexes(before);
        this.saveRules();
        // An open Motion editor on that motion shows the preset, not its old tracks to save over it.
        if (this.motionEditor && this.motionEditor.active && this.motionEditor.motion.original === preset.name) this.motionEditor.open(preset.name);
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

    /**
     * The states this model can be previewed in: only those it has a motion
     * or an effect for (a door has none, a car moves, a person walks, dashes,
     * jumps and swims), plus Standing to come back to.
     */
    previewStates() {
        const triggers = new Set();
        for (const raw of (this.playRules || []).concat(this.rawAnimations || [], this.rawEffects || [], this._work ? [this._work] : [], this._effectWork ? [this._effectWork] : [])) {
            if (raw && raw.trigger) triggers.add(raw.trigger);
        }
        const states = [];
        if (triggers.has('moving') || triggers.has('walking')) states.push('walking');
        if (triggers.has('dashing')) states.push('dashing');
        if (triggers.has('jumping')) states.push('jumping');
        if (triggers.has('swimming')) states.push('swimming');
        if (triggers.has('treading')) states.push('treading');
        if (triggers.has('climbing')) states.push('climbing');
        if (triggers.has('riding')) states.push('riding');
        return states.length ? ['standing'].concat(states) : [];
    }

    /**
     * Whether the preview is in the air this frame. A jump's motion plays once
     * and holds, so the Jumping preview lands for a moment after the longest
     * one and takes off again.
     */
    _previewAirborne(frame) {
        if (!this._sim.jumping || this._sim.swimming) return false;
        let longest = 0;
        for (const rule of this.playRules || []) {
            if (rule.trigger === 'jumping' && rule.type === 'pose' && rule.keys && rule.keys.length && !rule.repeat) {
                longest = Math.max(longest, rule.period * 2 * (rule.cycles || 1));
            }
        }
        if (!longest) return true;
        if (this._sim.jumpFrom === undefined) this._sim.jumpFrom = frame;
        const cycle = longest + 40;
        return (frame - this._sim.jumpFrom) % cycle < longest + 16;
    }

    previewState() {
        const sim = this._sim;
        return sim.riding ? 'riding' : sim.climbing ? 'climbing' : sim.swimming ? (sim.walking ? 'swimming' : 'treading') : sim.jumping ? 'jumping' : sim.dashing ? 'dashing' : sim.walking ? 'walking' : 'standing';
    }

    setPreviewState(state) {
        // Swimming is moving through deep water; treading is floating still in it.
        this._sim.walking = state === 'walking' || state === 'dashing' || state === 'swimming';
        this._sim.dashing = state === 'dashing';
        this._sim.jumping = state === 'jumping';
        this._sim.jumpFrom = undefined;
        this._sim.swimming = state === 'swimming' || state === 'treading';
        this._sim.climbing = state === 'climbing';
        // Seated on a vehicle: the riding motion alone, whatever else the model has.
        this._sim.riding = state === 'riding';
        this.renderSimBar();
    }

    /** One on-demand motion, played once on the preview (the one on the card plays the card's values). */
    /**
     * ▶ while the Motion editor is open: its own motion plays on the
     * timeline; anything else closes the editor first, which otherwise
     * pins the preview to its playhead. True when the editor took it.
     */
    _motionEditorTakesPlay(name) {
        const editor = this.motionEditor;
        if (!editor || !editor.active) return false;
        if (name !== undefined && (name === editor.motion.original || name === editor.motion.name)) {
            editor.playing = true;
            editor._playFrom = null;
            editor.playhead = 0;
            editor.renderPlayButton();
            return true;
        }
        editor.close();
        return false;
    }

    playRuleAction(name) {
        if (this._motionEditorTakesPlay(name)) return;
        const index = this.playRules.findIndex(rule => rule.trigger === 'action' && rule.name === name);
        if (index < 0) return;
        if (index === this._editingRule) { this.previewPose(); return; }
        const rule = this.playRules[index];
        this._sim.action = {
            name: rule.name,
            frame: this._simFrame || 0,
            until: Reactor3D.modelRuleDuration(rule, this._binding ? this._binding.clips : null)
        };
    }

    /** The preview's state picker, over the viewport; hidden for a model with nothing that moves by state. */
    renderSimBar() {
        const bar = this._detail && this._detail.querySelector('.r3d-sim-bar');
        if (!bar) return;
        const states = this.previewStates();
        if (!states.includes(this.previewState())) { this._sim.walking = this._sim.dashing = this._sim.jumping = this._sim.swimming = this._sim.climbing = this._sim.riding = false; }
        const held = this.playRules.some(rule => rule.type === 'pose' && rule.hold);
        // A model that only "moves" (a car, a drone) is Idle or Moving; one that walks is Standing or Walking.
        const walker = (this.rawAnimations || []).concat(this.rawEffects || []).some(raw => raw && ['walking', 'dashing', 'jumping', 'swimming', 'treading', 'climbing', 'riding'].includes(raw.trigger));
        const names = { standing: walker ? 'Standing' : 'Idle', walking: walker ? 'Walking' : 'Moving', dashing: 'Dashing', jumping: 'Jumping', swimming: 'Swimming', treading: 'Treading', climbing: 'Climbing', riding: 'Riding' };
        const current = this.previewState();
        bar.innerHTML = states.map(state => `<button type="button" class="r3d-preview-state${state === current ? ' active' : ''}" data-state="${state}" aria-pressed="${state === current}">${this._t(names[state])}</button>`).join('')
            + (held ? `<button type="button" class="r3d-preview-state r3d-preview-reset" title="${this._t('Reset pose')}">↺</button>` : '');
        bar.style.display = states.length || held ? 'flex' : 'none';
        bar.querySelectorAll('.r3d-preview-state[data-state]').forEach(button => button.addEventListener('click', () => this.setPreviewState(button.dataset.state)));
        bar.querySelector('.r3d-preview-reset')?.addEventListener('click', () => {
            if (this._binding) this._binding.latch = {};
            // The in-flight action would re-latch next frame.
            this._sim.action = null;
        });
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
            : raw.trigger === 'jumping' ? this._t('While jumping')
            : raw.trigger === 'swimming' ? this._t('While swimming')
            : raw.trigger === 'treading' ? this._t('While treading water')
            : raw.trigger === 'climbing' ? this._t('While climbing')
            : raw.trigger === 'riding' ? this._t('While riding')
            : raw.trigger === 'action' ? this._t('On demand') : this._t('Always');
        const subject = type === 'clip' ? (raw.clip || '?') : (raw.part || this._t('Whole model'));
        return `${raw.name || '?'} — ${label} · ${subject} · ${trigger}`;
    }

    /**
     * The rule indices of the motion rule `index` belongs to: every rule
     * sharing its name, when one of them is a pose. Null for a clip, or a
     * lone spin, swing or bob, which keep their own card.
     */
    motionGroup(index) {
        const raw = this.rawAnimations[index];
        if (!raw || raw.type === 'clip') return null;
        const group = [];
        this.rawAnimations.forEach((other, i) => { if (other && other.type !== 'clip' && other.name === raw.name) group.push(i); });
        return group.some(i => this.rawAnimations[i].type === 'pose') ? group : null;
    }

    motionSummary(raw, parts) {
        const trigger = this.ruleSummary(raw).split(' · ').pop();
        return `${raw.name || '?'} — ${parts === 1 ? this._t('1 part') : this._t('{n} parts', { n: parts })} · ${trigger}`;
    }

    renderRuleList() {
        const list = this._detail.querySelector('.r3d-rule-list');
        list.innerHTML = '';
        const open = this.motionEditor && this.motionEditor.active ? this.motionEditor.motion.original : null;
        let shown = 0;
        this.rawAnimations.forEach((raw, index) => {
            // Every pose rule sharing a name is one motion: one row, opened in the Motion editor.
            const group = this.motionGroup(index);
            if (group && group[0] !== index) return;
            shown++;
            const summary = group ? this.motionSummary(raw, group.length) : this.ruleSummary(raw);
            const actions = [];
            // On-demand motions play from their own row: one button per name (a preset's parts play together).
            if (raw.trigger === 'action' && this.rawAnimations.findIndex(other => other.trigger === 'action' && other.name === raw.name) === index) {
                actions.push({ icon: 'play', title: this._t('Play'), run: () => this.playRuleAction(raw.name) });
            }
            actions.push({ icon: 'delete', title: this._t('Delete'), cls: 'is-danger', run: () => { this.selectedRule = index; this.deleteRule(); } });
            const row = this._row({
                icon: raw.type === 'clip' ? 'clip' : 'motion', name: raw.name || '?', note: summary.slice(summary.indexOf(' — ') + 3),
                selected: group ? raw.name === open || group.includes(this.selectedRule) : index === this.selectedRule, actions
            });
            row.dataset.modelRecordIndex = String(index);
            row.addEventListener('click', () => this._afterEffectWork(() => {
                if (group && this.motionEditor) {
                    this.deselectPart();
                    this.selectedRule = index;
                    this.motionEditor.open(raw.name);
                    return;
                }
                if (this.motionEditor && this.motionEditor.active) this.motionEditor.close();
                this.selectedRule = index;
                this.renderRuleList();
                this._refreshHighlight();
                // Any animation opens straight into the card that edits it.
                this.editRule(index);
            }));
            list.appendChild(row);
        });
        this._renderEmbeddedClipRows(list);
        // The rig's own default motions for the states this model has none for, and the switch.
        if (this.customRig) {
            const defaults = [...new Set((this.playRules || []).filter(rule => rule.defaultMotion).map(rule => rule.name))];
            const foot = document.createElement('div');
            foot.className = 'r3d-sec-foot';
            foot.innerHTML = `<label><input type="checkbox" class="r3d-default-motions"${this.defaultMotions ? ' checked' : ''} style="margin:1px 0 0;"><span></span></label>`;
            foot.querySelector('span').textContent = this.defaultMotions && defaults.length
                ? this._t('Rig defaults: {names}', { names: defaults.map(name => this._t(name)).join(', ') })
                : this._t('Play the rig\'s default motions where this model has none');
            foot.querySelector('input').addEventListener('change', event => this.setDefaultMotions(event.target.checked));
            list.appendChild(foot);
        }
        if (!this.rawAnimations.length && !(this.embeddedClips || []).length) {
            const empty = document.createElement('div');
            empty.className = 'r3d-sec-note';
            empty.textContent = this._t('No animations yet. Add one to spin, swing or pose a part.');
            list.appendChild(empty);
        }
        this._sectionCount('animations', shown);
        const note = this._detail.querySelector('.r3d-rule-note');
        if (note) note.style.display = this._editingRule >= 0 && this._work && this._work.type === 'pose' ? '' : 'none';
        this.renderSimBar();
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
        header.className = 'r3d-sec-sub';
        header.textContent = this._t('Embedded clips');
        list.appendChild(header);
        for (const clipName of clips) {
            const added = this.rawAnimations.some(raw => raw.type === 'clip' && raw.clip === clipName);
            const row = this._row({ icon: 'clip', name: clipName, actions: [
                { icon: 'play', title: this._t('Play'), run: () => this.playEmbeddedClip(clipName) },
                { icon: added ? 'check' : 'add', title: this._t('Add'), disabled: added, run: () => this.addEmbeddedClipRule(clipName) }
            ] });
            // A clip in the file is not a saved animation: its row plays and adopts, and is never selected.
            row.style.cursor = 'default';
            row.classList.add('is-plain');
            list.appendChild(row);
        }
    }

    /** Play a baked clip straight from the list, no rule required. */
    playEmbeddedClip(clipName) {
        if (typeof Reactor3D === 'undefined' || !this._binding) return;
        this._motionEditorTakesPlay();
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
        if (this.motionEditor) { this.deselectPart(); this.motionEditor.open(null); return; }
        this.addSingleRule();
    }

    /** A lone spin, swing or bob (or a pose) on the classic card. */
    addSingleRule() {
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
        // A motion goes as a whole.
        const group = this.motionGroup(index);
        if (group && group.length > 1) {
            const name = this.rawAnimations[index].name;
            if (this.motionEditor && this.motionEditor.active) this.motionEditor.close();
            this.deselectPart();
            for (const snapshot of Object.values(this._poses)) snapshot.editingRule = -1;
            this.rawAnimations = this.rawAnimations.filter(raw => !(raw && raw.type !== 'clip' && raw.name === name));
            this.selectedRule = -1;
            this.saveRules();
            this.renderRuleList();
            return;
        }
        if (group && this.motionEditor && this.motionEditor.active) this.motionEditor.close();
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
