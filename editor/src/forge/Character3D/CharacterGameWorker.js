/*
 * Character Creation in a game: the Forge's own modules in a worker, so the
 * game keeps running while a character is built and the model that comes out
 * is the Builder's. CharacterPreviewBrowserEntry.js brings every module in;
 * this adds making a finished model from a recipe.
 *
 *   { type: 'tabs', id, rules }                     the controls the rules allow
 *   { type: 'build', id, recipe, rules, final, preset, quality }
 *        a model: { recipe, glb, sidecar, rig, height }. `final` carries the
 *        whole motion set; otherwise it is a quick look with its Idle.
 */
// The rigger comes first and by name: without it savedModel makes no rig, and says nothing.
importScripts('../../database/ModelRigger.js', '../../database/ModelAutoRig.js', 'CharacterPreviewBrowserEntry.js', 'CharacterControls.js');
(function(scope) {
    'use strict';
    const Body = scope.RRHumanBody, Model = scope.RRCharacterModel, Poses = scope.RRCharacterPoses;
    const Controls = scope.RRCharacterControls, Wardrobe = scope.RRCharacterWardrobe, Skin = scope.RRCharacterSkin;
    const DATA = new URL('data', scope.location.href).href;
    let readied = null;

    async function picture(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Character data is missing: ' + url);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const data = new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer);
        bitmap.close();
        return { width: canvas.width, height: canvas.height, data };
    }

    let cache = null;

    /**
     * The outfits taken whole from another model (the Star Shift presets) that `recipe` wears, read before the build:
     * a worker has no `require`, so one not brought in here was quietly left out, and a player who picked the
     * Captain's Uniform got its gloves and boots alone. The editor's own preview worker does the same.
     */
    const Taken = scope.RRCharacterOutfitTransfer, fetchedOutfits = new Map();
    async function ensureOutfits(recipe) {
        if (!Taken || !Taken.store) return;
        const ids = (Array.isArray(recipe.outfit) ? recipe.outfit : []).map(item => typeof item === 'string' ? item : item && item.id);
        const keys = new Set(ids.map(id => Wardrobe.BY_ID.get(id)?.transfer).filter(Boolean));
        for (const key of keys) {
            if (Taken.store.outfits.get(key) && Taken.store.pictures.has(key)) continue;
            if (!Taken.BUILT_IN.includes(key)) continue;
            if (!fetchedOutfits.has(key)) fetchedOutfits.set(key, (async () => {
                const base = DATA + '/outfits/';
                let outfit = Taken.store.outfits.get(key);
                if (!outfit) {
                    const [json, bin] = await Promise.all([
                        fetch(base + key + '.json').then(r => { if (!r.ok) throw new Error('Character data is missing: ' + key + '.json'); return r.json(); }),
                        fetch(base + key + '.bin').then(r => { if (!r.ok) throw new Error('Character data is missing: ' + key + '.bin'); return r.arrayBuffer(); })
                    ]);
                    outfit = Taken.decode(json, new Uint8Array(bin)); outfit.key = key;
                    Taken.store.outfits.set(key, outfit);
                }
                if (!Taken.store.pictures.has(key)) Taken.store.pictures.set(key, await picture(new URL(outfit.picture || key + '.jpg', base).href));
            })());
            try { await fetchedOutfits.get(key); } catch (error) { fetchedOutfits.delete(key); throw error; }
        }
    }

    function ready() {
        if (!readied) readied = (async () => {
            // None of these wait on another, so they download together.
            const eye = picture(DATA + '/eye-brown.png'), motions = scope.RRMotionLibrary.loadAsync(DATA + '/reactor_3d_motions.bin');
            const pack = await Body.loadPack(DATA);
            await Promise.all([Body.prepareAuthoring(pack, DATA), motions]);
            return { pack, eyeSource: await eye };
        })().catch(error => { readied = null; throw error; });
        return readied;
    }

    // A picture already made into a PNG is not made again: a change of shirt keeps the skin, the hair and most cloth
    // tiles as they were (the same texture objects, from the build's cache), and every look encoded all of them anew.
    // The sum guards a picture repainted in place.
    const encoded = new WeakMap();
    function sumOf(data) {
        let sum = data.length;
        for (let i = 0; i < data.length; i += 997) sum = (sum * 31 + data[i]) | 0;
        return sum;
    }
    async function png(texture) {
        const sum = sumOf(texture.data), kept = encoded.get(texture);
        if (kept && kept.sum === sum && kept.data === texture.data) return kept.bytes;
        const bytes = await encodePng(texture);
        encoded.set(texture, { sum, data: texture.data, bytes });
        return bytes;
    }

    async function encodePng(texture) {
        const canvas = new OffscreenCanvas(texture.width, texture.height);
        const bytes = new Uint8ClampedArray(texture.data.buffer, texture.data.byteOffset, texture.width * texture.height * 4);
        canvas.getContext('2d').putImageData(new ImageData(bytes, texture.width, texture.height), 0, 0);
        return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    }

    function recipeOf(message) {
        let recipe = message.recipe || {};
        if (message.species) recipe = Model.withSpecies(recipe, message.species);
        if (message.preset) {
            const preset = Wardrobe.PRESETS.find(p => p.id === message.preset);
            // Dressed as the editor dresses the same preset: a woman's bare-chested outfit gains its top there
            // (Wardrobe.dressFor), and the game gave her none.
            if (preset) {
                const female = Body.sexOf ? Body.sexOf(recipe) === 'female' : false;
                const items = Wardrobe.dressFor ? Wardrobe.dressFor(preset.items, female) : preset.items;
                recipe = Object.assign({}, recipe, { outfit: JSON.parse(JSON.stringify(items)) });
            }
        }
        return Model.normalize(Controls.enforce(recipe, message.rules));
    }

    const MOUTH_SHAPES = (scope.RRCharacterExpressions?.VISEMES || []).filter(viseme => viseme.id !== 'rest').map(viseme => 'viseme_' + viseme.id).concat('blink');

    async function build(message) {
        const { pack, eyeSource } = await ready(), recipe = recipeOf(message), started = performance.now();
        const quality = message.final && message.quality === 'high' ? { quality: 'save' } : { quality: 'preview', skinSize: 1024, atlasSize: 1024 };
        // Kept between builds, as the editor keeps its own: a change of shirt reuses the skin, hair and the rest.
        if (!cache || cache._rrQuality !== quality.quality) cache = { _rrQuality: quality.quality };
        await ensureOutfits(recipe);
        const result = Model.build(pack, recipe, cache, Object.assign(quality, { eyeSource }));
        const shoes = cache.wardrobe?.shoes;
        if (shoes instanceof Map) while (shoes.size > 12) shoes.delete(shoes.keys().next().value);
        // A finished character can speak, by text or by voice. Only 'save' quality brings these by itself.
        if (message.final && !result.morphs?.length) result.morphs = scope.RRCharacterExpressions?.morphTargets(pack, result, MOUTH_SHAPES) || [];
        const made = message.final ? Poses.savedModel(result, 'useful') : null;
        if (made) {
            const names = new Set((result.clips || []).map(clip => clip.name));
            result.clips = (result.clips || []).concat(made.clips.filter(clip => !names.has(clip.name)));
        } else if (!message.final) {
            result.clips = (result.clips || []).filter(clip => clip.name === 'Idle');
        }
        const bytes = await Model.toGlb(result, 'Character', png);
        const glb = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const rig = made && made.rigBinary ? made.rigBinary.slice().buffer : null;
        return { value: { recipe, glb, rig, sidecar: Object.assign({}, result.sidecar || {}, made ? made.sidecar : {}), height: result.height, buildMs: performance.now() - started },
            transfer: rig ? [glb, rig] : [glb] };
    }

    const forge = scope.onmessage;
    scope.onmessage = event => {
        const message = event.data;
        if (message.type === 'tabs') { scope.postMessage({ id: message.id, value: Controls.tabs(message.rules) }); ready().catch(() => null); return; }
        if (message.type === 'warm') { ready().then(() => scope.postMessage({ id: message.id, value: true }), error => scope.postMessage({ id: message.id, error: String(error && error.message || error) })); return; }
        if (message.type !== 'build') { forge(event); return; }
        build(message).then(({ value, transfer }) => scope.postMessage({ id: message.id, value }, transfer),
            error => scope.postMessage({ id: message.id, error: String(error && error.message || error) }));
    };
})(self);
