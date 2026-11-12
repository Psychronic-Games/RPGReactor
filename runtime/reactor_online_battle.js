//=============================================================================
// reactor_online_battle.js: other players in your Tactical battle
//=============================================================================
// A battle runs on the game that started it, the host: that game rolls every
// hit and moves every enemy. Each player who joins runs the same battle screen
// as a mirror, which plays what the host reports and sends back the orders
// its own units are given. The server only carries the messages.
//
//   host   the real Game_Fight. A guest's units are event units with a
//          Game_RemoteActor battler, and their turn waits for a `plan` message
//          where an enemy's would think (stage "await").
//   mirror a Game_Fight with `_mirror` set. No queue, AI, pages or outcome of
//          its own: `nextMirror` starts whatever comes next from the host.
//          Its own units are its real party, so hurts last after the battle.
//
// Any side is a team name, and targeting already asks only whether two names
// are the same, so someone fighting for themselves is simply a third name.
// On a mirror the teams are turned so that its own side is "ally".
//
// Saving is off while a battle is shared: half of it is on another machine.
// Design: docs/DESIGN-ONLINE.md#shared-battles.
//=============================================================================

/** Someone else's actor: a battler built from what their game reported, standing where an enemy would. */
function Game_RemoteActor() {
    this.initialize(...arguments);
}

if (typeof Game_Enemy !== "undefined") {
    Game_RemoteActor.prototype = Object.create(Game_Enemy.prototype);
    Game_RemoteActor.prototype.constructor = Game_RemoteActor;
    Game_RemoteActor.prototype.isRemoteActor = true;

    Game_RemoteActor.prototype.initialize = function(snapshot) {
        this._snapshot = snapshot;
        Game_Enemy.prototype.initialize.call(this, 1, 0, 0);
        this._hp = snapshot.hp;
        this._mp = snapshot.mp;
        this._tp = snapshot.tp || 0;
    };

    Game_RemoteActor.prototype.enemy = function() {
        const snapshot = this._snapshot;
        // (A picture for a 2D battle screen, where a player has no model.)
        const stand = $dataEnemies.find(enemy => enemy?.battlerName);
        return { id: 1, name: snapshot.name, note: "", params: snapshot.params, traits: [], exp: 0, gold: 0, dropItems: [], battlerName: stand?.battlerName || "", battlerHue: 0,
            actions: [{ skillId: 1, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }] };
    };

    Game_RemoteActor.prototype.name = function() { return this._snapshot.name; };
    Game_RemoteActor.prototype.originalName = function() { return this._snapshot.name; };
    Game_RemoteActor.prototype.paramBase = function(paramId) { return this._snapshot.params[paramId]; };
    Game_RemoteActor.prototype.paramPlus = function() { return 0; };
    Game_RemoteActor.prototype.exp = function() { return 0; };
    Game_RemoteActor.prototype.gold = function() { return 0; };
    Game_RemoteActor.prototype.makeDropItems = function() { return []; };
    Game_RemoteActor.prototype.weapons = function() { return (this._snapshot.weapons || []).map(id => $dataWeapons[id]).filter(Boolean); };
    Game_RemoteActor.prototype.armors = function() { return (this._snapshot.armors || []).map(id => $dataArmors[id]).filter(Boolean); };
    Game_RemoteActor.prototype.equips = function() { return this.weapons().concat(this.armors()); };
    Game_RemoteActor.prototype.skills = function() { return (this._snapshot.skills || []).map(id => $dataSkills[id]).filter(Boolean); };

    /** What this actor's record, class and equipment say, as on the game they came from: every game has the same Database. */
    Game_RemoteActor.prototype.traitObjects = function() {
        const snapshot = this._snapshot, own = [$dataActors[snapshot.actorId], $dataClasses[snapshot.classId]].filter(Boolean);
        return Game_Battler.prototype.traitObjects.call(this).concat(own, this.equips());
    };
}

const ReactorOnlineBattle = {
    hostMode: "",
    classic: false,
    realTime: false,
    READ_MS: 300,
    BEAT_MS: 5000,
    SYNC_MS: 700,
    JOIN_RANGE: 12,
    FORGET_RANGE: 20,
    AWAY_STEPS: 5,
    TURN_MS: 90000,
    JOIN_WAIT_MS: 20000,
    DUEL_WAIT_MS: 60000,
    GONE_MS: 12000,
    BODY_BYTES: 60000,
    LINE_BYTES: 200000,
    BEHIND: 6,
    SETTLED_STAGES: ["pick", "await", "move", "command", "skill", "item", "target"],

    role: "",               // "", "host", "joining" or "guest"
    id: "",
    offset: 0,
    outbox: [],
    inbox: [],
    plans: new Map(),
    guests: new Map(),
    slots: new Set(),
    asked: new Set(),

    // ---- What other files ask ----

    isShared() {
        return this.role === "guest" || this.role === "joining" || (this.role === "host" && this.guests.size > 0);
    },

    /** Someone in this battle is drawn as their unit, not as the body walking the map. */
    drawsAsUnit(peer) {
        return this.slots.has(peer.slot) && !this.realTime;
    },

    canAsk() {
        return SceneManager._scene instanceof Scene_Map && !$gameMessage.isBusy() && !$gameMap.isEventRunning() && !$gamePlayer.isTransferring()
            && !$gameFight?.isActive?.() && !$gameParty.inBattle() && !this.role;
    },

    identity() {
        return { s: ReactorOnline.slot, g: ReactorOnline.nonce, t: ReactorOnline.token };
    },

    /** Into the battle's log; in a real-time battle down the Engine's line too, where there is one. */
    send(message) {
        if (this.realTime && ReactorOnlineAction.fast(message)) return;
        this.outbox.push(message);
    },

    // ---- The line to the server ----

    /** Called on the beat. Messages go out and come in one exchange at a time, and never slower than a player can feel. */
    keepUp() {
        const now = performance.now();
        // A host reading a message has a battle standing still; someone joining shouldn't wait for that.
        if (this.hostMode === "classic" && this.role === "host") ReactorOnlineClassic.tick();
        if (!this.role || !this.id || this._busy || now < (this._next || 0)) return;
        this._next = now + this.READ_MS;
        this._busy = true;
        this.exchange(now).catch(error => { if (error?.status === 404) this.onLost(); else console.error("A shared battle's message failed.", error); }).finally(() => { this._busy = false; });
    },

    /**
     * A message's size as the server counts it, a little high: its bytes on the way there are fewer than this, and so
     * are those of its line in the battle's log, where the server writes each character that is not plain ASCII as
     * six and each "/" as two.
     */
    bytesOf(text) {
        let n = text.length;
        for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c > 0x7f) n += 5; else if (c === 47) n += 1; }
        return n;
    },

    /**
     * The next lines to send, taken off the outbox: at most 64 and BODY_BYTES together; a line by itself may be up to
     * LINE_BYTES. One that could never be sent is dropped and said, so it does not hold back all that follow it.
     */
    batch() {
        const lines = [];
        let bytes = 0;
        while (this.outbox.length && lines.length < 64) {
            const size = this.bytesOf(JSON.stringify(this.outbox[0]));
            if (size > this.LINE_BYTES) { console.warn("A shared battle's message was too large to send (" + this.outbox[0].t + ").", size); this.outbox.shift(); continue; }
            if (lines.length && bytes + size > this.BODY_BYTES) break;
            bytes += size;
            lines.push(this.outbox.shift());
        }
        return lines;
    },

    /** Everything still waiting goes now, one body after another in order (this game is leaving, or the battle is over). */
    sayAll(id) {
        const who = this.identity(), bodies = [];
        for (let lines = this.batch(); lines.length; lines = this.batch()) bodies.push(lines);
        return bodies.reduce((sent, lines) => sent.then(() => ReactorOnline.post("bSay", { id, lines }, who)).catch(() => null), Promise.resolve());
    },

    async exchange(now) {
        const lines = this.batch(), id = this.id;
        let closed = false;
        if (lines.length) {
            try {
                await ReactorOnline.post("bSay", { id: this.id, lines }, this.identity());
                this._refusedSince = 0;
            } catch (error) {
                // The battle is closed: nothing more can be said in it, and what it said last (its end) is still to be
                // read. (Since 2026-11-10 the server refuses a closed battle's lines; a guest with something to say as
                // the host's battle ended stopped here, and was shown an escape in place of the result.)
                if (error?.status === 404 && this.role === "guest") closed = true;
                else {
                    // Not sent: back to the front of the outbox for the next exchange, unless the refusal is of the lines
                    // themselves ("too much", or a body the server cannot read), which would only repeat and hold back the rest.
                    if (!(error?.status === 400 || error?.status === 413 || error?.status === 422)) this.outbox.unshift(...lines);
                    // Refused as not yet in the battle: the host's next beat names this player; read on meanwhile.
                    if (error?.status !== 403) throw error;
                    // Still refused long after any beat would have named this player: the host dropped them (dropGuest).
                    // Sending the same lines for the rest of the battle would only grow the outbox; this player is out.
                    this._refusedSince = this._refusedSince || now;
                    if (now - this._refusedSince > this.GONE_MS * 2) { this.onLost(); return; }
                }
            }
        }
        // The players let in are told to the server with each beat, and at once when they change: only they
        // (and the host) may say more than a join in this battle's log.
        const members = this.role === "host" ? [...this.guests.keys()].sort((a, b) => a - b).join(",") : "";
        if (this.role === "host" && (now >= (this._nextBeat || 0) || members !== this._beatMembers)) {
            this._nextBeat = now + this.BEAT_MS;
            this._beatMembers = members;
            await ReactorOnline.post("bBeat", this.listing(), Object.assign(this.identity(), { m: $gameMap.mapId() }));
        }
        const response = await ReactorOnline.ask(ReactorOnline.request(Object.assign(this.identity(), { a: "bRead", id: this.id, after: this.offset })), { cache: "no-store" });
        if (!response.ok) { const error = new Error(await response.text()); error.status = response.status; throw error; }
        const answer = await response.json();
        this.offset = answer.next;
        // Each line on its own: one that is not a message, or that a handler cannot take, must not lose the rest.
        for (const line of answer.lines || []) {
            if (!line || line.from === ReactorOnline.slot || !line.m || typeof line.m !== "object") continue;
            try { this.receive(line.m, line.from); } catch (error) { console.warn("A shared battle's message could not be read.", error); }
        }
        // Closed, read to the end of its log, and the log never told how it ended: the battle is gone.
        if (closed && this.role === "guest" && this.id === id && !this._endHeard && !(answer.lines || []).length) this.onLost();
    },

    listing() {
        const sides = { [ReactorOnline.myName || "?"]: "ally" }, leader = $gamePlayer;
        for (const guest of this.guests.values()) if (guest.team !== "watch") sides[guest.name] = guest.team;
        return { id: this.id, x: leader.x, y: leader.y, mode: this.hostMode, sides, members: [...this.guests.keys()] };
    },

    /**
     * A battler as another game described it, held to what this game will read off it: the eight parameters, HP and
     * MP as numbers, a name, lists of ids. Anything else is refused: a stranger may write a join line into any
     * battle's log, and one that named a member with no parameters stopped the host's game.
     */
    soundMember(member) {
        const number = value => typeof value === "number" && Number.isFinite(value);
        if (!member || typeof member !== "object" || Array.isArray(member)) return false;
        if (!Array.isArray(member.params) || member.params.length < 8 || !member.params.slice(0, 8).every(number)) return false;
        if (!number(member.hp) || !number(member.mp)) return false;
        member.name = String(member.name ?? "").slice(0, 24);
        member.tp = number(member.tp) ? member.tp : 0;
        for (const list of ["weapons", "armors", "skills", "states"]) {
            if (member[list] !== undefined) member[list] = Array.isArray(member[list]) ? member[list].filter(Number.isInteger).slice(0, 256) : [];
        }
        if (member.vehicle !== undefined && member.vehicle !== null && !this.soundMember(member.vehicle)) member.vehicle = null;
        return true;
    },

    /** A request to join, made safe to act on, or nothing. */
    soundJoin(message) {
        if (!Number.isFinite(Number(message.x)) || !Number.isFinite(Number(message.y))) return null;
        message.x = Number(message.x);
        message.y = Number(message.y);
        message.members = (Array.isArray(message.members) ? message.members.slice(0, 8) : []).filter(member => this.soundMember(member));
        return message;
    },

    receive(message, from) {
        if (this.role === "host") {
            if (message.t === "join") { const join = this.soundJoin(message); if (join) this.joins.push({ message: join, from }); }
            else if (message.t === "leave") { if (this.hostMode === "classic") ReactorOnlineClassic.dropGuest(from); else this.dropGuest(from); }
            else if (this.realTime && $gameFight?.isAction?.()) ReactorOnlineAction.onHost($gameFight, message, from);
            // A plan is kept only from the player whose unit it is for: anyone else's would take the place of the real one,
            // be refused when the turn came (`awaitOrders`), and leave the unit to wait out its time.
            else if (message.t === "plan") { if ($gameFight?.unit?.(message.u)?.remoteSlot === from) this.plans.set(message.u, Object.assign(message, { from })); }
            // A guest orders only its own battlers ("g<slot>.<actor>"): an order for anyone else's is not taken.
            else if (message.t === "orders" && Array.isArray(message.orders)) {
                for (const order of message.orders.slice(0, 16)) if (order && typeof order.key === "string" && order.key.startsWith("g" + from + ".")) ReactorOnlineClassic.orders.set(order.key, order);
            }
        } else if (from !== this.hostSlot && !(message.t === "rehost" && this.slots && this.slots.has(from))) {
            // A guest's game believes the battle's host and nobody else (a hand-over is told by the player taking it
            // on, who is in the battle): the log and the relay carry anyone's lines, and these set our own party's HP.
        } else if (this.role === "joining") {
            if (message.t === "roster" && message.to === ReactorOnline.slot) this.beginMirror(message);
            else if (message.t === "croster" && message.to === ReactorOnline.slot) ReactorOnlineClassic.begin(message);
            else if (message.t === "refuse" && message.to === ReactorOnline.slot) { this.reset(); this.tell(message.why); }
        } else if (this.role === "guest" && (!message.to || message.to === ReactorOnline.slot)) {
            if (message.t === "end" || message.t === "cend") this._endHeard = true;
            this.inbox.push(message);
        }
    },

    reset() {
        this.role = "";
        this.hostMode = "";
        this.classic = false;
        this.realTime = false;
        this.id = "";
        this.offset = 0;
        this._refusedSince = 0;
        this._endHeard = false;
        this.outbox.length = 0;
        this.inbox.length = 0;
        this.plans.clear();
        this.guests.clear();
        this.slots.clear();
        this.joins = [];
        this.known = new Map();
        this.pendingUnits = [];
        this._teamSent = "";
    },

    // ---- Coming near a battle ----

    onNews(battles) {
        const running = battles.some(battle => battle.id === this.id);
        if (this.role === "guest" && running) this._heard = performance.now();
        if (this.role === "guest" && !running) {
            const next = battles.find(battle => battle.was === this.id);
            if (next) { this.follow(next); return; }
            // A host who stopped answering: the next player in the battle takes it on.
            if (performance.now() - (this._heard || 0) > this.GONE_MS) this.hostGone();
            return;
        }
        if (this.role === "guest") this._heard = performance.now();
        const duel = this.duelWith && performance.now() < this.duelWith.until ? battles.find(battle => battle.name === this.duelWith.name) : null;
        if (duel && !this.role) { this.duelWith = null; this.asked.add(duel.id); this.join(duel, "enemy"); return; }
        for (const battle of battles) {
            if (battle.host === ReactorOnline.slot || !battle.mode) continue;
            const away = Math.hypot(battle.x - $gamePlayer.x, battle.y - $gamePlayer.y);
            if (away > this.FORGET_RANGE) this.asked.delete(battle.id);
            if (away <= this.JOIN_RANGE && !this.asked.has(battle.id) && this.canAsk()) this.ask(battle);
        }
    },

    /** Whose side a party member is on in this battle, if one is in it. */
    partySide(battle) {
        for (const [name, side] of Object.entries(battle.sides || {})) if (ReactorOnlineParty.has(name)) return { name, side };
        return null;
    },

    ask(battle) {
        this.asked.add(battle.id);
        const friend = this.partySide(battle), choices = [];
        if (friend) choices.push({ label: "Join " + friend.name, side: friend.side });
        // A Classic screen has two sides: against the host is the only other place to stand.
        if (battle.mode === "classic") choices.push({ label: "Join " + battle.name + "'s side", side: "ally" }, { label: "Fight " + battle.name, side: "enemy" }, { label: "Retreat", side: "" });
        else {
            choices.push({ label: "Join " + battle.name + "'s side", side: "ally" }, { label: "Join the enemies", side: "enemy" }, { label: "Fight for myself", side: "self" });
            choices.push({ label: "Watch", side: "watch" });
            choices.push({ label: "Retreat", side: "" });
        }
        const labels = choices.filter((choice, index) => index === 0 || !friend || choice.side !== friend.side).map(choice => choice.label);
        $gameMessage.setChoices(labels, 0, labels.length - 1);
        $gameMessage.setChoiceCallback(index => {
            const chosen = choices.find(choice => choice.label === labels[index]);
            if (chosen.side) this.join(battle, chosen.side); else this.walkAway(battle);
        });
        $gameMessage.add(battle.name + " is fighting here.");
    },

    walkAway(battle) {
        const dx = $gamePlayer.x - battle.x, dy = $gamePlayer.y - battle.y;
        const code = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Game_Character.ROUTE_MOVE_RIGHT : Game_Character.ROUTE_MOVE_LEFT) : (dy > 0 ? Game_Character.ROUTE_MOVE_DOWN : Game_Character.ROUTE_MOVE_UP);
        const list = Array.from({ length: this.AWAY_STEPS }, () => ({ code, indent: null })).concat({ code: 0, parameters: [] });
        $gamePlayer.forceMoveRoute({ list, repeat: false, skippable: true, wait: false });
    },

    async join(battle, side) {
        if (this.role) return;
        this.reset();
        this.role = "joining";
        this.id = battle.id;
        this.hostSlot = battle.host;
        try {
            const place = await ReactorOnline.ask(ReactorOnline.request(Object.assign(this.identity(), { a: "bRead", id: battle.id, after: -1 })), { cache: "no-store" });
            this.offset = (await place.json()).next;
            // In real time a player is their leader: everyone else would need someone to drive them.
            const fighters = battle.mode === "tactical" || battle.mode === "classic" ? $gameParty.battleMembers() : [$gameParty.leader()];
            this.send({ t: "join", side, name: ReactorOnline.myName, x: $gamePlayer.x, y: $gamePlayer.y, slow: !ReactorOnlineSocket.socket, members: side === "watch" ? [] : fighters.map(actor => this.snapshot(actor)) });
            ReactorOnlineChat.note(side === "watch" ? "Going to watch…" : "Joining the battle…");
            setTimeout(() => { if (this.role === "joining") { this.reset(); this.tell("That battle has ended."); } }, this.JOIN_WAIT_MS);
        } catch (error) {
            this.reset();
            this.tell("That battle has ended.");
        }
    },

    /** Something a player chose didn't happen, and they need to see why. */
    tell(text) {
        ReactorOnlineChat.note(text);
        if (!$gameMessage.isBusy()) $gameMessage.add(text);
    },

    /** An actor as another game needs it: its numbers now, and the Database ids that give it the rest. */
    snapshot(actor) {
        return { actorId: actor.actorId(), classId: actor._classId, name: actor.name(), level: actor.level, hp: actor.hp, mp: actor.mp, tp: actor.tp,
            params: [0, 1, 2, 3, 4, 5, 6, 7].map(id => actor.paramBase(id) + actor.paramPlus(id)), skills: actor.skills().map(skill => skill.id),
            weapons: actor.weapons().map(item => item.id), armors: actor.armors().map(item => item.id),
            characterName: actor.characterName(), characterIndex: actor.characterIndex(), leader: actor === $gameParty.leader(), vehicle: actor === $gameParty.leader() ? this.vehicleSnapshot() : null };
    },

    // ---- Hosting ----

    /** A Tactical battle on this game, while it is online: anyone may be asked to join. */
    open(fight) {
        if (this.role || !ReactorOnline.config?.() || ReactorOnline.slot < 0) return;
        this.openAs(fight.mode());
    },

    openAs(mode) {
        this.reset();
        this.role = "host";
        this.hostMode = mode;
        this.realTime = mode === "action" || mode === "firstPerson";
        ReactorOnline.post("bOpen", { x: $gamePlayer.x, y: $gamePlayer.y, mode, sides: { [ReactorOnline.myName || "?"]: "ally" } }, Object.assign(this.identity(), { m: $gameMap.mapId() }))
            .then(answer => { if (this.role === "host") this.id = answer.id; }, () => { if (this.role === "host") this.reset(); });
    },

    close() {
        const id = this.id;
        // What is still waiting to go out goes: the guests need to hear the end.
        const who = this.identity();
        if (id) this.sayAll(id).finally(() => ReactorOnline.post("bClose", { id }, who).catch(() => null));
        this.reset();
    },

    /** One frame of a hosted battle: who has arrived, who has gone, what changed. */
    hostTick(fight) {
        for (const { message, from } of this.joins.splice(0)) this.addGuest(fight, message, from);
        // (A unit with no body yet, or none on this page of its event, isn't on the map for anyone.)
        for (const unit of this.pendingUnits.splice(0)) if (!unit.gone && fight.character(unit)) this.send({ t: "unit", unit: this.record(fight, unit) });
        const now = performance.now();
        if (this.realTime && this.guests.size) ReactorOnlineAction.tick(fight, now);
        if (now >= (this._nextSync || 0) && this.guests.size) {
            this._nextSync = now + this.SYNC_MS;
            for (const [slot, guest] of this.guests) {
                if (ReactorOnline.peers.has(slot)) guest.seen = now;
                else if (now - guest.seen > this.GONE_MS) this.dropGuest(slot);
            }
            this.sendSync(fight);
        }
    },

    addGuest(fight, message, from) {
        if (!fight.isActive() || fight._ending || this.guests.has(from)) return;
        if (message.side === "watch") {
            this.guests.set(from, { name: message.name || "Player", team: "watch", units: [], seen: performance.now() });
            this.sendRoster(fight, from, "watch");
            this.sendSlots();
            return;
        }
        const team = message.side === "ally" || message.side === "enemy" ? message.side : "side" + from;
        if (!["ally", "enemy"].includes(team)) fight._manySides = true;
        const units = [], enemyId = this.anyEnemyId();
        if (this.realTime) { ReactorOnlineAction.addGuest(fight, message, from, team); return; }
        for (const member of (message.members || []).slice(0, 8)) {
            const spot = fight.freeSpotNear(message.x, message.y, 4) || fight.anySpotNear(message.x, message.y);
            // (A side of its own isn't a team a spawn knows: it stands up as an enemy, then takes its side.)
            const unit = spot && enemyId ? fight.spawn({ team: "enemy", record: "enemy", id: enemyId, x: spot.x, y: spot.y, height: spot.height }) : null;
            if (!unit) continue;
            unit.team = team;
            unit.enemy = new Game_RemoteActor(member);
            unit.remoteSlot = from;
            this.dress($gameMap.event(unit.eventId), from, member);
            unit.vehicleBattler = member.vehicle ? new Game_RemoteActor(member.vehicle) : null;
            units.push(unit);
        }
        if (!units.length) { this.send({ t: "refuse", to: from, why: "There was no room in the battle." }); return; }
        fight.syncTroop();
        // They act before this round ends, whichever side's turn it is: nobody joins a fight to watch a whole round.
        const end = fight._queue.findIndex(entry => entry.kind === "roundEnd");
        if (end >= 0) fight._queue.splice(end, 0, { kind: "turnStart", team }, ...units.map(unit => ({ kind: "unit", unitId: unit.id })), { kind: "turnEnd", team });
        this.guests.set(from, { name: message.name || "Player", team, units: units.map(unit => unit.id), seen: performance.now() });
        this.slots.add(from);
        this.pendingUnits = this.pendingUnits.filter(unit => !units.includes(unit));
        for (const unit of units) this.send({ t: "unit", unit: this.record(fight, unit) });
        this.sendRoster(fight, from, team);
        this.sendSlots();
        this._nextBeat = 0;
        ReactorOnlineChat.note(message.name + " joined the battle.");
    },

    sendRoster(fight, to, side) {
        this.outbox.push({ t: "roster", to, side, mode: fight.mode(), turn: fight._turn, turns: fight._turns, team: fight.tac().team, host: ReactorOnline.slot,
            units: fight._units.filter(unit => !unit.gone && unit.team !== "neutral").map(unit => this.record(fight, unit)) });
    },

    sendSlots() {
        const watching = [...this.guests].filter(([, guest]) => guest.team === "watch").map(([slot]) => slot);
        this.send({ t: "slots", slots: [ReactorOnline.slot, ...[...this.guests.keys()].filter(slot => !watching.includes(slot))], watching });
    },

    dropGuest(slot) {
        const guest = this.guests.get(slot), fight = $gameFight;
        if (!guest) return;
        this.guests.delete(slot);
        this.slots.delete(slot);
        for (const id of guest.units) {
            const unit = fight.unit(id);
            if (unit && !unit.gone) fight.removeUnit(unit);
            // Waiting on orders that will never come.
            if (fight._act?.unitId === id) { fight._act.stage = "done"; fight._act.plan = null; }
            this.plans.delete(id);
        }
        this.sendSlots();
        this._nextBeat = 0;
        ReactorOnlineChat.note(guest.name + " left the battle.");
    },

    /** Whatever waits to go out goes now: this game is leaving the battle. */
    flushNow() {
        if (this.id) this.sayAll(this.id); else this.outbox.length = 0;
    },

    /** Any enemy record: a guest's unit needs one to be made, then wears its own battler. */
    anyEnemyId() {
        return Math.max(0, $dataEnemies.findIndex(enemy => enemy && enemy.name));
    },

    /** An event standing for a player's actor looks like them. */
    dress(event, slot, member) {
        if (!event) return;
        event._rrOnlineLook = { slot, actorId: member.actorId, leader: !!member.leader };
        if (member.characterName) event.setImage(member.characterName, member.characterIndex);
    },

    /** A unit as a mirror needs it to stand and be drawn. */
    record(fight, unit) {
        const character = fight.character(unit), battler = fight.battler(unit), human = unit.party || unit.actorId > 0;
        const snapshot = unit.remoteSlot !== undefined ? battler._snapshot : human ? this.snapshot(battler) : null;
        return { id: unit.id, team: unit.team, peer: unit.peerSlot !== undefined || (this.realTime && unit.party && fight.character(unit) === $gamePlayer), eventId: unit.remoteSlot !== undefined || unit.party ? 0 : unit.eventId || 0, name: battler ? battler.name() : "",
            x: character ? character.x : 0, y: character ? character.y : 0, h: character && ReactorFight.Grid?.heightOf ? ReactorFight.Grid.heightOf(character) : undefined, d: character ? character.direction() : 2,
            enemyId: unit.enemy && !snapshot ? unit.enemy.enemyId() : 0, snapshot, owner: unit.remoteSlot !== undefined ? unit.remoteSlot : human ? ReactorOnline.slot : -1, move: ReactorFight.moveOf(unit),
            hp: battler ? battler.hp : 0, mp: battler ? battler.mp : 0, tp: battler ? battler.tp : 0, states: battler ? battler.states().map(state => state.id) : [], defeated: !!unit.defeated };
    },

    /** What changed since the last report: the numbers a mirror cannot work out for itself (poison, a regeneration, a walk's end). */
    sendSync(fight, final) {
        const stage = fight.isAction() ? "" : fight._act?.stage;
        if (!final && !fight.isAction() && (fight._run || (stage && !this.SETTLED_STAGES.includes(stage)) || fight._tac?.movers?.length)) return;
        const changed = [];
        for (const unit of fight._units) {
            if (unit.gone || unit.team === "neutral") continue;
            const battler = fight.battler(unit), character = fight.character(unit);
            if (!battler || !character) continue;
            const row = [unit.id, battler.hp, battler.mp, battler.tp, battler.states().map(state => state.id), character.x, character.y, character.direction(), unit.team];
            const text = JSON.stringify(row);
            if (this.known.get(unit.id) !== text) { this.known.set(unit.id, text); changed.push(row); }
        }
        if (changed.length) this.send({ t: "sync", rows: changed });
    },

    /** What the leader rides, where it fights too: its numbers and skills. */
    vehicleSnapshot() {
        const vehicles = typeof ReactorVehicles !== "undefined" ? ReactorVehicles : null, event = vehicles?.ridden?.(), battler = event ? vehicles.battler?.(event) : null;
        if (!battler) return null;
        return { actorId: 0, classId: 0, name: battler.name(), hp: battler.hp, mp: battler.mp, tp: battler.tp, params: [0, 1, 2, 3, 4, 5, 6, 7].map(id => battler.param(id)),
            skills: (battler.skills?.() || []).map(skill => skill.id), weapons: (battler.weapons?.() || []).map(item => item.id), armors: (battler.armors?.() || []).map(item => item.id) };
    },

    /** Where an order leaves the unit, and what it rides if that changed this turn (getting on or off is a move of its own). */
    whereNow(fight, unit, act) {
        const character = unit ? fight.character(unit) : null, out = character ? { at: [character.x, character.y] } : {};
        const riding = ReactorOnline.rideState?.()?.name || "";
        if (riding !== (act.rodeAtStart || "")) out.ride = { vehicle: riding ? this.vehicleSnapshot() : null };
        return out;
    },

    /** The unit whose orders are awaited: they arrived, or it decides for itself. */
    awaitOrders(fight) {
        const act = fight._act, plan = this.plans.get(act.unitId), unit = fight.unit(act.unitId), character = fight.character(unit);
        if (!plan) {
            if (performance.now() > act.deadline) { this.send({ t: "over", u: act.unitId }); act.stage = fight.isWatched() ? "plan" : "ai"; }
            return;
        }
        this.plans.delete(act.unitId);
        if (plan.from !== unit.remoteSlot) return;
        if (plan.ride) { unit.vehicleBattler = plan.ride.vehicle ? new Game_RemoteActor(plan.ride.vehicle) : null; fight.syncTroop(); }
        // Got on or off where they stood: on their game the rider is on the next cell now.
        if (plan.at && !plan.steps?.length && character && (character.x !== plan.at[0] || character.y !== plan.at[1])) Game_CharacterBase.prototype.locate.call(character, plan.at[0], plan.at[1]);
        act.plan = plan.kind ? { kind: plan.kind, id: plan.id, cx: plan.cx, cy: plan.cy, via: plan.via } : null;
        if (plan.steps?.length) fight.startWalk(unit, character, plan.steps);
        else fight.actOnPlan(unit);
    },

    // ---- Mirroring ----

    /** This side as "ally": whoever fights it is an enemy on this screen, however the host names them. */
    localTeam(team) {
        const mine = this.side;
        if (team === "neutral" || mine === "ally" || mine === "watch") return team;
        if (team === mine) return "ally";
        if (team === "ally") return "enemy";
        return team === "enemy" ? "sideHost" : team;
    },

    beginMirror(roster) {
        const fight = $gameFight;
        this.role = "guest";
        this.side = roster.side;
        this.hostSlot = roster.host;
        this.realTime = roster.mode === "action" || roster.mode === "firstPerson";
        this._heard = performance.now();
        this.starting = true;
        try {
            if (!fight.start({ mode: roster.mode || "tactical", taken: [], turns: roster.turns, canEscape: true, canLose: true, bgm: "battle" })) { this.reset(); return; }
        } finally {
            this.starting = false;
        }
        fight._mirror = true;
        fight._manySides = roster.units.some(unit => !["ally", "enemy", "neutral"].includes(unit.team)) || !["ally", "enemy"].includes(roster.side);
        fight._turn = roster.turn;
        fight._phase = fight.isAction() ? "round" : "queue";
        fight.tac().team = this.localTeam(roster.team);
        // The host's numbering is the battle's: a message names a unit by it.
        const mine = new Map(fight._units.map(unit => [unit.actorId, unit])), own = [];
        for (const record of roster.units) {
            const unit = record.owner === ReactorOnline.slot ? mine.get(record.snapshot?.actorId) : null;
            if (!unit) continue;
            delete fight._inside[String(unit.id)];
            unit.pendingId = record.id;
            own.push([unit, record]);
        }
        fight._units = fight._units.filter(unit => own.some(([kept]) => kept === unit));
        for (const [unit, record] of own) {
            unit.id = unit.pendingId;
            delete unit.pendingId;
            unit.move = record.move || unit.move;
            const character = fight.character(unit);
            if (character) Game_CharacterBase.prototype.locate.call(character, record.x, record.y);
            if (character) fight._inside[String(unit.id)] = [record.x, record.y];
        }
        for (const record of roster.units) if (record.owner !== ReactorOnline.slot) this.addForeign(fight, record);
        fight.syncTroop();
        ReactorOnlineChat.note(roster.side === "watch" ? "Watching the battle. Press Cancel to leave." : "You joined the battle.");
        fight.touch();
    },

    /** A unit of the host's or another guest's, standing here as an event of its own. */
    addForeign(fight, record) {
        if (fight.unit(record.id) || record.defeated) return;
        if (record.peer) { ReactorOnlineAction.addPeer(fight, record); return; }
        const team = this.localTeam(record.team), authored = record.eventId ? $gameMap.event(record.eventId) : null;
        const same = authored && !authored._erased && authored._pageIndex >= 0 && authored.event().name === record.name;
        let unit = null;
        if (same) unit = fight.addUnit({ team: "enemy", record: "enemy", id: record.enemyId || this.anyEnemyId(), eventId: record.eventId });
        else unit = fight.spawn({ team: "enemy", record: "enemy", id: record.enemyId || this.anyEnemyId(), x: record.x, y: record.y, height: record.h, direction: record.d });
        if (!unit) return;
        unit.team = team;
        unit.clone = !same;
        delete fight._inside[String(unit.id)];
        unit.id = record.id;
        fight._inside[String(unit.id)] = [record.x, record.y];
        if (record.snapshot) {
            unit.enemy = new Game_RemoteActor(record.snapshot);
            this.slots.add(record.owner);
            this.dress($gameMap.event(unit.eventId), record.owner, record.snapshot);
            unit.vehicleBattler = record.snapshot.vehicle ? new Game_RemoteActor(record.snapshot.vehicle) : null;
        }
        unit.move = record.move || unit.move;
        unit.owner = record.owner;
        const event = $gameMap.event(unit.eventId);
        if (event) { Game_CharacterBase.prototype.locate.call(event, record.x, record.y); event.setDirection(record.d || 2); }
        // An action finds its subject in the troop, so the battler it now wears must be there.
        fight.syncTroop();
        this.applyNumbers(fight, unit, record.hp, record.mp, record.tp, record.states);
    },

    applyNumbers(fight, unit, hp, mp, tp, states) {
        const battler = fight.battler(unit);
        if (!battler) return;
        battler._hp = hp;
        // A player in real time spends their own MP and TP as they go; the host holds only a copy.
        if (!(fight.isAction() && unit.party)) { battler._mp = mp; battler._tp = tp; }
        const held = battler._states || [];
        if (states.length !== held.length || states.some(id => !held.includes(id))) {
            battler._states = states.slice();
            for (const id of states) if (battler._stateTurns[id] === undefined) battler._stateTurns[id] = 1;
        }
        if (hp <= 0 && !unit.defeated) fight.defeat(unit);
    },

    applySync(fight, rows) {
        for (const [id, hp, mp, tp, states, x, y, direction, team] of rows) {
            const unit = fight.unit(id), character = unit ? fight.character(unit) : null;
            if (!unit) continue;
            unit.team = this.localTeam(team);
            this.applyNumbers(fight, unit, hp, mp, tp, states);
            if (fight.isAction()) continue;      // positions come by their own, faster way
            if (character && (character.x !== x || character.y !== y)) Game_CharacterBase.prototype.locate.call(character, x, y);
            if (character && !unit.defeated) character.setDirection(direction);
        }
        fight.touch();
    },

    /** A turn of the mirror's own: starts the next thing the host reported, once the last has played. */
    nextMirror(fight) {
        const inbox = this.inbox;
        while (inbox.length && ["sync", "unit", "gone", "team", "slots", "over", "rehost"].includes(inbox[0].t)) this.takeNote(fight, inbox.shift());
        const message = inbox.shift();
        if (!message) return;
        const unit = fight.unit(message.u);
        if (message.t === "turn") {
            if (unit && unit.party && fight.isAlive(unit)) { fight.beginUnit(unit); if (fight._act) fight._act.rodeAtStart = ReactorOnline.rideState?.()?.name || ""; }
        } else if (message.t === "walk") {
            this.playWalk(fight, unit, message.steps);
        } else if (message.t === "act") {
            // An action that can't be played still happened: its numbers land, and the battle goes on.
            try {
                this.playAction(fight, unit, message);
            } catch (error) {
                console.error("A shared action could not be played.", error);
                fight._run = null;
                fight._act = null;
                fight._phase = "queue";
                this.landLate(fight, message.hits);
            }
        } else if (message.t === "end") {
            this.finishMirror(fight, message.result);
        }
    },

    /** A note applied, or passed over when it is not what it says: a bad line must not stop the game's scene. */
    takeNote(fight, message) {
        try { this.applyNote(fight, message); } catch (error) { console.warn("A shared battle's note could not be read.", error); }
    },

    applyNote(fight, message) {
        if (message.t === "sync") { if (Array.isArray(message.rows)) this.applySync(fight, message.rows.filter(Array.isArray)); }
        else if (message.t === "unit") this.addForeign(fight, message.unit);
        else if (message.t === "gone") { const unit = fight.unit(message.u); if (unit) fight.removeUnit(unit); }
        else if (message.t === "team") { fight.tac().team = this.localTeam(message.team); fight._turn = message.turn; fight.touch(); }
        else if (message.t === "slots") { this.slots = new Set(message.slots.filter(slot => slot !== ReactorOnline.slot)); this.watching = message.watching || []; }
        else if (message.t === "rehost") this.onRehost(fight, message);
    },

    /** An act of the host's choosing: it plays like any unit's, and decides nothing. */
    beginPlayed(fight, unit, character, stage) {
        fight._act = { unitId: unit.id, steps: 0, stage, targetId: 0, player: false, played: true, origin: { x: character.x, y: character.y, d: character.direction() },
            moved: false, locked: false, path: null, through: false, speed: 4, item: null, back: "command", plan: null };
        fight._phase = "act";
    },

    playWalk(fight, unit, steps) {
        const character = unit ? fight.character(unit) : null, last = steps?.[steps.length - 1];
        // Our own unit walked as it was ordered.
        if (!character || !last || (character.x === last.x && character.y === last.y)) return;
        this.beginPlayed(fight, unit, character, "done");
        fight.startWalk(unit, character, steps);
    },

    playAction(fight, unit, message) {
        const character = unit ? fight.character(unit) : null, battler = unit ? fight.actingBattler(unit, message.via) : null;
        const targets = (message.targets || []).map(id => fight.unit(id)).filter(Boolean);
        if (!character || !battler) { this.landLate(fight, message.hits); return; }
        const action = new Game_Action(battler);
        if (message.kind === "skill") action.setSkill(message.id); else action.setItem(message.id);
        if (!action.item()) { this.landLate(fight, message.hits); return; }
        this.beginPlayed(fight, unit, character, "aim");
        const run = ReactorFight.makeRun(fight, unit, action, targets, message.via);
        run.cell = message.cell || { x: character.x, y: character.y };
        run.script = (message.hits || []).slice();
        run.quick = !!message.quick || this.inbox.length > this.BEHIND;
        fight._run = run;
        const act = fight._act;
        act.item = { kind: message.kind, id: message.id };
        act.targetId = targets[0]?.id || 0;
        if (run.cell.x !== character.x || run.cell.y !== character.y) {
            const dx = run.cell.x - character.x, dy = run.cell.y - character.y;
            character.setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8));
        }
    },

    /** Results with nobody to play them on: the numbers still land. */
    landLate(fight, hits) {
        for (const hit of hits || []) this.landScript(fight, hit, false);
    },

    /** One landing as the host rolled it. */
    landScript(fight, records, show) {
        for (const record of records) {
            const unit = fight.unit(record.u), battler = unit ? fight.battler(unit) : null;
            if (!battler) continue;
            const result = battler.result();
            result.clear();
            Object.assign(result, { used: true, success: true, missed: !!record.x, evaded: !!record.e, critical: !!record.c, hpDamage: record.d, mpDamage: record.m, hpAffected: !record.x && !record.e });
            battler._hp = record.hp;
            if (!(fight.isAction() && unit.party)) { battler._mp = record.mp; battler._tp = record.tp; }
            if (show) fight.popup(unit, battler);
            if (record.hp <= 0 && !unit.defeated) fight.defeat(unit);
            this.applyNumbers(fight, unit, record.hp, record.mp, record.tp, record.s);
        }
    },

    finishMirror(fight, result) {
        const F = ReactorFight, mine = this.side;
        if (mine === "watch") { this.ending = true; fight.end(F.ESCAPE, true); this.ending = false; return; }
        const won = result === F.ESCAPE ? F.ESCAPE : (result === F.WIN ? mine === "ally" : mine !== "ally" && !fight.units({ alive: true }).some(unit => unit.team !== "ally")) ? F.WIN : F.LOSE;
        this.ending = true;
        fight.end(won);
        this.ending = false;
    },

    // ---- Two players, one fight ----

    /** The challenge was taken: a battle on the map with nobody else in it, held open until they arrive. */
    startDuel(name) {
        const F = ReactorFight, fight = $gameFight;
        if (this.role || fight.isActive() || !(SceneManager._scene instanceof Scene_Map) || $gameMap.isEventRunning()) { this.tell("You can't start that fight right now."); return; }
        const mode = F.isOnMap(F.modeInForce?.()) ? F.modeInForce() : "tactical";
        if (!fight.start({ mode, taken: [], canEscape: true, canLose: true })) return;
        fight._duel = { against: name, until: performance.now() + this.DUEL_WAIT_MS };
        ReactorOnlineChat.note("Waiting for " + name + " to arrive…");
    },

    /** Agreed to fight: the challenger's battle is joined on the other side as soon as it is seen. */
    expectDuel(name) {
        this.duelWith = { name, until: performance.now() + this.DUEL_WAIT_MS };
    },

    /** Whose turn it is to host: the lowest slot left, so every game works out the same one. */
    successor() {
        const mine = this.side === "watch" ? [] : [ReactorOnline.slot];
        return Math.min(...mine, ...[...this.slots].filter(slot => slot !== this.hostSlot));
    },

    hostGone() {
        const fight = $gameFight, next = this.successor();
        if (fight?._ending) return;     // it ended; the screen is only saying so
        if (this.classic || !fight?._mirror || !Number.isFinite(next)) { this.onLost(); return; }
        if (next === ReactorOnline.slot) { this.takeOver(fight); return; }
        // Give them time to take it; if they don't, the battle is over.
        if (performance.now() - this._heard > this.GONE_MS * 6) this.onLost();
    },

    /**
     * This game becomes the battle's host. It already holds every unit and every number: it starts thinking
     * for itself from the next round, and tells the others under a new battle id, which names the old one.
     */
    takeOver(fight) {
        const was = this.id, gone = this.hostSlot, guests = new Map();
        for (const slot of this.watching || []) if (slot !== ReactorOnline.slot) guests.set(slot, { name: "Player", team: "watch", units: [], seen: performance.now() });
        for (const unit of fight._units) {
            if (unit.gone || unit.owner === undefined || unit.owner < 0) continue;
            if (unit.owner === gone) { unit.owner = -1; fight.removeUnit(unit); continue; }
            unit.remoteSlot = unit.owner;
            const guest = guests.get(unit.owner) || { name: unit.enemy?.name?.() || "Player", team: unit.team, units: [], seen: performance.now() };
            guest.units.push(unit.id);
            guests.set(unit.owner, guest);
        }
        fight._mirror = false;
        fight._act = null;
        fight._run = null;
        fight._queue = [];
        fight._phase = "round";
        const realTime = this.realTime, mode = fight.mode();
        const slots = new Set([...guests].filter(([, guest]) => guest.team !== "watch").map(([slot]) => slot));
        this.reset();
        this.role = "host";
        this.hostMode = mode;
        this.realTime = realTime;
        this.guests = guests;
        this.slots = slots;
        const sides = {};
        for (const [slot, guest] of guests) sides[slot] = guest.team;
        for (const guest of guests.values()) guest.seen = performance.now() + this.GONE_MS;
        this.send({ t: "rehost", host: ReactorOnline.slot, sides, units: fight._units.filter(unit => !unit.gone).map(unit => [unit.id, unit.team]) });
        this.sendSlots();
        ReactorOnline.post("bOpen", { x: $gamePlayer.x, y: $gamePlayer.y, mode, was, sides: Object.assign({ [ReactorOnline.myName || "?"]: "ally" }), members: [...guests.keys()] }, Object.assign(this.identity(), { m: $gameMap.mapId() }))
            .then(answer => { if (this.role === "host") this.id = answer.id; }, () => null);
        ReactorOnlineChat.note("The host left, so this battle now runs on your game.");
    },

    /** The new host's log, from its start. */
    follow(battle) {
        this.id = battle.id;
        this.asked.add(battle.id);
        this.offset = 0;
        this.hostSlot = battle.host;
        this._heard = performance.now();
        ReactorOnlineChat.note(battle.name + " is now hosting the battle.");
    },

    onRehost(fight, message) {
        this.hostSlot = message.host;
        if (this.side !== "watch") this.side = message.sides[ReactorOnline.slot] || this.side;
        // The new host's names are the battle's now, and our own side is still ours.
        for (const [id, team] of message.units) { const unit = fight.unit(id); if (unit) unit.team = this.localTeam(team); }
        // Units of the host who left aren't in the list.
        const kept = new Set(message.units.map(entry => entry[0]));
        for (const unit of fight._units) if (!unit.gone && !kept.has(unit.id) && unit.team !== "neutral") fight.removeUnit(unit);
        fight.touch();
    },

    /** The host stopped answering, or the battle is gone. */
    onLost() {
        const fight = $gameFight;
        if (this.role === "host") { this.reset(); return; }
        if (this.classic) { ReactorOnlineClassic.lost(); return; }
        if (this.role === "guest" && fight?._mirror) {
            this.ending = true;
            fight.end(ReactorFight.ESCAPE, true);
            this.ending = false;
            ReactorOnlineChat.note("The battle ended.");
        } else this.reset();
    },

    /** Leaving the game: a host's battle ends, a guest's stays for the others. */
    leave() {
        if (this.role === "guest" && this.id) {
            this.send({ t: "leave" });
            this.sayAll(this.id);
        } else if (this.role === "host") this.close();
        if (this.role) this.reset();
    }
};

ReactorOnlineBattle.reset();

// ---- The battle, online ----

if (typeof Game_Fight !== "undefined" && typeof ReactorFight !== "undefined") (function(B, F) {
    const wrap = (name, make) => { Game_Fight.prototype[name] = make(Game_Fight.prototype[name]); };

    wrap("start", original => function(options) {
        const serial = original.call(this, options);
        if (serial && !B.starting) { this._mirror = false; B.open(this); }
        return serial;
    });

    wrap("update", original => function() {
        if (B.role === "host") B.hostTick(this);
        // The end of a battle doesn't wait for anyone's turn.
        if (this._mirror && !this.isAction() && !this._ending) {
            const end = B.inbox.findIndex(message => message.t === "end");
            if (end >= 0) {
                const told = B.inbox.splice(0, end + 1), last = told.pop();
                for (const message of told) if (message.t === "sync") B.applyNote(this, message);
                this._act = null;
                this._run = null;
                B.finishMirror(this, last.result);
            }
        }
        // Someone watching has nothing to do but leave.
        if (this._mirror && B.side === "watch" && !this._ending && Input.isTriggered("cancel")) this.end(F.ESCAPE, true);
        original.call(this);
    });

    // -- What the host reports --

    wrap("addUnit", original => function(spec) {
        const unit = original.call(this, spec);
        if (unit && B.role === "host" && B.guests.size) B.pendingUnits.push(unit);
        return unit;
    });

    wrap("removeUnit", original => function(unit, keep) {
        if (B.role === "host" && unit && !unit.gone && B.guests.size) B.send({ t: "gone", u: unit.id });
        original.call(this, unit, keep);
    });

    wrap("startWalk", original => function(unit, character, steps) {
        if (B.role === "host" && B.guests.size) B.send({ t: "walk", u: unit.id, steps: JSON.parse(JSON.stringify(steps)) });
        else if (this._mirror && this._act?.player) this._act.walked = JSON.parse(JSON.stringify(steps));
        original.call(this, unit, character, steps);
    });

    wrap("detachWalk", original => function(unit, character, steps, watch, plan, aside) {
        if (B.role === "host" && B.guests.size) B.send({ t: "walk", u: unit.id, steps: JSON.parse(JSON.stringify(steps)) });
        original.call(this, unit, character, steps, watch, plan, aside);
    });

    const makeRun = F.makeRun;
    F.makeRun = function(fight, unit, action, targets, via) {
        const run = makeRun.call(this, fight, unit, action, targets, via);
        if (B.role === "host") run.landed = [];
        return run;
    };

    wrap("landHits", original => function(run, action, targets, count, first, total) {
        if (this.isAction()) { ReactorOnlineAction.landHits(this, original, run, action, targets, count, first, total); return; }
        if (this._mirror) { B.landScript(this, run.script?.shift() || [], true); return; }
        original.call(this, run, action, targets, count, first, total);
        if (B.role !== "host" || !run.landed) return;
        const records = [];
        for (const target of targets) {
            const battler = this.battler(target);
            if (!battler) continue;
            const result = battler.result();
            records.push({ u: target.id, d: result.hpDamage, m: result.mpDamage, c: result.critical ? 1 : 0, x: result.missed ? 1 : 0, e: result.evaded ? 1 : 0,
                hp: battler.hp, mp: battler.mp, tp: battler.tp, s: battler.states().map(state => state.id) });
        }
        run.landed.push(records);
    });

    wrap("finishHits", original => function(run, action) {
        if (this._mirror) {
            if (run.applied) return;
            run.applied = true;
            while (run.script?.length) B.landScript(this, run.script.shift(), true);
            return;
        }
        const first = !run.applied;
        original.call(this, run, action);
        if (first && B.role === "host" && B.guests.size) {
            B.send({ t: "act", u: run.subjectId, kind: run.kind, id: run.itemId, via: run.via, cell: run.cell, targets: run.targetIds, hits: run.landed || [], quick: !!run.quick });
        }
    });

    wrap("beginUnit", original => function(unit) {
        original.call(this, unit);
        if (B.role === "host" && unit.remoteSlot !== undefined && this._act) {
            this._act.stage = "await";
            this._act.deadline = performance.now() + B.TURN_MS;
            B.sendSync(this);
            B.send({ t: "turn", u: unit.id, to: unit.remoteSlot });
            this.touch();
        }
    });

    wrap("nextInQueue", original => function() {
        if (this._mirror) { B.nextMirror(this); return; }
        const entry = this._queue[0];
        if (B.role === "host" && entry?.kind === "turnStart" && B.guests.size) {
            const key = entry.team + "." + this._turn;
            if (key !== B._teamSent) { B._teamSent = key; B.send({ t: "team", team: entry.team, turn: this._turn }); }
        }
        original.call(this);
    });

    wrap("updateAct", original => function() {
        if (this._act?.stage === "await") { B.awaitOrders(this); return; }
        original.call(this);
    });

    wrap("end", original => function(result, quiet) {
        if (this._mirror && !B.ending) B.send({ t: "leave" });
        else if (B.role === "host" && this._active && !this._ending) { B.sendSync(this, true); B.send({ t: "end", result }); }
        original.call(this, result, quiet);
    });

    wrap("finish", original => function() {
        const units = this._units.slice(), mirror = this._mirror, host = B.role === "host";
        original.call(this);
        // Whoever stood for another player goes with the battle.
        if (host || mirror) for (const unit of units) {
            if (!unit.eventId || (unit.remoteSlot === undefined && !unit.clone && !mirror)) continue;
            $gameMap.event(unit.eventId)?.erase();
        }
        this._mirror = false;
        if (host) B.close();
        else if (mirror) { if (B.id) B.sayAll(B.id); B.reset(); }
    });

    /** With other players in it, a battle lasts until one side stands, whoever's game it is on. */
    wrap("checkOutcome", original => function(roundEnded) {
        if (this._mirror) return;
        // A fight with another player waits for them; one who never comes leaves it unfought.
        if (this._duel && !B.guests.size && B.role === "host") {
            if (performance.now() > this._duel.until) { this.end(F.ESCAPE, true); ReactorOnlineChat.note(this._duel.against + " didn't come."); }
            return;
        }
        const goal = this._options?.objective;
        if (B.role !== "host" || !B.guests.size || !this._active || this._ending) { original.call(this, roundEnded); return; }
        // Falling here is losing a fight, not the game: other people are still playing.
        this._options.canLose = true;
        for (const unit of this._units) if (unit.down && this.battler(unit)?.isAlive()) unit.down = false;
        const standing = new Set(this.units({ alive: true }).filter(unit => unit.team !== "neutral").map(unit => unit.team));
        // Any other goal stands while the host's side does; a side that has fallen can't reach it.
        if (goal && goal.type !== "defeatAll" && standing.has("ally")) { original.call(this, roundEnded); return; }
        if (standing.size <= 1) this.end(standing.has("ally") ? F.WIN : F.LOSE);
    });

    // -- What only a host decides --

    wrap("startRound", original => function() {
        if (this._mirror && !this.isAction()) { this._phase = "queue"; return; }
        original.call(this);
    });

    for (const name of ["fireHooks", "updateTroopPages", "checkEnterHooks"]) {
        wrap(name, original => function(...args) { return this._mirror ? false : original.apply(this, args); });
    }

    // -- A mirror's own orders --

    wrap("character", original => function(unit) {
        if (unit?.peerSlot !== undefined) return ReactorOnline.peers.get(unit.peerSlot) || null;
        return original.call(this, unit);
    });

    // A guest's vehicle fights with the numbers their game reported.
    // An action finds its subject in the troop: a vehicle a remote player fights with stands there too.
    // In real time other people are playing: a message on the host's screen doesn't stop their battle.
    wrap("isBusy", original => function() {
        if (!(this.isAction?.() && B.role === "host" && B.guests.size && $gameMessage.isBusy())) return original.call(this);
        const busy = $gameMessage.isBusy;
        $gameMessage.isBusy = () => false;
        try { return original.call(this); } finally { $gameMessage.isBusy = busy; }
    });

    wrap("syncTroop", original => function() {
        original.call(this);
        if (typeof $gameTroop === "undefined" || !$gameTroop) return;
        for (const unit of this._units) if (unit.vehicleBattler && !unit.gone) $gameTroop._enemies.push(unit.vehicleBattler);
    });

    wrap("actingBattler", original => function(unit, via) {
        return via === "vehicle" && unit?.vehicleBattler ? unit.vehicleBattler : original.call(this, unit, via);
    });

    wrap("beginAction", original => function(unit, kind, id, cx, cy, via) {
        const act = this._act;
        if (!this._mirror || !act?.player) return original.call(this, unit, kind, id, cx, cy, via);
        B.send(Object.assign({ t: "plan", u: unit.id, steps: act.walked || [], kind, id, cx, cy, via }, B.whereNow(this, unit, act)));
        act.sent = true;
        this.finishAct();
        return true;
    });

    wrap("finishAct", original => function() {
        const act = this._act;
        if (this._mirror && act?.player && act.unitId && !act.sent) {
            act.sent = true;
            B.send(Object.assign({ t: "plan", u: act.unitId, steps: act.walked || [] }, B.whereNow(this, this.unit(act.unitId), act)));
        }
        original.call(this);
    });

    wrap("commandUndoMove", original => function() {
        const done = original.call(this);
        if (done && this._mirror && this._act) this._act.walked = null;
        return done;
    });
})(ReactorOnlineBattle, ReactorFight);

// A player's unit wears their character.
if (typeof Reactor3D !== "undefined") {
    const modelOf = Reactor3D._characterModelSpec;
    Reactor3D._characterModelSpec = function(character) {
        const look = character?._rrOnlineLook;
        if (look) {
            const peer = look.leader ? ReactorOnline.peers.get(look.slot) : null;
            if (peer?.inside) return null;      // shut in a vehicle, as they are on their own game
            if (peer?.modelSpec) return peer.modelSpec;
            return this.databaseModelSpecOfProject(look.actorId);
        }
        return modelOf.call(this, character);
    };
}
