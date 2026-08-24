/**
 * RigMotionPresets - plug-and-play motions for the standard rig
 * templates. A preset is nothing but sidecar animation rules aimed at
 * the template's bone names: applying one drops ordinary rules into the
 * model's Animations list, where every one is editable, deletable, and
 * previewable like anything authored by hand. Walks are phase-offset
 * swings sharing one period; gestures are keyframed pose timelines; a
 * shared action name fires a whole multi-bone motion at once.
 *
 * Rotations assume the templates' canonical facing (character toward
 * +Z, arms hanging down). Models exported facing elsewhere still work —
 * the preset is a starting point and the card edits every value.
 */
(function(root) {
    'use strict';

    const rule = (name, part, extra) => Object.assign({ name, part, type: 'pose' }, extra);
    const swing = (name, part, axis, degrees, period, phase, trigger) =>
        rule(name, part, { type: 'swing', axis, degrees, period, phase, trigger });
    const key = (at, rotate, move, resize) => {
        const stop = { at, rotate };
        if (move) stop.move = move;
        if (resize) stop.resize = resize;
        return stop;
    };

    const walkCycle = (name, trigger, period, hip, knee, arm, bobAmount) => [
        swing(name, 'LeftUpperLeg', 'x', hip, period, 0.5, trigger),
        swing(name, 'RightUpperLeg', 'x', hip, period, 0, trigger),
        swing(name, 'LeftLowerLeg', 'x', knee, period, 0.72, trigger),
        swing(name, 'RightLowerLeg', 'x', knee, period, 0.22, trigger),
        swing(name, 'LeftUpperArm', 'x', arm, period, 0, trigger),
        swing(name, 'RightUpperArm', 'x', arm, period, 0.5, trigger),
        swing(name, 'Chest', 'y', 5, period, 0.25, trigger),
        rule(name, '', { type: 'bob', axis: 'y', amount: bobAmount, period: Math.round(period / 2), trigger })
    ];

    const PRESETS = [
        // ── Humanoid ────────────────────────────────────────────────
        { id: 'walk', name: 'Walk', template: 'humanoid',
          rules: walkCycle('Walk', 'moving', 44, 32, 22, 28, 0.02) },
        { id: 'run', name: 'Run', template: 'humanoid',
          rules: walkCycle('Run', 'moving', 26, 46, 34, 42, 0.045) },
        { id: 'breathe', name: 'Breathe', template: 'humanoid', rules: [
            swing('Breathe', 'Chest', 'x', 2.5, 150, 0, 'idle'),
            swing('Breathe', 'LeftUpperArm', 'x', 3, 150, 0.5, 'idle'),
            swing('Breathe', 'RightUpperArm', 'x', 3, 150, 0.5, 'idle'),
            swing('Breathe', 'Head', 'x', 2, 150, 0.3, 'idle')
        ] },
        { id: 'wave', name: 'Wave', template: 'humanoid', rules: [
            rule('Wave', 'RightUpperArm', { trigger: 'action', period: 45, keys: [
                key(0.25, [0, 0, 140]), key(0.75, [0, 0, 140])
            ] }),
            rule('Wave', 'RightLowerArm', { trigger: 'action', period: 45, keys: [
                key(0.3, [0, 0, 25]), key(0.45, [0, 0, -25]),
                key(0.6, [0, 0, 25]), key(0.72, [0, 0, -15])
            ] })
        ] },
        { id: 'bow', name: 'Take a Bow', template: 'humanoid', rules: [
            rule('Take a Bow', 'Spine', { trigger: 'action', period: 50, keys: [
                key(0.35, [35, 0, 0]), key(0.65, [35, 0, 0])
            ] }),
            rule('Take a Bow', 'Chest', { trigger: 'action', period: 50, keys: [
                key(0.35, [15, 0, 0]), key(0.65, [15, 0, 0])
            ] }),
            rule('Take a Bow', 'Head', { trigger: 'action', period: 50, keys: [
                key(0.35, [12, 0, 0]), key(0.65, [12, 0, 0])
            ] })
        ] },
        { id: 'nod', name: 'Nod', template: 'humanoid', rules: [
            rule('Nod', 'Head', { trigger: 'action', period: 30, keys: [
                key(0.25, [18, 0, 0]), key(0.5, [2, 0, 0]), key(0.75, [18, 0, 0])
            ] })
        ] },
        { id: 'shake-head', name: 'Shake Head', template: 'humanoid', rules: [
            rule('Shake Head', 'Head', { trigger: 'action', period: 30, keys: [
                key(0.2, [0, 24, 0]), key(0.45, [0, -24, 0]),
                key(0.7, [0, 24, 0]), key(0.85, [0, -12, 0])
            ] })
        ] },
        { id: 'sit', name: 'Sit', template: 'humanoid', rules: [
            rule('Sit', 'Hips', { trigger: 'action', period: 35, hold: true, move: [0, -0.28, 0], rotate: [0, 0, 0] }),
            rule('Sit', 'LeftUpperLeg', { trigger: 'action', period: 35, hold: true, rotate: [-80, 0, 0] }),
            rule('Sit', 'RightUpperLeg', { trigger: 'action', period: 35, hold: true, rotate: [-80, 0, 0] }),
            rule('Sit', 'LeftLowerLeg', { trigger: 'action', period: 35, hold: true, rotate: [85, 0, 0] }),
            rule('Sit', 'RightLowerLeg', { trigger: 'action', period: 35, hold: true, rotate: [85, 0, 0] })
        ] },
        { id: 'overhead-strike', name: 'Overhead Strike', template: 'humanoid', rules: [
            rule('Overhead Strike', 'RightUpperArm', { trigger: 'action', period: 35, keys: [
                key(0.3, [-150, 0, 0]), key(0.5, [-20, 0, 0]), key(0.72, [-20, 0, 0])
            ] }),
            rule('Overhead Strike', 'RightLowerArm', { trigger: 'action', period: 35, keys: [
                key(0.3, [-45, 0, 0]), key(0.5, [-8, 0, 0]), key(0.72, [-8, 0, 0])
            ] }),
            rule('Overhead Strike', 'Chest', { trigger: 'action', period: 35, keys: [
                key(0.3, [-10, 0, 0]), key(0.5, [14, 0, 0]), key(0.72, [10, 0, 0])
            ] })
        ] },
        { id: 'jump', name: 'Jump', template: 'humanoid', rules: [
            // Root motion: crouch dip, launch, hang at the apex, land dip.
            rule('Jump', '', { trigger: 'action', period: 28, keys: [
                key(0.12, [0, 0, 0], [0, -0.05, 0]),
                key(0.32, [0, 0, 0], [0, 0.4, 0]),
                key(0.48, [0, 0, 0], [0, 0.52, 0]),
                key(0.68, [0, 0, 0], [0, 0.02, 0]),
                key(0.8, [0, 0, 0], [0, -0.04, 0])
            ] }),
            rule('Jump', 'LeftUpperLeg', { trigger: 'action', period: 28, keys: [
                key(0.12, [-35, 0, 0]), key(0.3, [10, 0, 0]), key(0.48, [-70, 0, 0]),
                key(0.68, [5, 0, 0]), key(0.8, [-25, 0, 0])
            ] }),
            rule('Jump', 'RightUpperLeg', { trigger: 'action', period: 28, keys: [
                key(0.12, [-35, 0, 0]), key(0.3, [10, 0, 0]), key(0.48, [-70, 0, 0]),
                key(0.68, [5, 0, 0]), key(0.8, [-25, 0, 0])
            ] }),
            rule('Jump', 'LeftLowerLeg', { trigger: 'action', period: 28, keys: [
                key(0.12, [45, 0, 0]), key(0.3, [-5, 0, 0]), key(0.48, [80, 0, 0]),
                key(0.68, [0, 0, 0]), key(0.8, [35, 0, 0])
            ] }),
            rule('Jump', 'RightLowerLeg', { trigger: 'action', period: 28, keys: [
                key(0.12, [45, 0, 0]), key(0.3, [-5, 0, 0]), key(0.48, [80, 0, 0]),
                key(0.68, [0, 0, 0]), key(0.8, [35, 0, 0])
            ] }),
            rule('Jump', 'LeftUpperArm', { trigger: 'action', period: 28, keys: [
                key(0.12, [25, 0, 0]), key(0.35, [-150, 0, 0]), key(0.5, [-160, 0, 0]),
                key(0.72, [-20, 0, 0]), key(0.85, [10, 0, 0])
            ] }),
            rule('Jump', 'RightUpperArm', { trigger: 'action', period: 28, keys: [
                key(0.12, [25, 0, 0]), key(0.35, [-150, 0, 0]), key(0.5, [-160, 0, 0]),
                key(0.72, [-20, 0, 0]), key(0.85, [10, 0, 0])
            ] }),
            rule('Jump', 'Chest', { trigger: 'action', period: 28, keys: [
                key(0.12, [12, 0, 0]), key(0.4, [-8, 0, 0]), key(0.8, [6, 0, 0])
            ] })
        ] },
        { id: 'slash', name: 'Slash', template: 'humanoid', rules: [
            // Coil across the body, sweep through, follow through.
            rule('Slash', 'RightUpperArm', { trigger: 'action', period: 26, keys: [
                key(0.25, [-60, -55, 0]), key(0.45, [-75, 45, 0]), key(0.7, [-40, 55, 0])
            ] }),
            rule('Slash', 'RightLowerArm', { trigger: 'action', period: 26, keys: [
                key(0.25, [-35, 0, 0]), key(0.45, [-5, 0, 0]), key(0.7, [-10, 0, 0])
            ] }),
            rule('Slash', 'Chest', { trigger: 'action', period: 26, keys: [
                key(0.25, [0, -28, 0]), key(0.45, [0, 22, 0]), key(0.7, [0, 16, 0])
            ] }),
            rule('Slash', 'Hips', { trigger: 'action', period: 26, keys: [
                key(0.25, [0, -10, 0]), key(0.45, [0, 8, 0]), key(0.7, [0, 5, 0])
            ] })
        ] },
        { id: 'thrust', name: 'Thrust', template: 'humanoid', rules: [
            // Cock the arm, punch it straight out, hold the extension.
            rule('Thrust', 'RightUpperArm', { trigger: 'action', period: 24, keys: [
                key(0.3, [15, -10, 0]), key(0.5, [-85, -5, 0]), key(0.72, [-85, -5, 0])
            ] }),
            rule('Thrust', 'RightLowerArm', { trigger: 'action', period: 24, keys: [
                key(0.3, [-60, 0, 0]), key(0.5, [-2, 0, 0]), key(0.72, [-2, 0, 0])
            ] }),
            rule('Thrust', 'LeftUpperArm', { trigger: 'action', period: 24, keys: [
                key(0.3, [-10, 0, 0]), key(0.5, [22, 0, 0]), key(0.72, [18, 0, 0])
            ] }),
            rule('Thrust', 'Chest', { trigger: 'action', period: 24, keys: [
                key(0.3, [0, -20, 0]), key(0.5, [8, 14, 0]), key(0.72, [4, 10, 0])
            ] })
        ] },
        { id: 'guard', name: 'Guard', template: 'humanoid', rules: [
            // A held block: forearms raised across the chest until Lower
            // Arms (or another held stance) takes over.
            rule('Guard', 'RightUpperArm', { trigger: 'action', period: 14, hold: true, rotate: [-45, -20, 0] }),
            rule('Guard', 'RightLowerArm', { trigger: 'action', period: 14, hold: true, rotate: [-100, 0, 0] }),
            rule('Guard', 'LeftUpperArm', { trigger: 'action', period: 14, hold: true, rotate: [-45, 20, 0] }),
            rule('Guard', 'LeftLowerArm', { trigger: 'action', period: 14, hold: true, rotate: [-100, 0, 0] }),
            rule('Guard', 'Chest', { trigger: 'action', period: 14, hold: true, rotate: [6, 0, 0] }),
            rule('Guard', 'Head', { trigger: 'action', period: 14, hold: true, rotate: [8, 0, 0] })
        ] },
        // Aiming stances are HELD poses: fire one and it stays until
        // another held pose claims the same bones — which is exactly what
        // Lower Arms is (it releases Guard too). Signs assume the
        // canonical +Z facing.
        { id: 'aim-rifle', name: 'Aim Rifle', template: 'humanoid', rules: [
            rule('Aim Rifle', 'RightUpperArm', { trigger: 'action', period: 18, hold: true, rotate: [-70, -20, 0] }),
            rule('Aim Rifle', 'RightLowerArm', { trigger: 'action', period: 18, hold: true, rotate: [-20, 0, 0] }),
            rule('Aim Rifle', 'LeftUpperArm', { trigger: 'action', period: 18, hold: true, rotate: [-60, 35, 0] }),
            rule('Aim Rifle', 'LeftLowerArm', { trigger: 'action', period: 18, hold: true, rotate: [-45, 15, 0] }),
            rule('Aim Rifle', 'Chest', { trigger: 'action', period: 18, hold: true, rotate: [0, -18, 0] }),
            rule('Aim Rifle', 'Head', { trigger: 'action', period: 18, hold: true, rotate: [-4, 14, 0] })
        ] },
        { id: 'aim-pistol', name: 'Aim Pistol', template: 'humanoid', rules: [
            rule('Aim Pistol', 'RightUpperArm', { trigger: 'action', period: 16, hold: true, rotate: [-82, -8, 0] }),
            rule('Aim Pistol', 'RightLowerArm', { trigger: 'action', period: 16, hold: true, rotate: [-4, 0, 0] }),
            rule('Aim Pistol', 'LeftUpperArm', { trigger: 'action', period: 16, hold: true, rotate: [0, 0, 0] }),
            rule('Aim Pistol', 'LeftLowerArm', { trigger: 'action', period: 16, hold: true, rotate: [0, 0, 0] }),
            rule('Aim Pistol', 'Chest', { trigger: 'action', period: 16, hold: true, rotate: [0, -24, 0] }),
            rule('Aim Pistol', 'Head', { trigger: 'action', period: 16, hold: true, rotate: [0, 18, 0] })
        ] },
        { id: 'dual-wield', name: 'Dual Wield', template: 'humanoid', rules: [
            rule('Dual Wield', 'RightUpperArm', { trigger: 'action', period: 16, hold: true, rotate: [-80, -14, 0] }),
            rule('Dual Wield', 'RightLowerArm', { trigger: 'action', period: 16, hold: true, rotate: [-6, 0, 0] }),
            rule('Dual Wield', 'LeftUpperArm', { trigger: 'action', period: 16, hold: true, rotate: [-80, 14, 0] }),
            rule('Dual Wield', 'LeftLowerArm', { trigger: 'action', period: 16, hold: true, rotate: [-6, 0, 0] }),
            rule('Dual Wield', 'Chest', { trigger: 'action', period: 16, hold: true, rotate: [-3, 0, 0] }),
            rule('Dual Wield', 'Head', { trigger: 'action', period: 16, hold: true, rotate: [0, 0, 0] })
        ] },
        { id: 'lower-arms', name: 'Lower Arms', template: 'humanoid', rules: [
            rule('Lower Arms', 'RightUpperArm', { trigger: 'action', period: 18, hold: true, rotate: [0, 0, 0] }),
            rule('Lower Arms', 'RightLowerArm', { trigger: 'action', period: 18, hold: true, rotate: [0, 0, 0] }),
            rule('Lower Arms', 'LeftUpperArm', { trigger: 'action', period: 18, hold: true, rotate: [0, 0, 0] }),
            rule('Lower Arms', 'LeftLowerArm', { trigger: 'action', period: 18, hold: true, rotate: [0, 0, 0] }),
            rule('Lower Arms', 'Chest', { trigger: 'action', period: 18, hold: true, rotate: [0, 0, 0] }),
            rule('Lower Arms', 'Head', { trigger: 'action', period: 18, hold: true, rotate: [0, 0, 0] })
        ] },
        // A swimmer's whole mode: prone while moving (Swim) and treading
        // in place while idle (Float). A model carries Walk or Swim on
        // the moving trigger, not both.
        { id: 'swim', name: 'Swim', template: 'humanoid', rules: [
            rule('Swim', '', { trigger: 'moving', period: 30, rotate: [-80, 0, 0], move: [0, 0.55, 0] }),
            rule('Swim', 'Head', { trigger: 'moving', period: 30, rotate: [-40, 0, 0] }),
            swing('Swim', 'LeftUpperArm', 'x', 55, 64, 0, 'moving'),
            swing('Swim', 'RightUpperArm', 'x', 55, 64, 0.5, 'moving'),
            swing('Swim', 'LeftLowerArm', 'x', 30, 64, 0.2, 'moving'),
            swing('Swim', 'RightLowerArm', 'x', 30, 64, 0.7, 'moving'),
            swing('Swim', 'LeftUpperLeg', 'x', 16, 30, 0, 'moving'),
            swing('Swim', 'RightUpperLeg', 'x', 16, 30, 0.5, 'moving'),
            rule('Swim', '', { type: 'bob', axis: 'y', amount: 0.03, period: 80, trigger: 'moving' })
        ] },
        { id: 'float', name: 'Float', template: 'humanoid', rules: [
            rule('Float', '', { trigger: 'idle', period: 40, rotate: [-80, 0, 0], move: [0, 0.5, 0] }),
            rule('Float', 'Head', { trigger: 'idle', period: 40, rotate: [-40, 0, 0] }),
            rule('Float', '', { type: 'bob', axis: 'y', amount: 0.04, period: 90, trigger: 'idle' }),
            swing('Float', 'LeftUpperArm', 'z', 8, 120, 0, 'idle'),
            swing('Float', 'RightUpperArm', 'z', 8, 120, 0.5, 'idle'),
            swing('Float', 'LeftUpperLeg', 'x', 6, 100, 0, 'idle'),
            swing('Float', 'RightUpperLeg', 'x', 6, 100, 0.5, 'idle')
        ] },
        // ── Quadruped ───────────────────────────────────────────────
        { id: 'quad-walk', name: 'Walk', template: 'quadruped', rules: [
            swing('Walk', 'LeftFrontUpperLeg', 'x', 26, 44, 0, 'moving'),
            swing('Walk', 'RightRearUpperLeg', 'x', 26, 44, 0, 'moving'),
            swing('Walk', 'RightFrontUpperLeg', 'x', 26, 44, 0.5, 'moving'),
            swing('Walk', 'LeftRearUpperLeg', 'x', 26, 44, 0.5, 'moving'),
            swing('Walk', 'LeftFrontLowerLeg', 'x', 18, 44, 0.72, 'moving'),
            swing('Walk', 'RightRearLowerLeg', 'x', 18, 44, 0.72, 'moving'),
            swing('Walk', 'RightFrontLowerLeg', 'x', 18, 44, 0.22, 'moving'),
            swing('Walk', 'LeftRearLowerLeg', 'x', 18, 44, 0.22, 'moving'),
            swing('Walk', 'Neck', 'x', 4, 44, 0.25, 'moving'),
            rule('Walk', '', { type: 'bob', axis: 'y', amount: 0.015, period: 22, trigger: 'moving' })
        ] },
        { id: 'idle-sway', name: 'Idle Sway', template: 'quadruped', rules: [
            swing('Idle Sway', 'Tail', 'y', 18, 90, 0, 'idle'),
            swing('Idle Sway', 'Neck', 'x', 3, 130, 0.3, 'idle'),
            swing('Idle Sway', 'Head', 'y', 6, 170, 0.6, 'idle')
        ] },
        { id: 'pounce', name: 'Pounce', template: 'quadruped', rules: [
            rule('Pounce', 'Chest', { trigger: 'action', period: 30, keys: [
                key(0.3, [-16, 0, 0]), key(0.55, [12, 0, 0])
            ] }),
            rule('Pounce', 'Head', { trigger: 'action', period: 30, keys: [
                key(0.3, [-12, 0, 0]), key(0.55, [6, 0, 0])
            ] }),
            rule('Pounce', 'Tail', { trigger: 'action', period: 30, keys: [
                key(0.3, [20, 0, 0]), key(0.55, [-10, 0, 0])
            ] })
        ] },
        // ── Plant / Tree ────────────────────────────────────────────
        { id: 'wind-sway', name: 'Wind Sway', template: 'plant', rules: [
            swing('Wind Sway', 'Trunk', 'z', 3.5, 160, 0, 'always'),
            swing('Wind Sway', 'Crown', 'z', 6, 160, 0.12, 'always'),
            swing('Wind Sway', 'Crown', 'x', 3, 190, 0.4, 'always')
        ] },
        { id: 'rustle', name: 'Rustle', template: 'plant', rules: [
            rule('Rustle', 'Crown', { trigger: 'action', period: 25, keys: [
                key(0.2, [0, 0, 8]), key(0.45, [0, 0, -8]),
                key(0.65, [0, 0, 5], null, [1.04, 1.02, 1.04]), key(0.85, [0, 0, -3])
            ] })
        ] },
        // ── Vehicle ─────────────────────────────────────────────────
        { id: 'roll', name: 'Roll', template: 'vehicle', rules: [
            rule('Roll', 'FrontLeftWheel', { type: 'spin', axis: 'x', trigger: 'moving', perTile: 120 }),
            rule('Roll', 'FrontRightWheel', { type: 'spin', axis: 'x', trigger: 'moving', perTile: 120 }),
            rule('Roll', 'RearLeftWheel', { type: 'spin', axis: 'x', trigger: 'moving', perTile: 120 }),
            rule('Roll', 'RearRightWheel', { type: 'spin', axis: 'x', trigger: 'moving', perTile: 120 })
        ] },
        { id: 'engine-bounce', name: 'Bounce', template: 'vehicle', rules: [
            rule('Bounce', '', { type: 'bob', axis: 'y', amount: 0.006, period: 60, trigger: 'idle' })
        ] }
    ];

    const api = {
        PRESETS,
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
