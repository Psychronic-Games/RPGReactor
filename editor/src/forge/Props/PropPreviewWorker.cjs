'use strict';

// Prop Builder preview builds in one reused Node worker, so a slow prop never stops the page while
// a slider or a color moves. The worker keeps its own warm prop cache and only ever feeds the view:
// Save still builds on the page, as it always has. One build runs at a time; the page holds only the
// newest request behind it, so stale values are never built.
//
// Arrays cross once. A picture or part the worker's cache kept from the last build travels as a
// reference, which spares the copy and lets the view see the very same array and skip its upload.
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');

const FIELD_TYPES = { positions: 'Float32Array', normals: 'Float32Array', uvs: 'Float32Array', uvs1: 'Float32Array', colors: 'Float32Array', weights: 'Float32Array', joints: 'Uint16Array', index: 'Uint32Array' };
const ARRAY = '__propArray';

/** The prop modules, in the page's own order, minus what only draws on a page. */
function scriptFiles(editorDir = path.resolve(__dirname, '..', '..', '..')) {
    const html = fs.readFileSync(path.join(editorDir, 'index.html'), 'utf8');
    return [...html.matchAll(/<script src="(src\/forge\/(?:Props|Character3D)\/[^"]+\.js)"/g)].map(m => m[1])
        .filter(file => !/(Builder|Panel|SpriteSheet|PreviewBrowser)[^/]*\.js$/.test(file))
        .map(file => path.join(editorDir, file));
}

const checksum = array => {
    let sum = array.length;
    for (let i = 0; i < array.length; i++) sum = (sum * 31 + array[i] * 1024) % 4294967291;
    return sum;
};

/**
 * pack(result) gives { result, fresh, transfers }: the build as plain data, each array replaced by a
 * marker, `fresh` holding only the arrays the page lacks. Functions stay behind: nothing the view
 * reads from a build is one, and a prop that moves stays on the page because its motion needs them.
 */
function createPacker() {
    const known = new WeakMap();
    let shown = new Set(), nextId = 1;
    return function pack(result) {
        const now = new Set(), fresh = [], transfers = [], seen = new Map();
        const share = (array, type, stamp) => {
            const had = known.get(array);
            let id = had && had.stamp === stamp && shown.has(had.id) ? had.id : 0;
            if (!id) {
                id = nextId++;
                known.set(array, { id, stamp });
                const copy = Array.isArray(array) ? globalThis[type].from(array) : array.slice();
                fresh.push({ id, type, data: copy });
                transfers.push(copy.buffer);
            }
            now.add(id);
            return { [ARRAY]: id };
        };
        const walk = (value, key) => {
            if (typeof value === 'function') return undefined;
            if (value === null || typeof value !== 'object') return value;
            if (ArrayBuffer.isView(value)) {
                if (value instanceof DataView) return undefined;
                const type = value.constructor.name;
                // A picture keeps its array only while it is unchanged; geometry is checked, being cheap here.
                return share(value, type === 'Buffer' ? 'Uint8Array' : type, value.length > 1048576 ? 0 : checksum(value));
            }
            if (seen.has(value)) return seen.get(value);
            if (Array.isArray(value)) {
                if (FIELD_TYPES[key] && value.length) return share(value, FIELD_TYPES[key], checksum(value));
                const out = [];
                seen.set(value, out);
                for (const item of value) out.push(walk(item, key));
                return out;
            }
            if (value instanceof Map || value instanceof Set) return value;
            const out = {};
            seen.set(value, out);
            for (const name of Object.keys(value)) {
                if (name.startsWith('_')) continue;
                const item = walk(value[name], name);
                if (item !== undefined) out[name] = item;
            }
            return out;
        };
        const plain = walk(result);
        shown = now;
        return { result: plain, fresh, transfers };
    };
}

/** The packed build back as a build: `store` is id -> array as of the last one, and is replaced here. */
function unpack(message, store, arrays) {
    const next = new Map();
    for (const item of message.fresh) {
        const Type = arrays[item.type];
        next.set(item.id, new Type(item.data.buffer, item.data.byteOffset, item.data.length));
    }
    const walk = value => {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            if (typeof value[0] === 'number') return value;
            for (let i = 0; i < value.length; i++) value[i] = walk(value[i]);
            return value;
        }
        if (value[ARRAY]) {
            const id = value[ARRAY], array = next.get(id) || store.get(id);
            if (!array) throw new Error('A prop preview array went missing');
            next.set(id, array);
            return array;
        }
        if (value instanceof Map || value instanceof Set) return value;
        for (const name of Object.keys(value)) value[name] = walk(value[name]);
        return value;
    };
    const result = walk(message.result);
    store.clear();
    for (const [id, array] of next) store.set(id, array);
    return result;
}

class PropPreviewClient {
    /** `onDone(job, { result } | { error } | { stayOnPage: true })`, and always once per build. */
    constructor(options) {
        this.options = options;
        this._arrays = options.arrays || globalThis;
        this._store = new Map();
        this._jobs = new Map();
        this._sequence = 0;
        this._images = null;
        this._disposed = false;
        this._worker = new Worker(__filename, { workerData: { propPreview: true, files: options.files || scriptFiles() } });
        this._worker.on('message', message => this._message(message));
        this._worker.on('error', error => this._fatal(error));
        this._worker.on('exit', () => this._fatal(new Error('The prop preview worker stopped')));
    }

    /** Pictures only cross when they changed. A new project starts the worker's cache over. */
    syncImages(images, project) {
        const mark = project + '|' + Object.entries(images || {}).map(([name, image]) => name + ':' + (image.version || image.width)).join('|');
        if (mark === this._images) return;
        const fresh = project !== this._project;
        this._images = mark; this._project = project;
        this._worker.postMessage({ type: 'images', images: images || {}, fresh });
    }

    build(job) {
        if (this._disposed) throw new Error('The prop preview worker is disposed');
        const id = ++this._sequence;
        this._jobs.set(id, job);
        this._worker.postMessage({ type: 'build', id, recipe: job.recipe, options: { textureSize: job.textureSize } });
        this._arm();
        return id;
    }

    _arm() {
        clearTimeout(this._timer);
        if (this._jobs.size) this._timer = setTimeout(() => this._fatal(new Error('The prop preview worker timed out')), this.options.timeoutMs ?? 60000);
    }

    _message(message) {
        const job = this._jobs.get(message.id);
        if (!job) return;
        this._jobs.delete(message.id);
        this._arm();
        let reply;
        if (message.error) reply = { error: message.error };
        else if (message.stayOnPage) reply = { stayOnPage: true };
        else {
            try { reply = { result: unpack(message, this._store, this._arrays), ms: message.ms }; }
            catch (error) { reply = { error: error.message }; }
        }
        this.options.onDone(job, reply);
    }

    _fatal(error) {
        if (this._disposed) return;
        this.dispose();
        this.options.onFatal?.(error);
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        clearTimeout(this._timer);
        this._jobs.clear();
        this._worker.terminate();
    }
}

async function serve() {
    global.THREE = require(path.resolve(__dirname, '..', '..', '..', 'node_modules', 'three'));
    for (const file of workerData.files) require(file);
    const Model = require('./PropModel.js');
    const pack = createPacker();
    let cache = {}, images = {};
    parentPort.on('message', async message => {
        if (message.type === 'images') {
            images = message.images;
            if (message.fresh) cache = {};
            return;
        }
        const start = performance.now();
        try {
            const kind = Model.BY_ID.get(message.recipe.kind);
            if (!kind) throw new Error('The preview worker has no prop kind ' + message.recipe.kind);
            await kind.prepare?.();
            const built = Model.build(message.recipe, cache, { textureSize: message.options.textureSize, images });
            if (Model.moves(built)) { parentPort.postMessage({ id: message.id, stayOnPage: true }); return; }
            const { result, fresh, transfers } = pack(built);
            parentPort.postMessage({ id: message.id, result, fresh, ms: performance.now() - start }, transfers);
        } catch (error) { parentPort.postMessage({ id: message.id, error: String(error && error.message || error) }); }
    });
}

if (!isMainThread && workerData?.propPreview) serve().catch(error => { throw error; });
else module.exports = { PropPreviewClient, createPacker, unpack, scriptFiles };
