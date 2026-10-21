//=============================================================================
// reactor_fight_camera.js - the cinematic camera for battles on the map
//=============================================================================

/*
 * A Tactical battle is watched from the map's own view. This file is the
 * director that borrows that view for a shot and gives it back: over the
 * shooter's shoulder as it aims, a cut to the target as the hit lands, a
 * round followed down a long sight line, slow motion on a kill.
 *
 * It listens to the battle on the runtime feed (`fightAim`, `fightFire`,
 * `fightImpact`, `fightMoveStart` and the rest, docs/RUNTIME-EVENTS.md) and
 * holds the battle through `ReactorFight.Director.isBusy()` while a shot
 * that must be seen first plays. It never changes the map's camera state:
 *
 *   3D map   the shot is laid over the pose the map camera placed this
 *            frame (`Reactor3D.Camera.update`), so giving the camera back
 *            is to stop laying it over. The map camera keeps running
 *            underneath in whatever mode it is in.
 *   2D map   the shot is a pan (the map's scroll) and a zoom (the screen's
 *            zoom), both saved when the first shot starts and put back to
 *            the saved numbers when the last one ends.
 *
 * How much it cuts is one setting, `System.json > reactorBattle.cinematic`:
 * `{ level: "off" | "some" | "every", slowMotion: true, skip: true }`. Off
 * is exactly the battle without a director.
 *
 * Slow motion runs the map scene's own update on a fraction of the frames
 * (the way holding OK runs it twice), eased in and out: units, the action,
 * 3D model animation and effects slow together; the camera, the windows
 * and sound do not (a sound keeps its speed and its pitch).
 */
(function(root) {
    "use strict";

    const F = root.ReactorFight || (root.ReactorFight = {});
    const C = F.Camera = {};
    const D = F.Director = {};

    C.LEVELS = ["off", "some", "every"];
    /** Direct fire from this many tiles away is a sniper shot. */
    C.SNIPER_RANGE = 6;
    /** Frames to give the view back from close by. */
    C.RETURN_FRAMES = 18;
    /** A press this soon after a shot starts is the press that started it, not a skip. */
    C.SKIP_GUARD = 8;
    /** No shot outlasts this, whatever it waits for. */
    C.MAX_FRAMES = 240;
    const DEG = Math.PI / 180;

    //-------------------------------------------------------------------------
    // Settings

    C.normalizeSettings = function(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            level: C.LEVELS.includes(source.level) ? source.level : "some",
            slowMotion: source.slowMotion !== false,
            skip: source.skip !== false
        };
    };

    /** System's setting, with what the game changed in play (`setLevel`) over it. */
    C.settings = function() {
        const system = F.systemSettings ? F.systemSettings().cinematic : null;
        const settings = C.normalizeSettings(system);
        const changed = typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._rrBattle ? $gameSystem._rrBattle.cinematic : null;
        if (changed && C.LEVELS.includes(changed.level)) settings.level = changed.level;
        return settings;
    };

    /** Change the level for this save (an options screen); "default" goes back to System's. */
    D.setLevel = function(level) {
        if (!F.overrides) return;
        const o = F.overrides();
        if (C.LEVELS.includes(level)) o.cinematic = { level };
        else delete o.cinematic;
        if (C.settings().level === "off") D.abort();
    };

    //-------------------------------------------------------------------------
    // The world a shot is placed in: where the ground is and what is solid.

    const FLAT = { is3D: false, ground: () => 0, solid: () => false, height: () => 1.5 };

    /** Whether something that is not a unit stands on a cell: nothing can step onto it from any side. */
    function stands(x, y) {
        if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.isValid(x, y)) return false;
        if ([2, 4, 6, 8].some(d => $gameMap.isPassable(x, y, d))) {
            return $gameMap.eventsXyNt(x, y).some(event => event.isNormalPriority() && !(typeof $gameFight !== "undefined" && $gameFight && $gameFight.unitOfEvent(event.eventId())));
        }
        return true;
    }

    C.world = function() {
        if (C.testWorld) return C.testWorld;
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        const map = typeof $dataMap !== "undefined" ? $dataMap : null;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const live = scene && scene._spriteset && scene._spriteset._reactor3d;
        if (!R || !map || !live || !live.camera) return FLAT;
        if (C._world && C._world.map === map) return C._world;
        const groundAt = (x, z) => (R.elevationAt ? R.elevationAt(map, Math.floor(x), Math.floor(z)) : 0)
            + (R.terrainHeightAt ? R.terrainHeightAt(map, x, z) : 0);
        C._world = {
            map, is3D: true, stands,
            groundAt: (x, z) => (x >= 0 && z >= 0 && x < map.width && z < map.height ? groundAt(x, z) : -1e9),
            // Where the unit stands, which may be a roof or an eave over the ground. The map's own measure follows a
            // unit smoothly between cells; the battle's says which level it is on, and wins when the two disagree.
            ground: character => {
                const air = Number(character._reactorAir) || 0;
                const smooth = R.characterGround ? R.characterGround(map, character) : 0;
                const grid = F.Grid;
                if (grid && grid.heightOf) {
                    try { const level = grid.heightOf(character); if (Number.isFinite(level) && Math.abs(level - smooth) > 1.5) return level + air; } catch (error) { /* the map's measure */ }
                }
                return smooth + air;
            },
            height: character => (R.characterHeightTiles ? R.characterHeightTiles(character) : 1.5),
            solid: (x, y, z) => {
                if (x >= 0 && z >= 0 && x < map.width && z < map.height && y < groundAt(x, z) + 0.3) return true;
                // What the cutaway has opened (a roof over the unit) is not in the way.
                const shared = R._cutawayUniforms;
                const cut = shared && shared.rrCutRadius.value > 0 ? { top: shared.rrCutTop.value, box: shared.rrCutBox.value } : null;
                return !!(R.pieceSolidAt && R.hasPieces && R.hasPieces(map) && R.pieceSolidAt(map, x, y, z, cut));
            }
        };
        return C._world;
    };

    /** A character as a point: the middle of its cell, the ground under it, how tall it stands. */
    C.point = function(character, world) {
        return { x: character._realX + 0.5, y: world.ground(character), z: character._realY + 0.5, h: Math.max(1, world.height(character)), c: character };
    };

    //-------------------------------------------------------------------------
    // Shot geometry. A pose is `{ eye, look, fov }` in tiles (x east, z south,
    // y up); its 2D counterpart is `{ x, z, zoom }`, the map point at the
    // middle of the screen.

    const lerp = (a, b, t) => a + (b - a) * t;
    const mixV = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
    const mix3 = (a, b, t) => ({ eye: mixV(a.eye, b.eye, t), look: mixV(a.look, b.look, t), fov: lerp(a.fov, b.fov, t) });
    const mix2 = (a, b, t) => ({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), zoom: lerp(a.zoom, b.zoom, t) });
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const CURVES = {
        linear: t => t,
        in: t => t * t,
        out: t => 1 - (1 - t) * (1 - t),
        inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
    };
    C.mix3 = mix3;
    C.mix2 = mix2;

    /** The line from one point to another on the ground: its direction, its right-hand side, its length. */
    function axis(from, to, fallback) {
        let dx = to.x - from.x, dz = to.z - from.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) { dx = fallback ? fallback.dx : 0; dz = fallback ? fallback.dz : 1; } else { dx /= dist; dz /= dist; }
        return { dx, dz, rx: -dz, rz: dx, dist };
    }
    const turned = (f, degrees) => {
        const c = Math.cos(degrees * DEG), s = Math.sin(degrees * DEG);
        const dx = f.dx * c - f.dz * s, dz = f.dx * s + f.dz * c;
        return { dx, dz, rx: -dz, rz: dx, dist: f.dist };
    };
    /** A point `forward` along the line, `side` to its right and `up` above `p`. */
    const off = (p, f, forward, side, up) => ({ x: p.x + f.dx * forward + f.rx * side, y: p.y + up, z: p.z + f.dz * forward + f.rz * side });
    const chest = p => ({ x: p.x, y: p.y + p.h * 0.62, z: p.z, c: p.c });
    const head = p => ({ x: p.x, y: p.y + p.h * 0.85, z: p.z, c: p.c });
    const FACING = { 2: { dx: 0, dz: 1 }, 4: { dx: -1, dz: 0 }, 6: { dx: 1, dz: 0 }, 8: { dx: 0, dz: -1 } };
    function centroid(points) {
        const c = { x: 0, y: 0, z: 0, h: 0 };
        for (const p of points) { c.x += p.x; c.y += p.y; c.z += p.z; c.h += p.h; }
        const n = Math.max(1, points.length);
        c.x /= n; c.y /= n; c.z /= n; c.h = c.h / n || 1.5;
        c.r = points.reduce((r, p) => Math.max(r, Math.hypot(p.x - c.x, p.z - c.z)), 0);
        return c;
    }

    /** Whether a point is inside another unit's body (`world.bodies`), leaving out the shot's own subjects. */
    function inBody(world, x, y, z, own) {
        for (const body of world.bodies || []) {
            if (own && own.includes(body.c)) continue;
            if (y < body.y + body.h * 1.05 && y > body.y && Math.hypot(x - body.x, z - body.z) < body.h * 0.18) return true;
        }
        return false;
    }

    /** Whether a point is inside a piece of tall scenery (`world.scenery`: a tree's canopy, a cart, a statue). */
    function inScenery(world, x, y, z) {
        for (const prop of world.scenery || []) {
            if (y > prop.y && y < prop.y + prop.h && Math.hypot(x - prop.x, z - prop.z) < prop.r) return true;
        }
        return false;
    }

    /**
     * Whether anything stands at the eye or between it and a point: a solid
     * of the map, scenery tall enough to fill the picture, or a unit that is
     * not one of the shot's `own` subjects. The last stretch is the subject
     * itself.
     */
    C.blocked = function(world, eye, point, own, strict) {
        const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
        const length = Math.hypot(dx, dy, dz);
        if (world.solid(eye.x, eye.y, eye.z) || inBody(world, eye.x, eye.y, eye.z, own) || inScenery(world, eye.x, eye.y, eye.z)) return true;
        // `strict`: a cell nothing can walk into (a post, a tree, a stall) between the two is in the way as well,
        // while the line is low enough for it to be.
        const stands = (x, y, z) => strict && world.stands && y < point.y + 2.5
            && (Math.floor(x) !== Math.floor(point.x) || Math.floor(z) !== Math.floor(point.z)) && world.stands(Math.floor(x), Math.floor(z));
        if (stands(eye.x, eye.y, eye.z)) return true;
        for (let d = 0.3; d < length - 0.7; d += 0.3) {
            const t = d / length, x = eye.x + dx * t, y = eye.y + dy * t, z = eye.z + dz * t;
            if (world.solid(x, y, z) || inBody(world, x, y, z, own) || inScenery(world, x, y, z) || stands(x, y, z)) return true;
        }
        return false;
    };

    /** The framing that always works: high over the points, from `f`'s near side. */
    C.high = function(world, points, f, radius) {
        const c = centroid(points);
        const reach = (Math.max(c.r, radius || 0) + c.h * 1.2 + 1.5) * 3.1;
        const look = { x: c.x, y: c.y + c.h * 0.5, z: c.z };
        for (const pitch of [52, 68, 82]) {
            const eye = off(look, f, -Math.cos(pitch * DEG) * reach, 0, Math.sin(pitch * DEG) * reach);
            if (!world.solid(eye.x, eye.y, eye.z) || pitch === 82) return { eye, look, fov: 36 };
        }
        return null;
    };

    /**
     * The first framing whose camera is clear of solids and sees its subjects;
     * else the high one. `framings` are `{ variant, a, b }` in order of
     * preference; `points` are what must be seen (chests).
     */
    C.choose = function(world, framings, points, f, radius, subjects, inOrder) {
        const own = subjects || points.map(point => point.c).filter(Boolean);
        // First a framing with nothing at all in the way; then one clear of walls and units. `inOrder`: each
        // framing is tried both ways before the next (the order matters more than a post in the picture).
        const tries = [];
        if (inOrder) for (const framing of framings) tries.push([true, framing], [false, framing]);
        else for (const strict of [true, false]) for (const framing of framings) tries.push([strict, framing]);
        for (const [strict, framing] of tries) {
            if (strict && !world.stands) continue;
            // The view from over the head is for when the shoulders are walled in, not for a bench in the corner of the picture.
            if (strict && framing.variant === "raised") continue;
            // A wide framing is judged by the map alone (units and posts are small in it), all along its sweep.
            if (framing.wide) {
                if (strict && world.stands) continue;
                const mid = mixV(framing.a.eye, framing.b.eye, 0.5);
                if ([framing.a.eye, mid, framing.b.eye].some(eye => C.blocked({ solid: world.solid }, eye, points[0]))) continue;
                return framing;
            }
            if (C.blocked(world, framing.a.eye, points[0], own, strict)) continue;
            if (points.some(point => C.blocked(world, framing.b.eye, point, own, strict))) continue;
            return framing;
        }
        // Roofs all round: the steepest of the wide framings whose camera is at least in the open.
        const steep = framings.filter(framing => framing.wide && !world.solid(framing.a.eye.x, framing.a.eye.y, framing.a.eye.z)
            && !world.solid(framing.b.eye.x, framing.b.eye.y, framing.b.eye.z)).pop();
        if (steep) return steep;
        const high = C.high(world, points.map(p => ({ x: p.x, y: p.y, z: p.z, h: 0.5 })), f, radius);
        return { variant: "high", a: high, b: { eye: mixV(high.eye, high.look, 0.08), look: high.look, fov: high.fov }, fallback: true };
    };

    function makeShot(name, framing, a2, b2, options) {
        // Poses are numbers only (a look point may have come with the character it is on).
        const bare = pose => ({ eye: { x: pose.eye.x, y: pose.eye.y, z: pose.eye.z }, look: { x: pose.look.x, y: pose.look.y, z: pose.look.z }, fov: pose.fov });
        return Object.assign({
            name, variant: framing.variant, a: bare(framing.a), b: bare(framing.b), a2, b2, fallback: !!framing.fallback,
            region: !!framing.fallback,   // the tactical view's open ground is kept (a view from above looks down through roofs and trees)
            frames: 40,       // how long the camera moves from a to b
            hold: 0,          // how many frames the battle waits for it
            blend: 14,        // frames to ease in from what was shown; 0 asks for a cut (given inside an action only)
            curve: "inOut",
            linger: false,    // stays on its last pose until something replaces or ends it
            slow: null,       // { scale, frames }
            subjects: []
        }, options);
    }

    /** `variants` with the one used last moved to the end: the same shot is not shown twice running. */
    C.order = function(variants, last) {
        return variants.filter(v => v !== last).concat(variants.filter(v => v === last));
    };

    const sign = variant => (variant === "left" ? -1 : 1);

    C.shots = {
        /** Over the shooter's shoulder, the target in frame, pushing in. */
        aim(world, U, T, last) {
            const f = axis(U, T, FACING[U.c && U.c.direction ? U.c.direction() : 2]), h = U.h;
            const look = chest(T);
            const framings = C.order(["right", "left"], last).map(variant => ({
                variant,
                a: { eye: off(U, f, -1.9 * h, 0.6 * h * sign(variant), 1.02 * h), look, fov: 42 },
                b: { eye: off(U, f, -1.45 * h, 0.55 * h * sign(variant), 1.0 * h), look, fov: 38 }
            }));
            // Someone close behind: tight in on the shoulder, in front of them.
            for (const variant of C.order(["right", "left"], last)) {
                framings.push({ variant,
                    a: { eye: off(U, f, -1.0 * h, 0.42 * h * sign(variant), 0.98 * h), look, fov: 46 },
                    b: { eye: off(U, f, -0.8 * h, 0.4 * h * sign(variant), 0.96 * h), look, fov: 44 } });
            }
            // Blocked at both shoulders: from behind and above the head.
            framings.push({ variant: "raised", a: { eye: off(U, f, -2.3 * h, 0, 1.9 * h), look, fov: 42 }, b: { eye: off(U, f, -1.9 * h, 0, 1.7 * h), look, fov: 38 } });
            const near = f.dist > 8 ? 0.2 : 0.3;
            return makeShot("aim", C.choose(world, framings, [look, chest(U)], f),
                { x: U.x, z: U.z, zoom: 1.25 }, { x: lerp(U.x, T.x, near), z: lerp(U.z, T.z, near), zoom: 1.5 },
                // The push in is slow and never stops while the shot is up.
                { frames: 150, frames2: 30, hold: 36, blend: 14, curve: "linear", linger: true, subjects: [U.c, T.c] });
        },

        /** Both fighters side-on, for a blow struck at arm's length. */
        melee(world, U, T, last) {
            const f = axis(U, T), h = Math.max(U.h, T.h);
            const mid = { x: (U.x + T.x) / 2, y: (U.y + T.y) / 2, z: (U.z + T.z) / 2, h };
            const look = chest(mid);
            const framings = C.order(["right", "left"], last).map(variant => {
                const reach = (f.dist * 0.5 + 2.1 * h) * sign(variant);
                return { variant,
                    a: { eye: off(mid, f, -0.3 * h, reach * 1.15, 0.6 * h), look, fov: 40 },
                    b: { eye: off(mid, f, -0.3 * h, reach, 0.55 * h), look, fov: 40 } };
            });
            // Others crowding both sides: from the attacker's side again, over their heads.
            for (const variant of C.order(["right", "left"], last)) {
                const reach = (f.dist * 0.5 + 1.9 * h) * sign(variant);
                framings.push({ variant: "raised", a: { eye: off(mid, f, -0.8 * h, reach * 1.1, 1.7 * h), look, fov: 40 }, b: { eye: off(mid, f, -0.8 * h, reach, 1.6 * h), look, fov: 40 } });
            }
            return makeShot("melee", C.choose(world, framings, [look, chest(U), chest(T)], f),
                { x: mid.x, z: mid.z, zoom: 1.25 }, { x: mid.x, z: mid.z, zoom: 1.5 },
                { frames: 130, frames2: 26, hold: 34, blend: 14, curve: "linear", linger: true, subjects: [U.c, T.c] });
        },

        /** Down the sight line from behind the shooter, the lens closing on the target. */
        sight(world, U, T, last) {
            const f = axis(U, T), h = U.h;
            const look = chest(T);
            const framings = C.order(["right", "left"], last).map(variant => ({
                variant,
                a: { eye: off(U, f, -1.6 * h, 0.4 * h * sign(variant), 0.95 * h), look, fov: 40 },
                b: { eye: off(U, f, -0.8 * h, 0.32 * h * sign(variant), 0.92 * h), look, fov: 15 }
            }));
            framings.push({ variant: "raised", a: { eye: off(U, f, -2.0 * h, 0, 1.8 * h), look, fov: 40 }, b: { eye: off(U, f, -1.2 * h, 0, 1.5 * h), look, fov: 16 } });
            return makeShot("sight", C.choose(world, framings, [look, chest(U)], f),
                { x: U.x, z: U.z, zoom: 1.25 }, { x: lerp(U.x, T.x, 0.25), z: lerp(U.z, T.z, 0.25), zoom: 1.75 },
                { frames: 100, frames2: 40, hold: 60, blend: 14, curve: "inOut", linger: true, subjects: [U.c, T.c] });
        },

        /**
         * With the round: just behind and beside it, from the muzzle to just
         * short of the target, the target dead ahead. `flight` (the action's
         * own projectile) is followed; without one the camera travels the
         * line over `frames`. `side` 1 rides to the right of the line, -1 left.
         */
        round(world, U, T, frames, slow, flight, side) {
            const f = axis(U, T), h = U.h, look = chest(T), s = side < 0 ? -1 : 1;
            // Something standing along the way (a well, a post): the camera rides above it.
            let high = false;
            if (world.stands) {
                for (let d = 1; d < f.dist - 0.6 && !high; d += 0.5) {
                    const x = U.x + f.dx * d + f.rx * 0.38 * h * s, z = U.z + f.dz * d + f.rz * 0.38 * h * s;
                    high = world.stands(Math.floor(x), Math.floor(z));
                }
            }
            const up = high ? 1.3 * h : 0.28 * h, back = high ? 1.2 * h : 1.5 * h;
            const behind = (p, away) => ({ eye: off(p, f, -away, 0.38 * h * s, up), look: { x: look.x, y: look.y, z: look.z }, fov: 44 });
            const muzzle = { x: U.x + f.dx * 0.6 * h, y: U.y + 0.7 * h, z: U.z + f.dz * 0.6 * h };
            const end = { x: T.x - f.dx * 0.3, y: T.y + 0.62 * T.h, z: T.z - f.dz * 0.3 };
            // It leaves from beside the muzzle, ahead of the shooter (whose back would fill the picture, or
            // from a roof its legs), and drops back behind the round as it flies.
            const a = behind(muzzle, C.ROUND_START * h), b = behind(end, back);
            for (const pose of [a, b]) for (let i = 0; i < 4 && world.solid(pose.eye.x, pose.eye.y, pose.eye.z); i++) pose.eye.y += 0.8;
            const shot = makeShot("round", { variant: s > 0 ? "right" : "left", a, b }, { x: U.x, z: U.z, zoom: 1.5 }, { x: T.x, z: T.z, zoom: 1.5 },
                { frames, blend: 0, curve: "inOut", linger: true, tau: 5, slow: slow < 1 ? { scale: slow, frames } : null, subjects: [T.c, U.c] });
            if (flight) {
                let last = null, gone = false;
                shot.track = () => {
                    const p = flight();
                    if (p) last = { x: p.x, y: p.y, z: p.z };
                    else if (last && !gone) { gone = true; if (shot.landed) shot.landed(); }
                    if (!last) return null;
                    // The round pulls ahead of the camera, which then keeps its distance behind it.
                    const flown = Math.hypot(last.x - muzzle.x, last.y - muzzle.y, last.z - muzzle.z);
                    const pose = behind(last, Math.min(back, C.ROUND_START * h + flown));
                    pose.x = last.x; pose.z = last.z; pose.zoom = 1.5;
                    return pose;
                };
            }
            return shot;
        },

        /**
         * The target as the result lands. `result` is "hit", "miss", "crit"
         * or "kill": a miss stands back, a critical hit comes closer, a kill
         * is close and low and slow.
         */
        impact(world, U, T, result, last) {
            const f = axis(U, T), h = T.h;
            const look = result === "kill" ? { x: T.x, y: T.y + h * 0.56, z: T.z } : chest(T);
            const K = {
                hit: { back: 1.7, up: 0.72, zoom: 1.5, frames: 42, slow: null },
                miss: { back: 2.4, up: 0.9, zoom: 1.25, frames: 38, slow: null },
                crit: { back: 1.4, up: 0.62, zoom: 1.75, frames: 48, slow: { scale: 0.5, frames: 18 } },
                kill: { back: 1.55, up: 0.34, zoom: 2, frames: 70, slow: { scale: 0.4, frames: 44 } }
            }[result] || { back: 1.7, up: 0.72, zoom: 1.5, frames: 42, slow: null };
            // From the attacker's side of the target, on one side of the line between them ("right" is its right).
            const framings = C.order(["right", "left"], last).map(variant => {
                const s = sign(variant);
                const at = (degrees, k) => off(T, f, -Math.cos(degrees * DEG) * K.back * k * h, Math.sin(degrees * DEG) * K.back * k * h * s, K.up * h);
                return { variant,
                    a: { eye: at(40, 1.1), look, fov: 38 },
                    b: { eye: at(result === "kill" ? 58 : 46, 1), look, fov: 36 } };
            });
            // Its own side blocked: from over the line itself, before the camera crosses to the other side.
            framings.splice(1, 0, { variant: "raised", a: { eye: off(T, f, -K.back * 1.2 * h, 0, 1.5 * h), look, fov: 38 }, b: { eye: off(T, f, -K.back * 1.1 * h, 0, 1.4 * h), look, fov: 36 } });
            // The move ends early and the shot rests on the result before the view goes back.
            return makeShot("impact", C.choose(world, framings, [Object.assign({ c: T.c }, look)], f, 0, null, true),
                { x: T.x, z: T.z, zoom: K.zoom }, { x: T.x, z: T.z, zoom: K.zoom },
                { frames: K.frames - 12, hold: K.frames, blend: 0, swoop: 14, curve: "out", slow: K.slow, result, subjects: [T.c, U.c] });
        },

        /** Wide, from behind the user, over everything the action lands on. */
        area(world, U, points, cell, last) {
            const c = centroid(points.length ? points : [cell]);
            if (cell) { c.x = cell.x; c.z = cell.z; c.r = points.reduce((r, p) => Math.max(r, Math.hypot(p.x - c.x, p.z - c.z)), 0); }
            const f = axis(U, c, FACING[U.c && U.c.direction ? U.c.direction() : 2]);
            const look = { x: c.x, y: c.y + c.h * 0.4, z: c.z };
            const reach = (Math.max(2, c.r) + 2) * 2.6;
            const framings = [];
            for (const pitch of [38, 52, 66]) for (const variant of C.order(["right", "left"], last)) {
                const turn = turned(f, 18 * sign(variant));
                const eye = k => off(look, turn, -Math.cos(pitch * DEG) * reach * k, 0, Math.sin(pitch * DEG) * reach * k);
                framings.push({ variant, wide: true, a: { eye: eye(1.14), look, fov: 40 }, b: { eye: eye(1), look, fov: 40 } });
            }
            return makeShot("area", C.choose(world, framings, [look], f, c.r),
                { x: lerp(U.x, c.x, 0.5), z: lerp(U.z, c.z, 0.5), zoom: 1.125 }, { x: c.x, z: c.z, zoom: 1 },
                { frames: 60, frames2: 30, hold: 44, blend: 14, linger: true, region: true, subjects: [U.c].concat(points.map(p => p.c)).filter(Boolean), centre: c });
        },

        /** A thrown thing in the air: the wide view turning with it from the hand to where it lands. */
        arc(world, U, wide, frames, flight) {
            const c = wide.centre, eye = wide.b.eye;
            const peak = axis(U, c).dist * 0.35;
            const shot = makeShot("arc", { variant: wide.variant, a: { eye, look: chest(U), fov: wide.b.fov }, b: { eye, look: wide.b.look, fov: wide.b.fov } },
                { x: U.x, z: U.z, zoom: 1.125 }, { x: c.x, z: c.z, zoom: 1 },
                { frames, blend: 10, linger: true, region: true, tau: 5, subjects: wide.subjects });
            shot.track = frame => {
                const p = flight && flight();
                const t = p ? clamp(p.t || 0, 0, 1) : CURVES.inOut(clamp(frame / frames, 0, 1));
                const at = p ? { x: p.x, y: p.y, z: p.z } : { x: lerp(U.x, c.x, t), y: lerp(U.y + U.h * 0.7, c.y, t) + Math.sin(t * Math.PI) * peak, z: lerp(U.z, c.z, t) };
                return { eye, look: at, fov: wide.b.fov, x: at.x, z: at.z, zoom: lerp(1.125, 1, t) };
            };
            return shot;
        },

        /** A long run: low behind the runner ("chase") or beside it ("side"), moving with it. */
        move(world, U, path, last) {
            const end = path && path.length ? path[path.length - 1] : null;
            const goal = end ? { x: end.x + 0.5, z: end.y + 0.5 } : null;
            let f = axis(U, goal || U, FACING[U.c && U.c.direction ? U.c.direction() : 2]);
            const variant = C.order(["chase", "side"], last)[0];
            const side = last === "left" ? 1 : -1;
            // Decided once: where the camera rides. A wall there at the start sends it over the runner's head for the whole run.
            let over = C.blocked(world, variant === "chase" ? off(U, f, -1.9 * U.h, 0.6 * U.h * side, 0.8 * U.h) : off(U, f, -0.5 * U.h, 2.6 * U.h * side, 0.6 * U.h), chest(U), [U.c]);
            const pose = point => {
                const h = point.h;
                // Toward where it is going, not the way it faces: the path's corners do not swing the camera.
                if (goal && Math.hypot(goal.x - point.x, goal.z - point.z) > 2) f = axis(point, goal);
                let eye = variant === "chase" ? off(point, f, -1.9 * h, 0.6 * h * side, 0.8 * h) : off(point, f, -0.5 * h, 2.6 * h * side, 0.6 * h);
                // A wall met on the way: the camera eases up over the runner (the spring carries it) and stays there.
                if (!over && world.solid(eye.x, eye.y, eye.z)) over = true;
                if (over) eye = off(point, f, -1.6 * h, 0, 2.2 * h);
                const look = off(point, f, (variant === "chase" ? 1.2 : 0.8) * h, 0, 0.6 * h);
                return { eye, look, fov: 45, x: point.x + f.dx * 1.5, z: point.z + f.dz * 1.5, zoom: 1.25 };
            };
            const first = pose(U);
            const shot = makeShot("move", { variant, a: first, b: first }, first, first,
                { frames: 36, blend: 16, linger: true, optional: true, tau: 6, subjects: [U.c] });
            // The runner as the camera follows it: its steps and its hops are smoothed away first.
            const at = { x: U.x, y: U.y, z: U.z, h: U.h, c: U.c };
            shot.track = () => {
                const p = C.point(U.c, world), ground = p.y - (world.is3D ? Number(U.c._reactorAir) || 0 : 0);
                at.x += (p.x - at.x) * 0.3; at.z += (p.z - at.z) * 0.3; at.y += (ground - at.y) * 0.1;
                return pose(at);
            };
            return shot;
        },

        /**
         * The field before the first turn: a slow arc that takes in both sides. `toward` is the way the battle will
         * be watched from afterward (`{ dx, dz }` over the ground: the Tactical view's quarter): the arc ends looking
         * that way, so it hands over to that view without a swing past a roof. Without it the arc ends off the
         * party's shoulder, looking at the enemy.
         */
        establish(world, allies, enemies, last, toward) {
            const a = centroid(allies), e = centroid(enemies.length ? enemies : allies), all = centroid(allies.concat(enemies));
            const f = axis(a, e), look = { x: all.x, y: all.y + all.h * 0.5, z: all.z };
            const reach = clamp((all.r + 3) * 2.6, 10, 44);
            const framings = [];
            // Where the arc ends, in degrees from the party-to-enemy line: the view's own direction when it is known.
            const known = toward && Number.isFinite(toward.dx) && Number.isFinite(toward.dz) && Math.hypot(toward.dx, toward.dz) > 1e-6;
            const end = known ? Math.atan2(f.dx * toward.dz - f.dz * toward.dx, f.dx * toward.dx + f.dz * toward.dz) / DEG : 0;
            for (const pitch of [30, 44, 58, 70]) for (const variant of C.order(["right", "left"], last)) {
                const s = sign(variant);
                const eye = degrees => { const t = turned(f, known ? end + degrees * s : degrees * s); return off(look, t, -Math.cos(pitch * DEG) * reach, 0, Math.sin(pitch * DEG) * reach); };
                framings.push({ variant, wide: true, a: { eye: eye(known ? 55 : 95), look, fov: 36 }, b: { eye: eye(known ? 0 : 40), look, fov: 36 } });
            }
            return makeShot("establish", C.choose(world, framings, [look], f, all.r),
                { x: e.x, z: e.z, zoom: 1.25 }, { x: a.x, z: a.z, zoom: 1 },
                { frames: 120, hold: 120, blend: 24, region: true, subjects: allies.concat(enemies).map(p => p.c).filter(Boolean).slice(0, 4) });
        },

        /** A side's turn begins: a short arc round its units. */
        phase(world, units, others, last) {
            const c = centroid(units), o = centroid(others.length ? others : units);
            const f = axis(c, o), look = { x: c.x, y: c.y + c.h * 0.5, z: c.z };
            const reach = clamp((c.r + 2.5) * 2.6, 8, 36);
            const framings = [];
            for (const pitch of [32, 46, 60, 72]) for (const variant of C.order(["right", "left"], last)) {
                const s = sign(variant);
                const eye = degrees => { const t = turned(f, degrees * s); return off(look, t, -Math.cos(pitch * DEG) * reach, 0, Math.sin(pitch * DEG) * reach); };
                framings.push({ variant, wide: true, a: { eye: eye(34), look, fov: 36 }, b: { eye: eye(14), look, fov: 36 } });
            }
            return makeShot("phase", C.choose(world, framings, [look], f, c.r),
                { x: c.x, z: c.z, zoom: 1 }, { x: c.x, z: c.z, zoom: 1.125 },
                { frames: 50, hold: 50, blend: 20, region: true, subjects: units.map(p => p.c).filter(Boolean).slice(0, 4) });
        },

        /** Someone joins the field: a quick cut to their face. */
        reveal(world, points, last) {
            const c = centroid(points), first = points[0];
            const face = FACING[first.c && first.c.direction ? first.c.direction() : 2] || FACING[2];
            const f = { dx: face.dx, dz: face.dz, rx: -face.dz, rz: face.dx, dist: 1 };
            const look = points.length > 1 ? chest(c) : head(first);
            const back = 2.0 * c.h + c.r * 1.6;
            const framings = C.order(["right", "left"], last).map(variant => ({
                variant,
                a: { eye: off(c, f, back * 1.2, 0.5 * c.h * sign(variant), 0.5 * c.h), look, fov: 40 },
                b: { eye: off(c, f, back, 0.5 * c.h * sign(variant), 0.55 * c.h), look, fov: 40 }
            }));
            return makeShot("reveal", C.choose(world, framings, [look], f, c.r, points.map(p => p.c)),
                { x: c.x, z: c.z, zoom: 1.25 }, { x: c.x, z: c.z, zoom: 1.5 },
                { frames: 50, hold: 50, blend: 0, swoop: 16, curve: "out", subjects: points.map(p => p.c).filter(Boolean) });
        },

        /**
         * A routine action left in the tactical view: the view leans toward
         * it a little and closes slightly, and nothing is cut. The pose is
         * the tactical one moved (`lean`), so the tactical view keeps running.
         */
        lean(world, U, T) {
            const mid = { x: (U.x + T.x) / 2, y: (U.y + T.y) / 2 + U.h * 0.5, z: (U.z + T.z) / 2 };
            const still = { eye: { x: U.x, y: U.y + 10, z: U.z }, look: mid, fov: 30 };
            const shot = makeShot("lean", { variant: "lean", a: still, b: still }, { x: mid.x, z: mid.z, zoom: 1.125 }, { x: mid.x, z: mid.z, zoom: 1.125 },
                { frames: 30, blend: 26, linger: true, light: true, bars: false, subjects: [U.c, T.c] });
            shot.lean = base => {
                const dx = (mid.x - base.look.x) * 0.5, dy = (mid.y - base.look.y) * 0.5, dz = (mid.z - base.look.z) * 0.5;
                return { eye: { x: base.eye.x + dx, y: base.eye.y + dy, z: base.eye.z + dz }, look: { x: base.look.x + dx, y: base.look.y + dy, z: base.look.z + dz }, fov: base.fov * 0.86 };
            };
            return shot;
        },

        /**
         * A camera step from an Action Sequence, on the map: "target" frames
         * the step's target from the user's side, "approach" frames the two
         * together. The step's offset moves what is looked at (x to the
         * right, y away from the user, z up, in tiles).
         */
        authored(world, U, T, step, last) {
            const same = !T || T.c === U.c;
            const P = same ? U : T;
            const f = same ? (() => { const d = FACING[U.c && U.c.direction ? U.c.direction() : 2] || FACING[2]; return { dx: -d.dx, dz: -d.dz, rx: d.dz, rz: -d.dx, dist: 1 }; })() : axis(U, T);
            if (step.anchor === "approach" && !same) {
                const two = C.shots.melee(world, U, T, last);
                return Object.assign(two, { name: "authored", hold: 0, frames: Math.max(1, step.duration || 1), blend: Math.max(0, step.duration || 0), curve: step.easing === "linear" ? "linear" : "inOut", a: two.b, a2: two.b2 });
            }
            const look = off(chest(P), f, Number(step.y) || 0, Number(step.x) || 0, Number(step.z) || 0);
            const framings = C.order(["right", "left"], last).map(variant => {
                const t = turned(f, -32 * sign(variant));
                const eye = off(P, t, -1.9 * P.h, 0, 0.8 * P.h);
                return { variant, a: { eye, look, fov: 38 }, b: { eye, look, fov: 38 } };
            });
            return makeShot("authored", C.choose(world, framings, [look], f, 0, [P.c, U.c]),
                { x: look.x, z: look.z, zoom: 1.5 }, { x: look.x, z: look.z, zoom: 1.5 },
                { frames: Math.max(1, step.duration || 1), blend: Math.max(0, step.duration || 0), curve: step.easing === "linear" ? "linear" : "inOut", linger: true, subjects: [P.c, U.c] });
        }
    };

    //-------------------------------------------------------------------------
    // Motion: how the camera gets from one pose to the next.
    //
    // A move between two poses is a crane's: the point looked at slides
    // across, the eye swings round it and closes on it by ratio (so the
    // subject grows evenly on screen, from fifty tiles away or from five),
    // on a curve that starts and ends at rest. What is shown is that ideal
    // pose followed by a critically damped spring, so nothing the ideal does
    // (a move interrupted by the next, a subject that steps and hops) is
    // ever a step in the picture. A cut puts the spring on the ideal at once.

    /** A curve at rest at both ends, in speed and in acceleration. */
    const smoother = t => { const k = clamp(t, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
    C.smoother = smoother;

    function orbitOf(pose) {
        const dx = pose.eye.x - pose.look.x, dy = pose.eye.y - pose.look.y, dz = pose.eye.z - pose.look.z;
        const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
        return { x: dx / dist, y: dy / dist, z: dz / dist, dist };
    }

    /**
     * The pose `e` of the way from `a` to `b` (`eLook`: how far the look point
     * has gone, a little ahead of the eye; `lift`: tiles the eye rises on the
     * way, to pass over what stands between, highest in the middle, or with
     * `skew` above 1 late in the way and below 1 early).
     */
    C.swing = function(a, b, e, eLook, lift, skew) {
        const look = mixV(a.look, b.look, eLook === undefined ? e : eLook);
        const p = orbitOf(a), q = orbitOf(b);
        const angle = Math.acos(clamp(p.x * q.x + p.y * q.y + p.z * q.z, -1, 1));
        let wa = 1 - e, wb = e;
        if (angle > 0.001 && angle < 3.1) { const s = Math.sin(angle); wa = Math.sin((1 - e) * angle) / s; wb = Math.sin(e * angle) / s; }
        let dx = p.x * wa + q.x * wb, dy = p.y * wa + q.y * wb, dz = p.z * wa + q.z * wb;
        const length = Math.hypot(dx, dy, dz);
        if (length < 0.0001) { dx = 0; dy = 1; dz = 0; } else { dx /= length; dy /= length; dz /= length; }
        const dist = Math.exp(lerp(Math.log(p.dist), Math.log(q.dist), e));
        const crest = lift ? Math.sin(Math.PI * Math.pow(e, skew || 1)) : 0;
        const rise = lift ? lift * crest * crest : 0;
        return { eye: { x: look.x + dx * dist, y: look.y + dy * dist + rise, z: look.z + dz * dist }, look, fov: lerp(a.fov, b.fov, e) };
    };

    /** One frame of a critically damped spring: `state.x` follows `target` (arrays), `tau` frames behind. */
    C.damp = function(state, target, tau) {
        const omega = 2 / Math.max(0.5, tau), k = 1 / (1 + omega + 0.48 * omega * omega + 0.235 * omega * omega * omega);
        for (let i = 0; i < target.length; i++) {
            const change = state.x[i] - target[i], temp = state.v[i] + omega * change;
            state.v[i] = (state.v[i] - omega * temp) * k;
            state.x[i] = target[i] + (change + temp) * k;
        }
    };
    const flat3 = pose => [pose.eye.x, pose.eye.y, pose.eye.z, pose.look.x, pose.look.y, pose.look.z, pose.fov];
    const pose3Of = a => ({ eye: { x: a[0], y: a[1], z: a[2] }, look: { x: a[3], y: a[4], z: a[5] }, fov: a[6] });
    const flat2 = pose => [pose.x, pose.z, pose.zoom];
    const pose2Of = a => ({ x: a[0], z: a[1], zoom: a[2] });
    const copy3 = pose => ({ eye: Object.assign({}, pose.eye), look: Object.assign({}, pose.look), fov: pose.fov });
    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const messageBusy = () => typeof $gameMessage !== "undefined" && !!$gameMessage && $gameMessage.isBusy();

    /** Frames for the move down from the tactical view, and back up to it: the least, and the most for the longest way. */
    C.SWOOP_IN = 22;
    C.SWOOP_OUT = 26;
    C.SWOOP_MOST = 36;
    /** A way of `distance` tiles takes this many frames, starting from `least`. */
    C.swoopFrames = (least, distance) => Math.round(clamp(least + (distance - 20) * 0.28, least, C.SWOOP_MOST));
    /** Between poses further apart than this (tiles) the move takes the swoop's time. */
    C.SWOOP_REACH = 12;
    /** How far behind the ideal pose the shown one follows, in frames. */
    C.FOLLOW = 3.5;
    /** Slow motion comes and goes by this much of the battle's speed a frame. */
    C.TIME_RAMP = 0.08;
    /** How slow the battle runs while the camera rides a round, and how many battle frames before the hit that begins. */
    C.RIDE_SLOW = 0.16;
    C.RIDE_LEAD = 14;
    /** The letterbox bars, each as a share of the screen's height. */
    C.BARS = 0.085;

    //-------------------------------------------------------------------------
    // The director: which shot plays, for how long, and when the view goes back.

    D.reset = function() {
        D._mode = "idle";       // "idle" | "shot" | "return"
        D._shot = null;
        D._frame = 0;
        D._seq = null;          // the action being filmed
        D._want3 = D._want2 = null;
        D._from3 = D._from2 = null;
        D._shown3 = D._shown2 = null;
        D._f3 = D._f2 = null;   // the springs
        D._blend = null;        // frames of the move into this shot, decided as its first pose is shown; 0 is a cut
        D._within = false;      // this shot follows another of the same action
        D._fromBase = true;     // the move started from the tactical view
        D._cut = false;
        D._cancel = false;
        D._lift = 0;
        D._skew = 1;
        D._returnFrames = C.RETURN_FRAMES;
        D._returnAsked = C.RETURN_FRAMES;
        D._returnHold = false;
        D._settled = false;
        D._tau = C.FOLLOW;
        D._slow = null;
        D._saved = null;        // the 2D view as it was
        D._flat = false;
        D._suspended = false;
        D._last = D._last || {};
    };
    D._tick = 0;
    D._stepped = -1;
    D._ts = 1;
    D._clock = 0;
    D._battleFrames = 0;    // frames of the battle (not of the screen) since the game started
    D._pending = null;
    D._pres = { hud: 1, bars: 0, raw: 0 };
    D.reset();
    D._last = {};
    D._lastActionShown = false;
    D._lastMoveShown = false;

    D.active = () => D._mode !== "idle";
    D.shot = () => (D._mode === "shot" ? D._shot : null);

    /** The battle waits while this is true. */
    D.isBusy = function() {
        if (D._pending) return true;
        if (D._mode === "shot") return D._frame < Math.min(D._shot.hold, C.MAX_FRAMES);
        // On the way back the battle waits for the camera: the next action never pulls it out of a move half made.
        return D._mode === "return" && D._returnHold && D._frame < D._returnFrames;
    };

    /** How fast the battle runs: 1, or less in slow motion. Eased, never a step. */
    D.timeScale = function() {
        return D._ts;
    };

    /** What a HUD fades by and how far the letterbox is in: the same object every call. */
    D.presentation = function() {
        return D._pres;
    };

    /** The tactical view's see-through ground is kept: on the way down from it, on the way back, in a shot that stays in it. */
    D.keepsRegion = function() {
        if (D._flat) return false;
        if (D._mode === "shot") {
            // A shot from above the field (the sweeps, the wide view of an area attack) keeps it open throughout.
            if (D._shot.light || D._shot.region) return true;
            return D._fromBase && (D._blend === null || (D._blend > 0 && D._frame < D._blend * 0.55));
        }
        return D._mode === "return" && D._frame > D._returnFrames * 0.45;
    };

    /** A Tactical battle is being fought on this map. */
    D.live = function() {
        return typeof $gameFight !== "undefined" && !!$gameFight && $gameFight.isActive() && $gameFight.isHere()
            && $gameFight.mode() === "tactical";
    };

    /** The world for a new shot, with every unit standing in it. */
    function stage() {
        const world = C.world();
        world.bodies = D.live() ? $gameFight.units({ alive: true }).map(unit => unitPoint(unit.id, world)).filter(Boolean) : [];
        world.scenery = scenery(world);
        return world;
    }

    /**
     * The tall scenery near the units, as upright cylinders: a tree's canopy
     * between the camera and its subject fills the picture, and the map's
     * solids know nothing of models. Sizes are read once per model event.
     */
    const sizes = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    function scenery(world) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        if (!world.is3D || !sizes || !R || !R.eventModelFootprint || !R.characterModelSpec || !world.bodies.length || typeof $gameMap === "undefined") return [];
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const body of world.bodies) { x0 = Math.min(x0, body.x); x1 = Math.max(x1, body.x); z0 = Math.min(z0, body.z); z1 = Math.max(z1, body.z); }
        const list = [];
        for (const event of $gameMap.events()) {
            if (!event || event._erased) continue;
            const x = event._realX + 0.5, z = event._realY + 0.5;
            if (x < x0 - 8 || x > x1 + 8 || z < z0 - 8 || z > z1 + 8 || $gameFight.unitOfEvent(event.eventId())) continue;
            let size = sizes.get(event);
            if (size === undefined) {
                size = null;
                try {
                    const spec = R.characterModelSpec(event);
                    if (spec) {
                        const foot = R.eventModelFootprint(event, spec);
                        const r = foot.rawX != null ? Math.max(foot.rawX, foot.rawZ) : Math.max(foot.halfX, foot.halfZ);
                        size = { r: r * 0.75, h: R.characterHeightTiles ? R.characterHeightTiles(event) : 2, crown: C.crownOf(spec, r) };
                    }
                } catch (error) { size = null; }
                sizes.set(event, size);
            }
            // Only what is big enough to hide a unit; a post or a crate is the passability check's.
            if (size && size.h >= 1.8 && size.r >= 0.45) {
                const y = world.ground(event);
                list.push({ x, z, y, h: size.h, r: size.r });
                // A tree: its crown spreads far past the trunk a unit bumps into, from a third of the way up.
                if (size.crown) list.push({ x, z, y: y + size.h * C.CROWN_FROM, h: size.h * (1 - C.CROWN_FROM), r: size.crown });
            }
        }
        return list;
    }

    /** How far behind the muzzle the camera that rides with a round starts, in the shooter's heights (the shooter stands 0.6 behind it). */
    C.ROUND_START = 0.3;

    /** The share of a tall model's height its crown starts at, and how much of its widest reach the crown fills. */
    C.CROWN_FROM = 0.3;
    C.CROWN_FILL = 0.8;

    /**
     * How far a model's top spreads, in tiles from its middle, when that is well past the footprint `r`
     * a unit bumps into (a tree's crown over its trunk); 0 for a model that is as wide as it stands.
     */
    C.crownOf = function(spec, r) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        const entry = R && R._glbCache && R.collisionKeysFor ? R._glbCache[R.collisionKeysFor(spec).model] : null;
        const extent = entry && entry.template && entry.template.userData ? entry.template.userData.glbSize : null;
        if (!extent) return 0;
        const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
        const scale = (spec.size > 0 ? spec.size : 2) / span * (spec.scale > 0 ? spec.scale : 1), stretch = spec.stretch || [1, 1, 1];
        const wide = Math.max(extent.x * stretch[0], extent.z * stretch[2]) * scale / 2 * C.CROWN_FILL;
        return wide > r * 1.5 ? wide : 0;
    };

    function unitPoint(id, world) {
        const unit = $gameFight.unit(id);
        const character = unit && !unit.gone ? $gameFight.character(unit) : null;
        return character ? C.point(character, world) : null;
    }
    const sidePoints = (team, world) => $gameFight.units({ team, alive: true }).map(unit => unitPoint(unit.id, world)).filter(Boolean);

    /** Where the camera is now on a 3D map, or null. */
    D.eye = function() {
        if (D._mode !== "idle" && D._shown3) return D._shown3.eye;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const live = scene && scene._spriteset && scene._spriteset._reactor3d;
        return live && live.camera ? live.camera.position : null;
    };

    /** Which side of the line from U to T a point is on: 1 right, -1 left. */
    C.sideOf = (eye, U, T) => ((T.x - U.x) * (eye.z - U.z) - (T.z - U.z) * (eye.x - U.x) >= 0 ? 1 : -1);

    /**
     * The side to try last. The camera stays on its side of the line between
     * the two (screen direction holds from the aim to the hit, and from the
     * tactical view into the shot); with no camera to go by, the side used last.
     */
    function avoid(name, U, T) {
        const eye = D.eye();
        if (eye && U && T && Math.hypot(T.x - U.x, T.z - U.z) > 0.01) return C.sideOf(eye, U, T) > 0 ? "left" : "right";
        return D._last[name];
    }

    /** Start a shot, from whatever is on screen. */
    D.play = function(shot) {
        const was = D._mode;
        if (was === "idle") D.take(shot);
        else if (!shot.light && !D._suspended) D.suspendView();
        D._within = was === "shot" && !D._shot.light;
        D._fromBase = was !== "shot" || !!D._shot.light;
        D._from3 = was === "idle" ? null : D._shown3;
        D._from2 = was === "idle" ? null : D._shown2;
        D._shot = shot;
        D._frame = 0;
        D._mode = "shot";
        D._blend = null;
        D._tau = shot.tau || C.FOLLOW;
        D._slow = null;
        if (shot.slow) D.slow(shot.slow.scale, shot.slow.frames);
        D._last[shot.name] = shot.variant;
        if (D._seq) D._seq.shots = (D._seq.shots || 0) + 1;
        D.compute();
        return shot;
    };

    /** Slow the battle to `scale` for `frames` (the setting allowing). */
    D.slow = function(scale, frames) {
        if (C.settings().slowMotion) D._slow = { scale, left: frames };
    };

    D.suspendView = function() {
        D._suspended = true;
        if (F.View && F.View.suspend) F.View.suspend();
    };

    /** Take the view: remember the 2D one exactly, and ask the tactical view to leave it alone. */
    D.take = function(shot) {
        D._flat = !C.world().is3D;
        if (D._flat && typeof $gameMap !== "undefined" && $gameMap && typeof $gameScreen !== "undefined" && $gameScreen) {
            D._saved = {
                displayX: $gameMap._displayX, displayY: $gameMap._displayY, parallaxX: $gameMap._parallaxX, parallaxY: $gameMap._parallaxY,
                zoomX: $gameScreen._zoomX, zoomY: $gameScreen._zoomY, zoomScale: $gameScreen._zoomScale,
                zoomScaleTarget: $gameScreen._zoomScaleTarget, zoomDuration: $gameScreen._zoomDuration
            };
        }
        D._shown3 = D._shown2 = null;
        D._f3 = D._f2 = null;
        // A shot that stays in the tactical view on a 3D map leaves that view running under it.
        if (D._flat || !(shot && shot.light)) D.suspendView();
    };

    /** Ease the view back over `frames`; with `hold` the battle waits for it. */
    D.release = function(frames, hold) {
        if (D._mode === "idle") return;
        D._from3 = D._shown3;
        D._from2 = D._shown2;
        D._mode = "return";
        D._shot = null;
        D._frame = 0;
        D._blend = null;
        D._settled = false;
        D._returnAsked = Math.max(1, frames || C.RETURN_FRAMES);
        D._returnFrames = D._returnAsked;
        D._returnHold = !!hold;
        D._tau = C.FOLLOW;
        D._slow = null;
    };

    /** The view is the map's again, exactly as it was. */
    D.finish = function() {
        const saved = D._saved;
        if (saved && typeof $gameMap !== "undefined" && $gameMap && typeof $gameScreen !== "undefined" && $gameScreen) {
            $gameMap._displayX = saved.displayX; $gameMap._displayY = saved.displayY;
            $gameMap._parallaxX = saved.parallaxX; $gameMap._parallaxY = saved.parallaxY;
            $gameScreen._zoomX = saved.zoomX; $gameScreen._zoomY = saved.zoomY; $gameScreen._zoomScale = saved.zoomScale;
            $gameScreen._zoomScaleTarget = saved.zoomScaleTarget; $gameScreen._zoomDuration = saved.zoomDuration;
        }
        const suspended = D._suspended;
        D.reset();
        if (suspended && F.View && F.View.resume) F.View.resume();
    };

    /** Stop now: a battle that ended, a scene that is leaving. */
    D.abort = function() {
        D._seq = null;
        D._pending = null;
        D._ts = 1;
        D._clock = 0;
        if (D._mode !== "idle") D.finish();
        else D._slow = null;
    };

    /** The player has seen enough: the view goes back and the rest of this action is not filmed. */
    D.skip = function() {
        if (D._seq) D._seq.muted = true;
        D.release(8, false);
    };

    /** A shot to start once the frame rate is steady and no message has come up; the battle waits for it. */
    D.queue = function(make, options) {
        D._pending = Object.assign({ make, waited: 0, calm: 0, settle: 4, max: 90, last: now() }, options);
    };

    function updatePending() {
        const p = D._pending;
        if (!D.live() || messageBusy() || C.settings().level === "off") { D._pending = null; return; }
        const t = now(), dt = t - p.last;
        p.last = t;
        p.waited++;
        // A shot never starts on a frame that hitched (a battle's first frames load its models and its windows).
        p.calm = dt < 40 ? p.calm + 1 : 0;
        if (p.waited < p.settle || (p.calm < 3 && p.waited < p.max)) return;
        D._pending = null;
        const shot = p.make();
        if (shot) D.play(shot);
    }

    function rampTime() {
        const slow = D._slow;
        const target = slow && slow.left > 0 ? slow.scale : 1;
        if (slow && slow.left > 0) slow.left--;
        const d = target - D._ts;
        D._ts = Math.abs(d) <= C.TIME_RAMP ? target : D._ts + Math.sign(d) * C.TIME_RAMP;
    }

    function easePresentation() {
        const shot = D._mode === "shot" ? D._shot : null;
        const on = !!shot && shot.bars !== false;
        const p = D._pres;
        p.raw = clamp(p.raw + clamp((on ? 1 : 0) - p.raw, -0.08, 0.08), 0, 1);
        p.bars = smoother(p.raw);
        p.hud = 1 - p.bars;
        // Cell highlights and the cursor are the tactical view's, not a close shot's.
        if (F.Marks) F.Marks.hidden = on;
    }

    /** What the current shot wants this frame. */
    D.compute = function() {
        const shot = D._shot;
        if (!shot) return;
        const t = CURVES[shot.curve](clamp(D._frame / Math.max(1, shot.frames), 0, 1));
        const t2 = shot.frames2 ? CURVES.inOut(clamp(D._frame / shot.frames2, 0, 1)) : t;
        const want = shot.track ? shot.track(D._frame) : null;
        D._want3 = want || mix3(shot.a, shot.b, t);
        D._want2 = want || mix2(shot.a2, shot.b2, t2);
    };

    /**
     * How the crane gets from one pose to another clear of the map's solids:
     * `{ lift, skew }` (0 for the straight way; else over what stands
     * between, cresting in the middle or, by a building at the low end, right
     * over that end), or null when no way is clear. `out`: the way back up.
     */
    C.clearWay = function(world, from, to, out) {
        const near = out ? 0.55 : 1.8;
        for (const [lift, skew] of [[0, 1], [3, 1], [6, 1], [6, near], [10, 1], [10, near], [16, 1], [16, near]]) {
            let clear = true;
            for (let k = 1; k <= 20 && clear; k++) {
                const e = k / 21, pose = C.swing(from, to, e, out ? Math.max(0, (e - 0.22) / 0.78) : Math.min(1, e * 1.35), lift, skew);
                const x = pose.eye.x, y = pose.eye.y, z = pose.eye.z;
                clear = !world.solid(x, y, z);
                // Along the middle of the way with room to spare: the camera follows the path a little behind it.
                if (clear && k >= 3 && k <= 18) clear = !(world.solid(x + 0.5, y, z) || world.solid(x - 0.5, y, z) || world.solid(x, y, z + 0.5) || world.solid(x, y, z - 0.5) || world.solid(x, y - 0.4, z));
            }
            if (clear) return { lift, skew };
        }
        return null;
    };

    /** The pose the camera should be at this frame on a 3D map, before the spring. */
    D.ideal3 = function(base) {
        if (D._mode === "shot") {
            const shot = D._shot, want = shot.lean ? shot.lean(base) : D._want3, from = D._from3 || base;
            if (D._blend === null) {
                // Decided once, as the shot's first frame is shown. A cut is asked for (an insert inside an
                // action) or forced by a wall in the crane's way; from the tactical view the camera always moves.
                const way = Math.hypot(want.eye.x - from.eye.x, want.eye.y - from.eye.y, want.eye.z - from.eye.z), far = way > C.SWOOP_REACH;
                const asked = shot.blend === 0 && D._within;
                const frames = far ? Math.max(C.swoopFrames(shot.swoop || C.SWOOP_IN, way), shot.blend) : Math.max(shot.blend, shot.swoop ? 10 : 12);
                const way3 = asked ? null : C.clearWay(C.world(), from, want);
                // No way down for a shot the battle can do without (a run): it is not filmed, rather than cut to.
                if (!asked && !way3 && shot.optional && !D._from3) { D._cancel = true; return base; }
                const cut = asked || !way3;
                D._lift = way3 ? way3.lift : 0;
                D._skew = way3 ? way3.skew : 1;
                D._blend = cut ? 0 : frames;
                D._cut = cut;
                if (!cut && shot.hold > 0) shot.hold = Math.max(shot.hold, frames + 12);
            }
            if (D._frame >= D._blend) return want;
            const k = D._frame / D._blend;
            return C.swing(from, want, smoother(k), smoother(k * 1.35), D._lift, D._skew);
        }
        if (D._mode === "return") {
            const from = D._from3 || base;
            if (D._blend === null) {
                const way = Math.hypot(base.eye.x - from.eye.x, base.eye.y - from.eye.y, base.eye.z - from.eye.z), far = way > C.SWOOP_REACH;
                const way3 = C.clearWay(C.world(), from, base, true);
                const clear = !!way3;
                D._lift = way3 ? way3.lift : 0;
                D._skew = way3 ? way3.skew : 1;
                D._returnFrames = !clear ? 1 : far ? Math.max(D._returnAsked, D._returnAsked < 12 ? 16 : C.swoopFrames(C.SWOOP_OUT, way)) : D._returnAsked;
                D._blend = D._returnFrames;
                D._cut = !clear;
            }
            const k = D._frame / D._returnFrames;
            // Pulling out, the eye leaves first and the look follows: the subject stays in the picture as it shrinks.
            return C.swing(from, base, smoother(k), smoother((k - 0.22) / 0.78), D._lift, D._skew);
        }
        return base;
    };

    /** The pose to show on a 3D map, given the pose the map camera placed this frame. */
    D.pose3 = function(base) {
        if (D._mode === "idle") return base;
        const ideal = D.ideal3(base);
        if (D._cancel) { D.finish(); return base; }
        if (!D._f3 || D._cut) {
            const target = flat3(D._f3 || D._cut ? ideal : base);
            D._f3 = { x: target, v: target.map(() => 0) };
            D._cut = false;
            D._stepped = D._tick;
        } else if (D._stepped !== D._tick) {
            // Once a frame of the scene, however often the camera is placed in it.
            D._stepped = D._tick;
            C.damp(D._f3, flat3(ideal), D._tau);
        }
        const shown = pose3Of(D._f3.x);
        if (D._mode === "return") {
            const x = D._f3.x, b = flat3(base);
            let gap = 0;
            for (let i = 0; i < 6; i++) gap = Math.max(gap, Math.abs(x[i] - b[i]));
            D._settled = gap < 0.02 && Math.abs(x[6] - b[6]) < 0.05;
        }
        D._shown3 = shown;
        return shown;
    };

    /** The pose to show on a flat map: what the saved view was looking at is the base. */
    D.pose2 = function() {
        const base = D.base2();
        let ideal = base;
        if (D._mode === "shot") {
            const from = D._from2 || base;
            // A flat map never jumps the whole picture: a cut is a whip of a few frames.
            if (D._blend === null) D._blend = Math.max(D._shot.blend === 0 ? 7 : 12, D._shot.blend);
            ideal = D._frame < D._blend ? mix2(from, D._want2, smoother(D._frame / D._blend)) : D._want2;
        } else if (D._mode === "return") {
            if (D._blend === null) D._blend = D._returnFrames = Math.max(D._returnAsked, 12);
            ideal = mix2(D._from2 || base, base, smoother(D._frame / D._returnFrames));
        }
        if (!D._f2) { const target = flat2(base); D._f2 = { x: target, v: target.map(() => 0) }; }
        else if (D._stepped !== D._tick) C.damp(D._f2, flat2(ideal), Math.min(D._tau, 3));
        D._stepped = D._tick;
        const shown = pose2Of(D._f2.x);
        if (D._mode === "return") D._settled = Math.abs(shown.x - base.x) < 0.02 && Math.abs(shown.z - base.z) < 0.02 && Math.abs(shown.zoom - base.zoom) < 0.004;
        D._shown2 = shown;
        return shown;
    };

    D.base2 = function() {
        const saved = D._saved;
        return { x: saved.displayX + $gameMap.screenTileX() / 2, z: saved.displayY + $gameMap.screenTileY() / 2, zoom: saved.zoomScale };
    };

    /** Scroll and zoom the flat map to this frame's pose. */
    D.apply2D = function() {
        if (!D._saved) return;
        const pose = D.pose2();
        const wide = $gameMap.screenTileX(), tall = $gameMap.screenTileY();
        $gameMap.setDisplayPos(pose.x - wide / 2, pose.z - tall / 2);
        // At the map's edge the scroll stops short; the zoom's centre brings the subject the rest of the way to the middle.
        const scale = Math.max(1, pose.zoom);
        const pivot = (at, display, span, size) => {
            if (scale <= 1.0001) return 0;
            const px = (at - display) / span * size;
            return clamp((px * scale - size / 2) / (scale - 1), 0, size);
        };
        const dx = $gameMap._displayX, dy = $gameMap._displayY;
        $gameScreen.setZoom(pivot(pose.x, dx, wide, Graphics.width), pivot(pose.z, dy, tall, Graphics.height), scale);
        $gameScreen._zoomScaleTarget = scale;
        $gameScreen._zoomDuration = 0;
    };

    /** Once a frame, at the scene's own rate (never slowed). */
    D.update = function() {
        D._tick++;
        rampTime();
        easePresentation();
        if (D._pending) updatePending();
        if (D._mode === "idle") return;
        const leaving = typeof SceneManager !== "undefined" && SceneManager.isSceneChanging && SceneManager.isSceneChanging();
        if (!D.live() || leaving) { D.abort(); return; }
        // A message is the game speaking: the view eases back under it and the rest of the action is left alone.
        if (messageBusy() && D._mode === "shot") {
            if (D._seq) D._seq.muted = true;
            D.release(14, false);
        }
        D._frame++;
        if (D._mode === "shot") {
            const shot = D._shot, seq = D._seq;
            if (seq && seq.ride && !seq.rode && !seq.muted) {
                // Time starts to slow just before the round leaves, so the flight is already slow when it does.
                if (!seq.slowed && D._battleFrames - seq.firedAt >= seq.slowAt) { seq.slowed = true; D.slow(C.RIDE_SLOW, 150); }
                // The round itself, the moment the action launches it.
                if (F.Stage && F.Stage.projectile && F.Stage.projectile()) D.ride();
            }
            if (C.settings().skip && D._frame >= C.SKIP_GUARD && D.skipPressed()) D.skip();
            else if (D._frame >= C.MAX_FRAMES) D.release(C.RETURN_FRAMES, false);
            else if (D._frame >= (shot.linger ? shot.hold : Math.max(shot.frames, shot.hold))) {
                const waited = $gameFight.awaitsPlayer && $gameFight.awaitsPlayer();
                // A shot that waits for the action's next beat stays (still pushing in); one with nothing more to show gives the view back.
                if (!shot.linger || waited || (seq && seq.ended) || (!seq && shot.name !== "move")) D.release(shot.light ? 22 : C.RETURN_FRAMES, !waited && !shot.light);
            }
        } else if (D._mode === "return" && D._frame >= D._returnFrames && (D._settled || D._frame >= D._returnFrames + 12)) {
            D.finish();
            return;
        }
        if (D._mode === "shot") D.compute();
        if (D._flat) D.apply2D();
    };

    D.skipPressed = function() {
        const key = typeof Input !== "undefined" && Input.isTriggered && (Input.isTriggered("ok") || Input.isTriggered("cancel"));
        const touch = typeof TouchInput !== "undefined" && ((TouchInput.isTriggered && TouchInput.isTriggered()) || (TouchInput.isCancelled && TouchInput.isCancelled()));
        return !!(key || touch);
    };

    /** The letterbox: two bars on the map scene, over the map and under the windows. */
    D.drawBars = function(scene) {
        const amount = D._pres.bars;
        let box = scene._fightLetterbox;
        if (amount <= 0.001) { if (box) box.visible = false; return; }
        if (typeof Sprite === "undefined" || typeof Bitmap === "undefined" || typeof Graphics === "undefined" || !scene._spriteset || !scene.addChildAt) return;
        if (!box) {
            box = scene._fightLetterbox = new Sprite();
            const bitmap = new Bitmap(8, 8);
            bitmap.fillAll("#000000");
            box._top = new Sprite(bitmap);
            box._bottom = new Sprite(bitmap);
            box.addChild(box._top);
            box.addChild(box._bottom);
            scene.addChildAt(box, scene.children.indexOf(scene._spriteset) + 1);
        }
        const height = Math.round(Graphics.height * C.BARS * amount);
        box.visible = true;
        box._top.scale.set(Graphics.width / 8, height / 8);
        box._bottom.scale.set(Graphics.width / 8, height / 8);
        box._bottom.y = Graphics.height - height;
    };

    //-------------------------------------------------------------------------
    // The battle, as the feed tells it.

    /** What kind of action this is, for the camera. */
    C.classify = function(payload, U, targets, tactics) {
        const others = targets.filter(p => p.c !== U.c);
        if (!others.length && !(payload.cell && targets.length === 0)) return "self";
        const shape = tactics && tactics.area ? tactics.area.shape : "";
        if (others.length > 1 || (shape && shape !== "single" && shape !== "self")) return "area";
        if (!others.length) return "area";
        const dist = Math.hypot(others[0].x - U.x, others[0].z - U.z);
        if (payload.ranged && dist >= C.SNIPER_RANGE && !(tactics && tactics.los === false)) return "sniper";
        return payload.ranged ? "ranged" : "melee";
    };

    /**
     * How an action of this style is filmed at this level: "full" (its own
     * shots), "lean" (the tactical view leans toward it) or "none". At Some
     * the long shot and the area attack are filmed; the rest stay in the
     * tactical view, so the shots that come are the ones worth cutting to
     * (a kill still brings the camera down, from any of them).
     */
    C.treatment = function(style, level, reaction) {
        if (level === "off") return "none";
        if (level === "every") return "full";
        // A reaction (overwatch) interrupts someone else's move: at Some it never takes the camera, whatever its range.
        if (reaction) return style === "self" ? "none" : "lean";
        if (style === "sniper" || style === "area") return "full";
        return style === "self" ? "none" : "lean";
    };
    C.shows = (style, level) => C.treatment(style, level) === "full";

    /** The round of a long shot is in the air: the camera goes with it. */
    D.ride = function() {
        const seq = D._seq;
        seq.rode = true;
        const world = stage();
        const U = unitPoint(seq.unitId, world);
        const T = seq.targetIds.map(id => unitPoint(id, world)).find(p => p && (!U || p.c !== U.c));
        if (!U || !T) return;
        const side = avoid("round", U, T) === "right" ? -1 : 1;
        const slow = D._slow;
        const shot = C.shots.round(world, U, T, 60, 1, () => F.Stage.projectile(), side);
        D.play(shot);
        // The flight is stretched (the slowing that began before it carries on); time comes back as the round lands.
        D._slow = slow && slow.left > 0 ? slow : null;
        if (!D._slow) D.slow(C.RIDE_SLOW, 150);
        shot.landed = () => { if (D._slow && D._shot === shot) D._slow = null; };
    };

    const handlers = {
        mapBattleStart(payload) {
            D.abort();
            D._last = {};
            D._lastActionShown = D._lastMoveShown = false;
            if (payload.mode !== "tactical" || !D.live()) return;
            D._established = true;
            D.queue(() => {
                const world = stage();
                const allies = sidePoints("ally", world), enemies = sidePoints("enemy", world);
                // The quarter the Tactical view chose for this battle: the sweep ends looking that way.
                let toward = null;
                try { toward = F.View && F.View.direction ? F.View.direction() : null; } catch (error) { toward = null; }
                return allies.length ? C.shots.establish(world, allies, enemies, D._last.establish, toward) : null;
            }, { settle: 6, max: 120 });
        },

        fightTeamTurn(payload) {
            // Straight after the opening sweep the field has just been shown.
            const fresh = D._established;
            D._established = false;
            if (fresh || D.active() || D._pending || C.settings().level !== "every") return;
            const team = payload.team;
            D.queue(() => {
                const world = stage();
                const units = sidePoints(team, world);
                return units.length < 2 ? null : C.shots.phase(world, units, sidePoints(F.oppose ? F.oppose(team) : "", world), D._last.phase);
            }, { settle: 4, max: 30 });
        },

        fightUnitTurn(payload) {
            D._established = false;
            // The player's unit is up: whatever is still on screen makes way.
            if (payload.player && D._mode === "shot" && D._frame >= D._shot.hold) D.release(C.RETURN_FRAMES, false);
        },

        fightMoveStart(payload) {
            if (!payload.long || D.isBusy()) return;
            // Several units set off together: the run already on screen keeps the camera.
            if (D._mode === "shot" && D._shot.name === "move" && D._frame < 40) return;
            const level = C.settings().level;
            // Some: only a real run (eight tiles or more), and not two in a row.
            const steps = payload.path ? payload.path.length : 0;
            const show = level === "every" || (steps >= 8 && !D._lastMoveShown);
            D._lastMoveShown = show;
            if (!show) return;
            const world = stage();
            const U = unitPoint(payload.unitId, world);
            if (!U) return;
            D._seq = null;
            D.play(C.shots.move(world, U, payload.path, D._last.move)).unitId = payload.unitId;
        },

        fightMoveEnd(payload) {
            if (D._mode !== "shot" || D._shot.name !== "move" || D._shot.unitId !== payload.unitId) return;
            // A run already over stays on screen long enough to be read, and what the unit does next waits for that.
            if (D._frame < 40) { D._shot.linger = false; D._shot.frames = D._shot.hold = 40; }
            else D.release(C.RETURN_FRAMES, false);
        },

        fightAim(payload) {
            const settings = C.settings();
            // Actions playing side by side (a big battle): the one on screen keeps the camera until it has ended.
            if (payload.quick && D._seq && !D._seq.ended && D._mode === "shot" && !D._shot.light) return;
            const world = stage();
            const U = unitPoint(payload.unitId, world);
            if (!U) return;
            const targets = (payload.targetIds || []).map(id => unitPoint(id, world)).filter(Boolean);
            const unit = $gameFight.unit(payload.unitId);
            const item = payload.kind === "item" ? (typeof $dataItems !== "undefined" ? $dataItems[payload.itemId] : null)
                : (typeof $dataSkills !== "undefined" ? $dataSkills[payload.itemId] : null);
            let tactics = null;
            try { tactics = F.tactics && item ? F.tactics($gameFight.battler(unit), item) : null; } catch (error) { tactics = null; }
            const style = C.classify(payload, U, targets, tactics);
            let info = null;
            try { info = F.Stage && F.Stage.sequenceInfo ? F.Stage.sequenceInfo(payload) : null; } catch (error) { info = null; }
            const seq = D._seq = { unitId: payload.unitId, targetIds: (payload.targetIds || []).slice(), kind: payload.kind, style,
                cell: payload.cell ? { x: payload.cell.x + 0.5, y: 0, z: payload.cell.y + 0.5, h: 1.5 } : null,
                info, authored: !!(info && info.cameraSteps > 0), auto: false, lean: false, muted: false, ended: false, impacts: 0, shots: 0 };
            if (seq.cell) seq.cell.y = targets.length ? targets[0].y : U.y;
            // A sequence with its own camera steps is filmed by those.
            // In an army battle a unit acting by itself is over in a third of a second (`quick`): only Every films it.
            seq.quick = !!payload.quick && settings.level !== "every";
            const treatment = seq.authored || seq.quick ? "none" : C.treatment(style, settings.level, !!payload.overwatch);
            seq.auto = treatment === "full";
            seq.lean = treatment === "lean";
            const T = targets.find(p => p.c !== U.c);
            if (seq.lean && T) { D.play(C.shots.lean(world, U, T)); return; }
            if (!seq.auto) return;
            if (style === "sniper") D.play(C.shots.sight(world, U, T, avoid("sight", U, T)));
            else if (style === "ranged") D.play(C.shots.aim(world, U, T, avoid("aim", U, T)));
            else if (style === "melee") D.play(C.shots.melee(world, U, T, avoid("melee", U, T)));
            else if (style === "area") seq.wide = D.play(C.shots.area(world, U, targets.filter(p => p.c !== U.c), seq.cell, D._last.area));
            else D.play(C.shots.reveal(world, [U], D._last.reveal)).hold = 24;
        },

        fightFire(payload) {
            const seq = D._seq;
            if (!seq || seq.unitId !== payload.unitId || !seq.auto || seq.muted) return;
            const world = stage();
            const U = unitPoint(seq.unitId, world);
            if (!U) return;
            const stageFlight = F.Stage && F.Stage.projectile ? () => F.Stage.projectile() : null;
            if (seq.style === "sniper") {
                // With a sequence player the camera waits for the round itself (`ride`); without one the flight is the line.
                if (stageFlight) {
                    const at = seq.info && seq.info.impactAt && seq.info.impactAt.length ? seq.info.impactAt[0] : 0;
                    seq.ride = true;
                    seq.firedAt = D._battleFrames;
                    seq.slowAt = at > 0 ? Math.max(0, at - C.RIDE_LEAD) : 1e9;
                    return;
                }
                const T = seq.targetIds.map(id => unitPoint(id, world)).find(p => p && p.c !== U.c);
                if (!T) return;
                const slowOn = C.settings().slowMotion;
                // The flight on screen, and how slow the battle runs so the hit lands as the camera arrives.
                let frames = clamp(Math.round(Math.hypot(T.x - U.x, T.z - U.z) * 3.6), 36, 60), slow = slowOn ? 0.3 : 1;
                const at = seq.info && seq.info.impactAt && seq.info.impactAt.length ? seq.info.impactAt[0] : 0;
                if (at > 0) { slow = slowOn ? clamp(at / frames, 0.25, 1) : 1; frames = Math.max(36, Math.round(at / slow)); }
                D.play(C.shots.round(world, U, T, frames, slow, null, avoid("round", U, T) === "right" ? -1 : 1));
            } else if (seq.style === "area" && seq.wide && payload.kind === "item") {
                D.play(C.shots.arc(world, U, seq.wide, clamp(Math.round(axis(U, seq.wide.centre).dist * 3), 36, 50), stageFlight));
            }
        },

        fightImpact(payload) {
            const seq = D._seq;
            if (!seq || seq.unitId !== payload.unitId || seq.muted || seq.quick) return;
            if (C.settings().level === "off") return;
            seq.impacts++;
            const result = payload.defeated ? "kill" : (payload.missed || payload.evaded) ? "miss" : payload.critical ? "crit" : "hit";
            const world = stage();
            const U = unitPoint(seq.unitId, world), T = unitPoint(payload.targetId, world);
            const current = D.shot();
            if (!U || !T || payload.heal || T.c === U.c) return;
            if (current && current.name === "impact") {
                // Already on the result: the shot stays (a second hit, a second target), and a kill deepens it.
                if (result === "kill" && current.result !== "kill") {
                    current.result = "kill";
                    D.slow(0.4, 44);
                    current.hold = Math.max(current.hold, D._frame + 54);
                }
                return;
            }
            if (seq.authored || seq.style === "area" || seq.shots >= 3) {
                // The sequence's own camera, the wide view or a third shot stays; the moment still slows.
                if (result === "kill") D.slow(0.4, 36);
                if (current) current.hold = Math.max(current.hold, D._frame + 34);
                return;
            }
            // Left in the tactical view: only a kill brings the camera down.
            if (!seq.auto && result !== "kill") return;
            if (seq.style === "melee" && current && current.name === "melee" && result !== "kill") {
                if (result === "crit") D.slow(0.5, 16);
                current.hold = Math.max(current.hold, D._frame + 34);
                current.linger = false;
                return;
            }
            const shot = C.shots.impact(world, U, T, result, avoid("impact", U, T));
            shot.targetId = payload.targetId;
            D.play(shot);
        },

        fightActionEnd(payload) {
            const seq = D._seq;
            if (!seq || seq.unitId !== payload.unitId) return;
            seq.ended = true;
            // Nothing landed (a skill on oneself, a sequence with no impact): the view goes back now.
            const current = D.shot();
            if (current && current.linger && D._frame >= current.hold) D.release(current.light ? 22 : C.RETURN_FRAMES, !current.light);
            if (!D.active()) D._seq = null;
        },

        fightUnitSpawned(payload) {
            if (C.settings().level === "off" || !D.live()) return;
            const world = stage();
            const P = unitPoint(payload.unitId, world);
            if (!P) return;
            const current = D.shot();
            if (current && current.name === "reveal" && current.points) {
                // Several at once are one shot of the group: the camera re-aims while it is still on its way.
                if (D._frame > 12 || current.points.some(p => p.c === P.c)) return;
                const points = current.points.concat([P]);
                const wider = C.shots.reveal(world, points, null);
                Object.assign(current, { a: wider.a, b: wider.b, a2: wider.a2, b2: wider.b2, subjects: wider.subjects, points });
                return;
            }
            if ((current && D.isBusy()) || D._pending) return;
            D.play(C.shots.reveal(world, [P], D._last.reveal)).points = [P];
        },

        mapBattleEnd() {
            D.abort();
        }
    };

    /** One event from the feed. */
    D.handle = function(name, payload) {
        const handler = handlers[name];
        if (!handler) return;
        if (name !== "mapBattleEnd" && (C.settings().level === "off" || !D.live())) return;
        handler(payload || {});
    };

    /**
     * An Action Sequence starts playing on the map (from the sequence
     * player): `{ unitId, targetIds, cameraSteps, impactAt, length }`. One
     * with camera steps is filmed by those, not by the automatic shots.
     */
    D.sequenceStart = function(info) {
        const seq = D._seq;
        if (!seq || !info || seq.unitId !== info.unitId) return;
        seq.info = info;
        if (info.cameraSteps > 0 && !seq.authored) {
            seq.authored = true;
            seq.auto = false;
            seq.lean = false;
            if (D._mode === "shot") D.release(C.RETURN_FRAMES, false);
        }
    };

    /**
     * A camera step of an Action Sequence playing on the map. `context` is
     * `{ user, target, targets }` (map characters). Returns false when the
     * camera stays where it is (level Off, or no battle).
     */
    D.sequenceCamera = function(step, context) {
        if (!step || !context || !context.user || C.settings().level === "off" || !D.live()) return false;
        if (D._seq && D._seq.muted) return true;
        if (D._seq) { D._seq.authored = true; D._seq.auto = false; D._seq.lean = false; }
        if (step.anchor === "home") { D.release(Math.max(1, step.duration || C.RETURN_FRAMES), false); return true; }
        const world = stage();
        const target = context.target || (context.targets && context.targets[0]) || null;
        const U = C.point(context.user, world), T = target ? C.point(target, world) : null;
        D.play(C.shots.authored(world, U, T, step, T ? avoid("authored", U, T) : D._last.authored));
        return true;
    };

    /** The characters the cutaway opens walls and roofs for during a shot; null when the view is the map's. */
    D.cutSubjects = function() {
        const shot = D.shot();
        return shot && !shot.light && !shot.region && shot.subjects && shot.subjects.length ? shot.subjects : null;
    };

    //-------------------------------------------------------------------------
    // Engine hooks.

    if (typeof ReactorEvents !== "undefined" && ReactorEvents.on) {
        for (const name of Object.keys(handlers)) ReactorEvents.on(name, payload => D.handle(name, payload));
    }

    if (typeof Scene_Map !== "undefined") {
        const update = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            D.update();
            D.drawBars(this);
            update.call(this);
        };

        // Slow motion: the map's own update on a fraction of the frames.
        const updateMainMultiply = Scene_Map.prototype.updateMainMultiply;
        Scene_Map.prototype.updateMainMultiply = function() {
            const scale = D.timeScale();
            if (scale >= 1) { D._clock = 0; D._battleFrames++; updateMainMultiply.call(this); return; }
            D._clock += scale;
            if (D._clock >= 1) { D._clock -= 1; D._battleFrames++; updateMainMultiply.call(this); }
        };

        // The view is given back before the map is left or saved from.
        const stop = Scene_Map.prototype.stop;
        Scene_Map.prototype.stop = function() {
            D.abort();
            D._pres.raw = D._pres.bars = 0;
            D._pres.hud = 1;
            if (F.Marks) F.Marks.hidden = false;
            stop.call(this);
        };
    }

    // Effects slow with the battle: the effect player is stepped by the battle's speed.
    if (typeof SceneManager !== "undefined" && SceneManager.updateEffekseer) {
        const updateEffekseer = SceneManager.updateEffekseer;
        SceneManager.updateEffekseer = function() {
            const scale = D.timeScale(), player = typeof Graphics !== "undefined" ? Graphics.effekseer : null;
            if (scale >= 1 || !player || typeof player.update !== "function") return updateEffekseer.call(this);
            const own = Object.prototype.hasOwnProperty.call(player, "update"), update = player.update;
            player.update = function(frames) { return update.call(this, (frames || 1) * scale); };
            try { return updateEffekseer.call(this); } finally { if (own) player.update = update; else delete player.update; }
        };
    }

    if (typeof Reactor3D !== "undefined" && Reactor3D.Camera && Reactor3D.Camera.update) {
        // The shot goes over whatever the map camera placed: the map camera's own state is never touched.
        const cameraUpdate = Reactor3D.Camera.update;
        Reactor3D.Camera.update = function(spriteset) {
            const placed = cameraUpdate.call(this, spriteset);
            if (placed && D.active() && !D._flat) D.apply3D(spriteset);
            return placed;
        };

        D.apply3D = function(spriteset) {
            const live = spriteset._reactor3d, camera = live.camera;
            const forward = camera.getWorldDirection(D._forward || (D._forward = new THREE.Vector3()));
            const zoom = typeof $gameScreen !== "undefined" && $gameScreen ? Number($gameScreen.zoomScale()) || 1 : 1;
            const reach = (live.cameraCurrent && live.cameraCurrent.distance > 0 ? live.cameraCurrent.distance : 12) / zoom;
            const eye = camera.position;
            const pose = D.pose3({ eye: { x: eye.x, y: eye.y, z: eye.z },
                look: { x: eye.x + forward.x * reach, y: eye.y + forward.y * reach, z: eye.z + forward.z * reach }, fov: camera.fov });
            // Never under the ground: lifted over it, by an amount that changes smoothly as the camera travels.
            const world = C.world();
            const floor = world.groundAt ? world.groundAt(pose.eye.x, pose.eye.z) + 0.45 : -Infinity;
            camera.position.set(pose.eye.x, Math.max(pose.eye.y, floor), pose.eye.z);
            if (camera.fov !== pose.fov) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
            camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
            camera.updateMatrixWorld();
        };

        // Walls and roofs open for who the shot is of, not for the player.
        const MapScene = Reactor3D.MapScene;
        if (MapScene && MapScene.prototype.updateCutaway) {
            const updateCutaway = MapScene.prototype.updateCutaway;
            MapScene.prototype.updateCutaway = function(camera, mapData, character, others) {
                const subjects = D._flat ? null : D.cutSubjects();
                if (subjects) return updateCutaway.call(this, camera, mapData, subjects[0], subjects.slice(1));
                return updateCutaway.call(this, camera, mapData, character, others);
            };
        }

        // 3D models animate at the battle's speed.
        if (Reactor3D.modelAnimationSpeed) {
            const modelAnimationSpeed = Reactor3D.modelAnimationSpeed;
            Reactor3D.modelAnimationSpeed = function(character) {
                const speed = modelAnimationSpeed.call(this, character);
                const scale = D.timeScale();
                return scale < 1 ? Math.max(1, speed * scale) : speed;
            };
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
