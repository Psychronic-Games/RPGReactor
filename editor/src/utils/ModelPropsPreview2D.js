/** Live, retained flat prop renders. One Three renderer borrows the editor's
 * PIXI context; each visible model keeps its own multisampled GPU texture. */
class ModelPropsPreview2D {
    constructor(manager) {
        this.manager = manager;
        this.entries = new Map();
        this.animatedModels = [];
        this.lights = [];
        this.shadows = new ModelPropShadows2D(this);
        this._tick = () => this.tick(performance.now());
        this._visibilityChange = () => { if (document.hidden) this.suspend(); };
    }

    bind() {
        const app = this.manager.tilemapManager?.app;
        const project = this.manager.project()?.path;
        const map = this.manager.currentMap;
        if (this.app === app && this.project === project && this.map === map) return;
        this.clear();
        if (this.app !== app) {
            this.app?.ticker.remove(this._tick, this);
            this.viewport?._renderer.dispose();
            this.viewport = null;
            this.app = app;
            app?.ticker.add(this._tick, this, PIXI.UPDATE_PRIORITY.HIGH);
        }
        document.addEventListener('visibilitychange', this._visibilityChange);
        this.project = project;
        this.map = map;
        this._lastModelTick = 0;
        this.revision = RREventPreviewModels.revision;
    }

    clear() {
        this.shadows.clear();
        for (const entry of this.entries.values()) this.dispose(entry);
        this.entries.clear();
        this.animatedModels = [];
        this.lights = [];
    }

    destroy() {
        document.removeEventListener('visibilitychange', this._visibilityChange);
        this.clear();
        this.app?.ticker.remove(this._tick, this);
        this.viewport?._renderer.dispose();
        this.viewport = null;
        this.app = null;
        this.map = null;
        this.project = null;
    }

    dispose(entry) {
        entry.media?.dispose();
        entry.sprite?.parent?.removeChild(entry.sprite);
        if (entry.sprite && !entry.sprite.destroyed) entry.sprite.destroy();
        this.releaseTexture(entry);
        entry.object?.removeFromParent();
        entry.ownedGeometry?.forEach(geometry => geometry.dispose());
        entry.object?.traverse(node => {
            for (const material of [node.material].flat().filter(Boolean)) material.dispose();
            node.skeleton?.dispose();
        });
    }

    releaseTexture(entry) {
        // Three owns the handle; do not let PIXI delete it a second time.
        if (entry.texture) {
            delete entry.texture.source._gpuData[this.app.renderer.uid];
            entry.texture.destroy(true);
        }
        entry.target?.dispose();
        entry.texture = entry.target = null;
    }

    sync(props) {
        this.bind();
        const ids = new Set(props.map(prop => prop.id));
        for (const [id, entry] of this.entries) {
            if (!ids.has(id)) { this.dispose(entry); this.entries.delete(id); }
        }
    }

    spriteFor(prop, tw) {
        // Position/lift/selection changes retain the animation's clock.
        const key = JSON.stringify([ModelPropsManager.specOf(prop), prop.direction, prop.vehicle,
            prop.animations, prop.animation, prop.repeat, prop.animationSpeed, prop.effects, prop.effect]);
        let entry = this.entries.get(prop.id);
        if (entry?.key !== key) {
            if (entry) this.dispose(entry);
            entry = { key, prop, tw };
            this.entries.set(prop.id, entry);
            this.load(entry);
        }
        entry.prop = prop;
        return entry.sprite || null;
    }

    async load(entry) {
        try {
            const spec = Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(entry.prop));
            const template = await RREventPreviewModels.templateFor(this.manager.project(), spec, this.manager.mapEditor3D());
            if (!template || this.entries.get(entry.prop.id) !== entry) return;
            entry.object = RREventPreviewModels.instance(template, spec, entry.prop.direction);
            const vehicle = entry.prop.vehicle;
            if (vehicle && Reactor3D.Vehicles?.pose) {
                Reactor3D.Vehicles.pose({ object: entry.object, spec }, { _rrVehicle: vehicle.type, _rrYaw: vehicle.yaw * Math.PI / 180 }, entry.object, spec, 0);
            }
            entry.scene = new THREE.Scene();
            entry.scene.add(entry.object);
            entry.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
            const sun = new THREE.DirectionalLight(0xffffff, 0.9);
            sun.position.set(3, 6, 4); entry.scene.add(sun);
            MapEditor3D.prototype.animateModel.call(this, entry.object, template, {
                names: entry.prop.animations || (entry.prop.animation ? [entry.prop.animation] : []),
                repeat: entry.prop.repeat, speed: entry.prop.animationSpeed
            });
            entry.driver = this.animatedModels.find(driver => driver.object === entry.object);
            entry.lighting = this.isolateLighting(entry.object);
            const sharedGeometry = new Set();
            template.traverse(node => { if (node.geometry) sharedGeometry.add(node.geometry); });
            entry.ownedGeometry = new Set();
            entry.object.traverse(node => {
                if (node.geometry && !sharedGeometry.has(node.geometry)) entry.ownedGeometry.add(node.geometry);
            });
            const chosen = new Set(entry.prop.effects || (entry.prop.effect ? [entry.prop.effect] : []));
            entry.effects = Reactor3D.readModelEffects(template.userData.reactorSidecar || {}, spec)
                .filter(effect => effect.trigger === 'always' || chosen.has(effect.name));
            entry.camera = new THREE.OrthographicCamera();
            const frame = Reactor3D.frameModelSprite(entry.object, entry.tw, entry.camera);
            entry.radius = frame.radius;
            entry.size = frame.pixels;
            entry.pixelsPerUnit = frame.pixels / (frame.radius * 2);
            entry.bounds = Reactor3D.prepareFlatModelBounds(entry.object);
            entry.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
            entry.sprite.anchor.set(0.5);
            entry.sprite.__livePropPreview = true;
            entry.media = new ModelPropEffects2D(this, entry, entry.effects);
            entry.dirty = true;
            this.manager.render();
        } catch (error) {
            console.warn('Could not build the live 2D prop preview:', error);
        }
    }

    isolateLighting(object) {
        // Each retained texture owns its light field. Other viewports can
        // update the runtime singleton without changing this model's pixels.
        const count = Reactor3D.SHADER_LIGHTS;
        const uniforms = {
            rrLightCount: { value: 0 }, rrAmbient: { value: new Float32Array([1, 1, 1]) },
            rrLightPos: { value: new Float32Array(count * 4) },
            rrLightColor: { value: new Float32Array(count * 4) },
            rrLightAim: { value: new Float32Array(count * 4) },
            rrLightShadow: { value: new Float32Array(count).fill(-1) },
            rrLightGridEnabled: { value: 0 }
        };
        const materials = new Set();
        object.traverse(node => [node.material].flat().filter(Boolean).forEach(material => materials.add(material)));
        for (const material of materials) {
            if (!material.__reactorLit) continue;
            const earlier = material.onBeforeCompile, key = material.customProgramCacheKey;
            material.onBeforeCompile = function(shader, renderer) {
                earlier.call(this, shader, renderer);
                Object.assign(shader.uniforms, uniforms);
            };
            material.customProgramCacheKey = function() { return key.call(this) + '|flat-preview-light-field'; };
            material.needsUpdate = true;
        }
        return uniforms;
    }

    syncLighting(entry, lights, ambient) {
        if (!entry.lighting) return;
        const prop = entry.prop, reach = entry.radius || 0;
        const local = [];
        for (const light of lights) {
            const source = FlatLightField2D.source(light);
            const x = source.x - (prop.x + 0.5), y = source.y - (prop.z || 0), z = source.z - (prop.y + 0.5);
            // A conservative sphere includes tall models and lights that
            // reach a surface without ever reaching the floor.
            if (Math.hypot(x, y, z) > reach + light.radius) continue;
            local.push({ ...light, x: x - 0.5, y: z - 1, height: y, groundY: 0, yaw: -(light.yaw || 0) });
        }
        local.sort((a, b) => Math.hypot(a.x + 0.5, a.height, a.y + 1) - Math.hypot(b.x + 0.5, b.height, b.y + 1));
        const selected = local.slice(0, Reactor3D.SHADER_LIGHTS);
        const key = JSON.stringify([ambient, selected.map(l => [l.type, l.x, l.y, l.height, l.radius, l.colour, l.intensity, l.yaw, l.pitch, l.angle, l.width])]);
        if (key === entry.lightingKey) return;
        Reactor3D.packLightUniforms(selected, ambient, entry.lighting);
        entry.lightingKey = key;
        entry.dirty = true;
    }

    ensureViewport() {
        const pixi = this.app?.renderer;
        if (!pixi?.gl || pixi.context?.webGLVersion !== 2 || pixi.gl.isContextLost?.()) return null;
        if (this.viewport) return this.viewport;
        // Only the context-independent target methods are used. Do not create
        // the runtime singleton or replace its Graphics._app with the editor.
        const viewport = Object.create(Reactor3D.Viewport.prototype);
        viewport._pixi = pixi;
        Reactor3D.clearUnpackState(pixi.gl);
        viewport._renderer = new THREE.WebGLRenderer({ canvas: pixi.canvas, context: pixi.gl,
            alpha: true, premultipliedAlpha: true });
        viewport._renderer.setPixelRatio(1);
        viewport._renderer.setClearColor(0, 0);
        viewport._resetPixi();
        this.viewport = viewport;
        return viewport;
    }

    expand(entry) {
        const gl = this.app?.renderer?.gl;
        if (!gl || gl.isContextLost?.()) return;
        // Cached rigid/bone boxes, never a per-frame vertex scan.
        const box = this._box || (this._box = new THREE.Box3());
        const piece = this._piece || (this._piece = new THREE.Box3());
        const matrix = this._matrix || (this._matrix = new THREE.Matrix4());
        const skin = this._skin || (this._skin = new THREE.Matrix4());
        entry.object.updateMatrixWorld(true);
        box.makeEmpty();
        for (const part of entry.bounds) {
            if (part.bones) {
                skin.multiplyMatrices(part.mesh.matrixWorld, part.mesh.bindMatrixInverse);
                part.bones.forEach((bounds, i) => {
                    if (bounds.isEmpty()) return;
                    matrix.multiplyMatrices(skin, part.mesh.skeleton.bones[i].matrixWorld);
                    box.union(piece.copy(bounds).applyMatrix4(matrix));
                });
            } else box.union(piece.copy(part.box).applyMatrix4(part.mesh.matrixWorld));
        }
        if (box.isEmpty()) return;
        entry.casterBox = (entry.casterBox || new THREE.Box3()).copy(box);
        const reach = Math.hypot(...['x', 'y', 'z'].map(axis => Math.max(Math.abs(box.min[axis]), Math.abs(box.max[axis]))));
        if (reach <= entry.radius) return;
        entry.radius = reach * 1.1;
        entry.size = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE),
            Math.ceil(entry.radius * 2 * entry.pixelsPerUnit));
        const camera = entry.camera, r = entry.radius;
        camera.left = camera.bottom = -r; camera.right = camera.top = r;
        camera.position.normalize().multiplyScalar(r * 4 + 10); camera.far = r * 10 + 20;
        camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
        this.releaseTexture(entry);
    }

    paint(entry) {
        const viewport = this.ensureViewport();
        if (!viewport) return;
        this.expand(entry);
        // Keep at least one texture texel per device pixel, with 25% headroom
        // and MSAA. Zooming out should not render invisible full-size detail.
        const zoom = Math.abs(this.manager.container.worldTransform.a) || 1;
        const density = Math.ceil(zoom * (this.app.renderer.resolution || 1) * 1.25 * 8) / 8;
        const size = Math.max(8, Math.min(4096, this.app.renderer.gl.getParameter(this.app.renderer.gl.MAX_TEXTURE_SIZE),
            Math.ceil(entry.radius * 2 * entry.tw * density)));
        if (entry.size !== size) { this.releaseTexture(entry); entry.size = size; }
        if (!entry.target) {
            viewport.renderer().resetState();
            Reactor3D.clearUnpackState(viewport.pixi().gl);
            entry.target = viewport.createTarget(entry.size, entry.size, 1, { samples: 4 });
            const gl = viewport.pixi().gl, handle = viewport.targetHandle(entry.target);
            gl.bindTexture(gl.TEXTURE_2D, handle);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            const source = new PIXI.TextureSource({ width: entry.size, height: entry.size,
                alphaMode: 'premultiplied-alpha', scaleMode: 'linear', autoGarbageCollect: false });
            Reactor3D.adoptGlTexture(viewport.pixi(), source, handle);
            entry.texture = new PIXI.Texture({ source, rotate: PIXI.groupD8.MIRROR_VERTICAL });
            entry.sprite.texture = entry.texture;
        }
        entry.media?.paint();
        // A part whose shader or picture is not on the GPU yet sits out the draw (ShaderWarmup), and its upload
        // is queued by that same draw: the texture is painted again until nothing sat out. Painted once, a still
        // prop kept the empty picture for good.
        const warmup = Reactor3D.ShaderWarmup;
        if (warmup) warmup.lastHidden = 0;
        viewport.renderInto(entry.target, entry.scene, entry.camera);
        entry.sprite.width = entry.sprite.height = entry.radius * 2 * entry.tw;
        entry.dirty = !!(warmup && warmup.lastHidden > 0);
        entry.paintedFrame = entry.driver?.previewFrame;
        entry.draws = (entry.draws || 0) + 1;
        // New pixels in the sprite's texture, which the 2D scene graph cannot
        // see: the map has to be drawn again to show them.
        this.app?.requestRender?.();
    }

    suspend() {
        this._idleKey = null;
        for (const entry of this.entries.values()) entry.media?.suspend();
    }

    /**
     * Whether any prop changes from frame to frame on its own: an animation
     * playing (or just stopped), media attached, a light it carries (lights
     * flicker), a texture still decoding, a repaint already owed — or a map
     * light that pulses or flickers over it.
     */
    isLive(mapLights) {
        for (const entry of this.entries.values()) {
            if (!entry.sprite) continue;
            if (entry.dirty || !entry.decoded || entry.wasMoving || entry.driver?.action) return true;
            if (entry.driver?.rules?.some(rule => rule.trigger === 'always' || rule.trigger === 'idle')) return true;
            if (entry.media?.plays?.length) return true;
            if (entry.effects?.some(effect => effect.type === 'light' || effect.light)) return true;
        }
        return mapLights.some(light => light.animated);
    }

    /**
     * Everything a still prop's texture, visibility and shadow depend on,
     * folded into one number: the view's transform and size, each prop's
     * place, every map light, the ambient and the Lighting tool's edit
     * count. Hashed as it goes rather than joined into a string, so an idle
     * frame builds no strings to compare.
     */
    idleKey(mapLights, ambient, lightingRevision, lit = true) {
        let hash = 2166136261;
        const mix = value => {
            const number = typeof value === 'number' ? value : typeof value === 'boolean' ? (value ? 1 : 0) : NaN;
            if (Number.isFinite(number)) {
                hash = Math.imul(hash ^ Math.round(number * 4096), 16777619);
                hash = Math.imul(hash ^ Math.round((number * 4096 - Math.round(number * 4096)) * 65536), 16777619);
            } else {
                const text = value == null ? '' : String(value);
                for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
                hash = Math.imul(hash ^ 0xff, 16777619);
            }
        };
        const transform = this.manager.container?.worldTransform;
        if (transform) { mix(transform.a); mix(transform.d); mix(transform.tx); mix(transform.ty); }
        mix(this.app?.screen?.width); mix(this.app?.screen?.height); mix(this.app?.renderer?.resolution);
        mix(this.entries.size);
        for (const entry of this.entries.values()) {
            const prop = entry.prop || {};
            mix(prop.id); mix(prop.x); mix(prop.y); mix(prop.z);
            mix(entry.sprite ? entry.sprite.x : NaN); mix(entry.sprite ? entry.sprite.y : NaN);
            mix(entry.radius); mix(!!entry.sprite);
        }
        for (const light of mapLights) {
            for (const key of ['id', 'type', 'x', 'y', 'height', 'radius', 'intensity', 'angle', 'width', 'yaw', 'pitch',
                'priorityRadius', 'colour', 'occlude', 'shadow']) mix(light[key]);
        }
        if (ambient) for (const key of Object.keys(ambient).sort()) { mix(key); mix(ambient[key]); }
        // Any edit in the Lighting tool, however it arrived, and whether the map is lit at all.
        mix(lightingRevision);
        mix(lit);
        return hash >>> 0;
    }

    updateEffectPlays() {} // The 3D animation clock is shared; lighting is projected below.

    tick(now) {
        const manager = this.manager;
        if (!manager.currentMap || manager.container?.destroyed || this.app.stage.children.indexOf(manager.tilemapManager.container) < 0) {
            this.clear(); return;
        }
        // Nor while another window is the one worked in (the Database, the Forge), as the 3D view parks:
        // the models' poses, shadows and lights were worked out and drawn every frame behind it.
        if (document.hidden || manager.mapEditor3D()?.isEnabled?.() || manager.mapEditor3D()?.suspended
            || (typeof window !== 'undefined' && window.RRDetachedWindow?.previewActive?.() === false)) {
            this._lastModelTick = now;
            this.suspend();
            this.lights = [];
            return;
        }
        if (this.revision !== RREventPreviewModels.revision) {
            this.revision = RREventPreviewModels.revision;
            this.clear();
            manager.render();
        }
        // No props on this map: nothing to pose, light or shade.
        if (this.entries.size === 0) {
            if (this.lights.length) this.lights = [];
            if (this.shadows.states.size) this.shadows.clear();
            this._idleKey = null;
            return;
        }
        // Model textures already present at 60 Hz. Higher-refresh displays
        // need not resolve poses, media anchors and light lists three times.
        const previewTick = Math.floor(now * 0.06);
        if (this._previewTick === previewTick) return;
        this._previewTick = previewTick;
        const lighting = manager.projectController?.lightingManager;
        const mapLights = lighting?.resolvedLights(now * 0.06) || [];
        const rawAmbient = lighting?.ambient();
        // Still props under still lights, with the view where it was, come
        // out exactly as they did last frame. Skip the posing, projection,
        // light packing and shadow work until one of those inputs moves.
        if (!this.isLive(mapLights)) {
            const key = this.idleKey(mapLights, rawAmbient, lighting?.revision, lighting?.lit ? lighting.lit() : true);
            if (key === this._idleKey) {
                this._lastModelTick = now;
                return;
            }
            this._idleKey = key;
        } else {
            this._idleKey = null;
        }
        MapEditor3D.prototype.animateModels.call(this, now);
        const lights = [];
        const point = this._point || (this._point = typeof THREE !== 'undefined' ? new THREE.Vector3() : null);
        for (const entry of this.entries.values()) {
            if (!entry.sprite) continue;
            const sprite = entry.sprite;
            const center = manager.container.toGlobal(sprite.position);
            const half = (entry.radius * entry.tw + Math.abs(entry.prop.z || 0) * entry.tw) * Math.abs(manager.container.worldTransform.a);
            const visible = center.x + half >= 0 && center.y + half >= 0 && center.x - half <= this.app.screen.width && center.y - half <= this.app.screen.height;
            if (entry.media?.update(visible)) entry.dirty = true;
            const decoded = entry.decoded || RREventPreviewModels.texturesDecoded(entry.object);
            const density = Math.ceil(Math.abs(manager.container.worldTransform.a) * (this.app.renderer.resolution || 1) * 1.25 * 8) / 8;
            if (entry.density !== density) { entry.density = density; entry.dirty = true; }
            const moving = !!entry.driver && (!!entry.driver.action || entry.driver.rules.some(rule => ['always', 'idle'].includes(rule.trigger)));
            if (entry.wasMoving && !moving) entry.dirty = true;
            entry.visible = visible;
            entry.moving = moving;
            entry.wasMoving = moving;
            if (decoded && !entry.decoded) entry.dirty = true;
            entry.decoded = decoded;
            for (const effect of entry.effects) {
                if (effect.type !== 'light' && !effect.light) continue;
                const light = Reactor3D.effectLight(entry.object, effect, `prop:${entry.prop.id}:${effect.name}`);
                if (!light) continue;
                const animated = Reactor3D.animateLight(effect.light, now * 0.06, entry.prop.id, light.radius, light.intensity);
                Reactor3D.effectAnchorWorld(entry.object, effect, point);
                const shadowSource = { x: entry.prop.x + 0.5 + point.x, y: (entry.prop.z || 0) + point.y, z: entry.prop.y + 0.5 + point.z };
                point.project(entry.camera);
                lights.push({ ...light, sourcePropId: entry.prop.id, shadowSource, radius: animated.radius, intensity: animated.intensity, priorityRadius: animated.priorityRadius,
                    x: (sprite.x + point.x * entry.radius * entry.tw) / entry.tw,
                    y: (sprite.y - point.y * entry.radius * entry.tw) / entry.tw,
                    height: 0, yaw: -light.yaw, animated: true });
            }
        }
        const allLights = lights.concat(mapLights);
        // Lit only where the game lights the map; an unlit one is drawn fully lit.
        const enabled = lighting?.lit ? lighting.lit(lighting.map(), lights.length) : rawAmbient?.enabled !== false;
        const ambient = enabled && rawAmbient ? { intensity: rawAmbient.ambient ?? 1,
            colour: Number.parseInt((rawAmbient.ambientColour || '#ffffff').slice(1), 16) } : { intensity: 1, colour: 0xffffff };
        for (const entry of this.entries.values()) {
            if (!entry.sprite) continue;
            this.syncLighting(entry, enabled ? allLights : [], ambient);
            if (entry.visible && entry.paintedTick !== previewTick && (entry.dirty ||
                (entry.moving && entry.paintedFrame !== entry.driver.previewFrame) || !entry.decoded)) {
                this.paint(entry); entry.paintedTick = previewTick;
            }
        }
        this.shadows.update(enabled ? allLights : [], now);
        this.lights = lights;
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = ModelPropsPreview2D;
