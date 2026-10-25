'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Manager = require('../src/MediaSurfaceManager.js');

class Element {
    constructor(tag) {
        this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
        this.style = {}; this.attributes = {}; this.dataset = {}; this.className = '';
        this.classList = {
            add: (...names) => { this.className = [...new Set(this.className.split(/\s+/).filter(Boolean).concat(names))].join(' '); },
            contains: name => this.className.split(/\s+/).includes(name)
        };
    }
    append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') delete this.src; }
    addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    dispatch(name) { for (const listener of Array.from(this.listeners.get(name) || [])) listener({ target: this }); }
    pause() { this.paused = true; }
    load() { this.loads = (this.loads || 0) + 1; }
    getContext() { return { drawImage: (...args) => { this.drawn = args; } }; }
    toDataURL() { return 'data:image/png;base64,cG9zdGVy'; }
}

function setup(t, rows = []) {
    const before = { document: global.document, window: global.window };
    const made = [];
    global.document = { createElement: tag => { const node = new Element(tag); made.push(node); return node; }, querySelector: () => null };
    global.window = {};
    const map = { reactor3d: { mediaSurfaces: rows } };
    const manager = new Manager({ getCurrentProject: () => ({ path: '/project with spaces/#town' }), tilemapManager: { currentMap: map } }, null);
    manager.panel = new Element('section');
    t.after(() => {
        manager._stopThumbnails();
        for (const name of ['document', 'window']) {
            if (before[name] === undefined) delete global[name]; else global[name] = before[name];
        }
    });
    return { manager, made };
}
const ofClass = (nodes, name) => nodes.filter(node => node.classList.contains(name));

test('thumbnail URLs use project pictures and movies, preserve nested names and reject external or escaping paths', t => {
    const { manager } = setup(t);
    assert.equal(manager._thumbnailUrl('signs/City #1.png'), 'file:///project%20with%20spaces/%23town/img/pictures/signs/City%20%231.png');
    assert.equal(manager._thumbnailUrl('screens/Arrival.webm'), 'file:///project%20with%20spaces/%23town/movies/screens/Arrival.webm');
    for (const file of ['../outside.png', '/outside.png', 'https://example.com/a.png', 'bad.js', 'folder/../../bad.mp4']) assert.equal(manager._thumbnailUrl(file), '');
});

test('surface cards show image and video previews, keep asset names as text and still open the right surface', t => {
    const { manager, made } = setup(t, [{ id: 2, movie: 'Signs/<welcome>.png', x: 1, y: 2, z: 3 }, { id: 5, movie: 'screens/Intro.webm' }]);
    let edited;
    manager.edit = id => { edited = id; };
    manager.render();
    assert.equal(ofClass(made, 'media-surface-card').length, 2);
    assert.deepEqual(ofClass(made, 'media-surface-name').map(node => node.textContent), ['Signs/<welcome>.png', 'screens/Intro.webm']);
    assert.deepEqual(ofClass(made, 'media-surface-kind').map(node => node.textContent), ['Image', 'Video']);
    assert.equal(ofClass(made, 'media-surface-position')[0].textContent, 'X 1 · Y 2 · Z 3');
    const image = made.find(node => node.tagName === 'IMG' && node.src?.includes('/img/pictures/'));
    assert.ok(image); image.dispatch('load');
    assert.equal(image.parentNode.classList.contains('is-loaded'), true);
    ofClass(made, 'media-surface-open')[1].dispatch('click');
    assert.equal(edited, 5);
});

test('a video thumbnail captures a still frame, stays silent and releases the decoder; duplicates reuse it', t => {
    const { manager, made } = setup(t);
    const holder = manager._thumbnail('clip.webm');
    const video = made.find(node => node.tagName === 'VIDEO');
    assert.equal(video.muted, true); assert.equal(video.playsInline, true); assert.ok(!video.autoplay);
    video.duration = 4; video.videoWidth = 1920; video.videoHeight = 1080;
    video.dispatch('loadedmetadata'); assert.equal(video.currentTime, 0.1);
    video.dispatch('seeked');
    assert.equal(video.paused, true); assert.equal(video.src, undefined);
    assert.equal(manager._thumbnailJobs.size, 0);
    assert.equal(holder.children[0].src, 'data:image/png;base64,cG9zdGVy');
    const canvas = made.find(node => node.tagName === 'CANVAS');
    assert.deepEqual([canvas.width, canvas.height], [160, 100]);
    manager._thumbnail('clip.webm');
    assert.equal(made.filter(node => node.tagName === 'VIDEO').length, 1, 'the same clip reuses its small cached image');
});

test('thumbnail work is bounded and stopping a render prevents old video callbacks from painting new cards', t => {
    const { manager, made } = setup(t);
    manager._thumbnail('a.webm'); manager._thumbnail('b.webm'); manager._thumbnail('c.webm');
    const videos = made.filter(node => node.tagName === 'VIDEO');
    assert.equal(videos.length, 2); assert.equal(manager._thumbnailQueue.length, 1);
    manager._stopThumbnails();
    assert.equal(manager._thumbnailJobs.size, 0); assert.equal(manager._thumbnailQueue.length, 0);
    for (const video of videos) {
        assert.equal(video.paused, true); assert.equal(video.src, undefined);
        video.videoWidth = 640; video.videoHeight = 480; video.dispatch('seeked');
    }
    assert.equal(made.filter(node => node.tagName === 'IMG').length, 0);
});

test('failed previews keep their fallback and do not block the next video', t => {
    const { manager, made } = setup(t);
    const first = manager._thumbnail('broken.webm');
    manager._thumbnail('second.webm'); manager._thumbnail('third.webm');
    made.find(node => node.tagName === 'VIDEO').dispatch('error');
    assert.equal(first.classList.contains('is-unavailable'), true);
    assert.equal(made.filter(node => node.tagName === 'VIDEO').length, 3);
    assert.equal(manager._thumbnailJobs.size, 2);
});
