/**
 * RRCharacterExpressions - faces that move: expressions and mouth shapes
 * (visemes) for the Character Builder's human faces.
 *
 * The movements are MakeHuman's expression units (data/expressions.*, built
 * by editor/build-scripts/build-expression-pack.cjs): facial action units
 * authored on the same base mesh, one set per ancestry, blended by the
 * character's own ancestry. They are carried to any face by its own measure
 * (eye spacing, eye to mouth, eye size), with a few movements of their own
 * added here: the cheeks raised, one side of the mouth, the tongue, the
 * lower lip under the teeth, the eyes' gaze. The lids never go further into
 * the eyeball than they lie at rest.
 *
 * An expression is a weight per unit (EXPRESSIONS); a viseme is one too
 * (VISEMES), so a sad face can still talk: their weights add.
 *
 *   field(pack, result, weights)      → { delta (per pack vertex), gaze, blush, tears }
 *   pose(pack, result, name, weight)  → { positions[], normals[], overlays[] } per part (cached)
 *   posedParts(pack, result, name, w) → result.parts with the face moved, plus the blush and tear overlays
 *   morphTargets(pack, result)        → named sparse deltas per part, for the saved GLB
 *   mouthParts(pack, built, recipe)   → the teeth and tongue, and the mouth's inside darkened in the body's colors
 *   applyToView(view, result, pack, name, weight, THREE) → the builder's meshes posed in place
 */
(function(root) {
    'use strict';

    const Body = root.RRHumanBody || (typeof require === 'function' ? require('./HumanBody.js') : null);

    // ── the units ─────────────────────────────────────────────────────────

    /** MakeHuman's units, by name (each has L and R, or none). */
    const BASE_UNITS = ['browDownL', 'browDownR', 'browOuterUpL', 'browOuterUpR', 'browInnerUpL', 'browInnerUpR', 'browUpL', 'browUpR',
        'eyeCloseL', 'eyeCloseR', 'eyeWideL', 'eyeWideR', 'eyeSquintL', 'eyeSquintR',
        'lipPress', 'smile', 'grimaceOpen', 'frown', 'upperLipRaise', 'pout', 'jawDrop', 'lipsPart', 'stretchOpen', 'funnel', 'pucker', 'stretch', 'grin', 'neckTense',
        'noseCompress', 'noseDown', 'nostrilFlareL', 'nostrilFlareR', 'sneerL', 'sneerR'];
    /** Movements made here from the face's own measure. */
    const OWN_UNITS = ['cheekRaiseL', 'cheekRaiseR', 'lowerLipTuck', 'tongueUp', 'tongueOut', 'jawSide'];

    function openUnits(json, bytes) {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const units = new Map();
        for (const u of json.units) {
            if (!units.has(u.name)) units.set(u.name, {});
            units.get(u.name)[u.race] = { scale: u.scale, index: new Uint16Array(buffer, u.index[0], u.index[1]), delta: new Int16Array(buffer, u.delta[0], u.delta[1]) };
        }
        return { json, races: json.races, units };
    }

    /** The units for a pack: read from disk once (desktop, Node); null where there is no file and nothing was preloaded. */
    function units(pack) {
        if (pack._expressionUnits !== undefined) return pack._expressionUnits;
        pack._expressionUnits = null;
        if (typeof require !== 'function' || !Body || !Body.dataFolder) return null;
        try {
            const fs = require('fs'), path = require('path');
            const folder = Body.dataFolder();
            const file = path.join(folder, 'expressions.json');
            if (fs.existsSync(file)) pack._expressionUnits = openUnits(JSON.parse(fs.readFileSync(file, 'utf8')), fs.readFileSync(path.join(folder, 'expressions.bin')));
        } catch (error) {
            if (typeof console !== 'undefined') console.warn('[RRCharacterExpressions] expression data', error);
        }
        return pack._expressionUnits;
    }

    /** Reads the units over fetch (a page without the file system). */
    async function preload(pack, dir) {
        const base = dir || (Body && Body.DATA_PATH) || 'src/forge/Character3D/data';
        const json = await (await fetch(base + '/expressions.json')).json();
        const bytes = new Uint8Array(await (await fetch(base + '/expressions.bin')).arrayBuffer());
        pack._expressionUnits = openUnits(json, bytes);
        return pack._expressionUnits;
    }

    // ── what each face does ───────────────────────────────────────────────
    // Units named without a side move both sides. `gaze` is [across, up] in radians (+across: the character's left);
    // `blush` and `tears` are 0..1.

    // Each is drawn to read at a glance on a 144-pixel face sheet: the brows, the lids and the mouth's corners
    // carry it, each well past MakeHuman's own measure where a portrait needs it (Expressiveness scales them all).
    const EXPRESSIONS = [
        { id: 'neutral', label: 'Normal', units: {} },
        // Duchenne smile: the corners pulled up, the cheeks raised, the lower lids lifted, the brows lifted a little.
        { id: 'happy', label: 'Happy', units: { smile: 1.25, grin: 0.4, lipsPart: 0.45, cheekRaise: 1.2, eyeSquint: 0.55, eyeClose: 0.12, browUp: 0.45, browInnerUp: 0.2 } },
        // The eyes squeezed nearly shut, the mouth open wide, the brows up.
        { id: 'laugh', label: 'Laughing', units: { smile: 1.3, grin: 0.6, jawDrop: 0.5, lipsPart: 0.45, upperLipRaise: 0.35, cheekRaise: 1.4, eyeSquint: 0.8, eyeClose: 0.5, browUp: 0.55, browInnerUp: 0.3 } },
        // The inner brows drawn up and together, the corners well down, the lids heavy, the eyes lowered.
        { id: 'sad', label: 'Sad', units: { browInnerUp: 1.8, browDown: 0.4, frown: 1.25, pout: 0.15, eyeClose: 0.32, eyeSquint: 0.1 }, gaze: [0, -0.22] },
        // The brows down hard and together (the outer ends up, a V), the upper lids raised, the teeth bared.
        { id: 'angry', label: 'Angry', units: { browDown: 1.9, browOuterUp: 0.45, browInnerUp: -0.25, eyeWide: 0.55, eyeSquint: 0.65, lipPress: 0.3, frown: 0.75, sneer: 0.6, upperLipRaise: 0.35, nostrilFlare: 1.2 } },
        // The brows high, the eyes wide, the mouth dropped open in an O.
        { id: 'surprised', label: 'Surprised', units: { browUp: 1.8, browInnerUp: 0.35, eyeWide: 1.5, jawDrop: 0.7, lipsPart: 0.3, funnel: 0.3 } },
        // Brows raised and drawn together, the eyes wide, the lips stretched back off the teeth.
        { id: 'scared', label: 'Scared', units: { browInnerUp: 1.5, browUp: 0.8, browDown: 0.35, eyeWide: 1.5, stretch: 1, grimaceOpen: 0.7, jawDrop: 0.22, neckTense: 0.5 } },
        // The nose wrinkled and the upper lip raised, more on one side; the brows lowered.
        { id: 'disgusted', label: 'Disgusted', units: { sneer: 1.4, sneerL: 0.4, upperLipRaise: 1, frown: 0.7, browDown: 1, browInnerUp: 0.2, eyeSquint: 0.75, pout: 0.3, cheekRaise: 0.5, noseCompress: 1 }, gaze: [0.06, -0.04] },
        // One corner up, the cheek on that side; lids half down, one brow raised.
        { id: 'smirk', label: 'Smirk', units: { smileL: 1.8, grinL: 0.35, cheekRaiseL: 0.9, eyeSquintL: 0.5, eyeClose: 0.3, lipPress: 0.3, browOuterUpR: 1.3, browUpR: 0.8, browDownL: 0.6 }, gaze: [0.08, 0] },
        // The brows set low, the eyes narrowed, the mouth firm with the corners held level.
        { id: 'determined', label: 'Determined', units: { browDown: 1.25, browOuterUp: 0.35, eyeSquint: 0.7, eyeWide: 0.2, lipPress: 0.6, smile: 0.35, stretch: 0.2, nostrilFlare: 0.6 } },
        { id: 'worried', label: 'Worried', units: { browInnerUp: 2, browDown: 0.35, eyeWide: 0.7, stretch: 0.85, frown: 0.75, lipPress: 0.2, grimaceOpen: 0.2 }, gaze: [0.12, -0.08] },
        // A shy smile, the brows up in the middle, the eyes lowered and aside, the cheeks colored.
        { id: 'embarrassed', label: 'Embarrassed', units: { smile: 0.75, lipPress: 0.35, browInnerUp: 1, browDown: 0.2, eyeClose: 0.3, cheekRaise: 0.5 }, gaze: [0.3, -0.26], blush: 1 },
        // The lids most of the way down, the brows slack, the mouth a little open.
        { id: 'sleepy', label: 'Sleepy', units: { eyeClose: 0.82, browInnerUp: 0.35, browOuterUp: -0.3, lipsPart: 0.35, jawDrop: 0.08 }, gaze: [0, -0.12] },
        // Brows up in the middle, the eyes screwed up, the corners down, the lips parted; tears and a flushed face.
        { id: 'crying', label: 'Crying', units: { browInnerUp: 1.8, browDown: 0.5, eyeSquint: 0.9, eyeClose: 0.45, cheekRaise: 0.9, frown: 1.2, grimaceOpen: 0.6, jawDrop: 0.18, neckTense: 0.35 }, tears: 1, blush: 0.6 },
        // The jaw dropped wide, the lips stretched, the upper lip raised, the brows down, the neck tensed.
        { id: 'shouting', label: 'Shouting', units: { browDown: 1.5, browOuterUp: 0.35, eyeWide: 0.8, eyeSquint: 0.3, jawDrop: 0.75, stretchOpen: 0.75, upperLipRaise: 0.6, neckTense: 0.5, nostrilFlare: 1.2, lipsPart: 0.35 } },
        // One brow down, the other well up, the lips pressed and pushed to one side, the eyes up and aside.
        { id: 'thinking', label: 'Thinking', units: { browDownR: 1, browOuterUpL: 1, browUpL: 0.6, eyeSquintR: 0.45, lipPress: 0.4, smileL: 0.4, frownR: 0.3, jawSide: 0.9 }, gaze: [-0.32, 0.3] },
        // The brows lowered, the eyes screwed shut, the cheeks raised, the nose wrinkled, the teeth bared in a grimace.
        { id: 'pain', label: 'Pain', units: { browDown: 1.3, browInnerUp: 0.9, eyeClose: 0.85, eyeSquint: 1, cheekRaise: 1.1, sneer: 0.9, upperLipRaise: 0.65, stretch: 1, grimaceOpen: 0.75 } }
    ];
    const BY_ID = new Map(EXPRESSIONS.map(e => [e.id, e]));

    /** Mouth shapes for speech: rest and ten visemes. `id` is the morph name's tail (viseme_<id>). */
    const VISEMES = [
        { id: 'rest', label: 'Rest', units: {} },
        { id: 'aa', label: 'AA', units: { jawDrop: 0.55, lipsPart: 0.3, stretch: 0.1 } },
        { id: 'ee', label: 'EE', units: { stretch: 0.6, lipsPart: 0.7, grin: 0.2, jawDrop: 0.1 } },
        { id: 'ih', label: 'IH', units: { lipsPart: 0.6, jawDrop: 0.2, stretch: 0.3 } },
        { id: 'oh', label: 'OH', units: { jawDrop: 0.32, funnel: 0.6, lipsPart: 0.2 } },
        { id: 'ou', label: 'OO', units: { pucker: 0.75, funnel: 0.35 } },
        { id: 'fv', label: 'FV', units: { lowerLipTuck: 1, lipsPart: 0.25, upperLipRaise: 0.15 } },
        { id: 'mbp', label: 'MBP', units: { lipPress: 0.85 } },
        { id: 'l', label: 'L', units: { lipsPart: 0.5, jawDrop: 0.25, tongueUp: 1 } },
        { id: 'th', label: 'TH', units: { lipsPart: 0.45, jawDrop: 0.12, tongueOut: 1 } },
        { id: 'ch', label: 'CH', units: { funnel: 0.55, lipsPart: 0.45, pucker: 0.2 } },
        { id: 's', label: 'S', units: { lipsPart: 0.6, stretch: 0.45 } }
    ];
    const VISEME_BY_ID = new Map(VISEMES.map(v => [v.id, v]));

    /**
     * Letters to visemes for text-driven speech (lower case; digraphs first).
     * The game's lip sync (runtime/reactor_3d_speech.js) holds the same table.
     */
    const LETTER_VISEMES = {
        digraphs: { th: 'th', sh: 'ch', ch: 'ch', oo: 'ou', ee: 'ee', ph: 'fv', wh: 'ou', ng: 'ih', qu: 'ou' },
        letters: {
            a: 'aa', e: 'ee', i: 'ih', o: 'oh', u: 'ou', y: 'ih', w: 'ou', r: 'ou', l: 'l', f: 'fv', v: 'fv', m: 'mbp', b: 'mbp', p: 'mbp',
            s: 's', z: 's', c: 's', x: 's', t: 's', d: 's', n: 's', k: 'ih', g: 'ih', h: 'aa', j: 'ch', q: 'ou'
        }
    };

    /** Face-sheet presets: eight expressions each, in the order of an RPG Maker MZ face sheet. */
    const SHEETS = [
        { id: 'everyday', label: 'Everyday', expressions: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'scared', 'thinking', 'embarrassed'] },
        { id: 'battle', label: 'Battle', expressions: ['neutral', 'determined', 'angry', 'pain', 'shouting', 'smirk', 'sleepy', 'worried'] },
        { id: 'story', label: 'Story', expressions: ['neutral', 'laugh', 'crying', 'worried', 'embarrassed', 'disgusted', 'sleepy', 'smirk'] }
    ];

    /** Every morph target written into a saved character, in order. */
    const MORPH_NAMES = EXPRESSIONS.filter(e => e.id !== 'neutral').map(e => 'expression_' + e.id)
        .concat(VISEMES.filter(v => v.id !== 'rest').map(v => 'viseme_' + v.id), ['blink']);

    /** Other names an expression is asked for by. */
    const ALIASES = { smile: 'happy', laughing: 'laugh', shy: 'embarrassed', tired: 'sleepy', smug: 'smirk', defeated: 'sad', hurt: 'pain', afraid: 'scared', fear: 'scared', anger: 'angry', joy: 'happy', blush: 'embarrassed', yell: 'shouting', cry: 'crying' };

    // ── a character's own emotion (recipe.emotion) ─────────────────────────

    /**
     * How strongly a character's face moves and colors: `strength` scales
     * every expression (0.3 subtle … 1 a portrait's … 2 anime), `blush` the
     * flush (0 none … 2), `blushColor` its tint. Visemes and the blink keep
     * their own measure, so speech reads the same on every face.
     */
    const EMOTION = { strength: 1, blush: 1, blushColor: '#ee8a8a' };
    const EMOTION_RANGE = { strength: [0.3, 2], blush: [0, 2] };

    function normalizeEmotion(e) {
        const o = e || {}, out = {};
        for (const k of ['strength', 'blush']) out[k] = Number.isFinite(+o[k]) && o[k] !== '' && o[k] != null ? Math.min(EMOTION_RANGE[k][1], Math.max(EMOTION_RANGE[k][0], +o[k])) : EMOTION[k];
        out.blushColor = /^#[0-9a-f]{6}$/i.test(o.blushColor || '') ? o.blushColor.toLowerCase() : EMOTION.blushColor;
        return out;
    }

    /** The units of an expression at a character's strength: the jaw and the lips' opening grow half as fast, a lid never past shut. */
    const SLOW = new Set(['jawDrop', 'stretchOpen', 'funnel', 'pucker', 'lipsPart', 'neckTense']);
    /** Past these a unit folds the face instead of moving it further: weights beyond them grow at a third of the rate. */
    const KNEE = { browDown: 1.9, browInnerUp: 2.2, browOuterUp: 1.8, browUp: 2, pout: 0.35, frown: 1.2, sneer: 1.6, lipPress: 1.1, noseCompress: 1.2, upperLipRaise: 1.3, eyeWide: 1.8, smile: 2, grin: 0.9, cheekRaise: 1.6 };
    function strengthen(b, emotion) {
        const e = normalizeEmotion(emotion), s = e.strength;
        const units = {};
        for (const [k, w] of Object.entries(b.units)) {
            let v = w * (SLOW.has(k) ? 1 + (s - 1) * 0.5 : s);
            const knee = KNEE[k.replace(/[LR]$/, '')];
            if (knee && Math.abs(v) > knee) v = Math.sign(v) * (knee + (Math.abs(v) - knee) / 3);
            units[k] = v;
        }
        for (const sd of ['L', 'R']) if (units['eyeClose' + sd] > 0.92) units['eyeClose' + sd] = 0.92;
        const g = 1 + (s - 1) * 0.5;
        return { units, gaze: [b.gaze[0] * g, b.gaze[1] * g], blush: b.blush * e.blush, tears: b.tears, blushColor: e.blushColor };
    }

    /** A face by name: an expression, `viseme_<id>`, `blink`, or a weight map of units. */
    function definition(name) {
        if (name && typeof name === 'object') return { units: name.units || name, gaze: name.gaze, blush: name.blush, tears: name.tears };
        const id = ALIASES[String(name)] || String(name || 'neutral');
        if (id === 'blink') return { units: { eyeClose: 1 } };
        if (id.startsWith('viseme_')) return VISEME_BY_ID.get(id.slice(7)) || VISEMES[0];
        if (id.startsWith('expression_')) return BY_ID.get(id.slice(11)) || EXPRESSIONS[0];
        return BY_ID.get(id) || VISEME_BY_ID.get(id) || EXPRESSIONS[0];
    }

    /** A recipe's emotion settings, defaults filled in. */
    function emotionOf(recipe) { return normalizeEmotion(recipe && recipe.emotion); }

    /** Unit weights of a face at a strength, sides spelled out: { browDownL: 0.6, … }. */
    function weights(name, weight = 1) {
        const def = definition(name), out = {};
        const add = (k, w) => { if (w) out[k] = (out[k] || 0) + w; };
        for (const [k, w] of Object.entries(def.units || {})) {
            const sided = k.endsWith('L') || k.endsWith('R');
            if (BASE_UNITS.includes(k) || OWN_UNITS.includes(k)) add(k, w * weight);
            else if (BASE_UNITS.includes(k + 'L') || OWN_UNITS.includes(k + 'L')) { add(k + 'L', w * weight); add(k + 'R', w * weight); }
            // A unit made for both sides, on one side only.
            else if (sided && BASE_UNITS.includes(k.slice(0, -1))) add(k, w * weight);
        }
        return out;
    }

    /** Several faces blended: [[name, weight], …] → one weight map, gaze, blush and tears. */
    function blend(list) {
        const out = { units: {}, gaze: [0, 0], blush: 0, tears: 0 };
        for (const [name, w] of list) {
            if (!w) continue;
            const def = definition(name);
            for (const [k, v] of Object.entries(weights(name, w))) out.units[k] = (out.units[k] || 0) + v;
            if (def.gaze) { out.gaze[0] += def.gaze[0] * w; out.gaze[1] += def.gaze[1] * w; }
            out.blush = Math.max(out.blush, (def.blush || 0) * w);
            out.tears = Math.max(out.tears, (def.tears || 0) * w);
        }
        return out;
    }

    // ── a face's measure ──────────────────────────────────────────────────

    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const meanOf = (P, ids) => { const m = [0, 0, 0]; for (const v of ids) { m[0] += P[v * 3]; m[1] += P[v * 3 + 1]; m[2] += P[v * 3 + 2]; } const n = Math.max(1, ids.length); return [m[0] / n, m[1] / n, m[2] / n]; };

    /** What never changes with the body: the pack's own rest measure. */
    function packFields(pack) {
        if (pack._expressionFields) return pack._expressionFields;
        const B = pack.positions, H = Body.headFields(pack);
        const eyeVerts = Body.fit(pack.eyes, B);
        const eyes = eyeBalls(eyeVerts);
        const upperTeeth = [...new Set(pack.helpers.upperTeeth.source)], lowerTeeth = [...new Set(pack.helpers.lowerTeeth.source)];
        const tongue = [...new Set(pack.helpers.tongue.source)];
        const lashes = pack.helpers.lashes ? [...new Set(pack.helpers.lashes.source)] : [];
        const mouth = meanOf(B, upperTeeth.concat(lowerTeeth));
        const upperLip = Body.maskOf(pack, ['shape/upperLip-incr'], 2), lowerLip = Body.maskOf(pack, ['shape/lowerLip-incr'], 2);
        const body = [...new Set(pack.body.source)];
        // The face's skin round each eye: what the lids are kept out of the eyeball by.
        const lidIds = body.concat(lashes).filter(v => H.w[v] > 0.5 && eyes.some(e => Math.hypot(B[v * 3] - e.c[0], B[v * 3 + 1] - e.c[1], B[v * 3 + 2] - e.c[2]) < e.r[0] * 2.4));
        const lips = body.filter(v => upperLip[v] > 0.2 || lowerLip[v] > 0.2);
        return (pack._expressionFields = { eyes, upperTeeth, lowerTeeth, tongue, lashes, mouth, upperLip, lowerLip, lidIds, lips, head: H });
    }

    /** Each eyeball (left at +x first): its center and its half-sizes on each axis. */
    function eyeBalls(V) {
        return [1, -1].map(side => {
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < V.length; i += 3) {
                if (Math.sign(V[i]) !== side) continue;
                for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]); }
            }
            return { side, c: [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), r: [0, 1, 2].map(k => (hi[k] - lo[k]) / 2) };
        });
    }

    const measures = new WeakMap();

    /**
     * A built character's face measure, kept with its shaped body: the
     * eyes, the scale each unit is carried to it by, its ancestry blend,
     * and whether it has a face to move at all (a grafted animal head has
     * its own).
     */
    function measure(pack, result) {
        const built = result.built || result;
        const S = built.shaped;
        if (!S) return null;
        let M = measures.get(S);
        if (M) return M;
        const U = units(pack);
        const F = packFields(pack);
        const recipe = result.recipe || {};
        const graft = !!(recipe.head && recipe.head.kind);
        const eyePart = (result.parts || built.parts || []).find(p => p.name === 'Eyes');
        // The parts stand where the model put them (lifted onto boots): the shaped body's frame is the measure's.
        const bodyPart = (result.parts || built.parts)[0];
        const s0 = pack.body.source[0];
        const offset = bodyPart ? [0, 1, 2].map(k => bodyPart.positions[k] - S[s0 * 3 + k]) : [0, 0, 0];
        let eyes = F.eyes;
        if (eyePart) {
            const V = new Float32Array(eyePart.positions.length);
            for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) V[i + k] = eyePart.positions[i + k] - offset[k];
            eyes = eyeBalls(V);
        }
        const B = pack.positions, base = F.eyes;
        const spacing = Math.abs(eyes[0].c[0] - eyes[1].c[0]) / Math.max(1e-6, Math.abs(base[0].c[0] - base[1].c[0]));
        const mouth = meanOf(S, F.upperTeeth.concat(F.lowerTeeth));
        const eyeY = (eyes[0].c[1] + eyes[1].c[1]) / 2, eyeY0 = (base[0].c[1] + base[1].c[1]) / 2;
        const drop = Math.abs(eyeY - mouth[1]) / Math.max(1e-6, Math.abs(eyeY0 - F.mouth[1]));
        const face = [spacing, drop, (spacing + drop) / 2];
        const eyeScale = [0, 1, 2].map(k => (eyes[0].r[k] + eyes[1].r[k]) / Math.max(1e-6, base[0].r[k] + base[1].r[k]));
        // The mouth's own width against the pack's (a grey's small mouth, a goblin's wide one).
        let corner = 0, corner0 = 0;
        for (const v of F.lips) { corner = Math.max(corner, Math.abs(S[v * 3] - mouth[0])); corner0 = Math.max(corner0, Math.abs(B[v * 3] - F.mouth[0])); }
        const mouthScale = corner / Math.max(1e-6, corner0), mouthReach = corner0 * 2.2;
        const mouthCarry = [mouthScale, face[1] * Math.sqrt(Math.min(1, mouthScale / Math.max(1e-6, face[0]))), (face[2] + mouthScale) / 2];
        // Each vertex's carry: the face's scale, the eye's own nearer the eye, the mouth's nearer the mouth.
        const scale = new Float32Array(pack.vertexCount * 3);
        for (let v = 0; v < pack.vertexCount; v++) {
            let near = 0;
            for (const e of base) near = Math.max(near, 1 - smooth(e.r[0] * 1.4, e.r[0] * 2.6, Math.hypot(B[v * 3] - e.c[0], B[v * 3 + 1] - e.c[1], B[v * 3 + 2] - e.c[2])));
            const atMouth = 1 - smooth(mouthReach * 0.5, mouthReach, Math.hypot(B[v * 3] - F.mouth[0], B[v * 3 + 1] - F.mouth[1], B[v * 3 + 2] - F.mouth[2]));
            for (let k = 0; k < 3; k++) {
                const own = face[k] + (mouthCarry[k] - face[k]) * atMouth;
                scale[v * 3 + k] = own + (eyeScale[k] - own) * near;
            }
        }
        const anc = recipe.ancestry || { african: 0, asian: 0, caucasian: 1 };
        const races = U ? U.races.map(r => [r, Math.max(0, +anc[r] || 0)]) : [];
        const total = races.reduce((s, [, w]) => s + w, 0) || 1;
        for (const r of races) r[1] /= total;
        M = { pack, S, F, U, offset, eyes, face, eyeScale, scale, races, mouth, graft, cache: new Map(), unitCache: new Map(), ok: !!U && !graft && result.plan !== 'quadruped' };
        measures.set(S, M);
        return M;
    }

    /** Whether a built character has a face these movements fit. */
    function supports(pack, result) {
        if (!result || result.plan === 'quadruped') return false;
        const M = measure(pack, result);
        return !!(M && M.ok);
    }

    /** One of MakeHuman's units carried to this face: { index, delta } (meters), blended by ancestry. */
    function baseUnit(M, name) {
        if (M.unitCache.has(name)) return M.unitCache.get(name);
        let source = name, side = 0;
        if (!M.U.units.has(name) && (name.endsWith('L') || name.endsWith('R')) && M.U.units.has(name.slice(0, -1))) { source = name.slice(0, -1); side = name.endsWith('L') ? 1 : -1; }
        const byRace = M.U.units.get(source);
        const sum = new Map();
        if (byRace) for (const [race, w] of M.races) {
            const t = byRace[race];
            if (!t || !w) continue;
            for (let i = 0; i < t.index.length; i++) {
                const v = t.index[i];
                let d = sum.get(v);
                if (!d) sum.set(v, d = [0, 0, 0]);
                for (let k = 0; k < 3; k++) d[k] += t.delta[i * 3 + k] * t.scale * w;
            }
        }
        const B = M.pack.positions;
        const index = new Uint32Array(sum.size), delta = new Float32Array(sum.size * 3);
        let n = 0;
        for (const [v, d] of sum) {
            // One side of a unit made for both: fading out over the middle of the face.
            const keep = side ? smooth(-0.006, 0.006, B[v * 3] * side) : 1;
            if (keep <= 0) continue;
            index[n] = v;
            for (let k = 0; k < 3; k++) delta[n * 3 + k] = d[k] * keep * M.scale[v * 3 + k];
            n++;
        }
        const out = { index: index.subarray(0, n), delta: delta.subarray(0, n * 3) };
        M.unitCache.set(name, out);
        return out;
    }

    /** The movements made here, as units: in the same form as MakeHuman's. */
    function ownUnit(M, name) {
        if (M.unitCache.has(name)) return M.unitCache.get(name);
        const { S, F, pack } = M, H = F.head;
        const idx = [], d = [];
        const push = (v, x, y, z) => { if (x || y || z) { idx.push(v); d.push(x, y, z); } };
        const body = [...new Set(pack.body.source)];
        const R = (M.eyes[0].r[0] + M.eyes[1].r[0]) / 2;
        if (name === 'cheekRaiseL' || name === 'cheekRaiseR') {
            // The cheek's round under the eye lifts and comes forward a little, bunching the lower lid (AU6).
            const e = M.eyes[name.endsWith('L') ? 0 : 1], sd = e.side;
            for (const v of body.concat(F.lashes)) {
                if (H.w[v] < 0.5) continue;
                const x = S[v * 3] * sd - e.c[0] * sd, y = S[v * 3 + 1] - e.c[1], z = S[v * 3 + 2] - e.c[2];
                if (z < -R * 1.6) continue;
                const g = Math.exp(-((x - R * 0.25) ** 2) / (2 * (R * 1.15) ** 2) - ((y + R * 1.55) ** 2) / (2 * (R * 0.95) ** 2));
                // Not past the nose's side, and less on the lid itself.
                const w = g * smooth(-R * 1.5, -R * 0.9, x) * (y > -R * 0.6 ? 0.55 : 1) * smooth(-R * 1.6, -R * 0.6, z);
                if (w > 0.01) push(v, 0, R * 0.32 * w * M.face[1], R * 0.1 * w * M.face[2]);
            }
        } else if (name === 'lowerLipTuck') {
            // The lower lip drawn up and back under the upper teeth (F, V).
            const half = Math.max(...F.upperTeeth.map(v => Math.abs(S[v * 3])));
            for (const v of body) {
                const w = F.lowerLip[v] * (1 - F.upperLip[v]) * (1 - smooth(half * 0.7, half * 1.3, Math.abs(S[v * 3])));
                if (w > 0.02) push(v, 0, 0.0028 * w * M.face[1], -0.0034 * w * M.face[2]);
            }
        } else if (name === 'tongueUp' || name === 'tongueOut') {
            // The tongue's tip: up behind the upper teeth (L), or forward between them (TH).
            let front = -Infinity, back = Infinity;
            for (const v of F.tongue) { front = Math.max(front, S[v * 3 + 2]); back = Math.min(back, S[v * 3 + 2]); }
            const len = Math.max(1e-4, front - back);
            for (const v of F.tongue) {
                const t = smooth(0.35, 1, (S[v * 3 + 2] - back) / len);
                if (name === 'tongueUp') push(v, 0, 0.009 * t * M.face[1], 0.002 * t * M.face[2]);
                else push(v, 0, 0.003 * t * M.face[1], 0.011 * t * t * M.face[2]);
            }
        } else if (name === 'jawSide') {
            // The jaw and lower lip slid a little to one side (the character's right), the mouth pulled with it.
            for (const v of body.concat(F.lowerTeeth, F.tongue)) {
                if (H.w[v] < 0.3) continue;
                const y = S[v * 3 + 1] - M.mouth[1];
                const w = smooth(0.004, -0.012, y) * smooth(-0.06, -0.01, S[v * 3 + 2] - M.mouth[2]) * smooth(0.075, 0.03, Math.abs(S[v * 3]));
                if (w > 0.01) push(v, -0.0035 * w * M.face[0], 0, 0);
            }
        }
        const out = { index: Uint32Array.from(idx), delta: Float32Array.from(d) };
        M.unitCache.set(name, out);
        return out;
    }

    /**
     * The face's movement for a set of unit weights: every pack vertex's
     * offset (meters) from where the body stands, the lids kept out of the
     * eyeballs. `spec` is a name, a weight map, or blend() output.
     */
    function field(pack, result, spec, weight = 1, emotion) {
        const M = measure(pack, result);
        let b = spec && spec.units && spec.gaze ? spec : blend([[spec, weight]]);
        // A character's own strength (an expression's; a viseme or the blink is asked for without it).
        if (emotion) b = strengthen(b, emotion);
        const delta = new Float32Array(pack.vertexCount * 3);
        const out = { delta, units: b.units, gaze: b.gaze, blush: b.blush, tears: b.tears, blushColor: b.blushColor || EMOTION.blushColor, moved: false };
        if (!M || !M.ok) return out;
        // The tongue rides on the jaw (fitted to the lower teeth), its own moves added: MakeHuman's units move
        // it for its own tongue's rest, not for where it lies here.
        const tongue = M.F.tongueSet || (M.F.tongueSet = new Set(M.F.tongue));
        for (const [name, w] of Object.entries(b.units)) {
            if (!w) continue;
            const own = OWN_UNITS.includes(name);
            const u = own ? ownUnit(M, name) : baseUnit(M, name);
            for (let i = 0; i < u.index.length; i++) {
                if (!own && tongue.has(u.index[i])) continue;
                const v = u.index[i] * 3;
                delta[v] += u.delta[i * 3] * w; delta[v + 1] += u.delta[i * 3 + 1] * w; delta[v + 2] += u.delta[i * 3 + 2] * w;
            }
            if (u.index.length) out.moved = true;
        }
        // Looking down, the upper lids follow the eyes a little.
        if (b.gaze && b.gaze[1] < 0) {
            const u = baseUnit(M, 'eyeCloseL'), r = baseUnit(M, 'eyeCloseR'), k = Math.min(0.3, -b.gaze[1] * 0.9);
            for (const t of [u, r]) for (let i = 0; i < t.index.length; i++) { const v = t.index[i] * 3; for (let c = 0; c < 3; c++) delta[v + c] += t.delta[i * 3 + c] * k; }
        }
        if (!out.moved && !(b.gaze && (b.gaze[0] || b.gaze[1]))) return out;
        keepLipsApart(M, delta);
        keepLidsOut(M, delta);
        return out;
    }

    /**
     * Lips that close press together instead of passing into each other: a
     * lower-lip point risen over an upper-lip point it lies behind (within
     * 1.5 mm across, 2.5 mm deep) meets it halfway, each lip flattened
     * against the other as a real mouth presses shut. A pouting lower lip
     * that comes up in front of the upper one is left as it is.
     */
    function keepLipsApart(M, delta) {
        const S = M.S, F = M.F;
        if (!M.lipPairs) {
            const lips = F.lips.filter(v => (F.upperLip[v] > 0.5 || F.lowerLip[v] > 0.5) && S[v * 3 + 2] > M.mouth[2] - 0.004);
            const upper = lips.filter(v => F.upperLip[v] > F.lowerLip[v]), lower = lips.filter(v => !(F.upperLip[v] > F.lowerLip[v]));
            const pairs = [];
            for (const a of lower) for (const b of upper) if (Math.abs(S[a * 3] - S[b * 3]) < 0.0015 && Math.abs(S[a * 3 + 2] - S[b * 3 + 2]) < 0.0025) pairs.push(a, b);
            M.lipPairs = Uint32Array.from(pairs);
        }
        const P = M.lipPairs, push = new Map();
        for (let i = 0; i < P.length; i += 2) {
            const a = P[i] * 3, b = P[i + 1] * 3;
            if (S[a + 2] + delta[a + 2] > S[b + 2] + delta[b + 2] + 0.0005) continue;
            const over = (S[a + 1] + delta[a + 1]) - (S[b + 1] + delta[b + 1]);
            if (over <= 0) continue;
            push.set(a, Math.max(push.get(a) || 0, over / 2));
            push.set(b, Math.min(push.get(b) || 0, -over / 2));
        }
        for (const [o, d] of push) delta[o + 1] -= d;
    }

    /**
     * No lid vertex goes further into its eyeball than it lies at rest (or
     * into it at all, if it was outside): pushed back out along the line from
     * the eyeball's center, in the eyeball's own proportions.
     */
    function keepLidsOut(M, delta) {
        const S = M.S, margin = 1.04;
        for (const v of M.F.lidIds) {
            const o = v * 3;
            if (!delta[o] && !delta[o + 1] && !delta[o + 2]) continue;
            const e = S[o] >= 0 ? M.eyes[0] : M.eyes[1];
            const rest = [0, 1, 2].map(k => (S[o + k] - e.c[k]) / e.r[k]), moved = [0, 1, 2].map(k => (S[o + k] + delta[o + k] - e.c[k]) / e.r[k]);
            if (moved[2] < -0.2) continue;
            const r0 = Math.hypot(...rest), r1 = Math.hypot(...moved), least = Math.min(r0, margin);
            if (r1 >= least || r1 < 1e-6) continue;
            const f = least / r1;
            for (let k = 0; k < 3; k++) delta[o + k] = e.c[k] + moved[k] * f * e.r[k] - S[o + k];
        }
    }

    // ── the teeth, the tongue and the mouth's inside ──────────────────────

    /**
     * The teeth and the tongue for a built human body (parts in the body's
     * frame), and the mouth's inside darkened in the body part's colors.
     * The teeth are made along each arch of MakeHuman's teeth helper: incisors,
     * canines, premolars and molars of their own widths, each crown rounded
     * and tapering to its edge, set in a gum.
     */
    function mouthParts(pack, built, recipe) {
        if (recipe && recipe.head && recipe.head.kind) return [];
        const S = built.shaped, F = packFields(pack);
        const head = built.bones.findIndex(b => b.name === 'Head');
        const parts = [];
        const teeth = { pos: [], col: [], idx: [], src: [] };
        const B = pack.positions, base = { half: Math.max(...F.upperTeeth.map(v => Math.abs(B[v * 3]))) };
        // A mouth made narrower than the teeth helper follows (a grey's small mouth): the arches narrow with it.
        let corner = 0, corner0 = 0, half = 0;
        for (const v of F.lips) { corner = Math.max(corner, Math.abs(S[v * 3])); corner0 = Math.max(corner0, Math.abs(B[v * 3])); }
        for (const v of F.upperTeeth) half = Math.max(half, Math.abs(S[v * 3]));
        base.squeeze = Math.min(1, (corner / Math.max(1e-6, corner0)) / Math.max(1e-6, half / base.half));
        base.upperEdge = arch(S, F.upperTeeth, 'upper', teeth, base);
        arch(S, F.lowerTeeth, 'lower', teeth, base);
        if (teeth.idx.length) {
            const n = teeth.pos.length / 3;
            parts.push({
                name: 'Teeth', positions: Float32Array.from(teeth.pos), index: Uint32Array.from(teeth.idx), colors: Float32Array.from(teeth.col), keepColors: true,
                normals: normalsOf(teeth.pos, teeth.idx), joints: new Uint8Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? head : 0)), weights: new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
                source: Int32Array.from(teeth.src), roughness: 0.3, kind: 'teeth', mouth: true, doubleSided: true, noShade: true
            });
        }
        // The tongue: MakeHuman's own, in the floor of the mouth.
        const tg = pack.helpers.tongue;
        const tpos = new Float32Array(tg.source.length * 3);
        tg.source.forEach((v, i) => { for (let k = 0; k < 3; k++) tpos[i * 3 + k] = S[v * 3 + k]; });
        // At rest its tip lies low behind the lower teeth, under the lip line.
        let tf = -Infinity, tb = Infinity;
        for (let i = 0; i < tpos.length; i += 3) { tf = Math.max(tf, tpos[i + 2]); tb = Math.min(tb, tpos[i + 2]); }
        for (let i = 0; i < tpos.length; i += 3) { const t = smooth(0.4, 1, (tpos[i + 2] - tb) / Math.max(1e-4, tf - tb)); tpos[i + 1] -= 0.005 + 0.003 * t; tpos[i + 2] -= 0.0075 * t; }
        const tn = tg.source.length, tcol = new Float32Array(tn * 3);
        // Deep in the mouth and in its shadow: a dull, dark red (a glossy one lit up as a pale ball in an open mouth).
        for (let i = 0; i < tn; i++) { tcol[i * 3] = 0.3; tcol[i * 3 + 1] = 0.07; tcol[i * 3 + 2] = 0.075; }
        parts.push({
            name: 'Tongue', positions: tpos, index: Uint32Array.from(tg.index), colors: tcol, keepColors: true, normals: normalsOf(tpos, tg.index),
            joints: new Uint8Array(tn * 4).map((_, i) => (i % 4 === 0 ? head : 0)), weights: new Float32Array(tn * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
            source: Int32Array.from(tg.source), roughness: 0.7, kind: 'teeth', mouth: true, noShade: true
        });
        return parts;
    }

    /**
     * One arch of teeth along a helper band: crowns as rounded, tapering
     * boxes along the arch's front line, of a real arch's widths and lengths
     * (millimeters, carried by the face's size), the upper edges just under
     * the lip line, the lower ones a little higher and behind them, and a
     * gum strip over the roots.
     */
    function arch(S, ids, jaw, out, base) {
        const P = ids.map(v => [S[v * 3], S[v * 3 + 1], S[v * 3 + 2], v]);
        const ys = P.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const half = Math.max(...P.map(p => Math.abs(p[0])));
        const mm = 0.001 * half / base.half;
        // The arch's front line in the ground plane: the front-most helper point near each place across.
        const outer = x => { let best = -Infinity; for (const p of P) if (Math.abs(p[0] - x) < half * 0.18) best = Math.max(best, p[2] - Math.abs(p[0] - x) * 0.3); return best; };
        const samples = [];
        for (let i = 0; i <= 40; i++) { const x = -half + (2 * half * i) / 40; samples.push([x * (jaw === 'upper' ? 1 : 0.95) * base.squeeze, outer(x)]); }
        // A smooth, symmetric arch through them: z = a + b·x² + c·x⁴ by least squares (the helper is coarse).
        const ATA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ATb = [0, 0, 0];
        for (const [x, z] of samples) { const r = [1, x * x, x ** 4]; for (let i = 0; i < 3; i++) { ATb[i] += r[i] * z; for (let j = 0; j < 3; j++) ATA[i][j] += r[i] * r[j]; } }
        const [ca, cb, cc] = solve3(ATA, ATb);
        for (const p of samples) p[1] = ca + cb * p[0] * p[0] + cc * p[0] ** 4;
        const lenAt = [0];
        for (let i = 1; i < samples.length; i++) lenAt.push(lenAt[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
        const mid = lenAt[20], halfLen = lenAt[40] / 2;
        const upper = jaw === 'upper';
        const atArc = s => {
            const target = mid + s;
            let i = 1;
            while (i < samples.length - 1 && lenAt[i] < target) i++;
            const f = Math.min(1.5, Math.max(-0.5, (target - lenAt[i - 1]) / Math.max(1e-9, lenAt[i] - lenAt[i - 1])));
            const x = samples[i - 1][0] + (samples[i][0] - samples[i - 1][0]) * f, z = samples[i - 1][1] + (samples[i][1] - samples[i - 1][1]) * f;
            const tx = samples[i][0] - samples[i - 1][0], tz = samples[i][1] - samples[i - 1][1], tl = Math.hypot(tx, tz) || 1;
            // Out of the mouth: perpendicular to the arch, away from its middle.
            let ox = tz / tl, oz = -tx / tl;
            if (ox * x + oz * 0.02 < 0 && Math.abs(x) > 1e-4) { ox = -ox; oz = -oz; }
            if (Math.abs(x) <= 1e-4 && oz < 0) { ox = -ox; oz = -oz; }
            return { x, z, tx: tx / tl, tz: tz / tl, ox, oz };
        };
        // From the middle back: central incisor, lateral incisor, canine, two premolars, two molars.
        const widths = upper ? [8.6, 6.6, 7.6, 7, 6.6, 10, 9] : [5.4, 5.9, 6.9, 7, 7.1, 11, 10.5];
        const lengths = upper ? [10.5, 9, 10, 8, 7.5, 7, 6.5] : [8, 8.5, 9.5, 8, 7.5, 7, 6.5];
        const depths = upper ? [7, 6.2, 8, 9, 9, 11, 10.5] : [6, 6, 7.5, 7.5, 8, 10.5, 10];
        // The curve of the bite: the back teeth's edges a little higher (upper) or lower (lower) than the front's.
        const curve = [0, 0.5, 0, 0.6, 0.9, 1.3, 1.7];
        const total = widths.reduce((a, b) => a + b, 0);
        const k = Math.min(1, (halfLen * 0.97) / (total * mm));
        const sign = upper ? -1 : 1; // from gum to edge: down for the upper teeth, up for the lower.
        // The upper edges just under the lip line; the lower edges 1.5 mm over them, 3 mm behind, the lower arch inside the upper.
        // Both a little behind the helper's front, clear of the lips' inner folds.
        const edgeY = upper ? y0 + (y1 - y0) * 0.01 : base.upperEdge + 1.5 * mm;
        const back = upper ? 1.2 * mm : 4.2 * mm;
        const ivory = [0.7, 0.65, 0.54], edge = [0.72, 0.72, 0.69], gum = [0.52, 0.17, 0.18];
        const nearestHelper = (x, y, z) => { let b = P[0], bd = Infinity; for (const p of P) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2; if (d < bd) { bd = d; b = p; } } return b[3]; };
        const vert = (x, y, z, col) => { out.pos.push(x, y, z); out.col.push(col[0], col[1], col[2]); out.src.push(nearestHelper(x, y, z)); return out.pos.length / 3 - 1; };
        const tri = (a, b, c) => { if (upper) out.idx.push(a, c, b); else out.idx.push(a, b, c); };
        const SEG = 12, NV = 4;
        for (const side of [1, -1]) {
            let s = 0;
            widths.forEach((w0, t) => {
                const w = w0 * mm * k, c = atArc(side * (s + w / 2));
                s += w;
                const L = lengths[t] * mm, D = depths[t] * mm * 0.9;
                const e = edgeY - sign * curve[t] * mm, g = e - sign * L;
                const ring = [];
                for (let j = 0; j <= NV; j++) {
                    const v = j / NV; // 0 at the gum, 1 at the edge
                    // Incisors thin to a blade at the edge; the back teeth stay square.
                    const thin = t < 3 ? 1 - 0.6 * v * v : 1 - 0.15 * v;
                    const narrow = 1.03 - (t < 3 ? 0.02 : 0.14) * (1 - v) * (1 - v) - 0.03 * v * v;
                    const row = [];
                    for (let a = 0; a < SEG; a++) {
                        const ang = (a / SEG) * Math.PI * 2, cx = Math.cos(ang), cz = Math.sin(ang);
                        const sq = (q, p) => Math.sign(q) * Math.pow(Math.abs(q), p);
                        const px = sq(cx, 0.4) * w * 0.48 * narrow, pz = (sq(cz, 0.5) * 0.5 - 0.5) * D * thin;
                        const y = g + sign * L * v;
                        const x = c.x + c.tx * px + c.ox * (pz - back), z = c.z + c.tz * px + c.oz * (pz - back);
                        // Further back in the mouth, less light reaches.
                        const shade = (0.82 + 0.18 * v) * [1, 0.97, 0.93, 0.82, 0.76, 0.64, 0.58][t];
                        const col = v >= 1 ? edge : ivory;
                        row.push(vert(x, y, z, [col[0] * shade, col[1] * shade, col[2] * shade]));
                    }
                    ring.push(row);
                }
                for (let j = 0; j < NV; j++) for (let a = 0; a < SEG; a++) {
                    const a1 = (a + 1) % SEG, p = ring[j][a], q = ring[j][a1], r = ring[j + 1][a], u = ring[j + 1][a1];
                    tri(p, q, r); tri(q, u, r);
                }
                const last = ring[NV];
                const cm = [0, 1, 2].map(kk => last.reduce((m, i) => m + out.pos[i * 3 + kk], 0) / SEG);
                const cap = vert(cm[0], cm[1] + sign * L * 0.02, cm[2], edge);
                for (let a = 0; a < SEG; a++) tri(last[a], last[(a + 1) % SEG], cap);
            });
        }
        // The gum: a band over the roots, from the last molar round to the other.
        const N = 30, rows = [];
        const Lg = lengths[0] * mm;
        for (let i = 0; i <= N; i++) {
            const c = atArc(-halfLen * 0.97 * k + (2 * halfLen * 0.97 * k * i) / N);
            const g = edgeY - sign * Lg * 0.92;
            const row = [];
            for (const [o, dy] of [[0.4, -sign * 1.2], [0.9, sign * -1.8], [-3, sign * -2.6], [-8, sign * -0.8]]) row.push(vert(c.x + c.ox * (o * mm - back), g + dy * mm, c.z + c.oz * (o * mm - back), gum));
            rows.push(row);
        }
        for (let i = 0; i < N; i++) for (let j = 0; j < 3; j++) {
            const p = rows[i][j], q = rows[i + 1][j], r = rows[i][j + 1], u = rows[i + 1][j + 1];
            tri(p, r, q); tri(q, r, u);
        }
        return edgeY;
    }

    function normalsOf(P, I) {
        const n = new Float32Array(P.length);
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { n[s] += nx; n[s + 1] += ny; n[s + 2] += nz; }
        }
        for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
        return n;
    }

    /**
     * Whether a covering (a full-face helmet) hides the mouth: most of the
     * lips are among the skin vertices it hides (`hidden`, the outfit's set).
     */
    function mouthCovered(pack, hidden) {
        if (!hidden || !hidden.size) return false;
        const F = packFields(pack);
        let n = 0;
        for (const v of F.lips) if (hidden.has(v)) n++;
        return n > F.lips.length * 0.5;
    }

    /** The skin of the mouth's inside, by pack vertex (behind the lips, facing the mouth's middle). */
    function mouthInside(pack, built) {
        const S = built.shaped, F = packFields(pack);
        const teeth = F.upperTeeth.concat(F.lowerTeeth);
        let x1 = 0, y0 = Infinity, y1 = -Infinity, zf = -Infinity, zb = Infinity;
        for (const v of teeth) { x1 = Math.max(x1, Math.abs(S[v * 3])); y0 = Math.min(y0, S[v * 3 + 1]); y1 = Math.max(y1, S[v * 3 + 1]); zf = Math.max(zf, S[v * 3 + 2]); zb = Math.min(zb, S[v * 3 + 2]); }
        const C = meanOf(S, teeth), N = Body.vertexNormals(pack, S), H = F.head, hy = y1 - y0, depth = Math.max(1e-4, zf - zb);
        const out = new Map();
        for (const v of new Set(pack.body.source)) {
            if (H.w[v] < 0.5) continue;
            const x = Math.abs(S[v * 3]), y = S[v * 3 + 1], z = S[v * 3 + 2];
            if (x > x1 * 1.35 || y < y0 - hy * 0.9 || y > y1 + hy * 0.9 || z > zf + 0.002) continue;
            if (N[v * 3] * (C[0] - S[v * 3]) + N[v * 3 + 1] * (C[1] - y) + N[v * 3 + 2] * (C[2] - z) <= 0) continue;
            const deep = smooth(zf + 0.002, zf - depth * 0.35, z) * (1 - smooth(x1 * 1.05, x1 * 1.35, x));
            if (deep > 0) out.set(v, deep);
        }
        return out;
    }

    /**
     * Under a covering that hides the mouth, the mouth's inside and what is
     * left of the lips go with it: their triangles are dropped from the body
     * part (in place), as the covering drops the face's.
     */
    function hideMouth(pack, built, body, hidden) {
        const gone = new Set(hidden || []);
        for (const v of mouthInside(pack, built).keys()) gone.add(v);
        for (const v of packFields(pack).lips) gone.add(v);
        const src = pack.body.source, I = body.index, keep = [];
        for (let t = 0; t < I.length; t += 3) if (!(gone.has(src[I[t]]) && gone.has(src[I[t + 1]]) && gone.has(src[I[t + 2]]))) keep.push(I[t], I[t + 1], I[t + 2]);
        body.index = Uint32Array.from(keep);
        return body;
    }

    /**
     * The mouth's inside, darker and redder the deeper it lies behind the
     * lips: written into the body part's colors (1 where nothing changes).
     */
    function tintMouth(pack, built, body) {
        const inside = mouthInside(pack, built);
        if (!inside.size) return body;
        const src = pack.body.source, n = src.length, colors = body.colors ? Float32Array.from(body.colors) : new Float32Array(n * 3).fill(1);
        const tint = [0.5, 0.16, 0.17];
        for (let i = 0; i < n; i++) {
            const deep = inside.get(src[i]);
            if (!deep) continue;
            for (let k = 0; k < 3; k++) colors[i * 3 + k] *= 1 + (tint[k] * (1 - 0.6 * smooth(0.3, 1, deep)) - 1) * deep;
        }
        body.colors = colors; body.keepColors = true;
        return body;
    }

    // ── posing parts ──────────────────────────────────────────────────────

    const bindings = new WeakMap();

    /**
     * How each part follows the face: by the pack vertex under each of its
     * vertices ('source'), by one skin vertex per strand ('rigid': a beard
     * strand moves whole with its root), turned about its eyeball ('gaze'),
     * or not at all.
     */
    function bind(pack, result) {
        let b = bindings.get(result);
        if (b && b.parts === result.parts.length) return b;
        const M = measure(pack, result), S = M.S, o = M.offset;
        const H = M.F.head;
        const face = [...new Set(pack.body.source)].filter(v => H.w[v] > 0.4);
        const cell = 0.01, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
        for (const v of face) {
            const k = key(Math.floor(S[v * 3] / cell), Math.floor(S[v * 3 + 1] / cell), Math.floor(S[v * 3 + 2] / cell));
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(v);
        }
        const nearest = (x, y, z) => {
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
            let best = -1, bd = Infinity;
            for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) for (const u of grid.get(key(cx + i, cy + j, cz + k)) || []) {
                const d = (S[u * 3] - x) ** 2 + (S[u * 3 + 1] - y) ** 2 + (S[u * 3 + 2] - z) ** 2;
                if (d < bd) { bd = d; best = u; }
            }
            nearest.d = bd;
            return bd < 0.02 * 0.02 ? best : -1;
        };
        const maps = result.parts.map((part, k) => {
            const n = part.positions.length / 3;
            if (k === 0 || part.name === 'Body') return { mode: 'source', map: pack.body.source };
            if (part.name === 'Eyes') return { mode: 'gaze' };
            // A grey's almond lenses: the lids close over them as they narrow.
            if (part.kind === 'eye') return { mode: 'lens' };
            if (part.name === 'Lashes' && pack.helpers.lashes && pack.helpers.lashes.source.length === n) return { mode: 'source', map: pack.helpers.lashes.source };
            if (part.name === 'Teeth') return { mode: 'teeth' };
            if (part.name === 'Tongue' && part.source && part.source.length === n) return { mode: 'tongue', map: part.source };
            if ((part.name === 'Forehead detail' || part.chestDetail) && part.interpolation) return { mode: 'interpolation', map: part.interpolation };
            // Cyberware (RRCharacterCyberGear): per vertex, still, riding the skin under it, or swinging with the jaw.
            if (part.faceFollow && part.faceFollow.mode.length === n) return { mode: 'follow', map: part.faceFollow };
            if (part.source && part.source.length === n && (part.name === 'Tongue' || part.name === 'Brows' || part.decal || part.onSkin)) return { mode: 'source', map: part.source };
            // Facial hair and the features on the face (tusks, a muzzle's whiskers): each strand or piece by its root.
            if (part.name === 'Facial hair' || part.kind === 'feature') return rigid(part, nearest, o);
            return null;
        });
        b = { parts: result.parts.length, maps };
        bindings.set(result, b);
        return b;
    }

    /** Connected pieces of a part, each moved by the skin vertex nearest its closest point. */
    function rigid(part, nearest, o) {
        const P = part.positions, I = part.index, n = P.length / 3;
        const parent = new Int32Array(n).map((_, i) => i);
        const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        for (let t = 0; t < I.length; t += 3) { const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]); parent[b] = a; parent[find(c)] = a; }
        const anchor = new Map(), best = new Map(), pieces = new Map();
        for (let i = 0; i < n; i++) { const r = find(i); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(i); }
        // The piece's root: the nearest the skin of a few of its points (its ends and its middle).
        for (const [r, list] of pieces) {
            const picks = list.length <= 6 ? list : [0, 1, 2, 3, 4, 5].map(k => list[Math.floor(k * (list.length - 1) / 5)]);
            for (const i of picks) {
                const v = nearest(P[i * 3] - o[0], P[i * 3 + 1] - o[1], P[i * 3 + 2] - o[2]);
                if (v < 0) continue;
                if (!best.has(r) || nearest.d < best.get(r)) { best.set(r, nearest.d); anchor.set(r, v); }
            }
        }
        if (!anchor.size) return null;
        const map = new Int32Array(n).fill(-1);
        for (let i = 0; i < n; i++) { const a = anchor.get(find(i)); if (a !== undefined) map[i] = a; }
        return { mode: 'source', map };
    }

    /** The lower teeth's movement as one affine map, fitted to the helper's lower teeth (the jaw is rigid). */
    function jawFit(M, delta) {
        const ids = M.F.lowerTeeth, S = M.S;
        let moved = false;
        for (const v of ids) if (delta[v * 3] || delta[v * 3 + 1] || delta[v * 3 + 2]) { moved = true; break; }
        if (!moved) return null;
        // Least squares: d = A·(p - c) + t, solved per axis over the helper points.
        const c = meanOf(S, ids);
        const ATA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ATb = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], t = [0, 0, 0];
        for (const v of ids) for (let k = 0; k < 3; k++) t[k] += delta[v * 3 + k] / ids.length;
        for (const v of ids) {
            const p = [S[v * 3] - c[0], S[v * 3 + 1] - c[1], S[v * 3 + 2] - c[2]];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ATA[i][j] += p[i] * p[j];
            for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 3; i++) ATb[axis][i] += p[i] * (delta[v * 3 + axis] - t[axis]);
        }
        for (let i = 0; i < 3; i++) ATA[i][i] += 1e-9;
        const A = ATb.map(b => solve3(ATA, b));
        return { c, A, t };
    }

    function solve3(m, b) {
        const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
        const d = det(m) || 1e-30;
        return [0, 1, 2].map(col => det(m.map((row, i) => row.map((x, j) => (j === col ? b[i] : x)))) / d);
    }

    /**
     * The parts posed: positions (and normals where the shape changed) per
     * part, null for a part that does not move; and the overlays (blush,
     * tears) as parts of their own. Kept per character and face.
     */
    function pose(pack, result, name, weight = 1, emotion) {
        const key = (typeof name === 'string' ? name : JSON.stringify(name)) + '@' + weight + (emotion ? JSON.stringify(normalizeEmotion(emotion)) : '');
        const M = measure(pack, result);
        if (!M) return null;
        if (M.cache.has(key)) return M.cache.get(key);
        const f = field(pack, result, name, weight, emotion);
        const out = posePartsWith(pack, result, M, f);
        if (M.cache.size > 48) M.cache.delete(M.cache.keys().next().value);
        M.cache.set(key, out);
        return out;
    }

    function posePartsWith(pack, result, M, f) {
        const D = f.delta, b = bind(pack, result);
        const positions = [], normals = [];
        const still = !f.moved && !(f.gaze && (f.gaze[0] || f.gaze[1]));
        result.parts.forEach((part, k) => {
            const m = b.maps[k];
            if (still || !m) { positions.push(null); normals.push(null); return; }
            const base = part.positions, n = base.length / 3;
            if (m.mode === 'interpolation') {
                const P = Float32Array.from(base), bind = m.map;
                for (let i = 0; i < n; i++) for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) {
                    const v = bind.vertices[j], w = bind.weights[j];
                    for (let c = 0; c < 3; c++) P[i * 3 + c] += D[v * 3 + c] * w;
                }
                positions.push(P); normals.push(Body.normals(P, Uint32Array.from({ length: n }, (_, i) => i), part.index, n));
            } else if (m.mode === 'source') {
                const P = Float32Array.from(base), map = m.map;
                let any = false;
                for (let i = 0; i < n; i++) {
                    const v = map[i];
                    if (v < 0) continue;
                    const dx = D[v * 3], dy = D[v * 3 + 1], dz = D[v * 3 + 2];
                    if (dx || dy || dz) { P[i * 3] += dx; P[i * 3 + 1] += dy; P[i * 3 + 2] += dz; any = true; }
                }
                positions.push(any ? P : null);
                normals.push(null);
            } else if (m.mode === 'follow') {
                const fit = jawFit(M, D), P = Float32Array.from(base), o = M.offset, F = m.map;
                let any = false;
                for (let i = 0; i < n; i++) {
                    const k = F.mode[i];
                    if (k === 1) {
                        const v = F.source[i];
                        if (v < 0) continue;
                        const dx = D[v * 3], dy = D[v * 3 + 1], dz = D[v * 3 + 2];
                        if (dx || dy || dz) { P[i * 3] += dx; P[i * 3 + 1] += dy; P[i * 3 + 2] += dz; any = true; }
                    } else if (k === 2 && fit) {
                        const p = [base[i * 3] - o[0] - fit.c[0], base[i * 3 + 1] - o[1] - fit.c[1], base[i * 3 + 2] - o[2] - fit.c[2]];
                        for (let a = 0; a < 3; a++) P[i * 3 + a] += fit.A[a][0] * p[0] + fit.A[a][1] * p[1] + fit.A[a][2] * p[2] + fit.t[a];
                        any = true;
                    }
                }
                positions.push(any ? P : null); normals.push(null);
            } else if (m.mode === 'teeth') {
                const fit = jawFit(M, D);
                if (!fit) { positions.push(null); normals.push(null); return; }
                // Only the lower arch follows the jaw: its vertices lean on the lower teeth helper.
                const lower = new Set(M.F.lowerTeeth), P = Float32Array.from(base), o = M.offset;
                for (let i = 0; i < n; i++) {
                    if (!lower.has(part.source[i])) continue;
                    const p = [base[i * 3] - o[0] - fit.c[0], base[i * 3 + 1] - o[1] - fit.c[1], base[i * 3 + 2] - o[2] - fit.c[2]];
                    for (let a = 0; a < 3; a++) P[i * 3 + a] += fit.A[a][0] * p[0] + fit.A[a][1] * p[1] + fit.A[a][2] * p[2] + fit.t[a];
                }
                positions.push(P); normals.push(null);
            } else if (m.mode === 'tongue') {
                const fit = jawFit(M, D), P = Float32Array.from(base), o = M.offset, map = m.map;
                let any = false;
                for (let i = 0; i < n; i++) {
                    const v = map[i];
                    let dx = D[v * 3], dy = D[v * 3 + 1], dz = D[v * 3 + 2];
                    if (fit) {
                        const p = [base[i * 3] - o[0] - fit.c[0], base[i * 3 + 1] - o[1] - fit.c[1], base[i * 3 + 2] - o[2] - fit.c[2]];
                        dx += fit.A[0][0] * p[0] + fit.A[0][1] * p[1] + fit.A[0][2] * p[2] + fit.t[0];
                        dy += fit.A[1][0] * p[0] + fit.A[1][1] * p[1] + fit.A[1][2] * p[2] + fit.t[1];
                        dz += fit.A[2][0] * p[0] + fit.A[2][1] * p[1] + fit.A[2][2] * p[2] + fit.t[2];
                    }
                    if (dx || dy || dz) { P[i * 3] += dx; P[i * 3 + 1] += dy; P[i * 3 + 2] += dz; any = true; }
                }
                positions.push(any ? P : null); normals.push(null);
            } else if (m.mode === 'gaze') {
                const g = f.gaze || [0, 0];
                if (!g[0] && !g[1]) { positions.push(null); normals.push(null); return; }
                const P = Float32Array.from(base), N = part.normals ? Float32Array.from(part.normals) : null, o = M.offset;
                const cy = Math.cos(g[0]), sy = Math.sin(g[0]), cp = Math.cos(g[1]), sp = Math.sin(g[1]);
                for (let i = 0; i < n; i++) {
                    const e = base[i * 3] - o[0] >= 0 ? M.eyes[0] : M.eyes[1];
                    const rot = (x, y, z) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp + z1 * sp, -y * sp + z1 * cp]; };
                    const c = [e.c[0] + o[0], e.c[1] + o[1], e.c[2] + o[2]];
                    const r = rot(base[i * 3] - c[0], base[i * 3 + 1] - c[1], base[i * 3 + 2] - c[2]);
                    P[i * 3] = c[0] + r[0]; P[i * 3 + 1] = c[1] + r[1]; P[i * 3 + 2] = c[2] + r[2];
                    if (N) { const q = rot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); N[i * 3] = q[0]; N[i * 3 + 1] = q[1]; N[i * 3 + 2] = q[2]; }
                }
                positions.push(P); normals.push(N);
            } else if (m.mode === 'lens') {
                const shut = [0, 1].map(i => { const sd = i ? 'R' : 'L'; return Math.min(1, Math.max(-0.3, (f.units['eyeClose' + sd] || 0) + 0.45 * (f.units['eyeSquint' + sd] || 0) - 0.3 * (f.units['eyeWide' + sd] || 0))); });
                if (!shut[0] && !shut[1]) { positions.push(null); normals.push(null); return; }
                const P = Float32Array.from(base), c = [[0, 0, 0, 0], [0, 0, 0, 0]];
                for (let i = 0; i < n; i++) { const e = c[base[i * 3] >= 0 ? 0 : 1]; e[0] += base[i * 3]; e[1] += base[i * 3 + 1]; e[2] += base[i * 3 + 2]; e[3]++; }
                for (let i = 0; i < n; i++) {
                    const side = base[i * 3] >= 0 ? 0 : 1, e = c[side], cy = e[1] / Math.max(1, e[3]);
                    P[i * 3 + 1] = cy + (base[i * 3 + 1] - cy) * (1 - 0.94 * shut[side]);
                }
                positions.push(P); normals.push(null);
            } else { positions.push(null); normals.push(null); }
        });
        // The body's normals from its moved shape.
        if (positions[0]) {
            const S2 = Float32Array.from(M.S);
            for (let i = 0; i < S2.length; i++) S2[i] += D[i];
            normals[0] = Body.normals(S2, pack.body.source, pack.body.index, pack.vertexCount);
            // The brows and other skin decals lie along the skin's new normals.
            result.parts.forEach((part, k) => {
                const m = b.maps[k];
                if (k === 0 || !positions[k] || !m || m.mode !== 'source' || !(part.decal || part.onSkin)) return;
                const all = Body.vertexNormals(pack, S2), N = new Float32Array(part.positions.length);
                for (let i = 0; i < m.map.length; i++) { const v = m.map[i]; if (v >= 0) for (let c = 0; c < 3; c++) N[i * 3 + c] = all[v * 3 + c]; }
                normals[k] = N;
            });
        }
        const overlays = overlayParts(pack, result, M, f, positions[0]);
        return { positions, normals, overlays, gaze: f.gaze, blush: f.blush, tears: f.tears };
    }

    /** The character's parts with a face: copies where the face moved, the overlays after them. */
    function posedParts(pack, result, name, weight = 1, emotion) {
        const p = pose(pack, result, name, weight, emotion);
        if (!p) return result.parts.slice();
        const parts = result.parts.map((part, k) => (p.positions[k] ? Object.assign({}, part, { positions: p.positions[k], normals: p.normals[k] || part.normals }) : part));
        return parts.concat(p.overlays);
    }

    // ── blush and tears ───────────────────────────────────────────────────

    /** Body triangles of a region, as a decal patch just over the skin: { ids (body render vertices), index }. */
    function patch(pack, result, weightOf) {
        const body = result.parts[0], I = body.index, src = pack.body.source;
        const w = new Float32Array(src.length);
        for (let i = 0; i < src.length; i++) w[i] = weightOf(src[i]);
        const keep = new Map(), index = [];
        for (let t = 0; t < I.length; t += 3) {
            if (w[I[t]] < 0.01 && w[I[t + 1]] < 0.01 && w[I[t + 2]] < 0.01) continue;
            for (let j = 0; j < 3; j++) { const v = I[t + j]; if (!keep.has(v)) keep.set(v, keep.size); index.push(keep.get(v)); }
        }
        const ids = new Int32Array(keep.size);
        for (const [v, i] of keep) ids[i] = v;
        return { ids, index: Uint32Array.from(index), alpha: Float32Array.from(ids, v => w[v]) };
    }

    function overlayParts(pack, result, M, f, bodyPositions) {
        const out = [];
        if (!(f.blush > 0.01 || f.tears > 0.01)) return out;
        const S = M.S, body = result.parts[0];
        const P = bodyPositions || body.positions, N = Body.normals(Float32Array.from(S, (x, i) => x + f.delta[i]), pack.body.source, pack.body.index, pack.vertexCount);
        const R = (M.eyes[0].r[0] + M.eyes[1].r[0]) / 2;
        const make = (name, pt, color, lift, extra) => {
            const n = pt.ids.length, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), colors = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const r = pt.ids[i];
                for (let k = 0; k < 3; k++) { normals[i * 3 + k] = N[r * 3 + k]; positions[i * 3 + k] = P[r * 3 + k] + N[r * 3 + k] * lift; colors[i * 3 + k] = color[k]; }
            }
            const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
            for (let i = 0; i < n; i++) { joints.set(body.joints.subarray(pt.ids[i] * 4, pt.ids[i] * 4 + 4), i * 4); weights.set(body.weights.subarray(pt.ids[i] * 4, pt.ids[i] * 4 + 4), i * 4); }
            return Object.assign({ name, positions, normals, colors, alpha: pt.alpha, index: pt.index, joints, weights, decal: true, noShade: true, kind: 'overlay', opacity: 0.999 }, extra);
        };
        if (f.blush > 0.01) {
            const key = 'blush';
            let pt = M.unitCache.get(key);
            if (!pt) {
                // Over each cheekbone and a little across the nose.
                pt = patch(pack, result, v => {
                    if (M.F.head.w[v] < 0.5) return 0;
                    let a = 0;
                    for (const e of M.eyes) {
                        const x = (S[v * 3] - e.c[0]) * e.side, y = S[v * 3 + 1] - e.c[1], z = S[v * 3 + 2] - e.c[2];
                        if (z < -R * 1.4) continue;
                        a = Math.max(a, Math.exp(-((x - R * 0.35) ** 2) / (2 * (R * 1.0) ** 2) - ((y + R * 1.7) ** 2) / (2 * (R * 0.85) ** 2)));
                    }
                    const nose = Math.exp(-(S[v * 3] ** 2) / (2 * (R * 0.7) ** 2) - ((S[v * 3 + 1] - M.eyes[0].c[1] + R * 1.4) ** 2) / (2 * (R * 0.6) ** 2)) * 0.35;
                    return Math.min(1, Math.max(a, nose * smooth(M.eyes[0].c[2], M.eyes[0].c[2] + R * 2, S[v * 3 + 2])) * 1.1);
                });
                M.unitCache.set(key, pt);
            }
            const strength = Math.min(2, f.blush);
            // A flush: the skin's own color multiplied toward the character's blush tint (green and blue held back),
            // so light skin pinks and deep skin darkens a touch; never paint over it, never brighten it.
            const hex = parseInt(String(f.blushColor || EMOTION.blushColor).slice(1), 16);
            const tint = [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
            out.push(make('Blush', Object.assign({}, pt, { alpha: pt.alpha.map(a => Math.min(0.9, a * 0.5 * strength)) }), tint, 0.0004, { blend: 'multiply', roughness: 0.6 }));
        }
        if (f.tears > 0.01) {
            const key = 'tears';
            let pt = M.unitCache.get(key);
            if (!pt) {
                // A wet line along each lower lid, and a trail down the cheek from its inner third.
                pt = patch(pack, result, v => {
                    if (M.F.head.w[v] < 0.5) return 0;
                    let a = 0;
                    for (const e of M.eyes) {
                        const x = (S[v * 3] - e.c[0]) * e.side, y = S[v * 3 + 1] - e.c[1], z = S[v * 3 + 2] - e.c[2];
                        if (z < -R * 0.5) continue;
                        const lid = Math.exp(-((y + R * 0.78) ** 2) / (2 * (R * 0.12) ** 2)) * smooth(R * 1.05, R * 0.6, Math.abs(x + R * 0.05));
                        // The trail wanders a little as it runs down.
                        const tx = -R * 0.25 + Math.sin(y / R * 1.7) * R * 0.08;
                        const trail = Math.exp(-((x - tx) ** 2) / (2 * (R * 0.09) ** 2)) * smooth(-R * 0.7, -R * 0.95, y) * smooth(-R * 3.6, -R * 2.6, y);
                        a = Math.max(a, lid, trail);
                    }
                    return a;
                });
                M.unitCache.set(key, pt);
            }
            // Water on skin: the skin under it a little darker and deeper, with the shine of a wet surface.
            out.push(make('Tears', Object.assign({}, pt, { alpha: pt.alpha.map(a => a * 0.5 * Math.min(1, f.tears)) }), [0.78, 0.76, 0.78], 0.0006, { roughness: 0.04, wet: true, blend: 'multiply' }));
        }
        return out;
    }

    // ── the saved file ────────────────────────────────────────────────────

    /**
     * Every expression and viseme as morph targets: [{ name, parts: [{ part
     * (index), indices: Uint32Array, deltas: Float32Array (xyz each) }] }],
     * only the vertices that move, only parts that move. Empty for a
     * character without a face these fit.
     */
    function morphTargets(pack, result, names) {
        if (!supports(pack, result)) return [];
        const list = names || MORPH_NAMES;
        const out = [];
        for (const name of list) {
            // The expressions at the character's own strength and blush; the mouth shapes as they are.
            const own = String(name).startsWith('expression_') ? emotionOf(result.recipe) : undefined;
            const p = posePartsWith(pack, result, measure(pack, result), field(pack, result, name, 1, own));
            const parts = [];
            p.positions.forEach((P, k) => {
                if (!P) return;
                const part = result.parts[k], base = part.positions, idx = [], d = [];
                // Hair strands that ride whole on the skin (a beard) are many vertices: only where they move a couple of millimeters.
                const hair = part.kind === 'hair' && part.name !== 'Lashes' && part.name !== 'Brows';
                let most = 0;
                for (let i = 0; i < base.length; i++) most = Math.max(most, Math.abs(P[i] - base[i]));
                if (hair && most < 0.0025) return;
                // Under a tenth of a millimeter is left out.
                for (let i = 0; i < base.length / 3; i++) {
                    const dx = P[i * 3] - base[i * 3], dy = P[i * 3 + 1] - base[i * 3 + 1], dz = P[i * 3 + 2] - base[i * 3 + 2];
                    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-4) { idx.push(i); d.push(dx, dy, dz); }
                }
                if (idx.length) parts.push({ part: k, indices: Uint32Array.from(idx), deltas: Float32Array.from(d) });
            });
            out.push({ name, parts });
        }
        return out;
    }

    // ── the builder's view ────────────────────────────────────────────────

    /**
     * Poses the builder's meshes (view.meshes, one per result part, as
     * built) with a face, in place: positions and normals written into their
     * geometry, the overlays as meshes of their own in view.group. The
     * neutral face puts every mesh back as built.
     */
    function applyToView(view, result, pack, name, weight, THREE, emotion) {
        if (!view || !result || !view.meshes || view.meshes.length !== result.parts.length) return false;
        const p = supports(pack, result) ? pose(pack, result, name || 'neutral', weight ?? 1, emotion || emotionOf(result.recipe)) : null;
        result.parts.forEach((part, k) => {
            const g = view.meshes[k].geometry, pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
            const P = (p && p.positions[k]) || part.positions, N = (p && p.normals[k]) || part.normals;
            if (pos.array.length === P.length) { pos.array.set(P); pos.needsUpdate = true; }
            if (nrm && N && nrm.array.length === N.length) { nrm.array.set(N); nrm.needsUpdate = true; }
            g.computeBoundingSphere && g.computeBoundingSphere();
        });
        for (const m of view.expressionOverlays || []) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
        // (a wet overlay's two meshes share one geometry; disposing it twice is harmless)
        view.expressionOverlays = [];
        if (p && THREE) for (const o of p.overlays) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(o.positions, 3));
            g.setAttribute('normal', new THREE.BufferAttribute(o.normals, 3));
            const multiply = o.blend === 'multiply';
            // Multiplied overlays are unlit: what is under them is kept at (1 - a) + a·tint of its own color, lit as it
            // already is (blended DstColor + Zero). The factor is what the screen shows, so it is written in linear
            // light: the renderer's sRGB output turns it back into the factor itself (written as it is, a faint
            // factor came out over 1 and the cheeks glowed).
            const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
            const rgba = new Float32Array(o.alpha.length * 4);
            for (let i = 0; i < o.alpha.length; i++) {
                const a = o.alpha[i];
                for (let c = 0; c < 3; c++) rgba[i * 4 + c] = multiply ? lin(1 - a + a * o.colors[i * 3 + c]) : o.colors[i * 3 + c];
                rgba[i * 4 + 3] = multiply ? 1 : a;
            }
            g.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
            g.setIndex(new THREE.BufferAttribute(o.index, 1));
            g.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(o.joints), 4));
            g.setAttribute('skinWeight', new THREE.BufferAttribute(o.weights, 4));
            const common = { vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
            const mat = multiply ? new THREE.MeshBasicMaterial(Object.assign(common, { toneMapped: false })) : new THREE.MeshStandardMaterial(Object.assign(common, { roughness: o.roughness ?? 0.5, metalness: 0 }));
            if (multiply) {
                mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.DstColorFactor; mat.blendDst = THREE.ZeroFactor;
                // The picture's own alpha (a sprite's edge) is kept as it was.
                mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor;
            }
            const body = view.meshes[0];
            const add = material => {
                const mesh = body.isSkinnedMesh ? new THREE.SkinnedMesh(g, material) : new THREE.Mesh(g, material);
                if (mesh.isSkinnedMesh) mesh.bind(body.skeleton, body.bindMatrix);
                mesh.renderOrder = 2;
                (body.parent || view.group).add(mesh);
                view.expressionOverlays.push(mesh);
            };
            add(mat);
            // Tears also shine: a clear, glossy film over the darkened skin, lit by the room.
            if (o.wet) add(new THREE.MeshStandardMaterial(Object.assign({}, common, { color: 0x000000, roughness: 0.04, metalness: 0, opacity: 1, transparent: true, blending: THREE.AdditiveBlending, envMapIntensity: 1.4 })));
        }
        return true;
    }

    /**
     * Morph targets on the builder's meshes for the visemes and the blink
     * (speech preview): geometry.morphAttributes.position per moving part,
     * and the names → indices, so a talk only sets influences each frame.
     */
    function attachViewMorphs(view, result, pack, THREE, names) {
        if (!supports(pack, result)) return null;
        const list = names || VISEMES.filter(v => v.id !== 'rest').map(v => 'viseme_' + v.id).concat(['blink']);
        const targets = morphTargets(pack, result, list);
        const meshes = new Map();
        targets.forEach((t, ti) => {
            for (const pt of t.parts) {
                const mesh = view.meshes[pt.part];
                if (!mesh) continue;
                if (!meshes.has(mesh)) meshes.set(mesh, list.map(() => new Float32Array(mesh.geometry.getAttribute('position').count * 3)));
                const arr = meshes.get(mesh)[ti];
                for (let i = 0; i < pt.indices.length; i++) for (let c = 0; c < 3; c++) arr[pt.indices[i] * 3 + c] = pt.deltas[i * 3 + c];
            }
        });
        for (const [mesh, arrays] of meshes) {
            mesh.geometry.morphAttributes.position = arrays.map(a => new THREE.BufferAttribute(a, 3));
            mesh.geometry.morphTargetsRelative = true;
            mesh.updateMorphTargets();
            mesh.morphTargetDictionary = Object.fromEntries(list.map((n, i) => [n, i]));
        }
        return { names: list, meshes: [...meshes.keys()] };
    }

    function detachViewMorphs(handle) {
        if (!handle) return;
        for (const mesh of handle.meshes) {
            mesh.geometry.morphAttributes = {};
            mesh.geometry.morphTargetsRelative = false;
            mesh.morphTargetInfluences = undefined;
            mesh.morphTargetDictionary = undefined;
            if (mesh.material) mesh.material.needsUpdate = true;
        }
    }

    /**
     * The builder's face: its meshes posed with an expression (the sprite
     * sheet's portraits and the Expression choice). `builder` is the
     * Character3DBuilder page (its view, its built result and pack).
     */
    function apply(builder, name, weight = 1) {
        const THREE = root.THREE;
        if (!builder || !builder._view || !builder._result) return false;
        // The builder's own settings, as edited (the built result's recipe may be a step behind).
        return applyToView(builder._view, builder._result, builder.pack, name || 'neutral', weight, THREE, emotionOf(builder.recipe));
    }

    // ── text-driven speech ────────────────────────────────────────────────

    /** The viseme of each character of a line (rest for spaces and punctuation). */
    function lineVisemes(text) {
        const s = String(text || '').toLowerCase(), out = [];
        for (let i = 0; i < s.length; i++) {
            const two = s.slice(i, i + 2);
            if (LETTER_VISEMES.digraphs[two]) { out.push(LETTER_VISEMES.digraphs[two], LETTER_VISEMES.digraphs[two]); i++; continue; }
            out.push(LETTER_VISEMES.letters[s[i]] || 'rest');
        }
        return out;
    }

    /** The talk preview's line: printed a letter a frame, as a message window prints at its usual speed. */
    const SAMPLE_LINE = 'Hello there, traveler! Welcome to our village. Would you like to rest by the fire for a while?';

    /**
     * Plays a line on the builder's view: the visemes (and a blink) as morph
     * targets on its meshes, a letter printed each frame, each shape held a
     * few frames and eased in and out, the mouth shut at the line's commas
     * and end. The expression shown stays under it. Returns { stop() };
     * `draw` is called each frame, `done` once the line ends or is stopped.
     */
    function talk(view, result, pack, THREE, options) {
        const o = options || {};
        const handle = attachViewMorphs(view, result, pack, THREE);
        if (!handle) return null;
        const names = handle.names, shapes = lineVisemes(o.line || SAMPLE_LINE);
        const weights = new Float32Array(names.length), target = new Float32Array(names.length);
        const ids = names.map(n => n.replace('viseme_', ''));
        let frame = 0, last = -1, hold = 0, pause = 0, raf = 0, stopped = false, paused = false, blinkAt = 40;
        const text = o.line || SAMPLE_LINE;
        const step = () => {
            raf = 0;
            if (stopped || paused) return;
            target.fill(0);
            const i = frame - 10;
            if (pause > 0) pause--;
            else if (i >= 0 && i < shapes.length) {
                const v = shapes[i], ch = text[i];
                // A message window waits a little at the end of a clause.
                if (ch === ',' || ch === '.' || ch === '!' || ch === '?') pause = ch === ',' ? 8 : 18;
                if (v !== 'rest') { last = ids.indexOf(v); hold = 3; } else hold = Math.min(hold, 1);
                frame++;
            } else frame++;
            if (hold > 0) { if (last >= 0) target[last] = 0.9; hold--; }
            const blink = names.indexOf('blink');
            for (let k = 0; k < names.length; k++) {
                if (k === blink) continue;
                const rate = target[k] > weights[k] ? 0.31 : 0.2;
                weights[k] += (target[k] - weights[k]) * rate;
            }
            if (blink >= 0) { const p = (frame - blinkAt) / 10; weights[blink] = p < 0 || p > 1 ? 0 : p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6; if (p > 1) blinkAt = frame + 130 + Math.floor(Math.random() * 120); }
            for (const mesh of handle.meshes) for (let k = 0; k < names.length; k++) mesh.morphTargetInfluences[k] = weights[k];
            if (o.draw) o.draw();
            if (frame > shapes.length + 40 && weights.every(w => w < 0.01)) { finish(); return; }
            raf = requestAnimationFrame(step);
        };
        const finish = () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(raf);
            detachViewMorphs(handle);
            if (o.draw) o.draw();
            if (o.done) o.done();
        };
        raf = requestAnimationFrame(step);
        return { stop: finish, pause(value = true) {
            paused = !!value;
            if (paused) { cancelAnimationFrame(raf); raf = 0; }
            else if (!stopped && !raf) raf = requestAnimationFrame(step);
        } };
    }

    const api = {
        BASE_UNITS, OWN_UNITS, EXPRESSIONS, BY_ID, VISEMES, VISEME_BY_ID, LETTER_VISEMES, SHEETS, MORPH_NAMES,
        openUnits, units, preload, definition, weights, blend, measure, supports, field, pose, posedParts,
        mouthParts, tintMouth, mouthCovered, mouthInside, hideMouth, morphTargets, applyToView, attachViewMorphs, detachViewMorphs, lineVisemes, eyeBalls,
        ALIASES, apply, talk, SAMPLE_LINE, EMOTION, EMOTION_RANGE, normalizeEmotion, emotionOf, strengthen
    };
    root.RRCharacterExpressions = api;
    // The body's resting mouth closes the lips with these units (HumanBody's closeLips).
    if (Body && Body.useExpressions) Body.useExpressions(api);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
