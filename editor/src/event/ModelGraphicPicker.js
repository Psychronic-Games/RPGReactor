/**
 * Picker for event models under 3d/<folder>/source.
 * The list is folder names; the first supported file in source/ is the mesh.
 */
class ModelGraphicPicker {
    static EXTS = ['.glb', '.obj', '.fbx', '.stl', '.usdz', '.3mf', '.dxf', '.blend'];

    constructor(projectController) {
        this.projectController = projectController;
        this.currentProject = projectController.getCurrentProject
            ? projectController.getCurrentProject()
            : projectController.currentProject;
        this.onSelect = null;
        this.selectedName = '';
        this.selectedFile = '';
        this.selectedExt = '';
        this.selectedYaw = 0;
        this.selectedPitch = 0;
        this.selectedRoll = 0;
        this.selectedSize = 2;
        this.selectedFaces = {};
        this._placingFace = '';
        this._view = { yaw: 25, pitch: 22, distance: 4 };
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    static listModels(projectPath) {
        if (!projectPath) return [];
        const fs = require('fs');
        const path = require('path');
        const found = [];
        const seen = new Set();
        const pickFrom = (dir, folderName) => {
            if (!fs.existsSync(dir) || typeof RRAssetFiles === 'undefined') return;
            // anyCase: a model file keeps whatever extension case it shipped
            // with (Plant_001.OBJ), and the sidecar records the real name.
            const files = RRAssetFiles.list(dir, ModelGraphicPicker.EXTS, { anyCase: true });
            if (!files.length) return;
            const match = files.find(file => file.name === folderName) || files[0];
            if (seen.has(folderName)) return;
            seen.add(folderName);
            found.push({
                name: folderName, file: match.name,
                ext: match.sourceExtension || match.extension
            });
        };
        const root = path.join(projectPath, '3d');
        if (!fs.existsSync(root)) return found;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === 'source' || entry.name === 'textures') continue;
            pickFrom(path.join(root, entry.name, 'source'), entry.name);
        }
        pickFrom(path.join(root, 'source'), '');
        return found.filter(entry => entry.name);
    }

    show(current, callback) {
        this.onSelect = callback;
        this.selectedName = (current && current.name) || '';
        this.selectedFile = (current && current.file) || '';
        this.selectedExt = (current && current.ext) || '';
        this.selectedYaw = Number(current && current.yaw) || 0;
        this.selectedPitch = Number(current && current.pitch) || 0;
        this.selectedRoll = Number(current && current.roll) || 0;
        this.selectedSize = Number(current && current.size) > 0 ? Number(current.size) : 2;
        this.selectedFaces = Object.assign({}, (current && current.faces) || {});
        this._placingFace = '';

        const modal = document.createElement('div');
        modal.id = 'model-picker-modal';
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '20000';

        const content = document.createElement('div');
        content.className = 'rr-modal';
        content.style.cssText = 'width:min(920px,94vw);height:min(580px,88vh);display:flex;flex-direction:column;';
        content.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${this._t('3D Model')}</div>
                <button type="button" class="rr-modal-close model-picker-cancel">&times;</button>
            </div>
            <div class="rr-modal-body" style="flex:1;min-height:0;display:flex;flex-direction:row;overflow:hidden;padding:0;gap:0;">
                <div class="model-file-list" style="width:260px;flex:0 0 260px;min-height:0;overflow:hidden;border-right:1px solid var(--color-border);"></div>
                <div style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--color-bg-deep);">
                    <div class="model-preview-host" style="position:relative;flex:1;min-height:0;">
                        <canvas class="model-preview-canvas"
                            style="display:block;width:100%;height:100%;cursor:grab;"></canvas>
                        <div class="model-preview-message" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:13px;pointer-events:none;"></div>
                        <div style="position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;">
                            <canvas class="model-gizmo-canvas" width="84" height="84"
                                style="width:84px;height:84px;background:rgba(0,0,0,0.35);border:1px solid var(--color-border);border-radius:4px;"></canvas>
                            <div style="display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,0.35);padding:6px 8px;border-radius:4px;">
                                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-text);">
                                    ${this._t('This side is')}
                                    <button type="button" class="rr-btn-secondary model-face-btn" data-face="front">${this._t('Front')}</button>
                                    <button type="button" class="rr-btn-secondary model-face-btn" data-face="back">${this._t('Back')}</button>
                                    <button type="button" class="rr-btn-secondary model-face-btn" data-face="left">${this._t('Left')}</button>
                                    <button type="button" class="rr-btn-secondary model-face-btn" data-face="right">${this._t('Right')}</button>
                                </div>
                                <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                                    X <input type="number" class="model-angle-x" step="1" value="${Math.round(this.selectedPitch)}"
                                        style="width:64px;padding:3px 5px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                                    Y <input type="number" class="model-angle-y" step="1" value="${Math.round(this.selectedYaw)}"
                                        style="width:64px;padding:3px 5px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                                    Z <input type="number" class="model-angle-z" step="1" value="${Math.round(this.selectedRoll)}"
                                        style="width:64px;padding:3px 5px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                                    ${this._t('Model size (tiles)')}
                                    <input type="number" class="model-size-input" min="0.25" max="32" step="0.25"
                                        value="${this.selectedSize}"
                                        style="width:64px;padding:3px 5px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="rr-modal-footer">
                <button type="button" class="rr-button-danger model-picker-cancel">${this._t('Cancel')}</button>
                <button type="button" class="rr-button-primary model-picker-ok">${this._t('OK')}</button>
            </div>
        `;
        modal.appendChild(content);
        document.body.appendChild(modal);

        this._modal = modal;
        this._bindPreviewInput();
        this._initGizmo();
        this._refreshFaceButtons();
        this._loadFiles();

        content.querySelector('.model-size-input').addEventListener('input', e => {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value > 0) this.selectedSize = value;
        });
        content.querySelectorAll('.model-face-btn').forEach(btn => {
            btn.addEventListener('click', () => this._beginPlaceFace(btn.dataset.face));
        });
        const bindAngle = (selector, key) => {
            const input = content.querySelector(selector);
            if (!input) return;
            input.addEventListener('input', () => {
                const value = Number(input.value);
                if (!Number.isFinite(value)) return;
                this[key] = this._wrapAngle(value);
                this._applyModelRotation();
                if (this._gizmo) this._gizmo.setRotation(this.selectedPitch, this.selectedYaw, this.selectedRoll);
            });
        };
        bindAngle('.model-angle-x', 'selectedPitch');
        bindAngle('.model-angle-y', 'selectedYaw');
        bindAngle('.model-angle-z', 'selectedRoll');
        content.querySelectorAll('.model-picker-cancel').forEach(btn => {
            btn.addEventListener('click', () => this._close());
        });
        content.querySelector('.model-picker-ok').addEventListener('click', () => {
            if (this.onSelect) {
                this.onSelect(this.selectedName
                    ? {
                        name: this.selectedName,
                        file: this.selectedFile || this.selectedName,
                        ext: this.selectedExt,
                        size: this.selectedSize,
                        scale: 1,
                        yaw: this.selectedYaw,
                        pitch: this.selectedPitch,
                        roll: this.selectedRoll,
                        faces: Object.assign({}, this.selectedFaces)
                    }
                    : null);
            }
            this._close();
        });
        modal.addEventListener('click', e => {
            if (e.target === modal) this._close();
        });
    }

    _close() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        if (this._orbitCleanup) this._orbitCleanup();
        this._orbitCleanup = null;
        if (this._gizmo) this._gizmo.dispose();
        this._gizmo = null;
        this._disposePreview();
        if (this._modal && this._modal.parentNode) this._modal.parentNode.removeChild(this._modal);
        this._modal = null;
    }

    _loadFiles() {
        const list = this._modal.querySelector('.model-file-list');
        const projectPath = this.currentProject && this.currentProject.path;
        const files = ModelGraphicPicker.listModels(projectPath);
        const labels = files.map(file => file.name);
        list.innerHTML = '';
        if (typeof RRPickerIndex === 'undefined') {
            list.textContent = this._t('None');
            return;
        }
        const browser = RRPickerIndex.createBrowser({
            files: labels,
            selectedName: this.selectedName,
            itemClass: 'model-file-item',
            searchPlaceholder: this._t('Search files...'),
            emptyText: this._t('None'),
            onSelect: label => {
                const file = files.find(entry => entry.name === label);
                if (!file) return;
                if (this.selectedName !== file.name) this.selectedFaces = {};
                this.selectedName = file.name;
                this.selectedFile = file.file;
                this.selectedExt = file.ext;
                this._placingFace = '';
                this._refreshFaceButtons();
                this._refreshCursor();
                this._drawPreview();
            }
        });
        browser.element.style.height = 'auto';
        browser.element.style.flex = '1 1 0';
        browser.element.style.minHeight = '0';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.appendChild(browser.element);
        const current = files.find(entry => entry.name === this.selectedName);
        if (current) {
            this.selectedFile = current.file;
            this.selectedExt = current.ext;
            browser.scrollTo(this.selectedName);
        }
        this._drawPreview();
    }

    _modelPath() {
        const projectPath = this.currentProject && this.currentProject.path;
        if (!projectPath || !this.selectedName) return '';
        const path = require('path');
        const fs = require('fs');
        const source = (this.selectedFile || this.selectedName) + this.selectedExt;
        const next = path.join(projectPath, '3d', this.selectedName, 'source', source);
        if (fs.existsSync(next)) return next;
        return path.join(projectPath, '3d', 'source', source);
    }

    async _ensureThree() {
        if (typeof window !== 'undefined' && window.THREE && window.Reactor3D) return true;
        const map3d = this.projectController && this.projectController.mapEditor3D;
        if (map3d && map3d.ensureLibraries) return map3d.ensureLibraries();
        return false;
    }

    _wrapAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    _bindPreviewInput() {
        const canvas = this._modal.querySelector('.model-preview-canvas');
        let dragging = false;
        let orbit = false;
        let lastX = 0;
        let lastY = 0;
        let startX = 0;
        let startY = 0;
        const down = e => {
            dragging = true;
            orbit = e.button === 2 || e.shiftKey;
            lastX = startX = e.clientX;
            lastY = startY = e.clientY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        };
        const move = e => {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            if (orbit) {
                this._view.yaw -= dx * 0.4;
                this._view.pitch = Math.min(72, Math.max(5, this._view.pitch - dy * 0.3));
                this._applyCamera();
                return;
            }
            this._nudgeRotation(dx, dy);
        };
        const up = e => {
            const placed = this._placingFace
                && !orbit
                && Math.hypot(e.clientX - startX, e.clientY - startY) < 5;
            dragging = false;
            this._refreshCursor();
            if (placed) this._placeFaceAt(e);
        };
        const wheel = e => {
            e.preventDefault();
            this._view.distance = Math.min(20, Math.max(1.2, this._view.distance * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
            this._applyCamera();
        };
        const menu = e => e.preventDefault();
        canvas.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        canvas.addEventListener('wheel', wheel, { passive: false });
        canvas.addEventListener('contextmenu', menu);
        this._orbitCleanup = () => {
            canvas.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            canvas.removeEventListener('wheel', wheel);
            canvas.removeEventListener('contextmenu', menu);
        };
    }

    _nudgeRotation(dx, dy, roll = 0) {
        if (this._object && this._camera && typeof THREE !== 'undefined') {
            const q = this._object.quaternion.clone();
            const cam = this._camera.quaternion;
            const yawAxis = new THREE.Vector3(0, 1, 0);
            const pitchAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(cam);
            const rollAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(cam);
            q.premultiply(new THREE.Quaternion().setFromAxisAngle(yawAxis, dx * 0.01));
            q.premultiply(new THREE.Quaternion().setFromAxisAngle(pitchAxis, dy * 0.01));
            if (roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(rollAxis, roll * 0.01));
            this._object.quaternion.copy(q);
            this._object.rotation.setFromQuaternion(q, 'YXZ');
            this.selectedPitch = this._wrapAngle(this._object.rotation.x * 180 / Math.PI);
            this.selectedYaw = this._wrapAngle(this._object.rotation.y * 180 / Math.PI);
            this.selectedRoll = this._wrapAngle(this._object.rotation.z * 180 / Math.PI);
        } else {
            this.selectedYaw = this._wrapAngle(this.selectedYaw + dx * 0.5);
            this.selectedPitch = this._wrapAngle(this.selectedPitch + dy * 0.5);
            this.selectedRoll = this._wrapAngle(this.selectedRoll + roll * 0.5);
            this._applyModelRotation();
        }
        if (this._gizmo) this._gizmo.setRotation(this.selectedPitch, this.selectedYaw, this.selectedRoll);
        this._syncAngleInputs();
    }

    _syncAngleInputs() {
        const set = (selector, value) => {
            const input = this._modal && this._modal.querySelector(selector);
            if (input && document.activeElement !== input) input.value = String(Math.round(value));
        };
        set('.model-angle-x', this.selectedPitch);
        set('.model-angle-y', this.selectedYaw);
        set('.model-angle-z', this.selectedRoll);
    }

    _faceColors() {
        return { front: 0x3ddc84, back: 0xff5c5c, left: 0x5ca8ff, right: 0xffd15c };
    }

    _beginPlaceFace(face) {
        this._placingFace = this._placingFace === face ? '' : face;
        this._refreshFaceButtons();
        this._refreshCursor();
    }

    _refreshCursor() {
        const canvas = this._modal && this._modal.querySelector('.model-preview-canvas');
        if (canvas) canvas.style.cursor = this._placingFace ? 'crosshair' : 'grab';
    }

    _refreshFaceButtons() {
        if (!this._modal) return;
        this._modal.querySelectorAll('.model-face-btn').forEach(btn => {
            const face = btn.dataset.face;
            const placed = !!(this.selectedFaces && this.selectedFaces[face]);
            btn.className = this._placingFace === face
                ? 'rr-button-primary model-face-btn'
                : 'rr-btn-secondary model-face-btn';
            btn.style.outline = placed ? '1px solid ' + (face === 'front' ? '#3ddc84' : face === 'back' ? '#ff5c5c' : face === 'left' ? '#5ca8ff' : '#ffd15c') : '';
        });
    }

    _placeFaceAt(event) {
        if (!this._placingFace || !this._object || !this._camera || typeof THREE === 'undefined') return;
        const canvas = this._modal.querySelector('.model-preview-canvas');
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this._camera);
        const targets = [];
        this._object.traverse(child => {
            if (child.isMesh && !child.userData.faceMarker) targets.push(child);
        });
        const hit = raycaster.intersectObjects(targets, false)[0];
        if (!hit) return;
        const point = hit.point.clone();
        if (hit.face && hit.face.normal) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            point.add(normal.multiplyScalar(0.035));
        }
        const local = this._object.worldToLocal(point);
        this.selectedFaces[this._placingFace] = [local.x, local.y, local.z];
        this._placingFace = '';
        this._rebuildFaceMarkers();
        this._refreshFaceButtons();
        this._refreshCursor();
    }

    _rebuildFaceMarkers() {
        if (!this._object || typeof THREE === 'undefined') return;
        const remove = [];
        this._object.traverse(child => {
            if (child.userData.faceMarker) remove.push(child);
        });
        for (const marker of remove) {
            if (marker.parent) marker.parent.remove(marker);
        }
        const colors = this._faceColors();
        const names = Object.keys(this.selectedFaces || {});
        for (let i = 0; i < names.length; i++) {
            const face = names[i];
            const point = this.selectedFaces[face];
            if (!point) continue;
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.045, 12, 10),
                new THREE.MeshBasicMaterial({ color: colors[face] || 0xffffff, depthTest: false })
            );
            marker.position.set(point[0], point[1], point[2]);
            marker.userData.faceMarker = face;
            marker.renderOrder = 10;
            this._object.add(marker);
        }
    }

    _initGizmo() {
        const canvas = this._modal.querySelector('.model-gizmo-canvas');
        if (typeof RotationGizmo3D === 'undefined' || !canvas) return;
        this._gizmo = new RotationGizmo3D(canvas, {
            sensitivity: 0.5,
            applyDrag: (cur, yawDeg, pitchDeg, rollDeg) => {
                this._nudgeRotation(yawDeg / 0.5, pitchDeg / 0.5, rollDeg / 0.5);
                return { x: this.selectedPitch, y: this.selectedYaw, z: this.selectedRoll };
            },
            onChange: () => {}
        });
        this._gizmo.setRotation(this.selectedPitch, this.selectedYaw, this.selectedRoll);
    }

    _applyCamera() {
        if (!this._camera || typeof Reactor3D === 'undefined') return;
        Reactor3D.aimCamera(this._camera, { x: -0.5, y: 0, z: -0.5 }, this._view);
    }

    _applyModelRotation() {
        if (!this._object) return;
        this._object.rotation.order = 'YXZ';
        this._object.rotation.set(
            this.selectedPitch * Math.PI / 180,
            this.selectedYaw * Math.PI / 180,
            this.selectedRoll * Math.PI / 180
        );
    }

    _disposePreview() {
        if (this._object && this._object.parent) this._object.parent.remove(this._object);
        this._object = null;
        if (this._renderer) {
            this._renderer.dispose();
            const gl = this._renderer.getContext && this._renderer.getContext();
            const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        this._renderer = null;
        this._scene = null;
        this._camera = null;
    }

    _setMessage(text) {
        const message = this._modal && this._modal.querySelector('.model-preview-message');
        if (!message) return;
        if (text) {
            message.textContent = text;
            message.style.display = 'flex';
        } else {
            message.textContent = '';
            message.style.display = 'none';
        }
    }

    async _drawPreview() {
        const canvas = this._modal && this._modal.querySelector('.model-preview-canvas');
        if (!canvas) return;
        this._previewGen = (this._previewGen || 0) + 1;
        const gen = this._previewGen;
        if (!this.selectedName) {
            this._disposePreview();
            this._setMessage(this._t('None'));
            return;
        }
        this._setMessage('');
        const ready = await this._ensureThree();
        if (gen !== this._previewGen || !this._modal) return;
        if (!ready || typeof THREE === 'undefined' || typeof Reactor3D === 'undefined') {
            this._setMessage(this.selectedName);
            return;
        }
        const filePath = this._modelPath();
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            this._setMessage(this._t('None'));
            return;
        }
        try {
            const data = fs.readFileSync(filePath);
            const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const path = require('path');
            const baseUrl = 'file://' + path.dirname(filePath).replace(/\\/g, '/') + '/';
            const template = Reactor3D.readModel(buffer, this.selectedExt, baseUrl);
            if (gen !== this._previewGen || !this._modal) return;
            if (!this._renderer) {
                this._scene = new THREE.Scene();
                this._scene.background = new THREE.Color(0x1a1a1e);
                this._camera = Reactor3D.createCamera({ fov: 40 });
                this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
                this._renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
                if (THREE.SRGBColorSpace) this._renderer.outputColorSpace = THREE.SRGBColorSpace;
                const tick = () => {
                    if (!this._renderer || !this._modal) return;
                    const rect = canvas.getBoundingClientRect();
                    const width = Math.max(1, Math.round(rect.width));
                    const height = Math.max(1, Math.round(rect.height));
                    if (canvas.width !== width || canvas.height !== height) {
                        this._renderer.setSize(width, height, false);
                        this._camera.aspect = width / height;
                        this._camera.updateProjectionMatrix();
                    }
                    this._applyCamera();
                    this._renderer.render(this._scene, this._camera);
                    this._raf = requestAnimationFrame(tick);
                };
                this._raf = requestAnimationFrame(tick);
            }
            if (this._object && this._object.parent) this._object.parent.remove(this._object);
            const model = template.clone(true);
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            model.scale.setScalar(1.6 / span);
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            this._object = new THREE.Group();
            this._object.add(model);
            this._applyModelRotation();
            this._rebuildFaceMarkers();
            this._scene.add(this._object);
            this._applyCamera();
            this._setMessage('');
        } catch (error) {
            console.error('Reactor3D preview failed.', error);
            this._setMessage(this.selectedName);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelGraphicPicker;
}
