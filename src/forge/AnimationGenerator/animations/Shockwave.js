(function () {
  function renderShockwaveFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const maxRadius = Math.min(w, h) * 0.5 * params.maxRadius;
    const effectRadius = maxRadius;
    const ringCount = params.ringCount;
    const thickness = params.thickness;
    const debrisCount = params.debrisCount;
    const waveColor = params.waveColor;
    const debrisColor = params.debrisColor;

    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    // ── 1. GROUND CRACK LINES ────────────────────────────────────────────────
    if (debrisCount > 0) {
      for (let i = 0; i < debrisCount; i++) {
        const rnd = Math.abs(Math.sin(i * 127.1 + 311.7)) % 1;
        const baseAngle = (i / debrisCount) * Math.PI * 2 + (rnd - 0.5) * 0.3;
        const crackLength = maxRadius * (0.6 + rnd * 0.4);
        const crackAlpha = 0.7 * (1 - t * 0.5);

        ctx.save();
        ctx.globalAlpha = crackAlpha;
        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 1.5 + rnd * 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const seg1Local = (crackLength * 0.35) / effectRadius;
        const seg2Local = (crackLength * 0.35) / effectRadius;
        const seg3Local = (crackLength * 0.30) / effectRadius;

        const a1 = baseAngle + Math.sin(i * 3.7) * 0.15;
        const a2 = baseAngle + Math.sin(i * 7.1) * 0.25;
        const a3 = baseAngle + Math.sin(i * 13.3) * 0.2;

        const p0 = proj3(0, 0, 0);
        const p1 = proj3(Math.cos(a1) * seg1Local, 0, Math.sin(a1) * seg1Local);
        const lx2 = Math.cos(a1) * seg1Local + Math.cos(a2) * seg2Local;
        const lz2 = Math.sin(a1) * seg1Local + Math.sin(a2) * seg2Local;
        const p2 = proj3(lx2, 0, lz2);
        const p3 = proj3(lx2 + Math.cos(a3) * seg3Local, 0, lz2 + Math.sin(a3) * seg3Local);

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 2. SHOCKWAVE RINGS ───────────────────────────────────────────────────
    const N = 80;
    for (let i = 0; i < ringCount; i++) {
      const phaseOffset = i / ringCount;
      const life = (t + phaseOffset) % 1;
      const rLocal = life * 1.0;
      const alpha = Math.pow(1 - life, 0.7) * 0.9;
      const lw = thickness * (1 - life * 0.8) + 1;
      const ringColor = mixHexColors(waveColor, debrisColor, life);

      // Glow pass
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.filter = 'blur(' + (lw * 0.5) + 'px)';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = lw * 1.8;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * Math.PI * 2;
        const p = proj3(Math.cos(a) * rLocal, 0, Math.sin(a) * rLocal);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Crisp pass
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * Math.PI * 2;
        const p = proj3(Math.cos(a) * rLocal, 0, Math.sin(a) * rLocal);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // ── 3. DEBRIS PARTICLES ──────────────────────────────────────────────────
    const totalDebris = debrisCount * 2;
    for (let i = 0; i < totalDebris; i++) {
      const angle = (i / totalDebris) * Math.PI * 2 + Math.sin(i * 5.7) * 0.4;
      const life = (t + i * 0.07) % 1;
      const speed = 0.7 + Math.sin(i * 11.3) * 0.3;
      const rLocal = life * speed;
      const p = proj3(Math.cos(angle) * rLocal, Math.sin(life * Math.PI) * 0.2, Math.sin(angle) * rLocal);
      const size = (1 - life) * 4 + 1;
      const alpha = Math.sin(life * Math.PI) * 0.8;
      const debrisColorMixed = mixHexColors(waveColor, debrisColor, Math.min(1, life * 1.5));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = debrisColorMixed;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── 4. CENTRAL IMPACT FLASH ──────────────────────────────────────────────
    const flashAlpha = (1 - Math.min(1, t * 4)) * 0.9;
    if (flashAlpha > 0) {
      const pc = proj3(0, 0, 0);

      ctx.save();
      ctx.globalAlpha = flashAlpha;
      ctx.filter = 'blur(' + (maxRadius * 0.15) + 'px)';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pc.x, pc.y, maxRadius * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.8;
      ctx.fillStyle = waveColor;
      ctx.beginPath();
      ctx.arc(pc.x, pc.y, maxRadius * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── 5. SECONDARY RIPPLE ──────────────────────────────────────────────────
    const life2 = Math.max(0, t - 0.3) / 0.7;
    if (life2 > 0) {
      const r2Local = life2 * 1.3;
      const alpha2 = (1 - life2) * 0.4;
      ctx.save();
      ctx.globalAlpha = alpha2;
      ctx.strokeStyle = waveColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const a = (j / N) * Math.PI * 2;
        const p = proj3(Math.cos(a) * r2Local, 0, Math.sin(a) * r2Local);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'shockwave',
    name: 'Shockwave',
    categoryId: 'physical',
    defaultBlend: 'source-over',
    description: 'Concentric shockwave rings with ground-crack radial lines, debris particles, and a central impact flash.',
    render: renderShockwaveFrame,
    noRandomize: ['centerX', 'centerY'],
    params: [
      { key: 'waveColor',   label: 'Wave Color',    type: 'color',  default: '#aaddff' },
      { key: 'debrisColor', label: 'Debris Color',  type: 'color',  default: '#886644' },
      { key: 'centerX',     label: 'Center X',      type: 'slider', min: 0,   max: 1,    step: 0.02, default: 0.5  },
      { key: 'centerY',     label: 'Center Y',      type: 'slider', min: 0,   max: 1,    step: 0.02, default: 0.55 },
      { key: 'maxRadius',   label: 'Max Radius',    type: 'slider', min: 0.1, max: 1.0,  step: 0.02, default: 0.45 },
      { key: 'ringCount',   label: 'Ring Count',    type: 'slider', min: 1,   max: 5,    step: 1,    default: 2    },
      { key: 'thickness',   label: 'Ring Thickness',type: 'slider', min: 1,   max: 20,   step: 1,    default: 8    },
      { key: 'debrisCount', label: 'Debris Count',  type: 'slider', min: 0,   max: 24,   step: 1,    default: 12   },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -70 } : p),
    ],
  });
}());
