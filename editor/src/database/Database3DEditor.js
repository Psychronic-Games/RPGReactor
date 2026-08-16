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
                <div style="width:200px;flex:0 0 200px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);min-height:0;">
                    <div style="padding:6px 10px;font-weight:bold;color:var(--color-text);border-bottom:1px solid var(--color-border);">${this._t('Models')}</div>
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

    renderModelList() {
        const list = this._detail.querySelector('.r3d-model-list');
        list.innerHTML = '';
        const models = this.listModels();
        if (!models.length) {
            list.innerHTML = `<div style="padding:10px;color:var(--color-text-muted);font-size:12px;">${this._t('No models in this project')}</div>`;
            return;
        }
        for (const entry of models) {
            const row = document.createElement('div');
            row.textContent = entry.name;
            row.dataset.model = entry.name;
            row.style.cssText = 'padding:5px 10px;cursor:pointer;color:var(--color-text);font-size:12px;';
            row.addEventListener('click', () => this.selectModel(entry));
            list.appendChild(row);
        }
        this.selectModel(models.find(m => m.name === this.selectedName) || models[0]);
    }

    highlightModel() {
        this._detail.querySelectorAll('.r3d-model-list > div').forEach(row => {
            row.style.background = row.dataset.model === this.selectedName ? 'var(--color-bg-active, #2a4)' : '';
        });
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
        this.renderSimBar();
    }

    async selectModel(entry) {
        if (!entry) return;
        this.selectedName = entry.name;
        this.selectedRule = -1;
        this._sim.action = null;
        this.highlightModel();
        this.rawAnimations = this.loadRawAnimations();
        await this._drawPreview(entry);
        this.rebuildPlayback();
        this.renderRuleList();
        this.renderRuleForm();
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
            const data = fs.readFileSync(filePath);
            const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const baseUrl = 'file://' + path.dirname(filePath).replace(/\\/g, '/') + '/';
            const template = Reactor3D.readModel(buffer, entry.ext || '.glb', baseUrl, entry.texture || '');
            if (gen !== this._gen || !canvas.isConnected) return;
            const object = template.clone(true);
            object.userData.glbSize = template.userData.glbSize;
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            this._scale = 1.6 / span;
            object.scale.setScalar(this._scale);
            this._binding = Reactor3D.prepareModelInstance(object);
            this.partNames = [];
            const seen = new Set();
            for (const meshEntry of this._binding.meshes) {
                for (const part of meshEntry.parts) {
                    if (seen.has(part.name)) continue;
                    seen.add(part.name);
                    this.partNames.push(part.name);
                }
            }
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
                    until: Reactor3D.modelRuleDuration(rule)
                };
            });
            bar.appendChild(play);
        }
    }

    ruleSummary(raw) {
        const type = raw.type === 'swing' || raw.type === 'bob' ? raw.type : 'spin';
        const label = type === 'swing' ? this._t('Swing') : type === 'bob' ? this._t('Bob') : this._t('Spin');
        return `${raw.name || '?'} — ${label} · ${raw.part || this._t('Whole model')}`;
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
            type: 'spin',
            axis: 'y',
            trigger: 'always',
            speed: 90
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
        const type = raw.type === 'swing' || raw.type === 'bob' ? raw.type : 'spin';
        const field = (label, control) => `
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px;color:var(--color-text);">
                <span style="flex:0 0 130px;">${label}</span>${control}
            </label>`;
        const input = 'style="flex:1;min-width:0;padding:3px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);"';
        const options = (pairs, current) => pairs
            .map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`)
            .join('');
        const partOptions = [['', this._t('Whole model')]]
            .concat(this.partNames.map(name => [name, name]));
        let params = '';
        if (type === 'spin') {
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
            `<select class="r3d-f" data-key="part" ${input}>${options(partOptions, raw.part || '')}</select>`)
            + field(this._t('Type'),
            `<select class="r3d-f" data-key="type" ${input}>${options([
                ['spin', this._t('Spin')], ['swing', this._t('Swing')], ['bob', this._t('Bob')]
            ], type)}</select>`)
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
        form.querySelectorAll('.r3d-f').forEach(control => {
            control.addEventListener('change', () => {
                const key = control.dataset.key;
                const value = control.type === 'number' ? Number(control.value) : control.value;
                if (control.type === 'number' && !Number.isFinite(value)) return;
                raw[key] = value;
                this.saveRules();
                this.renderRuleList();
                if (key === 'type' || key === 'trigger') this.renderRuleForm();
            });
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Database3DEditor;
}
