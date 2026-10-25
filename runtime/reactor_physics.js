//=============================================================================
// reactor_physics.js - RPG Reactor jumping and gravity
//=============================================================================
//
// On 3D maps: a character has a height and a vertical speed. Jumping
// gives the player an upward speed; gravity takes it away frame by frame;
// walking or jumping off a ledge falls; a jump carries a character over
// anything below its height and lands it there, a walk off an edge comes
// down where it stepped off. Landing after a long fall can
// hurt the party or run a common event. Water deeper than a character
// stands is swum: it floats with its head out, moves slower, never dashes,
// climbs out onto a low bank and can jump from the water; a fall into
// water dips under and bobs back up without hurting. A ledge too high to jump
// onto but within reach of raised hands is mantled: grabbed and climbed.
// `ReactorPhysics.edge` answers what a body can do between two cells (walk,
// hop, mantle, ladder, drop, blocked) from the map's data alone. Gravity and jump height are the
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
    ReactorPhysics.DEFAULTS = { gravity: 1, jumpHeight: 1.25, jump: true, fallDamage: false, fallFrom: 6, fallPercent: 10, fallCommonEvent: 0, swim: true, swimDepth: 2.2, splashSe: null, landSe: null, hardLandSe: null, ragdoll: true, mantle: true, mantleReach: 3, stepUp: true, stepUpReach: 1.5,
        battleClimb: true, climbHeight: 6, climbCost: 0.75, battleFall: "hurt", lethalFall: "ask" };
    /**
     * What a long fall does in a battle on the map (`battleFall`): "hurt" (a unit may jump down any height and
     * takes the fall rule's damage past the safe fall), "safe" (any height, no damage), "off" (no deeper than the
     * safe fall; higher roofs are left by a ladder or a climb).
     */
    ReactorPhysics.BATTLE_FALLS = ["hurt", "safe", "off"];
    /**
     * A fall that would leave a unit with no HP (`lethalFall`): "ask" (the player may choose one for a unit it
     * orders, after a question), "allow" (the same, without the question), "never" (nobody is offered one). A unit
     * that decides for itself never takes one.
     */
    ReactorPhysics.LETHAL_FALLS = ["ask", "allow", "never"];
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
        // Blank is not 0: a null or empty gravity is the default, not a near-weightless 0.01.
        const num = (v, fallback, lo, hi) => { const n = v === null || v === "" || typeof v === "boolean" ? NaN : Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback; };
        out.gravity = num(out.gravity, 1, 0.01, 10);
        out.jumpHeight = num(out.jumpHeight, 1.25, 0, 20);
        out.fallFrom = num(out.fallFrom, 6, 0, 200);
        out.fallPercent = num(out.fallPercent, 10, 0, 100);
        out.fallCommonEvent = Math.max(0, Math.floor(Number(out.fallCommonEvent) || 0));
        out.swimDepth = num(out.swimDepth, 2.2, 0.2, 20);
        out.swim = out.swim !== false;
        const sound = se => se && typeof se === "object" && se.name ? se : null;
        out.splashSe = sound(out.splashSe);
        out.landSe = sound(out.landSe);
        out.hardLandSe = sound(out.hardLandSe);
        out.ragdoll = out.ragdoll !== false;
        out.jump = out.jump !== false;
        out.mantle = out.mantle !== false;
        out.mantleReach = num(out.mantleReach, 3, 0, 20);
        out.stepUp = out.stepUp !== false;
        // Whatever the project or the map sets, a walk never climbs more than a hop.
        out.stepUpReach = Math.min(num(out.stepUpReach, 1.5, 0, 20), this.stepUpCap(out.jumpHeight));
        out.fallDamage = !!out.fallDamage;
        out.battleClimb = out.battleClimb !== false;
        out.climbHeight = num(out.climbHeight, 6, 0, 50);
        out.climbCost = num(out.climbCost, 0.75, 0, 10);
        out.battleFall = this.BATTLE_FALLS.includes(out.battleFall) ? out.battleFall : "hurt";
        out.lethalFall = this.LETHAL_FALLS.includes(out.lethalFall) ? out.lethalFall : "ask";
        return out;
    };

    /**
     * The highest ledge a walker climbs by walking into it, whatever
     * `stepUpReach` says: a hop, the rise a jump of `jumpHeight` carries a
     * body onto (the jump height and a step: 2 tiles at the stock jump).
     * Anything higher is a mantle and takes the Jump key. Never under the
     * stock reach, so a game with a low jump still walks out of a pond; and
     * a game with no jump at all (a jump height of 0) keeps the stock hop.
     */
    ReactorPhysics.stepUpCap = function(jumpHeight) {
        const limit = typeof Reactor3D !== "undefined" && Reactor3D.TERRAIN_SLOPE_LIMIT || 0.75;
        return Math.max(this.DEFAULTS.stepUpReach, (jumpHeight > 0 ? jumpHeight : this.DEFAULTS.jumpHeight) + limit);
    };

    /** Gravity in tiles per frame squared (the game runs 60 frames a second). */
    ReactorPhysics.gravityPerFrame = function(settings = this.settings()) {
        return settings.gravity * this.EARTH / 3600;
    };

    ReactorPhysics.jumpAllowed = function() {
        const settings = this.settings();
        if (!(settings.jumpHeight > 0)) return false;
        // A map set to jump (Map Properties › Jumping: On) jumps even where the project's Controls switch it off.
        const map = typeof $dataMap !== "undefined" && $dataMap && $dataMap.reactor3d && $dataMap.reactor3d.physics;
        if (map && typeof map === "object" && map.jump === true) return true;
        return settings.jump && (root.ReactorControls ? root.ReactorControls.settings().jump : true);
    };

    /** How far above a character's ground it is: the height the 3D view adds. */
    ReactorPhysics.air = function(character) {
        return character && character._reactorAir > 0 ? character._reactorAir : 0;
    };

    /** Whether a character is in the air (a jump, a fall); a swimmer, a vehicle's rider and a walker coming down a step are not. */
    ReactorPhysics.isAirborne = function(character) {
        return !!character && !character._reactorSwim && !character._reactorOnLadder && !character._reactorRiding && !character._reactorMantle
            && !character._reactorStepDown && (character._reactorAir > 0.02 || character._reactorVz > 0);
    };

    /**
     * Whether a character is falling without having jumped: it walked off an
     * edge (or the ground went from under it) and is more than a step over
     * what is below. It takes no step on through the air.
     */
    ReactorPhysics.fellOff = function(character) {
        if (!character || character._reactorJumped || !this.isAirborne(character)) return false;
        const limit = typeof Reactor3D !== "undefined" && Reactor3D.TERRAIN_SLOPE_LIMIT || 0.75;
        return !(character._reactorVz > 0) && character._reactorAir > limit;
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
        // A river's surface where the swimmer is, so it floats smoothly down a slope.
        const level = Reactor3D.waterSurfaceAt ? Reactor3D.waterSurfaceAt(mapData, x, y) : Reactor3D.waterLevelAt(mapData, Math.floor(x), Math.floor(y));
        if (level === null || level - ground <= settings.swimDepth) return null;
        return level - settings.swimDepth;
    };

    /**
     * A river carries whoever is in it: a swimmer, or a wader where it runs
     * fast. Left alone in it (no step taken, none asked for), a character
     * builds up drift each way at the river's speed and is moved a cell
     * along whichever way has built up a whole cell, facing as it was, so a
     * river running aslant carries it aslant, step by step. A step of its
     * own starts the count again. Returns whether it was moved.
     */
    ReactorPhysics.DRIFT_WADE_SPEED = 1;
    ReactorPhysics.drift = function(character, asked) {
        if (!character || typeof Reactor3D === "undefined" || !Reactor3D.waterFlowAt || typeof $dataMap === "undefined" || !$dataMap) return false;
        const stop = () => { character._reactorDriftX = 0; character._reactorDriftY = 0; return false; };
        if (asked || character._reactorOnLadder || this.isAirborne(character)) return stop();
        // Mid-step (the current's own step, or one it was given) the count waits.
        if (character.isMoving()) return false;
        const flow = Reactor3D.hasWater($dataMap) ? Reactor3D.waterFlowAt($dataMap, character.x, character.y) : null;
        const wading = !character._reactorSwim && flow && flow.speed >= this.DRIFT_WADE_SPEED
            && flow.level - (Number.isFinite(character._reactorGround) ? character._reactorGround : flow.level) > 0.25;
        if (!flow || (!character._reactorSwim && !wading)) return stop();
        const ax = (character._reactorDriftX || 0) + flow.dx * flow.speed / 60, ay = (character._reactorDriftY || 0) + flow.dz * flow.speed / 60;
        character._reactorDriftX = ax; character._reactorDriftY = ay;
        if (Math.abs(ax) < 1 && Math.abs(ay) < 1) return false;
        const alongX = Math.abs(ax) >= Math.abs(ay);
        if (alongX) character._reactorDriftX = ax - Math.sign(ax); else character._reactorDriftY = ay - Math.sign(ay);
        const d = alongX ? (ax > 0 ? 6 : 4) : (ay > 0 ? 2 : 8);
        if (!character.canPass(character.x, character.y, d)) return stop();
        const facing = character.direction();
        character.moveStraight(d);
        if (character.setDirection) character.setDirection(facing);
        return !!(character.isMovementSucceeded && character.isMovementSucceeded());
    };

    /** How far apart the party climbs one ladder: about a body length. */
    ReactorPhysics.LADDER_GAP = 3;
    /** Climbing a ladder, tiles per frame. */
    ReactorPhysics.LADDER_SPEED = 0.045;

    /** The ladder a character holds: on a ladder's cell, between its foot and its top, off the ground. */
    ReactorPhysics.ladderHeld = function(character) {
        if (!character || typeof Reactor3D === "undefined" || !Reactor3D.ladderAt || typeof $dataMap === "undefined" || !$dataMap) return null;
        const ladder = Reactor3D.ladderAt($dataMap, character.x, character.y);
        const alt = character._reactorAlt;
        if (!ladder || !Number.isFinite(alt) || alt < ladder.bottom - 0.01 || alt > ladder.top + 0.05) return null;
        return ladder;
    };

    /**
     * The character a follower walks behind: the nearest one before it in the
     * line that follows and is seen, or the player. One out of the line (told
     * to stay, sent somewhere, on a route, hidden) leads nobody up a ladder
     * or a ledge, and one under such an order follows nobody: null.
     */
    ReactorPhysics.leaderOf = function(character) {
        if (typeof Game_Follower === "undefined" || !(character instanceof Game_Follower) || typeof $gamePlayer === "undefined") return null;
        if (character._rrOrder) return null;
        const line = $gamePlayer.followers && $gamePlayer.followers()._data || [];
        let ahead = line.indexOf(character) - 1;
        while (ahead >= 0 && (line[ahead]._rrOrder || line[ahead]._rrHidden)) ahead--;
        return ahead < 0 ? $gamePlayer : line[ahead];
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

    /**
     * A follower whose next step toward its leader is up a ledge takes it as
     * its leader did: a hop or a mantle, not a walk through the wall. Returns
     * whether it took hold.
     */
    ReactorPhysics.followerMantle = function(character, lead) {
        const climbs = this.settings().mantle, steps = this.stepUpReach() > 0;
        if ((!climbs && !steps) || (character.isVisible && !character.isVisible())) return false;
        const sx = character.x - lead.x, sy = character.y - lead.y;
        if (!sx && !sy) return false;
        // Only up to where its leader went: a leader who walked under the eave is followed under it.
        const limit = world() ? world().TERRAIN_SLOPE_LIMIT : 0.75;
        const leadAlt = Number.isFinite(lead._reactorAlt) ? lead._reactorAlt : lead._reactorGround || 0;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        if (leadAlt - alt <= limit) return false;
        const tries = [];
        if (sx && (!sy || Math.abs(sx) >= Math.abs(sy))) tries.push(sx > 0 ? 4 : 6);
        if (sy) tries.push(sy > 0 ? 8 : 2);
        if (sx && sy && Math.abs(sx) < Math.abs(sy)) tries.push(sx > 0 ? 4 : 6);
        // As its leader did: by a jump's reach where ledges are climbed, else the low ledge a walker steps up.
        for (const d of tries) if ((climbs && this.tryMantle(character, d, true, leadAlt + limit)) || (steps && this.stepUp(character, d, leadAlt + limit))) return true;
        return false;
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

    /** On the ground, still: no height, no speed, not swimming, climbing or diving. */
    ReactorPhysics.settle = function(character) {
        character._reactorAir = 0; character._reactorVz = 0; character._reactorAlt = undefined; character._reactorPeak = undefined;
        character._reactorSwim = false; character._reactorLeap = false; character._reactorClimb = false;
        character._reactorOnLadder = false; character._reactorDive = 0; character._reactorFloat = undefined;
        character._reactorRiding = false; character._reactorMantle = null; character._reactorStepDown = false;
        character._reactorStepUp = undefined; character._reactorJumped = false;
    };

    // Scratch for `groundPoint`: read before the next call.
    const POINT = [0, 0];
    /** How far inside a cell's border a ground point kept in that cell stays, in tiles. */
    ReactorPhysics.POINT_INSET = 1e-4;

    /**
     * The point of the map a character's ground is read at, `[x, z]` in tiles:
     * its own middle. On a diagonal step the middle passes over the corner
     * where four cells meet, and that point floors into a cell the step never
     * enters; there the point is kept inside the cell being left until
     * half-way and inside the cell being entered from then on. `out` receives
     * the point; without it a shared scratch is returned, to be read before
     * the next call.
     */
    ReactorPhysics.groundPoint = function(character, out) {
        const point = out || POINT;
        const x = Number.isFinite(character._realX) ? character._realX : character.x;
        const y = Number.isFinite(character._realY) ? character._realY : character.y;
        point[0] = x + 0.5; point[1] = y + 0.5;
        const tx = character.x, ty = character.y;
        const dx = tx - x, dy = ty - y;
        // Still, a straight step, or a move of more than a cell (a jump's arc): the middle is in a cell the body is in.
        if (!dx || !dy || !(Math.abs(dx) <= 1) || !(Math.abs(dy) <= 1)) return point;
        const entered = Math.max(Math.abs(dx), Math.abs(dy)) <= 0.5, inset = this.POINT_INSET;
        const cx = entered ? tx : tx - Math.sign(dx), cy = entered ? ty : ty - Math.sign(dy);
        point[0] = Math.min(cx + 1 - inset, Math.max(cx + inset, point[0]));
        point[1] = Math.min(cy + 1 - inset, Math.max(cy + inset, point[1]));
        return point;
    };

    /**
     * The ground under a character where it is now, on the floor it is on:
     * read at its `groundPoint`, nearest the ground it last stood on. For
     * anything that needs a moving body's ground outside the physics' own
     * frame (an aim, a marker, a camera).
     */
    ReactorPhysics.groundUnder = function(character, near) {
        const R = world();
        if (!R || !character || typeof $dataMap === "undefined" || !$dataMap) return 0;
        const point = this.groundPoint(character);
        return R.groundHeightAt($dataMap, point[0], point[1], Number.isFinite(near) ? near : character._reactorGround);
    };

    /** Tiles an airship at full altitude flies over the highest thing under it. */
    ReactorPhysics.AIRSHIP_HEIGHT = 3;

    /**
     * A vehicle on a 3D map, and the player aboard it: a boat or ship rides the
     * water's surface, an airship rises with its altitude over the top of what
     * is under it (a roof as much as the ground). No gravity, and not airborne.
     */
    ReactorPhysics.ride = function(character, craft) {
        this.settle(character);
        character._reactorRiding = true;
        const point = this.groundPoint(character), px = point[0], py = point[1];
        const airship = !!(craft && craft.isAirship && craft.isAirship());
        const ground = Reactor3D.groundHeightAt($dataMap, px, py, airship ? Infinity : character._reactorGround);
        character._reactorGround = ground;
        const level = Reactor3D.waterLevelAt && Reactor3D.hasWater && Reactor3D.hasWater($dataMap)
            ? Reactor3D.waterLevelAt($dataMap, Math.floor(px), Math.floor(py)) : null;
        const surface = level !== null && level > ground ? level : ground;
        const max = airship && craft.maxAltitude ? craft.maxAltitude() : 0;
        const flight = max > 0 ? Math.max(0, Math.min(1, (craft._altitude || 0) / max)) * this.AIRSHIP_HEIGHT : 0;
        character._reactorAir = surface - ground + flight;
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
            // No rise onto ground walked into (below) is under way where nothing rises: a flat map, a vehicle.
            if (character._reactorRisen) character._reactorRisen = false;
            if (vehicle && typeof Reactor3D !== "undefined" && typeof $dataMap !== "undefined" && $dataMap && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap)) {
                this.ride(character, character instanceof Game_Vehicle ? character : character.vehicle && character.vehicle());
            } else this.settle(character);
            return;
        }
        // Pulling itself up a ledge: the mantle moves it, not gravity.
        if (character._reactorMantle) { this.updateMantle(character); return; }
        // On a grapple's line: the pull moves it.
        if (character._reactorGrapple) { this.updateGrapple(character); return; }
        const point = this.groundPoint(character), px = point[0], py = point[1];
        const limit = Reactor3D.TERRAIN_SLOPE_LIMIT;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : null;
        const flying = this.isAirborne(character);
        if (!flying) character._reactorJumped = false;
        // The floor a body is on: coming up a step, the top it is making for and not the height its feet have reached
        // (unless somebody has given it another ground meanwhile: a unit sent to another floor).
        const coming = Number.isFinite(character._reactorStepUp) && character._reactorGround === alt;
        const last = coming ? character._reactorStepUp : character._reactorGround;
        character._reactorStepUp = undefined;
        // Coming up onto ground it walked into (below): that rise goes on as it began until it is up.
        let risen = coming && character._reactorRisen === true;
        if (character._reactorRisen) character._reactorRisen = false;
        const near = alt !== null && (flying || character._reactorSwim || character._reactorOnLadder) ? alt : last;
        let ground = Reactor3D.groundHeightAt($dataMap, px, py, near);
        // A body keeps the layer it is on. Ground more than a level and a step over where it stood (in the air: more
        // than a step over its feet) is a wall beside it or a slab over it, never something it walked or flew onto.
        // A swimmer and a climber have their own rules, and a jump's arc (an event's Jump, a Tactical hop) lands where it is sent.
        if (alt !== null && Number.isFinite(last) && !character._reactorSwim && !character._reactorOnLadder && !(character.isJumping && character.isJumping())) {
            const reach = flying ? alt + limit : last + 1 + limit;
            if (ground > reach + 1e-6) {
                // In the air the floor it was over may still be under it; out of reach too, it stays over what it had.
                const under = flying ? Reactor3D.groundHeightAt($dataMap, px, py, Math.min(last, alt)) : ground;
                // Unless it has walked into the ground itself, where a rock or a bank rises steeply at a cell's
                // border: nothing of that cell is at its feet or under them, and the ground at its own point is no
                // further over it than a walked step leaves a body (`underGround`). It comes up onto that ground.
                if (!flying && ground <= last + 1 + 2 * limit + 1e-6 && this.underGround(character, Math.floor(px), Math.floor(py), last)) risen = true;
                else ground = under > reach + 1e-6 ? last : under;
            }
        }
        character._reactorGround = ground;
        const wasStepping = !!character._reactorStepDown;
        character._reactorStepDown = false;
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
        const float = wet ? this.floatHeight($dataMap, px, py, ground) : null;
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
        // Down a stair or a small step a walker keeps its footing; only a ledge (or a jump) is a fall. A step deeper
        // than a stair's is come down over a few frames, not in one: the view rides the walker's height.
        // Still coming down one when the ground steps down again (two ledges close together, a run of stairs under a
        // body hauled faster than a step is eased), it keeps its footing and goes on coming down at the same speed.
        let stepping = false;
        if (vz === 0 && !flying && height > ground && (height - ground <= 1 + limit || (wasStepping && last - ground <= 1 + limit))) {
            const rate = height - ground > this.STEP_SPEED ? this.stepRate(character) : this.STEP_SPEED;
            height = height - ground > rate ? height - rate : ground;
            stepping = height > ground;
        }
        character._reactorStepDown = stepping;
        if (stepping) {
            character._reactorPeak = undefined;
            character._reactorLeap = false;
            character._reactorClimb = false;
        } else if (height > ground + 1e-3 || vz > 0) {
            const settings = this.settings();
            vz -= this.gravityPerFrame(settings);
            if (vz <= 0) character._reactorLeap = false;
            // Rising under something built: the head stops at its underside.
            if (vz > 0) {
                const roof = this.ceilingAbove($dataMap, Math.floor(px), Math.floor(py), height);
                if (height + vz + this.BODY_HEIGHT > roof) { vz = 0; height = Math.max(height, roof - this.BODY_HEIGHT); character._reactorLeap = false; }
            }
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
            // A jump taken walking up a step (a stair, a stepped roof) meets higher ground
            // while still rising: it is carried up onto the step and goes on rising,
            // where it used to count as a landing and stop dead.
            if (height <= ground && vz > 0) height = ground;
            if (height <= ground && vz <= 0) {
                const fell = (character._reactorPeak || ground) - ground;
                height = ground; vz = 0;
                character._reactorPeak = undefined;
                this.onLand(character, fell, settings);
            }
        } else {
            // Up a step higher than a stair's the body comes up over a few frames, as it comes down one. The ground
            // it reports is where its feet are, so the view rides the walker and not the step; the top it is making
            // for is kept beside it, and is the floor the next frame is judged from. A rise past a walker's reach is
            // somebody placing it (a unit sent to another floor): there at once. Ground it walked into (`underGround`)
            // is come up onto the same way.
            const rate = alt !== null && ground - height > this.STEP_SPEED ? this.stepRate(character) : 0;
            if (rate > 0 && ground - height > rate && (risen || ground - height <= 1 + limit + 1e-6)) {
                character._reactorStepUp = ground;
                if (risen) character._reactorRisen = true;
                height += rate;
                ground = height;
                character._reactorGround = ground;
            } else height = ground;
            vz = 0;
            character._reactorPeak = undefined;
            character._reactorLeap = false;
            character._reactorClimb = false;
        }
        character._reactorAlt = height;
        character._reactorVz = vz;
        character._reactorAir = Math.max(0, height - ground);
    };

    /**
     * Whether a body standing at `height` that has come onto cell (x, y)
     * has walked into the ground itself: the lowest place of the cell is
     * the terrain or a rock, more than a step over the body, and no further
     * over it than a walked step leaves one (it kept its footing down a
     * level and a step, and the step's edge and far end are each a step
     * over where it left: a level and two steps). Deeper, a body is
     * crossing a rock or a hill and keeps its own level; `update` holds the
     * ground at the body's own point to the same depth. A wall, a post, a
     * block or a shut door a body stands in or beside is not ground. Nor is
     * anything to a body that passes through things: an event or the
     * player set Through, the player holding the playtest's walk-through
     * key, and a follower (always set Through) while the player does or the
     * party gathers.
     */
    ReactorPhysics.underGround = function(character, x, y, height) {
        const follower = typeof Game_Follower !== "undefined" && character instanceof Game_Follower;
        const who = !follower ? character : typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        if (who && ((who.isThrough && who.isThrough()) || (who.isDebugThrough && who.isDebugThrough()))) return false;
        if (follower && who && who.areFollowersGathering && who.areFollowersGathering()) return false;
        const limit = Reactor3D.TERRAIN_SLOPE_LIMIT;
        const lowest = this.levelsAt($dataMap, x, y)[0];
        return !!lowest && (lowest.kind === "ground" || lowest.kind === "rock") && lowest.top > height + limit && lowest.top <= height + 1 + 2 * limit + 1e-6;
    };

    /** How fast a walker comes up or down a step it keeps its footing on, tiles per frame: a stair at a walk or a run is slower. */
    ReactorPhysics.STEP_SPEED = 0.3;
    /** The steepest thing walked, in tiles of rise for a tile walked: a stair is 1, a roof's pitch a little more, the two halves of a step of the ground 1.5. */
    ReactorPhysics.SLOPE_RISE = 2;

    /**
     * The most a walker's feet rise or sink in a frame while they keep the
     * ground: `STEP_SPEED`, or what the steepest slope makes of the
     * character's own pace where that is more. A stair taken at any move
     * speed is under the walker every frame; only a step is eased.
     */
    ReactorPhysics.stepRate = function(character) {
        const pace = character.distancePerFrame ? character.distancePerFrame() : 0;
        return Math.max(this.STEP_SPEED, pace * this.SLOPE_RISE);
    };

    /**
     * The upward speed whose jump tops out at `rise` tiles under gravity `g`
     * (tiles per frame squared), counted in whole frames as the game moves:
     * the height is reached exactly on the frame the rise ends.
     */
    ReactorPhysics.jumpSpeed = function(rise, g) {
        if (!(rise > 0) || !(g > 0)) return 0;
        const frames = Math.max(1, Math.round(Math.sqrt(2 * rise / g)));
        return rise / frames + g * (frames + 1) / 2;
    };

    /**
     * A jump from the ground: the upward speed that reaches the jump height
     * under this gravity. From the water it reaches the jump height over the
     * surface, so a swimmer can make a bank a walker could jump onto.
     */
    ReactorPhysics.jump = function(character) {
        if (!character || character._reactorMantle || this.isAirborne(character) || !this.jumpAllowed()) return false;
        // Under something too low to rise beneath, nothing happens: no leap, no sound. A climber lets go all the same.
        if (!character._reactorOnLadder && this.headroom(character) < this.JUMP_MIN_ROOM) return false;
        // Off a ladder: a push up and away, for a roof's edge or to let go.
        if (character._reactorOnLadder) character._reactorOnLadder = false;
        if (character._reactorSwim && (character._reactorDive || 0) > 0.05) return false;
        if (character._reactorClimb) return false;
        const settings = this.settings();
        const g = this.gravityPerFrame(settings);
        const rise = settings.jumpHeight + (character._reactorSwim ? settings.swimDepth : 0);
        character._reactorVz = this.jumpSpeed(rise, g);
        character._reactorLeap = true;
        character._reactorJumped = true;
        character._reactorStepDown = false;
        character._reactorSwim = false;
        character._reactorPeak = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround;
        if (typeof SoundManager !== "undefined" && SoundManager.playJump) SoundManager.playJump();
        return true;
    };

    /** The least a jump has to be able to rise before the head meets what is over it, in tiles: under less, Jump is refused. */
    ReactorPhysics.JUMP_MIN_ROOM = 0.25;

    /** How far a character can rise where it stands before its head meets what is over it, in tiles: Infinity under the sky. */
    ReactorPhysics.headroom = function(character) {
        const R = world();
        if (!R || typeof $dataMap === "undefined" || !$dataMap || !R.isMap3D || !R.isMap3D($dataMap)) return Infinity;
        const feet = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround;
        if (!Number.isFinite(feet)) return Infinity;
        const point = this.groundPoint(character);
        return this.ceilingAbove($dataMap, Math.floor(point[0]), Math.floor(point[1]), feet) - feet - this.BODY_HEIGHT;
    };

    /** Why a Jump press did nothing, on the console (and in `lastJumpRefusal`). */
    ReactorPhysics.noteJumpRefused = function(character, reason) {
        if (!reason) {
            reason = !this.jumpAllowed() ? "jumping is switched off (Database › Controls, or the map)"
                : character._reactorMantle ? "climbing onto a ledge"
                : this.isAirborne(character) ? "already in the air (air " + (character._reactorAir || 0).toFixed(3) + ", rising " + (character._reactorVz || 0).toFixed(3) + ")"
                : !character._reactorOnLadder && this.headroom(character) < this.JUMP_MIN_ROOM ? "no room overhead"
                : character._reactorClimb ? "climbing out of the water"
                : character._reactorSwim ? "diving" : "unknown";
        }
        this.lastJumpRefusal = { frame: typeof Graphics !== "undefined" ? Graphics.frameCount : 0, reason, x: character.x, y: character.y, alt: character._reactorAlt };
        if (typeof console !== "undefined") console.info("RPG Reactor: Jump did nothing: " + reason + " at " + character.x + "," + character.y);
    };

    /** Into the water: the splash the 3D view draws, and the project's splash sound for the player. */
    ReactorPhysics.onSplash = function(character, speed) {
        character._reactorSplash = { frame: typeof Graphics !== "undefined" ? Graphics.frameCount : 0, speed: Math.max(0, speed || 0) };
        if (typeof $gamePlayer === "undefined" || character !== $gamePlayer || typeof AudioManager === "undefined") return;
        const se = this.settings().splashSe;
        if (se) AudioManager.playSe({ name: se.name, volume: Number.isFinite(se.volume) ? se.volume : 90, pitch: Number.isFinite(se.pitch) ? se.pitch : 100, pan: Number.isFinite(se.pan) ? se.pan : 0 });
    };

    /** A sound effect from the settings, played as authored. */
    ReactorPhysics.playSe = function(se) {
        if (!se || typeof AudioManager === "undefined") return;
        AudioManager.playSe({ name: se.name, volume: Number.isFinite(se.volume) ? se.volume : 90, pitch: Number.isFinite(se.pitch) ? se.pitch : 100, pan: Number.isFinite(se.pan) ? se.pan : 0 });
    };

    /** Frames a fatal fall leaves the bodies on the ground before the game ends. */
    ReactorPhysics.FATAL_FALL_FRAMES = 180;
    /** Landings from lower than this (tiles) are steps, not landings: no sound. */
    ReactorPhysics.LAND_SOUND_FROM = 0.5;

    /** A party member of the map: the player or a follower. */
    ReactorPhysics.isPartyCharacter = function(character) {
        return typeof $gamePlayer !== "undefined" && (character === $gamePlayer
            || (typeof Game_Follower !== "undefined" && character instanceof Game_Follower));
    };

    /**
     * A character goes limp: the 3D view hands its model to a ragdoll from this
     * frame on, carrying the speed it had. Input stops for the player.
     */
    ReactorPhysics.goLimp = function(character, impact) {
        if (!character || character._reactorRagdoll) return;
        let vx = 0, vz = 0;
        if (character.isMoving && character.isMoving() && character.distancePerFrame) {
            const d = character.direction(), step = character.distancePerFrame();
            vx = d === 6 ? step : d === 4 ? -step : 0;
            vz = d === 2 ? step : d === 8 ? -step : 0;
        }
        character._reactorRagdoll = { frame: typeof Graphics !== "undefined" ? Graphics.frameCount : 0, vx, vz, vy: -Math.max(0, impact || 0) };
    };

    /**
     * Landing: the landing sound; a long fall hurts (a share of max HP per tile
     * past the safe height, or the project's common event); a fall that kills
     * the whole party leaves the bodies limp on the ground for a moment before
     * the game ends, and a follower still falling goes limp where it lands.
     */
    ReactorPhysics.onLand = function(character, fell, settings) {
        if (typeof $gamePlayer === "undefined") return;
        const fatal = typeof $gameTemp !== "undefined" && $gameTemp._reactorFatalFall;
        if (fatal && this.isPartyCharacter(character)) { this.goLimp(character, this.impactSpeed(fell, settings)); return; }
        // A unit of a battle on the map lands as the battle says (`Game_Fight.onUnitLanded`): the fall hurts that unit alone.
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (fight && fight.isActive && fight.isActive() && fight.onUnitLanded && fight.onUnitLanded(character, fell, settings)) return;
        if (character !== $gamePlayer) return;
        const hurts = settings.fallDamage && fell > settings.fallFrom;
        if (!hurts) {
            if (fell >= this.LAND_SOUND_FROM) this.playSe(settings.landSe);
            return;
        }
        const tiles = fell - settings.fallFrom;
        if (settings.fallCommonEvent > 0 && typeof $gameTemp !== "undefined") {
            this.playSe(settings.hardLandSe || settings.landSe);
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
        if (settings.hardLandSe) this.playSe(settings.hardLandSe);
        else if (typeof SoundManager !== "undefined" && SoundManager.playActorDamage) SoundManager.playActorDamage();
        if (!$gameParty.isAllDead() || typeof SceneManager === "undefined" || typeof Scene_Gameover === "undefined") return;
        // Limp bodies need the 3D view to fall in; a flat map ends at once.
        const threeD = typeof Reactor3D !== "undefined" && Reactor3D.mapMode && typeof $dataMap !== "undefined" && Reactor3D.mapMode($dataMap) === Reactor3D.MODE_3D;
        if (!settings.ragdoll || !threeD) { SceneManager.goto(Scene_Gameover); return; }
        $gameTemp._reactorFatalFall = { frame: typeof Graphics !== "undefined" ? Graphics.frameCount : 0 };
        const impact = this.impactSpeed(fell, settings);
        this.goLimp($gamePlayer, impact);
        // Followers already down go limp now; one still in the air, where it lands.
        for (const follower of $gamePlayer.followers ? $gamePlayer.followers().visibleFollowers() : []) {
            if (!this.isAirborne(follower)) this.goLimp(follower, impact * 0.5);
        }
    };

    /** The share of max HP a fall of `fell` tiles takes by the fall rule (0 up to the safe fall, at most all of it). */
    ReactorPhysics.fallShare = function(fell, settings = this.settings()) {
        return fell > settings.fallFrom + 1e-6 ? Math.min(1, (fell - settings.fallFrom) * settings.fallPercent / 100) : 0;
    };

    /** The HP a share of max HP is to a battler of `mhp`: at least 1 when the share is more than nothing. */
    ReactorPhysics.fallHp = function(mhp, share) {
        return share > 0 ? Math.max(1, Math.round(Math.max(0, Number(mhp) || 0) * share)) : 0;
    };

    /** The speed (tiles a frame) of a body that fell this far under these settings. */
    ReactorPhysics.impactSpeed = function(fell, settings = this.settings()) {
        return Math.sqrt(2 * this.gravityPerFrame(settings) * Math.max(0, fell));
    };

    /** A fatal fall ends the game once its bodies have lain long enough. */
    ReactorPhysics.updateFatalFall = function() {
        const fatal = typeof $gameTemp !== "undefined" && $gameTemp._reactorFatalFall;
        if (!fatal || typeof Graphics === "undefined") return;
        if (Graphics.frameCount - fatal.frame < this.FATAL_FALL_FRAMES) return;
        $gameTemp._reactorFatalFall = null;
        SceneManager.goto(Scene_Gameover);
    };

    /**
     * Whether a step is blocked for a character in the air: anything it is
     * above (by the step it could take on the ground) it moves over, and a
     * drop never stops it. On the ground the terrain's own rule stands.
     * What it would come down on has to be somewhere a body stands: a fence, a
     * post or a spire is a wall to a jumper as to a walker.
     */
    ReactorPhysics.airBlocks = function(character, x2, y2) {
        const height = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        const limit = Reactor3D.TERRAIN_SLOPE_LIMIT;
        const ahead = Reactor3D.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, height);
        if (ahead > height + limit + 1e-6) return true;
        // Nor into a place too low for it: under a raised stair (solid down to the ground), or where what hangs
        // over the cell would be at its chest (a little of the head may graze).
        const stair = Reactor3D.stairPieceAt && Reactor3D.hasPieces && Reactor3D.hasPieces($dataMap) ? Reactor3D.stairPieceAt($dataMap, x2, y2) : null;
        if (stair && ahead < Reactor3D.pieceBaseAt($dataMap, x2, y2) + stair.z - 1e-6) return true;
        const feet = Math.max(ahead, height);
        if (this.ceilingAbove($dataMap, x2, y2, feet) < feet + this.BODY_HEIGHT - this.HEAD_GRAZE) return true;
        // What a walk from the ground under it could step onto is the walk's own business; anything higher has to be a place to stand.
        const from = Number.isFinite(character._reactorGround) ? character._reactorGround : height;
        if (ahead <= from + limit) return false;
        const levels = this.levelsAt($dataMap, x2, y2);
        for (let i = 0; i < levels.length; i++) if (Math.abs(levels[i].top - ahead) < 1e-3) return levels[i].narrow;
        return false;
    };
    /** How far a jumper's head may pass into what hangs over a cell it moves into, in tiles. */
    ReactorPhysics.HEAD_GRAZE = 0.5;

    //-------------------------------------------------------------------------
    // Edges: what a body can do between two cells
    //
    // One answer for exploration, Action and Tactical. From a cell at a height
    // toward a neighbour the step is walked (the terrain's own rule), hopped
    // (a rise within a jump), mantled (higher, within reach of raised hands:
    // the edge is grabbed and the body pulled up), climbed by a ladder,
    // dropped, or blocked. It reads the map's data only: the callers add their
    // own tile passability and who stands where.

    /** Tiles a standing body needs over its feet (the bundled characters stand three tall). */
    ReactorPhysics.BODY_HEIGHT = 3;
    /** Frames to walk one tile at the usual speed. */
    ReactorPhysics.WALK_FRAMES = 16;
    /** A mantle: frames to rise a tile, the fewest and the most a pull takes, and how far the body leans to the wall. */
    ReactorPhysics.MANTLE_FRAMES_PER_TILE = 8;
    ReactorPhysics.MANTLE_MIN = 14;
    ReactorPhysics.MANTLE_MAX = 48;
    ReactorPhysics.MANTLE_LEAN = 0.32;
    /** Map directions as cell steps. */
    ReactorPhysics.DIRS = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] };
    /** Tops nobody stands on: too thin, or a point, a ridge or a curve. */
    ReactorPhysics.NO_STAND = { fence: true, glass: true, window: true, ladder: true, door: true, pillar: true,
        prism: true, pyramid: true, spike: true, cone: true, dome: true, sphere: true, capsule: true, fin: true, hull: true, dish: true, ring: true, arch: true };
    /** Tops built to be walked though they slope more than the limit. */
    ReactorPhysics.SLOPED_WALK = { stair: true, ramp: true, wedge: true };

    /** The narrowest top anybody stands on, in tiles: a foot's length. A post, a rail, a gravestone's edge and a lamp's head are narrower. */
    ReactorPhysics.STAND_WIDTH = 0.5;

    const world = () => (typeof Reactor3D !== "undefined" ? Reactor3D : null);

    /**
     * Whether a piece's top is wide enough to stand on. Asked of the shapes
     * that stand upright; a cell piece, a rock's column and a slab laid at a
     * tilt (an eave) answer by their kind.
     */
    ReactorPhysics.wideEnough = function(piece) {
        const R = world();
        if (!piece || !R || !R.isShapeKind || !R.isShapeKind(piece.kind) || piece.kind === "rock" || R.shapeTurned(piece)) return true;
        const size = R.shapeSize(piece);
        return Math.min(size[0], size[2]) >= this.STAND_WIDTH;
    };

    const edgeCache = new WeakMap();
    const NO_LEVELS = Object.freeze([]);
    const cacheOf = function(mapData) {
        const side = mapData.reactor3d || null;
        const pieces = side ? side.pieces : null, terrain = side ? side.terrain : null, water = side ? side.water : null;
        let cache = edgeCache.get(mapData);
        if (!cache || cache.pieces !== pieces || cache.terrain !== terrain || cache.water !== water || cache.data !== mapData.data) {
            cache = { pieces, terrain, water, data: mapData.data, cells: new Map() };
            edgeCache.set(mapData, cache);
        }
        return cache;
    };

    /** Forget what was read of a map (the editor, after an edit made in place). */
    ReactorPhysics.forgetEdges = function(mapData) {
        if (mapData) edgeCache.delete(mapData);
    };

    /**
     * The places to stand on a cell, from the ground up: `top` (world height at
     * the cell's middle), `ceiling` (the foot of what hangs over it, Infinity
     * under the sky), `slope` (rise per tile across the cell), `kind` (the piece
     * on top, or "ground"), `level` (no steeper than a walk), `roof` (a
     * roof's slope, no steeper than a roof is walked), `narrow` (a top of a
     * kind nobody stands on, or less than `STAND_WIDTH` across) and `stand`
     * (a body can stop there: not narrow, and no steeper than it is walked).
     * Kept per map until its pieces, terrain or water change.
     */
    ReactorPhysics.levelsAt = function(mapData, x, y) {
        const R = world();
        if (!R || !mapData || !(x >= 0 && y >= 0 && x < mapData.width && y < mapData.height)) return NO_LEVELS;
        const cache = cacheOf(mapData), key = y * 65536 + x;
        const known = cache.cells.get(key);
        if (known) return known;
        const cx = x + 0.5, cy = y + 0.5, limit = R.TERRAIN_SLOPE_LIMIT;
        const lowest = R.groundHeightAt(mapData, cx, cy);
        const stack = R.piecesAt ? R.piecesAt(mapData, x, y) : null;
        const base = stack && R.pieceBaseAt ? R.pieceBaseAt(mapData, x, y) : lowest;
        const feet = [], heads = [], kinds = [], shapes = [];
        let moving = false;
        if (stack) for (const piece of stack) {
            // A ladder is climbed, never stood on, and is no roof over a climber.
            if (piece.kind === "ladder") continue;
            // A door's top follows whether it is shut: read every time.
            if (piece.kind === "door") moving = true;
            let foot = piece.z;
            if (R.isShapeKind && R.isShapeKind(piece.kind) && !Number.isFinite(piece.rockTop) && Array.isArray(piece.anchor)) foot += R.pieceBaseAt(mapData, piece.anchor[0], piece.anchor[1]) - base;
            feet.push(base + foot); kinds.push(piece.kind); shapes.push(piece);
            // Where its own top stands over the middle of the cell.
            heads.push(base + foot - piece.z + (R.pieceTop ? R.pieceTop(piece, 0.5, 0.5) : piece.z));
        }
        const tops = [lowest];
        for (const foot of feet) {
            const top = R.groundHeightAt(mapData, cx, cy, foot);
            if (!tops.some(known => Math.abs(known - top) < 1e-3)) tops.push(top);
        }
        tops.sort((a, b) => a - b);
        const levels = tops.map(top => {
            let ceiling = Infinity, kind = "ground", under = -Infinity, shape = null, exact = false;
            for (let i = 0; i < feet.length; i++) {
                if (feet[i] > top + 1e-4) { ceiling = Math.min(ceiling, feet[i]); continue; }
                // The piece on top is the one whose own top this is (a fence on a paving slab, a post through a deck:
                // both start at the same height); of several, one nobody stands on decides. Where none ends exactly
                // here (a top read on a slope), the highest piece under it.
                const on = Math.abs(heads[i] - top) < 1e-3;
                if (on ? (!exact || this.NO_STAND[kinds[i]] || !this.wideEnough(shapes[i])) : (!exact && feet[i] >= under)) { under = feet[i]; kind = kinds[i]; shape = shapes[i]; exact = exact || on; }
            }
            const east = R.groundHeightAt(mapData, x + 0.99, cy, top), west = R.groundHeightAt(mapData, x + 0.01, cy, top);
            const south = R.groundHeightAt(mapData, cx, y + 0.99, top), north = R.groundHeightAt(mapData, cx, y + 0.01, top);
            const slope = Math.max(Math.abs(east - west), Math.abs(south - north)) / 0.98;
            const level = slope <= limit + 1e-6;
            // A roof's slope (a ramp, a slab laid at a tilt) is stood on up to a roof's pitch; steeper is not.
            const roof = !level && slope <= (R.ROOF_SLOPE_LIMIT || limit) + 1e-6 && !!(R.roofSlopeAt && R.roofSlopeAt(mapData, x, y, top));
            // A rail, a post, a point: nobody stands on it, lands on it or drops onto it.
            const narrow = !!this.NO_STAND[kind] || !this.wideEnough(shape);
            return { top, ceiling, slope, kind, level, roof, narrow, stand: !narrow && (level || roof || !!this.SLOPED_WALK[kind]) };
        });
        levels.feet = feet;
        if (!moving) cache.cells.set(key, levels);
        return levels;
    };

    /** The foot of the lowest thing over a height on a cell: Infinity under the sky. */
    ReactorPhysics.ceilingAbove = function(mapData, x, y, height) {
        const feet = this.levelsAt(mapData, x, y).feet;
        let ceiling = Infinity;
        if (feet) for (const foot of feet) if (foot > height + 1e-4 && foot < ceiling) ceiling = foot;
        return ceiling;
    };

    /**
     * Where a body can be put on a cell: the height of its place to stand
     * nearest `near` (the lowest when `near` is not given), or null when the
     * cell has none. A place to stand is a level of `levelsAt` that is
     * `stand` (wide enough, no fence, post, spire or lamp's top), with a
     * body's room over it, out of a bush that blocks, and not under water
     * deeper than a wade. `options`: `within` (how far from `near` it may be,
     * in tiles), `body` (the room needed, `BODY_HEIGHT` by default), `water`
     * ("wade" by default; "swim" also takes water the map's swimmers swim
     * in; "any" does not ask). The map's data only: tile passability and who
     * stands there are the caller's.
     */
    ReactorPhysics.standingAt = function(mapData, x, y, near, options) {
        const R = world();
        if (!R || !mapData) return null;
        const o = options || {}, body = Number.isFinite(o.body) ? o.body : this.BODY_HEIGHT;
        if (R.bushBlocksCell && mapData.reactor3d && mapData.reactor3d.foliage && R.bushBlocksCell(mapData, x, y)) return null;
        const wet = o.water !== "any" && R.hasWater && R.hasWater(mapData) && R.waterDepthAt;
        const levels = this.levelsAt(mapData, x, y);
        let best = null;
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            if (!level.stand || level.ceiling - level.top < body - 1e-6) continue;
            if (Number.isFinite(near) && Number.isFinite(o.within) && Math.abs(level.top - near) > o.within + 1e-6) continue;
            if (wet) {
                const depth = R.waterDepthAt(mapData, x + 0.5, y + 0.5, level.top);
                if (depth > R.WATER_WADE && !(o.water === "swim" && this.settings().swim)) continue;
            }
            if (best === null || (Number.isFinite(near) && Math.abs(level.top - near) < Math.abs(best - near))) best = level.top;
        }
        return best;
    };

    /** Whether a body can stand on a cell at about a height: `standingAt` answered yes or no. */
    ReactorPhysics.canStandAt = function(mapData, x, y, near, options) {
        return this.standingAt(mapData, x, y, near, options) !== null;
    };

    /**
     * Whether a diagonal step is stopped by what stands at the corner it
     * passes over: the point where its two cells and the two beside them
     * meet. A body is as wide as its cell, so part of it crosses each of the
     * four; ground there more than a step over the walker, in any of them (a
     * wall's corner, a post, a crate, a rock, a spike of the ground), is in
     * its way. The two cells the step passes between have to be open to walk
     * as well, which is the caller's to ask (`canPassDiagonally`).
     */
    ReactorPhysics.cornerBlocks = function(character, x, y, horz, vert) {
        const R = world();
        if (!R || typeof $dataMap === "undefined" || !$dataMap || !R.isMap3D || !R.isMap3D($dataMap)) return false;
        const cx = horz === 6 ? x + 1 : x, cy = vert === 2 ? y + 1 : y, inset = this.POINT_INSET;
        const flying = this.isAirborne(character);
        const from = flying && Number.isFinite(character._reactorAlt) ? character._reactorAlt
            : Number.isFinite(character._reactorGround) ? character._reactorGround : R.groundHeightAt($dataMap, x + 0.5, y + 0.5);
        const limit = R.TERRAIN_SLOPE_LIMIT + 1e-6;
        // South-east of the point is the point itself; the other three are a hair inside their cells.
        return R.groundHeightAt($dataMap, cx, cy, from) - from > limit
            || R.groundHeightAt($dataMap, cx - inset, cy, from) - from > limit
            || R.groundHeightAt($dataMap, cx, cy - inset, from) - from > limit
            || R.groundHeightAt($dataMap, cx - inset, cy - inset, from) - from > limit;
    };

    /** Whether a character's diagonal steps answer to the corner they pass: on a 3D map, for anything a wall stops. */
    ReactorPhysics.squareCorners = function(character) {
        const R = world();
        return !!R && typeof $dataMap !== "undefined" && !!$dataMap && !!R.isMap3D && R.isMap3D($dataMap)
            && !(character.isThrough && character.isThrough()) && !(character.isDebugThrough && character.isDebugThrough());
    };

    /**
     * The limits an edge is judged by: the project's and the map's physics,
     * with `overrides` over them (`jump` on or off, `jumpHeight`, `hop` the
     * highest rise hopped, `reach` the highest mantled, `mantle`,
     * `mantleReach`, `body`, the fall rule, `climb` the highest edge a wall
     * is climbed to without a ladder, 0 for none). A Tactical unit passes its
     * own `hop`, `reach` and `climb`.
     */
    ReactorPhysics.edgeRules = function(overrides) {
        const R = world(), settings = this.settings(), o = overrides || {};
        const limit = R ? R.TERRAIN_SLOPE_LIMIT : 0.75;
        const jump = o.jump !== undefined ? !!o.jump : this.jumpAllowed();
        const jumpHeight = Number.isFinite(o.jumpHeight) ? o.jumpHeight : settings.jumpHeight;
        const mantle = o.mantle !== undefined ? !!o.mantle : settings.mantle;
        const mantleReach = Number.isFinite(o.mantleReach) ? o.mantleReach : settings.mantleReach;
        // A jump carries a body onto anything a step over its top (see airBlocks).
        const hop = Number.isFinite(o.hop) ? o.hop : (jump && jumpHeight > 0 ? jumpHeight + limit : 0);
        const reach = Number.isFinite(o.reach) ? o.reach : (jump && mantle && mantleReach > 0 ? jumpHeight + mantleReach : 0);
        return {
            _rules: true, limit, jump, jumpHeight, hop, reach, mantle,
            climb: Number.isFinite(o.climb) && o.climb > 0 ? o.climb : 0,
            body: Number.isFinite(o.body) ? o.body : this.BODY_HEIGHT,
            gravity: this.gravityPerFrame(settings),
            fallDamage: o.fallDamage !== undefined ? !!o.fallDamage : settings.fallDamage,
            fallFrom: Number.isFinite(o.fallFrom) ? o.fallFrom : settings.fallFrom,
            fallPercent: Number.isFinite(o.fallPercent) ? o.fallPercent : settings.fallPercent,
            swim: o.swim !== undefined ? !!o.swim : settings.swim,
            swimDepth: settings.swimDepth
        };
    };

    /** Frames of the pull's end that the step onto the top shares: a quarter of it, 4 to 8. */
    ReactorPhysics.mantleOverlap = function(pull) {
        return Math.max(0, Math.min(pull - 1, 8, Math.max(4, Math.round(pull / 4))));
    };

    /** Frames a mantle's pull takes for a rise. */
    ReactorPhysics.mantleFrames = function(rise) {
        return Math.max(this.MANTLE_MIN, Math.min(this.MANTLE_MAX, Math.round(6 + Math.max(0, rise) * this.MANTLE_FRAMES_PER_TILE)));
    };

    const KIND_ORDER = { walk: 0, ladder: 1, hop: 2, mantle: 3, climb: 4, drop: 5, blocked: 6 };
    /** A wall climbed without a ladder: frames per tile of rise (half a ladder's speed). */
    ReactorPhysics.CLIMB_FRAMES_PER_TILE = 1 / ReactorPhysics.LADDER_SPEED;

    /**
     * Every way a body at `height` on cell (x, y) can go toward `d` (2, 4, 6,
     * 8), best first: one entry for each place to stand on the neighbour that
     * it can reach, or a single `blocked` entry saying why not. An entry is
     * `{ kind, x, y, d, from, to, rise, frames, cost }`: `kind` is "walk",
     * "ladder", "hop", "mantle", "climb" (a wall too high to mantle, within
     * `rules.climb`), "drop" or "blocked"; `x`, `y` the cell it
     * ends on; `to` the height it ends at and `rise` the height gained
     * (negative down); `frames` the time it takes and `cost` the same in
     * tiles walked. A drop adds `fell`, `hurts` and `harm` (the share of max
     * HP the fall rule takes) and `water` when it ends in deep water; a
     * blocked entry adds `reason`: "offmap", "edge" (a ridge, a stair's
     * side, deep water, a bush), "steep", "thin", "headroom" (no room to
     * stand on top), "overhead" (something over the climber), "high".
     * `rules` are `edgeRules()` or overrides for them.
     */
    ReactorPhysics.edges = function(mapData, x, y, d, height, rules) {
        const R = world(), step = this.DIRS[d];
        if (!R || !mapData || !step) return [{ kind: "blocked", reason: "offmap", x, y, d, from: height, to: height, rise: 0, frames: 0, cost: 0 }];
        rules = rules && rules._rules ? rules : this.edgeRules(rules);
        const x2 = x + step[0], y2 = y + step[1], limit = rules.limit, walkFrames = this.WALK_FRAMES;
        const here = this.levelsAt(mapData, x, y);
        const from = Number.isFinite(height) ? height : (here.length ? here[0].top : 0);
        const entry = (kind, to, frames, more) => Object.assign({ kind, x: kind === "blocked" ? x : x2, y: kind === "blocked" ? y : y2, d, from, to, rise: to - from,
            frames: Math.round(frames), cost: Math.max(kind === "blocked" ? 0 : 1, Math.round(frames / walkFrames * 2) / 2) }, more);
        if (!(x2 >= 0 && y2 >= 0 && x2 < mapData.width && y2 < mapData.height)) return [entry("blocked", from, 0, { reason: "offmap" })];
        const pieces = R.hasPieces && R.hasPieces(mapData);
        const ladderHere = pieces && R.ladderAt ? R.ladderAt(mapData, x, y) : null;
        const ladderThere = pieces && R.ladderAt ? R.ladderAt(mapData, x2, y2) : null;
        const levels = this.levelsAt(mapData, x2, y2);
        const out = [], taken = [];
        const took = top => taken.some(known => Math.abs(known - top) < 1e-3);
        // On foot: the terrain's own rule (slopes, stairs, the water, a ladder's top).
        if (!R.terrainBlocks(mapData, x, y, x2, y2, from)) {
            const ground = R.groundHeightAt(mapData, x2 + 0.5, y2 + 0.5, from);
            if (ladderThere && Math.abs(from - ladderThere.top) <= limit && ground < ladderThere.top - limit) {
                // Off a ledge onto the top of a ladder, and down it.
                out.push(entry("ladder", ladderThere.bottom, walkFrames + (from - ladderThere.bottom) / this.LADDER_SPEED, { ladder: true }));
                taken.push(ladderThere.bottom);
            } else {
                out.push(entry("walk", ground, walkFrames));
                taken.push(ground);
            }
        }
        // Up the ladder held on this cell, onto each floor it passes.
        if (ladderHere && d === ladderHere.dir && from < ladderHere.top - 0.01 && from >= ladderHere.bottom - limit) {
            for (const level of levels) {
                if (took(level.top) || level.top <= from + limit || level.top > ladderHere.top + limit) continue;
                const hold = Math.max(ladderHere.bottom + 0.03, Math.min(ladderHere.top, level.top));
                if (R.terrainBlocks(mapData, x, y, x2, y2, hold)) continue;
                if (Math.abs(R.groundHeightAt(mapData, x2 + 0.5, y2 + 0.5, hold) - level.top) > 1e-3) continue;
                out.push(entry("ladder", level.top, walkFrames + (hold - from) / this.LADDER_SPEED, { ladder: true }));
                taken.push(level.top);
            }
        }
        const ceilingHere = this.ceilingAbove(mapData, x, y, from);
        let refusal = null;
        const refuse = (reason, level) => { if (!refusal || Math.abs(level.top - from) < Math.abs(refusal.to - from)) refusal = { reason, to: level.top }; };
        for (const level of levels) {
            if (took(level.top)) continue;
            const rise = level.top - from;
            if (Math.abs(rise) <= limit) { refuse("edge", level); continue; }
            if (rise > 0) {
                // The hands take the edge nearest the climber: a roof's eave is lower than the cell's middle.
                const lip = level.slope > 0.05 ? R.groundHeightAt(mapData, x2 + 0.5 - step[0] * 0.49, y2 + 0.5 - step[1] * 0.49, level.top) : level.top;
                const high = rise > rules.hop && lip - from > rules.reach;
                // Out of reach of raised hands: a wall within the climb is climbed hand over hand.
                const climbs = high && rules.climb > 0 && lip - from <= rules.climb + 1e-6;
                if (high && !climbs) { refuse("high", level); continue; }
                if (!level.stand) { refuse(level.level ? "thin" : "steep", level); continue; }
                if (level.ceiling - level.top < rules.body - 1e-6) { refuse("headroom", level); continue; }
                // The body rises past the edge on its own side before it goes over.
                if (ceilingHere < level.top + rules.body / 2) { refuse("overhead", level); continue; }
                if (rise <= rules.hop + 1e-6) {
                    out.push(entry("hop", level.top, walkFrames + Math.sqrt(2 * rise / rules.gravity)));
                } else if (!level.level && !level.roof) {
                    // A mantle ends standing: nobody pulls up onto a slope steeper than a roof is walked.
                    refuse("steep", level);
                } else if (climbs) {
                    out.push(entry("climb", level.top, walkFrames + rise * this.CLIMB_FRAMES_PER_TILE));
                } else {
                    const pull = this.mantleFrames(rise);
                    out.push(entry("mantle", level.top, pull + walkFrames - this.mantleOverlap(pull)));
                }
                continue;
            }
            // Down: not onto a rail or a post, and the column over the landing open for the whole body from where
            // it leaves (a slab between the two is a floor it would pass through).
            if (level.narrow || level.ceiling < from + rules.body - 1e-6) continue;
            const fell = -rise;
            const depth = R.hasWater && R.hasWater(mapData) && R.waterDepthAt ? R.waterDepthAt(mapData, x2 + 0.5, y2 + 0.5, level.top) : 0;
            const deep = depth > (rules.swim ? rules.swimDepth : R.WATER_WADE);
            if (deep && !rules.swim) { refuse("edge", level); continue; }
            const landed = deep ? Math.max(0, fell - depth) : fell;
            const hurts = !deep && rules.fallDamage && fell > rules.fallFrom;
            out.push(entry("drop", level.top, walkFrames + Math.sqrt(2 * landed / rules.gravity), {
                fell, hurts, harm: hurts ? Math.min(1, (fell - rules.fallFrom) * rules.fallPercent / 100) : 0, water: deep }));
        }
        if (!out.length) return [entry("blocked", refusal ? refusal.to : from, 0, { reason: refusal ? refusal.reason : "edge" })];
        return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Math.abs(a.rise) - Math.abs(b.rise));
    };

    /** The one thing a body pressing toward `d` does: the first of `edges`. */
    ReactorPhysics.edge = function(mapData, x, y, d, height, rules) {
        return this.edges(mapData, x, y, d, height, rules)[0];
    };

    //-------------------------------------------------------------------------
    // Mantling
    //
    // A character against a ledge too high to hop but within reach takes hold
    // of its edge and pulls up: it rises beside the wall (no gravity, no
    // input), then steps over onto the top. The state is plain data on the
    // character (`_reactorMantle`), so a save mid-climb resumes.

    /** Whether ledges are mantled here: the project's switch, and jumping allowed on this map. */
    ReactorPhysics.mantleAllowed = function() {
        const settings = this.settings();
        return settings.mantle && settings.mantleReach > 0 && this.jumpAllowed();
    };

    /** Whether a character is pulling itself up a ledge. */
    ReactorPhysics.isMantling = function(character) {
        return !!(character && character._reactorMantle);
    };

    /** Whether the cell a mantle ends on is taken by somebody solid. */
    ReactorPhysics.mantleTopTaken = function(character, x, y) {
        if (character.isThrough && character.isThrough()) return false;
        return !!(character.isCollidedWithCharacters && character.isCollidedWithCharacters(x, y));
    };

    /**
     * Take hold of the ledge toward `d`, if there is one within reach from
     * where the character is (on the ground: a jump and raised hands; in the
     * air or the water: raised hands). `hops` also takes a rise a jump would
     * make (a follower going up after its leader), `highest` leaves alone
     * anything that ends above that height. Returns whether it took hold.
     */
    ReactorPhysics.tryMantle = function(character, d, hops, highest) {
        const R = world();
        if (!R || !character || character._reactorMantle || character._reactorRagdoll || character._reactorClimb || !this.DIRS[d]) return false;
        if (typeof $dataMap === "undefined" || !$dataMap || !R.isMap3D || !R.isMap3D($dataMap) || !this.mantleAllowed()) return false;
        if (character.isMoving && character.isMoving()) return false;
        if ((character._reactorDive || 0) > 0.05) return false;
        const settings = this.settings();
        const grounded = !this.isAirborne(character) && !character._reactorSwim && !character._reactorOnLadder;
        // Falling fast, nobody catches an edge.
        if (!grounded && (Number(character._reactorVz) || 0) < -0.12) return false;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        // In the air the jump is spent: what is left is the reach of the hands. What the rest of
        // the rise will carry the body onto anyway is left to the jump.
        const rising = Math.max(0, Number(character._reactorVz) || 0);
        // In an Action or First Person battle a wall out of reach is climbed, as far as the project's climb height.
        const climb = grounded && this.battleClimbs(settings) ? settings.climbHeight : 0;
        const rules = this.edgeRules(grounded ? (climb ? { climb } : null) : { jump: true, jumpHeight: 0,
            hop: R.TERRAIN_SLOPE_LIMIT + rising * rising / (2 * this.gravityPerFrame(settings)), reach: settings.mantleReach });
        let found = null;
        for (const option of this.edges($dataMap, character.x, character.y, d, alt, rules)) {
            if (Number.isFinite(highest) && option.to > highest) continue;
            // From the ground, a hop the jump would only just make (its top reached on one frame) is pulled up instead.
            const tight = grounded && option.kind === "hop" && option.rise > rules.hop - this.HOP_MARGIN;
            if (option.kind === "mantle" || option.kind === "climb" || ((hops || tight) && option.kind === "hop")) { found = option; break; }
        }
        if (!found) return false;
        if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.isPassable && character.reverseDir
            && !($gameMap.isPassable(character.x, character.y, d) && $gameMap.isPassable(found.x, found.y, character.reverseDir(d)))) return false;
        if (this.mantleTopTaken(character, found.x, found.y)) return false;
        this.startMantle(character, d, found.x, found.y, alt, found.to, found.kind === "climb" ? found.rise * this.CLIMB_FRAMES_PER_TILE : undefined);
        return true;
    };

    /** Whether walls are climbed here: a battle on the map other than a Tactical one (its grid climbs by itself), and the project's switch. */
    ReactorPhysics.battleClimbs = function(settings = this.settings()) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        return !!settings.battleClimb && !!fight && !!fight.isActive && fight.isActive() && !(fight.isTactical && fight.isTactical());
    };

    /** How far under the highest rise a jump carries a body onto a hop is left to the jump, in tiles. */
    ReactorPhysics.HOP_MARGIN = 0.1;
    /** Frames a walker pushes against a low ledge before it climbs it without Jump: a quarter of a second. */
    ReactorPhysics.STEP_UP_FRAMES = 15;

    /** How high a ledge is climbed by walking into it, in tiles: the project's setting, never over a hop (`stepUpCap`), 0 where the project switches that off. */
    ReactorPhysics.stepUpReach = function() {
        const settings = this.settings();
        return settings.stepUp && settings.stepUpReach > 0 ? settings.stepUpReach : 0;
    };

    /** How many places a walk has to go on to from a top before the top counts as ground and not as a thing standing on it. */
    ReactorPhysics.OPEN_GROUND_PLACES = 24;
    // Scratch for `openGround`: the places walked to, as cells and heights.
    const OPEN = { x: new Int32Array(24), y: new Int32Array(24), h: new Float64Array(24) };

    /**
     * Whether a place to stand is ground the walk goes on over, and not the
     * top of a thing that stands on it (a counter, a table, a crate, a
     * boulder): walking on from it, without a hop or a drop, comes to the
     * ground itself or to `OPEN_GROUND_PLACES` places. A pond's rim the
     * square steps onto is ground; a bar's top, from which every way on is a
     * drop, is not. The walk is read from the cells' kept levels (a place
     * within a step of this one on the next cell), and from the terrain's
     * own rule on and beside a stair: its run is climbed a whole tile a
     * cell, and its side is a wall.
     */
    ReactorPhysics.openGround = function(mapData, x, y, top) {
        const R = world();
        if (!R || !mapData) return false;
        const need = Math.max(1, this.OPEN_GROUND_PLACES | 0), limit = R.TERRAIN_SLOPE_LIMIT + 1e-6;
        const stairs = !!(R.stairPieceAt && R.hasPieces && R.hasPieces(mapData));
        if (OPEN.x.length < need) { OPEN.x = new Int32Array(need); OPEN.y = new Int32Array(need); OPEN.h = new Float64Array(need); }
        const xs = OPEN.x, ys = OPEN.y, hs = OPEN.h;
        xs[0] = x; ys[0] = y; hs[0] = top;
        for (let head = 0, count = 1; head < count; head++) {
            const cx = xs[head], cy = ys[head], ch = hs[head];
            const here = this.levelsAt(mapData, cx, cy);
            for (let i = 0; i < here.length; i++) if (here[i].kind === "ground" && Math.abs(here[i].top - ch) < 1e-3) return true;
            const stairHere = stairs && !!R.stairPieceAt(mapData, cx, cy);
            for (let d = 2; d <= 8; d += 2) {
                const step = this.DIRS[d], nx = cx + step[0], ny = cy + step[1];
                let nh = 0;
                if (stairHere || (stairs && R.stairPieceAt(mapData, nx, ny))) {
                    if (!(nx >= 0 && ny >= 0 && nx < mapData.width && ny < mapData.height) || R.terrainBlocks(mapData, cx, cy, nx, ny, ch)) continue;
                    nh = R.groundHeightAt(mapData, nx + 0.5, ny + 0.5, ch);
                } else {
                    const levels = this.levelsAt(mapData, nx, ny);
                    let off = Infinity;
                    for (let i = 0; i < levels.length; i++) {
                        const away = Math.abs(levels[i].top - ch);
                        if (away <= limit && away < off && !levels[i].narrow) { off = away; nh = levels[i].top; }
                    }
                    if (off === Infinity) continue;
                }
                let known = false;
                for (let k = 0; k < count && !known; k++) known = xs[k] === nx && ys[k] === ny && Math.abs(hs[k] - nh) < 0.5;
                if (known) continue;
                if (count + 1 >= need) return true;
                xs[count] = nx; ys[count] = ny; hs[count] = nh; count++;
            }
        }
        return false;
    };

    /**
     * Of the ways `edges` gave, the low ledge a walker climbs by walking
     * into it: the first hop or mantle, when its top is open ground
     * (`openGround`) and no stair (a stair is climbed along its run: its
     * side is a wall to a walker). `highest` leaves alone anything that ends
     * above that height. Null where there is none.
     */
    ReactorPhysics.lowLedge = function(mapData, options, highest) {
        const R = world();
        for (const option of options) {
            if (Number.isFinite(highest) && option.to > highest) continue;
            if (option.kind !== "hop" && option.kind !== "mantle") continue;
            if (R.stairPieceAt && R.hasPieces && R.hasPieces(mapData) && R.stairPieceAt(mapData, option.x, option.y)) return null;
            return this.openGround(mapData, option.x, option.y, option.to) ? option : null;
        }
        return null;
    };

    /** Whether the place to stand at `top` on a cell is the ground itself, the terrain or a rock, and nothing built. */
    ReactorPhysics.isGroundTop = function(mapData, x, y, top) {
        const levels = this.levelsAt(mapData, x, y);
        for (let i = 0; i < levels.length; i++) if (Math.abs(levels[i].top - top) < 1e-3) return levels[i].kind === "ground" || levels[i].kind === "rock";
        return false;
    };

    /**
     * Climb the low ledge toward `d` that a walker stands against: a top
     * that rises no more than the step-up reach (the project's, never over
     * a hop: `stepUpCap`) over where it stands, and is ground the walk goes
     * on over (a pond's rim from inside, a bank, a terrace), taken without
     * Jump and whether or not jumping is on. A bank of the ground or of a
     * rock is taken by its edge: the edge within the reach, its top no more
     * than a hop up. The top of a thing standing on the floor (a counter, a
     * table, a crate) and anything higher (a roof whose eave is within the
     * reach, a wall) are left to Jump. Or step down a ledge of the ground
     * as low, where a push the other way climbs back: what a push leaves, a
     * push returns to. `highest` leaves alone anything that ends above that
     * height. Returns whether it took hold.
     */
    ReactorPhysics.stepUp = function(character, d, highest) {
        const R = world(), reach = this.stepUpReach();
        if (!(reach > 0) || !R || !character || character._reactorMantle || character._reactorRagdoll || character._reactorClimb || !this.DIRS[d]) return false;
        if (typeof $dataMap === "undefined" || !$dataMap || !R.isMap3D || !R.isMap3D($dataMap)) return false;
        if ((character.isMoving && character.isMoving()) || this.isAirborne(character) || character._reactorSwim || character._reactorOnLadder || character._reactorStepDown) return false;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        const rules = this.edgeRules({ jump: true, mantle: true, hop: reach + 1e-3, reach: reach + 1e-3 });
        const options = this.edges($dataMap, character.x, character.y, d, alt, rules);
        let found = this.lowLedge($dataMap, options, highest);
        // A top over the reach was offered for its edge, which is within it. On the ground or a rock that is a bank,
        // climbed where its top is no more than a hop up; on anything built it is a roof's eave, and a mantle.
        if (found && found.to > alt + reach + 1e-3
            && !(found.to <= alt + this.stepUpCap(this.settings().jumpHeight) + 1e-3 && this.isGroundTop($dataMap, found.x, found.y, found.to))) found = null;
        if (found) {
            if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.isPassable && character.reverseDir
                && !($gameMap.isPassable(character.x, character.y, d) && $gameMap.isPassable(found.x, found.y, character.reverseDir(d)))) return false;
            if (this.mantleTopTaken(character, found.x, found.y)) return false;
            this.startMantle(character, d, found.x, found.y, alt, found.to);
            return true;
        }
        // Down: a party member, off a ledge of the ground itself (a walk alone leaves only what is built).
        if (character._reactorStepOff || !character.moveStraight || !character.isMovementSucceeded || !this.isPartyCharacter(character)) return false;
        let down = null;
        for (const option of options) if (option.kind === "drop" && option.fell <= reach + 1e-3 && !option.hurts && !option.water) { down = option; break; }
        if (!down) return false;
        // Only where the way back is there: on foot, or the same ledge climbed by a push from below.
        const ways = this.edges($dataMap, down.x, down.y, 10 - d, down.to, rules);
        const back = ways[0].kind === "walk" ? ways[0] : this.lowLedge($dataMap, ways);
        if (!back || Math.abs(back.to - alt) > 0.05) return false;
        character._reactorStepOff = d;
        character.moveStraight(d);
        character._reactorStepOff = 0;
        return character.isMovementSucceeded();
    };

    /**
     * Put a character into the climb from where it stands at height `from`
     * onto cell (x, y) at height `to`, facing `d`: up beside the wall and
     * over when `to` is higher, over the edge and down it when lower (the way
     * down a ladder). `pull` is the frames the rise or the descent takes.
     */
    ReactorPhysics.startMantle = function(character, d, x, y, from, to, pull) {
        const down = to < from;
        // The edge the hands take: a roof's eave is lower than the middle of the cell the body ends on.
        const R = world(), step = this.DIRS[d];
        const lip = !down && R && step && typeof $dataMap !== "undefined" && $dataMap ? R.groundHeightAt($dataMap, x + 0.5 - step[0] * 0.49, y + 0.5 - step[1] * 0.49, to) : to;
        character._reactorMantle = { d, x, y, from, to, t: 0, pull: Number.isFinite(pull) ? Math.max(1, Math.round(pull)) : this.mantleFrames(Math.abs(to - from)),
            over: false, lean: 0, down, lip: Number.isFinite(lip) ? Math.min(to, lip) : to };
        character._reactorVz = 0; character._reactorLeap = false; character._reactorOnLadder = false; character._reactorSwim = false;
        character._reactorPeak = undefined; character._reactorAlt = from; character._reactorStepUp = undefined; character._reactorJumped = false;
        if (character.setDirection) character.setDirection(down && character.reverseDir ? character.reverseDir(d) : d);
        if (down) {
            // Over the edge first, facing the wall it will come down.
            if (character._followers && character._followers.updateMove) character._followers.updateMove();
            character._x = x; character._y = y;
        }
    };

    /**
     * How many steps ahead a ledge is looked for: two at a walk, and at a run as many as the same
     * time covers, so a Jump pressed as early on the way to an eave takes it at either pace.
     */
    ReactorPhysics.MANTLE_AHEAD_STEPS = 2;
    ReactorPhysics.MANTLE_AHEAD_MAX = 6;
    ReactorPhysics.mantleLookAhead = function(character) {
        const speed = character && character.realMoveSpeed ? Number(character.realMoveSpeed()) : 4;
        if (!Number.isFinite(speed)) return this.MANTLE_AHEAD_STEPS;
        return Math.max(this.MANTLE_AHEAD_STEPS, Math.min(this.MANTLE_AHEAD_MAX, Math.round(this.MANTLE_AHEAD_STEPS * Math.pow(2, speed - 4))));
    };

    /**
     * How many steps on from a cell toward `d` a ledge is there to take: 1
     * from the cell itself (an eave over the way on, as much as a wall in
     * it), 2 from the next cell after a plain step and so on as far as the
     * character's pace looks (`mantleLookAhead`), 0 for none.
     */
    ReactorPhysics.mantleAhead = function(character, x, y, d) {
        const R = world();
        if (!R || !this.DIRS[d] || typeof $dataMap === "undefined" || !$dataMap || !R.isMap3D || !R.isMap3D($dataMap) || !this.mantleAllowed()) return 0;
        if (this.isAirborne(character) || character._reactorSwim || character._reactorOnLadder) return 0;
        let alt = R.groundHeightAt($dataMap, x + 0.5, y + 0.5, Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround);
        for (let steps = 1, reach = this.mantleLookAhead(character); steps <= reach; steps++) {
            const options = this.edges($dataMap, x, y, d, alt);
            if (options.some(option => option.kind === "mantle")) return steps;
            if (options[0].kind !== "walk") return 0;
            x = options[0].x; y = options[0].y; alt = options[0].to;
        }
        return 0;
    };

    /**
     * Whether a walker steps off the edge toward `d`: a party member standing
     * on something built (a roof, a wall top, a crate) whose fall is safe (no
     * deeper than the safe fall, not into deep water). A cliff of the ground
     * itself, and a fall that would hurt, still take a Jump.
     */
    ReactorPhysics.walksOff = function(character, x, y, d) {
        const R = world();
        if (!R || !this.DIRS[d] || !this.isPartyCharacter(character) || typeof $dataMap === "undefined" || !$dataMap || !R.isMap3D || !R.isMap3D($dataMap)) return false;
        if (character._reactorSwim || character._reactorOnLadder || character._reactorMantle) return false;
        const alt = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround;
        if (!Number.isFinite(alt)) return false;
        // On something built, any safe drop; off the ground itself, only the low ledge a push steps down (`stepUp`).
        const built = R.hasPieces($dataMap) && alt - R.pieceBaseAt($dataMap, x, y) >= 0.5;
        const pushed = character._reactorStepOff === d;
        if (!built && !pushed) return false;
        const step = this.DIRS[d], x2 = x + step[0], y2 = y + step[1];
        if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.isPassable && !($gameMap.isPassable(x, y, d) && $gameMap.isPassable(x2, y2, 10 - d))) return false;
        const settings = this.settings();
        const option = this.edge($dataMap, x, y, d, alt);
        return option.kind === "drop" && !option.hurts && !option.water && option.fell <= (built ? settings.fallFrom : this.stepUpReach() + 1e-3);
    };

    /**
     * An event that climbs (`<climb>` in its note): a step of its route that a
     * ledge stops is taken as a hop or a mantle, where one is within reach.
     */
    ReactorPhysics.climbs = function(character) {
        const data = character && character.event ? character.event() : null;
        return !!(data && data.meta && data.meta.climb);
    };

    /** Let go of the ledge: the body is in the air where it was, and gravity has it again. */
    ReactorPhysics.cancelMantle = function(character) {
        const mantle = character && character._reactorMantle;
        if (!mantle) return false;
        character._reactorMantle = null;
        character._reactorVz = 0;
        character._reactorPeak = Number.isFinite(character._reactorAlt) ? character._reactorAlt : undefined;
        return true;
    };

    /** One frame of a mantle: up beside the wall, then over the edge onto the top. */
    ReactorPhysics.updateMantle = function(character) {
        const R = world(), mantle = character._reactorMantle;
        const rx = Number.isFinite(character._realX) ? character._realX : character.x;
        const ry = Number.isFinite(character._realY) ? character._realY : character.y;
        const point = this.groundPoint(character), px = point[0], py = point[1];
        character._reactorStepDown = false;
        let height;
        if (mantle.down) {
            // Down: across onto the cell at the height it left, then down beside the wall.
            const crossing = character.isMoving && character.isMoving();
            if (crossing) { height = mantle.from; mantle.lean = 0; }
            else {
                mantle.t++;
                const k = Math.min(1, mantle.t / Math.max(1, mantle.pull));
                height = mantle.from + (mantle.to - mantle.from) * k;
                mantle.lean = this.MANTLE_LEAN * Math.min(1, (1 - k) * 4);
                if (mantle.t >= mantle.pull) {
                    character._reactorMantle = null;
                    character._reactorGround = mantle.to; character._reactorAlt = mantle.to;
                    character._reactorVz = 0; character._reactorAir = 0; character._reactorPeak = undefined;
                    return;
                }
            }
            const under = R.groundHeightAt($dataMap, px, py, mantle.to);
            character._reactorGround = Math.min(under, height);
            character._reactorAlt = height;
            character._reactorVz = 0;
            character._reactorAir = Math.max(0, height - character._reactorGround);
            return;
        }
        // Quick off the ground, slowing as the arms take the weight.
        const rising = () => {
            const k = Math.min(1, mantle.t / Math.max(1, mantle.pull));
            return mantle.t >= mantle.pull ? mantle.to : mantle.from + (mantle.to - mantle.from) * (1 - (1 - k) * (1 - k));
        };
        if (!mantle.over) {
            // The top was taken while it climbed (someone walked onto it): let go.
            if (this.mantleTopTaken(character, mantle.x, mantle.y)) { this.cancelMantle(character); return; }
            mantle.t++;
            height = rising();
            mantle.lean = this.MANTLE_LEAN * Math.min(1, mantle.t / Math.max(1, mantle.pull) * 2);
            // The knee comes over the edge as the pull ends: the step onto the top begins before the rise is done,
            // so the body does not hang beside a top it has reached.
            if (mantle.t >= mantle.pull - this.mantleOverlap(mantle.pull)) {
                mantle.over = true;
                // The party comes after, as on any step the leader takes.
                if (character._followers && character._followers.updateMove) character._followers.updateMove();
                character._x = mantle.x; character._y = mantle.y;
            }
        } else {
            mantle.t++;
            height = rising();
            const left = Math.abs(character._x - rx) + Math.abs(character._y - ry);
            mantle.lean = this.MANTLE_LEAN * Math.min(1, left);
            if (mantle.t >= mantle.pull && !(character.isMoving && character.isMoving())) {
                character._reactorMantle = null;
                character._reactorGround = mantle.to; character._reactorAlt = mantle.to;
                character._reactorVz = 0; character._reactorAir = 0; character._reactorPeak = undefined;
                return;
            }
        }
        const ground = R.groundHeightAt($dataMap, px, py, mantle.over ? mantle.to : mantle.from);
        character._reactorGround = Math.min(ground, height);
        character._reactorAlt = height;
        character._reactorVz = 0;
        character._reactorAir = Math.max(0, height - character._reactorGround);
    };

    //-------------------------------------------------------------------------
    // Battles on the map
    //
    // The Tactical grid asks the same question through its own seam
    // (`ReactorFight.Grid.edge`, `playStep`, `isStepping`): a unit mantles a
    // ledge within its jump and its reach, climbs a wall hand over hand up to
    // the project's climb height (`battleClimb`, `climbHeight`, `climbCost`),
    // climbs and descends ladders, and drops: as far as the project's
    // `battleFall` lets it, a fall past the safe height costing the fall
    // rule's share of its max HP. A walk and a plain hop stay the grid's.

    /** Move points a mantle and a storey of ladder cost a unit, and the tiles of ladder one extra point climbs. */
    ReactorPhysics.TACTICAL_MANTLE_COST = 2;
    ReactorPhysics.TACTICAL_LADDER_TILES = 2.5;
    /** Move points a drop longer than a unit's own costs. */
    ReactorPhysics.TACTICAL_DROP_COST = 2;
    /**
     * Tiles over its jump a unit pulls itself up: with the usual jump of 1, onto what is no higher than itself (a crate,
     * a counter, a wall its own height). A canopy or a roof's eave takes a ladder, a climb or a higher jump.
     */
    ReactorPhysics.TACTICAL_MANTLE_REACH = 2;
    // Why an edge is blocked for good, whatever a unit's jump: there is nowhere for a body on top.
    const NO_HOP = { thin: true, steep: true, headroom: true, overhead: true };

    /** The limits a Tactical unit of that jump is judged by: it hops its jump, mantles a little over it and climbs walls to the project's height. */
    ReactorPhysics.tacticalRules = function(hop, settings = this.settings()) {
        return this.edgeRules({ jump: hop > 0, jumpHeight: hop, hop, reach: hop > 0 && settings.mantle ? hop + this.TACTICAL_MANTLE_REACH : 0,
            climb: hop > 0 && settings.battleClimb ? settings.climbHeight : 0 });
    };

    /** Move points a climb of `rise` tiles costs: `climbCost` a tile, rounded up, and never less than a mantle. */
    ReactorPhysics.climbCostFor = function(rise, settings = this.settings()) {
        return Math.max(this.TACTICAL_MANTLE_COST, Math.ceil(Math.max(0, rise) * settings.climbCost - 1e-6));
    };

    /**
     * A drop as a Tactical unit of that jump takes it: `{ cost, harm }` (`harm` the share of max HP the fall takes),
     * or null when it is not taken (into deep water, or deeper than `battleFall` allows). A drop within the unit's
     * own (one level further than it climbs) costs a step.
     */
    ReactorPhysics.tacticalDrop = function(option, hop, settings = this.settings()) {
        if (!option || option.kind !== "drop" || option.water) return null;
        const own = option.fell <= hop + 1 + 0.01;
        if (settings.battleFall === "off" && !own && option.fell > settings.fallFrom + 1e-6) return null;
        const harm = settings.battleFall === "hurt" ? this.fallShare(option.fell, settings) : 0;
        return { cost: own ? 1 : this.TACTICAL_DROP_COST, harm, own };
    };

    /**
     * The Tactical grid's edge: `{ kind, cost, height, harm }` for a mantle,
     * a climb, a ladder or a long drop from cell (x, y) at `height` toward `d`
     * by a unit of that `jump`, or null where the grid's own rule (a walk, a
     * hop, a short safe drop) should decide.
     */
    ReactorPhysics.tacticalEdge = function(x, y, d, height, jump) {
        try {
            const R = world();
            if (!R || !R.piecesAt || typeof $dataMap === "undefined" || !$dataMap) return null;
            const settings = this.settings();
            const hop = Math.max(0, Number(jump) || 0);
            const rules = this.tacticalRules(hop, settings);
            const map = typeof $gameMap !== "undefined" ? $gameMap : null;
            for (const option of this.edges($dataMap, x, y, d, height, rules)) {
                // Nowhere a body can be on top (a fence, a post, a spire; no room over it; something over the climber):
                // the grid's own hop, which asks only how high, must not take it.
                if (option.kind === "blocked" && NO_HOP[option.reason]) return { kind: "blocked", cost: 0, height };
                if (option.kind === "walk" || option.kind === "hop" || option.kind === "blocked") return null;
                if (map && map.isPassable && !(map.isPassable(x, y, d) && map.isPassable(option.x, option.y, 10 - d))) return null;
                if (option.kind === "mantle") return { kind: "mantle", cost: this.TACTICAL_MANTLE_COST, height: option.to };
                if (option.kind === "climb") return { kind: "climb", cost: this.climbCostFor(option.rise, settings), height: option.to };
                if (option.kind === "ladder") return { kind: "ladder", cost: 1 + Math.ceil(Math.abs(option.rise) / this.TACTICAL_LADDER_TILES), height: option.to };
                if (option.kind === "drop") {
                    const drop = this.tacticalDrop(option, hop, settings);
                    if (!drop) continue;
                    // A short drop that does not hurt is the grid's.
                    if (drop.own && !(drop.harm > 0)) return null;
                    return { kind: "drop", cost: drop.cost, height: option.to, harm: drop.harm };
                }
            }
        } catch (error) {
            // A map the query cannot read is the grid's own to judge.
        }
        return null;
    };

    /**
     * Every way on for a unit, for a grid that keeps more than one height on a
     * cell (the ground under an eave and the eave over it; a room and the
     * roof over it): `[{ kind, cost, height, harm }]`, a walk and a hop at 1,
     * the rest as `tacticalEdge` costs them, a drop `battleFall` does not
     * allow left out. Empty where nothing can be done.
     */
    ReactorPhysics.tacticalEdges = function(x, y, d, height, jump) {
        const out = [];
        try {
            const R = world();
            if (!R || typeof $dataMap === "undefined" || !$dataMap) return out;
            const settings = this.settings();
            const hop = Math.max(0, Number(jump) || 0);
            const rules = this.tacticalRules(hop, settings);
            for (const option of this.edges($dataMap, x, y, d, height, rules)) {
                if (option.kind === "blocked") continue;
                if (option.kind === "drop") {
                    const drop = this.tacticalDrop(option, hop, settings);
                    if (drop) out.push({ kind: "drop", cost: drop.cost, height: option.to, harm: drop.harm });
                    continue;
                }
                const cost = option.kind === "mantle" ? this.TACTICAL_MANTLE_COST : option.kind === "climb" ? this.climbCostFor(option.rise, settings)
                    : option.kind === "ladder" ? 1 + Math.ceil(Math.abs(option.rise) / this.TACTICAL_LADDER_TILES) : 1;
                out.push({ kind: option.kind, cost, height: option.to });
            }
        } catch (error) {
            // A map the query cannot read has no ways on from here.
        }
        return out;
    };

    /** Play a grid step that is a climb: a mantle up, a wall climbed, a ladder up or down, a grapple. Other kinds are the grid's (false). */
    ReactorPhysics.playStep = function(character, step) {
        const R = world();
        if (!R || !character || !step || character._reactorMantle || character._reactorGrapple || !this.DIRS[step.d]) return false;
        if (step.kind === "grapple") return this.startGrapple(character, step);
        if (step.kind !== "mantle" && step.kind !== "ladder" && step.kind !== "climb") return false;
        const from = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        if (!Number.isFinite(step.height) || Math.abs(step.height - from) < 1e-3) return false;
        const rise = Math.abs(step.height - from);
        const frames = step.kind === "ladder" ? rise / (this.LADDER_SPEED * 2) : step.kind === "climb" ? rise * this.CLIMB_FRAMES_PER_TILE : undefined;
        this.startMantle(character, step.d, step.x, step.y, from, step.height, frames);
        return true;
    };

    //-------------------------------------------------------------------------
    // Grapple: a line from the hand to a roof's edge or a ledge, the pull up
    // to it, and the climb over onto the top (a mantle from where the body
    // hangs). Plain data on the character (`_reactorGrapple`), as a mantle is.

    /** Frames the line flies before the pull; tiles a frame the pull carries the body; how far under the edge it hangs. */
    ReactorPhysics.GRAPPLE_SHOT = 16;
    ReactorPhysics.GRAPPLE_SPEED = 0.22;
    ReactorPhysics.GRAPPLE_HANG = 2.4;
    /** The lowest top worth a grapple, over the feet: anything lower is hopped or mantled. */
    ReactorPhysics.GRAPPLE_LEAST = 2;

    /**
     * Every edge a grapple from cell (x, y) at `from` takes hold of: tops a body
     * stands on (level, or a roof's pitch), no further than `range` tiles
     * (cell middle to cell middle), whose edge toward the climber stands more
     * than `least` and no more than `most` over the feet. The hook is caught
     * on the edge of the top itself, or of an eave or a verge that hangs out
     * past it, with open sky under the hook down to ground well below it,
     * where the body hangs. Each is `{ x, y, d, to, lip, bx, by, hx, hy }`:
     * the top's cell and height, the way the body comes onto it, the edge's
     * height, the cell the body hangs over, and where the hook holds (across
     * the map). The map's data only: who stands where, tiles and the line of
     * sight are the caller's.
     */
    ReactorPhysics.grappleTargets = function(mapData, x, y, from, range, most, least = this.GRAPPLE_LEAST) {
        const R = world(), out = [];
        if (!R || !mapData || !(range > 0) || !(most > 0)) return out;
        const r = Math.floor(range), limit = R.TERRAIN_SLOPE_LIMIT || 0.75;
        const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < mapData.width && cy < mapData.height;
        // Open sky over a cell's ground near `from` up to `top`, the ground well under it: somewhere a body hangs.
        const hangsOver = (cx, cy, top) => {
            if (!inside(cx, cy)) return null;
            const below = R.groundHeightAt(mapData, cx + 0.5, cy + 0.5, from);
            return top - below > 1 + limit && this.ceilingAbove(mapData, cx, cy, below) >= top - 1e-3 ? below : null;
        };
        for (let ty = y - r; ty <= y + r; ty++) {
            for (let tx = x - r; tx <= x + r; tx++) {
                if ((tx === x && ty === y) || !inside(tx, ty)) continue;
                const far = Math.hypot(tx - x, ty - y);
                if (far > range + 1e-6) continue;
                for (const level of this.levelsAt(mapData, tx, ty)) {
                    if (!level.stand || !(level.level || level.roof) || level.ceiling - level.top < this.BODY_HEIGHT - 1e-6) continue;
                    if (level.top - from < least) continue;
                    let best = null;
                    for (const d of [2, 4, 6, 8]) {
                        const step = this.DIRS[d];
                        // The top's own edge over the cell beside it, or an eave or a verge on that cell (no more than
                        // a step and a half under the top) over the cell beyond.
                        for (let out = 1; out <= 2; out++) {
                            const bx = tx - step[0] * out, by = ty - step[1] * out, near = Math.hypot(bx - x, by - y);
                            if (near >= far || !inside(bx, by)) break;
                            // Where the hook holds: the side of the next cell in from where the body hangs.
                            const hx = bx + 0.5 + step[0] * 0.51, hy = by + 0.5 + step[1] * 0.51;
                            const lip = Math.min(level.top + 0.5, R.groundHeightAt(mapData, hx, hy, level.top));
                            if (out === 2) {
                                // Only past an overhang: open air under the cell between, and something over it there.
                                const mid = tx - step[0], mz = ty - step[1], under = R.groundHeightAt(mapData, mid + 0.5, mz + 0.5, from);
                                if (!(lip > level.top - 1.5) || !(level.top - under > 1 + limit) || !(this.ceilingAbove(mapData, mid, mz, under) < level.top)) break;
                            }
                            if (lip - from > most + 1e-6 || lip - from < least) break;
                            if (hangsOver(bx, by, lip) === null) continue;
                            if (!best || near < best.near) best = { x: tx, y: ty, d, to: level.top, lip, bx, by, hx, hy, near };
                            break;
                        }
                    }
                    if (best) { delete best.near; out.push(best); }
                }
            }
        }
        return out;
    };

    /**
     * Begin a grapple step `{ x, y, d, height }` (the top's cell, the way onto it, its height), hanging over `bx`, `by`
     * with the hook at `hx`, `hy` and `lip` where the target gave them (else over the cell beside the top, at its edge).
     * False when there is no edge there.
     */
    ReactorPhysics.startGrapple = function(character, step) {
        const R = world(), dir = this.DIRS[step.d];
        if (!R || !dir || typeof $dataMap === "undefined" || !$dataMap || !Number.isFinite(step.height)) return false;
        const from = Number.isFinite(character._reactorAlt) ? character._reactorAlt : character._reactorGround || 0;
        const bx = Number.isFinite(step.bx) ? step.bx : step.x - dir[0], by = Number.isFinite(step.by) ? step.by : step.y - dir[1];
        const hx = Number.isFinite(step.hx) ? step.hx : bx + 0.5 + dir[0] * 0.51, hy = Number.isFinite(step.hy) ? step.hy : by + 0.5 + dir[1] * 0.51;
        const lip = Number.isFinite(step.lip) ? step.lip : Math.min(step.height, R.groundHeightAt($dataMap, hx, hy, step.height));
        const sx = Number.isFinite(character._realX) ? character._realX : character.x, sy = Number.isFinite(character._realY) ? character._realY : character.y;
        const hang = Math.max(from, lip - this.GRAPPLE_HANG);
        const pull = Math.max(12, Math.round(Math.hypot(bx - sx, by - sy, hang - from) / this.GRAPPLE_SPEED));
        character._reactorGrapple = { x: step.x, y: step.y, d: step.d, bx, by, hx, hy, sx, sy, from, to: step.height, lip, hang, t: 0, shot: this.GRAPPLE_SHOT, pull };
        character._reactorVz = 0; character._reactorLeap = false; character._reactorOnLadder = false; character._reactorSwim = false; character._reactorPeak = undefined;
        if (character.setDirection) character.setDirection(Math.abs(hx - 0.5 - sx) > Math.abs(hy - 0.5 - sy) ? (hx - 0.5 > sx ? 6 : 4) : (hy - 0.5 > sy ? 2 : 8));
        return true;
    };

    /** Whether a character is on a grapple's line: it flies, or the body is pulled. */
    ReactorPhysics.isGrappling = function(character) {
        return !!(character && character._reactorGrapple);
    };

    /** Where a grapple's hook is now, in tiles (`x`, `y` across the map, `z` up), and how much of the line is out (0 to 1); null off one. */
    ReactorPhysics.grappleHook = function(character, out) {
        const g = character && character._reactorGrapple;
        if (!g) return null;
        out = out || {};
        out.x = g.hx; out.y = g.hy; out.z = g.lip;
        out.out = Math.min(1, g.t / Math.max(1, g.shot));
        return out;
    };

    /** One frame of a grapple: the line flies, the body is pulled to hang under the edge, then it climbs over (a mantle). */
    ReactorPhysics.updateGrapple = function(character) {
        const R = world(), g = character._reactorGrapple;
        g.t++;
        let height = g.from;
        if (g.t > g.shot) {
            if (g.t === g.shot + 1) { character._x = g.bx; character._y = g.by; }
            const k = Math.min(1, (g.t - g.shot) / g.pull), e = k * k * (3 - 2 * k);
            character._realX = g.sx + (g.bx - g.sx) * e;
            character._realY = g.sy + (g.by - g.sy) * e;
            height = g.from + (g.hang - g.from) * e + Math.sin(k * Math.PI) * 0.35;
            if (k >= 1) {
                character._reactorGrapple = null;
                character._realX = g.bx; character._realY = g.by;
                this.startMantle(character, g.d, g.x, g.y, g.hang, g.to, this.mantleFrames(g.to - g.hang) + 6);
                return;
            }
        }
        const point = this.groundPoint(character);
        const ground = R ? R.groundHeightAt($dataMap, point[0], point[1], Math.min(height, g.from)) : height;
        character._reactorGround = Math.min(ground, height);
        character._reactorAlt = height;
        character._reactorVz = 0;
        character._reactorAir = Math.max(0, height - character._reactorGround);
    };

    /** Give the Tactical grid its vertical movement, once it exists and nobody else has. */
    ReactorPhysics.installFightSeams = function() {
        const grid = root.ReactorFight && root.ReactorFight.Grid;
        if (!grid) return false;
        if (!grid.edge) grid.edge = (x, y, d, height, jump) => ReactorPhysics.tacticalEdge(x, y, d, height, jump);
        if (!grid.playStep) grid.playStep = (character, step) => ReactorPhysics.playStep(character, step);
        if (!grid.isStepping) grid.isStepping = character => ReactorPhysics.isMantling(character) || ReactorPhysics.isGrappling(character);
        this._fightSeams = true;
        return true;
    };

    if (typeof Game_CharacterBase !== "undefined") {
        const _update = Game_CharacterBase.prototype.update;
        Game_CharacterBase.prototype.update = function() {
            _update.apply(this, arguments);
            ReactorPhysics.update(this);
        };
        // Placed somewhere (a transfer, Set Event Location): on the ground there, not at the
        // height it had where it was, which fell (and hurt) from a roof onto the next map.
        const _locate = Game_CharacterBase.prototype.locate;
        Game_CharacterBase.prototype.locate = function() {
            ReactorPhysics.settle(this);
            return _locate.apply(this, arguments);
        };
    }

    if (typeof Scene_Map !== "undefined") {
        const _updateScene = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            if (!ReactorPhysics._fightSeams) ReactorPhysics.installFightSeams();
            _updateScene.apply(this, arguments);
            ReactorPhysics.updateFatalFall();
        };
        // The stock check would end the game the frame the party died; the bodies fall first.
        const _checkGameover = Scene_Map.prototype.checkGameover;
        Scene_Map.prototype.checkGameover = function() {
            if (typeof $gameTemp !== "undefined" && $gameTemp._reactorFatalFall) return;
            _checkGameover.apply(this, arguments);
        };
        // Nor can the menu open over them: a save there kept a dead, limp party, and a revive there still ended the game.
        const _isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
        Scene_Map.prototype.isMenuEnabled = function() {
            if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._reactorFatalFall) return false;
            // Nor halfway up a ledge.
            if (typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer._reactorMantle) return false;
            return _isMenuEnabled.apply(this, arguments);
        };
    }

    if (typeof Game_Player !== "undefined") {
        // A limp body goes nowhere.
        const _canMove = Game_Player.prototype.canMove;
        Game_Player.prototype.canMove = function() {
            return !this._reactorRagdoll && !this._reactorMantle && !this._reactorGrapple && _canMove.apply(this, arguments);
        };
        const _updateP = Game_Player.prototype.update;
        Game_Player.prototype.update = function(sceneActive) {
            const free = sceneActive && typeof Input !== "undefined" && this.canMove() && !this.isInVehicle()
                && typeof $gameMap !== "undefined" && !$gameMap.isEventRunning();
            // In the water Dash dives and Jump rises; at the surface Jump leaps out.
            const under = free && this._reactorSwim ? ReactorPhysics.steerDive(this, Input.isPressed("shift"), Input.isPressed("jump") && (this._reactorDive || 0) > 0, ReactorPhysics.lookDive(this)) : false;
            if (Input.isTriggered && Input.isTriggered("jump")) {
                // A press that does not jump says why, once, on the console: "sometimes it will not jump"
                // is otherwise unanswerable.
                // Jump pressed against a ledge within reach: taken hold of and climbed. Pressed on the way
                // to one that hangs over the way on (a roof's eave): taken as the step ends.
                if (free && !under && !((this._reactorDive || 0) > 0)) {
                    if (this._reactorPush && ReactorPhysics.tryMantle(this, this._reactorPush)) { /* climbing */ }
                    else if (this.isMoving() && ReactorPhysics.mantleAhead(this, this.x, this.y, this.direction())) this._reactorMantleWish = [this.direction(), ReactorPhysics.mantleAhead(this, this.x, this.y, this.direction())];
                    else if (!ReactorPhysics.jump(this)) ReactorPhysics.noteJumpRefused(this);
                }
                else ReactorPhysics.noteJumpRefused(this, !sceneActive ? "the scene is busy" : !this.canMove() ? "the player cannot move (a message, a move route, followers gathering)"
                    : this.isInVehicle() ? "in a vehicle" : $gameMap.isEventRunning() ? "an event is running (Jump shares its key with an event's action button?)" : "diving");
            }
            if (this._reactorMantleWish && !this.isMoving()) {
                // The ledge wished for a step early is taken a step on, if the walk goes on that way.
                const wish = this._reactorMantleWish;
                this._reactorMantleWish = wish[1] > 1 && this.direction() === wish[0] ? [wish[0], wish[1] - 1] : null;
                if (free && ReactorPhysics.tryMantle(this, wish[0])) this._reactorMantleWish = null;
            }
            // The way the player pushed against something last frame; this frame's push is noted below.
            this._reactorPush = 0; this._reactorPushAlso = 0;
            _updateP.apply(this, arguments);
            // Pushing on against a low ledge, frame after frame without moving, climbs it without Jump. A walk along
            // a wall pushes only as each step begins, so it never counts up.
            const push = this._reactorPush;
            if (push && push === this._reactorPushDir) this._reactorPushFrames = (this._reactorPushFrames || 0) + 1;
            else { this._reactorPushDir = push; this._reactorPushFrames = push ? 1 : 0; }
            if (free && push && this._reactorPushFrames >= ReactorPhysics.STEP_UP_FRAMES) {
                // Asked when the push has lasted, and again only when it has lasted as long once more: a wall
                // gives the same answer every frame.
                this._reactorPushFrames = 0;
                if (!ReactorPhysics.stepUp(this, push) && this._reactorPushAlso) ReactorPhysics.stepUp(this, this._reactorPushAlso);
            }
            // Afterwards, so a step the player asked for this frame is already under way.
            if (free) ReactorPhysics.drift(this, Input.dir4 !== 0);
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
            const result = _moveStraight.apply(this, arguments);
            // Stopped by something: noted for a Jump press, and in the air an edge within reach is caught.
            if (!this.isMovementSucceeded() && !this._reactorMantle) {
                // A diagonal into a corner is stopped both ways: both are kept, the later one first.
                if (this._reactorPush && this._reactorPush !== d) this._reactorPushAlso = this._reactorPush;
                this._reactorPush = d;
                // A jump that meets a ledge takes hold of it; a body that only fell needs the Jump key for that.
                if (ReactorPhysics.isAirborne(this) && !ReactorPhysics.fellOff(this)) ReactorPhysics.tryMantle(this, d);
            }
            return result;
        };
        // A follower still climbing does not step on yet; it catches up once there.
        if (typeof Game_Follower !== "undefined") {
            const _chase = Game_Follower.prototype.chaseCharacter;
            Game_Follower.prototype.chaseCharacter = function(character) {
                // A flag, not the leader itself: a character held here made the save circular ("Object too deep").
                if (ReactorPhysics.followerClimbing(this)) { this._reactorChaseLater = true; return; }
                // Pulling itself up, or its leader is: the step waits.
                if (this._reactorMantle) return;
                if (character && character._reactorMantle && !character._reactorMantle.over) { this._reactorChaseLater = true; return; }
                this._reactorChaseLater = null;
                // Its leader went up a ledge: it goes up the same way instead of through the wall.
                if (character && ReactorPhysics.followerMantle(this, character)) return;
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
                    // Straight steps only: a follower that came at the ladder diagonally went up it askew.
                    // The longer way first, then the other, ending square in front of the rungs.
                    const sx = this.deltaXFrom(leader.x), sy = this.deltaYFrom(leader.y);
                    const alongX = Math.abs(sx) > Math.abs(sy) || (Math.abs(sx) === Math.abs(sy) && sx !== 0);
                    this.moveStraight(alongX ? (sx > 0 ? 4 : 6) : (sy > 0 ? 8 : 2));
                    if (!this.isMovementSucceeded() && sx && sy) this.moveStraight(alongX ? (sy > 0 ? 8 : 2) : (sx > 0 ? 4 : 6));
                    this._reactorChaseLater = null;
                }
                const lead = this._reactorChaseLater ? leader : null;
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
        // A character a jump carries is not stopped by what it is over; one that walked off an edge takes no step until it is down.
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
                // A walker that stepped off an edge comes down where it stepped off: only a jump carries a body on
                // through the air. A hole one tile wide in a floor is fallen into, not walked across.
                if (ReactorPhysics.fellOff(this)) return false;
                return !ReactorPhysics.airBlocks(this, x2, y2);
            }
            // Off the edge of a roof or a wall, where the fall is safe: stepped off, and gravity has it.
            return _isMapPassable.apply(this, arguments) || ReactorPhysics.walksOff(this, x, y, d);
        };
    }

    if (typeof Game_Event !== "undefined") {
        // An event that climbs takes a ledge in its way as the player would, and its route waits while it does.
        // Game_Event only inherits moveStraight: the parent's is looked up at the call, so a plugin that replaces
        // Game_CharacterBase's or Game_Character's later is still reached.
        Game_Event.prototype.moveStraight = function(d) {
            Object.getPrototypeOf(Game_Event.prototype).moveStraight.apply(this, arguments);
            if (!this.isMovementSucceeded() && !this._reactorMantle && ReactorPhysics.climbs(this)
                && (ReactorPhysics.tryMantle(this, d, true) || ReactorPhysics.stepUp(this, d))) this.setMovementSuccess(true);
        };
        const _eventSelfMovement = Game_Event.prototype.updateSelfMovement;
        Game_Event.prototype.updateSelfMovement = function() {
            if (this._reactorMantle) return;
            _eventSelfMovement.apply(this, arguments);
        };
        if (typeof Game_Character !== "undefined" && Game_Character.prototype.updateRoutineMove) {
            const _routineMove = Game_Character.prototype.updateRoutineMove;
            Game_Character.prototype.updateRoutineMove = function() {
                if (this._reactorMantle) return;
                _routineMove.apply(this, arguments);
            };
        }
    }

    if (typeof Game_Follower !== "undefined") {
        // After a fatal fall nobody walks on: a follower still in the air only falls.
        const _chase = Game_Follower.prototype.chaseCharacter;
        Game_Follower.prototype.chaseCharacter = function() {
            if (typeof $gameTemp !== "undefined" && $gameTemp._reactorFatalFall) return;
            _chase.apply(this, arguments);
        };
    }

    if (typeof module !== "undefined" && module.exports) module.exports = ReactorPhysics;
})(typeof window !== "undefined" ? window : globalThis);
