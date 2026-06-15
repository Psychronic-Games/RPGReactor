(function () {
  function renderChromaticPulseFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const effectRadius = Math.min(w, h) * 0.5 * params.maxRadius;
    const ringCount = Math.round(params.ringCount);
    const pulseCycles = Math.round(params.pulseCycles);
    const ringWidth = params.ringWidth;
    const aberrationStrength = params.aberrationStrength;
    const particleCount = Math.round(params.particleCount);

    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    const N = 64;

    const drawRingStroke = (rLocal, aberX, color, alpha, lw) => {
      if (alpha <= 0 || rLocal <= 0) return;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * Math.PI * 2;
        const p = proj3(Math.cos(a) * rLocal + aberX, 0, Math.sin(a) * rLocal);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = hexWithAlpha(color, alpha);
      ctx.lineWidth = lw;
      ctx.stroke();
    };

    const drawRingFill = (rLocal, aberX, color, alpha) => {
      if (alpha <= 0 || rLocal <= 0) return;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * Math.PI * 2;
        const p = proj3(Math.cos(a) * rLocal + aberX, 0, Math.sin(a) * rLocal);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = hexWithAlpha(color, alpha);
      ctx.fill();
    };

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // --- Concentric rings with chromatic aberration ---
    for (let i = 0; i < ringCount; i++) {
      const phaseOffset = i / ringCount;
      const life = ((t * pulseCycles + phaseOffset) % 1 + 1) % 1;
      const r_local = life;
      const alpha = (1 - life) * (life < 0.1 ? life * 10 : 1) * 0.7;
      const lw = ringWidth * (1 - life * 0.7);
      const aberOffset = aberrationStrength * life * 0.06;

      if (alpha <= 0 || r_local <= 0) continue;

      drawRingStroke(r_local,  aberOffset, '#ff0000', alpha,       lw);
      drawRingStroke(r_local,  0,          '#00ff00', alpha * 0.8, lw);
      drawRingStroke(r_local, -aberOffset, '#0088ff', alpha,       lw);
    }

    // --- Inner pulse ---
    const pulseSin = Math.sin(t * Math.PI * 2 * pulseCycles);
    const r_inner = 0.15 * (0.5 + 0.5 * pulseSin);
    const pulseAlpha = 0.4 + 0.4 * pulseSin;
    const innerAber = aberrationStrength * 0.03;

    if (r_inner > 0 && pulseAlpha > 0) {
      drawRingFill(r_inner,  innerAber, '#ff0000', pulseAlpha);
      drawRingFill(r_inner,  0,         '#00ff00', pulseAlpha * 0.8);
      drawRingFill(r_inner, -innerAber, '#0088ff', pulseAlpha);
    }

    // --- Scanline overlay (2D screen-space) ---
    if (aberrationStrength > 0.3) {
      const scanlineAlpha = aberrationStrength * 0.2;
      ctx.fillStyle = hexWithAlpha('#ffffff', scanlineAlpha);
      for (let i = 0; i < 4; i++) {
        const sy = cy + Math.sin(t * Math.PI * 2 * pulseCycles + i * 1.3) * effectRadius * 0.7;
        ctx.fillRect(cx - effectRadius, sy - 1, effectRadius * 2, 2);
      }
    }

    // --- Energy particles ---
    const particleColors = ['#ff4444', '#44ff44', '#4488ff'];
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + t * Math.PI * 2;
      const life = ((t * pulseCycles + i / particleCount) % 1 + 1) % 1;
      const r_local = life * 1.0;
      const p = proj3(Math.cos(angle) * r_local, 0, Math.sin(angle) * r_local);
      const size = 1.5 + (1 - life) * 2;
      const palpha = (1 - life) * 0.6;

      if (palpha <= 0) continue;

      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(particleColors[i % 3], palpha);
      ctx.fill();
    }

    ctx.restore();
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'chromatic-pulse',
    name: 'Chromatic Pulse',
    categoryId: 'effect',
    defaultBlend: 'screen',
    description: 'Concentric expanding rings with RGB chromatic aberration split, creating a digital glitch energy pulse.',
    params: [
      { key: 'centerX',           label: 'Center X',            type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'centerY',           label: 'Center Y',            type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'maxRadius',         label: 'Max Radius',          type: 'slider', min: 0.1, max: 1.0, step: 0.02, default: 0.45 },
      { key: 'ringCount',         label: 'Ring Count',          type: 'slider', min: 1,   max: 8,   step: 1,    default: 4    },
      { key: 'pulseCycles',       label: 'Pulse Cycles',        type: 'slider', min: 1,   max: 6,   step: 1,    default: 2    },
      { key: 'ringWidth',         label: 'Ring Width',          type: 'slider', min: 1,   max: 20,  step: 1,    default: 6    },
      { key: 'aberrationStrength',label: 'Aberration Strength', type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.5  },
      { key: 'particleCount',     label: 'Particle Count',      type: 'slider', min: 0,   max: 40,  step: 1,    default: 16   },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -90 } : p),
    ],
    noRandomize: ['centerX', 'centerY'],
    render: renderChromaticPulseFrame,
  });
})();
