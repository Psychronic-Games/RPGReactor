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
    /** After a different map is built, how long before the models only the last one used are given back. */
    static MODEL_SWEEP_DELAY_MS = 3000;
    /**
     * Off: a model let go on a map change is read again when a map that uses it comes back, and
     * the copy read before is still held by the view (72 MB more per North Haven round trip,
     * measured). Until that holder is found, models stay loaded for the project.
     */
    static SWEEP_MODELS_ON_MAP_CHANGE = false;

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
        if (typeof window !== 'undefined' && window.pako && window.THREE && window.Reactor3D?.extensionsLoaded?.()) {
            this.librariesLoaded = true;
            this.configureWorkers();
            return true;
        }

        if (this._librariesPromise) return this._librariesPromise;
        this._librariesPromise = this.loadLibraries();
        const loaded = await this._librariesPromise;
        if (!loaded) this._librariesPromise = null;
        return loaded;
    }

    /**
     * The runtime scripts the 3D view still needs, as paths under the
     * project's js/. Asked twice: the core names its extension files
     * (Reactor3D.EXTENSIONS), so the list past the core is known only once
     * the core is in.
     */
    missingRuntimeScripts() {
        const w = typeof window === 'undefined' ? {} : window;
        const files = [];
        if (!w.pako) files.push('libs/pako.min.js');
        if (!w.THREE) files.push('libs/three.js');
        if (!w.Reactor3D) {
            files.push('reactor_3d.js');
            return files;
        }
        for (const extension of w.Reactor3D.EXTENSIONS || []) {
            if (!w.Reactor3D[extension.namespace]) files.push(extension.file);
        }
        return files;
    }

    async loadLibraries() {
        const host = typeof window !== 'undefined' ? window.RPGReactorWebHost : null;
        let load;
        if (host?.mode === 'web' && host.projectRoot && typeof host.assetUrl === 'function') {
            const root = String(host.projectRoot).replace(/\/+$/, '');
            load = async file => {
                const url = `${root}/js/${file}`;
                await this.injectScriptUrl(host.assetUrl(url), url);
            };
        } else {
            const runtimePath = this.projectController?.projectManager?.getRuntimePath?.();
            if (!runtimePath || !this.fs || !this.path) {
                this.lastError = this._t('The runtime directory could not be found.');
                return false;
            }
            load = async file => {
                const full = this.path.join(runtimePath, ...file.split('/'));
                if (!this.fs.existsSync(full)) throw new Error(`Missing ${full}`);
                await this.injectScript(this.fs.readFileSync(full, 'utf8'), full);
            };
        }

        try {
            // Two passes: up to the core, then whatever the core names.
            for (let pass = 0; pass < 2; pass++) {
                for (const file of this.missingRuntimeScripts()) await load(file);
            }
        } catch (error) {
            this.lastError = error.message;
            return false;
        }

        return this.finishLibraryLoad();
    }

    finishLibraryLoad() {
        const runtime = window.Reactor3D;
        this.librariesLoaded = !!(window.pako && window.THREE && runtime)
            && (runtime.EXTENSIONS || []).every(extension => runtime[extension.namespace]);
        if (!this.librariesLoaded) this.lastError = this._t('A 3D runtime dependency did not load.');
        if (this.librariesLoaded) this.configureWorkers();
        return this.librariesLoaded;
    }

    /** Workers need same-origin URLs too; the runtime is loaded from Blob scripts. */
    configureWorkers() {
        const runtime = window.Reactor3D;
        if (!runtime) return;
        runtime.renderScene ||= (renderer, scene, camera) => renderer.render(scene, camera);
        if (runtime.resolveWorkerUrl || !this.fs || !this.path) return;
        const host = window.RPGReactorWebHost;
        const runtimePath = host?.mode === 'web' && host.projectRoot
            ? this.path.join(host.projectRoot, 'js') : this.projectController?.projectManager?.getRuntimePath?.();
        if (!runtimePath || !this.fs || !this.path) return;
        const urls = new Map();
        const sourceUrl = name => {
            if (urls.has(name)) return urls.get(name);
            if (!['reactor_geometry_worker.js', 'reactor_effect_measure_worker.js', 'meshopt_simplifier.js'].includes(name)) throw new Error('Unknown renderer worker');
            let source = this.fs.readFileSync(this.path.join(runtimePath, 'libs', name), 'utf8');
            if (name === 'reactor_geometry_worker.js') source = source.replace("'./meshopt_simplifier.js'", JSON.stringify(sourceUrl('meshopt_simplifier.js')));
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            urls.set(name, url);
            return url;
        };
        // One small module URL per app lifetime, shared across project switches.
        runtime.resolveWorkerUrl = sourceUrl;
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
            this.projectController?.modelPropsManager?.preview2D?.suspend();
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
        // Shown in the status bar as it stands: the view's own reasons in the editor's language.
        this.lastError = this._t(error?.message || String(error || '3D view unavailable'));
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
        this._onMapEdited = event => {
            // The terrain brush says what it moved; the vertices are already
            // there and are lifted in place. A scene built before the map
            // had a terrain grid has no such vertices and rebuilds once.
            if (event?.detail?.terrain && this.updateTerrainInPlace(event.detail.region)) return;
            // Pieces are laid down again on their own; the rest of the scene stays.
            if (event?.detail?.pieces && this.updatePiecesInPlace(event.detail.region || null)) return;
            if (event?.detail?.water && this.updateWaterInPlace()) return;
            // Foliage grows again in the chunks the brush touched; the rest of the scene stays.
            if (event?.detail?.foliage && this.updateFoliageInPlace(event.detail.region || null)) return;
            // Ground paint is written into the floor's own textures; new types build the scene again.
            if (event?.detail?.ground && !event.detail.types && this.updateGroundInPlace(event.detail.region || null)) return;
            // The land past the border is laid again on its own, and the steep ground changes on the floor as it stands.
            if (event?.detail?.surround && this.updateSurroundInPlace()) return;
            if (event?.detail?.cliff && this.updateCliffInPlace()) return;
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

    /**
     * Brings an event into view: the view's target moves to where the event
     * stands and, where a tile there is smaller on the screen than a working
     * size, the view comes in until it is that size. The angle the author
     * looks from is kept, and so is a view already closer, unless something
     * stands between the eye and the event or the eye would be under water:
     * then the view looks from where the event is seen (`sightOf`). False
     * when this map has no such event or the view is not up.
     */
    frameEvent(eventId) {
        const mapData = this.currentMap();
        const event = mapData ? (mapData.events || []).find(entry => entry && entry.id === Number(eventId)) : null;
        if (!event || !this.camera || !this.view) return false;
        const [offsetX, offsetZ] = typeof RRMapElevation !== 'undefined' && RRMapElevation.eventMarkerOffset
            ? RRMapElevation.eventMarkerOffset(mapData, event.id) : [0, 0];
        // The target names a tile and the camera looks at the middle of it (Reactor3D.aimCamera): the event's own tile, or where its marker stands on a wider footprint.
        this.view.target = { x: event.x + offsetX, y: MapEditor3D.eventFeet(mapData, event), z: event.y + offsetZ };
        const rect = this.canvas && this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
        const reach = MapEditor3D.distanceForTile(rect ? rect.height : 0, this.camera.fov, MapEditor3D.FRAME_TILE_PIXELS);
        if (reach > 0 && this.view.distance > reach) this.view.distance = Math.max(MapEditor3D.NEAREST_VIEW, reach);
        const sight = this.sightOf(event, mapData);
        if (sight) Object.assign(this.view, sight);
        this.applyCamera();
        return true;
    }

    /** The size a tile is brought to on the screen when an event is brought into view, in pixels. */
    static get FRAME_TILE_PIXELS() { return 48; }

    // The nearest the view stands to what it looks at, in tiles.
    static get NEAREST_VIEW() { return 3; }
    // How far over an event's feet the point lies that has to be seen, in tiles.
    static get SIGHT_RISE() { return 0.8; }
    // How near the eye and the point seen something may be without standing between them, and how far past what covered the event the eye is brought, in tiles.
    static get SIGHT_CLEAR() { return 0.3; }
    // How many times the eye is brought in past something that covers the event.
    static get SIGHT_STEPS() { return 6; }
    // The least pitch a view is given when it is turned to another side, in degrees.
    static get SIGHT_LOWEST() { return 20; }
    /**
     * The angles a view is turned to, in order, when the event is covered
     * from where it looks: `[turn, steep]`, degrees added to the yaw and
     * the least pitch (0: the author's own). The author's angle first, then
     * steeper from the same side, then from behind and from either side.
     */
    static get SIGHT_TURNS() { return [[0, 0], [0, 55], [0, 75], [180, 0], [90, 0], [-90, 0], [180, 55], [90, 55], [-90, 55]]; }

    /** Where the eye stands when a view looks at `target` from `yaw` and `pitch` (degrees) at `distance`, as `Reactor3D.aimCamera` places it; written into `out`. */
    static eyeAt(target, yaw, pitch, distance, out) {
        const turn = yaw * Math.PI / 180, tilt = pitch * Math.PI / 180;
        return out.set(target.x + 0.5 - Math.sin(turn) * Math.cos(tilt) * distance, (target.y || 0) + Math.sin(tilt) * distance, target.z + 0.5 + Math.cos(turn) * Math.cos(tilt) * distance);
    }

    /**
     * The view of an event that sees it, for the target and distance the
     * view has: `{ yaw, pitch, distance }`, or null where there is none
     * (the eye under water from every angle). The author's own angle where nothing stands between
     * the eye and the event; else the first of a few other angles from
     * which it is seen (`SIGHT_TURNS`); else the first of them from as near
     * as what covers the event allows (under a roof, inside a room). An eye
     * under water sees nothing: such an angle is passed over.
     */
    sightOf(event, mapData) {
        if (!this.view || typeof THREE === 'undefined') return null;
        const view = this.view, target = view.target;
        const point = (this._sightPoint || (this._sightPoint = new THREE.Vector3())).set(target.x + 0.5, (target.y || 0) + MapEditor3D.SIGHT_RISE, target.z + 0.5);
        const eye = this._sightEye || (this._sightEye = new THREE.Vector3());
        let dry = null;
        const tried = [];
        for (const [turn, steep] of MapEditor3D.SIGHT_TURNS) {
            const yaw = view.yaw + turn, pitch = steep ? Math.max(view.pitch, steep) : turn ? Math.max(view.pitch, MapEditor3D.SIGHT_LOWEST) : view.pitch;
            // A view already as steep as the angle asked for was tried as itself.
            const key = yaw + ':' + pitch;
            if (tried.includes(key)) continue;
            tried.push(key);
            MapEditor3D.eyeAt(target, yaw, pitch, view.distance, eye);
            if (MapEditor3D.underWater(mapData, eye)) continue;
            if (!dry) dry = { yaw, pitch, distance: view.distance };
            if (this.sightBlocked(eye, point, event) === null) return { yaw, pitch, distance: view.distance };
        }
        if (!dry) return null;
        // Covered from every side: in past what covers it, as far as the nearest the view stands.
        let distance = dry.distance;
        for (let step = 0; step < MapEditor3D.SIGHT_STEPS; step++) {
            MapEditor3D.eyeAt(target, dry.yaw, dry.pitch, distance, eye);
            const covered = this.sightBlocked(eye, point, event);
            if (covered === null) return MapEditor3D.underWater(mapData, eye) ? dry : { yaw: dry.yaw, pitch: dry.pitch, distance };
            if (distance <= MapEditor3D.NEAREST_VIEW) break;
            distance = Math.max(MapEditor3D.NEAREST_VIEW, distance - covered - MapEditor3D.SIGHT_CLEAR);
        }
        return dry;
    }

    /** Whether a point of the map lies under the water's surface there. */
    static underWater(mapData, point) {
        if (!mapData || !Reactor3D.waterSurfaceAt) return false;
        const level = Reactor3D.waterSurfaceAt(mapData, point.x, point.z);
        return level !== null && Number.isFinite(level) && point.y < level + MapEditor3D.SIGHT_CLEAR;
    }

    /**
     * What stands between an eye and a point it looks at: how far from the
     * eye the first of it is met, or null when the way is free. The map's
     * laid meshes (ground, walls, roofs, rocks), the placed models and the
     * other events' models are asked, each from the side the eye sees it
     * from; grass and water are looked through. `event` is the event looked
     * at: its own model does not cover it.
     */
    sightBlocked(eye, point, event) {
        const raycaster = this._raycaster || (this._raycaster = new THREE.Raycaster());
        const ray = raycaster.ray;
        ray.origin.copy(eye);
        ray.direction.copy(point).sub(eye);
        const reach = ray.direction.length() - MapEditor3D.SIGHT_CLEAR;
        if (!(reach > 0)) return null;
        ray.direction.normalize();
        const laid = this.raycastMapMeshes();
        let nearest = laid && laid.distance < reach ? laid.distance : Infinity;
        const far = raycaster.far, at = this._pickPoint || (this._pickPoint = new THREE.Vector3());
        try {
            for (const group of [this.propGroup, this.eventGroup]) {
                for (const child of group ? group.children : []) {
                    const own = child.userData;
                    if (!own || (own.propId === undefined && !own.modelPreview)) continue;
                    if (event && own.event && own.event.id === event.id) continue;
                    const box = own.pickBox || (own.pickBox = new THREE.Box3().setFromObject(child));
                    const limit = Math.min(reach, nearest);
                    // Boxes first: a model's own triangles are asked only where the ray crosses its box before anything nearer.
                    if (!box.containsPoint(eye) && (!ray.intersectBox(box, at) || at.distanceTo(eye) >= limit)) continue;
                    raycaster.far = limit;
                    const hit = raycaster.intersectObject(child, true).find(found => !(found.object.userData && found.object.userData.__reactorOverlay));
                    if (hit && hit.distance < nearest) nearest = hit.distance;
                }
            }
        } finally {
            raycaster.far = far;
        }
        return Number.isFinite(nearest) ? nearest : null;
    }

    /** How far a camera of vertical field `fov` (degrees) stands from a place for one tile there to be `pixels` across on a view `viewHeight` pixels tall; 0 when that cannot be said. */
    static distanceForTile(viewHeight, fov, pixels) {
        if (!(viewHeight > 0) || !(pixels > 0) || !(fov > 0) || !(fov < 180)) return 0;
        return viewHeight / (2 * pixels * Math.tan(fov * Math.PI / 360));
    }

    /** The height an event's feet stand at: the ground under the middle of its tile, the terrain's rise and fall with it, plus the event's own height. */
    static eventFeet(mapData, event) {
        const ground = Reactor3D.groundHeightAt
            ? Reactor3D.groundHeightAt(mapData, event.x + 0.5, event.y + 0.5)
            : Reactor3D.elevationAt(mapData, event.x, event.y);
        return (Number(ground) || 0) + (Reactor3D.eventZAt ? Number(Reactor3D.eventZAt(mapData, event.id)) || 0 : 0);
    }

    /**
     * A camera made since the view was last aimed looks where the view was
     * left: the view switched off and on again (another map shown in 2D,
     * then this one again) comes back as the author left it. True when it
     * aimed one.
     */
    aimNewCamera() {
        if (!this.camera || this._aimedCamera === this.camera) return false;
        this._aimedCamera = this.camera;
        this.applyCamera();
        return true;
    }

    teardown() {
        this.enabled = false;
        this._rebuildGeneration++;
        // The terrain brushes paint only in this view, and hold 2D editing off while they are in hand.
        const reactor = typeof window !== 'undefined' ? window.reactor : null;
        if (reactor?.terrainManager?.active) {
            if (typeof reactor.claimMapTool === 'function') reactor.claimMapTool('paint');
            else reactor.terrainManager.deactivate?.();
        }
        this.projectController?.eventModelPanel?.hide?.();
        if (typeof Reactor3D !== 'undefined' && Reactor3D.Shadows && Reactor3D.Shadows.focus) Reactor3D.Shadows.focus = null;
        this.stopLoop();
        this.stopListeningForEdits();
        this.detachInput();
        try { this.clearScene(); } catch (error) {
            console.error('Could not completely clear the 3D scene:', error);
        }
        // The maps past the border were kept for the next scene: there is none.
        try { globalThis.RRMapNeighborView?.dispose(this); } catch (error) {
            console.error('Could not clear the neighboring maps:', error);
        }
        const sharedPixiRenderer = this._sharedPixiRenderer;
        if (this.renderer) {
            const renderer = this.renderer;
            this.renderer = null;
            // While the renderer can still free them: a renderer's own dispose leaves every
            // graphics-card copy it was not told about, and on the context shared with the 2D
            // view nothing else ever frees those.
            try { this.lastTeardown = this.releaseGraphics(renderer); } catch (error) {
                console.error('Could not release the 3D view\'s models:', error);
            }
            const release = typeof RRModelRelease !== 'undefined' ? RRModelRelease : null;
            // Its own context goes back to the browser; the shared one is the 2D view's.
            if (release && this._ownCanvas) release.dropRenderer(renderer);
            else {
                release?.untrack(renderer);
                try { renderer.dispose(); } catch (_) {}
            }
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
        this.projectController?.mediaSurfacePreviewManager?.refreshBackend?.();
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
            if (typeof RRModelRelease !== 'undefined') RRModelRelease.track(this.renderer, 'map-3d');
            this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.reportGpuTier();
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
        if (typeof RRModelRelease !== 'undefined') RRModelRelease.track(this.renderer, 'map-3d');
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.reportGpuTier();
        this.camera = Reactor3D.createCamera({ fov: 40 });
        this.resize();
        this.attachInput();
        return true;
    }

    /**
     * Tell the 3D runtime what it is drawing on.
     *
     * The game reads the renderer's name once at boot and settles its costs
     * against it — shadow slots and resolution, the effect budget, how often
     * an effect's reach is re-measured. This viewport loads `reactor_3d.js`
     * without `reactor_core.js`, so there is no `Graphics` here and every one
     * of those choices would take the full-power branch: four shadow slots at
     * 512 with five taps in the editor on the same laptop the game had just
     * been tuned down to two at 256. Same reader, same classifier, so the two
     * cannot disagree; an unreadable renderer leaves the override unset and
     * the runtime keeps its sharp-first default.
     */
    reportGpuTier() {
        try {
            if (typeof Reactor3D === 'undefined' || !Reactor3D.classifyGpu) return;
            const gl = this.renderer?.getContext?.();
            const description = Reactor3D.rendererDescription(gl);
            const tier = Reactor3D.classifyGpu(description);
            if (tier === 'unknown') return;
            Reactor3D.gpuTierOverride = tier;
            Reactor3D.gpuDescription = description;
            // Costs already settled against the old answer are re-derived.
            if (Reactor3D.Shadows) Reactor3D.Shadows._quality = null;
        } catch (error) {
            // A viewport that cannot name its GPU still renders.
        }
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
        this.hint.appendChild(document.createElement('br'));
        this.hint.appendChild(document.createTextNode(tt('Ctrl + right-drag: look around. WASD: move. Q/E: down/up.')));
        container.appendChild(this.hint);
        // Two frames, so the transition has a start state to animate from.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (this.hint) this.hint.classList.add('is-fading');
        }));
    }

    /**
     * The shared canvas fills the view. PIXI writes a pixel size onto the
     * same canvas whenever the 2D map resizes it (the sidebar divider does),
     * and the picture then sat in a stale box while the pointer was read
     * through the new one: the cursor off from what it picked until a zoom
     * redrew. Put back whenever it has been overwritten.
     */
    keepCanvasFilling() {
        const style = this.canvas && this.canvas.style;
        if (!style || (style.width === '100%' && style.height === '100%' && style.left !== undefined && (style.inset === '0px' || style.inset === '0'))) return false;
        Object.assign(style, { position: 'absolute', inset: '0', left: '0', top: '0', width: '100%', height: '100%' });
        return true;
    }

    resize() {
        const container = this.container();
        if (!container || !this.renderer || !this.camera) return;
        this.keepCanvasFilling();
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.requestRender();
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

    /** Mesh rocks without blocking input; retain recently visited maps within a memory budget. */
    async prepareRockChunks(mapData) {
        // Retain CPU arrays, not GPU objects, for two maps within 64 MiB
        // (16 MiB on low-memory hosts). Signatures account for edits.
        const maps = this._rockMapCaches || (this._rockMapCaches = new Map());
        const cache = maps.get(mapData.id) || new Map();
        maps.delete(mapData.id);
        maps.set(mapData.id, cache);
        while (maps.size > 2) maps.delete(maps.keys().next().value);
        await Reactor3D.prepareRockChunks(mapData, cache);
        if (maps !== this._rockMapCaches || maps.get(mapData.id) !== cache) return cache;
        const bytes = entries => [...entries.values()].reduce((total, buckets) => total + buckets.reduce((sum, bucket) =>
            sum + bucket.positions.byteLength + bucket.uvs.byteLength + bucket.colors.byteLength + bucket.normals.byteLength, 0), 0);
        const limit = (Reactor3D.lowMemory?.() ? 16 : 64) * 1024 * 1024;
        let total = [...maps.values()].reduce((sum, entries) => sum + bytes(entries), 0);
        for (const [id, entries] of maps) {
            if (total <= limit) break;
            total -= bytes(entries);
            maps.delete(id);
        }
        return cache;
    }

    /** Rebuild merged geometry from the open map, keeping the old view during asset preparation. */
    async rebuild() {
        if (!this.enabled || !this.renderer) return false;
        const request = ++this._rebuildGeneration;
        const renderer = this.renderer;
        const mapData = this.currentMap();
        const tileset = this.currentTileset();
        if (!mapData || !tileset) return false;
        this.beginModelUse(mapData);
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
            this._rockMapCaches = new Map();
            // The framing key and the orbit belong to the previous project:
            // both projects usually open on map 1, and matching dimensions
            // kept a camera aimed at the OLD project's last-orbited spot — a
            // black first view until a map switch re-framed it.
            this._framedMap = null;
            this.view = { yaw: 0, pitch: 34, distance: 24, target: { x: 0, y: 0, z: 0 } };
            this._cachedProjectPath = projectPath;
        }

        this.attachSidecar(mapData);
        this.loadClassification();
        // Images and geometry are independent. Mesh rocks with the runtime's
        // workers while the images load, then show the complete map at once.
        const [bitmaps, parallaxes, materials, rockChunkCache] = await Promise.all([
            this.loadSheets(tileset),
            this.loadParallaxes(mapData),
            this.loadMaterials(mapData),
            this.prepareRockChunks(mapData)
        ]);
        if (!this.rebuildIsCurrent(request, renderer)) return false;

        // A rebuilt sky would start its drift over; carry the old one's on.
        const skyOffset = this.mapScene?.skyOffset?.() || null;
        this.clearScene();
        this.mapScene = new Reactor3D.MapScene(mapData, bitmaps, {
            flags: tileset.flags,
            tilesetId: tileset.id,
            tileSize: this.tilePixels(),
            // The maps past the border stand through a rebuild (RRMapNeighborView): no land is laid where they do.
            surroundNone: globalThis.RRMapNeighborView?.noneFor(this, mapData) || null,
            // The runtime reaches for ImageManager here. There is no game
            // running in the editor, so the pictures come off disk instead —
            // without which a parallax-mapped map previews as its bare tile
            // layers, which on a parallax map is very close to nothing.
            loadParallax: name => parallaxes[name] || null,
            // The pieces' material images, off disk the same way.
            loadMaterial: name => materials[name] || null,
            // A material's settings file (img/materials/<Name>.json), read with its images.
            loadMaterialSettings: name => this.materialSettings?.[name] || null,
            // The workers have already filled the cache; no late arrivals in
            // the demand-rendered editor view.
            rockWorkers: false,
            rockChunkCache
        });
        this.mapScene.setPass('all');
        if (skyOffset) this.mapScene.setSkyOffset?.(skyOffset);
        this.applyAtmosphere(mapData);
        globalThis.RRMapEdges?.syncView?.(this);
        // The maps past the border: those kept from the scene before stand again now, a new one is built once this map is drawn.
        globalThis.RRMapNeighborView?.sync(this);
        this.buildGrid(mapData);
        this.buildHoverCell();
        if (!await this.buildEvents(mapData, request)) return false;
        this.buildProps(mapData, request);
        this.drawPassage();
        if (!this.rebuildIsCurrent(request, renderer)) return false;
        this.projectController?.mediaSurfacePreviewManager?.attachThree?.(this);
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
        // A map framed before keeps its view, and a camera made since is aimed by it.
        this.aimNewCamera();

        // An empty view has several possible causes — no sheets on disk, a
        // tileset with no images, geometry that built nothing — and they look
        // identical on screen. Keep the counts where they can be read.
        this.sweepModelUse(mapData, request);
        this.lastBuild = {
            map: `${mapData.width}x${mapData.height}`,
            sheets: Object.keys(bitmaps).length,
            meshes: this.mapScene._meshes.length,
            events: this.eventGroup ? this.eventGroup.children.length : 0
        };
        this.requestRender();
        return true;
    }

    /**
     * The view is closing: the models its caches keep (they outlive the view,
     * so coming back is quick) give back their copies on the graphics card.
     * Returns what the renderer held before and after, for the memory check.
     */
    releaseGraphics(renderer) {
        const held = () => ({
            geometries: renderer?.info?.memory?.geometries || 0,
            textures: renderer?.info?.memory?.textures || 0
        });
        const before = held();
        if (typeof RREventPreviewModels !== 'undefined') RREventPreviewModels.releaseGpu?.();
        const release = typeof RRModelRelease !== 'undefined' ? RRModelRelease : null;
        if (release && typeof Reactor3D !== 'undefined') {
            const cache = Reactor3D._glbCache || {};
            for (const key in cache) {
                const template = cache[key] && cache[key].template;
                if (!template) continue;
                release.releaseTemplate(template);
                const lod = Reactor3D._lodCache && Reactor3D._lodCache[key];
                for (const level of (lod && lod.levels) || []) for (const geometry of level) geometry?.dispose?.();
            }
        }
        return { before, after: held() };
    }

    /**
     * A model's copy leaves the view: its materials, its skeletons and the geometry made for
     * this copy alone go; what it shares with its template stays with the template.
     */
    disposeModelCopy(object) {
        if (!object) return;
        if (typeof RREventPreviewModels !== 'undefined' && RREventPreviewModels.disposeInstance) {
            RREventPreviewModels.disposeInstance(object);
            return;
        }
        object.traverse(node => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const material of materials) material.dispose?.();
        });
    }

    /** Another map is being built: the models kept for the one before it are counted from here. */
    beginModelUse(mapData) {
        const key = `${this.projectPath()}:${mapData?.id || 0}`;
        if (key === this._modelUseMap) return false;
        this._modelUseMap = key;
        this._modelSweepOwed = true;
        if (typeof RREventPreviewModels !== 'undefined') RREventPreviewModels.nextMap?.();
        try { if (typeof Reactor3D !== 'undefined') Reactor3D.ModelUse?.begin?.(mapData?.id || 0); } catch (error) { /* no model cache */ }
        return true;
    }

    /** The new map is built and has asked for its models: those of the map before it that it does not use are given back. */
    sweepModelUse(mapData, request) {
        if (!MapEditor3D.SWEEP_MODELS_ON_MAP_CHANGE || !this._modelSweepOwed) return;
        clearTimeout(this._modelSweepTimer);
        this._modelSweepTimer = setTimeout(() => {
            if (!this.rebuildIsCurrent(request) || !this._modelSweepOwed) return;
            this._modelSweepOwed = false;
            if (typeof RREventPreviewModels !== 'undefined') RREventPreviewModels.sweep?.();
            try { if (typeof Reactor3D !== 'undefined') Reactor3D.ModelUse?.sweep?.(mapData); } catch (error) { /* no model cache */ }
            this.requestRender();
        }, MapEditor3D.MODEL_SWEEP_DELAY_MS);
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
            mapData.reactor3d = RRJson.parse(this.fs.readFileSync(filePath));
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
            Reactor3D.setClassification(RRJson.parse(this.fs.readFileSync(filePath)));
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

        for (const event of MapEditor3D.previewEvents(mapData)) {
            if (!event) continue;
            this._buildOneEvent(event, sheets, mapData, request);
        }

        this._eventSnapshot = new Map();
        for (const event of MapEditor3D.previewEvents(mapData)) {
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
        // A battle unit with no picture of its own on the page drawn stands as its record gives it:
        // its character sheet, its battler picture or the plain figure as a billboard, its model as a model.
        const look = previewIndex !== null ? MapEditor3D.unitLook(mapData, event) : null;
        // Its side's box and ring it has on whatever page is drawn.
        const side = MapEditor3D.unitSide(mapData, event);
        const bare = !(page?.image?.tileId > 0) && !page?.image?.characterName;
        const lookImage = look && bare && look.kind === 'character'
            ? Object.assign({}, page?.image, { characterName: look.characterName, characterIndex: look.characterIndex }) : null;
        const sprite = (look && bare && (look.kind === 'picture' || look.kind === 'figure') ? this.unitPictureSprite(event, look, mapData) : null)
            || (lookImage ? this.eventSprite(event, sheets, lookImage, previewIndex !== null && page?.stepAnime ? page : null) : null)
            || this.eventSprite(event, sheets, page?.image, previewIndex !== null && page?.stepAnime ? page : null);
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
        mesh.userData.unit = !!side;
        this.eventGroup.add(mesh);
        // A sprite casts its cut-out; the placeholder cube casts nothing.
        if (sprite && Reactor3D.Shadows) Reactor3D.Shadows.markCaster(mesh, false);
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
        // A sized event's box spans its footprint, centred on the event's tile (a model's measured one lies round the model).
        const footprint = typeof RRMapElevation !== 'undefined' && RRMapElevation.eventSize ? RRMapElevation.eventSize(mapData, event.id) : [1, 1];
        const origin = typeof RRMapElevation !== 'undefined' && RRMapElevation.eventFootprintOrigin ? RRMapElevation.eventFootprintOrigin(mapData, event.id) : [0, 0];
        const box = this.eventBox(boxHeight, this.eventColor(event), footprint, origin);
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
        if (side) this.addUnitRing(mesh, side, page, footprint, origin, mapData);

    }

    /** What an event stands as on the page this view draws of it (the look rule's answer, as the 2D map has it); null for an event that is no unit there. */
    static unitLook(mapData, event) {
        return typeof EventManager !== 'undefined' && typeof EventManager.unitLook === 'function' ? EventManager.unitLook(event, mapData) : null;
    }

    /** The side an event fights on, whatever page is drawn of it: `{ team, color }` as the 2D map has it; null for an event that is no unit. */
    static unitSide(mapData, event) {
        return typeof EventManager !== 'undefined' && typeof EventManager.unitSide === 'function' ? EventManager.unitSide(event, mapData) : null;
    }

    /** A side's color as a number. */
    static colorNumber(hex, fallback = 0xe6d15a) {
        const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
        return match ? parseInt(match[1], 16) : fallback;
    }

    // How far over the ground a unit's ring lies, how wide its band is and how far its notch reaches, in tiles.
    static get RING_LIFT() { return 0.06; }
    static get RING_BAND() { return 0.07; }
    static get RING_NOTCH() { return 0.16; }
    // How many straight pieces a ring's round is made of.
    static get RING_SEGMENTS() { return 40; }
    // A ring is drawn over what stands on it (grass, a slope's shoulder, the unit itself), just under the events' boxes.
    static get RING_ORDER() { return 997; }
    static get RING_OPACITY() { return 0.92; }
    // The ground a ring lies on is followed up and down no further than this, plus this much for each tile from its middle: a wall or a drop beside the unit is not ground it lies on.
    static get RING_STEP() { return 0.6; }
    static get RING_SLOPE() { return 1.2; }

    /**
     * A ring on the ground, as triangles: an ellipse of radii `rx` and
     * `rz` (its band RING_BAND wide, inside those radii) with an arrowhead
     * on its edge the way `direction` points (2 down the map, 4 left, 6
     * right, 8 up). `{ positions, index }`: x, y (0) and z for each
     * corner, three corners to a triangle, wound to face up.
     */
    static unitRingShape(rx, rz, direction, segments = MapEditor3D.RING_SEGMENTS) {
        const band = Math.min(MapEditor3D.RING_BAND, rx * 0.5, rz * 0.5);
        const positions = [], index = [];
        for (let i = 0; i < segments; i++) {
            const angle = i / segments * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
            positions.push(cos * rx, 0, sin * rz, cos * (rx - band), 0, sin * (rz - band));
        }
        for (let i = 0; i < segments; i++) {
            const a = i * 2, b = ((i + 1) % segments) * 2;
            // Outer, next outer, inner; then inner, next outer, next inner: both face up (+y).
            index.push(a, a + 1, b, b, a + 1, b + 1);
        }
        const [dx, dz] = direction === 4 ? [-1, 0] : direction === 6 ? [1, 0] : direction === 8 ? [0, -1] : [0, 1];
        const reach = dx ? rx : rz, half = MapEditor3D.RING_NOTCH * 0.6, tip = reach + MapEditor3D.RING_NOTCH, base = reach - band;
        const at = positions.length / 3;
        // The arrowhead: its tip outside the ring, its base across the band.
        positions.push(dx * tip, 0, dz * tip, dx * base - dz * half, 0, dz * base + dx * half, dx * base + dz * half, 0, dz * base - dx * half);
        index.push(at, at + 2, at + 1);
        return { positions, index };
    }

    /**
     * A unit's ring: on the ground under it in its side's color (`side`
     * is `{ color }`), round the tiles it takes, with a notch the way it
     * faces. It follows the ground's rise and fall (`layUnitRing`) and is
     * drawn over what stands on it, so tall grass or a slope's shoulder
     * does not hide it. One mesh, its own shape and material, kept on the
     * marker as `userData.ring`. Shown while Event mode is on or Battle
     * Setup is open.
     */
    addUnitRing(marker, side, page, footprint, origin, mapData) {
        const event = marker.userData.event;
        const reach = typeof EventManager !== 'undefined' && EventManager.RING_REACH > 0 ? EventManager.RING_REACH : 0.44;
        const ring = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
            color: MapEditor3D.colorNumber(side.color), transparent: true, opacity: MapEditor3D.RING_OPACITY, depthTest: false, depthWrite: false
        }));
        ring.renderOrder = MapEditor3D.RING_ORDER;
        ring.userData.event = event;
        ring.userData.unitRing = true;
        ring.userData.facing = Number(page?.image?.direction) || 2;
        marker.userData.ring = ring;
        this.shapeUnitRing(ring, footprint[0] * reach, footprint[1] * reach);
        const [shiftX, , shiftZ] = MapEditor3D.eventBoxShift(footprint, origin);
        // Where its middle lies from the middle of the event's tile: `placeEvent` keeps it there.
        ring.userData.shift = [shiftX, shiftZ];
        ring.position.set(event.x + 0.5 + shiftX, MapEditor3D.eventFeet(mapData, event) + MapEditor3D.RING_LIFT, event.y + 0.5 + shiftZ);
        this.layUnitRing(ring, mapData);
        ring.visible = this.unitRingsShown();
        this.eventGroup.add(ring);
        return ring;
    }

    /** Gives a ring the radii `rx` and `rz`, in tiles (flat: `layUnitRing` lays it on the ground). */
    shapeUnitRing(ring, rx, rz) {
        const shape = MapEditor3D.unitRingShape(rx, rz, ring.userData.facing);
        const geometry = ring.geometry, corners = geometry.getAttribute('position');
        // A ring shaped again keeps its corners' place on the graphics card: only their numbers change.
        if (corners && corners.array.length === shape.positions.length) {
            corners.array.set(shape.positions);
            corners.needsUpdate = true;
        } else {
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(shape.positions), 3));
            geometry.setIndex(shape.index);
        }
        geometry.computeBoundingSphere();
        ring.userData.radii = [rx, rz];
    }

    /**
     * Lays a ring on the ground where it is: each corner rises and falls
     * from the unit's own tile as the land does (the cell's height and the
     * terrain's slope) and as what is built under the unit does (a ramp, a
     * stair). A height out of reach is not ground the ring lies on (a
     * cliff or a wall beside the unit, the drop off a deck's edge): that
     * part of the corner's height stays level with the unit's feet.
     */
    layUnitRing(ring, mapData) {
        const corners = ring && ring.geometry && ring.geometry.getAttribute('position');
        if (!corners || !mapData || !Reactor3D.groundHeightAt) return;
        const values = corners.array, lastX = mapData.width - 1e-6, lastZ = mapData.height - 1e-6;
        const inMap = (value, last) => Math.max(0, Math.min(last, value));
        // The ring's height is its unit's feet, at the middle of the unit's tile: `shift` is how far the ring's middle lies from there.
        const [shiftX, shiftZ] = ring.userData.shift || [0, 0];
        const tileX = inMap(ring.position.x - shiftX, lastX), tileZ = inMap(ring.position.z - shiftZ, lastZ);
        const land = MapEditor3D.groundAt(mapData, tileX, tileZ), built = Reactor3D.groundHeightAt(mapData, tileX, tileZ) - land;
        for (let i = 0; i < values.length; i += 3) {
            const x = values[i], z = values[i + 2], wx = inMap(ring.position.x + x, lastX), wz = inMap(ring.position.z + z, lastZ);
            const here = MapEditor3D.groundAt(mapData, wx, wz);
            const slope = here - land, step = Reactor3D.groundHeightAt(mapData, wx, wz, here + built) - here - built;
            const rise = (Math.abs(slope) <= MapEditor3D.RING_STEP + MapEditor3D.RING_SLOPE * Math.hypot(x + shiftX, z + shiftZ) ? slope : 0)
                + (Math.abs(step) <= MapEditor3D.RING_STEP ? step : 0);
            values[i + 1] = Number.isFinite(rise) ? rise : 0;
        }
        corners.needsUpdate = true;
        ring.geometry.computeBoundingSphere();
    }

    /** A unit that stands as a model takes the ground the model covers: its ring goes round that, where it is more than the unit's tiles. */
    fitUnitRing(marker, box) {
        const ring = marker && marker.userData.ring;
        if (!ring || !box || !ring.userData.radii) return;
        const rx = Math.max(ring.userData.radii[0], (box.max.x - box.min.x) / 2), rz = Math.max(ring.userData.radii[1], (box.max.z - box.min.z) / 2);
        if (!(rx > 0) || !(rz > 0) || !Number.isFinite(rx) || !Number.isFinite(rz)) return;
        if (rx === ring.userData.radii[0] && rz === ring.userData.radii[1]) return;
        this.shapeUnitRing(ring, rx, rz);
        const event = ring.userData.event, middleX = (box.max.x + box.min.x) / 2, middleZ = (box.max.z + box.min.z) / 2;
        ring.position.x = middleX;
        ring.position.z = middleZ;
        if (event) ring.userData.shift = [middleX - (event.x + 0.5), middleZ - (event.y + 0.5)];
        this.layUnitRing(ring, this.currentMap());
        this.requestRender();
    }

    /** Whether the units' rings are drawn: Event mode is on, or Battle Setup is open. */
    unitRingsShown() {
        const manager = this.eventManager();
        if (manager && typeof manager.unitRingsShown === 'function') return !!manager.unitRingsShown();
        return !!(manager && manager.eventMode);
    }

    /** The rings appear or go where they lie; nothing is built again. */
    syncUnitRings() {
        const shown = this.unitRingsShown();
        let changed = false;
        for (const marker of this.pickables || []) {
            const ring = marker.userData && marker.userData.ring;
            if (!ring || ring.visible === shown) continue;
            ring.visible = shown;
            changed = true;
        }
        if (changed) this.requestRender();
        return changed;
    }

    /**
     * A unit's battler picture or plain figure as a billboard: a card as
     * wide and tall as the tiles a unit's picture takes (a typed size makes
     * it that many times bigger), the picture standing in it with its feet
     * on its lower edge. Null where the look rule is not loaded.
     */
    unitPictureSprite(event, look, mapData) {
        if (typeof EventManager === 'undefined' || typeof EventManager.lookArt !== 'function' || typeof ReactorFightLook === 'undefined') return null;
        const rule = ReactorFightLook;
        const size = Math.max(1, Math.floor(Number((typeof RRMapElevation !== 'undefined' && RRMapElevation.eventSize ? RRMapElevation.eventSize(mapData, event.id) : [1, 1])[0]) || 1));
        const wide = rule.TILES_WIDE * size, tall = rule.TILES_TALL * size;
        // A picture still being read is drawn on its card when it arrives: every billboard of the look shows it then.
        if (!this._onLookArt) this._onLookArt = ready => { MapEditor3D.lookCard(ready); this.requestRender(); };
        const art = EventManager.lookArt(look, null, this._onLookArt);
        if (!art) return null;
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(wide, tall),
            new THREE.MeshBasicMaterial({ map: MapEditor3D.lookCard(art).texture, transparent: true, alphaTest: 0.4 })
        );
        mesh.userData.height = tall;
        return mesh;
    }

    /** The width of the picture a unit's billboard is drawn from, in pixels. */
    static get UNIT_CARD_PIXELS() { return 256; }

    /**
     * The picture the billboards of one look are drawn from, kept with the
     * look's art (`EventManager.lookArt`): one canvas and one texture for
     * every unit that stands as that picture or that side's plain figure,
     * whatever its size. The art stands in it with its feet on the lower
     * edge, drawn once it is read. `{ canvas, texture, drawn }`.
     */
    static lookCard(art) {
        const rule = ReactorFightLook;
        let card = art.texture3D;
        if (!card) {
            const canvas = document.createElement('canvas');
            canvas.width = MapEditor3D.UNIT_CARD_PIXELS;
            canvas.height = Math.round(MapEditor3D.UNIT_CARD_PIXELS * rule.TILES_TALL / rule.TILES_WIDE);
            const texture = new THREE.CanvasTexture(canvas);
            if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            // Many billboards hold it: none of them gives it back when it goes (`disposeOwnPictures`).
            texture.userData.shared = true;
            card = art.texture3D = { canvas, texture, drawn: false };
        }
        if (art.ready && art.canvas && !card.drawn) {
            const canvas = card.canvas;
            const fit = rule.fit(art.canvas.width, art.canvas.height, canvas.width / rule.TILES_WIDE, canvas.height / rule.TILES_TALL, 1);
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(art.canvas, 0, 0, art.canvas.width, art.canvas.height, Math.round((canvas.width - fit.width) / 2), canvas.height - fit.height, fit.width, fit.height);
            card.drawn = true;
            card.texture.needsUpdate = true;
        }
        return card;
    }

    /** An event's sprite and a name plate are each drawn from a picture made for them alone: it goes with them. A picture many units share (`lookCard`) stays. */
    static disposeOwnPictures(object) {
        const materials = Array.isArray(object?.material) ? object.material : object?.material ? [object.material] : [];
        for (const material of materials) {
            const map = material.map;
            if (map && !(map.userData && map.userData.shared)) map.dispose?.();
        }
    }

    /** What one event looks like in this view; a change means rebuild its pieces. */
    _eventIdentity(event, mapData) {
        const previewIndex = MapEditor3D.previewPageIndex(mapData, event);
        const page = event.pages?.[previewIndex ?? 0] || event.pages?.[0];
        const look = previewIndex !== null ? MapEditor3D.unitLook(mapData, event) : null;
        return JSON.stringify([
            event.x, event.y, event.name, event.note, previewIndex,
            page && page.image, page && page.stepAnime,
            previewIndex !== null ? MapEditor3D.previewModelSpec(mapData, event, previewIndex) : (Reactor3D.eventModelSpec ? Reactor3D.eventModelSpec(mapData, event.id, 0) : null),
            look && typeof EventManager !== 'undefined' && EventManager.lookKey ? EventManager.lookKey(look) : null,
            this.eventColor(event),
            Reactor3D.eventZAt ? Reactor3D.eventZAt(mapData, event.id) : 0,
            typeof RRMapElevation !== 'undefined' && RRMapElevation.eventSize ? RRMapElevation.eventSize(mapData, event.id) : null,
            typeof RRMapElevation !== 'undefined' && RRMapElevation.eventFootprintOrigin ? RRMapElevation.eventFootprintOrigin(mapData, event.id) : null
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
        // Map 0 is no map: a vehicle placed nowhere, and the Structure workshop's plot.
        if (!mapId || mapData.rrWorkshop) return;
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
    eventBox(height, colour, footprint = [1, 1], origin = [0, 0]) {
        const side = 0.94;
        const [w, d] = footprint;
        // Its middle from the middle of the event's own tile: the footprint starts `origin` tiles from it.
        const shape = new THREE.BoxGeometry(side + (w - 1), height, side + (d - 1)).translate(...MapEditor3D.eventBoxShift(footprint, origin));
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
        // Taken by its model: the event's marker is what is placed, and the model goes with it (below).
        if (mesh.userData.modelPreview) {
            const marker = this.eventMarker(event);
            if (marker && marker.userData.model === mesh) { this.placeEvent(marker); return; }
        }

        const height = mesh.userData.height || 0.55;
        const x = event.x + 0.5;
        // A sized event's own marker (sprite or cube, label) stands in the middle of its footprint, where
        // the game draws it; the box is the footprint, centred on the event's tile as the game counts it.
        const [offsetX, offsetZ] = typeof RRMapElevation !== 'undefined' && RRMapElevation.eventMarkerOffset
            ? RRMapElevation.eventMarkerOffset(mapData, event.id) : [0, 0];

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
            : Reactor3D.groundHeightAt
                ? Reactor3D.groundHeightAt(mapData, event.x + 0.5, event.y + 0.5)
                : Reactor3D.elevationAt(mapData, event.x, event.y)) + eventZ;
        const z = facade ? facade.z : event.y + 0.5;

        // A flat event lies on the ground; everything else stands on it.
        const markerX = x + offsetX, markerZ = facade ? z : z + offsetZ;
        mesh.position.set(markerX, mesh.userData.flat ? elevation + 0.01 : elevation + height / 2, markerZ);
        mesh.userData.box?.position.set(x, elevation + mesh.userData.boxHeight / 2, z);
        mesh.userData.label?.position.set(markerX, elevation + height + 0.28, markerZ);

        // A unit's ring lies under it and its previewed model stands on the same ground: both go where the event goes.
        const ring = mesh.userData.ring, model = mesh.userData.model;
        if (!ring && !model) return;
        const feet = MapEditor3D.eventFeet(mapData, event);
        if (ring && ring.userData.shift) {
            ring.position.set(x + ring.userData.shift[0], feet + MapEditor3D.RING_LIFT, event.y + 0.5 + ring.userData.shift[1]);
            this.layUnitRing(ring, mapData);
        }
        if (model && model.parent && model.userData.seat) {
            const seat = model.userData.seat;
            const moved = (this._seatMove || (this._seatMove = new THREE.Vector3()))
                .set(x + seat[0], feet + seat[1], event.y + 0.5 + seat[2]).sub(model.position);
            if (moved.lengthSq() > 0) {
                model.position.add(moved);
                model.userData.pickBox?.translate(moved);
            }
        }
    }

    /**
     * Draw an event's box over everything, or by depth like the rest of the scene. A box inside a
     * previewed model, or behind one, is not seen at all by depth; the selected event's box and the
     * box of any event standing as a model are drawn over, so what is selected is always seen.
     */
    eventBoxOnTop(box, on) {
        if (!box || !box.material || box.material.depthTest === !on) return;
        box.material.depthTest = !on;
        box.material.depthWrite = !on;
        box.renderOrder = on ? 998 : 0;
        box.material.needsUpdate = true;
        this.requestRender();
    }

    /** The marker (sprite or cube) of an event, which carries its box and label. */
    eventMarker(event) {
        return event ? (this.pickables || []).find(mesh => mesh.userData.event && mesh.userData.event.id === event.id && mesh.userData.box) || null : null;
    }

    /** The colour of the selected event's box: the theme's accent, as the 2D map draws it. */
    selectedEventColor() {
        return typeof EventManager !== 'undefined' && EventManager.selectedTone ? EventManager.selectedTone() : 0xfff2a0;
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
        this.grid.visible = this.gridVisible === true || !!mapData.rrWorkshop;
        this.mapScene.scene().add(this.grid);
        if (mapData.rrWorkshop) this.buildPlot(mapData, base);
    }

    /**
     * The Structure workshop's plot: a ground slab the size of the plot with
     * its edge drawn in the accent colour, so an empty plot reads as a place
     * to build and its edge as where the structure ends.
     */
    buildPlot(mapData, base) {
        const { width, height } = mapData;
        const accent = typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? ThemeColors.resolve('--color-accent') : '#e0b020';
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ color: 0x3a4148, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(width / 2, base - 0.03, height / 2);
        ground.renderOrder = -1;
        const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, base, 0), new THREE.Vector3(width, base, 0), new THREE.Vector3(width, base, height), new THREE.Vector3(0, base, height)]),
            new THREE.LineBasicMaterial({ color: new THREE.Color(accent) }));
        this.plot = new THREE.Group();
        this.plot.add(ground, edge);
        this.mapScene.scene().add(this.plot);
    }

    /** Show or hide the cell grid. */
    setGridVisible(on) {
        this.gridVisible = !!on;
        if (this.grid) this.grid.visible = this.gridVisible;
        this.requestRender();
    }

    /** Show or hide Passage in this view. */
    setPassageVisible(on) {
        this.passageVisible = !!on;
        this.drawPassage();
    }

    /** Bring Passage up to date after a change: what changed, and where, is found from the map itself. */
    refreshPassage() {
        this.requestRender();
        if (this.passageVisible) this.drawPassage();
    }

    /**
     * Passage in the 3D view: every place a character can get to, each side
     * of it marked by what happens there (a walk, a hop, a mantle, a ladder,
     * a drop, a stop), an X on a tile nobody stands on, the same in words
     * under the pointer, and a legend. The game's own rules answer
     * (RRMapEdgeLabels: `ReactorPhysics.edges`, the tileset's flags below,
     * the tiles placed models and sized events cover). Called on every
     * rebuild and change; it does nothing while the tick is off.
     */
    drawPassage() {
        globalThis.RRMapEdgeLabels?.passage.sync(this);
    }

    /**
     * The tileset's say on the cells of a map, read as the flat map's passage
     * marks read it: `read(x, y)` gives the directions a cell blocks (bits
     * 1 down, 2 left, 4 right, 8 up; 15 nothing walks), and `signature`
     * changes when the tileset's flags, the room's floor or the map's image
     * layers do. A picture at the characters' depth shuts the tiles it is
     * solid on, as it does on the flat map.
     */
    passageTiles(mapData) {
        if (!mapData || typeof TilemapManager === 'undefined' || !TilemapManager.tilePassage) return null;
        const tileset = this.projectController?.tilemapManager?.currentTileset
            || this.projectController?.databaseManager?.getTileset?.(mapData.tilesetId);
        const flags = (tileset && tileset.flags) || [];
        const roomFloor = !!(Reactor3D.roomFor && Reactor3D.roomFor(mapData) && Reactor3D.isMap3D(mapData));
        let hash = flags.length;
        for (let i = 0; i < flags.length; i++) hash = (hash * 31 + (flags[i] | 0)) | 0;
        const imageSolid = (typeof window !== 'undefined' && window.reactor?.mapImageLayersManager?.solidTest?.(mapData)) || null;
        const layers = imageSolid ? JSON.stringify(mapData.rrImageLayers) : '';
        return {
            signature: `${mapData.tilesetId}|${roomFloor ? 1 : 0}|${hash}|${layers}`,
            read: (x, y) => (imageSolid && imageSolid(x, y) ? 0x0f
                : TilemapManager.tilePassage(mapData.data, mapData.width, mapData.height, flags, x, y, roomFloor).blocked)
        };
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
     * by the ground it is lying on, and the floor under a roof is named
     * through the roof (see `tileAt`), where the outline has to show.
     */
    buildHoverCell() {
        if (!this.mapScene) return;
        this.terrainRing = null;
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
        // Where an event placed on the outlined tile will stand, when that is
        // not the surface outlined (`updateHoverCell`): the tile's square at
        // that height, fainter, and a line joining the two. Four sides and
        // the line, as ten points written in place. It hangs on the outline,
        // so it is shown, hidden and taken away with it.
        if (this.hoverFeet) { this.hoverFeet.geometry.dispose(); this.hoverFeet.material.dispose(); }
        const feet = new THREE.BufferGeometry();
        feet.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
        this.hoverFeet = new THREE.LineSegments(feet, new THREE.LineBasicMaterial({
            color: 0xfff2a0, transparent: true, opacity: 0.5, depthTest: false
        }));
        this.hoverFeet.renderOrder = 998;
        this.hoverFeet.frustumCulled = false;
        this.hoverFeet.visible = false;
        this.hoverCell.add(this.hoverFeet);
    }

    /**
     * The terrain brush's ring: a circle of the brush's radius laid on the
     * ground, each point at the ground's own height so it drapes over a hill.
     * Shown while the terrain tab is up and the pointer is over the map.
     */
    /**
     * Bend the scene through the changed terrain without rebuilding it:
     * the runtime re-lifts the vertices, the pick trees follow, and the
     * things standing on the ground are set back down on it.
     */
    updateTerrainInPlace(region) {
        const mapData = this.currentMap();
        if (!mapData || !this.mapScene?.updateTerrain) return false;
        const changed = this.mapScene.updateTerrain(mapData, region || null);
        if (!changed) return false;
        if (typeof RRMeshBvh !== 'undefined' && RRMeshBvh.refit) {
            for (const geometry of changed) RRMeshBvh.refit(geometry);
        }
        const manager = this.propsManager?.();
        for (const object of this.propGroup?.children || []) {
            const prop = manager?.prop?.(object.userData?.propId);
            if (prop) this.placeProp(object, prop, mapData);
        }
        this.syncPropRings?.();
        for (const child of this.eventGroup?.children || []) {
            if (child.userData?.event && child.userData.box) this.placeEvent(child);
        }
        this._lastActiveAt = performance.now();
        return true;
    }

    pieceManager() {
        return this.projectController?.pieceBuilderManager || window.reactor?.pieceBuilderManager || null;
    }

    canEditPieces() {
        if (this.projectController?.mediaSurfacePreviewManager?.authoring) return false;
        return !!this.pieceManager()?.active;
    }

    /**
     * The material images the map's pieces wear, plus the one chosen in the
     * panel, off disk once each and kept by name.
     */
    async loadMaterials(mapData) {
        const projectPath = this.projectPath();
        if (!projectPath || !this.path || typeof RRMapElevation === 'undefined') return {};
        const names = new Set(RRMapElevation.pieceMaterials ? RRMapElevation.pieceMaterials(mapData) : []);
        const chosen = this.pieceManager()?.material;
        if (chosen) names.add(chosen);
        const waterMaterial = this.terrainManager()?.waterMaterial;
        if (waterMaterial) names.add(waterMaterial);
        // The material the room's steep ground turns to; a missing one is simply not loaded.
        const cliff = RRMapElevation.roomCliff ? RRMapElevation.roomCliff(RRMapElevation.room(mapData)).name : '';
        if (cliff) names.add(cliff);
        // The grounds painted over the floor (RRMapGround).
        if (typeof RRMapGround !== 'undefined') for (const name of RRMapGround.materials(mapData)) names.add(name);
        if (!names.size) return {};
        // Kept per project: another project's Stone is not this one's.
        if (!this.materialImages || this._materialImagesProject !== projectPath) {
            this.materialImages = {};
            this.materialSettings = {};
            this._materialImagesProject = projectPath;
        }
        const directory = this.path.join(projectPath, 'img', 'materials');
        // Each material's normal and roughness maps, where it has them (a missing one has no url and is skipped),
        // and its settings file, read once.
        for (const name of [...names]) {
            if (!name || (typeof RRAssetFiles !== 'undefined' && RRAssetFiles.isMaterialCompanion?.(name))) continue;
            names.add(`${name}_normal`);
            names.add(`${name}_rough`);
            if (!(name in this.materialSettings)) {
                let settings = null;
                try {
                    const fs = typeof require === 'function' ? require('fs') : null;
                    const file = this.path.join(directory, `${name}.json`);
                    if (fs && fs.existsSync(file)) settings = JSON.parse(fs.readFileSync(file, 'utf8'));
                } catch (error) {
                    console.warn(`The settings of material "${name}" could not be read.`, error);
                }
                this.materialSettings[name] = settings;
            }
        }
        const loaded = {};
        const pending = [];
        for (const name of names) {
            if (!name || loaded[name]) continue;
            const cached = this.materialImages[name];
            if (cached) { loaded[name] = cached; continue; }
            const imageUrl = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles.imageUrlFor(directory, name) : '';
            if (!imageUrl) continue;
            pending.push(new Promise(resolve => {
                const image = new Image();
                image.onload = () => {
                    const bitmap = { image, width: image.naturalWidth, height: image.naturalHeight };
                    this.materialImages[name] = bitmap;
                    loaded[name] = bitmap;
                    resolve();
                };
                image.onerror = () => resolve();
                image.src = imageUrl;
            }));
        }
        if (pending.length) await Promise.all(pending);
        return loaded;
    }

    /**
     * The room's steep ground (its material, the angle it starts at, its tint) put on the floor as it
     * stands, without a rebuild: once a frame, however fast a slider is dragged, from the map as it then
     * is. The angle and the tint change with the images already in hand; only another material is read
     * off disk first, and the newest one asked for wins.
     */
    updateCliffInPlace() {
        const scene = this.mapScene;
        if (!this.currentMap() || !scene?.setRoomCliff || typeof RRMapElevation === 'undefined' || !RRMapElevation.roomCliff) return false;
        if (this._cliffFrame) return true;
        const run = () => {
            this._cliffFrame = 0;
            const mapData = this.currentMap();
            if (!mapData || this.mapScene !== scene) return;
            const cliff = RRMapElevation.roomCliff(RRMapElevation.room(mapData));
            const order = this._cliffOrder = (this._cliffOrder || 0) + 1;
            const put = images => { if (scene.setRoomCliff(cliff, name => images[name] || null)) this.requestRender(); };
            const held = this.materialImages || {};
            if (!cliff.name || held[cliff.name] || (scene._roomCliff && scene._roomCliff.name === cliff.name)) { put(held); return; }
            const request = this._rebuildGeneration;
            this.loadMaterials(mapData).then(materials => {
                if (this.mapScene !== scene || this._rebuildGeneration !== request || this._cliffOrder !== order) return;
                put(materials);
            }).catch(error => console.error('The steep ground could not be shown.', error));
        };
        if (typeof requestAnimationFrame === 'function') this._cliffFrame = requestAnimationFrame(run);
        else run();
        return true;
    }

    /** Lay the land past the border again without a rebuild: once a frame, however often it is asked (RRMapEdges.lay). */
    updateSurroundInPlace() {
        const mapData = this.currentMap();
        const edges = globalThis.RRMapEdges;
        if (!mapData || !this.mapScene?.addSurround || !edges?.lay) return false;
        edges.lay(this, mapData);
        return true;
    }

    /** Lay the pieces down again without a rebuild; true when the scene can. */
    updatePiecesInPlace(region = null) {
        const mapData = this.currentMap();
        const scene = this.mapScene;
        if (!mapData || !scene?.updatePieces) return false;
        const request = this._rebuildGeneration;
        this.loadMaterials(mapData).then(materials => {
            if (this.mapScene !== scene || this._rebuildGeneration !== request) return;
            scene.updatePieces(mapData, name => materials[name] || null, region);
            this._lastActiveAt = performance.now();
        }).catch(error => console.error('The pieces could not be laid down again.', error));
        return true;
    }

    /** Grow the foliage again where it changed ({x0, y0, x1, y1} in cells, or all), without a rebuild. */
    updateFoliageInPlace(region) {
        const mapData = this.currentMap();
        const scene = this.mapScene;
        if (!mapData || !scene?.updateFoliage) return false;
        scene.updateFoliage(mapData, region);
        this._lastActiveAt = performance.now();
        this.requestRender?.();
        return true;
    }

    /** Write the ground types' paint, tints and scales again where they changed, without a rebuild. */
    updateGroundInPlace(region) {
        const mapData = this.currentMap();
        const scene = this.mapScene;
        if (!mapData || !scene?.updateGround || !scene._ground) return false;
        if (!scene.updateGround(mapData, region)) return false;
        this._lastActiveAt = performance.now();
        this.requestRender?.();
        return true;
    }

    /** Lay the water sheets again without a rebuild. */
    updateWaterInPlace() {
        const mapData = this.currentMap();
        const scene = this.mapScene;
        if (!mapData || !scene?.updateWaterSheets) return false;
        const request = this._rebuildGeneration;
        this.loadMaterials(mapData).then(materials => {
            if (this.mapScene !== scene || this._rebuildGeneration !== request) return;
            scene.updateWaterSheets(mapData, name => materials[name] || null);
            this._lastActiveAt = performance.now();
        }).catch(error => console.error('The water could not be laid again.', error));
        return true;
    }

    /** The sheet under the pointer (its region), or null: whatever stands in front of it is looked through. */
    waterMeshAt(clientX, clientY) {
        const hit = this.waterHitAt(clientX, clientY);
        return hit ? hit.region : null;
    }

    /** The sheet under the pointer and how far along the ray it lies: `{ region, distance }`, or null. */
    waterHitAt(clientX, clientY) {
        const meshes = this.mapScene && this.mapScene._waterMeshes;
        if (!meshes || !meshes.length || !this.camera || !this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
        const hit = this._raycaster.intersectObjects(meshes, false).find(found => found.object.userData.water);
        return hit ? { region: hit.object.userData.water, distance: hit.distance } : null;
    }

    /**
     * What a Select click lands on: the nearest thing the pointer's ray meets,
     * `{ kind, distance }` with kind 'water' (and its `water` region), 'piece',
     * 'model' (and its `propId`), 'event', 'light' or 'ground'; null on nothing.
     * A rock standing in a lake is the rock, the lake seen past a jetty is the
     * jetty, and the bed seen through clear water is the water.
     */
    selectHitAt(clientX, clientY) {
        if (!this.mapScene || !this.camera || !this.canvas || typeof THREE === 'undefined') return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._raycaster = this._raycaster || new THREE.Raycaster();
        const aim = () => this._raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
        let best = null;
        const take = hit => { if (hit && Number.isFinite(hit.distance) && (!best || hit.distance < best.distance)) best = hit; };
        aim();
        const laid = this.raycastMapMeshes();
        if (laid) take({ kind: laid.object?.userData?.pieces || laid.object?.userData?.rrDoor ? 'piece' : 'ground', distance: laid.distance });
        const water = this.waterHitAt(clientX, clientY);
        if (water) take({ kind: 'water', water: water.region, distance: water.distance });
        const propId = this.propAt(clientX, clientY, true);
        if (propId) {
            const child = this.propGroup.children.find(object => object.userData.propId === propId);
            aim();
            const hit = child ? this._raycaster.intersectObject(child, true).find(found => !found.object.userData?.__reactorOverlay) : null;
            if (hit) take({ kind: 'model', propId, distance: hit.distance });
        }
        const eye = this.camera.position;
        if (this.eventGroup?.visible !== false) {
            const marker = this.eventAt(clientX, clientY, null);
            if (marker) take({ kind: 'event', distance: marker.getWorldPosition(this._selectPoint || (this._selectPoint = new THREE.Vector3())).distanceTo(eye) });
        }
        // A light is a point, not a surface: one within a few pixels of the pointer counts where it stands.
        const mapData = this.currentMap();
        const lights = mapData && typeof Reactor3D !== 'undefined' && Reactor3D.readMapLights ? Reactor3D.readMapLights(mapData) : [];
        const at = this._selectPoint || (this._selectPoint = new THREE.Vector3());
        for (const light of lights) {
            if (light.attach) continue;
            at.set(light.x + 0.5, Reactor3D.elevationAt(mapData, Math.round(light.x), Math.round(light.y)) + light.height, light.y + 1);
            const distance = at.distanceTo(eye);
            at.project(this.camera);
            if (at.z > 1) continue;
            const px = rect.left + (at.x + 1) / 2 * rect.width, py = rect.top + (1 - at.y) / 2 * rect.height;
            if (Math.hypot(px - clientX, py - clientY) <= 14) take({ kind: 'light', distance });
        }
        return best;
    }

    /**
     * A Select click on something another group owns, found by selectHitAt:
     * water turns the bar to Terrain with the Look panel on that sheet, a
     * building to Build with the piece selected, a model to Models with that
     * model selected. True when the bar turned.
     */
    selectAcrossGroups(hit, clientX, clientY) {
        const bar = window.reactor?.buildHotbar;
        if (!hit || !bar) return false;
        if (hit.kind === 'water' && bar.selectWater) return !!bar.selectWater(hit.water);
        if (hit.kind === 'piece' && bar.selectPiece) return !!bar.selectPiece(clientX, clientY);
        if (hit.kind === 'model' && bar.selectModel && this.propsManager()) { bar.selectModel(hit.propId); return true; }
        return false;
    }

    /**
     * A Select or Look click, settled when the button comes up without the
     * pointer having travelled (a drag from the same press turned the view or
     * drew a box, and must change neither the selection nor the group).
     * `across.from` is the group whose tool held the map ('build', 'terrain',
     * 'models'); `across.hit` what the press already found, else it is looked
     * for now. Water is selected with the Look panel on it; a building or a
     * model turns the bar to its group; in Look, bare ground or nothing lets
     * the sheet in hand go. True when the click was taken.
     */
    settleSelectClick(across, clientX, clientY) {
        const hit = across.hit || this.selectHitAt(clientX, clientY);
        if (across.from === 'build') return hit?.kind === 'water' && this.selectAcrossGroups(hit, clientX, clientY);
        if (across.from === 'models') return !!hit && hit.kind !== 'model' && this.selectAcrossGroups(hit, clientX, clientY);
        const terrain = this.terrainManager();
        if (!terrain) return false;
        if (hit?.kind === 'water') { terrain.selectWater(hit.water); return true; }
        if (this.selectAcrossGroups(hit, clientX, clientY)) return true;
        if (terrain.selectedWater && (!hit || hit.kind === 'ground')) { terrain.selectWater(null); return true; }
        return false;
    }

    /** The selected sheet outlined at its level (the Look panel edits it); null takes the outline away. */
    showWaterSelection(key) {
        if (this.waterSelection) { this.waterSelection.parent?.remove(this.waterSelection); this.waterSelection.geometry.dispose(); this.waterSelection.material.dispose(); this.waterSelection = null; }
        if (!key || !this.mapScene || typeof THREE === 'undefined') return;
        const mesh = (this.mapScene._waterMeshes || []).find(m => { const r = m.userData.water; return r && r.x0 === key.x0 && r.y0 === key.y0 && r.x1 === key.x1 && r.y1 === key.y1 && Math.abs(r.level - key.level) < 1e-6; });
        const y = mesh ? new THREE.Vector3(0, key.level, 0).applyMatrix4(mesh.matrixWorld).y + 0.08 : key.level + 0.08;
        // The sheet's own shoreline when it has one (its geometry's edge), else its box.
        const geometry = mesh ? new THREE.EdgesGeometry(mesh.geometry, 1) : new THREE.EdgesGeometry(new THREE.PlaneGeometry(key.x1 - key.x0 + 1, key.y1 - key.y0 + 1).rotateX(-Math.PI / 2).translate((key.x0 + key.x1 + 1) / 2, 0, (key.y0 + key.y1 + 1) / 2));
        const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95 }));
        if (mesh) line.applyMatrix4(mesh.matrixWorld); else line.position.y = y;
        line.renderOrder = 999;
        line.userData.__reactorOverlay = true;
        this.mapScene.scene().add(line);
        this.waterSelection = line;
        this._lastActiveAt = performance.now();
    }

    /** A sheet's look set on its material at once, while a slider moves (the rebuild follows on release). */
    restyleWater(key, look) {
        const mesh = key && (this.mapScene?._waterMeshes || []).find(m => { const r = m.userData.water; return r && r.x0 === key.x0 && r.y0 === key.y0 && r.x1 === key.x1 && r.y1 === key.y1 && Math.abs(r.level - key.level) < 1e-6; });
        if (!mesh || !mesh.material || typeof Reactor3D === 'undefined' || !Reactor3D.applyWaterLook) return;
        // The runtime's own reading of a look, as the game lays the sheet: the view shows what the game will.
        if (!Reactor3D.applyWaterLook(mesh.material, look)) return;
        this._lastActiveAt = performance.now();
        this.requestRender?.();
    }

    /** A translucent ghost of a sheet: the hollow's own surface when the region has a mask (or the runtime can shape it), else its box. */
    showWaterGhost(rect, level = rect.level) {
        if (!this.mapScene || !rect) return;
        if (!this.waterGhost) {
            this.waterGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: 0.45, depthWrite: false }));
            this.waterGhost.renderOrder = 998;
            this.mapScene.scene().add(this.waterGhost);
        }
        const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
        const mapData = this.currentMap();
        if (mapData && typeof Reactor3D !== 'undefined' && Reactor3D.waterGeometry) {
            const old = this.waterGhost.geometry;
            this.waterGhost.geometry = Reactor3D.waterGeometry({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1, level: level + 0.04, mask: rect.mask }, mapData);
            if (old) old.dispose();
            this.waterGhost.scale.set(1, 1, 1);
            this.waterGhost.position.set(0, 0, 0);
        } else {
            this.waterGhost.scale.set(w, 1, h);
            this.waterGhost.position.set(rect.x0 + w / 2, level, rect.y0 + h / 2);
        }
        this.waterGhost.visible = true;
        this._lastActiveAt = performance.now();
    }

    hideWaterGhost() {
        if (this.waterGhost) this.waterGhost.visible = false;
        this._lastActiveAt = performance.now();
    }

    /**
     * The River tool's course: a line over the ground through the points
     * clicked (the last one following the pointer), a dot at each, and the
     * channel's width either side as a fainter band.
     */
    showRiverGhost(points, width = 3) {
        if (!this.mapScene || !Array.isArray(points) || !points.length) { this.hideRiverGhost(); return; }
        const mapData = this.currentMap();
        const height = (x, z) => mapData && typeof Reactor3D !== 'undefined' && Reactor3D.groundHeightAt
            ? Reactor3D.groundHeightAt(mapData, Math.max(0, Math.min(mapData.width - 1e-3, x)), Math.max(0, Math.min(mapData.height - 1e-3, z)), Infinity) + 0.12 : 0.12;
        if (!this.riverGhost) {
            const group = new THREE.Group();
            const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4fb3ff, depthTest: false, transparent: true }));
            const band = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
            const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffffff, size: 7, sizeAttenuation: false, depthTest: false }));
            for (const part of [band, line, dots]) { part.renderOrder = 999; part.frustumCulled = false; group.add(part); }
            this.riverGhost = { group, line, band, dots };
            this.mapScene.scene().add(group);
        }
        const ghost = this.riverGhost;
        // The line, every half tile so it lies on the ground between the points.
        const along = [], band = [], index = [];
        for (let i = 0; i < points.length; i++) {
            const [ax, az] = points[i], [bx, bz] = points[Math.min(points.length - 1, i + 1)];
            const steps = i + 1 < points.length ? Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) * 2)) : 1;
            for (let k = 0; k < steps; k++) {
                const t = k / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
                along.push(x, height(x, z), z);
                if (i + 1 < points.length) {
                    const run = Math.hypot(bx - ax, bz - az) || 1, px = -(bz - az) / run * width / 2, pz = (bx - ax) / run * width / 2;
                    const base = band.length / 3;
                    band.push(x + px, height(x + px, z + pz), z + pz, x - px, height(x - px, z - pz), z - pz);
                    if (k > 0 || i > 0) index.push(base - 2, base - 1, base, base - 1, base + 1, base);
                }
            }
        }
        ghost.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(along, 3));
        ghost.line.geometry.computeBoundingSphere();
        ghost.band.geometry.setAttribute('position', new THREE.Float32BufferAttribute(band, 3));
        ghost.band.geometry.setIndex(index);
        ghost.dots.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(([x, z]) => [x, height(x, z) + 0.05, z]), 3));
        ghost.group.visible = true;
        this._lastActiveAt = performance.now();
    }

    hideRiverGhost() {
        if (this.riverGhost) this.riverGhost.group.visible = false;
        this._lastActiveAt = performance.now();
    }

    /** The outward normal of one triangle of a mesh whose geometry is in world units. */
    triangleNormal(mesh, triangle) {
        const position = mesh?.geometry?.attributes?.position;
        if (!position || !Number.isInteger(triangle)) return null;
        const index = mesh.geometry.index ? mesh.geometry.index.array : null;
        const corner = k => index ? index[triangle * 3 + k] : triangle * 3 + k;
        const a = new THREE.Vector3().fromBufferAttribute(position, corner(0));
        const b = new THREE.Vector3().fromBufferAttribute(position, corner(1));
        const c = new THREE.Vector3().fromBufferAttribute(position, corner(2));
        return b.sub(a).cross(c.sub(a)).normalize();
    }

    /**
     * Where a piece would go for the pointer: the cell and level under it.
     * The top of a piece means the level above it (a brick on a brick); the
     * side of a piece means the cell beyond that side at the same level (a
     * brick beside a brick); the ground means level 0. The panel's level
     * raises that floor for building in the air. For `erase`, the piece
     * pointed at itself.
     */
    pieceTargetAt(clientX, clientY, options = {}) {
        const mapData = this.currentMap();
        if (!mapData || !this.mapScene || !this.camera || !this.canvas || typeof Reactor3D === 'undefined') return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        ), this.camera);
        const hit = this.raycastMapMeshes();
        let point = hit ? hit.point : null;
        if (!point) {
            const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            point = this._raycaster.ray.intersectPlane(ground, new THREE.Vector3());
        }
        if (!point) return null;
        const manager = this.pieceManager();
        const erase = !!options.erase || manager?.mode === 'erase';
        // A door's leaf hangs in the middle of its cell: the cell under the hit is the door's, whichever face is struck.
        const doorId = hit && hit.object?.userData?.rrDoor || 0;
        const onPiece = !!(hit && hit.object?.userData?.pieces) && !doorId;
        const normal = onPiece ? this.triangleNormal(hit.object, hit.triangle) : null;
        const top = !!(normal && normal.y > 0.5);
        const side = !!(normal && Math.abs(normal.y) <= 0.5);
        let x = Math.floor(point.x), y = Math.floor(point.z);
        // A side face is on the cell's edge: placing goes to the cell beyond
        // it, erasing and selecting to the cell the face belongs to.
        if (side) { const into = erase ? -0.5 : 0.5; x = Math.floor(point.x + normal.x * into); y = Math.floor(point.z + normal.z * into); }
        x = Math.max(0, Math.min(mapData.width - 1, x));
        y = Math.max(0, Math.min(mapData.height - 1, y));
        const base = Reactor3D.pieceBaseAt(mapData, x, y);
        const rel = point.y - base;
        let z;
        if (erase) z = top ? Math.max(0, Math.round(rel) - 1) : Math.max(0, Math.floor(rel + 0.02));
        else z = Math.max(manager?.level || 0, top ? Math.round(rel) : Math.max(0, Math.floor(rel + 0.02)));
        const max = RRMapElevation?.PIECE_MAX_LEVEL ?? 240;
        // The face pointed at, for a screen on a wall: which way it looks and whose cell it is.
        const sideName = side ? (Math.abs(normal.x) >= Math.abs(normal.z) ? (normal.x > 0 ? 'east' : 'west') : (normal.z > 0 ? 'south' : 'north')) : null;
        const faceCell = side ? { x: Math.max(0, Math.min(mapData.width - 1, Math.floor(point.x - normal.x * 0.5))), y: Math.max(0, Math.min(mapData.height - 1, Math.floor(point.z - normal.z * 0.5))) } : null;
        const target = { x, y, z: Math.min(max, z), side: sideName, faceCell, height: Math.max(0, rel), top, point: { x: point.x, z: point.z } };
        if (doorId) target.door = doorId;
        return target;
    }

    /**
     * The plane a placing stroke stays on: the level of its first piece,
     * at that cell's ground. A drag then lays a run at one level, however
     * the pieces it has just laid would catch the pointer. Erasing keeps
     * following the pieces themselves.
     */
    pieceStrokePlane(target) {
        const mapData = this.currentMap();
        const manager = this.pieceManager();
        if (!mapData || !target || typeof Reactor3D === 'undefined') return null;
        if (manager?.mode === 'erase') return { erase: true };
        return { z: target.z, planeY: Reactor3D.pieceBaseAt(mapData, target.x, target.y) + target.z };
    }

    /** Where a stroke in progress lands under the pointer: on its plane, at its level. */
    pieceStrokeTargetAt(clientX, clientY) {
        const stroke = this.pointer?.pieceStroke;
        if (!stroke || stroke.erase) return this.pieceTargetAt(clientX, clientY);
        const mapData = this.currentMap();
        if (!mapData || !this.camera || !this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        ), this.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -stroke.planeY);
        const point = this._raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        if (!point) return null;
        return {
            x: Math.max(0, Math.min(mapData.width - 1, Math.floor(point.x))),
            y: Math.max(0, Math.min(mapData.height - 1, Math.floor(point.z))),
            z: stroke.z
        };
    }

    /** Where the pointer's ray meets a level plane (world x, y = map cell axes), or null. */
    planePointAt(clientX, clientY, planeY = 0) {
        if (!this.camera || !this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
        const point = this._raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), new THREE.Vector3());
        return point ? { x: point.x, y: point.z } : null;
    }

    /** The box being dragged on the ground in select mode, translucent. */
    showSelectionBand(a, b, planeY = 0) {
        if (!this.mapScene) return;
        if (!this.selectionBand) {
            this.selectionBand = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.25, depthWrite: false }));
            this.selectionBand.renderOrder = 997;
            this.mapScene.scene().add(this.selectionBand);
        }
        const x0 = Math.floor(Math.min(a.x, b.x)), y0 = Math.floor(Math.min(a.y, b.y)), x1 = Math.floor(Math.max(a.x, b.x)), y1 = Math.floor(Math.max(a.y, b.y));
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        this.selectionBand.scale.set(w, 1, h);
        this.selectionBand.position.set(x0 + w / 2, planeY + 0.05, y0 + h / 2);
        this.selectionBand.visible = true;
        this._lastActiveAt = performance.now();
        return { x0, y0, x1, y1 };
    }

    hideSelectionBand() { if (this.selectionBand) this.selectionBand.visible = false; }

    /** A press on the selected shape's handle, if any. */
    grabShapeGizmo(clientX, clientY) {
        const manager = this.pieceManager(), piece = manager && manager.selectedPiece();
        if (!piece || !this.shapeGizmo || !manager.isShape(piece.kind) || typeof RRShapeGizmo3D === 'undefined') return null;
        return RRShapeGizmo3D.grab(this.shapeGizmo, this.camera, this.canvas.getBoundingClientRect(), clientX, clientY, manager.gizmoMode, this.shapeView(piece));
    }

    /** The selected shape as the handles see it: its corners in the world, its size and turns. */
    shapeView(piece) {
        const mapData = this.currentMap();
        const at = Reactor3D.shapePlacer(piece, Reactor3D.pieceBaseAt(mapData, piece.x, piece.y));
        const corners = [];
        for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) corners.push(at(u, y, v));
        return { corners, size: piece.size || [1, 1, 1], angle: piece.angle || 0, tilt: piece.tilt || 0, roll: piece.roll || 0 };
    }

    /** A handle drag applied to the selected shape as the pointer moves. */
    dragShapeGizmo(drag, clientX, clientY) {
        const manager = this.pieceManager(), piece = manager.selectedPiece();
        if (!piece) return false;
        const { held, start } = drag;
        let patch = null;
        // Drags snap finely (a twentieth of a tile): quarter steps read as the shape jumping.
        const snap = n => Math.round(n * 20) / 20;
        const ox = (start.offset || [0, 0])[0], oy = (start.offset || [0, 0])[1];
        if (held.mode === 'move') {
            const t = snap(held.travel(clientX, clientY));
            if (held.axis === 'x') return manager.moveSelectedPieceTo(start.x + 0.5 + ox + t, start.y + 0.5 + oy, undefined, false);
            if (held.axis === 'z') return manager.moveSelectedPieceTo(start.x + 0.5 + ox, start.y + 0.5 + oy + t, undefined, false);
            patch = { z: Math.max(0, snap(start.z + t)) };
        } else if (held.mode === 'turn') {
            const deg = RRShapeGizmo3D.turn(this.shapeGizmo, held, this.camera, this.canvas.getBoundingClientRect(), clientX, clientY);
            if (deg === null) return false;
            patch = held.axis === 'yaw' ? { angle: (360 - deg) % 360 } : held.axis === 'pitch' ? { tilt: deg } : { roll: deg };
        } else {
            const t = held.travel(clientX, clientY);
            const i = held.axis === 'u' ? 0 : held.axis === 'y' ? 1 : 2;
            const size = (start.size || [1, 1, 1]).slice();
            const was = size[i];
            size[i] = Math.max(0.25, Math.min(60, snap(was + t)));
            patch = { size };
            // A shape grows about its middle across and along (upward from its foot):
            // the middle moves half the growth toward the grabbed face, so the far
            // face stays put and the grabbed one stays under the pointer.
            if (held.axis !== 'y' && held.dir) {
                const half = (size[i] - was) / 2;
                const map = this.currentMap();
                const cx = start.x + 0.5 + ox + held.dir.x * half, cy = start.y + 0.5 + oy + held.dir.z * half;
                const ax = Math.max(0, Math.min(map.width - 1, Math.floor(cx))), ay = Math.max(0, Math.min(map.height - 1, Math.floor(cy)));
                Object.assign(patch, { x: ax, y: ay, offset: [Math.round((cx - ax - 0.5) * 100) / 100, Math.round((cy - ay - 0.5) * 100) / 100] });
            }
        }
        return manager.updateSelected(patch, false);
    }

    /** The selected piece outlined, and a shape's handles on it; nothing when nothing is selected. */
    refreshSelection() {
        const manager = this.pieceManager(), mapData = this.currentMap();
        const pieces = manager && manager.mode === 'select' && mapData ? manager.selectionPieces() : [];
        const piece = pieces.length === 1 ? pieces[0] : null;
        if (!this.mapScene || typeof THREE === 'undefined') return;
        if (pieces.length > 1) {
            // Many: every one outlined, no handles.
            const all = [];
            for (const one of pieces) {
                let c;
                if (manager.isShape(one.kind)) c = this.shapeView(one).corners;
                else { const base = Reactor3D.pieceBaseAt(mapData, one.x, one.y) + one.z, h = Reactor3D.pieceHeight(one.kind); c = []; for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) c.push([one.x + u, base + y * h, one.y + v]); }
                for (const [a, b] of [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]]) all.push(...c[a], ...c[b]);
            }
            if (!this.selectionOutline) {
                this.selectionOutline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95 }));
                this.selectionOutline.renderOrder = 999;
                this.mapScene.scene().add(this.selectionOutline);
            }
            this.selectionOutline.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(all), 3));
            this.selectionOutline.geometry.computeBoundingSphere();
            this.selectionOutline.visible = true;
            if (this.shapeGizmo) RRShapeGizmo3D.sync(this.shapeGizmo, null, null);
            return;
        }
        if (!piece) {
            if (this.selectionOutline) this.selectionOutline.visible = false;
            if (this.shapeGizmo) RRShapeGizmo3D.sync(this.shapeGizmo, null, null);
            return;
        }
        const shape = manager.isShape(piece.kind);
        // The outline: the twelve edges of the piece's box, turned as it is.
        let corners;
        if (shape) corners = this.shapeView(piece).corners;
        else {
            const base = Reactor3D.pieceBaseAt(mapData, piece.x, piece.y) + piece.z, h = Reactor3D.pieceHeight(piece.kind);
            // Where it is drawn: a ladder's level shifted over, narrowed across its cell, its top cut short.
            const [ox, oy] = piece.offset || [0, 0];
            const [ax, ay] = Reactor3D.stairAxis(piece.rot || 0), across = piece.kind === 'ladder' ? 1 - (piece.span || 1) : 0;
            const inX = Math.abs(ay) * across / 2, inY = Math.abs(ax) * across / 2, top = h * (piece.rise || 1);
            corners = [];
            for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) corners.push([piece.x + ox + (u ? 1 - inX : inX), base + y * top, piece.y + oy + (v ? 1 - inY : inY)]);
        }
        const edges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
        const positions = new Float32Array(edges.length * 6);
        edges.forEach(([a, b], i) => { positions.set(corners[a], i * 6); positions.set(corners[b], i * 6 + 3); });
        if (!this.selectionOutline) {
            this.selectionOutline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95 }));
            this.selectionOutline.renderOrder = 999;
            this.mapScene.scene().add(this.selectionOutline);
        }
        this.selectionOutline.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.selectionOutline.geometry.computeBoundingSphere();
        this.selectionOutline.visible = true;
        if (shape && typeof RRShapeGizmo3D !== 'undefined' && typeof RRAxisArrows3D !== 'undefined' && typeof RRPoseRings3D !== 'undefined') {
            const reach = Math.max(...(piece.size || [1, 1, 1]));
            if (!RRShapeGizmo3D.fits(this.shapeGizmo, reach)) { RRShapeGizmo3D.dispose(this.shapeGizmo); this.shapeGizmo = RRShapeGizmo3D.create(THREE, this.mapScene.scene(), reach); }
            RRShapeGizmo3D.sync(this.shapeGizmo, this.shapeView(piece), manager.gizmoMode);
        } else if (this.shapeGizmo) RRShapeGizmo3D.sync(this.shapeGizmo, null, null);
        this._lastActiveAt = performance.now();
    }

    /** The chosen piece, translucent, where it would land. */
    updatePieceGhost(target) {
        const manager = this.pieceManager();
        const mapData = this.currentMap();
        if (!this.canEditPieces() || !target || !this.mapScene || !manager || !mapData || manager.mode === 'select') { this.hidePieceGhost(); return; }
        const erase = manager.mode === 'erase';
        const bounds = manager.mode === 'move' ? manager.selectedGroupBounds() : null;
        const stamp = manager.mode === 'stamp' ? manager.structurePlan() : bounds ? { size: [bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1] } : null;
        if (manager.mode === 'move' && !bounds) { this.hidePieceGhost(); return; }
        const turn = stamp && !bounds ? (manager.rot || 0) : 0;
        // A door hangs across the doorway under the pointer: its ghost is the leaves' slab where it will hang.
        const door = !stamp && !erase && manager.kind === 'door' ? manager.pieceFor(target) : null;
        const doorKey = door ? ':door:' + [door.x - target.x, door.y - target.y, door.rot, door.width, door.style].join(',') : '';
        // A building turned or grown while picked up has a new footprint: its slab is made again.
        const key = doorKey + (stamp ? (bounds ? 'move:' + manager.selectedGroup + ':' + stamp.size.join('x') : 'stamp:' + manager.structure + ':' + turn) : (erase ? 'erase' : manager.kind) + ':' + (manager.kind === 'ladder' && manager.ladderRotFor ? manager.ladderRotFor(target) ?? manager.rot : manager.rot) + ':' + JSON.stringify([manager.sizeFor ? manager.sizeFor(manager.kind) : null, manager.params && manager.params[manager.kind], manager.kind === 'stair' ? [manager.stairSteps, manager.stairWidth] : manager.kind === 'ladder' ? [manager.ladderHeight, manager.ladderWidth] : manager.kind === 'rock' ? [manager.rockVary && manager.rockSeed, manager.rockCap, manager.rockTint] : null]));
        if (!this.pieceGhost || this.pieceGhost.userData.key !== key) {
            this.hidePieceGhost(true);
            // A plan's ghost is the building itself, translucent; a selected
            // building being moved shows its footprint as a slab.
            const silhouette = stamp && !bounds ? manager.ghostGeometryFor(stamp, turn) : null;
            const geometry = silhouette
                || (door ? Reactor3D.pieceGeometry([{ id: 0, kind: 'trim', material: '', x: door.x - target.x, y: door.y - target.y, z: 0, rot: door.rot,
                    boxes: [{ box: [0, 0, 0.42, door.width || 1, Reactor3D.doorLeafHeight ? Reactor3D.doorLeafHeight(door) : 3.6, 0.58] }] }], null) : null)
                || (stamp
                    ? new THREE.BoxGeometry(stamp.size[0], 0.3, stamp.size[1]).translate(stamp.size[0] / 2, 0.15, stamp.size[1] / 2)
                    : Reactor3D.pieceGeometry(erase ? [{ id: 0, material: '', kind: 'block', x: 0, y: 0, z: 0, rot: 0 }]
                        // A stair run shows whole: every step, as wide as it will be laid.
                        : (manager.kind === 'stair' && manager.stairRun ? manager.stairRun(Object.assign({ id: 0, material: '' }, manager.pieceFor({ x: 0, y: 0, z: 0 })))
                            : manager.kind === 'ladder' && manager.ladderRun ? manager.ladderRun(Object.assign({ id: 0, material: '' }, manager.pieceFor({ x: 0, y: 0, z: 0 }), { rot: manager.ladderRotFor(target) ?? manager.rot }))
                            : [Object.assign({ id: 0, material: '' }, manager.pieceFor({ x: 0, y: 0, z: 0 }))]), null));
            const material = new THREE.MeshBasicMaterial({ color: erase ? 0xff6b6b : bounds ? 0x7dff9a : stamp ? 0xffd166 : 0x7fd8ff, transparent: true, opacity: erase ? 0.35 : 0.5, depthWrite: false });
            this.pieceGhost = new THREE.Mesh(geometry, material);
            this.pieceGhost.renderOrder = 998;
            this.pieceGhost.userData.key = key;
            this.mapScene.scene().add(this.pieceGhost);
        }
        const base = Reactor3D.pieceBaseAt(mapData, target.x, target.y);
        if (stamp) {
            // A quarter turn swaps the footprint's sides.
            const [W, H] = turn % 2 ? [stamp.size[1], stamp.size[0]] : stamp.size;
            const x = Math.max(0, Math.min(mapData.width - W, target.x)), y = Math.max(0, Math.min(mapData.height - H, target.y));
            this.pieceGhost.position.set(x, base, y);
        } else {
            // A shape stands where the pointer is, to the quarter tile.
            const off = manager.shapeOffsetFor ? manager.shapeOffsetFor(target) : null;
            this.pieceGhost.position.set(target.x + (off ? off[0] : 0), base + target.z, target.y + (off ? off[1] : 0));
        }
        this.pieceGhost.visible = true;
        this._lastGhostTarget = target;
        this._lastActiveAt = performance.now();
    }

    /** The panel changed piece, turn or mode: the ghost follows where it stood. */
    refreshPieceGhost() {
        if (this._lastGhostTarget) this.updatePieceGhost(this._lastGhostTarget);
    }

    hidePieceGhost(dispose = false) {
        if (!this.pieceGhost) return;
        if (dispose) {
            this.pieceGhost.parent?.remove(this.pieceGhost);
            this.pieceGhost.geometry.dispose();
            this.pieceGhost.material.dispose();
            this.pieceGhost = null;
        } else {
            this.pieceGhost.visible = false;
        }
        this._lastActiveAt = performance.now();
    }

    /** The brush ring's band: its bright line this wide, inside a dark edge this wide, in tiles. */
    static TERRAIN_RING = { bright: 0.14, dark: 0.1, segments: 64 };

    buildTerrainRing() {
        if (!this.mapScene || this.terrainRing) return;
        // A flat band laid on the ground, light inside a dark edge: it reads on grass, sand, snow and paint alike,
        // where a one-pixel line of one color was lost on ground near its own color.
        const segments = MapEditor3D.TERRAIN_RING.segments, rings = 4, count = (segments + 1) * rings;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        const colors = new Float32Array(count * 3), index = [];
        for (let i = 0; i <= segments; i++) {
            // Two points for the light line, two for the dark edge (the middle ring twice: no blend between them).
            colors.set([1, 0.95, 0.55, 1, 0.95, 0.55, 0.03, 0.05, 0.09, 0.03, 0.05, 0.09], i * 12);
            if (i === segments) break;
            const a = i * 4, b = a + 4;
            index.push(a, b, a + 1, a + 1, b, b + 1, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(index);
        this.terrainRing = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide
        }));
        this.terrainRing.renderOrder = 999;
        this.terrainRing.visible = false;
        this.mapScene.scene().add(this.terrainRing);
    }

    updateTerrainRing(point) {
        const mapData = this.currentMap();
        if (!this.canEditTerrain() || !point || !mapData) {
            if (this.terrainRing) this.terrainRing.visible = false;
            return;
        }
        if (!this.terrainRing) this.buildTerrainRing();
        if (!this.terrainRing) return;
        const radius = this.terrainManager()?.radius || 3;
        const positions = this.terrainRing.geometry.attributes.position;
        const band = MapEditor3D.TERRAIN_RING, segments = band.segments;
        const cx = point.x + 0.5, cz = point.y + 0.5;
        // Four rings of points: the light line between the first two, the dark edge between the last two.
        const radii = [radius - band.bright, radius, radius, radius + band.dark];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
            const y = Reactor3D.groundHeightAt(mapData, cx + cos * radius, cz + sin * radius) + 0.06;
            for (let k = 0; k < 4; k++) positions.setXYZ(i * 4 + k, cx + cos * radii[k], y, cz + sin * radii[k]);
        }
        positions.needsUpdate = true;
        this.terrainRing.geometry.computeBoundingSphere();
        this.terrainRing.visible = true;
        this._lastActiveAt = performance.now();
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

    /** How far from the outlined surface an event has to stand before the outline shows where: more than a step. */
    static get FEET_GAP() { return 0.75; }

    /** Move the outline onto a cell, or hide it when the cursor is off the map. */
    updateHoverCell(tile) {
        // The cursor left the map: Battle Setup's ghost leaves with it.
        if (!tile && typeof window !== 'undefined' && window.RRBattleSetup) window.RRBattleSetup.hover3D(this, null);
        const feet = this.hoverFeet;
        if (feet) feet.visible = false;
        if (!this.hoverCell) return;
        const mapData = this.currentMap();
        if (!tile || !mapData) {
            this.hoverCell.visible = false;
            return;
        }
        const { width, height } = this.brushSize();
        this.hoverCell.scale.set(width, 1, height);
        this.hoverCell.position.set(tile.x, 0.03, tile.y);
        // Each corner on the ground under it: at the tile's own elevation
        // the outline floated over a hollow (a pond, a pit) and read as a
        // cell on the far side of it. Raised by the pick's `lift`, it lies
        // on the surface the pointer met (a path's slab, a floor, a rock)
        // and so under the pointer: drawn on the ground below that surface
        // it stood somewhere else on the screen.
        const base = Reactor3D.elevationAt(mapData, tile.x, tile.y) + (Number.isFinite(tile.lift) ? tile.lift : 0);
        const terrain = Reactor3D.terrainHeightAt ? (wx, wz) => Reactor3D.terrainHeightAt(mapData, wx, wz) || 0 : () => 0;
        // Water lies flat over a bed that does not: its outline is level, at the surface.
        const level = Number.isFinite(tile.level) ? tile.level : null;
        const position = this.hoverCell.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const cx = tile.x + position.getX(i) * width, cz = tile.y + position.getZ(i) * height;
            position.setY(i, level !== null ? level : base + terrain(Math.min(mapData.width, cx), Math.min(mapData.height, cz)));
        }
        position.needsUpdate = true;
        this.hoverCell.geometry.computeBoundingSphere();
        this.hoverCell.visible = true;
        // Event mode: an event placed on this tile stands by the game's
        // height rule, which is not always the surface outlined (the floor
        // inside under a roof marked at the pointer, the ground under a
        // deck, the top of the wall whose foot is pointed at, the bed under
        // water). The click would then put it somewhere the outline is not,
        // so the place is shown: the tile's square there, joined to the
        // outline by a line.
        if (!feet || width !== 1 || height !== 1 || !this.canSelectEvents()) return;
        const cx = tile.x + 0.5, cz = tile.y + 0.5;
        const shown = level !== null ? level : base + terrain(cx, cz), stand = MapEditor3D.standAt(mapData, cx, cz);
        if (!(Math.abs(stand - shown) > MapEditor3D.FEET_GAP)) return;
        // In the outline's own frame: the tile's corner is its origin, and heights are the world's.
        const at = feet.geometry.attributes.position;
        at.setXYZ(0, 0, stand, 0); at.setXYZ(1, 1, stand, 0);
        at.setXYZ(2, 1, stand, 0); at.setXYZ(3, 1, stand, 1);
        at.setXYZ(4, 1, stand, 1); at.setXYZ(5, 0, stand, 1);
        at.setXYZ(6, 0, stand, 1); at.setXYZ(7, 0, stand, 0);
        at.setXYZ(8, 0.5, shown, 0.5); at.setXYZ(9, 0.5, stand, 0.5);
        at.needsUpdate = true;
        feet.visible = true;
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
        for (const event of MapEditor3D.previewEvents(mapData)) {
            const name = event?.pages?.[0]?.image?.characterName;
            if (name) names.add(name);
            const row = typeof RRVehicles !== 'undefined' && RRVehicles.vehicleOf(event);
            const sheet = row && window.reactor?.databaseManager?.data?.vehicles?.[row.type]?.sheet;
            if (sheet?.characterName) names.add(sheet.characterName);
            const previewIndex = MapEditor3D.previewPageIndex(mapData, event);
            const previewName = previewIndex !== null ? event.pages[previewIndex]?.image?.characterName : null;
            if (previewName) names.add(previewName);
            // A unit that stands as its record's character sheet.
            const look = previewIndex !== null ? MapEditor3D.unitLook(mapData, event) : null;
            if (look && look.kind === 'character' && look.characterName) names.add(look.characterName);
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
    /**
     * How far from an event's own tile it was taken hold of: a grab on the marker in the middle of
     * a 3 by 3 is one tile right and down of the event's tile.
     */
    static eventGrabOffset(event, tile, footprint = [1, 1], origin = [0, 0]) {
        const [w, h] = footprint, dx = tile.x - event.x, dy = tile.y - event.y;
        // Taken by its marker with the ground behind it under the pointer (a tall sprite's head): the event's own tile.
        if (dx < origin[0] || dy < origin[1] || dx >= origin[0] + w || dy >= origin[1] + h) return [0, 0];
        return [dx, dy];
    }

    /** Where an event's box has its middle, from the middle of the event's own tile: `[x, 0, z]` in tiles. */
    static eventBoxShift(footprint = [1, 1], origin = [0, 0]) {
        return [origin[0] + (footprint[0] - 1) / 2, 0, origin[1] + (footprint[1] - 1) / 2];
    }

    /**
     * The page of an event this view draws at real size: the one Preview
     * Event chose, else, for a battle unit, the page it is a unit on. Null
     * for an event shown by its marker alone.
     */
    static previewEvents(map) {
        return typeof EventManager !== 'undefined' && EventManager.mapPreviewEvents
            ? EventManager.mapPreviewEvents(map) : map?.events || [];
    }

    static previewPageIndex(mapData, event) {
        if (event?._rrDatabaseVehicle) return 0;
        if (typeof EventManager !== 'undefined' && typeof EventManager.previewPage === 'function') return EventManager.previewPage(mapData, event);
        const previews = mapData?.reactor3d?.eventPreviews;
        const page = previews ? previews[String(event?.id)] : undefined;
        return Number.isInteger(page) && event?.pages?.[page] ? page : null;
    }

    /** The model a previewed page stands as: its own, else (a battle unit with none) the one the Database gives its record, as in the game. */
    static previewModelSpec(mapData, event, pageIndex) {
        const own = Reactor3D.eventModelSpec ? Reactor3D.eventModelSpec(mapData, event.id, pageIndex) : null;
        if (own) return own;
        if (typeof RRVehicles !== 'undefined' && !event.pages?.[pageIndex]?.image?.characterName && !(event.pages?.[pageIndex]?.image?.tileId > 0)) {
            const vehicle = RRVehicles.modelOf(event, typeof window !== 'undefined' ? window.reactor?.databaseManager?.data?.vehicles : null);
            if (vehicle) return Reactor3D.normalizeModelSpec(vehicle);
        }
        const look = MapEditor3D.unitLook(mapData, event);
        return look && look.kind === 'model' && look.page === pageIndex && Reactor3D.normalizeModelSpec ? Reactor3D.normalizeModelSpec(look.spec) : null;
    }

    /**
     * A previewed page bound to a 3D model stands as the model itself, placed
     * and scaled the way the game places it. Loads asynchronously and joins
     * the event group only if this build is still the current one.
     */
    previewEventModel(event, page, pageIndex, mapData, request) {
        if (typeof RREventPreviewModels === 'undefined' || !Reactor3D.eventModelSpec) return;
        const spec = MapEditor3D.previewModelSpec(mapData, event, pageIndex);
        if (!spec) return;
        const group = this.eventGroup;
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        RREventPreviewModels.templateFor(project, spec, this).then(template => {
            if (!template || !this.rebuildIsCurrent(request) || this.eventGroup !== group) return;
            const vehicle = typeof RRVehicles !== 'undefined' ? RRVehicles.vehicleOf(event) : null;
            const direction = vehicle ? RRVehicles.dir8OfYaw(vehicle.yaw) : page?.image?.direction || 2;
            const object = RREventPreviewModels.instance(template, spec, direction);
            // Where the event's box stands: the ground under its tile, the terrain's rise and fall with it.
            const elevation = MapEditor3D.eventFeet(mapData, event);
            const offset = spec.offset || [0, 0, 0];
            // At the middle of a footprint set by hand, where the game stands it (half a tile on for an even size).
            const [middleX, middleZ] = typeof RRMapElevation !== 'undefined' && RRMapElevation.eventMarkerOffset ? RRMapElevation.eventMarkerOffset(mapData, event.id) : [0, 0];
            object.position.set(event.x + 0.5 + middleX + offset[0], elevation + offset[2], event.y + 0.5 + middleZ + offset[1]);
            if (vehicle && Reactor3D.Vehicles?.pose) {
                // Use the model's vehicle forward axis and parked lean, just as the runtime does.
                Reactor3D.Vehicles.pose({ object, spec }, { _rrVehicle: vehicle.type, _rrYaw: vehicle.yaw * Math.PI / 180 }, object, spec, elevation);
            }
            // Where it stands from the middle of the event's tile and its feet: `placeEvent` keeps it there.
            object.userData.seat = [middleX + offset[0], offset[2], middleZ + offset[1]];
            object.userData.event = event;
            object.userData.modelPreview = true;
            group.add(object);
            this.requestRender();
            // The model stands on (and round) the event's box: the box is drawn over it.
            const marker = this.eventMarker(event);
            if (marker) { marker.userData.model = object; marker.userData.modelShown = true; this.eventBoxOnTop(marker.userData.box, true); }
            // Clickable by its box, like a prop: a raycast through a heavy
            // mesh on every hover is what jitters.
            object.userData.pickBox = new THREE.Box3().setFromObject(object);
            // A unit is its model: the stand-in cube inside it is not drawn (it still takes a click), and the ring goes round the model.
            if (marker && marker.userData.unit) {
                if (!marker.material?.map) marker.visible = false;
                this.fitUnitRing(marker, object.userData.pickBox);
            }
            const driver = this.animateModel(object, template, null);
            // An animated preview changes shape each frame; a still one is
            // cached. Marked after the animation is prepared: a rig can
            // replace the meshes, and meshes marked before that never cast.
            if (Reactor3D.Shadows) Reactor3D.Shadows.markCaster(object, this.movesOnItsOwn(template, driver));
            this.playModelEffects(object, template, '', spec);
            // The model card waits for the model: a selection made before the
            // load finished has nothing to show until now.
            if (this.selected?.userData?.event?.id === event.id) this.projectController?.eventModelPanel?.sync?.(event?._rrDatabaseVehicle ? null : event);
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
        if (this.projectController?.mediaSurfacePreviewManager?.authoring) return false;
        return !!this.propsManager()?.active;
    }

    terrainManager() {
        return this.projectController?.terrainManager || window.reactor?.terrainManager || null;
    }

    canEditTerrain() {
        if (this.projectController?.mediaSurfacePreviewManager?.authoring) return false;
        return !!this.terrainManager()?.active;
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
                this.requestRender();
                // Picking tests the box, not the mesh: a raycast through a
                // million triangles on every mouse move is what jitters.
                object.userData.pickBox = new THREE.Box3().setFromObject(object);
                const names = Reactor3D.propAnimationList ? Reactor3D.propAnimationList(prop) : (prop.animation ? [prop.animation] : []);
                const driver = this.animateModel(object, template, names.length ? { names, repeat: !!prop.repeat, speed: prop.animationSpeed ?? 100 } : { speed: prop.animationSpeed ?? 100 });
                // A prop that moves by its own rules is a moving caster too,
                // whether or not its file carries clips; marked once the
                // animation is prepared, since a rig can replace the meshes.
                if (Reactor3D.Shadows) Reactor3D.Shadows.markCaster(object, this.movesOnItsOwn(template, driver));
                this.playModelEffects(object, template, Reactor3D.propEffectList ? Reactor3D.propEffectList(prop) : prop.effect, spec);
                if (this.selectedPropId === prop.id) this.selectProp(prop.id);
            });
        }
    }

    placeProp(object, prop, mapData = this.currentMap()) {
        // The ground under the prop's foot: the cell's elevation plus the terrain's rise there.
        const elevation = Reactor3D.groundHeightAt
            ? Reactor3D.groundHeightAt(mapData, prop.x + 0.5, prop.y + 0.5)
            : Reactor3D.elevationAt(mapData, Math.round(prop.x), Math.round(prop.y));
        object.position.set(prop.x + 0.5, elevation + prop.z, prop.y + 0.5);
        if (object.userData.pickBox) object.userData.pickBox.setFromObject(object);
    }

    /**
     * Run a placed model's animation rules in the viewport, the way the
     * game runs them: continuous rules on their own, and a starting action
     * (a prop's chosen animation) on demand, repeating when asked.
     */
    /**
     * Whether a placed model is a moving shadow caster: one with clips of
     * its own, or rules that run on their own here (always, or at rest).
     * A model whose rules only answer an action stands still in this view,
     * and a still model is a cached caster — making the Tank a moving one
     * put it in the three rows that trade between lights, and its shadow
     * blinked with them.
     */
    movesOnItsOwn(template, driver) {
        if (template && template.userData && template.userData.animated) return true;
        const rules = driver && Array.isArray(driver.rules) ? driver.rules : [];
        return rules.some(rule => rule.trigger === 'always' || rule.trigger === 'idle');
    }

    animateModel(object, template, action) {
        if (typeof RREventPreviewModels === 'undefined' || !RREventPreviewModels.animate) return null;
        const driver = RREventPreviewModels.animate(object, template);
        if (!driver) return null;
        driver.object = object;
        driver.start = this._modelFrame || 0;
        driver.speed = Math.max(1, Math.min(1000, Number(action?.speed) || 100)) / 100;
        driver.previewFrame = driver.start;
        driver.previewRealFrame = driver.start;
        // One name, or a list played in order; Repeat loops the whole list.
        const names = action ? (Array.isArray(action.names) ? action.names.filter(Boolean) : (action.name ? [action.name] : [])) : [];
        driver.sequence = names.length > 1 ? names.slice() : null;
        driver.queue = names.slice(1);
        driver.loop = !!(action && action.repeat);
        driver.action = names.length ? { name: names[0], frame: driver.start, repeat: names.length === 1 && !!action.repeat } : null;
        if (driver.action && Reactor3D.rulesForPlacement) {
            for (const name of names) driver.rules = Reactor3D.rulesForPlacement(driver.rules, name, names.length === 1 && !!action.repeat);
        }
        if (!this.animatedModels) this.animatedModels = [];
        this.animatedModels.push(driver);
        return driver;
    }

    /**
     * Play a placed model's effects in the viewport: the ones that play on
     * their own (Always) and the one a prop was given, looping, at their
     * anchors — a database animation as an overlay over the canvas, a video
     * as a plane in the scene. State-triggered effects wait for the game.
     */
    playModelEffects(object, template, chosen, spec = null) {
        const sidecar = template && template.userData.reactorSidecar;
        if (!sidecar || typeof Reactor3D === 'undefined' || !Reactor3D.readModelEffects) return;
        const chosenNames = new Set((Array.isArray(chosen) ? chosen : (chosen ? [chosen] : [])).map(String));
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject() : this.projectController?.currentProject;
        const animations = window.reactor?.databaseManager?.data?.animations || [];
        const started = new Set();
        for (const effect of Reactor3D.readModelEffects(sidecar, spec)) {
            if (effect.trigger !== 'always' && !chosenNames.has(effect.name)) continue;
            if (started.has(effect.name)) continue;
            started.add(effect.name);
            if (effect.type === 'light' && effect.light) {
                // A light riding the model: resolved at its anchor every
                // frame and handed to the lighting feed with the map's own.
                (this.effectPlays || (this.effectPlays = [])).push({ object, effect, light: true,
                    key: 'fx:' + (object.userData.propId !== undefined ? 'prop' + object.userData.propId : (object.userData.event ? 'ev' + object.userData.event.id : object.uuid)) + ':' + effect.name });
                continue;
            }
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
                layer.setWorld({ renderer: this.renderer, projection: this.camera.projectionMatrix.elements, view: this.camera.matrixWorldInverse.elements, position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] });
            }
            layer.play(record, project?.path || '', { loop: true, transform: { rotate: effect.rotate, scale: effect.scale } });
            (this.effectPlays || (this.effectPlays = [])).push(play);
        }
    }

    _videoEffectPlane(effect, project, extent) {
        if (!project?.path || typeof THREE === 'undefined') return null;
        const path = require('path');
        const isImage = /\.(?:png|jpe?g|webp)$/i.test(effect.video.file);
        const file = path.join(project.path,
            isImage ? path.join('img', 'pictures') : 'movies', effect.video.file);
        const url = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl ? RRAssetFiles.toUrl(file) : 'file://' + file;
        let video = null;
        let texture;
        if (isImage) {
            const image = new Image();
            texture = new THREE.Texture();
            image.onload = () => { texture.image = image; texture.needsUpdate = true; this.requestRender(); };
            image.src = url;
        } else {
            video = document.createElement('video');
            video.muted = true;
            video.loop = effect.video.loop !== false;
            video.playsInline = true;
            video.src = url;
            texture = new THREE.VideoTexture(video);
        }
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
        // A fraction of the model's size, in its units, as a child of it.
        const axes = Reactor3D.scaleAxes ? Reactor3D.scaleAxes(effect.scale) : [1, 1, 1];
        const native = Reactor3D.videoEffectSize(effect, extent);
        plane.scale.set(native[0] * axes[0], native[1] * axes[1], 1);
        plane.userData.video = video;
        plane.userData.texture = texture;
        if (video) video.play().catch(() => {});
        return plane;
    }

    /** Keep every playing effect on its anchor as the camera and models move. */
    updateEffectPlays(now = performance.now()) {
        const plays = (this.effectPlays || []).filter(play => play.object.parent);
        this.effectPlays = plays;
        // The lights placed models carry, rebuilt each frame for the feed.
        const lights = [];
        if (typeof Reactor3D !== 'undefined') Reactor3D._editorEffectLights = lights;
        if (!plays.length || !this.camera || !this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const scratch = this._effectScratch || (this._effectScratch = new THREE.Vector3());
        const frame = Math.floor(now * 0.06);
        let lightSeed = 1000;
        for (const play of plays) {
            if (play.light) {
                const light = Reactor3D.effectLight ? Reactor3D.effectLight(play.object, play.effect, play.key) : null;
                if (light) {
                    const animated = Reactor3D.animateLight(play.effect.light, frame, ++lightSeed, light.radius, light.intensity);
                    light.radius = animated.radius;
                    light.intensity = animated.intensity;
                    light.priorityRadius = animated.priorityRadius;
                    light.priorityIntensity = animated.priorityIntensity;
                    lights.push(light);
                }
                continue;
            }
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
        play.layer.setWorld({ renderer: this.renderer,
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
        if (play.layer.fx.gpu) { mesh.visible = play.layer.drawGpuQuad(play.quad); return; }
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
        const key = `${spec.name}|${spec.ext}|${spec.file}|${spec.variant || ''}|${spec.size}|${spec.scale}|${(spec.stretch || []).join(',')}|${spec.yaw}|${spec.pitch}|${spec.roll}|${manager.fields.direction}`;
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
                    // A copy is a plain material: a variant's color adjustment is put back on it.
                    const faded = materials.map(material => { const copy = material.clone(); copy.transparent = true; copy.opacity = 0.45; copy.depthWrite = false; if (Reactor3D.lookOf && Reactor3D.lookOf(material)) Reactor3D.lookMaterial(copy); return copy; });
                    node.material = Array.isArray(node.material) ? faded : faded[0];
                });
                ghost.userData.__reactorOverlay = true;
                ghost.userData.placementGhost = true;
                this.mapScene.scene().add(ghost);
                this.placementGhost = ghost;
                this.requestRender();
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
            this.disposeModelCopy(this.placementGhost);
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
        this.updateEffectPlays(now);
        const drivers = (this.animatedModels || []).filter(driver => driver.object.parent);
        this.animatedModels = drivers;
        if (!drivers.length || typeof Reactor3D === 'undefined' || !Reactor3D.applyModelAnimation) return;
        const last = this._lastModelTick || now;
        this._lastModelTick = now;
        this._modelFrame = (this._modelFrame || 0) + Math.min(10, (now - last) / (1000 / 60));
        const frame = Math.floor(this._modelFrame);
        for (const driver of drivers) {
            driver.previewFrame = (driver.previewFrame ?? frame) + (frame - (driver.previewRealFrame ?? frame)) * (driver.speed ?? 1);
            driver.previewRealFrame = frame;
            const playFrame = driver.previewFrame;
            let action = driver.action;
            if (action) {
                const rule = driver.rules.find(entry => entry.trigger === 'action' && entry.name === action.name);
                const duration = rule ? Reactor3D.modelRuleDuration(rule, driver.clips) : 0;
                if (rule && playFrame - action.frame >= duration) {
                    if (driver.queue && driver.queue.length) {
                        action = { name: driver.queue.shift(), frame: playFrame, repeat: false };
                    } else if (driver.sequence && driver.loop) {
                        driver.queue = driver.sequence.slice(1);
                        action = { name: driver.sequence[0], frame: playFrame, repeat: false };
                    } else {
                        action = (action.repeat || rule.repeat) ? Object.assign({}, action, { frame: playFrame }) : null;
                    }
                    driver.action = action;
                }
            }
            Reactor3D.applyModelAnimation(driver.binding, driver.rules, {
                frame: playFrame, moving: false, dashing: false, distance: 0, scale: 1, playbackRate: driver.speed,
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
        return [prop.name, prop.ext, prop.file, prop.texture, prop.variant || '',
            (prop.animations || (prop.animation ? [prop.animation] : [])).join(','), prop.repeat ? 1 : 0, prop.animationSpeed ?? 100,
            (prop.effects || (prop.effect ? [prop.effect] : [])).join(',')].join('|');
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
        this.requestRender();
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
                        this.disposeModelCopy(child);
                    }
                    this.eventGroup.parent?.remove(this.eventGroup);
                    this.eventGroup = null;
                }
                await this.buildEvents(mapData);
                this.refreshPassage();
                return;
            }
            // The rings left standing follow Event mode and Battle Setup, whatever is built again below.
            this.syncUnitRings();
            // The diff: only what actually changed is torn down and rebuilt.
            // Deleting one event must not blink every model on the map.
            const fresh = new Map();
            for (const event of MapEditor3D.previewEvents(mapData)) {
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
            // A rebuilt selection is picked up again below, so an undo of a
            // model nudge keeps the event, and its card, in hand.
            const reselect = this.selected?.userData?.event && affected.has(this.selected.userData.event.id)
                ? this.selected.userData.event.id : null;
            if (reselect !== null) this.select(null);
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
                // A sprite, a unit's picture and a name plate each hold a picture drawn for them alone.
                if (!child.userData.modelPreview) MapEditor3D.disposeOwnPictures(child);
                this.disposeModelCopy(child);
                this.eventGroup.remove(child);
            }
            this.pickables = this.pickables.filter(mesh => !doomed.has(mesh));
            this.billboards = this.billboards.filter(mesh => !doomed.has(mesh));
            this.labels = this.labels.filter(mesh => !doomed.has(mesh));
            if (added.length) {
                const sheets = await this.loadCharacterSheets(mapData);
                for (const id of added) {
                    const event = (MapEditor3D.previewEvents(mapData)).find(entry => entry && entry.id === id);
                    if (event) this._buildOneEvent(event, sheets, mapData, this._rebuildGeneration);
                }
                // What was built stands as the view is turned now: pictures and names face the eye, names at the size the distance gives them.
                this.faceCamera();
                this.updateLabelVisibility();
            }
            this._eventSnapshot = fresh;
            if (reselect !== null && fresh.has(reselect)) this.selectEventById(reselect);
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
            this.disposeModelCopy(child);
        }
        this.propGroup.parent?.remove(this.propGroup);
        this.propGroup = null;
    }

    propObject(id) {
        return this.propGroup?.children.find(child => child.userData.propId === id) || null;
    }

    /** The prop under the pointer, by id, or null — by bounding box, which is cheap and enough to pick. */
    /**
     * The prop under the pointer. A box test by default (hover, many times a
     * second); `precise` for a click also asks the model's own triangles, so a
     * tall tree's box does not take a press on the floor beside it.
     */
    propAt(clientX, clientY, precise = false) {
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
            let distance = point.distanceTo(ray.origin);
            if (precise) {
                const hit = this._raycaster.intersectObject(child, true).find(h => !h.object.userData?.__reactorOverlay);
                if (!hit) continue;
                distance = hit.distance;
            }
            if (!best || distance < best.distance) best = { id: child.userData.propId, distance };
        }
        return best ? best.id : null;
    }

    /**
     * A placed piece carried or a handle held ends: one undo step for the whole drag, taken
     * when it started. Called on release, or by an undo mid-drag (the rest of the drag then
     * moves nothing). True when the drag changed something, false when not, null with no drag.
     */
    endPieceDrag(drag = this.pointer, { carryOn = false } = {}) {
        const record = drag && (drag.gizmo || drag.pieceMove);
        if (!record) return null;
        const manager = this.pieceManager();
        const changed = !!((record.changed || record.moved) && record.snapshot);
        if (changed) { manager.undoStack.push(record.snapshot); if (manager.undoStack.length > 50) manager.undoStack.shift(); manager.redoStack.length = 0; manager.syncHistoryButtons?.(); }
        // A turn or a paste while pieces are carried: the carry so far is its own step, and the carry goes on
        // (its next step starts from the next move). A handle drag ends.
        if (carryOn && drag.pieceMove) { record.snapshot = null; record.moved = false; record.split = true; return changed; }
        // Set down, carried pieces take their cells: a wall carried onto a wall replaces it rather than standing inside it.
        const carried = drag.pieceMove && (changed || record.split) ? manager._copiedPieces() : [];
        if (carried.length && manager._takeSlots(this.currentMap(), new Set(carried.map(piece => piece.id)))) {
            const xs = carried.map(piece => piece.x), ys = carried.map(piece => piece.y);
            manager.announce(false, { x0: Math.min(...xs) - 1, y0: Math.min(...ys) - 1, x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1 });
        }
        drag.gizmo = drag.pieceMove = null;
        drag.propHold = true;
        if (this.shapeGizmo && typeof RRShapeGizmo3D !== 'undefined') RRShapeGizmo3D.release(this.shapeGizmo);
        manager?.refreshStatus?.();
        return changed;
    }

    /** Right-click in Build › Select: Copy, Paste here, Duplicate, Delete for the piece under the pointer and the selection. */
    showPieceMenu(clientX, clientY) {
        const manager = this.pieceManager(), t = key => (window.I18n ? window.I18n.t(key) : key), tx = text => (window.I18n ? window.I18n.tText(text) : text);
        const pick = this.pieceTargetAt(clientX, clientY, { erase: true });
        const under = pick ? manager.pieceAtTarget(pick) : null;
        if (under && !manager.selectionIds().includes(under.id)) manager.selectAt(pick);
        const has = manager.selectionIds().length > 0;
        const place = this.pieceTargetAt(clientX, clientY);
        const mod = /Mac/.test(navigator.platform || '') ? 'Cmd' : 'Ctrl';
        RRContextMenu.show(clientX, clientY, [
            { label: t('ctx3d.copy'), shortcut: mod + '+C', enabled: has, action: () => manager.copySelection() },
            { label: t('ctx3d.paste'), shortcut: mod + '+V', enabled: !!(PieceBuilderManager.clipboard && place), action: () => manager.pasteAt(place) },
            { label: t('ctx3d.duplicate'), shortcut: mod + '+D', enabled: has, action: () => manager.duplicateSelection() },
            { separator: true },
            { label: tx('Select whole building'), enabled: !!under, action: () => manager.selectConnectedAt(pick) },
            { label: tx('Save as structure…'), enabled: has, action: () => window.reactor?.buildHotbar?.openSaveStructureDialog?.() },
            { separator: true },
            { label: t('ctx3d.delete'), shortcut: 'Delete', enabled: has, action: () => manager.removeSelection() }
        ]);
    }

    /**
     * A picture of a box of the map as the view shows it now (a saved structure's thumbnail):
     * the box's corners (cells x0..x1, y0..y1, heights y0w..y1w) framed and cropped, `size`
     * pixels on its long side. A data URL, or null when the box is off screen.
     */
    snapshotBox(box, size = 192) {
        if (!this.renderer || !this.camera || typeof THREE === 'undefined' || !box) return null;
        const canvas = this.renderer.domElement;
        const W = canvas.width, H = canvas.height;
        let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
        const v = new THREE.Vector3();
        for (const x of [box.x0, box.x1 + 1]) for (const z of [box.y0, box.y1 + 1]) for (const y of [box.low || 0, box.high || 0]) {
            v.set(x, y, z).project(this.camera);
            if (v.z > 1) continue;
            sx0 = Math.min(sx0, (v.x + 1) / 2 * W); sx1 = Math.max(sx1, (v.x + 1) / 2 * W);
            sy0 = Math.min(sy0, (1 - v.y) / 2 * H); sy1 = Math.max(sy1, (1 - v.y) / 2 * H);
        }
        if (!Number.isFinite(sx0)) return null;
        const pad = 0.08 * Math.max(sx1 - sx0, sy1 - sy0);
        sx0 = Math.max(0, sx0 - pad); sy0 = Math.max(0, sy0 - pad); sx1 = Math.min(W, sx1 + pad); sy1 = Math.min(H, sy1 + pad);
        if (sx1 - sx0 < 4 || sy1 - sy0 < 4) return null;
        // The picture is of the building, not of the selection: its outline and handles stay out of it.
        const gizmo = this.shapeGizmo;
        const hidden = [this.selectionOutline, gizmo && gizmo.arrows && gizmo.arrows.root, gizmo && gizmo.rings && gizmo.rings.root, gizmo && gizmo.cubes && gizmo.cubes.root, this.hoverCell].filter(object => object && object.visible);
        for (const object of hidden) object.visible = false;
        try {
            // Drawn and read in one go: the canvas keeps its picture until the frame is handed on.
            this.render(performance.now());
            const scale = size / Math.max(sx1 - sx0, sy1 - sy0);
            const out = document.createElement('canvas');
            out.width = Math.max(1, Math.round((sx1 - sx0) * scale)); out.height = Math.max(1, Math.round((sy1 - sy0) * scale));
            out.getContext('2d').drawImage(canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, 0, 0, out.width, out.height);
            return out.toDataURL('image/png');
        } catch (error) { return null; }
        finally { for (const object of hidden) object.visible = true; this.requestRender(); }
    }

    /** Right-click with the models tool: Copy, Paste here, Duplicate, Delete, Deselect. */
    showPropMenu(clientX, clientY) {
        const manager = this.propsManager(), t = key => (window.I18n ? window.I18n.t(key) : key);
        const hit = this.propAt(clientX, clientY, true);
        if (hit && manager.selectedId !== hit) { manager.select(hit, { fromThree: true }); this.selectProp(hit); }
        const has = !!manager.prop(manager.selectedId);
        const ground = this.groundPointAt(clientX, clientY);
        const mod = /Mac/.test(navigator.platform || '') ? 'Cmd' : 'Ctrl';
        RRContextMenu.show(clientX, clientY, [
            { label: t('ctx3d.copy'), shortcut: mod + '+C', enabled: has, action: () => manager.copySelected() },
            { label: t('ctx3d.paste'), shortcut: mod + '+V', enabled: !!(ModelPropsManager.clipboard && ground), action: () => { manager.pasteAt(ground.x, ground.y); this.selectProp(manager.selectedId); } },
            { label: t('ctx3d.duplicate'), shortcut: mod + '+D', enabled: has, action: () => { manager.duplicateSelected(); this.selectProp(manager.selectedId); } },
            { separator: true },
            { label: t('ctx3d.delete'), shortcut: 'Delete', enabled: has, action: () => manager.remove(manager.selectedId) },
            { label: t('props.deselect'), enabled: has, action: () => { manager.select(null, { fromThree: true }); this.selectProp(null); } }
        ]);
    }

    /** Ctrl+C / Ctrl+V / Ctrl+D for the models tool or Build › Select, pasting where the pointer last was. True when it took the key. */
    handleClipboardKey(key) {
        const at = this._lastPointerClient;
        if (this.canEditProps()) {
            const manager = this.propsManager();
            if (key === 'c') return manager.copySelected();
            if (key === 'd') { const id = manager.duplicateSelected(); this.selectProp(manager.selectedId); return !!id; }
            const ground = at ? this.groundPointAt(at.x, at.y) : null;
            if (key === 'v' && ground) { const id = manager.pasteAt(ground.x, ground.y); this.selectProp(manager.selectedId); return !!id; }
            return false;
        }
        if (this.canEditPieces() && this.pieceManager().mode === 'select') {
            const manager = this.pieceManager();
            if (key === 'c') return manager.copySelection();
            if (key === 'd') return manager.duplicateSelection();
            const place = at ? this.pieceTargetAt(at.x, at.y) : null;
            if (key === 'v' && place) return manager.pasteAt(place);
        }
        return false;
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
        const hit = this.raycastMapMeshes();
        let point = hit ? hit.point : null;
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
        this.requestRender();
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
        if (this.propSizeHandle) {
            this.propSizeHandle.parent?.remove(this.propSizeHandle);
            this.propSizeHandle.geometry.dispose(); this.propSizeHandle.material.dispose();
            this.propSizeHandle = null;
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
        // The size handle: a cube up and back from the middle, clear of the arrows (+X, up, +Z).
        const cube = Math.max(0.14, radius * 0.12);
        this.propSizeHandle = new THREE.Mesh(new THREE.BoxGeometry(cube, cube, cube),
            new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, depthTest: false, fog: false }));
        this.propSizeHandle.renderOrder = 8;
        this.propSizeHandle.userData.reach = radius * 1.1;
        this.propGroup.add(this.propSizeHandle);
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
        if (this.propSizeHandle) {
            const reach = this.propSizeHandle.userData.reach;
            this.propSizeHandle.userData.dir = new THREE.Vector3(-1, 1, -1).normalize();
            this.propSizeHandle.position.copy(centre).addScaledVector(this.propSizeHandle.userData.dir, reach);
        }
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
            this.requestRender();
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

    /** A press on the selected prop's size cube: its size then, and the pointer's place along the cube's line. */
    pickPropSize(clientX, clientY) {
        const handle = this.propSizeHandle, prop = this.propsManager()?.prop(this.selectedPropId), rect = this._propRect();
        if (!handle || !prop || !rect || !handle.userData.dir) return null;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
        handle.updateMatrixWorld();
        if (!ray.intersectObject(handle, false).length) return null;
        const origin = handle.getWorldPosition(new THREE.Vector3()), dir = handle.userData.dir.clone();
        const travel = (cx, cy) => {
            ray.setFromCamera(new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), this.camera);
            const o = ray.ray.origin, r = ray.ray.direction, w0 = origin.clone().sub(o);
            const b = dir.dot(r), c = r.dot(r), p = dir.dot(w0), q = r.dot(w0), denom = c - b * b;
            return Math.abs(denom) < 1e-9 ? null : (b * q - c * p) / denom;
        };
        const start = travel(clientX, clientY);
        if (start === null) return null;
        handle.material.opacity = 1;
        return { id: prop.id, startSize: (prop.size || 2) * (prop.scale || 1), reach: handle.userData.reach, start, travel };
    }

    /** Size the selected prop from its cube: outward grows it in proportion, as far as the pointer goes. */
    dragPropSize(state, clientX, clientY) {
        const now = state.travel(clientX, clientY);
        const manager = this.propsManager(), object = this.propObject(state.id);
        if (now === null || !manager || !object) return;
        const size = Math.max(0.1, Math.min(64, Math.round(state.startSize * (1 + (now - state.start) / state.reach) * 100) / 100));
        manager.elevation()?.updateProp(manager.currentMap, state.id, { size, scale: 1 });
        // The model grows under the pointer: its scale as well as its place, and the handle stays on its corner.
        this.poseProp(object, manager.prop(state.id));
        if (this.propSizeHandle) this.propSizeHandle.userData.reach = Math.max(0.6, size * 0.6 + 0.2) * 1.1;
        this.syncPropRings();
        this.requestRender();
        manager._syncCard?.();
        this._propMoved = true;
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

    finishPropDrag(drag = null) {
        if (this.canvas) this.canvas.style.cursor = 'default';
        if (this.propRings) RRPoseRings3D.emphasize(this.propRings, null, false);
        if (this.propArrows && typeof RRAxisArrows3D !== 'undefined') RRAxisArrows3D.emphasize(this.propArrows, null, false);
        const moved = this._propMoved || this._propRingPending;
        const sized = !!drag?.propSize;
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
            // A new size: the rings, arrows and cube are made again to fit it.
            if (sized && this.selectedPropId) this.selectPropRings(this.propObject(this.selectedPropId));
        }
        if (this.propSizeHandle) this.propSizeHandle.material.opacity = 0.9;
    }

    /** Advance stepping-animation previews at the game's cadence. */
    animateEventPreviews(now) {
        this.animateModels(now);
        this.stepEventPreviews(now);
    }

    /**
     * Count the stepping characters on and redraw the ones whose pattern
     * turns; true when any did. The loop calls this every frame so the
     * cadence holds while the view draws only on the frames that change —
     * a second call at the same time counts nothing.
     */
    stepEventPreviews(now) {
        if (!this.animatedEvents?.length) return false;
        const last = this._lastPreviewTick || now;
        this._lastPreviewTick = now;
        const frames = Math.max(0, Math.min(10, (now - last) / (1000 / 60)));
        let stepped = false;
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
            stepped = true;
        }
        return stepped;
    }

    eventSprite(event, sheets, pageImage, animatedPage = null) {
        let image = pageImage || event?.pages?.[0]?.image;
        if (image && !image.characterName && !image.tileId) {
            const row = typeof RRVehicles !== 'undefined' && RRVehicles.vehicleOf(event);
            const inherited = row && window.reactor?.databaseManager?.data?.vehicles?.[row.type]?.sheet;
            if (inherited?.characterName) image = {...image, ...inherited};
        }
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
        if (event._rrDatabaseVehicle) return this.textLabel(event.name || 'Vehicle');
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
    eventAt(clientX, clientY, tile = undefined) {
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
        if (!best) {
            // A sized event answers on every tile of its footprint, as it does on the 2D map.
            const sidecar = this.currentMap()?.reactor3d;
            const sized = sidecar && (sidecar.eventSize || sidecar.eventSizeAuto);
            if (sized && Object.keys(sized).length) {
                const at = tile === undefined ? this.tileAt(clientX, clientY) : tile;
                const event = at ? this.eventManager()?.getEventAt?.(at.x, at.y) : null;
                if (event && (event.x !== at.x || event.y !== at.y)) return this.eventMarker(event);
            }
        }
        return best ? best.object : null;
    }

    /**
     * The map tile under the cursor: the tile whose standing surface the
     * pointer's ray meets first. The ground, a path, a floor and a rock
     * are stood on, and so is any level top seen directly (a deck, a
     * bridge, an upper floor, a wall's top). A pitched roof or a wall's
     * face in the way is looked through, so the tile named is the one seen
     * at the pointer and an event dropped on it lands under the pointer.
     * Water is its surface: the tile the sheet lies over where the ray
     * comes down into it.
     *
     * The ground is one merged mesh per sheet, so a hit cannot name a tile
     * directly — but the world position can, since the map is one unit per
     * tile. That is what lets the 3D view call the same `paintTile` the 2D
     * canvas does rather than growing a second painting path.
     *
     * `lift` is how far over the tile's own ground the surface was met, for
     * the outline, which is drawn on that surface. `level` is set for water
     * alone: the height its surface lies at, flat whatever the bed does.
     * `height` is the world height of the surface met, for what is stood on
     * it by the click (a unit, a new event). The last answer is kept as
     * `lastPick`.
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

        const hit = this.raycastMapMeshes();
        const pick = hit ? MapEditor3D.standPick(mapData, this._raycaster.ray, hit) : null;
        if (!pick) { this.lastPick = null; return null; }
        return (this.lastPick = {
            x: pick.x,
            y: pick.y,
            // Where within the tile, in pixels, for the tools that care which
            // quadrant was clicked.
            localX: (pick.px - pick.x) * this.tilePixels(),
            localY: (pick.pz - pick.y) * this.tilePixels(),
            lift: pick.lift,
            level: pick.level,
            height: Number.isFinite(pick.level) ? pick.level : MapEditor3D.groundAt(mapData, pick.px, pick.pz) + pick.lift
        });
    }

    /**
     * How far from a tile's standing surface a hit still counts as on it:
     * what a laid surface differs from the height read for it (a path's
     * slab, a rock's rounded top), and the tallest riser taken as a step.
     */
    static get STAND_REACH() { return 0.5; }

    /**
     * How level a face is while it is still a top something stands on: the
     * upward part of its unit normal. A deck bent over rolling ground is
     * above it; a roof's pitch (0.71 at 45 degrees) is under it.
     */
    static get LEVEL_TOP() { return 0.9; }

    /**
     * How far off a ray is taken to end when it meets nothing laid (the sky,
     * the land past the border): as far as the sky stands. The camera turns
     * about that point and a zoom holds it still.
     */
    static get OPEN_REACH() { return (typeof Reactor3D !== 'undefined' && Reactor3D.SKY_RADIUS) || 160; }

    /** The ground at a world point of the map: the cell's elevation and the terrain's rise there. */
    static groundAt(mapData, wx, wz) {
        return Reactor3D.elevationAt(mapData, Math.floor(wx), Math.floor(wz))
            + (Reactor3D.terrainHeightAt ? Reactor3D.terrainHeightAt(mapData, wx, wz) || 0 : 0);
    }

    /**
     * Where an event placed at a world point of the map stands: the ground
     * or what is built on it from the ground up, by the game's own height
     * rule (`Reactor3D.groundHeightAt`, which `placeEvent` and the running
     * game both read). A cell holding a wall is the wall's top by that rule.
     */
    static standAt(mapData, wx, wz) {
        return Reactor3D.groundHeightAt ? Reactor3D.groundHeightAt(mapData, wx, wz) : MapEditor3D.groundAt(mapData, wx, wz);
    }

    /**
     * How level a triangle of a mesh lies: the upward part of its unit
     * normal, 1 for a floor's top, 0 for a wall's face, under 0 for an
     * underside. Read from the mesh's own vertices, which the laid meshes
     * keep in world units.
     */
    static faceUp(mesh, triangle) {
        const geometry = mesh && mesh.geometry, position = geometry && geometry.attributes && geometry.attributes.position;
        if (!position || !Number.isInteger(triangle)) return 0;
        const index = geometry.index ? geometry.index.array : null;
        const a = index ? index[triangle * 3] : triangle * 3, b = index ? index[triangle * 3 + 1] : triangle * 3 + 1, c = index ? index[triangle * 3 + 2] : triangle * 3 + 2;
        const ax = position.getX(a), ay = position.getY(a), az = position.getZ(a);
        const ux = position.getX(b) - ax, uy = position.getY(b) - ay, uz = position.getZ(b) - az;
        const vx = position.getX(c) - ax, vy = position.getY(c) - ay, vz = position.getZ(c) - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        return length > 0 ? ny / length : 0;
    }

    /**
     * The tile a ray names, from the nearest laid surface it met (`hit`):
     * `{ x, y, px, pz, lift }` (the tile, the world point picked in it, and
     * the picked surface's height over the tile's ground there), or null.
     *
     * A hit on the standing surface is that tile, and so is the ground
     * itself wherever it shows and any level top the ray comes down onto (a
     * deck, a bridge, an upper floor, a wall's top): somebody can be stood
     * there, and the cell under the pointer is the one meant. A hit on a
     * piece or the room's shell that is not stood on (a pitched roof, a
     * wall's face) is looked through to the floor behind it under the same
     * cover (`standCrossing`), so an event dropped there stands where the
     * pointer is. With no such floor, a piece names the cell under the
     * point met (a roof seen from too flat an angle to show the floor under
     * it, a rock's face, a post), marked at the pointer, and the room's
     * wall or ceiling is no tile at all. The side of a raised cell is that
     * cell, marked at the pointer. Tile art that stands up names the cell
     * it stands on, drawn on the ground. A pick under water is the water's
     * surface (`waterPick`).
     */
    static standPick(mapData, ray, hit) {
        const origin = ray.origin, direction = ray.direction;
        // A face seen side-on ends on a cell's edge: a step along the ray names the cell behind the face.
        const px = hit.point.x + direction.x * 1e-3, pz = hit.point.z + direction.z * 1e-3;
        const inside = px >= 0 && pz >= 0 && px < mapData.width && pz < mapData.height;
        const data = (hit.object && hit.object.userData) || {};
        const shell = !!data.roomPiece && data.roomPiece !== 'floor';
        const named = (wx, wz, height) => ({ x: Math.floor(wx), y: Math.floor(wz), px: wx, pz: wz, lift: height - MapEditor3D.groundAt(mapData, wx, wz) });
        let pick = null;
        if (!shell && !data.pieces && !data.rrDoor) {
            if (!inside) return null;
            // Under the cell's own ground the hit is the cell's side (a cliff's face): the outline is drawn at the
            // height met, since on the cell's top it would stand the cliff's height away from the pointer. (A tenth
            // of a tile is what a sheet's triangles lie under the height read for a bent tile.)
            const side = hit.point.y < MapEditor3D.groundAt(mapData, px, pz) - 0.1;
            pick = data.roomPiece || side ? named(px, pz, hit.point.y) : { x: Math.floor(px), y: Math.floor(pz), px, pz, lift: 0 };
        } else {
            if (inside && !shell) {
                const stood = Math.abs(hit.point.y - MapEditor3D.standAt(mapData, px, pz)) <= MapEditor3D.STAND_REACH;
                // A top the ray comes down onto, level enough to stand on. Looked through like a roof, it would
                // name ground beyond it, a different tile at every angle of the view.
                const level = !stood && !!data.pieces && direction.y < 0
                    && Math.abs(MapEditor3D.faceUp(hit.object, hit.triangle)) >= MapEditor3D.LEVEL_TOP;
                if (stood || level) pick = named(px, pz, hit.point.y);
            }
            if (!pick) {
                const crossing = MapEditor3D.standCrossing(mapData, origin, direction, hit.distance);
                if (crossing) pick = named(crossing.x, crossing.z, crossing.y);
                else if (inside && !shell) pick = named(px, pz, hit.point.y);
            }
        }
        return pick ? MapEditor3D.waterPick(mapData, ray, pick) : null;
    }

    /**
     * A pick that lies under water, as the water: the tile the sheet lies
     * over where the ray comes down through its surface, marked on the
     * surface (`level`, the surface's height: the outline lies flat there,
     * where every other one follows its ground). The laid meshes hold the
     * bed and not the sheet, and the bed of a deep lake is met many tiles
     * past the place on the water the pointer is on. Any other pick is
     * returned as it is.
     */
    static waterPick(mapData, ray, pick) {
        if (!Reactor3D.waterSurfaceAt || !Reactor3D.hasWater || !Reactor3D.hasWater(mapData)) return pick;
        const origin = ray.origin, direction = ray.direction;
        if (!(direction.y < 0)) return pick;
        let level = Reactor3D.waterSurfaceAt(mapData, pick.px, pick.pz);
        if (level === null || !(MapEditor3D.groundAt(mapData, pick.px, pick.pz) + pick.lift < level - 0.05)) return pick;
        let wx = pick.px, wz = pick.pz;
        // A river's surface slopes along its run: the level is read again where the ray meets it.
        for (let pass = 0; pass < 3; pass++) {
            const t = (level - origin.y) / direction.y;
            if (!(t > 0)) return pick;
            wx = origin.x + direction.x * t; wz = origin.z + direction.z * t;
            if (!(wx >= 0 && wz >= 0 && wx < mapData.width && wz < mapData.height)) return pick;
            const there = Reactor3D.waterSurfaceAt(mapData, wx, wz);
            // Dry at that point: the ray came in under a bank or behind a fall, and what it met stays the pick.
            if (there === null) return pick;
            if (Math.abs(there - level) < 0.02) break;
            level = there;
        }
        return { x: Math.floor(wx), y: Math.floor(wz), px: wx, pz: wz, lift: level - MapEditor3D.groundAt(mapData, wx, wz), level };
    }

    /**
     * Whether something built stands over a world point at a height: a roof,
     * an upper floor, the rest of a wall or a post above it.
     */
    static coveredAt(mapData, wx, wy, wz) {
        const x = Math.floor(wx), z = Math.floor(wz);
        const stack = Reactor3D.piecesAt && Reactor3D.pieceTop ? Reactor3D.piecesAt(mapData, x, z) : null;
        if (!stack) return false;
        const over = wy - MapEditor3D.groundAt(mapData, wx, wz);
        for (const piece of stack) if (Reactor3D.pieceTop(piece, wx - x, wz - z) > over) return true;
        return false;
    }

    /**
     * Where a ray, from `from` along it, first comes down onto the standing
     * surface of the map (`standAt`): `{ x, y, z }` in the world, a point of
     * the ray, or null. Walked cell by cell with the surface read where the
     * ray enters, crosses the middle of and leaves each cell. A column the
     * ray enters through its side (a rock's face, a stack of blocks) is
     * passed through, unless its top is within a step of the ray, which is
     * that step.
     *
     * The walk is for the floor under what was met: it ends where the ray
     * comes out into the open (nothing built over it) still more than a
     * step over the surface, since what it would come down on from there is
     * somewhere else on the map, behind the building. A ray gone under the
     * ground itself has no surface left to meet either.
     */
    static standCrossing(mapData, origin, direction, from) {
        const ox = origin.x, oy = origin.y, oz = origin.z, dx = direction.x, dy = direction.y, dz = direction.z;
        const width = mapData.width, height = mapData.height, reach = MapEditor3D.STAND_REACH;
        const gap = t => oy + dy * t - MapEditor3D.standAt(mapData, ox + dx * t, oz + dz * t);
        const at = t => ({ x: ox + dx * t, y: oy + dy * t, z: oz + dz * t });
        let t = Math.max(0, from) + 1e-3;
        let cx = Math.floor(ox + dx * t), cz = Math.floor(oz + dz * t);
        const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
        const perX = dx !== 0 ? Math.abs(1 / dx) : Infinity, perZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
        let nextX = dx !== 0 ? ((dx > 0 ? cx + 1 : cx) - ox) / dx : Infinity;
        let nextZ = dz !== 0 ? ((dz > 0 ? cz + 1 : cz) - oz) / dz : Infinity;
        // Straight down: one cell, met where the ray reaches its surface.
        if (nextX === Infinity && nextZ === Infinity) {
            if (!(dy < 0) || cx < 0 || cz < 0 || cx >= width || cz >= height) return null;
            const down = (oy - MapEditor3D.standAt(mapData, ox, oz)) / -dy;
            return down >= t ? at(down) : null;
        }
        for (let cells = width + height + 4; cells > 0; cells--) {
            const exit = Math.min(nextX, nextZ);
            if (cx >= 0 && cz >= 0 && cx < width && cz < height) {
                const inset = Math.min(1e-4, (exit - t) / 4);
                const first = t + inset, end = exit - inset;
                let low = first, lowGap = gap(first);
                // Into a cell through its side: a step's riser is the step (also past a wall, where the ray comes
                // out just under the floor behind it); anything taller is passed through.
                if (lowGap <= 0 && lowGap >= -reach) return at(first);
                for (let i = 1; i <= 2; i++) {
                    const high = i === 1 ? (first + end) / 2 : end, highGap = gap(high);
                    if (lowGap > 0 && highGap <= 0) {
                        let above = low, under = high;
                        for (let n = 0; n < 16; n++) { const middle = (above + under) / 2; if (gap(middle) > 0) above = middle; else under = middle; }
                        return at(under);
                    }
                    low = high; lowGap = highGap;
                }
                if (lowGap <= 0 && oy + dy * end < MapEditor3D.groundAt(mapData, ox + dx * end, oz + dz * end) - 0.05) return null;
                if (lowGap > reach && !MapEditor3D.coveredAt(mapData, ox + dx * end, oy + dy * end, oz + dz * end)) return null;
            } else if ((cx < 0 && stepX < 0) || (cx >= width && stepX > 0) || (cz < 0 && stepZ < 0) || (cz >= height && stepZ > 0)) {
                return null;
            }
            t = exit;
            if (nextX <= nextZ) { cx += stepX; nextX += perX; } else { cz += stepZ; nextZ += perZ; }
        }
        return null;
    }

    /**
     * The nearest point where the raycaster's current ray meets the map's
     * sheet meshes, through a bounding-volume tree per geometry (built on
     * first ask, kept with the geometry). three's own test visits every
     * triangle of every sheet, which on a large map was milliseconds per
     * pointer move, twice a move. Falls back to three when the tree helper
     * is missing.
     *
     * The sky is not among them: its dome stands around the camera at a
     * fixed radius and is drawn behind everything, so the ray would meet it
     * before any ground farther from the eye than that radius, and every
     * pick from a far zoom would land on the sky.
     */
    raycastMapMeshes() {
        const laid = this.mapScene && this.mapScene._meshes;
        if (!laid || !this._raycaster) return null;
        // One list kept for every pick: a pointer move asks several times.
        const meshes = this._pickMeshes || (this._pickMeshes = []);
        meshes.length = 0;
        for (const mesh of laid) if (mesh && !(mesh.userData && mesh.userData.roomPiece === 'sky')) meshes.push(mesh);
        // A door's leaves are picked like a piece: a click on a door is the door, not the room behind it.
        const leaves = this.mapScene._doorGroup ? this.mapScene._doorGroup.children : null;
        if (leaves) for (const leaf of leaves) meshes.push(leaf);
        if (typeof RRMeshBvh !== 'undefined' && RRMeshBvh.raycastMeshes) {
            return RRMeshBvh.raycastMeshes(this._raycaster.ray, meshes, THREE);
        }
        const hits = this._raycaster.intersectObjects(meshes, false);
        return hits.length ? { point: hits[0].point, distance: hits[0].distance, object: hits[0].object, triangle: hits[0].faceIndex } : null;
    }

    /** Mark a mesh as the selected one, or clear the selection with null. */
    select(mesh) {
        this.requestRender();
        if (this.selected && this.selected !== mesh) this.highlight(this.selected, false);
        this.selected = mesh || null;
        if (this.selected) this.highlight(this.selected, true);
        this.syncEventArrows();
        const event = this.selected ? this.selected.userData.event : null;
        // The docked model card follows the selection: shown for an event
        // standing as a model here, hidden for everything else.
        this.projectController?.eventModelPanel?.sync?.(event?._rrDatabaseVehicle ? null : event);
        return event;
    }

    /**
     * The model card moved, turned or resized an event's model in place.
     * The event diff keys on the sidecar entry, so without this the next
     * refresh would tear the model down and load it again for nothing.
     */
    noteEventModelEdited(event) {
        const mapData = this.currentMap();
        if (!event || !mapData || !this._eventSnapshot) return;
        this._eventSnapshot.set(event.id, this._eventIdentity(event, mapData));
    }

    /**
     * Drag arrows on the selected event: X and Z move it a tile at a time
     * (the grid stays the map's truth), Y sets its height, freely.
     */
    syncEventArrows() {
        const mesh = this.selected;
        if (!mesh || !mesh.userData?.event || mesh.userData.event._rrDatabaseVehicle || typeof RRAxisArrows3D === 'undefined' || !this.mapScene) {
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
        // until a restart — the arrows and grid mark its selection, and so
        // does its event's box, which is drawn through the model.
        if (mesh.userData.modelPreview) {
            const marker = this.eventMarker(mesh.userData.event);
            if (marker) this.highlightEventBox(marker, on);
            return;
        }
        const scale = on ? 1.25 : 1;
        mesh.scale.set(scale, scale, scale);
        this.highlightEventBox(mesh, on);
        if (!mesh.material) return;
        if (mesh.material.map) {
            // A character sprite is brightened rather than faded: dimming the
            // unselected ones would make every other event harder to read.
            mesh.material.color.setHex(on ? 0xfff2a0 : 0xffffff);
        } else {
            mesh.material.opacity = on ? 1 : 0.8;
        }
    }

    /** The box marks the cell, so it holds its size: the selected one brightens to the accent and shows through what stands on it. */
    highlightEventBox(mesh, on) {
        const box = mesh.userData.box;
        if (!box) return;
        box.material.opacity = on ? 1 : 0.8;
        box.material.color.setHex(on ? this.selectedEventColor() : box.userData.color);
        this.eventBoxOnTop(box, on || mesh.userData.modelShown === true);
    }

    eventColor(event) {
        if (event._rrDatabaseVehicle) return 0xf0a040;
        // A battle unit's box is its side's color, whatever page of it is drawn.
        const side = MapEditor3D.unitSide(this.currentMap(), event);
        if (side) return MapEditor3D.colorNumber(side.color);
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
        this.projectController?.mediaSurfacePreviewManager?.detachThree?.();
        this.animatedModels = [];
        this.disposeEffectPlays();
        this.disposeProps();
        if (this.eventGroup) {
            for (const child of this.eventGroup.children) {
                if (child.userData?.modelPreview) {
                    // A previewed model: its materials and what was made for this
                    // copy alone are ours, the rest belongs to the shared template.
                    this.disposeModelCopy(child);
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
        for (const key of ['grid', 'hoverCell', 'pieceGhost', 'waterGhost']) {
            const mesh = this[key];
            if (!mesh) continue;
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh.parent?.remove(mesh);
            this[key] = null;
        }
        if (this.riverGhost) {
            for (const part of [this.riverGhost.line, this.riverGhost.band, this.riverGhost.dots]) { part.geometry.dispose(); part.material.dispose(); }
            this.riverGhost.group.parent?.remove(this.riverGhost.group);
            this.riverGhost = null;
        }
        if (this.mapScene) {
            // The maps past the border are not this scene's to destroy: they stand in the next one.
            globalThis.RRMapNeighborView?.hold(this);
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
        // A workshop plot is seen whole, walls and floors included: far enough back for its width and its height.
        if (mapData.rrWorkshop) this.view.distance = Math.max(14, Math.hypot(mapData.width, mapData.height) * 1.3, (mapData.rrWorkshop.maxLevel + 1) * 1.6);
        this.applyCamera();
    }

    applyCamera() {
        if (!this.camera) return;
        this.requestRender();
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
                look: (event.button === 0 && event.altKey) || (event.button === 2 && event.ctrlKey),
                paint: false
            };
            input.setPointerCapture?.(event.pointerId);
            // Once per gesture: what is being looked at cannot change until
            // the camera moves, and the raycast is not free.
            this.seatPivot();

            // The pieces tool: a left click lays the chosen piece where the
            // pointer stands, and a drag lays one on every cell it crosses.
            if (event.button === 0 && !event.shiftKey && !event.altKey && this.canEditPieces()
                && (!event.ctrlKey || this.pieceManager().mode === 'place' || this.pieceManager().mode === 'erase')) {
                const target = this.pieceTargetAt(event.clientX, event.clientY);
                if (target && this.pieceManager().mode === 'move') {
                    // First click picks the structure under the pointer; the next sets it down.
                    this.pointer.pan = false;
                    this.pointer.propHold = true;
                    const manager = this.pieceManager();
                    if (manager.selectedGroup) manager.moveSelectedTo(target.x, target.y);
                    else manager.selectGroupAt(this.pieceTargetAt(event.clientX, event.clientY, { erase: true }) || target);
                } else if (target && this.pieceManager().mode === 'stamp') {
                    // A whole plan, once, where the click lands.
                    this.pointer.pan = false;
                    this.pointer.propHold = true;
                    this.pieceManager().stampAt(target.x, target.y);
                } else if (this.pieceManager().mode === 'select') {
                    // Select: a handle of the selected shape first; else the piece under the pointer,
                    // which a drag then moves.
                    this.pointer.pan = false;
                    this.pointer.propHold = true;
                    const manager = this.pieceManager();
                    const held = this.grabShapeGizmo(event.clientX, event.clientY);
                    // Water nearest under the pointer: the press takes no piece seen through it, and the
                    // release (a click) turns the bar to that sheet. A drag from here still draws the box.
                    const nearest = held ? null : this.selectHitAt(event.clientX, event.clientY);
                    const water = nearest?.kind === 'water' ? nearest : null;
                    const propHit = held || water ? null : this.propAt(event.clientX, event.clientY, true);
                    if (propHit && this.propsManager() && window.reactor?.buildHotbar?.selectModel) {
                        // A placed model: the bar turns to Models in Select, and the models
                        // tool (below, now holding the map) picks it up and carries a drag.
                        window.reactor.buildHotbar.selectModel(null);
                    } else if (held) {
                        this.pointer.gizmo = { held, snapshot: manager._snapshot(this.currentMap()), changed: false, start: JSON.parse(JSON.stringify(manager.selectedPiece())) };
                    } else {
                        const pick = this.pieceTargetAt(event.clientX, event.clientY, { erase: true });
                        const wasSelected = manager.selectionIds();
                        const under = pick && !water ? manager.pieceAtTarget(pick) : null;
                        if (under && wasSelected.includes(under.id)) {
                            // A press on the selection: dragging slides it (all of it).
                            manager.selectAt(pick);
                            this.pointer.pieceMove = { id: under.id, snapshot: manager._snapshot(this.currentMap()), moved: false, planeY: Reactor3D.pieceBaseAt(this.currentMap(), under.x, under.y) + under.z, many: wasSelected.length > 1, cellsMoved: [0, 0] };
                        } else {
                            // A click picks what is under the pointer (or nothing); a drag from
                            // here instead draws a box that selects everything inside it, so a
                            // building can be boxed even where its floor covers the ground.
                            manager.selectAt(water ? null : pick);
                            const planeY = pick && Number.isFinite(pick.top) ? pick.top : 0;
                            const ground = this.planePointAt(event.clientX, event.clientY, planeY);
                            if (ground) this.pointer.band = { start: ground, end: ground, planeY, started: false };
                            if (water) this.pointer.across = { from: 'build', hit: water };
                        }
                    }
                } else if (target) {
                    this.pointer.pieces = true;
                    this.pointer.pan = false;
                    this.pointer.pieceStroke = this.pieceStrokePlane(target);
                    this.pieceManager().beginStroke(target, undefined, { rectangle: event.ctrlKey });
                    this.updatePieceGhost(target);
                }
            }

            // A left drag paints when the palette has tiles selected, exactly
            // as it does on the 2D canvas, and orbits when it does not. Holding
            // Ctrl orbits regardless, for turning the view without clearing the
            // palette first.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.altKey && this.canPaint()) {
                const tile = this.tileAt(event.clientX, event.clientY);
                if (tile) {
                    this.pointer.paint = true;
                    this.beginPaint();
                    this.paintAt(tile);
                }
            }

            // With the terrain tab up: a left drag shapes the ground under the
            // pointer. Ctrl still orbits.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.altKey
                && !this.pointer.paint && this.canEditTerrain()) {
                // Remove takes the sheet drawn under the pointer first: a sheet standing
                // high over the ground is not over the cell the ray meets beyond it.
                const mode = this.terrainManager().mode;
                // Look picks with a click: the press only notes it, so a drag from anywhere turns the view
                // and the sheet in hand stays in hand; the release settles what was clicked (settleSelectClick).
                if (mode === 'look') this.pointer.across = { from: 'terrain' };
                const sheet = mode === 'drain' ? this.waterMeshAt(event.clientX, event.clientY) : null;
                const point = sheet || mode === 'look' ? null : this.groundPointAt(event.clientX, event.clientY);
                if (sheet) {
                    this.pointer.terrain = true;
                    this.terrainManager().drainRegion(sheet);
                }
                else if (point) {
                    this.pointer.terrain = true;
                    this.terrainManager().beginStroke(point);
                    if (this.canvas) this.canvas.style.cursor = 'crosshair';
                }
            }

            // With the props tab up: a ring turns the selected prop, a prop
            // is picked up and carried freely, and the bare ground takes a
            // new prop. Ctrl still orbits.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.altKey
                && !this.pointer.paint && !this.pointer.terrain && this.canEditProps()) {
                const manager = this.propsManager();
                const arrow = this.selectedPropId && this.propArrows && typeof RRAxisArrows3D !== 'undefined' && this.canvas
                    ? RRAxisArrows3D.pick(THREE, this.propArrows, this.camera, this.canvas.getBoundingClientRect(), event.clientX, event.clientY)
                    : null;
                const sizeGrab = this.pickPropSize(event.clientX, event.clientY);
                const ring = arrow || sizeGrab ? null : this.pickPropRing(event.clientX, event.clientY);
                if (sizeGrab) {
                    manager.pushUndo?.();
                    this.pointer.propSize = sizeGrab;
                } else if (arrow) {
                    const prop = manager.prop(this.selectedPropId);
                    manager.pushUndo?.();
                    this.pointer.propArrow = { grab: arrow, id: this.selectedPropId, startX: prop.x, startY: prop.y, startZ: prop.z || 0 };
                    RRAxisArrows3D.emphasize(this.propArrows, arrow.axis, true);
                } else if (ring) {
                    manager.pushUndo?.();
                    this.pointer.propRing = ring;
                } else {
                    const hitId = this.propAt(event.clientX, event.clientY, true);
                    if (hitId && manager.tool === 'erase') {
                        manager.remove(hitId);
                        this.pointer.propPlaced = true;
                    } else if (hitId) {
                        manager.select(hitId, { fromThree: true });
                        this.selectProp(hitId);
                        const prop = manager.prop(hitId);
                        const point = this.groundPointAt(event.clientX, event.clientY);
                        manager.pushUndo?.();
                        this.pointer.propDrag = { id: hitId, offsetX: point ? point.x - prop.x : 0, offsetY: point ? point.y - prop.y : 0 };
                        if (this.canvas) this.canvas.style.cursor = 'grabbing';
                    } else {
                        const point = this.groundPointAt(event.clientX, event.clientY);
                        if (point && manager.placing()) {
                            const id = manager.place(point.x, point.y);
                            if (id) this.pointer.propPlaced = true;
                        } else {
                            manager.select(null, { fromThree: true });
                            this.selectProp(null);
                            // Select off every model: a drag from here turns the view; a click on a water
                            // sheet or a building turns the bar to its group on release (settleSelectClick).
                            if (manager.tool === 'select') this.pointer.across = { from: 'models' };
                        }
                    }
                }
                if (this.pointer.propRing || this.pointer.propArrow || this.pointer.propSize || this.pointer.propDrag || this.pointer.propPlaced) {
                    this.pointer.pan = false;
                    this.pointer.propHold = true;
                }
            }

            // With the event tool up and no brush in hand, a left drag that
            // starts on an event carries it, exactly as it does on the 2D
            // canvas. Starting anywhere else still orbits.
            if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.altKey
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
                    if (mesh && !mesh.userData.event?._rrDatabaseVehicle) {
                        this.pointer.drag = mesh;
                        // Where the event was taken hold of, in tiles from its own: a sized event's
                        // marker stands in the middle of its footprint, and stays under the pointer.
                        const held = this.tileAt(event.clientX, event.clientY), grabbed = mesh.userData.event;
                        this.pointer.dragOffset = held && grabbed ? MapEditor3D.eventGrabOffset(grabbed, held,
                            typeof RRMapElevation !== 'undefined' && RRMapElevation.eventSize ? RRMapElevation.eventSize(this.currentMap(), grabbed.id) : [1, 1],
                            typeof RRMapElevation !== 'undefined' && RRMapElevation.eventFootprintOrigin ? RRMapElevation.eventFootprintOrigin(this.currentMap(), grabbed.id) : [0, 0]) : [0, 0];
                        this.beginEventDrag();
                    }
                }
            }
            if (this.pointer.eventArrow) this.pointer.pan = false;
        };
        this._onPointerMove = event => {
            this._lastActiveAt = performance.now();
            // Where Ctrl+V pastes.
            this._lastPointerClient = { x: event.clientX, y: event.clientY };
            if (!this.pointer) {
                // One raycast answers both questions.
                const tile = this.tileAt(event.clientX, event.clientY);
                this.updateHover(event.clientX, event.clientY, tile);
                // Passage: what a character can do at each side of the place under the pointer (the ray is tileAt's).
                if (globalThis.RRMapEdgeLabels?.on) globalThis.RRMapEdgeLabels.hover(this, event.clientX, event.clientY, tile);
                if (tile) window.reactor?.updateMapCoordinates?.(tile.x, tile.y);
                return;
            }
            const dx = event.clientX - this.pointer.x;
            const dy = event.clientY - this.pointer.y;
            this.pointer.x = event.clientX;
            this.pointer.y = event.clientY;
            if (this.pointer.pieces) {
                const target = this.pieceStrokeTargetAt(event.clientX, event.clientY);
                if (target) { this.pieceManager()?.paintAt(target, { rectangle: event.ctrlKey }); this.updatePieceGhost(target); }
                return;
            }
            if (this.pointer.gizmo) {
                if (this.dragShapeGizmo(this.pointer.gizmo, event.clientX, event.clientY)) this.pointer.gizmo.changed = true;
                return;
            }
            if (this.pointer.band) {
                const band = this.pointer.band, end = this.planePointAt(event.clientX, event.clientY, band.planeY);
                if (!end) return;
                band.end = end;
                if (!band.started && (Math.abs(end.x - band.start.x) > 0.3 || Math.abs(end.y - band.start.y) > 0.3)) { band.started = true; this.pieceManager()?.clearSelection(); }
                if (band.started) this.showSelectionBand(band.start, end, band.planeY);
                return;
            }
            if (this.pointer.pieceMove && this.pointer.pieceMove.many) {
                // Many pieces: the whole selection slides by whole cells with the pointer.
                const move = this.pointer.pieceMove, manager = this.pieceManager();
                const rect = this.canvas.getBoundingClientRect();
                this._raycaster = this._raycaster || new THREE.Raycaster();
                this._raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
                const point = this._raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -move.planeY), new THREE.Vector3());
                if (!point) return;
                if (!move.grabPoint) { move.grabPoint = [point.x, point.z]; return; }
                const wantX = Math.round(point.x - move.grabPoint[0]), wantY = Math.round(point.z - move.grabPoint[1]);
                const dx = wantX - move.cellsMoved[0], dy = wantY - move.cellsMoved[1];
                if (!move.snapshot) move.snapshot = manager._snapshot(this.currentMap());
                if ((dx || dy) && manager.moveSelectionBy(dx, dy, false)) { move.cellsMoved = [wantX, wantY]; move.moved = true; }
                return;
            }
            if (this.pointer.pieceMove) {
                // The piece follows the pointer on the plane of its own base, so it slides rather than climbs.
                const move = this.pointer.pieceMove, manager = this.pieceManager(), piece = manager && manager.selectedPiece();
                if (!piece || !this.camera || !this.canvas) return;
                const rect = this.canvas.getBoundingClientRect();
                this._raycaster = this._raycaster || new THREE.Raycaster();
                this._raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
                const point = this._raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -move.planeY), new THREE.Vector3());
                if (!point) return;
                if (!move.grabOffset) { const [cx, cz] = manager.isShape(piece.kind) ? Reactor3D.shapeCentre(piece) : [piece.x + 0.5, piece.y + 0.5]; move.grabOffset = [cx - point.x, cz - point.z]; return; }
                const cx = point.x + move.grabOffset[0], cz = point.z + move.grabOffset[1];
                const snapped = manager.isShape(piece.kind) ? [Math.round(cx * 4) / 4, Math.round(cz * 4) / 4] : [Math.floor(cx) + 0.5, Math.floor(cz) + 0.5];
                if (!move.snapshot) move.snapshot = manager._snapshot(this.currentMap());
                if (manager.moveSelectedPieceTo(snapped[0], snapped[1], undefined, false)) move.moved = true;
                return;
            }
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
            } else if (this.pointer.terrain) {
                const point = this.groundPointAt(event.clientX, event.clientY);
                if (point) { this.terrainManager()?.paintAt(point); this.updateTerrainRing(point); }
            } else if (this.pointer.propSize) {
                this.dragPropSize(this.pointer.propSize, event.clientX, event.clientY);
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
                    const [heldX, heldY] = this.pointer.dragOffset || [0, 0];
                    this.dragEventTo(this.pointer.drag, { x: tile.x - heldX, y: tile.y - heldY });
                    this.updateHoverCell(tile);
                }
            } else if (this.pointer.look) {
                this.look(dx, dy);
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
            if (drag && drag.pieces) {
                drag.pieceStroke = null;
                this.pieceManager()?.endStroke();
                return;
            }
            // A Select or Look press that went nowhere is a click on what it found.
            if (drag && drag.across && event.type === 'pointerup' && !(drag.band && drag.band.started)
                && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 4
                && this.settleSelectClick(drag.across, event.clientX, event.clientY)) return;
            if (drag && drag.band) {
                if (!drag.band.started) return;
                const box = this.showSelectionBand(drag.band.start, drag.band.end, drag.band.planeY);
                this.hideSelectionBand();
                if (box) this.pieceManager()?.selectInBox(box.x0, box.y0, box.x1, box.y1);
                return;
            }
            if (drag && (drag.gizmo || drag.pieceMove)) {
                this.endPieceDrag(drag);
                return;
            }
            if (drag && drag.terrain) {
                this.terrainManager()?.endStroke();
                if (this.canvas) this.canvas.style.cursor = '';
                return;
            }
            if (!drag || drag.pan || drag.look) return;
            if (drag.propHold) {
                this.finishPropDrag(drag);
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
        this._onDoubleClick = event => this.handleDoubleClick(event);
        this._onWheel = event => {
            this._lastActiveAt = performance.now();
            event.preventDefault();
            // The 3D canvas lives inside #canvas-container, which carries
            // TilemapManager's own wheel-zoom handler. Without this the same
            // scroll also zoomed the hidden 2D view, re-cropped its canvas and
            // overwrote the zoom readout with the 2D scale.
            event.stopPropagation();
            this.zoom(event.deltaY, event.clientX, event.clientY);
        };
        this._onContextMenu = event => {
            // The browser menu is never wanted here — right-drag pans — but a
            // right-click otherwise gets the same menu the 2D map gives it,
            // judged by the same four-pixel test as a left-click.
            event.preventDefault();
            if (event.ctrlKey || event.altKey) return;
            const drag = this.pointer;
            if (drag && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) return;

            // With the pieces tool up: in Select, a menu for the piece under the pointer (and the
            // rest of the selection); placing, a right-click pulls the piece off, the way a brick
            // comes off a model.
            if (this.canEditPieces()) {
                const manager = this.pieceManager();
                if (manager.mode === 'select' && typeof RRContextMenu !== 'undefined') { this.showPieceMenu(event.clientX, event.clientY); return; }
                const target = this.pieceTargetAt(event.clientX, event.clientY, { erase: true });
                if (target) manager.removeAt(target);
                return;
            }
            // With the models tool up: a menu for the model under the pointer, or (on the ground)
            // Paste here and letting go of the selection.
            if (this.canEditProps()) {
                if (typeof RRContextMenu !== 'undefined') { this.showPropMenu(event.clientX, event.clientY); return; }
                const manager = this.propsManager();
                if (manager?.selectedId) {
                    manager.select(null, { fromThree: true });
                    this.selectProp(null);
                }
                return;
            }
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
        // A press, a key, a wheel or an edit anywhere in the window may change
        // what this view shows — a panel slider, a tool button, a typed value
        // — and most of those paths never tell the view. Noting the time is
        // all a request costs, so every one of them counts; a bare pointer
        // move counts only over the view (its own handler) or with a button
        // held, so sweeping the mouse across the panels draws nothing.
        this._onAnyInput = event => {
            if (event.type === 'pointermove' && !event.buttons) return;
            this.requestRender();
        };
        for (const type of MapEditor3D.INPUT_EVENTS) window.addEventListener(type, this._onAnyInput, { capture: true, passive: true });
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
        if (this._onAnyInput) {
            for (const type of MapEditor3D.INPUT_EVENTS) window.removeEventListener(type, this._onAnyInput, { capture: true });
            this._onAnyInput = null;
        }
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
        if (this.projectController?.mediaSurfacePreviewManager?.authoring) return false;
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
    }

    /**
     * Finish a stroke.
     *
     * `resetDrawingState` commits the undo entry and announces the edit, which
     * is what brings the 3D geometry back in line — the same announcement a
     * stroke on the 2D canvas makes.
     *
     * No full 2D redraw here. The 2D canvas is hidden and paused under this
     * view, so a whole-map `renderMap` per stroke drew a picture nobody could
     * see; turning 3D off redraws the 2D map in full anyway (see `teardown`).
     */
    endPaint() {
        const editor = this.mapEditor();
        if (!editor) return;
        editor.resetDrawingState(true);
        this.requestRender();
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
        if (this.projectController?.mediaSurfacePreviewManager?.authoring) return false;
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
        if (mesh?.userData?.event?._rrDatabaseVehicle) return;
        const mapData = this.currentMap();
        const event = mesh?.userData?.event;
        if (!mapData || !event) return;
        if (tile.x === event.x && tile.y === event.y) return;
        if (tile.x < 0 || tile.y < 0 || tile.x >= mapData.width || tile.y >= mapData.height) return;

        const manager = this.eventManager();
        // Two events cannot share a cell (a sized event's footprint counts), and the 2D drag refuses the same way.
        if (manager?.canPlaceEvent && !manager.canPlaceEvent(event, tile.x, tile.y)) return;

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

    /** Select the event under the pointer, or an empty tile for event creation. */
    handleClick(clientX, clientY) {
        if (!this.canSelectEvents()) return;
        const picked = this.select(this.eventAt(clientX, clientY));
        if (typeof this.onEventSelected === 'function') this.onEventSelected(picked?._rrDatabaseVehicle ? null : picked);
        if (!picked) {
            const tile = this.tileAt(clientX, clientY);
            // Battle Setup has a unit in hand: the click stands it where its preview stands, on the surface the pointer met.
            const setup = typeof window !== 'undefined' ? window.RRBattleSetup : null;
            if (tile && setup?.placeAt(this.eventManager(), tile.x, tile.y, setup.whereOf(this, tile, { x: clientX, y: clientY }))) return;
            if (tile) this.eventManager()?.selectTile(tile.x, tile.y);
        }
    }

    handleDoubleClick(event) {
        if (this.projectController?.mediaSurfacePreviewManager?.authoring) return;
        // Build › Select: a double-click takes the whole building (its group, or every loose piece touching it).
        if (this.canEditPieces() && this.pieceManager().mode === 'select') {
            const pick = this.pieceTargetAt(event.clientX, event.clientY, { erase: true });
            if (pick) { event.preventDefault(); this.pieceManager().selectConnectedAt(pick); }
            return;
        }
        // Building (pieces, the ground, models): two quick clicks are two clicks, and the camera stays.
        if (this.canEditPieces() || this.canEditTerrain() || this.canEditProps()) return;
        if (!this.canSelectEvents()) {
            const map = this.currentMap();
            if (map) this.frameMap(map);
            return;
        }
        event.preventDefault();
        // Battle Setup has a unit in hand: two quick clicks are two clicks, and no event opens.
        if (typeof window !== 'undefined' && window.RRBattleSetup?.holding?.()) return;
        const cube = this.eventAt(event.clientX, event.clientY);
        if (cube) {
            const picked = this.select(cube);
            if (picked?._rrDatabaseVehicle) EventManager.openVehicle(picked);
            else if (picked && typeof this.onEventActivated === 'function') this.onEventActivated(picked);
        } else {
            const tile = this.tileAt(event.clientX, event.clientY);
            // A new event opened on a deck, a bridge or an upper floor stands there: its Z is the surface's.
            if (tile && this.eventManager()?.activateEventAt(tile.x, tile.y) && typeof window !== 'undefined') window.RRBattleSetup?.standNewEvent?.(this.eventManager(), tile);
        }
    }

    /**
     * Follow the cursor: outline the cell it is over, and shape it over events.
     *
     * The tile is passed in when the caller has already raycast for it, so a
     * pointer move costs one cast rather than one per question.
     */
    updateHover(clientX, clientY, tile = this.tileAt(clientX, clientY)) {
        this.updateHoverCell(this.canEditTerrain() ? null : tile);
        if (this.canEditTerrain()) {
            const manager = this.terrainManager(), point = this.groundPointAt(clientX, clientY);
            // The water tools click, and the biome and the border have no brush: no ring.
            const ringless = ['fill', 'drain', 'look', 'river', 'biome', 'surround'].includes(manager.mode);
            this.updateTerrainRing(ringless ? null : point);
            manager.hoverAt?.(point);
        } else if (this.terrainRing) this.terrainRing.visible = false;
        if (this.canEditPieces()) this.updatePieceGhost(this.pieceTargetAt(clientX, clientY));
        else this.hidePieceGhost();
        if (!this.canvas) return;
        if (this.canEditProps()) {
            // The prop pick (a box per prop) is throttled to 30 Hz; the
            // ghost is not - it moved at that rate and looked choppy against
            // a view drawing at 60. Its one ground raycast per move is cheap.
            const at = performance.now();
            if (!this._propHoverAt || at - this._propHoverAt >= 33) {
                this._propHoverAt = at;
                this._hoverOverProp = this.propAt(clientX, clientY) !== null;
                const props = this.propsManager();
                this.canvas.style.cursor = this._hoverOverProp ? (props?.tool === 'erase' ? 'not-allowed' : 'grab') : (props?.placing?.() ? 'copy' : 'default');
            }
            if (this._hoverOverProp || !tile || !this.propsManager()?.placing?.()) this.hidePlacementGhost();
            else this.updatePlacementGhost(clientX, clientY);
            return;
        }
        this.hidePlacementGhost();
        const over = this.canSelectEvents() && this.eventAt(clientX, clientY, tile);
        // Battle Setup: the unit in hand as it will stand, where a click would stand it; over a unit, its name.
        if (typeof window !== 'undefined' && window.RRBattleSetup) window.RRBattleSetup.hover3D(this, this.canSelectEvents() ? tile : null, over ? over.userData?.event : null, { x: clientX, y: clientY });
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

        const hit = this.raycastMapMeshes();
        let point = hit ? hit.point : null;
        if (!point) {
            // Looking at the sky, or off the edge of the map. The ground plane
            // still says something, and is better than a stale number.
            const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            point = this._raycaster.ray.intersectPlane(ground, new THREE.Vector3());
            // Farther off than the sky stands, or nowhere: the point of the
            // view ray that far off. A pivot past what an orbit reaches is
            // cut to that reach from its own side, which moves the eye.
            if (!point || this.camera.position.distanceTo(point) > MapEditor3D.OPEN_REACH) {
                point = this._raycaster.ray.at(MapEditor3D.OPEN_REACH, new THREE.Vector3());
            }
        }

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
        // Inspect ceilings and undersides; stay short of the pole singularities.
        this.view.pitch = Math.min(89, Math.max(-89, this.view.pitch - dy * 0.3));
        this.applyCamera();
    }

    /** Ctrl-right-drag turns the eye in place, useful inside rooms and below ceilings. */
    look(dx, dy) {
        if (!this.camera) return;
        const eye = this.camera.position.clone();
        this.orbit(dx, dy);
        this.view.target.x += eye.x - this.camera.position.x;
        this.view.target.y += eye.y - this.camera.position.y;
        this.view.target.z += eye.z - this.camera.position.z;
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

    zoomAnchor(clientX, clientY) {
        if (!this.camera || !this.canvas || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        const rect = this.canvas.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return null;
        this.camera.updateMatrixWorld();
        this._raycaster = this._raycaster || new THREE.Raycaster();
        this._raycaster.setFromCamera(new THREE.Vector2(
            (clientX - rect.left) / rect.width * 2 - 1,
            -(clientY - rect.top) / rect.height * 2 + 1
        ), this.camera);
        const hit = this.raycastMapMeshes();
        if (hit) return hit.point.clone();
        // Empty map space uses the current orbit plane. Where the ray meets it
        // farther off than the sky stands, or not at all, the point of the ray
        // that far off: a notch moves the eye a tenth of the way to the
        // anchor, and the plane near the horizon is thousands of tiles off.
        const ray = this._raycaster.ray, reach = MapEditor3D.OPEN_REACH;
        const point = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.view.target.y), new THREE.Vector3());
        return point && ray.origin.distanceTo(point) <= reach ? point : ray.at(reach, new THREE.Vector3());
    }

    zoom(deltaY, clientX, clientY) {
        const anchor = this.zoomAnchor(clientX, clientY);
        const factor = deltaY > 0 ? 1.1 : 1 / 1.1;
        const previousDistance = this.view.distance;
        this.view.distance = Math.min(400, Math.max(3, previousDistance * factor));
        if (anchor && previousDistance > 0) {
            const ratio = this.view.distance / previousDistance;
            // Scale both camera and orbit target about the pointed location.
            // Changing distance alone always zooms toward the screen centre.
            for (const axis of ['x', 'y', 'z']) {
                // aimCamera centres the X/Z tile coordinates by half a tile.
                const coordinate = anchor[axis] - (axis === 'y' ? 0 : 0.5);
                this.view.target[axis] = coordinate + ratio * (this.view.target[axis] - coordinate);
            }
        }
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
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
            || target.isContentEditable)) return false;
        return ![...document.querySelectorAll('.modal-overlay, .rr-modal-overlay, #database-modal')]
            .some(modal => modal.getClientRects().length > 0
                && (!modal.classList.contains('video-surface-editor-modal') || !this.projectController?.mediaSurfacePreviewManager?.authoring));
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
    //
    // The view draws when something asks it to, not on a clock. Anything that
    // changes the picture marks the view active (`requestRender`, or the
    // camera and hover cell moving, which are compared each frame); the loop
    // then draws for a short tail, which covers the frames a reflection
    // capture takes to go round its six faces and any follow-up that lands a
    // frame late. Only a picture that really moves keeps the full rate:
    // playing media, a flight, a drifting sky, a running effect, an animated
    // model or light, water waves (at the old idle cadence) and the A1 and
    // stepping-character frames (only on the frame they change). A still
    // view otherwise draws once a second, a safety net for a change nobody
    // announced — a model or picture that finished loading on its own time.

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
            // Suspended (the browser playtest runs in an overlay iframe):
            // keep the loop alive but do no GPU work — the playtest owns
            // the machine until the overlay closes.
            if (this.suspended || MapEditor3D.coveredByDatabase() || MapEditor3D.playtestRunning()) { this._covered = true; this.frame = requestAnimationFrame(tick); return; }
            this.frame = null;
            try {
                if (this.keepCanvasFilling()) this.resize();
                // Whatever changed behind the cover is drawn when it lifts.
                if (this._covered) { this._covered = false; this.requestRender(); }
                this.stepFly(now);
                const lightsLive = !!window.reactor?.lightingManager?.wants3DFrames?.();
                const stepped = this.stepAnimations(now);
                if (MapEditor3D.shouldRender({ now, active: this.previewActive(now) || lightsLive || stepped, lastRenderAt: this._lastRenderAt, idleInterval: this.idleInterval() })) {
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
     * Something on screen changed: draw it on the next frame, and through
     * the short tail after (`ACTIVE_TAIL_MS`). Cheap enough to call from
     * anywhere, as often as wanted — it only notes the time.
     */
    requestRender() {
        this._lastActiveAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    /** A playtest is open and the editor is not focused: the game gets the GPU (PlaytestManager.ownsGpu). */
    static playtestRunning() {
        return typeof window !== 'undefined' && !!window.reactor?.playtestManager?.ownsGpu?.();
    }

    /** The Database window covers the map: its own previews get the GPU. */
    static coveredByDatabase() {
        return typeof document !== 'undefined' && typeof document.getElementById === 'function'
            && !!document.getElementById('database-viewer')?.classList?.contains('active');
    }

    /**
     * Whether this frame should draw: anything moving draws every frame; a
     * still view draws only once `idleInterval` has passed since its last
     * draw — once a second by default, the safety net described above.
     */
    static shouldRender({ now, active, lastRenderAt, idleInterval = MapEditor3D.IDLE_INTERVAL_MS }) {
        if (active) return true;
        if (!(lastRenderAt > 0)) return true;
        return now - lastRenderAt >= idleInterval;
    }

    /**
     * How long a still view may go between draws. Water waves run on their
     * own clock in the shader: held at the ten frames a second a still view
     * always gave them, rather than lifted to the full rate.
     */
    idleInterval() {
        // A drifting sky moves a fraction of a pixel a frame: a still view under one draws thirty times a
        // second, not sixty. (It drew every frame, for hours, on any map whose sky scrolls.)
        const sky = this.mapScene?._sky?.userData?.sky;
        if (sky && (sky.driftX || sky.driftY)) return MapEditor3D.SKY_INTERVAL_MS;
        return this.mapScene?._waterMeshes?.length ? 100 : MapEditor3D.IDLE_INTERVAL_MS;
    }

    /**
     * Advance the frame-stepped animations — the A1 water and waterfalls, and
     * stepping characters — without drawing, and say whether either shows a
     * new frame. They change a few times a second, so the view draws on those
     * frames alone rather than on every frame in between.
     */
    stepAnimations(now) {
        let stepped = this.stepEventPreviews(now);
        const scene = this.mapScene;
        if (scene && scene._animated && scene._animated.length && Number.isFinite(this._animationStartedAt)
            && window.reactor?.optionsManager?.getAnimateAutotiles?.() !== false
            && Math.floor((now - this._animationStartedAt) / 500) !== scene._frame) {
            stepped = true;
        }
        return stepped;
    }

    /** The camera or hover moved, a draw was asked for within the tail, or something on screen moves by itself. */
    previewActive(now) {
        if (this.projectController?.mediaSurfacePreviewManager?.previewActive?.()) return true;
        if (this.flying()) return true;
        // (A drifting sky is drawn at its own rate: see idleInterval.)
        if (this.effectsAnimate()) return true;
        if (this.modelsAnimate()) return true;
        // The light volume is baked over a few dozen drawn frames: a still
        // view drawing once a second took half a minute to light itself.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.LightVolume?.baking?.()) return true;
        if (this.viewMoved()) this._lastActiveAt = now;
        return Number.isFinite(this._lastActiveAt) && now - this._lastActiveAt < MapEditor3D.ACTIVE_TAIL_MS;
    }

    /**
     * Whether the camera or the hover cell moved since the last look: plain
     * numbers kept in one array and compared with a tolerance finer than a
     * pixel can show, rather than a string of them built every frame.
     */
    viewMoved() {
        const camera = this.camera, hover = this.hoverCell;
        const seen = this._viewSeen || (this._viewSeen = new Float64Array(11).fill(NaN));
        let moved = false;
        const values = this._viewValues || (this._viewValues = new Float64Array(11));
        values.fill(NaN);
        if (camera) {
            values[0] = camera.position.x; values[1] = camera.position.y; values[2] = camera.position.z;
            values[3] = camera.quaternion.x; values[4] = camera.quaternion.y;
            values[5] = camera.quaternion.z; values[6] = camera.quaternion.w;
        }
        if (hover) {
            values[7] = hover.visible ? 1 : 0;
            values[8] = hover.position.x; values[9] = hover.position.y; values[10] = hover.position.z;
        }
        for (let i = 0; i < 11; i++) {
            const was = seen[i], value = values[i];
            if (Math.abs(was - value) <= 1e-5 || (was !== was && value !== value)) continue;
            seen[i] = value;
            moved = true;
        }
        return moved;
    }

    /**
     * A playing effect is a moving picture: an Effekseer quad takes a new
     * frame only when this view draws, a video plane plays, and a carried
     * light that flickers or pulses changes every frame. A still picture, a
     * steady light and an MV overlay (which animates itself and only follows
     * the camera) do not keep the view drawing.
     */
    effectsAnimate() {
        for (const play of this.effectPlays || []) {
            if (!play || !play.object || !play.object.parent) continue;
            if (play.quad && play.layer && play.layer.active) return true;
            const video = play.plane && play.plane.userData && play.plane.userData.video;
            if (video && !video.paused && !video.ended) return true;
            const light = play.light && play.effect && play.effect.light;
            if (light && (light.flicker || light.pulse)) return true;
        }
        return false;
    }

    /** A placed model that moves by itself: an action playing, or rules that run on their own (the 2D preview's test). */
    modelsAnimate() {
        let frustum = null;
        for (const driver of this.animatedModels || []) {
            if (!driver || !driver.object || !driver.object.parent) continue;
            const rules = Array.isArray(driver.rules) ? driver.rules : [];
            if (!driver.action && !rules.some(rule => rule && (rule.trigger === 'always' || rule.trigger === 'idle'))) continue;
            // A model that moves out of the picture moves nothing in it: the view keeps its idle rate.
            if (frustum === null) frustum = this.viewFrustum() || false;
            if (frustum && !this.modelInView(driver.object, frustum)) continue;
            return true;
        }
        return false;
    }

    /** The camera's frustum, or null where there is none to ask (no camera yet). */
    viewFrustum() {
        const camera = this.camera;
        if (!camera || typeof THREE === 'undefined' || !camera.projectionMatrix || !camera.matrixWorldInverse) return null;
        const frustum = this._viewFrustum || (this._viewFrustum = new THREE.Frustum());
        const matrix = this._viewFrustumMatrix || (this._viewFrustumMatrix = new THREE.Matrix4());
        return frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }

    /** Whether a placed model may show in the frustum: a sphere about where it stands, as wide as it can reach (the runtime's InstanceCull rule). */
    modelInView(object, frustum) {
        if (!object.matrixWorld || typeof Reactor3D === 'undefined' || !Reactor3D.instanceSpan) return true;
        const sphere = this._viewSphere || (this._viewSphere = new THREE.Sphere());
        const span = Reactor3D.instanceSpan(object);
        sphere.center.setFromMatrixPosition(object.matrixWorld);
        sphere.center.y += span * 0.5;
        sphere.radius = span * 1.5 + 1;
        return frustum.intersectsSphere(sphere);
    }

    render(now) {
        if (!this.renderer || !this.camera || !this.mapScene) return;
        // Everything in the runtime that culls asks `Reactor3D.activeCamera()`,
        // which finds the game's viewport — and this view has none. Told
        // once per frame, before the lights are fed or any pass renders, so
        // a light off the side of *this* viewport is skipped here too.
        if (typeof Reactor3D !== 'undefined') {
            Reactor3D.cullCamera = this.camera;
            // The cull frustum is rebuilt once per stamped frame; the game
            // stamps with Graphics, which this view has none of.
            Reactor3D.cullFrame = (Reactor3D.cullFrame || 0) + 1;
            // Shadows spend their moving-caster rows around the eye: here
            // that is the orbit target, not a camera hung above the map.
            if (Reactor3D.Shadows) Reactor3D.Shadows.focus = () => this.view && this.view.target;
        }
        this.animateAutotiles(now);
        this.animateEventPreviews(now);
        // The sky stands around the editor's camera and drifts at the game's frame rate.
        this.mapScene.updateSky?.(this.camera, now / (1000 / 60));
        // The water volumes nearest the orbit target, when a river makes more than the shader takes.
        this.mapScene.updateWater?.(now / (1000 / 60), this.view && this.view.target ? this.view.target : null);
        this.pickPropLods();
        this.projectController?.mediaSurfacePreviewManager?.updateThree?.();
        // Lights are map content: feed the compositor on every drawn frame,
        // whether or not the Lighting panel is open.
        window.reactor?.lightingManager?.feed3D?.();
        // The shadow maps, before any pass hides a group: the same step the
        // game's viewport takes, from the same lights the feed just synced.
        this.mapScene.renderShadows?.(this.renderer, this.currentMap());
        // The still, flickering and pulsing lights from the baked volume, the
        // moving ones gathered once a frame (Reactor3D.LightVolume), as in the game.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.LightVolume) Reactor3D.LightVolume.frame(this.renderer, this.mapScene, this.currentMap());
        const scene = this.mapScene.scene();
        // A face of the reflection capture, as the game takes it.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.Reflections && this.camera) Reactor3D.Reflections.update(this.renderer, scene, this.camera.position, this.mapScene.reflectionHidden?.());
        // Mirror pieces and reflective water show their sharp mirrors here as in the game.
        if (typeof Reactor3D !== 'undefined' && Reactor3D.Mirrors && this.camera && this.mapScene.mirrorCandidates) {
            Reactor3D.Mirrors.update(this.renderer, scene, this.camera, this.mapScene.mirrorCandidates(this.camera), null, null);
        }
        const background = scene.background;
        const autoClear = this.renderer.autoClear;
        const eventVisible = this.eventGroup ? this.eventGroup.visible : null;
        const gridVisible = this.grid ? this.grid.visible : null;
        const hoverVisible = this.hoverCell ? this.hoverCell.visible : null;
        // World matrices once for the frame, as the game's viewport takes
        // them: every draw below (the unlit surfaces, the rest, the star
        // tiles, the overlay, the lights) recomposed the whole graph again.
        scene.updateMatrixWorld();
        const matrixAuto = scene.matrixWorldAutoUpdate;
        scene.matrixWorldAutoUpdate = false;
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
                this.renderMainPass(scene);
                this.renderLightsPass(scene);
                return;
            }
            this.mapScene.setPass('below');
            this.renderer.autoClear = true;
            this.renderMainPass(scene);

            // The above-characters overlay (layer >= 5 video surfaces) is the
            // game's third slot: composited over star tiles and world alike,
            // so it gets its own pass and stays out of the star-tile one.
            const overlay = this.mapScene._aboveBillboardsGroup;
            const overlayVisible = overlay ? overlay.visible : null;
            const hideEditorLayers = () => {
                if (this.eventGroup) this.eventGroup.visible = false;
                if (this.grid) this.grid.visible = false;
                if (this.hoverCell) this.hoverCell.visible = false;
                // The maps past the border are drawn once, with the ground: setPass does not reach their groups.
                globalThis.RRMapNeighborView?.pass(this, false);
            };
            if (this.mapScene.hasAbove()) {
                hideEditorLayers();
                scene.background = null;
                this.renderer.autoClear = false;
                this.renderer.clearDepth();
                this.mapScene.setPass('above');
                if (overlay) overlay.visible = false;
                Reactor3D.renderScene(this.renderer, scene, this.camera);
            }
            if (overlay && overlay.children.length) {
                hideEditorLayers();
                scene.background = null;
                this.renderer.autoClear = false;
                this.renderer.clearDepth();
                this.mapScene.setPass('overlay');
                overlay.visible = true;
                Reactor3D.renderScene(this.renderer, scene, this.camera);
            }
            if (overlay && overlayVisible !== null) overlay.visible = overlayVisible;
            this.renderLightsPass(scene);
        } finally {
            scene.matrixWorldAutoUpdate = matrixAuto;
            scene.background = background;
            this.renderer.autoClear = autoClear;
            if (this.eventGroup && eventVisible !== null) this.eventGroup.visible = eventVisible;
            if (this.grid && gridVisible !== null) this.grid.visible = gridVisible;
            if (this.hoverCell && hoverVisible !== null) this.hoverCell.visible = hoverVisible;
            globalThis.RRMapNeighborView?.pass(this, true);
            this.mapScene.setPass('all');
        }
    }

    /**
     * Distance levels for the placed props, from this view's camera — the
     * same swap the game makes, so a far prop costs what it costs in play.
     */
    pickPropLods() {
        const group = this.propGroup, neighbors = globalThis.RRMapNeighborView;
        const beside = !!neighbors && neighbors.hasProps(this);
        if ((!group && !beside) || !this.camera || typeof Reactor3D === 'undefined' || !Reactor3D.pickLod) return;
        const eye = this.camera.position;
        // This view's own camera and canvas, because the levels are also
        // chosen by how much of the screen a model covers and there is no
        // `Reactor3D.Viewport` here to read that from. Without it the
        // budget half of the rule was skipped and every prop stayed at full
        // detail — the distance half alone can never coarsen a large model
        // on a small map. Computed once for the whole group, not per prop.
        let screen = null;
        if (Reactor3D.lodScreen && this.renderer) {
            const size = this.renderer.getSize(new THREE.Vector2());
            screen = Reactor3D.lodScreen(this.camera, size.x, size.y);
        }
        for (const object of group ? group.children : []) {
            if (object.userData && object.userData.lodKey) {
                Reactor3D.pickLod(object, Reactor3D.instanceSpan(object), eye, undefined, screen);
            }
        }
        // The placed models of the maps past the border, by the same rule.
        if (beside) neighbors.lods(this, eye, screen);
    }

    /**
     * Composite the placed lights over the frame, the way the game does: a
     * pass of their own, drawn last, blended by addition. `setPass` hides the
     * light group in every other pass on purpose — without this pass the
     * pools filled and the materials dimmed every frame, and the viewport
     * showed none of it.
     */
    /**
     * The map's main pass as the game's viewport draws it (Viewport.render and
     * renderInto): into a target at the game's render scale, the light and
     * the lights' haze worked out at a quarter size (Reactor3D.HalfLight,
     * HalfHaze), then enlarged onto the canvas (Reactor3D.SharpUpscale; at
     * full scale a plain copy). Without WebGL 2 it draws straight to the
     * canvas as it did. The later passes (star tiles, overlay, flat lights)
     * clear depth and draw over it on the canvas as before.
     */
    renderMainPass(scene) {
        const R3 = Reactor3D, renderer = this.renderer;
        const target = this.mainTarget();
        if (!target) { R3.renderScene(renderer, scene, this.camera); return; }
        const haze = R3.HalfHaze ? R3.HalfHaze.take(scene, target, this.camera) : null;
        const split = R3.HalfLight ? R3.HalfLight.begin(renderer, scene, target) : null;
        renderer.setRenderTarget(split ? split.albedo : target);
        try {
            R3.renderScene(renderer, scene, this.camera);
            if (split) R3.HalfLight.finish(renderer, scene, target, this.camera, split);
            if (haze) R3.HalfHaze.draw(renderer, target, this.camera, haze, split);
        } finally {
            if (split) R3.HalfLight.restore(split);
            if (haze) R3.HalfHaze.restore(haze);
            renderer.setRenderTarget(null);
        }
        const size = renderer.getDrawingBufferSize(this._drawSize || (this._drawSize = new THREE.Vector2()));
        R3.SharpUpscale.draw(renderer, target, null, target.width < size.x ? undefined : 0);
    }

    /** The main pass's target: the canvas's size at the game's render scale, its depth readable. */
    mainTarget() {
        const R3 = Reactor3D;
        if (!R3.HalfLight || !R3.SharpUpscale || !THREE.DepthTexture) return null;
        const gl = this.renderer.getContext();
        if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) return null;
        const size = this.renderer.getDrawingBufferSize(this._drawSize || (this._drawSize = new THREE.Vector2()));
        const scale = Math.min(1, Math.max(0.25, R3.renderScale || 1));
        const width = Math.max(1, Math.round(size.x * scale)), height = Math.max(1, Math.round(size.y * scale));
        let target = this._mainTarget;
        if (target && target.width === width && target.height === height) return target;
        if (target) target.dispose();
        target = this._mainTarget = new THREE.WebGLRenderTarget(width, height, {
            depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
            colorSpace: THREE.SRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
            depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType)
        });
        // Encoded in the shader and stored as bytes, as the game's passes are
        // (Viewport.createTarget), so the enlargement copies what the canvas held.
        target.isXRRenderTarget = true;
        target.texture.internalFormat = 'RGBA8';
        // Allocated now, its depth with it, as the game's are: the unlit target
        // shares that depth and must find it made.
        this.renderer.initRenderTarget(target);
        return target;
    }

    renderLightsPass(scene) {
        const mapScene = this.mapScene;
        if (!mapScene || typeof mapScene.setPass !== 'function') return;
        if (!mapScene.hasLights || !mapScene.hasLights()) return;
        const background = scene.background;
        const autoClear = this.renderer.autoClear;
        // Only the light group draws in this pass. `setPass` hides the map's
        // own groups, but the editor hangs its props, events, grid, hover
        // cell and effect quads off the scene directly, and every one of
        // them was drawn a second time here — the Demo's model props alone
        // put 7.7 million triangles through the GPU again per frame, for a
        // pass that composites nothing but additive quads.
        const lightGroup = typeof mapScene.lightGroup === 'function' ? mapScene.lightGroup() : null;
        const hidden = [];
        try {
            for (const child of scene.children) {
                if (child === lightGroup || !child.visible) continue;
                child.visible = false;
                hidden.push(child);
            }
            scene.background = null;
            this.renderer.autoClear = false;
            this.renderer.clearDepth();
            mapScene.setPass('lights');
            Reactor3D.renderScene(this.renderer, scene, this.camera);
        } finally {
            scene.background = background;
            this.renderer.autoClear = autoClear;
            for (const child of hidden) child.visible = true;
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

/** The window-wide input that marks the view for a draw (see `attachInput`). */
MapEditor3D.INPUT_EVENTS = ['pointerdown', 'pointerup', 'pointermove', 'keydown', 'keyup', 'wheel', 'input', 'change', 'click'];
/** How often a still view draws anyway: the net under a change nobody announced. */
MapEditor3D.IDLE_INTERVAL_MS = 1000;
/** How often a still view under a drifting sky draws: just under two frames, so every other one. */
MapEditor3D.SKY_INTERVAL_MS = 30;
/** How long the view keeps drawing after a change: a reflection capture's six faces, and a follow-up a frame late. */
MapEditor3D.ACTIVE_TAIL_MS = 500;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapEditor3D;
}

// A default on the prototype, so an instance built without the constructor —
// which the viewport tests do, to avoid three.js and the DOM — still measures
// in whole tiles rather than in undefined.
MapEditor3D.prototype.tileSize = 48;
