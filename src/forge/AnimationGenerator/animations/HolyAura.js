(function () {
  function renderHolyAuraFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const actualRadius = Math.min(w, h) * 0.5 * params.auraRadius;
    const effectRadius = actualRadius;
    const primaryColor = params.primaryColor;
    const beamColor = params.beamColor;
    const moteColor = params.moteColor;
    const beamCount = params.beamCount;
    const moteCount = params.moteCount;
    const pc = Math.round(params.pulseCycles);
    const moteSize = params.moteSize;

    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    // 1. OUTER RING — 3D ring in XZ plane
    const N = 80;
    const ringPoints = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      ringPoints.push(proj3(Math.cos(a), 0, Math.sin(a)));
    }

    ctx.save();
    ctx.filter = `blur(${actualRadius * 0.15}px)`;
    ctx.beginPath();
    ctx.moveTo(ringPoints[0].x, ringPoints[0].y);
    for (let i = 1; i <= N; i++) ctx.lineTo(ringPoints[i].x, ringPoints[i].y);
    ctx.closePath();
    ctx.strokeStyle = hexWithAlpha(primaryColor, 0.3);
    ctx.lineWidth = actualRadius * 0.3;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ringPoints[0].x, ringPoints[0].y);
    for (let i = 1; i <= N; i++) ctx.lineTo(ringPoints[i].x, ringPoints[i].y);
    ctx.closePath();
    ctx.strokeStyle = hexWithAlpha(primaryColor, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 2. LIGHT BEAMS — primary, as 3D triangles in XZ plane
    for (let i = 0; i < beamCount; i++) {
      const beamAngle = (i / beamCount) * Math.PI * 2 + t * Math.PI * 2 * pc;
      const s = Math.sin(t * Math.PI * 2 * pc + (i / beamCount) * Math.PI * 2);
      const alpha = 0.4 + 0.4 * s * s;
      const tip   = proj3(Math.cos(beamAngle) * 1.1, 0, Math.sin(beamAngle) * 1.1);
      const base1 = proj3(Math.cos(beamAngle - 0.02) * 0, 0, Math.sin(beamAngle - 0.02) * 0);
      const base2 = proj3(Math.cos(beamAngle + 0.02) * 0, 0, Math.sin(beamAngle + 0.02) * 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = beamColor;
      ctx.beginPath();
      ctx.moveTo(base1.x, base1.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(base2.x, base2.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Secondary beams at half-angle offsets
    for (let i = 0; i < beamCount; i++) {
      const beamAngle = ((i + 0.5) / beamCount) * Math.PI * 2 + t * Math.PI * 2 * pc;
      const s = Math.sin(t * Math.PI * 2 * pc + ((i + 0.5) / beamCount) * Math.PI * 2);
      const alpha = (0.4 + 0.4 * s * s) * 0.5;
      const tip   = proj3(Math.cos(beamAngle) * 0.88, 0, Math.sin(beamAngle) * 0.88);
      const base1 = proj3(Math.cos(beamAngle - 0.02) * 0, 0, Math.sin(beamAngle - 0.02) * 0);
      const base2 = proj3(Math.cos(beamAngle + 0.02) * 0, 0, Math.sin(beamAngle + 0.02) * 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = beamColor;
      ctx.beginPath();
      ctx.moveTo(base1.x, base1.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(base2.x, base2.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 3. CENTER GLOW — anchored to proj3(0,0,0)
    const center = proj3(0, 0, 0);
    const pulseScale = 0.85 + 0.15 * Math.sin(t * Math.PI * 2 * pc);

    ctx.save();
    ctx.filter = `blur(${actualRadius * 0.2}px)`;
    ctx.beginPath();
    ctx.arc(center.x, center.y, actualRadius * 0.5 * pulseScale, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha(primaryColor, 0.5);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, actualRadius * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha(primaryColor, 0.8);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, actualRadius * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha('#ffffff', 0.9);
    ctx.fill();
    ctx.restore();

    // 4. ORBITING MOTES with trails, in XZ plane
    for (let i = 0; i < moteCount; i++) {
      const orbitAngle = (i / moteCount) * Math.PI * 2 + t * Math.PI * 2 * pc;
      const moteRadius_local = 0.6 + 0.1 * Math.sin(t * Math.PI * 2 * pc * 2 + i * 0.7);
      const p = proj3(Math.cos(orbitAngle) * moteRadius_local, 0, Math.sin(orbitAngle) * moteRadius_local);
      const sizeSin = Math.sin(t * Math.PI * 2 * pc + i * 1.3);
      const size = moteSize * (0.7 + 0.3 * sizeSin);
      const alphaSin = Math.sin(t * Math.PI * 2 * (pc * 2) + i * 2.1);
      const alpha = 0.7 + 0.3 * alphaSin * alphaSin;

      for (let j = 1; j <= 3; j++) {
        const trailAngle = orbitAngle - j * 0.06;
        const tp = proj3(Math.cos(trailAngle) * moteRadius_local, 0, Math.sin(trailAngle) * moteRadius_local);
        const trailAlpha = alpha * (1 - j * 0.3);
        const trailSize = Math.max(0.5, size * (1 - j * 0.18) * 0.6);
        ctx.save();
        ctx.globalAlpha = Math.max(0, trailAlpha);
        ctx.fillStyle = moteColor;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, trailSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = moteColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = moteColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. OUTER SPARKLE RING — at local radius ~0.98 in XZ plane
    for (let i = 0; i < moteCount; i++) {
      const sparkleAngle = (i / moteCount) * Math.PI * 2 + t * Math.PI * 2 * 1;
      const sp = proj3(Math.cos(sparkleAngle) * 0.98, 0, Math.sin(sparkleAngle) * 0.98);
      const sparkleSin = Math.sin(t * Math.PI * 2 * pc + i * 0.8);
      const sparkleAlpha = 0.3 + 0.5 * sparkleSin;
      const sparkleSize = 1.5 + 1.5 * Math.abs(sparkleSin);
      ctx.save();
      ctx.globalAlpha = Math.max(0, sparkleAlpha);
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sparkleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'holy-aura',
    name: 'Holy Aura',
    categoryId: 'energy',
    defaultBlend: 'lighter',
    render: renderHolyAuraFrame,
    params: [
      { key: 'primaryColor', label: 'Primary Color', type: 'color',  default: '#ffffaa' },
      { key: 'beamColor',    label: 'Beam Color',    type: 'color',  default: '#ffffff' },
      { key: 'moteColor',    label: 'Mote Color',    type: 'color',  default: '#ffee66' },
      { key: 'centerX',     label: 'Center X',      type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'centerY',     label: 'Center Y',      type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'auraRadius',  label: 'Aura Radius',   type: 'slider', min: 0.1, max: 0.7, step: 0.02, default: 0.38 },
      { key: 'beamCount',   label: 'Beam Count',    type: 'slider', min: 4,   max: 20,  step: 1,    default: 8    },
      { key: 'moteCount',   label: 'Mote Count',    type: 'slider', min: 3,   max: 20,  step: 1,    default: 8    },
      { key: 'pulseCycles', label: 'Pulse Cycles',  type: 'slider', min: 1,   max: 6,   step: 1,    default: 3    },
      { key: 'moteSize',    label: 'Mote Size',     type: 'slider', min: 2,   max: 12,  step: 1,    default: 5    },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -90 } : p),
    ],
    noRandomize: ['centerX', 'centerY'],
  });
})();
