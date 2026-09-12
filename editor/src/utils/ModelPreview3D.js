/** Dedicated, disposable Reactor3D viewport for read-only model previews. */
class ModelPreview3D {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ensureLibraries = options.ensureLibraries;
        this.readBytes = options.readBytes;
        this.onError = options.onError;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.template = null;
        this.object = null;
        this.raf = 0;
        this.generation = 0;
        this.disposed = false;
        this.view = { yaw: 0, pitch: 18, distance: 4 };
        this.viewGoal = { ...this.view };
        this.lastFrameAt = 0;
        this.lastRenderAt = 0;
        this.lastInputAt = 0;
        this.bindInput();
    }

    /** Inspection viewports own their light field; map lighting is never borrowed. */
    static isolateLighting(object, uniforms) {
        const count = Reactor3D.SHADER_LIGHTS;
        uniforms ||= {
            rrLightCount: { value: 0 }, rrAmbient: { value: new Float32Array([1, 1, 1]) },
            rrLightPos: { value: new Float32Array(count * 4) },
            rrLightColor: { value: new Float32Array(count * 4) },
            rrLightAim: { value: new Float32Array(count * 4) },
            rrLightShadow: { value: new Float32Array(count).fill(-1) },
            rrLightGridEnabled: { value: 0 }
        };
        this._lightingBindings ||= new WeakMap();
        object.traverse(node => {
            for (const material of [node.material].flat().filter(Boolean)) {
                if (!material.__reactorLit) continue;
                const bound = this._lightingBindings.get(material);
                if (bound) { bound.uniforms = uniforms; continue; }
                const binding = { uniforms };
                this._lightingBindings.set(material, binding);
                const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
                material.onBeforeCompile = function(shader, renderer) {
                    compile.call(this, shader, renderer);
                    Object.assign(shader.uniforms, binding.uniforms);
                };
                material.customProgramCacheKey = function() { return key.call(this) + '|inspection-light-field'; };
                material.needsUpdate = true;
            }
        });
        return uniforms;
    }

    /** Neutral backdrop follows the editor theme without changing the model's colors. */
    static backgroundColor() {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        if (!this._background || this._backgroundTheme !== theme) {
            const css = getComputedStyle(document.documentElement).getPropertyValue('--color-model-preview-bg').trim();
            this._background = new THREE.Color(css || '#1a1a1e');
            this._backgroundTheme = theme;
        }
        return this._background;
    }

    static updateBackground(scene) {
        if (!scene) return;
        if (!scene.background) scene.background = new THREE.Color();
        scene.background.copy(this.backgroundColor());
    }

    bindInput() {
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        this.pointerDown = event => {
            if (event.button !== 0 && event.button !== 2) return;
            dragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
            this.canvas.style.cursor = 'grabbing';
            this.canvas.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        };
        this.pointerMove = event => {
            if (!dragging) return;
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;
            this.viewGoal.yaw -= dx * 0.4;
            this.viewGoal.pitch = Math.min(72, Math.max(5, this.viewGoal.pitch - dy * 0.3));
            this.lastInputAt = performance.now();
        };
        this.pointerUp = event => {
            dragging = false;
            this.canvas.style.cursor = 'grab';
            this.canvas.releasePointerCapture?.(event.pointerId);
        };
        this.wheel = event => {
            event.preventDefault();
            const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
            this.viewGoal.distance = Math.min(20, Math.max(1.2, this.viewGoal.distance * factor));
            this.lastInputAt = performance.now();
        };
        this.contextMenu = event => event.preventDefault();
        this.canvas.addEventListener('pointerdown', this.pointerDown);
        window.addEventListener('pointermove', this.pointerMove);
        window.addEventListener('pointerup', this.pointerUp);
        this.canvas.addEventListener('wheel', this.wheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this.contextMenu);
    }

    async load({ filePath, extension, baseUrl, texture = '' }) {
        const generation = ++this.generation;
        try {
            const ready = await this.ensureLibraries?.();
            if (!ready) throw new Error('The 3D preview libraries could not be loaded.');
            if (this.disposed || generation !== this.generation) return false;
            const bytes = await this.readBytes?.(filePath);
            if (!bytes) throw new Error('The model file could not be read.');
            if (this.disposed || generation !== this.generation) return false;
            const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            let template;
            if (String(extension).toLowerCase() === '.glb') {
                const parsed = Reactor3D.readGlb(buffer);
                const unsafeImages = (parsed.json.images || []).filter(image =>
                    (image.uri && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image.uri))
                    || (!image.uri && image.mimeType && !/^image\/(?:png|jpeg|webp)$/i.test(image.mimeType)));
                if (unsafeImages.length) {
                    // Resource previews never let model metadata fetch local or remote sidecars.
                    for (const image of unsafeImages) image.uri = 'data:,';
                    template = Reactor3D.buildGlbTemplate(parsed.json, parsed.bin, '');
                }
            }
            if (!template) {
                const beforeBuild = () => {
                    if (this.disposed || generation !== this.generation) {
                        throw new Error('The model preview was superseded.');
                    }
                };
                template = Reactor3D.readModelAsync
                    ? await Reactor3D.readModelAsync(buffer, extension, baseUrl, texture, { beforeBuild })
                    : Reactor3D.readModel(buffer, extension, baseUrl, texture);
            }
            if (this.disposed || generation !== this.generation) {
                ModelPreview3D.disposeObject(template);
                return false;
            }
            this.replaceTemplate(template);
            return true;
        } catch (error) {
            if (!this.disposed && generation === this.generation) this.onError?.(error);
            return false;
        }
    }

    replaceTemplate(template) {
        this.disposeModels();
        this.template = template;
        if (!this.renderer) this.createRenderer();
        const model = Reactor3D.cloneModelTemplate
            ? Reactor3D.cloneModelTemplate(template)
            : template.clone(true);
        const extent = template.userData?.glbSize || { x: 1, y: 1, z: 1 };
        const scale = 1.6 / Math.max(extent.x, extent.y, extent.z, 0.0001);
        model.scale.setScalar(scale);
        model.position.set(0, -(extent.y * scale) / 2, 0);
        this.object = new THREE.Group();
        this.object.add(model);
        ModelPreview3D.isolateLighting(this.object);
        this.scene.add(this.object);
        this.lastInputAt = performance.now();
    }

    createRenderer() {
        this.scene = new THREE.Scene();
        ModelPreview3D.updateBackground(this.scene);
        this.camera = Reactor3D.createCamera({ fov: 40 });
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.tick = now => {
            if (this.disposed || !this.renderer) return;
            const rect = this.canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));
            const pixelRatio = this.renderer.getPixelRatio();
            const bufferWidth = Math.floor(width * pixelRatio);
            const bufferHeight = Math.floor(height * pixelRatio);
            if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
                this.renderer.setSize(width, height, false);
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
            }
            const dt = Math.min(0.1, (now - (this.lastFrameAt || now)) / 1000);
            this.lastFrameAt = now;
            const ease = 1 - Math.exp(-dt / 0.07);
            this.view.yaw += (this.viewGoal.yaw - this.view.yaw) * ease;
            this.view.pitch += (this.viewGoal.pitch - this.view.pitch) * ease;
            this.view.distance += (this.viewGoal.distance - this.view.distance) * ease;
            const moving = Math.abs(this.viewGoal.yaw - this.view.yaw) > 0.01
                || Math.abs(this.viewGoal.pitch - this.view.pitch) > 0.01
                || Math.abs(this.viewGoal.distance - this.view.distance) > 0.001;
            if (moving || now - this.lastInputAt < 1000 || now - this.lastRenderAt >= 100) {
                Reactor3D.aimCamera(this.camera, { x: -0.5, y: 0, z: -0.5 }, this.view);
                ModelPreview3D.updateBackground(this.scene);
                Reactor3D.renderScene(this.renderer, this.scene, this.camera);
                this.lastRenderAt = now;
            }
            this.raf = requestAnimationFrame(this.tick);
        };
        this.raf = requestAnimationFrame(this.tick);
    }

    disposeModels() {
        if (this.object?.parent) this.object.parent.remove(this.object);
        ModelPreview3D.disposeObject(this.object, this.template);
        this.object = null;
        this.template = null;
    }

    static disposeObject(...roots) {
        const geometries = new Set();
        const materials = new Set();
        const textures = new Set();
        for (const root of roots) {
            if (!root?.traverse) continue;
            for (const texture of root.userData?.glbTextures || []) textures.add(texture);
            root.traverse(node => {
                if (node.geometry) geometries.add(node.geometry);
                const list = Array.isArray(node.material) ? node.material : [node.material];
                for (const material of list) {
                    if (!material) continue;
                    materials.add(material);
                    for (const value of Object.values(material)) {
                        if (value?.isTexture && value !== Reactor3D._studioEnv) textures.add(value);
                    }
                }
            });
        }
        for (const geometry of geometries) geometry.dispose?.();
        for (const material of materials) material.dispose?.();
        for (const texture of textures) {
            texture.dispose?.();
            if (texture.userData?.reactorObjectUrl) URL.revokeObjectURL?.(texture.userData.reactorObjectUrl);
            texture.image?.close?.();
            texture.source?.data?.close?.();
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.generation++;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.canvas.removeEventListener('pointerdown', this.pointerDown);
        window.removeEventListener('pointermove', this.pointerMove);
        window.removeEventListener('pointerup', this.pointerUp);
        this.canvas.removeEventListener('wheel', this.wheel);
        this.canvas.removeEventListener('contextmenu', this.contextMenu);
        this.disposeModels();
        if (this.renderer) {
            this.renderer.dispose();
            const gl = this.renderer.getContext?.();
            gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        }
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.canvas = null;
    }
}

if (typeof window !== 'undefined') window.ModelPreview3D = ModelPreview3D;
if (typeof module !== 'undefined' && module.exports) module.exports = ModelPreview3D;
