//=============================================================================
// reactor_fight_stage.js — Action Sequences on the live map
//=============================================================================
//
// A battle on the map plays an action through the same sequence player the
// battle scene uses (ReactorBattleData.Player: branches, waits, concurrent
// steps, the timeline). This file is the map's side of it: the units are map
// characters, as 3D models or as sprites, on a 3D map or a flat one.
//
// The fight (reactor_fight.js) says who acts and lands the result; the stage
// plays the run:
//
//   Stage.begin(run, ctx)   true when the stage plays this run
//   Stage.update(ctx)       one frame; false when the run has ended
//   Stage.end(run, ctx, interrupted)
//   Stage.isBusy()          a unit is still easing back to its cell
//
// Any number of runs play at once, each with its own run object and context.
// `run.rate` plays one faster (2: twice as fast); `run.side` keeps it from
// the camera.
//
// A unit never leaves its cell: a move step moves where it is drawn
// (`_realX`/`_realY`), and the unit is back on its cell when the run ends.
// An action no sequence is assigned to plays a built-in one (`defaultSequence`).
//
// Distances on the grid (`mapSequence`): a sequence is authored for the
// battle scene, where the sides stand eight tiles apart. On the map
//   - home is the unit's cell;
//   - a move to the target stops where the mover's reach meets the target's
//     body (`clearance`: a weapon's length or an arm's, never inside either
//     body), half the authored standoff when that is farther, and travels at
//     most MAX_TRAVEL tiles; two that already stand nearer than that do not
//     close in: the mover takes half a pace back and strikes from there;
//   - a step forward, backward or aside is half as long, along the line to
//     the target rather than across the screen;
//   - a screen position means home.

(function(root) {
    "use strict";

    const F = root.ReactorFight || (root.ReactorFight = {});
    const Stage = {};
    F.Stage = Stage;

    /** How near a body comes to the middle of its target's cell, in tiles. */
    Stage.TILE_STANDOFF = 0.6;
    /** The battle scene's spacing to the grid's: standoffs and steps are this much of what was authored. */
    Stage.GRID_SCALE = 0.5;
    /** The longest lunge, in tiles. */
    Stage.MAX_TRAVEL = 1.5;
    /** How far a unit steps back from one it stands too near to strike, in tiles. */
    Stage.BACK_PACE = 0.5;
    /** A tracer's width as a share of its distance from the camera: never thinner, never thicker. */
    Stage.TRACER_THIN = 0.0022;
    Stage.TRACER_THICK = 0.0045;
    /** Frames between the hits of an action that lands more than once. */
    Stage.HIT_GAP = 7;
    /** Frames a unit takes to ease back to its cell, and a model out of its last pose. */
    Stage.SETTLE_FRAMES = 8;
    /** A run that has not ended by now is ended (five minutes and a little). */
    Stage.MAX_FRAMES = 18600;
    Stage.SUPPORTED = ["move", "motion", "sound", "animation", "projectile", "weapon", "impact", "wait", "camera",
        "target", "clearTargets", "branch", "elseIf", "else", "end", "eval", "event", "formula", "element",
        "hp", "mp", "tp", "buff", "state", "kill", "item", "switch", "variable", "direction", "jump", "leap", "float", "fall",
        "opacity", "flash", "tint", "shake", "whiten", "balloon", "picture", "icon", "bgm", "bgs", "se", "movie"];

    const data = () => root.ReactorBattleData;
    const reactor3d = () => (typeof Reactor3D !== "undefined" ? Reactor3D : null);
    const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
    const frameCount = () => (typeof Graphics !== "undefined" ? Graphics.frameCount : 0);

    //-------------------------------------------------------------------------
    // Facing: a pose's yaw (0 down, 90 right, 180 up, -90 left) and a character's direction.

    const YAWS = { 2: 0, 3: 45, 6: 90, 9: 135, 8: 180, 7: -135, 4: -90, 1: -45 };
    const DIR8 = [2, 3, 6, 9, 8, 7, 4, 1];
    const DIR4 = [2, 6, 8, 4];
    Stage.yawOfDirection = direction => (YAWS[direction] !== undefined ? YAWS[direction] : 0);
    Stage.dir8OfYaw = yaw => DIR8[((Math.round(number(yaw) / 45) % 8) + 8) % 8];
    Stage.dir4OfYaw = yaw => DIR4[((Math.round(number(yaw) / 90) % 4) + 4) % 4];

    Stage.face = function(character, yaw) {
        const d4 = Stage.dir4OfYaw(yaw), d8 = Stage.dir8OfYaw(yaw);
        if (character.direction() !== d4) character.setDirection(d4);
        if (d8 !== d4 || (character._reactorDir8 && character._reactorDir8 !== d4)) character._reactorDir8 = d8;
    };

    /** Whether the map is drawn through the 3D camera. */
    Stage.is3D = function() {
        const R = reactor3d();
        if (!R || !R.viewport || !R.shouldRender3D || typeof $dataMap === "undefined") return false;
        const viewport = R.viewport();
        return !!(viewport && viewport.camera && viewport.camera() && R.shouldRender3D($dataMap));
    };

    //-------------------------------------------------------------------------
    // The grid's distances.

    /**
     * The sequence as the map plays it: every move of one unit becomes a move
     * to a point worked out by the rules at the top of this file. `homes` are
     * the units' cells by role (`user`, `target`, `target0`…).
     */
    Stage.mapSequence = function(sequence, homes, clear) {
        const B = data();
        const at = {};
        const steps = [];
        const targetKeys = Object.keys(homes).filter(key => /^target[0-9]+$/.test(key));
        for (const step of sequence.steps || []) {
            if (!step || step.type !== "move") { steps.push(step); continue; }
            const key = B.roleKey(step);
            // A move of every target is one move each, begun together.
            const keys = key === "allTargets" ? targetKeys : [key];
            if (!keys.length || !keys.every(k => homes[k])) { steps.push(step); continue; }
            keys.forEach((k, i) => {
                const home = homes[k], from = at[k] || home;
                // A target's "forward" is toward the user; anyone else's is toward the target.
                const facing = k.startsWith("target") ? (homes.user || home) : (homes.target || home);
                const goal = Stage.mapGoal(step, from, home, facing, clear ? clear(k) : 0);
                at[k] = goal;
                const out = Object.assign({}, step, { moveMode: "position", x: goal.x, y: goal.y, z: goal.z });
                if (keys.length > 1 || key === "allTargets") {
                    out.id = step.id + ":" + k;
                    out.role = "target";
                    out.targetIndex = Number(k.slice(6));
                    if (i < keys.length - 1) out.concurrent = true;
                }
                steps.push(out);
            });
        }
        return Object.assign({}, sequence, { steps });
    };

    /**
     * Where one move ends on the grid: `from` where the unit is, `home` its
     * cell, `facing` the cell it faces, `clear` how near the two may come
     * (middle to middle; TILE_STANDOFF when not given).
     */
    Stage.mapGoal = function(step, from, home, facing, clear) {
        const S = Stage.GRID_SCALE, room = clear > 0 ? clear : Stage.TILE_STANDOFF;
        let ux = facing.x - home.x, uy = facing.y - home.y;
        const distance = Math.hypot(ux, uy);
        if (distance > 1e-6) { ux /= distance; uy /= distance; } else {
            const yaw = number(home.facing) * Math.PI / 180;
            ux = Math.sin(yaw); uy = Math.cos(yaw);
        }
        const x = number(step.x), y = number(step.y), z = number(step.z);
        const mode = step.moveMode || "anchor";
        const along = (base, forward, aside) => ({ x: base.x + ux * forward - uy * aside, y: base.y + uy * forward + ux * aside, z });
        // As near as the bodies allow; cells nearer than that: half a pace back, no nearer.
        const need = distance > 1e-6 ? (distance < room ? Math.min(room, distance + Stage.BACK_PACE) : room) : 0;
        const fit = goal => {
            const dx = goal.x - facing.x, dy = goal.y - facing.y, d = Math.hypot(dx, dy);
            if (!need || d >= need - 1e-9) return goal;
            if (d > 1e-6) { goal.x = facing.x + dx / d * need; goal.y = facing.y + dy / d * need; } else { goal.x = facing.x - ux * need; goal.y = facing.y - uy * need; }
            return goal;
        };
        if (mode === "position") return { x: home.x, y: home.y, z };
        if (mode === "forward" || mode === "backward") return fit(along(from, x * S * (mode === "backward" ? -1 : 1), y * S));
        if (step.anchor === "target" || step.anchor === "approach") {
            if (distance <= 1e-6) return { x: home.x, y: home.y, z };
            // Short of the target (the usual strike) or past it (a dash through).
            let standoff = Math.max(room, Math.abs(x) * S);
            if (x > 0) return along(facing, standoff, y * S);
            standoff = distance < room ? need : Math.min(distance, Math.max(standoff, distance - Stage.MAX_TRAVEL));
            return along(facing, -standoff, y * S);
        }
        return x || y ? fit(along(home, x * S, y * S)) : along(home, 0, 0);
    };

    /**
     * How much room a body takes toward (ux, uy), in tiles from its middle:
     * a standing figure its depth (arms held out at rest are not its body),
     * anything else its footprint that way; a sprite a third of a tile.
     */
    Stage.bodyRadius = function(character, ux, uy) {
        const R = reactor3d();
        const spec = R && R.characterModelSpec && R.eventModelFootprint ? R.characterModelSpec(character) : null;
        if (!spec) return 0.3;
        const foot = R.eventModelFootprint(character, spec);
        const yaw = foot.yaw || 0, lx = ux * Math.cos(yaw) - uy * Math.sin(yaw), lz = ux * Math.sin(yaw) + uy * Math.cos(yaw);
        const toward = foot.rawX * Math.abs(lx) + foot.rawZ * Math.abs(lz);
        return Math.max(0.2, Stage.stands(character, foot) ? Math.min(foot.rawX, foot.rawZ, toward) : toward);
    };

    /** Whether a model is a standing figure (taller than it is wide or deep) rather than a vehicle or a beast. */
    Stage.stands = function(character, foot) {
        return Stage.heightOf(character) > 1.6 * Math.max(foot.rawX, foot.rawZ) || Stage.heightOf(character) > 3 * Math.min(foot.rawX, foot.rawZ);
    };

    /** How far a unit strikes from its middle: an arm, and the weapon in it. */
    Stage.reach = function(character, battler, ux, uy) {
        const R = reactor3d();
        const spec = R && R.characterModelSpec && R.eventModelFootprint ? R.characterModelSpec(character) : null;
        const weapon = battler && battler.weapons ? battler.weapons()[0] : null;
        if (!spec) return 0.35 + (weapon ? 0.25 : 0);
        const foot = R.eventModelFootprint(character, spec);
        if (!Stage.stands(character, foot)) return Stage.bodyRadius(character, ux, uy) + 0.15;
        const held = weapon && R.databaseModelSpec ? R.databaseModelSpec("weapons", weapon.id) : null;
        return 0.36 * Stage.heightOf(character) + (held ? 0.8 * (held.size > 0 ? held.size : 1) * (held.scale > 0 ? held.scale : 1) : weapon ? 0.25 : 0);
    };

    /** How near `character` comes to `other` to strike it, middle to middle: its reach to the other's body, never inside either. */
    Stage.clearance = function(character, battler, other) {
        let ux = other._x - character._x, uy = other._y - character._y;
        const distance = Math.hypot(ux, uy);
        if (distance < 1e-6) return Stage.TILE_STANDOFF;
        ux /= distance; uy /= distance;
        return Stage.bodyRadius(other, -ux, -uy) + Math.max(Stage.bodyRadius(character, ux, uy) + 0.1, 0.85 * Stage.reach(character, battler, ux, uy));
    };

    //-------------------------------------------------------------------------
    // The built-in sequences, for an action nothing is assigned to.

    /** What an action is, for the sequence it gets: melee, ranged, magic, item, recovery or area. */
    Stage.kindOf = function(action, info = {}) {
        const item = action.item ? action.item() : null;
        if (item && typeof DataManager !== "undefined" && DataManager.isItem && DataManager.isItem(item)) return "item";
        if ((action.isRecover && action.isRecover()) || (action.isForFriend && action.isForFriend())) return "recovery";
        if ((action.isForAll && action.isForAll()) || info.area) return "area";
        if (!(action.isAttack && action.isAttack()) && !(action.isPhysical && action.isPhysical())) return "magic";
        return number(info.reach) >= 2 ? "ranged" : "melee";
    };

    /**
     * The sequence an action of that kind plays when it has none: the same
     * steps an authored one is made of. `info`: `reach` (tiles to the
     * target), `self` (the user is the only target), `magical`.
     */
    Stage.defaultSequence = function(kind, info = {}) {
        const B = data();
        const step = (type, extra) => B.step(type, extra);
        const turn = info.self ? [] : [step("direction", { direction: "targets", duration: 0 })];
        const hit = [step("animation", { animationSource: "action", role: "allTargets", animationId: 0, duration: 0 }), step("impact", { role: "allTargets" })];
        const flight = Math.max(8, Math.min(24, Math.round(number(info.reach || 3) * 4)));
        const draw = step("weapon", { mode: "show", iconSource: "weapon", attachment: "rightHand", duration: 0 });
        const stow = step("weapon", { visible: false, duration: 0 });
        const idle = step("motion", { motion: "idle", duration: 0 });
        let steps;
        if (kind === "melee") {
            steps = [...turn, draw, step("motion", { motion: "attack", duration: 0 }),
                step("move", { anchor: "approach", x: -1.2, duration: 10, face: "target" }),
                ...hit, step("wait", { duration: 10 }), stow,
                step("move", { duration: 14 }), idle];
        } else if (kind === "ranged") {
            steps = [...turn, Object.assign(draw, { aim: "target" }), step("motion", { motion: "missile", duration: 12 }),
                step("projectile", { iconSource: "color", destination: "allTargets", attachment: "rightHand", duration: flight }),
                ...hit, step("wait", { duration: 12 }), stow, idle];
        } else if (kind === "item") {
            steps = [...turn, step("motion", { motion: "item", duration: 12 }),
                ...(info.self ? [] : [step("projectile", { iconSource: "action", destination: "allTargets", attachment: "rightHand", arc: 1.2, duration: 20 })]),
                ...hit, step("wait", { duration: 12 }), idle];
        } else {
            // Magic, recovery and area: a beat on the user, then it lands on every target.
            const physical = kind === "area" && !info.magical;
            steps = [...turn, step("motion", { motion: physical ? "attack" : "cast", duration: 16 }),
                ...(physical && number(info.reach) >= 2 ? [step("projectile", { iconSource: "color", destination: "allTargets", attachment: "rightHand", duration: flight })] : []),
                ...hit, step("wait", { duration: 14 }), idle];
        }
        return { id: 0, version: 1, name: "Map " + kind, hitPolicy: "once", steps: steps.map((s, i) => Object.assign(s, { id: "map-" + kind + "-" + i })) };
    };

    /** The sequence a run plays: what the records assign (as a Classic battle resolves it), else the built-in one. */
    Stage.sequenceFor = function(ctx) {
        const P = root.ReactorBattlePresentation, action = ctx.action, battler = action.subject();
        let sequence = null;
        try {
            if (P && P.sequence && P.state === "ready") sequence = P.sequence(battler, action);
        } catch (error) {
            sequence = null;
        }
        if (sequence) return sequence;
        const user = ctx.character, first = ctx.targetCharacters[0];
        const reach = user && first ? Math.abs(first._x - user._x) + Math.abs(first._y - user._y) : 0;
        const self = ctx.targetCharacters.every(character => character === user);
        const info = { reach, self, magical: !!(action.isMagical && action.isMagical()), area: ctx.targets.length > 1 };
        return Stage.defaultSequence(Stage.kindOf(action, info), info);
    };

    //-------------------------------------------------------------------------
    // Staged characters. A staged character is drawn where the stage puts it
    // (`_realX`, `_realY`, a lift) and is not walked back by its own update.

    if (typeof Game_CharacterBase !== "undefined" && !Game_CharacterBase.prototype.__rrStage) {
        const proto = Game_CharacterBase.prototype;
        proto.__rrStage = true;
        const updateMove = proto.updateMove;
        proto.updateMove = function() {
            if (this._rrStage) return;
            updateMove.call(this);
        };
        const isMoving = proto.isMoving;
        proto.isMoving = function() {
            return this._rrStage ? false : isMoving.call(this);
        };
        // On a flat map the lift is drawn here; a 3D map has the character's own height.
        const screenY = proto.screenY;
        proto.screenY = function() {
            const y = screenY.call(this), staged = this._rrStage;
            return staged && staged.z && !staged.world ? y - Math.round(staged.z * $gameMap.tileHeight()) : y;
        };
    }

    Stage._claims = new Map();
    Stage._settles = [];
    Stage._beats = [];
    Stage._runs = [];
    Stage._tick = 0;

    /** Takes a character onto the stage, remembering how it stood. */
    Stage.claim = function(character) {
        let claim = Stage._claims.get(character);
        if (claim) { claim.count++; return claim; }
        const world = Stage.is3D();
        claim = {
            character, count: 1, world,
            direction: character.direction(), dir8: character._reactorDir8,
            lift: character._reactorLift || 0, stepAnime: character._stepAnime, opacity: character._opacity,
            z: 0, yaw: null, poseState: {}, staged: false
        };
        character._rrStage = { z: 0, world };
        Stage._claims.set(character, claim);
        return claim;
    };

    /** Draws a claimed character at a place: tiles, a height above its ground, a facing. */
    Stage.put = function(claim, x, y, z, yaw) {
        const character = claim.character;
        character._realX = x;
        character._realY = y;
        Stage.lift(claim, z);
        if (yaw !== undefined && yaw !== null && yaw !== claim.yaw) {
            claim.yaw = yaw;
            Stage.face(character, yaw);
        }
    };

    Stage.lift = function(claim, z) {
        const character = claim.character;
        claim.z = z;
        if (character._rrStage) character._rrStage.z = z;
        if (claim.world) character._reactorLift = claim.lift + z;
    };

    /** Lets a character go: back on its cell as it stood, at once (`snap`) or eased there. */
    Stage.release = function(claim, snap) {
        if (--claim.count > 0) return;
        const character = claim.character;
        const off = Math.abs(character._realX - character._x) + Math.abs(character._realY - character._y) + Math.abs(claim.z);
        const posed = Stage.releasePose(claim, snap);
        if (snap || (off < 1e-4 && !posed)) { Stage.restore(claim); return; }
        claim.count = 1;
        Stage._settles.push({ claim, frame: 0, x: character._realX, y: character._realY, z: claim.z });
    };

    Stage.restore = function(claim) {
        const character = claim.character;
        character._realX = character._x;
        character._realY = character._y;
        if (claim.world) character._reactorLift = claim.lift;
        delete character._rrStage;
        if (character.direction() !== claim.direction) character.setDirection(claim.direction);
        if (claim.dir8 !== undefined) character._reactorDir8 = claim.dir8;
        if (character._stepAnime !== claim.stepAnime) character._stepAnime = claim.stepAnime;
        if (character._opacity !== claim.opacity) character.setOpacity(claim.opacity);
        Stage.clearPose(claim);
        Stage._claims.delete(character);
    };

    /** Characters a save or a dropped run left staged go back to their cells. */
    Stage.sweep = function() {
        if (typeof $gameMap === "undefined" || !$gameMap) return;
        const sweep = character => {
            if (!character || !character._rrStage || Stage._claims.has(character)) return;
            character._realX = character._x;
            character._realY = character._y;
            delete character._rrStage;
        };
        for (const event of $gameMap.events ? $gameMap.events() : []) sweep(event);
        if (typeof $gamePlayer !== "undefined" && $gamePlayer) {
            sweep($gamePlayer);
            const followers = $gamePlayer.followers && $gamePlayer.followers();
            for (const follower of followers && followers.data ? followers.data() : []) sweep(follower);
        }
    };

    //-------------------------------------------------------------------------
    // Motions. A 3D model plays the sequence's motion and pose steps through
    // the rules its animator already plays (the battle scene's own way); a
    // sprite, or a model without that motion, makes a small beat in place.

    Stage.holderOf = function(character) {
        const R = reactor3d();
        const holder = R && R.modelHolderFor ? R.modelHolderFor(character) : null;
        return holder && holder.object && holder.binding && holder.rules ? holder : null;
    };

    const clock = holder => (holder.animationFrame !== undefined ? holder.animationFrame : frameCount());
    const LUNGES = ["attack", "punch", "thrust", "swing", "missile", "slash", "stab", "shoot", "skill"];
    const HOPS = ["cast", "spell", "chant", "item", "magic", "victory"];

    Stage.playMotion = function(claim, step, from, cast) {
        const B = data(), character = claim.character, holder = Stage.holderOf(character);
        const plain = B.spriteMotionName(step);
        if (holder) {
            const View = root.ReactorBattleRoomView;
            if (View && View.prepareMotions) View.prepareMotions(holder);
            const previous = claim.poseState;
            const releasing = !B.hasPose(step) && !step.keepPose && Object.keys(previous).length > 0;
            const name = releasing ? "pose:" + step.id : B.motionActionName(step);
            // A part that aims turns to the unit it names, measured on the model as the battle scene measures it.
            const aimOf = View && View.aimTurnOf && cast ? entry => { const at = entry.aim === "user" ? cast.user : cast.target; return at ? View.aimTurnOf(holder, entry.part, { x: at._realX, y: at._realY }) : 0; } : null;
            const posed = B.hasPose(step) ? B.partPoseRules(step, previous, aimOf) : releasing ? B.releasePoseRules(step, previous) : null;
            if (posed) {
                claim.poseState = posed.next;
                const kept = holder.rules.filter(rule => rule.name !== name);
                kept.push(...posed.rules);
                if (releasing) kept.push(...B.releaseMotionRules({ releases: { [step.id]: step.motion || "idle" }, actions: { [step.id]: name } }, step.id, holder.rules));
                holder.rules = kept;
                claim.posed = true;
            }
            if (!name || name === "idle") {
                if (holder.action && holder.action.stage) holder.action = null;
                holder.binding.movingAt = undefined;
                return;
            }
            const wanted = String(name).toLowerCase();
            const rule = holder.rules.find(entry => entry.trigger === "action" && String(entry.name).toLowerCase() === wanted);
            if (rule) {
                holder.action = { name: rule.name, frame: clock(holder), until: Infinity, stage: true };
                claim.staged = true;
                return;
            }
        }
        Stage.beat(character, LUNGES.includes(plain) ? "lunge" : HOPS.includes(plain) ? "hop" : plain === "damage" ? "hurt" : plain === "evade" ? "evade" : "", from);
    };

    /** A model eases out of the pose the run left it in; true when it has one to leave. */
    Stage.releasePose = function(claim, snap) {
        const holder = claim.posed || claim.staged ? Stage.holderOf(claim.character) : null;
        if (!holder) return false;
        const B = data();
        if (!snap && Object.keys(claim.poseState).length) {
            const { rules } = B.releasePoseRules({ id: "stage-out", duration: Stage.SETTLE_FRAMES }, claim.poseState);
            const kept = holder.rules.filter(rule => rule.name !== "pose:stage-out");
            kept.push(...rules);
            holder.rules = kept;
            holder.action = { name: "pose:stage-out", frame: clock(holder), until: Infinity, stage: true };
            claim.poseState = {};
            return true;
        }
        return false;
    };

    Stage.clearPose = function(claim) {
        if (!claim.posed && !claim.staged) return;
        const holder = Stage.holderOf(claim.character);
        if (!holder) return;
        if (holder.action && holder.action.stage) holder.action = null;
        if (claim.posed) {
            holder.rules = holder.rules.filter(rule => !String(rule.name).startsWith("pose:"));
            holder.binding.latch = {};
            holder.binding.angles = {};
        }
        holder.binding.movingAt = undefined;
    };

    /**
     * A beat in place, over whatever else moves the character: a short lunge
     * toward `toward` and back, a hop, a flinch, a sidestep. Claims the
     * character for as long as it lasts.
     */
    Stage.beat = function(character, kind, toward) {
        if (!kind || !character) return;
        const lengths = { lunge: 12, hop: 14, hurt: 10, evade: 14 };
        if (!lengths[kind]) return;
        // A unit on its way somewhere keeps walking: the beat is for one standing or staged.
        if (!character._rrStage && character.isMoving()) return;
        let ux = 0, uy = 0;
        if (toward) {
            ux = toward._realX - character._realX; uy = toward._realY - character._realY;
            const distance = Math.hypot(ux, uy);
            if (distance > 1e-6) { ux /= distance; uy /= distance; } else { ux = 0; uy = 0; }
        }
        if (!ux && !uy) {
            const yaw = Stage.yawOfDirection(character._reactorDir8 || character.direction()) * Math.PI / 180;
            ux = Math.sin(yaw); uy = Math.cos(yaw);
        }
        // A flinch and a sidestep go away from what struck.
        if (toward && (kind === "hurt" || kind === "evade")) { ux = -ux; uy = -uy; }
        Stage._beats.push({ claim: Stage.claim(character), kind, frame: 0, length: lengths[kind], ux, uy, dx: 0, dy: 0, dz: 0 });
    };

    const beatOffset = (beat, out) => {
        const t = beat.frame / beat.length, swell = Math.sin(Math.PI * t);
        out.x = 0; out.y = 0; out.z = 0;
        if (beat.kind === "lunge") {
            // Out fast, back slowly.
            const k = t < 0.33 ? t / 0.33 : 1 - (t - 0.33) / 0.67;
            out.x = beat.ux * 0.22 * k; out.y = beat.uy * 0.22 * k;
        } else if (beat.kind === "hop") {
            out.z = 0.25 * swell;
        } else if (beat.kind === "hurt") {
            const shake = Math.sin(beat.frame * 2.4) * 0.05 * (1 - t);
            out.x = beat.ux * 0.12 * swell - beat.uy * shake; out.y = beat.uy * 0.12 * swell + beat.ux * shake;
        } else if (beat.kind === "evade") {
            out.x = (beat.ux * 0.2 - beat.uy * 0.28) * swell; out.y = (beat.uy * 0.2 + beat.ux * 0.28) * swell;
        }
        return out;
    };
    const beatScratch = { x: 0, y: 0, z: 0 };

    /** A flash on a struck unit: the model's own, or the sprite's blend colour. */
    Stage.flash = function(character, color, duration) {
        const holder = Stage.holderOf(character);
        if (holder) { holder.flash = { color, duration, t: 0 }; return; }
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const sprite = scene && scene._spriteset && scene._spriteset.findTargetSprite ? scene._spriteset.findTargetSprite(character) : null;
        if (sprite && sprite.setBlendColor) Stage._flashes.push({ sprite, color, frame: 0, duration });
    };
    Stage._flashes = [];

    //-------------------------------------------------------------------------
    // Points: where things are, in tiles (x, y) and a height. On a 3D map the
    // height is the world's; on a flat map it is above the ground.

    Stage.groundOf = function(character) {
        const R = reactor3d();
        if (!Stage.is3D() || !R.characterGround) return 0;
        return R.characterGround($dataMap, character) + (character._reactorLift || 0);
    };

    Stage.heightOf = function(character) {
        const R = reactor3d();
        return R && R.characterHeightTiles ? R.characterHeightTiles(character) : 1.5;
    };

    /** A point on a character's body, `height` tiles up it. */
    Stage.bodyPoint = function(character, height, out) {
        out.x = character._realX;
        out.y = character._realY;
        out.z = Stage.groundOf(character) + (character._rrStage && !character._rrStage.world ? character._rrStage.z : 0) + height;
        return out;
    };

    /** Where a shot leaves a unit: the held weapon's tip, the hand, else beside the body. */
    Stage.launchPoint = function(character, step, out) {
        const R = reactor3d(), holder = Stage.holderOf(character);
        if (holder && Stage.is3D() && ["rightHand", "leftHand"].includes(step.attachment)) {
            let world = !step.bone && R.MapHeld && R.MapHeld.tipPoint ? R.MapHeld.tipPoint(character) : null;
            const View = root.ReactorBattleRoomView;
            if (!world && View && View.attachmentWorld) world = View.attachmentWorld(holder, step.attachment, step.bone);
            if (world) {
                out.x = world.x - 0.5 + number(step.x); out.y = world.z - 0.5 + number(step.y); out.z = world.y + number(step.z);
                return out;
            }
        }
        const height = step.startHeight !== undefined ? number(step.startHeight) : 1;
        Stage.bodyPoint(character, Math.min(height, Stage.heightOf(character) * 0.75), out);
        out.x += number(step.x); out.y += number(step.y);
        return out;
    };

    /** A point on the screen, with how large a tile is drawn there. */
    Stage.screenOf = function(x, y, z, out) {
        const R = reactor3d();
        if (Stage.is3D()) {
            const camera = R.viewport().camera();
            const above = R.projectToScreen(camera, x + 0.5, z + 1, y + 0.5, Stage._above || (Stage._above = {}));
            const point = R.projectToScreen(camera, x + 0.5, z, y + 0.5, out);
            point.scale = above ? Math.max(0.05, Math.hypot(above.x - point.x, above.y - point.y) / $gameMap.tileHeight()) : 1;
            return point;
        }
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        out.x = Math.round($gameMap.adjustX(x) * tw + tw / 2);
        out.y = Math.round($gameMap.adjustY(y) * th + th - 6 - z * th);
        out.visible = true;
        out.scale = 1;
        return out;
    };

    //-------------------------------------------------------------------------
    // A run.

    /** The units and battlers of a run: who each battler is on the map. */
    const castOf = ctx => {
        const fight = ctx.fight, characters = new Map(), units = new Map();
        for (const unit of fight.units ? fight.units() : []) {
            const battler = fight.battler(unit), character = fight.character(unit);
            if (battler && character) { characters.set(battler, character); units.set(battler, unit); }
        }
        return { characters, units };
    };

    Stage.begin = function(run, ctx) {
        const B = data();
        if (!B || !B.Player || !ctx || !ctx.character || !ctx.action || !ctx.action.item()) return false;
        if (!Stage._runs.length) Stage.sweep();
        const resolved = Stage.sequenceFor(ctx);
        if (!resolved) return false;
        const state = Stage.makeState(run, ctx);
        let sequence;
        try {
            sequence = Stage.mapSequence(resolved, state.homes, key => Stage.clearanceOf(state, key));
            state.adapter = Stage.adapter(state);
            state.adapter.hitPolicy = resolved.hitPolicy;
            state.player = new B.Player(sequence, state.adapter);
            state.impactSteps = sequence.steps.filter(step => step && step.type === "impact").length;
            // How many results the run lands: one per Apply step when the sequence says so, else the action's repeats.
            if (run.hitTotal === undefined) run.hitTotal = resolved.hitPolicy === "authored" ? Math.max(1, state.impactSteps) : Math.max(1, Math.floor(ctx.action.numRepeats ? ctx.action.numRepeats() : 1) || 1);
        } catch (error) {
            Stage.dropState(state, true);
            return false;
        }
        Object.defineProperty(run, "_stage", { value: state, enumerable: false, writable: true, configurable: true });
        Stage._runs.push(state);
        // A run at more than its own pace does not stop for an animation to finish.
        if (number(run.rate) > 1) state.player.skipping = true;
        // A side run (several units acting at once) plays without the camera.
        const director = run.side ? null : F.Director;
        if (director && director.sequenceStart) {
            try {
                director.sequenceStart({ unitId: ctx.subject.id, targetIds: ctx.targets.map(unit => unit.id),
                    cameraSteps: sequence.steps.filter(step => step && step.type === "camera").length,
                    impactAt: state.player.timeline.filter(cue => cue.step.type === "impact").map(cue => cue.start),
                    length: state.player.duration });
            } catch (error) { /* a director that throws is ignored */ }
        }
        // A run loaded mid-swing: everything up to its frame, without sound or result.
        if (run.frame > 0) {
            state.silent = true;
            try { state.player.update(run.frame); } finally { state.silent = false; }
        }
        return true;
    };

    /** The room a unit of a run leaves when it closes on the one it faces. */
    Stage.clearanceOf = function(state, key) {
        const character = state.roles[key], other = state.roles[key.startsWith("target") ? "user" : "target"];
        if (!character || !other || other === character) return 0;
        let battler = null;
        for (const [who, where] of state.cast.characters) if (where === character) { battler = who; break; }
        return Stage.clearance(character, battler, other);
    };

    Stage.makeState = function(run, ctx) {
        const state = { run, ctx, cast: castOf(ctx), roles: {}, keys: new Map(), claims: [], homes: {}, selected: [], impacts: 0, impactSteps: 0, time: 0, sub: 0, posedNow: false,
            effects: [], flights: [], layers: [], struck: new Map(), tickets: [], restore: [], held: [], formula: null, elements: null, rate: 100,
            silent: false, frames: 0, closed: false, audioSaved: {} };
        const add = (key, character) => {
            if (!character) return;
            state.roles[key] = character;
            if (!state.keys.has(character)) { state.keys.set(character, key); state.claims.push(Stage.claim(character)); }
            state.homes[key] = Stage.homeOf(character);
        };
        add("user", ctx.character);
        ctx.targetCharacters.forEach((character, i) => add("target" + i, character));
        if (state.homes.target0) { state.roles.target = state.roles.target0; state.homes.target = Object.assign({}, state.homes.target0); }
        state.homes.camera = { x: 0, y: 0, z: 0 };
        return state;
    };

    /**
     * What a run of that action would be, without starting it, for the camera:
     * how many camera steps its sequence has, the frames its results land on,
     * its length. `info`: `{ unitId, kind, itemId, targetIds }`. Null when it cannot be told.
     */
    Stage.sequenceInfo = function(info) {
        try {
            const B = data(), fight = $gameFight, unit = fight.unit(info.unitId), battler = fight.battler(unit), character = fight.character(unit);
            const action = new Game_Action(battler);
            if (info.kind === "item") action.setItem(info.itemId); else action.setSkill(info.itemId);
            const targets = (info.targetIds || []).map(id => fight.unit(id)).filter(Boolean);
            const targetCharacters = targets.map(target => fight.character(target)).filter(Boolean);
            const resolved = Stage.sequenceFor({ fight, action, subject: unit, character, targets, targetCharacters });
            const homes = { user: Stage.homeOf(character) };
            targetCharacters.forEach((target, i) => { homes["target" + i] = Stage.homeOf(target); });
            if (homes.target0) homes.target = Object.assign({}, homes.target0);
            const sequence = Stage.mapSequence(resolved, homes, key => (key === "user" && targetCharacters[0] && targetCharacters[0] !== character ? Stage.clearance(character, battler, targetCharacters[0]) : 0));
            const timeline = B.timeline(sequence, { homes, target: homes.target, direction: homes.target && homes.target.x < homes.user.x ? -1 : 1 });
            return { cameraSteps: sequence.steps.filter(step => step && step.type === "camera").length,
                impactAt: timeline.filter(cue => cue.step.type === "impact").map(cue => cue.start), length: timeline.length ? timeline[0].total : 0 };
        } catch (error) {
            return null;
        }
    };

    Stage.homeOf = character => ({ x: character._x, y: character._y, z: 0,
        facing: Stage.yawOfDirection(character._reactorDir8 || character.direction()), rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 });

    Stage.update = function(ctx) {
        const run = ctx && ctx.run, state = run && run._stage;
        if (!state || state.closed) return false;
        const player = state.player;
        if (++state.frames > Stage.MAX_FRAMES) { player.cancel(); return false; }
        // `run.rate`: frames of the sequence per frame of the game (2 plays it twice as fast).
        player.update(number(run.rate) > 0 ? number(run.rate) : 1);
        run.frame = Math.max(0, Math.round(player.frame));
        ctx.frame = run.frame;
        return !player.done;
    };

    Stage.end = function(run, ctx, interrupted) {
        const state = run && run._stage;
        if (!state) return;
        if (!state.player.done) state.player.cancel();
        Stage.dropState(state, !!interrupted);
        run._stage = null;
    };

    Stage.dropState = function(state, snap) {
        if (state.dropped) return;
        state.dropped = true;
        const index = Stage._runs.indexOf(state);
        if (index >= 0) Stage._runs.splice(index, 1);
        // Cut short: a beat still playing on one of its units ends with it.
        if (snap) {
            for (let i = Stage._beats.length - 1; i >= 0; i--) {
                const beat = Stage._beats[i];
                if (!state.claims.includes(beat.claim)) continue;
                Stage._beats.splice(i, 1);
                beat.claim.count--;
            }
        }
        for (const claim of state.claims) Stage.release(claim, snap);
        state.claims.length = 0;
    };

    Stage.isBusy = function() {
        return Stage._settles.length > 0;
    };

    Stage.supports = function(step) {
        return !!step && Stage.SUPPORTED.includes(step.type);
    };

    /** One step on a unit outside a run (a motion, an animation, a sound): `ctx.character` plays it. */
    Stage.cue = function(step, ctx) {
        if (!Stage.supports(step) || !ctx || !ctx.character) return false;
        if (step.type === "motion") {
            const claim = Stage.claim(ctx.character);
            Stage.playMotion(claim, step, ctx.targetCharacters && ctx.targetCharacters[0]);
            claim.count++;
            Stage._beats.push({ claim, kind: "hold", frame: 0, length: Math.max(1, number(step.duration) || 30), ux: 0, uy: 0 });
            Stage.release(claim, true);
            return true;
        }
        if (step.type === "animation" && step.animationId > 0 && typeof $gameTemp !== "undefined") {
            $gameTemp.requestAnimation(ctx.targetCharacters && ctx.targetCharacters.length ? ctx.targetCharacters : [ctx.character], step.animationId);
            return true;
        }
        if (step.type === "sound" && step.audio && step.audio.name && typeof AudioManager !== "undefined") { AudioManager.playSe(step.audio); return true; }
        return false;
    };

    /** The projectile in flight, for the camera: the middle of its cell, its height, how far along it is. */
    Stage.projectile = function() {
        for (const state of Stage._runs) {
            if (state.run.side) continue;
            for (const flight of state.flights) {
                if (!flight.live) continue;
                const world = Stage.is3D(), out = Stage._projectile || (Stage._projectile = { x: 0, y: 0, z: 0, t: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } });
                const set = (target, point) => { target.x = point.x + 0.5; target.y = world ? point.z : 0; target.z = point.y + 0.5; };
                set(out, flight.point); set(out.from, flight.from); set(out.to, flight.to);
                out.t = flight.t;
                return out;
            }
        }
        return null;
    };

    //-------------------------------------------------------------------------
    // The run's adapter: what the sequence player calls for each cue and each frame.

    Stage.adapter = function(state) {
        const B = data(), P = root.ReactorBattlePresentation, ctx = state.ctx, fight = ctx.fight, action = ctx.action;
        const subject = action.subject(), homes = state.homes;
        const battlers = ctx.targets.map(unit => fight.battler(unit)).filter(Boolean);
        const characterOf = battler => state.cast.characters.get(battler) || null;
        const team = battler => { const unit = state.cast.units.get(battler); return unit ? unit.team : ""; };
        const everyone = () => [...state.cast.characters.keys()];
        const expression = (code, target = state.selected[0] || battlers[0], statement = false) => (P && P.evalSequence
            ? P.evalSequence(code, subject, target, action, statement)
            : Function("user", "subject", "target", "a", "b", "v", "action", "item", statement ? String(code) : "return (" + String(code) + ");")(subject, subject, target, subject, target, (root.$gameVariables && root.$gameVariables._data) || [], action, action.item()));
        const amount = (value, target) => {
            const n = typeof value === "number" ? value : Number(expression(value === undefined || value === null ? "0" : value, target));
            if (!Number.isFinite(n)) throw Error("Sequence expression must return a finite number.");
            return n;
        };
        const choose = step => B.selectTargets(step, { user: subject, subject, targets: battlers, selected: state.selected,
            actors: everyone().filter(b => b.isActor && b.isActor()), enemies: everyone().filter(b => b.isEnemy && b.isEnemy()),
            friends: everyone().filter(b => team(b) === team(subject)), opponents: everyone().filter(b => team(b) && team(b) !== team(subject) && team(b) !== "neutral"),
            moved: () => false });
        // A unit a step names beyond the user and the targets joins the run where it stands.
        const keyOf = character => {
            if (!state.keys.has(character)) {
                const key = "extra" + state.keys.size;
                state.keys.set(character, key);
                state.roles[key] = character;
                state.homes[key] = Stage.homeOf(character);
                state.claims.push(Stage.claim(character));
            }
            return state.keys.get(character);
        };
        const claimOf = character => Stage._claims.get(character);
        const media = ticket => { state.tickets.push(ticket); return ticket; };
        let frame = 0;

        const unitOf = battler => state.cast.units.get(battler) || null;
        const standing = unit => { const battler = fight.battler(unit); return !!battler && !unit.gone && battler.isAlive(); };
        // One Apply step. A sequence that lands its own hits ("authored") lands one on the units the step
        // chose; any other lands one of the action's repeats, and its last Apply step the rest of them a
        // few frames apart, the sequence held meanwhile, as the battle scene holds while it lands its hits.
        const strike = chosen => {
            const run = ctx.run;
            state.impacts++;
            if (state.silent) return;
            if (!fight.applyHit || !fight.finishHits) { land(() => fight.applyRun(run, action, ctx.targets)); return; }
            if (adapter.hitPolicy === "authored") { land(() => fight.applyHit(run, action, chosen.map(unitOf).filter(Boolean))); return; }
            if (run.applied || (run.hits || 0) >= run.hitTotal) return;
            land(() => fight.applyHit(run, action, ctx.targets));
            if (state.impacts < state.impactSteps) return;
            let last = state.frames, over = false;
            const ticket = { blocking: true,
                isPlaying() {
                    if (over) return false;
                    if (run.hits < run.hitTotal && ctx.targets.some(standing) && state.frames - last >= Stage.HIT_GAP) { last = state.frames; land(() => fight.applyHit(run, action, ctx.targets)); }
                    if (run.hits >= run.hitTotal || !ctx.targets.some(standing)) { over = true; fight.finishHits(run, action); return false; }
                    return true;
                },
                cancel() { over = true; } };
            return ticket.isPlaying() ? media(ticket) : undefined;
        };
        const land = hit => {
            if (state.silent) return;
            const saved = {};
            const override = (key, fn) => { saved[key] = { own: Object.prototype.hasOwnProperty.call(action, key), value: action[key] }; action[key] = fn; };
            if (state.formula !== null) override("evalDamageFormula", function(target) { const sign = [3, 4].includes(this.item().damage.type) ? -1 : 1; return Math.max(0, amount(state.formula, target)) * sign; });
            if (state.elements) override("calcElementRate", target => Math.max(...state.elements.map(id => target.elementRate(id))));
            if (state.rate !== 100) { const make = action.makeDamageValue; override("makeDamageValue", function(...args) { return Math.round(make.apply(this, args) * state.rate / 100); }); }
            try {
                hit();
            } finally {
                for (const [key, entry] of Object.entries(saved)) { if (entry.own) action[key] = entry.value; else delete action[key]; }
            }
        };

        const adapter = {
            context: { homes, target: homes.target, direction: homes.target && homes.user && homes.target.x < homes.user.x ? -1 : 1 },
            condition(code) {
                try { return !!expression(code); } catch (error) { if (P && P.warn) P.warn("Sequence condition: " + error.message); return false; }
            },
            cue(raw, start) {
                frame = start;
                const step = Object.assign({}, B.commandDefaults(raw.type), raw);
                const chosen = choose(step), characters = chosen.map(characterOf).filter(Boolean);
                raw._chosen = chosen;
                raw._roles = characters.map(keyOf);
                const first = characterOf(state.selected[0] || battlers[0]);
                if (["move", "camera", "direction"].includes(step.type) && first) raw._target = { x: first._x, y: first._y, z: 0 };
                switch (step.type) {
                    case "impact":
                        state.rate = amount(step.rate === undefined ? 100 : step.rate);
                        return strike(chosen);
                    case "target": state.selected = step.operation === "clear" ? [] : chosen; return;
                    case "clearTargets": return;
                    case "formula": state.formula = step.operation === "clear" ? null : step.formula; return;
                    case "element":
                        state.elements = step.operation === "clear" ? null : String(step.elements).split(",").map(Number).filter(n => Number.isInteger(n) && n >= 0);
                        return;
                    case "eval": if (!state.silent) expression(step.code, chosen[0], true); return;
                    case "camera": {
                        const director = ctx.run.side ? null : F.Director;
                        if (!state.silent && director && director.sequenceCamera) {
                            try { director.sequenceCamera(step, { user: ctx.character, target: first, targets: ctx.targetCharacters, run: ctx.run }); } catch (error) { /* ignored */ }
                        }
                        return;
                    }
                    case "motion":
                        for (const character of characters) Stage.playMotion(claimOf(character), step, character === ctx.character ? first : ctx.character, { user: ctx.character, target: first });
                        return;
                    case "weapon":
                        for (const battler of chosen) {
                            const character = characterOf(battler);
                            if (!character || !F.heldItem) continue;
                            const mode = B.weaponMode(step);
                            if (mode !== "hide" && !state.held.includes(character)) state.held.push(character);
                            F.heldItem(character, mode, Object.assign({}, step, { battler, item: action.item(), targetCharacter: first, instant: state.silent }));
                        }
                        return;
                    case "projectile": {
                        if (state.silent) return;
                        const destination = step.destination || "target";
                        const recipients = choose({ role: destination, targetIndex: step.targetIndex }).map(characterOf).filter(Boolean);
                        for (const battler of chosen) {
                            const owner = characterOf(battler);
                            if (owner) for (const target of recipients) state.flights.push(Stage.flight(state, step, battler, owner, target, start));
                        }
                        return;
                    }
                    case "animation": {
                        if (state.silent || typeof $gameTemp === "undefined") return;
                        let id = step.animationId;
                        if (step.animationSource && step.animationSource !== "id") {
                            const own = action.item().animationId || 0;
                            id = step.animationSource === "weapon" || own === -1 ? (subject.attackAnimationId1 ? subject.attackAnimationId1() : 0) || 0 : Math.max(0, own);
                        }
                        if (!(id > 0) || !$dataAnimations[id] || !characters.length) return;
                        // On the body, not at the feet: the muzzle of what the user holds, where a shot of this run struck, else mid-body.
                        const played = characters.map(character => Stage.animate(character, id, character === ctx.character && !chosen.includes(battlers[0]) ? "tip" : "body", state.struck.get(character)));
                        if (played.every(Boolean)) { let held = 0; return media({ isPlaying: () => ++held < 600 && played.some(entry => entry.playing()), cancel() { for (const entry of played) entry.stop(); } }); }
                        $gameTemp.requestAnimation(characters.filter((character, i) => !played[i]), id);
                        let waited = 0;
                        return media({ isPlaying: () => ++waited < 600 && (characters.some(c => c.isAnimationPlaying && c.isAnimationPlaying()) || played.some(entry => entry && entry.playing())), cancel() {} });
                    }
                    case "sound":
                        if (!state.silent && step.audio && step.audio.name && typeof AudioManager !== "undefined") AudioManager.playSe(step.audio);
                        return;
                    case "balloon":
                        if (!state.silent && typeof $gameTemp !== "undefined" && $gameTemp.requestBalloon) for (const character of characters) $gameTemp.requestBalloon(character, step.balloonId);
                        return;
                    case "direction":
                        return;
                    case "jump": case "leap": case "float": case "fall":
                        for (const character of characters) {
                            const claim = claimOf(character);
                            state.effects.push({ lift: claim, kind: step.type, height: number(step.height), start, end: start + Math.max(1, number(step.duration)), from: claim.liftNow || 0 });
                        }
                        return;
                    case "opacity":
                        for (const character of characters) state.effects.push({ fade: character, from: character._opacity, to: Math.max(0, Math.min(255, number(step.opacity))), start, end: start + Math.max(1, number(step.duration)) });
                        return;
                    case "whiten":
                        if (!state.silent) for (const character of characters) Stage.flash(character, [255, 255, 255, 160], Math.max(1, number(step.duration)));
                        return;
                    case "tint":
                        if (step.space === "battler") {
                            if (!state.silent) for (const character of characters) Stage.flash(character, [Math.max(0, 128 + step.red / 2), Math.max(0, 128 + step.green / 2), Math.max(0, 128 + step.blue / 2), 150], Math.max(1, number(step.duration)));
                            return;
                        }
                        if (step.space === "screen" && typeof $gameScreen !== "undefined") {
                            const old = $gameScreen.tone().slice();
                            state.restore.push(() => $gameScreen.startTint(old, 0));
                            $gameScreen.startTint([step.red, step.green, step.blue, step.gray], step.duration);
                        }
                        return;
                    case "picture": case "icon":
                        if (!state.silent) Stage.layer(state, step, chosen, characters, start);
                        return;
                    case "wait":
                        if (step.waitFor === "animation" && !state.silent) { let waited = 0; return { blocking: true, isPlaying: () => ++waited < 600 && characters.some(c => c.isAnimationPlaying && c.isAnimationPlaying()) }; }
                        return;
                }
                // Game data and the screen: the steps the battle scene shares.
                if (state.silent || !P || !P.gameCue) return;
                const shared = P.gameCue(step, { chosen, subject, number: amount, audioSaved: state.audioSaved,
                    feedback: battler => { const unit = state.cast.units.get(battler); if (unit && fight.popup) fight.popup(unit, battler); if (unit && battler.isDead && battler.isDead() && fight.defeat) { const by = state.cast.units.get(subject), from = by && by !== unit ? fight.character(by) : null; if (from) unit.struck = { x: from._realX, y: from._realY }; fight.defeat(unit); } } });
                if (shared && shared.ticket) return media(shared.ticket);
            },
            pose(positions, time) {
                frame = time;
                state.time = time; state.posedNow = true;
                const B2 = B;
                for (const key in positions) {
                    if (key === "camera" || key === "target") continue;
                    const character = state.roles[key];
                    if (!character) continue;
                    const claim = Stage._claims.get(character);
                    if (!claim) continue;
                    const p = B2.visualPose(positions[key]);
                    claim.liftNow = 0;
                    Stage.put(claim, p.x, p.y, p.z || 0, p.facing);
                    const travelling = Math.abs(p.x - (claim.lastX === undefined ? p.x : claim.lastX)) + Math.abs(p.y - (claim.lastY === undefined ? p.y : claim.lastY)) > 1e-4;
                    claim.lastX = p.x; claim.lastY = p.y;
                    // A sprite walks its frames while it travels.
                    if (character._stepAnime !== (travelling || claim.stepAnime)) character._stepAnime = travelling || claim.stepAnime;
                }
                for (const effect of state.effects) {
                    const t = Math.min(1, Math.max(0, (time - effect.start) / Math.max(1, effect.end - effect.start)));
                    if (effect.lift) {
                        const h = effect.kind === "jump" ? effect.from + Math.sin(Math.PI * t) * effect.height
                            : effect.kind === "leap" ? effect.from + effect.height * (1 - (1 - t) * (1 - t))
                                : effect.kind === "float" ? effect.from + effect.height * t : effect.from + (effect.height - effect.from) * t;
                        effect.lift.liftNow = h;
                    } else if (effect.fade) {
                        effect.fade.setOpacity(Math.round(effect.from + (effect.to - effect.from) * t));
                    }
                }
                for (const claim of state.claims) if (claim.liftNow) Stage.lift(claim, claim.z + claim.liftNow);
                for (const flight of state.flights) Stage.advanceFlight(flight, time);
            },
            cleanup(cancelled) {
                state.closed = true;
                // Every hit the sequence had landed: the action is done. Hits it never got to are the fight's to land.
                const run = ctx.run;
                if (!cancelled && fight.finishHits && !run.applied && run.hits > 0 && (adapter.hitPolicy === "authored" || run.hits >= run.hitTotal)) fight.finishHits(run, action);
                if (cancelled) for (const ticket of state.tickets) if (ticket.cancel) ticket.cancel();
                for (const fn of state.restore.reverse()) fn();
                for (const flight of state.flights) Stage.dropOverlay(flight);
                for (const layer of state.layers) Stage.dropOverlay(layer);
                state.flights.length = 0;
                state.layers.length = 0;
                // What the run put in a hand goes back to how the unit carries it.
                if (F.heldItem) for (const character of state.held) F.heldItem(character, "hide", { battler: [...state.cast.characters.entries()].find(entry => entry[1] === character)?.[0], instant: !!cancelled });
                state.held.length = 0;
                if (cancelled) Stage.dropState(state, true);
            }
        };
        return adapter;
    };

    //-------------------------------------------------------------------------
    // Things in the air and pictures on units: sprites over the map, placed
    // through the map's own view each frame.

    Stage.flight = function(state, step, battler, owner, target, start) {
        const flight = { step, owner, target, start, duration: Math.max(1, number(step.duration)), live: false, t: 0,
            from: null, to: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 }, sprite: null, rotation: 0 };
        flight.body = Stage.makeBody(step, battler, state.ctx.action);
        if (!flight.body) flight.sprite = Stage.makeSprite(step, battler, state.ctx.action);
        flight.state = state;
        return flight;
    };

    /** The map's 3D scene, when the map is drawn through it. */
    Stage.mapScene = function() {
        if (typeof THREE === "undefined" || !Stage.is3D()) return null;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const live = scene && scene._spriteset && scene._spriteset._reactor3d;
        return live && live.scene && live.scene.modelsGroup ? live.scene : null;
    };

    /** The 3D model a projectile step flies: the weapon's, the skill's or item's, or the one the step names. */
    Stage.projectileSpec = function(step, battler, action) {
        const R = reactor3d(), source = step.iconSource || "color";
        if (!R || !R.databaseModelSpec) return null;
        if (source === "weapon") { const weapon = battler && battler.weapons ? battler.weapons()[Math.max(0, number(step.equipIndex || 1) - 1)] : null; return weapon ? R.databaseModelSpec("weapons", weapon.id) : null; }
        if (source === "action") { const item = action && action.item ? action.item() : null; return item ? R.databaseModelSpec(DataManager.isSkill(item) ? "skills" : "items", item.id) : null; }
        if (source === "model" && step.model && step.model.name && R.normalizeModelSpec) return R.normalizeModelSpec(step.model);
        return null;
    };

    /**
     * What flies on a 3D map, in the map's own scene so walls hide it: the
     * step's 3D model, or for a plain shot a tracer, a short bright streak.
     * Null on a flat map and for icons and pictures, which fly as sprites.
     */
    Stage.makeBody = function(step, battler, action) {
        const scene = Stage.mapScene();
        if (!scene) return null;
        const R = reactor3d(), spec = Stage.projectileSpec(step, battler, action), source = step.iconSource || "color";
        if (!spec && source !== "color" && source !== "model") return null;
        const body = { scene, object: null, template: null, dropped: false, tracer: !spec, front: !!(spec && spec.faces && spec.faces.front) };
        if (!spec) {
            // A streak: full at its head, drawn out to a point behind it.
            const T = THREE, shared = Stage._tracer || (Stage._tracer = { box: new T.CylinderGeometry(0.5, 0, 1, 8).rotateX(Math.PI / 2), materials: new Map() });
            const color = step.color || "#ffcc55";
            let pair = shared.materials.get(color);
            if (!pair) {
                const make = (opacity, blending) => { const m = new T.MeshBasicMaterial({ color, transparent: true, opacity, blending, depthWrite: false, fog: false }); m.toneMapped = false; return m; };
                pair = [make(1, T.NormalBlending), make(0.4, T.AdditiveBlending)];
                shared.materials.set(color, pair);
            }
            const group = new T.Group(), core = new T.Mesh(shared.box, pair[0]), glow = new T.Mesh(shared.box, pair[1]);
            const width = Math.max(0.06, number(step.size || 8) / 130);
            core.scale.set(width, width, 1); glow.scale.set(width * 2.6, width * 2.6, 1.15);
            body.width = width; body.core = core; body.glow = glow;
            group.add(core, glow);
            group.visible = false;
            scene.modelsGroup().add(group);
            body.object = group;
            return body;
        }
        Promise.all([R.loadModel(spec.name, spec.ext, spec.file, spec.texture), R.loadModelSidecar(spec.name)]).then(([template, sidecar]) => {
            if (!template || body.dropped || !scene._modelsGroup) return;
            const object = R.cloneModelTemplate(template);
            R.applyModelTransform(object, R.readModelTransform(sidecar, spec));
            const e = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            object.scale.multiplyScalar((spec.size || 2) * (spec.scale || 1) * number(step.scale === undefined ? 1 : step.scale) / Math.max(e.x, e.y, e.z, 0.001));
            object.traverse(child => {
                const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
                for (const mat of mats) {
                    mat.__reactorModel = true; mat.fog = false;
                    if (mat.color && !mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
                    if (R.litMaterial) R.litMaterial(mat);
                    if (scene._materials && scene._materials.indexOf(mat) < 0) scene._materials.push(mat);
                }
            });
            scene._ambientLevel = undefined;
            const group = new THREE.Group();
            group.rotation.order = "YXZ";
            group.add(object);
            group.visible = false;
            scene.modelsGroup().add(group);
            body.object = group; body.template = template; body.inner = object;
        }).catch(() => {});
        return body;
    };

    /** Places a flight's body for this frame: at its point, along its way, tumbling by its spin. */
    Stage.placeBody = function(flight) {
        const body = flight.body, object = body.object;
        if (!object) return;
        object.visible = flight.live && !!flight.from;
        if (!object.visible) return;
        const p = flight.point, f = flight.from, t = flight.to, step = flight.step;
        // The way it flies now: the chord, tipped by the arc's slope.
        const u = flight.t, back = step.flight === "return" && u > 0.5 ? -1 : 1;
        let dx = (t.x - f.x) * back, dz = (t.y - f.y) * back, dy = ((t.z - f.z) + 4 * number(step.arc) * (1 - 2 * (step.flight === "return" ? (u <= 0.5 ? u * 2 : (1 - u) * 2) : u))) * back;
        const length = Math.hypot(dx, dy, dz) || 1;
        dx /= length; dy /= length; dz /= length;
        if (body.tracer) {
            // As long as three frames of its flight, trailing behind its head.
            const streak = Math.max(0.8, Math.min(2.5, 3 * length / flight.duration)) * Math.min(1, flight.t * flight.duration / 3 + 0.34);
            object.scale.set(1, 1, streak);
            object.position.set(p.x + 0.5 - dx * streak / 2, p.z - dy * streak / 2, p.y + 0.5 - dz * streak / 2);
            object.lookAt(object.position.x + dx, object.position.y + dy, object.position.z + dz);
            // As thick on the screen from far off as from the camera riding behind it: a line of light, never a plank.
            const R = reactor3d(), camera = R && R.viewport && R.viewport() && R.viewport().camera ? R.viewport().camera() : null;
            if (camera && body.core) {
                const away = camera.position.distanceTo(object.position);
                const width = Math.max(away * Stage.TRACER_THIN, Math.min(away * Stage.TRACER_THICK, body.width));
                body.core.scale.set(width, width, 1); body.glow.scale.set(width * 2.6, width * 2.6, 1.15);
            }
            return;
        }
        object.position.set(p.x + 0.5, p.z, p.y + 0.5);
        object.rotation.set(-flight.rotation * Math.PI / 180, Math.atan2(dx, dz) + (body.front ? 0 : Math.PI / 2), 0);
    };

    Stage.dropBody = function(body) {
        body.dropped = true;
        const object = body.object, R = reactor3d();
        body.object = null;
        if (!object) return;
        if (object.parent) object.parent.remove(object);
        if (body.template && body.inner && R && R.releaseModelInstance) R.releaseModelInstance(body.inner, body.template);
    };

    //-------------------------------------------------------------------------
    // Animations on the body. A map animation plays at its character's feet;
    // a sequence's plays where it happens: at the muzzle or the blade's point
    // of what the unit holds ("tip"), or on the body, where a shot of the run
    // struck it or at its middle. The animation rides an unseen anchor that
    // follows that point for as long as it plays.

    Stage._anchors = [];
    Stage.animate = function(character, id, where, struck) {
        const data = typeof $dataAnimations !== "undefined" ? $dataAnimations[id] : null;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null, ss = scene && scene._spriteset;
        if (!data || !ss || !ss._effectsContainer || !ss._animationSprites || typeof Sprite === "undefined" || typeof Sprite_Animation === "undefined") return null;
        const Kind = data.frames && typeof Sprite_AnimationMV !== "undefined" ? Sprite_AnimationMV : Sprite_Animation;
        const anchor = new Sprite();
        anchor.visible = false;
        ss._effectsContainer.addChild(anchor);
        const sprite = new Kind();
        sprite.targetObjects = [];
        sprite.setup([anchor], data, false, 0, null);
        ss._effectsContainer.addChild(sprite);
        ss._animationSprites.push(sprite);
        const entry = { character, where, anchor, sprite, ss, height: struck === undefined ? null : struck,
            playing() { return !!entry.sprite && ss._animationSprites.includes(entry.sprite) && entry.sprite.isPlaying(); },
            stop() { if (entry.sprite && ss._animationSprites.includes(entry.sprite)) ss.removeAnimation(entry.sprite); entry.sprite = null; } };
        Stage._anchors.push(entry);
        Stage.placeAnchor(entry);
        return entry;
    };

    /** How often an anchored animation looks whether its point is behind something, in frames. */
    Stage.ANCHOR_LOOK = 6;
    /** Where an animation that must not be seen is put: well off the picture, whatever its size. */
    Stage.ANCHOR_AWAY = -100000;

    Stage.placeAnchor = function(entry) {
        const character = entry.character, R = reactor3d(), point = Stage._anchorPoint || (Stage._anchorPoint = { x: 0, y: 0, z: 0 });
        const deep = Stage.is3D();
        const tip = entry.where === "tip" && R && R.MapHeld && R.MapHeld.tipPoint && deep ? R.MapHeld.tipPoint(character) : null;
        if (tip) { point.x = tip.x - 0.5; point.y = tip.z - 0.5; point.z = tip.y; }
        else Stage.bodyPoint(character, entry.height !== null ? entry.height : Stage.heightOf(character) * (entry.where === "tip" ? 0.6 : 0.5), point);
        const screen = Stage.screenOf(point.x, point.y, point.z, Stage._anchorScreen || (Stage._anchorScreen = {}));
        // An animation plays where its point is seen. Behind the camera, behind the ground or something built, or on
        // the body the eye itself is in (first person: it would fill the picture), it is put off the picture; it goes
        // on playing there, and is back as soon as its point is in sight.
        let seen = screen.visible !== false;
        if (seen && deep) {
            if (Stage.throughEyes(character)) seen = false;
            else {
                const frame = typeof Graphics !== "undefined" && Graphics.frameCount || 0;
                if (entry.looked === undefined || frame - entry.looked >= Stage.ANCHOR_LOOK || frame < entry.looked) {
                    entry.looked = frame;
                    const world = Stage._anchorWorld || (Stage._anchorWorld = { x: 0, y: 0, z: 0 });
                    world.x = point.x + 0.5; world.y = point.z; world.z = point.y + 0.5;
                    entry.seen = !F.pointSeen || F.pointSeen(world, character);
                }
                seen = entry.seen !== false;
            }
        }
        if (!seen) { entry.anchor.x = entry.anchor.y = Stage.ANCHOR_AWAY; return; }
        // The anchor lives among the map's sprites: the screen point, in their frame.
        const parent = entry.anchor.parent, inverse = parent && parent.worldTransform && parent.worldTransform.applyInverse;
        if (inverse) { const local = parent.worldTransform.applyInverse(screen, Stage._anchorLocal || (Stage._anchorLocal = { x: 0, y: 0 })); entry.anchor.x = local.x; entry.anchor.y = local.y; }
        else { entry.anchor.x = screen.x; entry.anchor.y = screen.y; }
    };

    /** Whether a battle is seen through this character's own eyes (an Action or First Person battle, the camera in the player's head). */
    Stage.throughEyes = function(character) {
        return !!F.throughEyes && F.throughEyes(character);
    };

    Stage.updateAnchors = function() {
        const anchors = Stage._anchors;
        for (let i = anchors.length - 1; i >= 0; i--) {
            const entry = anchors[i];
            if (entry.playing() && entry.anchor.parent) { Stage.placeAnchor(entry); continue; }
            anchors.splice(i, 1);
            if (entry.anchor.parent) entry.anchor.parent.removeChild(entry.anchor);
            entry.anchor.destroy();
        }
    };

    /** How far up a body something lands: the step's height when it gives one of its own, else mid-body (a sequence's one tile is a shin on a tall model). */
    Stage.hitHeight = function(character, authored) {
        const tall = Stage.heightOf(character);
        return authored === undefined || number(authored) === 1 ? tall * 0.55 : Math.min(number(authored), tall * 0.9);
    };

    Stage.advanceFlight = function(flight, time) {
        const step = flight.step;
        if (!flight.from) flight.from = Stage.launchPoint(flight.owner, step, { x: 0, y: 0, z: 0 });
        Stage.bodyPoint(flight.target, Stage.hitHeight(flight.target, step.endHeight), flight.to);
        const t = Math.min(1, Math.max(0, (time - flight.start) / flight.duration));
        const u = step.flight === "return" ? (t <= 0.5 ? t * 2 : (1 - t) * 2) : t;
        const from = flight.from, to = flight.to, point = flight.point;
        point.x = from.x + (to.x - from.x) * u;
        point.y = from.y + (to.y - from.y) * u;
        point.z = from.z + (to.z - from.z) * u + 4 * number(step.arc) * u * (1 - u);
        flight.t = t;
        flight.live = t < 1;
        flight.rotation = number(step.rotation) + (time - flight.start) * number(step.spin);
        // Where it struck, for what plays on the target next: the height up its body.
        if (t >= 1 && flight.state && step.flight !== "return") flight.state.struck.set(flight.target, Math.max(0.2, to.z - Stage.groundOf(flight.target)));
    };

    /** The picture a flying or shown thing is drawn as: a colored dot, an icon, a picture. Null where nothing draws. */
    Stage.makeSprite = function(step, battler, action) {
        if (typeof Sprite === "undefined" || typeof Bitmap === "undefined" || typeof ImageManager === "undefined") return null;
        const B = data(), source = step.iconSource || (step.type === "projectile" ? "color" : step.type === "picture" ? "picture" : "icon");
        let sprite;
        if (source === "animation") return null;
        if (source === "picture" || step.type === "picture") {
            if (!step.name) return null;
            sprite = new Sprite(ImageManager.loadPicture(step.name));
        } else {
            const item = action && action.item ? action.item() : null;
            const index = step.type === "icon"
                ? (step.source === "icon" ? step.iconIndex : (step.source === "action" ? item : step.source === "shield" ? battler && battler.armors && battler.armors()[0] : battler && battler.equips && battler.equips()[number(step.equipIndex) - 1])?.iconIndex) || 0
                : source === "color" ? 0 : B.visualIcon(step, battler, item);
            if (index > 0) {
                const size = ImageManager.iconWidth || 32;
                sprite = new Sprite(ImageManager.loadSystem("IconSet"));
                sprite.setFrame(index % 16 * size, Math.floor(index / 16) * size, size, size);
            } else {
                // No icon to show (or a plain shot): a dot of the step's color.
                const size = Math.max(4, number(step.size) || 8), streak = step.type === "projectile" && !number(step.arc) && !number(step.spin);
                const bitmap = streak ? new Bitmap(size * 4, Math.max(2, Math.round(size / 2))) : new Bitmap(size, size);
                if (streak) step = Object.assign({}, step, { _streak: true });
                bitmap.fillAll(step.color || "#ffcc55");
                sprite = new Sprite(bitmap);
                sprite._rrOwned = true;
                sprite._rrStreak = !!step._streak;
            }
        }
        sprite.anchor.set(0.5, 0.5);
        sprite.visible = false;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const spriteset = scene && scene._spriteset;
        if (!spriteset || !spriteset.addChild) { sprite.destroy(); return null; }
        spriteset.addChild(sprite);
        return sprite;
    };

    Stage.dropOverlay = function(entry) {
        const sprite = entry.sprite;
        entry.live = false;
        if (entry.body) { Stage.dropBody(entry.body); entry.body = null; }
        if (!sprite) return;
        entry.sprite = null;
        if (sprite.parent) sprite.parent.removeChild(sprite);
        if (sprite._rrOwned && sprite.bitmap) sprite.bitmap.destroy();
        sprite.destroy();
    };

    /** A Picture or Icon step: shown on its units (or the screen), moved, cleared. */
    Stage.layer = function(state, step, chosen, characters, start) {
        const owners = step.space === "screen" ? [null] : characters;
        owners.forEach((owner, i) => {
            const key = step.type + ":" + step.index + ":" + (owner ? state.keys.get(owner) : "screen");
            const at = state.layers.findIndex(layer => layer.key === key);
            const old = at >= 0 ? state.layers[at] : null;
            if (step.operation === "move") {
                if (old) Object.assign(old, { fromX: old.x, fromY: old.y, fromOpacity: old.opacity, toX: number(step.x), toY: number(step.y), toOpacity: number(step.opacity), start, end: start + Math.max(1, number(step.duration)) });
                return;
            }
            if (old) { Stage.dropOverlay(old); state.layers.splice(at, 1); }
            if (step.operation === "clear") return;
            const sprite = Stage.makeSprite(step, chosen[i] || state.ctx.action.subject(), state.ctx.action);
            if (sprite) state.layers.push({ key, owner, sprite, step, x: number(step.x), y: number(step.y), opacity: number(step.opacity === undefined ? 255 : step.opacity), start, end: start, born: start });
        });
    };

    /** Places every overlay for this frame; called as the map's sprites update. */
    Stage.drawOverlays = function() {
        const scratch = Stage._screen || (Stage._screen = {});
        for (const state of Stage._runs) {
            let time = state.player ? state.player.frame : 0;
            // In slow motion the map updates on some frames only: between them what flies keeps moving, at the slowed rate.
            const director = F.Director, rate = director && director.timeScale ? number(director.timeScale()) : 1;
            if (state.posedNow || !(rate < 1)) { state.sub = 0; state.posedNow = false; }
            else { state.sub = Math.min(0.999, state.sub + rate); time = state.time + state.sub; for (const flight of state.flights) if (flight.from && flight.live) Stage.advanceFlight(flight, time); }
            for (const flight of state.flights) {
                if (flight.body) { Stage.placeBody(flight); continue; }
                const sprite = flight.sprite;
                if (!sprite) continue;
                if (!flight.live || !flight.from) { sprite.visible = false; continue; }
                const point = Stage.screenOf(flight.point.x, flight.point.y, flight.point.z, scratch);
                sprite.visible = !!point.visible && (!sprite.bitmap.isReady || sprite.bitmap.isReady());
                sprite.x = point.x; sprite.y = point.y;
                sprite.rotation = flight.rotation * Math.PI / 180;
                sprite.scale.set(number(flight.step.scale === undefined ? 1 : flight.step.scale) * point.scale);
                if (sprite._rrStreak) {
                    // Along its way on the screen.
                    const far = Stage.screenOf(flight.to.x, flight.to.y, flight.to.z, Stage._far || (Stage._far = {})), fx = far.x, fy = far.y;
                    const near = Stage.screenOf(flight.from.x, flight.from.y, flight.from.z, Stage._far);
                    sprite.rotation += Math.atan2(fy - near.y, fx - near.x);
                }
            }
            for (const layer of state.layers) {
                const sprite = layer.sprite, step = layer.step;
                if (layer.end > layer.start) {
                    const t = Math.min(1, Math.max(0, (time - layer.start) / (layer.end - layer.start)));
                    layer.x = layer.fromX + (layer.toX - layer.fromX) * t; layer.y = layer.fromY + (layer.toY - layer.fromY) * t; layer.opacity = layer.fromOpacity + (layer.toOpacity - layer.fromOpacity) * t;
                }
                let x = Graphics.width / 2, y = Graphics.height / 2, scale = 1, visible = true;
                if (layer.owner) {
                    const body = Stage.bodyPoint(layer.owner, Stage.heightOf(layer.owner) * 0.5, Stage._body || (Stage._body = {}));
                    const point = Stage.screenOf(body.x, body.y, body.z, scratch);
                    x = point.x; y = point.y; scale = point.scale; visible = !!point.visible;
                }
                sprite.visible = visible && (!sprite.bitmap.isReady || sprite.bitmap.isReady());
                sprite.x = x + layer.x * scale; sprite.y = y + layer.y * scale;
                sprite.opacity = layer.opacity;
                sprite.rotation = (number(step.angle) + (time - layer.born) * number(step.spin)) * Math.PI / 180;
                sprite.scale.set(number(step.scale === undefined ? 1 : step.scale) * scale);
            }
        }
        for (let i = Stage._flashes.length - 1; i >= 0; i--) {
            const flash = Stage._flashes[i], t = flash.frame++ / flash.duration;
            if (t >= 1 || !flash.sprite.parent) { if (flash.sprite.setBlendColor) flash.sprite.setBlendColor([0, 0, 0, 0]); Stage._flashes.splice(i, 1); continue; }
            flash.color[3] = Math.round((flash.alpha === undefined ? (flash.alpha = flash.color[3]) : flash.alpha) * (1 - t));
            flash.sprite.setBlendColor(flash.color);
        }
    };

    //-------------------------------------------------------------------------
    // Every frame: beats, units easing home, and what a battle warms up.

    Stage.tick = function() {
        Stage._tick++;
        const beats = Stage._beats;
        for (let i = beats.length - 1; i >= 0; i--) {
            const beat = beats[i], claim = beat.claim, character = claim.character;
            // Outside a run nothing else places the character: the beat starts from its cell.
            if (beat.kind !== "hold") {
                const base = claim.count > 1 && claim.lastX !== undefined && Stage._runs.length;
                if (!base) { character._realX = character._x; character._realY = character._y; Stage.lift(claim, 0); }
                const offset = beatOffset(beat, beatScratch);
                character._realX += offset.x; character._realY += offset.y;
                if (offset.z) Stage.lift(claim, claim.z + offset.z);
            }
            if (++beat.frame > beat.length) {
                beats.splice(i, 1);
                Stage.release(claim, claim.count <= 1 && beat.kind !== "hold" ? true : false);
            }
        }
        const settles = Stage._settles;
        for (let i = settles.length - 1; i >= 0; i--) {
            const settle = settles[i], claim = settle.claim, character = claim.character;
            const t = Math.min(1, ++settle.frame / Stage.SETTLE_FRAMES), e = 1 - t * t * (3 - 2 * t);
            character._realX = character._x + (settle.x - character._x) * e;
            character._realY = character._y + (settle.y - character._y) * e;
            Stage.lift(claim, settle.z * e);
            if (t >= 1) {
                settles.splice(i, 1);
                // Claimed again meanwhile (the next action began): it stays on the stage.
                if (claim.count > 1) claim.count--; else Stage.restore(claim);
            }
        }
        // In a battle two actions a frame; on the quiet map one, so nothing is felt.
        if (Stage._warm && Stage._warm.length) Stage.warmSome(typeof $gameFight !== "undefined" && $gameFight && $gameFight.isActive && $gameFight.isActive() ? 2 : 1);
    };

    /** A unit struck, missed or healed: the flinch, the sidestep, the flash. */
    Stage.react = function(payload) {
        if (!payload || typeof $gameFight === "undefined" || !$gameFight || !$gameFight.unit) return;
        const fight = $gameFight, target = fight.unit(payload.targetId), character = target && fight.character(target);
        if (!character) return;
        const striker = payload.unitId !== undefined && fight.unit(payload.unitId) ? fight.character(fight.unit(payload.unitId)) : null;
        const from = striker && striker !== character ? striker : null;
        if (payload.heal) return;
        if (payload.missed || payload.evaded) { Stage.beat(character, "evade", from); return; }
        Stage.beat(character, "hurt", from);
        Stage.flash(character, payload.critical ? [255, 220, 120, 220] : [255, 255, 255, 170], payload.critical ? 14 : 10);
        const holder = Stage.holderOf(character), R = reactor3d();
        const motion = payload.defeated ? ["dead", "collapse"] : ["damage"];
        const rule = holder && !holder.action ? holder.rules.find(entry => entry.trigger === "action" && motion.includes(String(entry.name).toLowerCase())) : null;
        if (rule && R.playModelAnimation) R.playModelAnimation(character, rule.name);
    };

    /**
     * Before the first blow: the sequences the units present can play are
     * resolved a few a frame, and their animations, pictures and motions
     * made ready, so the first action does not load anything.
     */
    Stage.warm = function() {
        if (typeof $gameFight === "undefined" || !$gameFight || !$gameFight.units) return;
        Stage._warm = [];
        Stage._queued.clear();
        for (const unit of $gameFight.units()) {
            const battler = $gameFight.battler(unit), character = $gameFight.character(unit);
            if (!battler || !character) continue;
            // The unit's own model takes its motions once; what its record plays was readied with the map (warmMap).
            Stage._warm.push({ battler, character, skillId: 0 });
            Stage.queueSkills(battler, character);
        }
    };

    /** The skills a battler can play (its attack, and up to twelve it knows or uses), queued unless readied this session. */
    Stage.queueSkills = function(battler, character) {
        const skills = new Set([battler.attackSkillId ? battler.attackSkillId() : 1]);
        if (battler.isActor && battler.isActor()) for (const skill of battler.skills().slice(0, 12)) skills.add(skill.id);
        else if (battler.enemy) for (const entry of battler.enemy().actions.slice(0, 12)) skills.add(entry.skillId);
        for (const id of skills) {
            const key = Stage.warmKey(battler, id);
            // Thirty raiders of one record ask once.
            if (Stage._warmed.has(key) || Stage._queued.has(key)) continue;
            Stage._queued.add(key);
            Stage._warm.push({ battler, character, skillId: id });
        }
    };

    // What was readied this session: a record's skill with the weapons it was resolved with (the sequence follows them).
    Stage._warmed = new Set();
    Stage._queued = new Set();
    Stage.warmKey = function(battler, skillId) {
        const actor = battler.isActor && battler.isActor();
        const weapons = actor && battler.weapons ? battler.weapons().map(weapon => weapon.id).join("+") : "";
        return (actor ? "a" + battler.actorId() : "e" + (battler.enemyId ? battler.enemyId() : 0)) + ":" + skillId + ":" + weapons;
    };

    /** The records a battle on this map can bring: its unit events (card, note or page comment), what its events spawn. `[{ record, id }]`. */
    Stage.mapRecords = function(mapData) {
        const out = [], seen = new Set();
        const add = spec => {
            const id = spec && Math.floor(Number(spec.id) || 0), record = spec && spec.record === "actor" ? "actor" : "enemy";
            if (!(id > 0) || seen.has(record + id)) return;
            seen.add(record + id); out.push({ record, id });
        };
        for (const event of (mapData && mapData.events) || []) {
            if (!event) continue;
            if (F.dataUnitSpec) add(F.dataUnitSpec(event));
            for (const page of event.pages || []) {
                const list = (page && page.list) || [];
                if (F.unitSpecOf && !event.rrUnit) add(F.unitSpecOf({ note: "" }, list));
                for (const command of list) {
                    const parameters = command && command.code === 357 ? command.parameters || [] : null;
                    if (parameters && parameters[0] === "RPGReactor" && parameters[1] === "SpawnUnit" && parameters[3]) add(parameters[3]);
                }
            }
        }
        return out;
    };

    /**
     * With the map, before any battle: what its units and the party can play is
     * resolved one action a frame while the map is quiet, so a battle's first
     * frames load nothing (a sequence's projectile model took 50 ms to build
     * there). Readied once a session per record, skill and weapons.
     */
    Stage.warmMap = function() {
        if (typeof $dataMap === "undefined" || !$dataMap || typeof $gameParty === "undefined" || !$gameParty) return;
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isActive && $gameFight.isActive()) return;
        if (!Stage._warm || !Stage._warm.length) { Stage._warm = []; Stage._queued.clear(); }
        for (const actor of ($gameParty.battleMembers ? $gameParty.battleMembers() : [])) if (actor) Stage.queueSkills(actor, null);
        for (const spec of Stage.mapRecords($dataMap)) {
            let battler = null;
            try {
                battler = spec.record === "actor" ? (typeof $gameActors !== "undefined" && $gameActors ? $gameActors.actor(spec.id) : null)
                    : (typeof Game_Enemy !== "undefined" && typeof $dataEnemies !== "undefined" && $dataEnemies[spec.id] ? new Game_Enemy(spec.id, 0, 0) : null);
            } catch (error) { battler = null; }
            if (battler) Stage.queueSkills(battler, null);
        }
    };

    Stage.warmSome = function(count) {
        const B = data(), P = root.ReactorBattlePresentation;
        while (count-- > 0 && Stage._warm.length) {
            const { battler, character, skillId } = Stage._warm.pop();
            try {
                const holder = character ? Stage.holderOf(character) : null, View = root.ReactorBattleRoomView;
                if (holder && View && View.prepareMotions) View.prepareMotions(holder);
                // A unit's own model only (0), or a skill that is not in the data: nothing more to ready.
                if (skillId && !$dataSkills[skillId]) Stage._warmed.add(Stage.warmKey(battler, skillId));
                if (typeof Game_Action === "undefined" || !$dataSkills[skillId]) continue;
                const action = new Game_Action(battler);
                // An enemy readied with the map stands in no troop yet: the action is told whose it is.
                if (action.subject() !== battler) action.subject = () => battler;
                action.setSkill(skillId);
                const ready = !!(P && P.sequence && P.state === "ready");
                const sequence = ready ? P.sequence(battler, action) : null;
                // Readied for the session once the sequences could be resolved (before that only the skill's own animation was).
                if (ready) Stage._warmed.add(Stage.warmKey(battler, skillId));
                const ids = new Set();
                const own = action.item().animationId;
                ids.add(own === -1 ? (battler.attackAnimationId1 ? battler.attackAnimationId1() : 0) : own);
                for (const step of sequence ? sequence.steps : []) {
                    if ((step.type === "animation" || step.type === "projectile") && step.animationId > 0) ids.add(step.animationId);
                    if ((step.type === "picture" || step.iconSource === "picture") && step.name && typeof ImageManager !== "undefined") ImageManager.loadPicture(step.name);
                    if (step.type === "projectile" && Stage.is3D()) { const spec = Stage.projectileSpec(step, battler, action), R = reactor3d(); if (spec && R.loadModel) Promise.resolve(R.loadModel(spec.name, spec.ext, spec.file, spec.texture)).then(template => { if (R.boundModelTemplate) R.boundModelTemplate(template); }).catch(() => {}); }
                }
                for (const id of ids) Stage.warmAnimation($dataAnimations[id]);
            } catch (error) { /* warming is a courtesy */ }
        }
        try {
            if (!Stage._warm.length && typeof ImageManager !== "undefined" && ImageManager.loadSystem) ImageManager.loadSystem("IconSet");
        } catch (error) { /* warming is a courtesy */ }
    };

    Stage.warmAnimation = function(animation) {
        if (!animation) return;
        if (animation.effectName && typeof EffectManager !== "undefined" && EffectManager.load) EffectManager.load(animation.effectName);
        if (animation.frames && typeof ImageManager !== "undefined" && ImageManager.loadAnimation) {
            if (animation.animation1Name) ImageManager.loadAnimation(animation.animation1Name);
            if (animation.animation2Name) ImageManager.loadAnimation(animation.animation2Name);
        }
    };

    //-------------------------------------------------------------------------
    // Installed on the map.

    if (typeof Game_Map !== "undefined") {
        const updateMap = Game_Map.prototype.update;
        Game_Map.prototype.update = function(sceneActive) {
            updateMap.call(this, sceneActive);
            if (Stage._beats.length || Stage._settles.length || (Stage._warm && Stage._warm.length)) Stage.tick();
        };
    }

    if (typeof Spriteset_Map !== "undefined") {
        const updateSpriteset = Spriteset_Map.prototype.update;
        Spriteset_Map.prototype.update = function() {
            updateSpriteset.call(this);
            if (Stage._runs.length || Stage._flashes.length) Stage.drawOverlays();
            if (Stage._anchors.length) Stage.updateAnchors();
        };
    }

    if (typeof Scene_Map !== "undefined") {
        // A map opened with nothing playing has nobody on the stage.
        const start = Scene_Map.prototype.start;
        Scene_Map.prototype.start = function() {
            start.call(this);
            if (!Stage._runs.length) Stage.sweep();
            try { Stage.warmMap(); } catch (error) { /* warming is a courtesy */ }
        };
    }

    if (typeof ReactorEvents !== "undefined" && ReactorEvents.on) {
        ReactorEvents.on("fightImpact", payload => { try { Stage.react(payload); } catch (error) { /* a reaction never stops a battle */ } });
        ReactorEvents.on("mapBattleStart", () => { try { Stage.warm(); } catch (error) { /* warming is a courtesy */ } });
        ReactorEvents.on("mapBattleEnd", () => {
            for (const state of Stage._runs.slice()) { if (state.player && !state.player.done) state.player.cancel(); Stage.dropState(state, true); }
            Stage._warm = null;
        });
    }

    if (typeof module !== "undefined" && module.exports) module.exports = Stage;
})(globalThis);
