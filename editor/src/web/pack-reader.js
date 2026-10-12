/**
 * Serves a web build's files out of pack archives, so a project of thousands of files ships as a few.
 *
 * A build made with packing (build-scripts/web-pack.cjs) keeps most files inside ordinary zip archives under
 * `packs/`, with `packs/index.json` saying where each one lies: `files[path] = [pack, offset, stored, size,
 * method]` (method 0 as it is, 8 deflated). A service worker answers a request for such a file with those bytes,
 * fetched from the archive by byte range; a server that sends the whole archive instead has it kept in the
 * browser's cache and cut from there. The page asks for `img/pictures/a.png` as it always did.
 *
 * Runs in a service worker (`self.RRPackReader`); `options` stand in for the worker's `fetch` and `caches` in tests.
 */
(function(scope) {
    'use strict';
    const INDEX = 'packs/index.json';
    const CACHE = 'rr-packs';
    const TYPES = {
        json: 'application/json; charset=utf-8', js: 'text/javascript; charset=utf-8', html: 'text/html; charset=utf-8',
        css: 'text/css; charset=utf-8', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', apng: 'image/apng',
        svg: 'image/svg+xml', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
        webm: 'video/webm', mp4: 'video/mp4', wasm: 'application/wasm', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
        ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    };

    function contentType(path) {
        return TYPES[String(path).split('.').pop().toLowerCase()] || 'application/octet-stream';
    }

    /** The part of a file a `Range` header asks for, as first and last byte, or null for all of it (or one it cannot give). */
    function parseRange(header, size) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
        if (!match || (!match[1] && !match[2])) return null;
        let start, end;
        if (!match[1]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
        else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
        return start <= end && start < size ? { start, end } : null;
    }

    /** A reader for the packs under `base` (the folder that holds `packs/`, as a URL). */
    function create(base, options = {}) {
        const fetchFn = options.fetch || ((...args) => scope.fetch(...args));
        const cachesApi = options.caches === undefined ? scope.caches : options.caches;
        const packUrl = name => new URL(`packs/${name}`, base).href;
        let index = null;
        // Per pack: how it is read (`probe`).
        const whole = new Map();

        function load() {
            if (index) return index;
            index = Promise.resolve(fetchFn(new URL(INDEX, base).href, { cache: 'no-cache' })).then(async response => {
                if (!response.ok) return null;
                const data = await response.json();
                if (!data || !Array.isArray(data.packs) || !data.files) return null;
                forget(data.packs.map(packUrl));
                return data;
            });
            // A build without packs asks once; a request that failed is asked again.
            index.catch(() => { index = null; });
            return index;
        }

        /** Archives kept for an earlier version of the build are let go. */
        async function forget(current) {
            if (!cachesApi) return;
            try {
                const cache = await cachesApi.open(CACHE);
                for (const request of await cache.keys()) {
                    if (request.url.startsWith(new URL('packs/', base).href) && !current.includes(request.url)) await cache.delete(request);
                }
            } catch (error) { /* a browser without storage serves from the network alone */ }
        }

        async function kept(url) {
            if (!cachesApi) return null;
            try {
                const hit = await (await cachesApi.open(CACHE)).match(url);
                return hit ? await hit.blob() : null;
            } catch (error) { return null; }
        }

        async function keep(url, blob) {
            if (!cachesApi) return;
            try { await (await cachesApi.open(CACHE)).put(url, new Response(blob, { headers: { 'Content-Length': String(blob.size) } })); }
            catch (error) { /* out of room: it stays in memory for this worker's life */ }
        }

        /**
         * How a pack is read, found out by the first request for it: "range" (the server cuts byte ranges) or the
         * whole archive as a Blob (it does not: the archive is kept, and cut here). The requests that come while
         * that first one is out wait for its answer, so an archive is never brought down twice.
         */
        function probe(pack, url, start, length) {
            const state = {};
            state.ready = (async () => {
                const held = await kept(url);
                if (held) return held;
                const response = await fetchFn(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
                if (response.status === 206) { state.first = response; return 'range'; }
                if (!response.ok) throw new Error(`Pack ${url} could not be read (${response.status}).`);
                const all = await response.blob();
                await keep(url, all);
                return all;
            })();
            // A pack that could not be reached is tried again by the next request.
            state.ready.catch(() => { if (whole.get(pack) === state) whole.delete(pack); });
            whole.set(pack, state);
            return state;
        }

        /** `length` bytes of a pack from `start`: a stream from the network, or a slice of the archive when it is held whole. */
        async function bytes(pack, start, length, data) {
            const url = packUrl(data.packs[pack]);
            const first = !whole.has(pack), state = first ? probe(pack, url, start, length) : whole.get(pack);
            const how = await state.ready;
            if (how !== 'range') return how.slice(start, start + length);
            // (The request that found out carries its own answer.)
            const response = first ? state.first : await fetchFn(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
            if (first) state.first = null;
            if (response.status !== 206) throw new Error(`Pack ${data.packs[pack]} could not be read (${response.status}).`);
            return response.body || response.blob();
        }

        /** Whether a path is in the packs (a promise: the index is asked for first). */
        function has(relativePath) {
            return load().then(data => !!(data && data.files[relativePath]));
        }

        /** The response for a packed file, or null when the path is not in a pack. */
        async function respond(relativePath, request) {
            const data = await load();
            const entry = data && Object.prototype.hasOwnProperty.call(data.files, relativePath) ? data.files[relativePath] : null;
            if (!entry) return null;
            const [pack, offset, stored, size, method] = entry;
            const headers = { 'Content-Type': contentType(relativePath), 'Content-Length': String(size), 'Accept-Ranges': method ? 'none' : 'bytes' };
            if (request && request.method === 'HEAD') return new Response(null, { status: 200, headers });
            if (!size) return new Response(new Blob([]), { status: 200, headers });
            // A part of a file kept as it is (a video seeking, audio streaming) is that part of the pack.
            const range = method ? null : parseRange(request && request.headers && request.headers.get('Range'), size);
            if (range) {
                const length = range.end - range.start + 1;
                const part = await bytes(pack, offset + range.start, length, data);
                return new Response(part, { status: 206, headers: Object.assign(headers, { 'Content-Length': String(length), 'Content-Range': `bytes ${range.start}-${range.end}/${size}` }) });
            }
            let body = await bytes(pack, offset, stored, data);
            if (method === 8) body = (body instanceof Blob ? body.stream() : body).pipeThrough(new DecompressionStream('deflate-raw'));
            return new Response(body, { status: 200, headers });
        }

        return { load, has, respond };
    }

    scope.RRPackReader = { INDEX, CACHE, contentType, parseRange, create };
})(typeof self !== 'undefined' ? self : globalThis);
