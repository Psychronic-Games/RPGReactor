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
        if (typeof window !== 'undefined' && window.THREE && window.Reactor3D) {
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
        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.mode === 'web' && host.projectRoot && typeof host.assetUrl === 'function') {
            const files = [
                this.path.join(host.projectRoot, 'js', 'libs', 'three.js'),
                this.path.join(host.projectRoot, 'js', 'reactor_3d.js')
            ];
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

        const files = [
            this.path.join(runtimePath, 'libs', 'three.js'),
            this.path.join(runtimePath, 'reactor_3d.js')
        ];
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
        this.librariesLoaded = !!(window.THREE && window.Reactor3D);
        if (!this.librariesLoaded) this.lastError = 'three.js did not define THREE.';
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

        // An event's note decides how it stands — see `buildEvents` — so a note
        // edited in the event window has to reach here. Same throttle: editing
        // events can announce several times in a row.
        this._onEventsChanged = this._onMapEdited;
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
        if (!this.rebuildIsCurrent(request, renderer)) return false;
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

        const layers = Reactor3D.parallaxGroundLayers(mapData);
        if (!layers.length) return {};

        if (!this.parallaxImages) this.parallaxImages = {};
        const directory = this.path.join(projectPath, 'img', 'parallaxes');
        const loaded = {};
        const pending = [];

        for (const layer of layers) {
            const name = layer.name;
            if (loaded[name]) continue;
            const cached = this.parallaxImages[name];
            if (cached) {
                loaded[name] = cached;
                continue;
            }
            const filePath = this.path.join(directory, `${name}.png`);
            if (this.fs && !this.fs.existsSync(filePath)) continue;

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
                image.src = this.assetUrl(filePath);
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
        this.selected = null;
        const cube = new THREE.BoxGeometry(0.55, 0.55, 0.55);

        for (const event of mapData.events || []) {
            if (!event) continue;
            const elevation = Reactor3D.elevationAt(mapData, event.x, event.y);
            const sprite = this.eventSprite(event, sheets);
            const mesh = sprite || new THREE.Mesh(cube, new THREE.MeshBasicMaterial({
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

        scene.add(this.eventGroup);
        this.faceCamera();
        return true;
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
        const elevation = facade
            ? facade.height + facade.lift
            : Reactor3D.elevationAt(mapData, event.x, event.y);
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
        }

        this.characterImages = this.characterImages || {};
        const directory = this.path.join(projectPath, 'img', 'characters');
        await Promise.all([...names].map(name => new Promise(resolve => {
            if (this.characterImages[name] !== undefined) return resolve();
            const file = this.path.join(directory, name.endsWith('.png') ? name : `${name}.png`);
            if (this.fs && !this.fs.existsSync(file)) {
                this.characterImages[name] = null;
                return resolve();
            }
            const image = new Image();
            image.onload = () => { this.characterImages[name] = image; resolve(); };
            // A missing sheet leaves that event as a plain cube rather than
            // failing the whole scene.
            image.onerror = () => { this.characterImages[name] = null; resolve(); };
            image.src = this.assetUrl(file);
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
    eventSprite(event, sheets) {
        const image = event?.pages?.[0]?.image;
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
        return mesh;
    }

    /** The event's number and name, as the 2D map labels its squares. */
    eventLabel(event) {
        const text = `${String(event.id).padStart(3, '0')}: ${event.name || ''}`.trim();
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
        return hits.length ? hits[0].object : null;
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
        return this.selected ? this.selected.userData.event : null;
    }

    highlight(mesh, on) {
        const scale = on ? 1.25 : 1;
        mesh.scale.set(scale, scale, scale);
        // The box marks the cell, so it holds its size and brightens instead.
        const box = mesh.userData.box;
        if (box) {
            box.material.opacity = on ? 1 : 0.8;
            box.material.color.setHex(on ? 0xfff2a0 : box.userData.color);
        }
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
        if (this.eventGroup) {
            for (const child of this.eventGroup.children) {
                child.geometry.dispose();
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
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

            // With the event tool up and no brush in hand, a left drag that
            // starts on an event carries it, exactly as it does on the 2D
            // canvas. Starting anywhere else still orbits.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey
                && !this.pointer.paint && this.canDragEvents()) {
                const mesh = this.eventAt(event.clientX, event.clientY);
                if (mesh) {
                    this.pointer.drag = mesh;
                    this.beginEventDrag();
                }
            }
        };
        this._onPointerMove = event => {
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
            const drag = this.pointer;
            this.pointer = null;
            input.releasePointerCapture?.(event.pointerId);
            if (drag && drag.paint) {
                this.endPaint();
                return;
            }
            if (!drag || drag.pan) return;

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
                this.render(now);
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

    render(now) {
        if (!this.renderer || !this.camera || !this.mapScene) return;
        this.animateAutotiles(now);
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
            this.mapScene.setPass('below');
            this.renderer.autoClear = true;
            this.renderer.render(scene, this.camera);

            if (this.mapScene.hasAbove()) {
                if (this.eventGroup) this.eventGroup.visible = false;
                if (this.grid) this.grid.visible = false;
                if (this.hoverCell) this.hoverCell.visible = false;
                scene.background = null;
                this.renderer.autoClear = false;
                this.renderer.clearDepth();
                this.mapScene.setPass('above');
                this.renderer.render(scene, this.camera);
            }
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapEditor3D;
}

// A default on the prototype, so an instance built without the constructor —
// which the viewport tests do, to avoid three.js and the DOM — still measures
// in whole tiles rather than in undefined.
MapEditor3D.prototype.tileSize = 48;
