//=============================================================================
// reactor_online.js — other players on the map
//
// Off unless the project chose Online in Database › Online (data/ReactorOnline.json).
// Every player's machine runs the whole game as usual; this
// file only adds the others as extra characters, which is why plugin-heavy
// games keep working. The server shares information and draws nothing.
// docs/DESIGN-ONLINE.md
//=============================================================================

/** Another player: a character with no will of its own, replaying where that player has been. */
function Game_RemotePlayer() {
    this.initialize(...arguments);
}

Game_RemotePlayer.prototype = Object.create(Game_Character.prototype);
Game_RemotePlayer.prototype.constructor = Game_RemotePlayer;

Game_RemotePlayer.prototype.initialize = function(slot) {
    Game_Character.prototype.initialize.call(this);
    this.slot = slot;
    this.actorId = 0;
    this.playerName = "";
    this.modelId = "";
    this.modelSpec = null;
    this.asleep = false;
    this.fight = "";
    this.inside = false;
    this.vehicle = null;
    this._samples = [];
    this._lateness = [];
    this._delay = ReactorOnline.pollMs() * 2;
    this._lastFrame = 0;
    this._shown = null;
    this._rrMoving = false;
    this._rrDashing = false;
    this.setThrough(true);
    this.setMoveSpeed(4);
};

Game_RemotePlayer.prototype.isMoving = function() {
    return this._rrMoving;
};

Game_RemotePlayer.prototype.isDashing = function() {
    return this._rrDashing;
};

/** A player who signed off, lying where they stopped. Nobody moves them; they stay until they wake. */
Game_RemotePlayer.prototype.setAsleep = function(entry) {
    this.asleep = true;
    this.setLook(entry.actor || 1, (entry.name || "") + " (asleep)");
    this.locate(entry.x, entry.y);
    // On the floor they slept on: a roof's sleeper was drawn in the room under it.
    if (Number.isFinite(entry.g)) this._reactorGround = entry.g;
    this._direction = entry.d || 2;
    this._reactorPosePitch = 1;
};

/** Riding and fighting, as this player's game reports them. Inside a closed vehicle there is no body to draw. */
Game_RemotePlayer.prototype.setState = function(ride, fight) {
    this.fight = String(fight || "");
    const name = ride?.name || "";
    if (name === (this.vehicle?.modelSpec.name || "")) { this.inside = !!ride?.inside; return; }
    this.inside = !!ride?.inside;
    this.vehicle = null;
    const spec = name && typeof Reactor3D !== "undefined" && Reactor3D.normalizeModelSpec ? Reactor3D.normalizeModelSpec(ride) : null;
    if (spec) { this.vehicle = new Game_RemoteVehicle(this, spec); this.vehicle.follow(); }
};

/** Whom this player shows: an actor of the project every player already has. */
Game_RemotePlayer.prototype.setLook = function(actorId, name) {
    this.actorId = actorId;
    this.playerName = name;
    const actor = typeof $dataActors !== "undefined" && $dataActors ? $dataActors[actorId] : null;
    if (actor) this.setImage(actor.characterName, actor.characterIndex);
};

/**
 * A report of where this player was, stamped by their own clock. Arrival times
 * lie: a stalled request delivers late, but the walk it describes happened on
 * time, so playback runs on the sender's clock and only the buffer feels a stall.
 */
Game_RemotePlayer.prototype.addSample = function(sample) {
    const samples = this._samples, last = samples[samples.length - 1];
    if (last) {
        const age = sample.sent - last.sent;
        if (age === 0) return;                          // the same report read twice
        if (age < 0 && age > -60000) return;            // an older one, overtaken
        const distance = Math.hypot(sample.x - last.x, sample.y - last.y);
        // Lag is not a teleport: only a move no runner could make, or a restarted clock, is shown at once.
        if (age < 0 || distance > ReactorOnline.MAX_TILES_PER_SECOND * Math.max(age, 100) / 1000) {
            samples.length = 0;
            this._lateness.length = 0;
            this._shown = null;
        }
    }
    samples.push(sample);
    if (samples.length > 64) samples.shift();
    const lateness = this._lateness;
    lateness.push(sample.arrived - sample.sent);
    if (lateness.length > 30) lateness.shift();
    // The least and the spread are worked out here, where they change: the walk reads both every frame.
    const sorted = lateness.slice().sort((a, b) => a - b);
    this._least = sorted[0];
    this._spread = sorted[Math.floor((sorted.length - 1) * 0.9)] - sorted[0];
};

/** How far behind to play: enough that a report is nearly always here before it is needed. */
Game_RemotePlayer.prototype.targetDelay = function() {
    const poll = ReactorOnline.pollMs();
    if (this._lateness.length < 2) return poll * 2;
    return Math.min(ReactorOnline.MAX_DELAY_MS, Math.max(poll * 2, this._spread + poll * 0.5));
};

/** Replays this player's walk a moment behind them, then eases the shown body onto it. */
Game_RemotePlayer.prototype.advance = function(now) {
    if (this.asleep) return;
    const samples = this._samples;
    if (!samples.length) return;
    const elapsed = Math.min(100, now - (this._lastFrame || now));
    this._lastFrame = now;
    // The delay drifts instead of jumping, so the walk's speed never visibly changes.
    const target = this.targetDelay(), drift = elapsed * 0.25;
    this._delay += Math.max(-drift, Math.min(drift, target - this._delay));
    const offset = this._least;
    const at = now - offset - this._delay;
    while (samples.length > 2 && samples[1].sent <= at) samples.shift();
    const from = samples[0], to = samples[1] || from;
    let x = to.x, y = to.y;
    if (to !== from) {
        const span = to.sent - from.sent, k = (at - from.sent) / span;
        // Out of reports: carry on briefly the way they were heading, then wait.
        const carried = Math.min(k, 1 + ReactorOnline.CARRY_ON_MS / span);
        x = from.x + (to.x - from.x) * carried;
        y = from.y + (to.y - from.y) * carried;
    }
    const shown = this._shown || (this._shown = { x, y });
    // After a stall the body hurries to catch up at a runner's pace: it never covers ground in one frame.
    const gapX = x - shown.x, gapY = y - shown.y, gap = Math.hypot(gapX, gapY);
    if (gap > ReactorOnline.SNAP_TILES) {
        shown.x = x;
        shown.y = y;
    } else if (gap > 0) {
        const step = Math.min(gap * Math.min(1, elapsed / ReactorOnline.EASE_MS), ReactorOnline.CATCH_UP_TILES_PER_SECOND * elapsed / 1000);
        shown.x += gapX / gap * step;
        shown.y += gapY / gap * step;
    }
    const moving = Math.hypot(x - shown.x, y - shown.y) > 0.01 || (to !== from && (to.x !== from.x || to.y !== from.y)) || to.moving;
    this._realX = shown.x;
    this._realY = shown.y;
    this._x = Math.round(to.x);
    this._y = Math.round(to.y);
    this._direction = to.direction;
    this._rrMoving = moving;
    this._rrDashing = to.dashing;
    this._stopCount = moving ? 0 : this._stopCount + 1;
    this.updateAnimation();
    this.vehicle?.follow();
};

/** What another player is riding: only a model following them, since the vehicle itself is on their game alone. */
function Game_RemoteVehicle() {
    this.initialize(...arguments);
}

Game_RemoteVehicle.prototype = Object.create(Game_Character.prototype);
Game_RemoteVehicle.prototype.constructor = Game_RemoteVehicle;

Game_RemoteVehicle.prototype.initialize = function(rider, spec) {
    Game_Character.prototype.initialize.call(this);
    this.rider = rider;
    this.modelSpec = spec;
    this.setThrough(true);
};

Game_RemoteVehicle.prototype.follow = function() {
    const rider = this.rider;
    this._realX = rider._realX;
    this._realY = rider._realY;
    this._x = rider._x;
    this._y = rider._y;
    this._direction = rider._direction;
};

/**
 * The Engine's live connection, when this server has one. Everything a poll would carry
 * comes down it sooner; if it can't be reached, or drops, polling simply carries on.
 */
const ReactorOnlineSocket = {
    OPEN_MS: 2500,
    RETRY_MS: 15000,
    PLACE: 1,
    socket: null,
    address: "",

    connect(address) {
        this.address = address || "";
        if (!this.address || this.socket || this._opening) return;
        let socket;
        try { socket = new WebSocket(this.address); } catch (error) { this.retry(); return; }
        this._opening = socket;
        const timer = setTimeout(() => socket.close(), this.OPEN_MS);
        socket.binaryType = "arraybuffer";
        socket.onclose = () => {
            clearTimeout(timer);
            if (this._opening === socket) this._opening = null;
            if (this.socket === socket) this.socket = null;
            this.retry();
        };
        socket.onopen = () => {
            clearTimeout(timer);
            socket.send(JSON.stringify({ slot: ReactorOnline.slot, nonce: ReactorOnline.nonce, token: ReactorOnline.token }));
        };
        socket.onmessage = event => {
            if (typeof event.data === "string") this.onText(socket, JSON.parse(event.data));
            else ReactorOnline.readSnapshot(event.data);
        };
    },

    retry() {
        clearTimeout(this._retry);
        if (ReactorOnline._running) this._retry = setTimeout(() => this.connect(this.address), this.RETRY_MS);
    },

    onText(socket, message) {
        if (message.t === "ready") {
            this.socket = socket;
            this._opening = null;
            ReactorOnline.setState("online");
            ReactorWorldState.apply(message.world);
            ReactorWorldState.known = message.count;
        } else if (message.t === "w") {
            ReactorWorldState.known = message.count;
            ReactorWorldState.applyChanges(message.changes);
        } else if (message.t === "world") {
            ReactorWorldState.known = message.count;
            ReactorWorldState.apply(message.world);
        } else if (message.t === "bf") {
            ReactorOnlineBattle.receive(message.m, message.from);
        } else if (message.t === "chat") {
            ReactorOnlineChat.onCount(message.count);
        } else if (message.t === "fix") {
            // The server refused a move: back to the last place it agreed with.
            if (message.map === $gameMap?.mapId()) {
                $gamePlayer.locate(Math.round(message.x / 32), Math.round(message.y / 32));
                ReactorOnline._moved = false;
            }
        } else if (message.t === "removed") {
            ReactorOnline.removed(message.message);
        }
    },

    sendPlace(flags, map, x, y, clock) {
        const data = new DataView(new ArrayBuffer(12));
        data.setUint8(0, this.PLACE);
        data.setUint8(1, flags);
        data.setUint16(2, map, true);
        data.setUint16(4, x, true);
        data.setUint16(6, y, true);
        data.setUint32(8, clock, true);
        this.socket.send(data.buffer);
    },

    sendChanges(changes) {
        this.socket.send(JSON.stringify({ t: "set", changes }));
    },

    close() {
        clearTimeout(this._retry);
        this.address = "";
        const socket = this.socket || this._opening;
        this.socket = this._opening = null;
        if (socket) { socket.onclose = null; socket.close(); }
    }
};

const ReactorOnline = {
    API_PATH: "reactor-online/api.php",
    RECORD: 12,
    HEADER: 10,
    STALE_SECONDS: 5,
    MAX_TILES_PER_SECOND: 24,
    CATCH_UP_TILES_PER_SECOND: 13,
    SNAP_TILES: 12,
    MAX_DELAY_MS: 1200,
    CARRY_ON_MS: 300,
    EASE_MS: 70,
    MAX_IN_FLIGHT: 3,
    SNAPSHOT_HEADER: 5,
    SNAPSHOT_RECORD: 11,
    PEER_GONE_MS: 2000,
    NOTE_MS: 5000,
    FIRST_SAVE_MS: 10000,
    SLEEPER_MS: 15000,
    // The nearest sleepers, one to a tile: a pile on one spot shows as one body.
    SLEEPERS_SHOWN: 64,
    WHO_MS: 3000,
    CHUNK_BYTES: 1024 * 1024,
    REQUEST_MS: 15000,
    TRANSFER_MS: 120000,

    state: "off",
    slot: -1,
    peers: new Map(),
    sleepers: new Map(),
    message: "",
    gameStarted: false,
    _running: false,
    _moved: false,
    _mapId: 0,
    _sent: 0,
    _applied: 0,
    _inFlight: 0,

    /** This project's settings, or null when it is a single-player game (or a playtest not asked to connect). */
    config() {
        const config = window.$dataReactorOnline;
        if (!config || !config.enabled) return null;
        const testing = typeof Utils !== "undefined" && Utils.isOptionValid && Utils.isOptionValid("test");
        return testing && !config.playtest ? null : config;
    },

    url() {
        const config = this.config();
        let address = String(config.address || "").trim().replace(/\/+$/, "");
        // (An address typed without its scheme: a build that did not also deploy the server never had it added, and
        // the game asked for a path beside its own page.)
        if (address && !/^[a-z][a-z0-9+.-]*:\/\//i.test(address)) address = "https://" + address;
        return config.url || (address ? address + "/" + this.API_PATH : this.API_PATH);
    },

    pollMs() {
        const config = this.config(), rate = ReactorOnlineSocket.socket ? Number(config?.engine?.rate) || 15 : config && Number(config.updatesPerSecond);
        return 1000 / (rate > 0 ? Math.min(20, rate) : 5);
    },

    /** Everyone to show: those awake and those asleep. */
    everyone() {
        return [...this.peers, ...this.sleepers];
    },

    /** Called as a map scene starts; a game past its title with a server behind it signs in. */
    start() {
        // Removed by the owner, or signed in on another device: that stands until a game is started or loaded again.
        // (Every map scene's start came back here and joined again, taking the other device's place in turn.)
        if (this._running || !this.config() || !this.gameStarted || this._removed) return;
        this._running = true;
        this.setState("connecting");
        if (!this._listening) {
            this._listening = true;
            addEventListener("pagehide", () => { this.noteWhereIAm(true); this.leave(); });
        }
        this.loop();
    },

    request(params) {
        const query = Object.entries(params).map(([key, value]) => key + "=" + encodeURIComponent(value)).join("&");
        return this.url() + "?" + query;
    },

    /** A fetch that ends: one that has not answered and delivered its body in `ms` is given up, so nothing waits on it for ever. */
    ask(url, options, ms) {
        const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms || this.REQUEST_MS) : undefined;
        return fetch(url, signal ? Object.assign({ signal }, options) : options);
    },

    async join() {
        const leader = $gameParty.leader();
        const model = ReactorCharacters.current()?.id || "";
        const answer = await this.post("join", { session: this.account?.session }, { n: leader ? leader.name() : "", c: leader ? leader.actorId() : 0, h: model });
        this.slot = answer.slot;
        this.myName = answer.name || (leader ? leader.name() : "");
        this.nonce = answer.nonce;
        this.token = answer.token;
        ReactorOnlineChat.start(answer.chat);
        ReactorWorldState.start();
        ReactorOnlineSocket.connect(answer.engine);
    },

    /**
     * Reports go out on the beat whether or not the last has answered. A web
     * server can hold one request for a second while it starts a process; the
     * next, on another process, carries the walk on past it.
     */
    async loop() {
        let wait = 0;
        while (this._running) {
            await new Promise(done => setTimeout(done, wait));
            if (!this._running) return;
            try {
                if (this.slot < 0) await this.join();
                this.send();
                ReactorWorldState.flush();
                this.shareState();
                ReactorOnlineParty.keepUp();
                ReactorOnlineParty.followOn();
                ReactorOnlineBattle.keepUp();
                this.keepUp();
                if (performance.now() >= (this._nextSleepers || 0)) { this._nextSleepers = performance.now() + this.SLEEPER_MS; this.fetchSleepers(); }
                wait = this.state === "lost" ? 1000 : this.pollMs();
            } catch (error) {
                // A join the server forbids (banned) is an answer, not a fault to retry every two seconds.
                if (this.slot < 0 && error && error.status === 403) { this.removed(error.message); return; }
                this.setState("lost", error && error.message);
                wait = 2000;
            }
        }
    },

    removed(message) {
        this._running = false;
        this._removed = true;
        // A shared battle hears nothing more once the loop has stopped: it ends here, or it would wait for good.
        try { if (ReactorOnlineBattle.role) ReactorOnlineBattle.onLost(); } catch (error) { console.warn("A shared battle could not be ended.", error); }
        this.peers.clear();
        this.sleepers.clear();
        ReactorOnlineVoice.turnOff();
        ReactorWorldState.stop();
        ReactorOnlineParty.stop();
        this.slot = -1;
        ReactorOnlineSocket.close();
        this.setState("removed", message);
    },

    /** What this player's game is doing, in one number: facing, moving, and what lets it break the usual rules. */
    placeFlags() {
        const player = $gamePlayer, jumping = player.isJumping && player.isJumping();
        const free = jumping || player.isThrough?.() || player.isMoveRouteForcing?.() || player.isInVehicle?.() || !!player._rrBoarded;
        return (player.direction() & 15) | (player.isMoving() ? 16 : 0) | (player.isDashing() ? 32 : 0) | (free ? 128 : 0);
    },

    /** With the Engine connected, a place goes straight down the socket, and needs no answer. */
    sendPlace() {
        const map = typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;
        if (!map || typeof $gamePlayer === "undefined" || !$gamePlayer) return;
        const changedMap = map !== this._mapId, transfer = changedMap || this._moved ? 64 : 0;
        this._moved = false;
        if (changedMap) { this.peers.clear(); this.sleepers.clear(); this._nextSleepers = 0; this._mapId = map; }
        ReactorOnlineSocket.sendPlace(this.placeFlags() | transfer, map, Math.max(0, Math.round($gamePlayer._realX * 32)), Math.max(0, Math.round($gamePlayer._realY * 32)), Math.floor(performance.now()) >>> 0);
    },

    /** The Engine's picture of who is nearby: everyone in it, as a poll would report them. */
    readSnapshot(buffer) {
        const view = new DataView(buffer), count = view.getUint16(1, true), arrived = performance.now();
        if (view.getUint16(3, true) !== this._mapId) return;       // sent before this player changed maps
        for (let i = 0; i < count; i++) {
            const at = this.SNAPSHOT_HEADER + i * this.SNAPSHOT_RECORD, slot = view.getUint16(at, true), flags = view.getUint8(at + 6);
            let peer = this.peers.get(slot);
            if (!peer) this.peers.set(slot, peer = new Game_RemotePlayer(slot));
            peer.lastHeard = arrived;
            peer.addSample({ sent: view.getUint32(at + 7, true), arrived, x: view.getUint16(at + 2, true) / 32, y: view.getUint16(at + 4, true) / 32,
                direction: flags & 15, moving: !!(flags & 16), dashing: !!(flags & 32) });
        }
        // (One no snapshot ever listed has no `lastHeard`: a poll before the socket was ready made it, far from here. It goes too.)
        for (const [slot, peer] of this.peers) if (!(arrived - peer.lastHeard <= this.PEER_GONE_MS)) this.peers.delete(slot);
        this.learnNames();
        this.showStatus();
    },

    send() {
        if (ReactorOnlineSocket.socket) { this.sendPlace(); return; }
        if (this._inFlight >= this.MAX_IN_FLIGHT) return;
        const id = ++this._sent;
        this._inFlight++;
        this.exchange(id).then(() => {
            this.setState("online");
        }, error => {
            if (error && error.status === 401) this.slot = -1;
            // The server's owner removed this player: stop asking, and say so.
            if (error && error.status === 403) { this.removed(error.message); return; }
            this.setState("lost", error && error.message);
        }).finally(() => { this._inFlight--; });
    },

    async exchange(id) {
        const map = typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;
        if (!map || typeof $gamePlayer === "undefined" || !$gamePlayer) return;
        const previous = this._mapId;
        if (map !== previous) { this.peers.clear(); this.sleepers.clear(); this._nextSleepers = 0; this._mapId = map; }
        const player = $gamePlayer;
        const flags = this.placeFlags() & 63;
        const response = await this.ask(this.request({
            a: "sync", s: this.slot, g: this.nonce, t: this.token, m: map, pm: previous, c: Math.floor(performance.now()),
            x: Math.max(0, Math.round(player._realX * 32)), y: Math.max(0, Math.round(player._realY * 32)), f: flags
        }), { cache: "no-store" });
        if (!response.ok) {
            const error = new Error(await response.text());
            error.status = response.status;
            throw error;
        }
        const buffer = await response.arrayBuffer();
        // An answer overtaken by a newer one has nothing to add.
        if (this._mapId === map && id > this._applied) { this._applied = id; this.read(buffer); }
    },

    /** The server's answer: the time, then one record per slot, this map's players among them. */
    read(buffer) {
        const view = new DataView(buffer), now = view.getUint16(0, true), seen = new Set(), arrived = performance.now();
        ReactorOnlineChat.onCount(view.getUint32(2, true));
        ReactorWorldState.onCount(view.getUint32(6, true));
        const count = Math.floor((buffer.byteLength - this.HEADER) / this.RECORD);
        for (let slot = 0; slot < count; slot++) {
            if (slot === this.slot) continue;
            const at = this.HEADER + slot * this.RECORD, stamp = view.getUint16(at + 6, true);
            if (((now - stamp) & 0xffff) > this.STALE_SECONDS) continue;
            const flags = view.getUint16(at + 4, true);
            if (!(flags & 15)) continue;
            let peer = this.peers.get(slot);
            if (!peer) this.peers.set(slot, peer = new Game_RemotePlayer(slot));
            peer.addSample({ sent: view.getUint32(at + 8, true), arrived, x: view.getUint16(at, true) / 32, y: view.getUint16(at + 2, true) / 32,
                direction: flags & 15, moving: !!(flags & 16), dashing: !!(flags & 32) });
            seen.add(slot);
        }
        for (const slot of this.peers.keys()) if (!seen.has(slot)) this.peers.delete(slot);
        this.learnNames();
        this.showStatus();
    },

    /** The vehicle under this player, as a model anyone can draw. Null on foot. */
    rideState() {
        const vehicles = typeof ReactorVehicles !== "undefined" ? ReactorVehicles : null, event = vehicles?.ridden?.();
        const spec = event && typeof Reactor3D !== "undefined" ? Reactor3D.characterModelSpec(event) : null;
        if (!spec) return null;
        const { name, file, ext, size, scale, yaw, pitch, roll, faces } = spec;
        return { name, file, ext, size, scale, yaw, pitch, roll, faces, inside: !!vehicles.riderInside?.(event) };
    },

    /** The kind of battle this player is in, or nothing. */
    fightState() {
        if (typeof $gameFight !== "undefined" && $gameFight?.isHere?.() && !$gameFight._ending) return $gameFight.mode();
        return $gameParty?.inBattle?.() ? "classic" : "";
    },

    /** Others hear of a change, not a stream: riding and fighting begin and end rarely. */
    shareState() {
        if (this.slot < 0 || !$gameMap?.mapId()) return;
        const state = { ride: this.rideState(), fight: this.fightState() }, text = JSON.stringify(state) + $gameMap.mapId();
        if (text === this._stateSent || this._stateSending || $gamePlayer.isTransferring()) return;
        // Where they are, as of arriving: all someone following them needs to come too.
        state.place = { map: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y };
        this._stateSending = true;
        this.post("state", state, { s: this.slot, g: this.nonce, t: this.token })
            .then(() => { this._stateSent = text; }, () => null).finally(() => { this._stateSending = false; });
    },

    /** Names and looks are asked for at once for players not met before, and everyone's now and then: a look, a ride or a battle can change. */
    async learnNames() {
        const now = performance.now(), refresh = now >= (this._nextWho || 0);
        const asked = [...this.peers.values()].filter(peer => refresh || !peer.actorId).map(peer => peer.slot);
        if (!asked.length || this._asking) return;
        if (refresh) this._nextWho = now + this.WHO_MS;
        this._asking = true;
        try {
            const response = await this.ask(this.request({ a: "who", ids: asked.join(",") }), { cache: "no-store" });
            const players = response.ok ? (await response.json()).players : {};
            for (const [slot, player] of Object.entries(players)) {
                const peer = this.peers.get(Number(slot));
                if (!peer) continue;
                peer.setLook(player.actor || 1, player.name || "");
                if (player.model && player.model !== peer.modelId) this.fetchLook(peer, player.model);
                peer.setState(player.ride, player.fight);
            }
        } catch (error) {
            // Asked again with the next exchange.
        } finally {
            this._asking = false;
        }
    },

    stop() {
        this.leave();
        this._running = false;
        ReactorOnlineBattle.leave?.();
        ReactorOnlineVoice.turnOff();
        this.peers.clear();
        this.sleepers.clear();
        ReactorOnlineSocket.close();
        ReactorWorldState.stop();
        ReactorOnlineParty.stop();
        this.slot = -1;
        this._mapId = 0;
        this.setState("off");
    },

    leave() {
        if (this.slot < 0 || !this._mapId) return;
        const url = this.request({ a: "leave", s: this.slot, g: this.nonce, t: this.token, m: this._mapId });
        try { fetch(url, { keepalive: true, cache: "no-store" }); } catch (error) { /* the slot times out instead */ }
    },

    setState(state, message) {
        if (this.state === state && this.message === (message || "")) return;
        this.state = state;
        this.message = message || "";
        this.showStatus();
    },

    /** A small corner label, so a player can see the connection. Database › Online can hide it. */
    showStatus() {
        if (typeof document === "undefined") return;
        const config = this.config();
        let label = this._label;
        if (!label) {
            label = this._label = document.createElement("div");
            label.id = "reactorOnlineStatus";
            label.style.cssText = "position:fixed;right:8px;top:8px;z-index:1000;padding:3px 8px;border-radius:4px;background:rgba(0,0,0,.55);"
                + "color:#fff;font:12px sans-serif;pointer-events:none";
            document.body.appendChild(label);
        }
        const others = this.peers.size;
        label.style.display = this.state === "off" || (config && config.showStatus === false) ? "none" : "";
        label.textContent = this.state === "online" ? "Online: " + (others + 1) + (others ? " players here" : " player here")
            : this.state === "connecting" ? "Connecting…" : this.state === "removed" ? this.message : "Connection lost, retrying… " + this.message;
    },

    /** A game has begun, new or loaded: from here on this player is online. */
    onGameStarted() {
        this.gameStarted = true;
        this._removed = false;
    },

    // ---- Characters ----

    /** Signs in early when a character needs sending before the map opens. */
    async ensureJoined() {
        if (this.slot < 0) await this.join();
    },

    /** Sends a package in pieces, so any host's upload limit is enough. Returns its name on the server. */
    async uploadCharacter(buffer, progress) {
        await this.ensureJoined();
        const id = ReactorCharacters.localId(), size = this.CHUNK_BYTES, count = Math.ceil(buffer.byteLength / size);
        let answer = null;
        for (let index = 0; index < count; index++) {
            const body = buffer.slice(index * size, (index + 1) * size);
            // Plain text, so a desktop build's request needs no separate permission check.
            const response = await this.ask(this.request({ a: "upload", s: this.slot, g: this.nonce, t: this.token, id, i: index, n: count }),
                { method: "POST", body, headers: { "Content-Type": "text/plain" } }, this.TRANSFER_MS);
            if (!response.ok) throw new Error(await response.text());
            answer = await response.json();
            if (progress) progress(Math.round((index + 1) / count * 100));
        }
        return answer.hash;
    },

    /** Tells the server who this player looks like now, and their account, so it follows them. */
    async announceCharacter() {
        const leader = $gameParty.leader(), model = ReactorCharacters.current()?.id;
        if (!this.config()) return;
        // Not joined: no name has been shown yet, and join() takes the one the server gives.
        if (leader && this.slot < 0) this.myName = leader.name();
        if (this.account?.session) await this.post("profile", { session: this.account.session, character: ReactorCharacters.current() }).catch(() => {});
        if (this.slot < 0) return;
        const answer = await this.ask(this.request({ a: "look",s: this.slot, g: this.nonce, t: this.token, n: leader ? leader.name() : "", c: leader ? leader.actorId() : 0, h: model || "" }), { cache: "no-store" })
            .then(response => response.ok ? response.json() : null).catch(() => null);
        // The server may show this player under another name (another's registered name, or one already in use):
        // parties and invites know them by that one. With no answer the name shown is still the one from before.
        if (answer && typeof answer.name === "string" && answer.name) this.myName = answer.name;
    },

    async downloadCharacter(id) {
        const response = await this.ask(this.request({ a: "model", h: id }), undefined, this.TRANSFER_MS);
        if (!response.ok) return null;
        return response.arrayBuffer();
    },

    /**
     * Another player's model, one download at a time. Until it comes they show no body (`_characterModelSpec`): shown
     * as their actor meanwhile, a square of sleepers came up as the Demo's actor and changed into their own one by one.
     * A character that cannot be had (gone from the server, or broken) leaves them their actor.
     */
    fetchLook(peer, id) {
        peer.modelId = id;
        peer.lookFailed = false;
        this._lookQueue = (this._lookQueue || Promise.resolve()).then(async () => {
            if (peer.modelId !== id) return;
            if (ReactorCharacters.isInstalled(id)) { peer.modelSpec = ReactorCharacters.models.get(id); return; }
            const buffer = await ReactorCharacters.fetch(id);
            if (peer.modelId !== id) return;
            const spec = buffer ? await ReactorCharacters.install(id, buffer) : null;
            if (peer.modelId !== id) return;
            if (spec) peer.modelSpec = spec; else peer.lookFailed = true;
        }).catch(error => { if (peer.modelId === id) peer.lookFailed = true; console.warn("A player's character could not be loaded.", error); });
    }
};

// ---- The game ----

// A move no walker could make, but the game made: the server is told, so it doesn't refuse it.
const _reactorOnlineLocate = Game_Player.prototype.locate;
Game_Player.prototype.locate = function(x, y) {
    _reactorOnlineLocate.call(this, x, y);
    ReactorOnline._moved = true;
};

const _reactorOnlineLoadSuccess = Scene_Load.prototype.onLoadSuccess;
Scene_Load.prototype.onLoadSuccess = function() {
    ReactorOnline.onGameStarted();
    _reactorOnlineLoadSuccess.call(this);
};

const _reactorOnlineSceneMapStart = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _reactorOnlineSceneMapStart.call(this);
    // A game that skips its title has no title to pass.
    if (DataManager.isTitleSkip && DataManager.isTitleSkip()) ReactorOnline.gameStarted = true;
    ReactorOnline.start();
};

const _reactorOnlineSpritesetUpdate = Spriteset_Map.prototype.update;
Spriteset_Map.prototype.update = function() {
    if (ReactorOnline.state !== "off") this.updateReactorOnline();
    _reactorOnlineSpritesetUpdate.call(this);
};

/** Each player gets a character sprite and a name of its own, made and removed as they come and go. */
Spriteset_Map.prototype.updateReactorOnline = function() {
    const shown = this._reactorOnline || (this._reactorOnline = new Map());
    const now = performance.now();
    for (const [slot, peer] of ReactorOnline.everyone()) {
        peer.advance(now);
        let entry = shown.get(slot);
        if (entry && entry.peer !== peer) { this.removeReactorOnlinePeer(slot, entry); entry = null; }
        if (!entry) shown.set(slot, entry = this.addReactorOnlinePeer(peer));
        this.placeReactorOnlineName(entry);
    }
    for (const [slot, entry] of shown) if (!ReactorOnline.peers.has(slot) && !ReactorOnline.sleepers.has(slot)) this.removeReactorOnlinePeer(slot, entry);
};

Spriteset_Map.prototype.addReactorOnlinePeer = function(peer) {
    const sprite = new Sprite_Character(peer);
    this._characterSprites.push(sprite);
    this._tilemap.addChild(sprite);
    const name = new Sprite(new Bitmap(240, 28));
    name.anchor.set(0.5, 1);
    name.z = 8;
    this.addChild(name);
    return { peer, sprite, name, written: "" };
};

Spriteset_Map.prototype.removeReactorOnlinePeer = function(slot, entry) {
    this._reactorOnline.delete(slot);
    this._characterSprites.splice(this._characterSprites.indexOf(entry.sprite), 1);
    this._tilemap.removeChild(entry.sprite);
    this.removeChild(entry.name);
    entry.sprite.destroy();
    entry.name.destroy();
    if (entry.speech) { this.removeChild(entry.speech); entry.speech.destroy(); }
};

Spriteset_Map.prototype.placeReactorOnlineName = function(entry) {
    const peer = entry.peer, name = entry.name, config = ReactorOnline.config();
    // Someone speaking shows it, because a 2D character has no mouth to move.
    const hidden = ReactorOnlineBattle.drawsAsUnit(peer);
    const shown = hidden ? "" : (peer.speaking ? "♪ " : "") + (ReactorOnlineParty.has(peer.playerName) ? "[Party] " : "") + peer.playerName + (peer.fight ? " (in battle)" : "");
    if (entry.written !== shown) {
        entry.written = shown;
        name.bitmap.clear();
        name.bitmap.fontSize = 18;
        name.bitmap.outlineWidth = 4;
        name.bitmap.drawText(shown, 0, 0, 240, 28, "center");
    }
    const at = config && config.showNames !== false ? this.reactorOnlineNamePoint(entry) : null;
    name.visible = !!at;
    if (at) name.move(at.x, at.y);
    this.placeReactorOnlineSpeech(entry, at || this.reactorOnlineNamePoint(entry));
};

/** What they just said, above the name for a few seconds. */
Spriteset_Map.prototype.placeReactorOnlineSpeech = function(entry, at) {
    const speech = entry.peer.speech, live = speech && speech.until > performance.now();
    if (!live && !entry.speech) return;
    if (!entry.speech) {
        entry.speech = new Sprite(new Bitmap(420, 34));
        entry.speech.anchor.set(0.5, 1);
        this.addChild(entry.speech);
    }
    if (entry.said !== speech?.text && live) {
        entry.said = speech.text;
        const bitmap = entry.speech.bitmap, text = speech.text.length > 48 ? speech.text.slice(0, 47) + "…" : speech.text;
        bitmap.clear();
        bitmap.fontSize = 18;
        bitmap.outlineWidth = 4;
        bitmap.drawText(text, 0, 2, 420, 30, "center");
    }
    entry.speech.visible = !!(live && at);
    if (at) entry.speech.move(at.x, at.y - 24);
};

/** Above the head: from the 3D camera on a 3D map, above the sprite on a 2D one. */
Spriteset_Map.prototype.reactorOnlineNamePoint = function(entry) {
    const peer = entry.peer;
    if (typeof Reactor3D !== "undefined" && Reactor3D.shouldRender3D && $dataMap && Reactor3D.shouldRender3D($dataMap)) {
        const viewport = Reactor3D.viewport && Reactor3D.viewport(), camera = viewport && viewport.camera && viewport.camera();
        if (!camera) return null;
        const ground = Reactor3D.characterGround ? Reactor3D.characterGround($dataMap, peer) : 0;
        // A sleeper lies flat, so their name sits just above the floor.
        const tall = peer.asleep ? 0.4 : Reactor3D.characterHeightTiles ? Reactor3D.characterHeightTiles(peer) : 1.5;
        const at = Reactor3D.projectToScreen(camera, peer._realX + 0.5, ground + tall + 0.15, peer._realY + 0.5, {});
        return at && Number.isFinite(at.x) && Number.isFinite(at.y) ? at : null;
    }
    return { x: entry.sprite.x, y: entry.sprite.y - (entry.sprite.patternHeight ? entry.sprite.patternHeight() : 48) - 2 };
};

if (typeof Reactor3D !== "undefined") {
    // A sleeper lies still: its pose settles over its first second, then nothing more is sampled for it.
    const animationDue = Reactor3D.animationDue;
    Reactor3D.animationDue = function(holder, character) {
        if (!(character instanceof Game_RemotePlayer) || !character.asleep) return animationDue.apply(this, arguments);
        if ((holder.sleptFrames || 0) >= 60) { holder.poseHeld = true; return (holder.sampled = false); }
        const due = animationDue.apply(this, arguments);
        if (due) holder.sleptFrames = (holder.sleptFrames || 0) + 1;
        return due;
    };
    const modelSpec = Reactor3D._characterModelSpec;
    Reactor3D._characterModelSpec = function(character) {
        if (character instanceof Game_RemoteVehicle) return character.modelSpec;
        if (character instanceof Game_RemotePlayer) {
            if (character.inside || ReactorOnlineBattle.drawsAsUnit(character)) return null;
            if (character.modelSpec) return character.modelSpec;
            // Their own character on its way: nothing yet, rather than the actor it would replace.
            if (character.modelId && !character.lookFailed) return null;
            return character.actorId ? this.databaseModelSpecOfProject(character.actorId) : null;
        }
        return modelSpec.call(this, character);
    };
    const instanceKey = Reactor3D.modelInstanceKey;
    Reactor3D.modelInstanceKey = function(character) {
        if (character instanceof Game_RemoteVehicle) return "rv" + character.rider.slot + ":" + character.modelSpec.name;
        return character instanceof Game_RemotePlayer ? "r" + character.slot + ":" + (character.modelSpec ? character.modelSpec.name : "") : instanceKey.call(this, character);
    };
    const modelCharacters = Spriteset_Map.prototype.reactor3DModelCharacters;
    Spriteset_Map.prototype.reactor3DModelCharacters = function() {
        const characters = modelCharacters.call(this);
        for (const [, peer] of ReactorOnline.everyone()) {
            characters.push(peer);
            if (peer.vehicle) characters.push(peer.vehicle);
        }
        return characters;
    };
}
