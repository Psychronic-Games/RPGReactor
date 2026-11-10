//=============================================================================
// reactor_main.js — RPG Reactor runtime entry point
// RPG Reactor runtime version: 0.99.5
// RPG Reactor runtime revision: 20261110.10
// The same stamp, reachable from the F12 console: which engine is this
// window actually running? Type RPG_REACTOR_RUNTIME_REVISION to see.
globalThis.RPG_REACTOR_RUNTIME_REVISION = "20261110.10";
//=============================================================================

const scriptUrls = [
    "js/libs/pixi.js",
    "js/libs/pixi_compat.js",
    "js/libs/pako.min.js",
    "js/libs/lz-string.js",
    "js/libs/localforage.min.js",
    "js/libs/effekseer.min.js",
    "js/libs/vorbisdecoder.js",
    "js/reactor_json.js",
    "js/reactor_core.js",
    "js/reactor_core_display.js",
    "js/reactor_core_io.js",
    "js/reactor_features.js",
    // Small; declares the namespace and reads map mode. three.js itself is
    // ~2 MB and loads on demand from Reactor3D.ensureLoaded(), so a project
    // with no 3D maps never downloads it.
    "js/reactor_3d.js",
    "js/reactor_3d_lighting.js",
    "js/reactor_3d_models.js",
    "js/reactor_3d_effects.js",
    "js/reactor_3d_world.js",
    "js/reactor_3d_speech.js",
    "js/reactor_3d_foliage.js",
    "js/reactor_3d_doors.js",
    "js/reactor_3d_surround.js",
    "js/reactor_3d_vehicles.js",
    "js/reactor_3d_rider.js",
    "js/reactor_rig_motions.js",
    "js/reactor_battle_data.js",
    "js/reactor_battle_room.js",
    "js/reactor_managers.js",
    "js/reactor_hdr_overlay.js",
    "js/reactor_objects.js",
    "js/reactor_objects_actions.js",
    "js/reactor_objects_battlers.js",
    "js/reactor_objects_map.js",
    "js/reactor_objects_interpreter.js",
    "js/reactor_objects_followers.js",
    "js/reactor_objects_legacy.js",
    "js/reactor_scenes.js",
    "js/reactor_sprites.js",
    "js/reactor_picture_extensions.js",
    "js/reactor_screen_fx.js",
    "js/reactor_media_surfaces.js",
    "js/reactor_windows.js",
    "js/reactor_ui_victory.js",
    "js/reactor_ui_fight.js",
    "js/reactor_ui_action.js",
    "js/reactor_ui.js",
    "js/reactor_quests.js",
    "js/reactor_image_layers.js",
    "js/reactor_controls.js",
    "js/reactor_physics.js",
    "js/reactor_mv_compat.js",
    "js/reactor_battle_presentation.js",
    "js/reactor_battle_events.js",
    "js/reactor_fight_look.js",
    "js/reactor_fight.js",
    "js/reactor_fight_flow.js",
    "js/reactor_fight_tactical.js",
    "js/reactor_fight_stage.js",
    "js/reactor_fight_camera.js",
    "js/reactor_fight_action.js",
    "js/reactor_fight_menu.js",
    "js/reactor_fight_classic.js",
    "js/reactor_speaker_face.js",
    "js/reactor_character_creator.js",
    "js/reactor_online.js",
    "js/reactor_online_ui.js",
    "js/reactor_online_voice.js",
    "js/reactor_online_party.js",
    "js/reactor_online_battle.js",
    "js/reactor_online_classic.js",
    "js/reactor_online_action.js",
    // Vehicles: the last engine files, after every battle file, in this order (each wraps what the
    // files above left: a battle's start outermost, and the ride's camera laid over the battle
    // drivers'). None of them wraps the boot scene's start or the Show Text command, which the
    // speaker's face above keeps outermost.
    "js/reactor_vehicles.js",
    "js/reactor_vehicles_drive.js",
    "js/reactor_vehicles_feel.js",
    "js/reactor_vehicles_hints.js",
    "js/reactor_vehicles_mount.js",
    "js/reactor_plugins.js"
];
const effekseerWasmUrl = "js/libs/effekseer.wasm";

//-----------------------------------------------------------------------------
// ReactorBackend
//
// The graphics backend this machine runs the game best on, found by playing.
//
// Under Windows the browser can reach the graphics card three ways (Direct3D 11,
// its default; Direct3D 11 on 12; OpenGL), and which is fastest is the machine's
// own business: on an Intel Iris Xe laptop (2026-11-10) the same picture ran at
// 41-45 frames a second on the first, 46-49 on the second and 54-60 on the third,
// and Auto held 60 at nine tenths of the picture's size on OpenGL where Direct3D
// 11 reached it only with every level given up. Other machines differ (a card
// with a poor OpenGL driver; one where the default is already the best), so
// nothing is assumed from a card's name: each backend is judged by what Auto's
// windows of play say on it (`note`, from Reactor3D.Quality).
//
//   - A backend that holds the wanted rate near the full picture (`HOLDS`) is
//     kept, and no other is ever tried: a machine that runs well is left alone.
//   - Otherwise the next launch tries the next backend (`plan`), a minute and a
//     half of play each, and the best is kept if it beats the default by `MARGIN`.
//   - A backend that does not start, or shows an empty picture, is marked failed
//     and not tried again (`pending`, `checkPicture`).
//
// What is learned is kept per graphics card in the user's own folder
// (%LOCALAPPDATA%\RPGReactor\graphics-backend.json), outside any project, so a
// project shared between machines carries nothing of one into another, and the
// editor's playtests read the same plan (PlaytestManager). A game started on
// another backend than its plan starts itself again with it (`relaunch`: about a
// second and a half); one the editor started never does (it is the editor's
// process to watch). Off for a project that names its own `--use-angle`, or
// with `"reactorAngle": "default"` in its package.json, and under automation.
//-----------------------------------------------------------------------------
const ReactorBackend = {
    VERSION: 1,
    /** The backends in the order they are tried; the first is the one a plain launch gets. */
    ORDER: ["d3d11", "d3d11on12", "gl"],
    /**
     * The order the others are tried in by a machine that struggles: OpenGL before Direct3D 11 on 12. On the laptop
     * (Iris Xe) walking North Haven at the same levels is 68 frames a second on OpenGL against 41 on Direct3D 11
     * (2026-11-10), and 11 on 12 gave 46 to 49 against 41 to 45.
     */
    TRY: ["d3d11", "gl", "d3d11on12"],
    /** A backend ahead of the first by this much on the same maps is chosen at once. */
    CLEAR_GAP: 0.2,
    /** Windows of one map on each of two backends from which that map is compared; the maps kept for each backend. */
    PAIR_WINDOWS: 8,
    MAX_MAPS: 8,
    /** Windows of play (two seconds each) before a backend is judged. */
    MIN_WINDOWS: 45,
    /** A backend plainly worse than the best known is judged after this many. */
    EARLY_WINDOWS: 15,
    EARLY_GAP: 0.15,
    /** The score from which a backend is kept without trying another. */
    HOLDS: 0.9,
    /** What another backend must beat the first by to replace it. */
    MARGIN: 0.05,
    /** A score is the share of the wanted rate held, less this for each quality level given up, less MISS_COST of the share of frames shown too long. */
    LEVEL_COST: 0.03,
    MISS_COST: 0.5,
    /** Each window counts this much of the one before, so a score follows the last two minutes or so. */
    DECAY: 0.985,
    SAVE_EVERY: 15,
    MAX_TRIES: 2,
    MAX_HOPS: 2,
    _store: null, _entry: null, _key: null, _current: null, _host: "game", _live: false, _dirty: 0, _confirmed: false, _blank: 0,

    /** The backend a WebGL renderer string names; null where it is none of these (another system, software drawing). */
    current(renderer) {
        const s = String(renderer || "");
        if (/Direct3D11on12/i.test(s)) return "d3d11on12";
        if (/Direct3D11/i.test(s)) return "d3d11";
        if (/OpenGL/i.test(s) && /^ANGLE/i.test(s)) return "gl";
        return null;
    },
    /** The graphics card a renderer string names, whatever backend it is reached through. */
    gpuKey(renderer) {
        let s = String(renderer || "").trim().replace(/^ANGLE \(/i, "").replace(/\)$/, "");
        const comma = s.indexOf(",");
        const vendor = comma >= 0 ? s.slice(0, comma).trim() : "";
        let device = comma >= 0 ? s.slice(comma + 1).trim() : s;
        device = device.replace(/\s*\(0x[0-9a-f]+\).*$/i, "").replace(/\s+Direct3D.*$/i, "").replace(/,\s*(OpenGL|Vulkan|Metal|D3D).*$/i, "").trim();
        return (vendor + "|" + device).toLowerCase();
    },
    /** What a backend's windows of play come to: 1 is the wanted rate held at the full picture with no frame late. */
    score(record) {
        if (!record || !(record.weight > 0)) return null;
        return record.rate / record.weight - this.LEVEL_COST * record.levels / record.weight - this.MISS_COST * record.missed / record.weight;
    },
    /**
     * `a` against `b` on the maps both were played on (PAIR_WINDOWS of each at least): how far ahead `a` is, each
     * map weighed by the play there, and how many windows that rests on. A session in a heavy town and one in a
     * light room say nothing of two backends against each other; the same map on both does.
     */
    paired(a, b) {
        let gap = 0, weight = 0, windows = 0;
        const ma = a && a.maps || {}, mb = b && b.maps || {};
        for (const id of Object.keys(ma)) {
            const x = ma[id], y = mb[id];
            if (!y || !(x.windows >= this.PAIR_WINDOWS) || !(y.windows >= this.PAIR_WINDOWS)) continue;
            const w = Math.min(x.weight, y.weight);
            gap += w * (this.score(x) - this.score(y)); weight += w; windows += Math.min(x.windows, y.windows);
        }
        return { gap: weight > 0 ? gap / weight : 0, windows };
    },
    /** Whether `name` and the first backend have been played on the same maps enough to be compared there. */
    likeForLike(entry, name) {
        const backends = entry.backends || {};
        return this.paired(backends[name], backends[this.ORDER[0]]).windows >= this.EARLY_WINDOWS;
    },
    /** How far `name` is ahead of the first backend: on the maps both were played on where that is enough, else over all their play; null where either is unknown. */
    ahead(entry, name) {
        const backends = entry.backends || {}, first = this.ORDER[0];
        if (name === first) return 0;
        const pair = this.paired(backends[name], backends[first]);
        if (pair.windows >= this.EARLY_WINDOWS) return pair.gap;
        const a = this.score(backends[name]), b = this.score(backends[first]);
        return a === null || b === null ? null : a - b;
    },
    /**
     * The backend the next launch should run on, from what is known of this card (`entry`); settles `entry.choice`
     * when it can. In order: one that holds near the full picture is kept; one plainly ahead of the first on the
     * same maps is chosen at once (two launches for a machine like the laptop, where it took four and a session on
     * a slower backend on the way); one under way is finished; one that looks like holding is stayed on; the next
     * never tried (TRY); then the close ones are played out and the best kept if it beats the first.
     */
    plan(entry) {
        const failed = entry.failed || [], backends = entry.backends || {};
        const usable = this.ORDER.filter(name => !failed.includes(name));
        if (!usable.length) return this.ORDER[0];
        const first = usable[0];
        const windows = name => (backends[name] ? backends[name].windows || 0 : 0), score = name => this.score(backends[name]);
        const ahead = name => { const a = this.ahead(entry, name); return a === null ? -Infinity : a; };
        // A choice played out and found behind the first after all is thought over again.
        if (entry.choice && entry.choice !== first && windows(entry.choice) >= this.MIN_WINDOWS && windows(first) >= this.EARLY_WINDOWS
            && ahead(entry.choice) < -this.MARGIN) entry.choice = null;
        if (entry.choice && usable.includes(entry.choice)) return entry.choice;
        entry.choice = null;
        const known = usable.filter(name => windows(name) >= this.EARLY_WINDOWS), byScore = (a, b) => score(b) - score(a);
        // Holding near the full picture: kept, and nothing else is tried (the first before any other).
        const holders = known.filter(name => windows(name) >= this.MIN_WINDOWS && score(name) >= this.HOLDS).sort(byScore);
        if (holders.length) return (entry.choice = holders.includes(first) ? first : holders[0]);
        // Plainly ahead of the first on the same maps: chosen now, the rest left untried.
        if (known.includes(first)) {
            const clear = known.filter(name => name !== first && this.likeForLike(entry, name) && ahead(name) >= this.CLEAR_GAP).sort((a, b) => ahead(b) - ahead(a));
            if (clear.length) return (entry.choice = clear[0]);
        }
        // One under way is finished first.
        const under = usable.filter(name => windows(name) > 0 && windows(name) < this.EARLY_WINDOWS).sort((a, b) => windows(b) - windows(a));
        if (under.length) return under[0];
        // One that looks like holding is stayed on until it is judged.
        const promising = known.filter(name => score(name) >= this.HOLDS).sort(byScore);
        if (promising.length) return promising.includes(first) ? first : promising[0];
        // The next never tried.
        const fresh = this.TRY.filter(name => usable.includes(name) && windows(name) === 0);
        if (fresh.length) return fresh[0];
        // All tried: those not plainly behind are played out, the furthest ahead first.
        const lead = Math.max(...known.map(ahead));
        const close = known.filter(name => windows(name) < this.MIN_WINDOWS && ahead(name) >= lead - this.EARLY_GAP).sort((a, b) => ahead(b) - ahead(a));
        if (close.length) return close[0];
        // All judged: the best, if it beats the first by the margin.
        const best = known.filter(name => name !== first && windows(name) >= this.MIN_WINDOWS).sort((a, b) => ahead(b) - ahead(a))[0];
        return (entry.choice = best && ahead(best) > this.MARGIN ? best : first);
    },
    /** `name` cannot be had or does not draw on this card: never planned again. */
    markFailed(entry, name) {
        if (!name || name === this.ORDER[0]) return;
        entry.failed = entry.failed || [];
        if (!entry.failed.includes(name)) entry.failed.push(name);
        if (entry.choice === name) entry.choice = null;
        if (entry.pending && entry.pending.backend === name) entry.pending = null;
    },
    /** A launch onto `name` is about to be made (or has been, by the editor): counted until its picture is seen. */
    expect(entry, name) {
        if (name === this.ORDER[0]) { entry.pending = null; return; }
        const tries = entry.pending && entry.pending.backend === name ? (entry.pending.tries || 0) + 1 : 1;
        entry.pending = { backend: name, tries };
    },
    /** A launch onto a backend whose picture was never seen, `MAX_TRIES` times: failed. Returns whether it was. */
    settlePending(entry, current, marked) {
        const p = entry.pending;
        if (!p) return false;
        // This launch is that try itself (the relaunch, or the editor's): judged when its picture is, or at the next launch.
        if (marked && p.backend === current && p.tries <= this.MAX_TRIES) return false;
        if (p.tries >= this.MAX_TRIES) { this.markFailed(entry, p.backend); return true; }
        return false;
    },
    entryOf(store, key) {
        store.gpus = store.gpus || {};
        const entry = store.gpus[key] || (store.gpus[key] = { backends: {}, failed: [], choice: null, pending: null });
        entry.backends = entry.backends || {};
        entry.failed = entry.failed || [];
        return entry;
    },
    argOf(args, name) {
        const prefix = "--" + name + "=", found = (args || []).find(a => String(a).startsWith(prefix));
        return found ? String(found).slice(prefix.length) : null;
    },

    //-- the machine --------------------------------------------------------

    /** What this needs of the host (NW.js under Windows, started by a person or the editor), or null: then it does nothing. */
    env() {
        try {
            if (typeof nw !== "object" || typeof process !== "object" || process.platform !== "win32" || typeof require !== "function") return null;
            const manifest = nw.App.manifest || {}, args = nw.App.fullArgv || [];
            // Not under automation, unless a test says so itself (it then only records, as under the editor).
            const host = this.argOf(args, "rr-angle-host");
            if (typeof navigator !== "undefined" && navigator.webdriver && host !== "test") return null;
            if (manifest.reactorAngle === "default") return null;
            const own = /--use-angle=/.test(String(manifest["chromium-args"] || ""));
            const marked = this.argOf(args, "rr-angle");
            // A backend someone else chose (the project, a person at a command line) is theirs.
            if (own || (this.argOf(args, "use-angle") !== null && marked === null)) return null;
            return { args, marked, host: host === "editor" || host === "test" ? "editor" : "game", hops: Number(this.argOf(args, "rr-hop")) || 0,
                fs: require("fs"), path: require("path"), cp: require("child_process") };
        } catch (error) { return null; }
    },
    file(env) {
        const base = process.env.LOCALAPPDATA || process.env.APPDATA || require("os").homedir();
        return env.path.join(base, "RPGReactor", "graphics-backend.json");
    },
    read(env) {
        try {
            const store = JSON.parse(env.fs.readFileSync(this.file(env), "utf8"));
            if (store && store.version === this.VERSION && typeof store === "object") return store;
        } catch (error) { /* none yet, or not ours */ }
        return { version: this.VERSION, gpus: {} };
    },
    save() {
        const env = this._env;
        if (!env || !this._store || !this._entry) return;
        this._dirty = 0;
        try {
            this._entry.plan = this.plan(this._entry);
            this._entry.updated = Date.now();
            const file = this.file(env);
            env.fs.mkdirSync(env.path.dirname(file), { recursive: true });
            env.fs.writeFileSync(file, JSON.stringify(this._store, null, 1));
        } catch (error) { /* a folder that cannot be written: nothing is learned, nothing breaks */ }
    },
    /** The renderer string of a WebGL context made and let go at once, or "" where there is none. */
    probe() {
        try {
            const gl = document.createElement("canvas").getContext("webgl2");
            if (!gl) return "";
            const info = gl.getExtension("WEBGL_debug_renderer_info");
            const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
            const lose = gl.getExtension("WEBGL_lose_context");
            if (lose) lose.loseContext();
            return String(name || "");
        } catch (error) { return ""; }
    },
    /**
     * At the page's start, before anything is loaded: whether this window is giving way to one on the planned
     * backend (true: nothing more is to be done here).
     */
    boot() {
        const env = this.env();
        if (!env) return false;
        this._env = env; this._host = env.host;
        const store = this.read(env), renderer = this.probe();
        if (!renderer) {
            // No WebGL at all on a backend this asked for: it is failed for the card last seen, and the default is started.
            if (env.marked && env.marked !== this.ORDER[0] && store.last && env.host === "game" && env.hops < this.MAX_HOPS) {
                const entry = this.entryOf(store, store.last);
                this.markFailed(entry, env.marked);
                this._store = store; this._entry = entry; this.save();
                return this.relaunch(this.ORDER[0]);
            }
            return false;
        }
        const current = this.current(renderer);
        if (!current) return false;
        const key = this.gpuKey(renderer), entry = this.entryOf(store, key);
        this._store = store; this._entry = entry; this._key = key; this._current = current; this._live = true;
        store.last = key;
        // A backend asked for that the browser did not give cannot be had here.
        if (env.marked && env.marked !== current) this.markFailed(entry, env.marked);
        if (env.host === "editor" && env.marked === current) this.expect(entry, current);
        this.settlePending(entry, current, env.marked === current);
        const wanted = this.plan(entry);
        if (env.host === "game" && wanted !== current && env.hops < this.MAX_HOPS) {
            this.expect(entry, wanted);
            this.save();
            return this.relaunch(wanted);
        }
        this.save();
        this.watchBoot();
        return false;
    },
    /**
     * A backend being tried counts as started once the game runs on it (two seconds of its frames): without this a
     * player who left from the title screen twice would have failed a backend that works. An empty picture is
     * caught separately, at the first windows of play (`checkPicture`).
     */
    watchBoot() {
        const entry = this._entry, current = this._current;
        if (!entry.pending || entry.pending.backend !== current || typeof setInterval !== "function") return;
        let asked = 0;
        const timer = setInterval(() => {
            if (++asked > 60) { clearInterval(timer); return; }
            if (typeof Graphics === "undefined" || !(Graphics.frameCount > 120)) return;
            clearInterval(timer);
            if (entry.pending && entry.pending.backend === current) { entry.pending = null; this.save(); }
        }, 1000);
    },
    /** This game started again on `name`, once this window has gone. Returns true when it is under way. */
    relaunch(name) {
        const env = this._env;
        try {
            const keep = env.args.filter(a => !/^--(use-angle|rr-angle|rr-hop)=/.test(String(a)));
            // An unpacked game is started with its folder, which the arguments do not carry; a packed one finds its own.
            const main = process.mainModule && process.mainModule.filename ? env.path.dirname(process.mainModule.filename) : "";
            const temp = String(require("os").tmpdir() || "").toLowerCase();
            const folder = main && !keep.some(a => !String(a).startsWith("--")) && !(temp && main.toLowerCase().startsWith(temp)) ? [main] : [];
            const args = [...folder, ...keep, ...(name === this.ORDER[0] ? [] : ["--use-angle=" + name]), "--rr-angle=" + name, "--rr-hop=" + (env.hops + 1)];
            const quote = a => '"' + String(a).replace(/"/g, "") + '"';
            // After a moment: two windows on one profile at once would be taken for a second start of the same game.
            const line = "ping -n 2 127.0.0.1 >nul & start \"\" " + quote(process.execPath) + " " + args.map(quote).join(" ");
            const child = env.cp.spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", '"' + line + '"'], { detached: true, stdio: "ignore", windowsVerbatimArguments: true, windowsHide: true });
            child.unref();
            try { nw.Window.get().hide(); } catch (error) { /* shown a moment longer */ }
            setTimeout(() => nw.App.quit(), 100);
            return true;
        } catch (error) { return false; }
    },
    /** One of Auto's windows of play on a 3D map, from Reactor3D.Quality: { perSecond, wanted, missed, g, c }. */
    note(w) {
        if (!this._live || !w || !(w.wanted > 0)) return;
        const backends = this._entry.backends;
        const record = backends[this._current] || (backends[this._current] = { windows: 0, weight: 0, rate: 0, levels: 0, missed: 0 });
        const d = this.DECAY;
        const add = r => {
            r.weight = r.weight * d + 1;
            r.rate = r.rate * d + Math.min(1, w.perSecond / w.wanted);
            r.levels = r.levels * d + (w.g || 0) + (w.c || 0);
            r.missed = r.missed * d + (w.missed || 0);
            r.windows++;
        };
        add(record);
        // The same, by the map played on: two backends are compared on the maps both have seen (`paired`).
        const id = typeof $gameMap !== "undefined" && $gameMap && typeof $gameMap.mapId === "function" ? Number($gameMap.mapId()) || 0 : (w.map || 0);
        if (id > 0) {
            const maps = record.maps || (record.maps = {});
            add(maps[id] || (maps[id] = { windows: 0, weight: 0, rate: 0, levels: 0, missed: 0 }));
            const ids = Object.keys(maps);
            if (ids.length > this.MAX_MAPS) {
                let least = null;
                for (const k of ids) if (Number(k) !== id && (least === null || maps[k].windows < maps[least].windows)) least = k;
                if (least !== null) delete maps[least];
            }
        }
        if (!this._confirmed) this.checkPicture();
        if (++this._dirty >= this.SAVE_EVERY) this.save();
    },
    /** Whether a grid of the canvas's pixels holds more than one colour (asked just after a frame is drawn). */
    pictureShows() {
        const canvas = typeof Graphics !== "undefined" ? Graphics._canvas : null;
        if (!canvas) return true;
        const small = this._small || (this._small = document.createElement("canvas"));
        small.width = 16; small.height = 9;
        const context = small.getContext("2d", { willReadFrequently: true });
        context.drawImage(canvas, 0, 0, 16, 9);
        const data = context.getImageData(0, 0, 16, 9).data;
        for (let i = 4; i < data.length; i += 4) if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 6) return true;
        return false;
    },
    /** The first windows on a backend: a picture seen confirms it; three windows of one flat colour on any but the first fail it. */
    checkPicture() {
        let shows = true;
        try { shows = this.pictureShows(); } catch (error) { shows = true; }
        if (shows) {
            this._confirmed = true;
            if (this._entry.pending && this._entry.pending.backend === this._current) { this._entry.pending = null; this.save(); }
            return;
        }
        if (++this._blank < 3 || this._current === this.ORDER[0]) return;
        this.markFailed(this._entry, this._current);
        this._live = false;
        this.save();
        if (this._host === "game" && this._env.hops < this.MAX_HOPS) this.relaunch(this.plan(this._entry));
    },
    /** What was learned of this machine is forgotten (the file removed); the next launches start over. */
    reset() {
        const env = this._env || this.env();
        if (!env) return false;
        try { env.fs.rmSync(this.file(env), { force: true }); } catch (error) { return false; }
        if (this._entry) { this._entry.backends = {}; this._entry.failed = []; this._entry.choice = null; this._entry.pending = null; }
        return true;
    }
};
// (the end of ReactorBackend)

class Main {
    constructor() {
        this.xhrSucceeded = false;
        this.loadCount = 0;
        this.error = null;
    }

    run() {
        this.showLoadingSpinner();
        // This machine's own graphics backend: a game started on another gives way to one started on it (ReactorBackend).
        if (ReactorBackend.boot()) return;
        this.testXhr();
        this.hookNwjsClose();
        // Plugins check for WebGL as they load (UltraMode7 turns itself off without it), so the wait comes first.
        this.waitForWebGL(() => this.loadMainScripts());
    }

    /**
     * WebGL that is there in a moment: a graphics driver that refuses the GPU process for a second (it ran out of
     * GPU channels, a reset) left the game stopped at "Your browser does not support WebGL" while the next try
     * would have had it. Asked every half second for ten seconds, each test context given back at once; then one
     * reload of the page (a new page asks for a new GPU process); then on, to the usual message.
     */
    waitForWebGL(then) {
        const probe = () => {
            try {
                const canvas = document.createElement("canvas");
                const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
                if (!gl) return false;
                const lose = gl.getExtension("WEBGL_lose_context");
                if (lose) lose.loseContext();
                return true;
            } catch (error) {
                return false;
            }
        };
        if (probe()) { then(); return; }
        const key = "rrWebGLReloaded", started = Date.now();
        const retry = () => {
            if (probe()) {
                try { sessionStorage.removeItem(key); } catch (error) { /* none kept */ }
                console.warn("WebGL came back after " + (Date.now() - started) + " ms.");
                then();
                return;
            }
            if (Date.now() - started < 10000) { setTimeout(retry, 500); return; }
            let reloaded = false;
            try { reloaded = sessionStorage.getItem(key) === "1"; } catch (error) { reloaded = true; }
            if (!reloaded) {
                try { sessionStorage.setItem(key, "1"); } catch (error) { /* reload once regardless */ }
                location.reload();
                return;
            }
            try { sessionStorage.removeItem(key); } catch (error) { /* none kept */ }
            then();
        };
        console.warn("WebGL is not available yet; trying again for a few seconds.");
        setTimeout(retry, 500);
    }

    showLoadingSpinner() {
        const loadingSpinner = document.createElement("div");
        const loadingSpinnerImage = document.createElement("div");
        loadingSpinner.id = "loadingSpinner";
        loadingSpinnerImage.id = "loadingSpinnerImage";
        loadingSpinner.appendChild(loadingSpinnerImage);
        document.body.appendChild(loadingSpinner);
    }

    eraseLoadingSpinner() {
        const loadingSpinner = document.getElementById("loadingSpinner");
        if (loadingSpinner) {
            document.body.removeChild(loadingSpinner);
        }
    }

    testXhr() {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", document.currentScript.src);
        xhr.onload = () => (this.xhrSucceeded = true);
        xhr.send();
    }

    hookNwjsClose() {
        // [Note] When closing the window, the NW.js process sometimes does
        //   not terminate properly. This code is a workaround for that.
        if (typeof nw === "object") {
            // (What this session learned of the graphics backend is written first: ReactorBackend.)
            nw.Window.get().on("close", () => { try { if (ReactorBackend._live && ReactorBackend._dirty) ReactorBackend.save(); } catch (error) { /* as it was */ } nw.App.quit(); });
        }
    }

    loadMainScripts() {
        for (const url of scriptUrls) {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;
            script.async = false;
            script.defer = true;
            script.onload = this.onScriptLoad.bind(this);
            script.onerror = this.onScriptError.bind(this);
            script._url = url;
            script._rrMain = true;
            document.body.appendChild(script);
        }
        this.numScripts = scriptUrls.length;
        // After a wait for WebGL the page's load event has already passed: the start follows the scripts instead.
        this.lateStart = document.readyState === "complete";
        if (!this.lateStart) window.addEventListener("load", this.onWindowLoad.bind(this));
        window.addEventListener("error", this.onWindowError.bind(this));
    }

    onScriptLoad() {
        if (++this.loadCount === this.numScripts) {
            PluginManager.setup($plugins);
            if (this.lateStart) this.afterPluginScripts(() => this.onWindowLoad());
        }
    }

    /** Once every plugin script just added has loaded or failed, as the load event would have waited. */
    afterPluginScripts(then) {
        const scripts = [...document.querySelectorAll("script")].filter(script => script._url && !script._rrMain && !script._rrSettled);
        let left = scripts.length;
        if (!left) { then(); return; }
        const settle = script => () => {
            if (script._rrSettled) return;
            script._rrSettled = true;
            if (--left === 0) then();
        };
        for (const script of scripts) {
            script.addEventListener("load", settle(script));
            script.addEventListener("error", settle(script));
        }
    }

    onScriptError(e) {
        this.printError("Failed to load", e.target._url);
    }

    printError(name, message) {
        this.eraseLoadingSpinner();
        if (!document.getElementById("errorPrinter")) {
            const errorPrinter = document.createElement("div");
            errorPrinter.id = "errorPrinter";
            errorPrinter.innerHTML = this.makeErrorHtml(name, message);
            document.body.appendChild(errorPrinter);
        }
    }

    makeErrorHtml(name, message) {
        const nameDiv = document.createElement("div");
        const messageDiv = document.createElement("div");
        nameDiv.id = "errorName";
        messageDiv.id = "errorMessage";
        nameDiv.innerHTML = name;
        messageDiv.innerHTML = message;
        return nameDiv.outerHTML + messageDiv.outerHTML;
    }

    onWindowLoad() {
        if (!this.xhrSucceeded) {
            const message = "Your browser does not allow to read local files.";
            this.printError("Error", message);
        } else if (this.isPathRandomized()) {
            const message = "Please move the Game.app to a different folder.";
            this.printError("Error", message);
        } else if (this.error) {
            this.printError(this.error.name, this.error.message);
        } else {
            this.initEffekseerRuntime();
        }
    }

    onWindowError(event) {
        if (!this.error) {
            this.error = event.error;
        }
    }

    isPathRandomized() {
        // [Note] We cannot save the game properly when Gatekeeper Path
        //   Randomization is in effect.
        return (
            typeof process === "object" &&
            process.mainModule.filename.startsWith("/private/var")
        );
    }

    initEffekseerRuntime() {
        const onLoad = this.onEffekseerLoad.bind(this);
        const onError = this.onEffekseerError.bind(this);
        effekseer.initRuntime(effekseerWasmUrl, onLoad, onError);
    }

    onEffekseerLoad() {
        this.eraseLoadingSpinner();
        // v8 only: auto-wrap all PIXI-extending classes so v8's real super
        // constructor runs on each instance (fixes dirty tracking, transforms,
        // animations). No-op on v5/v6/v7.
        if (typeof MZGlobalUpgrade === "function") {
            try { MZGlobalUpgrade(); } catch (e) {
                console.error("MZGlobalUpgrade failed:", e);
            }
        }
        // Project plugins are loaded by this point and may have replaced the
        // SceneManager methods ReactorUI routes. Wrap the final methods just
        // before boot, even when a plugin replaced Scene_Boot without aliasing.
        if (window.ReactorUI && window.ReactorUI.installSceneRouting) {
            window.ReactorUI.installSceneRouting();
        }
        window.ReactorBattlePresentation?.install();
        SceneManager.run(Scene_Boot);
    }

    onEffekseerError() {
        this.printError("Failed to load", effekseerWasmUrl);
    }
}

const main = new Main();
main.run();

//-----------------------------------------------------------------------------
