//=============================================================================
// reactor_online_ui.js — what a player of an online game sees: signing in and chat.
//
// Everything here follows data/ReactorOnline.json (Database › Online). The server
// checks the same rules itself, so this file only has to be pleasant, not trusted.
// Text goes on the page through textContent, never as markup.
//=============================================================================

Object.assign(ReactorOnline, {
    account: null,
    guest: false,

    accountMode() {
        return this.config()?.accounts?.mode || "none";
    },

    /** A game is starting and this project wants to know who is playing. */
    needsSignIn() {
        return !!this.config() && this.gameStarted && this.accountMode() !== "none" && !this.account && !this.guest;
    },

    sessionKey() {
        return "reactorOnline.session." + ($dataSystem.advanced?.gameId || $dataSystem.gameTitle || "game");
    },

    storedSession() {
        try { return localStorage.getItem(this.sessionKey()) || ""; } catch (error) { return ""; }
    },

    /** Passwords and passes go in the body of a request, never its address, which servers log. */
    async post(action, body, params) {
        const response = await fetch(this.request(Object.assign({ a: action }, params)),
            { method: "POST", body: JSON.stringify(body || {}), headers: { "Content-Type": "text/plain" } });
        const text = await response.text();
        if (!response.ok) { const error = new Error(text); error.status = response.status; throw error; }
        return JSON.parse(text);
    },

    /** Signed in: the account's character comes with it, on any device. */
    useAccount(account) {
        this.account = account;
        try { localStorage.setItem(this.sessionKey(), account.session); } catch (error) { /* signing in again works too */ }
        const character = account.character;
        if (character && character.actorId && ReactorCharacters.config()) {
            ReactorCharacters.pending = false;
            ReactorCharacters.setCurrent(character);
            ReactorCharacters.applyActor(character.actorId, character.name);
        }
    },

    signOut() {
        this.account = null;
        try { localStorage.removeItem(this.sessionKey()); } catch (error) { /* nothing was stored */ }
    },

    // ---- Going to sleep and waking up ----

    keepsProgress() {
        return !!this.account && this.config()?.accounts?.persist !== false;
    },

    /** The whole game, compressed, kept against the account. A player's life is on the server, not their device. */
    async saveProgress() {
        if (!this.keepsProgress() || this._saving) return false;
        this._saving = true;
        try {
            const bytes = pako.deflate(JsonEx.stringify(DataManager.makeSaveContents()));
            const body = new Blob([this.account.session + "\n", bytes], { type: "text/plain" });
            const response = await fetch(this.request({ a: "save" }), { method: "POST", body });
            if (!response.ok) console.warn("Progress was not kept: " + await response.text());
            return response.ok;
        } finally {
            this._saving = false;
        }
    },

    wakeNote() {
        return { session: this.account.session, map: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y, d: $gamePlayer.direction(), slot: Math.max(0, this.slot) };
    },

    /** Where this player stands. As the game closes there is only time for a beacon, so it goes as one. */
    noteWhereIAm(leaving) {
        if (!this.keepsProgress() || !$gameMap?.mapId()) return;
        const body = JSON.stringify(this.wakeNote());
        if (leaving && navigator.sendBeacon) navigator.sendBeacon(this.request({ a: "wake" }), new Blob([body], { type: "text/plain" }));
        else fetch(this.request({ a: "wake" }), { method: "POST", body, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    },

    /** Called on the beat: often a small note of where this player is, now and then the whole game. */
    keepUp() {
        if (!this.keepsProgress() || !(SceneManager._scene instanceof Scene_Map) || !$gameMap?.mapId()) return;
        const now = performance.now(), settled = !$gamePlayer.isTransferring() && !$gameMap.isEventRunning() && !$gameMessage.isBusy();
        if (now >= (this._nextNote || 0) && settled) {
            this._nextNote = now + this.NOTE_MS;
            this.noteWhereIAm(false);
        }
        const every = Math.max(10, Number(this.config().accounts?.autosave) || 60) * 1000;
        if (!this._nextSave) this._nextSave = now + every;
        if (now >= this._nextSave && settled) {
            this._nextSave = now + every;
            this.saveProgress().catch(error => console.warn("Progress was not kept.", error));
        }
    },

    /** Waking up: this player's game, back where they went to sleep. */
    async wake(account) {
        const response = await fetch(this.request({ a: "load" }), { method: "POST", body: JSON.stringify({ session: account.session }), headers: { "Content-Type": "text/plain" } });
        if (!response.ok) throw new Error(await response.text());
        const contents = JsonEx.parse(pako.inflate(new Uint8Array(await response.arrayBuffer()), { to: "string" }));
        DataManager.createGameObjects();
        DataManager.extractSaveContents(contents);
        DataManager.correctDataErrors();
        ReactorCharacters.pending = false;
        ReactorCharacters.starting = false;
        const place = account.progress?.wake;
        const map = place?.map || $gameMap.mapId(), x = place ? place.x : $gamePlayer.x, y = place ? place.y : $gamePlayer.y;
        $gamePlayer.reserveTransfer(map, x, y, place?.d || $gamePlayer.direction(), 0);
    },

    /** Leaving for the title: a last save and a note of the place, then this player is asleep. */
    async signOff() {
        if (!this._running) return;
        this.noteWhereIAm(true);
        await this.saveProgress().catch(() => {});
        this.stop();
        this.gameStarted = false;
    },

    /** Those asleep on this map stay in the world, lying where they stopped. */
    async fetchSleepers() {
        const map = $gameMap?.mapId();
        if (!map || this.config()?.accounts?.sleepers === false || this.accountMode() === "none") return;
        const response = await fetch(this.request({ a: "sleepers", m: map }), { cache: "no-store" }).catch(() => null);
        if (!response?.ok || $gameMap.mapId() !== map) return;
        const list = (await response.json()).sleepers || [], seen = new Set();
        for (const entry of list) {
            if (entry.id === this.account?.id) continue;
            const key = "z" + entry.id;
            seen.add(key);
            let sleeper = this.sleepers.get(key);
            if (!sleeper) {
                this.sleepers.set(key, sleeper = new Game_RemotePlayer(key));
                sleeper.setAsleep(entry);
                if (entry.model) this.fetchLook(sleeper, entry.model);
            }
        }
        for (const key of this.sleepers.keys()) if (!seen.has(key)) this.sleepers.delete(key);
    }
});

function Scene_OnlineAccount() {
    this.initialize(...arguments);
}

Scene_OnlineAccount.prototype = Object.create(Scene_Base.prototype);
Scene_OnlineAccount.prototype.constructor = Scene_OnlineAccount;

Scene_OnlineAccount.prototype.start = function() {
    Scene_Base.prototype.start.call(this);
    this._page = new ReactorAccountPage();
    this._page.open();
};

Scene_OnlineAccount.prototype.stop = function() {
    Scene_Base.prototype.stop.call(this);
    this._page?.close();
};

class ReactorAccountPage {
    async open() {
        const session = ReactorOnline.storedSession();
        if (session) {
            try { return this.enter(await ReactorOnline.post("me", { session })); } catch (error) { ReactorOnline.signOut(); }
        }
        this.build();
    }

    node(tag, style, text) {
        const node = document.createElement(tag);
        if (style) node.style.cssText = style;
        if (text != null) node.textContent = text;
        return node;
    }

    input(type, placeholder, complete) {
        const input = this.node("input", "padding:10px;background:#0b0c14;color:inherit;border:1px solid #39406a;border-radius:4px;font:inherit");
        Object.assign(input, { type, placeholder, autocomplete: complete });
        input.addEventListener("keydown", event => { event.stopPropagation(); if (event.key === "Enter") this.submit("login"); });
        input.addEventListener("keyup", event => event.stopPropagation());
        return input;
    }

    button(label, action, main) {
        const node = this.node("button", "flex:1;padding:10px;border-radius:4px;font:inherit;font-weight:600;cursor:pointer;color:#fff;border:1px solid #4a52a0;background:" + (main ? "#3a3fa8" : "transparent"), label);
        node.type = "button";
        node.addEventListener("click", action);
        return node;
    }

    build() {
        const config = ReactorOnline.config();
        const root = this.root = this.node("div", "position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;background:#0b0c14;color:#e8e9f2;font:15px/1.4 system-ui,sans-serif");
        root.id = "reactorOnlineAccount";
        const card = this.node("form", "width:min(360px,90vw);display:flex;flex-direction:column;gap:10px;padding:24px;background:#141626;border:1px solid #2a2e4a;border-radius:8px");
        card.addEventListener("submit", event => event.preventDefault());
        card.appendChild(this.node("div", "font-size:20px;font-weight:600;margin-bottom:6px", config.accounts?.title || $dataSystem.gameTitle || "Sign in"));
        this.name = this.input("text", "Name", "username");
        this.password = this.input("password", "Password", "current-password");
        this.message = this.node("div", "min-height:20px;color:#ff9a9a;font-size:13px");
        const row = this.node("div", "display:flex;gap:8px");
        row.appendChild(this.button("Sign in", () => this.submit("login"), true));
        if (config.accounts?.registration !== false) row.appendChild(this.button("Create account", () => this.submit("register")));
        card.append(this.name, this.password, this.message, row);
        if (ReactorOnline.accountMode() === "optional") {
            card.appendChild(this.button("Play as a guest", () => { ReactorOnline.guest = true; SceneManager.goto(Scene_Map); }));
        }
        card.appendChild(this.button("Back", () => { ReactorOnline.gameStarted = false; ReactorCharacters.pending = false; SceneManager.goto(Scene_Title); }));
        root.appendChild(card);
        document.body.appendChild(root);
        this.name.focus();
    }

    async submit(action) {
        if (this.busy) return;
        this.busy = true;
        this.message.textContent = "";
        try {
            this.enter(await ReactorOnline.post(action, { username: this.name.value, password: this.password.value }));
        } catch (error) {
            this.message.textContent = error.message || "The server could not be reached.";
        } finally {
            this.busy = false;
        }
    }

    /** Signed in: wake up where they left off, or, if the project lets them, start again. */
    enter(account) {
        const config = ReactorOnline.config();
        if (account.progress && config.accounts?.persist !== false) {
            if (config.accounts?.restart === false) return this.wakeUp(account);
            return this.offerWaking(account);
        }
        ReactorOnline.useAccount(account);
        SceneManager.goto(Scene_Map);
    }

    async wakeUp(account) {
        ReactorOnline.useAccount(account);
        try {
            await ReactorOnline.wake(account);
            SceneManager.goto(Scene_Map);
        } catch (error) {
            this.build();
            this.message.textContent = "Your game could not be loaded: " + error.message;
        }
    }

    offerWaking(account) {
        this.close();
        const root = this.root = this.node("div", "position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;background:#0b0c14;color:#e8e9f2;font:15px/1.4 system-ui,sans-serif");
        root.id = "reactorOnlineAccount";
        const card = this.node("div", "width:min(360px,90vw);display:flex;flex-direction:column;gap:10px;padding:24px;background:#141626;border:1px solid #2a2e4a;border-radius:8px");
        card.appendChild(this.node("div", "font-size:20px;font-weight:600;margin-bottom:6px", "Welcome back, " + account.name));
        card.appendChild(this.button("Wake up", () => this.wakeUp(account), true));
        card.appendChild(this.button("Start over", () => {
            ReactorOnline.useAccount(Object.assign({}, account, { character: null, progress: null }));
            SceneManager.goto(Scene_Map);
        }));
        card.appendChild(this.button("Sign out", () => {
            ReactorOnline.signOut();
            this.close();
            this.build();
        }));
        root.appendChild(card);
        document.body.appendChild(root);
    }

    close() {
        this.root?.remove();
    }
}

const _reactorOnlineAccountGoto = SceneManager.goto;
SceneManager.goto = function(sceneClass) {
    if (sceneClass === Scene_Title) ReactorOnline.signOff();
    _reactorOnlineAccountGoto.call(this, sceneClass === Scene_Map && ReactorOnline.needsSignIn() ? Scene_OnlineAccount : sceneClass);
};

// ---- The world lane ----

/**
 * What the project shares between players. Events run as they always do, on each
 * player's own game, reading and writing ordinary switches and variables. Those the
 * project names in Database › Online also travel here: a change goes to the server, and
 * every other game applies it through the same setValue a Control Switches command uses,
 * so event pages respond exactly as they do alone. Everything else stays personal.
 */
const ReactorWorldState = {
    pending: new Map(),
    known: 0,
    applying: false,
    active: false,

    /** "1-5, 9" as a set of ids. */
    ids(text) {
        const out = new Set();
        for (const part of String(text || "").split(/[\s,]+/)) {
            const range = /^(\d+)-(\d+)$/.exec(part);
            if (range) { for (let id = Number(range[1]); id <= Math.min(Number(range[2]), Number(range[1]) + 5000); id++) out.add(id); }
            else if (/^\d+$/.test(part)) out.add(Number(part));
        }
        return out;
    },

    start() {
        const world = ReactorOnline.config()?.world;
        this.switches = this.ids(world?.switches);
        this.variables = this.ids(world?.variables);
        this.active = true;
        this.fetch();
    },

    stop() {
        this.active = false;
        this.pending.clear();
    },

    /** A change to send. "Add 1" stays a change by 1, so two players adding at once both count. */
    note(kind, id, value, delta) {
        if (!this.active || this.applying) return;
        const key = kind + ":" + id, before = this.pending.get(key);
        const change = { kind, id: String(id), value };
        if (delta !== undefined && (!before || before.delta !== undefined)) change.delta = (before?.delta || 0) + delta;
        this.pending.set(key, change);
    },

    /** Several changes to one value in a moment send only the last, so a busy event can't flood the server. */
    async flush() {
        if (!this.pending.size || this._sending || ReactorOnline.slot < 0) return;
        const changes = [...this.pending.values()];
        this.pending.clear();
        if (ReactorOnlineSocket.socket) { ReactorOnlineSocket.sendChanges(changes); return; }
        this._sending = true;
        try {
            await ReactorOnline.post("set", { changes }, { s: ReactorOnline.slot, g: ReactorOnline.nonce, t: ReactorOnline.token });
        } catch (error) {
            console.warn("A shared change was not sent.", error);
        } finally {
            this._sending = false;
        }
    },

    onCount(count) {
        if (this.active && count !== this.known) { this.known = count; this.fetch(); }
    },

    async fetch() {
        const response = await fetch(ReactorOnline.request({ a: "world" }), { cache: "no-store" }).catch(() => null);
        if (response?.ok) this.apply(await response.json());
    },

    /** Single changes as the Engine passes them on, through the same ordinary calls. */
    applyChanges(changes) {
        const world = { s: {}, v: {}, e: {} };
        for (const change of changes) world[change.kind][change.id] = change.value;
        this.apply(world);
    },

    /** The world as the server has it, through the ordinary calls. A change still on its way here wins for now. */
    apply(world) {
        if (typeof $gameSwitches === "undefined" || !$gameSwitches) return;
        this.applying = true;
        try {
            for (const [id, value] of Object.entries(world.s || {})) {
                if (!this.pending.has("s:" + id) && $gameSwitches.value(Number(id)) !== value) $gameSwitches.setValue(Number(id), value);
            }
            for (const [id, value] of Object.entries(world.v || {})) {
                if (!this.pending.has("v:" + id) && $gameVariables.value(Number(id)) !== value) $gameVariables.setValue(Number(id), value);
            }
            for (const [id, value] of Object.entries(world.e || {})) {
                const [map, event, letter] = id.split(","), key = [Number(map), Number(event), letter];
                if (!this.pending.has("e:" + id) && $gameSelfSwitches.value(key) !== value) $gameSelfSwitches.setValue(key, value);
            }
        } finally {
            this.applying = false;
        }
    }
};

const _reactorWorldSwitch = Game_Switches.prototype.setValue;
Game_Switches.prototype.setValue = function(switchId, value) {
    _reactorWorldSwitch.call(this, switchId, value);
    if (ReactorWorldState.active && ReactorWorldState.switches.has(switchId)) ReactorWorldState.note("s", switchId, !!value);
};

const _reactorWorldVariable = Game_Variables.prototype.setValue;
Game_Variables.prototype.setValue = function(variableId, value) {
    _reactorWorldVariable.call(this, variableId, value);
    if (ReactorWorldState.active && ReactorWorldState.variables.has(variableId)) ReactorWorldState.note("v", variableId, this.value(variableId), ReactorWorldState.operation);
};

// Control Variables' Add and Subtract say what they mean, so the lane can keep it.
const _reactorWorldOperate = Game_Interpreter.prototype.operateVariable;
Game_Interpreter.prototype.operateVariable = function(variableId, operationType, value) {
    const change = typeof value === "number" ? value : undefined;
    ReactorWorldState.operation = operationType === 1 ? change : operationType === 2 && change !== undefined ? -change : undefined;
    try {
        _reactorWorldOperate.call(this, variableId, operationType, value);
    } finally {
        ReactorWorldState.operation = undefined;
    }
};

const _reactorWorldSelfSwitch = Game_SelfSwitches.prototype.setValue;
Game_SelfSwitches.prototype.setValue = function(key, value) {
    _reactorWorldSelfSwitch.call(this, key, value);
    if (!ReactorWorldState.active || ReactorWorldState.applying || key[0] !== $gameMap.mapId()) return;
    // An event marked <world> in its note: one chest for everybody, opened once.
    if ($dataMap?.events?.[key[1]]?.meta?.world) ReactorWorldState.note("e", key.join(","), !!value);
};

// ---- Chat ----

const ReactorOnlineChat = {
    SHOWN_LINES: 8,
    FADE_MS: 12000,
    BUBBLE_MS: 5000,

    lines: [],
    after: 0,
    known: 0,
    typing: false,
    world: false,
    _built: false,

    settings() {
        const chat = ReactorOnline.config()?.chat;
        return chat && chat.enabled !== false ? chat : (chat ? null : {});
    },

    blockedKey() {
        return "reactorOnline.blocked." + ($dataSystem.advanced?.gameId || "game");
    },

    blocked() {
        if (!this._blocked) {
            try { this._blocked = new Set(JSON.parse(localStorage.getItem(this.blockedKey())) || []); } catch (error) { this._blocked = new Set(); }
        }
        return this._blocked;
    },

    saveBlocked() {
        try { localStorage.setItem(this.blockedKey(), JSON.stringify([...this.blocked()])); } catch (error) { /* it lasts this session */ }
    },

    start(from) {
        if (!this.settings() || this._built || typeof document === "undefined") { this.after = this.known = from || 0; return; }
        this._built = true;
        this.after = this.known = from || 0;
        const box = this.box = document.createElement("div");
        box.id = "reactorOnlineChat";
        box.style.cssText = "position:fixed;left:10px;bottom:10px;width:min(420px,60vw);z-index:800;font:14px/1.3 system-ui,sans-serif;color:#fff;pointer-events:none";
        this.log = document.createElement("div");
        this.log.style.cssText = "display:flex;flex-direction:column;gap:2px;text-shadow:0 1px 2px #000;transition:opacity .4s";
        const bar = this.bar = document.createElement("div");
        bar.style.cssText = "display:none;margin-top:6px;gap:4px;pointer-events:auto";
        this.channel = document.createElement("button");
        this.channel.type = "button";
        this.channel.style.cssText = "padding:6px 8px;border:1px solid #4a52a0;border-radius:4px;background:#141626;color:#fff;font:inherit;cursor:pointer";
        this.channel.addEventListener("click", () => { this.world = !this.world; this.showChannel(); this.input.focus(); });
        this.input = document.createElement("input");
        this.input.style.cssText = "flex:1;min-width:0;padding:6px 8px;border:1px solid #4a52a0;border-radius:4px;background:rgba(11,12,20,.9);color:#fff;font:inherit";
        this.input.maxLength = Number(this.settings().maxLength) || 200;
        this.input.autocomplete = "off";
        this.input.addEventListener("keydown", event => this.onKey(event));
        this.input.addEventListener("keyup", event => event.stopPropagation());
        this.input.addEventListener("blur", () => { if (this.typing) setTimeout(() => this.close(), 150); });
        bar.appendChild(this.channel);
        bar.appendChild(this.input);
        box.append(this.log, bar);
        document.body.appendChild(box);
        this.showChannel();
        document.addEventListener("keydown", event => this.onGameKey(event));
    },

    showChannel() {
        if (this.settings()?.world === false) { this.world = false; this.channel.style.display = "none"; return; }
        this.channel.textContent = this.world ? "World" : "Map";
    },

    /** The chat key, set per project, opens it while walking around. */
    onGameKey(event) {
        const key = String(this.settings()?.key || "T").toLowerCase();
        if (this.typing || event.key.toLowerCase() !== key || event.ctrlKey || event.altKey || event.metaKey) return;
        if (!(SceneManager._scene instanceof Scene_Map) || $gameMessage.isBusy() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
        event.preventDefault();
        this.open();
    },

    open() {
        this.typing = true;
        this.bar.style.display = "flex";
        this.log.style.opacity = 1;
        Input.clear();
        this.input.focus();
    },

    close() {
        this.typing = false;
        this.bar.style.display = "none";
        this.input.blur();
        this.input.value = "";
        this.touch();
    },

    onKey(event) {
        event.stopPropagation();    // the game must not walk while someone types
        if (event.key === "Escape") this.close();
        if (event.key === "Enter") { const text = this.input.value.trim(); this.close(); if (text) this.say(text); }
    },

    note(text) {
        this.add({ text, note: true });
    },

    async say(text) {
        if (/^\/voice\s+off$/i.test(text)) { ReactorOnlineVoice.turnOff(); return; }
        const blocking = /^\/(block|unblock)\s+(.+)$/i.exec(text);
        if (blocking) {
            const set = this.blocked(), name = blocking[2].trim();
            if (blocking[1].toLowerCase() === "block") set.add(name); else set.delete(name);
            this.saveBlocked();
            if (ReactorOnlineVoice.on) ReactorOnlineVoice.connect();
            this.note((blocking[1].toLowerCase() === "block" ? "Blocked " : "Unblocked ") + name + ".");
            return;
        }
        try {
            await ReactorOnline.post("say", { text, world: this.world }, { s: ReactorOnline.slot, g: ReactorOnline.nonce, t: ReactorOnline.token, m: $gameMap.mapId() });
            this.fetch();
        } catch (error) {
            this.note(error.message || "That could not be sent.");
        }
    },

    /** Each sync says how many messages exist; only news costs a request. */
    onCount(count) {
        if (this.settings() && count !== this.known) { this.known = count; this.fetch(); }
    },

    async fetch() {
        if (this._fetching) { this._again = true; return; }
        this._fetching = true;
        try {
            const response = await fetch(ReactorOnline.request({ a: "chat", after: this.after, m: $gameMap.mapId() }), { cache: "no-store" });
            if (response.ok) this.receive(await response.json());
        } catch (error) {
            // The next count asks again.
        } finally {
            this._fetching = false;
            if (this._again) { this._again = false; this.fetch(); }
        }
    },

    receive(answer) {
        for (const message of answer.messages || []) {
            this.after = Math.max(this.after, message.id);
            if (this.blocked().has(message.name)) continue;
            this.add(message);
            const peer = ReactorOnline.peers.get(message.slot);
            if (peer && !message.world && this.settings()?.bubbles !== false) peer.speech = { text: message.text, until: performance.now() + this.BUBBLE_MS };
        }
        if ((answer.gone || []).length) {
            const gone = new Set(answer.gone);
            this.lines = this.lines.filter(line => { if (gone.has(line.id)) { line.node.remove(); return false; } return true; });
        }
    },

    add(message) {
        if (!this.log) return;
        const line = document.createElement("div");
        if (message.note) { line.textContent = message.text; line.style.color = "#ffd27a"; }
        else {
            const who = document.createElement("span");
            who.textContent = (message.world ? "[World] " : "") + message.name + ": ";
            who.style.color = message.world ? "#9fd0ff" : "#c9cdf5";
            who.style.fontWeight = "600";
            line.appendChild(who);
            line.appendChild(document.createTextNode(message.text));
        }
        this.log.appendChild(line);
        this.lines.push({ id: message.id, node: line });
        while (this.lines.length > this.SHOWN_LINES) this.lines.shift().node.remove();
        this.touch();
    },

    /** Recent lines stay readable, then fade so they don't sit over the game. */
    touch() {
        this.log.style.opacity = 1;
        clearTimeout(this._fade);
        this._fade = setTimeout(() => { if (!this.typing) this.log.style.opacity = 0; }, this.FADE_MS);
    },

    setShown(shown) {
        if (this.box) this.box.style.display = shown ? "" : "none";
    }
};

const _reactorChatMapStart = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _reactorChatMapStart.call(this);
    ReactorOnlineChat.setShown(true);
};

const _reactorChatMapTerminate = Scene_Map.prototype.terminate;
Scene_Map.prototype.terminate = function() {
    if (ReactorOnlineChat.typing) ReactorOnlineChat.close();
    ReactorOnlineChat.setShown(false);
    _reactorChatMapTerminate.call(this);
};
