/** Non-humanoid aquatic, segmented and arthropod bodies with native skeletal clips. */
(function(root) {
    'use strict';
    const Props = root.RRCharacterProps || (typeof require === 'function' ? require('./CharacterProps.js') : null);
    const Arthropods = root.RRCreatureArthropods || (typeof require === 'function' ? require('./CreatureArthropods.js') : null);
    const Flyers = root.RRCreatureFlyers || (typeof require === 'function' ? require('./CreatureFlyers.js') : null);
    const Reptiles = root.RRCreatureReptiles || (typeof require === 'function' ? require('./CreatureReptiles.js') : null);
    const { add, sub, mul, dot, cross, norm, lerp } = Props.vec;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const rgb = hex => {
        const n = parseInt(hex.slice(1), 16);
        return [16, 8, 0].map(k => { const c = (n >> k & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    };
    const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    const FORMS = [['quadruped', 'Four-legged'], ['fish', 'Fish'], ['cetacean', 'Cetacean'], ['cephalopod', 'Cephalopod'], ['arthropod', 'Arthropod'], ['avian', 'Bird'], ['bat', 'Bat'], ['worm', 'Worm'], ['jellyfish', 'Jellyfish'], ['reptile', 'Reptile or amphibian']];
    const SLIDERS = [
        { key: 'wingSpread', label: 'Wing spread', min: 0, max: 1, natural: [0.2, 1], value: 0.75, forms: ['arthropod', 'avian', 'bat'] },
        { key: 'antennaLength', label: 'Antenna length', min: 0.2, max: 3, natural: [0.5, 1.5], value: 1, forms: ['arthropod'] },
        { key: 'jawOpen', label: 'Jaw opening', min: 0, max: 1, natural: [0, 0.7], value: 0.03, forms: ['fish', 'cetacean', 'worm'] },
        { key: 'toothSize', label: 'Tooth size', min: 0, max: 2, natural: [0.5, 1.4], value: 1, forms: ['fish', 'cetacean', 'worm'] },
        { key: 'dorsalHeight', label: 'Dorsal height', min: 0.3, max: 2, natural: [0.7, 1.3], value: 1, forms: ['fish', 'cetacean'] },
        { key: 'finSize', label: 'Fin size', min: 0.1, max: 3, natural: [0.5, 1.8], value: 1, forms: ['fish', 'cetacean', 'worm'] },
        { key: 'finPairs', label: 'Fin pairs', min: 0, max: 4, natural: [0, 3], value: 1, integer: true, forms: ['fish', 'cetacean'] },
        { key: 'appendages', label: 'Appendages', min: 0, max: 16, natural: [4, 12], value: 8, integer: true, forms: ['cephalopod', 'jellyfish'] },
        { key: 'appendageLength', label: 'Appendage length', min: 0.2, max: 3, natural: [0.5, 1.8], value: 1, forms: ['cephalopod', 'jellyfish', 'arthropod', 'worm'] },
        { key: 'limbPairs', label: 'Leg pairs', min: 0, max: 12, natural: [2, 6], value: 3, integer: true, forms: ['arthropod'] },
        { key: 'segments', label: 'Body segments', min: 4, max: 32, natural: [8, 24], value: 16, integer: true, forms: ['worm', 'arthropod'] },
        { key: 'eyeCount', label: 'Eye count', min: 0, max: 12, natural: [0, 8], value: 2, integer: true, forms: ['fish', 'cetacean', 'cephalopod', 'arthropod', 'worm', 'jellyfish'] },
        { key: 'glow', label: 'Bioluminescence', min: 0, max: 2, natural: [0, 1], value: 0, forms: ['fish', 'cetacean', 'cephalopod', 'arthropod', 'worm', 'jellyfish'] }
    ].map(s => ({ ...s, section: 'Body', step: s.integer ? 1 : 0.01 }));
    const preset = (kind, label, morphology, over, coat, light, marking = '#263b46') => ({ kind, label, group: ['avian', 'bat'].includes(morphology) ? 'Flying animals' : ['fish', 'cetacean', 'cephalopod', 'jellyfish'].includes(morphology) ? 'Aquatic' : 'Arthropods and crawlers', form: morphology,
        over: { morphology, size: 0.6, bodyLength: 1, girth: 1, chestDepth: 1, headSize: 1, eyeSize: 1, snoutLength: 1, tailLength: 1, tailThickness: 1, ears: 'none', mane: 'none', wings: 'none', horns: 'none', fluff: 0, spines: 0, pattern: 'countershade', ...over },
        colors: { coat, light, marking, nose: '#1b2429', eye: '#bd963d' } });
    /** A farm bird's preset: the avian form with that bird type, its size, palette and eye color. */
    const farmBird = (kind, label) => {
        const pal = Flyers.PALETTES?.[kind] || ['#8a6a4a', '#d8c8a8', '#3a2a1e'], k = preset(kind, label, 'avian', { size: Flyers.BIRD_SIZES?.[kind] || .36, wingSize: 1, legLength: 1, neckLength: 1, wingSpread: 1, pattern: 'solid', birdType: kind }, ...pal);
        k.colors.eye = Flyers.BIRDS?.[kind]?.iris || k.colors.eye; k.group = 'Land animals'; return k;
    };
    const KINDS = [
        preset('shark', 'Shark', 'fish', { size: 1.05, finPairs: 2, eyeSize: 0.7, jawOpen: 0.2 }, '#56616a', '#e8e8df', '#27323b'),
        preset('fish', 'Fish', 'fish', { size: 0.28, girth: 1, chestDepth: 1, finPairs: 2 }, '#ba7d43', '#dfd5bc', '#634c37'),
        preset('dolphin', 'Dolphin', 'cetacean', { size: 0.85, snoutLength: 0.9, eyeSize: 0.65 }, '#718f9e', '#c7d7db'),
        preset('whale', 'Whale', 'cetacean', { size: 1.8, girth: 1.12, headSize: 1.15, eyeSize: 0.45 }, '#26333b', '#d0d4ca', '#17262d'),
        preset('octopus', 'Octopus', 'cephalopod', { size: 0.45, appendages: 8, pattern: 'spots' }, '#bb7352', '#e8c4a4', '#754335'),
        preset('squid', 'Squid', 'cephalopod', { size: 0.55, appendages: 10, girth: 0.65, bodyLength: 1.2 }, '#b77c91', '#ead7d8', '#783d69'),
        preset('beetle', 'Beetle', 'arthropod', { size: 0.25, limbPairs: 3, pattern: 'solid' }, '#304e36', '#252a21', '#a58547'),
        preset('tick', 'Tick', 'arthropod', { size: 0.18, limbPairs: 4, eyeCount: 0, pattern: 'solid' }, '#86492f', '#b98c6e', '#2a1d17'),
        preset('bee', 'Bee', 'arthropod', { size: 0.20, limbPairs: 3, wingSize: 1, pattern: 'solid' }, '#bb8c2c', '#d9b755', '#29241c'),
        preset('wasp', 'Wasp', 'arthropod', { size: 0.22, limbPairs: 3, wingSize: 1, pattern: 'solid' }, '#d4a32e', '#dfc46f', '#24221d'),
        preset('mosquito', 'Mosquito', 'arthropod', { size: 0.22, limbPairs: 3, wingSize: 1, appendageLength: 1.3, pattern: 'solid' }, '#776854', '#baac8b', '#352e25'),
        preset('fly', 'Fly', 'arthropod', { size: 0.20, limbPairs: 3, wingSize: 1, pattern: 'solid' }, '#62676a', '#aaa8a0', '#7f392d'),
        preset('butterfly', 'Butterfly', 'arthropod', { size: 0.23, limbPairs: 3, wingSize: 1, pattern: 'solid' }, '#d5802c', '#e5d19d', '#30231c'),
        preset('dragonfly', 'Dragonfly', 'arthropod', { size: 0.23, limbPairs: 3, wingSize: 1, wingSpread: 1, pattern: 'solid' }, '#3b7e89', '#a9ccd1', '#263c41'),
        preset('lobster', 'Lobster', 'arthropod', { size: 0.40, limbPairs: 5, tailLength: 1, pattern: 'solid' }, '#564c38', '#ad9673', '#243e35'),
        preset('avian', 'Bird', 'avian', { size: 0.50, wingSize: 1, legLength: 1, neckLength: 1, wingSpread: 1, pattern: 'solid' }, '#47372c', '#f0ede4', '#251e19'),
        // Farm birds walk more than they fly: built by the avian form, listed among the land animals.
        farmBird('chicken', 'Chicken'), farmBird('duck', 'Duck'), farmBird('turkey', 'Turkey'),
        preset('bat', 'Bat', 'bat', { size: 0.30, wingSize: 1, legLength: 1, wingSpread: 1, pattern: 'solid' }, '#69513d', '#987c60', '#3b302e'),
        preset('worm', 'Worm', 'worm', { size: 0.3, segments: 20, eyeCount: 0, pattern: 'stripes' }, '#b76f78', '#d99b99', '#8f4c5b'),
        preset('stingray', 'Stingray', 'fish', { size: 0.65, girth: 1.7, chestDepth: 0.35, finSize: 1.45, finPairs: 1 }, '#6d6656', '#e2dfd3', '#3d372c'),
        preset('jellyfish', 'Jellyfish', 'jellyfish', { size: 0.4, appendages: 12, eyeCount: 0, glow: 0.4 }, '#9ebcd8', '#dfcaec', '#9a6aaf'),
        preset('spider', 'Spider', 'arthropod', { size: 0.25, limbPairs: 4, eyeCount: 8, appendageLength: 1.3, pattern: 'solid' }, '#5b4733', '#b49b76', '#1e1812'),
        preset('crab', 'Crab', 'arthropod', { size: 0.3, limbPairs: 5, girth: 1.45, chestDepth: 0.6, pattern: 'solid' }, '#79674a', '#b49a70', '#493f2d'),
        preset('centipede', 'Centipede', 'arthropod', { size: 0.35, limbPairs: 10, segments: 18, girth: 0.55, bodyLength: 1.6, pattern: 'stripes' }, '#7a3f24', '#d4a35a', '#24160f'),
        preset('anglerfish', 'Anglerfish', 'fish', { size: 0.4, girth: 1.4, bodyLength: 0.8, headSize: 1.4, glow: 0.25, tuskSize: 0.8, jawOpen: 0.6, pattern: 'spots' }, '#47645a', '#9fa981', '#263a34')
    ];
    const normalize = (out, input, original = input) => {
        out.morphology = FORMS.some(([id]) => id === input.morphology) ? input.morphology : 'quadruped';
        for (const s of SLIDERS) { const n = input[s.key] == null ? s.value : Number(input[s.key]); out[s.key] = clamp(Number.isFinite(n) ? (s.integer ? Math.round(n) : n) : s.value, s.min, s.max); }
        for (const [key, v] of Object.entries(VARIANT_TYPES)) {
            out[key] = v.choices.some(([id]) => id === input[key]) ? input[key] : v.choices[0][0];
            if(v.kind===out.kind){const palette=TYPE_PALETTES[out[key]];for(const [i,field]of ['coat','light','marking'].entries())if(!original.colors?.[field])out.colors[field]=palette[i];}
        }
        if(out.kind==='worm'){
            for(const [key,value]of Object.entries(WORM_DEFAULTS[out.wormType]))if(original[key]==null)out[key]=value;
            if(!original.colors?.eye)out.colors.eye=out.wormType==='goauld'?'#b83d22':out.wormType==='earthworm'?'#bd963d':'#141510';
            // An earthworm's saddle (clitellum) and a leech's side stripes: a color of their own on the Colors tab.
            const band=input.colors?.band;out.colors.band=/^#[0-9a-f]{6}$/i.test(band||'')&&original.colors?.band?band.toLowerCase():out.wormType==='leech'?'#b8642c':'#c9805e';
        }
        if (out.morphology !== 'quadruped') out.gear = [];
        return out;
    };
    function context(r, save) {
        const L = r.size * 2.4, Y = L * 0.28, bones = [], parts = [];
        const colors = { main: rgb(r.colors.coat), light: rgb(r.colors.light), mark: rgb(r.colors.marking), eye: rgb(r.colors.eye), dark: rgb(r.colors.nose) };
        const bone = (name, parent, head, tail, role, phase = 0) => { const i = bones.length; bones.push({ name, parent, head, tail, role, phase, creatureForm: r.morphology, creatureSize: L }); return i; };
        const rootBone = bone('Hips', -1, [0, Y, 0], [0, Y, L * 0.1], 'root');
        const headBone = bone('Head', rootBone, [0, Y, L * 0.3], [0, Y, L * 0.45], 'head');
        const finish = (mesh, name, extra = {}) => {
            if (mesh.empty) return null;
            const p = mesh.part(name, { kind: 'skin', roughness: 0.5, ...extra });
            if (r.glow > 0 && name === 'Body') { p.emissive = r.colors.marking; p.emissiveIntensity = r.glow * 0.35; }
            parts.push(p); return p;
        };
        const pattern = part => {
            if (!part) return;
            for (let i = 0; i < part.positions.length; i += 3) {
                const x = part.positions[i] / L, y = (part.positions[i + 1] - Y) / L, z = part.positions[i + 2] / L;
                let c = colors.main;
                const arm = /^Arm|^Tendril/.test(part.name);
                const under = (arm || r.morphology==='worm' ? clamp(-part.normals[i + 1], 0, 1) : clamp(0.5 - y * 5, 0, 1)) * (r.pattern === 'solid' ? 0 : 0.8);
                c = mix(c, colors.light, under*r.patternAmount);
                const scale = r.patternScale || 1;
                let mark = 0;
                if (r.pattern === 'stripes' || r.pattern === 'tabby') mark = Math.max(0, Math.cos((z * 75 + x * 12) * scale)) ** 6;
                else if (r.pattern === 'spots' || r.pattern === 'rosettes' || r.pattern === 'dapple') mark = Math.max(0, Math.sin(x * 67 * scale) * Math.cos(z * 81 * scale) * Math.sin(y * 59 * scale) - 0.3);
                else if (r.pattern === 'scales') mark = (Math.cos(z * 145 * scale) * Math.cos(x * 127 * scale) + 1) * 0.15;
                c = mix(c, colors.mark, clamp(mark * r.patternAmount, 0, 0.8));
                part.colors.set(c, i);
            }
        };
        // One wet globe painted by direction (no stuck-on iris disks or glint balls):
        // cephalopods get a golden iris with a horizontal slit pupil, others a dark
        // eye with a dim iris ring in the editable eye color.
        const eye = (center, radius, skin, count = 1, facing = [0, 0, 1]) => {
            const m = new Props.ExactMesh(), f = norm(facing), up0 = sub([0, 1, 0], mul(f, f[1])), up = Math.hypot(...up0) > .1 ? norm(up0) : [0, 0, 1], right = cross(up, f);
            const ceph = r.morphology === 'cephalopod', iris = colors.eye, dark = [.012, .012, .014];
            m.sphere(center, radius, (t, a, q) => {
                const d = sub(q, center), front = dot(d, f) / radius, x = dot(d, right) / radius, y = dot(d, up) / radius;
                if (ceph) {
                    if (front > .5 && Math.abs(y) < .16 * (1 - x * x * .8) + .02 && Math.abs(x) < .7) return dark;
                    if (front > .25) return mix(iris, mix(iris, [1, 1, 1], .3), ease(.6, .9, front) * (.5 + .5 * Math.sin(Math.atan2(y, x) * 9)) * .3);
                    return mix(colors.main, colors.light, .2);
                }
                return front > .62 ? dark : front > .32 ? mix(dark, iris, .35) : mix(dark, colors.main, .3);
            }, skin, save ? 14 : 10, save ? 22 : 16);
            finish(m, 'Eye ' + count, { roughness: 0.1, kind: 'eye' });
        };
        const blade = (name, outline, parent, role = 'fin', phase = 0, color = colors.main) => {
            const center = outline.reduce((a, p) => add(a, mul(p, 1 / outline.length)), [0, 0, 0]);
            const normal = norm(cross(sub(outline[1], outline[0]), sub(outline[2], outline[0]))), thick = L * 0.006;
            const b = bone(name, parent, outline[0], center, role, phase), m = new Props.ExactMesh(), rings = [], boundary = [];
            const base = sub(outline.at(-1), outline[0]), reach = Math.max(L * 0.01, ...outline.map(p => Math.hypot(...sub(p, outline[0]))));
            const skin = p => {
                const t = clamp(dot(sub(p, outline[0]), base) / Math.max(1e-12, dot(base, base)), 0, 1);
                const distance = Math.hypot(...sub(p, lerp(outline[0], outline.at(-1), t)));
                const w = clamp(distance / (reach * 0.35), 0, 1);
                if (w >= 0.999) return Props.rigid(b);
                const surface = parts.find(p => p.name === 'Body');
                if (!surface) return { joints: [parent, b, 0, 0], weights: [1 - w, w, 0, 0] };
                let nearest = 0, distance2 = Infinity;
                for (let i = 0; i < surface.positions.length; i += 3) {
                    const d = (p[0] - surface.positions[i]) ** 2 + (p[1] - surface.positions[i + 1]) ** 2 + (p[2] - surface.positions[i + 2]) ** 2;
                    if (d < distance2) { distance2 = d; nearest = i / 3; }
                }
                const weights = new Map([[b, w]]);
                for (let k = 0; k < 4; k++) { const j = surface.joints[nearest * 4 + k]; weights.set(j, (weights.get(j) || 0) + surface.weights[nearest * 4 + k] * (1 - w)); }
                const top = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4), total = top.reduce((s, p) => s + p[1], 0);
                return { joints: top.map(p => p[0]), weights: top.map(p => p[1] / total) };
            };
            // A curved outline and lenticular section give fins an actual rounded
            // leading edge, a thin trailing edge and continuous specular shading.
            for (let i = 0; i < outline.length; i++) for (let k = 0; k < 8; k++) {
                const t = k / 8, a = outline[(i + outline.length - 1) % outline.length], b = outline[i], c = outline[(i + 1) % outline.length], d = outline[(i + 2) % outline.length];
                boundary.push([0, 1, 2].map(j => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t * t * t)));
            }
            for (const sign of [-1, 1]) {
                const rows = [];
                for (const radius of [0.2, 0.45, 0.7, 1]) rows.push(boundary.map((p, i) => {
                    const rise = thick * ((1 - radius) ** 0.7 + 0.12), radial = sub(p, center);
                    const slope = thick * 0.7 * Math.max(0.1, 1 - radius) ** -0.3 / Math.max(L * 0.01, Math.hypot(...radial));
                    const n = norm(add(mul(normal, sign), mul(norm(radial), slope)));
                    return m.vertex(add(lerp(center, p, radius), mul(normal, rise * sign)), n, mix(color, colors.mark, radius * 0.08), skin);
                }));
                const c = m.vertex(add(center, mul(normal, thick * 1.12 * sign)), mul(normal, sign), color, skin);
                for (let i = 0; i < boundary.length; i++) {
                    const j = (i + 1) % boundary.length, tri = (a, b, c) => sign > 0 ? m.tri(a, b, c) : m.tri(a, c, b);
                    tri(c, rows[0][i], rows[0][j]);
                    for (let row = 0; row < rows.length - 1; row++) { tri(rows[row][i], rows[row + 1][i], rows[row][j]); tri(rows[row][j], rows[row + 1][i], rows[row + 1][j]); }
                }
                rings.push(rows.at(-1));
            }
            for (let i = 0; i < boundary.length; i++) { const j = (i + 1) % boundary.length; m.tri(rings[0][i], rings[0][j], rings[1][i]); m.tri(rings[0][j], rings[1][j], rings[1][i]); }
            finish(m, name, { roughness: 0.48 }); return b;
        };
        return { r, save, L, Y, bones, parts, colors, bone, rootBone, headBone, finish, pattern, eye, blade };
    }
    /** First real body intersection from an interior point (before any adornments). */
    function bodyRay(C, origin, direction) {
        const part = C.parts.find(p => p.name === 'Body');
        if (!part) return null;
        const point = i => Array.from(part.positions.subarray(i * 3, i * 3 + 3)), d = norm(direction);
        let best = Infinity, binding = null;
        for (let t = 0; t < part.index.length; t += 3) {
            const a = point(part.index[t]), e = sub(point(part.index[t + 1]), a), f = sub(point(part.index[t + 2]), a), h = cross(d, f), det = dot(e, h);
            if (Math.abs(det) < 1e-12) continue;
            const s = sub(origin, a), u = dot(s, h) / det;
            if (u < 0 || u > 1) continue;
            const q = cross(s, e), v = dot(d, q) / det, distance = dot(f, q) / det;
            if (v >= 0 && u + v <= 1 && distance > 1e-8 && distance < best) {
                best = distance;
                const weights = new Map();
                for (let k = 0; k < 3; k++) {
                    const vertex = part.index[t + k], w = [1 - u - v, u, v][k];
                    for (let j = 0; j < 4; j++) { const bone = part.joints[vertex * 4 + j]; weights.set(bone, (weights.get(bone) || 0) + part.weights[vertex * 4 + j] * w); }
                }
                const top = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, p) => s + p[1], 0);
                binding = { joints: top.map(p => p[0]), weights: top.map(p => p[1] / sum) };
            }
        }
        if (!Number.isFinite(best)) return null;
        const p = add(origin, mul(d, best)); p.skin = binding; return p;
    }
    /** Stingray: a flat rounded-rhombic disc with a raised trunk, thin wing
     * margins that undulate, eyes and spiracles on top, mouth, nostrils and five
     * gill-slit pairs underneath, pelvic lobes, and a whip tail with a serrated
     * venomous spine. */
    function rayFish(C) {
        const { r, L, Y, colors, bone, rootBone, headBone, finish, blade } = C;
        const a = L * .26, b = L * .30 * (r.girth / 1.7) * (.62 + .38 * r.finSize / 1.45), H = L * .042 * r.chestDepth / .35, cz = L * .03;
        // A rounded rhombus: pointed wing tips and snout, straight trailing edges.
        const e = 1.7, outline = th => { const s = Math.sin(th), c = Math.cos(th), round = .55 + .45 * Math.abs(Math.sin(2 * th)) ** .5; return [b * Math.sign(s) * Math.abs(s) ** e * (1 + .07 * round * Math.abs(c) ** .5), cz + a * Math.sign(c) * Math.abs(c) ** e * (1 + .07 * round * Math.abs(s) ** .5)]; };
        const trunk = (x, z) => Math.exp(-((x / (b * .24)) ** 2)) * Math.max(0, 1 - ((z - cz + a * .05) / (a * 1.02)) ** 2) ** .55;
        const top = (x, z, rho) => H * (.28 * (1 - rho * rho) ** 1.1 + .72 * trunk(x, z) * (1 - rho ** 6)) + L * .0012 * (1 - rho);
        const bottom = (x, z, rho) => -H * (.16 * (1 - rho * rho) ** 1.1 + .36 * trunk(x, z) * (1 - rho ** 6)) - L * .0006 * (1 - rho);
        C.bones[headBone].head = [0, Y, cz + a * .35]; C.bones[headBone].tail = [0, Y, cz + a * .9];
        C.bones[rootBone].head = [0, Y, cz]; C.bones[rootBone].tail = [0, Y, cz - a * .3];
        // Inner and outer wing bones per side; the outer lags so the wave runs outward.
        const wings = {};
        for (const sign of [-1, 1]) {
            const inner = bone('Fin' + sign + '_0', rootBone, [sign * b * .22, Y, cz], [sign * b * .55, Y, cz], 'rayWing', sign);
            const outer = bone('Fin' + sign + '_1', inner, [sign * b * .55, Y, cz], [sign * b * .95, Y, cz], 'rayWing', sign * 1.6);
            wings[sign] = [inner, outer];
        }
        const tailLength = L * .78 * r.tailLength, tailStart = cz - a * .93, chain = [];
        let parent = rootBone;
        for (let i = 0; i < 5; i++) { const z0 = tailStart - tailLength * i / 5, b2 = bone('Tail' + i, parent, [0, Y, z0], [0, Y, z0 - tailLength / 5], 'tail', i * .55); chain.push({ z: z0, b: b2 }); parent = b2; }
        const skin = p => {
            const x = Math.abs(p[0]), sign = p[0] < 0 ? -1 : 1, [inner, outer] = wings[sign];
            const wo = ease(b * .5, b * .85, x), wi = ease(b * .14, b * .42, x) * (1 - wo);
            const core = 1 - wo - wi, head = ease(cz, cz + a * .45, p[2]);
            const ws = [[outer, wo], [inner, wi], [headBone, core * head], [rootBone, core * (1 - head)]].filter(([, w]) => w > 1e-5).sort((m, n) => n[1] - m[1]).slice(0, 4);
            const sum = ws.reduce((s, [, w]) => s + w, 0) || 1;
            return { joints: ws.map(([j]) => j), weights: ws.map(([, w]) => w / sum) };
        };
        const NR = C.save ? 34 : 26, NT = C.save ? 112 : 84, disc = new Props.ExactMesh();
        // Mottled grey-brown above with a darker margin; white below with a dusky rim.
        const shade = (x, z, rho, upper) => {
            if (!upper) return mix(colors.light, colors.main, ease(.8, 1, rho) * .45);
            const m = fbm(x / L * 9 + 3, z / L * 9, 4), spot = ease(.6, .72, fbm(x / L * 26 - 4, z / L * 26 + 7, 3));
            let c = mix(colors.main, colors.mark, (m - .45) * .9 * r.patternAmount);
            c = mix(c, colors.mark, (ease(.86, 1, rho) * .35 + spot * .3) * r.patternAmount);
            return c.map(v => Math.max(0, v * (1 + (m - .5) * .25)));
        };
        const grids = [];
        for (const upper of [true, false]) {
            const grid = [];
            for (let i = 0; i <= NR; i++) {
                const rho = i / NR, row = [];
                for (let k = 0; k < (i ? NT : 1); k++) {
                    const [ox, oz] = outline(k / NT * Math.PI * 2), x = ox * rho, z = cz + (oz - cz) * rho, p = [x, Y + (upper ? top(x, z, rho) : bottom(x, z, rho)), z];
                    row.push(disc.vertex(p, [0, upper ? 1 : -1, 0], shade(x, z, rho, upper), skin(p)));
                }
                grid.push(row);
            }
            grids.push(grid);
            for (let i = 0; i < NR; i++) for (let k = 0; k < NT; k++) {
                const k1 = (k + 1) % NT, A = grid[i][i ? k : 0], B = grid[i][i ? k1 : 0], Cc = grid[i + 1][k], D = grid[i + 1][k1];
                const tri = (p, q, s) => upper ? disc.tri(p, s, q) : disc.tri(p, q, s);
                if (i) { tri(A, B, Cc); tri(B, D, Cc); } else tri(A, D, Cc);
            }
        }
        marineNormals(disc);
        // Keep each face's normal on its own side of the thin disc.
        const part = finish(disc, 'Body', { kind: 'aquatic', roughness: .58 });
        for (let i = 0; i < part.positions.length / 3; i++) if ((part.positions[i * 3 + 1] - Y) * part.normals[i * 3 + 1] < -1e-9 && Math.abs(part.positions[i * 3 + 1] - Y) > L * .002) for (let k = 0; k < 3; k++) part.normals[i * 3 + k] *= -1;
        const surfaceAt = (x, z, upper) => { const th = Math.atan2(x, z - cz), [ox, oz] = outline(th), rho = Math.hypot(x, z - cz) / Math.max(1e-6, Math.hypot(ox, oz - cz)); return [x, Y + (upper ? top(x, z, rho) : bottom(x, z, rho)), z]; };
        // Eyes sit high on the trunk, spiracles open just behind them.
        const details = new Props.ExactMesh();
        for (let i = 0; i < r.eyeCount; i++) {
            const sign = i % 2 ? -1 : 1, row = Math.floor(i / 2), x = sign * b * (.115 + row * .03), z = cz + a * (.42 - row * .07), radius = L * .0105 * r.eyeSize;
            const p = surfaceAt(x, z, true), center = add(p, [0, radius * .25, 0]), f = norm([sign * .5, 1, .2]);
            const eye = new Props.ExactMesh();
            eye.sphere(center, radius, (t, ang, q) => { const front = dot(sub(q, center), f) / radius; return front > .8 ? rgb('#06080a') : front > .55 ? rgb('#4d4532') : mix(colors.main, colors.mark, .3); }, Props.rigid(headBone), 12, 18, [1, .7, 1.25]);
            finish(eye, 'Eye ' + i, { kind: 'eye', roughness: .18 });
            const sp = surfaceAt(x * 1.05, z - a * .16, true);
            details.disk(add(sp, [0, L * .0008, 0]), norm([sign * .15, 1, -.2]), radius * .85, rgb('#1d1a18'), Props.rigid(headBone), 14, radius * .5);
        }
        // Underside: transverse mouth, paired nostrils and five pairs of gill slits.
        const under = (x, z) => add(surfaceAt(x, z, false), [0, -L * .0007, 0]);
        details.disk(under(0, cz + a * .52), [0, -1, 0], b * .085, rgb('#2b2224'), Props.rigid(headBone), 18, L * .004);
        for (const sign of [-1, 1]) {
            details.disk(under(sign * b * .07, cz + a * .62), [0, -1, 0], L * .006, rgb('#3a3335'), Props.rigid(headBone), 12, L * .0025);
            for (let g = 0; g < 5; g++) details.disk(under(sign * b * (.2 + g * .012), cz + a * (.33 - g * .085)), [0, -1, 0], L * (.012 - g * .0012), rgb('#4a4244'), skin, 12, L * .0012);
        }
        finish(details, 'Gills and facial detail', { kind: 'aquatic', roughness: .6, noSurfaceDetail: true });
        // A row of dorsal tubercles along the midline toward the tail.
        const thorns = new Props.ExactMesh();
        for (let k = 0; k < 9; k++) { const z = cz - a * (.05 + k * .1), p = surfaceAt(0, z, true); thorns.tube([add(p, [0, -L * .002, 0]), add(p, [0, L * .006, -L * .004])], [L * .004, L * .0004], 8, mix(colors.main, colors.light, .35), skin); }
        finish(thorns, 'Dorsal tubercles', { kind: 'aquatic', roughness: .45, noSurfaceDetail: true });
        // Pelvic lobes beside the tail base.
        if (r.finPairs > 0) for (const sign of [-1, 1]) {
            const base = [sign * b * .08, Y - H * .1, cz - a * .78];
            blade('Pelvic fin' + sign, [base, add(base, [sign * b * .17, -H * .05, -a * .05]), add(base, [sign * b * .15, -H * .08, -a * .24]), add(base, [sign * b * .03, -H * .02, -a * .26])], rootBone, 'fin', sign, colors.main);
        }
        if (r.tailLength > 0) {
            // Whip tail: thick at its root, drooping slightly, a fine lash at the end.
            const path = Array.from({ length: 21 }, (_, i) => { const t = i / 20; return [0, Y + H * (.12 - .35 * t * t) , tailStart + L * .01 - tailLength * t]; });
            const tailSkin = p => { const f = clamp((tailStart - p[2]) / tailLength * 5, 0, 4.999), i = Math.floor(f), u = f - i; return i < 4 ? { joints: [chain[i].b, chain[i + 1].b, 0, 0], weights: [1 - u * .6, u * .6, 0, 0] } : Props.rigid(chain[4].b); };
            const tm = new Props.ExactMesh();
            tm.tube(path, path.map((_, i) => L * (.024 * (1 - i / 20) ** 1.6 + .0012)), C.save ? 16 : 12, mix(colors.main, colors.mark, .25), p => p[2] > tailStart - L * .02 ? { joints: [rootBone, chain[0].b, 0, 0], weights: [.5, .5, 0, 0] } : tailSkin(p));
            finish(tm, 'Tail', { kind: 'aquatic', roughness: .55 });
            // Serrated venomous spine on top of the tail, a third of the way along.
            const spine = new Props.ExactMesh(), s0 = path[5], s1 = add(path[9], [0, L * .012, 0]);
            spine.tube([add(s0, [0, L * .008, 0]), lerp(s0, s1, .5), s1], [L * .0035, L * .0025, L * .0003], 8, rgb('#8c8270'), tailSkin);
            for (let k = 1; k < 10; k++) for (const sign of [-1, 1]) { const q = lerp(add(s0, [0, L * .008, 0]), s1, k / 10); spine.tube([q, add(q, [sign * L * .004, -L * .0005, L * .004])], [L * .0009, L * .0001], 4, rgb('#8c8270'), tailSkin); }
            finish(spine, 'Tail spine', { kind: 'aquatic', roughness: .4, noSurfaceDetail: true });
        }
    }

    // Profiles are measured along nose → caudal peduncle. Width, dorsal
    // height and ventral depth are independent so a melon is not a sphere
    // stuck onto a generic fish. Values are fractions of the axial length.
    const MARINE_TYPES = {
        sharkType: { label: 'Shark type', kind: 'shark', choices: [['greatWhite', 'Great white'], ['tiger', 'Tiger shark'], ['bull', 'Bull shark'], ['hammerhead', 'Hammerhead'], ['mako', 'Shortfin mako'], ['thresher', 'Thresher'], ['whaleShark', 'Whale shark']] },
        whaleType: { label: 'Whale type', kind: 'whale', choices: [['humpback', 'Humpback'], ['blue', 'Blue whale'], ['orca', 'Orca']] },
        fishType: { label: 'Fish type', kind: 'fish', choices: [['reef', 'Reef fish'], ['tuna', 'Yellowfin tuna'], ['salmon', 'Salmon']] }
    };
    const WORM_TYPES = {wormType:{label:'Worm type',kind:'worm',choices:[['earthworm','Earthworm'],['tapeworm','Tapeworm'],['leech','Leech'],['roundworm','Roundworm'],['bristleworm','Bristleworm'],['goauld',"Goa'uld"]]}};
    const WORM_DEFAULTS={earthworm:{eyeCount:0,jawOpen:.03,pattern:'stripes'},tapeworm:{eyeCount:0,jawOpen:.03,pattern:'solid'},leech:{eyeCount:10,jawOpen:.03,pattern:'countershade'},roundworm:{eyeCount:0,jawOpen:.03,pattern:'solid'},bristleworm:{eyeCount:2,jawOpen:.03,pattern:'stripes'},goauld:{eyeCount:2,jawOpen:.7,pattern:'countershade'}};
    const VARIANT_TYPES = {...MARINE_TYPES,...WORM_TYPES,...Arthropods.TYPES,...Flyers.TYPES,...Reptiles.TYPES};
    const TYPE_PALETTES = {
        ...Arthropods.PALETTES, ...Flyers.PALETTES, ...Reptiles.PALETTES,
        earthworm:['#b76f78','#d99b99','#8f4c5b'],tapeworm:['#d9c8a8','#ede1c9','#b19d7e'],leech:['#41483a','#aaa47b','#20291e'],roundworm:['#d6bba0','#ebd6b9','#bda084'],bristleworm:['#92645c','#d8b094','#513e3e'],goauld:['#625449','#b3a084','#302c29'],
        greatWhite: ['#56616a','#e8e8df','#27323b'], tiger: ['#747668','#d5d5c7','#343b34'], bull: ['#72756e','#ddded3','#35413f'],
        hammerhead: ['#5b716f','#dde0d4','#31413f'], mako: ['#365766','#dfe3de','#203843'], thresher: ['#55636c','#d8dcda','#2c3a44'], whaleShark: ['#354e5b','#d3d5c6','#223d49'],
        humpback: ['#26333b','#d0d4ca','#17262d'], blue: ['#586f7e','#b7c5ca','#344c5b'], orca: ['#111a20','#edf0e6','#53636b'],
        reef: ['#ba7d43','#dfd5bc','#634c37'], tuna: ['#244f6c','#c4d2d5','#bfaa43'], salmon: ['#5b766e','#cad2c9','#263c35']
    };
    function withVariant(r,key,value) {
        if(Reptiles.TYPES[key])return Reptiles.withVariant(r,key,value);
        const def=VARIANT_TYPES[key]; if(!def||def.kind!==r.kind||!def.choices.some(([id])=>id===value))return r;
        const p=TYPE_PALETTES[value];return {...r,[key]:value,...(key==='wormType'?WORM_DEFAULTS[value]:{}),...(key==='sharkType'?{jawOpen:({greatWhite:.2,tiger:.16,bull:.14,hammerhead:.12,mako:.2,thresher:.12,whaleShark:.18})[value]}:{}),colors:{...r.colors,coat:p[0],light:p[1],marking:p[2],...(key==='wormType'?{eye:value==='goauld'?'#b83d22':value==='earthworm'?'#bd963d':'#141510',band:value==='leech'?'#b8642c':'#c9805e'}:{})}};
    }
    const variantsFor = r => Object.entries(VARIANT_TYPES).filter(([,v])=>v.kind===r.kind&&r.morphology===(v.form || (v.kind==='whale'?'cetacean':v.kind==='worm'?'worm':'fish'))).map(([key,v])=>({key,...v}));
    const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    // Smooth value noise for ragged natural boundaries (no visible sine rhythm).
    const hash2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (hash2(i, j) * (1 - a) + hash2(i + 1, j) * a) * (1 - b) + (hash2(i, j + 1) * (1 - a) + hash2(i + 1, j + 1) * a) * b; };
    const fbm = (x, y, octaves = 4) => { let s = 0, k = 1, n = 0; for (let o = 0; o < octaves; o++) { s += vnoise(x * k + o * 17.3, y * k - o * 9.1) / k; n += 1 / k; k *= 2.03; } return s / n; };
    const toSrgb = c => Math.round(clamp(c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055, 0, 1) * 255);
    function profileAt(keys, t) {
        for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1][0]) {
            const a = keys[i], b = keys[i + 1], prev = keys[Math.max(0, i - 1)], next = keys[Math.min(keys.length - 1, i + 2)], u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
            return a.slice(1).map((v, k) => {
                const j = k + 1, dx = (b[j] - prev[j]) / (b[0] - prev[0]) * (b[0] - a[0]), dy = (next[j] - a[j]) / (next[0] - a[0]) * (b[0] - a[0]);
                const value = (2*u**3-3*u*u+1)*v + (u**3-2*u*u+u)*dx + (-2*u**3+3*u*u)*b[j] + (u**3-u*u)*dy;
                return clamp(value, Math.min(v, b[j]), Math.max(v, b[j]));
            });
        }
        return keys.at(-1).slice(1);
    }
    function marineConfig(r) {
        const mammal = r.morphology === 'cetacean', whale = r.kind === 'whale', shark = r.kind === 'shark', angler = r.kind === 'anglerfish';
        let type = shark ? r.sharkType : whale ? r.whaleType : r.kind === 'fish' ? r.fishType : r.kind;
        // Requiem/lamnid shark: a conical, slightly flattened snout, the deepest
        // section just behind the pectorals and a slender keeled peduncle.
        let profile = [[0,.003,.006,.009],[.035,.027,.025,.031],[.08,.052,.046,.056],[.16,.083,.074,.083],[.27,.106,.095,.098],[.42,.114,.104,.096],[.6,.088,.078,.07],[.76,.052,.046,.041],[.88,.024,.023,.02],[1,.013,.016,.012]];
        if (mammal && !whale) profile = [[0,.012,.011,.011],[.03,.022,.017,.019],[.06,.027,.022,.025],[.082,.031,.029,.03],[.105,.042,.056,.033],[.15,.058,.077,.040],[.25,.08,.092,.068],[.43,.088,.086,.077],[.65,.05,.065,.058],[.82,.022,.05,.046],[.93,.013,.034,.03],[1,.009,.018,.016]];
        if (whale) profile = [[0,.006,.008,.012],[.07,.052,.027,.034],[.17,.072,.045,.063],[.34,.087,.062,.095],[.50,.08,.061,.079],[.72,.04,.05,.05],[.88,.017,.034,.032],[1,.009,.016,.016]];
        if (type === 'blue') profile = [[0,.005,.008,.012],[.10,.056,.028,.031],[.28,.071,.047,.059],[.48,.068,.052,.06],[.7,.038,.045,.045],[.88,.016,.03,.028],[1,.009,.014,.014]];
        if (type === 'orca') profile = [[0,.008,.017,.014],[.045,.04,.046,.03],[.13,.069,.085,.052],[.30,.09,.105,.087],[.5,.075,.078,.064],[.75,.034,.05,.048],[.9,.016,.03,.028],[1,.009,.014,.014]];
        if (!mammal && !shark) profile = [[0,.006,.02,.018],[.07,.03,.062,.052],[.22,.048,.115,.095],[.42,.052,.12,.10],[.67,.031,.075,.066],[.87,.012,.03,.027],[1,.006,.015,.014]];
        if (type === 'tuna') profile = [[0,.003,.009,.011],[.09,.035,.056,.049],[.25,.065,.11,.091],[.43,.066,.105,.085],[.65,.036,.065,.052],[.87,.009,.02,.019],[1,.005,.012,.011]];
        if (type === 'salmon') profile = [[0,.006,.017,.014],[.08,.026,.042,.035],[.15,.034,.055,.046],[.30,.045,.08,.066],[.52,.04,.075,.06],[.76,.025,.045,.04],[1,.006,.021,.018]];
        if (angler) profile = [[0,.04,.055,.052],[.07,.10,.12,.10],[.26,.10,.13,.10],[.5,.068,.075,.058],[.78,.024,.032,.025],[1,.008,.013,.012]];
        const settings = { mammal, whale, shark, angler, type, profile, underslung: shark && type !== 'whaleShark', bony: !mammal && !shark && !angler, keel: shark ? ({greatWhite:.011,mako:.012,whaleShark:.01,tiger:.004})[type] || 0 : 0, hinge: shark ? .19 : whale ? .32 : mammal ? .15 : angler ? .14 : .09, gape: shark ? .085 : angler ? .14 : whale ? .055 : mammal ? .025 : .045,
            dorsalT: whale ? .68 : mammal ? .48 : .36, dorsal: whale ? .045 : mammal ? .10 : .13, pectoral: whale ? .31 : mammal ? .16 : shark ? .20 : .10,
            upperTail: mammal ? .19 : shark ? .19 : .14, lowerTail: mammal ? .19 : shark ? .16 : .14, tooth: shark || angler, serrated: shark && ['greatWhite','tiger','bull'].includes(type) };
        if (type === 'mako') { settings.profile = profile.map(p=>[p[0],p[1]*(p[0]<.2?.78:.86),p[2]*.84,p[3]*.84]); settings.dorsal = .09; settings.pectoral = .15; }
        if (type === 'hammerhead') { settings.dorsal = .18; settings.upperTail = .23; settings.lowerTail = .10; }
        if (type === 'tiger' || type === 'bull') { settings.profile = profile.map(p => [p[0], p[1] * (p[0]<.15?1.28:1.1), p[2] * .97, p[3]]); settings.profile[0][1]=.014; settings.upperTail = .23; settings.lowerTail = .11; }
        if (type === 'thresher') { settings.profile=profile.map(p=>[p[0],p[1]*.82,p[2]*.88,p[3]*.88]); settings.upperTail = .48; settings.lowerTail = .10; settings.pectoral = .20; }
        if (type === 'whaleShark') { settings.dorsalT = .43; settings.profile = [[0,.06,.012,.015],[.06,.095,.036,.037],[.25,.115,.09,.075],[.47,.10,.085,.073],[.72,.058,.048,.044],[1,.012,.017,.015]]; settings.tooth = false; settings.pectoral = .22; settings.upperTail = .23; settings.lowerTail = .16; }
        if (type === 'blue') { settings.pectoral = .15; settings.dorsal = .026; settings.dorsalT = .76; }
        if (type === 'orca') { settings.pectoral = .19; settings.dorsal = .23; settings.dorsalT = .40; settings.tooth = true; }
        if (type === 'reef') { settings.dorsalT = .42; settings.dorsal = .07; }
        if (type === 'salmon') { settings.dorsalT = .42; settings.dorsal = .075; }
        if (type === 'tuna') { settings.dorsal = .09; }
        return settings;
    }
    /** Weld shading across the parametric patch seams, preserving the open lips. */
    function marineNormals(mesh) {
        mesh.computeNormals(); const normals = new Map(), keys = [];
        for (let i = 0; i < mesh.p.length; i += 3) {
            const key = [0,1,2].map(k => Math.round(mesh.p[i+k]*1e8)).join(':'), n = normals.get(key) || [0,0,0];
            for (let k = 0; k < 3; k++) n[k] += mesh.n[i+k]; normals.set(key,n); keys.push(key);
        }
        keys.forEach((key,i) => mesh.n.splice(i*3,3,...norm(normals.get(key))));
    }
    /** Split indexed surface regions without overlays or changed edge bindings. */
    function surfaceRegions(C,part,pick){
        const keep=[],groups=new Map();
        for(let k=0;k<part.index.length;k+=3){
            const ids=Array.from(part.index.subarray(k,k+3)),center=[0,0,0];
            for(const i of ids)for(let a=0;a<3;a++)center[a]+=part.positions[i*3+a]/3;
            const name=pick(center);if(!name)keep.push(...ids);else{if(!groups.has(name))groups.set(name,[]);groups.get(name).push(...ids);}
        }
        part.index=Uint32Array.from(keep);
        for(const [name,indices]of groups){
            const used=[...new Set(indices)],map=new Map(used.map((v,i)=>[v,i])),patch={...part,name,index:Uint32Array.from(indices,i=>map.get(i))};
            for(const [field,stride]of [['positions',3],['normals',3],['colors',3],['joints',4],['weights',4],['uvs',2],['uvs1',2]])if(part[field]){const src=part[field],out=new src.constructor(used.length*stride);used.forEach((v,i)=>out.set(src.subarray(v*stride,v*stride+stride),i*stride));patch[field]=out;}
            C.parts.push(patch);
        }
    }
    function marine(C) {
        const { r,L,Y,colors,bone,rootBone,headBone,finish } = C, cfg = marineConfig(r), tail = [];
        const headZ = L*.29; C.bones[headBone].head = [0,Y,headZ]; C.bones[headBone].tail = [0,Y,L*.46];
        let parent = rootBone;
        for (let i = 0; i < 6; i++) { const z = L*(.07-i*.115), b = bone('Tail'+i,parent,[0,Y,z],[0,Y,z-L*.115],'tail',i*.5); tail.push({z,b}); parent=b; }
        const chain = [{z:headZ,b:headBone},{z:L*.12,b:rootBone},...tail];
        const bodySkin = p => {
            if (p[2]>=chain[0].z) return Props.rigid(headBone);
            for (let i=0;i<chain.length-1;i++) if (p[2]>=chain[i+1].z) { const t=clamp((chain[i].z-p[2])/(chain[i].z-chain[i+1].z),0,1); return {joints:[chain[i].b,chain[i+1].b,0,0],weights:[1-t,t,0,0]}; }
            return Props.rigid(parent);
        };
        const mouthFront = cfg.underslung ? .062 : cfg.shark ? .05 : 0;
        const jaw = bone('Jaw',headBone,[0,Y-L*.015,L*(.5-cfg.hinge)],[0,Y-L*.03,L*.48],'jaw');
        const section = t => {
            const q = profileAt(cfg.profile,t), head = 1+(r.headSize-1)*(1-ease(.1,.4,t));
            const snout = !cfg.whale ? (r.snoutLength-1)*.045*(1-ease(.045,.15,t)) : 0;
            const center = cfg.mammal ? -.012*ease(.50,1,t) : 0;
            const w = Math.max(.001,q[0])*L*r.girth*head*(!cfg.whale&&t<.1?r.snoutWidth:1), top = Math.max(.002,q[1])*L*r.chestDepth*head, bottom = Math.max(.002,q[2])*L*r.chestDepth*head;
            // An underslung shark mouth keeps its corner low under the eye instead of
            // curling up the flank into a grin; the split fades out behind the hinge.
            const face = cfg.underslung||cfg.bony ? 1-ease(cfg.hinge*.9,cfg.hinge+.07,t) : 1-ease(cfg.hinge*.65,cfg.hinge,t), lipDepth = cfg.underslung ? .5 : cfg.shark ? .45 : .22, upperY=Y+center*L-bottom*lipDepth*face;
            const gap = L*cfg.gape*r.jawOpen*(1-ease(cfg.hinge*.25,cfg.hinge,t));
            // A cetacean's tail stock flattens side to side into the flukes' root at its very end, so the flukes
            // grow out of it as one tail (not a thin rod meeting two separate blades).
            const paddle = cfg.mammal && r.tailLength > 0 ? ease(.86, .995, t) ** 1.5 : 0, wp = w * (1 + 1.7 * paddle) + L * .008 * paddle, sq = 1 - .3 * paddle;
            return {w:wp,top:(top+bottom*lipDepth*face)*sq,bottom:bottom*(1-lipDepth*face)*sq,upperY,lowerY:upperY-gap,z:L*(.5-t+snout),gap,face};
        };
        const skin = (p,lower,t) => {
            if (!lower || t>=cfg.hinge) return bodySkin(p);
            const w=1-ease(cfg.hinge*.5,cfg.hinge,t);
            return {joints:[headBone,jaw,0,0],weights:[1-w,w,0,0]};
        };
        // Shark coloration: a crisp, ragged countershading line (low on the
        // flank, below the eye on the head), a darker spine, faint mottling and,
        // on painted skin only, the small marks that sell it at close range.
        const sharkCoat=(p,t,s,y,detail)=>{
            const side=p[0]>=0?1:-1,type=cfg.type,crisp=({greatWhite:.03,mako:.028,thresher:.035,whaleShark:.05})[type]??.075;
            let line=t<.2?.13-ease(.1,.2,t)*.12:.01-.17*ease(.2,.42,t)+.13*ease(.7,.97,t);
            if(type==='greatWhite'||type==='thresher')line+=.12*Math.exp(-(((t-.37)/.035)**2));
            line+=(fbm(t*9+side*7.3,side*3.7+.5)-.5)*.36+(fbm(t*41+side*1.9,4.1+side)-.5)*.14;
            const belly=r.pattern==='solid'?0:1-ease(line-crisp,line+crisp,y);
            let c=mix(colors.main,colors.light,belly*r.patternAmount);
            c=mix(c,colors.mark,ease(.2,1,y)*.42*(1-belly));
            c=mix(c,colors.mark,Math.exp(-(((y-line-crisp*1.8)/(crisp*1.6))**2))*.22*r.patternAmount);
            const mottle=fbm(t*26+side*11,y*3.3+2)-.5;c=c.map(v=>v*(1+mottle*.2*(1-belly*.75)));
            if(type==='tiger'){const bar=Math.max(0,Math.cos((t*70+Math.sin(y*5)*.5+(fbm(t*6,y*1.5+side)-.5)*2.2)*r.patternScale))**16*ease(.3,.55,fbm(t*18,y*3+side*5))*ease(.1,.3,t);c=mix(c,colors.mark,bar*.7*ease(-.5,.1,y)*r.patternAmount*(1-ease(.55,.85,t)*.5));}
            if(type==='whaleShark'){const line=Math.exp(-(((((t*26+fbm(t*4,y+side)*.6)%1)-.5)/.05)**2))*ease(-.3,.1,y)*ease(.15,.25,t)*(1-ease(.75,.9,t));c=mix(c,colors.light,line*.55*r.patternAmount);}
            if(!detail)return {c,belly};
            const u=p[0]/Math.max(1e-6,s.w);
            // Eye orbit, ampullary pores on the snout, nostrils under it.
            c=c.map(v=>v*(1-.38*Math.exp(-(((t-.12)/.0095)**2)-(((y-.32)/.075)**2))));
            // Faint myomere chevrons over the flank and the pale lateral-line canal.
            const myo=Math.cos(Math.PI*2*(t*30-.9*Math.abs(y-.05)**.8))*ease(.3,.4,t)*(1-ease(.75,.9,t))*(1-belly);
            const lateral=Math.exp(-(((y-(.2-.08*t))/.016)**2))*ease(.24,.3,t)*(1-ease(.9,.97,t));
            c=c.map(v=>v*(1+myo*.035)); c=mix(c,mix(colors.main,colors.light,.3),lateral*.22*(1-belly));
            if(t<.13&&y>-.1&&y<.45){const gt=t*230,gy=(y+1)*26,ct=Math.floor(gt),cy=Math.floor(gy)+(side>0?0:500),h=hash2(ct,cy);if(h>.55){const dt=gt-ct-.5-(hash2(cy,ct)-.5)*.6,dy=gy-Math.floor(gy)-.5-(hash2(ct+3,cy+5)-.5)*.6;c=c.map(v=>v*(1-.4*Math.exp(-(dt*dt+dy*dy)*22)*(1-ease(.07,.13,t))));}}
            if(cfg.underslung&&y<0&&t>.022&&t<.05){const n=Math.exp(-(((Math.abs(u)-.42)/.07)**2)-(((t-.036)/.009)**2));c=c.map(v=>v*(1-.75*n));}
            if(type==='greatWhite'){
                c=mix(c,rgb('#101418'),Math.exp(-(((t-.322)/.011)**2)-(((y+.66)/.13)**2))*.9);
                for(const [t0,y0,t1,y1,w]of [[.27,.62,.39,.38,.0011],[.47,.55,.6,.47,.0009],[.64,.3,.7,.18,.0008],[.15,.7,.19,.52,.0007]]){
                    const dt=t1-t0,dy=(y1-y0)*.1,f=clamp(((t-t0)*dt+(y-y0)*.1*dy)/(dt*dt+dy*dy),0,1),d=Math.hypot(t-t0-dt*f,(y-y0)*.1-dy*f+Math.sin(f*5+side)*.0012);
                    if(side*(t0*13%2-1)<.5)c=mix(c,colors.light,Math.exp(-((d/w)**2))*.16*(1-belly));
                }
            }
            return {c,belly};
        };
        // Cetacean coloration: dolphin cape, mottled blue whale, ragged humpback
        // belly and the crisp orca patches, all on the painted chart.
        const whaleCoat=(p,t,s,y)=>{
            const side=p[0]>=0?1:-1,type=cfg.type,amount=r.pattern==='solid'?0:r.patternAmount,n=fbm(t*8+side*5,y*2+side)-.5;
            if(type==='orca'){
                const edge=.022,x=Math.abs(p[0])/Math.max(1e-6,s.w);
                let white=1-ease(-.55+n*.08-edge,-.55+n*.08+edge,y);
                // White throat and belly with flank lobes rising behind the dorsal fin.
                white=Math.max(white,(1-ease(-.05-edge,-.05+edge,y+.55*Math.exp(-(((t-.66)/.07)**2))-.55))*ease(.56,.6,t)*(1-ease(.74,.78,t)));
                white=Math.max(white,(1-ease(-.25-edge,-.25+edge,y))*(1-ease(.2,.3,t)));
                const eye=Math.hypot((t-.215)/.045,(y-.32-(t-.215)*1.2)/.1);white=Math.max(white,1-ease(1-edge*12,1+edge*12,eye));
                const saddle=ease(.25,.7,y)*Math.exp(-(((t-.5)/.05)**2))*(1-ease(.5,.9,x*0));
                let c=mix(colors.main,colors.light,white*amount);c=mix(c,mix(colors.main,colors.light,.45),saddle*.75*amount*(1-white));
                return {c,belly:white};
            }
            if(type==='blue'){
                const mottle=ease(.58,.72,fbm(t*38+side*9,y*9+side*3,3));
                let c=mix(colors.main,colors.light,(1-ease(-.7,-.1,y))*.35*amount);
                c=mix(c,mix(colors.main,colors.light,.55),mottle*.6*amount);c=mix(c,colors.mark,ease(.55,1,y)*.3);
                return {c,belly:1-ease(-.7,-.1,y)};
            }
            if(type==='humpback'){
                const line=-.42+n*.6,belly=1-ease(line-.05,line+.05,y),blotch=ease(.62,.7,fbm(t*20,y*6+side*4,3))*belly;
                let c=mix(colors.main,colors.light,belly*amount);c=mix(c,colors.main,blotch*.8);
                // Scars: pale rake marks in short parallel sets, and a few round healed bites.
                const rake=Math.exp(-(((((t*90+y*14+side*3)%3+3)%3-1.5)/.12)**2))*ease(.66,.72,fbm(t*9+side*4,y*2+7,2))*ease(.2,.3,t)*(1-ease(.85,.9,t))*(1-belly);
                const bite=ease(.86,.88,fbm(t*60+side*11,y*16+3,2))*(1-belly);
                c=mix(c,mix(colors.main,colors.light,.5),Math.max(rake*.7,bite*.3)*amount);
                return {c:c.map(v=>v*(1+(fbm(t*30,y*5)-.5)*.22+(fbm(t*140+side,y*20)-.5)*.08)),belly};
            }
            // Bottlenose: dark dorsal cape dipping under the fin, grey flank, pale belly.
            const cape=.42-.3*Math.exp(-(((t-.43)/.16)**2))+n*.1,line=-.32+n*.15;
            const belly=1-ease(line-.09,line+.09,y);
            let c=mix(colors.main,colors.light,belly*amount);c=mix(c,colors.mark,ease(cape-.06,cape+.06,y)*.75*amount);
            // A dark patch round the eye, a soft stripe from it back to the flipper, a darker top to the beak, a
            // faint pale blaze over the shoulder and fine skin mottling.
            const eye=Math.exp(-(((t-.135)/.032)**2)-(((y-.14)/.24)**2)),f=clamp((t-.14)/.15,0,1),stripe=Math.exp(-(((y-(.08-.36*f))/.1)**2))*ease(.13,.16,t)*(1-ease(.26,.3,t));
            c=mix(c,mix(colors.main,colors.mark,.85),Math.max(eye*.9,stripe*.6)*Math.max(.6,amount));
            c=mix(c,colors.mark,(1-ease(.07,.1,t))*ease(-.2,.25,y)*.55*amount);
            c=mix(c,mix(colors.main,colors.light,.35),Math.exp(-(((t-.36)/.06)**2)-(((y-.12)/.12)**2))*.35*amount*(1-belly));
            return {c:c.map(v=>v*(1+(fbm(t*60+side*3,y*8)-.5)*.06)),belly};
        };
        // Bony fish coloration: per-type markings with a lateral line.
        const fishCoat=(p,t,s,y,detail)=>{
            const side=p[0]>=0?1:-1,type=cfg.type,amount=r.pattern==='solid'?0:r.patternAmount,n=fbm(t*9+side*3,y*2)-.5;
            const lateral=.28-.12*Math.sin(t*Math.PI)*(1-t)+(cfg.angler?9:0);
            if(type==='tuna'){
                const line=.02+n*.06,belly=1-ease(line-.025,line+.025,y);
                let c=mix(colors.main,colors.light,belly*amount);
                c=mix(c,rgb('#d2b640'),Math.exp(-(((y-line-.07)/.05)**2))*ease(.1,.2,t)*(1-ease(.75,.9,t))*.75*amount);
                const bars=Math.exp(-((((t*34+side*.3)%1-.5)/.12)**2))*ease(-.75,-.35,y)*(1-ease(-.15,0,y))*ease(.35,.45,t)*(1-ease(.8,.9,t));
                const dots=ease(.55,.75,vnoise(t*120,y*14));c=mix(c,mix(colors.light,[1,1,1],.4),bars*dots*.5*amount);
                return {c,belly};
            }
            if(type==='salmon'){
                const line=-.12+n*.1,belly=1-ease(line-.12,line+.12,y);
                let c=mix(colors.main,mix(colors.light,[.9,.92,.94],.4),belly*amount);
                // Small dark X-shaped spots above the lateral line.
                const gt=t*55,gy=(y+1)*7,ct=Math.floor(gt),cy=Math.floor(gy),h=hash2(ct+side*300,cy),dt=gt-ct-.5-(hash2(cy,ct)-.5)*.45,dy=gy-cy-.5-(hash2(ct+7,cy+3)-.5)*.45,q=.6+hash2(ct+2,cy+9)*.5;
                const cross=Math.max(Math.exp(-(((dt-dy)/(.07*q))**2)),Math.exp(-(((dt+dy)/(.07*q))**2)))*ease(.22*q,.14*q,Math.hypot(dt,dy))*(h>.5?1:0);
                c=mix(c,rgb('#15191a'),cross*ease(-.05,.25,y)*.85*amount);
                return {c,belly};
            }
            if(cfg.angler){
                let c=mix(colors.main,colors.light,(1-ease(-.6,0,y+n*.4))*.5*amount);
                c=mix(c,colors.mark,ease(.55,.75,fbm(t*22+side*3,y*5,3))*.6*amount);
                c=mix(c,colors.light,ease(.66,.8,fbm(t*14-side*3,y*4+9,3))*.35*amount);
                return {c:c.map(v=>v*(1+(vnoise(t*160,y*30)-.5)*.25)),belly:0};
            }
            // Reef fish (snapper/grunt family): warm back fading to a silvery belly,
            // a few broken dark bars and a dark band through the eye.
            const line=-.05+n*.15,belly=1-ease(line-.22,line+.22,y);
            let c=mix(colors.main,colors.light,belly*amount);
            const bar=Math.exp(-(((((t-.27)*6.5%1+1)%1-.5)/.17)**2))*ease(.25,.32,t)*(1-ease(.78,.86,t))*ease(.3,.6,fbm(t*14,y*3+side*2));
            c=mix(c,colors.mark,(bar*.55*ease(-.5,.2,y)+Math.exp(-(((t-.125)/.018)**2))*ease(-.9,-.1,y)*.6)*amount);
            return {c,belly};
        };
        const tint = (p,normal,detail=false) => {
            const t=clamp(.5-p[2]/L,0,1), s=section(t), y=(p[1]-s.upperY)/Math.max(s.top,s.bottom), noise=Math.sin(p[2]/L*97+Math.sin(p[0]/L*52))*0.035;
            let belly=1-ease(-.36+noise,.04+noise,y), color=mix(colors.main,colors.light,r.pattern==='solid'?0:belly*r.patternAmount);
            if (cfg.shark) {
                const coat=sharkCoat(p,t,s,y,detail);belly=coat.belly;color=coat.c;
                if(r.pattern==='solid'||r.pattern==='countershade')return color;
            } else if (cfg.mammal) {
                const coat=whaleCoat(p,t,s,y);belly=coat.belly;color=coat.c;
                if(r.pattern==='solid'||r.pattern==='countershade')return color;
            } else if (['reef','tuna','salmon'].includes(cfg.type)||cfg.angler) {
                const coat=fishCoat(p,t,s,y,detail);belly=coat.belly;color=coat.c;
                if(r.pattern==='solid'||r.pattern==='countershade'||(cfg.angler&&r.pattern==='spots'))return color;
            } else if (cfg.type==='tiger' || r.pattern==='stripes') {
                const mark=Math.max(0,Math.cos((t*65+Math.sin(y*6)*.6)*r.patternScale))**8;
                color=mix(color,colors.mark,mark*.55*ease(-.4,.1,y)*r.patternAmount);
            } else if (cfg.type==='tuna') {
                const stripe=Math.exp(-(((y-.05)/.16)**2)); color=mix(color,rgb('#c6ad42'),stripe*.7*r.patternAmount);
            } else if (cfg.type==='salmon' || cfg.angler || r.pattern==='spots') {
                const dots=Math.max(0,Math.sin(p[0]/L*197)*Math.cos(t*211)*Math.sin(y*53)-.65);
                color=mix(color,colors.mark,dots*.65*ease(-.4,.2,y)*r.patternAmount);
            }
            if(r.pattern==='solid')return colors.main;
            // Optional alien markings work on the swimmer's own surface too.
            const scale=r.patternScale,x=p[0]/L,z=p[2]/L;
            let mark=0;
            if(r.pattern==='stripes'||r.pattern==='tabby')mark=Math.max(0,Math.cos((t*65+Math.sin(y*6)*.6)*scale))**8;
            if(['spots','rosettes','dapple'].includes(r.pattern)){
                const spot=(Math.sin(x*137*scale)*Math.cos(t*211*scale)*Math.sin(y*43*scale)+1)*.5;
                mark=r.pattern==='rosettes'?Math.exp(-(((spot-.7)/.075)**2))*.65:ease(.76,.9,spot)*.7;
            }
            if(r.pattern==='piebald')mark=ease(.15,.38,Math.sin(t*19*scale+Math.sin(y*5))+Math.sin(x*31*scale));
            if(r.pattern==='saddle')mark=ease(.15,.6,y)*ease(.2,.3,t)*(1-ease(.65,.8,t));
            if(r.pattern==='socks'||r.pattern==='points')mark=(1-ease(.08,.22,t))+ease(.72,.9,t);
            if(r.pattern==='scales')mark=(Math.cos(t*240*scale)*Math.cos(y*70*scale)+1)*.13;
            return mix(color,colors.mark,clamp(mark*r.patternAmount*(1-belly*.65),0,.8));
        };
        // The shark's mouth starts below a closed snout, rather than splitting
        // the tip of its nose into two crocodile-like jaws.
        const frontCurve = (t,u) => cfg.shark ? L*.01*(1-u*u)*(1-ease(mouthFront,mouthFront+.035,t)) : 0;
        const jawSetback = cfg.underslung ? .008 : cfg.shark ? .004 : .012;
        // Sharks carry their coloration in a painted chart (crisp countershading,
        // pores, scars); their vertex colors keep only the gill-fold shading.
        const painted=true, vcolor=(p,n)=>painted?[1,1,1]:tint(p,n), extraUV=[];
        const mesh=new Props.ExactMesh(), rings=[], steps=C.save?100:72, sides=cfg.whale?(C.save?64:40):(C.save?32:24);
        const tri=(a,b,c)=>mesh.tri(a,b,c);
        // Put an exact ring at the jaw hinge; the two lip sheets meet there.
        // Extra axial samples model the branchial folds in the continuous skin.
        // Their positions and bindings also remain the source for every fin root.
        const gillRows = cfg.mammal ? [] : Array.from({length:C.save?113:89},(_,i)=>.182+i/(C.save?112:88)*.128);
        const ts=[...new Set(Array.from({length:steps+1},(_,i)=>i/steps).concat(cfg.hinge,mouthFront,gillRows))].sort((a,b)=>a-b);
        const gillShape = (t,y) => {
            const end = 1-ease(.62,.86,Math.abs(y));
            let relief=0, shadow=0;
            for(let g=0;g<(cfg.shark?5:1);g++) {
                const center=cfg.shark?.20+g*.022+.007*y*y:.216+.027*Math.sqrt(Math.max(0,1-(y/.86)**2));
                const d=t-center, width=cfg.shark?.0018:.0024;
                const fold=Math.exp(-((d/width)**2));
                const lip=Math.exp(-(((d-width*1.8)/(width*.9))**2));
                relief += end*(-fold*(cfg.shark?.0058:.0045)+lip*(cfg.shark?.0026:.0018) + fold*.00018*Math.sin(y*210));
                shadow = Math.max(shadow,fold*end);
            }
            return {relief,shadow};
        };
        for (const t of ts) {
            const s=section(t), row=[];
            for (const lower of [false,true]) {
                const ids=[];
                for(let k=0;k<=sides;k++) {
                    const a=k/sides*Math.PI, x=Math.cos(a)*s.w, nose=lower&&t<mouthFront;
                    const y=nose?s.upperY-s.bottom*Math.sin(a)*(1-ease(mouthFront*.45,mouthFront,t)):(lower?s.lowerY:s.upperY)+(lower?-s.bottom:s.top)*Math.sin(a);
                    const z=s.z+(lower&&!nose?frontCurve(t,Math.cos(a))-L*jawSetback*s.face:0),p=[x,y,z];
                    const pleat=cfg.whale&&cfg.type!=='orca'&&lower?((Math.cos((Math.cos(a)+1)*Math.PI*11)+1)*.5)**8*ease(.02,.08,t)*(1-ease(.35,.49,t)):0;
                    p[1]+=L*.001*pleat;
                    // Lateral caudal keels stiffen the peduncle of fast lamnid sharks.
                    // Shark musculature: the epaxial mass swells the upper flank, a shallow
                    // groove follows the horizontal septum along the lateral line.
                    if(cfg.shark&&!cfg.mammal){const yy=(lower?-1:1)*Math.sin(a),span=ease(.22,.34,t)*(1-ease(.7,.86,t)),bulge=L*(.0032*Math.exp(-(((yy-.45)/.22)**2))+.0018*Math.exp(-(((yy+.5)/.25)**2))-.0016*Math.exp(-(((yy-.04)/.07)**2)))*span;p[0]+=Math.cos(a)*bulge;p[1]+=(lower?-1:1)*Math.sin(a)*bulge;}
                    if(cfg.keel)p[0]+=Math.sign(Math.cos(a)||1)*cfg.keel*L*ease(.8,.9,t)*(1-ease(.975,1,t))*Math.exp(-((Math.sin(a)/.16)**2));
                    const normal=norm([Math.cos(a)/Math.max(s.w,1e-5),(lower?-1:1)*Math.sin(a)/Math.max(lower?s.bottom:s.top,1e-5),0]);
                    const gill=!cfg.mammal&&t>.182&&t<.31?gillShape(t,(lower?-1:1)*Math.sin(a)):{relief:0,shadow:0};
                    const color=painted?mix([1,1,1],rgb('#2e2629'),gill.shadow*(cfg.shark?.78:.62)):mix(mul(tint(p,normal),1-pleat*.15),rgb('#45383c'),gill.shadow*.72);
                    const bind=skin(p,lower&&!nose,t);
                    ids.push(mesh.vertex(add(p,mul(normal,gill.relief*L)),normal,color,bind));
                }
                row.push(ids);
            }
            rings.push(row);
        }
        const frontRow=ts.indexOf(mouthFront), noseLip=[];
        if(mouthFront>0){
            const s=section(mouthFront);
            for(let k=0;k<=sides;k++){
                const u=Math.cos(k/sides*Math.PI),p=[u*s.w,s.upperY,s.z+frontCurve(mouthFront,u)];
                noseLip.push(mesh.vertex(p,[0,-1,0],vcolor(p,[0,-1,0]),bodySkin(p)));extraUV.push([noseLip.at(-1),mouthFront,k/sides*.5]);
            }
        }
        for(let row=0;row<rings.length-1;row++) for(let half=0;half<2;half++) for(let k=0;k<sides;k++) {
            const next=half&&mouthFront>0&&row+1===frontRow?noseLip:rings[row+1][half];
            const a=rings[row][half][k],b=next[k],c=rings[row][half][k+1],d=next[k+1];
            if(half) {tri(a,c,b);tri(c,d,b);} else {tri(a,b,c);tri(c,b,d);}
        }
        for(const end of [0,rings.length-1]) for(let half=0;half<2;half++) {
            const s=section(ts[end]), lower=!!half, center=[0,lower&&!(mouthFront>0&&end===0)?s.lowerY:s.upperY,s.z-(lower&&!(mouthFront>0&&end===0)?L*jawSetback*s.face:0)], n=[0,0,end? -1:1];
            const v=mesh.vertex(center,n,vcolor(center,n),skin(center,lower,ts[end]));extraUV.push([v,ts[end],lower?.75:.25]);
            for(let k=0;k<sides;k++) { const a=rings[end][half][k],b=rings[end][half][k+1]; (end===0)!==lower?tri(v,a,b):tri(v,b,a); }
        }
        if(mouthFront>0){
            const s=section(mouthFront),lip=[];
            for(let k=0;k<=sides;k++){
                const u=Math.cos(k/sides*Math.PI),p=[u*s.w,s.lowerY,s.z+frontCurve(mouthFront,u)-L*jawSetback*s.face];
                lip.push(mesh.vertex(p,[0,0,1],vcolor(p,[0,0,1]),skin(p,true,mouthFront)));extraUV.push([lip.at(-1),mouthFront,1-k/sides*.5]);
            }
            for(let k=0;k<sides;k++){
                if(k>0)mesh.tri(lip[k],lip[k+1],rings[frontRow][1][k]);
                if(k<sides-1)mesh.tri(lip[k+1],rings[frontRow][1][k+1],rings[frontRow][1][k]);
            }
        }
        const axialUVs = new Float32Array(mesh.p.length / 3 * 2);
        for(let i=0;i<rings.length;i++)for(let half=0;half<2;half++)for(let k=0;k<=sides;k++){const v=rings[i][half][k];axialUVs[v*2]=ts[i];axialUVs[v*2+1]=half?1-k/sides*.5:k/sides*.5;}
        if(painted)for(const [v,t,u]of extraUV){axialUVs[v*2]=t;axialUVs[v*2+1]=u;}
        marineNormals(mesh);
        const bodyPart=finish(mesh,'Body',{kind:'aquatic',roughness:cfg.mammal?.50:.54,metalness:cfg.type==='tuna'?.18:0,normalScale:cfg.mammal?.06:cfg.shark?.09:.18});
        if(r.kind==='fish'){bodyPart.uvs=axialUVs;bodyPart.axialSurface=true;}
        if(painted){
            // Coloration on the axial chart; dermal denticles tile finely on the second set.
            // Fish scales stay one chart over the body; shark denticles and whale skin tile finely.
            const [ku,kv]=cfg.shark?[9,4]:cfg.mammal?[6,3]:cfg.angler?[8,4]:[1,1];
            bodyPart.uvs=axialUVs;bodyPart.uvs1=axialUVs.map((v,i)=>v*(i%2?kv:ku));bodyPart.paintedSurface=true;
            if(cfg.shark){bodyPart.roughness=.72;bodyPart.normalScale=.32;}
            C.paintMarkings=(width,height)=>{
                const data=new Uint8Array(width*height*4);
                for(let i=0;i<width;i++){
                    const t=(i+.5)/width,s=section(t);
                    for(let j=0;j<height;j++){
                        const v=(j+.5)/height,upper=v<.5,a=(upper?v:1-v)*Math.PI*2;
                        const p=[Math.cos(a)*s.w,upper?s.upperY+s.top*Math.sin(a):s.lowerY-s.bottom*Math.sin(a),s.z];
                        const c=tint(p,null,true),k=(j*width+i)*4;
                        data[k]=toSrgb(c[0]);data[k+1]=toSrgb(c[1]);data[k+2]=toSrgb(c[2]);data[k+3]=255;
                    }
                }
                return {width,height,data,repeat:true};
            };
        }
        if(!cfg.mammal) surfaceRegions(C,bodyPart,p=>{
            const t=clamp(.5-p[2]/L,0,1),q=section(t),y=(p[1]-(p[1]<q.lowerY?q.lowerY:q.upperY))/Math.max(.00001,p[1]<q.lowerY?q.bottom:q.top);
            return t>.185&&t<.308&&Math.abs(y)<.90 ? (cfg.shark?'Gill folds':'Operculum folds') : null;
        });
        if(cfg.whale&&cfg.type!=='orca'){
            const kept=[],pleats=[];
            for(let t=0;t<bodyPart.index.length;t+=3){const ids=Array.from(bodyPart.index.subarray(t,t+3)),p=ids.reduce((a,i)=>add(a,mul(Array.from(bodyPart.positions.subarray(i*3,i*3+3)),1/3)),[0,0,0]),s=section(clamp(.5-p[2]/L,0,1));(p[2]>L*.02&&p[2]<L*.46&&p[1]<s.lowerY-L*.007?pleats:kept).push(...ids);}
            bodyPart.index=Uint32Array.from(kept);
            const used=[...new Set(pleats)],map=new Map(used.map((v,i)=>[v,i])),patch={name:'Ventral pleats',kind:'aquatic',roughness:.55,normalScale:.04,paintedSurface:bodyPart.paintedSurface,index:Uint32Array.from(pleats,i=>map.get(i))};
            for(const [field,stride]of [['positions',3],['normals',3],['colors',3],['joints',4],['weights',4],['uvs',2],['uvs1',2]])if(bodyPart[field]){const src=bodyPart[field],out=new src.constructor(used.length*stride);used.forEach((v,i)=>out.set(src.subarray(v*stride,v*stride+stride),i*stride));patch[field]=out;}C.parts.push(patch);
        }
        // Sample the very triangles used above, in their parametric chart.
        // This avoids repeated whole-body ray scans and keeps small markings
        // off the exact faceted surface rather than an approximate ellipsoid.
        const surface = (t,u,lower=false,lift=0) => {
            let row=0;while(row<ts.length-2&&t>ts[row+1])row++;
            const ft=clamp((t-ts[row])/(ts[row+1]-ts[row]),0,1),q=clamp(u,0,1)*sides,k=Math.min(sides-1,Math.floor(q)),fu=q-k,half=lower?1:0;
            const next=lower&&mouthFront>0&&row+1===frontRow?noseLip:rings[row+1][half];
            const a=rings[row][half][k],b=next[k],c=rings[row][half][k+1],d=next[k+1];
            const ids=ft+fu<=1?[a,b,c]:[d,c,b],w=ft+fu<=1?[1-ft-fu,ft,fu]:[ft+fu-1,1-ft,1-fu];
            const p=[0,0,0],n=[0,0,0];for(let j=0;j<3;j++)for(let k=0;k<3;k++){p[k]+=mesh.p[ids[j]*3+k]*w[j];n[k]+=mesh.n[ids[j]*3+k]*w[j];}
            return add(p,mul(norm(n),lift));
        };
        const onSide=(t,sign,y,lift=0)=>surface(t,sign>0?Math.asin(Math.abs(y))/Math.PI:1-Math.asin(Math.abs(y))/Math.PI,y<0,lift);
        // Real upper palate and lower mouth floor close the cavity behind the
        // lips. Teeth are embedded in these gum margins, never on a face decal.
        const inside=new Props.ExactMesh(), gums=new Props.ExactMesh(), lipRows=[[],[]], mouthN=32, crossN=sides;
        for(let half=0;half<2;half++) {
            const rows=[];
            for(let i=0;i<=mouthN;i++) {
                const t=mouthFront+i/mouthN*(cfg.hinge-mouthFront), s=section(t), row=[];
                for(let k=0;k<=crossN;k++) {
                    const u=-Math.cos(k/crossN*Math.PI),p=[u*s.w,(half?s.lowerY:s.upperY)+(half?-1:1)*L*.009*(1-u*u)*s.face*ease(mouthFront,mouthFront+.03,t),s.z+frontCurve(t,u)-(half?L*jawSetback*s.face:0)];
                    row.push(inside.vertex(p,[0,half?1:-1,0],cfg.underslung?mix(rgb('#7a5c5b'),rgb('#2c2224'),ease(.3,.95,i/mouthN)*.8+(1-Math.abs(u))*.15):rgb('#241d22'),skin(p,!!half,t)));
                }
                rows.push(row);
            }
            for(let i=0;i<mouthN;i++)for(let k=0;k<crossN;k++){const a=rows[i][k],b=rows[i+1][k],c=rows[i][k+1],d=rows[i+1][k+1];inside.tri(a,b,c);inside.tri(c,b,d);}
            // One continuous arch: left rear → front teeth → right rear.
            for(const sign of [-1,1]) {
                const path=Array.from({length:49},(_,i)=>{
                    const t=cfg.hinge-(cfg.hinge-mouthFront)*i/48,s=section(t);
                    return {p:[sign*s.w,half?s.lowerY:s.upperY,s.z-(half?L*jawSetback*s.face:0)],t};
                });
                if(sign<0){
                    lipRows[half].push(...path);
                    const s=section(mouthFront);
                    for(let k=1;k<sides;k++){
                        const u=-Math.cos(k/sides*Math.PI);
                        lipRows[half].push({p:[u*s.w,half?s.lowerY:s.upperY,s.z+frontCurve(mouthFront,u)-(half?L*jawSetback*s.face:0)],t:mouthFront});
                    }
                }else lipRows[half].push(...path.reverse());
            }
            // Shark gums sit just inside the jaw edge, not as a pink outline on the lips.
            const gumPath=lipRows[half].map((q,k,all)=>{
                if(!cfg.underslung)return q.p;
                const d=norm(sub(all[Math.min(all.length-1,k+1)].p,all[Math.max(0,k-1)].p)),out=norm([-d[2],0,d[0]]);
                return add(q.p,add(mul(out,-L*.0024),[0,(half?-1:1)*L*.0011,0]));
            });
            gums.tube(gumPath,lipRows[half].map(()=>L*(cfg.underslung?.0019:cfg.shark?.0014:cfg.whale?.0018:.0008)),7,cfg.underslung?rgb('#6e5354'):cfg.tooth?rgb('#665154'):colors.mark,p=>skin(p,!!half,clamp(.5-p[2]/L,0,cfg.hinge)));
        }
        finish(inside,'Mouth interior',{kind:'mouth',roughness:.9,doubleSided:true,noSurfaceDetail:true});
        finish(gums,'Gum margins',{kind:'mouth',roughness:.62,noSurfaceDetail:true});
        if(cfg.whale&&cfg.type!=='orca'&&r.jawOpen>.01){
            // Baleen: a comb of dark plates hanging from the upper jaw just inside the lip, fringed paler at their ends.
            const baleen=new Props.ExactMesh(),path=lipRows[0].filter(q=>q.t>mouthFront+.01&&q.t<cfg.hinge*.92);
            for(let k=0;k<path.length;k++){const q=path[k],s=section(q.t),drop=Math.min(L*.03,s.gap*.85+L*.002);if(drop<L*.002)continue;
                const inward=[-Math.sign(q.p[0]||1)*L*.004,0,0],top=add(q.p,inward),bot=add(top,[0,-drop,0]);
                baleen.tube([top,lerp(top,bot,.7),bot],[L*.0016,L*.0012,L*.0004],5,(t2)=>mix(rgb('#2a2622'),rgb('#8a7c66'),ease(.6,1,t2)),skin(top,false,q.t));}
            finish(baleen,'Baleen',{kind:'mouth',roughness:.8,noSurfaceDetail:true});
        }
        if(cfg.tooth && r.toothSize>0 && r.jawOpen>0.01) {
            const teeth=new Props.ExactMesh(), toothColor=rgb('#e7e0cb'), rows=cfg.shark?2:1, number=cfg.underslung?34:cfg.shark?28:cfg.angler?26:32;
            for(let half=0;half<2;half++){
                const path=lipRows[half],lengths=[0];
                for(let k=1;k<path.length;k++)lengths.push(lengths.at(-1)+Math.hypot(...sub(path[k].p,path[k-1].p)));
                const total=lengths.at(-1),spacing=total/number;
                for(let rank=0;rank<rows;rank++)for(let i=0;i<number;i++) {
                    const at=(i+.5+(rank%2)*.18)*spacing;let j=1;
                    while(j<path.length-1&&lengths[j]<at)j++;
                    const f=clamp((at-lengths[j-1])/(lengths[j]-lengths[j-1]),0,1),t=path[j-1].t+(path[j].t-path[j-1].t)*f,s=section(t);
                    const tangent=norm(sub(path[j].p,path[j-1].p)),outward=norm([-tangent[2],0,tangent[0]]);
                    const anterior=1-ease(mouthFront,mouthFront+(cfg.hinge-mouthFront)*.85,t);
                    // Underslung shark jaws: upper teeth hang just outside the narrower
                    // lower row, so a nearly closed mouth still shows their serrated tips;
                    // the replacement row lies folded back against the gum.
                    const full=L*(cfg.type==='mako'?.027:.023)*(0.65+anterior*.35)*r.toothSize;
                    const length=(cfg.underslung?Math.min(full,half?s.gap*.5+L*.0015:s.gap*.62+L*.003):Math.min(full,s.gap*(half?.43:.48)))*(1-rank*(cfg.underslung?.3:.20));
                    if(length<L*.0004)continue;
                    const width=Math.min(length*(cfg.serrated?(half?.7:1.02):cfg.underslung?.5:.34),spacing*(cfg.underslung?.94:.90));
                    const center=sub(lerp(path[j-1].p,path[j].p,f),mul(outward,L*(cfg.underslung?(half?.0035:.0008)+rank*.004:.00045+rank*.003)));
                    const corner=mul(tangent,center[0]>0?1:-1);
                    const top=cfg.underslung?add(add(center,mul(outward,-length*(.1+rank*.55))),add([0,(half?1:-1)*length*(1-rank*.4),-length*.04],mul(corner,length*(1-anterior)*(half?.08:.22)))):add(sub(center,mul(outward,length*.12)),[0,(half?1:-1)*length,-length*.06]);
                    const a=add(center,mul(tangent,-width*.5)),b=add(center,mul(tangent,width*.5));
                const outline=[a];
                // Small edge notches create actual serrations in silhouette.
                for(let k=1;k<7;k++){const p=lerp(a,top,k/7);outline.push(add(p,mul(tangent,(cfg.serrated?(k%2?-.045:.015):0)*width)));}
                outline.push(top);
                for(let k=6;k>0;k--){const p=lerp(b,top,k/7);outline.push(add(p,mul(tangent,(cfg.serrated?(k%2?.045:-.015):0)*width)));}
                outline.push(b);
                const skinning=skin(center,!!half,t), depth=length*.11, fronts=[], mid=mul(add(add(a,b),top),1/3);
                // Enamel pales toward the tip from a gum-tinted base; normals bow
                // outward from the blade's middle so each crown catches light.
                const enamel=q=>cfg.underslung?mix(rgb('#c9b2a4'),rgb('#f1ece0'),ease(0,.25,Math.abs(q[1]-center[1])/Math.max(1e-6,length))):toothColor;
                const bow=(q,side)=>cfg.underslung?norm(add(mul(outward,side),mul(sub(q,mid),.6/Math.max(1e-6,length)))):mul(outward,side);
                for(const side of [-1,1]) {
                    const ids=outline.map(p=>teeth.vertex(add(p,mul(outward,side*depth)),bow(p,side),enamel(p),skinning)); fronts.push(ids);
                    const c=teeth.vertex(add(mid,mul(outward,side*depth)),mul(outward,side),enamel(mid),skinning);
                    for(let k=0;k<ids.length;k++){const j=(k+1)%ids.length;side>0?teeth.tri(c,ids[k],ids[j]):teeth.tri(c,ids[j],ids[k]);}
                }
                for(let k=0;k<outline.length;k++){const j=(k+1)%outline.length;teeth.tri(fronts[0][k],fronts[1][k],fronts[0][j]);teeth.tri(fronts[0][j],fronts[1][k],fronts[1][j]);}
            }
            }
            finish(teeth,'Teeth',{kind:'tooth',roughness:.28,noSurfaceDetail:true});
        }
        // Rounded hydrofoil sections swept along curved, tapered span lines.
        const fin=(name,stations,parent,role,phase=0,white=false)=> {
            const finColor=cfg.type==='tuna'&&/Finlet|Second dorsal|Anal fin/.test(name)?rgb('#d9b94b'):colors.main;
            const pts=stations.map(s=>[s[0]*L,s[1]*L+Y,s[2]*L]), b=bone(name,parent,pts[0],pts[Math.floor(pts.length/2)],role,phase), m=new Props.ExactMesh(), frames=[];
            m.loft(C.save?33:25,(_,t)=>{
                const a=profileAt(stations.map((s,i)=>[i/(stations.length-1),...s]),t), center=[a[0]*L,Y+a[1]*L,a[2]*L];
                const ds=.002,pa=profileAt(stations.map((s,i)=>[i/(stations.length-1),...s]),Math.max(0,t-ds)),pb=profileAt(stations.map((s,i)=>[i/(stations.length-1),...s]),Math.min(1,t+ds)),axis=norm(sub(pb,pa));
                const x=role==='dorsal'?[0,0,1]:norm(sub([0,0,1],mul(axis,axis[2]))),y=role==='dorsal'?[1,0,0]:norm(cross(axis,x));
                const frame={center,x,y,rx:Math.max(L*.0003,a[3]*L*.5),ry:Math.max(L*.0002,a[4]*L)};frames.push(frame);return frame;
            },C.save?20:16,(t,a,p)=>{
                const fr=frames[Math.round(t*((C.save?33:25)-1))];
                const under=white&&(cfg.mammal&&cfg.type!=='humpback'&&fr?Math.sin(a)*fr.y[1]<-.15:p[1]<Y+profileAt(stations.map((s,i)=>[i/(stations.length-1),...s]),t)[1]*L);
                if(cfg.type==='humpback'&&role==='fin')return under?mix(colors.light,colors.main,.08*ease(.6,.75,fbm(p[0]/L*60,p[2]/L*60))):mix(colors.light,colors.main,.25+.45*ease(.45,.7,fbm(p[0]/L*40+3,p[2]/L*40)));
                if(!cfg.shark)return under?colors.light:mix(finColor,colors.mark,Math.min(1,t)*.12);
                // Shark fins: dark above with a darker trailing margin; paired fins pale
                // below with dusky (great white: black) tips.
                const trailing=ease(-.55,-.95,Math.cos(a));
                // The grey of the upper side wraps the rounded leading edge; the pale underside
                // keeps a dusky margin.
                const leading=ease(.62,.92,Math.cos(a));
                if(under){const tip=ease(.7,.97,t)*(cfg.type==='greatWhite'?.92:cfg.type==='mako'||cfg.type==='whaleShark'?.2:.45);return mix(mix(mix(colors.light,colors.main,trailing*.5+ease(.55,.95,t)*.25),mix(colors.main,colors.mark,.28),leading),rgb('#14181c'),tip*(1-leading));}
                return mix(mix(colors.main,colors.mark,.28+t*.3),colors.mark,trailing*.35);
            },p=>{
                const along=clamp(dot(sub(p,pts[0]),sub(pts.at(-1),pts[0]))/Math.max(1e-12,dot(sub(pts.at(-1),pts[0]),sub(pts.at(-1),pts[0]))),0,1), w=ease(0,.32,along);
                const base=bodySkin(p),weights=new Map([[b,w]]);
                for(let k=0;k<4;k++){const j=base.joints[k]||0;weights.set(j,(weights.get(j)||0)+(base.weights[k]||0)*(1-w));}
                const top=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,p)=>s+p[1],0);return{joints:top.map(p=>p[0]),weights:top.map(p=>p[1]/sum)};
            },true);
            if(cfg.type==='humpback'&&role==='fin'){
                // A humpback's flipper: a row of knobs (tubercles) along its scalloped leading edge.
                const knobs=new Props.ExactMesh();
                for(let row=8;row<frames.length-2;row+=2){const f=frames[row],q=add(f.center,mul(f.x,f.rx*.9));knobs.sphere(q,Math.max(L*.0016,f.ry*1.5),mix(colors.light,colors.main,.15),Props.rigid(b),6,8,[1,.8,1]);}
                // Barnacles crust the flipper's tip and leading edge.
                let sd=name.length*31+7;const rn=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;};
                for(let k=0;k<26;k++){const row=Math.floor(frames.length*(.55+.42*rn())),f=frames[Math.min(frames.length-1,row)],a=(rn()-.3)*1.6,q=add(f.center,add(mul(f.x,Math.cos(a)*f.rx*.95),mul(f.y,Math.sin(a)*f.ry*.9))),nr=norm(add(mul(f.x,Math.cos(a)),mul(f.y,Math.sin(a)*3))),rr=L*(.0012+.0012*rn());
                    knobs.tube([add(q,mul(nr,-rr*.3)),add(q,mul(nr,rr*.7))],[rr,rr*.55],6,mix(rgb('#cfc8b8'),rgb('#8a8478'),rn()*.6),Props.rigid(b));knobs.sphere(add(q,mul(nr,rr*.68)),rr*.3,rgb('#2a2622'),Props.rigid(b),4,6,[1,.4,1]);}
                finish(knobs,name+' tubercles',{kind:'aquatic',roughness:.5,noSurfaceDetail:true});
            }
            if(cfg.shark){
                // Cambered hydrofoil sections: thick and rounded at the leading edge,
                // thinning to a fine trailing edge, instead of a lenticular blade.
                const sideCount=C.save?20:16;
                frames.forEach((f,row)=>{for(let k=0;k<sideCount;k++){
                    const a=k/sideCount*Math.PI*2,u=Math.cos(a),q=(1-u)/2,i=(row*sideCount+k)*3,g=Math.sqrt(q)*(1-q)**1.25/.3507,v=Math.sin(a);
                    const target=Math.sign(v)*f.ry*g;
                    for(let c=0;c<3;c++)m.p[i+c]+=f.y[c]*(target-v*f.ry);
                }});
                m.computeNormals();
            }
            if(role==='dorsal'){
                const count=C.save?33:25,sideCount=C.save?20:16,upper=stations.at(-1)[1]>stations[0][1];
                for(let i=0;i<m.p.length;i+=3){
                    const vertex=i/3,row=vertex<count*sideCount?Math.floor(vertex/sideCount):vertex===count*sideCount?0:count-1,t=row/(count-1),fade=1-ease(0,.32,t);
                    if(fade===0){for(let k=0;k<4;k++){m.j[vertex*4+k]=k===0?b:0;m.w[vertex*4+k]=k===0?1:0;}continue;}
                    const p=Array.from(m.p.slice(i,i+3)),at=clamp(.5-p[2]/L,0,1),s=section(at),u=Math.acos(clamp(p[0]/s.w,-1,1))/Math.PI;
                    const support=surface(at,u,!upper),embed=L*.003*(upper?1:-1);
                    m.p[i+1]+=(support[1]-embed-pts[0][1])*fade;
                    // The entire base inherits the skin below its own chord point.
                    const base=bodySkin(support),own=ease(0,.32,t),weights=new Map([[b,own]]);
                    for(let k=0;k<4;k++)if(base.weights[k])weights.set(base.joints[k],(weights.get(base.joints[k])||0)+base.weights[k]*(1-own));
                    const entries=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=entries.reduce((v,e)=>v+e[1],0);
                    for(let k=0;k<4;k++){m.j[i/3*4+k]=entries[k]?.[0]||0;m.w[i/3*4+k]=(entries[k]?.[1]||0)/sum;}
                }
                marineNormals(m);
            }
            const part=finish(m,name,{kind:'aquatic',roughness:cfg.shark?.74:.42,normalScale:cfg.shark?.07:cfg.mammal?.035:.18,aquaticFin:true});
            const count=C.save?33:25,sideCount=C.save?20:16,uv=[];
            for(let row=0;row<count;row++)for(let k=0;k<sideCount;k++)uv.push((Math.cos(k/sideCount*Math.PI*2)+1)/2,row/(count-1));
            uv.push(.5,0,.5,1);part.uvs=Float32Array.from(uv);return b;
        };
        for(let i=0;i<r.finPairs;i++)for(const sign of [-1,1]) {
            const t=[.29,.59,.74,.86][i],s=section(t),z=s.z/L,span=cfg.pectoral*r.finSize/(1+i*.8),x=s.w/L*.72,y=(s.upperY-Y)/L-.03;
            // Shark pectorals: broad based, swept and falcate, low on the flank; pelvics
            // smaller and nearly flat under the belly.
            if(cfg.shark&&i===0){const yy=(s.upperY-Y)/L-.045,xx=s.w/L*.62;const sp=span*.9;fin('Fin'+sign+'_'+i,[[sign*xx,yy,z+.01,.175,.0125],[sign*(xx+sp*.36),yy-sp*.08,z-.028,.145,.0088],[sign*(xx+sp*.72),yy-sp*.15,z-.095,.085,.0045],[sign*(xx+sp),yy-sp*.18,z-.15,.006,.0006]],rootBone,'fin',sign,true);continue;}
            if(cfg.shark){const sp=span*.62,yy=(s.lowerY-s.bottom*.62-Y)/L,xx=s.w/L*.5;fin('Fin'+sign+'_'+i,[[sign*xx,yy,z,.08,.0075],[sign*(xx+sp*.5),yy-sp*.18,z-.04,.058,.0045],[sign*(xx+sp),yy-sp*.3,z-.085,.005,.0004]],rootBone,'fin',sign,true);continue;}
            // A flipper grows out of the flank: its root sunk well inside the body, broad and fleshy where it
            // leaves the skin, thinning to a fine edge at the tip.
            fin('Fin'+sign+'_'+i,[[sign*x*.55,y+.012,z+.01,.17/(1+i),.016],[sign*(x+span*.12),y-span*.06,z-.025,.15/(1+i),.011],[sign*(x+span*.45),y-span*.23,z-.06,.11/(1+i),.0055],[sign*(x+span*.85),y-span*.48,z-.11,.05/(1+i),.0022],[sign*(x+span),y-span*.58,z-.13,cfg.whale?.012:.002,.0003]],rootBone,'fin',sign,cfg.mammal||cfg.shark);
        }
        const ds=section(cfg.dorsalT),dY=(ds.upperY+ds.top-Y)/L-.003,dz=ds.z/L,dh=cfg.dorsal*r.dorsalHeight;
        // Bony fish carry a long-based rayed dorsal (reef perch/snapper) or a short
        // mid-back one (salmon), never a shark's stiff triangle.
        if(cfg.type==='reef')fin('Dorsal fin',[[0,dY,dz,.44,.005],[0,dY+dh*.45,dz-.012,.41,.0034],[0,dY+dh*.85,dz-.03,.34,.0017],[0,dY+dh,dz-.05,.14,.0004]],rootBone,'dorsal');
        else if(cfg.type==='salmon')fin('Dorsal fin',[[0,dY,dz,.17,.005],[0,dY+dh*.45,dz-.012,.14,.0032],[0,dY+dh*.85,dz-.03,.085,.0015],[0,dY+dh,dz-.045,.012,.0003]],rootBone,'dorsal');
        else{const k=cfg.shark?1.8:1;fin('Dorsal fin',[[0,dY,dz,.20,.006*k],[0,dY+dh*.35,dz+.010,.13,.0038*k],[0,dY+dh*.75,dz-.015,.055,.0015*k],[0,dY+dh,dz-.040,.001,.0002]],rootBone,'dorsal');}
        if(!cfg.mammal) {
            // A shark's small second dorsal and anal fins sit just ahead of the peduncle.
            const at=cfg.shark?.85:.79,s=section(at),y=(s.upperY+s.top-Y)/L,z0=cfg.shark?.5-at:-.29,k=cfg.shark?.8:1;
            if(cfg.type==='tuna'){
                // Yellowfin: long sickle-shaped second dorsal and anal fins.
                const q=section(.6),ty=(q.upperY+q.top-Y)/L,ay=(q.lowerY-q.bottom-Y)/L,z=q.z/L,h=.15*r.dorsalHeight;
                fin('Second dorsal',[[0,ty-.002,z,.085,.0042],[0,ty+h*.45,z-.04,.05,.0026],[0,ty+h*.85,z-.1,.02,.001],[0,ty+h,z-.13,.002,.0002]],tail[1].b,'dorsal');
                fin('Anal fin',[[0,ay+.002,z-.01,.08,.004],[0,ay-h*.45,z-.05,.048,.0025],[0,ay-h*.85,z-.11,.02,.001],[0,ay-h,z-.14,.002,.0002]],tail[1].b,'dorsal');
            }else{
                if(cfg.shark || cfg.type==='salmon')fin('Second dorsal',[[0,y-.002,z0,.065*k,.003],[0,y+.032*k,z0-.01,.035*k,.002],[0,y+.04*k,z0-.02,.002,.0002]],tail[3].b,'dorsal');
                const by=(s.lowerY-s.bottom-Y)/L;
                fin('Anal fin',[[0,by+.002,z0-.01,.065*k,.003],[0,by-.025*k,z0-.03,.035*k,.002],[0,by-.033*k,z0-.04,.002,.0002]],tail[3].b,'dorsal');
            }
        }
        if(r.tailLength>0)for(const sign of [-1,1]) {
            const spread=(sign>0?cfg.upperTail:cfg.lowerTail)*r.finSize*r.tailLength,stations=cfg.mammal?
                [[0,-.012,-.48,.1,.011],[sign*spread*.38,-.01,-.535,.13,.0055],[sign*spread*.80,-.006,-.60,.08,.0025],[sign*spread,0,-.66,.0015,.0003]]:
                [[0,0,-.495,.08,.006],[0,sign*spread*.33,-.535,.12,.004],[0,sign*spread*.77,-.615,.07,.002],[0,sign*spread,-.69-(cfg.type==='thresher'&&sign>0?.15:0),.0015,.0003]];
            fin('Fluke'+sign,stations,parent,'fluke');
        }
        // The eye sits in the actual side surface with a dark iris and restrained glint.
        if(cfg.type==='hammerhead') {
            const bar=new Props.ExactMesh();bar.loft(49,(_,t)=>{const u=Math.abs(t*2-1),round=Math.sqrt(Math.max(.002,1-u**12)),x=(t*2-1)*L*.19,rx=L*(.058-.009*u)*round;return{center:[x,Y+L*.007,L*(.435+.013*u)],x:[0,0,1],y:[0,1,0],rx,ry:L*(.017-.004*u)*round};},24,(t,a,q)=>mix(colors.light,mix(colors.main,colors.mark,.25),ease(-.35,.25,Math.sin(a))),Props.rigid(headBone),true);finish(bar,'Cephalofoil',{kind:'aquatic',roughness:.46,normalScale:.07});
        }
        for(let i=0;i<r.eyeCount;i++) {
            const bony=!cfg.mammal&&!cfg.shark&&!cfg.angler;
            const sign=i%2?-1:1,t=(cfg.whale?.20:cfg.mammal?.135:cfg.shark?.12:bony?.105:.12)+Math.floor(i/2)*.025,s=section(t),radius=L*(cfg.shark?.008:cfg.whale?.005:bony?.0135:.009)*r.eyeSize;
            let p=onSide(t,sign,cfg.shark?.32:bony?.3:.18),facing=[sign,.08,.15];
            if(cfg.type==='hammerhead'){p=[sign*L*.188,Y+L*.009,L*.449];facing=[sign,0,.1];}
            if(!p)continue;p=add(p,[-sign*radius*.18,0,0]);
            // Shark eyes: an almost black globe with a deep blue-grey iris ring and
            // the pale lower edge of the nictitating membrane; no cartoon iris.
            const center=p,f=norm(facing),eyeColor=cfg.shark?(t,a,q)=>{const d=sub(q,center),front=dot(d,f)/radius,low=d[1]/radius;
                if(front>.2&&low<-.42)return mix(rgb('#3d464c'),rgb('#7d8a90'),ease(-.42,-.75,low));
                return front>.55&&front<.86?rgb('#16222c'):rgb('#06090c');}
                // Bony fish: a round black pupil in a gold or silver iris ring.
                :bony?(t,a,q)=>{const front=dot(sub(q,center),f)/radius;return front>.78?rgb('#05070a'):front>.42?mix(rgb(cfg.type==='reef'?'#c79a3a':'#aeb4b0'),rgb('#3a3a32'),ease(.6,.78,front)*.6):rgb('#2a2e30');}:rgb('#080d12');
            const eye=new Props.ExactMesh(),bind=Props.rigid(headBone);eye.sphere(p,radius,eyeColor,bind,cfg.shark?14:10,cfg.shark?20:16,[1,.86,1]);
            eye.sphere(add(p,add(mul(norm(facing),radius*.87),[0,radius*.23,0])),radius*.10,rgb('#b9c8ce'),bind,4,6);finish(eye,'Eye '+i,{kind:'eye',roughness:.16});
        }
        const details=new Props.ExactMesh();
        if(cfg.mammal) {
            const t=cfg.whale?.16:.18,s=section(t),p=surface(t,.5,false,L*.0007);
            if(p)for(const sign of cfg.whale&&cfg.type!=='orca'?[-1,1]:[0])details.disk(add(p,[sign*L*.003,L*.0007,0]),[0,1,0],L*(cfg.whale?.0038:.003),colors.dark,Props.rigid(headBone),20,L*.0018);
        }
        finish(details,'Gills and facial detail',{kind:'aquatic',roughness:.57,noSurfaceDetail:true});
        if(cfg.type==='whaleShark') {
            const spots=new Props.ExactMesh();
            for(let row=0;row<26;row++)for(let col=0;col<13;col++){
                const t=.035+row/26*.78,u=(col+.5+(row%2)*.25)/13,p=surface(t,u,false,L*.00015),pa=surface(Math.min(.95,t+.002),u),pb=surface(t,Math.min(.999,u+.002));
                const n=norm(cross(sub(pa,p),sub(pb,p))),s=section(t),out=norm([p[0]/Math.max(1e-5,s.w),(p[1]-s.upperY)/Math.max(1e-5,s.top),0]),normal=dot(n,out)<0?mul(n,-1):n;
                spots.disk(p,normal,L*(.0018+.0006*Math.sin(row*3.1+col)),colors.light,bodySkin(p),8);
            }
            finish(spots,'Spotted skin',{kind:'aquatic',roughness:.55,noSurfaceDetail:true,noShade:true});
        }
        if(cfg.type==='humpback') {
            const nodules=new Props.ExactMesh();for(const sign of [-1,0,1])for(let k=0;k<7;k++){const t=.035+k*.022,s=section(t),p=surface(t,Math.acos(sign*.58)/Math.PI,false);if(p)nodules.sphere(p,L*.0025*(1+k*.07),colors.main,Props.rigid(headBone),5,8);}
            finish(nodules,'Rostral tubercles',{kind:'aquatic',roughness:.5,noSurfaceDetail:true});
            // Barnacle clusters on the chin and the lower jaw's tip: crusty pale cones, each with a dark aperture.
            const crust=new Props.ExactMesh();let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
            for(const [t0,u0,lower,n]of [[.025,.5,true,14],[.05,.42,true,9],[.06,.6,true,8],[.09,.3,true,6],[.035,.25,false,5]])for(let k=0;k<n;k++){
                const t=t0+(rnd()-.5)*.03,u=u0+(rnd()-.5)*.12,p=surface(t,u,lower),pa=surface(t+.002,u,lower),pb=surface(t,u+.004,lower);if(!p||!pa||!pb)continue;
                let nrm=norm(cross(sub(pa,p),sub(pb,p)));const sec=section(t),out=[p[0],p[1]-sec.upperY,0];if(dot(nrm,out)<0)nrm=mul(nrm,-1);
                const rr=L*(.0016+.0016*rnd()),sk=skin(p,lower,t),grey=mix(rgb('#cfc8b8'),rgb('#8a8478'),rnd()*.6);
                crust.tube([add(p,mul(nrm,-rr*.3)),add(p,mul(nrm,rr*.7))],[rr,rr*.55],7,grey,sk);
                crust.sphere(add(p,mul(nrm,rr*.68)),rr*.32,rgb('#2a2622'),sk,4,6,[1,.4,1]);
            }
            finish(crust,'Barnacles',{kind:'aquatic',roughness:.85,noSurfaceDetail:true});
        }
        if(cfg.type==='tuna')for(const sign of [-1,1])for(let k=0;k<6;k++) {
            const t=.64+k*.047,s=section(t),y=(sign>0?s.upperY+s.top:s.lowerY-s.bottom)-Y;
            fin('Finlet'+sign+'_'+k,[[0,y/L,s.z/L,.028,.0015],[0,y/L+sign*.020,s.z/L-.006,.015,.001],[0,y/L+sign*.023,s.z/L-.012,.001,.0002]],tail[Math.min(5,k+1)].b,'dorsal');
        }
        if(cfg.angler) {
            const s=section(.16),path=[[0,s.upperY+s.top-L*.006,s.z],[0,Y+L*.27,L*.36],[0,Y+L*.25,L*.53],[0,Y+L*.13,L*.57]],m=new Props.ExactMesh();
            m.tube(path,[L*.007,L*.004,L*.003,L*.002],10,colors.main,Props.rigid(headBone));finish(m,'Lure stalk',{kind:'aquatic',roughness:.5});
            const lure=new Props.ExactMesh();lure.sphere(path.at(-1),L*.017,colors.light,Props.rigid(headBone),10,16);finish(lure,'Luminous lure',{kind:'aquatic',emissive:r.colors.light,emissiveIntensity:1.2,noSurfaceDetail:true});
        }
    }

    function fish(C) { return C.r.kind === 'stingray' ? rayFish(C) : marine(C); }

    /** Tapered flexible arm with a private chain and optional cupped suckers. */
    function appendage(C, name, path, parent, radius, phase, suckers, club = false, rootSkin = null, shape = null) {
        const { L, colors, bone, finish } = C, chain = [];
        const count = path.length - 1;
        for (let i = 0; i < count; i++) { const b = bone(name + '_' + i, i ? chain[i - 1] : parent, path[i], path[i + 1], 'tentacle', phase + i * 0.45); chain.push(b); }
        const skin = p => {
            let best = 0, distance = Infinity, fraction = 0;
            for (let i = 0; i < count; i++) { const d = sub(path[i + 1], path[i]), t = clamp(dot(sub(p, path[i]), d) / Math.max(1e-12, dot(d, d)), 0, 1), q = lerp(path[i], path[i + 1], t), dd = dot(sub(p, q), sub(p, q)); if (dd < distance) { distance = dd; best = i; fraction = t; } }
            if (best === 0) {
                const collar=Math.max(radius,L*.0055),own=ease(collar*1.8,collar*5,Math.hypot(...sub(p,path[0])));// fine tendrils keep the same fixed collar length
                if (!rootSkin) return {joints:[parent,chain[0],chain[1],0],weights:[1-own,own*(1-fraction),own*fraction,0]};
                const mixed=new Map([[chain[0],own*(1-fraction)],[chain[1],own*fraction]]);
                for(let k=0;k<4;k++)if(rootSkin.weights[k])mixed.set(rootSkin.joints[k],(mixed.get(rootSkin.joints[k])||0)+rootSkin.weights[k]*(1-own));
                const top=[...mixed].filter(([,w])=>w>1e-10).sort((a,b)=>b[1]-a[1]).slice(0,4),total=top.reduce((s,[,w])=>s+w,0);
                return {joints:top.map(([j])=>j),weights:top.map(([,w])=>w/total)};
            }
            if (best === count - 1) return Props.rigid(chain[best]);
            return { joints: [chain[best], chain[best + 1], 0, 0], weights: [1 - fraction, fraction, 0, 0] };
        };
        const mesh = new Props.ExactMesh(), steps = C.save ? 49 : 33;
        const point = t => {
            const s = clamp(t, 0, 1) * count, i = Math.min(count - 1, Math.floor(s)), u = s - i;
            const a = path[Math.max(0, i - 1)], b = path[i], c = path[i + 1], d = path[Math.min(count, i + 2)];
            return [0, 1, 2].map(k => 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u * u + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u * u * u));
        };
        const width = t => radius * (club ? (1 - t) ** 1.2 * 0.6 + Math.exp(-(((t - 0.88) / 0.12) ** 2)) * 0.9 : (1 - t) ** 1.2) + L * 0.0015;
        let previousAxis = null; const frames = [];
        mesh.loft(steps, (_, t) => {
            const center = point(t), tangent = norm(sub(point(Math.min(1, t + 0.002)), point(Math.max(0, t - 0.002))));
            // Parallel transport avoids the half-turn a fixed up vector makes
            // when a nearly vertical tendril changes its horizontal heading.
            let x = previousAxis ? norm(sub(previousAxis, mul(tangent, dot(previousAxis, tangent)))) : norm(cross(tangent, [0, 0, 1]));
            if (Math.hypot(...x) < 0.1) x = norm(cross(tangent, [0, 1, 0]));
            previousAxis = x;
            const y = norm(cross(tangent, x)), r = width(t) * (shape?.wide || 1);
            const frame = { center, x, y, rx: r, ry: r * (shape?.flat || 1), t }; frames.push(frame); return frame;
        }, C.save ? 20 : 12, shape?.color || colors.main, skin, true);
        // Ribbon arms: frilled, ruffled edges along the length (jellyfish oral arms).
        if (shape?.frill) { const sides = C.save ? 20 : 12; frames.forEach((f, row) => { for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2, edge = Math.cos(a) ** 4, w = Math.sin(f.t * 46 + Math.sign(Math.cos(a)) * 1.3 + phase) * shape.frill * f.rx * edge * Math.min(1, f.t * 6), i = (row * sides + k) * 3; for (let c = 0; c < 3; c++) mesh.p[i + c] += f.y[c] * w; } }); mesh.computeNormals(); }
        const armPart = finish(mesh, name, shape?.material || {}); if (!shape) C.pattern(armPart);
        // Cephalopod arms share the mantle's chromatophore mottling.
        if (suckers && armPart) for (let i = 0; i < armPart.positions.length; i += 3) {
            const q = armPart.positions.subarray(i, i + 3), n = fbm(q[0] / L * 14, q[2] / L * 14 + q[1] / L * 9, 3), h = hash2(Math.floor(q[0] / L * 90), Math.floor(q[2] / L * 90 + q[1] / L * 60));
            armPart.colors.set(mix(mix(Array.from(armPart.colors.subarray(i, i + 3)), colors.mark, ease(.52, .68, n) * .45 * C.r.patternAmount), [.3, .09, .06], (h > .7 ? .35 : 0) * C.r.patternAmount), i);
        }
        if (suckers) {
            // Two staggered rows of rimmed suckers on the oral face (one row on a club),
            // growing from the mouth and shrinking toward the tip.
            const cups = new Props.ExactMesh(), per = C.save ? 13 : 9, lines = club ? 1 : 2;
            for (let k = 0; k < per; k++) for (let line = 0; line < lines; line++) {
                const t = club ? .76 + (k + .5) / per * .22 : .03 + (k + .25 + line * .5) / per * .92, at = point(t), armR = width(t);
                const tangent = norm(sub(point(Math.min(1, t + .004)), point(Math.max(0, t - .004)))), side0 = cross(tangent, [0, 1, 0]), side = Math.hypot(...side0) < .1 ? [1, 0, 0] : norm(side0), down0 = norm(cross(side, tangent)), down = down0[1] > 0 ? mul(down0, -1) : down0;
                const cr = (radius * .34 * Math.min(1, t * 5 + .3) * (1 - t * .7) + L * .0016) * (club ? 1.15 : 1), base = add(at, add(mul(down, armR * .8), mul(side, (lines > 1 ? (line ? 1 : -1) : 0) * armR * .45)));
                const profile = [[0, 1], [.35, 1.08], [.45, .84], [.32, .6], [.1, .3]];
                cups.loft(5, (j) => ({ center: add(base, mul(down, cr * profile[j][0])), x: side, y: tangent, rx: cr * profile[j][1], ry: cr * profile[j][1] }), C.save ? 10 : 8, (u) => u < .4 ? mix(colors.light, colors.main, .15) : mix(colors.light, [.55, .3, .3], (u - .4) * 1.2), skin, false);
                cups.disk(add(base, mul(down, cr * .1)), down, cr * .3, mix(colors.mark, [.2, .07, .07], .5), skin, 8);
            }
            finish(cups, name + ' suckers', { roughness: 0.55, doubleSided: true });
        }
    }
    /** Octopus and squid: a mantle with a painted chromatophore chart (mottled
     * patches, dense pigment dots, paler underside), skin papillae and eyebrow
     * horns over raised eyes, a muscular siphon, and biserial rimmed suckers. */
    function cephalopod(C) {
        const { r, L, Y, colors, finish, rootBone, headBone, eye, blade } = C, squid = r.kind === 'squid';
        const ring = t => {
            const front = Math.max(0.025, Math.sin(Math.min(1, t / 0.18) * Math.PI / 2) ** 0.65);
            const radius = front * (squid ? L * (0.13 + 0.13 * Math.sin(t * Math.PI)) * Math.max(0.02, (1 - t) ** 0.8) : L * (0.13 + 0.17 * Math.exp(-(((t - 0.59) / 0.27) ** 2))) * Math.max(0.02, (1 - t) ** 0.38));
            const headScale = 1 + (r.headSize - 1) * Math.exp(-((t / 0.3) ** 2));
            return { center: [0, Y + L * 0.06 * Math.sin(t * Math.PI), L * (0.2 - t * (squid ? 0.95 : 0.73))], rx: radius * r.girth * headScale, ry: radius * (squid ? 0.9 : 1) * r.chestDepth * headScale };
        };
        const skinAt = p => { const t = clamp((p[2] / L + 0.1) / 0.23, 0, 1); return { joints: [rootBone, headBone, 0, 0], weights: [1 - t, t, 0, 0] }; };
        // A seamed grid (one duplicated column) so the painted chart wraps cleanly.
        const body = new Props.ExactMesh(), rows = C.save ? 57 : 41, sides = C.save ? 40 : 28, grid = [], uv = [];
        const at = (t, a, lift = 0) => { const q = ring(t); return [q.center[0] + Math.cos(a) * (q.rx + lift), q.center[1] + Math.sin(a) * (q.ry + lift), q.center[2]]; };
        for (let i = 0; i < rows; i++) {
            const t = i / (rows - 1), row = [];
            for (let k = 0; k <= sides; k++) { const a = k / sides * Math.PI * 2, p = at(t, a); row.push(body.vertex(p, [Math.cos(a), Math.sin(a), 0], [1, 1, 1], skinAt(p))); uv.push(t, k / sides); }
            grid.push(row);
        }
        for (let i = 0; i < rows - 1; i++) for (let k = 0; k < sides; k++) { const a = grid[i][k], b = grid[i][k + 1], c = grid[i + 1][k], d = grid[i + 1][k + 1]; body.tri(a, c, b); body.tri(b, c, d); }
        for (const [i, t] of [[0, 0], [rows - 1, 1]]) { const p = ring(t).center, v = body.vertex(p, [0, 0, t ? -1 : 1], [1, 1, 1], skinAt(p)); uv.push(t, .5); for (let k = 0; k < sides; k++) t ? body.tri(v, grid[i][k + 1], grid[i][k]) : body.tri(v, grid[i][k], grid[i][k + 1]); }
        // Orient outward by volume, then weld the seam's shading.
        let vol = 0; for (let k = 0; k < body.i.length; k += 3) { const [a, b, c] = [0, 1, 2].map(j => body.p.slice(body.i[k + j] * 3, body.i[k + j] * 3 + 3)); vol += dot(a, cross(b, c)); }
        if (vol < 0) for (let k = 0; k < body.i.length; k += 3) { const v = body.i[k + 1]; body.i[k + 1] = body.i[k + 2]; body.i[k + 2] = v; }
        marineNormals(body);
        const part = finish(body, 'Body', { kind: 'aquatic', roughness: 0.42 });
        part.uvs = Float32Array.from(uv); part.uvs1 = part.uvs.map((v, i) => v * (i % 2 ? 5 : 7)); part.paintedSurface = true; part.normalScale = .45;
        // Chromatophores: mottled patches, a dense field of pigment dots, a few pale spots and a lighter underside.
        const coat = (t, v) => {
            const a = v * Math.PI * 2, below = clamp(-Math.sin(a), 0, 1), n = fbm(t * 7 + Math.cos(a) * 1.6, Math.sin(a) * 1.6 + 4, 4);
            let c = mix(colors.main, colors.light, ease(.05, .8, below) * .55 * r.patternAmount);
            c = mix(c, colors.mark, ease(.46, .66, n) * .78 * r.patternAmount * (1 - below * .6));
            const gt = t * (squid ? 150 : 110), gv = v * (squid ? 70 : 56), ct = Math.floor(gt), cv = Math.floor(gv) % (squid ? 70 : 56), h = hash2(ct, cv);
            const dt = gt - ct - .5 - (hash2(cv, ct) - .5) * .5, dv = gv - Math.floor(gv) - .5 - (hash2(ct + 5, cv + 2) - .5) * .5, size = .16 + h * .2;
            const dot2 = Math.exp(-((dt * dt + dv * dv) / (size * size))) * (h > (squid ? .25 : .45) ? 1 : 0);
            c = mix(c, mix(colors.mark, [.32, .08, .05], .5), dot2 * .65 * (1 - below * .7) * r.patternAmount);
            if (!squid) { const st = t * 34, sv = v * 18, ct2 = Math.floor(st), cv2 = Math.floor(sv) % 18, h2 = hash2(ct2 + 40, cv2), d2 = Math.hypot(st - ct2 - .5, sv - Math.floor(sv) - .5); c = mix(c, colors.light, (h2 > .78 ? ease(.3, .18, d2) : 0) * .45 * r.patternAmount * (1 - below)); }
            return c;
        };
        C.paintMarkings = (w, h) => { const data = new Uint8Array(w * h * 4); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { const c = coat((i + .5) / w, (j + .5) / h), k = (j * w + i) * 4; data[k] = toSrgb(c[0]); data[k + 1] = toSrgb(c[1]); data[k + 2] = toSrgb(c[2]); data[k + 3] = 255; } return { width: w, height: h, data, repeat: true }; };
        for (let i = 0; i < r.eyeCount; i++) {
            const sign = i % 2 ? -1 : 1, row = Math.floor(i / 2), z = L * (0.12 - row * 0.035), radius = L * 0.028 * r.eyeSize;
            const hit = bodyRay(C, [0, Y + L * 0.015, z], [sign, 0, 0]);
            if (hit) eye(add(hit, [-sign * radius * 0.27, 0, 0]), radius, Props.rigid(headBone), i, [sign * 0.8, 0, 0.6]);
        }
        // Papillae: small fleshy bumps over the mantle top, larger "horns" over the eyes.
        const bumps = new Props.ExactMesh(), count = squid ? 0 : C.save ? 170 : 120;
        for (let k = 0; k < count; k++) {
            const t = .12 + hash2(k, 3) * .8, a = Math.PI * (.1 + .8 * hash2(7, k)), p = at(t, a, -L * .002), q = ring(t), n = norm([Math.cos(a) / q.rx, Math.sin(a) / q.ry, 0]);
            const s = L * (.0035 + .005 * hash2(k, 11) ** 2);
            bumps.sphere(p, s, mix(colors.main, k % 3 ? colors.mark : colors.light, .3), skinAt(p), 4, 7, [1, .8 + .4 * Math.abs(n[1]), 1]);
        }
        if (!squid) for (const sign of [-1, 1]) { const p = at(.17, Math.PI / 2 - sign * .55, -L * .003); bumps.tube([p, add(p, [sign * L * .008, L * .022, -L * .004])], [L * .007, L * .0008], 8, mix(colors.main, colors.mark, .3), Props.rigid(headBone)); }
        finish(bumps, 'Skin papillae', { kind: 'aquatic', roughness: .5 });
        // Siphon: a muscular funnel from the mantle opening (left side in octopus, under the head in squid).
        const siphon = new Props.ExactMesh(), s0 = squid ? at(.2, -Math.PI / 2, -L * .01) : at(.3, Math.PI * 1.15, -L * .01), dir = squid ? [0, -.25, 1] : [.25, -.35, .9];
        siphon.tube([s0, add(s0, mul(norm(dir), L * .05)), add(s0, mul(norm(dir), L * .09))], [L * .026, L * .02, L * .016], 14, mix(colors.main, colors.light, .3), Props.rigid(headBone));
        siphon.disk(add(s0, mul(norm(dir), L * .0905)), norm(dir), L * .011, mix(colors.mark, [.15, .05, .05], .5), Props.rigid(headBone), 14);
        finish(siphon, 'Siphon', { kind: 'aquatic', roughness: .45 });
        for (let a = 0; a < r.appendages; a++) {
            const angle = a / Math.max(1, r.appendages) * Math.PI * 2, long = squid && a >= r.appendages - 2;
            const length = L * r.appendageLength * (squid ? (long ? 1.05 : 0.58) : 0.75), path = [];
            for (let i = 0; i <= 6; i++) { const t = i / 6, spread = squid ? 0.1 + t * 0.2 : 0.1 + Math.sin(t * Math.PI * 0.68) * length / L, turn = angle + (squid ? 0 : t * t * 0.55);
                path.push([Math.cos(turn) * L * spread, Y - L * 0.05 - (squid ? Math.sin(angle) * L * (0.08 + t * 0.1) : L * 0.2 * Math.sin(t * Math.PI * 0.92)), L * 0.13 + (squid ? t * length : Math.sin(turn) * L * spread + t * L * 0.08)]); }
            const origin = [0, Y, L * 0.05], hit = bodyRay(C, origin, sub(path[0], origin));
            if (hit) path[0] = lerp(origin, hit, 0.88);
            appendage(C, 'Arm' + a, path, headBone, L * (long ? 0.026 : squid ? 0.039 : 0.052), angle, true, long, hit?.skin);
        }
        if (squid) for (const sign of [-1, 1]) blade('Mantle fin' + sign, [[sign * L * 0.06, Y, -L * 0.59], [sign * L * 0.28, Y, -L * 0.43], [sign * L * 0.12, Y, -L * 0.18]], rootBone, 'fin', sign);
    }
    /** Goa'uld-style symbiote: a tapered annulated body with a toothed head
     * and three fleshy cephalic sails. Landmarks come from the same loft. */
    function symbiote(C) {
        const {r,L,Y,colors,bone,rootBone,headBone,finish,eye}=C,count=r.segments,chain=[rootBone],hinge=.125;
        const profile=[[0,.009,.010,.009],[.035,.021,.021,.015],[.075,.030,.032,.025],[.13,.026,.026,.023],[.22,.035,.032,.028],[.40,.030,.028,.025],[.65,.021,.020,.018],[.88,.010,.010,.009],[1,.001,.001,.001]];
        const section=t=>{
            const q=profileAt(profile,t),head=1+(r.headSize-1)*(1-ease(.08,.22,t));
            const x=L*.025*Math.sin(Math.PI*t*2)*(ease(.18,.4,t)),y=Y+L*(.065*(1-ease(.10,.45,t))+.012*Math.sin(t*Math.PI*2));
            const wrinkles=1-.075*(.5+.5*Math.cos(t*r.segments*Math.PI*2+Math.sin(t*47)*.25))*(ease(.1,.2,t));
            const w=q[0]*L*r.girth*head*wrinkles,top=q[1]*L*r.chestDepth*head*wrinkles,bottom=q[2]*L*r.chestDepth*head*wrinkles;
            const face=1-ease(.035,hinge,t),upperY=y-bottom*.2*face,gap=L*.032*r.jawOpen*face;
            return {x,y,z:L*(.55-t*1.08),w,top:top+bottom*.2*face,bottom:bottom*(1-.2*face),upperY,lowerY:upperY-gap,gap,face};
        };
        const at=t=>{const s=section(t);return[s.x,s.y,s.z];};
        C.bones[rootBone].head=at(.20);C.bones[rootBone].tail=at(.20+.8/count);
        C.bones[headBone].head=at(.13);C.bones[headBone].tail=at(.015);
        for(let i=1;i<count;i++)chain.push(bone('Segment'+i,chain.at(-1),at(.20+.8*i/count),at(.20+.8*(i+1)/count),'segment',i*.55));
        const bodySkin=t=>{
            if(t<.13)return Props.rigid(headBone);
            if(t<.20){const f=(t-.13)/.07;return{joints:[headBone,rootBone,0,0],weights:[1-f,f,0,0]};}
            const n=clamp((t-.20)/.8*count,0,count-1),i=Math.min(count-2,Math.floor(n)),f=n-i;
            return{joints:[chain[i],chain[i+1],0,0],weights:[1-f,f,0,0]};
        };
        const jaw=bone('Jaw',headBone,add(at(hinge),[0,-L*.008,0]),add(at(0),[0,-L*.02,0]),'jaw');
        const bind=(t,lower)=>{const w=lower?1-ease(.055,hinge,t):0;return w?{joints:[headBone,jaw,0,0],weights:[1-w,w,0,0]}:bodySkin(t);};
        const pigment=(t,a,lower)=>{
            const belly=lower?Math.sin(a):0,grain=Math.sin(t*471+Math.sin(a*7))*Math.sin(a*23+t*91)*.12;
            let c=mix(colors.main,colors.light,belly*.65);
            const band=r.pattern==='stripes'?(.5+.5*Math.cos(t*r.segments*Math.PI*2))*.20:0;
            c=mix(c,colors.mark,clamp(band+grain+.03,0,.4));return c;
        };
        const mesh=new Props.ExactMesh(),rings=[],uvs=[],sides=C.save?32:24,steps=r.segments*(C.save?6:4);
        const ts=[...new Set(Array.from({length:steps+1},(_,i)=>i/steps).concat(hinge))].sort((a,b)=>a-b);
        for(const t of ts){const s=section(t),row=[];
            for(const lower of [false,true]){const ring=[];
                for(let k=0;k<=sides;k++){const a=k/sides*Math.PI,p=[s.x+Math.cos(a)*s.w,(lower?s.lowerY:s.upperY)+(lower?-s.bottom:s.top)*Math.sin(a),s.z];p[1]+=(lower?-1:1)*L*.0008*Math.sin(t*160+a*5)*(1-ease(.04,.20,t))*Math.sin(a);ring.push(mesh.vertex(p,[Math.cos(a),(lower?-1:1)*Math.sin(a),0],pigment(t,a,lower),bind(t,lower)));uvs.push(t,lower?1-a/(2*Math.PI):a/(2*Math.PI));}row.push(ring);
            }rings.push(row);
        }
        for(let i=0;i<rings.length-1;i++)for(let half=0;half<2;half++)for(let k=0;k<sides;k++){
            const a=rings[i][half][k],b=rings[i+1][half][k],c=rings[i][half][k+1],d=rings[i+1][half][k+1];
            if(half){mesh.tri(a,c,b);mesh.tri(c,d,b);}else{mesh.tri(a,b,c);mesh.tri(c,b,d);}
        }
        for(const end of [0,rings.length-1])for(let half=0;half<2;half++){
            const s=section(ts[end]),v=mesh.vertex([s.x,half?s.lowerY:s.upperY,s.z],[0,0,end?-1:1],half?colors.light:colors.main,bind(ts[end],!!half));uvs.push(end?1:0,half?.75:.25);
            for(let k=0;k<sides;k++){const a=rings[end][half][k],b=rings[end][half][k+1];(end===0)!==!!half?mesh.tri(v,a,b):mesh.tri(v,b,a);}
        }
        marineNormals(mesh);const skinPart=finish(mesh,'Body',{kind:'aquatic',roughness:.68,normalScale:.70,symbioteSkin:true});skinPart.uvs=Float32Array.from(uvs);
        // The sails grow from the shoulders; every axial slice shares its
        // underlying body's binding so crawling does not tear the attachment.
        for(const sign of [-1,0,1]){
            const sail=new Props.ExactMesh(),rows=C.save?41:29;
            sail.loft(rows,(_,u)=>{
                const t=.14+u*.19,s=section(t),spread=L*.052*r.finSize*Math.sin(Math.PI*u)**1.1*(1+.09*Math.cos(u*Math.PI*10))+L*.0002;
                const direction=sign?norm([sign,.65,0]):[0,1,0],normal=sign?norm([-sign*.65,1,0]):[1,0,0];
                const root=sign?[s.x+sign*s.w*.87,s.upperY+s.top*.45,s.z]:[s.x,s.upperY+s.top-L*.001,s.z];
                const center=add(root,mul(direction,spread*.48-L*.0015));
                return{center,x:direction,y:normal,rx:spread*.52,ry:L*(.0004+.0018*Math.sin(Math.PI*u))*(1+.25*Math.cos(u*Math.PI*22))};
            },C.save?16:12,(u,a)=>mix(mix(colors.main,colors.light,.12),colors.mark,(.20+.18*Math.cos(a)+.15*Math.sin(u*Math.PI*18)**8)*Math.sin(Math.PI*u)),p=>bodySkin(clamp((.55-p[2]/L)/1.08,.14,.34)),true);
            finish(sail,sign?'Head frill '+sign:'Cranial crest',{kind:'aquatic',roughness:.53,normalScale:.07});
        }
        const inside=new Props.ExactMesh(),gums=new Props.ExactMesh(),paths=[];
        for(let half=0;half<2;half++){
            const rows=[],path=[];
            for(let i=0;i<=24;i++){const t=i/24*hinge,s=section(t),row=[];
                for(let k=0;k<=16;k++){const u=k/8-1,p=[s.x+s.w*u,(half?s.lowerY:s.upperY)+(half?-1:1)*L*.004*(1-u*u)*ease(0,.02,t)*s.face,s.z];row.push(inside.vertex(p,[0,half?1:-1,0],colors.dark,bind(t,!!half)));}rows.push(row);
            }
            for(let i=0;i<24;i++)for(let k=0;k<16;k++){const a=rows[i][k],b=rows[i+1][k],c=rows[i][k+1],d=rows[i+1][k+1];inside.tri(a,b,c);inside.tri(c,b,d);}
            for(let k=0;k<=24;k++){const t=hinge*(1-k/24),s=section(t);path.push({p:[s.x-s.w,half?s.lowerY:s.upperY,s.z],t});}
            const front=section(0);for(let k=1;k<8;k++)path.push({p:[front.x+front.w*(k/4-1),half?front.lowerY:front.upperY,front.z],t:0});
            for(let k=0;k<=24;k++){const t=hinge*k/24,s=section(t);path.push({p:[s.x+s.w,half?s.lowerY:s.upperY,s.z],t});}
            paths.push(path);gums.tube(path.map(q=>q.p),L*.00085,6,colors.light,p=>bind(clamp((.55-p[2]/L)/1.08,0,hinge),!!half));
        }
        finish(inside,'Mouth interior',{kind:'mouth',roughness:.85,doubleSided:true,noSurfaceDetail:true});finish(gums,'Gum margins',{kind:'mouth',roughness:.6,noSurfaceDetail:true});
        if(r.jawOpen>.01&&r.toothSize>0){const teeth=new Props.ExactMesh();
            for(let half=0;half<2;half++){
                const path=paths[half],dist=[0];for(let i=1;i<path.length;i++)dist.push(dist.at(-1)+Math.hypot(...sub(path[i].p,path[i-1].p)));
                for(let n=0;n<18;n++){
                    const d=(n+.5)/18*dist.at(-1);let j=1;while(j<path.length-1&&dist[j]<d)j++;
                    const f=(d-dist[j-1])/(dist[j]-dist[j-1]),t=path[j-1].t+(path[j].t-path[j-1].t)*f,s=section(t),height=Math.min(L*.012*r.toothSize,s.gap*.44);
                    if(height<L*.0005)continue;
                    const root=lerp(path[j-1].p,path[j].p,f),tip=add(root,[(section(t).x-root[0])*.10,half?height:-height,-height*.14]);
                    teeth.loft(5,(_,u)=>({center:lerp(root,tip,u),x:[1,0,0],y:[0,0,1],rx:Math.max(L*.0001,height*.20*(1-u)),ry:Math.max(L*.00008,height*.14*(1-u))}),8,colors.light,bind(t,!!half),true);
                }
            }finish(teeth,'Teeth',{kind:'tooth',roughness:.32,noSurfaceDetail:true});
        }
        for(let i=0;i<r.eyeCount;i++){
            const sign=i%2?-1:1,t=.065+Math.floor(i/2)*.013,s=section(t),radius=L*.0045*r.eyeSize;
            const p=[s.x+sign*(s.w-radius*.4),s.upperY+s.top*.28,s.z],facing=norm([sign,.1,.4]),m=new Props.ExactMesh();
            m.sphere(p,radius,colors.eye,Props.rigid(headBone),10,16);
            m.disk(add(p,mul(facing,radius*.94)),facing,radius*.22,colors.dark,Props.rigid(headBone),12);
            m.sphere(add(p,add(mul(facing,radius*.86),[0,radius*.28,0])),radius*.10,[.85,.73,.60],Props.rigid(headBone),4,6);
            finish(m,'Eye '+i,{kind:'eye',roughness:.18});
        }
        const palps=new Props.ExactMesh();
        for(const sign of [-1,1]){const s=section(.035),root=[s.x+sign*s.w*.82,s.upperY+s.top*.15,s.z],length=L*.025*r.appendageLength;
            palps.tube([root,add(root,[sign*length*.65,-length*.2,length*.25]),add(root,[sign*length*.75,-length*.35,length*.7]),add(root,[sign*length*.25,-length*.15,length])],[L*.0025,L*.002,L*.0012,L*.0002],8,colors.mark,Props.rigid(headBone));
        }finish(palps,'Oral palps',{kind:'aquatic',roughness:.53,noSurfaceDetail:true});
        return chain;
    }

    function worm(C, centipede = false) {
        if(!centipede&&C.r.wormType==='goauld')return symbiote(C);
        const { r, L, Y, rootBone, headBone, colors, bone, finish, eye } = C, count = r.segments, chain = [rootBone], type=centipede?'centipede':r.wormType;
        C.bones[rootBone].head = [0, Y, L * 0.46]; C.bones[rootBone].tail = [0, Y, L * 0.46 - L / count];
        for (let i = 1; i < count; i++) chain.push(bone('Segment' + i, chain[i - 1], [0, Y, L * (0.46 - i / count)], [0, Y, L * (0.46 - (i + 1) / count)], 'segment', i * 0.55));
        const skin = p => { const t = clamp((0.46 - p[2] / L) * count, 0, count - 1), i = Math.min(count - 2, Math.floor(t)), k = t - i; return { joints: [chain[i], chain[i + 1], 0, 0], weights: [1 - k, k, 0, 0] }; };
        const radiusAt=t=>{
            if(type==='tapeworm')return L*(.008+.045*ease(.03,.80,t))*r.girth;
            if(type==='roundworm')return L*(.0008+.022*Math.sin(Math.PI*t)**.68)*r.girth;
            if(type==='leech')return L*((.012+.045*Math.sin(Math.PI*t)**.7+.025*Math.exp(-(((t-.955)/.034)**2)))*(1-ease(.975,1,t))+.0008)*r.girth;
            const end=Math.max(.2,Math.sin(Math.PI*t)**.35),ring=.94+Math.cos(t*count*Math.PI*2)*.06;
            const collar=type==='earthworm'?1+.16*ease(.22,.24,t)*(1-ease(.31,.34,t)):1;
            return L*(centipede?.07:type==='bristleworm'?.035:.045)*r.girth*ring*end*collar*(1+(r.headSize-1)*Math.max(0,1-t/.2));
        };
        const depthAt=t=>radiusAt(t)*(type==='tapeworm'?.10:type==='leech'?.40-.30*Math.exp(-(((t-.955)/.04)**2)):1)*r.chestDepth;
        const mesh = new Props.ExactMesh(),rows=type==='roundworm'?(C.save?65:49):type==='leech'?count*(C.save?8:6)+1:count*(type==='tapeworm'?(C.save?10:8):(C.save?6:4))+1;
        const sideCount=type==='leech'?(C.save?40:32):(C.save?32:20);
        mesh.loft(rows,(_,t)=>{
            const fraction=t*count-Math.floor(t*count),groove=type==='tapeworm'?1-.14*Math.exp(-((Math.min(fraction,1-fraction)/.10)**2)):1;
            return{center:[0,Y,L*(.5-t)],x:[1,0,0],y:[0,1,0],rx:radiusAt(t)*groove,ry:depthAt(t)*groove};
        },sideCount,colors.main,skin,true);
        if(type==='tapeworm'){
            // A rounded rectangular cross-section makes a ribbon rather than
            // a flattened chain of cylinders. Adjacent proglottids stay joined.
            for(let row=0;row<rows;row++)for(let k=0;k<sideCount;k++){
                const i=(row*sideCount+k)*3,a=k/sideCount*Math.PI*2,c=Math.cos(a),d=Math.sin(a);
                if(Math.abs(c)>1e-6)mesh.p[i]*=Math.abs(c)**-.6;
                if(Math.abs(d)>1e-6)mesh.p[i+1]=Y+(mesh.p[i+1]-Y)*Math.abs(d)**-.6;
            }marineNormals(mesh);
        }
        const suckerAt=p=>{
            const anterior=Math.hypot(p[0]/(L*.014),(p[2]-L*.480)/(L*.014)),posterior=Math.hypot(p[0]/(L*.030),(p[2]+L*.455)/(L*.030));
            return anterior<posterior?{name:'Anterior sucker',distance:anterior,depth:L*.0018}:{name:'Posterior sucker',distance:posterior,depth:L*.0025};
        };
        if(type==='leech'){
            for(let i=0;i<mesh.p.length;i+=3)if(mesh.p[i+1]<Y){const pit=suckerAt(mesh.p.slice(i,i+3));mesh.p[i+1]+=pit.depth*(1-ease(.35,1,pit.distance));}
            marineNormals(mesh);
        }
        const body=finish(mesh,'Body',{kind:centipede?'skin':'aquatic',roughness:type==='roundworm'?.3:type==='earthworm'||type==='bristleworm'?.36:.58});C.pattern(body);
        // Natural worm coloring: earthworm dorsal vessel, darker front and orange
        // clitellum; nematode lateral lines; medicinal-leech stripes and spots;
        // bristleworm segment bands. Wet cuticles carry a faint thin-film sheen.
        // The pattern (C.pattern) stays under it: each kind's coloring starts from the patterned color, not the plain coat.
        const band=rgb(r.colors.band||(type==='leech'?'#b8642c':'#c9805e'));
        // The pattern laid out on the worm itself, by segment and around the body: the shared painter
        // measures in body lengths, and a worm a fiftieth as wide as it is long showed no spots and hairline stripes.
        // The marking color, darkened only as far as a pattern needs to show on the main color (a pink earthworm's default marking is nearly its coat).
        const lum=v=>.2126*v[0]+.7152*v[1]+.0722*v[2],ink=mix(colors.mark,[.03,.025,.025],clamp((.3-Math.abs(lum(colors.main)-lum(colors.mark)))/Math.max(.05,lum(colors.mark)),0,.6));
        const wormMark=(t,a,up)=>{
            const k=t*count/(r.patternScale||1),cell=Math.floor(k),f=k-cell,ring=ease(.08,.2,f)*(1-ease(.8,.92,f));
            switch(r.pattern){
                case 'stripes':return cell%2?ring:0;
                case 'tabby':return cell%2?ring*ease(.35,.55,fbm(t*24,a*1.5)):0;
                case 'spots':case 'rosettes':case 'dapple':{
                    const n=6,u=(a/(Math.PI*2)+.5)*n+(cell%2)*.5,du=u-Math.floor(u)-.5,dv=f-.5,d=Math.hypot(du*2.2,dv*1.6);
                    const dot=1-ease(.5,.64,d);return r.pattern==='rosettes'?dot*ease(.18,.3,d):r.pattern==='dapple'?dot*.6:dot;
                }
                case 'countershade':return ease(.05,.65,up)*.9;
                case 'saddle':return ease(.32,.38,t)*(1-ease(.62,.68,t))*ease(-.2,.3,up);
                case 'piebald':return ease(.5,.58,fbm(t*7+3.1,a*.9));
                case 'points':return 1-ease(.06,.16,t)*(1-ease(.84,.94,t));
                default:return 0;
            }
        };
        if(!centipede&&body)for(let i=0;i<body.positions.length;i+=3){
            const x=body.positions[i],y=body.positions[i+1]-Y,z=body.positions[i+2],t=clamp(.5-z/L,0,1),R=Math.max(1e-6,radiusAt(t)),a=Math.atan2(y/Math.max(1e-6,depthAt(t)),x/R),up=Math.sin(a),side=Math.abs(Math.cos(a));
            const seg=t*count-Math.floor(t*count),groove=Math.exp(-((Math.min(seg,1-seg)/.07)**2));
            let c=Array.from(body.colors.subarray(i,i+3));
            if(type==='earthworm'){c=mix(c,colors.light,ease(-.2,-.9,up)*.6);c=mix(c,colors.mark,(1-ease(.05,.35,t))*.45+Math.exp(-((Math.cos(a)/.12)**2))*Math.max(0,up)*.5);c=mix(c,band,ease(.2,.23,t)*(1-ease(.31,.34,t))*.7);c=c.map(v=>v*(1-groove*.25));}
            else if(type==='roundworm'){c=mix(c,colors.light,.3+.2*Math.max(0,up));c=mix(c,colors.mark,Math.exp(-((Math.sin(a)/.06)**2))*.55);c=c.map(v=>v*(.96+.04*Math.sin(t*620)));}
            else if(type==='leech'){c=mix(mix(c,colors.light,ease(-.1,-.7,up)*.7),band,Math.max(0,up)*(Math.exp(-(((side-.45)/.07)**2))+Math.exp(-(((side-.18)/.05)**2))*.7)*.8);const spot=hash2(Math.floor(t*120),Math.floor(a*3))>.6&&Math.exp(-(((side-.45)/.05)**2))>.5&&up>0;if(spot)c=mix(c,rgb('#0d0f0b'),.75);c=mix(c,rgb('#0d0f0b'),Math.exp(-(((up+.15)/.08)**2))*.6*(1-ease(.97,.99,side)));}
            else if(type==='bristleworm'){c=mix(c,colors.light,ease(-.1,-.8,up)*.6);c=mix(c,colors.mark,groove*.6+ease(.6,.75,fbm(t*30,a*2))*.2);}
            c=mix(c,ink,clamp(wormMark(t,a,up)*r.patternAmount,0,1)*.8);
            body.colors.set(c,i);
        }
        if(body&&['earthworm','bristleworm','roundworm'].includes(type)){body.iridescence=type==='roundworm'?.2:.4;body.iridescenceIOR=1.45;body.iridescenceThicknessRange=[200,480];}
        if(type==='leech'){
            for(let i=0;i<body.positions.length;i+=3)if(body.positions[i+1]<Y){const pit=suckerAt(body.positions.subarray(i,i+3)),f=(1-ease(.35,1,pit.distance))*.6;body.colors.set(mix(Array.from(body.colors.subarray(i,i+3)),colors.mark,f),i);}
            surfaceRegions(C,body,p=>{const pit=suckerAt(p);return p[1]<Y&&pit.distance<1.10?pit.name:null;});
        }
        if(type==='tapeworm'){
            const m=new Props.ExactMesh(),center=[0,Y,L*.518],binding=Props.rigid(rootBone),radii=[L*.017,L*.016,L*.025];
            m.sphere(center,L*.020,colors.light,binding,C.save?32:24,C.save?64:48,[.85,.8,1.25]);
            const pitAt=p=>{
                const a=Math.atan2((p[1]-center[1])/radii[1],p[0]/radii[0]);let best={distance:Infinity,index:0};
                for(let k=0;k<4;k++){const angle=Math.PI*.25+k*Math.PI*.5,delta=Math.atan2(Math.sin(a-angle),Math.cos(a-angle)),distance=Math.hypot(delta*.016/.008,(p[2]-center[2])/(L*.008));if(distance<best.distance)best={distance,index:k};}return best;
            };
            for(let i=0;i<m.p.length;i+=3){const pit=pitAt(m.p.slice(i,i+3)),depth=L*.0055*(1-ease(.25,1,pit.distance)),rim=L*.0007*Math.exp(-(((pit.distance-.95)/.18)**2)),scale=1+(rim-depth)/(L*.016);
                m.p[i]*=scale;m.p[i+1]=Y+(m.p[i+1]-Y)*scale;m.c.splice(i,3,...mix(colors.light,colors.mark,(1-ease(.25,.95,pit.distance))*.65));
            }
            marineNormals(m);const head=finish(m,'Scolex',{kind:'aquatic',roughness:.58,noSurfaceDetail:true});
            surfaceRegions(C,head,p=>{const pit=pitAt(p);return pit.distance<1.15?'Scolex sucker '+pit.index:null;});
        }else if(type==='bristleworm'){
            const lobes=new Props.ExactMesh(),bristles=new Props.ExactMesh();
            for(let segment=1;segment<count-1;segment++)for(const sign of [-1,1]){
                const t=(segment+.5)/count,R=radiusAt(t),root=[sign*R*.88,Y,L*(.5-t)],binding=skin(root),length=L*.035*r.appendageLength;
                lobes.sphere(root,L*.009,colors.main,binding,6,10,[1.5,.65,1]);
                for(let k=0;k<(C.save?5:3);k++){
                    const f=k/((C.save?5:3)-1)-.5,p=add(root,[sign*L*.006,L*.002,f*L*.012]);
                    bristles.tube([p,add(p,[sign*length*.6,L*.006,f*length*.4]),add(p,[sign*length,L*(.007+f*.01),f*length*.7])],[L*.0012,L*.0007,L*.00012],5,colors.light,binding);
                }
            }finish(lobes,'Parapodia',{kind:'aquatic',roughness:.58});finish(bristles,'Chaetae',{roughness:.58,noSurfaceDetail:true});
            const palps=new Props.ExactMesh();for(const sign of [-1,1])palps.tube([[sign*L*.008,Y+L*.005,L*.48],[sign*L*.024,Y+L*.010,L*.53],[sign*L*.033,Y+L*.014,L*.55]],[L*.003,L*.0018,L*.0003],8,colors.main,Props.rigid(rootBone));finish(palps,'Sensory palps',{kind:'aquatic',roughness:.58});
        }
        for(let i=0;i<r.eyeCount;i++){
            const sign=i%2?-1:1,t=.025+Math.floor(i/2)*.014,R=radiusAt(t),H=depthAt(t),radius=L*(type==='leech'?.0015:.004)*r.eyeSize;
            eye([sign*R*.55,Y+H*.78,L*(.5-t)],radius,Props.rigid(rootBone),i,[sign*.3,.8,.5]);
        }
        if(type==='earthworm'){
            // Four pairs of short setae per segment, ventrolateral, and a prostomium lobe over the mouth.
            const setae=new Props.ExactMesh();
            for(let k=1;k<count-1;k++)for(const a of [-.35,-.6,-Math.PI+.35,-Math.PI+.6]){const t=(k+.5)/count,R=radiusAt(t),H=depthAt(t),p=[Math.cos(a)*R*.98,Y+Math.sin(a)*H*.98,L*(.5-t)],n=norm([Math.cos(a),Math.sin(a),0]);setae.tube([p,add(p,add(mul(n,L*.006),[0,0,-L*.003]))],[L*.0009,L*.0001],4,mix(colors.light,colors.main,.3),skin(p));}
            setae.sphere([0,Y+depthAt(.012)*.45,L*.497],1,colors.mark,Props.rigid(rootBone),8,12,[radiusAt(.02)*.55,depthAt(.02)*.4,L*.012]);
            finish(setae,'Setae and prostomium',{kind:'aquatic',roughness:.4,noSurfaceDetail:true});
        }
        if(type==='roundworm'){
            // Three lips around the nematode mouth.
            const lips=new Props.ExactMesh(),R=radiusAt(.004);
            for(let k=0;k<3;k++){const a=Math.PI/2+k*Math.PI*2/3;lips.sphere([Math.cos(a)*R*.55,Y+Math.sin(a)*R*.55,L*.5],1,colors.light,Props.rigid(rootBone),6,10,[R*.5,R*.5,L*.002]);}
            finish(lips,'Lips',{kind:'aquatic',roughness:.3,noSurfaceDetail:true});
        }
        if(type==='tapeworm'){
            // Rostellum with a double crown of small curved hooks atop the scolex.
            const hooks=new Props.ExactMesh(),c0=[0,Y,L*.539];
            hooks.sphere(c0,1,colors.light,Props.rigid(rootBone),8,12,[L*.006,L*.006,L*.005]);
            for(let k=0;k<22;k++){const a=k/22*Math.PI*2,rr=L*(k%2?.0062:.0052),p=add(c0,[Math.cos(a)*rr,Math.sin(a)*rr,L*.001]),o=[Math.cos(a),Math.sin(a),0];hooks.tube([p,add(p,add(mul(o,L*.004),[0,0,L*.003])),add(p,add(mul(o,L*.006),[0,0,L*.0005]))],[L*.0009,L*.0006,L*.0001],5,rgb('#c8b48a'),Props.rigid(rootBone));}
            finish(hooks,'Rostellum hooks',{roughness:.35,noSurfaceDetail:true});
        }
        if(!['tapeworm','leech'].includes(type)){
            const mouth=new Props.ExactMesh();mouth.disk([0,Y-(type==='earthworm'?depthAt(.01)*.35:0),L*.5004],[0,0,1],L*(type==='roundworm'?.001:type==='bristleworm'?.004:.0045),type==='earthworm'?mix(colors.mark,colors.dark,.5):colors.dark,Props.rigid(rootBone),16);finish(mouth,'Mouth');
        }
        return chain;
    }
    /** Wolf-spider style arachnid: a flattened prosoma with a raised ocular area,
     * fovea and radial striae; a hairy ovoid opisthosoma on a narrow pedicel with a
     * cardiac mark and chevrons; chelicerae with fangs; pedipalps; seven-segment
     * legs arching to high knees with banded hairs and spines; eight simple eyes. */
    function spiderBody(C) {
        const { r, L, Y, colors, bone, rootBone, headBone, finish } = C, h = r.headSize, g = r.girth, d = r.chestDepth;
        const pz = L * .1, pl = L * .13 * h, pw = L * .105 * g * h, ph = L * .05 * d * h, az = -L * .2, al = L * .2, aw = L * .14 * g, ah = L * .12 * d;
        C.bones[rootBone].head = [0, Y, pz]; C.bones[rootBone].tail = [0, Y, pz - pl];
        C.bones[headBone].head = [0, Y, pz]; C.bones[headBone].tail = [0, Y, pz + pl];
        const abdomen = bone('Abdomen', rootBone, [0, Y, pz - pl * .9], [0, Y, az - al], 'abdomen');
        const body = new Props.ExactMesh(), hair = new Props.ExactMesh(), base = colors.main, dark = colors.mark, pale = colors.light;
        // Prosoma: dark with a pale median band and pale margins; rises toward the eyes.
        body.loft(C.save ? 41 : 31, (_, t) => {
            const z = pz + pl * (1 - 2 * t), s = Math.sqrt(Math.max(.004, 1 - (1 - 2 * t) ** 2)), head = ease(.25, .7, 1 - t);
            return { center: [0, Y + ph * (.1 + .25 * head), z], x: [1, 0, 0], y: [0, 1, 0], rx: pw * s ** .8 * (1 - .22 * head), ry: ph * s ** .7 * (1 + .25 * head) };
        }, C.save ? 32 : 24, (t, a) => { const x = Math.cos(a), up = Math.sin(a); return up < 0 ? mix(dark, base, .3) : mix(mix(dark, base, .45), pale, Math.max(Math.exp(-((x / .16) ** 2)), ease(.72, .9, Math.abs(x)) * .8) * .7 * r.patternAmount); }, p => ({ joints: [rootBone, headBone, 0, 0], weights: [1 - ease(pz - pl * .2, pz + pl * .4, p[2]), ease(pz - pl * .2, pz + pl * .4, p[2]), 0, 0] }), true);
        // Pedicel and opisthosoma with a dark cardiac mark and paler chevrons behind it.
        body.tube([[0, Y, pz - pl * .85], [0, Y + ph * .1, pz - pl * 1.1], [0, Y + ah * .2, az + al * .85]], [L * .022 * g, L * .016 * g, L * .03 * g], 12, dark, p => ({ joints: [rootBone, abdomen, 0, 0], weights: [1 - ease(pz - pl, az + al, p[2]), ease(pz - pl, az + al, p[2]), 0, 0] }));
        body.loft(C.save ? 41 : 31, (_, t) => {
            const z = az + al * (1 - 2 * t), s = Math.sqrt(Math.max(.003, 1 - (1 - 2 * t) ** 2));
            return { center: [0, Y + ah * (.35 + .1 * Math.sin(t * Math.PI)), z], x: [1, 0, 0], y: [0, 1, 0], rx: aw * s ** .85 * (1 - .15 * t), ry: ah * s ** .8 };
        }, C.save ? 32 : 24, (t, a) => {
            const x = Math.cos(a), up = Math.sin(a); if (up < -.2) return mix(dark, base, .5);
            const cardiac = Math.exp(-((x / (.13 * (1 - t))) ** 2)) * (1 - ease(.35, .5, t));
            const chevron = Math.exp(-((((t - .45 + Math.abs(x) * .35) * 9 % 1 + 1) % 1 - .5) ** 2 / .02)) * ease(.4, .5, t) * (1 - ease(.85, .95, t)) * (1 - ease(.3, .5, Math.abs(x)));
            const m = fbm(t * 9, x * 5, 3);
            return mix(mix(mix(base, dark, (m - .3) * .6), dark, cardiac * .8 * r.patternAmount), pale, chevron * .5 * r.patternAmount);
        }, p => Props.rigid(abdomen), true);
        // Spinnerets at the tip.
        for (const s of [-1, 1]) body.tube([[s * L * .008, Y + ah * .15, az - al * .95], [s * L * .012, Y + ah * .05, az - al * 1.05]], [L * .007, L * .004], 8, dark, Props.rigid(abdomen));
        body.computeNormals();
        finish(body, 'Body', { kind: 'aquatic', roughness: .9 });
        // Dense setae over the opisthosoma and prosoma margins.
        const count = C.save ? 900 : 600;
        for (let i = 0; i < count; i++) {
            const a = i * 2.399963, y = 1 - (i + .5) / count * 2, rad = Math.sqrt(1 - y * y), n = [Math.cos(a) * rad, y, Math.sin(a) * rad];
            const p = [n[0] * aw * .97, Y + ah * .35 + n[1] * ah * .97, az + n[2] * al * .97], len = L * (.006 + .004 * Math.sin(i * 1.7) ** 2);
            hair.tube([p, add(p, mul(norm(add(n, [0, .2, -.9])), len * 1.6))], [L * .0016, L * .0002], 3, mix(base, pale, (i % 7) / 14), Props.rigid(abdomen), false);
        }
        finish(hair, 'Setae', { roughness: .8, noSurfaceDetail: true });
        // Chelicerae: stout bulging bases angled down, curved dark fangs folded beneath.
        const mouth = new Props.ExactMesh();
        for (const s of [-1, 1]) {
            const a0 = [s * L * .022 * h, Y + ph * .55, pz + pl * .9], a1 = [s * L * .026 * h, Y - ph * .45, pz + pl * 1.12];
            mouth.tube([a0, lerp(a0, a1, .5), a1], [L * .014 * h, L * .016 * h, L * .011 * h], 12, mix(dark, base, .25), Props.rigid(headBone));
            const f0 = add(a1, [0, -L * .006, -L * .002]);
            mouth.tube([f0, add(f0, [-s * L * .012, -L * .006, -L * .006]), add(f0, [-s * L * .022, -L * .002, -L * .012])], [L * .006 * h, L * .004 * h, L * .0005], 8, rgb('#120f0e'), Props.rigid(headBone));
            // Pedipalps: short five-segment feelers beside the chelicerae.
            const p0 = [s * L * .04 * h, Y - ph * .2, pz + pl * .85], p1 = add(p0, [s * L * .03, L * .03, L * .05]), p2 = add(p1, [s * L * .01, -L * .045, L * .03]);
            mouth.tube([p0, p1], [L * .009, L * .008], 8, base, Props.rigid(headBone)); mouth.tube([p1, lerp(p1, p2, .5), p2], [L * .008, L * .008, L * .006], 8, mix(base, dark, .3), Props.rigid(headBone));
        }
        finish(mouth, 'Chelicerae and pedipalps', { roughness: .5 });
        // Eight simple eyes: a front row of four, two large posterior medians, two posterior laterals.
        const eyes = [[.018, .55, .97, .007], [.006, .55, .985, .006], [.016, .82, .9, .015], [.03, .9, .72, .011]];
        for (let i = 0; i < r.eyeCount; i++) {
            const [x, y, z, rad] = eyes[Math.floor(i / 2) % 4], s = i % 2 ? -1 : 1, row = Math.floor(i / 8);
            const center = [s * L * x * h * (1 + row * .4), Y + ph * (y + .15) * (1 + row * .1), pz + pl * z * (1 - row * .1)];
            const e = new Props.ExactMesh(); e.sphere(center, L * rad * r.eyeSize, rgb('#07090b'), Props.rigid(headBone), 8, 12);
            finish(e, 'Eye ' + i, { kind: 'eye', roughness: .08 });
        }
        // Legs: I and IV longest; femur arches to a high patella, tibia and metatarsus
        // step down, tarsus rests on the ground; banded, hairy, with paired spines.
        const ground = Y - L * .11;
        for (let pair = 0; pair < r.limbPairs; pair++) for (const s of [-1, 1]) {
            const u = r.limbPairs > 1 ? pair / (r.limbPairs - 1) : .5, fan = 1 - 2 * u, ang = (.95 - u * 1.9) * (u < .5 ? 1 : 1.12);
            const lenK = L * r.appendageLength * (.42 - .1 * Math.sin(u * Math.PI)) , z0 = pz + pl * (.45 - u * .9);
            const hit = bodyRay(C, [0, Y + ph * .05, z0], [s, 0, 0]), root = [hit ? hit[0] * .8 : s * pw * .5, Y + ph * .05, z0], dir = [s * Math.cos(ang * .7), 0, Math.sin(ang * .7)];
            const knee = add(root, [dir[0] * lenK * .42, L * .07, dir[2] * lenK * .42]);
            const ankle = add(knee, [dir[0] * lenK * .38, -L * .05, dir[2] * lenK * .38]);
            const foot = [ankle[0] + dir[0] * lenK * .22, ground, ankle[2] + dir[2] * lenK * .22];
            const phase = pair * Math.PI + (s < 0 ? Math.PI : 0);
            const a = bone('Leg' + s + '_' + pair + '_0', headBone, root, knee, 'legUpper', phase), b = bone('Leg' + s + '_' + pair + '_1', a, knee, foot, 'legLower', phase);
            C.bones[a].motionScale = .5; C.bones[b].motionScale = .6;
            const m = new Props.ExactMesh(), rr = L * .0105, band = t => mix(base, dark, ease(.6, .8, Math.abs(Math.sin(t * Math.PI * 5))) * .6 * r.patternAmount);
            m.tube([lerp(root, knee, -.08), lerp(root, knee, .12)], [rr * 1.6, rr * 1.4], 10, dark, Props.rigid(a));
            const femur = [lerp(root, knee, .1), add(lerp(root, knee, .55), [0, L * .012, 0]), knee];
            m.tube(femur, [rr * 1.35, rr * 1.3, rr * 1.05], 10, band(.2), Props.rigid(a));
            m.sphere(knee, rr * 1.1, mix(base, dark, .4), Props.rigid(b), 6, 10);
            m.tube([knee, lerp(knee, ankle, .5), ankle], [rr * 1.0, rr * .9, rr * .75], 10, band(.6), Props.rigid(b));
            m.tube([ankle, lerp(ankle, foot, .6), foot], [rr * .72, rr * .55, rr * .3], 10, band(.9), Props.rigid(b));
            for (const fork of [-1, 1]) m.tube([foot, add(foot, [dir[0] * L * .006, -L * .001, fork * L * .003])], [rr * .18, rr * .03], 4, dark, Props.rigid(b));
            for (let j = 1; j < 16; j++) {
                const [p0, p1, seg] = j < 6 ? [femur[0], knee, a] : j < 11 ? [knee, ankle, b] : [ankle, foot, b], t = (j % 5 + .5) / 5;
                const q = lerp(p0, p1, t), out = norm(add(sub(q, [0, q[1], 0]), [0, 0, 0]));
                for (const side of [-1, 1]) hair.tube([q, add(q, [side * L * .009, L * .008, -fan * L * .003 + out[2] * L * .001])], [L * .0014, L * .00015], 3, j % 3 ? mix(base, pale, .3) : dark, Props.rigid(seg), false);
            }
            finish(m, 'Leg ' + s + '/' + pair, { roughness: .6 });
        }
        finish(hair, 'Leg setae', { roughness: .8, noSurfaceDetail: true });
    }
    function arthropod(C) {
        const { r, L, Y, colors, bone, rootBone, headBone, finish, eye } = C;
        const crab = r.kind === 'crab', spider = r.kind === 'spider', centipede = r.kind === 'centipede';
        if (spider) return spiderBody(C);
        const chain = centipede ? worm(C, true) : null;
        if (!centipede) {
            const m = new Props.ExactMesh();
            if(crab){
                m.sphere([0,Y,L*.015],L*.24,colors.main,Props.rigid(rootBone),24,40,[1.3*r.girth,.6*r.chestDepth,1.02]);
            }else{
                m.sphere([0,Y,-L*.18],L*.22,colors.main,Props.rigid(rootBone),20,32,[r.girth,r.chestDepth*.85,1.35]);
                m.sphere([0,Y,L*.12],L*.16,colors.main,Props.rigid(spider?headBone:rootBone),20,32,[r.girth*(spider?r.headSize:1),.8*(spider?r.headSize:1),spider?1.25*r.headSize:.95]);
                if(!spider)m.sphere([0,Y,L*.31],L*.11*r.headSize,colors.mark,Props.rigid(headBone),16,24,[1,.8,.85]);
            }
            C.pattern(finish(m,'Body',{kind:'aquatic',metalness:spider?0:.12,roughness:.5}));
            if(!spider&&!crab){
                const seam=new Props.ExactMesh(),path=[];
                for(let j=0;j<=24;j++){const z=L*(.015-j/24*.445),hit=bodyRay(C,[0,Y+L,z],[0,-1,0]);if(hit)path.push(add(hit,[0,L*.0005,0]));}
                if(path.length>2)seam.tube(path,L*.0015,8,colors.mark,Props.rigid(rootBone));
                finish(seam,'Wing-case seam',{kind:'aquatic',roughness:.5});
            }
        }
        for (let pair = 0; pair < r.limbPairs; pair++) for (const sign of [-1, 1]) {
            const z = L * (spider ? .12+(.13-pair/Math.max(1,r.limbPairs-1)*.23)*r.headSize : (crab?.15:.2)-pair/Math.max(1,r.limbPairs-1)*(centipede?.65:crab?.30:.19)), parent = chain ? chain[Math.round(pair / Math.max(1, r.limbPairs - 1) * (chain.length - 1))] : spider ? headBone : rootBone;
            const t = clamp(0.5 - z / L, 0, 1);
            const rootX = centipede ? L * 0.07 * r.girth * Math.max(0.2, Math.sin(Math.PI * t) ** 0.35) * 0.65 : L * 0.11 * r.girth;
            const span = L * (centipede ? 0.11 : 0.38) * r.appendageLength;
            const rootP = [sign * rootX, Y - L * (centipede ? 0.01 : 0.05), z], knee = [sign * (rootX + span * 0.65), Y + L * (centipede ? 0.005 : 0.025), z + L * (pair % 2 ? -0.1 : 0.1) * (centipede ? 0.2 : 1)], foot = [sign * (rootX + span), Y - L * (centipede ? 0.07 : 0.23), z - L * (centipede ? 0.01 : 0.06)];
            const hit=bodyRay(C,[0,Y,z],[sign,0,0]);
            if(hit){rootP[0]=hit[0]*.86;rootP[1]=Y;}
            const a = bone('Leg' + sign + '_' + pair + '_0', parent, rootP, knee, 'legUpper', pair * Math.PI + (sign < 0 ? Math.PI : 0));
            const b = bone('Leg' + sign + '_' + pair + '_1', a, knee, foot, 'legLower', pair * Math.PI + (sign < 0 ? Math.PI : 0));
            const m = new Props.ExactMesh(), radius = L * (centipede ? 0.0075 : spider ? 0.012 : 0.016), legColor = centipede ? colors.light : colors.main;
            m.tube([rootP, lerp(rootP, knee, .5), knee], [radius * 1.4, radius * 1.2, radius], 12, legColor, Props.rigid(a)); m.sphere(knee, radius * 1.05, mix(legColor, colors.mark, .4), Props.rigid(b), 6, 10);
            m.tube([knee, foot, add(foot, [sign * L * 0.035, 0, L * 0.035])], [radius, radius * 0.55, radius * 0.12], 12, legColor, Props.rigid(b));
            if (centipede) for (const t of [.3, .6]) m.tube([lerp(knee, foot, t), add(lerp(knee, foot, t), [sign * radius * 1.4, radius, -radius])], [radius * .3, radius * .04], 4, colors.mark, Props.rigid(b));
            if (crab && pair === 0) {
                const claw = add(foot, [0, L * 0.08, L * 0.1]);
                m.tube([knee, claw], [radius * 1.2, radius * 1.8], 12, colors.main, Props.rigid(b));
                m.sphere(claw, radius * 2.8, colors.main, Props.rigid(b), 10, 16, [1, 0.7, 1.3]);
                for (const s of [-1, 1]) m.tube([add(claw, [s * radius * 1.6, 0, radius]), add(claw, [s * radius * 2.2, 0, radius * 4]), add(claw, [s * radius * 0.6, 0, radius * 5])], [radius, radius * 0.65, radius * 0.15], 10, colors.main, Props.rigid(b));
            }
            finish(m, 'Leg ' + sign + '/' + pair, { roughness: 0.46 });
        }
        if(!centipede)for(let i=0;i<r.eyeCount;i++){
            const sign=i%2?-1:1,row=Math.floor(i/2),radius=L*.015*r.eyeSize;
            const center=[0,Y,L*(crab?.015:spider?.12:.31)],direction=norm([sign*(.45-row*.055),.27+row*.08,1]);
            const hit=bodyRay(C,center,direction);if(!hit)continue;
            let p=add(hit,mul(direction,-radius*.22));
            if(crab){
                p=add(hit,[sign*L*.025,L*.10*r.headSize,L*.025]);
                const stalk=new Props.ExactMesh();stalk.tube([lerp(center,hit,.91),p],[L*.009,L*.0055],12,colors.main,Props.rigid(rootBone));finish(stalk,'Eye stalk '+i,{kind:'aquatic',roughness:.5});
            }
            eye(p,radius,Props.rigid(crab?rootBone:headBone),i,direction);
        }
        if (!spider && !crab) {
            const antennae = new Props.ExactMesh();
            for(const sign of [-1,1]){
                const origin=[0,Y,L*(centipede?.43:.31)],aim=[sign*.5,.25,1],hit=bodyRay(C,origin,aim);
                if(!hit)continue;
                const root=lerp(origin,hit,.88),path=Array.from({length:13},(_,k)=>{const t=k/12;return add(root,[sign*L*(.14*t-.025*t*t),L*(.10*t-.06*t*t),L*(.25*t-.025*Math.sin(t*Math.PI))]);});
                antennae.tube(path,path.map((_,i)=>L*(.005*(1-i/12)+.001)),8,colors.mark,hit.skin);
                // Beaded antennomeres.
                if(centipede)for(let k=1;k<12;k++)antennae.sphere(path[k],L*(.0058*(1-k/12)+.0014),colors.mark,hit.skin,5,8,[1,1,1.25]);
            }
            finish(antennae, 'Antennae');
        }
        if (centipede) {
            // Dorsal tergites with darker hind margins, and the forcipules (venom claws)
            // curving forward under the head.
            const plates=new Props.ExactMesh(),count=chain.length;
            for(let i=0;i<count;i++){
                const t=(i+.55)/count,z=L*(.5-t),hit=bodyRay(C,[0,Y+L,z],[0,-1,0]);if(!hit)continue;
                const R=hit[1]-Y,half=L/count*.62;
                plates.loft(9,(_,u)=>{const zz=z+half*(1-2*u),bulge=Math.sin(Math.PI*Math.min(1,u*1.1))**.5;return{center:[0,Y+R*.45+R*.12*bulge,zz],x:[1,0,0],y:[0,1,0],rx:Math.max(L*.002,R*1.12*(.85+.15*bulge)),ry:Math.max(L*.001,R*.62*(.8+.2*bulge))};},C.save?20:16,(u)=>mix(colors.main,colors.mark,ease(.55,.9,u)*.75),Props.rigid(chain[i]),true);
            }
            finish(plates,'Tergites',{kind:'aquatic',roughness:.36,metalness:.08});
            // The forcipules grow from a plate (the coxosternum) under the first trunk segment, their bases sunk
            // in the underside, and curve forward and in under the head until their tips nearly meet; small
            // mandibles hang from the head capsule's front. Lengths along the body are given before its
            // Body length stretch, so they keep their shape at any length.
            const claws=new Props.ExactMesh(),zk=1/Math.max(.2,r.bodyLength||1),z0=L*(.46-.45/count),dark=mix(colors.mark,[0,0,0],.4);
            const under=bodyRay(C,[0,Y,z0],[0,-1,0]),floor=under?under[1]:Y-L*.03;
            claws.sphere([0,floor+L*.002,z0],L*.026,mix(colors.mark,colors.main,.35),Props.rigid(chain[0]),8,14,[1,.32,.9*zk]);
            for(const sign of [-1,1]){
                const d=norm([sign*.5,-.86,0]),h=bodyRay(C,[0,Y,z0],d)||[sign*L*.02,floor,z0],a=sub(h,mul(d,L*.008));
                const path=[a,add(h,[sign*L*.012,-L*.008,L*.012*zk]),add(h,[sign*L*.014,-L*.01,L*.04*zk]),add(h,[sign*L*.002,-L*.009,L*.062*zk]),add(h,[-sign*L*.012,-L*.007,L*.07*zk])];
                claws.tube(path,[L*.012,L*.0095,L*.0072,L*.004,L*.0007],10,dark,Props.rigid(chain[0]));
                const md=norm([sign*.45,-.5,.75]),mh=bodyRay(C,[0,Y,L*.43],md);
                if(mh){const mb=sub(mh,mul(md,L*.005));claws.tube([mb,add(mh,[sign*L*.004,-L*.004,L*.008*zk]),add(mh,[-sign*L*.005,-L*.006,L*.014*zk])],[L*.006,L*.0045,L*.001],8,dark,Props.rigid(chain[0]));}
            }
            finish(claws,'Forcipules',{roughness:.3,noSurfaceDetail:true});
        }
    }
    /** Moon-jelly style medusa: a translucent scalloped bell (exumbrella and a
     * fainter subumbrella), four horseshoe gonads, sixteen radial canals with a
     * ring canal, rhopalia lappets, fine marginal tentacles and frilled oral arms. */
    function jellyfish(C) {
        const { r, L, Y, colors, rootBone, finish } = C, top = Y + L * 0.45;
        const sides=C.save?64:48, rows=C.save?33:25;
        const at=(t,a,inside=0)=>{const angle=.003+t*Math.PI*.6,R=(L*.27*Math.sin(angle)*r.girth-inside)*(1+.035*Math.cos(a*8)*t**6);
            return [Math.cos(a)*R,top+L*.24*r.chestDepth*Math.cos(angle),Math.sin(a)*R];};
        const sheet=(name,inside,lower,last,material,tint)=>{
            const m=new Props.ExactMesh();
            m.loft(rows,(_,t)=>{const p=at(t*last,0,inside);return {center:[0,p[1]-lower*(1-t),0],x:[1,0,0],y:[0,0,1],rx:p[0],ry:p[0]};},sides,(t,a)=>tint(t*last,a),Props.rigid(rootBone),false);
            for(let row=0;row<rows;row++)for(let k=0;k<sides;k++){const t=row/(rows-1)*last,a=k/sides*Math.PI*2,q=at(t,a,inside),i=(row*sides+k)*3;m.p[i]=q[0];m.p[i+1]=q[1]-lower*(1-t/last);m.p[i+2]=q[2];}
            marineNormals(m);return finish(m,name,material);
        };
        // Faintly tinted gel, denser toward the apex.
        sheet('Body',0,0,1,{kind:'aquatic',opacity:.42,doubleSided:true,roughness:.12,normalScale:.035},(t)=>mix(mix(colors.main,colors.light,.35),colors.main,1-t));
        sheet('Subumbrella',L*.016,L*.02,.96,{kind:'aquatic',opacity:.22,doubleSided:true,roughness:.2,noSurfaceDetail:true},()=>mix(colors.main,colors.light,.5));
        // A rolled gelatinous margin closes the paper-thin bell edge. Sampling
        // its polygon, rather than an analytic circle, seats each root exactly.
        const edge=a=>{const q=(a/(Math.PI*2)%1+1)%1*sides,i=Math.floor(q),u=q-i;return lerp(at(1,i/sides*Math.PI*2),at(1,(i+1)/sides*Math.PI*2),u);};
        const rim=new Props.ExactMesh(),rimPath=Array.from({length:sides+1},(_,i)=>edge(i/sides*Math.PI*2));
        rim.tube(rimPath,L*.0035,8,colors.light,Props.rigid(rootBone),false);
        // Eight rhopalia sit in notches between the marginal lobes.
        for(let k=0;k<8;k++){const a=(k+.5)/8*Math.PI*2,p=edge(a);rim.sphere(add(p,[0,-L*.003,0]),L*.0045,mix(colors.mark,colors.light,.3),Props.rigid(rootBone),5,8);}
        finish(rim,'Bell margin',{kind:'aquatic',opacity:.78,roughness:.26,noSurfaceDetail:true});
        // Four horseshoe gonads around the stomach, seen through the bell.
        const organs=new Props.ExactMesh(),gy=top+L*.12*r.chestDepth;
        for(let g=0;g<4;g++){const q=(g+.5)/4*Math.PI*2,c=[Math.cos(q)*L*.055*r.girth,gy,Math.sin(q)*L*.055*r.girth],path=Array.from({length:17},(_,i)=>{const b=q+Math.PI+(i/16-.5)*Math.PI*1.65;return add(c,[Math.cos(b)*L*.038*r.girth,L*.012*Math.sin(i/16*Math.PI),Math.sin(b)*L*.038*r.girth]);});organs.tube(path,path.map((_,i)=>L*(.008+.004*Math.sin(i/16*Math.PI))),10,colors.mark,Props.rigid(rootBone));}
        organs.sphere([0,gy-L*.01,0],L*.03,mix(colors.mark,colors.light,.5),Props.rigid(rootBone),10,16,[r.girth,.5,r.girth]);
        finish(organs,'Bell core',{kind:'aquatic',opacity:.75,roughness:.3,emissive:r.colors.marking,emissiveIntensity:r.glow*.35});
        // Sixteen radial canals and a ring canal on the subumbrella.
        const ribs=new Props.ExactMesh();
        for(let k=0;k<16;k++){
            const a=k/16*Math.PI*2+Math.sin(k*1.7)*.04,start=.28,path=Array.from({length:rows},(_,j)=>{const t=start+(1-start)*j/(rows-1)*.97;return add(at(t,a+Math.sin(t*9+k)*.03*(k%2),L*.012),[0,-L*.004,0]);});
            ribs.tube(path,L*(k%4?.0008:.0012),5,colors.light,Props.rigid(rootBone),false);
        }
        const ringPath=Array.from({length:sides+1},(_,i)=>add(at(.965,i/sides*Math.PI*2,L*.012),[0,-L*.004,0]));
        ribs.tube(ringPath,L*.001,5,colors.light,Props.rigid(rootBone),false);
        finish(ribs,'Bell ribs',{kind:'aquatic',opacity:.6,roughness:.32,emissive:r.colors.light,emissiveIntensity:r.glow*.15});
        for(let i=0;i<r.eyeCount;i++){const a=i/r.eyeCount*Math.PI*2,p=edge(a),R=L*.015*r.eyeSize;C.eye(add(p,[-Math.cos(a)*R*.2,0,-Math.sin(a)*R*.2]),R,Props.rigid(rootBone),i,[Math.cos(a),0,Math.sin(a)]);}
        for(let a=0;a<r.appendages;a++){
            const angle=a/Math.max(1,r.appendages)*Math.PI*2,root=edge(angle),path=[];
            // Embed the fixed collar in the margin; lateral curl starts at zero.
            for(let k=0;k<=6;k++){const t=k/6,rad=(Math.hypot(root[0],root[2])-L*.002)*(1-t)+L*(.19+Math.sin(t*5+angle)*.025)*r.girth*t;
                path.push([Math.cos(angle)*rad,root[1]-t*L*.6*r.appendageLength,Math.sin(angle)*rad+Math.sin(t*7+angle)*L*.025*ease(0,.28,t)]);}
            appendage(C,'Tendril'+a,path,rootBone,L*.0034,angle,false,false,null,{color:mix(colors.light,colors.main,.4),material:{kind:'aquatic',opacity:.7,roughness:.25}});
        }
        // Four frilled oral arms hang from the mouth under the stomach.
        if(r.appendages>0)for(let a=0;a<4;a++){
            const angle=(a+.5)/4*Math.PI*2,path=Array.from({length:7},(_,k)=>{const t=k/6,rad=L*r.girth*(.03+t*.035);return [Math.cos(angle)*rad,top-L*r.chestDepth*.015-t*L*.44*r.appendageLength,Math.sin(angle)*rad+Math.sin(t*5+a)*L*.01];});
            appendage(C,'Oral arm'+a,path,rootBone,L*.016,angle,false,false,null,{wide:1.6,flat:.28,frill:.9,color:mix(colors.light,colors.mark,.25),material:{kind:'aquatic',opacity:.62,doubleSided:true,roughness:.25}});
        }
    }
    function adorn(C) {
        const { r, L, Y, rootBone, colors, finish } = C, mesh = new Props.ExactMesh(), body = C.parts.find(p => p.name === 'Body');
        let front = -Infinity, back = Infinity, top = -Infinity;
        for (let i = 0; i < body.positions.length; i += 3) { front = Math.max(front, body.positions[i + 2]); back = Math.min(back, body.positions[i + 2]); top = Math.max(top, body.positions[i + 1]); }
        const onTop = (x, z) => bodyRay(C, [x, top + L, z], [0, -1, 0]);
        if (r.horns !== 'none') for (const sign of [-1, 1]) {
            const p = onTop(sign * L * 0.025, back + (front - back) * 0.78);
            if (!p) continue; p[1] -= L * 0.006;
            mesh.tube([p, add(p, [sign * L * 0.035, L * r.hornSize * 0.1, -L * 0.05]), add(p, [sign * L * 0.015, L * r.hornSize * 0.19, L * 0.02])], [L * 0.018, L * 0.011, L * 0.001], 12, colors.light, p.skin);
        }
        if (r.spines > 0) for (let k = 0; k < 8; k++) {
            const p = onTop(0, back + (front - back) * (0.2 + k / 7 * 0.6));
            if (!p) continue; p[1] -= L * 0.004;
            mesh.tube([p, add(p, [0, L * (0.025 + r.spines * 0.055), -L * 0.025])], [L * 0.015, L * 0.0005], 8, colors.mark, p.skin);
        }
        finish(mesh, 'Horns and spines', { roughness: 0.42 });
    }
    const POSES = [{ id: 'swim', label: 'Swimming' }, { id: 'glide', label: 'Gliding' }, { id: 'fly', label: 'Flying' }, { id: 'crawl', label: 'Crawling' }, { id: 'turn', label: 'Turning' }, { id: 'attack', label: 'Attacking' }];
    const q = (x, y, z) => { const a = Math.hypot(x, y, z); if (a < 1e-8) return [0, 0, 0, 1]; const s = Math.sin(a / 2) / a; return [x * s, y * s, z * s, Math.cos(a / 2)]; };
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const rotate = (q, p) => { const t = mul(cross(q, p), 2); return add(p, add(mul(t, q[3]), cross(q, t))); };
    function poseClip(bones, id, recipe) {
        const form = recipe?.morphology || bones[0]?.creatureForm;
        if (!form || form === 'quadruped') return null;
        if (form === 'reptile') return Reptiles.poseClip(bones, id, recipe);
        const land = form === 'arthropod' || form === 'worm';
        const penguin = form === 'avian' && recipe?.birdType === 'penguin';
        const flyer = !penguin && (['avian', 'bat'].includes(form) || Arthropods.INSECTS.includes(recipe?.kind) && recipe.kind !== 'beetle');
        if (!['idle', 'turn', 'attack', ...(penguin ? ['swim','glide','crawl','walk','run'] : flyer ? ['fly', 'glide', 'crawl', 'walk', 'run'] : land ? ['crawl', 'walk', 'run'] : ['swim', 'glide'])].includes(id)) return null;
        // Wingbeats per loop: a bat beats several times a second, an insect's wings are a blur. Whole beats keep the loop seamless,
        // with enough keys a beat that the flap is not aliased away.
        const insect = form === 'arthropod' && flyer, beats = id === 'fly' ? (form === 'bat' ? 7 : insect ? 30 : 1) : 1;
        const frames = beats > 1 ? beats * 8 + 1 : 33, period = id === 'idle' ? 4 : id === 'attack' ? 1.2 : land ? 1.4 : 2.4;
        const times = Float32Array.from({ length: frames }, (_, i) => i / (frames - 1) * period), tracks = [], heights = new Float32Array(frames), amount = id === 'idle' ? 0.2 : id === 'glide' ? 0.3 : 1;
        bones.forEach((b, index) => {
            const values = new Float32Array(frames * 4);
            for (let i = 0; i < frames; i++) {
                const phase = i / (frames - 1) * Math.PI * 2, wave = Math.sin(phase - (b.phase || 0));
                let x = 0, y = 0, z = 0;
                if (b.role === 'tail') { const a = wave * 0.12 * amount; form === 'cetacean' || recipe?.kind === 'lobster' ? x = a : y = a; }
                if (b.role === 'fin') z = wave * 0.17 * (b.phase || 1) * amount;
                // Ray wings flap together; |phase| > 1 delays the outer half of each wing.
                if (b.role === 'rayWing') { const side = Math.sign(b.phase || 1), lag = Math.abs(b.phase || 1) - 1; z = side * Math.sin(phase - lag) * (id === 'attack' ? .1 : .2) * (id === 'idle' ? .25 : amount); }
                if (b.role === 'tentacle') { x = wave * 0.11 * amount; y = Math.cos(phase - b.phase) * 0.1 * amount; }
                if (b.role === 'segment') y = wave * 0.075 * amount;
                if (b.role === 'legUpper') { y = Math.cos(phase - b.phase) * 0.23 * amount * (b.motionScale ?? 1); z = (b.head[0] < 0 ? -1 : 1) * Math.max(0, wave) * 0.22 * amount * (b.motionScale ?? 1); }
                if (b.role === 'legLower') z = (b.head[0] < 0 ? 1 : -1) * Math.max(0, wave) * 0.16 * amount * (b.motionScale ?? 1);
                if (b.role === 'wing') z = (b.phase || 1) * Math.sin(phase * beats) * (id === 'fly' || penguin && id === 'swim' ? (insect ? .45 : .55) : id === 'glide' ? .06 : .018);
                if (b.role === 'wingTip') z = (b.phase || 1) * Math.sin(phase * beats - .35) * (id === 'fly' ? .12 : .012);
                if (b.role === 'abdomen') y = wave * .025 * amount;
                if (b.role === 'pincer' && id === 'attack') y = Math.max(0, Math.sin(phase)) * .25 * (b.phase || 1);
                if (b.role === 'root' && id === 'turn') y = Math.sin(phase) * 0.6;
                if (b.role === 'head' && id === 'attack') x = Math.sin(phase) * 0.3;
                if (b.role === 'jaw' && id === 'attack') x = Math.max(0, Math.sin(phase)) * 0.15;
                if(form==='avian'&&!penguin&&['fly','glide'].includes(id)){
                    // The rest chest leans forward already. A full quarter turn
                    // tips the beak below the breast and sends the feet upward.
                    const pitch=recipe?.birdType==='eagle'?Math.PI/3:.15;
                    if(b.role==='root'){values.set(q(pitch,0,0),i*4);continue;}
                    if(b.role==='head'||b.role==='birdTail'){values.set(q(-pitch,0,0),i*4);continue;}
                    if(b.role==='wing'){values.set(qmul(q(-pitch,0,0),q(0,0,z)),i*4);continue;}
                    if(b.role==='legUpper'){values.set(q(-.65,0,0),i*4);continue;}
                    if(b.role==='legLower'){values.set(q(1.1,0,0),i*4);continue;}
                }
                // The humerus lowers, the forearm returns upward, and the manus closes
                // behind it. Three articulations keep the primaries outside the flank;
                // flight uses the spread rest geometry and existing wingbeat.
                if(form==='avian'&&!penguin&&['idle','walk','run','crawl','turn'].includes(id)){
                    const sign=b.phase||1;
                    if(b.role==='wing'){values.set(q(0,0,-sign*1.70),i*4);continue;}
                    if(b.role==='wingTip'){values.set(q(0,0,sign*3.35),i*4);continue;}
                    if(b.role==='wingHand'){values.set(q(0,0,-sign*3.05),i*4);continue;}
                }
                // A bat at rest folds its wings: the humerus down along the flank, the forearm back up against it,
                // and the fingers closed alongside the forearm, so the membrane hangs in folds at the side.
                if(form==='bat'&&['idle','walk','run','crawl','turn'].includes(id)){
                    const sign=b.phase||1, breathe=.03*Math.sin(phase);
                    const qW=qmul(q(0,0,-sign*(.80+breathe)),q(0,-sign*.35,0)),qT=q(0,0,sign*2.55);
                    if(b.role==='wing'){values.set(qW,i*4);continue;}
                    if(b.role==='wingTip'){values.set(qT,i*4);continue;}
                    if(b.role==='wingFinger'&&b.parent>=0){
                        // The fingers run back and a little down along the flank from the raised wrist (in the forearm's own frame).
                        const R=qmul(qW,qT),Ri=[-R[0],-R[1],-R[2],R[3]],d=norm(sub(b.tail,b.head)),tw=rotate(Ri,norm([sign*.10,-.40,-1])),t=norm(add(tw,[d[0]*.10,d[1]*.10,d[2]*.10]));
                        const ax=cross(d,t),l=Math.hypot(...ax),ang=Math.acos(Math.max(-1,Math.min(1,dot(d,t))));
                        values.set(l<1e-6?[0,0,0,1]:q(ax[0]/l*ang,ax[1]/l*ang,ax[2]/l*ang),i*4);continue;
                    }
                }
                values.set(q(x, y, z), i * 4);
            }
            tracks.push({ bone: index, values });
        });
        const samples = bones[0]?.floorSamples;
        if (samples) for (let frame = 0; frame < frames; frame++) {
            const rotations = [], positions = [];
            bones.forEach((b, i) => {
                const local = Array.from(tracks[i].values.subarray(frame * 4, frame * 4 + 4));
                rotations[i] = b.parent < 0 ? local : qmul(rotations[b.parent], local);
                positions[i] = b.parent < 0 ? b.head : add(positions[b.parent], rotate(rotations[b.parent], sub(b.head, bones[b.parent].head)));
            });
            let low = Infinity;
            for (const sample of samples) {
                let y = 0;
                for (let k = 0; k < 4; k++) if (sample.w[k]) { const j = sample.j[k]; y += (rotate(rotations[j], sub(sample.p, bones[j].head))[1] + positions[j][1]) * sample.w[k]; }
                low = Math.min(low, y);
            }
            heights[frame] = Math.max(0, (bones[0].creatureSize || 1) * (land ? 0.003 : 0.012) - low);
        }
        const name = ({ idle: 'Idle', crawl: 'Walk', walk: 'Walk', run: 'Run', swim: 'Swim', fly: 'Fly', glide: 'Glide', turn: 'Turn', attack: 'Attack' })[id];
        const lift = time => { const t = (id === 'attack' ? clamp(time, 0, period) : ((time % period) + period) % period) / period * (frames - 1), i = Math.min(frames - 1, Math.floor(t)); return heights[i] + (heights[Math.min(frames - 1, i + 1)] - heights[i]) * (t - i); };
        // Embedded clips carry the same floor correction the preview applies separately.
        const translation = Float32Array.from({ length: frames * 3 }, (_, i) => bones[0].head[i % 3] + (i % 3 === 1 ? heights[Math.floor(i / 3)] : 0));
        const saved = { name, times, tracks: tracks.concat([{ bone: 0, path: 'translation', values: translation }]), loop: id !== 'attack' };
        return { name, times, tracks, heights, lift, loop: id !== 'attack', once: id === 'attack', skin: false, saved };
    }
    const surfaceCache = new Map();
    function surfacePictures(kind, size) {
        const key = kind + ':' + size;
        if (surfaceCache.has(key)) return surfaceCache.get(key);
        const height = new Float32Array(size * size), color = new Uint8Array(size * size * 4), normal = new Uint8Array(color.length), material = new Uint8Array(color.length);
        const tau = Math.PI * 2, fract = n => n - Math.floor(n);
        // Periodic cell noise: every map tiles at its actual UV seam. Color,
        // relief and polish describe the same structures, at both resolutions.
        const noise = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size, grain = Math.sin(u * tau * 119) * Math.cos(v * tau * 121);
            let h = grain * .012, shade = 246, rough = .8, tint = [1,1,1];
            if (kind === 'feathers') {
                const row = Math.floor(v * 44), cell = fract(u * 72 + (row % 2) * .5), z = fract(v * 44);
                const shaft = Math.exp(-(((cell - .5) / .045) ** 2));
                const vane = Math.max(0, 1 - Math.abs(cell - .5) * 2);
                const barbs = Math.sin((z * 14 - Math.abs(cell - .5) * 5) * tau);
                const edge = Math.exp(-(((z - (.72 + vane * .23)) / .045) ** 2));
                h = shaft * .035 + barbs * .008 * vane - edge * .038;
                shade = 249 + shaft * 3 + barbs * 2 - edge * 10;
                rough = .86 + barbs * .025;
            } else if (kind === 'scales') {
                // Staggered overlapping plates with rounded trailing rims,
                // concentric growth lines and radial grooves, rather than dots.
                const row = Math.floor(v * 20), q = fract(u * 36 + (row % 2) * .5), z = fract(v * 20) - .5;
                const edge = .28 + .60 * Math.sqrt(Math.max(0,1 - z * z * 4)), d = q - edge, rim = Math.exp(-((d / .055) ** 2));
                const dome = Math.max(0, 1 - ((q - .32) / .72) ** 2 - (z * 1.8) ** 2);
                const rings = Math.cos(Math.hypot((q - .05) * 1.2,z) * tau * 7) * .012 * dome;
                const cell = noise(Math.floor(u * 36 + (row % 2) * .5), row);
                h += dome * .14 + rim * .14 + rings - Math.exp(-(((d - .07) / .035) ** 2)) * .08;
                shade = 220 + dome * 22 + rim * 10 - Math.exp(-(((d - .07) / .045) ** 2)) * 37 + (cell - .5) * 12;
                rough = .58 + (1 - dome) * .26 + (cell - .5) * .10;
                tint = [1 - cell * .035, .985 + cell * .015, .98 + (1 - cell) * .02];
                // The snout and gill cover stay smooth; plates begin on the flank.
                const coverage = ease(.15,.25,u) * (1 - ease(.94,1,u));
                h *= coverage; shade = 252 + (shade - 252) * coverage; rough = .75 + (rough - .75) * coverage;
            } else if (kind === 'symbioteSkin') {
                const fold = Math.cos(u * tau * 64 + Math.sin(v * tau * 4) * 1.1);
                const crevice = Math.max(0,fold) ** 12;
                const row = Math.floor(v * 36), cell = Math.floor(u * 90 + (row % 2) * .5);
                const dx = fract(u * 90 + (row % 2) * .5 + noise(row,7) * .30) - .5, dy = fract(v * 36) - .5;
                const pebble = Math.exp(-(dx * dx * 18 + dy * dy * 12)) * (.72 + noise(cell % 90,row) * .28);
                const wrinkle = Math.sin(v * tau * 14 + u * tau * 15);
                h += pebble * .18 - crevice * .26 + wrinkle * .035;
                shade = 220 + pebble * 24 - crevice * 42 + wrinkle * 5;
                rough = .60 + crevice * .31 - pebble * .15;
            } else if (kind === 'chitin') {
                const fineGrain = Math.sin(u * tau * 21) * Math.cos(v * tau * 23);
                const pore = Math.max(0, fineGrain) ** 6;
                const stria = Math.cos(u * tau * 44 + Math.sin(v * tau * 5) * .5);
                h = fineGrain * .003 + stria * .006 - pore * .03;
                shade = 247 + stria - pore * 23;
                rough = .58 + pore * .34 + stria * .06;
            } else if (kind === 'finRays') {
                const ray = (.5 + .5 * Math.cos(u * tau * 18 + Math.sin(v * Math.PI) * .3)) ** 5;
                h += ray * .22 + Math.sin(v * tau * 64) * .016;
                shade = 221 + ray * 31; rough = .68 + (1 - ray) * .22;
            } else if (kind === 'annuli') {
                const crease = (.5 + .5 * Math.cos(v * tau * 48 + Math.sin(u * tau * 3) * .3)) ** 10;
                h += .07 * Math.cos(u * tau * 33) - crease * .20;
                shade = 240 - crease * 37 + grain * 4; rough = .64 + crease * .28;
            } else if (kind === 'facets') {
                // Hexagonal ommatidia: domed glossy lenses with dark seams.
                const cols = 48, rows = 56, gx = u * cols, gy = v * rows;
                let best = 9;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const cy = Math.floor(gy) + dy, cx = Math.floor(gx - (((cy % rows) + rows) % rows % 2) * .5) + dx, sx = cx + .5 + (((cy % rows) + rows) % rows % 2) * .5, sy = cy + .5;
                    best = Math.min(best, (gx - sx) ** 2 * 1.15 + (gy - sy) ** 2);
                }
                const d = Math.sqrt(best) / .62, lens = Math.max(0, 1 - d * d);
                h = Math.sqrt(lens) * .09; shade = 196 + lens * 50; rough = .55 - lens * .45;
            } else if (kind === 'denticles') {
                // Placoid scales: jittered overlapping shields pointing tailward (+u)
                // with three low keels; satin crowns and matte grooves between.
                // The nearest jittered seed decides each pixel, so no rows line up.
                const cols = 64, rows = 80, gx = u * cols, gy = v * rows;
                let best = 9, fu = 0, fv = 0, cell = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const cx = Math.floor(gx) + dx, cy = Math.floor(gy) + dy, wx = ((cx % cols) + cols) % cols, wy = ((cy % rows) + rows) % rows;
                    const sx = cx + .5 + (noise(wx, wy) - .5) * .7, sy = cy + .5 + (noise(wy + 91, wx + 37) - .5) * .7;
                    const ex = gx - sx, ey = gy - sy, d = (ex + .25) ** 2 * .8 + ey * ey;
                    if (d < best) { best = d; fu = ex; fv = ey; cell = noise(wx + 13, wy + 7); }
                }
                const half = .5 * (1 - .4 * clamp(fu + .5, 0, 1)), shield = 1 - (fv / half) ** 2 - ((fu + .05) / .58) ** 2, crown = Math.max(0, shield) ** .55;
                const keels = Math.exp(-((fv / .06) ** 2)) + .55 * (Math.exp(-(((fv - .2) / .05) ** 2)) + Math.exp(-(((fv + .2) / .05) ** 2)));
                h = crown * (.10 + keels * .025) + (cell - .5) * .012 * crown;
                shade = 241 + crown * 9 + (cell - .5) * 7; rough = .84 - crown * .22 - keels * crown * .05;
            } else if (kind === 'marineSkin') {
                h = grain * .018; shade = 253 + grain * 2; rough = .8 + grain * .04;
            } else {
                const pore = Math.max(0, grain) ** 8;
                const cells = Math.sin(u * tau * 47) * Math.cos(v * tau * 49);
                h += cells * .07 - pore * .09;
                shade = 241 + cells * 9 - pore * 20; rough = .72 + pore * .20;
            }
            height[y * size + x] = h;
            const k = (y * size + x) * 4;
            color.set([...tint.map(c => Math.round(clamp(shade * c,0,255))),255],k);
            // glTF metallic/roughness packing: G = roughness, B = metalness.
            // Metalness remains a part property; living skin is a dielectric.
            material.set([255,Math.round(clamp(rough,0,1)*255),255,255],k);
        }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const dx = height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size];
            const dy = height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x];
            // Derivatives have the same strength in preview and saved maps.
            const n = norm([-dx * size / 64, -dy * size / 64, 1]);
            normal.set([...n.map(v => Math.round(127.5 + v * 127.5)), 255], (y * size + x) * 4);
        }
        const bitmap = data => ({width:size,height:size,data,repeat:true});
        const pictures = { 'creature-surface.png': bitmap(color), 'creature-surface-normal.png': bitmap(normal), 'creature-surface-material.png': bitmap(material) };
        if (surfaceCache.size >= 12) surfaceCache.delete(surfaceCache.keys().next().value);
        surfaceCache.set(key, pictures); return pictures;
    }
    function detailSurfaces(C, options) {
        // Catalog thumbnails carry the same surface identity as the editor.
        const size = C.save ? 1024 : options.static ? 256 : 512;
        const r = C.r, kind = r.morphology === 'avian' ? 'feathers' : r.kind==='worm'&&r.wormType==='goauld'?'symbioteSkin':r.kind==='worm'&&r.wormType==='roundworm'?'marineSkin':r.kind === 'shark' ? 'denticles' : r.morphology === 'cetacean' || r.kind === 'stingray' ? 'marineSkin' : r.kind === 'fish' ? 'scales' : r.morphology === 'arthropod' ? 'chitin' : r.morphology === 'worm' ? 'annuli' : 'pores';
        let finPictures=null, facetPictures=null;
        for (const part of C.parts) {
            if (part.noSurfaceDetail || (part.kind === 'eye' && !part.facetSurface) || /suckers|mouth|Antennae|Horns|lure|ribs|core/i.test(part.name)) continue;
            part.metallicRoughnessTexture = 'creature-surface-material.png';
            if(kind === 'scales' && !part.aquaticFin){part.iridescence=.38;part.iridescenceIOR=1.38;part.iridescenceThicknessRange=[180,420];part.iridescenceThicknessTexture=part.metallicRoughnessTexture;part.normalScale=.45;}
            if(part.paintedSurface){
                part.texture='creature-markings.png';part.normalTexture='creature-surface-normal.png';part.normalTexCoord=1;part.metallicRoughnessTexCoord=1;part.keepColors=true;continue;
            }
            if(part.symbioteSkin || part.axialSurface){part.texture='creature-surface.png';part.normalTexture='creature-surface-normal.png';part.keepColors=true;continue;}
            if(part.aquaticFin){
                const ray=kind==='scales',names=ray?['creature-fin.png','creature-fin-normal.png']:['creature-surface.png','creature-surface-normal.png'];
                part.texture=names[0];part.normalTexture=names[1];part.keepColors=true;
                if(ray){const p=surfacePictures('finRays',size);part.metallicRoughnessTexture='creature-fin-material.png';finPictures={[names[0]]:p['creature-surface.png'],[names[1]]:p['creature-surface-normal.png'],[part.metallicRoughnessTexture]:p['creature-surface-material.png']};}
                continue;
            }
            const vertices = [], uvs = [], index = [], map = new Map(), scale = C.L * 0.85;
            // Planar charts split only vertices that need different UV axes;
            // their positions, normals and weights remain exactly coincident.
            for (let t = 0; t < part.index.length; t += 3) {
                const ids = Array.from(part.index.subarray(t, t + 3));
                const n = ids.reduce((a, i) => add(a, Array.from(part.normals.subarray(i * 3, i * 3 + 3))), [0, 0, 0]);
                const axis = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
                const sign = n[axis] < 0 ? -1 : 1;
                for (const i of ids) {
                    const key = i + ':' + axis + ':' + sign;
                    if (!map.has(key)) {
                        map.set(key, vertices.length); vertices.push(i);
                        const p = Array.from(part.positions.subarray(i * 3, i * 3 + 3)), q = axis === 0 ? [p[2], p[1]] : axis === 1 ? [p[0], p[2]] : [p[0], p[1]];
                        uvs.push(q[0] / scale * sign + 0.5, q[1] / scale + 0.5);
                    }
                    index.push(map.get(key));
                }
            }
            for (const [field, stride] of [['positions', 3], ['normals', 3], ['colors', 3], ['joints', 4], ['weights', 4]]) {
                const old = part[field], data = new old.constructor(vertices.length * stride);
                vertices.forEach((v, i) => data.set(old.subarray(v * stride, v * stride + stride), i * stride)); part[field] = data;
            }
            part.index = Uint32Array.from(index); part.uvs = Float32Array.from(uvs);
            if (part.facetSurface) {
                // Compound eyes: the same chart, much finer, on their own lens picture.
                part.uvs = part.uvs.map(v => v * 7); part.texture = 'creature-facets.png'; part.normalTexture = 'creature-facets-normal.png'; part.metallicRoughnessTexture = 'creature-facets-material.png'; part.normalScale = .8; part.keepColors = true;
                if (!facetPictures) { const f = surfacePictures('facets', size); facetPictures = { 'creature-facets.png': f['creature-surface.png'], 'creature-facets-normal.png': f['creature-surface-normal.png'], 'creature-facets-material.png': f['creature-surface-material.png'] }; }
                continue;
            }
            part.texture = 'creature-surface.png'; part.normalTexture = 'creature-surface-normal.png'; part.normalScale ??= kind === 'scales' ? 0.25 : 0.13; part.keepColors = true;
        }
        const painted=C.paintMarkings?{'creature-markings.png':C.paintMarkings(size,size/2)}:{};
        return {...surfacePictures(kind, size),...finPictures,...facetPictures,...painted};
    }
    function build(r, options = {}) {
        const C = context(r, options.quality === 'save');
        if (r.morphology === 'fish' || r.morphology === 'cetacean') fish(C);
        else if (r.morphology === 'cephalopod') cephalopod(C);
        else if (r.morphology === 'arthropod') { if (Arthropods.handles(r.kind)) Arthropods.build(C); else arthropod(C); }
        else if (r.morphology === 'avian' || r.morphology === 'bat') Flyers.build(C);
        else if (r.morphology === 'worm') worm(C);
        else if (r.morphology === 'reptile') Reptiles.build(C);
        else jellyfish(C);
        if (r.pattern !== 'solid' && (Arthropods.handles(r.kind) || ['avian','bat'].includes(r.morphology))) for (const part of C.parts) {
            if (!part.noSurfaceDetail && part.kind !== 'eye') C.pattern(part);
        }
        adorn(C);
        const textures = detailSurfaces(C, options);
        // Axial length changes proportions independently of overall Size.
        // (A snake's length is its spine's, built in; stretching its coil would squash its head.)
        const axis = r.morphology === 'jellyfish' ? 1 : 2, stretch = r.morphology === 'reptile' && r.kind === 'snake' ? 1 : r.bodyLength;
        for (const p of C.parts) for (let i = 0; i < p.positions.length; i += 3) {
            p.positions[i + axis] *= stretch;
            p.normals[i + axis] /= stretch;
            const n = Math.hypot(p.normals[i], p.normals[i + 1], p.normals[i + 2]) || 1;
            for (let k = 0; k < 3; k++) p.normals[i + k] /= n;
        }
        // Joints share one point array between a parent's tail and its child's head;
        // move each point once (twice moved every shared knee by the floor offset).
        const points = [...new Set(C.bones.flatMap(b => [b.head, b.tail]))];
        for (const p of points) p[axis] *= stretch;
        let floor = Infinity, height = -Infinity;
        for (const p of C.parts) for (let i = 1; i < p.positions.length; i += 3) { floor = Math.min(floor, p.positions[i]); height = Math.max(height, p.positions[i]); }
        for (const p of C.parts) for (let i = 1; i < p.positions.length; i += 3) p.positions[i] -= floor;
        for (const p of points) p[1] -= floor;
        const samples = new Map();
        for (const p of C.parts) for (let i = 0; i < p.positions.length / 3; i++) {
            const x = p.positions[i * 3], y = p.positions[i * 3 + 1], z = p.positions[i * 3 + 2];
            const key = Math.floor(x / C.L * 12) + ':' + Math.floor(z / C.L * 12), cell = samples.get(key) || {};
            let sample = null;
            for (const [name, value, axis, sign] of [['low', y, 1, 1], ['left', x, 0, 1], ['right', x, 0, -1], ['back', z, 2, 1], ['front', z, 2, -1]]) if (!cell[name] || value * sign < cell[name].p[axis] * sign) {
                sample ||= { p: [x, y, z], j: Array.from(p.joints.subarray(i * 4, i * 4 + 4)), w: Array.from(p.weights.subarray(i * 4, i * 4 + 4)) };
                cell[name] = sample;
            }
            samples.set(key, cell);
        }
        // Keep a bounded set of the lowest points distributed over the silhouette.
        C.bones[0].floorSamples = [...new Set([...samples.values()].flatMap(cell => Object.values(cell)))].sort((a, b) => a.p[1] - b.p[1]).slice(0, 2048);
        const flyer = ['avian', 'bat'].includes(r.morphology) || Arthropods.INSECTS.includes(r.kind) && r.kind !== 'beetle';
        const penguin = r.morphology === 'avian' && r.birdType === 'penguin';
        const ids = r.morphology === 'reptile' ? Reptiles.clipIds(r) : ['idle', ...(flyer ? ['walk', 'run', penguin ? 'swim' : 'fly', 'glide'] : r.morphology === 'arthropod' || r.morphology === 'worm' ? ['walk', 'run'] : ['swim', 'glide']), 'turn', 'attack'];
        const clips = options.static ? [] : ids.map(id => poseClip(C.bones, id, r).saved);
        return { recipe: r, parts: C.parts, bones: C.bones, height: height - floor, plan: 'quadruped', form: r.morphology, rig: { markers: {} }, textures, clips };
    }
    function sidecar(built) {
        const land = ['arthropod', 'worm', 'avian', 'bat', 'reptile'].includes(built.form);
        const clips = [['Idle', 'idle'], [land ? 'Walk' : 'Swim', land ? 'walking' : 'swimming'], [land ? 'Run' : 'Glide', land ? 'dashing' : 'treading'], ['Attack', 'action']];
        if (built.clips.some(c => c.name === 'Fly')) clips.push(['Fly', 'jumping'], ['Glide', 'action']);
        else if (land && built.clips.some(c => c.name === 'Swim')) clips.push(['Swim', 'swimming'], ['Glide', 'treading']);
        return { rig: null, creature: { form: built.form, habitat: land ? 'land' : 'aquatic' }, animations: clips.map(([name, trigger]) => ({ name, trigger, type: 'clip', clip: name })) };
    }
    const api = { FORMS, SLIDERS, KINDS, MARINE_TYPES, WORM_TYPES, VARIANT_TYPES, variantsFor, withVariant, normalize, build, surfacePictures, POSES, poseClip, sidecar };
    root.RRCreatureForms = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
