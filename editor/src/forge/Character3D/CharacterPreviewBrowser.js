/** Full character thumbnails in a classic browser worker, including WebHost without Node. */
(function(root) {
    'use strict';
    const scriptURL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
    function abortError(message = 'Character preview canceled') {
        const error = new Error(message); error.name = 'AbortError'; error.code = 'ABORT_ERR'; return error;
    }
    function snapshotContext(context = {}) {
        const entries = value => {
            try { return [...Map.prototype.entries.call(value)]; }
            catch (_) { return Object.entries(value || {}); }
        };
        return {
            eyeSource: context.eyeSource || null,
            emblemPictures: new Map(entries(context.emblemPictures)),
            projectPath: context.projectPath || null,
            dataURL: context.dataURL || null,
            transfers: (context.transfers || []).map(t => ({
                key: t.key, id: t.id, label: t.label, folder: t.folder, picture: t.picture,
                outfit: t.outfit ? Object.fromEntries(Object.entries(t.outfit).filter(([key, value]) => !key.startsWith('_') && typeof value !== 'function')) : null
            }))
        };
    }
    class PreviewWorker {
        constructor(options = {}) {
            this.options = options; this._context = {}; this._worker = null;
            this._revision = 0; this._workerRevision = -1; this._sequence = 0;
            this._jobs = new Map(); this._queue = []; this._active = null; this._disposed = false;
        }
        configure(context = {}) {
            if (this._disposed) throw abortError('Character preview worker is disposed');
            this.cancelAll(); this._context = snapshotContext(context); this._revision++;
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
            const job = { id: ++this._sequence, key, revision: this._revision, request, settled: false };
            job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
            this._jobs.set(key, job); this._queue.push(job); this._pump(); return job.promise;
        }
        cancel(key) {
            const job = this._jobs.get(String(key));
            if (!job) return false;
            this._settle(job, abortError()); this._queue = this._queue.filter(q => q !== job); return true;
        }
        cancelAll() {
            for (const job of [...this._jobs.values()]) this._settle(job, abortError());
            this._queue.length = 0;
        }
        dispose() {
            if (this._disposed) return;
            this._disposed = true; this.cancelAll(); clearTimeout(this._timer); this._active = null;
            const worker = this._worker; this._worker = null; if (worker) worker.terminate();
        }
        _settle(job, error, result) {
            if (job.settled) return;
            job.settled = true;
            if (this._jobs.get(job.key) === job) this._jobs.delete(job.key);
            if (error) job.reject(error); else job.resolve(result);
        }
        _start() {
            if (this._worker) return this._worker;
            if (!this.options.createWorker && typeof root.Worker !== 'function') {
                const error = new Error('Browser character preview workers are unavailable'); error.code = 'PREVIEW_WORKER_UNAVAILABLE'; throw error;
            }
            const file = this.options.workerURL || (scriptURL ? new URL('CharacterPreviewBrowserEntry.js', scriptURL).href : null);
            if (!file) {
                const error = new Error('A browser character preview worker URL is required'); error.code = 'PREVIEW_WORKER_UNAVAILABLE'; throw error;
            }
            const create = this.options.createWorker || (file => new root.Worker(file));
            const worker = create(file, { name: 'rr-character-preview' });
            this._worker = worker; this._workerRevision = -1;
            worker.onmessage = event => {
                const data = event.data;
                if (this._worker !== worker || !data || !this._active || this._active.id !== data.id) return;
                const job = this._active; this._active = null; clearTimeout(this._timer);
                if (data.error) {
                    const error = new Error(data.error.message); error.name = data.error.name || 'Error'; error.code = data.error.code;
                    this._settle(job, error);
                } else if (job.revision !== this._revision) this._settle(job, abortError());
                else this._settle(job, null, data.result);
                this._pump();
            };
            worker.onerror = event => {
                if (this._worker !== worker) return;
                if (event.preventDefault) event.preventDefault();
                this._fail(new Error(event.message || 'Browser character preview worker failed'));
            };
            worker.onmessageerror = () => { if (this._worker === worker) this._fail(new Error('Invalid browser character preview response')); };
            return worker;
        }
        _fail(error) {
            clearTimeout(this._timer); const worker = this._worker; this._worker = null; this._active = null;
            for (const job of [...this._jobs.values()]) this._settle(job, error);
            this._queue.length = 0; if (worker) worker.terminate();
        }
        _pump() {
            if (this._disposed || this._active || !this._queue.length) return;
            const job = this._queue.shift(); this._active = job;
            try {
                const worker = this._start();
                if (this._workerRevision !== this._revision) {
                    worker.postMessage({ type: 'context', context: Object.assign({}, this._context, { dataURL: this._context.dataURL || this.options.dataURL }) });
                    this._workerRevision = this._revision;
                }
                worker.postMessage({ type: 'build', id: job.id, recipe: job.request.recipe, options: job.request.options, cacheKey: job.request.cacheKey });
                this._timer = setTimeout(() => this._fail(new Error('Character preview worker timed out')), this.options.timeoutMs ?? 60000);
            } catch (error) { this._fail(error); }
        }
    }
    const api = { PreviewWorker, snapshotContext };
    root.RRCharacterPreviewWorker = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
