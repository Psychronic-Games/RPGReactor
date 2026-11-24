/**
 * RRHdrPreview - HDR rendering for the editor's animation previews.
 *
 * The game draws an HDR effect through ReactorHdrRenderer
 * (runtime/reactor_hdr_overlay.js): its light goes into a floating-point
 * buffer, gains bloom and is graded once, then is screened over the scene.
 * The previews run that same renderer, one per WebGL context, so an HDR
 * effect looks here as it does in the game.
 *
 * Where a preview cannot - the runtime file is missing, the context has no
 * float targets, the grade does not compile, or the effect is drawn by the
 * 3D scene - it plays the sidecar's normally graded twin, as the game does
 * when it cannot render HDR. What the game refuses to play, the preview
 * refuses too (RR_resolveHdrPreviewTwin).
 */
(function (root) {
    'use strict';
    const RUNTIME_FILE = 'reactor_hdr_overlay.js';
    // null: not tried; 'loading': the web host is fetching it; then true or false.
    let runtimeState = null;
    const renderers = new WeakMap();
    const contexts = new WeakMap();
    // Central pairing keeps every preview site on the same seed, clock and transforms.
    function pairContext(context) {
        if (contexts.has(context)) return;
        const state = { pass: 'light' };
        contexts.set(context, state);
        const play = context.play, drawHandle = context.drawHandle, releaseEffect = context.releaseEffect;
        context.play = function(effect, ...args) {
            const main = play.call(this, effect, ...args);
            if (!effect.rrHdr?.companionEffect || !main) return main;
            const companion = play.call(this, effect.rrHdr.companionEffect, ...args);
            if (!companion) { main.stop(); throw Error('HDR companion play failed'); }
            const seed = Math.floor(Math.random() * 0x7fffffff);
            main.setRandomSeed(seed); companion.setRandomSeed(seed);
            return new Proxy(main, { get(target, key) {
                if (key === 'rrCompanion') return companion;
                if (key === 'exists') return target.exists || companion.exists;
                const value = target[key];
                if (typeof value !== 'function') return value;
                return (...values) => {
                    const result = value.apply(target, values);
                    if ((String(key).startsWith('set') || key === 'stop') && typeof companion[key] === 'function') companion[key](...values);
                    return result;
                };
            } });
        };
        context.drawHandle = function(handle) {
            const chosen = state.pass === 'companion' ? handle?.rrCompanion : handle;
            if (chosen?.exists) return drawHandle.call(this, chosen);
        };
        if (releaseEffect) context.releaseEffect = function(effect) {
            effect?.rrHdr?.cancelLoad?.();
            if (effect?.rrHdr?.companionEffect) releaseEffect.call(this, effect.rrHdr.companionEffect);
            return releaseEffect.call(this, effect);
        };
    }
    function companionPath(effectPath, name) {
        const path = require('path');
        let base = path.dirname(effectPath);
        if (name.includes('/')) {
            while (path.basename(base).toLowerCase() !== 'effects') {
                const up = path.dirname(base);
                if (up === base) throw Error('no effects directory for companion');
                base = up;
            }
        }
        return path.join(base, ...name.split('/')) + '.efkefc';
    }

    function runtimeCandidates() {
        const path = require('path');
        const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
        const appDir = path.dirname(decodeURIComponent(root.location?.pathname || ''));
        return [
            path.join(appDir, 'runtime'),
            path.join(appDir, '..', 'runtime'),
            path.join(cwd, 'runtime'),
            path.join(cwd, '..', 'runtime'),
            path.join(cwd, 'package.nw', 'runtime')
        ].map(dir => path.join(dir, RUNTIME_FILE));
    }

    // The runtime file defines the game's adapter as well; the editor keeps
    // only the renderer, so no game hook can find an overlay here.
    function keepRendererOnly(hadOverlay) {
        if (!hadOverlay) delete root.ReactorHdrOverlay;
    }

    /** Whether ReactorHdrRenderer is loaded. Desktop loads it now; the web host starts a fetch and answers later. */
    function loadRuntime() {
        if (root.ReactorHdrRenderer) return true;
        if (runtimeState === false || runtimeState === 'loading') return false;
        const hadOverlay = 'ReactorHdrOverlay' in root;
        const host = root.RPGReactorWebHost;
        try {
            if (host?.mode === 'web') {
                if (!host.projectRoot || typeof host.assetUrl !== 'function') return false;
                runtimeState = 'loading';
                const script = document.createElement('script');
                script.src = host.assetUrl(`${String(host.projectRoot).replace(/\/+$/, '')}/js/${RUNTIME_FILE}`);
                script.onload = () => { keepRendererOnly(hadOverlay); runtimeState = !!root.ReactorHdrRenderer; };
                script.onerror = () => { script.remove(); runtimeState = false; };
                document.head.appendChild(script);
                return false;
            }
            const fs = require('fs');
            const full = runtimeCandidates().find(file => fs.existsSync(file));
            if (full) {
                const script = document.createElement('script');
                script.text = fs.readFileSync(full, 'utf8') + `\n//# sourceURL=file://${full.replace(/\\/g, '/')}`;
                document.head.appendChild(script);
                keepRendererOnly(hadOverlay);
            }
        } catch (error) {
            console.warn('[HDR preview] runtime not loaded:', error);
        }
        runtimeState = !!root.ReactorHdrRenderer;
        return runtimeState;
    }

    function rendererFor(gl) {
        if (!gl || !loadRuntime()) return null;
        let renderer = renderers.get(gl);
        if (!renderer) {
            renderer = root.ReactorHdrRenderer.create(gl);
            renderers.set(gl, renderer);
            const canvas = gl.canvas;
            if (canvas && canvas.addEventListener) {
                canvas.addEventListener('webglcontextlost', () => renderer.lost());
                canvas.addEventListener('webglcontextrestored', () => renderer.restored());
            }
        }
        return renderer;
    }

    /**
     * How a preview plays this effect file on this context:
     *   { mode: 'plain' }                        an ordinary effect
     *   { mode: 'hdr', sidecar, renderer }       drawn through the HDR renderer
     *   { mode: 'twin', twin, reason }           its graded twin, and why
     * Throws, with `rrHdrRefused`, where the game would not play it.
     * `sceneOwned`: the 3D scene draws it, which no HDR path covers, in the game either.
     * `off`: the viewer has switched HDR off, to see the twin the game falls back to.
     */
    function choose(gl, effectPath, width, height, options = {}) {
        const twin = RR_resolveHdrPreviewTwin(effectPath);
        if (!twin) return { mode: 'plain' };
        const fallback = reason => {
            console.info(`[HDR preview] ${twin.twinName} stands in for ${effectPath}: ${reason}`);
            return { mode: 'twin', twin, reason };
        };
        if (options.sceneOwned) return fallback('drawn by the 3D scene');
        if (options.off) return fallback('HDR is switched off in this preview');
        const renderer = rendererFor(gl);
        if (!renderer) return fallback(runtimeState === 'loading' ? 'the HDR renderer is still loading' : 'the HDR renderer is not available');
        if (!renderer.ensure(Math.max(1, width | 0), Math.max(1, height | 0))) return fallback('this WebGL context has no float render targets');
        try {
            renderer.gradeProgram(twin.sidecar.grade, twin.sidecar.gradeB);
        } catch (error) {
            return fallback('its grade does not compile: ' + (error && error.message));
        }
        if (twin.sidecar.companion) {
            const fs = require('fs');
            const file = companionPath(effectPath, twin.sidecar.companion);
            if (!fs.existsSync(file) || fs.existsSync(file.replace(/\.efkefc$/i, '.hdr.json'))) return fallback('companion missing or has HDR metadata');
        }
        return { mode: 'hdr', sidecar: twin.sidecar, renderer, context: null };
    }

    /**
     * RR_loadEffekseerEffectFromFile, for a preview that can draw HDR. The
     * effect it returns carries `rrHdr` (the choice) when it is to be drawn
     * through `draw`, or `rrHdrTwin` (with `reason`) when its twin plays.
     * `view` is the light buffer's { width, height }.
     */
    function load(context, gl, effectPath, scale, onLoad, onError, view, options = {}) {
        const fs = require('fs');
        // On the web host the folder, sidecar included, is readable only after
        // the loader's warm-up: let the loader raise its retryable miss first.
        if (typeof fs.preloadForSync === 'function') {
            try { fs.readFileSync(effectPath); } catch (error) {
                return RR_loadEffekseerEffectFromFile(context, effectPath, scale, onLoad, onError);
            }
        }
        const choice = choose(gl, effectPath, view.width, view.height, options);
        if (choice.mode === 'hdr') {
            if (!choice.sidecar.companion) {
                const effect = RR_loadEffekseerEffectFromFile(context, effectPath, scale, onLoad, onError, effectPath);
                if (effect) effect.rrHdr = choice;
                return effect;
            }
            pairContext(context);
            choice.context = context;
            let current, primary, companion, finished = false, failed = false;
            const complete = () => queueMicrotask(() => {
                if (!finished && current?.isLoaded && (failed || companion?.isLoaded)) { finished = true; clearTimeout(timeout); onLoad?.(); }
            });
            let timeout;
            const fallback = () => queueMicrotask(() => {
                if (failed || finished) return;
                failed = true;
                clearTimeout(timeout);
                const ownsCompanion = !!primary?.rrHdr?.companionEffect;
                if (primary) context.releaseEffect(primary);
                if (companion && !ownsCompanion) context.releaseEffect(companion);
                const twin = RR_resolveHdrPreviewTwin(effectPath);
                current = RR_loadEffekseerEffectFromFile(context, twin.twinPath, scale, complete, onError, effectPath);
                if (current) current.rrHdrTwin = Object.assign({}, twin, { reason: 'companion failed to load' });
                complete();
            });
            choice.cancelLoad = () => { clearTimeout(timeout); if (!failed) finished = true; };
            timeout = setTimeout(fallback, 15000);
            companion = RR_loadEffekseerEffectFromFile(context, companionPath(effectPath, choice.sidecar.companion), scale, complete, fallback, effectPath);
            primary = RR_loadEffekseerEffectFromFile(context, effectPath, scale, complete, onError, effectPath);
            if (!failed) { current = primary; choice.companionEffect = companion; if (current) current.rrHdr = choice; }
            complete();
            return new Proxy({}, { get(_target, key) {
                if (key === 'isLoaded') return !!current?.isLoaded && (failed || !!companion?.isLoaded);
                const value = current?.[key];
                return typeof value === 'function' ? value.bind(current) : value;
            } });
        }
        if (choice.mode === 'twin') {
            const effect = RR_loadEffekseerEffectFromFile(context, choice.twin.twinPath, scale, onLoad, onError, effectPath);
            if (effect) effect.rrHdrTwin = Object.assign({}, choice.twin, { reason: choice.reason });
            return effect;
        }
        return RR_loadEffekseerEffectFromFile(context, effectPath, scale, onLoad, onError);
    }

    /** The game's screen size from System, 0 where the project names none. */
    function screen() {
        const advanced = root.reactor?.databaseManager?.data?.system?.advanced || {};
        const size = value => (Number(value) > 0 ? Number(value) : 0);
        return { width: size(advanced.screenWidth), height: size(advanced.screenHeight) };
    }

    /**
     * The game screen's width in a preview's pixels, for `view.bloomWidth`:
     * the game's bloom radii are fractions of its screen's width, so a
     * preview drawing the screen at another size scales them with it.
     * `pixelsPerGamePixel`; by default a preview drawn with
     * ReactorBattleData.effekseerProjection, whose `height` stands for the
     * screen's. Undefined when the project names no screen size.
     */
    function bloomWidth(height, pixelsPerGamePixel) {
        const game = screen();
        if (!game.width || !game.height) return undefined;
        return game.width * (pixelsPerGamePixel > 0 ? pixelsPerGamePixel : height / game.height);
    }

    /**
     * Draw one frame of an HDR effect. `drawEffect` draws its handle into the
     * light buffer (which `draw` binds and clears); the buffer is then bloomed,
     * graded and screened over what the canvas already holds.
     * `view`: { width, height } of the light buffer; `out` { x, y, w, h }, the
     * composite's viewport when it is not the buffer's own (a cropped view);
     * `premultiplied` for a premultiplied canvas with nothing behind it in GL;
     * `bloomWidth` (see bloomWidth), the buffer's width when absent. The
     * sidecar's bloom threshold (or prefilter) acts on the game's setup pixels, which the
     * same width converts into the preview's. `frame`, the effect's own frame
     * (updates since its play times its speed), picks the bloom intensity
     * and the second grade's weight when the sidecar keys them (bloom.intensityKeys, gradeKeys); frame 0 when absent.
     * False when this context can no longer render HDR; nothing was drawn.
     */
    function draw(gl, choice, view, drawEffect) {
        const renderer = choice && choice.renderer;
        if (!renderer || gl.isContextLost() || !renderer.ensure(Math.max(1, view.width | 0), Math.max(1, view.height | 0))) return false;
        const sidecar = choice.sidecar;
        const game = screen();
        try {
            const state = choice.context && contexts.get(choice.context);
            if (state && choice.companionEffect) {
                state.pass = 'companion';
                try { drawEffect(); } finally { state.pass = 'light'; }
            }
            renderer.begin();
            if (state && choice.companionEffect && sidecar.companionOccludes !== false) {
                state.pass = 'companion';
                try { gl.colorMask(false, false, false, false); gl.depthMask(true); drawEffect(); }
                finally { gl.colorMask(true, true, true, true); state.pass = 'light'; }
            }
            drawEffect();
            renderer.post({
                bloom: root.ReactorHdrRenderer.bloomIntensity ? root.ReactorHdrRenderer.bloomIntensity(sidecar.bloom, view.frame)
                    : sidecar.bloom.intensity,
                gradeMix: root.ReactorHdrRenderer.gradeMix ? root.ReactorHdrRenderer.gradeMix(sidecar, view.frame) : 0,
                bloomScale: sidecar.bloom.radiusScale,
                alphaFromColor: !!view.premultiplied,
                bloomWidth: view.bloomWidth,
                threshold: sidecar.bloom.threshold,
                prefilter: sidecar.bloom.prefilter,
                pixelScale: view.bloomWidth > 0 && game.width ? view.bloomWidth / game.width : undefined
            }, sidecar, view.out);
            return true;
        } catch (error) {
            console.warn('[HDR preview] pass failed:', error);
            renderer.fail();
            return false;
        } finally {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
    }

    /** Free this context's HDR targets and programs (a preview closing, or its context going away). */
    function release(gl) {
        const renderer = gl && renderers.get(gl);
        if (!renderer) return;
        if (!gl.isContextLost()) renderer.dispose();
        renderers.delete(gl);
    }

    root.RRHdrPreview = { load, choose, draw, release, loadRuntime, screen, bloomWidth };
})(typeof window !== 'undefined' ? window : globalThis);
