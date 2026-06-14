/**
 * Water — concentric ripples spreading from drop points, with several
 * tricks layered on so it actually reads as wet liquid rather than generic
 * circles:
 *
 *  - Wavy distorted ring outlines (sin perturbation around the perimeter)
 *    instead of perfect Euclidean circles.
 *  - Specular highlight crescent on the upper-left of each ring (mimics
 *    a sky/light reflection on the wave's leading edge).
 *  - Splash droplets ejecting outward + slightly upward (ballistic arc) at
 *    the moment each drop strikes.
 *  - Radial caustic gradient inside the freshest portion of each drop's
 *    lifecycle (a soft glowing pool).
 *
 * Depends on:
 *   hexWithAlpha, mixHexColors  (helpers/color.js)
 *   RR_ANIMATION_REGISTRY       (registry.js)
 *
 * Variety:
 *   - Heavy splash: low dropCount, big maxRadius, high splashCount + highlight
 *   - Rainfall: many drops, small radius, fast cycles, few splashes
 *   - Magic pool: glowing color, slow cycles, strong highlight, high distortion
 *   - Tide ripples: 1-2 drops, low distortion, lots of rings, wide spacing
 */
function renderWaterFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;

    const dropCount = Math.max(1, Math.round(params.dropCount));
    const dropCycles = Math.max(1, Math.round(params.dropCycles));
    const maxRadius = Math.min(w, h) * 0.5 * params.maxRadius;
    const ringCount = Math.max(1, Math.round(params.ringCount));
    const ringSpacing = params.ringSpacing;
    const ringThickness = Math.min(w, h) * 0.01 * params.ringThickness;
    const color1 = params.color1;
    const color2 = params.color2;
    const highlightColor = params.highlightColor;
    const opacity = params.opacity;
    const distortion = params.distortion;
    const splashCount = Math.max(0, Math.round(params.splashCount));
    const splashLen = Math.min(w, h) * 0.22 * params.splashLength;
    const highlight = params.highlight;
    const spawnW = w * params.spawnWidth;
    const spawnH = h * params.spawnHeight;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    // True 3D pond: drops live on the XY plane (z = 0). The transform
    // rotates the pond in 3D; the projection maps to screen pixels with
    // perspective. Splash droplets can have a positive z (rising), giving
    // them real 3D arc trajectories when the pond is tilted.
    const radius = minDim * 0.5;
    const { transform, project } = makeSymbol3DTransform(params, t, cx, cy, radius);
    // Convert a screen point (sx, sy) to a projected screen point via the
    // 3D pipeline (assumed at z = 0).
    const proj = (sx, sy, z = 0) => {
        const lx = (sx - cx) / radius;
        const ly = (cy - sy) / radius;   // canvas Y flip → local +Y up
        return project(transform([lx, ly, z]));
    };

    // Polygon resolution for distorted ring outlines.
    const RING_SEGS = 60;

    for (let i = 0; i < dropCount; i++) {
        // Deterministic per-drop seeds.
        const sX = Math.sin(i * 12.9898) * 43758.5453;  const rX = sX - Math.floor(sX);
        const sY = Math.sin(i * 78.233)  * 43758.5453;  const rY = sY - Math.floor(sY);
        const sR = Math.sin(i * 39.346)  * 43758.5453;  const rR = sR - Math.floor(sR);
        const sP = Math.sin(i * 17.913)  * 43758.5453;  const rP = sP - Math.floor(sP);

        const dropX = cx + (rX - 0.5) * spawnW;
        const dropY = cy + (rY - 0.5) * spawnH;

        const phaseOffset = i / dropCount;
        const life = ((t * dropCycles + phaseOffset) % 1 + 1) % 1;
        const sizeMul = 0.7 + 0.6 * rR;

        // 1. Splash droplets — eject radially outward from drop center during
        //    the first 30% of the lifecycle. Each droplet follows a slight
        //    ballistic arc (gravity-down on the y axis).
        if (life < 0.3 && splashCount > 0) {
            const splashLife = life / 0.3;
            const splashAlphaBase = opacity * (1 - splashLife);
            for (let sp = 0; sp < splashCount; sp++) {
                const angR = Math.sin(i * 7.3 + sp * 23.71 + rP * 11) * 43758.5453;
                const angle = (angR - Math.floor(angR)) * Math.PI * 2;
                const velR = Math.sin(i * 3.1 + sp * 41.7) * 43758.5453;
                const velMul = 0.65 + 0.5 * (velR - Math.floor(velR));
                // Radial distance — fast accelerate, soft decel.
                const dist = splashLen * velMul * Math.sin(splashLife * Math.PI * 0.5);
                // Ballistic arc: up at first, falls past start by end.
                const arcY = splashLen * 0.35 * Math.sin(splashLife * Math.PI) - splashLen * 0.15 * splashLife;
                // Droplet lives in 3D: XY position on the pond plus a Z
                // offset for the rising ballistic arc (so it floats above
                // the water surface). When the pond tilts, droplets appear
                // truly above the rippling surface, not painted on it.
                const dx2 = dropX + Math.cos(angle) * dist;
                const dy2 = dropY + Math.sin(angle) * dist * 0.6;
                // arcY → z offset (positive = up out of the pond).
                const zLift = (splashLen * 0.35 * Math.sin(splashLife * Math.PI)
                             - splashLen * 0.15 * splashLife) / radius;
                const pProj = proj(dx2, dy2, zLift);
                const drSize = minDim * 0.0085 * sizeMul * velMul;
                ctx.fillStyle = hexWithAlpha(color1, splashAlphaBase);
                ctx.beginPath();
                ctx.arc(pProj.x, pProj.y, drSize, 0, Math.PI * 2);
                ctx.fill();
                // Small specular highlight dot on each droplet (upper-left).
                ctx.fillStyle = hexWithAlpha(highlightColor, splashAlphaBase * highlight * 0.8);
                ctx.beginPath();
                ctx.arc(pProj.x - drSize * 0.35, pProj.y - drSize * 0.35, drSize * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 2. Caustic glow disc — soft radial gradient at drop center, visible
        //    during the first half of the lifecycle. Reads as a glowing pool /
        //    light reflection on the water surface.
        if (life < 0.5 && highlight > 0.01) {
            const causticRadius = (0.1 + life * 0.9) * maxRadius * sizeMul * 0.45;
            if (causticRadius > 2) {
                const causticAlpha = opacity * 0.35 * highlight * Math.sin(life * Math.PI * 2);
                if (causticAlpha > 0.02) {
                    // Caustic gradient lives on the water surface (z=0).
                    // Center is the projected drop position; the disc is
                    // sampled as a polygon on the surface so it appears as
                    // an ellipse when the pond is tilted.
                    const center = proj(dropX, dropY, 0);
                    const grad = ctx.createRadialGradient(
                        center.x, center.y - causticRadius * 0.25, 1,
                        center.x, center.y, causticRadius
                    );
                    grad.addColorStop(0, hexWithAlpha(highlightColor, causticAlpha));
                    grad.addColorStop(0.6, hexWithAlpha(color1, causticAlpha * 0.4));
                    grad.addColorStop(1, hexWithAlpha(highlightColor, 0));
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    const CSEGS = 36;
                    for (let k = 0; k <= CSEGS; k++) {
                        const a = (k / CSEGS) * Math.PI * 2;
                        const p = proj(dropX + Math.cos(a) * causticRadius,
                                       dropY + Math.sin(a) * causticRadius, 0);
                        if (k === 0) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }

        // 3. Rings — each ring is a wavy distorted polygon (not a perfect
        //    circle) with a specular highlight crescent on its upper-left.
        for (let r = 0; r < ringCount; r++) {
            const ringLife = life - r * ringSpacing;
            if (ringLife < 0 || ringLife > 1) continue;
            const radius = ringLife * maxRadius * sizeMul;
            if (radius < 1) continue;
            const alpha = opacity * Math.sin(ringLife * Math.PI);
            if (alpha < 0.03) continue;

            const col = mixHexColors(color1, color2, ringLife);
            const width = ringThickness * (1.6 - ringLife * 0.8);
            // Distortion grows with radius (small ripples near drop, larger
            // waves on big rings) and is loop-safe via integer dropCycles.
            const distAmount = radius * distortion * 0.12;
            const phaseR = i * 3.1 + r * 2.7;
            const timePhase = t * Math.PI * 2 * dropCycles;

            // Distorted ring outline — each sample point lives on the
            // pond's surface (z=0). Projection turns the ring into an
            // ellipse when tilted, matching real water on a tilted plane.
            ctx.strokeStyle = hexWithAlpha(col, alpha);
            ctx.lineWidth = width;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let k = 0; k <= RING_SEGS; k++) {
                const a = (k / RING_SEGS) * Math.PI * 2;
                const wob =
                    distAmount * 0.65 * Math.sin(a * 4 + phaseR + timePhase) +
                    distAmount * 0.35 * Math.sin(a * 9 + phaseR * 1.3 - timePhase * 1.4);
                const rr = radius + wob;
                const p = proj(dropX + Math.cos(a) * rr, dropY + Math.sin(a) * rr, 0);
                if (k === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // Specular highlight crescent: a short bright arc on the
            // upper-left quadrant of the ring (mimics top-left light source
            // reflecting on the wave crest).
            if (highlight > 0.01) {
                const hlAlpha = alpha * highlight * 1.1;
                if (hlAlpha > 0.04) {
                    ctx.strokeStyle = hexWithAlpha(highlightColor, hlAlpha);
                    ctx.lineWidth = width * 0.65;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    const hlStart = -Math.PI * 0.88;
                    const hlEnd = -Math.PI * 0.38;
                    const HL_SEGS = 16;
                    for (let k = 0; k <= HL_SEGS; k++) {
                        const a = hlStart + (hlEnd - hlStart) * (k / HL_SEGS);
                        const wob =
                            distAmount * 0.65 * Math.sin(a * 4 + phaseR + timePhase) +
                            distAmount * 0.35 * Math.sin(a * 9 + phaseR * 1.3 - timePhase * 1.4);
                        const rr = radius + wob;
                        const p = proj(dropX + Math.cos(a) * rr, dropY + Math.sin(a) * rr, 0);
                        if (k === 0) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    }
                    ctx.stroke();
                }
            }
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'elements',
    id:           'water',
    name:         'Water',
    description:  'Concentric ripples with wavy distorted edges, splash droplets, specular highlights, and caustic glow. Configure for splashes, rainfall, or magic pools.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Inner Color',
            description: 'Color of new ripples (bright when first emitted).',
            type: 'color', default: '#a0e0ff' },
        { key: 'color2', label: 'Outer Color',
            description: 'Color of expanded ripples (fades to as they spread).',
            type: 'color', default: '#2860a0' },
        { key: 'highlightColor', label: 'Highlight Color',
            description: 'Color of the specular highlight crescents and caustic glow. Usually near-white for sky reflection.',
            type: 'color', default: '#f8ffff' },
        { key: 'dropCount', label: 'Drop Count',
            description: 'Number of drop points emitting ripples.',
            type: 'slider', min: 1, max: 30, step: 1, default: 5 },
        { key: 'dropCycles', label: 'Drop Cycles',
            description: 'How many full ripple lifecycles complete per loop. Integer = seamless loop.',
            type: 'slider', min: 1, max: 6, step: 1, default: 2 },
        { key: 'ringCount', label: 'Rings per Drop',
            description: 'How many concentric rings each drop emits.',
            type: 'slider', min: 1, max: 6, step: 1, default: 3 },
        { key: 'ringSpacing', label: 'Ring Spacing',
            description: 'Time offset between successive rings of a drop (fraction of lifecycle).',
            type: 'slider', min: 0.05, max: 0.3, step: 0.02, default: 0.14 },
        { key: 'maxRadius', label: 'Max Radius',
            description: 'How big each ripple grows (fraction of frame).',
            type: 'slider', min: 0.05, max: 1.5, step: 0.05, default: 0.5 },
        { key: 'ringThickness', label: 'Ring Thickness',
            description: 'Thickness multiplier of each ripple ring.',
            type: 'slider', min: 0.2, max: 5, step: 0.1, default: 1.5 },
        { key: 'distortion', label: 'Edge Distortion',
            description: 'Wavy surface chop on each ring outline. 0 = perfect circles, 1.5 = roiling sea.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.45 },
        { key: 'splashCount', label: 'Splash Droplets',
            description: 'Number of droplets that eject from each drop on impact. 0 disables.',
            type: 'slider', min: 0, max: 20, step: 1, default: 7 },
        { key: 'splashLength', label: 'Splash Reach',
            description: 'How far the droplets fly from the drop point.',
            type: 'slider', min: 0.2, max: 2.5, step: 0.05, default: 1.0 },
        { key: 'highlight', label: 'Highlight Intensity',
            description: 'Strength of the specular highlight crescents + caustic glow. 0 = matte, 1 = glossy wet.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.85 },
        { key: 'spawnWidth', label: 'Spawn Width',
            description: 'Horizontal extent of where drops spawn (fraction of frame width). 0 = all on a vertical line.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.7 },
        { key: 'spawnHeight', label: 'Spawn Height',
            description: 'Vertical extent of where drops spawn (fraction of frame height). 0 = all on a horizontal line.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.55 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'opacity', label: 'Opacity',
            description: 'Overall alpha multiplier.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.95 }
    ],
    render: renderWaterFrame
});
