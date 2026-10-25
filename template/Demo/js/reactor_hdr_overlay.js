//=============================================================================
// reactor_hdr_overlay.js — optional HDR light accumulation for the WebGL1 overlay
// Built into RPG Reactor. See docs/HDR-EFFECT-OVERLAY.md for asset/config contracts.
// No targets or programs are allocated until an opted-in animation starts.
//=============================================================================
(function() {
    "use strict";
    const params = {};
    const cache = new Map();
    const active = new Set();
    const H = { ok: null, w: 0, h: 0, programs: new Map(), resources: [] };
    const api = window.ReactorHdrOverlay = { native: true, cache, stats: { groups: 0, draws: 0, postMs: 0 },
        // Testing overrides still require a grade and a safe twin.
        overrides: Object.create(null) };
    function settings(sidecar) {
        return Object.assign({ bloom: Number(params.bloomIntensity ?? sidecar.bloom.intensity),
            bloomScale: Number(params.bloomRadiusScale ?? sidecar.bloom.radiusScale), debug: (params.debug === true || params.debug === "true") },
            window.REACTOR_HDR || {});
    }
    function valid(s) {
        if (!s || s.version !== 1 || s.gradeInput !== "hdr" || typeof s.grade !== "string" ||
            !/\bhdr\b/.test(s.grade) || !/\btmOut\b/.test(s.grade) || typeof s.fallback !== "string" || !s.fallback ||
            !s.bloom || !Array.isArray(s.bloom.sizes) || !Array.isArray(s.bloom.tints) ||
            s.bloom.sizes.length !== 6 || s.bloom.tints.length !== 6 ||
            !s.bloom.sizes.every(x => Number.isFinite(x) && x > 0) ||
            !s.bloom.tints.every(x => Number.isFinite(x) && x >= 0) ||
            !Number.isFinite(s.bloom.intensity) || s.bloom.intensity < 0 ||
            !Number.isFinite(s.bloom.radiusScale) || s.bloom.radiusScale <= 0) throw Error("invalid HDR sidecar");
        return s;
    }
    function request(name) {
        if (cache.has(name)) return cache.get(name);
        const entry = { ready: false, sidecar: null, error: null };
        cache.set(name, entry);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        entry.promise = fetch(EffectManager.makeUrl(name).replace(/\.efkefc$/, ".hdr.json"), {signal: controller.signal})
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
    function fallbackName(sprite, sc) {
        const name = sprite._animation.effectName;
        return sc.fallback.includes('/') ? sc.fallback : name.slice(0, name.lastIndexOf('/') + 1) + sc.fallback;
    }
    api.setup = function(sprite, animation) {
        if (!sprite._effectContext && animation.effectName) {
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
            if (Graphics._effekseerGL?.isContextLost()) return false;
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
            const gl = Graphics._effekseerGL, canvas = Graphics._effekseerCanvas;
            this._hdrActive = !!(sc && gl && canvas && !gl.isContextLost() && ensure(gl, canvas.width, canvas.height));
            if (this._hdrActive) {
                try { gradeProgram(gl, sc.grade); } catch (e) { this._hdrActive = false; console.warn("[ReactorHdrOverlay] " + e); }
            }
            if (sc && !this._hdrActive) this._effect = EffectManager.load(fallbackName(this, sc));
            if (this._hdrActive) active.add(this);
            this._hdrSelected = true;
        }
        return true;
    }
    function dispose(gl) {
        for (const r of H.resources) {
            if (r.f) gl.deleteFramebuffer(r.f);
            if (r.t) gl.deleteTexture(r.t);
            if (r.rb) gl.deleteRenderbuffer(r.rb);
        }
        for (const p of H.programs.values()) gl.deleteProgram(p.p);
        for (const p of [H.down, H.blur]) if (p) gl.deleteProgram(p.p);
        if (H.buf) gl.deleteBuffer(H.buf);
        H.resources = []; H.programs.clear(); H.probe = null; H.ok = null;
    }
    api.contextLost = function() {
        // Old WASM handles cannot be resumed in the replacement Effekseer context.
        // End active HDR animations so a battle cannot wait on a stranded handle.
        for (const sprite of active) {
            sprite._handle?.stop();
            sprite._hdrActive = false; sprite._playing = false; sprite._started = false;
        }
        active.clear();
        H.probe = null; H.resources = []; H.programs.clear();
        H.down = H.blur = H.buf = null; H.ok = false;
    };
    api.contextRestored = function() { H.ok = null; };
    api.release = function(sprite) { active.delete(sprite); };
    api.configure = function(options) {
        Object.assign(params, options);
    };
    function compile(gl, vs, fs) {
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

    const VS = "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }";
    // 2x2 box from a bilinear tap at the texel corner
    const FS_DOWN = "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;" +
        "void main(){ gl_FragColor = 0.25 * (texture2D(uTex, vUv + uTexel * vec2(-0.5,-0.5)) + texture2D(uTex, vUv + uTexel * vec2(0.5,-0.5))" +
        " + texture2D(uTex, vUv + uTexel * vec2(-0.5,0.5)) + texture2D(uTex, vUv + uTexel * vec2(0.5,0.5))); }";
    // separable Gaussian, sigma in texels (<= ~5), +-3 sigma
    const FS_BLUR = "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uStep; uniform float uSigma;" +
        "void main(){ vec4 s = vec4(0.0); float w = 0.0; for (int i = -16; i <= 16; i++) { float x = float(i);" +
        " if (abs(x) > 3.0 * uSigma + 0.5) continue; float k = exp(-0.5 * x * x / (uSigma * uSigma));" +
        " s += k * texture2D(uTex, vUv + uStep * x); w += k; } gl_FragColor = s / w; }";
    function gradeProgram(gl, grade) {
        if (H.programs.has(grade)) return H.programs.get(grade);
        const fs = "precision highp float; varying vec2 vUv; uniform sampler2D uHdr; uniform sampler2D uG0; uniform sampler2D uG1;" +
        "uniform sampler2D uG2; uniform sampler2D uG3; uniform sampler2D uG4; uniform sampler2D uG5; uniform float uW[6];" +
        "uniform float uDebug;" +
        "void main(){ vec3 hdr = texture2D(uHdr, vUv).rgb;" +
        " hdr += uW[0] * texture2D(uG0, vUv).rgb + uW[1] * texture2D(uG1, vUv).rgb + uW[2] * texture2D(uG2, vUv).rgb" +
        " + uW[3] * texture2D(uG3, vUv).rgb + uW[4] * texture2D(uG4, vUv).rgb + uW[5] * texture2D(uG5, vUv).rgb;" +
        " hdr = max(hdr, vec3(0.0));" + "\n" + grade + "\n" +
        " gl_FragColor = uDebug > 0.0 ? vec4(clamp(texture2D(uHdr, vUv).rgb / uDebug, 0.0, 1.0), 1.0) : vec4(clamp(tmOut, 0.0, 1.0), clamp(texture2D(uHdr, vUv).a, 0.0, 1.0)); }";

        const program = compile(gl, VS, fs);
        H.programs.set(grade, program);
        return program;
    }
    function tex(gl, w, h, type) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
        return t;
    }
    function target(gl, w, h, type, depth) {
        const t = tex(gl, w, h, type);
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

    function ensure(gl, w, h) {
        if (H.gl !== gl) {
            if (H.gl && !H.gl.isContextLost()) dispose(H.gl);
            else api.contextLost();
            H.gl = gl; H.ok = null;
        }
        if (gl.isContextLost() || H.ok === false) return false;
        if (H.ok && H.w === w && H.h === h) return true;
        if (H.ok) dispose(gl);
        try {
            const half = gl.getExtension("OES_texture_half_float");
            gl.getExtension("EXT_color_buffer_half_float");
            const halfLinear = gl.getExtension("OES_texture_half_float_linear");
            let type = half && halfLinear && params.bufferType !== "float" ? half.HALF_FLOAT_OES : 0;
            let probe = type && target(gl, 4, 4, type, false);
            if (!probe && params.bufferType !== "half") {
                gl.getExtension("OES_texture_float");
                if (!gl.getExtension("OES_texture_float_linear")) throw Error("float linear sampling unavailable");
                gl.getExtension("WEBGL_color_buffer_float");
                type = gl.FLOAT;
                probe = target(gl, 4, 4, type, false);
            }
            if (!probe) throw new Error("no float render target in this WebGL1 context");
            H.type = type;
            H.main = target(gl, w, h, type, true);
            if (!H.main) throw Error("HDR depth target incomplete");
            H.levels = [H.main];
            for (let l = 1, lw = w, lh = h; l <= 7; l++) {
                lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
                H.levels.push(target(gl, lw, lh, type, false));
            }
            H.tmp = H.levels.map(L => target(gl, L.w, L.h, type, false));
            if (H.levels.some(x => !x) || H.tmp.some(x => !x)) throw Error("bloom pyramid incomplete");
            H.g = Array.from({length: 6}, () => null);
            H.down = compile(gl, VS, FS_DOWN);
            H.blur = compile(gl, VS, FS_BLUR);

            H.buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, H.buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            H.w = w; H.h = h; H.ok = true;
            api.stats.allocations = (api.stats.allocations || 0) + 1;
            api.stats.bufferType = type === gl.FLOAT ? "float" : "half";
            api.stats.size = [w, h];
            if ((params.debug === true || params.debug === "true")) console.info("[ReactorHdrOverlay] " + api.stats.bufferType + " " + w + "x" + h);
            return true;
        } catch (e) {
            console.warn("[reactor_hdr] disabled:", e);
            dispose(gl); H.ok = false;
            return false;
        }
    }

    function quad(gl, prog, dst) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null);
        gl.viewport(0, 0, dst ? dst.w : H.w, dst ? dst.h : H.h);
        gl.useProgram(prog.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, H.buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function bind(gl, unit, t, loc) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(loc, unit);
    }

    function post(gl, s, sc) {
        if (s.measureGpu) gl.finish();
        const start = performance.now();
        const SIZES = sc.bloom.sizes, TINTS = sc.bloom.tints;
        H.comp = gradeProgram(gl, sc.grade);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
        gl.colorMask(true, true, true, true);
        gl.disable(gl.BLEND);
        // mip chain (skip all 19 bloom passes when intensity is zero)
        const weights = [];
        if (s.bloom > 0) {
            for (let l = 1; l < H.levels.length; l++) {
                const src = H.levels[l - 1];
                gl.useProgram(H.down.p);
                bind(gl, 0, src.t, H.down.u.uTex);
                gl.uniform2f(H.down.u.uTexel, 1 / src.w, 1 / src.h);
                quad(gl, H.down, H.levels[l]);
            }
            // six Gaussians, each blurred at the level where its sigma is 2-4 texels
            for (let i = 0; i < SIZES.length; i++) {
                const sigma = H.w * SIZES[i] * 0.04 * 0.5 / Math.sqrt(33.4) * s.bloomScale;
                let l = 0;
                while (l < H.levels.length - 1 && sigma / Math.pow(2, l) > 4) l++;
                const st = sigma / Math.pow(2, l);
                const L = H.levels[l], T = H.tmp[l];
                if (!H.g[i] || H.g[i].w !== L.w || H.g[i].h !== L.h) {
                    if (H.g[i]) { const old = H.g[i]; gl.deleteTexture(old.t); gl.deleteFramebuffer(old.f);
                        H.resources.splice(H.resources.indexOf(old), 1); }
                    H.g[i] = target(gl, L.w, L.h, H.type, false);
                    if (!H.g[i]) throw Error("bloom target incomplete");
                }
                gl.useProgram(H.blur.p);
                gl.uniform1f(H.blur.u.uSigma, Math.max(st, 0.3));
                bind(gl, 0, L.t, H.blur.u.uTex);
                gl.uniform2f(H.blur.u.uStep, 1 / L.w, 0);
                quad(gl, H.blur, T);
                bind(gl, 0, T.t, H.blur.u.uTex);
                gl.uniform2f(H.blur.u.uStep, 0, 1 / L.h);
                quad(gl, H.blur, H.g[i]);
                weights.push(TINTS[i] * s.bloom);
            }
        }
        // grade once, screen over the overlay (the scene copy and any plain effects already on it)
        gl.useProgram(H.comp.p);
        bind(gl, 0, H.main.t, H.comp.u.uHdr);
        for (let i = 0; i < 6; i++) bind(gl, 1 + i, s.bloom > 0 ? H.g[i].t : H.main.t, H.comp.u["uG" + i]);
        gl.uniform1fv(H.comp.u.uW, weights.length ? weights : [0,0,0,0,0,0]);
        gl.uniform1f(H.comp.u.uDebug, s.debugScale || 0);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, s.coverage ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE_MINUS_SRC_COLOR);
        quad(gl, H.comp, null);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        if (s.measureGpu) gl.finish();
        api.stats.postMs += performance.now() - start;
        api.stats.groups++;
        if (s.measureGpu) { (api.stats.postSamples || (api.stats.postSamples = [])).push(performance.now() - start); }
    }

    // Debug readback through an RGBA8 staging target: WebGL1 cannot portably read half-float pixels.
    // Values are reported as quantized lower bounds, with the divisor recorded. Never used for normal playback.
    function probe(gl, scale) {
        if (!H.probe) {
            H.probe = target(gl, H.w, H.h, gl.UNSIGNED_BYTE, false);
            H.probeProgram = compile(gl, VS, "precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform float uScale;" +
                "void main(){vec4 c=texture2D(uTex,vUv);gl_FragColor=vec4(clamp(c.rgb/uScale,0.0,1.0),clamp(c.a,0.0,1.0));}");
            H.programs.set("__probe__", H.probeProgram);
        }
        gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
        gl.colorMask(true,true,true,true); gl.useProgram(H.probeProgram.p);
        bind(gl,0,H.main.t,H.probeProgram.u.uTex); gl.uniform1f(H.probeProgram.u.uScale,scale);
        quad(gl,H.probeProgram,H.probe);
        const bytes = new Uint8Array(H.w*H.h*4); gl.readPixels(0,0,H.w,H.h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        let max=0,alpha=0;
        for(let i=0;i<bytes.length;i+=4){max=Math.max(max,bytes[i],bytes[i+1],bytes[i+2]);alpha=Math.max(alpha,bytes[i+3]);}
        api.stats.probe = {scale, maxLowerBound: Math.max(0,(max-0.5)/255*scale), maxAlpha: alpha/255};
    }
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
                gl.bindFramebuffer(gl.FRAMEBUFFER, H.main.f);
                gl.viewport(0, 0, H.w, H.h);
                gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.depthMask(true);
                gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                for (const sprite of group.sprites) {
                    sprite.setProjectionMatrix(renderer); sprite.setCameraMatrix(renderer); sprite.setViewport(renderer);
                    const efx = Graphics.effekseer;
                    efx.beginDraw(); efx.drawHandle(sprite._handle); efx.endDraw();
                    Graphics.settleEffekseerState();
                    api.stats.draws++;
                }
                const config = settings(group.sc);
                if (config.probeScale && (!config.probeFrame || group.sprites.some(x => x._frameIndex === config.probeFrame))) probe(gl, config.probeScale);
                post(gl, config, group.sc);
            }
        } catch (e) {
            console.warn("[ReactorHdrOverlay] pass failed; selecting fallback:", e);
            dispose(gl); H.ok = false;
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
})();
