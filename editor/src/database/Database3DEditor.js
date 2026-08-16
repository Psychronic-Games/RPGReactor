/**
 * Database section for 3D models: every model folder under 3d/ is listed,
 * its named parts are discovered from the mesh, and animation rules are
 * authored here — written to the model's own `3d/<name>/model.json`, the
 * sidecar the runtime plays. The preview runs the rules live, with the
 * same engine code the game uses.
 */
class Database3DEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.selectedName = '';
        this.rawAnimations = [];
        this.playRules = [];
        this.partNames = [];
        this.selectedRule = -1;
        this._view = { yaw: 30, pitch: 20, distance: 4 };
        this._sim = { walking: false, action: null };
        this._gen = 0;
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
                    <canvas class="r3d-db-canvas" style="display:block;width:100%;flex:1;min-height:0;cursor:grab;"></canvas>
                    <div class="r3d-sim-bar" style="display:flex;gap:6px;align-items:center;padding:6px 8px;border-top:1px solid var(--color-border);flex-wrap:wrap;"></div>
                </div>
                <div style="width:340px;flex:0 0 340px;display:flex;flex-direction:column;border-left:1px solid var(--color-border);min-height:0;">
                    <div style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid var(--color-border);">
                        <span style="font-weight:bold;color:var(--color-text);flex:1;">${this._t('Animations')}</span>
                        <button type="button" class="rr-btn-secondary r3d-rule-add">${this._t('Add')}</button>
                        <button type="button" class="rr-btn-secondary r3d-rule-delete" style="margin-left:6px;">${this._t('Delete')}</button>
                    </div>
                    <div class="r3d-rule-list" style="flex:0 0 auto;max-height:38%;overflow-y:auto;border-bottom:1px solid var(--color-border);"></div>
                    <div class="r3d-rule-form" style="flex:1;overflow-y:auto;padding:8px 10px;min-height:0;"></div>
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
        this._bindPreviewInput(detailEl.querySelector('.r3d-db-canvas'));
        this.renderModelList();
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

    loadRawAnimations() {
        const fs = require('fs');
        try {
            const parsed = JSON.parse(fs.readFileSync(this.rulesPath(), 'utf8'));
            return Array.isArray(parsed.animations) ? parsed.animations : [];
        } catch (error) {
            return [];
        }
    }

    /** Every edit writes the model's own sidecar; the runtime reads it as-is. */
    saveRules() {
        const fs = require('fs');
        fs.writeFileSync(this.rulesPath(), JSON.stringify({ animations: this.rawAnimations }, null, 2) + '\n');
        this.rebuildPlayback();
        const status = this._detail.querySelector('.r3d-status');
        if (status) status.textContent = `${this._t('Saved')} — 3d/${this.selectedName}/model.json`;
    }

    rebuildPlayback() {
        this.playRules = typeof Reactor3D !== 'undefined'
            ? Reactor3D.readModelAnimationRules({ animations: this.rawAnimations })
            : [];
        if (this._binding) this._binding.angles = {};
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
        this._scene.add(this._highlight);
    }

    async selectModel(entry) {
        if (!entry) return;
        this.selectedName = entry.name;
        this.selectedRule = -1;
        this._sim.action = null;
        if (this._highlight && this._scene) {
            this._scene.remove(this._highlight);
            this._highlight = null;
        }
        this.highlightModel();
        this.rawAnimations = this.loadRawAnimations();
        this.embeddedClips = this._readEmbeddedClips(entry);
        await this._drawPreview(entry);
        this.rebuildPlayback();
        this.renderRuleList();
        this.renderRuleForm();
        const status = this._detail.querySelector('.r3d-status');
        if (status) {
            status.textContent = this.embeddedClips.length
                ? `${this._t('Embedded clips')}: ${this.embeddedClips.length}`
                : '';
        }
    }

    /**
     * Clip names baked into a GLB's animation block. The engine cannot play
     * skinned clips yet, but the section says they are there.
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
        const fs = require('fs');
        const path = require('path');
        const project = this._project();
        const file = (entry.file || entry.name) + (entry.ext || '.glb');
        const next = path.join(project.path, '3d', entry.name, 'source', file);
        const filePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
        if (!fs.existsSync(filePath)) return;
        try {
            const template = await this._loadTemplate(entry);
            if (!template || gen !== this._gen || !canvas.isConnected) return;
            const object = Reactor3D.cloneModelTemplate
                ? Reactor3D.cloneModelTemplate(template)
                : template.clone(true);
            object.userData.glbSize = template.userData.glbSize;
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
                    if (this._binding && this.playRules.length && typeof Reactor3D !== 'undefined') {
                        if (this._sim.action && frame - this._sim.action.frame >= this._sim.action.until) {
                            this._sim.action = null;
                        }
                        Reactor3D.applyModelAnimation(this._binding, this.playRules, {
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
                    Reactor3D.aimCamera(this._camera, { x: -0.5, y: 0, z: -0.5 }, this._view);
                    this._renderer.render(this._scene, this._camera);
                    this._raf = requestAnimationFrame(tick);
                };
                this._raf = requestAnimationFrame(tick);
            }
            if (this._object && this._object.parent) this._object.parent.remove(this._object);
            this._object = object;
            this._scene.add(object);
        } catch (error) {
            console.error('Database3DEditor preview failed.', error);
        }
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

    _bindPreviewInput(canvas) {
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        canvas.addEventListener('pointerdown', e => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        });
        window.addEventListener('pointermove', e => {
            if (!dragging) return;
            this._view.yaw -= (e.clientX - lastX) * 0.4;
            this._view.pitch = Math.min(72, Math.max(5, this._view.pitch - (e.clientY - lastY) * 0.3));
            lastX = e.clientX;
            lastY = e.clientY;
        });
        window.addEventListener('pointerup', () => {
            dragging = false;
            canvas.style.cursor = 'grab';
        });
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this._view.distance = Math.min(20, Math.max(1.2, this._view.distance * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
        }, { passive: false });
    }

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
        for (const rule of this.playRules) {
            if (rule.trigger !== 'action') continue;
            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'rr-btn-secondary';
            play.textContent = `${this._t('Play')}: ${rule.name}`;
            play.addEventListener('click', () => {
                this._sim.action = {
                    name: rule.name,
                    frame: this._simFrame || 0,
                    until: Reactor3D.modelRuleDuration(rule, this._binding ? this._binding.clips : null)
                };
            });
            bar.appendChild(play);
        }
    }

    ruleSummary(raw) {
        const type = raw.type === 'swing' || raw.type === 'bob' || raw.type === 'clip'
            ? raw.type : 'spin';
        const label = type === 'clip' ? this._t('Clip')
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
                this.renderRuleForm();
            });
            list.appendChild(row);
        });
    }

    addRule() {
        this.rawAnimations.push({
            name: 'animation-' + (this.rawAnimations.length + 1),
            part: '',
            type: 'swing',
            axis: 'z',
            trigger: 'always',
            degrees: 4,
            period: 120
        });
        this.selectedRule = this.rawAnimations.length - 1;
        this.saveRules();
        this.renderRuleList();
        this.renderRuleForm();
    }

    deleteRule() {
        if (this.selectedRule < 0) return;
        this.rawAnimations.splice(this.selectedRule, 1);
        this.selectedRule = Math.min(this.selectedRule, this.rawAnimations.length - 1);
        this.saveRules();
        this.renderRuleList();
        this.renderRuleForm();
    }

    renderRuleForm() {
        const form = this._detail.querySelector('.r3d-rule-form');
        const raw = this.rawAnimations[this.selectedRule];
        if (!raw) {
            form.innerHTML = '';
            return;
        }
        const type = raw.type === 'swing' || raw.type === 'bob' || raw.type === 'clip'
            ? raw.type : 'spin';
        const field = (label, control) => `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px;color:var(--color-text);">
                <span style="flex:0 0 130px;">${label}</span>${control}
            </label>`;
        const input = 'style="flex:1;min-width:0;padding:3px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);"';
        const options = (pairs, current) => pairs
            .map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`)
            .join('');
        const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const partChoice = current => {
            const option = (value, label) =>
                `<option value="${escape(value)}"${value === current ? ' selected' : ''}>${escape(label)}</option>`;
            let out = option('', this._t('Whole model'));
            if (this.partFamilies && this.partFamilies.length) {
                out += `<optgroup label="${escape(this._t('Groups'))}">`
                    + this.partFamilies.map(f => option(f.name, `${f.name} (${f.count})`)).join('')
                    + '</optgroup>';
            }
            if (this.partNames.length) {
                out += `<optgroup label="${escape(this._t('Parts'))}">`
                    + this.partNames.map(name => option(name, name)).join('')
                    + '</optgroup>';
            }
            // A saved part that no longer resolves still shows, marked.
            if (current && this.partNames.indexOf(current) < 0
                && !(this.partFamilies || []).some(f => f.name === current)) {
                out += option(current, current + ' ?');
            }
            return out;
        };
        let params = '';
        if (type === 'clip') {
            const clips = this.embeddedClips || [];
            const clipOptions = clips.map(name =>
                `<option value="${escape(name)}"${name === raw.clip ? ' selected' : ''}>${escape(name)}</option>`).join('');
            const stray = raw.clip && clips.indexOf(raw.clip) < 0
                ? `<option value="${escape(raw.clip)}" selected>${escape(raw.clip)} ?</option>` : '';
            params = field(this._t('Clip'),
                `<select class="r3d-f" data-key="clip" ${input}>${clipOptions}${stray}</select>`);
        } else if (type === 'spin') {
            params = field(this._t('Speed (degrees per second)'),
                `<input type="number" class="r3d-f" data-key="speed" value="${Number(raw.speed) || 90}" ${input}>`)
                + field(this._t('Degrees per tile travelled'),
                `<input type="number" class="r3d-f" data-key="perTile" value="${Number(raw.perTile) || 0}" ${input}>`);
        } else if (type === 'swing') {
            params = field(this._t('Degrees'),
                `<input type="number" class="r3d-f" data-key="degrees" value="${Number(raw.degrees) || 15}" ${input}>`)
                + field(this._t('Period (frames)'),
                `<input type="number" class="r3d-f" data-key="period" value="${Number(raw.period) || 60}" ${input}>`)
                + field(this._t('Cycles'),
                `<input type="number" class="r3d-f" data-key="cycles" value="${Number(raw.cycles) || 1}" ${input}>`);
        } else {
            params = field(this._t('Amount (tiles)'),
                `<input type="number" step="0.01" class="r3d-f" data-key="amount" value="${Number(raw.amount) || 0.1}" ${input}>`)
                + field(this._t('Period (frames)'),
                `<input type="number" class="r3d-f" data-key="period" value="${Number(raw.period) || 60}" ${input}>`);
        }
        form.innerHTML = field(this._t('Name'),
            `<input type="text" class="r3d-f" data-key="name" value="${(raw.name || '').replace(/"/g, '&quot;')}" ${input}>`)
            + field(this._t('Part'),
            `<select class="r3d-f" data-key="part" ${input}>${partChoice(raw.part || '')}</select>`)
            + `<div class="r3d-match-count" style="margin:-3px 0 7px 138px;font-size:11px;color:var(--color-text-muted);"></div>`
            + field(this._t('Type'),
            `<select class="r3d-f" data-key="type" ${input}>${options([
                ['spin', this._t('Spin')], ['swing', this._t('Swing')], ['bob', this._t('Bob')]
            ].concat((this.embeddedClips || []).length || type === 'clip'
                ? [['clip', this._t('Clip')]] : []), type)}</select>`)
            + field(this._t('Axis'),
            `<select class="r3d-f" data-key="axis" ${input}>${options([
                ['x', 'X'], ['y', 'Y'], ['z', 'Z']
            ], raw.axis === 'x' || raw.axis === 'z' ? raw.axis : 'y')}</select>`)
            + field(this._t('Trigger'),
            `<select class="r3d-f" data-key="trigger" ${input}>${options([
                ['always', this._t('Always')], ['idle', this._t('While idle')],
                ['moving', this._t('While moving')], ['action', this._t('On demand')]
            ], ['idle', 'moving', 'action'].indexOf(raw.trigger) >= 0 ? raw.trigger : 'always')}</select>`)
            + params;
        const matchCount = () => {
            const line = form.querySelector('.r3d-match-count');
            if (!line) return;
            const n = raw.part ? this._matchedMeshes(raw.part).length : (this._binding ? 1 : 0);
            line.textContent = `${this._t('Affected parts')}: ${raw.part ? n : this._t('Whole model')}`;
        };
        matchCount();
        this._refreshHighlight();
        form.querySelectorAll('.r3d-f').forEach(control => {
            control.addEventListener('change', () => {
                const key = control.dataset.key;
                const value = control.type === 'number' ? Number(control.value) : control.value;
                if (control.type === 'number' && !Number.isFinite(value)) return;
                raw[key] = value;
                if (key === 'type' && value === 'clip' && !raw.clip && (this.embeddedClips || []).length) {
                    raw.clip = this.embeddedClips[0];
                }
                this.saveRules();
                this.renderRuleList();
                matchCount();
                if (key === 'type' || key === 'trigger') this.renderRuleForm();
            });
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Database3DEditor;
}
