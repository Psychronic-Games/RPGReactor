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

    /**
     * The colour map for formats that do not embed one: a file in the
     * model's textures/ folder, preferring names that say they are the
     * colour pass over normal/emissive companions. Shared with the event
     * editor's preview, which falls back to it for specs saved before the
     * sidecar carried a texture.
     */
    static colorTextureIn(texDir) {
        const fs = require('fs');
        if (!texDir || !fs.existsSync(texDir)) return '';
        const images = fs.readdirSync(texDir)
            .filter(name => /\.(png|jpe?g|webp)$/i.test(name)).sort();
        if (!images.length) return '';
        return images.find(name => /clr|colou?r|diffuse|albedo|base/i.test(name))
            || images[0];
    }

    static listModels(projectPath) {
        if (!projectPath) return [];
        const fs = require('fs');
        const path = require('path');
        const found = [];
        const seen = new Set();
        const textureFrom = dir =>
            ModelGraphicPicker.colorTextureIn(path.join(path.dirname(dir), 'textures'));
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
                ext: match.sourceExtension || match.extension,
                texture: textureFrom(dir)
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
        this.selectedTexture = (current && current.texture) || '';
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
                        <div style="position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;pointer-events:none;">
                            <canvas class="model-gizmo-canvas" width="84" height="84"
                                style="width:84px;height:84px;background:rgba(0,0,0,0.35);border:1px solid var(--color-border);border-radius:4px;pointer-events:auto;"></canvas>
                            <div class="model-preview-controls" style="display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,0.35);padding:6px 8px;border-radius:4px;pointer-events:auto;">
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
                                    <button type="button" class="rr-btn-secondary model-angle-level" title="${this._t('Zero the X and Z tilt; keep the turn')}">${this._t('Upright')}</button>
                                    <button type="button" class="rr-btn-secondary model-angle-reset" title="${this._t('Zero every angle')}">${this._t('Reset')}</button>
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
        // One-click rescue for a pose that drifted: Level keeps the turn and
        // stands the model up; Reset clears everything.
        const setAngles = (pitch, yaw, roll) => {
            this.selectedPitch = pitch;
            this.selectedYaw = yaw;
            this.selectedRoll = roll;
            this._applyModelRotation();
            if (this._gizmo) this._gizmo.setRotation(pitch, yaw, roll);
            this._syncAngleInputs();
        };
        const level = content.querySelector('.model-angle-level');
        if (level) level.addEventListener('click', () => setAngles(0, this.selectedYaw, 0));
        const reset = content.querySelector('.model-angle-reset');
        if (reset) reset.addEventListener('click', () => setAngles(0, 0, 0));
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
                        faces: Object.assign({}, this.selectedFaces),
                        texture: this.selectedTexture || ''
                    }
                    : null);
            }
            this._close();
        });
        // A click's target is the common ancestor of press and release, so
        // a drag that starts on the preview and slips past the modal edge
        // "clicks" the backdrop — and cancelled the whole picker, dots and
        // all. Only a press AND release both on the backdrop closes it.
        let backdropPressed = false;
        modal.addEventListener('pointerdown', e => {
            backdropPressed = e.target === modal;
        });
        modal.addEventListener('click', e => {
            if (e.target === modal && backdropPressed) this._close();
            backdropPressed = false;
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
                this.selectedTexture = file.texture || '';
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
            if (!this.selectedTexture) this.selectedTexture = current.texture || '';
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
        let ringGrab = null;
        const down = e => {
            // An armed side takes total priority: the dot lands the moment
            // the button goes down, on the exact pressed pixel — no drift
            // window, no orbit, nothing else to fight through. Right- or
            // Ctrl-drag still orbits while armed for lining up the far side.
            if (this._placingFace && e.button === 0 && !e.ctrlKey && !e.metaKey) {
                this._placeFaceAt(e);
                e.preventDefault();
                return;
            }
            dragging = true;
            ringGrab = null;
            // A grab on a pose ring turns that axis — the rings around the
            // model ARE the pose control. Anywhere else, left-drag orbits
            // the view (looking around must never edit the pose; plain
            // drags used to rewrite X/Y/Z about camera axes and baked
            // unrecoverable tilt into the spec). Ctrl- or right-drag keeps
            // the turntable nudge for those who prefer it.
            if (!this._placingFace && e.button === 0 && !e.ctrlKey && !e.metaKey) {
                ringGrab = this._pickPoseRing(e);
            }
            orbit = !ringGrab && !(e.button === 2 || e.ctrlKey || e.metaKey);
            lastX = startX = e.clientX;
            lastY = startY = e.clientY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        };
        const move = e => {
            if (!dragging) {
                if (e.target === canvas && this._rings && !this._placingFace) {
                    const over = this._pickPoseRing(e);
                    canvas.style.cursor = over ? 'pointer' : 'grab';
                    this._emphasizePoseRing(over ? over.axis : '', false);
                }
                return;
            }
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            if (ringGrab) {
                this._dragPoseRing(e, ringGrab);
                this._emphasizePoseRing(ringGrab.axis, true);
                return;
            }
            if (orbit || this._placingFace) {
                this._view.yaw -= dx * 0.4;
                this._view.pitch = Math.min(72, Math.max(5, this._view.pitch - dy * 0.3));
                this._applyCamera();
                return;
            }
            this._nudgeRotation(dx, dy);
        };
        const up = () => {
            dragging = false;
            ringGrab = null;
            this._emphasizePoseRing('', false);
            this._refreshCursor();
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
        // Turntable, not tumble: horizontal drag is pure yaw, vertical is
        // pure pitch, and roll only moves through its own field or gesture.
        // Rotating about the CAMERA's axes and decomposing back to X/Y/Z
        // eulers meant that once the view was orbited — or any roll existed —
        // a straight drag bled into all three angles at once (a vertical
        // drag moved pitch, yaw, and roll together), which felt like the
        // model fighting the hand and left poses no field edit could undo.
        this.selectedYaw = this._wrapAngle(this.selectedYaw + dx * 0.5);
        this.selectedPitch = this._wrapAngle(this.selectedPitch + dy * 0.5);
        if (roll) this.selectedRoll = this._wrapAngle(this.selectedRoll + roll * 0.5);
        this._applyModelRotation();
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
        this._syncPoseRingVisibility();
    }

    _refreshCursor() {
        const canvas = this._modal && this._modal.querySelector('.model-preview-canvas');
        if (canvas) canvas.style.cursor = this._placingFace ? 'crosshair' : 'grab';
    }

    _refreshFaceButtons() {
        if (!this._modal) return;
        // The gizmo ball floats over the scene and reads as ring controls;
        // while a side is armed it yields completely — a dot click near
        // the model's base lands in the scene, not on the widget.
        const gizmoCanvas = this._modal.querySelector('.model-gizmo-canvas');
        if (gizmoCanvas) {
            gizmoCanvas.style.pointerEvents = this._placingFace ? 'none' : 'auto';
            gizmoCanvas.style.opacity = this._placingFace ? '0.25' : '';
        }
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
        let point = null;
        if (hit) {
            point = hit.point.clone();
            if (hit.face && hit.face.normal) {
                const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                point.add(normal.multiplyScalar(0.035));
            }
        } else {
            // An armed click ALWAYS lands — a canvas click in this mode
            // means nothing but "this side". Sparse meshes let a ray slip
            // between triangles at spots the eye says are on the model,
            // and clicks out where the rings circle sit past the mesh
            // entirely; swallowing those left the mode armed and the
            // rings away, which read as placement refusing to work. The
            // ray's entry into the model's bounds stands in; a ray that
            // misses even those places on the bounds in its direction.
            const bounds = new THREE.Box3().setFromObject(this._object);
            point = raycaster.ray.intersectBox(bounds, new THREE.Vector3());
            if (!point) {
                const centre = bounds.getCenter(new THREE.Vector3());
                const dir = raycaster.ray
                    .closestPointToPoint(centre, new THREE.Vector3())
                    .sub(centre);
                if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
                const reach = bounds.getBoundingSphere(new THREE.Sphere()).radius;
                point = centre.clone().add(dir.normalize().multiplyScalar(reach));
                bounds.clampPoint(point, point);
            }
        }
        if (!point) return;
        const local = this._object.worldToLocal(point);
        this.selectedFaces[this._placingFace] = [local.x, local.y, local.z];
        this._placingFace = '';
        this._rebuildFaceMarkers();
        this._refreshFaceButtons();
        this._refreshCursor();
        this._syncPoseRingVisibility();
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
        this._syncPoseRings();
    }

    /**
     * Rotation rings around the model itself — grab a ring and drag along
     * it. Green turns (yaw), red tips (pitch), blue rolls; each follows the
     * pose like a gimbal, so the ring being dragged always matches the axis
     * it will change. Free-drag posing kept fighting the hand: rotating
     * about camera axes bled every drag into all three angles.
     */
    _buildPoseRings() {
        if (typeof THREE === 'undefined' || !this._scene) return;
        this._disposePoseRings();
        const radius = 1.15;
        const ringRoot = new THREE.Group();
        ringRoot.name = 'pose-rings';
        const makeRing = (axis, color, orient) => {
            const group = new THREE.Group();
            // The arc passing behind the model hides like any solid would;
            // a faint depth-free twin keeps the circle traceable through
            // the silhouette.
            const solid = new THREE.Mesh(
                new THREE.TorusGeometry(radius, 0.02, 8, 64),
                new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.3, fog: false
                })
            );
            const ghost = new THREE.Mesh(
                solid.geometry,
                new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.05,
                    depthTest: false, depthWrite: false, fog: false
                })
            );
            ghost.renderOrder = 5;
            orient(solid);
            orient(ghost);
            group.add(solid);
            group.add(ghost);
            ringRoot.add(group);
            return { group, solid, ghost };
        };
        this._rings = {
            root: ringRoot,
            radius,
            yaw: makeRing('yaw', 0x3ddc84, mesh => mesh.rotation.x = Math.PI / 2),
            pitch: makeRing('pitch', 0xff5c5c, mesh => mesh.rotation.y = Math.PI / 2),
            roll: makeRing('roll', 0x5ca8ff, () => {})
        };
        this._scene.add(ringRoot);
        this._syncPoseRings();
        this._syncPoseRingVisibility();
    }

    _disposePoseRings() {
        if (!this._rings) return;
        if (this._rings.root.parent) this._rings.root.parent.remove(this._rings.root);
        this._rings.root.traverse(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
        });
        this._rings = null;
    }

    /** Gimbal nesting: pitch follows the turn, roll follows both. */
    _syncPoseRings() {
        if (!this._rings) return;
        const yaw = this.selectedYaw * Math.PI / 180;
        const pitch = this.selectedPitch * Math.PI / 180;
        this._rings.pitch.group.rotation.set(0, yaw, 0);
        this._rings.roll.group.rotation.order = 'YXZ';
        this._rings.roll.group.rotation.set(pitch, yaw, 0);
    }

    /**
     * Rings whisper until touched: dim at rest so they never compete with
     * the model or the face dots, brighter under the pointer, full only
     * while held — when the others fall away so the turn reads clearly.
     */
    _emphasizePoseRing(axis, held) {
        if (!this._rings) return;
        for (const key of ['yaw', 'pitch', 'roll']) {
            const mine = key === axis;
            this._rings[key].solid.material.opacity =
                mine ? (held ? 0.9 : 0.6) : (held && axis ? 0.08 : 0.3);
            this._rings[key].ghost.material.opacity =
                mine ? (held ? 0.14 : 0.08) : (held && axis ? 0.02 : 0.05);
        }
    }

    /** Placing a face dot hides the rings — same palette, different job. */
    _syncPoseRingVisibility() {
        if (this._rings) this._rings.root.visible = !this._placingFace;
    }

    /**
     * The pose ring under the pointer, with its rotation plane, or null.
     * Chosen by SCREEN distance to each ring's drawn circle — a grab lands
     * on the line the eye sees. Fat invisible grab tubes used to decide by
     * ray depth instead, so near ring crossings a click on one ring seized
     * whichever ring's tube sat closer to the camera: a third of direct
     * clicks grabbed a ring visibly away from the pointer.
     */
    _pickPoseRing(event) {
        if (!this._rings || !this._camera || typeof THREE === 'undefined') return null;
        if (!this._rings.root.visible) return null;
        const canvas = this._modal && this._modal.querySelector('.model-preview-canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const radius = this._rings.radius;
        const camPos = this._camera.getWorldPosition(new THREE.Vector3());
        const nearest = {};
        for (const key of ['yaw', 'pitch', 'roll']) {
            const q = this._rings[key].group.getWorldQuaternion(new THREE.Quaternion());
            let best = null;
            for (let i = 0; i < 72; i++) {
                const t = (i / 72) * Math.PI * 2;
                const world = (key === 'yaw'
                    ? new THREE.Vector3(radius * Math.cos(t), 0, radius * Math.sin(t))
                    : key === 'pitch'
                        ? new THREE.Vector3(0, radius * Math.cos(t), radius * Math.sin(t))
                        : new THREE.Vector3(radius * Math.cos(t), radius * Math.sin(t), 0)
                ).applyQuaternion(q);
                const v = world.clone().project(this._camera);
                if (v.z > 1) continue;
                const sx = rect.left + (v.x + 1) / 2 * rect.width;
                const sy = rect.top + (1 - v.y) / 2 * rect.height;
                const d = Math.hypot(sx - event.clientX, sy - event.clientY);
                if (!best || d < best.d) best = { d, camDist: world.distanceTo(camPos) };
            }
            if (best && best.d <= 12) nearest[key] = best;
        }
        let axis = null;
        for (const key of Object.keys(nearest)) {
            if (!axis) { axis = key; continue; }
            const a = nearest[axis];
            const b = nearest[key];
            // At a crossing the circles coincide on screen; take the one
            // drawn on top there — otherwise plain nearest wins.
            axis = Math.abs(a.d - b.d) < 4
                ? (b.camDist < a.camDist ? key : axis)
                : (b.d < a.d ? key : axis);
        }
        if (!axis) return null;
        const ring = this._rings[axis];
        // The ring's rotation plane: normal is the ring group's local axis
        // the torus circles, taken to world space.
        const local = axis === 'yaw' ? new THREE.Vector3(0, 1, 0)
            : axis === 'pitch' ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 0, 1);
        const normal = local.applyQuaternion(
            ring.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const centre = this._rings.root.getWorldPosition(new THREE.Vector3());
        const start = this._ringPlanePoint(event, normal, centre);
        if (!start) return null;
        return {
            axis, normal, centre,
            startVec: start.sub(centre).normalize(),
            startValue: axis === 'yaw' ? this.selectedYaw
                : axis === 'pitch' ? this.selectedPitch : this.selectedRoll
        };
    }

    _ringPlanePoint(event, normal, centre) {
        const canvas = this._modal && this._modal.querySelector('.model-preview-canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const caster = new THREE.Raycaster();
        caster.setFromCamera(ndc, this._camera);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centre);
        const point = new THREE.Vector3();
        return caster.ray.intersectPlane(plane, point) ? point : null;
    }

    /** Follow the grabbed point around the ring: the model turns with it. */
    _dragPoseRing(event, grab) {
        const point = this._ringPlanePoint(event, grab.normal, grab.centre);
        if (!point) return;
        const vec = point.sub(grab.centre).normalize();
        const delta = Math.atan2(
            grab.normal.dot(new THREE.Vector3().crossVectors(grab.startVec, vec)),
            grab.startVec.dot(vec)
        ) * 180 / Math.PI;
        const value = this._wrapAngle(grab.startValue + delta);
        if (grab.axis === 'yaw') this.selectedYaw = value;
        else if (grab.axis === 'pitch') this.selectedPitch = value;
        else this.selectedRoll = value;
        this._applyModelRotation();
        if (this._gizmo) this._gizmo.setRotation(this.selectedPitch, this.selectedYaw, this.selectedRoll);
        this._syncAngleInputs();
    }

    _disposePreview() {
        this._disposePoseRings();
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
            const template = Reactor3D.readModel(
                buffer, this.selectedExt, baseUrl, this.selectedTexture);
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
            const model = Reactor3D.cloneModelTemplate
                ? Reactor3D.cloneModelTemplate(template)
                : template.clone(true);
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            model.scale.setScalar(1.6 / span);
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            this._object = new THREE.Group();
            this._object.add(model);
            this._buildPoseRings();
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
