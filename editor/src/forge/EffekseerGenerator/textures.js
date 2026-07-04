/**
 * EffekseerGenerator textures — procedural particle textures via Canvas 2D.
 *
 * All textures are WHITE shapes on transparent alpha, following the stock
 * effect convention (Texture/Particle100.png etc.): Effekseer tints
 * particles by multiplying the node's color over the texture, so recipes
 * control color through node parameters, never through texture pixels.
 *
 * Each generator returns a canvas; RR_EfkTextures.get() caches by
 * name+size. dataUrl()/pngBytes() provide the two consumption forms:
 * data URLs feed the preview's loadEffect redirect, PNG bytes feed export.
 */

const RR_EfkTextures = (() => {
    const CACHE = new Map();

    const make = (size, draw) => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        draw(ctx, size);
        return c;
    };

    const GENERATORS = {
        // Soft radial glow — the workhorse for fire/magic/light.
        glow_soft: (size) => make(size, (ctx, s) => {
            const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0.0, 'rgba(255,255,255,1)');
            g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
            g.addColorStop(0.75, 'rgba(255,255,255,0.12)');
            g.addColorStop(1.0, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
        }),

        // Hard-core particle with a tight falloff — embers, motes, dots.
        particle_hard: (size) => make(size, (ctx, s) => {
            const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0.0, 'rgba(255,255,255,1)');
            g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
            g.addColorStop(0.8, 'rgba(255,255,255,0.25)');
            g.addColorStop(1.0, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
        }),

        // 4-point glint — bright core, four soft tapering rays with a
        // faint diagonal cross. Per-pixel falloff (no hard fill edges).
        spark: (size) => make(size, (ctx, s) => {
            const img = ctx.createImageData(s, s);
            const d = img.data;
            const c = (s - 1) / 2;
            const ray = (dAlong, dAcross, arm, waist, power) => {
                const t = Math.abs(dAlong) / arm;
                if (t >= 1) return 0;
                const w = waist * (1 - t * 0.85);
                return Math.exp(-(dAcross * dAcross) / (2 * w * w)) * Math.pow(1 - t, power);
            };
            for (let y = 0; y < s; y++) {
                for (let x = 0; x < s; x++) {
                    const dx = x - c, dy = y - c;
                    const r = Math.hypot(dx, dy);
                    const core = Math.exp(-(r * r) / (2 * (s * 0.045) ** 2));
                    const halo = Math.exp(-(r * r) / (2 * (s * 0.14) ** 2)) * 0.35;
                    const main = ray(dx, dy, s * 0.48, s * 0.02, 2.2) + ray(dy, dx, s * 0.48, s * 0.02, 2.2);
                    const diagA = ray((dx + dy) * 0.7071, (dx - dy) * 0.7071, s * 0.26, s * 0.014, 2.6);
                    const diagB = ray((dx - dy) * 0.7071, (dx + dy) * 0.7071, s * 0.26, s * 0.014, 2.6);
                    const v = Math.min(1, core + halo + main + (diagA + diagB) * 0.55);
                    const i = (y * s + x) * 4;
                    d[i] = d[i + 1] = d[i + 2] = 255;
                    d[i + 3] = Math.round(v * 255);
                }
            }
            ctx.putImageData(img, 0, 0);
        }),

        // Soft annulus — shockwaves, magic circles, halos.
        ring_soft: (size) => make(size, (ctx, s) => {
            const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            g.addColorStop(0.55, 'rgba(255,255,255,0)');
            g.addColorStop(0.72, 'rgba(255,255,255,1)');
            g.addColorStop(0.9, 'rgba(255,255,255,0.35)');
            g.addColorStop(1.0, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s);
        }),

        // Vertical streak with soft ends — rain, speed lines, beams.
        streak: (size) => make(size, (ctx, s) => {
            const g = ctx.createLinearGradient(0, 0, 0, s);
            g.addColorStop(0.0, 'rgba(255,255,255,0)');
            g.addColorStop(0.3, 'rgba(255,255,255,1)');
            g.addColorStop(0.7, 'rgba(255,255,255,1)');
            g.addColorStop(1.0, 'rgba(255,255,255,0)');
            const gx = ctx.createLinearGradient(0, 0, s, 0);
            gx.addColorStop(0.0, 'rgba(255,255,255,0)');
            gx.addColorStop(0.5, 'rgba(255,255,255,1)');
            gx.addColorStop(1.0, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(s * 0.3, 0, s * 0.4, s);
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = gx;
            ctx.fillRect(0, 0, s, s);
        }),

        // Jagged vertical lightning bolt with a soft glow halo.
        bolt: (size) => make(size, (ctx, s) => {
            const seg = 7;
            const pts = [];
            let x = s * 0.5;
            for (let i = 0; i <= seg; i++) {
                pts.push([x, (s / seg) * i]);
                x = s * 0.5 + (i % 2 === 0 ? 1 : -1) * s * (0.06 + 0.1 * Math.abs(Math.sin(i * 2.7)));
            }
            const stroke = (w, a) => {
                ctx.strokeStyle = `rgba(255,255,255,${a})`;
                ctx.lineWidth = w;
                ctx.lineJoin = 'miter';
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
                ctx.stroke();
            };
            stroke(s * 0.14, 0.25);   // halo
            stroke(s * 0.07, 0.6);
            stroke(s * 0.028, 1);     // core
        }),

        // Elongated crystal sliver — ice shards, crystal debris.
        shard: (size) => make(size, (ctx, s) => {
            const cx = s / 2;
            const g = ctx.createLinearGradient(0, 0, 0, s);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.6, 'rgba(255,255,255,0.8)');
            g.addColorStop(1, 'rgba(255,255,255,0.15)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(cx, s * 0.02);                 // tip
            ctx.lineTo(cx + s * 0.13, s * 0.3);
            ctx.lineTo(cx + s * 0.07, s * 0.95);      // tail
            ctx.lineTo(cx - s * 0.07, s * 0.95);
            ctx.lineTo(cx - s * 0.13, s * 0.3);
            ctx.closePath();
            ctx.fill();
            // bright core line
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(cx - s * 0.015, s * 0.05, s * 0.03, s * 0.85);
        }),

        // Blotchy soft mass — smoke, mist, clouds.
        // Strip of glyph-like marks — tiles horizontally, scrolls
        // around ring bands as a rotating rune inscription.
        runes: (size) => make(size, (ctx, s) => {
            const cells = 10;
            const cw = s / cells;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(2, s * 0.018);
            for (let c = 0; c < cells; c++) {
                const x0 = c * cw + cw * 0.24, x1 = (c + 1) * cw - cw * 0.24;
                const y0 = s * 0.28, y1 = s * 0.72;
                const px = () => x0 + Math.random() * (x1 - x0);
                const py = () => y0 + Math.random() * (y1 - y0);
                const strokes = 2 + Math.floor(Math.random() * 3);
                for (let k = 0; k < strokes; k++) {
                    ctx.beginPath();
                    ctx.moveTo(px(), py());
                    ctx.lineTo(px(), py());
                    if (Math.random() < 0.5) ctx.lineTo(px(), py());
                    ctx.stroke();
                }
                if (Math.random() < 0.4) {
                    ctx.beginPath();
                    ctx.arc(px(), py(), cw * 0.09, 0, 7);
                    ctx.stroke();
                }
            }
        }),

        // Uniform white — flat even surface color for solids.
        flat: (size) => make(size, (ctx, s) => {
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillRect(0, 0, s, s);
        }),

        // 2x2 checkerboard (tiles cleanly with Pattern Scale).
        checker: (size) => make(size, (ctx, s) => {
            const h = s / 2;
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillRect(0, 0, h, h); ctx.fillRect(h, h, h, h);
            ctx.fillStyle = 'rgba(110,110,110,1)';
            ctx.fillRect(h, 0, h, h); ctx.fillRect(0, h, h, h);
        }),

        // Dense radial filament starburst (EVFX-style discharge core).
        rays: (size) => make(size, (ctx, s) => {
            const c = s / 2;
            ctx.translate(c, c);
            for (let i = 0; i < 46; i++) {
                const a = Math.random() * Math.PI * 2;
                const len = c * (0.35 + Math.random() * 0.62);
                const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
                g.addColorStop(0, 'rgba(255,255,255,0.95)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.strokeStyle = g;
                ctx.lineWidth = 1 + Math.random() * (s / 120);
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
            }
            const core = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.28);
            core.addColorStop(0, 'rgba(255,255,255,1)');
            core.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = core; ctx.fillRect(-c, -c, s, s);
        }),

        // Mottled energy noise with radial falloff (DCSD Aura-style body).
        noise: (size) => make(size, (ctx, s) => {
            for (let i = 0; i < 260; i++) {
                const x = Math.random() * s, y = Math.random() * s;
                const r = s * (0.025 + Math.random() * 0.06);
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, 'rgba(255,255,255,' + (0.06 + Math.random() * 0.18).toFixed(2) + ')');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
            }
            ctx.globalCompositeOperation = 'destination-in';
            const m = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            m.addColorStop(0, 'rgba(255,255,255,1)');
            m.addColorStop(0.65, 'rgba(255,255,255,0.85)');
            m.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = m; ctx.fillRect(0, 0, s, s);
            ctx.globalCompositeOperation = 'source-over';
        }),

        // Water bubble: bright rim, inner sheen, highlight dot.
        bubble: (size) => make(size, (ctx, s) => {
            const c = s / 2, r = s * 0.42;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(1.5, s * 0.05);
            ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.stroke();
            const g = ctx.createRadialGradient(c, c, r * 0.5, c, c, r);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(1, 'rgba(255,255,255,0.30)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath(); ctx.ellipse(c - r * 0.42, c - r * 0.45, s * 0.075, s * 0.05, -0.6, 0, 7); ctx.fill();
        }),

        // Crescent wind slash arc.
        slash: (size) => make(size, (ctx, s) => {
            const c = s / 2;
            ctx.translate(c, c);
            for (let i = 0; i < 3; i++) {
                const r0 = s * (0.30 + i * 0.055);
                const g = ctx.createLinearGradient(-r0, 0, r0, 0);
                g.addColorStop(0, 'rgba(255,255,255,0)');
                g.addColorStop(0.5, 'rgba(255,255,255,' + (0.9 - i * 0.28).toFixed(2) + ')');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.strokeStyle = g;
                ctx.lineWidth = Math.max(1.5, s * (0.055 - i * 0.013));
                ctx.beginPath(); ctx.arc(0, r0 * 0.55, r0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
            }
        }),

        smoke: (size) => make(size, (ctx, s) => {
            const blobs = [
                [0.5, 0.5, 0.42, 0.5], [0.36, 0.42, 0.26, 0.4], [0.64, 0.44, 0.24, 0.4],
                [0.44, 0.62, 0.25, 0.35], [0.6, 0.62, 0.22, 0.35], [0.5, 0.34, 0.2, 0.35],
            ];
            for (const [x, y, r, a] of blobs) {
                const g = ctx.createRadialGradient(s * x, s * y, 0, s * x, s * y, s * r);
                g.addColorStop(0, `rgba(255,255,255,${a})`);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, s, s);
            }
        }),
    };

    function get(name, size = 128) {
        const key = `${name}@${size}`;
        if (!CACHE.has(key)) {
            const gen = GENERATORS[name];
            if (!gen) throw new Error(`RR_EfkTextures: unknown texture "${name}"`);
            CACHE.set(key, gen(size));
        }
        return CACHE.get(key);
    }

    const dataUrl = (name, size = 128) => get(name, size).toDataURL('image/png');

    /** PNG bytes for export (NW.js Buffer via data URL round-trip). */
    function pngBytes(name, size = 128) {
        const b64 = dataUrl(name, size).split(',')[1];
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    return { NAMES: Object.keys(GENERATORS), get, dataUrl, pngBytes };
})();
