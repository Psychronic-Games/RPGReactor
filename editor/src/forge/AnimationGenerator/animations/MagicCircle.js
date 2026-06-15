(function () {
  function renderMagicCircleFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const effectRadius = Math.min(w, h) * 0.5 * params.radius;

    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    const primaryColor = params.primaryColor;
    const secondaryColor = params.secondaryColor;
    const ringCount = Math.round(params.ringCount);
    const glyphCount = Math.round(params.glyphCount);
    const starPoints = Math.round(params.starPoints);
    const beamCount = Math.round(params.beamCount);
    const rotationCycles = Math.round(params.rotationCycles);
    const pulseCycles = Math.round(params.pulseCycles);
    const particleCount = Math.round(params.particleCount);
    const glowIntensity = params.glowIntensity;
    const innerRadius = effectRadius * 0.15;
    const innerRingR_local = ringCount === 1 ? 1.0 : 0.45;
    const tick_local = 6 / effectRadius;

    function drawRing3D(r_local, color, lineWidth, alpha) {
      const N = 80;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const p = proj3(Math.cos(a) * r_local, 0, Math.sin(a) * r_local);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = hexWithAlpha(color, alpha);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // 1. RADIAL BEAMS
    if (beamCount > 0) {
      const beamAngle = t * Math.PI * 2 * 1;
      const origin = proj3(0, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < beamCount; i++) {
        const a = beamAngle + (i / beamCount) * Math.PI * 2;
        const end = proj3(Math.cos(a), 0, Math.sin(a));
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. CONCENTRIC RINGS with GLYPHS
    for (let ri = 0; ri < ringCount; ri++) {
      const frac = ringCount === 1 ? 0 : ri / (ringCount - 1);
      const r_local = 1 - frac * 0.55;
      const color = mixHexColors(primaryColor, secondaryColor, frac);
      const N = rotationCycles + ri;
      const rotAngle = t * Math.PI * 2 * N;
      const lineWidth = 2 + (1 - frac) * 1.5;
      const glowBlur = 3 + glowIntensity * 8;

      ctx.save();
      ctx.filter = `blur(${glowBlur}px)`;
      drawRing3D(r_local, color, lineWidth * 2.5, 0.45 * glowIntensity);
      ctx.restore();

      drawRing3D(r_local, color, lineWidth, 0.85);

      for (let gi = 0; gi < glyphCount; gi++) {
        const a = rotAngle + (gi / glyphCount) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);

        const pInner = proj3(ca * (r_local - tick_local), 0, sa * (r_local - tick_local));
        const pOuter = proj3(ca * (r_local + tick_local), 0, sa * (r_local + tick_local));
        ctx.beginPath();
        ctx.moveTo(pInner.x, pInner.y);
        ctx.lineTo(pOuter.x, pOuter.y);
        ctx.strokeStyle = hexWithAlpha(color, 0.9);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const pCenter = proj3(ca * r_local, 0, sa * r_local);
        const dx = pOuter.x - pInner.x;
        const dy = pOuter.y - pInner.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ds = 4;
        const radX = (dx / len) * ds;
        const radY = (dy / len) * ds;
        ctx.beginPath();
        ctx.moveTo(pCenter.x + radX,  pCenter.y + radY);
        ctx.lineTo(pCenter.x - radY,  pCenter.y + radX);
        ctx.lineTo(pCenter.x - radX,  pCenter.y - radY);
        ctx.lineTo(pCenter.x + radY,  pCenter.y - radX);
        ctx.closePath();
        ctx.fillStyle = hexWithAlpha(color, 0.7);
        ctx.fill();
      }
    }

    // 3. STAR GEOMETRY in XZ plane
    {
      const starAngle = t * Math.PI * 2 * 1;
      const glowBlur = 3 + glowIntensity * 7;

      const buildStarPath = () => {
        ctx.beginPath();
        for (let i = 0; i < starPoints * 2; i++) {
          const a = starAngle + (i / (starPoints * 2)) * Math.PI * 2;
          const r = i % 2 === 0 ? innerRingR_local : innerRingR_local * 0.42;
          const p = proj3(Math.cos(a) * r, 0, Math.sin(a) * r);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      };

      ctx.save();
      ctx.filter = `blur(${glowBlur}px)`;
      buildStarPath();
      ctx.strokeStyle = hexWithAlpha(secondaryColor, 0.55 * glowIntensity);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      buildStarPath();
      ctx.strokeStyle = hexWithAlpha(secondaryColor, 0.85);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 4. INNER CORE — pulsing brightness
    {
      const pulse = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * pulseCycles));
      const corePt = proj3(0, 0, 0);

      ctx.save();
      ctx.filter = `blur(${6 + glowIntensity * 14}px)`;
      ctx.beginPath();
      ctx.arc(corePt.x, corePt.y, innerRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(primaryColor, pulse * glowIntensity * 0.8);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(corePt.x, corePt.y, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(primaryColor, pulse);
      ctx.fill();
    }

    // 5. PARTICLES orbiting in XZ plane
    for (let pi = 0; pi < particleCount; pi++) {
      const phase = (pi / particleCount) * Math.PI * 2;
      const tier = pi % 3;
      const orbitR_local = 0.3 + tier * 0.25;
      const orbitN = 2 + tier;
      const a = phase + t * Math.PI * 2 * orbitN;
      const p = proj3(Math.cos(a) * orbitR_local, 0, Math.sin(a) * orbitR_local);
      const sparkR = 2 + (pi % 2);

      ctx.save();
      ctx.filter = 'blur(3px)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, sparkR * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(primaryColor, 0.35 * glowIntensity);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(p.x, p.y, sparkR, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(primaryColor, 0.9);
      ctx.fill();
    }

    // 6. OUTER PULSE RING — 3D ring expanding from 0 to local radius 1
    {
      const r_local = t;
      const alpha = (1 - r_local) * 0.7;

      const buildPulseRing = () => {
        const N = 80;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const p = proj3(Math.cos(a) * r_local, 0, Math.sin(a) * r_local);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      };

      ctx.save();
      ctx.filter = 'blur(2px)';
      buildPulseRing();
      ctx.strokeStyle = hexWithAlpha(primaryColor, alpha * glowIntensity);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      buildPulseRing();
      ctx.strokeStyle = hexWithAlpha(primaryColor, alpha * 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'magic-circle',
    name: 'Magic Circle',
    categoryId: 'energy',
    defaultBlend: 'lighter',
    description: 'Rotating summoning sigil with concentric rune rings, geometric star connectors, and pulsing particle bursts.',
    render: renderMagicCircleFrame,
    params: [
      { key: 'primaryColor',     label: 'Primary Color',     type: 'color',  default: '#aa44ff' },
      { key: 'secondaryColor',   label: 'Secondary Color',   type: 'color',  default: '#4488ff' },
      { key: 'centerX',          label: 'Center X',          type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'centerY',          label: 'Center Y',          type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'ringCount',        label: 'Ring Count',        type: 'slider', min: 1,   max: 6,   step: 1,    default: 3    },
      { key: 'radius',           label: 'Radius',            type: 'slider', min: 0.1, max: 0.9, step: 0.02, default: 0.42 },
      { key: 'glyphCount',       label: 'Glyph Count',       type: 'slider', min: 3,   max: 16,  step: 1,    default: 8    },
      { key: 'starPoints',       label: 'Star Points',       type: 'slider', min: 3,   max: 12,  step: 1,    default: 6    },
      { key: 'beamCount',        label: 'Beam Count',        type: 'slider', min: 0,   max: 16,  step: 1,    default: 6    },
      { key: 'rotationCycles',   label: 'Rotation Cycles',   type: 'slider', min: 1,   max: 6,   step: 1,    default: 2    },
      { key: 'pulseCycles',      label: 'Pulse Cycles',      type: 'slider', min: 1,   max: 6,   step: 1,    default: 3    },
      { key: 'particleCount',    label: 'Particle Count',    type: 'slider', min: 0,   max: 40,  step: 1,    default: 12   },
      { key: 'glowIntensity',    label: 'Glow Intensity',    type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.5  },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -90 } : p)
    ],
    noRandomize: ['centerX', 'centerY']
  });
})();
