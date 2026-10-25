/**
 * RRHumanTargets - the Character Builder's slider catalog, shared by the
 * pack builder (build-scripts/build-human-pack.cjs, which converts the named
 * MakeHuman targets) and the body (HumanBody.js, which blends them).
 *
 * A paired slider runs -1..1 over its natural range, blending its decrease
 * target below zero and its increase target above; past ±1 the target is
 * carried further (extrapolated), up to `extreme`. A one-sided slider runs
 * 0..1 (and on to `extreme`). Files name MakeHuman targets without the
 * `.target` suffix; an `l-`/`r-` pair is written once with `{s}`.
 */
(function(root) {
    'use strict';

    // [key, label, section, decrease files, increase files, extreme (how far past natural), basic]
    const PAIRED = [
        // Body
        ['torsoLength', 'Torso length', 'Proportions', ['measure/measure-napetowaist-dist-decr'], ['measure/measure-napetowaist-dist-incr'], 2.5, true],
        ['legLength', 'Leg length', 'Proportions', ['measure/measure-upperleg-height-decr', 'armslegs/lowerlegs-height-decr'], ['measure/measure-upperleg-height-incr', 'armslegs/lowerlegs-height-incr'], 2.5, true],
        ['armLength', 'Arm length', 'Proportions', ['measure/measure-upperarm-length-decr', 'measure/measure-lowerarm-length-decr'], ['measure/measure-upperarm-length-incr', 'measure/measure-lowerarm-length-incr'], 2.5, true],
        ['neckLength', 'Neck length', 'Proportions', ['neck/neck-scale-vert-decr'], ['neck/neck-scale-vert-incr'], 2.5],
        ['handSize', 'Hand size', 'Proportions', ['armslegs/{s}-hand-scale-decr'], ['armslegs/{s}-hand-scale-incr'], 3],
        ['fingerLength', 'Finger length', 'Proportions', ['armslegs/{s}-hand-fingers-length-decr'], ['armslegs/{s}-hand-fingers-length-incr'], 3],
        ['footSize', 'Foot size', 'Proportions', ['armslegs/{s}-foot-scale-decr'], ['armslegs/{s}-foot-scale-incr'], 3, true],
        ['footLength', 'Foot length', 'Proportions', ['armslegs/{s}-foot-scale-depth-decr'], ['armslegs/{s}-foot-scale-depth-incr'], 3, true],
        ['footWidth', 'Foot width', 'Proportions', ['armslegs/{s}-foot-scale-horiz-decr'], ['armslegs/{s}-foot-scale-horiz-incr'], 3],

        ['shoulders', 'Shoulders', 'Torso', ['torso/torso-scale-horiz-decr'], ['torso/torso-scale-horiz-incr'], 2.5, true],
        ['chest', 'Chest depth', 'Torso', ['torso/torso-scale-depth-decr'], ['torso/torso-scale-depth-incr'], 2.5],
        ['pecs', 'Pecs', 'Torso', ['torso/torso-muscle-pectoral-decr'], ['torso/torso-muscle-pectoral-incr'], 3, true],
        ['vshape', 'V-taper', 'Torso', ['torso/torso-vshape-decr'], ['torso/torso-vshape-incr'], 3],
        ['lats', 'Back muscle', 'Torso', ['torso/torso-muscle-dorsi-decr'], ['torso/torso-muscle-dorsi-incr'], 3],
        ['waist', 'Waist', 'Torso', ['measure/measure-waist-circ-decr'], ['measure/measure-waist-circ-incr'], 3, true],
        ['belly', 'Belly', 'Torso', ['stomach/stomach-pregnant-decr'], ['stomach/stomach-pregnant-incr'], 4, true],
        ['abs', 'Belly tone', 'Torso', ['stomach/stomach-tone-decr'], ['stomach/stomach-tone-incr'], 2],
        ['hips', 'Hips', 'Torso', ['hip/hip-scale-horiz-decr'], ['hip/hip-scale-horiz-incr'], 3, true],
        ['butt', 'Butt', 'Torso', ['buttocks/buttocks-volume-decr'], ['buttocks/buttocks-volume-incr'], 4, true],

        ['breastSpacing', 'Breast spacing', 'Bust', ['breast/breast-dist-decr'], ['breast/breast-dist-incr'], 2],
        ['breastHeight', 'Breast height', 'Bust', ['breast/breast-trans-down'], ['breast/breast-trans-up'], 2],
        ['breastPoint', 'Breast point', 'Bust', ['breast/breast-point-decr'], ['breast/breast-point-incr'], 2.5],
        ['breastFullness', 'Upper fullness', 'Bust', ['breast/breast-volume-vert-down'], ['breast/breast-volume-vert-up'], 2.5],

        ['upperArmFat', 'Upper arm fat', 'Arms and legs', ['armslegs/{s}-upperarm-fat-decr'], ['armslegs/{s}-upperarm-fat-incr'], 4],
        ['upperArmMuscle', 'Biceps', 'Arms and legs', ['armslegs/{s}-upperarm-muscle-decr'], ['armslegs/{s}-upperarm-muscle-incr'], 4, true],
        ['shoulderMuscle', 'Deltoids', 'Arms and legs', ['armslegs/{s}-upperarm-shoulder-muscle-decr'], ['armslegs/{s}-upperarm-shoulder-muscle-incr'], 4],
        ['forearmFat', 'Forearm fat', 'Arms and legs', ['armslegs/{s}-lowerarm-fat-decr'], ['armslegs/{s}-lowerarm-fat-incr'], 4],
        ['forearmMuscle', 'Forearms', 'Arms and legs', ['armslegs/{s}-lowerarm-muscle-decr'], ['armslegs/{s}-lowerarm-muscle-incr'], 4],
        ['thighFat', 'Thigh fat', 'Arms and legs', ['armslegs/{s}-upperleg-fat-decr'], ['armslegs/{s}-upperleg-fat-incr'], 4, true],
        ['thighMuscle', 'Thigh muscle', 'Arms and legs', ['armslegs/{s}-upperleg-muscle-decr'], ['armslegs/{s}-upperleg-muscle-incr'], 4, true],
        ['calfFat', 'Calf fat', 'Arms and legs', ['armslegs/{s}-lowerleg-fat-decr'], ['armslegs/{s}-lowerleg-fat-incr'], 4, true],
        ['calfMuscle', 'Calf muscle', 'Arms and legs', ['armslegs/{s}-lowerleg-muscle-decr'], ['armslegs/{s}-lowerleg-muscle-incr'], 4, true],
        ['bowLegs', 'Knees', 'Arms and legs', ['armslegs/{s}-leg-valgus-decr'], ['armslegs/{s}-leg-valgus-incr'], 2],

        ['neck', 'Neck thickness', 'Head and neck', ['neck/neck-scale-horiz-decr'], ['neck/neck-scale-horiz-incr'], 3],
        ['doubleChin', 'Double chin', 'Head and neck', ['neck/neck-double-decr'], ['neck/neck-double-incr'], 3],
        ['headFat', 'Face fullness', 'Head and neck', ['head/head-fat-decr'], ['head/head-fat-incr'], 3, true],
        ['headWidth', 'Head width', 'Head and neck', ['head/head-scale-horiz-decr'], ['head/head-scale-horiz-incr'], 2.5],
        ['headHeight', 'Head height', 'Head and neck', ['head/head-scale-vert-decr'], ['head/head-scale-vert-incr'], 2.5],
        ['headDepth', 'Head depth', 'Head and neck', ['head/head-scale-depth-decr'], ['head/head-scale-depth-incr'], 2.5],
        ['headAge', 'Face age', 'Head and neck', ['head/head-age-decr'], ['head/head-age-incr'], 2],
        ['headBack', 'Back of head', 'Head and neck', ['head/head-back-scale-depth-decr'], ['head/head-back-scale-depth-incr'], 2.5],

        ['foreheadHeight', 'Forehead height', 'Forehead and brows', ['forehead/forehead-scale-vert-decr'], ['forehead/forehead-scale-vert-incr'], 2.5],
        ['browRidge', 'Brow ridge', 'Forehead and brows', ['forehead/forehead-nubian-decr'], ['forehead/forehead-nubian-incr'], 3, true],
        ['temples', 'Temples', 'Forehead and brows', ['forehead/forehead-temple-decr'], ['forehead/forehead-temple-incr'], 2.5],
        ['browHeight', 'Brow height', 'Forehead and brows', ['eyebrows/eyebrows-trans-down'], ['eyebrows/eyebrows-trans-up'], 2.5],
        ['browAngle', 'Brow angle', 'Forehead and brows', ['eyebrows/eyebrows-angle-down'], ['eyebrows/eyebrows-angle-up'], 2.5],

        ['eyeSize', 'Eye size', 'Eyes', ['eyes/{s}-eye-scale-decr'], ['eyes/{s}-eye-scale-incr'], 4, true],
        ['eyeHeight', 'Eye height', 'Eyes', ['eyes/{s}-eye-trans-down'], ['eyes/{s}-eye-trans-up'], 2.5],
        ['eyeSpacing', 'Eye spacing', 'Eyes', ['eyes/{s}-eye-trans-in'], ['eyes/{s}-eye-trans-out'], 2.5, true],
        ['eyeSlant', 'Eye slant', 'Eyes', ['eyes/{s}-eye-eyefold-angle-down'], ['eyes/{s}-eye-eyefold-angle-up'], 2.5],
        ['eyeOpen', 'Eye opening', 'Eyes', ['eyes/{s}-eye-height2-decr'], ['eyes/{s}-eye-height2-incr'], 2.5],
        ['eyeBags', 'Eye bags', 'Eyes', ['eyes/{s}-eye-bag-decr'], ['eyes/{s}-eye-bag-incr'], 2.5],
        ['eyeFold', 'Eyelid fold', 'Eyes', ['eyes/{s}-eye-epicanthus-in'], ['eyes/{s}-eye-epicanthus-out'], 2],

        ['noseWidth', 'Nose width', 'Nose', ['nose/nose-scale-horiz-decr'], ['nose/nose-scale-horiz-incr'], 3, true],
        ['noseLength', 'Nose length', 'Nose', ['nose/nose-scale-vert-decr'], ['nose/nose-scale-vert-incr'], 3, true],
        ['noseHump', 'Nose bridge', 'Nose', ['nose/nose-hump-decr'], ['nose/nose-hump-incr'], 3],
        ['noseDepth', 'Nose size', 'Nose', ['nose/nose-scale-depth-decr'], ['nose/nose-scale-depth-incr'], 3],
        ['noseTip', 'Nose tip', 'Nose', ['nose/nose-point-down'], ['nose/nose-point-up'], 2.5],
        ['noseCurve', 'Nose curve', 'Nose', ['nose/nose-curve-concave'], ['nose/nose-curve-convex'], 2.5],
        ['nostrils', 'Nostrils', 'Nose', ['nose/nose-flaring-decr'], ['nose/nose-flaring-incr'], 3],
        ['noseVolume', 'Nose volume', 'Nose', ['nose/nose-volume-decr'], ['nose/nose-volume-incr'], 3],

        ['mouthWidth', 'Mouth width', 'Mouth and jaw', ['mouth/mouth-scale-horiz-decr'], ['mouth/mouth-scale-horiz-incr'], 2.5, true],
        ['mouthHeight', 'Mouth height', 'Mouth and jaw', ['mouth/mouth-trans-down'], ['mouth/mouth-trans-up'], 2],
        ['upperLip', 'Upper lip', 'Mouth and jaw', ['mouth/mouth-upperlip-volume-decr'], ['mouth/mouth-upperlip-volume-incr'], 3, true],
        ['lowerLip', 'Lower lip', 'Mouth and jaw', ['mouth/mouth-lowerlip-volume-decr'], ['mouth/mouth-lowerlip-volume-incr'], 3, true],
        ['mouthCorners', 'Mouth corners', 'Mouth and jaw', ['mouth/mouth-angles-down'], ['mouth/mouth-angles-up'], 2.5],
        ['cheekBones', 'Cheekbones', 'Mouth and jaw', ['cheek/{s}-cheek-bones-decr'], ['cheek/{s}-cheek-bones-incr'], 3],
        ['cheeks', 'Cheeks', 'Mouth and jaw', ['cheek/{s}-cheek-volume-decr'], ['cheek/{s}-cheek-volume-incr'], 3],
        ['jaw', 'Jaw width', 'Mouth and jaw', ['chin/chin-bones-decr'], ['chin/chin-bones-incr'], 3, true],
        ['chin', 'Chin', 'Mouth and jaw', ['chin/chin-prominent-decr'], ['chin/chin-prominent-incr'], 3],
        ['chinWidth', 'Chin width', 'Mouth and jaw', ['chin/chin-width-decr'], ['chin/chin-width-incr'], 3],
        ['chinHeight', 'Chin height', 'Mouth and jaw', ['chin/chin-height-decr'], ['chin/chin-height-incr'], 2.5],
        ['underbite', 'Jaw forward', 'Mouth and jaw', ['chin/chin-prognathism-decr'], ['chin/chin-prognathism-incr'], 3],
        ['chinCleft', 'Chin cleft', 'Mouth and jaw', ['chin/chin-cleft-decr'], ['chin/chin-cleft-incr'], 2],

        ['earSize', 'Ear size', 'Ears', ['ears/{s}-ear-scale-decr'], ['ears/{s}-ear-scale-incr'], 3, true],
        ['earOut', 'Ears stick out', 'Ears', ['ears/{s}-ear-wing-decr'], ['ears/{s}-ear-wing-incr'], 3],
        ['earLobe', 'Earlobes', 'Ears', ['ears/{s}-ear-lobe-decr'], ['ears/{s}-ear-lobe-incr'], 3],
        ['earHeight', 'Ear height', 'Ears', ['ears/{s}-ear-trans-down'], ['ears/{s}-ear-trans-up'], 2.5],
        ['earAngle', 'Ear tilt', 'Ears', ['ears/{s}-ear-rot-forward'], ['ears/{s}-ear-rot-backward'], 2.5]
    ];

    // [key, label, section, files, extreme, basic]: 0..1, on to `extreme`.
    const SINGLE = [
        ['earsPointed', 'Pointed ears', 'Ears', ['ears/{s}-ear-shape-pointed'], 4, true],
        ['earsRound', 'Round ears', 'Ears', ['ears/{s}-ear-shape-round'], 2],
        ['headRound', 'Round head', 'Head shape', ['head/head-round'], 2],
        ['headOval', 'Oval head', 'Head shape', ['head/head-oval'], 2],
        ['headSquare', 'Square head', 'Head shape', ['head/head-square'], 2],
        ['headTriangle', 'Narrow-chin head', 'Head shape', ['head/head-invertedtriangular'], 2],
        ['headPear', 'Wide-jaw head', 'Head shape', ['head/head-triangular'], 2],
        ['headDiamond', 'Diamond head', 'Head shape', ['head/head-diamond'], 2],
        ['chinPointed', 'Pointed chin', 'Mouth and jaw', ['chin/chin-triangle'], 2.5]
    ];

    const expand = list => list.flatMap(f => (f.includes('{s}') ? [f.replace('{s}', 'l'), f.replace('{s}', 'r')] : [f]));

    const SLIDERS = [
        ...PAIRED.map(([key, label, section, down, up, extreme, basic]) => ({ key, label, section, paired: true, down: expand(down), up: expand(up), extreme, basic: !!basic })),
        ...SINGLE.map(([key, label, section, files, extreme, basic]) => ({ key, label, section, paired: false, up: expand(files), extreme, basic: !!basic }))
    ];

    const api = { SLIDERS, SECTIONS: [...new Set(SLIDERS.map(s => s.section))] };
    root.RRHumanTargets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
