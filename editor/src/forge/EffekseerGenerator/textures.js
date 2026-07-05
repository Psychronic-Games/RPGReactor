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
            // Futhark-style angular runes: every glyph is a vertical stem
            // with diagonal branches at set heights — deliberate writing,
            // not scribble. Seeded so the alphabet is stable.
            let st = 987654321;
            const rnd = () => {
                st = (st * 16807) % 2147483647;
                return (st & 0xfffffff) / 0xfffffff;
            };
            const cells = 12;
            const cw = s / cells;
            ctx.strokeStyle = 'rgba(255,255,255,1)';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'miter';
            ctx.lineWidth = Math.max(2, s * 0.02);
            const Y0 = s * 0.22, Y1 = s * 0.78;
            for (let c2 = 0; c2 < cells; c2++) {
                const cx = c2 * cw + cw / 2;
                const stems = rnd() < 0.3 ? 2 : 1;
                const sxs = stems === 2 ? [cx - cw * 0.16, cx + cw * 0.16] : [cx];
                for (const sx of sxs) {
                    ctx.beginPath();
                    ctx.moveTo(sx, Y0);
                    ctx.lineTo(sx, Y1);
                    ctx.stroke();
                }
                // branches: diagonals leaving the stem at fixed anchor heights
                const anchors = [0.08, 0.32, 0.56, 0.8];
                const nb = 1 + Math.floor(rnd() * 3);
                for (let k = 0; k < nb; k++) {
                    const ay = Y0 + anchors[Math.floor(rnd() * anchors.length)] * (Y1 - Y0);
                    const side = rnd() < 0.5 ? -1 : 1;
                    const bx = sxs[0] + side * cw * (0.22 + rnd() * 0.12);
                    const by = ay + (Y1 - Y0) * (0.16 + rnd() * 0.2) * (rnd() < 0.7 ? 1 : -1);
                    ctx.beginPath();
                    ctx.moveTo(sxs[0], ay);
                    ctx.lineTo(bx, Math.max(Y0, Math.min(Y1, by)));
                    // chevron: half the branches double back to the stem
                    if (rnd() < 0.5) ctx.lineTo(sxs[0], Math.max(Y0, Math.min(Y1, by + (Y1 - Y0) * 0.14)));
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

        // ── Tech / holographic family (Interface holo-constructs) ────────
        // 4x4 grid of tech characters — UV animation (frameCountX/Y 4)
        // flashes one glyph per frame; the alphabet echoes terminal noise.
        techglyphs: (size) => make(size, (ctx, s) => {
            const chars = '01*@#$%^&~?/+=<>';
            const cell = s / 4;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `bold ${Math.round(cell * 0.62)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < 16; i++) {
                const x = (i % 4) * cell + cell / 2;
                const y = Math.floor(i / 4) * cell + cell / 2;
                ctx.fillText(chars[i], x, y);
            }
        }),

        // Horizontally tiling strip of terminal characters — wraps around
        // RING bands as a rotating data inscription (cyber magic circle).
        techstrip: (size) => make(size, (ctx, s) => {
            const chars = '01*@#$%^&~?/+=<>';
            const cells = 12;
            const cw = s / cells;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(1.5, s * 0.012);
            ctx.font = `bold ${Math.round(cw * 1.5)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let c = 0; c < cells; c++) {
                const ch = chars[Math.floor(Math.random() * chars.length)];
                // stroke over fill: pseudo-bold so strips stay readable when
                // a whole line of glyphs spans a fraction of a panel
                ctx.fillText(ch, c * cw + cw / 2, s * 0.5);
                ctx.strokeText(ch, c * cw + cw / 2, s * 0.5);
                if (Math.random() < 0.35) ctx.fillRect(c * cw + cw * 0.2, s * 0.72, cw * 0.6, s * 0.05);
            }
        }),

        // Rising circuit traces with terminal pads — orthogonal runs with
        // 45° jogs ending in hollow vias, like a powered PCB coming alive.
        circuit: (size) => make(size, (ctx, s) => {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let t = 0; t < 9; t++) {
                const w = Math.max(1.5, s * (0.008 + Math.random() * 0.008));
                ctx.lineWidth = w;
                let x = s * (0.1 + Math.random() * 0.8);
                let y = s;
                const top = s * (0.05 + Math.random() * 0.45);
                ctx.beginPath();
                ctx.moveTo(x, y);
                while (y > top) {
                    const run = s * (0.08 + Math.random() * 0.2);
                    y = Math.max(top, y - run);
                    ctx.lineTo(x, y);
                    if (y > top && Math.random() < 0.7) {
                        const jog = s * (0.04 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1);
                        const drop = Math.min(Math.abs(jog), y - top);
                        x = Math.min(s * 0.95, Math.max(s * 0.05, x + jog));
                        y -= drop;   // 45° diagonal jog
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
                // terminal via
                const vr = s * (0.012 + Math.random() * 0.02);
                ctx.lineWidth = Math.max(1.5, vr * 0.9);
                ctx.beginPath(); ctx.arc(x, y - vr * 1.6, vr, 0, 7); ctx.stroke();
            }
        }),

        // Horizontally tiling tick-dial strip — tall mark every 4th cell,
        // wraps around RING bands as a rotating measurement dial.
        ticks: (size) => make(size, (ctx, s) => {
            const cells = 32;
            const cw = s / cells;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            for (let c = 0; c < cells; c++) {
                const tall = c % 4 === 0;
                const h = tall ? s * 0.5 : s * 0.26;
                const w = Math.max(1.5, cw * (tall ? 0.22 : 0.14));
                ctx.fillRect(c * cw + (cw - w) / 2, (s - h) / 2, w, h);
            }
        }),

        // Horizontal raster lines (tiles) — hologram scanline shimmer.
        scanlines: (size) => make(size, (ctx, s) => {
            const lines = 16;
            const lh = s / lines;
            for (let i = 0; i < lines; i++) {
                ctx.fillStyle = `rgba(255,255,255,${i % 2 ? 0.55 : 0.9})`;
                ctx.fillRect(0, i * lh, s, Math.max(1, lh * 0.28));
            }
        }),

        // A screen of REAL monospace pseudo-code — 16 rows of actual text
        // (keywords, dotted subsystem identifiers, hex addresses, status
        // tags) with numbered gutter and an inverse "selected" row. Tiles
        // vertically; a 1/16 y-slice is one legible line of code.
        code: (size) => make(size, (ctx, s) => {
            const rows = 16;
            const rh = s / rows;
            const KW = ['EXEC', 'SYNC', 'INIT', 'LOAD', 'SCAN', 'CALL', 'SET', 'JMP', 'RET', 'FORK', 'LOCK', 'POLL'];
            const ID = ['CORE.SYS', 'NAV.CTRL', 'PWR.GRID', 'SUBNET.04', 'BUF.RING', 'IO.PORT', 'MEM.HEAP',
                        'CRYPTO.K', 'THERMAL', 'SHIELD.EM', 'ARRAY.X9', 'LINK.HFQ'];
            const VAL = () => Math.random() < 0.5
                ? '0x' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
                : String(Math.floor(Math.random() * 9000) + 100);
            const TAG = ['<OK>', '<ACK>', '<RDY>', '<...>', '<0.99>', '<SYNC>'];
            ctx.textBaseline = 'middle';
            let indent = 0;
            for (let r = 0; r < rows; r++) {
                const y = r * rh + rh * 0.52;
                // real line numbers in the gutter
                ctx.font = `${Math.round(rh * 0.42)}px monospace`;
                ctx.fillStyle = 'rgba(255,255,255,0.32)';
                ctx.fillText(String(140 + r * 2).padStart(3, '0'), s * 0.012, y);
                if (indent > 0 && Math.random() < 0.3) indent--;
                else if (indent < 2 && Math.random() < 0.35) indent++;
                if (Math.random() < 0.08) { indent = 0; continue; }   // blank separator
                if (Math.random() < 0.12) {
                    ctx.fillStyle = 'rgba(255,255,255,0.13)';
                    ctx.fillRect(s * 0.075, r * rh + rh * 0.1, s * 0.9, rh * 0.8);
                }
                let x = s * 0.085 + indent * s * 0.04;
                ctx.font = `bold ${Math.round(rh * 0.52)}px monospace`;
                const kw = KW[Math.floor(Math.random() * KW.length)];
                ctx.fillStyle = 'rgba(255,255,255,0.98)';
                ctx.fillText(kw, x, y);
                x += ctx.measureText(kw).width + s * 0.018;
                ctx.font = `${Math.round(rh * 0.5)}px monospace`;
                const parts = [ID[Math.floor(Math.random() * ID.length)], VAL()];
                if (Math.random() < 0.5) parts.push(VAL());
                for (const part of parts) {
                    if (x > s * 0.75) break;
                    ctx.fillStyle = `rgba(255,255,255,${(0.55 + Math.random() * 0.2).toFixed(2)})`;
                    ctx.fillText(part, x, y);
                    x += ctx.measureText(part).width + s * 0.018;
                }
                if (Math.random() < 0.45 && x < s * 0.82) {
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.fillText(TAG[Math.floor(Math.random() * TAG.length)], x, y);
                }
            }
        }),

        // Seamlessly x-tiling sensor trace: a random-walk line returning to
        // its start height, with a soft area fill under it — a UV x-scroll
        // reads as a live telemetry graph.
        graphline: (size) => make(size, (ctx, s) => {
            const N = 48;
            const heights = [];
            let h = 0.5;
            for (let i = 0; i < N; i++) {
                h = Math.min(0.85, Math.max(0.15, h + (Math.random() - 0.5) * 0.24));
                heights.push(h);
            }
            // taper the walk back to its start so the tile is seamless
            for (let i = N - 6; i < N; i++) {
                const t = (i - (N - 6)) / 5;
                heights[i] = heights[i] * (1 - t) + heights[0] * t;
            }
            heights.push(heights[0]);
            const px = (i) => (i / N) * s;
            const py = (v) => s * (0.9 - v * 0.68);
            // area fill under the trace
            const g = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.9);
            g.addColorStop(0, 'rgba(255,255,255,0.3)');
            g.addColorStop(1, 'rgba(255,255,255,0.02)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, s * 0.9);
            heights.forEach((v, i) => ctx.lineTo(px(i), py(v)));
            ctx.lineTo(s, s * 0.9);
            ctx.closePath();
            ctx.fill();
            // glow stroke + bright core stroke
            for (const [w, a] of [[s * 0.03, 0.3], [Math.max(1.5, s * 0.012), 0.95]]) {
                ctx.strokeStyle = `rgba(255,255,255,${a})`;
                ctx.lineWidth = w;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                heights.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
                ctx.stroke();
            }
        }),

        // Solid rounded-end bar — bold UI pills (LCARS segments, equalizer
        // bars). Unlike 'streak', the body is full alpha edge to edge.
        pill: (size) => make(size, (ctx, s) => {
            const w = s * 0.6, r = w / 2;
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.beginPath();
            ctx.moveTo(s / 2 - w / 2, s * 0.06 + r);
            ctx.arc(s / 2, s * 0.06 + r, r, Math.PI, 0);
            ctx.lineTo(s / 2 + w / 2, s * 0.94 - r);
            ctx.arc(s / 2, s * 0.94 - r, r, 0, Math.PI);
            ctx.closePath();
            ctx.fill();
        }),

        // Composite waveform strip — a deliberately busy signal that tiles
        // seamlessly in x: several partials (some inharmonic feel via a
        // shifting "regime"), FM wobble, a swelling amplitude envelope with
        // near-silent gaps, transient spikes, plus a faint envelope fill
        // and baked bloom (wide dim passes under a bright core). White on
        // alpha; tinted at use and UV-scrolled for an endless live scope.
        // Parametric (use as rr_wavecomposite_p<amp>_<freq>_<detail>_<noise>):
        // amp = envelope strength %, freq = base partial cycles, detail =
        // shimmer/FM richness %, noise = transient-spike amount %.
        wavecomposite: (size, o = []) => make(size, (ctx, s) => {
            const [AMP = 80, FREQ = 18, DET = 50, NSE = 50, PHASE = 0] = o;
            const ampF = AMP / 80, detF = DET / 50, nseF = NSE / 50;
            const PH2 = PHASE * 2.399;   // phase seed → a different take of the same signal
            const TAU2 = Math.PI * 2;
            const h = (n) => { const f = Math.sin((n + PHASE * 7.13) * 12.9898) * 43758.5453; return f - Math.floor(f); };
            const sm = (x) => x * x * (3 - 2 * x);
            // piecewise regime 0..1 over 8 segments, wrapping seamlessly
            const SEG = 8;
            const regime = (f) => {
                const g = f * SEG, i = Math.floor(g) % SEG, u = sm(g - Math.floor(g));
                return h(i * 1.3) + (h(((i + 1) % SEG) * 1.3) - h(i * 1.3)) * u;
            };
            const env = (f) => {
                const slow = 0.55 + 0.32 * Math.sin(TAU2 * 3 * f) + 0.18 * Math.sin(TAU2 * 7 * f + 1.1);
                const burst = Math.pow(Math.max(0, Math.sin(TAU2 * f + 0.7)), 8) * 0.7;
                const gate = Math.min(1, Math.max(0.12, Math.sin(TAU2 * 2 * f + 2.3) * 1.4 + 0.7));
                return Math.min(1.15, Math.max(0.04, (slow * 0.6 + burst) * gate * ampF));
            };
            // transient spike slots (seamless: positions in 0..1)
            const SPIKES = [];
            for (let i = 0; i < 22; i++) {
                if (h(i * 2.3) < 0.5 * nseF) SPIKES.push({ c: (i + h(i)) / 22, sign: h(i * 1.7) > 0.5 ? 1 : -1,
                                                           amp: (0.4 + h(i * 3.1) * 0.6) * nseF });
            }
            const K1 = Math.max(4, FREQ), K2 = K1 * 2 + 1, K3 = K1 * 4 - 1,
                  K4 = Math.max(3, Math.round(K1 * 0.45));
            const sig = (f) => {
                const r = regime(f);
                const fm = Math.sin(TAU2 * 5 * f + PH2) * (0.6 + r * 2.2) * detF;
                let v = Math.sin(TAU2 * K1 * f + fm + PH2)
                      + 0.5 * Math.sin(TAU2 * K2 * f + 0.6 + PH2 * 1.7)
                      + (0.15 + r * 0.5) * detF * Math.sin(TAU2 * K3 * f + PH2 * 0.9)
                      + 0.28 * Math.sin(TAU2 * K4 * f - 0.4 + PH2 * 2.3);
                v /= 1.9;
                let spike = 0;
                for (const sp of SPIKES) {
                    let d = Math.abs(f - sp.c); d = Math.min(d, 1 - d);
                    spike += sp.sign * sp.amp * Math.exp(-Math.pow(d * s, 2) / 18);
                }
                return Math.max(-1.2, Math.min(1.2, env(f) * (v * 0.85 + spike)));
            };
            const mid = s / 2, ay = s * 0.42;
            // faint envelope fill (the loudness contour)
            ctx.fillStyle = 'rgba(255,255,255,0.09)';
            ctx.beginPath();
            for (let x = 0; x <= s; x += 2) { const e = env(x / s); const y = mid - e * ay; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            for (let x = s; x >= 0; x -= 2) { const e = env(x / s); ctx.lineTo(x, mid + e * ay); }
            ctx.closePath(); ctx.fill();
            // bloom passes: wide+dim under narrow+hot
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            for (const [lw, a] of [[s * 0.03, 0.06], [s * 0.014, 0.16], [s * 0.007, 0.8], [s * 0.0032, 1]]) {
                ctx.strokeStyle = `rgba(255,255,255,${a})`;
                ctx.lineWidth = Math.max(1, lw);
                ctx.beginPath();
                for (let x = 0; x <= s; x++) {
                    const y = mid - sig(x / s) * ay;
                    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.stroke();
            }
        }),

        // Honeycomb lattice — crisp hexagon outlines, seamless in x (the
        // u-axis when wrapped around shells/domes). Forcefields, tech.
        hexgrid: (size) => make(size, (ctx, s) => {
            // PERFECT tiling both axes: horizontal period s/6, vertical
            // row step s/8 (slightly squashed hexes — imperceptible once
            // wrapped on a shell, and the lattice lines meet exactly at
            // every seam and every repeat).
            const COLS = 6;
            const w = s / COLS;
            const R = s / 12;      // vertical radius → row step 1.5R = s/8
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = Math.max(2, s * 0.012);
            ctx.lineJoin = 'round';
            const hex = (cx, cy) => {
                ctx.beginPath();
                ctx.moveTo(cx, cy - R);
                ctx.lineTo(cx + w / 2, cy - R / 2);
                ctx.lineTo(cx + w / 2, cy + R / 2);
                ctx.lineTo(cx, cy + R);
                ctx.lineTo(cx - w / 2, cy + R / 2);
                ctx.lineTo(cx - w / 2, cy - R / 2);
                ctx.closePath();
                ctx.stroke();
            };
            for (let row = -1; row <= 8; row++) {
                const off = (row % 2 + 2) % 2 ? w / 2 : 0;
                for (let col = -1; col <= COLS; col++) {
                    hex(col * w + off, row * 1.5 * R);
                }
            }
        }),

        // Crisp THIN ring line — a fine energy-field circle (ringhard is a
        // broad band; this is a drawn line).
        ringthin: (size) => make(size, (ctx, s) => {
            ctx.strokeStyle = 'rgba(255,255,255,1)';
            ctx.lineWidth = s * 0.022;
            ctx.beginPath();
            ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
            ctx.stroke();
        }),

        // Crisp continuous annulus — hard edges, no gradient (ring_soft
        // reads blurry when a ring IS the object rather than a glow).
        ringhard: (size) => make(size, (ctx, s) => {
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.beginPath();
            ctx.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
            ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2, true);
            ctx.fill();
        }),

        // Crisp SEGMENTED annulus — a thick ring chopped into 12 sharp
        // polygon chunks with gaps (LED ring segments).
        ringseg: (size) => make(size, (ctx, s) => {
            const N = 12, gap = 0.14;
            const ro = s * 0.48, ri = s * 0.385;
            ctx.fillStyle = 'rgba(255,255,255,1)';
            for (let k = 0; k < N; k++) {
                const a0 = (k + gap / 2) / N * Math.PI * 2;
                const a1 = (k + 1 - gap / 2) / N * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(s / 2, s / 2, ro, a0, a1);
                ctx.arc(s / 2, s / 2, ri, a1, a0, true);
                ctx.closePath();
                ctx.fill();
            }
        }),

        // Curved canine fang, tip DOWN (white on alpha, tinted at use):
        // wide root, tapering with a slight inward curve like a real
        // tooth, faint root shadow so it reads solid rather than sparkly.
        fang: (size) => make(size, (ctx, s) => {
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.beginPath();
            ctx.moveTo(s * 0.22, s * 0.06);                                   // root left
            ctx.quadraticCurveTo(s * 0.30, s * 0.55, s * 0.46, s * 0.94);     // left edge (curved)
            ctx.quadraticCurveTo(s * 0.52, s * 0.98, s * 0.56, s * 0.92);     // rounded tip
            ctx.quadraticCurveTo(s * 0.72, s * 0.5, s * 0.8, s * 0.06);       // right edge
            ctx.quadraticCurveTo(s * 0.5, s * 0.16, s * 0.22, s * 0.06);      // gum line
            ctx.closePath();
            ctx.fill();
            // root shading: dim the top so the fang looks rooted, not lit
            const g = ctx.createLinearGradient(0, 0, 0, s * 0.5);
            g.addColorStop(0, 'rgba(0,0,0,0.35)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, s, s * 0.5);
            ctx.globalCompositeOperation = 'source-over';
        }),

        // Organic splatter: an irregular main mass (union of offset lobes)
        // with semi-transparent edges, satellites biased to one side, and
        // long tapering runners — alpha VARIES across the blot so the
        // tinted result has liquid depth instead of a flat sticker look.
        // Parametric (rr_splat_p<seed>): seeded variants so a landed blot
        // can MORPH — crossfading two variants of the same blot reads as
        // the liquid settling and spreading, not a sticker inflating.
        splat: (size, o = []) => make(size, (ctx, s) => {
            const [SEED = 1] = o;
            let st = SEED * 7919 + 49297;
            const rnd = () => {
                st = (st * 16807) % 2147483647;
                return (st & 0xfffffff) / 0xfffffff;
            };
            const cx = s / 2, cy = s / 2;
            const lobe = (x, y, r, a) => {
                const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
                g.addColorStop(0, `rgba(255,255,255,${a})`);
                g.addColorStop(0.82, `rgba(255,255,255,${a * 0.92})`);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            };
            // main mass: overlapping lobes, denser center
            lobe(cx, cy, s * 0.2, 1);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + rnd() * 0.7;
                const d = s * (0.05 + rnd() * 0.1);
                lobe(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
                     s * (0.09 + rnd() * 0.09), 0.9);
            }
            // satellites: biased toward one side (real splatter is thrown)
            const bias = rnd() * Math.PI * 2;
            for (let i = 0; i < 16; i++) {
                const a = bias + (rnd() - 0.5) * 2.4;
                const d = s * (0.2 + rnd() * 0.27);
                lobe(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
                     s * (0.014 + rnd() * 0.045), 0.6 + rnd() * 0.4);
            }
            // runners: long thin tapers with droplets at the tips
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            for (let i = 0; i < 6; i++) {
                const a = bias + (rnd() - 0.5) * 3.4;
                const len = s * (0.26 + rnd() * 0.2);
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a + 0.08) * s * 0.15, cy + Math.sin(a + 0.08) * s * 0.15);
                ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
                ctx.lineTo(cx + Math.cos(a - 0.08) * s * 0.15, cy + Math.sin(a - 0.08) * s * 0.15);
                ctx.closePath();
                ctx.fill();
                lobe(cx + Math.cos(a) * (len + s * 0.02), cy + Math.sin(a) * (len + s * 0.02),
                     s * 0.022, 0.9);
            }
        }),

        // Classic pointy lightning bolt ⚡ (white on alpha, tinted at use).
        bolt: (size) => make(size, (ctx, s) => {
            const P = [[0.62, 0.02], [0.24, 0.56], [0.46, 0.56],
                       [0.36, 0.98], [0.78, 0.40], [0.53, 0.40]];
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.beginPath();
            P.forEach(([x, y], i) => i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s));
            ctx.closePath();
            ctx.fill();
            // soft energy halo behind the shape
            ctx.globalCompositeOperation = 'destination-over';
            ctx.filter = `blur(${s * 0.04}px)`;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            P.forEach(([x, y], i) => i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s));
            ctx.closePath();
            ctx.fill();
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }),

        // Per-pixel hard noise — crisp TV static (the soft blobby 'noise'
        // generator reads blurry when used as a static screen).
        whitenoise: (size) => make(size, (ctx, s) => {
            const img = ctx.createImageData(s, s);
            const d = img.data;
            for (let i = 0; i < s * s; i++) {
                const v = Math.random();
                d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
                // sparse speckle: ~25% of texels lit, most of those dim —
                // denser reads as a solid white card once filtered
                d[i * 4 + 3] = v < 0.75 ? 0 : Math.round(Math.pow((v - 0.75) / 0.25, 1.6) * 255);
            }
            ctx.putImageData(img, 0, 0);
        }),

        // Two-row biomonitor waveform strip (tiles horizontally):
        // top row = EKG heartbeat (flatline, QRS spike, T bump),
        // bottom row = smooth respiration sine. A band selects its row
        // via uv position y (0 or 0.5) with size y 0.5, then scrolls x.
        ekg: (size) => make(size, (ctx, s) => {
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = Math.max(2, s * 0.02);
            ctx.lineJoin = 'round';
            // heartbeat row (centered at y = s*0.25)
            const hb = s * 0.25;
            ctx.beginPath();
            ctx.moveTo(0, hb);
            ctx.lineTo(s * 0.3, hb);
            ctx.lineTo(s * 0.35, hb - s * 0.02);   // P wave
            ctx.lineTo(s * 0.4, hb);
            ctx.lineTo(s * 0.45, hb + s * 0.03);   // Q dip
            ctx.lineTo(s * 0.5, hb - s * 0.16);    // R spike
            ctx.lineTo(s * 0.55, hb + s * 0.06);   // S dip
            ctx.lineTo(s * 0.6, hb);
            ctx.lineTo(s * 0.7, hb - s * 0.035);   // T bump
            ctx.lineTo(s * 0.78, hb);
            ctx.lineTo(s, hb);
            ctx.stroke();
            // respiration row (centered at y = s*0.75)
            const rp = s * 0.75;
            ctx.beginPath();
            for (let x = 0; x <= s; x += 2) {
                const y = rp - Math.sin((x / s) * Math.PI * 2) * s * 0.07;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }),

        // Vertically tiling glyph columns with bright heads and fading
        // tails — UV-scrolled for terminal data-rain.
        datarain: (size) => make(size, (ctx, s) => {
            const chars = '01*@#$%^&~?/+=<>';
            const cols = 6;
            const cw = s / cols;
            const gh = s / 10;
            ctx.font = `bold ${Math.round(gh * 0.8)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let c = 0; c < cols; c++) {
                const head = Math.floor(Math.random() * 10);   // brightest cell
                const len = 4 + Math.floor(Math.random() * 5); // trail length
                for (let k = 0; k < len; k++) {
                    const row = head - k;                       // trail rises above head
                    const a = k === 0 ? 0.95 : Math.max(0.28, 0.78 - k * 0.11);
                    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
                    const ch = chars[Math.floor(Math.random() * chars.length)];
                    const y = ((row % 10) + 10) % 10;           // wrap → tiles vertically
                    ctx.fillText(ch, c * cw + cw / 2, y * gh + gh / 2);
                }
            }
        }),
    };

    // Detail textures (text, traces, tick work) need more resolution than
    // the 128px particle default or they filter into mush on large quads —
    // the single biggest "fake interface" tell.
    const SIZES = {
        code: 512, graphline: 256, techstrip: 256, techglyphs: 256,
        datarain: 256, ekg: 256, ticks: 256, whitenoise: 256, circuit: 256,
        ringhard: 256, ringseg: 256, bolt: 256, wavecomposite: 1024, fang: 256, splat: 256,
        runes: 512, hexgrid: 512, ringthin: 256,
    };

    function get(name, size) {
        // parametric variant: "<base>_p<a>_<b>_…" bakes GENERATORS[base]
        // with integer options — params must live in the NAME because the
        // WASM core (and the export writer) cache textures by path.
        let base = name;
        let opts;
        if (!GENERATORS[name]) {
            const pm = /^([a-z0-9]+(?:_[a-z]+)*)_p(\d+(?:_\d+)*)$/.exec(name);
            if (pm && GENERATORS[pm[1]]) {
                base = pm[1];
                opts = pm[2].split('_').map(Number);
            }
        }
        size = size || SIZES[base] || 128;
        const key = `${name}@${size}`;
        if (!CACHE.has(key)) {
            const gen = GENERATORS[base];
            if (!gen) throw new Error(`RR_EfkTextures: unknown texture "${name}"`);
            CACHE.set(key, gen(size, opts));
        }
        return CACHE.get(key);
    }

    const dataUrl = (name, size) => get(name, size).toDataURL('image/png');

    // ── User text (Display Text params) ──────────────────────────────────
    // Renders arbitrary user-typed text as a crisp white-on-alpha strip
    // (1024×128, 8:1 — quads should keep that aspect). Cached by content.
    const TEXT_CACHE = new Map();
    function userTextCanvas(text) {
        const key = String(text ?? '');
        if (!TEXT_CACHE.has(key)) {
            const w = 1024, h = 128;
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            const msg = (key.toUpperCase().slice(0, 48).trim()) || ' ';
            ctx.fillStyle = 'rgba(255,255,255,0.97)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let px = 96;
            ctx.font = `bold ${px}px monospace`;
            const maxW = w * 0.94;
            const measured = ctx.measureText(msg).width;
            // fit BOTH ways: shrink long text, GROW short text (capped by
            // the strip height) so brief labels fill their quads
            px = Math.min(114, Math.max(20, Math.floor(px * maxW / measured)));
            ctx.font = `bold ${px}px monospace`;
            ctx.fillText(msg, w / 2, h / 2);
            if (TEXT_CACHE.size > 32) TEXT_CACHE.delete(TEXT_CACHE.keys().next().value);
            TEXT_CACHE.set(key, c);
        }
        return TEXT_CACHE.get(key);
    }
    const userTextDataUrl = (text) => userTextCanvas(text).toDataURL('image/png');

    // Paragraph mode: a PAGE of wrapped text ('|' forces a line break)
    // that grows vertically with the message — the pane shows a fixed
    // window (PARA_VIS_ROWS rows) and UV-scrolls through the whole page.
    //
    // paraLayout is PURE STRING MATH (no canvas): recipes call it at build
    // time to size their UV window, so it must stay in exact agreement
    // with the canvas renderer below.
    const PARA_VIS_ROWS = 9;      // rows visible in a pane window
    const PARA_MAX_ROWS = 30;
    const PARA_CHARS = 22;        // wrap width at the render font
    const PARA_RH = 56;           // row height in texture pixels
    function paraLayout(text) {
        const lines = [];
        // real newlines (textarea input) and '|' both force line breaks
        for (const seg of String(text ?? '').toUpperCase().split(/\||\n/)) {
            const words = seg.trim().split(/\s+/);
            let line = '';
            for (const wd of words) {
                const cand = line ? line + ' ' + wd : wd;
                if (cand.length > PARA_CHARS && line) { lines.push(line); line = wd; }
                else line = cand;
            }
            lines.push(line);
        }
        const rows = Math.max(PARA_VIS_ROWS, Math.min(PARA_MAX_ROWS, lines.length + 1));
        // POWER-OF-TWO canvas height: the runtime rescales NPOT textures and
        // WebGL1 REPEAT wrap needs POT anyway; the blank tail below the text
        // reads as a natural pause between scroll loops.
        let canvasH = 512;
        while (canvasH < rows * PARA_RH) canvasH *= 2;
        return { lines: lines.slice(0, PARA_MAX_ROWS), rows, canvasH,
                 frac: (PARA_VIS_ROWS * PARA_RH) / canvasH };
    }
    const userParaInfo = (text) => {
        const L = paraLayout(text);
        return { frac: L.frac, rowFrac: PARA_RH / L.canvasH,
                 lineCount: Math.min(L.lines.length, PARA_MAX_ROWS) };
    };

    const PARA_CACHE = new Map();
    function userParaCanvas(text) {
        const key = String(text ?? '');
        if (!PARA_CACHE.has(key)) {
            const w = 512;
            const { lines, canvasH } = paraLayout(key);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = canvasH;
            const ctx = c.getContext('2d');
            ctx.font = `bold ${Math.round(PARA_RH * 0.6)}px monospace`;
            ctx.textBaseline = 'middle';
            lines.forEach((ln, i) => {
                ctx.fillStyle = `rgba(255,255,255,${i === 0 ? 0.98 : 0.82})`;
                ctx.fillText(ln, w * 0.03, (i + 0.5) * PARA_RH, w * 0.94);
            });
            if (PARA_CACHE.size > 16) PARA_CACHE.delete(PARA_CACHE.keys().next().value);
            PARA_CACHE.set(key, c);
        }
        return PARA_CACHE.get(key);
    }
    const userParaDataUrl = (text) => userParaCanvas(text).toDataURL('image/png');

    function userTextPngBytes(text, mode) {
        const url = mode === 'para' ? userParaDataUrl(text) : userTextDataUrl(text);
        const bin = atob(url.split(',')[1]);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    /** PNG bytes for export (NW.js Buffer via data URL round-trip). */
    function pngBytes(name, size) {
        const b64 = dataUrl(name, size).split(',')[1];
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    return { NAMES: Object.keys(GENERATORS), SIZES, get, dataUrl, pngBytes,
             userTextDataUrl, userParaDataUrl, userParaInfo, userTextPngBytes };
})();
