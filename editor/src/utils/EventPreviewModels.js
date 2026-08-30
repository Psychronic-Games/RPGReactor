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
    let thumbRenderer = null;
    let thumbScene = null;
    let thumbCamera = null;

    async function ensureLibraries(mapEditor3D) {
        if (typeof window !== 'undefined' && window.THREE && window.Reactor3D) return true;
        if (mapEditor3D?.ensureLibraries) return !!(await mapEditor3D.ensureLibraries());
        return false;
    }

    function keyFor(spec) {
        return typeof Reactor3D !== 'undefined' && Reactor3D.modelCacheKey
            ? Reactor3D.modelCacheKey(spec.name, spec.ext, spec.file)
            : `${spec.name}|${spec.ext || ''}|${spec.file || ''}`;
    }

    /** The parsed model, or null when the file is missing or unreadable. */
    async function templateFor(project, spec, mapEditor3D) {
        if (!project?.path || !spec?.name || typeof require !== 'function') return null;
        const key = keyFor(spec);
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
        templates.set(key, template);
        return template;
    }

    /** A placed instance, scaled and turned the way the game places it. */
    function instance(template, spec, direction) {
        const object = Reactor3D.cloneModelTemplate ? Reactor3D.cloneModelTemplate(template) : template.clone(true);
        if (template.userData.reactorTransform && Reactor3D.applyModelTransform) {
            Reactor3D.applyModelTransform(object, template.userData.reactorTransform);
        }
        const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const fit = (spec.size > 0 ? spec.size : 2) / span;
        object.scale.setScalar(fit * (spec.scale > 0 ? spec.scale : 1));
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
            if (typeof image.complete === 'boolean') {
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
        const key = `${keyFor(spec)}@${pixels}:${direction || 2}`;
        if (thumbnails.has(key)) return thumbnails.get(key);
        const pending = (async () => {
            const template = await templateFor(project, spec, mapEditor3D);
            if (!template || typeof THREE === 'undefined') return null;
            if (!await whenTexturesDecoded(template)) {
                // Not ready yet: hand back nothing and forget the attempt so
                // the next request renders instead of caching a black frame.
                thumbnails.delete(key);
                return null;
            }
            if (!thumbRenderer) {
                const canvas = document.createElement('canvas');
                thumbRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
                thumbRenderer.setClearColor(0x000000, 0);
                thumbScene = new THREE.Scene();
                thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
                const sun = new THREE.DirectionalLight(0xffffff, 0.9);
                sun.position.set(1.4, 2.2, 1.8);
                thumbScene.add(sun);
                thumbCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 100);
            }
            const object = instance(template, { ...spec, size: 1, scale: 1 }, direction);
            thumbScene.add(object);
            // Framed as the game frames its sprite: the map's pitch, about the
            // ground origin, so 2D preview and 2D play agree.
            const framing = Reactor3D.frameModelSprite
                ? Reactor3D.frameModelSprite(object, Math.round(pixels), thumbCamera)
                : null;
            if (!framing) { thumbScene.remove(object); return null; }
            thumbRenderer.setSize(framing.pixels, framing.pixels, false);
            thumbRenderer.render(thumbScene, thumbCamera);
            thumbScene.remove(object);
            object.traverse(node => {
                const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                for (const material of materials) material?.dispose?.();
            });
            try {
                return { url: thumbRenderer.domElement.toDataURL('image/png'), size: framing.pixels, anchorX: framing.anchorX, anchorY: framing.anchorY };
            } catch (_) { return null; }
        })();
        thumbnails.set(key, pending);
        const url = await pending;
        thumbnails.set(key, url);
        return url;
    }

    function clear() {
        templates.clear();
        thumbnails.clear();
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
            const rules = Reactor3D.readModelAnimationRules(sidecar);
            if (!binding || !rules.length) return null;
            return { binding, rules, clips: binding.clips };
        } catch (error) {
            console.warn('Could not animate a model preview:', error);
            return null;
        }
    }

    const api = { templateFor, instance, animate, thumbnail, texturesDecoded, clear };
    root.RREventPreviewModels = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
