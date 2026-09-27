/**
 * ShapeGizmo3D - handles on a shape in a three.js view: arrows to move,
 * rings to turn, cubes to size.
 *
 * The shape is described to it as its eight world corners (from
 * `Reactor3D.shapePlacer`), its size and its turn, tilt and roll; it
 * draws the handles there and, for a press, says which handle was grabbed
 * and what a later pointer position means: travel along an axis for a
 * move or a size, a new angle for a turn. What that does to the shape is
 * the owner's business (a plan's shape on the Structures page, a piece on
 * the map), so the same handles serve both.
 *
 * Built on the pose rings and axis arrows the lights and models use.
 *
 * Mode 'all' shows every handle at once: the arrows from the middle along
 * +X, up and +Z, the rings around it, and the size cubes on the shape's
 * back faces (-u, -v) and its top back corner, clear of the arrows. A size
 * grab says which way its face points (`dir`, in the world), so the owner
 * can hold the opposite face still while the grabbed one follows the pointer.
 */
(function(root) {
    'use strict';

    const AXES = ['u', 'y', 'v'];
    const COLOURS = { u: 0xff5c5c, y: 0x3ddc84, v: 0x5ca8ff };

    function create(THREE, scene, reach) {
        const length = Math.max(1.5, Math.min(8, reach * 0.5 + 1));
        const arrows = root.RRAxisArrows3D.create(THREE, length, 'shape-arrows');
        const rings = root.RRPoseRings3D.create(THREE, length * 0.8, 'shape-rings');
        const cubes = { root: new THREE.Group() };
        for (const axis of AXES) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: COLOURS[axis], depthTest: false, transparent: true, opacity: 0.9 }));
            mesh.renderOrder = 8;
            mesh.userData.axis = axis;
            cubes.root.add(mesh);
            cubes[axis] = mesh;
        }
        scene.add(arrows.root, rings.root, cubes.root);
        return { THREE, scene, length, arrows, rings, cubes };
    }

    function dispose(g) {
        if (!g) return;
        root.RRAxisArrows3D.dispose(g.arrows);
        root.RRPoseRings3D.dispose(g.rings);
        g.scene.remove(g.cubes.root);
        for (const axis of AXES) { g.cubes[axis].geometry.dispose(); g.cubes[axis].material.dispose(); }
    }

    /** Whether the handles were made for a shape of this reach; else remake them. */
    function fits(g, reach) {
        const length = Math.max(1.5, Math.min(8, reach * 0.5 + 1));
        return !!g && Math.abs(g.length - length) <= length * 0.3;
    }

    /**
     * Put the handles on a shape. `shape` is `{ corners, size, angle, tilt, roll }`,
     * corners the eight world points indexed u*4 + y*2 + v (0 or 1 each);
     * `mode` is move, turn or size; null hides them.
     */
    function sync(g, shape, mode) {
        if (!g) return;
        const { THREE } = g;
        g.arrows.root.visible = false; g.rings.root.visible = false; g.cubes.root.visible = false;
        if (!shape) return;
        const at = (u, y, v) => shape.corners[u * 4 + y * 2 + v];
        const near = at(0, 0, 0), far = at(1, 1, 1);
        const centre = new THREE.Vector3((near[0] + far[0]) / 2, (near[1] + far[1]) / 2, (near[2] + far[2]) / 2);
        const all = mode === 'all';
        if (all || mode === 'move') root.RRAxisArrows3D.sync(g.arrows, centre, true);
        if (all || mode === 'turn') root.RRPoseRings3D.sync(g.rings, centre, -(shape.angle || 0), shape.tilt || 0, true);
        if (all || mode === 'size') {
            g.cubes.root.visible = true;
            const size = Math.max(0.2, Math.min(0.6, Math.max(...shape.size) * 0.04 + 0.16));
            const v3 = p => new THREE.Vector3(p[0], p[1], p[2]);
            const mid = (a, b) => v3(a).add(v3(b)).multiplyScalar(0.5);
            // Alone, the cubes sit on the front faces; with the arrows, on the back ones.
            const faces = all
                ? { u: [mid(at(0, 0, 0), at(0, 1, 1)), v3(at(0, 0, 0)).sub(v3(at(1, 0, 0)))], v: [mid(at(0, 0, 0), at(1, 1, 0)), v3(at(0, 0, 0)).sub(v3(at(0, 0, 1)))], y: [v3(at(0, 1, 0)), v3(at(0, 1, 0)).sub(v3(at(0, 0, 0)))] }
                : { u: [mid(at(1, 0, 0), at(1, 1, 1)), v3(at(1, 0, 0)).sub(v3(at(0, 0, 0)))], v: [mid(at(0, 0, 1), at(1, 1, 1)), v3(at(0, 0, 1)).sub(v3(at(0, 0, 0)))], y: [mid(at(0, 1, 0), at(1, 1, 1)), v3(at(0, 1, 0)).sub(v3(at(0, 0, 0)))] };
            for (const axis of AXES) {
                const [face, out] = faces[axis];
                const dir = out.lengthSq() > 1e-9 ? out.normalize() : new THREE.Vector3(0, 1, 0);
                g.cubes[axis].position.copy(face.add(dir.clone().multiplyScalar(size * 0.9)));
                g.cubes[axis].scale.setScalar(size);
                g.cubes[axis].userData.dir = dir;
            }
        }
    }

    function axisTravel(THREE, camera, rect, clientX, clientY, origin, direction) {
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const caster = new THREE.Raycaster();
        caster.setFromCamera(ndc, camera);
        const d = direction, o = caster.ray.origin, r = caster.ray.direction;
        const w0 = new THREE.Vector3().subVectors(origin, o);
        const a = d.dot(d), b = d.dot(r), c = r.dot(r);
        const p = d.dot(w0), q = r.dot(w0);
        const denom = a * c - b * b;
        if (Math.abs(denom) < 1e-9) return null;
        return (b * q - c * p) / denom;
    }

    /**
     * What a press grabs, for `mode`, or null. The grab carries `axis` and
     * either `travel(clientX, clientY)` (move: 'x' | 'y' | 'z' world axes;
     * size: 'u' | 'y' | 'v' the shape's own) or, for a turn, the ring grab
     * that `drag` turns into degrees.
     */
    function grab(g, camera, rect, clientX, clientY, mode, shape) {
        if (!g || !shape) return null;
        const { THREE } = g;
        if (mode === 'all') {
            // Nearest handle wins by kind: a cube, then an arrow, then a ring.
            return grab(g, camera, rect, clientX, clientY, 'size', shape)
                || grab(g, camera, rect, clientX, clientY, 'move', shape)
                || grab(g, camera, rect, clientX, clientY, 'turn', shape);
        }
        if (mode === 'move') {
            const got = root.RRAxisArrows3D.pick(THREE, g.arrows, camera, rect, clientX, clientY);
            if (!got) return null;
            root.RRAxisArrows3D.emphasize(g.arrows, got.axis, true);
            return { mode, axis: got.axis, travel: got.travel };
        }
        if (mode === 'turn') {
            const got = root.RRPoseRings3D.pick(THREE, g.rings, camera, rect, clientX, clientY, { yaw: -(shape.angle || 0), pitch: shape.tilt || 0, roll: shape.roll || 0 });
            if (!got) return null;
            root.RRPoseRings3D.emphasize(g.rings, got.axis, true);
            return { mode, axis: got.axis, ring: got };
        }
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(AXES.map(axis => g.cubes[axis]), false)[0];
        if (!hit) return null;
        const axis = hit.object.userData.axis, dir = hit.object.userData.dir.clone(), origin = hit.object.position.clone();
        const t0 = axisTravel(THREE, camera, rect, clientX, clientY, origin, dir);
        if (t0 === null) return null;
        if (!g.cubes.root.visible) return null;
        for (const key of AXES) g.cubes[key].material.opacity = key === axis ? 1 : 0.25;
        return { mode: 'size', axis, dir: dir.clone(), travel: (cx, cy) => { const t = axisTravel(THREE, camera, rect, cx, cy, origin, dir); return t === null ? 0 : t - t0; } };
    }

    /** A turn grab's new angle in degrees for the pointer, snapped to five, or null off its plane. */
    function turn(g, held, camera, rect, clientX, clientY) {
        const value = root.RRPoseRings3D.drag(g.THREE, held.ring, camera, rect, clientX, clientY);
        if (value === null) return null;
        return ((Math.round(value / 5) * 5) % 360 + 360) % 360;
    }

    function release(g) {
        if (!g) return;
        root.RRAxisArrows3D.emphasize(g.arrows, null, false);
        root.RRPoseRings3D.emphasize(g.rings, null, false);
        for (const axis of AXES) g.cubes[axis].material.opacity = 0.9;
    }

    /** Whether a canvas point is over any visible handle (for a cursor). */
    function over(g, camera, rect, clientX, clientY, mode, shape) {
        return !!grab(g, camera, rect, clientX, clientY, mode, shape) && (release(g), true);
    }

    const api = { AXES, create, dispose, fits, sync, grab, turn, release, over };
    root.RRShapeGizmo3D = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
