/** Ground projections of the posed model geometry. Cached per light; flicker
 * changes opacity without rebuilding geometry or reading model pixels back. */
class ModelPropShadows2D {
    constructor(preview) { this.preview = preview; this.states = new Map(); }

    release(state) {
        if (state.texture) {
            // PIXI can still draw the preceding light list before its next
            // rAF update. Unbind a mask before resizing/removing its source.
            const sprites = this.preview.manager.projectController?.lightingManager?._glowSprites || [];
            for (const sprite of sprites) {
                if (sprite.shader?.resources.uShadow === state.texture.source) {
                    sprite.shader.resources.uShadow = PIXI.Texture.EMPTY.source;
                    sprite.shader.resources.lightUniforms.uniforms.uHasShadow = 0;
                }
            }
            delete state.texture.source._gpuData[this.preview.app.renderer.uid];
            state.texture.destroy(true);
        }
        state.target?.dispose(); state.material?.dispose();
    }

    clear() {
        for (const state of this.states.values()) this.release(state);
        this.states.clear(); this.lastUpdate = undefined;
    }

    update(lights, now) {
        const preview = this.preview, map = preview.manager.currentMap;
        if (!map || !preview.entries.size) { this.clear(); return; }
        if (this.lastUpdate !== undefined && now - this.lastUpdate < 1000 / 30) return;
        this.lastUpdate = now;
        for (const entry of preview.entries.values()) {
            if (entry.wasMoving && entry.paintedFrame !== entry.driver?.previewFrame) preview.expand(entry);
        }
        const active = new Set();
        // Shadows owed only for a pose are drawn a few a frame, oldest first, so no frame redraws them all.
        let poseBudget = ModelPropShadows2D.POSE_PAINTS_PER_FRAME;
        const ordered = lights.slice().sort((a, b) => (this.states.get(a.id)?.at || 0) - (this.states.get(b.id)?.at || 0));
        for (const light of ordered) {
            if (!light.shadow) continue;
            // The reach rounded up to half a tile: a flicker swells and shrinks the radius every frame,
            // and the shadow past the glow's edge is never seen, so a flickering light keeps its shadow.
            const radius = Math.ceil((light.priorityRadius ?? light.radius) * 2) / 2;
            const source = FlatLightField2D.source(light);
            const bounds = FlatLightField2D.bounds({ ...light, radius, priorityRadius: radius }, map, true);
            if (source.y <= 0.05 || !bounds) continue;
            active.add(light.id);
            let state = this.states.get(light.id);
            if (!state) { state = {}; this.states.set(light.id, state); }
            const casters = [...preview.entries.values()].filter(entry => entry.object && entry.prop.id !== light.sourcePropId
                && Math.hypot(entry.prop.x + 0.5 - source.x, entry.prop.y + 0.5 - source.z) < radius + entry.radius
                && this.intersects(entry, source, bounds));
            // Every shadow of every light drew each moving model again thirty times a second: nine draw
            // calls in ten on a busy map, and the editor could not keep up on a slow GPU. What an edit changes: the light as placed (a lamp on a model, its model's place), its reach
            // and shape, and where every model in reach stands. Everything else sways on its own (a
            // flicker, a lamp on a model in its idle, which models a swaying lamp reaches, each model's
            // pose) and is followed at POSE_MS, close enough to look right for a fraction of the work.
            const carrier = light.sourcePropId !== undefined ? preview.entries.get(light.sourcePropId) : null;
            const stand = carrier ? ['on', carrier.prop.x, carrier.prop.y, carrier.prop.z]
                : [[source.x, source.y, source.z].map(v => Math.round(v * 4)), Math.round((light.yaw || 0) / 5), Math.round((light.pitch || 0) / 5)];
            const near = [...preview.entries.values()].filter(entry => entry.object && entry.prop.id !== light.sourcePropId
                && Math.hypot(entry.prop.x + 0.5 - source.x, entry.prop.y + 0.5 - source.z) < radius + entry.radius + 2);
            const place = JSON.stringify([stand, radius, light.type, light.angle, light.width,
                map.width, map.height, near.map(entry => [entry.object.uuid, entry.prop.x, entry.prop.y, entry.prop.z])]);
            const key = place + JSON.stringify([source, light.yaw, light.pitch, casters.map(entry => [entry.object.uuid, entry.wasMoving ? entry.driver?.previewFrame : 0])]);
            const moved = place !== state.place;
            const wait = moved ? 1000 / 30 : ModelPropShadows2D.POSE_MS;
            if (key !== state.key && (!state.at || now - state.at >= wait) && (moved || poseBudget-- > 0)) {
                state.empty = casters.length === 0;
                if (!state.empty) this.paint(state, { ...light, radius }, source, casters, map, bounds);
                state.key = key; state.place = place; state.at = now;
            }
        }
        for (const [id, state] of this.states) if (!active.has(id)) {
            this.release(state); this.states.delete(id);
        }
    }

    /** The caster's projected box must meet the lit floor footprint. The
     * old radius-only test sent almost the entire room to each downlight. */
    intersects(entry, source, bounds) {
        const box = entry.casterBox;
        if (!box) return true;
        const lift = entry.prop.z || 0;
        if (box.min.y + lift >= source.y - 0.01) return false;
        if (box.max.y + lift >= source.y - 0.05) return true;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const h of [box.min.y + lift, box.max.y + lift]) {
            const stretch = source.y / (source.y - h);
            for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
                const px = source.x + (x + entry.prop.x + 0.5 - source.x) * stretch;
                const py = source.z + (z + entry.prop.y + 0.5 - source.z) * stretch;
                minX = Math.min(minX, px); maxX = Math.max(maxX, px);
                minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            }
        }
        return minX <= bounds.x + bounds.width && maxX >= bounds.x && minY <= bounds.y + bounds.height && maxY >= bounds.y;
    }

    paint(state, light, source, casters, map, bounds) {
        const viewport = this.preview.ensureViewport();
        if (!viewport) return;
        // Retain targets through motion, growing in blocks only when a wider
        // footprint needs more texels. Empty pools do not submit a shadow pass.
        const scale = Math.min(12, 512 / Math.max(bounds.width, bounds.height));
        const width = Math.min(512, Math.max(64, Math.ceil(bounds.width * scale / 64) * 64));
        const height = Math.min(512, Math.max(64, Math.ceil(bounds.height * scale / 64) * 64));
        if (state.target && (width > state.target.width || height > state.target.height)) {
            this.release(state); state.texture = state.target = state.material = null;
        }
        if (!state.target) {
            viewport.renderer().resetState(); Reactor3D.clearUnpackState(viewport.pixi().gl);
            state.target = viewport.createTarget(width, height, 1, { samples: 0 });
            const handle = viewport.targetHandle(state.target), gl = viewport.pixi().gl;
            gl.bindTexture(gl.TEXTURE_2D, handle);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            const textureSource = new PIXI.TextureSource({ width: state.target.width, height: state.target.height,
                alphaMode: 'premultiplied-alpha', scaleMode: 'linear', autoGarbageCollect: false });
            Reactor3D.adoptGlTexture(viewport.pixi(), textureSource, handle);
            state.texture = new PIXI.Texture({ source: textureSource, rotate: PIXI.groupD8.MIRROR_VERTICAL });
            state.camera = new THREE.OrthographicCamera(0, map.width, 0, -map.height, 0.1, 1000);
            state.camera.position.set(0, 100, 0); state.camera.up.set(0, 0, -1); state.camera.lookAt(0, 0, 0);
            state.uniforms = { shadowLight: { value: new THREE.Vector3() }, shadowRadius: { value: 1 }, shadowAim: { value: new THREE.Vector3() }, shadowCone: { value: -2 } };
            state.material = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
            state.material.onBeforeCompile = shader => {
                Object.assign(shader.uniforms, state.uniforms);
                shader.vertexShader = 'uniform vec3 shadowLight; varying vec2 shadowPoint; varying float casterHeight;\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
                    vec4 ground = modelMatrix * vec4(transformed, 1.0);
                    casterHeight = ground.y;
                    float stretch = shadowLight.y / max(0.05, shadowLight.y - ground.y);
                    ground.xz = shadowLight.xz + (ground.xz - shadowLight.xz) * stretch;
                    ground.y = 0.0;
                    shadowPoint = ground.xz;
                    gl_Position = projectionMatrix * viewMatrix * ground;
                `);
                shader.fragmentShader = 'uniform vec3 shadowLight; uniform float shadowRadius; uniform vec3 shadowAim; uniform float shadowCone; varying vec2 shadowPoint; varying float casterHeight;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
                    #include <clipping_planes_fragment>
                    if (casterHeight >= shadowLight.y - 0.01 || distance(shadowPoint, shadowLight.xz) > shadowRadius) discard;
                    if (dot(normalize(vec3(shadowPoint.x, 0.0, shadowPoint.y) - shadowLight), shadowAim) < shadowCone) discard;
                `);
            };
            state.scene = new THREE.Scene(); state.scene.overrideMaterial = state.material;
        }
        state.bounds = bounds;
        const camera = state.camera;
        camera.left = bounds.x; camera.right = bounds.x + bounds.width;
        camera.top = -bounds.y; camera.bottom = -(bounds.y + bounds.height);
        camera.updateProjectionMatrix();
        state.uniforms.shadowLight.value.set(source.x, source.y, source.z);
        state.uniforms.shadowRadius.value = light.radius;
        const yaw = -(light.yaw || 0) * Math.PI / 180, pitch = (light.pitch || 0) * Math.PI / 180;
        state.uniforms.shadowAim.value.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        state.uniforms.shadowCone.value = light.type === 'point' ? -2 : Math.cos((light.angle || 45) * Math.PI / 360);
        const restore = [];
        try {
            for (const entry of casters) {
                const object = entry.object;
                const hidden = [], culled = [];
                object.traverse(node => {
                    if (node.userData.__reactorOverlay && node.visible) { hidden.push(node); node.visible = false; }
                    // The custom shader moves the geometry onto the floor;
                    // Three's original-space sphere cannot cull that projection.
                    if (node.isMesh && node.frustumCulled) { culled.push(node); node.frustumCulled = false; }
                });
                restore.push({ object, parent: object.parent, position: object.position.clone(), hidden, culled });
                state.scene.add(object);
                object.position.set(entry.prop.x + 0.5, entry.prop.z || 0, entry.prop.y + 0.5);
            }
            viewport.renderInto(state.target, state.scene, state.camera);
            state.draws = (state.draws || 0) + 1;
            // The glow sprites sample this texture; the map draws on demand.
            this.preview.app?.requestRender?.();
        } finally {
            for (const record of restore) {
                record.parent.add(record.object); record.object.position.copy(record.position);
                record.object.updateMatrixWorld(true);
                record.hidden.forEach(node => { node.visible = true; });
                record.culled.forEach(node => { node.frustumCulled = true; });
            }
        }
    }
}
/** How often a shadow follows a caster's pose when nothing has moved: twice a second, and at most two such a frame. */
ModelPropShadows2D.POSE_MS = 500;
ModelPropShadows2D.POSE_PAINTS_PER_FRAME = 2;
if (typeof module !== 'undefined' && module.exports) module.exports = ModelPropShadows2D;
