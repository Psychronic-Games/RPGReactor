/**
 * ModelRelease - what the editor's previews give back.
 *
 * A preview holds what it shows and nothing more. A model's template (its
 * geometry and pictures) is kept by a small cache (`TemplateCache`): the
 * newest few stay so stepping back is free, the rest are released, and one
 * in use (`pin`) is never released. Releasing (`releaseTemplate`) frees the
 * graphics card's copies in every renderer that drew it; whatever still shows
 * a copy of the model uploads again on its next draw, so releasing is safe for
 * something still on screen. A renderer made for a moment's work
 * (`IdleRenderer`: a thumbnail) is dropped, with its context, a few seconds
 * after its last use and made again on demand; a page's own renderer is
 * dropped with `dropRenderer` when the page closes.
 */
(function(root) {
    'use strict';

    const live = new Set();
    let released = 0;

    /** Every geometry, material, skeleton and picture a model's template holds, each once. */
    function resourcesOf(template, into = new Set()) {
        if (!template || typeof template.traverse !== 'function') return into;
        template.traverse(node => {
            if (node.geometry) into.add(node.geometry);
            for (const material of [].concat(node.material || [])) {
                if (!material) continue;
                into.add(material);
                for (const key in material) {
                    const value = material[key];
                    if (value && value.isTexture) into.add(value);
                }
            }
            if (node.skeleton) into.add(node.skeleton);
        });
        for (const texture of (template.userData && template.userData.glbTextures) || []) if (texture) into.add(texture);
        return into;
    }

    /**
     * Give back a template's copies on the graphics card. `keep` is what other
     * templates that stay also hold (a picture two models share): left alone.
     */
    function releaseTemplate(template, keep = null) {
        if (!template) return 0;
        const R = root.Reactor3D;
        let count = 0;
        for (const item of resourcesOf(template)) {
            if (keep && keep.has(item)) continue;
            if (item.isTexture && R && R.ShaderWarmup && typeof R.ShaderWarmup.forget === 'function') {
                try { R.ShaderWarmup.forget(item); } catch (error) { /* never queued */ }
            }
            try { if (typeof item.dispose === 'function') { item.dispose(); count++; } } catch (error) { /* its renderer is gone */ }
        }
        // Distance levels built for a geometry go with it: the runtime listens for its dispose.
        released++;
        return count;
    }

    /** A renderer the editor made: counted while it lives. */
    function track(renderer, name = '') {
        if (renderer) { renderer.__rrName = name; live.add(renderer); }
        return renderer;
    }

    /** A renderer disposed by its owner (one on a shared context): no longer counted. */
    function untrack(renderer) { live.delete(renderer); }

    /** Dispose a renderer and give its WebGL context back to the browser. */
    function dropRenderer(renderer) {
        if (!renderer) return;
        live.delete(renderer);
        try { renderer.dispose(); } catch (error) { /* already gone */ }
        try {
            if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
            else {
                const gl = renderer.getContext && renderer.getContext();
                const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
                if (lose) lose.loseContext();
            }
        } catch (error) { /* the context was lost before */ }
        // The canvas is the context's last holder.
        try { const canvas = renderer.domElement; if (canvas && !canvas.isConnected) { canvas.width = 1; canvas.height = 1; } } catch (error) { /* detached */ }
    }

    /**
     * Templates by key, newest last. At most `max` unpinned ones stay; the
     * oldest beyond that are released. `sharedWith` names other holders of
     * templates (another cache) whose resources must not be released.
     */
    class TemplateCache {
        constructor(options = {}) {
            this.max = Number.isFinite(options.max) ? Math.max(0, options.max) : 2;
            this.onRelease = options.onRelease || null;
            this.entries = new Map();
            this.pins = new Map();
        }
        get size() { return this.entries.size; }
        has(key) { return this.entries.has(key); }
        keys() { return Array.from(this.entries.keys()); }
        /** The template, made the newest. */
        get(key) {
            if (!this.entries.has(key)) return undefined;
            const value = this.entries.get(key);
            this.entries.delete(key);
            this.entries.set(key, value);
            return value;
        }
        peek(key) { return this.entries.get(key); }
        set(key, template) {
            const old = this.entries.get(key);
            this.entries.delete(key);
            this.entries.set(key, template);
            if (old && old !== template) this._release(key, old);
            this.trim();
            return template;
        }
        /** In use: never released until every pin is taken off. */
        pin(key) { this.pins.set(key, (this.pins.get(key) || 0) + 1); }
        unpin(key) {
            const count = (this.pins.get(key) || 0) - 1;
            if (count > 0) this.pins.set(key, count); else this.pins.delete(key);
            this.trim();
        }
        pinned(key) { return this.pins.has(key); }
        /** Release the oldest unpinned templates beyond `max`. */
        trim() {
            let loose = 0;
            for (const key of this.entries.keys()) if (!this.pins.has(key)) loose++;
            if (loose <= this.max) return 0;
            let gone = 0;
            for (const key of Array.from(this.entries.keys())) {
                if (loose <= this.max) break;
                if (this.pins.has(key)) continue;
                const template = this.entries.get(key);
                this.entries.delete(key);
                this._release(key, template);
                loose--; gone++;
            }
            return gone;
        }
        /** Release one now, pinned or not held by anyone else. */
        release(key) {
            if (!this.entries.has(key) || this.pins.has(key)) return false;
            const template = this.entries.get(key);
            this.entries.delete(key);
            this._release(key, template);
            return true;
        }
        /** Forget one without releasing it (its file changed: the old one is still drawn somewhere). */
        forget(key) { return this.entries.delete(key); }
        /** Everything goes, pinned or not: the page is closing. */
        clear() {
            const all = Array.from(this.entries.entries());
            this.entries.clear();
            this.pins.clear();
            for (const [key, template] of all) this._release(key, template, new Set());
        }
        _release(key, template, keep) {
            // A promise still loading resolves to its template; nothing to give back until then.
            if (template && typeof template.then === 'function') { template.then(value => this._release(key, value, keep)).catch(() => {}); return; }
            if (!template) return;
            if (!keep) { keep = new Set(); for (const other of this.entries.values()) if (other && typeof other.then !== 'function') resourcesOf(other, keep); }
            releaseTemplate(template, keep);
            if (this.onRelease) { try { this.onRelease(key, template); } catch (error) { /* the caller's own bookkeeping */ } }
        }
    }

    /**
     * A renderer for a moment's work: made on first use, dropped `restMs`
     * after its last, made again on demand. `make()` returns
     * `{ renderer, ... }`; `use(fn)` hands that to `fn`.
     */
    class IdleRenderer {
        constructor(make, options = {}) {
            this.make = make;
            this.restMs = Number.isFinite(options.restMs) ? options.restMs : 4000;
            this.name = options.name || 'idle';
            this.state = null;
            this.timer = null;
            this.made = 0;
            // A window's own timers refuse to be called as another object's methods.
            this.setTimer = options.setTimeout || (typeof setTimeout === 'function' ? (fn, ms) => setTimeout(fn, ms) : null);
            this.clearTimer = options.clearTimeout || (typeof clearTimeout === 'function' ? id => clearTimeout(id) : null);
        }
        get active() { return !!this.state; }
        use(fn) {
            if (!this.state) { this.state = this.make(); this.made++; if (this.state && this.state.renderer) track(this.state.renderer, this.name); }
            this.rest();
            return fn(this.state);
        }
        /** Start the wait again. */
        rest() {
            if (this.timer !== null && this.clearTimer) this.clearTimer(this.timer);
            this.timer = this.setTimer ? this.setTimer(() => { this.timer = null; this.drop(); }, this.restMs) : null;
        }
        drop() {
            if (this.timer !== null && this.clearTimer) this.clearTimer(this.timer);
            this.timer = null;
            const state = this.state;
            this.state = null;
            if (state && state.renderer) dropRenderer(state.renderer);
        }
    }

    function stats() {
        const renderers = [];
        for (const renderer of live) {
            const memory = renderer.info && renderer.info.memory;
            renderers.push([renderer.__rrName || '', memory ? memory.textures : null, memory ? memory.geometries : null]);
        }
        return { live: live.size, renderers, released };
    }

    const api = { resourcesOf, releaseTemplate, track, untrack, dropRenderer, TemplateCache, IdleRenderer, stats };
    root.RRModelRelease = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
