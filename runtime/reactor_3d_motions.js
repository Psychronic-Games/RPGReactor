/**
 * reactor_3d_motions.js - the shared motion library: the poses and motions
 * of Forge › 3D Character Builder and the default motions of every rigged
 * humanoid in the game, one source for both. Loaded by the game when a
 * rigged humanoid first needs a motion of its own, and by the editor.
 *
 *   RRMotionLibrary.POSES             [{ id, label, group }], in the panel's order (GROUPS)
 *   RRMotionLibrary.clip(bones, id, body, options)   { name, times, tracks: [{ bone, values }], heights, lift, skin, once } or null
 *   RRMotionLibrary.stateClip(bones, id)   one of STATE_MOTIONS as the game plays it
 *   RRMotionLibrary.gameClips(bones, body, set)   the clips a saved character carries (GAME_CLIPS)
 *   RRMotionLibrary.load() / loadAsync(url)   reads the data (reactor_3d_motions.bin beside this file)
 *
 * (Also `RRCharacterPoses`, the name the builder knows it by.)
 *
 * `bones` is a skeleton at rest: [{ name, parent, head, tail? }], Mixamo's
 * names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm,
 * LeftForeArm, LeftHand and its fingers, LeftUpLeg, LeftLeg, LeftFoot,
 * LeftToeBase and the right side's), any of them but the arms' and legs'
 * own optional. `body` (optional) is the body's skin at rest, { positions,
 * joints, weights }: the arms then keep out of the trunk as this body is
 * shaped.
 *
 * Bones rest unrotated (each one's frame is the world's); the character
 * faces +z with its left toward +x. A track holds one quaternion per time.
 * The motions are motion capture (the data, from the CMU Graphics Lab
 * Motion Capture Database; see reactor_3d_motions.LICENSE.md), some with
 * authored layers over it: per frame, each mapped bone's frame in the
 * world, a direction along it and one across it. Each body's own joints
 * are turned to match them, so a motion holds for any height, limb length
 * or build; the arms keep out of the body's own trunk, and the hands off
 * the face. The wrists hang as a hand hangs (the capture's twist kept, its
 * bend not), the fingers take the pose's hand shapes (HAND_SHAPES),
 * closing until they meet the palm, the legs keep within their joints'
 * reach (LEG_RANGE), and the hands (and for a climb the feet) reach where
 * the pose's aim sets them on this body: a gun on the eye's line, a rifle
 * in the shoulder, both hands on one hilt, rungs and holds. `lift(t)` is
 * how far the whole body stands off its rest height at time t: worked out
 * by following the skeleton joint by joint, so the lowest heel, ball or
 * toe touches the floor, and for a jump, a flip or a run's flight the
 * capture's own height off it added, in leg lengths. A pose resting the
 * body itself on the floor (sitting, kneeling, lying) says `skin`; a
 * motion that plays once (a fall, a flip, a throw) says `once`.
 */
(function (root) {
    'use strict';
    const DEG = Math.PI / 180;

    /**
     * Each pose: `group` the list it shows under (GROUPS), `hands` the shape
     * each hand holds (a HAND_SHAPES name, or keys over time), `wrist` how
     * the wrists bend when not relaxed, `aim` the hands and feet it sets on
     * each body (AIMS).
     */
    const GROUPS = [{ id: 'move', label: 'Move' }, { id: 'fight', label: 'Fight' }, { id: 'rest', label: 'Rest' }];
    /** The wrists' relaxed bend (degrees toward the palm, toward the little finger). */
    const WRIST = { flex: 8, bend: 6 };
    const both = shape => ({ Left: shape, Right: shape });
    const POSES = [
        { id: 'walk', label: 'Walking', group: 'move', hands: both('relaxed') }, { id: 'run', label: 'Running', group: 'move', hands: both('looseFist'), wrist: { flex: 4, bend: 2 } },
        { id: 'crouch', label: 'Crouching', group: 'rest', hands: both('relaxed') }, { id: 'jump', label: 'Jumping', group: 'move', hands: both('relaxed') },
        { id: 'fall', label: 'Falling', group: 'move', hands: both('open'), aim: 'fall', wrist: { flex: -10, bend: 0 } }, { id: 'fight', label: 'Fighting stance', group: 'fight', hands: both('fist'), wrist: { flex: 0, bend: 4 } },
        { id: 'wave', label: 'Waving', group: 'rest', hands: { Left: 'relaxed', Right: 'open' }, aim: 'wave', wrist: { Left: WRIST, Right: { flex: -6, bend: 0 } } },
        { id: 'armsUp', label: 'Arms up', group: 'rest', hands: both('open'), wrist: { flex: -8, bend: 0 } },
        { id: 'kneel', label: 'Kneeling', group: 'rest', hands: both('relaxed'), aim: 'kneel' }, { id: 'sit', label: 'Sitting', group: 'rest', hands: both('relaxed') },
        { id: 'lieBack', label: 'Lying on the back', group: 'rest', hands: both('relaxed') }, { id: 'lieSide', label: 'Lying on the side', group: 'rest', hands: both('relaxed') },
        { id: 'pistol', label: 'Pistol aim', group: 'fight', hands: { Left: 'relaxed', Right: 'gun' }, aim: 'pistol', wrist: { Left: WRIST, Right: { flex: 0, bend: 0 } } },
        { id: 'pistolTwo', label: 'Pistol aim, two hands', group: 'fight', hands: { Left: 'support', Right: 'gun' }, aim: 'pistolTwo' },
        { id: 'rifle', label: 'Rifle aim', group: 'fight', hands: { Left: 'support', Right: 'gun' }, aim: 'rifle' },
        { id: 'kneelAim', label: 'Kneeling aim', group: 'fight', hands: { Left: 'support', Right: 'gun' }, aim: 'rifle' },
        { id: 'prone', label: 'Lying face down', group: 'rest', hands: both('relaxed') },
        { id: 'proneAim', label: 'Prone aim', group: 'fight', hands: { Left: 'support', Right: 'gun' }, aim: 'rifle', aimPitch: 0.04, elbowDown: true },
        { id: 'crouchWalk', label: 'Walking crouched', group: 'move', hands: both('relaxed') },
        { id: 'sword', label: 'Sword swing', group: 'fight', hands: both('sword'), aim: 'slash', wrist: { flex: 0, bend: 0 } },
        { id: 'swordThrust', label: 'Thrust', group: 'fight', hands: both('sword'), aim: 'thrust' },
        { id: 'bow', label: 'Bow', group: 'fight', hands: { Left: 'sword', Right: [[0, 'archerDraw'], [1.36, 'archerDraw'], [1.48, 'open'], [1.68, 'open'], [2, 'archerDraw']] }, aim: 'bow' },
        { id: 'defend', label: 'Guarding', group: 'fight', hands: both('fist'), wrist: { flex: 0, bend: 4 } },
        { id: 'hit', label: 'Taking a hit', group: 'fight', hands: both('looseFist'), wrist: { flex: 0, bend: 4 } },
        { id: 'death', label: 'Falling dead', group: 'fight', hands: both('relaxed') },
        { id: 'cast', label: 'Casting a spell', group: 'fight', hands: { Left: [[0, 'relaxed'], [0.5, 'grab'], [1.3, 'grab'], [1.5, 'open'], [2.2, 'open'], [2.8, 'relaxed']], Right: [[0, 'relaxed'], [0.5, 'grab'], [1.3, 'grab'], [1.5, 'open'], [2.2, 'open'], [2.8, 'relaxed']] }, aim: 'cast', freeWrist: true, aimMix: [[0, 0], [0.55, 1], [2.25, 1], [3, 0]] },
        { id: 'throw', label: 'Throwing', group: 'fight', hands: { Left: 'relaxed', Right: 'grab' } },
        { id: 'dodge', label: 'Dodging', group: 'fight', hands: both('looseFist') },
        { id: 'roll', label: 'Rolling', group: 'move', hands: both('relaxed') },
        { id: 'frontFlip', label: 'Front flip', group: 'move', hands: both('relaxed') }, { id: 'backFlip', label: 'Back flip', group: 'move', hands: both('relaxed') },
        { id: 'climbLadder', label: 'Climbing a ladder', group: 'move', hands: both('grab'), aim: 'ladder' }, { id: 'climbWall', label: 'Climbing a wall', group: 'move', hands: both('grab'), aim: 'wall' },
        { id: 'swim', label: 'Swimming', group: 'move', hands: both('flat'), wrist: { flex: 0, bend: 0 } }, { id: 'tread', label: 'Treading water', group: 'move', hands: both('flat'), aim: 'tread' }
    ];
    // The panel's order: by group, then as a person would look for them.
    const ORDER = ['walk', 'run', 'crouchWalk', 'jump', 'fall', 'roll', 'frontFlip', 'backFlip', 'climbLadder', 'climbWall', 'swim', 'tread',
        'fight', 'defend', 'sword', 'swordThrust', 'bow', 'pistol', 'pistolTwo', 'rifle', 'kneelAim', 'proneAim', 'throw', 'cast', 'dodge', 'hit', 'death',
        'crouch', 'kneel', 'sit', 'lieBack', 'lieSide', 'prone', 'wave', 'armsUp'];
    POSES.sort((x, y) => ORDER.indexOf(x.id) - ORDER.indexOf(y.id));

    const quat = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
    const mul = (a, b) => [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
    const rotate = (q, v) => {
        const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
        return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
    };
    /** How far each joint's flesh reaches below it, by name (meters on a 1.7 m body): the floor stops it there. */
    const REACH = { Hips: 0.11, Spine: 0.1, Spine1: 0.1, Spine2: 0.11, Neck: 0.06, Head: 0.1, Arm: 0.05, ForeArm: 0.04, Hand: 0.025, UpLeg: 0.085, Leg: 0.055 };

    // ── the data ────────────────────────────────────────────────────────
    /** Where this file was loaded from, for the data beside it. */
    const SCRIPT_URL = typeof document !== 'undefined' && document.currentScript && document.currentScript.src ? document.currentScript.src : null;
    const FILE = 'reactor_3d_motions.bin';
    let DATA = null;
    /** The data file's bytes opened: its index, and its samples as numbers. */
    function open(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        if (u8.byteLength < 12 || view.getUint32(0, true) !== 0x4f4d5252) return false;
        const length = view.getUint32(8, true), index = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + length)));
        const start = 12 + length, count = (u8.byteLength - start) >> 1, samples = new Int16Array(count);
        for (let i = 0; i < count; i++) samples[i] = view.getInt16(start + i * 2, true);
        DATA = Object.assign(index, { samples });
        decoded.clear();
        return true;
    }
    /** The data read at once where the disk can be read (Node, NW.js), from `api.dataPath` or beside this file; true once in. */
    function load() {
        if (DATA) return true;
        try {
            if (typeof require !== 'function') return false;
            const fs = require('fs'), path = require('path');
            const candidates = [];
            if (api.dataPath) candidates.push(api.dataPath);
            if (typeof __dirname === 'string') candidates.push(path.join(__dirname, FILE));
            if (typeof process !== 'undefined' && process.mainModule && process.mainModule.filename) candidates.push(path.join(path.dirname(process.mainModule.filename), 'js', FILE));
            if (SCRIPT_URL && /^file:/.test(SCRIPT_URL)) candidates.push(decodeURIComponent(new URL(FILE, SCRIPT_URL).pathname));
            for (const file of candidates) if (fs.existsSync(file)) return open(fs.readFileSync(file));
        } catch (error) { return false; }
        return false;
    }
    /** The data fetched (a browser): resolves true once in. */
    let fetching = null;
    function loadAsync(url) {
        if (DATA || load()) return Promise.resolve(true);
        if (!fetching) {
            const at = url || (SCRIPT_URL ? new URL(FILE, SCRIPT_URL).href : 'js/' + FILE);
            fetching = fetch(at).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => !!b && open(b)).catch(() => false).then(ok => { if (!ok) fetching = null; return ok; });
        }
        return fetching;
    }
    const decoded = new Map();
    /** A run of samples as numbers in -1..1. */
    const decode = ([at, count]) => { const out = new Float32Array(count); for (let i = 0; i < count; i++) out[i] = DATA.samples[at + i] / 32767; return out; };
    function take(id) {
        if (decoded.has(id)) return decoded.get(id);
        if (!DATA && !load()) return null;
        const p = DATA.poses && DATA.poses[id];
        const t = p ? { frames: p.frames, fps: p.fps || DATA.fps, air: p.air, skin: !!p.skin, once: !!p.once, hang: !!p.hang, rise: decode(p.rise), bones: Object.fromEntries(Object.entries(p.bones).map(([n, v]) => [n, decode(v)])) } : null;
        decoded.set(id, t);
        return t;
    }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const square = (s, d) => { const k = dot(s, d); return unit([s[0] - d[0] * k, s[1] - d[1] * k, s[2] - d[2] * k]); };
    const conj = q => [-q[0], -q[1], -q[2], q[3]];
    /** The turn taking x to d and y to s (made square to d). */
    function frameQuat(d, s) {
        const a = unit(d), b = square(s, a), c = cross(a, b);
        const m00 = a[0], m01 = b[0], m02 = c[0], m10 = a[1], m11 = b[1], m12 = c[1], m20 = a[2], m21 = b[2], m22 = c[2], t = m00 + m11 + m22;
        let q;
        if (t > 0) { const k = 0.5 / Math.sqrt(t + 1); q = [(m21 - m12) * k, (m02 - m20) * k, (m10 - m01) * k, 0.25 / k]; }
        else if (m00 > m11 && m00 > m22) { const k = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * k, (m01 + m10) / k, (m02 + m20) / k, (m21 - m12) / k]; }
        else if (m11 > m22) { const k = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / k, 0.25 * k, (m12 + m21) / k, (m02 - m20) / k]; }
        else { const k = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / k, (m12 + m21) / k, 0.25 * k, (m10 - m01) / k]; }
        const l = Math.hypot(...q);
        return q.map(v => v / l);
    }

    /**
     * Each mapped bone's own frame at rest, as the capture's frames are made.
     * The trunk, neck and head stand straight up and the collarbones straight
     * out, facing front, so they take the capture's turns from its rest and
     * keep the body's own posture; a limb runs along the bone toward the next
     * joint (the toes straight ahead), across it toward the front, up for a
     * foot, toward where the elbow bends for an arm, toward the thumb for a
     * hand, and follows the captured directions.
     */
    function restFrames(bones, index) {
        const at = n => index.has(n) ? bones[index.get(n)].head : null;
        const along = (n, next, fallback) => (at(n) && at(next) ? sub(at(next), at(n)) : fallback);
        const F = [0, 0, 1], U = [0, 1, 0], out = {};
        const put = (n, d, s) => { if (index.has(n)) out[n] = frameQuat(d, s); };
        for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) put(n, U, F);
        for (const S of ['Left', 'Right']) {
            put(S + 'Shoulder', [S === 'Left' ? 1 : -1, 0, 0], F);
            const u = along(S + 'Arm', S + 'ForeArm', [S === 'Left' ? 1 : -1, -1, 0]), f = along(S + 'ForeArm', S + 'Hand', u);
            // A straight arm at rest bends its elbow toward the front.
            const bend = Math.abs(dot(unit(u), unit(f))) > 0.999 ? F : f;
            put(S + 'Arm', u, bend);
            put(S + 'ForeArm', f, Math.abs(dot(unit(u), unit(f))) > 0.999 ? F : u.map(v => -v));
            const knuckles = at(S + 'HandIndex1') && at(S + 'HandPinky1') ? sub(at(S + 'HandIndex1'), at(S + 'HandPinky1')) : F;
            put(S + 'Hand', along(S + 'Hand', S + 'HandMiddle1', f), knuckles);
            put(S + 'UpLeg', along(S + 'UpLeg', S + 'Leg', [0, -1, 0]), F);
            put(S + 'Leg', along(S + 'Leg', S + 'Foot', [0, -1, 0]), F);
            put(S + 'Foot', along(S + 'Foot', S + 'ToeBase', F), U);
            put(S + 'ToeBase', F, U);
        }
        return out;
    }

    /** Points under each foot that bear on the floor: the heel, the ball and the toe tip, off the ankle and the ball joint (meters on a 1.7 m body). */
    const SOLE = { Foot: [[0, -0.065, -0.055]], ToeBase: [[0, 0, 0], [0, -0.012, 0.06]] };

    /**
     * Hand shapes, in degrees from the hand at rest. A finger: its knuckle,
     * middle and end joints closing toward the palm, and `spread`, how far
     * it fans out from the middle finger. The thumb: `base` swings it across
     * in front of the palm, `roll` turns its pad toward the fingers, then its
     * two joints close. `gap` is what the hand holds (meters across, on a
     * 1.7 m body): a finger closes until its tip meets the palm's skin, or
     * the handle, and no further.
     */
    const finger = (k, m, e) => [k, m, e];
    const HAND_SHAPES = {
        relaxed: { Index: finger(12, 18, 8), Middle: finger(16, 22, 10), Ring: finger(20, 26, 12), Pinky: finger(24, 30, 14), spread: 3, thumb: [6, 4, 8, 6] },
        looseFist: { Index: finger(58, 78, 38), Middle: finger(62, 82, 40), Ring: finger(66, 84, 42), Pinky: finger(70, 84, 42), spread: -2, thumb: [22, 14, 22, 16] },
        fist: { Index: finger(86, 100, 56), Middle: finger(88, 102, 56), Ring: finger(90, 102, 56), Pinky: finger(90, 100, 54), spread: -3, thumb: [32, 22, 30, 26] },
        blade: { Index: finger(0, 2, 2), Middle: finger(0, 2, 2), Ring: finger(0, 2, 2), Pinky: finger(0, 2, 2), spread: -4, thumb: [-4, 0, 2, 0] },
        open: { Index: finger(4, 4, 2), Middle: finger(4, 4, 2), Ring: finger(6, 6, 3), Pinky: finger(8, 6, 3), spread: 14, thumb: [-12, 0, 0, 0] },
        gun: { Index: finger(30, 40, 18), Middle: finger(80, 96, 50), Ring: finger(84, 96, 50), Pinky: finger(86, 94, 48), spread: -2, thumb: [26, 18, 26, 14], gap: 0.026 },
        support: { Index: finger(46, 54, 28), Middle: finger(52, 60, 30), Ring: finger(56, 62, 30), Pinky: finger(60, 62, 30), spread: -2, thumb: [24, 12, 20, 10], gap: 0.04 },
        sword: { Index: finger(78, 94, 50), Middle: finger(82, 96, 50), Ring: finger(86, 96, 50), Pinky: finger(88, 94, 48), spread: -2, thumb: [30, 18, 30, 22], gap: 0.03 },
        grab: { Index: finger(60, 76, 40), Middle: finger(64, 80, 42), Ring: finger(68, 80, 42), Pinky: finger(72, 80, 42), spread: 2, thumb: [24, 12, 22, 16], gap: 0.03 },
        archerDraw: { Index: finger(25, 85, 40), Middle: finger(25, 85, 40), Ring: finger(25, 85, 40), Pinky: finger(60, 70, 30), spread: 0, thumb: [0, 0, 5, 2] },
        flat: { Index: finger(-8, 0, 0), Middle: finger(-8, 0, 0), Ring: finger(-8, 0, 0), Pinky: finger(-8, 0, 0), spread: 6, thumb: [-14, 0, 0, 0] }
    };
    /** How far each finger joint turns (degrees): knuckle, middle, end; the spread; the thumb's base, roll and two joints. */
    const FINGER_RANGE = { knuckle: [-20, 95], middle: [0, 110], end: [0, 85], spread: [-10, 25], thumbBase: [-20, 60], thumbRoll: [-10, 50], thumbJoint: [-10, 80] };
    const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

    /**
     * Each hand's own frame at rest, and the axis every finger joint closes
     * about. The palm is the side the resting fingers curl toward; a
     * finger joint closes about the line square to its bone and the palm,
     * so it curls in one plane, and spreads about the palm's normal. The
     * thumb closes toward the palm's middle.
     */
    function handFrames(bones, index) {
        const out = {};
        for (const S of ['Left', 'Right']) {
            const at = n => index.has(S + n) ? bones[index.get(S + n)] : null;
            const hand = at('Hand'), mid = at('HandMiddle1'), a = at('HandIndex1'), b = at('HandPinky1');
            if (!hand || !mid || !a || !b) continue;
            const along = unit(sub(mid.head, hand.head)), thumbward = square(sub(a.head, b.head), along);
            let palm = unit(cross(thumbward, along)), curl = [0, 0, 0];
            for (const f of FINGERS) {
                const one = at('Hand' + f + '1'), three = at('Hand' + f + '3');
                if (one && three) curl = curl.map((v, k) => v + dir(three)[k] - dir(one)[k]);
            }
            const toward = dot(curl, palm) !== 0 ? dot(curl, palm) : dot([-hand.head[0], 0, 0], palm);
            if (toward < 0) palm = palm.map(v => -v);
            const scale = Math.hypot(...sub(mid.head, hand.head));
            const joints = [];
            for (const f of FINGERS) {
                const fan = square(sub(at('Hand' + f + '1').head, mid.head), along);
                for (const k of [1, 2, 3]) {
                    const bone = at('Hand' + f + k);
                    if (!bone) continue;
                    const d = dir(bone), n = square(palm, d), axis = unit(cross(d, n));
                    // Spreading turns the finger about the palm's normal, away from the middle finger.
                    let spin = n;
                    if (f === 'Middle' || dot(cross(n, d), fan) < 0) spin = n.map(v => -v);
                    joints.push({ bone: index.get(S + 'Hand' + f + k), finger: f, k, axis, spin: f === 'Middle' ? null : spin });
                }
            }
            // The thumb closes toward the palm's middle, a little in front of it.
            const centre = [0, 1, 2].map(k => (a.head[k] + mid.head[k]) / 2 + palm[k] * scale * 0.25);
            for (const k of [1, 2, 3]) {
                const bone = at('HandThumb' + k);
                if (!bone) continue;
                const d = dir(bone), c = square(sub(centre, bone.head), d);
                joints.push({ bone: index.get(S + 'HandThumb' + k), finger: 'Thumb', k, axis: unit(cross(d, c)), roll: d });
            }
            const chains = {};
            for (const f of FINGERS) chains[f] = [1, 2, 3].map(k => at('Hand' + f + k)).filter(Boolean).map(b => ({ head: b.head, tail: b.tail || b.head }));
            out[S] = { along, palm, thumbward, joints, chains, hand: hand.head, length: scale };
        }
        return out;
    }
    const dir = b => unit(sub(b.tail || b.head, b.head));

    /** A hand shape's turn for one joint of its frame. */
    function jointTurn(j, shape) {
        if (j.finger === 'Thumb') {
            const [base, roll, k2, k3] = shape.thumb;
            if (j.k === 1) return mul(quat(...j.axis, base * DEG), quat(...j.roll, roll * DEG));
            return quat(...j.axis, (j.k === 2 ? k2 : k3) * DEG);
        }
        const close = quat(...j.axis, shape[j.finger][j.k - 1] * DEG * (shape.reach ? shape.reach[j.finger] : 1));
        return j.k === 1 && j.spin ? mul(quat(...j.spin, (shape.spread || 0) * DEG * (j.finger === 'Index' ? 0.8 : j.finger === 'Pinky' ? 1.3 : 1)), close) : close;
    }
    /** The palm's skin over its bones and a fingertip's flesh, in hand lengths: a tip's middle stays this far off the palm. */
    const PALM_FLESH = 0.21;
    /**
     * How far each finger of a shape closes on this hand (1 the shape's
     * whole angles): its tip, followed joint by joint at rest, stops where
     * it would pass into the palm (or into what the hand holds), so short
     * fingers on a deep palm never curl through it.
     */
    function closing(frame, shape, joints) {
        const reach = {};
        const need = PALM_FLESH * frame.length + (shape.gap || 0) * frame.length / 0.105;
        for (const f of FINGERS) {
            const chain = frame.chains[f], js = joints.filter(j => j.finger === f).sort((a, b) => a.k - b.k);
            if (chain.length !== 3 || js.length !== 3) { reach[f] = 1; continue; }
            const tipAt = u => {
                // Each joint turned by its share, the turns compounding down the finger.
                let turn = [0, 0, 0, 1], p = chain[0].head;
                for (let k = 0; k < 3; k++) {
                    turn = mul(turn, quat(...js[k].axis, shape[f][k] * DEG * u));
                    const seg = rotate(turn, sub(chain[k].tail, chain[k].head));
                    p = [p[0] + seg[0], p[1] + seg[1], p[2] + seg[2]];
                }
                return p;
            };
            const clear = u => {
                const tip = sub(tipAt(u), frame.hand), over = dot(tip, frame.along) / frame.length;
                return over < 0.1 || over > 1.05 || dot(tip, frame.palm) >= need;
            };
            let u = 1;
            if (!clear(1)) {
                let lo = 0;
                for (let k = 1; k <= 20; k++) if (!clear(k / 20)) { u = k / 20; lo = (k - 1) / 20; break; }
                for (let i = 0; i < 8; i++) { const m = (lo + u) / 2; if (clear(m)) lo = m; else u = m; }
                u = lo;
            }
            reach[f] = u;
        }
        return reach;
    }
    /** A shape part way to another (angles blended). */
    function blendShape(a, b, k) {
        if (k <= 0) return a;
        if (k >= 1) return b;
        const mix = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
        const out = { spread: a.spread + (b.spread - a.spread) * k, thumb: mix(a.thumb, b.thumb) };
        for (const f of FINGERS) out[f] = mix(a[f], b[f]);
        return out;
    }
    /** The shape a hand holds at time t: a shape's name, or keys [[seconds, name], ...] eased from one to the next. */
    function shapeAt(spec, t) {
        if (!spec) return HAND_SHAPES.relaxed;
        if (typeof spec === 'string') return HAND_SHAPES[spec] || HAND_SHAPES.relaxed;
        if (t <= spec[0][0]) return HAND_SHAPES[spec[0][1]];
        for (let i = 1; i < spec.length; i++) {
            if (t > spec[i][0]) continue;
            const [t0, a] = spec[i - 1], [t1, b] = spec[i], u = (t - t0) / ((t1 - t0) || 1);
            return blendShape(HAND_SHAPES[a], HAND_SHAPES[b], u * u * (3 - 2 * u));
        }
        return HAND_SHAPES[spec[spec.length - 1][1]];
    }
    /** Every finger and thumb joint's track for the pose's hands (`hands`: { Left, Right } shape specs). */
    function handTracks(frames, hands, times) {
        const out = [];
        for (const S of ['Left', 'Right']) {
            const frame = frames[S];
            if (!frame) continue;
            const spec = hands && hands[S];
            // Each frame's shape closed as far as this hand allows (worked out once a shape).
            const shapes = Array.from(times, t => shapeAt(spec, t)), fitted = new Map();
            const fit = shape => {
                if (!fitted.has(shape)) fitted.set(shape, Object.assign({}, shape, { reach: closing(frame, shape, frame.joints) }));
                return fitted.get(shape);
            };
            for (const j of frame.joints) {
                const values = new Float32Array(times.length * 4);
                let last = null;
                for (let f = 0; f < times.length; f++) {
                    let q = jointTurn(j, fit(shapes[f]));
                    if (last && dot4(q, last) < 0) q = q.map(v => -v);
                    values.set(q, f * 4);
                    last = q;
                }
                out.push({ bone: j.bone, values });
            }
        }
        return out;
    }

    /**
     * The wrist held as a hand holds it, not as captured: a capture's hand
     * markers are the least reliable of all, and they cock the hand off
     * the forearm. The hand keeps its captured twist about its length (the
     * forearm's roll, within a wrist's reach) and bends at the wrist by the
     * pose's own `wrist` ({ flex, bend } in degrees: toward the palm, toward
     * the little finger), a relaxed hang when the pose gives none.
     */
    const WRIST_TWIST = 40 * DEG;
    function holdWrists(bones, index, names, world, steps, frames, pose, turnAt) {
        for (const S of ['Left', 'Right']) {
            const h = names.indexOf(S + 'Hand'), fore = index.get(S + 'ForeArm'), frame = frames[S];
            if (h < 0 || fore === undefined || !frame) continue;
            const w = Object.assign({}, WRIST, pose && pose.wrist && (pose.wrist[S] || pose.wrist));
            const a = frame.along, flexAxis = unit(cross(a, frame.palm)), bendAxis = unit(cross(a, frame.thumbward.map(v => -v)));
            // A bend may follow keys through the clip ([[share of the clip, degrees], ...]): a swing cocks the wrist and lets it go.
            const at = (v, f) => Array.isArray(v) ? keyed(v, f / Math.max(1, steps - 1)) : (v || 0);
            let was;
            for (let f = 0; f < steps; f++) {
                const bend = mul(quat(...bendAxis, at(w.bend, f) * DEG), quat(...flexAxis, at(w.flex, f) * DEG));
                const parent = turnAt(fore, f), local = mul(conj(parent), world[h][f]);
                // The twist about the hand's length (the part of the turn along it), followed from frame to
                // frame so it never jumps a whole turn, and held within a wrist's reach.
                let angle = 2 * Math.atan2(dot(local, a), local[3]);
                if (was !== undefined) angle += 2 * Math.PI * Math.round((was - angle) / (2 * Math.PI));
                was = angle;
                // A captured hand turned further off its forearm than a wrist goes (past 60 degrees, gone by 100)
                // is the markers lost: its twist fades out with it.
                const off = 2 * Math.acos(Math.min(1, Math.abs(local[3]))), trust = Math.max(0, Math.min(1, (100 * DEG - off) / (40 * DEG)));
                const twist = quat(...a, Math.max(-WRIST_TWIST, Math.min(WRIST_TWIST, angle)) * trust);
                world[h][f] = mul(parent, mul(twist, bend));
            }
        }
    }
    const unit4 = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };

    /** The ball round the face a hand keeps out of, off the head joint (meters on a 1.7 m body). */
    const FACE = { at: [0, -0.01, 0.03], radius: 0.22 };
    /** The trunk's bones, whose skin the arms keep out of, and the height of each slice it is measured in. */
    const TRUNK = ['Hips', 'Spine', 'Spine1', 'Spine2'], SLICE = 0.03;

    /**
     * The body's own trunk and arms, measured from its skin at rest: for each
     * trunk bone, its skin in slices up the bone to the armpits (how far it
     * reaches to each side, in front and behind), and how thick each arm
     * bone's flesh is.
     * Each skin vertex counts for the bone that moves it most.
     */
    function measure(bones, index, body, scale) {
        if (!body || !body.positions || !body.joints || !body.weights) return null;
        const trunk = new Map(TRUNK.filter(n => index.has(n)).map(n => [index.get(n), new Map()]));
        const limbs = new Map(), band = SLICE * scale;
        for (const S of ['Left', 'Right']) for (const [n, next] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand'], ['Hand', 'HandMiddle1']]) {
            if (index.has(S + n) && index.has(S + next)) limbs.set(index.get(S + n), { a: bones[index.get(S + n)].head, b: bones[index.get(S + next)].head, sum: 0, count: 0 });
        }
        // The trunk is measured up to the armpits: above them its skin runs out over the shoulders.
        const P = body.positions, J = body.joints, W = body.weights, arm = index.has('LeftArm') ? bones[index.get('LeftArm')].head[1] : Infinity, top = arm - 0.08 * scale;
        for (let v = 0; v * 3 < P.length; v++) {
            let j = J[v * 4], w = W[v * 4];
            for (let k = 1; k < 4; k++) if (W[v * 4 + k] > w) { w = W[v * 4 + k]; j = J[v * 4 + k]; }
            const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
            const slices = trunk.get(j);
            if (slices) {
                if (p[1] > top) continue;
                const h = bones[j].head, key = Math.floor((p[1] - h[1]) / band), x = Math.abs(p[0] - h[0]), z = p[2] - h[2];
                const s = slices.get(key);
                if (s) { s.side = Math.max(s.side, x); s.front = Math.max(s.front, z); s.back = Math.min(s.back, z); }
                else slices.set(key, { side: x, front: z, back: z });
                continue;
            }
            const limb = limbs.get(j);
            if (limb) {
                // Distance from the bone's line.
                const d = sub(limb.b, limb.a), l2 = dot(d, d) || 1, t = Math.max(0, Math.min(1, dot(sub(p, limb.a), d) / l2));
                limb.sum += Math.hypot(...sub(p, [limb.a[0] + d[0] * t, limb.a[1] + d[1] * t, limb.a[2] + d[2] * t]));
                limb.count++;
            }
        }
        const thick = new Map([...limbs].map(([i, l]) => [i, l.count ? l.sum / l.count : 0.04 * scale]));
        return { trunk, band, thick };
    }

    /**
     * Arms kept off the face and the trunk: a body's arms, head and girth
     * differ from the captured one's, so a hand brought to the chin (a
     * boxer's guard) can land in the mouth, and an arm swinging past a broad
     * or heavy trunk can pass into it. Points down each arm (the elbow, the
     * forearm's middle, the wrist and the knuckles; the upper arm lies against
     * the chest at the armpit as it should),
     * each with its own flesh round it, keep out of the ball round the face
     * and out of the trunk's measured skin; the deepest one inside swings
     * out, the whole arm about the shoulder, to the surface.
     */
    function clearBody(bones, index, names, world, steps, place, scale, body, loop) {
        const head = index.get('Head'), faceRadius = FACE.radius * scale;
        // No arm swings further than this, so a pose stays the captured one.
        const most = 0.6;
        for (const S of ['Left', 'Right']) {
            const chain = ['Arm', 'ForeArm', 'Hand'].map(n => names.indexOf(S + n)), shoulder = index.get(S + 'Arm');
            const joint = n => index.get(S + n), need = ['Arm', 'ForeArm', 'Hand', 'HandMiddle1', 'HandIndex1', 'HandPinky1'];
            if (chain[0] < 0 || shoulder === undefined || need.some(n => joint(n) === undefined)) continue;
            const flesh = n => (body && body.thick.get(joint(n))) || 0.03 * scale;
            const swings = new Array(steps);
            for (let f = 0; f < steps; f++) {
                swings[f] = [0, 0, 0, 1];
                const { rot, pos } = place(f), s = pos[shoulder], at = n => pos[joint(n)];
                const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
                // Each point with the flesh round it; the hand's own points keep off the face too.
                let pts = [
                    [at('ForeArm'), Math.max(flesh('Arm'), flesh('ForeArm'))],
                    [mid(at('ForeArm'), at('Hand')), flesh('ForeArm')], [at('Hand'), flesh('ForeArm') * 0.8, true],
                    [at('HandMiddle1'), flesh('Hand'), true], [at('HandIndex1'), flesh('Hand'), true], [at('HandPinky1'), flesh('Hand'), true]
                ];
                const c = head === undefined ? null : rotate(rot[head], FACE.at.map(v => v * scale));
                const centre = c && [pos[head][0] + c[0], pos[head][1] + c[1], pos[head][2] + c[2]];
                // How deep a point is inside the face's ball or the trunk, and where on the surface it goes.
                const inside = (p, r, hand) => {
                    let best = null;
                    if (centre && hand) {
                        const d = faceRadius - Math.hypot(...sub(p, centre));
                        if (d > 0) { const o = unit(sub(p, centre)); best = { depth: d, to: [centre[0] + o[0] * faceRadius, centre[1] + o[1] * faceRadius, centre[2] + o[2] * faceRadius] }; }
                    }
                    if (body) for (const [b, slices] of body.trunk) {
                        const turn = rot[b], l = rotate(conj(turn), sub(p, pos[b])), slice = slices.get(Math.floor(l[1] / body.band));
                        if (!slice) continue;
                        // A rounded box round the slice, the point's own flesh added.
                        const across = slice.side + r, mid = (slice.front + slice.back) / 2, deep = (slice.front - slice.back) / 2 + r;
                        // A slice too thin to hold anything (a few stray vertices) is no wall.
                        if (across < 0.02 * scale || deep < 0.02 * scale) continue;
                        const x = Math.abs(l[0]) / across, z = Math.abs(l[2] - mid) / deep, e = Math.cbrt(x * x * x + z * z * z);
                        const d = (1 - e) * Math.min(across, deep);
                        if (e < 1e-6 || d <= 0 || (best && best.depth >= d)) continue;
                        const o = rotate(turn, [l[0] / e, l[1], mid + (l[2] - mid) / e]);
                        best = { depth: d, to: [pos[b][0] + o[0], pos[b][1] + o[1], pos[b][2] + o[2]] };
                    }
                    return best;
                };
                // A few small swings, each moving the deepest point out to the surface.
                let swung = 0;
                for (let pass = 0; pass < 4 && swung < most; pass++) {
                    let deep = null, hit = null;
                    for (const [p, r, hand] of pts) { const o = inside(p, r, hand); if (o && (!hit || o.depth > hit.depth)) { hit = o; deep = p; } }
                    if (!hit) break;
                    const a = unit(sub(deep, s)), b = unit(sub(hit.to, s)), axis = cross(a, b), l = Math.hypot(...axis);
                    if (l < 1e-6) break;
                    const angle = Math.min(Math.atan2(l, dot(a, b)), most - swung);
                    swung += angle;
                    const q = quat(axis[0] / l, axis[1] / l, axis[2] / l, angle);
                    swings[f] = mul(q, swings[f]);
                    pts = pts.map(([p, r, hand]) => { const v = rotate(q, sub(p, s)); return [[s[0] + v[0], s[1] + v[1], s[2] + v[2]], r, hand]; });
                }
            }
            // Each frame's swing eased with its neighbors' (two frames either side), so an arm brushing the
            // body is moved off it smoothly and never snaps out from one frame to the next.
            const log = q => { const w = Math.max(-1, Math.min(1, q[3])), a = 2 * Math.acos(w), k = a > 1e-6 ? a / Math.sin(a / 2) : 2; return [q[0] * k, q[1] * k, q[2] * k]; };
            const logs = swings.map(log);
            for (let f = 0; f < steps; f++) {
                const r = [0, 0, 0];
                let n = 0;
                for (let k = -2; k <= 2; k++) {
                    // Round the loop when it is one (its last frame is its first), held at the ends when not.
                    const g = loop ? (((f + k) % (steps - 1)) + (steps - 1)) % (steps - 1) : Math.max(0, Math.min(steps - 1, f + k)), wgt = 3 - Math.abs(k);
                    for (let i = 0; i < 3; i++) r[i] += logs[g][i] * wgt;
                    n += wgt;
                }
                const a = Math.hypot(r[0], r[1], r[2]) / n;
                if (a < 1e-6) continue;
                const q = quat(r[0] / (a * n), r[1] / (a * n), r[2] / (a * n), a);
                for (const k of chain) if (k >= 0) world[k][f] = mul(q, world[k][f]);
            }
        }
    }

    /**
     * Feet set down: a foot whose lowest sole point hangs a little off the
     * floor (the back foot of a kneel, its toes short of the ground on a body
     * with other proportions) turns at the ankle, toes and all, until that
     * point rests where it would standing; the turn fades out as the foot
     * rises further, so a foot lifting off never jumps.
     */
    function settleFeet(bones, index, names, world, steps, place, heights, scale, loop) {
        const near = 0.06 * scale, far = 0.14 * scale, most = 0.8;
        for (const S of ['Left', 'Right']) {
            const foot = index.get(S + 'Foot'), toe = index.get(S + 'ToeBase'), chain = [names.indexOf(S + 'Foot'), names.indexOf(S + 'ToeBase')];
            if (foot === undefined || toe === undefined || chain[0] < 0) continue;
            const sole = [[foot, SOLE.Foot[0]], [toe, SOLE.ToeBase[0]], [toe, SOLE.ToeBase[1]]].map(([i, o]) => [i, o.map(v => v * scale)]);
            const turns = new Float32Array(steps), hinges = [];
            for (let f = 0; f < steps; f++) {
                const { rot, pos } = place(f), ankle = pos[foot], hinge = rotate(rot[foot], [1, 0, 0]);
                // Each sole point's height over where it stands at rest, the foot turned by a about the ankle's hinge.
                const low = a => {
                    const q = quat(hinge[0], hinge[1], hinge[2], a);
                    let h = Infinity;
                    for (const [i, o] of sole) {
                        const p = sub([pos[i][0] + rotate(rot[i], o)[0], pos[i][1] + rotate(rot[i], o)[1], pos[i][2] + rotate(rot[i], o)[2]], ankle);
                        h = Math.min(h, ankle[1] + rotate(q, p)[1] + heights[f] - (bones[i].head[1] + o[1]));
                    }
                    return h;
                };
                hinges[f] = hinge;
                const off = low(0);
                if (off <= 0.005 * scale || off >= far) continue;
                // The smallest turn either way that brings the foot down, if there is one.
                let turn = null;
                for (let a = 0.02; a <= most && turn === null; a += 0.02) for (const t of [a, -a]) if (turn === null && low(t) <= 0) turn = t;
                if (turn === null) continue;
                turns[f] = turn * (off <= near ? 1 : (far - off) / (far - near));
            }
            // The turns eased through time (a few frames either side, round the loop when it is one), so a foot
            // settling never snaps from one frame to the next.
            const eased = new Float32Array(steps), R = 3;
            for (let f = 0; f < steps; f++) {
                let sum = 0, n = 0;
                for (let k = -R; k <= R; k++) {
                    let g = f + k;
                    if (loop) g = ((g % (steps - 1)) + (steps - 1)) % (steps - 1);
                    else g = Math.max(0, Math.min(steps - 1, g));
                    sum += turns[g] * (R + 1 - Math.abs(k)); n += R + 1 - Math.abs(k);
                }
                eased[f] = sum / n;
            }
            for (let f = 0; f < steps; f++) {
                if (!eased[f]) continue;
                const h = hinges[f], q = quat(h[0], h[1], h[2], eased[f]);
                for (const k of chain) if (k >= 0) world[k][f] = mul(q, world[k][f]);
            }
        }
    }

    // ── joints held within their reach ─────────────────────────────────
    /**
     * How far each leg joint turns from rest (degrees), about the body's
     * left-right line (x: a hip or knee bending forward, a foot's toes
     * pointing down), about its up line (y: the leg or foot turning in or
     * out) and about its front line (z: a knee bowing, a sole tilting):
     * [least, most] on x, the most either way on y and z. A knee is a
     * hinge, never past straight; an ankle points the toes down 50 and up
     * 25 degrees, tilts the sole 20 and hardly turns; a thigh rolls 40.
     */
    const LEG_RANGE = {
        UpLeg: { x: [-130, 60], y: 40, z: 75 },
        Leg: { x: [-3, 155], y: 6, z: 6 },
        Foot: { x: [-25, 52], y: 12, z: 22 },
        ToeBase: { x: [-60, 35], y: 6, z: 8 }
    };
    /** A turn as the rotation vector it is (axis times angle, radians). */
    const logOf = q => { const w = q[3] < 0 ? -1 : 1, x = q[0] * w, y = q[1] * w, z = q[2] * w, c = Math.min(1, q[3] * w), a = 2 * Math.acos(c), k = a > 1e-6 ? a / Math.sin(a / 2) : 2; return [x * k, y * k, z * k]; };
    const expOf = v => { const a = Math.hypot(v[0], v[1], v[2]); return a < 1e-9 ? [0, 0, 0, 1] : quat(v[0] / a, v[1] / a, v[2] / a, a); };
    /**
     * Every leg joint brought within LEG_RANGE, hip to toe, each frame: a
     * capture's foot markers lost in a flip (a heel turned in, an ankle
     * bent back) or a body reaching past a joint's reach comes back to
     * the nearest pose a leg can take; the bones below go with it.
     */
    /** The most a foot points out from the hips' facing on an upright body (degrees), and in. */
    const TOE_OUT = 18, TOE_IN = 6;
    function limitLegs(index, names, world, steps, turnAt, bones, upright, once, toeOut = TOE_OUT) {
        const clampTo = (v, r) => {
            const [lo, hi] = r.x, d = DEG;
            return [Math.max(lo * d, Math.min(hi * d, v[0])), Math.max(-r.y * d, Math.min(r.y * d, v[1])), Math.max(-r.z * d, Math.min(r.z * d, v[2]))];
        };
        for (const S of ['Left', 'Right']) {
            const chain = ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map(n => ({ n, k: names.indexOf(S + n), i: index.get(S + n) }));
            if (chain.slice(0, 3).some(c => c.k < 0)) continue;
            if (chain[3].k < 0) chain.pop();
            // The thigh's parent, whatever it is (the hips).
            const top = chain[0].i, hipsParent = n => n;
            for (let f = 0; f < steps; f++) {
                let parent = (() => { const p = names.indexOf('Hips'); return p >= 0 ? world[p][f] : [0, 0, 0, 1]; })();
                for (let c = 0; c < chain.length; c++) {
                    const { n, k } = chain[c], was = world[k][f];
                    const local = mul(conj(parent), was), v = logOf(local), held = clampTo(v, LEG_RANGE[n]);
                    if (held[0] !== v[0] || held[1] !== v[1] || held[2] !== v[2]) {
                        const now = mul(parent, expOf(held)), turn = mul(now, conj(was));
                        // The joint and everything below it turned together.
                        for (let j = c; j < chain.length; j++) world[chain[j].k][f] = mul(turn, world[chain[j].k][f]);
                    }
                    parent = world[k][f];
                }
            }
            // A motion played once (a flip, a roll) has its foot and toes turn no faster than 35 degrees a frame on
            // their shin and foot: a capture's lost foot markers flicking the toes over are smoothed through.
            if (once) for (let c = 2; c < chain.length; c++) {
                let last = null;
                for (let f = 0; f < steps; f++) {
                    const parent = world[chain[c - 1].k][f], local = mul(conj(parent), world[chain[c].k][f]);
                    let held = local;
                    if (last) {
                        const d = dot4(last, local), a = 2 * Math.acos(Math.min(1, Math.abs(d)));
                        if (a > 35 * DEG) held = slerp4(last, local, 35 * DEG / a);
                    }
                    if (held !== local) {
                        const turn = mul(mul(parent, held), conj(world[chain[c].k][f]));
                        for (let j = c; j < chain.length; j++) world[chain[j].k][f] = mul(turn, world[chain[j].k][f]);
                    }
                    last = held;
                }
            }
            // An upright body's foot points about where it faces, a little out: one turned out past TOE_OUT
            // (the heel swung in) or in past TOE_IN rolls the whole leg about the thigh, knee and foot together.
            const hips = names.indexOf('Hips'), m = S === 'Left' ? 1 : -1;
            const toe = index.get(S + 'ToeBase');
            const footDir = toe === undefined ? [0, 0, 1] : unit(sub(bones[toe].head, bones[index.get(S + 'Foot')].head));
            const thighDir = unit(sub(bones[index.get(S + 'Leg')].head, bones[index.get(S + 'UpLeg')].head));
            // (Not on a body hung in place, its feet set on holds or kicking in the water.)
            if (hips < 0 || !upright) continue;
            for (let f = 0; f < steps; f++) {
                const hq = world[hips][f], up = rotate(hq, [0, 1, 0]), front = rotate(hq, [0, 0, 1]);
                if (up[1] < 0.7) continue;
                for (let pass = 0; pass < 2; pass++) {
                    // A leg standing under the body (the thigh near upright, the foot near level): one swinging
                    // through a stride, kicking or tucked is left as it moves.
                    const toe = rotate(world[chain[2].k][f], footDir), level = Math.hypot(toe[0], toe[2]), thigh = rotate(world[chain[0].k][f], thighDir);
                    if (level < 0.7 || thigh[1] > -0.65) break;
                    let out = (Math.atan2(toe[0], toe[2]) - Math.atan2(front[0], front[2])) * m;
                    out = ((out + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
                    if (Math.abs(out) > Math.PI / 2) break;
                    // Eased in from the thigh at 49 degrees off upright to 37, so a leg passing the line turns smoothly.
                    const ease = Math.min(1, (-thigh[1] - 0.65) / 0.15);
                    const excess = (out > toeOut * DEG ? out - toeOut * DEG : out < -TOE_IN * DEG ? out + TOE_IN * DEG : 0) * ease;
                    if (!excess) break;
                    const axis = rotate(world[chain[0].k][f], thighDir), turn = quat(...axis, Math.max(-0.6, Math.min(0.6, excess * m / Math.max(0.4, Math.abs(axis[1])))));
                    for (const c of chain) world[c.k][f] = mul(turn, world[c.k][f]);
                }
            }
        }
    }

    /** Keep each stride on its own side of the hips. Joint-angle limits
     * alone allow a captured narrow/crossing gait to scissor through a
     * different body's opposite leg. Swing the whole chain at the hip so
     * the knee remains a hinge and the ankle keeps its captured motion. */
    function separateStride(bones, index, names, world, steps, place, scale) {
        const hips = index.get('Hips');
        for (let f = 0; f < steps; f++) for (const [S, sign] of [['Left', 1], ['Right', -1]]) {
            const { pos, rot } = place(f), thigh = index.get(S + 'UpLeg'), knee = index.get(S + 'Leg'), foot = index.get(S + 'Foot');
            const side = rotate(rot[hips], [1, 0, 0]), axis = rotate(rot[hips], [0, 0, 1]), origin = pos[thigh];
            const width = Math.abs(dot(sub(origin, pos[hips]), side));
            const gap = Math.max(.045 * scale, width * .55);
            const clear = angle => {
                const q = quat(...axis, angle * sign);
                return [knee, foot].every(i => dot(sub(along3(origin, rotate(q, sub(pos[i], origin)), 1), pos[hips]), side) * sign >= gap);
            };
            if (clear(0)) continue;
            let lo = 0, hi = .55;
            for (let k = 0; k < 15; k++) { const mid = (lo + hi) / 2; if (clear(mid)) hi = mid; else lo = mid; }
            const q = quat(...axis, hi * sign);
            for (const suffix of ['UpLeg', 'Leg', 'Foot', 'ToeBase']) { const k = names.indexOf(S + suffix); if (k >= 0) world[k][f] = mul(q, world[k][f]); }
        }
    }

    // ── hands set where a pose needs them: an aim, a grip with both hands ──
    /** The turn taking unit vector a to unit vector b, the short way. */
    function fromTo(a, b) {
        const c = cross(a, b), d = dot(a, b);
        if (d < -0.999999) { const o = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], ax = unit(cross(a, o)); return [ax[0], ax[1], ax[2], 0]; }
        return unit4([c[0], c[1], c[2], 1 + d]);
    }
    /** A turn part way (0..1) round from no turn, the short way. */
    function partOf(q, k) {
        const w = Math.max(-1, Math.min(1, q[3] < 0 ? -q[3] : q[3])), sign = q[3] < 0 ? -1 : 1, a = Math.acos(w), sa = Math.sin(a);
        if (sa < 1e-9) return [0, 0, 0, 1];
        const f = Math.sin(a * k) / sa;
        return [q[0] * f * sign, q[1] * f * sign, q[2] * f * sign, Math.cos(a * k)];
    }
    const along3 = (p, d, t) => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
    /** Where a hand's grip is (the middle of its closed palm, where a handle lies), off the wrist in its rest frame. */
    const gripOf = (F, gap) => [0, 1, 2].map(k => F.along[k] * F.length * 0.62 + F.palm[k] * F.length * (PALM_FLESH * 0.6 + (gap || 0.03) / 0.105 * 0.5));

    /**
     * A limb reaching a target: the wrist (or ankle) to `to` (two-bone
     * reach, the elbow or knee bending toward `pole`), the hand (or foot)
     * turned to `turn` (world); forearm pronation and bounded wrist turns
     * keep a hand from wringing round its wrist. `weight` eases the limb from where it was.
     */
    const CHAINS = { arm: ['Arm', 'ForeArm', 'Hand'], leg: ['UpLeg', 'Leg', 'Foot', 'ToeBase'] };
    function reachLimb(ctx, f, S, limb, to, turn, pole, weight) {
        const { index, names, world, place, bones, rest } = ctx, chain = CHAINS[limb];
        const slots = chain.map(n => names.indexOf(S + n)), [top, mid, end] = slots;
        if (top < 0 || mid < 0 || end < 0 || !rest[S + chain[0]] || !rest[S + chain[1]]) return;
        const w = weight === undefined ? 1 : weight;
        const { pos } = place(f), at = n => pos[index.get(S + n)], restAt = n => bones[index.get(S + n)].head;
        const sh = at(chain[0]);
        const a = Math.hypot(...sub(restAt(chain[1]), restAt(chain[0]))), b = Math.hypot(...sub(restAt(chain[2]), restAt(chain[1])));
        const off = sub(to, sh), d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, Math.hypot(...off))), u = unit(off);
        let v = square(pole, u);
        if (limb === 'arm') {
            let normal = unit(cross(u, v));
            if (ctx.bendFrame[S] !== f) { ctx.bendReference[S] = ctx.bendNormals[S]; ctx.bendFrame[S] = f; }
            const previous = ctx.bendReference[S];
            if (previous) {
                const carried = square(previous, u);
                if (dot(normal, carried) < 0) normal = normal.map(x => -x);
                const angle = Math.acos(Math.max(-1, Math.min(1, dot(normal, carried))));
                if (angle > 25 * DEG) normal = unit(along3(carried.map(x => x * (1 - 25 * DEG / angle)), normal, 25 * DEG / angle));
            }
            ctx.bendNormals[S] = normal;
            v = unit(cross(normal, u));
        }
        const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))), sinA = Math.sqrt(1 - cosA * cosA);
        const elbow = [0, 1, 2].map(i => sh[i] + (u[i] * cosA + v[i] * sinA) * a), reachTo = along3(sh, u, d);
        // Each bone's frame built from where its joints now are, as the poses' frames are made (along the
        // bone, and across it toward the bend), so the limb's roll follows the bend and never flips.
        const upper = unit(sub(elbow, sh)), lower = unit(sub(reachTo, elbow));
        let qTop, qMid;
        if (limb === 'arm') {
            // Across the upper arm toward where the forearm bends, across the forearm back toward the upper arm:
            // taken from the bend while there is one, from the pole's side while the arm is near straight (each
            // alone fails, one with the arm straight, the other with it folded square).
            // The pole and solved limb share one plane even near extension.
            // Mixing opposite bend vectors can pass through zero and flip
            // the entire arm frame during a slash or draw.
            const normal = unit(cross(u, v));
            const sideUp = unit(cross(upper, normal)), sideLow = unit(cross(lower, normal));
            qTop = mul(frameQuat(upper, sideUp), conj(rest[S + 'Arm']));
            qMid = mul(frameQuat(lower, sideLow), conj(rest[S + 'ForeArm']));
        } else {
            qTop = mul(frameQuat(upper, v), conj(rest[S + 'UpLeg']));
            qMid = mul(frameQuat(lower, square(v, lower)), conj(rest[S + 'Leg']));
        }
        const old = slots.map(i => (i >= 0 ? world[i][f] : null));
        // A hand given only where its fingers point (and roughly where its palm faces) follows the forearm's own
        // roll and swings to point there, turned toward the palm's way by no more than a wrist allows.
        if (turn && turn.along && limb === 'arm') {
            const F = ctx.F[S], follow = mul(fromTo(unit(rotate(qMid, F.along)), turn.along), qMid);
            let roll = 0;
            if (turn.palm) {
                const p0 = square(rotate(follow, F.palm), turn.along), p1 = square(turn.palm, turn.along);
                roll = Math.max(-70 * DEG, Math.min(70 * DEG, Math.atan2(dot(cross(p0, p1), turn.along), dot(p0, p1))));
            }
            turn = mul(quat(...turn.along, roll), follow);
        }
        let qEnd = turn || mul(qMid, mul(conj(old[1]), old[2]));
        if (limb === 'arm' && turn && !ctx.pose.freeWrist) {
            // The forearm carries pronation within its anatomical range.
            // The roll is followed from frame to frame (never jumping a whole turn) and held within reach.
            const fr = ctx.restAlong[S + 'ForeArm'], local = mul(conj(qMid), qEnd);
            // Pronation belongs in the forearm; the wrist carries only the
            // remaining, bounded swing and twist. Follow a continuous branch
            // at +/-pi so a support hand never flips between opposite limits.
            let roll = 2 * Math.atan2(dot(local, fr), local[3]);
            roll = Math.atan2(Math.sin(roll), Math.cos(roll));
            if (ctx.roll[S] !== undefined) roll += 2 * Math.PI * Math.round((ctx.roll[S] - roll) / (2 * Math.PI));
            ctx.roll[S] = roll;
            qMid = mul(qMid, quat(...fr, Math.max(-100 * DEG, Math.min(100 * DEG, roll))));
            const F = ctx.F[S], relative = unit4(mul(conj(qMid), qEnd));
            let a = 2 * Math.atan2(dot(relative, F.along), relative[3]);
            a = Math.atan2(Math.sin(a), Math.cos(a));
            if (ctx.wristRoll[S] !== undefined) a += 2 * Math.PI * Math.round((ctx.wristRoll[S] - a) / (2 * Math.PI));
            ctx.wristRoll[S] = a;
            const twist = quat(...F.along, a), swing = unit4(mul(relative, conj(twist)));
            const angle = 2 * Math.acos(Math.min(1, Math.abs(swing[3]))), limit = (ctx.pose.aim === 'wave' ? 45 : 32) * DEG;
            qEnd = mul(qMid, mul(angle > limit ? partOf(swing, limit / angle) : swing,
                quat(...F.along, Math.max(-40 * DEG, Math.min(40 * DEG, a)))));
        }
        const blend = (was, now) => (w < 1 ? slerp4(was, now, w) : now);
        world[top][f] = blend(old[0], qTop);
        world[mid][f] = blend(old[1], qMid);
        world[end][f] = blend(old[2], qEnd);
        // The toes keep their bend at the ball as the foot turns.
        if (slots[3] >= 0) world[slots[3]][f] = mul(world[end][f], mul(conj(old[2]), old[3]));
    }
    function slerp4(a, b, k) {
        const c = dot4(a, b) < 0 ? b.map(v => -v) : b;
        return unit4(mul(partOf(mul(c, conj(a)), k), a));
    }
    /** The world turn that sets a hand's rest frame (along to the knuckles, toward the thumb) along d and t. */
    const handTurn = (F, d, t) => mul(frameQuat(d, t), conj(frameQuat(F.along, F.thumbward)));
    const yawBy = (v, deg) => { const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
    /** Where an eye is off the head joint (meters on a 1.7 m body; x toward the body's left). */
    const EYE = [0.031, 0.062, 0.078];
    const UP = [0, 1, 0];

    /**
     * Aims and grips, each worked out frame by frame on this body, aimed
     * along the body's facing (+z) turned by the pose's `aimYaw`:
     *   pistol      the right arm out along the line from the right eye, the gun hand level
     *   pistolTwo   the same, the left hand wrapped round the right fist
     *   rifle       the stock in the right shoulder, the cheek down on it, the left hand under the forend
     *   hilt        the left hand under the right on one handle (a two-handed sword)
     */
    const AIMS = {
        pistol(ctx, f, two) {
            const { index, place, scale, F } = ctx, { rot, pos } = place(f);
            const front = yawBy([0, 0, 1], ctx.pose.aimYaw || 0), head = index.get('Head');
            const eye = along3(pos[head], rotate(rot[head], [-EYE[0] * scale, EYE[1] * scale, EYE[2] * scale]), 1);
            const sh = pos[index.get('RightArm')], R = ctx.reach.Right * (two ? 0.93 : 0.995);
            // The point on the line ahead of the eye at the arm's reach from the shoulder; the sights a little under the eye.
            const o = sub(eye, sh), bq = dot(front, o), c = dot(o, o) - R * R, t = -bq + Math.sqrt(Math.max(0, bq * bq - c));
            const grip = along3(along3(eye, front, t), UP, -0.07 * scale);
            const down = unit(along3(front, UP, -0.36)), thumb = unit(along3(UP, front, 0.36));
            const turnR = handTurn(F.Right, down, thumb);
            const out = [{ S: 'Right', wrist: sub(grip, rotate(turnR, ctx.grip.Right)), turn: turnR, pole: unit([-0.5, -1, 0]) }];
            if (two) {
                // The left hand round the right fist: its palm on the right's fingers, its fingers down the far side.
                const side = unit(cross(UP, front)), palmR = rotate(turnR, F.Right.palm);
                const turnL = handTurn(F.Left, unit(along3(along3(side.map(v => -v), UP, -1.1), front, 0.25)), unit(along3(front, UP, 0.5)));
                const gripL = along3(along3(grip, palmR, 0.035 * scale), UP, -0.012 * scale);
                out.push({ S: 'Left', wrist: sub(gripL, rotate(turnL, ctx.grip.Left)), turn: turnL, pole: unit([0.5, -1, 0]) });
            }
            return out;
        },
        pistolTwo(ctx, f) { return AIMS.pistol(ctx, f, true); },
        rifle(ctx, f) {
            const { index, place, scale, F, pose } = ctx, { rot, pos } = place(f);
            // The muzzle points ahead (a right-handed shooter's body stands turned to the right of it).
            const front = yawBy([0, 0, 1], pose.aimYaw || 0);
            const side = unit(cross(UP, front)), sh = pos[index.get('RightArm')];
            // The bore's line where it meets the butt plate, the plate in the hollow in front of the shoulder joint.
            const butt = along3(along3(along3(sh, side, 0.045 * scale), front, 0.075 * scale), UP, 0.1 * scale);
            const bore = unit(along3(front, UP, pose.aimPitch || 0));
            const gripR = along3(along3(butt, bore, 0.22 * scale), UP, -0.08 * scale), gripL = along3(along3(butt, bore, 0.5 * scale), UP, -0.04 * scale);
            const turnR = handTurn(F.Right, unit(along3(bore, UP, -0.75)), unit(along3(UP, bore, 0.75)));
            const turnL = handTurn(F.Left, unit(along3(side.map(v => -v), bore, 0.55)), bore);
            ctx.cheek = { butt, bore };
            return [
                { S: 'Right', wrist: sub(gripR, rotate(turnR, ctx.grip.Right)), turn: turnR, pole: unit(along3(side.map(v => -v), UP, pose.elbowDown ? -1.5 : -0.6)) },
                { S: 'Left', wrist: sub(gripL, rotate(turnL, ctx.grip.Left)), turn: turnL, pole: unit(along3(UP.map(v => -v), side, 0.35)) }
            ];
        },
        hilt(ctx, f) {
            const { index, place, scale, F, world, names } = ctx, { pos } = place(f);
            const turnR = world[names.indexOf('RightHand')][f], wristR = pos[index.get('RightHand')];
            const gripR = along3(wristR, rotate(turnR, ctx.grip.Right), 1), axis = rotate(turnR, F.Right.thumbward), palmR = rotate(turnR, F.Right.palm);
            // The same handle a hand's width toward the pommel, wrapped from the other side.
            const gripL = along3(gripR, axis, -0.085 * scale), turnL = mul(frameQuat(axis, palmR.map(v => -v)), conj(frameQuat(F.Left.thumbward, F.Left.palm)));
            // The elbow bends out and down from the body, as it does on a two-handed grip.
            return [{ S: 'Left', wrist: sub(gripL, rotate(turnL, ctx.grip.Left)), turn: turnL, pole: unit([0.7, -1, -0.3]) }];
        }
    };

    const ease = k => k * k * (3 - 2 * k);
    /** The world turn that sets a foot's rest frame (ankle to the ball, its top up) along d, its top toward up. */
    const footTurn = (ctx, S, d, up) => mul(frameQuat(d, up), conj(frameQuat(ctx.foot[S].along, [0, 1, 0])));
    /** A foot's ankle for its ball at `ball`, the foot turned by `turn`. */
    const ankleFor = (ctx, S, ball, turn) => sub(ball, rotate(turn, ctx.foot[S].ball));
    /**
     * Climbing in place: the body still, the holds passing down past it as
     * it climbs two rungs a cycle. A hand grips its rung for 64% of the
     * cycle, moving down with it, then lets go and reaches up to the next;
     * a foot stands half the cycle and steps up the other half, with the
     * hand on the other side. `wall` spreads the hands and feet to holds
     * and brings the body close in.
     */
    function climb(ctx, f, wall) {
        const { index, place, scale, times, period } = ctx, { pos } = place(f), u = (times[f] / period) % 1;
        const hips = pos[index.get('Hips')], shoulder = pos[index.get('RightArm')][1], step = 0.28 * scale;
        const near = hips[2] + (wall ? 0.36 : 0.4) * scale, out = [];
        for (const [S, m, phase] of [['Right', -1, 0], ['Left', 1, 0.5]]) {
            const p = (u + phase) % 1, top = shoulder + (wall ? 0.4 : 0.45) * scale + (wall ? m * 0.03 * scale : 0), low = top - 1.28 * step;
            let y, back = 0;
            if (p < 0.64) y = top - 1.28 * step * (p / 0.64);
            else { const k = (p - 0.64) / 0.36; y = low + (top - low) * ease(k); back = 0.07 * scale * Math.sin(Math.PI * k); }
            const grip = [m * (wall ? 0.33 : 0.19) * scale, y, near - 0.02 * scale - back];
            const turn = handTurn(ctx.F[S], unit([0, 0.75, 0.66]), [-m, 0, 0]);
            out.push({ S, limb: 'arm', wrist: sub(grip, rotate(turn, ctx.grip[S])), turn, pole: unit([m * 0.6, -1, -0.3]) });
        }
        for (const [S, m, phase] of [['Left', 1, 0], ['Right', -1, 0.5]]) {
            const p = (u + phase) % 1, top = hips[1] - (wall ? 0.5 : 0.55) * scale, low = top - step;
            let y, back = 0;
            if (p < 0.5) y = top - step * (p / 0.5);
            else { const k = (p - 0.5) / 0.5; y = low + step * ease(k) + 0.05 * scale * Math.sin(Math.PI * k); back = 0.1 * scale * Math.sin(Math.PI * k); }
            const ball = [m * (wall ? 0.2 : 0.11) * scale, y, near - 0.03 * scale - back];
            const turn = footTurn(ctx, S, unit([m * (wall ? 0.4 : 0.05), -0.15, 1]), [0, 1, 0]);
            out.push({ S, limb: 'leg', wrist: ankleFor(ctx, S, ball, turn), turn, pole: unit([m * (wall ? 0.7 : 0.25), 0, 1]) });
        }
        return out;
    }
    /**
     * Treading water: the hands scull flat before the chest, out and in,
     * the palm tipping to the way it moves; the legs beat in turn, each
     * foot circling under its knee.
     */
    function tread(ctx, f) {
        const { index, place, scale, times, period } = ctx, { pos } = place(f), u = (times[f] / period) % 1;
        const chest = pos[index.get('Spine2')], hips = pos[index.get('Hips')], shoulder = pos[index.get('RightArm')][1], out = [];
        for (const [S, m] of [['Left', 1], ['Right', -1]]) {
            const a = 2 * Math.PI * 2 * u, sweep = Math.sin(a), x = m * (0.24 + 0.11 * sweep) * scale;
            const grip = [x, shoulder - 0.2 * scale, chest[2] + (0.32 + 0.03 * Math.cos(a)) * scale];
            // Palm down, fingers ahead; tipped about the length toward the way the hand sweeps.
            const tip = 0.35 * Math.cos(a) * m, thumb = unit([-m * Math.cos(tip), -Math.sin(Math.abs(tip)) * Math.sign(tip) * m, 0]);
            const turn = handTurn(ctx.F[S], [0, 0, 1], thumb);
            out.push({ S, limb: 'arm', wrist: sub(grip, rotate(turn, ctx.grip[S])), turn, pole: unit([m, -0.6, -0.4]) });
        }
        for (const [S, m, phase] of [['Left', 1, 0], ['Right', -1, 0.5]]) {
            const a = 2 * Math.PI * (2 * u + phase);
            const ball = [m * (0.27 + 0.08 * Math.cos(a)) * scale, hips[1] - 0.66 * scale + 0.05 * scale * Math.sin(a), hips[2] - 0.02 * scale + 0.1 * scale * Math.sin(a)];
            const turn = footTurn(ctx, S, unit([m * 0.2, -0.5, 0.8]), [0, 1, 0]);
            out.push({ S, limb: 'leg', wrist: ankleFor(ctx, S, ball, turn), turn, pole: unit([m * 0.4, 0.2, 1]) });
        }
        return out;
    }
    /**
     * Casting a spell: the hands draw in before the chest, palms to each
     * other, as the body leans back to gather; then thrust out together,
     * palms ahead at shoulder height, as it leans in; hold; and come back
     * to the sides. Keys are shares of the clip; the arms ease in and out
     * of the body's own swing.
     */
    function cast(ctx, f) {
        const { index, place, scale, times, period } = ctx, { pos } = place(f), u = times[f] / period;
        const chest = pos[index.get('Spine2')], sh = pos[index.get('RightArm')], out = [];
        const gather = m => ({ at: [m * 0.06 * scale, sh[1] - 0.12 * scale, chest[2] + 0.2 * scale], d: unit([-m * 0.3, 0.8, 0.5]), p: [-m, 0, 0] });
        const draw = m => ({ at: [m * 0.05 * scale, sh[1] - 0.16 * scale, chest[2] + 0.13 * scale], d: unit([-m * 0.3, 0.85, 0.4]), p: [-m, 0, 0] });
        const thrust = m => ({ at: [m * 0.12 * scale, sh[1] + 0.05 * scale, sh[2] + ctx.reach.Right * 0.86], d: unit([-m * 0.1, 0.62, 0.78]), p: [0, -0.3, 1] });
        const keys = [[0.18, gather], [0.4, draw], [0.5, thrust], [0.72, thrust]];
        for (const [S, m] of [['Left', 1], ['Right', -1]]) {
            let i = 0;
            while (i < keys.length - 1 && u > keys[i + 1][0]) i++;
            const [ua, fa] = keys[i], [ub, fb] = keys[Math.min(keys.length - 1, i + 1)], k = ub > ua ? ease(Math.max(0, Math.min(1, (u - ua) / (ub - ua)))) : 0;
            const A = fa(m), B = fb(m);
            const at = A.at.map((v, j) => v + (B.at[j] - v) * k), d = unit(A.d.map((v, j) => v + (B.d[j] - v) * k)), p = unit(A.p.map((v, j) => v + (B.p[j] - v) * k));
            // Where the wrist goes for the palm's middle to be there, the hand pointing d with its palm toward p.
            const turn = handTurn(ctx.F[S], d, square(cross(p, d).map(v => v * m), d));
            out.push({ S, limb: 'arm', wrist: sub(at, rotate(turn, ctx.grip[S])), turn: { along: d, palm: p }, pole: unit([m * 0.8, -1, -0.2]) });
        }
        return out;
    }
    AIMS.cast = cast;
    // Dedicated sprite/action motions share the guarded lower-body stance,
    // with body-relative arm IK instead of borrowing a slash or throw.
    AIMS.thrust = (ctx, f) => {
        const { pos } = ctx.place(f), sh = pos[ctx.index.get('RightArm')], u = ctx.times[f] / ctx.period;
        const drive = ease(Math.max(0, Math.min(1, (u - 0.16) / 0.25))) * (1 - ease(Math.max(0, Math.min(1, (u - 0.57) / 0.28))));
        const grip = [sh[0], sh[1] - 0.08 * ctx.scale, sh[2] + ctx.reach.Right * (0.3 + 0.55 * drive)];
        const turn = handTurn(ctx.F.Right, [0, -1, 0], [0, 0, 1]);
        return [{ S: 'Right', wrist: sub(grip, rotate(turn, ctx.grip.Right)), turn, pole: unit([-1, -1, -0.2]) }];
    };
    AIMS.bow = (ctx, f) => {
        const { pos } = ctx.place(f), head = pos[ctx.index.get('Head')], sh = pos[ctx.index.get('LeftArm')], u = ctx.times[f] / ctx.period;
        const draw = ease(Math.max(0, Math.min(1, (u - 0.1) / 0.35))) * (1 - ease(Math.max(0, Math.min(1, (u - 0.82) / 0.18))));
        const release = ease(Math.max(0, Math.min(1, (u - 0.68) / 0.06))) * (1 - ease(Math.max(0, Math.min(1, (u - 0.82) / 0.18))));
        const left = [head[0] + 0.015 * ctx.scale, sh[1] + 0.10 * ctx.scale, sh[2] + ctx.reach.Left * 0.88];
        const anchor = [head[0] - 0.045 * ctx.scale, left[1] + 0.006 * ctx.scale, head[2] - 0.015 * ctx.scale];
        const right = [anchor[0], anchor[1] - 0.008 * ctx.scale * release, (left[2] - 0.08 * ctx.scale) * (1 - draw) + anchor[2] * draw - 0.025 * ctx.scale * release];
        return [['Left', left, [0, 0, 1], [0, 1, 0]], ['Right', right, [0, -1, 0], [0, 0, 1]]].map(([S, at, d, thumb]) => {
            const turn = handTurn(ctx.F[S], d, thumb);
            return { S, wrist: sub(at, rotate(turn, ctx.grip[S])), turn, pole: unit(S === 'Left' ? [1, -0.05, -0.2] : [-0.6, 0.3, -1]) };
        });
    };
    const palmTurn = (F, along, palm) => mul(frameQuat(along, palm), conj(frameQuat(F.along, F.palm)));
    AIMS.wave = (ctx, f) => {
        const { pos } = ctx.place(f), sh = pos[ctx.index.get('RightArm')], phase = ctx.times[f] / ctx.period * Math.PI * 2;
        const sway = Math.sin(phase), along = unit([sway * .42, 1, 0]);
        return [{ S: 'Right', wrist: along3(sh, [-.20 - sway * .035, .29, .08], ctx.scale),
            turn: palmTurn(ctx.F.Right, along, [0, 0, 1]), pole: unit([-1, -.6, 0]) }];
    };
    AIMS.fall = (ctx, f) => {
        const { pos } = ctx.place(f), u = ctx.times[f] / ctx.period;
        // A small balancing response while dropping, rather than the source
        // capture's windmilling arm markers.
        return ['Left', 'Right'].map(S => {
            const m = S === 'Left' ? 1 : -1, sh = pos[ctx.index.get(S + 'Arm')];
            const d = unit([m * .7, -.25 + .12 * Math.sin(u * Math.PI), .45]);
            return { S, wrist: along3(sh, [m * .28, -.10 + .035 * Math.sin(u * Math.PI), .20], ctx.scale),
                turn: palmTurn(ctx.F[S], d, [0, -.7, 1]), pole: unit([m, -.8, -.2]) };
        });
    };
    AIMS.kneel = (ctx, f) => {
        const { pos } = ctx.place(f);
        return ['Left', 'Right'].map(S => {
            const m = S === 'Left' ? 1 : -1, knee = pos[ctx.index.get(S + 'Leg')], hip = pos[ctx.index.get(S + 'UpLeg')];
            const wrist = knee.map((v, k) => v * .65 + hip[k] * .35);
            wrist[0] += m * .08 * ctx.scale; wrist[1] += .12 * ctx.scale;
            return { S, wrist, turn: palmTurn(ctx.F[S], [0, -.35, 1], [0, -1, -.35]), pole: unit([m, .25, -.2]) };
        });
    };
    AIMS.slash = (ctx, f) => {
        const { pos } = ctx.place(f), chest = pos[ctx.index.get('Spine2')], u = ctx.times[f] / ctx.period;
        const keys = [[0, [-.12, .04, .32, -.25]], [.25, [-.24, .26, .30, -.7]],
            [.43, [-.12, .16, .37, -.3]], [.61, [.17, -.17, .36, .65]], [.78, [.17, -.20, .32, .8]], [1, [-.12, .04, .32, -.25]]];
        const q = [0, 1, 2, 3].map(k => keyed(keys.map(([t, a]) => [t, a[k]]), u));
        const grip = along3(chest, q.slice(0, 3), ctx.scale), blade = unit([q[3], 1 - Math.abs(q[3]) * .55, 0]);
        const turnR = handTurn(ctx.F.Right, [0, 0, 1], blade), turnL = handTurn(ctx.F.Left, [0, 0, 1], blade.map(v => -v));
        const left = along3(grip, blade, -ctx.F.Right.length * .85);
        return [{ S: 'Right', wrist: sub(grip, rotate(turnR, ctx.grip.Right)), turn: turnR, pole: unit([-1, -.6, -.2]) },
            { S: 'Left', wrist: sub(left, rotate(turnL, ctx.grip.Left)), turn: turnL, pole: unit([1, -.8, -.2]) }];
    };
    AIMS.ladder = (ctx, f) => climb(ctx, f, false);
    AIMS.wall = (ctx, f) => climb(ctx, f, true);
    AIMS.tread = tread;

    /** The head bowed and rolled onto the stock, the right eye over the sights (at most 40 degrees). */
    function cheekDown(ctx, f) {
        const { index, names, world, place, scale } = ctx, c = ctx.cheek;
        if (!c) return;
        const { rot, pos } = place(f), head = index.get('Head'), neck = pos[index.get('Neck')];
        const eye = along3(pos[head], rotate(rot[head], [-EYE[0] * scale, EYE[1] * scale, EYE[2] * scale]), 1);
        const on = along3(c.butt, c.bore, dot(sub(eye, c.butt), c.bore)), want = along3(on, UP, 0.065 * scale);
        let q = fromTo(unit(sub(eye, neck)), unit(sub(want, neck)));
        const angle = 2 * Math.acos(Math.min(1, Math.abs(q[3])));
        if (angle > 40 * DEG) q = partOf(q, 40 * DEG / angle);
        const half = partOf(q, 0.5), n = names.indexOf('Neck'), h = names.indexOf('Head');
        if (n >= 0) world[n][f] = mul(half, world[n][f]);
        if (h >= 0) world[h][f] = mul(q, world[h][f]);
    }

    /** The arms set by the pose's aim or grip, every frame, eased in and out by its `aimMix` keys [[seconds, weight], ...]. */
    function aimArms(bones, index, names, world, steps, place, turnAt, scale, frames, pose, times) {
        const kinds = [].concat(pose.aim || []);
        if (!kinds.length || !frames.Left || !frames.Right) return;
        const reach = {}, grip = {}, restAlong = {}, foot = {};
        for (const S of ['Left', 'Right']) {
            const p = n => bones[index.get(S + n)].head;
            reach[S] = Math.hypot(...sub(p('ForeArm'), p('Arm'))) + Math.hypot(...sub(p('Hand'), p('ForeArm'))) + frames[S].length * 0.62;
            grip[S] = gripOf(frames[S], 0.03);
            restAlong[S + 'ForeArm'] = unit(sub(p('Hand'), p('ForeArm')));
            if (index.has(S + 'ToeBase')) foot[S] = { along: unit(sub(p('ToeBase'), p('Foot'))), ball: sub(p('ToeBase'), p('Foot')) };
        }
        const period = times[times.length - 1] || 1;
        const ctx = { bones, index, names, world, place, turnAt, scale, F: frames, pose, reach, grip, restAlong, foot, times, period, rest: restFrames(bones, index), roll: {}, wristRoll: {}, bendNormals: {}, bendReference: {}, bendFrame: {} };
        for (let f = 0; f < steps; f++) {
            const w = pose.aimMix ? Math.max(0, Math.min(1, keyed(pose.aimMix, times[f]))) : 1;
            if (w <= 0) continue;
            for (const kind of kinds) {
                for (const r of AIMS[kind](ctx, f)) {
                    const holdGrip = Array.isArray(r.turn) && ['pistol', 'pistolTwo', 'rifle', 'hilt', 'thrust', 'bow', 'slash'].includes(kind);
                    const grip = holdGrip ? along3(r.wrist, rotate(r.turn, ctx.grip[r.S]), 1) : null;
                    let wrist = r.wrist;
                    for (let pass = 0; pass < (holdGrip ? 3 : 1); pass++) {
                        reachLimb(ctx, f, r.S, r.limb || 'arm', wrist, r.turn, r.pole, w);
                        if (grip) wrist = sub(grip, rotate(turnAt(index.get(r.S + 'Hand'), f), ctx.grip[r.S]));
                    }
                }
                if (kind === 'rifle' && w > 0) cheekDown(ctx, f);
            }
        }
    }
    /** A value along keys [[seconds, value], ...], eased between keys. */
    function keyed(keys, t) {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const u = (t - keys[i - 1][0]) / ((keys[i][0] - keys[i - 1][0]) || 1); return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * u * u * (3 - 2 * u); }
        return keys[keys.length - 1][1];
    }

    function captured(bones, id, cap, body, pose, options) {
        const index = new Map(bones.map((b, i) => [b.name, i]));
        const rest = restFrames(bones, index);
        const names = DATA.bones.filter(n => rest[n] && cap.bones[n]);
        const steps = cap.frames, times = new Float32Array(steps);
        for (let i = 0; i < steps; i++) times[i] = i / cap.fps;
        // A bone's world turn per frame: its captured frame over its rest frame; unmapped bones keep their parent's.
        const world = names.map(n => {
            const v = cap.bones[n], r = conj(rest[n]), out = new Array(steps);
            for (let i = 0; i < steps; i++) out[i] = mul([v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]], r);
            return out;
        });
        if (id === 'bow') {
            // A quiet side-on archery stance; a looping boxing capture made the bow hand wander.
            names.forEach((name, k) => {
                const yaw = name === 'Head' ? 0 : name === 'Neck' ? -25 : -60;
                const turn = mul(quat(0, 1, 0, yaw * DEG), world[k][Math.min(10, steps - 1)]);
                for (let f = 0; f < steps; f++) world[k][f] = turn.slice();
            });
        }
        // These are planted actions. The boxing source's knee corrections
        // added a visible kick to guarding and thrust even when both feet
        // should stay put. Keep one stable stance beneath the authored arms.
        if (['defend', 'swordThrust', 'sword'].includes(id)) names.forEach((name, k) => {
            if (/^(Hips|Spine\d*|Neck|Head|.*(?:UpLeg|Leg|Foot|ToeBase))$/.test(name)) {
                const q = world[k][Math.min(10, steps - 1)];
                for (let f = 0; f < steps; f++) world[k][f] = q.slice();
            }
        });
        if (id === 'wave') names.forEach((name, k) => {
            // An ordinary standing posture keeps both soles down. The raised
            // arm is authored below with its palm facing the viewer.
            if (!/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/.test(name))
                for (let f = 0; f < steps; f++) world[k][f] = [0, 0, 0, 1];
        });
        const slot = new Map(names.map((n, k) => [index.get(n), k]));
        const turnAt = (i, f) => {
            for (let b = i; b >= 0; b = bones[b].parent) if (slot.has(b)) return world[slot.get(b)][f];
            return [0, 0, 0, 1];
        };
        /** Every joint's turn and place at frame f, the hips at rest. */
        const place = f => {
            const rot = [], pos = [];
            bones.forEach((b, i) => {
                rot[i] = turnAt(i, f);
                if (b.parent < 0) pos[i] = b.head.slice();
                else { const r = rotate(rot[b.parent], sub(b.head, bones[b.parent].head)); pos[i] = [pos[b.parent][0] + r[0], pos[b.parent][1] + r[1], pos[b.parent][2] + r[2]]; }
            });
            return { rot, pos };
        };
        let top = 0;
        for (const b of bones) top = Math.max(top, b.head[1]);
        const scale = top / 1.7 || 1;
        const frames = handFrames(bones, index);
        holdWrists(bones, index, names, world, steps, frames, pose, turnAt);
        clearBody(bones, index, names, world, steps, place, scale, measure(bones, index, body, scale), !cap.once);
        if (pose && pose.aim) aimArms(bones, index, names, world, steps, place, turnAt, scale, frames, pose, times);
        // Where the body meets the floor: the skeleton followed joint by joint from the hips.
        const leg = side => { const a = index.get(side + 'UpLeg'), k = index.get(side + 'Leg'), f = index.get(side + 'Foot'); return a === undefined || k === undefined || f === undefined ? 0.85 * scale : Math.hypot(...sub(bones[k].head, bones[a].head)) + Math.hypot(...sub(bones[f].head, bones[k].head)); };
        const legLength = (leg('Left') + leg('Right')) / 2;
        const reach = bones.map(b => {
            const key = b.name.replace(/^(Left|Right)/, '');
            if (SOLE[key]) return SOLE[key].map(o => o.map(v => v * scale));
            return cap.skin && REACH[key] !== undefined ? REACH[key] * scale : null;
        });
        const stand = () => {
            const heights = new Float32Array(steps);
            for (let f = 0; f < steps; f++) {
                const { rot, pos } = place(f);
                let need = -Infinity;
                bones.forEach((b, i) => {
                    const c = reach[i];
                    if (c === null) return;
                    if (typeof c === 'number') { need = Math.max(need, c - pos[i][1]); return; }
                    // A sole point: wherever it is at rest is on the floor.
                    for (const o of c) need = Math.max(need, b.head[1] + o[1] - (pos[i][1] + rotate(rot[i], o)[1]));
                });
                heights[f] = cap.hang ? cap.rise[f] * legLength : (Number.isFinite(need) ? need : 0) + (cap.air && !(options && options.inPlace) ? cap.rise[f] * legLength : 0);
            }
            return heights;
        };
        // Resting on the body (kneeling, sitting, lying), a foot just off the floor turns at the ankle to rest on it.
        if (cap.skin) settleFeet(bones, index, names, world, steps, place, stand(), scale, !cap.once);
        if (id === 'frontFlip' || id === 'backFlip') {
            // Foot markers often disappear during inversion and return pointing
            // down or backward. Recover the landing orientation before contact,
            // rather than letting the ankle correction chase those lost markers.
            const hips = index.get('Hips'), direction = id === 'frontFlip' ? 1 : -1;
            let previous = 0, angle = 0, first = 0;
            for (let f = 0; f < steps; f++) {
                const h = turnAt(hips, f), up = rotate(h, [0, 1, 0]), value = Math.atan2(up[2], up[1]);
                if (!f) { first = value; angle = value; }
                else { let delta = value - previous; if (delta > Math.PI) delta -= Math.PI * 2; if (delta < -Math.PI) delta += Math.PI * 2; angle += delta; }
                previous = value;
                const progress = (angle - first) * direction;
                const u = Math.max(0, Math.min(1, (progress - (2 * Math.PI - 1.0)) / 0.65));
                if (!u) continue;
                const front = rotate(h, [0, 0, 1]), yaw = Math.atan2(front[0], front[2]);
                const turn = quat(0, 1, 0, yaw), mix = u * u * (3 - 2 * u);
                for (const S of ['Left', 'Right']) for (const name of ['Foot', 'ToeBase']) {
                    const k = names.indexOf(S + name);
                    if (k >= 0) world[k][f] = slerp4(world[k][f], turn, mix);
                }
            }
        }
        const stride = id === 'walk' || id === 'run' || id === 'crouchWalk';
        if (stride) separateStride(bones, index, names, world, steps, place, scale);
        limitLegs(index, names, world, steps, turnAt, bones, !cap.hang, cap.once, stride ? 12 : TOE_OUT);
        const heights = stand();
        const tracks = names.map((n, k) => {
            const i = index.get(n), values = new Float32Array(steps * 4);
            let last = null;
            for (let f = 0; f < steps; f++) {
                const p = bones[i].parent;
                let q = mul(conj(p >= 0 ? turnAt(p, f) : [0, 0, 0, 1]), world[k][f]);
                const l = Math.hypot(...q);
                q = q.map(x => x / l);
                // Each frame on the same side of the sphere as the one before, so the turns blend the short way.
                if (last && dot4(q, last) < 0) q = q.map(x => -x);
                values.set(q, f * 4);
                last = q;
            }
            return { bone: i, values };
        });

        for (const t of handTracks(frames, pose && pose.hands, times)) tracks.push(t);

        if (id === 'frontFlip' || id === 'backFlip') {
            // Foot-based replanting during inversion makes the hips bounce toward the floor.
            // Keep one continuous ballistic root arc between takeoff and landing instead.
            const hips = index.get('Hips'), progress = [], direction = id === 'frontFlip' ? 1 : -1;
            let previous = 0, angle = 0, first = 0;
            for (let f = 0; f < steps; f++) {
                const up = rotate(turnAt(hips, f), [0, 1, 0]), value = Math.atan2(up[2], up[1]);
                if (!f) { first = value; angle = value; }
                else { let delta = value - previous; if (delta > Math.PI) delta -= Math.PI * 2; if (delta < -Math.PI) delta += Math.PI * 2; angle += delta; }
                progress.push((angle - first) * direction); previous = value;
            }
            const launch = progress.findIndex(q => q > 0.35), landing = progress.findIndex((q, f) => f > launch && q > Math.PI * 2 - 0.45);
            if (launch >= 0 && landing > launch) {
                const from = Math.max(0, launch - 2), to = Math.min(steps - 1, landing + 2), low = body ? skinLows(bones, { times, tracks, heights: new Float32Array(steps) }, body) : null;
                const start = heights[from], end = heights[to];
                let apex = legLength * 0.7;
                if (low) for (let f = from + 2; f < to - 1; f++) {
                    const u = (f - from) / (to - from), arc = 4 * u * (1 - u), base = start * (1 - u) + end * u;
                    apex = Math.max(apex, (0.04 * scale - low[f] - base) / arc);
                }
                for (let f = from; f <= to; f++) { const u = (f - from) / (to - from); heights[f] = start * (1 - u) + end * u + apex * 4 * u * (1 - u); }
            }
        }

        const period = times[steps - 1] || 1;
        return {
            name: id, times, tracks, heights, skin: !!cap.skin, once: !!cap.once,
            lift: t => {
                // A motion played once holds its last frame; a loop goes round.
                const x = (cap.once ? Math.max(0, Math.min(t, period)) : ((t % period) + period) % period) * cap.fps, i = Math.min(steps - 1, Math.floor(x)), k = x - i;
                return heights[i] + (heights[Math.min(steps - 1, i + 1)] - heights[i]) * k;
            }
        };
    }
    const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

    /** `options.inPlace`: the body's height off the floor leaves out the capture's own flight (a jump's, a run's). */
    function clip(bones, id, body, options) {
        if (!POSES.some(p => p.id === id)) return null;
        const index = new Set(bones.map(b => b.name));
        if (!index.has('LeftArm') || !index.has('LeftForeArm') || !index.has('LeftUpLeg')) return null;
        const authored = id === 'swordThrust' || id === 'bow' || id === 'sword';
        const source = take(authored ? 'fight' : id);
        let cap = authored && source ? Object.assign({}, source, { once: true }) : source;
        if ((id === 'bow' || id === 'sword') && cap) {
            const frames = 61;
            cap = Object.assign({}, cap, { frames, fps: 30, rise: new Float32Array(frames), bones: Object.fromEntries(Object.entries(cap.bones).map(([name, values]) => [name, Float32Array.from({ length: frames * 4 }, (_, i) => values[Math.min(10, source.frames - 1) * 4 + i % 4])])) });
        }
        return cap ? captured(bones, id, cap, body, POSES.find(p => p.id === id), options) : null;
    }

    // ── clips for the saved model ───────────────────────────────────────
    /**
     * The motions a saved character carries, by the clip names the game
     * plays on its own (Walk, Run, Jump, Swim, Tread Water, Climb) and by
     * plain names for the rest. `useful` marks the set saved by default.
     */
    const GAME_CLIPS = [
        ['walk', 'Walk', true], ['run', 'Run', true], ['jump', 'Jump', true], ['crouchWalk', 'Crouch Walk', true], ['climbLadder', 'Climb', true],
        ['swim', 'Swim', true], ['tread', 'Tread Water', true], ['fight', 'Fight Stance', true], ['sword', 'Sword Swing', true], ['defend', 'Guard', true],
        ['swordThrust', 'Thrust', true], ['bow', 'Bow', true],
        ['hit', 'Hit', true], ['death', 'Death', true], ['cast', 'Cast Spell', true], ['throw', 'Throw', true], ['dodge', 'Dodge', true],
        ['pistol', 'Pistol Aim', true], ['rifle', 'Rifle Aim', true], ['armsUp', 'Victory', true],
        ['pistolTwo', 'Pistol Aim Two Hands', false], ['kneelAim', 'Kneel Aim', false], ['proneAim', 'Prone Aim', false], ['roll', 'Roll', false],
        ['frontFlip', 'Front Flip', false], ['backFlip', 'Back Flip', false], ['climbWall', 'Climb Wall', false], ['crouch', 'Crouch', false],
        ['kneel', 'Kneel', false], ['sit', 'Sit', false], ['prone', 'Prone', false], ['lieBack', 'Lie Back', false], ['lieSide', 'Lie Side', false],
        ['fall', 'Fall', false], ['wave', 'Wave', false]
    ].map(([id, name, useful]) => ({ id, name, useful }));

    /** The lowest point of the body's skin at each frame of a clip (a sample of its vertices skinned). */
    function skinLows(bones, clip, body) {
        const P = body.positions, J = body.joints, W = body.weights, n = P.length / 3, every = Math.max(1, Math.floor(n / 1500));
        const local = bones.map(() => [0, 0, 0, 1]), lows = new Float32Array(clip.times.length);
        for (let f = 0; f < clip.times.length; f++) {
            for (const t of clip.tracks) if (!t.path) local[t.bone] = [t.values[f * 4], t.values[f * 4 + 1], t.values[f * 4 + 2], t.values[f * 4 + 3]];
            const rot = [], pos = [];
            bones.forEach((b, i) => {
                if (b.parent < 0) { rot[i] = local[i]; pos[i] = [b.head[0], b.head[1] + clip.heights[f], b.head[2]]; return; }
                rot[i] = mul(rot[b.parent], local[i]);
                pos[i] = along3(pos[b.parent], rotate(rot[b.parent], sub(b.head, bones[b.parent].head)), 1);
            });
            let low = Infinity;
            for (let v = 0; v < n; v += every) {
                let y = 0;
                for (let k = 0; k < 4; k++) {
                    const w = W[v * 4 + k];
                    if (!w) continue;
                    const j = J[v * 4 + k];
                    y += w * (pos[j][1] + rotate(rot[j], [P[v * 3] - bones[j].head[0], P[v * 3 + 1] - bones[j].head[1], P[v * 3 + 2] - bones[j].head[2]])[1]);
                }
                low = Math.min(low, y);
            }
            lows[f] = low;
        }
        return lows;
    }

    /**
     * The keys a track can do without: each track keeps only the frames
     * its neighbors' interpolation misses by more than `turnTol` radians
     * (or `moveTol` meters for the hips' place), on times of its own; a
     * track that never moves keeps two keys.
     */
    function reduceKeys(times, tracks, turnTol, moveTol) {
        // Tracks keyed on the same frames share one times array (the file then holds it once).
        const n = times.length, shared = new Map();
        return tracks.map(t => {
            const d = t.path ? 3 : 4, at = i => t.values.subarray(i * d, i * d + d);
            // How far key i is from the line between keys a and b (the turn between them blended evenly and
            // normalized, close to a slerp over the short spans kept).
            const cosTol = Math.cos(turnTol / 2);
            const fits = (a, b) => {
                const va = at(a), vb = at(b);
                for (let i = a + 1; i < b; i++) {
                    const u = (times[i] - times[a]) / (times[b] - times[a]), vi = at(i);
                    if (d === 3) { for (let k = 0; k < 3; k++) if (Math.abs(va[k] + (vb[k] - va[k]) * u - vi[k]) > moveTol) return false; continue; }
                    const x = va[0] + (vb[0] - va[0]) * u, y = va[1] + (vb[1] - va[1]) * u, z = va[2] + (vb[2] - va[2]) * u, w = va[3] + (vb[3] - va[3]) * u;
                    if (Math.abs(x * vi[0] + y * vi[1] + z * vi[2] + w * vi[3]) / (Math.hypot(x, y, z, w) || 1) < cosTol) return false;
                }
                return true;
            };
            const keep = [0];
            if (fits(0, n - 1)) keep.push(n - 1);
            else {
                let a = 0;
                for (let b = 2; b < n; b++) if (!fits(a, b)) { keep.push(b - 1); a = b - 1; }
                keep.push(n - 1);
            }
            const values = new Float32Array(keep.length * d);
            keep.forEach((i, j) => values.set(at(i), j * d));
            const sig = keep.join(',');
            if (!shared.has(sig)) shared.set(sig, Float32Array.from(keep, i => times[i]));
            return Object.assign({}, t, { times: shared.get(sig), values });
        });
    }

    /**
     * The clips a saved character carries ([{ name, times, tracks }], a
     * track's own `times` when it holds still), the hips' height in a
     * translation track so a jump leaves the floor and a body lying down
     * lies on it. `set`: 'useful' (the default), 'all' or 'none'.
     */
    function gameClips(bones, body, set) {
        const which = set || 'useful';
        if (which === 'none') return [];
        const hips = bones.findIndex(b => b.parent < 0);
        const out = [];
        for (const g of GAME_CLIPS) {
            if (which === 'useful' && !g.useful) continue;
            const c = clip(bones, g.id, body);
            if (!c) continue;
            const heights = Float32Array.from(c.heights);
            // A body resting on itself: its lowest skin on the floor, frame by frame.
            if (c.skin && body && body.positions) {
                const lows = skinLows(bones, c, body);
                for (let f = 0; f < heights.length; f++) heights[f] -= lows[f];
            }
            const move = new Float32Array(heights.length * 3), h = bones[hips].head;
            for (let f = 0; f < heights.length; f++) move.set([h[0], h[1] + heights[f], h[2]], f * 3);
            const tracks = c.tracks.concat([{ bone: hips, path: 'translation', values: move }]);
            out.push({ name: g.name, times: c.times, tracks: reduceKeys(c.times, tracks, 0.4 * DEG, 0.002), loop: !c.once });
        }
        return out;
    }

    /**
     * What the game plays each clip for: the movement states (by the
     * names the game reads on its own as well) and the battle's actions
     * (attack, skill, cast, item, guard, damage, dead, evade, victory,
     * shoot), as a model's own animations in its model.json.
     */
    const SLOTS = [
        ['Idle', 'idle', 'Idle'], ['Walk', 'walking', 'Walk'], ['Run', 'dashing', 'Run'], ['Jump', 'jumping', 'Jump'],
        ['Swim', 'swimming', 'Swim'], ['Tread Water', 'treading', 'Tread Water'], ['Climb', 'climbing', 'Climb'],
        ['attack', 'action', 'Sword Swing'], ['skill', 'action', 'Cast Spell'], ['cast', 'action', 'Cast Spell'], ['item', 'action', 'Throw'],
        ['thrust', 'action', 'Thrust'], ['missile', 'action', 'Bow'],
        ['guard', 'action', 'Guard'], ['damage', 'action', 'Hit'], ['dead', 'action', 'Death'], ['evade', 'action', 'Dodge'],
        ['victory', 'action', 'Victory'], ['shoot', 'action', 'Pistol Aim']
    ];
    /**
     * The motions the game plays a rigged humanoid in for its own states,
     * where the model has none of its own: the state, the motion, and the
     * name it shows by.
     */
    const STATE_MOTIONS = [
        { state: 'walking', id: 'walk', name: 'Walk' }, { state: 'dashing', id: 'run', name: 'Run' }, { state: 'jumping', id: 'jump', name: 'Jump' },
        { state: 'swimming', id: 'swim', name: 'Swim' }, { state: 'treading', id: 'tread', name: 'Tread Water' }, { state: 'climbing', id: 'climbLadder', name: 'Climb' }
    ];
    /**
     * One motion as the game plays it, on a skeleton at rest (`bones` as for
     * clip): { times, tracks, loop }, a track { bone, values, times } and the
     * hips' place one with `path: 'translation'`, keys thinned. A jump keeps
     * its time in the air, from just before the feet leave the floor to the
     * landing, and leaves the flight's height to the game.
     */
    function stateClip(bones, id) {
        const flight = id === 'jump';
        const c = clip(bones, id, null, { inPlace: flight });
        if (!c) return null;
        let from = 0, to = c.times.length - 1;
        if (flight) {
            const rise = take(id).rise;
            let a = -1, b = -1;
            for (let f = 0; f < rise.length; f++) if (rise[f] > 0.04) { if (a < 0) a = f; b = f; }
            if (a >= 0) { from = Math.max(0, a - 5); to = Math.min(to, b + 2); }
        }
        const n = to - from + 1, times = new Float32Array(n);
        for (let i = 0; i < n; i++) times[i] = c.times[from + i] - c.times[from];
        const hips = bones.findIndex(b => b.parent < 0), h = bones[hips].head, move = new Float32Array(n * 3);
        for (let f = 0; f < n; f++) move.set([h[0], h[1] + c.heights[from + f], h[2]], f * 3);
        const tracks = c.tracks.map(t => ({ bone: t.bone, values: t.values.slice(from * 4, (to + 1) * 4) })).concat([{ bone: hips, path: 'translation', values: move }]);
        return { name: id, times, tracks: reduceKeys(times, tracks, 0.4 * DEG, 0.002), loop: !flight && !c.once };
    }
    const frameOf = bones => handFrames(bones, new Map(bones.map((b, i) => [b.name, i])));
    const api = {
        POSES, GROUPS, clip, gameClips, GAME_CLIPS, SLOTS, STATE_MOTIONS, stateClip, LEG_RANGE, TOE_OUT, load, loadAsync, open, ready: () => !!DATA, dataPath: null, HAND_SHAPES, FINGER_RANGE, handFrames: frameOf,
        /** One still frame of both hands in a shape: the finger tracks. */
        handShape: (bones, shape) => handTracks(frameOf(bones), both(shape), [0])
    };
    root.RRMotionLibrary = api;
    root.RRCharacterPoses = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
