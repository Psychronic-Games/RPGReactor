/**
 * The editor's 3D map viewport.
 *
 * A checkbox beside the A1 toggle swaps the PIXI canvas for a three.js one
 * showing the same map standing up. It is a view, not a second editor: the map
 * data, the palette and every tool stay exactly as they are, and turning the
 * checkbox off puts the 2D canvas back untouched.
 *
 * The geometry comes from `runtime/reactor_3d.js` — the same file the game
 * loads, read from disk on desktop or loaded from the bundled project on Web.
 * A viewport that built its own geometry would drift from the runtime the first
 * time either changed, and the whole point of looking at it here is to see what
 * the game will draw.
 */
class MapEditor3D {
    /** The most pixels an in-scene effect is drawn at per frame in this view (a 1920x1080 view). */
    static EFFECT_PIXELS = 1920 * 1080;

    constructor(projectController) {
        this.projectController = projectController;
        // A cell is the project's tile size in pixels, which MZ lets a project
        // choose; tilePixels() reads it and the prototype holds the default.
        this.enabled = false;
        this.canvas = null;
        this.inputSurface = null;
        this.renderer = null;
        this._sharedPixiRenderer = null;
        this._pixiWasRunning = false;
        this._pixiCanvasStyle = null;
        this._pixiSize = null;
        this.camera = null;
        this.mapScene = null;
        this.eventGroup = null;
        this.frame = null;
        this.librariesLoaded = false;
        this._librariesPromise = null;
        this._activationPromise = null;
        this._desiredEnabled = false;
        this._lifecycleGeneration = 0;
        this._rebuildGeneration = 0;
        this.sheetImages = {};
        this.lastError = null;

        // Orbit state. Distance is in tiles; the map is one unit per tile.
        // A shallow pitch is the point of the view: from overhead a standing
        // facade is edge-on and the map looks exactly like the 2D one.
        this.view = { yaw: 0, pitch: 34, distance: 24, target: { x: 0, y: 0, z: 0 } };
        this.pointer = null;
        this.billboards = [];
        this.labels = [];
        // Beyond this the labels overlap into a band; the sprites still read.
        this.LABEL_DISTANCE = 45;
        // The camera distance the label sizes were chosen at.
        this.LABEL_REFERENCE = 24;
        this.pickables = [];

        this.fs = null;
        this.path = null;
        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.fs && host?.path) {
            this.fs = host.fs;
            this.path = host.path;
        }
        if (!this.fs && typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    //-------------------------------------------------------------------------
    // Libraries

    /**
     * Load three.js and the runtime's 3D module into the page.
     *
     * Desktop builds read both from the runtime directory and inject them as
     * classic scripts. Web builds load the same files from the bundled project's
     * URL-addressable runtime. Loading on demand means an editor session that
     * never opens the 3D view never parses two megabytes of three.js.
     */
    _t(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    /**
     * Crash breadcrumbs. A native GPU/renderer crash kills the process
     * before any JS handler runs, so each activation stage is written
     * synchronously to localStorage — which survives the death. The next
     * launch reads the leftover stage, knows the 3D view took the editor
     * down, records which context strategy was in flight, and tries the
     * other one. Context sharing with PIXI was itself the fix for one
     * class of Windows GPU-process crashes, and a dedicated context is
     * the escape from another; no single strategy survives every driver.
     */
    _stage(name) {
        try {
            localStorage.setItem('rrMap3DStage', name);
        } catch (error) { /* private mode: fly blind */ }
    }

    _clearStage() {
        try {
            localStorage.removeItem('rrMap3DStage');
        } catch (error) { /* nothing to clear */ }
    }

    _crashedStrategies() {
        try {
            return (localStorage.getItem('rrMap3DCrashedStrategies') || '')
                .split(',').filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    _pickContextStrategy() {
        const crashed = this._crashedStrategies();
        const strategy = crashed.indexOf('shared') >= 0 ? 'separate' : 'shared';
        try {
            localStorage.setItem('rrMap3DStrategy', strategy);
        } catch (error) { /* best effort */ }
        return strategy;
    }

    async ensureLibraries() {
        if (this.librariesLoaded) return true;
        if (typeof window !== 'undefined' && window.pako && window.THREE && window.Reactor3D) {
            this.librariesLoaded = true;
            return true;
        }

        if (this._librariesPromise) return this._librariesPromise;
        this._librariesPromise = this.loadLibraries();
        const loaded = await this._librariesPromise;
        if (!loaded) this._librariesPromise = null;
        return loaded;
    }

    async loadLibraries() {
        const host = typeof window !== 'undefined' ? window.RPGReactorWebHost : null;
        if (host?.mode === 'web' && host.projectRoot && typeof host.assetUrl === 'function') {
            const root = String(host.projectRoot).replace(/\/+$/, '');
            const files = [];
            if (!window.pako) files.push(`${root}/js/libs/pako.min.js`);
            if (!window.THREE) files.push(`${root}/js/libs/three.js`);
            if (!window.Reactor3D) files.push(`${root}/js/reactor_3d.js`);
            try {
                for (const file of files) {
                    await this.injectScriptUrl(host.assetUrl(file), file);
                }
            } catch (error) {
                this.lastError = error.message;
                return false;
            }
            return this.finishLibraryLoad();
        }

        const runtimePath = this.projectController?.projectManager?.getRuntimePath?.();
        if (!runtimePath || !this.fs || !this.path) {
            this.lastError = 'The runtime directory could not be found.';
            return false;
        }

        const files = [];
        if (typeof window === 'undefined' || !window.pako) files.push(this.path.join(runtimePath, 'libs', 'pako.min.js'));
        if (typeof window === 'undefined' || !window.THREE) files.push(this.path.join(runtimePath, 'libs', 'three.js'));
        if (typeof window === 'undefined' || !window.Reactor3D) files.push(this.path.join(runtimePath, 'reactor_3d.js'));
        for (const file of files) {
            if (!this.fs.existsSync(file)) {
                this.lastError = `Missing ${file}`;
                return false;
            }
        }

        try {
            for (const file of files) {
                await this.injectScript(this.fs.readFileSync(file, 'utf8'), file);
            }
        } catch (error) {
            this.lastError = error.message;
            return false;
        }

        return this.finishLibraryLoad();
    }

    finishLibraryLoad() {
        this.librariesLoaded = !!(window.pako && window.THREE && window.Reactor3D);
        if (!this.librariesLoaded) this.lastError = 'A 3D runtime dependency did not load.';
        return this.librariesLoaded;
    }

    injectScript(source, label) {
        // A Blob URL, not element.textContent: inline script text parses
        // synchronously on the main thread, and V8's recursive parser
        // overflows the ~1MB Windows main-thread stack on a 2MB bundle —
        // STATUS_ACCESS_VIOLATION, the whole editor gone, while Linux's 8MB
        // stacks never noticed. External-script semantics compile off the
        // main thread with room to breathe.
        return new Promise((resolve, reject) => {
            const blob = new Blob([source + '\n//# sourceURL=' + label], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const element = document.createElement('script');
            element.src = url;
            element.dataset.rrSource = label;
            element.onload = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            element.onerror = () => {
                URL.revokeObjectURL(url);
                element.remove?.();
                reject(new Error(`Could not load ${label}`));
            };
            document.head.appendChild(element);
        });
    }

    injectScriptUrl(url, label) {
        return new Promise((resolve, reject) => {
            const element = document.createElement('script');
            element.src = url;
            element.dataset.rrSource = label;
            element.onload = resolve;
            element.onerror = () => {
                element.remove?.();
                reject(new Error(`Could not load ${label}`));
            };
            document.head.appendChild(element);
        });
    }

    //-------------------------------------------------------------------------
    // Enable / disable

    isEnabled() {
        return this.enabled;
    }

    async setEnabled(on) {
        const requested = on === true;
        this._desiredEnabled = requested;
        if (!requested) {
            this._lifecycleGeneration++;
            this.teardown();
            return false;
        }
        if (this.enabled) return true;
        if (this._activationPromise) {
            const active = await this._activationPromise;
            if (active || !this._desiredEnabled) return active;
            return this.setEnabled(true);
        }

        const generation = ++this._lifecycleGeneration;
        const activation = this.activate(generation);
        const tracked = activation.finally(() => {
            if (this._activationPromise === tracked) this._activationPromise = null;
        });
        this._activationPromise = tracked;
        return tracked;
    }

    async activate(generation) {
        try {
            const crashed = this._crashedStrategies();
            if (crashed.indexOf('shared') >= 0 && crashed.indexOf('separate') >= 0) {
                throw new Error(this._t('The 3D view keeps crashing on this system; it stays off to protect your work.'));
            }
            this._stage('libraries');
            if (!await this.ensureLibraries()) {
                this._clearStage();
                console.error(`3D view unavailable: ${this.lastError}`);
                return false;
            }
            if (!this.activationIsCurrent(generation)) {
                this._clearStage();
                return false;
            }

            this.enabled = true;
            this._stage('canvas');
            if (!this.createCanvas()) throw new Error('The 3D map container could not be found.');
            if (!this.activationIsCurrent(generation)) {
                this._clearStage();
                this.teardown();
                return false;
            }

            this._stage('build');
            const rebuilt = await this.rebuild();
            if (!this.activationIsCurrent(generation)) {
                this._clearStage();
                this.teardown();
                return false;
            }
            if (!rebuilt) throw new Error('The open map could not be built in 3D.');

            // Draw once before committing the preference. Context, shader, and
            // first-frame errors therefore fail while durable state is still 2D.
            this._stage('first-render');
            this.render(typeof performance !== 'undefined' ? performance.now() : 0);
            this.startLoop();
            this.listenForEdits();
            this.showPixi(false);
            this._clearStage();
            return true;
        } catch (error) {
            this._clearStage();
            if (generation === this._lifecycleGeneration) this.fail(error);
            else this.teardown();
            return false;
        }
    }

    activationIsCurrent(generation) {
        return this._desiredEnabled && generation === this._lifecycleGeneration;
    }

    fail(error) {
        this.lastError = error?.message || String(error || '3D view unavailable');
        console.error(`3D view unavailable: ${this.lastError}`);
        this._desiredEnabled = false;
        this._lifecycleGeneration++;
        this.teardown();
        if (typeof this.onFailure === 'function') this.onFailure(this.lastError);
    }

    /**
     * Follow edits made with the 2D tools.
     *
     * Debounced rather than immediate: a rebuild remakes every buffer, and a
     * fill or a large stamp can announce several strokes in quick succession.
     */
    listenForEdits() {
        if (this._onMapEdited || typeof document === 'undefined') return;
        // Throttled, not merely debounced. A trailing debounce never fires
        // while the pointer keeps moving, so shaping ground with the height
        // brush showed nothing at all until the drag ended — which is the one
        // thing that tool cannot be used without. This rebuilds straight away
        // when the last one was long enough ago, and otherwise schedules the
        // tail, so a continuous drag still updates while a burst of strokes
        // from a fill collapses into one.
        const REBUILD_INTERVAL = 220;
        this._lastRebuildAt = 0;
        const runRebuild = () => {
            this._lastRebuildAt = Date.now();
            this._rebuildTimer = null;
            this.rebuild().catch(error => this.fail(error));
        };
        this._onMapEdited = () => {
            const since = Date.now() - (this._lastRebuildAt || 0);
            if (since >= REBUILD_INTERVAL) {
                clearTimeout(this._rebuildTimer);
                runRebuild();
                return;
            }
            if (this._rebuildTimer) return;
            this._rebuildTimer = setTimeout(runRebuild, REBUILD_INTERVAL - since);
        };
        document.addEventListener('rr-map-edited', this._onMapEdited);

        // The tileset's 3D classification decides what stands up, and it is
        // edited in the Database rather than on the map — so nothing announced
        // it here and the view kept the shapes it was built with until the map
        // was next painted. `rebuild` re-reads the classification, so following
        // the announcement is enough. Throttled with the same handler, since a
        // stroke of the Shape tool announces per cell.
        this._onClassesChanged = this._onMapEdited;
        document.addEventListener('rr-tileset-3d-saved', this._onClassesChanged);

        // An event's note decides how it stands — see `buildEvents` — so a
        // note edited in the event window has to reach here. But events are
        // their own layer: editing or deleting one must not blink every model
        // on the map, so this refreshes the event pieces (with a per-event
        // diff) instead of rebuilding the world.
        this._onEventsChanged = () => this.refreshEvents();
        document.addEventListener('rr-events-changed', this._onEventsChanged);

        // Selecting an event anywhere — the map, the events panel, the editor —
        // funnels through EventManager.selectEvent, so following that keeps the
        // 3D highlight in step without knowing who did the selecting.
        this._onEventSelected = event => this.selectEventById(event.detail?.eventId);
        document.addEventListener('rr-event-selected', this._onEventSelected);
    }

    stopListeningForEdits() {
        if (typeof document !== 'undefined') {
            if (this._onMapEdited) document.removeEventListener('rr-map-edited', this._onMapEdited);
            if (this._onClassesChanged) {
                document.removeEventListener('rr-tileset-3d-saved', this._onClassesChanged);
            }
            if (this._onEventsChanged) {
                document.removeEventListener('rr-events-changed', this._onEventsChanged);
            }
            if (this._onEventSelected) document.removeEventListener('rr-event-selected', this._onEventSelected);
        }
        clearTimeout(this._rebuildTimer);
        this._onMapEdited = null;
        this._onClassesChanged = null;
        this._onEventsChanged = null;
        this._onEventSelected = null;
    }

    /** Highlight the mesh belonging to an event id, or clear the highlight. */
    selectEventById(eventId) {
        if (!this.eventGroup) return null;
        if (eventId === null || eventId === undefined) return this.select(null);
        const match = this.pickables.find(mesh =>
            mesh.userData.event && mesh.userData.event.id === eventId);
        return match ? this.select(match) : null;
    }

    teardown() {
        this.enabled = false;
        this._rebuildGeneration++;
        this.stopLoop();
        this.stopListeningForEdits();
        this.detachInput();
        try { this.clearScene(); } catch (error) {
            console.error('Could not completely clear the 3D scene:', error);
        }
        const sharedPixiRenderer = this._sharedPixiRenderer;
        if (this.renderer) {
            const renderer = this.renderer;
            this.renderer = null;
            try { renderer.dispose(); } catch (_) {}
        }
        if (this.inputSurface?.parentNode) {
            this.inputSurface.parentNode.removeChild(this.inputSurface);
        }
        if (this._ownCanvas && this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this._ownCanvas = false;
        if (this.hint && this.hint.parentNode) {
            this.hint.parentNode.removeChild(this.hint);
        }
        this.hint = null;
        this.inputSurface = null;
        if (sharedPixiRenderer) {
            try {
                if (this.canvas && this._pixiCanvasStyle !== null) {
                    this.canvas.style.cssText = this._pixiCanvasStyle;
                }
                sharedPixiRenderer.resetState?.();
                const size = this._pixiSize;
                if (size) sharedPixiRenderer.resize?.(size.width, size.height);
            } catch (error) {
                console.error('Could not restore the 2D renderer state:', error);
            }
        }
        // The saved size predates whatever the layout did while 3D was up,
        // so a straight restore could leave the 2D view showing a cropped
        // corner of the map until the next manual zoom. Recompute from the
        // live layout once the 3D surfaces are out of the DOM — the same
        // crop-and-redraw a wheel zoom runs.
        // A timeout, not requestAnimationFrame: this is layout cleanup, not
        // a frame, and the watchdog that proves a failed render schedules no
        // further frames counts rAF calls.
        setTimeout(() => {
            const tilemap = this.projectController?.tilemapManager
                || this.projectController?.getTilemapManager?.();
            tilemap?.applyViewportCrop?.();
            tilemap?.renderMap?.({ preserveScroll: true });
        });
        this.canvas = null;
        this.camera = null;
        this.sheetImages = {};
        this._sharedPixiRenderer = null;
        this._pixiCanvasStyle = null;
        this._pixiSize = null;
        this.showPixi(true);
        const app = this.projectController?.app;
        if (this._pixiWasRunning) app?.start?.();
        try { app?.render?.(); } catch (_) {}
        this._pixiWasRunning = false;
        window.reactor?.updateMapZoom?.();
        this.projectController?.videoSurfacePreviewManager?.refreshBackend?.();
    }

    /**
     * Show or hide the 2D canvas.
     *
     * Hidden rather than destroyed: TilemapManager owns it, has sized and
     * cropped it for this map, and turning 3D off has to give it back exactly
     * as it was.
     */
    showPixi(visible) {
        const canvas = this.projectController?.app?.canvas;
        // 3D renders into PIXI's WebGL canvas, so only the 2D scene is paused;
        // the shared canvas itself must remain visible.
        if (canvas) canvas.style.display = visible || this._sharedPixiRenderer ? 'block' : 'none';
        // The 2D scrollbars sit above everything at z-index 1000 and scroll a
        // canvas that is no longer on screen, so they go with it.
        for (const bar of document.querySelectorAll('.custom-scrollbar')) {
            bar.style.display = visible ? '' : 'none';
        }
    }

    container() {
        return document.getElementById('canvas-container');
    }

    createCanvas() {
        const container = this.container();
        if (!container) return false;
        if (this.renderer && this.canvas) return true;

        const app = this.projectController?.app;
        this._contextStrategy = this._pickContextStrategy();
        if (this._contextStrategy === 'separate') {
            // A dedicated canvas and context: the escape hatch for drivers
            // that crash on the PIXI/three shared-context handoff. PIXI is
            // paused and hidden exactly as in the shared path.
            this._pixiWasRunning = app?.ticker?.started === true;
            app?.stop?.();
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'map-3d-canvas';
            this.canvas.style.cssText =
                'position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 5;';
            container.appendChild(this.canvas);
            this._ownCanvas = true;
            this.inputSurface = document.createElement('div');
            this.inputSurface.id = 'map-3d-input';
            this.inputSurface.style.cssText =
                'position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 6;';
            container.appendChild(this.inputSurface);
            this.createHint(container);
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: false,
                powerPreference: 'default'
            });
            this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.camera = Reactor3D.createCamera({ fov: 40 });
            this.resize();
            this.attachInput();
            return true;
        }
        const pixiRenderer = app?.renderer;
        const context = pixiRenderer?.gl;
        if (!app?.canvas || !context) {
            throw new Error('The 2D WebGL renderer is unavailable for the 3D map view.');
        }
        if (pixiRenderer.context?.webGLVersion !== 2 || context.isContextLost?.()) {
            throw new Error('WebGL 2 is unavailable for the 3D map view.');
        }

        // Chromium/ANGLE can terminate its GPU process when NW.js creates a
        // second WebGL2 context beside PIXI's on Windows. PIXI supports sharing
        // its context with Three.js as long as each renderer resets its state
        // before handing ownership back.
        this.canvas = app.canvas;
        this._sharedPixiRenderer = pixiRenderer;
        this._pixiWasRunning = app.ticker?.started === true;
        this._pixiCanvasStyle = this.canvas.style.cssText || '';
        const pixiScreen = pixiRenderer.screen;
        this._pixiSize = pixiScreen && Number.isFinite(pixiScreen.width) && Number.isFinite(pixiScreen.height)
            ? { width: pixiScreen.width, height: pixiScreen.height }
            : null;
        app.stop?.();
        pixiRenderer.resetState?.();
        Object.assign(this.canvas.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            display: 'block',
            zIndex: '5'
        });

        // Keep PIXI's event system from receiving 3D painting/orbit gestures.
        // This surface handles input only and creates no additional GPU context.
        this.inputSurface = document.createElement('div');
        this.inputSurface.id = 'map-3d-input';
        this.inputSurface.style.cssText =
            'position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 6;';
        container.appendChild(this.inputSurface);

        this.createHint(container);
        try {
            Reactor3D.clearUnpackState?.(context);
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                context,
                antialias: false
            });
        } catch (error) {
            throw error;
        }
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.camera = Reactor3D.createCamera({ fov: 40 });
        this.resize();
        this.attachInput();
        return true;
    }

    /**
     * A one-off note about the controls.
     *
     * None of orbit, pan or re-frame is guessable from looking at the canvas,
     * and a viewport nobody can steer is a viewport nobody uses. It fades on
     * its own rather than needing dismissing.
     */
    createHint(container) {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        this.hint = document.createElement('div');
        this.hint.className = 'map-3d-hint';
        this.hint.textContent = tt('Drag to paint or orbit · Shift or right-drag to pan · Scroll to zoom · Double-click empty space to re-frame');
        container.appendChild(this.hint);
        // Two frames, so the transition has a start state to animate from.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (this.hint) this.hint.classList.add('is-fading');
        }));
    }

    resize() {
        const container = this.container();
        if (!container || !this.renderer || !this.camera) return;
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    //-------------------------------------------------------------------------
    // Scene

    currentMap() {
        return this.projectController?.getTilemapManager?.()?.currentMap || null;
    }

    currentTileset() {
        return this.projectController?.getTilemapManager?.()?.currentTileset || null;
    }

    projectPath() {
        return this.projectController?.getCurrentProject?.()?.path || null;
    }

    /**
     * Rebuild the scene from whatever map is open.
     *
     * Cheap enough to call on every edit: the geometry builder produces one
     * merged mesh per tileset sheet, so even a 200x200 map is a handful of
     * buffers rather than tens of thousands of objects.
     */
    async rebuild() {
        if (!this.enabled || !this.renderer) return false;
        const request = ++this._rebuildGeneration;
        const renderer = this.renderer;
        const mapData = this.currentMap();
        const tileset = this.currentTileset();
        if (!mapData || !tileset) return false;
        const budgetError = this.previewBudgetError(mapData);
        if (budgetError) {
            this.lastError = budgetError;
            throw new RangeError(budgetError);
        }

        // Asset caches are keyed by file name, which is only unique within one
        // project: opening a second project whose tileset or character sheet
        // shares a name would otherwise draw the first project's artwork.
        const projectPath = this.projectPath();
        if (projectPath !== this._cachedProjectPath) {
            this.sheetImages = {};
            this.characterImages = {};
            // Dropped with the rest: two projects can hold a parallax of the
            // same name, and keeping the first one's picture would draw the
            // wrong floor under the second one's map.
            this.parallaxImages = {};
            this._cachedProjectPath = projectPath;
        }

        this.attachSidecar(mapData);
        this.loadClassification();
        const bitmaps = await this.loadSheets(tileset);
        // Loaded before the scene is built, because building it is synchronous
        // and a parallax that arrives afterwards would arrive to no scene.
        const parallaxes = await this.loadParallaxes(mapData);
        if (!this.rebuildIsCurrent(request, renderer)) return false;

        this.clearScene();
        this.mapScene = new Reactor3D.MapScene(mapData, bitmaps, {
            flags: tileset.flags,
            tilesetId: tileset.id,
            tileSize: this.tilePixels(),
            // The runtime reaches for ImageManager here. There is no game
            // running in the editor, so the pictures come off disk instead —
            // without which a parallax-mapped map previews as its bare tile
            // layers, which on a parallax map is very close to nothing.
            loadParallax: name => parallaxes[name] || null
        });
        this.mapScene.setPass('all');
        this.applyAtmosphere(mapData);
        this.buildGrid(mapData);
        this.buildHoverCell();
        if (!await this.buildEvents(mapData, request)) return false;
        this.buildProps(mapData, request);
        this.drawPassage();
        if (!this.rebuildIsCurrent(request, renderer)) return false;
        this.projectController?.videoSurfacePreviewManager?.attachThree?.(this);
        // Frame the map when it is a different map, not on every rebuild.
        // A rebuild happens on every edit, and re-framing threw away wherever
        // the author had orbited and zoomed to — so the view jumped back and
        // the zoom reset each time, which makes the camera feel broken rather
        // than merely resetting. Resizing counts as a different map, since the
        // old framing no longer fits it.
        const framing = `${mapData.id}:${mapData.width}x${mapData.height}`;
        if (framing !== this._framedMap) {
            this._framedMap = framing;
            this.frameMap(mapData);
        }

        // An empty view has several possible causes — no sheets on disk, a
        // tileset with no images, geometry that built nothing — and they look
        // identical on screen. Keep the counts where they can be read.
        this.lastBuild = {
            map: `${mapData.width}x${mapData.height}`,
            sheets: Object.keys(bitmaps).length,
            meshes: this.mapScene._meshes.length,
            events: this.eventGroup ? this.eventGroup.children.length : 0
        };
        return true;
    }

    rebuildIsCurrent(request, renderer = this.renderer) {
        return this.enabled && request === this._rebuildGeneration && renderer === this.renderer;
    }

    previewBudgetError(mapData) {
        const cells = Number(mapData?.width) * Number(mapData?.height);
        if (!Number.isFinite(cells) || cells <= 0) return 'The map dimensions are invalid.';
        // The largest production map validated throughout the 3D work is
        // 200x200. Unlike the chunked 2D renderer, 3D must construct the whole
        // scene before one frame can draw, so larger maps need a future culler
        // rather than an allocation attempted on the renderer process.
        if (cells > 40000) {
            return 'This map is too large for the 3D editor preview (40,000-cell limit).';
        }

        const data = Array.isArray(mapData.data) ? mapData.data : [];
        let estimatedQuads = 0;
        for (let layer = 0; layer < 4; layer++) {
            const start = layer * cells;
            const end = Math.min(data.length, start + cells);
            for (let index = start; index < end; index++) {
                const tileId = Number(data[index]) || 0;
                if (tileId > 0) estimatedQuads += tileId >= 2048 ? 4 : 1;
                if (estimatedQuads > 400000) {
                    return 'This map has too much tile geometry for the 3D editor preview.';
                }
            }
        }
        return '';
    }

    /**
     * The project's tile size in pixels, taken from the map surface that
     * already reads it so the two views cannot disagree about cell size.
     */
    tilePixels() {
        return this.projectController?.tilemapManager?.TILE_SIZE || this.tileSize || 48;
    }

    /**
     * Read the map's elevation sidecar, if it has one.
     *
     * Without it every cell sits at elevation 0, which is what an existing 2D
     * map looks like before any elevation has been painted — flat, but correct.
     */
    attachSidecar(mapData) {
        if (!this.fs || !this.path || !mapData || !mapData.id) return;
        // Only when the map has none in hand. A rebuild runs on every edit, and
        // re-reading the file each time would overwrite elevation painted since
        // the last save with whatever is still on disk — the height brush would
        // undo itself a few strokes in.
        if (mapData.reactor3d) return;
        const projectPath = this.projectPath();
        if (!projectPath) return;

        const file = `Map${String(mapData.id).padStart(3, '0')}${Reactor3D.SIDECAR_SUFFIX}`;
        const filePath = this.path.join(projectPath, 'data', file);
        if (!this.fs.existsSync(filePath)) return;
        try {
            mapData.reactor3d = JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error(`${file} is not valid JSON.`, error);
        }
    }

    /**
     * Give the scene a sky and some distance.
     *
     * Without them the map is a lit slab floating in a void, and its edge is a
     * hard line against nothing. Fog fades the far side of a large map into the
     * same colour as the sky, which reads as depth and hides that edge. The
     * colour is taken from the editor's own theme so the viewport does not
     * fight whatever palette is in use.
     */
    applyAtmosphere(mapData) {
        if (!this.mapScene) return;
        const scene = this.mapScene.scene();
        const colour = new THREE.Color(this.skyColour());
        scene.background = colour;
        // Starts fading beyond a screenful and is total at roughly twice the
        // map's longest side, so a small map never fogs at all.
        const span = Math.max(mapData.width, mapData.height);
        scene.fog = new THREE.Fog(colour, span * 0.9, span * 2.2);
    }

    skyColour() {
        // `--color-bg-base`, not `--color-bg-deep`: deep is pure black on the
        // dark themes, and a black sky gives fog nothing to fade into, so
        // distance reads as the map simply ending.
        const fallback = 0x1a1a1a;
        if (typeof window === 'undefined' || !window.getComputedStyle) return fallback;
        try {
            const value = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-bg-base').trim();
            // three.js reads hex and named colours but not `var(...)`, and an
            // empty string would silently become black.
            return value && !value.startsWith('var') ? value : fallback;
        } catch (error) {
            return fallback;
        }
    }

    /**
     * Hand the runtime the project's tile classification.
     *
     * The runtime fetches this over XHR relative to the running game; there is
     * no running game here, so the editor reads it off disk. Without it every
     * tile falls back to the flag guess and the height cap then rejects any
     * building taller than eight tiles — which does not merely leave it flat,
     * it paints the wall art onto the floor as ground texture.
     */
    loadClassification() {
        if (!this.fs || !this.path || typeof Reactor3D === 'undefined') return;
        const projectPath = this.projectPath();
        if (!projectPath) return;

        const filePath = this.path.join(projectPath, 'data', Reactor3D.CLASSIFICATION_FILE);
        if (!this.fs.existsSync(filePath)) {
            Reactor3D.setClassification(null);
            return;
        }
        try {
            Reactor3D.setClassification(JSON.parse(this.fs.readFileSync(filePath, 'utf8')));
        } catch (error) {
            console.error(`${Reactor3D.CLASSIFICATION_FILE} is not valid JSON.`, error);
            Reactor3D.setClassification(null);
        }
    }

    /**
     * Load the tileset sheets as plain images.
     *
     * Not the TilemapManager's PIXI textures: those live in a WebGL context
     * three.js cannot read from, and the underlying image is what a
     * CanvasTexture wants anyway.
     */
    async loadSheets(tileset) {
        const projectPath = this.projectPath();
        if (!projectPath || !this.path) return {};

        const bitmaps = {};
        const directory = this.path.join(projectPath, 'img', 'tilesets');
        const pending = [];

        tileset.tilesetNames.forEach((name, index) => {
            if (!name) return;
            const cached = this.sheetImages[name];
            if (cached) {
                bitmaps[index] = cached;
                return;
            }
            const filePath = this.path.join(directory, `${name}.png`);
            if (this.fs && !this.fs.existsSync(filePath)) return;

            pending.push(new Promise(resolve => {
                const image = new Image();
                image.onload = () => {
                    const bitmap = { image, width: image.naturalWidth, height: image.naturalHeight };
                    this.sheetImages[name] = bitmap;
                    bitmaps[index] = bitmap;
                    resolve();
                };
                // A missing sheet leaves a hole in the map rather than failing
                // the whole build; the other sheets still draw.
                image.onerror = () => resolve();
                image.src = this.assetUrl(filePath);
            }));
        });

        await Promise.all(pending);
        return bitmaps;
    }

    /**
     * The parallaxes this map lays on the ground, by name.
     *
     * The map's own, plus any `<MultiParallax>` blocks in its note — which is
     * everything that can be known from the map data. Layers an author adds
     * with a plugin *command* are created when an event runs, so there is
     * nothing for the editor to read and they cannot appear in the preview.
     */
    async loadParallaxes(mapData) {
        const projectPath = this.projectPath();
        if (!projectPath || !this.path || typeof Reactor3D === 'undefined') return {};

        // The room's floor, walls and ceiling are parallaxes too, and go
        // through the same loader.
        const names = Reactor3D.parallaxGroundLayers(mapData).map(layer => layer.name)
            .concat(typeof Reactor3D.roomImageNames === 'function'
                ? Reactor3D.roomImageNames(mapData) : []);
        if (!names.length) return {};

        if (!this.parallaxImages) this.parallaxImages = {};
        const directory = this.path.join(projectPath, 'img', 'parallaxes');
        const loaded = {};
        const pending = [];

        for (const name of names) {
            if (!name || loaded[name]) continue;
            const cached = this.parallaxImages[name];
            if (cached) {
                loaded[name] = cached;
                continue;
            }
            const imageUrl = RRAssetFiles.imageUrlFor(directory, name);
            if (!imageUrl) continue;

            pending.push(new Promise(resolve => {
                const image = new Image();
                image.onload = () => {
                    const bitmap = { image, width: image.naturalWidth, height: image.naturalHeight };
                    this.parallaxImages[name] = bitmap;
                    loaded[name] = bitmap;
                    resolve();
                };
                // One parallax that will not load costs its own layer, the way
                // a missing sheet costs its own tiles.
                image.onerror = () => resolve();
                image.src = imageUrl;
            }));
        }

        await Promise.all(pending);
        return loaded;
    }

    assetUrl(filePath) {
        if (typeof window !== 'undefined' && window.RPGReactorAssetUrl) {
            return window.RPGReactorAssetUrl(filePath);
        }
        return 'file://' + String(filePath).replace(/\\/g, '/');
    }

    /**
     * One cube per event.
     *
     * Events are the thing you cannot see in a 3D view of tile data — they are
     * not in the map's tile planes at all — so they get solid boxes standing on
     * their tile, coloured by trigger so a parallel process reads differently
     * from something you walk into.
     */
    async buildEvents(mapData, request = this._rebuildGeneration) {
        if (!this.mapScene) return;
        const mapScene = this.mapScene;
        const scene = this.mapScene.scene();
        const sheets = await this.loadCharacterSheets(mapData);
        if (!this.rebuildIsCurrent(request) || mapScene !== this.mapScene) return false;

        this.eventGroup = new THREE.Group();
        this.billboards = [];
        this.labels = [];
        this.pickables = [];
        this.animatedEvents = [];
        this.selected = null;

        for (const event of mapData.events || []) {
            if (!event) continue;
            this._buildOneEvent(event, sheets, mapData, request);
        }

        this._eventSnapshot = new Map();
        for (const event of mapData.events || []) {
            if (event) this._eventSnapshot.set(event.id, this._eventIdentity(event, mapData));
        }

        this.buildStartMarkers(mapData);
        scene.add(this.eventGroup);
        this.faceCamera();
        return true;
    }



    /** One event's pieces — sprite or cube, box, label, model preview — built and placed. */
    _buildOneEvent(event, sheets, mapData, request) {

        const elevation = Reactor3D.elevationAt(mapData, event.x, event.y);
        // Preview Event shows a chosen page instead of the first one.
        const previewIndex = MapEditor3D.previewPageIndex(mapData, event);
        const page = event.pages?.[previewIndex ?? 0] || event.pages?.[0];
        const sprite = this.eventSprite(event, sheets, page?.image, previewIndex !== null && page?.stepAnime ? page : null);
        if (previewIndex !== null) this.previewEventModel(event, page, previewIndex, mapData, request);
        const mesh = sprite || new THREE.Mesh(this._eventCube || (this._eventCube = new THREE.BoxGeometry(0.55, 0.55, 0.55)), new THREE.MeshBasicMaterial({
            color: this.eventColor(event),
            transparent: true,
            opacity: 0.8
        }));
        const height = sprite ? sprite.userData.height : 0.55;
        // What the raycaster hands back on a click.
        mesh.userData.event = event;
        mesh.userData.height = height;
        this.eventGroup.add(mesh);
        this.pickables.push(mesh);

        /*
         * A box round the event, so it reads as one.
         *
         * An event drawn from a character sheet is just a picture standing
         * on the map, indistinguishable from a painted tree until you
         * click it. The 2D canvas borders every event for exactly that
         * reason. Only the edges are drawn — a filled box would have to be
         * transparent, and transparent boxes are what sliced the labels.
         */
        const boxHeight = Math.max(height, 0.94);
        const box = this.eventBox(boxHeight, this.eventColor(event));
        mesh.userData.box = box;
        mesh.userData.boxHeight = boxHeight;
        this.eventGroup.add(box);

        /*
         * An event can say what it is, in its own note.
         *
         * An event whose graphic is a *tile* inherits that tile's 3D class
         * before any geometry is built. One drawn from a character sheet
         * has no tile to inherit from, so it says so itself — `<3d panel>`,
         * `<3d panel east>`, `<3d upright>`, `<3d flat>` — which is what
         * lets an animated piece of a city stand with the painted
         * buildings beside it instead of turning to follow the viewer.
         *
         * Anything that says nothing keeps turning, which is right for
         * anything character-shaped.
         */
        const asked = sprite ? Reactor3D.eventShapeFromNote(event.note) : null;
        mesh.userData.asked = !!asked;
        // Standing against a wall means standing still: a sprite that is
        // part of the art beside it must not turn away from it.
        // An event that has asked to stand on the ground never joins the
        // object painted over its cell, here as in the running game.
        const loose = Reactor3D.eventStaysOnGround?.(event.note);
        mesh.userData.loose = !!loose;
        const onFacade = sprite && !asked && !loose
            && !!this.mapScene?.facadeAt?.(event.x, event.y);
        if (!sprite || !asked) {
            if (sprite && !onFacade) this.billboards.push(mesh);
        } else if (asked.shape === 'flat') {
            mesh.rotation.x = -Math.PI / 2;
            mesh.userData.flat = true;
        } else {
            // Panel and upright both stand still; only the way they face
            // differs, and an upright keeps the map's own orientation.
            mesh.rotation.y = asked.shape === 'panel'
                ? Reactor3D.facingRotation(asked.facing)
                : 0;
        }

        const label = this.eventLabel(event);
        if (label) {
            label.userData.event = event;
            mesh.userData.label = label;
            this.eventGroup.add(label);
            this.billboards.push(label);
            this.labels.push(label);
        }

        // One place decides where an event's pieces sit, because dragging
        // one has to put all three back down together.
        this.placeEvent(mesh);
        
    }

    /** What one event looks like in this view; a change means rebuild its pieces. */
    _eventIdentity(event, mapData) {
        const previewIndex = MapEditor3D.previewPageIndex(mapData, event);
        const page = event.pages?.[previewIndex ?? 0] || event.pages?.[0];
        return JSON.stringify([
            event.x, event.y, event.name, event.note, previewIndex,
            page && page.image, page && page.stepAnime,
            Reactor3D.eventModelSpec ? Reactor3D.eventModelSpec(mapData, event.id, previewIndex ?? 0) : null,
            Reactor3D.eventZAt ? Reactor3D.eventZAt(mapData, event.id) : 0
        ]);
    }

    /**
     * The starting positions, drawn the way the 2D map draws them.
     *
     * The player's start is not an event, so nothing put it in the 3D view:
     * the cell you begin on was invisible there. It gets the same wire box
     * and label an event has, in the 2D marker's colour, plus an arrow on
     * the ground for the way the player faces; the vehicles get box and
     * label. None of it is pickable — a right-click on the cell opens the
     * map menu, where Set Starting Position and Player Facing live.
     */
    buildStartMarkers(mapData) {
        this.startMarkers = [];
        if (!this.eventGroup || !mapData || typeof THREE === 'undefined') return;
        const system = window.reactor?.databaseManager?.getSystem?.();
        if (!system) return;
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const starts = [
            { slot: system, name: 'Player', color: 0x00ff00, direction: MapEditor3D.startDirection(system) },
            { slot: system.boat, name: 'Boat', color: 0x0088ff },
            { slot: system.ship, name: 'Ship', color: 0xff8800 },
            { slot: system.airship, name: 'Airship', color: 0xff00ff }
        ];
        const mapId = Number(mapData.id);
        for (const start of starts) {
            const slot = start.slot;
            if (!slot || Number(slot.startMapId) !== mapId) continue;
            const x = Number(slot.startX) || 0, y = Number(slot.startY) || 0;
            const elevation = Reactor3D.elevationAt(mapData, x, y);
            const pieces = [];
            const box = this.eventBox(0.94, start.color);
            box.position.set(x + 0.5, elevation + 0.47, y + 0.5);
            pieces.push(box);
            if (start.direction) {
                const arrow = this.startArrow(start.direction, start.color);
                arrow.position.set(x + 0.5, elevation + 0.02, y + 0.5);
                pieces.push(arrow);
            }
            const label = this.textLabel(tt(start.name));
            label.position.set(x + 0.5, elevation + 0.94 + 0.28, y + 0.5);
            pieces.push(label);
            this.billboards.push(label);
            this.labels.push(label);
            for (const piece of pieces) {
                piece.userData.startMarker = true;
                this.eventGroup.add(piece);
                this.startMarkers.push(piece);
            }
        }
    }

    /** A flat arrow on the ground, pointing the way a map direction says. */
    startArrow(direction, color) {
        const shape = new THREE.Shape();
        shape.moveTo(-0.16, -0.22);
        shape.lineTo(0.16, -0.22);
        shape.lineTo(0, 0.22);
        shape.closePath();
        const geometry = new THREE.ShapeGeometry(shape);
        const arrow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.9, side: THREE.DoubleSide
        }));
        // Laid flat, the shape's +y points north (-z); turned for the rest.
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = { 8: 0, 4: Math.PI / 2, 6: -Math.PI / 2, 2: Math.PI }[direction] || 0;
        return arrow;
    }

    /** Redraw the start markers after the start position or facing changed. */
    refreshStartMarkers() {
        if (!this.eventGroup) return;
        for (const piece of this.startMarkers || []) {
            this.eventGroup.remove(piece);
            const at = this.labels.indexOf(piece);
            if (at >= 0) this.labels.splice(at, 1);
            const bill = this.billboards.indexOf(piece);
            if (bill >= 0) this.billboards.splice(bill, 1);
            piece.geometry?.dispose?.();
            const materials = Array.isArray(piece.material) ? piece.material : piece.material ? [piece.material] : [];
            for (const material of materials) { material.map?.dispose?.(); material.dispose?.(); }
        }
        this.buildStartMarkers(this.currentMap());
        this.faceCamera();
        this.updateLabelVisibility();
    }

    /**
     * The wire box drawn round an event.
     *
     * Slightly under a full cell so two events side by side do not fight over
     * the edge they would otherwise share.
     */
    eventBox(height, colour) {
        const side = 0.94;
        const shape = new THREE.BoxGeometry(side, height, side);
        const geometry = new THREE.EdgesGeometry(shape);
        shape.dispose();
        const box = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
            color: colour, transparent: true, opacity: 0.8
        }));
        box.userData.color = colour;
        return box;
    }

    /**
     * Put an event's sprite, box and label where the event says it is.
     *
     * Called when the scene is built and again on every step of a drag, so
     * that the three pieces move as one and land on the ground at their new
     * cell rather than at the height of the old one.
     */
    placeEvent(mesh) {
        const mapData = this.currentMap();
        const event = mesh?.userData?.event;
        if (!mapData || !event) return;

        const height = mesh.userData.height || 0.55;
        const x = event.x + 0.5;

        /*
         * An event standing where the map's art was stood up is drawn on that
         * art, which is what the running game does — `standingPlaceFor` asks
         * `facadeAt` the same question. The editor never did, so an event whose
         * graphic belongs to a building sat on the ground in front of it,
         * turning to follow the camera while the building it belongs to stood
         * still. Rotate ninety degrees and the two came apart, which is what
         * read as the town being drawn twice.
         *
         * An explicit note wins: someone who has said how an event stands has
         * said it about this cell too.
         */
        const facade = (mesh.userData.asked || mesh.userData.loose)
            ? null
            : this.mapScene?.facadeAt?.(event.x, event.y);
        const eventZ = Reactor3D.eventZAt ? Reactor3D.eventZAt(mapData, event.id) : 0;
        const elevation = (facade
            ? facade.height + facade.lift
            : Reactor3D.elevationAt(mapData, event.x, event.y)) + eventZ;
        const z = facade ? facade.z : event.y + 0.5;

        // A flat event lies on the ground; everything else stands on it.
        mesh.position.set(x, mesh.userData.flat ? elevation + 0.01 : elevation + height / 2, z);
        mesh.userData.box?.position.set(x, elevation + mesh.userData.boxHeight / 2, z);
        mesh.userData.label?.position.set(x, elevation + height + 0.28, z);
    }

    /**
     * A line at every cell boundary, so the grid is visible in 3D.
     *
     * The 2D canvas needs none — a tile's own art shows where it ends — but a
     * 3D view of the same map has no such landmark, and placing or dragging an
     * event means knowing which square you are over. Drawn on the ground and
     * faintly, so it reads as a guide rather than as part of the map.
     *
     * One flat plane at the map's base rather than something that follows the
     * terrain: a per-cell grid on a two-hundred-square map is eighty thousand
     * segments, and elevation is rare enough that it is not worth the cost.
     */
    buildGrid(mapData) {
        if (!this.mapScene || !mapData) return;
        const { width, height } = mapData;
        if (!(width > 0) || !(height > 0)) return;

        const base = Reactor3D.elevationAt(mapData, 0, 0) + 0.02;
        const points = [];
        for (let x = 0; x <= width; x++) points.push(x, base, 0, x, base, height);
        for (let z = 0; z <= height; z++) points.push(0, base, z, width, base, z);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(points), 3));
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false
        });
        this.grid = new THREE.LineSegments(geometry, material);
        this.grid.visible = this.gridVisible === true;
        this.mapScene.scene().add(this.grid);
    }

    /** Show or hide the cell grid. */
    setGridVisible(on) {
        this.gridVisible = !!on;
        if (this.grid) this.grid.visible = this.gridVisible;
    }

    /** Show or hide the passage marks in this view. */
    setPassageVisible(on) {
        this.passageVisible = !!on;
        this.drawPassage();
    }

    /** Redraw the passage marks after a change, once per frame. */
    refreshPassage() {
        if (!this.passageVisible || this._passageRefresh) return;
        this._passageRefresh = requestAnimationFrame(() => {
            this._passageRefresh = null;
            this.drawPassage();
        });
    }

    /**
     * The passage marks on the ground of the 3D view: the same reading as
     * the flat map's (`TilemapManager.tilePassage`) - an X where nothing
     * walks, a red edge on a side that cannot be crossed - and red under
     * the tiles a placed model (prop or model event) blocks.
     */
    drawPassage() {
        if (this.passageGroup) {
            this.passageGroup.parent?.remove(this.passageGroup);
            this.passageGroup.traverse(node => { node.geometry?.dispose?.(); node.material?.dispose?.(); });
            this.passageGroup = null;
        }
        this._passageGeneration = (this._passageGeneration || 0) + 1;
        const mapData = this.currentMap();
        if (!this.passageVisible || !mapData || !this.mapScene || typeof TilemapManager === 'undefined' || !TilemapManager.tilePassage) return;
        const tileset = this.projectController?.tilemapManager?.currentTileset
            || this.projectController?.databaseManager?.getTileset?.(mapData.tilesetId);
        const flags = (tileset && tileset.flags) || [];
        const roomFloor = !!(Reactor3D.roomFor && Reactor3D.roomFor(mapData) && Reactor3D.isMap3D(mapData));
        const group = new THREE.Group();
        group.name = 'passage';
        group.userData.__reactorOverlay = true;
        const lines = [];
        const inset = 0.18;
        const lift = 0.03;
        for (let y = 0; y < mapData.height; y++) {
            for (let x = 0; x < mapData.width; x++) {
                const { blocked } = TilemapManager.tilePassage(mapData.data, mapData.width, mapData.height, flags, x, y, roomFloor);
                if (!blocked) continue;
                const h = Reactor3D.elevationAt(mapData, x, y) + lift;
                const x0 = x + inset, x1 = x + 1 - inset, z0 = y + inset, z1 = y + 1 - inset;
                if (blocked === 0x0f) {
                    lines.push(x0, h, z0, x1, h, z1, x1, h, z0, x0, h, z1);
                    continue;
                }
                if (blocked & 1) lines.push(x0, h, z1, x1, h, z1);
                if (blocked & 2) lines.push(x0, h, z0, x0, h, z1);
                if (blocked & 4) lines.push(x1, h, z0, x1, h, z1);
                if (blocked & 8) lines.push(x0, h, z0, x1, h, z0);
            }
        }
        if (lines.length) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines), 3));
            const marks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthTest: false }));
            marks.renderOrder = 996;
            group.add(marks);
        }
        this.mapScene.scene().add(group);
        this.passageGroup = group;
        // Model footprints, as their templates arrive.
        const placements = TilemapManager.modelPlacements ? TilemapManager.modelPlacements(mapData) : [];
        if (!placements.length || typeof RREventPreviewModels === 'undefined' || !Reactor3D.blockedTilesFor) return;
        const generation = this._passageGeneration;
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        for (const placed of placements) {
            // A model in the air blocks nothing on the ground.
            if (placed.z > 0.5) continue;
            RREventPreviewModels.templateFor(project, placed.spec, this).then(template => {
                if (!template || generation !== this._passageGeneration || this.passageGroup !== group) return;
                const tiles = Reactor3D.blockedTilesFor(template, template.userData.reactorSidecar, placed.spec, placed.direction, placed.x, placed.y);
                if (!tiles.length) return;
                const positions = new Float32Array(tiles.length * 18);
                let at = 0;
                for (const tile of tiles) {
                    const h = Reactor3D.elevationAt(mapData, tile.x, tile.y) + 0.02;
                    const x0 = tile.x + 0.04, x1 = tile.x + 0.96, z0 = tile.y + 0.04, z1 = tile.y + 0.96;
                    positions.set([x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z0, x1, h, z1, x0, h, z1], at);
                    at += 18;
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
                fill.renderOrder = 995;
                group.add(fill);
            }).catch(() => {});
        }
    }

    /**
     * The outline that follows the cursor.
     *
     * On the 2D canvas the cursor is already on the map, so where a click will
     * land needs no explaining. Through a perspective camera it does: the
     * pointer is somewhere on the screen and the tile it names is worked out
     * by a raycast, which is not something you can eyeball. So the cell the
     * raycast found is drawn.
     *
     * Built as a unit square at the origin and scaled, so a multi-tile brush
     * outlines everything it will put down rather than just its first cell.
     * `depthTest: false` because it is a cursor: it should not be cut in half
     * by the ground it is lying on. Nothing can hide it wrongly, since a cell
     * with something in front of it is not a cell the raycast can reach.
     */
    buildHoverCell() {
        if (!this.mapScene) return;
        const points = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(points), 3));
        this.hoverCell = new THREE.Line(geometry, new THREE.LineBasicMaterial({
            color: 0xfff2a0, transparent: true, opacity: 0.9, depthTest: false
        }));
        // Under the labels, over everything else.
        this.hoverCell.renderOrder = 998;
        this.hoverCell.visible = false;
        this.mapScene.scene().add(this.hoverCell);
    }

    /** How many cells the brush in hand covers, for sizing the outline. */
    brushSize() {
        const editor = this.mapEditor();
        const stamp = editor?.mapStamp;
        if (stamp?.width > 0 && stamp?.height > 0) {
            return { width: stamp.width, height: stamp.height };
        }
        const tiles = editor?.tilesetPaletteViewer?.selectedTiles;
        if (!Array.isArray(tiles) || !tiles.length) return { width: 1, height: 1 };
        const xs = tiles.map(tile => tile.x);
        const ys = tiles.map(tile => tile.y);
        return {
            width: Math.max(...xs) - Math.min(...xs) + 1,
            height: Math.max(...ys) - Math.min(...ys) + 1
        };
    }

    /** Move the outline onto a cell, or hide it when the cursor is off the map. */
    updateHoverCell(tile) {
        if (!this.hoverCell) return;
        const mapData = this.currentMap();
        if (!tile || !mapData) {
            this.hoverCell.visible = false;
            return;
        }
        const { width, height } = this.brushSize();
        this.hoverCell.scale.set(width, 1, height);
        this.hoverCell.position.set(
            tile.x,
            Reactor3D.elevationAt(mapData, tile.x, tile.y) + 0.03,
            tile.y
        );
        this.hoverCell.visible = true;
    }

    /**
     * Load every character sheet the map's events refer to, once each.
     *
     * A map with three hundred events usually draws them from a handful of
     * sheets, so this is a few loads rather than one per event.
     */
    async loadCharacterSheets(mapData) {
        const projectPath = this.projectPath();
        if (!projectPath || !this.path) return {};

        const names = new Set();
        for (const event of mapData.events || []) {
            const name = event?.pages?.[0]?.image?.characterName;
            if (name) names.add(name);
            const previewIndex = MapEditor3D.previewPageIndex(mapData, event);
            const previewName = previewIndex !== null ? event.pages[previewIndex]?.image?.characterName : null;
            if (previewName) names.add(previewName);
        }

        this.characterImages = this.characterImages || {};
        const directory = this.path.join(projectPath, 'img', 'characters');
        await Promise.all([...names].map(name => new Promise(resolve => {
            if (this.characterImages[name] !== undefined) return resolve();
            const imageUrl = RRAssetFiles.imageUrlFor(directory, name);
            if (!imageUrl) {
                this.characterImages[name] = null;
                return resolve();
            }
            const image = new Image();
            image.onload = () => { this.characterImages[name] = image; resolve(); };
            // A missing sheet leaves that event as a plain cube rather than
            // failing the whole scene.
            image.onerror = () => { this.characterImages[name] = null; resolve(); };
            image.src = imageUrl;
        })));
        return this.characterImages;
    }

    /**
     * A billboard of the event's character graphic.
     *
     * The frame is cropped into its own canvas rather than addressed by UVs:
     * the sheet layouts differ between normal and `$` sheets, and cropping once
     * keeps that arithmetic in one place. Null when the event has no graphic,
     * which is also when the 2D editor shows a bare coloured square.
     */
    /** The page Preview Event chose for this event, or null. */
    static previewPageIndex(mapData, event) {
        const previews = mapData?.reactor3d?.eventPreviews;
        const page = previews ? previews[String(event?.id)] : undefined;
        return Number.isInteger(page) && event?.pages?.[page] ? page : null;
    }

    /**
     * A previewed page bound to a 3D model stands as the model itself, placed
     * and scaled the way the game places it. Loads asynchronously and joins
     * the event group only if this build is still the current one.
     */
    previewEventModel(event, page, pageIndex, mapData, request) {
        if (typeof RREventPreviewModels === 'undefined' || !Reactor3D.eventModelSpec) return;
        const spec = Reactor3D.eventModelSpec(mapData, event.id, pageIndex);
        if (!spec) return;
        const group = this.eventGroup;
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        RREventPreviewModels.templateFor(project, spec, this).then(template => {
            if (!template || !this.rebuildIsCurrent(request) || this.eventGroup !== group) return;
            const object = RREventPreviewModels.instance(template, spec, page?.image?.direction || 2);
            const elevation = Reactor3D.elevationAt(mapData, event.x, event.y)
                + (Reactor3D.eventZAt ? Reactor3D.eventZAt(mapData, event.id) : 0);
            object.position.set(event.x + 0.5, elevation, event.y + 0.5);
            object.userData.event = event;
            object.userData.modelPreview = true;
            group.add(object);
            // Clickable by its box, like a prop: a raycast through a heavy
            // mesh on every hover is what jitters.
            object.userData.pickBox = new THREE.Box3().setFromObject(object);
            this.animateModel(object, template, null);
            this.playModelEffects(object, template, '');
        });
    }

    //-------------------------------------------------------------------------
    // Model props
    //
    // The sidecar's `reactor3d.props`, placed as model instances in a group of
    // their own. With the palette's M tab up they can be picked, dragged
    // freely over the ground, turned with pose rings and placed by clicking
    // the ground; `ModelPropsManager` owns the data and the 2D side.

    propsManager() {
        return this.projectController?.modelPropsManager || window.reactor?.modelPropsManager || null;
    }

    canEditProps() {
        return !!this.propsManager()?.active;
    }

    buildProps(mapData, request = this._rebuildGeneration) {
        this.disposeProps();
        if (!this.mapScene || typeof RREventPreviewModels === 'undefined' || !Reactor3D.normalizeModelSpec) return;
        const elevation = window.RRMapElevation;
        const props = elevation ? elevation.props(mapData) : [];
        if (!props.length) return;
        const group = new THREE.Group();
        group.name = 'model-props';
        this.propGroup = group;
        this.mapScene.scene().add(group);
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        for (const prop of props) {
            const spec = Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(prop));
            if (!spec) continue;
            RREventPreviewModels.templateFor(project, spec, this).then(template => {
                if (!template || !this.rebuildIsCurrent(request) || this.propGroup !== group) return;
                const object = RREventPreviewModels.instance(template, spec, prop.direction);
                object.userData.propId = prop.id;
                object.userData.propIdentity = MapEditor3D.propIdentity(prop);
                object.userData.modelPreview = true;
                object.traverse(node => { node.userData.propId = prop.id; });
                this.placeProp(object, prop, mapData);
                group.add(object);
                // Picking tests the box, not the mesh: a raycast through a
                // million triangles on every mouse move is what jitters.
                object.userData.pickBox = new THREE.Box3().setFromObject(object);
                this.animateModel(object, template, prop.animation ? { name: prop.animation, repeat: !!prop.repeat } : null);
                this.playModelEffects(object, template, prop.effect);
                if (this.selectedPropId === prop.id) this.selectProp(prop.id);
            });
        }
    }

    placeProp(object, prop, mapData = this.currentMap()) {
        const elevation = Reactor3D.elevationAt(mapData, Math.round(prop.x), Math.round(prop.y));
        object.position.set(prop.x + 0.5, elevation + prop.z, prop.y + 0.5);
        if (object.userData.pickBox) object.userData.pickBox.setFromObject(object);
    }

    /**
     * Run a placed model's animation rules in the viewport, the way the
     * game runs them: continuous rules on their own, and a starting action
     * (a prop's chosen animation) on demand, repeating when asked.
     */
    animateModel(object, template, action) {
        if (typeof RREventPreviewModels === 'undefined' || !RREventPreviewModels.animate) return;
        const driver = RREventPreviewModels.animate(object, template);
        if (!driver) return;
        driver.object = object;
        driver.start = this._modelFrame || 0;
        driver.action = action ? { name: action.name, frame: driver.start, repeat: !!action.repeat } : null;
        if (driver.action && Reactor3D.rulesForPlacement) {
            driver.rules = Reactor3D.rulesForPlacement(driver.rules, driver.action.name, driver.action.repeat);
        }
        if (!this.animatedModels) this.animatedModels = [];
        this.animatedModels.push(driver);
    }

    /**
     * Play a placed model's effects in the viewport: the ones that play on
     * their own (Always) and the one a prop was given, looping, at their
     * anchors — a database animation as an overlay over the canvas, a video
     * as a plane in the scene. State-triggered effects wait for the game.
     */
    playModelEffects(object, template, chosenName) {
        const sidecar = template && template.userData.reactorSidecar;
        if (!sidecar || typeof Reactor3D === 'undefined' || !Reactor3D.readModelEffects) return;
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        const animations = window.reactor?.databaseManager?.data?.animations || [];
        const started = new Set();
        for (const effect of Reactor3D.readModelEffects(sidecar)) {
            if (effect.trigger !== 'always' && effect.name !== chosenName) continue;
            if (started.has(effect.name)) continue;
            started.add(effect.name);
            if (effect.type === 'video' && effect.video && effect.video.file) {
                const plane = this._videoEffectPlane(effect, project, template.userData.glbSize);
                if (plane) {
                    plane.userData.__reactorOverlay = true;
                    object.add(plane);
                    (this.effectPlays || (this.effectPlays = [])).push({ object, effect, plane });
                }
                continue;
            }
            const record = animations[effect.animation];
            if (!record || typeof RRAnimationPreviewLayer === 'undefined') continue;
            const wrap = this.canvas && this.canvas.parentElement;
            if (!wrap) continue;
            const layer = new RRAnimationPreviewLayer(wrap);
            layer.wrap.style.zIndex = '3';
            const play = { object, effect, layer, record };
            // An Effekseer effect is drawn from this view's camera and shown
            // on a screen-sized quad at the anchor's depth, like the game:
            // a model in front of it hides it. An MV sheet stays an overlay.
            if (record.effectName && Reactor3D.EffekseerScene && Reactor3D.EffekseerScene.quadFor && this.mapScene) {
                play.quad = Reactor3D.EffekseerScene.quadFor(layer.fxCanvas);
                // A WebGL canvas reaches three top-down whatever flipY says;
                // the quad flips V itself. (The game's source is a 2D copy.)
                play.quad.texture.flipY = false;
                play.quad.material.uniforms.flip.value = 1;
                play.quad.mesh.userData.__reactorOverlay = true;
                this.mapScene.scene().add(play.quad.mesh);
                layer.setWorld({ projection: this.camera.projectionMatrix.elements, view: this.camera.matrixWorldInverse.elements, position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] });
            }
            layer.play(record, project?.path || '', { loop: true, transform: { rotate: effect.rotate, scale: effect.scale } });
            (this.effectPlays || (this.effectPlays = [])).push(play);
        }
    }

    _videoEffectPlane(effect, project, extent) {
        if (!project?.path || typeof THREE === 'undefined') return null;
        const path = require('path');
        const file = path.join(project.path, 'movies', effect.video.file);
        const url = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl ? RRAssetFiles.toUrl(file) : 'file://' + file;
        const video = document.createElement('video');
        video.muted = true;
        video.loop = effect.video.loop !== false;
        video.playsInline = true;
        video.src = url;
        const texture = new THREE.VideoTexture(video);
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
        // A fraction of the model's size, in its units, as a child of it.
        const axes = Reactor3D.scaleAxes ? Reactor3D.scaleAxes(effect.scale) : [1, 1, 1];
        const native = Reactor3D.videoEffectSize(effect, extent);
        plane.scale.set(native[0] * axes[0], native[1] * axes[1], 1);
        plane.userData.video = video;
        plane.userData.texture = texture;
        video.play().catch(() => {});
        return plane;
    }

    /** Keep every playing effect on its anchor as the camera and models move. */
    updateEffectPlays() {
        const plays = (this.effectPlays || []).filter(play => play.object.parent);
        this.effectPlays = plays;
        if (!plays.length || !this.camera || !this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const scratch = this._effectScratch || (this._effectScratch = new THREE.Vector3());
        for (const play of plays) {
            if (play.plane) {
                // In the model's own frame: the anchor point, turned by the effect.
                const local = play.object.worldToLocal(Reactor3D.effectAnchorWorld(play.object, play.effect, scratch).clone());
                play.plane.position.copy(local);
                const rotate = play.effect.rotate || [0, 0, 0];
                play.plane.rotation.set(rotate[0] * Math.PI / 180, rotate[1] * Math.PI / 180, rotate[2] * Math.PI / 180, 'YXZ');
                // Anchored to a posed part, the plane turns with the part:
                // in the plane's local frame, conjugated by the object's turn.
                if (Reactor3D.effectAnchorQuaternion) {
                    const pose = Reactor3D.effectAnchorQuaternion(play.object, play.effect, this._poseQuat || (this._poseQuat = new THREE.Quaternion()));
                    if (pose.w !== 1) {
                        const objectQuat = play.object.getWorldQuaternion(this._objQuat || (this._objQuat = new THREE.Quaternion()));
                        play.plane.quaternion.premultiply(objectQuat.clone().invert().multiply(pose).multiply(objectQuat));
                    }
                }
                continue;
            }
            const world = Reactor3D.effectAnchorWorld(play.object, play.effect, scratch);
            if (!world) continue;
            if (play.quad) {
                this._placeEffectQuad(play, world);
                continue;
            }
            const at = world.clone().project(this.camera);
            if (at.z > 1) { play.layer.wrap.style.display = 'none'; continue; }
            const x = (at.x * 0.5 + 0.5) * rect.width;
            const y = (-at.y * 0.5 + 0.5) * rect.height;
            // Sized by how big a tile is on screen at the anchor, like the game's sprite.
            const up = world.clone().add(new THREE.Vector3(0, 1, 0)).project(this.camera);
            const pixelsPerTile = Math.abs(up.y - at.y) * 0.5 * rect.height;
            // Same rule as the game: 384 native pixels span eight tiles.
            play.layer.moveTo(x, y, Math.max(24, pixelsPerTile * 8));
            const rotate = play.effect.rotate || [0, 0, 0];
            // Scale 1 is a model-sized frame: this prop, at its size.
            if (Reactor3D.modelSpanTiles) play.layer.setSpan(Reactor3D.modelSpanTiles(play.object));
            play.layer.setTransform({ rotate: [rotate[0], rotate[1] + play.object.rotation.y * 180 / Math.PI, rotate[2]], scale: play.effect.scale });
            if (play.layer.active) play.layer.wrap.style.display = 'block';
        }
    }

    /**
     * Keep an in-scene effect on its anchor: the camera's matrices and the
     * handle's world placement go to the layer, the quad takes the anchor's
     * clip depth, and its texture is the layer's canvas as of this frame.
     */
    _placeEffectQuad(play, world) {
        const camera = this.camera;
        camera.updateMatrixWorld();
        const clip = this._effectClip || (this._effectClip = new THREE.Vector4());
        clip.set(world.x, world.y, world.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        const mesh = play.quad.mesh;
        if (clip.w <= 0) { mesh.visible = false; return; }
        const record = play.record;
        const rot = record.rotation || { x: 0, y: 0, z: 0 };
        const rotate = play.effect.rotate || [0, 0, 0];
        const r = Math.PI / 180;
        const axes = Reactor3D.scaleAxes ? Reactor3D.scaleAxes(play.effect.scale) : [1, 1, 1];
        const span = Reactor3D.modelSpanTiles ? (Reactor3D.modelSpanTiles(play.object) || 1) : 1;
        const unit = span / 26 * ((record.scale || 100) / 100);
        const size = this.renderer.getDrawingBufferSize(this._effectSize || (this._effectSize = new THREE.Vector2()));
        // The whole view, at its own resolution (the game crops to the
        // effect's box to save pixels every frame; this view simply draws
        // the view; the layer draws it on its own loop and the quad takes
        // the latest picture each render). Past EFFECT_PIXELS the canvas
        // is drawn smaller.
        const area = size.x * size.y;
        const scale = area > MapEditor3D.EFFECT_PIXELS ? Math.sqrt(MapEditor3D.EFFECT_PIXELS / area) : 1;
        const rect = { x: 0, y: 0, w: size.x, h: size.y, scale };
        play.layer.setWorld({
            projection: camera.projectionMatrix.elements,
            view: camera.matrixWorldInverse.elements,
            position: [world.x, world.y, world.z],
            scale: [unit * axes[0], unit * axes[1], unit * axes[2]],
            rotation: [(rot.x + rotate[0]) * r, (rot.y + rotate[1]) * r + play.object.rotation.y, (rot.z + rotate[2]) * r],
            rect, viewWidth: size.x, viewHeight: size.y
        });
        const uniforms = play.quad.material.uniforms;
        uniforms.resolution.value.set(size.x, size.y);
        uniforms.rectMin.value.set(0, 0);
        uniforms.rectSize.value.set(1, 1);
        Reactor3D.EffekseerScene.standQuad(mesh, world, camera);
        // A canvas texture is allocated once, at its first size (three uses
        // immutable storage on WebGL 2): after the window grew, uploads of
        // the bigger canvas failed and the quad kept the last frame,
        // stretched over the screen. Let go of the GL texture when the
        // canvas changes size so the next upload allocates it afresh.
        const source = play.layer.fxCanvas;
        if (play.texWidth !== source.width || play.texHeight !== source.height) {
            play.texWidth = source.width;
            play.texHeight = source.height;
            play.quad.texture.dispose();
        }
        play.quad.texture.needsUpdate = true;
        mesh.visible = !!play.layer.active;
    }

    /**
     * A half-seen copy of the chosen model where a click would place it,
     * following the cursor over the ground. Built once per model and pose,
     * hidden when the cursor is over a prop or off the map.
     */
    updatePlacementGhost(clientX, clientY) {
        const manager = this.propsManager();
        const spec = manager && manager._placementSpec ? manager._placementSpec() : null;
        const mapData = this.currentMap();
        if (!spec || !mapData || !this.mapScene || typeof RREventPreviewModels === 'undefined') { this.hidePlacementGhost(); return; }
        const point = this.groundPointAt(clientX, clientY);
        if (!point) { this.hidePlacementGhost(); return; }
        const key = `${spec.name}|${spec.ext}|${spec.file}|${spec.size}|${spec.scale}|${(spec.stretch || []).join(',')}|${spec.yaw}|${spec.pitch}|${spec.roll}|${manager.fields.direction}`;
        if (this._ghostKey !== key) {
            this.hidePlacementGhost(true);
            this._ghostKey = key;
            const project = this.projectController?.getCurrentProject
                ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
            RREventPreviewModels.templateFor(project, spec, this).then(template => {
                if (!template || this._ghostKey !== key || !this.mapScene) return;
                const ghost = RREventPreviewModels.instance(template, spec, manager.fields.direction);
                ghost.traverse(node => {
                    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                    if (!materials.length) return;
                    const faded = materials.map(material => { const copy = material.clone(); copy.transparent = true; copy.opacity = 0.45; copy.depthWrite = false; return copy; });
                    node.material = Array.isArray(node.material) ? faded : faded[0];
                });
                ghost.userData.__reactorOverlay = true;
                ghost.userData.placementGhost = true;
                this.mapScene.scene().add(ghost);
                this.placementGhost = ghost;
                if (this._ghostPoint) this.placeProp(ghost, { x: this._ghostPoint.x, y: this._ghostPoint.y, z: manager.fields.z || 0 }, mapData);
            }).catch(() => {});
        }
        this._ghostPoint = point;
        if (this.placementGhost) {
            this.placementGhost.visible = true;
            this.placeProp(this.placementGhost, { x: point.x, y: point.y, z: manager.fields.z || 0 }, mapData);
        }
    }

    hidePlacementGhost(dispose) {
        if (!this.placementGhost) { if (dispose) this._ghostKey = null; return; }
        if (dispose) {
            this.placementGhost.parent?.remove(this.placementGhost);
            this.placementGhost.traverse(node => {
                const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                for (const material of materials) material.dispose?.();
            });
            this.placementGhost = null;
            this._ghostKey = null;
        } else {
            this.placementGhost.visible = false;
        }
    }

    disposeEffectPlays(filter) {
        for (const play of this.effectPlays || []) {
            if (filter && !filter(play)) continue;
            if (play.quad) {
                play.quad.mesh.parent?.remove(play.quad.mesh);
                play.quad.mesh.geometry.dispose();
                play.quad.material.dispose();
                play.quad.texture.dispose();
            }
            if (play.layer) play.layer.dispose();
            if (play.plane) {
                try { play.plane.userData.video.pause(); play.plane.userData.video.src = ''; } catch (_) {}
                play.plane.parent?.remove(play.plane);
                play.plane.geometry.dispose();
                play.plane.material.dispose();
                play.plane.userData.texture.dispose();
            }
        }
        this.effectPlays = filter ? (this.effectPlays || []).filter(play => !filter(play)) : [];
    }

    /** Advance every animated model by the frames since the last tick. */
    animateModels(now) {
        this.updateEffectPlays();
        const drivers = (this.animatedModels || []).filter(driver => driver.object.parent);
        this.animatedModels = drivers;
        if (!drivers.length || typeof Reactor3D === 'undefined' || !Reactor3D.applyModelAnimation) return;
        const last = this._lastModelTick || now;
        this._lastModelTick = now;
        this._modelFrame = (this._modelFrame || 0) + Math.min(10, (now - last) / (1000 / 60));
        const frame = Math.floor(this._modelFrame);
        for (const driver of drivers) {
            let action = driver.action;
            if (action) {
                const rule = driver.rules.find(entry => entry.trigger === 'action' && entry.name === action.name);
                const duration = rule ? Reactor3D.modelRuleDuration(rule, driver.clips) : 0;
                if (rule && frame - action.frame >= duration) {
                    action = (action.repeat || rule.repeat) ? Object.assign({}, action, { frame }) : null;
                    driver.action = action;
                }
            }
            Reactor3D.applyModelAnimation(driver.binding, driver.rules, {
                frame, moving: false, dashing: false, distance: 0, scale: 1,
                action: action ? { name: action.name, frame: action.frame } : null
            });
        }
    }

    /** Rebuild only the props, after one was added, moved, turned or removed. */
    /**
     * What a placed instance cannot take in place: its model file, texture,
     * and the animation and effect it runs. Anything else (size, scale,
     * facing, pitch/yaw/roll, lift, position, passability) is a pose.
     */
    static propIdentity(prop) {
        return [prop.name, prop.ext, prop.file, prop.texture, prop.animation, prop.repeat ? 1 : 0, prop.effect].join('|');
    }

    /** Re-pose a placed prop's instance: size and scale, facing and turn, lift and position. */
    poseProp(object, prop, mapData = this.currentMap()) {
        const spec = Reactor3D.normalizeModelSpec ? Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(prop)) : null;
        if (!spec) return false;
        const extent = object.userData.glbSize || { x: 1, y: 1, z: 1 };
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const fit = (spec.size > 0 ? spec.size : 2) / span;
        const uniform = fit * (spec.scale > 0 ? spec.scale : 1);
        const stretch = spec.stretch || [1, 1, 1];
        object.scale.set(uniform * stretch[0], uniform * stretch[1], uniform * stretch[2]);
        if (Reactor3D.applyEventModelPose) Reactor3D.applyEventModelPose(object, spec, prop.direction || 2);
        else object.rotation.y = spec.yaw || 0;
        this.placeProp(object, prop, mapData);
        return true;
    }

    /**
     * Follow prop edits. The edited props are re-posed in place when they
     * still exist with the same model, animation and effect: a slider drag
     * transforms the instance it already has, and its effect plays and
     * animation drivers ride along. Rebuilding on every change made and
     * destroyed a WebGL context per step and paused the effect each time.
     * A new, removed or re-modelled prop rebuilds the set.
     */
    refreshProps(ids) {
        const mapData = this.currentMap();
        if (!mapData || !this.mapScene) return;
        const elevation = window.RRMapElevation;
        if (Array.isArray(ids) && ids.length && this.propGroup && elevation) {
            const props = elevation.props(mapData);
            const work = [];
            for (const id of ids) {
                const prop = props.find(entry => entry.id === id);
                const object = this.propObject(id);
                if (!prop || !object || object.userData.propIdentity !== MapEditor3D.propIdentity(prop)) { work.length = 0; break; }
                work.push([object, prop]);
            }
            if (work.length === ids.length) {
                for (const [object, prop] of work) this.poseProp(object, prop, mapData);
                this.syncPropRings();
                this.refreshPassage();
                return;
            }
        }
        this.buildProps(mapData, this._rebuildGeneration);
    }

    /**
     * Rebuild just the events — cubes, sprites, model previews, routes —
     * from the current data. Editing an event (a new model, a moved tile)
     * used to leave the 3D view showing the old one until a full rebuild.
     */
    refreshEvents() {
        if (!this.enabled || !this.mapScene || this._eventsRefresh) return;
        this._eventsRefresh = requestAnimationFrame(async () => {
            this._eventsRefresh = null;
            const mapData = this.currentMap();
            if (!this.enabled || !this.mapScene || !mapData) return;
            if (!this.eventGroup || !this._eventSnapshot) {
                // Nothing to diff against: build the lot, as a rebuild would.
                this.select(null);
                this.disposeEffectPlays(play => play.object.userData.propId === undefined);
                if (this.animatedModels) this.animatedModels = this.animatedModels.filter(driver => driver.object.userData.propId !== undefined);
                if (this.eventGroup) {
                    for (const child of this.eventGroup.children) {
                        child.traverse(node => {
                            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                            for (const material of materials) material.dispose?.();
                        });
                    }
                    this.eventGroup.parent?.remove(this.eventGroup);
                    this.eventGroup = null;
                }
                await this.buildEvents(mapData);
                this.refreshPassage();
                return;
            }
            // The diff: only what actually changed is torn down and rebuilt.
            // Deleting one event must not blink every model on the map.
            const fresh = new Map();
            for (const event of mapData.events || []) {
                if (event) fresh.set(event.id, this._eventIdentity(event, mapData));
            }
            const affected = new Set();
            for (const [id, identity] of this._eventSnapshot) {
                if (fresh.get(id) !== identity) affected.add(id);
            }
            const added = [];
            for (const [id, identity] of fresh) {
                if (this._eventSnapshot.get(id) !== identity) added.push(id);
            }
            if (!affected.size && !added.length) { this.refreshPassage(); return; }
            if (this.selected && this.selected.userData.event && affected.has(this.selected.userData.event.id)) this.select(null);
            this.disposeEffectPlays(play => play.object.userData.event && affected.has(play.object.userData.event.id));
            if (this.animatedModels) this.animatedModels = this.animatedModels.filter(driver => !(driver.object.userData.event && affected.has(driver.object.userData.event.id)));
            this.animatedEvents = (this.animatedEvents || []).filter(entry => !affected.has(entry.eventId));
            const doomed = new Set();
            for (const child of this.eventGroup.children) {
                const id = child.userData.event ? child.userData.event.id : undefined;
                if (id === undefined || !affected.has(id)) continue;
                doomed.add(child);
                if (child.userData.box) doomed.add(child.userData.box);
                if (child.userData.label) doomed.add(child.userData.label);
            }
            for (const child of doomed) {
                child.traverse(node => {
                    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                    for (const material of materials) material.dispose?.();
                });
                this.eventGroup.remove(child);
            }
            this.pickables = this.pickables.filter(mesh => !doomed.has(mesh));
            this.billboards = this.billboards.filter(mesh => !doomed.has(mesh));
            this.labels = this.labels.filter(mesh => !doomed.has(mesh));
            if (added.length) {
                const sheets = await this.loadCharacterSheets(mapData);
                for (const id of added) {
                    const event = (mapData.events || []).find(entry => entry && entry.id === id);
                    if (event) this._buildOneEvent(event, sheets, mapData, this._rebuildGeneration);
                }
            }
            this._eventSnapshot = fresh;
            this.syncEventArrows();
            this.refreshPassage();
        });
    }

    disposeProps() {
        this.selectPropRings(null);
        this.disposeEffectPlays(play => play.object.userData.propId !== undefined);
        if (this.animatedModels) this.animatedModels = this.animatedModels.filter(driver => !driver.object.userData.propId);
        if (!this.propGroup) return;
        for (const child of this.propGroup.children) {
            child.traverse(node => {
                const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                for (const material of materials) material.dispose?.();
            });
        }
        this.propGroup.parent?.remove(this.propGroup);
        this.propGroup = null;
    }

    propObject(id) {
        return this.propGroup?.children.find(child => child.userData.propId === id) || null;
    }

    /** The prop under the pointer, by id, or null — by bounding box, which is cheap and enough to pick. */
    propAt(clientX, clientY) {
        if (!this.propGroup || !this.propGroup.children.length || !this.camera || !this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        ), this.camera);
        const ray = this._raycaster.ray;
        const point = this._pickPoint || (this._pickPoint = new THREE.Vector3());
        let best = null;
        for (const child of this.propGroup.children) {
            if (child.userData.propId === undefined) continue;
            const box = child.userData.pickBox || (child.userData.pickBox = new THREE.Box3().setFromObject(child));
            if (!ray.intersectBox(box, point)) continue;
            const distance = point.distanceTo(ray.origin);
            if (!best || distance < best.distance) best = { id: child.userData.propId, distance };
        }
        return best ? best.id : null;
    }

    /** Where the pointer meets the map, in tiles (fractional), or null off the map. */
    groundPointAt(clientX, clientY) {
        const mapData = this.currentMap();
        if (!this.mapScene || !this.camera || !this.canvas || !mapData) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        ), this.camera);
        const hits = this._raycaster.intersectObjects(this.mapScene._meshes, false);
        let point = hits.length ? hits[0].point : null;
        if (!point) {
            const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            point = this._raycaster.ray.intersectPlane(ground, new THREE.Vector3());
        }
        if (!point) return null;
        const x = Math.max(0, Math.min(mapData.width - 1, point.x - 0.5));
        const y = Math.max(0, Math.min(mapData.height - 1, point.z - 0.5));
        return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    }

    /** Mark a prop as the selected one and put the pose rings on it. */
    selectProp(id) {
        this.selectedPropId = id || null;
        const object = this.selectedPropId ? this.propObject(this.selectedPropId) : null;
        this.selectPropRings(object);
    }

    selectPropRings(object) {
        if (this.propRings) {
            RRPoseRings3D.dispose(this.propRings);
            this.propRings = null;
        }
        if (this.propArrows) {
            RRAxisArrows3D.dispose(this.propArrows);
            this.propArrows = null;
        }
        this.showPropFootprint(object ? object.userData.propId : null);
        if (!object || typeof RRPoseRings3D === 'undefined' || !this.propGroup) return;
        const prop = this.propsManager()?.prop(object.userData.propId);
        if (!prop) return;
        const radius = Math.max(0.6, prop.size * prop.scale * 0.6 + 0.2);
        this.propRings = RRPoseRings3D.create(THREE, radius, 'prop-rings');
        this.propGroup.add(this.propRings.root);
        if (typeof RRAxisArrows3D !== 'undefined') {
            this.propArrows = RRAxisArrows3D.create(THREE, radius * 1.15, 'prop-arrows');
            this.propGroup.add(this.propArrows.root);
        }
        this.syncPropRings();
    }

    syncPropRings() {
        if (!this.propRings) return;
        const prop = this.propsManager()?.prop(this.selectedPropId);
        const object = this.propObject(this.selectedPropId);
        if (!prop || !object) return;
        const centre = object.position.clone();
        centre.y += prop.size * prop.scale * 0.5;
        // The rings wear the object's REAL rotation — facing turn and mark
        // correction included — so the pitch and roll circles sit on the
        // axes the drag will actually turn. Fed the spec's bare yaw, a prop
        // faced left or right span visibly off its own rings.
        RRPoseRings3D.sync(this.propRings, centre,
            object.rotation.y * 180 / Math.PI, object.rotation.x * 180 / Math.PI, true);
        if (this.propArrows) RRAxisArrows3D.sync(this.propArrows, centre, true);
        this.showPropFootprint(prop.id);
    }

    /**
     * The tiles the selected prop blocks, drawn flat on the ground in red:
     * the game's own rule (`Reactor3D.blockedTilesFor`) on the model's
     * mesh at this size, facing and turn, so a long car shows its long
     * footprint and an edit shows what it did. Nothing for no selection.
     */
    showPropFootprint(id) {
        if (this.propFootprint) {
            this.propFootprint.parent?.remove(this.propFootprint);
            this.propFootprint.geometry?.dispose?.();
            this.propFootprint.material?.dispose?.();
            this.propFootprint = null;
        }
        const prop = id ? this.propsManager()?.prop(id) : null;
        if (!prop || !this.mapScene || typeof RREventPreviewModels === 'undefined' || !Reactor3D.blockedTilesFor) return;
        const spec = Reactor3D.normalizeModelSpec ? Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(prop)) : null;
        if (!spec) return;
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        const generation = (this._footprintGeneration = (this._footprintGeneration || 0) + 1);
        RREventPreviewModels.templateFor(project, spec, this).then(template => {
            if (!template || generation !== this._footprintGeneration || this.selectedPropId !== prop.id) return;
            const tiles = Reactor3D.blockedTilesFor(template, template.userData.reactorSidecar, spec, prop.direction, prop.x, prop.y);
            if (!tiles.length) return;
            const mapData = this.currentMap();
            const positions = new Float32Array(tiles.length * 18);
            let at = 0;
            for (const tile of tiles) {
                const y = (Reactor3D.elevationAt ? Reactor3D.elevationAt(mapData, tile.x, tile.y) : 0) + 0.02;
                const x0 = tile.x + 0.04, x1 = tile.x + 0.96, z0 = tile.y + 0.04, z1 = tile.y + 0.96;
                positions.set([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1], at);
                at += 18;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
                color: 0xff5a5a, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide
            }));
            mesh.renderOrder = 997;
            mesh.userData.__reactorOverlay = true;
            this.mapScene.scene().add(mesh);
            this.propFootprint = mesh;
        }).catch(() => {});
    }

    _propRect() {
        const surface = this.inputSurface || this.canvas;
        const rect = surface?.getBoundingClientRect?.();
        return rect?.width && rect?.height ? rect : null;
    }

    /** A ring under the pointer on the selected prop, as a drag to hold. */
    pickPropRing(clientX, clientY) {
        const prop = this.propsManager()?.prop(this.selectedPropId);
        if (!prop || !this.propRings) return null;
        const grab = RRPoseRings3D.pick(THREE, this.propRings, this.camera, this._propRect(), clientX, clientY,
            { yaw: prop.yaw, pitch: prop.pitch, roll: prop.roll });
        if (grab) RRPoseRings3D.emphasize(this.propRings, grab.axis, true);
        return grab;
    }

    dragPropRing(grab, clientX, clientY) {
        const value = RRPoseRings3D.drag(THREE, grab, this.camera, this._propRect(), clientX, clientY);
        if (value === null) return;
        const manager = this.propsManager();
        const prop = manager?.prop(this.selectedPropId);
        if (!prop || prop[grab.axis] === value) return;
        // Turn the placed instance in place; the sidecar and the flat map catch up on release.
        const object = this.propObject(this.selectedPropId);
        const spec = Reactor3D.normalizeModelSpec(ModelPropsManager.specOf(Object.assign({}, prop, { [grab.axis]: value })));
        if (object && spec && Reactor3D.applyEventModelPose) {
            Reactor3D.applyEventModelPose(object, spec, prop.direction, { preview: true, faceYaw: 0 });
        }
        this._propRingPending = { id: prop.id, axis: grab.axis, value };
        manager.elevation()?.updateProp(manager.currentMap, prop.id, { [grab.axis]: value });
        this.syncPropRings();
        manager._syncCard?.();
    }

    /** Slide the selected prop along one arrow: X and Z over the map (fractional), Y its height. */
    dragPropAlongAxis(state, clientX, clientY) {
        const travel = state.grab.travel(clientX, clientY);
        const manager = this.propsManager();
        const prop = manager?.prop(state.id);
        const object = this.propObject(state.id);
        if (!prop || !object) return;
        const round = n => Math.round(n * 100) / 100;
        const patch = state.grab.axis === 'x' ? { x: Math.max(0, round(state.startX + travel)) }
            : state.grab.axis === 'z' ? { y: Math.max(0, round(state.startY + travel)) }
            : { z: Math.min(RRMapElevation.PROP_MAX_LIFT, Math.max(0, round(state.startZ + travel))) };
        manager.elevation()?.updateProp(manager.currentMap, state.id, patch);
        this.placeProp(object, manager.prop(state.id));
        this.syncPropRings();
        manager._syncCard?.();
        this._propMoved = true;
    }

    dragPropTo(id, point) {
        const manager = this.propsManager();
        const prop = manager?.prop(id);
        const object = this.propObject(id);
        if (!prop || !object || !point) return;
        if (prop.x === point.x && prop.y === point.y) return;
        manager.elevation()?.updateProp(manager.currentMap, id, { x: point.x, y: point.y });
        this.placeProp(object, manager.prop(id));
        this.syncPropRings();
        manager._syncCard?.();
        this._propMoved = true;
    }

    finishPropDrag() {
        if (this.canvas) this.canvas.style.cursor = 'default';
        if (this.propRings) RRPoseRings3D.emphasize(this.propRings, null, false);
        if (this.propArrows && typeof RRAxisArrows3D !== 'undefined') RRAxisArrows3D.emphasize(this.propArrows, null, false);
        const moved = this._propMoved || this._propRingPending;
        this._propMoved = false;
        this._propRingPending = null;
        // The sidecar already holds the new values; the flat map redraws from it.
        if (moved) {
            const manager = this.propsManager();
            manager?.render?.();
            // The card's sliders were built around where the prop USED to
            // stand (a slider spans ±4 tiles of it); a drag that went further
            // pegged them. Rebuilt, they centre on where it is now.
            if (manager) {
                manager._cardFor = null;
                manager._syncCard?.();
            }
            manager?._syncPanel?.();
        }
    }

    /** Advance stepping-animation previews at the game's cadence. */
    animateEventPreviews(now) {
        this.animateModels(now);
        if (!this.animatedEvents?.length) return;
        const last = this._lastPreviewTick || now;
        this._lastPreviewTick = now;
        const frames = Math.min(10, (now - last) / (1000 / 60));
        for (const anim of this.animatedEvents) {
            anim.count += frames;
            if (anim.count < anim.wait) continue;
            anim.count = 0;
            anim.pattern = (anim.pattern + 1) % 4;
            const shown = anim.pattern < 3 ? anim.pattern : 1;
            const ctx = anim.canvas.getContext('2d');
            ctx.clearRect(0, 0, anim.canvas.width, anim.canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(anim.sheet, anim.baseX + shown * anim.frameWidth, anim.baseY,
                anim.frameWidth, anim.frameHeight, 0, 0, anim.canvas.width, anim.canvas.height);
            anim.texture.needsUpdate = true;
        }
    }

    eventSprite(event, sheets, pageImage, animatedPage = null) {
        const image = pageImage || event?.pages?.[0]?.image;
        const sheet = image && image.characterName && sheets[image.characterName];
        if (!sheet || !sheet.width) return null;

        const big = window.RRAssetFiles?.isBigCharacter
            ? window.RRAssetFiles.isBigCharacter(image.characterName)
            : /^[!$]*\$/.test(image.characterName);
        const directionRow = { 2: 0, 4: 1, 6: 2, 8: 3 }[image.direction || 2] || 0;

        let frameWidth, frameHeight, baseX, baseY;
        if (big) {
            frameWidth = sheet.width / 3;
            frameHeight = sheet.height / 4;
            baseX = 0;
            baseY = directionRow * frameHeight;
        } else {
            frameWidth = sheet.width / 12;
            frameHeight = sheet.height / 8;
            baseX = ((image.characterIndex || 0) % 4) * 3 * frameWidth;
            baseY = (Math.floor((image.characterIndex || 0) / 4) * 4 + directionRow) * frameHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(frameWidth));
        canvas.height = Math.max(1, Math.round(frameHeight));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheet,
            baseX + (image.pattern === undefined ? 1 : image.pattern) * frameWidth, baseY,
            frameWidth, frameHeight, 0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

        // A 48px frame is one tile, the same relationship the 2D map uses.
        const height = frameHeight / this.tilePixels();
        const width = frameWidth / this.tilePixels();
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.4 })
        );
        mesh.userData.height = height;
        if (animatedPage) {
            const speed = Number(animatedPage.moveSpeed) || 3;
            this.animatedEvents.push({
                eventId: event.id,
                sheet, canvas, texture, baseX, baseY, frameWidth, frameHeight,
                pattern: Number.isInteger(image.pattern) ? image.pattern : 1, count: 0,
                wait: (9 - Math.min(6, Math.max(1, speed))) * 3
            });
        }
        return mesh;
    }

    /** The event's number and name, as the 2D map labels its squares. */
    eventLabel(event) {
        return this.textLabel(`${String(event.id).padStart(3, '0')}: ${event.name || ''}`.trim());
    }

    /** A camera-facing name plate that holds its size on screen. */
    textLabel(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const font = 'bold 24px sans-serif';
        ctx.font = font;
        canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
        canvas.height = 34;

        const draw = canvas.getContext('2d');
        draw.font = font;
        draw.fillStyle = 'rgba(0, 0, 0, 0.72)';
        draw.fillRect(0, 0, canvas.width, canvas.height);
        draw.fillStyle = '#ffffff';
        draw.textBaseline = 'middle';
        draw.fillText(text, 8, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        // Sized for the reference distance; `updateLabelVisibility` rescales it
        // with the camera so a label holds its size on screen rather than
        // swelling to fill the view as you zoom in.
        const scale = 0.0085;
        const label = new THREE.Mesh(
            new THREE.PlaneGeometry(canvas.width * scale, canvas.height * scale),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false })
        );
        // Drawn after everything else. `depthTest: false` stops a label being
        // rejected by depth, but it cannot stop something drawn *later* from
        // painting over it — and the event boxes are transparent too, so they
        // sort by distance and a nearer box lands on top of a farther label.
        // Which is why a label came out sliced by the box beside it.
        label.renderOrder = 1000;
        return label;
    }

    /**
     * Hide the name labels once the view is wide enough that they collide.
     *
     * A two-hundred-tile map holds hundreds of events; at map-wide zoom their
     * labels overlap into an unreadable band, and the sprites alone read fine.
     */
    updateLabelVisibility() {
        const visible = this.view.distance <= this.LABEL_DISTANCE;
        const scale = this.view.distance / this.LABEL_REFERENCE;
        for (const label of this.labels || []) {
            label.visible = visible;
            label.scale.setScalar(scale);
        }
    }

    /**
     * Turn the sprites and labels to face the camera.
     *
     * Yaw only: a character sprite that pitched with the camera would lie down
     * when you looked from above, and standing upright is what makes 2D sprites
     * read as being in the scene.
     */
    faceCamera() {
        const yaw = -this.view.yaw * Math.PI / 180;
        for (const mesh of this.billboards || []) mesh.rotation.y = yaw;
    }

    /**
     * The event under the cursor, if any.
     *
     * Only the event cubes are tested. The ground and the facades are one
     * merged mesh per sheet, so a hit against them identifies a sheet rather
     * than a tile and is no use for picking.
     */
    eventAt(clientX, clientY) {
        if (!this.pickables || !this.pickables.length || !this.camera || !this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        this._raycaster = this._raycaster || new THREE.Raycaster();
        const point = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        this._raycaster.setFromCamera(point, this.camera);
        const hits = this._raycaster.intersectObjects(this.pickables, false);
        let best = hits.length ? { object: hits[0].object, distance: hits[0].distance } : null;
        // A previewed model IS its event to the hand: clicking the machine
        // selects the machine. Boxes, not triangles — cheap on heavy meshes.
        if (this.eventGroup) {
            const ray = this._raycaster.ray;
            const at = this._pickPoint || (this._pickPoint = new THREE.Vector3());
            for (const child of this.eventGroup.children) {
                if (!child.userData.modelPreview || !child.userData.event || !child.userData.pickBox) continue;
                if (!ray.intersectBox(child.userData.pickBox, at)) continue;
                const distance = at.distanceTo(ray.origin);
                if (!best || distance < best.distance) best = { object: child, distance };
            }
        }
        return best ? best.object : null;
    }

    /**
     * The map tile under the cursor.
     *
     * The ground is one merged mesh per sheet, so a hit cannot name a tile
     * directly — but the world position can, since the map is one unit per
     * tile. That is what lets the 3D view call the same `paintTile` the 2D
     * canvas does rather than growing a second painting path.
     */
    tileAt(clientX, clientY) {
        const mapData = this.currentMap();
        if (!this.mapScene || !this.camera || !this.canvas || !mapData) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        ), this.camera);

        const hits = this._raycaster.intersectObjects(this.mapScene._meshes, false);
        if (!hits.length) return null;
        const point = hits[0].point;
        const x = Math.floor(point.x);
        const y = Math.floor(point.z);
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return null;
        return {
            x,
            y,
            // Where within the tile, in pixels, for the tools that care which
            // quadrant was clicked.
            localX: (point.x - x) * this.tilePixels(),
            localY: (point.z - y) * this.tilePixels()
        };
    }

    /** Mark a mesh as the selected one, or clear the selection with null. */
    select(mesh) {
        if (this.selected && this.selected !== mesh) this.highlight(this.selected, false);
        this.selected = mesh || null;
        if (this.selected) this.highlight(this.selected, true);
        this.syncEventArrows();
        return this.selected ? this.selected.userData.event : null;
    }

    /**
     * Drag arrows on the selected event: X and Z move it a tile at a time
     * (the grid stays the map's truth), Y sets its height, freely.
     */
    syncEventArrows() {
        const mesh = this.selected;
        if (!mesh || !mesh.userData?.event || typeof RRAxisArrows3D === 'undefined' || !this.mapScene) {
            if (this.eventArrows) { RRAxisArrows3D.dispose(this.eventArrows); this.eventArrows = null; }
            this.syncGridLevel();
            return;
        }
        if (!this.eventArrows) {
            this.eventArrows = RRAxisArrows3D.create(THREE, 1.1, 'event-arrows');
            this.mapScene.scene().add(this.eventArrows.root);
        }
        RRAxisArrows3D.sync(this.eventArrows, mesh.position, true);
        this.syncGridLevel();
    }

    /**
     * A second grid at the selection's height, with the column's corners
     * down to the ground: the cube being worked in, seen. Nothing at
     * ground level, where the floor grid already is.
     */
    syncGridLevel() {
        if (this.gridLevel) {
            this.gridLevel.parent?.remove(this.gridLevel);
            this.gridLevel.geometry?.dispose?.();
            this.gridLevel.material?.dispose?.();
            this.gridLevel = null;
        }
        const mapData = this.currentMap();
        if (!mapData || !this.mapScene || !this.gridVisible) return;
        let at = null;
        const mesh = this.selected;
        if (mesh && mesh.userData?.event) {
            const z = Reactor3D.eventZAt ? Reactor3D.eventZAt(mapData, mesh.userData.event.id) : 0;
            if (z > 0.25) at = { x: mesh.userData.event.x, y: mesh.userData.event.y, z };
        }
        if (!at && this.selectedPropId) {
            const prop = this.propsManager()?.prop(this.selectedPropId);
            if (prop && prop.z > 0.25) at = { x: Math.round(prop.x), y: Math.round(prop.y), z: prop.z };
        }
        if (!at) return;
        const ground = Reactor3D.elevationAt(mapData, at.x, at.y);
        const level = ground + at.z + 0.02;
        const points = [];
        const R = 6;
        const x0 = Math.max(0, at.x - R), x1 = Math.min(mapData.width, at.x + R + 1);
        const y0 = Math.max(0, at.y - R), y1 = Math.min(mapData.height, at.y + R + 1);
        for (let x = x0; x <= x1; x++) points.push(x, level, y0, x, level, y1);
        for (let y = y0; y <= y1; y++) points.push(x0, level, y, x1, level, y);
        // The column's corners, level to ground.
        for (const [cx, cy] of [[at.x, at.y], [at.x + 1, at.y], [at.x, at.y + 1], [at.x + 1, at.y + 1]]) {
            points.push(cx, ground, cy, cx, level, cy);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
        this.gridLevel = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
            color: 0xffe08a, transparent: true, opacity: 0.3, depthWrite: false
        }));
        this.gridLevel.userData.__reactorOverlay = true;
        this.mapScene.scene().add(this.gridLevel);
    }

    highlight(mesh, on) {
        // A previewed model's root is a Group: no material of its own, and
        // its scale IS the model's size. Reaching for either crashed the
        // click handler mid-update and took the outlines and labels with it
        // until a restart — the arrows and grid mark its selection instead.
        if (mesh.userData.modelPreview) return;
        const scale = on ? 1.25 : 1;
        mesh.scale.set(scale, scale, scale);
        // The box marks the cell, so it holds its size and brightens instead.
        const box = mesh.userData.box;
        if (box) {
            box.material.opacity = on ? 1 : 0.8;
            box.material.color.setHex(on ? 0xfff2a0 : box.userData.color);
        }
        if (!mesh.material) return;
        if (mesh.material.map) {
            // A character sprite is brightened rather than faded: dimming the
            // unselected ones would make every other event harder to read.
            mesh.material.color.setHex(on ? 0xfff2a0 : 0xffffff);
        } else {
            mesh.material.opacity = on ? 1 : 0.8;
        }
    }

    eventColor(event) {
        const trigger = event.pages?.[0]?.trigger ?? 0;
        switch (trigger) {
            case 1: return 0x4ea3ff;   // player touch
            case 2: return 0x59d98b;   // event touch
            case 3: return 0xffc44d;   // autorun
            case 4: return 0xc98bff;   // parallel
            default: return 0xff6b6b;  // action button
        }
    }

    clearScene() {
        this.projectController?.videoSurfacePreviewManager?.detachThree?.();
        this.animatedModels = [];
        this.disposeEffectPlays();
        this.disposeProps();
        if (this.eventGroup) {
            for (const child of this.eventGroup.children) {
                if (child.userData?.modelPreview) {
                    // A previewed model: instance materials are ours, the
                    // geometry belongs to the shared template.
                    child.traverse(node => {
                        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                        for (const material of materials) material.dispose?.();
                    });
                    continue;
                }
                child.geometry?.dispose?.();
                const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
                for (const material of materials) {
                    material.map?.dispose?.();
                    material.dispose?.();
                }
            }
            this.eventGroup.parent?.remove(this.eventGroup);
            this.eventGroup = null;
        }
        this.billboards = [];
        this.labels = [];
        for (const key of ['grid', 'hoverCell']) {
            const mesh = this[key];
            if (!mesh) continue;
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh.parent?.remove(mesh);
            this[key] = null;
        }
        if (this.mapScene) {
            this.mapScene.destroy();
            this.mapScene = null;
        }
    }

    //-------------------------------------------------------------------------
    // Camera

    /** Point the camera at the middle of the map, far enough back to see it. */
    frameMap(mapData) {
        const x = mapData.width / 2;
        const z = mapData.height / 2;
        this.view.target = { x, y: Reactor3D.elevationAt(mapData, Math.floor(x), Math.floor(z)), z };
        this.view.distance = Math.max(12, Math.max(mapData.width, mapData.height) * 0.9);
        this.applyCamera();
    }

    applyCamera() {
        if (!this.camera) return;
        this.faceCamera();
        this.updateLabelVisibility();
        this.updateZoomReadout();
        Reactor3D.aimCamera(this.camera, this.view.target, {
            yaw: this.view.yaw,
            pitch: this.view.pitch,
            distance: this.view.distance
        });
    }

    attachInput() {
        const input = this.inputSurface || this.canvas;
        if (!input) return;
        this._onPointerDown = event => {
            this._lastActiveAt = performance.now();
            this.pointer = {
                x: event.clientX,
                y: event.clientY,
                // Where the drag began, so a click can be told from an orbit.
                startX: event.clientX,
                startY: event.clientY,
                pan: event.button !== 0 || event.shiftKey,
                paint: false
            };
            input.setPointerCapture?.(event.pointerId);
            // Once per gesture: what is being looked at cannot change until
            // the camera moves, and the raycast is not free.
            this.seatPivot();

            // A left drag paints when the palette has tiles selected, exactly
            // as it does on the 2D canvas, and orbits when it does not. Holding
            // Ctrl orbits regardless, for turning the view without clearing the
            // palette first.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey && this.canPaint()) {
                const tile = this.tileAt(event.clientX, event.clientY);
                if (tile) {
                    this.pointer.paint = true;
                    this.beginPaint();
                    this.paintAt(tile);
                }
            }

            // With the props tab up: a ring turns the selected prop, a prop
            // is picked up and carried freely, and the bare ground takes a
            // new prop. Ctrl still orbits.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey
                && !this.pointer.paint && this.canEditProps()) {
                const manager = this.propsManager();
                const arrow = this.selectedPropId && this.propArrows && typeof RRAxisArrows3D !== 'undefined' && this.canvas
                    ? RRAxisArrows3D.pick(THREE, this.propArrows, this.camera, this.canvas.getBoundingClientRect(), event.clientX, event.clientY)
                    : null;
                const ring = arrow ? null : this.pickPropRing(event.clientX, event.clientY);
                if (arrow) {
                    const prop = manager.prop(this.selectedPropId);
                    manager.pushUndo?.();
                    this.pointer.propArrow = { grab: arrow, id: this.selectedPropId, startX: prop.x, startY: prop.y, startZ: prop.z || 0 };
                    RRAxisArrows3D.emphasize(this.propArrows, arrow.axis, true);
                } else if (ring) {
                    manager.pushUndo?.();
                    this.pointer.propRing = ring;
                } else {
                    const hitId = this.propAt(event.clientX, event.clientY);
                    if (hitId) {
                        manager.select(hitId, { fromThree: true });
                        this.selectProp(hitId);
                        const prop = manager.prop(hitId);
                        const point = this.groundPointAt(event.clientX, event.clientY);
                        manager.pushUndo?.();
                        this.pointer.propDrag = { id: hitId, offsetX: point ? point.x - prop.x : 0, offsetY: point ? point.y - prop.y : 0 };
                        if (this.canvas) this.canvas.style.cursor = 'grabbing';
                    } else {
                        const point = this.groundPointAt(event.clientX, event.clientY);
                        if (point && manager.model) {
                            const id = manager.place(point.x, point.y);
                            if (id) this.pointer.propPlaced = true;
                        } else {
                            manager.select(null, { fromThree: true });
                            this.selectProp(null);
                        }
                    }
                }
                if (this.pointer.propRing || this.pointer.propArrow || this.pointer.propDrag || this.pointer.propPlaced) {
                    this.pointer.pan = false;
                    this.pointer.propHold = true;
                }
            }

            // With the event tool up and no brush in hand, a left drag that
            // starts on an event carries it, exactly as it does on the 2D
            // canvas. Starting anywhere else still orbits.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey
                && !this.pointer.paint && !this.pointer.propHold && this.canDragEvents()) {
                const grab = this.selected && this.eventArrows && typeof RRAxisArrows3D !== 'undefined' && this.canvas
                    ? RRAxisArrows3D.pick(THREE, this.eventArrows, this.camera, this.canvas.getBoundingClientRect(), event.clientX, event.clientY)
                    : null;
                if (grab) {
                    const selected = this.selected.userData.event;
                    this.pointer.eventArrow = { grab, mesh: this.selected,
                        startX: selected.x, startY: selected.y,
                        startZ: Reactor3D.eventZAt ? Reactor3D.eventZAt(this.currentMap(), selected.id) : 0 };
                    RRAxisArrows3D.emphasize(this.eventArrows, grab.axis, true);
                    this.beginEventDrag();
                } else {
                    const mesh = this.eventAt(event.clientX, event.clientY);
                    if (mesh) {
                        this.pointer.drag = mesh;
                        this.beginEventDrag();
                    }
                }
            }
            if (this.pointer.eventArrow) this.pointer.pan = false;
        };
        this._onPointerMove = event => {
            this._lastActiveAt = performance.now();
            if (!this.pointer) {
                // One raycast answers both questions.
                const tile = this.tileAt(event.clientX, event.clientY);
                this.updateHover(event.clientX, event.clientY, tile);
                if (tile) window.reactor?.updateMapCoordinates?.(tile.x, tile.y);
                return;
            }
            const dx = event.clientX - this.pointer.x;
            const dy = event.clientY - this.pointer.y;
            this.pointer.x = event.clientX;
            this.pointer.y = event.clientY;
            if (this.pointer.paint) {
                const tile = this.tileAt(event.clientX, event.clientY);
                if (tile) {
                    this.paintAt(tile);
                    this.updateHoverCell(tile);
                    // Keep the readout live through the stroke: with the height
                    // brush the number in the map bar is the only way to tell
                    // "nothing happened" from "already at that height".
                    window.reactor?.updateMapCoordinates?.(tile.x, tile.y);
                }
            } else if (this.pointer.propArrow) {
                this.dragPropAlongAxis(this.pointer.propArrow, event.clientX, event.clientY);
            } else if (this.pointer.propRing) {
                this.dragPropRing(this.pointer.propRing, event.clientX, event.clientY);
            } else if (this.pointer.propDrag) {
                const point = this.groundPointAt(event.clientX, event.clientY);
                if (point) {
                    this.dragPropTo(this.pointer.propDrag.id, {
                        x: Math.round((point.x - this.pointer.propDrag.offsetX) * 100) / 100,
                        y: Math.round((point.y - this.pointer.propDrag.offsetY) * 100) / 100
                    });
                }
            } else if (this.pointer.propHold) {
                // A placement is a click; the drag that follows moves nothing.
            } else if (this.pointer.eventArrow) {
                this.dragEventAlongAxis(this.pointer.eventArrow, event.clientX, event.clientY);
            } else if (this.pointer.drag) {
                const tile = this.tileAt(event.clientX, event.clientY);
                if (tile) {
                    this.dragEventTo(this.pointer.drag, tile);
                    this.updateHoverCell(tile);
                }
            } else if (this.pointer.pan) {
                this.pan(dx, dy);
            } else {
                this.orbit(dx, dy);
            }
        };
        this._onPointerUp = event => {
            this._lastActiveAt = performance.now();
            if (this.pointer && this.pointer.eventArrow) {
                if (this.eventArrows && typeof RRAxisArrows3D !== 'undefined') RRAxisArrows3D.emphasize(this.eventArrows, null, false);
                this.finishEventDrag();
            }
            const drag = this.pointer;
            this.pointer = null;
            input.releasePointerCapture?.(event.pointerId);
            if (drag && drag.paint) {
                this.endPaint();
                return;
            }
            if (!drag || drag.pan) return;
            if (drag.propHold) {
                this.finishPropDrag();
                return;
            }

            // Orbiting sweeps the pointer across the canvas and must not also
            // select whatever it happens to finish on. A few pixels of travel
            // is a click with a shaky hand.
            const travel = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (drag.drag) {
                this.finishEventDrag();
                // A press that went nowhere is a click on the event, not a
                // move of it, and still selects.
                if (travel <= 4) this.handleClick(event.clientX, event.clientY);
                return;
            }
            if (travel > 4) return;
            this.handleClick(event.clientX, event.clientY);
        };
        this._onDoubleClick = event => {
            const cube = this.canSelectEvents() && this.eventAt(event.clientX, event.clientY);
            if (!cube) {
                // Nothing under the cursor: put the whole map back in view.
                // Getting lost in an orbit camera is easy and there is
                // otherwise no way home.
                const mapData = this.currentMap();
                if (mapData) this.frameMap(mapData);
                return;
            }
            event.preventDefault();
            const picked = this.select(cube);
            if (picked && typeof this.onEventActivated === 'function') {
                this.onEventActivated(picked);
            }
        };
        this._onWheel = event => {
            this._lastActiveAt = performance.now();
            event.preventDefault();
            // The 3D canvas lives inside #canvas-container, which carries
            // TilemapManager's own wheel-zoom handler. Without this the same
            // scroll also zoomed the hidden 2D view, re-cropped its canvas and
            // overwrote the zoom readout with the 2D scale.
            event.stopPropagation();
            this.zoom(event.deltaY);
        };
        this._onContextMenu = event => {
            // The browser menu is never wanted here — right-drag pans — but a
            // right-click otherwise gets the same menu the 2D map gives it,
            // judged by the same four-pixel test as a left-click.
            event.preventDefault();
            const drag = this.pointer;
            if (drag && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) return;
            if (!this.canSelectEvents()) return;

            const cube = this.eventAt(event.clientX, event.clientY);
            if (cube) {
                const picked = this.select(cube);
                if (picked && typeof this.onEventContextMenu === 'function') {
                    this.onEventContextMenu(picked, event.clientX, event.clientY);
                }
                return;
            }

            /*
             * Empty ground is where a *new* event comes from.
             *
             * This used to stop at the cube: a right-click that hit nothing
             * returned, so the only cell you could open a menu on in 3D was one
             * that already had an event on it — and "New Event…" lives on the
             * menu for a cell that does not. Existing events could be edited
             * and none could be created, which reads as the tool half working
             * rather than as a missing case.
             *
             * The cell comes from the same raycast the hover outline uses, so
             * the menu opens on the cell being pointed at rather than on
             * wherever the last click happened to leave the selection.
             */
            const tile = this.tileAt(event.clientX, event.clientY);
            if (!tile) return;
            this.updateHoverCell(tile);
            if (typeof this.onMapContextMenu === 'function') {
                this.onMapContextMenu(tile, event.clientX, event.clientY);
            }
        };
        // The outline is a cursor, so it leaves with the cursor rather than
        // staying behind on the last cell the pointer happened to cross.
        this._onPointerLeave = () => this.updateHoverCell(null);
        this._onResize = () => this.resize();
        // The window is not the only thing that changes the canvas size — the
        // sidebar divider does too, and that fires no resize event. Without
        // this the 3D view stayed stretched until the window itself moved.
        if (typeof ResizeObserver === 'function') {
            this._resizeObserver = new ResizeObserver(() => this.resize());
            const container = this.container();
            if (container) this._resizeObserver.observe(container);
        }

        input.addEventListener('pointerdown', this._onPointerDown);
        input.addEventListener('pointermove', this._onPointerMove);
        input.addEventListener('pointerup', this._onPointerUp);
        input.addEventListener('pointercancel', this._onPointerUp);
        input.addEventListener('pointerleave', this._onPointerLeave);
        input.addEventListener('pointerleave', () => this.hidePlacementGhost());
        input.addEventListener('dblclick', this._onDoubleClick);
        input.addEventListener('wheel', this._onWheel, { passive: false });
        input.addEventListener('contextmenu', this._onContextMenu);
        window.addEventListener('resize', this._onResize);
        this.installFlyKeys();
    }

    detachInput() {
        const input = this.inputSurface || this.canvas;
        if (input) {
            input.removeEventListener('pointerdown', this._onPointerDown);
            input.removeEventListener('pointermove', this._onPointerMove);
            input.removeEventListener('pointerup', this._onPointerUp);
            input.removeEventListener('pointercancel', this._onPointerUp);
            input.removeEventListener('pointerleave', this._onPointerLeave);
            input.removeEventListener('dblclick', this._onDoubleClick);
            input.removeEventListener('wheel', this._onWheel);
            input.removeEventListener('contextmenu', this._onContextMenu);
        }
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        this.removeFlyKeys();
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this.pointer = null;
    }

    //-------------------------------------------------------------------------
    // Painting
    //
    // Every stroke runs through MapEditor: the same `paintTile`, the same undo
    // state, the same autotile and stamp handling. The 3D view only works out
    // which tile the cursor is over — a second painting implementation would
    // drift from the first and would have to be fixed twice.

    mapEditor() {
        return window.reactor?.mapEditor || null;
    }

    /** Whether a left drag should paint rather than orbit. */
    canPaint() {
        const editor = this.mapEditor();
        if (!editor || !this.currentMap()) return false;
        const palette = editor.tilesetPaletteViewer;
        return !!(editor.mapStamp || editor.shadowPenMode
            || (palette && palette.selectedTiles && palette.selectedTiles.length));
    }

    beginPaint() {
        const editor = this.mapEditor();
        if (!editor) return;
        editor.beginEditState();
        editor.lastPaintedTile = { x: -1, y: -1, quadrant: -1 };
    }

    paintAt(tile) {
        const editor = this.mapEditor();
        if (!editor) return;
        // The quadrant-sensitive tools read this rather than taking coordinates,
        // so the raycast hit is handed over in the pixel space they expect.
        editor.lastMousePos = {
            x: tile.x * this.tilePixels() + tile.localX,
            y: tile.y * this.tilePixels() + tile.localY
        };
        editor.paintTile(tile.x, tile.y);
        this._paintDirty = true;
    }

    /**
     * Finish a stroke.
     *
     * `resetDrawingState` commits the undo entry and announces the edit, which
     * is what brings the 3D geometry back in line — the same announcement a
     * stroke on the 2D canvas makes.
     */
    endPaint() {
        const editor = this.mapEditor();
        if (!editor) return;
        editor.resetDrawingState(true);
        if (this._paintDirty) {
            this._paintDirty = false;
            this.projectController?.tilemapManager?.renderMap?.({ preserveScroll: true });
        }
    }

    //-------------------------------------------------------------------------
    // Moving events
    //
    // The event list, the undo state and the 2D sprites all belong to
    // EventManager, so the 3D view asks it to do the work and only decides
    // which cell the cursor is over.

    eventManager() {
        return window.reactor?.eventManager || this.projectController?.eventManager || null;
    }

    /**
     * Whether events can be picked at all.
     *
     * The same rule the 2D canvas keeps: it only lets events be touched in
     * event mode. In 3D they could be clicked while a tileset was selected,
     * which meant a click that looked like it was going to paint selected an
     * event instead.
     */
    canSelectEvents() {
        return !!this.eventManager()?.eventMode;
    }

    /** Whether a left drag on an event should carry it. */
    canDragEvents() {
        return this.canSelectEvents() && !this.canPaint();
    }

    /**
     * Undo is captured on the first cell actually crossed, not here: every
     * click on an event comes through this, and saving up front would push a
     * snapshot of the whole event list each time one was merely selected.
     */
    beginEventDrag() {
        this._eventDragSaved = false;
        this._eventDragMoved = false;
        if (this.canvas) this.canvas.style.cursor = 'grabbing';
    }

    /** Move the grabbed event along one axis: X/Z a tile at a time, Y (height) freely. */
    dragEventAlongAxis(state, clientX, clientY) {
        const travel = state.grab.travel(clientX, clientY);
        const event = state.mesh?.userData?.event;
        const mapData = this.currentMap();
        if (!event || !mapData) return;
        if (state.grab.axis === 'y') {
            const room = Reactor3D.roomFor ? Reactor3D.roomFor(mapData) : null;
            const ceiling = room && room.height > 0 ? room.height : 64;
            const z = Math.round(Math.max(0, Math.min(ceiling, state.startZ + travel)) * 100) / 100;
            if (!this._eventDragSaved) { this._eventDragSaved = true; this.eventManager()?.saveState?.(); }
            if (Reactor3D.setEventZ) Reactor3D.setEventZ(mapData, event.id, z);
            this._eventDragMoved = true;
            this.placeEvent(state.mesh);
            this.syncEventArrows();
            return;
        }
        const tile = state.grab.axis === 'x'
            ? { x: Math.round(state.startX + travel), y: event.y }
            : { x: event.x, y: Math.round(state.startY + travel) };
        if (tile.x !== event.x || tile.y !== event.y) {
            this.dragEventTo(state.mesh, tile);
            this.syncEventArrows();
        }
    }

    dragEventTo(mesh, tile) {
        const mapData = this.currentMap();
        const event = mesh?.userData?.event;
        if (!mapData || !event) return;
        if (tile.x === event.x && tile.y === event.y) return;
        if (tile.x < 0 || tile.y < 0 || tile.x >= mapData.width || tile.y >= mapData.height) return;

        const manager = this.eventManager();
        // Two events cannot share a cell, and the 2D drag refuses the same way.
        const occupant = manager?.getEventAt?.(tile.x, tile.y);
        if (occupant && occupant.id !== event.id) return;

        if (!this._eventDragSaved) {
            this._eventDragSaved = true;
            manager?.resetMapClickTracking?.();
            manager?.saveState?.();
        }
        event.x = tile.x;
        event.y = tile.y;
        this._eventDragMoved = true;
        this.placeEvent(mesh);
        manager?.selectTile?.(tile.x, tile.y);
    }

    /**
     * Drop the event.
     *
     * `renderEvents` redraws the 2D sprites and announces the change, which is
     * what brings the two views back into agreement — the same call the 2D
     * drag makes when it lets go.
     */
    finishEventDrag() {
        if (this.canvas) this.canvas.style.cursor = 'default';
        const moved = this._eventDragMoved;
        this._eventDragSaved = false;
        this._eventDragMoved = false;
        if (moved) this.eventManager()?.renderEvents?.();
    }

    /** Select the event under the pointer, or clear the selection. */
    handleClick(clientX, clientY) {
        if (!this.canSelectEvents()) return;
        const picked = this.select(this.eventAt(clientX, clientY));
        if (typeof this.onEventSelected === 'function') this.onEventSelected(picked);
    }

    /**
     * Follow the cursor: outline the cell it is over, and shape it over events.
     *
     * The tile is passed in when the caller has already raycast for it, so a
     * pointer move costs one cast rather than one per question.
     */
    updateHover(clientX, clientY, tile = this.tileAt(clientX, clientY)) {
        this.updateHoverCell(tile);
        if (!this.canvas) return;
        if (this.canEditProps()) {
            // The prop pick (a box per prop) is throttled to 30 Hz; the
            // ghost is not - it moved at that rate and looked choppy against
            // a view drawing at 60. Its one ground raycast per move is cheap.
            const at = performance.now();
            if (!this._propHoverAt || at - this._propHoverAt >= 33) {
                this._propHoverAt = at;
                this._hoverOverProp = this.propAt(clientX, clientY) !== null;
                this.canvas.style.cursor = this._hoverOverProp ? 'grab' : (this.propsManager()?.model ? 'copy' : 'default');
            }
            if (this._hoverOverProp || !tile) this.hidePlacementGhost();
            else this.updatePlacementGhost(clientX, clientY);
            return;
        }
        this.hidePlacementGhost();
        const over = this.canSelectEvents() && this.eventAt(clientX, clientY);
        this.canvas.style.cursor = over
            ? (this.canDragEvents() ? 'grab' : 'pointer')
            : 'default';
    }

    /**
     * Put the pivot on whatever is in the middle of the view.
     *
     * The camera always looks straight at `view.target`, so the pivot is
     * already at the centre of the screen — but only as a *direction*. How far
     * along it the pivot sits is `view.distance`, and nothing kept that honest.
     * Framing a map sets it to about the map's width; flying then moves the
     * camera without touching it, and turning in place moves the target to
     * match. So after a flight the pivot could be hundreds of tiles past
     * everything on screen, or underneath it — and orbiting swung the whole
     * visible map about a point out in the distance rather than about what
     * was being looked at.
     *
     * Raycasting the centre of the screen answers it properly: the pivot goes
     * on the surface actually being looked at. The camera does not move — the
     * hit lies on its own view ray, so its direction and angles are unchanged
     * and only the distance along that ray is corrected.
     */
    seatPivot() {
        if (!this.camera || !this.mapScene || !this.canvas) return false;
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        const hits = this._raycaster.intersectObjects(this.mapScene._meshes, false);
        let point = hits.length ? hits[0].point : null;
        if (!point) {
            // Looking at the sky, or off the edge of the map. The ground plane
            // still says something, and is better than a stale number.
            const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            point = this._raycaster.ray.intersectPlane(ground, new THREE.Vector3());
        }
        if (!point) return false;

        const distance = this.camera.position.distanceTo(point);
        if (!(distance > 1)) return false;
        this.view.distance = Math.min(400, Math.max(3, distance));
        // `aimCamera` aims at the focus plus half a tile on each ground axis,
        // so the target that puts the pivot on this point is half a tile back.
        this.view.target = { x: point.x - 0.5, y: point.y, z: point.z - 0.5 };
        this.applyCamera();
        return true;
    }

    orbit(dx, dy) {
        this.view.yaw -= dx * 0.4;
        // Clamped short of overhead and of the horizon. Standing art has
        // nothing to show a camera looking straight down at it — the same
        // reason an HD-2D game does not offer the angle — and below ~5 the
        // camera slides under the ground.
        this.view.pitch = Math.min(72, Math.max(5, this.view.pitch - dy * 0.3));
        this.applyCamera();
    }

    pan(dx, dy) {
        // Pan across the ground plane in the direction the camera faces, so
        // dragging right moves the view right however the camera is turned.
        const yaw = this.view.yaw * Math.PI / 180;
        const scale = this.view.distance * 0.0016;
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        this.view.target.x -= (dx * rightX - dy * -rightZ) * scale;
        this.view.target.z -= (dx * rightZ + dy * rightX) * scale;
        this.applyCamera();
    }

    zoom(deltaY) {
        const factor = deltaY > 0 ? 1.1 : 1 / 1.1;
        this.view.distance = Math.min(400, Math.max(3, this.view.distance * factor));
        this.applyCamera();
    }

    //-------------------------------------------------------------------------
    // Flying
    //
    // Orbiting is how you inspect a thing: it holds a point and circles it.
    // Flying is how you inspect a *place* — you go there. On a two-hundred
    // tile map the difference is the whole of it, and building a world you can
    // fly through is a different job from building one you can only orbit.
    //
    // WASD moves, QE rises and falls, Shift hurries. While a movement key is
    // down the bare pointer turns the camera rather than merely hovering, so
    // the two hands work together the way they do in a game.

    /** Keys that mean "move", and which way. */
    static FLY_KEYS() {
        return {
            w: 'forward', s: 'back', a: 'left', d: 'right',
            q: 'down', e: 'up',
            arrowup: 'forward', arrowdown: 'back',
            arrowleft: 'left', arrowright: 'right'
        };
    }

    /** Whether the keyboard is currently asking the camera to move. */
    flying() {
        return !!(this.flyKeys && this.flyKeys.size);
    }

    /**
     * Whether a key event is for us.
     *
     * Not while typing, not while a dialog is up, and not when a modifier is
     * held — Ctrl+S is a save and Ctrl+D is the browser's, and neither should
     * launch the camera across the map.
     */
    acceptsFlyKey(event) {
        if (!this.isEnabled() || event.ctrlKey || event.altKey || event.metaKey) return false;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
            || target.isContentEditable)) return false;
        return !document.querySelector('.modal-overlay, .rr-modal-overlay, #database-modal');
    }

    installFlyKeys() {
        if (typeof window === 'undefined') return;
        this.flyKeys = new Set();
        const directions = MapEditor3D.FLY_KEYS();
        this._onFlyDown = event => {
            this._lastActiveAt = performance.now();
            const way = directions[String(event.key).toLowerCase()];
            if (!way || !this.acceptsFlyKey(event)) return;
            event.preventDefault();
            this.flyKeys.add(way);
            // The clock starts on the first key rather than at the last frame,
            // or the camera lurches by however long the view sat still.
            this._flewAt = null;
            if (this.flyKeys.size === 1) this.seatPivot();
        };
        this._onFlyUp = event => {
            const way = directions[String(event.key).toLowerCase()];
            if (way) this.flyKeys.delete(way);
        };
        this._onFlyShift = event => { this.flyFast = !!event.shiftKey; };
        // A window that loses focus never sees the key come up, and the camera
        // would fly on by itself until the key was pressed and released again.
        this._onFlyBlur = () => { this.flyKeys.clear(); this.flyFast = false; };

        window.addEventListener('keydown', this._onFlyDown);
        window.addEventListener('keyup', this._onFlyUp);
        window.addEventListener('keydown', this._onFlyShift);
        window.addEventListener('keyup', this._onFlyShift);
        window.addEventListener('blur', this._onFlyBlur);
    }

    removeFlyKeys() {
        if (typeof window === 'undefined' || !this._onFlyDown) return;
        window.removeEventListener('keydown', this._onFlyDown);
        window.removeEventListener('keyup', this._onFlyUp);
        window.removeEventListener('keydown', this._onFlyShift);
        window.removeEventListener('keyup', this._onFlyShift);
        window.removeEventListener('blur', this._onFlyBlur);
        this.flyKeys?.clear();
    }

    /**
     * Move the camera for one frame.
     *
     * Timed rather than counted, so the same press covers the same ground on a
     * slow machine as on a fast one. Speed rises with how far back the camera
     * is: a step that reads as a stroll at three tiles' distance is a crawl at
     * two hundred, and the distance is the only thing that says which the
     * author is doing.
     */
    stepFly(now) {
        if (!this.flying() || !this.camera) {
            this._flewAt = null;
            return;
        }
        const last = this._flewAt;
        this._flewAt = now;
        // A frame's worth at most: coming back from a stall must not teleport.
        const seconds = last === null || last === undefined
            ? 0 : Math.min(0.1, (now - last) / 1000);
        if (seconds <= 0) return;

        const speed = Math.max(4, this.view.distance * 0.55) * (this.flyFast ? 3 : 1) * seconds;
        // Taken from the camera rather than from the yaw, so it stays true
        // whatever `aimCamera` decides its angles mean. Flattened onto the
        // ground plane: height belongs to Q and E, and W following the look
        // direction meant a camera that could not hold level flew itself into
        // the ground — or, once it could look up, out of sight of the map.
        const forward = this.camera.getWorldDirection(new THREE.Vector3());
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
        forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);

        const keys = this.flyKeys;
        const move = new THREE.Vector3();
        if (keys.has('forward')) move.add(forward);
        if (keys.has('back')) move.sub(forward);
        if (keys.has('right')) move.add(right);
        if (keys.has('left')) move.sub(right);
        // Diagonals must not be faster than the straight lines they are made
        // of, which is what adding two unit vectors gives.
        if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
        if (keys.has('up')) move.y += speed;
        if (keys.has('down')) move.y -= speed;

        this.view.target.x += move.x;
        this.view.target.y += move.y;
        this.view.target.z += move.z;
        this.applyCamera();
    }

    /**
     * Report the 3D zoom in the map info bar.
     *
     * The bar otherwise keeps showing the 2D scale, which does not move while
     * you are in 3D and reads as the zoom being broken.
     */
    updateZoomReadout() {
        const element = document.getElementById('map-zoom');
        if (!element) return;
        element.textContent = `${Math.round((this.LABEL_REFERENCE / this.view.distance) * 100)}%`;
    }

    //-------------------------------------------------------------------------
    // Loop

    startLoop() {
        if (this.frame !== null) return;
        const tick = now => {
            // Let go of the handle on the way out. `startLoop` refuses to start
            // a second loop by checking this, so a tick that bailed while still
            // holding a stale id meant the loop could never be started again:
            // switching 3D off and on left a canvas that only drew when the
            // pointer moved over it — those handlers render directly — and
            // otherwise showed nothing at all.
            if (!this.enabled) { this.frame = null; return; }
            this.frame = null;
            try {
                this.stepFly(now);
                if (MapEditor3D.shouldRender({ now, active: this.previewActive(now), lastRenderAt: this._lastRenderAt })) {
                    this._lastRenderAt = now;
                    this.render(now);
                }
            } catch (error) {
                this.fail(error);
                return;
            }
            if (this.enabled) this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
    }

    stopLoop() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
    }

    /**
     * Whether an idle view should draw this frame: anything moving keeps the
     * refresh rate, a still view repaints ten times a second. That cadence
     * also carries the water animation (a frame every 500 ms) and any change
     * the activity checks do not know about, within a tenth of a second.
     */
    static shouldRender({ now, active, lastRenderAt, idleInterval = 100 }) {
        if (active) return true;
        if (!(lastRenderAt > 0)) return true;
        return now - lastRenderAt >= idleInterval;
    }

    /** The camera moved, the hover moved, a key or pointer was used in the last second, or a flight is on. */
    previewActive(now) {
        if (this.projectController?.videoSurfacePreviewManager?.previewActive?.()) return true;
        if (this.flying()) return true;
        // A playing effect is a moving picture: the quad takes a new frame
        // of it only when this view renders, so the idle rate would show it
        // at ten frames a second.
        if ((this.effectPlays || []).some(play => play.quad && play.layer && play.layer.active)) return true;
        const camera = this.camera;
        const cameraKey = camera
            ? `${camera.position.x.toFixed(4)}|${camera.position.y.toFixed(4)}|${camera.position.z.toFixed(4)}|`
                + `${camera.quaternion.x.toFixed(5)}|${camera.quaternion.y.toFixed(5)}|${camera.quaternion.z.toFixed(5)}|${camera.quaternion.w.toFixed(5)}`
            : '';
        const hover = this.hoverCell;
        const hoverKey = hover ? `${hover.visible}|${hover.position.x}|${hover.position.y}|${hover.position.z}` : '';
        const key = cameraKey + '#' + hoverKey;
        if (key !== this._activityKey) {
            this._activityKey = key;
            this._lastActiveAt = now;
        }
        return Number.isFinite(this._lastActiveAt) && now - this._lastActiveAt < 1000;
    }

    render(now) {
        if (!this.renderer || !this.camera || !this.mapScene) return;
        this.animateAutotiles(now);
        this.animateEventPreviews(now);
        this.projectController?.videoSurfacePreviewManager?.updateThree?.();
        const scene = this.mapScene.scene();
        const background = scene.background;
        const autoClear = this.renderer.autoClear;
        const eventVisible = this.eventGroup ? this.eventGroup.visible : null;
        const gridVisible = this.grid ? this.grid.visible : null;
        const hoverVisible = this.hoverCell ? this.hoverCell.visible : null;
        try {
            // Match the tilemap's two canvases. Lower geometry and events share
            // real 3D depth; starred geometry starts with a fresh depth buffer
            // and therefore overlays them, as the 2D upper tile layer does.
            //
            // Not on a map with models: there everything is a thing standing
            // somewhere, and a star tile or an above-characters screen behind
            // a tower belongs behind it. The game draws such a map under one
            // depth buffer (the "world" pass), and so does this view.
            const mapData = this.currentMap();
            const modelsInWorld = !!(mapData && Reactor3D._hasEventModelsNow && Reactor3D._hasEventModelsNow(mapData));
            this.mapScene.modelsInWorld = modelsInWorld;
            if (modelsInWorld) {
                this.mapScene.setPass('world');
                this.renderer.autoClear = true;
                this.renderer.render(scene, this.camera);
                return;
            }
            this.mapScene.setPass('below');
            this.renderer.autoClear = true;
            this.renderer.render(scene, this.camera);

            // The above-characters overlay (layer >= 5 video surfaces) is the
            // game's third slot: composited over star tiles and world alike,
            // so it gets its own pass and stays out of the star-tile one.
            const overlay = this.mapScene._aboveBillboardsGroup;
            const overlayVisible = overlay ? overlay.visible : null;
            const hideEditorLayers = () => {
                if (this.eventGroup) this.eventGroup.visible = false;
                if (this.grid) this.grid.visible = false;
                if (this.hoverCell) this.hoverCell.visible = false;
            };
            if (this.mapScene.hasAbove()) {
                hideEditorLayers();
                scene.background = null;
                this.renderer.autoClear = false;
                this.renderer.clearDepth();
                this.mapScene.setPass('above');
                if (overlay) overlay.visible = false;
                this.renderer.render(scene, this.camera);
            }
            if (overlay && overlay.children.length) {
                hideEditorLayers();
                scene.background = null;
                this.renderer.autoClear = false;
                this.renderer.clearDepth();
                this.mapScene.setPass('overlay');
                overlay.visible = true;
                this.renderer.render(scene, this.camera);
            }
            if (overlay && overlayVisible !== null) overlay.visible = overlayVisible;
        } finally {
            scene.background = background;
            this.renderer.autoClear = autoClear;
            if (this.eventGroup && eventVisible !== null) this.eventGroup.visible = eventVisible;
            if (this.grid && gridVisible !== null) this.grid.visible = gridVisible;
            if (this.hoverCell && hoverVisible !== null) this.hoverCell.visible = hoverVisible;
            this.mapScene.setPass('all');
        }
    }

    /**
     * Advance the A1 water and waterfalls.
     *
     * Same cadence as the game — a frame every 30 ticks at 60fps — and the same
     * A1 checkbox that governs the 2D canvas governs this, so the two views
     * agree about whether water is moving. Sliding UVs, so an animated frame
     * costs nothing like a rebuild.
     */
    animateAutotiles(now) {
        if (typeof this.mapScene.setAnimationFrame !== 'function') return;
        const enabled = window.reactor?.optionsManager?.getAnimateAutotiles?.() !== false;
        if (!enabled) {
            this._animationStartedAt = null;
            this.mapScene.setAnimationFrame(0);
            return;
        }
        const timestamp = Number.isFinite(now) ? now : performance.now();
        if (!Number.isFinite(this._animationStartedAt)) this._animationStartedAt = timestamp;
        // requestAnimationFrame follows the monitor refresh rate, not a fixed
        // 60Hz clock. Time-based steps keep A1 at RPG Maker's two frames per
        // second on 60/120/144Hz displays and after performance changes.
        this.mapScene.setAnimationFrame(Math.floor((timestamp - this._animationStartedAt) / 500));
    }
}

/** The facing System.json gives the player start, down when it says nothing. */
MapEditor3D.startDirection = function(system) {
    const asked = Number(system && system.startDirection);
    return [2, 4, 6, 8].indexOf(asked) >= 0 ? asked : 2;
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapEditor3D;
}

// A default on the prototype, so an instance built without the constructor —
// which the viewport tests do, to avoid three.js and the DOM — still measures
// in whole tiles rather than in undefined.
MapEditor3D.prototype.tileSize = 48;
