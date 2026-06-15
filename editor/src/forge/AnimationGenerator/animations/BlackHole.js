(function () {
  function renderBlackHoleFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const actualRadius = Math.min(w, h) * 0.5 * params.diskRadius;
    const effectRadius = actualRadius;
    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    const rotationCycles = Math.round(params.rotationCycles);
    const diskAngle = t * Math.PI * 2 * rotationCycles;
    const alpha = params.diskBrightness;
    const lensArcs = Math.round(params.lensArcs);
    const particleCount = Math.round(params.particleCount);
    const step = 0.05;

    // --- 1. ACCRETION DISK GLOW ---
    ctx.save();
    ctx.filter = 'blur(8px)';
    for (let a = 0; a < Math.PI * 2; a += step) {
      const aRot = a + diskAngle;
      const intensity = 0.5 + 0.5 * Math.sin(a * 3 + diskAngle * 2);
      const color = mixHexColors(params.diskColor, '#ffffff', intensity * 0.4);
      const p1 = proj3(Math.cos(aRot) * 0.35, 0, Math.sin(aRot) * 0.35);
      const p2 = proj3(Math.cos(aRot) * 1.0,  0, Math.sin(aRot) * 1.0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = hexWithAlpha(color, alpha * 0.8);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    // --- 2. ACCRETION DISK ---
    for (let a = 0; a < Math.PI * 2; a += step) {
      const aRot = a + diskAngle;
      const intensity = 0.5 + 0.5 * Math.sin(a * 3 + diskAngle * 2);
      const color = mixHexColors(params.diskColor, '#ffffff', intensity * 0.4);
      const p1 = proj3(Math.cos(aRot) * 0.35, 0, Math.sin(aRot) * 0.35);
      const p2 = proj3(Math.cos(aRot) * 1.0,  0, Math.sin(aRot) * 1.0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = hexWithAlpha(color, alpha * 0.6);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // --- 3. GRAVITATIONAL LENSING ARCS ---
    ctx.save();
    ctx.filter = 'blur(3px)';
    const arcN = 40;
    const arcSpan = Math.PI * 0.8;
    for (let i = 0; i < lensArcs; i++) {
      const arcAlpha = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * rotationCycles + i);
      const startAngle = diskAngle + i * Math.PI / lensArcs;
      ctx.beginPath();
      for (let j = 0; j <= arcN; j++) {
        const ang = startAngle + (j / arcN) * arcSpan;
        const p = proj3(Math.cos(ang) * 0.45, 0, Math.sin(ang) * 0.45);
        j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = hexWithAlpha(params.lensColor, arcAlpha * alpha);
      ctx.lineWidth = i % 2 === 0 ? 2 : 4;
      ctx.stroke();
    }
    ctx.restore();

    // --- 4. INFALLING PARTICLES ---
    for (let i = 0; i < particleCount; i++) {
      const phase = i / particleCount;
      const orbit = ((t * rotationCycles * 2 + phase) % 1 + 1) % 1;
      const r_local = 1.0 - orbit * 0.7;
      const angle = orbit * Math.PI * 4 + phase * Math.PI * 2 + diskAngle;
      const p = proj3(Math.cos(angle) * r_local, 0, Math.sin(angle) * r_local);
      const pAlpha = (1 - orbit) * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(params.diskColor, pAlpha * alpha);
      ctx.fill();
    }

    // --- 5. EVENT HORIZON ---
    const horizonN = 48;
    ctx.beginPath();
    for (let j = 0; j <= horizonN; j++) {
      const ang = (j / horizonN) * Math.PI * 2;
      const p = proj3(Math.cos(ang) * 0.35, 0, Math.sin(ang) * 0.35);
      j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = '#000000';
    ctx.fill();

    // --- 6. RELATIVISTIC JETS ---
    const halfCount = Math.max(1, Math.floor(particleCount / 2));
    for (let i = 0; i < 2; i++) {
      const dirY = i === 0 ? 1 : -1;
      for (let j = 0; j < halfCount; j++) {
        const life = ((t * rotationCycles + j / particleCount) % 1 + 1) % 1;
        const wobble = Math.sin(t * Math.PI * 4 + j * 0.7) * 0.2;
        const p = proj3(wobble, dirY * life * 2, 0);
        const jAlpha = (1 - life) * 0.8;
        const size = 2 + 2 * (1 - life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(params.lensColor, jAlpha * alpha);
        ctx.fill();
      }
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'black-hole',
    name: 'Black Hole',
    categoryId: 'energy',
    defaultBlend: 'source-over',
    description: 'Dark singularity with a rotating accretion disk, gravitational lensing arcs, and spiraling particle jets.',
    render: renderBlackHoleFrame,
    params: [
      { key: 'diskColor',       label: 'Disk Color',       type: 'color',  default: '#ff8833' },
      { key: 'lensColor',       label: 'Lens Color',       type: 'color',  default: '#ffffff' },
      { key: 'centerX',         label: 'Center X',         type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'centerY',         label: 'Center Y',         type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'diskRadius',      label: 'Disk Radius',      type: 'slider', min: 0.1, max: 0.6, step: 0.02, default: 0.35 },
      { key: 'rotationCycles',  label: 'Rotation Cycles',  type: 'slider', min: 1,   max: 6,   step: 1,    default: 2    },
      { key: 'lensArcs',        label: 'Lens Arcs',        type: 'slider', min: 1,   max: 6,   step: 1,    default: 3    },
      { key: 'particleCount',   label: 'Particle Count',   type: 'slider', min: 0,   max: 50,  step: 1,    default: 20   },
      { key: 'diskBrightness',  label: 'Disk Brightness',  type: 'slider', min: 0.1, max: 1,   step: 0.05, default: 0.8  },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -60 } : p)
    ],
    noRandomize: ['centerX', 'centerY']
  });
})();
