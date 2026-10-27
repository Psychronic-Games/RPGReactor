//=============================================================================
// reactor_hdr_overlay.js — optional HDR light accumulation for the WebGL1 overlay
// Built into RPG Reactor. See docs/HDR-EFFECT-OVERLAY.md for asset/config contracts.
// No targets or programs are allocated until an opted-in animation starts.
//
// Two globals: ReactorHdrRenderer is the light pipeline itself (float targets,
// bloom, one grade, the composite), one instance per WebGL1 context and free
// of game state, so the editor's previews run the same code. ReactorHdrOverlay
// is the game's adapter: sidecar requests, animation selection, the fallback
// twin and the overlay canvas.
//=============================================================================
(function() {
    "use strict";
    const VS = "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }";
    // 2x2 box from a bilinear tap at the texel corner
    const FS_DOWN = "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;" +
        "void main(){ gl_FragColor = 0.25 * (texture2D(uTex, vUv + uTexel * vec2(-0.5,-0.5)) + texture2D(uTex, vUv + uTexel * vec2(0.5,-0.5))" +
        " + texture2D(uTex, vUv + uTexel * vec2(-0.5,0.5)) + texture2D(uTex, vUv + uTexel * vec2(0.5,0.5))); }";
    // the first downsample with UE 4's bloom setup threshold (PostProcessBloomSetup): light below the threshold in
    // luminance does not bloom, ramping to full over 2 units above it
    const FS_SETUP = "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold;" +
        "void main(){ vec4 c = 0.25 * (texture2D(uTex, vUv + uTexel * vec2(-0.5,-0.5)) + texture2D(uTex, vUv + uTexel * vec2(0.5,-0.5))" +
        " + texture2D(uTex, vUv + uTexel * vec2(-0.5,0.5)) + texture2D(uTex, vUv + uTexel * vec2(0.5,0.5)));" +
        " float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11)); c.rgb *= clamp((lum - uThreshold) * 0.5, 0.0, 1.0);" +
        " gl_FragColor = c; }";
    // separable Gaussian, sigma in texels (<= ~5), +-3 sigma
    const FS_BLUR = "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uStep; uniform float uSigma;" +
        "void main(){ vec4 s = vec4(0.0); float w = 0.0; for (int i = -16; i <= 16; i++) { float x = float(i);" +
        " if (abs(x) > 3.0 * uSigma + 0.5) continue; float k = exp(-0.5 * x * x / (uSigma * uSigma));" +
        " s += k * texture2D(uTex, vUv + uStep * x); w += k; } gl_FragColor = s / w; }";

    function valid(s) {
        if (!s || s.version !== 1 || s.gradeInput !== "hdr" || typeof s.grade !== "string" ||
            !/\bhdr\b/.test(s.grade) || !/\btmOut\b/.test(s.grade) || typeof s.fallback !== "string" || !s.fallback ||
            !s.bloom || !Array.isArray(s.bloom.sizes) || !Array.isArray(s.bloom.tints) ||
            s.bloom.sizes.length !== 6 || s.bloom.tints.length !== 6 ||
            !s.bloom.sizes.every(x => Number.isFinite(x) && x > 0) ||
            !s.bloom.tints.every(x => Number.isFinite(x) && x >= 0) ||
            !Number.isFinite(s.bloom.intensity) || s.bloom.intensity < 0 ||
            !Number.isFinite(s.bloom.radiusScale) || s.bloom.radiusScale <= 0 ||
            (s.bloom.threshold !== undefined && !Number.isFinite(s.bloom.threshold))) throw Error("invalid HDR sidecar");
        return s;
    }

    // One renderer per WebGL1 context. `params` carries bufferType and debug,
    // `stats` is the object its counters go into.
    function createRenderer(gl, params = {}, stats = { groups: 0, draws: 0, postMs: 0 }) {
        const H = { ok: null, w: 0, h: 0, programs: new Map(), resources: [] };
        // A WebGL2 context (PIXI's, for the in-scene path) has half-float targets in core
        // and can multisample them; the WebGL1 overlay keeps its extension path.
        const gl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
        function dispose() {
            for (const r of H.resources) {
                if (r.f) gl.deleteFramebuffer(r.f);
                if (r.t) gl.deleteTexture(r.t);
                if (r.rb) gl.deleteRenderbuffer(r.rb);
                if (r.rb2) gl.deleteRenderbuffer(r.rb2);
            }
            for (const p of H.programs.values()) gl.deleteProgram(p.p);
            for (const p of [H.down, H.setup, H.blur]) if (p) gl.deleteProgram(p.p);
            if (H.buf) gl.deleteBuffer(H.buf);
            H.resources = []; H.programs.clear(); H.probe = null; H.pre = null; H.msaa = null; H.ok = null;
        }
        // The context is gone: nothing to delete, and nothing left to use.
        function lost() {
            H.probe = null; H.pre = null; H.msaa = null; H.resources = []; H.programs.clear();
            H.down = H.setup = H.blur = H.buf = null; H.ok = false;
        }
        function compile(vs, fs) {
            const shaders = [], p = gl.createProgram();
            try {
                for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
                    const shader = gl.createShader(type); shaders.push(shader);
                    gl.shaderSource(shader, source); gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error("HDR shader: " + gl.getShaderInfoLog(shader));
                    gl.attachShader(p, shader);
                }
                gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
                if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error("HDR link: " + gl.getProgramInfoLog(p));
                const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
                for (let i = 0; i < n; i++) {
                    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
                    u[name] = gl.getUniformLocation(p, name);
                }
                return {p, u};
            } catch (e) { gl.deleteProgram(p); throw e; }
            finally { for (const shader of shaders) gl.deleteShader(shader); }
        }
        function gradeProgram(grade) {
            if (H.programs.has(grade)) return H.programs.get(grade);
            const fs = "precision highp float; varying vec2 vUv; uniform sampler2D uHdr; uniform sampler2D uG0; uniform sampler2D uG1;" +
            "uniform sampler2D uG2; uniform sampler2D uG3; uniform sampler2D uG4; uniform sampler2D uG5; uniform float uW[6];" +
            "uniform float uDebug; uniform float uAlphaFromColor;" +
            "void main(){ vec3 hdr = texture2D(uHdr, vUv).rgb;" +
            " hdr += uW[0] * texture2D(uG0, vUv).rgb + uW[1] * texture2D(uG1, vUv).rgb + uW[2] * texture2D(uG2, vUv).rgb" +
            " + uW[3] * texture2D(uG3, vUv).rgb + uW[4] * texture2D(uG4, vUv).rgb + uW[5] * texture2D(uG5, vUv).rgb;" +
            " hdr = max(hdr, vec3(0.0));" + "\n" + grade + "\n" +
            // Alpha from colour: for a premultiplied canvas the page blends
            // over what lies behind it, with no backdrop in this buffer. The
            // screen the game does ignores coverage, so dark quads stay clear.
            " vec3 rr_o = clamp(tmOut, 0.0, 1.0); float rr_a = clamp(texture2D(uHdr, vUv).a, 0.0, 1.0);" +
            " if (uAlphaFromColor > 0.0) rr_a = max(rr_o.r, max(rr_o.g, rr_o.b));" +
            " gl_FragColor = uDebug > 0.0 ? vec4(clamp(texture2D(uHdr, vUv).rgb / uDebug, 0.0, 1.0), 1.0) : vec4(rr_o, rr_a); }";

            const program = compile(VS, fs);
            H.programs.set(grade, program);
            return program;
        }
        function tex(w, h, type) {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const internal = !gl2 ? gl.RGBA : type === gl.HALF_FLOAT ? gl.RGBA16F : type === gl.FLOAT ? gl.RGBA32F : gl.RGBA8;
            gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
            return t;
        }
        function target(w, h, type, depth) {
            const t = tex(w, h, type);
            const f = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, f);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
            let rb = null;
            if (depth) {
                rb = gl.createRenderbuffer();
                gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
            }
            const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            const r = { t, f, rb, w, h };
            H.resources.push(r);
            return ok ? r : null;
        }
        // The light buffer multisampled (WebGL2): Effekseer draws here, and post() resolves it
        // into H.main. Null where the format cannot be multisampled.
        function multisampled(w, h, type) {
            const internal = type === gl.FLOAT ? gl.RGBA32F : gl.RGBA16F;
            const supported = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, internal, gl.SAMPLES) || []);
            const samples = supported.filter(n => n <= params.samples).sort((a, b) => b - a)[0];
            if (!samples) return null;
            const f = gl.createFramebuffer(), rb = gl.createRenderbuffer(), rb2 = gl.createRenderbuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, f);
            gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internal, w, h);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
            gl.bindRenderbuffer(gl.RENDERBUFFER, rb2);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT16, w, h);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb2);
            const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindRenderbuffer(gl.RENDERBUFFER, null);
            const r = { f, rb, rb2, w, h, samples };
            H.resources.push(r);
            return ok ? r : null;
        }
        // Allocate (or resize) the targets for a w x h light buffer.
        // False when this context cannot render HDR; it stays false until restored.
        function ensure(w, h) {
            if (gl.isContextLost() || H.ok === false) return false;
            if (H.ok && H.w === w && H.h === h) return true;
            if (H.ok) dispose();
            try {
                let type, probe;
                if (gl2) {
                    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) throw Error("no float render target in this WebGL2 context");
                    type = params.bufferType === "float" && gl.getExtension("OES_texture_float_linear") ? gl.FLOAT : gl.HALF_FLOAT;
                    probe = target(4, 4, type, false);
                } else {
                const half = gl.getExtension("OES_texture_half_float");
                gl.getExtension("EXT_color_buffer_half_float");
                const halfLinear = gl.getExtension("OES_texture_half_float_linear");
                type = half && halfLinear && params.bufferType !== "float" ? half.HALF_FLOAT_OES : 0;
                probe = type && target(4, 4, type, false);
                if (!probe && params.bufferType !== "half") {
                    gl.getExtension("OES_texture_float");
                    if (!gl.getExtension("OES_texture_float_linear")) throw Error("float linear sampling unavailable");
                    gl.getExtension("WEBGL_color_buffer_float");
                    type = gl.FLOAT;
                    probe = target(4, 4, type, false);
                }
                }
                if (!probe) throw new Error("no float render target in this WebGL context");
                H.type = type;
                H.main = target(w, h, type, true);
                if (!H.main) throw Error("HDR depth target incomplete");
                H.msaa = gl2 && params.samples > 0 ? multisampled(w, h, type) : null;
                stats.samples = H.msaa ? H.msaa.samples : 0;
                H.levels = [H.main];
                for (let l = 1, lw = w, lh = h; l <= 7; l++) {
                    lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
                    H.levels.push(target(lw, lh, type, false));
                }
                H.tmp = H.levels.map(L => target(L.w, L.h, type, false));
                if (H.levels.some(x => !x) || H.tmp.some(x => !x)) throw Error("bloom pyramid incomplete");
                H.g = Array.from({length: 6}, () => null);
                H.down = compile(VS, FS_DOWN);
                H.setup = compile(VS, FS_SETUP);
                H.blur = compile(VS, FS_BLUR);

                H.buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, H.buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
                H.w = w; H.h = h; H.ok = true;
                stats.allocations = (stats.allocations || 0) + 1;
                stats.bufferType = type === gl.FLOAT ? "float" : "half";
                stats.size = [w, h];
                if ((params.debug === true || params.debug === "true")) console.info("[ReactorHdrOverlay] " + stats.bufferType + " " + w + "x" + h);
                return true;
            } catch (e) {
                console.warn("[reactor_hdr] disabled:", e);
                dispose(); H.ok = false;
                return false;
            }
        }

        // `out` is where the composite lands: H.target (the default framebuffer
        // unless post() was given one) at (x, y, w, h). Absent, it covers the
        // light buffer from the origin.
        function quad(prog, dst, out) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : H.target || null);
            if (dst) gl.viewport(0, 0, dst.w, dst.h);
            else if (out) gl.viewport(out.x, out.y, out.w, out.h);
            else gl.viewport(0, 0, H.w, H.h);
            gl.useProgram(prog.p);
            gl.bindBuffer(gl.ARRAY_BUFFER, H.buf);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        function bind(unit, t, loc) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.uniform1i(loc, unit);
        }
        // Bind and clear the light buffer for a grade group's draws.
        function begin() {
            gl.bindFramebuffer(gl.FRAMEBUFFER, (H.msaa || H.main).f);
            gl.viewport(0, 0, H.w, H.h);
            gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.depthMask(true);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        // Bloom the light buffer, grade it once, and screen it over the default
        // framebuffer, or s.framebuffer. `s` is { bloom, bloomScale, threshold, coverage,
        // debugScale, measureGpu, alphaFromColor, bloomWidth, pixelScale, framebuffer };
        // the overlay sets none of the last four.
        function post(s, sc, out) {
            H.target = s.framebuffer || null;
            if (s.measureGpu) gl.finish();
            const start = performance.now();
            const SIZES = sc.bloom.sizes, TINTS = sc.bloom.tints;
            H.comp = gradeProgram(sc.grade);
            gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
            gl.colorMask(true, true, true, true);
            gl.disable(gl.BLEND);
            if (H.msaa) {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, H.msaa.f);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, H.main.f);
                gl.blitFramebuffer(0, 0, H.w, H.h, 0, 0, H.w, H.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            // mip chain (skip all 19 bloom passes when intensity is zero)
            const weights = [];
            if (s.bloom > 0) {
                // The threshold acts at the game's bloom setup resolution, half its screen. An effect drawn radiusScale
                // times larger than in the game covers that pixel with radiusScale of ours: level log2(radiusScale).
                // Every Gaussian reads that level or a coarser one, so all of the bloom is thresholded. A preview
                // draws a game pixel as pixelScale of its own, which moves the level with it.
                const setupLevel = Number.isFinite(s.threshold) ?
                    Math.min(H.levels.length - 1, Math.max(0, Math.round(Math.log2(s.bloomScale * (s.pixelScale > 0 ? s.pixelScale : 1))))) : -1;
                let base = H.main;
                if (setupLevel === 0) {
                    if (!H.pre) H.pre = target(H.w, H.h, H.type, false);
                    if (!H.pre) throw Error("bloom setup target incomplete");
                    gl.useProgram(H.setup.p);
                    bind(0, H.main.t, H.setup.u.uTex);
                    gl.uniform2f(H.setup.u.uTexel, 0, 0);
                    gl.uniform1f(H.setup.u.uThreshold, s.threshold);
                    quad(H.setup, H.pre);
                    base = H.pre;
                }
                const level = l => l === 0 ? base : H.levels[l];
                for (let l = 1; l < H.levels.length; l++) {
                    const src = level(l - 1);
                    const prog = l === setupLevel ? H.setup : H.down;
                    gl.useProgram(prog.p);
                    bind(0, src.t, prog.u.uTex);
                    gl.uniform2f(prog.u.uTexel, 1 / src.w, 1 / src.h);
                    if (prog === H.setup) gl.uniform1f(prog.u.uThreshold, s.threshold);
                    quad(prog, H.levels[l]);
                }
                // six Gaussians, each blurred at the level where its sigma is 2-4 texels (never finer than the setup)
                // Radii are fractions of the view's width: the light buffer's in
                // the game, the game screen's width as a preview draws it there.
                const viewWidth = s.bloomWidth > 0 ? s.bloomWidth : H.w;
                for (let i = 0; i < SIZES.length; i++) {
                    const sigma = viewWidth * SIZES[i] * 0.04 * 0.5 / Math.sqrt(33.4) * s.bloomScale;
                    let l = Math.max(0, setupLevel);
                    while (l < H.levels.length - 1 && sigma / Math.pow(2, l) > 4) l++;
                    const st = sigma / Math.pow(2, l);
                    const L = level(l), T = H.tmp[l];
                    if (!H.g[i] || H.g[i].w !== L.w || H.g[i].h !== L.h) {
                        if (H.g[i]) { const old = H.g[i]; gl.deleteTexture(old.t); gl.deleteFramebuffer(old.f);
                            H.resources.splice(H.resources.indexOf(old), 1); }
                        H.g[i] = target(L.w, L.h, H.type, false);
                        if (!H.g[i]) throw Error("bloom target incomplete");
                    }
                    gl.useProgram(H.blur.p);
                    gl.uniform1f(H.blur.u.uSigma, Math.max(st, 0.3));
                    bind(0, L.t, H.blur.u.uTex);
                    gl.uniform2f(H.blur.u.uStep, 1 / L.w, 0);
                    quad(H.blur, T);
                    bind(0, T.t, H.blur.u.uTex);
                    gl.uniform2f(H.blur.u.uStep, 0, 1 / L.h);
                    quad(H.blur, H.g[i]);
                    weights.push(TINTS[i] * s.bloom);
                }
            }
            // grade once, screen over the overlay (the scene copy and any plain effects already on it)
            gl.useProgram(H.comp.p);
            bind(0, H.main.t, H.comp.u.uHdr);
            for (let i = 0; i < 6; i++) bind(1 + i, s.bloom > 0 ? H.g[i].t : H.main.t, H.comp.u["uG" + i]);
            gl.uniform1fv(H.comp.u.uW, weights.length ? weights : [0,0,0,0,0,0]);
            gl.uniform1f(H.comp.u.uDebug, s.debugScale || 0);
            gl.uniform1f(H.comp.u.uAlphaFromColor, s.alphaFromColor ? 1 : 0);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, s.coverage ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE_MINUS_SRC_COLOR);
            quad(H.comp, null, out);
            gl.disable(gl.BLEND);
            gl.activeTexture(gl.TEXTURE0);
            if (s.measureGpu) gl.finish();
            stats.postMs += performance.now() - start;
            stats.groups++;
            if (s.measureGpu) { (stats.postSamples || (stats.postSamples = [])).push(performance.now() - start); }
        }

        // Debug readback through an RGBA8 staging target: WebGL1 cannot portably read half-float pixels.
        // Values are reported as quantized lower bounds, with the divisor recorded. Never used for normal playback.
        function probe(scale) {
            if (!H.probe) {
                H.probe = target(H.w, H.h, gl.UNSIGNED_BYTE, false);
                H.probeProgram = compile(VS, "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform float uScale;" +
                    "void main(){vec4 c=texture2D(uTex,vUv);gl_FragColor=vec4(clamp(c.rgb/uScale,0.0,1.0),clamp(c.a,0.0,1.0));}");
                H.programs.set("__probe__", H.probeProgram);
            }
            gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
            gl.colorMask(true,true,true,true); gl.useProgram(H.probeProgram.p);
            bind(0,H.main.t,H.probeProgram.u.uTex); gl.uniform1f(H.probeProgram.u.uScale,scale);
            quad(H.probeProgram,H.probe);
            const bytes = new Uint8Array(H.w*H.h*4); gl.readPixels(0,0,H.w,H.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
            let max=0,alpha=0;
            for(let i=0;i<bytes.length;i+=4){max=Math.max(max,bytes[i],bytes[i+1],bytes[i+2]);alpha=Math.max(alpha,bytes[i+3]);}
            stats.probe = {scale, maxLowerBound: Math.max(0,(max-0.5)/255*scale), maxAlpha: alpha/255};
        }

        return {
            gl, stats, ensure, begin, post, probe, gradeProgram, dispose, lost,
            // A failed pass: drop everything and refuse further HDR on this context.
            fail() { dispose(); H.ok = false; },
            restored() { H.ok = null; },
            get ok() { return H.ok; },
            get size() { return [H.w, H.h]; }
        };
    }
    window.ReactorHdrRenderer = { create: createRenderer, valid };

    // ---- The game's adapter ------------------------------------------------
    const params = {};
    const cache = new Map();
    const active = new Set();
    let R = null;
    const api = window.ReactorHdrOverlay = { native: true, cache, stats: { groups: 0, draws: 0, postMs: 0 },
        // Testing overrides still require a grade and a safe twin.
        overrides: Object.create(null) };
    function settings(sidecar) {
        return Object.assign({ bloom: Number(params.bloomIntensity ?? sidecar.bloom.intensity),
            bloomScale: Number(params.bloomRadiusScale ?? sidecar.bloom.radiusScale), threshold: sidecar.bloom.threshold,
            debug: (params.debug === true || params.debug === "true") },
            window.REACTOR_HDR || {});
    }
    // The renderer for the overlay's current context. A new context (the
    // overlay was recreated) replaces it; a lost old one also ends its effects.
    function ensure(gl, w, h) {
        if (!R || R.gl !== gl) {
            if (R && !R.gl.isContextLost()) R.dispose();
            else if (R) api.contextLost();
            R = createRenderer(gl, params, api.stats);
        }
        return R.ensure(w, h);
    }
    function request(name) {
        if (cache.has(name)) return cache.get(name);
        const entry = { ready: false, sidecar: null, error: null };
        cache.set(name, entry);
        // On the desktop a missing file is not a 404 but a failed fetch: an effect without a sidecar
        // (nearly all of them) is looked for on disk first, and is plainly not HDR.
        const url = EffectManager.makeUrl(name).replace(/\.efkefc$/, ".hdr.json");
        if (typeof Utils !== "undefined" && Utils.localAssetExists && Utils.localAssetExists(url) === false) {
            entry.ready = true;
            entry.promise = Promise.resolve();
            return entry;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        entry.promise = fetch(url, {signal: controller.signal})
            .then(r => { if (r.status === 404) return null; if (!r.ok) throw Error("sidecar HTTP " + r.status); return r.json(); })
            .then(s => { entry.sidecar = s && valid(s); })
            .catch(e => { entry.error = String(e); console.warn("[ReactorHdrOverlay] " + name + ": " + e); })
            .finally(() => { clearTimeout(timer); entry.ready = true; });
        return entry;
    }
    api.request = request;
    function forced(sprite) {
        const a = sprite._animation || {};
        return /\[HDR\]/.test(a.name || "") || (window.REACTOR_HDR_IDS || []).indexOf(a.id) >= 0;
    }
    function sidecarFor(sprite) {
        const a = sprite._animation || {}, e = sprite._hdrEntry;
        return e && e.sidecar || (forced(sprite) && api.overrides[a.effectName]) || null;
    }
    // The context an effect is loaded into: the scene's for an in-scene sprite, the overlay's otherwise.
    function load(sprite, name) {
        return sprite._effekseerInScene ? Sprite_Animation.SceneLayer.load(name) : EffectManager.load(name);
    }
    function fallbackName(sprite, sc) {
        const name = sprite._animation.effectName;
        return sc.fallback.includes('/') ? sc.fallback : name.slice(0, name.lastIndexOf('/') + 1) + sc.fallback;
    }
    api.setup = function(sprite, animation) {
        if ((!sprite._effectContext || sprite._effekseerInScene) && animation.effectName) {
            sprite._hdrEntry = request(animation.effectName);
            sprite._hdrSelected = false;
        }
    };
    api.canStart = function(sprite) {
        return select.call(sprite);
    };
    function select() {
        if (this._hdrEntry && !this._hdrSelected) {
            if (!this._hdrEntry.ready) return false;
            const inScene = !!this._effekseerInScene;
            if ((inScene ? scene.gl() : Graphics._effekseerGL)?.isContextLost()) return false;
            let sc = sidecarFor(this);
            try {
                if (sc) sc = valid(sc);
                if ((forced(this) || /-hdr$/i.test(this._animation.effectName)) && !sc) throw Error("HDR effect requires a sidecar or ReactorHdrOverlay.overrides entry");
            } catch (e) {
                console.warn("[ReactorHdrOverlay] " + e.message); this._playing = false; return false;
            }
            if (this._hdrEntry.error && !sc) {
                // Malformed metadata cannot safely identify an HDR asset or its fallback. Fail closed.
                this._playing = false; return false;
            }
            if (inScene) {
                this._hdrActive = !!(sc && scene.ready(sc));
            } else {
                const gl = Graphics._effekseerGL, canvas = Graphics._effekseerCanvas;
                this._hdrActive = !!(sc && gl && canvas && !gl.isContextLost() && ensure(gl, canvas.width, canvas.height));
                if (this._hdrActive) {
                    try { R.gradeProgram(sc.grade); } catch (e) { this._hdrActive = false; console.warn("[ReactorHdrOverlay] " + e); }
                }
            }
            if (sc && !this._hdrActive) this._effect = load(this, fallbackName(this, sc));
            if (this._hdrActive) active.add(this);
            this._hdrSelected = true;
        }
        return true;
    }
    api.contextLost = function() {
        // Old WASM handles cannot be resumed in the replacement Effekseer context.
        // End active HDR animations so a battle cannot wait on a stranded handle.
        // In-scene ones live on PIXI's context, which this loss does not touch.
        for (const sprite of active) {
            if (sprite._effekseerInScene) continue;
            sprite._handle?.stop();
            sprite._hdrActive = false; sprite._playing = false; sprite._started = false;
            active.delete(sprite);
        }
        R?.lost();
    };
    api.contextRestored = function() { R?.restored(); };
    api.release = function(sprite) { active.delete(sprite); };
    api.configure = function(options) {
        Object.assign(params, options);
    };
    api.render = function(renderer, draws) {
        if (!draws.length) return;
        const gl = Graphics._effekseerGL, canvas = Graphics._effekseerCanvas;
        if (gl?.isContextLost()) { api.contextLost(); return; }
        if (!gl || !ensure(gl, canvas.width, canvas.height)) {
            // Never draw HDR light into the display buffer. Existing effects are stopped on loss by the engine.
            for (const sprite of draws) { sprite._handle.stop(); sprite._started = false;
                active.delete(sprite);
                sprite._hdrActive = false; sprite._effect = EffectManager.load(fallbackName(sprite, sidecarFor(sprite))); }
            return;
        }
        const groups = new Map();
        for (const sprite of draws) {
            const sc = sidecarFor(sprite);
            if (!groups.has(sc.grade)) groups.set(sc.grade, { sc, sprites: [] });
            groups.get(sc.grade).sprites.push(sprite);
        }
        try {
            for (const group of groups.values()) {
                R.begin();
                for (const sprite of group.sprites) {
                    sprite.setProjectionMatrix(renderer); sprite.setCameraMatrix(renderer); sprite.setViewport(renderer);
                    const efx = Graphics.effekseer;
                    efx.beginDraw(); efx.drawHandle(sprite._handle); efx.endDraw();
                    Graphics.settleEffekseerState();
                    api.stats.draws++;
                }
                const config = settings(group.sc);
                if (config.probeScale && (!config.probeFrame || group.sprites.some(x => x._frameIndex === config.probeFrame))) R.probe(config.probeScale);
                R.post(config, group.sc);
            }
        } catch (e) {
            console.warn("[ReactorHdrOverlay] pass failed; selecting fallback:", e);
            R.fail();
            for (const sprite of draws) {
                active.delete(sprite);
                sprite._handle.stop(); sprite._started = false; sprite._hdrActive = false;
                sprite._effect = EffectManager.load(fallbackName(sprite, sidecarFor(sprite)));
            }
        } finally {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            draws[draws.length - 1].resetViewport(renderer);
        }
    };

    // ---- In-scene support -------------------------------------------------
    // Screen animations drawn inside PIXI's scene (Sprite_Animation.SceneLayer,
    // reactor_sprites.js) draw their HDR light through a renderer of their own
    // on PIXI's WebGL2 context, and composite it into whatever PIXI is drawing
    // to at the time. The layer owns the GL state around those calls; this
    // part chooses HDR or the twin and lends the sidecar's settings.
    let RS = null;
    const scene = api.scene = {
        stats: { groups: 0, draws: 0, postMs: 0 },
        gl() { return typeof Graphics !== "undefined" && Graphics._app && Graphics._app.renderer ? Graphics._app.renderer.gl : null; },
        // The renderer for PIXI's context: replaced when the context is.
        renderer(gl) {
            if (!RS || RS.gl !== gl) {
                if (RS && !RS.gl.isContextLost()) RS.dispose();
                RS = createRenderer(gl, Object.assign({ samples: 4 }, params), scene.stats);
            }
            return RS;
        },
        // Whether an in-scene sprite with this sidecar can be drawn in HDR here: float targets
        // and a grade that compiles, tried at the game's own size (what the light is drawn at).
        ready(sc) {
            const layer = Sprite_Animation.SceneLayer;
            try {
                return !!layer.guard(gl => {
                    const R = scene.renderer(gl);
                    if (!R.ensure(Math.max(1, Graphics.width | 0), Math.max(1, Graphics.height | 0))) return false;
                    R.gradeProgram(sc.grade);
                    return true;
                });
            } catch (e) {
                console.warn("[ReactorHdrOverlay] " + e);
                return false;
            }
        },
        sidecar: sidecarFor,
        settings,
        // A pass that failed: this sprite plays its twin from here on.
        fallBack(sprite) {
            active.delete(sprite);
            try { sprite._handle?.stop(); } catch (e) { /* a lost context */ }
            sprite._started = false; sprite._hdrActive = false;
            sprite._effect = load(sprite, fallbackName(sprite, sidecarFor(sprite)));
        },
        lost() {
            for (const sprite of active) if (sprite._effekseerInScene) active.delete(sprite);
            RS?.lost();
        },
        restored() { RS?.restored(); }
    };
})();
