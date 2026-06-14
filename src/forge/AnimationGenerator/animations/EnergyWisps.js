/**
 * Energy Wisps — a glowing comet-like head orbiting around the frame
 * center, dragging a fan of rainbow-colored tendrils behind it. The
 * wisps point opposite the head's velocity so they read as a real
 * trailing tail, not as static tendrils.
 *
 * Visual layers (all projected through the symbol3D 3D pipeline):
 *   1. N wisps emanating FROM the head position TOWARD the trail
 *      direction (= opposite of orbit-tangent velocity). Each wisp
 *      has angular offset within the spread cone, sinusoidal
 *      perpendicular curl, and per-segment thickness taper from a
 *      thick base at the head to a thin glowing tip far behind.
 *      Three-pass stroke (halo / body / core) per segment.
 *   2. Bright comet "head" — radial gradient at the head's current
 *      position. White-hot core fading to the colour-cycle hue.
 *
 * Loop-safety:
 *   - `orbitSpeed` (whole orbits per loop) and `colorShift` (whole
 *     rainbow rotations per loop) are both integer.
 *   - When `orbitSpeed === 0` the head is stationary and the trail
 *     points along the user-configurable `staticAngle`.
 */
function renderEnergyWispsFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );
    const proj3 = (x, y) => project(transform([x, y, 0]));

    const opacity = params.opacity;
    const wispCount = Math.max(1, Math.round(params.wispCount));
    const wispWobble = params.wispWobble;
    const waveFreq = Math.max(1, Math.round(params.waveFreq));
    const spread = Math.max(0, Math.min(1, params.spread));
    const orbitCycles = Math.round(params.orbitSpeed);
    const orbitRadius = params.orbitRadius;
    const orbitAngle = t * orbitCycles * Math.PI * 2;
    const colorShift = Math.round(params.colorShift);
    const colorOffset = t * colorShift + (params.baseHue / 360);
    const baseLineW = Math.max(0.5, minDim * 0.005);
    const wispThickness = baseLineW * params.thickness;
    const glow = params.glow;
    const taper = Math.max(0, Math.min(1, params.taper));
    const SEGS = 60;

    // Head position at a given time fraction. The tail TRACES THE HEAD'S
    // PAST PATH — each wisp point samples the position the head occupied
    // some time ago, so the trail naturally curves with the orbit.
    const headPosAt = (tFrac) => {
        if (orbitCycles === 0) return [0, 0];
        const ang = tFrac * orbitCycles * Math.PI * 2;
        return [orbitRadius * Math.cos(ang), orbitRadius * Math.sin(ang)];
    };
    // Velocity (or static-angle direction) at a given time fraction.
    const velDirAt = (tFrac) => {
        if (orbitCycles === 0) {
            const sa = params.staticAngle * Math.PI / 180;
            // Static mode: velocity is +X-rotated, trail = -velocity will
            // point in the opposite of staticAngle.
            return [Math.cos(sa), Math.sin(sa)];
        }
        const ang = tFrac * orbitCycles * Math.PI * 2;
        const dir = orbitCycles > 0 ? 1 : -1;
        return [-Math.sin(ang) * dir, Math.cos(ang) * dir];
    };

    const [headLX, headLY] = headPosAt(t);

    // Optional length pulse on the whole tail.
    const pulse = params.pulse || 0;
    const pulseCycles = Math.max(1, Math.round(params.pulseCycles || 1));
    const pulseMod = 1 + pulse * 0.15 * Math.sin(t * pulseCycles * Math.PI * 2);
    // tailDuration: how far back in time (as fraction of loop) the tail
    // reaches. Effective when the head is moving — controls visible
    // tail length along the orbit path.
    const tailDuration = Math.max(0.01, params.tailDuration) * pulseMod;
    // Wave animation speed — adds time-based phase to the wobble so the
    // wisps flow over time rather than holding a fixed shape.
    const waveSpeed = Math.round(params.waveSpeed);
    const wavePhase = t * waveSpeed * Math.PI * 2;

    // HSL→RGB → "rgba()" string in one go.
    const hslRgba = (h, s, l, alpha) => {
        h = ((h % 360) + 360) % 360;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 60)       { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
        const R = Math.round((r + m) * 255);
        const G = Math.round((g + m) * 255);
        const B = Math.round((b + m) * 255);
        return `rgba(${R},${G},${B},${alpha})`;
    };

    // ── Wisps ─────────────────────────────────────────────────────────
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const deviation = Math.max(0, params.tailDeviation);

    for (let i = 0; i < wispCount; i++) {
        // Per-wisp deterministic seeds.
        const sA = Math.sin(i * 12.9898) * 43758.5453;  const rndA = sA - Math.floor(sA);
        const sB = Math.sin(i * 78.233)  * 43758.5453;  const rndB = sB - Math.floor(sB);
        const sC = Math.sin(i * 39.346)  * 43758.5453;  const rndC = sC - Math.floor(sC);
        const sD = Math.sin(i * 5.71)    * 43758.5453;  const rndD = sD - Math.floor(sD);

        // Base angular offset within the spread cone.
        const angularOffset = (i / Math.max(1, wispCount - 1) - 0.5) * spread;

        // Mild per-wisp variation in duration & length (kept tight so
        // the average matches the slider values).
        const wispDuration = tailDuration * (0.85 + 0.15 * rndA);
        const wispLength = params.tailLength * (0.85 + 0.15 * rndB);

        // Per-wisp whip phase offsets — independent oscillation phase
        // so at any given moment some whip left while others whip right.
        const whipPh1 = rndC * Math.PI * 2;
        const whipPh2 = rndD * Math.PI * 2;
        // Per-wisp INTEGER time-frequency offsets (loop-safe). The base
        // waveSpeed is the slowest harmonic; each wisp picks its own
        // primary frequency by adding 0..2 to waveSpeed, so wisps don't
        // share a global rhythm.
        const tFreq1 = Math.max(1, waveSpeed + Math.floor(rndC * 3));
        const tFreq2 = Math.max(1, waveSpeed * 2 + Math.floor(rndD * 3));
        const tFreq3 = Math.max(1, waveSpeed * 3 + Math.floor(rndA * 3));
        const wp1 = t * tFreq1 * Math.PI * 2;
        const wp2 = t * tFreq2 * Math.PI * 2;
        const wp3 = t * tFreq3 * Math.PI * 2;
        // Per-wisp SPATIAL wavelengths so crests don't align across wisps
        // at any frame — each strand looks shaped differently.
        const sFreq1 = 1.8 + rndC * 2.0;
        const sFreq2 = 3.5 + rndD * 2.5;
        const sFreq3 = 6.0 + rndA * 3.0;

        // Hue from i (rainbow), shifted by colorOffset for loop-safe
        // rainbow rotation.
        const hue = 360 * ((i / wispCount) + colorOffset + rndB * 0.05);
        const baseRgba = (a) => hslRgba(hue, params.saturation, params.lightness, a);
        const coreRgba = (a) => hslRgba(hue, params.saturation * 0.4, Math.min(0.9, params.lightness + 0.30), a);

        // Trace wisp by sampling past head positions. u=0 → current
        // head; u=1 → head's position `wispDuration` ago. The tail
        // naturally curves through the orbit's recent path.
        const pts = new Array(SEGS + 1);
        for (let k = 0; k <= SEGS; k++) {
            const u = k / SEGS;
            const tPast = t - u * wispDuration;
            const [hx, hy] = headPosAt(tPast);
            // Velocity-perpendicular direction at this past time
            // (rotated 90° from the velocity).
            const [vx, vy] = velDirAt(tPast);
            const perpX = -vy, perpY = vx;

            // Per-wisp angular spread offset, perpendicular to the
            // local trail. Magnitude grows along the wisp so wisps
            // anchor at the head and fan WIDELY as they reach the tip.
            // Scaled by both tail length and orbit radius so the fan
            // remains visible whether the head is fast/static or moving.
            const fanScale = (params.tailLength + orbitRadius) * 0.9;
            const spreadMag = angularOffset * fanScale * Math.pow(u, 0.7);

            // Time-animated two-harmonic wave: PHASE shifts with t so
            // the wisp visibly flows / shimmers rather than holding a
            // fixed shape.
            const wave1 = Math.sin(u * Math.PI * waveFreq + wavePhase + rndC * 7);
            const wave2 = 0.5 * Math.sin(u * Math.PI * (waveFreq + 2)
                                        + wavePhase * 1.3 + rndA * 11);
            const wobble = wispWobble * orbitRadius * (wave1 + wave2);
            const wobbleFade = Math.sin(u * Math.PI);

            // Tip whip — perpendicular oscillation that grows with u²
            // so the head end stays anchored (u=0 → 0) and only the
            // far end whips (u=1 → max).
            //
            // Per-wisp time AND spatial frequencies (tFreq*, sFreq*)
            // mean each strand truly moves to its own beat rather than
            // sharing a global rhythm with phase offsets. Three
            // harmonics with different rates + per-wisp seeded
            // wavelengths give organic ribbon motion that doesn't sync
            // across strands.
            const w1 = Math.sin(wp1 + u * Math.PI * sFreq1 + whipPh1);
            const w2 = 0.55 * Math.sin(wp2 + u * Math.PI * sFreq2 + whipPh2);
            const w3 = 0.28 * Math.sin(wp3 + u * Math.PI * sFreq3 + whipPh1 * 1.7);
            const tipWhip = deviation * orbitRadius * 1.2 * u * u
                          * (w1 + w2 + w3);

            // Linear extension in the trail direction (opposite of
            // velocity) — gives a visible tail even when the head is
            // stationary, and lengthens the tail when orbiting.
            const trailX = -vx, trailY = -vy;
            const extension = u * wispLength;

            const offset = spreadMag + wobble * wobbleFade + tipWhip;
            const x = hx + extension * trailX + offset * perpX;
            const y = hy + extension * trailY + offset * perpY;
            pts[k] = proj3(x, y);
        }

        // Stroke segment-by-segment with tapered width: thick at base,
        // thin at tip. Three passes per segment for halo / body / core.
        for (let k = 0; k < SEGS; k++) {
            const uMid = (k + 0.5) / SEGS;
            // Thickness profile: (1 - taper*u) ranges 1→(1-taper).
            // Plus a sin(πu) bias so the very tip and very base fade.
            const widthFactor = (1 - taper * uMid) * Math.sin(uMid * Math.PI) * 1.8;
            if (widthFactor < 0.01) continue;
            const a0 = pts[k], a1 = pts[k + 1];
            // Endpoint alpha tapers so the wisp doesn't end abruptly.
            const segAlpha = opacity * Math.sin(uMid * Math.PI);
            if (segAlpha < 0.02) continue;

            // Halo (thick, semi-transparent body color)
            if (glow > 0.01) {
                ctx.strokeStyle = baseRgba(segAlpha * glow * 0.55);
                ctx.lineWidth = wispThickness * widthFactor * (2 + glow * 3);
                ctx.beginPath();
                ctx.moveTo(a0.x, a0.y);
                ctx.lineTo(a1.x, a1.y);
                ctx.stroke();
            }
            // Body
            ctx.strokeStyle = baseRgba(segAlpha);
            ctx.lineWidth = wispThickness * widthFactor;
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            ctx.lineTo(a1.x, a1.y);
            ctx.stroke();
            // Bright core
            ctx.strokeStyle = coreRgba(segAlpha * 0.95);
            ctx.lineWidth = wispThickness * widthFactor * 0.40;
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            ctx.lineTo(a1.x, a1.y);
            ctx.stroke();
        }
    }

    // ── Comet head glow at the orbiting position ─────────────────────
    if (params.centralGlow > 0.01) {
        const centerP = proj3(headLX, headLY);
        const centerR = Math.max(2, minDim * 0.04 * params.centralSize);
        const halo = ctx.createRadialGradient(
            centerP.x, centerP.y, 0,
            centerP.x, centerP.y, centerR
        );
        halo.addColorStop(0,
            `rgba(255,255,255,${opacity * params.centralGlow})`);
        halo.addColorStop(0.5,
            hslRgba(360 * colorOffset, params.saturation, params.lightness,
                    opacity * params.centralGlow * 0.55));
        halo.addColorStop(1,
            hslRgba(360 * colorOffset, params.saturation, params.lightness, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(centerP.x, centerP.y, centerR, 0, Math.PI * 2);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'energy',
    id:           'energywisps',
    name:         'Energy Wisps',
    description:  'Rainbow-colored energy tendrils emanating from a central bright point. Each wisp is a tapered curving tendril with halo/body/core lighting. Spread, count, length, wobble, and rainbow rotation are all tunable.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'size', label: 'Size',
            description: 'Overall extent of the wisp fan (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },

        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'wispCount', label: 'Wisp Count',
            description: 'Number of tendrils emanating from the centre.',
            type: 'slider', min: 1, max: 40, step: 1, default: 16 },
        { key: 'tailLength', label: 'Tail Length',
            description: 'Direct spatial length of the tail in local units, added to whatever path-history extension comes from Tail Duration. Use this to lengthen tails when the head is stationary (Orbit Speed = 0) or to extend orbiting tails further than the path arc reaches.',
            type: 'slider', min: 0, max: 1.5, step: 0.01, default: 0.50 },
        { key: 'tailDuration', label: 'Tail Curl (Path History)',
            description: 'How far back in time (fraction of the loop) the tail samples the head\'s past path. Higher = tail follows more of the orbit arc, curling around the path. 0 = perfectly straight tail (uses Tail Length only).',
            type: 'slider', min: 0, max: 1.0, step: 0.01, default: 0.30 },
        { key: 'tailDeviation', label: 'Tail Deviation',
            description: 'How wildly individual wisps stray from the main trail. At 0 every wisp marches in lockstep along the same arc. Crank it up to make some wisps lag, others sprint ahead, some spread wide, others wobble like crazy — produces the messy "comet hair" look.',
            type: 'slider', min: 0, max: 1.0, step: 0.02, default: 0.35 },
        { key: 'waveSpeed', label: 'Wave Speed',
            description: 'Whole shimmer-wave cycles per loop along the tail. Integer = seamless loop. 0 = wisps hold a fixed shape; higher = more flowing/rippling motion.',
            type: 'slider', min: 0, max: 8, step: 1, default: 2 },
        { key: 'spread', label: 'Tail Spread',
            description: 'Angular spread of the comet tail (±half the spread is added to the trail direction). 0.15 = tight pencil trail; 1.0 = full 180° fan.',
            type: 'slider', min: 0.05, max: 1.0, step: 0.02, default: 0.85 },
        { key: 'thickness', label: 'Base Thickness',
            description: 'Stroke thickness at the wisp base (tapers toward the tip according to Taper).',
            type: 'slider', min: 0.5, max: 8, step: 0.1, default: 1.6 },
        { key: 'taper', label: 'Taper',
            description: 'How much the wisp thins toward its tip. 0 = uniform thickness; 1 = pure point at the tip.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0.55 },
        { key: 'wispWobble', label: 'Curl Amount',
            description: 'Perpendicular wobble amplitude — how dramatically each wisp curves away from a straight line.',
            type: 'slider', min: 0, max: 0.6, step: 0.01, default: 0.20 },
        { key: 'waveFreq', label: 'Curl Frequency',
            description: 'Number of curl waves along each wisp.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'orbitRadius', label: 'Orbit Radius',
            description: 'Distance of the comet head from the local origin (in local units). 0 = stationary head at the centre; larger = a sweeping arc across the frame.',
            type: 'slider', min: 0, max: 0.8, step: 0.01, default: 0.45 },
        { key: 'orbitSpeed', label: 'Orbit Speed',
            description: 'Whole orbits per loop. Integer for seamless looping. 0 = stationary head — use Static Angle to point the tail.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'staticAngle', label: 'Static Angle (°)',
            description: 'Direction the tail points when Orbit Speed = 0. 0° = head with tail pointing left; 90° = tail down; 180° = tail right; 270° = tail up.',
            type: 'slider', min: 0, max: 359, step: 1, default: 0 },

        { key: 'baseHue', label: 'Base Hue',
            description: 'Starting hue for the rainbow distribution (degrees). 0 = red, 120 = green, 240 = blue.',
            type: 'slider', min: 0, max: 360, step: 5, default: 0 },
        { key: 'saturation', label: 'Saturation',
            description: 'Color saturation (0 = grayscale, 1 = vivid).',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 1.0 },
        { key: 'lightness', label: 'Lightness',
            description: 'Color lightness (0.5 = pure hue, higher = brighter / pastel).',
            type: 'slider', min: 0.2, max: 0.85, step: 0.02, default: 0.55 },
        { key: 'colorShift', label: 'Rainbow Rotation',
            description: 'Whole hue rotations per loop. Integer keeps loop seamless. 0 = static colors.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },

        { key: 'glow', label: 'Glow',
            description: 'Outer halo intensity around each wisp.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.7 },

        { key: 'centralGlow', label: 'Central Glow',
            description: 'Brightness of the central convergence point. 0 = no central highlight.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.9 },
        { key: 'centralSize', label: 'Central Size',
            description: 'Radius multiplier for the central glow disc.',
            type: 'slider', min: 0.1, max: 4, step: 0.05, default: 1.0 },

        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderEnergyWispsFrame
});
