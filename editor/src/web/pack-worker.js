/**
 * The service worker of a game deployed for the web with its files in packs: every request under the game's
 * folder that names a packed file is answered from the packs (pack-reader.js, which the build puts in front of
 * this file); anything else goes to the server as usual.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const rrPacks = self.RRPackReader.create(self.registration.scope);

self.addEventListener('fetch', event => {
    const method = event.request.method;
    if (method !== 'GET' && method !== 'HEAD') return;
    const url = new URL(event.request.url), scope = new URL(self.registration.scope);
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
    let relativePath = '';
    try { relativePath = decodeURIComponent(url.pathname.slice(scope.pathname.length)); } catch (error) { return; }
    if (!relativePath || relativePath.startsWith('packs/')) return;
    event.respondWith(rrPacks.respond(relativePath, event.request)
        .then(response => response || fetch(event.request))
        .catch(error => {
            console.warn('RPG Reactor pack read failed:', relativePath, error);
            return fetch(event.request);
        }));
});
