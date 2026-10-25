//=============================================================================
// RR_RenderWorker.js — prototype: the worker that draws the 3D world
// (see RR_RenderThread.js). A classic worker: three.js and the 3D runtime are
// loaded with importScripts from the game's js/ folder, under the few globals
// the runtime reads (a document that makes OffscreenCanvases, Graphics, an
// ImageManager that fetches and decodes here, the map's data, a stand-in
// $gameMap and $gamePlayer). The map's world is the runtime's own MapScene;
// it is drawn by the runtime's own render pass, on this thread's canvas.
//=============================================================================
"use strict";
self.window = self;
const state = { canvas: null, renderer: null, scene: null, camera: null, viewport: null, latest: null, token: 0, scheduled: false, base: "", width: 816, height: 624, posts: null };
const fail = (where, error) => self.postMessage({ type: "error", message: where + ": " + String(error && (error.stack || error.message) || error) });

// What the runtime reads of a page and a game, as far as the world needs.
self.document = {
    baseURI: "",
    createElement(tag) {
        if (tag === "canvas") { const canvas = new OffscreenCanvas(300, 150); canvas.style = {}; return canvas; }
        return { style: {}, appendChild() {}, remove() {}, setAttribute() {} };
    },
    body: { appendChild() {} }
};
self.Graphics = { width: 816, height: 624, frameCount: 0, gpuTier: null, canvasPixelRatio: () => 1, _centerElement() {} };

/** A picture as the runtime's Bitmap offers it: fetched and decoded here, then held on an OffscreenCanvas. */
class WorkerBitmap {
    constructor(url) {
        this._url = url; this._ready = !url; this._error = false; this._listeners = [];
        this.image = null; this._image = null; this.canvas = null; this.width = 0; this.height = 0;
        if (!url) return;
        fetch(url).then(response => { if (!response.ok && response.status !== 0) throw new Error("HTTP " + response.status); return response.blob(); })
            .then(blob => createImageBitmap(blob))
            .then(bitmap => {
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                canvas.getContext("2d").drawImage(bitmap, 0, 0);
                bitmap.close();
                this.image = this._image = canvas;
                this.width = canvas.width; this.height = canvas.height;
                this._ready = true;
                this._fire();
            })
            .catch(() => { this._error = true; this._ready = true; this._fire(); });
    }
    _fire() { for (const listener of this._listeners.splice(0)) { try { listener(this); } catch (error) { fail("bitmap listener", error); } } }
    isReady() { return this._ready; }
    isError() { return this._error; }
    addLoadListener(listener) { if (this._ready) listener(this); else this._listeners.push(listener); }
}
const bitmaps = new Map();
self.ImageManager = {
    loadBitmap(folder, filename) {
        if (!filename) return new WorkerBitmap("");
        const url = new URL(folder + encodeURIComponent(filename) + ".png", state.base).href;
        let bitmap = bitmaps.get(url);
        if (!bitmap) bitmaps.set(url, bitmap = new WorkerBitmap(url));
        return bitmap;
    },
    loadTileset(name) { return this.loadBitmap("img/tilesets/", name); },
    loadParallax(name) { return this.loadBitmap("img/parallaxes/", name); },
    loadPicture(name) { return this.loadBitmap("img/pictures/", name); }
};
self.$gameTemp = { isDestinationValid: () => false, destinationX: () => 0, destinationY: () => 0 };

function loadRuntime(base) {
    const js = name => new URL("js/" + name, base).href;
    importScripts(js("libs/three.js"), js("reactor_json.js"), js("reactor_3d.js"));
    for (const extension of Reactor3D.EXTENSIONS) importScripts(js(extension.file));
}

function makeStage(map) {
    const flags = map.flags;
    self.$dataMap = map.mapData; self.$dataTilesets = map.tilesets; self.$dataSystem = map.system; self.$dataMapInfos = map.mapInfos;
    self.$gameMap = {
        mapId: () => map.mapId, tilesetFlags: () => flags, tilesetId: () => map.mapData.tilesetId, events: () => [], width: () => map.mapData.width, height: () => map.mapData.height,
        tileWidth: () => map.tileSize, tileHeight: () => map.tileSize, isLoopHorizontal: () => false, isLoopVertical: () => false,
        roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0), roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0)
    };
    self.$gamePlayer = { x: 0, y: 0, _x: 0, _y: 0, _realX: 0, _realY: 0, _d: 2, direction() { return this._d; }, isMoving: () => false, isTransferring: () => false,
        followers: () => ({ visibleFollowers: () => [] }), distancePerFrame: () => 0.0625 };
}

function build(map) {
    makeStage(map);
    const sheets = map.tilesetNames.map(name => ImageManager.loadTileset(name));
    const started = performance.now();
    const go = () => {
        try {
            if (state.scene) { try { state.scene.destroy(); } catch (error) { /* gone */ } }
            const scene = new Reactor3D.MapScene(map.mapData, sheets, { flags: map.flags, tilesetId: map.mapData.tilesetId, tileSize: map.tileSize });
            const camera = Reactor3D.createCamera(map.settings || {});
            camera.aspect = state.width / state.height;
            camera.updateProjectionMatrix();
            const viewport = state.viewport || Object.create(Reactor3D.Viewport.prototype);
            Object.assign(viewport, { _renderer: state.renderer, _scene: scene.scene(), _camera: camera, _shared: false, _canvas: state.canvas, _width: state.width, _height: state.height });
            Reactor3D._viewport = viewport;
            state.viewport = viewport; state.scene = scene; state.camera = camera; state.token = map.token;
            self.postMessage({ type: "built", ms: Math.round(performance.now() - started), report: scene.report ? scene.report() : null });
            schedule();
        } catch (error) { fail("build", error); }
    };
    let left = sheets.length;
    if (!left) go();
    for (const sheet of sheets) sheet.addLoadListener(() => { if (--left === 0) go(); });
}

/** The stand-ins for the characters: one post each, drawn with the world's depth. */
function standIns(posts) {
    let group = state.posts;
    if (!group) {
        group = state.posts = new THREE.Group();
        group.name = "stand-ins";
        group.userData.geometry = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 10);
        group.userData.geometry.translate(0, 0.8, 0);
        group.userData.material = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
    }
    if (group.parent !== state.scene.scene()) state.scene.scene().add(group);
    const count = posts.length / 3;
    while (group.children.length < count) group.add(new THREE.Mesh(group.userData.geometry, group.userData.material));
    for (let i = 0; i < group.children.length; i++) {
        const mesh = group.children[i];
        mesh.visible = i < count;
        if (mesh.visible) mesh.position.set(posts[i * 3], posts[i * 3 + 1], posts[i * 3 + 2]);
    }
}

function draw() {
    state.scheduled = false;
    const frame = state.latest;
    if (!frame || !state.scene || frame.token !== state.token) return;
    const t0 = performance.now();
    try {
        Graphics.frameCount = frame.frame;
        Object.assign($gamePlayer, { x: frame.player.x, y: frame.player.y, _x: frame.player.x, _y: frame.player.y, _realX: frame.player.realX, _realY: frame.player.realY, _d: frame.player.d });
        const camera = state.camera, c = frame.camera;
        camera.position.fromArray(c.p); camera.quaternion.fromArray(c.q);
        camera.fov = c.fov; camera.aspect = c.aspect; camera.near = c.near; camera.far = c.far; camera.zoom = c.zoom;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const scene = state.scene;
        if (scene.updateSky) scene.updateSky(camera, frame.frame);
        if (scene.updateWater) scene.updateWater(frame.frame);
        if (scene.updateRipples) scene.updateRipples(frame.frame, [$gamePlayer]);
        if (scene.setAnimationFrame) scene.setAnimationFrame(frame.animationFrame);
        const light = frame.light || { wants: false };
        Reactor3D.setAmbient(light.wants ? light.ambient : null);
        Reactor3D.setLights(light.wants ? light.lights : []);
        if (scene.syncLights) scene.syncLights(light.focus || null);
        standIns(frame.posts);
        if (!frame.noDraw) state.viewport.renderPass(scene, "all", "below");
    } catch (error) { fail("draw", error); }
    const ms = performance.now() - t0;
    self.postMessage({ type: "frame", ms, calls: state.renderer.info.render.calls, triangles: state.renderer.info.render.triangles, cam: state.camera.position.toArray().map(v => Math.round(v * 10) / 10) });
}
function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(draw);
}

self.onmessage = event => {
    const data = event.data;
    try {
        if (data.type === "init") {
            state.base = data.base; document.baseURI = data.base;
            state.width = data.width; state.height = data.height;
            Graphics.width = data.width; Graphics.height = data.height; Graphics.gpuTier = data.tier;
            loadRuntime(data.base);
            state.canvas = data.canvas;
            state.canvas.style = {};
            state.renderer = new THREE.WebGLRenderer({ canvas: state.canvas, antialias: false, alpha: true });
            state.renderer.setPixelRatio(1);
            state.renderer.setSize(data.width, data.height, false);
            state.renderer.setClearColor(0x000000, 0);
        } else if (data.type === "map") build(data);
        // Drawn at once (`immediate`, as the main thread posts each refresh) or on this thread's own animation frame.
        else if (data.type === "frame") { state.latest = data; if (data.immediate) draw(); else schedule(); }
    } catch (error) { fail(data && data.type, error); }
};
