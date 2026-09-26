//=============================================================================
// reactor_physics.js - RPG Reactor jumping and gravity
//=============================================================================
//
// On 3D maps: a character has a height and a vertical speed. Jumping
// gives the player an upward speed; gravity takes it away frame by frame;
// walking or jumping off a ledge falls; in the air a character can move over
// anything below its height and land on it. Landing after a long fall can
// hurt the party or run a common event. Water deeper than a character
// stands is swum: it floats with its head out, moves slower, never dashes,
// climbs out onto a low bank and can jump from the water; a fall into
// water dips under and bobs back up without hurting. Gravity and jump height are the
// project's (System.json `reactorPhysics`), and a map may have its own
// (`MapNNN.r3d.json` › `physics`). Gravity is in Earths: 1 is 9.8 m/s² at
// 0.6 m to a tile.
//=============================================================================

(function(root) {
    "use strict";

    //-------------------------------------------------------------------------
    // Physics

    const ReactorPhysics = root.ReactorPhysics = {};

    /** Tiles per second squared for one Earth: 9.8 m/s² at 0.6 m a tile. */
    ReactorPhysics.EARTH = 9.8 / 0.6;
    ReactorPhysics.DEFAULTS = { gravity: 1, jumpHeight: 1.25, jump: true, fallDamage: false, fallFrom: 6, fallPercent: 10, fallCommonEvent: 0, swim: true, swimDepth: 2.2, splashSe: null };
    /** Named gravities the editor offers, in Earths. */
    ReactorPhysics.PRESETS = { earth: 1, moon: 0.166, mars: 0.38, low: 0.5, heavy: 2 };

    /** The project's physics, with the map's own over them. */
    ReactorPhysics.settings = function() {
        // Asked per character per frame on a map with water: once a frame per map is enough.
        const frame = typeof Graphics !== "undefined" && Graphics ? Graphics.frameCount : null;
        const memo = this._memo;
        const system = typeof $dataSystem !== "undefined" ? $dataSystem : null, mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
        if (frame !== null && memo && memo.frame === frame && memo.system === system && memo.map === mapData) return memo.value;
        const value = this.readSettings();
        if (frame !== null) this._memo = { frame, system, map: mapData, value };
        return value;
    };

    ReactorPhysics.readSettings = function() {
        const own = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorPhysics && typeof $dataSystem.reactorPhysics === "object" ? $dataSystem.reactorPhysics : {};
        const map = typeof $dataMap !== "undefined" && $dataMap && $dataMap.reactor3d && $dataMap.reactor3d.physics && typeof $dataMap.reactor3d.physics === "object" ? $dataMap.reactor3d.physics : {};
        const out = Object.assign({}, this.DEFAULTS, own, map);
        const num = (v, fallback, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
        out.gravity = num(out.gravity, 1, 0.01, 10);
        out.jumpHeight = num(out.jumpHeight, 1.25, 0, 20);
        out.fallFrom = num(out.fallFrom, 6, 0, 200);
        out.fallPercent = num(out.fallPercent, 10, 0, 100);
        out.fallCommonEvent = Math.max(0, Math.floor(Number(out.fallCommonEvent) || 0));
        out.swimDepth = num(out.swimDepth, 2.2, 0.2, 20);
        out.swim = out.swim !== false;
        out.splashSe = out.splashSe && typeof out.splashSe === "object" && out.splashSe.name ? out.splashSe : null;
        out.jump = out.jump !== false;
        out.fallDamage = !!out.fallDamage;
        return out;
    };

    /** Gravity in tiles per frame squared (the game runs 60 frames a second). */
    ReactorPhysics.gravityPerFrame = function(settings = this.settings()) {
        return settings.gravity * this.EARTH / 3600;
    };

    ReactorPhysics.jumpAllowed = function() {
        const settings = this.settings();
        return settings.jump && settings.jumpHeight > 0 && (root.ReactorControls ? root.ReactorControls.settings().jump : true);
    };

    /** How far above a character's ground it is: the height the 3D view adds. */
    ReactorPhysics.air = function(character) {
        return character && character._reactorAir > 0 ? character._reactorAir : 0;
    };

    /** Whether a character is in the air (a jump, a fall); a swimmer is not. */
    ReactorPhysics.isAirborne = function(character) {
        return !!character && !character._reactorSwim && !character._reactorOnLadder && (character._reactorAir > 0.02 || character._reactorVz > 0);
    };

    /** Whether a character is swimming. */
    ReactorPhysics.isSwimming = function(character) {
        return !!character && !!character._reactorSwim;
    };

    /**
     * The height a swimmer floats at over a point (the surface less the swim
     * depth), or null where the water is shallow enough to stand in, there is
     * none, or swimming is off. `ground` is the bottom under the point.
     */
    ReactorPhysics.floatHeight = function(mapData, x, y, ground, settings = this.settings()) {
        if (!settings.swim || typeof Reactor3D === "undefined" || !Reactor3D.waterLevelAt || !Reactor3D.hasWater(mapData)) return null;
        const level = Reactor3D.waterLevelAt(mapData, Math.floor(x), Math.floor(y));
        if (level === null || level - ground <= settings.swimDepth) return null;
        return level - settings.swimDepth;
    };

    /** How far apart the party climbs one ladder: about a body length. */
    ReactorPhysics.LADDER_GAP = 3;
    /** Climbing a ladder, tiles per frame. */
    ReactorPhysics.LADDER_SPEED = 0.07;

    /** The ladder a character holds: on a ladder's cell, between its foot and its top, off the ground. */
    ReactorPhysics.ladderHeld = function(character) {
        if (!character || typeof Reactor3D === "undefined" || !Reactor3D.ladderAt || typeof $dataMap === "undefined" || !$dataMap) return null;
        const ladder = Reactor3D.ladderAt($dataMap, character.x, character.y);
        const alt = character._reactorAlt;
        if (!ladder || !Number.isFinite(alt) || alt < ladder.bottom - 0.01 || alt > ladder.top + 0.05) return null;
        return ladder;
    };

    /** The character a follower walks behind: the one before it in the line, or the player. */
    ReactorPhysics.leaderOf = function(character) {
        if (typeof Game_Follower === "undefined" || !(character instanceof Game_Follower) || typeof $gamePlayer === "undefined") return null;
        const line = $gamePlayer.followers && $gamePlayer.followers()._data || [];
        const index = line.indexOf(character);
        return index <= 0 ? $gamePlayer : line[index - 1];
    };

    /**
     * A follower on a ladder climbs to where its leader is (the roof it went
     * up to, the ground it went down to), and its next step waits until it
     * is there: the party goes up a ladder one after another, never through
     * the wall. Returns the height it is making for, or null off a ladder.
     */
    ReactorPhysics.followerLadderTarget = function(character) {
        const lead = this.leaderOf(character);
        if (!lead || typeof Reactor3D === "undefined" || !Reactor3D.ladderAt || typeof $dataMap === "undefined" || !$dataMap) return null;
        const ladder = Reactor3D.ladderAt($dataMap, character.x, character.y);
        if (!ladder) return null;
        const leadAlt = Number.isFinite(lead._reactorAlt) ? lead._reactorAlt : ladder.bottom;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : ladder.bottom;
        // On the same ladder as its leader: a body length below it going up, above it going down.
        const sameLadder = lead._reactorOnLadder && lead.x === character.x && lead.y === character.y;
        const want = sameLadder ? (alt <= leadAlt ? leadAlt - this.LADDER_GAP : leadAlt + this.LADDER_GAP) : leadAlt;
        return { ladder, target: Math.max(ladder.bottom, Math.min(ladder.top, want)) };
    };

    /** Whether a follower is still on its way up or down a ladder. */
    ReactorPhysics.followerClimbing = function(character) {
        const climb = this.followerLadderTarget(character);
        if (!climb) return false;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : climb.ladder.bottom;
        return Math.abs(alt - climb.target) > 0.05;
    };

    /** Buoyancy and drag in the water, per frame. */
    ReactorPhysics.WATER_SPRING = 0.03;
    ReactorPhysics.WATER_DRAG = 0.86;
    /** The fastest the water lifts or lets sink a swimmer, tiles per frame. */
    ReactorPhysics.WATER_RISE_MAX = 0.06;
    ReactorPhysics.WATER_SINK_MAX = 0.3;
    /** How fast a swimmer climbs out onto a bank, tiles per frame. */
    ReactorPhysics.CLIMB_SPEED = 0.12;
    /** Diving and rising, tiles per frame; a swimmer keeps clear of the bottom by this much. */
    ReactorPhysics.DIVE_SPEED = 0.05;
    ReactorPhysics.DIVE_FLOOR = 0.3;
    /** Degrees of look either side of the camera's resting pitch that still swim level. */
    ReactorPhysics.DIVE_DEAD_ZONE = 6;

    /**
     * How a swimmer's forward stroke follows the camera, from -1 (rising) to
     * 1 (diving): in third or first person, swimming forward while looking
     * down past the view's own resting pitch dives, looking up rises, and
     * backing up does the opposite. 0 in the fixed views and when not moving.
     */
    ReactorPhysics.lookDive = function(character) {
        const camera = typeof Reactor3D !== "undefined" ? Reactor3D.Camera : null;
        if (!camera || !camera.currentState || !camera.look) return 0;
        const mode = camera.currentState().mode;
        if (mode !== "thirdPerson" && mode !== "firstPerson") return 0;
        const held = camera.held || new Set();
        const dir = typeof Input !== "undefined" ? Input.dir4 : 0;
        const stroke = (held.has("forward") || dir === 8 ? 1 : 0) - (held.has("back") || dir === 2 ? 1 : 0);
        if (!stroke) return 0;
        const rest = mode === "thirdPerson" ? 25 : 0;
        const tilt = (camera.look.pitch === null ? rest : camera.look.pitch) - rest;
        const beyond = Math.max(0, Math.abs(tilt) - this.DIVE_DEAD_ZONE);
        return stroke * Math.sign(tilt) * Math.min(1, beyond / 30);
    };

    /** Whether a swimmer is under the surface (diving), not treading water at it. */
    ReactorPhysics.isUnderwater = function(character) {
        return !!character && !!character._reactorSwim && (character._reactorDive || 0) > 0.3;
    };

    /**
     * A swimmer's depth control, once a frame: down while `down` is held,
     * up while `up` is; it holds its depth otherwise, and never goes below
     * the bottom. Returns whether the swimmer is under the surface.
     */
    ReactorPhysics.steerDive = function(character, down, up, pitch = 0) {
        if (!character || !character._reactorSwim) { if (character) character._reactorDive = 0; return false; }
        let dive = character._reactorDive || 0;
        if (down) dive += this.DIVE_SPEED;
        if (up) dive -= this.DIVE_SPEED;
        // Swimming where the camera looks: -1 (straight up) to 1 (straight down).
        dive += this.DIVE_SPEED * 1.4 * Math.max(-1, Math.min(1, Number(pitch) || 0));
        const room = Number.isFinite(character._reactorFloat) && Number.isFinite(character._reactorGround)
            ? character._reactorFloat - character._reactorGround - this.DIVE_FLOOR : 0;
        character._reactorDive = Math.max(0, Math.min(Math.max(0, room), dive));
        return character._reactorDive > 0.3;
    };

    /**
     * One frame for a character on a 3D map: the ground under it (at its
     * height, so the right floor), then gravity, then landing. A character on
     * the ground that the ground falls away from starts falling.
     */
    ReactorPhysics.update = function(character) {
        // Vehicles keep their own height (an airship flies, a boat floats), and so does a player aboard one.
        const vehicle = (typeof Game_Vehicle !== "undefined" && character instanceof Game_Vehicle)
            || (typeof $gamePlayer !== "undefined" && character === $gamePlayer && character.isInVehicle && character.isInVehicle());
        if (vehicle || typeof Reactor3D === "undefined" || typeof $dataMap === "undefined" || !$dataMap || !Reactor3D.isMap3D || !Reactor3D.isMap3D($dataMap)) {
            character._reactorAir = 0; character._reactorVz = 0; character._reactorAlt = undefined;
            character._reactorSwim = false; character._reactorLeap = false; character._reactorClimb = false;
            return;
        }
        const x = Number.isFinite(character._realX) ? character._realX : character.x;
        const y = Number.isFinite(character._realY) ? character._realY : character.y;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : null;
        const near = alt !== null && (this.isAirborne(character) || character._reactorSwim || character._reactorOnLadder) ? alt : character._reactorGround;
        const ground = Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, near);
        character._reactorGround = ground;
        let height = alt === null ? ground : alt;
        let vz = Number(character._reactorVz) || 0;
        // A follower on a ladder climbs after its leader.
        const followerClimb = alt !== null && !character._reactorLeap ? this.followerLadderTarget(character) : null;
        if (followerClimb) {
            const to = followerClimb.target;
            height = to > height ? Math.min(to, height + this.LADDER_SPEED * 1.2) : Math.max(to, height - this.LADDER_SPEED * 1.2);
            if (height > ground + 0.02) {
                character._reactorOnLadder = true;
                character._reactorSwim = false;
                character._reactorPeak = undefined;
                character._reactorAlt = height;
                character._reactorVz = 0;
                character._reactorAir = height - ground;
                if (character.setDirection && character.direction() !== followerClimb.ladder.dir && !character.isMoving()) character.setDirection(followerClimb.ladder.dir);
                return;
            }
        }
        // On a ladder, off its foot: held there, no gravity; the climb moves it.
        const ladder = Reactor3D.ladderAt && alt !== null && !character._reactorLeap ? this.ladderHeld(character) : null;
        if (ladder && height > ground + 0.02) {
            character._reactorOnLadder = true;
            character._reactorSwim = false;
            character._reactorPeak = undefined;
            character._reactorAlt = Math.min(ladder.top, height);
            character._reactorVz = 0;
            character._reactorAir = character._reactorAlt - ground;
            return;
        }
        character._reactorOnLadder = false;
        const wet = Reactor3D.hasWater && Reactor3D.hasWater($dataMap);
        const float = wet ? this.floatHeight($dataMap, x + 0.5, y + 0.5, ground) : null;
        const swam = !!character._reactorSwim;
        character._reactorFloat = float === null ? undefined : float;
        if (float === null) character._reactorDive = 0;
        // A jump out of the water rises through it (`_reactorLeap`, until its top).
        if (float !== null && height <= float + 0.02 && !character._reactorLeap) {
            // In the water: it pushes up toward the float and drags every
            // movement, so a dive in dips under and bobs back up.
            if (!swam && alt !== null && height < float - 0.05) this.onSplash(character, -vz);
            // Diving: the depth the swimmer steers to, under the float.
            const target = float - Math.max(0, Math.min(character._reactorDive || 0, float - ground - this.DIVE_FLOOR));
            vz = (vz + (target - height) * this.WATER_SPRING) * this.WATER_DRAG;
            // Water lifts at a swimmer's pace and never past the surface: from the
            // bottom of a deep pool the spring alone threw a character into the sky.
            vz = Math.max(-this.WATER_SINK_MAX, Math.min(this.WATER_RISE_MAX, vz));
            height += vz;
            if (height > float) { height = float; vz = Math.min(vz, 0); }
            character._reactorPeak = undefined;
            character._reactorSwim = height <= float + 0.3;
            character._reactorAlt = height;
            character._reactorVz = vz;
            character._reactorAir = height - ground;
            return;
        }
        character._reactorSwim = false;
        // Out of the water onto a bank: climbed, not teleported.
        if (swam && height < ground - 1e-3) {
            height = Math.min(ground, height + this.CLIMB_SPEED);
            character._reactorAlt = height;
            character._reactorVz = 0;
            character._reactorAir = height - ground;
            character._reactorClimb = height < ground;
            if (character._reactorClimb) character._reactorSwim = true;
            return;
        }
        // Down a stair or a small step a walker keeps its footing; only a ledge (or a jump) is a fall.
        if (vz === 0 && height > ground && height - ground <= 1 + Reactor3D.TERRAIN_SLOPE_LIMIT) height = ground;
        if (height > ground + 1e-3 || vz > 0) {
            const settings = this.settings();
            vz -= this.gravityPerFrame(settings);
            if (vz <= 0) character._reactorLeap = false;
            // A fall into deep water ends at its surface: the splash, and the water takes it from there.
            if (float !== null && height + vz <= float + 0.02 && vz < 0) {
                height += vz;
                character._reactorPeak = undefined;
                this.onSplash(character, -vz);
                character._reactorSwim = true;
                character._reactorAlt = height;
                character._reactorVz = vz;
                character._reactorAir = height - ground;
                return;
            }
            height += vz;
            character._reactorPeak = Math.max(Number.isFinite(character._reactorPeak) ? character._reactorPeak : height, height);
            if (height <= ground) {
                const fell = (character._reactorPeak || ground) - ground;
                height = ground; vz = 0;
                character._reactorPeak = undefined;
                this.onLand(character, fell, settings);
            }
        } else {
            height = ground; vz = 0;
            character._reactorPeak = undefined;
            character._reactorLeap = false;
            character._reactorClimb = false;
        }
        character._reactorAlt = height;
        character._reactorVz = vz;
        character._reactorAir = Math.max(0, height - ground);
    };

    /**
     * A jump from the ground: the upward speed that reaches the jump height
     * under this gravity. From the water it reaches the jump height over the
     * surface, so a swimmer can make a bank a walker could jump onto.
     */
    ReactorPhysics.jump = function(character) {
        if (!character || this.isAirborne(character) || !this.jumpAllowed()) return false;
        // Off a ladder: a push up and away, for a roof's edge or to let go.
        if (character._reactorOnLadder) character._reactorOnLadder = false;
        if (character._reactorSwim && (character._reactorDive || 0) > 0.05) return false;
        if (character._reactorClimb) return false;
        const settings = this.settings();
        const g = this.gravityPerFrame(settings);
        const rise = settings.jumpHeight + (character._reactorSwim ? settings.swimDepth : 0);
        character._reactorVz = Math.sqrt(2 * g * rise);
        character._reactorLeap = true;
        character._reactorSwim = false;
        character._reactorPeak = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround;
        if (typeof SoundManager !== "undefined" && SoundManager.playJump) SoundManager.playJump();
        return true;
    };

    /** Into the water: the splash the 3D view draws, and the project's splash sound for the player. */
    ReactorPhysics.onSplash = function(character, speed) {
        character._reactorSplash = { frame: typeof Graphics !== "undefined" ? Graphics.frameCount : 0, speed: Math.max(0, speed || 0) };
        if (typeof $gamePlayer === "undefined" || character !== $gamePlayer || typeof AudioManager === "undefined") return;
        const se = this.settings().splashSe;
        if (se) AudioManager.playSe({ name: se.name, volume: Number.isFinite(se.volume) ? se.volume : 90, pitch: Number.isFinite(se.pitch) ? se.pitch : 100, pan: Number.isFinite(se.pan) ? se.pan : 0 });
    };

    /** A long fall hurts: a share of max HP per tile past the safe height, or the project's common event. */
    ReactorPhysics.onLand = function(character, fell, settings) {
        if (typeof $gamePlayer === "undefined" || character !== $gamePlayer || !settings.fallDamage || !(fell > settings.fallFrom)) return;
        const tiles = fell - settings.fallFrom;
        if (settings.fallCommonEvent > 0 && typeof $gameTemp !== "undefined") {
            if (typeof $gameVariables !== "undefined" && settings.fallVariable > 0) $gameVariables.setValue(settings.fallVariable, Math.round(tiles));
            $gameTemp.reserveCommonEvent(settings.fallCommonEvent);
            return;
        }
        if (typeof $gameParty === "undefined") return;
        const share = Math.min(1, tiles * settings.fallPercent / 100);
        for (const actor of $gameParty.members()) {
            if (!actor.isAlive()) continue;
            actor.gainHp(-Math.max(1, Math.round(actor.mhp * share)));
        }
        if (typeof $gameScreen !== "undefined") $gameScreen.startFlash([255, 0, 0, 128], 8);
        if (typeof SoundManager !== "undefined" && SoundManager.playActorDamage) SoundManager.playActorDamage();
        if ($gameParty.isAllDead() && typeof SceneManager !== "undefined" && typeof Scene_Gameover !== "undefined") SceneManager.goto(Scene_Gameover);
    };

    /**
     * Whether a step is blocked for a character in the air: anything it is
     * above (by the step it could take on the ground) it moves over, and a
     * drop never stops it. On the ground the terrain's own rule stands.
     */
    ReactorPhysics.airBlocks = function(character, x2, y2) {
        const height = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        const ahead = Reactor3D.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, height);
        return ahead > height + Reactor3D.TERRAIN_SLOPE_LIMIT;
    };

    if (typeof Game_CharacterBase !== "undefined") {
        const _update = Game_CharacterBase.prototype.update;
        Game_CharacterBase.prototype.update = function() {
            _update.apply(this, arguments);
            ReactorPhysics.update(this);
        };
    }

    if (typeof Game_Player !== "undefined") {
        const _updateP = Game_Player.prototype.update;
        Game_Player.prototype.update = function(sceneActive) {
            const free = sceneActive && typeof Input !== "undefined" && this.canMove() && !this.isInVehicle()
                && typeof $gameMap !== "undefined" && !$gameMap.isEventRunning();
            // In the water Dash dives and Jump rises; at the surface Jump leaps out.
            const under = free && this._reactorSwim ? ReactorPhysics.steerDive(this, Input.isPressed("shift"), Input.isPressed("jump") && (this._reactorDive || 0) > 0, ReactorPhysics.lookDive(this)) : false;
            if (free && !under && !((this._reactorDive || 0) > 0) && Input.isTriggered("jump")) ReactorPhysics.jump(this);
            _updateP.apply(this, arguments);
        };
        // On a ladder the way toward the wall climbs and the way back climbs
        // down; at the top the way on steps onto the ledge, at the foot the way
        // back walks off, and sideways lets go of nothing: it is not taken.
        const _moveStraight = Game_Player.prototype.moveStraight;
        Game_Player.prototype.moveStraight = function(d) {
            const ladder = typeof Reactor3D !== "undefined" && Reactor3D.ladderAt && typeof $dataMap !== "undefined" && $dataMap
                && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap) ? Reactor3D.ladderAt($dataMap, this.x, this.y) : null;
            if (ladder && !this.isMoving()) {
                const alt = Number.isFinite(this._reactorAlt) ? this._reactorAlt : ladder.bottom;
                const up = d === ladder.dir, down = d === 10 - ladder.dir;
                if (up && alt < ladder.top - 0.01) {
                    this.setDirection(ladder.dir);
                    this._reactorAlt = Math.min(ladder.top, alt + ReactorPhysics.LADDER_SPEED);
                    this._reactorOnLadder = true;
                    return;
                }
                if (down && this._reactorOnLadder && alt > ladder.bottom + 0.01) {
                    this.setDirection(ladder.dir);
                    this._reactorAlt = Math.max(ladder.bottom, alt - ReactorPhysics.LADDER_SPEED);
                    return;
                }
                if (!up && !down && this._reactorOnLadder) return;
            }
            return _moveStraight.apply(this, arguments);
        };
        // A follower still climbing does not step on yet; it catches up once there.
        if (typeof Game_Follower !== "undefined") {
            const _chase = Game_Follower.prototype.chaseCharacter;
            Game_Follower.prototype.chaseCharacter = function(character) {
                if (ReactorPhysics.followerClimbing(this)) { this._reactorChaseLater = character; return; }
                this._reactorChaseLater = null;
                return _chase.apply(this, arguments);
            };
            const _followerUpdate = Game_Follower.prototype.update;
            Game_Follower.prototype.update = function() {
                _followerUpdate.apply(this, arguments);
                // The leader has taken to a ladder beside this follower: it takes to the ladder too, behind.
                const leader = ReactorPhysics.leaderOf(this);
                if (leader && leader._reactorOnLadder && !this.isMoving() && this.isVisible && this.isVisible()
                    && (leader.x !== this.x || leader.y !== this.y) && !ReactorPhysics.followerClimbing(this)
                    && typeof Reactor3D !== "undefined" && Reactor3D.ladderAt && typeof $dataMap !== "undefined" && Reactor3D.ladderAt($dataMap, leader.x, leader.y)) {
                    // A climbing leader stays on its cell, so the line would never close up: walk to it, then onto the ladder.
                    const sx = this.deltaXFrom(leader.x), sy = this.deltaYFrom(leader.y);
                    if (Math.abs(sx) + Math.abs(sy) === 1) this.moveStraight(sx > 0 ? 4 : sx < 0 ? 6 : sy > 0 ? 8 : 2);
                    else this.chaseCharacter(leader);
                    this._reactorChaseLater = null;
                }
                const lead = this._reactorChaseLater;
                if (lead && !this.isMoving() && !ReactorPhysics.followerClimbing(this)) {
                    if (Math.abs(this.deltaXFrom(lead.x)) + Math.abs(this.deltaYFrom(lead.y)) > 1) this.chaseCharacter(lead);
                    else this._reactorChaseLater = null;
                }
            };
        }
        // A swimmer is slower and never dashes.
        const _realMoveSpeed = Game_CharacterBase.prototype.realMoveSpeed;
        Game_CharacterBase.prototype.realMoveSpeed = function() {
            const speed = _realMoveSpeed.apply(this, arguments);
            // Followers copy the player's speed, which already has it.
            const follower = typeof Game_Follower !== "undefined" && this instanceof Game_Follower;
            return this._reactorSwim && !follower ? Math.max(1, speed - 1) : speed;
        };
        const _isDashing = Game_Player.prototype.isDashing;
        Game_Player.prototype.isDashing = function() {
            return !this._reactorSwim && _isDashing.apply(this, arguments);
        };
        // A character in the air is not stopped by what it is over; the start of a fall off a ledge is only by jumping.
        const _isMapPassable = Game_CharacterBase.prototype.isMapPassable;
        Game_CharacterBase.prototype.isMapPassable = function(x, y, d) {
            // Stepping off the top of a ladder: judged from the height the climber holds.
            if (this._reactorOnLadder && typeof Reactor3D !== "undefined" && typeof $dataMap !== "undefined" && $dataMap && Reactor3D.terrainBlocks) {
                const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
                if (!$gameMap.isValid(x2, y2)) return false;
                if (!($gameMap.isPassable(x, y, d) && $gameMap.isPassable(x2, y2, this.reverseDir(d)))) return false;
                return !Reactor3D.terrainBlocks($dataMap, x, y, x2, y2, this._reactorAlt);
            }
            // Under the water, a swimmer is stopped by rock it would swim into, and nothing else in the water.
            if (ReactorPhysics.isUnderwater(this) && typeof Reactor3D !== "undefined" && typeof $dataMap !== "undefined" && $dataMap && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap)) {
                const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
                if (!$gameMap.isValid(x2, y2)) return false;
                const height = Number.isFinite(this._reactorAlt) ? this._reactorAlt : 0;
                const ahead = Reactor3D.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, height);
                if (ahead > height + Reactor3D.TERRAIN_SLOPE_LIMIT) return false;
                return _isMapPassable.apply(this, arguments);
            }
            if (ReactorPhysics.isAirborne(this) && typeof Reactor3D !== "undefined" && typeof $dataMap !== "undefined" && $dataMap && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap)) {
                const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
                if (!$gameMap.isValid(x2, y2)) return false;
                return !ReactorPhysics.airBlocks(this, x2, y2);
            }
            return _isMapPassable.apply(this, arguments);
        };
    }

    if (typeof module !== "undefined" && module.exports) module.exports = ReactorPhysics;
})(typeof window !== "undefined" ? window : globalThis);
