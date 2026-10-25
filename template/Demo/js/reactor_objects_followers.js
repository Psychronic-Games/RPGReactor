//=============================================================================
// reactor_objects_followers.js v1.0.0
//=============================================================================
// The party's followers: the formation they walk in, orders to one of them
// or to all, and the event commands for both.
// Part of reactor_objects.js; loads after reactor_objects_interpreter.js.
//
// A formation says where each follower wants to stand, counted back along
// the way the leader came and sideways from it:
//   file       one behind the other (stock; with spacing 1 and no straggle
//              nothing in this file moves anybody)
//   loose      a file whose gaps stretch and close
//   rank       side by side behind the leader
//   wedge      the leader at the point, the rest fanning back
//   column     two files, the leader at the head of one
//   scattered  each near the leader on a spot of its own
// `spacing` (1 to 4) is the tiles between members and `straggle` (0 to 100)
// how late and how unevenly they follow. The game's own formation is
// System.json `reactorParty: { formation, spacing, straggle }`; Change
// Follower Formation keeps another with the save.
//
// The leader's way is kept as a trail of tiles. A follower on the trail walks
// it as the leader did (ladders and ledges through the physics' own follower
// rules); a follower beside it walks as a body of its own, by the map's
// passability and round the other members, and where its place cannot be
// stood on or come to from the trail it takes its place in the file instead.
//
//   $gamePlayer.followers().setFormation("wedge", { spacing: 2, straggle: 30 })
//   $gamePlayer.followers().setFormation(null)             the game's own again
//   $gamePlayer.followers().order(2, "stay")               "all", a place from 1, or { actorId: 3 }
//   $gamePlayer.followers().order(1, "goto", { x: 14, y: 9, direction: 2 })
//   $gamePlayer.followers().order("all", "follow")         also "come", "hide", "show"
//   $gamePlayer.followers().route(1, moveRoute)            as Set Movement Route on a follower
//
// A follower leaves the line only when it is told to: by an order, or by a
// route from Set Movement Route with the editor's id for it (`route`). A
// route given with `forceMoveRoute` alone, as plugins and scripts give one,
// is the stock one: the follower is walked through and trails the leader
// again afterwards.

(function() {
    "use strict";

    const FORMATIONS = ["file", "loose", "rank", "wedge", "column", "scattered"];
    Game_Followers.FORMATIONS = FORMATIONS;
    /** A follower further from its place than this runs. */
    Game_Followers.RUN_DISTANCE = 4;
    /** A follower further from the leader than this (and the length of the line) is brought behind the party. */
    Game_Followers.BRING_DISTANCE = 14;
    /** Frames a follower whose step was refused waits before it tries again, and the tries before it goes by the trail. */
    Game_Followers.RETRY_WAIT = 8;
    Game_Followers.STUCK_TRIES = 2;
    /** A step along the trail that is refused is asked for again after `RETRY_WAIT` frames times the refusals, up to this many. */
    Game_Followers.REFUSED_MOST = 15;
    /** Tiles the leader walks on before a follower that could not come to its place beside the trail tries for it again. */
    Game_Followers.NARROW_STEPS = 3;
    /** Frames before the two followers of a trade may trade with each other again. */
    Game_Followers.TRADE_AGAIN = 60;
    /** Steps a follower's own walk back to the line is at most: a longer way round is not taken. */
    Game_Followers.WALK_MOST = 24;
    /** Frames the leader stands before the followers that let it get ahead close up. */
    Game_Followers.CLOSE_FRAMES = 24;
    /**
     * Frames before a follower that walked to the trail by a path of its own asks for another: doubled each time
     * it asks from the tile it asked from before (that walk got nowhere), up to the longest; the longest at once
     * where the walk would be to the same tile again.
     */
    Game_Followers.WALK_AGAIN = 90;
    Game_Followers.WALK_AGAIN_LONGEST = 900;
    /** Frames such a walk stands before a member standing in its place in the way is traded places with. */
    Game_Followers.WALK_BLOCKED = 20;
    /** Frames such a walk stands waiting (its way is being looked for, somebody is in it) before it is given up. */
    Game_Followers.WALK_PATIENCE = 90;
    /** Times a follower waits for a member that is held up in its way before it goes by the trail. */
    Game_Followers.PATIENCE = 15;
    /** Frames a follower brought behind the party takes to fade in. */
    Game_Followers.APPEAR_FRAMES = 16;
    /** A rank is at most this many abreast. */
    Game_Followers.RANK_WIDTH = 5;
    /** Frames a scattered follower keeps a spot while the leader stands: the least, and how much longer it may be. */
    Game_Followers.ROAM_FRAMES = 150;
    Game_Followers.ROAM_SPREAD = 240;
    /** Looseness the loose and the scattered formations have before any straggle is asked for. */
    Game_Followers.LOOSE_STRAGGLE = 60;
    Game_Followers.SCATTER_STRAGGLE = 70;

    const sign = value => (value > 0 ? 1 : value < 0 ? -1 : 0);
    const whole = (value, low, high, fallback) => {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.max(low, Math.min(high, number)) : fallback;
    };
    const fightHere = function() {
        return typeof $gameFight !== "undefined" && !!$gameFight && $gameFight.isHere();
    };
    const map3D = function() {
        return typeof Reactor3D !== "undefined" && typeof $dataMap !== "undefined" && $dataMap
            && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap) ? Reactor3D : null;
    };
    const heightOf = function(character) {
        if (Number.isFinite(character._reactorAlt)) return character._reactorAlt;
        return Number.isFinite(character._reactorGround) ? character._reactorGround : 0;
    };
    /**
     * The height of the ground a character is on or over: what the trail
     * keeps of the leader's way. A leader that drops off a ledge is over the
     * low ground from the tile beyond the edge on, however high it still is
     * in the air there.
     */
    const groundOf = function(character) {
        const height = heightOf(character);
        return character._reactorAir > 0 && !character._reactorOnLadder ? height - character._reactorAir : height;
    };
    /** How far apart two heights are and still the same floor of a 3D map (a stair is a tile's rise). */
    Game_Followers.FLOOR_REACH = 1.2;
    /** The ground of a tile on the floor nearest a height: 0 on a flat map. */
    const floorAt = function(x, y, near) {
        const world = map3D();
        return world ? world.groundHeightAt($dataMap, x + 0.5, y + 0.5, near) : 0;
    };
    /** Whether a height is on the floor a place of the trail or of the formation is on. Always, on a flat map. */
    const sameFloor = function(height, floor) {
        return !map3D() || Math.abs(height - floor) <= Game_Followers.FLOOR_REACH;
    };
    /** Whether a follower stands in its place: on its tile, on its floor (the tile under a balcony is not the balcony). */
    const inPlace = function(follower) {
        return follower.x === follower._rrTx && follower.y === follower._rrTy && sameFloor(heightOf(follower), follower._rrTh);
    };
    /**
     * Whether a follower is on a walk the formation sent it on (its own way
     * back to the line). A route something else gave it (a plugin, a script)
     * is not the formation's to cut short.
     */
    const onOwnWalk = function(follower) {
        return follower._moveRouteForcing && !!follower._moveRoute && follower._moveRoute.rrOwn === true;
    };
    /** The same number for the same follower every time, from 0 up to 1: what makes each follow in its own way. */
    const share = function(index, salt) {
        const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
        return value - Math.floor(value);
    };

    //-------------------------------------------------------------------------
    // The formation in force.

    /** A formation as stored (System.json, a command, a script), made whole. */
    Game_Followers.normalizeFormation = function(source, fallback) {
        const base = fallback || { formation: "file", spacing: 1, straggle: 0 };
        const given = source && typeof source === "object" ? source : {};
        return {
            formation: FORMATIONS.includes(given.formation) ? given.formation : base.formation,
            spacing: whole(given.spacing, 1, 4, base.spacing),
            straggle: whole(given.straggle, 0, 100, base.straggle)
        };
    };

    // The formation last worked out, and what it was worked out from.
    const inForce = { own: undefined, system: undefined, formation: "file", spacing: 1, straggle: 0, active: false };

    /** The formation the party walks in: the one a command or a script set, else the game's, else a single file. */
    Game_Followers.prototype.formation = function() {
        const own = this._rrFormation || null;
        const system = (typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorParty) || null;
        if (inForce.own !== own || inForce.system !== system) {
            const game = Game_Followers.normalizeFormation(system);
            const now = own ? Game_Followers.normalizeFormation(own, game) : game;
            inForce.own = own;
            inForce.system = system;
            inForce.formation = now.formation;
            inForce.spacing = now.spacing;
            inForce.straggle = now.straggle;
            inForce.active = now.formation !== "file" || now.spacing !== 1 || now.straggle !== 0;
        }
        return inForce;
    };

    /**
     * The formation from now on, kept with the save: a name and
     * `{ spacing, straggle }` (what is left out is the game's own), or null
     * for the game's own formation again.
     */
    Game_Followers.prototype.setFormation = function(formation, options) {
        const was = this.formation().active;
        if (!formation || formation === "default") {
            this._rrFormation = null;
        } else {
            const game = Game_Followers.normalizeFormation(typeof $dataSystem !== "undefined" && $dataSystem ? $dataSystem.reactorParty : null);
            this._rrFormation = Game_Followers.normalizeFormation(Object.assign({ formation: formation }, options || {}), game);
        }
        // Back to the stock file from another formation: they walk to their places in it first.
        if (was && !this.formation().active) this._rrSettling = true;
        // A formation is walked into at once, whoever has left the line since the leader's last step.
        this._rrGap = false;
        // The places are counted afresh along the way already walked; the trail is made longer where the new
        // formation needs it.
        const trail = this._rrTrail;
        if (trail) {
            if (trail.cap < this.rrTrailLength()) growTrail(trail, this.rrTrailLength());
            trail.dirty = true;
            trail.wl.fill(-1);
            trail.wr.fill(-1);
        }
        for (const follower of this._data) { follower._rrSpot = null; follower._rrSlot = -1; }
        // The trail is made from the line as it stands now, before the leader's next step breaks it.
        if (!this._rrTrail && typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer._followers === this && this.rrIsActive()) this.rrTrail();
    };

    /**
     * Whether the formation moves the followers now: another than the stock
     * file (or a walk back into it), and the leader on foot on the ground.
     * Aboard a vehicle, on a ladder or a ledge, in the water and in the air
     * the stock file follows, as it always has; the formation takes up again
     * from where they stand. Nor while the followers are aboard with the
     * leader (`rrAboard`), whatever it rides.
     */
    Game_Followers.prototype.rrIsActive = function() {
        if (this._rrAboard || (!this.formation().active && !this._rrSettling)) return false;
        const player = $gamePlayer;
        return !player.isInVehicle() && !player._vehicleGettingOn && !player._vehicleGettingOff && !this.rrLeaderClimbs();
    };

    //-------------------------------------------------------------------------
    // Where each follower stands in a formation: rows behind the leader and
    // tiles to its right (negative: to its left), both in units of the
    // spacing. Worked out once for a formation and a number of followers.

    const table = { formation: "", count: -1, rows: [], lats: [] };

    // The places taken of a row whose places are `first`, `first + step`, ... (`size` of them), by `members`:
    // pairs from the outside in (`outer`) or from the middle out, the odd one in the middle (to the left where
    // the row has no middle). Written into the table in the order the followers take them.
    const fillRow = function(row, first, step, size, members, outer) {
        const middle = size % 2 === 1 ? first + step * ((size - 1) / 2) : null;
        const pairs = Math.floor(size / 2);
        let left = members;
        if (members % 2 === 1 && middle !== null) { table.rows.push(row); table.lats.push(middle); left--; }
        for (let n = 0; n < pairs && left > 0; n++) {
            const k = outer ? n : pairs - 1 - n;
            const a = first + step * k, b = first + step * (size - 1 - k);
            table.rows.push(row); table.lats.push(a); left--;
            if (left > 0) { table.rows.push(row); table.lats.push(b); left--; }
        }
    };

    const placesOf = function(formation, count) {
        if (table.formation === formation && table.count === count) return table;
        table.formation = formation;
        table.count = count;
        table.rows.length = 0;
        table.lats.length = 0;
        if (formation === "rank") {
            const width = Game_Followers.RANK_WIDTH, half = (width - 1) / 2;
            for (let row = 1, left = count; left > 0; row++, left -= width) fillRow(row, -half, 1, width, Math.min(width, left), false);
        } else if (formation === "wedge") {
            for (let row = 1, left = count; left > 0; left -= row + 1, row++) fillRow(row, -row, 2, row + 1, Math.min(row + 1, left), true);
        } else if (formation === "column") {
            // The leader heads the left file: the first follower walks beside it.
            for (let j = 0; j < count; j++) { table.rows.push(Math.floor((j + 1) / 2)); table.lats.push((j + 1) % 2); }
        } else {
            for (let j = 0; j < count; j++) { table.rows.push(j + 1); table.lats.push(0); }
        }
        return table;
    };

    /**
     * The places of a formation for `count` followers, as `[row, right]`
     * pairs in units of the spacing (the leader is `[0, 0]`): what the
     * editor's pictures and the tests read.
     */
    Game_Followers.places = function(formation, count) {
        const places = placesOf(FORMATIONS.includes(formation) ? formation : "file", Math.max(0, count | 0));
        const list = [];
        for (let j = 0; j < places.rows.length; j++) list.push([places.rows[j], places.lats[j]]);
        return list;
    };

    //-------------------------------------------------------------------------
    // The trail: the tiles the leader stood on, newest first, each with the
    // height it stood at (a 3D map's floor) and how far the ground is open
    // to either side of it.

    /** Tiles of trail a formation needs: the longest file, and room to fall behind in. */
    Game_Followers.prototype.rrTrailLength = function() {
        return Math.max(24, (this._data.length + 2) * this.formation().spacing + 16);
    };

    const entryOf = (trail, back) => (trail.head - back + trail.cap * 2) % trail.cap;
    // The followers a new trail is made from, by their place in the line.
    const line = [];

    const pushTrail = function(trail, x, y, height) {
        trail.head = (trail.head + 1) % trail.cap;
        if (trail.n < trail.cap) trail.n++;
        trail.seq++;
        trail.x[trail.head] = x;
        trail.y[trail.head] = y;
        trail.h[trail.head] = height;
        trail.wl[trail.head] = -1;
        trail.wr[trail.head] = -1;
        trail.dirty = true;
    };

    // The same tiles in a longer ring, oldest first, so every count back from the leader stays what it was.
    const growTrail = function(trail, cap) {
        const x = new Array(cap).fill(0), y = new Array(cap).fill(0), h = new Array(cap).fill(0);
        for (let back = trail.n - 1, to = 0; back >= 0; back--, to++) {
            const at = entryOf(trail, back);
            x[to] = trail.x[at];
            y[to] = trail.y[at];
            h[to] = trail.h[at];
        }
        trail.x = x;
        trail.y = y;
        trail.h = h;
        trail.wl = new Array(cap).fill(-1);
        trail.wr = new Array(cap).fill(-1);
        trail.head = trail.n - 1;
        trail.cap = cap;
        trail.dirty = true;
    };

    /**
     * The trail, made from the line as it stands when there is none: the
     * leader's tile, then each follower's that is a step from the one before
     * it (a stock file is exactly that). Followers on it know their place.
     */
    Game_Followers.prototype.rrTrail = function() {
        if (this._rrTrail) return this._rrTrail;
        const cap = this.rrTrailLength(), player = $gamePlayer, data = this._data;
        const trail = this._rrTrail = {
            cap: cap, n: 0, head: -1, seq: -1, d: player.direction(), dirty: true, stale: false, still: 0,
            x: new Array(cap).fill(0), y: new Array(cap).fill(0), h: new Array(cap).fill(0),
            wl: new Array(cap).fill(-1), wr: new Array(cap).fill(-1)
        };
        // The tile the leader is stepping off is the one before its own: the line stands behind that.
        const fromX = player.isMoving() ? $gameMap.roundX(player.x - sign($gameMap.deltaX(player.x, player._realX))) : player.x;
        const fromY = player.isMoving() ? $gameMap.roundY(player.y - sign($gameMap.deltaY(player.y, player._realY))) : player.y;
        const stepping = fromX !== player.x || fromY !== player.y;
        // The followers whose tiles carry the line on, nearest the leader first: each a step from the one before.
        let length = 0, lastX = fromX, lastY = fromY;
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrOrder) continue;
            const dx = Math.abs($gameMap.deltaX(follower.x, lastX)), dy = Math.abs($gameMap.deltaY(follower.y, lastY));
            if (dx > 1 || dy > 1) break;
            if (dx === 0 && dy === 0) continue;
            line[length++] = i;
            lastX = follower.x;
            lastY = follower.y;
        }
        // Oldest first, so the leader's tile ends as the head.
        for (let k = length - 1; k >= 0; k--) pushTrail(trail, data[line[k]].x, data[line[k]].y, groundOf(data[line[k]]));
        // The tile it is stepping off at the height it leaves it at (the top of a ladder it has just come off).
        if (stepping) pushTrail(trail, fromX, fromY, heightOf(player));
        pushTrail(trail, player.x, player.y, groundOf(player));
        for (let i = 0; i < data.length; i++) {
            this.rrForget(data[i]);
            if (!data[i]._rrOrder) this.rrFindOnTrail(trail, data[i]);
        }
        return trail;
    };

    /**
     * Every field this file keeps on a follower, made at once and in one
     * order: when the follower is made, and on one from a save that has not
     * all of them. Followers that were given them one by one, each in the
     * order its own walk came to need them, would each be an object of
     * another shape, and the functions every character shares (the player
     * and the events too) run slower and allocate once they meet many.
     */
    const shape = function(follower) {
        if (follower._rrOn === undefined) follower._rrOn = -1;
        if (follower._rrGo === undefined) follower._rrGo = false;
        if (follower._rrRun === undefined) follower._rrRun = false;
        if (follower._rrWait === undefined) follower._rrWait = 0;
        if (follower._rrDelay === undefined) follower._rrDelay = -1;
        if (follower._rrStuck === undefined) follower._rrStuck = 0;
        if (follower._rrPatience === undefined) follower._rrPatience = 0;
        if (follower._rrRefused === undefined) follower._rrRefused = 0;
        if (follower._rrByTrail === undefined) follower._rrByTrail = false;
        if (follower._rrByUntil === undefined) follower._rrByUntil = 0;
        if (follower._rrKept === undefined) follower._rrKept = 0;
        if (follower._rrFile === undefined) follower._rrFile = 0;
        if (follower._rrFiled === undefined) follower._rrFiled = false;
        if (follower._rrTx === undefined) follower._rrTx = 0;
        if (follower._rrTy === undefined) follower._rrTy = 0;
        if (follower._rrTh === undefined) follower._rrTh = 0;
        if (follower._rrTq === undefined) follower._rrTq = -1;
        if (follower._rrTl === undefined) follower._rrTl = 0;
        if (follower._rrSlot === undefined) follower._rrSlot = -1;
        if (follower._rrRound === undefined) follower._rrRound = 0;
        if (follower._rrFileTried === undefined) follower._rrFileTried = -1;
        if (follower._rrKey === undefined) follower._rrKey = 0;
        if (follower._rrSpot === undefined) follower._rrSpot = null;
        if (follower._rrRoam === undefined) follower._rrRoam = 0;
        if (follower._rrTradedWith === undefined) follower._rrTradedWith = 0;
        if (follower._rrTradedAt === undefined) follower._rrTradedAt = 0;
        if (follower._rrTraded === undefined) follower._rrTraded = 0;
        if (follower._rrTradeStep === undefined) follower._rrTradeStep = -2;
        if (follower._rrPassing === undefined) follower._rrPassing = false;
        if (follower._rrHeldUp === undefined) follower._rrHeldUp = 0;
        if (follower._rrIdle === undefined) follower._rrIdle = 0;
        // No walk of its own yet: long enough ago that the first is asked for at once.
        if (follower._rrWalked === undefined) follower._rrWalked = -1000000;
        if (follower._rrWalkedFrom === undefined) follower._rrWalkedFrom = -1;
        if (follower._rrWalkedTo === undefined) follower._rrWalkedTo = -1;
        if (follower._rrAgain === undefined) follower._rrAgain = 0;
        if (follower._rrAppear === undefined) follower._rrAppear = 0;
        if (follower._rrOrder === undefined) follower._rrOrder = null;
        if (follower._rrHidden === undefined) follower._rrHidden = false;
        // Aboard with the leader (unseen once `_rrLeave`, the frames left of its fade, has run out).
        if (follower._rrAboard === undefined) follower._rrAboard = false;
        if (follower._rrLeave === undefined) follower._rrLeave = 0;
        if (follower._rrActorId === undefined) follower._rrActorId = 0;
        // The walk to a tile a route asks for (reactor_objects_map.js): a follower has one once its first walk begins.
        if (follower._reactorWalk === undefined) follower._reactorWalk = null;
        if (follower._rrSolid === undefined) follower._rrSolid = false;
    };

    const stockInitialize = Game_Follower.prototype.initialize;
    Game_Follower.prototype.initialize = function(memberIndex) {
        stockInitialize.call(this, memberIndex);
        shape(this);
    };

    /** What a follower remembers of its last steps: not the place it has in the line. */
    Game_Followers.prototype.rrForgetSteps = function(follower) {
        follower._rrOn = -1;
        follower._rrGo = false;
        follower._rrRun = false;
        follower._rrWait = 0;
        follower._rrDelay = -1;
        follower._rrStuck = 0;
        follower._rrPatience = 0;
        follower._rrRefused = 0;
        follower._rrByTrail = false;
        follower._rrByUntil = 0;
    };

    /** What a follower remembers of its last decisions, and its place: where it stands is its place until one is handed out. */
    Game_Followers.prototype.rrForget = function(follower) {
        // A follower from a save made before a field existed: the last of them tells.
        if (follower._rrSolid === undefined) shape(follower);
        this.rrForgetSteps(follower);
        follower._rrKept = 0;
        follower._rrFile = 0;
        follower._rrFiled = false;
        follower._rrTx = follower.x;
        follower._rrTy = follower.y;
        follower._rrTh = heightOf(follower);
        follower._rrTq = -1;
        follower._rrTl = 0;
        follower._rrSlot = -1;
        follower._rrRound = 0;
    };

    // The way the leader was going at a trail tile, as a step of -1, 0 or 1 each way: over two tiles of the
    // trail, so a zigzag reads as the diagonal it is and a corner is turned over two steps.
    const heading = { x: 0, y: 0 };
    const headingAt = function(trail, back) {
        const at = entryOf(trail, back);
        let dx = 0, dy = 0;
        if (back + 2 < trail.n) {
            const far = entryOf(trail, back + 2);
            dx = sign($gameMap.deltaX(trail.x[at], trail.x[far]));
            dy = sign($gameMap.deltaY(trail.y[at], trail.y[far]));
        }
        if (!dx && !dy && back + 1 < trail.n) {
            const near = entryOf(trail, back + 1);
            dx = sign($gameMap.deltaX(trail.x[at], trail.x[near]));
            dy = sign($gameMap.deltaY(trail.y[at], trail.y[near]));
        }
        if (!dx && !dy) {
            dx = trail.d === 6 ? 1 : trail.d === 4 ? -1 : 0;
            dy = trail.d === 2 ? 1 : trail.d === 8 ? -1 : 0;
        }
        heading.x = dx;
        heading.y = dy;
        return heading;
    };

    /**
     * One step over plain ground from (x, y) toward `d` and back again, for a
     * walker standing at `height`: the height on the next tile, or NaN. A
     * wall, a ledge either way and a drop off something built all stop it;
     * nobody standing there does.
     */
    Game_Followers.prototype.rrGroundStep = function(probe, x, y, d, height) {
        const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
        if (!$gameMap.isValid(x2, y2)) return NaN;
        const world = map3D(), physics = typeof ReactorPhysics !== "undefined" && ReactorPhysics.walksOff ? ReactorPhysics : null;
        const ground = probe._reactorGround, alt = probe._reactorAlt;
        let landing = 0, open = false;
        try {
            if (world) { probe._reactorGround = height; if (Number.isFinite(alt)) probe._reactorAlt = height; }
            open = probe.isMapPassable(x, y, d) && !(physics && physics.walksOff(probe, x, y, d));
            if (open && world) {
                const edge = world.groundHeightAt($dataMap, x + (d === 6 ? 1 : d === 4 ? 0 : 0.5), y + (d === 2 ? 1 : d === 8 ? 0 : 0.5), height);
                landing = world.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, edge);
                probe._reactorGround = landing;
                if (Number.isFinite(alt)) probe._reactorAlt = landing;
            }
            if (open) open = probe.isMapPassable(x2, y2, 10 - d) && !(physics && physics.walksOff(probe, x2, y2, 10 - d));
        } finally {
            probe._reactorGround = ground;
            probe._reactorAlt = alt;
        }
        return open ? landing : NaN;
    };

    // One tile sideways (ux, uy): a straight step, or a diagonal by either of its corners.
    Game_Followers.prototype.rrSideStep = function(probe, x, y, ux, uy, height) {
        const horz = ux > 0 ? 6 : 4, vert = uy > 0 ? 2 : 8;
        if (!uy) return this.rrGroundStep(probe, x, y, horz, height);
        if (!ux) return this.rrGroundStep(probe, x, y, vert, height);
        let by = this.rrGroundStep(probe, x, y, horz, height);
        if (by === by) by = this.rrGroundStep(probe, $gameMap.roundXWithDirection(x, horz), y, vert, by);
        if (by === by) return by;
        by = this.rrGroundStep(probe, x, y, vert, height);
        return by === by ? this.rrGroundStep(probe, x, $gameMap.roundYWithDirection(y, vert), horz, by) : NaN;
    };

    /** How many tiles the ground is open from a trail tile to one side (1 its right, -1 its left), up to `need`. Kept with the tile. */
    Game_Followers.prototype.rrOpenBeside = function(trail, back, side, need) {
        const at = entryOf(trail, back), store = side > 0 ? trail.wr : trail.wl;
        const known = store[at];
        // Kept as the tiles found open, plus 100 when the ground ended there (no more to find however far is asked).
        if (known >= 100) return known - 100;
        if (known >= need) return known;
        const probe = this._data[0];
        if (!probe) return 0;
        const way = headingAt(trail, back), ux = -way.y * side, uy = way.x * side;
        let x = trail.x[at], y = trail.y[at], height = trail.h[at], open = 0;
        while (open < need) {
            height = this.rrSideStep(probe, x, y, ux, uy, height);
            if (height !== height) { store[at] = open + 100; return open; }
            x = $gameMap.roundX(x + ux);
            y = $gameMap.roundY(y + uy);
            open++;
        }
        store[at] = open;
        return open;
    };

    //-------------------------------------------------------------------------
    // Places: where each follower is to stand now.

    /** Whether a member of the party is on a ladder, pulling itself up a ledge, in the water or in an event's jump: more than only in the air. */
    Game_Followers.prototype.rrHolds = function(character) {
        return character.isJumping() || !!(character._reactorOnLadder || character._reactorMantle || character._reactorClimb || character._reactorSwim || character._reactorRagdoll);
    };

    /** Whether a member of the party is on a ladder or a ledge, in the water or in the air. */
    Game_Followers.prototype.rrClimbs = function(character) {
        if (character.isJumping() || character._reactorOnLadder || character._reactorMantle || character._reactorClimb || character._reactorSwim || character._reactorRagdoll) return true;
        return typeof ReactorPhysics !== "undefined" && ReactorPhysics.isAirborne ? ReactorPhysics.isAirborne(character) : false;
    };

    /**
     * Whether the leader is on a ladder, pulling itself up a ledge, in the
     * water or in an event's jump (or the party has fallen to its end): there
     * the stock file follows. A leader that only drops off a ledge or hops
     * is followed along the trail as on the ground: its way down is the
     * followers' way down, and the tiles it took are not forgotten.
     */
    Game_Followers.prototype.rrLeaderClimbs = function() {
        if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._reactorFatalFall) return true;
        return this.rrHolds($gamePlayer);
    };

    // A spot of its own for a scattered follower: rows behind the leader and tiles to its side, in tiles.
    Game_Followers.prototype.rrSpotOf = function(follower, index, spacing) {
        if (!follower._rrSpot) {
            this._rrSeed = ((this._rrSeed || 1) * 16807 + index * 7919 + 1) % 2147483647;
            const a = this._rrSeed % 997, b = Math.floor(this._rrSeed / 997) % 991;
            // Room for everybody: a larger party spreads further back and wider.
            const count = this._data.length, reach = spacing + 1 + Math.floor(count / 4);
            const side = (b % (reach * 2 + 1)) - reach;
            const row = 1 + (a % (spacing + 1 + Math.ceil(count / 3)));
            // Never on the leader's heels: straight behind it starts a row further back.
            follower._rrSpot = [side === 0 ? row + 1 : row, side];
            follower._rrRoam = Game_Followers.ROAM_FRAMES + Math.floor(share(index, this._rrSeed % 13) * Game_Followers.ROAM_SPREAD);
        }
        return follower._rrSpot;
    };

    /** Whether a tile is the place of a follower already given one this round, or under one that stays put. */
    Game_Followers.prototype.rrClaimed = function(round, x, y) {
        const data = this._data;
        for (let i = 0; i < data.length; i++) {
            const other = data[i];
            if (other._rrOrder ? other.isVisible() && other.pos(x, y) : other._rrRound === round && other._rrTx === x && other._rrTy === y) return true;
        }
        return false;
    };

    // Which places of the formation are held this round, and which places of the file.
    const held = [];
    const filed = [];
    // The followers in the order their places are worked out: by the place each holds, then those nobody sees.
    const order = [];

    /**
     * Each follower that walks in the formation holds one of its places: its
     * own by its order in the line until two of them trade (`rrTrade`).
     * Returns how many places there are.
     */
    Game_Followers.prototype.rrHoldPlaces = function() {
        const data = this._data;
        let count = 0;
        for (let i = 0; i < data.length; i++) if (!data[i]._rrOrder && data[i].isVisible()) count++;
        for (let k = 0; k < count; k++) held[k] = false;
        // A file keeps the order of the line: when one leaves it the rest move up, nobody comes round from the back.
        const keeps = this.rrTrades();
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrOrder || !follower.isVisible()) continue;
            const slot = follower._rrSlot;
            if (keeps && slot >= 0 && slot < count && !held[slot]) held[slot] = true;
            else follower._rrSlot = -1;
        }
        for (let i = 0, next = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrOrder || !follower.isVisible() || follower._rrSlot >= 0) continue;
            while (held[next]) next++;
            follower._rrSlot = next;
            held[next] = true;
        }
        let unseen = count;
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrOrder) continue;
            if (follower.isVisible()) order[follower._rrSlot] = i;
            else order[unseen++] = i;
        }
        order.length = unseen;
        return count;
    };

    /** Whether the formation lets two followers trade places: a file keeps its order. */
    Game_Followers.prototype.rrTrades = function() {
        const formation = this.formation().formation;
        return formation !== "file" && formation !== "loose";
    };

    // A follower as a bit, for the followers one has traded with since the leader's last step.
    const tradeBit = follower => 1 << ((follower._memberIndex - 1) % 31);

    /**
     * Whether two followers may trade places: both hold one and the two
     * places are two tiles. The same two trade once between two steps of the
     * leader (two that are both parted from their places by the land would
     * trade for ever), and not again a moment after a trade (that would be
     * the trade undone on the walk).
     */
    Game_Followers.prototype.rrMayTrade = function(a, b) {
        if (!this.rrTrades() || a._rrSlot < 0 || b._rrSlot < 0 || (a._rrTx === b._rrTx && a._rrTy === b._rrTy)) return false;
        const step = this._rrTrail ? this._rrTrail.seq : -1;
        if (a._rrTradeStep === step && (a._rrTraded & tradeBit(b))) return false;
        const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
        return !(a._rrTradedWith === b._memberIndex && frame >= a._rrTradedAt && frame - a._rrTradedAt < Game_Followers.TRADE_AGAIN);
    };

    /**
     * The follower standing in the way of a step toward a place (dx, dy)
     * away: on the tile that way, else (the way being a diagonal) on either
     * of the two tiles beside it.
     */
    Game_Followers.prototype.rrBlocker = function(follower, dx, dy) {
        const x = $gameMap.roundX(follower.x + sign(dx)), y = $gameMap.roundY(follower.y + sign(dy));
        const ahead = this.rrFollowerAt(x, y, follower);
        if (ahead || !dx || !dy) return ahead;
        const a = this.rrFollowerAt(x, follower.y, follower), b = this.rrFollowerAt(follower.x, y, follower);
        // Of two, the one that stands in its own place: the other is on its way somewhere.
        return a && b ? (inPlace(b) && !inPlace(a) ? b : a) : a || b;
    };

    /** Two followers trade places in the formation: the one in the way takes the place beyond it. */
    Game_Followers.prototype.rrTrade = function(a, b) {
        const slot = a._rrSlot, spot = a._rrSpot;
        a._rrSlot = b._rrSlot;
        b._rrSlot = slot;
        // A scattered follower's spot is its own: it goes with the place.
        a._rrSpot = b._rrSpot;
        b._rrSpot = spot;
        // Where each is going goes with the place at once: the other, deciding later in the same frame, does not
        // trade back.
        const x = a._rrTx, y = a._rrTy, h = a._rrTh, q = a._rrTq, l = a._rrTl, filed = a._rrFiled, file = a._rrFile;
        a._rrTx = b._rrTx; a._rrTy = b._rrTy; a._rrTh = b._rrTh; a._rrTq = b._rrTq; a._rrTl = b._rrTl; a._rrFiled = b._rrFiled; a._rrFile = b._rrFile;
        b._rrTx = x; b._rrTy = y; b._rrTh = h; b._rrTq = q; b._rrTl = l; b._rrFiled = filed; b._rrFile = file;
        a._rrStuck = b._rrStuck = 0;
        a._rrWait = b._rrWait = 0;
        a._rrPatience = b._rrPatience = 0;
        a._rrTradedWith = b._memberIndex;
        b._rrTradedWith = a._memberIndex;
        a._rrTradedAt = b._rrTradedAt = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
        const step = this._rrTrail ? this._rrTrail.seq : -1;
        a._rrTraded = (a._rrTradeStep === step ? a._rrTraded : 0) | tradeBit(b);
        b._rrTraded = (b._rrTradeStep === step ? b._rrTraded : 0) | tradeBit(a);
        a._rrTradeStep = b._rrTradeStep = step;
        // A walk either was on led to the place it had.
        if (onOwnWalk(a)) a.rrEndRoute();
        if (onOwnWalk(b)) b.rrEndRoute();
        // A place that is come to by the trail (the way straight to it was shut) is come to so by whoever has it.
        const by = a._rrByTrail, until = a._rrByUntil;
        a._rrByTrail = b._rrByTrail; a._rrByUntil = b._rrByUntil;
        b._rrByTrail = by; b._rrByUntil = until;
        b._rrGo = true;
        if (this._rrTrail) this._rrTrail.dirty = true;
    };

    // The followers in the order they stand along the trail, and each one's turn in that order.
    const lined = [];
    const turns = [];
    // What each follower asks of the trail this round (-2 nothing, -1 a place on it, else the tile of it its
    // formation names), and the places on the trail that are handed out, as tiles back from the leader.
    const wants = [];
    const spots = [];

    /**
     * The order the formation takes when it narrows to a file: by where each
     * follower stands along the trail, the nearer the leader and the nearer
     * the trail first, so a rank closes up like a zip and nobody has to pass
     * anybody. One that has a place in the file already keeps its turn in it
     * (two that trade places have then traded, wherever they stand). A file
     * keeps the order of the line.
     */
    Game_Followers.prototype.rrLineUp = function(trail, ordered) {
        const data = this._data;
        let count = 0;
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrOrder || !follower.isVisible()) continue;
            // Where it stands: the tile of the trail it is nearest to, counted back from the leader, then how far off
            // it is. A tile of the trail on another floor (the stairs over its head) is not near it.
            let key = follower._rrSlot * 100;
            const filedAt = follower._rrFiled && follower._rrTq >= 0 ? trail.seq - follower._rrTq : -1;
            if (!ordered && filedAt >= 0 && filedAt < trail.n) {
                key = filedAt * 100;
            } else if (!ordered) {
                const height = heightOf(follower);
                key = 100000 + i;
                for (let back = 0; back < trail.n && back * 100 < key; back++) {
                    const tile = entryOf(trail, back);
                    const off = Math.max(Math.abs($gameMap.deltaX(trail.x[tile], follower.x)), Math.abs($gameMap.deltaY(trail.y[tile], follower.y)));
                    if (back * 100 + off * 101 >= key || !sameFloor(floorAt(trail.x[tile], trail.y[tile], height), trail.h[tile])) continue;
                    key = back * 100 + off * 101;
                }
            }
            follower._rrKey = key;
            let at = count++;
            while (at > 0 && data[lined[at - 1]]._rrKey > follower._rrKey) { lined[at] = lined[at - 1]; at--; }
            lined[at] = i;
        }
        for (let turn = 0; turn < count; turn++) turns[lined[turn]] = turn;
        return count;
    };

    /**
     * Hands out the places on the trail of a formation that is not a file:
     * the tiles the formation names there (the middle of a wedge's second
     * row), then as many places of the file as there are followers without
     * one, the nearest the leader first; all of them go to the followers in
     * the order of the line-up, so nobody is given a place beyond somebody
     * else's. A tile the leader stands on, one that is somebody's place
     * beside the trail, and one the trail crosses twice count once or not
     * at all. A follower the trail is too short for has no place yet.
     */
    Game_Followers.prototype.rrPlaceOnTrail = function(trail, lineCount, spacing, round) {
        const data = this._data, player = $gamePlayer;
        let need = 0, have = 0;
        for (let turn = 0; turn < lineCount; turn++) {
            const back = wants[lined[turn]];
            if (back === -2) continue;
            need++;
            if (back < 0) continue;
            const at = entryOf(trail, back), x = trail.x[at], y = trail.y[at];
            if (player.pos(x, y) || this.rrClaimed(round, x, y) || spotOn(trail, have, x, y)) continue;
            spots[have++] = back;
            if (back % spacing === 0) filed[back / spacing] = true;
        }
        for (let place = 1; have < need && place * spacing < trail.n; place++) {
            if (filed[place]) continue;
            const back = place * spacing, at = entryOf(trail, back), x = trail.x[at], y = trail.y[at];
            if (player.pos(x, y) || this.rrClaimed(round, x, y) || spotOn(trail, have, x, y)) continue;
            spots[have++] = back;
        }
        for (let k = 1; k < have; k++) {
            const back = spots[k];
            let at = k;
            while (at > 0 && spots[at - 1] > back) { spots[at] = spots[at - 1]; at--; }
            spots[at] = back;
        }
        for (let turn = 0, next = 0; turn < lineCount; turn++) {
            const follower = data[lined[turn]];
            if (wants[lined[turn]] === -2) continue;
            follower._rrFiled = true;
            follower._rrTl = 0;
            if (next >= have) { follower._rrRound = -round; continue; }
            const back = spots[next++], at = entryOf(trail, back);
            follower._rrTx = trail.x[at];
            follower._rrTy = trail.y[at];
            follower._rrTh = trail.h[at];
            follower._rrTq = trail.seq - back;
            follower._rrRound = round;
        }
    };

    // Whether a tile is one of the places on the trail picked so far.
    const spotOn = function(trail, have, x, y) {
        for (let k = 0; k < have; k++) {
            const at = entryOf(trail, spots[k]);
            if (trail.x[at] === x && trail.y[at] === y) return true;
        }
        return false;
    };

    /**
     * The next place of the file nobody has, from a follower's turn on: tiles
     * back from the leader, or -1 where the trail is not that long yet. Where
     * the leader turned back the trail crosses itself: a tile the leader
     * stands on, or one that is somebody's place already, is passed over.
     */
    Game_Followers.prototype.rrFilePlace = function(trail, turn, spacing, round) {
        const player = $gamePlayer;
        for (let place = turn + 1; place * spacing < trail.n; place++) {
            if (filed[place]) continue;
            const at = entryOf(trail, place * spacing), x = trail.x[at], y = trail.y[at];
            if (player.pos(x, y) || this.rrClaimed(round, x, y)) continue;
            filed[place] = true;
            return place * spacing;
        }
        return -1;
    };

    /** Works out every follower's place from the trail as it is. */
    Game_Followers.prototype.rrAssign = function(trail) {
        trail.dirty = false;
        const data = this._data, settings = this.formation(), spacing = settings.spacing;
        const scattered = settings.formation === "scattered";
        const count = this.rrHoldPlaces();
        const places = scattered ? null : placesOf(settings.formation, count);
        const player = $gamePlayer;
        const round = trail.round = (trail.round || 0) % 1000000 + 1;
        // A file hands out its places in the order of the line; any other formation its places beside the trail
        // by the place each follower holds, then those on the trail in the order the followers stand along it.
        const zip = this.rrTrades();
        const lineCount = this.rrLineUp(trail, !zip);
        // The file has a place every `spacing` tiles for as far back as the trail goes.
        const most = Math.max(count, Math.floor((trail.n - 1) / spacing));
        for (let k = 0; k <= most; k++) filed[k] = false;
        for (let i = 0; i < data.length; i++) wants[i] = -2;
        // In the order of the places held: two that trade places exchange them exactly, whatever narrows either.
        for (let n = 0; n < order.length; n++) {
            const i = order[n], follower = data[i];
            const visible = follower.isVisible();
            const slot = visible ? follower._rrSlot : i;
            let back = -1, side = 0, named = -1;
            if (visible && !(follower._rrFile > trail.seq)) {
                let row, want;
                if (scattered) {
                    const spot = this.rrSpotOf(follower, i, spacing);
                    row = spot[0];
                    want = spot[1];
                } else {
                    row = places.rows[slot] * spacing;
                    want = places.lats[slot] * spacing;
                }
                if (row < trail.n) {
                    const at = entryOf(trail, row);
                    if (want === 0) {
                        if (zip) {
                            named = row;
                        } else if (!player.pos(trail.x[at], trail.y[at]) && !this.rrClaimed(round, trail.x[at], trail.y[at])) {
                            back = row;
                            follower._rrFiled = false;
                            // A place on the trail is a place of the file too.
                            if (row % spacing === 0) filed[row / spacing] = true;
                        }
                    } else {
                        const way = headingAt(trail, row), toward = sign(want);
                        const ux = -way.y * toward, uy = way.x * toward;
                        let reach = Math.min(Math.abs(want), this.rrOpenBeside(trail, row, toward, Math.abs(want)));
                        for (; reach > 0; reach--) {
                            const x = $gameMap.roundX(trail.x[at] + ux * reach), y = $gameMap.roundY(trail.y[at] + uy * reach);
                            if (player.pos(x, y) || this.rrClaimed(round, x, y)) continue;
                            if (Game_CharacterBase.prototype.isCollidedWithCharacters.call(follower, x, y)) continue;
                            back = row;
                            side = toward * reach;
                            follower._rrFiled = false;
                            follower._rrTx = x;
                            follower._rrTy = y;
                            follower._rrTh = floorAt(x, y, trail.h[at]);
                            break;
                        }
                    }
                }
            }
            if (side === 0 && zip && visible) {
                // Its place is on the trail: handed out with the others there, below.
                wants[i] = named;
                follower._rrRound = 0;
                continue;
            }
            if (side === 0) {
                if (back < 0) follower._rrFiled = true;
                if (back < 0) back = visible ? this.rrFilePlace(trail, turns[i], spacing, round) : Math.min(trail.n - 1, (i + 1) * spacing);
                // No place yet: the trail is shorter than the file. Settled once the others have theirs.
                if (back < 0) { follower._rrRound = -round; continue; }
                const at = entryOf(trail, back);
                follower._rrTx = trail.x[at];
                follower._rrTy = trail.y[at];
                follower._rrTh = trail.h[at];
            }
            follower._rrTq = trail.seq - back;
            follower._rrTl = side;
            follower._rrRound = round;
        }
        if (zip) this.rrPlaceOnTrail(trail, lineCount, spacing, round);
        // The trail does not reach back to these followers' places yet (the party has only just set off): one
        // beside the end of the trail waits where it stands; one further off, on the leader or on somebody's
        // place makes for the end of the trail.
        const last = entryOf(trail, trail.n - 1);
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrRound !== -round) continue;
            const near = Math.abs($gameMap.deltaX(follower.x, trail.x[last])) <= 1 && Math.abs($gameMap.deltaY(follower.y, trail.y[last])) <= 1;
            const here = near && !player.pos(follower.x, follower.y) && !this.rrClaimed(round, follower.x, follower.y);
            follower._rrTx = here ? follower.x : trail.x[last];
            follower._rrTy = here ? follower.y : trail.y[last];
            follower._rrTh = here ? heightOf(follower) : trail.h[last];
            follower._rrTq = trail.seq - (trail.n - 1);
            follower._rrTl = 0;
            follower._rrRound = round;
        }
    };

    //-------------------------------------------------------------------------
    // One frame of a formation, and each follower's decisions.

    /** Where a follower is on the trail, as tiles back from the leader: -1 when it is not on the tile it remembers. */
    const backOf = function(trail, follower) {
        if (!(follower._rrOn >= 0)) return -1;
        const back = trail.seq - follower._rrOn;
        if (back < 0 || back >= trail.n) return -1;
        const at = entryOf(trail, back);
        return trail.x[at] === follower.x && trail.y[at] === follower.y && sameFloor(heightOf(follower), trail.h[at]) ? back : -1;
    };

    /**
     * Looks for a follower's tile on the trail; it then knows its place on
     * it. Where the leader turned back the trail crosses itself and a tile
     * is on it more than once: the one nearest the tile `near` back from the
     * leader is taken (nearest the leader, where none is named).
     */
    Game_Followers.prototype.rrFindOnTrail = function(trail, follower, near) {
        const from = near > 0 ? Math.min(near, trail.n - 1) : 0, height = heightOf(follower);
        for (let off = 0; off < trail.n; off++) {
            for (let side = off ? -1 : 1; side <= 1; side += 2) {
                const back = from + off * side;
                if (back < 0 || back >= trail.n) continue;
                const at = entryOf(trail, back);
                if (trail.x[at] === follower.x && trail.y[at] === follower.y && sameFloor(height, trail.h[at])) {
                    follower._rrOn = trail.seq - back;
                    return back;
                }
            }
        }
        follower._rrOn = -1;
        return -1;
    };

    // A follower `back` tiles along the trail whose place is counted from `goal`: where the trail crosses itself
    // between the two its tile is on the trail again nearer its place, and it is there.
    const nearerOnTrail = function(trail, follower, back, goal) {
        const gap = Math.abs(back - goal), height = heightOf(follower);
        for (let off = 0; off < gap; off++) {
            for (let side = off ? -1 : 1; side <= 1; side += 2) {
                const other = goal + off * side;
                if (other < 0 || other >= trail.n) continue;
                const at = entryOf(trail, other);
                if (trail.x[at] === follower.x && trail.y[at] === follower.y && sameFloor(height, trail.h[at])) {
                    follower._rrOn = trail.seq - other;
                    return other;
                }
            }
        }
        return back;
    };

    /** Whether a follower is to decide its next step: it follows, stands still off its place, and is not waiting. */
    Game_Followers.prototype.rrNeedsStep = function(follower) {
        if (follower._rrOrder || follower._rrWait > 0 || follower.isMoving() || follower.isJumping() || follower.isMoveRouteForcing()) return false;
        return !inPlace(follower);
    };

    Game_Followers.prototype.rrTick = function() {
        const trail = this.rrTrail(), player = $gamePlayer, data = this._data;
        if (trail.stale) {
            // Something else had the followers (a battle on the map, the walk back after it): once the step is
            // let through again the trail is made anew from where they stand.
            this._rrAsk = true;
            this.updateMove();
            if (!this._rrAsk) this._rrTrail = null;
            this._rrAsk = false;
            return;
        }
        const head = trail.head;
        if (trail.x[head] !== player.x || trail.y[head] !== player.y) {
            const dx = Math.abs($gameMap.deltaX(player.x, trail.x[head])), dy = Math.abs($gameMap.deltaY(player.y, trail.y[head]));
            if (dx > 1 || dy > 1) {
                // Put somewhere else (a jump, Set Location): the way there was not walked.
                this._rrTrail = null;
                return;
            }
            pushTrail(trail, player.x, player.y, groundOf(player));
            trail.still = 0;
            // The leader walks on: the line closes over whoever has left it.
            this._rrGap = false;
            this._rrRally = false;
        } else {
            trail.h[head] = groundOf(player);
            trail.still++;
        }
        if (this.formation().formation === "scattered" && trail.still > 30) {
            // While the leader stands, a scattered follower moves to another spot now and then.
            for (let i = 0; i < data.length; i++) {
                const follower = data[i];
                if (follower._rrOrder || !follower._rrSpot || --follower._rrRoam > 0) continue;
                follower._rrSpot = null;
                follower._rrTraded = 0;
                trail.dirty = true;
            }
        }
        // While somebody has left the line and the leader stands, everybody keeps the place it has (`rrLeaveLine`).
        if (trail.dirty && !this._rrGap) this.rrAssign(trail);
        let ask = false, settled = true;
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (follower._rrOrder) continue;
            if (follower._rrWait > 0) { follower._rrWait--; settled = false; continue; }
            if (onOwnWalk(follower)) {
                // A walk of its own to the trail ends where a ladder, a ledge or the water takes it (there it follows
                // the one ahead), and when it has stood waiting for somebody in its way long enough.
                if (follower.isMoving()) follower._rrIdle = 0;
                else follower._rrIdle = (follower._rrIdle || 0) + 1;
                if (this.rrClimbs(follower) || follower._rrIdle > Game_Followers.WALK_PATIENCE) {
                    follower._rrIdle = 0;
                    follower._rrWalked = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
                    follower.rrEndRoute();
                } else if (follower._rrIdle === Game_Followers.WALK_BLOCKED) {
                    this.rrWalkHeldUp(follower);
                }
            }
            if (follower.isMoving() || follower.isJumping() || follower.isMoveRouteForcing()) { settled = false; continue; }
            if (inPlace(follower)) {
                follower._rrGo = false;
                follower._rrRun = false;
                follower._rrStuck = 0;
                follower._rrRefused = 0;
                // In its place, what a walk of its own once failed at is history: the next is asked for at once.
                // (Written only when there is something to forget: this runs every frame the follower stands.)
                if (follower._rrAgain > 0) {
                    follower._rrWalkedFrom = -1;
                    follower._rrAgain = 0;
                }
                follower._rrDelay = -1;
                if (follower._rrFile > trail.seq && follower._rrFileTried !== trail.seq && trail.still > Game_Followers.CLOSE_FRAMES) {
                    // In the place in the file it took because its own could not be come to, with the leader
                    // standing: it tries for its own once more from here (what parted them may be behind it).
                    follower._rrFile = 0;
                    follower._rrFileTried = trail.seq;
                    trail.dirty = true;
                }
                if (follower._rrTl === 0) follower._rrOn = follower._rrTq;
                else { follower._rrOn = -1; settled = false; }
                continue;
            }
            settled = false;
            if (!follower.isVisible()) {
                // Nobody sees it: it is simply in its place.
                Game_CharacterBase.prototype.locate.call(follower, follower._rrTx, follower._rrTy);
                follower._rrOn = follower._rrTq;
                continue;
            }
            ask = true;
        }
        if (ask) {
            this._rrAsk = true;
            this.updateMove();
            if (this._rrAsk) { this._rrAsk = false; trail.stale = true; }
        } else if (settled && this._rrGap && !this._rrHeld && !this._rrUnseen) {
            // Everybody is back in the line and in its place: the line is whole again.
            this._rrGap = false;
        } else if (settled && this._rrSettling && !this._rrGap && !this.formation().active) {
            // Every follower is in its place in the file: the stock step takes it from here.
            this._rrSettling = false;
            this._rrTrail = null;
        }
    };

    /** A follower's next step toward its place. */
    Game_Followers.prototype.rrDecide = function(follower, index) {
        const trail = this._rrTrail;
        if (!trail || trail.stale) return;
        follower._rrPassing = false;
        const player = $gamePlayer, settings = this.formation();
        const dx = $gameMap.deltaX(follower._rrTx, follower.x), dy = $gameMap.deltaY(follower._rrTy, follower.y);
        const far = Math.max(Math.abs(dx), Math.abs(dy));
        const away = Math.max(Math.abs($gameMap.deltaX(player.x, follower.x)), Math.abs($gameMap.deltaY(player.y, follower.y)));
        if (away > Game_Followers.BRING_DISTANCE + (index + 1) * settings.spacing) {
            this.rrBring(follower, trail);
            return;
        }
        const goal = trail.seq - follower._rrTq;
        if (map3D() && !sameFloor(floorAt(follower._rrTx, follower._rrTy, heightOf(follower)), follower._rrTh)) {
            // Its place is on another floor (up the stairs the leader took, on the bridge it crossed): the way there
            // is the trail, not the ground under it.
            let on = backOf(trail, follower);
            if (on < 0) on = this.rrFindOnTrail(trail, follower, goal);
            else if (on !== goal) on = nearerOnTrail(trail, follower, on, goal);
            if (on >= 0) {
                if (on !== goal) this.rrTrailStep(follower, trail, on, goal);
                else follower._rrWait = Game_Followers.RETRY_WAIT;
            } else {
                this.rrWalkToTrail(follower, trail, goal);
            }
            return;
        }
        // It lets its place get ahead by its own slack, and takes its own time to start.
        const loose = settings.formation === "loose" ? Game_Followers.LOOSE_STRAGGLE
            : settings.formation === "scattered" ? Game_Followers.SCATTER_STRAGGLE : 0;
        const straggle = Math.max(settings.straggle, loose) / 100;
        // While the leader walks; once it has stood a moment everybody closes up.
        const slack = trail.still > Game_Followers.CLOSE_FRAMES ? 1 : 1 + Math.round(straggle * 2 * share(index, 1));
        if (!follower._rrGo) {
            if (far < slack) return;
            if (follower._rrDelay < 0) follower._rrDelay = Math.round(straggle * (4 + 20 * share(index, 2)));
            if (follower._rrDelay > 0) { follower._rrDelay--; return; }
            follower._rrDelay = -1;
            follower._rrGo = true;
        }
        // Further behind than that it hurries until it is back in its place.
        follower._rrRun = far > Math.min(slack, Game_Followers.RUN_DISTANCE) || (follower._rrRun && far > 1);
        let back = backOf(trail, follower);
        // One that took to the trail because its own way was shut keeps to it until the tile its place is counted from.
        if (follower._rrByTrail && follower._rrByUntil > 0 && trail.seq > follower._rrByUntil) follower._rrByTrail = false;
        if (back < 0 && follower._rrByTrail) back = this.rrFindOnTrail(trail, follower, goal);
        else if (back >= 0 && back !== goal) back = nearerOnTrail(trail, follower, back, goal);
        if (back < 0 || back === goal) follower._rrByTrail = false;
        if (back >= 0 && back !== goal && (follower._rrTl === 0 || follower._rrByTrail)) {
            // Ahead of its place while the leader walks: the place comes to it. It walks back once the leader stands.
            if (follower._rrByTrail || back > goal || trail.still > Game_Followers.CLOSE_FRAMES) this.rrTrailStep(follower, trail, back, goal);
            return;
        }
        if (follower._rrTl === 0 && trail.still <= Game_Followers.CLOSE_FRAMES) {
            // Beside the trail with its place in the file behind it: it lets the place come level before it steps in.
            const way = headingAt(trail, goal);
            if (dx * way.x + dy * way.y < 0) return;
        }
        if (this.rrFreeStep(follower, dx, dy)) {
            follower._rrOn = -1;
            follower._rrStuck = 0;
            follower._rrPatience = 0;
            follower._rrRefused = 0;
            this.rrPace(follower);
            return;
        }
        const other = this.rrBlocker(follower, dx, dy);
        if (other && !other._rrOrder) {
            // A member in the way. One that is walking is waited for. One that stands in its own place, or that
            // is itself stopped by this follower, trades places with it: the nearer takes the nearer place, and
            // nobody walks through anybody. A file keeps its order: there the trail is the way past.
            const settled = inPlace(other);
            const facing = !settled && $gameMap.roundX(other.x + sign($gameMap.deltaX(other._rrTx, other.x))) === follower.x
                && $gameMap.roundY(other.y + sign($gameMap.deltaY(other._rrTy, other.y))) === follower.y;
            if (other.isMoving()) { follower._rrWait = 2; return; }
            const trades = this.rrMayTrade(follower, other);
            if (trades && (settled || facing)) { this.rrTrade(follower, other); return; }
            // One that is held up itself is waited for, for a while; then the two trade all the same.
            if (trades && ++follower._rrPatience < Game_Followers.PATIENCE) { follower._rrWait = 4; return; }
            follower._rrPatience = 0;
            if (trades) { this.rrTrade(follower, other); return; }
            follower._rrStuck = Game_Followers.STUCK_TRIES;
        }
        // Refused: again shortly, and after a few tries by the trail, which is always open.
        follower._rrWait = Game_Followers.RETRY_WAIT;
        if (++follower._rrStuck < Game_Followers.STUCK_TRIES) return;
        follower._rrStuck = 0;
        if (back < 0) back = this.rrFindOnTrail(trail, follower, goal);
        if (back >= 0) {
            if (back !== goal) {
                follower._rrByTrail = true;
                follower._rrByUntil = 0;
                follower._rrWait = 0;
                this.rrTrailStep(follower, trail, back, goal);
            } else if (follower._rrTl !== 0) {
                // On the tile its place is counted from, and the way sideways is shut after all.
                this.rrNarrow(follower, trail);
            }
            return;
        }
        // Off the trail with no way on: to the trail by a path.
        this.rrWalkToTrail(follower, trail, goal);
    };

    /** A follower that cannot come to its place beside the trail has a place in the file until the party has walked on a few tiles. */
    Game_Followers.prototype.rrNarrow = function(follower, trail) {
        follower._rrFile = trail.seq + Game_Followers.NARROW_STEPS;
        trail.dirty = true;
    };

    /**
     * A follower off the trail walks to it by a path of its own: to the tile
     * its place is counted from, or the nearest tile behind that which
     * nobody stands on and, on a 3D map, is on the level the follower stands
     * on (the foot of the stairs, not the landing over its head; the top of
     * the ledge the leader dropped off, not the ground below it).
     */
    Game_Followers.prototype.rrWalkToTrail = function(follower, trail, goal) {
        const height = heightOf(follower), frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
        follower._rrWait = Game_Followers.RETRY_WAIT;
        // A walk that found no way is not asked for again at once: the way is looked for over the whole neighbourhood.
        if (frame - follower._rrWalked < (follower._rrAgain || Game_Followers.WALK_AGAIN) && frame >= follower._rrWalked) return;
        // First the tiles of the trail on the level it stands on (from the tile before a ledge the leader dropped
        // off it takes the trail down as the leader did; the landing over its head is not its floor); where the
        // trail has none there, any tile of it a whole way leads to (down the slope of what it stands on).
        for (let pass = 0; pass < 2; pass++) {
            for (let back = Math.max(0, goal); back < trail.n; back++) {
                const at = entryOf(trail, back), x = trail.x[at], y = trail.y[at];
                if (sameFloor(height, trail.h[at]) !== (pass === 0)) continue;
                if (!sameFloor(floorAt(x, y, height), trail.h[at]) || this.rrMemberAt(x, y, follower)) continue;
                if (follower.pos(x, y)) return;
                this.rrWalkTo(follower, trail, x, y, trail.h[at], frame);
                return;
            }
        }
    };

    /** Begins a follower's own walk to a tile of the trail: the whole way or none, and never a long way round. */
    Game_Followers.prototype.rrWalkTo = function(follower, trail, x, y, height, frame) {
        const route = Game_Character.walkRoute(x, y, true, map3D() ? height : undefined, Game_Followers.WALK_MOST);
        // The formation's own: it may end this walk; a route a plugin or a script gave the follower it may not.
        route.rrOwn = true;
        follower.forceMoveRoute(route);
        follower._rrPassing = false;
        follower._rrHeldUp = 0;
        // Asked again from the tile the last walk began on: that walk got nowhere. The next is asked for later
        // each time, and at the longest wait at once where it would be to the same tile again.
        const here = follower.y * $gameMap.width() + follower.x, to = y * $gameMap.width() + x, nowhere = follower._rrWalkedFrom === here;
        follower._rrAgain = !nowhere ? Game_Followers.WALK_AGAIN : follower._rrWalkedTo === to ? Game_Followers.WALK_AGAIN_LONGEST
            : Math.min(Game_Followers.WALK_AGAIN_LONGEST, (follower._rrAgain || Game_Followers.WALK_AGAIN) * 2);
        follower._rrWalkedTo = to;
        // The last walk from this tile got nowhere: the place beside the trail is given up for one in the file.
        if (nowhere && follower._rrTl !== 0) this.rrNarrow(follower, trail);
        follower._rrWalkedFrom = here;
        follower._rrWalked = frame;
        follower._rrIdle = 0;
        follower._rrWait = 0;
        // On the trail it keeps to it as far as the tile its place is counted from, or until the party has walked
        // on a few tiles (what was in its way is behind it then).
        follower._rrByTrail = true;
        follower._rrByUntil = trail.seq + Game_Followers.NARROW_STEPS;
    };

    /**
     * A follower's own walk stands, with a member that follows as it does
     * standing in the way (the walk was planned through it, as through one
     * that moves on): the two trade places where that changes anything and
     * the walk is over, else the rest of the walk passes the members that
     * stand, as a file folds through itself.
     */
    Game_Followers.prototype.rrWalkHeldUp = function(follower) {
        const d = follower._rrHeldUp;
        if (!follower._reactorWalk || !d) return;
        const other = this.rrFollowerAt($gameMap.roundXWithDirection(follower.x, d), $gameMap.roundYWithDirection(follower.y, d), follower);
        if (!other || other._rrOrder || other.isMoving()) return;
        if (inPlace(other) && this.rrMayTrade(follower, other)) this.rrTrade(follower, other);
        else follower._rrPassing = true;
    };

    // The lead a follower on the trail is given: the next tile of the trail, at the height the leader had there.
    const trailLead = { x: 0, y: 0, _x: 0, _y: 0, _reactorAlt: 0, _reactorGround: 0, _reactorMantle: null, _reactorOnLadder: false };

    /** One step along the trail toward the tile `goal` back from the leader: as the leader walked it. */
    Game_Followers.prototype.rrTrailStep = function(follower, trail, back, goal) {
        const next = back > goal ? back - 1 : back + 1, at = entryOf(trail, next);
        const other = this.rrFollowerAt(trail.x[at], trail.y[at], follower);
        if (other && !other._rrOrder) {
            // Coming the other way: its own place is counted from this follower's side of the tile it stands on.
            const meets = !other.isMoving() && other._rrTl === 0 && sign(trail.seq - other._rrTq - next) === sign(back - next);
            if (!other.isMoving() && (meets || inPlace(other))) {
                // A member standing in its own place on the trail, or one met head-on: the two trade places. A
                // file keeps its order and folds through itself, as the stock file does when the leader turns back.
                if (this.rrMayTrade(follower, other)) { this.rrTrade(follower, other); return; }
            } else if (next > back && !other.isMoving() && other._rrRefused > 0) {
                // Back along the trail, the one before it stands held up (before the face of a ledge the leader
                // came down, or behind one that is): it is not walked into, they would stand in each other at
                // the foot of the ledge. Asked again later, and later each time.
                follower._rrRefused = Math.min(Game_Followers.REFUSED_MOST, (follower._rrRefused || 0) + 1);
                follower._rrWait = Game_Followers.RETRY_WAIT * follower._rrRefused;
                return;
            } else if (++follower._rrPatience < Game_Followers.PATIENCE) {
                // One on its way is given the time to move on: a gap stretches, nobody walks into the one ahead,
                // and when the way is clear each sets off in its own time.
                follower._rrWait = 2;
                follower._rrGo = false;
                return;
            }
        }
        trailLead.x = trailLead._x = trail.x[at];
        trailLead.y = trailLead._y = trail.y[at];
        trailLead._reactorAlt = trailLead._reactorGround = trail.h[at];
        const x = follower.x, y = follower.y;
        // Toward the leader it walks the trail as the leader did (down the ledge it dropped off, up the one it
        // climbed). Back along it (it stands ahead of its place) it walks over ground it can walk: never up the
        // face of a ledge the leader came down.
        if (next < back || follower.rrGroundAllowsToward(trail.x[at], trail.y[at])) {
            this._rrLead = true;
            follower.chaseCharacter(trailLead);
            this._rrLead = false;
        }
        if (follower.x !== x || follower.y !== y) {
            follower._rrOn = trail.seq - next;
            follower._rrStuck = 0;
            follower._rrPatience = 0;
            follower._rrRefused = 0;
            this.rrPace(follower);
        } else {
            // The step was not taken (a ledge the leader dropped off is no way back up): asked again later, and
            // later each time, never every frame.
            follower._rrRefused = Math.min(Game_Followers.REFUSED_MOST, (follower._rrRefused || 0) + 1);
            follower._rrWait = Game_Followers.RETRY_WAIT * follower._rrRefused;
        }
    };

    /** A step of a follower's own toward a tile (dx, dy) away: the diagonal, else along the longer way, else the other. */
    Game_Followers.prototype.rrFreeStep = function(follower, dx, dy) {
        const horz = dx > 0 ? 6 : 4, vert = dy > 0 ? 2 : 8;
        if (dx && dy && follower.rrAllowsDiagonal(horz, vert)) {
            follower.moveDiagonally(horz, vert);
            if (follower.isMovementSucceeded()) return true;
        }
        const first = Math.abs(dx) >= Math.abs(dy) ? (dx ? horz : vert) : (dy ? vert : horz);
        const second = first === horz ? (dy ? vert : 0) : (dx ? horz : 0);
        if (follower.reactorWalkAllows(follower.x, follower.y, first)) {
            follower.moveStraight(first);
            if (follower.isMovementSucceeded()) return true;
        }
        if (second && follower.reactorWalkAllows(follower.x, follower.y, second)) {
            follower.moveStraight(second);
            if (follower.isMovementSucceeded()) return true;
        }
        return false;
    };

    /** The pace of a follower's step: the leader's, a notch faster while it runs to catch up. */
    Game_Followers.prototype.rrPace = function(follower) {
        const pace = $gamePlayer.realMoveSpeed();
        follower.setMoveSpeed(follower._rrRun ? Math.min(6, pace + 1) : pace);
    };

    /**
     * The party crossed into a neighboring map with no break: the trail, each follower's place and any
     * walk it was on move with it into the entered map's tiles, so the line keeps walking the way the
     * leader came. A follower still past the border walks back onto the map (canPass below).
     */
    Game_Followers.prototype.rrShift = function(dx, dy) {
        const trail = this._rrTrail;
        if (trail) {
            for (let i = 0; i < trail.cap; i++) { trail.x[i] += dx; trail.y[i] += dy; }
            trail.dirty = true;
        }
        for (const follower of this._data) {
            follower._x += dx; follower._y += dy;
            follower._realX += dx; follower._realY += dy;
            if (follower._rrTx !== undefined) { follower._rrTx += dx; follower._rrTy += dy; }
            const walk = follower._reactorWalk;
            if (walk) { walk.x += dx; walk.y += dy; }
        }
    };

    // How many steps a tile lies past the map's edges: 0 on the map.
    const pastEdge = (x, y) => Math.max(0, -x, x - ($gameMap.width() - 1)) + Math.max(0, -y, y - ($gameMap.height() - 1));
    const baseCanPass = Game_Follower.prototype.canPass;
    /** A follower left past the border by a crossing steps back toward the map, over the ground the leader came by. */
    Game_Follower.prototype.canPass = function(x, y, d) {
        if (!$gameMap.isValid(x, y)) return pastEdge($gameMap.roundXWithDirection(x, d), $gameMap.roundYWithDirection(y, d)) < pastEdge(x, y);
        return baseCanPass.call(this, x, y, d);
    };

    /** A follower left too far behind is put on its place in the file, on the first tile of it nobody stands on, and fades in. */
    Game_Followers.prototype.rrBring = function(follower, trail) {
        const index = this._data.indexOf(follower), spacing = this.formation().spacing;
        let back = Math.min(trail.n - 1, (index + 1) * spacing);
        for (let tries = 0; tries < 6 && back < trail.n - 1; tries++, back++) {
            const at = entryOf(trail, back);
            if (!Game_CharacterBase.prototype.isCollidedWithCharacters.call(follower, trail.x[at], trail.y[at])) break;
        }
        const at = entryOf(trail, back);
        Game_CharacterBase.prototype.locate.call(follower, trail.x[at], trail.y[at]);
        follower.setDirection($gamePlayer.direction());
        if (map3D()) follower._reactorGround = trail.h[at];
        this.rrForget(follower);
        follower._rrOn = trail.seq - back;
        follower._rrAppear = Game_Followers.APPEAR_FRAMES;
        trail.dirty = true;
    };

    //-------------------------------------------------------------------------
    // Aboard a vehicle that carries nobody but its rider, the followers in the
    // line fade where they stand and are unseen until the party is on foot
    // again. One under an order keeps its place, seen and solid, and is not
    // brought back; one whose order ends during the ride goes aboard too.

    /**
     * The party goes aboard such a vehicle (`on` true) or is back on foot (`on` false): with `instant`, without the
     * fade. Back on foot the followers stand on the leader's tile. It reads no event and ends no order, so a
     * transfer and a battle that starts aboard may call it.
     */
    Game_Followers.prototype.rrAboard = function(on, instant) {
        const player = $gamePlayer, frames = instant ? 0 : Game_Followers.APPEAR_FRAMES;
        this._rrAboard = !!on;
        for (const follower of this._data) {
            if (on) {
                if (follower._rrOrder || follower._rrAboard) continue;
                follower._rrAboard = true;
                follower._rrLeave = frames;
                follower._rrAppear = 0;
            } else if (follower._rrAboard) {
                follower._rrAboard = false;
                follower._rrLeave = 0;
                if (follower._rrOrder) continue;
                Game_CharacterBase.prototype.locate.call(follower, player.x, player.y);
                follower.setDirection(player.direction());
                follower._reactorGround = player._reactorGround;
                this.rrForget(follower);
                follower._rrAppear = frames;
                if (frames) follower.setOpacity(0);
            }
        }
        this._rrTrail = null;
    };

    //-------------------------------------------------------------------------
    // Members as bodies: a follower that walks by itself goes round the
    // others, and one that stays put is in the leader's way too.

    /** Whether the leader or a follower that is seen stands on a tile, at a height that meets `self` (which is left out). */
    Game_Followers.prototype.rrMemberAt = function(x, y, self) {
        const player = $gamePlayer, world = typeof Reactor3D !== "undefined" && Reactor3D.charactersOverlapVertically ? Reactor3D : null;
        if (player !== self && player.pos(x, y) && (!world || world.charactersOverlapVertically(self, player))) return true;
        const data = this._data;
        for (let i = 0; i < data.length; i++) {
            const other = data[i];
            if (other !== self && other.pos(x, y) && other.isVisible() && (!world || world.charactersOverlapVertically(self, other))) return true;
        }
        return false;
    };

    /** The follower that is seen on a tile, other than `self`; null where there is none. */
    Game_Followers.prototype.rrFollowerAt = function(x, y, self) {
        const data = this._data;
        for (let i = 0; i < data.length; i++) {
            const other = data[i];
            if (other !== self && other.pos(x, y) && other.isVisible()) return other;
        }
        return null;
    };

    /** Whether a follower that has been told to stay, to go somewhere or to walk a route stands on a tile. */
    Game_Followers.prototype.rrHeldAt = function(x, y, self) {
        if (!this._rrHeld) return false;
        const data = this._data, world = typeof Reactor3D !== "undefined" && Reactor3D.charactersOverlapVertically ? Reactor3D : null;
        for (let i = 0; i < data.length; i++) {
            const other = data[i];
            if (other._rrOrder && other.pos(x, y) && other.isVisible() && (!world || !self || world.charactersOverlapVertically(self, other))) return true;
        }
        return false;
    };

    // The leader walks through its followers, but not through one that has been told to stay somewhere.
    Game_Player.prototype.isCollidedWithCharacters = function(x, y) {
        return Game_Character.prototype.isCollidedWithCharacters.call(this, x, y) || this._followers.rrHeldAt(x, y, this);
    };

    // A follower walking to its place beside the trail goes round the other members; one trailing the leader is
    // walked through and never asks. One on a route steps through the party as a follower always has: no member
    // can refuse a step of its route, so the route and the event that waits for it are never held up by the line
    // it stepped out of. One sent to a tile or called back steps through the members that follow (they may stand
    // all round it) and goes round the leader and whoever stays put.
    Game_Follower.prototype.isCollidedWithCharacters = function(x, y) {
        if (Game_Character.prototype.isCollidedWithCharacters.call(this, x, y)) return true;
        if (!(this._rrSolid || this._rrOrder) || fightHere()) return false;
        const order = this._rrOrder;
        if (order && order.type === "route") return false;
        const followers = $gamePlayer.followers();
        if (order) {
            const leader = $gamePlayer;
            return followers.rrHeldAt(x, y, this) || (leader.pos(x, y)
                && (typeof Reactor3D === "undefined" || !Reactor3D.charactersOverlapVertically || Reactor3D.charactersOverlapVertically(this, leader)));
        }
        if (planner !== this && !(this._rrPassing && this._moveRouteForcing)) return followers.rrMemberAt(x, y, this);
        const player = $gamePlayer;
        return followers.rrHeldAt(x, y, this) || (!player.isMoving() && player.pos(x, y)
            && (typeof Reactor3D === "undefined" || !Reactor3D.charactersOverlapVertically || Reactor3D.charactersOverlapVertically(this, player)));
    };

    // The follower whose walk back to the line is being planned. The way is planned through the members that
    // follow as it does (they move on: the doorway they stand in is still the way), round one that is held and
    // round the leader while it stands; each step is then taken only where nobody stands. A walk it was ordered
    // on goes round everybody.
    let planner = null;
    Game_Follower.prototype.reactorWalkStep = function(x, y, d, height) {
        const before = planner;
        planner = this._rrOrder ? null : this;
        try {
            return Game_Character.prototype.reactorWalkStep.call(this, x, y, d, height);
        } finally {
            planner = before;
        }
    };

    // A follower told to stay takes no step, whoever asks (the ladder its leader climbed, a walk back after a battle).
    Game_Follower.prototype.moveStraight = function(d) {
        if (this._rrOrder && this._rrOrder.type === "stay") this.setMovementSuccess(false);
        else Game_Character.prototype.moveStraight.call(this, d);
    };

    Game_Follower.prototype.moveDiagonally = function(horz, vert) {
        if (this._rrOrder && this._rrOrder.type === "stay") this.setMovementSuccess(false);
        else Game_Character.prototype.moveDiagonally.call(this, horz, vert);
    };

    /** A walk's step for a follower: as a body nothing is walked through, and never off a roof. */
    Game_Follower.prototype.reactorWalkAllows = function(x, y, d) {
        const through = this._through, solid = this._rrSolid;
        this._through = false;
        this._rrSolid = true;
        let allowed = false;
        try {
            allowed = this.canPass(x, y, d) && !(typeof ReactorPhysics !== "undefined" && ReactorPhysics.walksOff && ReactorPhysics.walksOff(this, x, y, d));
        } finally {
            this._through = through;
            this._rrSolid = solid;
        }
        // The step its own walk was refused (not one tried while the way was planned): who stands there is asked later.
        if (planner !== this && this._reactorWalk && x === this.x && y === this.y) this._rrHeldUp = allowed ? 0 : d;
        return allowed;
    };

    /** Whether the ground lets a follower step toward a tile beside it, whoever stands there: both ways of a diagonal. */
    Game_Follower.prototype.rrGroundAllowsToward = function(x, y) {
        const dx = $gameMap.deltaX(x, this.x), dy = $gameMap.deltaY(y, this.y);
        const physics = typeof ReactorPhysics !== "undefined" && ReactorPhysics.walksOff ? ReactorPhysics : null;
        const through = this._through;
        this._through = false;
        try {
            for (const d of [dx > 0 ? 6 : dx < 0 ? 4 : 0, dy > 0 ? 2 : dy < 0 ? 8 : 0]) {
                if (d && (!this.isMapPassable(this.x, this.y, d) || (physics && physics.walksOff(this, this.x, this.y, d)))) return false;
            }
            return true;
        } finally {
            this._through = through;
        }
    };

    Game_Follower.prototype.rrAllowsDiagonal = function(horz, vert) {
        const through = this._through, solid = this._rrSolid;
        this._through = false;
        this._rrSolid = true;
        try {
            const physics = typeof ReactorPhysics !== "undefined" && ReactorPhysics.walksOff ? ReactorPhysics : null;
            if (physics && (physics.walksOff(this, this.x, this.y, horz) || physics.walksOff(this, this.x, this.y, vert))) return false;
            return this.canPassDiagonally(this.x, this.y, horz, vert);
        } finally {
            this._through = through;
            this._rrSolid = solid;
        }
    };

    //-------------------------------------------------------------------------
    // Orders: a follower told to stay, to go to a tile or to walk a route is
    // on its own until it is told to follow again, a transfer, a gather or a
    // battle on the map. An order and Hide are given to a person: the body
    // keeps standing for that actor when the party's order changes.

    /** Whether a follower is on its own: it does not trail the leader. */
    Game_Follower.prototype.rrIsHeld = function() {
        return !!this._rrOrder;
    };

    Game_Followers.prototype.rrCountHeld = function() {
        let held = 0, unseen = 0;
        for (const follower of this._data) {
            if (follower._rrOrder) held++;
            if (follower._rrHidden) unseen++;
            // Who it stands for while it is out of the line.
            if (!follower._rrOrder && !follower._rrHidden) follower._rrActorId = 0;
            else if (!follower._rrActorId && follower.actor()) follower._rrActorId = follower.actor().actorId();
        }
        this._rrHeld = held;
        this._rrUnseen = unseen;
        if (this._rrTrail) this._rrTrail.dirty = true;
    };

    /**
     * A follower leaves the line (told to stay or to go somewhere, given a
     * route, hidden). The others keep the places they have until the leader
     * walks on, then close up over the gap; told to follow before that, it
     * walks back to the place it left and nobody else has moved. The stock
     * file has no trail: the line as it stands is the way the party came.
     */
    Game_Followers.prototype.rrLeaveLine = function() {
        this._rrSettling = true;
        if (this._rrRally) {
            // The party is still coming together after a battle on the map: nobody stands in a place to keep.
            this._rrGap = false;
        } else {
            // Each time the line is left standing anew: a place kept from an earlier time is no place in this line.
            if (!this._rrGap) this._rrGapId = (this._rrGapId || 0) % 1000000 + 1;
            this._rrGap = true;
        }
        if (!this._rrTrail && typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer._followers === this && this.rrIsActive()) this.rrTrail();
    };

    /** Takes a follower out of the line: it keeps its own pace and look, and stands in the leader's way as a body. */
    Game_Followers.prototype.rrHold = function(follower, order) {
        const was = follower._rrOrder;
        if (!was) {
            if (this._rrRegroup && typeof ReactorFight !== "undefined" && ReactorFight.endRegroup) {
                // The walk back after a battle on the map would move it on and leave it walked through. That
                // walk ends here for everybody; the others come to the leader by the formation's own steps.
                ReactorFight.endRegroup(this);
                this._rrRally = true;
            }
            // Before it is marked: the trail is made from the line with this follower still in it.
            this.rrLeaveLine();
        }
        follower._rrOrder = order;
        if (!was) {
            if (!fightHere()) follower.setThrough(false);
            follower.setMoveSpeed($gamePlayer.moveSpeed());
            // A fade it was in ends here, seen: on its own nothing fades it on, and it would stay as faint as it
            // was. One that was fading to go aboard stays out of the vehicle.
            if (follower._rrAppear > 0 || follower._rrLeave > 0) {
                if (follower._rrLeave > 0) follower._rrAboard = false;
                follower._rrAppear = 0;
                follower._rrLeave = 0;
                follower.setOpacity($gamePlayer.opacity());
            }
            if (this._rrTrail && this._rrGap && Number.isFinite(follower._rrTx)) {
                // Its place in the line stays its own while the others keep theirs.
                this.rrForgetSteps(follower);
                follower._rrKept = this._rrGapId;
            } else {
                this.rrForget(follower);
            }
        }
        this.rrCountHeld();
    };

    /** Whether the place a follower left is still its own: the leader has not walked on, and the line stands as it did. */
    Game_Followers.prototype.rrKeepsPlace = function(follower) {
        return !!follower._rrOrder && !!this._rrGap && !!this._rrTrail && follower._rrKept === this._rrGapId;
    };

    /** Back into the line: whatever it was doing ends, and it walks to its place. */
    Game_Followers.prototype.rrRelease = function(follower) {
        if (!follower._rrOrder) return;
        const kept = this.rrKeepsPlace(follower);
        follower._rrOrder = null;
        follower.rrEndRoute();
        if (!fightHere()) follower.setThrough(true);
        this._rrSettling = true;
        if (kept) {
            // The leader has not walked on since it left: the line stands as it did, and its place is still its own.
            this.rrForgetSteps(follower);
        } else {
            this.rrForget(follower);
            this._rrGap = false;
            if (this._rrTrail && !this.formation().active) this._rrTrail = null;
        }
        this.rrCountHeld();
    };

    /** Every order ends where the followers stand (a transfer, a gather, a battle on the map). */
    Game_Followers.prototype.rrEndOrders = function() {
        this._rrGap = false;
        if (!this._rrHeld) return;
        const fighting = fightHere();
        for (const follower of this._data) {
            if (!follower._rrOrder) continue;
            follower._rrOrder = null;
            follower.rrEndRoute();
            if (!fighting) follower.setThrough(true);
            this.rrForget(follower);
        }
        this._rrTrail = null;
        this.rrCountHeld();
    };

    Game_Follower.prototype.rrEndRoute = function() {
        this._rrPassing = false;
        this._rrHeldUp = 0;
        this._reactorWalk = null;
        Game_Character._walkPaths.delete(this);
        if (this._moveRouteForcing) {
            this._moveRouteForcing = false;
            this.restoreMoveRoute();
        }
    };

    /**
     * A follower that has just been given a route by Set Movement Route is
     * on its own from here: it walks the route at its own pace, through the
     * rest of the party, and stays where the route ends until it is told to
     * follow. In a battle on the map it is a unit and the route is the
     * stock one.
     */
    Game_Followers.prototype.rrOnRoute = function(follower) {
        if (fightHere() || $gameParty.inBattle()) return;
        this.rrHold(follower, { type: "route" });
    };

    /**
     * A route for the followers `who` names ("all", a place from 1, or
     * `{ actorId }`), as Set Movement Route gives one to a follower.
     * Returns the followers it reached.
     */
    Game_Followers.prototype.route = function(who, moveRoute) {
        const list = this.rrWho(who);
        if (!moveRoute || !Array.isArray(moveRoute.list) || $gameParty.inBattle()) return [];
        for (const follower of list) {
            follower.forceMoveRoute(moveRoute);
            this.rrOnRoute(follower);
        }
        return list;
    };

    // Set Movement Route with the editor's id for a follower takes it out of the line. An id a plugin or a script
    // names a follower by (-2, -3, ...), and `forceMoveRoute` called on one, give the stock route: games made
    // with follower plugins count on the follower trailing the leader again afterwards.
    const command205 = Game_Interpreter.prototype.command205;
    Game_Interpreter.prototype.command205 = function(params) {
        const result = command205.call(this, params);
        if (params && params[0] > Game_Followers.CHARACTER_ID) {
            const follower = this.character(params[0]);
            if (follower instanceof Game_Follower && follower.isMoveRouteForcing()) $gamePlayer.followers().rrOnRoute(follower);
        }
        return result;
    };

    /** The followers a command or a script names: "all", a place in the line from 1, or `{ actorId }`. */
    Game_Followers.prototype.rrWho = function(who) {
        const data = this._data;
        if (who === "all" || who === undefined || who === null) return data.filter(follower => !!follower.actor());
        if (typeof who === "object") {
            const id = Number(who.actorId);
            return data.filter(follower => follower.actor() && follower.actor().actorId() === id);
        }
        const follower = data[Math.floor(Number(who)) - 1];
        return follower && follower.actor() ? [follower] : [];
    };

    /**
     * An order to the followers `who` names: "follow", "stay", "goto"
     * (`options.x`, `options.y`, and `options.direction` to face on
     * arrival), "come" (back to the leader, then follow), "hide", "show".
     * Returns the followers it reached.
     */
    Game_Followers.prototype.order = function(who, order, options) {
        const list = this.rrWho(who), player = $gamePlayer;
        if ($gameParty.inBattle() || fightHere()) return [];
        let seen = 0;
        for (const follower of list) {
            // Told to follow while the line still stands as it left it, it goes back to the place it had there;
            // else, and called to come, to the leader.
            const kept = order === "follow" && this.rrKeepsPlace(follower);
            const toX = kept ? follower._rrTx : player.x, toY = kept ? follower._rrTy : player.y;
            const away = Math.max(Math.abs($gameMap.deltaX(toX, follower.x)), Math.abs($gameMap.deltaY(toY, follower.y)));
            if (order === "follow" && (!follower._rrOrder || away <= Game_Followers.RUN_DISTANCE)) {
                this.rrRelease(follower);
            } else if (order === "stay") {
                follower.rrEndRoute();
                this.rrHold(follower, { type: "stay" });
            } else if (order === "goto") {
                const x = Math.floor(Number(options && options.x)), y = Math.floor(Number(options && options.y));
                if (!$gameMap.isValid(x, y)) continue;
                const d = Number(options && options.direction);
                follower.rrEndRoute();
                this.rrHold(follower, { type: "goto", d: d === 2 || d === 4 || d === 6 || d === 8 ? d : 0 });
                follower.forceMoveRoute(Game_Character.walkRoute(x, y, true));
            } else if (order === "come" || order === "follow") {
                // From far off it walks back by a path of its own before it falls in.
                follower.rrEndRoute();
                this.rrHold(follower, { type: "come", x: player.x, y: player.y });
                follower.forceMoveRoute(Game_Character.walkRoute(toX, toY, true, kept && map3D() ? follower._rrTh : undefined));
            } else if (order === "hide" && !follower._rrHidden) {
                // Out of the line like one that stays: the others close up when the leader walks on.
                if (!follower._rrOrder) this.rrLeaveLine();
                follower._rrHidden = true;
                seen--;
            } else if (order === "show" && follower._rrHidden) {
                follower._rrHidden = false;
                seen++;
            }
        }
        if (seen !== 0) {
            this.rrCountHeld();
            player.refresh();
        }
        return list;
    };

    // Two followers change bodies: where each stands, what it is doing and what it was told go to the other.
    // Each object keeps the place in the line it stands for, so whatever knows a follower by its object or by
    // its place (its sprite, its model, a plugin) still has the right one.
    const swapBodies = function(a, b) {
        for (const key of new Set(Object.keys(a).concat(Object.keys(b)))) {
            if (key === "_memberIndex") continue;
            const value = a[key];
            a[key] = b[key];
            b[key] = value;
        }
    };

    /**
     * An order and Hide stay with the actor. When the party's order changes
     * (the menu's Formation, Change Party Member) the body that stays, walks
     * its route or is hidden goes on standing for that actor: the follower
     * that shows the actor now takes that body over, and gives its own to
     * the follower that had it. One whose actor is no follower any more (it
     * leads now, or has left the party) falls in.
     */
    Game_Followers.prototype.rrKeepWithActors = function() {
        const data = this._data, members = $gameParty.battleMembers();
        let changed = false;
        for (let i = 0, swaps = 0; i < data.length; i++) {
            const follower = data[i], id = follower._rrActorId;
            if (!id || !(follower._rrOrder || follower._rrHidden)) continue;
            const now = members[follower._memberIndex];
            if (now && now.actorId() === id) continue;
            let place = -1;
            for (let k = 1; k < members.length && k <= data.length; k++) {
                if (members[k].actorId() === id) { place = k - 1; break; }
            }
            changed = true;
            if (place < 0 || swaps >= data.length) {
                follower._rrHidden = false;
                follower._rrActorId = 0;
                this.rrRelease(follower);
                continue;
            }
            swapBodies(follower, data[place]);
            swaps++;
            // The body this follower has now may be out of the line for somebody else.
            i--;
        }
        if (changed) this.rrCountHeld();
    };

    /** Whether a follower sent to a tile or called back is still on its way. */
    Game_Followers.prototype.rrAreWalking = function() {
        if (!this._rrHeld) return false;
        for (const follower of this._data) {
            const order = follower._rrOrder;
            if (order && (order.type === "goto" || order.type === "come") && follower.isMoveRouteForcing()) return true;
        }
        return false;
    };

    // What an order does once its walk or its route is over.
    Game_Followers.prototype.rrUpdateOrder = function(follower, order) {
        if (order.type === "stay") return;
        if (follower.isMoveRouteForcing()) {
            // The leader has walked on: the follower called back makes for where it is now.
            if (order.type === "come" && !follower.isMoving()) {
                const player = $gamePlayer;
                if (Math.abs($gameMap.deltaX(player.x, order.x)) + Math.abs($gameMap.deltaY(player.y, order.y)) > 3) {
                    order.x = player.x;
                    order.y = player.y;
                    follower.forceMoveRoute(Game_Character.walkRoute(player.x, player.y, true));
                }
            }
            return;
        }
        if (order.type === "come") {
            this.rrRelease(follower);
            return;
        }
        if (order.type === "goto" && order.d) {
            const fixed = follower.isDirectionFixed();
            follower.setDirectionFix(false);
            follower.setDirection(order.d);
            follower.setDirectionFix(fixed);
        }
        order.type = "stay";
    };

    //-------------------------------------------------------------------------
    // The stock functions, with the formation and the orders in them. A game
    // with neither runs the stock code alone.

    /** Told to hide, or aboard with the leader and its fade over: not in a battle on the map, where it is a unit and has a body. */
    const unseen = function(follower) {
        // (Aboard a vehicle of its own, behind the leader's, it is seen riding it.)
        return (!!follower._rrHidden || (!!follower._rrAboard && !follower._rrSeated && !(follower._rrLeave > 0))) && !fightHere();
    };

    const stockVisible = Game_Follower.prototype.isVisible;
    // Such a follower is not seen, whatever the party shows.
    Game_Follower.prototype.isVisible = function() {
        return !unseen(this) && stockVisible.call(this);
    };

    const stockTransparent = Game_Follower.prototype.isTransparent;
    // A 3D model has no sheet to take away: a hidden follower is not drawn.
    Game_Follower.prototype.isTransparent = function() {
        // One that rides a vehicle of its own is seen on it, whatever hides the leader inside the leader's: only
        // what hid the party before the ride began hides it.
        if (this._rrSeated && this._rrRide) return unseen(this) || !!($gamePlayer._rrWas && $gamePlayer._rrWas.transparent);
        return stockTransparent.call(this) || unseen(this);
    };

    const stockFollowerUpdate = Game_Follower.prototype.update;
    Game_Follower.prototype.update = function() {
        const order = this._rrOrder;
        if (order) {
            // On its own: its pace, its look and its facing are its own (a route may set any of them).
            Game_Character.prototype.update.call(this);
            $gamePlayer.followers().rrUpdateOrder(this, order);
            return;
        }
        // Released from its order while the party rides: it goes aboard with the others.
        if (!this._rrAboard && $gamePlayer.followers()._rrAboard) {
            this._rrAboard = true;
            this._rrLeave = Game_Followers.APPEAR_FRAMES;
        }
        stockFollowerUpdate.call(this);
        if (this._rrRun) this.setMoveSpeed(Math.min(6, $gamePlayer.realMoveSpeed() + 1));
        if (this._rrAppear > 0) {
            this._rrAppear--;
            this.setOpacity(Math.round($gamePlayer.opacity() * (1 - this._rrAppear / Game_Followers.APPEAR_FRAMES)));
        } else if (this._rrLeave > 0) {
            this._rrLeave--;
            this.setOpacity(Math.round($gamePlayer.opacity() * this._rrLeave / Game_Followers.APPEAR_FRAMES));
        }
    };

    const stockChase = Game_Follower.prototype.chaseCharacter;
    Game_Follower.prototype.chaseCharacter = function(character) {
        const followers = $gamePlayer.followers();
        if (this._rrOrder || this._rrAboard) return;
        // The stock step: toward the one ahead (a gather, the stock file) or along the trail.
        if (followers._rrLead || followers.areGathering() || !followers._rrTrail || !followers.rrIsActive()) {
            stockChase.call(this, character);
            return;
        }
        // On a ladder, on a ledge or in the water it follows the one ahead as it always has: the formation has
        // it again when it stands on the ground. Falling (it has stepped off a ledge after the leader) it takes
        // no step: the one ahead of it in the line may be behind it, up on the ledge.
        if (followers.rrClimbs(this)) {
            this._rrOn = -1;
            if (followers.rrHolds(this) && character !== this) stockChase.call(this, character);
            return;
        }
        followers.rrDecide(this, followers._data.indexOf(this));
    };

    const stockUpdate = Game_Followers.prototype.update;
    Game_Followers.prototype.update = function() {
        if (this._rrHeld && fightHere()) this.rrEndOrders();
        if (this.areGathering() || !this.rrIsActive()) {
            if (this._rrTrail) this._rrTrail = null;
            stockUpdate.call(this);
            return;
        }
        this.rrTick();
        for (const follower of this._data) {
            follower.update();
        }
    };

    const stockUpdateMove = Game_Followers.prototype.updateMove;
    Game_Followers.prototype.updateMove = function() {
        const data = this._data;
        if (this.areGathering() || !this.rrIsActive()) {
            if (!this._rrHeld && !this._rrUnseen) {
                stockUpdateMove.call(this);
                return;
            }
            // The stock file, past whoever is out of it (told to stay, sent somewhere, hidden): each follows the
            // nearest one ahead of it that walks in the line and is seen, so the line has no hole where one left it.
            for (let i = data.length - 1; i >= 0; i--) {
                if (data[i]._rrOrder) continue;
                let ahead = i - 1;
                while (ahead >= 0 && (data[ahead]._rrOrder || data[ahead]._rrHidden)) ahead--;
                data[i].chaseCharacter(ahead >= 0 ? data[ahead] : $gamePlayer);
            }
            return;
        }
        // In a formation the leader's own step asks for nothing: each follower decides as it comes to rest.
        if (!this._rrAsk) return;
        this._rrAsk = false;
        const trail = this._rrTrail;
        if (!trail || trail.stale) return;
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            if (!this.rrNeedsStep(follower) || !follower.isVisible()) continue;
            if (!this.rrClimbs(follower)) {
                // On the ground the formation decides its step, and nobody is its lead: the one ahead of it in the
                // line may stand over it on a ledge, and the physics would have it climb up after that one.
                follower.chaseCharacter(follower);
                continue;
            }
            // On a ladder, on a ledge or in the water it follows the one ahead as it always has (falling, it takes
            // no step: `chaseCharacter`).
            let ahead = i - 1;
            while (ahead >= 0 && data[ahead]._rrOrder) ahead--;
            follower.chaseCharacter(ahead >= 0 ? data[ahead] : $gamePlayer);
        }
    };

    const stockJumpAll = Game_Followers.prototype.jumpAll;
    Game_Followers.prototype.jumpAll = function() {
        if (!this._rrHeld && !this._rrAboard) {
            stockJumpAll.call(this);
        } else if ($gamePlayer.isJumping()) {
            for (const follower of this._data) {
                if (follower._rrOrder || follower._rrAboard) continue;
                follower.jump($gamePlayer.deltaXFrom(follower.x), $gamePlayer.deltaYFrom(follower.y));
            }
        }
    };

    const stockSynchronize = Game_Followers.prototype.synchronize;
    Game_Followers.prototype.synchronize = function(x, y, d) {
        this.rrEndOrders();
        stockSynchronize.call(this, x, y, d);
        this._rrTrail = null;
        for (const follower of this._data) {
            follower._rrAppear = 0;
            this.rrForget(follower);
        }
    };

    const stockGather = Game_Followers.prototype.gather;
    Game_Followers.prototype.gather = function() {
        this.rrEndOrders();
        this._rrTrail = null;
        stockGather.call(this);
    };

    // A follower given an order after the gather began is on its own: the gather neither waits for it to arrive
    // nor stands while it walks, so the event that asked for the gather goes on.
    const stockAreGathered = Game_Followers.prototype.areGathered;
    Game_Followers.prototype.areGathered = function() {
        if (!this._rrHeld) return stockAreGathered.call(this);
        return this._data.every(follower => !!follower._rrOrder || !follower.isVisible() || follower.isGathered());
    };

    const stockAreMoving = Game_Followers.prototype.areMoving;
    Game_Followers.prototype.areMoving = function() {
        if (!this._rrHeld) return stockAreMoving.call(this);
        return this._data.some(follower => !follower._rrOrder && follower.isVisible() && follower.isMoving());
    };

    const stockRefresh = Game_Followers.prototype.refresh;
    Game_Followers.prototype.refresh = function() {
        // The party's order may have changed: whoever is out of the line stays the person it was.
        if (this._rrHeld || this._rrUnseen) this.rrKeepWithActors();
        stockRefresh.call(this);
    };

    //-------------------------------------------------------------------------
    // The event commands (code 357, plugin "RPGReactor").

    const updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === "reactorFollowers") {
            if ($gamePlayer.followers().rrAreWalking()) return true;
            this._waitMode = "";
            return false;
        }
        return updateWaitMode.call(this);
    };

    if (typeof PluginManager !== "undefined" && PluginManager.registerCommand) {
        const flag = value => value === true || value === "true";
        PluginManager.registerCommand("RPGReactor", "ChangeFollowerFormation", function(args) {
            args = args || {};
            const followers = $gamePlayer.followers();
            if (!FORMATIONS.includes(args.formation)) followers.setFormation(null);
            else followers.setFormation(args.formation, { spacing: args.spacing, straggle: args.straggle });
        });
        PluginManager.registerCommand("RPGReactor", "FollowerOrders", function(args) {
            args = args || {};
            const who = args.who === "actor" ? { actorId: Number(args.actorId) || 0 }
                : args.who === "follower" ? Math.floor(Number(args.index) || 0) : "all";
            const sent = $gamePlayer.followers().order(who, String(args.order || "follow"),
                { x: args.x, y: args.y, direction: args.direction });
            if (sent.length > 0 && flag(args.wait) && (args.order === "goto" || args.order === "come")) this.setWaitMode("reactorFollowers");
        });
    }
})();
