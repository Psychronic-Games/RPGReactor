const DB_NAME = 'RPGReactorWeb';
const DB_VERSION = 1;
const STORE_NAME = 'files';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function storedFile(relativePath) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
            }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const get = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(relativePath);
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => reject(get.error);
        };
    });
}

function contentType(pathname) {
    const extension = pathname.split('.').pop().toLowerCase();
    return {
        json: 'application/json; charset=utf-8',
        js: 'text/javascript; charset=utf-8',
        html: 'text/html; charset=utf-8',
        css: 'text/css; charset=utf-8',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        apng: 'image/apng',
        svg: 'image/svg+xml',
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        flac: 'audio/flac',
        wasm: 'application/wasm',
    }[extension] || 'application/octet-stream';
}

/**
 * The virtual project root sits directly under the worker's own scope. Anchor
 * on that rather than searching the path for a "/project/" segment: an asset in
 * a folder the game itself names `project` contains the marker too, and
 * matching that occurrence resolved the request to the wrong file.
 */
function projectRelativePath(url) {
    const scope = new URL(self.registration.scope);
    if (url.origin !== scope.origin) return null;
    const prefix = `${scope.pathname.replace(/\/*$/, '/')}project/`;
    if (!url.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
}

// A build whose project is packed puts the pack reader (pack-reader.js) in front of this file: a project file
// that no browser-saved edit shadows is then read from the packs.
const projectPacks = self.RRPackReader
    ? self.RRPackReader.create(new URL('project/', self.registration.scope).href)
    : null;

self.addEventListener('fetch', event => {
    const method = event.request.method;
    if (method !== 'GET' && !(projectPacks && method === 'HEAD')) return;
    const relativePath = projectRelativePath(new URL(event.request.url));
    if (relativePath === null) return;
    event.respondWith((async () => {
        try {
            const record = await storedFile(relativePath);
            if (record) return new Response(method === 'HEAD' ? null : record.data, { headers: { 'Content-Type': contentType(relativePath), 'Cache-Control': 'no-store' } });
        } catch (error) {
            console.warn('RPG Reactor overlay lookup failed:', error);
        }
        if (projectPacks && !relativePath.startsWith('packs/')) {
            try {
                const packed = await projectPacks.respond(relativePath, event.request);
                if (packed) return packed;
            } catch (error) {
                console.warn('RPG Reactor pack read failed:', relativePath, error);
            }
        }
        return fetch(event.request);
    })());
});
