(function () {

  function renderExplosionFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const R  = Math.min(w, h) * 0.5 * params.maxRadius;

    const effectRadius = R;
    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    // Phase 4: Smoke / Dissipation — drawn first, furthest back (t 0.4 → 1.0)
    const smokeCount = Math.round(params.smokeCount);
    for (let i = 0; i < smokeCount; i++) {
      const smokeT = clamp((t - 0.4 - i * 0.05) / 0.6, 0, 1);
      if (smokeT <= 0) continue;

      const rnd        = Math.abs(Math.sin(i * 127.1 + 311.7)) % 1;
      const rnd2       = Math.abs(Math.sin(i * 491.2 +  83.5)) % 1;
      const puffRadius = smokeT * R * (0.3 + rnd2 * 0.3);
      const alpha      = smokeT * (1 - smokeT) * 0.4;
      if (alpha <= 0 || puffRadius <= 0) continue;

      const rndAngle   = rnd * Math.PI * 2;
      const offsetDist = rnd2 * 0.6; // normalized local space
      const p          = proj3(Math.cos(rndAngle) * offsetDist, 0, Math.sin(rndAngle) * offsetDist);
      const smokeColor = mixHexColors(params.outerColor, '#111111', 0.5);

      ctx.save();
      ctx.filter      = `blur(${Math.max(1, puffRadius * 0.4)}px)`;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, puffRadius, 0, Math.PI * 2);
      ctx.fillStyle = smokeColor;
      ctx.fill();
      ctx.restore();
    }

    // Phase 3: Shockwave Rings (t 0.1 → 0.9) — projected as N-point polygon in XZ plane
    const shockwaveRings = Math.round(params.shockwaveRings);
    const ringPoints = 64;
    for (let i = 0; i < shockwaveRings; i++) {
      const ringT = clamp((t - i * 0.08) / 0.75, 0, 1);
      if (ringT <= 0 || ringT >= 1) continue;

      const ringR     = ringT * (1 + i * 0.15); // normalized local radius
      const ringAlpha = (1 - ringT) * 0.8;
      const ringColor = mixHexColors(params.coreColor, params.outerColor, ringT);

      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.beginPath();
      for (let j = 0; j <= ringPoints; j++) {
        const a = (j / ringPoints) * Math.PI * 2;
        const p = proj3(Math.cos(a) * ringR, 0, Math.sin(a) * ringR);
        if (j === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = ringColor;
      ctx.lineWidth   = (1 - ringT) * 8 + 1;
      ctx.stroke();
      ctx.restore();
    }

    // Phase 2: Debris Particles (t 0.05 → 0.6)
    const particleCount = Math.round(params.particleCount);
    const l = clamp((t - 0.05) / 0.55, 0, 1);
    if (l > 0 && l < 1) {
      for (let i = 0; i < particleCount; i++) {
        const rnd      = Math.abs(Math.sin(i * 127.1 + 311.7)) % 1;
        const angle_xz = (i / particleCount) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5;
        const yBias    = Math.sin(i * 3.1) * 0.5 * 0.3;
        const scale    = 0.7 + rnd * 0.3;
        const alpha    = (1 - Math.pow(l, 0.7)) * 0.9;
        if (alpha <= 0) continue;

        const lx = Math.cos(angle_xz) * l * scale;
        const ly = yBias * l;
        const lz = Math.sin(angle_xz) * l * scale;
        const p  = proj3(lx, ly, lz);

        const color = mixHexColors(params.coreColor, params.outerColor, l);
        const size  = 3 + (1 - l) * 5;

        const trailFraction = params.debrisLength * 0.35;
        const trailL = Math.max(0, l * (1 - trailFraction));
        const tp = proj3(
          Math.cos(angle_xz) * trailL * scale,
          yBias * trailL,
          Math.sin(angle_xz) * trailL * scale
        );

        ctx.save();
        ctx.globalAlpha = alpha * 0.65;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.strokeStyle = color;
        ctx.lineWidth   = size * 0.6;
        ctx.lineCap     = 'round';
        ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }
    }

    // Phase 1: Core Flash — drawn last, on top (t 0.0 → 0.15)
    if (t < 0.15) {
      const flashRadius = (t / 0.15) * R * 0.4;
      const flashAlpha  = t < 0.08 ? 1 : clamp(1 - (t - 0.08) / 0.07, 0, 1);
      if (flashRadius > 0 && flashAlpha > 0) {
        const fp = proj3(0, 0, 0);
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, flashRadius, 0, Math.PI * 2);
        ctx.fillStyle = params.coreColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, flashRadius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'explosion',
    name:         'Explosion',
    categoryId: 'elements',
    defaultBlend: 'lighter',
    description:  'Radial explosion burst with hot core flash, expanding shockwave ring, debris particles, and smoke dissipation.',
    render:       renderExplosionFrame,
    noRandomize:  ['centerX', 'centerY'],
    params: [
      { key: 'coreColor',      label: 'Core Color',      type: 'color',  default: '#ffee44' },
      { key: 'outerColor',     label: 'Outer Color',     type: 'color',  default: '#cc2200' },
      { key: 'centerX',        label: 'Center X',        type: 'slider', min: 0,   max: 1.0,  step: 0.02, default: 0.5  },
      { key: 'centerY',        label: 'Center Y',        type: 'slider', min: 0,   max: 1.0,  step: 0.02, default: 0.5  },
      { key: 'maxRadius',      label: 'Max Radius',      type: 'slider', min: 0.1, max: 1.0,  step: 0.02, default: 0.45 },
      { key: 'particleCount',  label: 'Particle Count',  type: 'slider', min: 8,   max: 80,   step: 1,    default: 24   },
      { key: 'shockwaveRings', label: 'Shockwave Rings', type: 'slider', min: 1,   max: 5,    step: 1,    default: 2    },
      { key: 'smokeCount',     label: 'Smoke Count',     type: 'slider', min: 0,   max: 20,   step: 1,    default: 8    },
      { key: 'debrisLength',   label: 'Debris Length',   type: 'slider', min: 0,   max: 1,    step: 0.05, default: 0.5  },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -70 } : p)
    ]
  });

}());
