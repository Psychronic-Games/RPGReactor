#!/usr/bin/env node
"use strict";
/**
 * Where a game frame goes, on the real GPU. Boots a project as the game in
 * NW.js (as nw-game-profile.cjs does), optionally walks the player, then:
 *
 *   --mode=passes  GPU time, draw calls and triangles per render pass (every
 *                  three.js render on the shared renderer, and PIXI's
 *                  composite), from timer queries around each pass.
 *   --mode=draws   GPU time per draw call, grouped by object (to rank draws).
 *   --mode=load    as spikes, from New Game on the title screen: the map loading.
 *   --mode=frozen  one frame held still, drawn under a timer per variant of a --setup
 *                  script (window.__rrVariants), pixels compared; --images saves
 *                  each variant's frame as frozen-<n>.png in --out.
 *   --mode=spikes  rAF intervals plus a CPU profile aligned to them: every
 *                  long frame lists what the main thread ran inside it (GC,
 *                  shader compiles, texture uploads, script), and the GPU time
 *                  of that frame, so a spike is attributed rather than averaged.
 *
 *   node tests/perf/nw-frame-breakdown.cjs --project=<disposable copy> [--mode=passes|spikes]
 *        [--seconds=10] [--walk] [--nw-root=<dir>] [--out=<dir>] [--setup=<script.js>]
 *        [--map=<id>,<x>,<y>] [--walk-size=8] [--throttle=4]
 *
 *   --map        start there instead of the project's starting position.
 *   --walk-size  the side, in tiles, of the square --walk loops round.
 *   --throttle   slow the main thread this many times (spikes and load): the
 *                nearer picture of a low-end CPU.
 *   --profile-dir=<dir>  keep the browser profile there instead of a fresh one
 *                per run: a second run on it is a warm launch, with the shader
 *                and code caches the first left behind.
 *
 * RR_PERF_CHROME_ARGS adds browser switches, space-separated: with
 * "disable-gpu-vsync disable-frame-rate-limit" frames come as fast as they
 * can be made, the nearer picture of a screen faster than 60 Hz.
 *
 * Profile a disposable project copy: project plugins can autosave.
 * Not part of `npm test`.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WebDriverClient } = require("../smoke/webdriver-client.cjs");

const option = (name, fallback) => { const p = `--${name}=`; const a = process.argv.slice(2).find(v => v.startsWith(p)); return a ? a.slice(p.length) : fallback; };
const flag = name => process.argv.slice(2).includes(`--${name}`);
const editorRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(editorRoot, "..");
const projectRoot = path.resolve(option("project", path.join(repoRoot, "template", "Demo")));
const platformRoot = { win32: "nwjs-win", darwin: "nwjs-mac" }[process.platform] || "nwjs-linux";
const nwRoot = path.resolve(option("nw-root", process.env.NWJS_SDK_ROOT || path.join(repoRoot, platformRoot)));
const outDir = path.resolve(option("out", os.tmpdir()));
const SECONDS = Number(option("seconds", 10));
const MODE = option("mode", "passes");
const WALK = flag("walk");
const WALK_SIZE = Number(option("walk-size", 8));
const START = option("map", "").split(",").map(Number).filter(Number.isFinite);
const exe = process.platform === "win32" ? ".exe" : "";

const cdp = (driver, cmd, params = {}) => driver.sessionRequest("POST", "/goog/cdp/execute", { cmd, params });

const BOOT = `
    const walk = arguments[0], size = arguments[1], start = arguments[2]; const done = arguments[arguments.length - 1];
    (async () => {
        SceneManager.isGameActive = () => true;
        // The quality levels stand still while a tool measures (a --setup script turns them back on).
        if (typeof Reactor3D !== "undefined" && Reactor3D.Quality) Reactor3D.Quality.enabled = false;
        DataManager.setupNewGame();
        if (start && start.length === 3) $gamePlayer.reserveTransfer(start[0], start[1], start[2], 2, 0);
        SceneManager.goto(Scene_Map);
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Map && scene.isActive() && $gameMap.mapId() > 0) break;
            await new Promise(r => setTimeout(r, 100));
        }
        if (walk) {
            // A loop through the map, collision off, so every run covers the same ground.
            const leg = (code, n) => Array.from({ length: n }, () => ({ code, indent: null }));
            $gamePlayer.setThrough(true);
            $gamePlayer.forceMoveRoute({ repeat: true, skippable: true, wait: false,
                list: [...leg(4, size), ...leg(3, size), ...leg(1, size), ...leg(2, size), { code: 0 }] });
        }
        await new Promise(r => setTimeout(r, 5000));
        // Steady state: the geometry worker has simplified every dense model
        // (it works one at a time, and a big prop takes seconds).
        const D = typeof Reactor3D !== "undefined" && Reactor3D.GeometryDetail, waitFrom = Date.now();
        while (D && !D._failed && (D._busy || D._queue.length) && Date.now() - waitFrom < 120000) await new Promise(r => setTimeout(r, 250));
        const detailWait = Date.now() - waitFrom;
        done({ detailWait, mapId: $gameMap.mapId(), gpu: Graphics.gpuDescription, tier: Graphics.gpuTier,
            canvas: [Graphics._canvas.width, Graphics._canvas.height], revision: globalThis.RPG_REACTOR_RUNTIME_REVISION,
            player: [$gamePlayer.x, $gamePlayer.y] });
    })().catch(e => done({ error: String(e && e.stack || e) }));
`;

const PASSES = `
    const seconds = arguments[0]; const done = arguments[arguments.length - 1];
    const pixi = Graphics._app.renderer; const gl = pixi.gl;
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!ext) return done({ error: "no EXT_disjoint_timer_query_webgl2" });
    const vp = Reactor3D.viewport && Reactor3D.viewport(); const three = vp && vp._renderer;
    const stats = new Map(); const pending = []; const stack = []; let active = null; let frames = 0;
    const stat = label => stats.get(label) || (stats.set(label, { gpu: [], calls: 0, tris: 0, n: 0, cpu: 0 }), stats.get(label));
    const begin = label => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = { label, q }; };
    const end = () => { if (!active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; };
    const timed = (label, fn, self, args) => {
        const outer = active && active.label; end(); stack.push(outer); begin(label); const t = performance.now();
        try { return fn.apply(self, args); }
        finally { stat(label).cpu += performance.now() - t; end(); const back = stack.pop(); if (back) begin(back); }
    };
    const callers = new Map();
    const labelFor = (scene, camera) => {
        const target = three.getRenderTarget();
        const where = target ? (target.texture && target.texture.name ? target.texture.name + " " : "") + target.width + "x" + target.height + (target.isWebGLCubeRenderTarget ? " cube" : "") : "canvas";
        // Per call: passes on one target and scene differ only by who asked.
        const lines = String(new Error().stack).split("\\n").slice(3, 9).map(l => l.trim().replace(/^at /, "").replace(/\\(.*[\\\\/]/, "(")).join(" < ");
        return where + " [" + (scene && scene.name || "scene") + ", " + (camera && camera.type) + "] " + lines;
    };
    const origThree = three && three.render;
    if (three) three.render = function (scene, camera) {
        const label = labelFor(scene, camera);
        const r = timed(label, origThree, this, arguments);
        const s = stat(label); s.n++; s.calls += three.info.render.calls; s.tris += three.info.render.triangles;
        return r;
    };
    const origPixi = pixi.render;
    pixi.render = function () { return timed("PIXI composite", origPixi, this, arguments); };
    const origTick = Graphics._tickHandler;
    Graphics._tickHandler = function () { return timed("game update (non-render GL)", origTick, this, arguments); };
    const start = performance.now();
    const collect = () => {
        for (let i = pending.length - 1; i >= 0; i--) {
            const p = pending[i];
            if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) stat(p.label).gpu.push(gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(p.q); pending.splice(i, 1);
        }
    };
    const tick = now => { frames++; collect(); if (now - start < seconds * 1000) requestAnimationFrame(tick); else setTimeout(finish, 300); };
    const finish = () => {
        collect();
        if (three) three.render = origThree; pixi.render = origPixi; Graphics._tickHandler = origTick;
        const sum = a => a.reduce((x, y) => x + y, 0);
        const rows = [...stats.entries()].map(([label, s]) => ({ label, perFrameGpu: +(sum(s.gpu) / frames).toFixed(2),
            medianGpu: s.gpu.length ? +s.gpu.slice().sort((a, b) => a - b)[s.gpu.length >> 1].toFixed(2) : null,
            maxGpu: s.gpu.length ? +Math.max(...s.gpu).toFixed(1) : null, runsPerFrame: +(s.gpu.length / frames).toFixed(2),
            callsPerRun: s.n ? Math.round(s.calls / s.n) : null, trisPerRun: s.n ? Math.round(s.tris / s.n) : null,
            cpuPerFrame: +(s.cpu / frames).toFixed(2) })).sort((a, b) => b.perFrameGpu - a.perFrameGpu);
        done({ frames, fps: +(frames / seconds).toFixed(1), totalGpuPerFrame: +sum(rows.map(r => r.perFrameGpu)).toFixed(2), rows });
    };
    requestAnimationFrame(tick);
`;

// GPU time per draw call on the shared renderer (timer query around each
// renderBufferDirect), grouped by object. Disturbs the GPU far more than the
// pass mode; use it to rank draws, not as a frame time.
const DRAWS = `
    const seconds = arguments[0]; const done = arguments[arguments.length - 1];
    const three = Reactor3D.viewport()._renderer; const gl = three.getContext();
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!ext) return done({ error: "no EXT_disjoint_timer_query_webgl2" });
    const stats = new Map(); const pending = []; let frames = 0;
    const describe = (object, material, geometry) => {
        const names = []; let o = object; for (let i = 0; o && i < 4; i++, o = o.parent) if (o.name) names.push(o.name);
        const target = three.getRenderTarget();
        const where = target ? target.width + "x" + target.height : "canvas";
        const tris = geometry.index ? geometry.index.count / 3 : (geometry.attributes.position ? geometry.attributes.position.count / 3 : 0);
        return where + " | " + (names.join("<") || object.type) + " | " + material.type + (material.transparent ? " T" : "") + (material.alphaTest ? " at" + material.alphaTest : "")
            + (material.depthWrite ? "" : " noZ") + " ro" + object.renderOrder + (object.isSkinnedMesh ? " skinned" : "") + " tris" + Math.round(tris);
    };
    const orig = three.renderBufferDirect;
    three.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const label = describe(object, material, geometry);
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        try { return orig.apply(this, arguments); }
        finally { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q, label }); }
    };
    const start = performance.now();
    const collect = () => {
        for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i];
            if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const s = stats.get(p.label) || { ms: 0, n: 0 }; s.ms += gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6; s.n++; stats.set(p.label, s); }
            gl.deleteQuery(p.q); pending.splice(i, 1); }
    };
    const tick = now => { frames++; collect(); if (now - start < seconds * 1000) requestAnimationFrame(tick); else setTimeout(finish, 300); };
    const finish = () => { collect(); three.renderBufferDirect = orig;
        const rows = [...stats.entries()].map(([label, s]) => ({ label, perFrame: +(s.ms / frames).toFixed(3), perDraw: +(s.ms / s.n).toFixed(3), drawsPerFrame: +(s.n / frames).toFixed(2) }))
            .sort((a, b) => b.perFrame - a.perFrame);
        done({ frames, total: +rows.reduce((a, r) => a + r.perFrame, 0).toFixed(2), rows: rows.slice(0, 60) }); };
    requestAnimationFrame(tick);
`;

// A/B in one session, standing still: the setup script leaves
// window.__rrVariants = [{ name, on(), off() }]; the baseline and each variant
// alternate for `rounds` rounds, each measured as the median GPU time of the
// whole frame (update and composite, one timer query) over `seconds`.
const AB = `
    const seconds = arguments[0], rounds = arguments[1]; const done = arguments[arguments.length - 1];
    const variants = [{ name: "baseline", on() {}, off() {} }].concat(window.__rrVariants || []);
    const gl = Graphics._app.renderer.gl; const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!ext) return done({ error: "no EXT_disjoint_timer_query_webgl2" });
    const sample = ms => new Promise(resolve => {
        const gpu = []; const pending = []; let active = null; const start = performance.now(); let frames = 0;
        const origTick = Graphics._tickHandler, origRender = Graphics._app.render.bind(Graphics._app);
        Graphics._tickHandler = function () { if (!active) { active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, active); } return origTick.apply(this, arguments); };
        Graphics._app.render = function () { try { return origRender(); } finally { if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; } } };
        const tick = now => { frames++;
            for (let i = pending.length - 1; i >= 0; i--) { const q = pending[i]; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
                if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); pending.splice(i, 1); }
            if (now - start < ms) requestAnimationFrame(tick);
            else { Graphics._tickHandler = origTick; Graphics._app.render = origRender; for (const q of pending) gl.deleteQuery(q);
                gpu.sort((a, b) => a - b); resolve({ median: gpu.length ? gpu[gpu.length >> 1] : null, p90: gpu.length ? gpu[Math.floor(gpu.length * 0.9)] : null, fps: frames / (ms / 1000) }); } };
        requestAnimationFrame(tick);
    });
    // One sample per call (a WebDriver request lasts at most 30 s): arguments[2] is the variant.
    const variant = variants[arguments[2]];
    (async () => {
        variant.on();
        await new Promise(r => setTimeout(r, 1500));
        const s = await sample(seconds * 1000);
        variant.off();
        done({ name: variant.name, count: variants.length, median: +s.median.toFixed(2), p90: +s.p90.toFixed(2), fps: +s.fps.toFixed(1) });
    })().catch(e => done({ error: String(e && e.stack || e) }));
`;

// Frozen A/B: clocks, tickers and videos stopped, the same frame drawn again
// and again under a timer query, every variant's pixels compared with the
// baseline's. Variants come from window.__rrVariants (a --setup script),
// each { name, on(), off(), exact? } where exact: false allows pixel changes.
// One WebDriver call per step (a request lasts at most 30 s): arguments[0] is
// "freeze", a variant index, or "thaw".
const FROZEN = `
    const step = arguments[0], samples = arguments[1], keep = arguments[2] === true; const done = arguments[arguments.length - 1];
    (async () => {
        const F = window.__rrFrozen || (window.__rrFrozen = {});
        const app = Graphics._app, gl = app.renderer.gl, ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        const spriteset = SceneManager._scene._spriteset, state = spriteset._reactor3d;
        const sleep = () => new Promise(r => setTimeout(r, 25));
        const draw = () => {
            // The light grid follows its focus each update; with updates
            // stopped it is refilled here, so a variant that rebuilds it
            // (a new size, a new texture) is drawn lit.
            if (F.focus !== undefined) Reactor3D.LightGrid.update(Reactor3D.lightUniforms(), F.focus);
            state.viewport.renderPass(state.scene, state.scene.modelsInWorld ? "world" : "below", "below");
            if (spriteset._reactor3dAbove) state.viewport.renderPass(state.scene, state.scene.modelsInWorld ? "overlay" : "above", "above");
            app.render();
        };
        if (step === "freeze") {
            F.realNow = performance.now.bind(performance); F.realDate = Date.now; const now = F.realNow(), date = F.realDate();
            F.appStarted = app.ticker.started; F.sharedStarted = PIXI.Ticker.shared.started; F.tick = Graphics._tickHandler;
            F.videos = [...document.querySelectorAll("video")].filter(v => !v.paused);
            // One last update, to learn the light grid's focus.
            const gridUpdate = Reactor3D.LightGrid.update;
            Reactor3D.LightGrid.update = function (uniforms, focus) { F.focus = focus ? { ...focus } : null; return gridUpdate.apply(this, arguments); };
            try { F.tick.call(SceneManager, 1); } finally { Reactor3D.LightGrid.update = gridUpdate; }
            app.ticker.stop(); PIXI.Ticker.shared.stop(); performance.now = () => now; Date.now = () => date;
            for (const v of F.videos) v.pause();
            Graphics._tickHandler = null;
            // The world matrices and shadows of this one frame, drawn again each time.
            F.variants = [{ name: "baseline", on() {}, off() {} }].concat(window.__rrVariants || []);
            await new Promise(r => setTimeout(r, 200));
            return done({ variants: F.variants.map(v => v.name) });
        }
        if (step === "thaw") {
            performance.now = F.realNow; Date.now = F.realDate; Graphics._tickHandler = F.tick;
            for (const v of F.videos) v.play().catch(() => {});
            if (F.sharedStarted) PIXI.Ticker.shared.start(); if (F.appStarted) app.ticker.start();
            return done({ thawed: true });
        }
        const variant = F.variants[step];
        variant.on();
        try {
            // "warmFrames" on a variant: more frames before the picture, for one whose programs compile afresh.
            for (let i = 0; i < (variant.warmFrames || 10); i++) { draw(); await sleep(); }
            draw();
            const image = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            const was = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, was);
            let pixels = null, png = null;
            if (keep) {
                // The frame as a PNG, upright, for looking at.
                const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, c = document.createElement("canvas"); c.width = w; c.height = h;
                const data = new ImageData(w, h), row = w * 4;
                for (let y = 0; y < h; y++) data.data.set(image.subarray((h - 1 - y) * row, (h - y) * row), y * row);
                c.getContext("2d").putImageData(data, 0, 0); png = c.toDataURL("image/png");
            }
            if (!F.base) F.base = image;
            else { let changed = 0, max = 0; for (let i = 0; i < image.length; i++) { const d = Math.abs(image[i] - F.base[i]); if (d) { changed++; if (d > max) max = d; } } pixels = { changed, max }; }
            const gpu = [], pending = [];
            const collect = () => { while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) { const q = pending.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); } };
            // Back to back, as a game draws: an idle gap between samples lets an
            // integrated GPU drop its clock, and the times then measure the clock.
            for (let i = 0; i < 8; i++) draw();
            for (let i = 0; i < samples; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); try { draw(); } finally { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); } if (i % 4 === 3) { gl.flush(); await new Promise(r => setTimeout(r, 0)); } collect(); }
            for (let i = 0; pending.length && i < 60; i++) { await sleep(); collect(); }
            gpu.sort((a, b) => a - b);
            done({ name: variant.name, median: +gpu[gpu.length >> 1].toFixed(2), p90: +gpu[Math.floor(gpu.length * 0.9)].toFixed(2), n: gpu.length, pixels, png, exact: variant.exact !== false, glError: gl.getError(),
                nonBlack: F.base.some((x, i) => i % 4 !== 3 && x > 8) });
        } finally { variant.off(); }
    })().catch(e => done({ error: String(e && e.stack || e) }));
`;

const SPIKES = `
    const seconds = arguments[0], load = arguments[1] === true, startAt = arguments[2]; const done = arguments[arguments.length - 1];
    const pixi = Graphics._app.renderer; const gl = pixi.gl; const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    // Marker: a busy function the profile can find, to line its clock up with performance.now().
    const marker = window.__rrPerfMarker = function __rrPerfMarker() { const t = performance.now(); let x = 0; while (performance.now() - t < 8) x += Math.sqrt(x + 1); return [t, x]; };
    const markAt = marker()[0];
    const times = []; const gpu = []; const pending = []; let active = null;
    // Per frame, what was handed to the GPU process that no timer query sees:
    // shader compiles and links, texture and buffer uploads (bytes), sync reads.
    const glCounts = []; const restoreGl = [];
    const count = (key, n) => { const f = glCounts[times.length] || (glCounts[times.length] = {}); f[key] = (f[key] || 0) + n; };
    const sizeOf = args => { const src = args[args.length - 1]; if (src && typeof src === "object" && !ArrayBuffer.isView(src)) return (src.videoWidth || src.naturalWidth || src.width || 0) * (src.videoHeight || src.naturalHeight || src.height || 0) * 4;
        return ArrayBuffer.isView(src) ? src.byteLength : (typeof args[3] === "number" && typeof args[4] === "number" ? args[3] * args[4] * 4 : 0); };
    for (const [ctx, tag] of [[gl, ""], [Graphics._effekseerGL, "efx:"]]) {
        if (!ctx) continue;
        for (const [fn, key, bytes] of [["compileShader", "compile"], ["linkProgram", "link"], ["texImage2D", "texUpload", true], ["texSubImage2D", "texUpload", true], ["texImage3D", "tex3D", true], ["texSubImage3D", "tex3D", true],
            ["bufferData", "bufferUpload", true], ["bufferSubData", "bufferUpload", true], ["readPixels", "readPixels"], ["getProgramParameter", "syncQuery"], ["getShaderParameter", "syncQuery"], ["getError", "getError"], ["clientWaitSync", "clientWait"]]) {
            const orig = ctx[fn]; if (typeof orig !== "function") continue;
            ctx[fn] = function () { count(tag + key, 1); if (bytes) count(tag + key + "Bytes", fn.startsWith("buffer") ? (arguments[1] && arguments[1].byteLength || (typeof arguments[1] === "number" ? arguments[1] : 0)) : sizeOf(arguments)); return orig.apply(this, arguments); };
            restoreGl.push(() => { ctx[fn] = orig; });
        }
    }
    const origTick = Graphics._tickHandler;
    Graphics._tickHandler = function () {
        if (ext && !active) { active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, active); active.frame = times.length; }
        return origTick.apply(this, arguments);
    };
    const origRender = Graphics._app.render.bind(Graphics._app);
    Graphics._app.render = function () {
        try { return origRender(); } finally { if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; } }
    };
    const start = performance.now();
    const tick = now => {
        times.push(now);
        for (let i = pending.length - 1; i >= 0; i--) { const q = pending[i];
            if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu[q.frame] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
            gl.deleteQuery(q); pending.splice(i, 1); }
        if (now - start < seconds * 1000) requestAnimationFrame(tick);
        else { Graphics._tickHandler = origTick; Graphics._app.render = origRender; for (const r of restoreGl) r(); done({ markAt, times, gpu, glCounts, heapMb: Math.round(performance.memory.usedJSHeapSize / 1048576) }); }
    };
    requestAnimationFrame(tick);
    if (load) { SceneManager.isGameActive = () => true; if (typeof Reactor3D !== "undefined" && Reactor3D.Quality) Reactor3D.Quality.enabled = false; DataManager.setupNewGame();
        if (startAt && startAt.length === 3) $gamePlayer.reserveTransfer(startAt[0], startAt[1], startAt[2], 2, 0);
        SceneManager.goto(Scene_Map); }
`;

function analyzeSpikes(profile, result) {
    const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
    // Sample timestamps in µs on the profile's clock.
    const stamps = []; let t = profile.startTime;
    for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] || 0; stamps.push(t); }
    const markerIdx = profile.samples.findIndex(id => byId.get(id).callFrame.functionName === "__rrPerfMarker");
    if (markerIdx < 0) return { error: "marker not in profile" };
    const offset = stamps[markerIdx] / 1000 - result.markAt; // profile ms = page ms + offset
    const name = id => { const cf = byId.get(id).callFrame; return `${cf.functionName || "(anon)"} ${path.basename(cf.url || "") || "(native)"}:${cf.lineNumber + 1}`; };
    const deltas = result.times.slice(1).map((v, i) => v - result.times[i]);
    const sorted = deltas.slice().sort((a, b) => a - b); const median = sorted[sorted.length >> 1];
    const spikes = [];
    deltas.forEach((d, i) => {
        if (d < Math.max(median * 1.8, 25)) return;
        const from = (result.times[i] + offset) * 1000, to = (result.times[i + 1] + offset) * 1000;
        const self = new Map(), incl = new Map(); let sampled = 0;
        for (let s = 0; s < stamps.length; s++) {
            if (stamps[s] < from || stamps[s] >= to) continue;
            const dt = (profile.timeDeltas[s + 1] || 0) / 1000; sampled += dt;
            const k = name(profile.samples[s]); self.set(k, (self.get(k) || 0) + dt);
            const seen = new Set(); let id = profile.samples[s];
            while (id !== undefined) { const kk = name(id); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + dt); } id = parent.get(id); }
        }
        const top = m => [...m.entries()].filter(([k]) => !/^\(root\)|^\(program\)|^\(idle\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v.toFixed(1)}ms ${k}`);
        spikes.push({ frame: i + 1, ms: +d.toFixed(1), gpuMs: result.gpu[i + 1] != null ? +result.gpu[i + 1].toFixed(1) : null,
            idleMs: +(self.get("(idle) (native):0") || 0).toFixed(1), programMs: +(self.get("(program) (native):0") || 0).toFixed(1), gcMs: +(self.get("(garbage collector) (native):0") || 0).toFixed(1),
            self: top(self), inclusive: top(incl).slice(0, 12),
            // GL work queued in the frame the spike ends and the one before it.
            gl: [result.glCounts[i], result.glCounts[i + 1]].map(c => c ? Object.entries(c).map(([k, v]) => k + "=" + (/Bytes$/.test(k) ? (v / 1048576).toFixed(1) + "MB" : v)).join(" ") : "") });
    });
    // Typical GL traffic per frame, to read the spikes against.
    const totals = {}; for (const c of result.glCounts || []) if (c) for (const [k, v] of Object.entries(c)) totals[k] = (totals[k] || 0) + v;
    const perFrame = Object.entries(totals).map(([k, v]) => k + "=" + (/Bytes$/.test(k) ? (v / deltas.length / 1048576).toFixed(2) + "MB" : (v / deltas.length).toFixed(2))).join(" ");
    const gpuVals = result.gpu.filter(v => v != null).sort((a, b) => a - b);
    return { frames: deltas.length, medianMs: +median.toFixed(1), p95: +sorted[Math.floor(sorted.length * .95)].toFixed(1), max: +sorted[sorted.length - 1].toFixed(1),
        gpuMedian: gpuVals.length ? +gpuVals[gpuVals.length >> 1].toFixed(1) : null, gpuP95: gpuVals.length ? +gpuVals[Math.floor(gpuVals.length * .95)].toFixed(1) : null,
        heapMb: result.heapMb, glPerFrame: perFrame, spikeCount: spikes.length, spikes };
}

async function main() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rr-frame-"));
    const driver = new WebDriverClient(path.join(nwRoot, "chromedriver" + exe), { env: { ...process.env } });
    try {
        await driver.start();
        await driver.createSession({ browserName: "chrome", "goog:chromeOptions": {
            args: [`nwapp=${projectRoot}`, `user-data-dir=${option("profile-dir", null) ? path.resolve(option("profile-dir")) : path.join(tempRoot, "profile")}`, "no-first-run", "no-default-browser-check",
                "disable-backgrounding-occluded-windows", "disable-renderer-backgrounding", "disable-background-timer-throttling",
                // RR_PERF_MUTE=1: no sound from a harness window on a machine someone is working at.
                ...(process.env.RR_PERF_MUTE ? ["mute-audio"] : []),
                ...(process.env.RR_PERF_CHROME_ARGS || "").split(/\s+/).filter(Boolean)] } });
        await driver.setScriptTimeout(Math.max(120000, SECONDS * 3000));
        await driver.waitForScript("return Boolean(window.SceneManager && SceneManager._scene && !(SceneManager._scene instanceof Scene_Boot) && Graphics.width > 0);", [], { timeout: 90000, description: "title screen" });
        // --mode=load records the map loading itself: from New Game on the title screen.
        const opened = MODE === "load" ? { load: true } : await driver.executeAsync(BOOT, [WALK, WALK_SIZE, START]);
        if (MODE !== "load") {
            // Everything shown, the light volume baked and, standing still,
            // the camera at rest, so frozen frames compare like with like.
            const SETTLE = "const W = Reactor3D.ShaderWarmup, V = Reactor3D.LightVolume, vp = Reactor3D.viewport && Reactor3D.viewport(), c = vp && vp._camera;"
                + "return { hidden: W ? W.lastHidden : 0, baking: !!(V && V.enabled && V._back), cam: c ? c.position.toArray().concat(c.quaternion.toArray()).map(v => v.toFixed(3)).join() : '' };";
            const from = Date.now();
            let settled = 0, last = null;
            // --settle=<ms>: how long to wait for that (a map with moving lights never stops baking).
            while (settled < 8 && Date.now() - from < Number(option("settle", 90000))) {
                await new Promise(r => setTimeout(r, 250));
                const x = await driver.execute(SETTLE);
                settled = !x.hidden && !x.baking && (WALK || x.cam === last) ? settled + 1 : 0;
                last = x.cam;
            }
            opened.settleWait = Date.now() - from;
            if (settled < 8) opened.unsettled = await driver.execute(SETTLE);
        }
        console.log("opened", JSON.stringify(opened));
        if (opened.error) throw new Error(opened.error);
        const setupPath = option("setup", null);
        if (setupPath) console.log("setup", JSON.stringify(await driver.executeAsync(fs.readFileSync(setupPath, "utf8"), [])));
        if (MODE === "passes") {
            const r = await driver.executeAsync(PASSES, [SECONDS]);
            if (r.error) throw new Error(r.error);
            console.log(`frames ${r.frames} (${r.fps} fps), summed GPU per frame ${r.totalGpuPerFrame} ms`);
            for (const row of r.rows) console.log(`${String(row.perFrameGpu).padStart(7)} ms/frame  med ${String(row.medianGpu).padStart(6)}  max ${String(row.maxGpu).padStart(6)}  runs/f ${String(row.runsPerFrame).padStart(5)}  calls ${String(row.callsPerRun).padStart(5)}  tris ${String(row.trisPerRun).padStart(8)}  cpu ${row.cpuPerFrame}  ${row.label}`);
            fs.writeFileSync(path.join(outDir, "frame-passes.json"), JSON.stringify(r, null, 1));
        } else if (MODE === "frozen") {
            // --positions=N: N frozen frames, the game running (and walking,
            // with --walk) for --gap seconds between them; each variant's time
            // is summed over the positions.
            const rounds = Number(option("rounds", 2)), samples = Number(option("samples", 40)), positions = Number(option("positions", 1)), gap = Number(option("gap", 2.5));
            let rows = null;
            for (let position = 0; position < positions; position++) {
                if (position) { await driver.executeAsync("const d = arguments[arguments.length - 1]; delete window.__rrFrozen; setTimeout(() => d(1), " + Math.round(gap * 1000) + ");", []); }
                const { variants } = await driver.executeAsync(FROZEN, ["freeze", samples]);
                const here = variants.map(name => ({ name, medians: [], pixels: null, exact: true, glError: 0 }));
                try {
                    for (let round = 0; round < rounds; round++) {
                        for (let i = 0; i < variants.length; i++) {
                            const x = await driver.executeAsync(FROZEN, [i, samples, flag("images") && round === 0]);
                            if (x.png) fs.writeFileSync(path.join(outDir, `frozen-${position ? position + "-" : ""}${i}.png`), Buffer.from(x.png.split(",")[1], "base64"));
                            if (x.error) throw new Error(x.error);
                            here[i].medians.push(x.median); here[i].exact = x.exact; here[i].glError |= x.glError;
                            if (x.pixels) here[i].pixels = x.pixels;
                            if (!x.nonBlack) console.log("warning: the baseline frame is black");
                        }
                    }
                } finally { await driver.executeAsync(FROZEN, ["thaw", samples]); }
                if (positions > 1) console.log("position " + position + ": " + here.map(r => r.name + " " + (r.medians.reduce((a, b) => a + b, 0) / r.medians.length).toFixed(2)).join(" | "));
                if (!rows) rows = here;
                else here.forEach((r, i) => { rows[i].sum = (rows[i].sum || [rows[i].medians.reduce((a, b) => a + b, 0) / rows[i].medians.length]); rows[i].sum.push(r.medians.reduce((a, b) => a + b, 0) / r.medians.length); rows[i].glError |= r.glError; });
            }
            if (positions > 1) for (const row of rows) row.medians = row.sum.map(v => +v.toFixed(2));
            let passed = true;
            // The baseline compared with itself a round later: what the frozen
            // frame does on its own (a particle, a flicker the freeze misses).
            // An exact variant may differ by that much and no more.
            const noise = rows[0].pixels || { changed: 0, max: 0 };
            for (const row of rows) {
                const avg = +(row.medians.reduce((a, b) => a + b, 0) / row.medians.length).toFixed(2);
                const pix = row.pixels ? `${row.pixels.changed} channels differ (max ${row.pixels.max})` : "reference";
                if (row !== rows[0] && row.exact && row.pixels && (row.pixels.changed > noise.changed * 1.5 + 16 || row.pixels.max > noise.max)) passed = false;
                if (row.glError) passed = false;
                console.log(`${row.name.padEnd(32)} GPU ${String(avg).padStart(6)} ms  [${row.medians.join(", ")}]  ${pix}${row.glError ? "  GL error " + row.glError : ""}`);
            }
            console.log(passed ? `PASS: exact variants match the baseline within its own noise (${noise.changed} channels, max ${noise.max})` : "FAIL: an exact variant changed pixels beyond the baseline's own noise, or raised a GL error");
            fs.writeFileSync(path.join(outDir, "frame-frozen.json"), JSON.stringify(rows, null, 1));
        } else if (MODE === "ab") {
            const rounds = Number(option("rounds", 2)), results = [];
            for (let round = 0; round < rounds; round++) {
                for (let i = 0; i === 0 || i < results.length; i++) {
                    const x = await driver.executeAsync(AB, [SECONDS, rounds, i]);
                    if (x.error) throw new Error(x.error);
                    if (!results[i]) for (let k = results.length; k < x.count; k++) results.push({ name: "", medians: [], p90: [], fps: [] });
                    Object.assign(results[i], { name: x.name }); results[i].medians.push(x.median); results[i].p90.push(x.p90); results[i].fps.push(x.fps);
                }
            }
            const r = { results };
            for (const row of r.results) {
                const avg = a => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
                console.log(`${row.name.padEnd(28)} GPU median ${String(avg(row.medians)).padStart(6)} ms  [${row.medians.join(", ")}]  p90 ${avg(row.p90)}  fps ${avg(row.fps)}`);
            }
            fs.writeFileSync(path.join(outDir, "frame-ab.json"), JSON.stringify(r, null, 1));
        } else if (MODE === "draws") {
            const r = await driver.executeAsync(DRAWS, [SECONDS]);
            if (r.error) throw new Error(r.error);
            console.log(`frames ${r.frames}, summed draw GPU per frame ${r.total} ms`);
            for (const row of r.rows) console.log(`${String(row.perFrame).padStart(8)} ms/frame  ${String(row.perDraw).padStart(7)} ms/draw  ${String(row.drawsPerFrame).padStart(5)} draws/f  ${row.label}`);
            fs.writeFileSync(path.join(outDir, "frame-draws.json"), JSON.stringify(r, null, 1));
        } else {
            await cdp(driver, "Profiler.enable");
            await cdp(driver, "Profiler.setSamplingInterval", { interval: 250 });
            const throttle = Number(option("throttle", 1));
            if (throttle > 1) await cdp(driver, "Emulation.setCPUThrottlingRate", { rate: throttle });
            await cdp(driver, "Profiler.start");
            const r = await driver.executeAsync(SPIKES, [SECONDS, MODE === "load", START]);
            const { profile } = await cdp(driver, "Profiler.stop");
            if (throttle > 1) await cdp(driver, "Emulation.setCPUThrottlingRate", { rate: 1 });
            fs.writeFileSync(path.join(outDir, "frame-spikes.cpuprofile"), JSON.stringify(profile));
            const a = analyzeSpikes(profile, r);
            fs.writeFileSync(path.join(outDir, "frame-spikes.json"), JSON.stringify(a, null, 1));
            console.log(`frames ${a.frames}, median ${a.medianMs} ms, p95 ${a.p95}, max ${a.max}, GPU median ${a.gpuMedian} p95 ${a.gpuP95}, heap ${a.heapMb} MB, spikes ${a.spikeCount}`);
            console.log(`GL per frame: ${a.glPerFrame}`);
            for (const s of (a.spikes || []).sort((x, y) => y.ms - x.ms).slice(0, 25)) {
                console.log(`\n#${s.frame} ${s.ms} ms (gpu ${s.gpuMs}, idle ${s.idleMs}, program ${s.programMs}, gc ${s.gcMs})`);
                console.log("  self: " + s.self.join(" | "));
                console.log("  incl: " + s.inclusive.join(" | "));
                console.log("  gl:   " + s.gl.join("  ||  "));
            }
        }
    } finally {
        await driver.close();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
