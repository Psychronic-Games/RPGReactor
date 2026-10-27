/* Classic Worker entry: every full model build and its lazy asset decode stays off the page. */
(function(scope) {
    'use strict';
    const modules = ['HumanTargets', 'HumanBody', 'CharacterDrape', 'CharacterOutfit', 'CharacterFabric', 'CharacterWear', 'CharacterAtlas', 'CharacterSimplify',
        'CharacterOutfitTransfer', 'CharacterClothes', 'CharacterPowerArmor', 'CharacterWasteland', 'ConstructionSurface', 'ConstructionPatterns', 'CharacterCyberGear', 'CharacterProps', 'CharacterGarmentDetails', 'CharacterReconConstruction', 'CharacterWardrobe', 'CharacterSpecies', 'CharacterBodyArtMotifs', 'CharacterBodyArt', 'CharacterSkin', 'CharacterBodyMods',
        'CharacterHair', 'CreatureGear', 'CreatureArthropods', 'CreatureFlyers', 'CreatureReptiles', 'CreatureForms', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterPoses',
        'MerfolkBody', 'CharacterCentaur', 'CharacterCloth', 'CharacterExpressions', 'SlimeBody', 'CharacterModel'];
    importScripts('../../utils/QuadricDecimator.js', 'CharacterPreviewTextures.js', ...modules.map(name => name + '.js'));
    const Body = scope.RRHumanBody, Model = scope.RRCharacterModel, Wardrobe = scope.RRCharacterWardrobe;
    const Taken = scope.RRCharacterOutfitTransfer;
    const caches = new Map(), dynamic = new Set(), fetched = new Map();
    let context = {}, contextError = null, packPromise = null, packURL = null;
    const PART_FIELDS = ['name', 'kind', 'color', 'texture', 'keepColors', 'normalTexture', 'normalScale', 'normalTexCoord', 'metallicRoughnessTexture', 'metallicRoughnessTexCoord', 'occlusionTexture', 'occlusionTexCoord', 'occlusionStrength', 'sheen', 'fabric', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange', 'iridescenceThicknessTexture', 'emissive', 'emissiveIntensity', 'emissiveTexture', 'roughness', 'metalness', 'doubleSided', 'opacity', 'cutout', 'alphaCutoff', 'onSkin', 'envMapIntensity', 'wet'];
    const GEOMETRY_FIELDS = ['positions', 'normals', 'uvs', 'uvs1', 'colors', 'index'];
    async function checkedFetch(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Character preview asset failed (' + response.status + '): ' + url);
        return response;
    }
    async function raster(url) {
        const bitmap = await createImageBitmap(await (await checkedFetch(url)).blob());
        try {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Character preview image decoding is unavailable');
            ctx.drawImage(bitmap, 0, 0);
            return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer) };
        } finally { if (bitmap.close) bitmap.close(); }
    }
    async function pack() {
        if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
            const error = new Error('Browser character previews require worker image decoding'); error.code = 'PREVIEW_WORKER_UNAVAILABLE'; throw error;
        }
        const url = new URL(context.dataURL || 'data', scope.location.href).href.replace(/\/$/, '');
        if (!packPromise || packURL !== url) {
            packURL = url; fetched.clear(); caches.clear();
            packPromise = Body.loadPack(url).then(async value => { await scope.RRCharacterClothes.preload(value, url); return value; });
            packPromise.catch(() => { packPromise = null; });
        }
        return packPromise;
    }
    function configure(next) {
        for (const key of dynamic) Taken.unregister(Wardrobe, key);
        dynamic.clear(); caches.clear(); context = next || {};
        const nextURL = new URL(context.dataURL || 'data', scope.location.href).href.replace(/\/$/, '');
        if (packURL && packURL !== nextURL) {
            packPromise = null; packURL = null; fetched.clear();
            for (const key of Taken.BUILT_IN) { Taken.store.outfits.delete(key); Taken.store.pictures.delete(key); }
        }
        // A prior project's pictures and fits cannot be reused by the next project.
        for (const key of [...Taken.store.outfits.keys()]) if (!Taken.BUILT_IN.includes(key)) Taken.store.outfits.delete(key);
        for (const key of [...Taken.store.pictures.keys()]) if (!Taken.BUILT_IN.includes(key)) Taken.store.pictures.delete(key);
        Taken.store.tints.clear();
        for (const t of context.transfers || []) {
            if (typeof t.key !== 'string' || !t.key) throw new Error('A transferred outfit key is required');
            if (t.outfit) Taken.store.outfits.set(t.key, Object.assign({}, t.outfit, { key: t.key }));
            if (t.picture) Taken.store.pictures.set(t.key, t.picture);
            if (Taken.BUILT_IN.includes(t.key)) continue;
            const id = Taken.register(Wardrobe, t.key, t.label || t.key);
            dynamic.add(t.key);
            if (t.id && t.id !== id) {
                if (Wardrobe.BY_ID.has(t.id)) throw new Error('Conflicting preview garment id: ' + t.id);
                const def = Wardrobe.BY_ID.get(id), preset = Wardrobe.PRESETS.find(p => p.id === id);
                Wardrobe.BY_ID.delete(id); def.id = t.id; Wardrobe.BY_ID.set(t.id, def);
                if (preset) { preset.id = t.id; preset.items = [{ id: t.id }]; }
            }
        }
    }
    async function ensureOutfits(recipe) {
        const ids = (Array.isArray(recipe.outfit) ? recipe.outfit : []).map(item => typeof item === 'string' ? item : item.id);
        const keys = new Set(ids.map(id => Wardrobe.BY_ID.get(id)?.transfer).filter(Boolean));
        for (const key of keys) {
            let outfit = Taken.store.outfits.get(key);
            if (outfit && Taken.store.pictures.has(key)) continue;
            if (!Taken.BUILT_IN.includes(key)) throw new Error('A project outfit snapshot and picture are required: ' + key);
            if (!fetched.has(key)) fetched.set(key, (async () => {
                const base = packURL + '/outfits/';
                if (!outfit) {
                    const [json, bin] = await Promise.all([
                        checkedFetch(base + key + '.json').then(r => r.json()),
                        checkedFetch(base + key + '.bin').then(r => r.arrayBuffer())
                    ]);
                    outfit = Taken.decode(json, new Uint8Array(bin)); outfit.key = key;
                    Taken.store.outfits.set(key, outfit);
                }
                if (!Taken.store.pictures.has(key)) Taken.store.pictures.set(key, await raster(new URL(outfit.picture || key + '.jpg', base).href));
            })());
            try { await fetched.get(key); } catch (error) { fetched.delete(key); throw error; }
        }
    }
    function renderPayload(result, options = {}) {
        const transfers = []; let bytes = 0;
        const copy = value => {
            if (!ArrayBuffer.isView(value) || value instanceof DataView) throw new TypeError('Character preview requires typed render arrays');
            const out = new value.constructor(value); transfers.push(out.buffer); bytes += out.byteLength; return out;
        };
        const parts = result.parts.map(part => {
            const out = {};
            for (const key of PART_FIELDS) if (part[key] !== undefined) out[key] = part[key];
            for (const key of GEOMETRY_FIELDS) if (part[key]) out[key] = copy(part[key]);
            return out;
        });
        const used = options.static ? new Set(parts.flatMap(part => [part.texture, part.emissiveTexture, part.normalTexture, part.metallicRoughnessTexture, part.occlusionTexture, part.iridescenceThicknessTexture]).filter(Boolean)) : null;
        const textures = Object.fromEntries(Object.entries(result.textures || {}).filter(([name]) => !used || used.has(name)).map(([name, source]) => {
            const texture = options.static ? scope.RRCharacterPreviewTextures.thumbnail(source, options.atlasSize || 256) : source;
            return [name, { name: texture.name, width: texture.width, height: texture.height, ...(texture.repeat ? { repeat: true } : {}), data: copy(texture.data) }];
        }));
        return { result: { parts, textures, height: result.height, bodyHeight: result.bodyHeight, plan: result.plan, focus: result.focus || {} }, transfers, bytes };
    }
    async function handle(message) {
        if (message.type === 'context') {
            try { configure(message.context); contextError = null; } catch (error) { contextError = error; }
            return;
        }
        if (message.type !== 'build') return;
        try {
            if (contextError) throw contextError;
            const bodyPack = await pack(); await ensureOutfits(message.recipe);
            const start = performance.now(), key = String(message.cacheKey || 'thumbnail');
            let cache = caches.get(key);
            if (!cache) { cache = { wardrobe: { emblemPictures: context.emblemPictures || new Map() } }; caches.set(key, cache); }
            while (caches.size > 8) caches.delete(caches.keys().next().value);
            const options = Object.assign({ quality: 'preview', skinSize: 256, atlasSize: 256 }, message.options, { eyeSource: context.eyeSource });
            if (options.static) options.eyeSource = scope.RRCharacterPreviewTextures.thumbnail(options.eyeSource, 128);
            const built = Model.build(bodyPack, message.recipe, cache, options);
            built.focus = Model.previewBounds ? Model.previewBounds(built) : {};
            const payload = renderPayload(built, options);
            payload.result.stats = { buildMs: performance.now() - start, threadId: 'browser', bytes: payload.bytes };
            const shoes = cache.wardrobe?.shoes;
            if (shoes instanceof Map) while (shoes.size > 12) shoes.delete(shoes.keys().next().value);
            scope.postMessage({ id: message.id, result: payload.result }, payload.transfers);
        } catch (error) { scope.postMessage({ id: message.id, error: { name: error.name, message: error.message, code: error.code } }); }
    }
    // Fetch and decode are asynchronous; retain message order across resource revisions.
    let pending = Promise.resolve();
    scope.onmessage = event => { pending = pending.then(() => handle(event.data)); };
})(self);
