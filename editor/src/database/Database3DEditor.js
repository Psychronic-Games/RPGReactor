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
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.selectedName = '';
        this.rawAnimations = [];
        this.customParts = [];
        this.playRules = [];
        this.partNames = [];
        this.selectedRule = -1;
        this.selectedPart = -1;
        // The card's target: null = nothing chosen, '' = whole model.
        this.selectedPartName = null;
        this._view = { yaw: 30, pitch: 20, distance: 4 };
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
            degrees: 15, speed: 90, perTile: 0, amount: 0.1, clip: '',
            period: 30, trigger: 'action', hold: false, effects: []
        };
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    _project() {
        return this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
    }

    show(detailEl) {
        this._detail = detailEl;
        detailEl.innerHTML = `
            <div style="display:flex;flex-direction:row;gap:0;height:100%;min-height:0;">
                <div style="width:220px;flex:0 0 220px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);min-height:0;">
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
                        <div class="r3d-marquee" style="position:absolute;display:none;border:1px dashed var(--color-accent);background:color-mix(in srgb, var(--color-accent) 15%, transparent);pointer-events:none;"></div>
                        <div class="r3d-card" style="position:absolute;right:10px;bottom:10px;width:280px;display:none;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:6px;padding:10px 12px;box-shadow:0 4px 18px rgba(0,0,0,0.35);"></div>
                    </div>
                    <div class="r3d-sim-bar" style="display:flex;gap:6px;align-items:center;padding:6px 8px;border-top:1px solid var(--color-border);flex-wrap:wrap;"></div>
                </div>
                <div style="width:300px;flex:0 0 300px;display:flex;flex-direction:column;border-left:1px solid var(--color-border);min-height:0;">
                    <div style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid var(--color-border);">
                        <span style="font-weight:bold;color:var(--color-text);flex:1;">${this._t('Parts')}</span>
                        <button type="button" class="rr-btn-secondary r3d-part-add">${this._t('Add')}</button>
                        <button type="button" class="rr-btn-secondary r3d-part-delete" style="margin-left:6px;">${this._t('Delete')}</button>
                    </div>
                    <div class="r3d-part-list" style="flex:0 0 auto;max-height:110px;overflow-y:auto;border-bottom:1px solid var(--color-border);"></div>
                    <div class="r3d-part-form" style="flex:0 0 auto;padding:0 10px;border-bottom:1px solid var(--color-border);"></div>
                    <div style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid var(--color-border);">
                        <span style="font-weight:bold;color:var(--color-text);flex:1;">${this._t('Animations')}</span>
                        <button type="button" class="rr-btn-secondary r3d-rule-add">${this._t('Add')}</button>
                        <button type="button" class="rr-btn-secondary r3d-rule-delete" style="margin-left:6px;">${this._t('Delete')}</button>
                    </div>
                    <div class="r3d-rule-list" style="flex:1;overflow-y:auto;min-height:0;"></div>
                    <div class="r3d-rule-note" style="padding:6px 10px;font-size:11px;color:var(--color-text-muted);border-top:1px solid var(--color-border);">${this._t('Adjust this pose with the sliders in the preview.')}</div>
                    <div class="r3d-status" style="padding:4px 10px;font-size:11px;color:var(--color-text-muted);min-height:20px;"></div>
                </div>
            </div>`;
        const search = detailEl.querySelector('.r3d-model-search');
        search.addEventListener('input', () => this.renderModelList(true));
        search.addEventListener('focus', () => {
            search.style.borderColor = 'var(--color-accent-border-strong)';
            search.style.outline = 'none';
        });
        search.addEventListener('blur', () => {
            search.style.borderColor = 'var(--color-border-input)';
        });
        detailEl.querySelector('.r3d-rule-add').addEventListener('click', () => this.addRule());
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
        for (const entry of shown) {
            const row = document.createElement('div');
            row.className = 'database-list-item';
            row.dataset.model = entry.name;
            const icon = document.createElement('span');
            icon.className = 'database-list-icon';
            icon.style.cssText = 'flex:0 0 22px;width:22px;height:22px;margin-right:8px;background-size:contain;background-position:center;background-repeat:no-repeat;border-radius:3px;background-color:var(--color-bg-deep);border:1px solid var(--color-border);';
            const name = document.createElement('span');
            name.className = 'database-list-name';
            name.textContent = entry.name;
            name.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            row.appendChild(icon);
            row.appendChild(name);
            row.addEventListener('click', () => this.selectModel(entry));
            list.appendChild(row);
        }
        this.highlightModel();
        this._fillThumbnails(shown);
        if (!fromSearch) {
            this.selectModel(models.find(m => m.name === this.selectedName) || models[0]);
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
        if (!this._thumbs) this._thumbs = {};
        for (const entry of entries) {
            const cached = this._thumbs[entry.name];
            if (cached) {
                const icon = this._thumbRow(entry.name);
                if (icon) icon.style.backgroundImage = `url("${cached}")`;
                continue;
            }
            const url = await this._renderThumbnail(entry);
            if (!url) continue;
            this._thumbs[entry.name] = url;
            const icon = this._thumbRow(entry.name);
            if (icon) icon.style.backgroundImage = `url("${url}")`;
            // Textures decode after the first draw; one late re-render
            // trades a moment of gray silhouette for the coloured icon.
            setTimeout(async () => {
                const again = await this._renderThumbnail(entry);
                if (!again) return;
                this._thumbs[entry.name] = again;
                const late = this._thumbRow(entry.name);
                if (late) late.style.backgroundImage = `url("${again}")`;
            }, 1600);
        }
    }

    async _renderThumbnail(entry) {
        const template = await this._loadTemplate(entry);
        if (!template || typeof THREE === 'undefined') return null;
        if (!this._thumbRenderer) {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
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
        object.scale.setScalar(1.6 / span);
        this._thumbScene.add(object);
        Reactor3D.aimCamera(this._thumbCamera, { x: -0.5, y: 0.3, z: -0.5 }, { yaw: 35, pitch: 18, distance: 2.6 });
        this._thumbCamera.aspect = 1;
        this._thumbCamera.updateProjectionMatrix();
        this._thumbRenderer.render(this._thumbScene, this._thumbCamera);
        this._thumbScene.remove(object);
        try {
            return this._thumbRenderer.domElement.toDataURL('image/png');
        } catch (error) {
            return null;
        }
    }

    /** Templates cached per model: the preview and the thumbnails share them. */
    async _loadTemplate(entry) {
        if (!this._templates) this._templates = {};
        if (this._templates[entry.name]) return this._templates[entry.name];
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D)
            || (this.projectController.mapEditor3D && this.projectController.mapEditor3D.ensureLibraries
                && await this.projectController.mapEditor3D.ensureLibraries());
        if (!ready) return null;
        const fs = require('fs');
        const path = require('path');
        const project = this._project();
        if (!project || !project.path) return null;
        const file = (entry.file || entry.name) + (entry.ext || '.glb');
        const next = path.join(project.path, '3d', entry.name, 'source', file);
        const filePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
        if (!fs.existsSync(filePath)) return null;
        try {
            const data = fs.readFileSync(filePath);
            const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const baseUrl = 'file://' + path.dirname(filePath).replace(/\\/g, '/') + '/';
            this._templates[entry.name] = Reactor3D.readModel(buffer, entry.ext || '.glb', baseUrl, entry.texture || '');
            return this._templates[entry.name];
        } catch (error) {
            return null;
        }
    }

    rulesPath(name) {
        const path = require('path');
        return path.join(this._project().path, '3d', name || this.selectedName, 'model.json');
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
        this.customParts = Array.isArray(parsed.parts) ? parsed.parts : [];
        this.customPivots = parsed.pivots && typeof parsed.pivots === 'object'
            && !Array.isArray(parsed.pivots) ? parsed.pivots : {};
    }

    /**
     * Merge the authored animations and parts into the sidecar text,
     * preserving any keys other tools may have put there. Pure, so the
     * write path is testable without a project on disk.
     */
    static mergeSidecar(previousText, animations, parts, pivots) {
        let json = {};
        try {
            const parsed = JSON.parse(previousText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed;
        } catch (error) {
            json = {};
        }
        json.animations = animations || [];
        if (parts && parts.length) json.parts = parts;
        else delete json.parts;
        if (pivots && Object.keys(pivots).length) json.pivots = pivots;
        else delete json.pivots;
        return JSON.stringify(json, null, 2) + '\n';
    }

    /** Every edit writes the model's own sidecar; the runtime reads it as-is. */
    saveRules() {
        const fs = require('fs');
        let previous = '';
        try {
            previous = fs.readFileSync(this.rulesPath(), 'utf8');
        } catch (error) {
            previous = '';
        }
        fs.writeFileSync(this.rulesPath(),
            Database3DEditor.mergeSidecar(previous, this.rawAnimations, this.customParts, this.customPivots));
        this.rebuildPlayback();
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = `${this._t('Saved')} — 3d/${this.selectedName}/model.json`;
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
                box.expandByObject(entry.mesh);
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
            else for (const entry of meshes) helper.box.expandByObject(entry.mesh);
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
        this.selectedName = entry.name;
        this.selectedRule = -1;
        this.selectedPart = -1;
        this.selectedPartName = null;
        this._sim.action = null;
        this._selectMode = false;
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
        this.embeddedClips = this._readEmbeddedClips(entry);
        await this._drawPreview(entry);
        this.rebuildPlayback();
        this.renderPartList();
        this.renderPartForm();
        this.renderRuleList();
        this.renderSelectBar();
        this.renderEditCard();
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
    _readEmbeddedClips(entry) {
        if ((entry.ext || '.glb').toLowerCase() !== '.glb' || typeof Reactor3D === 'undefined') return [];
        try {
            const fs = require('fs');
            const path = require('path');
            const project = this._project();
            const file = (entry.file || entry.name) + (entry.ext || '.glb');
            const next = path.join(project.path, '3d', entry.name, 'source', file);
            const filePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
            const data = fs.readFileSync(filePath);
            const parsed = Reactor3D.readGlb(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            return (parsed.json.animations || []).map(clip => clip.name || '');
        } catch (error) {
            return [];
        }
    }

    async _drawPreview(entry) {
        const gen = ++this._gen;
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D)
            || (this.projectController.mapEditor3D && this.projectController.mapEditor3D.ensureLibraries
                && await this.projectController.mapEditor3D.ensureLibraries());
        if (!ready || gen !== this._gen || !canvas.isConnected) return;
        const template = await this._loadTemplate(entry);
        if (!template || gen !== this._gen || !canvas.isConnected) return;
        this._template = template;
        if (!this._renderer) {
            this._scene = new THREE.Scene();
            this._scene.background = new THREE.Color(0x1a1a1e);
            this._camera = Reactor3D.createCamera({ fov: 40 });
            this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            this._renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) this._renderer.outputColorSpace = THREE.SRGBColorSpace;
            let frame = 0;
            const tick = () => {
                if (!this._renderer || !canvas.isConnected) {
                    this._disposePreview();
                    return;
                }
                frame++;
                const rect = canvas.getBoundingClientRect();
                const width = Math.max(1, Math.round(rect.width));
                const height = Math.max(1, Math.round(rect.height));
                if (canvas.width !== width || canvas.height !== height) {
                    this._renderer.setSize(width, height, false);
                    this._camera.aspect = width / height;
                    this._camera.updateProjectionMatrix();
                }
                if (this._sim.action && frame - this._sim.action.frame >= this._sim.action.until) {
                    this._sim.action = null;
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
                if (this._binding && rules.length && !this._selectMode && typeof Reactor3D !== 'undefined') {
                    Reactor3D.applyModelAnimation(this._binding, rules, {
                        frame,
                        moving: this._sim.walking,
                        distance: this._sim.walking ? 1 / 16 : 0,
                        scale: this._scale,
                        action: this._sim.action
                            ? { name: this._sim.action.name, frame: this._sim.action.frame }
                            : null
                    });
                }
                this._simFrame = frame;
                this._updatePreviewFx(frame, rules);
                this._updateHover();
                this._updateBoxes();
                Reactor3D.aimCamera(this._camera, { x: -0.5, y: 0, z: -0.5 }, this._view);
                this._renderer.render(this._scene, this._camera);
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
        if (!this._selectMode && Reactor3D.carveModelParts && Reactor3D.readModelParts) {
            Reactor3D.carveModelParts(object, Reactor3D.readModelParts({ parts: this.customParts }));
            if (Reactor3D.applyPivotOverrides) {
                Reactor3D.applyPivotOverrides(object,
                    Reactor3D.readModelPivots({ pivots: this.customPivots }));
            }
        }
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        this._scale = 1.6 / span;
        object.scale.setScalar(this._scale);
        this._binding = Reactor3D.prepareModelInstance(object, object.__reactorClips);
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
        this._scene.add(object);
        this._refreshHighlight();
        this._refreshSelectionOverlay();
        this._refreshPartVisuals();
        this.renderSimBar();
        this.renderEditCard();
        this._refreshHint();
    }

    _disposePreview() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        if (this._renderer) {
            this._renderer.dispose();
            const gl = this._renderer.getContext && this._renderer.getContext();
            const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        this._renderer = null;
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
                '<circle cx="8" cy="8" r="2.2" fill="none"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" fill="none"/>' }
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
            + 'color:' + (active ? 'var(--color-bg-deep)' : 'var(--color-text)') + ';';
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
        if (this._selectMode) {
            hint.style.display = 'none';
            return;
        }
        if (this._tool === 'pivot') {
            hint.textContent = this._t('Click the model to place the pivot, or drag its axes to slide it.');
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
        let n = this.customParts.length + 1;
        while (this.customParts.some(p => p.name === 'part-' + n)) n++;
        this.customParts.push({ name: 'part-' + n, pivot: null, meshes: {} });
        this.selectedPart = this.customParts.length - 1;
        this.renderPartList();
        this.renderPartForm();
        this.setTool('select');
    }

    deletePart() {
        if (this.selectedPart < 0) return;
        if (this._selectMode) this.cancelSelectMode();
        const removed = this.customParts[this.selectedPart];
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
        if (!this.customParts.length) {
            list.innerHTML = `<div style="padding:6px 10px;color:var(--color-text-muted);font-size:11px;">${this._t('Add a part, then drag a box over the model to choose its triangles.')}</div>`;
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
                + (index === this.selectedPart ? 'background:var(--color-bg-active, #234);' : '');
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
            // Rules aimed at the old name follow the rename.
            for (const raw of this.rawAnimations) {
                if (raw.part === oldName) raw.part = name;
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
                || work.resize.some(v => v !== 1);
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
        this._workRule = Reactor3D.readModelAnimationRules({
            animations: [{ name: '__manual', ...values }]
        })[0];
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
        this._previewRule = Reactor3D.readModelAnimationRules({
            animations: [{ name: '__preview', ...this._workValues('action') }]
        })[0];
        const duration = Reactor3D.modelRuleDuration(
            this._previewRule, this._binding ? this._binding.clips : null);
        this._sim.action = {
            name: '__preview',
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
            period: rule.period,
            trigger: rule.trigger,
            hold: rule.hold,
            effects: JSON.parse(JSON.stringify(raw.effects || []))
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
        const hasParts = (this._binding && this._binding.meshes.length > 0) || this.customParts.length > 0;
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
        const targetOptions = [`<option value=""${this.selectedPartName === '' ? ' selected' : ''}>${this._t('Whole model')}</option>`]
            .concat(this.partNames.map(name =>
                `<option value="${escape(name)}"${name === this.selectedPartName ? ' selected' : ''}>${escape(name)}</option>`));
        if (this.selectedPartName === null) {
            targetOptions.unshift('<option value="__none" selected>—</option>');
        } else if (this.selectedPartName && this.partNames.indexOf(this.selectedPartName) < 0) {
            // A deleted part's animation keeps its target visible, marked,
            // so it can be re-aimed at a living part from right here.
            targetOptions.push(`<option value="${escape(this.selectedPartName)}" selected>${escape(this.selectedPartName)} ?</option>`);
        }
        const header = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <select class="r3d-card-part" style="flex:1;min-width:0;padding:3px 6px;font-weight:bold;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">${targetOptions.join('')}</select>
                <button type="button" class="r3d-card-undo" title="${this._t('Undo')} (Ctrl+Z)" style="${headerButton}">↶</button>
                <button type="button" class="r3d-card-redo" title="${this._t('Redo')} (Ctrl+Y)" style="${headerButton}">↷</button>
                <button type="button" class="r3d-card-close" title="${this._t('Close')}" style="${headerButton}">×</button>
            </div>`;
        if (this.selectedPartName === null) {
            card.innerHTML = header
                + `<div style="font-size:11px;color:var(--color-text-muted);">${this._t('Click a part of the model to pose it.')}</div>`;
            card.querySelector('.r3d-card-part').addEventListener('change', event => {
                if (event.target.value !== '__none') this.selectPartByName(event.target.value);
            });
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
                    color:${tab.id === this._cardTab ? 'var(--color-bg-deep)' : 'var(--color-text)'};font-weight:bold;">${tab.label}</button>`).join('')}
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
            body = row(this._t('Clip'), `<select class="r3d-card-clip" ${selectStyle}>${clipOptions}${stray}</select>`);
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
                    <option value="idle"${work.trigger === 'idle' ? ' selected' : ''}>${this._t('While idle')}</option>
                    <option value="always"${work.trigger === 'always' ? ' selected' : ''}>${this._t('Always')}</option>
                </select>`)
            + (this.selectedPartName ? row(this._t('Pivot'),
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
                    style="width:26px;height:26px;border:1px solid ${this._tool === 'pivot' ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:4px;cursor:pointer;background:${this._tool === 'pivot' ? 'var(--color-accent)' : 'var(--color-bg-surface)'};color:${this._tool === 'pivot' ? 'var(--color-bg-deep)' : 'var(--color-text)'};font-size:13px;line-height:1;">✛</button>`) : '')
            + (work.motion === 'pose' && work.trigger === 'action' ? row(this._t('At the end'),
                `<select class="r3d-card-hold" ${selectStyle}>
                    <option value="return"${work.hold ? '' : ' selected'}>${this._t('Return to rest')}</option>
                    <option value="hold"${work.hold ? ' selected' : ''}>${this._t('Stay posed')}</option>
                </select>`) : '')
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
            </div>`;
    }

    _bindEditCard(card, spec) {
        card.querySelector('.r3d-card-part').addEventListener('change', event => {
            // With work on the card, the dropdown is the animation's Part:
            // it retargets what is being edited, values intact — clicking
            // the viewport is how you switch context instead.
            if (event.target.value === '__none') return;
            this.retargetWork(event.target.value);
        });
        card.querySelector('.r3d-card-close').addEventListener('click', () => {
            this._cardCollapsed = true;
            this.deselectPart();
            this.renderEditCard();
        });
        card.querySelector('.r3d-card-undo').addEventListener('click', () => this.undoPose());
        card.querySelector('.r3d-card-redo').addEventListener('click', () => this.redoPose());
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
        if (this._bgFlash && this._scene && this._scene.background) {
            const flash = this._bgFlash;
            const strength = (flash.color[3] / 255) * Math.max(0, 1 - flash.t / flash.duration);
            this._scene.background.setRGB(
                0.102 + (flash.color[0] / 255 - 0.102) * strength,
                0.102 + (flash.color[1] / 255 - 0.102) * strength,
                0.118 + (flash.color[2] / 255 - 0.118) * strength);
            if (++flash.t > flash.duration) {
                this._bgFlash = null;
                this._scene.background.setHex(0x1a1a1e);
            }
        }
    }

    _fireEffectPreview(effect) {
        if (effect.se) {
            try {
                const path = require('path');
                const url = typeof RRAssetFiles !== 'undefined'
                    ? RRAssetFiles.urlFor(path.join(this._project().path, 'audio', 'se'),
                        effect.se.name, RRAssetFiles.AUDIO_EXTENSIONS)
                    : '';
                if (!url) return;
                const audio = new Audio(url);
                audio.volume = Math.min(1, Math.max(0, (effect.se.volume !== undefined ? effect.se.volume : 90) / 100));
                audio.playbackRate = Math.min(4, Math.max(0.25, (effect.se.pitch !== undefined ? effect.se.pitch : 100) / 100));
                audio.play().catch(() => {});
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
                if (effect.flash) {
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
            const orbit = this._tool === 'orbit' || event.button === 2 || event.ctrlKey;
            lastX = downX = event.clientX;
            lastY = downY = event.clientY;
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
            if (orbit) {
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
            }
            event.preventDefault();
        });
        canvas.addEventListener('pointermove', event => {
            this._pointer = { x: event.clientX, y: event.clientY };
        });
        window.addEventListener('pointermove', event => {
            if (!mode) return;
            if (mode === 'orbit') {
                this._view.yaw -= (event.clientX - lastX) * 0.4;
                this._view.pitch = Math.min(72, Math.max(5, this._view.pitch - (event.clientY - lastY) * 0.3));
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
            } else if (mode === 'pivot' && stationary) {
                this._placePivot(event);
            } else if (mode === 'orbit' && stationary && event.button !== 2 && this._tool === 'orbit') {
                this._pickPart(event);
            }
            mode = null;
            canvas.style.cursor = this._tool === 'orbit' ? 'grab' : 'crosshair';
        });
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            this._view.distance = Math.min(20, Math.max(1.2, this._view.distance * (event.deltaY > 0 ? 1.1 : 1 / 1.1)));
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
        return raycaster.intersectObject(this._object, true);
    }

    /** The nearest hit that belongs to a poseable part, by its part name. */
    _partUnderPointer(clientX, clientY) {
        const hits = this._raycastPointer(clientX, clientY) || [];
        for (const hit of hits) {
            const parts = hit.object.userData && hit.object.userData.parts;
            if (parts && parts.length) return { name: parts[0].name, hit };
        }
        return null;
    }

    _pickPart(event) {
        const found = this._partUnderPointer(event.clientX, event.clientY);
        if (found) {
            this.selectPartByName(found.name);
        } else if (this.selectedPartName !== null) {
            this.deselectPart();
        }
    }

    /** Hover highlight: run from the frame loop, throttled by time. */
    _updateHover() {
        if (this._selectMode || this._tool !== 'orbit' || !this._pointer || !this._object) return;
        const now = Date.now();
        if (this._hoverAt && now - this._hoverAt < 90) return;
        this._hoverAt = now;
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
        const canvas = this._detail.querySelector('.r3d-db-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        const normal = new THREE.Vector3();
        this._camera.getWorldDirection(normal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            normal, this._pivotMarker.position);
        const point = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, point) ? point : null;
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
            this.renderSimBar();
        });
        bar.appendChild(walk);
        this.playRules.forEach((rule, index) => {
            if (rule.trigger !== 'action') return;
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
            : raw.trigger === 'action' ? this._t('On demand') : this._t('Always');
        const subject = type === 'clip' ? (raw.clip || '?') : (raw.part || this._t('Whole model'));
        return `${raw.name || '?'} — ${label} · ${subject} · ${trigger}`;
    }

    renderRuleList() {
        const list = this._detail.querySelector('.r3d-rule-list');
        list.innerHTML = '';
        this.rawAnimations.forEach((raw, index) => {
            const row = document.createElement('div');
            row.textContent = this.ruleSummary(raw);
            row.style.cssText = 'padding:4px 10px;cursor:pointer;font-size:12px;color:var(--color-text);'
                + (index === this.selectedRule ? 'background:var(--color-bg-active, #234);' : '');
            row.addEventListener('click', () => {
                this.selectedRule = index;
                this.renderRuleList();
                this._refreshHighlight();
                // Any animation opens straight into the card that edits it.
                this.editRule(index);
            });
            list.appendChild(row);
        });
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
        if (this.selectedRule < 0) return;
        if (this._editingRule === this.selectedRule) {
            this.deselectPart();
        } else if (this._editingRule > this.selectedRule) {
            this._editingRule--;
        }
        // Remembered work points at rules by index; keep it pointing.
        for (const snapshot of Object.values(this._poses)) {
            if (snapshot.editingRule === this.selectedRule) snapshot.editingRule = -1;
            else if (snapshot.editingRule > this.selectedRule) snapshot.editingRule--;
        }
        this.rawAnimations.splice(this.selectedRule, 1);
        this.selectedRule = Math.min(this.selectedRule, this.rawAnimations.length - 1);
        this.saveRules();
        this.renderRuleList();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Database3DEditor;
}
