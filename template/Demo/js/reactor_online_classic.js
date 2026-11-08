//=============================================================================
// reactor_online_classic.js: other players on your Classic battle screen
//=============================================================================
// The same shape as a shared Tactical battle (reactor_online_battle.js): the
// game that started the battle hosts it and rolls every action, and each
// player who joins runs a battle screen that plays what the host reports and
// sends back its orders.
//
//   Join the host's side: their actors stand in each other's parties, and the
//   troop is the same. Fight them: each sees the other's party as the troop.
//   The host's own monsters are on a challenger's side, so a challenger's
//   screen doesn't show them; what they do is told in the battle log.
//
// A mirror runs turn by turn whatever the project's battle system is: the
// host's clock decides when each order is wanted. Battlers are named by keys
// every game understands: `h<actor>`, `e<troop index>`, `g<slot>.<actor>`.
// Design: docs/DESIGN-ONLINE.md#shared-battles.
//=============================================================================

/** Someone else's actor in this game's party, for one battle. */
function Game_RemoteAlly() {
    this.initialize(...arguments);
}

const ReactorOnlineClassic = {
    FIRST_ACTOR_ID: 9000,
    FIRST_ENEMY_ID: 900000,
    ORDER_MS: 60000,

    mirror: false,
    side: "",
    byKey: new Map(),
    keys: new Map(),
    awaiting: new Map(),
    orders: new Map(),
    looks: new Map(),
    allies: [],
    enemyIds: [],
    hits: [],
    holdTurn: false,
    record: null,

    reset() {
        this.mirror = false;
        this.side = "";
        this.byKey.clear();
        this.keys.clear();
        this.awaiting.clear();
        this.orders.clear();
        this.hits = [];
        this.holdTurn = false;
        this.record = null;
        this.known = new Map();
    },

    active() {
        return this.mirror || (ReactorOnlineBattle.role === "host" && ReactorOnlineBattle.hostMode === "classic");
    },

    name(key, battler) {
        this.byKey.set(key, battler);
        this.keys.set(battler, key);
        battler._rrKey = key;
    },

    // ---- Battlers ----

    /** A temporary actor record, copied from the one they play as, so the rest of the game sees an ordinary actor. */
    addAlly(snapshot, slot) {
        let id = this.FIRST_ACTOR_ID;
        while ($dataActors[id]) id++;
        // An actor this game does not have (another version of it, or a made-up id) borrows the first party member's
        // record: an actor with no class would stop the battle.
        const base = $dataActors[snapshot.actorId] || $dataActors[$dataSystem.partyMembers?.[0]] || $dataActors.find(actor => actor);
        $dataActors[id] = Object.assign({}, base, { id, name: snapshot.name, rrTemporary: true });
        const ally = new Game_RemoteAlly(id, snapshot);
        $gameActors._data[id] = ally;
        $gameParty._actors.push(id);
        this.allies.push(id);
        this.looks.set(id, { slot, actorId: snapshot.actorId, leader: !!snapshot.leader });
        $gamePlayer?.refresh?.();
        return ally;
    },

    /** Someone else's actor in the troop, placed along the troop's side of the screen. */
    addOpponent(snapshot, slot) {
        const count = $gameTroop._enemies.length, id = this.FIRST_ENEMY_ID + this.looks.size + 1;
        const enemy = new Game_RemoteActor(snapshot);
        enemy._enemyId = id;
        // Plugins read the Database by id, as they do for any enemy: this one lasts the battle.
        $dataEnemies[id] = enemy.enemy();
        this.enemyIds.push(id);
        enemy._screenX = Math.round(Graphics.boxWidth * (0.18 + (count % 2) * 0.14));
        enemy._screenY = Math.round(Graphics.boxHeight * 0.34 + (count % 4) * 62);
        $gameTroop._enemies.push(enemy);
        this.looks.set(id, { slot, actorId: snapshot.actorId, leader: !!snapshot.leader });
        const spriteset = SceneManager._scene?._spriteset;
        if (spriteset?._enemySprites && spriteset._battleField) {
            const sprite = new Sprite_Enemy(enemy);
            spriteset._enemySprites.push(sprite);
            spriteset._battleField.addChild(sprite);
        }
        return enemy;
    },

    /** Temporary actors go when the battle does; nothing of them reaches a save. */
    clearAllies() {
        for (const id of this.enemyIds.splice(0)) { delete $dataEnemies[id]; this.looks.delete(id); }
        if (!this.allies.length) return;
        const gone = new Set(this.allies);
        $gameParty._actors = $gameParty._actors.filter(id => !gone.has(id));
        for (const id of gone) { delete $gameActors._data[id]; delete $dataActors[id]; this.looks.delete(id); }
        this.allies = [];
        $gamePlayer?.refresh?.();
    },

    numbers(battler) {
        return { hp: battler.hp, mp: battler.mp, tp: battler.tp, states: battler.states().map(state => state.id) };
    },

    setNumbers(battler, hp, mp, tp, states) {
        battler._hp = hp;
        battler._mp = mp;
        battler._tp = tp;
        const held = battler._states || [];
        if (states.length !== held.length || states.some(id => !held.includes(id))) {
            battler._states = states.slice();
            for (const id of states) if (battler._stateTurns[id] === undefined) battler._stateTurns[id] = 1;
        }
        if (hp <= 0 && !battler.isStateAffected(battler.deathStateId())) battler.addNewState(battler.deathStateId());
        else if (hp > 0 && battler.isStateAffected(battler.deathStateId())) battler.removeState(battler.deathStateId());
    },

    // ---- Hosting ----

    open() {
        const B = ReactorOnlineBattle;
        if (B.role || !ReactorOnline.config?.() || ReactorOnline.slot < 0 || !$gameMap?.mapId()) return;
        B.openAs("classic");
        this.reset();
        $gameParty.battleMembers().forEach(actor => this.name("h" + actor.actorId(), actor));
        $gameTroop.members().forEach((enemy, index) => this.name("e" + index, enemy));
    },

    /** Each frame of a hosted battle: arrivals, orders that came, orders that never will. */
    tick() {
        const B = ReactorOnlineBattle, manager = BattleManager, now = performance.now();
        for (const { message, from } of B.joins.splice(0)) this.addGuest(message, from);
        for (const [key, order] of this.orders) {
            const battler = this.byKey.get(key);
            if (this.awaiting.has(key) && battler) { this.obey(battler, order); this.awaiting.delete(key); }
            this.orders.delete(key);
        }
        for (const [key, since] of this.awaiting) {
            if (now - since < this.ORDER_MS) continue;
            const battler = this.byKey.get(key);
            this.awaiting.delete(key);
            if (battler) this.obey(battler, null);
        }
        if (this.holdTurn && !this.awaiting.size) { this.holdTurn = false; this.startTurn.call(manager); }
        if (now >= (this._nextSync || 0) && B.guests.size) {
            this._nextSync = now + B.SYNC_MS;
            for (const [slot, guest] of B.guests) {
                if (ReactorOnline.peers.has(slot)) guest.seen = now;
                else if (now - guest.seen > B.GONE_MS) this.dropGuest(slot);
            }
            this.sendSync();
        }
    },

    addGuest(message, from) {
        const B = ReactorOnlineBattle, team = message.side === "ally" ? "ally" : "enemy";
        if (B.guests.has(from) || BattleManager._phase === "battleEnd" || !BattleManager._phase) return;
        BattleManager._canLose = true;
        const units = [];
        for (const member of (message.members || []).slice(0, 8)) {
            const battler = team === "ally" ? this.addAlly(member, from) : this.addOpponent(member, from);
            const key = "g" + from + "." + member.actorId;
            this.name(key, battler);
            battler.onBattleStart?.();
            units.push(key);
        }
        B.guests.set(from, { name: message.name || "Player", team, units, seen: performance.now() });
        B.slots.add(from);
        SceneManager._scene?._statusWindow?.refresh?.();
        const list = [];
        for (const [key, battler] of this.byKey) {
            const onParty = battler.isActor(), human = key[0] !== "e";
            list.push(Object.assign({ key, party: onParty, name: battler.name(), owner: human ? (key[0] === "g" ? Number(key.slice(1).split(".")[0]) : ReactorOnline.slot) : -1,
                snapshot: human ? (battler._snapshot || ReactorOnlineBattle.snapshot(battler)) : null }, this.numbers(battler)));
        }
        B.send({ t: "croster", to: from, side: team, troopId: $gameTroop._troopId, units: list });
        B.sendSlots();
        B._nextBeat = 0;
        // They're wanted at once in a turn being chosen; otherwise when their clock or the next turn says.
        if (BattleManager._phase === "input" || this.holdTurn) this.want(units);
        else if (BattleManager.isTpb()) this.want(units);
        ReactorOnlineChat.note(message.name + " joined the battle.");
    },

    dropGuest(slot) {
        const B = ReactorOnlineBattle, guest = B.guests.get(slot);
        if (!guest) return;
        B.guests.delete(slot);
        B.slots.delete(slot);
        for (const key of guest.units) {
            const battler = this.byKey.get(key);
            this.awaiting.delete(key);
            if (!battler) continue;
            if (battler.isActor()) { $gameParty._actors = $gameParty._actors.filter(id => id !== battler.actorId()); }
            else { battler.hide(); $gameTroop._enemies = $gameTroop._enemies.filter(enemy => enemy !== battler); }
            this.byKey.delete(key);
        }
        SceneManager._scene?._statusWindow?.refresh?.();
        B.sendSlots();
        B._nextBeat = 0;
        ReactorOnlineChat.note(guest.name + " left the battle.");
        BattleManager.checkBattleEnd();
    },

    want(keys) {
        const fresh = keys.filter(key => !this.awaiting.has(key) && this.byKey.get(key)?.canMove?.());
        for (const key of fresh) this.awaiting.set(key, performance.now());
        if (fresh.length) ReactorOnlineBattle.send({ t: "ready", keys: fresh });
    },

    guestKeys() {
        return [...this.byKey.keys()].filter(key => key[0] === "g");
    },

    /** What a player chose becomes their battler's action; no order means they guard. */
    obey(battler, order) {
        const action = new Game_Action(battler);
        if (order?.kind === "item") action.setItem(order.id);
        else if (order?.id) action.setSkill(order.id);
        else action.setGuard();
        const target = order?.target ? this.byKey.get(order.target) : null;
        if (target) action.setTarget(target.index());
        battler._actions = [action];
        if (BattleManager.isTpb()) {
            battler.startTpbCasting();
            battler.setActionState("waiting");
        }
    },

    sendSync() {
        const rows = [];
        for (const [key, battler] of this.byKey) {
            const { hp, mp, tp, states } = this.numbers(battler), row = [key, hp, mp, tp, states], text = JSON.stringify(row);
            if (this.known.get(key) !== text) { this.known.set(key, text); rows.push(row); }
        }
        if (rows.length) ReactorOnlineBattle.send({ t: "csync", rows });
    },

    // ---- Mirroring ----

    begin(roster) {
        const B = ReactorOnlineBattle;
        this.reset();
        this.clearAllies();
        this.mirror = true;
        this.side = roster.side;
        B.role = "guest";
        B.classic = true;
        B._heard = performance.now();
        BattleManager.setup(roster.troopId > 0 ? roster.troopId : 1, true, true);
        const ally = roster.side === "ally";
        if (!ally) $gameTroop._enemies = [];
        for (const unit of roster.units) {
            const mine = unit.owner === ReactorOnline.slot ? $gameActors.actor(unit.snapshot?.actorId) : null;
            const sameSide = ally ? unit.party : !unit.party;
            let battler = mine;
            if (!battler && unit.snapshot) {
                battler = sameSide ? this.addAlly(unit.snapshot, unit.owner) : this.addOpponent(unit.snapshot, unit.owner);
                B.slots.add(unit.owner);
            } else if (!battler && ally) battler = $gameTroop.members()[Number(unit.key.slice(1))] || null;
            if (battler) { this.name(unit.key, battler); this.setNumbers(battler, unit.hp, unit.mp, unit.tp, unit.states); }
            else this.byKey.set(unit.key, null);
        }
        $gamePlayer.makeEncounterCount();
        SceneManager.push(Scene_Battle);
    },

    /** The whole of a mirror's battle, each frame: what the last report left playing, then the next report. */
    updateMirror() {
        const B = ReactorOnlineBattle, manager = BattleManager;
        if (manager.isBusy()) return;
        if (manager._phase === "start") { manager._phase = "turn"; return; }
        if (manager._phase === "action") { manager.updateAction(); return; }
        if (manager._phase === "battleEnd") { manager.updateBattleEnd(); return; }
        const message = B.inbox.shift();
        if (message) this.play(message);
    },

    play(message) {
        const B = ReactorOnlineBattle;
        if (message.t === "ready") this.askOrders(message.keys);
        else if (message.t === "csync") for (const [key, hp, mp, tp, states] of message.rows) { const battler = this.byKey.get(key); if (battler) this.setNumbers(battler, hp, mp, tp, states); }
        else if (message.t === "cact") this.playAction(message);
        else if (message.t === "cend") this.finish(message.result);
        else if (message.t === "slots") B.slots = new Set(message.slots.filter(slot => slot !== ReactorOnline.slot));
        SceneManager._scene?._statusWindow?.refresh?.();
    },

    askOrders(keys) {
        const manager = BattleManager, actors = keys.map(key => this.byKey.get(key)).filter(battler => battler?.isActor() && !(battler instanceof Game_RemoteAlly));
        if (!actors.length) return;
        for (const actor of actors) {
            actor._rrWanted = true;
            actor.makeActions();
            actor.setActionState("undecided");
        }
        manager._inputting = true;
        if (!manager._currentActor) {
            manager._currentActor = actors[0];
            manager.startActorInput();
        }
    },

    sendOrders() {
        const orders = [];
        for (const actor of $gameParty.members()) {
            if (!actor._rrWanted) continue;
            actor._rrWanted = false;
            const action = actor.currentAction(), item = action?.item(), unit = action?.isForFriend() ? action.friendsUnit() : action?.opponentsUnit();
            const target = action && action._targetIndex >= 0 ? unit.members()[action._targetIndex] : null;
            orders.push({ key: actor._rrKey, kind: action?.isSkill() ? "skill" : "item", id: item?.id || 0, target: target ? this.keys.get(target) : "" });
            actor.clearActions();
        }
        if (orders.length) ReactorOnlineBattle.send({ t: "orders", orders });
    },

    tell(text) {
        BattleManager._logWindow?.addText?.(text);
    },

    /** Numbers landed on someone here, and what the log says of them. */
    land(hit, subject) {
        const target = this.byKey.get(hit.t);
        if (!target) return null;
        const result = target.result();
        result.clear();
        Object.assign(result, { used: true, success: true, missed: !!hit.x, evaded: !!hit.e, critical: !!hit.c, hpDamage: hit.d, mpDamage: hit.m, hpAffected: !hit.x && !hit.e });
        this.setNumbers(target, hit.hp, hit.mp, hit.tp, hit.s);
        return target;
    },

    playAction(message) {
        const manager = BattleManager, subject = this.byKey.get(message.s);
        const item = message.kind === "skill" ? $dataSkills[message.id] : $dataItems[message.id];
        if (!subject) {
            // One of the host's monsters, on a challenger's own side.
            this.tell(message.name + ": " + (item?.name || ""));
            for (const hit of message.hits) this.land(hit, null);
            return;
        }
        const action = new Game_Action(subject);
        if (message.kind === "skill") action.setSkill(message.id); else action.setItem(message.id);
        const targets = [...new Set(message.hits.map(hit => hit.t))].map(key => this.byKey.get(key)).filter(Boolean);
        this.hits = message.hits.slice();
        manager._subject = subject;
        manager._action = action;
        manager._targets = targets;
        manager._phase = "action";
        subject.cancelMotionRefresh();
        manager._logWindow.startAction(subject, action, targets);
    },

    finish(result) {
        const manager = BattleManager, ally = this.side === "ally";
        const mine = result === 1 ? 1 : ally ? result : result === 0 ? 2 : 0;
        if (mine === 0) manager.processVictory();
        else if (mine === 2) manager.processDefeat();
        else { manager._escaped = true; manager.endBattle(1); }
    },

    /** The battle ended under them: the host left. */
    lost() {
        const manager = BattleManager;
        if (!this.mirror || manager._phase === "battleEnd") return;
        manager._escaped = true;
        manager.endBattle(1);
        ReactorOnlineChat.note("The battle ended.");
    }
};

ReactorOnlineClassic.known = new Map();

if (typeof Game_Actor !== "undefined") {
    Game_RemoteAlly.prototype = Object.create(Game_Actor.prototype);
    Game_RemoteAlly.prototype.constructor = Game_RemoteAlly;
    Game_RemoteAlly.prototype.isRemoteActor = true;

    Game_RemoteAlly.prototype.initialize = function(actorId, snapshot) {
        this._snapshot = snapshot;
        Game_Actor.prototype.initialize.call(this, actorId);
        this._level = snapshot.level || this._level;
        this._hp = snapshot.hp;
        this._mp = snapshot.mp;
        this._tp = snapshot.tp || 0;
    };

    Game_RemoteAlly.prototype.paramBase = function(paramId) { return this._snapshot.params[paramId]; };
    Game_RemoteAlly.prototype.paramPlus = function() { return 0; };
    Game_RemoteAlly.prototype.canInput = function() { return false; };
    Game_RemoteAlly.prototype.isAutoBattle = function() { return false; };
    Game_RemoteAlly.prototype.gainExp = function() {};
}

// The host's clock wants a remote battler's order, however it charged.
for (const prototype of [typeof Game_RemoteAlly !== "undefined" ? Game_RemoteAlly.prototype : null, typeof Game_RemoteActor !== "undefined" && Game_RemoteActor.prototype.isRemoteActor ? Game_RemoteActor.prototype : null]) {
    if (!prototype) continue;
    prototype.makeTpbActions = function() {
        if (ReactorOnlineBattle.role !== "host") return;
        this.clearActions();
        this.setActionState("undecided");
        ReactorOnlineClassic.want([this._rrKey]);
    };
    // Turn by turn the order fills this in: these battlers decide nothing for themselves.
    prototype.makeActions = function() {
        Game_Battler.prototype.makeActions.call(this);
    };
}

if (typeof BattleManager !== "undefined") (function(K, M, B) {
    const wrap = (name, make) => { M[name] = make(M[name]); };

    wrap("startBattle", original => function() {
        original.call(this);
        if (!K.mirror) K.open();
    });

    wrap("update", original => function(timeActive) {
        if (K.mirror) { K.updateMirror(); return; }
        original.call(this, timeActive);
    });

    wrap("isTpb", original => function() { return K.mirror ? false : original.call(this); });

    // -- What the host reports --

    wrap("startInput", original => function() {
        original.call(this);
        if (K.active() && !K.mirror) K.want(K.guestKeys());
    });

    K.startTurn = M.startTurn;
    wrap("startTurn", original => function() {
        if (K.mirror) {
            K.sendOrders();
            this._inputting = false;
            this._currentActor = null;
            return;
        }
        // The turn waits for everyone's orders.
        if (K.active() && K.awaiting.size) { K.holdTurn = true; this._inputting = false; this._phase = "await"; return; }
        original.call(this);
    });

    wrap("startAction", original => function() {
        if (K.active() && !K.mirror) {
            const action = this._subject.currentAction(), item = action.item();
            K.record = { t: "cact", s: this._subject._rrKey || "", name: this._subject.name(), kind: DataManager.isSkill(item) ? "skill" : "item", id: item.id, hits: [] };
        }
        original.call(this);
    });

    wrap("invokeAction", original => function(subject, target) {
        if (K.mirror) {
            const hits = K.hits.filter(hit => hit.t === target._rrKey);
            K.hits = K.hits.filter(hit => hit.t !== target._rrKey);
            this._logWindow.push("pushBaseLine");
            for (const hit of hits) { K.land(hit, subject); this._logWindow.displayActionResults(subject, target); }
            this._logWindow.push("popBaseLine");
            return;
        }
        original.call(this, subject, target);
        if (!K.record || !K.active()) return;
        for (const battler of [target, subject]) {
            const result = battler.result(), numbers = K.numbers(battler);
            if (!battler._rrKey || (battler === subject && !result.used)) continue;
            K.record.hits.push({ t: battler._rrKey, d: result.hpDamage, m: result.mpDamage, c: result.critical ? 1 : 0, x: result.missed ? 1 : 0, e: result.evaded ? 1 : 0, hp: numbers.hp, mp: numbers.mp, tp: numbers.tp, s: numbers.states });
        }
    });

    wrap("endAction", original => function() {
        if (K.mirror) {
            this._logWindow.endAction(this._subject);
            this._phase = "turn";
            this._subject = null;
            return;
        }
        original.call(this);
        if (K.record && K.active()) {
            if (ReactorOnlineBattle.guests.size) ReactorOnlineBattle.send(K.record);
            K.record = null;
            K.sendSync();
        }
    });

    wrap("endBattle", original => function(result) {
        const hosting = K.active() && !K.mirror;
        if (hosting) { K.sendSync(); ReactorOnlineBattle.send({ t: "cend", result }); }
        original.call(this, result);
        if (hosting) { K.reset(); ReactorOnlineBattle.close(); }
    });

    wrap("updateBattleEnd", original => function() {
        const ended = this._phase === "battleEnd", mirror = K.mirror;
        original.call(this);
        if (ended && mirror) { K.reset(); ReactorOnlineBattle.reset(); }
    });

    // Windows read them until the very end: they go with the scene.
    const terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        terminate.call(this);
        K.clearAllies();
    };

    wrap("processEscape", original => function() {
        if (!K.mirror) return original.call(this);
        ReactorOnlineBattle.send({ t: "leave" });
        ReactorOnlineBattle.flushNow();
        this._escaped = true;
        this.endBattle(1);
        return true;
    });

    wrap("checkBattleEnd", original => function() {
        return K.mirror ? false : original.call(this);
    });

    const canInput = Game_Actor.prototype.canInput;
    Game_Actor.prototype.canInput = function() {
        if (K.mirror && !this._rrWanted) return false;
        return canInput.call(this);
    };
})(ReactorOnlineClassic, BattleManager, ReactorOnlineBattle);

// A player's battler wears their character, in the troop and in the party alike.
if (typeof Reactor3D !== "undefined") {
    const specOf = Reactor3D.databaseModelSpec;
    Reactor3D.databaseModelSpec = function(section, id) {
        const look = ReactorOnlineClassic.looks.get(id);
        if (look && (section === "actors" || section === "enemies")) {
            const peer = look.leader ? ReactorOnline.peers.get(look.slot) : null;
            return peer?.modelSpec || specOf.call(this, "actors", look.actorId);
        }
        return specOf.call(this, section, id);
    };
}
