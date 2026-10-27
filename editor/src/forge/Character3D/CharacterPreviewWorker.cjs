'use strict';

// Full thumbnail builds run in one Node worker. The page receives only static render data; it never
// runs a character build as an error fallback. A canceled active build finishes off the page before
// the newest work starts, while dispose() terminates it immediately.
const { Worker, isMainThread, parentPort, workerData, threadId } = require('node:worker_threads');
const PreviewTextures = require('./CharacterPreviewTextures.js');

function abortError(message = 'Character preview canceled') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}

// Drop fitting caches and catalog functions without copying large arrays on the page. postMessage
// snapshots their bytes once; the page's arrays remain usable by its main view and saved models.
function snapshotContext(context = {}) {
    // NW's browser and Node contexts have different constructors. Map's own method checks its
    // internal slot across realms; instanceof would silently discard a window.Map's entries.
    const entries = value => {
        try { return [...Map.prototype.entries.call(value)]; }
        catch (_) { return Object.entries(value || {}); }
    };
    return {
        eyeSource: context.eyeSource || null,
        emblemPictures: new Map(entries(context.emblemPictures)),
        projectPath: context.projectPath || null,
        transfers: (context.transfers || []).map(t => ({
            key: t.key, id: t.id, label: t.label, folder: t.folder, picture: t.picture,
            outfit: t.outfit ? Object.fromEntries(Object.entries(t.outfit).filter(([key, value]) => !key.startsWith('_') && typeof value !== 'function')) : null
        }))
    };
}

class PreviewWorker {
    constructor(options = {}) {
        this.options = options;
        this._worker = null;
        this._context = {};
        this._revision = 0;
        this._workerRevision = -1;
        this._jobs = new Map();
        this._queue = [];
        this._active = null;
        this._sequence = 0;
        this._disposed = false;
    }

    configure(context = {}) {
        if (this._disposed) throw abortError('Character preview worker is disposed');
        this.cancelAll();
        this._context = snapshotContext(context);
        this._revision++;
    }

    build(request) {
        if (this._disposed) return Promise.reject(abortError('Character preview worker is disposed'));
        if (!request || !request.recipe) return Promise.reject(new TypeError('A character preview recipe is required'));
        const key = String(request.key ?? JSON.stringify([request.recipe, request.options, request.cacheKey]));
        if (this._jobs.has(key)) return this._jobs.get(key).promise;
        if (this._queue.length >= (this.options.maxQueued ?? 32)) {
            const error = new Error('Character preview queue is full'); error.code = 'PREVIEW_QUEUE_FULL';
            return Promise.reject(error);
        }
        let snapshot;
        try { snapshot = { recipe: structuredClone(request.recipe), options: structuredClone(request.options), cacheKey: request.cacheKey }; }
        catch (error) { return Promise.reject(error); }
        const job = { id: ++this._sequence, key, revision: this._revision, request: snapshot, settled: false };
        job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
        this._jobs.set(key, job);
        this._queue.push(job);
        this._pump();
        return job.promise;
    }

    cancel(key) {
        const job = this._jobs.get(String(key));
        if (!job) return false;
        this._settle(job, abortError());
        this._queue = this._queue.filter(q => q !== job);
        return true;
    }

    cancelAll() {
        for (const job of [...this._jobs.values()]) this._settle(job, abortError());
        this._queue.length = 0;
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this.cancelAll();
        clearTimeout(this._timer);
        this._active = null;
        const worker = this._worker;
        this._worker = null;
        if (worker) worker.terminate();
    }

    _settle(job, error, result) {
        if (job.settled) return;
        job.settled = true;
        if (this._jobs.get(job.key) === job) this._jobs.delete(job.key);
        if (error) job.reject(error); else job.resolve(result);
    }

    _start() {
        if (this._worker) return this._worker;
        const create = this.options.createWorker || ((file, options) => new Worker(file, options));
        const worker = create(__filename, { workerData: { characterPreview: true, dataDir: this.options.dataDir } });
        this._worker = worker;
        this._workerRevision = -1;
        worker.on('message', data => {
            if (this._worker !== worker || !this._active || this._active.id !== data.id) return;
            const job = this._active;
            this._active = null;
            clearTimeout(this._timer);
            if (data.error) {
                const error = new Error(data.error.message); error.name = data.error.name || 'Error'; error.code = data.error.code;
                this._settle(job, error);
            } else if (job.revision !== this._revision) this._settle(job, abortError());
            else this._settle(job, null, data.result);
            this._pump();
        });
        worker.on('error', error => { if (this._worker === worker) this._fail(error); });
        worker.on('messageerror', error => { if (this._worker === worker) this._fail(error); });
        worker.on('exit', code => { if (this._worker === worker && !this._disposed) this._fail(new Error('Character preview worker exited (' + code + ')')); });
        return worker;
    }

    _fail(error) {
        clearTimeout(this._timer);
        const worker = this._worker;
        this._worker = null;
        this._active = null;
        for (const job of [...this._jobs.values()]) this._settle(job, error);
        this._queue.length = 0;
        if (worker) worker.terminate();
    }

    _pump() {
        if (this._disposed || this._active || !this._queue.length) return;
        const job = this._queue.shift();
        this._active = job;
        try {
            const worker = this._start();
            // Only a resource revision sends the pictures and dynamic registrations again.
            if (this._workerRevision !== this._revision) {
                worker.postMessage({ type: 'context', context: this._context });
                this._workerRevision = this._revision;
            }
            worker.postMessage({ type: 'build', id: job.id, recipe: job.request.recipe, options: job.request.options, cacheKey: job.request.cacheKey });
            this._timer = setTimeout(() => this._fail(new Error('Character preview worker timed out')), this.options.timeoutMs ?? 60000);
        } catch (error) { this._fail(error); }
    }
}

const PART_FIELDS = ['name', 'kind', 'color', 'texture', 'keepColors', 'normalTexture', 'normalScale', 'normalTexCoord', 'metallicRoughnessTexture', 'metallicRoughnessTexCoord', 'occlusionTexture', 'occlusionTexCoord', 'occlusionStrength', 'sheen', 'fabric', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange', 'iridescenceThicknessTexture', 'emissive', 'emissiveIntensity', 'emissiveTexture', 'roughness', 'metalness', 'doubleSided', 'opacity', 'cutout', 'alphaCutoff', 'onSkin', 'envMapIntensity', 'wet'];
const GEOMETRY_FIELDS = ['positions', 'normals', 'uvs', 'uvs1', 'colors', 'index'];

function renderPayload(result, options = {}) {
    const transfers = [];
    let bytes = 0;
    const copy = value => {
        if (!ArrayBuffer.isView(value) || value instanceof DataView) throw new TypeError('Character preview requires typed render arrays');
        const out = new value.constructor(value);
        transfers.push(out.buffer); bytes += out.byteLength;
        return out;
    };
    const parts = result.parts.map(part => {
        const out = {};
        for (const key of PART_FIELDS) if (part[key] !== undefined) out[key] = part[key];
        for (const key of GEOMETRY_FIELDS) if (part[key]) out[key] = copy(part[key]);
        return out;
    });
    const used = options.static ? new Set(parts.flatMap(part => [part.texture, part.emissiveTexture, part.normalTexture, part.metallicRoughnessTexture, part.occlusionTexture, part.iridescenceThicknessTexture]).filter(Boolean)) : null;
    const textures = Object.fromEntries(Object.entries(result.textures || {}).filter(([name]) => !used || used.has(name)).map(([name, source]) => {
        const texture = options.static ? PreviewTextures.thumbnail(source, options.atlasSize || 256) : source;
        return [name, { name: texture.name, width: texture.width, height: texture.height, ...(texture.repeat ? { repeat: true } : {}), data: copy(texture.data) }];
    }));
    return { result: { parts, textures, height: result.height, bodyHeight: result.bodyHeight, plan: result.plan, focus: result.focus || {} }, transfers, bytes };
}

async function serve() {
    // All modules and filesystem-backed lazy assets are loaded in the worker, never by the client.
    require('../../utils/QuadricDecimator.js');
    for (const name of ['HumanTargets', 'HumanBody', 'CharacterDrape', 'CharacterOutfit', 'CharacterFabric', 'CharacterWear', 'CharacterAtlas', 'CharacterClothes', 'CharacterSimplify', 'CharacterOutfitTransfer', 'CharacterPowerArmor', 'CharacterWasteland', 'ConstructionSurface', 'ConstructionPatterns', 'CharacterCyberGear', 'CharacterProps', 'CharacterGarmentDetails', 'CharacterReconConstruction', 'CharacterWardrobe', 'CharacterSpecies', 'CharacterBodyArtMotifs', 'CharacterBodyArt', 'CharacterSkin', 'CharacterBodyMods', 'CharacterHair', 'CreatureGear', 'CreatureArthropods', 'CreatureFlyers', 'CreatureReptiles', 'CreatureForms', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterPoses', 'MerfolkBody', 'CharacterCentaur', 'CharacterCloth', 'CharacterExpressions', 'SlimeBody']) require('./' + name + '.js');
    const Model = require('./CharacterModel.js'), Body = require('./HumanBody.js');
    const Wardrobe = require('./CharacterWardrobe.js'), Taken = require('./CharacterOutfitTransfer.js');
    if (workerData.dataDir) Body.dataFolder = () => require('node:path').resolve(workerData.dataDir);
    const pack = await Body.loadPack(workerData.dataDir && Body.dataFolder());
    let context = {}, contextError = null;
    const caches = new Map(), dynamic = new Set();
    const configure = next => {
        for (const key of dynamic) Taken.unregister(Wardrobe, key);
        dynamic.clear(); caches.clear();
        context = next || {};
        if (context.projectPath) {
            Taken.registerProject(Wardrobe, context.projectPath);
            for (const g of Wardrobe.GARMENTS) if (g.transfer?.startsWith('project:')) dynamic.add(g.transfer);
        }
        for (const t of context.transfers || []) {
            if (typeof t.key !== 'string' || !t.key) throw new Error('A transferred outfit key is required');
            if (t.folder) Taken.store.folders.set(t.key, t.folder);
            if (t.outfit) Taken.store.outfits.set(t.key, Object.assign({}, t.outfit, { key: t.key }));
            if (t.picture) Taken.store.pictures.set(t.key, t.picture);
            const existing = t.id && Wardrobe.BY_ID.get(t.id);
            if (existing && existing.transfer !== t.key) throw new Error('Conflicting preview garment id: ' + t.id);
            const id = existing ? existing.id : Taken.register(Wardrobe, t.key, t.label || t.key);
            if (t.id && t.id !== id) {
                if (Wardrobe.BY_ID.has(t.id)) throw new Error('Conflicting preview garment id: ' + t.id);
                const def = Wardrobe.BY_ID.get(id), preset = Wardrobe.PRESETS.find(p => p.id === id);
                Wardrobe.BY_ID.delete(id); def.id = t.id; Wardrobe.BY_ID.set(t.id, def);
                if (preset) { preset.id = t.id; preset.items = [{ id: t.id }]; }
            }
            if (!Taken.BUILT_IN.includes(t.key)) dynamic.add(t.key);
        }
    };
    parentPort.on('message', message => {
        if (message.type === 'context') {
            try { configure(message.context); contextError = null; } catch (error) { contextError = error; }
            return;
        }
        if (message.type !== 'build') return;
        try {
            if (contextError) throw contextError;
            const start = performance.now(), key = String(message.cacheKey || 'thumbnail');
            let cache = caches.get(key);
            if (!cache) { cache = { wardrobe: { emblemPictures: context.emblemPictures || new Map() } }; caches.set(key, cache); }
            while (caches.size > 8) caches.delete(caches.keys().next().value);
            const options = Object.assign({ quality: 'preview', skinSize: 256, atlasSize: 256 }, message.options, { eyeSource: context.eyeSource });
            if (options.static) options.eyeSource = PreviewTextures.thumbnail(options.eyeSource, 128);
            const built = Model.build(pack, message.recipe, cache, options);
            built.focus = Model.previewBounds(built);
            const payload = renderPayload(built, options);
            payload.result.stats = { buildMs: performance.now() - start, threadId, bytes: payload.bytes };
            // Shoe and tint variants grow during editing; retain only a small useful working set.
            const shoes = cache.wardrobe?.shoes;
            if (shoes instanceof Map) while (shoes.size > 12) shoes.delete(shoes.keys().next().value);
            parentPort.postMessage({ id: message.id, result: payload.result }, payload.transfers);
        } catch (error) { parentPort.postMessage({ id: message.id, error: { name: error.name, message: error.message, code: error.code } }); }
    });
}

if (!isMainThread && workerData?.characterPreview) serve().catch(error => { throw error; });
else module.exports = { PreviewWorker, snapshotContext, renderPayload };
