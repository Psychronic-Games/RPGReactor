(function () {
  function renderGalaxySpiralFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const cx = w * params.centerX;
    const cy = h * params.centerY;
    const effectRadius = Math.min(w, h) * 0.5 * params.maxRadius;
    const armCount = Math.round(params.armCount);
    const starsPerArm = Math.round(params.starsPerArm);
    const starCount = Math.round(params.starCount);
    const rotationCycles = Math.round(params.rotationCycles);
    const rotationAngle = t * Math.PI * 2 * rotationCycles;

    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
      const r = transform([lx, ly, lz]);
      const d = 3.5;
      const dz = d - r[2];
      const s = dz > 0.15 ? d / dz : d / 0.15;
      return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
    };

    function spiralPos(k, s) {
      const armAngleOffset = k * (Math.PI * 2 / armCount);
      const spiralAngle = armAngleOffset + s * Math.PI * 2.5 + rotationAngle;
      const lx = Math.cos(spiralAngle) * s;
      const lz = Math.sin(spiralAngle) * s;
      const p = proj3(lx, 0, lz);
      return { x: p.x, y: p.y, z: p.z, s };
    }

    // 1. NEBULA GLOW
    for (let k = 0; k < armCount; k++) {
      const pos = spiralPos(k, 0.55);
      const nebulaColor = mixHexColors(params.armColor, params.coreColor, 0.5);
      ctx.save();
      ctx.filter = 'blur(30px)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, effectRadius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = hexWithAlpha(nebulaColor, 0.25);
      ctx.fill();
      ctx.restore();
    }

    // 2+3. SPIRAL ARMS (wisps then dust-lane stars)
    for (let k = 0; k < armCount; k++) {
      const positions = [];
      for (let j = 0; j < starsPerArm; j++) {
        const s = 0.05 + (j / Math.max(1, starsPerArm - 1)) * 0.95;
        positions.push(spiralPos(k, s));
      }

      // 3. Arm nebula wisps — per-segment for tapered lineWidth
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = params.armColor;
      for (let j = 0; j < positions.length - 1; j++) {
        const s = positions[j].s;
        ctx.beginPath();
        ctx.lineWidth = 4 + s * 8;
        ctx.moveTo(positions[j].x, positions[j].y);
        ctx.lineTo(positions[j + 1].x, positions[j + 1].y);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Dust-lane stars
      for (let j = 0; j < starsPerArm; j++) {
        const { x, y, s } = positions[j];
        const starColor = mixHexColors(params.coreColor, params.armColor, Math.min(1, s * 2));
        const brightness = 1 - s * 0.5;
        const brightVar = 0.7 + 0.3 * Math.sin(t * Math.PI * 2 * rotationCycles + k * 1.3 + s * 17.3);
        const rnd = Math.abs(Math.sin(k * 37.1 + j * 13.7 + 5.9)) % 1;
        const size = (3 + s * 5) * brightness * (0.5 + rnd * 0.5);
        const alpha = brightness * brightVar * 0.8;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = starColor;
        ctx.fill();
        ctx.restore();
      }
    }

    // 4. GALACTIC CORE
    const core = proj3(0, 0, 0);
    ctx.save();
    ctx.filter = 'blur(15px)';
    ctx.beginPath();
    ctx.arc(core.x, core.y, effectRadius * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha(params.coreColor, params.coreGlow * 0.8);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.beginPath();
    ctx.arc(core.x, core.y, effectRadius * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha('#ffffff', params.coreGlow * 0.7);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(core.x, core.y, effectRadius * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 5. SCATTERED BACKGROUND STARS
    for (let i = 0; i < starCount; i++) {
      const lx = Math.sin(i * 7.1 + 13.7) * 2 - 1;
      const lz = Math.cos(i * 3.9 + 71.1) * 2 - 1;
      const p = proj3(lx, 0, lz);
      if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
      const twinkleAlpha = 0.1 + 0.3 * Math.abs(Math.sin(t * Math.PI * 2 * rotationCycles + i * 2.17));
      const size = 0.5 + (Math.abs(Math.sin(i * 11.3 + 3.7)) % 1) * 1.0;

      ctx.save();
      ctx.globalAlpha = twinkleAlpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = (i % 3 === 0) ? params.armColor : '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }

  RR_ANIMATION_REGISTRY.push({
    id:           'galaxy-spiral',
    name: 'Galaxy Spiral',
    categoryId: 'geometric',
    defaultBlend: 'screen',
    description: 'Rotating galaxy with logarithmic spiral arms, star field, and glowing nebula core.',
    noRandomize: ['centerX', 'centerY'],
    params: [
      { key: 'armColor', label: 'Arm Color', type: 'color',  default: '#8844ff' },
      { key: 'coreColor', label: 'Core Color', type: 'color',  default: '#ffcc44' },
      { key: 'centerX', label: 'Center X', type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'centerY', label: 'Center Y', type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5  },
      { key: 'armCount', label: 'Arm Count', type: 'slider', min: 1,   max: 6,   step: 1,    default: 2    },
      { key: 'maxRadius', label: 'Max Radius', type: 'slider', min: 0.1, max: 0.9, step: 0.02, default: 0.45 },
      { key: 'starsPerArm', label: 'Stars Per Arm', type: 'slider', min: 20,  max: 200, step: 10,   default: 80   },
      { key: 'rotationCycles', label: 'Rotation Cycles', type: 'slider', min: 1,   max: 4,   step: 1,    default: 1    },
      { key: 'starCount', label: 'Star Count', type: 'slider', min: 0,   max: 200, step: 10,   default: 60   },
      { key: 'coreGlow', label: 'Core Glow', type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.7  },
      ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -60 } : p)
    ],
    render: renderGalaxySpiralFrame
  });
})();
