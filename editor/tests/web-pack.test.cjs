'use strict';
// A web build's files in pack archives: the builder (build-scripts/web-pack.cjs), the reader a service worker
// serves them with (src/web/pack-reader.js), and the gate a deployed game's page waits behind.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const webPack = require('../build-scripts/web-pack.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

/** A small project on disk: text that shrinks, bytes that do not, an empty file, a name with a space and an accent. */
function project() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-pack-'));
    const noise = Buffer.alloc(40000);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919 + (i >> 3) * 104729) & 0xff;
    const files = {
        'index.html': '<!DOCTYPE html><html><head><link rel="stylesheet" href="css/game.css"></head><body>\n<script>window.x = 1;</script>\n<script type="text/javascript" src="js/reactor_main.js"></script>\n</body></html>',
        'package.json': '{"name":"game"}',
        'css/game.css': 'body { background: black; }',
        'icon/icon.png': noise.subarray(0, 300),
        'js/reactor_main.js': 'console.log("main");\n'.repeat(400),
        'data/System.json': JSON.stringify({ gameTitle: 'Pack', list: new Array(500).fill('entry') }),
        'data/Empty.json': '',
        'img/pictures/Noise.png': noise,
        'audio/bgm/Thème one.ogg': noise.subarray(100, 30100),
        'movies/Clip.webm': noise.subarray(5, 20005),
    };
    for (const [name, data] of Object.entries(files)) {
        const target = path.join(root, ...name.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
    }
    return { root, files, bytes: name => Buffer.from(files[name]) };
}

/** The pack reader over a build on disk, with a server that answers byte ranges (or not, `ranges: false`). */
function reader(root, { ranges = true, caches = null } = {}) {
    const context = { URL, Response, Blob, Promise, DecompressionStream, console };
    context.self = context;
    vm.runInNewContext(read('editor/src/web/pack-reader.js'), context);
    const asked = [];
    const fetchFn = async (url, options = {}) => {
        const relative = decodeURIComponent(new URL(url).pathname.replace(/^\/game\//, ''));
        const file = path.join(root, ...relative.split('/'));
        const range = options.headers && options.headers.Range;
        asked.push({ relative, range: range || null });
        if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
        const data = fs.readFileSync(file);
        const match = ranges && range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null;
        if (match) return new Response(data.subarray(Number(match[1]), Number(match[2]) + 1), { status: 206 });
        return new Response(data, { status: 200 });
    };
    return { api: context.RRPackReader, packs: context.RRPackReader.create('https://host.example/game/', { fetch: fetchFn, caches }), asked };
}

const request = (method = 'GET', range = null) => ({ method, headers: { get: name => (name === 'Range' ? range : null) } });
const body = async response => Buffer.from(await response.arrayBuffer());

/** A Cache Storage that keeps what it is given, as the browser's does. */
function fakeCaches() {
    const kept = new Map();
    const cache = {
        async match(url) { const blob = kept.get(String(url)); return blob ? new Response(blob) : undefined; },
        async put(url, response) { kept.set(String(url), await response.blob()); },
        async keys() { return [...kept.keys()].map(url => ({ url })); },
        async delete(entry) { return kept.delete(entry.url); },
    };
    return { kept, open: async () => cache };
}

test('packing leaves a few archives and an index, and every file comes back out of them byte for byte', async () => {
    const { root, files, bytes } = project();
    try {
        const report = webPack.packGame(root);
        assert.equal(report.files, 6, 'what the page does not name at once is packed');
        assert.equal(report.packs, 1);
        const left = webPack.listFiles(root);
        assert.deepEqual(left.filter(file => !file.startsWith('packs/')), ['css/game.css', 'icon/icon.png', 'index.html', 'package.json', 'reactor_pack_worker.js']);
        assert.equal(left.filter(file => file.startsWith('packs/')).length, 2, 'one archive and its index');
        assert.ok(!fs.existsSync(path.join(root, 'data')) && !fs.existsSync(path.join(root, 'img')), 'the emptied folders are gone');
        const index = JSON.parse(fs.readFileSync(path.join(root, 'packs', 'index.json'), 'utf8'));
        assert.match(index.packs[0], /^pack-1-[0-9a-f]{8}\.zip$/, 'an archive is named by what is in it');
        assert.equal(index.files['data/System.json'][4], 8, 'text is deflated');
        assert.ok(index.files['data/System.json'][2] < index.files['data/System.json'][3] / 2);
        for (const stored of ['img/pictures/Noise.png', 'audio/bgm/Thème one.ogg', 'movies/Clip.webm']) assert.equal(index.files[stored][4], 0, `${stored} is kept as it is`);
        assert.ok(report.after < report.before, 'and the build is smaller');
        // Read back through the reader, as the browser does.
        const { packs, asked } = reader(root);
        for (const name of Object.keys(index.files)) {
            const response = await packs.respond(name, request());
            assert.equal(response.status, 200);
            assert.deepEqual(await body(response), bytes(name), name);
            assert.equal(response.headers.get('Content-Length'), String(bytes(name).length));
        }
        assert.equal((await packs.respond('data/System.json', request())).headers.get('Content-Type'), 'application/json; charset=utf-8');
        assert.equal((await packs.respond('img/pictures/Noise.png', request())).headers.get('Content-Type'), 'image/png');
        assert.equal(await packs.respond('css/game.css', request()), null, 'a loose file is not the packs\' to answer');
        assert.equal(await packs.respond('data/Missing.json', request()), null);
        assert.equal(await packs.respond('constructor', request()), null, 'nor a name that is no file at all');
        assert.equal(asked.filter(a => a.relative === 'packs/index.json').length, 1, 'the index is asked for once');
        assert.ok(asked.filter(a => a.relative.endsWith('.zip')).every(a => /^bytes=\d+-\d+$/.test(a.range)), 'and each file by its own bytes, never the archive');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the archives are ordinary zip files', { skip: (() => { try { execFileSync('unzip', ['-v'], { stdio: 'pipe' }); return false; } catch (error) { return 'no unzip here'; } })() }, () => {
    const { root, bytes } = project();
    try {
        webPack.packGame(root);
        const index = JSON.parse(fs.readFileSync(path.join(root, 'packs', 'index.json'), 'utf8'));
        const archive = path.join(root, 'packs', index.packs[0]);
        execFileSync('unzip', ['-tq', archive], { stdio: 'pipe' });
        const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-unzip-'));
        try {
            execFileSync('unzip', ['-q', archive, '-d', out], { stdio: 'pipe' });
            for (const name of Object.keys(index.files)) assert.deepEqual(fs.readFileSync(path.join(out, ...name.split('/'))), bytes(name), name);
        } finally { fs.rmSync(out, { recursive: true, force: true }); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no archive grows past its limit, and the same files always make the same archives', () => {
    const one = project(), two = project();
    try {
        const report = webPack.packFolder(one.root, { keep: webPack.keepsLooseInGame, maxPackBytes: 45000 });
        const index = JSON.parse(fs.readFileSync(path.join(one.root, 'packs', 'index.json'), 'utf8'));
        assert.ok(report.packs >= 3, `${report.packs} archives`);
        for (const name of index.packs) assert.ok(fs.statSync(path.join(one.root, 'packs', name)).size <= 45000, name);
        assert.equal(new Set(Object.values(index.files).map(entry => entry[0])).size, report.packs, 'every archive holds something');
        webPack.packFolder(two.root, { keep: webPack.keepsLooseInGame, maxPackBytes: 45000 });
        assert.equal(fs.readFileSync(path.join(two.root, 'packs', 'index.json'), 'utf8'), JSON.stringify(index), 'same names, same places');
        assert.equal(webPack.packFolder(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-empty-'))), null, 'an empty folder packs nothing');
    } finally { for (const p of [one, two]) fs.rmSync(p.root, { recursive: true, force: true }); }
});

test('a part of a stored file is that part of the archive: seeking in a video, streaming music', async () => {
    const { root, bytes } = project();
    try {
        webPack.packGame(root);
        const { packs } = reader(root);
        const clip = bytes('movies/Clip.webm');
        const part = await packs.respond('movies/Clip.webm', request('GET', 'bytes=1000-1999'));
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('Content-Range'), `bytes 1000-1999/${clip.length}`);
        assert.deepEqual(await body(part), clip.subarray(1000, 2000));
        const tail = await packs.respond('movies/Clip.webm', request('GET', 'bytes=19000-'));
        assert.equal(tail.headers.get('Content-Range'), `bytes 19000-${clip.length - 1}/${clip.length}`);
        assert.deepEqual(await body(tail), clip.subarray(19000));
        const last = await packs.respond('movies/Clip.webm', request('GET', 'bytes=-500'));
        assert.deepEqual(await body(last), clip.subarray(clip.length - 500));
        // A deflated file is sent whole whatever part is asked for; so is one asked for past its end.
        const text = await packs.respond('data/System.json', request('GET', 'bytes=10-20'));
        assert.equal(text.status, 200);
        assert.deepEqual(await body(text), bytes('data/System.json'));
        assert.equal((await packs.respond('movies/Clip.webm', request('GET', 'bytes=999999-'))).status, 200);
        const head = await packs.respond('movies/Clip.webm', request('HEAD'));
        assert.deepEqual([head.status, head.headers.get('Content-Length'), (await body(head)).length], [200, String(clip.length), 0]);
        const empty = await packs.respond('data/Empty.json', request());
        assert.deepEqual([empty.status, (await body(empty)).length], [200, 0]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a server that sends the whole archive has it kept once and cut from there', async () => {
    const { root, bytes } = project();
    try {
        webPack.packGame(root);
        const caches = fakeCaches();
        const first = reader(root, { ranges: false, caches });
        const names = ['data/System.json', 'img/pictures/Noise.png', 'audio/bgm/Thème one.ogg', 'js/reactor_main.js'];
        const answers = await Promise.all(names.map(name => first.packs.respond(name, request())));
        for (let i = 0; i < names.length; i++) assert.deepEqual(await body(answers[i]), bytes(names[i]), names[i]);
        assert.equal(first.asked.filter(a => a.relative.endsWith('.zip')).length, 1, 'the archive came down once for all four');
        assert.equal(caches.kept.size, 1, 'and is kept by the browser');
        // The worker is started again (browsers stop an idle one): the archive is read from what was kept.
        const second = reader(root, { ranges: false, caches });
        assert.deepEqual(await body(await second.packs.respond('movies/Clip.webm', request('GET', 'bytes=10-19'))), bytes('movies/Clip.webm').subarray(10, 20));
        assert.equal(second.asked.filter(a => a.relative.endsWith('.zip')).length, 0, 'not from the network again');
        // A new build's archives have new names: the old one is let go.
        caches.kept.set('https://host.example/game/packs/pack-1-00000000.zip', new Blob(['old']));
        const third = reader(root, { ranges: false, caches });
        await third.packs.load();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.ok(!caches.kept.has('https://host.example/game/packs/pack-1-00000000.zip'));
        assert.equal(caches.kept.size, 1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a build without packs is left to the server, and a failed index is asked for again', async () => {
    const { root } = project();
    try {
        const plain = reader(root);
        assert.equal(await plain.packs.respond('data/System.json', request()), null);
        assert.equal(await plain.packs.respond('img/pictures/Noise.png', request()), null);
        assert.equal(plain.asked.length, 1, 'asked once that there are no packs');
        const context = { URL, Response, Blob, Promise, DecompressionStream, console };
        context.self = context;
        vm.runInNewContext(read('editor/src/web/pack-reader.js'), context);
        let calls = 0;
        const flaky = context.RRPackReader.create('https://host.example/game/', { caches: null, fetch: async () => { if (++calls === 1) throw new Error('offline'); return new Response('{"version":1,"packs":[],"files":{}}'); } });
        await assert.rejects(flaky.respond('a', request()));
        assert.equal(await flaky.respond('a', request()), null);
        assert.equal(calls, 2);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a deployed game\'s page brings its service worker up first and is otherwise as it was written', () => {
    const { root, files } = project();
    try {
        webPack.packGame(root);
        const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        assert.match(page, /navigator\.serviceWorker\.register\('reactor_pack_worker\.js'\)/);
        assert.ok(page.indexOf('serviceWorker.register') < page.indexOf('<link rel="stylesheet"'), 'the gate is the first thing the page runs');
        // The page's own scripts stay as written: a game starts on the window's load event, which only a page
        // loaded whole under its worker has in the right order.
        assert.match(page, /<script type="text\/javascript" src="js\/reactor_main\.js"><\/script>/);
        assert.match(page, /<script>window\.x = 1;<\/script>/);
        assert.equal(page.replace(/<script>\s*\(function\(\) \{\s*var KEY[\s\S]*?<\/script>/, '').replace(/\s+/g, ''), files['index.html'].replace(/\s+/g, ''), 'nothing else is changed');
        assert.equal(webPack.gatePage(page), page, 'gated once');
        assert.match(webPack.gatePage('<body><p>no head</p></body>'), /^<script>[\s\S]*<\/script>\n<body>/);
        // What the gate does: nothing under the worker; else the worker, and the page again, once.
        const gate = page.slice(page.indexOf('<script>') + 8, page.indexOf('</script>'));
        const visit = ({ controller, flagged, supported = true }) => {
            const did = { registered: 0, reloads: 0, failed: false, flag: flagged ? '1' : null };
            const worker = { controller, ready: Promise.resolve(), register: () => { did.registered++; return Promise.resolve(); }, addEventListener() {} };
            const context = {
                navigator: supported ? { serviceWorker: worker } : {},
                sessionStorage: { getItem: () => did.flag, setItem: (k, v) => { did.flag = v; }, removeItem: () => { did.flag = null; } },
                location: { reload: () => { did.reloads++; } },
                document: { body: { insertAdjacentHTML: () => { did.failed = true; } }, addEventListener() {} },
                setTimeout: fn => { did.timer = fn; },
            };
            vm.runInNewContext(gate, context);
            return new Promise(resolve => setImmediate(() => { if (did.timer) did.timer(); resolve(did); }));
        };
        return (async () => {
            assert.deepEqual(await visit({ controller: {}, flagged: true }), { registered: 0, reloads: 0, failed: false, flag: null }, 'under the worker: the page loads, and the mark of a reload is cleared');
            const first = await visit({ controller: null, flagged: false });
            assert.deepEqual([first.registered, first.reloads, first.failed, first.flag], [1, 1, false, '1'], 'a first visit: the worker, then the page once more');
            const stuck = await visit({ controller: null, flagged: true });
            assert.deepEqual([stuck.reloads, stuck.failed], [0, true], 'still no worker after that: it says so instead of reloading for ever');
            assert.equal((await visit({ controller: null, supported: false })).failed, true, 'a browser without service workers is told at once');
        })();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the game\'s worker is the reader with the game\'s handler behind it', () => {
    const { root } = project();
    try {
        webPack.packGame(root);
        const worker = fs.readFileSync(path.join(root, 'reactor_pack_worker.js'), 'utf8');
        assert.ok(worker.indexOf('scope.RRPackReader =') < worker.indexOf("self.addEventListener('fetch'"));
        new vm.Script(worker);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the game\'s worker answers packed files and leaves the rest alone', async () => {
    const { root, bytes } = project();
    try {
        webPack.packGame(root);
        const listeners = {};
        const fetched = [];
        const context = { URL, Response, Blob, Promise, DecompressionStream, console: { warn() {} }, decodeURIComponent };
        Object.assign(context, {
            self: context, registration: { scope: 'https://host.example/game/' }, clients: { claim() {} }, skipWaiting() {}, caches: undefined,
            addEventListener: (type, fn) => { listeners[type] = fn; },
            fetch: async (input, options = {}) => {
                const url = typeof input === 'string' ? input : input.url;
                fetched.push(url);
                const relative = decodeURIComponent(new URL(url).pathname.replace(/^\/game\//, ''));
                const file = path.join(root, ...relative.split('/'));
                if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
                const data = fs.readFileSync(file), match = /^bytes=(\d+)-(\d+)$/.exec((options.headers && options.headers.Range) || '');
                return match ? new Response(data.subarray(Number(match[1]), Number(match[2]) + 1), { status: 206 }) : new Response(data);
            },
        });
        vm.runInNewContext(fs.readFileSync(path.join(root, 'reactor_pack_worker.js'), 'utf8'), context);
        const ask = async (url, method = 'GET') => {
            let answer;
            const event = { request: { url, method, headers: { get: () => null } }, respondWith: promise => { answer = promise; } };
            listeners.fetch(event);
            return answer === undefined ? undefined : await answer;
        };
        assert.deepEqual(await body(await ask('https://host.example/game/data/System.json')), bytes('data/System.json'));
        assert.deepEqual(await body(await ask('https://host.example/game/audio/bgm/Th%C3%A8me%20one.ogg')), bytes('audio/bgm/Thème one.ogg'), 'a name is read as the page wrote it');
        assert.deepEqual(await body(await ask('https://host.example/game/css/game.css')), bytes('css/game.css'), 'a loose file comes from the server');
        assert.equal(await ask('https://other.example/game/data/System.json'), undefined, 'another site is not its business');
        assert.equal(await ask('https://host.example/elsewhere/a.png'), undefined, 'nor a path outside the game');
        assert.equal(await ask('https://host.example/game/packs/index.json'), undefined, 'nor the packs themselves');
        assert.equal(await ask('https://host.example/game/data/System.json', 'POST'), undefined);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the editor\'s own worker reads a packed project under browser-saved edits, and is unchanged without packs', () => {
    const worker = read('editor/src/web/service-worker.js');
    assert.match(worker, /const projectPacks = self\.RRPackReader\s*\n\s*\? self\.RRPackReader\.create\(new URL\('project\/', self\.registration\.scope\)\.href\)\s*\n\s*: null;/);
    const fetchAt = worker.indexOf("self.addEventListener('fetch'");
    const handler = worker.slice(fetchAt);
    assert.ok(handler.indexOf('storedFile(relativePath)') < handler.indexOf('projectPacks.respond('), 'an edit saved in the browser comes first');
    assert.ok(handler.indexOf('projectPacks.respond(') < handler.lastIndexOf('fetch(event.request)'), 'then the packs, then the server');
    const dist = read('editor/build-scripts/dist-editor-worker.js');
    assert.match(dist, /packed: !!packWebFiles,/, 'the manifest says the project is packed');
    assert.ok(dist.indexOf("fs.writeFileSync(path.join(webRoot, 'web', 'project-manifest.json')") < dist.indexOf('webPack.packFolder(projectRoot)'), 'packed after the manifest and the file index are written');
    assert.ok(dist.indexOf('webPack.packFolder(projectRoot)') < dist.indexOf('const outputFiles = walkWebFiles(webRoot)'), 'and before the build is counted');
    assert.match(read('editor/src/web/WebHost.js'), /if \(this\.manifest\.packed && !navigator\.serviceWorker\?\.controller\) \{\s*\n\s*throw new Error\(/);
    const build = read('editor/build-scripts/build-worker.js');
    assert.ok(build.indexOf('webFileIndex.writeWebFileIndex(platformOutDir)') < build.indexOf('webPack.packGame(platformOutDir)'));
    assert.ok(build.indexOf('webPack.packGame(platformOutDir)') < build.indexOf('webFileIndex.storefrontWarnings(platformOutDir)'), 'the warnings count what is left');
});

test('CRC-32 is the zip one, with or without zlib\'s own', () => {
    assert.equal(webPack.crc32(Buffer.from('123456789')), 0xcbf43926);
    const own = zlib.crc32;
    try { zlib.crc32 = undefined; assert.equal(webPack.crc32(Buffer.from('123456789')), 0xcbf43926); } finally { zlib.crc32 = own; }
});
