// Async WebDriver setup (nw-frame-breakdown.cjs --setup, or any harness that runs
// a script with a done callback last): does the sun's shadow speckle a sunlit
// convex model? A sphere and a turned box stand beside the player, casting and
// lit like any prop; for several sun angles the frame is read back with shadows
// on and off, at points on each model's sunward, visible surface. A point that
// comes out darker with shadows on is self-shadowing (acne): nothing else
// stands between those points and the sun. Passes when no angle darkens more
// than `limit` of its points.
const done = arguments[arguments.length - 1];
(async () => {
    const R = Reactor3D, T = THREE, limit = 0.02;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const app = Graphics._app, gl = app.renderer.gl, cam = R.viewport().camera();
    const scene = SceneManager._scene._spriteset._reactor3d.scene._scene;
    const group = scene.userData.rrModelsGroup || scene;
    const sun = $dataMap.reactor3d.lights.find(l => l.type === "sun");
    if (!sun) return done({ error: "no sun on this map" });
    const saved = { yaw: sun.yaw, pitch: sun.pitch, daylight: sun.daylight };
    // Beside the player, to the camera's right, a tile and a half off the ground.
    const player = [...R.Shadows._dynamic].find(r => r.userData.reactorPlayer);
    const at = new T.Vector3().setFromMatrixPosition(player.matrixWorld);
    const right = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const make = (geometry, offset) => {
        const material = R.litMaterial(new T.MeshBasicMaterial({ color: 0xb0b0b0 }));
        const mesh = new T.Mesh(geometry, material);
        mesh.position.copy(at).addScaledVector(right, offset).setY(at.y + 1.2);
        mesh.rotation.set(0.3, 0.6, 0);
        group.add(mesh);
        mesh.updateMatrixWorld(true);
        R.Shadows.markCaster(mesh, false);
        return mesh;
    };
    // Only the two models cast while the probe runs: whatever else stands between a sample and
    // the sun (a tree, the party) would be a real shadow, not the model shading itself.
    const masks = [], bits = (1 << R.SHADOW_LAYER_STATIC) | (1 << R.SHADOW_LAYER_DYNAMIC);
    scene.traverse(o => { if (o.isMesh && (o.layers.mask & bits)) { masks.push([o, o.layers.mask]); o.layers.mask &= ~bits; } });
    const ball = make(new T.SphereGeometry(0.8, 48, 32), 2.4);
    const box = make(new T.BoxGeometry(1.1, 1.1, 1.1), -2.4);
    // The control: a plate held toward the sun over the sphere. Points whose way to the sun
    // crosses it must darken, and only those: the shadow is there, where it belongs.
    const plate = make(new T.PlaneGeometry(1, 1), 2.4);
    plate.material.side = T.DoubleSide;
    R.Shadows.markCaster(plate, false);
    R.Shadows.invalidate();
    // Sunward, visible points on each model's surface, in world space with their normals.
    const nmOf = mesh => new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const sphere = [];
    for (let i = 0; i < 600; i++) {
        // Even spread over the sphere (a Fibonacci lattice).
        const y = 1 - (2 * (i + 0.5)) / 600, r = Math.sqrt(1 - y * y), t = i * 2.399963229728653;
        const n = new T.Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
        sphere.push({ p: n.clone().multiplyScalar(0.8).applyMatrix4(ball.matrixWorld), n: n.applyMatrix3(nmOf(ball)).normalize() });
    }
    const cube = [];
    for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const local = [0, 0, 0], normal = [0, 0, 0];
        local[axis] = side * 0.55; normal[axis] = side;
        local[(axis + 1) % 3] = a * 0.18; local[(axis + 2) % 3] = b * 0.18;
        cube.push({ p: new T.Vector3(...local).applyMatrix4(box.matrixWorld), n: new T.Vector3(...normal).applyMatrix3(nmOf(box)).normalize() });
    }
    const points = sphere.concat(cube);
    // The frame drawn and read back at once, as the frozen captures take it.
    const read = async () => {
        const spriteset = SceneManager._scene._spriteset, state = spriteset._reactor3d;
        for (let k = 0; k < 3; k++) {
            state.viewport.renderPass(state.scene, state.scene.modelsInWorld ? "world" : "below", "below");
            if (spriteset._reactor3dAbove) state.viewport.renderPass(state.scene, state.scene.modelsInWorld ? "overlay" : "above", "above");
            app.render();
            if (k < 2) await wait(30);
        }
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
        const was = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, was);
        return { w, h, px };
    };
    const lum = (img, x, y) => { const i = (Math.round(y) * img.w + Math.round(x)) * 4; return img.px[i] * 0.3 + img.px[i + 1] * 0.59 + img.px[i + 2] * 0.11; };
    const angles = [[50, 0], [25, 45], [70, -120], [35, 120], [15, 0]];
    const results = [];
    for (const [elevation, yaw] of angles) {
        sun.pitch = -elevation; sun.yaw = yaw; sun.daylight = "fixed";
        R._nativeNorm = null;
        R.SHADOWS = "auto";
        await wait(900);
        const toward = new T.Vector3(...R.Shadows._sun.dir);
        plate.position.copy(ball.position).addScaledVector(toward, 2.2);
        plate.lookAt(ball.position);
        plate.updateMatrixWorld(true);
        await wait(1500);
        const eye = cam.getWorldPosition(new T.Vector3());
        const chosen = points.filter(({ p, n }) => n.dot(toward) > 0.25 && n.dot(eye.clone().sub(p).normalize()) > 0.3);
        const on = await read();
        R.SHADOWS = "off";
        await wait(1800);
        const off = await read();
        const P0 = plate.position, U = new T.Vector3().setFromMatrixColumn(plate.matrixWorld, 0).normalize(), V = new T.Vector3().setFromMatrixColumn(plate.matrixWorld, 1).normalize();
        const normal = new T.Vector3().setFromMatrixColumn(plate.matrixWorld, 2).normalize();
        // Where a point's way to the sun crosses the plate's plane, in the plate's own axes; null past it.
        const across = p => { const t = P0.clone().sub(p).dot(toward); if (t <= 0) return null; const hit = p.clone().addScaledVector(toward, t).sub(P0); return Math.max(Math.abs(hit.dot(U)), Math.abs(hit.dot(V))); };
        let darkened = 0, counted = 0, under = 0, underDark = 0;
        for (const { p } of chosen) {
            const reach = across(p);
            if (reach !== null && reach < 0.6) {
                if (reach > 0.42) continue;
                // Skipped where the plate itself stands between the camera and the point.
                const ray = eye.clone().sub(p), denom = ray.dot(normal);
                if (Math.abs(denom) > 1e-6) {
                    const t = P0.clone().sub(p).dot(normal) / denom;
                    if (t > 0 && t < 1) { const hit = p.clone().addScaledVector(ray, t).sub(P0); if (Math.abs(hit.dot(U)) < 0.55 && Math.abs(hit.dot(V)) < 0.55) continue; }
                }
                const v = p.clone().project(cam), x = (v.x + 1) / 2 * on.w, y = (v.y + 1) / 2 * on.h;
                const a = lum(on, x, y), b = lum(off, x, y);
                if (b < 12) continue;
                under++;
                if (a < b * 0.85) underDark++;
                continue;
            }
            const v = p.clone().project(cam);
            if (Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98) continue;
            const x = (v.x + 1) / 2 * on.w, y = (v.y + 1) / 2 * on.h;
            const a = lum(on, x, y), b = lum(off, x, y);
            if (b < 12) continue;
            counted++;
            if (a < b * 0.85) darkened++;
        }
        results.push({ elevation, yaw, sunward: chosen.length, points: counted, darkened, fraction: counted ? +(darkened / counted).toFixed(4) : null,
            underPlate: under, underPlateDark: under ? +(underDark / under).toFixed(4) : null });
    }
    R.SHADOWS = "auto";
    Object.assign(sun, saved);
    R._nativeNorm = null;
    for (const mesh of [ball, box, plate]) { group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const [o, mask] of masks) o.layers.mask = mask;
    R.Shadows.invalidate();
    const worst = Math.max(...results.map(r => r.fraction || 0));
    // The plate's shadow must land on at least nine in ten of the points behind it.
    const control = results.filter(r => r.underPlate >= 5).every(r => r.underPlateDark >= 0.9) && results.some(r => r.underPlate >= 5);
    done({ results, worst, limit, control, passed: results.every(r => r.points >= 20) && worst <= limit && control, tier: R.tier(), revision: RPG_REACTOR_RUNTIME_REVISION });
})().catch(e => done({ error: String(e && e.stack || e) }));
