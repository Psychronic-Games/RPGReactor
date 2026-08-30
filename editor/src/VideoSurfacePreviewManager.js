/**
 * Editor-only previews for native Reactor video-surface commands.
 * Preview state never enters map data or the runtime surface registry.
 */
class VideoSurfacePreviewManager {
    constructor(projectController, databaseManager) {
        this.projectController = projectController;
        this.databaseManager = databaseManager;
        this.map = null;
        this.tilemapManager = null;
        this.records = [];
        this.pixiOwners = new Map();
        this.threeOwners = new Map();
        this.domOwners = new Map();
        this.authoring = null;
        this.destroyed = false;
        this._onEventsChanged = () => this.rescan();
        if (typeof document !== 'undefined') {
            document.addEventListener('rr-events-changed', this._onEventsChanged);
        }
    }

    static _copy(value) {
        if (Array.isArray(value)) return value.map(item => this._copy(item));
        if (value && typeof value === 'object') {
            const result = {};
            for (const [key, item] of Object.entries(value)) result[key] = this._copy(item);
            return result;
        }
        return value;
    }

    static _editorClass() {
        if (typeof VideoSurfaceEditor !== 'undefined') return VideoSurfaceEditor;
        if (typeof require === 'function') {
            try { return require('./event/commands/VideoSurfaceEditor.js'); } catch (_) {}
        }
        return null;
    }

    /** Reduce each event page independently without pretending to know runtime execution order. */
    static scanMap(map) {
        const Editor = this._editorClass();
        if (!Editor || !map || !Array.isArray(map.events)) return [];
        const records = [];
        const mapId = Number(map.id) || 0;
        for (const event of map.events) {
            if (!event || !Array.isArray(event.pages)) continue;
            event.pages.forEach((page, pageIndex) => {
                const active = new Map();
                const list = Array.isArray(page?.list) ? page.list : [];
                list.forEach((command, commandIndex) => {
                    if (command?.code !== 357 || command.parameters?.[0] !== 'RPGReactor') return;
                    const operation = command.parameters?.[1];
                    if (!Editor.supports(operation)) return;
                    const parsed = Editor.parse(command, operation);
                    if (!parsed) return;
                    const id = parsed.id;
                    const location = { mapId, eventId: Number(event.id), pageIndex, commandIndex };
                    if (operation === 'ShowVideoSurface') {
                        const replaced = active.get(id);
                        if (replaced) replaced.replacedAt = commandIndex;
                        const state = this._copy(parsed);
                        if (state.target === 'thisEvent') state.target = 'event';
                        if (state.target === 'event' && !(state.eventId > 0)) state.eventId = Number(event.id);
                        const present = parsed[Editor.META]?.presentFields;
                        const record = {
                            key: `${mapId}:${event.id}:${pageIndex}:${commandIndex}:${id}`,
                            id,
                            source: location,
                            ownerEventId: Number(event.id),
                            steps: [{ operation, source: location, state: this._copy(state) }],
                            state,
                            customCorners: !!present?.has('corners'),
                            stoppedAt: null,
                            replacedAt: null
                        };
                        active.set(id, record);
                        records.push(record);
                        return;
                    }
                    const current = active.get(id);
                    if (!current) return;
                    if (operation === 'StopVideoSurface') {
                        current.stoppedAt = commandIndex;
                        current.steps.push({ operation, source: location, state: this._copy(current.state) });
                        active.delete(id);
                        return;
                    }
                    const present = parsed[Editor.META]?.presentFields || new Set();
                    const sizeChanged = present.has('width') || present.has('height');
                    for (const field of Editor.SHOW_FIELDS) {
                        if (field === 'movie' || field === 'wait' || !present.has(field)) continue;
                        current.state[field] = this._copy(parsed[field]);
                    }
                    if (present.has('target') && current.state.target === 'thisEvent') {
                        current.state.target = 'event';
                        current.state.eventId = current.ownerEventId;
                    }
                    if (present.has('corners')) {
                        current.customCorners = true;
                    } else if (sizeChanged && !current.customCorners) {
                        const halfWidth = current.state.width / 2;
                        const halfHeight = current.state.height / 2;
                        current.state.corners = [
                            { x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight },
                            { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight }
                        ];
                    }
                    current.steps.push({ operation, source: location, state: this._copy(current.state) });
                });
            });
        }
        return records;
    }

    static stateBefore(context, id) {
        const list = Array.isArray(context?.page?.list) ? context.page.list : null;
        const event = context?.event;
        if (!list || !event) return null;
        const end = Number.isInteger(context.commandIndex) ? context.commandIndex : list.length;
        const pages = Array(Math.max(0, Number(context.pageIndex) || 0) + 1).fill(null);
        pages[pages.length - 1] = { ...(context.page || {}), list: list.slice(0, Math.max(0, end)) };
        const map = {
            id: Number(context.currentMap?.id) || 0,
            events: [null, {
                ...event,
                pages
            }]
        };
        const records = this.scanMap(map);
        return records.findLast(record => record.id === id
            && record.stoppedAt === null && record.replacedAt === null) || null;
    }

    beforeMapChange() {
        const editor = this.authoring?.editor;
        if (editor) {
            editor.close?.(true);
            this.projectController?.eventManager?.eventEditor?.cancelChanges?.();
        }
        this.authoring = null;
        this._cancelActiveDrag?.();
        this.detachPixi();
        this.detachThree();
        this.detachDom();
        this.map = null;
        this.tilemapManager = null;
        this.records = [];
    }

    setMap(map, tilemapManager) {
        if (this.destroyed) return;
        this.detachPixi();
        this.detachThree();
        this.detachDom();
        this.map = map || null;
        this.tilemapManager = tilemapManager || null;
        this.rescan();
    }

    rescan() {
        if (this.destroyed || !this.map) return;
        this.records = VideoSurfacePreviewManager.scanMap(this.map);
        this.refreshBackend();
    }

    refreshBackend() {
        if (this.destroyed) return;
        const map3d = this.projectController?.mapEditor3D;
        if (map3d?.enabled && map3d.mapScene) {
            this.detachPixi();
            this.detachThree();
            this.detachDom();
            this.attachThree(map3d);
            this.attachDomScreen();
        } else {
            this.detachThree();
            this.detachDom();
            this.detachPixi();
            this.attachPixi();
        }
    }

    /** The toolbar's Video box: saved previews can be hidden; an edit in progress always shows. */
    setEnabled(enabled) {
        const next = enabled !== false;
        if (this.enabled === next) return;
        this.enabled = next;
        this.refreshBackend();
    }

    _visibleRecords() {
        const replacedKey = this.authoring?.replacedKey;
        const records = this.enabled === false ? [] : this.records.filter(record => record.stoppedAt === null
            && record.replacedAt === null && record.key !== replacedKey);
        if (this.authoring?.data) {
            records.push({
                key: '__authoring__',
                id: this.authoring.data.id,
                source: null,
                ownerEventId: Number(this.authoring.context?.event?.id) || 0,
                state: this.authoring.data,
                authoring: true
            });
        }
        return records;
    }

    _projectPath() {
        return this.projectController?.getCurrentProject?.()?.path
            || this.projectController?.currentProject?.path || null;
    }

    _movieUrl(movie) {
        const root = this._projectPath();
        const Editor = VideoSurfacePreviewManager._editorClass();
        if (!root || !Editor?.safeMoviePath(movie) || typeof require !== 'function') return '';
        const path = require('path');
        const absolute = path.join(root, 'movies', ...String(movie).split('/'));
        let assets = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : null;
        if (!assets) {
            try { assets = require('./utils/AssetFiles.js'); } catch (_) {}
        }
        return assets?.toUrl ? assets.toUrl(absolute) : `file://${absolute.replace(/\\/g, '/')}`;
    }

    _createMedia(state) {
        if (typeof document === 'undefined') return null;
        const video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.playbackRate = Math.max(0.05, Number(state.playbackRate) || 1);
        const url = this._movieUrl(state.movie);
        if (url) {
            video.src = url;
        }
        return video;
    }

    /**
     * Previews must keep playing on their own: a play() issued before the
     * element has data is dropped whenever something restarts the load (PIXI's
     * VideoSource does exactly that), so retry once a frame is decodable.
     */
    _keepPlaying(owner, video) {
        if (!video?.src) return;
        const resume = () => {
            if (owner.destroyed || !video.paused) return;
            video.play?.().catch?.(() => {});
        };
        video.addEventListener('canplay', resume);
        video.addEventListener('loadeddata', resume);
        owner.listeners.push(() => {
            video.removeEventListener('canplay', resume);
            video.removeEventListener('loadeddata', resume);
        });
        resume();
    }

    _placeholderCanvas(state) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.min(1024, Math.round(state.width) || 320));
        canvas.height = Math.max(2, Math.min(1024, Math.round(state.height) || 180));
        const context = canvas.getContext('2d');
        if (context) {
            const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#173246');
            gradient.addColorStop(1, '#251b3c');
            context.fillStyle = gradient;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.strokeStyle = '#4dcdff';
            context.lineWidth = Math.max(2, canvas.width / 160);
            context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
            context.fillStyle = '#d7f4ff';
            context.font = `${Math.max(12, Math.round(canvas.width / 20))}px sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(`Video Surface ${state.id || ''}`, canvas.width / 2, canvas.height / 2);
        }
        return canvas;
    }

    _textureForPixi(state, owner) {
        // The placeholder stays on the mesh until the movie has decoded a
        // frame. A GPU texture that never received pixels samples as
        // transparent, which made the surface vanish the moment a movie was
        // chosen and before (or without) playback.
        owner.canvas = this._placeholderCanvas(state);
        owner.placeholderSource = new PIXI.CanvasSource({ resource: owner.canvas });
        owner.placeholderTexture = new PIXI.Texture({ source: owner.placeholderSource });
        const video = this._createMedia(state);
        owner.video = video;
        if (video?.src && typeof PIXI.VideoSource === 'function') {
            // One load() call, ours, so its rejection (the texture destroyed
            // mid-load when the preview is torn down) has a handler.
            owner.source = new PIXI.VideoSource({
                resource: video, autoLoad: false, autoPlay: true, updateFPS: 0
            });
            owner.texture = new PIXI.Texture({ source: owner.source, dynamic: true });
            owner.source.load?.().catch?.(() => {});
            const showVideo = () => {
                if (owner.destroyed || !owner.mesh || !owner.source?.isValid) return;
                if (video.readyState < 2) return;
                if (owner.mesh.texture !== owner.texture) owner.mesh.texture = owner.texture;
                video.removeEventListener('playing', showVideo);
                video.removeEventListener('timeupdate', showVideo);
            };
            video.addEventListener('playing', showVideo);
            video.addEventListener('timeupdate', showVideo);
            owner.listeners.push(() => {
                video.removeEventListener('playing', showVideo);
                video.removeEventListener('timeupdate', showVideo);
            });
            this._keepPlaying(owner, video);
        }
        return owner.placeholderTexture;
    }

    attachPixi() {
        if (this.destroyed || this.pixiOwners.size || !this.tilemapManager?.container
            || typeof PIXI === 'undefined' || typeof PIXI.PerspectiveMesh !== 'function') return;
        const app = this.tilemapManager.app;
        this.pixiBands = {};
        for (const band of VideoSurfacePreviewManager.PIXI_BANDS) {
            const root = new PIXI.Container();
            root.label = `Video Surface Previews (${band})`;
            root.sortableChildren = true;
            this.pixiBands[band] = root;
        }
        this.pixiMapRoot = this.pixiBands.mid;
        this.pixiScreenRoot = new PIXI.Container();
        this.pixiScreenRoot.label = 'Screen Video Surface Previews';
        this.pixiScreenRoot.sortableChildren = true;
        this._placePixiBands();
        app?.stage?.addChild(this.pixiScreenRoot);
        for (const record of this._visibleRecords()) this._createPixiOwner(record);
    }

    /**
     * The game sorts a surface among the tilemap's children by `layer`:
     * below every tile for negative layers, between the lower and upper
     * tile layers up to 3 (where characters live), above the upper tiles at
     * 4, and above characters from 5. The editor draws its tiles as separate
     * containers, so each band is a root inserted at the matching boundary.
     */
    static get PIXI_BANDS() { return ['under', 'mid', 'over', 'top']; }

    static pixiBandFor(layer) {
        const value = Number(layer) || 0;
        return value < 0 ? 'under' : value < 4 ? 'mid' : value < 5 ? 'over' : 'top';
    }

    _placePixiBands() {
        const tm = this.tilemapManager;
        const container = tm?.container;
        if (!container || !this.pixiBands) return;
        const layers = tm.layers || {};
        const events = this.projectController?.eventManager?.eventContainer;
        const insert = (root, before, after) => {
            if (before?.parent === container) container.addChildAt(root, container.getChildIndex(before));
            else if (after?.parent === container) container.addChildAt(root, container.getChildIndex(after) + 1);
            else container.addChild(root);
        };
        insert(this.pixiBands.under, layers.ground, layers.parallax);
        insert(this.pixiBands.mid, layers.upper0, layers.a1lower3);
        insert(this.pixiBands.over, events?.parent === container ? events : layers.layerHighlight, layers.upper3);
        insert(this.pixiBands.top, null, events?.parent === container ? events : this.pixiBands.over);
    }

    _pixiRootFor(state) {
        if (state.target === 'screen') return this.pixiScreenRoot;
        return this.pixiBands?.[VideoSurfacePreviewManager.pixiBandFor(state.layer)] || this.pixiMapRoot;
    }

    _createPixiOwner(record) {
        const state = record.state;
        const root = this._pixiRootFor(state);
        if (!root) return;
        const owner = {
            record, state, backend: 'pixi', listeners: [],
            movie: state.movie, target: state.target
        };
        try {
            owner.container = new PIXI.Container();
            owner.mesh = new PIXI.PerspectiveMesh({ texture: this._textureForPixi(state, owner) });
            owner.container.addChild(owner.mesh);
            root.addChild(owner.container);
            this.pixiOwners.set(record.key, owner);
            this._bindPixiOwner(owner);
            this._updatePixiOwner(owner);
        } catch (error) {
            console.warn('Could not create an editor video-surface preview:', error);
            this._cleanupPixiOwner(owner);
        }
    }

    _transformedCorners(state) {
        const radians = Math.PI / 180;
        const rx = Number(state.rotationX) * radians;
        const ry = Number(state.rotationY) * radians;
        const rz = Number(state.rotationZ) * radians;
        const sx = Math.sin(rx), cx = Math.cos(rx);
        const sy = Math.sin(ry), cy = Math.cos(ry);
        const sz = Math.sin(rz), cz = Math.cos(rz);
        const distance = Math.max(Number(state.width), Number(state.height), 1) * 4;
        return state.corners.map(corner => {
            let x = corner.x * state.scaleX;
            let y = corner.y * state.scaleY * cx;
            let z = corner.y * state.scaleY * sx;
            const nextX = x * cy + z * sy;
            z = -x * sy + z * cy;
            x = nextX;
            const px = x * cz - y * sz;
            const py = x * sz + y * cz;
            const perspective = distance / Math.max(distance * 0.1, distance + z);
            return { x: px * perspective, y: py * perspective };
        });
    }

    _eventFor(state, ownerEventId) {
        const eventId = state.target === 'thisEvent' ? ownerEventId
            : state.target === 'event' ? Number(state.eventId) || ownerEventId : 0;
        return this.map?.events?.find(event => event && Number(event.id) === eventId) || null;
    }

    /**
     * Map, event and player surfaces stand on their anchor, as in 3D; screen
     * ones are centered. Z is 3D elevation only and never moves the 2D
     * placement, which the drag sets directly.
     */
    static standingLift(state) {
        if (state.target === 'screen') return 0;
        return Number(state.height) * Math.abs(Number(state.scaleY)) / 2;
    }

    _anchor2d(state, ownerEventId) {
        const tileWidth = this.tilemapManager?.TILE_WIDTH || 48;
        const tileHeight = this.tilemapManager?.TILE_HEIGHT || tileWidth;
        const lift = VideoSurfacePreviewManager.standingLift(state);
        if (state.target === 'screen') return { x: Number(state.x), y: Number(state.y), valid: true };
        if (state.target === 'map') {
            return { x: (Number(state.x) + 0.5) * tileWidth, y: (Number(state.y) + 0.5) * tileHeight - lift, valid: true };
        }
        const event = this._eventFor(state, ownerEventId);
        if (event) {
            return {
                x: (Number(event.x) + 0.5) * tileWidth + Number(state.x),
                y: (Number(event.y) + 1) * tileHeight + Number(state.y) - lift,
                valid: true
            };
        }
        if (state.target === 'player') {
            const system = this.databaseManager?.getSystem?.();
            if (system && Number(system.startMapId) === Number(this.map?.id)) {
                return {
                    x: (Number(system.startX) + 0.5) * tileWidth + Number(state.x),
                    y: (Number(system.startY) + 1) * tileHeight + Number(state.y) - lift,
                    valid: true
                };
            }
        }
        return { x: 0, y: 0, valid: false };
    }

    /**
     * Re-express a surface's position when its target changes so the panel
     * stays where it is on screen. Screen positions are stage pixels, map
     * positions are tiles, and bound targets are pixel offsets from their
     * anchor. Returns null when the 2D preview cannot place either target.
     */
    convertTargetPosition(state, previousTarget, ownerEventId) {
        if (!previousTarget || previousTarget === state.target) return null;
        if (!this.pixiOwners.size) return null;
        const tm = this.tilemapManager;
        const scale = tm?.container?.scale?.x || 1;
        const offset = { x: tm?.container?.x || 0, y: tm?.container?.y || 0 };
        const before = this._anchor2d({ ...state, target: previousTarget }, ownerEventId);
        if (!before.valid) return null;
        const root = previousTarget === 'screen'
            ? { x: (before.x - offset.x) / scale, y: (before.y - offset.y) / scale }
            : { x: before.x, y: before.y };
        const round = value => Math.round(value * 100) / 100;
        if (state.target === 'screen') {
            return { x: round(root.x * scale + offset.x), y: round(root.y * scale + offset.y) };
        }
        const tileWidth = tm?.TILE_WIDTH || 48;
        const tileHeight = tm?.TILE_HEIGHT || tileWidth;
        if (state.target === 'map') {
            const lift = VideoSurfacePreviewManager.standingLift(state);
            return { x: round(root.x / tileWidth - 0.5), y: round((root.y + lift) / tileHeight - 0.5) };
        }
        const base = this._anchor2d({ ...state, x: 0, y: 0 }, ownerEventId);
        if (!base.valid) return null;
        return { x: round(root.x - base.x), y: round(root.y - base.y) };
    }

    _updatePixiOwner(owner) {
        const state = owner.state;
        const corners = this._transformedCorners(state);
        owner.mesh?.setCorners?.(corners[0].x, corners[0].y, corners[1].x, corners[1].y,
            corners[2].x, corners[2].y, corners[3].x, corners[3].y);
        const anchor = this._anchor2d(state, owner.record.ownerEventId);
        const root = this._pixiRootFor(state);
        if (root && owner.container.parent !== root) root.addChild(owner.container);
        owner.container.visible = anchor.valid;
        owner.container.position.set(anchor.x, anchor.y);
        owner.container.alpha = Math.max(0, Math.min(255, Number(state.opacity))) / 255;
        owner.container.zIndex = Number(state.layer) + Number(state.depth) / 10000;
        this._syncPixiScanlines(owner, corners);
        if (owner.record.authoring) this._syncPixiHandles(owner, corners);
    }

    static scanlineAmount(state) {
        return Math.max(0, Math.min(1, Number(state.scanlines) || 0));
    }

    /** Same look as the game and PSYCHRONIC_VideoOverlay: a 1px dark line every other pixel, multiplied over the video. */
    _syncPixiScanlines(owner, corners) {
        const state = owner.state;
        const amount = VideoSurfacePreviewManager.scanlineAmount(state);
        const width = Math.max(1, Math.min(2048, Math.round(Number(state.width)) || 1));
        const height = Math.max(1, Math.min(2048, Math.round(Number(state.height)) || 1));
        const key = `${amount}:${width}:${height}`;
        if (!amount || owner.scanKey !== key) {
            if (owner.scanMesh) {
                try { owner.scanMesh.parent?.removeChild(owner.scanMesh); owner.scanMesh.destroy(); } catch (_) {}
                try { owner.scanTexture?.destroy?.(true); } catch (_) {}
                owner.scanMesh = null;
                owner.scanTexture = null;
                owner.scanKey = null;
            }
            if (!amount) return;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = `rgba(0,0,0,${amount * 0.5})`;
                for (let y = 0; y < height; y += 2) context.fillRect(0, y, width, 1);
            }
            owner.scanTexture = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas }) });
            owner.scanMesh = new PIXI.PerspectiveMesh({ texture: owner.scanTexture });
            owner.scanMesh.blendMode = 'multiply';
            owner.scanMesh.eventMode = 'none';
            owner.scanKey = key;
            owner.container.addChildAt(owner.scanMesh, owner.container.getChildIndex(owner.mesh) + 1);
        }
        owner.scanMesh.setCorners?.(corners[0].x, corners[0].y, corners[1].x, corners[1].y,
            corners[2].x, corners[2].y, corners[3].x, corners[3].y);
    }

    _makeHandle(label, edge = false) {
        const handle = new PIXI.Graphics();
        if (edge && handle.rect && handle.fill && handle.stroke) {
            handle.rect(-7, -5, 14, 10).fill(0x9c4dff).stroke({ width: 2, color: 0xffffff });
        } else if (handle.circle && handle.fill && handle.stroke) {
            handle.circle(0, 0, 8).fill(0x3faee8).stroke({ width: 2, color: 0xffffff });
        } else {
            handle.beginFill?.(edge ? 0x9c4dff : 0x3faee8);
            handle.lineStyle?.(2, 0xffffff);
            if (edge) handle.drawRect?.(-7, -5, 14, 10);
            else handle.drawCircle?.(0, 0, 8);
            handle.endFill?.();
        }
        handle.eventMode = 'static';
        handle.cursor = edge ? 'move' : 'crosshair';
        handle.label = label;
        if (edge && typeof PIXI.Rectangle === 'function') handle.hitArea = new PIXI.Rectangle(-11, -9, 22, 18);
        else if (!edge && typeof PIXI.Circle === 'function') handle.hitArea = new PIXI.Circle(0, 0, 13);
        return handle;
    }

    _syncPixiHandles(owner, corners) {
        if (!owner.handles) {
            const specs = [
                { corners: [0], label: 'Top-left video surface corner' },
                { corners: [1], label: 'Top-right video surface corner' },
                { corners: [2], label: 'Bottom-right video surface corner' },
                { corners: [3], label: 'Bottom-left video surface corner' },
                { corners: [0, 1], label: 'Top video surface edge', edge: true },
                { corners: [1, 2], label: 'Right video surface edge', edge: true },
                { corners: [2, 3], label: 'Bottom video surface edge', edge: true },
                { corners: [3, 0], label: 'Left video surface edge', edge: true }
            ];
            owner.handleSpecs = specs;
            owner.handles = specs.map(spec => {
                const handle = this._makeHandle(spec.label, spec.edge);
                owner.container.addChild(handle);
                const down = event => this._startPixiDrag(event, owner, spec);
                handle.on('pointerdown', down);
                owner.listeners.push(() => handle.off('pointerdown', down));
                return handle;
            });
        }
        owner.handles.forEach((handle, index) => {
            const points = owner.handleSpecs[index].corners.map(corner => corners[corner]);
            handle.position.set(
                points.reduce((sum, point) => sum + point.x, 0) / points.length,
                points.reduce((sum, point) => sum + point.y, 0) / points.length
            );
        });
        this._syncPixiAnchor(owner);
    }

    _syncPixiAnchor(owner) {
        const state = owner.state;
        const bound = state.target === 'thisEvent' || state.target === 'event' || state.target === 'player';
        if (!bound) {
            if (owner.anchor) owner.anchor.visible = false;
            return;
        }
        if (!owner.anchor) {
            const anchor = new PIXI.Graphics();
            if (anchor.circle && anchor.moveTo && anchor.lineTo && anchor.stroke) {
                anchor.circle(0, 0, 10).moveTo(-13, 0).lineTo(13, 0)
                    .moveTo(0, -13).lineTo(0, 13).stroke({ width: 2, color: 0xffd166 });
            } else {
                anchor.lineStyle?.(2, 0xffd166);
                anchor.drawCircle?.(0, 0, 10);
                anchor.moveTo?.(-13, 0); anchor.lineTo?.(13, 0);
                anchor.moveTo?.(0, -13); anchor.lineTo?.(0, 13);
            }
            anchor.eventMode = 'none';
            owner.container.addChildAt(anchor, 0);
            owner.anchor = anchor;
        }
        owner.anchor.visible = true;
        owner.anchor.position.set(-Number(state.x), -Number(state.y));
    }

    /** A saved surface on the current map can be edited straight from the preview. */
    canEdit(record) {
        return !!record?.source && !record.authoring && !this.authoring && !this.destroyed
            && Number(record.source.mapId) === Number(this.map?.id);
    }

    /**
     * Open the surface's Show command in the video panel. OK writes the
     * edited command back into the event page; the panel also offers a jump
     * to that command in the event editor.
     */
    editRecord(record) {
        if (!this.canEdit(record)) return false;
        const Editor = VideoSurfacePreviewManager._editorClass();
        if (!Editor) return false;
        const { eventId, pageIndex, commandIndex } = record.source;
        const event = this.map.events?.find(item => item && Number(item.id) === Number(eventId));
        const page = event?.pages?.[pageIndex];
        const command = page?.list?.[commandIndex];
        if (!command || command.code !== 357 || command.parameters?.[0] !== 'RPGReactor') return false;
        if (!this.mapEditor) this.mapEditor = new Editor(this.databaseManager, this.projectController);
        const context = {
            type: 'map', event, page, pageIndex, commandIndex, currentMap: this.map,
            editing: true, fromMap: true, source: { ...record.source }
        };
        return this.mapEditor.show(command, built => {
            if (!built || page.list[commandIndex] !== command) return;
            const List = typeof EventCommandList !== 'undefined' ? EventCommandList : null;
            if (List?.replaceContiguousBlock) List.replaceContiguousBlock(page.list, commandIndex, built, 357, 657);
            else page.list[commandIndex] = built;
            this.rescan();
            if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
                document.dispatchEvent(new CustomEvent('rr-events-changed'));
            }
        }, command.parameters[1], context);
    }

    _bindPixiOwner(owner) {
        const mesh = owner.mesh;
        mesh.eventMode = 'static';
        mesh.cursor = owner.record.authoring ? 'move' : 'pointer';
        const right = event => {
            event.stopPropagation?.();
            if (owner.record.source) this.navigateTo(owner.record.source);
        };
        mesh.on('rightdown', right);
        owner.listeners.push(() => mesh.off('rightdown', right));
        if (!owner.record.authoring) {
            const down = event => {
                // The surface is an editable object: a click on it must not
                // paint or select whatever lies underneath.
                if ((event.button ?? event.data?.button) === 0 && this.canEdit(owner.record)) event.stopPropagation?.();
            };
            const tap = event => {
                if ((event.button ?? event.data?.button) !== 0) return;
                if (this.editRecord(owner.record)) event.stopPropagation?.();
            };
            mesh.on('pointerdown', down);
            mesh.on('pointertap', tap);
            owner.listeners.push(() => { mesh.off('pointerdown', down); mesh.off('pointertap', tap); });
        }
        if (owner.record.authoring) {
            const down = event => {
                if ((event.button ?? event.data?.button) === 2) return;
                this._startPixiDrag(event, owner, null);
            };
            mesh.on('pointerdown', down);
            owner.listeners.push(() => mesh.off('pointerdown', down));
        }
    }

    _clientToOwner(owner, clientX, clientY) {
        const canvas = this.tilemapManager?.app?.canvas;
        const rect = canvas?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) return null;
        const screen = this.tilemapManager.app.renderer?.screen;
        const point = new PIXI.Point(
            (clientX - rect.left) * (screen?.width || rect.width) / rect.width,
            (clientY - rect.top) * (screen?.height || rect.height) / rect.height
        );
        const root = owner.state.target === 'screen' ? this.pixiScreenRoot : this.tilemapManager.container;
        return root?.toLocal ? root.toLocal(point) : point;
    }

    _startPixiDrag(event, owner, handleSpec) {
        this._cancelActiveDrag?.();
        const originalEvent = event.nativeEvent || event.data?.originalEvent || event;
        const start = this._clientToOwner(owner, originalEvent.clientX, originalEvent.clientY);
        if (!start) return;
        event.stopPropagation?.();
        originalEvent.preventDefault?.();
        const state = owner.state;
        const original = { x: Number(state.x), y: Number(state.y) };
        const originalCorners = state.corners.map(corner => ({ ...corner }));
        const anchorAtStart = this._anchor2d(state, owner.record.ownerEventId);
        const startLocal = handleSpec ? this._inverseCorner(state, {
            x: start.x - anchorAtStart.x, y: start.y - anchorAtStart.y
        }) : null;
        const move = moveEvent => {
            const point = this._clientToOwner(owner, moveEvent.clientX, moveEvent.clientY);
            if (!point) return;
            if (handleSpec === null) {
                const dx = point.x - start.x;
                const dy = point.y - start.y;
                if (state.target === 'map') {
                    state.x = original.x + dx / (this.tilemapManager?.TILE_WIDTH || 48);
                    state.y = original.y + dy / (this.tilemapManager?.TILE_HEIGHT || 48);
                } else {
                    state.x = original.x + dx;
                    state.y = original.y + dy;
                }
                this._authoringChanged(['x', 'y']);
            } else {
                const anchor = this._anchor2d(state, owner.record.ownerEventId);
                const local = this._inverseCorner(state, {
                    x: point.x - anchor.x, y: point.y - anchor.y
                });
                if (handleSpec.corners.length === 1) {
                    state.corners[handleSpec.corners[0]] = local;
                } else {
                    VideoSurfacePreviewManager.resizeEdge(state.corners, originalCorners,
                        handleSpec.corners, startLocal, local);
                }
                const xs = state.corners.map(corner => corner.x);
                const ys = state.corners.map(corner => corner.y);
                state.width = Math.max(...xs) - Math.min(...xs);
                state.height = Math.max(...ys) - Math.min(...ys);
                this._authoringChanged(['corners', 'width', 'height']);
            }
            this._updatePixiOwner(owner);
        };
        const end = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('pointercancel', end, true);
            if (this._cancelActiveDrag === end) this._cancelActiveDrag = null;
        };
        this._cancelActiveDrag = end;
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
    }

    /**
     * An edge handle resizes: both corners move only along the edge's normal,
     * so the surface grows or shrinks without shearing. Free movement along the
     * edge belongs to the corner handles, which warp.
     */
    static resizeEdge(corners, originalCorners, indices, startLocal, local) {
        const [first, second] = indices.map(index => originalCorners[index]);
        const edgeX = second.x - first.x;
        const edgeY = second.y - first.y;
        const length = Math.hypot(edgeX, edgeY);
        const normalX = length ? -edgeY / length : 0;
        const normalY = length ? edgeX / length : 1;
        const distance = (local.x - startLocal.x) * normalX + (local.y - startLocal.y) * normalY;
        for (const index of indices) {
            corners[index] = {
                x: originalCorners[index].x + normalX * distance,
                y: originalCorners[index].y + normalY * distance
            };
        }
        return corners;
    }

    _inverseCorner(state, target) {
        let local = { ...target };
        const transformed = point => {
            const corners = state.corners;
            state.corners = [point, point, point, point];
            const value = this._transformedCorners(state)[0];
            state.corners = corners;
            return value;
        };
        for (let iteration = 0; iteration < 8; iteration++) {
            const at = transformed(local);
            const errorX = target.x - at.x;
            const errorY = target.y - at.y;
            if (Math.hypot(errorX, errorY) < 0.01) break;
            const fx = transformed({ x: local.x + 0.01, y: local.y });
            const fy = transformed({ x: local.x, y: local.y + 0.01 });
            const a = (fx.x - at.x) / 0.01;
            const b = (fy.x - at.x) / 0.01;
            const c = (fx.y - at.y) / 0.01;
            const d = (fy.y - at.y) / 0.01;
            const determinant = a * d - b * c;
            if (Math.abs(determinant) < 1e-8) break;
            local.x += (errorX * d - b * errorY) / determinant;
            local.y += (a * errorY - errorX * c) / determinant;
        }
        return local;
    }

    _cleanupPixiOwner(owner) {
        owner.destroyed = true;
        for (const cleanup of owner.listeners || []) cleanup();
        try { owner.container?.parent?.removeChild(owner.container); } catch (_) {}
        try { owner.container?.destroy?.({ children: true }); } catch (_) {}
        try { owner.texture?.destroy?.(true); } catch (_) {}
        try { owner.placeholderTexture?.destroy?.(true); } catch (_) {}
        try { owner.scanTexture?.destroy?.(true); } catch (_) {}
        this._cleanupMedia(owner.video);
    }

    detachPixi() {
        this._cancelActiveDrag?.();
        for (const owner of this.pixiOwners.values()) this._cleanupPixiOwner(owner);
        this.pixiOwners.clear();
        for (const root of [...Object.values(this.pixiBands || {}), this.pixiScreenRoot]) {
            try { root?.parent?.removeChild(root); } catch (_) {}
            try { root?.destroy?.({ children: true }); } catch (_) {}
        }
        this.pixiMapRoot = null;
        this.pixiBands = null;
        this.pixiScreenRoot = null;
    }

    _screenMetrics() {
        const system = this.databaseManager?.getSystem?.() || {};
        return {
            width: Math.max(1, Number(system.advanced?.screenWidth) || Number(system.screenWidth) || 816),
            height: Math.max(1, Number(system.advanced?.screenHeight) || Number(system.screenHeight) || 624)
        };
    }

    attachDomScreen() {
        const host = this.mapEditor3D?.container?.() || document.getElementById('canvas-container');
        if (!host || this.domRoot) return;
        const root = document.createElement('div');
        root.className = 'video-surface-screen-previews';
        root.style.cssText = 'position:absolute;inset:0;z-index:7;overflow:hidden;pointer-events:none;';
        host.appendChild(root);
        this.domRoot = root;
        for (const record of this._visibleRecords()) {
            if (record.state.target === 'screen') this._createDomOwner(record);
        }
    }

    _createDomOwner(record) {
        const owner = {
            record, state: record.state, listeners: [],
            movie: record.state.movie, target: record.state.target
        };
        const surface = document.createElement('div');
        surface.className = 'video-surface-screen-preview';
        surface.style.cssText = 'position:absolute;overflow:hidden;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 0 6px rgba(77,205,255,.45));background:linear-gradient(135deg,#173246,#251b3c);';
        owner.surface = surface;
        owner.video = this._createMedia(owner.state);
        if (owner.video?.src) {
            owner.video.style.cssText = 'width:100%;height:100%;display:block;object-fit:fill;pointer-events:none;';
            surface.appendChild(owner.video);
            this._keepPlaying(owner, owner.video);
        } else {
            surface.style.border = '1px solid #4dcdff';
        }
        owner.scan = document.createElement('div');
        owner.scan.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;';
        surface.appendChild(owner.scan);
        const context = event => {
            if (!record.source) return;
            event.preventDefault();
            event.stopPropagation();
            this.navigateTo(record.source);
        };
        surface.addEventListener('contextmenu', context);
        owner.listeners.push(() => surface.removeEventListener('contextmenu', context));
        if (!record.authoring) {
            const click = event => {
                if (event.button === 0 && this.editRecord(record)) event.stopPropagation();
            };
            surface.addEventListener('click', click);
            owner.listeners.push(() => surface.removeEventListener('click', click));
        }
        if (record.authoring) {
            surface.style.cursor = 'move';
            const down = event => {
                if (event.button === 0) this._startDomDrag(event, owner, null);
            };
            surface.addEventListener('pointerdown', down);
            owner.listeners.push(() => surface.removeEventListener('pointerdown', down));
            this._createDomHandles(owner);
        }
        this.domRoot.appendChild(surface);
        this.domOwners.set(record.key, owner);
        this._updateDomOwner(owner);
    }

    _createDomHandles(owner) {
        const specs = [
            { corners: [0], label: 'Top-left corner' }, { corners: [1], label: 'Top-right corner' },
            { corners: [2], label: 'Bottom-right corner' }, { corners: [3], label: 'Bottom-left corner' },
            { corners: [0, 1], label: 'Top edge', edge: true },
            { corners: [1, 2], label: 'Right edge', edge: true },
            { corners: [2, 3], label: 'Bottom edge', edge: true },
            { corners: [3, 0], label: 'Left edge', edge: true }
        ];
        owner.handleSpecs = specs;
        owner.handles = specs.map(spec => {
            const handle = document.createElement('button');
            handle.type = 'button';
            handle.title = spec.label;
            handle.style.cssText = `position:absolute;z-index:2;width:${spec.edge ? 14 : 16}px;height:${spec.edge ? 10 : 16}px;margin:${spec.edge ? '-5px -7px' : '-8px'};padding:0;border:2px solid #fff;border-radius:${spec.edge ? 3 : 50}%;background:${spec.edge ? '#9c4dff' : '#3faee8'};pointer-events:auto;cursor:${spec.edge ? 'move' : 'crosshair'};`;
            const down = event => this._startDomDrag(event, owner, spec);
            handle.addEventListener('pointerdown', down);
            owner.listeners.push(() => handle.removeEventListener('pointerdown', down));
            this.domRoot.appendChild(handle);
            return handle;
        });
    }

    _updateDomOwner(owner) {
        const metrics = this._screenMetrics();
        const width = this.domRoot?.clientWidth || metrics.width;
        const height = this.domRoot?.clientHeight || metrics.height;
        const scaleX = width / metrics.width;
        const scaleY = height / metrics.height;
        const corners = this._transformedCorners(owner.state).map(point => ({
            x: (Number(owner.state.x) + point.x) * scaleX,
            y: (Number(owner.state.y) + point.y) * scaleY
        }));
        const xs = corners.map(point => point.x);
        const ys = corners.map(point => point.y);
        const left = Math.min(...xs), top = Math.min(...ys);
        const boxWidth = Math.max(1, Math.max(...xs) - left);
        const boxHeight = Math.max(1, Math.max(...ys) - top);
        const scan = VideoSurfacePreviewManager.scanlineAmount(owner.state);
        if (owner.scan) {
            owner.scan.style.display = scan ? '' : 'none';
            owner.scan.style.background = scan
                ? `repeating-linear-gradient(rgba(0,0,0,${scan * 0.5}) 0 1px, transparent 1px 2px)` : '';
        }
        Object.assign(owner.surface.style, {
            left: `${left}px`, top: `${top}px`, width: `${boxWidth}px`, height: `${boxHeight}px`,
            opacity: String(Math.max(0, Math.min(255, owner.state.opacity)) / 255),
            zIndex: String(Math.round(Number(owner.state.layer) * 1000 + Number(owner.state.depth))),
            clipPath: `polygon(${corners.map(point =>
                `${(point.x - left) * 100 / boxWidth}% ${(point.y - top) * 100 / boxHeight}%`).join(',')})`
        });
        owner.handles?.forEach((handle, index) => {
            const points = owner.handleSpecs[index].corners.map(corner => corners[corner]);
            handle.style.left = `${points.reduce((sum, point) => sum + point.x, 0) / points.length}px`;
            handle.style.top = `${points.reduce((sum, point) => sum + point.y, 0) / points.length}px`;
        });
    }

    _domPoint(event) {
        const rect = this.domRoot?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) return null;
        const metrics = this._screenMetrics();
        return {
            x: (event.clientX - rect.left) * metrics.width / rect.width,
            y: (event.clientY - rect.top) * metrics.height / rect.height
        };
    }

    _startDomDrag(event, owner, spec) {
        this._cancelActiveDrag?.();
        event.preventDefault();
        event.stopPropagation();
        const start = this._domPoint(event);
        if (!start) return;
        const state = owner.state;
        const original = { x: Number(state.x), y: Number(state.y) };
        const originalCorners = state.corners.map(corner => ({ ...corner }));
        const startLocal = spec ? this._inverseCorner(state, {
            x: start.x - original.x, y: start.y - original.y
        }) : null;
        const move = moveEvent => {
            const point = this._domPoint(moveEvent);
            if (!point) return;
            if (!spec) {
                state.x = original.x + point.x - start.x;
                state.y = original.y + point.y - start.y;
                this._authoringChanged(['x', 'y']);
            } else {
                const local = this._inverseCorner(state, { x: point.x - state.x, y: point.y - state.y });
                if (spec.corners.length === 1) state.corners[spec.corners[0]] = local;
                else VideoSurfacePreviewManager.resizeEdge(state.corners, originalCorners, spec.corners, startLocal, local);
                const xs = state.corners.map(corner => corner.x);
                const ys = state.corners.map(corner => corner.y);
                state.width = Math.max(...xs) - Math.min(...xs);
                state.height = Math.max(...ys) - Math.min(...ys);
                this._authoringChanged(['corners', 'width', 'height']);
            }
            this._updateDomOwner(owner);
        };
        const end = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('pointercancel', end, true);
            if (this._cancelActiveDrag === end) this._cancelActiveDrag = null;
        };
        this._cancelActiveDrag = end;
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
    }

    detachDom() {
        this._cancelActiveDrag?.();
        for (const owner of this.domOwners.values()) {
            for (const cleanup of owner.listeners || []) cleanup();
            owner.handles?.forEach(handle => handle.remove());
            owner.surface?.remove();
            this._cleanupMedia(owner.video);
        }
        this.domOwners.clear();
        this.domRoot?.remove();
        this.domRoot = null;
    }

    attachThree(mapEditor3D) {
        if (this.destroyed || !mapEditor3D?.mapScene || typeof THREE === 'undefined') return;
        if (this.threeOwners.size) this.detachThree();
        this.mapEditor3D = mapEditor3D;
        for (const record of this._visibleRecords()) {
            if (record.state.target === 'screen') continue;
            this._createThreeOwner(record, mapEditor3D);
        }
        this._attachThreeInput(mapEditor3D);
    }

    _createThreeOwner(record, mapEditor3D) {
        const state = record.state;
        const owner = {
            record, state, backend: 'three',
            movie: state.movie, target: state.target
        };
        try {
            owner.video = this._createMedia(state);
            if (owner.video?.src) owner.texture = new THREE.VideoTexture(owner.video);
            else {
                owner.canvas = this._placeholderCanvas(state);
                owner.texture = new THREE.CanvasTexture(owner.canvas);
            }
            owner.texture.generateMipmaps = false;
            if (THREE.SRGBColorSpace) owner.texture.colorSpace = THREE.SRGBColorSpace;
            if (THREE.LinearFilter) {
                owner.texture.minFilter = THREE.LinearFilter;
                owner.texture.magFilter = THREE.LinearFilter;
            }
            owner.listeners = [];
            this._keepPlaying(owner, owner.video);
            const tileSize = this.tilemapManager?.TILE_SIZE || 48;
            owner.geometry = new THREE.PlaneGeometry(state.width / tileSize, state.height / tileSize);
            owner.material = new THREE.MeshBasicMaterial({
                map: owner.texture,
                transparent: true,
                opacity: Math.max(0, Math.min(255, state.opacity)) / 255,
                side: THREE.DoubleSide,
                depthWrite: Number(state.opacity) >= 255
            });
            owner.mesh = new THREE.Mesh(owner.geometry, owner.material);
            owner.width = Number(state.width);
            owner.height = Number(state.height);
            owner.upper = Number(state.layer) >= 5;
            owner.mesh.userData.videoSurfaceSource = record.source;
            owner.mesh.userData.videoSurfaceAuthoring = !!record.authoring;
            const group = this._threeGroupFor(mapEditor3D.mapScene, state.layer);
            if (!group) throw new Error('The 3D map has no video-surface group.');
            group.add(owner.mesh);
            this.threeOwners.set(record.key, owner);
            if (record.authoring) this._buildSurfaceRings(owner, group);
            this._updateThreeOwner(owner);
        } catch (error) {
            console.warn('Could not create a 3D video-surface preview:', error);
            this._cleanupThreeOwner(owner);
        }
    }

    /**
     * Where a surface lives in the 3D scene, as in the game: layers below 5
     * share the world's depth buffer with the models; from 5 up they join the
     * above-characters overlay, which the viewport composites over the whole
     * map (MZ's z=5 draws over star tiles and characters alike).
     */
    _threeGroupFor(mapScene, layer) {
        if (!mapScene) return null;
        if (Number(layer) >= 5) return mapScene.aboveBillboardsGroup?.() || mapScene.aboveGroup?.() || null;
        return mapScene.modelsGroup?.() || null;
    }

    _worldPosition(state, ownerEventId) {
        const tileSize = this.tilemapManager?.TILE_SIZE || 48;
        let x;
        let z;
        if (state.target === 'map') {
            x = Number(state.x) + 0.5;
            z = Number(state.y) + 0.5;
        } else {
            const event = this._eventFor(state, ownerEventId);
            const system = this.databaseManager?.getSystem?.();
            const base = event || (state.target === 'player' && Number(system?.startMapId) === Number(this.map?.id)
                ? { x: system.startX, y: system.startY } : null);
            if (!base) return null;
            x = Number(base.x) + 0.5 + Number(state.x) / tileSize;
            z = Number(base.y) + 0.5 + Number(state.y) / tileSize;
        }
        const elevation = typeof Reactor3D !== 'undefined' && Reactor3D.elevationAt
            ? Reactor3D.elevationAt(this.map, Math.round(x - 0.5), Math.round(z - 0.5)) : 0;
        const lift = Number(state.height) / tileSize * Math.abs(Number(state.scaleY)) / 2;
        // Depth pushes the surface toward the camera in 3D (tiles), leaving
        // the 2D feet row alone.
        return { x, y: elevation + Number(state.z) + lift, z: z + (Number(state.depth) || 0) };
    }

    _updateThreeOwner(owner) {
        const state = owner.state;
        const tileSize = this.tilemapManager?.TILE_SIZE || 48;
        if (owner.width !== Number(state.width) || owner.height !== Number(state.height)) {
            const geometry = new THREE.PlaneGeometry(state.width / tileSize, state.height / tileSize);
            owner.geometry?.dispose?.();
            owner.geometry = geometry;
            owner.mesh.geometry = geometry;
            owner.width = Number(state.width);
            owner.height = Number(state.height);
        }
        const upper = Number(state.layer) >= 5;
        if (owner.upper !== upper) {
            const group = this._threeGroupFor(this.mapEditor3D?.mapScene, state.layer);
            if (group) group.add(owner.mesh);
            owner.upper = upper;
        }
        const point = this._worldPosition(state, owner.record.ownerEventId);
        owner.mesh.visible = !!point;
        if (!point) return;
        owner.mesh.position.set(point.x, point.y, point.z);
        owner.mesh.rotation.set(Number(state.rotationX) * Math.PI / 180,
            Number(state.rotationY) * Math.PI / 180, Number(state.rotationZ) * Math.PI / 180);
        owner.mesh.scale.set(Number(state.scaleX), Number(state.scaleY), 1);
        owner.material.opacity = Math.max(0, Math.min(255, Number(state.opacity))) / 255;
        owner.material.transparent = Number(state.opacity) < 255;
        owner.material.depthWrite = Number(state.opacity) >= 255;
        owner.material.needsUpdate = true;
        owner.mesh.renderOrder = Number(state.layer) * 1000 + Number(state.depth);
        if (Number(state.cullingDistance) > 0 && this.mapEditor3D?.camera?.position) {
            owner.mesh.visible = this.mapEditor3D.camera.position.distanceTo(owner.mesh.position)
                <= Number(state.cullingDistance) + Math.hypot(state.width, state.height) / 96;
        }
        this._syncThreeScanlines(owner);
        this._syncSurfaceRings(owner);
    }

    /**
     * Pose rings around the surface being authored, the same rings the model
     * picker puts around a model: yaw (green) turns about the up axis, pitch
     * (red) follows the turn, roll (blue) follows both. Dragging a ring
     * writes the matching rotation field.
     */
    _buildSurfaceRings(owner, group) {
        if (typeof THREE === 'undefined' || owner.rings) return;
        const tileSize = this.tilemapManager?.TILE_SIZE || 48;
        const radius = Math.max(Number(owner.state.width), Number(owner.state.height)) / tileSize * 0.6 + 0.2;
        const root = new THREE.Group();
        root.name = 'video-surface-rings';
        const makeRing = (color, orient) => {
            const ringGroup = new THREE.Group();
            const geometry = new THREE.TorusGeometry(radius, Math.max(0.02, radius * 0.018), 8, 64);
            const solid = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, fog: false }));
            const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthTest: false, depthWrite: false, fog: false }));
            ghost.renderOrder = 5;
            orient(solid);
            orient(ghost);
            ringGroup.add(solid);
            ringGroup.add(ghost);
            root.add(ringGroup);
            return { group: ringGroup, solid, ghost };
        };
        owner.rings = {
            root, radius,
            yaw: makeRing(0x3ddc84, mesh => { mesh.rotation.x = Math.PI / 2; }),
            pitch: makeRing(0xff5c5c, mesh => { mesh.rotation.y = Math.PI / 2; }),
            roll: makeRing(0x5ca8ff, () => {})
        };
        group.add(root);
        this._syncSurfaceRings(owner);
    }

    _syncSurfaceRings(owner) {
        const rings = owner.rings;
        if (!rings) return;
        rings.root.position.copy(owner.mesh.position);
        rings.root.visible = owner.mesh.visible;
        const yaw = Number(owner.state.rotationY) * Math.PI / 180;
        const pitch = Number(owner.state.rotationX) * Math.PI / 180;
        rings.pitch.group.rotation.set(0, yaw, 0);
        rings.roll.group.rotation.order = 'YXZ';
        rings.roll.group.rotation.set(pitch, yaw, 0);
    }

    _disposeSurfaceRings(owner) {
        const rings = owner.rings;
        if (!rings) return;
        try { rings.root.parent?.remove(rings.root); } catch (_) {}
        rings.root.traverse(node => {
            try { node.geometry?.dispose?.(); } catch (_) {}
            try { node.material?.dispose?.(); } catch (_) {}
        });
        owner.rings = null;
    }

    _emphasizeSurfaceRing(owner, axis, held) {
        const rings = owner?.rings;
        if (!rings) return;
        for (const key of ['yaw', 'pitch', 'roll']) {
            const mine = key === axis;
            rings[key].solid.material.opacity = mine ? (held ? 0.9 : 0.6) : (held && axis ? 0.08 : 0.3);
            rings[key].ghost.material.opacity = mine ? (held ? 0.14 : 0.08) : (held && axis ? 0.02 : 0.05);
        }
    }

    _threeInputRect() {
        const map3d = this.mapEditor3D;
        const surface = map3d?.inputSurface || map3d?.canvas;
        const rect = surface?.getBoundingClientRect?.();
        return rect?.width && rect?.height ? rect : null;
    }

    _ringPlanePoint(clientX, clientY, normal, centre) {
        const rect = this._threeInputRect();
        const camera = this.mapEditor3D?.camera;
        if (!rect || !camera) return null;
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const caster = new THREE.Raycaster();
        caster.setFromCamera(ndc, camera);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centre);
        const point = new THREE.Vector3();
        return caster.ray.intersectPlane(plane, point) ? point : null;
    }

    /** The ring under the pointer, chosen by screen distance to its drawn circle. */
    _pickSurfaceRing(owner, clientX, clientY) {
        const rings = owner?.rings;
        const camera = this.mapEditor3D?.camera;
        const rect = this._threeInputRect();
        if (!rings || !rings.root.visible || !camera || !rect || typeof THREE === 'undefined') return null;
        const radius = rings.radius;
        const camPos = camera.getWorldPosition(new THREE.Vector3());
        const centre = rings.root.getWorldPosition(new THREE.Vector3());
        const nearest = {};
        for (const key of ['yaw', 'pitch', 'roll']) {
            const q = rings[key].group.getWorldQuaternion(new THREE.Quaternion());
            let best = null;
            for (let i = 0; i < 72; i++) {
                const t = (i / 72) * Math.PI * 2;
                const world = (key === 'yaw' ? new THREE.Vector3(radius * Math.cos(t), 0, radius * Math.sin(t))
                    : key === 'pitch' ? new THREE.Vector3(0, radius * Math.cos(t), radius * Math.sin(t))
                        : new THREE.Vector3(radius * Math.cos(t), radius * Math.sin(t), 0)).applyQuaternion(q).add(centre);
                const v = world.clone().project(camera);
                if (v.z > 1) continue;
                const sx = rect.left + (v.x + 1) / 2 * rect.width;
                const sy = rect.top + (1 - v.y) / 2 * rect.height;
                const d = Math.hypot(sx - clientX, sy - clientY);
                if (!best || d < best.d) best = { d, camDist: world.distanceTo(camPos) };
            }
            if (best && best.d <= 12) nearest[key] = best;
        }
        let axis = null;
        for (const key of Object.keys(nearest)) {
            if (!axis) { axis = key; continue; }
            const a = nearest[axis], b = nearest[key];
            axis = Math.abs(a.d - b.d) < 4 ? (b.camDist < a.camDist ? key : axis) : (b.d < a.d ? key : axis);
        }
        if (!axis) return null;
        const local = axis === 'yaw' ? new THREE.Vector3(0, 1, 0) : axis === 'pitch' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const normal = local.applyQuaternion(rings[axis].group.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const start = this._ringPlanePoint(clientX, clientY, normal, centre);
        if (!start) return null;
        const field = axis === 'yaw' ? 'rotationY' : axis === 'pitch' ? 'rotationX' : 'rotationZ';
        return { axis, field, normal, centre, startVec: start.sub(centre).normalize(), startValue: Number(owner.state[field]) || 0 };
    }

    _dragSurfaceRing(owner, grab, clientX, clientY) {
        const point = this._ringPlanePoint(clientX, clientY, grab.normal, grab.centre);
        if (!point) return;
        const vec = point.sub(grab.centre).normalize();
        const delta = Math.atan2(grab.normal.dot(new THREE.Vector3().crossVectors(grab.startVec, vec)), grab.startVec.dot(vec)) * 180 / Math.PI;
        let value = grab.startValue + delta;
        while (value > 180) value -= 360;
        while (value < -180) value += 360;
        owner.state[grab.field] = Math.round(value * 10) / 10;
        this._authoringChanged([grab.field]);
        this._updateThreeOwner(owner);
    }

    _syncThreeScanlines(owner) {
        const state = owner.state;
        const amount = VideoSurfacePreviewManager.scanlineAmount(state);
        if (!amount) {
            if (owner.scanMesh) this._destroyThreeScanlines(owner);
            return;
        }
        if (!owner.scanMesh) {
            const canvas = document.createElement('canvas');
            canvas.width = 2;
            canvas.height = 2;
            const texture = new THREE.CanvasTexture(canvas);
            if (THREE.RepeatWrapping) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.generateMipmaps = false;
            owner.scanTexture = texture;
            owner.scanMaterial = new THREE.MeshBasicMaterial({
                map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
                polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
            });
            owner.scanMesh = new THREE.Mesh(owner.geometry, owner.scanMaterial);
            owner.mesh.parent?.add(owner.scanMesh);
        }
        if (owner.scanAmount !== amount) {
            const context = owner.scanTexture.image.getContext('2d');
            context.clearRect(0, 0, 2, 2);
            context.fillStyle = `rgba(0,0,0,${amount * 0.5})`;
            context.fillRect(0, 0, 2, 1);
            owner.scanTexture.needsUpdate = true;
            owner.scanAmount = amount;
        }
        owner.scanTexture.repeat?.set(Math.max(1, Number(state.width) * Math.abs(Number(state.scaleX)) / 2),
            Math.max(1, Number(state.height) * Math.abs(Number(state.scaleY)) / 2));
        const scan = owner.scanMesh;
        if (scan.parent !== owner.mesh.parent) owner.mesh.parent?.add(scan);
        scan.geometry = owner.geometry;
        scan.position.copy(owner.mesh.position);
        scan.rotation.copy(owner.mesh.rotation);
        scan.scale.copy(owner.mesh.scale);
        scan.visible = owner.mesh.visible;
        scan.renderOrder = owner.mesh.renderOrder + 1;
    }

    _destroyThreeScanlines(owner) {
        try { owner.scanMesh?.parent?.remove(owner.scanMesh); } catch (_) {}
        try { owner.scanMaterial?.dispose?.(); } catch (_) {}
        try { owner.scanTexture?.dispose?.(); } catch (_) {}
        owner.scanMesh = null;
        owner.scanMaterial = null;
        owner.scanTexture = null;
        owner.scanAmount = null;
    }

    updateThree() {
        for (const owner of this.threeOwners.values()) this._updateThreeOwner(owner);
    }

    previewActive() {
        for (const owner of this.threeOwners.values()) {
            if (owner.video && !owner.video.paused && !owner.video.ended) return true;
        }
        return false;
    }

    _threeOwnerAt(clientX, clientY) {
        const map3d = this.mapEditor3D;
        const surface = map3d?.inputSurface || map3d?.canvas;
        const rect = surface?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height || !map3d.camera || !this.threeOwners.size) return null;
        this._threeRaycaster ||= new THREE.Raycaster();
        this._threeRaycaster.setFromCamera(new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        ), map3d.camera);
        const meshes = Array.from(this.threeOwners.values(), owner => owner.mesh).filter(Boolean);
        const hit = this._threeRaycaster.intersectObjects(meshes, false)[0];
        return hit ? Array.from(this.threeOwners.values()).find(owner => owner.mesh === hit.object) : null;
    }

    _attachThreeInput(map3d) {
        const surface = map3d.inputSurface || map3d.canvas;
        if (!surface || this._threeInputSurface === surface) return;
        this._detachThreeInput();
        this._threeInputSurface = surface;
        this._onThreeContextMenu = event => {
            const owner = this._threeOwnerAt(event.clientX, event.clientY);
            if (!owner?.record.source) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.navigateTo(owner.record.source);
        };
        this._onThreePointerMove = event => {
            if (!this.authoring || this._cancelActiveDrag) return;
            const owner = this.threeOwners.get('__authoring__');
            if (!owner?.rings) return;
            const over = this._pickSurfaceRing(owner, event.clientX, event.clientY);
            this._emphasizeSurfaceRing(owner, over ? over.axis : '', false);
            surface.style.cursor = over ? 'grab' : '';
        };
        this._onThreePointerDown = event => {
            if (event.button !== 0) return;
            const authoringOwner = this.authoring ? this.threeOwners.get('__authoring__') : null;
            const ringGrab = authoringOwner?.rings ? this._pickSurfaceRing(authoringOwner, event.clientX, event.clientY) : null;
            if (ringGrab) {
                this._cancelActiveDrag?.();
                event.preventDefault();
                event.stopImmediatePropagation();
                this._emphasizeSurfaceRing(authoringOwner, ringGrab.axis, true);
                const move = moveEvent => this._dragSurfaceRing(authoringOwner, ringGrab, moveEvent.clientX, moveEvent.clientY);
                const end = () => {
                    window.removeEventListener('pointermove', move, true);
                    window.removeEventListener('pointerup', end, true);
                    window.removeEventListener('pointercancel', end, true);
                    if (this._cancelActiveDrag === end) this._cancelActiveDrag = null;
                    this._emphasizeSurfaceRing(authoringOwner, '', false);
                };
                this._cancelActiveDrag = end;
                window.addEventListener('pointermove', move, true);
                window.addEventListener('pointerup', end, true);
                window.addEventListener('pointercancel', end, true);
                return;
            }
            const owner = this._threeOwnerAt(event.clientX, event.clientY);
            if (!this.authoring) {
                if (!owner || !this.canEdit(owner.record)) return;
                // A click (no drag) on a saved surface opens it for editing;
                // a drag still orbits the 3D camera.
                const startX = event.clientX, startY = event.clientY;
                const up = upEvent => {
                    window.removeEventListener('pointerup', up, true);
                    if (Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) < 4) this.editRecord(owner.record);
                };
                window.addEventListener('pointerup', up, true);
                return;
            }
            if (!owner?.record.authoring) return;
            this._cancelActiveDrag?.();
            event.preventDefault();
            event.stopImmediatePropagation();
            // Keep the point grabbed under the cursor, as the 2D drag does,
            // instead of snapping the anchor to the cursor.
            const tileSize = this.tilemapManager?.TILE_SIZE || 48;
            const startTile = map3d.tileAt(event.clientX, event.clientY);
            const origin = this._worldPosition(owner.state, owner.record.ownerEventId);
            const grab = startTile && origin
                ? { x: startTile.x + startTile.localX / tileSize - origin.x, y: startTile.y + startTile.localY / tileSize - origin.z }
                : { x: 0, y: 0 };
            const move = moveEvent => {
                const tile = map3d.tileAt(moveEvent.clientX, moveEvent.clientY);
                if (!tile) return;
                const state = owner.state;
                const worldX = tile.x + tile.localX / tileSize - grab.x;
                const worldY = tile.y + tile.localY / tileSize - grab.y - (Number(state.depth) || 0);
                if (state.target === 'map') {
                    state.x = worldX - 0.5;
                    state.y = worldY - 0.5;
                } else {
                    const eventRecord = this._eventFor(state, owner.record.ownerEventId);
                    const system = this.databaseManager?.getSystem?.();
                    const base = eventRecord || (state.target === 'player' ? {
                        x: system?.startX || 0, y: system?.startY || 0
                    } : { x: 0, y: 0 });
                    state.x = (worldX - Number(base.x) - 0.5) * tileSize;
                    state.y = (worldY - Number(base.y) - 0.5) * tileSize;
                }
                this._authoringChanged(['x', 'y']);
                this._updateThreeOwner(owner);
            };
            const end = () => {
                window.removeEventListener('pointermove', move, true);
                window.removeEventListener('pointerup', end, true);
                window.removeEventListener('pointercancel', end, true);
                if (this._cancelActiveDrag === end) this._cancelActiveDrag = null;
            };
            this._cancelActiveDrag = end;
            window.addEventListener('pointermove', move, true);
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
        };
        surface.addEventListener('contextmenu', this._onThreeContextMenu, true);
        surface.addEventListener('pointerdown', this._onThreePointerDown, true);
        surface.addEventListener('pointermove', this._onThreePointerMove, true);
    }

    _detachThreeInput() {
        if (this._threeInputSurface) {
            this._threeInputSurface.removeEventListener('contextmenu', this._onThreeContextMenu, true);
            this._threeInputSurface.removeEventListener('pointerdown', this._onThreePointerDown, true);
            this._threeInputSurface.removeEventListener('pointermove', this._onThreePointerMove, true);
        }
        this._threeInputSurface = null;
        this._onThreeContextMenu = null;
        this._onThreePointerDown = null;
        this._onThreePointerMove = null;
    }

    _cleanupThreeOwner(owner) {
        owner.destroyed = true;
        this._disposeSurfaceRings(owner);
        this._destroyThreeScanlines(owner);
        for (const cleanup of owner.listeners || []) cleanup();
        try { owner.mesh?.parent?.remove(owner.mesh); } catch (_) {}
        try { owner.geometry?.dispose?.(); } catch (_) {}
        try { owner.material?.dispose?.(); } catch (_) {}
        try { owner.texture?.dispose?.(); } catch (_) {}
        this._cleanupMedia(owner.video);
    }

    detachThree() {
        this._cancelActiveDrag?.();
        this._detachThreeInput();
        for (const owner of this.threeOwners.values()) this._cleanupThreeOwner(owner);
        this.threeOwners.clear();
        this.mapEditor3D = null;
    }

    beginAuthoring(editor, data, context) {
        if (!editor || !data || !this.map || !this.tilemapManager) return false;
        this.endAuthoring();
        let replaced = null;
        if (editor.operation === 'TransformVideoSurface') {
            replaced = VideoSurfacePreviewManager.stateBefore(context, data.id);
            if (replaced) {
                const Editor = VideoSurfacePreviewManager._editorClass();
                const present = data[Editor.META]?.presentFields || new Set();
                const effective = VideoSurfacePreviewManager._copy(replaced.state);
                const sizeChanged = present.has('width') || present.has('height');
                for (const field of Editor.SHOW_FIELDS) {
                    if (field === 'movie' || field === 'wait' || !present.has(field)) continue;
                    effective[field] = VideoSurfacePreviewManager._copy(data[field]);
                }
                if (present.has('corners')) {
                    effective.corners = VideoSurfacePreviewManager._copy(data.corners);
                } else if (sizeChanged && !replaced.customCorners) {
                    const halfWidth = effective.width / 2;
                    const halfHeight = effective.height / 2;
                    effective.corners = [
                        { x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight },
                        { x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight }
                    ];
                }
                effective.id = data.id;
                Object.assign(data, effective);
            }
        }
        let replacedKey = replaced?.key || null;
        if (!replacedKey && context?.editing && editor.operation === 'ShowVideoSurface') {
            // Editing an existing Show command: its saved preview would sit
            // under the authoring preview, so hide it for the duration.
            replacedKey = this.records.find(record => record.source
                && Number(record.source.eventId) === Number(context.event?.id)
                && record.source.pageIndex === context.pageIndex
                && record.source.commandIndex === context.commandIndex)?.key || null;
        }
        this.authoring = {
            editor, data, context: context || {},
            replacedKey
        };
        this.refreshBackend();
        return true;
    }

    /**
     * Pan the 2D map so the surface being authored sits in the part of the
     * canvas the live panel does not cover. The command's event can be
     * anywhere on the map, and a surface that opens off-screen or under the
     * panel reads as handles that do nothing.
     */
    revealAuthoringSurface() {
        const owner = this.pixiOwners.get('__authoring__');
        const tm = this.tilemapManager;
        const app = tm?.app;
        if (!owner || !app?.renderer?.screen || typeof tm.setViewportTransform !== 'function'
            || owner.state.target === 'screen') return false;
        const anchor = this._anchor2d(owner.state, owner.record.ownerEventId);
        if (!anchor.valid) return false;
        const screen = app.renderer.screen;
        const scale = tm.container?.scale?.x || 1;
        const corners = this._transformedCorners(owner.state);
        const xs = corners.map(corner => corner.x), ys = corners.map(corner => corner.y);
        const bounds = {
            left: (anchor.x + Math.min(...xs)) * scale, right: (anchor.x + Math.max(...xs)) * scale,
            top: (anchor.y + Math.min(...ys)) * scale, bottom: (anchor.y + Math.max(...ys)) * scale
        };
        const panel = this.authoring?.editor?.livePanelRect?.();
        const rect = app.canvas?.getBoundingClientRect?.();
        let usableWidth = screen.width;
        if (panel && rect?.width) {
            const covered = Math.max(0, rect.right - panel.left);
            if (covered < rect.width) usableWidth = screen.width - covered * screen.width / rect.width;
        }
        const margin = 24;
        const containerX = tm.container?.x || 0, containerY = tm.container?.y || 0;
        const visible = bounds.left + containerX >= margin && bounds.right + containerX <= usableWidth - margin
            && bounds.top + containerY >= margin && bounds.bottom + containerY <= screen.height - margin;
        if (visible) return false;
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        tm.setViewportTransform(usableWidth / 2 - centerX, screen.height / 2 - centerY, scale);
        tm.updateScrollbars?.();
        return true;
    }

    updateAuthoring(editor) {
        if (!this.authoring || this.authoring.editor !== editor) return;
        this.authoring.data = editor.data;
        this.authoring.context = editor.context || this.authoring.context;
        const pixi = this.pixiOwners.get('__authoring__');
        const three = this.threeOwners.get('__authoring__');
        const dom = this.domOwners.get('__authoring__');
        const owner = pixi || three || dom;
        if (!owner || owner.movie !== editor.data.movie || owner.target !== editor.data.target) {
            this.refreshBackend();
            return;
        }
        owner.state = editor.data;
        owner.record.state = editor.data;
        if (pixi) this._updatePixiOwner(pixi);
        if (three) this._updateThreeOwner(three);
        if (dom) this._updateDomOwner(dom);
    }

    _authoringChanged(fields) {
        this.authoring?.editor?.applyLiveMapPlacement?.(fields);
    }

    endAuthoring(editor = null) {
        if (!this.authoring || (editor && this.authoring.editor !== editor)) return;
        this.authoring = null;
        if (!this.destroyed) this.refreshBackend();
    }

    _cleanupMedia(video) {
        if (!video) return;
        try { video.pause(); } catch (_) {}
        try {
            video.removeAttribute('src');
            video.src = '';
            video.load?.();
        } catch (_) {}
    }

    async navigateTo(source) {
        if (!source || this.authoring) return false;
        const mapId = Number(source.mapId);
        const eventId = Number(source.eventId);
        const pageIndex = Number(source.pageIndex);
        const commandIndex = Number(source.commandIndex);
        if (![mapId, eventId, pageIndex, commandIndex].every(Number.isInteger)) return false;
        const loaded = await this.projectController?.loadMap?.(mapId);
        if (!loaded) return false;
        const eventManager = this.projectController?.eventManager;
        const event = eventManager?.currentMap?.events?.find(item => item && Number(item.id) === eventId);
        if (!event || !event.pages?.[pageIndex]?.list?.[commandIndex]) return false;
        eventManager.selectEvent?.(event);
        eventManager.editEvent?.(event);
        const editor = eventManager.eventEditor;
        editor?.switchToPage?.(pageIndex);
        const list = editor?.commandList;
        if (!list) return false;
        list.collapsedBlocks = new WeakSet();
        const page = editor.currentEvent?.pages?.[pageIndex];
        if (!page?.list?.[commandIndex]) return false;
        list.refreshCommandList(page, pageIndex);
        list.selectSingle?.(commandIndex);
        list.updateSelectionStyles?.(page);
        const row = document.querySelector?.(`.command-item[data-index="${commandIndex}"]`);
        row?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        return true;
    }

    onProjectChanged() {
        this.beforeMapChange();
    }

    destroy() {
        if (this.destroyed) return;
        this.beforeMapChange();
        this.destroyed = true;
        if (typeof document !== 'undefined') {
            document.removeEventListener('rr-events-changed', this._onEventsChanged);
        }
    }
}

if (typeof globalThis !== 'undefined') globalThis.VideoSurfacePreviewManager = VideoSurfacePreviewManager;
if (typeof module !== 'undefined' && module.exports) module.exports = VideoSurfacePreviewManager;
