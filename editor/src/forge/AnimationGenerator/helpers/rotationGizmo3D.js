/**
 * RotationGizmo3D — interactive 3D rotation widget that bidirectionally
 * syncs with an animation's tiltX / tiltY / tiltZ parameters.
 *
 * Renders a wireframe sphere with X (red), Y (green), and Z (blue) axes.
 * Drag rotates the sphere around the camera-space pitch (vertical drag)
 * and yaw (horizontal drag) axes. Shift+drag (or right-click drag) rolls
 * around the camera Z axis.
 *
 * API:
 *   const gizmo = new RotationGizmo3D(canvas, {
 *       onChange: (tx, ty, tz) => { ... }
 *   });
 *   gizmo.setRotation(tiltX, tiltY, tiltZ);  // call when sliders change
 *   gizmo.dispose();                          // unwire global listeners
 *
 * Coordinate convention matches makeSymbol3DTransform / render3DShape:
 *   - local +Y up, +X right, +Z toward camera
 *   - tilt order: X (pitch) → Y (yaw) → Z (roll)
 *   - Y axis is FLIPPED on screen (canvas +Y down), so the gizmo's
 *     Y arrow points UP visually when tiltX = 0.
 */
class RotationGizmo3D {
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tiltX = 0;
        this.tiltY = 0;
        this.tiltZ = 0;
        this.onChange = opts.onChange || (() => {});
        // Sensitivity: degrees of rotation per pixel of drag.
        this.sensitivity = opts.sensitivity || 0.8;
        this.dragging = false;
        this.dragMode = null;  // 'rotate' | 'roll'
        this.lastMouse = null;

        // Bound handlers so we can remove them in dispose().
        this._onDown = (e) => this._handleDown(e);
        this._onMove = (e) => this._handleMove(e);
        this._onUp   = (e) => this._handleUp(e);

        canvas.addEventListener('mousedown', this._onDown);
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('mousemove', this._onMove);
        document.addEventListener('mouseup',   this._onUp);

        this.draw();
    }

    setRotation(tx, ty, tz) {
        this.tiltX = tx || 0;
        this.tiltY = ty || 0;
        this.tiltZ = tz || 0;
        this.draw();
    }

    dispose() {
        this.canvas.removeEventListener('mousedown', this._onDown);
        document.removeEventListener('mousemove', this._onMove);
        document.removeEventListener('mouseup',   this._onUp);
    }

    _handleDown(e) {
        this.dragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.dragMode = (e.shiftKey || e.button === 2) ? 'roll' : 'rotate';
        e.preventDefault();
    }

    _handleMove(e) {
        if (!this.dragging) return;
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (this.dragMode === 'rotate') {
            // Horizontal drag → yaw (tiltY); vertical drag → pitch (tiltX).
            this.tiltY = this._wrap(this.tiltY + dx * this.sensitivity);
            this.tiltX = this._wrap(this.tiltX + dy * this.sensitivity);
        } else {
            // Roll mode — horizontal drag = roll (tiltZ).
            this.tiltZ = this._wrap(this.tiltZ + dx * this.sensitivity);
        }
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.draw();
        this.onChange(this.tiltX, this.tiltY, this.tiltZ);
    }

    _handleUp() {
        if (!this.dragging) return;
        this.dragging = false;
        // Fire a final onChange so a 'change'-style listener can persist.
        this.onChange(this.tiltX, this.tiltY, this.tiltZ);
    }

    _wrap(angle) {
        while (angle > 180)  angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    /**
     * Build the same tilt transform as makeSymbol3DTransform / render3DShape
     * so the gizmo's orientation visually matches what the animation will
     * actually render.
     */
    _transform(v) {
        const tx = this.tiltX * Math.PI / 180;
        const ty = this.tiltY * Math.PI / 180;
        const tz = this.tiltZ * Math.PI / 180;
        const cosTX = Math.cos(tx), sinTX = Math.sin(tx);
        const cosTY = Math.cos(ty), sinTY = Math.sin(ty);
        const cosTZ = Math.cos(tz), sinTZ = Math.sin(tz);

        let x = v[0], y = v[1], z = v[2];
        // Tilt X (pitch)
        let y1 = y * cosTX - z * sinTX, z1 = y * sinTX + z * cosTX; y = y1; z = z1;
        // Tilt Y (yaw)
        let x2 = x * cosTY + z * sinTY, z2 = -x * sinTY + z * cosTY; x = x2; z = z2;
        // Tilt Z (roll)
        let x3 = x * cosTZ - y * sinTZ, y3 = x * sinTZ + y * cosTZ; x = x3; y = y3;
        return [x, y, z];
    }

    draw() {
        const { ctx, canvas } = this;
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2;
        const radius = Math.min(w, h) * 0.36;
        ctx.clearRect(0, 0, w, h);

        // Background disc.
        const bg = getComputedStyle(canvas).getPropertyValue('--color-bg-deep') || '#10141c';
        ctx.fillStyle = bg.trim() || '#10141c';
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 140, 170, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
        ctx.stroke();

        // Perspective projection — same convention as the symbol pipeline
        // (canvas +Y down → flip Y to put +Y up on screen).
        const project = (v) => {
            const d = 3.5;
            const dz = d - v[2];
            const s = dz > 0.15 ? d / dz : d / 0.15;
            return { x: cx + v[0] * radius * s, y: cy - v[1] * radius * s, z: v[2] };
        };

        // Wireframe sphere: lat + lon lines, depth-sorted so back-of-sphere
        // segments draw dimmer.
        const segs = 30;
        const allArcs = [];
        const addArc = (pts) => {
            let avgZ = 0;
            for (const p of pts) avgZ += p.z;
            avgZ /= pts.length;
            allArcs.push({ pts, avgZ });
        };
        const latCount = 5;
        for (let i = 1; i < latCount; i++) {
            const lat = -Math.PI / 2 + (i / latCount) * Math.PI;
            const yy = Math.sin(lat);
            const rr = Math.cos(lat);
            const pts = [];
            for (let s = 0; s <= segs; s++) {
                const lon = (s / segs) * Math.PI * 2;
                pts.push(project(this._transform([rr * Math.cos(lon), yy, rr * Math.sin(lon)])));
            }
            addArc(pts);
        }
        const lonCount = 8;
        for (let i = 0; i < lonCount; i++) {
            const lon = (i / lonCount) * Math.PI * 2;
            const cosL = Math.cos(lon), sinL = Math.sin(lon);
            const pts = [];
            for (let s = 0; s <= segs; s++) {
                const lat = -Math.PI / 2 + (s / segs) * Math.PI;
                const rr = Math.cos(lat);
                pts.push(project(this._transform([rr * cosL, Math.sin(lat), rr * sinL])));
            }
            addArc(pts);
        }
        // Sort back-to-front and draw with depth-based alpha.
        allArcs.sort((a, b) => a.avgZ - b.avgZ);
        for (const arc of allArcs) {
            const a = 0.18 + 0.45 * Math.max(0, Math.min(1, (arc.avgZ + 1) / 2));
            ctx.strokeStyle = `rgba(140, 180, 220, ${a})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            for (let i = 0; i < arc.pts.length; i++) {
                if (i === 0) ctx.moveTo(arc.pts[i].x, arc.pts[i].y);
                else ctx.lineTo(arc.pts[i].x, arc.pts[i].y);
            }
            ctx.stroke();
        }

        // Equator + prime meridian — slightly bolder for orientation cue.
        const drawCircle = (axis) => {
            const pts = [];
            for (let s = 0; s <= 48; s++) {
                const a = (s / 48) * Math.PI * 2;
                const v = axis === 'eq'
                    ? [Math.cos(a), 0, Math.sin(a)]
                    : [Math.cos(a), Math.sin(a), 0];
                pts.push(project(this._transform(v)));
            }
            // Split front/back halves.
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                const front = pts[i].z >= -0.02;
                ctx.strokeStyle = front ? 'rgba(200, 220, 240, 0.9)' : 'rgba(120, 150, 180, 0.35)';
                if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
                else {
                    // We can't change strokeStyle mid-path; do per-segment strokes.
                    const prev = pts[i - 1];
                    ctx.beginPath();
                    ctx.strokeStyle = (prev.z + pts[i].z) / 2 >= -0.02
                        ? 'rgba(200, 220, 240, 0.85)' : 'rgba(120, 150, 180, 0.32)';
                    ctx.moveTo(prev.x, prev.y);
                    ctx.lineTo(pts[i].x, pts[i].y);
                    ctx.stroke();
                }
            }
        };
        drawCircle('eq');
        drawCircle('mer');

        // Axes (X red, Y green, Z blue) — draw back halves first, then front.
        const axes = [
            { dir: [1, 0, 0], color: '#ff5070', label: 'X' },
            { dir: [0, 1, 0], color: '#40ff80', label: 'Y' },
            { dir: [0, 0, 1], color: '#50a0ff', label: 'Z' }
        ];
        const axisPaths = axes.map(a => {
            const start = project(this._transform([0, 0, 0]));
            const ep = project(this._transform([ a.dir[0] * 1.18,  a.dir[1] * 1.18,  a.dir[2] * 1.18]));
            const en = project(this._transform([-a.dir[0] * 1.18, -a.dir[1] * 1.18, -a.dir[2] * 1.18]));
            return { start, ep, en, color: a.color, label: a.label };
        });
        // Back-side passes (z < 0): faded.
        for (const ap of axisPaths) {
            if (ap.en.z < 0) {
                ctx.strokeStyle = ap.color + '55';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(ap.start.x, ap.start.y);
                ctx.lineTo(ap.en.x, ap.en.y);
                ctx.stroke();
                ctx.fillStyle = ap.color + '70';
                ctx.beginPath();
                ctx.arc(ap.en.x, ap.en.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            if (ap.ep.z < 0) {
                ctx.strokeStyle = ap.color + '55';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(ap.start.x, ap.start.y);
                ctx.lineTo(ap.ep.x, ap.ep.y);
                ctx.stroke();
                ctx.fillStyle = ap.color + '70';
                ctx.beginPath();
                ctx.arc(ap.ep.x, ap.ep.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Front-side passes (z >= 0): full strength + labels.
        for (const ap of axisPaths) {
            if (ap.en.z >= 0) {
                ctx.strokeStyle = ap.color;
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(ap.start.x, ap.start.y);
                ctx.lineTo(ap.en.x, ap.en.y);
                ctx.stroke();
                ctx.fillStyle = ap.color;
                ctx.beginPath();
                ctx.arc(ap.en.x, ap.en.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
            if (ap.ep.z >= 0) {
                ctx.strokeStyle = ap.color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(ap.start.x, ap.start.y);
                ctx.lineTo(ap.ep.x, ap.ep.y);
                ctx.stroke();
                ctx.fillStyle = ap.color;
                ctx.beginPath();
                ctx.arc(ap.ep.x, ap.ep.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ap.label, ap.ep.x, ap.ep.y);
            }
        }

        // Tilt readout below.
        ctx.fillStyle = 'rgba(180, 200, 220, 0.75)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`X ${Math.round(this.tiltX)}°  Y ${Math.round(this.tiltY)}°  Z ${Math.round(this.tiltZ)}°`,
            cx, h - 4);
    }
}
