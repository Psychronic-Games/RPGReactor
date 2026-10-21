//=============================================================================
// reactor_vehicles_mount.js - fighting from the saddle
//=============================================================================
//
// A battle fought on the map's grid (Tactical) keeps the party on its vehicles
// when they ride on land: the leader's and each follower's who rode one of its
// own. (A boat or an aircraft is left as before a battle on foot.) A unit on a
// vehicle
//
//   - moves as the vehicle does: its own range (the vehicle record's or its
//     class's `<move: N>`, else worked out from its top speed), no climbing;
//   - fights with the vehicle too, where the vehicle has a battler (a class,
//     traits, skills or equipment in Database > Vehicles): Attack asks whose
//     attack it is to be, and its skill list carries the vehicle's after its
//     own. What the vehicle does is the vehicle's action, made with its
//     strength and paid for from its MP and TP;
//   - can Dismount to a free cell beside it, leaving the vehicle parked there,
//     and a unit on foot beside a free ground vehicle can Mount it.
//
// The vehicle is drawn where its rider is: nothing drives it. `unit.mount` is
// the vehicle's event id (plain data, saved with the battle).
//
// On the battle screen (Classic) the party stays aboard as before. An actor who
// rides (the leader, and each follower on a vehicle of its own) has the same
// two lists, and in a Battle Room sits on the vehicle's model, leaving it to
// go up to what it strikes.

(function(root) {
    "use strict";

    const V = root.ReactorVehicles;
    if (!V) return;
    const M = V.Mount = {};
    const F = () => root.ReactorFight || null;
    const fightNow = () => (typeof $gameFight !== "undefined" ? $gameFight : null);
    const player = () => (typeof $gamePlayer !== "undefined" ? $gamePlayer : null);
    const followersOf = p => (p && p._followers && Array.isArray(p._followers._data) ? p._followers._data : []);

    /** Tiles a unit on a vehicle moves a turn for each tile a second of the vehicle's top speed, and the least and the most. */
    M.MOVE_PER_SPEED = 0.4;
    M.MOVE_MIN = 4;
    M.MOVE_MAX = 12;
    /** How far a unit reaches to get on a vehicle, in tiles between its cell and the vehicle's. */
    M.REACH = 1.5;
    /** How much of the way to its rider's heading a vehicle turns each frame. */
    M.TURN = 0.3;

    const YAW = { 8: 0, 6: Math.PI / 2, 2: Math.PI, 4: Math.PI * 1.5 };
    const turnTo = (from, to, share) => {
        let gap = (to - from) % (Math.PI * 2);
        if (gap > Math.PI) gap -= Math.PI * 2;
        if (gap < -Math.PI) gap += Math.PI * 2;
        return Math.abs(gap) < 0.01 ? to : from + gap * share;
    };

    const onGround = function(event) {
        const type = event ? V.type(event._rrVehicle) : null;
        return !type || !type.medium || type.medium === "ground";
    };

    /** Whether a battle with these options keeps the party aboard: one fought on the grid, from a vehicle that rides on land. */
    M.keeps = function(options) {
        const f = F();
        if (!f || typeof Game_Fight === "undefined") return false;
        const mode = options && f.isOnMap && f.isOnMap(options.mode) ? options.mode : "tactical";
        if (mode !== "tactical") return false;
        const lead = V.ridden();
        return !lead || onGround(lead);
    };

    /** The vehicle a ground unit could ride: one that stands, is nobody's, is whole, and rides on land. */
    const rideable = function(event) {
        if (!event || !V.isVehicle(event) || event._rrBoarded || event._erased || V.scenery(event) || (V.sunk && V.sunk(event))) return false;
        const battler = V.battler(event);
        if (battler && battler.isDead()) return false;
        return onGround(event);
    };

    /** The vehicle event a unit rides, or null. */
    M.of = function(unit) {
        if (!unit || !(unit.mount > 0) || typeof $gameMap === "undefined" || !$gameMap) return null;
        const event = $gameMap.event(unit.mount);
        return event && event._rrVehicle > 0 && event._rrBoarded && !event._erased ? event : null;
    };

    /** Tiles a turn for a unit on this vehicle. */
    M.moveOf = function(event) {
        const f = F(), battler = V.battler(event);
        // Its own setting first: the vehicle's record, then its class.
        for (const record of battler ? [battler.actor(), battler.currentClass()] : []) {
            const tags = record && f && f.recordTactics ? f.recordTactics(record) : null;
            if (tags && tags.move !== null && tags.move !== undefined) return Math.max(0, Math.min(30, tags.move));
        }
        const type = V.type(event._rrVehicle), speed = type && type.handling ? Number(type.handling.speed) || 0 : 0;
        return Math.max(M.MOVE_MIN, Math.min(M.MOVE_MAX, Math.round(speed * M.MOVE_PER_SPEED)));
    };

    /** A vehicle battler's skills, less its plain attack and its guard. */
    M.skillsOf = function(battler) {
        const attack = battler.attackSkillId(), guard = battler.guardSkillId();
        return battler.skills().filter(skill => skill && skill.id !== attack && skill.id !== guard);
    };

    /** The unit of a party character (the leader or a follower), or null. */
    const unitOfCharacter = function(fight, character) {
        const p = player();
        const actor = character === p ? $gameParty.leader() : character && typeof character.actor === "function" ? character.actor() : null;
        if (!actor) return null;
        return fight._units.find(unit => unit.party && unit.actorId === actor.actorId() && !unit.gone) || null;
    };

    if (typeof Game_Interpreter !== "undefined" && typeof Game_Interpreter.prototype.command314 === "function" && !Game_Interpreter.prototype.command314.__rrMount) {
        // Recover All for the entire party mends its vehicles on this map too.
        const recoverAll = Game_Interpreter.prototype.command314;
        Game_Interpreter.prototype.command314 = function(params) {
            const result = recoverAll.apply(this, arguments);
            if (params && params[0] === 0 && params[1] === 0) M.recover();
            return result;
        };
        Game_Interpreter.prototype.command314.__rrMount = true;
    }

    /** The battle has begun with the party aboard: who rides what, and nobody is driven from here on. */
    M.begin = function(fight) {
        const p = player(), f = F();
        if (!p || !f) return;
        const lead = V.ridden();
        const riders = V.Convoy && V.Convoy.riders ? V.Convoy.riders() : [];
        const mounted = [];
        if (lead) mounted.push([p, lead]);
        for (const rider of riders) mounted.push([rider.follower, rider.event]);
        for (const [character, event] of mounted) {
            const unit = unitOfCharacter(fight, character);
            if (unit) unit.mount = event._eventId;
            // Its place is its rider's from here: nothing glides it and nothing drives it.
            character._rrFree = 0;
        }
        // Those who rode unseen with the leader stand beside it, on foot.
        const followers = p._followers;
        if (followers) followers._rrAboard = false;
        for (const follower of followersOf(p)) {
            if (!follower._rrAboard) continue;
            follower._rrAboard = false;
            follower._rrLeave = 0; follower._rrAppear = 0;
            if (follower._rrSeated || !(follower.actor && follower.actor())) continue;
            const spot = fight.freeSpotNear(p.x, p.y, 1) || (fight.anySpotNear && fight.anySpotNear(p.x, p.y));
            if (spot) Game_CharacterBase.prototype.locate.call(follower, spot.x, spot.y);
            follower.setOpacity(255);
            follower.setThrough(false);
        }
        if (p._rrDrive) p._rrDrive.v = 0;
        if (f.forgetFootprints) f.forgetFootprints();
        if (fight.touch) fight.touch();
    };

    /** A vehicle is where its rider is, heading as its rider moves or faces; its wheels turn by the way it came. */
    const follow = function(character, event, drive) {
        const x = character._realX, y = character._realY;
        // (Measured from where its rider last was: the leader's is carried to it before this runs.)
        const dx = x - (Number.isFinite(event._rrMountX) ? event._rrMountX : x), dy = y - (Number.isFinite(event._rrMountY) ? event._rrMountY : y), went = Math.hypot(dx, dy);
        event._rrMountX = x; event._rrMountY = y;
        const was = Number.isFinite(event._rrYaw) ? event._rrYaw : YAW[character.direction()] || 0;
        const wanted = went > 1e-4 && went < 3 ? Math.atan2(dx, -dy) : YAW[character.direction()];
        const yaw = Number.isFinite(wanted) ? turnTo(was, wanted, M.TURN) : was;
        const ground = Number.isFinite(character._reactorGround) ? character._reactorGround : event._reactorGround;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : ground;
        const changed = went > 1e-5 || yaw !== event._rrYaw || event._reactorAlt !== alt || event._rrFree !== 2;
        event._realX = x; event._realY = y; event._x = character._x; event._y = character._y;
        event._direction = character._direction;
        event._reactorGround = ground; event._reactorAlt = alt; event._reactorAir = 0; event._reactorVz = 0;
        event._reactorRiding = true;
        event._through = true;
        event._rrFree = 2;
        event._rrYaw = yaw;
        event._rrLean = 0; event._rrSteer = 0; event._rrPitch = 0;
        // (A place it was put at is no road rolled: only a step's length turns the wheels.)
        if (went < 3) event._rrTravel = (event._rrTravel || 0) + went;
        event._rrSpeed = went < 3 ? went * 60 : 0;
        character._reactorRiding = true;
        if (drive) { drive.yaw = yaw; drive.v = 0; if (Number.isFinite(alt)) drive.alt = alt; }
        if (changed) event._rrPose = (event._rrPose || 0) + 1;
        character._rrPose = event._rrPose;
    };

    /** Once a frame of a battle on the grid: each ridden vehicle goes with its rider. */
    M.sync = function(fight) {
        if (!fight || !fight._active || !Array.isArray(fight._units)) return;
        const p = player();
        for (const unit of fight._units) {
            if (!(unit.mount > 0)) continue;
            const event = M.of(unit), character = fight.character(unit);
            if (!event || !character) { unit.mount = 0; continue; }
            if (unit.mount !== event._rrMountOf) { event._rrMountOf = unit.mount; event._rrMountX = event._rrMountY = undefined; }
            if (character._rrFree) character._rrFree = 0;
            follow(character, event, character === p ? p._rrDrive : null);
        }
    };

    /** The battle is over: who still rides is driven again, and the others' vehicles stay where they were left. */
    M.end = function() {
        const p = player();
        if (!p) return;
        const riding = p._vehicleType === "reactor" && !!V.ridden();
        if (!riding) {
            // The leader is on foot: nobody follows it on a vehicle.
            if (V.Convoy && V.Convoy.disband) V.Convoy.disband();
            return;
        }
        p._rrFree = 1;
        const lead = V.ridden(), drive = p._rrDrive;
        if (drive) { drive.v = 0; drive.leave = ""; drive.grid = 0; if (Number.isFinite(lead._rrYaw)) drive.yaw = lead._rrYaw; }
        if (V.Drive && typeof V.Drive.seat === "function") V.Drive.seat(p);
        // One who got off in the battle takes the nearest vehicle left standing, as when the leader gets on.
        const reach = Number(V.CONVOY_REACH) || 0;
        for (const follower of followersOf(p)) {
            if (follower._rrSeated || follower._rrOrder || follower._rrHidden || !(follower.actor && follower.actor())) continue;
            let best = null, gap = Infinity;
            for (const event of V.list()) {
                if (event === lead || !rideable(event) || Math.hypot(event._realX - lead._realX, event._realY - lead._realY) > reach) continue;
                const d = Math.hypot(event._realX - follower._realX, event._realY - follower._realY);
                if (d < gap) { best = event; gap = d; }
            }
            if (best) V.seatFollower(follower, best);
        }
        for (const follower of followersOf(p)) {
            if (!follower._rrSeated) continue;
            const ride = follower._rrRide, event = ride && ride.map === $gameMap._mapId ? $gameMap.event(ride.id) : null;
            if (!event) continue;
            follower._rrFree = 1;
            event._rrFree = 2;
            // It finds the leader's trail again from where the battle left it.
            event._rrOnTrail = false;
        }
        // Those on foot ride unseen with the leader again.
        if (p._followers && typeof p._followers.rrAboard === "function") p._followers.rrAboard(true, true);
    };

    //-------------------------------------------------------------------------
    // Getting on and off, as a unit's command.

    /** The free vehicle a unit on foot could get on from where it stands: the nearest in reach. */
    M.near = function(fight, unit) {
        const character = fight.character(unit);
        if (!character || !unit.party || unit.mount > 0) return null;
        let best = null, gap = M.REACH + 1e-6;
        for (const event of V.list()) {
            if (!rideable(event)) continue;
            const d = Math.hypot(event._realX - character._realX, event._realY - character._realY);
            if (d < gap) { best = event; gap = d; }
        }
        return best;
    };

    /** A unit gets on a vehicle, at once. False when it cannot. */
    M.mount = function(fight, unit, event) {
        const p = player(), character = fight.character(unit);
        if (!character || !rideable(event) || unit.mount > 0) return false;
        if (character === p) {
            if (!V.boardInFight(event)) return false;
        } else if (!V.seatFollower(character, event)) return false;
        character._rrFree = 0;
        unit.mount = event._eventId;
        return true;
    };

    /** A unit gets off its vehicle onto a cell; the vehicle stays where it stood, parked. False when it rides none. */
    M.dismount = function(fight, unit, x, y) {
        const p = player(), character = fight.character(unit), event = M.of(unit);
        if (!character || !event) return false;
        if (character === p) {
            V.park(event);
            V.putOnFoot();
        } else V.unseatFollower(character);
        unit.mount = 0;
        character._rrFree = 0;
        character._reactorRiding = false;
        Game_CharacterBase.prototype.locate.call(character, x, y);
        character.setThrough(false);
        return true;
    };

    const install = function() {
        const f = F();
        if (!f || typeof Game_Fight === "undefined" || Game_Fight.prototype.commandMount) return;

        f.mountOf = M.of;
        f.mountMove = (unit, event) => M.moveOf(event);
        // A vehicle climbs nothing: it takes the steps a walker takes without a hop.
        f.mountJump = () => 0;
        f.mountBattler = unit => { const event = M.of(unit); return event ? V.battler(event) : null; };
        f.MOUNT_SPEED = 5.5;

        const update = Game_Fight.prototype.update;
        Game_Fight.prototype.update = function() {
            const result = update.apply(this, arguments);
            if (this._active && this.isTactical && this.isTactical()) M.sync(this);
            return result;
        };

        const finish = Game_Fight.prototype.finish;
        Game_Fight.prototype.finish = function() {
            const rode = this._active && Array.isArray(this._units) && (this._units.some(unit => unit.mount > 0) || (player() && player()._vehicleType === "reactor"));
            const result = finish.apply(this, arguments);
            if (rode) M.end();
            return result;
        };

        /** What a vehicle adds to a unit's menu: Dismount for one who rides, Mount beside a free one. `[{ name, symbol, enabled }]`. */
        Game_Fight.prototype.mountCommands = function(unit) {
            const list = [];
            if (!unit || !unit.party || !this.isPlayerUnit(unit)) return list;
            if (M.of(unit)) list.push({ name: f.term("dismount"), symbol: "dismount", enabled: !this.commandReason("dismount") });
            else if (M.near(this, unit)) list.push({ name: f.term("mount"), symbol: "mount", enabled: true });
            return list;
        };

        /** Why Dismount cannot be chosen, as a term key; "" when it can. */
        Game_Fight.prototype.mountReason = function(symbol) {
            const unit = this.unit(this._act.unitId), character = this.character(unit);
            if (!unit || !character) return "";
            if (symbol === "dismount") return this.freeSpotNear(character.x, character.y, 1) ? "" : "whyNoRoom";
            return "";
        };

        /** The vehicle a unit rides when it can attack for itself (Attack then asks whose attack it is to be), else null. */
        Game_Fight.prototype.vehicleAttacker = function(unit) {
            const battler = f.mountBattler(unit);
            return battler && !battler.isDead() && battler.canAttack() ? battler : null;
        };

        /** A skill list for the unit: its own skills and then its vehicle's, or (Attack chosen by one who rides) whose attack. */
        Game_Fight.prototype.rideList = function(win, unit) {
            const act = this._act;
            // The two on an aimed cell, a rider and its vehicle: whose the action is to be.
            if (act && act.pick === "whom" && act.whom) {
                const pair = this.targetPair(act.whom.x, act.whom.y);
                if (pair) { M.list(win, this.battler(unit), this.battler(pair[1]), "whom", this.battler(pair[0])); return; }
            }
            const battler = f.mountBattler(unit), vehicle = battler && !battler.isDead() ? battler : null;
            M.list(win, this.battler(unit), vehicle, act && act.pick === "attack" ? "attack" : "skills");
        };

        //---------------------------------------------------------------------
        // The party's vehicles as things an action lands on: each that has a
        // battler is a unit of the battle's for that and nothing else (it has
        // no turn and holds no cell), under the id -(its event's).

        const units = { serial: -1, map: 0, count: -1, list: [], byEvent: new Map() };
        /** The party's vehicles on this map that have battlers, as `{ id, vehicle: true, eventId, team: "ally" }`. The same objects for the battle's length. */
        Game_Fight.prototype.vehicleUnits = function() {
            const events = V.list(), map = $gameMap ? $gameMap._mapId : 0;
            if (units.serial === this._serial && units.map === map && units.count === events.length) return units.list;
            if (units.serial !== this._serial || units.map !== map) units.byEvent.clear();
            units.serial = this._serial; units.map = map; units.count = events.length;
            units.list = [];
            if (!this._active) return units.list;
            for (const event of events) {
                if (event._erased || V.scenery(event) || !V.battler(event) || this.unitOfEvent(event._eventId)) continue;
                let unit = units.byEvent.get(event._eventId);
                if (!unit) { unit = { id: -event._eventId, vehicle: true, eventId: event._eventId, team: "ally", party: false, defeated: false, gone: false }; units.byEvent.set(event._eventId, unit); }
                units.list.push(unit);
            }
            return units.list;
        };
        Game_Fight.prototype.vehicleUnit = function(eventId) {
            return this.vehicleUnits().find(unit => unit.eventId === eventId) || null;
        };
        Game_Fight.prototype.vehicleBattler = function(unit) {
            const event = unit && $gameMap ? $gameMap.event(unit.eventId) : null;
            return event ? V.battler(event) : null;
        };
        /** The unit that rides a vehicle, or null. */
        Game_Fight.prototype.vehicleRider = function(unit) {
            return unit ? this._units.find(other => !other.gone && other.mount === unit.eventId) || null : null;
        };
        /** Whether a unit is kept inside what it rides, and that still stands: the other side's actions land on the vehicle. */
        Game_Fight.prototype.isShielded = function(unit) {
            if (!unit || !(unit.mount > 0)) return false;
            const event = M.of(unit), battler = event ? V.battler(event) : null;
            return !!battler && battler.isAlive() && V.riderInside(event);
        };
        /** Which of a rider and its vehicle an action for one of them lands on when nobody chose: the one with the lesser share of its life left (the rider at a tie). */
        Game_Fight.prototype.pairTarget = function(rider, vehicle) {
            const a = this.battler(rider), b = this.battler(vehicle);
            if (!a || !b) return a ? rider : vehicle;
            return b.hpRate() < a.hpRate() ? vehicle : rider;
        };

        // One who falls in the saddle falls out of it: the vehicle stays where it stood, in nobody's way.
        const defeat = Game_Fight.prototype.defeat;
        Game_Fight.prototype.defeat = function(unit) {
            const was = unit && unit.defeated;
            const result = defeat.apply(this, arguments);
            if (unit && !unit.vehicle && !was && unit.defeated && unit.mount > 0) {
                const character = this.character(unit), event = M.of(unit);
                if (character && event && M.dismount(this, unit, character.x, character.y)) { event._through = true; this.touch(); }
            }
            return result;
        };

        /** A vehicle's battler fell: it is a wreck where it stands, and whoever rode it is on its feet beside it. */
        Game_Fight.prototype.wreckVehicle = function(unit) {
            const event = $gameMap.event(unit.eventId), rider = this.vehicleRider(unit);
            if (!event) return;
            if (rider) {
                const character = this.character(rider);
                const spot = character ? this.freeSpotNear(character.x, character.y, 1) || { x: character.x, y: character.y } : null;
                if (spot && M.dismount(this, rider, spot.x, spot.y) && spot.x === event._x && spot.y === event._y) event._through = true;
                // Its turn, if this is it: it has been put down, and that was its move.
                const act = this._act;
                if (act && act.unitId === rider.id && act.player) { act.moved = true; act.locked = true; act.steps = 0; }
            }
            M.wreck(event, true);
            if (typeof SoundManager !== "undefined" && SoundManager.playActorCollapse) SoundManager.playActorCollapse();
            if (f.forgetFootprints) f.forgetFootprints();
            this.touch();
        };
        /** A wreck brought back stands again. */
        Game_Fight.prototype.mendVehicle = function(unit) {
            M.wreck($gameMap.event(unit.eventId), false);
            this.touch();
        };
        /** The battle is over and the fallen get up: so do the vehicles wrecked in it, as far. */
        Game_Fight.prototype.reviveVehicles = function() {
            for (const unit of units.serial === this._serial ? units.list : []) {
                const battler = this.battler(unit);
                if (!unit.defeated || !battler || !battler.isDead()) continue;
                battler.setHp(1);
                unit.defeated = false;
                M.wreck($gameMap.event(unit.eventId), false);
            }
        };

        /** The vehicle's own attack, aimed at once (a HUD with its own lists; a script). */
        Game_Fight.prototype.commandVehicleAttack = function() {
            if (!this.playerStage("command") || !this.awaitsPlayer()) return false;
            const battler = this.vehicleAttacker(this.unit(this._act.unitId));
            if (!battler) return false;
            return this.aim("skill", battler.attackSkillId(), "vehicle");
        };

        // Getting on or off is the unit's move for the turn: it may still act from where it then is.
        const settle = function(fight, unit) {
            const act = fight._act, character = fight.character(unit);
            act.steps = 0;
            act.moved = true;
            act.locked = true;
            act.origin = { x: character.x, y: character.y, d: character.direction(), height: f.Grid && f.Grid.heightOf ? f.Grid.heightOf(character) : 0 };
            if (f.forgetFootprints) f.forgetFootprints();
            if (f.Input && f.Input.used) f.Input.used();
            fight.setCursor(character.x, character.y, act.origin.height);
            fight._progress = true;
            fight.touch();
        };

        Game_Fight.prototype.commandMount = function() {
            if (!this.playerStage("command") || !this.awaitsPlayer()) return false;
            const unit = this.unit(this._act.unitId), event = M.near(this, unit);
            if (!event || !M.mount(this, unit, event)) return false;
            settle(this, unit);
            return true;
        };

        Game_Fight.prototype.commandDismount = function() {
            if (!this.playerStage("command") || !this.awaitsPlayer()) return false;
            const unit = this.unit(this._act.unitId), character = this.character(unit);
            const spot = character && M.of(unit) ? this.freeSpotNear(character.x, character.y, 1) : null;
            if (!spot || !M.dismount(this, unit, spot.x, spot.y)) return false;
            settle(this, unit);
            return true;
        };
    };

    /** How far over a wrecked vehicle that leans (a motorcycle) lies, in radians. */
    M.WRECK_LEAN = 1.35;
    /** A vehicle lies wrecked (`on`), or stands again: one that leans goes over onto its stand's side. */
    M.wreck = function(event, on) {
        if (!event || !(event._rrVehicle > 0)) return;
        const type = V.type(event._rrVehicle);
        event._rrWreck = !!on;
        if (!type || type.leans !== false) event._rrLean = on ? -M.WRECK_LEAN : 0;
        event._rrSpeed = 0;
        event._rrPose = (event._rrPose || 0) + 1;
    };
    /** Every vehicle of the party's on this map is whole again (Recover All). */
    M.recover = function() {
        for (const event of V.list()) {
            const battler = V.battler(event);
            if (!battler) continue;
            battler.recoverAll();
            if (event._rrWreck) M.wreck(event, false);
        }
    };

    //-------------------------------------------------------------------------
    // A skill list for one who rides: its own skills and then the vehicle's
    // under the vehicle's name, or (Attack) whose attack it is to be. Each row
    // is used by the one it belongs to: the vehicle's cost in the vehicle's MP.

    const HEADER_NAME = { rrRideHeader: "name", description: "" }, HEADER_STATS = { rrRideHeader: "stats", description: "" };
    const WHOM_RIDER = { rrWhom: "rider", description: "" }, WHOM_VEHICLE = { rrWhom: "vehicle", description: "" };

    /**
     * What a skill list shows from its next refresh: `actor` alone (`vehicle` null), or with the vehicle it rides.
     * `mode`: "skills", "attack", or "whom" (an action aimed where a rider and its vehicle both are: `rider` and
     * `vehicle` are those two, and the list asks which of them it is for).
     */
    M.list = function(win, actor, vehicle, mode, rider) {
        if (!win) return;
        win._rrRide = vehicle ? { actor, vehicle, mode: mode === "attack" || mode === "whom" ? mode : "skills", rider: rider || null } : null;
        win._rrVias = null;
    };
    const ridden = win => { const ride = win._rrVias ? win._rrRide : null; return ride && ride.vehicle ? ride : null; };
    /** Who uses row `index` of a list: "vehicle", or "" for the one who rides. */
    M.viaAt = (win, index) => (win && win._rrVias && win._rrVias[index] === "vehicle" ? "vehicle" : "");
    const userAt = (win, ride, index) => (M.viaAt(win, index) ? ride.vehicle : ride.actor);

    /** Whether a row can be chosen: its user can use it, and in a battle on the grid an attack has somebody in its reach. */
    M.rowEnabled = function(win, index) {
        const ride = ridden(win), item = win._data ? win._data[index] : null;
        if (!ride || !item || item.rrRideHeader) return false;
        if (item.rrWhom) return true;
        if (!userAt(win, ride, index).canUse(item)) return false;
        const fight = fightNow();
        if (ride.mode !== "attack" || !fight || !fight._active || !fight.isTactical || !fight.isTactical() || !fight.isHere()) return true;
        return fight.hasTargets("skill", item.id, M.viaAt(win, index) || undefined);
    };

    const installList = function() {
        if (typeof Window_SkillList === "undefined" || typeof Window_SkillList.prototype.makeItemList !== "function" || Window_SkillList.prototype.makeItemList.__rrMount) return;
        const proto = Window_SkillList.prototype;
        const make = proto.makeItemList;
        proto.makeItemList = function() {
            const ride = this._rrRide && this._rrRide.vehicle && this._actor === this._rrRide.actor ? this._rrRide : null;
            this._rrVias = null;
            if (!ride) { make.call(this); return; }
            if (ride.mode === "attack") {
                this._data = [$dataSkills[ride.actor.attackSkillId()], $dataSkills[ride.vehicle.attackSkillId()]];
                this._rrVias = ["", "vehicle"];
                return;
            }
            if (ride.mode === "whom") {
                this._data = [WHOM_RIDER, WHOM_VEHICLE];
                this._rrVias = ["", "vehicle"];
                return;
            }
            make.call(this);
            const own = M.skillsOf(ride.vehicle);
            if (!own.length) return;
            // The vehicle's begin on a row of their own, under its name and what it has to spend.
            const cols = Math.max(1, this.maxCols()), data = this._data, vias = data.map(() => "");
            const pad = () => { while (data.length % cols) { data.push(null); vias.push(""); } };
            pad();
            data.push(HEADER_NAME); vias.push("vehicle");
            if (cols > 1) { data.push(HEADER_STATS); vias.push("vehicle"); pad(); }
            for (const skill of own) { data.push(skill); vias.push("vehicle"); }
            this._rrVias = vias;
        };
        proto.makeItemList.__rrMount = true;

        const enabled = proto.isCurrentItemEnabled;
        proto.isCurrentItemEnabled = function() {
            return ridden(this) ? M.rowEnabled(this, this.index()) : enabled.call(this);
        };

        const drawItem = proto.drawItem;
        proto.drawItem = function(index) {
            const ride = ridden(this), item = ride ? this._data[index] : null;
            if (!ride) { drawItem.call(this, index); return; }
            if (!item) return;
            const rect = this.itemLineRect(index), user = userAt(this, ride, index);
            if (item.rrWhom) {
                // One of the two on the cell: its name and its life.
                const who = item === WHOM_VEHICLE ? ride.vehicle : ride.rider, life = who ? TextManager.hpA + " " + who.hp + "/" + who.mhp : "";
                const lifeWidth = Math.min(this.textWidth(life) + 8, Math.floor(rect.width * 0.55));
                this.changePaintOpacity(true);
                this.resetTextColor();
                this.drawText(who ? who.name() : "", rect.x, rect.y, rect.width - lifeWidth);
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(life, rect.x + rect.width - lifeWidth, rect.y, lifeWidth, "right");
                this.resetTextColor();
                return;
            }
            if (item.rrRideHeader) {
                // Its name, and its MP and TP: what its skills are paid from.
                this.changePaintOpacity(true);
                const stats = TextManager.mpA + " " + ride.vehicle.mp + "   " + TextManager.tpA + " " + ride.vehicle.tp;
                if (item === HEADER_NAME) {
                    this.changeTextColor(ColorManager.systemColor());
                    const both = this.maxCols() <= 1, statsWidth = both ? this.textWidth(stats) + 8 : 0;
                    this.drawText(ride.vehicle.name(), rect.x, rect.y, rect.width - statsWidth);
                    this.resetTextColor();
                    if (both) this.drawText(stats, rect.x, rect.y, rect.width, "right");
                } else this.drawText(stats, rect.x, rect.y, rect.width, "right");
                return;
            }
            if (ride.mode === "attack") {
                // The weapon it is made with (the attack's own name without one), and whose it is.
                const weapon = user.weapons()[0], who = user.name(), whoWidth = Math.min(this.textWidth(who), Math.floor(rect.width * 0.45));
                this.changePaintOpacity(M.rowEnabled(this, index));
                this.drawItemName(weapon || item, rect.x, rect.y, rect.width - whoWidth - 8);
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(who, rect.x + rect.width - whoWidth, rect.y, whoWidth, "right");
                this.resetTextColor();
                this.changePaintOpacity(true);
                return;
            }
            // As the stock row, read for the one whose skill it is.
            const actor = this._actor;
            this._actor = user;
            try { drawItem.call(this, index); } finally { this._actor = actor; }
        };
    };

    //-------------------------------------------------------------------------
    // The battle screen (Classic).

    /** The vehicle an actor rides while the party is aboard on the map: the leader's, or a follower's own. Null on foot. */
    M.rideOf = function(actor) {
        const p = player(), fight = fightNow();
        if (!actor || !p || p._vehicleType !== "reactor" || typeof $gameParty === "undefined" || !$gameParty) return null;
        // (A battle on the map has units: `M.of`.)
        if (fight && fight._active) return null;
        const lead = V.ridden();
        if (!lead) return null;
        if (actor === $gameParty.leader()) return lead;
        for (const follower of followersOf(p)) {
            const ride = follower._rrSeated ? follower._rrRide : null;
            if (!ride || !follower.actor || follower.actor() !== actor) continue;
            const event = ride.map === $gameMap._mapId ? $gameMap.event(ride.id) : null;
            return event && event._rrVehicle > 0 ? event : null;
        }
        return null;
    };

    /** That vehicle's battler while it can act: null on foot, for a vehicle with none, and for a wreck. */
    M.battlerOf = function(actor) {
        const event = M.rideOf(actor), battler = event ? V.battler(event) : null;
        return battler && !battler.isDead() ? battler : null;
    };

    /** The battler of the vehicle an actor rides, standing or wrecked; null on foot and for a vehicle with none. */
    M.vehicleOf = function(actor) {
        const event = M.rideOf(actor);
        return event ? V.battler(event) || null : null;
    };

    /**
     * The targets of an action on the battle screen, with the vehicles the party rides among them. An action for one:
     * the vehicle in its rider's place when the player chose it (`_rrVehicleTarget`), when the rider is kept inside it
     * and the other side strikes, or when the other side strikes and it has the lesser share of its life left. An
     * action for all: each rider's vehicle with its rider, and in place of one kept inside when the other side strikes.
     */
    M.withVehicles = function(action, targets) {
        if (!Array.isArray(targets) || !targets.length) return targets;
        const subject = action.subject(), hostile = action.isForOpponent() && !!subject && typeof subject.isEnemy === "function" && subject.isEnemy();
        const chosen = action._rrVehicleTarget || "", dead = action.isForDeadFriend();
        let out = null;
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const event = target && typeof target.isActor === "function" && target.isActor() && !target._rrVehicleIdentity ? M.rideOf(target) : null;
            const vehicle = event ? V.battler(event) : null;
            if (!vehicle) { if (out) out.push(target); continue; }
            if (!out) out = targets.slice(0, i);
            const fits = dead ? vehicle.isDead() : vehicle.isAlive();
            const inside = hostile && fits && V.riderInside(event);
            if (action.isForAll()) {
                if (!inside) out.push(target);
                if (fits && !out.includes(vehicle)) out.push(vehicle);
            } else if (chosen) out.push(chosen === vehicle._rrVehicleIdentity && fits ? vehicle : target);
            else out.push(inside || (hostile && fits && vehicle.hpRate() < target.hpRate()) ? vehicle : target);
        }
        return out || targets;
    };

    /** After a battle on the battle screen: wrecks mended (`won`, and the game lets the fallen get up), and nobody rides a wreck out of it. */
    M.afterClassic = function(won) {
        const p = player(), f = F();
        if (!p || p._vehicleType !== "reactor" || typeof $gameParty === "undefined") return;
        const mends = won && !(f && f.systemSettings && f.systemSettings().reviveAfterBattle === false);
        const riding = [];
        const lead = V.ridden();
        if (lead) riding.push([null, lead]);
        for (const follower of followersOf(p)) {
            const ride = follower._rrSeated ? follower._rrRide : null, event = ride && ride.map === $gameMap._mapId ? $gameMap.event(ride.id) : null;
            if (event) riding.push([follower, event]);
        }
        for (const [follower, event] of riding) {
            const battler = V.battler(event);
            if (!battler || battler.isAlive()) continue;
            if (mends) { battler.setHp(1); continue; }
            // Put off it: a follower where it sat, the leader beside it with the rest of the party.
            if (follower) V.unseatFollower(follower);
            else V.dismountForBattle();
            M.wreck(event, true);
        }
    };

    // The action playing now that an actor makes with its vehicle: `{ actor, via }`.
    let acting = null;
    // Set while that action is paid for: the vehicle pays, not its rider.
    let paying = null;

    const installClassic = function() {
        if (typeof Window_ActorCommand === "undefined" || typeof Scene_Battle === "undefined" || typeof BattleManager === "undefined") return;
        if (Window_ActorCommand.prototype.canChooseAttack) return;
        /** The vehicle an actor rides when it can attack for itself, else null. */
        M.attackerOf = function(actor) {
            const battler = M.battlerOf(actor);
            return battler && battler.canAttack() ? battler : null;
        };

        /** Attack can be chosen by one who can attack, or whose vehicle can. */
        Window_ActorCommand.prototype.canChooseAttack = function() {
            const actor = this._actor;
            return !!actor && (actor.canAttack() || !!M.attackerOf(actor));
        };
        const addAttack = Window_ActorCommand.prototype.addAttackCommand;
        Window_ActorCommand.prototype.addAttackCommand = function() {
            addAttack.apply(this, arguments);
            const row = this._list[this._list.length - 1];
            if (row && row.symbol === "attack") row.enabled = this.canChooseAttack();
        };

        // What is chosen from now on is the actor's own, or its vehicle's.
        const choose = function(battler) {
            const action = BattleManager.inputtingAction();
            if (action) { action._rrVehicleSubject = battler ? battler._rrVehicleIdentity : ""; action._rrVehicleTarget = ""; }
            return action;
        };

        // Attack by one whose vehicle can attack: the skill window lists the two attacks.
        const commandAttack = Scene_Battle.prototype.commandAttack;
        Scene_Battle.prototype.commandAttack = function() {
            const actor = BattleManager.actor(), vehicle = M.attackerOf(actor), list = this._skillWindow;
            choose(null);
            if (!vehicle || !list) { M.list(list, actor, null); return commandAttack.apply(this, arguments); }
            M.list(list, actor, vehicle, "attack");
            list.setActor(actor);
            list.refresh();
            list.show();
            list.activate();
            if (list.forceSelect) list.forceSelect(M.rowEnabled(list, 0) ? 0 : 1); else list.select(0);
            this._statusWindow.hide();
            this._actorCommandWindow.hide();
        };

        // Skills: the actor's own, then its vehicle's.
        const commandSkill = Scene_Battle.prototype.commandSkill;
        Scene_Battle.prototype.commandSkill = function() {
            const actor = BattleManager.actor();
            choose(null);
            M.list(this._skillWindow, actor, M.battlerOf(actor), "skills");
            const result = commandSkill.apply(this, arguments);
            // (The same actor and skill type as last time is not listed again by itself.)
            if (this._skillWindow) { this._skillWindow.refresh(); if (this._skillWindow.selectLast) this._skillWindow.selectLast(); }
            return result;
        };
        for (const name of ["commandGuard", "commandItem"]) {
            const stock = Scene_Battle.prototype[name];
            if (typeof stock !== "function") continue;
            Scene_Battle.prototype[name] = function() { choose(null); return stock.apply(this, arguments); };
        }

        // An ally chosen who rides a vehicle with a life of its own: the skill window asks which of the two it is for.
        const whomBack = function(scene) {
            const kept = scene._rrWhom, list = scene._skillWindow;
            scene._rrWhom = null;
            if (!kept || !list) return;
            list._rrRide = kept.ride;
            list._rrVias = null;
            list.refresh();
            if (!kept.shown) list.hide();
        };
        const onActorOk = Scene_Battle.prototype.onActorOk;
        Scene_Battle.prototype.onActorOk = function() {
            const action = BattleManager.inputtingAction(), win = this._actorWindow, list = this._skillWindow;
            const index = win ? win.index() : -1, target = win && typeof win.actor === "function" ? win.actor(index) : null;
            const vehicle = target ? M.vehicleOf(target) : null;
            if (action) action._rrVehicleTarget = "";
            // (For one who is down, a revival: only where one of the two is.)
            const asks = !!action && !!vehicle && !!list && action.isForOne() && (action.isForDeadFriend() ? vehicle.isDead() : vehicle.isAlive());
            if (!asks) return onActorOk.apply(this, arguments);
            this._rrWhom = { index, ride: list._rrRide || null, shown: !!list.visible };
            M.list(list, BattleManager.actor(), vehicle, "whom", target);
            list.setActor(BattleManager.actor());
            list.refresh();
            list.show();
            list.activate();
            if (list.forceSelect) list.forceSelect(0); else list.select(0);
            win.deactivate();
            win.hide();
        };
        const onSkillCancel = Scene_Battle.prototype.onSkillCancel;
        Scene_Battle.prototype.onSkillCancel = function() {
            if (!this._rrWhom) return onSkillCancel.apply(this, arguments);
            // Back from "which of the two" is the allies again.
            const index = this._rrWhom.index;
            whomBack(this);
            this._skillWindow.deactivate();
            this._actorWindow.show();
            this._actorWindow.activate();
            if (this._actorWindow.forceSelect) this._actorWindow.forceSelect(index); else this._actorWindow.select(index);
        };

        const onSkillOk = Scene_Battle.prototype.onSkillOk;
        Scene_Battle.prototype.onSkillOk = function() {
            const list = this._skillWindow, ride = list && list._rrVias ? list._rrRide : null;
            if (ride && ride.mode === "whom" && this._rrWhom) {
                const action = BattleManager.inputtingAction();
                action.setTarget(this._rrWhom.index);
                action._rrVehicleTarget = M.viaAt(list, list.index()) ? ride.vehicle._rrVehicleIdentity : "";
                whomBack(this);
                this.hideSubInputWindows();
                this.selectNextCommand();
                return;
            }
            if (!ride) { choose(null); return onSkillOk.apply(this, arguments); }
            const vehicle = M.viaAt(list, list.index()) ? ride.vehicle : null;
            if (!vehicle && ride.mode !== "attack") { choose(null); return onSkillOk.apply(this, arguments); }
            // The vehicle's skill, or an attack: not the actor's last skill.
            const action = choose(vehicle);
            action.setSkill(list.item().id);
            this.onSelectAction();
        };

        // Backing out of a target chosen from the two attacks goes back to them.
        const back = function(scene) {
            const list = scene._skillWindow, ride = list && list._rrVias ? list._rrRide : null;
            if (!ride || ride.mode !== "attack" || !scene._actorCommandWindow || scene._actorCommandWindow.currentSymbol() !== "attack") return;
            scene._actorCommandWindow.deactivate();
            scene._statusWindow.hide();
            list.show();
            list.activate();
        };
        const onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
        Scene_Battle.prototype.onEnemyCancel = function() { onEnemyCancel.apply(this, arguments); back(this); };
        const onActorCancel = Scene_Battle.prototype.onActorCancel;
        Scene_Battle.prototype.onActorCancel = function() { onActorCancel.apply(this, arguments); back(this); };

        // Who an action lands on: a rider and its vehicle are two in one place.
        if (typeof Game_Action !== "undefined" && !Game_Action.prototype.makeTargets.__rrMount) {
            const makeTargets = Game_Action.prototype.makeTargets;
            Game_Action.prototype.makeTargets = function() {
                const targets = makeTargets.apply(this, arguments);
                return typeof $gameParty !== "undefined" && $gameParty && $gameParty.inBattle() ? M.withVehicles(this, targets) : targets;
            };
            Game_Action.prototype.makeTargets.__rrMount = true;
        }

        // What lands on a vehicle shows over the one who rides it: the vehicle has no picture of its own in the battle.
        if (typeof Sprite_Battler !== "undefined" && typeof Sprite_Battler.prototype.setupDamagePopup === "function") {
            const setupDamagePopup = Sprite_Battler.prototype.setupDamagePopup;
            Sprite_Battler.prototype.setupDamagePopup = function() {
                setupDamagePopup.apply(this, arguments);
                const rider = this._battler;
                const vehicle = rider && typeof rider.isActor === "function" && rider.isActor() && !rider._rrVehicleIdentity ? M.vehicleOf(rider) : null;
                if (!vehicle || !vehicle.isDamagePopupRequested()) return;
                this._battler = vehicle;
                try { if (rider.isSpriteVisible()) this.createDamageSprite(); } finally { this._battler = rider; }
                vehicle.clearDamagePopup();
                vehicle.clearResult();
            };
        }

        // The battle is over: a wreck stands again after a win as the fallen do on the map (System > Battles), and
        // whoever would ride a wreck out of the battle is on foot beside it.
        const endBattle = BattleManager.endBattle;
        BattleManager.endBattle = function(result) {
            const out = endBattle.apply(this, arguments);
            M.afterClassic(result === 0);
            return out;
        };

        // The action is the vehicle's: it pays for it, and the battle names it.
        const startAction = BattleManager.startAction;
        BattleManager.startAction = function() {
            const subject = this._subject, action = subject && typeof subject.currentAction === "function" ? subject.currentAction() : null;
            const via = action && action._rrVehicleSubject && !subject._rrVehicleIdentity ? V.battler(action._rrVehicleSubject) : null;
            acting = via ? { actor: subject, via } : null;
            paying = acting;
            try { return startAction.apply(this, arguments); } finally { paying = null; }
        };
        const endAction = BattleManager.endAction;
        BattleManager.endAction = function() {
            const result = endAction.apply(this, arguments);
            acting = null;
            return result;
        };
        if (typeof Game_Battler !== "undefined") {
            const useItem = Game_Battler.prototype.useItem;
            Game_Battler.prototype.useItem = function(item) {
                if (paying && this === paying.actor) return useItem.call(paying.via, item);
                return useItem.apply(this, arguments);
            };
        }
        if (typeof Window_BattleLog !== "undefined") {
            const displayAction = Window_BattleLog.prototype.displayAction;
            Window_BattleLog.prototype.displayAction = function(subject, item) {
                return displayAction.call(this, acting && subject === acting.actor ? acting.via : subject, item);
            };
            // Its plain attack lands as its own weapon's does.
            const showAttackAnimation = Window_BattleLog.prototype.showAttackAnimation;
            Window_BattleLog.prototype.showAttackAnimation = function(subject, targets) {
                return showAttackAnimation.call(this, acting && subject === acting.actor ? acting.via : subject, targets);
            };
        }
    };

    //-------------------------------------------------------------------------
    // The Battle Room: an actor who rides sits on its vehicle's model.

    const rooms = new WeakMap();
    let roomWarned = false;

    // Once a drawn frame, after the room's models were animated: each vehicle where its rider stands, heading as its
    // rider faces, and the rider on its seat with the hands on its grips.
    /** How far from its own place an actor is before it has left its vehicle (a step forward to strike), in tiles. */
    M.ROOM_AWAY = 0.3;

    const seatRoom = function(room, rides) {
        const R = root.Reactor3D, B = root.ReactorBattleData;
        for (const [key, ride] of rides.map) {
            const vehicle = room.models.get(key), actor = room.models.get(ride.actorKey);
            if (!vehicle || !vehicle.object || !actor || !actor.object) continue;
            const p = actor.position, holder = ride.holder;
            // The vehicle stands at its rider's own place in the room. One who has left that place (it goes up to
            // what it strikes) is off it, on its feet, until it is back.
            const home = B && typeof B.position === "function" ? B.position(room.settings, "actors", ride.index) : null;
            const at = home || p;
            const battler = V.battler(ride.event), wrecked = !!battler && battler.isDead(), fallen = !!ride.actor && ride.actor.isDead();
            // One who has fallen lies beside it, and nobody sits on a wreck.
            const away = wrecked || fallen || (!!home && (Math.hypot(p.x - home.x, p.y - home.y) > M.ROOM_AWAY || Math.abs((p.z || 0) - (home.z || 0)) > M.ROOM_AWAY));
            room.place(key, { x: at.x, y: at.y, z: at.z || 0, scale: p.scale });
            const type = V.type(ride.event._rrVehicle);
            const facing = away && Number.isFinite(at.facing) ? at.facing : (p.facing || 0) + (p.rotateY || 0);
            // (A wreck that leans lies on its side, coming over in a few frames.)
            ride.lean = wrecked && type && type.leans ? Math.min(M.WRECK_LEAN, (ride.lean || 0) + M.WRECK_LEAN / 14) : 0;
            R.Vehicles.stand(vehicle.object, vehicle.spec, Math.PI - facing * Math.PI / 180, type ? type.kind : undefined, -ride.lean);
            if (holder.object !== actor.object) {
                if (holder.rider) R.Rider.release(holder);
                holder.object = actor.object; holder.binding = actor.binding || null; holder.riderRefused = null;
            }
            if (away) { if (holder.rider) R.Rider.release(holder); continue; }
            ride.vehicle.object = vehicle.object;
            // While the actor's own action plays its arms are its own: the weapon in hand, the swing, the throw.
            holder.character._rrArmsFree = typeof BattleManager !== "undefined" && BattleManager._phase === "action" && BattleManager._subject === ride.actor && !(acting && acting.actor === ride.actor);
            R.Rider.seat(holder, holder.character, actor.object, ride.vehicle);
            if (holder.rider) R.Rider.update(holder, ride.vehicle);
            // A figure that cannot sit (no hips, arms and legs by name) stands in the seat.
            else if (holder.riderRefused === actor.object) R.Rider.perch(holder, ride.vehicle);
        }
    };

    /** Each frame of a Battle Room: who rides has its vehicle's model under it; who does not has none. */
    M.updateRoom = function(room) {
        const R = root.Reactor3D;
        if (!room || room.disposed || !R || !R.Rider || !R.Vehicles || typeof R.Vehicles.stand !== "function" || typeof R.characterModelSpec !== "function") return;
        let rides = rooms.get(room);
        const members = typeof $gameParty !== "undefined" && $gameParty ? $gameParty.battleMembers() : [];
        const live = new Set();
        for (let i = 0; i < members.length; i++) {
            const actorKey = "actor:" + i, record = room.models.get(actorKey);
            const event = record ? M.rideOf(members[i]) : null;
            const spec = event ? R.characterModelSpec(event) : null;
            if (!spec) continue;
            const key = "extra:ride:" + i;
            live.add(key);
            if (!rides) {
                rides = { map: new Map(), update: null };
                rides.update = () => seatRoom(room, rides);
                rooms.set(room, rides);
                (room.sequenceVisualUpdates || (room.sequenceVisualUpdates = new Set())).add(rides.update);
            }
            room.addModel(key, spec, { x: record.position.x, y: record.position.y, z: record.position.z || 0 });
            let ride = rides.map.get(key);
            if (!ride) {
                ride = { actorKey, event, holder: { object: null, binding: null, character: { _rrSeated: true }, rider: null, riderRefused: null },
                    vehicle: { object: null, character: { _rrVehicle: event._rrVehicle, _rrBoarded: true, _rrSteer: 0, _rrSpeed: 0 } } };
                rides.map.set(key, ride);
            }
            ride.event = event;
            ride.actor = members[i];
            ride.index = i;
            ride.vehicle.character._rrVehicle = event._rrVehicle;
        }
        if (rides) for (const [key, ride] of [...rides.map]) {
            if (live.has(key)) continue;
            if (ride.holder.rider) R.Rider.release(ride.holder);
            room.remove(key);
            rides.map.delete(key);
        }
    };

    const installRoom = function() {
        const P = root.ReactorBattlePresentation;
        if (!P || typeof P.updateRoom !== "function" || P.updateRoom.__rrMount) return;
        const updateRoom = P.updateRoom;
        P.updateRoom = function(ss) {
            const result = updateRoom.apply(this, arguments);
            try { M.updateRoom(ss && ss._reactorRoom); } catch (error) {
                if (!roomWarned) { roomWarned = true; console.warn("Vehicles in the Battle Room:", error); }
            }
            return result;
        };
        P.updateRoom.__rrMount = true;
    };

    install();
    installList();
    installClassic();
    installRoom();
    M.install = install;
})(typeof globalThis !== "undefined" ? globalThis : this);
