/**
 * RigMotionPresets - plug-and-play motions for the standard rig
 * templates. A preset is one motion: a name, when it plays, how long it
 * takes, and a keyframed track for each part it moves. It lands in the
 * model's Animations list as that one motion (its tracks are ordinary pose
 * rules sharing the name, so they fire together), editable in the motion
 * editor like anything authored by hand.
 *
 * Rotations are in the model's own axes, the templates' canonical facing:
 * the character looks toward +Z, its right side is at -X, arms hang down.
 * A limb swings forward on negative X and bends a knee or an elbow on
 * positive X; an arm lifts out to the side on +Z (left) or -Z (right); the
 * torso and head lean forward on positive X and turn left on positive Y.
 *
 * The movement states (walking, dashing, idle, jumping, swimming,
 * treading, climbing) have a preset each, and a rigged model plays those on its own
 * for any state it has no motion of its own for (`DEFAULTS`,
 * `defaultRules`), so a character climbs, swims and jumps plausibly
 * before anyone animates it. The same file is the runtime's
 * reactor_rig_motions.js, byte for byte.
 */
(function(root) {
    'use strict';

    const round = v => Math.round(v * 100) / 100;
    const add = (a, b) => [0, 1, 2].map(i => round((a[i] || 0) + (b[i] || 0)));
    const AXES = { x: 0, y: 1, z: 2 };

    /** A key: where in the motion (0-1) and the pose there. */
    const key = (at, rotate, move) => {
        const stop = { at: round(at), rotate: rotate.map(round) };
        if (move) stop.move = move.map(v => Math.round(v * 1000) / 1000);
        return stop;
    };

    /** A pose held through the motion. */
    const hold = rotate => [key(0, rotate), key(1, rotate)];

    /**
     * A swing about one axis, as keys over the whole motion: `amp` degrees
     * either side of `base`, `cycles` times through, starting `phase` of
     * the way into a cycle. Starts and ends on the same pose, so it loops.
     */
    const osc = (axis, amp, phase = 0, base = [0, 0, 0], cycles = 1, samples = 8) => {
        const keys = [];
        const n = samples * cycles;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const offset = [0, 0, 0];
            offset[AXES[axis]] = amp * Math.sin(2 * Math.PI * (t * cycles + phase));
            keys.push(key(t, add(base, offset)));
        }
        return keys;
    };

    /**
     * A steady turn about one axis, `degrees` a cycle (360 for a windmill),
     * starting `phase` of the way round, as keys over the whole motion. It
     * ends a whole revolution on from where it began, so it loops smoothly.
     */
    const turn = (axis, degrees, phase = 0, base = [0, 0, 0], samples = 8) => {
        const keys = [];
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const offset = [0, 0, 0];
            offset[AXES[axis]] = degrees * (t + phase);
            keys.push(key(t, add(base, offset)));
        }
        return keys;
    };

    /** A rise and fall of the whole model, `times` a cycle (a step lifts twice a stride). */
    const bob = (amount, times = 2, samples = 8) => {
        const keys = [];
        const n = samples * times;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            keys.push(key(t, [0, 0, 0], [0, round(amount * (0.5 - 0.5 * Math.cos(2 * Math.PI * t * times)) * 1000) / 1000, 0]));
        }
        return keys;
    };

    /**
     * One motion: its tracks as pose rules sharing its name. `frames` is the
     * whole motion's length at 60 per second (a pose rule's period is half
     * of that: in and out). `hold` makes an on-demand stance latch.
     */
    const motion = (id, name, template, trigger, frames, tracks, options = {}) => ({
        id, name, template, trigger, frames,
        rules: Object.entries(tracks).map(([part, value]) => {
            const rule = { name, part: part === 'Body' ? '' : part, type: 'pose', trigger, period: Math.max(1, Math.round(frames / 2)) };
            if (options.hold) Object.assign(rule, { hold: true }, Array.isArray(value) ? { rotate: value } : value);
            else rule.keys = value;
            return rule;
        })
    });

    /** A stride: legs and arms swinging opposite, knees bending on the lift, a rise twice a stride. */
    const stride = (id, name, trigger, frames, hip, knee, arm, lift) => motion(id, name, 'humanoid', trigger, frames, {
        LeftUpperLeg: osc('x', hip, 0.5),
        RightUpperLeg: osc('x', hip, 0),
        LeftLowerLeg: osc('x', knee, 0.72, [knee, 0, 0]),
        RightLowerLeg: osc('x', knee, 0.22, [knee, 0, 0]),
        LeftUpperArm: osc('x', arm, 0, [0, 0, 6]),
        RightUpperArm: osc('x', arm, 0.5, [0, 0, -6]),
        LeftLowerArm: hold([-12, 0, 0]),
        RightLowerArm: hold([-12, 0, 0]),
        Chest: osc('y', 5, 0.25),
        Body: bob(lift)
    });

    const PRESETS = [
        // ── Humanoid: the movement states ────────────────────────────
        stride('walk', 'Walk', 'walking', 44, 30, 18, 24, 0.02),
        stride('run', 'Run', 'dashing', 26, 44, 30, 38, 0.045),
        motion('breathe', 'Breathe', 'humanoid', 'idle', 150, {
            Chest: osc('x', 2.5),
            LeftUpperArm: osc('x', 3, 0.5, [0, 0, 4]),
            RightUpperArm: osc('x', 3, 0.5, [0, 0, -4]),
            Head: osc('x', 2, 0.3)
        }),
        // In the air, once from the takeoff (a jump's motion holds its last frame through
        // a long fall): arms swing up as the back leg pushes off, knees tuck at the top,
        // then the legs reach down for the landing with the arms out for balance.
        motion('jump', 'Jump', 'humanoid', 'jumping', 50, {
            LeftUpperLeg: [key(0, [0, 0, 4]), key(0.3, [-45, 0, 4]), key(0.55, [-60, 0, 4]), key(0.85, [-20, 0, 4]), key(1, [-12, 0, 4])],
            RightUpperLeg: [key(0, [10, 0, -4]), key(0.3, [-25, 0, -4]), key(0.55, [-40, 0, -4]), key(0.85, [-10, 0, -4]), key(1, [-6, 0, -4])],
            LeftLowerLeg: [key(0, [10, 0, 0]), key(0.3, [70, 0, 0]), key(0.55, [90, 0, 0]), key(0.85, [30, 0, 0]), key(1, [20, 0, 0])],
            RightLowerLeg: [key(0, [25, 0, 0]), key(0.3, [55, 0, 0]), key(0.55, [75, 0, 0]), key(0.85, [25, 0, 0]), key(1, [18, 0, 0])],
            // Out for balance only a little past the rest pose: most rigs already hang their arms out.
            LeftUpperArm: [key(0, [-60, 0, 10]), key(0.3, [-45, 0, 16]), key(0.55, [-32, 0, 22]), key(0.85, [-26, 0, 20]), key(1, [-22, 0, 18])],
            RightUpperArm: [key(0, [-60, 0, -10]), key(0.3, [-45, 0, -16]), key(0.55, [-32, 0, -22]), key(0.85, [-26, 0, -20]), key(1, [-22, 0, -18])],
            LeftLowerArm: [key(0, [-20, 0, 0]), key(0.55, [-35, 0, 0]), key(1, [-25, 0, 0])],
            RightLowerArm: [key(0, [-20, 0, 0]), key(0.55, [-35, 0, 0]), key(1, [-25, 0, 0])],
            Chest: [key(0, [-6, 0, 0]), key(0.55, [8, 0, 0]), key(1, [4, 0, 0])],
            Head: [key(0, [-8, 0, 0]), key(0.55, [0, 0, 0]), key(1, [10, 0, 0])]
        }),
        // Moving through deep water: a front crawl. The body lies nearly flat just under
        // the surface (pitched from the feet, then lifted and drawn back: the swimmer
        // floats feet-down at the swim depth), head up; each arm windmills a whole turn, over the back and
        // round under the chest, half a stroke after the other; a quick flutter kick.
        motion('swim', 'Swim', 'humanoid', 'swimming', 70, {
            // Lifted 1.6 tiles and drawn back 1.45, so the body lies centred over where the swimmer is.
            Body: [key(0, [75, 0, 0], [0, 1.6, -1.45]), key(1, [75, 0, 0], [0, 1.6, -1.45])],
            Head: hold([-50, 0, 0]),
            RightUpperArm: turn('x', 360, 0, [0, 0, -12]),
            LeftUpperArm: turn('x', 360, 0.5, [0, 0, 12]),
            // The elbow folds high on the way over (+X leads the hand forward) and straightens through the pull.
            RightLowerArm: osc('x', 30, 0, [35, 0, 0]),
            LeftLowerArm: osc('x', 30, 0.5, [35, 0, 0]),
            LeftUpperLeg: osc('x', 16, 0, [0, 0, 0], 3),
            RightUpperLeg: osc('x', 16, 0.5, [0, 0, 0], 3),
            LeftLowerLeg: osc('x', 14, 0.25, [16, 0, 0], 3),
            RightLowerLeg: osc('x', 14, 0.75, [16, 0, 0], 3)
        }),
        // Floating still in deep water, upright: forearms forward under the surface, the
        // hands sweeping out and back in together (a turn about the vertical, mirrored),
        // a slow kick, a gentle bob, head well out.
        motion('tread', 'Tread Water', 'humanoid', 'treading', 80, {
            LeftUpperArm: hold([-20, 0, 10]),
            RightUpperArm: hold([-20, 0, -10]),
            // Turned in 25° so the forearms point ahead, not out along the arms' rest angle.
            LeftLowerArm: osc('y', 25, 0, [-65, -25, 0]),
            RightLowerArm: osc('y', -25, 0, [-65, 25, 0]),
            LeftUpperLeg: osc('x', 16, 0, [-12, 0, 0]),
            RightUpperLeg: osc('x', 16, 0.5, [-12, 0, 0]),
            LeftLowerLeg: osc('x', 14, 0.25, [28, 0, 0]),
            RightLowerLeg: osc('x', 14, 0.75, [28, 0, 0]),
            Body: bob(0.04, 2)
        }),
        // Up or down a ladder: hand over hand overhead, the opposite foot stepping up with each.
        motion('climb', 'Climb', 'humanoid', 'climbing', 40, {
            LeftUpperArm: osc('x', 24, 0, [-150, 0, 8]),
            RightUpperArm: osc('x', 24, 0.5, [-150, 0, -8]),
            LeftLowerArm: osc('x', 20, 0.5, [-24, 0, 0]),
            RightLowerArm: osc('x', 20, 0, [-24, 0, 0]),
            LeftUpperLeg: osc('x', 28, 0.5, [-34, 0, 0]),
            RightUpperLeg: osc('x', 28, 0, [-34, 0, 0]),
            LeftLowerLeg: osc('x', 26, 0, [50, 0, 0]),
            RightLowerLeg: osc('x', 26, 0.5, [50, 0, 0]),
            Chest: hold([6, 0, 0])
        }),
        // ── Humanoid: gestures, on demand ────────────────────────────
        motion('wave', 'Wave', 'humanoid', 'action', 90, {
            // The arm raised up in front (a forward raise leaves shoulder armour
            // whole, where a sideways lift overhead folds it) and turned palm-out
            // (the 60° Y). The sweep turns the raised arm about the depth axis, so
            // the hand goes side to side, not toward the viewer; in these euler
            // angles that moves all three, so each key is that turn worked out:
            // [-155, 60, -10] turned 12° out and 10° in. The forearm flicks
            // (on Z, side to side) a beat behind.
            RightUpperArm: [key(0.15, [-155, 60, -10]), key(0.27, [-139.5, 53.4, -28.4]), key(0.39, [-172.7, 62.8, 10.2]),
                key(0.51, [-139.5, 53.4, -28.4]), key(0.63, [-172.7, 62.8, 10.2]), key(0.75, [-155, 60, -10]), key(0.85, [-155, 60, -10])],
            RightLowerArm: [key(0.15, [0, 0, 0]), key(0.3, [0, 0, 14]), key(0.42, [0, 0, -14]),
                key(0.54, [0, 0, 14]), key(0.66, [0, 0, -14]), key(0.78, [0, 0, 0]), key(0.85, [0, 0, 0])],
            Head: [key(0.2, [0, -8, 0]), key(0.8, [0, -8, 0])]
        }),
        motion('bow', 'Take a Bow', 'humanoid', 'action', 100, {
            Spine: [key(0.35, [30, 0, 0]), key(0.65, [30, 0, 0])],
            Chest: [key(0.35, [18, 0, 0]), key(0.65, [18, 0, 0])],
            Head: [key(0.35, [14, 0, 0]), key(0.65, [14, 0, 0])],
            // The right hand to the chest: the forearm level and turned 80° across the body.
            RightUpperArm: [key(0.3, [-18, 0, 10]), key(0.65, [-18, 0, 10])],
            RightLowerArm: [key(0.3, [-90.9, -4.9, 80]), key(0.65, [-90.9, -4.9, 80])],
            LeftUpperArm: [key(0.35, [8, 0, 0]), key(0.65, [8, 0, 0])]
        }),
        motion('nod', 'Nod', 'humanoid', 'action', 60, {
            Head: [key(0.25, [18, 0, 0]), key(0.5, [2, 0, 0]), key(0.75, [18, 0, 0])]
        }),
        motion('shake-head', 'Shake Head', 'humanoid', 'action', 60, {
            Head: [key(0.2, [0, 24, 0]), key(0.45, [0, -24, 0]), key(0.7, [0, 24, 0]), key(0.85, [0, -12, 0])]
        }),
        motion('hop', 'Hop', 'humanoid', 'action', 56, {
            Body: [key(0.12, [0, 0, 0], [0, -0.05, 0]), key(0.32, [0, 0, 0], [0, 0.4, 0]), key(0.48, [0, 0, 0], [0, 0.52, 0]),
                key(0.68, [0, 0, 0], [0, 0.02, 0]), key(0.8, [0, 0, 0], [0, -0.04, 0])],
            LeftUpperLeg: [key(0.12, [-35, 0, 0]), key(0.3, [10, 0, 0]), key(0.48, [-60, 0, 0]), key(0.68, [5, 0, 0]), key(0.8, [-25, 0, 0])],
            RightUpperLeg: [key(0.12, [-35, 0, 0]), key(0.3, [10, 0, 0]), key(0.48, [-60, 0, 0]), key(0.68, [5, 0, 0]), key(0.8, [-25, 0, 0])],
            LeftLowerLeg: [key(0.12, [45, 0, 0]), key(0.3, [-5, 0, 0]), key(0.48, [75, 0, 0]), key(0.68, [0, 0, 0]), key(0.8, [35, 0, 0])],
            RightLowerLeg: [key(0.12, [45, 0, 0]), key(0.3, [-5, 0, 0]), key(0.48, [75, 0, 0]), key(0.68, [0, 0, 0]), key(0.8, [35, 0, 0])],
            LeftUpperArm: [key(0.12, [25, 0, 0]), key(0.35, [-140, 0, 10]), key(0.5, [-150, 0, 10]), key(0.72, [-20, 0, 0]), key(0.85, [10, 0, 0])],
            RightUpperArm: [key(0.12, [25, 0, 0]), key(0.35, [-140, 0, -10]), key(0.5, [-150, 0, -10]), key(0.72, [-20, 0, 0]), key(0.85, [10, 0, 0])],
            Chest: [key(0.12, [12, 0, 0]), key(0.4, [-8, 0, 0]), key(0.8, [6, 0, 0])]
        }),
        // On a chair: the whole body down 0.75 tiles (a 3-tile character's hips come to
        // seat height), thighs level, shins straight down to the floor, hands on the knees.
        motion('sit', 'Sit', 'humanoid', 'action', 70, {
            Body: { rotate: [0, 0, 0], move: [0, -0.75, 0] },
            LeftUpperLeg: [-88, 0, 3],
            RightUpperLeg: [-88, 0, -3],
            LeftLowerLeg: [88, 0, 0],
            RightLowerLeg: [88, 0, 0],
            LeftUpperArm: [-22, 0, 4],
            RightUpperArm: [-22, 0, -4],
            LeftLowerArm: [-45, 0, 0],
            RightLowerArm: [-45, 0, 0],
            Chest: [4, 0, 0]
        }, { hold: true }),
        motion('overhead-strike', 'Overhead Strike', 'humanoid', 'action', 70, {
            // Up over the head (raised forward, tipped 30° in), down to chest height in front.
            RightUpperArm: [key(0.3, [-162.5, 9.8, 28.5]), key(0.5, [-55, 0, 0]), key(0.72, [-50, 0, 0])],
            RightLowerArm: [key(0.3, [-45, 0, 0]), key(0.5, [-8, 0, 0]), key(0.72, [-10, 0, 0])],
            Chest: [key(0.3, [-10, 0, 0]), key(0.5, [14, 0, 0]), key(0.72, [10, 0, 0])]
        }),
        // Coil across the body, sweep through, follow through.
        motion('slash', 'Slash', 'humanoid', 'action', 52, {
            // Level at the shoulder, swept about the vertical: the arm raised 84° forward and
            // turned 55° across the body, then 55° out, then 65° out and lower (worked out as
            // euler angles; a Y on the raised arm alone barely turns it).
            RightUpperArm: [key(0.25, [-84.2, 8.2, 54.6]), key(0.45, [-84.2, -8.2, -54.6]), key(0.7, [-76.3, -26.9, -61.7])],
            RightLowerArm: [key(0.25, [-35, 0, 0]), key(0.45, [-5, 0, 0]), key(0.7, [-10, 0, 0])],
            Chest: [key(0.25, [0, 28, 0]), key(0.45, [0, -22, 0]), key(0.7, [0, -16, 0])],
            Hips: [key(0.25, [0, 10, 0]), key(0.45, [0, -8, 0]), key(0.7, [0, -5, 0])]
        }),
        // Cock the arm, punch it straight out, hold the extension.
        motion('thrust', 'Thrust', 'humanoid', 'action', 48, {
            RightUpperArm: [key(0.3, [15, 10, 0]), key(0.5, [-85, 5, 0]), key(0.72, [-85, 5, 0])],
            RightLowerArm: [key(0.3, [-60, 0, 0]), key(0.5, [-2, 0, 0]), key(0.72, [-2, 0, 0])],
            LeftUpperArm: [key(0.3, [-10, 0, 0]), key(0.5, [22, 0, 0]), key(0.72, [18, 0, 0])],
            Chest: [key(0.3, [0, 20, 0]), key(0.5, [8, -14, 0]), key(0.72, [4, -10, 0])]
        }),
        // Held stances: fired once, they stay until another held stance
        // claims the same parts (Lower Arms lets go of all of them).
        // Fists in front of the chin, elbows in: the arm raised 45° forward, then turned 18°
        // in about the depth axis, the forearm raised 110° and tilted 40° in, worked out as
        // euler angles (a plain Y or Z on a raised limb moves the hand the wrong way).
        motion('guard', 'Guard', 'humanoid', 'action', 28, {
            RightUpperArm: [-43.6, -12.6, 12.9],
            RightLowerArm: [-115.4, 37.2, 16],
            LeftUpperArm: [-43.6, 12.6, -12.9],
            LeftLowerArm: [-115.4, -37.2, -16],
            Chest: [6, 0, 0],
            Head: [8, 0, 0]
        }, { hold: true }),
        motion('aim-rifle', 'Aim Rifle', 'humanoid', 'action', 36, {
            RightUpperArm: [-70, 20, 0],
            RightLowerArm: [-20, 0, 0],
            LeftUpperArm: [-60, -35, 0],
            LeftLowerArm: [-45, -15, 0],
            Chest: [0, 18, 0],
            Head: [-4, -14, 0]
        }, { hold: true }),
        motion('aim-pistol', 'Aim Pistol', 'humanoid', 'action', 32, {
            RightUpperArm: [-82, 8, 0],
            RightLowerArm: [-4, 0, 0],
            LeftUpperArm: [0, 0, 0],
            LeftLowerArm: [0, 0, 0],
            Chest: [0, 24, 0],
            Head: [0, -18, 0]
        }, { hold: true }),
        motion('dual-wield', 'Dual Wield', 'humanoid', 'action', 32, {
            RightUpperArm: [-80, 14, 0],
            RightLowerArm: [-6, 0, 0],
            LeftUpperArm: [-80, -14, 0],
            LeftLowerArm: [-6, 0, 0],
            Chest: [-3, 0, 0],
            Head: [0, 0, 0]
        }, { hold: true }),
        motion('lower-arms', 'Lower Arms', 'humanoid', 'action', 36, {
            RightUpperArm: [0, 0, 0],
            RightLowerArm: [0, 0, 0],
            LeftUpperArm: [0, 0, 0],
            LeftLowerArm: [0, 0, 0],
            Chest: [0, 0, 0],
            Head: [0, 0, 0]
        }, { hold: true }),
        // ── Quadruped ───────────────────────────────────────────────
        motion('quad-walk', 'Walk', 'quadruped', 'moving', 44, {
            LeftFrontUpperLeg: osc('x', 26, 0),
            RightRearUpperLeg: osc('x', 26, 0),
            RightFrontUpperLeg: osc('x', 26, 0.5),
            LeftRearUpperLeg: osc('x', 26, 0.5),
            LeftFrontLowerLeg: osc('x', 18, 0.72, [18, 0, 0]),
            RightRearLowerLeg: osc('x', 18, 0.72, [18, 0, 0]),
            RightFrontLowerLeg: osc('x', 18, 0.22, [18, 0, 0]),
            LeftRearLowerLeg: osc('x', 18, 0.22, [18, 0, 0]),
            Neck: osc('x', 4, 0.25),
            Body: bob(0.015)
        }),
        motion('idle-sway', 'Idle Sway', 'quadruped', 'idle', 180, {
            Tail: osc('y', 18, 0, [0, 0, 0], 2),
            Neck: osc('x', 3, 0.3),
            Head: osc('y', 6, 0.6)
        }),
        motion('pounce', 'Pounce', 'quadruped', 'action', 60, {
            Chest: [key(0.3, [-16, 0, 0]), key(0.55, [12, 0, 0])],
            Head: [key(0.3, [-12, 0, 0]), key(0.55, [6, 0, 0])],
            Tail: [key(0.3, [20, 0, 0]), key(0.55, [-10, 0, 0])]
        }),
        // ── Plant / Tree ────────────────────────────────────────────
        motion('wind-sway', 'Wind Sway', 'plant', 'always', 320, {
            Trunk: osc('z', 3.5),
            Crown: osc('z', 6, 0.12)
        }),
        motion('rustle', 'Rustle', 'plant', 'action', 50, {
            Crown: [key(0.2, [0, 0, 8]), key(0.45, [0, 0, -8]), key(0.65, [0, 0, 5]), key(0.85, [0, 0, -3])]
        }),
        // ── Vehicle ─────────────────────────────────────────────────
        // Wheels turn by the distance travelled: spins, not keyed poses.
        { id: 'roll', name: 'Roll', template: 'vehicle', trigger: 'moving', frames: 60, rules: ['FrontLeftWheel', 'FrontRightWheel', 'RearLeftWheel', 'RearRightWheel']
            .map(part => ({ name: 'Roll', part, type: 'spin', axis: 'x', trigger: 'moving', perTile: 120 })) },
        { id: 'engine-bounce', name: 'Bounce', template: 'vehicle', trigger: 'idle', frames: 60, rules: [
            { name: 'Bounce', part: '', type: 'bob', axis: 'y', amount: 0.006, period: 60, trigger: 'idle' }
        ] }
    ];

    /** The preset a rig plays on its own in each state it has no motion for. */
    const DEFAULTS = {
        humanoid: { idle: 'breathe', walking: 'walk', dashing: 'run', jumping: 'jump', swimming: 'swim', treading: 'tread', climbing: 'climb' },
        quadruped: { idle: 'idle-sway', walking: 'quad-walk', dashing: 'quad-walk' }
    };

    /**
     * Whether a model's own rules already cover a state: a rule (a clip or a
     * motion) on its trigger, or on "moving" for walking and dashing.
     */
    function covers(rules, state) {
        return rules.some(rule => rule && rule.trigger && (rule.trigger === state
            || (rule.trigger === 'moving' && (state === 'walking' || state === 'dashing'))
            // A swim clip also plays while floating still when there is no tread clip.
            || (state === 'treading' && rule.trigger === 'swimming' && rule.type === 'clip')));
    }

    /**
     * The default rules a rigged model plays: for each state of its
     * template the model has no motion of its own for, that state's preset.
     * A preset laid on two states (a quadruped's walk) is taken once.
     */
    function defaultRules(template, rules) {
        const table = DEFAULTS[template];
        if (!table) return [];
        const out = [], taken = new Set();
        for (const [state, id] of Object.entries(table)) {
            if (covers(rules || [], state) || taken.has(id)) continue;
            const preset = PRESETS.find(entry => entry.id === id && entry.template === template);
            if (!preset) continue;
            taken.add(id);
            for (const rule of preset.rules) out.push(Object.assign(JSON.parse(JSON.stringify(rule)), { defaultMotion: true }));
        }
        return out;
    }

    const api = {
        PRESETS,
        DEFAULTS,
        covers,
        defaultRules,
        forTemplate(template) {
            return PRESETS.filter(preset => preset.template === template);
        },
        byId(id) {
            return PRESETS.find(preset => preset.id === id) || null;
        }
    };

    root.RigMotionPresets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
