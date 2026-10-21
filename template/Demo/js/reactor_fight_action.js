//=============================================================================
// reactor_fight_action.js — Action and First Person battles on the live map
//
// The real-time driver for the modes "action" and "firstPerson" (docs/BATTLE-
// MODES.md): no turns and no phases. The player moves as on the map and
// attacks with the equipped weapon (a gun fires where the crosshair points,
// a blade chains a short combo); every other unit runs a small state machine
// (notice, approach or keep its distance, wind up, attack, recover). Units,
// sides, goals, hooks and outcomes are the fight's own (reactor_fight.js),
// and every hit is the stock battle math through Game_Action.
//
// One driver serves both modes: the rules are the same, the camera and how
// aiming is shown differ. Each wrapper here falls through unless
// `$gameFight.isAction()`, so Tactical and Classic battles read as before.
//=============================================================================

(function(root) {
    "use strict";

    const F = root.ReactorFight;
    if (!F || typeof Game_Fight === "undefined") return;
    const A = F.Action = {};
    const DEG = Math.PI / 180;
    const num = value => Number(value) || 0;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const stage = () => F.Stage || null;
    const world3 = () => (typeof Reactor3D !== "undefined" && Reactor3D ? Reactor3D : null);
    const feed = () => F.feed && F.feed();

    /** Frames between the "turns" hooks and states count (states tick, turn hooks fire, a Survive goal counts them). */
    A.TURN_FRAMES = 240;
    /** How many times a weapon's tactical range a shot carries, in tiles. */
    A.RANGE_SCALE = 2.5;
    /** A unit other than the player thinks this often, in frames; one far from the player four times slower. */
    A.THINK = 10;
    A.FAR = 18;
    /** How many units may think in one frame, however many fight: the rest think on the next. */
    A.THINK_BUDGET = 6;
    /** How far a unit sees (in front of it) and hears (all round), in tiles, before it has noticed anyone. */
    A.SIGHT = 9;
    A.HEARING = 3;
    A.DODGE_FRAMES = 18;
    A.DODGE_SAFE = 14;
    A.DODGE_REST = 32;
    A.GUARD_RATE = 0.4;
    A.COMBO_GRACE = 26;
    /** Blows come from every side at once here: the party takes this share of each. */
    A.PARTY_DAMAGE = 0.85;
    /** How many units may be winding up or striking at one opponent at a time; the rest hold off. */
    A.MAX_ATTACKERS = 3;
    /** A guard raised this many frames or fewer before a blow lands turns it aside whole and staggers who struck. */
    A.PERFECT_GUARD = 8;
    /** Frames the battle holds its breath when the player's blade lands (a chain's last step a little longer). */
    A.HIT_STOP = 3;
    /** A fallen unit lies this long before it fades. */
    A.FALL_REST = F.FALL_REST;
    // A blow struck at arm's length (a swing, a melee skill) lands only on who stands within this many tiles of its
    // height: nobody is struck through the roof they stand on, or from it.
    A.LEVEL_REACH = 1.6;
    // How far round a target standing above it a unit looks for a way up (a ledge within reach, a ladder), in tiles.
    A.CLIMB_SEARCH = 7;
    // Where a body sees from, where it is seen and struck, and where its head is, as shares of its height.
    A.EYE = 0.9;
    A.CHEST = 0.6;
    A.HEAD = 0.95;
    // A standing figure is a round post this share of its height wide, never slimmer than a sprite; anything else
    // (a vehicle, a beast) is its model's own footprint.
    A.FIGURE_WIDTH = 0.13;
    A.SLIM = 0.38;
    // How far short of a body's middle a line may end and still have reached it, in tiles.
    A.LINE_SLACK = 0.35;
    // The map's models that are no unit (props, vehicles) are measured again this often, in frames.
    A.PROP_FRAMES = 30;
    // How many opponents the HUD looks for anew each frame; the rest keep their last answer this long at most.
    A.SEEN_BUDGET = 2;
    A.SEEN_FRAMES = 20;
    // Where a shot meets the world: a spark for a few frames, and a mark that stays a while. So many at once.
    A.SPARK_FRAMES = 7;
    A.MARK_FRAMES = 150;
    A.MARKS = 16;
    // How big they are, in tiles (a tile is about 0.6 m: a mark some four centimetres across), and the most of the
    // picture's height either may take across (seen from a step away they would fill the view at their own size).
    A.SPARK_SIZE = 0.12;
    A.MARK_SIZE = 0.035;
    A.SPARK_SHARE = 0.036;
    A.MARK_SHARE = 0.013;
    // No mark is left on what the eye is nearer than this to, in tiles: only the spark.
    A.MARK_NEAR = 0.5;
    // How far over or under a model's own heights a line may pass and still strike it, in tiles.
    A.HULL_PAD = 0.1;
    // A way round what stands between a unit and where it is going: how many cells of it are looked at, how many
    // of its steps are kept, and how long a unit waits before it asks again (after a way was found, after none was).
    A.ROUTE_CELLS = 220;
    A.ROUTE_STEPS = 16;
    A.ROUTE_REST = 40;
    A.ROUTE_NONE = 150;
    // Frames nothing can hurt who has just taken the lead from a fallen leader, and the line that says so stays.
    A.LEAD_SAFE = 60;
    A.NOTICE_FRAMES = 150;

    //-------------------------------------------------------------------------
    // Note tags and what a weapon is.

    /** The action tags of one note, or null when it has none. */
    A.parse = function(note) {
        const text = String(note || "");
        if (text.indexOf("<") < 0) return null;
        const tags = {};
        let found = false;
        const number = (key, pattern) => {
            const match = pattern.exec(text);
            if (match) { tags[key] = Number(match[1]); found = true; }
        };
        number("fireRate", /<fire\s*rate\s*:\s*([\d.]+)\s*>/i);
        number("magazine", /<magazine\s*:\s*(\d+)\s*>/i);
        number("reload", /<reload\s*:\s*([\d.]+)\s*>/i);
        number("spread", /<spread\s*:\s*([\d.]+)\s*>/i);
        number("combo", /<combo\s*:\s*(\d+)\s*>/i);
        number("cooldown", /<cooldown\s*:\s*([\d.]+)\s*>/i);
        const projectile = /<projectile\s*:\s*(\w+)\s*>/i.exec(text);
        if (projectile && A.PROJECTILES[projectile[1].toLowerCase()] !== undefined) { tags.projectile = projectile[1].toLowerCase(); found = true; }
        return found ? tags : null;
    };

    /** Tiles a frame each kind flies; 0 lands at once along the line. */
    A.PROJECTILES = { bullet: 0, arrow: 0.55, bolt: 0.42, rocket: 0.3, none: -1 };

    /** What a weapon is when its note says nothing, by its type's name; the first that matches. */
    A.TYPES = [
        [/shotgun/, { ranged: true, fireRate: 1.2, magazine: 6, reload: 2.2, spread: 9, projectile: "bullet", pellets: 6 }],
        [/pistol/, { ranged: true, fireRate: 3, magazine: 12, reload: 1.2, spread: 3, projectile: "bullet" }],
        [/rifle/, { ranged: true, fireRate: 2.5, magazine: 10, reload: 1.6, spread: 1.5, projectile: "bullet" }],
        [/cannon|launcher/, { ranged: true, fireRate: 0.7, magazine: 1, reload: 2.2, spread: 1, projectile: "rocket" }],
        [/crossbow|bow/, { ranged: true, fireRate: 1.2, magazine: 0, reload: 0, spread: 2, projectile: "arrow" }],
        [/gun/, { ranged: true, fireRate: 6, magazine: 30, reload: 2, spread: 3.5, projectile: "bullet" }],
        [/dagger|knife|claw/, { ranged: false, fireRate: 3.5, combo: 4, reach: 1.2 }]
    ];
    A.MELEE = { ranged: false, fireRate: 2.6, combo: 3, reach: 1.6 };
    A.UNARMED = { ranged: false, fireRate: 3, combo: 2, reach: 1.1 };

    const NUMBERS = ["fireRate", "magazine", "reload", "spread", "combo", "cooldown"];

    /**
     * A record's action settings: its own `rrBattle` (what the Database's Action and First Person Battles card
     * stores: `{ fireRate, magazine, reload, spread, combo, projectile, cooldown }`, each optional), and for whatever
     * that leaves unset the tags of its note. Null when it sets nothing either way.
     */
    A.settings = function(record) {
        const tags = A.parse(record.note), own = record.rrBattle;
        if (!own || typeof own !== "object") return tags;
        const out = tags || {};
        let found = !!tags;
        for (const key of NUMBERS) {
            const value = own[key];
            if (value === null || value === undefined || value === "" || !(Number(value) >= 0)) continue;
            out[key] = key === "magazine" || key === "combo" ? Math.floor(Number(value)) : Number(value);
            found = true;
        }
        const projectile = typeof own.projectile === "string" ? own.projectile.toLowerCase() : "";
        if (projectile && A.PROJECTILES[projectile] !== undefined) { out.projectile = projectile; found = true; }
        return found ? out : null;
    };

    const tagCache = new WeakMap();
    // Read once, and again when the note or the `rrBattle` object changes (a new object: one changed in place is not seen).
    function tagsOf(record) {
        if (!record || typeof record !== "object") return null;
        const note = record.note || "", own = record.rrBattle || null, kept = tagCache.get(record);
        if (kept && kept.note === note && kept.own === own) return kept.tags;
        const tags = A.settings(record);
        tagCache.set(record, { note, own, tags, profile: null, typeName: "" });
        return tags;
    }

    function build(base, tags, weaponId, reachTiles) {
        const t = tags || {};
        const projectile = t.projectile !== undefined ? t.projectile : base.ranged ? base.projectile : "none";
        const ranged = projectile !== "none" && (base.ranged || t.projectile !== undefined);
        const fireRate = clamp(num(t.fireRate) || base.fireRate || 2.5, 0.2, 20);
        const pellets = ranged ? Math.max(1, base.pellets || 1) : 1;
        const combo = clamp(Math.round(t.combo || base.combo || 3), 1, 5);
        return {
            weaponId, ranged, projectile: ranged ? projectile : "none",
            rate: Math.max(2, Math.round(60 / fireRate)),
            magazine: ranged ? Math.max(0, Math.round(t.magazine !== undefined ? t.magazine : base.magazine || 0)) : 0,
            reload: Math.round(60 * (t.reload !== undefined ? t.reload : base.reload || 0)),
            spread: t.spread !== undefined ? t.spread : base.spread || 2,
            aimSpread: (t.spread !== undefined ? t.spread : base.spread || 2) / 4,
            speed: ranged ? A.PROJECTILES[projectile] || 0 : 0,
            pellets, blast: projectile === "rocket" ? 1.5 : 0,
            range: ranged ? Math.max(4, reachTiles * A.RANGE_SCALE) : 0,
            reach: ranged ? 0 : base.reach || 1.6, arc: 120, combo,
            // About one attack's damage a second of held fire, whatever the fire rate; a pellet its share.
            damage: ranged ? Math.min(1, 1 / fireRate) / pellets : 1
        };
    }

    /** What the battler fights with: its first weapon's tags over its type's defaults, or bare hands. The object is shared: do not change it. */
    A.profile = function(battler) {
        const weapon = battler && battler.isActor && battler.isActor() ? battler.weapons()[0] || null : null;
        if (!weapon) return A._unarmed || (A._unarmed = build(A.UNARMED, null, 0, 1));
        const tags = tagsOf(weapon), kept = tagCache.get(weapon);
        const types = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.weaponTypes;
        const typeName = String((types && types[weapon.wtypeId]) || "").toLowerCase();
        if (kept.profile && kept.typeName === typeName) return kept.profile;
        const found = A.TYPES.find(([pattern]) => pattern.test(typeName));
        const base = found ? found[1] : A.MELEE;
        let reach = base.ranged ? 5 : 1;
        if (F.tactics && typeof $dataSkills !== "undefined") {
            try { reach = F.tactics(battler, $dataSkills[battler.attackSkillId()]).max || reach; } catch (error) { /* the default stands */ }
        }
        kept.typeName = typeName;
        kept.profile = build(base, tags, weapon.id, reach);
        return kept.profile;
    };

    /** A skill's or an item's cooldown on the hotbar, in frames. */
    A.cooldownOf = function(item) {
        const tags = tagsOf(item);
        if (tags && tags.cooldown !== undefined) return Math.round(tags.cooldown * 60);
        return typeof DataManager !== "undefined" && DataManager.isItem && DataManager.isItem(item) ? 60 : 120;
    };

    //-------------------------------------------------------------------------
    // The battle's state. Plain data, saved with the fight.

    Game_Fight.prototype.isAction = function() {
        return this._active && (this._mode === "action" || this._mode === "firstPerson");
    };

    Game_Fight.prototype.act = function() {
        if (!this._action) {
            this._action = {
                rev: 1, clock: 0, defeats: 0, judged: 0, nextShot: 1,
                player: { cooldown: 0, mags: {}, reload: 0, reloadTotal: 0, combo: 0, comboTimer: 0, swing: null, buffered: false,
                    dodge: 0, safe: 0, rest: 0, guard: false, aim: false, lock: 0, hot: {}, pulse: 0, pulseAngle: null, hitMark: 0, killMark: 0,
                    recoil: 0, auto: false, shake: 0, guardAt: 0 },
                ai: {}, shots: [], runs: [], stop: 0
            };
        }
        return this._action;
    };

    Game_Fight.prototype.actionRevision = function() {
        return this._action ? this._action.rev : 0;
    };

    /** The unit the player moves: the party member who is the leader. */
    Game_Fight.prototype.playerUnit = function() {
        for (const unit of this._units) {
            if (unit.party && !unit.gone && this.character(unit) === $gamePlayer) return unit;
        }
        return null;
    };

    const clearFight = Game_Fight.prototype.clear;
    Game_Fight.prototype.clear = function() {
        clearFight.call(this);
        this._action = null;
    };

    const startFight = Game_Fight.prototype.start;
    Game_Fight.prototype.start = function(options) {
        const serial = startFight.call(this, options);
        if (serial && this.isAction()) {
            this.act();
            // Party members standing on the leader's cell (just gathered there) each take their own.
            for (const unit of this._units) {
                const character = unit.party ? this.character(unit) : null;
                if (!character || character === $gamePlayer || character.x !== $gamePlayer.x || character.y !== $gamePlayer.y) continue;
                const spot = this.freeSpotNear($gamePlayer.x, $gamePlayer.y, 2);
                if (!spot) continue;
                Game_CharacterBase.prototype.locate.call(character, spot.x, spot.y);
                this._inside[String(unit.id)] = [spot.x, spot.y];
                // The level the spot was found on is the one it stands on (a member moved off the leader's cell upstairs stays upstairs).
                if (Number.isFinite(spot.height)) character._reactorGround = spot.height;
            }
            // Nobody begins inside another body: a unit placed in a big one's footprint, or on a cell another holds,
            // takes the nearest clear cell on its own level. The player is never moved.
            for (const unit of this._units) {
                if (unit.gone || unit.team === "neutral") continue;
                const character = this.character(unit);
                if (!character || character === $gamePlayer || A.standsClear(this, unit, character)) continue;
                const spot = A.clearSpot(this, unit, character);
                if (!spot) continue;
                Game_CharacterBase.prototype.locate.call(character, spot.x, spot.y);
                this._inside[String(unit.id)] = [spot.x, spot.y];
                if (A.is3D()) character._reactorGround = spot.height;
            }
            A.enter(this);
        }
        return serial;
    };

    /** Whether a unit stands clear of every other body: on a cell of its own, outside any big body's footprint. */
    A.standsClear = function(fight, unit, character) {
        const cx = character.x + 0.5, cz = character.y + 0.5;
        for (const other of fight._units) {
            if (other === unit || other.gone) continue;
            const body = fight.character(other);
            if (!body || body === character) continue;
            // Of two on one cell the later one moves.
            if (body.x === character.x && body.y === character.y && fight._units.indexOf(other) < fight._units.indexOf(unit)) return false;
            const size = sizeOf(fight, body);
            if (!size.round && covers(size, body, cx, cz)) return false;
        }
        return true;
    };

    /** The nearest cell round a unit where its body has room, that a walker can stand on, within a step of its own level and out of deep water; null when there is none near. */
    A.clearSpot = function(fight, unit, character) {
        const R = world3(), deep = A.is3D(), level = A.groundOf(character);
        for (let radius = 1; radius <= 8; radius++) {
            let best = null, least = Infinity;
            for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const x = character.x + dx, y = character.y + dy, far = dx * dx + dy * dy;
                if (far >= least || !$gameMap.isValid(x, y) || $gamePlayer.pos(x, y) || $gameMap.eventsXyNt(x, y).length) continue;
                if (!($gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) || $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8))) continue;
                let ground = level;
                if (deep) {
                    // The battle's own word on where a body may be put (a level to stand on with room over it), where it has one.
                    ground = F.standLevel ? F.standLevel(x, y, level) : R.groundHeightAt($dataMap, x + 0.5, y + 0.5, level) || 0;
                    if (!Number.isFinite(ground) || Math.abs(ground - level) > 1 + (R.TERRAIN_SLOPE_LIMIT || 0.75)) continue;
                    if (R.waterDepthAt && R.waterDepthAt($dataMap, x + 0.5, y + 0.5, ground) > (R.WATER_WADE || 0.45)) continue;
                }
                if (!A.roomAt(fight, unit, character, x, y)) continue;
                best = { x, y, height: ground }; least = far;
            }
            if (best) return best;
        }
        return null;
    };

    const finishFight = Game_Fight.prototype.finish;
    Game_Fight.prototype.finish = function() {
        const action = this.isAction();
        if (action) A.leave(this);
        finishFight.call(this);
    };

    /** A battle begins (or a save in one loads): the battle's keys, and nothing left over from another mode. */
    A.enter = function(fight) {
        A._entered = true;
        if (root.ReactorControls && root.ReactorControls.setAction) root.ReactorControls.setAction(true);
        In.reset();
        A.aimBlend = 0;
        // Nothing measured before this battle is taken for its own (a model that was scenery may be a unit now;
        // what the HUD saw is kept by the battle it saw it in).
        if (A._props) A._props.stamp = -1e9;
        // Behind or inside the player the mouse is the look: taken as the battle starts (where the platform lets a
        // battle take it without a click; else the first click does), and the look levelled so the crosshair is ahead.
        const R = world3(), C = R && R.Camera;
        // A First Person battle is seen through the leader's eyes whatever camera the map has; the map's own comes back after.
        const st = fight.act();
        // How the look was tipped before the battle levelled it: given back when the battle ends.
        if (C && C.look && !st.lookWas) st.lookWas = { pitch: C.look.pitch };
        if (C && C.normalizeState && A.is3D() && fight._mode === "firstPerson" && A.cameraMode() !== "firstPerson" && typeof $gameMap !== "undefined") {
            st.cameraWas = Object.assign({}, C.currentState());
            $gameMap._reactorCamera3d = C.normalizeState({ mode: "firstPerson" });
            $gameMap._reactorCamera3dTween = { frames: 20, total: 20, from: null };
        }
        if (C && A.relative()) {
            if (C.look && A.cameraMode() === "thirdPerson" && (C.look.pitch === null || C.look.pitch > 14)) C.look.pitch = 8;
            if (C.requestLook) C.requestLook();
        }
        A._retake = false;
    };

    /**
     * The party as it was before a fallen leader handed the lead on: the members it had then, in their order, with
     * anyone who joined during the battle after them and anyone who left gone.
     */
    A.restoreOrder = function(st) {
        if (!st || !st.order || typeof $gameParty === "undefined" || !$gameParty) return;
        const now = $gameParty._actors, order = st.order.filter(id => now.includes(id));
        for (const id of now) if (!order.includes(id)) order.push(id);
        st.order = null;
        if (order.length !== now.length || order.every((id, i) => id === now[i])) return;
        A.reseat(() => {
            $gameParty._actors = order;
            if (typeof $gamePlayer !== "undefined" && $gamePlayer && $gamePlayer.refresh) $gamePlayer.refresh();
        });
    };

    // What of a party member's body goes with it when the character that shows it changes: where it is, how it
    // stands and what it is in the middle of (a step, a jump, a climb, a fall).
    A.SEAT = ["_x", "_y", "_realX", "_realY", "_direction", "_reactorDir8", "_opacity", "_jumpCount", "_jumpPeak",
        "_reactorGround", "_reactorAlt", "_reactorAir", "_reactorVz", "_reactorPeak", "_reactorLift", "_reactorZTarget",
        "_reactorMantle", "_reactorOnLadder", "_reactorClimb", "_reactorSwim", "_reactorDive", "_reactorLeap",
        "_reactorStepUp", "_reactorStepDown", "_reactorJumped", "_reactorFall", "_reactorPosePitch", "_reactorFallYaw"];

    /**
     * Changes who leads the party (`change` does it) without moving anybody: every member's body stays where it
     * is, as it is; only which character shows it changes, so the player becomes the new leader where that
     * member stands. The camera goes over to it rather than cutting, and what each holds goes with its holder.
     */
    A.reseat = function(change) {
        if (typeof $gamePlayer === "undefined" || !$gamePlayer || !$gamePlayer.followers) { change(); return; }
        const characters = [$gamePlayer].concat($gamePlayer.followers().data());
        const actorOf = character => (character === $gamePlayer ? $gameParty.leader() : character.actor ? character.actor() : null) || null;
        const seats = new Map(), before = characters.map(actorOf);
        characters.forEach((character, i) => { if (before[i]) seats.set(before[i], A.SEAT.map(key => character[key])); });
        const wasX = $gamePlayer._realX, wasY = $gamePlayer._realY;
        change();
        characters.forEach((character, i) => {
            const actor = actorOf(character), seat = actor ? seats.get(actor) : null;
            if (!seat || actor === before[i]) return;
            A.SEAT.forEach((key, k) => { if (seat[k] === undefined) delete character[key]; else character[key] = seat[k]; });
            // The model it wore was the other's as well, and what that held: its own, and its own in its hands.
            A.remodel(character);
            F.heldItem(character, "aim", null);
            F.heldItem(character, "drop", { battler: before[i] });
            F.heldItem(character, "carry", { battler: actor });
            const size = sizes.get(character);
            if (size) size.at = -1e9;
        });
        if ($gamePlayer._realX === wasX && $gamePlayer._realY === wasY) return;
        // The view follows the player there: eased on a 3D map, centered on a flat one.
        const R = world3();
        if (A.is3D() && R.Camera && typeof $gameMap !== "undefined") $gameMap._reactorCamera3dTween = { frames: 20, total: 20, from: null };
        else if ($gamePlayer.center) $gamePlayer.center($gamePlayer._realX, $gamePlayer._realY);
    };

    /**
     * A party character now shows another member: the model it wore is let go, so the map's scene gives it the
     * one it shows now. (The scene keeps a character's model for as long as the character is drawn and does not
     * look again at whose it is; without this the fallen leader's place would show the new leader's model lying.)
     */
    A.remodel = function(character) {
        const R = world3(), S = stage();
        try {
            const scene = S && S.mapScene ? S.mapScene() : null;
            const spec = scene && scene._modelInstances && R.modelInstanceKey && R.characterModelSpec ? R.characterModelSpec(character) : null;
            const key = scene && scene._modelInstances && R.modelInstanceKey ? R.modelInstanceKey(character) : null;
            const holder = key ? scene._modelInstances.get(key) : null;
            if (!holder || (spec && R.modelCacheKey && holder.spec === R.modelCacheKey(spec.name, spec.ext, spec.file) && (holder.variant || "") === (spec.variant || ""))) return false;
            if (holder.object && holder.object.parent) holder.object.parent.remove(holder.object);
            if (R.MapHeld && R.MapHeld.count && R.MapHeld.detach) R.MapHeld.detach(holder);
            if (R.releaseModelHolder) R.releaseModelHolder(holder);
            scene._modelInstances.delete(key);
            return true;
        } catch (error) {
            // The scene keeps what it has.
            return false;
        }
    };

    /** The line said when the lead passes on (`%1` who leads now): `System.json › reactorBattle.terms.lead`, else this. */
    A.leadText = "%1 takes the lead";

    /**
     * The leader fell: the party's member at `index` takes the lead where it stands, and the fallen one stays
     * where it fell. The player is told in one line, hears it, and cannot be hurt for a moment.
     */
    A.handOver = function(fight, st, index) {
        // The party's own order is kept (in the battle's saved state) and given back when the battle ends.
        if (!st.order) st.order = $gameParty._actors.slice();
        A.reseat(() => $gameParty.swapOrder(0, index));
        const p = st.player, leader = $gameParty.leader();
        p.swing = null; p.buffered = false; p.combo = 0; p.comboTimer = 0; p.aim = false; p.guard = false; p.reload = 0; p.dodge = 0; p.lock = 0;
        p.cooldown = Math.max(p.cooldown, 20);
        p.safe = Math.max(p.safe, A.LEAD_SAFE);
        st.rev++;
        let terms = null;
        try { terms = F.systemSettings ? F.systemSettings().terms : null; } catch (error) { terms = null; }
        const text = String((terms && terms.lead) || A.leadText).replace("%1", leader ? leader.name() : "");
        A.notice(text);
        const S = stage();
        if (S && S.flash) S.flash($gamePlayer, [255, 255, 255, 170], 20);
        if (typeof SoundManager !== "undefined" && SoundManager.playActorCollapse) SoundManager.playActorCollapse();
    };

    /** A line for the player, shown for a while whichever HUD is drawn (see Notice below); a later one replaces it. */
    A.notice = function(text, frames) {
        A.noticeNow = { text: String(text || ""), frames: frames > 0 ? frames : A.NOTICE_FRAMES };
    };

    /** The battle ends: units get their walking pace back, the keys theirs, the weapon comes down, what flies goes. */
    A.leave = function(fight) {
        A._entered = false;
        const st = fight._action;
        A.restoreOrder(st);
        if (st) {
            for (const id of Object.keys(st.ai)) {
                const ai = st.ai[id], unit = fight.unit(Number(id)), character = unit && fight.character(unit);
                if (character && ai.speed0 !== undefined && character.setMoveSpeed) character.setMoveSpeed(ai.speed0);
            }
            for (const entry of st.runs) A.endRun(fight, entry, true);
            st.runs.length = 0;
        }
        if (typeof $gamePlayer !== "undefined" && $gamePlayer) F.heldItem($gamePlayer, "aim", null);
        // Whoever fell stands again (a battle that can be lost revives the party), and the mouse is given back.
        for (const unit of fight._units) { const character = fight.character(unit); if (character && (character._reactorPosePitch || character._reactorFallYaw != null)) F.stand(character); }
        const R = world3(), C = R && R.Camera;
        if (st && st.cameraWas && C && C.normalizeState && typeof $gameMap !== "undefined" && $gameMap.mapId() === fight._mapId) {
            $gameMap._reactorCamera3d = C.normalizeState(st.cameraWas);
            $gameMap._reactorCamera3dTween = { frames: 20, total: 20, from: null };
            st.cameraWas = null;
        }
        // The look tips back to where it was before the battle (the way it faces stays, so the view does not spin),
        // eased with the camera rather than snapped.
        if (st && st.lookWas && C && C.look) {
            if (C.look.pitch !== st.lookWas.pitch && A.is3D() && typeof $gameMap !== "undefined" && $gameMap.mapId() === fight._mapId && !$gameMap._reactorCamera3dTween) {
                $gameMap._reactorCamera3dTween = { frames: 20, total: 20, from: null };
            }
            C.look.pitch = st.lookWas.pitch;
            st.lookWas = null;
        }
        if (C && C.look && C.look.locked && C.releaseLook) C.releaseLook();
        A._retake = false;
        if (root.ReactorControls && root.ReactorControls.setAction) root.ReactorControls.setAction(false);
        A.dropAllFx();
        In.reset();
        A.aimBlend = 0;
        if (A.Hud) A.Hud.hide();
        if (A.Prompt) A.Prompt.hide();
        A.noticeNow = null;
        if (A.Notice) A.Notice.hide();
        A.mouseFree = false;
    };

    // The turn-based queue never starts in an action battle: the frame the base would begin a round runs the battle instead.
    const startRound = Game_Fight.prototype.startRound;
    Game_Fight.prototype.startRound = function() {
        if (!this.isAction()) return startRound.call(this);
        if (!A._entered) A.enter(this);
        A.update(this);
    };

    // A click or a turn of the wheel made while the battle waits (a message, an event, its own ending) is not the
    // battle's: the click that closes a message does not swing the blade when the battle goes on.
    const updateFight = Game_Fight.prototype.update;
    Game_Fight.prototype.update = function() {
        A._ran = false;
        updateFight.call(this);
        if (!A._ran && this._action) { In.leftEdge = false; In.wheel = 0; }
    };

    // A camera director's shot or a sequence settling holds a turn-based battle; nothing holds a real-time one.
    const isHeld = F.isHeld;
    F.isHeld = function() {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isAction()) return false;
        return isHeld.call(F);
    };

    // How hard a blow lands: a shot's or a combo step's share of an attack, and less on one who guards.
    const strikeFor = Game_Fight.prototype.strikeFor;
    Game_Fight.prototype.strikeFor = function(run, action, target) {
        if (!this.isAction()) return strikeFor ? strikeFor.call(this, run, action, target) : null;
        const st = this._action;
        const guarded = st && st.player.guard && target === this.playerUnit();
        const subject = this.unit(run.subjectId);
        const taken = target.party && subject && subject.team !== target.team ? A.PARTY_DAMAGE : 1;
        // A guard raised just as the blow lands turns it aside whole.
        A._perfect = !!guarded && st.clock - st.player.guardAt <= A.PERFECT_GUARD && !!subject && subject.team !== target.team;
        A._strike.damageRate = A._perfect ? 0.0001 : (run.rate > 0 ? run.rate : 1) * (guarded ? A.GUARD_RATE : 1) * taken;
        return A._strike;
    };
    A._strike = { damageRate: 1, hitRate: 1 };
    // Without the tactical driver nothing reads F._strike: the same scaling, here.
    if (!F.tactics && typeof Game_Action !== "undefined") {
        const makeDamageValue = Game_Action.prototype.makeDamageValue;
        Game_Action.prototype.makeDamageValue = function(target, critical) {
            const value = makeDamageValue.call(this, target, critical);
            const from = F._strike;
            return from && value > 0 && from.damageRate !== 1 ? Math.round(value * from.damageRate) : value;
        };
    }

    // A blow lands only on who is still there to take it: not on one mid-dodge, not on one who stepped out of a
    // swing's reach or away from where a skill was aimed.
    const landHits = Game_Fight.prototype.landHits;
    Game_Fight.prototype.landHits = function(run, action, targets, count, first, total) {
        if (!this.isAction()) return landHits.call(this, run, action, targets, count, first, total);
        const st = this.act(), player = this.playerUnit();
        let kept = targets;
        const subject = this.unit(run.subjectId), from = subject && this.character(subject);
        const hostile = !!subject && targets.some(target => target.team !== subject.team);
        if (hostile && from) {
            kept = [];
            for (let i = 0; i < targets.length; i++) {
                const target = targets[i], to = this.character(target);
                if (!to || target.team === subject.team) { kept.push(target); continue; }
                let dodged = target === player && st.player.safe > 0;
                if (!dodged && run.reach > 0) dodged = A.gap(this, from, to) > run.reach || A.levelGap(from, to) > A.LEVEL_REACH;
                if (!dodged && run.aimed && run.aimed[i]) dodged = Math.hypot(to._realX - run.aimed[i][0], to._realY - run.aimed[i][1]) > 1.5;
                if (dodged) { if (stage()) stage().beat(to, "evade", from); continue; }
                // Nothing lands through a wall, a shut door or the ground: a blow whose own line was not traced
                // (a shot's was, from where it was fired) needs a clear one from chest to chest, unless it is one
                // that needs no line at all.
                if (!run.traced && !run.lobbed && !A.blowClear(this, from, to)) continue;
                kept.push(target);
            }
        }
        const before = st.defeats;
        A._perfect = false;
        if (kept.length) landHits.call(this, run, action, kept, count, first, total);
        if (A._perfect && subject && st.ai[subject.id]) {
            // Turned aside: who struck reels.
            const reel = st.ai[subject.id];
            reel.state = "stagger"; reel.timer = 45;
            const S = stage(), self = this.character(player);
            if (S && S.flash && self) S.flash(self, [140, 200, 255, 200], 12);
            if (S && S.beat && from) S.beat(from, "hurt", self);
            if (feed()) ReactorEvents.emit("fightGuard", { unitId: player.id, attackerId: subject.id, perfect: true });
        }
        A._perfect = false;
        // What the player sees of it: the marker on the crosshair, the pulse of a hit taken.
        const p = st.player;
        for (const target of kept) {
            const battler = this.battler(target);
            const result = battler && battler.result();
            if (!result || !result.isHit() || !(result.hpDamage > 0)) continue;
            if (subject === player && target.team !== subject.team) {
                p.hitMark = 14;
                if (st.defeats > before || battler.isDead()) p.killMark = 30;
            }
            if (target === player) {
                p.pulse = 1;
                const self = this.character(target);
                p.pulseAngle = from && self ? Math.atan2(from._realX - self._realX, -(from._realY - self._realY)) / DEG : null;
                // A heavy blow shakes the view.
                p.shake = Math.max(p.shake, Math.min(1, result.hpDamage / Math.max(1, battler.mhp) * 5));
            }
            const ai = st.ai[target.id];
            if (ai) A.struck(this, target, ai, subject);
        }
    };

    const defeatUnit = Game_Fight.prototype.defeat;
    Game_Fight.prototype.defeat = function(unit) {
        const was = unit && unit.defeated;
        defeatUnit.call(this, unit);
        // (It falls and lies before it fades, or until it is brought back: the battle's own rule, reactor_fight.js.)
        if (this._action && unit && !was && unit.defeated) { this._action.defeats++; this._action.rev++; }
    };

    // The result names the party by who led it into the battle, not by who took the lead when that one fell.
    const updateEnding = Game_Fight.prototype.updateEnding;
    if (updateEnding) Game_Fight.prototype.updateEnding = function() {
        const st = this._action, order = st && st.order, ending = this._ending;
        if (!order || !ending || ending.shown || typeof $gameParty === "undefined") return updateEnding.call(this);
        const now = $gameParty._actors;
        // Worked out once for the ending, not on each frame it waits.
        let kept = A._endOrder;
        if (!kept || kept.serial !== this._serial || kept.now !== now) {
            const was = order.filter(id => now.includes(id));
            for (const id of now) if (!was.includes(id)) was.push(id);
            kept = A._endOrder = { serial: this._serial, now, was };
        }
        $gameParty._actors = kept.was;
        try { return updateEnding.call(this); } finally {
            // Put back while the battle goes on; an ending that finished it there and then keeps the party's own order.
            if ($gameParty._actors === kept.was) {
                if (this._active) $gameParty._actors = now;
                else if ($gamePlayer.refresh) $gamePlayer.refresh();
            }
        }
    };
    /** How far over a falling body is (0 upright, 1 flat), `t` 0-1 through the fall: slow to tip, quick to land. */
    A.fallPitch = F.fallPitch;

    for (const name of ["removeUnit", "setEventSide", "setObjective", "spawn"]) {
        const original = Game_Fight.prototype[name];
        Game_Fight.prototype[name] = function() {
            const result = original.apply(this, arguments);
            if (this._action) this._action.rev++;
            return result;
        };
    }

    //-------------------------------------------------------------------------
    // Where things are. A character's middle is (realX + 0.5, ground .. ground + height, realY + 0.5).

    A.is3D = function() {
        const R = world3();
        return !!(R && R.isMap3D && R.groundHeightAt && typeof $dataMap !== "undefined" && $dataMap && R.isMap3D($dataMap));
    };

    A.groundOf = function(character) {
        if (!A.is3D()) return 0;
        const R = world3(), P = root.ReactorPhysics, lift = character._reactorLift || 0;
        if (!(P && P.groundUnder && Number.isFinite(character._realX))) {
            if (R.characterGround) return R.characterGround($dataMap, character) + lift;
            return R.groundHeightAt($dataMap, character._realX + 0.5, character._realY + 0.5) || 0;
        }
        // The ground under a moving body on the floor it is on (never the corner cell a diagonal step passes over).
        let ground = P.groundUnder(character);
        // A body drawn off its cell (a sequence's lunge or flinch, a knock) can have its middle over the next cell,
        // and that may be a wall, whose only surface is its top. A surface out of a step's reach of the level the
        // body stands on is not under it: its own cell's ground is.
        const near = character._reactorGround;
        if (Number.isFinite(near) && Number.isFinite(character.x) && Math.abs(ground - near) > 1 + (R.TERRAIN_SLOPE_LIMIT || 0.75)) {
            ground = R.groundHeightAt($dataMap, character.x + 0.5, character.y + 0.5, near) || 0;
        }
        return ground + lift;
    };

    // A body's height and outline are its model's: measured once and again every few seconds, not on every test.
    // A standing figure (taller than it is long or wide) is a round post; anything else is its footprint, which
    // turns with it.
    const sizes = new WeakMap();
    function sizeOf(fight, character) {
        const now = typeof Graphics !== "undefined" && Graphics.frameCount || 0;
        let size = sizes.get(character);
        if (!size) sizes.set(character, size = { at: -1e9, tall: 1.6, wide: A.SLIM, round: true, halfX: A.SLIM, halfZ: A.SLIM, pad: 0, mask: null, hull: null, spec: null, dir: 0, cos: 1, sin: 0 });
        if (now - size.at >= 180 || now < size.at) {
            size.at = now;
            const R = world3(), deep = !!R && A.is3D();
            size.tall = deep && R.characterHeightTiles ? R.characterHeightTiles(character) || 1.6 : 1.6;
            size.round = true; size.mask = null; size.hull = null; size.spec = null; size.dir = 0; size.pad = 0;
            size.wide = size.halfX = size.halfZ = clamp(size.tall * A.FIGURE_WIDTH, A.SLIM, 1.2);
            if (deep) measure(R, character, size, false);
        }
        if (!size.round) {
            const dir = character._reactorDir8 || (character.direction ? character.direction() : 2);
            if (dir !== size.dir) {
                size.dir = dir;
                let yaw = 0;
                try { yaw = world3().eventModelWorldYaw(character, size.spec) || 0; } catch (error) { yaw = 0; }
                size.cos = Math.cos(yaw); size.sin = Math.sin(yaw);
            }
        }
        return size;
    }

    /**
     * A model's own footprint into `size`, when it has one that is known and (unless `always`) is no standing
     * figure. False for a sprite, a figure, and a model still loading (whose only measure is the size it was given).
     */
    function measure(R, character, size, always) {
        if (!R.characterModelSpec || !R.eventModelFootprint) return false;
        try {
            const spec = R.characterModelSpec(character);
            if (!spec) return false;
            const keys = R.collisionKeysFor ? R.collisionKeysFor(spec) : null, entry = keys && R._glbCache ? R._glbCache[keys.model] : null;
            // Asked again soon: the model arrives within moments.
            if (keys && !(entry && entry.template)) { size.at -= 150; return false; }
            const foot = R.eventModelFootprint(character, spec);
            if (!foot || foot.rawX == null) return false;
            if (!always && size.tall > 1.6 * Math.max(foot.rawX, foot.rawZ)) return false;
            size.round = false; size.spec = spec; size.mask = foot.mask || null; size.dir = 0;
            // A mask's bounds reach a walker's half width past the model itself.
            size.pad = foot.mask ? R.COLLISION_BODY_RADIUS || 0 : 0;
            size.halfX = foot.rawX; size.halfZ = foot.rawZ; size.wide = Math.max(foot.rawX, foot.rawZ);
            // A unit is struck where its mesh is, at the heights it is. Scenery in the way stays what stands in a
            // walker's way (a tree its trunk, not its crown), as tall as the mesh is over each of those cells; one
            // that blocks as a box (a model that reads badly as a floor plan) stays its box.
            size.hull = !always || foot.mask ? A.hullOf(R, spec) : null;
            return true;
        } catch (error) {
            return false;
        }
    }

    // A model's own heights: over each quarter-tile cell of its footprint's frame (the cells its collision mask
    // counts in) the lowest and the highest its mesh stands there, from all of its triangles. So what overhangs
    // (a gun's barrel) is part of the body, and the open air over a low hull beside a tall turret is not. Worked
    // out once for a model and pose and kept; null for a model whose mesh cannot be read.
    const hulls = new Map();
    A.hullOf = function(R, spec) {
        if (!spec || typeof THREE === "undefined" || !R.collisionKeysFor) return null;
        const keys = R.collisionKeysFor(spec), entry = R._glbCache ? R._glbCache[keys.model] : null, template = entry && entry.template;
        if (!template) return null;
        let kept = hulls.get(keys.pose);
        if (!kept || kept.template !== template) {
            let hull = null;
            try { hull = A.buildHull(R, template, R._sidecarJson ? R._sidecarJson[spec.name] : null, spec); } catch (error) { hull = null; }
            hulls.set(keys.pose, kept = { template, hull });
        }
        return kept.hull;
    };

    /**
     * The heights themselves, from a loaded model: its triangles at the instance's size, base transform, pitch and
     * roll (its facing turns the question, as for its mask), each laid over the cells it covers with the heights it
     * has there. A mesh too dense to walk triangle by triangle is read from its vertices, as its mask is.
     */
    A.buildHull = function(R, template, json, spec) {
        const T = THREE;
        if (!template || typeof template.traverse !== "function" || !T.Matrix4 || !T.Box3) return null;
        const extent = (template.userData && template.userData.glbSize) || { x: 1, y: 1, z: 1 };
        const fit = (spec.size > 0 ? spec.size : 2) / Math.max(extent.x, extent.y, extent.z, 0.0001) * (spec.scale > 0 ? spec.scale : 1);
        const stretch = spec.stretch || [1, 1, 1], kx = fit * stretch[0], ky = fit * stretch[1], kz = fit * stretch[2];
        const base = R.readModelTransform(json), axes = R.scaleAxes(base.scale);
        const total = new T.Matrix4().makeRotationFromEuler(new T.Euler(spec.pitch || 0, 0, spec.roll || 0, "YXZ")).multiply(new T.Matrix4().compose(
            new T.Vector3(base.offset[0], base.offset[1], base.offset[2]),
            new T.Quaternion().setFromEuler(new T.Euler(base.rotate[0] * DEG, base.rotate[1] * DEG, base.rotate[2] * DEG, "YXZ")),
            new T.Vector3(axes[0], axes[1], axes[2])));
        template.updateMatrixWorld(true);
        // The grid: over the model's box as it is posed, and never further than a mask reaches.
        const sub = R.COLLISION_SUBDIV || 4, limit = (R.COLLISION_MASK_LIMIT || 64) * sub;
        const box = new T.Box3().setFromObject(template);
        if (box.isEmpty()) return null;
        const point = new T.Vector3();
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let corner = 0; corner < 8; corner++) {
            point.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z).applyMatrix4(total);
            x0 = Math.min(x0, point.x * kx); x1 = Math.max(x1, point.x * kx); z0 = Math.min(z0, point.z * kz); z1 = Math.max(z1, point.z * kz);
        }
        const i0 = clamp(Math.floor(x0 * sub) - 1, -limit, limit), i1 = clamp(Math.floor(x1 * sub) + 1, -limit, limit);
        const j0 = clamp(Math.floor(z0 * sub) - 1, -limit, limit), j1 = clamp(Math.floor(z1 * sub) + 1, -limit, limit);
        const cols = i1 - i0 + 1, rows = j1 - j0 + 1;
        const low = new Float32Array(cols * rows).fill(Infinity), high = new Float32Array(cols * rows).fill(-Infinity);
        const put = (i, j, a, b) => {
            if (i < i0 || i > i1 || j < j0 || j > j1) return;
            const at = (i - i0) * rows + (j - j0);
            if (a < low[at]) low[at] = a;
            if (b > high[at]) high[at] = b;
        };
        // A triangle cut to a cell: what is left of a polygon on one side of a line across x or z.
        const side = () => [new Float64Array(12), new Float64Array(12), new Float64Array(12)];
        const tri = side(), cutA = side(), strip = side(), cutB = side(), cell = side();
        const cut = (from, n, to, axis, bound, above) => {
            const at = from[axis];
            let m = 0;
            for (let k = 0; k < n; k++) {
                const next = (k + 1) % n, a = at[k], b = at[next];
                const inA = above ? a >= bound : a <= bound, inB = above ? b >= bound : b <= bound;
                if (inA) { to[0][m] = from[0][k]; to[1][m] = from[1][k]; to[2][m] = from[2][k]; m++; }
                if (inA !== inB) {
                    const t = (bound - a) / (b - a);
                    for (let c = 0; c < 3; c++) to[c][m] = from[c][k] + (from[c][next] - from[c][k]) * t;
                    m++;
                }
            }
            return m;
        };
        const face = () => {
            const X = tri[0], Y = tri[1], Z = tri[2];
            // A hair inside itself, so a face along a cell line belongs to the cell on its own side of the line (an
            // upright face, a line from above, to the cell on the model's side).
            const flat = Math.abs((X[1] - X[0]) * (Z[2] - Z[0]) - (X[2] - X[0]) * (Z[1] - Z[0])) < 1e-9;
            const gx = flat ? 0 : (X[0] + X[1] + X[2]) / 3, gz = flat ? 0 : (Z[0] + Z[1] + Z[2]) / 3;
            for (let k = 0; k < 3; k++) { X[k] += (gx - X[k]) * 1e-3; Z[k] += (gz - Z[k]) * 1e-3; }
            const ia = Math.floor(Math.min(X[0], X[1], X[2]) * sub), ib = Math.floor(Math.max(X[0], X[1], X[2]) * sub);
            const ja = Math.floor(Math.min(Z[0], Z[1], Z[2]) * sub), jb = Math.floor(Math.max(Z[0], Z[1], Z[2]) * sub);
            if (ia === ib && ja === jb) { put(ia, ja, Math.min(Y[0], Y[1], Y[2]), Math.max(Y[0], Y[1], Y[2])); return; }
            for (let i = Math.max(ia, i0); i <= Math.min(ib, i1); i++) {
                const n = cut(cutA, cut(tri, 3, cutA, 0, i / sub, true), strip, 0, (i + 1) / sub, false);
                if (!n) continue;
                for (let j = Math.max(ja, j0); j <= Math.min(jb, j1); j++) {
                    const m = cut(cutB, cut(strip, n, cutB, 2, j / sub, true), cell, 2, (j + 1) / sub, false);
                    if (!m) continue;
                    let a = Infinity, b = -Infinity;
                    for (let k = 0; k < m; k++) { if (cell[1][k] < a) a = cell[1][k]; if (cell[1][k] > b) b = cell[1][k]; }
                    put(i, j, a, b);
                }
            }
        };
        const matrix = new T.Matrix4();
        let dense = false;
        template.traverse(node => {
            if (!node.isMesh && !node.isSkinnedMesh) return;
            const geometry = node.geometry, position = geometry && geometry.getAttribute("position");
            if (!position) return;
            matrix.multiplyMatrices(total, node.matrixWorld);
            const index = geometry.getIndex(), count = index ? index.count : position.count;
            if (count / 3 > (R.DENSE_TRIANGLES || 50000)) {
                const stride = Math.max(1, Math.floor(position.count / (R.DENSE_SAMPLES || 250000)));
                for (let v = 0; v < position.count; v += stride) {
                    point.fromBufferAttribute(position, v).applyMatrix4(matrix);
                    put(Math.floor(point.x * kx * sub), Math.floor(point.z * kz * sub), point.y * ky, point.y * ky);
                }
                dense = true;
                return;
            }
            for (let t = 0; t + 2 < count; t += 3) {
                for (let k = 0; k < 3; k++) {
                    point.fromBufferAttribute(position, index ? index.getX(t + k) : t + k).applyMatrix4(matrix);
                    tri[0][k] = point.x * kx; tri[1][k] = point.y * ky; tri[2][k] = point.z * kz;
                }
                face();
            }
        });
        // What the vertices of a dense mesh left out between its marks (the middle of a wide flat face): a cell
        // with marks on both sides of it along its row and along its column stands as its neighbors do.
        if (dense) {
            const filled = [];
            for (let c = 1; c < cols - 1; c++) for (let r = 1; r < rows - 1; r++) {
                const at = c * rows + r;
                if (high[at] >= low[at]) continue;
                let a = Infinity, b = -Infinity, sides = 0;
                for (const step of [-rows, rows, -1, 1]) {
                    const bound = step === -1 ? c * rows : step === 1 ? c * rows + rows - 1 : step < 0 ? r : (cols - 1) * rows + r;
                    for (let k = at + step; step < 0 ? k >= bound : k <= bound; k += step) {
                        if (high[k] < low[k]) continue;
                        a = Math.min(a, low[k]); b = Math.max(b, high[k]); sides++;
                        break;
                    }
                }
                if (sides === 4) filled.push(at, a, b);
            }
            for (let k = 0; k < filled.length; k += 3) { low[filled[k]] = filled[k + 1]; high[filled[k]] = filled[k + 2]; }
        }
        // Kept as tight as what was marked.
        let c0 = cols, c1 = -1, r0 = rows, r1 = -1, bottom = Infinity, top = -Infinity;
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
            const at = c * rows + r;
            if (high[at] < low[at]) continue;
            if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
            if (low[at] < bottom) bottom = low[at]; if (high[at] > top) top = high[at];
        }
        if (c1 < c0) return null;
        const hull = { sub, i0: i0 + c0, j0: j0 + r0, cols: c1 - c0 + 1, rows: r1 - r0 + 1, low: null, high: null, bottom, top,
            minX: (i0 + c0) / sub, maxX: (i0 + c1 + 1) / sub, minZ: (j0 + r0) / sub, maxZ: (j0 + r1 + 1) / sub, reach: 0 };
        hull.low = new Float32Array(hull.cols * hull.rows); hull.high = new Float32Array(hull.cols * hull.rows);
        for (let c = 0; c < hull.cols; c++) for (let r = 0; r < hull.rows; r++) {
            hull.low[c * hull.rows + r] = low[(c + c0) * rows + r + r0]; hull.high[c * hull.rows + r] = high[(c + c0) * rows + r + r0];
        }
        hull.reach = Math.hypot(Math.max(Math.abs(hull.minX), Math.abs(hull.maxX)), Math.max(Math.abs(hull.minZ), Math.abs(hull.maxZ)));
        return hull;
    };

    A.heightOf = function(character) {
        return sizeOf(typeof $gameFight !== "undefined" ? $gameFight : null, character).tall;
    };

    /** A body's measure: `tall`, and either `round` with `wide` (a figure) or its footprint's halves, turn and mask. Shared: do not change it. */
    A.bodyOf = function(fight, character) {
        return sizeOf(fight, character);
    };

    /** Whether a body's footprint covers a ground point (a figure's: its post). */
    function covers(size, character, x, z) {
        const px = x - character._realX - 0.5, pz = z - character._realY - 0.5;
        if (size.round) return px * px + pz * pz <= size.wide * size.wide;
        const lx = px * size.cos - pz * size.sin, lz = px * size.sin + pz * size.cos;
        // As a walker is stopped by it: the cells the model's mask blocks, else its box.
        if (size.mask && size.mask.blocksTile) return size.mask.blocksTile(lx, lz);
        return Math.abs(lx) <= size.halfX + 1e-6 && Math.abs(lz) <= size.halfZ + 1e-6;
    }

    /** How far a ground point is from a body's outline, in tiles: a footprint's is nothing inside it. */
    A.reachTo = function(fight, x, z, character) {
        const size = sizeOf(fight, character), px = x - character._realX - 0.5, pz = z - character._realY - 0.5;
        if (size.round) return Math.hypot(px, pz) - size.wide;
        const lx = Math.abs(px * size.cos - pz * size.sin) - Math.max(0.2, size.halfX - size.pad);
        const lz = Math.abs(px * size.sin + pz * size.cos) - Math.max(0.2, size.halfZ - size.pad);
        return Math.hypot(Math.max(0, lx), Math.max(0, lz));
    };

    /** The part of a body nearest a ground point, into `out` as x and z: a footprint's nearest point, a figure's middle. */
    A.nearPoint = function(fight, x, z, character, out) {
        const size = sizeOf(fight, character), cx = character._realX + 0.5, cz = character._realY + 0.5;
        out.x = cx; out.z = cz;
        if (size.round) return out;
        const px = x - cx, pz = z - cz, hx = Math.max(0.2, size.halfX - size.pad), hz = Math.max(0.2, size.halfZ - size.pad);
        const lx = clamp(px * size.cos - pz * size.sin, -hx, hx), lz = clamp(px * size.sin + pz * size.cos, -hz, hz);
        out.x = cx + lx * size.cos + lz * size.sin; out.z = cz - lx * size.sin + lz * size.cos;
        return out;
    };

    /** The room between one body's middle and another's outline, in tiles. */
    A.gap = function(fight, a, b) {
        return A.reachTo(fight, a._realX + 0.5, a._realY + 0.5, b);
    };

    /** How far apart two bodies stand in height, in tiles. */
    A.levelGap = function(a, b) {
        return Math.abs(A.groundOf(a) - A.groundOf(b));
    };

    /** Whether lines are tested against the world as it is drawn: a 3D map, in a runtime that has the query. */
    A.deep = function() {
        const R = world3();
        return !!R && !!R.worldRay && A.is3D();
    };

    /**
     * Whether one unit's eyes reach another's chest: tiles that hide, and on a 3D map the ground, what is built
     * (where it is solid: open air under a roof and beside a post stays open), a shut door and a model in the way.
     */
    A.sees = function(fight, a, b) {
        if (A.deep()) return A.lineOpen(fight, a, A.EYE, b, A.CHEST, true);
        const G = F.Grid;
        if (!G || !G.sight) return true;
        return G.sight(Math.round(a._realX), Math.round(a._realY), A.groundOf(a), Math.round(b._realX), Math.round(b._realY), A.groundOf(b));
    };

    /**
     * Whether the line from one body (a share of its height up) to another's reaches it with nothing of the
     * world between. The line ends at the other's outline: nothing stands inside a body. `sight`: glass does not stop it.
     */
    A.lineOpen = function(fight, a, fromShare, b, toShare, sight) {
        const oy = A.groundOf(a) + A.heightOf(a) * fromShare;
        let ox = a._realX + 0.5, oz = a._realY + 0.5;
        // A body drawn off its cell (a sequence's lunge or flinch) can have its middle in the wall its cell stands
        // against: its line starts in its own cell, not inside the wall.
        if (A.deep() && Number.isFinite(a.x) && world3().worldSolidAt($dataMap, ox, oy, oz, !!sight)) { ox = clamp(ox, a.x + 0.02, a.x + 0.98); oz = clamp(oz, a.y + 0.02, a.y + 0.98); }
        const dx = b._realX + 0.5 - ox, dz = b._realY + 0.5 - oz, dy = A.groundOf(b) + A.heightOf(b) * toShare - oy;
        const flat = Math.hypot(dx, dz), far = Math.hypot(flat, dy);
        // Side by side on one level: nothing built is thinner than a cell.
        if (far < 1.05) return true;
        const slack = Math.max(A.LINE_SLACK, flat - A.reachTo(fight, ox, oz, b));
        if (far <= slack) return true;
        return A.rayWorld(ox, oy, oz, dx / far, dy / far, dz / far, far, !A.is3D(), sight) >= far - slack;
    };

    /** Whether a blow struck from one body's chest reaches another's: nothing of the world between them. */
    A.blowClear = function(fight, a, b) {
        return A.lineOpen(fight, a, A.CHEST, b, A.CHEST, false);
    };

    /** How far along a line the map's tiles let it go, at most `far`: a cell that hides stops it, and the map's edge. */
    function rayTiles(ox, oz, dx, dz, far) {
        const G = F.Grid, map = typeof $gameMap !== "undefined" ? $gameMap : null;
        let lastX = Math.floor(ox), lastY = Math.floor(oz);
        // Every half tile, and the far end itself.
        const steps = Math.max(1, Math.ceil(far / 0.5));
        for (let i = 1; i <= steps; i++) {
            const t = far * i / steps, cx = Math.floor(ox + dx * t), cy = Math.floor(oz + dz * t);
            if (cx === lastX && cy === lastY) continue;
            lastX = cx; lastY = cy;
            if (map && !map.isValid(cx, cy)) { A.rayMet = "edge"; return t; }
            if (G && G.blocksSight && G.blocksSight(cx, cy)) { A.rayMet = "tile"; return t; }
        }
        return far;
    }

    /** What the last rayWorld was stopped by: "" (nothing), "tile", "ground", "piece" (something built), "prop" (a model) or "edge" (the map's border). */
    A.rayMet = "";

    /**
     * How far along a line the world lets it go, at most `far`: stopped by a tile that hides and, on a 3D map, by
     * the ground, by what is built where it is solid (Reactor3D.worldRay), by a shut door and by a model that stands
     * in the way (a prop, a vehicle: never a unit of the battle, see rayUnits). `sight`: what is seen through
     * (glass) does not stop it. `flat`: an aim with no height of its own (a 2D map: tiles only; on a 3D map seen
     * from above, a line that keeps its height over the ground it passes, so walls and models stop it and the
     * ground does not).
     */
    A.rayWorld = function(ox, oy, oz, dx, dy, dz, far, flat, sight) {
        const R = world3(), deep = A.is3D() && (!flat || !!R.worldRay);
        A.rayMet = "";
        let reach = rayTiles(ox, oz, dx, dz, far);
        if (!deep || !(reach > 0)) return reach;
        if (R.worldRay) {
            const open = R.worldRay($dataMap, ox, oy, oz, dx, dy, dz, reach, sight, !!flat);
            if (open < reach) { reach = open; A.rayMet = R.lineMet || "piece"; }
            if (!(reach > 0)) return reach;
            const clear = A.rayProps(ox, oy, oz, dx, dy, dz, reach, !!flat);
            if (clear < reach) { reach = clear; A.rayMet = "prop"; }
            return reach;
        }
        // A runtime without that query: the ground's height where the line passes, every half tile.
        const steps = Math.max(1, Math.ceil(far / 0.5));
        for (let i = 1; i <= steps; i++) {
            const t = far * i / steps;
            if (t > reach) break;
            const py = oy + dy * t;
            if ((R.groundHeightAt($dataMap, ox + dx * t, oz + dz * t, py) || 0) > py + 0.05) { A.rayMet = "ground"; return t; }
        }
        return reach;
    };

    /**
     * The map's models that are no unit of the battle and stand in a line's way (a prop, a parked vehicle, a
     * bystander's model): each its footprint as tall as the model, measured every half second, not on every line.
     */
    A.props = function(fight) {
        const kept = A._props || (A._props = { stamp: -1e9, map: null, list: [], count: 0 });
        const now = typeof Graphics !== "undefined" && Graphics.frameCount || 0, map = typeof $dataMap !== "undefined" ? $dataMap : null;
        if (kept.map === map && now - kept.stamp < A.PROP_FRAMES && now >= kept.stamp) return kept;
        kept.stamp = now; kept.map = map; kept.count = 0;
        const R = world3();
        if (!R || typeof $gameMap === "undefined" || !$gameMap || !A.is3D()) return kept;
        const events = $gameMap.events();
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event || event._erased || (event.isThrough && event.isThrough()) || (event.isNormalPriority && !event.isNormalPriority())) continue;
            if (fight && fight._active && fight.unitOfEvent(event.eventId())) continue;
            const body = kept.list[kept.count] || (kept.list[kept.count] = { unit: null, character: null, at: 0, x: 0, z: 0, ground: 0, top: 0, tall: 0, wide: 0, round: false, r: 0,
                halfX: 0, halfZ: 0, pad: 0, cos: 1, sin: 0, mask: null, hull: null, only: null, spec: null, dir: 0, reach: 0, base: 0 });
            body.tall = R.characterHeightTiles ? R.characterHeightTiles(event) || 1.6 : 1.6;
            body.hull = null;
            if (!measure(R, event, body, true)) continue;
            body.only = body.hull && body.mask && body.mask.has ? body.mask : null;
            if (body.hull && !body.only) body.hull = null;
            let yaw = 0;
            try { yaw = R.eventModelWorldYaw(event, body.spec) || 0; } catch (error) { yaw = 0; }
            body.cos = Math.cos(yaw); body.sin = Math.sin(yaw);
            body.character = event;
            body.ground = A.groundOf(event); body.top = body.ground + body.tall;
            body.reach = Math.max(Math.hypot(body.halfX, body.halfZ), body.hull ? body.hull.reach : 0);
            // The ground its own cell stands on, for a line that keeps its height over the ground it passes.
            body.base = R.pieceBaseAt ? R.pieceBaseAt($dataMap, Math.floor(event._realX + 0.5), Math.floor(event._realY + 0.5)) : 0;
            kept.count++;
        }
        for (let i = kept.count; i < kept.list.length; i++) kept.list[i].character = null;
        return kept;
    };

    /**
     * How far along a line those models let it go, at most `far`. `flat` (an aim with no height of its own): the
     * line keeps its height over the ground it passes, so it meets a model at that height over the model's own
     * cell: one that stands in the way stops it, one that hangs overhead does not.
     */
    A.rayProps = function(ox, oy, oz, dx, dy, dz, far, flat) {
        const props = A.props(typeof $gameFight !== "undefined" ? $gameFight : null), across = dx * dx + dz * dz;
        const R = world3(), level = !!flat && !!R && !!R.pieceBaseAt && A.is3D();
        const from = level ? R.pieceBaseAt($dataMap, Math.floor(ox), Math.floor(oz)) : 0;
        let best = far;
        for (let i = 0; i < props.count; i++) {
            const body = props.list[i], c = body.character;
            body.x = c._realX + 0.5; body.z = c._realY + 0.5;
            // Nowhere near the line: further from it than the body reaches.
            const s = across > 1e-9 ? clamp(((body.x - ox) * dx + (body.z - oz) * dz) / across, 0, best) : 0;
            const px = ox + dx * s - body.x, pz = oz + dz * s - body.z;
            if (px * px + pz * pz > body.reach * body.reach) continue;
            const t = level ? A.rayBody(body, ox, oy + body.base - from, oz, dx, 0, dz, best, false) : A.rayBody(body, ox, oy, oz, dx, dy, dz, best, !!flat);
            if (t >= 0 && t < best) best = t;
        }
        return best;
    };

    /**
     * Where a line enters a body, at most `far` along it; -1 when it misses. A figure is a round post from its feet
     * to its head. Anything else is its footprint as it stands, as tall as its model: the cells the model covers
     * when it says which, else its box. On a flat aim (a 2D map, a pointer on the ground) height does not count.
     */
    A.rayBody = function(body, ox, oy, oz, dx, dy, dz, far, flat) {
        let lo = 0, hi = far;
        const hull = body.round ? null : body.hull || null;
        if (!flat) {
            const low = body.ground + (hull ? hull.bottom : 0) - 0.15, high = (hull ? body.ground + hull.top : body.top) + 0.15;
            if (dy > 1e-9 || dy < -1e-9) {
                const a = (low - oy) / dy, b = (high - oy) / dy;
                if (a < b) { if (a > lo) lo = a; if (b < hi) hi = b; } else { if (b > lo) lo = b; if (a < hi) hi = a; }
                if (lo > hi) return -1;
            } else if (oy < low || oy > high) return -1;
        }
        const px = ox - body.x, pz = oz - body.z;
        if (body.round) {
            const a = dx * dx + dz * dz, r = body.r;
            if (a < 1e-9) return px * px + pz * pz <= r * r ? lo : -1;
            const b = px * dx + pz * dz, disc = b * b - a * (px * px + pz * pz - r * r);
            if (disc < 0) return -1;
            const root = Math.sqrt(disc), enter = (-b - root) / a, leave = (-b + root) / a;
            if (enter > lo) lo = enter;
            if (leave < hi) hi = leave;
            return lo <= hi ? lo : -1;
        }
        // In the footprint's own frame: its box, or the box of its mesh's own heights where they are known (what
        // overhangs reaches past the footprint a walker is stopped by).
        const lx = px * body.cos - pz * body.sin, lz = px * body.sin + pz * body.cos;
        const ldx = dx * body.cos - dz * body.sin, ldz = dx * body.sin + dz * body.cos;
        const x0 = hull ? hull.minX : -body.halfX, x1 = hull ? hull.maxX : body.halfX, z0 = hull ? hull.minZ : -body.halfZ, z1 = hull ? hull.maxZ : body.halfZ;
        if (ldx > 1e-9 || ldx < -1e-9) {
            const a = (x0 - lx) / ldx, b = (x1 - lx) / ldx;
            if (a < b) { if (a > lo) lo = a; if (b < hi) hi = b; } else { if (b > lo) lo = b; if (a < hi) hi = a; }
            if (lo > hi) return -1;
        } else if (lx < x0 || lx > x1) return -1;
        if (ldz > 1e-9 || ldz < -1e-9) {
            const a = (z0 - lz) / ldz, b = (z1 - lz) / ldz;
            if (a < b) { if (a > lo) lo = a; if (b < hi) hi = b; } else { if (b > lo) lo = b; if (a < hi) hi = a; }
            if (lo > hi) return -1;
        } else if (lz < z0 || lz > z1) return -1;
        if (hull) return rayHull(body, hull, lx, lz, ldx, ldz, oy, dy, lo, hi, flat);
        const mask = body.mask;
        if (!mask || !mask.touches) return lo;
        // The cells the model covers, along the line inside its box: a step under half a cell of them.
        const n = Math.max(1, Math.ceil((hi - lo) / 0.12));
        for (let i = 0; i <= n; i++) {
            const t = lo + (hi - lo) * i / n;
            if (mask.touches(lx + ldx * t, lz + ldz * t, 0.18)) return t;
        }
        return -1;
    };

    /**
     * Where a line, between `lo` and `hi` along it and already in a body's frame, comes into the body's mesh: the
     * cells it crosses are walked one by one, and a cell stops it where the line is between the lowest and the
     * highest the mesh stands there (`flat`: at any height). `body.only`: of those cells, the ones that mask has.
     */
    function rayHull(body, hull, lx, lz, ldx, ldz, oy, dy, lo, hi, flat) {
        const sub = hull.sub, only = body.only || null, pad = A.HULL_PAD;
        let t = lo, i = Math.floor((lx + ldx * lo) * sub), j = Math.floor((lz + ldz * lo) * sub);
        const stepI = ldx > 0 ? 1 : -1, stepJ = ldz > 0 ? 1 : -1;
        const gapI = ldx !== 0 ? Math.abs(1 / (ldx * sub)) : Infinity, gapJ = ldz !== 0 ? Math.abs(1 / (ldz * sub)) : Infinity;
        let nextI = ldx > 0 ? ((i + 1) / sub - lx) / ldx : ldx < 0 ? (i / sub - lx) / ldx : Infinity;
        let nextJ = ldz > 0 ? ((j + 1) / sub - lz) / ldz : ldz < 0 ? (j / sub - lz) / ldz : Infinity;
        for (let guard = hull.cols + hull.rows + 4; guard > 0; guard--) {
            const end = Math.min(nextI, nextJ, hi), c = i - hull.i0, r = j - hull.j0;
            if (c >= 0 && r >= 0 && c < hull.cols && r < hull.rows && (!only || only.has(i, j))) {
                const at = c * hull.rows + r, low = hull.low[at] - pad, high = hull.high[at] + pad;
                if (high >= low) {
                    if (flat) return t;
                    const y0 = oy + dy * t - body.ground, y1 = oy + dy * end - body.ground;
                    if (y0 >= low && y0 <= high) return t;
                    if (y0 < low && y1 >= low) return t + (low - y0) / dy;
                    if (y0 > high && y1 <= high) return t + (high - y0) / dy;
                }
            }
            if (end >= hi) return -1;
            t = end;
            if (nextI < nextJ) { i += stepI; nextI += gapI; } else { j += stepJ; nextJ += gapJ; }
        }
        return -1;
    }

    /**
     * The nearest unit of `team` a line passes through, within `far` (see rayBody). Sets A.rayT to how far along
     * the line its body is entered.
     */
    A.rayUnits = function(fight, ox, oy, oz, dx, dy, dz, far, team, flat, except) {
        let best = null, bestT = far;
        const bodies = A.bodies(fight, team);
        for (let i = 0; i < bodies.count; i++) {
            const body = bodies.list[i];
            if (body.unit === except) continue;
            const t = A.rayBody(body, ox, oy, oz, dx, dy, dz, bestT, flat);
            if (t < 0) continue;
            best = body.unit; bestT = t;
        }
        A.rayT = bestT;
        return best;
    };

    /**
     * Who stands where, a side at a time, measured once a frame however many lines are tested against them
     * (every shot in the air, the crosshair, a blast): where each living unit's middle is, its outline and how tall.
     */
    A.bodies = function(fight, team) {
        const kept = A._bodies || (A._bodies = { stamp: -1, serial: -1, sides: {} });
        const st = fight._action, stamp = st ? st.clock * 4 + st.stop : -1;
        if (kept.stamp !== stamp || kept.serial !== fight._serial) {
            kept.stamp = stamp; kept.serial = fight._serial;
            for (const key of Object.keys(kept.sides)) kept.sides[key].count = 0;
            for (const unit of fight._units) {
                if (unit.gone || unit.team === "neutral" || !fight.isAlive(unit)) continue;
                const side = kept.sides[unit.team] || (kept.sides[unit.team] = { list: [], count: 0 });
                const body = side.list[side.count] || (side.list[side.count] = { unit: null, character: null, x: 0, z: 0, r: 0, ground: 0, top: 0,
                    round: true, halfX: 0, halfZ: 0, cos: 1, sin: 0, mask: null, hull: null, only: null });
                const character = fight.character(unit), size = sizeOf(fight, character);
                body.unit = unit; body.character = character; body.x = character._realX + 0.5; body.z = character._realY + 0.5;
                body.ground = A.groundOf(character); body.top = body.ground + size.tall;
                body.round = size.round; body.r = size.wide; body.halfX = size.halfX; body.halfZ = size.halfZ; body.cos = size.cos; body.sin = size.sin; body.mask = size.mask; body.hull = size.hull;
                side.count++;
            }
        }
        return kept.sides[team] || A._noBodies || (A._noBodies = { list: [], count: 0 });
    };

    /**
     * Whether a unit's body has room on a cell: nobody stands there, no big body covers it, and nothing built
     * stands where the body would (a pillar that reaches into the cell, a counter's end).
     */
    A.roomAt = function(fight, unit, character, x, y) {
        if (fight.unitAt(x, y, unit)) return false;
        const cx = x + 0.5, cz = y + 0.5;
        for (const other of fight._units) {
            if (other === unit || other.gone || !(other.team === "neutral" || fight.isAlive(other))) continue;
            const body = fight.character(other);
            if (!body || body === character) continue;
            const size = sizeOf(fight, body);
            if (!size.round && covers(size, body, cx, cz)) return false;
        }
        if (!A.deep()) return true;
        // Round the body, at the knee and at the chest. Whether a door lets a body by is the walking rule's to say.
        const R = world3(), map = $dataMap, ground = R.groundHeightAt(map, cx, cz, A.groundOf(character)) || 0, tall = A.heightOf(character);
        const knee = ground + Math.min(0.9, tall * 0.3), chest = ground + tall * A.CHEST, r = 0.3, d = r * 0.7071;
        if (R.worldSolidAt(map, cx, chest, cz, false, true)) return false;
        if (R.worldSolidAt(map, cx + r, chest, cz, false, true) || R.worldSolidAt(map, cx - r, chest, cz, false, true)) return false;
        if (R.worldSolidAt(map, cx, chest, cz + r, false, true) || R.worldSolidAt(map, cx, chest, cz - r, false, true)) return false;
        if (R.worldSolidAt(map, cx + d, knee, cz + d, false, true) || R.worldSolidAt(map, cx - d, knee, cz + d, false, true)) return false;
        if (R.worldSolidAt(map, cx + d, knee, cz - d, false, true) || R.worldSolidAt(map, cx - d, knee, cz - d, false, true)) return false;
        return true;
    };

    //-------------------------------------------------------------------------
    // Input: the mouse buttons and wheel beside the keys and buttons Input knows.

    const HOTBAR = ["", "hotbar1", "hotbar2", "hotbar3", "hotbar4", "hotbar5", "hotbar6", "hotbar7", "hotbar8"];
    const In = A.Input = {
        left: false, right: false, leftEdge: false, wheel: 0, moved: false, virtual: {}, edges: {}, held: [true, true, true, true, true, true, true, true, true],
        // A key held as the battle takes the keys does not count as pressed for it: it must come up first.
        reset() { this.left = this.right = this.leftEdge = false; this.wheel = 0; this.virtual = {}; this.edges = {}; this.held.fill(true); },
        key(name) { return typeof Input !== "undefined" && Input.isPressed ? Input.isPressed(name) : false; },
        hit(name) { return typeof Input !== "undefined" && Input.isTriggered ? Input.isTriggered(name) : false; },
        pressed(name) {
            if (name === "attack" && this.left) return true;
            if (name === "aim" && this.right) return true;
            return !!this.virtual[name] || this.key(name);
        },
        triggered(name) {
            if (name === "attack" && this.leftEdge) return true;
            return !!this.edges[name] || this.hit(name);
        },
        /**
         * Whether a hotbar slot's key went down since the last asking (asked once a battle frame). Read from the
         * key being held, not from Input's own "triggered": a number key carries a second name for the old
         * engines' key commands, and Input calls only the later name of a key triggered.
         */
        slot(slot) {
            const name = HOTBAR[slot], down = this.pressed(name), fresh = down && !this.held[slot];
            this.held[slot] = down;
            return fresh || this.triggered(name);
        },
        endFrame() { this.leftEdge = false; this.wheel = 0; this.edges = {}; }
    };

    /** Whether a click should take the mouse first: a look that turns by it, the mouse not yet held, and no refusal just now. */
    A.wantsCapture = function() {
        const R = world3(), look = R && R.Camera && R.Camera.look;
        const canvas = typeof Graphics !== "undefined" && Graphics._canvas;
        if (!look || !canvas || !canvas.requestPointerLock || !A.relative()) return false;
        if (typeof document === "undefined" || document.pointerLockElement === canvas) return false;
        return !(look.refused && Date.now() - look.refused < 5000);
    };

    /** A message or the battle's end gives the mouse back; the battle takes it again when the message has closed. */
    A.updateCapture = function(fight) {
        const R = world3(), C = R && R.Camera, look = C && C.look;
        if (!look || !C.releaseLook || !C.requestLook) return;
        const hold = !!fight._ending || (typeof $gameMessage !== "undefined" && $gameMessage.isBusy());
        // In a battle a mouse that got away is not the menu key: the map reads any lost capture as Escape, which would
        // put the menu over a fight for a capture the browser dropped. Here it opens nothing: a line says how to take
        // the mouse back (a click), and Escape opens the menu as the key itself (see the listeners below).
        if (A.relative()) look.suppressMenuUntil = Math.max(look.suppressMenuUntil || 0, Date.now() + 600);
        const canvas = typeof Graphics !== "undefined" && Graphics._canvas;
        A.mouseFree = A.relative() && !hold && !look.locked && !!(canvas && canvas.requestPointerLock) && !(look.refused && Date.now() - look.refused < 5000);
        if (look.locked) A._held = true;
        if (hold) { if (look.locked) { C.releaseLook(); A._retake = true; } }
        else if (A._retake && A.relative() && !(typeof SceneManager !== "undefined" && SceneManager.isSceneChanging && SceneManager.isSceneChanging())) { A._retake = false; C.requestLook(); }
    };

    /** Opens the map's menu as its key would, when the map allows it. */
    A.callMenu = function() {
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        if (!scene || (typeof scene.isMenuEnabled === "function" && !scene.isMenuEnabled())) return false;
        A._menuAsked = Date.now();
        scene.menuCalling = true;
        return true;
    };

    const live = () => typeof $gameFight !== "undefined" && $gameFight && $gameFight.isAction() && $gameFight.isHere()
        && typeof SceneManager !== "undefined" && typeof Scene_Map !== "undefined" && SceneManager._scene instanceof Scene_Map;

    if (typeof document !== "undefined" && typeof document.addEventListener === "function" && !A._bound) {
        A._bound = true;
        document.addEventListener("mousedown", event => {
            if (!live()) return;
            if (event.button === 0) {
                // Behind or inside the player the first click takes the mouse for the look; the next ones fire.
                if (A.wantsCapture() && !In.asked) { In.asked = true; return; }
                In.left = true; In.leftEdge = true;
            }
            else if (event.button === 2) In.right = true;
        });
        document.addEventListener("pointerlockchange", () => {
            const canvas = typeof Graphics !== "undefined" && Graphics._canvas;
            if (!canvas || document.pointerLockElement !== canvas) {
                In.asked = false; In.left = In.right = false;
                A._freedAt = Date.now();
                // Let go by the Escape key itself (where the browser hands the key on): the menu, as the key asks.
                if (live() && Date.now() - (A._escapeAt || 0) < 500) A.callMenu();
            }
        });
        const escape = event => {
            if (event.key !== "Escape" && event.keyCode !== 27) return;
            A._escapeAt = Date.now();
            // The key that let the mouse go, handed on a moment after the capture ended.
            if (live() && event.type === "keyup" && Date.now() - (A._freedAt || 0) < 500 && Date.now() - (A._menuAsked || 0) > 500) A.callMenu();
        };
        document.addEventListener("keydown", escape);
        document.addEventListener("keyup", escape);
        document.addEventListener("mouseup", event => {
            if (event.button === 0) In.left = false;
            else if (event.button === 2) In.right = false;
        });
        document.addEventListener("wheel", event => { if (live()) In.wheel += event.deltaY > 0 ? 1 : -1; }, { passive: true });
        document.addEventListener("mousemove", () => { In.moved = true; });
        document.addEventListener("contextmenu", event => { if (live()) event.preventDefault(); });
        if (typeof window !== "undefined") window.addEventListener("blur", () => { In.left = In.right = false; });
    }

    //-------------------------------------------------------------------------
    // Aiming: where the player's weapon points this frame.

    // `eye`: the aim was taken along the eye's own line (third and first person): where that line starts beside the
    // player (ex, ey, ez), its direction, how far the world lets it go (`reach`), and the opponent it meets (`under`, `underT` along it).
    const aim = A.aimNow = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1, px: 0, py: 0, pz: 0, yaw: 0, flat: true, sx: 0, sy: 0, target: null,
        eye: false, ex: 0, ey: 0, ez: 0, edx: 0, edy: 0, edz: 1, reach: 0, under: 0, underT: 0 };
    const YAW_OF_DIRECTION = { 8: 0, 6: 90, 2: 180, 4: 270, 9: 45, 3: 135, 1: 225, 7: 315 };

    function scratch() {
        if (!A._v && typeof THREE !== "undefined" && THREE.Vector3) A._v = { a: new THREE.Vector3(), b: new THREE.Vector3() };
        return A._v || null;
    }

    /** The map's 3D camera, when the map is drawn through one. */
    A.camera = function() {
        const R = world3();
        if (!A.is3D() || !R.viewport) return null;
        try {
            const viewport = R.viewport();
            return viewport && viewport.camera ? viewport.camera() : null;
        } catch (error) {
            return null;
        }
    };

    A.cameraMode = function() {
        const R = world3();
        return A.is3D() && R.Camera && R.Camera.currentState ? R.Camera.currentState().mode : "";
    };

    A.relative = function() {
        const mode = A.cameraMode();
        return mode === "thirdPerson" || mode === "firstPerson";
    };

    /** Where a shot leaves the character: the tip of what it holds, else beside its chest. */
    A.muzzle = function(character, out) {
        const R = world3();
        let tip = null;
        if (typeof $gamePlayer !== "undefined" && character === $gamePlayer && A.View && A.View.muzzle(out)) return out;
        try { tip = A.is3D() && R.MapHeld && R.MapHeld.tipPoint ? R.MapHeld.tipPoint(character) : null; } catch (error) { tip = null; }
        if (tip) { out.ox = tip.x; out.oy = tip.y; out.oz = tip.z; return out; }
        out.ox = character._realX + 0.5; out.oy = A.groundOf(character) + A.heightOf(character) * 0.7; out.oz = character._realY + 0.5;
        return out;
    };

    /**
     * Where a shot starts: the muzzle, when the way to it from the body's own chest is open. A long weapon held
     * against a wall ends beyond the wall's near face; the shot then starts on the body's side of what stands
     * between (`out.walled`), so it meets the wall and nothing behind it. `flat`: an aim with no height of its own.
     */
    A.shotFrom = function(character, out, flat) {
        A.muzzle(character, out);
        out.walled = false;
        const cy = flat ? out.oy : A.groundOf(character) + A.heightOf(character) * A.CHEST;
        let cx = character._realX + 0.5, cz = character._realY + 0.5;
        // (A body drawn off its cell into the wall behind it: from its own cell, as in lineOpen.)
        if (A.deep() && Number.isFinite(character.x) && world3().worldSolidAt($dataMap, cx, cy, cz, false)) { cx = clamp(cx, character.x + 0.02, character.x + 0.98); cz = clamp(cz, character.y + 0.02, character.y + 0.98); }
        const dx = out.ox - cx, dy = out.oy - cy, dz = out.oz - cz, far = Math.hypot(dx, dy, dz);
        if (far < 0.05) return out;
        const reach = A.rayWorld(cx, cy, cz, dx / far, dy / far, dz / far, far, !!flat);
        if (reach >= far) return out;
        const t = Math.max(0, reach - 0.05) / far;
        out.ox = cx + dx * t; out.oy = cy + dy * t; out.oz = cz + dz * t;
        out.walled = true;
        return out;
    };

    /**
     * Fills A.aimNow for the player: the muzzle, the line the weapon shoots along, the point it aims at and where
     * the crosshair sits. Third and first person aim where the camera looks; the other views (and 2D maps) at the
     * pointer on the ground, or along the facing (or at the locked target) when there is no pointer.
     */
    A.takeAim = function(fight, unit, range) {
        const character = $gamePlayer, st = fight.act(), camera = A.camera(), v = scratch();
        const far = Math.max(6, range || 40);
        const eyes = !!camera && !!v && A.relative();
        A.shotFrom(character, aim, !eyes);
        aim.flat = true; aim.eye = false; aim.under = 0;
        aim.sx = Graphics.width / 2; aim.sy = Graphics.height / 2;
        let px = 0, py = aim.oy, pz = 0, found = false;
        const locked = st.player.lock ? fight.unit(st.player.lock) : null;
        const lockedCharacter = locked && fight.isAlive(locked) ? fight.character(locked) : null;
        if (eyes) {
            // Along the camera's own line. Through the eyes it starts at the eye itself (the weapon's tip may poke
            // through a wall or a door the eye stands against: nothing between the eye and the tip is skipped);
            // over the shoulder, from where the line passes the player's own body on.
            camera.getWorldDirection(v.a);
            const c = camera.position, dx = v.a.x, dy = v.a.y, dz = v.a.z;
            const start = A.cameraMode() === "firstPerson" ? 0
                : Math.max(0, (character._realX + 0.5 - c.x) * dx + (aim.oy - c.y) * dy + (character._realY + 0.5 - c.z) * dz);
            const sx = c.x + dx * start, sy = c.y + dy * start, sz = c.z + dz * start;
            const reach = A.rayWorld(sx, sy, sz, dx, dy, dz, far, false);
            const hit = A.rayUnits(fight, sx, sy, sz, dx, dy, dz, reach, F.oppose(unit.team), false, unit);
            const t = hit ? A.rayT : reach;
            px = sx + dx * t; py = sy + dy * t; pz = sz + dz * t;
            aim.flat = false; found = true;
            aim.eye = true; aim.ex = sx; aim.ey = sy; aim.ez = sz; aim.edx = dx; aim.edy = dy; aim.edz = dz;
            aim.reach = reach; aim.under = hit ? hit.id : 0; aim.underT = t;
        } else if (lockedCharacter) {
            px = lockedCharacter._realX + 0.5; pz = lockedCharacter._realY + 0.5;
            py = A.groundOf(lockedCharacter) + A.heightOf(lockedCharacter) * 0.6;
            found = true;
        } else if (In.moved && typeof TouchInput !== "undefined" && Number.isFinite(TouchInput.x)) {
            const tx = TouchInput.x, ty = TouchInput.y;
            if (camera && v) {
                // The pointer's line through the view: the opponent it passes through, else where it meets the ground the player stands on.
                v.a.set(tx / Graphics.width * 2 - 1, 1 - ty / Graphics.height * 2, 0.5).unproject(camera).sub(camera.position).normalize();
                const c = camera.position;
                const under = A.rayUnits(fight, c.x, c.y, c.z, v.a.x, v.a.y, v.a.z, 400, F.oppose(unit.team), false, unit);
                if (under) {
                    const at = fight.character(under);
                    px = at._realX + 0.5; pz = at._realY + 0.5; found = true;
                } else if (Math.abs(v.a.y) > 1e-5) {
                    const t = (A.groundOf(character) - c.y) / v.a.y;
                    if (t > 0) { px = c.x + v.a.x * t; pz = c.z + v.a.z * t; found = true; }
                }
            } else if (typeof $gameMap !== "undefined") {
                px = $gameMap.displayX() + tx / $gameMap.tileWidth();
                pz = $gameMap.displayY() + ty / $gameMap.tileHeight();
                found = true;
            }
            aim.sx = tx; aim.sy = ty;
        }
        if (!found || (!aim.eye && Math.hypot(px - aim.ox, pz - aim.oz) < 0.2)) {
            const yaw = (YAW_OF_DIRECTION[character._reactorDir8 || character.direction()] || 0) * DEG;
            px = aim.ox + Math.sin(yaw) * far; pz = aim.oz - Math.cos(yaw) * far; py = aim.oy;
            found = false;
        }
        let dx = px - aim.ox, dy = aim.flat ? 0 : py - aim.oy, dz = pz - aim.oz;
        let length = Math.hypot(dx, dy, dz) || 1;
        // The weapon points at what the eye's line met. At something within a tile of the muzzle, or behind it (the
        // eye against a wall, the weapon's end at it), it points as the eye looks: the way from the muzzle to a
        // point that near is no direction at all.
        if (aim.eye && (length < 1 || dx * aim.edx + dy * aim.edy + dz * aim.edz < length * 0.5)) { dx = aim.edx; dy = aim.edy; dz = aim.edz; length = 1; }
        aim.dx = dx / length; aim.dy = dy / length; aim.dz = dz / length;
        aim.px = px; aim.py = py; aim.pz = pz;
        aim.yaw = ((Math.atan2(aim.dx, -aim.dz) / DEG) % 360 + 360) % 360;
        if (!found && !A.relative()) {
            // No pointer: the crosshair rides a few tiles ahead of the weapon.
            const point = A.screenOf(aim.ox + aim.dx * 4, aim.oy, aim.oz + aim.dz * 4);
            if (point) { aim.sx = point.x; aim.sy = point.y; }
        }
        return aim;
    };

    A.screenOf = function(x, y, z) {
        const S = stage(), out = A._screen || (A._screen = {});
        if (S && S.screenOf) return S.screenOf(x - 0.5, z - 0.5, y, out);
        if (typeof $gameMap === "undefined") return null;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        out.x = Math.round($gameMap.adjustX(x - 0.5) * tw + tw / 2);
        out.y = Math.round($gameMap.adjustY(z - 0.5) * th + th / 2);
        out.visible = true; out.scale = 1;
        return out;
    };

    /** The nearest of the four ways a character can face to a yaw in degrees (0 north, 90 east). */
    A.facing = yaw => [8, 6, 2, 4][Math.round((((yaw % 360) + 360) % 360) / 90) % 4];

    //-------------------------------------------------------------------------
    // Blows: a shot, a swing, a skill.

    /**
     * One action's worth of a blow from `unit` on `targets`, landed now through the stock math. `traced`: the
     * way to each target was already found clear (a shot's line, a swing's, a blast's), so it is not asked again.
     */
    A.land = function(fight, unit, targets, kind, itemId, rate, reach, traced) {
        const run = { subjectId: unit.id, targetIds: targets.map(target => target.id), kind, itemId, attack: kind === "skill" && itemId === fight.battler(unit).attackSkillId(),
            frame: 0, applied: false, rate, reach: reach || 0, traced: !!traced };
        const action = fight.runAction(run);
        if (!action || !action.item()) return null;
        fight._progress = true;
        fight.applyRun(run, action, targets);
        return run;
    };

    /**
     * Fires the unit's weapon (or an enemy's bolt) along a line: at once for a bullet, as a thing that flies for the
     * rest. The line is traced from (ox, oy, oz). A bullet's streak is drawn from (mx, my, mz) when they are given
     * (the player's shot is traced along the eye's own line and drawn from the muzzle), else from where it is traced.
     */
    A.fire = function(fight, unit, profile, skillId, ox, oy, oz, dx, dy, dz, flat, spreadDegrees, mx, my, mz) {
        const st = fight.act(), team = F.oppose(unit.team), drawn = mx !== undefined;
        const fx = drawn ? mx : ox, fy = drawn ? my : oy, fz = drawn ? mz : oz;
        for (let pellet = 0; pellet < profile.pellets; pellet++) {
            // Stray within the spread: a turn about the vertical, and up or down.
            const turn = (Math.random() - 0.5) * 2 * spreadDegrees * DEG, tilt = flat ? 0 : (Math.random() - 0.5) * 2 * spreadDegrees * DEG;
            const cos = Math.cos(turn), sin = Math.sin(turn);
            let sx = dx * cos - dz * sin, sz = dx * sin + dz * cos, sy = dy + Math.tan(tilt) * Math.hypot(dx, dz);
            const length = Math.hypot(sx, sy, sz) || 1;
            sx /= length; sy /= length; sz /= length;
            if (profile.speed > 0) {
                const shot = { id: st.nextShot++, x: ox, y: oy, z: oz, dx: sx, dy: sy, dz: sz, speed: profile.speed, left: profile.range, unitId: unit.id,
                    skillId, rate: profile.damage, blast: profile.blast, flat: !!flat, kind: profile.projectile };
                const R = world3();
                if (flat && A.is3D() && R.pieceBaseAt) shot.over = oy - R.pieceBaseAt($dataMap, Math.floor(ox), Math.floor(oz));
                st.shots.push(shot);
                if (feed()) ReactorEvents.emit("fightShot", { unitId: unit.id, weaponId: profile.weaponId, projectile: profile.projectile,
                    from: { x: ox, y: oy, z: oz }, to: { x: ox + sx * profile.range, y: oy + sy * profile.range, z: oz + sz * profile.range }, targetId: 0 });
                continue;
            }
            const reach = A.rayWorld(ox, oy, oz, sx, sy, sz, profile.range, flat);
            const hit = A.rayUnits(fight, ox, oy, oz, sx, sy, sz, reach, team, flat, unit);
            const met = A.rayMet, t = hit ? A.rayT : reach;
            const ex = ox + sx * t, ey = oy + sy * t, ez = oz + sz * t;
            A.tracer(fx, fy, fz, ex, ey, ez);
            // Where it met the world: a spark and a mark, a hair off what it struck.
            if (!hit && met && met !== "edge" && met !== "tile") A.impact(ex, ey, ez, sx, sy, sz);
            if (feed()) ReactorEvents.emit("fightShot", { unitId: unit.id, weaponId: profile.weaponId, projectile: profile.projectile,
                from: { x: fx, y: fy, z: fz }, to: { x: ex, y: ey, z: ez }, targetId: hit ? hit.id : 0 });
            if (hit) A.land(fight, unit, [hit], "skill", skillId, profile.damage, 0, true);
        }
    };

    /** What flies: each moves its speed a frame and lands on the first body or wall in its way; a rocket bursts. */
    A.updateShots = function(fight, st) {
        const shots = st.shots;
        for (let i = shots.length - 1; i >= 0; i--) {
            const shot = shots[i], owner = fight.unit(shot.unitId);
            if (!owner) { shots.splice(i, 1); A.dropFx(shot.id); continue; }
            const step = Math.min(shot.speed, shot.left);
            // One fired on a flat aim over a 3D map flies at the height it left the weapon at, over whatever ground it passes.
            if (shot.flat && shot.over !== undefined && A.is3D()) shot.y = world3().pieceBaseAt($dataMap, Math.floor(shot.x), Math.floor(shot.z)) + shot.over;
            const reach = A.rayWorld(shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz, step + 0.01, shot.flat);
            const met = A.rayMet;
            const hit = A.rayUnits(fight, shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz, Math.min(reach, step), F.oppose(owner.team), shot.flat, owner);
            const t = hit ? A.rayT : Math.min(reach, step);
            shot.x += shot.dx * t; shot.y += shot.dy * t; shot.z += shot.dz * t;
            shot.left -= step;
            const stopped = !!hit || reach <= step || shot.left <= 0;
            if (!stopped) continue;
            shots.splice(i, 1);
            A.dropFx(shot.id);
            if (!fight.isAlive(owner)) continue;
            if (shot.blast > 0) {
                const caught = [];
                // The burst's own lines start a little back from what it struck, in the open.
                const bx = shot.x - shot.dx * 0.25, by = shot.y - shot.dy * 0.25 + (shot.flat ? 0 : 0.15), bz = shot.z - shot.dz * 0.25;
                for (const unit of fight._units) {
                    if (unit.gone || unit.team !== F.oppose(owner.team) || !fight.isAlive(unit)) continue;
                    const character = fight.character(unit);
                    if (A.reachTo(fight, shot.x, shot.z, character) > shot.blast) continue;
                    if (!shot.flat || A.deep()) {
                        // Within the blast in height as well (where the shot has a height of its own), and nothing of
                        // the world between the burst and the body.
                        const ground = A.groundOf(character), tall = A.heightOf(character);
                        if (!shot.flat && (shot.y < ground - shot.blast || shot.y > ground + tall + shot.blast)) continue;
                        const cx = character._realX + 0.5 - bx, cz = character._realY + 0.5 - bz, cy = shot.flat ? 0 : ground + tall * A.CHEST - by;
                        const far = Math.hypot(cx, cy, cz), slack = Math.max(A.LINE_SLACK, Math.hypot(cx, cz) - Math.max(0, A.reachTo(fight, bx, bz, character)));
                        if (far > slack && A.rayWorld(bx, by, bz, cx / far, cy / far, cz / far, far, shot.flat) < far - slack) continue;
                    }
                    caught.push(unit);
                }
                // The burst is seen where its lines start: in the open a little back from what it struck, never
                // inside it. What it struck keeps a mark.
                A.burst(bx, by, bz);
                if (!hit && reach <= step && met && met !== "edge" && met !== "tile") A.impact(shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz);
                if (caught.length) A.land(fight, owner, caught, "skill", shot.skillId, shot.rate, 0, true);
            } else if (hit) {
                A.land(fight, owner, [hit], "skill", shot.skillId, shot.rate, 0, true);
            } else if (reach <= step && met && met !== "edge" && met !== "tile") {
                A.impact(shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz);
            }
        }
    };

    //-------------------------------------------------------------------------
    // A run played out over frames: a hotbar skill, an enemy's blow. The Action
    // Sequence stage plays it when it has a sequence for it (its built-ins
    // included); several play at once.

    A.startRun = function(fight, unit, action, targets, options) {
        const run = F.makeRun(fight, unit, action, targets);
        run.rate = 1;
        run.reach = options && options.reach || 0;
        // One that needs no line to its target (its note says `<los: no>`): thrown over what stands between.
        run.lobbed = !!(options && options.lobbed);
        if (options && options.aimed) run.aimed = targets.map(target => { const c = fight.character(target); return c ? [c._realX, c._realY] : null; });
        const entry = { run, frames: 0 };
        fight.act().runs.push(entry);
        fight._progress = true;
        return entry;
    };

    /** Advances a run a frame; false when it is over. */
    A.updateRun = function(fight, entry) {
        const run = entry.run, ctx = fight.runContext(run);
        if (!ctx || !fight.isAlive(ctx.subject)) { A.endRun(fight, entry, true); return false; }
        const S = stage();
        if (S && run._played === undefined) {
            let staged = false;
            try { staged = !!S.begin(run, ctx); } catch (error) { staged = false; }
            Object.defineProperty(run, "_played", { value: staged, enumerable: false, writable: true });
        }
        if (run._played) {
            let more = false;
            try { more = !!S.update(ctx); } catch (error) { more = false; }
            if (more && ++entry.frames < 600) return true;
            A.endRun(fight, entry, false);
            return false;
        }
        // No stage, or nothing it can play: a motion, the animation, the blow on its twelfth frame.
        if (run.frame === 0) {
            fight.playMotion(ctx.character, ctx.action.isMagical() ? "cast" : "attack");
            fight.playAnimation(ctx.action, ctx.targets);
        } else if (run.frame === 12) {
            fight.applyRun(run, ctx.action, ctx.targets);
        }
        run.frame++;
        if (run.frame <= 26) return true;
        A.endRun(fight, entry, false);
        return false;
    };

    A.endRun = function(fight, entry, interrupted) {
        const run = entry.run, S = stage();
        if (run._played) {
            run._played = false;
            try { if (S && S.end) S.end(run, run._ctx, !!interrupted); } catch (error) { /* a stage that throws is ignored */ }
        }
        if (!interrupted && !run.applied) {
            const ctx = fight.runContext(run);
            if (ctx) fight.applyRun(run, ctx.action, ctx.targets);
        }
        entry.done = true;
    };

    /** Whether a unit is in the middle of a played-out action. */
    A.isActing = function(fight, unitId) {
        const runs = fight._action ? fight._action.runs : null;
        if (runs) for (const entry of runs) if (!entry.done && entry.run.subjectId === unitId) return true;
        return false;
    };

    //-------------------------------------------------------------------------
    // The player.

    /** Whether a character's body is busy with something no attack should cut into (a climb, a pull-up, a ride). */
    A.bodyBusy = function(character) {
        const P = root.ReactorPhysics;
        try {
            if (P && P.isMantling && P.isMantling(character)) return true;
            if (P && P.ladderHeld && P.ladderHeld(character)) return true;
        } catch (error) { /* a query that throws is not busy */ }
        return !!(character.isInVehicle && character.isInVehicle());
    };

    /** The weapons the actor can take in hand: the one equipped, then those in the bag it can equip. */
    A.weaponsOf = function(battler) {
        const list = A._weapons || (A._weapons = []);
        list.length = 0;
        const held = battler.weapons()[0];
        if (held) list.push(held);
        if (typeof $gameParty !== "undefined") {
            for (const weapon of $gameParty.weapons()) {
                if (list.length >= 8) break;
                if (weapon !== held && battler.canEquip(weapon)) list.push(weapon);
            }
        }
        return list;
    };

    /** The hotbar: the actor's skills other than attack and guard, then the party's items usable in battle; eight at most. */
    A.hotbarOf = function(battler) {
        const list = A._hotbar || (A._hotbar = []);
        list.length = 0;
        for (const skill of battler.skills()) {
            if (list.length >= 8) break;
            if (skill.id === battler.attackSkillId() || skill.id === battler.guardSkillId() || skill.occasion > 1) continue;
            list.push(skill);
        }
        if (typeof $gameParty !== "undefined") {
            for (const item of $gameParty.items()) {
                if (list.length >= 8) break;
                if (item.occasion <= 1 && item.itypeId === 1) list.push(item);
            }
        }
        return list;
    };

    A.updatePlayer = function(fight, st) {
        const p = st.player;
        if (p.cooldown > 0) p.cooldown--;
        if (p.dodge > 0) p.dodge--;
        if (p.safe > 0) p.safe--;
        if (p.rest > 0) p.rest--;
        if (p.hitMark > 0) p.hitMark--;
        if (p.killMark > 0) p.killMark--;
        if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - 0.03);
        for (const key of Object.keys(p.hot)) { if (--p.hot[key] <= 0) { delete p.hot[key]; st.rev++; } }
        let unit = fight.playerUnit();
        if (!unit) return;
        let battler = fight.battler(unit);
        if (!battler.isAlive()) {
            // The leader fell: the next member still standing takes the lead, where that member stands.
            const members = $gameParty.battleMembers(), next = members.findIndex(member => member.isAlive());
            if (next > 0) A.handOver(fight, st, next);
            return;
        }
        const character = $gamePlayer, profile = A.profile(battler);
        const busy = !battler.canMove() || A.bodyBusy(character) || A.isActing(fight, unit.id);
        // The lock: Tab takes the opponent nearest the crosshair's line, again the next one; it lets go of one that fell.
        const held = p.lock ? fight.unit(p.lock) : null;
        if (p.lock && (!fight.isAlive(held) || held.team !== F.oppose(unit.team))) { p.lock = 0; st.rev++; }
        if (In.triggered("lock")) fight.actionLock();
        // Locked on, the look swings round to keep the target ahead: left and right circle it.
        const R3 = world3(), lookNow = R3 && R3.Camera && R3.Camera.look;
        if (p.lock && lookNow && A.relative()) {
            const locked = fight.character(fight.unit(p.lock));
            if (locked) {
                // Over the shoulder the camera stands to one side: turned that much less, its middle is on the target.
                const far = Math.hypot(locked._realX - character._realX, locked._realY - character._realY);
                const aside = A.cameraMode() === "thirdPerson" ? Math.asin(clamp(Math.max(0.8, A.heightOf(character) * A.SHOULDER.side) * A.battleBlend / Math.max(1, far), 0, 0.9)) / DEG : 0;
                const want = Math.atan2(locked._realX - character._realX, -(locked._realY - character._realY)) / DEG - aside;
                let delta = (want - lookNow.yaw) % 360;
                if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
                lookNow.yaw = ((lookNow.yaw + delta * 0.14) % 360 + 360) % 360;
                // One that stands well above or below (on a roof, under it): the look tips to it as well.
                const drop = A.groundOf(character) + A.heightOf(character) * 0.8 - (A.groundOf(locked) + A.heightOf(locked) * 0.55);
                if (Math.abs(A.groundOf(character) - A.groundOf(locked)) > 1.2 && Number.isFinite(lookNow.pitch)) {
                    const tip = clamp(Math.atan2(drop, Math.max(1, far)) / DEG, -60, 75);
                    lookNow.pitch += (tip - lookNow.pitch) * 0.14;
                }
            }
        }
        A.takeAim(fight, unit, profile.ranged ? profile.range : 12);
        // Aiming: held, with a weapon that shoots, hands free.
        const wantAim = profile.ranged && In.pressed("aim") && !busy && p.reload <= 0 && p.dodge <= 0;
        if (wantAim !== p.aim) {
            p.aim = wantAim;
            st.rev++;
            A.holdAim(fight, character, wantAim);
        }
        if (p.aim || p.swing || p.cooldown > profile.rate - 6) {
            const facing = A.facing(aim.yaw);
            if (!character.isMoving() && character.direction() !== facing) character.setDirection(facing);
        }
        // Guard: held, not while swinging or reloading.
        const guard = In.pressed("guard") && !busy && !p.swing && p.dodge <= 0;
        if (guard !== p.guard) {
            p.guard = guard; st.rev++;
            if (guard) {
                p.guardAt = st.clock;
                const S = stage();
                if (S && S.flash) S.flash(character, [120, 180, 255, 130], 10);
            }
            fight.playMotion(character, guard ? "Guard" : "Lower Arms");
        }
        // Reload.
        if (p.reload > 0) {
            if (--p.reload <= 0) { p.mags[profile.weaponId] = profile.magazine; st.rev++; }
        } else if (In.triggered("reload")) fight.actionReload();
        if (In.triggered("dodge")) fight.actionDodge();
        if (In.wheel || In.triggered("weapon")) fight.actionNextWeapon(In.wheel < 0 ? -1 : 1);
        for (let slot = 1; slot <= 8; slot++) if (In.slot(slot)) fight.actionUse(slot);
        // The swing in hand.
        if (p.swing) A.updateSwing(fight, st, unit, battler, character, profile);
        else if (p.comboTimer > 0 && --p.comboTimer <= 0) { p.combo = 0; st.rev++; }
        if (busy || p.guard) return;
        if (profile.ranged) {
            if (In.pressed("attack")) fight.actionAttack();
        } else if (In.triggered("attack")) fight.actionAttack();
    };

    /** The weapon comes up on the line the player aims along (a point ahead that the hold follows), or down again. */
    A.holdAim = function(fight, character, on) {
        if (!on) { F.heldItem(character, "aim", null); return; }
        if (typeof Game_Character === "undefined") return;
        const dummy = A._aimAt || (A._aimAt = new Game_Character());
        A.placeAimAt(character);
        F.heldItem(character, "aim", dummy);
    };

    A.placeAimAt = function(character) {
        const dummy = A._aimAt;
        if (!dummy) return;
        const far = Math.max(3, Math.min(12, Math.hypot(aim.px - aim.ox, aim.pz - aim.oz)));
        dummy._realX = character._realX + aim.dx * far; dummy._realY = character._realY + aim.dz * far;
        dummy._x = Math.round(dummy._realX); dummy._y = Math.round(dummy._realY);
    };

    A.updateSwing = function(fight, st, unit, battler, character, profile) {
        const p = st.player, swing = p.swing, length = profile.rate;
        swing.frame++;
        if (In.triggered("attack") && swing.frame > 3) p.buffered = true;
        const from = Math.round(length * 0.3), to = Math.round(length * 0.6);
        if (swing.frame >= from && swing.frame <= to) {
            const yaw = aim.yaw * DEG, fx = Math.sin(yaw), fz = -Math.cos(yaw), half = Math.cos(profile.arc * DEG / 2);
            for (const other of fight._units) {
                if (other.gone || other.team !== F.oppose(unit.team) || swing.hit.includes(other.id) || !fight.isAlive(other)) continue;
                const target = fight.character(other);
                if (A.gap(fight, character, target) > profile.reach || A.levelGap(character, target) > A.LEVEL_REACH) continue;
                // Within the arc: the way to the nearest part of its body (a big one's middle may be tiles off).
                const near = A.nearPoint(fight, character._realX + 0.5, character._realY + 0.5, target, A._near || (A._near = { x: 0, z: 0 }));
                const dx = near.x - character._realX - 0.5, dz = near.z - character._realY - 0.5, distance = Math.hypot(dx, dz);
                if (distance > 0.3 && (dx * fx + dz * fz) / distance < half) continue;
                // No blade lands through a wall, a shut door or a post.
                if (!A.blowClear(fight, character, target)) continue;
                swing.hit.push(other.id);
                // A chain's steps land part of an attack, its last a whole one.
                const last = swing.step >= profile.combo, share = last ? 1 : Math.min(1, 0.4 + 0.1 * swing.step);
                A.land(fight, unit, [other], "skill", battler.attackSkillId(), share, 0, true);
                // The blow is felt: the battle holds for an instant, and a chain's last step drives the body back.
                st.stop = Math.max(st.stop, last ? A.HIT_STOP + 2 : A.HIT_STOP);
                if (last && fight.isAlive(other)) A.knock(fight, other, target, character);
                const animationId = battler.attackAnimationId1 ? battler.attackAnimationId1() : 0;
                if (animationId > 0 && typeof $dataAnimations !== "undefined" && $dataAnimations[animationId]) $gameTemp.requestAnimation([target], animationId);
            }
        }
        if (swing.frame < length) return;
        p.swing = null;
        p.combo = swing.step;
        if (p.buffered && swing.step < profile.combo) { p.buffered = false; A.swing(fight, st, unit, battler, character, profile, swing.step + 1); }
        else { p.buffered = false; p.comboTimer = swing.step >= profile.combo ? 1 : A.COMBO_GRACE; }
        st.rev++;
    };

    /** Drives a struck unit a cell back from who struck it, when its body has room on the cell behind. A big body (a vehicle) is not driven. */
    A.knock = function(fight, unit, character, from) {
        if (character.isMoving() || (character.isJumping && character.isJumping()) || !sizeOf(fight, character).round) return false;
        const dx = character._realX - from._realX, dy = character._realY - from._realY;
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8);
        if (!character.canPass(character.x, character.y, d)) return false;
        const nx = $gameMap.roundXWithDirection(character.x, d), ny = $gameMap.roundYWithDirection(character.y, d);
        if (!A.roomAt(fight, unit, character, nx, ny)) return false;
        const facing = character.direction();
        character.jump(nx - character.x, ny - character.y);
        character.setDirection(facing);
        return true;
    };

    /** A wind-up shows as the pose its action opens with: the first motion of its sequence, held for the wind-up. */
    A.windupShow = function(fight, battler, character, skillId, frames) {
        const S = stage();
        try {
            const P = root.ReactorBattlePresentation;
            if (!S || !S.cue || !P || !P.sequence || P.state !== "ready" || !$dataSkills[skillId]) return false;
            const action = new Game_Action(battler);
            action.setSkill(skillId);
            const sequence = P.sequence(battler, action);
            const motion = sequence && Array.isArray(sequence.steps) ? sequence.steps.find(entry => entry && entry.type === "motion") : null;
            return !!motion && !!S.cue(Object.assign({}, motion, { duration: frames }), { character, targetCharacters: [] });
        } catch (error) {
            return false;
        }
    };

    A.swing = function(fight, st, unit, battler, character, profile, step) {
        const p = st.player;
        p.swing = { step, frame: 0, hit: [] };
        p.combo = step;
        p.comboTimer = 0;
        st.rev++;
        const facing = A.facing(aim.yaw);
        if (!character.isMoving()) character.setDirection(facing);
        A.swingShow(fight, battler, character, step);
        if (feed()) ReactorEvents.emit("fightSwing", { unitId: unit.id, step, steps: profile.combo });
    };

    /** What a swing looks and sounds like: the weapon's own sequence's motion and sound when it has one, else a lunge. */
    A.swingShow = function(fight, battler, character, step) {
        const S = stage();
        let shown = false;
        try {
            const P = root.ReactorBattlePresentation;
            const action = new Game_Action(battler);
            action.setAttack();
            const sequence = P && P.sequence && P.state === "ready" ? P.sequence(battler, action) : null;
            const steps = sequence && Array.isArray(sequence.steps) ? sequence.steps : null;
            if (steps && S && S.cue) {
                const motions = steps.filter(entry => entry && entry.type === "motion");
                const motion = motions.length ? motions[(step - 1) % motions.length] : null;
                const sound = steps.find(entry => entry && entry.type === "sound");
                const ctx = A._cueCtx || (A._cueCtx = { character: null, targetCharacters: [] });
                ctx.character = character;
                if (motion) shown = !!S.cue(Object.assign({}, motion, { duration: Math.min(24, num(motion.duration) || 20) }), ctx);
                if (sound) S.cue(sound, ctx);
            }
        } catch (error) { shown = false; }
        if (!shown) {
            fight.playMotion(character, "attack");
            if (S && S.beat) S.beat(character, "lunge", null);
        }
    };

    Game_Fight.prototype.actionAttack = function() {
        if (!this.isAction()) return false;
        const st = this.act(), p = st.player, unit = this.playerUnit();
        const battler = unit && this.battler(unit);
        if (!battler || !battler.isAlive() || !battler.canMove() || p.guard || A.bodyBusy($gamePlayer) || A.isActing(this, unit.id)) return false;
        const profile = A.profile(battler), character = $gamePlayer;
        A.takeAim(this, unit, profile.ranged ? profile.range : 12);
        if (!profile.ranged) {
            if (p.swing) { p.buffered = true; return true; }
            if (p.cooldown > 0) return false;
            A.swing(this, st, unit, battler, character, profile, p.comboTimer > 0 && p.combo < profile.combo ? p.combo + 1 : 1);
            return true;
        }
        if (p.cooldown > 0 || p.reload > 0 || p.dodge > 0) return false;
        if (profile.magazine > 0) {
            if (p.mags[profile.weaponId] === undefined) p.mags[profile.weaponId] = profile.magazine;
            if (p.mags[profile.weaponId] <= 0) { this.actionReload(); return false; }
            p.mags[profile.weaponId]--;
        }
        p.cooldown = profile.rate;
        st.rev++;
        // Hip fire strays; an aimed shot holds to the line. Moving opens it a little.
        const spread = (p.aim ? profile.aimSpread : profile.spread) * (character.isMoving() ? 1.4 : 1);
        if (!character.isMoving()) character.setDirection(A.facing(aim.yaw));
        // The weapon comes up for the shot, and stays up a moment after an unaimed one.
        A.holdAim(this, character, true);
        p.raised = p.aim ? 0 : 40;
        if (aim.eye && !(profile.speed > 0)) {
            // A bullet goes where the crosshair says: traced along the eye's own line (a post beside the muzzle does
            // not stop a shot the crosshair is clear of), and drawn from the muzzle to where it landed.
            A.fire(this, unit, profile, battler.attackSkillId(), aim.ex, aim.ey, aim.ez, aim.edx, aim.edy, aim.edz, false, spread, aim.ox, aim.oy, aim.oz);
        } else {
            // What flies leaves the weapon itself, along the line the weapon points (the aim just taken): from this
            // side of whatever the weapon's end may be poking through.
            A.fire(this, unit, profile, battler.attackSkillId(), aim.ox, aim.oy, aim.oz, aim.dx, aim.dy, aim.dz, aim.flat, spread);
        }
        A.shotShow(this, battler, character);
        p.recoil = Math.min(6, p.recoil + (p.aim ? 0.7 : 1.2));
        if (A.View) A.View.fired();
        return true;
    };

    /** A shot's sound and flash: the weapon's sequence's sound and muzzle animation when it has them, else the system's. */
    A.shotShow = function(fight, battler, character) {
        const S = stage();
        let sounded = false;
        try {
            const P = root.ReactorBattlePresentation;
            const action = new Game_Action(battler);
            action.setAttack();
            const sequence = P && P.sequence && P.state === "ready" ? P.sequence(battler, action) : null;
            const sound = sequence && Array.isArray(sequence.steps) ? sequence.steps.find(entry => entry && entry.type === "sound") : null;
            if (sound && S && S.cue) sounded = !!S.cue(sound, { character, targetCharacters: [] });
        } catch (error) { sounded = false; }
        if (!sounded && typeof SoundManager !== "undefined" && SoundManager.playEnemyAttack) SoundManager.playEnemyAttack();
    };

    Game_Fight.prototype.actionAim = function(on) {
        if (!this.isAction()) return false;
        In.virtual.aim = !!on;
        return true;
    };

    Game_Fight.prototype.actionReload = function() {
        if (!this.isAction()) return false;
        const st = this.act(), p = st.player, unit = this.playerUnit(), battler = unit && this.battler(unit);
        if (!battler || !battler.isAlive()) return false;
        const profile = A.profile(battler);
        if (!profile.ranged || profile.magazine <= 0 || p.reload > 0) return false;
        if ((p.mags[profile.weaponId] === undefined ? profile.magazine : p.mags[profile.weaponId]) >= profile.magazine) return false;
        p.reload = p.reloadTotal = Math.max(1, profile.reload);
        st.rev++;
        if (feed()) ReactorEvents.emit("fightReload", { unitId: unit.id, frames: p.reload });
        return true;
    };

    Game_Fight.prototype.actionDodge = function() {
        if (!this.isAction()) return false;
        const st = this.act(), p = st.player, unit = this.playerUnit(), battler = unit && this.battler(unit), character = $gamePlayer;
        if (!battler || !battler.isAlive() || !battler.canMove() || p.rest > 0 || A.bodyBusy(character) || A.isActing(this, unit.id)) return false;
        if (character.isJumping && character.isJumping()) return false;
        // A swing is committed to until its blow has had its chance.
        if (p.swing && p.swing.frame <= Math.round(A.profile(battler).rate * 0.6)) return false;
        const S = stage();
        if (S && S.flash) S.flash(character, [150, 210, 255, 160], 14);
        p.dodge = A.DODGE_FRAMES; p.safe = A.DODGE_SAFE; p.rest = A.DODGE_REST;
        p.swing = null; p.buffered = false;
        st.rev++;
        // Two tiles the way the keys ask (or back from where the weapon points), as far as the way is clear, to the
        // furthest cell on it where the body has room (never onto another body, nor into one or into a post).
        let direction = typeof Input !== "undefined" && Input.dir4 ? Input.dir4 : 0;
        const R = world3();
        if (R && R.Camera && R.Camera.relativeMove && A.relative()) { const move = R.Camera.relativeMove(); direction = move ? move.horz || move.vert : 0; }
        if (!direction) direction = character.reverseDir(A.facing(aim.yaw));
        let x = character.x, y = character.y, landX = x, landY = y;
        for (let i = 0; i < 2; i++) {
            if (!character.canPass(x, y, direction)) break;
            x = $gameMap.roundXWithDirection(x, direction); y = $gameMap.roundYWithDirection(y, direction);
            if (A.roomAt(this, unit, character, x, y)) { landX = x; landY = y; }
        }
        if ((landX !== character.x || landY !== character.y) && !character.isMoving()) character.jump(landX - character.x, landY - character.y);
        if (feed()) ReactorEvents.emit("fightDodge", { unitId: unit.id });
        return true;
    };

    Game_Fight.prototype.actionNextWeapon = function(step) {
        if (!this.isAction()) return false;
        const st = this.act(), p = st.player, unit = this.playerUnit(), battler = unit && this.battler(unit);
        if (!battler || !battler.isAlive() || !battler.isActor() || p.swing || p.reload > 0) return false;
        // (A weapon the Database locks or seals in the hand is not changed here either.)
        if (battler.isEquipChangeOk && !battler.isEquipChangeOk(0)) return false;
        const list = A.weaponsOf(battler), held = battler.weapons()[0] || null;
        if (list.length < 2) return false;
        // The round is the weapons carried in the Database's order, whichever is in hand: a step on from the one held
        // comes to each in turn (the list itself starts with the one held, so its second is only ever the last one held).
        const round = list.slice().sort((a, b) => a.id - b.id), at = round.indexOf(held);
        const next = round[((at < 0 && step < 0 ? 0 : at) + (step < 0 ? -1 : 1) + round.length) % round.length];
        battler.changeEquip(0, next);
        if (battler.weapons()[0] !== next) return false;
        p.cooldown = 18; p.combo = 0; p.comboTimer = 0;
        p.aim = false;
        st.rev++;
        // What the hand holds changes with it.
        F.heldItem($gamePlayer, "aim", null);
        F.heldItem($gamePlayer, "drop", { battler });
        F.heldItem($gamePlayer, "carry", { battler });
        return true;
    };

    Game_Fight.prototype.actionLock = function() {
        if (!this.isAction()) return false;
        const st = this.act(), p = st.player, unit = this.playerUnit();
        if (!unit) return false;
        // The opponents in sight by how far off the weapon's line they stand; the one after the one held.
        const list = [];
        for (const other of this._units) {
            if (other.gone || other.team !== F.oppose(unit.team) || !this.isAlive(other)) continue;
            const character = this.character(other);
            const dx = character._realX + 0.5 - aim.ox, dz = character._realY + 0.5 - aim.oz, distance = Math.hypot(dx, dz);
            if (distance > 24 || !A.sees(this, $gamePlayer, character)) continue;
            const off = distance > 0.01 ? Math.acos(clamp((dx * aim.dx + dz * aim.dz) / (distance * (Math.hypot(aim.dx, aim.dz) || 1)), -1, 1)) : 0;
            list.push([other.id, off + distance * 0.01]);
        }
        list.sort((a, b) => a[1] - b[1]);
        if (!list.length) { p.lock = 0; st.rev++; return false; }
        const at = list.findIndex(entry => entry[0] === p.lock);
        p.lock = at >= 0 && at === list.length - 1 ? 0 : list[at + 1][0];
        st.rev++;
        return true;
    };

    /** The fallen of its side an action that revives lands on: those lying as near as a friendly action reaches (the nearest, or all of them). */
    A.fallenNear = function(fight, unit, action) {
        const from = fight.character(unit), list = [];
        for (const other of fight._units) {
            // (One an event stands for is there to be revived only while its body lies.)
            if (other.gone || (other.eventId && other.body !== "lie") || other.team !== unit.team) continue;
            const battler = fight.battler(other), body = fight.character(other);
            if (battler && battler.isDead() && body && fight.distance(from, body) <= 2) list.push(other);
        }
        if (action.isForAll() || list.length < 2) return list;
        list.sort((a, b) => fight.distance(from, fight.character(a)) - fight.distance(from, fight.character(b)));
        return list.slice(0, 1);
    };

    /** Uses the hotbar's `slot` (1-8): on the aimed or locked opponent, the user, the friend most hurt or a fallen one, as its Scope says. */
    Game_Fight.prototype.actionUse = function(slot) {
        if (!this.isAction()) return false;
        const st = this.act(), p = st.player, unit = this.playerUnit(), battler = unit && this.battler(unit);
        if (!battler || !battler.isAlive() || !battler.canMove() || p.swing || A.bodyBusy($gamePlayer) || A.isActing(this, unit.id)) return false;
        const item = A.hotbarOf(battler)[slot - 1];
        if (!item) return false;
        const skill = DataManager.isSkill(item), key = (skill ? "s" : "i") + item.id;
        if (p.hot[key] > 0 || !battler.canUse(item)) return false;
        const action = new Game_Action(battler);
        if (skill) action.setSkill(item.id); else action.setItem(item.id);
        let targets, lobbed = false;
        if (action.isForUser()) targets = [unit];
        else if (action.isForDeadFriend()) targets = A.fallenNear(this, unit, action);
        else if (action.isForFriend()) targets = this.actionTargets(unit, action, unit);
        else {
            let tactics = null;
            try { tactics = F.tactics ? F.tactics(battler, item) : null; } catch (error) { tactics = null; }
            const reach = Math.max(1.6, (tactics ? tactics.max : 4) * A.RANGE_SCALE);
            // Not at one behind a wall, a shut door or the ground, unless it needs no line (`<los: no>`).
            lobbed = !!tactics && tactics.los === false;
            const within = other => !!other && other.team === F.oppose(unit.team) && this.isAlive(other) && A.gap(this, $gamePlayer, this.character(other)) <= reach
                && (lobbed || A.blowClear(this, $gamePlayer, this.character(other)));
            // On the one locked or under the crosshair; else on the nearest it can reach with a clear way.
            let target = p.lock ? this.unit(p.lock) : aim.target ? this.unit(aim.target) : null;
            if (!within(target)) {
                target = null;
                let least = Infinity;
                for (const other of this._units) {
                    if (other.gone || other.team !== F.oppose(unit.team) || !within(other)) continue;
                    const gap = A.gap(this, $gamePlayer, this.character(other));
                    if (gap < least) { least = gap; target = other; }
                }
            }
            if (!target) return false;
            $gamePlayer.turnTowardCharacter(this.character(target));
            // Of everyone it would land on, those it has a clear way to.
            targets = this.actionTargets(unit, action, target).filter(other => other.team === unit.team || lobbed || A.blowClear(this, $gamePlayer, this.character(other)));
        }
        if (!targets.length) return false;
        battler.useItem(item);
        p.hot[key] = A.cooldownOf(item);
        p.hotTotal = p.hotTotal || {};
        p.hotTotal[key] = p.hot[key];
        st.rev++;
        A.startRun(this, unit, action, targets, { aimed: !action.isForFriend() && !action.isForUser(), lobbed });
        return true;
    };

    //-------------------------------------------------------------------------
    // Everyone else: a small state machine a unit.

    A.aiOf = function(fight, st, unit, character) {
        let ai = st.ai[unit.id];
        if (!ai) {
            ai = st.ai[unit.id] = { state: "idle", timer: 0, targetId: 0, postX: character.x, postY: character.y, lost: 0, cool: 0, skillId: 0, kind: "",
                speed0: character.moveSpeed ? character.moveSpeed() : 4, alert: unit.team !== "enemy" };
            if (character.setMoveSpeed && unit.eventId) character.setMoveSpeed(Math.max(4, ai.speed0));
        }
        return ai;
    };

    const presetOf = battler => {
        const record = battler.isActor() ? battler.actor() : battler.enemy();
        // The record's own preset when it is one of the three, as the Tactical reader takes it; else its tag.
        const own = record && record.rrBattle && typeof record.rrBattle.ai === "string" ? record.rrBattle.ai.toLowerCase() : "";
        if (own === "aggressive" || own === "ranged" || own === "support") return own;
        const match = /<ai\s*:\s*(\w+)\s*>/i.exec(String(record && record.note || ""));
        return match ? match[1].toLowerCase() : "aggressive";
    };

    /** A unit took a blow: it knows who struck it now, and flinches when it was not already striking. */
    A.struck = function(fight, unit, ai, by) {
        if (by && by.team !== unit.team) {
            if (!ai.alert && feed()) ReactorEvents.emit("fightAlert", { unitId: unit.id, targetId: by.id });
            ai.alert = true;
            if (!ai.targetId) ai.targetId = by.id;
        }
        if (ai.state === "idle" || ai.state === "chase" || ai.state === "return") { ai.state = "stagger"; ai.timer = 12; }
        const P = root.ReactorPhysics, character = fight.character(unit);
        try { if (P && P.isMantling && P.cancelMantle && character && P.isMantling(character)) P.cancelMantle(character); } catch (error) { /* it holds on */ }
    };

    /** Whether an idle unit notices an opponent: in front of it within sight, or near enough to hear, with nothing between. */
    A.notices = function(fight, unit, character, other) {
        const target = fight.character(other);
        const dx = target._realX - character._realX, dz = target._realY - character._realY, distance = Math.hypot(dx, dz);
        if (distance > A.SIGHT) return false;
        if (distance > A.HEARING) {
            const yaw = (YAW_OF_DIRECTION[character._reactorDir8 || character.direction()] || 0) * DEG;
            if ((dx * Math.sin(yaw) - dz * Math.cos(yaw)) / (distance || 1) < 0.25) return false;
        }
        return A.sees(fight, character, target);
    };

    A.nearest = function(fight, unit, character, team, far) {
        let best = null, bestDistance = far;
        for (const other of fight._units) {
            if (other.gone || other.team !== team || !fight.isAlive(other)) continue;
            const target = fight.character(other);
            const distance = Math.hypot(target._realX - character._realX, target._realY - character._realY);
            if (distance < bestDistance) { best = other; bestDistance = distance; }
        }
        return best;
    };

    // The cells a way round is searched over: a window about the unit's own cell, kept between searches (each
    // search stamps what it touches), so a search makes no objects.
    const ROUTE_SPAN = 16, ROUTE_SIDE = ROUTE_SPAN * 2 + 1;
    const routes = { stamp: 0, seen: new Uint16Array(ROUTE_SIDE * ROUTE_SIDE), done: new Uint16Array(ROUTE_SIDE * ROUTE_SIDE), cost: new Int16Array(ROUTE_SIDE * ROUTE_SIDE),
        came: new Uint8Array(ROUTE_SIDE * ROUTE_SIDE), heap: new Int32Array(ROUTE_SIDE * ROUTE_SIDE * 4), steps: new Uint8Array(ROUTE_SPAN * 2), searches: 0, cells: 0 };
    A.routes = routes;

    /**
     * The way a character can walk from its cell toward (x, y) round what stands between: the steps (2, 4, 6, 8)
     * into `A.routes.steps`, and how many there are (0: no way nearer than it stands). It ends on the cell beside
     * the goal, or on the nearest cell to it the search came to. Each step is one the character's own walking rule
     * allows now; at most A.ROUTE_CELLS cells are looked at, nearest the goal first. `whole`: only a way that comes
     * out beside the goal counts (a way round something); one that merely ends nearer does not.
     */
    A.route = function(character, x, y, whole) {
        const sx = character.x, sy = character.y, R = ROUTE_SPAN, W = ROUTE_SIDE;
        if (++routes.stamp > 65000) { routes.seen.fill(0); routes.done.fill(0); routes.stamp = 1; }
        const stamp = routes.stamp, seen = routes.seen, done = routes.done, cost = routes.cost, came = routes.came, heap = routes.heap;
        const start = R * W + R, far = Math.abs(sx - x) + Math.abs(sy - y);
        let size = 0, best = start, bestH = far, bestG = 0, left = A.ROUTE_CELLS;
        routes.searches++;
        if (far <= 1) return 0;
        seen[start] = stamp; cost[start] = 0;
        // The heap's keys: the way so far plus the way still to go, then the way to go alone, then the cell.
        heap[size++] = ((far * 64 + Math.min(63, far)) << 11) | start;
        while (size > 0 && left > 0) {
            const top = heap[0], last = heap[--size];
            // The least key comes off; the last takes its place and sinks.
            let at = 0;
            for (;;) {
                let child = at * 2 + 1;
                if (child >= size) break;
                if (child + 1 < size && heap[child + 1] < heap[child]) child++;
                if (heap[child] >= last) break;
                heap[at] = heap[child]; at = child;
            }
            if (size > 0) heap[at] = last;
            const cell = top & 2047;
            if (done[cell] === stamp) continue;
            done[cell] = stamp;
            left--; routes.cells++;
            const cx = sx + cell % W - R, cy = sy + Math.floor(cell / W) - R, g = cost[cell], h = Math.abs(cx - x) + Math.abs(cy - y);
            if (h < bestH || (h === bestH && g < bestG)) { best = cell; bestH = h; bestG = g; }
            if (h <= 1) break;
            if (g >= routes.steps.length) continue;
            for (let d = 2; d <= 8; d += 2) {
                const nx = cx + (d === 6 ? 1 : d === 4 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 8 ? -1 : 0);
                if (Math.abs(nx - sx) > R || Math.abs(ny - sy) > R) continue;
                const next = (ny - sy + R) * W + (nx - sx + R);
                if (done[next] === stamp || (seen[next] === stamp && cost[next] <= g + 1)) continue;
                if (!character.canPass(cx, cy, d)) continue;
                seen[next] = stamp; cost[next] = g + 1; came[next] = d;
                const nh = Math.abs(nx - x) + Math.abs(ny - y);
                // Into the heap: up from the end while it is less than what is over it.
                const key = (((g + 1 + nh) * 64 + Math.min(63, nh)) << 11) | next;
                let slot = size++;
                while (slot > 0) {
                    const over = (slot - 1) >> 1;
                    if (heap[over] <= key) break;
                    heap[slot] = heap[over]; slot = over;
                }
                heap[slot] = key;
            }
        }
        if (best === start || bestH >= far || (whole && bestH > 1)) return 0;
        // Back along the way it came by.
        for (let cell = best, k = bestG - 1; k >= 0; k--) {
            const d = came[cell];
            routes.steps[k] = d;
            cell -= (d === 6 ? 1 : d === 4 ? -1 : 0) + (d === 2 ? W : d === 8 ? -W : 0);
        }
        return bestG;
    };

    /**
     * One step toward (or away from) a spot, when the way is clear and the body has room on the cell it would take
     * (A.roomAt). `round`: what it goes to is at arm's length behind something (a wall between them): the straight
     * way is no use, only the way round.
     */
    A.step = function(fight, unit, character, x, y, away, round) {
        if (character.isMoving() || (character.isJumping && character.isJumping())) return false;
        let direction = 0;
        if (away) {
            let best = -1;
            for (const d of [2, 4, 6, 8]) {
                if (!character.canPass(character.x, character.y, d)) continue;
                const nx = $gameMap.roundXWithDirection(character.x, d), ny = $gameMap.roundYWithDirection(character.y, d);
                const distance = Math.hypot(nx - x, ny - y);
                if (distance > best && A.roomAt(fight, unit, character, nx, ny)) { best = distance; direction = d; }
            }
        } else {
            // Straight at it where the way is open: the longer side of the gap first, then the shorter.
            const dx = x - character.x, dy = y - character.y, wide = Math.abs(dx) >= Math.abs(dy);
            const first = wide ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8), second = wide ? (dy > 0 ? 2 : dy < 0 ? 8 : 0) : (dx > 0 ? 6 : dx < 0 ? 4 : 0);
            const open = d => {
                if (!d || !character.canPass(character.x, character.y, d)) return false;
                return A.roomAt(fight, unit, character, $gameMap.roundXWithDirection(character.x, d), $gameMap.roundYWithDirection(character.y, d));
            };
            const st = fight._action, ai = st && st.ai[unit.id];
            // A way round found before is kept to, step by step, while it still leads where the unit is going. A
            // step of it that is taken for the moment (someone stands there) is waited for a few thoughts.
            let routed = false;
            if (ai && ai.route) {
                if (ai.routeAt >= ai.route.length || Math.abs(ai.routeX - x) + Math.abs(ai.routeY - y) > 2) ai.route = null;
                else if (open(ai.route[ai.routeAt])) { direction = ai.route[ai.routeAt++]; ai.routeWait = 0; routed = true; }
                else if ((ai.routeWait = (ai.routeWait || 0) + 1) <= 3) return false;
                else ai.route = null;
            }
            if (!routed) direction = round ? 0 : open(first) ? first : open(second) ? second : 0;
            if (!direction && ai && st.clock >= (ai.routeAsk || 0) && st.clock - (st.pathAt || -99) >= 8) {
                // Blocked both ways, or behind a wall: the way round is searched for. Dear on a large map, so one
                // search in the whole battle every eighth of a second, and each unit no more than now and then; the
                // way found is kept and walked, not asked for again at every step.
                st.pathAt = st.clock;
                // (For one behind a wall only the whole way round is a way: a few steps nearer the wall are none.)
                const count = A.route(character, x, y, !!round);
                ai.routeAsk = st.clock + (count ? A.ROUTE_REST : A.ROUTE_NONE);
                if (count) {
                    ai.route = Array.prototype.slice.call(routes.steps, 0, Math.min(count, A.ROUTE_STEPS));
                    ai.routeAt = 0; ai.routeX = x; ai.routeY = y; ai.routeWait = 0;
                    if (open(ai.route[0])) { direction = ai.route[0]; ai.routeAt = 1; }
                }
            }
            // Blocked both ways with no way round known: a step to the side (the same side while it stays blocked),
            // round whoever stands there. Not along a wall: where the world itself shuts both ways and there is no
            // way round it, it stands.
            const shut = d => !d || !character.isMapPassable(character.x, character.y, d);
            if (!direction && ai && !ai.route && !round && !(shut(first) && shut(second))) {
                const sides = wide ? [2, 8] : [4, 6];
                if (ai.side === undefined) ai.side = unit.id % 2;
                direction = open(sides[ai.side]) ? sides[ai.side] : open(sides[1 - ai.side]) ? (ai.side = 1 - ai.side, sides[ai.side]) : 0;
            }
        }
        // (Whichever way was picked was found passable, with room for the body.)
        if (!direction) return false;
        if ($gamePlayer.x === $gameMap.roundXWithDirection(character.x, direction) && $gamePlayer.y === $gameMap.roundYWithDirection(character.y, direction)) return false;
        character.moveStraight(direction);
        return character.isMovementSucceeded();
    };

    /** What the unit will do next and how near it must stand: its action patterns (an actor its skills) decide. */
    A.choose = function(fight, unit, battler, ai) {
        const action = fight.chooseAction(battler), item = action.item();
        ai.skillId = item ? item.id : battler.attackSkillId();
        let reach = 1;
        ai.lobbed = false;
        try {
            const tactics = F.tactics && item ? F.tactics(battler, item) : null;
            if (tactics) { reach = tactics.max || 1; ai.lobbed = tactics.los === false; }
        } catch (error) { reach = 1; }
        const friendly = action.isForFriend() || action.isForUser();
        if (battler.isActor() && action.isAttack()) {
            const profile = A.profile(battler);
            ai.kind = profile.ranged ? "shot" : "melee";
            ai.reach = profile.ranged ? profile.range * 0.7 : profile.reach;
            // What its weapon fires flies its own line whatever the note says.
            if (profile.ranged) ai.lobbed = false;
        } else {
            ai.kind = friendly ? "support" : reach <= 1 ? "melee" : action.isForAll() || !action.isAttack() && item && item.damage && item.damage.type === 0 ? "skill" : "shot";
            ai.reach = reach <= 1 ? 1.5 : Math.min(14, reach * A.RANGE_SCALE);
            // One that needs no line is not a bolt, which would end on what stands between: it lands as a skill does.
            if (ai.lobbed && ai.kind === "shot") ai.kind = "skill";
        }
        return action;
    };

    /**
     * Whether the blow a unit has chosen has a clear way to its target: a bolt's line from where it leaves the
     * weapon, a blade's and a skill's from chest to chest (glass stops both; a look passes it). A skill that
     * needs no line (its note says `<los: no>`) always has.
     */
    A.wayClear = function(fight, ai, from, to) {
        if (ai.lobbed) return true;
        return ai.kind === "shot" ? A.lineOpen(fight, from, 0.7, to, 0.55, false) : A.blowClear(fight, from, to);
    };

    A.updateUnit = function(fight, st, unit, character, battler, ai, player) {
        if (ai.cool > 0) ai.cool--;
        if (ai.state === "stagger") { if (--ai.timer <= 0) ai.state = ai.alert ? "chase" : "idle"; return; }
        if (!battler.canMove() || A.isActing(fight, unit.id) || A.bodyBusy(character)) return;
        const foes = F.oppose(unit.team);
        if (ai.state === "windup") {
            const target = fight.unit(ai.targetId);
            if (target && fight.isAlive(target)) character.turnTowardCharacter(fight.character(target));
            if (--ai.timer <= 0) A.strike(fight, st, unit, character, battler, ai);
            return;
        }
        if (ai.state === "recover") { if (--ai.timer <= 0) ai.state = "chase"; return; }
        // The player's own party gives the player room: nobody stands on the heels of who holds the camera.
        if (unit.party && player && !character.isMoving()) {
            const ox = character._realX - player._realX, oy = character._realY - player._realY;
            // Nor in the way of the weapon: within a tile of its line, up to eight tiles out, it steps off to the side.
            const along = ox * aim.dx + oy * aim.dz, off = ox * aim.dz - oy * aim.dx;
            // (Through the eyes a friend at arm's length fills the view: it keeps further off.)
            if (Math.hypot(ox, oy) < (A.cameraMode() === "firstPerson" ? 2.6 : 1.8)) A.step(fight, unit, character, player.x, player.y, true);
            else if (along > 0 && along < 8 && Math.abs(off) < 1.1) A.step(fight, unit, character, Math.round(character.x - aim.dx * 2 + aim.dz * (off >= 0 ? -3 : 3)), Math.round(character.y - aim.dz * 2 - aim.dx * (off >= 0 ? -3 : 3)), true);
        }
        // Thinking is spread over the frames: a unit thinks every few, one far from the player rarely.
        const far = player && Math.abs(character.x - player.x) + Math.abs(character.y - player.y) > A.FAR;
        if (!ai.late && (st.clock + unit.id * 3) % (far ? A.THINK * 4 : A.THINK) !== 0) {
            // Between thoughts a unit on its way keeps walking: the next step of a way round it was given, else the way
            // it was going (finding a way is for when it thinks).
            if (ai.state === "chase" && ai.walk && !character.isMoving() && !(character.isJumping && character.isJumping())) {
                const routed = !!ai.route && !ai.walkAway && ai.routeAt < ai.route.length, d = routed ? ai.route[ai.routeAt] : ai.heading;
                if (d && character.canPass(character.x, character.y, d)) {
                    const nx = $gameMap.roundXWithDirection(character.x, d), ny = $gameMap.roundYWithDirection(character.y, d);
                    if (!($gamePlayer.x === nx && $gamePlayer.y === ny) && A.roomAt(fight, unit, character, nx, ny)) {
                        character.moveStraight(d);
                        if (routed && character.isMovementSucceeded()) ai.routeAt++;
                    }
                }
            }
            return;
        }
        // An army thinks a few at a time: one whose turn falls on a full frame thinks on the next.
        if (A._thinks >= A.THINK_BUDGET) { ai.late = true; return; }
        A._thinks++;
        ai.late = false;
        let target = ai.targetId ? fight.unit(ai.targetId) : null;
        if (!target || !fight.isAlive(target) || target.team !== foes) { target = null; ai.targetId = 0; }
        if (ai.state === "idle" || ai.state === "return") {
            let seen = null;
            if (ai.alert) seen = A.nearest(fight, unit, character, foes, 30);
            else for (const other of fight._units) {
                if (other.gone || other.team !== foes || !fight.isAlive(other)) continue;
                if (A.notices(fight, unit, character, other)) { seen = other; break; }
            }
            if (seen) {
                if (!ai.alert || ai.state === "return") {
                    if (typeof $gameTemp !== "undefined" && $gameTemp.requestBalloon) $gameTemp.requestBalloon(character, 1);
                    if (feed()) ReactorEvents.emit("fightAlert", { unitId: unit.id, targetId: seen.id });
                    // Those standing near hear it.
                    for (const other of fight._units) {
                        if (other === unit || other.gone || other.team !== unit.team) continue;
                        const mate = fight.character(other), record = st.ai[other.id];
                        if (mate && record && Math.hypot(mate._realX - character._realX, mate._realY - character._realY) <= 6) record.alert = true;
                    }
                }
                ai.alert = true; ai.targetId = seen.id; ai.state = "chase"; ai.lost = 0;
                // It does not strike the instant it notices.
                ai.cool = Math.max(ai.cool, 40 + (unit.id * 17) % 40);
                st.rev++;
            } else if (ai.state === "return") {
                if (character.x === ai.postX && character.y === ai.postY) ai.state = "idle";
                else A.step(fight, unit, character, ai.postX, ai.postY, false);
            }
            return;
        }
        // Chasing: someone to fight, or back to the post after a while with nobody in sight.
        if (!target) {
            target = A.nearest(fight, unit, character, foes, 30);
            if (target) ai.targetId = target.id;
        }
        if (!target) { ai.state = unit.eventId ? "return" : "idle"; ai.walk = false; return; }
        const to = fight.character(target);
        const sees = A.sees(fight, character, to);
        // Out of sight for a while, a target is given up; not one near enough to hear, nor one a way round is being walked to.
        ai.lost = sees || ai.route || Math.hypot(to._realX - character._realX, to._realY - character._realY) <= A.HEARING ? 0 : ai.lost + 1;
        if (ai.lost > 40 && unit.team === "enemy") { ai.targetId = 0; ai.alert = false; ai.state = "return"; ai.walk = false; st.rev++; return; }
        const preset = presetOf(battler);
        // Hurt and not the kind to press on: it falls back; one that supports mends a friend first.
        const hurt = battler.hpRate() < 0.3 && preset !== "aggressive";
        const P = root.ReactorPhysics;
        if (!ai.skillId || ai.cool <= 0 && ai.kind === "") A.choose(fight, unit, battler, ai);
        const gap = A.gap(fight, character, to);
        ai.walk = false;
        // A blow's reach is through the open: a target at arm's length behind a wall or a shut door, or in a
        // shooter's sight behind glass, is walked round to, never wound up at.
        let walled = false;
        if (ai.cool <= 0) {
            const action = A.choose(fight, unit, battler, ai);
            if (ai.kind === "support") {
                const friends = fight.actionTargets(unit, action, unit);
                if (friends.length && friends.some(friend => fight.battler(friend).hpRate() < 0.7) && battler.canUse(action.item())) {
                    battler.useItem(action.item());
                    A.startRun(fight, unit, action, friends, null);
                    ai.cool = 150;
                    return;
                }
                // Nobody to mend: it fights with its attack.
                ai.skillId = battler.attackSkillId(); ai.kind = "melee"; ai.reach = 1.5;
            }
            const near = gap <= ai.reach && (ai.kind === "melee" ? A.levelGap(character, to) <= A.LEVEL_REACH : sees || !!ai.lobbed);
            walled = near && !A.wayClear(fight, ai, character, to);
            const inReach = near && !walled;
            if (inReach && A.attackersOn(fight, st, target.id) < A.MAX_ATTACKERS) {
                character.turnTowardCharacter(to);
                ai.state = "windup";
                ai.timer = ai.kind === "melee" ? 22 : 28;
                const S = stage();
                if (S && S.flash) S.flash(character, ai.kind === "melee" ? [255, 80, 60, 150] : [255, 200, 80, 150], ai.timer);
                A.windupShow(fight, battler, character, ai.skillId, ai.timer);
                if (feed()) ReactorEvents.emit("fightWindup", { unitId: unit.id, targetId: target.id, frames: ai.timer });
                return;
            }
        } else if (ai.kind === "melee" ? gap <= ai.reach * 0.85 : sees && gap <= ai.reach) walled = !A.wayClear(fight, ai, character, to);
        // Where to stand: a shooter keeps its distance, a hurt one backs off, the rest close in.
        const keep = ai.kind === "melee" ? 0 : hurt ? Math.min(ai.reach * 0.9, 9) : preset === "ranged" ? 4 : 2.5;
        const above = A.groundOf(to) - A.groundOf(character);
        // One that fights hand to hand and stands under its target (up on a roof): the way up, where there is one it can
        // take; where there is none, out of the target's sight rather than standing under it.
        const spot = ai.kind === "melee" && above > A.LEVEL_REACH ? A.climbTo(fight, st, character, to) : null;
        ai.climb = !!spot;
        if (ai.kind === "melee" && above > A.LEVEL_REACH && !spot && gap < 6) ai.stuck = (ai.stuck || 0) + 1; else ai.stuck = 0;
        if (spot) {
            if (character.x === spot.x && character.y === spot.y) {
                ai.walk = false;
                if (!character.isMoving() && P) {
                    character.setDirection(spot.d);
                    try {
                        if (spot.kind === "ladder" && P.playStep) P.playStep(character, { kind: "ladder", d: spot.d, x: spot.tx, y: spot.ty, height: spot.to });
                        else P.tryMantle(character, spot.d, true);
                    } catch (error) { /* no way up after all */ }
                }
                return;
            }
            ai.walk = true; ai.walkAway = false; ai.walkX = spot.x; ai.walkY = spot.y;
        }
        else if (keep > 0 && gap < keep) { ai.walk = true; ai.walkAway = true; ai.walkX = to.x; ai.walkY = to.y; }
        else if (ai.stuck > 8 && sees) { ai.walk = true; ai.walkAway = true; ai.walkX = to.x; ai.walkY = to.y; }
        else if (ai.stuck > 8) ai.walk = false;
        // A shooter under a target it cannot see (the eave is in the way) backs off until it can.
        else if (ai.kind !== "melee" && !sees && above > A.LEVEL_REACH && gap < 10) { ai.walk = true; ai.walkAway = true; ai.walkX = to.x; ai.walkY = to.y; }
        else if (gap > ai.reach * 0.85 || (ai.kind !== "melee" && !sees) || walled) { ai.walk = true; ai.walkAway = false; ai.walkX = to.x; ai.walkY = to.y; }
        ai.heading = 0;
        if (ai.walk) {
            const moved = A.step(fight, unit, character, ai.walkX, ai.walkY, ai.walkAway, walled && !ai.walkAway);
            // Between thoughts it keeps on the way it was going; not along a way round, whose next step is its own.
            if (moved && !ai.route) ai.heading = character.direction();
            ai.refused = moved ? 0 : (ai.refused || 0) + 1;
            // A ledge in the way that the body can take: a low one is stepped onto as the player steps onto it (a pond's
            // rim from inside: nobody stays in the basin), a higher one hopped or pulled up after a target above. Asked
            // when the step has been refused for a moment, not at every thought (it reads the edges round the cell).
            if (!moved && ai.refused >= 2 && !ai.walkAway && P && !character.isMoving() && (ai.walkX !== character.x || ai.walkY !== character.y)) {
                const dx = ai.walkX - character.x, dy = ai.walkY - character.y;
                const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8);
                try {
                    const nx = $gameMap.roundXWithDirection(character.x, d), ny = $gameMap.roundYWithDirection(character.y, d);
                    if (P.stepUp && A.roomAt(fight, unit, character, nx, ny) && P.stepUp(character, d)) ai.stuck = 0;
                    else if (above > 0.4 && P.tryMantle && P.tryMantle(character, d, true)) ai.stuck = 0;
                } catch (error) { /* no way up here */ }
            }
        } else if (!character.isMoving()) character.turnTowardCharacter(to);
    };

    /**
     * Every way up near a target standing above the ground: cells from which a ledge within reach or a ladder leads to
     * its height or under it (an eave under the ridge it stands on), with the way to face there. Dear (it asks the edge
     * query round the target), so it is kept until the target changes cell.
     */
    A.climbSpots = function(to) {
        const P = root.ReactorPhysics, spots = [];
        if (!P || !P.edges || !P.levelsAt || !A.is3D()) return spots;
        const top = A.groundOf(to), reach = A.CLIMB_SEARCH;
        for (let y = to.y - reach; y <= to.y + reach; y++) for (let x = to.x - reach; x <= to.x + reach; x++) {
            if (!$gameMap.isValid(x, y)) continue;
            for (const level of P.levelsAt($dataMap, x, y)) {
                if (!level.stand || level.top > top - A.LEVEL_REACH) continue;
                for (const d of [2, 4, 6, 8]) {
                    if (!$gameMap.isPassable(x, y, d)) continue;
                    let options;
                    try { options = P.edges($dataMap, x, y, d, level.top); } catch (error) { continue; }
                    for (const option of options) {
                        if (option.kind !== "mantle" && option.kind !== "ladder") continue;
                        if (!(option.to > level.top + 1.2) || option.to > top + 0.6) continue;
                        if (!$gameMap.isPassable(option.x, option.y, 10 - d)) continue;
                        spots.push({ x, y, d, kind: option.kind, from: level.top, to: option.to, tx: option.x, ty: option.y,
                            far: Math.hypot(option.x - to.x, option.y - to.y) });
                        break;
                    }
                }
            }
        }
        return spots;
    };

    /** The way up a unit should take to a target above it: the spot on its own level nearest the two of them, or null. */
    A.climbTo = function(fight, st, character, to) {
        const key = $gameMap.mapId() + ":" + to.x + "," + to.y + "," + Math.round(A.groundOf(to) * 2);
        let known = climbs.get(to);
        if (!known || known.key !== key) {
            // A target that moves is searched for again no more than twice a second, and the battle searches once a
            // quarter second: until then the last answer for it stands.
            if (known && st.clock - known.at < 30) { /* the last answer */ }
            else if (st.clock - (A._climbAt || -99) < 15 && st.clock >= (A._climbAt || 0)) return known ? A.climbPick(known, character) : null;
            else { A._climbAt = st.clock; climbs.set(to, known = { key, at: st.clock, spots: A.climbSpots(to) }); }
        }
        return A.climbPick(known, character);
    };
    const climbs = new WeakMap();
    A.climbPick = function(known, character) {
        const ground = A.groundOf(character);
        let best = null, least = Infinity;
        for (const spot of known.spots) {
            if (Math.abs(spot.from - ground) > 1.5) continue;
            const cost = spot.far + Math.hypot(spot.x - character.x, spot.y - character.y) * 0.6;
            if (cost < least) { least = cost; best = spot; }
        }
        return best;
    };

    /** How many units are winding up or striking at a unit right now. */
    A.attackersOn = function(fight, st, targetId) {
        let count = 0;
        for (const unit of fight._units) {
            const other = st.ai[unit.id];
            if (!other || other.targetId !== targetId || !(other.state === "windup" || other.state === "recover" && other.timer > 12)) continue;
            // One that fell or left mid-blow keeps the state it had, and holds nobody off.
            if (fight.isAlive(unit)) count++;
        }
        return count;
    };

    /** The wind-up is over: the blow, the shot or the skill. */
    A.strike = function(fight, st, unit, character, battler, ai) {
        const target = fight.unit(ai.targetId);
        ai.state = "recover";
        ai.timer = 24;
        ai.cool = Math.max(80, 170 - Math.round(battler.agi / 3)) + Math.floor(Math.random() * 50);
        // (Nor at one who came over to its side while it wound up.)
        if (!target || !fight.isAlive(target) || target.team === unit.team) return;
        const to = fight.character(target);
        const item = (typeof $dataSkills !== "undefined" && $dataSkills[ai.skillId]) || $dataSkills[battler.attackSkillId()];
        if (!item || !battler.canUse(item)) return;
        const action = new Game_Action(battler);
        action.setSkill(item.id);
        battler.useItem(item);
        if (ai.kind === "shot") {
            // A bolt that flies toward where the target stands now: step aside and it passes.
            const profile = battler.isActor() ? A.profile(battler) : A._bolt || (A._bolt = { weaponId: 0, ranged: true, projectile: "bolt", pellets: 1, speed: A.PROJECTILES.bolt, range: 14, damage: 1, blast: 0 });
            const flat = !A.is3D();
            const m = A.shotFrom(character, A._from || (A._from = {}), flat);
            let dx = to._realX + 0.5 - m.ox, dy = A.groundOf(to) + A.heightOf(to) * 0.55 - m.oy, dz = to._realY + 0.5 - m.oz;
            if (flat) dy = 0;
            const length = Math.hypot(dx, dy, dz) || 1;
            const flying = profile.speed > 0 ? profile : Object.assign({}, profile, { speed: A.PROJECTILES.bolt, projectile: "bolt" });
            // One attack's worth the shot: of a weapon that fires several at once (a shotgun), a pellet lands its share.
            A.fire(fight, unit, Object.assign({}, flying, { range: Math.max(flying.range, ai.reach + 3), damage: 1 / Math.max(1, flying.pellets || 1) }), item.id, m.ox, m.oy, m.oz, dx / length, dy / length, dz / length, flat, 2);
            fight.playMotion(character, "attack");
            if (typeof SoundManager !== "undefined" && SoundManager.playEnemyAttack) SoundManager.playEnemyAttack();
            return;
        }
        const targets = fight.actionTargets(unit, action, target);
        A.startRun(fight, unit, action, targets, ai.kind === "melee" ? { reach: ai.reach + 0.1 } : { aimed: true, lobbed: !!ai.lobbed });
    };

    /**
     * Which sides the map's pages wait for to enter an area (`{ ally, enemy }`): asked once a battle, so on a map
     * with no such page a walk costs nothing.
     */
    A.enterHooks = function(fight) {
        const kept = A._enters || (A._enters = { serial: -1, map: null, ally: false, enemy: false });
        const map = typeof $dataMap !== "undefined" ? $dataMap : null;
        if (kept.serial === fight._serial && kept.map === map) return kept;
        kept.serial = fight._serial; kept.map = map; kept.ally = kept.enemy = false;
        for (const event of $gameMap.events()) {
            const data = event && event.event ? event.event() : null;
            for (const page of (data && data.pages) || []) {
                const hook = F.pageHook(page);
                if (!hook || hook.on !== "unitEnters") continue;
                if (hook.team !== "enemy") kept.ally = true;
                if (hook.team !== "ally") kept.enemy = true;
            }
        }
        return kept;
    };

    //-------------------------------------------------------------------------
    // The frame.

    A.update = function(fight) {
        const st = fight.act();
        A._ran = true;
        if (st.stop > 0) {
            // The instant a blade lands: nothing moves on, and a click made now still counts.
            st.stop--;
            if (In.triggered("attack") && st.player.swing) st.player.buffered = true;
            In.endFrame();
            return;
        }
        st.clock++;
        // A "turn" for what counts turns: hooks, states, a Survive goal.
        if (st.clock % A.TURN_FRAMES === 0) {
            fight._turn++;
            fight.syncTroop();
            fight.fireHooks("turnStart", { turn: fight._turn, team: "any" });
            if (feed()) ReactorEvents.emit("mapBattleTurnStart", { turn: fight._turn });
            for (const unit of fight._units) {
                if (unit.gone || !fight.isAlive(unit)) continue;
                const battler = fight.battler(unit);
                // Nobody's actions end here as they do in a battle of turns: the turn ends them, so a state that
                // wears off at Action End and a buff whose turns have run out go with it.
                battler.onAllActionsEnd();
                battler.onTurnEnd();
                if (battler.isDead()) fight.defeat(unit);
            }
            fight.fireHooks("turnEnd", { turn: fight._turn, team: "any" });
            st.rev++;
            fight.checkOutcome(true);
            if (fight._ending) return;
        }
        A.updatePlayer(fight, st);
        const p = st.player;
        if (p.aim) A.placeAimAt($gamePlayer);
        else if (p.raised > 0 && --p.raised === 0) A.holdAim(fight, $gamePlayer, false);
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null, playerUnit = fight.playerUnit();
        const enters = A.enterHooks(fight);
        A._thinks = 0;
        for (const unit of fight._units) {
            if (unit.gone || unit.team === "neutral") continue;
            if (!fight.isAlive(unit)) {
                // Fallen by something other than a blow (an event's command, poison on the walk): it falls as any other does.
                if (!unit.defeated && !unit.down) { const fallen = fight.battler(unit); if (fallen && fallen.isDead()) fight.defeat(unit); }
                continue;
            }
            // A party member brought back can fall again.
            if (unit.defeated) fight.raise(unit);
            const character = fight.character(unit), battler = fight.battler(unit);
            // Whoever has come onto another cell, the player too: the pages that run when a unit enters an area.
            if (enters[unit.team]) fight.checkEnterHooks(unit, character);
            if (unit === playerUnit) continue;
            A.updateUnit(fight, st, unit, character, battler, A.aiOf(fight, st, unit, character), player);
        }
        for (let i = st.runs.length - 1; i >= 0; i--) {
            const entry = st.runs[i];
            if (entry.done || !A.updateRun(fight, entry)) st.runs.splice(i, 1);
        }
        A.updateShots(fight, st);
        In.endFrame();
        // Someone fell since the outcome was last judged (in this frame, or by a HUD's own button between frames).
        if (st.defeats !== st.judged) { st.judged = st.defeats; fight.checkOutcome(); }
    };

    //-------------------------------------------------------------------------
    // What a HUD reads.

    const hud = { unitId: 0, name: "", hp: 0, mhp: 0, mp: 0, mmp: 0, tp: 0,
        weapon: { id: 0, name: "", iconIndex: 0, ranged: false, index: 0, count: 0 },
        ammo: { magazine: 0, capacity: 0, reserve: null, reload: 0 },
        crosshair: { x: 0, y: 0, spread: 0, aiming: false, onTarget: false, hit: 0, kill: 0 },
        target: null, hotbar: [], enemies: [], damage: { pulse: 0, angle: null }, combo: 0, guarding: false, dodging: false, objective: "", mouseFree: false, notice: "" };
    const hudTarget = { unitId: 0, name: "", hp: 0, mhp: 0, team: "", locked: false, x: 0, y: 0, visible: false };
    let hudRev = -1;

    // Which opponents the player's eyes reach (the head, else the chest), for the HUD: a few are looked for each
    // battle frame and the answer kept a third of a second, so twenty bars are not twenty lines a frame.
    const seenBy = new Map();
    let seenClock = -1, seenLeft = 0;
    A.seen = function(fight, st, unit, character) {
        if (!character) return false;
        if (!A.deep()) return true;
        if (st.clock !== seenClock) { seenClock = st.clock; seenLeft = A.SEEN_BUDGET; }
        let entry = seenBy.get(unit.id);
        if (!entry) seenBy.set(unit.id, entry = { serial: -1, at: -1e9, seen: false });
        if (entry.serial !== fight._serial) { entry.serial = fight._serial; entry.at = -1e9; entry.seen = false; }
        const age = st.clock - entry.at;
        if ((age >= A.SEEN_FRAMES || age < 0) && seenLeft > 0) {
            seenLeft--;
            entry.at = st.clock;
            entry.seen = A.lineOpen(fight, $gamePlayer, A.EYE, character, A.HEAD, true) || A.lineOpen(fight, $gamePlayer, A.EYE, character, A.CHEST, true);
        }
        return entry.seen;
    };

    Game_Fight.prototype.actionHud = function() {
        if (!this.isAction()) return null;
        const st = this.act(), p = st.player, unit = this.playerUnit(), battler = unit && this.battler(unit);
        if (!battler) return hud;
        const profile = A.profile(battler);
        hud.unitId = unit.id; hud.name = battler.name();
        hud.hp = battler.hp; hud.mhp = battler.mhp; hud.mp = battler.mp; hud.mmp = battler.mmp; hud.tp = battler.tp;
        if (hudRev !== st.rev) {
            hudRev = st.rev;
            const weapons = battler.isActor() ? A.weaponsOf(battler) : [];
            const weapon = battler.isActor() ? battler.weapons()[0] || null : null;
            hud.weapon.id = weapon ? weapon.id : 0; hud.weapon.name = weapon ? weapon.name : ""; hud.weapon.iconIndex = weapon ? weapon.iconIndex : 0;
            hud.weapon.ranged = profile.ranged; hud.weapon.index = 0; hud.weapon.count = weapons.length;
            const bar = battler.isActor() ? A.hotbarOf(battler) : [];
            hud.hotbar.length = bar.length;
            for (let i = 0; i < bar.length; i++) {
                const item = bar[i], skill = DataManager.isSkill(item);
                const slot = hud.hotbar[i] || (hud.hotbar[i] = {});
                slot.slot = i + 1; slot.kind = skill ? "skill" : "item"; slot.id = item.id; slot.name = item.name; slot.iconIndex = item.iconIndex;
                slot.key = (skill ? "s" : "i") + item.id; slot.usable = battler.canUse(item); slot.cooldown = 0;
            }
            hud.objective = this.objectiveText ? this.objectiveText() : "";
        }
        for (const slot of hud.hotbar) slot.cooldown = p.hot[slot.key] > 0 ? p.hot[slot.key] / ((p.hotTotal && p.hotTotal[slot.key]) || 120) : 0;
        hud.ammo.capacity = profile.magazine;
        hud.ammo.magazine = profile.magazine > 0 ? (p.mags[profile.weaponId] === undefined ? profile.magazine : p.mags[profile.weaponId]) : 0;
        hud.ammo.reload = p.reload > 0 ? 1 - p.reload / (p.reloadTotal || 1) : 0;
        // The crosshair: where it sits, how wide the shot may stray there, whether an opponent is under it.
        const spread = profile.ranged ? (p.aim ? profile.aimSpread : profile.spread) : 0;
        const camera = A.camera();
        const fov = camera && camera.fov ? camera.fov : 45;
        hud.crosshair.x = aim.sx; hud.crosshair.y = aim.sy;
        hud.crosshair.spread = A.relative() ? Math.max(3, Math.tan(spread * DEG) / Math.tan(fov * DEG / 2) * Graphics.height / 2) : 6 + spread * 2;
        hud.crosshair.aiming = p.aim;
        hud.crosshair.hit = p.hitMark; hud.crosshair.kill = p.killMark;
        // An opponent is under the crosshair only where a shot would reach it: on the line the shot takes, as far
        // as the world lets that line go. One behind a wall, a shut door or a pillar is not.
        const range = profile.ranged ? profile.range : profile.reach + 1;
        let under = null;
        if (aim.eye) under = aim.under && aim.underT <= range ? this.unit(aim.under) : null;
        else {
            const open = A.rayWorld(aim.ox, aim.oy, aim.oz, aim.dx, aim.dy, aim.dz, range, aim.flat);
            under = A.rayUnits(this, aim.ox, aim.oy, aim.oz, aim.dx, aim.dy, aim.dz, open, F.oppose(unit.team), aim.flat, unit);
        }
        if (under && !this.isAlive(under)) under = null;
        aim.target = under ? under.id : 0;
        hud.crosshair.onTarget = !!under;
        // The bar at the top: who is under the crosshair, or who is locked while the eye can see it.
        const locked = p.lock ? this.unit(p.lock) : null;
        const shown = locked ? (locked === under || A.seen(this, st, locked, this.character(locked)) ? locked : null) : under;
        if (shown && this.isAlive(shown)) {
            const other = this.battler(shown);
            const at = this.character(shown), mark = A.screenOf(at._realX + 0.5, A.groundOf(at) + A.heightOf(at) * 0.6, at._realY + 0.5);
            hudTarget.x = mark ? mark.x : 0; hudTarget.y = mark ? mark.y : 0; hudTarget.visible = !!mark && mark.visible !== false;
            hudTarget.unitId = shown.id; hudTarget.name = other.name(); hudTarget.hp = other.hp; hudTarget.mhp = other.mhp; hudTarget.team = shown.team; hudTarget.locked = shown.id === p.lock;
            hud.target = hudTarget;
        } else hud.target = null;
        // Opponents near enough for a bar over the head.
        let count = 0;
        const self = $gamePlayer;
        for (const other of this._units) {
            if (other.gone || other.team !== F.oppose(unit.team) || !this.isAlive(other)) continue;
            const character = this.character(other);
            if (count >= 24 || Math.abs(character._realX - self._realX) + Math.abs(character._realY - self._realY) > 16) continue;
            const entry = hud.enemies[count] || (hud.enemies[count] = {});
            const foe = this.battler(other), point = A.screenOf(character._realX + 0.5, A.groundOf(character) + A.heightOf(character) + 0.25, character._realY + 0.5);
            entry.unitId = other.id; entry.hp = foe.hp; entry.mhp = foe.mhp;
            // A bar only over one the eye can see: none on a wall with someone behind it.
            entry.x = point ? point.x : 0; entry.y = point ? point.y : 0;
            entry.visible = !!point && point.visible !== false && (other === under || A.seen(this, st, other, character));
            entry.alerted = !!(st.ai[other.id] && st.ai[other.id].alert);
            count++;
        }
        hud.enemies.length = count;
        hud.notice = A.noticeNow && A.noticeNow.frames > 0 ? A.noticeNow.text : "";
        hud.damage.pulse = p.pulse;
        hud.damage.angle = p.pulseAngle === null || p.pulseAngle === undefined ? null : p.pulseAngle - (A.relative() ? aim.yaw : 0);
        hud.combo = p.swing ? p.swing.step : 0;
        hud.guarding = p.guard; hud.dodging = p.dodge > 0;
        if (hud.mouseFree !== !!A.mouseFree) { hud.mouseFree = !!A.mouseFree; st.rev++; }
        return hud;
    };

    if (!Game_Fight.prototype.objectiveText) {
        Game_Fight.prototype.objectiveText = function() {
            const goal = this._options && this._options.objective;
            if (goal && goal.type === "survive") return "Survive " + goal.turns + " turns";
            return goal && goal.type !== "defeatAll" ? "" : "Defeat all enemies";
        };
    }

    //-------------------------------------------------------------------------
    // What flies and flashes, drawn with the Action Sequence stage's own bodies.

    A.fx = [];

    /** A shot that lands at once: a streak from the muzzle to where it struck, gone in a few frames. */
    A.tracer = function(x0, y0, z0, x1, y1, z1) {
        const S = stage();
        if (!S || !S.makeBody || typeof SceneManager === "undefined") return;
        const distance = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        A.addFx({ id: 0, life: 0, frames: clamp(Math.round(distance / 3), 2, 7), x0, y0, z0, x1, y1, z1 });
    };

    A.addFx = function(entry) {
        const S = stage();
        const step = { type: "projectile", iconSource: "color", color: entry.color || "#ffd866", size: 8, arc: 0, spin: 0, rotation: 0, flight: "straight" };
        const flight = { step, live: true, t: 0, duration: 6, rotation: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 }, body: null, sprite: null };
        try {
            flight.body = S.makeBody(step, null, null);
            if (!flight.body && S.makeSprite) flight.sprite = S.makeSprite(step, null, null);
        } catch (error) { flight.body = null; flight.sprite = null; }
        if (!flight.body && !flight.sprite) return;
        entry.flight = flight;
        A.fx.push(entry);
    };

    A.burst = function(x, y, z) {
        // A rocket's burst: the first animation the project has that is an explosion by name, else none.
        if (typeof $dataAnimations === "undefined" || typeof $gameMap === "undefined") return;
        const found = A._burstId !== undefined ? A._burstId : (A._burstId = ($dataAnimations.find(a => a && /explo|blast|burst/i.test(a.name)) || { id: 0 }).id);
        if (!(found > 0)) return;
        // Where it burst, whoever stands there or nobody: on a spot of its own that the stage plays it at.
        const S = stage();
        if (S && S.animate && S.groundOf && typeof Game_Character !== "undefined") {
            try {
                const spot = new Game_Character();
                spot._realX = x - 0.5; spot._realY = z - 0.5; spot._x = Math.floor(x); spot._y = Math.floor(z);
                spot._reactorGround = y;
                // At the burst's own height, whatever the spot's cell calls its ground (a cell with a wall on it
                // reads as the wall's top: the burst is not up there).
                if (S.animate(spot, found, "body", y - S.groundOf(spot))) return;
            } catch (error) { /* the cell's own event, below */ }
        }
        const near = $gameMap.eventsXy(Math.floor(x), Math.floor(z))[0] || null;
        if (near) $gameTemp.requestAnimation([near], found);
    };

    // Where a shot met the world: a spark that shrinks away in a few frames and a small dark mark that stays a
    // while, each a body in the map's own scene (walls hide them as they hide a tracer). A fixed few are made once
    // for a scene and used in turn, so held fire makes no objects.
    const marks = { scene: null, list: [], next: 0, live: 0, parts: null };
    /** A spark and a mark where a shot going (dx, dy, dz) met the world at (x, y, z): the mark half sunk in what it struck, the spark just off it. */
    A.impact = function(x, y, z, dx, dy, dz) {
        const S = stage(), scene = S && S.mapScene ? S.mapScene() : null;
        if (!scene || typeof THREE === "undefined") return false;
        if (marks.scene !== scene) {
            const T = THREE;
            const parts = marks.parts || (marks.parts = { shape: new T.IcosahedronGeometry(1, 2),
                spark: new T.MeshBasicMaterial({ color: "#ffdf9a", transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, fog: false }),
                dot: new T.MeshBasicMaterial({ color: "#14110e", fog: false }) });
            parts.spark.toneMapped = false;
            marks.scene = scene; marks.list.length = 0; marks.next = 0; marks.live = 0;
            for (let i = 0; i < A.MARKS; i++) {
                const spark = new T.Mesh(parts.shape, parts.spark), dot = new T.Mesh(parts.shape, parts.dot);
                spark.visible = dot.visible = false; spark.castShadow = dot.castShadow = false; spark.frustumCulled = dot.frustumCulled = false;
                scene.modelsGroup().add(spark, dot);
                marks.list.push({ spark, dot, life: -1, sparkSize: A.SPARK_SIZE, dotSize: A.MARK_SIZE });
            }
        }
        const mark = marks.list[marks.next];
        marks.next = (marks.next + 1) % marks.list.length;
        if (mark.life < 0) marks.live++;
        mark.life = 0;
        // Never larger in the picture than a spark and a bullet's mark are: struck from a step away they would
        // fill the view at their own size. What the eye is right against keeps no mark, only the spark.
        const camera = A.camera(), eye = camera && camera.position;
        const off = eye ? Math.hypot(x - eye.x, y - eye.y, z - eye.z) : Infinity;
        const span = eye ? off * Math.tan((camera.fov > 0 ? camera.fov : 45) * DEG / 2) : Infinity;
        mark.sparkSize = Math.min(A.SPARK_SIZE, span * A.SPARK_SHARE);
        mark.dotSize = off < A.MARK_NEAR ? 0 : Math.min(A.MARK_SIZE, span * A.MARK_SHARE);
        mark.dot.position.set(x, y, z);
        const back = Math.min(0.06, mark.sparkSize);
        mark.spark.position.set(x - (dx || 0) * back, y - (dy || 0) * back, z - (dz || 0) * back);
        mark.spark.scale.setScalar(mark.sparkSize); mark.dot.scale.setScalar(mark.dotSize);
        mark.spark.visible = true; mark.dot.visible = mark.dotSize > 0;
        return true;
    };

    /** A frame of those marks: the spark shrinks away, the mark stays its time and shrinks out. */
    A.updateMarks = function() {
        const S = stage(), scene = S && S.mapScene ? S.mapScene() : null;
        // A scene that is gone took its bodies with it.
        if (marks.scene !== scene) { marks.scene = null; marks.list.length = 0; marks.live = 0; return; }
        for (const mark of marks.list) {
            if (mark.life < 0) continue;
            const life = ++mark.life;
            if (life <= A.SPARK_FRAMES) mark.spark.scale.setScalar(mark.sparkSize * (1 - life / (A.SPARK_FRAMES + 1)));
            else mark.spark.visible = false;
            const left = A.MARK_FRAMES - life;
            if (left <= 0) { mark.dot.visible = false; mark.life = -1; marks.live--; }
            else if (left < 20) mark.dot.scale.setScalar(mark.dotSize * left / 20);
        }
    };
    A.marks = marks;

    A.dropFx = function(id) {
        for (let i = A.fx.length - 1; i >= 0; i--) if (A.fx[i].id === id && id) A.removeFx(i);
    };

    A.removeFx = function(index) {
        const entry = A.fx[index], S = stage();
        A.fx.splice(index, 1);
        try { if (S && S.dropOverlay) S.dropOverlay(entry.flight); } catch (error) { /* gone with the scene */ }
    };

    A.dropAllFx = function() {
        for (let i = A.fx.length - 1; i >= 0; i--) A.removeFx(i);
    };

    /** Places what flies for this frame: a tracer's head along its line, a flying thing where its shot is. */
    A.drawFx = function() {
        const S = stage(), fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!S) return;
        const st = fight && fight._action;
        // A flying shot gets its body the first time it is seen (a save loads without them).
        if (st) for (const shot of st.shots) {
            if (!A.fx.some(entry => entry.id === shot.id)) A.addFx({ id: shot.id, life: 0, frames: 0, color: shot.kind === "rocket" ? "#ff8a3c" : shot.kind === "arrow" ? "#e8e0c8" : "#ff5a4c" });
        }
        const point = A._fxScreen || (A._fxScreen = {});
        for (let i = A.fx.length - 1; i >= 0; i--) {
            const entry = A.fx[i], flight = entry.flight;
            let x, y, z, dx, dy, dz;
            if (entry.id) {
                const shot = st && st.shots.find(candidate => candidate.id === entry.id);
                if (!shot) { A.removeFx(i); continue; }
                x = shot.x; y = shot.y; z = shot.z; dx = shot.dx; dy = shot.dy; dz = shot.dz;
                flight.duration = 6;
            } else {
                if (++entry.life > entry.frames) { A.removeFx(i); continue; }
                const t = entry.life / entry.frames;
                dx = entry.x1 - entry.x0; dy = entry.y1 - entry.y0; dz = entry.z1 - entry.z0;
                x = entry.x0 + dx * t; y = entry.y0 + dy * t; z = entry.z0 + dz * t;
                flight.duration = entry.frames;
            }
            // The stage's own frame: tiles from the cell's corner, the height last.
            flight.point.x = x - 0.5; flight.point.y = z - 0.5; flight.point.z = y;
            flight.from.x = x - dx - 0.5; flight.from.y = z - dz - 0.5; flight.from.z = y - dy;
            flight.to.x = x + dx - 0.5; flight.to.y = z + dz - 0.5; flight.to.z = y + dy;
            flight.t = 0.99; flight.live = true;
            if (flight.body) { S.placeBody(flight); continue; }
            const sprite = flight.sprite, at = S.screenOf(flight.point.x, flight.point.y, flight.point.z, point);
            sprite.visible = at.visible !== false;
            sprite.x = at.x; sprite.y = at.y;
            const ahead = S.screenOf(flight.to.x, flight.to.y, flight.to.z, A._fxAhead || (A._fxAhead = {}));
            sprite.rotation = Math.atan2(ahead.y - at.y, ahead.x - at.x);
        }
    };

    //-------------------------------------------------------------------------
    // The built-in HUD: a crosshair, the player's bars, the magazine, the hotbar,
    // the opponent under the crosshair, a hit marker and a flash when hurt. A real
    // one (a User Interfaces record) turns it off: ReactorFight.stockActionHud = false.

    // The line that says how to take the mouse back, whichever HUD is drawn: `ReactorFight.Action.promptText`, or
    // `System.json › reactorBattle.terms.takeMouse`; a HUD that writes it itself sets `ReactorFight.Action.Prompt.off`.
    /** Free the bitmaps the driver drew for a sprite and everything under it (its own small HUD, the mouse line). */
    function freePictures(object) {
        if (!object) return;
        const bitmap = object._bitmap;
        if (bitmap && bitmap._rrAction && bitmap.destroy) { bitmap._rrAction = false; try { bitmap.destroy(); } catch (error) { /* already gone */ } }
        if (object.children) for (let i = 0; i < object.children.length; i++) freePictures(object.children[i]);
    }
    A.freePictures = freePictures;
    /** A bitmap of the driver's own, to be freed with the sprite that shows it. */
    function ownBitmap(width, height) { const bitmap = new Bitmap(width, height); bitmap._rrAction = true; return bitmap; }

    A.promptText = "Click to take the mouse";
    const Prompt = A.Prompt = {
        sprite: null, text: "", off: false,
        hide() {
            if (this.sprite && this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
            // The picture goes with the sprite: a sprite's own destruction leaves its bitmap with the graphics card.
            freePictures(this.sprite);
            if (this.sprite && this.sprite.destroy) this.sprite.destroy({ children: true });
            this.sprite = null; this.text = "";
        },
        update(scene) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            const on = !this.off && !!fight && fight.isAction() && fight.isHere() && !fight._ending && !!A.mouseFree;
            if (!on) { if (this.sprite) this.hide(); return; }
            let terms = null;
            try { terms = F.systemSettings ? F.systemSettings().terms : null; } catch (error) { terms = null; }
            const text = String((terms && terms.takeMouse) || A.promptText);
            if (!this.sprite || this.sprite.parent !== scene || this.text !== text) {
                this.hide();
                const sprite = new Sprite(ownBitmap(480, 40));
                sprite.bitmap.fontSize = 20;
                sprite.bitmap.fillRect(0, 4, 480, 32, "rgba(0,0,0,0.5)");
                sprite.bitmap.drawText(text, 0, 4, 480, 32, "center");
                sprite.anchor.set(0.5, 0.5);
                scene.addChild(sprite);
                this.sprite = sprite; this.text = text;
            }
            this.sprite.x = Math.round(Graphics.width / 2); this.sprite.y = Math.round(Graphics.height * 0.62);
        }
    };

    // A line the battle says to the player (who leads now that the leader fell: A.notice), over the upper middle of
    // the view for a few seconds, in the game's own font, whichever HUD is drawn. A HUD that writes it itself (it
    // is `actionHud().notice`) sets `ReactorFight.Action.Notice.off`.
    const Notice = A.Notice = {
        sprite: null, text: "", off: false, shown: 0,
        hide() {
            if (this.sprite && this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
            freePictures(this.sprite);
            if (this.sprite && this.sprite.destroy) this.sprite.destroy({ children: true });
            this.sprite = null; this.text = ""; this.shown = 0;
        },
        update(scene) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null, now = A.noticeNow;
            const on = !!now && now.frames > 0 && !!fight && fight.isAction() && fight.isHere();
            if (!on) { if (this.sprite) this.hide(); if (now) A.noticeNow = null; return; }
            now.frames--;
            if (this.off) { if (this.sprite) this.hide(); return; }
            if (!this.sprite || this.sprite.parent !== scene || this.text !== now.text) {
                this.hide();
                // As large as a heading on any screen: a thirtieth of its height.
                const size = clamp(Math.round(Graphics.height / 30), 22, 44), width = Math.min(Graphics.width - 40, size * 30), height = size + 28;
                const sprite = new Sprite(ownBitmap(width, height)), bitmap = sprite.bitmap;
                if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.mainFontFace) bitmap.fontFace = $gameSystem.mainFontFace();
                bitmap.fontSize = size;
                // A dark band that fades out to both sides, so the line reads over any ground.
                bitmap.gradientFillRect(0, 6, width / 2, height - 12, "rgba(0,0,0,0)", "rgba(0,0,0,0.7)");
                bitmap.gradientFillRect(width / 2, 6, width / 2, height - 12, "rgba(0,0,0,0.7)", "rgba(0,0,0,0)");
                bitmap.outlineColor = "rgba(0,0,0,0.9)"; bitmap.outlineWidth = 5;
                bitmap.drawText(now.text, 0, 6, width, height - 12, "center");
                sprite.anchor.set(0.5, 0.5);
                scene.addChild(sprite);
                this.sprite = sprite; this.text = now.text; this.shown = 0;
            }
            this.shown++;
            this.sprite.x = Math.round(Graphics.width / 2); this.sprite.y = Math.round(Graphics.height * 0.24);
            // In over a few frames, out over the last third of a second.
            this.sprite.opacity = Math.round(255 * Math.min(1, this.shown / 8, now.frames / 20));
        }
    };

    const Hud = A.Hud = {
        layer: null, parts: null, keys: {},
        hide() {
            if (this.layer && this.layer.parent) this.layer.parent.removeChild(this.layer);
            freePictures(this.layer);
            if (this.layer && this.layer.destroy) this.layer.destroy({ children: true });
            this.layer = null; this.parts = null; this.keys = {};
        },
        make(scene) {
            const layer = new Sprite();
            const part = (width, height) => { const sprite = new Sprite(ownBitmap(width, height)); layer.addChild(sprite); return sprite; };
            this.parts = { cross: part(96, 96), bars: part(260, 62), ammo: part(220, 44), hot: part(8 * 44, 48), target: part(280, 40), hurt: part(64, 64) };
            this.parts.cross.anchor.set(0.5, 0.5);
            this.parts.hurt.bitmap.fillAll("#c01818");
            this.parts.hurt.scale.set(Graphics.width / 64, Graphics.height / 64);
            this.parts.hurt.opacity = 0;
            layer.addChildAt(this.parts.hurt, 0);
            scene.addChild(layer);
            this.layer = layer;
            this.keys = {};
        },
        bar(bitmap, x, y, width, height, rate, color) {
            bitmap.fillRect(x, y, width, height, "rgba(0,0,0,0.55)");
            bitmap.fillRect(x + 1, y + 1, Math.round((width - 2) * clamp(rate, 0, 1)), height - 2, color);
        },
        update(scene) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            const on = !!fight && fight.isAction() && fight.isHere() && F.stockActionHud !== false && !fight._ending;
            if (!on) { if (this.layer) this.hide(); return; }
            const data = fight.actionHud();
            if (!data || !data.unitId) return;
            if (!this.layer || this.layer.parent !== scene) { this.hide(); this.make(scene); }
            const parts = this.parts, keys = this.keys, width = Graphics.width, height = Graphics.height;
            // The crosshair: four ticks that open with the spread, red over an opponent, an X when a hit lands.
            const c = data.crosshair, gap = Math.min(40, Math.round(c.spread));
            const crossKey = gap + (c.onTarget ? "t" : "") + (c.hit > 0 ? "h" : "") + (c.kill > 0 ? "k" : "") + (data.weapon.ranged ? "r" : "m");
            if (keys.cross !== crossKey) {
                keys.cross = crossKey;
                const b = parts.cross.bitmap, m = 48, color = c.onTarget ? "#ff5a4c" : "#ffffff";
                b.clear();
                if (data.weapon.ranged) {
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const x = m + dx * (gap + 2) - (dx ? (dx > 0 ? 0 : 8) : 1), y = m + dy * (gap + 2) - (dy ? (dy > 0 ? 0 : 8) : 1);
                        b.fillRect(x - 1, y - 1, (dx ? 8 : 2) + 2, (dy ? 8 : 2) + 2, "rgba(0,0,0,0.6)");
                        b.fillRect(x, y, dx ? 8 : 2, dy ? 8 : 2, color);
                    }
                }
                b.fillRect(m - 2, m - 2, 4, 4, "rgba(0,0,0,0.6)");
                b.fillRect(m - 1, m - 1, 2, 2, color);
                if (c.hit > 0) {
                    const mark = c.kill > 0 ? "#ff3020" : "#ffffff";
                    for (let i = 6; i < 14; i++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.fillRect(m + sx * i - 1, m + sy * i - 1, 2, 2, mark);
                }
            }
            parts.cross.x = Math.round(c.x); parts.cross.y = Math.round(c.y);
            // The player's bars, lower left.
            const barsKey = data.hp + "/" + data.mhp + "/" + data.mp + "/" + data.tp + "/" + (data.guarding ? "g" : "");
            if (keys.bars !== barsKey) {
                keys.bars = barsKey;
                const b = parts.bars.bitmap;
                b.clear();
                b.fontSize = 16;
                this.bar(b, 0, 0, 260, 20, data.mhp ? data.hp / data.mhp : 0, data.guarding ? "#7fb8ff" : "#e8a030");
                b.drawText(data.hp + " / " + data.mhp, 6, 0, 248, 20, "left");
                this.bar(b, 0, 24, 200, 12, data.mmp ? data.mp / data.mmp : 0, "#3fa0e8");
                this.bar(b, 0, 40, 200, 10, data.tp / 100, "#48c060");
            }
            parts.bars.x = 20; parts.bars.y = height - 84;
            // The magazine, lower right.
            const reload = Math.round(data.ammo.reload * 20);
            const ammoKey = data.weapon.id + ":" + data.ammo.magazine + "/" + data.ammo.capacity + ":" + reload + ":" + data.combo;
            if (keys.ammo !== ammoKey) {
                keys.ammo = ammoKey;
                const b = parts.ammo.bitmap;
                b.clear();
                b.fontSize = 24;
                const text = data.weapon.ranged ? (data.ammo.capacity > 0 ? data.ammo.magazine + " / " + data.ammo.capacity : "∞") : data.combo > 0 ? "x" + data.combo : "";
                b.drawText(text, 0, 0, 220, 28, "right");
                b.fontSize = 14;
                b.drawText(data.weapon.name, 0, 26, 220, 18, "right");
                if (reload > 0) this.bar(b, 100, 22, 120, 5, data.ammo.reload, "#ffffff");
            }
            parts.ammo.x = width - 240; parts.ammo.y = height - 64;
            // The hotbar, bottom middle.
            let hotKey = "";
            for (const slot of data.hotbar) hotKey += slot.key + (slot.usable ? "" : "x") + Math.round(slot.cooldown * 12) + ",";
            if (keys.hot !== hotKey) {
                keys.hot = hotKey;
                const b = parts.hot.bitmap, icons = ImageManager.loadSystem("IconSet"), size = ImageManager.iconWidth || 32;
                b.clear();
                b.fontSize = 12;
                data.hotbar.forEach((slot, i) => {
                    const x = i * 44;
                    b.fillRect(x, 4, 40, 40, "rgba(0,0,0,0.55)");
                    if (icons.isReady()) b.blt(icons, slot.iconIndex % 16 * size, Math.floor(slot.iconIndex / 16) * size, size, size, x + 4, 8);
                    else keys.hot = "";
                    if (slot.cooldown > 0 || !slot.usable) b.fillRect(x, 4, 40, Math.round(40 * (slot.cooldown > 0 ? slot.cooldown : 1)), "rgba(0,0,0,0.6)");
                    b.drawText(String(slot.slot), x + 2, 2, 14, 14, "left");
                });
            }
            parts.hot.x = Math.round((width - data.hotbar.length * 44) / 2); parts.hot.y = height - 60;
            // The opponent under the crosshair, top middle.
            const t = data.target, targetKey = t ? t.unitId + ":" + t.hp + "/" + t.mhp + (t.locked ? "L" : "") : "";
            if (keys.target !== targetKey) {
                keys.target = targetKey;
                const b = parts.target.bitmap;
                b.clear();
                if (t) {
                    b.fontSize = 16;
                    b.drawText((t.locked ? "◆ " : "") + t.name, 0, 0, 280, 20, "center");
                    this.bar(b, 20, 24, 240, 10, t.mhp ? t.hp / t.mhp : 0, "#d83838");
                }
            }
            parts.target.x = Math.round((width - 280) / 2); parts.target.y = 56;
            parts.hurt.opacity = Math.round(110 * data.damage.pulse * data.damage.pulse);
        }
    };

    //-------------------------------------------------------------------------
    // Engine hooks.

    // In an action battle the player walks, runs and jumps as on the map; the battle moves everyone else.
    if (typeof Game_Player !== "undefined") {
        const canMove = Game_Player.prototype.canMove;
        Game_Player.prototype.canMove = function() {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            if (!fight || !fight.isAction() || !fight.isHere()) return canMove.call(this);
            if (fight._ending || fight.isBusy() || this.isMoveRouteForcing()) return false;
            if (this._vehicleGettingOn || this._vehicleGettingOff) return false;
            if (this.isInVehicle() && !this.vehicle().canMove()) return false;
            const unit = fight.playerUnit(), battler = unit && fight.battler(unit);
            if (!battler || !battler.isAlive() || !battler.canMove()) return false;
            // A swing is stood for: the feet stay planted until it is through.
            if (fight._action && fight._action.player.swing) return false;
            return !A.isActing(fight, unit.id);
        };
    }

    if (typeof Scene_Map !== "undefined") {
        // A click fires; it does not send the player walking, and the right button aims rather than opening the menu.
        const isMapTouchOk = Scene_Map.prototype.isMapTouchOk;
        Scene_Map.prototype.isMapTouchOk = function() {
            if (live()) return false;
            return isMapTouchOk.call(this);
        };
        const isMenuCalled = Scene_Map.prototype.isMenuCalled;
        Scene_Map.prototype.isMenuCalled = function() {
            if (live()) return Input.isTriggered("menu");
            return isMenuCalled.call(this);
        };
        const updateScene = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            updateScene.call(this);
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            // A battle loaded from a save, or one left behind by a scene change, takes or gives back its keys.
            if (fight && fight.isAction() && fight.isHere() && !A._entered) A.enter(fight);
            // (A battle kept running on the map the party left is not here: the map's own keys are the map's again.)
            else if (A._entered && !(fight && fight.isAction() && fight.isHere())) { A._entered = false; if (root.ReactorControls && root.ReactorControls.setAction) root.ReactorControls.setAction(false); }
            // (Back from another scene, which had the ordinary keys: the battle's again.)
            else if (A._entered && root.ReactorControls && root.ReactorControls.setAction) root.ReactorControls.setAction(true);
            if (fight && fight.isAction() && fight.isHere()) A.updateCapture(fight);
            if (typeof Sprite !== "undefined" && typeof Bitmap !== "undefined") { Hud.update(this); Prompt.update(this); Notice.update(this); }
        };
        const stopScene = Scene_Map.prototype.stop;
        Scene_Map.prototype.stop = function() {
            stopScene.call(this);
            In.reset();
            Hud.hide();
            Notice.hide();
            // The menu (or any other scene) gave the mouse back: the battle takes it again when the map returns.
            if (A._held && typeof $gameFight !== "undefined" && $gameFight && $gameFight.isAction()) A._retake = true;
            A._held = false;
        };
        // Another scene (the menu, the title) has its own use for the battle's keys and buttons: a pad's Cancel is the
        // battle's dodge, and nothing else on it would close the menu.
        const terminateScene = Scene_Map.prototype.terminate;
        Scene_Map.prototype.terminate = function() {
            if (root.ReactorControls && root.ReactorControls.setAction) root.ReactorControls.setAction(false);
            if (terminateScene) terminateScene.call(this);
            // What flies was drawn in this scene (once more as it ended) and ends with it: a shot still in the air
            // is drawn again by the scene that comes next, never placed on a sprite of the one that is gone.
            A.dropAllFx();
        };
    }

    if (typeof Spriteset_Map !== "undefined") {
        const updateSpriteset = Spriteset_Map.prototype.update;
        Spriteset_Map.prototype.update = function() {
            updateSpriteset.call(this);
            if (A.fx.length || (typeof $gameFight !== "undefined" && $gameFight && $gameFight._action && $gameFight._action.shots.length)) A.drawFx();
            if (marks.live > 0) A.updateMarks();
        };
    }

    //-------------------------------------------------------------------------
    // First person: the weapon in view. A copy of the weapon's bound model held
    // at the lower right of the eye, small and close, and drawn over the world
    // (in the nearest sliver of the depth range) so no wall, post or door the
    // eye stands against cuts it; lit by the scene as any model is. It has a
    // sway, a bob while walking, a kick for each shot, a dip while it reloads,
    // its top coming up under the crosshair on aim, and a blade crossing the
    // view for each swing. No arms are drawn.

    const View = A.View = {
        weaponId: -1, scene: null, pivot: null, object: null, template: null, ticket: 0, tip: null, flash: null, flashFrames: 0,
        kick: 0, phase: 0, bob: 0, pose: null, SCALE: 0.22, eye: null, sight: 0.4,
        /** The share of the depth range the weapon is drawn in: the world never comes that near the eye. */
        DEPTH: 0.02,
        /**
         * Drawn by the eye's own camera, a part of the weapon takes the near sliver of the depth range, and gives the
         * whole range back after: among its own parts it sorts as ever, and nothing of the world is in front of it.
         * Any other camera (a light's, a mirror's) sees it where it is.
         */
        nearBefore(renderer, scene, camera) {
            if (camera !== View.eye) return;
            renderer.getContext().depthRange(0, View.DEPTH);
            this.userData.rrNear = true;
        },
        nearAfter(renderer) {
            if (!this.userData.rrNear) return;
            this.userData.rrNear = false;
            renderer.getContext().depthRange(0, 1);
        },
        /** Every drawn part of the weapon in view (and its flash) is drawn over the world, after it. */
        overWorld(root) {
            root.traverse(child => {
                if (!child.isMesh && !child.isLine && !child.isPoints) return;
                child.onBeforeRender = View.nearBefore;
                child.onAfterRender = View.nearAfter;
                child.renderOrder = 6000;
                child.castShadow = false;
                child.frustumCulled = false;
            });
        },
        drop() {
            this.ticket++;
            const R = world3();
            if (this.pivot && this.pivot.parent) this.pivot.parent.remove(this.pivot);
            if (this.object && this.template && R && R.releaseModelInstance) { try { R.releaseModelInstance(this.object, this.template); } catch (error) { /* gone with the scene */ } }
            this.pivot = this.object = this.template = this.tip = this.flash = this.pose = null;
            this.weaponId = -1; this.scene = null;
        },
        load(scene, weapon) {
            const R = world3(), T = THREE;
            this.weaponId = weapon.id; this.scene = scene;
            const spec = R.databaseModelSpec ? R.databaseModelSpec("weapons", weapon.id) : null;
            if (!spec || !R.loadModel) return;
            const ticket = ++this.ticket;
            Promise.all([R.loadModel(spec.name, spec.ext, spec.file, spec.texture), R.loadModelSidecar(spec.name)]).then(([template, sidecar]) => {
                if (!template || ticket !== this.ticket || !scene._modelsGroup) return;
                const object = R.cloneModelTemplate(template);
                R.applyModelTransform(object, R.readModelTransform(sidecar, spec));
                const e = template.userData.glbSize || { x: 1, y: 1, z: 1 };
                object.scale.multiplyScalar((spec.size || 2) * (spec.scale || 1) / Math.max(e.x, e.y, e.z, 0.001));
                object.position.set(0, 0, 0);
                const rig = R.readHeldRig ? R.readHeldRig(sidecar) : null;
                if (rig) object.userData.__heldRig = rig;
                object.traverse(child => {
                    const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
                    for (const mat of mats) {
                        mat.__reactorModel = true; mat.fog = false;
                        if (mat.color && !mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
                        if (R.litMaterial) R.litMaterial(mat);
                        if (scene._materials && scene._materials.indexOf(mat) < 0) scene._materials.push(mat);
                    }
                    child.frustumCulled = false;
                });
                scene._ambientLevel = undefined;
                const pivot = new T.Group(), inner = new T.Group();
                inner.add(object); pivot.add(inner);
                pivot.updateMatrixWorld(true);
                // Which way it points and where it is held, as the hand that grips it reads them.
                const shape = R.heldShape ? R.heldShape(object) : null;
                const vec = a => new T.Vector3(a[0], a[1], a[2]);
                const axis = shape ? vec(shape.axis).applyQuaternion(object.quaternion).normalize() : new T.Vector3(0, 0, -1);
                const down = shape ? vec(shape.down).applyQuaternion(object.quaternion) : new T.Vector3(0, -1, 0);
                const back = axis.clone().negate(), up = down.clone().negate().addScaledVector(axis, down.dot(axis)).normalize();
                const right = new T.Vector3().crossVectors(up, back).normalize();
                inner.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right, up, back)).invert();
                const place = a => vec(a).multiply(object.scale).applyQuaternion(object.quaternion).applyQuaternion(inner.quaternion);
                const along = shape ? shape.grip * shape.length : 0;
                const grip = shape ? (shape.handle && shape.handle.at ? shape.handle.at : [0, 1, 2].map(i => shape.base[i] + shape.axis[i] * along)) : [0, 0, 0];
                inner.position.copy(place(grip)).negate();
                this.tip = shape ? place([0, 1, 2].map(i => shape.base[i] + shape.axis[i] * shape.length)).add(inner.position) : new T.Vector3(0, 0, -1);
                // How high its top (a scope, the sights) stands over the grip: on aim that comes up to just under the crosshair.
                pivot.updateMatrixWorld(true);
                const top = new T.Box3().setFromObject(pivot).max.y;
                this.sight = Number.isFinite(top) ? clamp(top, 0.1, 0.9) : 0.4;
                // The flash at the muzzle: one small bright body, shown for a frame or two of each shot.
                const shared = View._flashParts || (View._flashParts = { geometry: new T.SphereGeometry(1, 8, 6),
                    material: new T.MeshBasicMaterial({ color: "#ffd98a", transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false, fog: false }) });
                shared.material.toneMapped = false;
                const flash = new T.Mesh(shared.geometry, shared.material);
                flash.position.copy(this.tip); flash.visible = false; flash.frustumCulled = false;
                pivot.add(flash);
                View.overWorld(pivot);
                pivot.visible = false;
                scene.modelsGroup().add(pivot);
                this.pivot = pivot; this.object = object; this.template = template; this.flash = flash;
                this.pose = null;
            }).catch(() => {});
        },
        /** A shot left the weapon: it kicks, and the muzzle flashes. */
        fired() { this.kick = 1; this.flashFrames = 3; },
        /** Where the weapon in view ends (a muzzle), in the map's scene; false when no weapon is in view. */
        muzzle(out) {
            if (!this.pivot || !this.pivot.visible || !this.tip) return false;
            const v = scratch();
            v.b.copy(this.tip).applyMatrix4(this.pivot.matrixWorld);
            out.ox = v.b.x; out.oy = v.b.y; out.oz = v.b.z;
            return true;
        },
        update(camera, fight, st, scene) {
            const first = !!st && !!scene && !fight._ending && A.cameraMode() === "firstPerson";
            const unit = first ? fight.playerUnit() : null, battler = unit ? fight.battler(unit) : null;
            const weapon = battler && battler.isActor() && battler.isAlive() ? battler.weapons()[0] || null : null;
            if (!weapon) { if (this.weaponId !== -1) this.drop(); return; }
            if (weapon.id !== this.weaponId || scene !== this.scene) { this.drop(); this.load(scene, weapon); }
            const pivot = this.pivot;
            this.eye = camera;
            if (!pivot) return;
            const p = st.player, profile = A.profile(battler), blend = A.aimBlend, character = $gamePlayer;
            const lerp = (a, b, t) => a + (b - a) * t;
            // Where it rests, in tiles from the eye (right, up, forward is -z) and turns in degrees.
            let x, y, z, pitch = 0, yaw = 0, roll = 0;
            if (profile.ranged) {
                // On aim it comes to the middle with its top a hair under the eye's line: the crosshair is clear over it.
                x = lerp(0.42, 0, blend); y = lerp(-0.5, -(this.sight + 0.05), blend); z = lerp(-0.95, -0.8, blend); yaw = lerp(5, 0, blend);
                if (p.reload > 0) {
                    const dip = Math.sin(Math.PI * clamp(1 - p.reload / (p.reloadTotal || 1), 0, 1));
                    y -= 0.42 * dip; roll += 32 * dip; pitch -= 22 * dip;
                }
            } else {
                x = 0.5; y = -0.62; z = -0.85; pitch = 58; roll = -12;
                if (p.swing) {
                    const u = clamp(p.swing.frame / profile.rate, 0, 1), e = u * u * (3 - 2 * u), arc = Math.sin(Math.PI * u);
                    if (p.swing.step >= profile.combo && profile.combo >= 3) {
                        // The chain's last step comes down from overhead.
                        x = 0.15; y = lerp(-0.2, -0.75, e); z = -0.9 - 0.3 * arc; pitch = lerp(110, -15, e); roll = 0;
                    } else {
                        const side = p.swing.step % 2 ? 1 : -1;
                        x = lerp(0.6, -0.4, e) * side; y = -0.5 + 0.12 * arc; z = -0.85 - 0.3 * arc; pitch = 58 - 48 * arc; roll = lerp(-55, 75, e) * side;
                    }
                }
            }
            if (p.guard) { x = profile.ranged ? x * 0.5 : 0.1; y = -0.38; pitch = profile.ranged ? 20 : 30; roll = profile.ranged ? 35 : 80; }
            if (p.dodge > 0) y -= 0.25;
            // It follows its pose a little behind, so a swing recovers and a guard comes up rather than snapping.
            const pose = this.pose || (this.pose = { x, y, z, pitch, yaw, roll });
            const rate = p.swing ? 0.6 : 0.3;
            pose.x += (x - pose.x) * rate; pose.y += (y - pose.y) * rate; pose.z += (z - pose.z) * rate;
            pose.pitch += (pitch - pose.pitch) * rate; pose.yaw += (yaw - pose.yaw) * rate; pose.roll += (roll - pose.roll) * rate;
            // A sway at rest, a bob on the move (less while aiming), the kick of a shot easing off.
            const moving = character.isMoving();
            this.bob += ((moving ? 1 : 0) - this.bob) * 0.2;
            if (moving) this.phase += character.isDashing && character.isDashing() ? 0.32 : 0.22;
            const loose = 1 - blend * 0.75;
            const sx = Math.sin(st.clock * 0.03) * 0.006 * loose + Math.cos(this.phase) * 0.028 * this.bob * loose;
            const sy = Math.sin(st.clock * 0.045) * 0.008 * loose - Math.abs(Math.sin(this.phase)) * 0.04 * this.bob * loose;
            const kick = this.kick;
            this.kick = kick < 0.02 ? 0 : kick * 0.8;
            const k = this.SCALE, v = scratch();
            v.a.set((pose.x + sx) * k, (pose.y + sy + kick * 0.03) * k, (pose.z + kick * 0.16) * k).applyQuaternion(camera.quaternion);
            pivot.position.copy(camera.position).add(v.a);
            const turn = View._euler || (View._euler = new THREE.Euler(0, 0, 0, "YXZ")), q = View._q || (View._q = new THREE.Quaternion());
            turn.set((pose.pitch + kick * 7) * DEG, pose.yaw * DEG, pose.roll * DEG);
            pivot.quaternion.copy(camera.quaternion).multiply(q.setFromEuler(turn));
            pivot.scale.setScalar(k);
            pivot.visible = true;
            if (this.flash) {
                this.flash.visible = this.flashFrames > 0;
                // A small bright burst that shrinks over its frames.
                if (this.flashFrames > 0) { this.flash.scale.setScalar((0.1 + Math.random() * 0.05) * (0.6 + 0.4 * this.flashFrames)); this.flashFrames--; }
            }
            pivot.updateMatrixWorld(true);
        }
    };

    // The camera in a battle. Third person stands back about as far as the map's own camera does (the figure a
    // little under half the picture's height, more while aiming) and off to the side, so the crosshair is clear of
    // the body, and comes in for whatever stands between it and the player (see A.shoulderCamera); first person
    // narrows its view down the sights. A shot kicks the look up; a heavy blow taken shakes the view.
    A.aimBlend = 0;
    A.battleBlend = 0;
    // `rest` and `aim`: the share of the picture's height the figure takes. `least`: how near the camera comes to
    // the shoulder it looks over. `out`: how fast it backs off again, a frame; `past`: how fast it comes in past a body.
    // `clear`: how far this side of a body it stays. `room`: the way back a shoulder must have past the bodies beside it.
    // `even`: the share of the way back from behind the head that the way back from the shoulder must have for the
    // camera to stand out at the shoulder.
    A.SHOULDER = { side: 0.45, up: 0.3, fov: 38, rest: 0.45, aim: 0.6, least: 0.3, out: 0.045, past: 0.18, clear: 0.4, room: 1.5, even: 0.75 };
    A.SIGHTS_FOV = 52;

    /**
     * What a body is to the battle's camera: every unit but the player's own and every other character standing
     * on the map, each as its model's turned footprint from its feet to its head (what of that footprint is filled
     * where the model carries a collision mask); and scenery (a tree, a cart) only where it carries one: a tree is
     * its trunk, not the box round its crown. The list is made again a few times a second, never per frame; where
     * each stands is read as it is used.
     */
    A.cameraBodies = function(fight) {
        const kept = A._cameraBodies || (A._cameraBodies = { at: -1e9, serial: -1, list: [], count: 0 });
        const now = typeof Graphics !== "undefined" && Graphics.frameCount || 0;
        if (kept.serial === fight._serial && now >= kept.at && now - kept.at < 20) return kept;
        kept.at = now; kept.serial = fight._serial; kept.count = 0;
        const R = world3(), px = $gamePlayer._realX, py = $gamePlayer._realY;
        const add = (character, scenery) => {
            if (!character || character === $gamePlayer || Math.abs(character._realX - px) > 24 || Math.abs(character._realY - py) > 24) return;
            let foot = null;
            try { foot = R && R.eventModelFootprint && R.hasCharacterModel && R.hasCharacterModel(character) ? R.eventModelFootprint(character) : null; } catch (error) { foot = null; }
            if (scenery && !(foot && foot.mask)) return;
            const body = kept.list[kept.count] || (kept.list[kept.count] = { character: null, halfX: 0, halfZ: 0, cos: 1, sin: 0, tall: 0, mask: null });
            body.character = character;
            body.mask = foot && foot.mask && typeof foot.mask.has === "function" ? foot.mask : null;
            body.halfX = foot ? foot.rawX : 0.3; body.halfZ = foot ? foot.rawZ : 0.3;
            body.cos = foot ? Math.cos(foot.yaw) : 1; body.sin = foot ? Math.sin(foot.yaw) : 0;
            body.tall = A.heightOf(character);
            kept.count++;
        };
        for (const unit of fight._units) if (!unit.gone && fight.isAlive(unit)) add(fight.character(unit), false);
        if (R && R.hasCharacterModel && typeof $gameMap !== "undefined") {
            const props = R.PROP_EVENT_BASE || 10000;
            for (const event of $gameMap.events()) {
                if (!event || event._erased || (event.isThrough && event.isThrough()) || fight.unitOfEvent(event.eventId())) continue;
                if (R.hasCharacterModel(event)) add(event, event.eventId() >= props);
            }
        }
        for (let i = kept.count; i < kept.list.length; i++) kept.list[i].character = null;
        return kept;
    };

    /** How far along the way from `from` (toward `to`, `length` tiles) the first body stands, or `length` when none does. */
    A.cameraBodyReach = function(fight, from, to, length) {
        const bodies = A.cameraBodies(fight);
        if (!bodies.count || !(length > 1e-6)) return length;
        const dx = (to.x - from.x) / length, dy = (to.y - from.y) / length, dz = (to.z - from.z) / length;
        let reach = length;
        for (let i = 0; i < bodies.count; i++) {
            const body = bodies.list[i], character = body.character;
            const ox = from.x - (character._realX + 0.5), oz = from.z - (character._realY + 0.5);
            // Nowhere near the way: its place along it over the ground, and how far off it.
            const flat = dx * dx + dz * dz, wide = body.halfX + body.halfZ;
            const along = flat > 1e-9 ? -(ox * dx + oz * dz) / flat : 0;
            if (along < -wide || along > reach + wide) continue;
            const offX = ox + dx * along, offZ = oz + dz * along;
            if (offX * offX + offZ * offZ > wide * wide) continue;
            // The way, seen from the body's own frame, against its box: where it goes in.
            const lx = ox * body.cos - oz * body.sin, lz = ox * body.sin + oz * body.cos;
            const ux = dx * body.cos - dz * body.sin, uz = dx * body.sin + dz * body.cos;
            const ground = A.groundOf(character), oy = from.y - ground;
            let t0 = 0, t1 = reach, hit = true;
            for (let axis = 0; axis < 3 && hit; axis++) {
                const o = axis === 0 ? lx : axis === 1 ? oy - body.tall / 2 : lz, u = axis === 0 ? ux : axis === 1 ? dy : uz;
                const half = axis === 0 ? body.halfX : axis === 1 ? body.tall / 2 : body.halfZ;
                if (Math.abs(u) < 1e-9) { hit = Math.abs(o) <= half; continue; }
                let a = (-half - o) / u, b = (half - o) / u;
                if (a > b) { const swap = a; a = b; b = swap; }
                t0 = Math.max(t0, a); t1 = Math.min(t1, b);
                hit = t0 <= t1;
            }
            // Inside the box of a model that says what of it stands at walking height, only that counts: the box
            // of a tree is as wide as its crown, its mask is its trunk.
            if (hit && body.mask) {
                const mask = body.mask, sub = mask.sub || 4;
                hit = false;
                // Every fifth of a tile, and the far end itself.
                for (let t = t0; ; t = Math.min(t1, t + 0.2)) {
                    if (mask.has(Math.floor((lx + ux * t) * sub), Math.floor((lz + uz * t) * sub))) { hit = true; t0 = t; break; }
                    if (t >= t1) break;
                }
            }
            // The camera keeps a little this side of it.
            if (hit) reach = Math.max(0, t0 - A.SHOULDER.clear);
        }
        return reach;
    };

    /**
     * Where the over-the-shoulder camera stands. `pivot` is the point over the player it turns about, `right` and
     * `back` the unit ways to the side and away from where it looks (THREE vectors), `side` and `far` how far it
     * wants to be each way. The side first, then the way back from there: each is as long as the world leaves it
     * (Reactor3D.cameraArm: ground, walls, tall shapes, shut doors, at once, so the picture is never the inside of
     * a wall), the way back also no longer than the first body on it, than what stands between the camera and the
     * player, built or a body, or than a door swinging shut on it (eased: the camera is in none of these), and
     * each grows back slowly. Close in, the camera tucks behind the head rather than hanging out to the side of
     * it. Fills `out` (x, y, z).
     */
    A.shoulderCamera = function(fight, pivot, right, back, side, far, out) {
        const R = world3(), s = A.SHOULDER, arm = A._arm || (A._arm = { side: -1, back: -1, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } });
        // A battle's first frame starts from the whole length; from then on the lengths carry over, also through its end.
        if (arm.side < 0) { arm.side = side; arm.back = far; }
        const map = R && R.cameraArm && typeof $dataMap !== "undefined" ? $dataMap : null, from = arm.from, to = arm.to;
        to.x = pivot.x + right.x * side; to.y = pivot.y + right.y * side; to.z = pivot.z + right.z * side;
        const sideFree = map ? R.cameraArm(map, pivot, to, 0) : side;
        if (sideFree < arm.side) arm.side = sideFree;
        // A body at the shoulder (a tree's trunk, someone standing close) takes the room to the side as a wall does.
        // Asked a little past the shoulder, so the way back from there does not graze what stands just beyond it.
        let sideClear = sideFree;
        if (fight) {
            const past = side + s.clear;
            to.x = pivot.x + right.x * past; to.y = pivot.y + right.y * past; to.z = pivot.z + right.z * past;
            sideClear = Math.min(sideFree, A.cameraBodyReach(fight, pivot, to, past));
            // A shoulder from which a body shuts the way back at once is no place to look from: nearer the head,
            // then behind it, until the way back opens.
            for (let nearer = 0; nearer < 2 && sideClear > 0.01; nearer++) {
                from.x = pivot.x + right.x * sideClear; from.y = pivot.y + right.y * sideClear; from.z = pivot.z + right.z * sideClear;
                to.x = from.x + back.x * far; to.y = from.y + back.y * far; to.z = from.z + back.z * far;
                if (A.cameraBodyReach(fight, from, to, far) >= s.room) break;
                sideClear = nearer ? 0 : sideClear / 2;
            }
        }
        // Where the world shuts the way back from the shoulder much sooner than from behind the head (the wall
        // beside a doorway the player has come through, a corner the shoulder swings behind), the camera looks
        // from behind the head at its distance: the side comes in at once, a tile or so, rather than the camera
        // by many. It stands out again once the two ways are about as long.
        // (Each way back is asked with a door that has begun to swing shut counted as shut already, and the
        // answer for the shoulder the camera ends up at is kept: the open square asks three things a frame.)
        let soon = -1, soonHit = false;
        if (map && sideClear > 0.01) {
            from.x = pivot.x + right.x * sideClear; from.y = pivot.y + right.y * sideClear; from.z = pivot.z + right.z * sideClear;
            to.x = from.x + back.x * far; to.y = from.y + back.y * far; to.z = from.z + back.z * far;
            soon = R.cameraArm(map, from, to, 0, undefined, undefined, "closing");
            soonHit = R.cameraArmHit;
            if (soonHit) {
                to.x = pivot.x + back.x * far; to.y = pivot.y + back.y * far; to.z = pivot.z + back.z * far;
                const behind = R.cameraArm(map, pivot, to, 0, undefined, undefined, "closing");
                arm.tucked = soon < behind * (arm.tucked ? s.even + 0.1 : s.even) && behind - soon > 1;
                if (arm.tucked) { soon = behind; soonHit = R.cameraArmHit; }
            } else arm.tucked = false;
            if (arm.tucked) sideClear = arm.side = 0;
        } else arm.tucked = false;
        arm.side = sideClear < arm.side ? arm.side + (sideClear - arm.side) * s.past : Math.min(sideClear, arm.side + (sideClear - arm.side) * s.out + 0.002);
        from.x = pivot.x + right.x * arm.side; from.y = pivot.y + right.y * arm.side; from.z = pivot.z + right.z * arm.side;
        to.x = from.x + back.x * far; to.y = from.y + back.y * far; to.z = from.z + back.z * far;
        // The way back with a door that has begun to swing shut counted as shut already: the camera starts in for
        // it, eased, and is this side of it by the time its leaves meet. What stands on the way now (asked again
        // only when something was met) brings the camera in at once.
        let backSoon = far;
        if (map && soon >= 0 && arm.side === sideClear) backSoon = soon;
        else if (map) { backSoon = R.cameraArm(map, from, to, s.least, undefined, undefined, "closing"); soonHit = R.cameraArmHit; }
        const backFree = map && soonHit ? R.cameraArm(map, from, to, s.least) : backSoon;
        if (backFree < arm.back) arm.back = backFree;
        let clear = Math.min(backFree, backSoon);
        // What stands between the camera and the player off the camera's own way, built or a body, hides the
        // player: the camera comes in to the same depth as its near side. Eased: the camera is in nothing. Not
        // for something built so near the player that the camera could only sit in at the head (a pillar the
        // player leans on): that is left where it is, and the cutaway shows the player through it.
        const sight = Math.hypot(to.x - pivot.x, to.y - pivot.y, to.z - pivot.z);
        if (sight > 1e-6) {
            const built = map ? R.cameraArm(map, pivot, to, 0, undefined, undefined, "closing") * far / sight : far;
            if (built >= A.BODY_NEAR + 0.4) clear = Math.min(clear, built);
            if (fight) clear = Math.min(clear, A.cameraBodyReach(fight, pivot, to, sight) * far / sight);
        }
        // A body on the camera's own way.
        if (fight) clear = Math.min(clear, A.cameraBodyReach(fight, from, to, far));
        clear = Math.max(s.least, clear);
        arm.back = clear < arm.back ? arm.back + (clear - arm.back) * s.past : Math.min(clear, arm.back + (clear - arm.back) * s.out + 0.002);
        const tuck = arm.side * clamp(arm.back / Math.max(0.5, far * 0.4), 0.25, 1);
        out.x = pivot.x + right.x * tuck + back.x * arm.back;
        out.y = pivot.y + right.y * tuck + back.y * arm.back;
        out.z = pivot.z + right.z * tuck + back.z * arm.back;
        return out;
    };

    /**
     * Through the eyes, an opponent at arm's length who is shorter than the player stands under the picture: the
     * crosshair passes over its head, and without a mouse nothing can bring the look down to it. While the mouse
     * is not held for the look (keys, a gamepad), the look's height has not moved for a moment and the crosshair
     * is on nobody, the look eases to such an opponent's chest. A held mouse aims by itself, always.
     */
    A.NEAR_LOOK = { reach: 2.6, cone: 0.82, still: 20, rate: 0.12, most: 1.5, slack: 5 };
    A.lookToNear = function(fight, st, look, camera) {
        const n = A.NEAR_LOOK, kept = A._nearLook || (A._nearLook = { pitch: null, still: 0 });
        const pitch = look.pitch === null ? 0 : look.pitch;
        kept.still = look.locked || (kept.pitch !== null && Math.abs(pitch - kept.pitch) > 0.01) ? 0 : kept.still + 1;
        kept.pitch = pitch;
        const unit = fight.playerUnit();
        if (kept.still < n.still || !unit || aim.target || st.player.recoil > 0.01) return;
        const bodies = A.bodies(fight, F.oppose(unit.team));
        const yaw = look.yaw * DEG, fx = Math.sin(yaw), fz = -Math.cos(yaw);
        let best = null, bestFlat = n.reach;
        for (let i = 0; i < bodies.count; i++) {
            const body = bodies.list[i], dx = body.x - camera.position.x, dz = body.z - camera.position.z;
            const flat = Math.hypot(dx, dz);
            if (flat > bestFlat || flat < 0.2 || (dx * fx + dz * fz) / flat < n.cone) continue;
            best = body; bestFlat = flat;
        }
        if (!best) return;
        // Down is positive, as the look counts it.
        const want = Math.atan2(camera.position.y - (best.ground + (best.top - best.ground) * 0.6), bestFlat) / DEG;
        if (Math.abs(want - pitch) <= n.slack) return;
        look.pitch = pitch + clamp((want - pitch) * n.rate, -n.most, n.most);
        kept.pitch = look.pitch;
    };

    const hookCamera = function() {
        const R = world3();
        if (!R || !R.Camera || !R.Camera.update || R.Camera.update.__reactorAction) return;
        const update = R.Camera.update;
        const wrapped = function(spriteset) {
            const result = update.call(this, spriteset);
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            const st = fight && fight.isAction() && fight.isHere() ? fight._action : null;
            if (!st && A.aimBlend <= 0 && A.battleBlend <= 0 && View.weaponId === -1) { if (A._arm) A._arm.side = -1; return result; }
            const view = spriteset && spriteset._reactor3d, camera = view && view.camera, v = scratch();
            if (!camera || !v) return result;
            const ease = (now, want, rate) => { const next = now + (want - now) * rate; return Math.abs(want - next) < 0.005 ? want : next; };
            A.aimBlend = ease(A.aimBlend, st && st.player.aim ? 1 : 0, 0.2);
            A.battleBlend = ease(A.battleBlend, st && !fight._ending ? 1 : 0, 0.08);
            // A shot's kick: the look jumps up and settles back most of the way.
            if (st && st.player.recoil > 0.01 && R.Camera.look && R.Camera.look.pitch !== null) {
                const kick = st.player.recoil * 0.35;
                R.Camera.look.pitch -= kick * 0.5;
                st.player.recoil -= kick;
            }
            const current = view.cameraCurrent, mode = A.cameraMode(), battle = A.battleBlend, aiming = A.aimBlend;
            if (current && (battle > 0 || aiming > 0)) {
                if (mode === "thirdPerson" && typeof $gamePlayer !== "undefined") {
                    const s = A.SHOULDER, tall = A.heightOf($gamePlayer);
                    camera.getWorldDirection(v.a);
                    v.b.set(-v.a.z, 0, v.a.x).normalize();
                    const fov = current.fov + (s.fov - current.fov) * aiming, share = s.rest + (s.aim - s.rest) * aiming;
                    const want = tall / (share * 2 * Math.tan(fov * DEG / 2));
                    const fx = current.x + 0.5, fy = current.y, fz = current.z + 0.5;
                    const pivot = A._pivot || (A._pivot = { x: 0, y: 0, z: 0 }), place = A._place || (A._place = { x: 0, y: 0, z: 0 });
                    pivot.x = fx; pivot.y = fy + tall * s.up; pivot.z = fz;
                    v.a.negate();
                    try { A.shoulderCamera(st ? fight : null, pivot, v.b, v.a, Math.max(0.8, tall * s.side), want, place); }
                    catch (error) { place.x = pivot.x + v.b.x * Math.max(0.8, tall * s.side) + v.a.x * want; place.y = pivot.y + v.a.y * want; place.z = pivot.z + v.b.z * Math.max(0.8, tall * s.side) + v.a.z * want; }
                    // From the map's own camera to the battle's as the battle begins, and back as it ends.
                    const c = camera.position;
                    c.set(c.x + (place.x - c.x) * battle, c.y + (place.y - c.y) * battle, c.z + (place.z - c.z) * battle);
                    camera.fov = fov;
                    const focus = A._focus || (A._focus = { x: 0, y: 0, z: 0 });
                    focus.x = fx; focus.y = fy + 1.2; focus.z = fz;
                    try {
                        // Over the roof the player stands on, and out of a roof's hollow, as the map's camera is.
                        const feet = Number.isFinite($gamePlayer._reactorAlt) ? $gamePlayer._reactorAlt : $gamePlayer._reactorGround;
                        if (R.clearCameraRoof) R.clearCameraRoof(camera, focus, $dataMap, feet);
                        if (R.clearCameraAttic) R.clearCameraAttic(camera, focus, $dataMap);
                        if (R.clearCameraGround) R.clearCameraGround(camera, focus, $dataMap);
                    } catch (error) { /* the framing stands */ }
                    camera.updateProjectionMatrix();
                } else if (mode === "firstPerson") {
                    camera.fov = current.fov + (A.SIGHTS_FOV - current.fov) * aiming;
                    camera.updateProjectionMatrix();
                    if (st && !fight._ending && R.Camera.look) { try { A.lookToNear(fight, st, R.Camera.look, camera); } catch (error) { /* the look stays the hand's */ } }
                }
                if (st && st.player.shake > 0.02) {
                    const shake = st.player.shake * 0.09;
                    camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake;
                    st.player.shake *= 0.85;
                }
                camera.updateMatrixWorld();
            }
            try { View.update(camera, fight, st, view.scene && view.scene.modelsGroup ? view.scene : null); } catch (error) { View.drop(); }
            return result;
        };
        wrapped.__reactorAction = true;
        R.Camera.update = wrapped;
    };
    hookCamera();

    // The stock screen shake slides the whole picture sideways, which over a 3D view shows the edge of the canvas as
    // a band. In a battle seen from the shoulder or through the eyes a shake (a blow taken, an event's Shake Screen)
    // is the camera's own instead.
    A.hookShake = function() {
        if (typeof Game_Screen === "undefined" || Game_Screen.prototype.startShake.__reactorAction) return;
        const startShake = Game_Screen.prototype.startShake;
        Game_Screen.prototype.startShake = function(power, speed, duration) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            const st = fight && fight.isAction() && fight.isHere() && A.relative() ? fight._action : null;
            if (!st) return startShake.call(this, power, speed, duration);
            st.player.shake = Math.max(st.player.shake, clamp(num(power) / 18, 0.05, 1));
        };
        Game_Screen.prototype.startShake.__reactorAction = true;
    };
    A.hookShake();

    // Through the eyes in a battle, the eye never sees its own body (a lunge, a flinch or a raised arm carries it
    // past where the map's own check hides it), nor a friend standing so near that it fills the view.
    A.EYE_ROOM = 1.2;
    /** How near its shoulder the over-the-shoulder camera may come before the player's own body is taken out of the picture, in tiles. */
    A.BODY_NEAR = 1.6;
    const eyeHidden = new WeakSet();
    const hookHidden = function() {
        const R = world3();
        if (!R || !R.characterHiddenByCamera || R.characterHiddenByCamera.__reactorAction) return;
        const hidden = R.characterHiddenByCamera;
        const wrapped = function(character, model) {
            // From behind, with no room to stand back (the player's back to a wall), the camera sits in at the head:
            // the body is out of sight until the camera has room again, or the picture is the inside of it.
            if (character && character === $gamePlayer && A._arm && A._arm.side >= 0 && A.battleBlend > 0.5 && A.cameraMode() === "thirdPerson") {
                A._bodyNear = A._arm.back < (A._bodyNear ? A.BODY_NEAR + 0.4 : A.BODY_NEAR);
                if (A._bodyNear) return true;
            }
            if (model && character) {
                const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
                if (fight && fight.isAction() && fight.isHere() && A.cameraMode() === "firstPerson") {
                    if (character === $gamePlayer) return true;
                    const camera = A.camera();
                    if (camera && character !== A._aimAt) {
                        const dx = character._realX + 0.5 - camera.position.x, dz = character._realY + 0.5 - camera.position.z;
                        // Out of view inside the eye's room, and back only once it has stepped clear of it: a friend
                        // hovering at the edge does not flicker. (A model has no opacity of its own to fade by.)
                        const was = eyeHidden.has(character), room = was ? A.EYE_ROOM + 0.5 : A.EYE_ROOM;
                        if (dx * dx + dz * dz < room * room) {
                            const unit = character.eventId ? fight.unitOfEvent(character.eventId()) : null;
                            if (!unit || unit.team === "ally") { if (!was) eyeHidden.add(character); return true; }
                        }
                        if (was) eyeHidden.delete(character);
                    }
                }
            }
            return hidden.call(this, character, model);
        };
        wrapped.__reactorAction = true;
        R.characterHiddenByCamera = wrapped;
    };
    hookHidden();

    // A unit that climbed after its target comes down as the party does: it steps off a roof's edge when the drop is safe.
    A.hookPhysics = function() {
        const P = root.ReactorPhysics;
        if (!P || !P.walksOff || !P.isPartyCharacter || P.walksOff.__reactorAction) return;
        const walksOff = P.walksOff, isParty = P.isPartyCharacter;
        P.isPartyCharacter = function(character) {
            return character === A._stepper || isParty.call(this, character);
        };
        P.walksOff = function(character, x, y, d) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            if (!fight || !fight.isAction() || !fight._action || !character || isParty.call(this, character)) return walksOff.call(this, character, x, y, d);
            let ours = false;
            for (const unit of fight._units) if (!unit.gone && fight.character(unit) === character) { ours = true; break; }
            if (!ours) return walksOff.call(this, character, x, y, d);
            A._stepper = character;
            try { return walksOff.call(this, character, x, y, d); } finally { A._stepper = null; }
        };
        P.walksOff.__reactorAction = true;
    };
    A.hookPhysics();

    // The stage's flinch pins a unit to its cell for a moment: never one the player is walking.
    A.hookStage = function() {
        const S = stage();
        if (!S || !S.beat || S.beat.__reactorAction) return;
        const beat = S.beat;
        S.beat = function(character, kind, toward) {
            if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isAction() && typeof $gamePlayer !== "undefined" && character === $gamePlayer
                && (kind === "hurt" || kind === "evade")) return;
            return beat.call(this, character, kind, toward);
        };
        S.beat.__reactorAction = true;
    };
    A.hookStage();

    if (typeof module !== "undefined" && module.exports) module.exports = A;
})(globalThis);
