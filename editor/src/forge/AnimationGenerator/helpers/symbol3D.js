/**
 * Shared rotation pipeline + param schemas for the Symbolic category.
 *
 * Each symbol (Pentagram, Yin/Yang, Cross, Star of David, Crescent + Star,
 * Peace, Radioactive, Biohazard, Swastika) is defined as a 2D shape in a
 * local unit-radius space (XY plane, z = 0) and passed through the same
 * transform/project pipeline used by the 3D shape renderer — six axes of
 * rotation (tiltX/Y/Z static + cycX/Y/Z animated) with perspective
 * foreshortening so out-of-plane rotation reads as real 3D depth.
 *
 * Globals exposed:
 *   makeSymbol3DTransform(params, t, cx, cy, baseRadius)
 *       → { transform: (v3) => v3', project: (v3) => {x,y,depth} }
 *   SYMBOL3D_ROTATION_PARAMS  — 6-axis tilt/cycle slider schema
 *   SYMBOL3D_PULSE_PARAMS     — pulse + pulseCycles slider schema
 *
 * Rotation order matches helpers/shape3D.js render3DShape: cycle rotations
 * around local axes first, then static tilts as view orientation. This
 * means a symbol that's been tilted continues to spin around its own axes
 * rather than the world axes — intuitive for "tilt the sigil flat on the
 * ground, then spin it" type compositions.
 *
 * Loop seamlessness: cyc* values are rounded to integers so each cycle
 * completes a whole number of revolutions per loop.
 */

function makeSymbol3DTransform(params, t, cx, cy, baseRadius) {
    // Pulse modulates the on-screen radius — loop-safe (integer pulseCycles).
    let radius = baseRadius;
    const pulse = params.pulse || 0;
    const pulseCycles = Math.max(1, Math.round(params.pulseCycles || 1));
    if (pulse > 0.001) {
        radius *= 1 + pulse * 0.25 * Math.sin(t * pulseCycles * Math.PI * 2);
    }

    const cycX = Math.round(params.cycX || 0);
    const cycY = Math.round(params.cycY || 0);
    const cycZ = Math.round(params.cycZ || 0);
    const tiltX = (params.tiltX || 0) * Math.PI / 180;
    const tiltY = (params.tiltY || 0) * Math.PI / 180;
    const tiltZ = (params.tiltZ || 0) * Math.PI / 180;

    const angX = t * cycX * Math.PI * 2;
    const angY = t * cycY * Math.PI * 2;
    const angZ = t * cycZ * Math.PI * 2;

    const cosRX = Math.cos(angX), sinRX = Math.sin(angX);
    const cosRY = Math.cos(angY), sinRY = Math.sin(angY);
    const cosRZ = Math.cos(angZ), sinRZ = Math.sin(angZ);
    const cosTX = Math.cos(tiltX), sinTX = Math.sin(tiltX);
    const cosTY = Math.cos(tiltY), sinTY = Math.sin(tiltY);
    const cosTZ = Math.cos(tiltZ), sinTZ = Math.sin(tiltZ);

    const transform = (v) => {
        let x = v[0], y = v[1], z = v[2];
        // 1) Cycle rotations around local axes (X then Y then Z).
        let y1 = y * cosRX - z * sinRX, z1 = y * sinRX + z * cosRX; y = y1; z = z1;
        let x2 = x * cosRY + z * sinRY, z2 = -x * sinRY + z * cosRY; x = x2; z = z2;
        let x3 = x * cosRZ - y * sinRZ, y3 = x * sinRZ + y * cosRZ; x = x3; y = y3;
        // 2) Static tilts as view orientation (X then Y then Z).
        let y4 = y * cosTX - z * sinTX, z4 = y * sinTX + z * cosTX; y = y4; z = z4;
        let x5 = x * cosTY + z * sinTY, z5 = -x * sinTY + z * cosTY; x = x5; z = z5;
        let x6 = x * cosTZ - y * sinTZ, y6 = x * sinTZ + y * cosTZ; x = x6; y = y6;
        return [x, y, z];
    };

    // Project local-space (unit coords) → screen pixels with mild perspective
    // so out-of-plane rotation reads as depth. Canvas +Y goes DOWN, so flip
    // the y axis here — local +Y becomes screen UP, matching the geometric
    // shape renderer's convention.
    const project = (v) => {
        const d = 3.5;
        const dz = d - v[2];
        const s = dz > 0.15 ? d / dz : d / 0.15;
        return { x: cx + v[0] * radius * s, y: cy - v[1] * radius * s, depth: v[2] };
    };

    return { transform, project, radius };
}

const SYMBOL3D_ROTATION_PARAMS = [
    { key: 'tiltX', label: 'Tilt X (Pitch)',
        description: 'STATIC tilt around the X axis (degrees). Tumbles the symbol forward/back.',
        type: 'slider', min: -180, max: 180, step: 1, default: 0 },
    { key: 'tiltY', label: 'Tilt Y (Yaw)',
        description: 'STATIC tilt around the Y axis (degrees). Spins the symbol like a coin face-on/face-away.',
        type: 'slider', min: -180, max: 180, step: 1, default: 0 },
    { key: 'tiltZ', label: 'Tilt Z (Roll)',
        description: 'STATIC rotation in the screen plane (degrees).',
        type: 'slider', min: -180, max: 180, step: 1, default: 0 },
    { key: 'cycX', label: 'Pitch Cycles',
        description: 'Whole rotations around the X axis per loop. Integer for seamless loop.',
        type: 'slider', min: -4, max: 4, step: 1, default: 0 },
    { key: 'cycY', label: 'Yaw Cycles',
        description: 'Whole rotations around the Y axis per loop. Integer for seamless loop.',
        type: 'slider', min: -4, max: 4, step: 1, default: 0 },
    { key: 'cycZ', label: 'Roll Cycles',
        description: 'Whole 2D rotations in the screen plane per loop. Integer for seamless loop.',
        type: 'slider', min: -4, max: 4, step: 1, default: 0 }
];

// SYMBOLIC_ROTATION_PARAMS — variant used by the Symbolic category that
// defaults to one yaw cycle per loop, so sigils gently spin the moment a
// user picks one (showing off the 3D form). Elements / Energy / Interface
// stick with the static SYMBOL3D_ROTATION_PARAMS defaults.
const SYMBOLIC_ROTATION_PARAMS = SYMBOL3D_ROTATION_PARAMS.map(p =>
    p.key === 'cycY' ? { ...p, default: 1 } : p
);

// Shared center/position params for symbol-style animations (symbolic,
// elements, energy). 0.5 = center; allow overshoot so users can position
// content partially off-screen. Add `noRandomize: ['centerX', 'centerY']`
// to keep the centered default through Randomize.
const SYMBOL3D_POSITION_PARAMS = [
    { key: 'centerX', label: 'Center X',
        description: 'Horizontal center (fraction of frame width). 0 = left edge, 0.5 = middle, 1 = right edge. Values outside [0,1] move it partially off-screen.',
        type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
    { key: 'centerY', label: 'Center Y',
        description: 'Vertical center (fraction of frame height). 0 = top, 0.5 = middle, 1 = bottom.',
        type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 }
];

const SYMBOL3D_PULSE_PARAMS = [
    { key: 'pulse', label: 'Pulse Strength',
        description: 'Size pulsation amount (sin wave). 0 = no pulse, 1 = ±25% size oscillation.',
        type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'pulseCycles', label: 'Pulse Cycles',
        description: 'How many pulses complete per loop. Integer for seamless loop.',
        type: 'slider', min: 1, max: 8, step: 1, default: 2 }
];

/**
 * Apply a pseudo-3D affine transform to the canvas for an animation that
 * was authored in 2D. Used by the Elements animations (Fire, Wind, Water,
 * Light, Electric, Shadow) so they pick up tilt/cycle rotation from the
 * SYMBOL3D_ROTATION_PARAMS schema and the 3D rotation gizmo.
 *
 *   tiltZ + cycZ → true rotation (canvas ctx.rotate)
 *   tiltY + cycY → horizontal squash by cos(angle) — looks like rotating
 *                  into / out of the screen around the vertical axis
 *   tiltX + cycX → vertical squash by cos(angle) — looks like rotating
 *                  into / out of the screen around the horizontal axis
 *
 * Caller MUST balance this with ctx.restore() at the end of the render.
 * Cycle values are integer-rounded for loop seamlessness.
 *
 * Center-of-rotation is (cx, cy), typically w/2, h/2.
 */
function applySymbol2DTransform(ctx, params, t, cx, cy) {
    const tiltX = (params.tiltX || 0) * Math.PI / 180;
    const tiltY = (params.tiltY || 0) * Math.PI / 180;
    const tiltZ = (params.tiltZ || 0) * Math.PI / 180;
    const cycX = Math.round(params.cycX || 0);
    const cycY = Math.round(params.cycY || 0);
    const cycZ = Math.round(params.cycZ || 0);
    const totalX = tiltX + t * cycX * Math.PI * 2;
    const totalY = tiltY + t * cycY * Math.PI * 2;
    const totalZ = tiltZ + t * cycZ * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(totalZ);
    ctx.scale(Math.cos(totalY), Math.cos(totalX));
    ctx.translate(-cx, -cy);
}

// Param keys that Interface animations should typically skip on Randomize:
// rotation (the panel should stay head-on), pulse (a throbbing UI looks
// wrong), and opacity (a transparent UI defeats the purpose). Individual
// Interface animations spread this list into their own `noRandomize` (and
// can append extras specific to that animation).
const INTERFACE_NO_RANDOMIZE = [
    'tiltX', 'tiltY', 'tiltZ',
    'cycX', 'cycY', 'cycZ',
    'pulse', 'pulseCycles',
    'opacity',
    'centerX', 'centerY'
];
