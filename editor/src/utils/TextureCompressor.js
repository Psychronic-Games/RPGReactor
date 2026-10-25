/**
 * RRTextureCompressor - KTX2 (Basis Universal, UASTC) copies of model pictures, made off the
 * editor's main thread.
 *
 * The encoder is the Basis Universal WebAssembly build in `libs/basis/` (from ktx2-encoder 0.6.0).
 * In the editor a worker decodes each picture and encodes it; under Node (tests, scripts) the
 * same encode runs in process. UASTC is transcoded by the game to BC7, ETC2 or S3TC at full
 * quality; `LEVEL` 1 takes about 5 s for a 2048 picture on a fast desktop core (0 is about 1 s,
 * 2 about 17 s). Mip levels are made by the encoder, in sRGB.
 */
(function(root) {
    'use strict';

    const LEVEL = 1;
    const ENCODER = 'libs/basis/basis_encoder.js';
    const WASM = 'libs/basis/basis_encoder.wasm';

    /** One picture's RGBA (unpremultiplied, rows top first) to KTX2 bytes, with `basis` an initialized encoder module. */
    function encodeRgba(basis, rgba, width, height, level) {
        const encoder = new basis.BasisEncoder();
        try {
            if (encoder.setDebug) encoder.setDebug(false);
            encoder.setCreateKTX2File(true);
            (encoder.setKTX2AndBasisSRGBTransferFunc || encoder.setKTX2SRGBTransferFunc).call(encoder, true);
            encoder.setMipGen(true);
            if (encoder.setMipSRGB) encoder.setMipSRGB(true);
            encoder.setPerceptual(true);
            encoder.setUASTC(true);
            encoder.setKTX2UASTCSupercompression(true);
            encoder.setPackUASTCFlags(level == null ? 1 : level);
            if (!encoder.setSliceSourceImage(0, rgba, width, height, 0)) throw new Error('the encoder refused the picture');
            let capacity = Math.ceil(width * height * 4 * 4 / 3) + 65536;
            for (let attempt = 0; attempt < 2; attempt++, capacity *= 2) {
                const out = new Uint8Array(capacity);
                const length = encoder.encode(out);
                if (length > 0) return out.slice(0, length);
            }
            throw new Error('the encoder made nothing');
        } finally {
            encoder.delete();
        }
    }

    /** The encoder's ES module made a classic script (a worker loads it with no module support). */
    function classicSource(source) {
        return source.replace(/export\s+default\s+BASIS\s*;?/, 'self.BASIS = BASIS;').replace(/import\.meta\.url/g, 'self.location.href');
    }

    /** The worker's message loop: the first message brings the encoder, each later one a picture's bytes. */
    function workerLoop(scope) {
        let ready = null;
        scope.onmessage = async event => {
            const job = event.data;
            if (job.init) {
                ready = scope.BASIS({ wasmBinary: job.wasm, locateFile: name => name }).then(basis => { basis.initializeBasis(); return basis; });
                return;
            }
            try {
                const basis = await ready;
                const bitmap = await createImageBitmap(new Blob([job.bytes], { type: job.mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                const ktx2 = ENCODE(basis, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), canvas.width, canvas.height, job.level);
                scope.postMessage({ id: job.id, ktx2 }, [ktx2.buffer]);
            } catch (error) {
                scope.postMessage({ id: job.id, error: String(error && error.message || error) });
            }
        };
    }

    let worker = null;
    const jobs = new Map();
    let serial = 0;

    /** The editor's encode worker, made once (null where there is no page to make it in). */
    function ensureWorker() {
        if (worker) return worker;
        if (typeof Worker === 'undefined' || typeof fetch !== 'function') return null;
        worker = Promise.all([
            fetch(ENCODER).then(response => response.text()),
            fetch(WASM).then(response => response.arrayBuffer())
        ]).then(([source, wasm]) => {
            const body = classicSource(source) + '\n;\nconst ENCODE = ' + encodeRgba.toString() + ';\n(' + workerLoop.toString() + ')(self);\n';
            const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
            const made = new Worker(url, { name: 'Reactor texture encode' });
            URL.revokeObjectURL(url);
            made.onmessage = event => {
                const job = jobs.get(event.data && event.data.id);
                if (!job) return;
                jobs.delete(job.id);
                if (event.data.error) job.reject(new Error(event.data.error)); else job.resolve(event.data.ktx2);
            };
            made.onerror = event => {
                if (event && event.preventDefault) event.preventDefault();
                for (const job of jobs.values()) job.reject(new Error('the texture encoder stopped'));
                jobs.clear();
                worker = null;
            };
            made.postMessage({ init: true, wasm }, [wasm]);
            return made;
        });
        worker.catch(() => { worker = null; });
        return worker;
    }

    /** KTX2 bytes for a PNG or JPEG picture's bytes, made in the encode worker. */
    function encode(bytes, mimeType, level) {
        const made = ensureWorker();
        if (!made) return Promise.reject(new Error('no worker to encode in'));
        return made.then(ready => new Promise((resolve, reject) => {
            const id = ++serial;
            jobs.set(id, { id, resolve, reject });
            const copy = new Uint8Array(bytes).slice();
            ready.postMessage({ id, bytes: copy.buffer, mimeType, level: level == null ? LEVEL : level }, [copy.buffer]);
        }));
    }

    /** The encode worker is let go (an import that compressed is done with it). */
    function release() {
        if (!worker) return;
        const done = worker;
        worker = null;
        done.then(made => made.terminate(), () => {});
    }

    /** Node: KTX2 bytes for RGBA pixels, encoded in this process. */
    async function encodeRgbaInProcess(rgba, width, height, level) {
        const path = require('path'), fs = require('fs'), url = require('url');
        const file = path.join(__dirname, '..', '..', ENCODER);
        if (!encodeRgbaInProcess.basis) {
            const BASIS = (await import(url.pathToFileURL(file).href)).default;
            encodeRgbaInProcess.basis = await BASIS({ wasmBinary: fs.readFileSync(file.replace(/\.js$/, '.wasm')) });
            encodeRgbaInProcess.basis.initializeBasis();
        }
        return encodeRgba(encodeRgbaInProcess.basis, rgba, width, height, level == null ? LEVEL : level);
    }

    const api = { LEVEL, encode, release, encodeRgba, encodeRgbaInProcess, classicSource, workerLoop };
    root.RRTextureCompressor = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
