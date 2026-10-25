/**
 * Model templates and thumbnails for Preview Event.
 *
 * A page bound to a 3D model (the map sidecar's `events[id][page]` spec) is
 * previewed as the model itself in the 3D view and as a rendered thumbnail on
 * the 2D canvas. Templates are read the way the Database 3D editor reads them
 * and cached per model, so both views and every event share one parse.
 */
(function(root) {
    const templates = new Map();
    const thumbnails = new Map();
    // Who asked for each template and when: one only a thumbnail needed is given back once the
    // picture is drawn, and one no map has asked for since the last map change goes at the sweep.
    const asked = new Map();
    let epoch = 0;
    let revision = 0;
    /** Thumbnails kept: small pictures, the newest. */
    const THUMBNAILS_KEPT = 256;
    const release = () => (typeof root.RRModelRelease !== 'undefined' ? root.RRModelRelease : null);
    // The thumbnail renderer and its context are dropped a few seconds after the last picture.
    let thumbs = null;
    function thumbStage() {
        const R = release();
        const make = () => {
            const canvas = document.createElement('canvas');
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
            renderer.setClearColor(0x000000, 0);
            const scene = new THREE.Scene();
            scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
            const sun = new THREE.DirectionalLight(0xffffff, 0.9);
            sun.position.set(1.4, 2.2, 1.8);
            scene.add(sun);
            return { renderer, scene, camera: new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 100) };
        };
        if (!thumbs) thumbs = R ? new R.IdleRenderer(make, { name: 'event-thumbnails' }) : { state: null, use(fn) { if (!this.state) this.state = make(); return fn(this.state); } };
        return thumbs;
    }

    /** Give a template's graphics-card copies back, and forget it. */
    function letGo(key, template) {
        asked.delete(key);
        if (templates.get(key) === template) templates.delete(key);
        const R = release();
        if (!R || !template || typeof template.then === 'function') return;
        const keep = new Set();
        for (const other of templates.values()) if (other && other !== template && typeof other.then !== 'function') R.resourcesOf(other, keep);
        R.releaseTemplate(template, keep);
    }

    async function ensureLibraries(mapEditor3D) {
        if (typeof window !== 'undefined' && window.THREE && window.Reactor3D?.extensionsLoaded?.()) return true;
        if (mapEditor3D?.ensureLibraries) return !!(await mapEditor3D.ensureLibraries());
        return false;
    }

    function keyFor(spec) {
        return typeof Reactor3D !== 'undefined' && Reactor3D.modelCacheKey
            ? Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file)
            : `${spec.name}|${spec.ext || ''}|${spec.file || ''}`;
    }

    /** The parsed model, or null when the file is missing or unreadable. */
    async function templateFor(project, spec, mapEditor3D, forThumbnail = false) {
        if (!project?.path || !spec?.name || typeof require !== 'function') return null;
        const key = `${project.path}|${keyFor(spec)}|${spec.texture || ""}`;
        const note = asked.get(key) || { placed: false, epoch };
        note.epoch = epoch;
        // Asked for to stand in a view (not only to be drawn once as a picture): it stays.
        if (!forThumbnail) note.placed = true;
        asked.set(key, note);
        if (templates.has(key)) return templates.get(key);
        const pending = (async () => {
            if (!await ensureLibraries(mapEditor3D)) return null;
            const fs = require('fs');
            const path = require('path');
            const file = (spec.file || spec.name) + (spec.ext || '.glb');
            const nested = path.join(project.path, '3d', spec.name, 'source', file);
            const filePath = fs.existsSync(nested) ? nested : path.join(project.path, '3d', 'source', file);
            if (!fs.existsSync(filePath)) return null;
            try {
                const data = (typeof RREncryptedAssets !== 'undefined' && RREncryptedAssets.readAssetBytesAsync)
                    ? await RREncryptedAssets.readAssetBytesAsync(filePath)
                    : fs.readFileSync(filePath);
                if (!data) return null;
                const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                const baseUrl = 'file://' + path.dirname(filePath).replace(/\\/g, '/') + '/';
                const loaded = Reactor3D.readModelAsync
                    ? await Reactor3D.readModelAsync(buffer, spec.ext || '.glb', baseUrl, spec.texture || '')
                    : Reactor3D.readModel(buffer, spec.ext || '.glb', baseUrl, spec.texture || '');
                // The model's own base transform rides with the template so
                // every instance below wears it.
                if (loaded && Reactor3D.readModelTransform) {
                    try {
                        const sidecar = JSON.parse(fs.readFileSync(path.join(project.path, '3d', ...spec.name.split('/'), 'model.json'), 'utf8'));
                        loaded.userData.reactorTransform = Reactor3D.readModelTransform(sidecar);
                        loaded.userData.reactorSidecar = sidecar;
                        // Feet on the ground in the pose that plays, not the rest pose.
                        if (Reactor3D.groundAnimatedTemplate) Reactor3D.groundAnimatedTemplate(loaded, sidecar);
                        // Distance levels the import wrote beside the source.
                        if (Array.isArray(sidecar.lods) && Reactor3D.attachLodLevels && !loaded.userData.animated) {
                            const buffers = [];
                            for (const name of sidecar.lods) {
                                if (typeof name !== 'string' || !name || /[\\/]/.test(name) || name.includes('..')) continue;
                                const lodPath = path.join(path.dirname(filePath), name);
                                if (!fs.existsSync(lodPath)) continue;
                                const lodData = fs.readFileSync(lodPath);
                                buffers.push(lodData.buffer.slice(lodData.byteOffset, lodData.byteOffset + lodData.byteLength));
                            }
                            if (buffers.length) Reactor3D.attachLodLevels(loaded, key, buffers);
                        }
                    } catch (error) {
                        loaded.userData.reactorTransform = null;
                        loaded.userData.reactorSidecar = null;
                    }
                }
                return loaded;
            } catch (error) {
                console.warn('Could not read the model for an event preview:', error);
                return null;
            }
        })();
        templates.set(key, pending);
        const template = await pending;
        if (templates.get(key) === pending) {
            if (template) templates.set(key, template);
            else templates.delete(key);
        }
        return template;
    }

    /** A placed instance, scaled and turned the way the game places it. */
    function instance(template, spec, direction) {
        const object = Reactor3D.cloneModelTemplate ? Reactor3D.cloneModelTemplate(template) : template.clone(true);
        // A use that names a variant wears that variant's surface and look.
        const sidecar = template.userData.reactorSidecar;
        const transform = spec && spec.variant && sidecar && Reactor3D.readModelTransform
            ? Reactor3D.readModelTransform(sidecar, spec) : template.userData.reactorTransform;
        if (transform && Reactor3D.applyModelTransform) Reactor3D.applyModelTransform(object, transform);
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const fit = (spec.size > 0 ? spec.size : 2) / span;
        const uniform = fit * (spec.scale > 0 ? spec.scale : 1);
        const stretch = spec.stretch || [1, 1, 1];
        object.scale.set(uniform * stretch[0], uniform * stretch[1], uniform * stretch[2]);
        if (Reactor3D.applyEventModelPose) Reactor3D.applyEventModelPose(object, spec, direction || 2);
        else object.rotation.y = spec.yaw || 0;
        object.userData.glbSize = extent;
        object.traverse(node => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const material of materials) if (material) material.fog = false;
        });
        return object;
    }

    /**
     * Textures arrive after the model parses (embedded ones decode, external
     * ones load); a render before that is a black shape. Every material map
     * counts, and a texture with no image yet is not ready.
     */
    function texturesDecoded(template) {
        const textures = new Set(template?.userData?.glbTextures || []);
        template?.traverse?.(node => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const material of materials) {
                for (const slot of ['map', 'emissiveMap', 'alphaMap']) if (material?.[slot]) textures.add(material[slot]);
            }
        });
        for (const texture of textures) {
            const image = texture && texture.image;
            if (!image) return false;
            if (typeof image.videoWidth === 'number') {
                if (!(image.videoWidth > 0) || image.readyState < 2) return false;
            } else if (typeof image.complete === 'boolean') {
                if (!image.complete || !(image.naturalWidth > 0)) return false;
            } else if (!(image.width > 0)) {
                return false;
            }
        }
        return true;
    }

    async function whenTexturesDecoded(template, timeoutMs = 6000) {
        const started = Date.now();
        while (!texturesDecoded(template) && Date.now() - started < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return texturesDecoded(template);
    }

    /**
     * The model as its 2D sprite: an orthographic render from the map's
     * pitch, `pixels` per footprint unit, framed about the ground origin.
     * Resolves to { url, size, anchorX, anchorY } or null.
     */
    async function thumbnail(project, spec, mapEditor3D, pixels, direction) {
        const key = `${project?.path}|${JSON.stringify(spec)}@${pixels}:${direction || 2}`;
        if (thumbnails.has(key)) return thumbnails.get(key);
        const pending = (async () => {
            const template = await templateFor(project, spec, mapEditor3D, true);
            if (!template || typeof THREE === 'undefined') return null;
            const templateKey = `${project.path}|${keyFor(spec)}|${spec.texture || ""}`;
            if (!await whenTexturesDecoded(template)) {
                // Not ready yet: hand back nothing and forget the attempt so
                // the next request renders instead of caching a black frame.
                thumbnails.delete(key);
                return null;
            }
            const object = instance(template, { ...spec, size: 1, scale: 1 }, direction);
            // A variant's own picture loads after the model's.
            if (spec.variant && !await whenTexturesDecoded(object)) {
                thumbnails.delete(key);
                return null;
            }
            ModelPreview3D.isolateLighting(object);
            const drawn = thumbStage().use(stage => {
                stage.scene.add(object);
                const thumbCamera = stage.camera;
                // Framed as the game frames its sprite: the map's pitch, about the
                // ground origin, so 2D preview and 2D play agree.
                const framing = Reactor3D.frameModelSprite
                    ? Reactor3D.frameModelSprite(object, Math.round(pixels), thumbCamera)
                    : null;
                if (!framing) { stage.scene.remove(object); return null; }
                stage.renderer.setSize(framing.pixels, framing.pixels, false);
                stage.renderer.render(stage.scene, stage.camera);
                stage.scene.remove(object);
                try {
                    return { url: stage.renderer.domElement.toDataURL('image/png'), size: framing.pixels, anchorX: framing.anchorX, anchorY: framing.anchorY };
                } catch (_) { return null; }
            });
            object.traverse(node => {
                const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                for (const material of materials) material?.dispose?.();
            });
            // A model nothing stands in a view with was loaded for this picture alone: it goes
            // once no other picture of it is being drawn.
            const note = asked.get(templateKey);
            if (drawn && note && !note.placed) {
                note.pictures = (note.pictures || 0);
                let drawing = 0;
                for (const [other, value] of thumbnails) if (other !== key && value && typeof value.then === 'function' && other.startsWith(`${project?.path}|`) && other.indexOf(JSON.stringify(spec.name)) >= 0) drawing++;
                if (!drawing) letGo(templateKey, template);
            }
            return drawn;
        })();
        thumbnails.set(key, pending);
        const url = await pending;
        if (thumbnails.get(key) === pending) {
            thumbnails.delete(key);
            if (url) thumbnails.set(key, url);
            // The oldest pictures beyond the bound go (a Map keeps the order they were put in).
            while (thumbnails.size > THUMBNAILS_KEPT) thumbnails.delete(thumbnails.keys().next().value);
        }
        return url;
    }

    function clear() {
        revision++;
        const all = Array.from(templates.entries());
        templates.clear();
        asked.clear();
        thumbnails.clear();
        const R = release();
        // What a view still shows uploads again on its next draw.
        if (R) for (const [, template] of all) if (template && typeof template.then !== 'function') R.releaseTemplate(template);
        if (thumbs && thumbs.drop) thumbs.drop();
    }

    /** Another map is opening: what it asks for from here on is its own. */
    function nextMap() { epoch++; return epoch; }

    /** Once the new map's views are built: templates no view has asked for since `nextMap` are given back. */
    function sweep() {
        const gone = [];
        for (const [key, template] of Array.from(templates.entries())) {
            if (!template || typeof template.then === 'function') continue;
            const note = asked.get(key);
            if (note && note.epoch >= epoch) continue;
            letGo(key, template);
            gone.push(key);
        }
        return gone;
    }

    /**
     * A renderer that drew these is going away with its context kept (the 3D view over the 2D
     * canvas): their copies on the graphics card are given back first, or nothing ever frees them.
     */
    function releaseGpu() {
        const R = release();
        if (!R) return 0;
        let count = 0;
        for (const template of templates.values()) if (template && typeof template.then !== 'function') { R.releaseTemplate(template); count++; }
        return count;
    }

    /** Every geometry a loaded template holds: what its copies share and must leave alone. */
    function sharedGeometry() {
        const shared = new Set();
        for (const template of templates.values()) {
            if (!template || typeof template.then === 'function' || typeof template.traverse !== 'function') continue;
            template.traverse(node => { if (node.geometry) shared.add(node.geometry); });
        }
        return shared;
    }

    /**
     * A placed copy leaves its scene: its materials, its skeletons and the geometry made for
     * that copy alone (a rig's finger skin, a carved part) are disposed. Geometry the template
     * holds is left for the template. Returns how many geometries went.
     */
    function disposeInstance(object, shared = sharedGeometry()) {
        if (!object || typeof object.traverse !== 'function') return 0;
        let gone = 0;
        object.traverse(node => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const material of materials) if (material && typeof material.dispose === 'function') material.dispose();
            if (node.skeleton && typeof node.skeleton.dispose === 'function') node.skeleton.dispose();
            if (node.geometry && !shared.has(node.geometry) && typeof node.geometry.dispose === 'function') { node.geometry.dispose(); gone++; }
        });
        return gone;
    }

    function stats() {
        let loaded = 0;
        for (const template of templates.values()) if (template && typeof template.then !== 'function') loaded++;
        return { templates: loaded, thumbnails: thumbnails.size, thumbRenderer: !!(thumbs && (thumbs.active || thumbs.state)), epoch };
    }

    /**
     * Make a placed instance move the way the game moves it: carved parts or
     * a rig, the animation rules and a mixer binding. Returns what a frame
     * loop needs, or null when the model has nothing to animate.
     */
    function animate(object, template) {
        const sidecar = template && template.userData.reactorSidecar;
        if (!object || !sidecar || typeof Reactor3D === 'undefined' || !Reactor3D.prepareModelInstance) return null;
        try {
            const rig = Reactor3D.readModelRig ? Reactor3D.readModelRig(sidecar) : null;
            if (rig && Reactor3D.applyModelRig) {
                Reactor3D.applyModelRig(object, rig);
            } else {
                if (Reactor3D.carveModelParts) Reactor3D.carveModelParts(object, Reactor3D.readModelParts(sidecar));
                if (Reactor3D.applyPivotOverrides) Reactor3D.applyPivotOverrides(object, Reactor3D.readModelPivots(sidecar));
            }
            const binding = Reactor3D.prepareModelInstance(object, object.__reactorClips);
            const rules = Reactor3D.readModelAnimationRules(sidecar, object.__reactorClips);
            if (!binding || !rules.length) return null;
            return { binding, rules, clips: binding.clips };
        } catch (error) {
            console.warn('Could not animate a model preview:', error);
            return null;
        }
    }

    const api = { templateFor, instance, animate, thumbnail, texturesDecoded, clear, nextMap, sweep, releaseGpu, sharedGeometry, disposeInstance, stats, THUMBNAILS_KEPT, get revision() { return revision; } };
    root.RREventPreviewModels = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
