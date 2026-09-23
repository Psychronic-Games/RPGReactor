/**
 * AnimationPreviewLayer - a database animation drawn over another view.
 *
 * Two transparent canvases stacked on a positioned container: a 2D one for
 * MV sprite-sheet animations and a WebGL one for Effekseer. Either plays
 * centred on the canvas, and the whole thing is moved with `moveTo` so the
 * animation sits wherever the caller projects it — the anchor of a model
 * effect in the 3D database editor. Playback logic follows the animation
 * picker's preview (15 fps MV cadence, 60 Hz Effekseer ticks).
 */
(function(root) {
    'use strict';

    const SIZE = 384;
    const MAX_SIZE = 1024;
    /*
     * An animation is authored on a screen: the picker's canvas is that
     * whole screen, 26 Effekseer units tall, and an MV cell pixel is a
     * screen pixel. On a model the frame is relative to the model instead:
     * at scale 1 the screen is as tall as the model's longest side
     * (`setSpan`), so 100% reads as "model-sized" and 50% as half of it.
     * The overlay's canvas spans eight tiles.
     */
    const PICKER_UNITS_PER_HEIGHT = 26;
    const DEFAULT_SCREEN_HEIGHT = 624;
    const OVERLAY_TILES = 8;

    function projectScreenHeight() {
        const system = root.reactor && root.reactor.databaseManager && root.reactor.databaseManager.data
            ? root.reactor.databaseManager.data.system : null;
        const height = system && system.advanced ? Number(system.advanced.screenHeight) : 0;
        return height > 0 ? height : DEFAULT_SCREEN_HEIGHT;
    }

    class AnimationPreviewLayer {
        constructor(container) {
            this.container = container;
            this.wrap = document.createElement('div');
            this.wrap.className = 'rr-anim-preview-layer';
            this.wrap.style.cssText = 'position:absolute;left:0;top:0;width:256px;height:256px;pointer-events:none;'
                + 'transform:translate(-50%,-50%);display:none;z-index:4;';
            this.mvCanvas = document.createElement('canvas');
            this.mvCanvas.width = SIZE;
            this.mvCanvas.height = SIZE;
            this.mvCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;';
            // An MV cell's blend mode is applied against the scene, as the
            // game applies it: an additive cell baked into this transparent
            // overlay would leave its sheet's black as opaque black. Each
            // non-normal mode gets its own canvas, made on first use, that the
            // browser composites onto the view with the matching mix-blend-mode.
            this.mvBlendCanvases = new Map();
            this.fxCanvas = document.createElement('canvas');
            this.fxCanvas.width = SIZE;
            this.fxCanvas.height = SIZE;
            this.fxCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;';
            this.wrap.appendChild(this.mvCanvas);
            this.wrap.appendChild(this.fxCanvas);
            container.appendChild(this.wrap);
            this.generation = 0;
            this.active = false;
            this.fx = { gl: null, ctx: null, ready: false, handle: null, raf: null, effects: new Map(), waiters: new Map() };
            this.mv = { raf: null };
            this.onFinished = null;
            this.transform = { rotate: [0, 0, 0], scale: [1, 1, 1] };
            this.screenHeight = projectScreenHeight();
            this.span = 1;
            // The canvases' native size: SIZE at rest, grown with the
            // overlay (see moveTo) so a big effect is not a stretched thumbnail.
            this.size = SIZE;
        }

        /** The game's screen height: what an MV cell pixel is a fraction of. */
        setScreenHeight(height) {
            this.screenHeight = Number(height) > 0 ? Number(height) : DEFAULT_SCREEN_HEIGHT;
        }

        /** The model's longest side in tiles: the height of the frame at scale 1. */
        setSpan(tiles) {
            this.span = Number(tiles) > 0 ? Number(tiles) : 1;
        }

        /**
         * World mode: draw the effect from a real camera instead of the
         * picker's fixed frame. `world` carries the camera's projection and
         * view matrices (column-major, 16 numbers each) and the handle's
         * final position, scale and rotation (radians); the caller shows the
         * canvas inside its scene (a depth quad) rather than this overlay,
         * which stays hidden. `null` returns to the overlay.
         */
        setWorld(world) {
            this.world = world || null;
            if (this.world) {
                this.wrap.style.display = 'none';
                // `rect` ({ x, y, w, h, scale }, GL origin, drawing-buffer
                // pixels of a `viewWidth` x `viewHeight` view): the canvas
                // holds just that box of the view, drawn 1:1 (or at `scale`
                // of it), so the effect is as sharp as the view it sits in.
                // Without one the canvas is a 512 square of the whole view.
                const rect = this.world.rect;
                const width = rect ? Math.max(1, Math.round(rect.w * (rect.scale || 1))) : 512;
                const height = rect ? Math.max(1, Math.round(rect.h * (rect.scale || 1))) : 512;
                if (!this.fx.gpu && (this.fxCanvas.width !== width || this.fxCanvas.height !== height)) {
                    this.fxCanvas.width = width;
                    this.fxCanvas.height = height;
                }
                if (this.fx.handle && this.fx.handle.exists && this._applyHandleTransform) this._applyHandleTransform();
            } else if (this.active) {
                this.wrap.style.display = 'block';
            }
        }

        /** Draw the playing Effekseer frame into the canvas now, on top of the loop's own draws. */
        drawNow() {
            return this._drawFrame ? this._drawFrame() : false;
        }

        /** Draw after the owning view has supplied this frame's camera and anchor. */
        drawGpuQuad(quad) {
            if (!this.active || !this.fx.gpu || !this.world) return false;
            const drawn = this.drawNow();
            if (this._gpuColourTarget) Reactor3D.GpuEffects.bindQuad(quad, this._gpuColourTarget);
            return drawn;
        }

        /** Turn (degrees, x/y/z) and scale the playing animation on top of its record's own. */
        setTransform(transform) {
            const rotate = Array.isArray(transform && transform.rotate) ? transform.rotate : [0, 0, 0];
            const scale = transform && transform.scale;
            const axes = Array.isArray(scale)
                ? [0, 1, 2].map(i => Number(scale[i]) > 0 ? Number(scale[i]) : 1)
                : [1, 1, 1].map(() => (Number(scale) > 0 ? Number(scale) : 1));
            this.transform = {
                rotate: [0, 1, 2].map(i => Number(rotate[i]) || 0),
                scale: axes
            };
            if (this.fx.handle && this.fx.handle.exists && this._applyHandleTransform) this._applyHandleTransform();
        }

        /** Put the layer's centre at a point in the container, `pixels` tall. */
        moveTo(x, y, pixels) {
            const size = Math.max(64, Math.min(8192, Number(pixels) || 256));
            this.wrap.style.left = `${x}px`;
            this.wrap.style.top = `${y}px`;
            this.wrap.style.width = `${size}px`;
            this.wrap.style.height = `${size}px`;
            // Drawn at the size it shows, in steps so a zoom does not
            // reallocate every frame, and no larger than a texture a weak
            // GPU is happy with.
            const native = Math.max(SIZE, Math.min(MAX_SIZE, Math.ceil(size / 128) * 128));
            if (native !== this.size) {
                this.size = native;
                this.mvCanvas.width = this.mvCanvas.height = native;
                for (const canvas of this.mvBlendCanvases?.values() || []) canvas.width = canvas.height = native;
                this.fxCanvas.width = this.fxCanvas.height = native;
            }
        }

        /** Play a database animation record from `projectRoot`, looping when asked. */
        play(animation, projectRoot, options = {}) {
            this.stop();
            if (!animation) return false;
            this.active = true;
            this.loop = !!options.loop;
            this.onSound = options.onSound;this.paused=false;this.mv.ready=false;
            if (animation !== this._lastPlayed) { this.visibleFrames = null; this._litPlays = 0; }
            this._lastPlayed = animation;
            if (options.transform) this.setTransform(options.transform);
            this.wrap.style.display = this.world ? 'none' : 'block';
            const generation = ++this.generation;
            if (animation.effectName) return this._startEffekseer(animation, projectRoot, generation);
            if (Array.isArray(animation.frames) && animation.frames.length) return this._startSprite(animation, projectRoot, generation);
            this.stop();
            return false;
        }

        /** The canvas an MV cell of `blendMode` draws into, created on first use. */
        _mvCanvasFor(blendMode) {
            if (!blendMode || !AnimationPreviewLayer.MV_BLEND_CSS[blendMode]) return this.mvCanvas;
            let canvas = this.mvBlendCanvases.get(blendMode);
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width = canvas.height = this.size || SIZE;
                canvas.style.cssText = this.mvCanvas.style.cssText + `mix-blend-mode:${AnimationPreviewLayer.MV_BLEND_CSS[blendMode]};`;
                canvas.style.display = this.mvCanvas.style.display;
                this.wrap.insertBefore(canvas, this.fxCanvas);
                this.mvBlendCanvases.set(blendMode, canvas);
            }
            return canvas;
        }

        stop() {
            this.generation++;
            this.active = false;
            if (this.mv.raf) { cancelAnimationFrame(this.mv.raf); this.mv.raf = null; }
            if (this.fx.raf) { cancelAnimationFrame(this.fx.raf); this.fx.raf = null; }
            if (this.fx.handle) { try { this.fx.ctx?._makeContextCurrent?.(); this.fx.handle.stop(); } catch (_) {} this.fx.handle = null; }
            if (this._gpuEffectTarget) { this._gpuEffectTarget.dispose(); this._gpuEffectTarget = null; }
            if (this._gpuColourTarget) { this._gpuColourTarget.dispose(); this._gpuColourTarget = null; }
            if (this.fx.gl && !this.fx.gpu) {
                this.fx.gl.clearColor(0, 0, 0, 0);
                this.fx.gl.clear(this.fx.gl.COLOR_BUFFER_BIT | this.fx.gl.DEPTH_BUFFER_BIT);
            }
            const ctx = this.mvCanvas.getContext('2d');
            ctx.clearRect(0, 0, this.size, this.size);
            this.mvCanvas.style.display = 'none';
            for (const canvas of this.mvBlendCanvases?.values() || []) { canvas.getContext('2d').clearRect(0, 0, this.size, this.size); canvas.style.display = 'none'; }
            this.fxCanvas.style.display = 'none';
            this.wrap.style.display = 'none';
        }

        dispose() {
            this.stop();
            this._drawFrame = null;
            if (this.fx.gpu) Reactor3D.GpuEffects.release(this.fx.gpu);
            else if (this.fx.ctx && typeof effekseer !== 'undefined') {
                try { this.fx.ctx._makeContextCurrent?.(); effekseer.releaseContext(this.fx.ctx); } catch (_) {}
            }
            // Hand the WebGL context back now. A browser keeps a canvas's
            // context until the canvas is collected, and counts it against
            // its small budget (16 in Chromium) meanwhile: a map whose props
            // are edited live rebuilds their effect layers on every change,
            // and sixteen edits evicted the oldest live contexts, the map
            // view's among them ("Too many active WebGL contexts").
            if (this.fx.legacyGl || (!this.fx.gpu && this.fx.gl)) {
                try { (this.fx.legacyGl || this.fx.gl).getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
            }
            this.fx = { gl: null, ctx: null, ready: false, handle: null, raf: null, effects: new Map(), waiters: new Map() };
            this.wrap.parentNode?.removeChild(this.wrap);
        }

        _finish(generation) {
            if (generation !== this.generation) return;
            if (typeof this.onFinished === 'function') this.onFinished();
            if (!this.loop) this.stop();
        }

        // --- MV sprite sheets ---

        _startSprite(animation, projectRoot, generation) {
            this.mvCanvas.style.display = 'block';
            for (const canvas of this.mvBlendCanvases.values()) canvas.style.display = 'block';
            const sheets = { 1: null, 2: null };
            const path = require('path');
            const load = (name, slot) => new Promise(resolve => {
                if (!name || typeof RRAssetFiles === 'undefined') return resolve();
                const img = new Image();
                img.onload = () => { sheets[slot] = img; resolve(); };
                img.onerror = () => resolve();
                img.src = RRAssetFiles.imageUrlFor(path.join(projectRoot, 'img', 'animations'), name);
            });
            const draw = frameIndex => {
                const size = this.size;
                this.mvCanvas.getContext('2d').clearRect(0, 0, size, size);
                for (const canvas of this.mvBlendCanvases.values()) canvas.getContext('2d').clearRect(0, 0, size, size);
                const frame = animation.frames[frameIndex % animation.frames.length];
                if (!frame) return;
                // Cells are drawn at their own pixel size, as the game does.
                const cellSize = 192, cols = 5, view = 1;
                for (const cell of frame) {
                    const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;
                    const sheet = pattern < 100 ? sheets[1] : sheets[2];
                    if (!sheet) continue;
                    const cellPattern = pattern % 100;
                    const ctx = this._mvCanvasFor(blendMode).getContext('2d');
                    ctx.save();
                    const extra = this.transform;
                    ctx.translate(size / 2, size / 2);
                    // A cell pixel is a screen pixel, and the screen is the
                    // model's span tall, over a canvas eight tiles wide.
                    const cellScale = (size / OVERLAY_TILES) * (this.span / this.screenHeight);
                    ctx.scale(cellScale, cellScale);
                    ctx.rotate((extra.rotate[2] * Math.PI) / 180);
                    ctx.scale(extra.scale[0], extra.scale[1]);
                    ctx.translate(x * view, y * view);
                    ctx.rotate((rotation * Math.PI) / 180);
                    ctx.scale((scale / 100) * view, (scale / 100) * view);
                    if (mirror) ctx.scale(-1, 1);
                    ctx.globalAlpha = opacity / 255;
                    // Within its own canvas an additive cell still adds to the cells before it.
                    ctx.globalCompositeOperation = blendMode === 1 ? 'lighter' : 'source-over';
                    const hue = pattern < 100 ? (animation.animation1Hue || 0) : (animation.animation2Hue || 0);
                    ctx.filter = hue ? `hue-rotate(${hue}deg)` : 'none';
                    ctx.drawImage(sheet, (cellPattern % cols) * cellSize, Math.floor(cellPattern / cols) * cellSize,
                        cellSize, cellSize, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
                    ctx.filter = 'none';
                    ctx.restore();
                }
            };
            Promise.all([load(animation.animation1Name, 1), load(animation.animation2Name, 2)]).then(() => {
                if (generation !== this.generation) return;
                const STEP = 1000 / 15;
                let last = performance.now(), acc = 0, frame = 0;
                this.mv.ready=true;
                const sounds=(from,to)=>{for(const timing of animation.timings||[])if(timing.frame>=from&&timing.frame<=to&&timing.se?.name)this.onSound?.(timing.se);};
                const loop = () => {
                    if (generation !== this.generation) return;
                    try { step(); } catch (error) { console.warn('Animation preview:', error); this._finish(generation); }
                };
                const step = () => {
                    const now = performance.now();
                    if(!this.paused)acc += (now - last)*(this.speed??1);
                    last = now;
                    if (acc >= STEP) {
                        const steps = Math.floor(acc / STEP);
                        acc -= steps * STEP;
                        const previous=frame;frame += steps;
                        sounds(previous+1,Math.min(frame,animation.frames.length-1));
                        if (frame >= animation.frames.length) {
                            if (!this.loop) { this._finish(generation); return; }
                            frame %= animation.frames.length;
                        }
                        draw(frame);
                    }
                    this.mv.raf = requestAnimationFrame(loop);
                };
                try { draw(0); sounds(0, 0); } catch (error) { console.warn('Animation preview:', error); this._finish(generation); return; }
                this.mv.raf = requestAnimationFrame(loop);
            });
            return true;
        }

        // --- Effekseer ---

        _ensureEffekseer() {
            const fx = this.fx;
            const renderer = this.world?.renderer;
            if (fx.ready && (fx.gpu ? fx.gpu.renderer === renderer : !renderer)) return true;
            if (fx.ready && fx.gpu) {
                Reactor3D.GpuEffects.release(fx.gpu); fx.effects.clear(); fx.waiters.clear();
                this.fx = { gl: null, ctx: null, ready: false, handle: null, raf: null, effects: new Map(), waiters: new Map() };
                return this._ensureEffekseer();
            }
            if (fx.ready) return true;
            if (typeof effekseer === 'undefined' || typeof RR_loadEffekseerEffectFromFile === 'undefined') return false;
            fx.gl = this.fxCanvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
            if (!fx.gl) return false;
            if (renderer && typeof Reactor3D !== 'undefined' && Reactor3D.GpuEffects) {
                fx.legacyGl = fx.gl;
                fx.gpu = Reactor3D.GpuEffects.create(renderer, fx.gl.getParameter(fx.gl.SAMPLES));
            }
            if (fx.gpu) { fx.gl = fx.gpu.gl; fx.ctx = fx.gpu.context; }
            else {
                fx.ctx = effekseer.createContext();
                if (!fx.ctx) return false;
                fx.ctx.init(fx.gl);
            }
            // This context is Effekseer's alone: restore state once, and
            // again only after a focus/visibility change (see the guard).
            if (fx.gpu) { /* The shared pass explicitly hands state back to Three. */ }
            else if (typeof RREffekseerStateGuard !== 'undefined') RREffekseerStateGuard.attach(fx.ctx, this.fxCanvas);
            else fx.ctx.setRestorationOfStatesFlag(true);
            fx.ready = true;
            return true;
        }

        _startEffekseer(animation, projectRoot, generation) {
            if (!this._ensureEffekseer()) return false;
            const fx = this.fx;
            this.fxCanvas.style.display = 'block';
            const begin = effect => {
                if (generation !== this.generation) return;
                let alive = 0, dead = 0;
                this._applyHandleTransform = () => {
                    if (!fx.handle) return;
                    const world = this.world;
                    if (world) {
                        fx.handle.setLocation(world.position[0], world.position[1], world.position[2]);
                        fx.handle.setRotation(world.rotation[0], world.rotation[1], world.rotation[2]);
                        fx.handle.setScale(world.scale[0], world.scale[1], world.scale[2]);
                        fx.handle.setSpeed((animation.speed || 100) / 100);
                        return;
                    }
                    const extra = this.transform;
                    const base = (animation.scale || 100) / 100;
                    const rot = animation.rotation || { x: 0, y: 0, z: 0 };
                    fx.handle.setLocation((animation.offsetX || 0) * 0.1, (animation.offsetY || 0) * 0.1, 0);
                    fx.handle.setRotation((rot.x + extra.rotate[0]) * Math.PI / 180, (rot.y + extra.rotate[1]) * Math.PI / 180, (rot.z + extra.rotate[2]) * Math.PI / 180);
                    fx.handle.setScale(base * extra.scale[0], base * extra.scale[1], base * extra.scale[2]);
                    fx.handle.setSpeed((animation.speed || 100) / 100);
                };
                // Frames since the play began, and the last one anything
                // was lit: a loop starts over there, not when the last
                // invisible particle dies, so there is no dark gap.
                let ticks = 0, lastLit = 0;
                const start = () => {
                    fx.ctx._makeContextCurrent?.();
                    this._plays = (this._plays || 0) + 1;
                    if (lastLit > 0) { this.visibleFrames = Math.max(this.visibleFrames || 0, lastLit); this._litPlays = (this._litPlays || 0) + 1; }
                    fx.handle = fx.ctx.play(effect);
                    alive = 0; dead = 0; ticks = 0; lastLit = 0;
                    this._applyHandleTransform();
                };
                // Whether anything is lit. Read at 96x96 with a low bar: a
                // 32x32 look averaged a 1024-pixel canvas 32 pixels to a
                // cell, and a beam a few pixels wide averaged to nothing -
                // so the last lit frame was never found, and every loop
                // waited out the effect's invisible tail plus a grace
                // period, which read as a pause of seconds between plays.
                const LIT = 96;
                const lit = () => {
                    const mini = this._litMini || (this._litMini = document.createElement('canvas'));
                    if (mini.width !== LIT) { mini.width = LIT; mini.height = LIT; }
                    const ctx = mini.getContext('2d', { willReadFrequently: true });
                    ctx.clearRect(0, 0, LIT, LIT);
                    ctx.drawImage(this.fxCanvas, 0, 0, this.fxCanvas.width, this.fxCanvas.height, 0, 0, LIT, LIT);
                    let data;
                    try { data = ctx.getImageData(0, 0, LIT, LIT).data; } catch (e) { return false; }
                    for (let i = 3; i < data.length; i += 4) if (data[i] >= 2) return true;
                    return false;
                };
                start();
                let last = Date.now(), acc = 0;
                const step = 1000 / 60;
                /** Draw the current frame into the canvas (also `drawNow`, for a caller that wants one on demand). */
                // Effekseer keeps one "current" WebGL context for the whole
                // runtime and switches it in draw() and loadEffect() only -
                // not in update(), beginDraw() or drawHandle(). With more
                // than one layer alive (the map view's placed effects, the
                // database preview) the newest context stays current and
                // every other layer's native renderer draws into it, which
                // the browser refuses object by object ("does not belong to
                // this context") and nothing appears. Switch before every
                // call that touches GL.
                const current = () => {
                    if (fx.ctx && typeof fx.ctx._makeContextCurrent === 'function') fx.ctx._makeContextCurrent();
                };
                this._drawFrame = () => {
                    if (generation !== this.generation || !fx.ctx) return false;
                    current();
                    if (fx.gpu && this.world) {
                        const world = this.world, rect = world.rect, s = rect?.scale || 1;
                        const width = rect ? Math.max(1, Math.round(rect.w * s)) : 512;
                        const height = rect ? Math.max(1, Math.round(rect.h * s)) : 512;
                        this._applyHandleTransform();
                        const target = Reactor3D.GpuEffects.draw(fx.gpu, this, width, height,
                            { x: rect ? -Math.round(rect.x*s) : 0, y: rect ? -Math.round(rect.y*s) : 0,
                              width: rect ? Math.round(world.viewWidth*s) : width, height: rect ? Math.round(world.viewHeight*s) : height },
                            world.projection, world.view, fx.handle, true);
                        const drawn = !!target && !!fx.handle?.exists;
                        if (drawn && !this._gpuLitPending && (this._litPlays || 0) < 2 && (ticks === 3 || ticks % 10 === 0)) {
                            const frame = ticks, play = this._plays;
                            this._gpuLitPending = true;
                            const queued = Reactor3D.GpuEffects.read(fx.gpu, target, (pixels, w, h) => {
                                this._gpuLitPending = false;
                                if (!pixels || generation !== this.generation || play !== this._plays) return;
                                const data = Reactor3D.GpuEffects.downsample(pixels, w, h, LIT, LIT);
                                for (let i=3;i<data.length;i+=4) if (data[i]>=2) { lastLit=frame; break; }
                            });
                            if (!queued) this._gpuLitPending = false;
                        }
                        return drawn;
                    }
                    const gl = fx.gl;
                    const rect = this.world && this.world.rect;
                    if (rect) {
                        // The full view's viewport, shifted so the canvas's
                        // pixels are the box's: WebGL clips the rest.
                        const s = rect.scale || 1;
                        gl.viewport(-Math.round(rect.x * s), -Math.round(rect.y * s),
                            Math.round(this.world.viewWidth * s), Math.round(this.world.viewHeight * s));
                    } else if (this.world) {
                        gl.viewport(0, 0, this.fxCanvas.width, this.fxCanvas.height);
                    } else {
                        gl.viewport(0, 0, this.size, this.size);
                    }
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    if (this.world) {
                        // A real camera: the anchor moves with the model and
                        // the view, so the handle is placed every frame.
                        this._applyHandleTransform();
                        fx.ctx.setProjectionMatrix(this.world.projection);
                        fx.ctx.setCameraMatrix(this.world.view);
                    } else {
                        // 26 units tall = the span: q * size / 26 pixels per unit.
                        const q = this.span / OVERLAY_TILES;
                        fx.ctx.setProjectionMatrix([q, 0, 0, 0, 0, q, 0, 0, 0, 0, 1, -1.2, 0, 0, 0, 1]);
                        fx.ctx.setCameraMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1]);
                    }
                    const drawn = !!(fx.handle && fx.handle.exists);
                    fx.ctx.beginDraw();
                    if (drawn) fx.ctx.drawHandle(fx.handle);
                    fx.ctx.endDraw();
                    if (typeof RREffekseerStateGuard !== 'undefined') RREffekseerStateGuard.settle(fx.ctx);
                    // Where the picture ends is learned from the first two
                    // plays; the readback that finds it stalls the GPU, so
                    // it is not repeated once known.
                    if (drawn && (this._litPlays || 0) < 2 && (ticks === 3 || ticks % 10 === 0) && lit()) lastLit = ticks;
                    return drawn;
                };
                const loop = () => {
                    if (generation !== this.generation) return;
                    const now = Date.now();
                    if(!this.paused)acc += (now - last)*(this.speed??1);
                    last = now;
                    let n = 0;
                    if (acc >= step) current();
                    while (acc >= step && n < 5) {
                        fx.ctx.update();
                        acc -= step;
                        if (fx.handle && fx.handle.exists) alive++;
                        n++;
                        ticks++;
                    }
                    if (acc > step * 5) acc = 0;
                    const drawn = fx.gpu && this.world ? !!fx.handle?.exists : this._drawFrame();
                    if (drawn) {
                        dead = 0;
                        if (this.loop && this.visibleFrames > 0 && ticks >= this.visibleFrames && alive >= 3) start();
                    } else if (++dead >= 3) {
                        // Nothing drawn for a few frames: the handle is
                        // gone, or drew nothing. A loop starts over at once
                        // rather than after a visible gap.
                        if (!this.loop || alive < 3) { this._finish(generation); return; }
                        start();
                    }
                    fx.raf = requestAnimationFrame(loop);
                };
                fx.raf = requestAnimationFrame(loop);
            };
            const cached = fx.effects.get(animation.effectName);
            if (cached) {
                if (cached.isLoaded) begin(cached);
                else fx.waiters.set(animation.effectName, (fx.waiters.get(animation.effectName) || []).concat([begin]));
                return true;
            }
            const path = require('path');
            const effectPath = path.join(projectRoot, 'effects', animation.effectName + '.efkefc');
            const gpuLoad = fx.gpu;
            if (gpuLoad) gpuLoad.loading++;
            try {
                const effect = RR_loadEffekseerEffectFromFile(fx.ctx, effectPath, 1.0, () => {
                    for (const waiter of fx.waiters.get(animation.effectName) || []) waiter(effect);
                    fx.waiters.delete(animation.effectName);
                    if (gpuLoad) Reactor3D.GpuEffects.loaded(gpuLoad);
                }, () => {
                    fx.effects.delete(animation.effectName);
                    fx.waiters.delete(animation.effectName);
                    if (gpuLoad) Reactor3D.GpuEffects.loaded(gpuLoad);
                });
                fx.effects.set(animation.effectName, effect);
                fx.waiters.set(animation.effectName, [begin]);
            } catch (error) {
                if (gpuLoad) Reactor3D.GpuEffects.loaded(gpuLoad);
                if (error && error.rrWebWarming) {
                    // The web host is fetching the effects folder; play this
                    // effect as soon as the warm-up lands instead of logging
                    // a red error for an expected first-visit state.
                    error.rrWarming.then(() => {
                        if (generation === this.generation) {
                            this._startEffekseer(animation, projectRoot, generation);
                        }
                    });
                    return false;
                }
                console.warn('Could not load the effect for a preview:', error);
                return false;
            }
            return true;
        }
    }

    // MV blend modes 1..3 (additive, multiply, screen) as the CSS blend the
    // browser composites the mode's canvas with. Normal (0) draws straight in.
    AnimationPreviewLayer.MV_BLEND_CSS = Object.freeze({ 1: 'plus-lighter', 2: 'multiply', 3: 'screen' });
    AnimationPreviewLayer.projectScreenHeight = projectScreenHeight;
    AnimationPreviewLayer.PICKER_UNITS_PER_HEIGHT = PICKER_UNITS_PER_HEIGHT;
    root.RRAnimationPreviewLayer = AnimationPreviewLayer;
    if (typeof module !== 'undefined' && module.exports) module.exports = AnimationPreviewLayer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
