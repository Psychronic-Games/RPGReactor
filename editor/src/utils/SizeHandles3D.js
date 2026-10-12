/**
 * SizeHandles3D - the size handles of a thing in a 3D preview, beside its
 * axis arrows (move) and its pose rings (turn).
 *
 * A flat thing (a media surface) wears eight: one on each edge, which
 * changes its width or its height, and one on each corner, which changes
 * both in proportion. A thing with one size (a light's reach, an
 * animation's scale) wears one. Handles are the same size on screen at any
 * distance and are picked in screen pixels, and a drag is worked out in
 * screen pixels too: how far the pointer has gone along the line from the
 * thing's centre through the handle (`factor`), which `resize` and
 * `uniform` turn into the new size.
 */
(function(root) {
    'use strict';

    /** A flat thing's handles, clockwise from the lower left: corners have both x and y, edges one. */
    const QUAD = [
        { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 },
        { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }
    ];
    const REACH = 12;
    const HANDLE_PIXELS = 9;
    const OUTLINE_POINTS = 64;

    /**
     * How far the pointer has gone along the line from the centre through
     * the grip, as a share of the grip's own distance: 1 where the drag
     * began, 2 at twice as far out, toward 0 at the centre. Screen pixels.
     */
    function factor(centre, grip, pointer) {
        const ax = grip[0] - centre[0], ay = grip[1] - centre[1];
        const length2 = ax * ax + ay * ay;
        if (!(length2 > 1)) return 1;
        const along = ((pointer[0] - centre[0]) * ax + (pointer[1] - centre[1]) * ay) / length2;
        return Number.isFinite(along) ? Math.max(0.02, along) : 1;
    }

    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const round = (value, places) => { const k = Math.pow(10, places); return Math.round(value * k) / k; };

    /**
     * A flat thing's size after its handle moved by `by`: an edge on the
     * left or right changes the width, one on the top or bottom the height,
     * and a corner both, keeping their proportion even at a limit.
     */
    function resize(handle, start, by, limits = {}) {
        const low = limits.min ?? 0.01, high = limits.max ?? 4, places = limits.places ?? 3;
        const width = Number(start.width) || low, height = Number(start.height) || low;
        if (handle.x && handle.y) {
            const most = Math.min(high / width, high / height), least = Math.max(low / width, low / height);
            const k = clamp(by, Math.min(least, most), most);
            return { width: round(width * k, places), height: round(height * k, places) };
        }
        if (handle.x) return { width: round(clamp(width * by, low, high), places), height };
        if (handle.y) return { width, height: round(clamp(height * by, low, high), places) };
        return { width, height };
    }

    /** One size (a number, or one per axis) after its handle moved by `by`. */
    function uniform(start, by, limits = {}) {
        const low = limits.min ?? 0.1, high = limits.max ?? 4, places = limits.places ?? 2;
        if (Array.isArray(start)) {
            const values = start.map(value => Number(value) > 0 ? Number(value) : 1);
            const k = clamp(by, low / Math.min(...values), high / Math.max(...values));
            return values.map(value => round(value * k, places));
        }
        return round(clamp((Number(start) > 0 ? Number(start) : 1) * by, low, high), places);
    }

    /** Where a world point is on screen, in client pixels (null behind the camera). */
    function screen(THREE, camera, rect, point) {
        const v = point.clone().project(camera);
        if (v.z > 1) return null;
        return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height];
    }

    /** World units one screen pixel covers at a point, so a handle can stay one size on screen. */
    function pixelWorld(THREE, camera, rect, point) {
        if (!camera || !rect || !rect.height) return 0.01;
        if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / (camera.zoom || 1) / rect.height;
        const forward = camera.getWorldDirection(new THREE.Vector3());
        const depth = Math.max(0.01, point.clone().sub(camera.getWorldPosition(new THREE.Vector3())).dot(forward));
        return 2 * depth * Math.tan((camera.fov || 50) * Math.PI / 360) / rect.height;
    }

    /** Whether a screen point is inside a flat thing's four screen corners. */
    function inside(corners, x, y) {
        if (!corners || corners.some(corner => !corner)) return false;
        let within = false;
        for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
            const a = corners[i], b = corners[j];
            if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) within = !within;
        }
        return within;
    }

    /** The handles and the outline they sit on, in the scene's own space. */
    function create(THREE, name, color = 0xffd529) {
        const group = new THREE.Group();
        group.name = name || 'size-handles';
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(OUTLINE_POINTS * 3), 3));
        const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false }));
        line.frustumCulled = false;
        line.renderOrder = 10000;
        line.visible = false;
        group.add(line);
        const handles = [];
        for (let i = 0; i < QUAD.length; i++) {
            const handle = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, fog: false }));
            handle.renderOrder = 10001;
            handle.visible = false;
            group.add(handle);
            handles.push(handle);
        }
        return { root: group, line, handles, color, shown: 0 };
    }

    /** Draw the outline through `points` (world), or hide it when there are none. */
    function outline(set, points) {
        if (!set) return;
        const count = Math.min(OUTLINE_POINTS, points ? points.length : 0);
        const attribute = set.line.geometry.getAttribute('position');
        for (let i = 0; i < count; i++) attribute.setXYZ(i, points[i].x, points[i].y, points[i].z);
        attribute.needsUpdate = true;
        set.line.geometry.setDrawRange(0, count);
        set.line.visible = count > 1;
    }

    /** Put the handles at `points` (world), each the same size on screen; the rest are hidden. */
    function place(THREE, set, points, camera, rect) {
        if (!set) return;
        set.shown = Math.min(set.handles.length, points ? points.length : 0);
        set.handles.forEach((handle, index) => {
            handle.visible = index < set.shown;
            if (!handle.visible) return;
            handle.position.copy(points[index]);
            handle.scale.setScalar(HANDLE_PIXELS * pixelWorld(THREE, camera, rect, points[index]));
            if (camera) handle.quaternion.copy(camera.quaternion);
        });
    }

    /** The handle under the pointer: its index, or -1. */
    function pick(THREE, set, camera, rect, clientX, clientY) {
        if (!set || !set.root.visible || !camera || !rect || !rect.width) return -1;
        let best = -1, distance = REACH;
        for (let i = 0; i < set.shown; i++) {
            const at = screen(THREE, camera, rect, set.handles[i].position);
            if (!at) continue;
            const d = Math.hypot(at[0] - clientX, at[1] - clientY);
            if (d <= distance) { best = i; distance = d; }
        }
        return best;
    }

    /** The held handle turns white; the rest keep their color. */
    function emphasize(set, index) {
        if (!set) return;
        set.handles.forEach((handle, i) => handle.material.color.set(i === index ? 0xffffff : set.color));
    }

    function dispose(set) {
        if (!set) return;
        set.root.parent?.remove(set.root);
        set.line.geometry.dispose();
        set.line.material.dispose();
        for (const handle of set.handles) { handle.geometry.dispose(); handle.material.dispose(); }
    }

    const api = { QUAD, REACH, factor, resize, uniform, screen, pixelWorld, inside, create, outline, place, pick, emphasize, dispose };
    root.RRSizeHandles3D = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
