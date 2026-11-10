//=============================================================================
// reactor_online_action.js: other players in your Action or First Person battle
//=============================================================================
// Nobody takes turns here, so nobody waits. Each player moves and aims on
// their own game, and their body reaches the others the way anyone's does,
// over the Engine's line. A player's unit stands on that body (`unit.peerSlot`:
// their Game_RemotePlayer), so enemies chase it and shots stop on it.
//
// The game that started the battle hosts it: it runs every enemy and rolls
// every blow. A guest's game runs no enemies. They walk where the host says,
// ten times a second, and shots seen on it are only pictures. What the guest's
// own weapon meets it reports as `ahit`, because a shooter should hit what
// they saw, and the host rolls it and tells everyone the result (`ares`).
//
// Messages take the Engine's relay when there is one (`bf`), and the battle's
// log when not. Design: docs/DESIGN-ONLINE.md#shared-battles.
//=============================================================================

const ReactorOnlineAction = {
    POSITION_MS: 100,
    RETARGET_FRAMES: 90,

    /** A message down the line to whoever needs it. False when it must go by the log instead. */
    fast(message) {
        const B = ReactorOnlineBattle, socket = ReactorOnlineSocket.socket;
        if (!socket) return false;
        const host = B.role === "host", to = host ? [...B.guests.keys()] : [B.hostSlot];
        if (message.to !== undefined) { socket.send(JSON.stringify({ t: "bf", to: [message.to], m: message })); return true; }
        socket.send(JSON.stringify({ t: "bf", to, m: message }));
        // Anyone without the line reads the log.
        return !(host && [...B.guests.values()].some(guest => guest.slow));
    },

    // ---- Hosting ----

    addGuest(fight, message, from, team) {
        const B = ReactorOnlineBattle, member = (message.members || [])[0];
        if (!member) return;
        const unit = fight.addUnit({ team: "enemy", record: "enemy", id: B.anyEnemyId() });
        if (!unit) { B.outbox.push({ t: "refuse", to: from, why: "There was no room in the battle." }); return; }
        unit.team = team;
        unit.enemy = new Game_RemoteActor(member);
        unit.remoteSlot = from;
        unit.peerSlot = from;
        fight.syncTroop();
        B.pendingUnits = B.pendingUnits.filter(entry => entry !== unit);
        B.guests.set(from, { name: message.name || "Player", team, units: [unit.id], slow: !!message.slow, seen: performance.now() });
        B.slots.add(from);
        B.send({ t: "unit", unit: B.record(fight, unit) });
        B.sendRoster(fight, from, team);
        B.sendSlots();
        B._nextBeat = 0;
        ReactorOnlineChat.note(message.name + " joined the battle.");
    },

    /** Each frame of a hosted battle: where the units the guests can't see for themselves have got to. */
    tick(fight, now) {
        if (now < (this._nextPosition || 0)) return;
        this._nextPosition = now + this.POSITION_MS;
        const known = this.placed || (this.placed = new Map()), rows = [];
        for (const unit of fight._units) {
            if (unit.gone || unit.peerSlot !== undefined || unit.team === "neutral") continue;
            const character = fight.character(unit);
            if (!character || character === $gamePlayer) continue;
            // The level it stands on too: a clone made where it started keeps that level as it walks otherwise,
            // and a shot or a lock aimed from another game goes over or under it.
            const ground = Math.round(ReactorFight.Action.groundOf(character) * 20) / 20;
            const place = character.x * 100000 + character.y * 10 + character.direction() / 2 + ground * 1e9;
            if (known.get(unit.id) === place) continue;
            known.set(unit.id, place);
            rows.push([unit.id, character.x, character.y, character.direction(), ground]);
        }
        if (rows.length) ReactorOnlineBattle.send({ t: "apos", rows });
    },

    onHost(fight, message, from) {
        if (message.t === "ahit") this.rollGuestHit(fight, message, from);
        else if (message.t === "astate") {
            const unit = fight._units.find(entry => entry.remoteSlot === from && !entry.gone);
            if (unit) { unit.remoteGuard = !!message.guard; unit.remoteSafeUntil = performance.now() + (message.safe || 0); }
        } else if (message.t === "afire" || message.t === "amotion") {
            // Only for the unit this guest plays: a shot or a motion for anyone else's is not shown or passed on.
            const unit = fight.unit(message.u);
            if (!unit || unit.remoteSlot !== from) return;
            this.play(fight, message);
            ReactorOnlineBattle.send(message);
        }
    },

    /** A guest's blow, on what they saw it meet. */
    rollGuestHit(fight, message, from) {
        const unit = fight.unit(message.u), A = ReactorFight.Action;
        if (unit?.remoteSlot !== from || !fight.isAlive(unit)) return;
        const targets = (Array.isArray(message.targets) ? message.targets.slice(0, 32) : []).map(id => fight.unit(id)).filter(target => target && fight.isAlive(target));
        if (!targets.length) return;
        this.fromGuest = true;
        // A blow's share is at most a whole one (a pellet's is a part of it): a larger one sent is not believed.
        const rate = Number.isFinite(message.rate) ? Math.max(0, Math.min(1, message.rate)) : 1;
        try { A.land(fight, unit, targets, message.kind, message.id, rate, 0, true); } finally { this.fromGuest = false; }
    },

    /**
     * Where a blow lands, in every battle of this kind: on a guest it goes to the host; on the host a guest's own
     * shot, seen here only as a picture, lands on nothing, because their game reports what it met.
     */
    landHits(fight, original, run, action, targets, count, first, total) {
        const B = ReactorOnlineBattle, subject = fight.unit(run.subjectId);
        if (fight._mirror) {
            if (subject?.party) B.send({ t: "ahit", u: subject.id, kind: run.kind, id: run.itemId, rate: run.rate || 1, targets: targets.map(target => target.id) });
            return;
        }
        if (B.role !== "host" || !B.guests.size) { original.call(fight, run, action, targets, count, first, total); return; }
        if (subject?.remoteSlot !== undefined && !this.fromGuest) return;
        const now = performance.now(), kept = targets.filter(target => !(target.remoteSafeUntil > now));
        for (const target of kept) fight.battler(target)?.clearResult();
        original.call(fight, run, action, kept, count, first, total);
        const hits = [];
        for (const target of kept) {
            const battler = fight.battler(target), result = battler?.result();
            if (!result?.used) continue;
            hits.push({ u: target.id, d: result.hpDamage, m: result.mpDamage, c: result.critical ? 1 : 0, x: result.missed ? 1 : 0, e: result.evaded ? 1 : 0,
                hp: battler.hp, mp: battler.mp, tp: battler.tp, s: battler.states().map(state => state.id) });
        }
        if (hits.length) B.send({ t: "ares", u: run.subjectId, hits });
    },

    // ---- Mirroring ----

    /** Someone with a body of their own here. */
    addPeer(fight, record) {
        const B = ReactorOnlineBattle, unit = fight.addUnit({ team: "enemy", record: "enemy", id: B.anyEnemyId() });
        if (!unit) return;
        unit.id = record.id;
        unit.team = B.localTeam(record.team);
        unit.peerSlot = record.owner;
        unit.owner = record.owner;
        unit.enemy = new Game_RemoteActor(record.snapshot);
        fight.syncTroop();
        B.applyNumbers(fight, unit, record.hp, record.mp, record.tp, record.states);
    },

    /** What came in since the last frame. Nothing here waits for anything else. */
    drain(fight) {
        const B = ReactorOnlineBattle;
        for (const message of B.inbox.splice(0)) {
            // Each on its own: one that is not what it says is passed over, and the rest still land.
            try {
                if (message.t === "apos") this.place(fight, message.rows);
                else if (message.t === "ares") this.land(fight, message);
                else if (message.t === "afire" || message.t === "amotion") this.play(fight, message);
                else if (message.t === "end") B.finishMirror(fight, message.result);
                else B.applyNote(fight, message);
            } catch (error) { console.warn("A shared battle's message could not be read.", error); }
        }
    },

    /** They walk there at their own pace: a character given a new cell goes to it. */
    place(fight, rows) {
        for (const [id, x, y, direction, ground] of rows) {
            const unit = fight.unit(id), character = unit ? fight.character(unit) : null;
            if (!character || unit.defeated) continue;
            if (Number.isFinite(ground)) character._reactorGround = ground;
            if (Math.abs(character.x - x) + Math.abs(character.y - y) > 6) Game_CharacterBase.prototype.locate.call(character, x, y);
            else { character._x = x; character._y = y; }
            character.setDirection(direction);
        }
    },

    land(fight, message) {
        const B = ReactorOnlineBattle, own = fight.playerUnit(), p = fight.act().player;
        for (const hit of message.hits) {
            const dealt = hit.d > 0 && !hit.x && !hit.e;
            B.landScript(fight, [hit], true);
            if (own && message.u === own.id && dealt) { p.hitMark = 14; if (hit.hp <= 0) p.killMark = 30; }
            if (own && hit.u === own.id && dealt) { p.pulse = 1; p.pulseAngle = null; }
        }
    },

    /** What someone else's weapon does here: the look of it, landing on nothing. */
    play(fight, message) {
        const unit = fight.unit(message.u), character = unit ? fight.character(unit) : null;
        if (!character || fight.playerUnit() === unit) return;
        if (message.t === "amotion") { fight.playMotion(character, message.motion); return; }
        const args = this.fairShot(message.args);
        if (!args) return;
        this.echoing = true;
        try { ReactorFight.Action.fire(fight, unit, ...args); } finally { this.echoing = false; }
    },

    /**
     * Another game's shot, as numbers this game can draw: every number finite, and the weapon's within what any
     * weapon has (pellets, range, speed, blast, spread). A shot with a million pellets would stop every game shown it.
     */
    fairShot(args) {
        if (!Array.isArray(args) || !args[0] || typeof args[0] !== "object") return null;
        const n = (value, low, high, fallback) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
        const p = args[0], profile = Object.assign({}, p, {
            pellets: Math.round(n(p.pellets, 1, 16, 1)), range: n(p.range, 0, 200, 0), speed: n(p.speed, 0, 400, 0),
            blast: n(p.blast, 0, 10, 0), damage: n(p.damage, 0, 1, 1), spread: n(p.spread, 0, 90, 2), aimSpread: n(p.aimSpread, 0, 90, 0.5)
        });
        // After the profile, as A.fire takes them: skillId, ox, oy, oz, dx, dy, dz, flat, spreadDegrees, mx, my, mz.
        const rest = args.slice(1, 13).map(value => typeof value === "number" ? (Number.isFinite(value) ? value : 0) : value);
        if (rest.length > 8) rest[8] = n(rest[8], 0, 90, 0);
        return [profile, ...rest];
    }
};

if (typeof ReactorFight !== "undefined" && ReactorFight.Action) (function(R, B, A) {
    const reports = fight => B.realTime && (fight._mirror ? true : B.role === "host" && B.guests.size > 0);

    const update = A.update;
    A.update = function(fight) {
        if (fight._mirror) R.drain(fight);
        // Someone only watching leaves with Escape (or the cancel button), whatever else the key would do.
        if (fight._mirror && B.side === "watch" && !fight._ending && (Input.isTriggered("escape") || Input.isTriggered("cancel") || Input.isPressed("escape"))) {
            fight.end(ReactorFight.ESCAPE, true);
            return;
        }
        update.call(this, fight);
        if (fight._mirror && fight._active) {
            // What the host can't see for itself: this player's guard, and when they can't be struck.
            const p = fight.act().player, state = (p.guard ? 1 : 0) + (p.safe > 0 ? 2 : 0);
            if (state !== R.state) { R.state = state; B.send({ t: "astate", guard: !!p.guard, safe: p.safe > 0 ? Math.round(p.safe * 16.7) : 0 }); }
        }
    };

    // Only the host thinks for anyone, and a player thinks for themselves.
    const updateUnit = A.updateUnit;
    A.updateUnit = function(fight, st, unit, character, battler, ai, player) {
        if (fight._mirror || unit.remoteSlot !== undefined) return;
        // With several players, whoever has come nearest draws its attention, or walking up to an enemy
        // already fighting someone else would be safe.
        if (B.guests.size && ai.alert && ai.state === "chase" && !unit.party && (st.clock + unit.id * 7) % R.RETARGET_FRAMES === 0) {
            const nearest = A.nearest(fight, unit, character, ReactorFight.oppose(unit.team), 30);
            if (nearest) ai.targetId = nearest.id;
        }
        updateUnit.call(this, fight, st, unit, character, battler, ai, player);
    };

    const fire = A.fire;
    A.fire = function(fight, unit, ...args) {
        fire.call(this, fight, unit, ...args);
        if (R.echoing || !reports(fight)) return;
        if (fight._mirror ? unit.party : true) B.send({ t: "afire", u: unit.id, args });
    };

    const startRun = A.startRun;
    A.startRun = function(fight, unit, action, targets, options) {
        const result = startRun.call(this, fight, unit, action, targets, options);
        if (reports(fight) && (!fight._mirror || unit.party)) B.send({ t: "amotion", u: unit.id, motion: action.isMagical() ? "cast" : "attack" });
        return result;
    };

    const swingShow = A.swingShow;
    A.swingShow = function(fight, battler, character, step) {
        swingShow.call(this, fight, battler, character, step);
        const unit = fight.unitOfCharacter?.(character);
        if (unit && reports(fight) && (!fight._mirror || unit.party)) B.send({ t: "amotion", u: unit.id, motion: "attack" });
    };

    // Someone only watching has no use for the battle's menu: Escape takes them out.
    const callMenu = Scene_Map.prototype.callMenu;
    Scene_Map.prototype.callMenu = function(...args) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (fight?._mirror && B.side === "watch" && !fight._ending) { this.menuCalling = false; fight.end(ReactorFight.ESCAPE, true); return; }
        return callMenu.apply(this, args);
    };

    // A guard a guest holds up on their own game counts on the host.
    const strikeFor = Game_Fight.prototype.strikeFor;
    Game_Fight.prototype.strikeFor = function(run, action, target) {
        const strike = strikeFor.call(this, run, action, target);
        if (strike && this.isAction() && target?.remoteGuard) strike.damageRate *= A.GUARD_RATE;
        return strike;
    };
})(ReactorOnlineAction, ReactorOnlineBattle, ReactorFight.Action);
