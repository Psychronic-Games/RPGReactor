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

    /** The last name signed in with here, so a returning player only types a password. */
    lastName() {
        try { return localStorage.getItem(this.sessionKey() + ".name") || ""; } catch (error) { return ""; }
    },

    rememberName(name) {
        try { localStorage.setItem(this.sessionKey() + ".name", name); } catch (error) { /* it is only a convenience */ }
    },

    /** Passwords and passes go in the body of a request, never its address, which servers log. */
    async post(action, body, params) {
        const response = await this.ask(this.request(Object.assign({ a: action }, params)),
            { method: "POST", body: JSON.stringify(body || {}), headers: { "Content-Type": "text/plain" } });
        const text = await response.text();
        if (!response.ok) { const error = new Error(text); error.status = response.status; throw error; }
        return JSON.parse(text);
    },

    /** Signed in: the account's character comes with it, on any device. */
    useAccount(account) {
        this.account = account;
        this._nextSave = 0;
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
        // (Not for a game the server has removed or replaced: two devices must not write one life in turn.)
        if (!this.keepsProgress() || this._saving || this._removed) return false;
        this._saving = true;
        try {
            // What a save in the menu records before it is written (onBeforeSave), short of counting a save:
            // the clock and the music playing, so waking plays on from them.
            $gameSystem._framesOnSave = Graphics.frameCount;
            $gameSystem._bgmOnSave = AudioManager.saveBgm();
            $gameSystem._bgsOnSave = AudioManager.saveBgs();
            const text = JsonEx.stringify(DataManager.makeSaveContents());
            // The browser's own compressor works off the main thread; its zlib bytes are pako's, so loading is unchanged.
            const bytes = typeof CompressionStream === "function"
                ? await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer()
                : pako.deflate(text);
            const body = new Blob([this.account.session + "\n", bytes], { type: "text/plain" });
            const response = await this.ask(this.request({ a: "save" }), { method: "POST", body }, this.TRANSFER_MS);
            if (!response.ok) console.warn("Progress was not kept: " + await response.text());
            return response.ok;
        } finally {
            this._saving = false;
        }
    },

    wakeNote() {
        const note = { session: this.account.session, map: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y, d: $gamePlayer.direction(), slot: Math.max(0, this.slot) };
        // The floor stood on, on a 3D map: a roof and the room under it are one tile, and a wake would land in the room.
        const ground = $gamePlayer._reactorGround;
        if (Number.isFinite(ground)) note.g = Math.round(ground * 1000) / 1000;
        return note;
    },

    /** Where this player stands. As the game closes there is only time for a beacon, so it goes as one. */
    noteWhereIAm(leaving) {
        if (!this.keepsProgress() || !$gameMap?.mapId()) return;
        const body = JSON.stringify(this.wakeNote());
        if (leaving && navigator.sendBeacon) navigator.sendBeacon(this.request({ a: "wake" }), new Blob([body], { type: "text/plain" }));
        else this.ask(this.request({ a: "wake" }), { method: "POST", body, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    },

    /** A save is whole only between things. A battle waiting on its next move counts: the event that started it just waits for it. */
    canSaveNow() {
        if ($gamePlayer.isTransferring() || $gameMessage.isBusy()) return false;
        if (ReactorOnlineBattle.isShared()) return false;
        const fight = typeof $gameFight !== "undefined" && $gameFight?.isHere?.() ? $gameFight : null;
        return fight ? !fight.isBusy() && !fight._act && !fight._ending : !$gameMap.isEventRunning();
    },

    /** Called on the beat: often a small note of where this player is, now and then the whole game. */
    keepUp() {
        if (!this.keepsProgress() || !(SceneManager._scene instanceof Scene_Map) || !$gameMap?.mapId()) return;
        const now = performance.now();
        // Where someone stands is worth noting at any moment, in a cutscene or a battle too.
        if (now >= (this._nextNote || 0) && !$gamePlayer.isTransferring()) {
            this._nextNote = now + this.NOTE_MS;
            this.noteWhereIAm(false);
        }
        const every = Math.max(10, Number(this.config().accounts?.autosave) || 60) * 1000;
        // The first save comes soon: until there is one, leaving costs the whole game.
        if (!this._nextSave) this._nextSave = now + Math.min(every, this.FIRST_SAVE_MS);
        if (now >= this._nextSave && this.canSaveNow()) {
            this._nextSave = now + every;
            this.saveProgress().catch(error => console.warn("Progress was not kept.", error));
        }
    },

    /** Waking up: this player's game, back where they went to sleep. */
    async wake(account) {
        // They left before anything was saved: a new game, but where they went to sleep.
        if (account.progress?.saved !== false) {
            const response = await this.ask(this.request({ a: "load" }), { method: "POST", body: JSON.stringify({ session: account.session }), headers: { "Content-Type": "text/plain" } }, this.TRANSFER_MS);
            if (!response.ok) throw new Error(await response.text());
            const contents = JsonEx.parse(pako.inflate(new Uint8Array(await response.arrayBuffer()), { to: "string" }));
            DataManager.createGameObjects();
            DataManager.extractSaveContents(contents);
            DataManager.correctDataErrors();
            // As a load does: the play time and the music go on from the save.
            $gameSystem.onAfterLoad();
        }
        ReactorCharacters.pending = false;
        ReactorCharacters.starting = false;
        const place = account.progress?.wake;
        const map = place?.map || $gameMap.mapId(), x = place ? place.x : $gamePlayer.x, y = place ? place.y : $gamePlayer.y;
        $gamePlayer.reserveTransfer(map, x, y, place?.d || $gamePlayer.direction(), 0);
        // The transfer lands on a tile's ground floor (locate forgets the floor); the one slept on is put back after it.
        this._wakeGround = place && Number.isFinite(place.g) ? { map, x, y, g: place.g } : null;
    },

    /** Leaving for the title: a last save and a note of the place, then this player is asleep. */
    async signOff() {
        if (!this._running) return;
        this.noteWhereIAm(true);
        // The game is read for the save before anything is awaited, so this player is asleep at once and the upload
        // finishes behind: a game started from the title meanwhile is not the one signed off.
        const saving = this.saveProgress().catch(() => {});
        this.stop();
        this.gameStarted = false;
        await saving;
    },

    /** Those asleep on this map stay in the world, lying where they stopped. */
    async fetchSleepers() {
        const map = $gameMap?.mapId();
        if (!map || this.config()?.accounts?.sleepers === false || this.accountMode() === "none") return;
        const response = await this.ask(this.request({ a: "sleepers", m: map }), { cache: "no-store" }).catch(() => null);
        if (!response?.ok || $gameMap.mapId() !== map) return;
        const tiles = new Set(), seen = new Set(), x = $gamePlayer.x, y = $gamePlayer.y;
        const list = ((await response.json()).sleepers || [])
            .filter(entry => entry.id !== this.account?.id)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
            .filter(entry => !tiles.has(entry.x + "," + entry.y) && tiles.add(entry.x + "," + entry.y))
            .slice(0, this.SLEEPERS_SHOWN);
        for (const entry of list) {
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

/**
 * The sign-in pages, in the game's own window: the project's skin and font, and keys, gamepad,
 * mouse and touch like any menu. A field is drawn here and typed into a real input laid over it,
 * so a phone's keyboard opens and a password manager or paste works. Nothing typed is ever
 * written into the game's text codes.
 */
function Window_OnlineForm() {
    this.initialize(...arguments);
}

Window_OnlineForm.prototype = Object.create(Window_Selectable.prototype);
Window_OnlineForm.prototype.constructor = Window_OnlineForm;

Window_OnlineForm.prototype.initialize = function(rect) {
    this._rows = [];
    this._values = {};
    Window_Selectable.prototype.initialize.call(this, rect);
};

/** rows: { field, label, secret, complete } or { action, label }. */
Window_OnlineForm.prototype.setRows = function(rows, values = {}) {
    this.setField(null);
    this._rows = rows;
    this._values = values;
    this.refresh();
    this.select(0);
};

Window_OnlineForm.prototype.maxItems = function() {
    return this._rows.length;
};

Window_OnlineForm.prototype.value = function(key) {
    return this._values[key] || "";
};

Window_OnlineForm.prototype.currentRow = function() {
    return this._rows[this.index()] || null;
};

Window_OnlineForm.prototype.select = function(index) {
    Window_Selectable.prototype.select.call(this, index);
    const row = this.currentRow();
    this.setField(this.active && row?.field ? row : null);
};

Window_OnlineForm.prototype.activate = function() {
    Window_Selectable.prototype.activate.call(this);
    this.setField(this.currentRow()?.field ? this.currentRow() : null);
};

Window_OnlineForm.prototype.deactivate = function() {
    Window_Selectable.prototype.deactivate.call(this);
    this.setField(null);
};

/** Typing goes to the selected field only; on a button, keys belong to the game again. */
Window_OnlineForm.prototype.setField = function(row) {
    if (this._field === row) return;
    this._field = row;
    if (!this._input && !row) return;
    const input = this._input || this.createInput();
    if (!row) { input.blur(); input.style.display = "none"; return; }
    input.type = row.secret ? "password" : "text";
    input.autocomplete = row.complete || "off";
    input.maxLength = row.max || 72;
    input.value = this.value(row.field);
    input.style.display = "";
    this.placeInput();
    Input.clear();
    input.focus();
};

Window_OnlineForm.prototype.createInput = function() {
    const input = this._input = document.createElement("input");
    input.id = "reactorOnlineField";
    input.spellcheck = false;
    input.style.cssText = "position:fixed;z-index:3;opacity:.01;padding:0;margin:0;border:0;background:none;color:transparent;font-size:16px";
    input.addEventListener("input", () => {
        if (!this._field) return;
        this._values[this._field.field] = input.value;
        this.redrawCurrentItem();
    });
    input.addEventListener("keydown", event => this.onFieldKey(event));
    // Clicking the game's canvas takes the focus away; typing should still land here.
    input.addEventListener("blur", () => setTimeout(() => { if (this._field && this._input === input) input.focus(); }, 0));
    document.body.appendChild(input);
    return input;
};

/** The field's keys stay in it, except those that move between rows. */
Window_OnlineForm.prototype.onFieldKey = function(event) {
    event.stopPropagation();
    const down = event.key === "ArrowDown" || event.key === "Tab" && !event.shiftKey, up = event.key === "ArrowUp" || event.key === "Tab" && event.shiftKey;
    if (down || up) {
        event.preventDefault();
        const index = this.index() + (down ? 1 : -1);
        if (index >= 0 && index < this._rows.length) { SoundManager.playCursor(); this.select(index); }
    } else if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        const next = this._rows[this.index() + 1];
        if (next?.field) { this.select(this.index() + 1); return; }
        this.callHandler("submit");
    } else if (event.key === "Escape") {
        event.preventDefault();
        this.processCancel();
    }
};

Window_OnlineForm.prototype.placeInput = function() {
    if (!this._input || !this._field || !Graphics._canvas) return;
    const box = Graphics._canvas.getBoundingClientRect(), scale = box.width / Math.max(1, Graphics.width);
    const rect = this.itemRect(this.index()), origin = this.worldTransform.apply(new Point(this.padding + rect.x, this.padding + rect.y));
    const style = this._input.style;
    style.left = box.left + origin.x * scale + "px";
    style.top = box.top + origin.y * scale + "px";
    style.width = rect.width * scale + "px";
    style.height = rect.height * scale + "px";
};

Window_OnlineForm.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);
    this.placeInput();
    if (this._field) {
        const on = Math.floor(performance.now() / 500) % 2 === 0;
        if (on !== this._caret) { this._caret = on; this.redrawCurrentItem(); }
    }
};

Window_OnlineForm.prototype.drawItem = function(index) {
    const row = this._rows[index], rect = this.itemLineRect(index);
    this.resetTextColor();
    if (!row.field) {
        this.drawText(row.label, rect.x, rect.y, rect.width, "center");
        return;
    }
    const label = Math.floor(rect.width * 0.42), x = rect.x + label, width = rect.width - label;
    this.changeTextColor(ColorManager.systemColor());
    this.drawText(row.label, rect.x, rect.y, label);
    this.resetTextColor();
    const value = this.value(row.field), shown = row.secret ? "*".repeat(value.length) : value;
    const selected = this._field === row && this._caret;
    this.contents.fillRect(x, rect.y + rect.height - 3, width, 2, ColorManager.gaugeBackColor());
    this.drawText(shown + (selected ? "_" : ""), x + 4, rect.y, width - 8);
};

Window_OnlineForm.prototype.destroy = function(options) {
    this.closeInput();
    Window_Selectable.prototype.destroy.call(this, options);
};

Window_OnlineForm.prototype.closeInput = function() {
    this._field = null;
    this._input?.remove();
    this._input = null;
};

function Scene_OnlineAccount() {
    this.initialize(...arguments);
}

Scene_OnlineAccount.prototype = Object.create(Scene_MenuBase.prototype);
Scene_OnlineAccount.prototype.constructor = Scene_OnlineAccount;

Scene_OnlineAccount.WIDTH = 720;

Scene_OnlineAccount.prototype.needsCancelButton = function() {
    return false;
};

Scene_OnlineAccount.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    this._helpWindow = new Window_Help(new Rectangle(0, this.helpAreaTop(), Graphics.boxWidth, this.helpAreaHeight()));
    this.addWindow(this._helpWindow);
    const width = Math.min(Scene_OnlineAccount.WIDTH, Graphics.boxWidth);
    this._formWindow = new Window_OnlineForm(new Rectangle(Math.floor((Graphics.boxWidth - width) / 2), this.mainAreaTop(), width, this.calcWindowHeight(5, true)));
    this._formWindow.setHandler("ok", this.onFormOk.bind(this));
    this._formWindow.setHandler("cancel", this.onFormCancel.bind(this));
    this._formWindow.setHandler("submit", this.submit.bind(this));
    this.addWindow(this._formWindow);
    this._page = null;
};

Scene_OnlineAccount.prototype.start = function() {
    Scene_MenuBase.prototype.start.call(this);
    this.resume();
};

Scene_OnlineAccount.prototype.stop = function() {
    Scene_MenuBase.prototype.stop.call(this);
    this._formWindow.closeInput();
};

/** A device that remembers an account greets it; anyone else is asked who they are. */
Scene_OnlineAccount.prototype.resume = async function() {
    const session = ReactorOnline.storedSession();
    if (!session) return this.showStart();
    this.setMessage("Signing in…");
    this._formWindow.hide();
    try {
        this.showWelcome(await ReactorOnline.post("me", { session }));
    } catch (error) {
        ReactorOnline.signOut();
        this.showStart();
    }
    this._formWindow.show();
};

Scene_OnlineAccount.prototype.title = function() {
    const title = ReactorOnline.config()?.accounts?.title || $dataSystem.gameTitle || "Sign in";
    return title.replace(/\\/g, "");
};

Scene_OnlineAccount.prototype.setMessage = function(text, bad) {
    this._helpWindow.setText(this.title() + "\n" + (bad ? "\\C[2]" : "") + String(text || "").replace(/\\/g, ""));
};

Scene_OnlineAccount.prototype.showPage = function(page, rows, message, values) {
    this._page = page;
    const form = this._formWindow, height = this.calcWindowHeight(rows.length, true);
    form.move(form.x, this.mainAreaTop() + Math.floor((this.mainAreaHeight() - height) / 2), form.width, height);
    form.createContents();
    form.setRows(rows, values);
    form.activate();
    this.setMessage(message);
};

Scene_OnlineAccount.prototype.showStart = function() {
    const accounts = ReactorOnline.config().accounts || {}, rows = [], guests = ReactorOnline.accountMode() === "optional";
    if (accounts.registration !== false) rows.push({ action: "new", label: "Create an account" });
    rows.push({ action: "old", label: "I have an account" });
    if (guests) rows.push({ action: "guest", label: "Play as a guest" });
    rows.push({ action: "back", label: "Back" });
    this.showPage("start", rows, guests ? "An account keeps your character and progress on any device." : "This game needs an account. It keeps your character and progress on any device.");
};

Scene_OnlineAccount.prototype.showSignIn = function(values) {
    this.showPage("signin", [{ field: "username", label: "Name", complete: "username", max: 20 }, { field: "password", label: "Password", secret: true, complete: "current-password" },
        { action: "login", label: "Sign in" }, { action: "start", label: "Back" }], "Lost your password? The game's owner can reset it.", values);
};

Scene_OnlineAccount.prototype.showCreate = function() {
    const shortest = Math.max(4, Number(ReactorOnline.config().accounts?.minPassword) || 8);
    this.showPage("create", [{ field: "username", label: "Choose a name", complete: "username", max: 20 }, { field: "password", label: "Password", secret: true, complete: "new-password" },
        { field: "repeat", label: "Password again", secret: true, complete: "new-password" }, { action: "register", label: "Create account" }, { action: "start", label: "Back" }],
        "A name of 3 to 20 letters or numbers, and a password of at least " + shortest + " characters.");
};

/** Signed in: wake up where they left off, or start, or be someone else on this device. */
Scene_OnlineAccount.prototype.showWelcome = function(account) {
    this._account = account;
    const config = ReactorOnline.config(), rows = [], asleep = account.progress && config.accounts?.persist !== false;
    rows.push({ action: asleep ? "wake" : "enter", label: asleep ? "Wake up" : "Continue" });
    if (asleep && config.accounts?.restart !== false) rows.push({ action: "over", label: "Start over" });
    rows.push({ action: "signout", label: "Sign out" });
    this.showPage("welcome", rows, "Welcome back, " + account.name + ".");
};

Scene_OnlineAccount.prototype.onFormOk = function() {
    const row = this._formWindow.currentRow();
    this._formWindow.activate();
    if (row?.field) return;
    this.run(row?.action);
};

/** Enter in the last field means the page's own button. */
Scene_OnlineAccount.prototype.submit = function() {
    const action = this._formWindow._rows.find(row => row.action)?.action;
    if (action) this.run(action);
};

Scene_OnlineAccount.prototype.run = function(action) {
    const form = this._formWindow;
    switch (action) {
        case "new": return this.showCreate();
        case "old": return this.showSignIn({ username: ReactorOnline.lastName() });
        case "start": return this.showStart();
        case "guest": ReactorOnline.guest = true; return SceneManager.goto(Scene_Map);
        case "back": ReactorOnline.gameStarted = false; ReactorCharacters.pending = false; return SceneManager.goto(Scene_Title);
        case "login": return this.send("login");
        case "register":
            if (form.value("password") !== form.value("repeat")) return this.fail("Those passwords are not the same.");
            return this.send("register");
        case "enter": return this.enterWorld(this._account);
        case "wake": return this.wakeUp(this._account);
        case "over": return this.enterWorld(Object.assign({}, this._account, { character: null, progress: null }));
        case "signout": ReactorOnline.signOut(); return this.showStart();
    }
};

Scene_OnlineAccount.prototype.fail = function(text) {
    SoundManager.playBuzzer();
    this.setMessage(text, true);
};

Scene_OnlineAccount.prototype.send = async function(action) {
    if (this._busy) return;
    this._busy = true;
    const form = this._formWindow, username = form.value("username");
    this.setMessage(action === "login" ? "Signing in…" : "Creating your account…");
    try {
        const account = await ReactorOnline.post(action, { username, password: form.value("password") });
        ReactorOnline.rememberName(username);
        if (account.progress && ReactorOnline.config().accounts?.persist !== false) this.showWelcome(account);
        else this.enterWorld(account);
    } catch (error) {
        this.fail(error.message || "The server could not be reached.");
    } finally {
        this._busy = false;
    }
};

Scene_OnlineAccount.prototype.enterWorld = function(account) {
    ReactorOnline.useAccount(account);
    SceneManager.goto(Scene_Map);
};

Scene_OnlineAccount.prototype.wakeUp = async function(account) {
    ReactorOnline.useAccount(account);
    try {
        await ReactorOnline.wake(account);
        SceneManager.goto(Scene_Map);
    } catch (error) {
        this.fail("Your game could not be loaded: " + error.message);
    }
};

Scene_OnlineAccount.prototype.onFormCancel = function() {
    const page = this._page;
    this._formWindow.activate();
    if (page === "signin" || page === "create") this.showStart();
    else if (page === "start") this.run("back");
};

const _reactorOnlineAccountGoto = SceneManager.goto;
SceneManager.goto = function(sceneClass) {
    if (sceneClass === Scene_Title) ReactorOnline.signOff();
    _reactorOnlineAccountGoto.call(this, sceneClass === Scene_Map && ReactorOnline.needsSignIn() ? Scene_OnlineAccount : sceneClass);
};

// ---- Falling and saving, with other people in the world ----

/**
 * Knocked out online, the world goes on without a Game Over screen: the party gets up where the player last
 * came onto a map, and stays signed in. Database > Online can turn this off.
 */
ReactorOnline.respawns = function() {
    const config = this.config();
    return !!config && config.respawn !== false && this.gameStarted && typeof $gameMap !== "undefined" && $gameMap?.mapId() > 0;
};

ReactorOnline.respawn = function() {
    const place = this.arrival || { map: $dataSystem.startMapId, x: $dataSystem.startX, y: $dataSystem.startY, d: 2 };
    for (const actor of $gameParty.members()) actor.recoverAll();
    $gamePlayer.reserveTransfer(place.map, place.x, place.y, place.d || 2, 0);
    this.knockedOut = true;
};

const _reactorOnlineArrive = Game_Player.prototype.performTransfer;
Game_Player.prototype.performTransfer = function() {
    const arriving = this.isTransferring();
    _reactorOnlineArrive.call(this);
    if (arriving) ReactorOnline.arrival = { map: $gameMap.mapId(), x: this.x, y: this.y, d: this.direction() };
};

const _reactorOnlineGotoOver = SceneManager.goto;
SceneManager.goto = function(sceneClass) {
    if (typeof Scene_Gameover !== "undefined" && sceneClass === Scene_Gameover && ReactorOnline.respawns()) {
        ReactorOnline.respawn();
        _reactorOnlineGotoOver.call(this, Scene_Map);
        return;
    }
    _reactorOnlineGotoOver.call(this, sceneClass);
};

const _reactorOnlineRespawnStart = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _reactorOnlineRespawnStart.call(this);
    if (ReactorOnline.knockedOut) { ReactorOnline.knockedOut = false; ReactorOnlineChat.note("You were knocked out, and came to here."); }
};

// Waking where the player slept: on the floor they slept on (a roof, an upper storey), not the tile's ground floor.
const _reactorOnlinePerformTransfer = Game_Player.prototype.performTransfer;
Game_Player.prototype.performTransfer = function() {
    const wake = ReactorOnline._wakeGround, arriving = wake && this.isTransferring() && this._newMapId === wake.map && this._newX === wake.x && this._newY === wake.y;
    _reactorOnlinePerformTransfer.apply(this, arguments);
    if (!wake || !arriving) return;
    ReactorOnline._wakeGround = null;
    this._reactorGround = wake.g;
};

// Save in the menu keeps the game on the server too, where waking up looks for it.
const _reactorOnlineSaveGame = DataManager.saveGame;
DataManager.saveGame = function(savefileId) {
    const saving = _reactorOnlineSaveGame.call(this, savefileId);
    if (ReactorOnline.keepsProgress()) Promise.resolve(saving).then(() => ReactorOnline.saveProgress()).catch(() => null);
    return saving;
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
            // Kept for the next beat unless a newer change to the same value came meanwhile: thrown away, the next
            // look at the world put this player's own switch back, and nobody else ever saw it change.
            console.warn("A shared change was not sent; it will be sent again.", error);
            if (!(error && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429)) {
                for (const change of changes) {
                    const key = change.kind + ":" + change.id, now = this.pending.get(key);
                    if (!now) this.pending.set(key, change);
                    // Two adds to one variable are both owed: the newer one's value stands, and the amounts are summed.
                    else if (change.delta !== undefined && now.delta !== undefined) now.delta += change.delta;
                }
            }
        } finally {
            this._sending = false;
        }
    },

    onCount(count) {
        if (this.active && count !== this.known) { this.known = count; this.fetch(); }
    },

    async fetch() {
        const response = await ReactorOnline.ask(ReactorOnline.request({ a: "world" }), { cache: "no-store" }).catch(() => null);
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
                // An event of the map in play that the project does not share is not the world's to set.
                if (key[0] === $gameMap?.mapId?.() && $dataMap?.events?.[key[1]] && !$dataMap.events[key[1]].meta?.world) continue;
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
    ReactorOnlineParty.noteValue("s", switchId, !!value);
};

const _reactorWorldVariable = Game_Variables.prototype.setValue;
Game_Variables.prototype.setValue = function(variableId, value) {
    _reactorWorldVariable.call(this, variableId, value);
    // The value is read back only when a shared world or party takes it: plugins replace Game_Variables.value
    // (YEP, Olivia), and reading it on every write, offline included, crashed Star Shift Origins, Rebellion and
    // Legacy at New Game.
    const world = ReactorWorldState.active && ReactorWorldState.variables.has(variableId);
    const party = ReactorOnlineParty.takesValue("v", variableId);
    if (!world && !party) return;
    const now = this.value(variableId);
    if (world) ReactorWorldState.note("v", variableId, now, ReactorWorldState.operation);
    if (party) ReactorOnlineParty.noteValue("v", variableId, now);
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
    place: "map",
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
        this.channel.addEventListener("click", () => { this.nextChannel(); this.input.focus(); });
        this.input = document.createElement("input");
        this.input.style.cssText = "flex:1;min-width:0;padding:6px 8px;border:1px solid #4a52a0;border-radius:4px;background:rgba(11,12,20,.9);color:#fff;font:inherit";
        this.input.maxLength = Number(this.settings().maxLength) || 200;
        this.input.autocomplete = "off";
        this.input.addEventListener("keydown", event => this.onKey(event));
        this.input.addEventListener("keyup", event => event.stopPropagation());
        this.input.addEventListener("blur", () => { if (this.typing) setTimeout(() => this.close(), 150); });
        bar.appendChild(this.channel);
        bar.appendChild(this.input);
        this.hint = document.createElement("div");
        this.hint.id = "reactorOnlineHint";
        this.hint.style.cssText = "display:inline-block;margin-top:6px;padding:3px 8px;border-radius:4px;background:rgba(0,0,0,.55);font-size:12px;color:#fff;text-shadow:0 1px 2px #000";
        box.append(this.log, bar, this.hint);
        document.body.appendChild(box);
        this.showChannel();
        this.showHint();
        document.addEventListener("keydown", event => this.onGameKey(event));
    },

    /** The keys, always in sight, and what the microphone is doing: nobody should have to guess either. */
    showHint() {
        if (!this.hint) return;
        const key = String(this.settings()?.key || "T").toUpperCase();
        const parts = [key + ": chat"];
        const voice = ReactorOnlineVoice.hintText();
        if (voice) parts.push(voice);
        const text = parts.join("  ·  ");
        if (this.hint.textContent !== text) this.hint.textContent = text;
    },

    /** Map, then World where the project has it, then Party for someone in one. */
    nextChannel() {
        const list = ["map"];
        if (this.settings()?.world !== false) list.push("world");
        if (ReactorOnlineParty.party) list.push("party");
        this.place = list[(list.indexOf(this.place) + 1) % list.length];
        this.showChannel();
    },

    showChannel() {
        if (!this.channel) return;
        if (this.place === "party" && !ReactorOnlineParty.party) this.place = "map";
        if (this.place === "world" && this.settings()?.world === false) this.place = "map";
        this.world = this.place === "world";
        this.channel.style.display = this.settings()?.world === false && !ReactorOnlineParty.party ? "none" : "";
        this.channel.textContent = this.place === "party" ? "Party" : this.world ? "World" : "Map";
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
        this.hint.style.display = "none";
        this.bar.style.display = "flex";
        this.log.style.opacity = 1;
        Input.clear();
        this.input.focus();
    },

    close() {
        this.typing = false;
        this.hint.style.display = "inline-block";
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
        if (ReactorOnlineParty.command(text)) return;
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
            await ReactorOnline.post("say", { text, world: this.world, party: this.place === "party" }, { s: ReactorOnline.slot, g: ReactorOnline.nonce, t: ReactorOnline.token, m: $gameMap.mapId() });
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
            const response = await ReactorOnline.ask(ReactorOnline.request({ a: "chat",after: this.after, m: $gameMap.mapId(), p: ReactorOnlineParty.party?.id || "" }), { cache: "no-store" });
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
            who.textContent = (message.party ? "[Party] " : message.world ? "[World] " : "") + message.name + ": ";
            who.style.color = message.party ? "#bff5c4" : message.world ? "#9fd0ff" : "#c9cdf5";
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
