/**
 * AnimationGenerator - Forge tool for generating animation sprite sheets.
 *
 * Output format matches the RPG Reactor / MZ animation system:
 *   - Fixed frame size (default 192×192 — MZ convention)
 *   - 5 columns × N rows (rows = ceil(frameCount / 5))
 *   - Max 100 frames (MZ engine constraint — beyond this, the animation
 *     system silently drops the sheet)
 *
 * File structure (split for maintainability as the animation catalog grows):
 *   src/forge/AnimationGenerator/
 *     ├── helpers/
 *     │   ├── color.js       — hexWithAlpha, mixHexColors
 *     │   ├── texture.js     — TEXTURE_CACHE, getTextureImage, drawTexturedTriangle
 *     │   ├── rotations.js   — rotXW/ZW/XZ/YZ/XY, project4D
 *     │   └── shape3D.js     — render3DShape + SHAPE3D_BASE_PARAMS + render*Frame
 *     ├── registry.js        — BLEND_MODES, RR_ANIMATION_REGISTRY, buildAnimationCategories
 *     ├── animations/        — each file registers itself via RR_ANIMATION_REGISTRY.push(...)
 *     │   ├── Hypercube.js
 *     │   ├── Sphere.js
 *     │   ├── Cube.js
 *     │   ├── Pyramid.js
 *     │   ├── Cylinder.js
 *     │   └── Fire.js
 *     └── AnimationGenerator.js — THIS FILE: the UI class + layer stack +
 *                                 render loop. Reads ANIMATION_CATEGORIES
 *                                 built from the registry by all animation
 *                                 files loaded before us.
 *
 * Adding a new animation:
 *   1. Create animations/MyAnim.js with a render function + a
 *      `RR_ANIMATION_REGISTRY.push({ categoryId, id, name, ... })` call.
 *   2. Add <script src="src/forge/AnimationGenerator/animations/MyAnim.js">
 *      to index.html BEFORE AnimationGenerator.js.
 *
 * Save flow:
 *   Output → <projectPath>/img/animations/<name>.png
 *
 * Config persistence:
 *   <projectPath>/forge/animation_generator/config.json
 *     { frameWidth, frameHeight, frameCount, layers, ... }
 */

// Built from RR_ANIMATION_REGISTRY (populated by each animations/*.js file on
// load). Order in index.html: helpers/* → registry.js → animations/* → this file.
const ANIMATION_CATEGORIES = buildAnimationCategories();

const MAX_FRAMES = 100; // MZ animation system constraint
const SHEET_COLUMNS = 5; // MZ convention

class AnimationGenerator {
    constructor() {
        this.root = null;
        this.projectController = null;
        this.projectPath = null;

        // Sheet dimensions — frame size matches MZ default; total frame count
        // is user-configurable up to MAX_FRAMES.
        this.frameWidth = 192;
        this.frameHeight = 192;
        this.frameCount = 30;

        // Layer stack. Each layer = {id, categoryId, animationId, params,
        // blend, opacity, visible}. Array order = render order (back to front):
        //   layers[0]      → drawn first (back)
        //   layers[N-1]    → drawn last  (front)
        // The UI displays them REVERSED so the front-most is at the top of
        // the list (Photoshop convention).
        this.layers = [];
        this.activeLayerId = null;

        // Preview mode: 'composite' renders the full layer stack; 'single'
        // renders just `previewSingle` (a non-committed standalone animation
        // chosen via the left-pane list). Clicking an animation in the list
        // selects it for single-preview; clicking the row's "+" button or
        // pressing "Add as Layer" in the right pane commits it as a real
        // layer. This lets the user browse animations without polluting
        // the layer stack on every click.
        this.previewMode = 'single';
        this.previewSingle = null; // { categoryId, animationId, params }

        // Live preview state.
        this.previewFrame = 0;
        this.playing = true;
        this._playTimer = null;

        // Animation list filters.
        this.searchQuery = '';
        this.categoryFilter = 'all';

        // Interpolation mode for line + texture sampling.
        //   'linear'  = smooth, anti-aliased lines & bilinear textures (default)
        //   'nearest' = integer-snapped lines & nearest-neighbor textures (pixel-art look)
        this.interpolation = 'linear';

        // Reusable offscreen canvas for compositing each layer before blitting
        // it onto the main canvas with blend mode + opacity. Lazily allocated.
        this._layerTmp = null;
    }

    /** Verbatim-label translation (animation/param names live in data). */
    _tx(label) {
        return window.I18n && window.I18n.tText ? window.I18n.tText(label) : label;
    }

    renderInto(containerEl, projectController) {
        this.projectController = projectController;
        this.root = containerEl;

        if (!this._syncProjectPath()) {
            this.root.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-text-muted); font-size: 12px;">Open a project to use Forge tools.</div>';
            return;
        }
        this._ensureFolders();
        this._loadConfig();
        this._initLayersIfEmpty();
        this._render();
        this._startPlayback();
    }

    _syncProjectPath() {
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        const next = project?.path || null;
        if (!next) {
            this.projectPath = null;
            return null;
        }
        this.projectPath = next;
        return this.projectPath;
    }

    _requireProjectPath() {
        const p = this._syncProjectPath();
        if (!p) {
            alert('Open a project to use Forge tools.');
            return null;
        }
        return p;
    }

    detach() {
        if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
        if (this._playTimer) { clearInterval(this._playTimer); this._playTimer = null; }
        this.playing = false;
    }

    // -- Filesystem -----------------------------------------------------------
    _ensureFolders() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return;
        const fs = require('fs');
        const path = require('path');
        const root = path.join(projectPath, 'forge', 'animation_generator');
        try {
            fs.mkdirSync(root, { recursive: true });
            fs.mkdirSync(path.join(root, 'textures'), { recursive: true });
            const readme = path.join(root, 'README.txt');
            if (!fs.existsSync(readme)) {
                fs.writeFileSync(readme,
                    'Animation Generator\n' +
                    '===================\n\n' +
                    'Forge tool that bakes procedural animation sprite sheets for use\n' +
                    'in the engine animation system. Sheets are 5 columns × N rows of\n' +
                    `${this.frameWidth}x${this.frameHeight} frames (max ${MAX_FRAMES} frames per sheet — engine constraint).\n\n` +
                    'Animations are stacked as LAYERS (Photoshop-style). Each layer is\n' +
                    'one animation type with its own params, blend mode, and opacity.\n' +
                    'Mix and match for combinations like "lightning hypercube" or\n' +
                    '"water explosion".\n\n' +
                    'Output is saved to img/animations/<name>.png.\n\n' +
                    'config.json stores frame size, frame count, and the layer stack.\n\n' +
                    'textures/ holds media files used by shape animations (Cube, Pyramid,\n' +
                    'Cylinder, etc.) as wrap-around textures. Drop images, animated GIFs,\n' +
                    'WebP files, or videos in there and pick them via the Texture parameter.\n'
                );
            }
        } catch (e) { console.error('AnimationGenerator: ensure folders:', e); }
    }

    _texturesDir() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return null;
        const path = require('path');
        return path.join(projectPath, 'forge', 'animation_generator', 'textures');
    }

    _configPath() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return null;
        const path = require('path');
        return path.join(projectPath, 'forge', 'animation_generator', 'config.json');
    }

    _loadConfig() {
        const fs = require('fs');
        try {
            const cfg = JSON.parse(fs.readFileSync(this._configPath(), 'utf8'));
            if (cfg.frameWidth)  this.frameWidth  = parseInt(cfg.frameWidth)  || this.frameWidth;
            if (cfg.frameHeight) this.frameHeight = parseInt(cfg.frameHeight) || this.frameHeight;
            if (cfg.frameCount)  this.frameCount  = Math.max(1, Math.min(MAX_FRAMES, parseInt(cfg.frameCount) || this.frameCount));
            if (cfg.interpolation === 'nearest' || cfg.interpolation === 'linear') this.interpolation = cfg.interpolation;
            if (cfg.previewMode === 'single' || cfg.previewMode === 'composite') this.previewMode = cfg.previewMode;
            if (cfg.previewSingle && cfg.previewSingle.categoryId && cfg.previewSingle.animationId) {
                const ps = cfg.previewSingle;
                const animId = ps.animationId === 'globe' ? 'sphere' : ps.animationId;
                const params = { ...(ps.params || {}) };
                const anim = this._findAnimation(ps.categoryId, animId);
                if (anim) {
                    for (const p of anim.params) {
                        if (params[p.key] === undefined) params[p.key] = p.default;
                    }
                    this.previewSingle = { categoryId: ps.categoryId, animationId: animId, params };
                }
            }

            // New format (v2+): layer stack.
            if (Array.isArray(cfg.layers) && cfg.layers.length > 0) {
                this.layers = cfg.layers.map(l => ({
                    id: l.id || this._newLayerId(),
                    categoryId: l.categoryId,
                    animationId: l.animationId === 'globe' ? 'sphere' : l.animationId,
                    params: { ...(l.params || {}) },
                    blend: l.blend || 'source-over',
                    opacity: l.opacity !== undefined ? Math.max(0, Math.min(1, l.opacity)) : 1,
                    visible: l.visible !== false
                }));
                // Backfill any newly-added params with their defaults so older
                // saved configs don't break when we extend an animation's
                // param schema.
                for (const layer of this.layers) {
                    // Migrate legacy layers (no keyframes) into the
                    // keyframe-based model: a single keyframe holding
                    // the existing params.
                    this._relinkLayerParams(layer);
                    const anim = this._findAnimation(layer.categoryId, layer.animationId);
                    if (!anim) continue;
                    for (const p of anim.params) {
                        if (layer.params[p.key] === undefined) layer.params[p.key] = p.default;
                    }
                    // Migration: sphere `tilt` (single X-tilt) → tiltX.
                    if (layer.params.tilt !== undefined && layer.params.tiltX === undefined) {
                        layer.params.tiltX = layer.params.tilt;
                        delete layer.params.tilt;
                    }
                }
                this.activeLayerId = (cfg.activeLayerId && this.layers.find(l => l.id === cfg.activeLayerId))
                    ? cfg.activeLayerId
                    : this.layers[this.layers.length - 1].id;
                return;
            }

            // Legacy format (v1): single-animation config → migrate to one layer.
            if (cfg.activeCategoryId && cfg.activeAnimationId) {
                let animId = cfg.activeAnimationId;
                if (animId === 'globe') animId = 'sphere';
                const newKey = `${cfg.activeCategoryId}/${animId}`;
                const oldKey = `${cfg.activeCategoryId}/${cfg.activeAnimationId}`;
                const params = { ...((cfg.paramValues && (cfg.paramValues[newKey] || cfg.paramValues[oldKey])) || {}) };
                if (params.tilt !== undefined && params.tiltX === undefined) {
                    params.tiltX = params.tilt;
                    delete params.tilt;
                }
                const anim = this._findAnimation(cfg.activeCategoryId, animId);
                if (anim) {
                    for (const p of anim.params) {
                        if (params[p.key] === undefined) params[p.key] = p.default;
                    }
                }
                const id = this._newLayerId();
                this.layers = [{
                    id,
                    categoryId: cfg.activeCategoryId,
                    animationId: animId,
                    params,
                    blend: (anim && anim.defaultBlend) || 'source-over',
                    opacity: 1,
                    visible: true
                }];
                this.activeLayerId = id;
            }
        } catch (e) { /* first run */ }
    }

    _saveConfig() {
        const fs = require('fs');
        try {
            // Strip the live `params` reference from each layer — it's
            // a live alias to keyframes[activeKeyframe] and would
            // otherwise serialize as a redundant duplicate of that
            // keyframe's contents.
            const layersForSave = this.layers.map(l => {
                const { params, ...rest } = l;
                return rest;
            });
            const cfg = {
                version: 2,
                frameWidth: this.frameWidth,
                frameHeight: this.frameHeight,
                frameCount: this.frameCount,
                interpolation: this.interpolation,
                layers: layersForSave,
                activeLayerId: this.activeLayerId,
                previewMode: this.previewMode,
                previewSingle: this.previewSingle
            };
            fs.writeFileSync(this._configPath(), JSON.stringify(cfg, null, 2));
        } catch (e) { console.error('AnimationGenerator: save config:', e); }
    }

    // -- Layer model ---------------------------------------------------------
    _findAnimation(catId, animId) {
        const cat = ANIMATION_CATEGORIES.find(c => c.id === catId);
        if (!cat) return null;
        return cat.animations.find(a => a.id === animId) || null;
    }
    _findCategory(catId) {
        return ANIMATION_CATEGORIES.find(c => c.id === catId) || null;
    }
    _newLayerId() {
        return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    _makeLayer(catId, animId) {
        const anim = this._findAnimation(catId, animId);
        const params = {};
        if (anim) for (const p of anim.params) params[p.key] = p.default;
        const layer = {
            id: this._newLayerId(),
            categoryId: catId,
            animationId: animId,
            keyframes: [params],
            activeKeyframe: 0,
            blend: (anim && anim.defaultBlend) || 'source-over',
            opacity: 1,
            visible: true
        };
        this._relinkLayerParams(layer);
        return layer;
    }
    _initLayersIfEmpty() {
        if (!Array.isArray(this.layers)) this.layers = [];
        if (!this.layers.find(l => l.id === this.activeLayerId)) {
            this.activeLayerId = this.layers[this.layers.length - 1]?.id || null;
        }
        // First-run / empty-stack default: single-preview a Hypercube so the
        // canvas isn't blank. Doesn't auto-add as a layer.
        if (!this.previewSingle) {
            this.previewSingle = this._makeSingleSession('geometric', 'hypercube');
        }
        // If there's no layer stack, force single mode (composite has nothing
        // to show).
        if (this.layers.length === 0) this.previewMode = 'single';
    }

    _makeSingleSession(catId, animId) {
        const anim = this._findAnimation(catId, animId);
        const params = {};
        if (anim) for (const p of anim.params) params[p.key] = p.default;
        return { categoryId: catId, animationId: animId, params };
    }

    /**
     * Debounce config saves triggered by browsing / randomizing so rapid
     * clicks don't hammer the filesystem with synchronous writes.
     */
    _scheduleSaveConfig() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this._saveConfig();
        }, 600);
    }

    /**
     * Fast partial refresh — avoids a full DOM rebuild when the only thing
     * that changed is which animation is being previewed or its param values.
     * Updates list highlights, preview status, right-pane params, gizmo, and
     * the live preview canvas. Defers the expensive sheet render.
     * Falls back to a full _render() if key DOM landmarks are missing.
     */
    _lightRefresh() {
        const root = this.root;
        if (!root || !root.querySelector('.rr-ag-right-pane')) {
            this._render();
            return;
        }

        // Reset the playback timer so its next tick is a full interval after
        // the switch completes — prevents a double-render if the timer fires
        // in the middle of this update.
        this._startPlayback();

        const target = (this.previewMode === 'single')
            ? this.previewSingle
            : this._activeLayer();
        const editingAnim = target
            ? this._findAnimation(target.categoryId, target.animationId)
            : null;

        // Update animation list row highlights without rebuilding the list.
        const previewSel = this.previewSingle;
        root.querySelectorAll('.rr-ag-anim-item').forEach(el => {
            const isActive = this.previewMode === 'single'
                && previewSel
                && el.dataset.cat === previewSel.categoryId
                && el.dataset.anim === previewSel.animationId;
            el.style.background = isActive ? 'var(--color-bg-hover)' : 'transparent';
            el.style.borderLeft = `3px solid ${isActive ? 'var(--color-accent-bright)' : 'transparent'}`;
        });

        // Update preview status text.
        const statusEl = root.querySelector('.rr-ag-preview-status');
        if (statusEl) {
            let previewStatus;
            if (this.previewMode === 'single' && this.previewSingle) {
                const a = this._findAnimation(this.previewSingle.categoryId, this.previewSingle.animationId);
                previewStatus = `Previewing: <strong>${a ? a.name : '?'}</strong> (not added)`;
            } else if (this.layers.length > 0) {
                const visible = this.layers.filter(l => l.visible).length;
                previewStatus = `Compositing: <strong>${visible}</strong> visible layer${visible === 1 ? '' : 's'}`;
            } else {
                previewStatus = '<span style="color: var(--color-text-dim);">No animation</span>';
            }
            statusEl.innerHTML = `${previewStatus} · frame <span class="rr-ag-frame-readout">${this.previewFrame + 1}</span> of ${this.frameCount}`;
        }

        // Rebuild only the right-pane params panel and rewire its events.
        const rightPane = root.querySelector('.rr-ag-right-pane');
        if (rightPane) {
            rightPane.innerHTML =
                this._renderEditingHeader(target, editingAnim) +
                (editingAnim && target ? this._renderParamControls(editingAnim, target.params) : '');
            this._wireParamEvents();
        }

        // Re-init the 3D gizmo (hides itself if animation has no tilt params).
        this._initGizmo();

        // Defer the first preview frame to the next animation frame — keeps
        // the canvas draw out of the click handler's synchronous budget and
        // aligns it with the display refresh cycle to avoid jitter.
        requestAnimationFrame(() => this._drawPreviewCanvas());
        this._scheduleSheetUpdate();
    }

    /**
     * Set the standalone preview animation. Resets to defaults each time so
     * the user sees the animation as-designed when they browse to it.
     */
    _selectForPreview(catId, animId) {
        this.previewSingle = this._makeSingleSession(catId, animId);
        this.previewMode = 'single';
        this._scheduleSaveConfig();
        this._lightRefresh();
    }

    /**
     * Commit the current single-preview animation (with whatever params the
     * user has tuned in the right pane) as a new layer at the top of the stack.
     */
    _commitSingleAsLayer() {
        const ps = this.previewSingle;
        if (!ps) return;
        const anim = this._findAnimation(ps.categoryId, ps.animationId);
        if (!anim) return;
        const layer = {
            id: this._newLayerId(),
            categoryId: ps.categoryId,
            animationId: ps.animationId,
            keyframes: [{ ...ps.params }], // carry the user's tuning through
            activeKeyframe: 0,
            blend: anim.defaultBlend || 'source-over',
            opacity: 1,
            visible: true
        };
        this._relinkLayerParams(layer);
        this.layers.push(layer);
        this.activeLayerId = layer.id;
        this.previewMode = 'composite';
        this._saveConfig();
        this._render();
    }
    _activeLayer() {
        return this.layers.find(l => l.id === this.activeLayerId) || null;
    }
    _addLayer(catId, animId) {
        // If the user has been experimenting with this animation in single
        // preview, carry over the tuned param values — otherwise they'd lose
        // their work when committing the layer.
        const ps = this.previewSingle;
        const matchingPreview = ps && ps.categoryId === catId && ps.animationId === animId;
        const layer = this._makeLayer(catId, animId);
        if (matchingPreview) {
            // Replace the default keyframe with the preview-tuned params.
            layer.keyframes = [{ ...ps.params }];
            layer.activeKeyframe = 0;
            this._relinkLayerParams(layer);
        }
        this.layers.push(layer);
        this.activeLayerId = layer.id;
        // Switching to composite so the new layer is visible in the preview.
        this.previewMode = 'composite';
        this._saveConfig();
        this._render();
    }
    _removeLayer(layerId) {
        const idx = this.layers.findIndex(l => l.id === layerId);
        if (idx < 0) return;
        this.layers.splice(idx, 1);
        if (this.activeLayerId === layerId) {
            this.activeLayerId = this.layers.length > 0
                ? this.layers[Math.min(idx, this.layers.length - 1)].id
                : null;
        }
        // Empty stack → fall back to single preview so the canvas isn't blank.
        if (this.layers.length === 0) this.previewMode = 'single';
        this._saveConfig();
        this._render();
    }
    /**
     * Duplicate a layer: clone all keyframes deeply (so editing the copy
     * doesn't change the source), insert immediately above the source
     * in the stack (i.e. just in front of it in render order), and make
     * the copy the new active layer.
     */
    _duplicateLayer(layerId) {
        const idx = this.layers.findIndex(l => l.id === layerId);
        if (idx < 0) return;
        const src = this.layers[idx];
        const kfs = Array.isArray(src.keyframes) && src.keyframes.length > 0
            ? src.keyframes.map(kf => ({ ...kf }))
            : [{ ...(src.params || {}) }];
        const copy = {
            id: this._newLayerId(),
            categoryId: src.categoryId,
            animationId: src.animationId,
            keyframes: kfs,
            activeKeyframe: Math.min(src.activeKeyframe || 0, kfs.length - 1),
            blend: src.blend,
            opacity: src.opacity,
            visible: src.visible
        };
        this._relinkLayerParams(copy);
        this.layers.splice(idx + 1, 0, copy);
        this.activeLayerId = copy.id;
        this.previewMode = 'composite';
        this._saveConfig();
        this._render();
    }
    _moveLayer(layerId, dir) {
        // dir = +1 → toward FRONT (end of array, top of UI list)
        // dir = -1 → toward BACK (start of array, bottom of UI list)
        const idx = this.layers.findIndex(l => l.id === layerId);
        if (idx < 0) return;
        const newIdx = Math.max(0, Math.min(this.layers.length - 1, idx + dir));
        if (newIdx === idx) return;
        const [l] = this.layers.splice(idx, 1);
        this.layers.splice(newIdx, 0, l);
        this._saveConfig();
        this._render();
    }

    // -- Playback -------------------------------------------------------------
    _startPlayback() {
        // Cancel any existing loop (both rAF and legacy setInterval).
        if (this._rafHandle) { cancelAnimationFrame(this._rafHandle); this._rafHandle = null; }
        if (this._playTimer) { clearInterval(this._playTimer); this._playTimer = null; }
        this._lastTickTime = null;
        const tickInterval = 1000 / 30; // 30 fps target
        const loop = (now) => {
            if (!this.root) return;
            this._rafHandle = requestAnimationFrame(loop);
            if (!this.playing) return;
            // First tick: just record the start time, don't advance yet.
            if (this._lastTickTime === null) { this._lastTickTime = now; return; }
            if (now - this._lastTickTime < tickInterval) return;
            this._lastTickTime += tickInterval;
            // If we've fallen far behind (e.g. tab was hidden or render was
            // very slow), snap forward rather than firing a burst of frames.
            if (now - this._lastTickTime > tickInterval) this._lastTickTime = now;
            this.previewFrame = (this.previewFrame + 1) % this.frameCount;
            this._drawPreviewCanvas();
        };
        this._rafHandle = requestAnimationFrame(loop);
    }

    // -- Layout ---------------------------------------------------------------
    _render() {
        this._initLayersIfEmpty();

        // Preserve scroll positions of scrollable panes across the full HTML
        // rebuild. Otherwise clicking an animation near the bottom of the
        // catalog jumps it back to the top.
        const _scrolls = {};
        for (const sel of ['.rr-ag-anim-list', '.rr-ag-right-pane', '.rr-dark-surface']) {
            const el = this.root.querySelector(sel);
            if (el) _scrolls[sel] = { top: el.scrollTop, left: el.scrollLeft };
        }

        // Determine what's currently being edited in the right pane.
        // - single mode: edit previewSingle (the standalone browse animation)
        // - composite mode: edit the active layer in the stack
        const activeLayer = this._activeLayer();
        const editingTarget = (this.previewMode === 'single')
            ? this.previewSingle
            : activeLayer;
        const editingAnim = editingTarget
            ? this._findAnimation(editingTarget.categoryId, editingTarget.animationId)
            : null;

        // Status text for the preview header.
        let previewStatus;
        if (this.previewMode === 'single' && this.previewSingle) {
            const a = this._findAnimation(this.previewSingle.categoryId, this.previewSingle.animationId);
            previewStatus = `Previewing: <strong>${a ? a.name : '?'}</strong> (not added)`;
        } else if (this.layers.length > 0) {
            const visible = this.layers.filter(l => l.visible).length;
            previewStatus = `Compositing: <strong>${visible}</strong> visible layer${visible === 1 ? '' : 's'}`;
        } else {
            previewStatus = '<span style="color: var(--color-text-dim);">No animation</span>';
        }

        const sheetCols = SHEET_COLUMNS;
        const sheetRows = Math.ceil(this.frameCount / sheetCols);
        const sheetW = this.frameWidth * sheetCols;
        const sheetH = this.frameHeight * sheetRows;
        const previewDisp = Math.min(384, this.frameWidth * 2);

        this.root.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; min-height: 0;">
                <!-- Toolbar -->
                <div style="padding: 10px 16px; background: var(--color-bg-panel); border-bottom: 1px solid var(--color-border-subtle); display: flex; align-items: center; gap: 14px; flex-shrink: 0; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 11px; color: var(--color-text-muted);">Frame:</label>
                        <input type="number" class="rr-ag-fw rr-input" value="${this.frameWidth}" min="16" max="512" style="width: 64px; padding: 3px 6px; font-size: 11px;">
                        <span style="font-size: 11px; color: var(--color-text-muted);">×</span>
                        <input type="number" class="rr-ag-fh rr-input" value="${this.frameHeight}" min="16" max="512" style="width: 64px; padding: 3px 6px; font-size: 11px;">
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 11px; color: var(--color-text-muted);">Frames:</label>
                        <input type="number" class="rr-ag-fc rr-input" value="${this.frameCount}" min="1" max="${MAX_FRAMES}" style="width: 60px; padding: 3px 6px; font-size: 11px;">
                        <span style="font-size: 10px; color: var(--color-text-dim);">/ ${MAX_FRAMES} max</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size: 11px; color: var(--color-text-muted);">Interpolation:</label>
                        <select class="rr-ag-interp rr-select" style="padding: 3px 6px; font-size: 11px;">
                            <option value="linear"  ${this.interpolation === 'linear'  ? 'selected' : ''}>Linear (smooth)</option>
                            <option value="nearest" ${this.interpolation === 'nearest' ? 'selected' : ''}>Nearest (sharp)</option>
                        </select>
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-dim); margin-left: auto;">
                        Sheet: ${sheetW}×${sheetH} (${sheetCols}×${sheetRows})
                    </div>
                </div>

                <!-- Body: animation catalog (left) | preview + layer stack (center) | params (right) -->
                <div style="display: grid; grid-template-columns: 240px 1fr 300px; flex: 1; min-height: 0;">
                    <div class="rr-ag-anim-list" style="background: var(--color-bg-panel); border-right: 1px solid var(--color-border); overflow-y: auto;">
                        ${this._renderAnimationList()}
                    </div>

                    <div class="rr-dark-surface" style="display: flex; flex-direction: column; padding: 14px 18px; gap: 12px; overflow-y: auto;">
                        <!-- Editing area: preview + layer stack on the LEFT, sheet preview on the RIGHT.
                             Layer stack sits directly under the live preview — most prominent spot
                             for editing the active animation. -->
                        <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
                            <!-- LEFT sub-column: preview canvas + layer stack stacked vertically -->
                            <div style="display: flex; flex-direction: column; gap: 10px; align-items: stretch; min-width: ${previewDisp + 24}px;">
                                <div style="display: flex; flex-direction: column; gap: 6px; align-items: center;">
                                    <div class="rr-ag-preview-status" style="font-size: 10px; color: var(--color-text-muted);">${previewStatus} · frame <span class="rr-ag-frame-readout">${this.previewFrame + 1}</span> of ${this.frameCount}</div>
                                    <div style="background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 10px;">
                                        <canvas class="rr-ag-preview" width="${this.frameWidth}" height="${this.frameHeight}" style="width: ${previewDisp}px; height: ${previewDisp * this.frameHeight / this.frameWidth}px; image-rendering: ${this.interpolation === 'nearest' ? 'pixelated' : 'auto'}; display: block;"></canvas>
                                    </div>
                                    <div style="display: flex; gap: 6px; margin-top: 2px;">
                                    <button class="rr-ag-play rr-btn-chip" style="padding: 4px 12px; display: inline-flex; align-items: center; gap: 5px;">${this.playing
                                        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="0.5"/><rect x="14" y="4" width="4" height="16" rx="0.5"/></svg> Pause'
                                        : '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="6,4 20,12 6,20"/></svg> Play'}</button>
                                    <button class="rr-ag-step rr-btn-chip" style="padding: 4px 12px; display: inline-flex; align-items: center; gap: 5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="4,4 16,12 4,20"/><rect x="17" y="4" width="3" height="16" rx="0.3"/></svg> Step</button>
                                    </div>
                                </div>

                                <!-- Layer stack — directly under the live preview canvas -->
                                <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border-subtle); border-radius: 4px; padding: 10px;">
                                    ${this._renderLayerStack()}
                                </div>
                            </div>

                            <!-- MIDDLE sub-column: 3D rotation gizmo (only relevant when the
                                 editing animation has tilt params — checked via CSS display:none below). -->
                            <div class="rr-ag-gizmo-col" style="display: flex; flex-direction: column; gap: 6px; align-items: center;">
                                <div style="font-size: 10px; color: var(--color-text-muted);">3D Rotation</div>
                                <div style="background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 6px;">
                                    <canvas class="rr-ag-gizmo" width="148" height="148" style="cursor: grab; display: block; touch-action: none;"></canvas>
                                </div>
                                <button class="rr-ag-gizmo-reset rr-btn-chip" style="padding: 3px 10px; font-size: 10px;" title="Reset orientation to head-on (all tilts to 0)">Reset</button>
                                <div style="font-size: 9px; color: var(--color-text-dim); text-align: center; max-width: 150px; line-height: 1.3;">
                                    Drag to rotate. Shift+drag to roll.
                                </div>
                            </div>

                            <!-- RIGHT sub-column: sheet preview + bake button -->
                            <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; flex: 1; min-width: 0;">
                                <div style="font-size: 10px; color: var(--color-text-muted);">Sheet Preview (${sheetW}×${sheetH})</div>
                                <div style="background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 10px; max-width: 100%; overflow: auto;">
                                    <canvas class="rr-ag-sheet" width="${sheetW}" height="${sheetH}" style="max-width: 100%; image-rendering: ${this.interpolation === 'nearest' ? 'pixelated' : 'auto'}; display: block;"></canvas>
                                </div>
                                <button class="rr-ag-bake rr-btn-chip" style="padding: 5px 14px;">↻ Bake Sheet Preview</button>
                            </div>
                        </div>

                        <div style="font-size: 10px; color: var(--color-text-dim);">
                            Click an animation on the left to preview it standalone. Use the <strong>+</strong> button (or <strong>Add as Layer</strong> in the params pane) to commit it to the layer stack. Stacked layers render back-to-front with their own blend mode + opacity.
                        </div>
                    </div>

                    <div class="rr-ag-right-pane" style="background: var(--color-bg-panel); border-left: 1px solid var(--color-border); overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px;">
                        ${this._renderEditingHeader(editingTarget, editingAnim)}
                        ${editingAnim && editingTarget ? this._renderParamControls(editingAnim, editingTarget.params) : ''}
                    </div>
                </div>

                <!-- Footer: save -->
                <div style="padding: 12px 18px; border-top: 1px solid var(--color-border-subtle); background: var(--color-bg-panel); display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <label style="font-size: 12px; color: var(--color-text-muted);">Save as:</label>
                    <input type="text" class="rr-ag-name rr-input" placeholder="MyAnimation" style="width: 220px; padding: 4px 8px; font-size: 12px;">
                    <div style="font-size: 10px; color: var(--color-text-dim);">→ img/animations/&lt;name&gt;.png</div>
                    <div style="margin-left: auto; display: flex; gap: 8px;">
                        <button class="rr-ag-randomize rr-btn-chip" style="padding: 6px 14px;" title="Randomize all sliders and colors for the current animation (textures untouched)">⟳ Randomize</button>
                        <button class="rr-ag-reset rr-btn-chip" style="padding: 6px 14px;" title="Reset the active layer's parameters to defaults">Reset Layer</button>
                        <button class="rr-ag-save rr-btn-chip" style="padding: 6px 18px; color: var(--color-accent-bright);">Bake & Save</button>
                        <button class="rr-ag-save-gif rr-btn-chip" style="padding: 6px 18px; color: var(--color-accent-bright);" title="Export the live animation preview as an animated GIF (handy tool, not for in-game use)">Save GIF</button>
                    </div>
                </div>
            </div>
        `;

        // Restore scroll positions before wiring events (events may scroll
        // things into view based on focus, etc.).
        for (const sel of Object.keys(_scrolls)) {
            const el = this.root.querySelector(sel);
            if (el) { el.scrollTop = _scrolls[sel].top; el.scrollLeft = _scrolls[sel].left; }
        }

        this._wireEvents();
        this._drawPreviewCanvas();
        this._scheduleSheetUpdate();
    }

    /**
     * Banner at the top of the right-pane params editor. Tells the user what
     * they're editing (single-preview animation OR a real layer) and offers
     * the "Add as Layer" action when in single mode.
     */
    _renderEditingHeader(target, anim) {
        if (!target || !anim) {
            return `
                <div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 16px;">
                    Click an animation on the left to preview it.
                </div>
            `;
        }
        const cat = this._findCategory(target.categoryId);
        const isSingle = (this.previewMode === 'single');
        const banner = isSingle
            ? `<div style="background: var(--color-bg-input-alt); border: 1px solid var(--color-border-subtle); border-radius: 4px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 10px; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: 0.3px;">Single Preview</div>
                    <div style="font-size: 13px; color: var(--color-text); font-weight: 600;">${this._tx(anim.name)}</div>
                    <div style="font-size: 10px; color: var(--color-text-muted);">${cat ? cat.name : ''} — not added to the stack yet. Tune the params below, then commit:</div>
                    <button class="rr-ag-commit-single rr-btn-chip" style="padding: 6px 10px; font-size: 11px; color: var(--color-accent-bright); margin-top: 2px;">+ Add as Layer</button>
                </div>`
            : (() => {
                const N = (target.keyframes && target.keyframes.length) || 1;
                const kfIdx = target.activeKeyframe || 0;
                const kfBadge = N > 1
                    ? ` · <span style="color: var(--color-accent-bright); font-weight: 600;">Keyframe ${kfIdx + 1} / ${N}</span>`
                    : '';
                const kfHint = N > 1
                    ? ` Values lerp linearly between keyframes — pick a different KF chip in the layer card to edit a different pose.`
                    : '';
                return `<div style="background: var(--color-bg-input-alt); border: 1px solid var(--color-border-subtle); border-radius: 4px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 10px; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: 0.3px;">Editing Layer${kfBadge}</div>
                    <div style="font-size: 13px; color: var(--color-text); font-weight: 600;">${this._tx(anim.name)}</div>
                    <div style="font-size: 10px; color: var(--color-text-muted);">${cat ? cat.name : ''} · changes apply directly to this layer.${kfHint}</div>
                    <button class="rr-ag-dup-layer rr-btn-chip" data-cat="${target.categoryId}" data-anim="${target.animationId}" style="padding: 6px 10px; font-size: 11px; color: var(--color-accent-bright); margin-top: 2px;" title="Add another instance of this animation as a new top layer">+ Add Another Copy</button>
                    <div style="font-size: 9px; color: var(--color-text-dim); line-height: 1.3;">Adds a fresh copy of <strong>${this._tx(anim.name)}</strong> on top of the stack. The new copy starts with default params — tweak it independently.</div>
                </div>`;
            })();
        return `
            <div>
                ${banner}
                <div style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 12px; margin-bottom: 8px;">Parameters</div>
            </div>
        `;
    }

    _renderLayerStack() {
        if (this.layers.length === 0) {
            return `
                <div>
                    <div style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Layers</div>
                    <div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 12px; border: 1px dashed var(--color-border-subtle); border-radius: 4px;">
                        Click an animation on the left to add a layer.
                    </div>
                </div>
            `;
        }
        // Count duplicates per (categoryId, animationId) so we can append
        // #1, #2 ... when the same animation appears more than once in the
        // stack. Indices follow stack order (bottom = #1, top = #N).
        const dupTotals = new Map();
        const dupIndex = new Map();
        for (const l of this.layers) {
            const k = l.categoryId + '|' + l.animationId;
            dupTotals.set(k, (dupTotals.get(k) || 0) + 1);
        }
        const dupSeen = new Map();
        for (const l of this.layers) {
            const k = l.categoryId + '|' + l.animationId;
            const n = (dupSeen.get(k) || 0) + 1;
            dupSeen.set(k, n);
            dupIndex.set(l.id, n);
        }

        // Render in REVERSE — top of UI list = end of array = drawn last (front).
        const rowsHtml = this.layers.slice().reverse().map(layer => {
            const anim = this._findAnimation(layer.categoryId, layer.animationId);
            const cat = this._findCategory(layer.categoryId);
            const active = layer.id === this.activeLayerId;
            const dupKey = layer.categoryId + '|' + layer.animationId;
            const dupBadge = (dupTotals.get(dupKey) || 1) > 1
                ? ` <span style="color: var(--color-accent-bright);">#${dupIndex.get(layer.id)}</span>`
                : '';
            const blendHtml = BLEND_MODES.map(b =>
                `<option value="${b.value}" ${b.value === layer.blend ? 'selected' : ''}>${b.label}</option>`
            ).join('');
            return `
                <div class="rr-ag-layer-row" data-id="${layer.id}" style="
                    padding: 6px 8px;
                    background: ${active ? 'var(--color-bg-hover)' : 'var(--color-bg-input-alt)'};
                    border: 1px solid ${active ? 'var(--color-accent-bright)' : 'var(--color-border-subtle)'};
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    opacity: ${layer.visible ? 1 : 0.55};
                ">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="rr-ag-layer-vis rr-btn-chip" data-id="${layer.id}" title="${layer.visible ? 'Hide' : 'Show'} layer" style="padding: 2px 4px; min-width: 22px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">${layer.visible
                            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
                            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5"/><path d="M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5"/><path d="M4 4l16 16"/></svg>'}</button>
                        <div style="flex: 1; min-width: 0; font-size: 11px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${anim ? anim.name : '<span style="color:var(--color-text-dim);">(missing)</span>'}${dupBadge}
                            <span style="font-size: 9px; color: var(--color-text-dim);"> · ${cat ? cat.name : '?'}</span>
                        </div>
                        <button class="rr-ag-layer-up rr-btn-chip" data-id="${layer.id}" title="Move toward front" style="padding: 1px 5px; font-size: 10px; min-width: 20px;">▲</button>
                        <button class="rr-ag-layer-down rr-btn-chip" data-id="${layer.id}" title="Move toward back" style="padding: 1px 5px; font-size: 10px; min-width: 20px;">▼</button>
                        <button class="rr-ag-layer-dup rr-btn-chip" data-id="${layer.id}" title="Duplicate layer (copies all keyframes + tuning)" style="padding: 1px 5px; font-size: 10px; min-width: 20px;">⎘</button>
                        <button class="rr-ag-layer-del rr-btn-chip" data-id="${layer.id}" title="Delete layer" style="padding: 1px 5px; font-size: 10px; min-width: 20px;">✕</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <select class="rr-ag-layer-blend rr-select" data-id="${layer.id}" title="Blend mode" style="padding: 1px 4px; font-size: 10px; flex: 0 0 84px;">${blendHtml}</select>
                        <span style="font-size: 9px; color: var(--color-text-dim);">α</span>
                        <input type="range" class="rr-ag-layer-opacity rr-range" data-id="${layer.id}" min="0" max="1" step="0.01" value="${this._currentKfOpacity(layer)}" title="Opacity at this keyframe — drag to change just the active KF's opacity; values lerp between keyframes." style="flex: 1; min-width: 0;">
                        <span class="rr-ag-layer-opacity-val" data-id="${layer.id}" style="font-size: 10px; color: var(--color-text-muted); min-width: 32px; text-align: right;">${Math.round(this._currentKfOpacity(layer) * 100)}%</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 3px; flex-wrap: wrap;" title="Keyframes: click a numbered button to edit that point in time. Param values lerp linearly between adjacent keyframes for every frame in between.">
                        <span style="font-size: 9px; color: var(--color-text-dim); margin-right: 2px;">KF</span>
                        ${(layer.keyframes || [{}]).map((_, kfi) => `
                            <button class="rr-ag-kf-sel rr-btn-chip" data-id="${layer.id}" data-kf="${kfi}"
                                title="Edit keyframe ${kfi + 1}${kfi === 0 ? ' (start)' : kfi === (layer.keyframes.length - 1) ? ' (end)' : ''}"
                                style="padding: 1px 6px; font-size: 10px; min-width: 18px;
                                       background: ${kfi === layer.activeKeyframe ? 'var(--color-accent-bright)' : 'var(--color-bg-input)'};
                                       color: ${kfi === layer.activeKeyframe ? 'var(--color-bg-deep)' : 'var(--color-text)'};">${kfi + 1}</button>
                        `).join('')}
                        <button class="rr-ag-kf-add rr-btn-chip" data-id="${layer.id}"
                            title="Add a new keyframe (duplicates the active one)"
                            style="padding: 1px 6px; font-size: 10px; min-width: 18px;">+</button>
                        ${(layer.keyframes && layer.keyframes.length > 1) ? `
                            <button class="rr-ag-kf-del rr-btn-chip" data-id="${layer.id}"
                                title="Remove the active keyframe"
                                style="padding: 1px 6px; font-size: 10px; min-width: 18px;">−</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        return `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.3px;">Layers</div>
                    <div style="font-size: 10px; color: var(--color-text-dim);">${this.layers.length} layer${this.layers.length === 1 ? '' : 's'}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    ${rowsHtml}
                </div>
            </div>
        `;
    }

    _renderAnimationList() {
        const search = (this.searchQuery || '').toLowerCase().trim();
        const catFilter = this.categoryFilter || 'all';

        // Filter header — sticky filter UI at the top of the left pane.
        let html = `
            <div style="padding: 10px 10px 8px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid var(--color-border-subtle); position: sticky; top: 0; background: var(--color-bg-panel); z-index: 1;">
                <input type="text" class="rr-ag-search rr-input" placeholder="Search animations…" value="${search.replace(/"/g, '&quot;')}" style="padding: 4px 8px; font-size: 11px;">
                <select class="rr-ag-cat-filter rr-select" style="padding: 4px 6px; font-size: 11px;">
                    <option value="all" ${catFilter === 'all' ? 'selected' : ''}>All Categories</option>
                    ${ANIMATION_CATEGORIES.map(c => `<option value="${c.id}" ${catFilter === c.id ? 'selected' : ''}>${this._tx(c.name)}</option>`).join('')}
                </select>
                <div style="font-size: 9px; color: var(--color-text-dim); line-height: 1.4;">Click a row to preview standalone. Click <strong style="color: var(--color-accent-bright);">+</strong> to add it as a layer.</div>
            </div>
        `;

        const categoriesToShow = (catFilter === 'all')
            ? ANIMATION_CATEGORIES
            : ANIMATION_CATEGORIES.filter(c => c.id === catFilter);

        // Is this animation the currently-previewed standalone? Highlight it.
        const previewSel = this.previewSingle;
        const isPreviewing = (catId, animId) =>
            this.previewMode === 'single'
            && previewSel
            && previewSel.categoryId === catId
            && previewSel.animationId === animId;

        let matchCount = 0;
        for (const cat of categoriesToShow) {
            const animations = cat.animations.filter(a =>
                !search || a.name.toLowerCase().includes(search) || a.description.toLowerCase().includes(search)
            );
            if (animations.length === 0) continue;
            matchCount += animations.length;
            html += `<div style="padding: 8px 12px 4px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border-subtle);">${this._tx(cat.name)}</div>`;
            for (const anim of animations) {
                const active = isPreviewing(cat.id, anim.id);
                html += `
                    <div class="rr-ag-anim-item" data-cat="${cat.id}" data-anim="${anim.id}" title="${(anim.description || '').replace(/"/g, '&quot;')}" style="padding: 6px 4px 6px 12px; cursor: pointer; font-size: 12px; color: var(--color-text); border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center; background: ${active ? 'var(--color-bg-hover)' : 'transparent'}; border-left: 3px solid ${active ? 'var(--color-accent-bright)' : 'transparent'};">
                        <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">${this._tx(anim.name)}</span>
                        <button class="rr-ag-anim-add rr-btn-chip" data-cat="${cat.id}" data-anim="${anim.id}" title="Add as new layer" style="padding: 2px 8px; margin-left: 6px; font-size: 12px; color: var(--color-accent-bright); font-weight: 700;">+</button>
                    </div>
                `;
            }
        }
        if (matchCount === 0) {
            html += `<div style="padding: 20px 12px; font-size: 11px; color: var(--color-text-muted); text-align: center;">No animations match this filter.</div>`;
        }
        return html;
    }

    _renderParamControls(animation, params) {
        let html = '';
        for (const p of animation.params) {
            const val = params[p.key];
            if (p.type === 'color') {
                html += `
                    <div style="margin-bottom: 10px; display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: center;">
                        <label style="font-size: 11px; color: var(--color-text-muted);">${this._tx(p.label)}</label>
                        <button type="button" class="rr-color-swatch-btn" data-key="${p.key}" title="Click to choose color" style="background: ${val}; justify-self: start;"></button>
                    </div>
                `;
            } else if (p.type === 'slider') {
                // Description shown as a tooltip on the wrapper only — keeps
                // the right pane compact so users don't need to scroll past
                // paragraph text to reach each slider.
                html += `
                    <div style="margin-bottom: 6px;" title="${p.description ? p.description.replace(/"/g, '&quot;') : ''}">
                        <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted); margin-bottom: 2px;">
                            <span><strong style="color: var(--color-text);">${p.label}</strong></span>
                            <span class="rr-ag-param-val" data-key="${p.key}">${(+val).toFixed(2)}</span>
                        </div>
                        <input type="range" class="rr-ag-param rr-range" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" style="width: 100%;">
                    </div>
                `;
            } else if (p.type === 'texture') {
                // Texture file name relative to forge/animation_generator/textures/.
                // Empty = no texture (wireframe mode).
                const fileName = (val || '').replace(/\\/g, '/').split('/').pop();
                html += `
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 3px;">${p.label}</div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <div class="rr-ag-tex-name" data-key="${p.key}" style="flex: 1; padding: 4px 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 11px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fileName || '(none)'}</div>
                            <button class="rr-ag-tex-pick rr-btn-chip" data-key="${p.key}" title="Pick texture file" style="padding: 4px 10px; font-size: 11px;">…</button>
                            <button class="rr-ag-tex-clear rr-btn-chip" data-key="${p.key}" title="Clear texture (wireframe mode)" style="padding: 4px 8px; font-size: 11px;">✕</button>
                        </div>
                        <div style="font-size: 11px; line-height: 1.35; color: var(--color-text-dim); margin-top: 4px;">Select an image, animated GIF, WebP, or video as a texture.</div>
                    </div>
                `;
            }
        }
        return html;
    }

    _wireEvents() {
        const root = this.root;

        const fwInput = root.querySelector('.rr-ag-fw');
        const fhInput = root.querySelector('.rr-ag-fh');
        const fcInput = root.querySelector('.rr-ag-fc');
        const commit = () => {
            const fw = Math.max(16, Math.min(512, parseInt(fwInput.value) || 192));
            const fh = Math.max(16, Math.min(512, parseInt(fhInput.value) || 192));
            const fc = Math.max(1, Math.min(MAX_FRAMES, parseInt(fcInput.value) || 30));
            if (fw === this.frameWidth && fh === this.frameHeight && fc === this.frameCount) return;
            this.frameWidth = fw; this.frameHeight = fh; this.frameCount = fc;
            this.previewFrame %= this.frameCount;
            // Frame size changed → the cached layer tmp canvas needs to resize.
            this._layerTmp = null;
            this._saveConfig();
            this._render();
        };
        fwInput.addEventListener('change', commit);
        fhInput.addEventListener('change', commit);
        fcInput.addEventListener('change', commit);

        const interpSel = root.querySelector('.rr-ag-interp');
        if (interpSel) {
            interpSel.addEventListener('change', () => {
                this.interpolation = interpSel.value;
                this._saveConfig();
                // Full re-render — the canvas element's CSS `image-rendering`
                // attribute is set inline based on mode, so rebuilding the HTML
                // is what swaps it between `pixelated` and `auto`. Just calling
                // _drawPreviewCanvas would only re-paint the bitmap.
                this._render();
            });
        }

        this._wireAnimationListEvents();
        this._wireLayerStackEvents();
        this._wireParamEvents();

        root.querySelector('.rr-ag-play').addEventListener('click', () => {
            this.playing = !this.playing;
            this._render();
        });
        root.querySelector('.rr-ag-step').addEventListener('click', () => {
            this.playing = false;
            this.previewFrame = (this.previewFrame + 1) % this.frameCount;
            this._drawPreviewCanvas();
            this._render();
        });
        root.querySelector('.rr-ag-bake').addEventListener('click', () => this._drawSheetCanvas());
        root.querySelector('.rr-ag-reset').addEventListener('click', () => {
            // Reset whichever target is currently being edited (single-preview
            // or active layer).
            const target = (this.previewMode === 'single')
                ? this.previewSingle
                : this._activeLayer();
            if (!target) return;
            const anim = this._findAnimation(target.categoryId, target.animationId);
            if (!anim) return;
            const params = {};
            for (const p of anim.params) params[p.key] = p.default;
            target.params = params;
            this._saveConfig();
            this._render();
        });
        root.querySelector('.rr-ag-randomize').addEventListener('click', () => {
            // Randomize all sliders and colors for the currently-edited target.
            // Textures are skipped (not really randomizable — they're files).
            const target = (this.previewMode === 'single')
                ? this.previewSingle
                : this._activeLayer();
            if (!target) return;
            const anim = this._findAnimation(target.categoryId, target.animationId);
            if (!anim) return;

            // Random color via HSL → hex. Constrain saturation high and
            // lightness mid-range so the picks read as vivid/usable colors
            // rather than washed-out / near-black / near-white mush.
            const hslToHex = (h, s, l) => {
                const c = (1 - Math.abs(2 * l - 1)) * s;
                const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
                const m = l - c / 2;
                let r = 0, g = 0, b = 0;
                if (h < 60)       { r = c; g = x; b = 0; }
                else if (h < 120) { r = x; g = c; b = 0; }
                else if (h < 180) { r = 0; g = c; b = x; }
                else if (h < 240) { r = 0; g = x; b = c; }
                else if (h < 300) { r = x; g = 0; b = c; }
                else              { r = c; g = 0; b = x; }
                const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
                return '#' + toHex(r) + toHex(g) + toHex(b);
            };
            const randomColor = () => {
                const h = Math.random() * 360;
                const s = 0.6 + Math.random() * 0.4;   // 0.6–1.0
                const l = 0.45 + Math.random() * 0.25; // 0.45–0.70
                return hslToHex(h, s, l);
            };

            // Animations can opt specific param keys out of randomization
            // (e.g. Interface animations list rotation + opacity + pulse so
            // the panel stays head-on, opaque, and non-throbbing).
            const skipKeys = new Set(anim.noRandomize || []);

            // Colors: if any color param declares a `randomColorRole`, use a
            // coordinated palette (bg = dark, fg hues spread evenly around the
            // wheel) so colors stay readable / contrasting. Otherwise fall
            // back to independent random picks per color (existing behavior
            // — desirable for elemental animations like Fire where you DO
            // want all warm colors).
            const colorParams = anim.params.filter(
                p => p.type === 'color' && !skipKeys.has(p.key)
            );
            const hasRoles = colorParams.some(p => p.randomColorRole != null);
            if (hasRoles) {
                const fgParams = colorParams.filter(p => p.randomColorRole !== 'bg');
                const bgParams = colorParams.filter(p => p.randomColorRole === 'bg');
                const hueOffset = Math.random() * 360;
                const hueStep = fgParams.length > 0 ? 360 / fgParams.length : 360;
                fgParams.forEach((p, i) => {
                    // Evenly-spaced hue + small jitter so the palette doesn't
                    // look mechanically perfect.
                    const h = (hueOffset + i * hueStep
                            + (Math.random() - 0.5) * hueStep * 0.25 + 360) % 360;
                    const s = 0.65 + Math.random() * 0.35;
                    const l = 0.5 + Math.random() * 0.2;
                    target.params[p.key] = hslToHex(h, s, l);
                });
                bgParams.forEach(p => {
                    const h = Math.random() * 360;
                    const s = 0.2 + Math.random() * 0.5;
                    const l = 0.03 + Math.random() * 0.08;
                    target.params[p.key] = hslToHex(h, s, l);
                });
            } else {
                for (const p of colorParams) {
                    target.params[p.key] = randomColor();
                }
            }

            // Sliders. `noRandomize` keys are RESET to their default value
            // (not just preserved at the current value) so e.g. centerX/Y
            // snap back to 0.5 and opacity snaps back to 1.0 every time the
            // user randomizes — the user has explicitly asked for this:
            // randomize should never leave them with an off-screen / nearly
            // invisible generation.
            //
            // Params can also declare `randomMin` / `randomMax` to narrow
            // the random range below what the slider allows. e.g. `size`
            // sliders allow down to 0.02 for manual layering, but random
            // picks stay ≥ 0.2 so generations aren't accidentally tiny.
            for (const p of anim.params) {
                if (p.type !== 'slider') continue;
                if (skipKeys.has(p.key)) {
                    if (p.default !== undefined) target.params[p.key] = p.default;
                    continue;
                }
                const step = p.step || 0.01;
                const rMin = (p.randomMin !== undefined) ? p.randomMin : p.min;
                const rMax = (p.randomMax !== undefined) ? p.randomMax : p.max;
                const raw = rMin + Math.random() * (rMax - rMin);
                const snapped = Math.round(raw / step) * step;
                // Decimal precision from step to avoid 0.30000000004 artifacts.
                const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
                const clamped = Math.max(p.min, Math.min(p.max, snapped));
                target.params[p.key] = parseFloat(clamped.toFixed(decimals));
            }
            // 'texture' params left alone (they're file references).
            this._scheduleSaveConfig();
            this._lightRefresh();
        });
        root.querySelector('.rr-ag-save').addEventListener('click', () => this._saveSheet());
        const gifBtn = root.querySelector('.rr-ag-save-gif');
        if (gifBtn) gifBtn.addEventListener('click', () => this._saveAnimatedGif(gifBtn));

        this._initGizmo();
    }

    /**
     * Initialize the 3D rotation gizmo. Shown only when the currently-edited
     * animation has tiltX/tiltY/tiltZ params; hidden otherwise. Bidirectional
     * sync with the tilt sliders.
     */
    _initGizmo() {
        // Dispose any previous gizmo instance — _render rebuilt the DOM, so
        // the old canvas + document-level listeners must be cleaned up.
        if (this._gizmo) { this._gizmo.dispose(); this._gizmo = null; }

        const root = this.root;
        const canvas = root.querySelector('.rr-ag-gizmo');
        const col = root.querySelector('.rr-ag-gizmo-col');
        if (!canvas || !col) return;

        // Detect whether the editing animation has the tilt params. If not,
        // hide the column entirely (the gizmo doesn't apply to e.g. Fire).
        const target = (this.previewMode === 'single') ? this.previewSingle : this._activeLayer();
        const anim = target ? this._findAnimation(target.categoryId, target.animationId) : null;
        const hasTilts = anim && anim.params && anim.params.some(
            p => p.key === 'tiltX' || p.key === 'tiltY' || p.key === 'tiltZ'
        );
        if (!hasTilts) {
            col.style.display = 'none';
            return;
        }
        col.style.display = '';

        this._gizmo = new RotationGizmo3D(canvas, {
            onChange: (tx, ty, tz) => {
                const tgt = (this.previewMode === 'single') ? this.previewSingle : this._activeLayer();
                if (!tgt) return;
                tgt.params.tiltX = tx;
                tgt.params.tiltY = ty;
                tgt.params.tiltZ = tz;
                // Push values into the slider DOM elements so the UI stays
                // in sync without a full _render (which would lose drag focus).
                for (const key of ['tiltX', 'tiltY', 'tiltZ']) {
                    const slider = root.querySelector(`.rr-ag-param[data-key="${key}"]`);
                    if (slider) slider.value = tgt.params[key];
                    const readout = root.querySelector(`.rr-ag-param-val[data-key="${key}"]`);
                    if (readout) readout.textContent = (+tgt.params[key]).toFixed(2);
                }
                this._drawPreviewCanvas();
                // Debounce config save + sheet redraw so dragging stays fluid.
                this._scheduleSheetUpdate();
            }
        });
        // Initial rotation from current params.
        this._gizmo.setRotation(
            target.params.tiltX || 0,
            target.params.tiltY || 0,
            target.params.tiltZ || 0
        );

        const resetBtn = root.querySelector('.rr-ag-gizmo-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const tgt = (this.previewMode === 'single') ? this.previewSingle : this._activeLayer();
                if (!tgt) return;
                tgt.params.tiltX = 0; tgt.params.tiltY = 0; tgt.params.tiltZ = 0;
                this._gizmo.setRotation(0, 0, 0);
                for (const key of ['tiltX', 'tiltY', 'tiltZ']) {
                    const slider = root.querySelector(`.rr-ag-param[data-key="${key}"]`);
                    if (slider) slider.value = 0;
                    const readout = root.querySelector(`.rr-ag-param-val[data-key="${key}"]`);
                    if (readout) readout.textContent = '0.00';
                }
                this._saveConfig();
                this._drawPreviewCanvas();
                this._scheduleSheetUpdate();
            });
        }
    }

    /**
     * Rewire animation-list events. Used both during full _render and after
     * partial list-only refreshes (search / category filter typing).
     */
    _wireAnimationListEvents() {
        const root = this.root;
        // Click row body → preview standalone (no layer change).
        // Click "+" button → add as new layer with default params.
        root.querySelectorAll('.rr-ag-anim-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // The "+" button has its own handler; ignore bubbled clicks.
                if (e.target.closest('.rr-ag-anim-add')) return;
                this._selectForPreview(el.dataset.cat, el.dataset.anim);
            });
        });
        root.querySelectorAll('.rr-ag-anim-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._addLayer(btn.dataset.cat, btn.dataset.anim);
            });
        });
        const searchInput = root.querySelector('.rr-ag-search');
        const catFilter = root.querySelector('.rr-ag-cat-filter');
        const refreshList = () => {
            const listEl = root.querySelector('.rr-ag-anim-list');
            if (!listEl) return;
            // Preserve search focus + caret position across the partial re-render.
            const wasFocused = document.activeElement === searchInput;
            const caret = wasFocused ? searchInput.selectionStart : null;
            listEl.innerHTML = this._renderAnimationList();
            this._wireAnimationListEvents();
            if (wasFocused) {
                const newSearch = listEl.querySelector('.rr-ag-search');
                if (newSearch) {
                    newSearch.focus();
                    if (caret != null) newSearch.setSelectionRange(caret, caret);
                }
            }
        };
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchQuery = searchInput.value;
                refreshList();
            });
        }
        if (catFilter) {
            catFilter.addEventListener('change', () => {
                this.categoryFilter = catFilter.value;
                refreshList();
            });
        }
    }

    /**
     * Wire layer-stack events (visibility, reorder, delete, blend, opacity,
     * select-active). Clicking the row body sets it as the active layer
     * AND switches to composite preview mode.
     */
    _wireLayerStackEvents() {
        const root = this.root;

        root.querySelectorAll('.rr-ag-layer-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Internal controls have their own handlers — don't double-fire.
                if (e.target.closest('button, select, input')) return;
                const same = row.dataset.id === this.activeLayerId && this.previewMode === 'composite';
                if (same) return;
                this.activeLayerId = row.dataset.id;
                this.previewMode = 'composite';
                this._saveConfig();
                this._render();
            });
        });

        root.querySelectorAll('.rr-ag-layer-vis').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layer = this.layers.find(l => l.id === btn.dataset.id);
                if (!layer) return;
                layer.visible = !layer.visible;
                this._saveConfig();
                this._render();
            });
        });
        root.querySelectorAll('.rr-ag-layer-up').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this._moveLayer(btn.dataset.id, +1); });
        });
        root.querySelectorAll('.rr-ag-layer-down').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this._moveLayer(btn.dataset.id, -1); });
        });
        root.querySelectorAll('.rr-ag-layer-dup').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this._duplicateLayer(btn.dataset.id); });
        });
        root.querySelectorAll('.rr-ag-layer-del').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this._removeLayer(btn.dataset.id); });
        });
        root.querySelectorAll('.rr-ag-layer-blend').forEach(sel => {
            sel.addEventListener('change', (e) => {
                e.stopPropagation();
                const layer = this.layers.find(l => l.id === sel.dataset.id);
                if (!layer) return;
                layer.blend = sel.value;
                this._saveConfig();
                this._drawPreviewCanvas();
                this._drawSheetCanvas();
            });
            sel.addEventListener('click', (e) => e.stopPropagation());
        });
        root.querySelectorAll('.rr-ag-kf-sel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layer = this.layers.find(l => l.id === btn.dataset.id);
                if (!layer) return;
                // Selecting a keyframe also makes that layer the active
                // editing target, so the right pane immediately shows
                // this keyframe's params.
                this.activeLayerId = layer.id;
                this.previewMode = 'composite';
                this._setActiveKeyframe(layer, parseInt(btn.dataset.kf, 10));
            });
        });
        root.querySelectorAll('.rr-ag-kf-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layer = this.layers.find(l => l.id === btn.dataset.id);
                if (!layer) return;
                this.activeLayerId = layer.id;
                this.previewMode = 'composite';
                this._addKeyframe(layer);
            });
        });
        root.querySelectorAll('.rr-ag-kf-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const layer = this.layers.find(l => l.id === btn.dataset.id);
                if (!layer) return;
                this.activeLayerId = layer.id;
                this.previewMode = 'composite';
                this._removeActiveKeyframe(layer);
            });
        });
        root.querySelectorAll('.rr-ag-layer-opacity').forEach(sl => {
            sl.addEventListener('input', (e) => {
                e.stopPropagation();
                const layer = this.layers.find(l => l.id === sl.dataset.id);
                if (!layer) return;
                const v = parseFloat(sl.value);
                // Write to the active keyframe so opacity is per-KF.
                // Also keep layer.opacity in sync for backward compat
                // (legacy single-keyframe layers / older readers).
                const kf = layer.keyframes && layer.keyframes[layer.activeKeyframe || 0];
                if (kf) kf._layerOpacity = v;
                layer.opacity = v;
                const valEl = this.root.querySelector(`.rr-ag-layer-opacity-val[data-id="${sl.dataset.id}"]`);
                if (valEl) valEl.textContent = Math.round(v * 100) + '%';
                this._drawPreviewCanvas();
            });
            sl.addEventListener('change', () => {
                this._saveConfig();
                this._drawSheetCanvas();
            });
            sl.addEventListener('click', (e) => e.stopPropagation());
        });
    }

    /**
     * Wire the right-pane parameter controls. Param changes target either
     * the single-preview animation (browse mode) or the active layer
     * (composite mode), depending on previewMode.
     */
    _wireParamEvents() {
        const root = this.root;
        // Resolve the current edit target on each event so it stays correct
        // even if previewMode flipped between event registration and firing.
        const getTarget = () => (this.previewMode === 'single')
            ? this.previewSingle
            : this._activeLayer();

        root.querySelectorAll('.rr-ag-param').forEach(el => {
            el.addEventListener('input', () => {
                const target = getTarget();
                if (!target) return;
                const key = el.dataset.key;
                let v = el.value;
                if (el.type === 'range') v = parseFloat(v);
                target.params[key] = v;
                const valEl = root.querySelector(`.rr-ag-param-val[data-key="${key}"]`);
                if (valEl && typeof v === 'number') valEl.textContent = v.toFixed(2);
                // Push tilt slider changes into the 3D gizmo so it visually
                // mirrors the slider state.
                if (this._gizmo && (key === 'tiltX' || key === 'tiltY' || key === 'tiltZ')) {
                    this._gizmo.setRotation(
                        target.params.tiltX || 0,
                        target.params.tiltY || 0,
                        target.params.tiltZ || 0
                    );
                }
                this._drawPreviewCanvas();
            });
            el.addEventListener('change', () => {
                this._saveConfig();
                // Debounced sheet redraw — fires once, 400ms after the user
                // stops committing changes. Chromium's native color picker
                // fires `change` continuously as you navigate through colors
                // (not just on dialog close), so an undebounced redraw here
                // would re-render every frame on every intermediate color.
                this._scheduleSheetUpdate();
            });
        });
        // Custom themed color swatch buttons — open a popup picker centered
        // below the clicked swatch instead of the native browser dialog.
        root.querySelectorAll('.rr-color-swatch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openColorPicker(btn);
            });
        });
        root.querySelectorAll('.rr-ag-tex-pick').forEach(btn => {
            btn.addEventListener('click', () => this._pickTexture(btn.dataset.key));
        });
        root.querySelectorAll('.rr-ag-tex-clear').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = getTarget();
                if (!target) return;
                target.params[btn.dataset.key] = '';
                this._saveConfig();
                this._render();
            });
        });
        const commitBtn = root.querySelector('.rr-ag-commit-single');
        if (commitBtn) {
            commitBtn.addEventListener('click', () => this._commitSingleAsLayer());
        }
        // "+ Add Another Copy" — shown while editing an existing layer; adds
        // a fresh layer of the same animation type on top of the stack.
        const dupBtn = root.querySelector('.rr-ag-dup-layer');
        if (dupBtn) {
            dupBtn.addEventListener('click', () => {
                this._addLayer(dupBtn.dataset.cat, dupBtn.dataset.anim);
            });
        }
    }

    /**
     * Custom themed color picker — pops up a floating panel positioned
     * centered horizontally below the swatch, clamped to viewport.
     * Contents:
     *   - Hex input + live preview swatch
     *   - 2D saturation/value picker (drag the cursor across to pick S+V)
     *   - 1D hue strip (drag to pick H)
     *
     * Uses HSV color space internally: H ∈ [0,360], S ∈ [0,1], V ∈ [0,1].
     * The SV picker's gradient is rebuilt whenever H changes so the picker
     * always shows the saturation/value gradient at the current hue.
     */
    _openColorPicker(swatchEl) {
        this._closeColorPicker();
        const key = swatchEl.dataset.key;
        const target = (this.previewMode === 'single') ? this.previewSingle : this._activeLayer();
        if (!target) return;
        const initialColor = (target.params[key] || '#ffffff').toUpperCase();

        // Color space conversion helpers.
        const hexToRgb = (h) => {
            const s = h.replace('#', '');
            return [parseInt(s.substr(0,2),16), parseInt(s.substr(2,2),16), parseInt(s.substr(4,2),16)];
        };
        const rgbToHex = (r, g, b) => '#' + [r,g,b].map(c =>
            Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')
        ).join('').toUpperCase();
        const rgbToHsv = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const v = max, d = max - min;
            const s = max === 0 ? 0 : d / max;
            let h = 0;
            if (d !== 0) {
                if      (max === r) h = ((g - b) / d) % 6;
                else if (max === g) h = (b - r) / d + 2;
                else                h = (r - g) / d + 4;
                h *= 60;
                if (h < 0) h += 360;
            }
            return [h, s, v];
        };
        const hsvToRgb = (h, s, v) => {
            const c = v * s;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = v - c;
            let r = 0, g = 0, b = 0;
            if      (h < 60)  { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else              { r = c; b = x; }
            return [
                Math.round((r + m) * 255),
                Math.round((g + m) * 255),
                Math.round((b + m) * 255)
            ];
        };

        // Initial HSV from initial color.
        let [r0, g0, b0] = hexToRgb(initialColor);
        let [curH, curS, curV] = rgbToHsv(r0, g0, b0);

        const popup = document.createElement('div');
        popup.className = 'rr-color-popup';
        popup.innerHTML = `
            <div class="rr-color-popup-row">
                <div class="rr-color-popup-preview" style="background: ${initialColor};"></div>
                <input type="text" class="rr-color-popup-hex" value="${initialColor}" maxlength="7" spellcheck="false">
            </div>
            <div class="rr-color-popup-sv">
                <div class="rr-color-popup-sv-cursor"></div>
            </div>
            <div class="rr-color-popup-hue">
                <div class="rr-color-popup-hue-cursor"></div>
            </div>
        `;
        document.body.appendChild(popup);

        const hexInput  = popup.querySelector('.rr-color-popup-hex');
        const preview   = popup.querySelector('.rr-color-popup-preview');
        const svArea    = popup.querySelector('.rr-color-popup-sv');
        const svCursor  = popup.querySelector('.rr-color-popup-sv-cursor');
        const hueStrip  = popup.querySelector('.rr-color-popup-hue');
        const hueCursor = popup.querySelector('.rr-color-popup-hue-cursor');

        // Refresh SV area background (always shows the gradient at currentH).
        const refreshSvBackground = () => {
            svArea.style.background =
                `linear-gradient(to bottom, transparent, #000), ` +
                `linear-gradient(to right, #fff, hsl(${curH}, 100%, 50%))`;
        };
        const positionCursors = () => {
            svCursor.style.left = `${curS * 100}%`;
            svCursor.style.top  = `${(1 - curV) * 100}%`;
            hueCursor.style.left = `${(curH / 360) * 100}%`;
        };

        // Apply HSV → update hex, RGB, callback. `source` indicates which
        // input triggered the change so we don't overwrite that input's value.
        const applyHsv = (source) => {
            const [r, g, b] = hsvToRgb(curH, curS, curV);
            const hex = rgbToHex(r, g, b);
            target.params[key] = hex;
            preview.style.background = hex;
            swatchEl.style.background = hex;
            if (source !== 'hex') hexInput.value = hex;
            this._drawPreviewCanvas();
        };

        // Apply hex string → update HSV state + UI.
        const applyHex = (hex) => {
            if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
            hex = hex.toUpperCase();
            target.params[key] = hex;
            const [r, g, b] = hexToRgb(hex);
            // Preserve hue if the color is grayscale (rgbToHsv returns h=0 for
            // grayscale, which would yank the hue slider to red unexpectedly).
            const [h, s, v] = rgbToHsv(r, g, b);
            if (s > 0.01) curH = h;
            curS = s; curV = v;
            preview.style.background = hex;
            swatchEl.style.background = hex;
            refreshSvBackground();
            positionCursors();
            this._drawPreviewCanvas();
        };

        refreshSvBackground();
        positionCursors();

        hexInput.addEventListener('input', () => {
            let v = hexInput.value.trim();
            if (v && v[0] !== '#') v = '#' + v;
            applyHex(v);
        });

        // SV area drag: x = saturation, y = inverted value.
        const onSvDrag = (e) => {
            const rect = svArea.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
            curS = x;
            curV = 1 - y;
            positionCursors();
            applyHsv('sv');
        };
        svArea.addEventListener('mousedown', (e) => {
            e.preventDefault();
            onSvDrag(e);
            const move = (e) => onSvDrag(e);
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        // Hue strip drag: x = hue (0-360°).
        const onHueDrag = (e) => {
            const rect = hueStrip.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            curH = x * 360;
            refreshSvBackground();
            positionCursors();
            applyHsv('hue');
        };
        hueStrip.addEventListener('mousedown', (e) => {
            e.preventDefault();
            onHueDrag(e);
            const move = (e) => onHueDrag(e);
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        // Position the popup centered below the swatch, clamped to viewport.
        // Read offsetHeight AFTER append + content rendered.
        const popW = popup.offsetWidth  || 232;
        const popH = popup.offsetHeight || 220;
        const rect = swatchEl.getBoundingClientRect();
        let px = rect.left + rect.width / 2 - popW / 2;
        let py = rect.bottom + 6;
        px = Math.max(8, Math.min(px, window.innerWidth  - popW - 8));
        py = Math.max(8, Math.min(py, window.innerHeight - popH - 8));
        popup.style.left = `${px}px`;
        popup.style.top  = `${py}px`;

        const closeHandler = (e) => {
            if (popup.contains(e.target) || e.target === swatchEl) return;
            this._closeColorPicker();
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
        popup._closeHandler = closeHandler;
        this._colorPopup = popup;
    }

    _closeColorPicker() {
        if (!this._colorPopup) return;
        if (this._colorPopup._closeHandler) {
            document.removeEventListener('click', this._colorPopup._closeHandler);
        }
        this._colorPopup.remove();
        this._colorPopup = null;
        // Save + debounced sheet redraw on close (color commit).
        this._saveConfig();
        this._scheduleSheetUpdate();
    }

    /**
     * Open a native file picker (via hidden input[type=file]) for the user
     * to pick a texture image. The file is copied into forge/animation_generator/
     * textures/ and the relative filename stored in the active animation's
     * param values so the project is portable.
     */
    _pickTexture(key) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,'
                     + 'video/mp4,video/webm,video/quicktime,video/ogg';
        input.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const srcPath = file.path;
            const fs = require('fs');
            const path = require('path');
            const baseName = path.basename(srcPath);
            const destDir = this._texturesDir();
            try {
                fs.mkdirSync(destDir, { recursive: true });
                const destPath = path.join(destDir, baseName);
                if (path.resolve(srcPath) !== path.resolve(destPath)) {
                    fs.copyFileSync(srcPath, destPath);
                }
                // Invalidate cache so re-imported bytes are picked up.
                TEXTURE_CACHE.delete(destPath);
                const target = (this.previewMode === 'single')
                    ? this.previewSingle
                    : this._activeLayer();
                if (!target) return;
                target.params[key] = baseName;
                this._saveConfig();
                this._render();
            } catch (err) {
                console.error('Texture pick failed:', err);
                alert('Failed to import texture: ' + err.message);
            }
        });
        input.click();
    }

    // ── Keyframe helpers ─────────────────────────────────────────────
    /**
     * Ensure a layer is keyframe-ready. Migrates a legacy single-params
     * layer into a single-element keyframes array. Always relinks
     * `layer.params` to the currently-active keyframe so existing code
     * that mutates `target.params[key]` transparently writes to the
     * right keyframe without any other changes.
     */
    _relinkLayerParams(layer) {
        if (!Array.isArray(layer.keyframes) || layer.keyframes.length === 0) {
            layer.keyframes = [layer.params ? { ...layer.params } : {}];
        }
        if (typeof layer.activeKeyframe !== 'number'
            || layer.activeKeyframe >= layer.keyframes.length
            || layer.activeKeyframe < 0) {
            layer.activeKeyframe = 0;
        }
        // Migrate layer-level opacity into each keyframe so opacity can
        // be animated per-keyframe. The fallback is layer.opacity (the
        // legacy field) or 1.0.
        const fallbackOp = layer.opacity !== undefined ? layer.opacity : 1;
        for (const kf of layer.keyframes) {
            if (typeof kf._layerOpacity !== 'number') {
                kf._layerOpacity = fallbackOp;
            }
        }
        layer.params = layer.keyframes[layer.activeKeyframe];
    }

    /** Active keyframe's stored layer-opacity (for the slider UI). */
    _currentKfOpacity(layer) {
        const kf = layer.keyframes && layer.keyframes[layer.activeKeyframe || 0];
        if (kf && typeof kf._layerOpacity === 'number') return kf._layerOpacity;
        return layer.opacity !== undefined ? layer.opacity : 1;
    }

    /**
     * Compute the effective layer-blend alpha for `layer` at `frameIdx`.
     * Each keyframe stores its own `_layerOpacity` (defaulting to the
     * legacy `layer.opacity` if missing), and values lerp linearly
     * between adjacent keyframes — same evenly-spaced timing as the
     * animation params.
     */
    _layerOpacityAt(layer, frameIdx) {
        const kfs = layer.keyframes;
        if (!kfs || kfs.length === 0) {
            return layer.opacity !== undefined ? layer.opacity : 1;
        }
        const fallback = layer.opacity !== undefined ? layer.opacity : 1;
        const opOf = (kf) => (typeof kf._layerOpacity === 'number')
            ? kf._layerOpacity : fallback;
        if (kfs.length === 1) return opOf(kfs[0]);
        const N = kfs.length;
        const tot = Math.max(1, this.frameCount - 1);
        const tFrac = Math.min(1, Math.max(0, frameIdx / tot));
        const segPos = tFrac * (N - 1);
        let i = Math.floor(segPos);
        if (i >= N - 1) i = N - 2;
        const u = segPos - i;
        const va = opOf(kfs[i]);
        const vb = opOf(kfs[i + 1]);
        return va + (vb - va) * u;
    }

    /** Linearly lerp two hex colors A→B in RGB space. */
    _lerpColor(hexA, hexB, u) {
        const parse = (hex) => {
            if (typeof hex !== 'string') return null;
            const m = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
            return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
        };
        const a = parse(hexA);
        const b = parse(hexB);
        if (!a || !b) return hexA;
        const r = Math.round(a[0] + (b[0] - a[0]) * u);
        const g = Math.round(a[1] + (b[1] - a[1]) * u);
        const bb = Math.round(a[2] + (b[2] - a[2]) * u);
        const hex = (v) => v.toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(bb);
    }

    /**
     * Compute the effective param values for `layer` at `frameIdx`.
     * Keyframes are spaced evenly: KF_i is at t = i / (N - 1) for N > 1.
     * Slider params lerp linearly, color params lerp in RGB, and
     * non-interpolable params (textures, strings) snap to the lower
     * keyframe.
     */
    _paramsAtFrame(layer, frameIdx) {
        const kfs = layer.keyframes;
        if (!kfs || kfs.length === 0) return layer.params || {};
        if (kfs.length === 1) return kfs[0];
        const N = kfs.length;
        const tot = Math.max(1, this.frameCount - 1);
        const tFrac = Math.min(1, Math.max(0, frameIdx / tot));
        const segPos = tFrac * (N - 1);
        let i = Math.floor(segPos);
        if (i >= N - 1) i = N - 2;
        const u = segPos - i;
        const a = kfs[i], b = kfs[i + 1];
        const anim = this._findAnimation(layer.categoryId, layer.animationId);
        if (!anim) return a;
        const out = {};
        let textureTransition = null;
        for (const p of anim.params) {
            const va = a[p.key];
            const vb = b[p.key];
            if (va === undefined && vb === undefined) {
                out[p.key] = p.default;
            } else if (va === undefined) {
                out[p.key] = vb;
            } else if (vb === undefined) {
                out[p.key] = va;
            } else if (p.type === 'slider') {
                out[p.key] = va + (vb - va) * u;
            } else if (p.type === 'color') {
                out[p.key] = this._lerpColor(va, vb, u);
            } else if (p.type === 'texture' && va !== vb) {
                // Cross-fade two different textures during the segment:
                // the renderer will draw once with va, once with vb, and
                // alpha-blend at factor u. Tag the transition so
                // _renderFrameInto can drive the dual-render path.
                if (!textureTransition) {
                    textureTransition = { key: p.key, from: va, to: vb, u };
                }
                out[p.key] = va;  // first pass uses va; second pass overrides
            } else {
                // Other non-interpolable (strings, etc.): snap at the
                // segment midpoint so every keyframe's value is visible.
                out[p.key] = u < 0.5 ? va : vb;
            }
        }
        if (textureTransition) out._textureTransition = textureTransition;
        return out;
    }

    /**
     * Switch the active keyframe + refresh UI/preview. Also jumps the
     * preview frame to the time position of that keyframe so the user
     * sees exactly the pose they're editing.
     */
    _setActiveKeyframe(layer, index) {
        layer.activeKeyframe = Math.max(0, Math.min(layer.keyframes.length - 1, index));
        this._relinkLayerParams(layer);
        const N = layer.keyframes.length;
        if (N > 1) {
            const tFrac = layer.activeKeyframe / (N - 1);
            this.previewFrame = Math.round(tFrac * (this.frameCount - 1));
        }
        this._saveConfig();
        this._render();
    }

    /**
     * Duplicate the active keyframe and append it as a new keyframe,
     * which then becomes active. Users tweak it for the "next pose".
     */
    _addKeyframe(layer) {
        const src = layer.keyframes[layer.activeKeyframe] || {};
        layer.keyframes.push({ ...src });
        layer.activeKeyframe = layer.keyframes.length - 1;
        this._relinkLayerParams(layer);
        // Jump to the new keyframe's time (the end of the loop).
        const N = layer.keyframes.length;
        if (N > 1) {
            this.previewFrame = this.frameCount - 1;
        }
        this._saveConfig();
        this._render();
    }

    /** Remove the active keyframe (no-op if only one remains). */
    _removeActiveKeyframe(layer) {
        if (!layer.keyframes || layer.keyframes.length <= 1) return;
        layer.keyframes.splice(layer.activeKeyframe, 1);
        if (layer.activeKeyframe >= layer.keyframes.length) {
            layer.activeKeyframe = layer.keyframes.length - 1;
        }
        this._relinkLayerParams(layer);
        this._saveConfig();
        this._render();
    }

    /**
     * Bake a params object with the texture image resolved + interpolation
     * mode injected, so render functions don't have to reach back into the
     * tool's state.
     */
    _renderParamsFor(rawParams, frameIdx) {
        const out = { ...rawParams, _interpolation: this.interpolation };
        if (rawParams.texture) {
            const path = require('path');
            const abs = path.join(this._texturesDir(), rawParams.texture);
            // When the image finishes loading asynchronously, refresh BOTH the
            // live preview AND the sheet preview so the texture appears in
            // both right away (otherwise the sheet stays as wireframe until
            // the user manually clicks "Bake Sheet Preview").
            const tex = getTextureImage(abs, () => {
                this._drawPreviewCanvas();
                this._drawSheetCanvas();
            });
            // Animated GIF or video: pick the frame canvas matching the
            // current loop fraction. The animated texture plays exactly
            // once per loop, so any animation that consumes
            // `_textureImage` automatically sees its texture animate
            // without needing per-animation changes. Video frames may
            // not be decoded yet — animatedFrameAt returns null in that
            // case, which animations treat as a not-yet-loaded image.
            if (tex && (tex.isGif || tex.isVideo)) {
                const fIdx = (typeof frameIdx === 'number') ? frameIdx : 0;
                const tFrac = this.frameCount > 0
                    ? fIdx / this.frameCount
                    : 0;
                out._textureImage = animatedFrameAt(tex, tFrac);
            } else {
                out._textureImage = tex;
            }
        } else {
            out._textureImage = null;
        }
        return out;
    }

    // -- Rendering ------------------------------------------------------------
    /**
     * Lazy-allocated offscreen canvas, sized to the current frame dimensions,
     * used to render each layer before compositing it onto the destination.
     * Without this, the layer's own `clearRect(0,0,w,h)` would wipe out the
     * previous layers drawn beneath it.
     */
    _getLayerTmp() {
        if (!this._layerTmp || this._layerTmp.width !== this.frameWidth || this._layerTmp.height !== this.frameHeight) {
            this._layerTmp = document.createElement('canvas');
            this._layerTmp.width = this.frameWidth;
            this._layerTmp.height = this.frameHeight;
        }
        return this._layerTmp;
    }

    /**
     * Second offscreen canvas used during texture cross-fade rendering.
     * Same lifecycle as _getLayerTmp; held separately so the cross-fade
     * doesn't trample the layer composition buffer.
     */
    _getBlendTmp() {
        if (!this._blendTmp || this._blendTmp.width !== this.frameWidth || this._blendTmp.height !== this.frameHeight) {
            this._blendTmp = document.createElement('canvas');
            this._blendTmp.width = this.frameWidth;
            this._blendTmp.height = this.frameHeight;
        }
        return this._blendTmp;
    }

    /**
     * Render a single frame into `ctx`. Behaviour depends on previewMode:
     *   - 'single': renders just `previewSingle` standalone (no layer compositing).
     *   - 'composite': walks the layer stack back-to-front, drawing each
     *     visible layer to a fresh tmp canvas then blitting onto `ctx`
     *     with the layer's blend mode + opacity. The tmp canvas isolates
     *     each layer's `clearRect` so it doesn't wipe previous layers.
     */
    _renderFrameInto(ctx, w, h, frameIdx) {
        const prevOp = ctx.globalCompositeOperation;
        const prevA  = ctx.globalAlpha;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, w, h);
        const smooth = (this.interpolation === 'linear');

        // Single-preview mode: render the standalone animation directly.
        if (this.previewMode === 'single' && this.previewSingle) {
            const anim = this._findAnimation(this.previewSingle.categoryId, this.previewSingle.animationId);
            if (anim) {
                ctx.imageSmoothingEnabled = smooth;
                const params = this._renderParamsFor(this.previewSingle.params, frameIdx);
                anim.render(ctx, w, h, frameIdx, this.frameCount, params);
            }
            ctx.globalCompositeOperation = prevOp;
            ctx.globalAlpha = prevA;
            return;
        }

        if (this.layers.length === 0) {
            ctx.globalCompositeOperation = prevOp;
            ctx.globalAlpha = prevA;
            return;
        }
        const tmp = this._getLayerTmp();
        const tCtx = tmp.getContext('2d');
        for (const layer of this.layers) {
            if (!layer.visible) continue;
            const anim = this._findAnimation(layer.categoryId, layer.animationId);
            if (!anim) continue;
            tCtx.globalCompositeOperation = 'source-over';
            tCtx.globalAlpha = 1;
            tCtx.imageSmoothingEnabled = smooth;
            tCtx.clearRect(0, 0, w, h);
            const rawParams = this._paramsAtFrame(layer, frameIdx);
            const xf = rawParams._textureTransition;
            if (xf) {
                // Smooth texture cross-fade: render with "from" texture
                // at full alpha, then render with "to" texture on an
                // offscreen and blit on top at alpha = u. Result is a
                // linear alpha-blend between the two textures.
                const paramsA = this._renderParamsFor({ ...rawParams, [xf.key]: xf.from }, frameIdx);
                anim.render(tCtx, w, h, frameIdx, this.frameCount, paramsA);
                const blendC = this._getBlendTmp();
                const bCtx = blendC.getContext('2d');
                bCtx.globalCompositeOperation = 'source-over';
                bCtx.globalAlpha = 1;
                bCtx.imageSmoothingEnabled = smooth;
                bCtx.clearRect(0, 0, w, h);
                const paramsB = this._renderParamsFor({ ...rawParams, [xf.key]: xf.to }, frameIdx);
                anim.render(bCtx, w, h, frameIdx, this.frameCount, paramsB);
                tCtx.globalAlpha = xf.u;
                tCtx.drawImage(blendC, 0, 0);
                tCtx.globalAlpha = 1;
            } else {
                const params = this._renderParamsFor(rawParams, frameIdx);
                anim.render(tCtx, w, h, frameIdx, this.frameCount, params);
            }

            ctx.globalAlpha = this._layerOpacityAt(layer, frameIdx);
            ctx.globalCompositeOperation = layer.blend || 'source-over';
            ctx.imageSmoothingEnabled = smooth;
            ctx.drawImage(tmp, 0, 0);
        }
        ctx.globalCompositeOperation = prevOp;
        ctx.globalAlpha = prevA;
    }

    _drawPreviewCanvas() {
        if (!this.root) return;
        const canvas = this.root.querySelector('.rr-ag-preview');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = (this.interpolation === 'linear');
        this._renderFrameInto(ctx, this.frameWidth, this.frameHeight, this.previewFrame);
        const readout = this.root.querySelector('.rr-ag-frame-readout');
        if (readout) readout.textContent = String(this.previewFrame + 1);
    }

    /**
     * Debounced sheet redraw. Coalesces rapid `change` events (e.g. Chromium's
     * native color picker firing on every navigation step) into a single
     * redraw triggered ~300ms after the user stops.
     */
    _scheduleSheetUpdate() {
        if (this._sheetUpdateTimer) clearTimeout(this._sheetUpdateTimer);
        this._sheetRenderGen = (this._sheetRenderGen || 0) + 1;
        this._sheetUpdateTimer = setTimeout(() => {
            this._sheetUpdateTimer = null;
            this._drawSheetCanvas();
        }, 300);
    }

    /**
     * Async chunked sheet renderer. Renders 5 frames then yields to the UI
     * thread via setTimeout(0) so the interface stays responsive during long
     * renders. A generation counter lets a newer request cancel any in-flight
     * render — rapid param changes or animation switches won't pile up.
     */
    async _drawSheetCanvas() {
        if (!this.root) return;
        const canvas = this.root.querySelector('.rr-ag-sheet');
        if (!canvas) return;
        const gen = this._sheetRenderGen || 0;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const frameTmp = document.createElement('canvas');
        frameTmp.width = this.frameWidth;
        frameTmp.height = this.frameHeight;
        const fCtx = frameTmp.getContext('2d');
        fCtx.imageSmoothingEnabled = (this.interpolation === 'linear');
        // Time-budgeted chunking: yield to the UI thread whenever a chunk has
        // consumed ≥ 8ms. This keeps the event loop responsive regardless of
        // how expensive each frame render is — a single heavy frame (e.g. Fire
        // at high settings) yields immediately after that frame rather than
        // blocking for a fixed count of 5 potentially-slow frames.
        const BUDGET_MS = 8;
        let chunkStart = performance.now();
        for (let i = 0; i < this.frameCount; i++) {
            if ((this._sheetRenderGen || 0) !== gen) return; // cancelled by newer request
            this._renderFrameInto(fCtx, this.frameWidth, this.frameHeight, i);
            const col = i % SHEET_COLUMNS;
            const row = Math.floor(i / SHEET_COLUMNS);
            ctx.drawImage(frameTmp, col * this.frameWidth, row * this.frameHeight);
            if (performance.now() - chunkStart >= BUDGET_MS) {
                await new Promise(r => setTimeout(r, 0));
                chunkStart = performance.now();
            }
        }
    }

    /**
     * Synchronous sheet renderer — used only by _saveSheet where the entire
     * sheet must be fully baked before toDataURL() is called.
     */
    _drawSheetCanvasSync() {
        if (!this.root) return;
        const canvas = this.root.querySelector('.rr-ag-sheet');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const frameTmp = document.createElement('canvas');
        frameTmp.width = this.frameWidth;
        frameTmp.height = this.frameHeight;
        const fCtx = frameTmp.getContext('2d');
        fCtx.imageSmoothingEnabled = (this.interpolation === 'linear');
        for (let i = 0; i < this.frameCount; i++) {
            this._renderFrameInto(fCtx, this.frameWidth, this.frameHeight, i);
            const col = i % SHEET_COLUMNS;
            const row = Math.floor(i / SHEET_COLUMNS);
            ctx.drawImage(frameTmp, col * this.frameWidth, row * this.frameHeight);
        }
    }

    _saveSheet() {
        const input = this.root.querySelector('.rr-ag-name');
        let name = (input.value || '').trim();
        if (!name) { alert('Enter a name for the animation sheet.'); return; }
        name = name.replace(/\.png$/i, '');

        // Re-bake the sheet synchronously so toDataURL() sees the full image.
        this._sheetRenderGen = (this._sheetRenderGen || 0) + 1; // cancel any async render
        this._drawSheetCanvasSync();
        const canvas = this.root.querySelector('.rr-ag-sheet');
        if (!canvas) return;

        const projectPath = this._requireProjectPath();
        if (!projectPath) return;

        const fs = require('fs');
        const path = require('path');
        const defaultDir = path.join(projectPath, 'img', 'animations');
        try { fs.mkdirSync(defaultDir, { recursive: true }); } catch (e) {}

        const base64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        const pngBuf = Buffer.from(base64, 'base64');

        // NW.js native "Save As" dialog via the nwsaveas attribute on an
        // input[type=file]. Default to the project's img/animations/ folder
        // so the common case is one click; user can navigate elsewhere.
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.style.display = 'none';
        picker.setAttribute('nwsaveas', `${name}.png`);
        picker.setAttribute('nwworkingdir', defaultDir);
        picker.accept = '.png';
        picker.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file || !file.path) return; // user cancelled
            try {
                fs.writeFileSync(file.path, pngBuf);
                alert(`Saved → ${file.path}`);
            } catch (err) {
                console.error('AnimationGenerator save:', err);
                alert('Failed to save: ' + err.message);
            } finally {
                picker.remove();
            }
        });
        document.body.appendChild(picker);
        picker.click();
    }

    /**
     * Export the live animation preview as an animated GIF. Renders
     * every loop frame into the preview-size canvas, hands each one to
     * gif.js, and saves the encoded blob via NW.js's "Save As" dialog
     * (default folder: img/animations/). Handy export tool — output is
     * NOT intended for in-game use (sprite sheets are still the engine
     * format), just for sharing the preview as a GIF outside the tool.
     */
    _saveAnimatedGif(btn) {
        if (typeof GIF !== 'function') {
            alert('GIF encoder (gif.js) is not loaded.');
            return;
        }
        const projectPath = this._requireProjectPath();
        if (!projectPath) return;
        const input = this.root.querySelector('.rr-ag-name');
        let name = (input.value || '').trim() || 'animation';
        name = name.replace(/\.gif$/i, '');

        const fs = require('fs');
        const path = require('path');
        const defaultDir = path.join(projectPath, 'img', 'animations');
        try { fs.mkdirSync(defaultDir, { recursive: true }); } catch (e) {}

        // Locate gif.worker.js relative to the project root — NW.js
        // resolves URLs against the loaded HTML's directory.
        const workerScript = window.RR_GIF_WORKER_SCRIPT || 'libs/gif.worker.js';

        // Build the encoder. Each frame's delay matches the user's
        // active loop length / frame count, so the GIF plays at the
        // same speed as the in-tool preview.
        const targetFps = 24;
        const delayMs = Math.max(20, Math.round(1000 / targetFps));
        // gif.js drops the alpha channel and quantizes to a 256-colour
        // palette, so true alpha can't survive. Instead, we chroma-key:
        // every pixel whose source alpha is below a threshold is rewritten
        // to a magic colour, and the encoder is told to mark that exact
        // palette entry transparent. 0xFE00FE is bright magenta, unlikely
        // to collide with anything natural in our animation palettes.
        const CHROMA_R = 0xFE, CHROMA_G = 0x00, CHROMA_B = 0xFE;
        const CHROMA_HEX = (CHROMA_R << 16) | (CHROMA_G << 8) | CHROMA_B;
        const gif = new GIF({
            workers:      2,
            quality:      10,           // 1..30, lower = better
            workerScript: workerScript,
            width:        this.frameWidth,
            height:       this.frameHeight,
            repeat:       0,            // loop forever
            transparent:  CHROMA_HEX,
            background:   '#' + CHROMA_HEX.toString(16).padStart(6, '0')
        });

        // Disable the button + show progress while encoding.
        const originalText = btn ? btn.textContent : 'Save GIF';
        const setLabel = (s) => { if (btn) btn.textContent = s; };
        if (btn) btn.disabled = true;
        setLabel('Rendering 0%');

        // Render every frame into the existing offscreen renderer.
        const tmp = document.createElement('canvas');
        tmp.width  = this.frameWidth;
        tmp.height = this.frameHeight;
        const tCtx = tmp.getContext('2d');
        for (let f = 0; f < this.frameCount; f++) {
            tCtx.clearRect(0, 0, tmp.width, tmp.height);
            this._renderFrameInto(tCtx, tmp.width, tmp.height, f);
            // Chroma-key: stamp every transparent pixel with the magic
            // colour so the encoder can map it to the transparent palette
            // entry. We do this on the ImageData directly, then hand the
            // ImageData to addFrame (which copies internally).
            const img = tCtx.getImageData(0, 0, tmp.width, tmp.height);
            const px = img.data;
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] < 128) {
                    px[i]     = CHROMA_R;
                    px[i + 1] = CHROMA_G;
                    px[i + 2] = CHROMA_B;
                    px[i + 3] = 255;
                }
            }
            gif.addFrame(img, { delay: delayMs });
        }

        gif.on('progress', (p) => {
            setLabel(`Encoding ${Math.round(p * 100)}%`);
        });
        gif.on('finished', (blob) => {
            setLabel('Saving…');
            // Convert blob → Buffer for fs writing.
            const reader = new FileReader();
            reader.onloadend = () => {
                const gifBuf = Buffer.from(reader.result);
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.style.display = 'none';
                picker.setAttribute('nwsaveas', `${name}.gif`);
                picker.setAttribute('nwworkingdir', defaultDir);
                picker.accept = '.gif';
                picker.addEventListener('change', (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file || !file.path) {
                        if (btn) { btn.disabled = false; setLabel(originalText); }
                        return;
                    }
                    try {
                        fs.writeFileSync(file.path, gifBuf);
                        alert(`Saved → ${file.path}`);
                    } catch (err) {
                        console.error('GIF save:', err);
                        alert('Failed to save: ' + err.message);
                    } finally {
                        picker.remove();
                        if (btn) { btn.disabled = false; setLabel(originalText); }
                    }
                });
                document.body.appendChild(picker);
                picker.click();
            };
            reader.readAsArrayBuffer(blob);
        });
        gif.render();
    }
}
