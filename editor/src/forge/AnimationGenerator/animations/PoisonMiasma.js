(function () {
  function renderPoisonMiasmaFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const { primaryColor, bubbleColor, cloudCount, spread, riseCycles, bubbleCount, opacity } = params;
    const rc = Math.round(riseCycles);

    const effectRadius = Math.min(w, h) * 0.5 * params.spread * 2;
    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    const secondaryColor = mixHexColors(primaryColor, '#220033', 0.45);
    const darkColor      = mixHexColors(primaryColor, '#001100', 0.75);
    const acidColor      = mixHexColors(primaryColor, '#ccff00', 0.35);
    const wispColor      = mixHexColors(primaryColor, '#88ff44', 0.35);

    // stable pseudo-random helpers
    const rA = (s) => Math.abs(Math.sin(s * 127.1 + 311.7)) % 1;
    const rB = (s) => Math.abs(Math.sin(s * 61.3  + 199.1)) % 1;

    // ── 1. DRIPPING TENDRILS (drawn behind cloud) ─────────────────────────
    const dripCount = 7;
    for (let i = 0; i < dripCount; i++) {
      const angle  = (i / dripCount) * Math.PI * 2;
      const baseR  = 0.5 + rA(i + 300) * 0.25;
      const lx     = Math.cos(angle) * baseR;
      const lz     = Math.sin(angle) * baseR * 0.55;
      const pulse  = Math.sin(t * Math.PI * 2 * 2 + i * 0.8) * 0.5 + 0.5;
      const dripL  = 0.12 + pulse * 0.14;

      const base = proj3(lx, 0, lz);
      const tip  = proj3(lx, -dripL, lz);
      const alpha = opacity * (0.35 + 0.15 * pulse);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.strokeStyle = hexWithAlpha(darkColor, alpha);
      ctx.lineWidth   = Math.max(1.5, effectRadius * 0.045 * (1 - pulse * 0.25));
      ctx.lineCap     = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, Math.max(1.5, effectRadius * 0.028), 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(darkColor, alpha);
      ctx.fill();
      ctx.restore();
    }

    // ── 2. GROUND CLOUD PUFFS ─────────────────────────────────────────────
    const puffBlur = effectRadius * 0.19;
    for (let i = 0; i < cloudCount; i++) {
      const angle  = (i / cloudCount) * Math.PI * 2;
      const baseR  = 0.5 + rA(i) * 0.3;
      const drift  = Math.sin(t * Math.PI * 2 * rc + i * 1.3) * 0.06;
      const lx     = Math.cos(angle) * (baseR + drift);
      const lz     = Math.sin(angle) * (baseR + drift) * 0.55;
      const ly     = -0.05 + Math.sin(t * Math.PI * 2 * rc + i * 0.7) * 0.045;

      const p      = proj3(lx, ly, lz);
      const puffR  = effectRadius * (0.21 + rB(i) * 0.13);
      const alpha  = opacity * (0.55 + 0.2 * Math.sin(t * Math.PI * 2 * 2 + i * 1.1));
      const puffColor = mixHexColors(primaryColor, secondaryColor, (baseR / 0.8) * 0.65);

      ctx.save();
      ctx.filter = `blur(${puffBlur}px)`;
      for (let j = 0; j < 4; j++) {
        const ox = (rA(i * 10 + j) - 0.5) * puffR * 0.65;
        const oy = (rB(i * 10 + j) - 0.5) * puffR * 0.45;
        const or = puffR * (0.72 + rA(i * 7 + j) * 0.38);
        ctx.beginPath();
        ctx.arc(p.x + ox, p.y + oy, or, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(puffColor, alpha * (0.55 + j * 0.1));
        ctx.fill();
      }
      ctx.restore();
    }

    // ── 3. TOXIC CORE GLOW ────────────────────────────────────────────────
    const corePt     = proj3(0, 0.08, 0);
    const coreRadius = effectRadius * (0.32 + 0.1 * Math.sin(t * Math.PI * 2 * 2));

    ctx.save();
    ctx.filter = `blur(${effectRadius * 0.16}px)`;
    ctx.beginPath();
    ctx.arc(corePt.x, corePt.y, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha(acidColor, opacity * 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(corePt.x, corePt.y, coreRadius * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha('#aaffaa', opacity * 0.5);
    ctx.fill();
    ctx.restore();

    // ── 4. RISING WISPS ───────────────────────────────────────────────────
    const wispTotal = cloudCount * 2;
    for (let i = 0; i < wispTotal; i++) {
      const angle  = (i / wispTotal) * Math.PI * 2 + 0.3;
      const baseR  = 0.3 + rA(i + 50) * 0.4;
      const lx     = Math.cos(angle) * baseR;
      const lz     = Math.sin(angle) * baseR * 0.5;
      const sway   = Math.sin(t * Math.PI * 2 * rc + i * 1.9) * 0.07;
      const riseH  = 0.45 + rB(i + 50) * 0.45;

      const life   = ((t * rc + i / wispTotal) % 1 + 1) % 1;
      const alpha  = Math.sin(life * Math.PI) * opacity * 0.55;
      if (alpha <= 0) continue;

      const base   = proj3(lx, -0.05, lz);
      const mid    = proj3(lx + sway * 0.5, riseH * 0.5, lz);
      const tip    = proj3(lx + sway, riseH, lz);

      ctx.save();
      ctx.filter = `blur(${effectRadius * 0.035}px)`;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
      const grad = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
      grad.addColorStop(0,   hexWithAlpha(primaryColor, alpha * 0.85));
      grad.addColorStop(0.5, hexWithAlpha(wispColor,    alpha * 0.5));
      grad.addColorStop(1,   hexWithAlpha('#ccff44',    alpha * 0.12));
      ctx.strokeStyle = grad;
      ctx.lineWidth   = Math.max(1, effectRadius * 0.052 * (1 - life * 0.55));
      ctx.lineCap     = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // ── 5. TOXIC BUBBLES ──────────────────────────────────────────────────
    for (let i = 0; i < bubbleCount; i++) {
      const angle = (i / bubbleCount) * Math.PI * 2;
      const bxL   = Math.cos(angle) * (0.28 + rA(i + 100) * 0.38);
      const bzL   = Math.sin(angle) * (0.28 + rB(i + 100) * 0.28) * 0.5;
      const life  = ((t * rc + i / bubbleCount) % 1 + 1) % 1;
      const riseL = life * (0.55 + rA(i + 200) * 0.4);
      const swayX = Math.sin(life * Math.PI * 3 + i * 1.9) * 0.04;

      const p = proj3(bxL + swayX, riseL, bzL);

      // pop: alpha spikes then collapses at top
      let alpha;
      if (life > 0.85) {
        alpha = opacity * 0.7 * (1 - (life - 0.85) / 0.15);
      } else {
        alpha = Math.sin(life * Math.PI) * opacity * 0.65;
      }
      if (alpha <= 0) continue;

      const expand = life > 0.85 ? 1 + (life - 0.85) * 3.5 : 1;
      const br = (3 + rA(i + 100) * 5) * expand;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
      ctx.strokeStyle = hexWithAlpha(bubbleColor, alpha);
      ctx.lineWidth   = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x - br * 0.3, p.y - br * 0.3, br * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha('#ffffff', alpha * 0.5);
      ctx.fill();
      ctx.restore();
    }

    // ── 6. FLOATING SPORES ────────────────────────────────────────────────
    const sporeCount = Math.max(1, Math.floor(bubbleCount / 2));
    for (let i = 0; i < sporeCount; i++) {
      const life      = ((t * rc + i / sporeCount + rA(i + 400) * 0.5) % 1 + 1) % 1;
      const driftAngle = rA(i + 400) * Math.PI * 2;
      const elevAngle  = (rB(i + 400) - 0.3) * Math.PI * 0.5;
      const dist  = life * (0.55 + rA(i + 500) * 0.45);
      const lx    = Math.cos(driftAngle) * Math.cos(elevAngle) * dist;
      const ly    = Math.sin(elevAngle) * dist * 0.5 + 0.08;
      const lz    = Math.sin(driftAngle) * Math.cos(elevAngle) * dist * 0.5;

      const p     = proj3(lx, ly, lz);
      const alpha = Math.sin(life * Math.PI) * opacity * 0.75;
      if (alpha <= 0) continue;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5 + rB(i + 400), 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(primaryColor, alpha);
      ctx.fill();
      ctx.restore();
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'poison-miasma',
    name:         'Poison Miasma',
    categoryId:   'effect',
    description:  'Menacing 3D toxic gas cloud with billowing ground puffs, rising wisps, popping bubbles, dripping tendrils, and drifting spores.',
    defaultBlend: 'source-over',
    render:       renderPoisonMiasmaFrame,
    noRandomize:  ['centerX', 'centerY'],
    params: [
      { key: 'primaryColor', label: 'Primary Color', type: 'color',  default: '#44cc22' },
      { key: 'bubbleColor',  label: 'Bubble Color',  type: 'color',  default: '#aaffaa' },
      { key: 'centerX',      label: 'Center X',      type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'centerY',      label: 'Center Y',      type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.6  },
      { key: 'cloudCount',   label: 'Cloud Count',   type: 'slider', min: 3,   max: 12,  step: 1,    default: 6    },
      { key: 'spread',       label: 'Spread',        type: 'slider', min: 0.1, max: 0.7, step: 0.02, default: 0.35 },
      { key: 'riseCycles',   label: 'Rise Cycles',   type: 'slider', min: 1,   max: 4,   step: 1,    default: 2    },
      { key: 'bubbleCount',  label: 'Bubble Count',  type: 'slider', min: 0,   max: 30,  step: 1,    default: 15   },
      { key: 'opacity',      label: 'Opacity',       type: 'slider', min: 0.1, max: 1,   step: 0.05, default: 0.7  },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -60 } : p),
    ],
  });
})();
