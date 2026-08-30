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
                this.fxCanvas.width = this.fxCanvas.height = native;
            }
        }

        /** Play a database animation record from `projectRoot`, looping when asked. */
        play(animation, projectRoot, options = {}) {
            this.stop();
            if (!animation) return false;
            this.active = true;
            this.loop = !!options.loop;
            if (options.transform) this.setTransform(options.transform);
            this.wrap.style.display = 'block';
            const generation = ++this.generation;
            if (animation.effectName) return this._startEffekseer(animation, projectRoot, generation);
            if (Array.isArray(animation.frames) && animation.frames.length) return this._startSprite(animation, projectRoot, generation);
            this.stop();
            return false;
        }

        stop() {
            this.generation++;
            this.active = false;
            if (this.mv.raf) { cancelAnimationFrame(this.mv.raf); this.mv.raf = null; }
            if (this.fx.raf) { cancelAnimationFrame(this.fx.raf); this.fx.raf = null; }
            if (this.fx.handle) { try { this.fx.handle.stop(); } catch (_) {} this.fx.handle = null; }
            if (this.fx.gl) {
                this.fx.gl.clearColor(0, 0, 0, 0);
                this.fx.gl.clear(this.fx.gl.COLOR_BUFFER_BIT | this.fx.gl.DEPTH_BUFFER_BIT);
            }
            const ctx = this.mvCanvas.getContext('2d');
            ctx.clearRect(0, 0, this.size, this.size);
            this.mvCanvas.style.display = 'none';
            this.fxCanvas.style.display = 'none';
            this.wrap.style.display = 'none';
        }

        dispose() {
            this.stop();
            if (this.fx.ctx && typeof effekseer !== 'undefined') {
                try { effekseer.releaseContext(this.fx.ctx); } catch (_) {}
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
            const ctx = this.mvCanvas.getContext('2d');
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
                ctx.clearRect(0, 0, size, size);
                const frame = animation.frames[frameIndex % animation.frames.length];
                if (!frame) return;
                // Cells are drawn at their own pixel size, as the game does.
                const cellSize = 192, cols = 5, view = 1;
                for (const cell of frame) {
                    const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;
                    const sheet = pattern < 100 ? sheets[1] : sheets[2];
                    if (!sheet) continue;
                    const cellPattern = pattern % 100;
                    ctx.save();
                    const extra = this.transform;
                    ctx.translate(size / 2, size / 2);
                    // A cell pixel is a screen pixel, and the screen is the
                    // model's span tall, over a canvas eight tiles wide.
                    const cell = (size / OVERLAY_TILES) * (this.span / this.screenHeight);
                    ctx.scale(cell, cell);
                    ctx.rotate((extra.rotate[2] * Math.PI) / 180);
                    ctx.scale(extra.scale[0], extra.scale[1]);
                    ctx.translate(x * view, y * view);
                    ctx.rotate((rotation * Math.PI) / 180);
                    ctx.scale((scale / 100) * view, (scale / 100) * view);
                    if (mirror) ctx.scale(-1, 1);
                    ctx.globalAlpha = opacity / 255;
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
                draw(0);
                const loop = () => {
                    if (generation !== this.generation) return;
                    const now = performance.now();
                    acc += now - last;
                    last = now;
                    if (acc >= STEP) {
                        const steps = Math.floor(acc / STEP);
                        acc -= steps * STEP;
                        frame += steps;
                        if (frame >= animation.frames.length) {
                            if (!this.loop) { this._finish(generation); return; }
                            frame %= animation.frames.length;
                        }
                        draw(frame);
                    }
                    this.mv.raf = requestAnimationFrame(loop);
                };
                this.mv.raf = requestAnimationFrame(loop);
            });
            return true;
        }

        // --- Effekseer ---

        _ensureEffekseer() {
            const fx = this.fx;
            if (fx.ready) return true;
            if (typeof effekseer === 'undefined' || typeof RR_loadEffekseerEffectFromFile === 'undefined') return false;
            fx.gl = this.fxCanvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
            if (!fx.gl) return false;
            fx.ctx = effekseer.createContext();
            if (!fx.ctx) return false;
            fx.ctx.init(fx.gl);
            fx.ctx.setRestorationOfStatesFlag(true);
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
                    const extra = this.transform;
                    const base = (animation.scale || 100) / 100;
                    const rot = animation.rotation || { x: 0, y: 0, z: 0 };
                    fx.handle.setLocation((animation.offsetX || 0) * 0.1, (animation.offsetY || 0) * 0.1, 0);
                    fx.handle.setRotation((rot.x + extra.rotate[0]) * Math.PI / 180, (rot.y + extra.rotate[1]) * Math.PI / 180, (rot.z + extra.rotate[2]) * Math.PI / 180);
                    fx.handle.setScale(base * extra.scale[0], base * extra.scale[1], base * extra.scale[2]);
                    fx.handle.setSpeed((animation.speed || 100) / 100);
                };
                const start = () => {
                    fx.handle = fx.ctx.play(effect);
                    alive = 0; dead = 0;
                    this._applyHandleTransform();
                };
                start();
                let last = Date.now(), acc = 0;
                const step = 1000 / 60;
                const loop = () => {
                    if (generation !== this.generation) return;
                    const now = Date.now();
                    acc += now - last;
                    last = now;
                    let n = 0;
                    while (acc >= step && n < 5) {
                        fx.ctx.update();
                        acc -= step;
                        if (fx.handle && fx.handle.exists) alive++;
                        n++;
                    }
                    if (acc > step * 5) acc = 0;
                    const gl = fx.gl;
                    gl.viewport(0, 0, this.size, this.size);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    // 26 units tall = the span: q * size / 26 pixels per unit.
                    const q = this.span / OVERLAY_TILES;
                    fx.ctx.setProjectionMatrix([q, 0, 0, 0, 0, q, 0, 0, 0, 0, 1, -1.2, 0, 0, 0, 1]);
                    fx.ctx.setCameraMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1]);
                    fx.ctx.beginDraw();
                    if (fx.handle && fx.handle.exists) {
                        fx.ctx.drawHandle(fx.handle);
                    } else if (++dead >= 20) {
                        fx.ctx.endDraw();
                        if (!this.loop || alive < 3) { this._finish(generation); return; }
                        start();
                        fx.raf = requestAnimationFrame(loop);
                        return;
                    }
                    fx.ctx.endDraw();
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
            try {
                const effect = RR_loadEffekseerEffectFromFile(fx.ctx, effectPath, 1.0, () => {
                    for (const waiter of fx.waiters.get(animation.effectName) || []) waiter(effect);
                    fx.waiters.delete(animation.effectName);
                }, () => {
                    fx.effects.delete(animation.effectName);
                    fx.waiters.delete(animation.effectName);
                });
                fx.effects.set(animation.effectName, effect);
                fx.waiters.set(animation.effectName, [begin]);
            } catch (error) {
                console.warn('Could not load the effect for a preview:', error);
                return false;
            }
            return true;
        }
    }

    AnimationPreviewLayer.projectScreenHeight = projectScreenHeight;
    AnimationPreviewLayer.PICKER_UNITS_PER_HEIGHT = PICKER_UNITS_PER_HEIGHT;
    root.RRAnimationPreviewLayer = AnimationPreviewLayer;
    if (typeof module !== 'undefined' && module.exports) module.exports = AnimationPreviewLayer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
