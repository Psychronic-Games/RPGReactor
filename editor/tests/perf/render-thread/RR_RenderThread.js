//=============================================================================
// RR_RenderThread.js — prototype: the 3D world drawn on a thread of its own
//
// Not part of the runtime and loaded by nothing: a perf harness copies it and
// RR_RenderWorker.js into a disposable project's js/plugins and loads it at the
// title (editor/tests/perf/render-thread/render-thread-setup.js). Off until
// `Reactor3D.RenderThread.enabled` is set before a map opens.
//
// On: a canvas under the game canvas is handed to a worker as an
// OffscreenCanvas. The worker builds the map's world from the map's own data
// with the same 3D runtime (three.js, reactor_3d*.js) and draws it on its own
// thread. Each frame the main thread aims the camera as it always does and
// posts what the world needs (the camera, the frame count, the tile animation
// frame, where the characters stand); PIXI draws the 2D layer over a clear
// background. The main thread keeps its own scene (it is what loads the models
// the game's collision reads) but draws none of it.
//
// What a prototype leaves out: characters are stand-in posts, not their
// models; Effekseer effects, flat lights, screen filters and tone over the
// world, battle rooms, snapshots and context loss are not handled.
//=============================================================================

(function() {
    "use strict";
    if (typeof Reactor3D === "undefined" || typeof Spriteset_Map === "undefined") return;

    const RT = Reactor3D.RenderThread = {
        /** Off: the world is drawn on the main thread, as always. */
        enabled: false,
        /** The worker draws as each frame post arrives; false draws on the worker's own animation frame. */
        immediate: true,
        WORKER_URL: "js/plugins/RR_RenderWorker.js",
        worker: null,
        canvas: null,
        mapToken: 0,
        stats: { posts: 0, postMs: 0, mapPostMs: 0, workerFrames: 0, workerMs: 0, workerMax: 0, built: null, errors: [] },
        _ensure() {
            if (this.worker) return true;
            if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return false;
            const canvas = document.createElement("canvas");
            canvas.id = "rrWorldCanvas";
            canvas.width = Graphics.width;
            canvas.height = Graphics.height;
            canvas.style.zIndex = 0;
            canvas.style.pointerEvents = "none";
            document.body.appendChild(canvas);
            Graphics._centerElement(canvas);
            const offscreen = canvas.transferControlToOffscreen();
            const worker = new Worker(this.WORKER_URL, { name: "Reactor world" });
            worker.onmessage = event => this.receive(event.data);
            worker.onerror = event => { this.stats.errors.push(String(event.message || event)); };
            worker.postMessage({ type: "init", canvas: offscreen, width: Graphics.width, height: Graphics.height,
                base: new URL(".", document.baseURI).href, tier: Graphics.gpuTier || null }, [offscreen]);
            this.worker = worker;
            this.canvas = canvas;
            return true;
        },
        receive(data) {
            if (!data) return;
            if (data.type === "frame") {
                this.stats.workerFrames++;
                this.stats.workerMs += data.ms;
                this.stats.workerMax = Math.max(this.stats.workerMax, data.ms);
                this.stats.last = { calls: data.calls, triangles: data.triangles, cam: data.cam };
            } else if (data.type === "built") this.stats.built = data;
            else if (data.type === "error") this.stats.errors.push(data.message);
        },
        attach(spriteset) {
            if (!this.enabled || !spriteset._reactor3d || !this._ensure()) return;
            const t0 = performance.now();
            const tileset = $gameMap.tileset ? $gameMap.tileset() : null;
            this.mapToken++;
            this.worker.postMessage({
                type: "map", token: this.mapToken, mapId: $gameMap.mapId(), mapData: $dataMap, tilesets: $dataTilesets, system: $dataSystem,
                mapInfos: $dataMapInfos, flags: $gameMap.tilesetFlags(), tileSize: Reactor3D.currentTileSize(), tilesetNames: tileset ? tileset.tilesetNames : [],
                settings: spriteset._reactor3d.settings || {}
            });
            this.stats.mapPostMs = +(performance.now() - t0).toFixed(1);
            spriteset._rrRenderThread = true;
            for (const key of ["_reactor3dBelow", "_reactor3dAbove", "_reactor3dLights"]) if (spriteset[key]) spriteset[key].sprite.visible = false;
            Reactor3D.setGameCanvasTransparent(true);
            // What the world used to be drawn over: the spriteset's black backdrop.
            if (spriteset._blackScreen) spriteset._blackScreen.visible = false;
        },
        /** The lights as the main thread works them out (they follow the game): the ambient and the list, plain. */
        lighting(spriteset) {
            const wants = Reactor3D.wantsLights3D($dataMap);
            if (!wants) return { wants: false };
            let lights = [];
            try { lights = JSON.parse(JSON.stringify(Reactor3D.collectLights())); } catch (error) { lights = []; }
            return { wants: true, ambient: Reactor3D.ambientFor($dataMap), lights, focus: { x: $gamePlayer._realX, y: $gamePlayer._realY } };
        },
        post(spriteset) {
            const state = spriteset._reactor3d, camera = state && state.camera;
            if (!camera || !this.worker) return;
            const t0 = performance.now();
            camera.updateMatrixWorld();
            const posts = [];
            const stand = c => {
                if (!c || (c._erased) || (c.isTransparent && c.isTransparent())) return;
                if (c.eventId && c.eventId() >= (Reactor3D.PROP_EVENT_BASE || 1e9)) return;
                if (!c.characterName || (!c.characterName() && !(Reactor3D.characterModelSpec && Reactor3D.characterModelSpec(c)))) return;
                const ground = Number.isFinite(c._reactorGround) ? c._reactorGround : 0;
                posts.push(c._realX + 0.5, ground + (c._reactorAir || 0), c._realY + 0.5);
            };
            stand($gamePlayer);
            for (const follower of $gamePlayer.followers().visibleFollowers()) stand(follower);
            for (const event of $gameMap.events()) stand(event);
            this.worker.postMessage({
                type: "frame", token: this.mapToken, frame: Graphics.frameCount, noDraw: !!this.noDraw, immediate: !!this.immediate,
                animationFrame: spriteset._tilemap && Number.isFinite(spriteset._tilemap.animationFrame) ? spriteset._tilemap.animationFrame : 0,
                camera: { p: camera.position.toArray(), q: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far, zoom: camera.zoom },
                player: { x: $gamePlayer.x, y: $gamePlayer.y, realX: $gamePlayer._realX, realY: $gamePlayer._realY, d: $gamePlayer.direction() },
                posts: new Float32Array(posts),
                light: this.lighting(spriteset)
            });
            this.stats.posts++;
            this.stats.postMs += performance.now() - t0;
        }
    };

    const createReactor3D = Spriteset_Map.prototype.createReactor3D;
    Spriteset_Map.prototype.createReactor3D = function() {
        createReactor3D.apply(this, arguments);
        if (RT.enabled && this._reactor3d) RT.attach(this);
    };

    const updateReactor3D = Spriteset_Map.prototype.updateReactor3D;
    Spriteset_Map.prototype.updateReactor3D = function() {
        if (!this._rrRenderThread || !this._reactor3d) return updateReactor3D.apply(this, arguments);
        if (typeof SceneManager !== "undefined" && SceneManager.isFinalUpdateOfFrame && !SceneManager.isFinalUpdateOfFrame()) return;
        // The models still load here (collision reads them) and still walk; none is drawn.
        if (RT.syncModels && this._reactor3d.scene.syncCharacterModels) this._reactor3d.scene.syncCharacterModels(this.reactor3DModelCharacters());
        // On a screen 60 does not divide the world is drawn on the refreshes Graphics.FramePacing picks.
        if (typeof Graphics !== "undefined" && Graphics.FramePacing && Graphics.FramePacing.drawsWorld && Graphics.FramePacing.drawsWorld(this)) return;
        if (this.drawReactor3D) this.drawReactor3D(this._reactor3d); else RT.post(this);
    };
    const drawReactor3D = Spriteset_Map.prototype.drawReactor3D;
    if (drawReactor3D) Spriteset_Map.prototype.drawReactor3D = function(state) {
        if (!this._rrRenderThread) return drawReactor3D.apply(this, arguments);
        // The world this refresh is the worker's: what it needs goes there, with the camera as it stands now.
        RT.post(this);
    };
    RT.syncModels = true;
})();
