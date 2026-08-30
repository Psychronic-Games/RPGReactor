/**
 * Pose rings: three tori round a placed thing, dragged to turn it.
 *
 * Green turns about the vertical (yaw), red about the thing's own sideways
 * axis (pitch), blue about its forward axis (roll), nested like a gimbal so
 * each ring stays where its turn happens. Picking measures screen distance to
 * each ring's drawn circle, so a ring is grabbed where it is seen; the drag
 * reads the angle swept in the ring's plane. Angles are degrees in [-180, 180].
 *
 * Shared by the video-surface authoring rings and the model props; the
 * database model picker keeps its own copy inside its own gizmo.
 */
(function(root) {
    'use strict';

    const AXES = ['yaw', 'pitch', 'roll'];
    const COLORS = { yaw: 0x3ddc84, pitch: 0xff5c5c, roll: 0x5ca8ff };

    function create(THREE, radius, name) {
        const rootGroup = new THREE.Group();
        rootGroup.name = name || 'pose-rings';
        const makeRing = (color, orient) => {
            const group = new THREE.Group();
            const geometry = new THREE.TorusGeometry(radius, Math.max(0.02, radius * 0.018), 8, 64);
            const solid = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, fog: false }));
            const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthTest: false, depthWrite: false, fog: false }));
            ghost.renderOrder = 5;
            orient(solid);
            orient(ghost);
            group.add(solid);
            group.add(ghost);
            rootGroup.add(group);
            return { group, solid, ghost };
        };
        return {
            root: rootGroup,
            radius,
            yaw: makeRing(COLORS.yaw, mesh => { mesh.rotation.x = Math.PI / 2; }),
            pitch: makeRing(COLORS.pitch, mesh => { mesh.rotation.y = Math.PI / 2; }),
            roll: makeRing(COLORS.roll, () => {})
        };
    }

    /** Put the rings at `position` (a Vector3-like) turned to the pose, in degrees. */
    function sync(rings, position, yawDeg, pitchDeg, visible) {
        if (!rings) return;
        rings.root.position.set(position.x, position.y, position.z);
        rings.root.visible = visible !== false;
        const yaw = (Number(yawDeg) || 0) * Math.PI / 180;
        const pitch = (Number(pitchDeg) || 0) * Math.PI / 180;
        rings.pitch.group.rotation.set(0, yaw, 0);
        rings.roll.group.rotation.order = 'YXZ';
        rings.roll.group.rotation.set(pitch, yaw, 0);
    }

    function dispose(rings) {
        if (!rings) return;
        try { rings.root.parent?.remove(rings.root); } catch (_) {}
        rings.root.traverse(node => {
            try { node.geometry?.dispose?.(); } catch (_) {}
            try { node.material?.dispose?.(); } catch (_) {}
        });
    }

    function emphasize(rings, axis, held) {
        if (!rings) return;
        for (const key of AXES) {
            const mine = key === axis;
            rings[key].solid.material.opacity = mine ? (held ? 0.9 : 0.6) : (held && axis ? 0.08 : 0.3);
            rings[key].ghost.material.opacity = mine ? (held ? 0.14 : 0.08) : (held && axis ? 0.02 : 0.05);
        }
    }

    function planePoint(THREE, camera, rect, clientX, clientY, normal, centre) {
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const caster = new THREE.Raycaster();
        caster.setFromCamera(ndc, camera);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centre);
        const point = new THREE.Vector3();
        return caster.ray.intersectPlane(plane, point) ? point : null;
    }

    /**
     * The ring under the pointer, or null. `current` holds the pose's yaw,
     * pitch and roll in degrees; the grab remembers where the drag started.
     */
    function pick(THREE, rings, camera, rect, clientX, clientY, current) {
        if (!rings || !rings.root.visible || !camera || !rect || !rect.width) return null;
        const radius = rings.radius;
        const camPos = camera.getWorldPosition(new THREE.Vector3());
        const centre = rings.root.getWorldPosition(new THREE.Vector3());
        const nearest = {};
        for (const key of AXES) {
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
        const start = planePoint(THREE, camera, rect, clientX, clientY, normal, centre);
        if (!start) return null;
        return { axis, normal, centre, startVec: start.sub(centre).normalize(), startValue: Number(current && current[axis]) || 0 };
    }

    /** The grabbed axis's new angle in degrees for the pointer's position, or null off-plane. */
    function drag(THREE, grab, camera, rect, clientX, clientY) {
        if (!grab || !camera || !rect || !rect.width) return null;
        const point = planePoint(THREE, camera, rect, clientX, clientY, grab.normal, grab.centre);
        if (!point) return null;
        const vec = point.sub(grab.centre).normalize();
        const delta = Math.atan2(grab.normal.dot(new THREE.Vector3().crossVectors(grab.startVec, vec)), grab.startVec.dot(vec)) * 180 / Math.PI;
        let value = grab.startValue + delta;
        while (value > 180) value -= 360;
        while (value < -180) value += 360;
        return Math.round(value * 10) / 10;
    }

    const api = { AXES, COLORS, create, sync, dispose, emphasize, pick, drag };
    root.RRPoseRings3D = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
