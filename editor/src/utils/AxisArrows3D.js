/**
 * AxisArrows3D - drag arrows along X, Z (map north-south) and Y (height).
 *
 * Three arrows around a selected thing in the 3D view; grabbing one moves
 * the selection along that axis only, from any camera angle: the pointer
 * ray is dropped onto the axis line and the travel along it is the drag.
 */
(function(root) {
    'use strict';

    const AXES = ['x', 'y', 'z'];
    const DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    const COLORS = { x: 0xff5c5c, y: 0x3ddc84, z: 0x5ca8ff };

    function create(THREE, length, name) {
        const rootGroup = new THREE.Group();
        rootGroup.name = name || 'axis-arrows';
        const arrows = { root: rootGroup, length };
        for (const axis of AXES) {
            const group = new THREE.Group();
            const material = new THREE.MeshBasicMaterial({ color: COLORS[axis], transparent: true, opacity: 0.75, depthTest: false, fog: false });
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(length * 0.03, length * 0.03, length, 6), material);
            shaft.position.y = length / 2;
            const head = new THREE.Mesh(new THREE.ConeGeometry(length * 0.09, length * 0.22, 10), material.clone());
            head.position.y = length + length * 0.11;
            group.add(shaft);
            group.add(head);
            group.renderOrder = 6;
            shaft.renderOrder = 6;
            head.renderOrder = 6;
            if (axis === 'x') group.rotation.z = -Math.PI / 2;
            if (axis === 'z') group.rotation.x = Math.PI / 2;
            rootGroup.add(group);
            arrows[axis] = { group, shaft, head };
        }
        return arrows;
    }

    function sync(arrows, position, visible) {
        if (!arrows) return;
        arrows.root.position.set(position.x, position.y, position.z);
        arrows.root.visible = visible !== false;
    }

    function dispose(arrows) {
        if (!arrows) return;
        try { arrows.root.parent?.remove(arrows.root); } catch (_) {}
        arrows.root.traverse(node => {
            try { node.geometry?.dispose?.(); } catch (_) {}
            try { node.material?.dispose?.(); } catch (_) {}
        });
    }

    function emphasize(arrows, axis, held) {
        if (!arrows) return;
        for (const key of AXES) {
            const mine = key === axis;
            const opacity = mine ? (held ? 1 : 0.9) : (held && axis ? 0.15 : 0.75);
            arrows[key].shaft.material.opacity = opacity;
            arrows[key].head.material.opacity = opacity;
        }
    }

    /** The point on the axis line nearest the pointer ray, as travel along the axis from the origin. */
    function axisTravel(THREE, camera, rect, clientX, clientY, origin, direction) {
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const caster = new THREE.Raycaster();
        caster.setFromCamera(ndc, camera);
        const ray = caster.ray;
        // Closest points of two lines: the axis (origin, d) and the ray (o, r).
        const d = direction, o = ray.origin, r = ray.direction;
        const w0 = new THREE.Vector3().subVectors(origin, o);
        const a = d.dot(d), b = d.dot(r), c = r.dot(r);
        const p = d.dot(w0), q = r.dot(w0);
        const denom = a * c - b * b;
        if (Math.abs(denom) < 1e-9) return null;
        return (b * q - c * p) / denom;
    }

    /** Which arrow the pointer is on, with what a later move means, or null. */
    function pick(THREE, arrows, camera, rect, clientX, clientY) {
        if (!arrows || !arrows.root.visible || !camera || !rect || !rect.width) return null;
        const origin = arrows.root.getWorldPosition(new THREE.Vector3());
        let best = null;
        for (const axis of AXES) {
            const dir = new THREE.Vector3(...DIRS[axis]);
            for (let i = 1; i <= 10; i++) {
                const world = origin.clone().add(dir.clone().multiplyScalar(arrows.length * 1.2 * i / 10));
                const v = world.clone().project(camera);
                if (v.z > 1) continue;
                const sx = rect.left + (v.x + 1) / 2 * rect.width;
                const sy = rect.top + (1 - v.y) / 2 * rect.height;
                const dist = Math.hypot(sx - clientX, sy - clientY);
                if (dist <= 10 && (!best || dist < best.dist)) best = { axis, dist };
            }
        }
        if (!best) return null;
        const direction = new THREE.Vector3(...DIRS[best.axis]);
        const start = axisTravel(THREE, camera, rect, clientX, clientY, origin, direction);
        if (start === null) return null;
        return {
            axis: best.axis,
            /** Travel along the axis since the grab, in world units, for the current pointer place. */
            travel: (cx, cy) => {
                const now = axisTravel(THREE, camera, rect, cx, cy, origin, direction);
                return now === null ? 0 : now - start;
            }
        };
    }

    const api = { create, sync, dispose, emphasize, pick };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.RRAxisArrows3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
