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
        ogg: 'audio/ogg',
        m4a: 'audio/mp4',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        wasm: 'application/wasm',
    }[extension] || 'application/octet-stream';
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const marker = '/project/';
    const index = url.pathname.lastIndexOf(marker);
    if (index < 0 || event.request.method !== 'GET') return;
    const relativePath = decodeURIComponent(url.pathname.slice(index + marker.length));
    event.respondWith((async () => {
        try {
            const record = await storedFile(relativePath);
            if (record) return new Response(record.data, { headers: { 'Content-Type': contentType(relativePath), 'Cache-Control': 'no-store' } });
        } catch (error) {
            console.warn('RPG Reactor overlay lookup failed:', error);
        }
        return fetch(event.request);
    })());
});
