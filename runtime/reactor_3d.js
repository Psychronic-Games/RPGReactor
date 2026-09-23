//=============================================================================
// reactor_3d.js — RPG Reactor HD-2D renderer
//=============================================================================
/*
 * A 3D view of an ordinary RPG Maker map.
 *
 * Design constraints this file exists to honour:
 *
 * 1. The grid stays authoritative. `Game_Map`, `Game_Character`, passability,
 *    region logic and the event interpreter keep operating on the same
 *    `width * height * 6` planes. A 3D event model is the exception: its
 *    authored size occupies every tile the mesh covers, so collision matches
 *    what is on screen.
 *
 * 2. The map file is never rewritten. Elevation and geometry live in a sidecar
 *    (`Map###.r3d.json`), so a 2D project never gains a file, and a 3D map's
 *    `Map###.json` remains valid RPG Maker data describing its 2D footprint.
 *
 * 3. Three.js loads on demand. It is ~2 MB; a project with no 3D maps must
 *    never download or parse it, so there is no entry in `scriptUrls`.
 *
 * 4. Three draws on PIXI's own WebGL context (`_initializeShared`): each map
 *    pass renders into a `WebGLRenderTarget` that PIXI samples as a texture,
 *    so there is no per-frame copy and PIXI keeps drawing windows, pictures,
 *    weather and every plugin-authored sprite over the world exactly as it
 *    does in 2D. If that handover fails, `_initializeCanvas` falls back to a
 *    separate 3D canvas at z-index 0 under the game canvas. Screen effects keep
 *    their WebGL1 overlay; attached effects share the view GPU when supported.
 *
 * 5. This file is the core of the 3D runtime, not all of it. A concern that
 *    outgrows it lives in one reactor_3d_<concern>.js named in
 *    `Reactor3D.EXTENSIONS` (lighting and shadows, models, model effects, the world
 *    builder, speech), loaded right
 *    after this file everywhere: scriptUrls in the game, the extension list in
 *    the editor, and the tail of this file in Node.
 */

//-----------------------------------------------------------------------------
// Reactor3D
//
// Namespace and lifecycle. Everything is static; there is at most one viewport.

function Reactor3D() {
    throw new Error("This is a static class");
}

Reactor3D.LIB_URL = "js/libs/three.js";
/** The editor supplies same-origin URLs for its externally loaded runtime. */
Reactor3D.workerUrl = function(name) {
    return this.resolveWorkerUrl ? this.resolveWorkerUrl(name)
        : new URL(name, new URL(this.LIB_URL, document.baseURI)).href;
};
Reactor3D.SIDECAR_SUFFIX = ".r3d.json";

/**
 * Files that extend this namespace, in load order. The game boots them from
 * scriptUrls straight after this file; the editor loads them by this list
 * once this file is in; in Node the tail of this file requires them, so one
 * require of reactor_3d.js returns the whole API. Each sets its namespace
 * (Reactor3D.World, ...) when it has loaded.
 */
Reactor3D.EXTENSIONS = [
    { file: "reactor_3d_lighting.js", namespace: "Lighting" },
    { file: "reactor_3d_models.js", namespace: "Models" },
    { file: "reactor_3d_effects.js", namespace: "Effects" },
    { file: "reactor_3d_world.js", namespace: "World" },
    { file: "reactor_3d_speech.js", namespace: "Speech" }
];

/**
 * True once every extension has attached. The editor loads the files one
 * script at a time with a frame between them, and its frame loop must not
 * take the core alone for the whole runtime.
 */
Reactor3D.extensionsLoaded = function() {
    return this.EXTENSIONS.every(extension => !!this[extension.namespace]);
};

// Radians per frame an event model may visibly turn; 90 degrees takes about a
// quarter second. Facing itself changes instantly — this only paces the mesh.
Reactor3D.MODEL_TURN_SPEED = 0.1;

// How long a footprint keeps covering the turn's sweep arc after a facing
// change: a half-turn at MODEL_TURN_SPEED plus a couple of frames of margin.
Reactor3D.MODEL_TURN_SWEEP_FRAMES = Math.ceil(Math.PI / Reactor3D.MODEL_TURN_SPEED) + 4;

Reactor3D._loadPromise = null;
Reactor3D._viewport = null;
Reactor3D._unsupportedReason = null;
Reactor3D._supported = null;

/**
 * True once three.js is present. Callers that must not await use this to decide
 * whether a 3D map can be shown this frame.
 */
Reactor3D.isLoaded = function() {
    return typeof THREE !== "undefined";
};

/**
 * Load three.js once, resolving immediately on later calls.
 *
 * Rejection is deliberately swallowed into a resolved `false`: a project whose
 * three.js is missing should fall back to the 2D tilemap with a console error,
 * not fail to boot.
 */
Reactor3D.ensureLoaded = function() {
    if (this.isLoaded()) return Promise.resolve(true);
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = new Promise(resolve => {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.src = this.LIB_URL;
        script.async = false;
        script.onload = () => resolve(this.isLoaded());
        script.onerror = () => {
            console.error(
                `Reactor3D: could not load ${this.LIB_URL}. ` +
                "3D maps will fall back to the 2D tilemap."
            );
            this._unsupportedReason = "three.js failed to load";
            resolve(false);
        };
        document.body.appendChild(script);
    });
    return this._loadPromise;
};

/**
 * Whether this machine can present a 3D map at all.
 *
 * Checked before the library is fetched so a WebGL-less host does not pay 2 MB
 * to discover it cannot draw.
 */
Reactor3D.isSupported = function() {
    if (this._unsupportedReason) return false;
    // Answered once and remembered.
    //
    // This takes a real WebGL context to find out, and the answer cannot
    // change during a session — but `shouldRender3D` calls it, and that is
    // called by every character sprite on every frame. So a 3D map with a
    // hundred events took a hundred contexts per frame and never gave one
    // back: the browser began evicting live ones ("Too many active WebGL
    // contexts"), which took out PIXI's renderer and three's alike, and the
    // game went white on a shader that could no longer compile.
    if (this._supported !== null && this._supported !== undefined) return this._supported;
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (!gl) {
            this._unsupportedReason = "no WebGL context";
            this._supported = false;
            return false;
        }
        // Hand the probe context straight back rather than waiting for the
        // canvas to be collected — a browser's context budget is small, and
        // this one has served its purpose the moment it exists.
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        this._supported = true;
        return true;
    } catch (e) {
        this._unsupportedReason = String(e && e.message ? e.message : e);
        this._supported = false;
        return false;
    }
};

Reactor3D.unsupportedReason = function() {
    return this._unsupportedReason;
};

Reactor3D.viewport = function() {
    return this._viewport;
};

/**
 * Create the viewport if needed; null when 3D is unavailable.
 *
 * A half-built viewport is disposed rather than dropped. The constructor takes
 * a WebGL context before it does anything else, so a throw after that point
 * used to leave the context alive and unreferenced — and the caller retries
 * every frame, so the browser filled with contexts until it started evicting
 * live ones ("Too many active WebGL contexts") and the game went white.
 */
/** The unpack flags PIXI sets, cleared before three takes the context. */
Reactor3D.clearUnpackState = function(gl) {
    if (!gl || typeof gl.pixelStorei !== "function") return;
    try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    } catch (e) { /* a lost context has nothing to clear */ }
};

Reactor3D.acquireViewport = function() {
    if (!this.isLoaded()) return null;
    if (this._viewport) return this._viewport;
    // One attempt. If building it fails there is no reason to believe the next
    // frame will do better, and believing otherwise is what made a single
    // failure into a flood.
    if (this._viewportFailed) return null;
    let built = null;
    try {
        built = new Reactor3D.Viewport();
    } catch (error) {
        this._viewportFailed = true;
        console.error("Reactor3D: could not create the 3D viewport; "
            + "the map will be drawn in 2D.", error);
        if (built) { try { built.destroy(); } catch (e) { /* already broken */ } }
        return null;
    }
    this._viewport = built;
    return this._viewport;
};

/** Tear the viewport down. Safe to call when there is none. */
Reactor3D.releaseViewport = function() {
    if (this._viewport) {
        this._viewport.destroy();
        this._viewport = null;
    }
};

//-----------------------------------------------------------------------------
// Map mode
//
// Which renderer a map wants. Read from the sidecar when present, and settable
// by a `<3d>` map note so a map can opt in without a sidecar existing yet.

Reactor3D.MODE_2D = "2d";
Reactor3D.MODE_3D = "3d";

/**
 * Render mode for a loaded map.
 *
 * `$dataMap.meta` is populated by DataManager's notetag pass, so `<3d>` works
 * as an escape hatch that survives a round trip through RPG Maker itself. The
 * sidecar wins when both are present, because that is the authored source.
 */
Reactor3D.mapMode = function(mapData) {
    if (!mapData) return this.MODE_2D;
    // Asked three times per character sprite per frame (position, scale,
    // visibility), each a regex over the map note. Remembered per map
    // object against the three inputs that decide it, so an edited note
    // or sidecar in the editor is still honoured on the next call.
    const note = mapData.note || "";
    const meta = !!(mapData.meta && mapData.meta["3d"]);
    const sidecar = mapData.reactor3d;
    const sidecarMode = sidecar && typeof sidecar.mode === "string" ? sidecar.mode : null;
    const memo = this._mapModeMemo || (this._mapModeMemo = new WeakMap());
    const known = memo.get(mapData);
    if (known && known.note === note && known.meta === meta && known.sidecarMode === sidecarMode) return known.mode;
    // The note is the switch: without <3d> a map is flat however much its
    // sidecar carries (elevation, event models, previews all still load).
    // With it, the sidecar may still say 2d.
    let mode = this.MODE_2D;
    const noted = meta || /<3d>/i.test(note);
    if (noted && !(sidecarMode !== null && sidecarMode !== this.MODE_3D)) mode = this.MODE_3D;
    memo.set(mapData, { note, meta, sidecarMode, mode });
    return mode;
};

Reactor3D.isMap3D = function(mapData) {
    return this.mapMode(mapData) === this.MODE_3D;
};

//-----------------------------------------------------------------------------
// Elevation
//
// A flat `width * height` array of tile heights, in whole tiles. Absent data
// reads as 0, which renders a 3D map as a flat plane rather than failing —
// the state an existing 2D map is in before anyone paints elevation.

Reactor3D.DEFAULT_ELEVATION = 0;


Reactor3D.elevationAt = function(mapData, x, y) {
    if (!mapData) return this.DEFAULT_ELEVATION;
    const sidecar = mapData.reactor3d;
    const heights = sidecar && sidecar.elevation;
    if (!Array.isArray(heights)) return this.DEFAULT_ELEVATION;
    const width = mapData.width;
    const height = mapData.height;
    if (x < 0 || y < 0 || x >= width || y >= height) return this.DEFAULT_ELEVATION;
    const value = heights[y * width + x];
    return Number.isFinite(value) ? value : this.DEFAULT_ELEVATION;
};

/**
 * The 3D object a cell's tile has been painted into, or 0 for none.
 *
 * A tileset can say what a *tile* is, and that is all it can say: an autotile
 * id is a corner arrangement shared by forty-eight shapes, so every shop built
 * from one wall kind is the same tile as every other. Which cells make up one
 * building is a fact about a placement, and it can only be said on the map.
 *
 * Stored per layer, because a tree on B standing over a wall on A is not part
 * of the building. Layers with nothing painted are absent rather than stored
 * as planes of zeroes.
 */
Reactor3D.objectIdAt = function(mapData, x, y, layer) {
    const painted = mapData && mapData.reactor3d && mapData.reactor3d.objects;
    if (!painted) return 0;
    const plane = painted[layer] || painted[String(layer)];
    if (!Array.isArray(plane)) return 0;
    if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return 0;
    const value = plane[y * mapData.width + x];
    return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * Whether a painted cell is the object's footing rather than its height.
 *
 * Standing a drawing up turns its map rows into courses, so a building painted
 * across seven rows becomes seven tiles tall. Some of those rows are usually
 * the ground it stands on — the skirt of an archway, the pavement in front of
 * a shop — and marking them says so. Without it the whole thing is height, and
 * the object plants itself on its southernmost row instead of in the middle of
 * its own footprint.
 */
Reactor3D.objectGroundAt = function(mapData, x, y, layer) {
    const ground = mapData && mapData.reactor3d && mapData.reactor3d.objectGround;
    if (!ground) return false;
    const plane = ground[layer] || ground[String(layer)];
    if (!Array.isArray(plane)) return false;
    if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return false;
    return !!plane[y * mapData.width + x];
};

/** Whether this map has any painted 3D objects at all. */
Reactor3D.hasPaintedObjects = function(mapData) {
    const painted = mapData && mapData.reactor3d && mapData.reactor3d.objects;
    if (!painted) return false;
    return Object.keys(painted).some(key => {
        const plane = painted[key];
        return Array.isArray(plane) && plane.some(value => value > 0);
    });
};

/**
 * A starting elevation derived from the map's own passability.
 *
 * An existing 2D map carries no height data, and asking an author to paint a
 * whole city by hand before seeing anything in 3D is a poor first experience.
 * Impassable cells are overwhelmingly walls, buildings and cliffs, so raising
 * them recovers a recognisable massing from a map that was never authored for
 * 3D — the starting point an author then edits, not a final answer.
 *
 * Passability is read the way `Game_Map.checkPassage` reads it: the planes are
 * walked top-down and the first tile with a decisive flag wins, with [*] tiles
 * skipped because they say nothing about passage.
 */
Reactor3D.deriveElevation = function(mapData, flags, options) {
    const opts = options || {};
    const wallHeight = opts.wallHeight === undefined ? 2 : opts.wallHeight;
    if (!mapData || !Array.isArray(mapData.data) || !flags) return null;

    const plane = mapData.width * mapData.height;
    const elevation = new Array(plane).fill(0);
    for (let i = 0; i < plane; i++) {
        let blocked = false;
        for (let z = 3; z >= 0; z--) {
            const tileId = mapData.data[z * plane + i] || 0;
            if (!tileId) continue;
            const flag = flags[tileId] || 0;
            if ((flag & 0x10) !== 0) continue;   // [*] no effect on passage
            blocked = (flag & 0x0f) === 0x0f;
            break;
        }
        if (blocked) elevation[i] = wallHeight;
    }
    return elevation;
};

/**
 * Build a fresh sidecar for a map that has none.
 *
 * Kept here rather than in the editor so the runtime and the editor cannot
 * disagree about the shape of the file.
 */
Reactor3D.createSidecar = function(width, height) {
    return {
        version: 1,
        mode: Reactor3D.MODE_3D,
        elevation: new Array(width * height).fill(Reactor3D.DEFAULT_ELEVATION),
        camera: {
            // A shallow orthographic-feeling view: high field-of-view angles
            // read as a first-person tilt rather than the diorama look HD-2D
            // depends on.
            pitch: 55,
            yaw: 0,
            distance: 12,
            fov: 30
        }
    };
};

//-----------------------------------------------------------------------------
// Reactor3D.Viewport
//
// Owns the canvas, renderer and camera. One per game; the scene inside it is
// swapped per map.

Reactor3D.Viewport = function() {
    this.initialize(...arguments);
};

/**
 * Two ways to get the 3D picture into the game.
 *
 * Shared context (the default): three renders with PIXI's own WebGL context
 * into render targets, and PIXI samples those textures directly. Nothing is
 * copied and nothing is uploaded; a frame costs the draws and no more.
 *
 * Canvas copy (the fallback, and the old way): three owns a second canvas,
 * and every pass is copied through a 2D canvas and uploaded to PIXI as a
 * full-screen texture, up to three times a frame. It stays for PIXI builds
 * without a WebGL2 context, and as a kill switch: `?r3dcopy` on the URL or
 * `Reactor3D.useSharedContext = false` before the first map.
 */
Reactor3D.Viewport.prototype.initialize = function() {
    this._scene = null;
    this._camera = null;
    this._shared = false;
    this._generation = 0;
    if (Reactor3D.sharedContextAvailable()) {
        try {
            this._initializeShared();
        } catch (error) {
            console.warn("Reactor3D: shared-context viewport unavailable, drawing through a canvas copy instead:", error);
            this._teardownShared();
        }
    }
    if (!this._shared) this._initializeCanvas();
};

Reactor3D.useSharedContext = true;
/**
 * MSAA samples for the shared-context targets at full scale; fewer as the
 * scale drops. Zero by default: multisampling is a smoothing filter on
 * every model edge, and enlarged into the frame afterwards it reads as
 * blur - the owner wants the hard edge. A project that prefers smoothed
 * edges sets 2 or 4 (a script call or plugin).
 */
Reactor3D.renderTargetSamples = 0;
/**
 * Resolution of the 3D passes relative to the screen, 1 = native.
 *
 * The adaptive controller — drop the scale when frames run long, climb back
 * after calm — is OFF by default: the upscale reads as a blur layer over the
 * whole scene, and a game that never asked for it should stay sharp. A
 * project that wants the safety net on weak machines opts in deliberately
 * with `Reactor3D.adaptiveResolution = true` (a script call or plugin);
 * `renderScale` set below 1 holds a fixed saving either way.
 */
Reactor3D.renderScale = 1;
/**
 * The most backing pixels a 3D pass draws per game pixel, whatever the
 * canvas draws at. One: the world is rendered at game size on every screen
 * and enlarged into the frame pixel for pixel, so a 1280x720 game on a
 * 1440p screen is a clean 2x2 block per world pixel — the owner's judgement
 * over a native-resolution pass, which softens the same models through
 * texture filtering and antialiasing, and a fraction of its cost. The
 * canvas itself still draws at the screen's resolution, so windows, text
 * and pictures enlarge smoothly as they always have. 0 lets the passes
 * follow the canvas (native); a script or plugin sets either at any time.
 */
Reactor3D.maxPassPixelRatio = 1;
Reactor3D.adaptiveResolution = false;
Reactor3D.minRenderScale = 0.5;

/** MSAA for a given scale: a half-size target has nothing left to smooth. */
Reactor3D.samplesForScale = function(scale) {
    let base = Math.max(0, Math.floor(this.renderTargetSamples || 0));
    // Native-resolution targets (fullscreen at 2x and beyond) already cost
    // several times the pixels; full multisampling on top of that is what
    // pushes a browser GPU past its frame budget. Edges keep 2x there.
    const ratio = typeof Graphics !== "undefined" && Graphics.canvasPixelRatio
        ? Graphics.canvasPixelRatio() : 1;
    if (ratio >= 2) base = Math.min(base, 2);
    if (scale >= 1) return base;
    if (scale >= 0.75) return Math.min(base, 2);
    return 0;
};

/**
 * The adaptive controller, as a pure step: the recent average frame
 * interval in, the scale to render at next out. The game runs its logic at
 * 60, so 60 is the bar whatever the display does: a game averaging under
 * 45 fps drops a quarter step; one holding 57 or better climbs back toward
 * the ceiling. (Measuring the display's own period from the fastest
 * interval seen was tried first: a catch-up burst after one long frame
 * read as a 240 Hz display, and everything looked slow against it.)
 */
Reactor3D.TARGET_FRAME_MS = 1000 / 60;
Reactor3D.adaptScale = function(stats, current, ceiling, floor) {
    if (!stats || !(stats.ema > 0)) return current;
    const step = value => Math.round(value * 100) / 100;
    if (stats.ema > Reactor3D.TARGET_FRAME_MS * 1.35 && current > floor) return Math.max(floor, step(current - 0.25));
    if (stats.ema < Reactor3D.TARGET_FRAME_MS * 1.05 && current < ceiling) return Math.min(ceiling, step(current + 0.25));
    return current;
};

/** Whether the running PIXI can lend three its context and sample the result. */
Reactor3D.sharedContextAvailable = function() {
    if (this.useSharedContext === false) return false;
    try {
        if (typeof location !== "undefined" && /[?&]r3dcopy\b/.test(location.search || "")) return false;
    } catch (e) { /* no location */ }
    if (typeof PIXI === "undefined" || !PIXI.TextureSource || !PIXI.Texture || !PIXI.groupD8) return false;
    if (typeof THREE === "undefined" || !THREE.WebGLRenderTarget) return false;
    const app = typeof Graphics !== "undefined" && Graphics._app;
    const renderer = app && app.renderer;
    if (!renderer || !renderer.gl || !renderer.context || renderer.context.webGLVersion !== 2) return false;
    if (typeof renderer.resetState !== "function" || !renderer.texture) return false;
    return true;
};

Reactor3D.Viewport.prototype._initializeShared = function() {
    const pixi = Graphics._app.renderer;
    this._pixi = pixi;
    this._canvas = null;
    this._targets = Object.create(null);
    this._passTextures = Object.create(null);
    this._width = 0;
    this._height = 0;
    this._scale = Math.min(1, Math.max(0.25, Reactor3D.renderScale || 1));
    // PIXI leaves its unpack flags (flip Y, premultiply alpha) set on the
    // context; three's state setup uploads empty 3D textures, which WebGL
    // rejects under those flags. Clear them for the handover; three tracks
    // them itself from here and PIXI re-sets its own on its next upload.
    Reactor3D.clearUnpackState(pixi.gl);
    this._renderer = new THREE.WebGLRenderer({
        canvas: pixi.canvas || Graphics._canvas,
        context: pixi.gl,
        // The targets carry the multisampling; the context's own setting is
        // PIXI's business.
        antialias: false,
        alpha: true,
        premultipliedAlpha: true
    });
    this._renderer.setPixelRatio(1);
    this._renderer.setClearColor(0x000000, 0);
    // three's constructor set the context to its own defaults behind PIXI's
    // back; PIXI's state cache must not believe otherwise.
    this._resetPixi();
    this.resize();
    this._shared = true;
};

Reactor3D.Viewport.prototype._teardownShared = function() {
    this._disposeTargets();
    if (this._renderer) {
        try { this._renderer.dispose(); } catch (e) { /* nothing to do */ }
    }
    this._renderer = null;
    this._pixi = null;
    this._shared = false;
};

Reactor3D.Viewport.prototype.isShared = function() {
    return !!this._shared;
};

/** The resolution the passes render at, relative to the screen. */
Reactor3D.Viewport.prototype.scale = function() {
    return this._scale || 1;
};

/** Change the pass resolution; the targets and their sprites rebuild. */
Reactor3D.Viewport.prototype.setRenderScale = function(scale) {
    const next = Math.min(1, Math.max(0.25, Number(scale) || 1));
    if (!this._shared || Math.abs(next - this._scale) < 0.001) return;
    this._scale = next;
    this._disposeTargets();
    this._generation++;
};

/**
 * Target pixel size for the passes at the current scale. The canvas pixel
 * ratio rides along so an enlarged game (fullscreen) renders its 3D at the
 * pixels actually on screen instead of upscaling a game-sized pass.
 */
Reactor3D.Viewport.prototype.targetSize = function() {
    const ratio = this.passPixelRatio();
    return {
        width: Math.max(1, Math.round(this._width * this._scale * ratio)),
        height: Math.max(1, Math.round(this._height * this._scale * ratio))
    };
};

/**
 * Backing pixels per game pixel the passes draw at: the canvas's, capped
 * by `maxPassPixelRatio`. The cap holds at every enlargement, whole-number
 * or not: at 1.5x nearest-neighbour doubles every other pixel, and the
 * owner judged that sharper and better on a model than any smoothed
 * enlargement - "just like resizing an image in Photoshop".
 */
Reactor3D.Viewport.prototype.passPixelRatio = function() {
    const canvas = typeof Graphics !== "undefined" && Graphics.canvasPixelRatio
        ? Graphics.canvasPixelRatio() : 1;
    const cap = Reactor3D.maxPassPixelRatio;
    return cap > 0 ? Math.min(canvas, cap) : canvas;
};

/** Whether the passes are drawn smaller than the canvas and enlarged into it. */
Reactor3D.Viewport.prototype.passEnlarged = function() {
    const canvas = typeof Graphics !== "undefined" && Graphics.canvasPixelRatio
        ? Graphics.canvasPixelRatio() : 1;
    return this.passPixelRatio() < canvas - 0.001;
};

/**
 * Once per game frame: measure the interval since the last frame and let
 * the controller move the scale. A manual scale (controller off) is applied
 * here too, so a script can set `Reactor3D.renderScale` at any time.
 */
Reactor3D.Viewport.prototype._trackFrame = function() {
    const frame = typeof Graphics !== "undefined" && Number.isFinite(Graphics.frameCount)
        ? Graphics.frameCount : this._renderCount;
    if (frame === this._trackedFrame) return;
    this._trackedFrame = frame;
    if (!Reactor3D.adaptiveResolution) {
        this.setRenderScale(Reactor3D.renderScale);
        return;
    }
    const now = performance.now();
    const stats = this._stats || (this._stats = { last: 0, ema: 0, since: 0, cooldown: 0 });
    if (stats.last) {
        const interval = now - stats.last;
        // A frame that took over a second is a stall, not a frame rate.
        if (interval > 1 && interval < 1000) {
            stats.ema = stats.ema ? stats.ema * 0.9 + interval * 0.1 : interval;
            stats.since++;
        }
    }
    stats.last = now;
    if (stats.cooldown > 0) {
        stats.cooldown--;
        return;
    }
    if (stats.since < 60) return;
    const ceiling = Math.min(1, Math.max(Reactor3D.minRenderScale, Reactor3D.renderScale || 1));
    const next = Reactor3D.adaptScale(stats, this._scale, ceiling, Reactor3D.minRenderScale);
    // Dropping acts within a second; climbing back wants five calm ones.
    if (next < this._scale || (next > this._scale && stats.since >= 300)) {
        this.setRenderScale(next);
        stats.cooldown = 120;
        stats.since = 0;
    }
};

/** Bumps whenever the pass textures are replaced (a resize); sprites holding an older one rebuild. */
Reactor3D.Viewport.prototype.generation = function() {
    return this._generation || 0;
};

Reactor3D.Viewport.prototype._disposeTargets = function() {
    const targets = this._targets || {};
    const passTextures = this._passTextures || {};
    this._targets = Object.create(null);
    this._passTextures = Object.create(null);
    const pixi = this._pixi;
    const reap = () => {
        for (const slot of Object.keys(targets)) {
            try { targets[slot].dispose(); } catch (e) { /* already gone */ }
        }
        for (const slot of Object.keys(passTextures)) {
            const entry = passTextures[slot];
            // PIXI never created the GL texture, so it must not delete it
            // either: the entry is dropped before the source is destroyed.
            if (entry && entry.source && pixi) delete entry.source._gpuData[pixi.uid];
            try { entry.texture.destroy(true); } catch (e) { /* already gone */ }
        }
    };
    // The pass sprites rebuild off the generation on their next update; a
    // render can land between this dispose (a resize event) and that
    // rebuild, and a sprite holding a destroyed texture is skipped — the
    // ground blinks out for a frame and the compat guard logs a leak that
    // is not one. Two frames from now nothing references the old passes.
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function() { requestAnimationFrame(reap); });
    } else {
        reap();
    }
};

Reactor3D.Viewport.prototype._target = function(slot) {
    const existing = this._targets[slot];
    if (existing) return existing;
    const size = this.targetSize();
    const target = this.createTarget(size.width, size.height, this._scale);
    this._targets[slot] = target;
    return target;
};

Reactor3D.Viewport.prototype.pixi = function() {
    return this._pixi || null;
};

/** The GL texture three renders `target` into, once it has been allocated. */
Reactor3D.Viewport.prototype.targetHandle = function(target) {
    const props = this._renderer && this._renderer.properties.get(target.texture);
    return (props && props.__webglTexture) || null;
};

/** Draw a scene into a target, each side forgetting what the other did to the context. */
/**
 * Index-only levels for dense rigid models, prepared by one lazy worker.
 * The camera chooses a subpixel error estimate. Close views, unsupported or
 * changing geometry and worker failures use the full mesh. Only the colour
 * draw swaps geometry: collision, animation and shadow maps see the original.
 */
Reactor3D.GeometryDetail = {
    enabled: true,
    pixelError: 0.35,
    _states: new WeakMap(),
    _queue: [],
    _serial: 0,
    eligible(object) {
        const g = object.geometry, m = object.material;
        return object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh
            && g?.index?.count >= 100000 && !g.groups.length
            && g.drawRange.start === 0 && g.drawRange.count >= g.index.count
            && !Object.values(g.morphAttributes || {}).some(a => a.length)
            && m?.isMeshBasicMaterial && m.__reactorModel && !m.transparent && !m.alphaTest && !m.envMap
            && !m.__reactorBillboard && !g.attributes.position.isInterleavedBufferAttribute
            && g.attributes.position.array instanceof Float32Array
            && Object.keys(g.attributes).every(k => /^(position|normal|tangent|uv\d*|color)$/.test(k));
    },
    signature(g) {
        return [g.index, g.index.version, ...Object.entries(g.attributes).flatMap(([k, a]) => [k, a, a.version, a.data?.version, a.count])];
    },
    fresh(state) {
        const now = this.signature(state.source);
        return !state.dead && now.length === state.signature.length && now.every((v, i) => v === state.signature[i]);
    },
    release(state) {
        state.dead = true;
        for (const level of state.levels) level.geometry.dispose();
        state.levels.length = 0;
        state.source.removeEventListener('dispose', state.onDispose);
    },
    state(g) {
        let state = this._states.get(g);
        if (state && this.fresh(state)) return state;
        if (state) this.release(state);
        state = { source: g, signature: this.signature(g), levels: [], id: ++this._serial, dead: false };
        state.onDispose = () => this.release(state);
        g.addEventListener('dispose', state.onDispose);
        this._states.set(g, state);
        this._queue.push(state);
        this.dispatch();
        return state;
    },
    dispatch() {
        if (this._busy || this._failed || !this._queue.length) return;
        const state = this._queue.shift();
        if (!this.fresh(state)) return this.dispatch();
        try {
            if (!this._worker) {
                const url = Reactor3D.workerUrl('reactor_geometry_worker.js');
                this._worker = new Worker(url, { type: 'module', name: 'Reactor geometry' });
                this._worker.onmessage = event => this.receive(event.data);
                this._worker.onerror = () => this.fail();
                this._worker.onmessageerror = () => this.fail();
            }
            const g = state.source, positions = g.attributes.position.array.slice();
            const indices = new Uint32Array(g.index.array);
            const attributes = Object.entries(g.attributes).filter(([k]) => /^(uv\d*|color)$/.test(k));
            const stride = attributes.reduce((n, [, a]) => n + a.itemSize, 0);
            const packed = new Float32Array(g.attributes.position.count * stride);
            for (let v = 0; v < g.attributes.position.count; v++) {
                let at = v * stride;
                for (const [, a] of attributes) for (let c = 0; c < a.itemSize; c++) packed[at++] = a.getComponent(v, c);
            }
            this._busy = state;
            this._worker.postMessage({ id: state.id, positions, indices, attributes: packed, stride,
                weights: new Array(stride).fill(1) }, [positions.buffer, indices.buffer, packed.buffer]);
        } catch (error) { this.fail(); }
    },
    receive(message) {
        const state = this._busy;
        this._busy = null;
        if (!state || message.id !== state.id) return this.fail();
        if (message.error) return this.fail();
        if (this.fresh(state)) {
            for (const level of message.levels) {
                const g = new THREE.BufferGeometry();
                // Sharing immutable vertex buffers avoids duplicating textures,
                // attributes, bone data or the authored GLB on disk.
                for (const [key, value] of Object.entries(state.source.attributes)) g.setAttribute(key, value);
                g.setIndex(new THREE.BufferAttribute(level.indices, 1));
                g.boundingBox = state.source.boundingBox?.clone() || null;
                g.boundingSphere = state.source.boundingSphere?.clone() || null;
                state.levels.push({ geometry: g, error: level.error });
            }
        }
        this.dispatch();
    },
    fail() {
        this._failed = true;
        this._worker?.terminate();
        this._worker = null;
        this._busy = null;
        this._queue.length = 0;
    },
    /** Upper bound on scale, including sheared nonuniform parent transforms. */
    scaleBound(e) {
        const a = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
        const b = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
        const c = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
        const ab = Math.abs(e[0] * e[4] + e[1] * e[5] + e[2] * e[6]);
        const ac = Math.abs(e[0] * e[8] + e[1] * e[9] + e[2] * e[10]);
        const bc = Math.abs(e[4] * e[8] + e[5] * e[9] + e[6] * e[10]);
        return Math.sqrt(Math.max(a + ab + ac, b + ab + bc, c + ac + bc));
    },
    pixelsPerUnit(object, camera, height) {
        const g = object.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const scale = this.scaleBound(object.matrixWorld.elements);
        const center = (this._center || (this._center = new THREE.Vector3())).copy(g.boundingSphere.center)
            .applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        const depth = camera.isPerspectiveCamera ? Math.max(camera.near, -center.z - g.boundingSphere.radius * scale) : 1;
        return height * 0.5 * Math.abs(camera.projectionMatrix.elements[5]) * scale / depth;
    },
    begin(scene, camera, height) {
        const swapped = [];
        if (!this.enabled || this._failed || scene.overrideMaterial || typeof Worker === 'undefined' || Reactor3D.tier() !== 'weak') return swapped;
        scene.traverseVisible(object => {
            if (!this.eligible(object)) return;
            const state = this.state(object.geometry);
            if (!state.levels.length) return;
            const pixels = this.pixelsPerUnit(object, camera, height);
            let selected = null;
            for (const level of state.levels) if (level.error * pixels <= this.pixelError) selected = level.geometry;
            if (!selected) return;
            swapped.push([object, object.geometry]);
            object.geometry = selected;
        });
        return swapped;
    },
    end(swapped) {
        for (const [object, geometry] of swapped) object.geometry = geometry;
    },
    withOriginal(draw) {
        const active = this._active || [], restore = [];
        for (const [object, original] of active) { restore.push([object, object.geometry]); object.geometry = original; }
        try { return draw(); } finally { for (const [object, geometry] of restore) object.geometry = geometry; }
    }
};

/** Avoid rebuilding and uploading an unchanged bone palette for every pass. */
Reactor3D.SkeletonUpdates = {
    enabled: true,
    install(skeleton) {
        if (!skeleton || skeleton.__rrPaletteCache || skeleton.update !== THREE.Skeleton.prototype.update) return;
        const original = skeleton.update;
        const state = { valid: false, texture: null, matrices: null, pose: null, values: null };
        skeleton.__rrPaletteCache = state;
        skeleton.update = function() {
            if (!Reactor3D.SkeletonUpdates.enabled) { state.valid = false; return original.call(this); }
            const n = this.bones.length, matrices = this.boneMatrices;
            let same = Reactor3D.SkeletonUpdates.enabled && state.valid && state.matrices === matrices
                && state.texture === this.boneTexture && state.pose.length === n * 32;
            if (same) {
                for (let i = 0; i < n && same; i++) {
                    const world = this.bones[i]?.matrixWorld.elements;
                    const inverse = this.boneInverses[i].elements;
                    for (let j = 0; j < 16; j++) {
                        const value = world ? world[j] : (j % 5 === 0 ? 1 : 0);
                        if (state.pose[i * 32 + j] !== value || state.pose[i * 32 + 16 + j] !== inverse[j]) { same = false; break; }
                    }
                }
                // Respect callers that directly edit the exposed palette too.
                for (let i = 0; same && i < matrices.length; i++) if (state.values[i] !== matrices[i]) same = false;
            }
            if (same) return;
            original.call(this);
            if (!state.pose || state.pose.length !== n * 32) state.pose = new Float64Array(n * 32);
            if (!state.values || state.values.length !== matrices.length) state.values = new Float32Array(matrices.length);
            for (let i = 0; i < n; i++) {
                const world = this.bones[i]?.matrixWorld.elements;
                for (let j = 0; j < 16; j++) state.pose[i * 32 + j] = world ? world[j] : (j % 5 === 0 ? 1 : 0);
                state.pose.set(this.boneInverses[i].elements, i * 32 + 16);
            }
            state.values.set(matrices); state.matrices = matrices; state.texture = this.boneTexture; state.valid = true;
        };
    },
    prepare(scene) {
        scene.traverseVisible(object => { if (object.isSkinnedMesh) this.install(object.skeleton); });
    }
};

/** A cleared shared target can be reused while a pass has nothing to draw. */
Reactor3D.EmptyPass = {
    enabled: true,
    hasWork(scene, camera) {
        if (scene.background || scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
            || scene.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return true;
        const visit = object => {
            if (!object.visible) return false;
            if (object.layers.test(camera.layers)) {
                if (object === Reactor3D.Shadows._sentinel) {
                    if (Reactor3D.Shadows._pending) return true;
                } else if (object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
                    || object.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return true;
                if (object.isSprite || object.isBatchedMesh) return true;
                const g = object.geometry;
                if (g && (g.index?.count || g.attributes?.position?.count) > 0 && g.drawRange.count !== 0) return true;
            }
            for (const child of object.children) if (visit(child)) return true;
            return false;
        };
        return visit(scene);
    },
    render(viewport, target, scene, camera, draw) {
        const renderer = viewport._renderer;
        const cache = viewport._emptyPasses || (viewport._emptyPasses = new WeakSet());
        const watched = viewport._emptyPassTargets || (viewport._emptyPassTargets = new WeakSet());
        if (!watched.has(target)) {
            watched.add(target);
            target.addEventListener('dispose', () => cache.delete(target));
        }
        const empty = this.enabled && viewport._shared && renderer.autoClear && renderer.autoClearColor
            && renderer.autoClearDepth && renderer.autoClearStencil
            && renderer.getClearAlpha() === 0 && !this.hasWork(scene, camera);
        if (empty && cache.has(target)) return;
        cache.delete(target);
        draw();
        if (empty) cache.add(target);
    }
};

/** The game, editor map and model previews use the same colour-draw path. */
Reactor3D.renderScene = function(renderer, scene, camera) {
    this.SkeletonUpdates.prepare(scene);
    const detail = this.GeometryDetail;
    if (!detail.enabled || detail._failed || this.tier() !== 'weak') {
        const auto = scene.matrixWorldAutoUpdate;
        try {
            if (auto) { scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false; }
            return this.CoveredFloor.draw(renderer, scene, camera);
        } finally { scene.matrixWorldAutoUpdate = auto; }
    }
    const sceneAuto = scene.matrixWorldAutoUpdate, cameraAuto = camera.matrixWorldAutoUpdate;
    const previous = detail._active;
    let swaps = [];
    try {
        // Do the renderer's normal update before choosing an index level.
        // Suppress its duplicate walk, then restore the caller's settings.
        if (sceneAuto) { scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false; }
        if (camera.parent === null && cameraAuto) { camera.updateMatrixWorld(); camera.matrixWorldAutoUpdate = false; }
        const target = renderer.getRenderTarget?.();
        const height = target?.height || renderer.domElement?.height || 1080;
        swaps = detail.begin(scene, camera, height);
        detail._active = swaps;
        return this.CoveredFloor.draw(renderer, scene, camera);
    } finally {
        detail.end(swaps); detail._active = previous;
        scene.matrixWorldAutoUpdate = sceneAuto; camera.matrixWorldAutoUpdate = cameraAuto;
    }
};


Reactor3D.Viewport.prototype.renderInto = function(target, scene, camera) {
    Reactor3D.EmptyPass.render(this, target, scene, camera, () => {
        this._renderer.resetState();
        this._renderer.setRenderTarget(target);
        try { Reactor3D.renderScene(this._renderer, scene, camera); }
        finally { this._renderer.setRenderTarget(null); this._resetPixi(); }
    });
};

/** The three.js renderer, for anything that has to upload a texture on the spot. */
Reactor3D.Viewport.prototype.renderer = function() {
    return this._renderer;
};

/** A render target PIXI can sample as if it were an uploaded canvas. */
Reactor3D.Viewport.prototype.createTarget = function(width, height, scale, options) {
    const gl = this._pixi.gl;
    let samples = options?.samples ?? Reactor3D.samplesForScale(scale === undefined ? 1 : scale);
    try { samples = Math.min(samples, gl.getParameter(gl.MAX_SAMPLES) || 0); } catch (e) { samples = 0; }
    // The sampling filter has to be set HERE, on three's side: PIXI samples
    // this texture through the GL object three created and never applies
    // its own style to a texture it did not make, so a `scaleMode` on the
    // PIXI source changes nothing on the GPU. Nearest, always: a pass drawn
    // smaller than the canvas is enlarged into it pixel for pixel, and one
    // drawn at canvas size reads the same texel either way. Deciding this
    // per target from the canvas ratio of the moment left a target born in
    // a window sampling linear once the window was enlarged around it, and
    // the enlargement then read as a blur over the whole world.
    const filter = THREE.NearestFilter;
    const target = new THREE.WebGLRenderTarget(width, height, {
        samples,
        depthBuffer: true,
        stencilBuffer: false,
        colorSpace: THREE.SRGBColorSpace,
        minFilter: filter,
        magFilter: filter,
        generateMipmaps: false
    });
    // three encodes to sRGB in the shader only for the canvas and for an XR
    // target; that gives exactly the bytes the canvas used to hold, which is
    // what PIXI expects to sample. Tone mapping follows the same rule. The
    // storage is named outright: left to the colour space, the texture would
    // be allocated SRGB8_ALPHA8 while the XR flag forces the multisample
    // renderbuffer to RGBA8, and the resolve blit between them fails.
    target.isXRRenderTarget = true;
    target.texture.internalFormat = "RGBA8";
    this._renderer.initRenderTarget(target);
    return target;
};

/**
 * The PIXI texture that shows one pass. PIXI's texture system is handed the
 * GL texture three renders into; it binds it like any other and never
 * uploads to it. Flipped vertically: a framebuffer's first row is its bottom.
 */
Reactor3D.Viewport.prototype.passTexture = function(slot) {
    const cached = this._passTextures[slot];
    if (cached && cached.generation === this._generation) return cached.texture;
    const target = this._target(slot);
    const handle = this.targetHandle(target);
    if (!handle) throw new Error("Reactor3D: render target " + slot + " has no GL texture");
    const size = this.targetSize();
    const source = new PIXI.TextureSource({
        width: size.width,
        height: size.height,
        resolution: 1,
        // A pass drawn smaller than the canvas is enlarged into it pixel
        // for pixel, not smoothed: the world stays hard-edged while the
        // 2D layer over it, drawn at the canvas's own size, stays smooth.
        // (Informational: the GL texture three made carries the filter.)
        scaleMode: "nearest",
        alphaMode: "premultiplied-alpha",
        autoGarbageCollect: false,
        label: "reactor3d-" + slot
    });
    Reactor3D.adoptGlTexture(this._pixi, source, handle);
    const texture = new PIXI.Texture({
        source,
        rotate: PIXI.groupD8.MIRROR_VERTICAL,
        label: "reactor3d-" + slot
    });
    this._passTextures[slot] = { texture, source, generation: this._generation };
    return texture;
};

/**
 * Point a PIXI texture source at a GL texture PIXI did not create. Seeding
 * the source's GPU record is what stops PIXI allocating its own; with no
 * upload method the source has nothing to send, and update() is disarmed
 * so nothing can ask it to.
 */
Reactor3D.adoptGlTexture = function(renderer, source, handle) {
    const gl = renderer.gl;
    // A source PIXI had already uploaded (a battler's bitmap that drew a
    // frame or two through the copy path) owns a GL texture of PIXI's
    // making; nothing else will free it.
    const previous = source._gpuData[renderer.uid];
    if (previous && previous.texture && previous.texture !== handle && !previous.__reactorExternal) {
        try { gl.deleteTexture(previous.texture); } catch (e) { /* already gone */ }
    }
    const glTexture = PIXI.GlTexture ? new PIXI.GlTexture(handle) : {
        _layerInitMask: 0, texture: handle, samplerType: 0, destroy() {}
    };
    glTexture.__reactorExternal = true;
    glTexture.target = gl.TEXTURE_2D;
    glTexture.width = source.pixelWidth;
    glTexture.height = source.pixelHeight;
    glTexture.type = gl.UNSIGNED_BYTE;
    glTexture.internalFormat = gl.RGBA8 || gl.RGBA;
    glTexture.format = gl.RGBA;
    source._gpuData[renderer.uid] = glTexture;
    source.uploadMethodId = "external";
    // three writes the target premultiplied, as the canvas was.
    source.alphaMode = "premultiplied-alpha";
    source.update = function() {};
    source.__reactorExternal = true;
    return glTexture;
};

/**
 * Draw a battler's scene for this frame into its sprite. On a shared
 * context the scene renders straight into a target the sprite's texture
 * has been pointed at, no copy; otherwise it renders on the private battler
 * renderer and is copied through the bitmap and uploaded, as it always was.
 */
Reactor3D.paintBattlerFrame = function(state, sprite) {
    if (this.sharedContextAvailable()) {
        const viewport = this.acquireViewport();
        if (viewport && viewport.isShared() && this._paintBattlerShared(viewport, state, sprite)) return;
    }
    const renderer = this._battlerRenderer || (this._battlerRenderer =
        new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    renderer.setSize(state.size, state.size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(state.scene, state.camera);
    const context = state.bitmap.context;
    context.clearRect(0, 0, state.size, state.size);
    context.drawImage(renderer.domElement, 0, 0, state.size, state.size);
    state.bitmap.baseTexture.update();
};

Reactor3D._paintBattlerShared = function(viewport, state, sprite) {
    const base = state.bitmap && state.bitmap.baseTexture;
    const source = base && base.source;
    if (!source || typeof PIXI === "undefined" || !PIXI.groupD8) return false;
    const scale = state.flat ? 1 : viewport.scale();
    const pixels = Math.max(16, Math.round(state.size * scale));
    if (!state.target || state.targetPixels !== pixels) {
        if (state.target) {
            try { state.target.dispose(); } catch (e) { /* already gone */ }
        }
        viewport.renderer().resetState();
        Reactor3D.clearUnpackState(viewport.pixi().gl);
        state.target = viewport.createTarget(pixels, pixels, scale, state.flat ? { samples: 4 } : undefined);
        state.targetPixels = pixels;
        state.adoptedSource = null;
    }
    if (state.adoptedSource !== source) {
        const handle = viewport.targetHandle(state.target);
        if (!handle) return false;
        this.adoptGlTexture(viewport.pixi(), source, handle);
        state.adoptedSource = source;
    }
    // A framebuffer's first row is its bottom. The sprite's texture is
    // rebuilt whenever its frame changes, so the flip is re-asserted here.
    const texture = sprite.texture;
    if (texture && texture.source === source && texture.rotate !== PIXI.groupD8.MIRROR_VERTICAL) {
        texture.rotate = PIXI.groupD8.MIRROR_VERTICAL;
        if (typeof texture.updateUvs === "function") texture.updateUvs();
    }
    viewport.renderInto(state.target, state.scene, state.camera);
    return true;
};

/** A battler's target is GPU memory; it goes with the state that owned it. */
Reactor3D.releaseBattlerState = function(state) {
    if (!state || !state.target) return;
    try { state.target.dispose(); } catch (e) { /* already gone */ }
    state.target = null;
    state.adoptedSource = null;
};

/**
 * Paint a model sprite through its bitmap's canvas on the standalone
 * renderer when context sharing is unavailable. Normally the sprite samples
 * a GPU target directly; only a changed, visible pose asks for a repaint.
 */
Reactor3D.paintModelSpriteCanvas = function(state) {
    // Model sprites can sample a shared GPU target just like battlers. Reset
    // both renderers around allocation too; target initialization touches GL.
    if (!this.forceMapModelCanvas && state.sprite && this.sharedContextAvailable()) {
        const viewport = this.acquireViewport();
        if (viewport?.isShared() && this._paintBattlerShared(viewport, state, state.sprite)) return;
    }
    const renderer = this._battlerRenderer || (this._battlerRenderer =
        new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    renderer.setSize(state.size, state.size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(state.scene, state.camera);
    const context = state.bitmap.context;
    context.clearRect(0, 0, state.size, state.size);
    context.drawImage(renderer.domElement, 0, 0, state.size, state.size);
    state.bitmap.baseTexture.update();
};

/** PIXI's caches after three has driven the context. */
Reactor3D.Viewport.prototype._resetPixi = function() {
    const pixi = this._pixi;
    if (!pixi) return;
    pixi.resetState();
    // resetState believes the empty texture is bound everywhere; three left
    // its own there. Nulls force a real bind on the next use.
    const textures = pixi.texture;
    if (textures && Array.isArray(textures._boundTextures)) textures._boundTextures.fill(null);
    // The shadow atlases are 2D depth textures in compare mode, and three
    // leaves them on whatever units its last program used. PIXI's batch
    // shader declares sixteen plain sampler2Ds, one per unit, and the
    // driver refuses the draw outright if any of them points at a compare
    // texture — sampled or not. three's own binding cache is reset before
    // its next pass, so clearing the units costs it nothing.
    Reactor3D.Shadows.unbindFrom(this._renderer);
};

Reactor3D.Viewport.prototype._initializeCanvas = function() {
    this._canvas = document.createElement("canvas");
    this._canvas.id = "reactor3dCanvas";
    // Below the game canvas (z-index 1) so PIXI keeps drawing every window,
    // picture and plugin sprite over the top, and non-interactive so it cannot
    // intercept the input the game canvas expects.
    this._canvas.style.zIndex = 0;
    this._canvas.style.pointerEvents = "none";
    document.body.appendChild(this._canvas);

    this._renderer = new THREE.WebGLRenderer({
        canvas: this._canvas,
        // Multisampling, which is what alpha-to-coverage spreads a cut-out's
        // partial alpha across — see `billboardMaterial`. It smooths coverage,
        // not texture sampling: filtering stays nearest, so texels are as crisp
        // as they ever were and only the edges of a shape are resolved.
        antialias: true,
        alpha: true
    });
    this._renderer.setPixelRatio(1);
    // Cleared transparent, not black. The render is composited into the game's
    // own scene as a sprite, and the pass drawn *over* the characters must show
    // them everywhere it has nothing of its own — an opaque clear there would
    // be a black rectangle across the screen.
    this._renderer.setClearColor(0x000000, 0);

    this._scene = null;
    this._camera = null;
    // Anything from here on can throw — `resize` reads Graphics and touches the
    // DOM — and the context is already taken by now, so it is given back rather
    // than left for the browser to evict later.
    try {
        this.resize();
    } catch (error) {
        try { this._renderer.dispose(); } catch (e) { /* nothing to do */ }
        try { this._canvas.remove(); } catch (e) { /* nothing to do */ }
        throw error;
    }
};

/** Match the game canvas's backing size and on-screen placement. */
Reactor3D.Viewport.prototype.resize = function() {
    const width = Graphics.width;
    const height = Graphics.height;
    if (this._shared || (!this._canvas && this._pixi)) {
        // The targets are the canvas here; a new size means new ones, and
        // the sprites showing them rebuild off the generation. The canvas
        // pixel ratio counts as size: fullscreen changes it without touching
        // the game's width or height.
        const ratio = typeof Graphics !== "undefined" && Graphics.canvasPixelRatio
            ? Graphics.canvasPixelRatio() : 1;
        if (width !== this._width || height !== this._height || ratio !== this._targetRatio) {
            this._width = width;
            this._height = height;
            this._targetRatio = ratio;
            this._disposeTargets();
            this._generation++;
        }
    } else {
        this._canvas.width = width;
        this._canvas.height = height;
        this._renderer.setSize(width, height, false);
        // Reuse the engine's own centring so the two canvases cannot drift apart
        // when the window is resized or the game is scaled.
        Graphics._centerElement(this._canvas);
        if (Graphics._applyUpscaleFilter) Graphics._applyUpscaleFilter(this._canvas);
    }
    if (this._camera && this._camera.isPerspectiveCamera) {
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
    }
};

Reactor3D.Viewport.prototype.setScene = function(scene, camera) {
    this._scene = scene;
    this._camera = camera;
    this.resize();
};

Reactor3D.Viewport.prototype.scene = function() {
    return this._scene;
};

Reactor3D.Viewport.prototype.camera = function() {
    return this._camera;
};

/**
 * What is actually on the 3D canvas, and where that canvas actually is.
 *
 * An empty 3D view has survived every check that can be made from the outside —
 * meshes, textures, camera, canvas size, visibility — so this reads the drawing
 * buffer itself. Non-black pixels mean three is drawing and the problem is
 * compositing; all black means it is not, whatever the scene says.
 */
Reactor3D.Viewport.prototype.probe = function() {
    const gl = this._renderer && this._renderer.getContext && this._renderer.getContext();
    const report = { renders: this._renderCount || 0 };
    if (!gl) return Object.assign(report, { gl: "none" });
    report.contextLost = gl.isContextLost ? gl.isContextLost() : "unknown";

    // A grid of samples rather than one: a single point can legitimately be
    // sky. `readPixels` reads the buffer as it stands after the last draw.
    if (!this._canvas) return Object.assign(report, { shared: true, generation: this._generation });
    const width = this._canvas.width, height = this._canvas.height;
    const pixel = new Uint8Array(4);
    let lit = 0, sampled = 0;
    const brightest = [0, 0, 0];
    try {
        for (let ry = 1; ry <= 3; ry++) {
            for (let rx = 1; rx <= 3; rx++) {
                gl.readPixels(Math.floor(width * rx / 4), Math.floor(height * ry / 4),
                    1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                sampled++;
                if (pixel[0] + pixel[1] + pixel[2] > 12) lit++;
                for (let c = 0; c < 3; c++) brightest[c] = Math.max(brightest[c], pixel[c]);
            }
        }
    } catch (e) {
        return Object.assign(report, { readPixels: String(e && e.message || e) });
    }
    report.litSamples = `${lit}/${sampled}`;
    report.brightest = brightest.join(",");

    // Where the two canvases actually sit, as the browser sees them.
    const describe = canvas => {
        if (!canvas || !canvas.getBoundingClientRect) return "none";
        const rect = canvas.getBoundingClientRect();
        const style = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : {};
        return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
            + ` z=${style.zIndex} vis=${style.visibility} op=${style.opacity} disp=${style.display}`;
    };
    report.threeCanvas = describe(this._canvas);
    report.gameCanvas = describe(typeof Graphics !== "undefined" && Graphics._canvas);
    report.inDocument = !!(this._canvas && this._canvas.parentNode);
    const renderer = typeof Graphics !== "undefined" && Graphics.app && Graphics.app.renderer;
    report.pixiBackgroundAlpha = renderer && renderer.background
        ? renderer.background.alpha : "n/a";
    return report;
};

Reactor3D.Viewport.prototype.render = function(slot) {
    if (!this._scene || !this._camera) return;
    this._renderCount = (this._renderCount || 0) + 1;
    if (!this._shared) {
        Reactor3D.renderScene(this._renderer, this._scene, this._camera);
        return;
    }
    this._trackFrame();
    this.renderInto(this._target(slot || "below"), this._scene, this._camera);
};

/**
 * Draw one pass on its own, over a cleared canvas.
 *
 * The two passes sandwich the character sprites: the ground goes down, PIXI
 * draws the characters, and then the star-flagged tiles go over them. Both come
 * off the same canvas, one after the other, so this costs a second draw and a
 * second upload rather than a second WebGL context.
 */
Reactor3D.Viewport.prototype.renderPass = function(mapScene, which, slot) {
    if (!mapScene || !mapScene.setPass) return this.render(slot);
    // World matrices once a frame, not once a pass. three recomposes every
    // object's matrix inside `render`, and a map with two or three passes
    // paid for the whole graph — every bone of every skinned model
    // included — two or three times over. Everything that moves has been
    // synced by the time the first pass is asked for.
    const scene = mapScene.scene ? mapScene.scene() : null;
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : -1;
    if (scene) {
        if (scene.matrixWorldAutoUpdate !== false) scene.matrixWorldAutoUpdate = false;
        if (this._matrixFrame !== frame) {
            this._matrixFrame = frame;
            scene.updateMatrixWorld();
            // The shadow maps, while every group is still visible.
            if (mapScene.renderShadows) mapScene.renderShadows(this._renderer, null);
        }
    }
    mapScene.setPass(which);
    // Anchored effects belong with the world's depth, not over the overlay.
    if (Reactor3D.EffekseerScene) Reactor3D.EffekseerScene.setPass(which);
    this.render(slot);
    if (Reactor3D.EffekseerScene) Reactor3D.EffekseerScene.setPass("all");
    mapScene.setPass("all");
};

Reactor3D.Viewport.prototype.setVisible = function(visible) {
    if (!this._canvas) return;
    this._canvas.style.display = visible ? "block" : "none";
};

/**
 * Stop showing the 3D canvas on its own and let PIXI draw it instead.
 *
 * Stacked canvases put the 3D ground outside the PIXI scene, and everything a
 * game draws *over* the map assumes the map is in that scene: a fog or a
 * lighting overlay set to MULTIPLY has nothing to multiply against, so it
 * composites as a flat wash — which is why fog reads heavier in 3D than in 2D —
 * and the screen tone, which is a filter on the spriteset, never reaches the
 * ground at all.
 *
 * Rendering is unaffected by the canvas being hidden: a WebGL context draws
 * into its buffer whether or not the element is laid out.
 */
Reactor3D.Viewport.prototype.detachFromPage = function() {
    if (this._canvas) this._canvas.style.display = "none";
    this._detached = true;
};

Reactor3D.Viewport.prototype.isDetached = function() {
    return !!this._detached;
};

Reactor3D.Viewport.prototype.destroy = function() {
    Reactor3D.EffekseerScene?.stopScene(this._scene);
    Reactor3D.GpuEffects?.release(Reactor3D.GpuEffects._runtime.get(this._renderer));
    if (this._shared) this._disposeTargets();
    if (this._renderer && Reactor3D.Shadows._renderer === this._renderer) Reactor3D.Shadows.dispose();
    if (this._renderer) {
        this._renderer.dispose();
        this._renderer = null;
    }
    this._pixi = null;
    this._shared = false;
    if (this._canvas && this._canvas.parentNode) {
        this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._scene = null;
    this._camera = null;
};

//-----------------------------------------------------------------------------
// Reactor3D.Geometry
//
// Tile addressing and mesh building. Deliberately free of THREE and the DOM:
// it takes map data and returns typed arrays, which is what lets the part where
// correctness actually matters — which sheet a tile comes from, and which
// pixels of it — be verified in the ordinary test suite rather than by looking
// at a viewport. A test pins that independence, so reaching for either from in
// here fails rather than eroding the boundary quietly.
//
// The addressing must agree exactly with the 2D renderer in reactor_core.js. If
// it drifts, a tile shows one image in 2D and another in 3D, which is miserable
// to chase visually. `sheetRectFor` is the single place that resolves it.
//
// World space: one tile is one unit on X (east) and Z (south); one elevation
// step is one unit on Y (up), so a grid coordinate maps to a world position
// without arithmetic.

Reactor3D.Geometry = {};

Reactor3D.Geometry.bands = function() {
    const T = typeof Tilemap !== "undefined" ? Tilemap : null;
    return {
        A5: T ? T.TILE_ID_A5 : 1536,
        A1: T ? T.TILE_ID_A1 : 2048,
        A2: T ? T.TILE_ID_A2 : 2816,
        A3: T ? T.TILE_ID_A3 : 4352,
        A4: T ? T.TILE_ID_A4 : 5888,
        MAX: T ? T.TILE_ID_MAX : 8192
    };
};

/**
 * Where a tile's pixels live: which sheet, and the rectangle within it.
 *
 * Returns null for an empty or out-of-range id. Autotiles resolve to their
 * whole-tile source rect here; `autotileQuads` splits them into the four
 * quadrants the shape table actually selects.
 */
Reactor3D.Geometry.sheetRectFor = function(tileId, tileSize) {
    const size = tileSize || 48;
    const band = this.bands();
    if (!Number.isFinite(tileId) || tileId <= 0 || tileId >= band.MAX) return null;

    // A5 and B-G are plain grids. This is the same expression the 2D renderer
    // uses (Tilemap._addNormalTile), including the two-half split that puts
    // ids 128-255 of a sheet in its right-hand columns.
    if (tileId < band.A5) {
        const setNumber = 5 + Math.floor(tileId / 256);
        const local = tileId % 256;
        return {
            setNumber,
            sx: ((Math.floor(local / 128) % 2) * 8 + (local % 8)) * size,
            sy: (Math.floor((local % 256) / 8) % 16) * size,
            width: size,
            height: size
        };
    }
    if (tileId < band.A1) {
        // A5: a plain 8-wide grid, unlike every other A sheet.
        const local = tileId - band.A5;
        return {
            setNumber: 4,
            sx: (local % 8) * size,
            sy: Math.floor(local / 8) * size,
            width: size,
            height: size
        };
    }

    const kind = Math.floor((tileId - band.A1) / 48);
    const tx = kind % 8;
    const ty = Math.floor(kind / 8);
    if (tileId < band.A2) return { setNumber: 0, sx: tx * size, sy: ty * size, width: size, height: size, autotile: true, kind };
    if (tileId < band.A3) return { setNumber: 1, sx: tx * size, sy: (ty - 2) * size, width: size, height: size, autotile: true, kind };
    if (tileId < band.A4) return { setNumber: 2, sx: tx * size, sy: (ty - 6) * size, width: size, height: size, autotile: true, kind };
    return { setNumber: 3, sx: tx * size, sy: (ty - 10) * size, width: size, height: size, autotile: true, kind };
};

/**
 * The topmost drawable tile in a cell.
 *
 * The 3D ground takes one texture per cell, so the upper planes win the way
 * they do on screen in 2D — layer 3 over 2 over 1 over 0.
 */
/**
 * The shape tables the 2D renderer uses to cut an autotile into quadrants.
 *
 * Read from `Tilemap` rather than copied, so the two cannot drift; tests inject
 * them instead, which is what keeps this section free of the corescript.
 * Returns null when they are unavailable, and the caller then falls back to the
 * whole-tile rect rather than drawing nothing.
 */
/**
 * MZ's autotile shape tables, copied from the corescript.
 *
 * The geometry builder reads these from the global `Tilemap` when a game is
 * running, but nothing else that draws a map has one: the editor viewport and
 * the offline preview renderer both load this file on its own. Without a table
 * every autotile silently fell back to a whole-tile blit of its block's corner,
 * so a seamless field of grass rendered as a grid of bordered squares. A test
 * pins this copy against `reactor_core.js`.
 */
Reactor3D.Geometry.FLOOR_AUTOTILE_TABLE = [
    [[2,4],[1,4],[2,3],[1,3]], [[2,0],[1,4],[2,3],[1,3]], [[2,4],[3,0],[2,3],[1,3]], [[2,0],[3,0],[2,3],[1,3]],
    [[2,4],[1,4],[2,3],[3,1]], [[2,0],[1,4],[2,3],[3,1]], [[2,4],[3,0],[2,3],[3,1]], [[2,0],[3,0],[2,3],[3,1]],
    [[2,4],[1,4],[2,1],[1,3]], [[2,0],[1,4],[2,1],[1,3]], [[2,4],[3,0],[2,1],[1,3]], [[2,0],[3,0],[2,1],[1,3]],
    [[2,4],[1,4],[2,1],[3,1]], [[2,0],[1,4],[2,1],[3,1]], [[2,4],[3,0],[2,1],[3,1]], [[2,0],[3,0],[2,1],[3,1]],
    [[0,4],[1,4],[0,3],[1,3]], [[0,4],[3,0],[0,3],[1,3]], [[0,4],[1,4],[0,3],[3,1]], [[0,4],[3,0],[0,3],[3,1]],
    [[2,2],[1,2],[2,3],[1,3]], [[2,2],[1,2],[2,3],[3,1]], [[2,2],[1,2],[2,1],[1,3]], [[2,2],[1,2],[2,1],[3,1]],
    [[2,4],[3,4],[2,3],[3,3]], [[2,4],[3,4],[2,1],[3,3]], [[2,0],[3,4],[2,3],[3,3]], [[2,0],[3,4],[2,1],[3,3]],
    [[2,4],[1,4],[2,5],[1,5]], [[2,0],[1,4],[2,5],[1,5]], [[2,4],[3,0],[2,5],[1,5]], [[2,0],[3,0],[2,5],[1,5]],
    [[0,4],[3,4],[0,3],[3,3]], [[2,2],[1,2],[2,5],[1,5]], [[0,2],[1,2],[0,3],[1,3]], [[0,2],[1,2],[0,3],[3,1]],
    [[2,2],[3,2],[2,3],[3,3]], [[2,2],[3,2],[2,1],[3,3]], [[2,4],[3,4],[2,5],[3,5]], [[2,0],[3,4],[2,5],[3,5]],
    [[0,4],[1,4],[0,5],[1,5]], [[0,4],[3,0],[0,5],[1,5]], [[0,2],[3,2],[0,3],[3,3]], [[0,2],[1,2],[0,5],[1,5]],
    [[0,4],[3,4],[0,5],[3,5]], [[2,2],[3,2],[2,5],[3,5]], [[0,2],[3,2],[0,5],[3,5]], [[0,0],[1,0],[0,1],[1,1]]
];

Reactor3D.Geometry.WALL_AUTOTILE_TABLE = [
    [[2,2],[1,2],[2,1],[1,1]], [[0,2],[1,2],[0,1],[1,1]], [[2,0],[1,0],[2,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]],
    [[2,2],[3,2],[2,1],[3,1]], [[0,2],[3,2],[0,1],[3,1]], [[2,0],[3,0],[2,1],[3,1]], [[0,0],[3,0],[0,1],[3,1]],
    [[2,2],[1,2],[2,3],[1,3]], [[0,2],[1,2],[0,3],[1,3]], [[2,0],[1,0],[2,3],[1,3]], [[0,0],[1,0],[0,3],[1,3]],
    [[2,2],[3,2],[2,3],[3,3]], [[0,2],[3,2],[0,3],[3,3]], [[2,0],[3,0],[2,3],[3,3]], [[0,0],[3,0],[0,3],[3,3]]
];

Reactor3D.Geometry.WATERFALL_AUTOTILE_TABLE = [
    [[2,0],[1,0],[2,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]],
    [[2,0],[3,0],[2,1],[3,1]], [[0,0],[3,0],[0,1],[3,1]]
];

/*
 * A wall autotile's shape is an exposed-edge mask.
 *
 * `WALL_AUTOTILE_TABLE` has sixteen entries because a wall shape is decided by
 * four neighbours, one bit each — set when the neighbour is *absent*, so the
 * edge shows. Every wall tile on every map already carries this, which is what
 * makes a wall's geometry derivable rather than something to author.
 *
 * The names are the map directions the editor computes them from
 * (`calculateWallAutotileShape`); on a vertical face in 3D they read as the
 * four edges of that face, west/east being its left and right *as seen from
 * outside* and north/south its top and bottom.
 */
Reactor3D.Geometry.WALL_CAP_WEST = 1;
Reactor3D.Geometry.WALL_CAP_NORTH = 2;
Reactor3D.Geometry.WALL_CAP_EAST = 4;
Reactor3D.Geometry.WALL_CAP_SOUTH = 8;

/**
 * Whether a tile id is one of the sixteen-shape wall autotiles.
 *
 * A3 is walls throughout. A4 alternates roof rows and wall rows, eight kinds to
 * a row, odd rows being walls. Mirrors `MapEditor.isWallAutotile`; a test pins
 * the two together.
 */
Reactor3D.Geometry.isWallAutotile = function(tileId) {
    const band = this.bands();
    if (!Number.isFinite(tileId)) return false;
    if (tileId >= band.A3 && tileId < band.A4) return true;
    if (tileId >= band.A4 && tileId < band.MAX) {
        const kind = Math.floor((tileId - band.A4) / 48);
        return Math.floor(kind / 8) % 2 === 1;
    }
    return false;
};

/** The base id of a tile's autotile kind — its shape 0. */
Reactor3D.Geometry.autotileBase = function(tileId) {
    const band = this.bands();
    if (tileId < band.A1 || tileId >= band.MAX) return tileId;
    return band.A1 + Math.floor((tileId - band.A1) / 48) * 48;
};

/**
 * The shape a wall face should use, from which of its own edges are exposed.
 *
 * The shape stored in the map answers a two-dimensional question — which cells
 * beside this one hold the same wall — and a face in three dimensions is asking
 * a different one: where does *this side of the mass* end. Reusing the stored
 * shape put a wall's left-hand end cap on its north face as well, because in
 * plan those are the same edge.
 */
Reactor3D.Geometry.wallFaceShape = function(edges) {
    return (edges.left ? this.WALL_CAP_WEST : 0)
        + (edges.top ? this.WALL_CAP_NORTH : 0)
        + (edges.right ? this.WALL_CAP_EAST : 0)
        + (edges.bottom ? this.WALL_CAP_SOUTH : 0);
};

/**
 * The roof a wall kind is drawn with, where the sheet layout guarantees one.
 *
 * A4 alternates roof rows and wall rows, eight kinds to a row, so the roof for
 * a wall is the kind directly above it — one row, eight kinds, back. That
 * pairing is a property of the format rather than of any particular tileset,
 * so it needs no authoring. A3 is walls throughout and has no roof to pair
 * with; those have to be named in the classification file.
 *
 * Returns 0 when there is nothing derivable.
 */
Reactor3D.Geometry.roofForWall = function(tileId) {
    const band = this.bands();
    if (!Number.isFinite(tileId) || tileId < band.A4 || tileId >= band.MAX) return 0;
    const kind = Math.floor((tileId - band.A4) / 48);
    if (Math.floor(kind / 8) % 2 !== 1) return 0;
    return band.A4 + (kind - 8) * 48;
};

/*
 * A panel: something with a front.
 *
 * A gate, a door, a signpost or a shopfront is drawn as a front elevation and
 * belongs to a direction. Turned into a camera-facing cut-out it swings to
 * follow the viewer, so a gate you were walking through turns to face you —
 * correct for a bush, absurd for anything built.
 *
 * A fixed plane was the obvious answer and was tried before: it vanishes
 * edge-on, which is why it was abandoned for billboards. It vanishes because it
 * has no thickness. With one, edge-on reads as a gate seen from the side, which
 * is what it should look like.
 */
Reactor3D.Geometry.PANEL_THICKNESS = 0.12;

/** How wide a strip of the art the thin edges are cut from, in pixels. */
Reactor3D.Geometry.PANEL_EDGE_PIXELS = 3;

/**
 * How far inside its own rectangle a quad samples, in texels.
 *
 * Tiles live shoulder to shoulder on a shared sheet, so a quad's edge is also
 * its neighbour's. Sampled exactly on that boundary the rasteriser is entitled
 * to either side of it, and at the far edge of a tile it takes the wrong one:
 * every tile picks up a thread of whatever is next to it on the sheet, and a
 * 3D map is ruled with a fine grid of lines that follow the tile boundaries.
 *
 * The 2D tilemap never shows this because it blits whole rectangles rather than
 * sampling a texture across a projected quad — which is why the same map is
 * clean in 2D and ruled in 3D, and why this cannot be fixed in the art.
 *
 * Half a texel in from every side is the standard correction and is what mz3d
 * exposes as its `edgefix` parameter, at the same default. It costs half a
 * texel of the tile's outermost row, which at nearest filtering is invisible:
 * the sample still lands inside the same texel it always did.
 */
Reactor3D.Geometry.UV_INSET_TEXELS = 0.5;

/**
 * A rectangle of a sheet as texture coordinates, inset against bleed.
 *
 * Image space counts down from the top and texture space counts up, so V is
 * flipped here and callers never deal with it.
 */
/**
 * Stop a quad sampling outside its own tile, at any distance.
 *
 * The half-texel inset in `uvRect` fixes the boundary case: it moves the
 * sample off the fence between two tiles. It cannot fix the *far* case. Zoomed
 * out, one screen pixel covers many texels, and the GPU picks one from
 * somewhere in that footprint — which at the edge of a tile is somewhere in the
 * next tile along. The inset would have to grow with the zoom, and the zoom is
 * not a constant.
 *
 * So the rule is stated where it can be enforced exactly: every vertex carries
 * the rectangle of the sheet its quad is entitled to, and the fragment shader
 * clamps to it before sampling. View-independent, and correct at every zoom by
 * construction rather than by choosing a big enough number.
 *
 * Mipmaps are not the answer here and would make it worse: a mip level of an
 * unpadded atlas is built by averaging across tile boundaries, so the bleeding
 * is baked into the texture rather than merely sampled from it.
 *
 * Composed rather than assigned, because the billboard material already has an
 * `onBeforeCompile` building its quad in the vertex shader.
 */
Reactor3D.clampToTile = function(material, cacheKey) {
    if (!material || material.__reactorUvClamped) return material;
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
        if (typeof earlier === "function") earlier.call(this, shader, renderer);
        // Injected at `void main`, not at a chunk. The billboard material's own
        // patch *replaces* `#include <begin_vertex>` with the code that builds
        // its quad, so a second patch anchored there finds nothing to replace
        // and silently does nothing — leaving `vUvBounds` unwritten, which
        // clamps every sample to a zero-sized rectangle. Every cut-out on the
        // map became one transparent texel, and no shader failed to compile.
        shader.vertexShader = "attribute vec4 uvBounds;\nvarying vec4 vUvBounds;\n"
            + shader.vertexShader.replace(
                "void main() {",
                "void main() {\n\tvUvBounds = uvBounds;"
            );
        // The chunk as three.js writes it, with the sample clamped. Replaced
        // whole rather than patched, because `vMapUv` is a varying and a
        // fragment shader may not assign to one.
        shader.fragmentShader = "varying vec4 vUvBounds;\n"
            + shader.fragmentShader.replace(
                "#include <map_fragment>",
                [
                    "#ifdef USE_MAP",
                    "	vec4 sampledDiffuseColor = texture2D( map, clamp( vMapUv, vUvBounds.xy, vUvBounds.zw ) );",
                    "	#ifdef DECODE_VIDEO_TEXTURE",
                    "		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );",
                    "	#endif",
                    "	diffuseColor *= sampledDiffuseColor;",
                    "#endif"
                ].join("\n")
            );
    };
    material.__reactorUvClamped = true;
    // three.js keys its program cache on the material's own properties and
    // cannot see injected code, so without this every material compiles its own
    // program — and with a shared key, two materials that inject *different*
    // code would share one.
    material.customProgramCacheKey = () => cacheKey;
    return material;
};

Reactor3D.Geometry.uvRect = function(rect, size) {
    // Never past the middle: a panel's edge strip is three pixels wide and a
    // sliver narrower than two texels would otherwise invert.
    const insetX = Math.min(this.UV_INSET_TEXELS, Math.max(0, rect.width / 2 - 0.01));
    const insetY = Math.min(this.UV_INSET_TEXELS, Math.max(0, rect.height / 2 - 0.01));
    return {
        u0: (rect.sx + insetX) / size.width,
        u1: (rect.sx + rect.width - insetX) / size.width,
        v0: 1 - (rect.sy + rect.height - insetY) / size.height,
        v1: 1 - (rect.sy + insetY) / size.height
    };
};

/**
 * How deep a wall is, in tiles.
 *
 * A wall used to be a single plane on the southern face of its run, which is
 * right from the front and nothing at all from the side: walk round a shop and
 * its front thinned to a line and vanished, because that is what a plane seen
 * edge-on does. 2D never draws a building's sides, so there is no art for them
 * — but the wall's own art is a better answer than a hole, and it is the one an
 * author would reach for.
 *
 * A whole tile rather than a sliver. The rows north of the footing are already
 * spoken for as the wall's *height*, so nothing is drawn in the depth this
 * occupies and it can be as deep as it needs to read as solid; a panel's 0.12
 * is thin because a gate genuinely is.
 */
Reactor3D.Geometry.WALL_THICKNESS = 1;

/**
 * Which way a panel faces, from what is solid around it.
 *
 * Nothing is authored here. A gate set into a wall faces the way the wall
 * faces, and a wall is solid ground on both sides of the opening — so a gap in
 * an east-west run faces south, and a gap in a north-south run faces east. A
 * panel with solid on one side only turns its back to it. With nothing to go
 * on it faces south, which is the direction RPG Maker art is drawn from.
 *
 * `solidAt(dx, dy)` says whether a neighbour is built up.
 */
Reactor3D.Geometry.panelFacing = function(solidAt) {
    const north = !!solidAt(0, -1), south = !!solidAt(0, 1);
    const east = !!solidAt(1, 0), west = !!solidAt(-1, 0);
    if (east && west && !north && !south) return "south";
    if (north && south && !east && !west) return "east";
    if (east && !west) return "west";
    if (west && !east) return "east";
    if (north && !south) return "south";
    if (south && !north) return "north";
    return "south";
};

/** The outward normal of a facing, in map axes. */
Reactor3D.Geometry.FACING_NORMALS = {
    south: [0, 1], north: [0, -1], east: [1, 0], west: [-1, 0]
};

/**
 * The 48-shape a floor autotile takes, from which of its eight neighbours
 * carry the same thing.
 *
 * `same(dx, dy)` answers for one neighbour. This mirrors
 * `MapEditor.calculateAutotileShape` exactly — a test drives both over every
 * neighbourhood and compares — because a roof laid on top of a mass has to
 * choose its corners the way the same roof painted flat would, or the two
 * disagree wherever a building meets its own roof.
 */
Reactor3D.Geometry.floorShapeFrom = function(same) {
    const at = (dx, dy) => !!same(dx, dy);
    let pattern = 0;
    if (at(0, -1)) pattern |= 1;
    if (at(1, 0)) pattern |= 2;
    if (at(0, 1)) pattern |= 4;
    if (at(-1, 0)) pattern |= 8;

    // Surrounded on all four sides: the shape is which diagonals are missing.
    if (pattern === 0b1111) {
        return (at(-1, -1) ? 0 : 1) + (at(1, -1) ? 0 : 2)
            + (at(1, 1) ? 0 : 4) + (at(-1, 1) ? 0 : 8);
    }
    // Three sides: an edge, refined by the diagonals along it.
    if (pattern === 0b1110) return 20 + (at(1, 1) ? 0 : 1) + (at(-1, 1) ? 0 : 2);
    if (pattern === 0b0111) return 16 + (at(1, -1) ? 0 : 1) + (at(1, 1) ? 0 : 2);
    if (pattern === 0b1101) return 24 + (at(-1, 1) ? 0 : 1) + (at(-1, -1) ? 0 : 2);
    if (pattern === 0b1011) return 28 + (at(-1, -1) ? 0 : 1) + (at(1, -1) ? 0 : 2);
    // Two adjacent sides: a corner, inner or outer by its diagonal.
    if (pattern === 0b0110) return at(1, 1) ? 34 : 35;
    if (pattern === 0b1100) return at(-1, 1) ? 36 : 37;
    if (pattern === 0b0011) return at(1, -1) ? 40 : 41;
    if (pattern === 0b1001) return at(-1, -1) ? 38 : 39;

    const strips = {
        0: 46,                                  // isolated
        0b1010: 33, 0b0101: 32,                 // through strips
        0b0001: 44, 0b0010: 43, 0b0100: 42, 0b1000: 45   // strip ends
    };
    return strips[pattern] === undefined ? 46 : strips[pattern];
};

/**
 * The shape tables to build with.
 *
 * A running game's `Tilemap` wins, so a plugin that replaces the tables still
 * governs what the 3D view draws; otherwise the copy above is used. Returning
 * null here is what produced the corner-blit bug, so it no longer can.
 */
Reactor3D.Geometry.autotileTables = function(options) {
    if (options && options.tables) return options.tables;
    const T = typeof Tilemap !== "undefined" ? Tilemap : null;
    if (T && T.FLOOR_AUTOTILE_TABLE) {
        return {
            floor: T.FLOOR_AUTOTILE_TABLE,
            wall: T.WALL_AUTOTILE_TABLE,
            waterfall: T.WATERFALL_AUTOTILE_TABLE
        };
    }
    return {
        floor: this.FLOOR_AUTOTILE_TABLE,
        wall: this.WALL_AUTOTILE_TABLE,
        waterfall: this.WATERFALL_AUTOTILE_TABLE
    };
};

/**
 * Cut an autotile into the four quadrants its shape selects.
 *
 * An autotile is not one picture: its 48 shapes each pick four 24x24 corners out
 * of the sheet, which is how a single kind renders every combination of
 * neighbours. Drawing the whole-tile rect instead gives the unmistakable look of
 * a map where every grass tile is the same wrong patch, so the ground takes four
 * half-size quads per cell here rather than one.
 *
 * `qx`/`qy` place each quadrant within the cell: 0 is west/north, 1 is
 * east/south, matching the 2D renderer's `i % 2` and `floor(i / 2)`.
 *
 * A1 water sits on animation frame 0. Scrolling water and waterfalls need the
 * frame swapped per tick, which is a later concern than getting the shape right.
 */
Reactor3D.Geometry.autotileQuads = function(tileId, tileSize, tables) {
    if (!tables) return null;
    const band = this.bands();
    const size = tileSize || 48;
    const kind = Math.floor((tileId - band.A1) / 48);
    const shape = (tileId - band.A1) % 48;
    const tx = kind % 8;
    const ty = Math.floor(kind / 8);

    let setNumber = 0;
    let bx = 0;
    let by = 0;
    let table = tables.floor;
    // Pixels this tile's UVs move per animation step; 0 means it never moves.
    let animU = 0;
    let animV = 0;

    if (tileId < band.A2) {
        // A1. The first four kinds are the fixed water and rock cells; the rest
        // pair a still surface with a waterfall on odd kinds.
        setNumber = 0;
        // A1 is the animated sheet. The frames sit side by side in the same
        // block — the still surface shifts two tiles east per frame, a
        // waterfall one tile south — so a quad can be animated by sliding its
        // UVs rather than rebuilt. `animU`/`animV` record that stride in
        // pixels; everything else stays zero and never moves.
        if (kind === 0) { bx = 0; by = 0; animU = size * 2; }
        else if (kind === 1) { bx = 0; by = 3; animU = size * 2; }
        else if (kind === 2) { bx = 6; by = 0; }
        else if (kind === 3) { bx = 6; by = 3; }
        else {
            bx = Math.floor(tx / 4) * 8;
            by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
            if (kind % 2 !== 0) {
                bx += 6;
                table = tables.waterfall || tables.floor;
                animV = size;
            } else {
                animU = size * 2;
            }
        }
    } else if (tileId < band.A3) {
        setNumber = 1;
        bx = tx * 2;
        by = (ty - 2) * 3;
    } else if (tileId < band.A4) {
        setNumber = 2;
        bx = tx * 2;
        by = (ty - 6) * 2;
        table = tables.wall;
    } else {
        setNumber = 3;
        bx = tx * 2;
        by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
        if (ty % 2 === 1) table = tables.wall;
    }

    // The waterfall table only defines four shapes, so a kind whose shape falls
    // outside its table has no quadrants; the caller falls back rather than
    // indexing past the end.
    const entry = table && table[shape];
    if (!entry) return null;

    const half = size / 2;
    return entry.map((pair, i) => ({
        setNumber,
        sx: (bx * 2 + pair[0]) * half,
        sy: (by * 2 + pair[1]) * half,
        width: half,
        height: half,
        qx: i % 2,
        qy: Math.floor(i / 2),
        animU,
        animV
    }));
};

/**
 * How far each stacked ground layer is lifted above the one below.
 *
 * Enough for the depth buffer to keep them apart, far too little to see: a
 * tile is one unit wide, so this is a thousandth of a tile.
 */
Reactor3D.Geometry.LAYER_LIFT = 0.001;


Reactor3D.Geometry.topTileAt = function(mapData, x, y, isUpright) {
    if (!mapData || !Array.isArray(mapData.data)) return 0;
    const { width, height } = mapData;
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const plane = width * height;
    for (let z = 3; z >= 0; z--) {
        const tileId = mapData.data[z * plane + y * width + x] || 0;
        if (tileId <= 0) continue;
        // An upright tile is an object standing on the ground, not the ground
        // itself, so it cannot supply the surface texture.
        if (isUpright && isUpright(tileId)) continue;
        return tileId;
    }
    return 0;
};

/**
 * Every ground tile in a cell, bottom layer first.
 *
 * A cell holds up to four tiles and the 2D renderer composites all of them —
 * a floor, a decal over it, a puddle over that. Taking only the topmost one
 * showed the decal alone with nothing underneath, which is not the map the
 * author drew.
 */
/**
 * The floor a facade is standing on.
 *
 * Walks south from the run — the direction the building faces, so the first
 * floor found is the street in front of it — then north if the whole southern
 * column is built up, then along the run's own row. A dense city block can be
 * buildings all the way to the map edge in one direction, and any of those
 * misses left the footprint as a hole through to the sky.
 */
Reactor3D.Geometry.nearestGround = function(mapData, run, isUpright) {
    const { width, height } = mapData;
    // The bottom of the stack, not the top: the lowest layer is the floor,
    // while the top is often a decoration drawn over it. Taking the top filled
    // a building's footprint with a see-through overlay, which alpha-tests away
    // to nothing and leaves the hole it was meant to close.
    const surfaceOf = (x, y) => {
        const stack = this.groundStackAt(mapData, x, y, isUpright);
        return stack.length ? stack[0] : 0;
    };

    for (let y = run.southY + 1; y < height; y++) {
        const found = surfaceOf(run.x, y);
        if (found) return found;
    }
    for (let y = run.northY - 1; y >= 0; y--) {
        const found = surfaceOf(run.x, y);
        if (found) return found;
    }
    for (let step = 1; step < width; step++) {
        const west = run.x - step >= 0 ? surfaceOf(run.x - step, run.southY) : 0;
        if (west) return west;
        const east = run.x + step < width ? surfaceOf(run.x + step, run.southY) : 0;
        if (east) return east;
    }
    return 0;
};

Reactor3D.Geometry.groundLayersAt = function(mapData, x, y, isUpright) {
    if (!mapData || !Array.isArray(mapData.data)) return [];
    const { width, height } = mapData;
    if (x < 0 || y < 0 || x >= width || y >= height) return [];
    const plane = width * height;
    const stack = [];
    for (let z = 0; z <= 3; z++) {
        const tileId = mapData.data[z * plane + y * width + x] || 0;
        if (tileId <= 0) continue;
        if (isUpright && isUpright(tileId)) continue;
        stack.push({ tileId, layer: z });
    }
    return stack;
};

Reactor3D.Geometry.groundStackAt = function(mapData, x, y, isUpright) {
    return this.groundLayersAt(mapData, x, y, isUpright).map(entry => entry.tileId);
};

/** The upright tile in a cell, if any — the topmost one wins. */
/**
 * Every standing tile in one cell, lowest layer first.
 *
 * A cell holds four tile planes and more than one of them can be standing art:
 * a plate set down on a column occupies the same square as the column, exactly
 * as it does in 2D, where both are drawn one over the other. Taking only the
 * topmost — which is what asking for *the* upright tile does — silently threw
 * the other away, so a column with anything resting on it disappeared from the
 * 3D view entirely while looking perfectly ordinary in 2D.
 *
 * Lowest first, so drawing them in order layers them the way the 2D tilemap
 * layers its planes.
 */
Reactor3D.Geometry.uprightTilesAt = function(mapData, x, y, isUpright) {
    if (!isUpright || !mapData || !Array.isArray(mapData.data)) return [];
    const { width, height } = mapData;
    if (x < 0 || y < 0 || x >= width || y >= height) return [];
    const plane = width * height;
    const found = [];
    for (let z = 0; z <= 3; z++) {
        const tileId = mapData.data[z * plane + y * width + x] || 0;
        if (tileId > 0 && isUpright(tileId)) found.push(tileId);
    }
    return found;
};

/** The topmost standing tile in a cell, for the questions that want just one. */
Reactor3D.Geometry.uprightTileAt = function(mapData, x, y, isUpright) {
    if (!isUpright || !mapData || !Array.isArray(mapData.data)) return 0;
    const { width, height } = mapData;
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const plane = width * height;
    for (let z = 3; z >= 0; z--) {
        const tileId = mapData.data[z * plane + y * width + x] || 0;
        if (tileId > 0 && isUpright(tileId)) return tileId;
    }
    return 0;
};

/**
 * Collapse columns of upright tiles into standing facades.
 *
 * Standing each upright tile up on its own cell folds a building in half: its
 * base is impassable wall and its top is a walk-behind roof, so per-tile
 * treatment leaves the lower half lying on the ground and the upper half
 * hanging in the air.
 *
 * A tileset draws a building as a run of tiles going *north* up the screen, and
 * that run is the building's elevation — north in 2D is up in 3D. So a
 * contiguous north-south run becomes one facade standing at the run's southern
 * face, with the southernmost tile at the bottom and each tile further north
 * one unit higher. A three-tile shopfront becomes a three-unit facade showing
 * the same three tiles in the same order.
 *
 * Returns one entry per run: the column, the cells it consumed, and the tiles
 * bottom-up.
 */
/**
 * Standing cells gathered into whole objects rather than single columns.
 *
 * A column at a time was wrong once the cut-outs began to turn: each column
 * pivoted about its own centre, so a five-wide structure came apart into five
 * cards fanning towards the camera. An object turns about one axis, so its
 * columns keep their places relative to each other and it stays the picture it
 * was drawn as.
 *
 * Cells join an object only when they are neighbouring pieces *of the same
 * picture*: adjacent on the map, and adjacent the same way on the sheet. Plain
 * touching is not enough — on a world map the props are dense enough that a
 * chain of them ran clean across the region, and forty-four by twenty-seven
 * cells of unrelated art collapsed onto one anchor as a heap.
 *
 * Returns each object's cells with their tile and their position on the map.
 */
/** Where a B-E tile sits on its sheet, in whole tiles. */
Reactor3D.Geometry.sheetCellOf = function(tileId) {
    if (tileId >= 1536 && tileId < 2048) {
        const local = tileId - 1536;
        return { setNumber: 4, col: local % 8, row: Math.floor(local / 8) };
    }
    const local = tileId % 256;
    return {
        setNumber: 5 + Math.floor(tileId / 256),
        col: (Math.floor(local / 128) % 2) * 8 + (local % 8),
        row: Math.floor((local % 256) / 8) % 16
    };
};

/** Inverse of `sheetCellOf` for plain A5/B-G declared-object cells. */
Reactor3D.Geometry.tileIdAtSheetCell = function(setNumber, col, row) {
    if (setNumber === 4) return 1536 + row * 8 + col;
    if (setNumber < 5 || setNumber > 10 || col < 0 || col >= 16 || row < 0 || row >= 16) {
        return 0;
    }
    const local = col < 8 ? row * 8 + col : 128 + row * 8 + col - 8;
    return (setNumber - 5) * 256 + local;
};

/**
 * Whether two neighbouring cells hold neighbouring pieces of one drawing.
 *
 * The map offset and the sheet offset have to agree: a tile one cell east must
 * also be one cell east on the sheet. That is what makes a stamped picture a
 * picture rather than two props that happen to be side by side.
 *
 * Autotiles are excluded. Their id encodes a corner arrangement, not a position
 * in a drawing, so the test means nothing for them — and a wall is not a
 * picture in this sense anyway.
 */
Reactor3D.Geometry.samePicture = function(tileA, tileB, dx, dy) {
    // A1-A4 only: their ids are corner arrangements, not places in a drawing.
    // A5 is a plain grid like B-G and groups the same way.
    if (tileA >= 2048 || tileB >= 2048) return false;
    const a = this.sheetCellOf(tileA);
    const b = this.sheetCellOf(tileB);
    return a.setNumber === b.setNumber && b.col - a.col === dx && b.row - a.row === dy;
};

Reactor3D.Geometry.uprightObjects = function(mapData, isUpright, maxHeight, isAuthored,
    declaredAt, paintedAt, isPaintedGround, claimed) {
    if (!isUpright || !mapData || !Array.isArray(mapData.data)) return [];
    const { width, height } = mapData;
    const cap = maxHeight || Infinity;

    const tileAt = new Map();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // A1-A4 are walls, and a wall faces a way. Those are built as
            // fixed planes elsewhere rather than turned to face the camera,
            // which would swing a building's walls around as you orbit. A5 is
            // a plain sheet and belongs with B-G.
            const tiles = this.uprightTilesAt(mapData, x, y, isUpright)
                .filter(tileId => tileId < 2048);
            if (tiles.length) tileAt.set(y * width + x, tiles);
        }
    }

    const objects = [];
    const seen = new Set();
    const painted = new Set();

    /*
     * What the author painted, before anything is worked out.
     *
     * Every other pass here is a derivation — a declared rectangle of a sheet,
     * or a flood fill over touching cells. Both answer "which cells look like
     * they belong together", and neither can answer "which cells the author
     * says are one building". Three shops in a row built from one wall kind
     * are indistinguishable to a tileset and are one blob to a flood fill.
     *
     * A painted group is stated outright, so it wins, and it takes whatever it
     * covers — autotile walls and picture tiles alike. That last part is the
     * point: a flag hung on a shopfront is a B-sheet tile, and picture tiles
     * can never join a wall's facade, so the flag became its own object with
     * its own footing two rows nearer the camera and slid against the wall it
     * was painted on. Inside one painted object there is one anchor and one
     * plane, so everything on the building moves with the building.
     */
    if (paintedAt) {
        const groups = new Map();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Every standing tile in the cell, autotiles included — this
                // pass is not limited to the sheets objects are declared on.
                for (let layer = 0; layer < 4; layer++) {
                    const tileId = mapData.data[layer * width * height + y * width + x] || 0;
                    if (!tileId || !isUpright(tileId)) continue;
                    const id = paintedAt(x, y, layer);
                    if (!id) continue;
                    // Ground within the object: its footprint, not a course of
                    // its height. Claimed all the same, so no later pass
                    // stands it up again.
                    const ground = isPaintedGround ? isPaintedGround(x, y, layer) : false;
                    if (!groups.has(id)) groups.set(id, { cells: new Map(), ground: new Set() });
                    const group = groups.get(id);
                    const at = y * width + x;
                    if (ground) {
                        group.ground.add(at);
                    } else {
                        if (!group.cells.has(at)) group.cells.set(at, { x, y, tileId, tileIds: [] });
                        group.cells.get(at).tileIds.push(tileId);
                    }
                    seen.add(at);
                    painted.add(at);
                    if (claimed) claimed.add(at);
                    tileAt.delete(at);
                }
            }
        }
        for (const group of groups.values()) {
            const cells = [...group.cells.values()];
            if (!cells.length) continue;
            for (const cell of cells) cell.tileId = cell.tileIds[cell.tileIds.length - 1];
            objects.push({
                cells,
                painted: true,
                minX: Math.min(...cells.map(cell => cell.x)),
                maxX: Math.max(...cells.map(cell => cell.x)),
                minY: Math.min(...cells.map(cell => cell.y)),
                maxY: Math.max(...cells.map(cell => cell.y)),
                // A painted group is its own answer about how tall it may be,
                // so neither the sheet cap nor the same-object rule applies.
                sheetH: 0,
                sheetTile: 0
            });
        }
    }

    // Declared objects first, and they group exactly rather than by spreading.
    //
    // A cell whose tile belongs to a declared rectangle knows its own place in
    // it, so the object's origin on the map follows from the cell's position
    // minus that place. Cells sharing an origin are one instance; two of the
    // same object side by side have different origins and stay apart, which is
    // the whole reason the guess below is not enough.
    if (declaredAt) {
        const instances = new Map();
        /*
         * One cell, possibly several objects — one per standing tile.
         *
         * Asking the cell's topmost tile which object it belongs to reads a
         * plate set down on a column as the whole story: both of the column's
         * cells joined the plate's 1x1 instances instead of each other, so the
         * capital and the shaft became two objects with two anchors, and a
         * cut-out turns about its own anchor — the column came apart and its
         * halves swung independently as the camera moved.
         *
         * Each tile answers for itself, so the column's two cells find the same
         * origin and are one object, and the plates are their own. Making the
         * plates ride the column instead was tried, to put them at one anchor
         * with it, and it is the wrong reading: a tile sharing a standing
         * object's footprint is usually something standing on the *floor*
         * beside it, not something resting on top of it, and hoisting it up a
         * course moved it somewhere the author never put it.
         */
        for (const [index, tiles] of tileAt) {
            const x = index % width;
            const y = (index - x) / width;
            let claimed = false;
            for (const tileId of tiles) {
                const found = declaredAt(tileId);
                if (!found) continue;
                const originX = x - found.dc;
                const originY = y - found.dr;
                const key = `${found.object.tile}:${originX}:${originY}`;
                if (!instances.has(key)) {
                    instances.set(key, { cells: [], object: found.object, originX, originY });
                }
                instances.get(key).cells.push({ x, y, tileId, tileIds: [tileId] });
                claimed = true;
            }
            // Anything left over in a claimed cell would be drawn twice if the
            // guess pass took the cell as well, so a cell any object claimed is
            // done with here.
            if (claimed) seen.add(index);
        }
        for (const instance of instances.values()) {
            const { cells, object, originX, originY } = instance;
            const roles = object.roles || "";
            const standing = [];
            for (let dr = 0; dr < object.h; dr++) {
                for (let dc = 0; dc < object.w; dc++) {
                    if (roles[dr * object.w + dc] !== "F") standing.push({ dc, dr });
                }
            }
            const footprint = standing.length ? standing : cells.map(cell => ({
                dc: cell.x - originX,
                dr: cell.y - originY
            }));
            const lastStandingRow = Math.max(...footprint.map(cell => cell.dr));
            const firstFlatFooting = [];
            for (let dr = lastStandingRow + 1; dr < object.h; dr++) {
                for (let dc = 0; dc < object.w; dc++) {
                    if (roles[dr * object.w + dc] === "F") firstFlatFooting.push(dr);
                }
            }
            objects.push({
                cells,
                minX: Math.max(0, originX + Math.min(...footprint.map(cell => cell.dc))),
                maxX: Math.min(width - 1,
                    originX + Math.max(...footprint.map(cell => cell.dc))),
                minY: Math.max(0, originY + Math.min(...footprint.map(cell => cell.dr))),
                maxY: Math.min(height - 1,
                    originY + Math.max(...footprint.map(cell => cell.dr))),
                declaredMinX: Math.max(0, originX),
                declaredMaxX: Math.min(width - 1, originX + object.w - 1),
                declaredMinY: Math.max(0, originY),
                declaredMaxY: Math.min(height - 1, originY + object.h - 1),
                declaredOriginX: originX,
                declaredOriginY: originY,
                declaredW: object.w,
                declaredH: object.h,
                declaredRoles: roles,
                // How tall this object's picture is on the sheet. A structure
                // built from it cannot stand taller than its own art, which is
                // what stops pieces joining up the length of a street.
                sheetH: object.h,
                // Which tileset object this is a placement of. Two placements
                // of the *same* object side by side are one surface painted in
                // columns; two different objects that merely touch are not.
                sheetTile: object.tile,
                // A flat row directly south of standing art is its floor. The
                // vertical plane hinges on that row's north edge; anchoring it
                // in the preceding cell's centre leaves a half-tile gap that
                // becomes a horizontal seam at oblique camera angles.
                planeZ: firstFlatFooting.length
                    ? Math.max(0, Math.min(height,
                        originY + Math.min(...firstFlatFooting))) : null
            });
        }
    }

    for (const start of tileAt.keys()) {
        if (seen.has(start)) continue;
        const stack = [start];
        seen.add(start);
        const cells = [];
        let minX = width, maxX = -1, minY = height, maxY = -1;
        let authored = false;
        while (stack.length) {
            const index = stack.pop();
            const x = index % width;
            const y = (index - x) / width;
            const tiles = tileAt.get(index) || [];
            // `tileId` stays the topmost, which is what the questions about a
            // cell's identity want; `tileIds` is everything standing there.
            const tileId = tiles[tiles.length - 1] || 0;
            cells.push({ x, y, tileId, tileIds: tiles });
            if (isAuthored && tiles.some(id => isAuthored(id))) authored = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const around = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dx, dy] of around) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const next = ny * width + nx;
                if (!tileAt.has(next) || seen.has(next)) continue;
                const there = tileAt.get(next);
                if (!this.samePicture(tileId, there[there.length - 1], dx, dy)) continue;
                seen.add(next);
                stack.push(next);
            }
        }
        // Taller than a building means a cliff face or a map-edge wall that
        // happens to share the impassable flag. The cap only judges guesses:
        // where an author has classified a tile the height is theirs to choose,
        // and tilesets draw buildings dozens of tiles tall as single props.
        if (authored || maxY - minY + 1 <= cap) {
            objects.push({ cells, minX, maxX, minY, maxY });
        }
    }
    return objects;
};

Reactor3D.Geometry.uprightRuns = function(mapData, isUpright, maxHeight, isAuthored, taken) {
    if (!isUpright || !mapData || !Array.isArray(mapData.data)) return [];
    const { width, height } = mapData;
    const cap = maxHeight || Infinity;

    const stands = new Uint8Array(width * height);
    const tileAt = new Int32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // A cell a painted object claimed is that object's; standing it up
            // again here would draw its art twice, on two planes.
            if (taken && taken.has(y * width + x)) continue;
            const tile = this.uprightTileAt(mapData, x, y, isUpright);
            if (!tile) continue;
            stands[y * width + x] = 1;
            tileAt[y * width + x] = tile;
        }
    }

    /*
     * A connected region of standing tiles is one wall, and shares one base.
     *
     * Each column used to stand at its own southern edge, which tore any wall
     * whose bottom is not level. A gateway is the clearest case: its two posts
     * run three rows lower than the panel between them, so the posts stood on
     * the ground while the panel stood three tiles further back and three
     * tiles lower, and the sign hanging across them lined up with neither. It
     * also drifted, because two surfaces at different depths do not move
     * together as the camera pans.
     *
     * Sharing a base makes a map row mean one height across the whole wall,
     * which is the reading the art was painted for: rows going north are
     * courses going up. Regions that do not touch keep their own bases, so
     * two separate buildings are still two buildings.
     */
    const seen = new Uint8Array(width * height);
    const runs = [];
    const frontier = [];
    for (let start = 0; start < stands.length; start++) {
        if (!stands[start] || seen[start]) continue;

        frontier.length = 0;
        frontier.push(start);
        seen[start] = 1;
        const cells = [];
        let footing = 0;
        while (frontier.length) {
            const at = frontier.pop();
            cells.push(at);
            const x = at % width;
            const y = (at - x) / width;
            if (y > footing) footing = y;
            const reach = (nx, ny) => {
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
                const next = ny * width + nx;
                if (stands[next] && !seen[next]) { seen[next] = 1; frontier.push(next); }
            };
            reach(x - 1, y); reach(x + 1, y); reach(x, y - 1); reach(x, y + 1);
        }

        const columns = new Map();
        // How far the region reaches either side on each of its rows, so a
        // column can ask whether anything is holding it up.
        const span = new Map();
        for (const at of cells) {
            const x = at % width;
            const y = (at - x) / width;
            if (!columns.has(x)) columns.set(x, []);
            columns.get(x).push(y);
            const reach = span.get(y);
            if (!reach) span.set(y, { minX: x, maxX: x });
            else { if (x < reach.minX) reach.minX = x; if (x > reach.maxX) reach.maxX = x; }
        }

        /*
         * How far off the ground a column that stops short of the footing hangs.
         *
         * Sharing a footing is what keeps a wall from tearing in depth, but it
         * was also deciding height, and those are different questions. Indexed
         * straight off the footing, a column whose lowest painted cell is north
         * of it was drawn that many courses up with nothing beneath — so a
         * mountain range, whose southern edge steps back in ones and twos,
         * stood its whole front row a tile clear of the ground. 166 of 616
         * columns on Infernis Prime hung that way, up to twenty-one tiles.
         *
         * A column only hangs if something is holding it up: an archway's panel
         * has its posts either side, and the rows beneath it are spanned by the
         * same region left and right. A range's edge has open ground on one
         * side, so it sits down. Counting only the *consecutive* bridged rows
         * beneath matters — a column bridged for two rows and open below that
         * is a panel on posts standing on a slope, not a panel floating.
         */
        const liftOf = (x, bottom) => {
            let lift = 0;
            for (let y = bottom + 1; y <= footing; y++) {
                const reach = span.get(y);
                if (!reach || reach.minX >= x || reach.maxX <= x) break;
                lift++;
            }
            return lift;
        };

        for (const [x, rows] of columns) {
            rows.sort((a, b) => a - b);
            const bottom = rows[rows.length - 1];
            const lift = liftOf(x, bottom);
            // Indexed by height above the ground the column stands on, so a
            // column that stops short simply leaves its *upper* courses empty —
            // `forEach` skips the holes, and nothing is drawn where nothing was
            // painted.
            const tiles = [];
            let authored = false;
            for (const y of rows) {
                const tile = tileAt[y * width + x];
                tiles[lift + bottom - y] = tile;
                if (isAuthored && isAuthored(tile)) authored = true;
            }
            // A run longer than a building is a cliff face or a map-edge wall
            // that happens to share the impassable flag. Leaving it as terrain
            // is wrong-looking; standing it up is worse.
            //
            // The cap only judges guesses. Where an author has classified a
            // tile as upright the height is theirs to choose: tilesets draw
            // buildings as single perspective props dozens of tiles tall, and
            // capping those dropped whole city blocks back to the floor.
            if (authored || footing - rows[0] + 1 <= cap) {
                runs.push({
                    x,
                    northY: rows[0],
                    southY: rows[rows.length - 1],
                    // The whole region's footing, which is what it stands on.
                    faceY: footing,
                    tiles
                });
            }
        }
    }
    return runs;
};


/**
 * Build ground and wall geometry, grouped by sheet.
 *
 * One group per sheet means one draw call per sheet — at most eleven for a
 * whole map, however large — without needing instancing or a custom shader.
 * Geometry is rebuilt only when the map changes, so the cost is paid on map
 * load rather than per frame.
 *
 * Walls are emitted only where a neighbour is lower, so a flat map produces no
 * side faces at all and interior cliff faces are never built.
 */
Reactor3D.Geometry.build = function(mapData, options) {
    const opts = options || {};
    const tileSize = opts.tileSize || 48;
    const elevationAt = opts.elevationAt || (() => 0);
    const sheetSize = opts.sheetSize || (() => ({ width: 768, height: 768 }));
    const tables = this.autotileTables(opts);
    // MZ's star flag already means "draws above characters", which authors set
    // on trees, roofs, signs and anything else tall. Reusing it means an
    // existing map stands its objects up without being re-authored.
    const isUpright = opts.isUpright || null;
    // Which tiles were classified by hand rather than guessed from flags. The
    // facade cap applies only to guesses; see `uprightRuns`.
    const isAuthored = opts.isAuthored || null;
    // Tiles that raise the ground they sit on instead of joining a facade.
    const isScenery = opts.isScenery || null;
    const sceneryHeight = opts.sceneryHeight === undefined ? 1 : opts.sceneryHeight;
    const uprightHeight = opts.uprightHeight === undefined ? 1 : opts.uprightHeight;
    const maxFacade = opts.maxFacade === undefined ? Reactor3D.AUTO_MAX_FACADE : opts.maxFacade;
    // Tiles that draw as one standing cut-out per cell rather than as terrain:
    // a forest is trees, not a plateau of bark.
    const isFoliage = opts.isFoliage || null;
    // Tiles that stand still and face a direction, with a little thickness:
    // gates, doors, signs, fences. Anything with a front.
    const isPanel = opts.isPanel || null;
    // Tiles the 2D tilemap draws over characters — the star flag. Their
    // geometry goes into a second pass so a character can walk behind them here
    // as well.
    const isAbove = opts.isAbove || null;
    /*
     * Whether a tile's geometry goes in the pass drawn over the characters.
     *
     * Per tile, which is what the 2D tilemap does: the star flag routes each
     * tile to the upper or lower layer on its own account, and an object whose
     * rows carry different flags is genuinely drawn across both. Answering for
     * the whole object instead was tried — a column vanishing looked like its
     * halves being split between the passes — and the cause turned out to be
     * elsewhere, in a cell only ever yielding one standing tile. Meanwhile the
     * object-wide answer put a column's unflagged shaft in the pass over the
     * characters, where it covered a plate standing in front of it.
     */
    const drawsAbove = tileId => !!isAbove && !!isAbove(tileId);
    // The declared object a tile belongs to, when the tileset says so.
    const declaredAt = opts.declaredAt || null;
    // What the author grouped by hand on this map, which outranks both.
    const paintedAt = opts.paintedAt || null;
    const isPaintedGround = opts.isPaintedGround || null;
    // The tile whose art that cut-out uses — the lone-cell variant of the same
    // terrain, which the tileset already draws.
    const standInFor = opts.standInFor || (tileId => tileId);
    // The roof a raised wall is capped with. Absent, a wall keeps its own art
    // on top, which is what it did before there was anywhere to say otherwise.
    const topFaceFor = opts.topFaceFor || null;
    // How tall a foliage cut-out stands, as a multiple of its own art.
    const foliageHeight = opts.foliageHeight === undefined ? 1.4 : opts.foliageHeight;
    // How many cut-outs a foliage cell carries. One: a cell is one instance of
    // the terrain, so it gets one object, the same as a tree drawn on a B sheet
    // gets one. Several per cell was an attempt to break up the grid and it
    // multiplied the geometry instead — the scatter below does that job.
    const foliageDensity = opts.foliageDensity === undefined ? 1 : opts.foliageDensity;
    // How far they wander from the cell's centre, in tiles.
    const foliageSpread = opts.foliageSpread === undefined ? 0.55 : opts.foliageSpread;
    // How far a foliage cell's floor rises above the ground around it.
    //
    // Zero, after seeing it. The idea was that a small lift would give a wood
    // an edge and something to stand on; what it actually does is raise every
    // wood onto a plinth of itself, because the lift is a step and a step gets
    // vertical faces, and the art those faces take is the wood's own tiling
    // art. A forest on a low kerb of bark is worse than a forest on the
    // ground. Left as an option because a raised wood may be wanted where the
    // terrain around it is authored lower.
    const foliageLift = opts.foliageLift === undefined ? 0 : opts.foliageLift;
    // Whether the tiling art is also laid flat under the cut-outs.
    // The tiling art of a terrain is that terrain seen from above, so drawing
    // it flat *and* standing cut-outs on it draws each cell twice: at ground
    // level it showed as a mat of canopy around the feet of the trees growing
    // out of it. Off by default; the cut-outs are the terrain now.
    const foliageFloor = opts.foliageFloor === undefined ? false : !!opts.foliageFloor;

    /**
     * A repeatable number in 0..1 for a cell, so a wood looks scattered but
     * comes back identical on every rebuild — trees that jump when you paint
     * elsewhere on the map are worse than trees in rows.
     */
    const scatter = (x, y, n) => {
        let hash = (x * 73856093) ^ (y * 19349663) ^ (n * 83492791);
        hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
        return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
    };

    const groups = new Map();
    // Billboards need their own material, so they cannot share a group with
    // static geometry even when they draw from the same sheet.
    const groupFor = (setNumber, billboard, above, underlay, layer, edgeHinged) => {
        const mapLayer = Number.isFinite(layer) ? layer : 0;
        const key = `${setNumber}:${billboard ? 1 : 0}:${above ? 1 : 0}:${underlay ? 1 : 0}:${mapLayer}:${edgeHinged ? 1 : 0}`;
        if (!groups.has(key)) {
            groups.set(key, {
                setNumber, billboard: !!billboard, above: !!above,
                underlay: !!underlay,
                edgeHinged: !!edgeHinged,
                layer: mapLayer,
                positions: [], uvs: [], indices: [], vertexCount: 0,
                // The rectangle of the sheet each vertex's quad is allowed to
                // sample, as [u0, v0, u1, v1]. Four vertices of a quad all
                // carry the same one, so it interpolates to itself.
                bounds: [],
                // Corner offsets, in tiles, from the anchor the vertex shares
                // with the rest of its quad. Only billboards carry them.
                offsets: [],
                // Per-vertex UV stride for animated tiles, and whether any
                // vertex in this group actually has one.
                anim: [], animated: false
            });
        }
        return groups.get(key);
    };

    // A quad, wound counter-clockwise seen from its front. `uv` is in pixels
    // within the sheet; it is normalised here so callers never deal with the
    // V-flip between image space and texture space.
    const quad = (group, corners, rect, size) => {
        const base = group.vertexCount;
        for (const corner of corners) group.positions.push(corner[0], corner[1], corner[2]);
        // A static quad's vertices are already where they belong; a zero offset
        // keeps the attribute the same length as the others if it is ever read.
        if (group.billboard) for (let i = 0; i < 4; i++) group.offsets.push(0, 0);
        const { u0, u1, v0, v1 } = Reactor3D.Geometry.uvRect(rect, size);
        group.uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
        for (let i = 0; i < 4; i++) group.bounds.push(u0, v0, u1, v1);
        // Normalised the same way as the UVs so the consumer just adds it.
        const du = (rect.animU || 0) / size.width;
        // Negated: a waterfall's next frame is further *down* the sheet, and V
        // counts up from the bottom.
        const dv = -(rect.animV || 0) / size.height;
        for (let i = 0; i < 4; i++) group.anim.push(du, dv);
        if (du || dv) group.animated = true;
        group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        group.vertexCount += 4;
    };

    /**
     * A quad that turns to face the camera about the world's up axis.
     *
     * Every vertex carries the same anchor as its position and its own corner
     * offset in tiles — left/right in `x`, up from the anchor in `y`. The
     * shader spins the pair around the anchor at draw time, which is the whole
     * point: a fixed plane is only correct from one direction, and off that
     * axis a standing object reads as a sheet of card folded up off the floor.
     *
     * `corners` is wound [top-left, top-right, bottom-right, bottom-left] to
     * match `quad`, so the two agree on which way is up in the image.
     */
    const billboardQuad = (group, anchor, corners, rect, size) => {
        const base = group.vertexCount;
        for (let i = 0; i < 4; i++) {
            group.positions.push(anchor[0], anchor[1], anchor[2]);
        }
        for (const corner of corners) group.offsets.push(corner[0], corner[1]);
        const { u0, u1, v0, v1 } = Reactor3D.Geometry.uvRect(rect, size);
        group.uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
        for (let i = 0; i < 4; i++) group.bounds.push(u0, v0, u1, v1);
        const du = (rect.animU || 0) / size.width;
        const dv = -(rect.animV || 0) / size.height;
        for (let i = 0; i < 4; i++) group.anim.push(du, dv);
        if (du || dv) group.animated = true;
        group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        group.vertexCount += 4;
    };

    /**
     * A vertical or horizontal face, split into autotile quadrants if needed.
     *
     * `corners` is the whole face wound as [top-left, top-right, bottom-right,
     * bottom-left]. An autotile's shape picks four quadrants out of its block,
     * so the face is subdivided the same way and each piece takes its own
     * quadrant: sampling the block's whole top-left tile instead put a corner
     * fragment — often a patch of something else entirely — on every cliff.
     */
    const faceQuads = (group, corners, rect, size, parts) => {
        if (!parts) {
            quad(group, corners, rect, size);
            return 1;
        }
        const at = (u, v) => [0, 1, 2].map(axis =>
            corners[0][axis] * (1 - u) * (1 - v) +
            corners[1][axis] * u * (1 - v) +
            corners[3][axis] * (1 - u) * v +
            corners[2][axis] * u * v);
        for (const part of parts) {
            const u0 = part.qx * 0.5;
            const v0 = part.qy * 0.5;
            quad(group, [
                at(u0, v0), at(u0 + 0.5, v0), at(u0 + 0.5, v0 + 0.5), at(u0, v0 + 0.5)
            ], part, size);
        }
        return parts.length;
    };

    if (!mapData || !Array.isArray(mapData.data)) return { groups: [], quads: 0 };

    const { width, height } = mapData;
    let quadCount = 0;

    /**
     * The height of a cell's surface.
     *
     * Scenery raises the ground rather than standing a picture on it. Trying
     * the other way first — a billboard per cell — turned a mountain range into
     * rows of cardboard cut-outs with daylight between them, because terrain
     * covers an *area* and a picture does not. Raised ground gets its cliff
     * faces from the wall code below for free, and a range reads as a mass.
     */
    /**
     * Roofs ride on the walls they belong to.
     *
     * A building in an RPG Maker map is two pieces of terrain: wall autotiles
     * where it meets the ground, and roof tiles on the cells behind them. The
     * walls raise into a mass and the roof, being flat terrain, stayed at
     * ground level — so a building came out as a block with its own roof lying
     * on the floor beside it like a rug.
     *
     * The connection is in the map: a stretch of roof touching a raised wall is
     * that wall's top. So each connected run of roof art is walked, and if it
     * meets a raised cell anywhere along its edge it is lifted to match.
     */
    const roofLift = new Map();
    if (isScenery) {
        const isRoofArt = (x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return false;
            if (this.uprightTileAt(mapData, x, y, isScenery)) return false;
            if (isUpright && this.uprightTileAt(mapData, x, y, isUpright)) return false;
            const stack = this.groundStackAt(mapData, x, y, isUpright);
            // A3 and A4 are the sheets a building is drawn from; anything else
            // on the floor here is ground, not a roof.
            return stack.some(tileId => tileId >= 4352 && tileId < 8192);
        };
        const seen = new Set();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const start = y * width + x;
                if (seen.has(start) || !isRoofArt(x, y)) continue;
                const stack = [start];
                seen.add(start);
                const region = [];
                let lift = 0;
                while (stack.length) {
                    const index = stack.pop();
                    const cx = index % width;
                    const cy = (index - cx) / width;
                    region.push(index);
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        if (this.uprightTileAt(mapData, nx, ny, isScenery)) {
                            lift = Math.max(lift, sceneryHeight);
                            continue;
                        }
                        const next = ny * width + nx;
                        if (!seen.has(next) && isRoofArt(nx, ny)) { seen.add(next); stack.push(next); }
                    }
                }
                if (lift > 0) for (const index of region) roofLift.set(index, lift);
            }
        }
    }

    const surfaceAt = (x, y) => {
        const base = elevationAt(x, y);
        if (x < 0 || y < 0 || x >= width || y >= height) return base;
        if (isScenery && this.uprightTileAt(mapData, x, y, isScenery)) {
            return base + sceneryHeight;
        }
        const roof = roofLift.get(y * width + x);
        if (roof) return base + roof;
        // A wood is not painted onto the plain: its floor rises a little, which
        // gives it an edge you can see and something to stand its trees on.
        if (isFoliage && this.uprightTileAt(mapData, x, y, isFoliage)) {
            return base + foliageLift;
        }
        return base;
    };

    /**
     * The wall autotile a cell's art is built from, or 0.
     *
     * Read from the whole stack rather than layer zero: a building's wall is
     * often painted over a ground tile, and it is the wall that says what the
     * vertical faces of the mass are made of.
     */
    const wallTileAt = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return 0;
        const stack = this.groundStackAt(mapData, x, y);
        for (let i = stack.length - 1; i >= 0; i--) {
            if (this.isWallAutotile(stack[i])) return stack[i];
        }
        return 0;
    };

    /**
     * The art that covers the top of a raised wall.
     *
     * A wall autotile draws a wall *face* and has no top, so a raised wall was
     * capped with its own side art. Where a roof is known — named in the
     * classification file, or derived from A4's alternating rows — the cap
     * takes that instead, and picks its shape from the mass it covers rather
     * than reusing the wall's, which answers a different question.
     *
     * Anything that is not a raised wall is returned untouched.
     */
    const roofCapFor = (tileId, x, y, top) => {
        if (!topFaceFor || !this.isWallAutotile(tileId)) return tileId;
        const roof = topFaceFor(tileId);
        if (!roof) return tileId;
        // A neighbour continues this roof when it stands as high and is capped
        // with the same roof, so a run of wall reads as one continuous surface.
        const same = (dx, dy) => {
            const cx = x + dx, cy = y + dy;
            if (cx < 0 || cy < 0 || cx >= width || cy >= height) return false;
            if (surfaceAt(cx, cy) !== top) return false;
            const neighbour = wallTileAt(cx, cy);
            return !!neighbour && topFaceFor(neighbour) === roof;
        };
        return roof + this.floorShapeFrom(same);
    };

    /**
     * One side of a raised wall, as a stack of tile-tall pieces.
     *
     * Two things this does that a single stretched quad cannot. The art repeats
     * once per tile of height instead of being pulled over the whole face, so a
     * three-tile wall is three courses rather than one smeared one. And each
     * piece takes the shape its *own* edges call for — capped at the top of the
     * mass, capped where the wall ends along this face, open where it carries
     * on — rather than the shape stored in the map, which answers the same
     * question in plan and therefore put a wall's western end cap on its
     * northern face too.
     */
    const wallFaceStack = (side, x, y, top, bottom, wallId) => {
        const base = this.autotileBase(wallId);
        const rect = this.sheetRectFor(base, tileSize);
        if (!rect) return 0;
        const group = groupFor(rect.setNumber, false, drawsAbove(wallId));
        const size = sheetSize(rect.setNumber);

        // The face carries on sideways where the neighbour is the same wall and
        // stands at least as tall; anywhere else this side of the mass ends.
        const carriesOn = (dx, dy) => {
            const cx = x + dx, cy = y + dy;
            if (cx < 0 || cy < 0 || cx >= width || cy >= height) return false;
            if (surfaceAt(cx, cy) < top) return false;
            return this.autotileBase(wallTileAt(cx, cy)) === base;
        };
        const left = !carriesOn(side.lx, side.ly);
        const right = !carriesOn(side.rx, side.ry);

        let drawn = 0;
        const levels = Math.max(1, Math.round(top - bottom));
        for (let level = 0; level < levels; level++) {
            const yTop = top - level;
            // The lowest course reaches whatever the neighbour's surface is,
            // which need not be a whole number of tiles below.
            const yBot = level === levels - 1 ? bottom : yTop - 1;
            const shape = this.wallFaceShape({
                left, right, top: level === 0, bottom: level === levels - 1
            });
            const piece = this.sheetRectFor(base + shape, tileSize);
            if (!piece) break;
            drawn += faceQuads(group, side.corners(yTop, yBot), piece, size,
                this.autotileQuads(base + shape, tileSize, tables));
        }
        return drawn;
    };

    /** Whether a cell holds foliage at all. */
    const foliageAt = (x, y) =>
        !!isFoliage && x >= 0 && y >= 0 && x < width && y < height
        && !!this.uprightTileAt(mapData, x, y, isFoliage);

    /**
     * Whether a foliage cell is on the edge of its mass — the autotile question
     * asked in three dimensions, since a shape is decided by which neighbours
     * carry the same terrain.
     *
     * Standing cut-outs only on the border and capping the interior with the
     * tiling art was tried, on the reasoning that inside a wood there is
     * nothing to see but canopy. From above it was ideal and from the ground it
     * was terraces: a fringe of trees with a flat brown plateau behind them,
     * which is worse than what it replaced. The mass needs relief all through,
     * so every cell stands its own cut-outs. Kept because the edge is where the
     * silhouette lives and something will want it.
     */
    const foliageBorder = (x, y) =>
        !foliageAt(x - 1, y) || !foliageAt(x + 1, y)
        || !foliageAt(x, y - 1) || !foliageAt(x, y + 1);

    /**
     * A panel standing on its cell: a box a tenth of a tile deep, with the art
     * on both faces and a strip of it wrapped round the two edges.
     *
     * Built from a basis rather than four hand-written cases. `n` is the
     * outward normal and `u` runs along the face left-to-right as seen from
     * outside it — for the south face that is west-to-east, and it rotates with
     * the normal, which is what keeps the art the right way round on all four.
     */
    const panelBox = (tileId, x, y, y0, y1, facing) => {
        const rect = this.sheetRectFor(tileId, tileSize);
        if (!rect) return 0;
        const group = groupFor(rect.setNumber, false, drawsAbove(tileId));
        const size = sheetSize(rect.setNumber);
        const [nx, nz] = this.FACING_NORMALS[facing] || this.FACING_NORMALS.south;
        const ux = nz, uz = -nx;
        const half = this.PANEL_THICKNESS / 2;
        const cx = x + 0.5, cz = y + 0.5;
        const at = (alongU, alongN, height) =>
            [cx + ux * alongU + nx * alongN, height, cz + uz * alongU + nz * alongN];

        // The edges take a narrow strip of the art rather than a flat colour,
        // so a painted gate has painted sides.
        const strip = Math.max(1, Math.min(Math.round(this.PANEL_EDGE_PIXELS), rect.width));
        const leftStrip = Object.assign({}, rect, { width: strip });
        const rightStrip = Object.assign({}, rect,
            { sx: rect.sx + rect.width - strip, width: strip });

        // Front, back, and the two edges. The back carries the same picture:
        // a tileset draws one elevation, and a mirrored front is a better
        // guess at the other side than a hole.
        quad(group, [at(-0.5, half, y1), at(0.5, half, y1),
            at(0.5, half, y0), at(-0.5, half, y0)], rect, size);
        quad(group, [at(0.5, -half, y1), at(-0.5, -half, y1),
            at(-0.5, -half, y0), at(0.5, -half, y0)], rect, size);
        quad(group, [at(-0.5, -half, y1), at(-0.5, half, y1),
            at(-0.5, half, y0), at(-0.5, -half, y0)], leftStrip, size);
        quad(group, [at(0.5, half, y1), at(0.5, -half, y1),
            at(0.5, -half, y0), at(0.5, half, y0)], rightStrip, size);
        return 4;
    };

    // Facades first, and note which cells they consumed: a cell inside a
    // building's footprint is under the building, not open ground.
    const consumed = new Set();
    // Cell index -> the ground tile to draw under a facade that covers it.
    const apron = new Map();
    /*
     * Where a cell's art ended up, once it was stood into a wall.
     *
     * A facade takes a cell's picture off the ground and puts it on a vertical
     * plane at the wall's footing, some number of courses up. Anything drawn
     * *over* the scene — a sign event, the animation playing on it — has to
     * follow it there, or it stays lying on the floor at its own row while the
     * art it belongs to is metres away, and the two drift apart as the camera
     * pans because they are at different depths.
     */
    const facadeZ = new Float32Array(width * height);
    const facadeY = new Float32Array(width * height);
    const facadeLift = new Float32Array(width * height);
    const onFacade = new Uint8Array(width * height);
    /*
     * The wall's footing and how far up it this cell sits, kept apart.
     *
     * They cannot be added together here, because "up" is not world up: a
     * cut-out's courses are stacked along the billboard's own up axis, which
     * leans back with the camera. Storing one combined world height put every
     * sprite at a world position while the art it belongs to was drawn along
     * the leaning axis — a gap that grows with height and swings as the camera
     * moves, which is a sign creeping against the pole it hangs from.
     */
    const standAt = (x, y, planeZ, footingY, lift) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const at = y * width + x;
        onFacade[at] = 1;
        facadeZ[at] = planeZ;
        facadeY[at] = footingY;
        facadeLift[at] = lift;
    };
    // A panel stands still and faces a way; it must not also be swept into a
    // cut-out that turns. Filtered here rather than trusted to the caller,
    // because being in both places at once draws the thing twice.
    const standsAsCutout = isUpright
        ? (tileId => isUpright(tileId) && !(isPanel && isPanel(tileId)))
        : null;
    // Cells a painted object took, so the facade pass leaves them alone.
    const paintedCells = new Set();
    const objects = this.uprightObjects(
        mapData, standsAsCutout, maxFacade, isAuthored, declaredAt,
        paintedAt, isPaintedGround, paintedCells);

    /*
     * One footing for every piece of one wall.
     *
     * A piece of standing art used to take its depth from its own southern
     * row, so the pieces of a single mural landed on different planes: the
     * gateway on this map was built at depths 8, 9 and 11 at once, because its
     * middle panel ends three rows north of the posts holding it up. Nothing
     * could line up with anything — and art at different depths does not move
     * together as the camera pans, which is what read as a sign sliding
     * sideways against its own building while walking.
     *
     * Two pieces belong to one wall when they touch *and their row ranges
     * overlap*. That second half is what keeps the rule honest. Touching alone
     * swept a statue standing on the pavement into the building behind it and
     * hoisted it thirty tiles up the facade, because everything in a street
     * touches everything else in a long chain. Pieces of one mural interleave
     * — the gateway's panel occupies rows the posts also occupy — while a prop
     * in front of a wall merely meets its bottom edge.
     */
    const owner = new Int32Array(width * height).fill(-1);
    objects.forEach((object, index) => {
        for (const cell of object.cells) owner[cell.y * width + cell.x] = index;
    });
    /*
     * A course of standing art shares its footing along the row, and only
     * along the row.
     *
     * Standing art gets painted in pieces: the gateway's sign panel on this
     * map is five separate one-column placements of the same object at shifted
     * origins, flanked by posts that reach three rows further down. Each piece
     * stood on its own bottom row, so one painted surface was built on three
     * different planes at three different depths — the sign lined up with
     * neither post, and slid against them as the view panned, because surfaces
     * at different depths do not move together.
     *
     * Joining everything that touches fixed the gateway and broke the city:
     * standing art is adjacent to standing art all the way down a street, so
     * the region walked south to the map's edge and stood every wall in
     * Moletown on row 50, thirty-eight tiles up, which put the towers off the
     * top of the screen entirely.
     *
     * East and west only is what makes it safe. A course cannot walk southward
     * however long the street is, so the footing is bounded by the tallest
     * piece in one horizontal band — which is exactly the thing carrying the
     * band. Row ranges have to overlap as well, so a course joins its own
     * neighbours rather than whatever happens to abut its ends.
     */
    /*
     * Pieces join into one structure, and a structure is never taller than the
     * art it is made of.
     *
     * Moletown's gateway is scaffolding: tileset pieces standing in 3D with a
     * charset sign hung on an event in front of them. The sign band and the
     * posts holding it up are separate placements, so each stood on its own
     * bottom row — the band at one depth, the posts two tiles behind it — and
     * the sign lined up with one and slid against the other.
     *
     * Joining anything that touches fixes that and breaks the city: standing
     * art abuts standing art all the way down a street, so the group walks
     * south to the map's edge and stands every wall thirty-eight tiles up.
     * Requiring pieces to begin on the same row bounds it and is too strict —
     * posts start lower than the band they carry, which is the whole point of
     * a post.
     *
     * A declared object knows how tall its own picture is, and that is the
     * honest bound. A gateway assembled from a sixteen-row sheet may stand
     * eight rows tall; a street of separate buildings may not fuse into a
     * thirty-nine row wall, because no piece of it was ever drawn that tall.
     */
    const parent = objects.map((_, index) => index);
    const span = objects.map(object => ({
        minY: object.minY, maxY: object.maxY, tallest: object.sheetH || 0
    }));
    const find = index => {
        while (parent[index] !== index) {
            parent[index] = parent[parent[index]];
            index = parent[index];
        }
        return index;
    };
    const join = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA === rootB) return;
        const minY = Math.min(span[rootA].minY, span[rootB].minY);
        const maxY = Math.max(span[rootA].maxY, span[rootB].maxY);
        const tallest = Math.max(span[rootA].tallest, span[rootB].tallest);
        // Never taller than the tallest picture in it.
        if (maxY - minY + 1 > tallest) return;
        parent[rootB] = rootA;
        span[rootA] = { minY, maxY, tallest };
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const mine = owner[y * width + x];
            if (mine < 0) continue;
            const meet = (nx, ny) => {
                if (nx >= width || ny >= height) return;
                const theirs = owner[ny * width + nx];
                if (theirs >= 0 && theirs !== mine) join(mine, theirs);
            };
            meet(x + 1, y);
            meet(x, y + 1);
        }
    }
    /*
     * Each placement stands on its own bottom row, with one narrow exception.
     *
     * Every general merging rule tried here made something worse. Joining
     * whatever touches walked the length of a street and stood the whole city
     * on its southern edge. Bounding that by the art's own height stopped the
     * runaway and still swept a shopfront into the cooling towers below it,
     * which stacked the shopfront six rows up a wall that is not there — its
     * windows and counters came out skewed and displaced, which is what
     * "garbled" looked like.
     *
     * The one case that genuinely is one surface: several placements of the
     * *same* tileset object, side by side, overlapping in rows. That is an
     * author painting one object out column by column — Moletown's gateway is
     * five one-column placements of the same piece — and it is not the same as
     * two different objects that happen to abut.
     */
    /*
     * North to south, which is the order 2D draws in.
     *
     * A cut-out is drawn with `depthWrite` off — its soft edges have to blend
     * with whatever is behind them rather than punch a hole in the depth
     * buffer — so within one merged buffer the last thing written is the thing
     * you see. Order is the whole of the occlusion, and the order was whatever
     * the passes above happened to produce: painted groups, then declared
     * rectangles, then the flood fill.
     *
     * So a banner hanging on a wall was drawn over a sign standing in front of
     * it, purely because its object was built first. 2D never has this problem
     * because it draws row by row, and a thing further up the map is always
     * painted before the thing below it. Sorting by footing is that same rule:
     * whatever stands further north goes down first, and anything to the south
     * paints over it.
     */
    objects.sort((a, b) => (a.maxY - b.maxY) || (a.minX - b.minX));

    const footings = objects.map(object => object.maxY);

    const indexOf = new Map();
    objects.forEach((object, index) => indexOf.set(object, index));
    const footingFor = object => {
        const index = indexOf.get(object);
        return index === undefined ? object.maxY : footings[index];
    };

    /*
     * Declared pictures painted over one another are one 2D composition.
     *
     * A lower-layer inset may have no flat footing of its own, which normally
     * plants it in the centre of its southern cell. If a higher-layer picture
     * occupies the same map cells and hinges on a flat row, that half-cell
     * difference puts the underlay physically in front and lets depth reverse
     * the author's layer order. Co-planar artwork instead shares the higher
     * layer's hinge; source layer can then settle the intended painter order.
     */
    const plane = width * height;
    const sourceLayerOf = object => {
        let highest = -1;
        for (const cell of object.cells) {
            const tileIds = cell.tileIds && cell.tileIds.length
                ? cell.tileIds : [cell.tileId];
            const at = cell.y * width + cell.x;
            for (const tileId of tileIds) {
                for (let layer = 0; layer < 4; layer++) {
                    if ((mapData.data[layer * plane + at] || 0) === tileId) {
                        highest = Math.max(highest, layer);
                    }
                }
            }
        }
        return highest;
    };
    const contains = (outer, inner) => outer.declaredMinX <= inner.declaredMinX
        && outer.declaredMaxX >= inner.declaredMaxX
        && outer.declaredMinY <= inner.declaredMinY
        && outer.declaredMaxY >= inner.declaredMaxY;
    for (const object of objects) object.sourceLayer = sourceLayerOf(object);
    const declared = objects.filter(object => object.sheetTile);
    declared.sort((a, b) => b.sourceLayer - a.sourceLayer);
    for (const object of declared) {
        if (Number.isFinite(object.planeZ)) continue;
        const ownPlane = footingFor(object) + 0.5;
        const candidates = declared.filter(other => other !== object
            && other.sourceLayer > object.sourceLayer
            && Number.isFinite(other.planeZ)
            && contains(other, object)
            && Math.abs(ownPlane - other.planeZ) <= 0.501);
        candidates.sort((a, b) => (b.sourceLayer - a.sourceLayer)
            || ((a.declaredMaxX - a.declaredMinX) * (a.declaredMaxY - a.declaredMinY)
                - (b.declaredMaxX - b.declaredMinX) * (b.declaredMaxY - b.declaredMinY)));
        const covering = candidates[0];
        if (!covering) continue;
        object.compositePlaneZ = covering.planeZ;
        object.compositeFrame = covering;
    }

    const compositeFlat = new Map();
    const syntheticFlat = new Map();
    for (const object of declared) {
        const frame = object.compositeFrame;
        if (!frame) continue;
        const source = this.sheetCellOf(object.sheetTile);
        const cells = new Set(object.cells.map(cell => `${cell.x}:${cell.y}`));
        for (let dr = 0; dr < object.declaredH; dr++) {
            for (let dc = 0; dc < object.declaredW; dc++) {
                const x = object.declaredOriginX + dc;
                const y = object.declaredOriginY + dr;
                if (x < 0 || y < 0 || x >= width || y >= height || cells.has(`${x}:${y}`)) continue;
                const tileId = this.tileIdAtSheetCell(
                    source.setNumber, source.col + dc, source.row + dr);
                if (!tileId) continue;
                object.cells.push({
                    x, y, tileId, tileIds: [tileId], synthetic: true,
                    // Just above an anomalous occupant on the same nominal map
                    // plane, but still below the higher-layer covering frame.
                    // Otherwise that occupant's core clips the reconstructed
                    // soft tail before its colour pass can blend.
                    syntheticLayer: object.sourceLayer + 0.01
                });
            }
        }
        for (const cell of object.cells) {
            const dc = cell.x - frame.declaredOriginX;
            const dr = cell.y - frame.declaredOriginY;
            const role = frame.declaredRoles[dr * frame.declaredW + dc];
            if (role !== "F") continue;
            const key = cell.y * width + cell.x;
            if (!compositeFlat.has(key)) compositeFlat.set(key, new Set());
            const tileIds = cell.tileIds && cell.tileIds.length
                ? cell.tileIds : [cell.tileId];
            for (const tileId of tileIds) {
                compositeFlat.get(key).add(tileId);
                if (cell.synthetic) {
                    if (!syntheticFlat.has(key)) syntheticFlat.set(key, []);
                    syntheticFlat.get(key).push({ tileId, layer: cell.syntheticLayer });
                }
            }
        }
    }
    const isCompositeFlat = (x, y, tileId) => {
        const tiles = compositeFlat.get(y * width + x);
        return !!(tiles && tiles.has(tileId));
    };

    const layerCursor = new Map();
    const mapLayerFor = (cell, tileId) => {
        if (Number.isFinite(cell.syntheticLayer)) return cell.syntheticLayer;
        const key = `${cell.x}:${cell.y}:${tileId}`;
        const after = layerCursor.get(key) ?? -1;
        const at = cell.y * width + cell.x;
        for (let layer = after + 1; layer < 4; layer++) {
            if ((mapData.data[layer * width * height + at] || 0) !== tileId) continue;
            layerCursor.set(key, layer);
            return layer;
        }
        return Math.max(0, after);
    };

    for (const object of objects) {
        // A cut-out's rows are its *height*, not its depth.
        //
        // `level = maxY - cell.y` below stacks the object's map rows upwards to
        // build the picture, which is the whole idea of standing a drawing up:
        // a three-row street light is three tiles tall, not three tiles deep.
        // Centring the anchor on those rows as though they were a footprint put
        // the object's feet in the middle of its own height — a lamp stood
        // roughly half its height north of the tile it belongs to, which at a
        // pitched camera reads as floating well above the ground it should be
        // planted on. The taller the prop, the further off it sat.
        //
        // So the anchor sits on the southern row — and in the *middle* of it,
        // as it does across the object's columns.
        //
        // It used to sit on that row's southern edge, on the reasoning that
        // RPG Maker plants a standing sprite on the bottom of its cell:
        // `screenY` is `scrolledY * tileHeight + tileHeight`. That is where the
        // baseline is drawn on a 2D screen, and it is not where the object is
        // in the world. Taking it literally pinned the object half a tile south
        // of its own cell while its x pivoted about the cell's middle, so the
        // two axes disagreed. Half a tile of pure depth is invisible from the
        // front — which is why it looked right — and swings into view as the
        // camera comes round, until a column standing in the middle of a three
        // by three pool is planted on the pool's southern lip.
        //
        // The middle of the cell is the object's own axis, so it turns about
        // itself from every angle.
        const frame = object.compositeFrame || object;
        const centreX = (frame.minX + frame.maxX + 1) / 2;
        // The region's footing rather than this object's own southern row, so
        // every piece of one mural stands on one plane at one depth.
        const footing = footingFor(frame);
        const centreZ = Number.isFinite(object.compositePlaneZ)
            ? object.compositePlaneZ
            : Number.isFinite(object.planeZ) ? object.planeZ : footing + 0.5;
        const baseRow = Number.isFinite(object.compositePlaneZ)
            ? Math.floor(object.compositePlaneZ)
            : Number.isFinite(object.planeZ) ? Math.floor(object.planeZ) : footing;
        const base = surfaceAt(Math.floor(centreX), baseRow);
        const anchor = [centreX, base, centreZ];
        const edgeHinged = Number.isFinite(object.planeZ)
            || Number.isFinite(object.compositePlaneZ);

        for (const cell of object.cells) {
            // South is the bottom of the picture, so a cell's distance north of
            // the region's footing is its height above the ground.
            const level = footing - cell.y;
            // Recorded whether or not the tile draws, so a sign hanging on this
            // object is placed on the object's own plane rather than on the
            // floor at its own map row. The two are not the same place: a
            // gateway drawn across rows 5-10 stands at the depth of row 10, so
            // an event at row 7 left on the ground sat three tiles nearer the
            // camera than the art it belongs to — and slid against it as the
            // camera panned, because two surfaces at different depths do not
            // move together.
            // Every standing tile in the cell, lowest layer first — a cell can
            // hold more than one, and in 2D they are simply drawn one over the
            // other. Taking only the topmost made a column with a plate resting
            // on it vanish and leave the plate behind.
            const standing = ((cell.tileIds && cell.tileIds.length)
                ? cell.tileIds : (cell.tileId ? [cell.tileId] : []))
                .filter(tileId => !isCompositeFlat(cell.x, cell.y, tileId));
            if (!standing.length) continue;
            standAt(cell.x, cell.y, centreZ, base, level * uprightHeight);
            for (const tileId of standing) {
            const rect = this.sheetRectFor(tileId, tileSize);
            if (!rect) continue;
            const mapLayer = mapLayerFor(cell, tileId);
            const above = drawsAbove(tileId);
            const group = groupFor(
                rect.setNumber, true, above, false, mapLayer, edgeHinged);
            const size = sheetSize(rect.setNumber);
            const y0 = level * uprightHeight;
            const y1 = y0 + uprightHeight;
            const left = cell.x - centreX;

            // An autotile standing up is still an autotile: its shape picks
            // four quadrants out of the block, and taking the block's whole
            // top-left tile instead samples a corner piece — a wall built from
            // grass corners, or a mountain edged with a different mountain's
            // border. The quadrants tile the face the same way they tile the
            // ground, with qy running down the face instead of south.
            const parts = rect.autotile
                ? this.autotileQuads(tileId, tileSize, tables)
                : null;
            const half = uprightHeight / 2;
            const faces = parts
                ? parts.map(part => ({
                    rect: part,
                    x0: left + part.qx * 0.5,
                    x1: left + part.qx * 0.5 + 0.5,
                    yTop: y1 - part.qy * half,
                    yBot: y1 - (part.qy + 1) * half
                }))
                : [{ rect, x0: left, x1: left + 1, yTop: y1, yBot: y0 }];

            for (const face of faces) {
                billboardQuad(group, anchor, [
                    [face.x0, face.yTop],
                    [face.x1, face.yTop],
                    [face.x1, face.yBot],
                    [face.x0, face.yBot]
                ], face.rect, size);
                quadCount++;
            }

            // A second plane crossing the first used to supply depth, because a
            // fixed facade seen edge-on vanished to a line. A cut-out that
            // turns never is seen edge-on, so the crossing plane is gone: it
            // only ever showed as a seam through the middle of the art when the
            // camera caught it at an angle.
            }
        }

        // The floor the object stands on.
        //
        // Its cells usually hold nothing but its own art, so excluding upright
        // tiles leaves them with no ground at all and the footprint renders as
        // a hole you could see the sky through. The ground it faces — south of
        // its own column — is the surface it is standing on.
        for (const cell of object.cells) {
            consumed.add(cell.y * width + cell.x);
        }
        const columns = new Set(object.cells.map(cell => cell.x));
        for (const x of columns) {
            const rows = object.cells.filter(cell => cell.x === x).map(cell => cell.y);
            const run = { x, northY: Math.min(...rows), southY: Math.max(...rows) };
            const surface = this.nearestGround(mapData, run, isUpright);
            if (!surface) continue;
            for (const y of rows) apron.set(y * width + x, surface);
        }
    }

    // Walls, which are autotiles, stay fixed planes on the southern face of
    // their run. A wall belongs to a building and faces a particular way; a
    // cut-out that turned would swing that building's walls around the moment
    // the camera moved.
    const wallRuns = isUpright
        ? this.uprightRuns(mapData, tileId => isUpright(tileId) && tileId >= 2048,
            maxFacade, isAuthored, paintedCells)
        : [];
    /*
     * Which columns have a wall beside them, so a run of them is a solid block
     * rather than a row of boxes with faces between every pair.
     *
     * Keyed by footing as well as by column: two walls at the same x standing
     * on different rows are different buildings and each keeps its own ends.
     */
    const wallColumns = new Map();
    for (const run of wallRuns) wallColumns.set(`${run.x}:${run.faceY}`, run);
    const wallBeside = (x, faceY, level) => {
        const run = wallColumns.get(`${x}:${faceY}`);
        return !!(run && run.tiles[level]);
    };

    // Walls sort the same way, and for the same reason.
    wallRuns.sort((a, b) => (a.faceY - b.faceY) || (a.x - b.x));

    for (const run of wallRuns) {
        // The region's footing, not this column's own bottom: a wall whose
        // base is ragged — a gateway, whose posts run lower than the panel
        // between them — was otherwise torn into columns at different depths
        // and heights, and nothing hanging on it could line up with any of it.
        const base = surfaceAt(run.x, run.faceY);
        const zFace = run.faceY + 1;
        run.tiles.forEach((tileId, level) => {
            standAt(run.x, run.faceY - level, zFace, base, level * uprightHeight);
            const rect = this.sheetRectFor(tileId, tileSize);
            if (!rect) return;
            const group = groupFor(rect.setNumber, false, drawsAbove(tileId));
            const size = sheetSize(rect.setNumber);
            const y0 = base + level * uprightHeight;
            const y1 = y0 + uprightHeight;
            // An autotile standing up is still an autotile: its shape picks
            // four quadrants out of the block, and taking the block's whole
            // top-left tile instead samples a corner piece — a wall built from
            // grass corners. The quadrants tile the face the same way they tile
            // the ground, with qy running down the face instead of south.
            const parts = rect.autotile ? this.autotileQuads(tileId, tileSize, tables) : null;
            const half = uprightHeight / 2;
            const faces = parts
                ? parts.map(part => ({
                    rect: part,
                    x0: run.x + part.qx * 0.5,
                    x1: run.x + part.qx * 0.5 + 0.5,
                    yTop: y1 - part.qy * half,
                    yBot: y1 - (part.qy + 1) * half
                }))
                : [{ rect, x0: run.x, x1: run.x + 1, yTop: y1, yBot: y0 }];
            /*
             * A box, not a plane.
             *
             * The same picture on the front and the back, and on whichever
             * ends are exposed. A tileset draws one elevation of a wall and
             * nothing else, so its own art is the only thing there is to put
             * on the other three sides — and it is what an author reaching for
             * a quick fix would put there themselves.
             *
             * No top. What covers a wall is a roof, and the tileset already
             * says which tile that is; wall art laid flat up there would be
             * wrong on every building that has a proper roof painted on it.
             */
            const zBack = zFace - this.WALL_THICKNESS;
            for (const face of faces) {
                quad(group, [
                    [face.x0, face.yTop, zFace],
                    [face.x1, face.yTop, zFace],
                    [face.x1, face.yBot, zFace],
                    [face.x0, face.yBot, zFace]
                ], face.rect, size);
                // Wound the other way about, so it faces north rather than
                // being a front you can only see from inside the building.
                quad(group, [
                    [face.x1, face.yTop, zBack],
                    [face.x0, face.yTop, zBack],
                    [face.x0, face.yBot, zBack],
                    [face.x1, face.yBot, zBack]
                ], face.rect, size);
                quadCount += 2;
            }
            /*
             * The ends, turned into depth.
             *
             * Built from the same quadrants as the front, with the shape's
             * horizontal split running along z instead of x — an autotile
             * standing up is still an autotile, and `sheetRectFor` on one is
             * the block's whole top-left tile, which is a corner piece. Using
             * it raw is what once built walls out of grass corners; it would
             * do it again here, one face round the corner.
             *
             * And only where the wall actually ends. A shopfront five columns
             * wide is one block; a face between every pair of columns is
             * geometry nobody can see and two surfaces fighting over a plane.
             */
            const depth = this.WALL_THICKNESS;
            const ends = parts
                ? parts.map(part => ({
                    rect: part,
                    z0: zBack + part.qx * 0.5 * depth,
                    z1: zBack + (part.qx * 0.5 + 0.5) * depth,
                    yTop: y1 - part.qy * half,
                    yBot: y1 - (part.qy + 1) * half
                }))
                : [{ rect, z0: zBack, z1: zFace, yTop: y1, yBot: y0 }];
            for (const side of [run.x, run.x + 1]) {
                const outward = side === run.x ? -1 : 1;
                if (wallBeside(run.x + outward, run.faceY, level)) continue;
                for (const end of ends) {
                    quad(group, [
                        [side, end.yTop, end.z0], [side, end.yTop, end.z1],
                        [side, end.yBot, end.z1], [side, end.yBot, end.z0]
                    ], end.rect, size);
                    quadCount++;
                }
            }
        });
        for (let row = run.northY; row <= run.southY; row++) {
            consumed.add(row * width + run.x);
        }
        const surface = this.nearestGround(mapData, run, isUpright);
        if (surface) {
            for (let row = run.northY; row <= run.southY; row++) {
                apron.set(row * width + run.x, surface);
            }
        }
    }

    // Panels: things with a front. A run of them going north is the same
    // drawing convention a facade uses — the cells north of the base are the
    // upper courses of one picture — so the run stacks from the ground up, and
    // the whole thing faces the way its base cell says.
    const panelRuns = isPanel ? this.uprightRuns(mapData, isPanel, Infinity, () => true) : [];
    for (const run of panelRuns) {
        const base = surfaceAt(run.x, run.faceY);
        const facing = this.panelFacing((dx, dy) => {
            const nx = run.x + dx, ny = run.faceY + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
            // Solid means built up beside it — a wall, a cliff, a raised mass.
            return surfaceAt(nx, ny) > base;
        });
        run.tiles.forEach((tileId, level) => {
            const y0 = base + level * uprightHeight;
            standAt(run.x, run.faceY - level, run.faceY + 1, base, level * uprightHeight);
            quadCount += panelBox(tileId, run.x, run.faceY, y0, y0 + uprightHeight, facing);
        });
        for (let row = run.northY; row <= run.southY; row++) {
            consumed.add(row * width + run.x);
        }
        const surface = this.nearestGround(mapData, run, isUpright);
        if (surface) {
            for (let row = run.northY; row <= run.southY; row++) {
                apron.set(row * width + run.x, surface);
            }
        }
    }

    const emittedFoliagePlacements = new Set();
    const multiFoliagePlacements = new Map();
    const multiFoliagePlacement = (tileId, x, y, standId, spanX, spanY) => {
        if (spanX <= 1 && spanY <= 1) return null;
        const sourceCell = this.sheetCellOf(tileId);
        const standCell = this.sheetCellOf(standId);
        // The fill block and its lone variant are normally on the same sheet;
        // only then do their cell offsets describe one repeating footprint.
        if (sourceCell.setNumber !== standCell.setNumber) return null;
        const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
        const originX = x - mod(sourceCell.col - standCell.col, spanX);
        const originY = y - mod(sourceCell.row - standCell.row, spanY);
        return {
            originX,
            originY,
            dc: x - originX,
            dr: y - originY,
            key: `${standCell.setNumber}:${standId}:${originX}:${originY}`
        };
    };
    // Collect every painted constituent before emitting a multi-cell stand-in.
    // A stamp may be incomplete or cross source planes; retaining each present
    // quadrant is what lets the 3D result preserve the same layer groups as 2D
    // without drawing the complete mountain once per source tile.
    if (isFoliage) {
        const plane = width * height;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                for (let layer = 0; layer < 4; layer++) {
                    const tileId = mapData.data[layer * plane + y * width + x] || 0;
                    if (!isFoliage(tileId)) continue;
                    const standIn = standInFor(tileId);
                    if (!standIn || typeof standIn !== "object") continue;
                    const spanX = standIn.w || 1;
                    const spanY = standIn.h || 1;
                    const placement = multiFoliagePlacement(
                        tileId, x, y, standIn.tileId, spanX, spanY);
                    if (placement) {
                        if (!multiFoliagePlacements.has(placement.key)) {
                            multiFoliagePlacements.set(placement.key, {
                                originX: placement.originX,
                                originY: placement.originY,
                                standId: standIn.tileId,
                                spanX,
                                spanY,
                                parts: []
                            });
                        }
                        multiFoliagePlacements.get(placement.key).parts.push({
                            x, y, dc: placement.dc, dr: placement.dr,
                            tileId, layer, above: drawsAbove(tileId)
                        });
                    }
                }
            }
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const top = surfaceAt(x, y);
            const underFacade = consumed.has(y * width + x);

            // The floor a building stands on. Skipping a facade's footprint
            // entirely left a hole you could see straight through from above,
            // because a facade is one plane at the run's southern end and the
            // cells behind it had nothing at all.
            let groundLayers = this.groundLayersAt(mapData, x, y,
                tileId => !!(isUpright && isUpright(tileId))
                    && !isCompositeFlat(x, y, tileId));
            const synthetic = syntheticFlat.get(y * width + x);
            if (synthetic) groundLayers.push(...synthetic);
            groundLayers.sort((a, b) => a.layer - b.layer);
            let stack = groundLayers.map(entry => entry.tileId);
            if (!stack.length && underFacade) {
                const surface = apron.get(y * width + x);
                if (surface) {
                    stack = [surface];
                    groundLayers = [{ tileId: surface, layer: 0 }];
                }
            }
            // Nothing but upright tiles here and no facade claimed them — a run
            // the cap rejected. Better to lay the art flat than draw a hole.
            if (!stack.length && !underFacade) {
                groundLayers = this.groundLayersAt(mapData, x, y);
                stack = groundLayers.map(entry => entry.tileId);
            }
            if (!stack.length) continue;

            // A wood's tiling art stays on the floor under its cut-outs.
            //
            // Dropping it looked right from a low camera and was wrong from
            // above: the 2D map's canopy is unbroken, and standing cut-outs
            // alone left bare ground showing between them, so a forest read as
            // scattered trees on a plain. It also banded, because the rows an
            // author fills with canopy alternate with rows of other pieces. On
            // the floor the art closes those gaps, and the cut-outs are dense
            // enough that little of it shows from ground level anyway.

            // Every layer of the cell, bottom first, each lifted a hair above
            // the one below so the depth buffer keeps the author's order
            // instead of letting coplanar quads fight. The lift is far below a
            // tile's width, so nothing separates visibly even edge-on.
            for (let layer = 0; layer < stack.length; layer++) {
                const tileId = stack[layer];
                const mapLayer = groundLayers[layer] ? groundLayers[layer].layer : layer;
                // A raised wall is capped with its roof rather than with its
                // own face art. The roof picks its corners from the mass it
                // covers, the same way it would if it had been painted flat.
                const drawId = roofCapFor(tileId, x, y, top);
                const rect = this.sheetRectFor(drawId, tileSize);
                if (!rect) continue;

                let group = groupFor(
                    rect.setNumber, false, drawsAbove(tileId), false, mapLayer);
                const size = sheetSize(rect.setNumber);
                const surface = top + mapLayer * this.LAYER_LIFT;

                // Foliage becomes cut-outs standing on the cell, using the
                // terrain's lone-cell variant — what the tileset draws for a
                // single isolated cell of it, which for a forest is one tree
                // and for a range is one peak. Standing the *tiling* art up
                // instead gave a wall of bark, because tiling art is the inside
                // of a mass and has no silhouette of its own.
                if (isFoliage && isFoliage(tileId)) {
                    const standIn = standInFor(tileId);
                    // A lone variant is often drawn over several cells — one
                    // tree filling a 2x2 block — so the stand-in may name a
                    // whole span of the sheet rather than a single tile. Taking
                    // only its first tile drew the top-left quarter of each
                    // tree, which on a hillside reads as a field of spikes.
                    const standId = typeof standIn === "object" ? standIn.tileId : standIn;
                    const spanX = (typeof standIn === "object" && standIn.w) || 1;
                    const spanY = (typeof standIn === "object" && standIn.h) || 1;
                    const found = this.sheetRectFor(standId, tileSize);
                    if (found) {
                        const placement = multiFoliagePlacement(
                            tileId, x, y, standId, spanX, spanY);
                        if (placement) {
                            if (!emittedFoliagePlacements.has(placement.key)) {
                                emittedFoliagePlacements.add(placement.key);
                                const placed = multiFoliagePlacements.get(placement.key);
                                const standSize = sheetSize(found.setNumber);
                                const base = placed && placed.parts.length
                                    ? Math.max(...placed.parts.map(part => surfaceAt(part.x, part.y)))
                                    : top;
                                const anchor = [
                                    placement.originX + spanX / 2,
                                    base,
                                    placement.originY + spanY / 2
                                ];
                                const painted = placed ? placed.parts : [];
                                const sourceParts = [];
                                for (let dr = 0; dr < spanY; dr++) {
                                    for (let dc = 0; dc < spanX; dc++) {
                                        const exact = painted.filter(part =>
                                            part.dc === dc && part.dr === dr);
                                        if (exact.length) {
                                            sourceParts.push(...exact);
                                            continue;
                                        }
                                        // A lone variant is a complete object
                                        // even where the repeating fill ends at
                                        // a ragged map edge. Complete its missing
                                        // texture quadrant in the nearest real
                                        // source group instead of drawing a
                                        // visibly sliced half-mountain.
                                        const nearest = painted.slice().sort((a, b) =>
                                            (Math.abs(a.dc - dc) + Math.abs(a.dr - dr))
                                            - (Math.abs(b.dc - dc) + Math.abs(b.dr - dr))
                                            || b.layer - a.layer)[0];
                                        if (nearest) sourceParts.push(Object.assign({}, nearest, { dc, dr }));
                                    }
                                }
                                // Every authored quadrant retains its own map
                                // layer and star pass. Together these subquads
                                // remain one shared billboard and one mountain.
                                for (const part of sourceParts) {
                                    const partRect = Object.assign({}, found, {
                                        sx: found.sx + part.dc * found.width,
                                        sy: found.sy + part.dr * found.height
                                    });
                                    const standGroup = groupFor(found.setNumber, true,
                                        part.above, false, part.layer);
                                    const x0 = part.dc - spanX / 2;
                                    const yTop = spanY - part.dr;
                                    billboardQuad(standGroup, anchor, [
                                        [x0, yTop],
                                        [x0 + 1, yTop],
                                        [x0 + 1, yTop - 1],
                                        [x0, yTop - 1]
                                    ], partRect, standSize);
                                    quadCount++;
                                }
                            }
                        } else {
                            const standGroup = groupFor(
                                found.setNumber, true, drawsAbove(tileId), false, mapLayer);
                            const standSize = sheetSize(found.setNumber);
                            const standParts = found.autotile
                                ? this.autotileQuads(standId, tileSize, tables)
                                : null;
                            const broad = 1;
                            const tall = foliageHeight;
                            // Several of them, each nudged off centre and sized
                            // differently so a wood does not expose the grid.
                            for (let n = 0; n < foliageDensity; n++) {
                                const scale = 1 + scatter(x, y, n * 3) * 0.5;
                                const wide = (broad * scale) / 2;
                                const high = tall * scale;
                                const room = Math.max(0, wide - 0.5);
                                const dx = (scatter(x, y, n * 3 + 1) - 0.5)
                                    * Math.min(foliageSpread, room * 2);
                                const dz = (scatter(x, y, n * 3 + 2) - 0.5)
                                    * foliageSpread;
                                const anchor = [x + 0.5 + dx, top, y + 0.5 + dz];
                                const half = high / 2;
                                const cutouts = standParts
                                    ? standParts.map(part => ({
                                        rect: part,
                                        x0: part.qx * wide - wide,
                                        x1: part.qx * wide,
                                        yTop: high - part.qy * half,
                                        yBot: high - (part.qy + 1) * half
                                    }))
                                    : [{ rect: found, x0: -wide, x1: wide, yTop: high, yBot: 0 }];
                                for (const cutout of cutouts) {
                                    billboardQuad(standGroup, anchor, [
                                        [cutout.x0, cutout.yTop],
                                        [cutout.x1, cutout.yTop],
                                        [cutout.x1, cutout.yBot],
                                        [cutout.x0, cutout.yBot]
                                    ], cutout.rect, standSize);
                                    quadCount++;
                                }
                            }
                        }
                    }
                    // The tiling art is the canopy seen from above, not the
                    // ground under it. Laying it flat as well shows as a mat of
                    // canopy at the foot of the trees standing on it, which is
                    // the join the whole model is trying to hide.
                    if (!foliageFloor) {
                        if (spanX === 1 && spanY === 1) continue;
                        // Large lone variants need their tiling art to close
                        // transparent gaps, but not as a second opaque mountain.
                        // A separate blended underlay contributes the authored
                        // colour without owning depth or overpowering shadows.
                        group = groupFor(
                            rect.setNumber, false, drawsAbove(tileId), true, mapLayer);
                    }
                }

                // Ground face(s), lying flat at this cell's elevation. An
                // autotile is four quarter-cells, because its shape picks four
                // corners out of the sheet rather than one whole picture.
                const quads = rect.autotile
                    ? this.autotileQuads(drawId, tileSize, tables)
                    : null;
                if (quads) {
                    for (const part of quads) {
                        const px = x + part.qx * 0.5;
                        const pz = y + part.qy * 0.5;
                        quad(group, [
                            [px, surface, pz],
                            [px + 0.5, surface, pz],
                            [px + 0.5, surface, pz + 0.5],
                            [px, surface, pz + 0.5]
                        ], part, size);
                        quadCount++;
                    }
                } else {
                    // North-west first: the quad's first corner takes the
                    // image's top-left texel, and a tile's top row belongs at
                    // the cell's north edge — winding it from the south flips
                    // every tile front-to-back on the ground.
                    quad(group, [
                        [x, surface, y],
                        [x + 1, surface, y],
                        [x + 1, surface, y + 1],
                        [x, surface, y + 1]
                    ], rect, size);
                    quadCount++;
                }
            }

            // A building's footprint gets no wall skirt: the facade already
            // stands there, and a second wall would z-fight with it.
            if (underFacade) continue;

            // A cliff face takes the *bottom* of the stack, not the top.
            //
            // The top of a cell is every layer drawn in order, and the topmost
            // is usually a decoration: grass over dirt, a tree over grass. Its
            // art is transparent everywhere the decoration is not, so using it
            // on a vertical face left the face see-through — a raised forest
            // stood on a rim of holes with the sky behind it. Layer zero is the
            // terrain, which is what the side of a step is made of.
            //
            // A wood is the exception: the step is the wood itself, so the face
            // wants the wood's art rather than the earth it grows out of.
            const foliageId = isFoliage ? stack.find(id => isFoliage(id)) : 0;
            const surfaceId = foliageId || stack[0];
            const surfaceRect = this.sheetRectFor(surfaceId, tileSize);
            if (!surfaceRect) continue;
            const surfaceLayer = groundLayers.find(entry => entry.tileId === surfaceId)?.layer || 0;
            const surfaceGroup = groupFor(surfaceRect.setNumber, false, false, false, surfaceLayer);
            const surfaceSize = sheetSize(surfaceRect.setNumber);
            const surfaceParts = surfaceRect.autotile
                ? this.autotileQuads(surfaceId, tileSize, tables)
                : null;

            // Walls, one per side whose neighbour sits lower. A cell outside the
            // map counts as elevation 0, so the map's rim is closed off rather
            // than floating.
            // `lx/ly` and `rx/ry` are the cells beyond this face's left and
            // right edges *as seen from outside it*, which is not the same as
            // west and east: the north face's left is the map's east. They
            // decide where a wall's end caps go.
            const neighbours = [
                { dx: 0, dy: 1, lx: -1, ly: 0, rx: 1, ry: 0,
                    corners: (a, b) => [[x, a, y + 1], [x + 1, a, y + 1], [x + 1, b, y + 1], [x, b, y + 1]] },
                { dx: 0, dy: -1, lx: 1, ly: 0, rx: -1, ry: 0,
                    corners: (a, b) => [[x + 1, a, y], [x, a, y], [x, b, y], [x + 1, b, y]] },
                { dx: -1, dy: 0, lx: 0, ly: -1, rx: 0, ry: 1,
                    corners: (a, b) => [[x, a, y], [x, a, y + 1], [x, b, y + 1], [x, b, y]] },
                { dx: 1, dy: 0, lx: 0, ly: 1, rx: 0, ry: -1,
                    corners: (a, b) => [[x + 1, a, y + 1], [x + 1, a, y], [x + 1, b, y], [x + 1, b, y + 1]] }
            ];
            const wallId = wallTileAt(x, y);
            for (const side of neighbours) {
                const nx = x + side.dx;
                const ny = y + side.dy;
                const outside = nx < 0 || ny < 0 || nx >= width || ny >= height;
                const neighbourTop = outside ? 0 : surfaceAt(nx, ny);
                if (neighbourTop >= top) continue;
                // A wall knows what its own sides look like; anything else —
                // a cliff, a step, a raised wood — takes the terrain art of
                // the cell it belongs to, stretched over the drop.
                if (wallId) {
                    quadCount += wallFaceStack(side, x, y, top, neighbourTop, wallId);
                    continue;
                }
                quadCount += faceQuads(surfaceGroup, side.corners(top, neighbourTop),
                    surfaceRect, surfaceSize, surfaceParts);
            }
        }
    }

    // Typed arrays so the caller can hand them straight to BufferAttribute.
    const built = Array.from(groups.values()).filter(group => group.vertexCount > 0).map(group => ({
        setNumber: group.setNumber,
        billboard: group.billboard,
        // Which pass this belongs to: the ground, or the part drawn over the
        // characters so they can walk behind it.
        above: group.above,
        // A faint flat fill beneath a multi-cell foliage stand-in. It closes
        // the lone variant's transparent gaps without becoming a second opaque
        // copy of the mountain or taking depth from its soft shadows.
        underlay: group.underlay,
        // Declared standing art planted on the north edge of a flat footing is
        // already at its visible base; the billboard shader must not move it a
        // second half-cell towards the camera.
        edgeHinged: group.edgeHinged,
        // Original map plane. Transparent coplanar cut-outs use this as their
        // final tie-breaker, matching the 2D layer stack after depth has done
        // the real 3D occlusion work.
        layer: group.layer,
        // Billboards keep their anchor in `positions` and their corner in
        // `offsets`; the shader combines the two per frame.
        offsets: group.billboard ? Float32Array.from(group.offsets) : null,
        positions: Float32Array.from(group.positions),
        uvs: Float32Array.from(group.uvs),
        // What each quad may sample, so the shader can refuse to stray out of
        // its own tile however few pixels the tile has been shrunk to.
        bounds: Float32Array.from(group.bounds),
        // Only animated groups carry the stride; the rest would be all zeroes.
        anim: group.animated ? Float32Array.from(group.anim) : null,
        // 16-bit indices top out at 65535 vertices, which a large map passes.
        indices: group.vertexCount > 65535
            ? Uint32Array.from(group.indices)
            : Uint16Array.from(group.indices)
    }));

    // The height of every cell's surface, kept so that things drawn *over* the
    // scene — characters, events, the animations played on them — can stand on
    // what was built rather than on the flat ground beneath it.
    const surface = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) surface[y * width + x] = surfaceAt(x, y);
    }

    return {
        groups: built, quads: quadCount, surface, width, height,
        facade: { onFacade, z: facadeZ, y: facadeY, lift: facadeLift }
    };
};

//-----------------------------------------------------------------------------
// Tile classification
//
// Which tiles stand up and which lie flat cannot be derived from map data: a
// shopfront wall and a cliff edge are both simply impassable, so any heuristic
// over 2D flags sweeps up terrain along with buildings — on Moletown it
// produced facades fifty-one tiles tall. Classification is therefore authored,
// per tileset rather than per map, since tilesets are shared and a tile is the
// same kind of thing wherever it is painted.
//
// Stored beside the database as `Tilesets.r3d.json`, keyed by tileset id. A
// project without one behaves exactly as before.

Reactor3D.CLASS_AUTO = 0;      // fall back to the heuristic
Reactor3D.CLASS_GROUND = 1;    // always lies flat
Reactor3D.CLASS_UPRIGHT = 2;   // part of a standing object
Reactor3D.CLASS_SCENERY = 3;   // raises the ground it sits on
Reactor3D.CLASS_FOLIAGE = 4;   // a cut-out per cell, over ground that stays flat
Reactor3D.CLASS_PANEL = 5;     // stands still, faces a way, has a little depth

/**
 * The shape of a terrain painted as a single isolated cell.
 *
 * An autotile's 48 shapes are corner arrangements, and shape 46 is the one with
 * no neighbours at all — what the tileset draws for one lone cell of that
 * terrain. For a forest that is a single tree, for a range a single peak. It is
 * the picture the artist drew of the thing itself rather than of its inside,
 * which is exactly what a cut-out needs, and it costs nothing to author.
 */
Reactor3D.LONE_SHAPE = 46;

/*
 * Upright and scenery are both "stands up", and the difference is what the
 * tiles mean together. A building is one picture spanning a column of cells, so
 * its cells collapse into a single facade as tall as the run — Moletown draws
 * towers fifty tiles high that way. A forest or a mountain range is the same
 * tile repeated across an area; collapsing that gives a fifty-tile wall of
 * trees instead of fifty trees. Scenery therefore stands per cell, one tile
 * tall, and the ground still draws underneath it.
 */

Reactor3D.CLASSIFICATION_FILE = "Tilesets.r3d.json";

/**
 * A facade taller than this is treated as terrain instead.
 *
 * Buildings are bounded; a run spanning a third of the map is a cliff face or a
 * map-edge wall that happens to share the impassable flag. The cap keeps the
 * automatic guess from producing towers while an author has yet to classify a
 * tileset, and never overrides an explicit UPRIGHT.
 */
Reactor3D.AUTO_MAX_FACADE = 8;

Reactor3D._classification = null;

Reactor3D.setClassification = function(data) {
    this._classification = data || null;
};

Reactor3D.classification = function() {
    return this._classification;
};

/**
 * The id a class is stored under.
 *
 * Autotiles occupy 48 consecutive ids — one per shape — but a shape is a corner
 * arrangement, not a different kind of thing: a wall is a wall whichever of its
 * corners are joined. So a kind is classified once, at its base id, and every
 * shape reads that entry. (Flags are an MZ format and are still mirrored across
 * all 48; this file is ours, and keeping one entry per kind holds it to a few
 * hundred lines instead of tens of thousands.)
 */
Reactor3D.classKey = function(tileId) {
    if (tileId >= 2048 && tileId < 8192) {
        return 2048 + Math.floor((tileId - 2048) / 48) * 48;
    }
    return tileId;
};

/** How a tile behaves in 3D: explicit if classified, otherwise AUTO. */
Reactor3D.tileClass = function(tilesetId, tileId) {
    const all = this._classification;
    const forTileset = all && all.tilesets && all.tilesets[tilesetId];
    const value = forTileset && forTileset[this.classKey(tileId)];
    return value === this.CLASS_GROUND || value === this.CLASS_UPRIGHT
        || value === this.CLASS_SCENERY || value === this.CLASS_FOLIAGE
        || value === this.CLASS_PANEL
        ? value
        : this.CLASS_AUTO;
};

/**
 * The tile whose art covers the top of a raised wall.
 *
 * A wall autotile is a picture of a wall *face*: it has no top, so a wall
 * raised into a mass was capped with its own side art, which reads as a
 * building wearing its front as a hat. The roof is named in the classification
 * file where an author has said so, and derived from the sheet layout where A4
 * guarantees the pairing. Returns 0 when neither applies, and the caller then
 * leaves the tile alone rather than inventing one.
 */
Reactor3D.topFaceFor = function(tilesetId, tileId) {
    const base = this.Geometry.autotileBase(tileId);
    const all = this._classification;
    const forTileset = all && all.materials && all.materials[tilesetId];
    const entry = forTileset && forTileset[base];
    const named = entry && entry.top;
    if (named > 0) return this.Geometry.autotileBase(named);
    return this.Geometry.roofForWall(base);
};

/**
 * The tile a foliage cut-out takes its picture from.
 *
 * An autotile answers for itself — shape 46 of its own kind. Anything else has
 * to be pointed at its lone variant, because a B-E sheet has no rule about
 * where one sits relative to the tiling art; `standIns` in the classification
 * file records that, and a tile with no entry stands its own art up, which is
 * at least the tile the author painted.
 */
Reactor3D.standInFor = function(tilesetId, tileId) {
    if (tileId >= 2048 && tileId < 8192) return this.classKey(tileId) + this.LONE_SHAPE;
    const all = this._classification;
    const forTileset = all && all.standIns && all.standIns[tilesetId];
    const value = forTileset && forTileset[tileId];
    // Stored as [top-left tile, width, height] in tiles, since a lone variant
    // is usually drawn larger than the tile it stands in for.
    if (Array.isArray(value) && value[0] > 0) {
        return { tileId: value[0], w: value[1] || 1, h: value[2] || 1 };
    }
    return value > 0 ? value : tileId;
};

/*
 * Declared objects: "these tiles are one thing", and per tile, "this is how it
 * behaves inside that thing".
 *
 * Inferring the extent of an object from sheet adjacency cannot tell the last
 * piece of one picture from the first piece of the next — an ice mountain in
 * sheet columns 0-1 beside a rock mountain in columns 2-3, painted side by
 * side, welds into one four-wide object — and it says nothing at all about
 * autotile terrain. So it is declared, as a rectangle of the sheet with a role
 * per cell: S stands as part of the picture, F lies flat on the ground.
 */
Reactor3D.ROLE_STAND = "S";
Reactor3D.ROLE_FLAT = "F";

/** Where a B-E tile sits on its sheet, in whole tiles. */
Reactor3D.sheetCell = function(tileId) {
    // A5 lives on the A tab but is not an autotile: whole tiles, eight to a
    // row, exactly like B-G.
    if (tileId >= 1536 && tileId < 2048) {
        const local = tileId - 1536;
        return { setNumber: 4, col: local % 8, row: Math.floor(local / 8) };
    }
    const local = tileId % 256;
    return {
        setNumber: 5 + Math.floor(tileId / 256),
        col: (Math.floor(local / 128) % 2) * 8 + (local % 8),
        row: Math.floor((local % 256) / 8) % 16
    };
};

/** Tiles laid out as a plain grid of pictures: B-G and A5, but not A1-A4. */
Reactor3D.isPictureTile = function(tileId) {
    return tileId > 0 && tileId < 2048;
};

/**
 * The declared object a tile belongs to, and where it sits inside it.
 *
 * Returns `{ object, dc, dr, role }` or null. Autotiles never match: their id
 * encodes a corner arrangement rather than a position in a drawing.
 */
Reactor3D.objectAt = function(tilesetId, tileId) {
    if (!this.isPictureTile(tileId)) return null;
    const all = this._classification;
    const list = all && all.objects && all.objects[tilesetId];
    if (!list || !list.length) return null;
    const here = this.sheetCell(tileId);
    for (const object of list) {
        const origin = this.sheetCell(object.tile);
        if (origin.setNumber !== here.setNumber) continue;
        const dc = here.col - origin.col;
        const dr = here.row - origin.row;
        if (dc < 0 || dr < 0 || dc >= object.w || dr >= object.h) continue;
        const roles = object.roles || "";
        const role = roles[dr * object.w + dc] === this.ROLE_FLAT
            ? this.ROLE_FLAT : this.ROLE_STAND;
        return { object, dc, dr, role };
    }
    return null;
};

/** How a tile behaves inside its object; standing for anything unattached. */
Reactor3D.tileRole = function(tilesetId, tileId) {
    const found = this.objectAt(tilesetId, tileId);
    return found ? found.role : this.ROLE_STAND;
};

/** Tiles that draw as a cut-out per cell over ground that stays flat. */
Reactor3D.foliagePredicate = function(tilesetId) {
    return tileId => this.tileClass(tilesetId, tileId) === this.CLASS_FOLIAGE;
};

/** Tiles that stand still and face a direction. */
Reactor3D.panelPredicate = function(tilesetId) {
    return tileId => this.tileClass(tilesetId, tileId) === this.CLASS_PANEL;
};

/**
 * The predicate the geometry builder uses.
 *
 * An explicit class always wins. Where a tile is unclassified the flags supply
 * a guess — impassable or draws-above-characters — which is what lets a map
 * that has never been touched show something recognisable.
 */
/**
 * Tiles the 2D tilemap draws *above* characters — the star flag.
 *
 * In 2D this is what lets a character walk behind a tree or through a doorway:
 * the tilemap draws those tiles in its upper layer, over the sprites. In 3D the
 * ground is one picture behind every sprite, so nothing could ever be in front
 * of anyone and a character walked over the front of everything.
 *
 * Bit 0x10 is the flag, read the way the tilemap reads it.
 */
Reactor3D.abovePredicate = function(flags) {
    if (!flags) return null;
    return tileId => !!(flags[tileId] & 0x10);
};

Reactor3D.uprightPredicate = function(tilesetId, flags, options) {
    // Guessing is off by default. The flag heuristic was meant to let an
    // unclassified map show something recognisable, but "impassable or draws
    // above characters" covers a great deal of ordinary terrain: on a world map
    // it stood mountains and forests on end, and since a facade is one plane at
    // its run's southern edge, everything behind that plane vanished. The
    // result was scenery the author never placed and scenery they did place
    // going missing. A map with no classification now renders flat, which is at
    // least the map they drew.
    const guess = !!(options && options.guess) && !!flags;
    return tileId => {
        // A role beats a class: inside a declared object the author has said
        // which parts meet the ground, and a launch pad stays on the floor
        // however its tiles are flagged.
        if (this.tileRole(tilesetId, tileId) === this.ROLE_FLAT) return false;
        const explicit = this.tileClass(tilesetId, tileId);
        if (explicit === this.CLASS_UPRIGHT) return true;
        // Any other explicit class settles it. Falling through to the guess
        // here let a scenery tile join a facade as well as standing on its own
        // cell, so a forest was both dotted across the ground and welded into a
        // wall behind itself.
        if (explicit !== this.CLASS_AUTO) return false;
        if (!guess) return false;
        const flag = flags[tileId] || 0;
        return (flag & 0x10) !== 0 || (flag & 0x0f) === 0x0f;
    };
};

/**
 * Tiles that stand on their own cell rather than joining a facade.
 *
 * Never guessed: there is nothing in the 2D flags that distinguishes a forest
 * from a shopfront, which is the whole reason classification is authored.
 */
Reactor3D.sceneryPredicate = function(tilesetId) {
    return tileId => this.tileClass(tilesetId, tileId) === this.CLASS_SCENERY;
};

/** True where a tile has been classified rather than guessed. */
Reactor3D.isClassified = function(tilesetId, tileId) {
    return this.tileClass(tilesetId, tileId) !== this.CLASS_AUTO;
};

/** An empty classification file, ready to be filled in by the editor. */
Reactor3D.createClassification = function() {
    return { version: 1, tilesets: {} };
};

Reactor3D._classificationPromise = null;

/**
 * Fetch the classification file once per session.
 *
 * Only a 3D map asks for it, so a 2D project issues no extra request. A missing
 * file is the ordinary state rather than an error: every tile then falls back
 * to the flag heuristic, which is what an unclassified project already gets.
 */
Reactor3D.loadClassification = function() {
    if (this._classificationPromise) return this._classificationPromise;
    if (typeof XMLHttpRequest === "undefined") return Promise.resolve();

    this._classificationPromise = new Promise(resolve => {
        const url = "data/" + this.CLASSIFICATION_FILE;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.overrideMimeType("application/json");
        xhr.onload = () => {
            if (xhr.status < 400) {
                try {
                    this.setClassification(JSON.parse(xhr.responseText));
                } catch (e) {
                    console.error(`Reactor3D: ${this.CLASSIFICATION_FILE} is not valid JSON.`, e);
                }
            }
            resolve();
        };
        xhr.onerror = () => resolve();
        xhr.send();
    });
    return this._classificationPromise;
};

//-----------------------------------------------------------------------------
// Reactor3D.MapScene
//
// A three.js scene built from one map. Meshes are grouped by tileset sheet, so
// the whole ground is a handful of draw calls however large the map.

/**
 * The world point a standing place actually resolves to.
 *
 * The lift runs along the billboard's up axis, not the world's, because that
 * is how the courses of a cut-out are stacked. Anything that wants to sit
 * against the art has to travel the same way to get there.
 */
Reactor3D.pointOf = function(camera, x, stand) {
    const up = this.billboardUp(camera);
    const lift = stand.lift || 0;
    // Standing on the art means standing where the art is. The shader steps
    // every cut-out half a cell towards the camera, so a sprite placed without
    // that step is half a cell further away than the picture it belongs to —
    // and under a pitched camera "further away" reads as "higher up the
    // screen". A sign on a shopfront floated half a tile above its own board.
    const step = stand.onArt ? this.footward(camera) : null;
    return {
        x: x + up.x * lift + (step ? step.x : 0),
        y: stand.height + up.y * lift,
        z: stand.z + up.z * lift + (step ? step.z : 0)
    };
};

/**
 * Half a cell towards the camera, along the ground.
 *
 * The same step the billboard shader takes, and for the same reason: a thing
 * standing on a cell fills it front to back, and what the eye reads as "where
 * it stands" is the near edge of that circle rather than its centre. Kept
 * horizontal, so it moves a sprite nearer without lifting it.
 */
Reactor3D.footward = function(camera) {
    // Read straight off the camera's own matrix, which is where the shader
    // reads it: the third column is the axis pointing back towards the camera.
    // No THREE.Vector3, so this is a plain calculation that can be checked
    // without a renderer — and one fewer allocation per sprite per frame.
    const m = camera && camera.matrixWorld && camera.matrixWorld.elements;
    if (!m) return null;
    const x = m[8];
    const z = m[10];
    // Flattened onto the ground, so it moves a sprite nearer without lifting
    // it. An overhead camera has no horizontal direction to step along and
    // needs none: nothing is foreshortened when it is looked at square on.
    const reach = Math.hypot(x, z);
    if (!(reach > 0.0001)) return null;
    const scale = 0.5 / reach;
    return { x: x * scale, y: 0, z: z * scale };
};

/** The up axis a cut-out is built on: world up, leaned by the tilt. */
Reactor3D.billboardUp = function(camera) {
    // One shared vector: asked twice per character sprite per frame, and
    // every caller reads it on the spot. Nobody keeps it.
    const up = (this._billboardUpScratch || (this._billboardUpScratch = new THREE.Vector3())).set(0, 1, 0);
    if (camera && this.BILLBOARD_TILT) {
        const leaning = (this._billboardLeanScratch || (this._billboardLeanScratch = new THREE.Vector3()))
            .set(0, 1, 0).applyQuaternion(camera.quaternion);
        up.lerp(leaning, this.BILLBOARD_TILT).normalize();
    }
    return up;
};

/**
 * Where in the world a character is standing, for drawing purposes.
 *
 * Normally the southern edge of its own cell at ground level — `screenY` in 2D
 * is `scrolledY * tileHeight + tileHeight`, so a character's feet are on the
 * bottom edge of the tile it stands on, and props are planted the same way.
 *
 * But a cell whose art was stood into a wall is no longer where the map says
 * it is: its picture has moved onto a vertical plane at the wall's footing,
 * some courses up. A sign hanging on that wall has to move with it. Left on
 * the ground it sat at the wrong height *and* the wrong depth, and the depth
 * is what made it slide against its own wall as the camera panned — two
 * surfaces at different distances do not move together.
 *
 * Only things that stay put are put on the wall. A character crossing in front
 * of a building is standing on the street, whatever the cell behind it was
 * turned into.
 */
Reactor3D.standingPlaceFor = function(character) {
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const x = Math.round(character._realX);
    const y = Math.round(character._realY);
    // The middle of the cell, which is where the cell is — the same place a
    // prop standing on it is anchored. RPG Maker draws a sprite's feet on the
    // bottom edge of its cell, and that is a 2D screen convention rather than
    // a world position; taking it literally put every character half a tile
    // south of the square it occupies, which is invisible head-on and swings
    // into view as the camera comes round.
    const ground = { height: this.elevationAt(map, x, y) + (character._reactorLift || 0), z: character._realY + 0.5, lift: 0 };
    if (typeof character.eventId !== "function") return ground;
    if (character.isMoving && character.isMoving()) return ground;

    /*
     * A route only disqualifies an event that actually goes somewhere.
     *
     * Pinning a walking event to a wall would carry it up the facade as it
     * crossed the cell, so having a move route used to rule the facade out
     * flatly. But most routes on scenery do not walk: they turn, wait, toggle
     * a switch, or play a step animation, and the event stands exactly where
     * the author put it for the whole game.
     *
     * The cap on a building is one of those — a custom route that never
     * leaves its cell — and the flat rule left it on the ground while the
     * building it belongs to stood up without it.
     *
     * So the question is not whether the event has a route but whether it has
     * left home. An event still on its own square belongs to whatever was
     * built there; one that has walked off does not, and drops to the ground
     * the moment it moves.
     */
    const data = typeof character.event === "function" ? character.event() : null;

    // Said outright by the author, and so believed outright: an event that has
    // asked to stand on the ground stands on it even where a building was
    // painted over its cell.
    if (data && this.eventStaysOnGround(data.note)) return ground;

    const page = character.page && character.page();
    if (page && page.moveType) {
        if (!data || x !== data.x || y !== data.y) return ground;
    }

    const facade = this.facadeAt(x, y);
    // `onArt` because this is no longer a thing standing on the ground: its
    // picture has moved onto a cut-out, and it has to be placed the way a
    // cut-out is placed.
    return facade
        ? { height: facade.height + (character._reactorLift || 0), z: facade.z, lift: facade.lift, onArt: true }
        : ground;
};

/**
 * Where a cell's art was stood up, if it was.
 *
 * Returns `{ z, height }` — the depth of the wall plane and how far up it the
 * cell sits — or null for a cell that stayed on the ground. Anything drawn
 * over the scene at a cell has to ask this, because the art it is standing
 * against may no longer be where the map says the cell is.
 */
Reactor3D.facadeAt = function(x, y) {
    return this.facadeIn(this._facade, x, y);
};

/**
 * The same question against a particular table.
 *
 * The running game has one map and keeps its facade on `Reactor3D`, but the
 * editor holds a scene of its own and has to ask about that one — its 3D view
 * has to stand an event against the same wall the game will.
 */
Reactor3D.facadeIn = function(facade, x, y) {
    if (!facade || x < 0 || y < 0 || x >= facade.width || y >= facade.height) return null;
    const at = y * facade.width + x;
    if (!facade.onFacade[at]) return null;
    // `height` is the wall's footing; `lift` is how far up it this cell sits,
    // measured along the billboard's up axis rather than the world's.
    return { z: facade.z[at], height: facade.y[at], lift: facade.lift[at] };
};

/**
 * The height of the surface a character standing on this cell rests on.
 *
 * Elevation says how high the *ground* is; it says nothing about a shop with a
 * raised roof, a plinth, or a rise of scenery. An event standing on a shop's
 * roof was therefore projected at street level while its roof was drawn three
 * tiles up, and because a perspective camera moves a raised point differently
 * from a ground one, the sign did not merely sit low — it slid sideways and
 * vertically against its own roof as the view moved.
 *
 * The build records what every cell's surface came out at; this reads it back.
 * Falls through to plain elevation before a scene exists, and for a flat cell
 * the two are the same number, so ordinary ground is untouched.
 */
Reactor3D.surfaceHeightAt = function(mapData, x, y) {
    const surface = this._surface;
    if (surface && x >= 0 && y >= 0 && x < surface.width && y < surface.height) {
        const value = surface.heights[y * surface.width + x];
        if (Number.isFinite(value)) return value;
    }
    return this.elevationAt(mapData, x, y);
};

/**
 * Everything about where one event is being drawn, in one line of console.
 *
 * Placing a flat sprite over a 3D world has several independent ways of going
 * subtly wrong — the cell it reads, the height it projects at, the camera it
 * projects through, the scale it lands at, whether the tile under it was built
 * as geometry — and from a screenshot they all look identical: the thing is in
 * the wrong place. This reports all of them together so the wrong one can be
 * picked out rather than guessed at.
 *
 * Call `Reactor3D.probeEvent(12)` in the console, or `Reactor3D.probeEvent()`
 * for the player.
 */
Reactor3D.probeEvent = function(eventId) {
    if (typeof $gameMap === "undefined" || !$gameMap) return "no map";
    const character = eventId === undefined || eventId === null
        ? $gamePlayer
        : $gameMap.event(eventId);
    if (!character) return `no event ${eventId}`;

    const viewport = this.viewport();
    const camera = viewport && viewport.camera();
    const x = character._realX;
    const y = character._realY;
    const cx = Math.round(x);
    const cy = Math.round(y);

    // The tile stack under it, and what each tile was classified as: this is
    // what decides whether the cell was built as standing geometry.
    const tilesetId = this.currentTilesetId();
    const stack = [];
    if ($dataMap && Array.isArray($dataMap.data)) {
        const plane = $dataMap.width * $dataMap.height;
        for (let z = 0; z < 4; z++) {
            const tileId = $dataMap.data[z * plane + cy * $dataMap.width + cx] || 0;
            if (tileId) {
                stack.push({
                    z, tileId,
                    class: this.tileClass(tilesetId, tileId),
                    classified: this.isClassified(tilesetId, tileId),
                    star: !!(this.currentFlags()[tileId] & 0x10)
                });
            }
        }
    }

    const sprite = (SceneManager._scene && SceneManager._scene._spriteset
        && (SceneManager._scene._spriteset._characterSprites || [])
            .find(each => each._character === character)) || null;

    const ground = this.elevationAt($dataMap, cx, cy);
    const surface = this.surfaceHeightAt($dataMap, cx, cy);
    const at = height => {
        const point = camera ? this.projectToScreen(camera, x + 0.5, height, y + 1) : null;
        return point ? { x: Math.round(point.x), y: Math.round(point.y) } : null;
    };

    return {
        event: eventId === undefined ? "player" : eventId,
        cell: { x, y, rounded: [cx, cy] },
        // A tile graphic means the event may have been built into the scene as
        // a prop instead of drawn as a sprite.
        tileGraphic: (character._tileId || 0) || null,
        isProp: this.isEventProp(character.eventId ? character.eventId() : -1),
        heights: { ground, surface },
        projected: { atGround: at(ground), atSurface: at(surface) },
        sprite: sprite
            ? {
                x: Math.round(sprite.x), y: Math.round(sprite.y),
                scale: Number(sprite.scale.x.toFixed(3)),
                visible: sprite.visible, z: sprite.z,
                anchor: sprite.anchor ? [sprite.anchor.x, sprite.anchor.y] : null,
                height: sprite.height
            }
            : "no sprite found",
        camera: camera
            ? {
                position: ["x", "y", "z"].map(k => Number(camera.position[k].toFixed(3))),
                fov: camera.fov
            }
            : "no camera",
        focus: $gamePlayer ? [$gamePlayer._realX, $gamePlayer._realY] : null,
        // Where the builder put the standing art for this same cell, so the two
        // can be compared directly instead of eyeballed against a screenshot.
        prop: (() => {
            const declared = this.objectAt(tilesetId, (stack[stack.length - 1] || {}).tileId);
            if (!declared) return null;
            const object = declared.object;
            const centreX = cx + 0.5;
            const centreZ = cy + 0.5;
            const point = camera
                ? this.projectToScreen(camera, centreX, surface, centreZ) : null;
            return {
                object: { tile: object.tile, w: object.w, h: object.h },
                anchor: [centreX, surface, centreZ],
                screen: point ? { x: Math.round(point.x), y: Math.round(point.y) } : null
            };
        })(),
        scale: (() => {
            const stand = camera ? this.standScaleAt(camera, x + 0.5, ground, y + 1) : null;
            return {
                stand: stand
                    ? { x: Number(stand.x.toFixed(3)), y: Number(stand.y.toFixed(3)) }
                    : null,
                billboard: camera
                    ? Number(this.screenScaleAt(camera, x + 0.5, ground, y + 1).toFixed(3))
                    : null
            };
        })(),
        tiles: stack,
        graphicsHeight: typeof Graphics !== "undefined" ? Graphics.height : null,
        tileSize: this.currentTileSize()
    };
};

/**
 * The tiles that events put on the map.
 *
 * A door, a sign, a chest, a barrel — an enormous amount of what an author
 * actually stands up is placed as an event with a tile graphic rather than
 * painted into a layer. The scene is built from `mapData.data`, which those
 * tiles are not in, so they stayed resolutely flat while the identical tile
 * painted one cell over stood up properly. That is the whole of the "3D
 * objects work but doors and signs look 2D" split: it was never about sprites.
 *
 * Read from the map data rather than `$gameMap`, because the scene is built
 * before the interpreter is set up and `$gameMap` has nothing to say yet. The
 * first page carrying a tile is the one taken, which is right for the static props
 * this is for and is why moving events are left out below.
 */
Reactor3D.eventTiles = function(mapData) {
    const found = [];
    if (!mapData || !Array.isArray(mapData.events)) return found;
    for (const event of mapData.events) {
        if (!event || !Array.isArray(event.pages)) continue;
        // Anything that walks keeps its sprite: a prop is baked into the scene
        // at build time and cannot follow an event around, so an event that
        // moves would leave its 3D self behind and travel as an invisible
        // ghost. Props do not move; that is what makes them props.
        if (event.pages.some(page => page && page.moveType)) continue;
        for (const page of event.pages) {
            const tileId = page && page.image && page.image.tileId;
            if (!tileId) continue;
            // The note travels with it: whether this becomes part of the map
            // is the author's to say, and this is the only place it is asked.
            found.push({ id: event.id, x: event.x, y: event.y, tileId, note: event.note });
            break;
        }
    }
    return found;
};

/**
 * The map, with those tiles written into it.
 *
 * Injecting them into a copy of the tile data means they go through exactly
 * the same classification, geometry and lighting as a painted tile — an event
 * door is the same box as a painted one, with no second code path to keep in
 * step. The copy is shallow apart from `data`, and the original is never
 * touched, so the map RPG Maker and every plugin sees is unchanged.
 *
 * Only tiles the author has classified as standing are taken. An unclassified
 * or flat one is left as the sprite it always was, so this can never quietly
 * change how an existing map looks.
 */
/**
 * How an event with a character-sheet graphic should stand in 3D.
 *
 * An event whose graphic is a *tile* already inherits that tile's 3D class —
 * `mapWithEventTiles` writes it into the map before any geometry is built, so
 * a shopfront placed as an event is a shopfront. An event drawn from a
 * character sheet has no tile to inherit from and no way to say what it is, so
 * it says so in its own note, beside the `<3d>` that makes a map 3D at all:
 *
 *   <3d panel>          a plane that stands still and faces the default view
 *   <3d panel east>     a plane facing the direction named
 *   <3d upright>        a cut-out that does not turn with the camera
 *   <3d flat>           lying on the ground
 *
 * No note means what it has always meant: a cut-out that turns to face the
 * camera, which is right for anything a character-shaped, and wrong for an
 * animated piece of a city that ought to sit in the world with the painted
 * buildings beside it.
 *
 * Returns null when the note asks for nothing, so a caller can tell "no
 * opinion" from "explicitly a billboard".
 */
Reactor3D.eventShapeFromNote = function(note) {
    if (typeof note !== "string" || !note) return null;
    const found = /<3d\s+(panel|upright|flat)(?:\s+(north|south|east|west))?\s*>/i.exec(note);
    if (!found) return null;
    return {
        shape: found[1].toLowerCase(),
        // Stated or not; a panel with no direction faces the way the map is
        // first shown, which is what an author drawing a facade expects.
        facing: (found[2] || "south").toLowerCase()
    };
};

/**
 * Whether an event refuses to join whatever is built at its cell.
 *
 *   <3d ground>        stand on the ground, never on the object at this cell
 *   <no 3d object>     the same thing said the other way round
 *
 * Painting a group on the map takes everything standing on those cells and
 * makes it one object, which is exactly right for the things that *are* the
 * building: an animated sign, a lit window, a swinging shop door. They ride the
 * building's plane, so they hold still against it as the camera comes round,
 * which is the whole reason grouping exists.
 *
 * It is wrong for anything merely passing through. A character walking behind a
 * shop crosses its cells, and the moment they stop walking they are pinned to
 * the shopfront and carried up it — because "is this part of the building?" and
 * "is this standing on the building's square?" are the same question to
 * everything except the author.
 *
 * So the author answers it. Only for the exceptions: a townsperson who walks is
 * already excluded by having left home, and the tag is for the ones that stand
 * still somewhere a building was painted.
 */
Reactor3D.eventStaysOnGround = function(note) {
    if (typeof note !== "string" || !note) return false;
    return /<\s*3d\s+ground\s*>/i.test(note) || /<\s*no\s+3d\s+object\s*>/i.test(note);
};

/** The turn about the vertical axis that points a plane the named way. */
Reactor3D.facingRotation = function(facing) {
    const turns = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 };
    const asked = turns[String(facing || "south").toLowerCase()];
    return asked === undefined ? 0 : asked;
};

Reactor3D.mapWithEventTiles = function(mapData, tilesetId) {
    Reactor3D._eventProps = null;
    if (!mapData || !Array.isArray(mapData.data)) return mapData;

    const isUpright = this.uprightPredicate(tilesetId);
    const candidates = this.eventTiles(mapData).filter(tile =>
        // An event that has said it stands on the ground is not written into
        // the map as a standing prop either. The tag means one thing — "I am
        // not part of what is built here" — and it would be a poor sort of
        // exemption that applied to the building beside it and not to the
        // building it was about to become.
        !this.eventStaysOnGround(tile.note)
        && this.isClassified(tilesetId, tile.tileId) && isUpright(tile.tileId));
    if (!candidates.length) return mapData;

    const { width, height } = mapData;
    const plane = width * height;
    const data = Array.isArray(mapData.data) ? mapData.data.slice() : mapData.data;
    const claimed = new Set();

    for (const tile of candidates) {
        if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) continue;
        const cell = tile.y * width + tile.x;
        // The first free tile layer over that cell. A prop that would have to
        // overwrite painted art is skipped rather than allowed to erase it.
        let placed = false;
        for (let z = 0; z < 4; z++) {
            if (data[z * plane + cell]) continue;
            data[z * plane + cell] = tile.tileId;
            placed = true;
            break;
        }
        if (placed) claimed.add(tile.id);
    }
    if (!claimed.size) return mapData;

    Reactor3D._eventProps = claimed;
    return Object.assign(Object.create(Object.getPrototypeOf(mapData) || Object.prototype),
        mapData, { data });
};

/**
 * Whether this event is now standing in the scene, and so must not also be
 * drawn flat over it — otherwise a door appears twice, once lying down.
 */
Reactor3D.isEventProp = function(eventId) {
    return !!(this._eventProps && this._eventProps.has(eventId));
};

Reactor3D.MapScene = function() {
    this.initialize(...arguments);
};

Reactor3D.MapScene.prototype.initialize = function(mapData, bitmaps, options) {
    this._scene = new THREE.Scene();
    this._materials = [];
    this._meshes = [];
    this._textures = [];
    this._animated = [];
    this._frame = -1;
    this.build(mapData, bitmaps, options);
};

/**
 * Show an animation frame of the A1 water and waterfalls.
 *
 * The frames live side by side in the same sheet, so this slides UVs rather
 * than rebuilding anything: a 200x200 map animates without touching its
 * geometry. Matches `Tilemap._drawAutotile` — the still surface cycles
 * 0,1,2,1 and a waterfall runs 0,1,2.
 */
/**
 * Where this scene stood a cell's art up, if it did.
 *
 * See `Reactor3D.facadeAt` — this is the same answer for a scene held on its
 * own rather than for the map the game is running.
 */
Reactor3D.MapScene.prototype.facadeAt = function(x, y) {
    return Reactor3D.facadeIn(this._facade, x, y);
};

Reactor3D.MapScene.prototype.setAnimationFrame = function(frame) {
    const next = Math.floor(frame) || 0;
    if (next === this._frame || !this._animated || !this._animated.length) return;
    this._frame = next;

    const surface = [0, 1, 2, 1][((next % 4) + 4) % 4];
    const waterfall = ((next % 3) + 3) % 3;
    for (const entry of this._animated) {
        const uv = entry.geometry.getAttribute("uv");
        const bounds = entry.geometry.getAttribute("uvBounds");
        for (let i = 0; i < entry.base.length; i += 2) {
            const du = entry.stride[i];
            const dv = entry.stride[i + 1];
            const offsetU = du * surface;
            const offsetV = dv * waterfall;
            uv.array[i] = entry.base[i] + offsetU;
            uv.array[i + 1] = entry.base[i + 1] + offsetV;
            if (bounds && entry.baseBounds) {
                const at = (i / 2) * 4;
                bounds.array[at] = entry.baseBounds[at] + offsetU;
                bounds.array[at + 1] = entry.baseBounds[at + 1] + offsetV;
                bounds.array[at + 2] = entry.baseBounds[at + 2] + offsetU;
                bounds.array[at + 3] = entry.baseBounds[at + 3] + offsetV;
            }
        }
        uv.needsUpdate = true;
        if (bounds) bounds.needsUpdate = true;
    }
};

/**
 * What actually got built, for when the view comes up empty.
 *
 * An empty 3D canvas has several causes that look identical on screen — no
 * meshes, no textures, a camera pointing somewhere else — and none of them
 * raise an error. The counts tell them apart in one line.
 */
Reactor3D.MapScene.prototype.report = function() {
    return {
        meshes: this._meshes.length,
        textures: this._textures.length,
        children: this._scene ? this._scene.children.length : 0
    };
};

/**
 * The world-space box the built geometry occupies.
 *
 * Paired with the camera's position, this answers the only question an empty
 * 3D view leaves open once the meshes are known to exist: whether the camera
 * is anywhere near them.
 */
Reactor3D.MapScene.prototype.extent = function() {
    const box = new THREE.Box3();
    for (const mesh of this._meshes) {
        if (!mesh.geometry) continue;
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
    }
    if (box.isEmpty()) return "empty";
    const round = value => Math.round(value * 10) / 10;
    return `${round(box.min.x)},${round(box.min.y)},${round(box.min.z)}`
        + ` .. ${round(box.max.x)},${round(box.max.y)},${round(box.max.z)}`;
};

/** The canvas the 3D pass draws on, for diagnostics. */
Reactor3D.Viewport.prototype.canvas = function() {
    return this._canvas;
};

/**
 * A parallax-mapped map's picture, laid flat as the ground it is.
 *
 * On a parallax map the art is the parallax and the tile layers are
 * scaffolding: a blank tile for passability, a handful of real tiles for the
 * things that stand up. Reactor's 3D view read only the tiles, so a room drawn
 * as a 3,504 x 1,392 painting came out as whatever its filler tile happened to
 * be — on Freelancers' maps, one opaque black autotile across the entire floor,
 * which is a map that renders perfectly and shows nothing but the seams where
 * the few real tiles sit.
 *
 * Only a *zero* parallax is laid down, which is what the `!` prefix means:
 * `Game_Map.parallaxOx` returns a plain multiple of the tile size for those, so
 * the image is pinned to the map at one image pixel per map pixel and the
 * placement is exact. A looping or scrolling parallax is a moving backdrop
 * rather than a floor and is left alone — it is not ground and pretending
 * otherwise would nail the sky to the map.
 */
Reactor3D.parallaxIsGround = function(mapData) {
    const name = mapData && mapData.parallaxName;
    if (!name) return false;
    if (mapData.parallaxLoopX || mapData.parallaxLoopY) return false;
    // ImageManager where there is one; the editor draws this same scene with no
    // game loaded, and the rule is a single character either way.
    if (typeof ImageManager !== "undefined" && ImageManager
        && typeof ImageManager.isZeroParallax === "function") {
        return ImageManager.isZeroParallax(name);
    }
    return name.charAt(0) === "!";
};

/**
 * Every parallax that is ground on this map, in the order they stack.
 *
 * The map's own is one of them. A parallax *plugin* can declare more, and
 * MultiParallax's are readable here because it takes them from the map note —
 * `<MultiParallax>` blocks with an `image:` line, the same `!` prefix deciding
 * whether each is pinned to the map or a moving backdrop.
 *
 * Layers the author adds with a plugin *command* are deliberately absent. They
 * do not exist until an event runs, so there is nothing to read at the moment a
 * map is built; the running game gains them when the command executes and the
 * editor cannot know about them at all.
 */
Reactor3D.parallaxGroundLayers = function(mapData) {
    const layers = [];
    if (this.parallaxIsGround(mapData)) {
        layers.push({ name: mapData.parallaxName, z: 0 });
    }
    for (const layer of this.noteParallaxLayers(mapData)) {
        // The same rule as the map's own: pinned to the map is ground, and
        // anything that scrolls or loops is a backdrop and left alone.
        if (!layer.name.startsWith("!")) continue;
        if (layer.scrollX || layer.scrollY) continue;
        layers.push(layer);
    }
    // Stacked the way the plugin stacks them, so a decal declared over a floor
    // is drawn over that floor here too.
    return layers.sort((a, b) => a.z - b.z);
};

/** `<MultiParallax>` blocks in a map note, as plain records. */
Reactor3D.noteParallaxLayers = function(mapData) {
    const note = mapData && mapData.note;
    if (!note || note.indexOf("<MultiParallax>") < 0) return [];
    const found = [];
    const blocks = /<MultiParallax>([\s\S]*?)<\/MultiParallax>/gi;
    let block;
    while ((block = blocks.exec(note)) !== null) {
        const props = {};
        for (const line of block[1].split("\n")) {
            const pair = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
            if (pair) props[pair[1].toLowerCase()] = pair[2];
        }
        if (!props.image) continue;
        found.push({
            name: props.image,
            z: Number(props.z || 0),
            scrollX: Number(props.scrollx || 0),
            scrollY: Number(props.scrolly || 0),
            opacity: props.opacity === undefined ? 255 : Number(props.opacity)
        });
    }
    return found;
};

/**
 * Which parallax a bitmap came from, by name.
 *
 * A sprite holds a Bitmap and a Bitmap remembers the URL it was loaded from,
 * which is the only thread back to the name an author wrote. The path is
 * URL-encoded — `!` survives, but a space or an accent does not — so it is
 * decoded before the basename is taken.
 */
Reactor3D.parallaxNameOf = function(bitmap) {
    const url = bitmap && typeof bitmap._url === "string" ? bitmap._url : "";
    if (!url) return null;
    const file = url.split("/").pop();
    if (!file) return null;
    let name = file.replace(/\.[^.]+$/, "");
    try {
        name = decodeURIComponent(name);
    } catch (error) {
        /* A malformed escape is not worth losing the name over. */
    }
    return name || null;
};

/**
 * Load a parallax by name.
 *
 * The running game has ImageManager; the editor draws this same scene with no
 * game loaded and hands in its own loader instead. Either way the answer is
 * something with a width, a height and an `image` or `canvas` to read pixels
 * from — which is all `textureFor` asks of it.
 */
Reactor3D.defaultParallaxLoader = function(name) {
    if (typeof ImageManager === "undefined" || !ImageManager
        || typeof ImageManager.loadParallax !== "function") {
        return null;
    }
    return ImageManager.loadParallax(name);
};

/**
 * Lay the parallax under the map.
 *
 * A hair below the tile ground rather than level with it, so a real tile
 * painted over the parallax still wins the depth test instead of fighting it.
 */
Reactor3D.MapScene.prototype.addParallaxGrounds = function(layers, load, tileSize) {
    if (!layers || !layers.length || typeof load !== "function") return;
    layers.forEach((layer, index) => {
        let bitmap = null;
        // One bad name costs its own layer, not the map.
        try {
            bitmap = load(layer.name);
        } catch (error) {
            console.warn(`Reactor3D: parallax "${layer.name}" could not be loaded.`, error);
        }
        // Stacked a hair apart so the depth buffer keeps the author's order
        // rather than letting two coplanar floors fight over every pixel.
        this.addParallaxGround(bitmap, tileSize, index, layer.opacity);
    });
};

Reactor3D.MapScene.prototype.addParallaxGround = function(bitmap, tileSize, index, opacity) {
    if (!bitmap) return;
    // A bitmap still loading has no pixels to hand three.js, and its size reads
    // as zero — which would lay down a quad of nothing. Wait for it and lay it
    // down then; the map is already on screen by that point and gains its floor
    // a frame or two later rather than never.
    if (bitmap.isReady && !bitmap.isReady()) {
        if (typeof bitmap.addLoadListener === "function") {
            const build = this._build;
            bitmap.addLoadListener(() => {
                if (this._scene && this._build === build) {
                    this.addParallaxGround(bitmap, tileSize, index, opacity);
                }
            });
        }
        return;
    }
    const texture = this.textureFor(bitmap);
    if (!texture) return;

    const size = tileSize || 48;
    const width = (bitmap.width || 0) / size;
    const height = (bitmap.height || 0) / size;
    if (!(width > 0) || !(height > 0)) return;

    // Each layer a hair above the last, in the order the author stacked them,
    // so two coplanar floors do not fight over every pixel. The plane lies
    // in XZ with the map's corner at zero, and follows the terrain.
    const lift = Reactor3D.PARALLAX_GROUND_DROP
        + (index || 0) * Reactor3D.PARALLAX_LAYER_STEP;
    const geometry = this.groundPlane(width, height, lift);

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        // A parallax is rarely a full rectangle of picture. A room drawn on a
        // map larger than itself leaves the surround transparent, and an opaque
        // material ignores that alpha and fills it with whatever the texels
        // happen to hold — white, on this art — turning the backdrop into a
        // sheet spread under the map. `alphaTest` rather than blending, and a
        // low one: it discards only what is genuinely not there, so a soft
        // painted edge survives, and it keeps the ground in the unsorted pass
        // where a floor belongs.
        transparent: true,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
        // Flat quads: one pass. three renders a double-sided transparent
        // material twice a frame otherwise, toggling needsUpdate each time,
        // which rebuilds its shader parameters every frame.
        forceSinglePass: true,
        depthWrite: true,
        // A layer the author faded stays faded.
        opacity: opacity === undefined ? 1 : Math.max(0, Math.min(1, opacity / 255))
    });
    // Lit like everything else, so an unlit corner of a parallax room is as
    // dark as an unlit corner of a tiled one — and, since the lights became a
    // field, lit by that field: without this the picture a room stands on
    // took only the ambient, and a lamp pooled on it through its haze alone,
    // with nothing standing in the lamp able to shade it.
    material.__reactorShaded = true;
    Reactor3D.litMaterial(material);
    this._materials.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    // Beneath the tile geometry in the same pass, so anything actually painted
    // on the map still draws over the picture of it.
    mesh.renderOrder = -1;
    Reactor3D.CoveredFloor.register(this._scene, mesh, bitmap, "cover");
    // The first layer is the floor everything else is measured against; the
    // rest are dressing laid over it.
    if (!this._parallaxGround) this._parallaxGround = mesh;
    this.belowGroup().add(mesh);
    this._meshes.push(mesh);
};

/** How far under the tile ground the parallax sits, in tiles. */
Reactor3D.PARALLAX_GROUND_DROP = -0.01;

/** How far each further parallax layer sits above the one below it. */
Reactor3D.PARALLAX_LAYER_STEP = 0.002;

//-----------------------------------------------------------------------------
// Room
//
// A 3D map is built inside a room: a floor under everything, four walls at
// the map's edge and a ceiling `height` tiles up, each one a parallax image
// from img/parallaxes. It lives in the sidecar as `reactor3d.room` —
// `{ height, floor, walls, ceiling }` — and a piece with no image is simply
// not built. Walls and ceiling show their inside face only, so a camera above
// the ceiling or outside a wall looks straight past it into the room.

Reactor3D.ROOM_DEFAULT_HEIGHT = 4;
Reactor3D.ROOM_MIN_HEIGHT = 1;
Reactor3D.ROOM_MAX_HEIGHT = 512;

Reactor3D.clampRoomHeight = function(value) {
    const height = Math.round(Number(value));
    if (!Number.isFinite(height)) return this.ROOM_DEFAULT_HEIGHT;
    return Math.max(this.ROOM_MIN_HEIGHT, Math.min(this.ROOM_MAX_HEIGHT, height));
};

/** The map's room, or null when no piece of one has an image. */
Reactor3D.roomFor = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const room = sidecar && sidecar.room;
    if (!room || typeof room !== "object") return null;
    const name = value => (typeof value === "string" ? value.trim() : "");
    const scroll = value => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(-32, Math.min(32, Math.round(number * 1000) / 1000)) : 0;
    };
    const parsed = {
        height: this.clampRoomHeight(room.height),
        floor: name(room.floor),
        walls: name(room.walls),
        ceiling: name(room.ceiling),
        sky: name(room.sky),
        skyScrollX: scroll(room.skyScrollX),
        skyScrollY: scroll(room.skyScrollY)
    };
    return parsed.floor || parsed.walls || parsed.ceiling || parsed.sky ? parsed : null;
};

/**
 * The sky a 3D map stands under: the room's own, else the map's parallax
 * when that parallax is a backdrop rather than a ground (no `!` prefix). A
 * 2D map draws such a parallax as a scrolling wallpaper behind everything;
 * in 3D the same image is wrapped around the camera instead, so turning
 * the view turns the sky, and its scroll speeds drift it. Null: no sky.
 */
Reactor3D.skyFor = function(mapData) {
    const room = this.roomFor(mapData);
    if (room && room.sky) return { name: room.sky, scrollX: room.skyScrollX, scrollY: room.skyScrollY };
    const name = mapData && typeof mapData.parallaxName === "string" ? mapData.parallaxName.trim() : "";
    if (!name || this.parallaxIsGround(mapData)) return null;
    return { name, scrollX: Number(mapData.parallaxSx) || 0, scrollY: Number(mapData.parallaxSy) || 0 };
};

/** Every parallax name the room and its sky use, once each, for a loader to fetch. */
Reactor3D.roomImageNames = function(mapData) {
    const room = this.roomFor(mapData);
    const names = [];
    const pieces = room ? [room.floor, room.walls, room.ceiling] : [];
    const sky = this.skyFor(mapData);
    if (sky) pieces.push(sky.name);
    for (const name of pieces) {
        if (name && names.indexOf(name) < 0) names.push(name);
    }
    return names;
};

/**
 * Build the room around a `width` x `height` tile map.
 *
 * `load` is the same loader the parallax grounds use; a bitmap still loading
 * lays its piece down when it arrives, the way a parallax ground does.
 */
Reactor3D.MapScene.prototype.addRoom = function(room, load, tileSize, width, height) {
    if (!room || typeof load !== "function") return;
    if (!(width > 0) || !(height > 0)) return;
    const pieces = [
        ["floor", room.floor],
        ["ceiling", room.ceiling],
        ["walls", room.walls]
    ];
    for (const [piece, name] of pieces) {
        if (!name) continue;
        let bitmap = null;
        // One bad name costs its own piece, not the room.
        try {
            bitmap = load(name);
        } catch (error) {
            console.warn(`Reactor3D: room ${piece} "${name}" could not be loaded.`, error);
        }
        this.addRoomPiece(piece, bitmap, room.height, tileSize, width, height);
    }
};

Reactor3D.MapScene.prototype.addRoomPiece = function(piece, bitmap, roomHeight, tileSize, width, height) {
    if (!bitmap) return;
    if (bitmap.isReady && !bitmap.isReady()) {
        if (typeof bitmap.addLoadListener === "function") {
            const build = this._build;
            bitmap.addLoadListener(() => {
                if (this._scene && this._build === build) {
                    this.addRoomPiece(piece, bitmap, roomHeight, tileSize, width, height);
                }
            });
        }
        return;
    }
    const size = tileSize || 48;
    const imageWidth = (bitmap.width || 0) / size;
    const imageHeight = (bitmap.height || 0) / size;
    if (!(imageWidth > 0) || !(imageHeight > 0)) return;

    const surfaces = [];
    if (piece === "floor") {
        // Under the parallax grounds, which sit a hair under the tiles: a
        // parallax room drawn over a floor still wins every pixel it covers.
        const y = Reactor3D.PARALLAX_GROUND_DROP - Reactor3D.PARALLAX_LAYER_STEP;
        const geometry = this.groundPlane(width, height, y);
        // Tiled at the image's own scale, so a 480px floor texture covers
        // ten tiles however large the map is.
        surfaces.push({ geometry, repeat: [width / imageWidth, height / imageHeight] });
    } else if (piece === "ceiling") {
        // Faces down: seen from inside the room and looked straight past from
        // above, where the map camera usually is.
        const geometry = new THREE.PlaneGeometry(width, height);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(width / 2, roomHeight, height / 2);
        surfaces.push({ geometry, repeat: [width / imageWidth, height / imageHeight] });
    } else {
        // The image's height is the wall's height; it repeats along the wall
        // at the aspect that keeps it undistorted. Each face points into the
        // room, so the wall between the camera and the map is culled and the
        // far walls stand.
        const spanPerImage = roomHeight * (imageWidth / imageHeight);
        const wall = (length, rotation, x, z) => {
            const geometry = new THREE.PlaneGeometry(length, roomHeight);
            if (rotation) geometry.rotateY(rotation);
            geometry.translate(x, roomHeight / 2, z);
            return { geometry, repeat: [length / spanPerImage, 1] };
        };
        surfaces.push(wall(width, 0, width / 2, 0));                       // north, faces +z
        surfaces.push(wall(width, Math.PI, width / 2, height));            // south, faces -z
        surfaces.push(wall(height, Math.PI / 2, 0, height / 2));           // west, faces +x
        surfaces.push(wall(height, -Math.PI / 2, width, height / 2));      // east, faces -x
    }

    for (const surface of surfaces) {
        const texture = this.textureFor(bitmap);
        if (!texture) {
            surface.geometry.dispose();
            continue;
        }
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(surface.repeat[0], surface.repeat[1]);
        // A room picture is one image, not a tile atlas: nothing bleeds
        // across a tile edge, so it can carry mipmaps. The Demo's are
        // 2400px square and mostly seen far away; sampling that at one
        // level shimmers and thrashes the texture cache, and WebGL2 takes
        // a non-power-of-two size in its stride.
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.needsUpdate = true;
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.01,
            // Inside faces only; the outside of the room is nothing.
            side: THREE.FrontSide,
            depthWrite: true
        });
        // Lit like the ground, so a dark corner of the room is dark.
        material.__reactorShaded = true;
        Reactor3D.litMaterial(material);
        this._materials.push(material);
        const mesh = new THREE.Mesh(surface.geometry, material);
        // Behind the parallax grounds, which are behind the tiles.
        mesh.renderOrder = -2;
        mesh.userData.roomPiece = piece;
        Reactor3D.CoveredFloor.register(this._scene, mesh, bitmap, piece);
        this.belowGroup().add(mesh);
        this._meshes.push(mesh);
    }
};

/**
 * A ground plane `width` x `height` tiles from the map's corner, lying in XZ
 * at `y`: one quad on a flat map, a grid of tile-sized cells bent through the
 * terrain on a shaped one (`build` sets `_terrainMap` first). Segments are
 * capped so a giant parallax does not become a giant mesh.
 */
Reactor3D.MapScene.prototype.groundPlane = function(width, height, y) {
    const map = this._terrainMap;
    const segX = map ? Math.max(1, Math.min(256, Math.round(width))) : 1;
    const segY = map ? Math.max(1, Math.min(256, Math.round(height))) : 1;
    const geometry = new THREE.PlaneGeometry(width, height, segX, segY);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(width / 2, y, height / 2);
    if (map) {
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += Reactor3D.terrainHeightAt(map, positions[i], positions[i + 2]);
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        // A plane's every vertex starts at one height; `updateTerrain` lifts
        // from there and re-lights it (`terrainPlane`).
        geometry.userData.terrainBaseY = y;
        geometry.userData.terrainPlane = true;
    }
    return geometry;
};


/**
 * The sky: a sphere of the image around the camera, inside face only, drawn
 * before everything and never lit, fogged or written to depth. It follows
 * the camera each frame (`updateSky`), so it is never reached and has no
 * edge; the image repeats around it at its own scale so a tileable
 * parallax joins seamlessly, and drifts by the room's scroll speeds the
 * way a 2D parallax scrolls. Radius well inside the camera's far plane.
 */
Reactor3D.SKY_RADIUS = 160;
Reactor3D.SKY_REPEATS = 4;

Reactor3D.MapScene.prototype.addSky = function(sky, load, tileSize) {
    if (!sky || !sky.name || typeof load !== "function") return;
    let bitmap = null;
    try {
        bitmap = load(sky.name);
    } catch (error) {
        console.warn(`Reactor3D: sky "${sky.name}" could not be loaded.`, error);
    }
    this.addSkyImage(sky, bitmap, tileSize);
};

Reactor3D.MapScene.prototype.addSkyImage = function(sky, bitmap, tileSize) {
    if (!bitmap) return;
    if (bitmap.isReady && !bitmap.isReady()) {
        if (typeof bitmap.addLoadListener === "function") {
            const build = this._build;
            bitmap.addLoadListener(() => {
                if (this._scene && this._build === build) this.addSkyImage(sky, bitmap, tileSize);
            });
        }
        return;
    }
    const size = tileSize || 48;
    const imageWidth = (bitmap.width || 0) / size;
    const imageHeight = (bitmap.height || 0) / size;
    if (!(imageWidth > 0) || !(imageHeight > 0)) return;
    const texture = this.textureFor(bitmap);
    if (!texture) return;
    const radius = Reactor3D.SKY_RADIUS;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // A quarter turn of sky per image, at the image's own aspect: tiled at
    // its pixel scale a 1800px sky repeated twenty-seven times around and
    // read as a pattern of specks, not clouds.
    texture.repeat.set(Reactor3D.SKY_REPEATS, Math.max(1, Math.round(Reactor3D.SKY_REPEATS * 0.5 * (imageWidth / imageHeight))));
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
        map: texture, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
    });
    this._materials.push(material);
    const geometry = new THREE.SphereGeometry(radius, 48, 24);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -100;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.roomPiece = "sky";
    mesh.userData.sky = {
        // Image pixels a frame, as texture units: one image is one unit.
        driftX: (Number(sky.scrollX) || 0) / Math.max(1, bitmap.width || 1),
        driftY: (Number(sky.scrollY) || 0) / Math.max(1, bitmap.height || 1),
        frame: null
    };
    this.belowGroup().add(mesh);
    this._meshes.push(mesh);
    this._sky = mesh;
};

/**
 * Where the sky's drift has got to, and putting a new sky back there: the
 * editor rebuilds the scene on an edit, and a sky that started over each
 * time visibly jumped back while the map was being worked on.
 */
Reactor3D.MapScene.prototype.skyOffset = function() {
    const texture = this._sky && this._sky.material && this._sky.material.map;
    return texture ? { x: texture.offset.x, y: texture.offset.y } : null;
};

Reactor3D.MapScene.prototype.setSkyOffset = function(offset) {
    const texture = this._sky && this._sky.material && this._sky.material.map;
    if (!texture || !offset) return;
    if (Number.isFinite(offset.x)) texture.offset.x = offset.x;
    if (Number.isFinite(offset.y)) texture.offset.y = offset.y;
};

/** Each frame: the sky stands around the camera and drifts by the frames elapsed. */
Reactor3D.MapScene.prototype.updateSky = function(camera, frame) {
    const mesh = this._sky;
    if (!mesh || !mesh.parent) return;
    if (camera) {
        mesh.position.copy(camera.position);
        // The sky sits in the scene's mesh list, which `freezeStaticMeshes`
        // stops recomposing every frame; it is the one mesh that moves, so
        // its matrix is written here. Left frozen, the sphere stayed where
        // the camera stood when the scene was built, and a camera pulled
        // far back looked out past its edge at nothing.
        if (mesh.matrixAutoUpdate === false) mesh.updateMatrix();
    }
    const drift = mesh.userData.sky;
    if (!drift || !Number.isFinite(frame)) return;
    if (drift.frame !== null && (drift.driftX || drift.driftY)) {
        const elapsed = Math.max(0, Math.min(60, frame - drift.frame));
        const texture = mesh.material.map;
        // Positive X scrolls the image left across the view, as a 2D parallax does.
        texture.offset.x = ((texture.offset.x + drift.driftX * elapsed) % 1 + 1) % 1;
        texture.offset.y = ((texture.offset.y + drift.driftY * elapsed) % 1 + 1) % 1;
    }
    drift.frame = frame;
};

/** Skip a room floor only while an intact, opaque parallax hides it. */
Reactor3D.CoveredFloor = {
    enabled: true,
    _scenes: new WeakMap(),
    _surfaces: new WeakMap(),
    _images: new WeakMap(),
    opaque(image) {
        // Live canvases/videos and unknown image types have no lasting alpha proof.
        if (!image || image.tagName !== "IMG" || !image.complete || !image.naturalWidth) return false;
        const known = this._images.get(image);
        if (known && known.src === image.src && known.width === image.naturalWidth && known.height === image.naturalHeight) return known.opaque;
        let opaque = false;
        try {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            opaque = true;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) { opaque = false; break; }
            canvas.width = canvas.height = 1;
        } catch (_) { /* Tainted/unavailable image: draw the original floor. */ }
        this._images.set(image, { src: image.src, width: image.naturalWidth, height: image.naturalHeight, opaque });
        return opaque;
    },
    register(scene, mesh, bitmap, kind) {
        const geometry = mesh.geometry, material = mesh.material, texture = material.map;
        const image = bitmap.image;
        const record = { mesh, bitmap, kind, geometry, material, texture, image, src: image?.src,
            version: texture.version, sourceVersion: texture.source?.version,
            compile: material.onBeforeCompile, before: material.onBeforeRender, draw: mesh.onBeforeRender,
            positions: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index.array),
            opaque: !bitmap._animatedImage && this.opaque(image) };
        this._surfaces.set(mesh, record);
        let entries = this._scenes.get(scene);
        if (!entries) this._scenes.set(scene, entries = []);
        entries.push(record);
        // Cached image dimensions can arrive before decoding finishes. Do the
        // one-time proof when decoding settles, never poll/read pixels per frame.
        if (image?.tagName === "IMG" && !image.complete && typeof image.decode === "function") {
            try { image.decode().then(() => {
                if (this._scenes.get(scene) !== entries || !entries.includes(record)) return;
                record.opaque = !bitmap._animatedImage && bitmap.image === image && image.src === record.src && this.opaque(image);
            }, () => {}); } catch (_) { /* Unavailable decode keeps the original draw. */ }
        }
    },
    intact(record, opaque) {
        const { mesh, material: m, geometry: g, texture: t, bitmap, image } = record;
        if (!mesh.visible || mesh.castShadow || mesh.geometry !== g || mesh.material !== m || !m.visible || m.map !== t || m.wireframe || m.vertexColors
            || m.opacity !== 1 || m.blending !== THREE.NormalBlending || !m.colorWrite || !m.depthWrite || !m.depthTest
            || m.depthFunc !== THREE.LessEqualDepth || m.stencilWrite || m.alphaMap || m.alphaHash || m.alphaToCoverage
            || m.clippingPlanes?.length || m.polygonOffset || m.onBeforeCompile !== record.compile
            || m.onBeforeRender !== record.before || mesh.onBeforeRender !== record.draw
            || m.alphaTest > 1 || bitmap._animatedImage || bitmap.image !== image || image?.src !== record.src
            || t.image !== image || t.version !== record.version || t.source?.version !== record.sourceVersion
            || (opaque && !record.opaque)) return false;
        const p = g.attributes.position?.array, index = g.index?.array;
        if (g.drawRange.start !== 0 || g.drawRange.count < 6 || g.groups.length || g.morphAttributes.position || !p || !index
            || p.length !== record.positions.length || index.length !== record.indices.length) return false;
        for (let i = 0; i < p.length; i++) if (p[i] !== record.positions[i]) return false;
        for (let i = 0; i < index.length; i++) if (index[i] !== record.indices[i]) return false;
        // Factory floor vertices already carry world coordinates. Edited, rotated
        // or scaled scene hierarchies keep the ordinary rendering path.
        const e = mesh.matrixWorld.elements;
        for (let i = 0; i < 16; i++) if (e[i] !== (i % 5 === 0 ? 1 : 0)) return false;
        return true;
    },
    covers(floor, cover, camera) {
        const projection = camera.projectionMatrix.elements;
        if (!camera.isPerspectiveCamera || camera.parent || camera.reversedDepth
            || camera.scale.x !== 1 || camera.scale.y !== 1 || camera.scale.z !== 1
            || projection[11] !== -1 || projection[1] || projection[2] || projection[3] || projection[4]
            || projection[6] || projection[7] || projection[8] || projection[9] || projection[12] || projection[13] || projection[15]
            || Math.abs(projection[14] / (projection[10] - 1) - camera.near) > 1e-7
            || floor.mesh.parent !== cover.mesh.parent || floor.mesh.renderOrder !== -2 || cover.mesh.renderOrder !== -1
            || floor.material.side !== THREE.FrontSide || cover.material.side !== THREE.DoubleSide
            || !this.intact(floor, false) || !this.intact(cover, true)) return false;
        const f = floor.positions, c = cover.positions, eye = camera.position;
        // With the eye inside the upper rectangle, every ray to the lower
        // rectangle crosses it. Leave the boundary and near-plane cases alone.
        if (f.length !== 12 || c.length !== 12 || !(c[1] > f[1])
            || c[0] > f[0] || c[2] > f[2] || c[3] < f[3] || c[8] < f[8]
            || eye.x <= c[0] + 0.01 || eye.x >= c[3] - 0.01 || eye.z <= c[2] + 0.01 || eye.z >= c[8] - 0.01) return false;
        const nearReach = camera.near * Math.sqrt(1 + 1 / camera.projectionMatrix.elements[0] ** 2
            + 1 / camera.projectionMatrix.elements[5] ** 2);
        return Number.isFinite(nearReach) && eye.y - c[1] > nearReach + 0.01;
    },
    draw(renderer, scene, camera) {
        const entries = this.enabled && this._scenes.get(scene), hidden = [];
        if (entries && !scene.overrideMaterial && !renderer.clippingPlanes?.length && !renderer.xr?.isPresenting) {
            for (const floor of entries) {
                if (floor.kind !== "floor" || !floor.mesh.parent?.visible || !floor.mesh.layers.test(camera.layers)) continue;
                const cover = entries.find(candidate => candidate.kind === "cover" && candidate.mesh.layers.test(camera.layers)
                    && this.covers(floor, candidate, camera));
                if (!cover) continue;
                // A translucent surface drawn between the floors could retain the
                // lower floor's colour when its depth prevents the upper draw.
                // Only unchanged, opaque room pieces may intervene.
                let safe = true;
                scene.traverseVisible(object => {
                    if (!safe || !object.material || object === floor.mesh || object === cover.mesh || !object.layers.test(camera.layers)) return;
                    for (const m of [].concat(object.material || [])) {
                        if (!m.visible || !m.transparent || object.renderOrder < -2 || object.renderOrder > -1) continue;
                        const known = this._surfaces.get(object);
                        if (!known || object.parent !== floor.mesh.parent || !this.intact(known, true)) safe = false;
                    }
                });
                if (safe) { hidden.push(floor.mesh); floor.mesh.visible = false; }
            }
        }
        try { return renderer.render(scene, camera); }
        finally { for (const mesh of hidden) mesh.visible = true; }
    }
};

/** The geometry drawn under the characters. */
Reactor3D.MapScene.prototype.belowGroup = function() {
    if (!this._belowGroup) {
        this._belowGroup = new THREE.Group();
        this._scene.add(this._belowGroup);
    }
    return this._belowGroup;
};

/** The light pools, drawn last and added to what is already there. */
Reactor3D.MapScene.prototype.lightGroup = function() {
    if (!this._lightGroup) {
        this._lightGroup = new THREE.Group();
        this._scene.add(this._lightGroup);
    }
    return this._lightGroup;
};

/** Whether this map draws any lights at all. */
Reactor3D.MapScene.prototype.hasLights = function() {
    return !!(this._lightGroup && this._lightGroup.children.length);
};

/** The geometry drawn over them — the star-flagged tiles. */
Reactor3D.MapScene.prototype.aboveGroup = function() {
    if (!this._aboveGroup) {
        this._aboveGroup = new THREE.Group();
        this._scene.add(this._aboveGroup);
    }
    return this._aboveGroup;
};

/** Whether anything at all is drawn over the characters on this map. */
Reactor3D.MapScene.prototype.hasAbove = function() {
    return !!(this._aboveGroup && this._aboveGroup.children.length);
};

/**
 * Show one pass and hide the other.
 *
 * `"below"` is the ground, `"above"` the star-flagged tiles, `"all"` both —
 * which is what a single-pass caller (the editor's viewport) wants.
 */
Reactor3D.MapScene.prototype.setPass = function(which) {
    const all = which === "all";
    // "world" is the model-map arrangement: characters live inside the scene
    // as billboards, so the star-flagged tiles join them under one depth
    // buffer — standing in front of a tall structure occludes its top, and
    // standing behind it is hidden, per pixel. The split passes exist for
    // maps where characters are PIXI sprites sandwiched *between* the two
    // textures; there the star tiles keep their own pass.
    const world = which === "world";
    if (this._belowGroup) this._belowGroup.visible = all || world || which === "below";
    if (this._aboveGroup) this._aboveGroup.visible = all || world || which === "above";
    // Models and ordinary character billboards belong with the ground:
    // they hang off the scene directly, and left untoggled they re-rendered
    // over the star-flagged tiles in the above pass.
    if (this._modelsGroup) this._modelsGroup.visible = all || world || which === "below";
    if (this._piecesGroup) this._piecesGroup.visible = all || world || which === "below";
    // The lights' glowing bodies stand in the world with the models: walls
    // hide them, and they are added into the frame like any other glow.
    if (this._lightBodyGroup) this._lightBodyGroup.visible = all || world || which === "below";
    // Above-characters events stay a composite overlay — MZ's z=5 draws over
    // characters and star tiles alike, which no depth buffer can express —
    // on a map of 2D sprites. With models in the world everything is a
    // thing standing somewhere, and a screen behind a tower belongs behind
    // it: the world pass takes the overlay too, and the overlay pass has
    // nothing left to draw.
    if (this._aboveBillboardsGroup) {
        this._aboveBillboardsGroup.visible = all
            || (this.modelsInWorld ? world : (which === "above" || which === "overlay"));
    }
    // Never with the others: the light pass is composited by addition and the
    // rest by covering, so drawing them together would blend one as the other.
    if (this._lightGroup) this._lightGroup.visible = which === "lights";
};

Reactor3D.MapScene.prototype.scene = function() {
    return this._scene;
};

/**
 * Wrap a loaded Bitmap as a texture.
 *
 * Enlarged texels stay crisp. Minified texels are linearly sampled so narrow
 * fractional-alpha shadows do not disappear into nearest-neighbour speckle;
 * per-tile UV clamps keep that filter inside each atlas rectangle.
 */
Reactor3D.MapScene.prototype.textureFor = function(bitmap) {
    const source = bitmap && (bitmap.image || bitmap.canvas);
    if (!source) return null;
    const texture = new THREE.CanvasTexture(source);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this._textures.push(texture);
    return texture;
};

/**
 * The running game's tileset, when there is a running game.
 *
 * Guarded with `typeof` rather than a plain truth test: the editor loads this
 * same file to draw its 3D viewport, and there `$gameMap` is not merely null,
 * it was never declared.
 */
Reactor3D.currentFlags = function() {
    return (typeof $gameMap !== "undefined" && $gameMap
        && $gameMap.tilesetFlags && $gameMap.tilesetFlags()) || null;
};

/**
 * The project's tile size, from the data the game has loaded.
 *
 * `Game_Map.tileWidth` reads the same field; this exists because the geometry
 * is built before a scene has a map object, and outside a running game the
 * editor supplies the number itself.
 */
Reactor3D.currentTileSize = function() {
    const size = typeof $dataSystem !== "undefined" && $dataSystem
        ? Number($dataSystem.tileSize) : 0;
    return [64, 48, 32, 24, 16, 8].includes(size) ? size : 48;
};

Reactor3D.currentTilesetId = function() {
    return (typeof $gameMap !== "undefined" && $gameMap
        && $gameMap.tilesetId && $gameMap.tilesetId()) || 0;
};

/**
 * The material for a group of cut-outs that turn to face the camera.
 *
 * Each vertex carries the object's anchor as its position and its own corner as
 * `offset`, and the quad is assembled here rather than in the buffer, so the
 * geometry is still built once per map however the camera moves.
 *
 * The turn is about the world's up axis only. A fully camera-facing quad lies
 * back as you look down at it, which on a map viewed from above tips every tree
 * towards the viewer like a field of falling dominoes; pinning up keeps them
 * standing and only lets them pivot.
 */
/**
 * How far a cut-out leans back to meet the camera, from 0 to 1. Zero: it stays
 * upright and only spins, which is what the event sprites have always done.
 *
 * Leaning was an attempt to keep cut-outs from going edge-on as the camera
 * climbs, and it costs far more than it buys. A leaning cut-out's art tips
 * towards the viewer, so the object hangs off the point it is anchored to and
 * that overhang swings with the azimuth: at a 45 degree camera the top of a
 * six-tile object sits 3.4 tiles from its anchor and travels 4.8 tiles through
 * a quarter turn. That is the drift — an object visibly leaving its own cells
 * as you orbit — and the same overhang is why things looked lifted off the
 * ground. Upright, the displacement is exactly zero at every angle.
 *
 * The edge-on problem is real and is the camera's to solve: pitch is clamped
 * short of the angle where a standing cut-out has nothing left to show, which
 * is why HD-2D games do not let you look straight down either.
 */
/**
 * How far a cut-out leans from world-upright towards facing the camera.
 *
 * 0 is bolt upright and 1 is square-on to the lens. Upright is the honest
 * choice and it is the wrong one for art drawn flat: a pitched camera
 * foreshortens a world-vertical plane — about six tenths at the default
 * camera — so every character came out squat, every sign was drawn shorter
 * than it was painted, and because a world-vertical line converges towards a
 * vanishing point, the two ends of a wide sign leaned by angles some fourteen
 * degrees apart. None of that is representable by a sprite, which is a
 * rectangle.
 *
 * Square-on removes all three at once, because a quad parallel to the image
 * plane projects to a plain scaled rectangle: art keeps the proportions it was
 * painted at, there is no lean, and a sprite can match it exactly. The cost is
 * that a cut-out leans back with the camera rather than standing in the world,
 * which is the usual HD-2D bargain and only starts to read badly as the camera
 * climbs towards straight down.
 *
 * Props and sprites both take this number, so whatever it is set to they agree.
 * A map may ask for something in between with `billboardTilt` in its sidecar,
 * which buys back some of the standing-in-the-world look at the cost of
 * bringing the squash and the lean back with it.
 */
Reactor3D.DEFAULT_BILLBOARD_TILT = 1;

/**
 * The tilt in force, which the shader and `standScaleAt` both read.
 *
 * Set from the map at build time rather than passed around: a cut-out and the
 * sprite standing next to it have to lean by the same amount or they are
 * different shapes, and one number they both read cannot drift apart.
 */
Reactor3D.BILLBOARD_TILT = Reactor3D.DEFAULT_BILLBOARD_TILT;

Reactor3D.billboardTiltFor = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const asked = sidecar && sidecar.billboardTilt;
    if (!Number.isFinite(asked)) return this.DEFAULT_BILLBOARD_TILT;
    return Math.max(0, Math.min(1, asked));
};

/**
 * Write a leaned billboard's depth as if it stood bolt upright at its anchor.
 *
 * The lean is a drawing device: the art tips towards the camera so it is not
 * foreshortened to a sliver. But the GPU depth-tests the leaned geometry,
 * whose upper half physically enters the space of whatever stands on the
 * tiles behind it — a sprite in front of a 3D car lost its head to the car's
 * body. Rays cross a *vertical* plane at the anchor in true near/far order
 * against every other surface, so the vertex shader keeps the leaned clip
 * position for x/y and takes z from the same vertex un-leaned. In front,
 * touching, and behind then settle per pixel with no sorting rules.
 *
 * For meshes posed on the CPU (character billboards) the vertical twin is
 * rebuilt from the model matrix: column 0 is the scaled right axis, column
 * 1's length is the height, column 3 the anchor.
 */
Reactor3D.straightenBillboardDepth = function(material) {
    if (!material || material.__reactorStraightDepth) return material;
    material.__reactorStraightDepth = true;
    // How far up a leaning facade this billboard was lifted (a decoration
    // anchored by `facadeAt`). The twin walks that lift back down the leaned
    // axis and up world-up instead, so the decoration depth-tests as part of
    // the wall it sits on rather than as a plane standing north of it.
    material.userData.rrDepthLift = { value: 0 };
    // A world-space nudge for the twin's anchor alone: a walking character
    // standing ON a facade's footprint has its depth pushed just in front of
    // that wall's plane — the art on their cell draws under them, as it does
    // in 2D — while their drawn position stays exactly where they stand.
    material.userData.rrDepthShiftX = { value: 0 };
    material.userData.rrDepthShiftZ = { value: 0 };
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
        if (typeof earlier === "function") earlier.call(this, shader, renderer);
        shader.uniforms.rrDepthLift = material.userData.rrDepthLift;
        shader.uniforms.rrDepthShiftX = material.userData.rrDepthShiftX;
        shader.uniforms.rrDepthShiftZ = material.userData.rrDepthShiftZ;
        shader.vertexShader = "uniform float rrDepthLift;\n"
            + "uniform float rrDepthShiftX;\nuniform float rrDepthShiftZ;\n"
            + shader.vertexShader.replace(
            "#include <project_vertex>",
            `
            #include <project_vertex>
            {
                vec3 rrRight = modelMatrix[0].xyz;
                vec3 rrLeanUp = modelMatrix[1].xyz;
                float rrHeight = length(rrLeanUp);
                vec3 rrAnchor = modelMatrix[3].xyz
                    - normalize(rrLeanUp) * rrDepthLift
                    + vec3(rrDepthShiftX, 0.0, rrDepthShiftZ);
                vec3 rrVertical = rrAnchor
                    + rrRight * position.x
                    + vec3(0.0, 1.0, 0.0) * (rrHeight * position.y + rrDepthLift);
                vec4 rrClip = projectionMatrix * viewMatrix * vec4(rrVertical, 1.0);
                gl_Position.z = rrClip.z / max(rrClip.w, 1e-6) * gl_Position.w;
            }
            `
        );
    };
    return material;
};

Reactor3D.billboardMaterial = function(texture, edgeHinged) {
    // The ordinary tile material, with only the vertex position replaced.
    //
    // Writing a shader of its own instead looked plausible and came out dark
    // and unfogged: three.js converts a texel from the texture's colour space
    // to the renderer's on the way out, and mixes in fog, tone mapping and the
    // rest through chunks a hand-written shader does not include. Every one of
    // those has to match the flat tiles exactly or a tree is a different colour
    // from the ground it stands on.
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        /*
         * Opaque, with alpha spread across the multisample coverage mask.
         *
         * A tileset paints soft edges — the shadow beside a column, the fringe
         * of a canopy — and cutting them with `alphaTest` alone draws every
         * texel that survives at full strength, so a half-there shadow came out
         * a hard slab. Blending was the obvious answer and it cost whole
         * objects: `transparent` moves a mesh into three.js's sorted pass,
         * which orders *per mesh* by centroid while still writing depth, and a
         * centroid says nothing useful about a mesh spanning the entire map —
         * which is what one merged buffer per sheet is. Whichever sorted
         * nearest wrote depth over everything it covered, so a column vanished
         * when a couple of plates were set down beside it and moved the
         * centroids around.
         *
         * Alpha-to-coverage gets both. The material stays opaque, so it draws
         * in the unsorted pass where depth settles things per fragment rather
         * than per mesh, and the GPU turns each fragment's alpha into a share
         * of the multisample mask — partial transparency with no ordering to
         * get wrong. It needs the viewport to have MSAA, which is why
         * `antialias` is on there.
         *
         * Blended, so a texel is drawn at the alpha it was painted at.
         *
         * Coverage was the previous answer and it only approximates: the mask
         * has one bit per multisample, so alpha quantises to the sample count
         * — a shadow painted at 55% lands on 50%. Blending is exact.
         *
         * Blending on its own is what emptied the map before, because a
         * transparent mesh goes into three.js's sorted pass, which orders per
         * mesh by centroid while still writing depth, and a centroid says
         * nothing about a mesh spanning the whole map. The opaque-colour pass
         * below fixes that at the root: fully opaque texels write colour and
         * depth first, so fractional alpha later has a real scene to blend
         * over. `depthWrite` is off here because a blended fragment must not
         * hide whatever should contribute behind it.
         *
         * `alphaTest` is off here: the dark matte halo these sheets carry must
         * be drawn at the fraction of a percent it was painted at, which is
         * invisible rather than promoted into a black fringe.
         */
        transparent: true,
        depthWrite: false,
        alphaTest: 0,
        side: THREE.DoubleSide,
        // Flat quads: one pass. three renders a double-sided transparent
        // material twice a frame otherwise, toggling needsUpdate each time,
        // which rebuilds its shader parameters every frame.
        forceSinglePass: true,
        // Lying flat under an overhead camera puts a cut-out in the same plane
        // as the ground it stands on, and coplanar surfaces flicker against
        // each other. A depth bias settles it from every angle, where nudging
        // the geometry would only settle it from one.
        polygonOffset: true,
        // One bias for every cut-out. Biasing the starred pass harder was
        // tried, to settle which of two coplanar cut-outs wins, and it reaches
        // further than that: it also pulled starred art in front of things
        // genuinely nearer the camera, so a plate standing in front of a
        // column drew behind it. What two cut-outs at one anchor need is not
        // to be at one anchor.
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    });
    material.onBeforeCompile = shader => {
        shader.uniforms.tilt = { value: Reactor3D.BILLBOARD_TILT };
        shader.uniforms.footwardScale = { value: edgeHinged ? 0 : 1 };
        shader.vertexShader = "attribute vec2 offset;\nuniform float tilt;\nuniform float footwardScale;\n"
            + shader.vertexShader.replace(
            "#include <begin_vertex>",
            `
            // Build the quad on the camera's own right axis, and on an up axis
            // leaned part way from the world's towards the camera's. Both
            // extremes are wrong: bolt upright goes edge-on as the camera
            // climbs and a forest thins to slivers, while square-on lies flat
            // overhead and the trees stop standing up.
            vec3 billboardRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec3 billboardUp = normalize(mix(vec3(0.0, 1.0, 0.0), cameraUp, tilt));

            // The base sits at the near edge of the cell, not its middle.
            //
            // A column standing on a cell fills it front to back: its base is
            // a circle, and what the eye reads as "where it stands" is the
            // near edge of that circle, not its centre. A flat cut-out has no
            // depth to spread across, so a quad planted on the cell's centre
            // reads half a square too far back — while planting it on the
            // cell's southern edge, which is where 2D draws a standing foot,
            // only looks right until the camera comes round and that edge is
            // no longer the near one.
            //
            // Half a cell towards the camera is both: the pivot stays the
            // cell's centre, so the object turns about its own axis, and the
            // visible base stays on the near edge from every angle.
            vec3 toCamera = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
            vec3 nearward = vec3(toCamera.x, 0.0, toCamera.z);
            float reach = length(nearward);
            vec3 footward = reach > 0.0001
                ? nearward * (0.5 * footwardScale / reach)
                : vec3(0.0);

            vec3 transformed = position
                + footward
                + billboardRight * offset.x
                + billboardUp * offset.y;

            // The same vertex bolt upright: depth comes from this twin (see
            // straightenBillboardDepth) so a leaning cut-out orders against
            // real meshes by where it stands, not where its head tips.
            vec3 rrVerticalPos = position
                + footward
                + billboardRight * offset.x
                + vec3(0.0, 1.0, 0.0) * offset.y;
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            `
            #include <project_vertex>
            {
                vec4 rrClip = projectionMatrix * modelViewMatrix * vec4(rrVerticalPos, 1.0);
                gl_Position.z = rrClip.z / max(rrClip.w, 1e-6) * gl_Position.w;
            }
            `
        );
    };
    // Tagged so the ambient level can dim cut-outs, which are not shaded by
    // their normals — see `syncLights`.
    material.__reactorBillboard = true;
    // Without this every billboard material compiles its own program, since
    // three.js keys the cache on the material's own properties and cannot see
    // the injected code.
    material.customProgramCacheKey = () => edgeHinged
        ? "reactor3d-billboard-edge-hinged" : "reactor3d-billboard";
    return material;
};

/**
 * Build the meshes for a map.
 *
 * `options.flags` and `options.tilesetId` let a caller outside the running game
 * — the editor viewport — supply the tileset it is showing.
 */
Reactor3D.MapScene.prototype.build = function(mapData, bitmaps, options) {
    this.clear();
    if (!mapData) return;

    const settings = options || {};
    const flags = settings.flags || Reactor3D.currentFlags();
    // A cell is the project's tile size. MZ records the choice in System.json
    // and the runtime honours it everywhere else; a sheet laid out at 32 and
    // sampled at 48 draws the wrong art in every cell.
    const tileSize = settings.tileSize || Reactor3D.currentTileSize();
    const tilesetId = settings.tilesetId != null
        ? settings.tilesetId
        : Reactor3D.currentTilesetId();
    // Before any material is made: the shader bakes the tilt in as a uniform
    // when it compiles, and the sprites read the same number each frame.
    Reactor3D.BILLBOARD_TILT = Reactor3D.billboardTiltFor(mapData);

    // Events that place a classified tile become part of the world here, so
    // everything below sees one map with no idea which cells came from where.
    // Guarded: a project with unusual event data must lose its door props, not
    // its whole map.
    try {
        mapData = Reactor3D.mapWithEventTiles(mapData, tilesetId);
    } catch (error) {
        console.warn("Reactor3D: event props skipped —", error);
        Reactor3D._eventProps = null;
    }
    const built = Reactor3D.Geometry.build(mapData, {
        tileSize,
        elevationAt: (x, y) => Reactor3D.elevationAt(mapData, x, y),
        // Authored classification where it exists, flags as the guess where it
        // does not.
        isUpright: Reactor3D.uprightPredicate(tilesetId, flags),
        // An authored upright is never second-guessed by the facade cap.
        isAuthored: tileId => Reactor3D.isClassified(tilesetId, tileId),
        isScenery: Reactor3D.sceneryPredicate(tilesetId),
        isFoliage: Reactor3D.foliagePredicate(tilesetId),
        isPanel: Reactor3D.panelPredicate(tilesetId),
        // The same flag the 2D tilemap's upper layer uses, so a character walks
        // behind the same things in both views.
        isAbove: Reactor3D.abovePredicate(flags),
        standInFor: tileId => Reactor3D.standInFor(tilesetId, tileId),
        topFaceFor: tileId => Reactor3D.topFaceFor(tilesetId, tileId),
        declaredAt: tileId => Reactor3D.objectAt(tilesetId, tileId),
        // Painted on the map rather than derived from the tileset: which cells
        // the author says are one building.
        paintedAt: (x, y, layer) => Reactor3D.objectIdAt(mapData, x, y, layer),
        isPaintedGround: (x, y, layer) => Reactor3D.objectGroundAt(mapData, x, y, layer),
        sheetSize: setNumber => {
            const bitmap = bitmaps && bitmaps[setNumber];
            // The sheet's real size, so a non-standard sheet still maps its
            // pixels correctly rather than being stretched to an assumed 768.
            return {
                width: (bitmap && bitmap.width) || 768,
                height: (bitmap && bitmap.height) || 768
            };
        }
    });

    // The floor and the parallax grounds are one quad each; on a shaped map
    // they are cut into a grid and bent through the terrain like the tiles.
    // A map with a terrain grid at all counts, flat or not: the editor's
    // brush then moves the vertices it already has instead of rebuilding.
    this._terrainMap = Reactor3D.terrainOf(mapData) ? mapData : null;
    if (this._terrainMap) {
        for (const group of built.groups) {
            if (group.positions) group.baseY = Reactor3D.terrainBaseY(group.positions);
        }
    }
    Reactor3D.displaceByTerrain(built, mapData);

    // What each cell's surface ended up at, so a sprite standing on a shop's
    // roof is drawn on the roof rather than on the street below it.
    Reactor3D._surface = built.surface
        ? { heights: built.surface, width: built.width, height: built.height }
        : null;
    Reactor3D._facade = built.facade
        ? Object.assign({ width: built.width, height: built.height }, built.facade)
        : null;
    // Kept on the scene as well as globally: the editor builds a scene without
    // running a game, and rebuilds it on every edit.
    this._facade = Reactor3D._facade;

    // A parallax map's art is the parallax, not its tiles. Laid down first so
    // everything the tiles do contribute draws over it. The loader is handed in
    // by the editor, which has no ImageManager to fall back on.
    const loadParallax = settings.loadParallax
        || (name => Reactor3D.defaultParallaxLoader(name));
    this.addParallaxGrounds(Reactor3D.parallaxGroundLayers(mapData), loadParallax, tileSize);
    this.addRoom(Reactor3D.roomFor(mapData), loadParallax, tileSize, mapData.width, mapData.height);
    this.addSky(Reactor3D.skyFor(mapData), loadParallax, tileSize);
    // The 3D tileset: blocks on cells, on top of the ground just laid.
    this.addPieces(mapData, settings.loadMaterial || (name => Reactor3D.defaultMaterialLoader(name)));
    this.addWater(mapData, settings.loadMaterial || (name => Reactor3D.defaultMaterialLoader(name)));

    for (const group of built.groups) {
        const texture = this.textureFor(bitmaps && bitmaps[group.setNumber]);
        if (!texture) continue;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(group.positions, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(group.uvs, 2));
        // Where each vertex sits before the terrain lifts it, so a brush
        // stroke can lift it again in place (`updateTerrain`).
        if (group.baseY) geometry.userData.terrainBaseY = group.baseY;
        // What each quad may sample. See `clampToTile`: this is what keeps a
        // tile inside its own square of the sheet at any zoom.
        if (group.bounds) {
            geometry.setAttribute("uvBounds", new THREE.BufferAttribute(group.bounds, 4));
        }
        if (group.offsets) {
            geometry.setAttribute("offset", new THREE.BufferAttribute(group.offsets, 2));
        }
        geometry.setIndex(new THREE.BufferAttribute(group.indices, 1));
        geometry.computeVertexNormals();
        /*
         * A cut-out is not where its vertices say it is.
         *
         * Its quad is built in the vertex shader — every vertex of one object
         * sits at the same anchor, and the `offset` attribute carries the
         * corners out from it. Three.js computes the bounding sphere from the
         * positions, so it measures the anchors and nothing else: for a whole
         * building grouped onto one anchor that is very nearly a point, and
         * the structure vanished the moment the point left the frustum while
         * its art was still filling the screen.
         *
         * So the sphere is grown by the furthest any corner is pushed, plus
         * the half tile the shader steps everything towards the camera.
         * Culling still works — it is simply told the truth about the size.
         */
        if (group.offsets) {
            geometry.computeBoundingSphere();
            if (geometry.boundingSphere) {
                let reach = 0;
                for (let i = 0; i < group.offsets.length; i += 2) {
                    const corner = Math.hypot(group.offsets[i], group.offsets[i + 1]);
                    if (corner > reach) reach = corner;
                }
                geometry.boundingSphere.radius += reach + 0.5;
            }
        }
        if (group.anim) {
            // Keep the frame-0 UVs; every later frame is computed from them
            // rather than accumulated, so rounding cannot drift over an hour.
            this._animated.push({
                geometry,
                base: Float32Array.from(group.uvs),
                // The fragment shader clamps each tile to these bounds. They
                // must move with animated UVs or later A1 frames collapse onto
                // frame 0's edge pixels and look like block-colour chunks.
                baseBounds: group.bounds ? Float32Array.from(group.bounds) : null,
                stride: group.anim
            });
        }

        // Unlit to begin with, so colours match the 2D view exactly and any
        // difference on screen is geometry rather than shading. Lighting is a
        // later pass. Every surface keeps its painted alpha in colour; a
        // separate opaque-core pass below supplies both colour and depth.
        const material = group.billboard
            ? Reactor3D.billboardMaterial(texture, group.edgeHinged)
            // Unlit, with the ambient level applied as a plain multiplier on
            // the material's colour.
            //
            // Lambert under an AmbientLight was the obvious choice and it came
            // out visibly darker than the same map in 2D: three's shading
            // divides diffuse by pi, so "ambient 1" is nowhere near "unlit",
            // and the exact factor moves between three releases. Nothing here
            // needs a light model — the lights are additive quads drawn in
            // their own pass — so the scene is shaded the one way that is
            // guaranteed to match the 2D tilemap pixel for pixel: not at all.
            : new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                alphaTest: 0,
                // Upright panels are seen from either side as the camera turns,
                // and double-siding also means ground winding cannot silently
                // hide a whole sheet.
                side: THREE.DoubleSide,
                // Flat quads: one pass. three renders a double-sided transparent
                // material twice a frame otherwise, toggling needsUpdate each time,
                // which rebuilds its shader parameters every frame.
                forceSinglePass: true
            });
        // Every material now takes the ambient level, not just the cut-outs.
        material.opacity = group.underlay ? 0.6 : 1;
        material.__reactorShaded = true;
        // Two keys, because the billboard material injects a vertex shader the
        // flat one does not and they must not share a compiled program.
        Reactor3D.clampToTile(material,
            group.billboard ? "reactor3d-billboard-clamped" : "reactor3d-tile-clamped");
        Reactor3D.litMaterial(material);

        const target = group.above ? this.aboveGroup() : this.belowGroup();

        /*
         * Opaque texels supply colour and depth before fractional alpha blends.
         *
         * The old colorless alpha>=0.5 prepass wrote a foreground depth without
         * its colour. It then rejected the background that a 50% shadow needed
         * to blend over, leaving a hard cut or a blend against clear. Only
         * genuinely opaque source pixels belong in this pass, and they must
         * write their colour at the same time as their depth.
         */
        const opaqueCore = group.billboard
            ? Reactor3D.billboardMaterial(texture, group.edgeHinged)
            : new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        opaqueCore.transparent = false;
        opaqueCore.opacity = group.underlay ? 0.6 : 1;
        opaqueCore.depthWrite = true;
        // Three discards only values below the threshold, so 1.0 admits exact
        // alpha-255 texels and keeps alpha 254 plus filtered edge samples out of
        // depth. Those fractional pixels belong exclusively to the blend pass.
        opaqueCore.alphaTest = 1.0;
        opaqueCore.colorWrite = true;
        opaqueCore.__reactorShaded = true;
        Reactor3D.clampToTile(opaqueCore,
            group.billboard ? "reactor3d-billboard-clamped" : "reactor3d-tile-clamped");
        Reactor3D.litMaterial(opaqueCore);
        const coreMesh = new THREE.Mesh(geometry, opaqueCore);
        coreMesh.renderOrder = -20 + (group.layer || 0);
        target.add(coreMesh);
        this._meshes.push(coreMesh);
        this._materials.push(opaqueCore);

        Reactor3D.TransparentPixels.install(material);
        const mesh = new THREE.Mesh(geometry, material);
        // Two passes: the ground, and the part the 2D tilemap would have drawn
        // over the characters. They are separate groups so the renderer can
        // draw one, let PIXI put the characters down, and then draw the other.
        // The editor shows both groups in one render. Their billboard materials
        // are transparent, so without an explicit order three.js sorts whole
        // sheet meshes by centroid and can put an ordinary crater over the
        // starred structure that surrounds it. Match the 2D tilemap there too:
        // every upper-pass colour mesh draws after every lower-pass one.
        mesh.renderOrder = (group.above ? 10 : 0) + (group.layer || 0);
        target.add(mesh);
        this._meshes.push(mesh);
        this._materials.push(material);
    }
    this.freezeStaticMeshes();
};

/**
 * The world never moves once built: tiles, structures, and parallax grounds
 * stay where the map put them. three recomposes every object's matrix every
 * frame unless told the object is still; telling it saves that work for all
 * of them, per frame, for the life of the map. Anything that does move
 * (characters, billboards, lights) lives in other groups.
 */
Reactor3D.MapScene.prototype.freezeStaticMeshes = function() {
    for (const mesh of this._meshes) {
        if (!mesh || mesh.matrixAutoUpdate === false) continue;
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
    }
};

/**
 * Bring the scene's lights in line with what has been declared.
 *
 * Called every frame, so it edits in place: a light that is still there keeps
 * its object and only moves. Rebuilding the list each frame would drop and
 * recreate every shadow-casting object in three.js's internal state, which is
 * expensive and shows as a flicker.
 *
 * A cut-out is lit differently from the ground on purpose. Its normals mean
 * nothing — the shader rewrites the vertices to face the camera — so shading it
 * by them gives a tree lit from whichever way the sheet happened to be wound.
 * They take the ambient level as a flat multiplier instead, which is what makes
 * a wood go dark in a dark place without pretending to catch a lantern on one
 * side.
 */
/**
 * The soft disc every light is stamped with.
 *
 * Built once, in code, so a project ships no extra art: white fading to
 * nothing, which each light tints for itself. The falloff is squared rather
 * than linear because a linear ramp reads as a flat plate with a hard rim
 * instead of a pool of light.
 */
Reactor3D.roundLightTexture = function() {
    if (this._roundLight) return this._roundLight;
    this._roundLight = new THREE.CanvasTexture(this.roundLightCanvas());
    // Rows as drawn, not flipped: the cone below depends on which end of its
    // picture is the source, and both are built the same way so they cannot
    // drift apart.
    this._roundLight.flipY = false;
    return this._roundLight;
};

/** The falloff picture itself, shared with the flat renderer's sprites. */
Reactor3D.roundLightCanvas = function() {
    if (this._roundLightCanvas) return this._roundLightCanvas;
    // Generous, because one of these is stretched across hundreds of screen
    // pixels: at 128 the gradient banded and the rim came out as a visible
    // step rather than a fade.
    const size = 512, half = size / 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x + 0.5 - half) / half, dy = (y + 0.5 - half) / half;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const fade = distance >= 1 ? 0 : (1 - distance) * (1 - distance);
            const at = (y * size + x) * 4;
            image.data[at] = image.data[at + 1] = image.data[at + 2] = 255;
            image.data[at + 3] = Math.round(fade * 255);
        }
    }
    context.putImageData(image, 0, 0);
    this._roundLightCanvas = canvas;
    return canvas;
};

/** A flat sprite is rectangular, so its texture must supply the cone shape. */
Reactor3D.flatConeLightCanvas = function() {
    if (this._flatConeLightCanvas) return this._flatConeLightCanvas;
    const size = 512, canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d"), image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const along = 1 - (y + 0.5) / size;
        const across = Math.abs((x + 0.5) / size - 0.5) * 2 / Math.max(along, 1 / size);
        const rim = across >= 1 ? 0 : Math.pow(0.5 * (1 + Math.cos(across * Math.PI)), 2);
        const at = (y * size + x) * 4;
        image.data[at] = image.data[at + 1] = image.data[at + 2] = 255;
        image.data[at + 3] = Math.round(rim * Math.pow(1 - along, 2) * 255);
    }
    context.putImageData(image, 0, 0);
    return this._flatConeLightCanvas = canvas;
};

/** Keep flat haze translucent, using the volume renderer's body strengths. */
Reactor3D.flatLightOpacity = function(light) {
    const factor = light.type === this.LIGHT_BEAM ? 1.2 : light.type === this.LIGHT_SPOT ? 0.5 : 0.6;
    return Math.max(0, Math.min(0.85, this.VOLUME_GLOW * factor * (light.intensity ?? 1)));
};

/**
 * The same, for a cone.
 *
 * Drawn for one fixed spread and stretched to whatever a light actually asks
 * for: the quad is sized independently across and along, so the angle is a
 * property of the quad rather than of the picture. The source is the middle of
 * the bottom edge, which is where the thing holding the torch stands.
 */
Reactor3D.coneLightTexture = function() {
    if (this._coneLight) return this._coneLight;
    this._coneLight = new THREE.CanvasTexture(this.coneLightCanvas());
    // Without this the picture arrives upside down and a torch shines out of
    // the wall it is pointing at instead of out of the hand holding it.
    this._coneLight.flipY = false;
    return this._coneLight;
};

/** The cone's falloff picture, shared with the flat renderer's sprites. */
Reactor3D.coneLightCanvas = function() {
    if (this._coneLightCanvas) return this._coneLightCanvas;
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // The quad this is painted on is already the cone: a trapezoid
            // that starts narrow at the torch and opens to the beam's width at
            // its far end. So the picture must NOT draw a wedge of its own.
            // It did, and the two wedges multiplied into a pinched triangle
            // that was transparent at the very place the light comes from —
            // the shape was being applied twice and the brightness backwards.
            //
            // All this owes the quad is falloff: soft at the rim, fading out
            // at range.
            const v = (y + 0.5) / size;
            // v runs tip -> source, because the quad's near corners are given
            // v = 1. Distance from the torch is therefore the other way round.
            const fromSource = 1 - v;
            const across = Math.abs((x + 0.5) / size - 0.5) * 2;
            // Raised cosines rather than polynomials. `1 - across^2` still
            // meets the rim at a slope, and against a dark map that slope
            // reads as an edge — the beam looked like a cut-out triangle
            // rather than light. A raised cosine arrives at nothing with no
            // slope at all, at the rim and at the far end both, which is the
            // soft-shouldered falloff the 2D plugin gets by stacking blurred
            // circles.
            //
            // Squared, so the shoulder is wider still and the lit core narrower
            // than the wedge that carries it. A beam whose brightness runs all
            // the way out to the geometry has a visible straight edge however
            // smoothly it fades there, because the edge is where it stops
            // existing rather than where it stops being bright.
            const rim = 0.5 * (1 + Math.cos(Math.min(across, 1) * Math.PI));
            const beam = rim * rim;
            const reach = 0.5 * (1 + Math.cos(Math.min(fromSource, 1) * Math.PI));
            const at = (y * size + x) * 4;
            image.data[at] = image.data[at + 1] = image.data[at + 2] = 255;
            image.data[at + 3] = Math.round(beam * reach * 255);
        }
    }
    context.putImageData(image, 0, 0);
    this._coneLightCanvas = canvas;
    return canvas;
};

/**
 * A beam's falloff picture: a bar of constant width with a bright core and
 * soft shoulders, fading only gently along its length. Painted on a quad
 * `2 * width` across and `radius` along, source at the middle of the bottom
 * edge like the cone's.
 */
Reactor3D.beamLightCanvas = function() {
    if (this._beamLightCanvas) return this._beamLightCanvas;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const fromSource = 1 - (y + 0.5) / size;
            const across = Math.abs((x + 0.5) / size - 0.5) * 2;
            const rim = 0.5 * (1 + Math.cos(Math.min(across, 1) * Math.PI));
            const core = Math.min(1, rim * rim + (across < 0.35 ? 0.35 : 0));
            const reach = Math.sqrt(Math.max(0, 1 - fromSource));
            const at = (y * size + x) * 4;
            image.data[at] = image.data[at + 1] = image.data[at + 2] = 255;
            image.data[at + 3] = Math.round(Math.min(1, core) * reach * 255);
        }
    }
    context.putImageData(image, 0, 0);
    this._beamLightCanvas = canvas;
    return canvas;
};

/**
 * One mesh holding every light of one shape.
 *
 * Buffers are allocated once at their largest and only the used part is drawn,
 * so a frame with forty lights costs forty quads of arithmetic and no
 * allocation at all. Additive, because light adds; depth-tested so a wall hides
 * the pool behind it, but not depth-*written*, so two overlapping pools do not
 * punch holes in each other.
 */
Reactor3D.MapScene.prototype.lightPool = function(kind) {
    if (!this._pools) this._pools = {};
    if (this._pools[kind]) return this._pools[kind];

    const quads = Reactor3D.MAX_LIGHTS;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",
        new THREE.BufferAttribute(new Float32Array(quads * 4 * 3), 3));
    geometry.setAttribute("uv",
        new THREE.BufferAttribute(new Float32Array(quads * 4 * 2), 2));
    geometry.setAttribute("color",
        new THREE.BufferAttribute(new Float32Array(quads * 4 * 3), 3));
    const indices = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) {
        const base = i * 4;
        indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i * 6);
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.MeshBasicMaterial({
        map: kind === "cone" ? Reactor3D.coneLightTexture() : Reactor3D.roundLightTexture(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // Nothing occludes a light. Depth-testing them looked physical and was
        // wrong for a view where the ground is 3D and the people on it are
        // flat: a doorway standing between the lamp and its own pool of light
        // sliced a bite out of it. Light is the last thing drawn and it goes
        // over everything, which is also what makes it fall *on* the sprites
        // rather than behind them. It removes the coplanar flicker the pool
        // used to need a polygon offset to avoid, too.
        depthTest: false,
        side: THREE.DoubleSide,
        // NOT forceSinglePass, unlike the other flat quads: additive light
        // drawn back face then front adds itself twice, and every authored
        // intensity was tuned against that. One pass halves every light.
        forceSinglePass: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;   // the buffer is rewritten every frame
    mesh.renderOrder = 10;
    // A pass of their own, drawn last and composited *additively*.
    //
    // Sharing the pass that carries star-flagged tiles would not do: that one
    // is drawn over the scene with ordinary blending, because a tree has to
    // cover what is behind it. Light does not cover anything — it adds. Put in
    // with the trees, a lantern arrived as a pale disc painted over the ground
    // rather than as light falling on it, which reads as dim and oddly solid
    // at the same time.
    this.lightGroup().add(mesh);
    this._materials.push(material);
    this._pools[kind] = { mesh, geometry, count: 0 };
    return this._pools[kind];
};

/**
 * Lay this frame's lights on the ground.
 *
 * The ambient light is the only real one: it is the darkness everything is seen
 * against, and being one light it costs the shader nothing. Everything else is
 * geometry.
 */
Reactor3D.MapScene.prototype.syncLights = function(focus) {
    if (!this._scene) return;
    const ambient = Reactor3D.ambient();
    const level = ambient && ambient.intensity !== undefined ? ambient.intensity : 1;
    const colour = ambient && ambient.colour !== undefined ? ambient.colour : 0xffffff;
    // Dimmed rather than shaded, cut-outs and ground alike: normals mean
    // nothing to a billboard, whose vertices the shader rewrites to face the
    // camera, and a light model buys the ground nothing when the lights
    // themselves are additive quads in a pass of their own.
    // Re-applied when the ambient changes AND when the material list grows:
    // wall and floor chunks build lazily, and one arriving after the last
    // ambient set kept its construction white — a fully lit slab in a dark
    // room — until the next ambient change happened to repaint it.
    if (this._ambientLevel !== level || this._ambientColour !== colour
        || this._ambientCount !== this._materials.length) {
        this._ambientLevel = level;
        this._ambientColour = colour;
        this._ambientCount = this._materials.length;
        const r = (((colour >> 16) & 255) / 255) * level;
        const g = (((colour >> 8) & 255) / 255) * level;
        const b = ((colour & 255) / 255) * level;
        // Lit materials read the ambient from the shared uniform and keep
        // their base colour; the multiply below is for anything unlit.
        const shared = Reactor3D.lightUniforms().rrAmbient.value;
        shared[0] = r;
        shared[1] = g;
        shared[2] = b;
        for (const material of this._materials) {
            if (material.__reactorLit) continue;
            if (material.__reactorModel) {
                const base = material.userData.baseColor;
                if (base) material.color.setRGB(base.r * r, base.g * g, base.b * b);
                continue;
            }
            if (material.__reactorBillboard || material.__reactorShaded) {
                material.color.setRGB(r, g, b);
            }
        }
    }

    // Still ranked by distance, though the budget is now generous: a light
    // whose radius cannot reach the player writes no quad and costs nothing.
    //
    // The quads lie FLAT on the ground: a pool of light is a thing on the
    // floor, and a beam is a wedge along it. They were camera-facing
    // billboards once, sized to match the 2D art — but a billboard glow
    // hangs in the air, floats onto the wall a player faces, and reads as a
    // sticker in first person. Light on the ground behaves in three
    // dimensions: walk past it and it stays put; face away and it is simply
    // behind you.
    const camera = Reactor3D.viewport() && Reactor3D.viewport().camera();
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 0, -1);

    const declared = Reactor3D.nearestLights(Reactor3D.lights(), focus);
    if (Reactor3D.lightModeFor() === "volume") {
        this.syncVolumeLights(declared, focus);
        return;
    }
    // Flat quads: the lit materials see no lights, only the ambient.
    Reactor3D.lightUniforms().rrLightCount.value = 0;
    if (this._lightBodies) this._lightBodies.trim(0);
    const round = this.lightPool("round");
    const cone = this.lightPool("cone");
    round.count = 0;
    cone.count = 0;

    for (const light of declared) {
        const beam = light.type === Reactor3D.LIGHT_BEAM;
        const spot = light.type === Reactor3D.LIGHT_SPOT || beam;
        const pool = spot ? cone : round;
        if (pool.count >= Reactor3D.MAX_LIGHTS) continue;
        const radius = light.radius > 0 ? light.radius : 0;
        if (!(radius > 0)) continue;

        const at = pool.count++;
        const position = pool.geometry.attributes.position.array;
        const uv = pool.geometry.attributes.uv.array;
        const tint = pool.geometry.attributes.color.array;

        // On the surface it belongs to, a hair clear of it, and above any pool
        // already written below it.
        //
        // `groundY` was read here and set nowhere, so every light in the scene
        // sat at street level however high the thing carrying it stood. A
        // searchlight on a tower roof was drawn on the pavement — and since a
        // perspective camera moves a raised point differently from a ground
        // one, it did not merely sit low, it sat somewhere else entirely.
        // A light on a wall belongs on the wall.
        //
        // Placed by the ground alone, a neon sign's glow sat at street level
        // at its own map row while the sign it comes from had been stood
        // several tiles up and a couple of tiles further back — so it lit the
        // pavement instead of the shopfront, and slid against it as the camera
        // panned. This is the same rule the sign's own sprite follows, so the
        // two cannot come apart.
        const facade = Reactor3D.facadeAt(Math.round(light.x), Math.round(light.y));
        const standsOn = light.groundY !== undefined
            ? light.groundY
            : (facade ? facade.height : Reactor3D.surfaceHeightAt(
                typeof $dataMap !== "undefined" ? $dataMap : null,
                Math.round(light.x), Math.round(light.y)));
        // Up the wall along the axis its courses were stacked on, so a glow
        // and the sign it comes from cannot part company.
        // A caller that names the ground names the whole height: a light
        // riding a model's anchor is already where it is.
        const lift = facade && light.groundY === undefined ? facade.lift : 0;
        const y = standsOn + lift + 0.02 + at * 0.0005;
        // The middle across, and the southern edge along — the same place a
        // character or a prop on this cell stands. A pool centred half a tile
        // north of the lamp casting it does not look like its light.
        const cx = light.x + 0.5;
        const cz = facade ? facade.z : light.y + 1;

        // A lamp in the next room stays in the next room. The quads draw over
        // everything, so the wall between the camera and the light must be
        // honoured here or its glow floats on this side of the wall.
        if (Reactor3D.LIGHT_OCCLUSION && light.occlude !== false && camera) {
            const eye = camera.getWorldPosition(Reactor3D._lightEye || (Reactor3D._lightEye = new THREE.Vector3()));
            // Only an eye standing in open interior plays hide-the-lamp with
            // walls. A camera past the room's shell — the cinematic exterior
            // angle, the editor orbiting the map — sees the whole interior
            // the renderer draws anyway, and marching its segments through
            // the shell blacked out every light on the map.
            if (Reactor3D.lightEyeInterior(eye)
                && Reactor3D.lightSegmentBlocked(eye.x - 0.5, eye.z - 1, eye.y, light.x, light.y, standsOn + 0.5)) {
                pool.count--;
                continue;
            }
        }

        let corners;
        if (spot) {
            const angle = ((light.angle === undefined ? 45 : light.angle) * Math.PI) / 180;
            // The direction it points, flattened into the billboard's plane.
            const yaw = ((light.yaw || 0) * Math.PI) / 180;
            const aim = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            // Shortened to the first wall in its way, spread and all — a
            // torch aimed at a wall used to paint its full length up the
            // wall's face and out the far side.
            const beamReach = Reactor3D.LIGHT_OCCLUSION
                ? Reactor3D.clampConeReach(light.x, light.y, standsOn + 0.5, aim.x, aim.z, radius)
                : radius;
            // A beam is as wide at the source as at the tip.
            const half = beam
                ? (light.width === undefined ? Reactor3D.DEFAULT_BEAM_WIDTH : light.width)
                : Math.tan(Math.min(angle, Math.PI * 0.49) / 2) * beamReach;
            let alongU = aim.dot(right);
            let alongV = aim.dot(up);
            const reach = Math.hypot(alongU, alongV) || 1;
            alongU /= reach;
            alongV /= reach;
            const sideU = -alongV, sideV = alongU;
            const tipU = alongU * beamReach, tipV = alongV * beamReach;
            // A true apex, not a short near edge. As a trapezoid the quad was
            // split into two triangles whose UVs interpolate independently,
            // and the crease along that diagonal showed as a bright slit up
            // the middle of the beam. Collapsed to a point the lit half is one
            // triangle, which has no seam to show, and the other is degenerate
            // and draws nothing.
            corners = beam ? [
                [tipU - sideU * half, tipV - sideV * half],
                [tipU + sideU * half, tipV + sideV * half],
                [sideU * half, sideV * half],
                [-sideU * half, -sideV * half]
            ] : [
                [tipU - sideU * half, tipV - sideV * half],
                [tipU + sideU * half, tipV + sideV * half],
                [0, 0],
                [0, 0]
            ];
        } else {
            corners = [
                [-radius, radius], [radius, radius],
                [radius, -radius], [-radius, -radius]
            ];
        }

        // Both apex corners take the middle of the source edge, so the one
        // triangle that draws maps the picture symmetrically about its axis.
        const uvs = spot && !beam
            ? [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]
            : [[0, 0], [1, 0], [1, 1], [0, 1]];
        const rgb = light.colour === undefined ? 0xffffff : light.colour;
        const intensity = (light.intensity === undefined ? 1 : light.intensity)
            * Reactor3D.LIGHT_GAIN;
        let r = (((rgb >> 16) & 255) / 255) * intensity;
        let g = (((rgb >> 8) & 255) / 255) * intensity;
        let b = ((rgb & 255) / 255) * intensity;
        // Held to its hue. Clamping happens per channel, so a colour with one
        // channel over full loses that channel's lead over the others and the
        // light drifts towards white; scaling all three keeps the colour the
        // author picked and only costs brightness.
        const peak = Math.max(r, g, b);
        if (peak > 1) { r /= peak; g /= peak; b /= peak; }

        for (let corner = 0; corner < 4; corner++) {
            const v = at * 4 + corner;
            // Plane coordinates back into the world, on the ground's axes.
            const u = corners[corner][0];
            const w = corners[corner][1];
            position[v * 3] = cx + right.x * u + up.x * w;
            position[v * 3 + 1] = y + right.y * u + up.y * w;
            position[v * 3 + 2] = cz + right.z * u + up.z * w;
            uv[v * 2] = uvs[corner][0];
            uv[v * 2 + 1] = uvs[corner][1];
            tint[v * 3] = r;
            tint[v * 3 + 1] = g;
            tint[v * 3 + 2] = b;
        }
    }

    for (const pool of [round, cone]) {
        pool.geometry.setDrawRange(0, pool.count * 6);
        pool.geometry.attributes.position.needsUpdate = true;
        pool.geometry.attributes.uv.needsUpdate = true;
        pool.geometry.attributes.color.needsUpdate = true;
        pool.mesh.visible = pool.count > 0;
    }
};

/**
 * This frame's lights as a field: the nearest `SHADER_LIGHTS` to the focus
 * written into the shared uniforms every lit material reads, and a glowing
 * body stood at each source. No pass, no quads, no buffer upload — three
 * small arrays and a handful of transforms.
 *
 * A light's world position is where the flat pool was centred (the middle
 * across, the southern edge along, on the facade it hangs on) plus its
 * authored height straight up — the one number the quads had to discard.
 */
Reactor3D.MapScene.prototype.syncVolumeLights = function(declared, focus) {
    const uniforms = Reactor3D.lightUniforms();
    const max = Reactor3D.SHADER_LIGHTS;
    let list = declared || [];
    if (list.length > max) {
        // Nearest first, by how far short of the focus its reach stops.
        const fx = focus ? focus.x : 0;
        const fy = focus ? focus.y : 0;
        const gap = light => Math.hypot((light.x || 0) - fx, (light.y || 0) - fy) - (light.radius || 0);
        list = list.slice().sort((a, b) => gap(a) - gap(b)).slice(0, max);
    }
    const pos = uniforms.rrLightPos.value;
    const col = uniforms.rrLightColor.value;
    const aim = uniforms.rrLightAim.value;
    const bodies = this.lightBodies();
    const mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
    const candidates = [];
    const fx = focus ? focus.x : 0;
    const fy = focus ? focus.y : 0;
    let count = 0;
    let bodyCount = 0;
    // Bounds belong to this light update only: every beam sees the same pose,
    // but the next update must see movement, animation and replaced models.
    let beamBounds = null;
    for (const light of list) {
        const radius = light.radius > 0 ? light.radius : 0;
        if (!(radius > 0) || count >= max) continue;
        const beam = light.type === Reactor3D.LIGHT_BEAM;
        const spot = light.type === Reactor3D.LIGHT_SPOT || beam;
        const width = light.width === undefined ? Reactor3D.DEFAULT_BEAM_WIDTH : light.width;
        const facade = Reactor3D.facadeAt(Math.round(light.x), Math.round(light.y));
        const standsOn = light.groundY !== undefined
            ? light.groundY
            : (facade ? facade.height
                : Reactor3D.surfaceHeightAt(mapData, Math.round(light.x), Math.round(light.y)));
        const lift = facade && light.groundY === undefined ? facade.lift : 0;
        const height = light.height === undefined ? Reactor3D.PLUGIN_LIGHT_HEIGHT : light.height;
        const x = light.x + 0.5;
        const y = standsOn + lift + height;
        const z = facade ? facade.z : light.y + 1;

        // A light that cannot reach the view lights nothing anyone can see,
        // and its glowing body is at the same place, so neither is drawn.
        // This is free frame time, not a quality setting: the pixels come
        // out identical. Nine of the Demo's ten lights are off screen at
        // any moment, and every lit fragment was paying for all ten.
        if (!Reactor3D.sphereInView(x, y, z, radius)) continue;

        const rgb = light.colour === undefined ? 0xffffff : light.colour;
        const intensity = (light.intensity === undefined ? 1 : light.intensity) * Reactor3D.LIGHT_GAIN;
        const r = ((rgb >> 16) & 255) / 255;
        const g = ((rgb >> 8) & 255) / 255;
        const b = (rgb & 255) / 255;
        const gain = intensity * Reactor3D.VOLUME_LIGHT_GAIN;

        let ax = 0, ay = -1, az = 0, cosHalf = -1;
        let angle = 0;
        if (spot) {
            const yaw = ((light.yaw || 0) * Math.PI) / 180;
            const pitch = ((light.pitch || 0) * Math.PI) / 180;
            const level = Math.cos(pitch);
            ax = Math.sin(yaw) * level;
            ay = Math.sin(pitch);
            az = Math.cos(yaw) * level;
            angle = (light.angle === undefined ? Reactor3D.DEFAULT_CONE_ANGLE : light.angle);
            cosHalf = Math.cos((Math.min(angle, 178) * Math.PI) / 360);
        }

        // A beam stops where it lands, and lands as a bright dot: the beam
        // itself reaches only to the surface, and a small point light sits
        // on the surface there so the spot it makes is lit like one.
        let reach = radius;
        let hit = null;
        if (beam) {
            const landed = Reactor3D.beamHit(light.x, light.y, y, ax, ay, az, radius, this,
                beamBounds || (beamBounds = new Map()));
            if (landed !== null) {
                reach = landed;
                hit = { x: x + ax * reach, y: y + ay * reach, z: z + az * reach };
                // The dot sits on the near face of what the beam struck. A
                // camera farther along the beam than the landing is looking
                // at that surface's back — through a wall the view has
                // hidden, from behind it — and cannot see the dot.
                const eye = Reactor3D.viewEye();
                hit.facesEye = !eye || ((eye.x - hit.x) * ax + (eye.y - hit.y) * ay + (eye.z - hit.z) * az) <= 0;
            }
        }
        const at = count * 4;
        pos[at] = x; pos[at + 1] = y; pos[at + 2] = z; pos[at + 3] = reach;
        // The colour's w says the shape: 0 a sphere, 1 a cone, 2 a beam. The
        // aim's w is what that shape needs — the cone's cosine of its half
        // angle, the beam's half width in tiles.
        col[at] = r * gain; col[at + 1] = g * gain; col[at + 2] = b * gain; col[at + 3] = beam ? 2 : spot ? 1 : 0;
        aim[at] = ax; aim[at + 1] = ay; aim[at + 2] = az; aim[at + 3] = beam ? width * 0.5 : cosHalf;
        // Bodies are counted separately so the pool stays packed when a
        // light asks not to be seen (a carried torch); `trim` below takes
        // the body count, not the light count.
        if (light.body !== false) {
            bodies.place(bodyCount, {
                x, y, z, radius: reach, spot, beam, width, r, g, b, angle, ax, ay, az, hit,
                intensity: light.intensity === undefined ? 1 : light.intensity
            });
            bodyCount++;
        }
        if (hit && count + 1 < max) {
            count++;
            const dot = count * 4;
            const dotGain = gain * Reactor3D.BEAM_DOT_GAIN;
            pos[dot] = hit.x; pos[dot + 1] = hit.y; pos[dot + 2] = hit.z;
            pos[dot + 3] = Math.max(width * Reactor3D.BEAM_DOT_REACH, 0.3);
            col[dot] = r * dotGain; col[dot + 1] = g * dotGain; col[dot + 2] = b * dotGain; col[dot + 3] = 0;
            aim[dot] = 0; aim[dot + 1] = -1; aim[dot + 2] = 0; aim[dot + 3] = -1;
        }
        if (light.shadow !== false) {
            const gap = Math.hypot((light.x || 0) - fx, (light.y || 0) - fy) - radius;
            candidates.push({
                index: count,
                id: light.id !== undefined && light.id !== null ? String(light.id) : "#" + count,
                x, y: y + Math.max(0, Reactor3D.SHADOW_LIFT - height), z, radius,
                gap,
                // What `Shadows._incident` needs to say how much of this
                // light lands on the player: where it really is, its shape
                // and aim, and how bright it is.
                lightY: y, spot, beam, ax, ay, az, cosHalf, width,
                priorityRadius: light.priorityRadius === undefined ? radius : light.priorityRadius,
                strength: (light.priorityIntensity === undefined ? (light.intensity === undefined ? 1 : light.intensity) : light.priorityIntensity) * (r + g + b) / 3,
                carrier: light.carrier || null
            });
        }
        count++;
    }
    uniforms.rrLightCount.value = count;
    Reactor3D.LightGrid.update(uniforms, focus);
    bodies.trim(bodyCount);
    Reactor3D.Shadows.setCandidates(candidates);
};

/**
 * The frame's shadow maps, before the first pass draws: see `Reactor3D.Shadows`.
 */
Reactor3D.MapScene.prototype.renderShadows = function(renderer, mapData) {
    if (!this._scene) return;
    Reactor3D.Shadows.render(renderer, this._scene, mapData);
};

/**
 * The glowing bodies of the lights: a soft sphere at a point light, the cone
 * of a spotlight, and a bright core at either source. Additive, depth-tested
 * and never depth-written, so a wall hides the lamp behind it and two glows
 * pass through each other. Kept in the world's own pass, because they are
 * things standing in the world.
 */
Reactor3D.MapScene.prototype.lightBodies = function() {
    if (this._lightBodies) return this._lightBodies;
    const group = new THREE.Group();
    group.name = "light-bodies";
    this._scene.add(group);
    this._lightBodyGroup = group;
    const down = new THREE.Vector3(0, -1, 0);
    const aimVector = new THREE.Vector3();
    const glows = [];
    const cores = [];
    const cones = [];
    const beams = [];
    const dots = [];
    const bodies = {
        group, glows, cores, cones, beams, dots,
        place(index, light) {
            // The laser dot: a bright soft disc where a beam lands, drawn a
            // hair back along the beam so the surface it lit does not hide it.
            let dot = dots[index];
            if (light.beam && light.hit && light.hit.facesEye !== false) {
                if (!dot) {
                    dot = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: Reactor3D.roundLightTexture(),
                        blending: THREE.AdditiveBlending,
                        transparent: true,
                        depthWrite: false,
                        depthTest: true,
                        fog: false
                    }));
                    dot.renderOrder = 14;
                    group.add(dot);
                    dots[index] = dot;
                }
                dot.visible = true;
                dot.position.set(light.hit.x - light.ax * 0.03, light.hit.y - light.ay * 0.03, light.hit.z - light.az * 0.03);
                const dotSize = Math.max(light.width * Reactor3D.BEAM_DOT_SIZE, 0.12);
                dot.scale.set(dotSize, dotSize, 1);
                dot.material.color.setRGB(light.r, light.g, light.b);
                dot.material.opacity = Math.min(1, Reactor3D.VOLUME_GLOW * 1.8 * light.intensity);
            } else if (dot) {
                dot.visible = false;
            }
            let core = cores[index];
            if (!core) {
                core = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: Reactor3D.roundLightTexture(),
                    blending: THREE.AdditiveBlending,
                    transparent: true,
                    depthWrite: false,
                    depthTest: true,
                    fog: false
                }));
                core.renderOrder = 13;
                group.add(core);
                cores[index] = core;
            }
            core.visible = true;
            core.position.set(light.x, light.y, light.z);
            // A beam's source is a pinpoint, not a ball around the emitter.
            const coreSize = light.beam ? Math.max(light.width * 2, 0.06) : Math.min(light.radius, light.spot ? 0.9 : 0.7);
            core.scale.set(coreSize, coreSize, 1);
            core.material.color.setRGB(light.r, light.g, light.b);
            core.material.opacity = Math.min(1, Reactor3D.VOLUME_GLOW * light.intensity);

            let glow = glows[index];
            if (!glow) {
                glow = new THREE.Mesh(Reactor3D.sphereBodyGeometry(), Reactor3D.lightBodyMaterial());
                glow.material.uniforms.alongFade.value = 0;
                glow.renderOrder = 11;
                group.add(glow);
                glows[index] = glow;
            }
            let cone = cones[index];
            let beamBody = beams[index];
            if (light.beam) {
                glow.visible = false;
                if (cone) cone.visible = false;
                if (!beamBody) {
                    beamBody = new THREE.Mesh(Reactor3D.beamBodyGeometry(), Reactor3D.beamBodyMaterial());
                    beamBody.renderOrder = 12;
                    group.add(beamBody);
                    beams[index] = beamBody;
                }
                beamBody.visible = true;
                beamBody.position.set(light.x, light.y, light.z);
                beamBody.scale.set(light.width * 0.5, light.radius, light.width * 0.5);
                aimVector.set(light.ax, light.ay, light.az).normalize();
                beamBody.quaternion.setFromUnitVectors(down, aimVector);
                beamBody.material.uniforms.colour.value.setRGB(light.r, light.g, light.b);
                beamBody.material.uniforms.strength.value = Reactor3D.VOLUME_GLOW * 1.2 * light.intensity;
            } else if (light.spot) {
                if (beamBody) beamBody.visible = false;
                glow.visible = false;
                if (!cone) {
                    cone = new THREE.Mesh(Reactor3D.coneBodyGeometry(), Reactor3D.lightBodyMaterial());
                    cone.renderOrder = 12;
                    group.add(cone);
                    cones[index] = cone;
                }
                cone.visible = true;
                cone.position.set(light.x, light.y, light.z);
                const spread = Math.tan((Math.min(light.angle, 178) * Math.PI) / 360) * light.radius;
                cone.scale.set(spread, light.radius, spread);
                aimVector.set(light.ax, light.ay, light.az).normalize();
                cone.quaternion.setFromUnitVectors(down, aimVector);
                cone.material.uniforms.colour.value.setRGB(light.r, light.g, light.b);
                cone.material.uniforms.strength.value = Reactor3D.VOLUME_GLOW * 0.5 * light.intensity;
            } else {
                if (cone) cone.visible = false;
                if (beamBody) beamBody.visible = false;
                glow.visible = true;
                glow.position.set(light.x, light.y, light.z);
                // The haze is smaller than the reach: the reach is where the
                // light stops falling on things, not a ball of fog that size.
                // A lamp's haze grows with its reach; a sun's reach is the
                // whole map, and its ball stays a ball in the sky.
                const haze = Math.min(light.radius * 0.45, Reactor3D.LIGHT_HAZE_MAX);
                glow.scale.set(haze, haze, haze);
                glow.material.uniforms.colour.value.setRGB(light.r, light.g, light.b);
                glow.material.uniforms.strength.value = Reactor3D.VOLUME_GLOW * 0.6 * light.intensity;
            }
        },
        trim(count) {
            for (let i = count; i < cores.length; i++) cores[i].visible = false;
            for (let i = count; i < glows.length; i++) glows[i].visible = false;
            for (let i = count; i < cones.length; i++) if (cones[i]) cones[i].visible = false;
            for (let i = count; i < beams.length; i++) if (beams[i]) beams[i].visible = false;
            for (let i = count; i < dots.length; i++) if (dots[i]) dots[i].visible = false;
        },
        dispose() {
            for (const list of [cores, glows, cones, beams, dots]) {
                for (const body of list) {
                    if (!body) continue;
                    if (body.parent) body.parent.remove(body);
                    if (body.material) body.material.dispose();
                }
                list.length = 0;
            }
            if (group.parent) group.parent.remove(group);
        }
    };
    this._lightBodies = bodies;
    return bodies;
};

/** A unit sphere, scaled per light. */
Reactor3D.sphereBodyGeometry = function() {
    if (!this._sphereBody) this._sphereBody = new THREE.SphereGeometry(1, 24, 16);
    return this._sphereBody;
};

/** A unit cylinder starting at the origin and running along -Y; scaled to a beam's width and length. */
Reactor3D.beamBodyGeometry = function() {
    if (!this._beamBody) {
        const tube = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
        tube.translate(0, -0.5, 0);
        this._beamBody = tube;
    }
    return this._beamBody;
};

/** A unit cone with its apex at the origin, opening along -Y; scaled and aimed per light. */
Reactor3D.coneBodyGeometry = function() {
    if (!this._coneBody) {
        const cone = new THREE.ConeGeometry(1, 1, 32, 1, true);
        cone.translate(0, -0.5, 0);
        this._coneBody = cone;
    }
    return this._coneBody;
};

/**
 * The haze of a light's body: brightest where its surface faces the eye and
 * fading to nothing at the silhouette, so a sphere reads as a soft ball and
 * a cone as a beam rather than a solid; a cone also fades along its length,
 * squared, like the falloff of the light it shows. One material per body,
 * since each carries its own colour.
 */
Reactor3D.lightBodyMaterial = function() {
    return new THREE.ShaderMaterial({
        uniforms: {
            colour: { value: new THREE.Color(1, 1, 1) },
            strength: { value: 0.3 },
            // 1 fades the body along -Y, which is a cone's length from its
            // apex; 0 keeps it whole, which is what a sphere wants — with the
            // fade on, its lower half faded to nothing and a big glow read
            // as a half circle.
            alongFade: { value: 1 }
        },
        vertexShader: [
            "varying float vAlong;",
            "varying vec3 vNormalW;",
            "varying vec3 vToEye;",
            "void main() {",
            "\tvAlong = clamp(-position.y, 0.0, 1.0);",
            "\tvec4 world = modelMatrix * vec4(position, 1.0);",
            "\tvNormalW = normalize(mat3(modelMatrix) * normal);",
            "\tvToEye = cameraPosition - world.xyz;",
            "\tgl_Position = projectionMatrix * viewMatrix * world;",
            "}"
        ].join("\n"),
        fragmentShader: [
            "uniform vec3 colour;",
            "uniform float strength;",
            "uniform float alongFade;",
            "varying float vAlong;",
            "varying vec3 vNormalW;",
            "varying vec3 vToEye;",
            "void main() {",
            "\tfloat facing = abs(dot(normalize(vNormalW), normalize(vToEye)));",
            "\tfloat soft = pow(facing, 1.6);",
            "\tfloat along = 1.0 - vAlong * alongFade;",
            "\tfloat a = strength * soft * along * along;",
            "\tgl_FragColor = vec4(colour * a, a);",
            "}"
        ].join("\n"),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        // Both faces contribute additively; one draw retains both surfaces.
        forceSinglePass: true,
        fog: false
    });
};

/**
 * The body of a beam. The sphere and cone material fades to nothing at the
 * silhouette, which reads as a soft ball or a glow cone — and makes a long
 * thin cylinder vanish whenever it is seen along its length, since every
 * side normal is then square to the eye. A laser keeps a floor of
 * brightness at any angle, softens only mildly at its edge, and fades
 * linearly along its length like the light it shows.
 */
Reactor3D.beamBodyMaterial = function() {
    const material = this.lightBodyMaterial();
    material.fragmentShader = [
        "uniform vec3 colour;",
        "uniform float strength;",
        "varying float vAlong;",
        "varying vec3 vNormalW;",
        "varying vec3 vToEye;",
        "void main() {",
        "\tfloat facing = abs(dot(normalize(vNormalW), normalize(vToEye)));",
        "\tfloat soft = mix(0.45, 1.0, pow(facing, 0.5));",
        "\tfloat along = 1.0 - vAlong;",
        "\tfloat a = strength * soft * along;",
        "\tgl_FragColor = vec4(colour * a, a);",
        "}"
    ].join("\n");
    material.needsUpdate = true;
    return material;
};

Reactor3D.MapScene.prototype.clear = function() {
    Reactor3D.EffekseerScene?.stopScene(this._scene);
    Reactor3D.CoveredFloor?._scenes.delete(this._scene);
    this._animated = [];
    this._frame = -1;
    this._facade = null;
    // Disposed with the rest below, since it is in `_meshes`; dropped by name
    // so a late-arriving load listener does not attach it to a cleared scene.
    this._parallaxGround = null;
    this._destinationMarker = null;
    // Counted per build: a load listener taken out during one build must not
    // lay its quad into the next.
    this._build = (this._build || 0) + 1;
    this._pieceMeshes = [];
    this._pieceGhosts = [];
    this._cutCaps = [];
    this._waterMeshes = [];
    this._pieceMaterials = null;
    this._pieceGhostMaterials = null;
    this._materialTextures = null;
    // The light pools live in the pass groups rather than in `_meshes`, so
    // they have to be let go of by name or a rebuilt map keeps the old ones.
    for (const kind of Object.keys(this._pools || {})) {
        const pool = this._pools[kind];
        if (pool.mesh.parent) pool.mesh.parent.remove(pool.mesh);
        pool.geometry.dispose();
    }
    this._pools = {};
    if (this._lightBodies) {
        this._lightBodies.dispose();
        this._lightBodies = null;
        this._lightBodyGroup = null;
    }
    for (const mesh of this._meshes) {
        // Meshes live in one of the two pass groups now, so removing them from
        // the scene itself would leave every one of them behind.
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();
    }
    for (const material of this._materials) material.dispose();
    for (const texture of this._textures) texture.dispose();
    this._meshes = [];
    this._materials = [];
    this._textures = [];
};

Reactor3D.MapScene.prototype.destroy = function() {
    this.clear();
    this._belowGroup = null;
    this._aboveGroup = null;
    this._lightGroup = null;
    this._scene = null;
};

//-----------------------------------------------------------------------------
// Camera
//
// A pitched view of the grid. The focus point is a map cell, so following the
// player is a matter of handing over its position rather than tracking a
// separate camera object.

/** Pick the nearest horizontal ground surface, including elevated tiles. */
Reactor3D.groundTileFromRay = function(map, origin, direction) {
    if (!map || Math.abs(direction.y) < 1e-8) return null;
    const heights = new Set([0]);
    for (const height of map.reactor3d?.elevation || []) if (Number.isFinite(height)) heights.add(height);
    let nearest = Infinity, result = null;
    for (const height of heights) {
        const distance = (height - origin.y) / direction.y;
        if (distance < 0 || distance >= nearest) continue;
        const x = Math.floor(origin.x + direction.x * distance);
        const y = Math.floor(origin.z + direction.z * distance);
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        if (Math.abs(Reactor3D.elevationAt(map, x, y) - height) > 1e-6) continue;
        nearest = distance;
        result = { x, y };
    }
    return result;
};

Reactor3D.screenToGroundTile = function(map, camera, x, y) {
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x / Graphics.width * 2 - 1, 1 - y / Graphics.height * 2), camera);
    return Reactor3D.groundTileFromRay(map, raycaster.ray.origin, raycaster.ray.direction);
};

Reactor3D.MapScene.prototype.updateDestination = function(temp, map, frame) {
    if (!temp || !temp.isDestinationValid()) {
        if (this._destinationMarker) this._destinationMarker.visible = false;
        this._destinationStartFrame = frame;
        return;
    }
    if (!this._destinationMarker) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
            opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
            polygonOffsetUnits: -1, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.rotation.x = -Math.PI / 2;
        this.belowGroup().add(mesh);
        this._meshes.push(mesh);
        this._materials.push(material);
        this._destinationMarker = mesh;
        this._destinationStartFrame = frame;
    }
    const mesh = this._destinationMarker, x = temp.destinationX(), y = temp.destinationY();
    const phase = ((frame - this._destinationStartFrame) % 20) / 20;
    mesh.position.set(x + 0.5, Reactor3D.elevationAt(map, x, y) + 0.015, y + 0.5);
    mesh.scale.setScalar(1 + phase);
    mesh.material.opacity = (1 - phase) * 0.5;
    mesh.visible = true;
};

Reactor3D.createCamera = function(settings) {
    const fov = (settings && settings.fov) || 30;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 500);
    return camera;
};

/**
 * How far back the camera sits when a map does not say.
 *
 * Not a constant. It is the distance at which a tile under the focus covers
 * the same pixels it would on a flat map, so the 3D view frames about as much
 * world as the 2D one and a character is drawn at about the size its art was
 * painted at. A fixed 12 was roughly half that: the map arrived at twice its
 * flat size, which showed a quarter of the world, upscaled every sprite, and
 * made every light look twice as big as its author drew it.
 *
 * Derived rather than tuned, so it stays right on a project with a different
 * tile size, resolution or field of view. `distance` in the map's sidecar
 * overrides it for a map that wants a closer or wider look.
 */
Reactor3D.defaultCameraDistance = function(camera) {
    const fov = (((camera && camera.fov) || 30) * Math.PI) / 180;
    const tile = typeof $gameMap !== "undefined" && $gameMap.tileHeight
        ? $gameMap.tileHeight() : 48;
    const height = typeof Graphics !== "undefined" && Graphics.height
        ? Graphics.height : 624;
    const distance = height / (2 * tile * Math.tan(fov / 2));
    return distance > 0 && isFinite(distance) ? distance : 12;
};

/**
 * Point `camera` at a grid position.
 *
 * Pitch is measured from the horizon, so 90 is straight down and the shallow
 * angles HD-2D uses sit around 50-60. Yaw rotates about the focus, which keeps
 * a rotated camera looking at the same cell.
 */
Reactor3D.aimCamera = function(camera, focus, settings) {
    if (!camera) return;
    const opts = settings || {};
    const pitch = ((opts.pitch ?? 55) * Math.PI) / 180;
    const yaw = ((opts.yaw || 0) * Math.PI) / 180;
    const distance = opts.distance || Reactor3D.defaultCameraDistance(camera);

    // Cell centres, so the camera does not sit on a tile corner.
    const cx = focus.x + 0.5;
    const cy = focus.y || 0;
    const cz = focus.z + 0.5;

    camera.position.set(
        cx - Math.sin(yaw) * Math.cos(pitch) * distance,
        cy + Math.sin(pitch) * distance,
        cz + Math.cos(yaw) * Math.cos(pitch) * distance
    );
    camera.lookAt(cx, cy, cz);
    camera.updateMatrixWorld();
};

/**
 * Where a world position lands on the game canvas.
 *
 * Characters stay ordinary PIXI sprites drawn over the 3D ground — which is the
 * HD-2D look, and keeps every plugin that touches Sprite_Character working — so
 * their screen positions come from projecting through the same camera rather
 * than from the 2D scroll.
 */
Reactor3D.projectToScreen = function(camera, x, y, z, out) {
    if (!camera || !THREE.Vector3) return null;
    // Once per sprite per frame; a scratch vector, not a fresh one, and a
    // caller that runs every frame passes the record it wants filled.
    const vector = this._projectScratch || (this._projectScratch = new THREE.Vector3());
    vector.set(x, y, z);
    vector.project(camera);
    const point = out || {};
    point.x = (vector.x * 0.5 + 0.5) * Graphics.width;
    point.y = (-vector.y * 0.5 + 0.5) * Graphics.height;
    // Behind the camera; the caller hides the sprite rather than drawing it
    // mirrored in front.
    point.visible = vector.z < 1;
    return point;
};

/**
 * How many screen pixels one world tile covers at a given point.
 *
 * A character over a 3D map is still an ordinary 2D sprite, so nothing scales
 * it: without this it is drawn at its flat size wherever it stands, and a
 * figure at the far end of a street is exactly as big as one at your feet —
 * which reads as the map being 3D and the people on it not.
 *
 * Measured rather than derived: project the point and the point one tile above
 * it, and the distance between them on screen is the answer, whatever the
 * camera's field of view and pitch happen to be.
 */
/**
 * How a sprite has to be scaled to stand on the same plane a 3D object does.
 *
 * A declared 3D object is a billboard, and `billboardMaterial` builds its quad
 * on two specific axes: the camera's right axis, and — since `BILLBOARD_TILT`
 * is 0 — world up. It turns to face you as you orbit, but it stays upright.
 *
 * A sprite standing in for one has to occupy exactly that quad, so the two are
 * measured the same way rather than derived separately: project the anchor,
 * the point one unit along each of those axes, and read the screen distances
 * off. The two factors are not the same number — a camera pitched over
 * foreshortens the vertical axis and not the horizontal — which is why a
 * single uniform scale could never make a sprite line up with the standing art
 * beside it. It was drawn at full height against art squashed to about six
 * tenths, and the gap moved as the view moved.
 *
 * Returns null where the question does not apply, leaving the sprite alone.
 */
Reactor3D.standScaleAt = function(camera, x, y, z, wide, tall) {
    if (!camera || !THREE.Vector3) return null;

    // The same two axes the billboard shader uses, in world space.
    const right = (this._standRightScratch || (this._standRightScratch = new THREE.Vector3())).set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = this.billboardUp(camera);

    // Measured across the thing's *own* size, not across one tile and
    // multiplied.
    //
    // Perspective is not linear, so three tiles up is not three times one tile
    // up. Sizing a three-tile sign from a one-tile sample put its top edge
    // twenty pixels off at the near end of a street and fifty-six at the far
    // end — and because the error moves with the camera, the sign crept
    // against the pole it hangs from as you walked up the map. Measuring over
    // the full extent lands the far corner exactly, whatever the height.
    const spanU = wide > 0 ? wide : 1;
    const spanV = tall > 0 ? tall : 1;

    const outs = this._standOuts || (this._standOuts = [{}, {}, {}]);
    const base = this.projectToScreen(camera, x, y, z, outs[0]);
    const across = this.projectToScreen(camera,
        x + right.x * spanU, y + right.y * spanU, z + right.z * spanU, outs[1]);
    const above = this.projectToScreen(camera,
        x + up.x * spanV, y + up.y * spanV, z + up.z * spanV, outs[2]);
    if (!base || !across || !above) return null;

    const tileWidth = typeof $gameMap !== "undefined" && $gameMap.tileWidth
        ? $gameMap.tileWidth() : 48;
    const tileHeight = typeof $gameMap !== "undefined" && $gameMap.tileHeight
        ? $gameMap.tileHeight() : 48;
    if (!(tileWidth > 0) || !(tileHeight > 0)) return null;

    // Straight-line screen distance, not the difference along one screen axis:
    // the world axes only line up with the screen's while the camera's yaw is
    // zero, and a rotated view would otherwise report a sprite as flat.
    const wideOnScreen = Math.hypot(across.x - base.x, across.y - base.y);
    const upX = above.x - base.x;
    const upY = above.y - base.y;
    const tallOnScreen = Math.hypot(upX, upY);
    if (!(wideOnScreen > 0) || !(tallOnScreen > 0)) return null;

    // And the lean — as a shear, not a turn.
    //
    // A world-vertical line converges towards a vanishing point, so standing
    // art tilts: more the taller it is and the further it sits from the
    // screen's centre column. A sprite is axis-aligned and stayed bolt
    // upright, which put the top of a tall sign sideways of where it belonged
    // by an amount that swung about as the camera moved.
    //
    // Turning the sprite is the wrong correction, because it tilts *both*
    // axes. A standing billboard's bottom edge runs along the camera's right
    // axis, which is perpendicular to the view and therefore stays level on
    // screen; only its vertical edges lean. The shape is a parallelogram, and
    // a rotated rectangle is not one — it lifts the ground line the sprite is
    // standing on, so a row of characters looked like it was walking up a
    // slope.
    //
    // A shear about the anchor is exactly a parallelogram: feet level, top
    // displaced. PIXI composes `skew.x` into the y-axis as
    // `(-sin(-skew.x), cos(-skew.x))`, and the sprite's own up is -y, so the
    // angle it wants is the negative of the up-vector's tilt from vertical.
    const skew = -Math.atan2(upX, -upY);
    return {
        x: wideOnScreen / (spanU * tileWidth),
        y: tallOnScreen / (spanV * tileHeight),
        skew
    };
};

Reactor3D.screenScaleAt = function(camera, x, y, z) {
    if (!camera || !THREE.Vector3) return 1;
    const tile = typeof $gameMap !== "undefined" && $gameMap.tileHeight
        ? $gameMap.tileHeight() : 48;
    if (!(tile > 0)) return 1;

    // How far along the way the camera is looking, not how far away in a
    // straight line: what a perspective camera divides by is the depth.
    const point = new THREE.Vector3(x, y, z);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const depth = point.sub(camera.position).dot(forward);
    if (!(depth > 0.001)) return 1;

    // A world unit is this many pixels tall at that depth. The projection of a
    // world-*vertical* segment is the wrong measure, however natural it looks:
    // a pitched camera foreshortens one, and that foreshortening eases with
    // distance at almost exactly the rate perspective shrinks it, so the two
    // cancel and every sprite comes out the same size wherever it stands —
    // which is the map in perspective and the people on it not. A billboard
    // turns to face the camera and is never foreshortened, so its size is the
    // plain perspective divide.
    const fov = (camera.fov || 30) * Math.PI / 180;
    const height = typeof Graphics !== "undefined" ? Graphics.height : 720;
    const pixelsPerTile = height / (2 * depth * Math.tan(fov / 2));
    return pixelsPerTile / tile;
};

//-----------------------------------------------------------------------------
// Scene preparation
//
// three.js is fetched the first time a 3D map is entered, so the scene has to
// wait for it. A failure resolves rather than rejects: the map falls back to the
// 2D tilemap instead of refusing to load.

Reactor3D._prepared = null;

Reactor3D.beginPrepare = function(mapData) {
    if (!this.isMap3D(mapData)) {
        this._prepared = true;
        return;
    }
    if (!this.isSupported()) {
        console.warn(
            `Reactor3D: 3D unavailable (${this.unsupportedReason()}); ` +
            "falling back to the 2D tilemap."
        );
        this._prepared = true;
        return;
    }
    this._prepared = false;
    Promise.all([this.ensureLoaded(), this.loadClassification()]).then(() => {
        this._prepared = true;
    });
};

Reactor3D.isPrepared = function() {
    return this._prepared !== false;
};

/**
 * Let the 3D canvas underneath show through, or cover it again.
 *
 * The two canvases are stacked — 3D at z-index 0, the game canvas at 1 — so
 * PIXI can keep drawing windows, pictures and every plugin sprite over the
 * top. That only works if the game canvas is *transparent* where nothing is
 * drawn, and PIXI clears to opaque black by default: the 3D ground was being
 * rendered correctly and then painted over, every frame, which looks exactly
 * like 3D not working.
 *
 * Written for whichever PIXI is present. v7 and v8 keep it on a background
 * system; v5 and v6 on the renderer itself.
 */
Reactor3D.setGameCanvasTransparent = function(transparent) {
    const renderer = typeof Graphics !== "undefined" && Graphics.app && Graphics.app.renderer;
    if (!renderer) return false;
    const alpha = transparent ? 0 : 1;
    if (renderer.background && "alpha" in renderer.background) {
        renderer.background.alpha = alpha;
        return true;
    }
    if ("backgroundAlpha" in renderer) {
        renderer.backgroundAlpha = alpha;
        return true;
    }
    if ("transparent" in renderer) {
        renderer.transparent = !!transparent;
        return true;
    }
    return false;
};

/** Whether this map should actually be drawn in 3D right now. */
Reactor3D.shouldRender3D = function(mapData) {
    return this.isMap3D(mapData) && this.isLoaded() && this.isSupported();
};

/**
 * Why a map that asked for 3D is not getting it, or null when it is.
 *
 * Every gate between "the note says <3d>" and "the scene is built" could fail
 * quietly and leave an ordinary 2D map on screen, which is indistinguishable
 * from the feature not existing. There is nothing to debug from that, so each
 * gate names itself here and `createReactor3D` prints it once.
 */
Reactor3D.renderBlocker = function(mapData) {
    if (!this.isMap3D(mapData)) {
        return "the map is not marked 3D — its note needs <3d>, and $dataMap.meta['3d'] "
            + "must be set, which DataManager does when it extracts the note";
    }
    if (!this.isSupported()) {
        return `this machine cannot draw it (${this.unsupportedReason()})`;
    }
    if (!this.isLoaded()) {
        if (this._unsupportedReason) return `three.js is not loaded (${this._unsupportedReason})`;
        // Nothing failed, so either the file is not where it should be or the
        // scene asked before the fetch came back. Both are worth naming: the
        // second one looks impossible from the outside, because the file is
        // plainly sitting there.
        return `three.js has not finished loading — expected at ${this.LIB_URL}, relative `
            + "to the game's index.html. If the file is present, the scene built its "
            + "spriteset before the fetch returned";
    }
    return null;
};

//-----------------------------------------------------------------------------
// Camera modes, map defaults and the Change 3D Camera command
//-----------------------------------------------------------------------------

/*
 * A 3D map used to have one camera: the HD-2D shoulder view, pitched 55
 * degrees over the centre of the display. That is still the default. This
 * module makes it one of several modes, lets a map choose its own in Map
 * Properties (`reactor3d.camera` in the sidecar), and adds the Reactor event
 * command "Change 3D Camera" (code 357, plugin "RPGReactor", command
 * "ChangeCamera3D") that moves between them in play, eased over a number of
 * frames.
 *
 * Modes:
 *   fixed        The HD-2D view. Follows the display like the 2D map does, so
 *                Scroll Map, zoom and camera plugins all still work.
 *   topDown      Straight down over the display.
 *   isometric    Pitched 35.26 degrees, turned 45, with a narrow field of view
 *                so the picture is nearly parallel-projected.
 *   thirdPerson  Behind the player, turning with them.
 *   firstPerson  At the player's authored eyes (or fitted model height),
 *                with their 3D body and followers visible.
 *
 * Any mode takes pitch/yaw/distance/fov overrides; a null field means "the
 * mode's own number". The camera state lives on `Game_Map`, so it is saved
 * with the game and reset to the map's default on transfer unless the
 * command asked to keep it across maps (then it lives on `Game_System`).
 */
(function(root) {
    "use strict";

    const PLUGIN_NAME = "RPGReactor";
    const COMMAND = "ChangeCamera3D";
    const WAIT_MODE = "reactorCamera3D";
    const DEG = Math.PI / 180;

    const DEFAULT_MODE = "fixed";
    const MODES = {
        fixed: { pitch: 55, yaw: 0, fov: 30, distance: null, focus: "display" },
        topDown: { pitch: 89, yaw: 0, fov: 30, distance: null, focus: "display" },
        isometric: { pitch: 35.264, yaw: 45, fov: 15, distance: null, focus: "display" },
        thirdPerson: { pitch: 25, yaw: 0, fov: 45, distance: 8, focus: "player", lift: 1 },
        firstPerson: { pitch: 0, yaw: 0, fov: 70, distance: 0, focus: "player", lift: 0.8 }
    };
    const MODE_NAMES = Object.keys(MODES);
    const FOCUS_NAMES = ["auto", "display", "player", "event"];

    const LIMITS = {
        pitch: [-89, 89],
        yaw: [-360, 360],
        distance: [0.5, 1024],
        fov: [5, 150],
        duration: [0, 6000]
    };

    /** The player's eye above the ground, in tiles, for first person. */
    const EYE_HEIGHT = MODES.firstPerson.lift;
    /** How fast a player-relative camera turns to follow a new facing. */
    const TURN_RATE = 0.18;

    /*
     * Mouse look, for the player-relative modes. The camera's yaw and
     * pitch belong to the mouse (pointer lock on the game canvas: click to
     * take it, Escape to give it back), and movement is relative to where
     * the camera faces: W walks away from the camera, S toward it, A and D
     * strafe, diagonals combine. In first person the character turns with
     * the mouse; in third person it faces the way it walks.
     */
    const LOOK_SENSITIVITY = 0.15;   // degrees per pixel
    // Third person may look up past the horizon (the camera dips below the
    // figure) and down from overhead.
    const LOOK_PITCH = { thirdPerson: [-25, 80], firstPerson: [-70, 70] };
    /** How much of the look's pitch the character's head (or body) follows, and its limit. */
    const LOOK_LEAN = 0.6;
    const LOOK_LEAN_LIMIT = 30;
    /*
     * Looking up in third person does not swing the camera under the
     * figure (that is a view from under the floor). The eye stays at the
     * figure's height and slides in over the shoulder while the view
     * pitches up, so you look up from about where the eyes are: at full
     * look-up the camera has given up this much of its distance.
     */
    const LOOK_UP_CLOSE = 0.75;
    const MIN_THIRD_PERSON_DISTANCE = 1.5;
    const look = { yaw: 0, pitch: null, locked: false, seeded: false, lastX: null, lastY: null };
    const held = new Set();
    const KEYS = {
        KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back",
        KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right"
    };

    function isRelativeMode(mode) {
        return mode === "thirdPerson" || mode === "firstPerson";
    }

    /** Start the look from the player's facing, so the camera opens behind them. */
    function seedLook(direction, mode) {
        if (look.seeded) return;
        look.yaw = yawForDirection[direction] || 0;
        look.pitch = null;
        look.seeded = true;
    }

    function lookPitch(mode, fallback) {
        const range = LOOK_PITCH[mode] || [-89, 89];
        const value = look.pitch === null ? fallback : look.pitch;
        return Math.max(range[0], Math.min(range[1], value));
    }

    /** Turn the look by a mouse delta in pixels. */
    function turnLook(dx, dy) {
        const mode = currentState().mode;
        if (!isRelativeMode(mode)) return;
        look.yaw = ((look.yaw + dx * LOOK_SENSITIVITY) % 360 + 360) % 360;
        const range = LOOK_PITCH[mode] || [-89, 89];
        const base = look.pitch === null ? MODES[mode].pitch : look.pitch;
        look.pitch = Math.max(range[0], Math.min(range[1], base + dy * LOOK_SENSITIVITY));
    }

    /** How far the character leans with the look, in degrees (positive looks down). */
    function lookLean() {
        const mode = currentState().mode;
        if (mode !== "thirdPerson" || look.pitch === null) return 0;
        const delta = (look.pitch - MODES.thirdPerson.pitch) * LOOK_LEAN;
        return Math.max(-LOOK_LEAN_LIMIT, Math.min(LOOK_LEAN_LIMIT, delta));
    }

    function requestLook() {
        const canvas = typeof Graphics !== "undefined" && Graphics._canvas;
        if (!canvas || look.locked || typeof SceneManager === "undefined" || !SceneManager._scene
            || typeof Scene_Map === "undefined" || !(SceneManager._scene instanceof Scene_Map)) return;
        if (canvas.requestPointerLock) {
            try {
                const result = canvas.requestPointerLock();
                if (result && typeof result.catch === "function") result.catch(() => {});
            } catch (error) { /* no gesture yet; unlocked deltas still turn the look */ }
        }
    }

    /**
     * Escape releases the pointer lock, and the browser keeps that key
     * press to itself: the game never hears it, so the menu needed a second
     * Escape. Losing the lock with the window still focused is that key
     * press; it calls the menu the way the key would have. Losing focus
     * (another window) releases the lock too, and calls nothing.
     */
    function lockReleased() {
        // A fullscreen change (F4) drops the lock too; that is not Escape.
        if (Date.now() < (look.suppressMenuUntil || 0)) return;
        const scene = typeof SceneManager !== "undefined" && SceneManager._scene;
        if (!scene || typeof Scene_Map === "undefined" || !(scene instanceof Scene_Map)) return;
        if (!isRelativeMode(currentState().mode)) return;
        if (typeof scene.isMenuEnabled === "function" && !scene.isMenuEnabled()) return;
        held.clear();
        scene.menuCalling = true;
    }

    /** The map direction (2/4/6/8, or a diagonal pair) the held keys ask for, relative to the camera. */
    function relativeMove() {
        const forward = (held.has("forward") ? 1 : 0) - (held.has("back") ? 1 : 0);
        const strafe = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
        return moveForView(forward, strafe, look.yaw);
    }

    /** Rotate screen-relative input into the nearest of eight map directions. */
    function moveForView(forward, strafe, yawDegrees) {
        if (!forward && !strafe) return null;
        const yaw = yawDegrees * DEG;
        // Camera yaw 0 looks north (-z on the map, direction 8).
        const fx = Math.sin(yaw), fy = -Math.cos(yaw);
        const rx = Math.cos(yaw), ry = Math.sin(yaw);
        const x = forward * fx + strafe * rx;
        const y = forward * fy + strafe * ry;
        const angle = Math.atan2(y, x) * 180 / Math.PI;   // 0 = east, 90 = south
        const sector = Math.round(angle / 45);
        const table = { 0: [6, 0], 1: [6, 2], 2: [0, 2], 3: [4, 2], 4: [4, 0], "-4": [4, 0], "-3": [4, 8], "-2": [0, 8], "-1": [6, 8] };
        const pair = table[sector] || [0, 0];
        return { horz: pair[0], vert: pair[1] };
    }

    const clamp = (value, range) => Math.max(range[0], Math.min(range[1], value));

    function numberOrNull(value, range) {
        if (value === null || value === undefined || value === "") return null;
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        return range ? clamp(number, range) : number;
    }

    function modeName(value) {
        const name = String(value || "").trim();
        if (MODES[name]) return name;
        // Editor labels and older sidecars may spell the mode differently.
        const key = name.toLowerCase().replace(/[\s_-]/g, "");
        for (const mode of MODE_NAMES) {
            if (mode.toLowerCase() === key) return mode;
        }
        if (key === "fixedangle" || key === "hd2d") return "fixed";
        if (key === "top" || key === "topdown") return "topDown";
        if (key === "iso") return "isometric";
        if (key === "third" || key === "3rdperson") return "thirdPerson";
        if (key === "first" || key === "1stperson" || key === "fps") return "firstPerson";
        return DEFAULT_MODE;
    }

    function focusName(value) {
        const name = String(value || "auto").trim().toLowerCase();
        if (name === "this event" || name === "thisevent") return "event";
        return FOCUS_NAMES.indexOf(name) >= 0 ? name : "auto";
    }

    /**
     * A camera state as stored: a mode plus optional overrides.
     *
     * Everything a map's sidecar or a command can say about the camera, in
     * one plain shape, with unknown modes falling back to the default and
     * numbers held to sane ranges so a typo cannot put the camera a thousand
     * tiles away.
     */
    function normalizeState(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            mode: modeName(source.mode),
            pitch: numberOrNull(source.pitch, LIMITS.pitch),
            yaw: numberOrNull(source.yaw, LIMITS.yaw),
            distance: numberOrNull(source.distance, LIMITS.distance),
            fov: numberOrNull(source.fov, LIMITS.fov),
            focus: focusName(source.focus),
            eventId: Math.max(0, Math.floor(Number(source.eventId) || 0))
        };
    }

    /** True when a stored state says nothing beyond the default view. */
    function isDefaultState(state) {
        const normal = normalizeState(state);
        return normal.mode === DEFAULT_MODE && normal.pitch === null && normal.yaw === null
            && normal.distance === null && normal.fov === null && normal.focus === "auto";
    }

    /** The map's own camera, from its sidecar. */
    function mapDefault(mapData) {
        const sidecar = mapData && mapData.reactor3d;
        return normalizeState(sidecar && sidecar.camera);
    }

    /** The command's arguments as the state it sets, plus how to get there. */
    function normalizeArgs(args, context) {
        const source = args && typeof args === "object" ? args : {};
        const state = normalizeState(source);
        if (state.focus === "event") {
            const asked = Number(source.eventId);
            if (!(asked > 0) && context && typeof context.eventId === "function") {
                state.eventId = Math.max(0, Number(context.eventId()) || 0);
            }
        }
        const truthy = value => value === true || value === "true" || value === 1 || value === "1";
        return {
            state: state,
            duration: Math.round(numberOrNull(source.duration, LIMITS.duration) || 0),
            wait: truthy(source.wait),
            keep: truthy(source.keep)
        };
    }

    const yawForDirection = { 8: 0, 2: 180, 4: 270, 6: 90 };

    /** The distance at which a tile under the focus is drawn at its flat size. */
    function frameDistance(fov) {
        const radians = ((fov || 30) * DEG) / 2;
        const tile = typeof $gameMap !== "undefined" && $gameMap && $gameMap.tileHeight
            ? $gameMap.tileHeight() : 48;
        const height = typeof Graphics !== "undefined" && Graphics.height ? Graphics.height : 624;
        const distance = height / (2 * tile * Math.tan(radians));
        return distance > 0 && isFinite(distance) ? distance : 12;
    }

    /**
     * Turn a stored state into the numbers the camera is set from.
     *
     * `context` supplies what only the running map knows: where the display
     * is centred, where the player and events stand and face, and the ground
     * height under each. Pure otherwise, so the editor can preview a map's
     * default camera with a context of its own.
     */
    function resolve(state, context) {
        const normal = normalizeState(state);
        const defaults = MODES[normal.mode];
        const fov = normal.fov !== null ? normal.fov : defaults.fov;
        const eye = normal.mode === "firstPerson";
        const playerRelative = eye || normal.mode === "thirdPerson";
        const focus = normal.focus === "auto" ? defaults.focus : normal.focus;

        let anchor = null;
        if (focus === "event" && context.eventPosition) anchor = context.eventPosition(normal.eventId);
        if (!anchor && (focus === "player" || focus === "event") && context.playerPosition) {
            anchor = context.playerPosition();
        }
        if (!anchor && context.displayPosition) anchor = context.displayPosition();
        if (!anchor) anchor = { x: 0, y: 0, elevation: 0, direction: 2 };

        const direction = anchor.direction || (context.playerDirection ? context.playerDirection() : 2);
        if (playerRelative) seedLook(direction, normal.mode);
        const baseYaw = playerRelative ? look.yaw : 0;
        const yaw = baseYaw + (normal.yaw !== null ? normal.yaw : defaults.yaw);
        const pitch = playerRelative
            ? lookPitch(normal.mode, normal.pitch !== null ? normal.pitch : defaults.pitch)
            : (normal.pitch !== null ? normal.pitch : defaults.pitch);
        let distance = normal.distance !== null ? normal.distance : defaults.distance;
        if (distance === null) distance = frameDistance(fov);
        const eyePoint = eye && anchor.eyes;
        const y = eyePoint ? eyePoint.y : (anchor.elevation || 0) + (defaults.lift || 0);
        if (playerRelative && !eye && pitch < 0) {
            const t = Math.min(1, pitch / (LOOK_PITCH.thirdPerson[0] || -1));
            distance = Math.max(MIN_THIRD_PERSON_DISTANCE, distance * (1 - LOOK_UP_CLOSE * t));
        }
        return {
            mode: normal.mode,
            eye: eye,
            hidePlayer: eye,
            playerRelative: playerRelative,
            pitch: pitch,
            yaw: yaw,
            distance: distance,
            fov: fov,
            x: eyePoint ? eyePoint.x - 0.5 : anchor.x,
            // Player-relative modes look at the figure, not at its feet.
            y: y,
            z: eyePoint ? eyePoint.z - 0.5 : anchor.y
        };
    }

    function shortestArc(from, to) {
        let delta = (to - from) % 360;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    }

    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /**
     * Move `current` towards `target`.
     *
     * A commanded change eases over its frames. A player-relative camera also
     * turns at a fixed rate whenever the player turns, so third and first
     * person swing round rather than snap. Position is never smoothed: the
     * focus is the display or the player, and either already moves smoothly.
     */
    function step(current, target, tween) {
        if (!current) return Object.assign({}, target);
        const next = Object.assign({}, target);
        if (tween && tween.total > 0 && tween.frames > 0) {
            // Counted down first, so the last frame lands exactly on the target.
            tween.frames--;
            const t = easeInOut(1 - tween.frames / tween.total);
            next.pitch = tween.from.pitch + (target.pitch - tween.from.pitch) * t;
            next.yaw = tween.from.yaw + shortestArc(tween.from.yaw, target.yaw) * t;
            next.distance = tween.from.distance + (target.distance - tween.from.distance) * t;
            next.fov = tween.from.fov + (target.fov - tween.from.fov) * t;
            next.x = tween.from.x + (target.x - tween.from.x) * t;
            next.y = tween.from.y + (target.y - tween.from.y) * t;
            next.z = tween.from.z + (target.z - tween.from.z) * t;
            return next;
        }
        if (target.playerRelative && current.playerRelative && current.mode === target.mode && !look.locked) {
            // Without the mouse, the camera still eases when something else
            // turns the look (a command's yaw); with it, the hand is the ease.
            const delta = shortestArc(current.yaw, target.yaw);
            next.yaw = Math.abs(delta) < 0.05 ? target.yaw : current.yaw + delta * TURN_RATE;
        }
        return next;
    }

    /** Place `camera` from a resolved state. */
    function place(camera, resolved, zoom) {
        if (!camera) return;
        if (camera.fov !== resolved.fov) {
            camera.fov = resolved.fov;
            camera.updateProjectionMatrix();
        }
        const scale = zoom && zoom > 0 ? zoom : 1;
        if (resolved.eye) {
            const yaw = resolved.yaw * DEG;
            const pitch = resolved.pitch * DEG;
            const ex = resolved.x + 0.5;
            const ey = resolved.y;
            const ez = resolved.z + 0.5;
            camera.position.set(ex, ey, ez);
            // The same convention `aimCamera` uses: yaw 0 looks north (-z),
            // pitch above the horizon looks down.
            camera.lookAt(
                ex + Math.sin(yaw) * Math.cos(pitch),
                ey - Math.sin(pitch),
                ez - Math.cos(yaw) * Math.cos(pitch)
            );
            camera.updateMatrixWorld();
            return;
        }
        if (resolved.playerRelative && resolved.pitch < 0) {
            // Over the shoulder, looking up: the eye stays behind the figure
            // at its height and the view pitches up from there, rather than
            // orbiting under the floor to look up at it.
            const yaw = resolved.yaw * DEG;
            const pitch = resolved.pitch * DEG;
            const distance = resolved.distance / scale;
            const ex = resolved.x + 0.5 - Math.sin(yaw) * distance;
            const ey = resolved.y;
            const ez = resolved.z + 0.5 + Math.cos(yaw) * distance;
            camera.position.set(ex, ey, ez);
            camera.lookAt(
                ex + Math.sin(yaw) * Math.cos(pitch),
                ey - Math.sin(pitch),
                ez - Math.cos(yaw) * Math.cos(pitch)
            );
            camera.updateMatrixWorld();
            keepOutOfWalls(camera, resolved);
            return;
        }
        if (Reactor3D.aimCamera) {
            Reactor3D.aimCamera(camera, { x: resolved.x, y: resolved.y, z: resolved.z }, {
                pitch: resolved.pitch,
                yaw: resolved.yaw,
                distance: resolved.distance / scale
            });
            keepOutOfWalls(camera, resolved);
        }
    }

    // A camera on the player never stands inside a built wall or roof: it
    // comes in along its own line of sight until it is clear.
    function keepOutOfWalls(camera, resolved) {
        if (!resolved.playerRelative && resolved.focus !== "player") return;
        if (!Reactor3D.clearCameraPath || typeof $dataMap === "undefined") return;
        Reactor3D.clearCameraPath(camera, { x: resolved.x + 0.5, y: resolved.y + 1.2, z: resolved.z + 0.5 }, $dataMap);
    }

    //-------------------------------------------------------------------------
    // The running game

    function elevationAt(x, y) {
        if (!Reactor3D || !Reactor3D.groundHeightAt || typeof $dataMap === "undefined") return 0;
        const near = typeof $gamePlayer !== "undefined" && $gamePlayer ? $gamePlayer._reactorGround : undefined;
        return Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, near) || 0;
    }

    function gameContext(spriteset) {
        return {
            displayPosition: () => {
                const focus = spriteset && spriteset.reactor3DCameraFocus
                    ? spriteset.reactor3DCameraFocus() : { x: 0, y: 0 };
                return { x: focus.x, y: focus.y, elevation: elevationAt(focus.x, focus.y) };
            },
            playerPosition: () => {
                if (typeof $gamePlayer === "undefined" || !$gamePlayer) return null;
                const x = $gamePlayer._realX, y = $gamePlayer._realY;
                const elevation = elevationAt(x, y) + ($gamePlayer._reactorLift || 0);
                return { x: x, y: y, elevation: elevation, direction: $gamePlayer.direction(),
                    eyes: currentState().mode === "firstPerson" ? playerEyes($gamePlayer, elevation) : null };
            },
            playerDirection: () => (typeof $gamePlayer !== "undefined" && $gamePlayer
                ? $gamePlayer.direction() : 2),
            eventPosition: id => {
                if (typeof $gameMap === "undefined" || !$gameMap || !(id > 0)) return null;
                const event = $gameMap.event(id);
                if (!event) return null;
                const x = event._realX, y = event._realY;
                return { x: x, y: y, elevation: elevationAt(x, y), direction: event.direction() };
            }
        };
    }

    /** Authored eye points scale and ride their bone; old models use cached dimensions. */
    function playerEyes(character, elevation) {
        const holder = Reactor3D.modelHolderFor(character);
        const object = holder && holder.object;
        if (!object || typeof THREE === "undefined") return null;
        const target = playerEyes.scratch || (playerEyes.scratch = new THREE.Vector3());
        if (!Reactor3D.modelLandmarkWorld(object, "eyes", target)) {
            const size = object.userData.glbSize;
            if (!size || !(size.y > 0)) return null;
            // Put unconfigured eyes near the front of the head, rather than
            // inside a double-sided face. No posed vertex/bounds scan needed.
            target.set(0, size.y * 0.92, (size.z || 0) * 0.45);
            (object.__reactorEyeRoot || object).localToWorld(target);
        }
        // The camera also runs before this frame's model sync, so compensate
        // for character movement without waiting a frame for the mesh root.
        if (Number.isFinite(holder.cameraBaseX)) target.x += character._realX - holder.cameraBaseX;
        if (Number.isFinite(holder.cameraBaseZ)) target.z += character._realY - holder.cameraBaseZ;
        if (Number.isFinite(holder.cameraBaseY)) target.y += elevation - holder.cameraBaseY;
        return target;
    }

    /** The state in force on the current map. */
    function currentState() {
        if (typeof $gameMap === "undefined" || !$gameMap) return normalizeState(null);
        if (!$gameMap._reactorCamera3d) $gameMap._reactorCamera3d = mapDefault(
            typeof $dataMap !== "undefined" ? $dataMap : null);
        return $gameMap._reactorCamera3d;
    }

    function hidesPlayer() {
        return currentState().mode === "firstPerson";
    }

    function isMoving() {
        const tween = typeof $gameMap !== "undefined" && $gameMap && $gameMap._reactorCamera3dTween;
        return !!(tween && tween.frames > 0);
    }

    /**
     * Set the camera for the current map, easing over `duration` frames.
     *
     * The "from" side of the tween is whatever the camera is showing right
     * now, which only the spriteset knows; it is captured on the next update.
     */
    function change(state, duration, keep) {
        if (typeof $gameMap === "undefined" || !$gameMap) return;
        const normal = normalizeState(state);
        $gameMap._reactorCamera3d = normal;
        $gameMap._reactorCamera3dTween = duration > 0
            ? { frames: duration, total: duration, from: null } : null;
        if (typeof $gameSystem !== "undefined" && $gameSystem) {
            if (keep) $gameSystem._reactorCamera3d = Object.assign({}, normal);
            else delete $gameSystem._reactorCamera3d;
        }
    }

    /** Called by `Spriteset_Map.updateReactor3DCamera` each frame. */
    function update(spriteset) {
        const live = spriteset && spriteset._reactor3d;
        if (!live || !live.camera) return false;
        const target = resolve(currentState(), gameContext(spriteset));
        const tween = typeof $gameMap !== "undefined" && $gameMap ? $gameMap._reactorCamera3dTween : null;
        if (tween && !tween.from) {
            // A save loaded mid-tween has no current view; start from the target.
            tween.from = live.cameraCurrent ? Object.assign({}, live.cameraCurrent) : Object.assign({}, target);
        }
        const current = step(live.cameraCurrent, target, tween);
        if (tween && tween.frames <= 0 && $gameMap) $gameMap._reactorCamera3dTween = null;
        live.cameraCurrent = current;
        const zoom = typeof $gameScreen !== "undefined" && $gameScreen
            && typeof $gameScreen.zoomScale === "function"
            ? Number($gameScreen.zoomScale()) || 1 : 1;
        place(live.camera, current, zoom);
        return true;
    }

    function registerCommands() {
        if (typeof PluginManager === "undefined" || !PluginManager.registerCommand
            || registerCommands.registered) return;
        registerCommands.registered = true;
        PluginManager.registerCommand(PLUGIN_NAME, COMMAND, function(args) {
            const interpreter = this;
            const parsed = normalizeArgs(args, {
                eventId: () => (interpreter.eventId ? interpreter.eventId() : 0)
            });
            change(parsed.state, parsed.duration, parsed.keep);
            if (parsed.wait && parsed.duration > 0 && interpreter.setWaitMode) {
                interpreter.setWaitMode(WAIT_MODE);
            }
        });
    }

    function installHooks() {
        if (typeof Game_Map !== "undefined" && Game_Map.prototype.setup
            && !Game_Map.prototype.setup.__reactorCamera3d) {
            const baseSetup = Game_Map.prototype.setup;
            Game_Map.prototype.setup = function() {
                const result = baseSetup.apply(this, arguments);
                // The map's default, unless a command asked to keep its camera.
                const kept = typeof $gameSystem !== "undefined" && $gameSystem
                    && $gameSystem._reactorCamera3d;
                this._reactorCamera3d = kept ? normalizeState(kept)
                    : mapDefault(typeof $dataMap !== "undefined" ? $dataMap : null);
                this._reactorCamera3dTween = null;
                return result;
            };
            Game_Map.prototype.setup.__reactorCamera3d = true;
        }
        if (typeof Game_Map !== "undefined" && !Game_Map.prototype.reactorCamera3D) {
            Game_Map.prototype.reactorCamera3D = function() {
                return currentState();
            };
            Game_Map.prototype.setReactorCamera3D = function(state, duration, keep) {
                change(state, duration || 0, !!keep);
            };
        }
        if (typeof Game_Interpreter !== "undefined" && Game_Interpreter.prototype.updateWaitMode
            && !Game_Interpreter.prototype.updateWaitMode.__reactorCamera3d) {
            const baseUpdateWaitMode = Game_Interpreter.prototype.updateWaitMode;
            Game_Interpreter.prototype.updateWaitMode = function() {
                if (this._waitMode === WAIT_MODE) {
                    if (isMoving()) return true;
                    this._waitMode = "";
                    return false;
                }
                return baseUpdateWaitMode.apply(this, arguments);
            };
            Game_Interpreter.prototype.updateWaitMode.__reactorCamera3d = true;
        }
        if (typeof Game_Player !== "undefined" && Game_Player.prototype.moveByInput
            && !Game_Player.prototype.moveByInput.__reactorCamera3d) {
            const baseMoveByInput = Game_Player.prototype.moveByInput;
            // Behind or inside the player, the arrows are the player's:
            // up walks forward, down backs up, left and right turn in
            // place. Map-relative arrows made "left" mean west whichever
            // way the camera faced, which is unplayable from the shoulder.
            Game_Player.prototype.moveByInput = function() {
                const state = currentState();
                const live = typeof SceneManager !== "undefined" && SceneManager._scene?._spriteset?._reactor3d;
                const isometric = state.mode === "isometric" && !!live;
                if (!isRelativeMode(state.mode) && !isometric) return baseMoveByInput.apply(this, arguments);
                let move;
                if (isometric) {
                    // Arrows/gamepad and WASD use screen axes, including pairs
                    // of keys. Use the rendered yaw during camera transitions.
                    const dir = typeof Input !== "undefined" ? Input.dir8 || Input.dir4 : 0;
                    const forward = Number(held.has("forward") || [7,8,9].includes(dir)) - Number(held.has("back") || [1,2,3].includes(dir));
                    const strafe = Number(held.has("right") || [3,6,9].includes(dir)) - Number(held.has("left") || [1,4,7].includes(dir));
                    move = moveForView(forward, strafe, live.cameraCurrent?.yaw ?? state.yaw ?? MODES.isometric.yaw);
                } else move = relativeMove();
                // Ground clicks use map directions; manual movement remains
                // relative to the camera and takes over immediately.
                if (!move && $gameTemp.isDestinationValid()) return baseMoveByInput.apply(this, arguments);
                if (move) $gameTemp.clearDestination();
                if (this.isMoving() || !this.canMove()) return;
                if (!move) {
                    // Standing still in first person, the body turns with the look.
                    if (state.mode === "firstPerson") {
                        const facing = [8, 6, 2, 4][Math.round(((look.yaw % 360) + 360) % 360 / 90) % 4];
                        if (facing !== this.direction()) this.setDirection(facing);
                    }
                    return;
                }
                if (move.horz && move.vert) {
                    if (this.moveDiagonally) this.moveDiagonally(move.horz, move.vert);
                    if (!this.isMovementSucceeded()) this.executeMove(move.vert);
                    if (!this.isMovementSucceeded()) this.executeMove(move.horz);
                } else {
                    this.executeMove(move.horz || move.vert);
                }
            };
            Game_Player.prototype.moveByInput.__reactorCamera3d = true;
        }
        if (typeof document !== "undefined" && typeof document.addEventListener === "function"
            && typeof window !== "undefined" && !installHooks.__reactorLookBound) {
            installHooks.__reactorLookBound = true;
            document.addEventListener("keydown", event => {
                if (event.code === "F4" || event.keyCode === 115 || event.code === "F3" || event.keyCode === 114) {
                    look.suppressMenuUntil = Date.now() + 1500;
                    return;
                }
                const key = KEYS[event.code];
                if (!key) return;
                held.add(key);
                if (isRelativeMode(currentState().mode)) {
                    event.preventDefault();
                    // A key is a gesture too: the first step takes the mouse.
                    requestLook();
                }
            });
            document.addEventListener("keyup", event => {
                const key = KEYS[event.code];
                if (key) held.delete(key);
            });
            window.addEventListener("blur", () => held.clear());
            // A click on the game takes the mouse in the relative modes;
            // Escape (the browser's own) gives it back.
            document.addEventListener("mousedown", event => {
                if (event.button !== 0 || !isRelativeMode(currentState().mode)) return;
                // Pointer lock clears TouchInput. Pick before taking the mouse
                // so the initial click is retained even if lock arrives first.
                const scene = typeof SceneManager !== "undefined" && SceneManager._scene;
                const clickX = Graphics.pageToCanvasX(event.pageX), clickY = Graphics.pageToCanvasY(event.pageY);
                const menu = scene && scene._menuButton;
                if (menu && menu.isClickEnabled()) {
                    const point = menu.worldTransform.applyInverse({ x: clickX, y: clickY });
                    if (menu.hitTest(point.x, point.y)) return;
                }
                if (scene && typeof Scene_Map !== "undefined" && scene instanceof Scene_Map
                    && scene._spriteset?._reactor3d && scene.isMapTouchOk() && !scene.isAnyButtonPressed()) {
                    scene.onMapTouch(clickX, clickY);
                    scene._reactor3dTouchConsumed = true;
                    scene._touchCount = 0;
                    TouchInput.clear();
                }
                requestLook();
            });
            document.addEventListener("fullscreenchange", () => { look.suppressMenuUntil = Date.now() + 1500; });
            document.addEventListener("pointerlockchange", () => {
                const canvas = typeof Graphics !== "undefined" && Graphics._canvas;
                const wasLocked = look.locked;
                look.locked = !!canvas && document.pointerLockElement === canvas;
                if (typeof TouchInput !== "undefined" && look.locked) TouchInput.clear();
                if (wasLocked && !look.locked && document.hasFocus && document.hasFocus()) lockReleased();
            });
            document.addEventListener("mousemove", event => {
                if (!isRelativeMode(currentState().mode)) {
                    look.lastX = look.lastY = null;
                    return;
                }
                // Locked, the browser hands over raw deltas. Unlocked — before
                // the first click or key — the cursor's own travel turns the
                // look, so moving the mouse works from the first moment.
                if (look.locked) {
                    turnLook(event.movementX, event.movementY);
                    return;
                }
                if (look.lastX !== null) turnLook(event.clientX - look.lastX, event.clientY - look.lastY);
                look.lastX = event.clientX;
                look.lastY = event.clientY;
            });
        }
        if (typeof Sprite_Character !== "undefined" && Sprite_Character.prototype.updateVisibility
            && !Sprite_Character.prototype.updateVisibility.__reactorCamera3d) {
            const baseUpdateVisibility = Sprite_Character.prototype.updateVisibility;
            Sprite_Character.prototype.updateVisibility = function() {
                baseUpdateVisibility.apply(this, arguments);
                // A flat player sprite would cover the lens. Followers stay
                // visible, and the player's actual 3D body is drawn separately.
                if (this.visible && hidesPlayer()) {
                    const character = this._character;
                    if (typeof $gamePlayer !== "undefined" && character === $gamePlayer) this.visible = false;
                }
            };
            Sprite_Character.prototype.updateVisibility.__reactorCamera3d = true;
        }
    }

    const api = {
        PLUGIN_NAME: PLUGIN_NAME,
        COMMAND: COMMAND,
        WAIT_MODE: WAIT_MODE,
        DEFAULT_MODE: DEFAULT_MODE,
        MODES: MODES,
        MODE_NAMES: MODE_NAMES,
        FOCUS_NAMES: FOCUS_NAMES,
        LIMITS: LIMITS,
        EYE_HEIGHT: EYE_HEIGHT,
        modeName: modeName,
        normalizeState: normalizeState,
        isDefaultState: isDefaultState,
        mapDefault: mapDefault,
        normalizeArgs: normalizeArgs,
        resolve: resolve,
        step: step,
        place: place,
        frameDistance: frameDistance,
        playerEyes: playerEyes,
        currentState: currentState,
        look: look,
        held: held,
        relativeMove: relativeMove,
        moveForView: moveForView,
        turnLook: turnLook,
        lookLean: lookLean,
        hidesPlayer: hidesPlayer,
        isMoving: isMoving,
        change: change,
        update: update,
        registerCommands: registerCommands,
        installHooks: installHooks
    };

    root.RPGReactorCamera3D = api;
    Reactor3D.Camera = api;
    /** First person hides only the player's flat sprite, never party models. */
    Reactor3D.characterHiddenByCamera = function(character, model) {
        if (model) return false;
        if (!character || !hidesPlayer()) return false;
        if (typeof $gamePlayer === "undefined" || !$gamePlayer) return false;
        return character === $gamePlayer;
    };
    registerCommands();
    installHooks();
})(typeof globalThis !== "undefined" ? globalThis : this);

if (typeof module !== "undefined" && module.exports) {
    module.exports = Reactor3D;
    // Node alone: the NW.js page boots the extensions from scriptUrls.
    const node = typeof process !== "undefined" && process.versions && process.versions.node && !process.versions.nw;
    if (node) for (const extension of Reactor3D.EXTENSIONS) require("./" + extension.file);
}
