/** Two-legged birds and finger-supported bat wings; no quadruped scaffold. */
(function(root) {
    'use strict';
    const P = root.RRCharacterProps || (typeof require === 'function' ? require('./CharacterProps.js') : null);
    const { add, sub, mul, norm, lerp, cross } = P.vec, rigid = P.rigid;
    const TYPES = {
        birdType: { kind: 'avian', form: 'avian', label: 'Bird type', choices: [['eagle', 'Eagle'], ['owl', 'Owl'], ['crow', 'Crow'], ['sparrow', 'Sparrow'], ['pigeon', 'Pigeon'], ['duck', 'Duck'], ['chicken', 'Chicken'], ['turkey', 'Turkey'], ['parrot', 'Parrot'], ['flamingo', 'Flamingo'], ['hummingbird', 'Hummingbird'], ['penguin', 'Penguin']] },
        batType: { kind: 'bat', form: 'bat', label: 'Bat type', choices: [['littleBrownBat', 'Little brown bat'], ['flyingFox', 'Flying fox'], ['vampireBat', 'Vampire bat']] }
    };
    const PALETTES = {
        eagle: ['#47372c', '#f0ede4', '#251e19'], owl: ['#8a7051', '#d5c4a1', '#4c3a29'], crow: ['#192329', '#35414b', '#11181c'],
        sparrow: ['#80674c', '#d1bca0', '#47382a'], pigeon: ['#73828c', '#c0c7c9', '#354844'], duck: ['#4a6a50', '#b8b1a0', '#654c35'],
        chicken: ['#ae693a', '#dcba79', '#3c3026'], turkey: ['#4c3b2c', '#c8b48e', '#1c1612'], parrot: ['#39894c', '#d8c841', '#2768a0'], flamingo: ['#e99591', '#f7c9bf', '#2b2b30'],
        hummingbird: ['#2e815d', '#d2c4aa', '#7a3142'], penguin: ['#26313a', '#e7e5d9', '#c79a3f'],
        littleBrownBat: ['#69513d', '#987c60', '#3b302e'], flyingFox: ['#48372d', '#ad7a46', '#241e20'], vampireBat: ['#675b51', '#a18b79', '#362b2c']
    };
    const PROFILES = {
        eagle: { head: .10, neck: .09, bill: .10, hook: true, span: .99, tail: .29, raptor: true },
        owl: { head: .16, neck: .02, bill: .045, hook: true, span: .76, tail: .17, frontEyes: true },
        crow: { head: .105, neck: .07, bill: .15, span: .68, tail: .29 },
        sparrow: { head: .095, neck: .015, bill: .065, span: .48, tail: .23, round: true },
        pigeon: { head: .095, neck: .11, bill: .065, span: .60, tail: .22, round: true },
        duck: { head: .11, neck: .15, bill: .14, span: .64, tail: .13, webbed: true },
        chicken: { head: .09, neck: .14, bill: .06, span: .48, tail: .29, comb: true, legs: .22 },
        turkey: { head: .075, neck: .2, bill: .05, span: .56, tail: .34, legs: .26 },
        parrot: { head: .13, neck: .045, bill: .09, hook: true, span: .59, tail: .40, frontEyes: false },
        flamingo: { head: .085, neck: .56, bill: .13, span: .80, tail: .12, legs: .66, webbed: true },
        hummingbird: { head: .09, neck: .015, bill: .30, span: .46, tail: .20, thinBill: true },
        penguin: { head: .12, neck: .12, bill: .10, span: .27, tail: .10, legs: .09, webbed: true, upright: true }
    };
    function mesh(C, name, draw, material = {}) {
        const m = new P.ExactMesh(), normals=m.computeNormals.bind(m);
        const {keepVertexNormals,...surface}=material;
        m.computeNormals=()=>{}; draw(m); if(!keepVertexNormals)normals();
        return C.finish(m, name, { roughness: .72, ...surface });
    }
    function ellipsoid(C, name, center, scale, color, parent, material) {
        return mesh(C, name, m => m.sphere(center, 1, color, rigid(parent), C.save ? 20 : 14, C.save ? 32 : 24, scale), material);
    }
    function line(C, name, path, radii, color, parent) {
        return mesh(C, name, m => m.tube(path, radii, 8, color, rigid(parent)));
    }
    /** Seat an eye in the actual head ellipsoid, retaining a corneal cap
     * above the lid rather than placing an entire eyeball outside it. */
    function insetEye(C,center,scale,offset,radius,parent,side,color) {
        const t=1/Math.hypot(...offset.map((v,k)=>v/scale[k])),surface=offset.map(v=>v*t),normal=norm(surface.map((v,k)=>v/(scale[k]*scale[k])));
        const eye=add(add(center,surface),mul(normal,-radius*.65));C.eye(eye,radius,rigid(parent),side,normal);
        const a=norm(cross(normal,[0,1,0])),b=cross(normal,a),lidCenter=add(eye,mul(normal,radius*.70));
        mesh(C,'Orbital rim '+side,m=>{const ring=Array.from({length:33},(_,i)=>add(lidCenter,add(mul(a,Math.cos(i/32*Math.PI*2)*radius*.72),mul(b,Math.sin(i/32*Math.PI*2)*radius*.72))));m.tube(ring,radius*.07,6,color,rigid(parent));},{noSurfaceDetail:true});
    }
    function feet(C, profile, hipY, z, bat = false) {
        const { r, L, colors: c, rootBone } = C, length = (profile.legs || .18) * r.legLength;
        for (const s of [-1, 1]) {
            const hip = [s * L * .09 * r.girth, hipY, z], knee = [s * L * .105, hipY - L * length * .40, z + L * .05], ankle = [s * L * .11, hipY - L * length, z - L * .025];
            const a = C.bone('Leg' + s + '_0', rootBone, hip, knee, 'legUpper', s > 0 ? 0 : Math.PI), b = C.bone('Leg' + s + '_1', a, knee, ankle, 'legLower', s > 0 ? 0 : Math.PI);
            C.bones[a].motionScale = .12; C.bones[b].motionScale = .2;
            const color = bat ? c.mark : r.birdType==='parrot'?[.24,.25,.23]:profile.upright ? c.mark : profile.raptor?[.65,.39,.035]:[.45, .28, .08];
            mesh(C, 'Leg and foot ' + s, m => {
                m.tube([hip, knee], [L * (profile.raptor?.034:.025), L * .016], 10, c.main, rigid(a));
                m.tube([knee, ankle], [L * (profile.raptor?.018:.012), L * (profile.raptor?.014:.009)], 12, color, rigid(b));
                for (let j = 1; j < 13; j++) m.sphere(lerp(knee, ankle, j / 14), L * (profile.raptor?.017:.011), color, rigid(b), 4, 8, [1, .24, 1]);
                for (let j = 0; j < (bat ? 5 : 4); j++) {
                    const parrot=r.birdType==='parrot',rear = !bat && (parrot?j>=2:j===3),end = add(ankle, [L * (parrot?(j%2-.5)*.033:rear?-.015:(j - (bat ? 2 : 1)) * .027), -L * .008, L * (rear ? -.065 : .09)*(profile.raptor?1.20:1)]);
                    const scale=profile.raptor?1.5:1;
                    m.tube([ankle, lerp(ankle, end, .6), end], [L * .007*scale, L * .006*scale, L * .004*scale], 10, color, rigid(b));
                    if(!profile.raptor)m.tube([end,add(end,[0,-L*.01,L*(rear?-.014:.014)])],[L*.004,L*.0005],8,color,rigid(b));
                    else {
                        const d=rear?-1:1,path=Array.from({length:9},(_,i)=>{const t=i/8;return add(end,[0,L*(.007*Math.sin(t*Math.PI)-.026*t*t),L*d*(.038*t-.008*t*t)]);});
                        m.tube(path,path.map((_,i)=>L*(.0065*(1-i/8)**.75+.0002)),10,[.028,.023,.016],rigid(b));
                        for(let k=1;k<6;k++)m.sphere(lerp(ankle,end,k/7),L*.0075,color,rigid(b),4,8,[1,.5,.7]);
                    }
                    if (profile.webbed && j < 2) {
                        const next = add(end, [L * .027, 0, 0]), n = [0, 1, 0];
                        const v = [ankle, end, next].map(p => m.vertex(p, n, color, rigid(b))); m.tri(...v);
                    }
                }
            }, { doubleSided: !!profile.webbed,noSurfaceDetail:true });
        }
    }
    /** Distinct hooked seed-cracking and bent filtering bills, with an
     * embedded root, a separate mandible and a continuous gape line. */
    function specializedBill(C,bill,parent) {
        const {r,L}=C,parrot=r.birdType==='parrot',skin=rigid(parent),sx=L*r.snoutWidth,sz=L*r.snoutLength;
        const control=parrot?[[.002,.0],[.026,.031],[.019,.068],[-.017,.087],[-.067,.074]]:[[0,0],[.004,.050],[-.006,.093],[-.048,.127],[-.081,.147]];
        const widths=parrot?[.034,.038,.029,.014,.0005]:[.027,.038,.042,.031,.009],heights=parrot?[.031,.035,.028,.019,.0005]:[.025,.027,.029,.024,.009];
        const at=t=>{const q=t*4,k=Math.min(3,Math.floor(q)),f=q-k;return{p:add(bill,[0,(control[k][0]+(control[k+1][0]-control[k][0])*f)*L,(control[k][1]+(control[k+1][1]-control[k][1])*f)*sz]),w:widths[k]+(widths[k+1]-widths[k])*f,h:heights[k]+(heights[k+1]-heights[k])*f};};
        const horn=parrot?[.80,.35,.045]:[.72,.40,.39],black=[.025,.026,.024];
        mesh(C,'Beak',m=>{
            m.loft(33,(_,t)=>{const q=at(t);return{center:q.p,x:[1,0,0],y:[0,1,0],rx:q.w*sx,ry:q.h*L};},24,(t)=>parrot?horn.map((v,k)=>v+( [.90,.64,.15][k]-v)*t):t>.60?black:horn,skin,true);
            const mandible=[add(bill,[0,-L*.028,0]),add(bill,[0,-L*(parrot?.047:.034),sz*.042]),add(bill,[0,-L*(parrot?.048:.069),sz*(parrot?.064:.124)])];
            m.tube(mandible,[sx*.026,sx*.023,sx*.004],18,parrot?black:horn,skin);
            for(const side of [-1,1]){
                const gape=Array.from({length:19},(_,i)=>{const q=at(i/24);return add(q.p,[side*q.w*sx*.91,-q.h*L*.38,0]);});
                m.tube(gape,L*.0015,5,black,skin);
                const nostril=at(.23);m.sphere(add(nostril.p,[side*nostril.w*sx*.95,nostril.h*L*.15,0]),1,black,skin,6,10,[L*.0015,L*.0022,L*.005]);
                if(!parrot)for(let j=0;j<16;j++){const q=at(.22+j*.036);m.tube([add(q.p,[side*q.w*sx*.94,-q.h*L*.34,0]),add(q.p,[side*q.w*sx*.94,-q.h*L*.56,-sz*.002])],L*.0005,4,black,skin);}
            }
        },{noSurfaceDetail:true,roughness:.5});
    }
    // ── birds ──────────────────────────────────────────────────────────────
    // Birds are built the way they are put together: a sculpted trunk and
    // neck under overlapping contour feathers, a sculpted skull with its
    // brow, a keratin bill with cere and gape, and a three-segment wing
    // (humerus, forearm, hand) carrying real feather tracts: primaries on the
    // hand, secondaries and tertials on the forearm, greater, median, lesser
    // and marginal coverts over them, the alula, and under-wing coverts.
    // Every feather is a curved card cut out of a painted feather picture
    // (rachis, barbs, downy base, emarginated primaries), tinted per feather.
    // Feather groups ride their own bones, so a perched bird folds its wing
    // the way a bird does: the hand tucks back under the forearm and the
    // remiges sweep back along the flank, primaries beneath the secondaries.
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    const scale3 = (a, k) => a.map(v => v * k);
    const hash = (i, j = 0) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    const DEG = Math.PI / 180;
    const lin = hex => { const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map(k => { const c = (n >> k & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); };
    // Quaternions [x, y, z, w]; rotations in the rest frame's axes.
    const qAxis = (axis, a) => { const n = norm(axis), s = Math.sin(a / 2); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; };
    const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const qInv = q => [-q[0], -q[1], -q[2], q[3]];
    const qRot = (q, p) => { const t = mul(cross(q, p), 2); return add(p, add(mul(t, q[3]), cross(q, t))); };
    const qSlerp = (a, b, t) => {
        let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], c = b;
        if (d < 0) { d = -d; c = b.map(v => -v); }
        if (d > .9995) { const q = a.map((v, k) => v + (c[k] - v) * t), l = Math.hypot(...q); return q.map(v => v / l); }
        const th = Math.acos(d), s = Math.sin(th);
        return a.map((v, k) => (v * Math.sin((1 - t) * th) + c[k] * Math.sin(t * th)) / s);
    };
    /** The rotation taking orthonormal frame (a, n) to (a2, n2), as a quaternion. */
    function qFrames(a, n, a2, n2) {
        const ortho = (x, y) => { const xx = norm(x), yy = norm(sub(y, mul(xx, dot(y, xx)))); return [xx, yy, cross(xx, yy)]; };
        const [x0, y0, z0] = ortho(a, n), [x1, y1, z1] = ortho(a2, n2);
        // R = M1 * M0^T
        const m = [0, 1, 2].map(i => [0, 1, 2].map(j => x1[i] * x0[j] + y1[i] * y0[j] + z1[i] * z0[j]));
        const tr = m[0][0] + m[1][1] + m[2][2];
        let q;
        if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]; }
        else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
        else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
        else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]; }
        const l = Math.hypot(...q); return q.map(v => v / l);
    }

    /** A mesh with texture coordinates: the feather cards and the sculpted bird parts. */
    class FMesh {
        constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.j = []; this.w = []; this.i = []; }
        vertex(pos, nrm, rgb, skin, uv) {
            const k = this.p.length / 3, s = typeof skin === 'function' ? skin(pos) : skin;
            this.p.push(pos[0], pos[1], pos[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(rgb[0], rgb[1], rgb[2]); this.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
            for (let q = 0; q < 4; q++) { this.j.push(s.joints[q] || 0); this.w.push(s.weights[q] || 0); }
            return k;
        }
        tri(a, b, c) { this.i.push(a, b, c); }
        /** Smooth area-weighted normals for vertices from `from` on (cards keep their own). */
        smoothNormals(from = 0) {
            const P = this.p, N = new Float64Array(P.length);
            for (let t = 0; t < this.i.length; t += 3) {
                const a = this.i[t] * 3, b = this.i[t + 1] * 3, c = this.i[t + 2] * 3;
                if (a < from * 3 && b < from * 3 && c < from * 3) continue;
                const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
                for (const s of [a, b, c]) { N[s] += n[0]; N[s + 1] += n[1]; N[s + 2] += n[2]; }
            }
            for (let k = from * 3; k < N.length; k += 3) { const l = Math.hypot(N[k], N[k + 1], N[k + 2]); if (l > 0) { this.n[k] = N[k] / l; this.n[k + 1] = N[k + 1] / l; this.n[k + 2] = N[k + 2] / l; } }
        }
        part(name, extra) {
            return Object.assign({ name, positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), colors: Float32Array.from(this.c), uvs: Float32Array.from(this.u),
                joints: Uint8Array.from(this.j), weights: Float32Array.from(this.w), index: Uint32Array.from(this.i) }, extra);
        }
        get empty() { return !this.i.length; }
    }

    /** A triangle wound so its face looks along `out`. */
    function triOut(m, a, b, c, out) {
        const P = m.p, A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], n = cross(sub([P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], A), sub([P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], A));
        if (dot(n, out) >= 0) m.tri(a, b, c); else m.tri(a, c, b);
    }
    const at3 = (m, v) => [m.p[v * 3], m.p[v * 3 + 1], m.p[v * 3 + 2]];
    /** Quads between rings, each faced away from its ring's own center. */
    function ringsOut(m, rows, centers, closed = true) {
        for (let i = 0; i < rows.length - 1; i++) {
            const n = rows[i].length, last = closed ? n : n - 1;
            for (let k = 0; k < last; k++) {
                const a = rows[i][k], b = rows[i][(k + 1) % n], c = rows[i + 1][k], d = rows[i + 1][(k + 1) % n];
                const mid = mul(add(add(at3(m, a), at3(m, b)), add(at3(m, c), at3(m, d))), .25), out = sub(mid, lerp(centers[i], centers[i + 1], .5));
                triOut(m, a, c, b, out); triOut(m, b, c, d, out);
            }
        }
    }

    // ── the feather picture ───────────────────────────────────────────────
    // One atlas holds every feather kind; cells are [x, y, w, h] in uv, the
    // feather's base at the cell's bottom and its tip at the top.
    const FEATHER_TEX = 'bird-feathers.png', FEATHER_NORMAL = 'bird-feathers-normal.png';
    const row5 = y => [0, 1, 2, 3, 4].map(i => [.375 + i * .125, y, .125, .2]);
    const CELLS = { primary: [[0, 0, .125, 1]], secondary: [[.125, 0, .125, 1]], tail: [[.25, 0, .125, 1]], covert: row5(0), contour: row5(.2), fine: row5(.4), down: row5(.6), hackle: row5(.8) };
    /**
     * Vane outlines: half-widths of the leading (outer) and trailing vanes,
     * an emargination (the notched inner vane that opens a raptor's finger
     * slots), tip rounding, a downy base, barb count and barb angle.
     */
    const VANES = {
        primary: { lead: .34, trail: .96, notch: .56, round: .16, down: .04, barbs: 170, slope: 1.6, rachis: .07 },
        secondary: { lead: .62, trail: .96, round: .12, tipNotch: .05, down: .05, barbs: 140, slope: 1.3, rachis: .06 },
        tail: { lead: .88, trail: .96, round: .16, down: .05, barbs: 150, slope: 1.3, rachis: .06 },
        covert: { lead: .92, trail: .96, round: .55, down: .22, barbs: 40, slope: .9, rachis: .05 },
        contour: { lead: .95, trail: .95, round: .62, down: .34, barbs: 34, slope: .8, rachis: .045 },
        fine: { lead: .70, trail: .70, round: .5, point: true, down: .26, barbs: 30, slope: .9, rachis: .05 },
        down: { lead: .9, trail: .9, round: .7, down: 1, barbs: 24, slope: .8, rachis: .03 },
        hackle: { lead: .55, trail: .55, round: .2, point: true, down: .12, barbs: 52, slope: 1.4, rachis: .05 }
    };
    function vaneWidth(V, v, side, wobble) {
        let w = side < 0 ? V.lead : V.trail;
        w *= .35 + .65 * smooth(0, V.point ? .35 : .18, v);
        if (V.point) w *= Math.pow(Math.max(0, 1 - v), .75) * 1.25;
        if (V.notch && side > 0) w *= .52 + .48 * (1 - smooth(V.notch - .04, V.notch + .06, v));
        if (V.notch && side < 0) w *= 1 - .25 * smooth(.55, .8, v);
        const r0 = 1 - V.round;
        if (v > r0) w *= Math.sqrt(Math.max(0, 1 - ((v - r0) / V.round) ** 2));
        if (V.tipNotch && v > .97) w *= 1 - .5 * smooth(.97, 1, v) * (1 - Math.abs(side) * 0);
        return Math.max(0, w * (1 + wobble));
    }
    const pictureCache = new Map();
    function featherPictures(size) {
        if (pictureCache.has(size)) return pictureCache.get(size);
        const color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), height = new Float32Array(size * size);
        for (const [kind, cells] of Object.entries(CELLS)) cells.forEach((cell, variant) => {
            const V = VANES[kind], x0 = Math.round(cell[0] * size) + 2, y0 = Math.round(cell[1] * size) + 2, w = Math.round(cell[2] * size) - 4, h = Math.round(cell[3] * size) - 4;
            const half = w / 2, seed = kind.length * 13 + variant * 7;
            for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
                const v = 1 - (py + .5) / h, u = (px + .5 - half) / half, side = u < 0 ? -1 : 1, au = Math.abs(u);
                // Barbs leave the rachis toward the tip; each is its own strand.
                const phase = (v * h - au * half * V.slope) / (h / V.barbs), barb = Math.floor(phase), f = phase - barb;
                const wob = (hash(barb * 3 + side, seed) - .5) * .06 + (hash(Math.floor(v * 7), seed + side) - .5) * .05;
                const hw = vaneWidth(V, v, side, wob);
                let a = clamp((hw - au) * half + .5, 0, 1);
                const rachisW = V.rachis * (1 - .7 * v) + .012;
                const shaft = au < rachisW && v > .0 && v < .985 ? 1 : 0;
                if (v < .03) a = au < rachisW * 1.6 ? 1 : 0;
                // Barbs part here and there toward the edge: a feather's natural splits.
                if (!shaft && hash(barb * 7 + side, seed + 3) < .07 && au > hw * .45 && Math.abs(f - .5) < .16) a = 0;
                // The downy base: soft afterfeather plumes, broken and pale.
                const downy = V.down >= 1 ? 1 : 1 - smooth(V.down * .55, V.down, v);
                if (downy > 0 && !shaft) {
                    const fluff = hash(Math.floor(px / 2.5) + seed, Math.floor(py / 3.5)) * .6 + hash(Math.floor(px / 1.3), Math.floor(py / 1.6) + seed) * .4;
                    a *= 1 - downy * (fluff < .45 + .35 * au ? 1 : 0);
                }
                const ridge = .5 + .5 * Math.cos(f * Math.PI * 2);
                // Vanes darken toward their edges and tips, so overlapping feathers read as scallops.
                const edge = au / Math.max(.05, hw);
                let value = .84 + .045 * ridge - .16 * smooth(.55, 1, edge) - .08 * smooth(.85, 1, v) + .04 * (hash(barb, seed + 9) - .5);
                value += downy * .10;
                if (shaft) value = .93 - .1 * v;
                const o = ((y0 + py) * size + x0 + px);
                color.set([Math.round(clamp(value, 0, 1) * 255), Math.round(clamp(value, 0, 1) * 255), Math.round(clamp(value, 0, 1) * 255), Math.round(a * 255)], o * 4);
                height[o] = ridge * .35 * (1 - downy) + (shaft ? 1.2 : Math.exp(-((au / (rachisW * 2.2)) ** 2)) * .8) + (1 - (au / Math.max(.05, hw)) ** 2) * 1.6;
            }
        });
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const o = y * size + x, l = height[y * size + Math.max(0, x - 1)], r = height[y * size + Math.min(size - 1, x + 1)];
            const d = height[Math.max(0, y - 1) * size + x], u = height[Math.min(size - 1, y + 1) * size + x];
            const n = norm([(l - r) * .9, (d - u) * .9, 1]);
            normal.set([Math.round(127.5 + n[0] * 127.5), Math.round(127.5 + n[1] * 127.5), Math.round(127.5 + n[2] * 127.5), 255], o * 4);
        }
        const pictures = { [FEATHER_TEX]: { width: size, height: size, data: color, name: FEATHER_TEX }, [FEATHER_NORMAL]: { width: size, height: size, data: normal, name: FEATHER_NORMAL } };
        pictureCache.set(size, pictures);
        return pictures;
    }

    /**
     * A tiling plumage picture for the sculpted body and head under the cards:
     * offset rows of small overlapping feathers (each upstream feather lies
     * over the next one's base, its tip casting a soft shadow), with rachis
     * and barb streaks. Rows run down the picture (v), tips toward +v.
     */
    const PLUMAGE_TEX = 'bird-plumage.png', PLUMAGE_NORMAL = 'bird-plumage-normal.png', PLUMAGE_FINE = 'bird-plumage-fine.png', PLUMAGE_FINE_NORMAL = 'bird-plumage-fine-normal.png';
    const plumageCache = new Map();
    function plumagePictures(size, fine = false) {
        const key = size + (fine ? 'f' : '');
        if (plumageCache.has(key)) return plumageCache.get(key);
        const color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), height = new Float32Array(size * size);
        const ROWS = 10, COLS = 8, rh = size / ROWS, cw = size / COLS;
        const tipY = (r, c) => ((r + .5 + (hash(r * 31 + c, 2) - .5) * .35) * rh);
        const tipX = (r, c) => ((c + (r % 2) * .5 + (hash(r * 17 + c, 5) - .5) * .3) * cw);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            // The covering feather: among those whose tip lies at or below this point, the nearest.
            let best = null;
            const r0 = Math.floor(y / rh);
            for (let dr = -1; dr <= 2 && !best; dr++) {
                const r = r0 + dr;
                for (let c = -1; c <= COLS; c++) {
                    const ry = ((r % ROWS) + ROWS) % ROWS, ty = tipY(ry, ((c % COLS) + COLS) % COLS) + (r - ry) * rh, tx = tipX(ry, ((c % COLS) + COLS) % COLS) + (c - ((c % COLS) + COLS) % COLS) * cw;
                    let dx = x - tx; dx -= Math.round(dx / size) * size;
                    const dy = ty - y; if (dy < 0 || dy > rh * 2.6) continue;
                    // Fine head feathers are lanceolate: narrow, with pointed tips.
                    const hw = cw * (fine ? .48 + .1 * hash(ry * 7 + c, 9) : .62 + .12 * hash(ry * 7 + c, 9)), round = hw * (fine ? 2.2 : 1.15), f = dy < round ? (fine ? Math.pow(dy / round, .75) : Math.sqrt(Math.max(0, 1 - (1 - dy / round) ** 2))) : 1;
                    if (Math.abs(dx) < hw * f && (!best || ty < best.ty)) best = { dx, dy, hw, f, ty, id: ry * 97 + c };
                }
            }
            let value = .78, h = 0;
            if (best) {
                const { dx, dy, hw } = best, e = Math.abs(dx) / (hw * Math.max(.05, best.f)), tone = (hash(best.id, 3) - .5) * (fine ? .05 : .10);
                const barb = .5 + .5 * Math.cos((Math.abs(dx) * 1.2 + dy) / (cw * .11) * Math.PI * 2);
                const rachis = Math.exp(-((dx / (cw * .045)) ** 2)) * smooth(rh * .1, rh * .6, dy);
                // Shadow of the feather lying over this one, just past its tip.
                value = .86 + tone + .05 * barb + .05 * rachis - (fine ? .06 : .13) * smooth(.6, 1, e);
                const under = Math.max(0, 1 - best.dy / (rh * .55));
                h = (1 - e * e) * .6 + barb * .12 + rachis * .3 + Math.min(1, dy / (rh * 1.5)) * .9 - under * .2;
                // Darkened toward the feather's root, which the next feather covers.
                value -= (fine ? .05 : .12) * smooth(rh * .9, rh * 1.8, dy);
            }
            const o = y * size + x, g = Math.round(clamp(value, 0, 1) * 255);
            color.set([g, g, g, 255], o * 4); height[o] = h;
        }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const at = (xx, yy) => height[((yy + size) % size) * size + ((xx + size) % size)];
            const n = norm([(at(x - 1, y) - at(x + 1, y)) * size / 96, (at(x, y - 1) - at(x, y + 1)) * size / 96, 1]);
            normal.set([Math.round(127.5 + n[0] * 127.5), Math.round(127.5 + n[1] * 127.5), Math.round(127.5 + n[2] * 127.5), 255], (y * size + x) * 4);
        }
        const names = fine ? [PLUMAGE_FINE, PLUMAGE_FINE_NORMAL] : [PLUMAGE_TEX, PLUMAGE_NORMAL];
        const pictures = { [names[0]]: { width: size, height: size, data: color, name: names[0], repeat: true }, [names[1]]: { width: size, height: size, data: normal, name: names[1], repeat: true } };
        plumageCache.set(key, pictures);
        return pictures;
    }
    function plumageMaterial(C, extra = {}, fine = false) {
        return { kind: 'feather', texture: fine ? PLUMAGE_FINE : PLUMAGE_TEX, normalTexture: fine ? PLUMAGE_FINE_NORMAL : PLUMAGE_NORMAL, normalScale: .9, keepColors: true, roughness: C.prof.gloss ? .6 : .9, noSurfaceDetail: true, pictures: plumagePictures(C.save ? 512 : 256, fine), ...extra };
    }

    /**
     * One feather card: `root`, `dir` (along the shaft), `up` (out of the
     * vane's upper face), `len`, `wid`, a `cell`, `lead` (where the narrow
     * outer vane lies, else across = up × dir), `bend` (tip curls toward
     * -up), `lift`, `cup` (vane arches over the shaft), `rows`, `color`
     * (rgb or (v, u) => rgb), `skin`, and `surface` (a normal blended into the
     * card's, so a coat of cards shades as one surface).
     */
    function card(m, o) {
        // A zero wing size or tail length leaves no feather rather than a collapsed one.
        if (!(o.len > 1e-6) || !(o.wid > 1e-7)) return;
        const rows = o.rows || 2, dir = norm(o.dir), up0 = norm(sub(o.up, mul(dir, dot(o.up, dir))));
        let across = norm(cross(up0, dir));
        // A card turned to put its leading vane on the other side is wound the other way too, so its faces agree with its normals (a mirrored wing's cards were lit from behind).
        let flip = false;
        if (o.lead) { const l = sub(o.lead, mul(dir, dot(o.lead, dir))); if (dot(across, l) > 0) { across = mul(across, -1); flip = true; } }
        const cell = o.cell, ids = [];
        for (let r = 0; r <= rows; r++) {
            const v = r / rows, row = [];
            for (const u of [-1, 0, 1]) {
                const sag = -((o.bend || 0) + .5 * (o.curv || 0) * o.len) * o.len * v * v + (o.lift || 0) * o.len * v + (o.cup || 0) * o.wid * .5 * (1 - u * u) * Math.sin(Math.PI * Math.min(1, v * 1.4 + .1));
                const p = add(add(add(o.root, mul(dir, v * o.len)), mul(across, u * o.wid * .5)), mul(up0, sag));
                let n = norm(add(up0, mul(across, u * (o.cup || 0) * .9)));
                if (o.surface) n = norm(add(mul(n, .62), mul(o.surface, .38)));
                const col = typeof o.color === 'function' ? o.color(v, u) : o.color;
                // Cells hold the leading vane at u < 0.
                row.push(m.vertex(p, n, col, o.skin, [cell[0] + (u + 1) * .5 * cell[2], cell[1] + (1 - v) * cell[3]]));
            }
            ids.push(row);
        }
        for (let r = 0; r < rows; r++) for (let k = 0; k < 2; k++) {
            if (flip) { m.tri(ids[r][k], ids[r][k + 1], ids[r + 1][k]); m.tri(ids[r][k + 1], ids[r + 1][k + 1], ids[r + 1][k]); }
            else { m.tri(ids[r][k], ids[r + 1][k], ids[r][k + 1]); m.tri(ids[r][k + 1], ids[r + 1][k], ids[r + 1][k + 1]); }
        }
    }

    // ── kinds of bird ─────────────────────────────────────────────────────
    // Lengths in units of L (C.L); `pitch` the perched trunk's angle above the
    // horizon. Trunk [length, width, depth]; head [length, width, height];
    // wing: humerus, forearm, hand, primary/secondary counts and lengths;
    // tail length, count and shape; leg: tibia, tarsus, toe, talon, feathering.
    const BIRDS = {
        eagle: { pitch: 56, trunk: [.36, .20, .215], keel: 1.0, neck: [.05, .056], head: [.130, .086, .076], skull: 'raptor', bill: 'raptor', billLen: .066, eye: .0150, iris: '#f2dd74', eyeFwd: .72,
            wing: [.17, .20, .105, 10, 15, .41, .28], slots: 1, dihedral: 7, tail: [.26, 12, 'wedge'], leg: [.11, .072, .066, .036, .55], legColor: '#e8b52c', billColor: '#e9b62e', card: 1, ruff: true },
        owl: { pitch: 72, trunk: [.30, .23, .23], keel: .9, neck: [.04, .085], head: [.15, .16, .145], skull: 'owl', bill: 'owl', billLen: .036, eye: .022, iris: '#f2b221', eyeFwd: 1.45,
            wing: [.15, .17, .09, 10, 14, .32, .24], slots: .3, dihedral: 5, tail: [.17, 12, 'round'], leg: [.11, .07, .05, .028, 1.2], legColor: '#cdb79a', billColor: '#3d3a33', card: 1.15, soft: true },
        crow: { pitch: 30, trunk: [.33, .17, .18], keel: .9, neck: [.08, .05], head: [.12, .082, .082], skull: 'passerine', bill: 'crow', billLen: .11, eye: .012, iris: '#2a1e14', eyeFwd: .3,
            wing: [.15, .17, .10, 10, 10, .36, .25], slots: .6, dihedral: 4, tail: [.28, 12, 'round'], leg: [.10, .10, .055, .02, 0], legColor: '#1d1d1f', billColor: '#151517', card: .85, gloss: true },
        sparrow: { pitch: 28, trunk: [.36, .23, .22], keel: 1, neck: [.04, .07], head: [.14, .12, .115], skull: 'passerine', bill: 'cone', billLen: .065, eye: .016, iris: '#1e140c', eyeFwd: .25,
            wing: [.13, .15, .09, 9, 9, .30, .22], slots: 0, dihedral: 4, tail: [.27, 12, 'notch'], leg: [.08, .09, .05, .015, 0], legColor: '#b58d78', billColor: '#5a4a3c', card: .9 },
        pigeon: { pitch: 22, trunk: [.38, .22, .23], keel: 1.15, neck: [.08, .06], head: [.10, .085, .085], skull: 'passerine', bill: 'pigeon', billLen: .055, eye: .012, iris: '#e8702a', eyeFwd: .2,
            wing: [.15, .17, .10, 10, 11, .36, .22], slots: .1, dihedral: 6, tail: [.25, 12, 'square'], leg: [.08, .075, .05, .015, 0], legColor: '#c4473f', billColor: '#2c2a2a', card: .95 },
        duck: { pitch: 12, trunk: [.42, .22, .20], keel: .9, neck: [.15, .055], head: [.12, .085, .095], skull: 'duck', bill: 'duck', billLen: .13, eye: .011, iris: '#2b1a0e', eyeFwd: .15,
            wing: [.15, .17, .10, 10, 14, .30, .20], slots: 0, dihedral: 5, tail: [.13, 16, 'point'], leg: [.08, .055, .07, .008, 0], legColor: '#e2802a', billColor: '#d9c13a', card: 1, webbed: true },
        chicken: { pitch: 24, trunk: [.38, .22, .26], keel: 1.1, neck: [.14, .06], head: [.10, .07, .08], skull: 'passerine', bill: 'chicken', billLen: .055, eye: .011, iris: '#d7801c', eyeFwd: .1,
            wing: [.13, .14, .08, 10, 12, .24, .19], slots: 0, dihedral: 2, tail: [.30, 14, 'sickle'], leg: [.14, .13, .07, .012, 0], legColor: '#d9b53c', billColor: '#c9a648', card: 1.1, comb: true },
        // A tom turkey: a deep bronze barrel, long bare neck, a small bare head with snood and wattle, a broad round tail fan.
        turkey: { pitch: 20, trunk: [.44, .26, .30], keel: 1.2, neck: [.20, .05], head: [.085, .06, .068], skull: 'passerine', bill: 'chicken', billLen: .05, eye: .010, iris: '#3a2416', eyeFwd: .1,
            wing: [.14, .15, .09, 10, 12, .25, .20], slots: 0, dihedral: 2, tail: [.36, 18, 'round'], leg: [.16, .15, .075, .012, 0], legColor: '#c08a7c', billColor: '#cdbfa6', card: 1.15, snood: true, fanTail: 2.1 },
        parrot: { pitch: 60, trunk: [.30, .19, .20], keel: 1, neck: [.06, .06], head: [.14, .11, .11], skull: 'parrot', bill: 'parrot', billLen: .07, eye: .013, iris: '#e6d89a', eyeFwd: .2,
            wing: [.15, .17, .10, 10, 10, .32, .22], slots: 0, dihedral: 3, tail: [.40, 12, 'graduated'], leg: [.08, .06, .055, .02, 0], legColor: '#5e605c', billColor: '#3a3a3a', card: .95, zygodactyl: true },
        flamingo: { pitch: 18, trunk: [.30, .16, .18], keel: .9, neck: [.50, .028], head: [.075, .055, .06], skull: 'passerine', bill: 'flamingo', billLen: .13, eye: .009, iris: '#f0d040', eyeFwd: .1,
            wing: [.15, .17, .10, 10, 14, .30, .22], slots: 0, dihedral: 3, tail: [.11, 12, 'round'], leg: [.38, .40, .07, .008, 0], legColor: '#e07a86', billColor: '#f0c4c0', card: .9, webbed: true },
        hummingbird: { pitch: 30, trunk: [.30, .18, .18], keel: 1, neck: [.03, .06], head: [.12, .10, .10], skull: 'passerine', bill: 'needle', billLen: .26, eye: .016, iris: '#140e0a', eyeFwd: .2,
            wing: [.06, .09, .17, 10, 6, .42, .12], slots: 0, dihedral: 2, tail: [.20, 10, 'fork'], leg: [.04, .035, .03, .008, 0], legColor: '#29221f', billColor: '#151313', card: .8, gloss: true },
        penguin: { pitch: 86, trunk: [.62, .30, .30], keel: 1, neck: [.06, .12], head: [.16, .13, .13], skull: 'penguin', bill: 'penguin', billLen: .13, eye: .012, iris: '#2a1a12', eyeFwd: .2,
            wing: [.08, .09, .09, 10, 10, .2, .15], slots: 0, dihedral: 0, tail: [.07, 12, 'point'], leg: [.05, .04, .06, .012, 0], legColor: '#2a2726', billColor: '#2a2522', card: .5, penguin: true, webbed: true }
    };
    /** Typical grown size (C.L / 2.4) of each kind of bird, applied when its type is chosen. */
    const BIRD_SIZES = { eagle: .5, owl: .3, crow: .25, sparrow: .09, pigeon: .18, duck: .3, chicken: .36, turkey: .5, parrot: .22, flamingo: .55, hummingbird: .06, penguin: .5 };

    /**
     * Plumage by tract: a feather's color from its kind of bird, its tract
     * (`zone`), where it sits (`t`, 0 low/back to 1 high/front) and its own
     * coordinates (v along, u across), then the chosen coat pattern.
     */
    function plumage(C, zone, t = .5, seed = 0) {
        const { r, colors: c } = C, type = r.birdType, M = c.main, Lt = c.light, K = c.mark, rnd = hash(seed, 3);
        const vary = (col, k = .06) => scale3(col, 1 - k / 2 + k * rnd);
        const tipLight = (base, tip, amount) => (v, u) => mix(base, tip, amount * smooth(.62, .98, v) * (1 - .4 * u * u));
        const fixed = col => () => col;
        let f;
        const dark = scale3(M, .62), flight = K;
        switch (type) {
            case 'eagle': {
                // The white hood ends in a ragged line at the neck's base, lower at the throat.
                // White feathers straggle down into the brown of the shoulders and upper breast, one by one.
                const hood = ['nape', 'neck', 'throat'].includes(zone) ? (t + (rnd - .5) * .30 > (zone === 'throat' ? -.1 : .04) ? 1 : 0)
                    : ['breast', 'scapular', 'back', 'flank'].includes(zone) && t > .6 ? (rnd < .85 * smooth(.6, .72, t) ? 1 : 0) : 0;
                const white = ['head', 'face', 'tail', 'uppertail', 'undertail'].includes(zone) || hood === 1;
                const neck = ['nape', 'neck', 'throat'].includes(zone) && !white ? M : null;
                f = white ? tipLight(vary(Lt, .04), scale3(Lt, .92), .5) : neck ? fixed(vary(neck))
                    : zone === 'primary' ? tipLight(flight, scale3(flight, .7), .8) : ['secondary', 'tertial'].includes(zone) ? tipLight(mix(M, flight, .55), scale3(flight, .8), .6)
                    : zone === 'trouser' ? tipLight(vary(scale3(M, .92)), scale3(M, 1.08), .4) : zone === 'underwing' ? fixed(vary(scale3(M, .8)))
                    : tipLight(vary(M, .14), mix(M, [.32, .24, .16], .35), .25);
                break;
            }
            case 'owl': {
                const pale = ['belly', 'breast', 'throat', 'face', 'undertail', 'trouser', 'underwing'].includes(zone);
                const base = pale ? mix(Lt, M, zone === 'breast' ? .25 : .08) : vary(M, .12);
                f = (v, u) => {
                    const bar = Math.max(0, Math.sin(v * Math.PI * (zone === 'primary' || zone === 'secondary' || zone === 'tail' ? 9 : 4) + rnd * 3)) ** 4 * (zone === 'face' ? 0 : .7);
                    const streak = (pale ? 1 : .6) * Math.exp(-((u / .22) ** 2)) * smooth(.3, .8, v) * (zone === 'face' ? 0 : 1);
                    return mix(mix(base, K, Math.max(bar * (pale ? .5 : .8), streak * .8)), scale3(Lt, .95), pale ? 0 : .25 * smooth(.85, 1, v));
                };
                if (zone === 'disk') f = (v, u) => mix(scale3(Lt, .97 + .05 * rnd), mix(Lt, M, .5), .06 + .22 * smooth(.55, 1, v) * (1 - Math.abs(u)));
                if (zone === 'rim') f = fixed(scale3(K, .9));
                break;
            }
            case 'crow': {
                const sheen = mix(M, K, .35);
                f = (v, u) => mix(M, sheen, .5 * smooth(.3, 1, v) * (1 - Math.abs(u) * .5));
                break;
            }
            case 'sparrow': {
                const grey = mix(Lt, [.18, .18, .19], .25), chestnut = mix(M, [.25, .07, .02], .45);
                if (['head'].includes(zone)) f = fixed(vary(grey, .05));
                else if (['nape', 'neck'].includes(zone)) f = fixed(vary(chestnut, .08));
                else if (['throat'].includes(zone)) f = fixed(scale3(K, .8));
                else if (['face', 'belly', 'breast', 'undertail', 'underwing', 'trouser'].includes(zone)) f = fixed(vary(mix(Lt, grey, .3), .05));
                else if (['back', 'scapular', 'rump'].includes(zone)) f = (v, u) => mix(vary(M, .12), K, .85 * Math.exp(-((u / .3) ** 2)) * smooth(.15, .7, v));
                else if (zone === 'covertM') f = tipLight(M, Lt, 1);
                else if (['primary', 'secondary', 'tertial', 'tail'].includes(zone)) f = (v, u) => mix(scale3(K, 1.2), M, smooth(.4, .95, Math.abs(u)) * .8);
                else f = tipLight(vary(M, .1), mix(M, Lt, .3), .5);
                break;
            }
            case 'pigeon': {
                const iridescent = (v) => mix([.09, .32, .17], [.30, .10, .30], .5 + .5 * Math.sin(seed * 1.7 + v * 3));
                if (['nape', 'neck', 'throat'].includes(zone)) f = v => mix(vary(M, .05), iridescent(v), .32 * smooth(.3, 1, v));
                else if (zone === 'covertG' || zone === 'tertial') f = (v) => mix(Lt, K, smooth(.55, .7, v) * (1 - smooth(.9, .97, v)));
                else if (zone === 'secondary') f = v => mix(mix(Lt, M, .4), K, smooth(.6, .8, v) * .9);
                else if (zone === 'primary') f = tipLight(mix(M, K, .55), scale3(K, .8), .9);
                else if (zone === 'tail') f = v => mix(M, K, smooth(.78, .88, v));
                else if (['covertL', 'covertM', 'scapular', 'back'].includes(zone)) f = fixed(vary(mix(Lt, M, .25), .06));
                else f = fixed(vary(M, .06));
                break;
            }
            case 'duck': {
                const chestnut = K, white = [.85, .85, .82], grey = Lt, speculum = [.06, .10, .55];
                if (['head', 'face', 'throat', 'nape'].includes(zone) || zone === 'neck' && t > .45) f = v => mix(M, [.02, .20, .10], .35 + .3 * Math.sin(seed + v * 2));
                else if (zone === 'neck') f = fixed(t > .32 ? white : chestnut);
                else if (zone === 'breast') f = fixed(vary(chestnut, .08));
                else if (['belly', 'flank', 'trouser', 'underwing'].includes(zone)) f = (v, u) => mix(grey, scale3(grey, .7), .5 + .5 * Math.sin(v * 40 + u * 2));
                else if (['back', 'scapular'].includes(zone)) f = fixed(vary(mix(grey, chestnut, .45), .1));
                else if (['rump', 'uppertail', 'undertail'].includes(zone)) f = fixed([.02, .02, .025]);
                else if (zone === 'secondary') f = v => mix(speculum, white, smooth(.85, .93, v));
                else if (zone === 'covertG') f = v => mix(mix(grey, [.3, .3, .3], .5), white, smooth(.75, .85, v)) ;
                else if (zone === 'tail') f = fixed(white);
                else f = fixed(vary(mix(grey, [.25, .24, .22], .6), .06));
                break;
            }
            case 'chicken': {
                const hackle = Lt, saddle = mix(Lt, M, .4), black = scale3(K, .7), glossy = [.02, .07, .04];
                if (['nape', 'neck', 'head'].includes(zone)) f = (v) => mix(M, hackle, smooth(.2, .8, v));
                else if (['rump', 'uppertail'].includes(zone)) f = v => mix(M, saddle, smooth(.3, .9, v));
                else if (['breast', 'belly', 'throat', 'trouser', 'undertail', 'underwing'].includes(zone)) f = fixed(vary(black, .1));
                else if (zone === 'tail' || zone === 'sickle') f = v => mix(black, glossy, .6 * smooth(.2, 1, v));
                else if (zone === 'primary' || zone === 'secondary') f = tipLight(mix(M, K, .5), K, .5);
                else f = fixed(vary(M, .1));
                break;
            }
            case 'turkey': {
                // Bronze body feathers with a copper sheen, each tipped with a black band and a narrow buff edge;
                // white-barred flight feathers; a chestnut tail with a dark band near its buff tip; bare blue-and-red head skin.
                const bronze = mix(M, [.30, .20, .06], .35), black = scale3(K, .8), buff = Lt, skinBlue = [.55, .66, .82], skinRed = [.62, .06, .06];
                if (zone === 'head' || zone === 'face') f = fixed(skinBlue);
                else if (zone === 'throat' || zone === 'nape' && t > .7) f = fixed(skinRed);
                else if (zone === 'primary' || zone === 'secondary') f = v => Math.sin(v * Math.PI * 11 + rnd) > .1 ? scale3(buff, 1.15) : scale3(black, 1.2);
                else if (zone === 'tail') f = v => v > .93 ? buff : v > .78 ? black : mix(scale3(K, 1.6), [.35, .2, .1], .55 + .25 * Math.sin(v * 30));
                else if (['uppertail', 'rump'].includes(zone)) f = v => v > .85 ? buff : mix(bronze, [.4, .22, .08], .4);
                else f = (v, u) => v > .92 ? buff : v > .74 ? black : vary(mix(bronze, [.42, .26, .08], .35 * smooth(.3, .7, v) * (1 - u * u)), .1);
                break;
            }
            case 'parrot': {
                const red = [.55, .02, .02];
                if (zone === 'head' && t > .55) f = fixed(Lt);
                else if (zone === 'face') f = fixed(mix(Lt, M, .3));
                else if (zone === 'primary') f = tipLight(K, scale3(K, .6), .6);
                else if (zone === 'secondary') f = v => mix(red, K, smooth(.25, .5, v));
                else if (zone === 'tail') f = v => mix(M, Lt, smooth(.75, .95, v));
                else f = fixed(vary(M, .07));
                break;
            }
            case 'flamingo': {
                if (zone === 'primary' || zone === 'secondary') f = fixed(K);
                else if (['covertL', 'covertM', 'covertG', 'scapular'].includes(zone)) f = fixed(vary(mix(M, [.75, .05, .08], .45), .08));
                else f = fixed(vary(mix(M, Lt, zone === 'belly' || zone === 'head' ? .4 : .1), .06));
                break;
            }
            case 'hummingbird': {
                if (zone === 'throat') f = v => mix(K, [.9, .1, .15], .4 * smooth(.4, 1, v));
                else if (['belly', 'breast', 'undertail', 'trouser', 'face'].includes(zone)) f = fixed(vary(Lt, .06));
                else if (['primary', 'secondary'].includes(zone)) f = fixed([.05, .05, .055]);
                else if (zone === 'tail') f = v => mix(M, [.02, .02, .02], smooth(.4, .6, v));
                else f = v => mix(M, mix(M, [.4, .5, .1], .4), smooth(.3, 1, v));
                break;
            }
            case 'penguin': {
                if (['belly', 'breast', 'throat', 'underwing'].includes(zone)) f = fixed(Lt);
                else f = fixed(M);
                break;
            }
            default: f = fixed(M);
        }
        // The chosen coat pattern, laid over the kind's own plumage.
        const pat = r.pattern, amt = r.patternAmount ?? 1, ps = r.patternScale || 1;
        if (pat === 'solid' || !amt) return f;
        return (v, u) => {
            let col = f(v, u);
            const under = ['belly', 'breast', 'throat', 'undertail', 'underwing', 'trouser'].includes(zone);
            if (pat === 'countershade' && under) col = mix(col, Lt, .8 * amt);
            else if (pat === 'stripes' || pat === 'tabby') col = mix(col, K, amt * .8 * Math.max(0, Math.sin(v * Math.PI * 5 / ps + rnd)) ** 6);
            else if (pat === 'spots' || pat === 'rosettes') col = mix(col, pat === 'spots' ? Lt : K, amt * (1 - smooth(.15, .26, Math.hypot(v - .8, u * .5))));
            else if (pat === 'dapple') col = mix(col, Lt, amt * .6 * (1 - smooth(.2, .32, Math.hypot(v - .75, u * .6))));
            else if (pat === 'piebald') col = mix(col, Lt, amt * (hash(Math.floor(seed / (8 * ps)), 5) > .55 ? 1 : 0));
            else if (pat === 'socks' && zone === 'trouser') col = mix(col, Lt, amt);
            else if (pat === 'saddle' && ['back', 'scapular', 'rump'].includes(zone)) col = mix(col, K, amt * .8);
            else if (pat === 'points' && ['head', 'face', 'primary', 'tail'].includes(zone)) col = mix(col, K, amt * .7);
            else if (pat === 'scales') col = mix(col, K, amt * .5 * smooth(.85, .98, v));
            return col;
        };
    }

    /**
     * The trunk and neck as one sculpted surface along a curved axis: stations
     * of center, tangent and dorsal/ventral/side radii, from the tail's root to
     * inside the head. Returns its sampler for the cards that cover it.
     */
    function birdBody(C, B) {
        const { r, L, rootBone: root, headBone: head } = C, b = B.prof;
        const stations = [], NT = 30, NN = 14;
        const keys = [[0, .16, .30, .22], [.12, .55, .62, .55], [.30, .86, .86, .90], [.55, 1, .94, 1], [.75, .94, .88, .98], [.90, .78, .76, .84], [1, .62, .62, .64]];
        const at = (k, t) => { for (let i = 0; i < k.length - 1; i++) if (t <= k[i + 1][0]) { const u = smooth(k[i][0], k[i + 1][0], t); return k[i].slice(1).map((v, j) => v + (k[i + 1][j + 1] - v) * u); } return k.at(-1).slice(1); };
        const [len, wid, dep] = B.trunk;
        for (let i = 0; i <= NT; i++) {
            const t = i / NT, s = at(keys, t), c = add(add(B.O, mul(B.F, (t - .5) * len)), mul(B.U, -dep * .04 * Math.sin(Math.PI * t)));
            const keel = b.keel * smooth(.45, .75, t) * (1 - smooth(.85, 1, t));
            stations.push({ s: t * .72, c, T: B.F, w: wid * .5 * s[0] * r.girth, rd: dep * .5 * s[1] * r.chestDepth, rv: dep * .5 * s[2] * r.chestDepth * (1 + .10 * keel), skin: 0 });
        }
        // The neck: a smooth curve from the shoulders into the back of the skull.
        const P0 = add(B.O, mul(B.F, len * .5)), P3 = B.neckEnd, T0 = B.F, T3 = B.neckDir, d = Math.hypot(...sub(P3, P0));
        // A long neck (a flamingo's) carries an S: up from the shoulders, bowed back, then forward into the head.
        const longNeck = b.neck[0] > .3;
        const P1 = longNeck ? add(P0, mul(norm([0, .75, .55]), d * .40)) : add(P0, mul(T0, d * .4)), P2 = longNeck ? add(P3, mul(norm([0, -.55, -.85]), d * .55)) : sub(P3, mul(T3, d * .45));
        const last = stations.at(-1), neckR = B.neckR;
        for (let i = 1; i <= NN; i++) {
            const t = i / NN, a = 1 - t, c = add(add(mul(P0, a * a * a), mul(P1, 3 * a * a * t)), add(mul(P2, 3 * a * t * t), mul(P3, t * t * t)));
            const T = norm(add(add(mul(sub(P1, P0), 3 * a * a), mul(sub(P2, P1), 6 * a * t)), mul(sub(P3, P2), 3 * t * t)));
            // A raptor's hood: a thick neck that flares into the shoulders, not a stalk.
            const e = smooth(0, b.skull === 'raptor' ? .65 : .55, t), rr = neckR * (1 - .12 * smooth(.6, 1, t));
            stations.push({ s: .72 + t * .28, c, T, w: last.w + (rr * 1.04 - last.w) * e, rd: last.rd + (rr - last.rd) * e, rv: last.rv + (rr * 1.12 - last.rv) * e, skin: smooth(.15, .85, t) });
        }
        const X = [1, 0, 0];
        const frame = st => { const T = st.T, Uv = norm(cross(T, X)); return Uv; };
        const point = (st, a) => { const Uv = frame(st), sn = Math.sin(a), cs = Math.cos(a); return add(st.c, add(mul(X, cs * st.w), mul(Uv, sn * (sn > 0 ? st.rd : st.rv)))); };
        const skinOf = w => w <= 0 ? rigid(root) : w >= 1 ? rigid(head) : { joints: [root, head, 0, 0], weights: [1 - w, w, 0, 0] };
        const SIDES = C.save ? 44 : 36, m = new FMesh(), color = scale3(C.colors.main, .55);
        // Plumage picture coordinates: around the body (seam under the belly) and along its length, about one feather row per 1.4% of L.
        let arc = 0; const arcs = stations.map((st, i) => (arc += i ? Math.hypot(...sub(st.c, stations[i - 1].c)) : 0));
        const around = Math.max(2, Math.round(Math.PI * (wid + dep) * .5 * r.girth / (L * .030 * b.card * 8))), along = L * .014 * b.card * 10;
        const rows = stations.map((st, i) => Array.from({ length: SIDES + 1 }, (_, k) => {
            const a = -Math.PI / 2 + k / SIDES * Math.PI * 2, p = point(st, a);
            return m.vertex(p, norm(sub(p, st.c)), B.under ? B.under(st.s, Math.sin(a)) : color, skinOf(st.skin), [k / SIDES * around, (arcs.at(-1) - arcs[i]) / along]);
        }));
        for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < SIDES; k++) {
            const a = rows[i][k], b2 = rows[i][k + 1], c = rows[i + 1][k], d2 = rows[i + 1][k + 1];
            m.tri(a, b2, c); m.tri(b2, d2, c);
        }
        for (const [rowIds, st, flip] of [[rows[0], stations[0], true], [rows.at(-1), stations.at(-1), false]]) {
            const c = m.vertex(st.c, flip ? mul(st.T, -1) : st.T, color, skinOf(st.skin), [0, 0]);
            for (let k = 0; k < SIDES; k++) flip ? m.tri(c, rowIds[k + 1], rowIds[k]) : m.tri(c, rowIds[k], rowIds[k + 1]);
        }
        // Winding: the closed surface must face outward (positive volume).
        let vol = 0; const Pp = m.p;
        for (let t = 0; t < m.i.length; t += 3) { const a = m.i[t] * 3, b2 = m.i[t + 1] * 3, c = m.i[t + 2] * 3; vol += dot([Pp[a], Pp[a + 1], Pp[a + 2]], cross([Pp[b2], Pp[b2 + 1], Pp[b2 + 2]], [Pp[c], Pp[c + 1], Pp[c + 2]])); }
        if (vol < 0) for (let t = 0; t < m.i.length; t += 3) { const v = m.i[t + 1]; m.i[t + 1] = m.i[t + 2]; m.i[t + 2] = v; }
        m.smoothNormals();
        // The seam column shares its positions: give both copies the same normal.
        for (const row of rows) { const a = row[0] * 3, z = row[SIDES] * 3, n = norm([m.n[a] + m.n[z], m.n[a + 1] + m.n[z + 1], m.n[a + 2] + m.n[z + 2]]); for (const o of [a, z]) { m.n[o] = n[0]; m.n[o + 1] = n[1]; m.n[o + 2] = n[2]; } }
        C.finish(m, 'Body', plumageMaterial(C));
        /** A point on the surface at s (0 tail root .. 1 skull) and angle a, with its normal and axis. */
        const sample = (s, a) => {
            let i = 0; while (i < stations.length - 2 && stations[i + 1].s < s) i++;
            const A = stations[i], Bb = stations[i + 1], f = clamp((s - A.s) / (Bb.s - A.s), 0, 1);
            const st = { c: lerp(A.c, Bb.c, f), T: norm(lerp(A.T, Bb.T, f)), w: A.w + (Bb.w - A.w) * f, rd: A.rd + (Bb.rd - A.rd) * f, rv: A.rv + (Bb.rv - A.rv) * f, skin: A.skin + (Bb.skin - A.skin) * f };
            const p = point(st, a), da = sub(point(st, a + .01), point(st, a - .01));
            let n = norm(cross(st.T, da)); if (dot(n, sub(p, st.c)) < 0) n = mul(n, -1);
            return { p, n, T: st.T, skin: skinOf(st.skin), w: st.w, rd: st.rd, rv: st.rv, c: st.c };
        };
        let neckArc = 0; for (let i = NT + 1; i < stations.length; i++) neckArc += Math.hypot(...sub(stations[i].c, stations[i - 1].c));
        return { sample, stations, neckArc: Math.max(neckArc, L * .02) };
    }

    /** Contour feathers over trunk and neck, in staggered rows that run tailward and down the flanks. */
    function bodyFeathers(C, B, body) {
        const { r, L } = C, b = B.prof, m = new FMesh(), sz = L * .062 * b.card * Math.sqrt(r.girth * .5 + .5);
        let seed = 0;
        for (let s = .012; s < .985;) {
            const neck = s > .72, nf = neck ? (s - .72) / .28 : 0;
            const size = sz * (neck ? .62 - .30 * nf : s < .1 ? .75 : 1) * (b.soft ? 1.1 : 1);
            const sample0 = body.sample(s, 0), circ = Math.PI * (sample0.w + (sample0.rd + sample0.rv) * .5) * 2 * 1.05;
            const count = Math.max(10, Math.round(circ / (size * .56)));
            const offset = (Math.round(s * 1000) % 2) * .5;
            for (let k = 0; k < count; k++) {
                const a = (k + offset) / count * Math.PI * 2 + (hash(seed, 1) - .5) * .08, q = body.sample(s, a), dorsal = Math.sin(a), side = Math.cos(a);
                // The neck runs on inside the skull; its feathers stop at the skull's surface.
                if (B.inHead(q.p) < 1.25) { seed++; continue; }
                // Tracts: breast and belly below, back and scapulars above, flanks between, rump at the tail.
                const zone = neck ? (dorsal > .2 ? 'nape' : dorsal < -.3 ? 'throat' : 'neck') : s < .16 ? (dorsal > 0 ? 'rump' : 'undertail') : dorsal > .35 ? (s > .48 ? 'scapular' : 'back') : dorsal < -.35 ? (s > .45 ? 'breast' : 'belly') : 'flank';
                const flow = norm(add(mul(q.T, -1), mul(sub(q.n, mul(q.T, dot(q.n, q.T))), 0)));
                const down = norm(sub([0, -1, 0], mul(q.n, dot([0, -1, 0], q.n))));
                const dir = norm(add(flow, mul(down, (neck ? .15 : .5) * Math.abs(side) * (1 - Math.max(0, dorsal)))));
                const len = size * (zone === 'flank' ? 1.3 : zone === 'breast' ? 1.1 : 1) * (.9 + .2 * hash(seed, 2));
                // Cards follow the surface's own bend along their length, so the coat hugs the body.
                const circ2 = norm(cross(q.n, q.T)), rc = dorsal > 0 ? (q.w + q.rd) * .5 : (q.w + q.rv) * .5, curv = dot(dir, circ2) ** 2 / Math.max(L * .01, rc) + dot(dir, q.T) ** 2 / (B.bodyLen * 1.2);
                const variant = Math.floor(hash(seed, 4) * 5);
                card(m, { root: add(q.p, mul(q.n, -size * .06)), dir, up: q.n, len, wid: len * (neck ? .7 : .85), cell: CELLS[neck ? 'fine' : 'contour'][variant], curv, bend: -.01, lift: .07, cup: .18, rows: 3,
                    color: plumage(C, zone, neck ? nf : s, seed), skin: q.skin, surface: q.n });
                seed++;
            }
            s += size * .34 / (s > .72 ? body.neckArc / .28 : B.bodyLen);
        }
        C.finish(m, 'Contour feathers', featherMaterial(C));
    }
    function featherMaterial(C, extra = {}) {
        const pics = featherPictures(C.save ? 1024 : 512);
        return { kind: 'feather', texture: FEATHER_TEX, normalTexture: FEATHER_NORMAL, normalScale: .85, cutout: true, alphaCutoff: .42, keepColors: true, doubleSided: true, roughness: C.prof.gloss ? .55 : .82, noSurfaceDetail: true, pictures: pics, ...extra };
    }

    /** The skull: an ellipsoid sculpted per kind (raptor brow shelf, owl disk, flat duck crown). */
    function birdHead(C, B) {
        const { r, L, headBone: head } = C, b = B.prof, H = B.head, m = new FMesh(), skin = rigid(head);
        const [hl, hw, hh] = B.headDims, Fh = H.F, Uh = H.U, X = [1, 0, 0];
        const shape = (x, y, z) => {
            // x across, y up, z forward on the unit sphere.
            let sx = 1, sy = 1, sz = 1, push = 0;
            const front = Math.max(0, z);
            if (b.skull === 'raptor') {
                // Wedge-shaped toward the bill, the crown flat.
                // Long and low: a flat crown, a rounded occiput (no can-shaped back), narrowing into the cere.
                sx *= 1 - .44 * front * front; sy *= 1 - .22 * front * front;
                // A flat crown level with the brow shelf, and a modest occiput that runs down into the nape (no dome).
                if (y > .28) sy *= 1 - .34 * smooth(.28, 1, y) * (1 - .35 * smooth(.6, .95, Math.abs(x)));
                sz *= 1 - .08 * smooth(0, -.9, z) * smooth(-.2, .6, y);
                // The supraorbital shelf: a ridge over each eye that gives the eagle its stare.
                // The supraorbital shelf: a hard ledge right over each eye, running forward toward the cere.
                // It rises gently above and drops off sharply toward the eye beneath it.
                {
                    // A heavy shelf: it juts out over the eye (its lower edge just above the eye's top) and runs forward to the cere.
                    const ex = .72, ez = .66, h = Math.atan2(z, Math.abs(x)) - Math.atan2(ez, ex), dy = y - .31;
                    const along = Math.exp(-(((h - .10) / .50) ** 2)), profile = dy > 0 ? Math.exp(-((dy / .22) ** 2)) : Math.exp(-((dy / .045) ** 2));
                    push += .48 * profile * along * smooth(.2, .5, Math.abs(x)) * smooth(-.25, .25, z);
                    // The orbit beneath: the eye sits back under the ledge.
                    push -= .10 * Math.exp(-(((y - .12) / .17) ** 2)) * Math.exp(-((h / .40) ** 2)) * smooth(.3, .7, Math.abs(x));
                }
                // The forehead slopes down into the cere between the brows.
                push -= .10 * Math.exp(-(((y - .45) / .25) ** 2) - (((z - .85) / .25) ** 2)) * (1 - smooth(.2, .5, Math.abs(x)));
                // Cheeks fuller below and behind the eye; the occiput rounded into the nape.
                push += .05 * Math.exp(-(((y + .35) / .3) ** 2) - (((z + .1) / .4) ** 2));
            } else if (b.skull === 'owl') {
                // A broad, round skull with a flattened face.
                sx *= 1.05; if (y > .3) sy *= 1 - .18 * smooth(.3, 1, y); sz *= .85 * (1 - .30 * smooth(.2, 1, z));
                push -= .10 * Math.exp(-((x * x) / .6) - (((z - .9) / .5) ** 2)) * (1 - .5 * smooth(-.6, .2, y));
            } else if (b.skull === 'duck') {
                sy *= 1 - .18 * smooth(.3, 1, y); sz *= 1.05; sx *= 1 - .2 * front;
            } else if (b.skull === 'parrot') {
                sz *= .92; push += .04 * Math.exp(-(((y - .5) / .3) ** 2));
            } else if (b.skull === 'penguin') {
                sx *= 1 - .2 * front; sy *= 1 - .15 * front;
            } else {
                sx *= 1 - .22 * front * front; sy *= 1 - .15 * front * front;
                push += .03 * Math.exp(-(((y - .35) / .2) ** 2) - (((z - .3) / .3) ** 2)) * smooth(.3, .7, Math.abs(x));
            }
            const l = add(add(mul(X, x * sx * hw * .5), mul(Uh, y * sy * hh * .5)), mul(Fh, z * sz * hl * .5));
            return add(add(H.c, l), mul(norm(l), push * hh * .5));
        };
        // Poles at the bill's root and the back of the skull (both hidden); plumage rows run front to back.
        const rows = C.save ? 32 : 26, cols = C.save ? 40 : 32, ids = [], tilesAround = Math.max(2, Math.round(Math.PI * (hw + hh) * .5 / (L * .0048 * 8))), tilesAlong = Math.max(1.5, Math.PI * hl * .5 / (L * .0062 * 10));
        const headColor = B.headColor;
        for (let i = 0; i <= rows; i++) {
            const th = i / rows * Math.PI, row = [];
            for (let k = 0; k <= cols; k++) {
                const ph = -Math.PI / 2 + k / cols * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.sin(th) * Math.sin(ph), z = Math.cos(th);
                const p = shape(x, y, z);
                row.push(m.vertex(p, [0, 1, 0], headColor(x, y, z), skin, [k / cols * tilesAround, i / rows * tilesAlong]));
            }
            ids.push(row);
        }
        for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) { const a = ids[i][k], b2 = ids[i][k + 1], c = ids[i + 1][k], d2 = ids[i + 1][k + 1]; m.tri(a, c, b2); m.tri(b2, c, d2); }
        let vol = 0; const Pp = m.p;
        for (let t = 0; t < m.i.length; t += 3) { const a = m.i[t] * 3, b2 = m.i[t + 1] * 3, c = m.i[t + 2] * 3; vol += dot([Pp[a], Pp[a + 1], Pp[a + 2]], cross([Pp[b2], Pp[b2 + 1], Pp[b2 + 2]], [Pp[c], Pp[c + 1], Pp[c + 2]])); }
        if (vol < 0) for (let t = 0; t < m.i.length; t += 3) { const v = m.i[t + 1]; m.i[t + 1] = m.i[t + 2]; m.i[t + 2] = v; }
        m.smoothNormals();
        for (const row of ids) { const a = row[0] * 3, z = row[cols] * 3, n = norm([m.n[a] + m.n[z], m.n[a + 1] + m.n[z + 1], m.n[a + 2] + m.n[z + 2]]); for (const o of [a, z]) { m.n[o] = n[0]; m.n[o + 1] = n[1]; m.n[o + 2] = n[2]; } }
        // The poles: each a ring of coincident vertices; one shared normal along the axis.
        for (const [row, d] of [[ids[0], Fh], [ids[rows], mul(Fh, -1)]]) for (const v of row) { m.n[v * 3] = d[0]; m.n[v * 3 + 1] = d[1]; m.n[v * 3 + 2] = d[2]; }
        C.finish(m, 'Head', plumageMaterial(C, { normalScale: .4 }, true));
        return shape;
    }

    /** The sculpted skull's surface normal at a unit direction, from two tangents across it. */
    function shapeNormal(shape, x, y, z, center) {
        const at = v => { const q = norm(v); return shape(q[0], q[1], q[2]); }, u = norm([x, y, z]), e1 = norm(cross(u, Math.abs(u[2]) < .9 ? [0, 0, 1] : [1, 0, 0])), e2 = norm(cross(u, e1));
        let n = norm(cross(sub(at(add(u, mul(e1, .03))), at(sub(u, mul(e1, .03)))), sub(at(add(u, mul(e2, .03))), at(sub(u, mul(e2, .03))))));
        if (dot(n, sub(shape(u[0], u[1], u[2]), center)) < 0) n = mul(n, -1);
        return n;
    }
    /** Fine head feathers: crown, nape hackles, cheeks; clear of the eyes and bill. */
    function headFeathers(C, B, shape) {
        const { L, headBone: head } = C, b = B.prof, m = new FMesh(), skin = rigid(head), H = B.head;
        const size = B.headDims[2] * .26 * (b.soft ? 1.25 : 1);
        let seed = 900;
        for (let i = 0; i < 14; i++) {
            const phi = -1.25 + i / 13 * 2.42, n = Math.max(6, Math.round(26 * Math.cos(phi)));
            for (let k = 0; k < n; k++) {
                const th = (k + (i % 2) * .5) / n * Math.PI * 2, x = Math.cos(phi) * Math.cos(th), z = Math.cos(phi) * Math.sin(th), y = Math.sin(phi);
                // Cards only where a silhouette shows them: the nape, the back of the crown, cheeks and throat.
                if (z > -.05 && y > .15) continue;
                if (z > .45) continue;
                if (z < -.8) continue; // the occiput, under the neck
                // A raptor's skull reads smooth: only a neat row of nape hackles, no ragged crown or cheek cards.
                if (b.skull === 'raptor' && (z > -.3 || y > .35 || y < -.45)) continue;
                const p = shape(x, y, z), nrm = shapeNormal(shape, x, y, z, H.c);
                let eyeNear = false; for (const e of B.eyes || []) if (Math.hypot(...sub(p, e.c)) < e.r * 2.3) eyeNear = true;
                if (eyeNear) continue;
                // Head feathers flow away from the bill's root, back over the crown and down the cheeks.
                const away = add(norm(sub(p, B.billRoot)), mul(H.F, -.35)), back = norm(sub(away, mul(nrm, dot(away, nrm))));
                const len = size * (y > .4 ? .9 : 1) * (z < -.3 ? 1.3 : 1) * (.9 + .2 * hash(seed));
                const zone = y < -.35 ? 'throat' : z > .2 && Math.abs(x) > .5 ? 'face' : y > .2 ? 'head' : z < -.2 ? 'nape' : 'face';
                // A raptor's nape: longer, pointed hackles that lift a little off the skull.
                const hackle = b.skull === 'raptor' && z < -.25;
                card(m, { root: add(p, mul(nrm, -len * .05)), dir: back, up: nrm, len: hackle ? len * 1.25 : len, wid: len * (hackle ? .5 : .62), cell: CELLS[hackle ? 'hackle' : 'fine'][Math.floor(hash(seed, 4) * 5)], lift: hackle ? .07 : .04, curv: 1 / (B.headDims[2] * .5), bend: -.01, cup: .15, rows: 2,
                    color: plumage(C, zone, 1, seed), skin, surface: nrm });
                seed++;
            }
        }
        C.finish(m, 'Head feathers', featherMaterial(C, { alphaCutoff: .45 }));
    }

    /**
     * Bills by kind, in head heights: length, the culmen's height at the base
     * (`top`) and the cutting edge's (`bot`), the tip's height, the culmen's
     * arch, half-width at the base, the lower mandible's reach, and a hook.
     */
    const BILLS = {
        // A bald eagle's bill: massive, nearly half the head's length, about half the head deep at the base, narrow, a smooth culmen into an overhanging hook.
        raptor: { len: .82, top: .30, bot: -.21, tip: -.55, arch: .22, width: .155, lower: .64, hook: 1, wedge: true },
        owl: { len: .42, top: .16, bot: -.20, tip: -.42, arch: .12, width: .15, lower: .7, hook: 1 },
        crow: { len: 1.0, top: .21, bot: -.17, tip: -.10, arch: .14, width: .17, lower: .97, hook: .15 },
        cone: { len: .46, top: .21, bot: -.20, tip: -.02, arch: .05, width: .27, lower: .98, hook: 0 },
        pigeon: { len: .62, top: .10, bot: -.11, tip: -.08, arch: .05, width: .085, lower: .95, hook: .1, cere: true },
        duck: { len: 1.30, top: .24, bot: -.20, tip: -.10, arch: .02, width: .27, lower: .97, hook: 0, flat: true },
        chicken: { len: .58, top: .22, bot: -.20, tip: -.24, arch: .10, width: .17, lower: .9, hook: .3 },
        needle: { len: 2.4, top: .06, bot: -.06, tip: -.06, arch: .02, width: .05, lower: 1, hook: 0 },
        penguin: { len: .95, top: .20, bot: -.18, tip: -.16, arch: .10, width: .12, lower: .97, hook: .3 }
    };
    /**
     * The bill: the upper mandible sculpted between its culmen and cutting
     * edge (an eagle's deep, laterally compressed bill arching into an
     * overhanging hook), the lower mandible seated under it, the cere with its
     * nostril, and the gape running back beneath the eye.
     */
    function birdBill(C, B) {
        const { r, headBone: head } = C, b = B.prof, H = B.head, skin = rigid(head), X = [1, 0, 0];
        if (b.bill === 'parrot' || b.bill === 'flamingo') { specializedBill(C, B.billRoot, head); return; }
        const S = BILLS[b.bill] || BILLS.crow, hh = B.headDims[2], len = hh * S.len * Math.max(.06, r.snoutLength), wd = hh * S.width * r.snoutWidth;
        const Fh = H.F, Uh = H.U, base = B.billRoot, yellow = lin(b.billColor), tipCol = b.bill === 'raptor' ? mix(yellow, lin('#efe2b4'), .45) : b.bill === 'duck' ? yellow : mix(yellow, scale3(yellow, .7), .4);
        const at = (z, y) => add(base, add(mul(Fh, z), mul(Uh, y)));
        const bez = (p0, p1, p2, p3, t) => { const a = 1 - t; return p0 * a * a * a + 3 * p1 * a * a * t + 3 * p2 * a * t * t + p3 * t * t * t; };
        const tipZ = len * (1 - .12 * S.hook), tipY = hh * S.tip;
        // Culmen and cutting edge as (z, y) curves from the base (inside the head) to the shared tip.
        // A hook carries the culmen forward past the tip, then curls it down and back.
        const top = t => [bez(-hh * .10, len * .35, len * (.80 + .22 * S.hook), tipZ, t), bez(hh * S.top, hh * S.top + hh * S.arch * .45, hh * (S.top * .4 + S.arch * .5) * (1 - .3 * S.hook) + tipY * .25 * (1 - S.hook), tipY, t)];
        const bot = t => [bez(-hh * .10, len * .30, len * (.62 + .2 * (1 - S.hook) + .12 * S.hook), tipZ, t), bez(hh * S.bot, hh * S.bot, hh * S.bot + (tipY - hh * S.bot) * (S.hook ? .05 : .55), tipY, t)];
        const widthAt = t => wd * (S.flat ? 1 - .15 * t + .1 * smooth(.6, 1, t) - .9 * smooth(.92, 1, t) : Math.pow(1 - t, b.bill === 'needle' ? .5 : .7) * (1 - .25 * t)) + len * .004;
        const m = new FMesh(), rows = 30, sides = 22, ring = [], centers = [];
        for (let i = 0; i <= rows; i++) {
            const t = i / rows, T = top(t), Bo = bot(t), w = widthAt(t), row = [];
            const mid = [(T[0] + Bo[0]) / 2, (T[1] + Bo[1]) / 2], half = Math.max(len * .002, (T[1] - Bo[1]) / 2);
            for (let k = 0; k < sides; k++) {
                const a = -Math.PI / 2 + k / sides * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
                // A rounded ridge on top, steep flat sides, a straight cutting edge underneath.
                // A raptor's bill is a wedge from the front: a narrow ridge widening to the cutting edges.
                const y = sn, x = cs * (S.wedge ? (sn > 0 ? 1 - .66 * sn : 1 - .25 * sn * sn) : sn > 0 ? Math.sqrt(1 - .55 * sn * sn) : 1 - .15 * sn * sn);
                const zz = T[0] + (Bo[0] - T[0]) * (1 - (y + 1) / 2);
                const p = add(at(zz, mid[1] + y * half * (S.flat && sn > 0 ? .7 : 1)), mul(X, x * w));
                const col = mix(yellow, tipCol, smooth(.55, .95, t));
                row.push(m.vertex(p, [0, 1, 0], col, skin, [0, 0]));
            }
            ring.push(row); centers.push(at(mid[0], mid[1]));
        }
        ringsOut(m, ring, centers);
        { const c0 = m.vertex(centers[0], mul(Fh, -1), yellow, skin, [0, 0]); for (let k = 0; k < sides; k++) triOut(m, c0, ring[0][k], ring[0][(k + 1) % sides], mul(Fh, -1)); }
        // The lower mandible: a shallower trough seated under the cutting edge, ending under the hook.
        const lowEnd = S.lower, lrow = [], lcen = [];
        for (let i = 0; i <= 18; i++) {
            const t = i / 18 * lowEnd, Bo = bot(t), z = Bo[0], yTop = Bo[1] + hh * (b.bill === 'raptor' ? .06 : .01), depth = hh * (S.flat ? .10 : b.bill === 'raptor' ? .17 : .15) * (1 - .55 * t / lowEnd) * (b.bill === 'needle' ? .5 : 1) + len * .004;
            // A raptor's lower mandible sits inside the upper's cutting edges (no lip showing past them).
            const w = widthAt(t) * (b.bill === 'raptor' ? .78 : .92), row = [];
            for (let k = 0; k < 16; k++) { const a = -Math.PI / 2 + k / 16 * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a); row.push(m.vertex(add(at(z - (i === 18 ? 0 : 0), yTop - depth * (1 - sn) * .5 - depth * .1), mul(X, cs * w * (sn > 0 ? 1 : .85))), [0, 1, 0], mix(yellow, tipCol, smooth(.5, 1, t) * .6), skin, [0, 0])); }
            lrow.push(row); lcen.push(at(z, yTop - depth * .5));
        }
        ringsOut(m, lrow, lcen);
        { const c0 = m.vertex(lcen[0], mul(Fh, -1), yellow, skin, [0, 0]), c1 = m.vertex(add(lcen[18], mul(Fh, len * .01)), Fh, tipCol, skin, [0, 0]); for (let k = 0; k < 16; k++) { triOut(m, c0, lrow[0][k], lrow[0][(k + 1) % 16], mul(Fh, -1)); triOut(m, c1, lrow[18][k], lrow[18][(k + 1) % 16], Fh); } }
        const dark = scale3(yellow, .3);
        for (const s of [-1, 1]) {
            // The gape: the mouth's corner as a fleshy line running back under the eye.
            const reach = b.bill === 'raptor' ? .30 : b.bill === 'duck' ? .15 : .25;
            const gape = Array.from({ length: 14 }, (_, i) => { const t = i / 13, z = -hh * reach + (len * .55 + hh * reach) * t, Bo = bot(clamp(z / len, 0, 1)); return add(at(z, (z < 0 ? hh * S.bot + hh * .02 : Bo[1]) - hh * .01), mul(X, s * (widthAt(clamp(z / len, 0, 1)) + hh * (z < 0 ? (b.bill === 'raptor' ? .035 : .10) * (-z / (hh * reach)) + .01 : .006)))); });
            tubeInto(m, gape, gape.map((_, i) => hh * (b.bill === 'raptor' ? .014 : .012) * (1 - i / 16)), 6, b.bill === 'raptor' ? mix(yellow, lin('#c98a1c'), .5) : dark, skin);
            // The nostril, set in the cere where there is one.
            const nt = b.bill === 'duck' ? .22 : b.bill === 'raptor' ? .19 : .2, T = top(nt), Bo = bot(nt);
            ellipsoidInto(m, add(at(T[0], T[1] - (T[1] - Bo[1]) * (b.bill === 'raptor' ? .30 : .25)), mul(X, s * (b.bill === 'raptor' ? widthAt(nt) * 1.07 + hh * .013 : widthAt(nt) * .93))), [hh * .012, hh * (b.bill === 'raptor' ? .028 : .02), hh * (b.bill === 'raptor' ? .05 : .04)], Fh, Uh, [.02, .015, .01], skin, 6, 10);
        }
        // A cere: soft waxy skin over the bill's root (raptors, owls, pigeons).
        if (b.bill === 'raptor' || b.bill === 'owl' || S.cere) {
            const cere = S.cere ? lin('#ece6dc') : b.bill === 'raptor' ? lin('#f3d64e') : mix(yellow, lin('#f5cf55'), .5), crow = [], ccen = [];
            for (let i = 0; i <= 6; i++) {
                const t = i / 6 * (b.bill === 'raptor' ? .26 : .22), T = top(t), Bo = bot(t), swell = b.bill === 'raptor' ? 1 + .6 * Math.sin(Math.PI * Math.min(1, i / 5.2)) : 1, w = widthAt(t) * 1.07 + hh * .006 * swell, half = (T[1] - Bo[1]) / 2 + hh * .006, mid = (T[1] + Bo[1]) / 2 - hh * .004 * (swell - 1), row = [];
                for (let k = 0; k <= 12; k++) { const a = -.25 + k / 12 * (Math.PI + .5), sn = Math.sin(a), cs = Math.cos(a); row.push(m.vertex(add(at(T[0] + (Bo[0] - T[0]) * (1 - (sn + 1) / 2), mid + sn * half * (S.cere ? 1.25 : 1)), mul(X, cs * w * Math.sqrt(1 - .5 * sn * sn))), [0, 1, 0], cere, skin, [0, 0])); }
                crow.push(row); ccen.push(at(T[0], mid));
            }
            ringsOut(m, crow, ccen, false);
        }
        // A duck's nail: a flat dark plate set into the top of the bill's tip (not a ball on top of it).
        if (S.flat) { const T = top(.93); ellipsoidInto(m, at(T[0] - len * .015, T[1] - hh * .012), [wd * .42, hh * .016, len * .07], Fh, Uh, mix(yellow, lin('#3a3226'), .75), skin); }
        m.smoothNormals();
        C.finish(m, 'Beak', { kind: 'skin', roughness: b.bill === 'duck' ? .55 : .36, noSurfaceDetail: true });
    }
    /** A closed tube into an FMesh; `squash` scales its section [across, up]. */
    function tubeInto(m, path, radii, sides, color, skin, squash = [1, 1]) {
        const n = path.length, rows = [];
        let prev = null;
        for (let i = 0; i < n; i++) {
            const d = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
            let x = prev ? norm(sub(prev, mul(d, dot(prev, d)))) : norm(cross(d, Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
            if (!prev && Math.abs(d[0]) < .9) x = norm(sub([1, 0, 0], mul(d, d[0])));
            prev = x; const y = cross(d, x), rr = Array.isArray(radii) ? radii[i] : radii, row = [];
            for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2, off = add(mul(x, Math.cos(a) * rr * squash[0]), mul(y, Math.sin(a) * rr * squash[1])); row.push(m.vertex(add(path[i], off), norm(off), typeof color === 'function' ? color(i / (n - 1)) : color, skin, [0, 0])); }
            rows.push(row);
        }
        ringsOut(m, rows, path);
        const c0 = m.vertex(path[0], norm(sub(path[0], path[1])), typeof color === 'function' ? color(0) : color, skin, [0, 0]), c1 = m.vertex(path[n - 1], norm(sub(path[n - 1], path[n - 2])), typeof color === 'function' ? color(1) : color, skin, [0, 0]);
        for (let k = 0; k < sides; k++) { triOut(m, c0, rows[0][k], rows[0][(k + 1) % sides], sub(path[0], path[1])); triOut(m, c1, rows[n - 1][(k + 1) % sides], rows[n - 1][k], sub(path[n - 1], path[n - 2])); }
    }
    function ellipsoidInto(m, center, radii, F, U, color, skin, rows = 8, sides = 12, uvScale = null) {
        const X = norm(cross(U, F)), ids = [];
        for (let i = 0; i <= rows; i++) {
            const phi = -Math.PI / 2 + i / rows * Math.PI, row = [];
            for (let k = 0; k < sides; k++) {
                const th = k / sides * Math.PI * 2, l = [Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)];
                const off = add(add(mul(X, l[0] * radii[0]), mul(U, l[1] * radii[1])), mul(F, l[2] * radii[2]));
                row.push(m.vertex(add(center, off), norm(add(add(mul(X, l[0] / radii[0]), mul(U, l[1] / radii[1])), mul(F, l[2] / radii[2]))), color, skin, uvScale ? [k / sides * uvScale[0], i / rows * uvScale[1]] : [0, 0]));
            }
            ids.push(row);
        }
        ringsOut(m, ids, ids.map(() => center));
    }

    /** Eyes seated under the brow: eyeball, iris, pupil, a clear cornea and the bare eyelid ring. */
    function birdEyes(C, B) {
        const { r, headBone: head } = C, b = B.prof, skin = rigid(head);
        for (const e of B.eyes) {
            const m = new P.ExactMesh(), F = e.d, rad = e.r;
            // The first 144 vertices are the whole eyeball, centered on the eye.
            m.sphere(e.c, rad, lin('#141110'), skin, 11, 12);
            const irisC = add(e.c, mul(F, rad * .995)), iris = C.colors.eye;
            const U0 = norm(cross(F, Math.abs(F[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), V0 = cross(F, U0);
            // The iris: a fine radial weave of the eye's own color, a hair darker at its rim, round a crisp black pupil.
            const pr = rad * (b.skull === 'owl' ? .34 : .26), ir = rad * .64, SEG = 48, ringsR = [pr, pr * 1.06, (pr + ir) * .5, ir * .93, ir], ids = [];
            for (const [ri, rr] of ringsR.entries()) ids.push(Array.from({ length: SEG }, (_, k) => {
                const a = k / SEG * Math.PI * 2, d = add(mul(U0, Math.cos(a)), mul(V0, Math.sin(a))), streak = (hash(k, 7) - .5) * .16 + (hash(k * 3 + 1, 11) - .5) * .08;
                // The brow shades the iris's upper part.
                const shade = b.skull === 'raptor' ? 1 - .28 * smooth(.2, .9, dot(d, B.head.U)) : 1;
                const tone = (ri === 0 ? .80 : ri === ringsR.length - 1 ? .62 : ri === 2 ? 1 + streak * .5 : 1 + streak) * shade;
                return m.vertex(add(irisC, add(mul(d, rr), mul(F, -rad * .015 * (1 - ri / 4)))), F, scale3(iris, tone), skin);
            }));
            for (let i = 0; i < ids.length - 1; i++) for (let k = 0; k < SEG; k++) { const a = ids[i][k], b2 = ids[i][(k + 1) % SEG], c = ids[i + 1][k], d2 = ids[i + 1][(k + 1) % SEG]; triOut(m, a, c, b2, F); triOut(m, b2, c, d2, F); }
            m.disk(add(irisC, mul(F, -rad * .012)), F, pr * 1.01, [.006, .006, .006], skin, 32);
            C.finish(m, 'Eye ' + e.side, { kind: 'eye', roughness: .2, noSurfaceDetail: true });
            const cornea = new P.ExactMesh();
            cornea.sphere(add(e.c, mul(F, rad * .52)), rad * .58, [1, 1, 1], skin, 10, 28, [1, 1, 1]);
            // Only the front cap is kept: a clear dome over the iris.
            const keep = [], P2 = cornea.p;
            for (let t = 0; t < cornea.i.length; t += 3) { const ids = cornea.i.slice(t, t + 3); if (ids.every(v => dot(sub([P2[v * 3], P2[v * 3 + 1], P2[v * 3 + 2]], e.c), F) > rad * .90)) keep.push(...ids); }
            cornea.i = keep;
            C.finish(cornea, 'Cornea ' + e.side, { kind: 'glass', roughness: .02, opacity: .14, noSurfaceDetail: true });
            // The bare eyelid ring: skin colored by kind (a raptor's yellow-grey, an owl's black).
            const lid = new P.ExactMesh(), ringCol = b.skull === 'raptor' ? mix(lin(b.billColor), lin('#3a3428'), .55) : b.skull === 'owl' ? lin('#2a2420') : scale3(C.colors.main, .5);
            lid.tube(Array.from({ length: 41 }, (_, k) => { const a = k / 40 * Math.PI * 2; return add(add(e.c, mul(F, rad * .80)), add(mul(U0, Math.cos(a) * rad * .64), mul(V0, Math.sin(a) * rad * .64))); }), rad * (b.skull === 'raptor' ? .09 : .07), 6, ringCol, skin);
            C.finish(lid, 'Eyelid ' + e.side, { kind: 'skin', roughness: .6, noSurfaceDetail: true });
        }
    }

    /**
     * A wing: humerus, forearm and hand bones, three secondary and four
     * primary feather groups (their own bones, so the folded wing stacks its
     * remiges back along the flank), a covered leading edge, and every tract.
     */
    function birdWing(C, B, s) {
        const { r, L, rootBone: root } = C, b = B.prof, [hum, uln, hand, nP, nS, pLen, sLen] = b.wing, wsz = r.wingSize;
        const F = B.F, U = B.U, X = [1, 0, 0], sp = .25 + .75 * r.wingSpread, dih = (b.dihedral || 0) * DEG;
        const Sd = norm(add(mul(X, s * Math.cos(dih)), mul(U, Math.sin(dih)))), Bk = mul(F, -1), N = norm(sub(mul(U, Math.cos(dih)), mul(X, s * Math.sin(dih))));
        const dirAt = th => norm(add(mul(Sd, Math.cos(th)), mul(Bk, Math.sin(th))));
        const shoulder = B.shoulder(s), th = [.95 + (.30 - .95) * sp, -1.15 + (1.15 - .18) * sp, 1.3 + (.05 - 1.3) * sp];
        const elbow = add(shoulder, mul(dirAt(th[0]), L * hum * wsz)), wrist = add(elbow, mul(dirAt(th[1]), L * uln * wsz)), tip = add(wrist, mul(dirAt(th[2]), L * hand * wsz));
        const aB = C.bone('Wing' + s, root, shoulder, elbow, 'wing', s), bB = C.bone('Wingtip' + s, aB, elbow, wrist, 'wingTip', s), hB = C.bone('Wing hand ' + s, bB, wrist, tip, 'wingHand', s);
        if (b.penguin && wsz < .02) { B.wings.push({ s, aB, bB, hB, sec: [], prim: [], shoulder, elbow, wrist, tip, N, Sd }); return; }
        if (b.penguin) {
            const fm = new FMesh();
            const flip = Array.from({ length: 16 }, (_, i) => { const t = i / 15; return add(add(shoulder, mul(norm(add(mul(X, s * .55), mul(F, -.15), [0, -1, 0])), L * (hum + uln + hand) * 1.6 * wsz * t)), [0, 0, 0]); });
            const W = t => L * (.035 + .05 * Math.sin(Math.PI * Math.min(1, t * 1.1 + .05))) * wsz;
            const rows = flip.map((c, i) => { const t = i / 15, d = norm(sub(flip[Math.min(15, i + 1)], flip[Math.max(0, i - 1)])), out = norm(cross(d, F)), fw = norm(cross(out, d)); return Array.from({ length: 12 }, (_, k) => { const a = k / 12 * Math.PI * 2, off = add(mul(fw, Math.cos(a) * W(t)), mul(out, Math.sin(a) * L * .008 * (1 - t * .6))); const w = Math.min(1, t * 3); return fm.vertex(add(c, off), norm(off), Math.sin(a) * s < 0 ? C.colors.main : mix(C.colors.light, C.colors.main, .2 + .6 * smooth(.6, .95, Math.cos(a))), t < .33 ? { joints: [aB, bB, 0, 0], weights: [1 - w, w, 0, 0] } : t < .66 ? rigid(bB) : rigid(hB), [0, 0]); }); });
            for (let i = 0; i < 15; i++) for (let k = 0; k < 12; k++) { const a = rows[i][k], b2 = rows[i][(k + 1) % 12], c = rows[i + 1][k], d2 = rows[i + 1][(k + 1) % 12]; fm.tri(a, c, b2); fm.tri(b2, c, d2); }
            const end = fm.vertex(flip[15], [0, -1, 0], C.colors.main, rigid(hB), [0, 0]); for (let k = 0; k < 12; k++) fm.tri(rows[15][k], end, rows[15][(k + 1) % 12]);
            let vol = 0; const Pp = fm.p; for (let t = 0; t < fm.i.length; t += 3) { const a = fm.i[t] * 3, b2 = fm.i[t + 1] * 3, c = fm.i[t + 2] * 3; vol += dot(sub([Pp[a], Pp[a + 1], Pp[a + 2]], shoulder), cross(sub([Pp[b2], Pp[b2 + 1], Pp[b2 + 2]], shoulder), sub([Pp[c], Pp[c + 1], Pp[c + 2]], shoulder))); }
            if (vol < 0) for (let t = 0; t < fm.i.length; t += 3) { const v = fm.i[t + 1]; fm.i[t + 1] = fm.i[t + 2]; fm.i[t + 2] = v; }
            fm.smoothNormals();
            C.finish(fm, 'Flipper ' + s, { kind: 'feather', roughness: .6, noSurfaceDetail: true });
            B.wings.push({ s, aB, bB, hB, sec: [], prim: [], shoulder, elbow, wrist, tip, N, Sd });
            return;
        }
        // Feather groups: three along the forearm, four along the hand.
        const secRoot = j => add(lerp(wrist, elbow, .04 + .94 * j / Math.max(1, nS - 1)), mul(Bk, L * .004));
        const primRoot = j => add(lerp(wrist, tip, .05 + .92 * j / Math.max(1, nP - 1)), mul(Bk, L * .003));
        const sec = [0, 1, 2].map(k => { const j = Math.round(k * nS / 3), h0 = secRoot(Math.min(nS - 1, j)); return C.bone('Secondaries ' + s + '_' + k, bB, h0, add(h0, mul(Bk, L * sLen * .5)), 'wingFeathers', s); });
        // Each primary on its own bone, so the folded hand stacks them into one tight blade.
        const primAng = j => th[2] + (1.30 - 1.20 * Math.pow(j / Math.max(1, nP - 1), .85)) * (.45 + .55 * sp);
        const prim = Array.from({ length: nP }, (_, j) => { const h0 = primRoot(j); return C.bone('Primaries ' + s + '_' + j, hB, h0, add(h0, mul(dirAt(primAng(j)), L * pLen * .5)), 'wingFeathers', s); });
        const secGroup = j => sec[Math.min(2, Math.floor(j * 3 / nS))], primGroup = j => prim[j];
        const skinArm = t => { const w = smooth(.40, .60, t); return { joints: [aB, bB, 0, 0], weights: [1 - w, w, 0, 0] }; };
        const lead = t => t < .5 ? lerp(shoulder, elbow, t / .5) : lerp(elbow, wrist, (t - .5) / .5);
        // The leading edge: a rounded, covered airfoil over the arm and the patagium.
        const base = new FMesh(), baseRows = [], chord = t => L * sLen * wsz * (.14 + .06 * Math.sin(Math.PI * t)) * (t < .5 ? .5 + t : 1);
        const flat = scale3(plumage(C, 'covertL', .5, 1)(.3, 0), .7);
        // From the elbow outward only: the humerus lies under the scapulars and flank feathers.
        for (let i = 0; i <= 24; i++) {
            const t = .42 + i / 24 * .58, p = lead(t), row = [];
            for (let k = 0; k <= 10; k++) {
                const a = k / 10 * Math.PI * 2, u = (1 - Math.cos(a)) * .5, w = smooth(.25, .9, u) * smooth(.45, .6, t);
                // The trailing part over the forearm sweeps back with the secondaries as the wing folds.
                const g = sec[Math.min(2, Math.floor((1 - (t - .5) / .5) * 3))], arm = skinArm(t), skin = w > 0 ? { joints: [arm.joints[0], arm.joints[1], g, 0], weights: [arm.weights[0] * (1 - w), arm.weights[1] * (1 - w), w, 0] } : arm;
                row.push(base.vertex(add(add(p, mul(N, L * (.010 * (1 - t) + .004) * Math.sin(a))), mul(Bk, chord(t) * u)), N, flat, skin, [0, 0]));
            }
            baseRows.push(row);
        }
        ringsOut(base, baseRows.map(r => r.slice(0, 10)), baseRows.map((_, i) => add(lead(.42 + i / 24 * .58), mul(Bk, chord(.42 + i / 24 * .58) * .5))));
        base.smoothNormals();
        C.finish(base, 'Wing shoulder ' + s, { kind: 'feather', roughness: .9, noSurfaceDetail: true });
        const remiges = new FMesh(), coverts = new FMesh(), stackN = (k) => mul(N, L * k);
        // Primaries: fanned from the wrist, the outer ones emarginated into the eagle's slotted fingers.
        const primTips = [], secTips = [];
        const lengths = nP === 10 ? [.64, .67, .71, .76, .82, .89, .96, 1, .97, .86] : Array.from({ length: nP }, (_, j) => .7 + .3 * Math.sin(Math.PI * (j + 1) / (nP + 1)));
        if (b.slots < .5 && nP === 10) for (let j = 6; j < 10; j++) lengths[j] = Math.max(lengths[j], .98 - (j - 7) * .03);
        for (let j = 0; j < nP; j++) {
            const t = j / Math.max(1, nP - 1), ang = primAng(j);
            const slot = b.slots * smooth(.45, .9, t), dir = dirAt(ang), len = L * pLen * wsz * lengths[j];
            primTips.push({ k: j, p: add(primRoot(j), mul(dir, len)) });
            card(remiges, { root: add(primRoot(j), stackN(-.0010 - .0007 * (nP - j))), dir, up: N, lead: Sd, len, wid: len * (.20 - .06 * slot), cell: CELLS[slot > .3 ? 'primary' : 'secondary'][0], rows: 6, bend: -.02, lift: .03, cup: .10,
                color: plumage(C, 'primary', t, 200 + j), skin: rigid(primGroup(j)) });
            // Primary coverts over the shafts' roots.
            card(coverts, { root: add(primRoot(j), stackN(.0016)), dir, up: N, lead: Sd, len: len * .30, wid: len * .085, cell: CELLS.covert[j % 5], rows: 2, bend: .03, lift: .02, cup: .12,
                color: plumage(C, 'covertG', t, 260 + j), skin: rigid(primGroup(j)) });
        }
        // Alula: the bastard wing at the wrist's leading edge.
        for (let j = 0; j < 3; j++) card(coverts, { root: add(wrist, add(mul(Sd, L * .01 * j), stackN(.0030))), dir: dirAt(th[2] - .25 + j * .12), up: N, lead: mul(Bk, -1), len: L * sLen * wsz * (.30 - j * .05), wid: L * sLen * wsz * .07, cell: CELLS.covert[j], rows: 2, bend: .02, cup: .1,
            color: plumage(C, 'covertG', 1, 290 + j), skin: rigid(hB) });
        // Secondaries and tertials along the forearm, greater, median and lesser coverts over them, under-wing coverts below.
        for (let j = 0; j < nS; j++) {
            const t = j / Math.max(1, nS - 1), root0 = secRoot(j), dir = dirAt(1.40 + .26 * t), len = L * sLen * wsz * (1 + .08 * Math.sin(Math.PI * t) * b.slots - .04 * t);
            const g = rigid(secGroup(j));
            secTips.push({ k: Math.min(2, Math.floor(j * 3 / nS)), p: add(root0, mul(dir, len)) });
            card(remiges, { root: add(root0, stackN(-.0004 * j)), dir, up: N, lead: mul(Bk, -1), len, wid: len * .25, cell: CELLS.secondary[0], rows: 5, bend: -.01, lift: .02, cup: .08, color: plumage(C, 'secondary', t, 300 + j), skin: g });
            card(coverts, { root: add(add(root0, mul(Bk, -L * .008)), stackN(.0022)), dir, up: N, lead: mul(Bk, -1), len: len * .42, wid: len * .22, cell: CELLS.covert[j % 5], rows: 2, bend: .04, lift: .02, cup: .14, color: plumage(C, 'covertG', t, 330 + j), skin: g });
            card(coverts, { root: add(add(root0, mul(Bk, -L * .014)), stackN(.0040)), dir, up: N, lead: mul(Bk, -1), len: len * .26, wid: len * .20, cell: CELLS.covert[(j + 2) % 5], rows: 2, bend: .05, lift: .02, cup: .16, color: plumage(C, 'covertM', t, 360 + j), skin: g });
            card(coverts, { root: add(add(root0, mul(Bk, -L * .006)), stackN(-.004)), dir, up: mul(N, -1), lead: mul(Bk, -1), len: len * .45, wid: len * .20, cell: CELLS.covert[(j + 1) % 5], rows: 2, bend: .04, cup: .1, color: plumage(C, 'underwing', t, 390 + j), skin: g });
        }
        for (let j = 0; j < 3; j++) {
            const root0 = add(lerp(elbow, shoulder, .1 + j * .12), mul(Bk, L * .004)), len = L * sLen * wsz * (.85 - j * .1);
            card(remiges, { root: add(root0, stackN(.0002 * j)), dir: dirAt(1.72 + j * .12), up: N, lead: mul(Bk, -1), len, wid: len * .30, cell: CELLS.secondary[0], rows: 4, bend: -.01, lift: .02, cup: .10, color: plumage(C, 'tertial', j / 2, 420 + j), skin: rigid(sec[2]) });
        }
        // Lesser and marginal coverts: small, many, shingled over the leading edge.
        let seed = 500;
        for (let row = 0; row < 4; row++) {
            const count = Math.round(16 + row * 2);
            for (let j = 0; j < count; j++) {
                const t = .03 + (j + (row % 2) * .5) / count * .95, p = lead(t), len = L * sLen * wsz * (.10 + row * .035) * (b.card || 1);
                const skin = t > .5 ? rigid(sec[Math.min(2, Math.floor((1 - (t - .5) / .5) * 3))]) : skinArm(t);
                card(coverts, { root: add(add(p, mul(Bk, L * .004 + row * len * .30)), stackN(.006 - row * .0008)), dir: dirAt(1.45 + (t < .5 ? .25 * (1 - t * 2) : 0)), up: N, len, wid: len * .75, cell: CELLS.covert[(j + row) % 5], rows: 2, bend: .05, lift: .03, cup: .18,
                    color: plumage(C, 'covertL', t, seed++), skin, surface: N });
            }
        }
        C.finish(remiges, 'Flight feathers ' + s, featherMaterial(C, { alphaCutoff: .4 }));
        C.finish(coverts, 'Wing coverts ' + s, featherMaterial(C, { alphaCutoff: .42 }));
        // Feather groups' and arm bones' rest frames, for the fold.
        B.wings.push({ s, aB, bB, hB, sec, prim, shoulder, elbow, wrist, tip, N, Sd, th,
            primTips, primHeads: prim.map(bi => C.bones[bi].head), secTips, secHeads: sec.map(bi => C.bones[bi].head), secDir: [0, 1, 2].map(k => dirAt(1.40 + .26 * (k + .5) / 3)), primDir: Array.from({ length: nP }, (_, j) => dirAt(primAng(j))) });
    }

    /** The tail: rectrices in a fan on a tail bone and two fan bones, with upper and under tail coverts. */
    /**
     * A closed, solid feather blade (a raptor's rectrix): a rounded tip, a
     * shallow arch across, thin edges, a pale shaft line, bent down along its
     * length by distance from the base only, so neighbouring blades on their
     * own layers stay parallel when the tail fans.
     */
    function featherBlade(m, o) {
        const dir = norm(o.dir), up = norm(sub(o.up, mul(dir, dot(o.up, dir)))), across = norm(cross(up, dir));
        const rows = o.rows || 12, cols = o.cols || 10, ids = [], centers = [];
        const half = v => o.wid * .5 * (.55 + .45 * smooth(0, .22, v)) * (v > .78 ? Math.sqrt(Math.max(0, 1 - ((v - .78) / .22) ** 2)) : 1);
        for (let i = 0; i <= rows; i++) {
            const v = i / rows, w = Math.max(o.len * .004, half(v)), sag = -(o.bend || 0) * o.len * v * v, c = add(add(o.root, mul(dir, v * o.len)), mul(up, sag + (o.layer || 0)));
            const row = [];
            for (let side = 0; side < 2; side++) for (let k = 0; k < cols; k++) {
                // Top from the leading edge across to the trailing one, then the underside back.
                const u = side ? 1 - 2 * k / cols : -1 + 2 * k / cols, ua = Math.abs(u);
                const off = (o.asym || 0) * w, x = u * w + off * (1 - ua);
                const arch = (o.arch || 0) * w * (1 - u * u), th = o.thick * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - .35 * v) + o.len * .0006;
                const p = add(add(c, mul(across, x)), mul(up, arch + (side ? -th * .5 : th * .5)));
                const shaft = Math.exp(-(((u - (o.asym || 0) * .3) / .07) ** 2)) * (1 - .7 * v), edge = smooth(.75, 1, ua);
                const col = o.color(v, u, side, shaft, edge);
                row.push(m.vertex(p, side ? mul(up, -1) : up, col, o.skin, [0, 0]));
            }
            ids.push(row); centers.push(c);
        }
        // Wound by surface: the top faces up, the underside down, the two edge strips outward across.
        const n2 = cols * 2;
        for (let i = 0; i < rows; i++) for (let k = 0; k < n2; k++) {
            const k2 = (k + 1) % n2, a = ids[i][k], b = ids[i][k2], c = ids[i + 1][k], d = ids[i + 1][k2];
            const out = k < cols - 1 ? up : k >= cols && k < n2 - 1 ? mul(up, -1) : k === cols - 1 ? across : mul(across, -1);
            triOut(m, a, c, b, out); triOut(m, b, c, d, out);
        }
        const cap = m.vertex(centers[0], mul(dir, -1), o.color(0, 0, 0, 0, 0), o.skin, [0, 0]);
        for (let k = 0; k < ids[0].length; k++) triOut(m, cap, ids[0][k], ids[0][(k + 1) % ids[0].length], mul(dir, -1));
    }

    function birdTail(C, B) {
        const { r, L, rootBone: root } = C, b = B.prof, [tlen, count, shape] = b.tail, F = B.F, U = B.U, X = [1, 0, 0];
        // The tail follows the trunk, raised just enough that a perched bird's tail tip clears the ground its feet stand on.
        const base = B.tailRoot, len1 = L * tlen * r.tailLength;
        let back = norm(add(mul(F, -1), mul(U, b.penguin ? 0 : -.08)));
        for (let k = -.08; k < 1.6 && base[1] + back[1] * len1 < C.Y + L * .012; k += .04) back = norm(add(mul(F, -1), mul(U, k)));
        const tail = C.bone('BirdTail', root, base, add(base, mul(back, L * tlen * .5)), 'birdTail', 0);
        const fan = [-1, 1].map(s => C.bone('Tail fan ' + s, tail, base, add(base, add(mul(back, L * tlen * .4), mul(X, s * L * .03))), 'tailFan', s));
        const m = new FMesh(), bm = new FMesh(), raptor = b.skull === 'raptor', spread = .55 * (b.penguin ? .3 : 1) * (b.fanTail || 1), len0 = L * tlen * r.tailLength;
        for (let j = 0; j < count; j++) {
            const t = count > 1 ? j / (count - 1) * 2 - 1 : 0, side = Math.sign(t), at = Math.abs(t);
            const shapeLen = shape === 'wedge' ? 1 - .14 * at * at : shape === 'fork' ? .75 + .35 * at : shape === 'notch' ? .92 + .08 * at : shape === 'graduated' ? 1 - .55 * at : shape === 'point' ? 1 - .35 * at : shape === 'sickle' ? .85 : shape === 'square' ? 1 : 1 - .10 * at * at;
            const ang = t * spread, dir = norm(add(mul(back, Math.cos(ang)), mul(X, Math.sin(ang)))), len = len0 * shapeLen;
            const skin = at < .2 ? rigid(tail) : { joints: [tail, fan[side > 0 ? 1 : 0], 0, 0], weights: [1 - at, at, 0, 0] };
            const up = norm(add(U, mul(back, .12)));
            if (shape === 'sickle' && at > .3) continue;
            if (raptor) {
                // Broad solid blades, the central pair on top and each outer pair a layer beneath, so a fanning tail never crosses itself.
                const layer = -at * (count / 2) * L * .0016, Lt = plumage(C, 'tail', at, 600 + j)(.5, 0);
                featherBlade(bm, { root: add(base, mul(X, t * L * .022)), dir, up, len: len * 1.04, wid: len * .25, thick: L * .0030, arch: .10, bend: .03, layer, asym: side * .18 * at,
                    color: (v, u, under, shaft, edge) => scale3(mix(Lt, scale3(Lt, .80), .55 * shaft + .35 * edge), under ? .86 : 1 - .05 * hash(600 + j, Math.round(v * 9))), skin });
                continue;
            }
            card(m, { root: add(add(base, mul(X, t * L * .02)), mul(up, L * .003 * (1 - at) - L * .0008 * (j % 2))), dir, up, lead: mul(X, -side || 1), len, wid: len * (b.penguin ? .25 : .19), cell: CELLS.tail[0], rows: 5, bend: -.02, lift: .02, cup: .06,
                color: plumage(C, 'tail', at, 600 + j), skin });
        }
        if (shape === 'sickle') for (let j = 0; j < 9; j++) {
            // A rooster's sickles: long arched covert plumes over the tail.
            const t = j / 8 * 2 - 1, root0 = add(base, add(mul(X, t * L * .03), mul(U, L * .02 + L * .01 * (j % 3)))), dir = norm(add(add(mul(back, .45), mul(U, .9)), mul(X, t * .2)));
            card(m, { root: root0, dir, up: X, len: len0 * (1.5 - .3 * Math.abs(t)), wid: L * .055, cell: CELLS.tail[0], rows: 10, bend: .75, cup: .08, color: plumage(C, 'sickle', 1, 640 + j), skin: rigid(tail) });
        }
        // Tail coverts: upper over the rectrices' roots, under below.
        for (let j = 0; j < 9; j++) {
            const t = j / 8 * 2 - 1, dir = norm(add(back, mul(X, t * .3)));
            card(m, { root: add(add(base, mul(U, L * .012)), add(mul(X, t * L * .035), mul(F, L * .03))), dir, up: U, len: len0 * .42, wid: len0 * .16, cell: CELLS.covert[j % 5], rows: 2, bend: .05, cup: .14, color: plumage(C, 'uppertail', .5, 660 + j), skin: rigid(tail) });
            card(m, { root: add(add(base, mul(U, -L * .02)), add(mul(X, t * L * .035), mul(F, L * .03))), dir, up: mul(U, -1), len: len0 * .36, wid: len0 * .15, cell: CELLS.covert[(j + 2) % 5], rows: 2, bend: .05, cup: .14, color: plumage(C, 'undertail', .5, 680 + j), skin: rigid(tail) });
        }
        C.finish(m, 'Tail feathers', featherMaterial(C, { alphaCutoff: .4 }));
        if (!bm.empty) { bm.smoothNormals(); C.finish(bm, 'Tail rectrices', { kind: 'skin', roughness: .82, noSurfaceDetail: true }); }
        B.tail = { tail, fan, spread, U: norm(add(U, mul(back, .12))) };
    }

    /**
     * Legs: the feathered tibiotarsus (an eagle's "trousers"), the scaled
     * tarsus, padded toes with scutes, and curved talons; the hallux behind.
     */
    function birdLegs(C, B) {
        const { r, L, rootBone: root } = C, b = B.prof, [tib, tar, toe, talon, feathered] = b.leg, X = [1, 0, 0], legC = lin(b.legColor), claw = b.skull === 'raptor' || b.skull === 'owl' ? lin('#141210') : scale3(legC, .55);
        const thick = (b.skull === 'raptor' ? 1.3 : b.skull === 'owl' ? 1.15 : 1) * Math.sqrt(r.girth);
        for (const s of [-1, 1]) {
            const L2 = B.leg(s), hip = L2.hip, ankle = L2.ankle, foot = L2.foot;
            const a = C.bone('Leg' + s + '_0', root, hip, ankle, 'legUpper', s > 0 ? 0 : Math.PI), bb = C.bone('Leg' + s + '_1', a, ankle, foot, 'legLower', s > 0 ? 0 : Math.PI);
            C.bones[a].motionScale = .12; C.bones[bb].motionScale = .2;
            const m = new FMesh(), cards = new FMesh();
            // Tibiotarsus: muscled drumstick inside the trousers.
            tubeInto(m, [hip, lerp(hip, ankle, .5), ankle], [L * .028 * thick, L * .022 * thick, L * .014 * thick], 12, scale3(plumage(C, 'trouser', .5, 0)(.5, 0), .6), rigid(a));
            // Tarsus: scaled, flattened front to back, with transverse scutes.
            const tarPath = Array.from({ length: 12 }, (_, i) => lerp(ankle, foot, i / 11));
            tubeInto(m, tarPath, tarPath.map((_, i) => L * (.0125 + .002 * Math.cos(i * 1.7)) * thick * (b.penguin ? 1.6 : 1)), 12, t => mix(legC, scale3(legC, .72), smooth(.82, .95, (t * 10) % 1) * .6), rigid(bb), [1, .8]);
            for (let i = 1; i < 11; i++) ellipsoidInto(m, add(lerp(ankle, foot, i / 11), mul(B.Ff, L * .0105 * thick)), [L * .011 * thick, L * .0045, L * .004], B.Ff, norm(sub(ankle, foot)), mix(legC, [1, 1, 1], .08), rigid(bb), 4, 8);
            // Toes: three forward and the hallux behind (two and two for a parrot), scuted, with talons.
            const toes = b.zygodactyl ? [[-.35, 1], [.25, 1], [Math.PI - .35, .8], [Math.PI + .35, .8]] : [[-.42, 1], [0, 1.1], [.42, .95], [Math.PI, b.skull === 'raptor' ? .78 : .55]];
            for (const [ang, k] of toes) {
                const d = norm(add(mul(B.Ff, Math.cos(ang)), mul(X, s * Math.sin(ang) * (b.zygodactyl ? 1 : 1)))), tl = L * toe * k * r.legLength ** .3;
                const path = Array.from({ length: 8 }, (_, i) => { const t = i / 7; return add(add(foot, mul(d, tl * t)), [0, L * .006 * thick - L * .008 * thick * t + .004 * L * Math.sin(Math.PI * t), 0]); });
                tubeInto(m, path, path.map((_, i) => L * (.0105 - .0035 * i / 7) * thick * (1 + .18 * Math.max(0, Math.cos(i * 2.6)))), 10, legC, rigid(bb), [1.05, .85]);
                for (let i = 1; i < 7; i++) ellipsoidInto(m, add(path[i], [0, L * .006 * thick, 0]), [L * .0085 * thick, L * .0035, L * .005], d, [0, 1, 0], mix(legC, [1, 1, 1], .06), rigid(bb), 4, 8);
                // The talon: a curved, tapering keratin claw.
                const end = path.at(-1), cl = L * talon * k * (ang === Math.PI ? 1.15 : 1) * (.8 + .2 * thick);
                const tal = Array.from({ length: 9 }, (_, i) => { const t = i / 8, a2 = t * 1.9; return add(add(end, mul(d, cl * .55 * Math.sin(a2))), [0, cl * .45 * (Math.cos(a2) - 1) + L * .002, 0]); });
                tubeInto(m, tal, tal.map((_, i) => L * .0075 * thick * Math.pow(1 - i / 8, .8) + L * .0004), 8, claw, rigid(bb), [.8, 1.1]);
                if (b.webbed && ang !== Math.PI && ang < 0.5) {
                    const n2 = toes.find(x => x[0] > ang && x[0] < 1);
                    if (n2) {
                        const d2 = norm(add(mul(B.Ff, Math.cos(n2[0])), mul(X, s * Math.sin(n2[0])))), e2 = add(foot, mul(d2, L * toe * n2[1]));
                        for (const side of [1, -1]) { const v = [foot, end, e2].map(p => m.vertex(add(p, [0, L * .002 * side, 0]), [0, side, 0], scale3(legC, .9), rigid(bb), [0, 0])); side > 0 ? m.tri(v[0], v[2], v[1]) : m.tri(v[0], v[1], v[2]); }
                    }
                }
            }
            m.smoothNormals();
            C.finish(m, 'Leg and foot ' + s, { kind: 'skin', roughness: .55, noSurfaceDetail: true });
            // Trousers: long feathers hanging over the tibia, down onto the tarsus where the kind has them.
            // A bald eagle's trousers end part way down the tarsus: the yellow, scaled lower leg shows.
            const reach = feathered, down = [0, -1, 0], raptorLeg = b.skull === 'raptor';
            let seed = 700 + (s > 0 ? 100 : 0);
            for (let i = 0; i < 6; i++) for (let k = 0; k < 10; k++) {
                const t = .12 + i / 6 * .9, a2 = (k + (i % 2) * .5) / 10 * Math.PI * 2, p = lerp(hip, ankle, Math.min(1, t)), radius = L * (.05 - .026 * t) * thick * (raptorLeg ? .86 : 1);
                const out = norm(add(mul(X, Math.cos(a2)), mul(B.Ff, Math.sin(a2))));
                const len = L * (.06 + .035 * Math.min(1, reach)) * (b.soft ? 1.1 : 1) * (b.penguin ? .5 : 1) * (raptorLeg ? .70 : 1) * (.9 + .2 * hash(seed));
                card(cards, { root: add(p, mul(out, radius * .7)), dir: norm(add(down, mul(out, .22))), up: out, len: len * (reach > 0 ? 1 + reach * .5 * t : .8), wid: len * .7, cell: CELLS.contour[(k + i) % 5], rows: 3, bend: .08, cup: .2,
                    color: plumage(C, 'trouser', t, seed), skin: t > .9 ? { joints: [a, bb, 0, 0], weights: [.5, .5, 0, 0] } : rigid(a), surface: out });
                seed++;
            }
            if (reach > .6) for (let i = 0; i < 5; i++) for (let k = 0; k < 8; k++) {
                // Fully feathered legs and toes (owls): short soft feathers down the tarsus.
                const t = i / 5 * Math.min(.62, reach - .2), a2 = (k + (i % 2) * .5) / 8 * Math.PI * 2, p = lerp(ankle, foot, t), out = norm(add(mul(X, Math.cos(a2)), mul(B.Ff, Math.sin(a2))));
                card(cards, { root: add(p, mul(out, L * .008)), dir: norm(add(down, mul(out, .3))), up: out, len: L * (.035 - .02 * t), wid: L * .028, cell: CELLS.down[(k + i) % 5], rows: 2, bend: .1, cup: .2, color: plumage(C, 'trouser', 1, seed++), skin: rigid(bb), surface: out });
            }
            C.finish(cards, 'Leg feathers ' + s, featherMaterial(C));
        }
    }

    /** Comb and wattles for a rooster: serrated blade and pendant lobes, bare red skin. */
    function combAndWattles(C, B) {
        const { L, headBone: head } = C, m = new FMesh(), skin = rigid(head), red = lin('#b4161a'), H = B.head;
        for (let j = 0; j < 6; j++) {
            const t = j / 5, base = add(add(H.c, mul(H.U, B.headDims[2] * .42)), mul(H.F, B.headDims[0] * (.38 - t * .75)));
            ellipsoidInto(m, add(base, mul(H.U, L * (.022 + .018 * Math.sin(Math.PI * t)))), [L * .006, L * (.03 + .02 * Math.sin(Math.PI * t)), L * .014], H.F, H.U, red, skin, 8, 12);
        }
        for (const s of [-1, 1]) ellipsoidInto(m, add(add(B.billRoot, mul(H.U, -L * .045)), [s * L * .012, 0, 0]), [L * .008, L * .03, L * .02], H.F, H.U, red, skin, 8, 12);
        m.smoothNormals();
        C.finish(m, 'Comb and wattles', { kind: 'skin', roughness: .5, noSurfaceDetail: true });
    }

    /** A tom turkey's bare-skin ornaments: the snood hanging from the forehead over the bill, the wattle
     * under the chin and the knobbly caruncles down the front of the neck, all red. */
    function snoodAndWattle(C, B) {
        const { L, headBone: head } = C, m = new FMesh(), skin = rigid(head), red = lin('#b21a1c'), H = B.head, D = B.headDims;
        // The snood: a fleshy finger rising off the brow, then hanging past the bill's side.
        const top = add(B.billRoot, mul(H.U, D[2] * .16));
        const path = [top, add(top, add(mul(H.F, L * .008), mul(H.U, L * .004))), add(top, add(add(mul(H.F, L * .016), mul(H.U, -L * .004)), [L * .003, 0, 0])), add(top, add(add(mul(H.F, L * .018), mul(H.U, -L * .022)), [L * .006, 0, 0]))];
        for (let j = 0; j <= 16; j++) { const q = j / 16 * 3, i = Math.min(2, Math.floor(q)), at = lerp(path[i], path[i + 1], q - i); ellipsoidInto(m, at, [L * .0036, L * .0036, L * .0036].map(v => v * (1 - j * .012)), H.F, H.U, red, skin, 6, 8); }
        // The wattle: a fold of skin under the chin and throat.
        ellipsoidInto(m, add(add(H.c, mul(H.U, -D[2] * .55)), mul(H.F, D[0] * .05)), [L * .012, L * .03, L * .022], H.F, H.U, red, skin, 8, 12);
        // Caruncles: knobs down the throat.
        for (let j = 0; j < 7; j++) {
            const q = add(add(H.c, mul(H.U, -D[2] * (.4 + j * .22))), add(mul(H.F, -D[0] * (.05 + j * .07)), [(j % 2 - .5) * L * .012, 0, 0]));
            ellipsoidInto(m, q, [L * .008, L * .007, L * .008], H.F, H.U, red, skin, 6, 8);
        }
        m.smoothNormals();
        C.finish(m, 'Snood and wattle', { kind: 'skin', roughness: .5, noSurfaceDetail: true });
    }

    function bird(C) {
        const { r, L, Y, colors: c, rootBone: root, headBone: head } = C, type = BIRDS[r.birdType] ? r.birdType : 'eagle', b = BIRDS[type];
        C.prof = b;
        const alpha = b.pitch * DEG, F = [0, Math.sin(alpha), Math.cos(alpha)], U = [0, Math.cos(alpha), -Math.sin(alpha)], X = [1, 0, 0];
        const trunk = [L * b.trunk[0], L * b.trunk[1], L * b.trunk[2]];
        const [tib, tar] = b.leg, legLen = L * (tib * .55 + tar) * r.legLength;
        // The trunk's center sits over the feet; its belly clears the ground by the leg.
        // The trunk's lowest point sits above the feet by most of the leg's height.
        const O = [0, Y + legLen * .75 + .5 * .85 * Math.hypot(trunk[0] * Math.sin(alpha), trunk[2] * Math.cos(alpha)), -L * .02];
        const B = { prof: b, F, U, O, trunk, bodyLen: trunk[0] / .72 * 1.0, wings: [] };
        B.bodyLen = trunk[0] / .72;
        // Head: level, tilted by the Head tilt slider, on top of the neck.
        const hp = (r.headPitch ?? 15) * DEG * .5 - .08, Fh = norm([0, -Math.sin(hp), Math.cos(hp)]), Uh = norm(cross(Fh, X));
        const hs = r.headSize, headDims = [L * b.head[0] * hs, L * b.head[1] * hs, L * b.head[2] * hs];
        const neckLen = L * b.neck[0] * r.neckLength; B.neckLen = Math.max(L * .03, neckLen); const front = add(O, mul(F, trunk[0] * .5));
        const neckRise = b.penguin ? 0 : b.neck[0] > .3 ? 1 : .8;
        let hc = add(front, add(mul(norm(add(mul(F, 1 - neckRise * .6), [0, neckRise, 0])), neckLen + trunk[2] * .12), mul(Uh, headDims[2] * .15)));
        if (b.neck[0] > .3) hc = add(front, [0, neckLen * .80 + trunk[2] * .3, L * .12]);
        if (b.penguin) hc = add(front, add(mul(F, headDims[2] * .35), mul([0, 0, 1], headDims[0] * .12)));
        B.head = { c: hc, F: Fh, U: Uh }; B.headDims = headDims;
        B.inHead = p => { const d = sub(p, hc); return (d[0] / (headDims[1] * .5)) ** 2 + (dot(d, Uh) / (headDims[2] * .5)) ** 2 + (dot(d, Fh) / (headDims[0] * .5)) ** 2; };
        B.neckEnd = add(add(hc, mul(Fh, -headDims[0] * .18)), mul(Uh, -headDims[2] * .20));
        B.neckDir = norm(sub(B.neckEnd, add(front, mul(F, -L * .01))));
        B.neckDir = norm(add(B.neckDir, mul(Fh, .4)));
        B.neckR = L * b.neck[1] * r.neckThickness * Math.max(.75, hs * .8);
        B.Ff = norm([0, 0, 1]);
        C.bones[head].head = add(hc, add(mul(Fh, -headDims[0] * .30), mul(Uh, -headDims[2] * .25)));
        C.bones[head].tail = add(hc, mul(Uh, headDims[2] * .4));
        C.bones[root].head = O.slice(); C.bones[root].tail = add(O, mul(F, L * .1));
        B.tailRoot = add(add(O, mul(F, -trunk[0] * .48)), mul(U, trunk[2] * .10));
        B.shoulder = s => add(add(add(O, mul(F, trunk[0] * .30)), mul(U, trunk[2] * .26 * r.chestDepth)), mul(X, s * trunk[1] * .22 * r.girth));
        B.leg = s => {
            const hip = add(add(add(O, mul(F, -trunk[0] * .10)), mul(U, -trunk[2] * .18 * r.chestDepth)), mul(X, s * trunk[1] * .26 * r.girth));
            const foot = [s * trunk[1] * .30 * r.girth, Y, O[2] + L * .01];
            const ankle = add(lerp(hip, foot, (L * tib * .55 * r.legLength) / (legLen + 1e-9)), [0, 0, -L * .035 * r.legLength]);
            return { hip, ankle, foot: foot };
        };
        // Head colors under its feathers: the kind's head plumage, dulled.
        // A raptor's face: a soft grey shadow under the brow shelf round the eye, and greyish lores where the cheek feathers meet the cere and gape.
        const faceShade = (x, y, z) => b.skull !== 'raptor' ? 1 : 1 - .09 * Math.exp(-(((y - .16) / .14) ** 2)) * smooth(.35, .7, Math.abs(x)) * smooth(.05, .5, z) - .12 * Math.exp(-(((z - .92) / .14) ** 2) - (((y + .05) / .3) ** 2));
        B.headColor = (x, y, z) => scale3(plumage(C, y < -.35 ? 'throat' : 'head', 1, 0)(.6, 0), .95 * faceShade(x, y, z));
        B.under = (s, dorsal) => scale3(plumage(C, s > .72 ? (s > .76 ? (dorsal > 0 ? 'nape' : 'throat') : 'neck') : dorsal > 0 ? 'back' : 'breast', s > .72 ? (s - .72) / .28 : s, 0)(.6, 0), .62);
        // Eyes: seated in the skull's side, turned forward by kind.
        B.billRoot = add(add(hc, mul(Fh, headDims[0] * (b.skull === 'owl' ? .40 : b.skull === 'duck' ? .38 : b.skull === 'raptor' ? .36 : .33))), mul(Uh, headDims[2] * (b.skull === 'raptor' ? .02 : b.skull === 'owl' ? -.10 : -.02)));
        const body = birdBody(C, B);
        const shape = birdHead(C, B);
        // Eyes: seated on the sculpted skull's own surface, turned forward by kind (an owl's straight ahead).
        const eyeR = L * b.eye * r.eyeSize * Math.sqrt(hs);
        B.eyes = r.eyeCount > 0 ? [-1, 1].map(s => {
            const yaw = b.eyeFwd;
            let d = norm(add(mul(X, s * Math.cos(yaw)), mul(Fh, Math.sin(yaw))));
            const u = norm([b.skull === 'owl' ? .36 : b.skull === 'raptor' ? .62 : .80 * Math.cos(yaw) + .06, b.skull === 'raptor' ? .09 : b.skull === 'owl' ? .08 : .16, b.skull === 'owl' ? .93 : b.skull === 'raptor' ? .57 : .14 + .25 * Math.sin(yaw)]);
            const surface = shape(s * u[0], u[1], u[2]);
            // The eye looks out along the skull's own surface there (a raptor's and an owl's turned further forward).
            const at = v => { const q = norm(v); return shape(q[0], q[1], q[2]); }, uu = [s * u[0], u[1], u[2]], e1 = norm(cross(uu, [0, 0, 1])), e2 = norm(cross(uu, e1));
            let nrm = norm(cross(sub(at(add(uu, mul(e1, .03))), at(sub(uu, mul(e1, .03)))), sub(at(add(uu, mul(e2, .03))), at(sub(uu, mul(e2, .03))))));
            if (dot(nrm, sub(surface, hc)) < 0) nrm = mul(nrm, -1);
            if (b.skull !== 'owl') d = norm(add(mul(nrm, b.skull === 'raptor' ? .45 : .8), mul(d, b.skull === 'raptor' ? .55 : .2)));
            return { side: s, c: sub(surface, mul(d, eyeR * (b.skull === 'owl' ? .25 : b.skull === 'raptor' ? .80 : .62))), d: norm(add(d, mul(Uh, .02))), r: eyeR };
        }) : [];
        birdEyes(C, B);
        birdBill(C, B);
        if (b.comb) combAndWattles(C, B);
        if (b.snood) snoodAndWattle(C, B);
        if (!b.penguin) headFeathers(C, B, shape);
        if (!b.penguin) bodyFeathers(C, B, body);
        if (b.skull === 'owl') owlDisks(C, B, shape);
        for (const s of [-1, 1]) birdWing(C, B, s);
        birdTail(C, B);
        // Every flying bird perches on a folded-wing shell (the open card wing shrinks away), so no folded wing clips into the body.
        if (!b.penguin) for (const w of B.wings) foldedWingShell(C, B, body, w);
        birdLegs(C, B);
        foldRig(C, B);
        // Joints shared as one bone's tail and the next one's head must not be moved twice when the body is placed on the floor.
        for (const bone of C.bones) { bone.head = bone.head.slice(); bone.tail = bone.tail.slice(); }
    }
    /** An owl's facial disks: radiating fine feathers round each eye, a dark rim. */
    function owlDisks(C, B, shape) {
        const { headBone: head } = C, m = new FMesh(), skin = rigid(head), H = B.head, X = [1, 0, 0];
        // Two shallow dishes of fine radiating feathers, each round an eye and ending in a dark ruff.
        for (const e of B.eyes) {
            const F0 = norm(add(mul(e.d, .35), H.F)), U0 = norm(sub(H.U, mul(F0, dot(H.U, F0)))), X0 = cross(U0, F0);
            const Rd = B.headDims[1] * .47, toOther = mul(X, -e.side);
            for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 30; k++) {
                const a = (k + ring * .33) / 30 * Math.PI * 2, d = norm(add(mul(X0, Math.cos(a)), mul(U0, Math.sin(a)))), start = e.r * (1.05 + ring * .7);
                const inward = Math.max(0, dot(d, toOther)), reach = (Rd - start) * (1 - .55 * inward) * (ring ? 1 : 1.05);
                if (reach < e.r * .4) continue;
                const root0 = add(add(e.c, mul(d, start)), mul(F0, e.r * (.75 - ring * .12)));
                card(m, { root: root0, dir: norm(add(d, mul(F0, .18))), up: F0, len: reach, wid: e.r * (.55 + ring * .2), cell: CELLS.fine[k % 5], rows: 2, bend: .02, cup: .08,
                    color: plumage(C, 'disk', ring / 2, 950 + k), skin });
            }
            for (let k = 0; k < 34; k++) {
                const a = k / 34 * Math.PI * 2, d = norm(add(mul(X0, Math.cos(a)), mul(U0, Math.sin(a)))), inward = Math.max(0, dot(d, toOther));
                if (inward > .5) continue;
                card(m, { root: add(add(e.c, mul(d, Rd * (1 - .5 * inward) - e.r * .3)), mul(F0, e.r * .2)), dir: norm(add(d, mul(F0, .5))), up: F0, len: e.r * 1.1, wid: e.r * .9, cell: CELLS.contour[k % 5], rows: 2, cup: .1, color: plumage(C, 'rim', 1, 990 + k), skin });
            }
        }
        C.finish(m, 'Facial disks', featherMaterial(C));
    }

    /**
     * The folded wing, worked out once from the built wing: each arm bone and
     * feather group turned so the humerus runs back and down, the forearm
     * forward to the wrist at the breast's side, the hand back under it, and
     * the remiges lie tailward along the flank (secondaries outermost, the
     * primaries beneath, their tips over the tail). Stored on the bones as
     * local turns; the poses blend toward them.
     */
    /** The folded-wing shell is bound this many times smaller than it shows, about the shoulder inside the body: hidden at rest and in flight. */
    const SHELL_BIND = 1000;
    /**
     * A bird's folded wing as one closed shell per side lying on the body
     * (body.sample plus a gap): scapulars and coverts blending into the back
     * along its top edge, the wrist at the breast's side, a scalloped lower
     * edge of covert and secondary tips, and the primaries running on past
     * the rump as a tapering blade over the closed tail, their tips a little
     * apart above it. Painted with the tracts (brown coverts, darker remiges,
     * feather edges). Bound SHELL_BIND times smaller about the shoulder on its
     * own bone, which the perched clips scale up.
     */
    function foldedWingShell(C, B, body, w) {
        // The pivot sits out beside the shoulder, past the shell: from there it sees the whole shell, so shrinking toward it never crosses the trunk.
        const { L, rootBone: root } = C, s = w.s, X = [1, 0, 0], Pc = add(w.shoulder, add(mul(X, s * L * .10), mul(B.U, L * .035)));
        w.pivot = Pc;
        const bone = C.bone('Folded wing ' + s, root, Pc, add(Pc, mul(B.F, -L * .05)), 'foldedWing', s), skin = rigid(bone);
        w.shell = bone;
        const tb = C.bones[B.tail.tail], back = norm(sub(tb.tail, tb.head)), tU = B.tail.U, tailLen = L * C.prof.tail[0] * C.r.tailLength;
        const NU = C.save ? 44 : 34, NV = C.save ? 18 : 14, ub = .70, gap = L * .009, T0 = L * .011;
        const ang = th => s > 0 ? th : Math.PI - th;
        // Edges as angles round the body (0 the side, pi/2 the back's midline) along u (0 shoulder .. ub rump).
        const topAt = u => 1.10 + .30 * smooth(0, 1, u / ub);
        const lowAt = u => { const k = u / ub; return -.42 + .25 * smooth(.0, .25, k) * 0 + .95 * smooth(.15, 1, k) - .06 * Math.abs(Math.sin(u * Math.PI * 11)) * (1 - smooth(.5, .9, k)); };
        const frontAt = v => .10 * (1 - v) * (1 - v); // the front edge sweeps back from the wrist up to the scapulars
        // The folded primaries reach back over the tail: an eagle's to about 0.6 of its tail, other birds' by their primaries' length.
        const reach = C.prof.skull === 'raptor' ? tailLen * .58 : Math.min(Math.max(tailLen * .85, L * .05), L * C.prof.wing[5] * .55 * C.r.wingSize);
        const tipC = add(add(B.tailRoot, mul(back, reach)), mul(tU, L * .016));
        const sampleUV = (u, v) => {
            if (u <= ub) {
                const uu = Math.max(0, Math.min(ub, u + frontAt(v) * (1 - u / ub))), sv = .64 - (.64 - .05) * uu / ub;
                const th = topAt(uu) + (lowAt(uu) - topAt(uu)) * v, q = body.sample(sv, ang(th));
                return { p: q.p, n: q.n };
            }
            // Past the rump: the primaries' blade, narrowing to its tip above the closed tail.
            const f = (u - ub) / (1 - ub), q0 = sampleUV(ub, v);
            // A rounded, angled wingtip: the outer primaries end first, so the blade narrows to the innermost tip.
            const tipP = add(add(add(tipC, mul(back, -reach * .34 * v * v)), mul(X, s * L * (.006 + .050 * v * (1 - .55 * smooth(.55, 1, f))))), mul(tU, -L * .012 * v));
            const e = 1 - (1 - f) * (1 - f), p = lerp(q0.p, tipP, e);
            // Keep the blade off the tail: it rises over the tail's upper side on the way back.
            const lift = Math.sin(Math.PI * Math.min(1, f * 1.2)) * L * .010;
            return { p: add(p, mul(tU, lift)), n: norm(lerp(q0.n, tU, smooth(0, .7, f))) };
        };
        // The kind's own tracts: back and coverts in front, the primaries' pattern along their length (a turkey's bars, an eagle's dark tips),
        // the secondaries as a band along the lower edge (a mallard's speculum).
        const M = plumage(C, 'back', .3, 1)(.5, 0), cov = plumage(C, 'covertG', .3, 2)(.5, 0), secF = plumage(C, 'secondary', .5, 3), primF = plumage(C, 'primary', .5, 4);
        const colorAt = (u, v, outer) => {
            const remex = smooth(.38, .62, v + .35 * u), primary = smooth(.55, .80, u), band = smooth(.52, .62, v) * (1 - smooth(.74, .84, v)) * (1 - primary);
            const prim = primF(clamp((u - .3) / .7, 0, 1) * .98, 0), sec = secF(clamp((u - .1) / .7, 0, 1) * .98, 0);
            let c = mix(mix(M, cov, smooth(.1, .3, v)), mix(prim, sec, band), remex);
            // Feather edges: covert rows across the front, long vane lines along the remiges.
            const row = (u * 13 + v * 3) % 1, lane = (v * 9 + u * 2) % 1;
            c = scale3(c, 1 - (1 - remex) * .34 * (1 - smooth(0, .22, row)) - remex * .42 * (1 - smooth(0, .16, lane)));
            c = mix(c, scale3(c, 1.45), (1 - remex) * .5 * smooth(.72, .98, row) + remex * .3 * smooth(.8, .98, lane));
            return outer ? c : scale3(c, .7);
        };
        const m = new FMesh(), rows = [], centers = [];
        for (let i = 0; i <= NU; i++) {
            const u = i / NU, row = [], mids = [];
            for (let side = 0; side < 2; side++) for (let k = 0; k <= NV; k++) {
                const v = side ? 1 - k / NV : k / NV, q = sampleUV(u, v);
                const th = T0 * Math.sqrt(smooth(0, .22, v)) * (.35 + .65 * smooth(.02, .14, u)) * (1 - .75 * smooth(.66, .9, u)) * (1 - .45 * smooth(.85, 1, v)) + L * .0012;
                const off = side ? gap : gap + th, p = add(q.p, mul(q.n, off));
                const vid = m.vertex(Pc.map((c0, j) => c0 + (p[j] - c0) / SHELL_BIND), side ? mul(q.n, -1) : q.n, colorAt(u, v, !side), skin, [v * .9, u * 3.2]);
                row.push(vid); if (!side) mids.push({ c: add(q.p, mul(q.n, gap + th * .5)), n: q.n });
            }
            rows.push(row); centers.push(mids);
        }
        // Wound by surface: the outer face away from the body, the inner toward it, the edge strips outward.
        const n2 = (NV + 1) * 2;
        for (let i = 0; i < NU; i++) for (let k = 0; k < n2; k++) {
            const k2 = (k + 1) % n2, a = rows[i][k], b2 = rows[i][k2], c = rows[i + 1][k], d = rows[i + 1][k2], C0 = centers[i];
            const out = k < NV ? C0[Math.min(NV, k)].n : k === NV ? sub(C0[NV].c, C0[NV - 1].c) : k === n2 - 1 ? sub(C0[0].c, C0[1].c) : mul(C0[Math.min(NV, n2 - 1 - k)].n, -1);
            triOut(m, a, c, b2, out); triOut(m, b2, c, d, out);
        }
        for (const [i, dir] of [[0, mul(B.F, 1)], [NU, mul(back, 1)]]) {
            const ring = rows[i], cc = m.vertex(at3(m, ring[Math.floor(NV / 2)]), dir, colorAt(i / NU, .5, true), skin, [0, 0]);
            for (let k = 0; k < ring.length; k++) triOut(m, cc, ring[k], ring[(k + 1) % ring.length], dir);
        }
        m.smoothNormals();
        C.finish(m, 'Folded wing ' + s, plumageMaterial(C, { normalScale: .7 }));
    }

    /** A raptor's folded card wing (seen only while it opens or closes): unused, unused, unused, how far the folded secondaries turn in toward the tail, and how far its face tilts up over the back. */
    const RAPTOR_FOLD = [0, 0, 0, .06, .8];
    function foldRig(C, B) {
        const { bones } = C, F = B.F, U = B.U, X = [1, 0, 0];
        for (const w of B.wings) {
            const s = w.s, flank = (phi, out) => norm(add(add(mul(F, -Math.cos(phi)), mul(U, Math.sin(phi))), mul(X, s * out)));
            const outward = norm(add(mul(X, s), mul(U, B.prof.skull === 'raptor' ? RAPTOR_FOLD[4] : .32)));
            const R = (a, n, a2) => qFrames(a, n, a2, sub(outward, mul(a2, dot(outward, a2))));
            const penguin = B.prof.penguin, raptorWrap = B.prof.skull === 'raptor' ? RAPTOR_FOLD[3] : 0;
            const restH = norm(sub(w.elbow, w.shoulder)), restF = norm(sub(w.wrist, w.elbow)), restM = norm(sub(w.tip, w.wrist));
            const qH = penguin ? qFrames(restH, w.N, flank(.12, .22), outward) : R(restH, w.N, flank(-.62, .30));
            const qF = penguin ? qH : R(restF, w.N, flank(Math.PI - .30, -.10));
            const local = (parent, child) => qMul(qInv(parent), child);
            bones[w.aB].fold = qH; bones[w.bB].fold = local(qH, qF);
            // Perched, a bird shows its folded-wing shell (foldedWingShell); the open card wing shrinks away at the shell's pivot.
            if (w.shell != null) { bones[w.aB].foldScale = 1e-4; bones[w.aB].foldShift = sub(w.pivot, w.shoulder); bones[w.shell].foldScale = SHELL_BIND; }
            const elbow2 = add(w.shoulder, qRot(qH, sub(w.elbow, w.shoulder))), wrist2 = add(elbow2, qRot(qF, sub(w.wrist, w.elbow)));
            if (penguin) { bones[w.hB].fold = local(qF, qH); continue; }
            for (let lift = 0; lift < 1.2; lift += .05) {
                const qS = w.secDir.map((d, k) => R(d, w.N, flank(.06 + .035 * k + lift, -.05 - .02 * k - raptorWrap)));
                const low = Math.min(...w.secTips.map(t => { const head = add(elbow2, qRot(qF, sub(w.secHeads[t.k], w.elbow))); return add(head, qRot(qS[t.k], sub(t.p, w.secHeads[t.k])))[1]; }));
                w.sec.forEach((bi, k) => { bones[bi].fold = local(qF, qS[k]); });
                if (low > C.Y + C.L * .02) break;
            }
            // The hand and primaries lie back along the flank, crossing over the tail; raised until
            // the folded tips clear the ground the bird stands on.

            for (let lift = 0; lift < 1.2; lift += .05) {
                const qM = R(restM, w.N, flank(-.02 + lift, -.12)), qP = w.primDir.map((d, k) => R(d, w.N, flank(.05 - .006 * k + lift, -.10 - .006 * k)));
                const low = Math.min(...w.primTips.map(t => { const head = add(wrist2, qRot(qM, sub(w.primHeads[t.k], w.wrist))); return add(head, qRot(qP[t.k], sub(t.p, w.primHeads[t.k])))[1]; }));
                bones[w.hB].fold = local(qF, qM); w.prim.forEach((bi, k) => { bones[bi].fold = local(qM, qP[k]); });
                if (low > C.Y + C.L * .015) break;
            }
        }
        if (B.tail) for (const [k, bi] of B.tail.fan.entries()) bones[bi].fold = qAxis(B.tail.U, (k ? 1 : -1) * B.tail.spread * .78);
        // Wingbeats per flying loop: small birds beat fast (a hummingbird's a blur), big ones slowly.
        bones[0].birdFrame = { F: B.F, U: B.U, pitch: B.prof.pitch * DEG, eagle: B.prof.skull === 'raptor', penguin: !!B.prof.penguin, beats: ({ hummingbird: 12, sparrow: 4, crow: 2, pigeon: 3, parrot: 3, duck: 3, chicken: 3, turkey: 2 })[C.r.birdType] || 1 };
    }

    /**
     * Bird motions: perched (folded wings, closed tail, a raptor's slow scan),
     * walking and running on folded wings, flying (trunk level, a full
     * downstroke and a flexed upstroke, feet tucked back), gliding, turning
     * and striking. Returns the RRCharacterPoses-style clip Forms returns.
     */
    function poseClip(bones, id, recipe) {
        const frame = bones[0]?.birdFrame;
        if (!frame) return null;
        const penguin = frame.penguin;
        const ids = ['idle', 'turn', 'attack', ...(penguin ? ['swim', 'glide', 'crawl', 'walk', 'run'] : ['fly', 'glide', 'crawl', 'walk', 'run'])];
        if (!ids.includes(id)) return null;
        const beats = id === 'fly' ? frame.beats || 1 : 1, frames = beats > 1 ? beats * 10 + 1 : 33, period = id === 'idle' ? 4 : id === 'attack' ? 1.2 : id === 'fly' ? (frame.eagle ? 1.4 : .9) * (beats > 1 ? 1.5 : 1) : ['walk', 'crawl'].includes(id) ? 1.2 : id === 'run' ? .7 : 2.4;
        const times = Float32Array.from({ length: frames }, (_, i) => i / (frames - 1) * period), tracks = [], heights = new Float32Array(frames);
        const X = [1, 0, 0], Y = [0, 1, 0], F = frame.F, U = frame.U, level = frame.pitch - .08;
        const airborne = ['fly', 'glide'].includes(id) || penguin && id === 'swim';
        bones.forEach((b, index) => {
            const values = new Float32Array(frames * 4), fold = b.fold || [0, 0, 0, 1], s = b.phase || 1;
            for (let i = 0; i < frames; i++) {
                const ph = i / (frames - 1) * Math.PI * 2, wave = Math.sin(ph);
                let q = [0, 0, 0, 1];
                if (airborne) {
                    const pw = ph * beats, flap = id === 'glide' ? 0 : 1, beat = Math.sin(pw) * (penguin ? .7 : .62) * flap, up = Math.max(0, -Math.cos(pw)) * flap;
                    if (b.role === 'root') q = qAxis(X, level + .05 * flap * Math.cos(pw));
                    else if (b.role === 'head') q = qAxis(X, -level + .08);
                    else if (b.role === 'wing') q = penguin ? qMul(qAxis(F, s * (beat - .9)), qAxis(U, s * .2)) : qMul(qAxis(F, s * (beat + (id === 'glide' ? .10 : .05))), qAxis(U, s * .06 * up));
                    else if (b.role === 'wingTip') q = penguin ? [0, 0, 0, 1] : qAxis(U, -s * .55 * up);
                    else if (b.role === 'wingHand') q = penguin ? [0, 0, 0, 1] : qMul(qAxis(U, s * .65 * up), qAxis(F, -s * .18 * Math.sin(pw - .6) * flap));
                    else if (b.role === 'wingFeathers') q = [0, 0, 0, 1];
                    else if (b.role === 'birdTail') q = qAxis(X, -.18 + .05 * Math.sin(ph));
                    else if (b.role === 'tailFan') q = qSlerp([0, 0, 0, 1], qInv(fold), id === 'glide' ? .5 : .25);
                    // Feet carried back under the tail, toes trailing.
                    else if (b.role === 'legUpper') q = qAxis(X, Math.max(.3, 1.45 - level));
                    else if (b.role === 'legLower') q = qAxis(X, .55);
                } else {
                    const walk = ['walk', 'crawl', 'run'].includes(id), stride = id === 'run' ? .45 : .32;
                    const mantle = id === 'attack' ? Math.max(0, Math.sin(ph)) : 0;
                    if (b.role === 'root') {
                        if (id === 'turn') q = qAxis(Y, Math.sin(ph) * .6);
                        else if (walk) q = qMul(qAxis(Y, Math.sin(ph) * .06), qAxis(F, Math.sin(ph) * (penguin ? .14 : .05)));
                        else q = qAxis(X, .015 * Math.sin(ph * 2) - mantle * .25);
                    } else if (b.role === 'head') {
                        // A raptor's scan: holds, then a quick turn of the head.
                        if (id === 'idle') { const look = Math.sin(ph) > 0 ? smooth(.0, .35, Math.sin(ph)) : -smooth(0, .35, -Math.sin(ph)); q = qMul(qAxis(Y, look * .55), qAxis(X, .05 * Math.sin(ph * 2))); }
                        else if (id === 'attack') q = qAxis(X, mantle * .35);
                        else if (walk && !frame.eagle) q = qAxis(X, .05 * Math.sin(ph * 2));
                    } else if (b.role === 'legUpper' && walk) q = qAxis(X, Math.sin(ph - (b.phase || 0)) * stride);
                    else if (b.role === 'legLower' && walk) q = qAxis(X, -Math.max(0, Math.sin(ph - (b.phase || 0))) * stride * 1.2);
                    else if (b.role === 'legUpper' && id === 'attack') q = qAxis(X, -mantle * .5);
                    if (['wing', 'wingTip', 'wingHand', 'wingFeathers', 'tailFan'].includes(b.role)) {
                        const open = id === 'attack' ? mantle * .55 : 0;
                        q = qSlerp(fold, [0, 0, 0, 1], open);
                        if (b.role === 'wing' && id === 'idle') q = qMul(qAxis(U, s * .015 * Math.sin(ph * 2)), q);
                    }
                    if (b.role === 'birdTail') q = qAxis(X, (walk ? .06 : .03) * Math.sin(ph * 2) + (penguin ? -.2 : 0));
                }
                values.set(q, i * 4);
            }
            tracks.push({ bone: index, values });
        });
        // Floor: lift each frame so the lowest skinned sample stays on (or, flying, above) the ground.
        const samples = bones[0]?.floorSamples;
        if (samples) for (let frame2 = 0; frame2 < frames; frame2++) {
            const rotations = [], positions = [];
            bones.forEach((b, i) => {
                const local = Array.from(tracks[i].values.subarray(frame2 * 4, frame2 * 4 + 4));
                rotations[i] = b.parent < 0 ? local : qMul(rotations[b.parent], local);
                positions[i] = b.parent < 0 ? b.head : add(positions[b.parent], qRot(rotations[b.parent], sub(b.head, bones[b.parent].head)));
            });
            let low = Infinity;
            for (const sample of samples) {
                let y = 0;
                for (let k = 0; k < 4; k++) if (sample.w[k]) { const j = sample.j[k]; y += (qRot(rotations[j], sub(sample.p, bones[j].head))[1] + positions[j][1]) * sample.w[k]; }
                low = Math.min(low, y);
            }
            heights[frame2] = Math.max(0, (bones[0].creatureSize || 1) * (airborne ? .08 : .003) - low);
        }
        const name = ({ idle: 'Idle', crawl: 'Walk', walk: 'Walk', run: 'Run', swim: 'Swim', fly: 'Fly', glide: 'Glide', turn: 'Turn', attack: 'Attack' })[id];
        const lift = time => { const t = (id === 'attack' ? clamp(time, 0, period) : ((time % period) + period) % period) / period * (frames - 1), i = Math.min(frames - 1, Math.floor(t)); return heights[i] + (heights[Math.min(frames - 1, i + 1)] - heights[i]) * (t - i); };
        const translation = Float32Array.from({ length: frames * 3 }, (_, i) => bones[0].head[i % 3] + (i % 3 === 1 ? heights[Math.floor(i / 3)] : 0));
        // A raptor's two wings: the folded shell grown to full size and the card wing shrunk into the shoulder while perched,
        // the other way round in the air. Every clip carries both scales, so a crossfade opens one wing out of the other.
        const shifts = [];
        bones.forEach((b, index) => {
            if (!b.foldScale) return;
            const k = airborne ? 1 : b.foldScale;
            shifts.push({ bone: index, path: 'scale', values: Float32Array.from({ length: frames * 3 }, () => k) });
            // The shrunk card wing waits at the shell's pivot, so both wings open out of the same point beside the shoulder.
            if (b.foldShift && b.parent >= 0) { const rest = sub(b.head, bones[b.parent].head), at = airborne ? rest : add(rest, b.foldShift); shifts.push({ bone: index, path: 'translation', values: Float32Array.from({ length: frames * 3 }, (_, i) => at[i % 3]) }); }
        });
        const saved = { name, times, tracks: tracks.concat([{ bone: 0, path: 'translation', values: translation }], shifts), loop: id !== 'attack' };
        return { name, times, tracks: tracks.concat(shifts), heights, lift, loop: id !== 'attack', once: id === 'attack', skin: false, saved };
    }

    function batWing(C, s, shoulder, hip) {
        const { r, L, colors: c, rootBone } = C, span = r.wingSize, spread = .28 + r.wingSpread * .72;
        const elbow = add(shoulder, [s * L * .24 * spread * span, -L * .01, -L * .10 * span]);
        const wrist = add(shoulder, [s * L * .43 * spread * span, L * .03, L * .09 * span]);
        const a = C.bone('Wing' + s, rootBone, shoulder, elbow, 'wing', s), b = C.bone('Wingtip' + s, a, elbow, wrist, 'wingTip', s);
        line(C, 'Wing arm ' + s, [shoulder, elbow], [L * .025, L * .018], c.main, a);
        line(C, 'Wing forearm ' + s, [elbow, wrist], [L * .017, L * .011], c.main, b);
        const tips = [[.86, .02, .12], [.78, -.015, -.12], [.62, -.035, -.32], [.40, -.055, -.44]].map(p => add(shoulder, [s * p[0] * L * span * spread, p[1] * L, p[2] * L * span]));
        // Bone names avoid '/' and '.': three.js reads them as path separators when it binds a clip's tracks (the builder's view).
        const fingerBones = tips.map((tip, j) => C.bone('Wing finger ' + s + '_' + j, b, wrist, tip, 'wingFinger', s));
        mesh(C, 'Wing fingers ' + s, m => {
            // Long finger bones in the membrane with knuckle joints, darker than the skin.
            const bone = mix(c.mark, c.light, .35);
            tips.forEach((tip, j) => { const k1 = lerp(wrist, tip, .48), k2 = lerp(wrist, tip, .78); m.tube([wrist, k1, k2, tip], [L * .0075, L * .0052, L * .0035, L * .0015], 8, bone, rigid(fingerBones[j])); for (const k of [k1, k2]) m.sphere(k, 1, bone, rigid(fingerBones[j]), 6, 10, [L * .0068, L * .0068, L * .0068]); });
            // The thumb on the leading edge: a short digit ending in a hooked claw.
            const thumb = add(wrist, [s * L * .012, L * .03, L * .05]), claw = Array.from({ length: 7 }, (_, i) => { const t = i / 6, a = t * 1.8; return add(thumb, [-s * L * .004 * t, L * .018 * Math.sin(a) * .6 - L * .012 * (1 - Math.cos(a)), L * .016 * Math.sin(a)]); });
            m.tube([wrist, thumb], [L * .008, L * .006], 8, bone, rigid(b));
            m.tube(claw, claw.map((_, i) => L * .0045 * (1 - i / 7) + L * .0004), 8, [.06, .05, .045], rigid(b));
        });
        const boundary = [shoulder,hip,...tips.slice().reverse()], binding=[rootBone,rootBone,...fingerBones.slice().reverse()],membrane = new P.ExactMesh();
        for (let panel = 0; panel < boundary.length - 1; panel++) {
            const endA = boundary[panel], endB = boundary[panel + 1];
            const grid = [], rows = 18, columns = 24;
            for (let i = 0; i <= rows; i++) grid.push(Array.from({ length: columns + 1 }, (_, j) => {
                const t = i / rows, u = j / columns;
                // Scalloped trailing edges curve inward between the fingers, not across them.
                const edge = lerp(endA, endB, u), scallop = panel > 0 ? .13 * Math.sin(Math.PI * u) : 0;
                // The first panel's leading edge is the arm itself (wrist, elbow, shoulder), so the bones never cut through the skin.
                const arm = t < .5 ? lerp(wrist, elbow, t * 2) : lerp(elbow, shoulder, t * 2 - 1);
                const p = panel === 0 ? lerp(arm, lerp(wrist, hip, t), u) : lerp(wrist, edge, t * (1 - scallop * t * t));
                p[1] -= L * .018 * Math.sin(Math.PI * t) * Math.sin(Math.PI * u);
                // Adjacent panels share the exact binding on their common finger.
                const wa=binding[panel]===rootBone?t:1,wb=binding[panel+1]===rootBone?t:1, k=Math.max(0,t*2-1);
                const skin = panel === 0 ? { joints: [a, b, rootBone, 0], weights: [(1 - u) * k, (1 - u) * (1 - k) + u * (1 - t), u * t, 0] }
                    : { joints: [binding[panel],binding[panel+1],b,0], weights: [(1-u)*wa,u*wb,1-(1-u)*wa-u*wb,0] };
                // Veins branch out from the arm across each panel; the skin is thinner and lighter toward the trailing edge.
                const vein=Math.pow(Math.max(0,Math.cos(u*Math.PI*7+t*3.5+Math.sin(t*7+panel)*.8)),10)*.30*(1-.5*t);
                return membrane.vertex(p, [0, 1, 0], c.mark.map(v => Math.min(1, v * 1.45 * (.92 + .22 * t) * (1 - vein))), skin);
            }));
            for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) { const x = grid[i][j], y = grid[i + 1][j], z = grid[i][j + 1], v = grid[i + 1][j + 1]; membrane.tri(x, y, z); membrane.tri(z, y, v); }
        }
        membrane.computeNormals(); C.finish(membrane, 'Patagium ' + s, { roughness: .58, doubleSided: true, opacity: .82, noSurfaceDetail: true });
        mesh(C,'Propatagium '+s,m=>{
            const points=[shoulder,elbow,wrist],skins=[rigid(a),rigid(b),rigid(b)];
            const ids=points.map((p,i)=>m.vertex(p,[0,1,0],c.mark,skins[i]));m.tri(...ids);
        },{doubleSided:true,noSurfaceDetail:true});
    }
    function bat(C) {
        const { r, L, Y, colors: c, rootBone: root, headBone: head } = C, fox = r.batType === 'flyingFox', vampire = r.batType === 'vampireBat';
        const body = [0, Y + L * .07, 0], headCenter = [0, Y + L * .16, L * .23];
        // A bat's trunk: a deep, broad chest for the flight muscles tapering into a smaller belly and rump (not an egg).
        const chestC = add(body, [0, L * .012, L * .07]), rumpC = add(body, [0, -L * .012, -L * .11]);
        const chestR = [L * .118 * r.girth, L * .128 * r.chestDepth, L * .17], rumpR = [L * .088 * r.girth, L * .098 * r.chestDepth, L * .16];
        mesh(C, 'Body', m => { m.sphere(chestC, 1, c.main, rigid(root), C.save ? 20 : 14, C.save ? 32 : 24, chestR); m.sphere(rumpC, 1, c.main, rigid(root), C.save ? 16 : 12, C.save ? 28 : 20, rumpR); });
        C.bones[head].head = add(headCenter, [0, -L * .03, -L * .03]); C.bones[head].tail = add(headCenter, [0, L * .05, L * .05]);
        mesh(C,'Neck fur',m=>m.tube([add(body,[0,L*.035,L*.13]),headCenter],[L*.07,L*.055*r.headSize],14,c.main,p=>{const t=Math.max(0,Math.min(1,(p[2]/L-.13)/.10));return {joints:[root,head,0,0],weights:[1-t,t,0,0]};}));
        ellipsoid(C, 'Head', headCenter, [L * .085 * r.headSize, L * .085 * r.headSize, L * .09 * r.headSize], c.main, head);
        const snout = add(headCenter, [0, -L * .018, L * (fox ? .09 : .065)]);
        ellipsoid(C, 'Muzzle', snout, [L * (fox ? .035 : .055) * r.snoutWidth, L * .032, L * (fox ? .075 : .04) * r.snoutLength], c.light, head);
        if (fox) ellipsoid(C, 'Nose', add(snout, [0, L * .005, L * .062]), [L * .025, L * .016, L * .014], c.dark, head);
        else mesh(C, 'Nose', m => {
            // A pug snout: a bare, slightly upturned nose pad with two flared nostrils and a split upper lip.
            const tip = add(snout, [0, L * .006, L * .036]);
            m.sphere(tip, 1, mix(c.mark, [.45, .32, .30], .35), rigid(head), 10, 16, [L * .024, L * .015, L * .010]);
            for (const s of [-1, 1]) m.sphere(add(tip, [s * L * .009, L * .002, L * .008]), 1, [.05, .035, .03], rigid(head), 6, 10, [L * .0045, L * .0065, L * .003]);
            m.tube([add(tip, [0, -L * .012, L * .004]), add(tip, [0, -L * .024, L * -.002])], L * .0016, 6, [.08, .05, .045], rigid(head));
        }, { noSurfaceDetail: true });
        for (const s of [-1, 1]) {
            const ear = add(headCenter, [s * L * .07, L * .07, 0]);
            mesh(C, 'Ear and tragus ' + s, m => {
                m.sphere(add(ear, [s * L * .012, L * .035, 0]), 1, c.main, rigid(head), 14, 20, [L * .043, L * (fox ? .065 : .09), L * .015]);
                m.sphere(add(ear, [s * L * .012, L * .036, L * .013]), 1, c.mark, rigid(head), 12, 18, [L * .031, L * (fox ? .049 : .072), L * .006]);
                // The tragus: a pale, pointed lobe standing up in front of the ear opening.
                m.tube([add(ear, [-s * L * .004, L * .004, L * .016]), add(ear, [-s * L * .007, L * .026, L * .019]), add(ear, [-s * L * .005, L * .044, L * .016])], [L * .0085, L * .006, L * .0012], 10, mix(c.light, [.85, .7, .62], .3), rigid(head));
                // Transverse folds across the inner ear.
                for (let k = 1; k < 6; k++) { const yk = L * (.035 + (fox ? .058 : .081) * (k / 6 - .5) * 1.6), w = L * .030 * Math.sqrt(1 - ((k / 6 - .5) * 1.6) ** 2); m.tube([add(ear, [s * L * .012 - w, yk, L * .015]), add(ear, [s * L * .012, yk + L * .004, L * .017]), add(ear, [s * L * .012 + w, yk, L * .015])], L * .0012, 5, scale3(c.mark, .8), rigid(head)); }
                const rim=Array.from({length:33},(_,j)=>{const a=j/32*Math.PI*2;return add(ear,[s*L*.012+L*.036*Math.cos(a),L*.035+L*(fox?.058:.081)*Math.sin(a),L*.011]);});
                m.tube(rim,L*.0028,6,c.main,rigid(head));
            });
            if (r.eyeCount > 0) insetEye(C,headCenter,[L*.085*r.headSize,L*.085*r.headSize,L*.09*r.headSize],[s*L*.062,L*.018,L*.06],L*r.headSize*(fox?.020:.014)*r.eyeSize,head,s,c.main);
            batWing(C, s, [s * L * .080*r.girth, body[1] + L * .035*r.chestDepth, L * .09], [s * L * .050*r.girth, body[1] - L * .045*r.chestDepth, -L * .20]);
        }
        // A vampire bat's nose-leaf: a bare U-shaped pad round the nostrils with a short upright leaf above them.
        if (vampire) mesh(C, 'Nose-leaf', m => {
            const tip = add(snout, [0, L * .006, L * .040]), skinCol = mix(c.mark, [.55, .38, .36], .45);
            m.tube(Array.from({ length: 13 }, (_, k) => { const a = Math.PI * (1.15 + .7 * k / 12); return add(tip, [Math.cos(a) * L * .02, Math.sin(a) * L * .016 + L * .002, L * .004]); }), L * .004, 8, skinCol, rigid(head));
            m.sphere(add(tip, [0, L * .024, -L * .002]), 1, skinCol, rigid(head), 8, 12, [L * .011, L * .016, L * .0035]);
        }, { noSurfaceDetail: true });
        mesh(C,'Facial folds and vibrissae',m=>{
            for(const s of [-1,1]){
                m.tube([add(snout,[s*L*.022,-L*.014,L*.025]),add(snout,[0,-L*.020,L*.037]),add(snout,[-s*L*.013,-L*.015,L*.030])],L*.0018,6,c.dark,rigid(head));
                for(let j=0;j<5;j++)m.tube([add(snout,[s*L*.027,-L*.005+j*L*.003,L*.020]),add(snout,[s*L*(.075+j*.007),L*(.015-j*.008),L*(.035+j*.007)])],[L*.0005,L*.00004],4,c.light,rigid(head));
            }
        },{noSurfaceDetail:true});
        mesh(C, 'Fur', m => {
            const count=C.save?3000:2200;
            for (let j = 0; j < count; j++) {
                const a = j * 2.399963, y = 1 - (j + .5) / count * 2, t = Math.sqrt(1 - y * y), n = [Math.cos(a) * t, y, Math.sin(a) * t];
                // On the chest's surface in front, the rump's behind (the two shapes the trunk is built from).
                const front = n[2] > -.15, cc = front ? chestC : rumpC, rr = front ? chestR : rumpR, p = add(cc, [n[0] * rr[0] * .985, n[1] * rr[1] * .985, n[2] * rr[2] * .985]);
                // Fur lies back along the body, denser and softer, the tips frosted lighter.
                const shade = .88 + .24 * hash(j, 7), color = scale3(fox && n[2] > .25 ? c.light : mix(c.main, c.light, .18 * Math.max(0, n[1])), shade);
                m.tube([p, add(p, add(mul(n, L * .0065), [0, -L * .002, -L * .013]))], [L * .0012, L * .0001], 3, color, rigid(root));
            }
        }, { noSurfaceDetail: true });
        feet(C, { legs: .16 }, body[1] - L * .06, -L * .19, true);
        // Haunches: furred thighs running out of the rump into the legs, so the legs grow from the body.
        mesh(C, 'Haunches', m => { for (const s of [-1, 1]) m.tube([add(rumpC, [s * L * .03, -L * .02, -L * .02]), [s * L * .075 * r.girth, body[1] - L * .05, -L * .17], [s * L * .092 * r.girth, body[1] - L * .07, -L * .185]], [L * .045, L * .032, L * .022], 12, c.main, rigid(root)); });
        line(C, 'Tail', [[0, body[1], -L * .22], [0, body[1] - L * .09, -L * .36 * r.tailLength]], [L * .012, L * .002], c.main, root);
    }
    /**
     * Shared API (stable): TYPES, PALETTES, PROFILES, BIRDS (per-kind bird
     * proportions), BIRD_SIZES (typical size per bird type), build(C),
     * poseClip(bones, id, recipe) for birds (null for anything else), and
     * featherPictures(size) -> { 'bird-feathers.png', 'bird-feathers-normal.png' }:
     * the feather atlas (RGBA grey vanes with alpha, and their relief), which
     * other creature builders may reuse through CELLS (uv rects per feather kind).
     */
    const api = { TYPES, PALETTES, PROFILES, BIRDS, BIRD_SIZES, CELLS, FEATHER_TEX, FEATHER_NORMAL, featherPictures, poseClip, build: C => C.r.morphology === 'bat' ? bat(C) : bird(C) };
    root.RRCreatureFlyers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
