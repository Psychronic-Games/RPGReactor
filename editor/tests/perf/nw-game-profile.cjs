#!/usr/bin/env node
"use strict";
/**
 * Profile the game runtime in NW.js: boots a project as the game (not the
 * editor), starts a new game onto its start map, then records rAF frame
 * deltas, a CDP CPU profile aggregated by self time, GPU time per frame on
 * the shared three/PIXI context, and the 3D pass layout. Does not request a
 * save; project plugins can autosave, so profile a disposable project copy.
 * Not part of `npm test`.
 *
 *   node tests/perf/nw-game-profile.cjs [--project=<dir>] [--seconds=6]
 *        [--nw-root=<dir>] [--shot=<png>] [--setup=<script.js>] [--pixel-ratio=<n>]
 *        [--render-node=/dev/dri/renderD129]
 *
 * --pixel-ratio sets Graphics.maxCanvasPixelRatio before the map loads, to
 * compare the stretched-window cost. --setup runs an async WebDriver script
 * (arguments[last] is the callback) on the map before measuring.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WebDriverClient } = require("../smoke/webdriver-client.cjs");

const option = (name, fallback) => { const p = `--${name}=`; const a = process.argv.slice(2).find(v => v.startsWith(p)); return a ? a.slice(p.length) : fallback; };
const editorRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(editorRoot, "..");
const projectRoot = path.resolve(option("project", path.join(repoRoot, "template", "Demo")));
const platformRoot = { win32: "nwjs-win", darwin: "nwjs-mac" }[process.platform] || "nwjs-linux";
const nwRoot = path.resolve(option("nw-root", process.env.NWJS_SDK_ROOT || path.join(repoRoot, platformRoot)));
const outDir = path.resolve(option("out", os.tmpdir()));
const SECONDS = Number(option("seconds", 6));
const PIXEL_RATIO = option("pixel-ratio", null);
const RENDER_NODE = option("render-node", null);
const exe = process.platform === "win32" ? ".exe" : "";

async function cdp(driver, cmd, params = {}) {
    return driver.sessionRequest("POST", "/goog/cdp/execute", { cmd, params });
}

async function main() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rr-game-perf-"));
    const driver = new WebDriverClient(path.join(nwRoot, "chromedriver" + exe), { env: { ...process.env } });
    try {
        await driver.start();
        await driver.createSession({
            browserName: "chrome",
            "goog:chromeOptions": {
                args: [`nwapp=${projectRoot}`, `user-data-dir=${path.join(tempRoot, "profile")}`, "no-first-run", "no-default-browser-check",
                    // An occluded window stops getting animation frames, and the owner's editor is usually in front of this one.
                    "disable-backgrounding-occluded-windows", "disable-renderer-backgrounding", "disable-background-timer-throttling",
                    ...(RENDER_NODE ? ["render-node-override=" + RENDER_NODE] : []),
                    // RR_PERF_MUTE=1: no sound from a harness window on a machine someone is working at.
                    ...(process.env.RR_PERF_MUTE ? ["mute-audio"] : [])],
            },
        });
        await driver.setScriptTimeout(120000);
        // Past Scene_Boot: it sizes the screen and loads the fonts, and a
        // map started before it ran draws into a 0x0 surface — a black window.
        await driver.waitForScript("return Boolean(window.SceneManager && SceneManager._scene && !(SceneManager._scene instanceof Scene_Boot) && Graphics.width > 0);", [], { timeout: 90000, description: "title screen" });

        const opened = await driver.executeAsync(`
            const pixelRatio = arguments[0]; const done = arguments[arguments.length - 1];
            (async () => {
                if (pixelRatio !== null) Graphics.maxCanvasPixelRatio = Number(pixelRatio);
                // The scene only updates while the window has focus, and this window rarely does.
                SceneManager.isGameActive = () => true;
                DataManager.setupNewGame();
                SceneManager.goto(Scene_Map);
                const t0 = Date.now();
                while (Date.now() - t0 < 60000) {
                    const scene = SceneManager._scene;
                    if (scene && scene instanceof Scene_Map && scene.isActive && scene.isActive() && $gameMap && $gameMap.mapId() > 0) break;
                    await new Promise(r => setTimeout(r, 100));
                }
                await new Promise(r => setTimeout(r, 4000));
                const vp = typeof Reactor3D !== "undefined" && Reactor3D.viewport ? Reactor3D.viewport() : null;
                const spriteset = SceneManager._scene._spriteset;
                const passes = spriteset ? ["_reactor3dBelow", "_reactor3dAbove", "_reactor3dLights"].filter(k => spriteset[k]) : [];
                done({ mapId: $gameMap.mapId(), scene: SceneManager._scene && SceneManager._scene.constructor.name,
                    is3D: !!(spriteset && spriteset._reactor3dBelow), shared: vp && vp.isShared ? vp.isShared() : null, passes,
                    width: Graphics.width, height: Graphics.height, realScale: Graphics._realScale, canvasPixelRatio: Graphics.canvasPixelRatio ? Graphics.canvasPixelRatio() : null,
                    stretch: Graphics._stretchEnabled, lights: typeof Reactor3D !== "undefined" && Reactor3D.lights ? Reactor3D.lights().length : null,
                    lightMode: typeof Reactor3D !== "undefined" && Reactor3D.lightModeFor ? Reactor3D.lightModeFor($dataMap) : null,
                    gpu: Graphics.gpuDescription, tier: Graphics.gpuTier,
                    revision: globalThis.RPG_REACTOR_RUNTIME_REVISION, fps: Graphics._fpsCounter ? Graphics._fpsCounter.fps : null,
                    canvas: [Graphics._canvas.width, Graphics._canvas.height] });
            })().catch(e => done({ error: String(e && e.stack || e) }));
        `, [PIXEL_RATIO]);
        console.log("opened", JSON.stringify(opened));
        if (opened.error) throw new Error(opened.error);
        const setupPath = option("setup", null);
        if (setupPath) {
            const setup = await driver.executeAsync(fs.readFileSync(setupPath, "utf8"), []);
            console.log("setup", JSON.stringify(setup));
            if (setup && setup.error) throw new Error(setup.error);
            if (setup && setup.passed === false) throw new Error("Setup validation failed; see comparison report above");
        }
        const shotPath = option("shot", null);
        if (shotPath) {
            const shot = await driver.sessionRequest("GET", "/screenshot");
            fs.writeFileSync(shotPath, Buffer.from(shot, "base64"));
            console.log("screenshot", shotPath);
        }

        await cdp(driver, "Profiler.enable");
        await cdp(driver, "Profiler.setSamplingInterval", { interval: 200 });
        await cdp(driver, "Profiler.start");
        const frames = await driver.executeAsync(`
            const seconds = arguments[0]; const done = arguments[arguments.length - 1];
            const deltas = []; let last = performance.now(); const start = last;
            // Three draws during the tick handler; PIXI composites afterwards. Keep
            // the query open across both, otherwise the expensive 3D work is omitted.
            const renderer = Graphics._app && Graphics._app.renderer; const gl = renderer && renderer.gl; const ext = gl && gl.getExtension("EXT_disjoint_timer_query_webgl2");
            const gpu = []; let pending = []; let tickMs = 0, ticks = 0; let renderMs = 0;
            let activeQuery = null;
            const endGpuFrame = () => { if (activeQuery) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(activeQuery); activeQuery = null; } };
            const beginGpuFrame = () => { if (ext && !activeQuery) { activeQuery = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, activeQuery); } };
            const origRender = Graphics._app && Graphics._app.render ? Graphics._app.render.bind(Graphics._app) : null;
            if (origRender) Graphics._app.render = function () {
                beginGpuFrame(); const t = performance.now();
                try { return origRender(); } finally { renderMs += performance.now() - t; endGpuFrame(); }
            };
            const origTick = Graphics._tickHandler; Graphics._tickHandler = function (dt) {
                endGpuFrame(); beginGpuFrame(); const t = performance.now();
                try { return origTick.apply(this, arguments); }
                catch (error) { endGpuFrame(); throw error; }
                finally { tickMs += performance.now() - t; ticks++; }
            };
            const tick = now => { deltas.push(now - last); last = now;
                if (ext) pending = pending.filter(q => { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); return false; } return true; });
                if (now - start < seconds * 1000) requestAnimationFrame(tick); else finish(); };
            const finish = () => {
                endGpuFrame();
                if (origRender) Graphics._app.render = origRender; Graphics._tickHandler = origTick;
                // Outstanding queries need not block this report; release them.
                for (const q of pending) gl.deleteQuery(q); pending = [];
                const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.floor(s.length / 2)].toFixed(2) : null; };
                const p = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1) : null; };
                done({ frames: deltas.length, meanMs: +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2), p50: p(deltas, .5), p95: p(deltas, .95), max: p(deltas, 1), over33: deltas.filter(d => d > 33).length,
                    updateMsPerFrame: ticks ? +(tickMs / ticks).toFixed(2) : null, renderCpuMsPerFrame: ticks ? +(renderMs / ticks).toFixed(2) : null, gpuP50: med(gpu), gpuP95: p(gpu, .95), gpuSamples: gpu.length,
                    mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, fps: Graphics._fpsCounter ? Graphics._fpsCounter.fps : null });
            };
            requestAnimationFrame(tick);
        `, [SECONDS]);
        console.log("frames", JSON.stringify(frames));
        const { profile } = await cdp(driver, "Profiler.stop");
        fs.writeFileSync(path.join(outDir, "game-profile.cpuprofile"), JSON.stringify(profile));

        const byId = new Map(profile.nodes.map(n => [n.id, n]));
        const self = new Map();
        const total = profile.timeDeltas.reduce((a, b) => a + b, 0);
        for (let i = 0; i < profile.samples.length; i++) {
            const n = byId.get(profile.samples[i]); const dt = profile.timeDeltas[i] || 0;
            const cf = n.callFrame; const key = `${cf.functionName || "(anon)"} ${path.basename(cf.url || "") || "(native)"}:${cf.lineNumber + 1}`;
            self.set(key, (self.get(key) || 0) + dt);
        }
        console.log(`\nTop self-time (of ${(total / 1000).toFixed(0)} ms sampled):`);
        for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`${(100 * v / total).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
        const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
        const incl = new Map();
        for (let i = 0; i < profile.samples.length; i++) {
            const dt = profile.timeDeltas[i] || 0; const seen = new Set(); let id = profile.samples[i];
            while (id !== undefined) { const f = path.basename(byId.get(id).callFrame.url || "") || "(native)"; if (!seen.has(f)) { seen.add(f); incl.set(f, (incl.get(f) || 0) + dt); } id = parent.get(id); }
        }
        console.log("\nInclusive time per file:");
        for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
    } finally {
        await driver.close();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
