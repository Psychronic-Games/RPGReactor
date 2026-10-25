#!/usr/bin/env node
"use strict";
/**
 * The frames of a border crossing (Reactor3D.Neighbors) in the game: the Demo's North Haven (Map005)
 * and Forest Road (Map008), walked over their shared border with held arrow keys (real input), one
 * way and back. Per frame: rAF interval, shader compiles and links, programs, and the map; the
 * crossing frame and those after it are printed, with a CPU profile of each long one (--profile).
 *
 *   node tests/perf/nw-border-crossing.cjs --project=<disposable Demo copy, runtime synced into js/>
 *        [--from=5|8] [--row=38] [--out=<dir>] [--profile] [--throttle=4]
 *        [--owners]  which materials the programs made in a crossing frame belong to (slower)
 *        [--pixels]  the mean colour of the screen each frame, to see a crossing frame is a picture (slower)
 *
 * Random encounters are switched off and autorun/parallel events erased. Not part of `npm test`.
 */
const fs = require("node:fs"), path = require("node:path");
const REPO = path.resolve(__dirname, "..", "..", "..");
const { WebDriverClient } = require(path.join(REPO, "editor", "tests", "smoke", "webdriver-client.cjs"));
const option = (n, f) => { const p = `--${n}=`; const a = process.argv.slice(2).find(v => v.startsWith(p)); return a ? a.slice(p.length) : f; };
const flag = n => process.argv.slice(2).includes(`--${n}`);
if (!option("project", null)) { console.error("--project=<disposable Demo copy> is required"); process.exit(2); }
const project = path.resolve(option("project", ""));
const out = path.resolve(option("out", path.join(require("node:os").tmpdir(), "rr-border-crossing")));
fs.mkdirSync(out, { recursive: true });
const cdp = (d, cmd, params = {}) => d.sessionRequest("POST", "/goog/cdp/execute", { cmd, params });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BOOT = `
const row = arguments[0], startX = arguments[1], startMap = arguments[2] || 5; const done = arguments[arguments.length - 1];
(async () => {
  SceneManager.isGameActive = () => true;
  window.__rrErrors = [];
  window.addEventListener("error", e => window.__rrErrors.push(String(e.message || e)));
  const ce = console.error; console.error = function () { try { window.__rrErrors.push(Array.from(arguments).map(a => a && a.stack ? a.stack : String(a)).join(" ").slice(0, 2000)); } catch (x) {} return ce.apply(this, arguments); };
  if (Reactor3D.Quality) Reactor3D.Quality.enabled = false;
  DataManager.setupNewGame();
  $gamePlayer.reserveTransfer(startMap, startX, row >= 0 ? row : 60, 6, 0);
  SceneManager.goto(Scene_Map);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) { const s = SceneManager._scene; if (s instanceof Scene_Map && s.isActive() && $gameMap.mapId() === startMap) break; await new Promise(r => setTimeout(r, 100)); }
  // no cutscenes
  for (const e of $gameMap.events()) { const p = e.page(); if (p && p.trigger >= 3) e.erase(); }
  $gameMap._interpreter.clear && $gameMap._interpreter.clear();
  let y = row;
  if (y < 0) { // the row from startX to the east border with the most passable tiles
    let best = -1, bestN = -1;
    for (let yy = 1; yy < 119; yy++) { let n = 0; for (let x = startX; x < 200; x++) if ($gameMap.isPassable(x, yy, 6)) n++; if (n > bestN) { bestN = n; best = yy; } }
    y = best;
  }
  $gamePlayer.setThrough(true);
  // No random encounters (an on-map fight stops the walk).
  $gameSystem.disableEncounter();
  $gamePlayer.locate(startX, y);
  done({ y, gpu: Graphics.gpuDescription, tier: Graphics.gpuTier, rev: globalThis.RPG_REACTOR_RUNTIME_REVISION,
    parallel: !!Reactor3D.viewport()._renderer.extensions.has("KHR_parallel_shader_compile") });
})().catch(e => done({ error: String(e && e.stack || e) }));`;

// Settled: every neighbor world laid, models stood, nothing held for shaders, for 2 s.
const SETTLED = `
const N = Reactor3D.Neighbors, live = N.live, s = live && live.scene; let busy = 0, bodies = 0;
const walk = sc => { for (const k of Object.keys(sc._neighborBodies || {})) { const b = sc._neighborBodies[k]; bodies++; if (b.stage || b.settle > 0) busy++; walk(b.scene); } };
if (s) walk(s);
const W = Reactor3D.ShaderWarmup;
return { busy, bodies, fight: !!(typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere && $gameFight.isHere()), enc: $gameSystem.isEncounterEnabled(), hidden: W.lastHidden, map: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y, queue: (Reactor3D.GeometryDetail && Reactor3D.GeometryDetail._queue || []).length };`;

const INSTALL = `
const owners = arguments[0], pixels = arguments[1]; const done = arguments[arguments.length - 1];
const vp = Reactor3D.viewport(), r = vp._renderer, gl = r.getContext();
const rec = window.__rrCross = { frames: [], cur: { compile: 0, link: 0 }, newProgs: [] };
const marker = window.__rrPerfMarker = function __rrPerfMarker() { const t = performance.now(); let x = 0; while (performance.now() - t < 8) x += Math.sqrt(x + 1); return [t, x]; };
rec.markAt = marker()[0];
if (!gl.__rrWrapped) { gl.__rrWrapped = true;
  for (const [fn, k] of [["compileShader", "compile"], ["linkProgram", "link"]]) { const o = gl[fn]; gl[fn] = function () { window.__rrCross && window.__rrCross.cur[k]++; return o.apply(this, arguments); }; } }
let known = new Set(r.info.programs.map(p => p.id));
if (pixels && !Graphics._app.__rrPix) { Graphics._app.__rrPix = true; const pgl = Graphics._app.renderer.gl, orig = Graphics._app.render.bind(Graphics._app), buf = new Uint8Array(4 * 64);
  Graphics._app.render = function () { const out = orig(); const c = window.__rrCross; if (c) { const w = pgl.drawingBufferWidth, h = pgl.drawingBufferHeight; let sum = [0, 0, 0], k = 0;
    pgl.bindFramebuffer(pgl.FRAMEBUFFER, null);
    for (let y = 1; y <= 8; y++) { pgl.readPixels(0, Math.floor(h * y / 9), w, 1, pgl.RGBA, pgl.UNSIGNED_BYTE, c.row || (c.row = new Uint8Array(w * 4)));
      for (let x = 1; x <= 8; x++) { const i = Math.floor(w * x / 9) * 4; sum[0] += c.row[i]; sum[1] += c.row[i + 1]; sum[2] += c.row[i + 2]; k++; } }
    c.pix = sum.map(v => Math.round(v / k)); c.pixRow = Array.from(c.row.subarray(0, 0)); } return out; }; }
const prev = rec.prev = new WeakMap(); let seenMats = 0;
const note = () => { const live = Reactor3D.Neighbors.live, root = live && live.scene && live.scene._scene; if (!root) return;
  root.traverse(o => { if (!o.material) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m) continue; for (const mm of [m, m.__rrUnlitTwin].filter(Boolean)) { if (prev.has(mm)) continue; const pr = r.properties.get(mm); prev.set(mm, pr.currentProgram ? pr.currentProgram.id : -1); seenMats++; } } }); };
rec.note = note; if (owners) note();
if (!Spriteset_Map.prototype.__rrReuseWrapped && Spriteset_Map.prototype.reactor3DKeepsLastPicture) { Spriteset_Map.prototype.__rrReuseWrapped = true; const k = Spriteset_Map.prototype.reactor3DKeepsLastPicture;
  Spriteset_Map.prototype.reactor3DKeepsLastPicture = function (state) { const out = k.apply(this, arguments); if (this._reactor3dAdoptedAt === Graphics.frameCount) { const v = state && state.viewport;
    (window.__rrReuse || (window.__rrReuse = [])).push({ f: Graphics.frameCount, out, shared: !!(v && v.isShared && v.isShared()), below: v && v.drawnAt && v.drawnAt("below"), above: !!this._reactor3dAbove, aboveAt: v && v.drawnAt && v.drawnAt("above"), lights: !!this._reactor3dLights, lightsAt: v && v.drawnAt && v.drawnAt("lights") }); } return out; }; }
const tick = now => {
  const c = rec.cur, progs = r.info.programs;
  const fresh = progs.filter(p => !known.has(p.id));
  for (const p of fresh) known.add(p.id);
  rec.frames.push({ t: now, pix: rec.pix, compile: c.compile, link: c.link, programs: progs.length, map: $gameMap.mapId(), x: +$gamePlayer._realX.toFixed(2),
     calls: r.info.render.calls, fresh: fresh.map(p => p.name + "#" + p.id) });
  rec.frames[rec.frames.length - 1].sh = Reactor3D.Shadows._active;
  if (owners && rec.frames.length % 30 === 0 && !fresh.length) note();
  if (fresh.length && !owners) rec.newProgs.push({ frame: rec.frames.length - 1, list: fresh.map(p => ({ id: p.id, name: p.name, key: p.cacheKey })) });
  if (fresh.length && owners) {
    const ids = new Set(fresh.map(p => p.id)), owners = [];
    const live = Reactor3D.Neighbors.live, root = live && live.scene && live.scene._scene;
    const pathOf = o => { const out = []; for (let n = o; n && out.length < 6; n = n.parent) out.push((n.name || n.type) + (n.userData && n.userData.rrFoliageChunk ? "[fol]" : "")); return out.join("<"); };
    const look = (o, where) => { const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { if (!m) continue; for (const mm of [m, m.__rrUnlitTwin].filter(Boolean)) { const pr = r.properties.get(mm); const progs = []; if (pr.currentProgram) progs.push(pr.currentProgram.id); if (pr.programs) pr.programs.forEach(p => progs.push(p.id));
        for (const id of progs) if (ids.has(id)) owners.push({ id, where, mat: (mm.__rrTwinOf ? "twin:" : "") + mm.type + ":" + (mm.name || ""), path: pathOf(o), vis: o.visible, mv: mm.version, prev: prev.has(mm) ? prev.get(mm) : "new" }); } } };
    if (root) root.traverse(o => { if (o.material) look(o, "scene"); });
    const H = Reactor3D.HalfLight; for (const bag of [H._programs, H._upsamples || {}, H._combines || {}]) for (const k of Object.keys(bag)) { const q = bag[k]; const pr = r.properties.get(q.material); if (pr.currentProgram && ids.has(pr.currentProgram.id)) owners.push({ id: pr.currentProgram.id, where: "halflight", mat: k }); }
    rec.newProgs.push({ frame: rec.frames.length - 1, owners: owners.slice(0, 60), list: fresh.map(p => ({ id: p.id, name: p.name, key: p.cacheKey })) });
  }
  rec.cur = { compile: 0, link: 0 };
  if (!rec.stop) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
done({ programs: r.info.programs.length });`;

const COLLECT = `
const rec = window.__rrCross; rec.stop = true; window.__rrCross = null;
const all = Reactor3D.viewport()._renderer.info.programs.map(p => ({ id: p.id, name: p.name, key: p.cacheKey }));
return { frames: rec.frames, newProgs: rec.newProgs, markAt: rec.markAt, all };`;

function analyze(profile, res, label) {
  const f = res.frames, d = f.slice(1).map((v, i) => ({ i: i + 1, ms: v.t - f[i].t, ...v }));
  const sorted = d.map(x => x.ms).sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  const crossAt = d.findIndex((x, i) => i > 0 && x.map !== d[i - 1].map);
  const steady = d.filter(x => x.ms < 100).map(x => x.ms).sort((a, b) => a - b);
  const lines = [`== ${label}: frames ${d.length}, median ${med.toFixed(1)} ms, p95 ${sorted[Math.floor(sorted.length * .95)].toFixed(1)}, max ${sorted[sorted.length - 1].toFixed(1)}, frames>25ms ${d.filter(x => x.ms > 25).length}, >50 ${d.filter(x => x.ms > 50).length}`];
  if (crossAt >= 0) {
    lines.push(`crossing frame index ${crossAt}:`);
    for (let i = Math.max(0, crossAt - 4); i < Math.min(d.length, crossAt + 8); i++) { const x = d[i]; lines.push(`  ${i === crossAt ? ">" : " "}#${i} ${x.ms.toFixed(1)} ms ${x.pix ? "pix " + x.pix.join("/") + " " : ""}sh ${x.sh} map ${x.map} x ${x.x} compiles ${x.compile} links ${x.link} programs ${x.programs} calls ${x.calls} ${x.fresh.length ? "NEW " + x.fresh.join(",") : ""}`); }
  }
  for (const x of d.filter(x => x.ms > 25)) lines.push(`  long #${x.i} ${x.ms.toFixed(1)} ms map ${x.map} x ${x.x} compiles ${x.compile} links ${x.link} new ${x.fresh.join(",")}`);
  for (const n of res.newProgs) for (const o of (n.owners || [])) lines.push(`    owner f${n.frame} prog ${o.id} ${o.where} ${o.mat} ${o.path || ""} vis ${o.vis} prev ${o.prev}`);
  const totalNew = res.newProgs.reduce((s, n) => s + n.list.length, 0);
  lines.push(`new programs during run: ${totalNew}; compiles total ${d.reduce((s, x) => s + x.compile, 0)}`);
  if (profile) {
    const byId = new Map(profile.nodes.map(n => [n.id, n])); const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
    const stamps = []; let t = profile.startTime; for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] || 0; stamps.push(t); }
    const mi = profile.samples.findIndex(id => byId.get(id).callFrame.functionName === "__rrPerfMarker");
    if (mi >= 0) {
      const offset = stamps[mi] / 1000 - res.markAt;
      const name = id => { const cf = byId.get(id).callFrame; return `${cf.functionName || "(anon)"} ${path.basename(cf.url || "") || "(native)"}:${cf.lineNumber + 1}`; };
      for (const x of d.filter(x => x.ms > 30 && x.i > 5)) {
        const from = (f[x.i - 1].t + offset) * 1000, to = (f[x.i].t + offset) * 1000; const self = new Map(), incl = new Map();
        for (let s = 0; s < stamps.length; s++) { if (stamps[s] < from || stamps[s] >= to) continue; const dt = (profile.timeDeltas[s + 1] || 0) / 1000;
          const k = name(profile.samples[s]); self.set(k, (self.get(k) || 0) + dt); const seen = new Set(); let id = profile.samples[s];
          while (id !== undefined) { const kk = name(id); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + dt); } id = parent.get(id); } }
        const top = (m, n) => [...m.entries()].filter(([k]) => !/^\(root\)|^\(program\)|^\(idle\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1)}ms ${k}`);
        lines.push(`  profile #${x.i} ${x.ms.toFixed(1)} ms\n    self: ${top(self, 10).join(" | ")}\n    incl: ${top(incl, 30).join(" | ")}`);
      }
    }
  }
  return lines.join("\n");
}

async function main() {
  const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "rr-crossing-prof-"));
  const driver = new WebDriverClient(path.join(REPO, { win32: "nwjs-win", darwin: "nwjs-mac" }[process.platform] || "nwjs-linux", "chromedriver" + (process.platform === "win32" ? ".exe" : "")), { env: { ...process.env } });
  const report = [];
  try {
    await driver.start();
    await driver.createSession({ browserName: "chrome", "goog:chromeOptions": { args: [`nwapp=${project}`, `user-data-dir=${path.join(temp, "profile")}`, "no-first-run", "no-default-browser-check",
      "disable-backgrounding-occluded-windows", "disable-renderer-backgrounding", "disable-background-timer-throttling", "mute-audio",
      ...(process.env.RR_PERF_CHROME_ARGS || "").split(/\s+/).filter(Boolean)] } });
    await driver.setScriptTimeout(180000);
    await cdp(driver, "Runtime.enable");
    await cdp(driver, "Emulation.setFocusEmulationEnabled", { enabled: true });
    await driver.waitForScript("return Boolean(window.SceneManager && SceneManager._scene && !(SceneManager._scene instanceof Scene_Boot) && Graphics.width > 0);", [], { timeout: 90000, description: "title" });
    const FROM = Number(option("from", 5)), START_X = Number(option("start-x", FROM === 8 ? 20 : 172));
    const boot = await driver.executeAsync(BOOT, [Number(option("row", 38)), START_X, FROM]);
    console.log("boot", JSON.stringify(boot)); if (boot.error) throw new Error(boot.error);
    const settle = async label => {
      const t0 = Date.now(); let ok = 0, s;
      while (Date.now() - t0 < 120000) { await sleep(500); s = await driver.execute(SETTLED); ok = !s.busy && !s.hidden && s.bodies ? ok + 1 : 0; if (ok >= 6) break; }
      console.log("settled", label, Math.round((Date.now() - t0) / 1000) + "s", JSON.stringify(s));
    };
    const throttle = Number(option("throttle", 1));
    const KEYS = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40 };
    const press = (key, type) => cdp(driver, "Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: KEYS[key] });
    // Which arrow walks east / west with this map's camera.
    const toward = {};
    await sleep(2000);
    for (const key of Object.keys(KEYS)) {
      const a = await driver.execute("return [$gamePlayer._realX, $gamePlayer._realY]");
      await press(key, "rawKeyDown"); await sleep(400); await press(key, "keyUp"); await sleep(600);
      const b = await driver.execute("return [$gamePlayer._realX, $gamePlayer._realY]");
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) toward.east = key; if (Math.abs(dx) > Math.abs(dy) && dx < 0) toward.west = key;
      await driver.execute("$gamePlayer.locate(" + START_X + "," + boot.y + ")");
    }
    console.log("keys", JSON.stringify(toward));
    const leg = async (key, code, label, until) => {
      await settle(label);
      if (flag("profile")) { await cdp(driver, "Profiler.enable"); await cdp(driver, "Profiler.setSamplingInterval", { interval: 250 }); await cdp(driver, "Profiler.start"); }
      await driver.executeAsync(INSTALL, [flag("owners"), flag("pixels")]);
      if (throttle > 1) await cdp(driver, "Emulation.setCPUThrottlingRate", { rate: throttle });
      await sleep(1500);
      await press(key, "rawKeyDown");
      const t0 = Date.now();
      let reached = false;
      while (Date.now() - t0 < 60000) { await sleep(200); if ((reached = await driver.execute(until))) break; }
      if (!reached) console.log("STUCK", label, JSON.stringify(await driver.execute("const i = $gameMap._interpreter; return { map: $gameMap.mapId(), x: $gamePlayer._realX, y: $gamePlayer._realY, running: $gameMap.isEventRunning(), ev: i && i._eventId, msg: $gameMessage.isBusy(), text: ($gameMessage._texts || []).join('|').slice(0, 200), scene: SceneManager._scene && SceneManager._scene.constructor.name, can: $gamePlayer.canMove(), tr: $gamePlayer.isTransferring(), dir: Input.dir4, fight: !!(typeof $gameFight !== 'undefined' && $gameFight && $gameFight.isHere && $gameFight.isHere()), cross: !!Reactor3D.Neighbors.crossing, evAt: $gameMap.eventsXy(Math.round($gamePlayer._realX) + 1, Math.round($gamePlayer._realY)).map(e => e.eventId() + ':' + e.event().name + ':' + (e.page() ? e.page().trigger : '-')) }")));
      await sleep(1500);
      await press(key, "keyUp");
      await sleep(1500);
      if (throttle > 1) await cdp(driver, "Emulation.setCPUThrottlingRate", { rate: 1 });
      const prof = flag("profile") ? (await cdp(driver, "Profiler.stop")).profile : null;
      const res = await driver.execute(COLLECT);
      fs.writeFileSync(path.join(out, label + ".json"), JSON.stringify(res));
      if (prof) fs.writeFileSync(path.join(out, label + ".cpuprofile"), JSON.stringify(prof));
      const text = analyze(prof, res, label);
      console.log(text); report.push(text);
    };
    const east = () => leg(toward.east, toward.east, "east-5to8", "return $gameMap.mapId() === 8 && $gamePlayer.x >= 10;");
    const west = () => leg(toward.west, toward.west, "west-8to5", "return $gameMap.mapId() === 5 && $gamePlayer.x <= 189;");
    if (FROM === 8) { await west(); await east(); } else { await east(); await west(); }
    const errs = await driver.execute("return (window.__rrErrors || [])");
    console.log("reuse", JSON.stringify(await driver.execute("return window.__rrReuse || null")));
    console.log("page errors", errs.length, JSON.stringify(errs.slice(0, 5)).slice(0, 3000));
    console.log("error printer", JSON.stringify(await driver.execute("return Graphics._errorPrinter ? Graphics._errorPrinter.innerText : ''")).slice(0, 2000));
  } finally {
    fs.writeFileSync(path.join(out, "report.txt"), report.join("\n\n"));
    await driver.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
