/**
 * A map of the project standing in 3D inside a picker: turned, moved and zoomed as the map view is, a tile
 * chosen by a click on it. It is the Battle Room's view of a map (Database › Troops) with nobody in it, so any
 * map shows whichever map the editor has open.
 */
class MapPicker3D {
    /** Pixels the pointer may travel between press and release and still be a click. */
    static CLICK_SLOP = 4;
    static HINT = 'Click a place to choose it. Drag to turn, right-drag to move, scroll to zoom.';

    static available() {
        return typeof window !== 'undefined' && typeof MapEditor3D !== 'undefined'
            && !!(window.reactor && window.reactor.databaseEditorUI && window.reactor.databaseEditorUI.battlePresentationEditor);
    }

    /** How far back the eye starts for a map `width` × `height` tiles: most of a small map, a district of a large one. */
    static startDistance(width, height) {
        return Math.max(14, Math.min(70, Math.max(Number(width) || 0, Number(height) || 0) * 0.55));
    }

    /** The tile a point of the world (tiles; z runs south) stands on, or null off a map `width` × `height`. */
    static tileOf(point, width, height) {
        if (!point) return null;
        const x = Math.floor(point.x), y = Math.floor(point.z);
        return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
    }

    /**
     * @param {HTMLElement} stage what the view fills
     * @param {(x: number, y: number) => void} onPick a tile was chosen
     */
    constructor(stage, onPick) {
        this.stage = stage;
        this.onPick = onPick || (() => {});
        this.view = null;
        this.map = null;
        this.selection = null;
        this.generation = 0;
        this.raf = 0;
        this.stop = () => {};
        this.coords = null;
    }

    text(source) { return window.I18n ? window.I18n.tText(source) : source; }

    message(text) {
        const note = document.createElement('div');
        note.className = 'map-picker-3d-note';
        note.textContent = text;
        this.stage.replaceChildren(note);
    }

    /** Shows `mapId` with `selection` (`{ x, y }`) marked and in view. Resolves whether it is showing. */
    async show(mapId, selection) {
        const generation = ++this.generation;
        this.clear();
        this.message(this.text('Loading…'));
        try {
            const rooms = window.reactor.databaseEditorUI.battlePresentationEditor;
            const map = await rooms.readMap(mapId), assets = await rooms.assets();
            if (generation !== this.generation || !this.stage.isConnected) return false;
            const settings = ReactorBattleData.room({ id: mapId, width: map.width, height: map.height });
            Object.assign(settings, { cameraSource: 'custom', projection: '3d', actors: [], enemies: [] });
            settings.camera = { mode: 'fixed', x: selection.x, y: selection.y, z: 0, yaw: 0, pitch: 50, fov: 40,
                distance: MapPicker3D.startDistance(map.width, map.height) };
            const view = new ReactorBattleRoomView(map, rooms.db.getTileset(map.tilesetId), settings, assets);
            await view.build();
            if (generation !== this.generation || !this.stage.isConnected) { view.dispose(); return false; }
            this.view = view;
            this.map = map;
            this.mount(rooms);
            this.select(selection.x, selection.y);
            settings.camera.z = this.selection.height;
            return true;
        } catch (error) {
            if (generation === this.generation) this.message(String(error && error.message || error));
            return false;
        }
    }

    mount(rooms) {
        const view = this.view, stage = this.stage;
        const overlay = document.createElement('canvas');
        overlay.className = 'map-picker-3d-overlay';
        overlay.tabIndex = 0;
        const hint = document.createElement('div');
        hint.className = 'map-picker-3d-hint';
        hint.textContent = this.text(MapPicker3D.HINT);
        this.coords = document.createElement('div');
        this.coords.className = 'map-picker-3d-coords';
        view.renderer.domElement.classList.add('map-picker-3d-canvas');
        stage.replaceChildren(view.renderer.domElement, overlay, this.coords, hint);
        const navigation = rooms.cameraNavigation(view, () => {});
        let press = null;
        overlay.oncontextmenu = event => event.preventDefault();
        overlay.onwheel = event => { event.preventDefault(); event.stopPropagation(); if (navigation.begin()) navigation.zoom(event.deltaY); };
        overlay.onpointerdown = event => {
            if (![0, 1, 2].includes(event.button)) return;
            event.preventDefault();
            press = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, pan: event.button !== 0 || event.shiftKey, moved: false, button: event.button };
            overlay.setPointerCapture(event.pointerId);
        };
        overlay.onpointermove = event => {
            if (!press) return;
            if (!press.moved && Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <= MapPicker3D.CLICK_SLOP) return;
            if (!press.moved) { press.moved = true; if (!navigation.begin()) { press = null; return; } }
            const dx = event.clientX - press.x, dy = event.clientY - press.y;
            press.x = event.clientX; press.y = event.clientY;
            navigation[press.pan ? 'pan' : 'orbit'](dx, dy);
        };
        const release = event => {
            const was = press;
            press = null;
            if (was && !was.moved && was.button === 0 && event.type === 'pointerup') this.pickAt(event.clientX, event.clientY);
        };
        overlay.onpointerup = release;
        overlay.onpointercancel = release;
        const clock = {};
        let size = null;
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { size = null; }) : null;
        if (observer) observer.observe(stage);
        const draw = (now = performance.now()) => {
            if (this.view !== view || !stage.isConnected) return;
            this.raf = requestAnimationFrame(draw);
            const steps = rooms.roomFrameSteps(clock, now);
            if (!steps) return;
            if (!size || !observer) size = { width: Math.max(1, stage.clientWidth), height: Math.max(1, stage.clientHeight) };
            if (view.width !== size.width || view.height !== size.height) { view.resize(size.width, size.height); overlay.width = size.width; overlay.height = size.height; }
            for (let step = 0; step < steps; step++) view.render();
            this.drawMarker(overlay);
        };
        this.raf = requestAnimationFrame(draw);
        this.stop = () => { cancelAnimationFrame(this.raf); if (observer) observer.disconnect(); };
    }

    /** What a ray meets first that a place can be chosen on: the ground, water, what is built; never the sky, plants or sprites. */
    firstSolid(ray) {
        for (const hit of ray.intersectObjects(this.view.scene.children, true)) {
            const object = hit.object;
            if (!object.isMesh || object.isInstancedMesh || object.userData.rrSkyDome || object.userData.roomPiece === 'sky' || object.userData.rrFoliageChunk) continue;
            if (object.geometry && object.geometry.isInstancedBufferGeometry) continue;
            let shown = true;
            for (let node = object; node; node = node.parent) if (!node.visible) { shown = false; break; }
            if (shown) return hit;
        }
        return null;
    }

    /** How high the ground stands at the middle of a tile, 0 where nothing is under it. */
    groundAt(x, y) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x + 0.5, 500, y + 0.5), new THREE.Vector3(0, -1, 0));
        const hit = this.firstSolid(ray);
        return hit ? hit.point.y : 0;
    }

    pickAt(clientX, clientY) {
        const view = this.view;
        if (!view) return;
        const rect = view.renderer.domElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), view.camera);
        const hit = this.firstSolid(ray);
        const tile = MapPicker3D.tileOf(hit && hit.point, this.map.width, this.map.height);
        if (!tile) return;
        this.selection = { x: tile.x, y: tile.y, height: hit.point.y };
        this.caption();
        this.onPick(tile.x, tile.y);
    }

    caption() {
        if (this.coords && this.selection) this.coords.textContent = `X: ${this.selection.x}, Y: ${this.selection.y}`;
    }

    /** Marks a tile as the chosen one (from the stored place, or the flat view). */
    select(x, y) {
        if (!this.view) return;
        this.selection = { x, y, height: this.groundAt(x, y) };
        this.caption();
    }

    /** The chosen tile: its outline on the ground and a pin over it, seen from any distance. */
    drawMarker(overlay) {
        const ctx = overlay.getContext('2d'), view = this.view, chosen = this.selection;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (!chosen) return;
        const h = chosen.height + 0.06;
        const at = (x, y, z) => view.project({ x: x - 0.5, y: y - 0.5, z });
        const corners = [at(chosen.x, chosen.y, h), at(chosen.x + 1, chosen.y, h), at(chosen.x + 1, chosen.y + 1, h), at(chosen.x, chosen.y + 1, h)];
        const foot = at(chosen.x + 0.5, chosen.y + 0.5, h), head = at(chosen.x + 0.5, chosen.y + 0.5, h + 3);
        if (!foot.visible || corners.some(corner => !corner.visible)) return;
        const color = typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? ThemeColors.resolve('--color-accent-bright', '#ffd700') : '#ffd700';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        corners.forEach((corner, i) => (i ? ctx.lineTo(corner.x, corner.y) : ctx.moveTo(corner.x, corner.y)));
        ctx.closePath();
        ctx.globalAlpha = 0.35; ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(head.x, head.y);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    }

    clear() {
        this.stop();
        this.stop = () => {};
        if (this.view) { try { this.view.dispose(); } catch (error) { console.warn('MapPicker3D:', error); } }
        this.view = null;
        this.map = null;
        this.selection = null;
        this.coords = null;
    }

    dispose() {
        this.generation++;
        this.clear();
        this.stage.replaceChildren();
    }
}
if (typeof globalThis !== 'undefined') globalThis.MapPicker3D = MapPicker3D;
if (typeof module !== 'undefined' && module.exports) module.exports = MapPicker3D;
