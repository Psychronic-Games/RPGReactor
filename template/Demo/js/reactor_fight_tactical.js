//=============================================================================
// reactor_fight_tactical.js - Tactical battles on the map
//=============================================================================
//
// The Tactical mode of battles on the live map (reactor_fight.js): the player
// picks a unit, sees where it can walk, walks it, chooses Attack, a skill or
// an item from an ordinary command window and a target inside its range; the
// other side decides with the same ranges. Works on a plain 2D map and on a
// 3D map under any camera (docs/BATTLE-MODES.md).
//
// - Ranges, areas, move and jump come from note tags (`<range: 2-5>`,
//   `<area: circle 1>`, `<los: no>`, `<move: 5>`, `<jump: 2>`); a record
//   with none plays by defaults taken from its Scope and weapon type.
// - Movement is a cost flood over the cells: tile passability, other units,
//   and on a 3D map the ground's heights (terrain, pieces, rocks, shut doors,
//   water), a rise up to the unit's jump taken as a hop.
// - Line of sight, cover, height and the side a blow lands on change the hit
//   chance and the damage; the damage itself is the Database formula.
// - Everything here is inert in a Classic battle and in any other on-map
//   mode: each wrapper falls through unless `$gameFight.isTactical()`.
//=============================================================================

(function(root) {
    "use strict";

    const F = root.ReactorFight;
    const Game_Fight = root.Game_Fight;
    if (!F || !Game_Fight) return;

    F.AREAS = ["self", "single", "circle", "square", "line", "cone", "cross", "all"];
    F.AI_PRESETS = ["aggressive", "ranged", "support"];
    F.DEFAULT_JUMP = 1;
    // A blow from the side or from behind (the way the target faces).
    F.FLANK = { front: 1, side: 1.2, back: 1.5 };
    // The chance a ranged blow lands on a target behind half cover, and behind full cover.
    F.COVER_HIT = [1, 0.75, 0.5];
    // Damage per level the attacker stands above (or below) its target, and its limit either way.
    F.HEIGHT_BONUS = 0.1;
    F.HEIGHT_LIMIT = 0.3;
    // Height pays for a weapon that shoots (reach of 2 or more): one more tile of reach for every two levels the
    // shooter stands above its target, up to three; and from two levels up a shot goes over half cover.
    F.HEIGHT_REACH_LEVELS = 2;
    F.HEIGHT_REACH_MAX = 3;
    F.HEIGHT_OVER_COVER = 2;
    // A blow struck from beside its target (reach 1) lands only when the two stand within this many levels.
    F.MELEE_HEIGHT = 2;
    // The pace of the units that decide for themselves (the other side, allies that fight by themselves, a turn handed
    // to Auto), the player's own setting (`ReactorFight.pace()`):
    //   "normal"  one unit at a time, in the turn strip's order: the view goes to the unit and rests on it, it walks,
    //             its action plays its whole Action Sequence, the result is read, and only then the next unit begins.
    //             Units that only close in far from everyone they fight walk meanwhile, off to the side.
    //   "fast"    units that only move walk together, three frames pass between two units, and above F.OVERLAP
    //             standing units the actions that do not meet play side by side (above F.CROWD, quick).
    //   "skip"    everything the fast pace does at any size, quick: only a decisive blow is still watched alone.
    F.PACES = ["normal", "fast", "skip"];
    // A battle that has had more units than this standing is an army: it plays at the fast pace whatever the
    // setting, to its end, as a turn of forty units watched one by one would take minutes.
    // 24: a ten against ten battle (20) and the Demo's raid with its reinforcements (about 20) are watched unit by unit.
    F.ARMY = 24;
    // The normal pace's beats, in frames: the view rests on a unit before it does anything, on its target before the
    // action begins, on the result before the next unit's turn, and on a unit that only walked.
    F.BEAT_LOOK = 22;
    F.BEAT_AIM = 12;
    F.BEAT_REST = 34;
    F.BEAT_MOVED = 10;
    // A watched turn waits while the view is away showing someone (a unit that just joined, whoever spoke), and
    // never longer than this many frames: then the turn takes the view back.
    F.BEAT_AWAY = 140;
    // At the normal pace a unit that only moves walks off to the side when its way begins and ends further than
    // this many steps from every unit it fights; nearer, its walk is watched like any turn.
    F.ASIDE = 6;
    // How many units may walk at once when they only move, and the frames between two units at the fast pace.
    F.MOVERS_MAX = 3;
    // At the fast pace, with more units than this still standing, the units that decide for themselves act at the
    // same time where their actions do not meet; fewer, and each action is played in turn.
    F.OVERLAP = 16;
    // At the fast pace, more units than this still standing make a crowd: the units that decide for themselves act quick.
    F.CROWD = 20;
    // The pace of an action played beside others with its own sequence: sequence frames to a game frame.
    F.SIDE_RATE = 2;
    // The control that, held, doubles the pace of everything the battle plays by itself (the dash key).
    F.FAST_FORWARD = "shift";
    // The battle's own actions (ReactorControls.setTactical: `reactorControls.tacticalKeys` / `tacticalButtons`), and
    // the ordinary action each is read from where those bindings are not in force.
    F.KEYS = { viewLeft: "pageup", viewRight: "pagedown", level: "control", unit: "tab", threat: "threat" };
    F.key = function(name) {
        const controls = root.ReactorControls;
        if (controls && controls.isTactical && controls.isTactical()) return name;
        return name === "skip" ? F.FAST_FORWARD : F.KEYS[name];
    };
    F.AI_WAIT = 3;

    /** Whether an action's reach covers the height between two stands: anything that reaches 2 or more does; a blow from beside does not climb. */
    F.heightInReach = function(tactics, from, to) {
        return tactics.max >= 2 || Math.abs(from - to) <= F.MELEE_HEIGHT;
    };

    /** The furthest an action reaches from `from` down (or up) to ground at `to`. */
    F.reachAt = function(tactics, from, to) {
        if (tactics.max < 2 || !(from - to >= F.HEIGHT_REACH_LEVELS)) return tactics.max;
        return tactics.max + Math.min(F.HEIGHT_REACH_MAX, Math.floor((from - to) / F.HEIGHT_REACH_LEVELS));
    };
    // A step into a bush (2D) or into water a unit wades (3D).
    F.ROUGH_COST = 2;
    // Where a unit sees from and is seen at, above its ground: in tiles for a sprite (a tile and a half tall), and
    // as shares of the body's height where the party stands as models (a three-tile figure looks from 2.7, over a
    // waist-high counter, not from its belt).
    F.EYE = 1.3;
    F.CHEST = 0.9;
    F.EYE_SHARE = 0.9;
    F.CHEST_SHARE = 0.6;
    // How far short of the other's middle a line of sight may end and still have reached it, in tiles.
    F.SIGHT_SLACK = 0.35;
    // The enemy's thinking per frame, in milliseconds.
    F.AI_BUDGET_MS = 4;
    // The stock command, skill and item windows of a unit's turn; a HUD that draws its own sets this false. The
    // battle menu (ReactorFight.Windows.openMenu) is not one of them: Cancel opens it either way.
    if (F.stockWindows === undefined) F.stockWindows = true;
    // Every unit decides by itself (a demo, a test): the player only watches.
    if (F.autoBattle === undefined) F.autoBattle = false;

    const DIRS = [2, 4, 6, 8];
    const DX = { 2: 0, 4: -1, 6: 1, 8: 0 }, DY = { 2: 1, 4: 0, 6: 0, 8: -1 };
    const sign = value => (value > 0 ? 1 : value < 0 ? -1 : 0);
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const frameNow = () => (typeof Graphics !== "undefined" ? Graphics.frameCount || 0 : 0);
    const sound = name => { if (typeof SoundManager !== "undefined" && SoundManager[name]) SoundManager[name](); };
    // For the files that stand on this one (reactor_fight_menu.js): the frame now, and a system sound by its SoundManager name.
    F.frameNow = frameNow;
    F.sound = sound;

    //-------------------------------------------------------------------------
    // Note tags.

    const tagCache = new WeakMap();

    /** The tactical tags of one note (range, area, los, move, jump, ai), or null when it has none. */
    F.parseTactics = function(note) {
        const text = String(note || "");
        if (text.indexOf("<") < 0) return null;
        const tags = { range: null, area: null, los: null, move: null, jump: null, ai: null };
        let found = false;
        // A PSYCHRONIC_PTBS block says the same things in its own words; a tag beside it wins.
        const block = /<PTBS>([\s\S]*?)<\/PTBS>/i.exec(text);
        if (block) {
            const scope = /scope\s*:\s*(circle|line)\s*\(\s*(\d+)\s*(?:,\s*(\d+))?/i.exec(block[1]);
            if (scope) {
                const max = Number(scope[2]), min = Math.min(max, Number(scope[3]) || 0);
                tags.range = { min, max };
                if (scope[1].toLowerCase() === "line") tags.area = { shape: "line", size: max };
                found = true;
            }
            const aoe = /aoe\s*:\s*(circle|square|line|cross)\s*\(\s*(\d+)/i.exec(block[1]);
            if (aoe) {
                const size = Number(aoe[2]);
                tags.area = size > 0 ? { shape: aoe[1].toLowerCase(), size } : { shape: "single", size: 0 };
                found = true;
            }
            const points = /move_points\s*:\s*(\d+)/i.exec(block[1]);
            if (points) { tags.move = Number(points[1]); found = true; }
        }
        const range = /<range\s*:\s*(\d+)\s*(?:-\s*(\d+)\s*)?>/i.exec(text);
        if (range) {
            const a = Number(range[1]);
            tags.range = range[2] === undefined ? { min: Math.min(1, a), max: a } : { min: Math.min(a, Number(range[2])), max: Math.max(a, Number(range[2])) };
            found = true;
        }
        const area = /<area\s*:\s*(self|single|circle|square|line|cone|cross|all)(?:\s+(\d+))?\s*>/i.exec(text);
        if (area) {
            const shape = area[1].toLowerCase();
            tags.area = { shape, size: shape === "self" || shape === "single" || shape === "all" ? 0 : Math.max(1, Number(area[2]) || 1) };
            found = true;
        }
        const los = /<los\s*:\s*(\w+)\s*>/i.exec(text);
        if (los) { tags.los = !/^(no|none|false|off|0)$/i.test(los[1]); found = true; }
        const move = /<move\s*:\s*([+-]?\d+)\s*>/i.exec(text);
        if (move) { tags.move = Number(move[1]); found = true; }
        const jump = /<jump\s*:\s*([+-]?\d+)\s*>/i.exec(text);
        if (jump) { tags.jump = Number(jump[1]); found = true; }
        const ai = /<ai\s*:\s*(\w+)\s*>/i.exec(text);
        if (ai && F.AI_PRESETS.includes(ai[1].toLowerCase())) { tags.ai = ai[1].toLowerCase(); found = true; }
        return found ? tags : null;
    };

    const SHAPES = ["self", "single", "circle", "square", "line", "cone", "cross", "all"];

    /**
     * A record's tactical settings: its own `rrBattle` (what the Database's Tactical Battles card stores:
     * `{ range: { min, max }, area: { shape, size }, los, move, jump, ai }`, each optional), and for whatever that
     * leaves unset the tags of its note. Null when it sets nothing either way.
     */
    F.recordTactics = function(record) {
        const tags = F.parseTactics(record.note), own = record.rrBattle;
        if (!own || typeof own !== "object") return tags;
        const out = tags || { range: null, area: null, los: null, move: null, jump: null, ai: null };
        let found = !!tags;
        const whole = value => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Math.trunc(Number(value)));
        if (own.range && typeof own.range === "object") {
            const max = whole(own.range.max);
            if (max !== null && max >= 0) {
                const min = whole(own.range.min);
                out.range = { min: clamp(min === null ? Math.min(1, max) : min, 0, max), max };
                found = true;
            }
        }
        if (own.area && typeof own.area === "object") {
            const shape = String(own.area.shape || "").toLowerCase();
            if (SHAPES.includes(shape)) {
                out.area = { shape, size: shape === "self" || shape === "single" || shape === "all" ? 0 : Math.max(1, whole(own.area.size) || 1) };
                found = true;
            }
        }
        if (typeof own.los === "boolean") { out.los = own.los; found = true; }
        const move = whole(own.move), jump = whole(own.jump);
        if (move !== null) { out.move = move; found = true; }
        if (jump !== null) { out.jump = jump; found = true; }
        const ai = typeof own.ai === "string" ? own.ai.toLowerCase() : "";
        if (ai && F.AI_PRESETS.includes(ai)) { out.ai = ai; found = true; }
        return found ? out : null;
    };

    /**
     * A record's settings, read once, and again when its note or its `rrBattle` changes: whoever changes a setting
     * gives the record a new `rrBattle` object (one changed in place is not seen).
     */
    function tagsOf(record) {
        if (!record || typeof record !== "object") return null;
        const note = record.note || "", own = record.rrBattle || null;
        const kept = tagCache.get(record);
        if (kept && kept.note === note && kept.own === own) return kept.tags;
        const tags = F.recordTactics(record);
        tagCache.set(record, { note, own, tags, tactics: null });
        return tags;
    }

    /** What an untagged weapon reaches, by its type's name. */
    function weaponReach(weapon) {
        const types = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.weaponTypes;
        const name = String((types && types[weapon.wtypeId]) || "").toLowerCase();
        if (/rifle|cannon/.test(name)) return { min: 2, max: 7 };
        if (/pistol/.test(name)) return { min: 1, max: 4 };
        if (/bow|gun|launcher/.test(name)) return { min: 2, max: 5 };
        return null;
    }

    const SCOPE_ONE_FRIEND = [7, 9, 12], SCOPE_ALL_FRIENDS = [8, 10, 13];

    /**
     * Where a skill or an item reaches when this battler uses it: `{ min, max, area: { shape, size }, los }`.
     * Each of range, area and line of sight is the record's own setting (its `rrBattle`, else its tag), else (the battler's attack skill and
     * any physical skill aimed at the other side) the first equipped weapon's, else the default: a weapon's
     * reach by its type, 1 unarmed, and by Scope for everything else. The object is shared: do not change it.
     */
    F.tactics = function(battler, item) {
        if (!item) return F.MELEE;
        const tags = tagsOf(item);
        const skill = DataManager.isSkill(item);
        // The attack skill (whichever skill a weapon makes it) and any physical skill aimed at the other side.
        const weaponLike = skill && item.scope >= 1 && item.scope <= 6 && ((!!battler && item.id === battler.attackSkillId()) || item.hitType === 1);
        const weapon = weaponLike && battler && battler.isActor && battler.isActor() ? battler.weapons()[0] || null : null;
        const kept = tagCache.get(item);
        const cached = kept && kept.tactics;
        if (cached && cached.weapon === weapon && cached.weaponNote === (weapon ? weapon.note : "") && cached.weaponOwn === (weapon ? weapon.rrBattle || null : null)
            && cached.weaponLike === weaponLike) return cached.value;
        const weaponTags = weapon ? tagsOf(weapon) : null;
        let range = (tags && tags.range) || (weaponTags && weaponTags.range) || (weapon ? weaponReach(weapon) : null);
        let area = (tags && tags.area) || (weaponTags && weaponTags.area) || null;
        let los = tags && tags.los !== null ? tags.los : weaponTags && weaponTags.los !== null ? weaponTags.los : true;
        const scope = item.scope, all = scope >= 2 && scope <= 6;
        if (!range) {
            range = weaponLike ? { min: 1, max: 1 }
                : scope === 1 || all ? { min: 1, max: 4 } : SCOPE_ONE_FRIEND.includes(scope) ? { min: 0, max: 3 } : { min: 0, max: 0 };
        }
        if (!area) {
            area = scope === 1 || SCOPE_ONE_FRIEND.includes(scope) ? { shape: "single", size: 0 }
                : all ? { shape: "circle", size: 2 }
                : SCOPE_ALL_FRIENDS.includes(scope) || scope === 14 ? { shape: "circle", size: 3 }
                : { shape: "self", size: 0 };
        }
        if (area.shape === "self") range = { min: 0, max: 0 };
        // Nothing reaches or spreads further than MAX_REACH tiles, whatever a note or a record says: the cells are counted one by one.
        const top = F.MAX_REACH;
        const value = { min: Math.min(range.min, top), max: Math.min(range.max, top), area: { shape: area.shape, size: Math.min(area.size, top) }, los: !!los };
        if (!kept) tagsOf(item);
        tagCache.get(item).tactics = { weapon, weaponNote: weapon ? weapon.note : "", weaponOwn: weapon ? weapon.rrBattle || null : null, weaponLike, value };
        return value;
    };
    F.MELEE = { min: 1, max: 1, area: { shape: "single", size: 0 }, los: true };
    /** The furthest anything reaches and the largest an area is, in tiles (the Database's card has the same limit). */
    F.MAX_REACH = 30;

    /** A unit's tag of that name: its own record's (actor, then class, or enemy), plus what its equipment and states add. */
    function unitStat(unit, key, fallback, own) {
        const battler = typeof $gameFight !== "undefined" && $gameFight ? $gameFight.battler(unit) : null;
        let base = own === undefined ? null : own;
        if (base !== null) {
            // The event's own setting stands; equipment and states still add to it.
        } else if (battler && battler.isActor && battler.isActor()) {
            const own = tagsOf(battler.actor()), cls = tagsOf(battler.currentClass());
            base = own && own[key] !== null ? own[key] : cls && cls[key] !== null ? cls[key] : null;
        } else if (battler && battler.isEnemy && battler.isEnemy()) {
            const own = tagsOf(battler.enemy());
            base = own && own[key] !== null ? own[key] : null;
        }
        let value = base === null ? fallback : base;
        if (battler) {
            if (battler.isActor && battler.isActor()) {
                for (const item of battler.equips()) { const tags = item ? tagsOf(item) : null; if (tags && tags[key] !== null) value += tags[key]; }
            }
            for (const state of battler.states()) { const tags = tagsOf(state); if (tags && tags[key] !== null) value += tags[key]; }
        }
        return clamp(value, 0, 30);
    }

    /** Tiles a unit moves in a turn: its event's own Move when it sets one, else its tags, else 4. */
    F.moveOf = function(unit) {
        if (!unit) return 0;
        // A unit on a vehicle moves as the vehicle does (reactor_vehicles_mount.js).
        const ridden = typeof F.mountOf === "function" ? F.mountOf(unit) : null;
        if (ridden) return F.mountMove(unit, ridden);
        return unitStat(unit, "move", F.DEFAULT_MOVE, unit.ownMove && unit.move > 0 ? unit.move : null);
    };

    /** Levels a unit climbs in one step (3D maps). */
    F.jumpOf = function(unit) {
        if (unit && typeof F.mountOf === "function" && F.mountOf(unit)) return F.mountJump(unit);
        return unit ? unitStat(unit, "jump", F.DEFAULT_JUMP) : 0;
    };

    /** How an AI unit decides: its `<ai:>` tag (actor or enemy), else aggressive. */
    F.aiOf = function(unit) {
        const battler = typeof $gameFight !== "undefined" && $gameFight ? $gameFight.battler(unit) : null;
        const record = battler ? (battler.isActor && battler.isActor() ? battler.actor() : battler.isEnemy && battler.isEnemy() ? battler.enemy() : null) : null;
        const tags = record ? tagsOf(record) : null;
        return (tags && tags.ai) || "aggressive";
    };

    //-------------------------------------------------------------------------
    // The grid: what a cell costs, how high it stands, what it hides.

    const G = F.Grid = {};
    let gw = 0, gh = 0, gCost = null, gPrev = null, gHeight = null, gHop = null, gOcc = null, gHeapCell = null, gHeapCost = null, gHeapSize = 0, gMark = null;
    let stepHeight = 0, stepHop = false, stepKind = "walk", stepExtra = 0, gKind = null;
    const KINDS = ["walk", "hop", "mantle", "ladder", "drop"];
    // A cell holds more than one place to stand where the map does (the ground under an eave and the eave, a room and
    // its roof, a path and the bridge over it): the flood's nodes are a cell's levels, LEVELS of them at most, told
    // apart by their height (LEVEL_GAP: nearer than this is the same place). On a flat or 2D map only the first is used.
    const LEVELS = 3, LEVEL_GAP = 1.5;
    let gDeep = false, gOccH = null;
    let gOccMore = [];
    // Who stands where for a question asked outside a flood (does a body fit here now), so the flood's own answer stays whole.
    let sOcc = null, sOccH = null, sOccMore = [];
    // What a big body needs of each cell, read once and kept while a flood or a search lasts: bit 1 the cell is known,
    // 2 a body stands on it, 4 / 8 the way east is known / open, 16 / 32 the way south; the ground it has there, and
    // the height it was asked from, and the room over that ground up to whatever hangs over the cell.
    let gBody = null, gBodyH = null, gBodyN = null, gBodyR = null;
    // The way a unit faces on each node of the flood (an index of DIRS): its last step's direction, or the one it
    // kept while it backed up. Only a long body reads it.
    let gFace = null;
    // The ways on from a cell in one direction, as the flood reads them: the height each lands at, its kind and its extra cost.
    let landCount = 0;
    const landHeight = new Float32Array(8), landKind = new Uint8Array(8), landExtra = new Float32Array(8);
    /**
     * Seams for the world's vertical movement (assigned by whoever owns it; null plays the built-in rise test and hop):
     * `G.edge(x, y, d, height, jump)` -> `{ kind: "walk" | "hop" | "mantle" | "ladder" | "drop" | "blocked", cost, height }`
     * or null for "ask the tiles"; `G.playStep(character, step)` starts a step of kind other than "walk" through the
     * character's real movement and returns true (the walk waits while `G.isStepping(character)`).
     */
    G.edge = null;
    G.playStep = null;
    G.isStepping = null;
    /**
     * Seams for cells with more than one place to stand (null reads the physics' own: `ReactorPhysics.levelsAt` and
     * `tacticalEdges`): `G.levelsAt(x, y)` -> the heights a body can stand at on that cell, low to high;
     * `G.edges(x, y, d, height, jump)` -> every way on, `[{ kind, cost, height }]`.
     */
    G.levelsAt = null;
    G.edges = null;
    G.LEVELS = LEVELS;
    G.LEVEL_GAP = LEVEL_GAP;
    // A unit pulls itself up onto what stands no more than this many levels over its jump; higher takes a ladder.
    G.CLIMB_OVER = 1;

    function ensureGrid() {
        const w = $gameMap.width(), h = $gameMap.height();
        if (w === gw && h === gh && gCost) return;
        gw = w; gh = h;
        const size = w * h, nodes = size * LEVELS;
        gCost = new Float32Array(nodes);
        gPrev = new Int32Array(nodes);
        gHeight = new Float32Array(nodes);
        gHop = new Uint8Array(nodes);
        gKind = new Uint8Array(nodes);
        gOcc = new Uint8Array(size);
        gOccH = new Float32Array(size);
        sOcc = new Uint8Array(size);
        sOccH = new Float32Array(size);
        gBody = new Uint8Array(size);
        gBodyH = new Float32Array(size);
        gBodyN = new Float32Array(size);
        gBodyR = new Float32Array(size);
        gFace = new Uint8Array(nodes);
        gMark = new Uint8Array(nodes);
        gHeapCell = new Int32Array(nodes * 4 + 4);
        gHeapCost = new Float32Array(nodes * 4 + 4);
        gCost.fill(Infinity);
    }

    /** The node of a cell's level at height `h` in the flood under way: the one already there, else a free one; -1 when the cell is full. */
    function nodeFor(cell, h) {
        const base = cell * LEVELS;
        for (let s = 0; s < LEVELS; s++) {
            const node = base + s;
            if (gCost[node] === Infinity || Math.abs(gHeight[node] - h) < LEVEL_GAP) return node;
        }
        return -1;
    }

    /** After a flood: the node reached at a cell, the level nearest `h`, or the cheapest when `h` is not given; -1 when none. */
    function nodeAt(x, y, h) {
        if (!(x >= 0 && y >= 0 && x < gw && y < gh)) return -1;
        const base = (y * gw + x) * LEVELS;
        let best = -1;
        for (let s = 0; s < LEVELS; s++) {
            const node = base + s;
            if (gCost[node] === Infinity) break;
            if (h === undefined || h === null || !gDeep) { if (best < 0 || gCost[node] < gCost[best]) best = node; }
            else if (Math.abs(gHeight[node] - h) < LEVEL_GAP && (best < 0 || Math.abs(gHeight[node] - h) < Math.abs(gHeight[best] - h))) best = node;
        }
        return best;
    }

    /** Who stands on a cell at about that height: 0 nobody, 1 a friend, 2 anyone or anything else. */
    function occAt(cell, h) {
        const mark = gOcc[cell];
        if (!mark) return 0;
        if (!gDeep || Math.abs(gOccH[cell] - h) < LEVEL_GAP) return mark;
        for (let i = 0; i < gOccMore.length; i += 3) if (gOccMore[i] === cell && Math.abs(gOccMore[i + 1] - h) < LEVEL_GAP) return gOccMore[i + 2];
        return 0;
    }

    function setOcc(cell, h, mark) {
        if (!gOcc[cell]) { gOcc[cell] = mark; gOccH[cell] = h; return; }
        if (!gDeep || Math.abs(gOccH[cell] - h) < LEVEL_GAP) { if (mark > gOcc[cell]) gOcc[cell] = mark; return; }
        for (let i = 0; i < gOccMore.length; i += 3) {
            if (gOccMore[i] === cell && Math.abs(gOccMore[i + 1] - h) < LEVEL_GAP) { if (mark > gOccMore[i + 2]) gOccMore[i + 2] = mark; return; }
        }
        gOccMore.push(cell, h, mark);
    }

    /** The heights a body can stand at on a cell, low to high (one on a flat map); the list is shared: read it before the next call. */
    const levelOut = [];
    G.levelHeights = function(x, y) {
        levelOut.length = 0;
        if (!G.is3D()) { levelOut.push(0); return levelOut; }
        if (G.levelsAt) { for (const h of G.levelsAt(x, y) || EMPTY_LEVELS) levelOut.push(h); }
        else {
            const P = root.ReactorPhysics;
            if (P && P.levelsAt) for (const level of P.levelsAt($dataMap, x, y)) if (level.stand) levelOut.push(level.top);
        }
        if (!levelOut.length) levelOut.push(G.groundAt(x, y));
        return levelOut;
    };
    const EMPTY_LEVELS = [];

    /**
     * Whether a unit may stand on a cell at about `height` on a 3D map, so nobody wades in a fountain or stands on
     * its rim, a bench, a lamp or a fence. The world's own answer where it gives one (`G.standsAt(x, y, height)`,
     * a seam; else the physics' `tacticalStand`); otherwise the grid's rule over the physics' levels: a level a
     * body can stop on, in water no deeper than a wade, and when it is the top of a shape (a prop built on the
     * cell: a post, a rim, a seat) only one that covers the whole cell (a deck, a stage). Asked once per cell and
     * height while the battle's turn lasts. True where nobody says otherwise, and on a flat map.
     */
    G.standsAt = null;
    // How far from a cell's middle toward each side a shape's solid part must reach for its top to be a floor, in tiles.
    G.FLOOR_COVER = 0.4;
    // A top the physics calls no place to stop that lies this low over its cell's ground is a threshold: walked over.
    G.THRESHOLD = 0.3;
    const standMemo = new Map();
    let standKey = "";
    G.stands = function(x, y, height) {
        if (G.standsAt) return G.standsAt(x, y, height) !== false;
        const P = root.ReactorPhysics;
        if (P && P.tacticalStand) return P.tacticalStand($dataMap, x, y, height) !== false;
        if (!P || !P.levelsAt || !G.is3D()) return true;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        const key = (fight ? fight._serial + ":" + fight._turn : "") + ":" + $gameMap.mapId();
        if (key !== standKey) { standKey = key; standMemo.clear(); }
        const id = (y * 4096 + x) * 256 + Math.round(clamp(height, -8, 23.5) * 8 + 64);
        let known = standMemo.get(id);
        if (known === undefined) { known = standsNow(P, x, y, height); standMemo.set(id, known); }
        return known;
    };
    function standsNow(P, x, y, height) {
        let level = null, gap = 0.5 + 1e-6;
        for (const each of P.levelsAt($dataMap, x, y)) { const off = Math.abs(each.top - height); if (off < gap) { gap = off; level = each; } }
        // Not a level the physics lists (the middle of a slope): the step that led here was judged on its own.
        if (!level) return true;
        const R = Reactor3D;
        // The top of something nobody stands on (a fence, a post, a lamp); a door's threshold is the floor it lies on.
        if (!level.stand) return !!R.pieceBaseAt && level.top - R.pieceBaseAt($dataMap, x, y) <= G.THRESHOLD;
        if (R.waterDepthAt && R.hasWater && R.hasWater($dataMap) && R.waterDepthAt($dataMap, x + 0.5, y + 0.5, level.top) > (R.WATER_WADE || 0.45)) return false;
        return !R.isShapeKind || !R.isShapeKind(level.kind) || shapeFloors(R, x, y, level.top);
    }

    /**
     * Whether the shape whose top is a cell's level at `top` covers the cell (its middle and its four sides): a deck
     * or a stage, not a post, a rim or a seat. The map reads a shape's top over every cell it touches; here it is
     * asked where its solid part really is. A rock is ground wherever it is.
     */
    function shapeFloors(R, x, y, top) {
        const stack = R.piecesAt ? R.piecesAt($dataMap, x, y) : null;
        if (!stack || !R.shapeSolidAt || !R.shapeSize || !R.shapeCentre || !R.pieceBaseAt) return true;
        const base = R.pieceBaseAt($dataMap, x, y);
        let piece = null, under = -Infinity;
        for (const each of stack) {
            if (each.kind === "ladder") continue;
            let foot = each.z;
            if (R.isShapeKind(each.kind) && !Number.isFinite(each.rockTop) && Array.isArray(each.anchor)) foot += R.pieceBaseAt($dataMap, each.anchor[0], each.anchor[1]) - base;
            if (base + foot <= top + 1e-4 && foot >= under) { under = foot; piece = each; }
        }
        if (!piece || !R.isShapeKind(piece.kind) || piece.kind === "rock") return true;
        if (R.shapeTurned && R.shapeTurned(piece)) return false;
        const size = R.shapeSize(piece), centre = R.shapeCentre(piece), params = R.shapeParams ? R.shapeParams(piece) : null;
        const turn = ((Number(piece.angle) || 0) + (Number(piece.rot) || 0) * 90) * Math.PI / 180, cos = Math.cos(turn), sin = Math.sin(turn);
        for (let i = -1; i < 4; i++) {
            const px = x + 0.5 + (i < 0 ? 0 : DX[DIRS[i]] * G.FLOOR_COVER) - centre[0], pz = y + 0.5 + (i < 0 ? 0 : DY[DIRS[i]] * G.FLOOR_COVER) - centre[1];
            if (!R.shapeSolidAt(piece.kind, px * cos + pz * sin, -px * sin + pz * cos, size[0] / 2, size[2] / 2, 0, params ? params.sweep : undefined, params ? params.thick : undefined)) return false;
        }
        return true;
    }

    /** Whether a cell has more than one place to stand (cheap: the physics keeps its answer per map). */
    function manyLevels(x, y) {
        const P = root.ReactorPhysics;
        if (!G.edges && !(P && P.tacticalEdges)) return false;
        if (!(x >= 0 && y >= 0 && x < gw && y < gh)) return false;
        if (G.levelsAt) { const list = G.levelsAt(x, y); return !!list && list.length > 1; }
        if (!P || !P.levelsAt) return false;
        const list = P.levelsAt($dataMap, x, y);
        if (list.length < 2) return false;
        let stands = 0;
        for (const level of list) if (level.stand) stands++;
        return stands > 1;
    }

    // Every way on from a level of a cell, kept while the battle's turn lasts (a door that opens, a piece laid: the next turn asks again).
    const edgeMemo = new Map();
    let edgeMemoKey = "";
    function waysOn(x, y, d, height, jump) {
        const key = (typeof $gameFight !== "undefined" && $gameFight ? $gameFight._serial + ":" + $gameFight._turn : "") + ":" + (typeof $gameMap !== "undefined" ? $gameMap.mapId() : 0);
        if (key !== edgeMemoKey) { edgeMemo.clear(); edgeMemoKey = key; }
        const id = (((y * gw + x) * 4 + (d / 2 - 1)) * 64 + Math.round(clamp(height, -8, 23.5) * 2 + 16)) * 16 + clamp(Math.round(jump), 0, 15);
        let ways = edgeMemo.get(id);
        if (!ways) {
            ways = (G.edges ? G.edges(x, y, d, height, jump) : root.ReactorPhysics.tacticalEdges(x, y, d, height, jump)) || EMPTY_LEVELS;
            edgeMemo.set(id, ways);
        }
        return ways;
    }

    /**
     * The ways on from a cell at `height` in direction `d` for a unit of that jump: fills `landHeight`, `landKind`
     * and `landExtra` and returns how many. One nearly everywhere (canStep); onto a cell with more than one place
     * to stand, each of them the unit can get to (the walk under the eave and the mantle onto it).
     */
    function stepsFrom(x, y, d, height, jump, deep) {
        landCount = 0;
        const x2 = x + DX[d], y2 = y + DY[d];
        if (deep && manyLevels(x2, y2)) {
            if (!$gameMap.isValid(x2, y2) || !($gameMap.isPassable(x, y, d) && $gameMap.isPassable(x2, y2, 10 - d))) return 0;
            const natural = Reactor3D.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, height) || 0;
            for (const way of waysOn(x, y, d, height, jump)) {
                if (!way || way.kind === "blocked" || landCount >= landHeight.length) continue;
                const to = Number.isFinite(way.height) ? way.height : height;
                if (way.kind === "mantle" && to - height > jump + G.CLIMB_OVER + 0.01) continue;
                const kind = Math.max(0, KINDS.indexOf(way.kind || "walk"));
                // A plain walk onto the ground the step naturally lands on still answers to the slope between the two cells.
                if (kind === 0 && Math.abs(to - natural) < 0.5 && Reactor3D.terrainBlocks($dataMap, x, y, x2, y2, height)) continue;
                const extra = Math.max(0, (Number(way.cost) || 1) - 1);
                let known = -1;
                for (let i = 0; i < landCount; i++) if (Math.abs(landHeight[i] - to) < LEVEL_GAP) known = i;
                if (known >= 0) { if (extra < landExtra[known]) { landHeight[known] = to; landKind[known] = kind; landExtra[known] = extra; } continue; }
                landHeight[landCount] = to; landKind[landCount] = kind; landExtra[landCount] = extra;
                landCount++;
            }
            return landCount;
        }
        if (!canStep(x, y, d, height, jump, deep)) return 0;
        landHeight[0] = stepHeight; landKind[0] = stepHop ? Math.max(0, KINDS.indexOf(stepKind)) : 0; landExtra[0] = stepExtra;
        landCount = 1;
        return 1;
    }

    /** Whether heights count here: a 3D map with the 3D world loaded. Everything reads level on a 2D map. */
    G.is3D = function() {
        return typeof Reactor3D !== "undefined" && !!Reactor3D && !!Reactor3D.isMap3D && !!Reactor3D.groundHeightAt && !!Reactor3D.terrainBlocks
            && typeof $dataMap !== "undefined" && !!$dataMap && !!Reactor3D.isMap3D($dataMap);
    };

    /** The ground a character stands on, in tiles (0 on a 2D map). */
    G.heightOf = function(character) {
        if (!character || !G.is3D()) return 0;
        if (Number.isFinite(character._reactorGround)) return character._reactorGround;
        return Reactor3D.groundHeightAt($dataMap, character.x + 0.5, character.y + 0.5) || 0;
    };

    /** The ground at a cell, nearest the height `near`. */
    G.groundAt = function(x, y, near) {
        return G.is3D() ? Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, near) || 0 : 0;
    };

    /** What entering a cell costs: 1, a Set Terrain Cost for its region or terrain tag (0 shuts it), 2 for a bush or wading. */
    G.cellCost = function(fight, x, y, height, deep) {
        let cost = 1;
        const costs = fight._costs;
        if (costs) {
            const region = costs.region[$gameMap.regionId(x, y)], terrain = costs.terrain[$gameMap.terrainTag(x, y)];
            if (region !== undefined) cost = region;
            else if (terrain !== undefined) cost = terrain;
            if (cost <= 0) return 0;
        }
        if ($gameMap.isBush(x, y)) cost = Math.max(cost, F.ROUGH_COST);
        if (deep && Reactor3D.waterDepthAt && Reactor3D.waterDepthAt($dataMap, x + 0.5, y + 0.5, height) > 0.12) cost = Math.max(cost, F.ROUGH_COST);
        return cost;
    };

    /**
     * Whether a step from a cell at `height` in direction `d` can be taken by a unit of that jump. Leaves
     * the height it arrives at in `stepHeight`, and in `stepHop` whether the rise is a hop, not a walk.
     */
    function canStep(x, y, d, height, jump, deep) {
        const x2 = x + DX[d], y2 = y + DY[d];
        if (!$gameMap.isValid(x2, y2)) return false;
        stepKind = "walk"; stepExtra = 0; stepHop = false; stepHeight = 0;
        const open = $gameMap.isPassable(x, y, d) && $gameMap.isPassable(x2, y2, 10 - d);
        if (!deep) return open;
        const to = Reactor3D.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, height) || 0;
        const limit = Reactor3D.TERRAIN_SLOPE_LIMIT || 0.75;
        // A level step the tiles allow is a walk: nothing else is asked (nearly every step of a flood).
        const level = Math.abs(to - height) <= limit;
        if (open && level && !Reactor3D.terrainBlocks($dataMap, x, y, x2, y2, height)) { stepHeight = to; return true; }
        // Anything else is the world's to say, where it can (G.edge): a hop, a mantle, a ladder, a drop, or no way.
        if (G.edge) {
            const edge = G.edge(x, y, d, height, jump);
            if (edge) {
                if (edge.kind === "blocked") return false;
                stepHeight = Number.isFinite(edge.height) ? edge.height : height;
                stepKind = edge.kind || "walk";
                if (stepKind === "mantle" && stepHeight - height > jump + G.CLIMB_OVER + 0.01) return false;
                stepHop = stepKind !== "walk";
                stepExtra = Math.max(0, (Number(edge.cost) || 1) - 1);
                return true;
            }
        }
        if (!open) return false;
        stepHeight = to;
        if (!Reactor3D.terrainBlocks($dataMap, x, y, x2, y2, height)) return true;
        // Too steep to walk: a unit hops a rise within its jump, and drops one level further than it climbs.
        const rise = to - height;
        if (jump <= 0 || level) return false;
        if (rise > jump + 0.01 || rise < -(jump + 1) - 0.01) return false;
        if (Reactor3D.waterDepthAt && Reactor3D.waterDepthAt($dataMap, x2 + 0.5, y2 + 0.5, to) > (Reactor3D.WATER_WADE || 0.45)) return false;
        stepHop = true;
        stepKind = "hop";
        return true;
    }

    /** Whether a body walks on the level from a cell to the next toward `d` (6 or 2): no wall, ridge or step between the two. */
    function levelWalk(x, y, d, height, deep) {
        const x2 = x + DX[d], y2 = y + DY[d];
        if (!$gameMap.isPassable(x, y, d) || !$gameMap.isPassable(x2, y2, 10 - d)) return false;
        if (!deep) return true;
        if (Reactor3D.terrainBlocks($dataMap, x, y, x2, y2, height)) return false;
        if (G.edge) { const edge = G.edge(x, y, d, height, 0); if (edge && edge.kind !== "walk") return false; }
        return true;
    }

    /**
     * What a big body needs to know of a cell, as the bits of `gBody`: whether a body stands on it (open ground,
     * nothing a tile or the map shuts), and whether it walks on east and south from it. The cell is read at the
     * ground it has nearest `near` (the height of the body's cell beside it), which is kept in `gBodyH`: whoever
     * asks judges the step between the two. Read once per cell and kept while the battle's turn lasts, as the ways
     * on are (`refreshBodies`; a cell asked about from another floor is read again).
     */
    function bodyBits(fight, x, y, near, deep) {
        const cell = y * gw + x;
        let bits = gBody[cell];
        // Known from this floor: asked from the same height before, or the ground kept is a walker's step from it.
        if ((bits & 1) && (!deep || Math.abs(gBodyN[cell] - near) < 0.3 || Math.abs(gBodyH[cell] - near) <= bodySlope)) return bits;
        bits = 1;
        const ground = deep ? Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, near) || 0 : 0;
        gBodyH[cell] = ground; gBodyN[cell] = near;
        // The room over it: up to the foot of the lowest thing that hangs over the cell (a deck, an eave, a lintel).
        const P = deep ? root.ReactorPhysics : null;
        gBodyR[cell] = P && P.ceilingAbove ? P.ceilingAbove($dataMap, x, y, ground) - ground : Infinity;
        if (!G.blocksSight(x, y) && G.cellCost(fight, x, y, ground, false) > 0 && (!deep || G.stands(x, y, ground))) {
            bits |= 2;
            bits |= 4 | (x + 1 < gw && levelWalk(x, y, 6, ground, deep) ? 8 : 0);
            bits |= 16 | (y + 1 < gh && levelWalk(x, y, 2, ground, deep) ? 32 : 0);
        }
        gBody[cell] = bits;
        return bits;
    }
    // The rise between two cells a body lies across: the one a walker takes between two cells (set as a flood or a search begins).
    let bodySlope = 0.75;
    // The ground under the body's cells as `fits` reads them: the row the unit's own cell is in, and the row last read.
    const bodyRow = new Float32Array(64), bodyLast = new Float32Array(64);
    // The body `fits` is asked about (`bodyAs`): how tall it stands over its middle and at its rim (0: nobody asks
    // about the room over it), and its hulls by facing (null: nothing sticks out of it).
    let bodyTall = 0, bodyRim = 0, bodyHulls = null;
    function bodyAs(tall, hulls) {
        bodyTall = tall > 0 ? tall : 0;
        bodyRim = F.rimOf(bodyTall);
        bodyHulls = hulls || null;
    }
    let bodyKey = "";
    /** What the grid kept of the map for this turn (the ways on from each cell, where a big body has room) is read again. */
    G.forget = function() { edgeMemo.clear(); edgeMemoKey = ""; standMemo.clear(); standKey = ""; bodyKey = ""; if (gBody) gBody.fill(0); };
    function refreshBodies(fight) {
        const key = fight._serial + ":" + fight._turn + ":" + $gameMap.mapId() + ":" + (fight._costs ? fight._costs.rev : 0) + ":" + feetRev;
        if (key === bodyKey) return;
        bodyKey = key;
        if (gBody) gBody.fill(0);
    }

    /**
     * Whether a body fits with the unit on cell (ax, ay) standing at `height`; `rects[at..at + 3]` is the body's
     * first cell from the unit's own and its size. Every cell under it is free and open, and the ground runs on
     * from each cell to the next with no more rise than a walker takes between two cells, and no wall or ridge
     * between them; no cell's ground is further from the unit's own than the body leans (`F.BODY_LEAN`), and what
     * hangs over a cell leaves the body room (its whole height over its middle half, its rim's elsewhere:
     * `bodyAs`). The cells are read outward from the unit's own, each at the ground nearest the one beside it. What
     * sticks out of the body (a gun's barrel) has room too (`overFits`). Who stands where is the flood's (or,
     * between `standingBegin` and `standingEnd`, the field as it is now).
     */
    function fits(fight, ax, ay, rects, at, height, deep) {
        const x0 = ax + rects[at], y0 = ay + rects[at + 1], w = rects[at + 2], h = rects[at + 3];
        if (x0 < 0 || y0 < 0 || x0 + w > gw || y0 + h > gh) return false;
        const hull = bodyHulls ? bodyHulls[at >> 2] : null, over = hull ? hull.over : null;
        if (!deep) {
            for (let y = y0; y < y0 + h; y++) {
                for (let x = x0; x < x0 + w; x++) {
                    if (gOcc[y * gw + x] !== 0) return false;
                    const bits = bodyBits(fight, x, y, 0, false);
                    if (!(bits & 2) || (x + 1 < x0 + w && !(bits & 8)) || (y + 1 < y0 + h && !(bits & 32))) return false;
                }
            }
            return !over || overFits(fight, ax, ay, over, x0, y0, w, h, 0, 0, false);
        }
        bodySlope = Reactor3D.TERRAIN_SLOPE_LIMIT || 0.75;
        // A body is drawn level at the height its own cell stands at: the ground under its ends is no further from
        // that than a share of its height (a walker's step for a low one), or an end would hang in the air or lie buried.
        const lean = Math.max(bodySlope, bodyTall * F.BODY_LEAN);
        // The unit's own cell is one of its body's (a body is measured round it); a rectangle that leaves it out is read from its nearest cell.
        const cx = clamp(ax, x0, x0 + w - 1), cy = clamp(ay, y0, y0 + h - 1);
        // The unit's own row first, west and east of its cell; then the rows above it and the rows below, each cell from the one beside it toward that row.
        let near = height;
        for (let x = cx; x >= x0; x--) {
            near = fitCell(fight, x, cy, near, x0, y0, w, h);
            if (near !== near || Math.abs(near - height) > lean) return false;
            bodyRow[x - x0] = near;
        }
        near = bodyRow[cx - x0];
        for (let x = cx + 1; x < x0 + w; x++) {
            near = fitCell(fight, x, cy, near, x0, y0, w, h);
            if (near !== near || Math.abs(near - height) > lean) return false;
            bodyRow[x - x0] = near;
        }
        for (let side = 0; side < 2; side++) {
            for (let i = 0; i < w; i++) bodyLast[i] = bodyRow[i];
            for (let y = side ? cy + 1 : cy - 1; side ? y < y0 + h : y >= y0; y += side ? 1 : -1) {
                for (let x = x0; x < x0 + w; x++) {
                    const ground = fitCell(fight, x, y, bodyLast[x - x0], x0, y0, w, h);
                    if (ground !== ground || Math.abs(ground - height) > lean) return false;
                    // Along the row too: the step from the cell to its west is one a walker takes.
                    if (x > x0 && Math.abs(ground - bodyLast[x - x0 - 1]) > bodySlope) return false;
                    bodyLast[x - x0] = ground;
                }
            }
        }
        return !over || overFits(fight, ax, ay, over, x0, y0, w, h, height, lean, true);
    }

    /**
     * Whether what sticks out of a body has room, the unit on cell (ax, ay): on every cell of `over` (from the
     * unit's own) nobody stands, and it is open ground no higher over the ground the body stands on than the body
     * leans, with no wall between it and the cell beside it toward the body. Ground more than a walker's step
     * under the body's is air under a barrel (a ledge, a basin): only who stands there is asked. A cell off the
     * map holds nothing.
     */
    function overFits(fight, ax, ay, over, x0, y0, w, h, height, lean, deep) {
        for (let i = 0; i < over.length; i += 2) {
            const x = ax + over[i], y = ay + over[i + 1];
            if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
            const cell = y * gw + x, bits = bodyBits(fight, x, y, height, deep);
            if (deep) {
                if (occAt(cell, height) !== 0) return false;
                const rise = gBodyH[cell] - height;
                if (rise > lean) return false;
                if (rise < -bodySlope) continue;
            } else if (gOcc[cell] !== 0) return false;
            if (!(bits & 2)) return false;
            // Beside the body's rows or its columns (not off a corner): the way from the cell toward the body is open.
            const inRows = y >= y0 && y < y0 + h, inColumns = x >= x0 && x < x0 + w;
            if (inRows && !inColumns) {
                const west = x < x0 ? bits : bodyBits(fight, x - 1, y, height, deep);
                if (!(west & 8)) return false;
            } else if (inColumns && !inRows) {
                const north = y < y0 ? bits : bodyBits(fight, x, y - 1, height, deep);
                if (!(north & 32)) return false;
            }
        }
        return true;
    }

    /** One cell of a body for `fits`: the ground it has beside `near`, or NaN when a body cannot lie on it from there. */
    function fitCell(fight, x, y, near, x0, y0, w, h) {
        const cell = y * gw + x, bits = bodyBits(fight, x, y, near, true), ground = gBodyH[cell];
        if (!(bits & 2) || Math.abs(ground - near) > bodySlope || occAt(cell, ground) !== 0) return NaN;
        if ((x + 1 < x0 + w && !(bits & 8)) || (y + 1 < y0 + h && !(bits & 32))) return NaN;
        if (gBodyR[cell] < bodyTall && !roomOver(gBodyR[cell], x, y, x0, y0, w, h)) return NaN;
        return ground;
    }

    /** Whether `room` over a cell is enough for the body there: its whole height over its middle half, its rim's elsewhere. */
    function roomOver(room, x, y, x0, y0, w, h) {
        const middle = Math.abs(x + 0.5 - (x0 + w / 2)) <= w / 4 + 1e-6 && Math.abs(y + 0.5 - (y0 + h / 2)) <= h / 4 + 1e-6;
        return room >= (middle ? bodyTall : bodyRim) - 1e-6;
    }

    function heapPush(cell, cost) {
        if (gHeapSize >= gHeapCell.length) return;
        let i = gHeapSize++;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (gHeapCost[parent] <= cost) break;
            gHeapCell[i] = gHeapCell[parent]; gHeapCost[i] = gHeapCost[parent];
            i = parent;
        }
        gHeapCell[i] = cell; gHeapCost[i] = cost;
    }

    function heapPop() {
        const top = gHeapCell[0];
        const cell = gHeapCell[--gHeapSize], cost = gHeapCost[gHeapSize];
        let i = 0;
        for (;;) {
            let child = i * 2 + 1;
            if (child >= gHeapSize) break;
            if (child + 1 < gHeapSize && gHeapCost[child + 1] < gHeapCost[child]) child++;
            if (gHeapCost[child] >= cost) break;
            gHeapCell[i] = gHeapCell[child]; gHeapCost[i] = gHeapCost[child];
            i = child;
        }
        gHeapCell[i] = cell; gHeapCost[i] = cost;
        return top;
    }

    //-------------------------------------------------------------------------
    // A unit's body: the cells it stands on. A size typed on the event (the
    // map's `reactor3d.eventSize`) is taken as typed. A unit with none takes
    // the cells its model's body covers, the rule a model event's Auto size
    // follows outside battles (the cells `Reactor3D.eventModelContains`
    // blocks), turned with the way the unit faces: placed units, units that
    // wear their record's model, spawned units and party members alike. A
    // model no more than F.BODY_ONE tiles across (a figure) stands on one
    // cell. A thin end of a model (a gun's barrel) is no part of the body:
    // it sticks out over cells nobody else stands on (`F.overhang`). On a
    // flat map a picture wider than a figure stands on the cells it covers,
    // as many east of its own as west. Everyone else stands on one cell.

    const foot = { ox: 0, oy: 0, w: 1, h: 1 };
    // What is known of each unit's body, by unit id: `rects` holds `ox, oy, w, h` for each facing (2, 4, 6, 8).
    const feet = new Map();
    let feetRev = 1;
    // The characters whose body is another shape facing another way, and the unit each is; and whether there is any.
    let turners = new WeakMap(), anyTurner = false;
    const turnerList = [];
    // Whether any unit measured in this battle has something sticking out of its body (`over`).
    let anyOver = false;
    // A unit weighed as if it faced another way (the AI on a cell it would arrive on, the cursor's preview of a move).
    const assumed = { unit: null, d: 0 };
    // The character taking a step of its way: its turn is the way's, not asked about again.
    let stepping = null;
    // Units whose body was measured anew and may not fit where they stand.
    const unsettled = [];
    F.FOOT_MAX = 64;
    // Frames before a unit's look is read again (a page that gives it another model), and while its model is still on its way.
    F.FOOT_REFRESH = 120;
    F.FOOT_PENDING = 10;
    // How far from where it was put a body that does not fit may be put, in cells: further is no longer where its author meant it.
    F.SETTLE_REACH = 10;
    const ONE_CELL = Int16Array.of(0, 0, 1, 1);
    // A thing lifted this far over the ground is over a unit's head: it is in nobody's way.
    F.OVERHEAD = 2.5;
    // A body of many cells stands as tall as its model over its middle half only; round that, at its rim, this share
    // of its height (never less than BODY_RIM_LEAST tiles): what the pointer meets, and the room it needs under an eave.
    F.BODY_RIM = 0.4;
    F.BODY_RIM_LEAST = 0.6;
    F.rimOf = tall => Math.min(tall, Math.max(F.BODY_RIM_LEAST, tall * F.BODY_RIM));
    // How far over or under the ground at its own cell the ground under a body may be, as a share of its height
    // (a walker's step at the least): the model is drawn level, so a long body lies along a gentle slope only.
    F.BODY_LEAN = 0.25;
    // A part at an end of a model narrower than this share of what most of the model is across (a gun's barrel, a
    // boom, a tail) sticks out of the body: the body ends where that part begins.
    F.BODY_THIN = 0.4;

    const facingIndex = d => (d === 4 ? 1 : d === 6 ? 2 : d === 8 ? 3 : 0);

    /** Every body is measured again when next asked about (a battle starts, a map's data changed), and so is the ground under them. */
    F.forgetFootprints = function() { feetRev++; if (G.forget) G.forget(); };

    // A model's body by the way it faces, measured once per model, size and facing: its box and the cells in it.
    const modelBodies = new Map();
    const bodyProbe = { _x: 0, _y: 0, _realX: 0, _realY: 0, isMoving: () => false };

    /** Whether a model's file has arrived: its body cannot be measured before. */
    function modelArrived(R, spec) {
        const entry = R._glbCache && R._glbCache[R.collisionKeysFor(spec).model];
        return !!(entry && entry.template && entry.template.userData && entry.template.userData.glbSize);
    }

    // Where the bulk of a model is, by its mask: `{ x0, x1, z0, z1 }` in the mask's own frame, in tiles (infinite at an end with nothing thin).
    const bulks = new WeakMap();

    /**
     * The mask's bounds without what sticks out thin at either end of each axis: the quarter-tile slices across the
     * model's length, then those across its width, in which the mesh reaches less far from side to side than
     * F.BODY_THIN of what it does in the middle one of them (so a part is thin beside most of the model, not beside
     * its widest: a fuselage is no thin end of its wings). Worked out once per mask.
     */
    function bulkOf(mask) {
        let kept = bulks.get(mask);
        if (kept) return kept;
        const sub = mask.sub, i0 = Math.round(mask.minX * sub), i1 = Math.round(mask.maxX * sub) - 1, j0 = Math.round(mask.minZ * sub), j1 = Math.round(mask.maxZ * sub) - 1;
        let a = i0, b = i1, c = j0, d = j1;
        const spans = [], sorted = [];
        const trim = (columns, from, to, lo, hi) => {
            spans.length = 0;
            for (let k = from; k <= to; k++) {
                let low = hi + 1, high = lo - 1;
                for (let m = lo; m <= hi; m++) if (columns ? mask.has(k, m) : mask.has(m, k)) { if (m < low) low = m; high = m; }
                spans.push(high >= low ? high - low + 1 : 0);
            }
            sorted.length = 0;
            for (const n of spans) sorted.push(n);
            sorted.sort((p, q) => p - q);
            const thin = (sorted[sorted.length >> 1] || 0) * F.BODY_THIN;
            let first = 0, last = spans.length - 1;
            while (first < last && spans[first] < thin) first++;
            while (last > first && spans[last] < thin) last--;
            return [from + first, from + last];
        };
        if (i1 >= i0 && j1 >= j0) {
            [a, b] = trim(true, i0, i1, j0, j1);
            [c, d] = trim(false, j0, j1, a, b);
        }
        // An end nothing was cut from bounds nothing: every cell the model takes there is the body's.
        kept = { x0: a > i0 ? a / sub : -Infinity, x1: b < i1 ? (b + 1) / sub : Infinity, z0: c > j0 ? c / sub : -Infinity, z1: d < j1 ? (d + 1) / sub : Infinity };
        bulks.set(mask, kept);
        return kept;
    }

    /**
     * The cells a model covers round its own when it faces `d`: `{ ox, oy, w, h, cells: [dx, dy, ...], over }`. The
     * rectangle is the box of the cells the bulk of the model reaches (`bulkOf`); `over` lists, as `cells` does, the
     * cells outside it that only a thin end of the model is over (a gun's barrel at chest height): null when none.
     * `cells` holds every cell the model blocks.
     */
    function modelBody(R, character, spec, d) {
        const front = spec.faces && spec.faces.front;
        const key = R.collisionKeysFor(spec).pose + "|" + (spec.yaw || 0) + "|" + (front ? front[0] + "," + front[1] + "," + front[2] : "") + "|" + d;
        let body = modelBodies.get(key);
        if (body) return body;
        const shape = R.eventModelFootprint(character, spec, R.eventModelWorldYaw(character, spec, d));
        const reach = Math.min(F.FOOT_MAX - 1, Math.ceil(Math.hypot(shape.rawX, shape.rawZ)) + 1);
        const mask = shape.mask, outline = mask && mask.has && mask.sub > 0 && mask.blocksTile ? mask : null;
        // A quarter turn's cosine is not quite 0: a tile's middle is put where it is to the mask's quarter tiles, or
        // the tile beside a hull's corner is taken on one side and not on the other.
        const exact = value => Math.round(value * 1e9) / 1e9;
        const bulk = outline ? bulkOf(outline) : null, cos = exact(Math.cos(shape.yaw)), sin = exact(Math.sin(shape.yaw));
        let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
        const cells = [], thin = [];
        for (let y = -reach; y <= reach; y++) {
            for (let x = -reach; x <= reach; x++) {
                // The tile's middle in the model's own frame, asked of the mask as the map asks it (`eventModelContains`).
                const lx = exact(x * cos - y * sin), lz = exact(x * sin + y * cos);
                if (!(outline ? outline.blocksTile(lx, lz) : R.eventModelContains(bodyProbe, shape, x, y))) continue;
                cells.push(x, y);
                if (bulk && (lx < bulk.x0 - 1e-6 || lx > bulk.x1 + 1e-6 || lz < bulk.z0 - 1e-6 || lz > bulk.z1 + 1e-6)) { thin.push(x, y); continue; }
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        const over = [];
        for (let i = 0; i < thin.length; i += 2) if (thin[i] < x0 || thin[i] > x1 || thin[i + 1] < y0 || thin[i + 1] > y1) over.push(thin[i], thin[i + 1]);
        // The mesh itself in the model's own frame, for whoever asks how big it really is and for the pointer: half
        // its width and length, its middle from the unit's cell, and the way it is turned.
        body = { ox: x0, oy: y0, w: Math.min(F.FOOT_MAX, x1 - x0 + 1), h: Math.min(F.FOOT_MAX, y1 - y0 + 1), cells, over: over.length ? Int16Array.from(over) : null,
            hx: mask ? (mask.maxX - mask.minX) / 2 : shape.rawX, hz: mask ? (mask.maxZ - mask.minZ) / 2 : shape.rawZ,
            mx: mask ? (mask.maxX + mask.minX) / 2 : 0, mz: mask ? (mask.maxZ + mask.minZ) / 2 : 0, cos, sin,
            mask: outline };
        modelBodies.set(key, body);
        return body;
    }

    /** Whether two bodies of a model are the same cells: the rectangle and what sticks out of it. */
    function sameCells(a, b) {
        if (a.ox !== b.ox || a.oy !== b.oy || a.w !== b.w || a.h !== b.h) return false;
        const p = a.over, q = b.over;
        if (!p || !q) return p === q;
        if (p.length !== q.length) return false;
        for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
        return true;
    }
    // A model no wider and no longer than this many tiles stands on one cell: a figure a little larger than a tile
    // (a tall soldier with its feet apart) is a figure, not a vehicle, and overhangs the cells beside it by half a
    // tile at most. Anything larger takes every cell under it.
    F.BODY_ONE = 2;

    const modelWorld = () => {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        return R && R.characterModelSpec && R.eventModelFootprint && R.eventModelContains && R.eventModelWorldYaw && R.collisionKeysFor ? R : null;
    };

    function setRect(rects, index, ox, oy, w, h) {
        rects[index * 4] = ox; rects[index * 4 + 1] = oy; rects[index * 4 + 2] = w; rects[index * 4 + 3] = h;
    }

    function measureFoot(fight, unit, entry) {
        const character = fight.character(unit), rects = entry.rects;
        entry.character = character; entry.single = true; entry.turns = false; entry.wait = F.FOOT_REFRESH; entry.source = ""; entry.tall = 1.8;
        entry.hulls = null;
        entry.same.fill(1);
        for (let i = 0; i < 4; i++) setRect(rects, i, 0, 0, 1, 1);
        if (!character) return;
        measureBody(unit, entry, character, rects);
        entry.tall = standingHeight(character, entry.single);
    }
    function measureBody(unit, entry, character, rects) {
        const sidecar = typeof $dataMap !== "undefined" && $dataMap ? $dataMap.reactor3d : null;
        const raw = unit.eventId && sidecar && sidecar.eventSize ? sidecar.eventSize[String(unit.eventId)] : null;
        if (Array.isArray(raw)) {
            const w = clamp(Math.floor(Number(raw[0])) || 1, 1, F.FOOT_MAX), h = clamp(Math.floor(Number(raw[1])) || 1, 1, F.FOOT_MAX);
            const centred = sidecar.eventSizeAnchor === "center";
            for (let i = 0; i < 4; i++) setRect(rects, i, centred ? 0 - Math.floor((w - 1) / 2) : 0, centred ? 0 - Math.floor((h - 1) / 2) : 0, w, h);
            entry.single = w === 1 && h === 1; entry.source = "size";
            return;
        }
        const R = modelWorld();
        let spec = null;
        if (R) { try { spec = R.characterModelSpec(character); } catch (error) { spec = null; } }
        if (spec) {
            if (!modelArrived(R, spec)) { entry.wait = F.FOOT_PENDING; entry.source = "pending"; return; }
            entry.source = "model";
            const first = modelBody(R, character, spec, 2);
            if (Math.max(first.hx, first.hz) * 2 <= F.BODY_ONE + 1e-6) return;
            const hulls = entry.hullsKept || (entry.hullsKept = [null, null, null, null]);
            for (let i = 0; i < 4; i++) {
                const body = hulls[i] = modelBody(R, character, spec, DIRS[i]);
                setRect(rects, i, body.ox, body.oy, body.w, body.h);
                if (body.w > 1 || body.h > 1) entry.single = false;
            }
            if (entry.single) return;
            entry.hulls = hulls;
            // Which of its four bodies are the same cells (the rectangle and what sticks out of it): one that is not turns.
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    const same = sameCells(hulls[i], hulls[j]);
                    entry.same[i * 4 + j] = same ? 1 : 0;
                    if (!same) entry.turns = true;
                }
                if (hulls[i].over) anyOver = true;
            }
            return;
        }
        if (G.is3D() || typeof ImageManager === "undefined" || !character.characterName || !character.characterName()) return;
        if (character.tileId && character.tileId() > 0) return;
        let width = 0;
        try {
            const name = character.characterName(), bitmap = ImageManager.loadCharacter(name);
            if (!bitmap || !bitmap.isReady || !bitmap.isReady()) { entry.wait = F.FOOT_PENDING; entry.source = "pending"; return; }
            width = bitmap.width / (ImageManager.isBigCharacter(name) ? 3 : 12);
        } catch (error) {
            return;
        }
        // A picture is drawn with its middle over its own cell's and stands on its bottom edge. Up to F.BODY_ONE tiles
        // wide it is a figure on one cell, as a model is; a wider one takes its own cell and every cell either side
        // it covers half of or more (so as many east as west), half as many deep, behind its feet.
        const tiles = width / $gameMap.tileWidth();
        if (tiles <= F.BODY_ONE + 1e-6) return;
        const w = clamp(Math.floor(tiles / 2 + 1e-6) * 2 + 1, 1, F.FOOT_MAX), h = Math.max(1, Math.round(w / 2));
        if (w === 1) return;
        for (let i = 0; i < 4; i++) setRect(rects, i, 0 - Math.floor((w - 1) / 2), 1 - h, w, h);
        entry.single = false; entry.source = "picture";
    }

    /**
     * How tall a character stands, in tiles: its model's height on a 3D map. On a flat map, what stands over its
     * cell's bottom edge: a one-cell unit drawn from a model is fitted to F.FLAT_TALL, a bigger one is as tall as
     * its model, a sheet's picture as tall as one of its frames.
     */
    function standingHeight(character, single) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        try {
            if (G.is3D()) return clamp((R.characterHeightTiles && R.characterHeightTiles(character)) || 1.8, 0.5, 12);
            if (R && R.characterModelSpec && R.characterModelSpec(character)) {
                return single ? F.FLAT_TALL : clamp((R.characterHeightTiles && R.characterHeightTiles(character)) || 1.8, 0.5, 12);
            }
            const name = character.characterName ? character.characterName() : "";
            if (name && typeof ImageManager !== "undefined" && !(character.tileId && character.tileId() > 0)) {
                const bitmap = ImageManager.loadCharacter(name);
                if (bitmap && bitmap.isReady && bitmap.isReady()) return clamp(bitmap.height / (ImageManager.isBigCharacter(name) ? 4 : 8) / $gameMap.tileHeight(), 1, 12);
            }
        } catch (error) {
            return 1.8;
        }
        return 1;
    }
    // How tall a unit drawn from a 3D model stands on a flat map, in tiles, at the most (its body one cell).
    F.FLAT_TALL = 1.5;

    // On a flat map a unit drawn from a 3D model is a picture of it from the map's pitch: a figure three tiles tall
    // is two tiles of picture, over the cell behind it. In a Tactical battle a one-cell unit is drawn no taller than
    // F.FLAT_TALL cells, so every cell shows who stands on it; one that covers more cells is drawn as big as it is.
    const flatFits = new WeakMap();
    // How much of its height a standing figure shows from the flat map's pitch, and what its feet and head add, in tiles.
    F.FLAT_PITCH = 0.574;
    F.FLAT_MARGIN = 0.3;
    // How much brighter than evenly lit a unit's picture is drawn on a flat map while the battle runs.
    F.FLAT_LIGHT = 0.25;

    /** What a flat map's picture of this character is scaled by: 1 for anyone who is no unit of a Tactical battle here. Eased, and kept per character. */
    F.flatFit = function(character) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        let kept = flatFits.get(character);
        if (!fight || !fight._active || fight._mode !== "tactical" || !fight.isHere() || G.is3D()) {
            if (!kept || kept.now === 1) return 1;
            kept.want = 1;
        } else {
            const frame = frameNow();
            if (!kept) { kept = { serial: -1, at: -1e9, want: 1, now: 1, unit: false }; flatFits.set(character, kept); }
            if (kept.serial !== fight._serial || frame - kept.at >= 30 || frame < kept.at) {
                kept.serial = fight._serial; kept.at = frame;
                const unit = typeof character.eventId === "function" ? fight.unitOfEvent(character.eventId()) : fight._units.find(each => each.party && !each.gone && fight.character(each) === character) || null;
                kept.unit = !!unit;
                kept.want = 1;
                if (unit && !F.isBig(unit)) {
                    const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
                    let tall = 1.8;
                    try { tall = (R && R.characterHeightTiles && R.characterHeightTiles(character)) || 1.8; } catch (error) { tall = 1.8; }
                    kept.want = clamp(F.FLAT_TALL / (tall * F.FLAT_PITCH + F.FLAT_MARGIN), 0.2, 1);
                }
            }
        }
        if (kept.now !== kept.want) kept.now = Math.abs(kept.want - kept.now) < 0.01 ? kept.want : kept.now + (kept.want - kept.now) * 0.2;
        return kept.now;
    };

    /** How much light a flat map's picture of this character gets on top of its own: F.FLAT_LIGHT for a unit of a Tactical battle here, else 0. */
    F.flatLight = function(character) {
        const kept = flatFits.get(character);
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        return kept && kept.unit && fight && fight._active && fight._mode === "tactical" && fight.isHere() && !G.is3D() ? F.FLAT_LIGHT : 0;
    };

    /** How tall a unit stands, in tiles (kept with its body: read as often as wanted). */
    F.unitHeight = function(unit) {
        const entry = unit ? footOf(unit) : null;
        return entry ? entry.tall : 1.8;
    };

    /** What is known of a unit's body, measured when first asked and again every so often. */
    function footOf(unit) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!fight || typeof $gameMap === "undefined" || !$gameMap) return null;
        const frame = frameNow(), map = typeof $dataMap !== "undefined" ? $dataMap : null;
        let entry = feet.get(unit.id);
        if (entry && entry.unit === unit && entry.rev === feetRev && entry.map === map && frame >= entry.at && frame - entry.at < entry.wait) return entry;
        if (!entry || entry.unit !== unit) {
            entry = { unit, rev: 0, map: null, at: 0, wait: 0, character: null, single: true, turns: false, source: "", sum: 0, tall: 1.8, rects: new Int16Array(16), same: new Uint8Array(16).fill(1), hulls: null, hullsKept: null };
            feet.set(unit.id, entry);
        }
        entry.rev = feetRev; entry.map = map; entry.at = frame;
        measureFoot(fight, unit, entry);
        if (entry.turns && entry.character) {
            anyTurner = true;
            if (turners.get(entry.character) !== unit) { turners.set(entry.character, unit); if (!turnerList.includes(entry.character)) turnerList.push(entry.character); }
        }
        // A body that is not the one known before may not fit where the unit stands (F.settle looks).
        let sum = 0;
        if (!entry.single) for (let i = 0; i < 16; i++) sum = (Math.imul(sum, 31) + entry.rects[i] + 97) | 0;
        if (sum !== entry.sum) {
            entry.sum = sum;
            if (sum && !unsettled.includes(unit.id)) unsettled.push(unit.id);
        }
        return entry;
    }

    /**
     * The cells a unit stands on: `{ ox, oy, w, h }`, its first cell from the character's own and its size, as it
     * faces now. The object is shared: read it before the next call.
     */
    F.footprint = function(unit) {
        const entry = unit ? footOf(unit) : null;
        if (!entry || entry.single) { foot.ox = 0; foot.oy = 0; foot.w = 1; foot.h = 1; return foot; }
        const at = entry.turns ? facingIndex(assumed.unit === unit ? assumed.d : entry.character ? entry.character.direction() : 2) * 4 : 0;
        const rects = entry.rects;
        foot.ox = rects[at]; foot.oy = rects[at + 1]; foot.w = rects[at + 2]; foot.h = rects[at + 3];
        return foot;
    };

    /** The same when the unit faces `d` (2, 4, 6, 8); the object is shared with `F.footprint`. */
    F.footprintFacing = function(unit, d) {
        const entry = unit ? footOf(unit) : null;
        if (!entry || entry.single) { foot.ox = 0; foot.oy = 0; foot.w = 1; foot.h = 1; return foot; }
        const at = facingIndex(d) * 4, rects = entry.rects;
        foot.ox = rects[at]; foot.oy = rects[at + 1]; foot.w = rects[at + 2]; foot.h = rects[at + 3];
        return foot;
    };

    F.isBig = function(unit) {
        const entry = unit ? footOf(unit) : null;
        return !!entry && !entry.single;
    };

    /** Whether a unit's body is another shape when it faces another way (a long vehicle). */
    F.turnsBody = function(unit) {
        const entry = unit ? footOf(unit) : null;
        return !!entry && entry.turns;
    };

    /** Where a unit's body comes from: "size" (typed on the event), "model", "picture", "pending" (its model is on its way) or "". */
    F.footprintSource = function(unit) {
        const entry = unit ? footOf(unit) : null;
        return entry ? entry.source : "";
    };

    /**
     * The cells under what sticks out of a unit's body as it faces now (a gun's barrel), `[dx, dy, ...]` from the
     * character's own cell; null for a body nothing sticks out of. They are not the unit's (it is not struck or
     * picked on them); nobody else stands on them, and the unit needs them free. Shared: not to be changed.
     */
    F.overhang = function(unit) {
        if (!anyOver || !unit) return null;
        const entry = footOf(unit);
        if (!entry || !entry.hulls) return null;
        return entry.hulls[facingIndex(assumed.unit === unit ? assumed.d : entry.character ? entry.character.direction() : 2)].over;
    };

    /** The same when the unit faces `d` (2, 4, 6, 8). */
    F.overhangFacing = function(unit, d) {
        if (!anyOver || !unit) return null;
        const entry = footOf(unit);
        return entry && entry.hulls ? entry.hulls[facingIndex(d)].over : null;
    };

    /** The unit whose overhang is over a cell at about height `h` (any height without one); null when nobody's is. */
    F.overhangAt = function(fight, x, y, except, h) {
        if (!anyOver) return null;
        for (const unit of fight._units) {
            if (unit === except || unit.gone) continue;
            const over = F.overhang(unit), c = over ? fight.character(unit) : null;
            if (!c || !(unit.team === "neutral" || fight.isAlive(unit))) continue;
            if (Number.isFinite(h) && Math.abs(G.heightOf(c) - h) >= LEVEL_GAP) continue;
            for (let i = 0; i < over.length; i += 2) if (c.x + over[i] === x && c.y + over[i + 1] === y) return unit;
        }
        return null;
    };

    /** Whether a unit standing at (ux, uy) covers cell (x, y). */
    F.covers = function(unit, ux, uy, x, y) {
        const f = F.footprint(unit);
        return x >= ux + f.ox && x < ux + f.ox + f.w && y >= uy + f.oy && y < uy + f.oy + f.h;
    };

    /** The cell of a unit standing at (ux, uy) nearest to (x, y), left in `nearOut`; and how many steps away it is. */
    const nearOut = { x: 0, y: 0 };
    F.nearestCell = function(unit, ux, uy, x, y) {
        const f = F.footprint(unit);
        nearOut.x = clamp(x, ux + f.ox, ux + f.ox + f.w - 1);
        nearOut.y = clamp(y, uy + f.oy, uy + f.oy + f.h - 1);
        return nearOut;
    };
    F.stepsTo = function(unit, ux, uy, x, y) {
        const cell = F.nearestCell(unit, ux, uy, x, y);
        return Math.abs(cell.x - x) + Math.abs(cell.y - y);
    };

    // The body of a thing that is no unit (a cart, a crate: an event that stands as a model), kept per event.
    const sceneryBodies = new WeakMap();
    function sceneryBody(event) {
        const R = modelWorld();
        if (!R) return null;
        const frame = frameNow(), d = event.direction();
        let kept = sceneryBodies.get(event);
        if (kept && kept.d === d && kept.rev === feetRev && frame >= kept.at && frame - kept.at < kept.wait) return kept.body;
        if (!kept) { kept = { at: 0, wait: 0, d: 0, rev: 0, body: null }; sceneryBodies.set(event, kept); }
        kept.at = frame; kept.d = d; kept.rev = feetRev; kept.wait = F.FOOT_REFRESH; kept.body = null;
        let spec = null;
        try { spec = R.characterModelSpec(event); } catch (error) { spec = null; }
        if (!spec) return null;
        if (!modelArrived(R, spec)) { kept.wait = F.FOOT_PENDING; return null; }
        const body = modelBody(R, event, spec, DIRS.includes(d) ? d : 2);
        kept.body = body.cells.length ? body : null;
        return kept.body;
    }

    /**
     * Who stands where: 1 a friend of one cell (walked through, not stopped on), 2 anyone or anything else in the
     * way: the other side, and a body of more than one cell whoever's it is (nobody walks through a hull), with
     * the cells under what sticks out of it.
     * `bodiesOnly`: units of one cell are left out (a body is given room before they are: they step aside).
     */
    function fillOccupancy(fight, unit, bodiesOnly) {
        gOcc.fill(0);
        gOccMore.length = 0;
        for (const other of fight._units) {
            if (other === unit || other.gone) continue;
            const character = fight.character(other);
            if (!character || !$gameMap.isValid(character.x, character.y)) continue;
            if (other.team !== "neutral" && !fight.isAlive(other)) continue;
            const f = F.footprint(other), single = f.w === 1 && f.h === 1, mark = single && other.team === unit.team ? 1 : 2;
            if (bodiesOnly && single) continue;
            // One still walking (the other side moving together) holds the cell it is going to.
            const going = fight.moverOf ? fight.moverOf(other) : null;
            const last = going && going.path.length ? going.path[going.path.length - 1] : character;
            const stands = last !== character && Number.isFinite(last.height) ? last.height : G.heightOf(character);
            for (let y = last.y + f.oy; y < last.y + f.oy + f.h; y++) {
                for (let x = last.x + f.ox; x < last.x + f.ox + f.w; x++) {
                    if (x >= 0 && y >= 0 && x < gw && y < gh) setOcc(y * gw + x, stands, mark);
                }
            }
            // The cells under what sticks out of it (a barrel at chest height) are nobody's to stand on or walk through.
            const over = single ? null : F.overhang(other);
            if (over) {
                for (let i = 0; i < over.length; i += 2) {
                    const x = last.x + over[i], y = last.y + over[i + 1];
                    if (x >= 0 && y >= 0 && x < gw && y < gh) setOcc(y * gw + x, stands, 2);
                }
            }
        }
        for (const event of $gameMap.events()) {
            if (!event || event._erased || !event.isNormalPriority() || event.isThrough()) continue;
            if (!$gameMap.isValid(event.x, event.y) || fight.unitOfEvent(event.eventId())) continue;
            // What hangs over a unit's head (a lamp on a wall) is in the way up there, not on the ground under it.
            const lift = Number(event._reactorLift) || 0;
            const stands = G.heightOf(event) + (lift >= F.OVERHEAD ? lift : 0);
            setOcc(event.y * gw + event.x, stands, 2);
            // A thing with a body (a cart, a crate) is in the way on every cell under it.
            const body = sceneryBody(event);
            if (!body) continue;
            for (let i = 0; i < body.cells.length; i += 2) {
                const x = event.x + body.cells[i], y = event.y + body.cells[i + 1];
                if (x >= 0 && y >= 0 && x < gw && y < gh) setOcc(y * gw + x, stands, 2);
            }
        }
    }

    /**
     * Whether a long body on cell (x, y) can turn from facing `from` to facing `to` (indexes of DIRS): the turned
     * body fits there, and for a half turn so does the body a quarter of the way round, one side or the other
     * (it swings through it). `rects` are its four bodies.
     */
    function turnFits(fight, rects, x, y, from, to, height, deep) {
        if (!fits(fight, x, y, rects, to * 4, height, deep)) return false;
        if (from !== 3 - to) return true;
        for (let side = 0; side < 4; side++) {
            if (side === from || side === to) continue;
            if (fits(fight, x, y, rects, side * 4, height, deep)) return true;
        }
        return false;
    }

    // Whether the body turned to each facing fits on the cell the flood is on (-1: not asked yet).
    const turnKnown = new Int8Array(4);
    /**
     * `turnFits` for the flood: the same answer, with each turned body asked about once for the cell the flood is on
     * (`turnKnown`, cleared as the flood takes the cell): the quarter turns a half turn swings through are the ones
     * the steps to either side ask about anyway.
     */
    function turnsTo(fight, rects, x, y, from, to, height, deep) {
        if (!turnedFits(fight, rects, x, y, from, to, height, deep)) return false;
        if (from !== 3 - to) return true;
        const side = from === 0 || from === 3 ? 1 : 0;
        return turnedFits(fight, rects, x, y, from, side, height, deep) || turnedFits(fight, rects, x, y, from, 3 - side, height, deep);
    }
    function turnedFits(fight, rects, x, y, from, to, height, deep) {
        let known = turnKnown[to];
        if (known < 0) {
            // The cells it lies on as it faces are its own already.
            known = turnKnown[to] = flooding.same[from * 4 + to] || fits(fight, x, y, rects, to * 4, height, deep) ? 1 : 0;
        }
        return known === 1;
    }

    /** Between `standingBegin` and `standingEnd` the grid reads who stands where now, and the flood's own answer is kept aside. */
    function standingBegin(fight, unit, bodiesOnly) {
        ensureGrid();
        let held = gOcc; gOcc = sOcc; sOcc = held;
        held = gOccH; gOccH = sOccH; sOccH = held;
        held = gOccMore; gOccMore = sOccMore; sOccMore = held;
        standing.deep = gDeep;
        gDeep = G.is3D();
        fillOccupancy(fight, unit, bodiesOnly);
        refreshBodies(fight);
    }
    function standingEnd() {
        let held = gOcc; gOcc = sOcc; sOcc = held;
        held = gOccH; gOccH = sOccH; sOccH = held;
        held = gOccMore; gOccMore = sOccMore; sOccMore = held;
        gDeep = standing.deep;
    }
    const standing = { deep: false };

    /** Whether a unit's body, facing `d`, fits with the unit on cell (x, y) at about `height`, as the field stands now. */
    G.fitsAt = function(fight, unit, x, y, d, height) {
        const entry = footOf(unit);
        if (!entry) return false;
        const deep = G.is3D();
        standingBegin(fight, unit);
        try {
            bodyAs(entry.single ? 0 : entry.tall, entry.hulls);
            return fits(fight, x, y, entry.rects, facingIndex(d) * 4, deep && Number.isFinite(height) ? height : deep ? G.groundAt(x, y) : 0, deep);
        } finally {
            standingEnd();
        }
    };

    /** Whether a unit's own action is playing (in front, or beside the others'). */
    function performs(fight, unit) {
        if (fight._run && fight._run.subjectId === unit.id) return true;
        const runs = fight._tac && fight._tac.runs;
        if (runs) for (let i = 0; i < runs.length; i++) if (runs[i].subjectId === unit.id) return true;
        return false;
    }

    /**
     * Whether a unit may turn to face `d` where it stands. One whose body is the same shape every way always may; a
     * long one only where the turned body fits (no wall, no other unit under it), where a half turn has a quarter
     * turn to swing through, and not while its own action plays.
     */
    F.canFace = function(fight, unit, d) {
        const entry = footOf(unit), character = entry && entry.character;
        if (!entry || !entry.turns || !character || stepping === character) return true;
        // While its own action plays it keeps the way it turned to aim: its body does not swing back and forth under the blow.
        if (d !== character.direction() && performs(fight, unit)) return false;
        const to = facingIndex(d) * 4, from = facingIndex(character.direction()) * 4, rects = entry.rects;
        // The same cells facing that way, and no half turn (which swings through a quarter turn even so).
        if (from + to !== 12 && entry.same[from + to / 4]) return true;
        const deep = G.is3D();
        standingBegin(fight, unit);
        try {
            bodyAs(entry.tall, entry.hulls);
            return turnFits(fight, rects, character.x, character.y, from / 4, to / 4, deep ? G.heightOf(character) : 0, deep);
        } finally {
            standingEnd();
        }
    };

    /**
     * A long body is drawn the way its cells lie. Whoever turns a unit toward a target an eighth of a turn further
     * than it faces (an aim, eight ways) turns a figure on its cell; a hull drawn that way would lie across cells
     * that are not its own. Once a frame while the battle runs, for the long bodies only.
     */
    F.squareHulls = function() {
        for (let i = 0; i < turnerList.length; i++) {
            const c = turnerList[i], d = c._reactorDir8;
            if ((d === 1 || d === 3 || d === 7 || d === 9) && d !== c._direction) c._reactorDir8 = c._direction;
        }
    };

    // Every turn of a character asks the map's own rule (`_reactorCanFace`); a long unit in a Tactical battle answers by its body.
    if (typeof Game_CharacterBase !== "undefined" && Game_CharacterBase.prototype._reactorCanFace) {
        const canFace = Game_CharacterBase.prototype._reactorCanFace;
        Game_CharacterBase.prototype._reactorCanFace = function(d) {
            if (anyTurner && d !== this._direction) {
                const unit = turners.get(this), fight = unit && typeof $gameFight !== "undefined" ? $gameFight : null;
                if (fight && !unit.gone && fight.isTactical() && fight.isHere() && fight._units.includes(unit)) return F.canFace(fight, unit, d);
            }
            return canFace.call(this, d);
        };
    }

    // The battle's words for what happens on the field: a project's own (System.json `reactorBattle.terms`), then the
    // battle's stock ones, then these.
    F.FIELD_TERMS = { unitPlaced: "%1 had no room and was moved", unitsPlaced: "%1 units had no room and were moved", unitNoRoom: "%1 has no room where it stands" };
    const fieldTerm = key => (F.term ? F.term(key) : "") || F.FIELD_TERMS[key] || "";

    /**
     * A unit that had no room where it was put is written down where its author reads it and said where the player
     * looks: the battle's own record (`$gameFight.placements()`, kept with the battle), a line in the console, and
     * for a body that was put elsewhere or has to stay in a wall a line on the battle's banner (`sayPlaced`).
     * `how`: "moved" (put on another tile), "turned" (turned where it stands) or "stays" (no place near fits it).
     */
    function reportPlaced(fight, unit, fx, fy, tx, ty, reason, how, banner) {
        const battler = fight.battler(unit), name = battler ? battler.name() : "";
        const tac = fight.tac(), list = tac.placed || (tac.placed = []);
        // A unit that has to stay is said once, however often the battle looks again.
        if (how === "stays" && list.some(entry => entry.unitId === unit.id && entry.stays && entry.from.x === fx && entry.from.y === fy)) return;
        list.push({ unitId: unit.id, eventId: unit.eventId, name, from: { x: fx, y: fy }, to: { x: tx, y: ty }, reason, moved: how === "moved", stays: how === "stays" });
        if (typeof console !== "undefined" && console.info) {
            const who = "Battle: " + (name || "a unit");
            console.info(how === "moved" ? who + " had no room at " + fx + "," + fy + " (" + reason + ") and stands at " + tx + "," + ty + "."
                : how === "turned" ? who + " at " + fx + "," + fy + " was turned (" + reason + ")."
                : who + " has no room at " + fx + "," + fy + " (" + reason + "): it stays where it was put.");
        }
        if (!banner || how === "turned") return;
        const note = tac.placedNote || (tac.placedNote = { moved: 0, movedName: "", stays: 0, staysName: "" });
        if (how === "moved") { note.moved++; note.movedName = name; } else { note.stays++; note.staysName = name; }
    }

    /** The banner says who was moved (then who has to stay in a wall) once the player has the battle and no other line is up. */
    function sayPlaced(fight) {
        const tac = fight._tac, note = tac.placedNote;
        if (!note || fight._ending || !fight.announce || !fight.awaitsPlayer() || (fight.notice && fight.notice())) return;
        let text = "";
        if (note.moved) { text = note.moved === 1 ? fieldTerm("unitPlaced").replace("%1", note.movedName) : fieldTerm("unitsPlaced").replace("%1", note.moved); note.moved = 0; }
        else if (note.stays) { text = fieldTerm("unitNoRoom").replace("%1", note.staysName); note.stays = 0; }
        if (!note.moved && !note.stays) tac.placedNote = null;
        if (text) fight.announce(text);
    }

    /**
     * Every unit that had no room where the battle found it: `[{ unitId, eventId, name, from, to, reason, moved,
     * stays }]`. `moved`: it was put on the tile `to`; `stays`: no place near fits it and it is where it was put;
     * neither: it was turned on its tile.
     */
    Game_Fight.prototype.placements = function() {
        return (this._tac && this._tac.placed) || EMPTY;
    };

    function placeUnit(fight, unit, character, x, y, d, height) {
        Game_CharacterBase.prototype.locate.call(character, x, y);
        if (d && d !== character.direction()) { stepping = character; try { character.setDirection(d); } finally { stepping = null; } }
        if (G.is3D() && Number.isFinite(height)) character._reactorGround = height;
        fight._inside[String(unit.id)] = [x, y];
    }

    // The places a body fits near where it was put, as [how far, x, y, facing index, height, ...] (how far: -1 once looked at).
    const settleSpots = [];
    const settleLevels = [];
    // How many separate places are asked whether the unit can get to the fight from them, and how far its way is looked along.
    F.SETTLE_TRIES = 3;
    F.SETTLE_LOOK = 24;
    // What a quarter turn counts for among the places a body may be put (in steps squared; a half turn twice that).
    F.SETTLE_TURN = 2.25;

    /**
     * Whether a unit put on cell (x, y) facing `d` could get from there to where it strikes someone of the other
     * side: its way is flooded as its own thinking floods it, and every place it could come to is held against
     * every opponent's body. The flood stays in the grid's buffers. True for a unit with nobody to fight.
     */
    function reachesFight(fight, unit, character, x, y, d, height, deep) {
        const battler = fight.battler(unit);
        if (!battler || unit.team === "neutral") return true;
        const budget = Math.min(F.SETTLE_LOOK, F.moveOf(unit) * 3 + 6), far = strikeReach(battler);
        const keptX = character._x, keptY = character._y, keptD = character._direction, keptGround = character._reactorGround;
        character._x = x; character._y = y; character._direction = d;
        if (deep) character._reactorGround = height;
        try {
            if (!G.floodStart(fight, unit, budget)) return true;
            G.floodRun(fight, Infinity);
        } finally {
            character._x = keptX; character._y = keptY; character._direction = keptD; character._reactorGround = keptGround;
        }
        let anyone = false;
        const whole = F.footprintFacing(unit, d), span = far + Math.max(whole.w, whole.h);
        for (const other of fight._units) {
            if (other.gone || other === unit || other.team === unit.team || other.team === "neutral" || !fight.isAlive(other)) continue;
            const oc = fight.character(other);
            if (!oc) continue;
            anyone = true;
            const of = F.footprint(other), ox0 = oc.x + of.ox, oy0 = oc.y + of.oy, ox1 = ox0 + of.w - 1, oy1 = oy0 + of.h - 1;
            for (let cy = Math.max(0, oy0 - span); cy <= Math.min(gh - 1, oy1 + span); cy++) {
                for (let cx = Math.max(0, ox0 - span); cx <= Math.min(gw - 1, ox1 + span); cx++) {
                    if (gCost[(cy * gw + cx) * LEVELS] === Infinity) continue;
                    const f = F.footprintFacing(unit, G.facingAt(cx, cy) || d), bx0 = cx + f.ox, by0 = cy + f.oy;
                    const gap = Math.max(0, ox0 - (bx0 + f.w - 1), bx0 - ox1) + Math.max(0, oy0 - (by0 + f.h - 1), by0 - oy1);
                    if (gap <= far) return true;
                }
            }
        }
        return !anyone;
    }

    /**
     * A big unit whose body does not fit where it stands (inside a wall or a structure, over another unit) is put
     * on a place it does, no further than F.SETTLE_REACH cells off: the nearest it can get to the fight from (the
     * nearest few separate places are asked), else the nearest; facing as it faced where that fits. With no place
     * in reach it stays where it was put, and the battle says so. `asPut`: the battle begins and the units stand as
     * their author put them: a body is given room among walls, things and other bodies, and whoever of one cell
     * stands under it steps aside afterwards (`settleOut`), so a hull is not sent off for a soldier put at its corner.
     * `quiet`: nothing goes on the banner. Returns `{ x, y }` when it was moved or turned.
     */
    F.settleUnit = function(fight, unit, quiet, asPut) {
        const entry = footOf(unit), character = entry && entry.character;
        if (!entry || entry.single || !character || !$gameMap.isValid(character.x, character.y)) return null;
        const deep = G.is3D(), rects = entry.rects, d0 = character.direction(), h0 = G.heightOf(character);
        const x0 = character.x, y0 = character.y, spots = settleSpots;
        spots.length = 0;
        standingBegin(fight, unit, !!asPut);
        try {
            bodyAs(entry.tall, entry.hulls);
            if (fits(fight, x0, y0, rects, facingIndex(d0) * 4, h0, deep)) return null;
            // The floors it may be put on: the one its own cell is on, and the lowest ground under its body (its
            // own cell may be on a wall's top or a roof's edge, the rest of it over the street). Never a level above
            // the one it stands on, nor one below everything under it (a cellar, a river bed).
            let floor = h0;
            if (deep) {
                const at = facingIndex(d0) * 4;
                for (let y = y0 + rects[at + 1]; y < y0 + rects[at + 1] + rects[at + 3]; y++) {
                    for (let x = x0 + rects[at]; x < x0 + rects[at] + rects[at + 2]; x++) {
                        if (x >= 0 && y >= 0 && x < gw && y < gh) floor = Math.min(floor, G.groundAt(x, y, h0 - 100));
                    }
                }
            }
            for (let dy = -F.SETTLE_REACH; dy <= F.SETTLE_REACH; dy++) {
                for (let dx = -F.SETTLE_REACH; dx <= F.SETTLE_REACH; dx++) {
                    const x = x0 + dx, y = y0 + dy;
                    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
                    // The ground there nearest where it stands, then (where that is another level) nearest the lowest under it.
                    let tried = NaN;
                    for (let pass = 0; pass < (deep ? 2 : 1); pass++) {
                        const height = deep ? G.groundAt(x, y, pass ? floor : h0) : 0;
                        if (pass && Math.abs(height - tried) < 0.3) break;
                        tried = height;
                        if (deep && (height >= h0 + LEVEL_GAP || height <= floor - LEVEL_GAP)) continue;
                        for (let i = 0; i < 4; i++) {
                            if ((!entry.turns && DIRS[i] !== d0) || !fits(fight, x, y, rects, i * 4, height, deep)) continue;
                            // As it faced first: the way a unit faces is its author's too. A quarter turn counts as
                            // a step and a half further, a half turn as two.
                            spots.push(dx * dx + dy * dy + (DIRS[i] === d0 ? 0 : DIRS[i] === 10 - d0 ? F.SETTLE_TURN * 2 : F.SETTLE_TURN), x, y, i, height);
                        }
                    }
                }
            }
        } finally {
            standingEnd();
        }
        if (!spots.length) {
            reportPlaced(fight, unit, x0, y0, x0, y0, "its body does not fit, and no place within " + F.SETTLE_REACH + " tiles does", "stays", !quiet);
            return null;
        }
        // The nearest place, then the nearest on ground the look from there did not reach, each asked for a way to the fight.
        let bx = 0, by = 0, bi = 0, bh = 0, first = true, looked = false;
        for (let tries = 0; tries < F.SETTLE_TRIES; tries++) {
            let best = -1;
            for (let s = 0; s < spots.length; s += 5) if (spots[s] >= 0 && (best < 0 || spots[s] < spots[best])) best = s;
            if (best < 0) break;
            const x = spots[best + 1], y = spots[best + 2], i = spots[best + 3], height = spots[best + 4];
            if (first) { first = false; bx = x; by = y; bi = i; bh = height; }
            looked = true;
            if (reachesFight(fight, unit, character, x, y, DIRS[i], height, deep)) { bx = x; by = y; bi = i; bh = height; break; }
            // Every place that look reached is the same ground: no way to the fight from there either.
            spots[best] = -1;
            for (let s = 0; s < spots.length; s += 5) if (spots[s] >= 0 && G.reachedAt(spots[s + 1], spots[s + 2], settleLevels) > 0) spots[s] = -1;
        }
        // The grid's buffers hold a look from a place the unit was not on: whoever kept a flood there makes it again.
        if (looked) { cache.floodUnit = 0; cache.floodOpen = false; cache.moveUnit = 0; }
        const turned = bx === x0 && by === y0;
        placeUnit(fight, unit, character, bx, by, DIRS[bi], bh);
        reportPlaced(fight, unit, x0, y0, bx, by, turned ? "its body did not fit the way it faced" : "its body did not fit", turned ? "turned" : "moved", !quiet);
        return { x: bx, y: by };
    };

    /** A unit standing on a cell another unit's body covers, or under what sticks out of one, is put on the nearest free cell. Returns `{ x, y }` when it was moved. */
    F.settleOut = function(fight, unit) {
        const entry = footOf(unit), character = entry && entry.character;
        if (!entry || !entry.single || !character || !$gameMap.isValid(character.x, character.y)) return null;
        const deep = G.is3D(), h0 = G.heightOf(character), x0 = character.x, y0 = character.y;
        const under = fight.unitAt(x0, y0, unit, deep ? h0 : undefined);
        const inside = !!under && F.isBig(under) && !(deep && Math.abs(G.heightOf(fight.character(under)) - h0) >= LEVEL_GAP);
        if (!inside && !F.overhangAt(fight, x0, y0, unit, deep ? h0 : NaN)) return null;
        let found = false, bx = 0, by = 0, bh = 0, best = Infinity;
        standingBegin(fight, unit);
        try {
            bodyAs(0, null);
            for (let radius = 1; radius <= F.SETTLE_REACH && radius * radius <= best; radius++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || dx * dx + dy * dy >= best) continue;
                        const x = x0 + dx, y = y0 + dy;
                        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
                        const height = deep ? G.groundAt(x, y, h0) : 0;
                        // On the floor it stands on, not on top of what is beside it.
                        if ((deep && Math.abs(height - h0) >= LEVEL_GAP) || !fits(fight, x, y, ONE_CELL, 0, height, deep)) continue;
                        found = true; best = dx * dx + dy * dy; bx = x; by = y; bh = height;
                    }
                }
            }
        } finally {
            standingEnd();
        }
        if (!found) return null;
        placeUnit(fight, unit, character, bx, by, 0, bh);
        reportPlaced(fight, unit, x0, y0, bx, by, "another unit's body is there", "moved", false);
        return { x: bx, y: by };
    };

    /**
     * Every unit takes room it can have: big bodies first (each to the nearest place it fits), then anyone left
     * standing inside one. `only` names the units to look at (those measured anew); without it, all. `asPut`: the
     * battle is beginning (see `settleUnit`). Units on their way somewhere are left for later. Returns how many
     * were moved.
     */
    F.settle = function(fight, only, asPut) {
        if (!fight || !fight._tac || !fight.isHere()) return 0;
        let moved = 0;
        const busy = unit => {
            const character = fight.character(unit);
            return !character || character.isMoving() || character.isJumping() || (fight.moverOf && !!fight.moverOf(unit))
                || (!!fight._act && fight._act.unitId === unit.id && (fight._act.stage === "walk" || !!fight._act.path));
        };
        for (const unit of fight._units) {
            if (unit.gone || (only && !only.includes(unit.id)) || !(unit.team === "neutral" || fight.isAlive(unit))) continue;
            if (!F.isBig(unit)) continue;
            if (busy(unit)) { if (!unsettled.includes(unit.id)) unsettled.push(unit.id); continue; }
            if (F.settleUnit(fight, unit, false, asPut)) moved++;
        }
        for (const unit of fight._units) {
            if (unit.gone || F.isBig(unit) || busy(unit) || !(unit.team === "neutral" || fight.isAlive(unit))) continue;
            if (F.settleOut(fight, unit)) moved++;
        }
        if (moved) fight.touch();
        return moved;
    };

    /**
     * Every cell a unit can reach for `budget`, cheapest way first, from where it stands. The costs, the
     * way back and the heights stay in the grid's buffers until the next flood. Returns the cells reached.
     */
    G.flood = function(fight, unit, budget) {
        if (!G.floodStart(fight, unit, budget)) return 0;
        G.floodRun(fight, Infinity);
        return flooding.reached;
    };

    // A flood under way: what `floodRun` needs to go on with it. One at a time; the grid's buffers are its state.
    const flooding = { open: false, budget: 0, deep: false, jump: 0, big: false, turns: false, rects: null, facing: 0, reached: 0, tall: 0, hulls: null, same: null };
    /** How many cells a flood takes in before it looks at the clock (a cell with levels to ask the world about is a tenth of a millisecond). */
    G.FLOOD_SLICE = 16;

    /** Begin a flood: the buffers are cleared and the unit's own cell goes in. False when the unit has no place on the map. */
    G.floodStart = function(fight, unit, budget) {
        ensureGrid();
        flooding.open = false; flooding.reached = 0;
        const character = fight.character(unit);
        if (!character || !$gameMap.isValid(character.x, character.y)) return false;
        const deep = G.is3D();
        const body = footOf(unit);
        flooding.budget = budget; flooding.deep = deep; flooding.jump = deep ? F.jumpOf(unit) : 0;
        flooding.big = !!body && !body.single; flooding.turns = !!body && body.turns; flooding.rects = body ? body.rects : null;
        flooding.facing = facingIndex(character.direction());
        flooding.tall = flooding.big ? body.tall : 0;
        flooding.hulls = flooding.big ? body.hulls : null;
        flooding.same = body ? body.same : null;
        gCost.fill(Infinity);
        gDeep = deep;
        fillOccupancy(fight, unit);
        if (flooding.big) refreshBodies(fight);
        gHeapSize = 0;
        const start = (character.y * gw + character.x) * LEVELS;
        gCost[start] = 0; gPrev[start] = -1; gHeight[start] = G.heightOf(character); gHop[start] = 0; gFace[start] = flooding.facing;
        heapPush(start, 0);
        flooding.open = true;
        return true;
    };

    /**
     * Go on with the flood begun by `floodStart` until it is done or the clock passes `deadline` (a slice of cells is
     * always taken, so a late caller still gets on). Returns true when the flood is complete.
     */
    G.floodRun = function(fight, deadline) {
        if (!flooding.open) return true;
        const budget = flooding.budget, deep = flooding.deep, jump = flooding.jump;
        const big = flooding.big, turns = flooding.turns, rects = flooding.rects;
        const timed = deadline !== Infinity;
        if (big) bodyAs(flooding.tall, flooding.hulls);
        let reached = 0;
        while (gHeapSize > 0) {
            if (timed && reached > 0 && reached % G.FLOOD_SLICE === 0 && now() > deadline) { flooding.reached += reached; return false; }
            const cost = gHeapCost[0], node = heapPop();
            if (cost > gCost[node]) continue;
            reached++;
            const cell = (node - node % LEVELS) / LEVELS;
            const x = cell % gw, y = (cell - x) / gw, height = gHeight[node];
            const facedAs = turns ? gFace[node] : 0, faced = facedAs * 4;
            // Whether the cell it is on is a place to stand: asked only when a way on leads to one that is not.
            let grounded = -1;
            if (turns) turnKnown[0] = turnKnown[1] = turnKnown[2] = turnKnown[3] = -1;
            for (let i = 0; i < 4; i++) {
                const d = DIRS[i];
                const nx = x + DX[d], ny = y + DY[d], nextCell = ny * gw + nx;
                // A big unit moves as a whole, facing the way it steps: its body as it faces that way.
                let face = i, at = i * 4;
                // A long body turns before it steps: where it stands, the turned body fits too (a half turn swings
                // through a quarter turn, whether or not it ends on the same cells). Where it cannot turn round (a
                // street no wider than it), it backs up as it faces.
                if (turns && i !== facedAs && !turnsTo(fight, rects, x, y, facedAs, i, height, deep)) {
                    if (facedAs !== 3 - i) continue;
                    face = facedAs; at = faced;
                }
                // A flat map (2D, or one place to stand on the cell ahead) is the plain flood: one way on, one node a cell.
                if (!deep) {
                    if (!canStep(x, y, d, height, jump, false) || gOcc[nextCell] === 2) continue;
                    if (big && !fits(fight, nx, ny, rects, at, 0, false)) continue;
                    const price = G.cellCost(fight, nx, ny, 0, false);
                    if (price <= 0) continue;
                    const total = cost + price, next = nextCell * LEVELS;
                    if (total > budget || total >= gCost[next]) continue;
                    gCost[next] = total; gPrev[next] = node; gHeight[next] = 0; gHop[next] = 0; gKind[next] = 0; gFace[next] = face;
                    heapPush(next, total);
                    continue;
                }
                const ways = stepsFrom(x, y, d, height, jump, deep);
                for (let w = 0; w < ways; w++) {
                    const landing = landHeight[w], kind = landKind[w], extra = landExtra[w], hop = kind !== 0;
                    if (occAt(nextCell, landing) === 2) continue;
                    // No way onto what is no place to stand: a fountain's water and its rim, a seat, a post. One who is
                    // on such ground already (the battle found it in the basin) goes on over it, and so gets out.
                    if (!G.stands(nx, ny, landing)) {
                        if (grounded < 0) grounded = G.stands(x, y, height) ? 1 : 0;
                        if (grounded) continue;
                    }
                    // Every cell it would cover is free and open, the ground running on under it; a big body does not hop or climb.
                    if (big && (hop || !fits(fight, nx, ny, rects, at, landing, deep))) continue;
                    const price = G.cellCost(fight, nx, ny, landing, deep);
                    if (price <= 0) continue;
                    const total = cost + price + extra;
                    if (total > budget) continue;
                    const next = nodeFor(nextCell, landing);
                    if (next < 0 || total >= gCost[next]) continue;
                    gCost[next] = total; gPrev[next] = node; gHeight[next] = landing; gHop[next] = hop ? 1 : 0; gKind[next] = kind; gFace[next] = face;
                    heapPush(next, total);
                }
            }
        }
        flooding.reached += reached;
        flooding.open = false;
        return true;
    };

    /**
     * After a flood: what a cell cost to reach (Infinity when it was not), whether a unit may stop on it, and the
     * height it is reached at. `h` names the level on a cell with more than one (the nearest reached within
     * LEVEL_GAP); without it, the cheapest.
     */
    G.costAt = (x, y, h) => { const node = nodeAt(x, y, h); return node < 0 ? Infinity : gCost[node]; };
    G.canStopAt = (x, y, h) => { const node = nodeAt(x, y, h); return node >= 0 && occAt(y * gw + x, gHeight[node]) === 0; };
    G.heightAt = (x, y, h) => { const node = nodeAt(x, y, h); return node < 0 ? 0 : gHeight[node]; };
    /**
     * After a flood: the way the unit faces when it arrives on a cell (2, 4, 6, 8: its last step's direction, or the
     * facing it kept while it backed up there), 0 on its own cell or one it did not reach.
     */
    G.facingAt = (x, y, h) => { const node = nodeAt(x, y, h); return node < 0 || gPrev[node] < 0 ? 0 : DIRS[gFace[node]]; };

    /** After a flood: every level reached on a cell, as `out` = [height, cost, height, cost, ...]; returns how many. */
    G.reachedAt = function(x, y, out) {
        out.length = 0;
        if (!(x >= 0 && y >= 0 && x < gw && y < gh)) return 0;
        const base = (y * gw + x) * LEVELS;
        for (let s = 0; s < LEVELS; s++) {
            if (gCost[base + s] === Infinity) break;
            out.push(gHeight[base + s], gCost[base + s]);
        }
        return out.length / 2;
    };

    /**
     * After a flood: the steps from the unit to a cell it reached (the level `h` of it), `[{ x, y, d, hop, kind,
     * height, face }]`; null if it did not. `face` is the way it faces on the step: `d`, or the other way round where
     * a long body backs up.
     */
    G.pathTo = function(x, y, h) {
        let node = nodeAt(x, y, h);
        if (node < 0) return null;
        const steps = [];
        while (gPrev[node] >= 0) {
            const from = gPrev[node];
            const cell = (node - node % LEVELS) / LEVELS, fromCell = (from - from % LEVELS) / LEVELS;
            const cx = cell % gw, cy = (cell - cx) / gw, fx = fromCell % gw, fy = (fromCell - fx) / gw;
            const d = cx > fx ? 6 : cx < fx ? 4 : cy > fy ? 2 : 8;
            steps.push({ x: cx, y: cy, d, hop: gHop[node] === 1, kind: KINDS[gKind[node]], height: gHeight[node], face: flooding.turns ? DIRS[gFace[node]] : d });
            node = from;
        }
        return steps.reverse();
    };

    /**
     * Whether a cell hides what is behind it by its tiles alone: one nobody can walk onto from any side,
     * unless it is water (a boat or a ship sails it), a counter, or has no tile at all. The rule on a 2D map; a 3D map adds its heights.
     */
    G.blocksSight = function(x, y) {
        if (!$gameMap.isValid(x, y)) return true;
        // Every line asks every cell it crosses, and the map's own passability questions make a list of the cell's
        // tiles each time. The answer is kept beside the tiles it was found for (the cell's four layers and its
        // region as one number, the answer in the lowest bit; 0 is "not asked"), so a changed cell is asked again.
        // What the map says of a cell may also hang on a switch or a variable (a plugin's own passage rule): every
        // answer is asked again after the map has refreshed, which it does when one of those changes.
        const data = $dataMap.data, width = $dataMap.width, size = width * $dataMap.height, at = y * width + x;
        if (hides.data !== data || hides.size !== size || hides.tileset !== $gameMap.tilesetId()) {
            hides.data = data; hides.size = size; hides.tileset = $gameMap.tilesetId();
            hides.cells = new Int32Array(size);
        }
        let key = 17 + hides.turn;
        for (let z = 0; z < 6; z++) if (z !== 4) key = (key * 31 + (data[z * size + at] || 0)) | 0;
        key = (key << 1) || 2;
        // A tile event can change what stands on a cell at any moment: such a map is asked afresh.
        const kept = !($gameMap.tileEvents && $gameMap.tileEvents.length > 0), known = hides.cells[at];
        if (kept && known !== 0 && (known & ~1) === key) return (known & 1) === 1;
        let blocks = true;
        if ($gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) || $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8)) blocks = false;
        else if ($gameMap.isBoatPassable(x, y) || $gameMap.isShipPassable(x, y) || $gameMap.isCounter(x, y)) blocks = false;
        else {
            // A cell with no tile at all is nothing to hide behind.
            const tiles = $gameMap.layeredTiles(x, y);
            blocks = tiles[0] > 0 || tiles[1] > 0 || tiles[2] > 0 || tiles[3] > 0;
        }
        if (kept) hides.cells[at] = key | (blocks ? 1 : 0);
        return blocks;
    };
    const hides = { data: null, size: 0, tileset: 0, cells: null, turn: 0 };
    /** What was kept about which cells hide is asked again (the map calls this as it refreshes). */
    G.forgetSight = function() {
        hides.turn = (hides.turn + 1) % 100000;
    };
    if (typeof Game_Map !== "undefined") {
        const refreshMap = Game_Map.prototype.refresh;
        Game_Map.prototype.refresh = function() {
            G.forgetSight();
            return refreshMap.apply(this, arguments);
        };
    }

    /**
     * How tall the bodies of the battle stand, for where their eyes and chests are: the leader's model on a 3D
     * map (asked once a second), nothing where the party is sprites.
     */
    G.sightBody = function() {
        const kept = G._sightBody || (G._sightBody = { at: -1e9, tall: 0 }), now = frameNow();
        if (now - kept.at >= 60 || now < kept.at) {
            kept.at = now; kept.tall = 0;
            try {
                const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
                if (player && Reactor3D.characterModelSpec && Reactor3D.characterHeightTiles && Reactor3D.characterModelSpec(player)) kept.tall = Reactor3D.characterHeightTiles(player) || 0;
            } catch (error) { kept.tall = 0; }
        }
        return kept.tall;
    };

    /**
     * Whether a unit at (ax, ay) standing at height `ah` has a line to one at (bx, by) at `bh`: from its eyes to
     * the other's chest, stopped by a cell that hides (G.blocksSight) and, on a 3D map, by the ground, by what is
     * built where it is solid (open air under a roof or beside a post stays open), by a shut door and by a model
     * that stands in the way: the same line an Action battle's shots take (Reactor3D.worldRay). It is the line an
     * attack that needs sight is allowed by, so glass stops it as it stops a shot; `look` asks for the line a look
     * takes, which passes glass.
     */
    G.sight = function(ax, ay, ah, bx, by, bh, look) {
        const dx = bx - ax, dy = by - ay;
        if (Math.abs(dx) + Math.abs(dy) <= 1) return true;
        const deep = G.is3D(), exact = deep && !!Reactor3D.worldRay;
        const tall = exact ? G.sightBody() : 0;
        const eye = ah + (tall > 1.6 ? tall * F.EYE_SHARE : F.EYE), chest = bh + (tall > 1.6 ? tall * F.CHEST_SHARE : F.CHEST);
        const steps = Math.ceil(Math.hypot(dx, dy) * 4);
        let lastX = ax, lastY = ay;
        for (let i = 1; i < steps; i++) {
            const t = i / steps, px = ax + 0.5 + dx * t, py = ay + 0.5 + dy * t;
            const cx = Math.floor(px), cy = Math.floor(py);
            if ((cx === ax && cy === ay) || (cx === bx && cy === by)) continue;
            if (cx !== lastX || cy !== lastY) {
                lastX = cx; lastY = cy;
                if (G.blocksSight(cx, cy)) return false;
            }
            // A world that cannot be asked for the line itself: the ground's height where the line passes.
            if (deep && !exact) {
                const ray = eye + (chest - eye) * t;
                if ((Reactor3D.groundHeightAt($dataMap, px, py, ray) || 0) > ray + 0.05) return false;
            }
        }
        if (!exact) return true;
        const far = Math.hypot(dx, chest - eye, dy), ux = dx / far, uy = (chest - eye) / far, uz = dy / far;
        let reach = Reactor3D.worldRay($dataMap, ax + 0.5, eye, ay + 0.5, ux, uy, uz, far, !!look);
        const action = F.Action;
        if (reach >= far - F.SIGHT_SLACK && action && action.rayProps) reach = action.rayProps(ax + 0.5, eye, ay + 0.5, ux, uy, uz, reach);
        return reach >= far - F.SIGHT_SLACK;
    };

    function coverOfCell(x, y, height, deep) {
        if (!$gameMap.isValid(x, y)) return 0;
        if ($gameMap.isCounter(x, y)) return 1;
        if (G.blocksSight(x, y)) return 2;
        if (deep) {
            const rise = (Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, height) || 0) - height;
            if (rise >= 1.5) return 2;
            if (rise >= 0.5) return 1;
        }
        return 0;
    }

    /**
     * The cover a target at (tx, ty) has from an attacker at (ax, ay), two cells or more away: 0 none, 1 half,
     * 2 full. What stands in the cell beside the target toward the attacker decides it: something a unit's
     * height or more is full cover, half that (a counter, a low wall) is half; a target standing in a bush has half.
     */
    G.cover = function(ax, ay, tx, ty, th) {
        const dx = ax - tx, dy = ay - ty, adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx + ady < 2) return 0;
        const deep = G.is3D();
        let cover = $gameMap.isBush(tx, ty) ? 1 : 0;
        if (adx > 0 && adx * 2 >= ady) cover = Math.max(cover, coverOfCell(tx + sign(dx), ty, th, deep));
        if (ady > 0 && ady * 2 >= adx) cover = Math.max(cover, coverOfCell(tx, ty + sign(dy), th, deep));
        return cover;
    };

    /** Where a blow from (ax, ay) lands on a target at (tx, ty) facing `d`: "front", "side" or "back". */
    G.flank = function(ax, ay, tx, ty, d) {
        const dx = ax - tx, dy = ay - ty;
        if (!dx && !dy) return "front";
        const fx = DX[d] || 0, fy = DY[d] || 0;
        const along = dx * fx + dy * fy, across = Math.abs(dx * fy - dy * fx);
        if (along > 0 && along >= across) return "front";
        if (along < 0 && -along > across) return "back";
        return "side";
    };

    /** Whether cell (x, y) is in an area of that shape aimed at (cx, cy) by a user at (ux, uy). */
    G.inArea = function(shape, size, ux, uy, cx, cy, x, y) {
        switch (shape) {
            case "single": return x === cx && y === cy;
            case "self": return x === ux && y === uy;
            case "circle": return Math.abs(x - cx) + Math.abs(y - cy) <= size;
            case "square": return Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= size;
            case "cross": return (x === cx && Math.abs(y - cy) <= size) || (y === cy && Math.abs(x - cx) <= size);
            case "line":
            case "cone": {
                const ddx = cx - ux, ddy = cy - uy;
                if (!ddx && !ddy) return false;
                // The longer way decides the direction; a tie runs up or down.
                const wide = Math.abs(ddx) > Math.abs(ddy);
                const along = wide ? (x - ux) * sign(ddx) : (y - uy) * sign(ddy);
                const across = Math.abs(wide ? y - uy : x - ux);
                if (along < 1 || along > size) return false;
                return shape === "line" ? across === 0 : across <= along - 1;
            }
            case "all": return true;
        }
        return false;
    };

    /** The cells of an area, as `[{ x, y }]` (for "all": none; the units decide). */
    G.areaCells = function(shape, size, ux, uy, cx, cy) {
        const cells = [];
        if (shape === "all") return cells;
        const reach = shape === "line" || shape === "cone" ? size : shape === "single" || shape === "self" ? 0 : size;
        const ox = shape === "line" || shape === "cone" || shape === "self" ? ux : cx, oy = shape === "line" || shape === "cone" || shape === "self" ? uy : cy;
        for (let y = oy - reach; y <= oy + reach; y++) {
            for (let x = ox - reach; x <= ox + reach; x++) {
                if ($gameMap.isValid(x, y) && G.inArea(shape, size, ux, uy, cx, cy, x, y)) cells.push({ x, y });
            }
        }
        return cells;
    };

    //-------------------------------------------------------------------------
    // Where a blow comes from: the side, the cover and the height between two units.

    const strike = { flank: "front", cover: 0, height: 0, damageRate: 1, hitRate: 1 };

    function setStrike(fight, action, tactics, team, ax, ay, ah, target) {
        strike.flank = "front"; strike.cover = 0; strike.height = 0; strike.damageRate = 1; strike.hitRate = 1;
        const character = fight.character(target);
        if (!character || target.team === team || !action.isForOpponent()) return strike;
        const th = G.heightOf(character);
        strike.flank = G.flank(ax, ay, character.x, character.y, character.direction());
        const near = F.nearestCell(target, character.x, character.y, ax, ay);
        strike.cover = tactics.los ? G.cover(ax, ay, near.x, near.y, th) : 0;
        strike.height = Math.round(ah - th);
        if (strike.cover === 1 && strike.height >= F.HEIGHT_OVER_COVER) strike.cover = 0;
        strike.damageRate = F.FLANK[strike.flank] * (1 + clamp(strike.height * F.HEIGHT_BONUS, -F.HEIGHT_LIMIT, F.HEIGHT_LIMIT));
        strike.hitRate = F.COVER_HIT[strike.cover];
        return strike;
    }

    // The Database formula decides the damage; where the blow comes from scales it, and cover its chance.
    // Outside a tactical blow F._strike is null and both read exactly as the stock action does.
    const makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = makeDamageValue.call(this, target, critical);
        const from = F._strike;
        return from && value > 0 && from.damageRate !== 1 ? Math.round(value * from.damageRate) : value;
    };
    const itemHit = Game_Action.prototype.itemHit;
    Game_Action.prototype.itemHit = function(target) {
        const rate = itemHit.call(this, target);
        return F._strike ? rate * F._strike.hitRate : rate;
    };
    F._strike = null;

    const lowVariance = (damage, variance) => { const amp = Math.floor(Math.max(Math.abs(damage) * variance / 100, 0)); return damage >= 0 ? damage - amp : damage + amp; };
    const highVariance = (damage, variance) => { const amp = Math.floor(Math.max(Math.abs(damage) * variance / 100, 0)); return damage >= 0 ? damage + amp : damage - amp; };
    const estimate = { hit: 1, critical: 0, min: 0, max: 0, heals: false, hp: true };

    /** What an action would do to a battler, with F._strike already set: its chances and its least and most. */
    function estimateAction(action, battler) {
        const item = action.item();
        estimate.hit = clamp(action.itemHit(battler) * (1 - action.itemEva(battler)), 0, 1);
        estimate.critical = item.damage && item.damage.critical ? clamp(action.itemCri(battler), 0, 1) : 0;
        estimate.min = 0; estimate.max = 0; estimate.heals = false;
        estimate.hp = !item.damage || item.damage.type === 0 || action.isHpEffect();
        if (item.damage && item.damage.type > 0) {
            let low = 0, high = 0;
            try {
                action.applyVariance = lowVariance;
                low = action.makeDamageValue(battler, false);
                action.applyVariance = highVariance;
                high = action.makeDamageValue(battler, false);
            } catch (error) {
                low = 0; high = 0;
            } finally {
                delete action.applyVariance;
            }
            estimate.heals = low < 0 || high < 0 || (low === 0 && high === 0 && action.isRecover());
            estimate.min = Math.min(Math.abs(low), Math.abs(high));
            estimate.max = Math.max(Math.abs(low), Math.abs(high));
        } else {
            for (const effect of item.effects || []) {
                if (effect.code !== 11) continue;
                let value = (battler.mhp * effect.value1 + effect.value2) * battler.rec;
                if (action.isItem()) value *= action.subject().pha;
                estimate.heals = value > 0;
                estimate.min = estimate.max = Math.max(0, Math.floor(value));
            }
        }
        const repeats = Math.max(1, Math.floor(action.numRepeats()) || 1);
        estimate.min *= repeats; estimate.max *= repeats;
        return estimate;
    }

    /** Whether an action by `unit` lands on `other` at all: the side its Scope aims at, alive or fallen as it asks. */
    function affects(fight, unit, action, other) {
        if (other.gone || other.team === "neutral") return false;
        const battler = fight.battler(other);
        if (!battler || !fight.character(other)) return false;
        // (Its own: the one that acts, which for a vehicle's action is the vehicle.)
        if (action.isForUser()) return battler === action.subject();
        const friend = other.team === unit.team, scope = action.item().scope;
        if (scope === 14) return battler.isAlive();
        // (One kept inside what it rides is behind it: nothing of the other side's lands on it while the vehicle stands.)
        if (action.isForOpponent()) return !friend && battler.isAlive() && !(typeof fight.isShielded === "function" && fight.isShielded(other));
        if (!action.isForFriend() || !friend) return false;
        if (action.isForDeadFriend()) return battler.isDead();
        if (scope === 12 || scope === 13) return true;
        return battler.isAlive();
    }

    /** Fills `out` with the units an action by `unit`, standing at (ux, uy), lands on when aimed at (cx, cy). */
    function collectTargets(fight, unit, action, tactics, ux, uy, cx, cy, out) {
        out.length = 0;
        const area = tactics.area;
        for (const other of fight._units) {
            if (!affects(fight, unit, action, other)) continue;
            const character = fight.character(other);
            const x = other === unit ? ux : character.x, y = other === unit ? uy : character.y;
            if (area.shape === "all") { out.push(other); continue; }
            // A big unit is hit once, wherever the area touches it.
            const f = F.footprint(other), x0 = x + f.ox, y0 = y + f.oy, w = f.w, h = f.h;
            let hit = false;
            for (let py = y0; py < y0 + h && !hit; py++) {
                for (let px = x0; px < x0 + w && !hit; px++) hit = G.inArea(area.shape, area.size, ux, uy, cx, cy, px, py);
            }
            if (hit) out.push(other);
        }
        // The party's vehicles stand on the map too (reactor_vehicles_mount.js): each is hit on its own cell, which
        // for one that is ridden is its rider's.
        const vehicles = typeof fight.vehicleUnits === "function" ? fight.vehicleUnits() : EMPTY;
        for (const other of vehicles) {
            if (!affects(fight, unit, action, other)) continue;
            const character = fight.character(other), own = unit.mount > 0 && other.eventId === unit.mount;
            if (area.shape === "all" || G.inArea(area.shape, area.size, ux, uy, cx, cy, own ? ux : character.x, own ? uy : character.y)) out.push(other);
        }
        if (area.shape === "single" && out.length > 1) {
            // A rider and what it rides are two on the cell: the one that was chosen, else the one the battle's rule names.
            const vehicle = vehicles.length ? out.find(other => other.vehicle) : null;
            const rider = vehicle ? out.find(other => !other.vehicle && other.mount === vehicle.eventId) : null;
            if (rider && keepPair) { out.length = 0; out.push(rider, vehicle); return out; }
            let keep = out[0], gap = Infinity;
            if (rider) keep = aimWho === "vehicle" ? vehicle : aimWho === "rider" ? rider : typeof fight.pairTarget === "function" ? fight.pairTarget(rider, vehicle, action) : rider;
            // One target, two on the cell (one under the eave, one on it): the one at the level aimed at, else the first.
            else if (Number.isFinite(aimHeight)) for (const other of out) { const off = Math.abs(G.heightOf(fight.character(other)) - aimHeight); if (off < gap) { gap = off; keep = other; } }
            out.length = 0; out.push(keep);
        }
        return out;
    }
    // Which of a rider and its vehicle a single-target action is for, while targets are collected for it ("": the rule's choice).
    let aimWho = "";
    // Set while the two are asked for (the player is to choose).
    let keepPair = false;
    // The height the player's cursor aims at, while targets are collected for it (NaN: nobody said).
    let aimHeight = NaN;

    //-------------------------------------------------------------------------
    // Game_Fight: the tactical turn. `_act.stage` says where a unit's turn is:
    // "pick" (team turns: the player chooses who goes), "move", "walk",
    // "command", "skill", "item", "target", "aim" (confirmed, the camera may
    // hold it), "perform", "done"; an AI unit thinks in "ai" (the fast pace)
    // or in "plan" (the normal pace, whose watched turn then goes through
    // "look", "ready" and "rest", and whose walk aside may wait in "hold").
    // All of it is plain data, so a save made at any of them loads.

    const STATES = { pick: "unit", move: "move", walk: "moving", command: "command", skill: "skill", item: "item", target: "target", aim: "acting", perform: "acting", done: "acting", ai: "enemy",
        reactAim: "acting", react: "acting" };
    const PLAYER_STAGES = ["pick", "move", "command", "skill", "item", "target"];
    // A list with nothing in it, shared (never written to); reactor_fight_menu.js takes it too.
    const EMPTY = F.EMPTY = [];
    const scratchTargets = [];
    const reachedOut = [];
    // Lists a HUD reads every frame, rebuilt only when what they show changed. Never saved.
    const cache = { serial: -1, floodUnit: 0, floodBudget: -1, floodHash: 0, moveUnit: 0, moveBudget: -1, moveHash: 0, move: EMPTY,
        rangeKey: "", range: EMPTY, rev: -1, area: EMPTY, path: EMPTY, targets: EMPTY, order: EMPTY, orderRev: -1, infos: new Map(), action: null, actionKey: "" };
    const previewOut = { hit: 1, critical: 0, damageMin: 0, damageMax: 0, heals: false, defeats: false, cover: 0, flank: "front", height: 0 };

    /** A tactical battle is running (here or on a map the party left it on). */
    Game_Fight.prototype.isTactical = function() {
        return this._active && this._mode === "tactical";
    };

    Game_Fight.prototype.tac = function() {
        if (!this._tac) this._tac = { rev: 1, cursor: { x: 0, y: 0, on: false }, team: "any", order: [], acted: {}, focus: null, view: null, watch: {} };
        if (!this._tac.watch) this._tac.watch = {};
        return this._tac;
    };

    /** Something a HUD shows changed. */
    Game_Fight.prototype.touch = function() {
        this.tac().rev++;
    };

    const clearFight = Game_Fight.prototype.clear;
    Game_Fight.prototype.clear = function() {
        clearFight.call(this);
        this._tac = null;
    };

    /** Whether the player gives this unit its orders: an actor on the party's side, unless it fights by itself. */
    Game_Fight.prototype.isPlayerUnit = function(unit) {
        if (!unit || unit.team !== "ally" || !unit.actorId || F.autoBattle) return false;
        // The player handed the rest of this turn to the units themselves (commandAuto).
        if (this._tac && this._tac.autoTurn === this._turn) return false;
        const battler = this.battler(unit);
        return !!battler && !battler.isAutoBattle() && !battler.isConfused();
    };

    const startFight = Game_Fight.prototype.start;
    Game_Fight.prototype.start = function(options) {
        const serial = startFight.call(this, options);
        if (serial && this._mode === "tactical") {
            this.tac();
            // Party members standing on one cell (just gathered on the leader) each take their own.
            const taken = [];
            for (const unit of this._units) {
                const character = unit.party ? this.character(unit) : null;
                if (!character) continue;
                if (taken.some(other => other.x === character.x && other.y === character.y)) {
                    const spot = this.freeSpotNear(character.x, character.y, 1) || this.anySpotNear(character.x, character.y);
                    if (spot) {
                        Game_CharacterBase.prototype.locate.call(character, spot.x, spot.y);
                        this._inside[String(unit.id)] = [spot.x, spot.y];
                    }
                }
                taken.push(character);
            }
            for (const unit of this._units) if (unit.eventId) F.standOnLift(this.character(unit));
            F.View.start(this, options && options.view);
        }
        return serial;
    };

    /**
     * An event the map lifts over the ground (its height in the 3D view: `reactor3d.eventZ`) onto a roof, a deck or
     * a wall top stands ON that place in a battle: the level of its cell nearest its lifted height becomes the
     * ground it stands on, and the lift is spent. One lifted to no place to stand (a bird, a lamp) is left as it is.
     */
    F.standOnLift = function(character) {
        const lift = character ? Number(character._reactorLift) || 0 : 0;
        if (lift < 0.75 || !G.is3D()) return false;
        const base = Reactor3D.groundHeightAt($dataMap, character.x + 0.5, character.y + 0.5) || 0;
        let best = NaN, gap = LEVEL_GAP;
        for (const h of G.levelHeights(character.x, character.y)) {
            const off = Math.abs(h - (base + lift));
            if (off < gap && h > base + 0.75) { gap = off; best = h; }
        }
        if (!Number.isFinite(best)) return false;
        character._reactorGround = best;
        character._reactorAlt = undefined;
        character._reactorLift = 0;
        character._reactorZTarget = 0;
        return true;
    };

    /** A free cell beside (x, y) whatever its tiles say: on a map nobody can walk, units still stand apart. */
    Game_Fight.prototype.anySpotNear = function(x, y) {
        for (let radius = 1; radius <= 3; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || !$gameMap.isValid(x + dx, y + dy)) continue;
                    if (!this.unitAt(x + dx, y + dy) && !$gamePlayer.pos(x + dx, y + dy) && !$gameMap.eventsXyNt(x + dx, y + dy).length) return { x: x + dx, y: y + dy };
                }
            }
        }
        return null;
    };

    const finishFight = Game_Fight.prototype.finish;
    Game_Fight.prototype.finish = function() {
        const tactical = this.isTactical();
        if (tactical) {
            // A walk the end cuts short (a page won the battle on the way, or took the party off the map) leaves
            // the character as it was: solid, at its own pace.
            const act = this._act, walker = act && act.unitId && act.path ? this.character(this.unit(act.unitId)) : null;
            if (walker) { walker.setThrough(act.through); walker.setMoveSpeed(act.speed); act.path = null; }
            for (const mover of (this._tac && this._tac.movers) || EMPTY) { mover.plan = null; this.endMover(mover, false); }
            for (const mover of (this._tac && this._tac.aside) || EMPTY) this.endMover(mover, false);
            // An action still playing beside the others is cut off as the one in front is.
            for (const run of (this._tac && this._tac.runs) || EMPTY) this.endStage(run, true);
            if (this._tac) this._tac.runs = null;
            F.View.end(this);
        }
        finishFight.call(this);
        if (tactical && typeof $gamePlayer !== "undefined" && !$gamePlayer.isTransferring()) $gamePlayer.center($gamePlayer.x, $gamePlayer.y);
    };

    const updateFight = Game_Fight.prototype.update;
    Game_Fight.prototype.update = function() {
        const tactical = this._active && this._mode === "tactical" && this.isHere();
        // The battle menu is up: the battle waits behind it.
        if (tactical && W.isMenuOpen && W.isMenuOpen()) return;
        // A click on the turn strip is the strip's, not the map's under it.
        if (tactical) this.updateStripClick();
        if (tactical && !this._ending) this.noteFallen();
        // One more frame of the battle: what the units' thinking shares its time by (AI.think).
        F.AI.tick = (F.AI.tick || 0) + 1;
        updateFight.call(this);
        if (this._active && this._mode === "tactical" && this.isHere()) {
            this.updateMovers();
            this.updateSideRuns();
            F.Hints.update(this);
            F.View.update(this);
        }
    };

    /**
     * A unit that died by something other than a blow of the battle (an event's Change HP, a cost it paid) has
     * fallen all the same: it fades, its pages run, and the goal is judged. A fallen party member an event brought
     * back stands again. Returns how many fell.
     */
    Game_Fight.prototype.noteFallen = function() {
        let fell = 0;
        for (const unit of this._units) {
            if (unit.gone || unit.down || unit.team === "neutral") continue;
            const battler = this.battler(unit);
            if (unit.defeated) {
                // (An event's unit too, while there is still something of it to stand: a body, or one not yet faded.)
                const character = battler && battler.isAlive() ? this.character(unit) : null;
                if (character) { this.raise(unit); this.touch(); }
                continue;
            }
            if (!battler || !battler.isDead()) continue;
            this.defeat(unit);
            fell++;
        }
        if (fell) this.checkOutcome();
        return fell;
    };

    const spawnUnit = Game_Fight.prototype.spawn;
    Game_Fight.prototype.spawn = function(options) {
        const unit = spawnUnit.call(this, options);
        if (unit) {
            if (this._tac && unit.eventId) F.standOnLift(this.character(unit));
            if (F.feed()) ReactorEvents.emit("fightUnitSpawned", { unitId: unit.id, eventId: unit.eventId, team: unit.team });
            if (this._tac) this.touch();
        }
        return unit;
    };

    for (const name of ["defeat", "removeUnit", "setEventSide", "setObjective"]) {
        const original = Game_Fight.prototype[name];
        Game_Fight.prototype[name] = function() {
            const result = original.apply(this, arguments);
            if (this._tac) this.touch();
            return result;
        };
    }

    const startRound = Game_Fight.prototype.startRound;
    Game_Fight.prototype.startRound = function() {
        startRound.call(this);
        if (!this.isTactical()) return;
        const tac = this.tac();
        tac.order = this._queue.filter(entry => entry.kind === "unit").map(entry => entry.unitId);
        tac.acted = {};
        tac.team = this._turns === "team" ? "ally" : "any";
        this.touch();
    };

    /** The player's units still to act in this side's turn (team turns), in queue order. */
    Game_Fight.prototype.pendingUnits = function() {
        const list = [];
        for (const entry of this._queue) {
            if (entry.kind !== "unit") break;
            const unit = this.unit(entry.unitId);
            if (this.isAlive(unit) && this.isPlayerUnit(unit) && this.battler(unit).canMove()) list.push(unit);
        }
        return list;
    };

    const nextInQueue = Game_Fight.prototype.nextInQueue;
    Game_Fight.prototype.nextInQueue = function() {
        if (!this.isTactical()) return nextInQueue.call(this);
        const entry = this._queue[0];
        if (this._tac && ((this._tac.movers && this._tac.movers.length) || (this._tac.aside && this._tac.aside.length) || (this._tac.runs && this._tac.runs.length))) {
            // Units still walking or acting: only another unit that decides for itself may begin; a side's turn does not end under them.
            const next = entry && entry.kind === "unit" ? this.unit(entry.unitId) : null;
            if (!next || this.isPlayerUnit(next)) return;
        }
        if (entry && entry.kind === "turnStart") {
            const tac = this.tac();
            tac.team = entry.team;
            // A side's turn begins: its units that kept watch through the other side's turn lower their weapons.
            for (const id of Object.keys(tac.watch)) { const watcher = this.unit(Number(id)); if (!watcher || watcher.team === entry.team) delete tac.watch[id]; }
            if (entry.team !== "any" && F.feed()) ReactorEvents.emit("fightTeamTurn", { team: entry.team, turn: this._turn });
            this.touch();
        }
        if (!entry || entry.kind !== "unit") return nextInQueue.call(this);
        const unit = this.unit(entry.unitId);
        const battler = this.battler(unit);
        if (!this.isAlive(unit) || !battler.canMove()) {
            // Fallen since the round began, or held by a state: the turn passes. For one that is held it has
            // ended all the same: what wears off as a turn ends (a stun, a buff) does.
            this._queue.shift();
            if (unit) this.tac().acted[unit.id] = true;
            if (battler && battler.isAlive()) battler.onAllActionsEnd();
            return;
        }
        if (this._turns === "team" && this.isPlayerUnit(unit)) {
            this.beginPick();
            return;
        }
        this._queue.shift();
        this.beginUnit(unit);
    };

    /** Team turns: the player chooses which unit goes next. */
    Game_Fight.prototype.beginPick = function() {
        const first = this.pendingUnits()[0];
        if (!first) return;
        this._act = { unitId: 0, steps: 0, stage: "pick", targetId: 0, player: true };
        this._phase = "act";
        this._progress = true;
        const character = this.character(first);
        this.setCursor(character.x, character.y, G.heightOf(character));
        this.focusOn(character.x, character.y);
        F.View.unblock(this, character.x, character.y, G.heightOf(character));
        this.touch();
    };

    Game_Fight.prototype.beginUnit = function(unit) {
        const character = this.character(unit), player = this.isPlayerUnit(unit);
        // A unit that decides for itself thinks in "ai" at the fast pace, with the view on it at once; at the normal
        // pace it thinks in "plan", and the view goes to it only if what it decided is played in front of the player.
        const watched = !player && this.isWatched();
        this._act = {
            unitId: unit.id, steps: F.moveOf(unit), stage: player ? "move" : watched ? "plan" : "ai", targetId: 0, player,
            origin: { x: character.x, y: character.y, d: character.direction(), height: G.heightOf(character) },
            moved: false, locked: false, path: null, through: false, speed: 4, item: null, back: "command", plan: null
        };
        this._phase = "act";
        if (player) this._progress = true;
        delete this.tac().watch[unit.id];
        if (!watched) {
            this.setCursor(character.x, character.y, G.heightOf(character));
            this.focusOn(character.x, character.y);
        }
        if (player) F.View.unblock(this, character.x, character.y, G.heightOf(character));
        if (F.feed()) ReactorEvents.emit("fightUnitTurn", { unitId: unit.id, team: unit.team, player });
        this.touch();
    };

    const updateAct = Game_Fight.prototype.updateAct;
    Game_Fight.prototype.updateAct = function() {
        if (!this.isTactical()) return updateAct.call(this);
        const act = this._act;
        if (!act) { this._phase = "queue"; return; }
        if (act.stage === "pick") {
            if (!this.pendingUnits().length) { this._act = null; this._phase = "queue"; this.touch(); }
            else F.Input.update(this);
            return;
        }
        if (act.stage === "reactAim" || act.stage === "react") {
            this.updateReaction();
            return;
        }
        const unit = this.unit(act.unitId), character = this.character(unit);
        if (!unit || !this.isAlive(unit) || !character) {
            this.finishAct();
            return;
        }
        if (act.player && PLAYER_STAGES.includes(act.stage) && !this.isPlayerUnit(unit)) {
            // No longer the player's to order (confused, or the battle set to play itself): it decides for itself.
            act.player = false;
            act.item = null;
            act.stage = act.moved ? "done" : this.isWatched() ? "plan" : "ai";
            this.touch();
            return;
        }
        switch (act.stage) {
            case "move":
            case "target":
                F.Input.update(this);
                break;
            case "walk":
                this.updateWalk(unit, character);
                break;
            case "ai":
                this.updateAi(unit, character);
                break;
            case "plan":
                this.updatePlan(unit, character);
                break;
            case "hold":
                this.updateHold(unit, character);
                break;
            case "look":
                if (this.awaitView(character, F.BEAT_LOOK) || --act.beat > 0) break;
                if (act.route && act.route.length) this.startWalk(unit, character, act.route);
                else this.actOnPlan(unit);
                act.route = null;
                break;
            case "ready":
                if (this.awaitView(character, F.BEAT_AIM) || --act.beat > 0) break;
                // Whoever it meant to strike may have fallen or moved meanwhile: then it only turns to the fight.
                if (!this.beginAction(unit, act.plan.kind, act.plan.id, act.plan.cx, act.plan.cy)) { this.faceNearest(unit); act.stage = "done"; }
                break;
            case "rest":
                if (--act.beat <= 0) this.finishAct();
                break;
            case "aim":
                if (F.feed()) ReactorEvents.emit("fightFire", { unitId: unit.id, kind: this._run.kind, itemId: this._run.itemId, targetIds: this._run.targetIds, cell: this._run.cell });
                act.stage = "perform";
                break;
            case "perform":
                if (this.updateRun()) return;
                F.heldItem(character, "aim", null);
                if (F.feed()) ReactorEvents.emit("fightActionEnd", { unitId: unit.id });
                // At the normal pace the result of a unit's own action is read before the next unit begins.
                if (act.watched) this.restAfter(F.BEAT_REST);
                else this.finishAct();
                break;
            case "done":
                this.finishAct();
                break;
            // "command", "skill", "item": the windows (or a HUD's own buttons) call the commands.
        }
    };

    const finishAct = Game_Fight.prototype.finishAct;
    Game_Fight.prototype.finishAct = function() {
        const act = this._act, tactical = this.isTactical();
        if (tactical && act && act.unitId) {
            const character = this.character(this.unit(act.unitId));
            // A walk cut short (the unit fell, the battle ended) leaves the character as it was.
            if (character && act.path) { character.setThrough(act.through); character.setMoveSpeed(act.speed); }
            this.tac().acted[act.unitId] = true;
        }
        const quick = tactical && act && !act.player && (!(act.plan && act.plan.kind && act.plan.kind !== "watch") || this._phase !== "act" || act.stage === "ai" || act.stage === "plan" || act.stage === "hold");
        finishAct.call(this);
        if (tactical && this._tac) {
            // A unit that only moved (or did nothing) hands over at once; the other side's units follow each other closely
            // (at the normal pace the beats of a watched turn have already passed: F.BEAT_REST, F.BEAT_MOVED).
            if (quick) this._wait = 1;
            else if (act && !act.player) this._wait = F.AI_WAIT;
            this._tac.cursor.on = false;
            this.touch();
        }
    };

    //-------------------------------------------------------------------------
    // Walking a path.

    Game_Fight.prototype.startWalk = function(unit, character, steps) {
        const act = this._act;
        act.path = steps;
        act.through = character.isThrough();
        act.speed = character.moveSpeed();
        act.stage = "walk";
        // The path is the rule; friends are walked through, and nothing on the way stops the step.
        character.setThrough(true);
        // The other side does not dawdle: a unit that only closes in runs (a watched walk stays at a pace the eye follows).
        if (!act.player) character.setMoveSpeed(Math.max(act.speed, act.watched || (act.plan && act.plan.kind && act.plan.kind !== "watch") ? 5 : 6));
        // A unit on a vehicle rides its way.
        else if (typeof F.mountOf === "function" && F.mountOf(unit)) character.setMoveSpeed(Math.max(act.speed, F.MOUNT_SPEED || 5.5));
        this._progress = true;
        if (F.feed()) ReactorEvents.emit("fightMoveStart", { unitId: unit.id, path: steps.map(step => ({ x: step.x, y: step.y })), long: steps.length >= 5 });
        this.touch();
    };

    Game_Fight.prototype.takeStep = function(character, step) {
        if (step.hop) {
            character.setDirection(step.d);
            // The world's own climb where it plays one (a ladder, a mantle); else a hop.
            if (!(G.playStep && G.playStep(character, step))) character.jump(step.x - character.x, step.y - character.y);
        } else {
            // The way was found with the body turned as each step turns it: the turn is the way's, not asked about again.
            // A step taken backward (a long body that had no room to turn round) keeps the facing the way gives it.
            const backward = !!step.face && step.face !== step.d, fixed = character.isDirectionFixed();
            stepping = character;
            try {
                if (backward) {
                    if (character.direction() !== step.face) character.setDirection(step.face);
                    character.setDirectionFix(true);
                }
                character.moveStraight(step.d);
            } finally {
                if (backward) character.setDirectionFix(fixed);
                stepping = null;
            }
        }
    };

    //-------------------------------------------------------------------------
    // The pace of the units that decide for themselves (F.PACES). The player
    // chooses it in the battle menu's Options and it is kept with the game's
    // options; a project says what a new player starts with (System.json
    // `reactorBattle.pace`); "normal" without either.

    F.pace = function() {
        const own = typeof ConfigManager !== "undefined" && ConfigManager ? ConfigManager.rrFightPace : "";
        if (F.PACES.includes(own)) return own;
        const project = F.systemSettings().pace;
        return F.PACES.includes(project) ? project : "normal";
    };

    /** The player's choice of pace, kept with the game's options. Returns the pace in force. */
    F.setPace = function(pace) {
        if (F.PACES.includes(pace) && typeof ConfigManager !== "undefined" && ConfigManager) {
            ConfigManager.rrFightPace = pace;
            if (ConfigManager.save) ConfigManager.save();
        }
        return F.pace();
    };

    if (typeof ConfigManager !== "undefined" && ConfigManager && ConfigManager.makeData && ConfigManager.applyData) {
        const makeData = ConfigManager.makeData, applyData = ConfigManager.applyData;
        ConfigManager.makeData = function() {
            const config = makeData.call(this);
            if (F.PACES.includes(this.rrFightPace)) config.rrFightPace = this.rrFightPace;
            if (this.rrFightHints === false) config.rrFightHints = false;
            return config;
        };
        ConfigManager.applyData = function(config) {
            applyData.call(this, config);
            this.rrFightPace = F.PACES.includes(config.rrFightPace) ? config.rrFightPace : "";
            this.rrFightHints = config.rrFightHints !== false;
        };
    }

    /** The units still standing on either side. */
    Game_Fight.prototype.standing = function() {
        let standing = 0;
        for (const unit of this._units) if (!unit.gone && !unit.defeated && unit.team !== "neutral") standing++;
        return standing;
    };

    /**
     * An army: a battle that has had more than F.ARMY units standing. It plays at the fast pace whatever the
     * player's setting, and to its end: the pace does not change under the player as its lines thin out.
     */
    Game_Fight.prototype.isArmy = function() {
        const tac = this._tac;
        if (tac && tac.army) return true;
        if (this.standing() <= F.ARMY) return false;
        if (tac) tac.army = true;
        return true;
    };

    /** Whether the units that decide for themselves take their turns one at a time, each one watched: the normal pace in a battle that is no army. */
    Game_Fight.prototype.isWatched = function() {
        return F.pace() === "normal" && !this.isArmy();
    };

    /** Whether the units that decide for themselves act quick: a crowd at the fast pace (and in an army at the normal one), any battle at "skip". */
    Game_Fight.prototype.isCrowded = function() {
        const pace = F.pace();
        if (pace === "skip") return true;
        return pace === "fast" || this.isArmy() ? this.standing() > F.CROWD : false;
    };

    /** Whether the battle's own units act side by side: above F.OVERLAP at the fast pace (and in an army at the normal one), any battle at "skip". */
    Game_Fight.prototype.overlaps = function() {
        const pace = F.pace();
        if (pace === "skip") return true;
        return pace === "fast" || this.isArmy() ? this.standing() > F.OVERLAP : false;
    };

    //-------------------------------------------------------------------------
    // The normal pace: one unit at a time, each turn shown from its first
    // look to its result.

    /**
     * A unit that decides for itself has thought ("plan"); what it decided says how its turn is shown. An action,
     * a walk near the units it fights or under someone's watch: the view goes to the unit and rests on it ("look"),
     * it walks, its target is pointed at ("ready"), the action plays whole and its result is read ("rest"). A walk
     * far from everyone it fights goes off to the side with the others doing the same (`tac.aside`) while the next
     * unit begins; with every place there taken it waits for one ("hold"). Nothing to do: the turn passes unseen.
     * While the view is away showing someone (a unit that just joined) no turn begins: the unit is not shown as
     * acting over a picture of somebody else.
     */
    Game_Fight.prototype.updatePlan = function(unit, character) {
        const act = this._act;
        // Nothing has been looked at yet in this battle (the other side goes first on a map with no opening):
        // the view starts from this unit, so whoever it is showing has its time and no longer.
        if (!this._tac.focus) this.focusOn(character.x, character.y);
        if (this.viewHeld()) return;
        act.away = 0;
        const plan = AI.think(this, unit, character);
        if (!plan) return;
        act.plan = { kind: plan.kind, id: plan.id, cx: plan.cx, cy: plan.cy };
        const acts = !!plan.kind && plan.kind !== "watch";
        if (!acts && !plan.steps.length) {
            this.actOnPlan(unit);
        } else if (!acts && this.walksAside(unit, character, plan.steps) && !this.walkWatched(unit, plan.steps)) {
            if (this.walkRoom(unit)) this.detachWalk(unit, character, plan.steps, plan.kind === "watch", null, true);
            else { act.route = plan.steps; act.stage = "hold"; }
        } else {
            this.watchTurn(unit, character, plan.steps);
        }
        this.touch();
    };

    /** The acting unit's turn is played in front of the player: the view goes to it and rests there before it does anything. */
    Game_Fight.prototype.watchTurn = function(unit, character, steps) {
        const act = this._act;
        act.watched = true;
        act.route = steps;
        act.stage = "look";
        act.beat = F.BEAT_LOOK;
        this.setCursor(character.x, character.y, G.heightOf(character));
        this.focusOn(character.x, character.y);
        F.View.unblock(this, character.x, character.y, G.heightOf(character));
    };

    /**
     * Whether the acting unit's turn waits for the view, which is away showing someone (the View's visit: a unit that
     * joined, whoever speaks): counted in `act.away`, and never longer than F.BEAT_AWAY, after which the turn takes
     * the view back.
     */
    Game_Fight.prototype.viewHeld = function() {
        if (!View.isVisiting(this)) return false;
        const act = this._act;
        act.away = (act.away || 0) + 1;
        if (act.away <= F.BEAT_AWAY) return true;
        View.endVisit();
        return false;
    };

    /**
     * A beat of a watched turn does not begin while the view is away showing someone (a unit that just joined,
     * whoever spoke): nothing of the turn plays out of the picture. True while the turn waits. When the view is
     * free it is sent back to the unit and the beat (`frames`) is counted from its start.
     */
    Game_Fight.prototype.awaitView = function(character, frames) {
        const act = this._act;
        if (this.viewHeld()) return true;
        if (!act.away) return false;
        act.away = 0;
        act.beat = frames;
        this.focusOn(character.x, character.y);
        View.unblock(this, character.x, character.y, G.heightOf(character));
        return true;
    };

    /** A unit waiting for a place among those walking aside: it goes when one is free, in front of the player if a watch now reaches its way. */
    Game_Fight.prototype.updateHold = function(unit, character) {
        const act = this._act;
        if (this.walkWatched(unit, act.route)) this.watchTurn(unit, character, act.route);
        else if (this.walkRoom(unit)) this.detachWalk(unit, character, act.route, !!act.plan && act.plan.kind === "watch", null, true);
        else return;
        this.touch();
    };

    /**
     * Whether a walk that is all a unit does this turn is taken off to the side at the normal pace: its way begins
     * and ends further than F.ASIDE steps from every unit it fights. Nearer, the walk is watched like any turn.
     */
    Game_Fight.prototype.walksAside = function(unit, character, steps) {
        const last = steps[steps.length - 1];
        for (const other of this._units) {
            if (other.gone || other.team === unit.team || other.team === "neutral" || !this.isAlive(other)) continue;
            const c = this.character(other);
            if (!c) continue;
            if (F.stepsTo(other, c.x, c.y, character.x, character.y) <= F.ASIDE || F.stepsTo(other, c.x, c.y, last.x, last.y) <= F.ASIDE) return false;
        }
        return true;
    };

    /** The acting unit's turn rests a beat before it ends, so what it did is read; a battle its action decided ends at once. */
    Game_Fight.prototype.restAfter = function(frames) {
        const act = this._act;
        this.checkOutcome();
        if (this._ending) { this.finishAct(); return; }
        act.stage = "rest";
        act.beat = frames;
        this.touch();
    };

    //-------------------------------------------------------------------------
    // The other side moving together (the fast pace, and an army at any): a
    // unit that only moves this turn walks on its own while the next one takes
    // its turn (up to F.MOVERS_MAX at once), so a phase of units closing in
    // does not play one walk at a time. Not while anyone of the other side
    // keeps watch: a reaction shot needs the walk in front of it. The units
    // walking on their own are `tac.movers` (the view pulls back to take them
    // all in) and, at the normal pace, `tac.aside` (the view stays with the
    // unit whose turn is watched).

    /** The walk of a unit that is walking on its own, or null. */
    Game_Fight.prototype.moverOf = function(unit) {
        const tac = this._tac;
        if (!tac) return null;
        const movers = tac.movers, aside = tac.aside;
        if (movers) for (let i = 0; i < movers.length; i++) if (movers[i].unitId === unit.id) return movers[i];
        if (aside) for (let i = 0; i < aside.length; i++) if (aside[i].unitId === unit.id) return aside[i];
        return null;
    };

    /** What the walks and actions under way are expected to take from a unit. */
    Game_Fight.prototype.pendingOn = function(target) {
        const tac = this._tac;
        let sum = 0;
        for (const mover of (tac && tac.movers) || EMPTY) if (mover.plan && mover.plan.targets && mover.plan.targets.includes(target.id)) sum += mover.plan.expect;
        for (const run of (tac && tac.runs) || EMPTY) if (!run.applied && run.targetIds.includes(target.id)) sum += run.expect || 0;
        return sum;
    };

    /**
     * Whether a planned action may play beside the others: the battle is big enough, nobody of the other side keeps
     * watch, it is not decisive (a party member about to fall, a heavy blow on the leader: those are watched alone),
     * and none of its targets is already expected to fall to an action under way (then the unit thinks again).
     * Returns "side", "alone" or "wait"; fills `plan.targets` and `plan.expect`.
     */
    Game_Fight.prototype.judgePlan = function(unit, character, plan) {
        if (!this.overlaps() || !this.canDetach(unit, plan.steps)) return "alone";
        const battler = this.battler(unit), action = new Game_Action(battler);
        if (plan.kind === "skill") action.setSkill(plan.id); else action.setItem(plan.id);
        const tactics = F.tactics(battler, action.item());
        const last = plan.steps.length ? plan.steps[plan.steps.length - 1] : character;
        const height = plan.steps.length ? last.height : G.heightOf(character);
        const targets = collectTargets(this, unit, action, tactics, last.x, last.y, plan.cx, plan.cy, []);
        let expect = 0, alone = false, wait = false;
        for (const target of targets) {
            const other = this.battler(target);
            F._strike = setStrike(this, action, tactics, unit.team, last.x, last.y, height, target);
            try { estimateAction(action, other); } finally { F._strike = null; }
            const amount = estimate.heals ? 0 : (estimate.min + estimate.max) / 2 * estimate.hit;
            expect = Math.max(expect, amount);
            if (target.team !== unit.team && !target.party && this.pendingOn(target) >= other.hp) wait = true;
            // Decisive: a party member about to fall, or a heavy blow (a quarter of its life) on the leader.
            if (target.party && target.team !== unit.team && (amount >= other.hp - this.pendingOn(target) || (this.character(target) === $gamePlayer && amount >= other.mhp / 4))) alone = true;
        }
        plan.targets = targets.map(target => target.id);
        plan.expect = expect;
        return wait ? "wait" : alone ? "alone" : "side";
    };

    /** A unit's action beside the others: a quick run of its own, with the same events as any action. */
    Game_Fight.prototype.beginSideAction = function(unit, plan) {
        const battler = this.battler(unit), character = this.character(unit);
        const action = new Game_Action(battler);
        if (plan.kind === "skill") action.setSkill(plan.id); else action.setItem(plan.id);
        const item = action.item();
        if (!item || !battler.canUse(item)) return false;
        const tactics = F.tactics(battler, item);
        const targets = collectTargets(this, unit, action, tactics, character.x, character.y, plan.cx, plan.cy, []);
        if (!targets.length) return false;
        const dx = plan.cx - character.x, dy = plan.cy - character.y;
        if (dx || dy) character.setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8));
        battler.useItem(item);
        this._progress = true;
        const run = F.makeRun(this, unit, action, targets);
        run.cell = { x: plan.cx, y: plan.cy };
        // An army's units act quick (no sequence). In a battle that is big but no army, a side action plays its own
        // Action Sequence at double pace beside the others (the stage runs several at once; `side` keeps it from the camera).
        if (this.isCrowded() || !F.Stage) run.quick = true;
        else { run.side = true; run.rate = F.SIDE_RATE; }
        run.expect = plan.expect || 0;
        const tac = this.tac();
        (tac.runs || (tac.runs = [])).push(run);
        if (F.feed()) {
            // `quick`: one of several at once, not an action to film; `side` says so by name.
            ReactorEvents.emit("fightAim", { unitId: unit.id, kind: plan.kind, itemId: plan.id, targetIds: run.targetIds, cell: run.cell, ranged: tactics.max >= 2, quick: true, side: true });
            ReactorEvents.emit("fightFire", { unitId: unit.id, kind: plan.kind, itemId: plan.id, targetIds: run.targetIds, cell: run.cell, quick: true, side: true });
        }
        return true;
    };

    /** The actions playing side by side, each a frame further; the foreground's own run is left as it is. */
    Game_Fight.prototype.updateSideRuns = function() {
        const runs = this._tac && this._tac.runs;
        if (!runs || !runs.length) return;
        const own = this._run;
        for (let i = runs.length - 1; i >= 0; i--) {
            const run = runs[i];
            this._run = run;
            let more = false;
            try { more = this.updateRun(); } finally { this._run = own; }
            if (more) continue;
            runs.splice(i, 1);
            const unit = this.unit(run.subjectId), battler = this.battler(unit);
            if (battler && battler.isAlive()) battler.onAllActionsEnd();
            if (F.feed()) ReactorEvents.emit("fightActionEnd", { unitId: run.subjectId, quick: true, side: true });
            this.touch();
            this.checkOutcome();
        }
    };

    Game_Fight.prototype.canDetach = function(unit, steps) {
        return this.walkRoom(unit) && !this.walkWatched(unit, steps);
    };

    /** Whether one more unit may walk on its own now: a third of its side at once (walks and the actions that follow them), never fewer than F.MOVERS_MAX. */
    Game_Fight.prototype.walkRoom = function(unit) {
        const tac = this.tac();
        let side = 0;
        for (const other of this._units) if (!other.gone && other.team === unit.team) side++;
        const busy = (tac.movers ? tac.movers.length : 0) + (tac.aside ? tac.aside.length : 0) + (this.isCrowded() && tac.runs ? tac.runs.length : 0);
        return busy < Math.max(F.MOVERS_MAX, Math.ceil(side / 3));
    };

    /**
     * Whether a walk passes under someone's watch: it is then taken in front of the player (the reaction shot needs
     * it there); one no watcher can reach goes with the others. Without the way given, any watcher of the other side counts.
     */
    Game_Fight.prototype.walkWatched = function(unit, steps) {
        const tac = this.tac();
        let watched = false;
        for (const id of Object.keys(tac.watch)) {
            const watcher = this.unit(Number(id));
            if (watcher && watcher.team !== unit.team && this.isAlive(watcher)) { watched = true; break; }
        }
        if (!watched) return false;
        if (!steps) return true;
        const character = this.character(unit);
        probe.x = character.x; probe.y = character.y; probe._reactorGround = G.heightOf(character);
        for (const step of steps) {
            probe.x = step.x; probe.y = step.y;
            if (Number.isFinite(step.height)) probe._reactorGround = step.height;
            if (this.watcherFor(unit, probe)) return true;
        }
        return false;
    };
    // A place on a unit's way, as a watcher's reach is tested against it.
    const probe = { x: 0, y: 0, _reactorGround: 0 };

    /** A unit starts walking on its own and its turn passes: with the others (`tac.movers`), or `aside` at the normal pace. */
    Game_Fight.prototype.detachWalk = function(unit, character, steps, watch, plan, aside) {
        const tac = this.tac();
        (aside ? tac.aside || (tac.aside = []) : tac.movers || (tac.movers = []))
            .push({ unitId: unit.id, path: steps, through: character.isThrough(), speed: character.moveSpeed(), watch: !!watch, plan: plan || null });
        character.setThrough(true);
        character.setMoveSpeed(Math.max(character.moveSpeed(), aside ? 5 : 6));
        this._progress = true;
        if (F.feed()) ReactorEvents.emit("fightMoveStart", { unitId: unit.id, path: steps.map(step => ({ x: step.x, y: step.y })), long: steps.length >= 5 });
        this.finishAct();
    };

    Game_Fight.prototype.endMover = function(mover, arrived) {
        const unit = this.unit(mover.unitId), character = this.character(unit);
        if (!character) return;
        character.setThrough(mover.through);
        character.setMoveSpeed(mover.speed);
        if (!arrived) return;
        if (F.feed()) ReactorEvents.emit("fightMoveEnd", { unitId: unit.id, x: character.x, y: character.y });
        if (mover.plan && this.beginSideAction(unit, mover.plan)) return;
        if (!(mover.watch && this.armOverwatch(unit))) this.faceNearest(unit);
    };

    Game_Fight.prototype.updateMovers = function() {
        const tac = this._tac;
        if (!tac || this.isBusy()) return;
        if (tac.movers && tac.movers.length) this.stepMovers(tac.movers);
        const aside = tac.aside;
        if (!aside || !aside.length) return;
        this.stepMovers(aside);
        // With nobody's turn in front of the player, the view goes with the first of those walking aside: the other
        // side closing in is seen, and the view leaves them the moment a turn is watched.
        const act = this._act;
        if (aside.length && (!act || act.stage === "plan" || act.stage === "hold")) {
            const lead = this.character(this.unit(aside[0].unitId));
            if (lead) this.focusOn(lead._realX, lead._realY);
        }
    };

    /** The units of one list of walkers, each a step further when its last step is done. */
    Game_Fight.prototype.stepMovers = function(movers) {
        for (let i = movers.length - 1; i >= 0; i--) {
            const mover = movers[i], unit = this.unit(mover.unitId), character = this.character(unit);
            if (!unit || !character || !this.isAlive(unit)) { this.endMover(mover, false); movers.splice(i, 1); continue; }
            if (character.isMoving() || character.isJumping() || (G.isStepping && G.isStepping(character))) continue;
            this.checkEnterHooks(unit, character);
            const step = mover.path.shift();
            if (step) { this.takeStep(character, step); continue; }
            this.endMover(mover, true);
            movers.splice(i, 1);
            this.touch();
        }
    };

    Game_Fight.prototype.updateWalk = function(unit, character) {
        if (character.isMoving() || character.isJumping() || (G.isStepping && G.isStepping(character))) return;
        const act = this._act;
        const hooks = this._hooks.length;
        this.checkEnterHooks(unit, character);
        if (this._hooks.length > hooks) act.locked = true;
        if (this._hooks.length || this.isBusy()) return;
        // A unit of the other side keeping watch takes its shot as this one steps into its reach.
        if (act.stepped && this.startReaction(unit, character)) return;
        const step = act.path && act.path.shift();
        act.stepped = !!step;
        if (step) {
            this.takeStep(character, step);
            this.touch();
            return;
        }
        character.setThrough(act.through);
        character.setMoveSpeed(act.speed);
        // The view settles on the cell it arrived at, not on the last frame of the way there.
        this.focusOn(character.x, character.y);
        act.path = null;
        act.moved = true;
        if (F.feed()) ReactorEvents.emit("fightMoveEnd", { unitId: unit.id, x: character.x, y: character.y });
        if (act.player) act.stage = "command";
        else this.actOnPlan(unit);
        this.touch();
    };

    /** An AI unit does what it planned from where it now stands: its action, a watch, or nothing; then it turns to the fight. */
    Game_Fight.prototype.actOnPlan = function(unit) {
        const act = this._act, plan = act.plan;
        if (plan && plan.kind && plan.kind !== "watch") {
            if (act.watched) {
                // The normal pace: the cell it aims at is pointed out (and the unit there shown) a beat before the action begins.
                act.stage = "ready";
                act.beat = F.BEAT_AIM;
                this.setCursor(plan.cx, plan.cy);
                return;
            }
            if (this.beginAction(unit, plan.kind, plan.id, plan.cx, plan.cy)) return;
        }
        if (!(plan && plan.kind === "watch" && this.armOverwatch(unit))) this.faceNearest(unit);
        // A walk that was watched is taken in before the next unit begins.
        if (act.watched && act.moved) this.restAfter(F.BEAT_MOVED);
        else act.stage = "done";
    };

    //-------------------------------------------------------------------------
    // Overwatch: a unit whose attack reaches two tiles or more may end its turn
    // on watch. The first unit of the other side that steps into its attack's
    // reach and sight, before the watcher's side moves again, takes one attack
    // at a lower chance to hit.

    F.OVERWATCH_HIT = 0.7;

    Game_Fight.prototype.canOverwatch = function(unit) {
        const battler = this.battler(unit);
        if (!battler || !this.isAlive(unit) || !battler.canAttack()) return false;
        return F.tactics(battler, $dataSkills[battler.attackSkillId()]).max >= 2;
    };

    Game_Fight.prototype.isOnOverwatch = function(unit) {
        return !!(unit && this._tac && this._tac.watch && this._tac.watch[unit.id]);
    };

    Game_Fight.prototype.armOverwatch = function(unit) {
        if (!this.isTactical() || !this.canOverwatch(unit)) return false;
        this.tac().watch[unit.id] = this._turn;
        this._progress = true;
        F.heldItem(this.character(unit), "aim", null);
        if (F.feed()) ReactorEvents.emit("fightOverwatch", { unitId: unit.id, team: unit.team });
        this.touch();
        return true;
    };

    /** The watcher that has `mover` in its attack's reach and sight now, or null. */
    Game_Fight.prototype.watcherFor = function(mover, character) {
        const watch = this._tac && this._tac.watch;
        if (!watch) return null;
        for (const id of Object.keys(watch)) {
            const watcher = this.unit(Number(id)), battler = this.battler(watcher), own = this.character(watcher);
            if (!watcher || watcher.team === mover.team || !this.isAlive(watcher) || !own || !battler.canMove() || !battler.canAttack()) continue;
            const tactics = F.tactics(battler, $dataSkills[battler.attackSkillId()]);
            const near = F.nearestCell(mover, character.x, character.y, own.x, own.y), tx = near.x, ty = near.y;
            const distance = F.stepsTo(watcher, own.x, own.y, tx, ty);
            if (distance < tactics.min || distance > F.reachAt(tactics, G.heightOf(own), G.heightOf(character))) continue;
            if (!F.heightInReach(tactics, G.heightOf(own), G.heightOf(character))) continue;
            if (tactics.los && distance > 1 && !G.sight(own.x, own.y, G.heightOf(own), tx, ty, G.heightOf(character))) continue;
            return watcher;
        }
        return null;
    };

    /** The reaction shot begins: the walk waits, the watcher turns and aims. */
    Game_Fight.prototype.startReaction = function(mover, character) {
        const watcher = this.watcherFor(mover, character);
        if (!watcher) return false;
        const act = this._act, battler = this.battler(watcher), own = this.character(watcher);
        delete this.tac().watch[watcher.id];
        const action = new Game_Action(battler);
        action.setAttack();
        const dx = character.x - own.x, dy = character.y - own.y;
        if (dx || dy) own.setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8));
        battler.useItem(action.item());
        this._run = F.makeRun(this, watcher, action, [mover]);
        this._run.cell = { x: character.x, y: character.y };
        this._run.overwatch = true;
        act.back = act.stage;
        act.stage = "reactAim";
        act.stepped = false;
        // The shot is taken and the watch spent: the walk that drew it is not undone.
        act.locked = true;
        F.heldItem(own, "aim", character);
        if (F.feed()) ReactorEvents.emit("fightAim", { unitId: watcher.id, kind: "skill", itemId: action.item().id, targetIds: this._run.targetIds, cell: this._run.cell, ranged: true, overwatch: true });
        this.touch();
        return true;
    };

    Game_Fight.prototype.updateReaction = function() {
        const act = this._act, run = this._run;
        const watcher = run ? this.unit(run.subjectId) : null;
        if (act.stage === "reactAim" && run) {
            if (F.feed()) ReactorEvents.emit("fightFire", { unitId: watcher.id, kind: run.kind, itemId: run.itemId, targetIds: run.targetIds, cell: run.cell, overwatch: true });
            act.stage = "react";
            return;
        }
        if (run && this.updateRun()) return;
        if (run) {
            this.endStage(run, false);
            F.heldItem(this.character(watcher), "aim", null);
            const battler = this.battler(watcher);
            if (battler && battler.isAlive()) battler.onAllActionsEnd();
            if (F.feed()) ReactorEvents.emit("fightActionEnd", { unitId: watcher.id, overwatch: true });
        }
        this._run = null;
        // The unit that was walking goes on, if it still stands.
        act.stage = act.back === "walk" ? "walk" : "done";
        this.touch();
        this.checkOutcome();
    };

    /** At the end of its turn a unit faces the nearest unit of the other side. */
    Game_Fight.prototype.faceNearest = function(unit) {
        const character = this.character(unit);
        if (!character) return;
        let best = null, bestDistance = Infinity;
        for (const other of this._units) {
            if (other.gone || other.team === unit.team || other.team === "neutral" || !this.isAlive(other)) continue;
            const c = this.character(other), d = F.stepsTo(other, c.x, c.y, character.x, character.y);
            if (d < bestDistance) { bestDistance = d; best = F.nearestCell(other, c.x, c.y, character.x, character.y); best = { x: best.x, y: best.y }; }
        }
        if (!best) return;
        const dx = best.x - character.x, dy = best.y - character.y;
        if (dx || dy) character.setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8));
    };

    //-------------------------------------------------------------------------
    // Floods and the lists made from them.

    /** A number that changes when any unit moves, falls or joins, or a long body turns where it stands (it lies on other cells). */
    Game_Fight.prototype.positionsHash = function() {
        let hash = this._serial | 0;
        for (const unit of this._units) {
            if (unit.gone) continue;
            const character = this.character(unit);
            if (!character) continue;
            hash = (Math.imul(hash, 31) + character.x * 131 + character.y * 17 + unit.id + (this.isAlive(unit) ? 7 : 0) + (unit.team === "enemy" ? 3 : 0)
                + (Number.isFinite(character._reactorGround) ? Math.round(character._reactorGround * 4) * 257 : 0)
                + (anyTurner && turners.has(character) ? character.direction() * 8191 : 0)) | 0;
        }
        return hash + (this._costs ? this._costs.rev : 0);
    };

    /**
     * The grid's buffers hold this unit's flood for that budget (cached until a unit moves). With a `deadline` (a
     * clock time) a long flood is taken a slice at a time: false comes back while it is unfinished, and the same
     * call on a later frame goes on with it. Without one the flood is whole when this returns.
     */
    Game_Fight.prototype.ensureFlood = function(unit, budget, deadline) {
        const hash = this.positionsHash();
        const sliced = deadline !== undefined && deadline !== null;
        const mine = cache.floodUnit === unit.id && cache.floodBudget === budget && cache.serial === this._serial;
        const same = mine && cache.floodHash === hash;
        if (same && !cache.floodOpen) return true;
        // A sliced flood under way goes on though others have moved since it began (in an army someone always has):
        // it is the field as it stood a few frames ago, and whoever asked for it checks where it ends against the
        // field as it stands (AI.approach). Asked for whole, or by anyone else, it starts over.
        if (!(sliced && mine && cache.floodOpen)) {
            cache.floodUnit = unit.id; cache.floodBudget = budget; cache.floodHash = hash; cache.serial = this._serial;
            cache.floodOpen = G.floodStart(this, unit, budget);
            if (!cache.floodOpen) return true;
        }
        cache.floodOpen = !G.floodRun(this, sliced ? deadline : Infinity);
        return !cache.floodOpen;
    };

    Game_Fight.prototype.playerStage = function(stage) {
        const act = this._act;
        return this.isTactical() && this.isHere() && !!act && this._phase === "act" && act.stage === stage && !!act.player;
    };

    Game_Fight.prototype.moveCells = function() {
        if (!this.playerStage("move")) return EMPTY;
        const act = this._act, unit = this.unit(act.unitId), character = this.character(unit);
        if (!character) return EMPTY;
        const hash = this.positionsHash();
        if (cache.moveUnit === unit.id && cache.moveBudget === act.steps && cache.moveHash === hash) return cache.move;
        this.ensureFlood(unit, act.steps);
        const cells = [];
        const reach = Math.ceil(act.steps);
        for (let y = character.y - reach; y <= character.y + reach; y++) {
            for (let x = character.x - reach; x <= character.x + reach; x++) {
                // Every level of the cell the unit can stop on: the ground under an eave and the eave are two cells here.
                const levels = G.reachedAt(x, y, reachedOut);
                for (let i = 0; i < levels; i++) {
                    const h = reachedOut[i * 2], cost = reachedOut[i * 2 + 1];
                    if (cost <= act.steps && G.canStopAt(x, y, h)) cells.push({ x, y, cost, h });
                }
            }
        }
        cache.moveUnit = unit.id; cache.moveBudget = act.steps; cache.moveHash = hash; cache.move = cells;
        return cells;
    };

    /** The pending action as a Game_Action (one kept while it is aimed). */
    Game_Fight.prototype.pendingAction = function() {
        const act = this._act;
        if (!act || !act.item || !act.unitId) return null;
        const key = this._serial + ":" + act.unitId + ":" + act.item.kind + ":" + act.item.id + (act.item.via ? ":" + act.item.via : "");
        if (cache.actionKey !== key || !cache.action) {
            const battler = this.actingBattler(this.unit(act.unitId), act.item.via);
            if (!battler) return null;
            const action = new Game_Action(battler);
            if (act.item.kind === "skill") action.setSkill(act.item.id); else action.setItem(act.item.id);
            cache.action = action; cache.actionKey = key;
        }
        return cache.action;
    };

    Game_Fight.prototype.pendingItem = function() {
        const action = this.isTactical() ? this.pendingAction() : null;
        return action ? action.item() : null;
    };

    Game_Fight.prototype.rangeCells = function() {
        if (!this.playerStage("target")) return EMPTY;
        const act = this._act, unit = this.unit(act.unitId), character = this.character(unit), action = this.pendingAction();
        if (!character || !action) return EMPTY;
        const key = cache.actionKey + ":" + character.x + "," + character.y + "," + G.heightOf(character) + ":" + this.positionsHash();
        if (cache.rangeKey === key) return cache.range;
        cache.range = this.reachCells(unit, action, character.x, character.y, G.heightOf(character));
        cache.rangeKey = key;
        return cache.range;
    };

    /** The unit covering a cell (a big unit covers its whole footprint). */
    Game_Fight.prototype.unitAt = function(x, y, except, h) {
        let found = null, gap = Infinity;
        for (const unit of this._units) {
            if (unit === except || unit.gone) continue;
            const character = this.character(unit);
            if (!character || !(unit.team === "neutral" || this.isAlive(unit))) continue;
            if (!(character.x === x && character.y === y) && !F.covers(unit, character.x, character.y, x, y)) continue;
            // Two may share a cell at different levels (one under the eave, one on it): `h` says which is meant.
            if (!Number.isFinite(h)) return unit;
            const off = Math.abs(G.heightOf(character) - h);
            if (off < gap) { gap = off; found = unit; }
        }
        return found;
    };

    /**
     * The cells an action by `unit`, standing at (ux, uy), can be aimed at: inside its range (counted from the
     * nearest cell of its own body), seen, and not a wall.
     */
    Game_Fight.prototype.reachCells = function(unit, action, ux, uy, height) {
        const tactics = F.tactics(action.subject(), action.item()), shape = tactics.area.shape;
        if (shape === "self" || shape === "all") return [{ x: ux, y: uy }];
        const cells = [];
        const f = F.footprint(unit), x0 = ux + f.ox, y0 = uy + f.oy, x1 = x0 + f.w - 1, y1 = y0 + f.h - 1;
        const deep = G.is3D(), far = tactics.max + (deep && tactics.max >= 2 ? F.HEIGHT_REACH_MAX : 0);
        for (let y = y0 - far; y <= y1 + far; y++) {
            for (let x = x0 - far; x <= x1 + far; x++) {
                const fx = clamp(x, x0, x1), fy = clamp(y, y0, y1);
                const distance = Math.abs(x - fx) + Math.abs(y - fy);
                if (distance < tactics.min || distance > far || !$gameMap.isValid(x, y) || G.blocksSight(x, y)) continue;
                let ground = height;
                if (deep) {
                    const there = this.unitAt(x, y);
                    ground = there ? G.heightOf(this.character(there)) : G.groundAt(x, y, height);
                    let ok = !(distance > F.reachAt(tactics, height, ground) || (distance > 0 && !F.heightInReach(tactics, height, ground)));
                    if (ok && tactics.los && distance > 1 && !G.sight(fx, fy, height, x, y, ground)) ok = false;
                    // Someone else on the same cell at another level (under the eave, on it) may be the one in reach.
                    if (!ok && there) {
                        for (const other of this._units) {
                            if (other === there || other.gone) continue;
                            const c = this.character(other);
                            if (!c || c.x !== x || c.y !== y || !(other.team === "neutral" || this.isAlive(other))) continue;
                            const at = G.heightOf(c);
                            if (distance > F.reachAt(tactics, height, at) || (distance > 0 && !F.heightInReach(tactics, height, at))) continue;
                            if (tactics.los && distance > 1 && !G.sight(fx, fy, height, x, y, at)) continue;
                            ok = true; ground = at;
                            break;
                        }
                    }
                    if (!ok) continue;
                    cells.push({ x, y, h: ground });
                    continue;
                }
                if (tactics.los && distance > 1 && !G.sight(fx, fy, height, x, y, ground)) continue;
                cells.push({ x, y });
            }
        }
        return cells;
    };

    /** Adds the cells of every big unit in `units` to `cells` (those not already there). */
    Game_Fight.prototype.withFootprints = function(cells, units) {
        let out = cells;
        for (const unit of units) {
            if (!F.isBig(unit)) continue;
            const character = this.character(unit), f = F.footprint(unit);
            if (out === cells) out = cells.slice();
            for (let y = character.y + f.oy; y < character.y + f.oy + f.h; y++) {
                for (let x = character.x + f.ox; x < character.x + f.ox + f.w; x++) {
                    if ($gameMap.isValid(x, y) && !out.some(cell => cell.x === x && cell.y === y)) out.push({ x, y });
                }
            }
        }
        return out;
    };

    Game_Fight.prototype.inRange = function(x, y) {
        for (const cell of this.rangeCells()) if (cell.x === x && cell.y === y) return true;
        return false;
    };

    /** The cursor-dependent lists, made again when the revision moved. */
    Game_Fight.prototype.refreshAim = function() {
        const tac = this.tac();
        if (cache.rev === tac.rev && cache.serial === this._serial) return;
        cache.rev = tac.rev; cache.serial = this._serial;
        cache.area = EMPTY; cache.path = EMPTY; cache.targets = EMPTY;
        const act = this._act, cursor = tac.cursor;
        if (!act || !act.unitId || !cursor.on || !act.player) return;
        const unit = this.unit(act.unitId), character = this.character(unit);
        if (!character) return;
        if (act.stage === "move") {
            if (cursor.x === character.x && cursor.y === character.y) return;
            this.ensureFlood(unit, act.steps);
            if (!G.canStopAt(cursor.x, cursor.y, cursor.h) || !(G.costAt(cursor.x, cursor.y, cursor.h) <= act.steps)) return;
            const steps = G.pathTo(cursor.x, cursor.y, cursor.h);
            cache.path = [{ x: character.x, y: character.y, kind: "walk", h: G.heightOf(character) }].concat(steps.map(step => ({ x: step.x, y: step.y, kind: step.kind, h: step.height })));
            cache.pathCost = G.costAt(cursor.x, cursor.y, cursor.h);
        } else if (act.stage === "target") {
            const action = this.pendingAction();
            if (!action || !this.inRange(cursor.x, cursor.y)) return;
            const tactics = F.tactics(action.subject(), action.item());
            aimHeight = cursor.h;
            cache.targets = collectTargets(this, unit, action, tactics, character.x, character.y, cursor.x, cursor.y, []);
            aimHeight = NaN;
            cache.area = this.withFootprints(tactics.area.shape === "all"
                ? cache.targets.map(target => { const c = this.character(target); return { x: c.x, y: c.y }; })
                : G.areaCells(tactics.area.shape, tactics.area.size, character.x, character.y, cursor.x, cursor.y), cache.targets);
        }
    };

    Game_Fight.prototype.areaCells = function() {
        if (!this.playerStage("target")) return EMPTY;
        this.refreshAim();
        return cache.area;
    };

    Game_Fight.prototype.pathCells = function() {
        if (!this.playerStage("move")) return EMPTY;
        this.refreshAim();
        return cache.path;
    };

    /** What the way to the cursor costs of the unit's move (0 with no way shown). */
    Game_Fight.prototype.pathCost = function() {
        if (!this.playerStage("move")) return 0;
        this.refreshAim();
        return cache.path.length > 1 && Number.isFinite(cache.pathCost) ? cache.pathCost : 0;
    };

    Game_Fight.prototype.targetsAtCursor = function() {
        if (!this.playerStage("target")) return EMPTY;
        this.refreshAim();
        return cache.targets;
    };

    //-------------------------------------------------------------------------
    // What a HUD and a camera read.

    Game_Fight.prototype.tacticalState = function() {
        if (!this.isTactical() || !this.isHere()) return "idle";
        if (this._ending) return "ending";
        const act = this._act;
        if (!act || this._phase !== "act") {
            // Between two units that decide for themselves, and while any still walks or acts on its own, the state
            // stays "enemy": a HUD's line does not blink between them.
            const tac = this._tac, next = this._phase === "queue" ? this._queue[0] : null;
            if (next && next.kind === "unit" && !this.isPlayerUnit(this.unit(next.unitId))) return "enemy";
            return tac && ((tac.movers && tac.movers.length) || (tac.aside && tac.aside.length) || (tac.runs && tac.runs.length)) ? "enemy" : "idle";
        }
        if (act.stage === "pick") return "unit";
        return act.player ? STATES[act.stage] || "idle" : "enemy";
    };

    Game_Fight.prototype.tacticalRevision = function() {
        return this._tac ? this._tac.rev : 0;
    };

    /** The unit whose turn is shown: at the normal pace a unit still deciding ("plan", "hold") is not shown yet. */
    Game_Fight.prototype.activeUnit = function() {
        const act = this.isTactical() ? this._act : null;
        return act && act.unitId && act.stage !== "plan" && act.stage !== "hold" ? this.unit(act.unitId) : null;
    };

    /**
     * The side that is moving while the state is "enemy": "enemy" for the other side, "ally" for the player's own
     * units acting by themselves (allies that fight alone, a turn handed to Auto), "" when nobody is.
     */
    Game_Fight.prototype.actingTeam = function() {
        if (!this.isTactical()) return "";
        const act = this._act, unit = act && act.unitId ? this.unit(act.unitId) : null;
        if (unit) return unit.team;
        const tac = this._tac, next = this._queue[0];
        if (next && next.kind === "unit" && this.unit(next.unitId)) return this.unit(next.unitId).team;
        const walker = tac && ((tac.aside && tac.aside[0]) || (tac.movers && tac.movers[0]));
        const walking = walker ? this.unit(walker.unitId) : null;
        return walking ? walking.team : this._turns === "team" && tac ? tac.team : "";
    };

    Game_Fight.prototype.awaitsPlayer = function() {
        const act = this._act;
        return this.isTactical() && this.isHere() && !this._ending && this._phase === "act" && !!act && !!act.player
            && PLAYER_STAGES.includes(act.stage) && !this.isBusy() && !F.isHeld();
    };

    Game_Fight.prototype.cursor = function() {
        const cursor = this._tac && this.isTactical() ? this._tac.cursor : null;
        return cursor && cursor.on ? cursor : null;
    };

    Game_Fight.prototype.setCursor = function(x, y, h) {
        x = Math.floor(x); y = Math.floor(y);
        if (!this.isTactical() || !$gameMap.isValid(x, y)) return false;
        const cursor = this.tac().cursor;
        const level = Number.isFinite(h) ? h : this.cursorLevel(x, y, cursor.on && Number.isFinite(cursor.h) ? cursor.h : undefined);
        if (cursor.on && cursor.x === x && cursor.y === y && (!Number.isFinite(cursor.h) ? !Number.isFinite(level) : Math.abs(cursor.h - level) < 0.01)) return true;
        cursor.x = x; cursor.y = y; cursor.h = level; cursor.on = true;
        this.touch();
        return true;
    };

    /**
     * The level the cursor takes on a cell when nobody names one: a unit standing there (the one nearest `near`),
     * else, while a move is chosen, the level the unit can stop on nearest `near`, else the ground nearest it.
     * `near` is the level the cursor was on (the acting unit's without one). 0 on a 2D map.
     */
    Game_Fight.prototype.cursorLevel = function(x, y, near) {
        if (!G.is3D()) return 0;
        const act = this._act, own = act && act.unitId ? this.character(this.unit(act.unitId)) : null;
        const from = Number.isFinite(near) ? near : G.heightOf(own || $gamePlayer);
        const there = this.unitAt(x, y, null, from);
        if (there) return G.heightOf(this.character(there));
        if (own && this.playerStage("move")) {
            this.ensureFlood(this.unit(act.unitId), act.steps);
            let best = NaN, gap = Infinity;
            const levels = G.reachedAt(x, y, reachedOut);
            for (let i = 0; i < levels; i++) {
                const level = reachedOut[i * 2], off = Math.abs(level - from);
                if (reachedOut[i * 2 + 1] <= act.steps && off < gap) { gap = off; best = level; }
            }
            if (Number.isFinite(best)) return best;
        }
        return G.groundAt(x, y, from);
    };

    /**
     * The cursor to the next level of its cell (a cell with more than one place to stand: the Control key).
     * While a move is chosen, the levels the unit can stop on; otherwise where anyone stands and the cell's own.
     */
    Game_Fight.prototype.cycleCursorLevel = function(step) {
        const cursor = this.cursor();
        if (!cursor || !G.is3D()) return false;
        const heights = [];
        const add = h => { if (Number.isFinite(h) && !heights.some(known => Math.abs(known - h) < G.LEVEL_GAP)) heights.push(h); };
        const act = this._act;
        if (act && act.unitId && this.playerStage("move")) {
            this.ensureFlood(this.unit(act.unitId), act.steps);
            const levels = G.reachedAt(cursor.x, cursor.y, reachedOut);
            for (let i = 0; i < levels; i++) if (reachedOut[i * 2 + 1] <= act.steps) add(reachedOut[i * 2]);
        }
        for (const unit of this._units) {
            const c = unit.gone ? null : this.character(unit);
            if (c && c.x === cursor.x && c.y === cursor.y && (unit.team === "neutral" || this.isAlive(unit))) add(G.heightOf(c));
        }
        if (heights.length < 2) for (const h of G.levelHeights(cursor.x, cursor.y)) add(h);
        if (heights.length < 2) return false;
        heights.sort((a, b) => a - b);
        let at = 0, gap = Infinity;
        for (let i = 0; i < heights.length; i++) { const off = Math.abs(heights[i] - (Number.isFinite(cursor.h) ? cursor.h : 0)); if (off < gap) { gap = off; at = i; } }
        const next = heights[((at + (step || 1)) % heights.length + heights.length) % heights.length];
        return this.setCursor(cursor.x, cursor.y, next);
    };

    /** Where the view should look: the camera eases there. */
    Game_Fight.prototype.focusOn = function(x, y) {
        const tac = this.tac();
        if (!tac.focus) tac.focus = { x, y };
        tac.focus.x = x; tac.focus.y = y;
    };

    Game_Fight.prototype.focusedUnit = function() {
        const cursor = this.cursor();
        return cursor ? this.unitAt(cursor.x, cursor.y, null, cursor.h) : null;
    };

    Game_Fight.prototype.currentTeam = function() {
        return this.isTactical() && this._turns === "team" ? this.tac().team : "any";
    };

    Game_Fight.prototype.turnOrder = function() {
        if (!this.isTactical()) return EMPTY;
        const tac = this.tac();
        if (cache.orderRev === tac.rev && cache.serial === this._serial) return cache.order;
        const act = this._act;
        const row = id => {
            const unit = this.unit(id);
            return { unitId: id, team: unit ? unit.team : "", active: !!act && act.unitId === id && act.stage !== "plan" && act.stage !== "hold", acted: !!tac.acted[id],
                watch: !!tac.watch[id], defeated: !unit || unit.gone || !this.isAlive(unit) };
        };
        const ids = tac.order.slice();
        // A unit that joined after the round began acts from the next one.
        for (const unit of this._units) if (!unit.gone && unit.team !== "neutral" && !ids.includes(unit.id)) ids.push(unit.id);
        let rows = ids.map(row);
        if (this._turns === "team") {
            const mine = rows.filter(entry => entry.team === tac.team), others = rows.filter(entry => entry.team !== tac.team);
            rows = mine.filter(entry => !entry.acted).concat(mine.filter(entry => entry.acted), others);
        }
        cache.order = rows; cache.orderRev = tac.rev; cache.serial = this._serial;
        return rows;
    };

    Game_Fight.prototype.unitInfo = function(unit) {
        if (!unit) return null;
        const tac = this.tac();
        let info = cache.infos.get(unit.id);
        if (info && info.serial === this._serial && info.rev === tac.rev) return info;
        if (!info) { info = {}; cache.infos.set(unit.id, info); }
        const battler = this.battler(unit), character = this.character(unit), act = this._act;
        const actor = battler && battler.isActor();
        info.serial = this._serial; info.rev = tac.rev;
        info.id = unit.id;
        info.name = battler ? battler.name() : "";
        info.team = unit.team;
        info.battler = battler;
        info.level = actor ? battler.level : 0;
        info.faceName = actor ? battler.faceName() : "";
        info.faceIndex = actor ? battler.faceIndex() : 0;
        info.characterName = character ? character.characterName() : "";
        info.characterIndex = character ? character.characterIndex() : 0;
        info.model = character && G.is3D() && Reactor3D.characterModelSpec ? Reactor3D.characterModelSpec(character) || null : null;
        info.x = character ? character.x : 0;
        info.y = character ? character.y : 0;
        info.move = F.moveOf(unit);
        info.jump = F.jumpOf(unit);
        // What it rides, where that has a battler of its own: its name and its life are the panel's to show.
        info.vehicle = F.mountBattler ? F.mountBattler(unit) || null : null;
        info.acted = !!tac.acted[unit.id];
        info.overwatch = !!tac.watch[unit.id];
        info.moved = !!act && act.unitId === unit.id && !!act.moved;
        return info;
    };

    // A goal changed while the battle runs (Set Battle Objective) is announced on the banner.
    const setGoal = Game_Fight.prototype.setObjective;
    Game_Fight.prototype.setObjective = function(objective) {
        const before = this._active && this._tac ? this.goalText() : "";
        setGoal.call(this, objective);
        if (!before || !this._active || !this._tac || this._ending) return;
        const now = this.goalText();
        if (now && now !== before) this.announce(F.term("goalChanged").replace("%1", now));
    };

    //-------------------------------------------------------------------------
    // The names of the keys and buttons in force, for the hint line and the
    // battle menu's Controls page: the key (or gamepad button) the game's
    // mapping gives one of the battle's actions now, for the device used last.
    // The names and the device are the game's (ReactorControls, in
    // reactor_controls.js), taken as this file loads.

    const Controls = F.Controls = { device: "keys" };
    const keyNames = root.ReactorControls && root.ReactorControls.labelFor ? root.ReactorControls : null;
    if (keyNames) {
        Controls.device = keyNames.device();
        // The device changed: what a HUD shows of the controls is drawn again.
        keyNames.onDevice(device => {
            Controls.device = device;
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            if (fight && fight._tac) fight.touch();
        });
    }

    /** A key or the mouse was used ("keys"), or a gamepad ("pad"): the names shown follow. */
    Controls.used = function(device) {
        if (keyNames) keyNames.noteDevice(device);
    };

    /** A key as a player knows it; "" for one with no name. */
    Controls.keyName = function(code) {
        return keyNames ? keyNames.keyName(code) : "";
    };

    /** The name of the key (for a pad: the button) that gives an Input symbol; "" when none does. */
    Controls.label = function(symbol, device) {
        return keyNames ? keyNames.labelFor(symbol, device || Controls.device) : "";
    };

    /** The name of the control for one of the battle's actions: "ok", "cancel", "left", "right", or a name of F.KEYS / "skip". */
    Controls.name = function(action, device) {
        return Controls.label(F.KEYS[action] || action === "skip" ? F.key(action) : action, device);
    };

    //-------------------------------------------------------------------------
    // The hint line's tips: what the player can do now, one short line at a
    // time, with the names of the keys in force. A tip is shown the first
    // F.Hints.TIMES times it applies and then gives way to the HUD's plain
    // stage line; a player who lingers is shown the next one. A showing is
    // counted (with the save) once the tip has stood on the line for
    // F.Hints.READ frames, the frames of a stage left and come back to added
    // up: a stage passed through at once spends nothing. The player turns
    // the tips off in the battle menu's Options (turned on again, the
    // teaching starts over), a project with System.json
    // `reactorBattle.hints: false`.

    const Hints = F.Hints = { TIMES: 3, FRAMES: 300, READ: 90 };
    // Each tip: the state it belongs to (tacticalState), the controls its %1 and %2 name, the mouse's way of doing
    // the same (`click`: a term the first name is put into), and when it applies.
    Hints.LIST = [
        { key: "tipPick", state: "unit", keys: ["ok"], click: "orClick" },
        { key: "tipNext", state: "unit", keys: ["skip"], when: fight => fight.pendingUnits().length > 1 },
        { key: "tipMenu", state: "unit", keys: ["cancel"], click: "orRightClick" },
        { key: "tipTurn", state: "unit", keys: ["viewLeft", "viewRight"], when: () => View.active() },
        { key: "tipZoom", state: "unit", keys: [], when: () => View.active() && Controls.device !== "pad" },
        { key: "tipAuto", state: "unit", keys: [], when: fight => fight.canAuto() },
        { key: "tipMove", state: "move", keys: ["ok"], click: "orClick" },
        { key: "tipStay", state: "move", keys: ["ok"] },
        // Where to stand is chosen here: what every enemy reaches is worth seeing before it. Once it is shown the
        // tip has nothing left to offer.
        { key: "tipThreat", state: "move", keys: ["threat"], when: fight => !fight.showsThreat() },
        { key: "tipBack", state: "move", keys: ["cancel"], click: "orRightClick", when: fight => fight._turns === "team" },
        { key: "tipNext", state: "move", keys: ["skip"], when: fight => fight._turns === "team" && fight.pendingUnits().length > 0 },
        { key: "tipUnit", state: "move", keys: ["unit"] },
        { key: "tipFace", state: "command", keys: ["left", "right"] },
        { key: "tipUndo", state: "command", keys: ["cancel"], click: "orRightClick", when: fight => fight.canUndoMove() },
        { key: "tipWait", state: "command", keys: [] },
        { key: "tipTarget", state: "target", keys: ["ok"], click: "orClick" },
        { key: "tipNextTarget", state: "target", keys: ["skip"] },
        { key: "tipBack", state: "target", keys: ["cancel"], click: "orRightClick" },
        // At "skip" the other side is hurried already: the key adds nothing there.
        { key: "tipHurry", state: "enemy", keys: ["skip"], when: () => F.pace() !== "skip" },
        // Shown the moment the cursor is on a tile with more than one place to stand, whatever the stage.
        { key: "tipLevel", state: "", keys: ["level"] }
    ];

    Hints.enabled = function() {
        if (F.systemSettings().hints === false) return false;
        return !(typeof ConfigManager !== "undefined" && ConfigManager && ConfigManager.rrFightHints === false);
    };

    /** How often each tip has been shown (by `idOf`), kept with the save. */
    Hints.seen = function() {
        const o = F.overrides();
        if (!o.hints || typeof o.hints !== "object") o.hints = {};
        return o.hints;
    };

    /** What a tip's showings are counted under: its words and its stage (the same words teach a key at two stages, each with its own times). */
    Hints.idOf = function(tip) {
        return tip.id || (tip.id = tip.state ? tip.key + "@" + tip.state : tip.key);
    };

    /** The teaching starts over: every tip is due its times again. */
    Hints.reset = function() {
        F.overrides().hints = {};
        Hints.shown = null;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null, hint = fight && fight._tac ? fight._tac.hint : null;
        if (hint) { hint.read = {}; hint.state = ""; hint.on = false; }
    };

    /** A tip as the line shows it now, or "" when one of its controls has no key or button. */
    Hints.textOf = function(tip) {
        let text = F.term(tip.key), first = "";
        for (let i = 0; i < tip.keys.length; i++) {
            let name = Controls.name(tip.keys[i]);
            if (!name) return "";
            if (i === 0) first = name;
            // Two names that begin with the same word say it once: "D-pad Left Right".
            else if (first.indexOf(" ") > 0 && name.startsWith(first.slice(0, first.indexOf(" ") + 1))) name = name.slice(first.indexOf(" ") + 1);
            if (i === 0 && tip.click && Controls.device !== "pad") name = F.term(tip.click).replace("%1", name);
            text = text.replace("%" + (i + 1), name);
        }
        return text;
    };

    /** The next tip for the state the battle is in: the one shown least so far, never the one just shown; none when all have had their times. */
    Hints.choose = function(fight, hint) {
        let best = null, least = Hints.TIMES;
        if (Hints.enabled() && fight.isHere() && !fight._ending) {
            const seen = Hints.seen();
            for (const tip of Hints.LIST) {
                if (tip.state !== hint.state || tip === Hints.shown) continue;
                const count = seen[Hints.idOf(tip)] || 0;
                if (count >= least || (tip.when && !tip.when(fight)) || !Hints.textOf(tip)) continue;
                best = tip; least = count;
            }
        }
        Hints.show(fight, hint, best);
    };

    /** A tip goes on the line (or none: the plain stage line). Being put there counts for nothing: `update` counts it once it has been read. */
    Hints.show = function(fight, hint, tip) {
        hint.frames = 0;
        hint.counted = false;
        if (Hints.shown === tip && hint.on === !!tip) return;
        Hints.shown = tip || null;
        hint.on = !!tip;
        fight.touch();
    };

    /**
     * Whether the HUD's line says something else than the tip now: why the highlighted command cannot be chosen, or
     * why the cell aimed at cannot be struck. A tip nobody can see is not being read.
     */
    Hints.covered = function(fight, hint, state) {
        if (state === "command") {
            const scene = typeof SceneManager !== "undefined" && SceneManager ? SceneManager._scene : null, win = scene ? scene._fightCommandWindow : null;
            const index = win && win.active && win.index ? win.index() : -1;
            return index >= 0 && index < win.maxItems() && !win.isCommandEnabled(index);
        }
        if (state !== "target") return false;
        // Asked again only when the battle changed (the cursor moved).
        const tac = fight._tac, cursor = tac.cursor;
        if (hint.aimRev !== tac.rev) {
            hint.aimRev = tac.rev;
            hint.aimOff = !cursor.on || !fight.inRange(cursor.x, cursor.y) || fight.targetsAtCursor().length === 0;
        }
        return hint.aimOff;
    };

    /**
     * Once a frame: a new state brings its next tip, a state the player stays in brings another every
     * F.Hints.FRAMES, and the tip on the line is counted as shown when it has stood there F.Hints.READ frames in
     * all (once a showing: `hint.read` keeps the frames of a tip not yet counted, by `idOf`).
     */
    Hints.update = function(fight) {
        const tac = fight._tac;
        if (!tac) return;
        const hint = tac.hint || (tac.hint = { state: "", frames: 0, on: false, cell: -1, counted: false, read: {}, rev: -1 });
        if (Hints.serial !== fight._serial) { Hints.serial = fight._serial; Hints.shown = null; hint.state = ""; }
        const state = fight.tacticalState();
        if (state !== hint.state) {
            hint.state = state;
            Hints.choose(fight, hint);
            return;
        }
        const cursor = tac.cursor, cell = cursor.on ? cursor.x + cursor.y * 4096 : -1;
        if (cell !== hint.cell) {
            hint.cell = cell;
            const level = Hints.LIST[Hints.LIST.length - 1];
            if (cell >= 0 && Hints.shown !== level && fight.awaitsPlayer() && G.is3D() && Hints.enabled() && (Hints.seen()[Hints.idOf(level)] || 0) < Hints.TIMES
                && G.levelHeights(cursor.x, cursor.y).length > 1 && Hints.textOf(level)) { Hints.show(fight, hint, level); return; }
        }
        if (!hint.on) return;
        const tip = Hints.shown;
        // No tip in hand, or one of another stage (a save loaded in the middle of a battle): the stage's own.
        if (!tip || (tip.state && tip.state !== state)) { Hints.choose(fight, hint); return; }
        // A tip that stopped applying (the reach it offers to show is shown) gives way to the next: asked again
        // only when the battle changed.
        if (hint.rev !== tac.rev) {
            hint.rev = tac.rev;
            if (tip.when && !tip.when(fight)) { Hints.choose(fight, hint); return; }
        }
        // Under a reason the tip is not on the line: it is neither read nor does its time there run.
        if (Hints.covered(fight, hint, state)) return;
        if (!hint.counted) {
            const id = Hints.idOf(tip), read = hint.read || (hint.read = {});
            read[id] = (read[id] || 0) + 1;
            if (read[id] >= Hints.READ) {
                read[id] = 0;
                hint.counted = true;
                const seen = Hints.seen();
                seen[id] = (seen[id] || 0) + 1;
            }
        }
        if (++hint.frames >= Hints.FRAMES) Hints.choose(fight, hint);
    };

    /** The tip for the HUD's hint line now, or "" (the HUD then writes the stage's plain line). */
    Game_Fight.prototype.hintText = function() {
        const hint = this._tac && this._tac.hint;
        return hint && hint.on && Hints.shown && this.isTactical() && this.isHere() && !this._ending ? Hints.textOf(Hints.shown) : "";
    };

    /** The blow `run`'s action lands on `target` (the base applies it): its side, cover and height. */
    Game_Fight.prototype.strikeFor = function(run, action, target) {
        if (!this.isTactical()) return null;
        const subject = this.unit(run.subjectId), character = this.character(subject);
        if (!subject || !character) return null;
        const blow = setStrike(this, action, F.tactics(action.subject(), action.item()), subject.team, character.x, character.y, G.heightOf(character), target);
        if (run.overwatch) blow.hitRate *= F.OVERWATCH_HIT;
        return blow;
    };

    /** After hits land (the base calls this): a fallen party member brought back stands again, and the HUD redraws. */
    Game_Fight.prototype.afterHit = function(run, targets) {
        if (!this._tac) return;
        for (const target of targets) {
            const battler = this.battler(target), character = this.character(target);
            if (target.defeated && battler && battler.isAlive() && character) {
                if (target.vehicle) { target.defeated = false; if (typeof this.mendVehicle === "function") this.mendVehicle(target); }
                else this.raise(target);
            }
        }
        this.touch();
    };

    Game_Fight.prototype.preview = function(target) {
        const act = this._act, action = this.isTactical() ? this.pendingAction() : null;
        if (!action || !target) return null;
        const unit = this.unit(act.unitId), character = this.character(unit), battler = this.battler(target);
        if (!character || !battler) return null;
        F._strike = setStrike(this, action, F.tactics(action.subject(), action.item()), unit.team, character.x, character.y, G.heightOf(character), target);
        try {
            estimateAction(action, battler);
        } finally {
            F._strike = null;
        }
        previewOut.hit = estimate.hit; previewOut.critical = estimate.critical;
        previewOut.damageMin = estimate.min; previewOut.damageMax = estimate.max;
        previewOut.heals = estimate.heals;
        previewOut.defeats = !estimate.heals && estimate.hp && estimate.min > 0 && estimate.min >= battler.hp;
        previewOut.cover = strike.cover; previewOut.flank = strike.flank; previewOut.height = strike.height;
        return previewOut;
    };

    //-------------------------------------------------------------------------
    // The player's commands. Each returns false when it does not apply.

    Game_Fight.prototype.canUndoMove = function() {
        const act = this._act;
        return this.playerStage("command") && !!act.moved && !act.locked;
    };

    Game_Fight.prototype.commandSelectUnit = function(unitId) {
        if (!this.playerStage("pick") || !this.awaitsPlayer()) return false;
        const unit = this.pendingUnits().find(u => u.id === unitId);
        if (!unit) return false;
        const index = this._queue.findIndex(entry => entry.kind === "unit" && entry.unitId === unitId);
        this._queue.splice(index, 1);
        this.beginUnit(unit);
        F.Input.used();
        return true;
    };

    Game_Fight.prototype.commandMoveTo = function(x, y, h) {
        if (!this.playerStage("move") || !this.awaitsPlayer()) return false;
        const act = this._act, unit = this.unit(act.unitId), character = this.character(unit);
        // Without a level the cursor's is meant when it is on that cell, else the cheapest the unit can stop on.
        if (!Number.isFinite(h)) {
            const cursor = this.cursor();
            h = cursor && cursor.x === x && cursor.y === y && Number.isFinite(cursor.h) ? cursor.h : undefined;
        }
        if (x === character.x && y === character.y && (!Number.isFinite(h) || !G.is3D() || Math.abs(h - G.heightOf(character)) < G.LEVEL_GAP)) {
            act.stage = "command";
            F.Input.used();
            this.touch();
            return true;
        }
        this.ensureFlood(unit, act.steps);
        if (!Number.isFinite(h) && !G.canStopAt(x, y)) {
            // The cheapest level is taken (a friend, say): any other the unit can stop on will do.
            const levels = G.reachedAt(x, y, reachedOut);
            for (let i = 0; i < levels; i++) if (reachedOut[i * 2 + 1] <= act.steps && G.canStopAt(x, y, reachedOut[i * 2])) { h = reachedOut[i * 2]; break; }
        }
        if (!G.canStopAt(x, y, h) || !(G.costAt(x, y, h) <= act.steps)) return false;
        this.startWalk(unit, character, G.pathTo(x, y, h));
        F.Input.used();
        return true;
    };

    Game_Fight.prototype.commandUndoMove = function() {
        if (!this.canUndoMove() || !this.awaitsPlayer()) return false;
        const act = this._act, unit = this.unit(act.unitId), character = this.character(unit), origin = act.origin;
        // Not Game_Player.locate: that gathers the followers onto the leader.
        Game_CharacterBase.prototype.locate.call(character, origin.x, origin.y);
        character.setDirection(origin.d);
        if (G.is3D()) character._reactorGround = origin.height;
        this._inside[String(unit.id)] = [origin.x, origin.y];
        act.moved = false;
        act.stage = "move";
        this.setCursor(origin.x, origin.y, G.is3D() ? origin.height : undefined);
        this.focusOn(origin.x, origin.y);
        F.Input.used();
        this.touch();
        return true;
    };

    /** Aim a skill or an item: the range shows and the cursor goes to the nearest target it has. */
    Game_Fight.prototype.aim = function(kind, id, via) {
        const act = this._act, unit = this.unit(act.unitId), battler = this.actingBattler(unit, via), character = this.character(unit);
        const item = kind === "skill" ? $dataSkills[id] : $dataItems[id];
        if (!item || !battler.canUse(item)) return false;
        act.back = act.stage;
        act.item = via ? { kind, id, via } : { kind, id };
        act.stage = "target";
        this.touch();
        const action = this.pendingAction(), tactics = F.tactics(battler, item);
        let best = null, bestDistance = Infinity;
        for (const cell of this.rangeCells()) {
            if (!collectTargets(this, unit, action, tactics, character.x, character.y, cell.x, cell.y, scratchTargets).length) continue;
            const distance = F.stepsTo(unit, character.x, character.y, cell.x, cell.y);
            if (distance < bestDistance) { best = cell; bestDistance = distance; }
        }
        this.setCursor(best ? best.x : character.x, best ? best.y : character.y, best ? best.h : G.heightOf(character));
        this.focusOn(this.tac().cursor.x, this.tac().cursor.y);
        F.Input.used();
        this.touch();
        return true;
    };

    Game_Fight.prototype.commandAttack = function() {
        if (!this.playerStage("command") || !this.awaitsPlayer()) return false;
        const unit = this.unit(this._act.unitId);
        // One who rides a vehicle that can attack chooses whose attack it is to be: the two are listed.
        if (typeof this.vehicleAttacker === "function" && this.vehicleAttacker(unit)) { this._act.pick = "attack"; return this.openList("skill"); }
        return this.aim("skill", this.battler(unit).attackSkillId());
    };

    /** `via` "vehicle": the skill is the vehicle's the unit rides, used with its strength and paid from its MP and TP. */
    Game_Fight.prototype.commandSkill = function(skillId, via) {
        if (!(this.playerStage("command") || this.playerStage("skill")) || !this.awaitsPlayer()) return false;
        via = via === "vehicle" ? via : undefined;
        const battler = this.actingBattler(this.unit(this._act.unitId), via);
        if (skillId !== battler.attackSkillId() && !battler.skills().includes($dataSkills[skillId])) return false;
        return this.aim("skill", skillId, via);
    };

    Game_Fight.prototype.commandItem = function(itemId) {
        if (!(this.playerStage("command") || this.playerStage("item")) || !this.awaitsPlayer()) return false;
        if (!$gameParty.hasItem($dataItems[itemId])) return false;
        return this.aim("item", itemId);
    };

    /** Open the skill or the item list (a HUD with its own lists does not need them). */
    Game_Fight.prototype.commandOpenSkills = function() { if (this._act) delete this._act.pick; return this.openList("skill"); };
    Game_Fight.prototype.commandOpenItems = function() { return this.openList("item"); };
    Game_Fight.prototype.openList = function(stage) {
        if (!this.playerStage("command") || !this.awaitsPlayer()) return false;
        this._act.stage = stage;
        F.Input.used();
        this.touch();
        return true;
    };

    /**
     * The units an action by `unit` (a skill or an item, `via` "vehicle" for its vehicle's) would land on, aimed at a
     * cell from where the unit stands: a new array, the party's vehicles among them. Nothing is used or begun.
     */
    Game_Fight.prototype.targetsOf = function(unit, kind, id, cx, cy, via) {
        const battler = unit ? this.actingBattler(unit, via) : null, character = this.character(unit);
        if (!battler || !character) return [];
        const action = new Game_Action(battler);
        if (kind === "skill") action.setSkill(id); else action.setItem(id);
        if (!action.item()) return [];
        return collectTargets(this, unit, action, F.tactics(battler, action.item()), character.x, character.y, cx, cy, []);
    };

    /**
     * A rider and its vehicle on a cell an action for one target is aimed at: `[rider's unit, vehicle's]`, else null.
     * Whose it is to be is the player's to say (`commandWhom`).
     */
    Game_Fight.prototype.targetPair = function(x, y) {
        const act = this._act, action = this.isTactical() && act && act.item ? this.pendingAction() : null;
        if (!action || typeof this.vehicleUnits !== "function") return null;
        const unit = this.unit(act.unitId), character = this.character(unit), tactics = F.tactics(action.subject(), action.item());
        if (tactics.area.shape !== "single") return null;
        const cursor = this.cursor();
        keepPair = true;
        aimHeight = cursor && cursor.x === x && cursor.y === y ? cursor.h : NaN;
        let out = null;
        try { out = collectTargets(this, unit, action, tactics, character.x, character.y, x, y, []); } finally { keepPair = false; aimHeight = NaN; }
        return out.length === 2 && out[1].vehicle ? out : null;
    };

    /** The rider ("rider") or its vehicle ("vehicle") is the one the aimed action is for: it begins. */
    Game_Fight.prototype.commandWhom = function(who) {
        const act = this._act;
        if (!this.playerStage("skill") || !this.awaitsPlayer() || act.pick !== "whom" || !act.whom || !act.item) return false;
        const at = act.whom;
        aimWho = who === "vehicle" ? "vehicle" : "rider";
        aimHeight = Number.isFinite(at.h) ? at.h : NaN;
        let began = false;
        try { began = this.beginAction(this.unit(act.unitId), act.item.kind, act.item.id, at.x, at.y, act.item.via); } finally { aimWho = ""; aimHeight = NaN; }
        if (!began) return false;
        delete act.whom; delete act.pick;
        F.Input.used();
        return true;
    };

    Game_Fight.prototype.commandTarget = function(x, y) {
        if (!this.playerStage("target") || !this.awaitsPlayer() || !this.inRange(x, y)) return false;
        const act = this._act, cursor = this.cursor();
        // Two on the cell, a rider and its vehicle: the list asks whose it is to be.
        if (this.targetPair(x, y)) {
            act.whom = { x, y, h: cursor && cursor.x === x && cursor.y === y ? cursor.h : NaN };
            act.pick = "whom";
            act.stage = "skill";
            F.Input.used();
            this.touch();
            return true;
        }
        aimHeight = cursor && cursor.x === x && cursor.y === y ? cursor.h : NaN;
        const began = this.beginAction(this.unit(act.unitId), act.item.kind, act.item.id, x, y, act.item.via);
        aimHeight = NaN;
        if (!began) return false;
        F.Input.used();
        return true;
    };

    /** A unit uses a skill or an item on a cell: it turns to it, pays for it, and the action is about to play. */
    Game_Fight.prototype.beginAction = function(unit, kind, id, cx, cy, via) {
        const battler = this.actingBattler(unit, via), character = this.character(unit), act = this._act;
        const action = new Game_Action(battler);
        if (kind === "skill") action.setSkill(id); else action.setItem(id);
        const item = action.item();
        if (!item || !battler.canUse(item)) return false;
        const tactics = F.tactics(battler, item);
        const targets = collectTargets(this, unit, action, tactics, character.x, character.y, cx, cy, []);
        // A skill or an item with no Scope lands on nobody and is used all the same: what it does is its common event.
        const aimless = !targets.length && item.scope === 0;
        if (!targets.length && !aimless) return false;
        const dx = cx - character.x, dy = cy - character.y;
        if (dx || dy) character.setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8));
        battler.useItem(item);
        this._progress = true;
        this._run = F.makeRun(this, unit, action, targets, via);
        this._run.cell = { x: cx, y: cy };
        // In a crowd, a unit that decides for itself acts at a skirmish's pace: no full sequence, no shot.
        // So does an action with nobody to play on.
        const quick = aimless || (!act.player && this.isCrowded());
        if (quick) this._run.quick = true;
        act.stage = "aim";
        act.item = via ? { kind, id, via } : { kind, id };
        act.targetId = aimless ? 0 : targets[0].id;
        // (What the vehicle does, the one who rides it does not take aim for.)
        if (!aimless && !via) F.heldItem(character, "aim", this.character(targets[0]) || null);
        if (F.feed()) ReactorEvents.emit("fightAim", { unitId: unit.id, kind, itemId: id, targetIds: this._run.targetIds, cell: this._run.cell, ranged: tactics.max >= 2, quick });
        this.touch();
        return true;
    };

    /** The unit's turn ends where it stands, facing the nearest enemy (or the way the player turned it: commandFace). */
    Game_Fight.prototype.commandWait = function() {
        if (!(this.playerStage("move") || this.playerStage("command")) || !this.awaitsPlayer()) return false;
        F.Input.used();
        if (!this._act.faced) this.faceNearest(this.unit(this._act.unitId));
        this.finishAct();
        return true;
    };

    /**
     * Turn the unit (2/4/6/8) before it waits; the direction stays when its turn ends. False when it did not turn
     * (a long body with no room for its turned self refuses).
     */
    Game_Fight.prototype.commandFace = function(direction) {
        const act = this._act;
        if (!(this.playerStage("command") || this.playerStage("move")) || !this.awaitsPlayer() || !DIRS.includes(direction)) return false;
        const character = this.character(this.unit(act.unitId));
        character.setDirection(direction);
        if (character.direction() !== direction) return false;
        act.faced = true;
        this.touch();
        return true;
    };

    /** The unit ends its turn on watch: one attack at the first enemy that steps into its reach and sight. */
    Game_Fight.prototype.commandOverwatch = function() {
        if (!(this.playerStage("move") || this.playerStage("command")) || !this.awaitsPlayer()) return false;
        const unit = this.unit(this._act.unitId);
        if (!this.armOverwatch(unit)) return false;
        F.Input.used();
        if (!this._act.faced) this.faceNearest(unit);
        this.finishAct();
        return true;
    };

    /** Team turns: the player's side is done; its units that have not acted stay where they are. */
    Game_Fight.prototype.commandEndTurn = function() {
        const act = this._act;
        if (!this.isTactical() || this._turns !== "team" || !act || !act.player || !this.awaitsPlayer()) return false;
        F.Input.used();
        const tac = this.tac();
        // Every unit of the player's still in this side's turn, wherever it stands in the order: one that fights by
        // itself between two of them keeps its turn.
        for (let i = 0; i < this._queue.length && this._queue[i].kind === "unit"; i++) {
            const unit = this.unit(this._queue[i].unitId), battler = this.battler(unit);
            if (!this.isPlayerUnit(unit)) continue;
            tac.acted[unit.id] = true;
            this._queue.splice(i--, 1);
            // Its turn has ended without orders: what wears off as a turn ends (a buff) does.
            if (battler.isAlive()) battler.onAllActionsEnd();
        }
        if (act.unitId) this.finishAct();
        else { this._act = null; this._phase = "queue"; this._wait = 8; tac.cursor.on = false; this.touch(); }
        return true;
    };

    /**
     * The rest of the player's turn plays itself: every unit not yet ordered acts by its own preset (`<ai:>`,
     * aggressive without one), as an army's turn asks. Until the round's next turn.
     */
    Game_Fight.prototype.commandAuto = function() {
        const act = this._act;
        if (!this.isTactical() || !act || !act.player || !this.awaitsPlayer() || !(act.stage === "pick" || (act.stage === "move" && !act.moved) || (act.stage === "command" && !act.moved))) return false;
        F.Input.used();
        if (act.unitId) this._queue.unshift({ kind: "unit", unitId: act.unitId });
        this.tac().autoTurn = this._turn;
        this._act = null;
        this._phase = "queue";
        this._tac.cursor.on = false;
        this.touch();
        return true;
    };

    /** Whether the battle menu offers Auto now: team turns, at "Choose a unit", with two or more units still to act. */
    Game_Fight.prototype.canAuto = function() {
        return this.playerStage("pick") && this._turns === "team" && this.pendingUnits().length >= 2;
    };

    /** One step back: out of aiming, out of a list, the move undone, the unit put down (team turns). */
    Game_Fight.prototype.commandCancel = function() {
        const act = this._act;
        if (!this.isTactical() || !act || !act.player || !this.awaitsPlayer()) return false;
        if (act.stage === "target") {
            act.stage = act.back === "skill" || act.back === "item" ? act.back : "command";
            act.item = null;
            const character = this.character(this.unit(act.unitId));
            this.setCursor(character.x, character.y, G.heightOf(character));
        } else if (act.stage === "skill" && act.pick === "whom") {
            // Back from "whose is it to be" is the aim again.
            act.stage = "target";
            delete act.pick; delete act.whom;
        } else if (act.stage === "skill" || act.stage === "item") {
            act.stage = "command";
            delete act.pick;
        } else if (act.stage === "command") {
            if (act.moved) return this.commandUndoMove();
            act.stage = "move";
        } else if (act.stage === "move" && this._turns === "team" && !act.moved) {
            this._queue.unshift({ kind: "unit", unitId: act.unitId });
            this._act = { unitId: 0, steps: 0, stage: "pick", targetId: 0, player: true };
        } else {
            return false;
        }
        F.Input.used();
        this.touch();
        return true;
    };

    /**
     * Team turns, a unit picked that has done nothing yet: it is put down and the cursor goes to the next unit
     * still to act, in the round's order (back to itself when it is the only one). Nobody's turn is spent.
     */
    Game_Fight.prototype.commandNextUnit = function() {
        const act = this._act;
        if (!this.playerStage("move") || this._turns !== "team" || act.moved || !this.awaitsPlayer()) return false;
        const id = act.unitId, order = this.tac().order, from = order.indexOf(id);
        if (!this.commandCancel()) return false;
        const pending = this.pendingUnits();
        let next = null;
        for (let i = 1; i <= order.length && !next; i++) {
            const candidate = order[(from + i) % order.length];
            for (const unit of pending) if (unit.id === candidate) { next = unit; break; }
        }
        const character = this.character(next || pending[0]);
        if (character) {
            this.setCursor(character.x, character.y, G.heightOf(character));
            this.focusOn(character.x, character.y);
        }
        return true;
    };

    /** How many of the player's units would lose their turn if the side's turn ended now (the unit whose menu is open waits, and does not count). */
    Game_Fight.prototype.unactedCount = function() {
        return this.isTactical() && this._turns === "team" ? this.pendingUnits().length : 0;
    };

    /** Whether the player may leave this battle now (a battle started with Can Escape). */
    Game_Fight.prototype.canRetreat = function() {
        return this.isTactical() && !!this._options.canEscape && !this._ending && this.awaitsPlayer();
    };

    /** The battle ends as an escape, through the battle's own end. */
    Game_Fight.prototype.commandRetreat = function() {
        if (!this.canRetreat()) return false;
        F.Input.used();
        this.end(F.ESCAPE);
        this.touch();
        return true;
    };

    /**
     * The view goes to a unit (a tile of the turn strip, a row of the battle menu's Units). While the player
     * chooses a unit or a place to move the cursor goes with it; while they aim, or the battle plays, the cursor
     * is the battle's and only the view goes.
     */
    Game_Fight.prototype.commandLookAt = function(unitId) {
        const unit = this.unit(unitId), character = unit && !unit.gone ? this.character(unit) : null;
        if (!this.isTactical() || !this.isHere() || !character) return false;
        const stage = this._act ? this._act.stage : "";
        if (this.awaitsPlayer() && (stage === "pick" || stage === "move")) this.setCursor(character.x, character.y, G.heightOf(character));
        this.focusOn(character.x, character.y);
        F.View.unblock(this, character.x, character.y, G.heightOf(character));
        return true;
    };

    /** A click on the HUD's turn strip looks at the unit of the tile clicked: the press is the strip's, not the map's under it. */
    Game_Fight.prototype.updateStripClick = function() {
        const ui = root.ReactorUI;
        if (!ui || !ui.fightStripUnit || typeof TouchInput === "undefined" || !TouchInput.isTriggered()) return;
        const unitId = ui.fightStripUnit(TouchInput.x, TouchInput.y);
        if (!unitId) return;
        F.Input.used();
        if (this.commandLookAt(unitId)) sound("playCursor");
    };

    /** Whether an action the acting unit would use from where it stands has anyone to land on. */
    Game_Fight.prototype.hasTargets = function(kind, id, via) {
        const act = this._act, unit = act && act.unitId ? this.unit(act.unitId) : null;
        const battler = this.actingBattler(unit, via), character = this.character(unit);
        if (!battler || !character) return false;
        const action = new Game_Action(battler);
        if (kind === "skill") action.setSkill(id); else action.setItem(id);
        if (!action.item()) return false;
        const tactics = F.tactics(battler, action.item());
        for (const cell of this.reachCells(unit, action, character.x, character.y, G.heightOf(character))) {
            if (collectTargets(this, unit, action, tactics, character.x, character.y, cell.x, cell.y, scratchTargets).length > 0) return true;
        }
        return false;
    };

    /**
     * Why a command of the acting unit's menu cannot be chosen, as a term key (F.TERMS), or "" when it can:
     * "whyNoReach" for an Attack with nobody in its reach from where the unit stands. Asked when the menu is
     * made and by a HUD's hint line for the highlighted row; the answer is kept until a unit moves.
     */
    Game_Fight.prototype.commandReason = function(symbol) {
        // Getting on and getting off answer for themselves (reactor_vehicles_mount.js).
        if ((symbol === "mount" || symbol === "dismount") && typeof this.mountReason === "function") return this.playerStage("command") ? this.mountReason(symbol) : "";
        if (symbol !== "attack" || !this.playerStage("command")) return "";
        const unit = this.unit(this._act.unitId), battler = this.battler(unit);
        // (One who rides a vehicle that can attack has its attack too: either in reach will do.)
        const vehicle = typeof this.vehicleAttacker === "function" ? this.vehicleAttacker(unit) : null;
        const own = !!battler && battler.canAttack();
        if (!own && !vehicle) return "";
        const key = this._act.unitId + ":" + (own ? battler.attackSkillId() : 0) + ":" + (vehicle ? "v" + vehicle.attackSkillId() : "") + ":" + this.positionsHash();
        if (cache.reasonKey !== key) {
            cache.reasonKey = key;
            cache.reason = (own && this.hasTargets("skill", battler.attackSkillId())) || (vehicle && this.hasTargets("skill", vehicle.attackSkillId(), "vehicle")) ? "" : "whyNoReach";
        }
        return cache.reason;
    };

    //-------------------------------------------------------------------------
    // The other side (and allies that fight by themselves): every cell the
    // unit can reach, with every action it can use from there, scored by what
    // it would do, how exposed the cell is and how near the fight. The
    // thinking is spread over frames (F.AI_BUDGET_MS each) and keeps its
    // lists between turns, so a long enemy phase allocates next to nothing.

    const AI = F.AI = {};
    /** Where a unit stands, for the AI: its character, or null when it has none (fallen and faded, removed). Every use checks. */
    AI.at = (fight, unit) => (unit && !unit.gone ? fight.character(unit) : null);
    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const AI_CELLS = 1024;
    const ai = {
        serial: -1, unitId: 0, turn: -1, ready: false, preset: "aggressive", move: 0, count: 0, index: 0,
        x: new Int16Array(AI_CELLS), y: new Int16Array(AI_CELLS), cost: new Float32Array(AI_CELLS), height: new Float32Array(AI_CELLS),
        actions: [], foes: [], friends: [], threat: [], front: [], shoots: false,
        bestScore: -Infinity, bestX: 0, bestY: 0, bestKind: "", bestId: 0, bestCx: 0, bestCy: 0
    };
    // What a cell in an opponent's reach costs the unit, by how it fights.
    AI.EXPOSURE = { aggressive: 2, ranged: 5, support: 7 };
    // An action is worth taking over only moving when it is worth this much (a tenth of a target's life is 10).
    AI.WORTH = 5;
    // How many of each side a unit weighs as targets from each cell (the nearest ones).
    AI.POOL = 10;

    /** The actions a unit may use this turn: an enemy's by its action patterns, an actor's usable skills; always the attack. */
    function aiActions(battler, list, items) {
        list.length = 0;
        const add = (skillId, weight) => {
            const skill = $dataSkills[skillId];
            if (!skill || !battler.canUse(skill) || list.some(entry => entry.kind === "skill" && entry.id === skillId)) return;
            const action = new Game_Action(battler);
            action.setSkill(skillId);
            list.push({ action, kind: "skill", id: skillId, weight, tactics: F.tactics(battler, skill) });
        };
        // An ally that supports reaches into the party's bag as well.
        if (items && battler.isActor()) {
            for (const item of $gameParty.items()) {
                if (!battler.canUse(item)) continue;
                const action = new Game_Action(battler);
                action.setItem(item.id);
                list.push({ action, kind: "item", id: item.id, weight: 0.9, tactics: F.tactics(battler, item) });
            }
        }
        if (battler.isEnemy()) {
            for (const pattern of battler.enemy().actions) if (battler.isActionValid(pattern)) add(pattern.skillId, 0.8 + pattern.rating * 0.04);
        } else {
            for (const skill of battler.usableSkills()) if (skill.id !== battler.guardSkillId()) add(skill.id, 1);
        }
        add(battler.attackSkillId(), 1);
        return list;
    }

    /**
     * The units the battle's own events may bring over to a side: every Change Unit Side to "ally" or "enemy" in a
     * battle event page of this map, as a map of event id to that side (null when there is none). Read once per
     * battle and map. The side's own units that decide for themselves do not strike one who may yet join them.
     */
    const turncoats = { serial: -1, map: null, list: null };
    AI.turncoats = function(fight) {
        const map = typeof $dataMap !== "undefined" ? $dataMap : null;
        if (turncoats.serial === fight._serial && turncoats.map === map) return turncoats.list;
        turncoats.serial = fight._serial; turncoats.map = map; turncoats.list = null;
        for (const data of (map && map.events) || EMPTY) {
            for (const page of (data && data.pages) || EMPTY) {
                if (!F.pageHook || !F.pageHook(page)) continue;
                for (const command of page.list || EMPTY) {
                    const args = command.code === 357 && command.parameters && command.parameters[0] === "RPGReactor" && command.parameters[1] === "ChangeUnitSide" ? command.parameters[3] : null;
                    if (!args || (args.team !== "ally" && args.team !== "enemy")) continue;
                    const id = Math.floor(Number(args.eventId) || 0) || data.id;
                    (turncoats.list || (turncoats.list = new Map())).set(id, args.team);
                }
            }
        }
        return turncoats.list;
    };

    AI.begin = function(fight, unit, character, battler) {
        ai.serial = fight._serial; ai.unitId = unit.id; ai.turn = fight._turn; ai.ready = true;
        ai.preset = F.aiOf(unit);
        ai.big = F.isBig(unit); ai.turns = F.turnsBody(unit);
        ai.move = fight._act.steps;
        aiActions(battler, ai.actions, unit.team === "ally" && ai.preset === "support");
        ai.foes.length = 0; ai.friends.length = 0; ai.threat.length = 0;
        // Someone the battle's own events may bring over to this unit's side is left alone while anyone else is there to fight.
        const joins = AI.turncoats(fight);
        let spared = null;
        for (let pass = 0; pass < 2; pass++) {
            for (const other of pass ? spared || EMPTY : fight._units) {
                if (other.team === "neutral" || !AI.at(fight, other)) continue;
                if (other.team === unit.team) { if (other !== unit) ai.friends.push(other); continue; }
                if (!fight.isAlive(other)) continue;
                if (!pass && joins && other.eventId && joins.get(other.eventId) === unit.team) { (spared || (spared = [])).push(other); continue; }
                ai.foes.push(other);
                const foe = fight.battler(other);
                ai.threat.push(F.moveOf(other) + F.tactics(foe, $dataSkills[foe.attackSkillId()]).max);
            }
            if (ai.foes.length) break;
        }
        // In a crowd the unit weighs the nearest few of each side, not all sixty: nearest first.
        const far = other => { const c = AI.at(fight, other); return c ? Math.abs(c.x - character.x) + Math.abs(c.y - character.y) : Infinity; };
        if (ai.foes.length > AI.POOL) {
            const order = ai.foes.map((foe, i) => ({ foe, threat: ai.threat[i], d: far(foe) })).sort((a, b) => a.d - b.d || a.foe.id - b.foe.id);
            for (let i = 0; i < order.length; i++) { ai.foes[i] = order[i].foe; ai.threat[i] = order[i].threat; }
        }
        if (ai.friends.length > AI.POOL) ai.friends.sort((a, b) => far(a) - far(b) || a.id - b.id);
        // How near the nearest friend who closes in stands to each foe, and whether this unit has anything to shoot.
        ai.front.length = 0;
        for (const foe of ai.foes) {
            const fc = AI.at(fight, foe);
            if (!fc) { ai.front.push(0); continue; }
            let nearest = Infinity;
            for (const friend of ai.friends) {
                if (!fight.isAlive(friend)) continue;
                const reach = F.tactics(fight.battler(friend), $dataSkills[fight.battler(friend).attackSkillId()]).max;
                if (reach >= 2 || F.aiOf(friend) !== "aggressive") continue;
                const c = AI.at(fight, friend);
                if (c) nearest = Math.min(nearest, F.stepsTo(foe, fc.x, fc.y, c.x, c.y));
            }
            ai.front.push(nearest === Infinity ? 0 : nearest);
        }
        ai.shoots = ai.actions.some(entry => entry.action.isForOpponent() && entry.tactics.max >= 2);
        fight.ensureFlood(unit, ai.move);
        ai.count = 0; ai.index = 0;
        const reach = Math.ceil(ai.move);
        for (let y = character.y - reach; y <= character.y + reach && ai.count < AI_CELLS; y++) {
            for (let x = character.x - reach; x <= character.x + reach && ai.count < AI_CELLS; x++) {
                const levels = G.reachedAt(x, y, reachedOut);
                for (let i = 0; i < levels && ai.count < AI_CELLS; i++) {
                    const h = reachedOut[i * 2], cost = reachedOut[i * 2 + 1];
                    if (!(cost <= ai.move) || !G.canStopAt(x, y, h)) continue;
                    ai.x[ai.count] = x; ai.y[ai.count] = y; ai.cost[ai.count] = cost; ai.height[ai.count] = h;
                    ai.count++;
                }
            }
        }
        ai.bestScore = -Infinity; ai.bestKind = ""; ai.bestId = 0;
        ai.bestX = character.x; ai.bestY = character.y; ai.bestH = G.heightOf(character);
    };

    /** How good a cell is to stand on, whatever the unit does there. */
    function positionScore(fight, x, y, height) {
        let score = 0, nearest = Infinity, nearestFoe = null, nearestIndex = 0;
        for (let i = 0; i < ai.foes.length; i++) {
            const c = AI.at(fight, ai.foes[i]);
            if (!c) continue;
            const distance = F.stepsTo(ai.foes[i], c.x, c.y, x, y);
            if (distance <= ai.threat[i]) score -= AI.EXPOSURE[ai.preset];
            if (distance < nearest) { nearest = distance; nearestFoe = c; nearestIndex = i; }
        }
        if (nearestFoe) {
            score += G.cover(nearestFoe.x, nearestFoe.y, x, y, height) * (ai.preset === "aggressive" ? 2 : 5);
            if (ai.preset === "aggressive") score -= nearest * 0.4;
            else {
                score += Math.min(nearest, 6) * 1.5;
                // Those who shoot and mend stay behind those who close in.
                if (nearest < ai.front[nearestIndex]) score -= 6;
            }
            // High ground, for anyone with something to shoot.
            if (ai.shoots) score += clamp(height - G.heightOf(nearestFoe), 0, 3) * 2;
        }
        return score;
    }

    /** What an action is worth on one target, from a cell. */
    function targetValue(fight, unit, entry, target, x, y, height) {
        const battler = fight.battler(target), friend = target.team === unit.team, action = entry.action;
        F._strike = setStrike(fight, action, entry.tactics, unit.team, x, y, height, target);
        try { estimateAction(action, battler); } finally { F._strike = null; }
        const amount = (estimate.min + estimate.max) / 2;
        let value = 0;
        if (estimate.heals) {
            // Healing counts for what it restores; a fallen friend brought back counts most.
            const missing = battler.mhp - battler.hp;
            if (battler.isDead()) value = 70;
            else if (battler.hpRate() <= 0.8) value = Math.min(amount, missing) / battler.mhp * 100 * (1.5 - battler.hpRate());
            if (ai.preset === "support") value *= 1.6;
            return friend ? value : -value;
        }
        if (estimate.max > 0 && estimate.hp) {
            // A kill is worth most, then the share of the target's life taken; a weak target draws the blow.
            const dealt = Math.min(amount, battler.hp) * estimate.hit;
            // Any blow that lands is worth a turn (AI.WORTH); how much it takes, a kill and a weak target decide between blows.
            value = (dealt > 0 ? AI.WORTH : 0) + dealt / battler.mhp * 100 + (amount >= battler.hp ? 60 * estimate.hit : 0) + (1 - battler.hpRate()) * 15;
            return friend ? -value * 1.5 : value;
        }
        // What else it changes: a state or a buff by what it does while it lasts (nothing when it is already on, or
        // when the fight is nowhere near the one it is put on), a cure only when there is something to cure.
        const helps = action.isForFriend() || action.isForUser();
        const c = AI.at(fight, target);
        if (!c) return 0;
        const tx = target === unit ? x : c.x, ty = target === unit ? y : c.y;
        let near = 0.2;
        for (let i = 0; i < ai.foes.length && near < 1; i++) {
            const f = AI.at(fight, ai.foes[i]);
            if (f && F.stepsTo(ai.foes[i], f.x, f.y, tx, ty) <= ai.threat[i] + 1) near = 1;
        }
        const engaged = friend ? near : 1;
        for (const effect of action.item().effects || []) {
            switch (effect.code) {
                case 21: {
                    const id = effect.dataId || battler.deathStateId(), state = $dataStates[id];
                    if (!state || battler.isStateAffected(id) || (!helps && battler.isStateResist(id))) break;
                    const chance = helps ? effect.value1 : effect.value1 * battler.stateRate(id) * estimate.hit;
                    value += (helps ? 9 : state.restriction > 0 ? 34 : 13) * Math.min(1, chance) * engaged;
                    break;
                }
                case 22:
                    if (battler.isStateAffected(effect.dataId)) value += ($dataStates[effect.dataId].restriction > 0 ? 30 : 12) * Math.min(1, effect.value1);
                    break;
                case 31:
                    if (!battler.isBuffAffected(effect.dataId)) value += (4 + Math.min(5, effect.value1)) * engaged;
                    break;
                case 32:
                    if (!battler.isDebuffAffected(effect.dataId)) value += (4 + Math.min(5, effect.value1)) * estimate.hit;
                    break;
                case 33:
                    if (battler.isBuffAffected(effect.dataId)) value += 8;
                    break;
                case 34:
                    if (battler.isDebuffAffected(effect.dataId)) value += 8;
                    break;
                case 13:
                    value += 2 * engaged;
                    break;
                case 44:
                    value += 5;
                    break;
            }
        }
        return helps === friend ? value : -value;
    }

    /**
     * Weigh one cell: every action the unit has, from there. With a `deadline` (a clock time) a cell with many
     * actions is weighed an action at a time: false comes back when the clock ran out with actions still to weigh,
     * and the same call goes on with the next. Without one the whole cell is weighed. Returns true when it is done.
     */
    AI.scoreCell = function(fight, unit, index, deadline) {
        if (!ai.turns) return weighCell(fight, unit, index, deadline);
        // A long body is weighed as it would stand on the cell: turned the way its last step there turns it.
        const d = G.facingAt(ai.x[index], ai.y[index], ai.height[index]);
        assumed.unit = d ? unit : null; assumed.d = d;
        try { return weighCell(fight, unit, index, deadline); } finally { assumed.unit = null; }
    };
    function weighCell(fight, unit, index, deadline) {
        const x = ai.x[index], y = ai.y[index], height = ai.height[index];
        const from = ai.entryCell === index ? ai.entryAt : 0;
        if (from === 0) {
            ai.entryCell = index;
            ai.place = positionScore(fight, x, y, height) - ai.cost[index] * 0.05;
            // Staying put, or only moving, is the fallback every action must beat.
            if (ai.place - 1000 > ai.bestScore) { ai.bestScore = ai.place - 1000; ai.bestX = x; ai.bestY = y; ai.bestH = height; ai.bestKind = ""; }
        }
        const place = ai.place, actions = ai.actions;
        for (let at = from; at < actions.length; at++) {
            if (at > from && deadline !== undefined && now() > deadline) { ai.entryAt = at; return false; }
            const entry = actions[at];
            const tactics = entry.tactics, shape = tactics.area.shape;
            const fixed = shape === "self" || shape === "all";
            const pool = fixed ? null : entry.action.isForOpponent() ? ai.foes : ai.friends;
            const near = fixed ? 0 : Math.min(pool.length, AI.POOL);
            const count = fixed ? 1 : near + (entry.action.isForOpponent() ? 0 : 1);
            for (let i = 0; i < count; i++) {
                let cx = x, cy = y, ch = height;
                if (!fixed && i < near) {
                    // The nearest cell of the target's body, reached from the nearest cell of the unit's own.
                    const c = AI.at(fight, pool[i]);
                    if (!c) continue;
                    const near = F.nearestCell(pool[i], c.x, c.y, x, y);
                    cx = near.x; cy = near.y; ch = G.heightOf(c);
                }
                if (!fixed) {
                    const own = F.nearestCell(unit, x, y, cx, cy), sx = own.x, sy = own.y;
                    const distance = Math.abs(cx - sx) + Math.abs(cy - sy);
                    if (distance < tactics.min || distance > F.reachAt(tactics, height, ch)) continue;
                    if (distance > 0 && !F.heightInReach(tactics, height, ch)) continue;
                    if (tactics.los && distance > 1 && !G.sight(sx, sy, height, cx, cy, ch)) continue;
                }
                collectTargets(fight, unit, entry.action, tactics, x, y, cx, cy, scratchTargets);
                let value = 0;
                for (const target of scratchTargets) value += targetValue(fight, unit, entry, target, x, y, height);
                if (value < AI.WORTH) continue;
                const score = value * entry.weight + place;
                if (score > ai.bestScore) {
                    ai.bestScore = score; ai.bestX = x; ai.bestY = y; ai.bestH = height; ai.bestKind = entry.kind; ai.bestId = entry.id; ai.bestCx = cx; ai.bestCy = cy;
                }
            }
        }
        ai.entryCell = -1; ai.entryAt = 0;
        return true;
    }

    /** The next think starts over (the field changed under the plan). */
    AI.forget = function() { ai.ready = false; ai.entryCell = -1; ai.entryAt = 0; };

    /** With nothing to use from anywhere in reach: the way toward the fight (a healer toward whoever is hurt most). */
    AI.approach = function(fight, unit, character, deadline) {
        if (ai.move <= 0 || !ai.foes.length) return [];
        // A unit that fights from afar stops as soon as its longest reach covers its goal.
        let keep = 1, far = 1;
        for (const entry of ai.actions) {
            if (!entry.action.isForOpponent()) continue;
            keep = Math.max(keep, ai.preset === "aggressive" ? entry.tactics.min : entry.tactics.max);
            far = Math.max(far, entry.tactics.max);
        }
        const budget = Math.min(fight.isCrowded() ? 18 : 30, ai.move * 3 + 6);
        // The widest flood the battle makes (up to thirty steps out): taken a slice a frame, null until it is whole.
        if (!fight.ensureFlood(unit, budget, deadline)) return null;
        // The goal is whoever the unit can get to soonest: a healer's is whoever is hurt most, anyone else's the
        // enemy its reach covers from the cheapest cell. One nobody can get to (on a roof, behind a wall) is passed over.
        const goals = ai.goals || (ai.goals = []);
        goals.length = 0;
        if (ai.preset === "support") {
            let worst = 1, hurt = null;
            for (const friend of ai.friends) {
                const battler = fight.battler(friend);
                if (battler.isAlive() && battler.hpRate() < worst) { worst = battler.hpRate(); hurt = friend; }
            }
            if (hurt) goals.push(hurt);
        }
        // In a crowd the nearest few are the ones worth walking toward (the pools are kept nearest first).
        const most = fight.isCrowded() ? AI.POOL : ai.foes.length;
        if (!goals.length) for (let i = 0; i < ai.foes.length && i < most; i++) goals.push(ai.foes[i]);
        const x0 = Math.max(0, character.x - budget), x1 = Math.min(gw - 1, character.x + budget);
        const y0 = Math.max(0, character.y - budget), y1 = Math.min(gh - 1, character.y + budget);
        let tx = -1, ty = -1, th = 0, bestGap = Infinity, bestCost = Infinity;
        for (const goal of goals) {
            const c = AI.at(fight, goal);
            if (!c) continue;
            const goalHeight = G.heightOf(c), blade = far < 2 && goal.team !== unit.team;
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const base = (y * gw + x) * LEVELS;
                    for (let slot = 0; slot < LEVELS; slot++) {
                        const cost = gCost[base + slot];
                        if (!(cost < Infinity)) break;
                        let gap = Math.max(0, F.stepsTo(goal, c.x, c.y, x, y) - keep);
                        // Under a roof is not beside the one who stands on it.
                        if (blade && Math.abs(gHeight[base + slot] - goalHeight) > F.MELEE_HEIGHT) gap += 2;
                        // In reach beats nearer; among those in reach, the cheapest way wins.
                        if (gap < bestGap || (gap === bestGap && cost < bestCost)) { bestGap = gap; bestCost = cost; tx = x; ty = y; th = gHeight[base + slot]; }
                    }
                }
            }
        }
        const steps = tx >= 0 ? G.pathTo(tx, ty, th) : null;
        let last = -1;
        // As far along that way as this turn's move goes, stopping on a free cell.
        for (let i = 0; steps && i < steps.length; i++) {
            if (G.costAt(steps[i].x, steps[i].y, steps[i].height) > ai.move) break;
            // Free in the flood, and free now: the flood may be a few frames old (others have walked since).
            if (!G.canStopAt(steps[i].x, steps[i].y, steps[i].height) || fight.unitAt(steps[i].x, steps[i].y, unit, steps[i].height)) continue;
            // A big body stops only where all of it still has room.
            if (ai.big && !G.fitsAt(fight, unit, steps[i].x, steps[i].y, steps[i].face || steps[i].d, steps[i].height)) continue;
            last = i;
        }
        if (last >= 0) return steps.slice(0, last + 1);
        // No way nearer to anyone: it takes the best ground in reach (cover, out of their reach) instead of standing still.
        if (bestGap > 0 && (ai.bestX !== character.x || ai.bestY !== character.y)) {
            fight.ensureFlood(unit, ai.move);
            return G.pathTo(ai.bestX, ai.bestY, ai.bestH) || [];
        }
        return [];
    };

    /** The unit's plan for this turn, or null while it is still thinking: `{ steps, kind, id, cx, cy }`. */
    /**
     * A think lasts several frames, and the battle goes on between them: a unit that fell just before fades and
     * is erased, one may be removed. Each time the think resumes, everyone who has no place on the map any more
     * leaves the pools (with what was kept beside them), so nothing below meets a unit without a character.
     */
    AI.prune = function(fight) {
        const here = other => !!AI.at(fight, other);
        let kept = 0;
        for (let i = 0; i < ai.foes.length; i++) {
            if (!here(ai.foes[i])) continue;
            if (kept !== i) { ai.foes[kept] = ai.foes[i]; ai.threat[kept] = ai.threat[i]; ai.front[kept] = ai.front[i]; }
            kept++;
        }
        const lost = kept !== ai.foes.length;
        ai.foes.length = kept; ai.threat.length = Math.min(ai.threat.length, kept); ai.front.length = Math.min(ai.front.length, kept);
        kept = 0;
        for (let i = 0; i < ai.friends.length; i++) if (here(ai.friends[i])) ai.friends[kept++] = ai.friends[i];
        const lostFriend = kept !== ai.friends.length;
        ai.friends.length = kept;
        // The best found so far may have been aimed at someone who is gone: the cells are weighed again without them.
        if (lost || lostFriend) {
            ai.index = 0; ai.bestScore = -Infinity; ai.bestKind = ""; ai.bestId = 0;
            const own = fight.character(fight.unit(ai.unitId));
            if (own) { ai.bestX = own.x; ai.bestY = own.y; ai.bestH = G.heightOf(own); }
        }
        return lost || lostFriend;
    };

    AI.think = function(fight, unit, character) {
        if (!ai.ready || ai.serial !== fight._serial || ai.unitId !== unit.id || ai.turn !== fight._turn) { ai.waits = 0; ai.entryCell = -1; ai.entryAt = 0; AI.begin(fight, unit, character, fight.battler(unit)); }
        // Someone left the field mid-think: the cells are weighed again from the first.
        else {
            if (AI.prune(fight)) { ai.entryCell = -1; ai.entryAt = 0; }
            // An enemy's actions find it by its place in the troop, which moves up when a unit before it is removed.
            const battler = unit.enemy;
            if (battler && battler.index() >= 0) for (const entry of ai.actions) if (entry.action.subject() !== battler) entry.action.setSubject(battler);
        }
        // A crowd's turn is long enough: its units think faster. The frame's share is one share, whoever thinks in it:
        // several units deciding in one frame (an army's side acting together) split it, each weighing at least a cell.
        // (The battle's own update counts the frames: AI.tick. Thought of outside one, each think has its own share.)
        const frame = AI.tick;
        if (!(frame > 0) || AI.shareFrame !== frame || AI.shareSerial !== fight._serial) {
            AI.shareFrame = frame; AI.shareSerial = fight._serial;
            AI.shareUntil = now() + F.AI_BUDGET_MS * (fight.isCrowded() ? 3 : 1);
        }
        const deadline = AI.shareUntil;
        while (ai.index < ai.count) {
            // Another flood (a preview, a second unit) may have used the buffers since the last frame.
            fight.ensureFlood(unit, ai.move);
            if (!AI.scoreCell(fight, unit, ai.index, deadline)) return null;
            ai.index++;
            if (ai.index < ai.count && now() > deadline) return null;
        }
        if (ai.bestKind) {
            ai.ready = false;
            fight.ensureFlood(unit, ai.move);
            return { steps: G.pathTo(ai.bestX, ai.bestY, ai.bestH) || [], kind: ai.bestKind, id: ai.bestId, cx: ai.bestCx, cy: ai.bestCy };
        }
        // Nothing worth using from anywhere in reach: it closes in, and keeps watch if it has something to shoot.
        // The way there is the think's last and longest look at the map: it too keeps to the frame's share.
        // (Another flood between frames starts it over; after a dozen frames of that it is taken whole.)
        ai.waits = (ai.waits || 0) + 1;
        const steps = AI.approach(fight, unit, character, ai.waits > 12 ? undefined : deadline);
        if (steps === null) return null;
        ai.waits = 0;
        ai.ready = false;
        return { steps, kind: fight.canOverwatch(unit) ? "watch" : "", id: 0, cx: 0, cy: 0 };
    };

    Game_Fight.prototype.updateAi = function(unit, character) {
        const plan = AI.think(this, unit, character);
        if (!plan) return;
        const act = this._act;
        act.plan = { kind: plan.kind, id: plan.id, cx: plan.cx, cy: plan.cy };
        const moveOnly = !plan.kind || plan.kind === "watch";
        if (!moveOnly) {
            const how = this.judgePlan(unit, character, plan);
            // Its target is about to fall to someone else: it thinks again in a moment.
            if (how === "wait") { act.plan = null; AI.forget(); this._wait = 6; return; }
            if (how === "side") {
                const side = { kind: plan.kind, id: plan.id, cx: plan.cx, cy: plan.cy, targets: plan.targets, expect: plan.expect };
                if (plan.steps.length) this.detachWalk(unit, character, plan.steps, false, side);
                else { if (!this.beginSideAction(unit, side)) this.faceNearest(unit); this.finishAct(); }
                this.touch();
                return;
            }
        }
        if (plan.steps.length && moveOnly && this.canDetach(unit, plan.steps)) this.detachWalk(unit, character, plan.steps, plan.kind === "watch");
        else if (plan.steps.length) this.startWalk(unit, character, plan.steps);
        else this.actOnPlan(unit);
        this.touch();
    };

    //-------------------------------------------------------------------------
    // Bodies through the battle: measured as it starts, as a unit joins and
    // when a model arrives; whoever has no room where it stands is put where
    // it has, and the view goes to whoever joins.

    const startBodies = Game_Fight.prototype.start;
    Game_Fight.prototype.start = function(options) {
        // What was known of the last battle's units says nothing of this one's.
        if (!this._active) {
            feet.clear(); unsettled.length = 0; anyTurner = false; anyOver = false; turners = new WeakMap(); turnerList.length = 0;
            F.forgetFootprints();
        }
        const serial = startBodies.call(this, options);
        if (serial && this._mode === "tactical" && this._tac) {
            for (const unit of this._units) footOf(unit);
            unsettled.length = 0;
            // The first view is chosen from where everyone ends up standing.
            if (F.settle(this, null, true)) F.View.opening(this);
        }
        return serial;
    };

    const spawnBodies = Game_Fight.prototype.spawn;
    Game_Fight.prototype.spawn = function(options) {
        const unit = spawnBodies.call(this, options);
        if (unit && this._tac && this.isTactical()) {
            footOf(unit);
            const at = unsettled.indexOf(unit.id);
            if (at >= 0) unsettled.splice(at, 1);
            F.settle(this, SETTLE_ONE(unit.id));
            // A director's reveal shot of the newcomer is the look at it; without one the view goes there itself.
            const director = F.Director, shot = director && director.shot ? director.shot() : null;
            if (!(shot && shot.name === "reveal")) F.View.visitUnit(this, unit);
        }
        return unit;
    };
    const settleOne = [0];
    const SETTLE_ONE = id => { settleOne[0] = id; return settleOne; };

    const sideBodies = Game_Fight.prototype.setEventSide;
    Game_Fight.prototype.setEventSide = function(eventId, team) {
        const before = this._active ? this.unitOfEvent(eventId) : null, was = before ? before.team : "";
        const result = sideBodies.apply(this, arguments);
        const unit = this._active && this._tac && this.isTactical() ? this.unitOfEvent(eventId) : null;
        // Someone who joins a side (a bystander who takes up arms, a unit that changes sides) is shown.
        if (unit && unit.team !== was && unit.team !== "neutral") F.View.visitUnit(this, unit);
        return result;
    };

    const updateBodies = Game_Fight.prototype.update;
    Game_Fight.prototype.update = function() {
        updateBodies.call(this);
        if (!this._active || this._mode !== "tactical" || !this._tac || !this.isHere()) return;
        if (!F.Input._threatBound) F.Input.bindThreat(true);
        if (anyTurner) F.squareHulls();
        // A model still on its way is asked about now and then; a body measured anew takes room it can have.
        if (frameNow() % F.FOOT_PENDING === 0) for (const unit of this._units) if (!unit.gone) footOf(unit);
        if (unsettled.length && !this._run && !(this._tac.runs && this._tac.runs.length)) F.settle(this, unsettled.splice(0, unsettled.length));
        if (this._tac.placedNote) sayPlaced(this);
        F.Input.updateThreatKey(this);
    };

    const finishBodies = Game_Fight.prototype.finish;
    Game_Fight.prototype.finish = function() {
        finishBodies.call(this);
        anyTurner = false; anyOver = false; unsettled.length = 0; turnerList.length = 0;
        F.Input.bindThreat(false);
    };

    //-------------------------------------------------------------------------
    // The view. On a 3D map the battle looks from the isometric camera: it
    // follows the cursor and the unit that acts, turns by quarters, zooms,
    // and gives the map's own camera back when the battle ends. A battle
    // started with `view: "map"` (or System.json `reactorBattle.view`) keeps
    // the map's camera instead (top-down, third person, first person), and a
    // 2D map always keeps its view; the display follows the same way.
    // `View.active()` is true only while the tactical camera is in charge.

    const View = F.View = { _suspended: 0 };
    const stepOut = { x: 0, y: 0 };

    /** The 3D view the map scene draws with, or null (a 2D map, no scene yet). */
    View.live = function() {
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const spriteset = scene && scene._spriteset;
        return spriteset && spriteset._reactor3d ? spriteset._reactor3d : null;
    };

    View.active = function() {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        return !!(fight && fight.isTactical() && fight.isHere() && fight._tac && fight._tac.view && fight._tac.view.own && !View._suspended && View.live());
    };

    /** A director takes the camera for a shot, and gives it back. The view leaves the camera and the display alone between. */
    View.suspend = function() { View._suspended++; };
    View.resume = function() { View._suspended = Math.max(0, View._suspended - 1); };

    const camera3D = () => (typeof Reactor3D !== "undefined" && Reactor3D && Reactor3D.Camera ? Reactor3D.Camera : null);

    View.start = function(fight, mode) {
        const tac = fight.tac(), C = camera3D();
        tac.view = null;
        View._suspended = 0;
        if (!C || !G.is3D()) return;
        const state = C.currentState();
        const kept = typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._reactorCamera3d;
        const own = (mode || F.systemSettings().view) !== "map";
        tac.view = { own, saved: Object.assign({}, state), kept: kept ? Object.assign({}, kept) : null, yaw: 45, zoom: 0.8 };
        visit.left = 0; visit.speaker = "";
        if (tac.view.own && !View.opening(fight)) View.apply(fight, 30);
    };

    /** The way the tactical camera looks over the ground (map x east, map y south) at `yaw`, the view's own without one: `{ dx, dz }`, shared; null when the battle keeps the map's camera. */
    const lookOut = { dx: 0, dz: 0 };
    View.direction = function(yaw) {
        if (!Number.isFinite(yaw)) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null, view = fight && fight._tac ? fight._tac.view : null;
            if (!view || !view.own) return null;
            yaw = view.yaw;
        }
        lookOut.dx = Math.sin(yaw * Math.PI / 180); lookOut.dz = -Math.cos(yaw * Math.PI / 180);
        return lookOut;
    };

    /**
     * Whether a roof, a wall or the land stands between the tactical camera at `yaw` and a place. The camera is
     * above everything, so the highest thing on a cell being over the sight line there is enough. Inside `box`
     * (`[x0, y0, x1, y1]`: the ground the battle's cutaway keeps open) only the land counts.
     */
    View.hides = function(x, y, height, yaw, box) {
        if (!G.is3D()) return false;
        const a = yaw * Math.PI / 180, pitch = 35.264 * Math.PI / 180;
        const dx = -Math.sin(a) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(a) * Math.cos(pitch);
        const land = !!(Reactor3D.terrainHeightAt && Reactor3D.elevationAt);
        for (let t = 1.5; t <= 44; t += 0.75) {
            const px = x + 0.5 + dx * t, pz = y + 0.5 + dz * t, py = height + 1.2 + dy * t;
            const cx = Math.floor(px), cz = Math.floor(pz);
            if (!$gameMap.isValid(cx, cz)) break;
            if (land && (Reactor3D.elevationAt($dataMap, cx, cz) || 0) + (Reactor3D.terrainHeightAt($dataMap, px, pz) || 0) > py) return true;
            if (box && px >= box[0] && px <= box[2] && pz >= box[1] && pz <= box[3]) continue;
            if ((Reactor3D.groundHeightAt($dataMap, px, pz, 1000) || 0) > py + 0.05) return true;
        }
        return false;
    };

    // The opening's subjects, kept between battles: [x, y, height, weight, ...].
    const subjects = [];
    const openBox = [0, 0, 0, 0];
    View.QUARTERS = [45, 135, 225, 315];
    // The opening looks at the party and at the enemies within this many tiles of it, never fewer than the nearest.
    View.OPENING_REACH = 14;

    /**
     * The battle's first view: the middle of the player's units and the nearest enemies, from the quarter that
     * shows them with the least built or raised in the way (the one that looks from the party toward the enemy
     * when two are as clear), near enough to read them and far enough to hold them all. False when there is
     * nobody to look at or the battle keeps the map's camera.
     */
    View.opening = function(fight) {
        const tac = fight._tac, view = tac && tac.view;
        if (!view || !view.own) return false;
        // The player's own units near the leader, then everyone else on that side.
        let ax = 0, ay = 0, an = 0;
        subjects.length = 0;
        for (const unit of fight._units) {
            const c = unit.gone || unit.team !== "ally" ? null : fight.character(unit);
            if (!c || !unit.party) continue;
            ax += c.x; ay += c.y; an++;
            subjects.push(c.x, c.y, G.heightOf(c), 2);
        }
        if (!an) return false;
        ax /= an; ay /= an;
        // The enemies in reach of the party's middle, nearest first; with none in reach, the nearest one.
        let ex = 0, ey = 0, en = 0, nearest = null, least = Infinity;
        for (const unit of fight._units) {
            const c = unit.gone || unit.team !== "enemy" || !fight.isAlive(unit) ? null : fight.character(unit);
            if (!c) continue;
            const far = Math.hypot(c.x - ax, c.y - ay);
            if (far < least) { least = far; nearest = c; }
            if (far > View.OPENING_REACH) continue;
            ex += c.x; ey += c.y; en++;
            subjects.push(c.x, c.y, G.heightOf(c), 1);
        }
        if (!en && nearest) { ex = nearest.x; ey = nearest.y; en = 1; if (least <= View.OPENING_REACH * 2) subjects.push(nearest.x, nearest.y, G.heightOf(nearest), 1); }
        if (en) { ex /= en; ey /= en; }
        // The ground the cutaway keeps open: everyone the opening looks at.
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < subjects.length; i += 4) {
            x0 = Math.min(x0, subjects[i]); x1 = Math.max(x1, subjects[i] + 1); y0 = Math.min(y0, subjects[i + 1]); y1 = Math.max(y1, subjects[i + 1] + 1);
        }
        openBox[0] = x0 - 0.25; openBox[1] = y0 - 0.25; openBox[2] = x1 + 0.25; openBox[3] = y1 + 0.25;
        const cx = (x0 + x1 - 1) / 2, cy = (y0 + y1 - 1) / 2;
        let best = view.yaw, bestScore = Infinity;
        for (const yaw of View.QUARTERS) {
            let score = 0;
            for (let i = 0; i < subjects.length; i += 4) if (View.hides(subjects[i], subjects[i + 1], subjects[i + 2], yaw, openBox)) score += subjects[i + 3] * 10;
            // What fills the picture round them without hiding anyone: the ground about the middle, seen or not.
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
                if (!ox && !oy) continue;
                const px = Math.round(cx + ox * 5), py = Math.round(cy + oy * 5);
                if ($gameMap.isValid(px, py) && View.hides(px, py, G.groundAt(px, py, subjects[2]), yaw, null)) score += 1;
            }
            // From behind the party toward the enemy is the natural way to look; a quarter turn off it costs a little.
            if (en) {
                const look = View.direction(yaw), far = Math.hypot(ex - ax, ey - ay);
                if (far > 0.5) score += (1 - (look.dx * (ex - ax) + look.dz * (ey - ay)) / far) * 1.5;
            }
            if (score < bestScore - 1e-6) { bestScore = score; best = yaw; }
        }
        view.yaw = best;
        // Far enough to hold everyone: their spread across the screen and into it, with room for the HUD.
        const look = View.direction(best);
        let wide = 0, deep = 0;
        for (let i = 0; i < subjects.length; i += 4) {
            const rx = subjects[i] - cx, ry = subjects[i + 1] - cy;
            wide = Math.max(wide, Math.abs(rx * -look.dz + ry * look.dx));
            deep = Math.max(deep, Math.abs(rx * look.dx + ry * look.dz) * 0.577 + Math.abs(subjects[i + 2] - subjects[2]) * 0.816);
        }
        const tilesWide = Graphics.width / $gameMap.tileWidth(), tilesHigh = Graphics.height / $gameMap.tileHeight();
        view.zoom = clamp(Math.max((wide * 2 + 3) / (tilesWide * 0.8), (deep * 2 + 4) / (tilesHigh * 0.62)), 0.7, 1.6);
        delete view.back; view.wide = false;
        // The view rests on that middle until the player points somewhere.
        view.open = { x: cx, y: cy, key: -1 };
        fight.focusOn(cx, cy);
        View.apply(fight, 30);
        return true;
    };

    // Where the view has gone to show someone (a unit that joins, whoever speaks), for a while: it comes back by itself.
    const visit = { left: 0, x: 0, y: 0, h: NaN, serial: -1, speaker: "", speakerUnit: 0, frame: -1, count: 0, sx: 0, sy: 0 };
    View.VISIT_FRAMES = 80;

    /** The view goes to a place for `frames` and then back to where the battle looks. */
    View.visit = function(fight, x, y, h, frames) {
        visit.left = Math.max(1, frames || View.VISIT_FRAMES); visit.x = x; visit.y = y; visit.h = Number.isFinite(h) ? h : NaN; visit.serial = fight._serial;
        const view = fight._tac && fight._tac.view;
        if (view) view.open = null;
    };

    // A unit that strikes someone further off than PAIR_NEAR steps is framed with its target (the view on the middle of
    // the two); further than PAIR_FAR, the view pulls back as well.
    View.PAIR_NEAR = 5;
    View.PAIR_FAR = 11;

    /** The view stops showing whoever it went to (the player pointed somewhere); a speaker is not gone back to. */
    View.endVisit = function() { visit.left = 0; visit.speakerUnit = 0; };

    /** Whether the view is away showing someone (a unit that joined, whoever speaks) and not where the battle looks. */
    View.isVisiting = function(fight) { return visit.left > 0 && !!fight && visit.serial === fight._serial; };

    /** The view goes to a unit; several in the same moment (reinforcements) are looked at together. */
    View.visitUnit = function(fight, unit) {
        const c = unit ? fight.character(unit) : null;
        if (!c) return false;
        const frame = frameNow();
        if (visit.frame < 0 || frame - visit.frame > 20 || frame < visit.frame || visit.serial !== fight._serial) { visit.count = 0; visit.sx = 0; visit.sy = 0; }
        visit.frame = frame; visit.count++; visit.sx += c.x; visit.sy += c.y;
        View.visit(fight, visit.sx / visit.count, visit.sy / visit.count, G.heightOf(c), View.VISIT_FRAMES);
        return true;
    };

    /** The unit a message's speaker name means: its battler's name, or the first word or words of it ("Rhea" for "Rhea Voss"). */
    View.speaker = function(fight, name) {
        const said = String(name || "").replace(/\\[A-Za-z]+\[[^\]]*\]/g, "").replace(/\\./g, "").trim().toLowerCase();
        if (!said) return null;
        let found = null;
        for (const unit of fight._units) {
            if (unit.gone || !fight.character(unit)) continue;
            const battler = fight.battler(unit), character = fight.character(unit);
            const own = battler ? String(battler.name()).toLowerCase() : "";
            const event = unit.eventId && character.event && character.event() ? String(character.event().name || "").toLowerCase() : "";
            if (own === said || event === said) return unit;
            if (!found && ((own && (own.startsWith(said + " ") || said.startsWith(own + " "))) || (event && event.startsWith(said + " ")))) found = unit;
        }
        return found;
    };

    /** While a message with a speaker who is on the field shows, the view is on the speaker. */
    function followSpeaker(fight) {
        const message = typeof $gameMessage !== "undefined" ? $gameMessage : null;
        const name = message && message.hasText && message.hasText() && message.speakerName ? message.speakerName() : "";
        if (name !== visit.speaker) {
            visit.speaker = name;
            const unit = name ? View.speaker(fight, name) : null;
            visit.speakerUnit = unit ? unit.id : 0;
        }
        if (!visit.speakerUnit) return;
        const c = fight.character(fight.unit(visit.speakerUnit));
        if (c) View.visit(fight, c._realX, c._realY, G.heightOf(c), 24);
    }

    View.apply = function(fight, frames) {
        const view = fight._tac && fight._tac.view, C = camera3D();
        if (!view || !view.own || !C) return;
        C.change({ mode: "isometric", focus: "display", yaw: view.yaw, distance: view.zoom === 1 ? null : C.frameDistance(15) * view.zoom }, frames, false);
    };

    View.end = function(fight) {
        const view = fight._tac && fight._tac.view, C = camera3D();
        if (view && view.own && C) {
            C.change(view.saved, 30, false);
            if (view.kept && typeof $gameSystem !== "undefined" && $gameSystem) $gameSystem._reactorCamera3d = view.kept;
        }
        if (fight._tac) fight._tac.view = null;
        View._suspended = 0;
    };

    /** Whether the land itself (a hill, a cliff, a rock: nothing the view opens) stands between the camera at `yaw` and a point. */
    View.landHides = function(x, y, height, yaw) {
        if (!Reactor3D.terrainHeightAt || !Reactor3D.elevationAt) return false;
        const rocks = openGrid();
        const a = yaw * Math.PI / 180, pitch = 35.264 * Math.PI / 180;
        const dx = -Math.sin(a) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(a) * Math.cos(pitch);
        for (let t = 2; t <= 44; t += 1.5) {
            const px = x + 0.5 + dx * t, pz = y + 0.5 + dz * t, py = height + 1.5 + dy * t;
            const cx = Math.floor(px), cz = Math.floor(pz);
            if (!$gameMap.isValid(cx, cz)) break;
            if ((Reactor3D.elevationAt($dataMap, cx, cz) || 0) + (Reactor3D.terrainHeightAt($dataMap, px, pz) || 0) > py) return true;
            if (rocks && rocks.rock[cz * rocks.w + cx] > py) return true;
        }
        return false;
    };

    /** As a unit's turn begins: if a hill hides it from this side, the camera turns to the nearest quarter that sees it. */
    View.unblock = function(fight, x, y, height) {
        const view = fight._tac && fight._tac.view;
        if (!view || !view.own || View._suspended || !G.is3D() || !View.landHides(x, y, height, view.yaw)) return false;
        for (const step of [1, -1, 2]) {
            const yaw = (((view.yaw + step * 90) % 360) + 360) % 360;
            if (View.landHides(x, y, height, yaw)) continue;
            view.yaw = yaw;
            View.apply(fight, 24);
            return true;
        }
        return false;
    };

    /** Turn the tactical camera a quarter (`step` 1 or -1). False when it is not in charge. */
    View.rotate = function(step) {
        if (!View.active()) return false;
        const fight = $gameFight, view = fight._tac.view;
        view.yaw = (((view.yaw + step * 90) % 360) + 360) % 360;
        // The player's own turn: the view does not turn itself again for a while, and the marks are sorted again
        // into those this quarter shows and those it hides.
        view.turnedAt = frameNow();
        View.apply(fight, 18);
        fight.touch();
        return true;
    };

    /**
     * How squarely a place on a level faces the tactical camera at `yaw`: over 0 it is seen, at or under 0 it is
     * edge-on or turned away (a roof's pitch facing the other way). Level ground is 1 from every quarter.
     */
    View.faces = function(x, y, h, yaw) {
        if (!G.is3D()) return 1;
        const at = (px, py) => Reactor3D.groundHeightAt($dataMap, px, py, h) || 0;
        let sx = (at(x + 0.9, y + 0.5) - at(x + 0.1, y + 0.5)) / 0.8, sz = (at(x + 0.5, y + 0.9) - at(x + 0.5, y + 0.1)) / 0.8;
        if (Math.abs(sx) > 1.2) sx = 0;
        if (Math.abs(sz) > 1.2) sz = 0;
        // The camera looks along (ax, ay) over the ground, down at the isometric pitch.
        const turn = yaw * Math.PI / 180, ax = Math.sin(turn) * 1.414, ay = -Math.cos(turn) * 1.414;
        return 1 + sx * ax + sz * ay;
    };

    /** The quarter that shows a place best, when the one in use hides it; the yaw in use otherwise. */
    View.quarterFor = function(x, y, h, yaw) {
        const now = View.faces(x, y, h, yaw);
        if (now > 0.3) return yaw;
        let best = yaw, face = now;
        for (const turn of [90, 270, 180]) {
            const other = (yaw + turn) % 360, seen = View.faces(x, y, h, other);
            if (seen > face + 0.2) { best = other; face = seen; }
        }
        return best;
    };

    /** The cursor went to a place on a roof this quarter hides: the view turns to the nearest quarter that shows it. */
    View.showCursor = function(fight) {
        const tac = fight._tac, view = tac.view, cursor = tac.cursor;
        if (!view || !view.own || !cursor.on || !View.active() || !fight.awaitsPlayer()) return false;
        const key = cursor.x + cursor.y * 4096 + Math.round((cursor.h || 0) * 4) * 16777216;
        if (key === view.seenKey) return false;
        view.seenKey = key;
        if (!Number.isFinite(cursor.h) || !View.onRoof(cursor.x, cursor.y, cursor.h)) return false;
        // Never against the player's own turning: for two seconds after it the view stays as it was put.
        if (Number.isFinite(view.turnedAt) && frameNow() - view.turnedAt < 120 && frameNow() >= view.turnedAt) return false;
        const yaw = View.quarterFor(cursor.x, cursor.y, cursor.h, view.yaw);
        if (yaw === view.yaw) return false;
        view.yaw = yaw;
        View.apply(fight, 30);
        fight.touch();
        return true;
    };

    View.zoom = function(direction) {
        if (!View.active()) return false;
        const fight = $gameFight, view = fight._tac.view;
        view.zoom = clamp(view.zoom * (direction > 0 ? 1.15 : 1 / 1.15), 0.5, 2.2);
        View.apply(fight, 8);
        return true;
    };

    /** The cell a direction key moves the cursor to, as the screen shows it: Up is away from the camera. */
    View.cursorStep = function(d) {
        let quarter = 0;
        const live = View.live(), C = camera3D();
        if (live && C) {
            const state = C.currentState();
            const yaw = live.cameraCurrent && Number.isFinite(live.cameraCurrent.yaw) ? live.cameraCurrent.yaw : state.yaw || 0;
            const turned = ((yaw % 360) + 360) % 360;
            quarter = (state.mode === "isometric" ? Math.floor(turned / 90) : Math.round(turned / 90)) % 4;
        }
        let x = DX[d], y = DY[d];
        for (let i = 0; i < quarter; i++) { const t = x; x = -y; y = t; }
        stepOut.x = x; stepOut.y = y;
        return stepOut;
    };

    View.update = function(fight) {
        const tac = fight._tac;
        if (!tac) return;
        if (View._suspended) {
            // A director's shot of whoever joined is the look at them: the visit runs out under it, so they are not shown twice.
            if (visit.left > 0 && visit.serial === fight._serial && !visit.speakerUnit) visit.left--;
            return;
        }
        const view = tac.view, C = camera3D();
        if (view && view.own && C) {
            // Back on the battle's map, or a save loaded: the map set its own camera up again.
            const state = C.currentState();
            if (state.mode !== "isometric" || state.focus !== "display") View.apply(fight, 0);
        }
        const act = fight._act;
        let pair = 0;
        if (act && act.unitId && (act.stage === "walk" || act.stage === "ai" || act.stage === "aim" || act.stage === "perform")) {
            const character = fight.character(fight.unit(act.unitId));
            if (character) {
                let fx = character._realX, fy = character._realY;
                // A blow at someone far off: the view is on the middle of the two, so the target and the number are in it.
                const target = (act.stage === "aim" || act.stage === "perform") && act.targetId ? fight.character(fight.unit(act.targetId)) : null;
                if (target) {
                    pair = Math.abs(target._realX - fx) + Math.abs(target._realY - fy);
                    if (pair > View.PAIR_NEAR) { fx = (fx + target._realX) / 2; fy = (fy + target._realY) / 2; } else pair = 0;
                }
                fight.focusOn(fx, fy);
            }
        }
        // The opening's middle is what the first "choose a unit" shows (the cursor is on the first unit all the same);
        // a unit whose turn begins by itself takes the view as any turn does.
        if (view && view.open && act) {
            if (act.stage === "pick") fight.focusOn(view.open.x, view.open.y);
            view.open = null;
        }
        View.showCursor(fight);
        followSpeaker(fight);
        // Several units acting at once: the view pulls back and looks at the middle of them.
        const busy = (tac.movers ? tac.movers.length : 0) + (tac.runs ? tac.runs.length : 0);
        if (view && view.own) {
            // (And a blow across more ground than the view holds.)
            const wide = busy >= 2 || pair > View.PAIR_FAR;
            if (wide !== !!view.wide) {
                view.wide = wide;
                if (wide) { view.back = view.zoom; view.zoom = Math.max(view.zoom, 1.5); } else view.zoom = view.back || view.zoom;
                View.apply(fight, 24);
            }
        }
        if (busy >= 2) {
            let sx = 0, sy = 0, n = 0;
            for (const mover of tac.movers || EMPTY) { const c = fight.character(fight.unit(mover.unitId)); if (c) { sx += c._realX; sy += c._realY; n++; } }
            for (const run of tac.runs || EMPTY) { const c = fight.character(fight.unit(run.subjectId)); if (c) { sx += c._realX; sy += c._realY; n++; } }
            if (n) fight.focusOn(sx / n, sy / n);
        }
        const focus = tac.focus;
        if (!focus) return;
        let fx = focus.x, fy = focus.y;
        // Someone to show (a unit that joined, whoever speaks): the view is there until the visit is over, then
        // back where the battle looks.
        const visiting = visit.left > 0 && visit.serial === fight._serial;
        if (visiting) { visit.left--; fx = visit.x; fy = visit.y; }
        // A unit on a roof (or in a pit) is framed where it stands, not where the ground under the view's middle is:
        // the camera looks at ground level, so the point it looks at slides along its sight line by the difference.
        const live = View.live();
        if (live && view && view.own && Reactor3D.viewGroundAt) {
            const cursor = tac.cursor, walker = act && act.unitId ? fight.character(fight.unit(act.unitId)) : null;
            const follows = !visiting && walker && (act.stage === "walk" || act.stage === "ai" || act.stage === "aim" || act.stage === "perform");
            const onCursor = !visiting && !follows && cursor.on && Math.abs(cursor.x - fx) < 0.75 && Math.abs(cursor.y - fy) < 0.75;
            const there = onCursor ? fight.unitAt(cursor.x, cursor.y, null, cursor.h) : null;
            // The cursor on a roof cell nobody stands on yet is framed at that roof too.
            const height = visiting ? (Number.isFinite(visit.h) ? visit.h : null)
                : follows ? G.heightOf(walker) + (Number(walker._reactorAir) || 0) : there ? G.heightOf(fight.character(there)) : onCursor && Number.isFinite(cursor.h) ? cursor.h : null;
            if (height !== null) {
                const near = $gamePlayer._reactorGround;
                const yaw = (live.cameraCurrent && Number.isFinite(live.cameraCurrent.yaw) ? live.cameraCurrent.yaw : view.yaw) * Math.PI / 180;
                const ax = Math.sin(yaw) * 1.414, ay = -Math.cos(yaw) * 1.414;
                let lift = height - (Reactor3D.viewGroundAt($dataMap, fx + 0.5, fy + 0.5, near) || 0);
                if (Math.abs(lift) > 0.75) {
                    lift = height - (Reactor3D.viewGroundAt($dataMap, fx + ax * lift + 0.5, fy + ay * lift + 0.5, near) || 0);
                    fx += ax * lift; fy += ay * lift;
                }
            }
        }
        const halfX = ($gameMap.screenTileX() - 1) / 2, halfY = ($gameMap.screenTileY() - 1) / 2;
        const dx = fx - ($gameMap._displayX + halfX), dy = fy - ($gameMap._displayY + halfY);
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
        const nx = $gameMap._displayX + dx * 0.16, ny = $gameMap._displayY + dy * 0.16;
        if (live) {
            // The 3D camera looks at the display's middle; it may look past the map's edge.
            $gameMap._displayX = nx; $gameMap._displayY = ny;
        } else {
            $gameMap.setDisplayPos(nx, ny);
        }
    };

    // What the view keeps of the battle's ground and of what it has opened (see "What the view opens" below).
    const cut = { rev: -1, serial: -1, eye: null, scene: null, grid: null, open: [], props: new Map(), boxes: new WeakMap(), memo: new Map(), caps: [], capsDue: false,
        entryCluster: [], entryRun: [], lowTag: -2, ex: 1e9, ey: 0, ez: 0, stamp: 0, last: -1, due: Infinity, easing: false, boxScratch: null, box3: null };

    /** Whether a height on a cell is on something built over the ground there (a roof, a deck), not the ground itself. */
    View.onRoof = function(x, y, height) {
        if (!G.is3D()) return false;
        // The land itself (terrain and terraces), whatever is built over it: a roof cell may have no place to stand under it.
        const land = Reactor3D.terrainHeightAt && Reactor3D.elevationAt
            ? (Reactor3D.elevationAt($dataMap, x, y) || 0) + (Reactor3D.terrainHeightAt($dataMap, x + 0.5, y + 0.5) || 0)
            : Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, -1000) || 0;
        return height - land > 2.5;
    };

    /**
     * The battle's ground, as a box of the map: every unit, the cursor and every marked cell (ReactorFight.Marks),
     * with the ground it lies on and the height a wall keeps over it. The pointer asks it what it looks through
     * and a number over a unit whether it shows (Reactor3D.cutawayShows). Made again when the marks or a unit
     * change, never per frame; off outside the tactical view and during a director's shot. Returns whether it
     * was made again.
     */
    View.cutRegion = function(fight, on) {
        const shared = Reactor3D.cutawayUniforms(), box = shared.rrFightBox.value;
        if (!on) { box[0] = box[1] = box[2] = box[3] = 0; cut.rev = -1; return false; }
        const tac = fight.tac();
        if (cut.rev === tac.rev && cut.serial === fight._serial) return false;
        cut.rev = tac.rev; cut.serial = fight._serial;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, low = Infinity, high = -Infinity;
        for (const unit of fight._units) {
            if (unit.gone) continue;
            const character = fight.character(unit);
            if (!character || (unit.team !== "neutral" && !fight.isAlive(unit))) continue;
            const body = F.footprint(unit), reach = Math.max(0.5, Math.max(body.w, body.h) / 2);
            x0 = Math.min(x0, character._realX + 0.5 - reach); x1 = Math.max(x1, character._realX + 0.5 + reach);
            y0 = Math.min(y0, character._realY + 0.5 - reach); y1 = Math.max(y1, character._realY + 0.5 + reach);
            const ground = G.heightOf(character);
            low = Math.min(low, ground); high = Math.max(high, ground);
        }
        const marks = F.Marks;
        for (let i = 0; i < marks.count; i++) {
            const x = marks.x[i], y = marks.y[i];
            x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
        }
        // The shaders ask where a sight line lands on the lowest unit's ground. What hides a unit standing higher
        // (a tree in front of someone on a roof) lands beyond that unit, away from the camera, by its height: the
        // box reaches there for every raised unit and raised mark, for the quarter the view looks from.
        const view = tac.view;
        if (view && Number.isFinite(low)) {
            const turn = view.yaw * Math.PI / 180, ax = Math.sin(turn) * 1.414, ay = -Math.cos(turn) * 1.414;
            const reach = (px, py, h) => {
                const g = h - low;
                if (!(g > 0.75)) return;
                const fx = px + ax * (g + 3), fy = py + ay * (g + 3);
                x0 = Math.min(x0, fx - 0.5); x1 = Math.max(x1, fx + 0.5); y0 = Math.min(y0, fy - 0.5); y1 = Math.max(y1, fy + 0.5);
            };
            for (const unit of fight._units) {
                if (unit.gone) continue;
                const character = fight.character(unit);
                if (character && (unit.team === "neutral" || fight.isAlive(unit))) reach(character._realX + 0.5, character._realY + 0.5, G.heightOf(character));
            }
            for (let i = 0; i < marks.count; i++) if (Number.isFinite(marks.h[i])) reach(marks.x[i] + 0.5, marks.y[i] + 0.5, marks.h[i]);
        }
        // What the pointer takes for the floor is the ground the battle stands on: someone on a roof or a deck does
        // not lift it for everyone (each building is opened for itself; a unit up there is pointed at by its body,
        // a place up there with the level key). With the cursor up there, that level is the floor, and the rest of
        // it the unit could walk (the marks up there).
        high = low;
        const pointer = fight.cursor();
        if (pointer && Number.isFinite(pointer.h) && pointer.h > high + 0.75) {
            high = pointer.h;
            for (let i = 0; i < marks.count; i++) if (Number.isFinite(marks.h[i]) && marks.h[i] > high) high = marks.h[i];
        }
        if (!(x1 > x0)) { box[0] = box[1] = box[2] = box[3] = 0; return true; }
        box[0] = x0 - 0.25; box[1] = y0 - 0.25; box[2] = x1 + 0.25; box[3] = y1 + 0.25;
        shared.rrFightLevel.value[0] = low;
        // What stands more than a foot over that floor is looked through by the pointer.
        shared.rrFightLevel.value[1] = high + 1.1;
        return true;
    };

    //-------------------------------------------------------------------------
    // What the view opens. Nothing the player must see hides behind something
    // built: while the tactical camera looks, what stands between it and a
    // unit, the cursor, or a place the unit in hand can go to or strike is
    // opened, and opened cleanly.
    //  - A building loses the storey above the floor in question, whole (its
    //    roof, the floors over it). Its walls that stand between the camera
    //    and its own rooms are cut down to a foot, and so is a wall where it
    //    hides someone standing behind it.
    //  - A low cover (a stall's awning, a porch roof) comes off whole.
    //  - Scenery (a tree, a prop) is cut off above its foot.
    // What is cut is cut at a level and capped; the rest stays solid: nothing
    // is thinned and nothing is seen through. An opening comes and goes over
    // a few frames and stays a while after it was last needed, so a pointer
    // crossing tiles does not make it flicker. A unit, what it holds, its
    // ring and its bar are never cut. All of it is worked out when the marks,
    // a unit's tile, the view's quarter or (by a few tiles) its place change;
    // between those a frame costs a few comparisons.

    /** How much of a wall in the way is left standing over the floor, in tiles. */
    View.OPEN_FOOT = 1.1;
    /** What stands lower than this over its tile's ground hides nobody; nor does what is narrower than `OPEN_THIN` (a post, a rail). */
    View.OPEN_TALL = 2.2;
    View.OPEN_THIN = 0.8;
    /** Frames an opening takes to come or go, and frames it stays after it was last needed. */
    View.OPEN_EASE = 9;
    View.OPEN_HOLD = 40;
    /** How far the camera moves, in tiles, before the sight lines are walked again. */
    View.OPEN_EYE = 3;
    /** How much of scenery in the way is left over its foot, in tiles. */
    View.OPEN_STUMP = 0.9;
    /** How far past a wall cut low the cut reaches, in tiles: the casings, shutters and boxes that hang on it go with it. */
    View.OPEN_TRIM = 0.35;
    /** How far it reaches on a side where a wall is left standing: a door's casing on that face, no more. The standing wall is capped that far in. */
    View.OPEN_FACE = 0.06;
    /** The pieces a cut through them is capped over: what fills its tile (a pane's wall has the cap; the pane none). */
    View.OPEN_CAPPED = ["wall", "block", "window"];
    /** How many places are asked about at once (units first, then the cursor, then the marks). */
    View.OPEN_SUBJECTS = 512;

    const openSubjects = { n: 0, x: new Float32Array(512), y: new Float32Array(512), h: new Float32Array(512), tall: new Float32Array(512), kind: new Uint8Array(512) };
    const openHits = [], openNeeded = [], openRuns = [];
    const smooth = t => t * t * (3 - 2 * t);
    /** Where on its way an ease is that has come `v` of the whole (the other way round of `smooth`). */
    const unsmooth = v => 0.5 - Math.sin(Math.asin(1 - 2 * clamp(v, 0, 1)) / 3);

    /** How high over its tile's ground a piece can hide someone (its top), or a low number when it hides nobody: the land, a post, a rail. */
    function hidingTop(piece) {
        const R = Reactor3D, kind = piece.kind;
        if (kind === "rock" || Number.isFinite(piece.rockTop) || kind === "pillar" || kind === "fence" || kind === "ladder") return -1e9;
        if (kind === "floor") return piece.z + (R.PIECE_FLOOR_THICKNESS || 0.1);
        if (R.isShapeKind(kind)) return R.shapeFrame(piece).narrow < View.OPEN_THIN ? -1e9 : piece.z + R.shapeSize(piece)[1];
        if (kind === "door") return piece.z + R.PIECE_STOREY;
        return piece.z + R.pieceHeight(kind);
    }

    /** The map's tiles that carry something tall enough to hide a unit, and the buildings they make up (found as they are met). Made once per map. */
    function openGrid() {
        const R = Reactor3D, index = R.pieceIndex && typeof $dataMap !== "undefined" && $dataMap ? R.pieceIndex($dataMap) : null;
        if (!index) { cut.grid = null; return null; }
        if (cut.grid && cut.grid.index === index) return cut.grid;
        const w = $dataMap.width, h = $dataMap.height;
        const top = new Float32Array(w * h).fill(-1e9), base = new Float32Array(w * h), rock = new Float32Array(w * h).fill(-1e9);
        let most = -1e9;
        for (const [key, stack] of index.cells) {
            const x = key % 65536, y = (key - x) / 65536;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const at = y * w + x;
            let tall = -1e9;
            for (const piece of stack) {
                const t = hidingTop(piece);
                if (t > tall) tall = t;
                // A rock is land: it is not opened, and the camera turns for it as for a hill (`View.landHides`).
                if (Number.isFinite(piece.rockTop)) rock[at] = Math.max(rock[at], R.pieceBaseAt($dataMap, x, y) + piece.rockTop);
            }
            if (tall < View.OPEN_TALL) continue;
            base[at] = R.pieceBaseAt($dataMap, x, y);
            top[at] = base[at] + tall;
            if (top[at] > most) most = top[at];
        }
        cut.memo.clear();
        cut.grid = { index, w, h, top, base, rock, most, id: new Int32Array(w * h), tag: new Int32Array(w * h), state: new Uint8Array(w * h), clusters: [null], token: 0 };
        return cut.grid;
    }

    /** Whether a point is inside something built that hides (the land and thin things aside). A floor counts when it lies over `floor`: the storey above. */
    function builtAt(grid, x, y, wx, wy, wz, floor) {
        const stack = grid.index.cells.get(y * 65536 + x);
        if (!stack) return false;
        const R = Reactor3D, base = grid.base[y * grid.w + x], h = wy - base;
        for (const piece of stack) {
            const kind = piece.kind;
            if (kind === "rock" || Number.isFinite(piece.rockTop) || kind === "pillar" || kind === "fence" || kind === "ladder") continue;
            if (kind === "floor") { if (base + piece.z > floor + 1 && Math.abs(h - piece.z - 0.05) <= 0.22) return true; continue; }
            if (kind === "doorway") { if (h >= piece.z + R.PIECE_STOREY - R.DOORWAY_LINTEL && h <= piece.z + R.PIECE_STOREY) return true; continue; }
            if (kind === "door") { if (R.doorSolidAt(piece, h, false)) return true; continue; }
            if (R.isShapeKind(kind)) { if (R.shapeHolds($dataMap, piece, wx, wy, wz, base, View.OPEN_THIN)) return true; continue; }
            if (h < piece.z || h > piece.z + R.pieceHeight(kind)) continue;
            if ((kind === "stair" || kind === "ramp") && h > R.pieceTop(piece, wx - x, wz - y)) continue;
            return true;
        }
        return false;
    }

    /** The building (or stall, or tower) a tile is part of: the tiles joined to it that carry something tall. */
    function clusterAt(grid, at) {
        if (grid.id[at]) return grid.clusters[grid.id[at]];
        const w = grid.w, h = grid.h, top = grid.top, id = grid.id, number = grid.clusters.length, cells = [at];
        const cluster = { id: number, cells: null, x0: w, y0: h, x1: -1, y1: -1, top: -1e9, base: 1e9, rects: null, shown: false, e: 0, goal: 0, last: -1e9,
            stamp: -1, wanted: -1, inside: -1, stand: -1e9, floorMin: Infinity, hits: [], level: 1e9, lowLevel: 1e9, storey: -1, floor: 0, count: 0,
            runs: new Map(), runOf: new Map(), live: [], cover: NaN, fronts: EMPTY, frontKey: NaN, frontsFor: null, frontRuns: EMPTY };
        id[at] = number;
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i], x = c % w, y = (c - x) / w;
            if (x < cluster.x0) cluster.x0 = x;
            if (x > cluster.x1) cluster.x1 = x;
            if (y < cluster.y0) cluster.y0 = y;
            if (y > cluster.y1) cluster.y1 = y;
            if (top[c] > cluster.top) cluster.top = top[c];
            if (grid.base[c] < cluster.base) cluster.base = grid.base[c];
            if (cells.length >= 6000) continue;
            if (x > 0 && !id[c - 1] && top[c - 1] > -1e8) { id[c - 1] = number; cells.push(c - 1); }
            if (x < w - 1 && !id[c + 1] && top[c + 1] > -1e8) { id[c + 1] = number; cells.push(c + 1); }
            if (y > 0 && !id[c - w] && top[c - w] > -1e8) { id[c - w] = number; cells.push(c - w); }
            if (y < h - 1 && !id[c + w] && top[c + w] > -1e8) { id[c + w] = number; cells.push(c + w); }
        }
        cluster.cells = Int32Array.from(cells);
        grid.clusters.push(cluster);
        return cluster;
    }

    /** Tiles (the first `count` of `cells`, all inside the box given) as few boxes as cover them: `[x0, y0, x1, y1]`, tiles inclusive. Null with more than `most`. */
    function tileBoxes(grid, cells, count, x0, y0, x1, y1, most) {
        const w = grid.w, bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (!(bw > 0 && bh > 0)) return [];
        if (!cut.boxScratch || cut.boxScratch.length < bw * bh) cut.boxScratch = new Uint8Array(Math.max(4096, bw * bh));
        const on = cut.boxScratch;
        on.fill(0, 0, bw * bh);
        for (let i = 0; i < count; i++) { const c = cells[i], x = c % w, y = (c - x) / w; on[(y - y0) * bw + x - x0] = 1; }
        const boxes = [];
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                if (on[y * bw + x] !== 1) continue;
                let wide = 1, deep = 1;
                while (x + wide < bw && on[y * bw + x + wide] === 1) wide++;
                for (; y + deep < bh; deep++) {
                    let whole = true;
                    for (let k = 0; k < wide && whole; k++) whole = on[(y + deep) * bw + x + k] === 1;
                    if (!whole) break;
                }
                for (let j = 0; j < deep; j++) for (let k = 0; k < wide; k++) on[(y + j) * bw + x + k] = 2;
                if (boxes.length >= most) return null;
                boxes.push([x0 + x, y0 + y, x0 + x + wide - 1, y0 + y + deep - 1]);
            }
        }
        return boxes;
    }

    /**
     * What the sight line from a point to the camera passes through that is built: `[building, height, tile, ...]`
     * into `out`, nearest the point first, each tile once.
     */
    function sightHits(grid, sx, sy, sz, floor, out) {
        const ex = cut.ex - sx, ey = cut.ey - sy, ez = cut.ez - sz, far = Math.hypot(ex, ey, ez);
        if (!(far > 1) || !(ey > 0.01)) return out;
        const dx = ex / far, dy = ey / far, dz = ez / far, w = grid.w, h = grid.h, top = grid.top;
        // No further than the tallest thing built on the map stands.
        const reach = Math.min(far - 1, (grid.most - sy) / dy);
        let last = -1;
        for (let t = 0.35; t < reach; t += 0.4) {
            const px = sx + dx * t, pz = sz + dz * t, py = sy + dy * t, cx = Math.floor(px), cz = Math.floor(pz);
            if (cx < 0 || cz < 0 || cx >= w || cz >= h) break;
            const at = cz * w + cx;
            if (at === last || py > top[at] || !builtAt(grid, cx, cz, px, py, pz, floor)) continue;
            last = at;
            out.push(clusterAt(grid, at).id, py, at);
            if (out.length >= 120) break;
        }
        return out;
    }

    /** The walls of a building that stand between the camera and its own rooms on a floor, as tiles: kept per floor and quarter. */
    function frontsOf(grid, cluster, floor, lx, ly) {
        const key = Math.round(floor * 4) * 4 + (lx > 0 ? 2 : 0) + (ly > 0 ? 1 : 0);
        if (cluster.frontKey === key) return cluster.fronts;
        const w = grid.w, h = grid.h, state = grid.state, cells = cluster.cells, chest = floor + 1.6;
        // 2: a wall at the height of a unit's chest; 1: open there (3: a room, 4: not one, once asked); 0: not this building's.
        for (const c of cells) { const x = c % w, y = (c - x) / w; state[c] = builtAt(grid, x, y, x + 0.5, chest, y + 0.5, Infinity) ? 2 : 1; }
        // A room: open, with a wall of the building met on three sides or more before the building ends (an eave's strip and a porch are not).
        const room = c => {
            let sides = 0;
            for (let d = 0; d < 4; d++) {
                const step = d === 0 ? 1 : d === 1 ? -1 : d === 2 ? w : -w;
                for (let k = 1, n = c + step; k < 40; k++, n += step) {
                    if (n < 0 || n >= w * h || (d < 2 && Math.floor(n / w) !== Math.floor(c / w)) || !state[n]) break;
                    if (state[n] === 2) { sides++; break; }
                }
            }
            return sides >= 3;
        };
        const fronts = [];
        for (const c of cells) {
            if (state[c] !== 2) continue;
            const x = c % w, y = (c - x) / w;
            // A wall as high as the storey hides the ground for four tiles behind it, as the camera looks.
            for (let k = 1; k <= 4; k++) {
                const nx = x + lx * k, ny = y + ly * k;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
                const n = ny * w + nx;
                if (state[n] === 1) state[n] = room(n) ? 3 : 4;
                if (state[n] === 3) { fronts.push(c); break; }
            }
        }
        for (const c of cells) state[c] = 0;
        cluster.frontKey = key;
        cluster.fronts = fronts;
        return fronts;
    }

    /** Whether a tile carries a wall of the storey whose floor is given: something built at the height of a unit's chest. */
    function wallAt(grid, x, y, floor) { return builtAt(grid, x, y, x + 0.5, floor + 1.6, y + 0.5, Infinity); }

    /** Whether a tile carries a door or a doorway of the storey whose floor is given: part of the wall it stands in. */
    function doorAt(grid, x, y, floor) {
        const stack = grid.index.cells.get(y * 65536 + x);
        if (!stack) return false;
        const base = grid.base[y * grid.w + x];
        for (const piece of stack) if ((piece.kind === "doorway" || piece.kind === "door") && Math.abs(base + piece.z - floor) < 1) return true;
        return false;
    }

    /**
     * The run of wall a tile is part of on a storey: the straight line of the building's wall through it, doors
     * and doorways along it included, the longer way where two cross, and as thick as the wall is (the lines
     * beside it that begin and end where it does: a thick wall and a solid block are one run). A wall in the way
     * comes down by the run, so what is cut never depends on which of its tiles was asked about. Each run has its
     * own coming and going (`e`, `goal`) and its own time to stay (`last`). Kept per building and storey.
     */
    function runAt(grid, cluster, at, floor) {
        let run = cluster.runOf.get(at);
        if (run) return run;
        const w = grid.w, h = grid.h, x = at % w, y = (at - x) / w, id = cluster.id;
        const part = (px, py) => px >= 0 && py >= 0 && px < w && py < h && grid.id[py * w + px] === id && (wallAt(grid, px, py, floor) || doorAt(grid, px, py, floor));
        let x0 = x, x1 = x, y0 = y, y1 = y;
        while (part(x0 - 1, y)) x0--;
        while (part(x1 + 1, y)) x1++;
        while (part(x, y0 - 1)) y0--;
        while (part(x, y1 + 1)) y1++;
        const across = x1 - x0 >= y1 - y0;
        if (across) {
            const same = row => { if (part(x0 - 1, row) || part(x1 + 1, row)) return false; for (let k = x0; k <= x1; k++) if (!part(k, row)) return false; return true; };
            y0 = y1 = y;
            while (same(y0 - 1)) y0--;
            while (same(y1 + 1)) y1++;
        } else {
            const same = column => { if (part(column, y0 - 1) || part(column, y1 + 1)) return false; for (let k = y0; k <= y1; k++) if (!part(column, k)) return false; return true; };
            x0 = x1 = x;
            while (same(x0 - 1)) x0--;
            while (same(x1 + 1)) x1++;
        }
        const key = (y0 * w + x0) * 2 + (across ? 0 : 1);
        run = cluster.runs.get(key);
        if (!run) {
            run = { x0, y0, x1, y1, box: [0, 0, 0, 0], e: 0, goal: 0, last: 0, stamp: -1, met: -1, asked: false, on: false, laid: false, had: false, front: false };
            cluster.runs.set(key, run);
        }
        cluster.runOf.set(at, run);
        return run;
    }

    /** The runs of wall that stand between the camera and a building's own rooms on a floor: kept with `frontsOf`. */
    function frontRunsOf(grid, cluster, floor, lx, ly) {
        const fronts = frontsOf(grid, cluster, floor, lx, ly);
        if (cluster.frontsFor === fronts) return cluster.frontRuns;
        const runs = [];
        for (const at of fronts) { const run = runAt(grid, cluster, at, floor); if (!runs.includes(run)) runs.push(run); }
        cluster.frontsFor = fronts;
        cluster.frontRuns = runs;
        return runs;
    }

    /**
     * The level something with no wall to it comes off above, whole (an awning, a stall's roof: what is over a
     * unit's head with nothing under it): a little under its lowest piece, the same wherever it is met. A huge
     * number for anything with a wall. Worked out once per building.
     */
    function coverOf(grid, cluster) {
        if (cluster.cover === cluster.cover) return cluster.cover;
        const w = grid.w, floor = cluster.base + (Reactor3D.PIECE_FLOOR_THICKNESS || 0.1);
        let under = Infinity;
        for (const c of cluster.cells) {
            const x = c % w, y = (c - x) / w, stack = grid.index.cells.get(y * 65536 + x);
            if (wallAt(grid, x, y, floor)) return (cluster.cover = Infinity);
            if (stack) for (const piece of stack) if (piece.z > 1.6 && hidingTop(piece) > -1e8 && grid.base[c] + piece.z < under) under = grid.base[c] + piece.z;
        }
        return (cluster.cover = under < 1e8 ? Math.floor((under - 0.25) * 4) / 4 : Infinity);
    }

    /** A run of wall asked for at this look: it comes down, or stays down. Returns whether what is laid changes. */
    function wantRun(cluster, run, stamp, frame, front) {
        run.stamp = stamp; run.last = frame; run.asked = true;
        if (front) run.front = true;
        if (!run.on) { run.on = true; run.e = 0; run.goal = 1; run.laid = false; cluster.live.push(run); return true; }
        if (!run.goal) { run.goal = 1; return true; }
        return false;
    }

    /** A building's walls cut low are walls again. */
    function dropRuns(cluster) {
        for (const run of cluster.live) { run.on = false; run.e = 0; run.goal = 0; run.laid = false; run.front = false; }
        cluster.live.length = 0;
    }

    /** A building is whole again. */
    function shutBuilding(cluster) {
        cluster.shown = false; cluster.level = 1e9; cluster.lowLevel = 1e9; cluster.count = 0;
        dropRuns(cluster);
    }

    /** The height a tile is cut at by what is open now (a huge number: not at all). */
    function openLevelAt(grid, at) {
        const number = grid.id[at], cluster = number ? grid.clusters[number] : null;
        if (!cluster || !cluster.shown || !cluster.count) return 1e9;
        const tag = grid.tag[at];
        return tag === cut.lowTag || tag === cut.lowTag + 1 ? Math.min(cluster.level, cluster.lowLevel) : cluster.level;
    }
    /** For whoever asks what the view shows: the height everything built on a tile is cut away above (a huge number when it is whole). */
    View.openAt = function(x, y) {
        const grid = cut.grid;
        return grid && x >= 0 && y >= 0 && x < grid.w && y < grid.h ? openLevelAt(grid, y * grid.w + x) : 1e9;
    };

    /**
     * What is open now, for whoever asks (a script, a test): `buildings`, each with its box of tiles, the level its
     * storey is cut at, the level its walls in the way are cut at, how many tiles of them (`lows`) in how many
     * runs (`runs`), how many runs wait standing for want of room (`uncut`), and how far it has come (`e`, 0 to 1)
     * toward `goal`; `scenery`, how many models are cut off; `boxes`, how many the shaders are told.
     */
    View.openings = function() {
        const tiles = cluster => { let n = 0; if (cut.grid) for (const at of cluster.cells) if (cut.grid.tag[at] === cut.lowTag || cut.grid.tag[at] === cut.lowTag + 1) n++; return n; };
        const laid = (cluster, on) => { let n = 0; for (const run of cluster.live) if (run.laid === on) n++; return n; };
        return {
            buildings: cut.open.map(cluster => ({ id: cluster.id, box: [cluster.x0, cluster.y0, cluster.x1, cluster.y1], top: cluster.top, level: cluster.level,
                low: cluster.lowLevel, lows: cluster.count ? tiles(cluster) : 0, runs: laid(cluster, true), uncut: laid(cluster, false), whole: !cluster.count, e: cluster.e, goal: cluster.goal })),
            scenery: cut.props.size, boxes: Reactor3D.cutawayUniforms().rrOpenCount.value, caps: cut.caps.length
        };
    };

    /** Who and what must be seen, into `openSubjects`: every unit, the cursor, and the places the unit in hand can go to or strike. */
    function collectSubjects(fight) {
        const S = openSubjects, most = Math.min(S.x.length, View.OPEN_SUBJECTS);
        S.n = 0;
        const add = (x, y, h, tall, kind) => { if (S.n >= most) return; const i = S.n++; S.x[i] = x; S.y[i] = y; S.h[i] = h; S.tall[i] = tall; S.kind[i] = kind; };
        for (const unit of fight._units) {
            if (unit.gone) continue;
            const c = fight.character(unit);
            if (!c || (unit.team !== "neutral" && !fight.isAlive(unit))) continue;
            const h = G.heightOf(c);
            if (!F.isBig(unit)) { add(c.x + 0.5, c.y + 0.5, h, 2.6, 1); continue; }
            // A big body: its middle and its four corners, as tall as it is.
            const f = F.footprint(unit), tall = Math.max(1.6, F.unitHeight(unit) * 0.85), x0 = c.x + f.ox + 0.5, y0 = c.y + f.oy + 0.5, x1 = x0 + f.w - 1, y1 = y0 + f.h - 1;
            add((x0 + x1) / 2, (y0 + y1) / 2, h, tall, 1);
            add(x0, y0, h, tall, 4); add(x1, y0, h, tall, 4); add(x0, y1, h, tall, 4); add(x1, y1, h, tall, 4);
        }
        const cursor = fight.cursor(), near = typeof $gamePlayer !== "undefined" && $gamePlayer ? $gamePlayer._reactorGround : undefined;
        if (cursor) add(cursor.x + 0.5, cursor.y + 0.5, Number.isFinite(cursor.h) ? cursor.h : Reactor3D.groundHeightAt($dataMap, cursor.x + 0.5, cursor.y + 0.5, near) || 0, 0, 2);
        const K = M.KINDS;
        for (let i = 0; i < M.count && S.n < most; i++) {
            const kind = markKind[i];
            // Where the other side might come or strike is told, not opened: a whole village would stand open.
            if (kind === K.tread || kind === K.threat || kind === K.cursor) continue;
            add(markX[i] + 0.5, markY[i] + 0.5, Number.isFinite(markH[i]) ? markH[i] : Reactor3D.groundHeightAt($dataMap, markX[i] + 0.5, markY[i] + 0.5, near) || 0, 0, 3);
        }
    }

    /** One sight line's meetings. A tile's own (from its middle, at a unit's feet, chest or head) are kept until the camera has moved or the map's pieces changed. */
    function hitsFor(grid, x, y, h, rise) {
        if (x % 1 !== 0.5 || y % 1 !== 0.5 || (rise !== 1.5 && rise !== 2.6 && rise !== 0.3)) { openHits.length = 0; return sightHits(grid, x, h + rise, y, h, openHits); }
        const key = ((Math.floor(x) + Math.floor(y) * 4096) * 1024 + clamp(Math.round(h * 4) + 256, 0, 1023)) * 4 + (rise > 2 ? 1 : rise < 1 ? 2 : 0);
        let hits = cut.memo.get(key);
        if (!hits) {
            if (cut.memo.size > 6000) cut.memo.clear();
            cut.memo.set(key, hits = sightHits(grid, x, h + rise, y, h, []));
        }
        return hits;
    }

    /**
     * Works out what is in the way now and what each opening is: called when something changed, never per frame.
     * A building in the way is opened for the lowest floor asked about, but never under someone who stands in
     * or on it higher up: nothing a unit stands on is taken from under it.
     */
    View.refreshOpenings = function(fight, frame) {
        const grid = openGrid(), R = Reactor3D;
        cut.last = frame;
        const stamp = ++cut.stamp, needed = openNeeded;
        needed.length = 0;
        collectSubjects(fight);
        const S = openSubjects;
        if (grid) {
            const note = (hits, floor, least) => {
                for (let i = 0; i < hits.length; i += 3) {
                    if (hits[i + 1] < least) continue;
                    const cluster = grid.clusters[hits[i]];
                    if (cluster.stamp !== stamp) { cluster.stamp = stamp; cluster.stand = -1e9; cluster.floorMin = Infinity; cluster.hits.length = 0; }
                    if (cluster.wanted !== stamp) { cluster.wanted = stamp; needed.push(cluster); }
                    if (floor < cluster.floorMin) cluster.floorMin = floor;
                    if (cluster.hits.length < 900) cluster.hits.push(hits[i + 2], hits[i + 1], floor);
                }
            };
            for (let i = 0; i < S.n; i++) {
                const x = S.x[i], y = S.y[i], h = S.h[i], kind = S.kind[i];
                // Whoever is in or on a building: its rooms are what is looked into, and a unit or the cursor holds its floor.
                const cx = Math.floor(x), cy = Math.floor(y), at = cx >= 0 && cy >= 0 && cx < grid.w && cy < grid.h ? cy * grid.w + cx : -1;
                if (at >= 0 && grid.top[at] > -1e8) {
                    const own = clusterAt(grid, at);
                    if (own.stamp !== stamp) { own.stamp = stamp; own.stand = -1e9; own.floorMin = Infinity; own.hits.length = 0; }
                    own.inside = stamp;
                    if ((kind === 1 || kind === 2) && h > own.stand) own.stand = h;
                }
                // A unit by its chest and its head, and by its feet where what is in the way stands as high as its chest (what
                // it is seen over, a rim, a bench, a wall cut to its foot, hides nobody); a place by where a unit's chest would be.
                note(hitsFor(grid, x, y, h, 1.5), h, -1e9);
                if (S.tall[i] > 0) { note(hitsFor(grid, x, y, h, S.tall[i]), h, -1e9); note(hitsFor(grid, x, y, h, 0.3), h, h + 1.6); }
            }
        }
        const view = fight._tac && fight._tac.view, look = view ? View.direction(view.yaw) : null;
        const lx = look && look.dx < 0 ? -1 : 1, ly = look && look.dz < 0 ? -1 : 1;
        let changed = false, due = Infinity;
        for (const cluster of needed) {
            // The storey shown, counted from the ground the building stands on: the one whoever stands highest in or on
            // it is in, else the lowest one asked about. Its floor is the building's own, never the stander's: someone
            // on a table, a crate or a stair lifts no wall over whoever stands on the floor beside them.
            const base = cluster.base, deep = R.PIECE_STOREY, drop = R.CUTAWAY_DROP;
            const storey = Math.max(0, Math.floor(((cluster.stand > -1e8 ? cluster.stand : cluster.floorMin) + 1 - base) / deep + 1e-6));
            const floor = base + storey * deep + (R.PIECE_FLOOR_THICKNESS || 0.1), foot = floor + View.OPEN_FOOT;
            // Cut under that storey's top.
            const own = base + (storey + 1) * deep - drop;
            const w = grid.w, hits = cluster.hits, inWay = openRuns;
            inWay.length = 0;
            // Another storey than was shown: its walls are other walls, and what was decided for the last one is over.
            const fresh = cluster.storey !== storey;
            if (fresh) {
                if (cluster.live.length) changed = true;
                dropRuns(cluster);
                cluster.runs.clear(); cluster.runOf.clear(); cluster.frontsFor = null;
                cluster.storey = storey; cluster.floor = floor;
            }
            // Something with no wall to it (an awning, a stall's roof) comes off whole, at its own level.
            const cover = storey === 0 ? coverOf(grid, cluster) : Infinity;
            let level = Infinity;
            for (let i = 0; i < hits.length; i += 3) {
                const at = hits[i], py = hits[i + 1];
                // Under the floor shown: someone lower down asked, and whoever stands higher keeps the floor.
                if (py < floor + 1) continue;
                // A storey further up in the way goes from there up; what is under it stays.
                if (py > own) { level = Math.min(level, Math.max(own, base + Math.floor((py - base) / deep + 1e-6) * deep - drop)); continue; }
                if (cover < 1e8) { level = Math.min(level, cover); continue; }
                const x = at % w, y = (at - x) / w;
                // Met under the storey's cut and no wall (a stair, a shelf, a board on the eave): left as it is.
                if (!wallAt(grid, x, y, floor)) continue;
                // A wall where it hides someone comes down by the run it is part of.
                const run = runAt(grid, cluster, at, floor);
                if (run.met !== stamp) { run.met = stamp; inWay.push(run); }
            }
            // A wall cut low has no storey left over it.
            if (inWay.length) level = Math.min(level, own);
            // Nothing of it is in the way of the floor shown (it only hid someone lower, under whoever holds it).
            if (!(level < 1e8)) { cluster.wanted = -1; continue; }
            // What was opened stays opened as long as the building is: its level only ever comes down.
            if (!fresh) level = Math.min(level, cluster.level);
            // With someone in its rooms every wall between them and the camera comes down; then the walls that hide someone.
            if (cluster.inside === stamp && level <= own + 1e-6) for (const run of frontRunsOf(grid, cluster, floor, lx, ly)) if (wantRun(cluster, run, stamp, frame, true)) changed = true;
            for (const run of inWay) if (wantRun(cluster, run, stamp, frame, false)) changed = true;
            // A run no longer in the way stays down a while, then is a wall again.
            for (const run of cluster.live) {
                if (run.stamp === stamp) continue;
                if (run.asked) { run.asked = false; run.last = frame; }
                if (frame - run.last >= View.OPEN_HOLD || frame < run.last) { if (run.goal) { run.goal = 0; changed = true; } }
                else due = Math.min(due, run.last + View.OPEN_HOLD);
            }
            if (level !== cluster.level || foot !== cluster.lowLevel) {
                // A level that comes down while the building stands open comes down from where the cut is now.
                if (cluster.shown && cluster.e > 0 && level < cluster.level) {
                    const from = cluster.top + 0.3, now = from + (cluster.level - from) * smooth(cluster.e);
                    cluster.e = unsmooth((from - now) / (from - level));
                }
                cluster.level = level; cluster.lowLevel = foot;
                changed = true;
            }
            // The footprint reaches a little past its outer tiles: a board along an eave's edge goes with the roof.
            if (!cluster.rects) {
                const eaves = box => [box[0] - View.OPEN_TRIM, box[1] - View.OPEN_TRIM, box[2] + 1 + View.OPEN_TRIM, box[3] + 1 + View.OPEN_TRIM];
                cluster.rects = (tileBoxes(grid, cluster.cells, cluster.cells.length, cluster.x0, cluster.y0, cluster.x1, cluster.y1, 4) || [[cluster.x0, cluster.y0, cluster.x1, cluster.y1]]).map(eaves);
            }
            cluster.last = frame;
            cluster.asked = true;
            cluster.goal = 1;
            if (!cluster.shown) { cluster.shown = true; cut.open.push(cluster); changed = true; }
        }
        // What is no longer in the way stays a while, then goes.
        let moving = changed;
        for (const cluster of cut.open) {
            if (cluster.wanted !== stamp) {
                // Needed until this look (nothing had changed since the last one): its time runs from now.
                if (cluster.asked) { cluster.asked = false; cluster.last = frame; }
                if (frame - cluster.last >= View.OPEN_HOLD || frame < cluster.last) cluster.goal = 0;
                else due = Math.min(due, cluster.last + View.OPEN_HOLD);
            }
            if (cluster.e !== cluster.goal) moving = true;
        }
        if (View.refreshScenery(fight, frame)) moving = true;
        for (const prop of cut.props.values()) if (prop.goal && prop.wanted !== stamp) due = Math.min(due, prop.last + View.OPEN_HOLD);
        cut.due = due;
        if (moving) cut.easing = true;
        if (changed) layOpenings();
    };

    /**
     * A run's box as the shaders are told it: its tiles, and a little past its faces (`View.OPEN_TRIM`) so the
     * casings, shutters and boxes that hang on it go with it; on a side where a wall is left standing beside it,
     * only as far as a door's casing stands off the face (`View.OPEN_FACE`); and where the roof's overhang is all
     * that lies beyond (the building's own tiles, open, its edge), across the overhang: the board along an eave
     * lower than the storey's cut does not hang there over a wall cut to its foot.
     */
    function runBox(grid, cluster, run, token) {
        const w = grid.w, h = grid.h, trim = View.OPEN_TRIM, face = View.OPEN_FACE, floor = cluster.floor, id = cluster.id;
        const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
        const own = (x, y) => on(x, y) && grid.id[y * w + x] === id;
        const stands = (x, y) => on(x, y) && grid.tag[y * w + x] !== token && wallAt(grid, x, y, floor);
        const eave = (x, y, bx, by) => own(x, y) && !wallAt(grid, x, y, floor) && !own(bx, by);
        let west = trim + 1, east = trim + 1, north = trim + 1, south = trim + 1;
        for (let y = run.y0; y <= run.y1; y++) {
            if (stands(run.x0 - 1, y)) west = face; else if (!eave(run.x0 - 1, y, run.x0 - 2, y)) west = Math.min(west, trim);
            if (stands(run.x1 + 1, y)) east = face; else if (!eave(run.x1 + 1, y, run.x1 + 2, y)) east = Math.min(east, trim);
        }
        for (let x = run.x0; x <= run.x1; x++) {
            if (stands(x, run.y0 - 1)) north = face; else if (!eave(x, run.y0 - 1, x, run.y0 - 2)) north = Math.min(north, trim);
            if (stands(x, run.y1 + 1)) south = face; else if (!eave(x, run.y1 + 1, x, run.y1 + 2)) south = Math.min(south, trim);
        }
        const box = run.box;
        box[0] = run.x0 - west; box[1] = run.y0 - north; box[2] = run.x1 + 1 + east; box[3] = run.y1 + 1 + south;
        return box;
    }

    /**
     * The openings as the map's shaders are told them: each building's footprint at its level, then its walls cut
     * low. There is room for `Reactor3D.CUTAWAY_OPENINGS` boxes: a building with no room for its footprint stays
     * whole, and a run of wall with no room stays standing until there is. A run keeps the room it has; of those
     * that wait, the ones between the camera and someone inside come first, then in the order they were asked
     * for. So what is short of room is left as it was built, and nothing that is down goes up to make room.
     */
    function layOpenings() {
        const shared = Reactor3D.cutawayUniforms(), boxes = shared.rrOpenBox.value, most = Math.min(Reactor3D.CUTAWAY_OPENINGS || 0, boxes.length / 4);
        const owner = cut.entryCluster, runs = cut.entryRun, grid = cut.grid;
        let n = 0;
        const put = (box, cluster, run) => { boxes[n * 4] = box[0]; boxes[n * 4 + 1] = box[1]; boxes[n * 4 + 2] = box[2]; boxes[n * 4 + 3] = box[3]; owner[n] = cluster; runs[n] = run; n++; };
        for (const cluster of cut.open) {
            cluster.count = n + cluster.rects.length <= most ? cluster.rects.length : 0;
            for (let i = 0; i < cluster.count; i++) put(cluster.rects[i], cluster, null);
        }
        // The footprints come first and every run lies inside its building's: the shaders ask them first.
        shared.rrOpenFeet.value = n;
        // The tiles cut low wear this lay's number: settled ones `token`, ones going back up `token + 1`.
        const token = grid ? (grid.token += 2) : -2;
        cut.lowTag = token;
        let room = most - n;
        for (let pass = 0; pass < 3; pass++) {
            for (const cluster of cut.open) {
                for (const run of cluster.live) {
                    if (pass === 0) { run.had = run.laid; run.laid = false; }
                    if (pass === 0 ? !run.had : run.had || (pass === 1) !== run.front) continue;
                    if (!cluster.count || room <= 0) continue;
                    run.laid = true;
                    room--;
                    for (let y = run.y0; y <= run.y1; y++) for (let x = run.x0; x <= run.x1; x++) {
                        const at = y * grid.w + x;
                        if (run.goal) grid.tag[at] = token; else if (grid.tag[at] !== token) grid.tag[at] = token + 1;
                    }
                }
            }
        }
        for (const cluster of cut.open) for (const run of cluster.live) if (run.laid) put(runBox(grid, cluster, run, token), cluster, run);
        owner.length = n; runs.length = n;
        shared.rrOpenCount.value = n;
        // Everything open lies inside one box: a piece outside it asks no further.
        const all = shared.rrOpenAll.value;
        all[0] = all[1] = 1e9; all[2] = all[3] = -1e9;
        for (let i = 0; i < n; i++) {
            if (boxes[i * 4] < all[0]) all[0] = boxes[i * 4];
            if (boxes[i * 4 + 1] < all[1]) all[1] = boxes[i * 4 + 1];
            if (boxes[i * 4 + 2] > all[2]) all[2] = boxes[i * 4 + 2];
            if (boxes[i * 4 + 3] > all[3]) all[3] = boxes[i * 4 + 3];
        }
        cut.capsDue = true;
        easeOpenings();
    }

    /**
     * Each opening's cut where its ease has it now: a building from over its top down to its level, a run of its
     * wall from there down to its foot. The lowest of them is told too: nothing under it is ever cut.
     */
    function easeOpenings() {
        const shared = Reactor3D.cutawayUniforms(), tops = shared.rrOpenTop.value, owner = cut.entryCluster, runs = cut.entryRun;
        let least = 1e9;
        for (let i = 0; i < owner.length; i++) {
            const cluster = owner[i], run = runs[i], from = cluster.top + 0.3;
            let top = from + (cluster.level - from) * smooth(cluster.e);
            if (run) top += (Math.min(cluster.level, cluster.lowLevel) - top) * smooth(run.e);
            tops[i] = top;
            // (As the shaders hold it.)
            if (tops[i] < least) least = tops[i];
        }
        shared.rrOpenLow.value = least;
        for (const prop of cut.props.values()) {
            const value = prop.e <= 0 ? 1e9 : prop.top + (prop.low - prop.top) * smooth(prop.e);
            for (const uniform of prop.uniforms) uniform.value = value;
        }
    }

    /** A frame of the openings' coming and going; what has gone is taken off the list. */
    function stepOpenings(scene) {
        const step = 1 / View.OPEN_EASE;
        let moving = false, gone = false;
        for (const cluster of cut.open) {
            if (cluster.e !== cluster.goal) {
                cluster.e = cluster.goal > cluster.e ? Math.min(1, cluster.e + step) : Math.max(0, cluster.e - step);
                if (cluster.e !== cluster.goal) moving = true;
                else if (!cluster.goal) gone = true;
            }
            for (const run of cluster.live) {
                // A run goes back up with its building; one with no room for it waits standing.
                const goal = cluster.goal ? run.goal : 0;
                if (run.laid && run.e !== goal) {
                    run.e = goal > run.e ? Math.min(1, run.e + step) : Math.max(0, run.e - step);
                    if (run.e !== goal) moving = true;
                }
                // Back up and no longer asked for: a wall again.
                if (!run.goal && (run.e === 0 || !run.laid)) { run.on = false; gone = true; }
            }
        }
        for (const prop of cut.props.values()) {
            if (prop.e === prop.goal) continue;
            prop.e = prop.goal > prop.e ? Math.min(1, prop.e + step) : Math.max(0, prop.e - step);
            if (prop.e !== prop.goal) moving = true;
        }
        cut.easing = moving;
        if (gone) {
            let kept = 0;
            for (const cluster of cut.open) {
                if (!(cluster.e > 0 || cluster.goal)) { shutBuilding(cluster); continue; }
                let live = 0;
                for (const run of cluster.live) { if (run.on) cluster.live[live++] = run; else { run.e = 0; run.laid = false; run.front = false; } }
                cluster.live.length = live;
                cut.open[kept++] = cluster;
            }
            cut.open.length = kept;
            layOpenings();
            // A run that waited for room may have it now: it comes down from the next frame.
            cut.easing = true;
        } else easeOpenings();
        for (const [object, prop] of cut.props) if (prop.e <= 0 && !prop.goal) cut.props.delete(object);
        if (cut.capsDue) layCaps(scene);
    }

    /**
     * Tops over what the cut passes through, and sides where a wall cut low meets one left standing, so everything
     * that stays reads as solid. One mesh per material in the pieces' group, wearing the piece's own material; laid
     * again when the openings change.
     */
    function layCaps(scene) {
        cut.capsDue = false;
        for (const mesh of cut.caps) { if (mesh.parent) mesh.parent.remove(mesh); mesh.geometry.dispose(); }
        cut.caps.length = 0;
        const grid = cut.grid, R = Reactor3D;
        if (!grid || !cut.open.length || !scene || !scene.piecesGroup || !scene.pieceMaterial || typeof THREE === "undefined") return;
        const kinds = View.OPEN_CAPPED, cellsOf = grid.index.cells, w = grid.w, h = grid.h, inset = View.OPEN_FACE + 0.004;
        const lists = new Map();
        const listOf = name => { let list = lists.get(name); if (!list) lists.set(name, list = { p: [], u: [] }); return list; };
        // A quad of four corners, counterclockwise as seen from its face; `uv` picks the two numbers of each corner the picture is laid by.
        const quad = (list, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, flat) => {
            list.p.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
            if (flat === 0) list.u.push(ax, az, bx, bz, cx, cz, ax, az, cx, cz, dx, dz);
            else if (flat === 1) list.u.push(az, ay, bz, by, cz, cy, az, ay, cz, cy, dz, dy);
            else list.u.push(ax, ay, bx, by, cx, cy, ax, ay, cx, cy, dx, dy);
        };
        for (const cluster of cut.open) {
            for (const at of cluster.cells) {
                const here = openLevelAt(grid, at);
                if (here >= 1e8) continue;
                const x = at % w, y = (at - x) / w, stack = cellsOf.get(y * 65536 + x), base = grid.base[at];
                let taken = false;
                if (stack) for (const piece of stack) {
                    if (!kinds.includes(piece.kind)) continue;
                    const foot = base + piece.z, head = foot + R.pieceHeight(piece.kind);
                    if (head > here + 1e-3) taken = true;
                    if (!(foot < here - 1e-3 && head > here + 1e-3)) continue;
                    const top = here - 0.01;
                    quad(listOf(piece.material), x, top, y, x, top, y + 1, x + 1, top, y + 1, x + 1, top, y, 0);
                }
                if (!taken) continue;
                // Beside it, a wall left standing higher: its side shows where this one was.
                for (let d = 0; d < 4; d++) {
                    const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const beside = ny * w + nx, there = openLevelAt(grid, beside);
                    if (!(there > here + 0.05)) continue;
                    const other = cellsOf.get(ny * 65536 + nx);
                    if (!other) continue;
                    const ground = grid.top[beside] > -1e8 ? grid.base[beside] : R.pieceBaseAt($dataMap, nx, ny);
                    for (const piece of other) {
                        if (!kinds.includes(piece.kind)) continue;
                        const lo = Math.max(here - 0.01, ground + piece.z), hi = Math.min(there >= 1e8 ? Infinity : there - 0.01, ground + piece.z + R.pieceHeight(piece.kind));
                        if (!(hi > lo + 0.02)) continue;
                        const list = listOf(piece.material);
                        // Inside the standing wall by as far as the low wall's cut reaches into it and a hair, so its face is asked as the wall's.
                        if (d === 0) { const px = nx + inset; quad(list, px, lo, ny, px, lo, ny + 1, px, hi, ny + 1, px, hi, ny, 1); }
                        else if (d === 1) { const px = nx + 1 - inset; quad(list, px, lo, ny + 1, px, lo, ny, px, hi, ny, px, hi, ny + 1, 1); }
                        else if (d === 2) { const pz = ny + inset; quad(list, nx + 1, lo, pz, nx, lo, pz, nx, hi, pz, nx + 1, hi, pz, 2); }
                        else { const pz = ny + 1 - inset; quad(list, nx, lo, pz, nx + 1, lo, pz, nx + 1, hi, pz, nx, hi, pz, 2); }
                    }
                }
            }
        }
        const group = scene.piecesGroup();
        for (const [name, list] of lists) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(list.p), 3));
            geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(list.u), 2));
            geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(list.p.length).fill(1), 3));
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, scene.pieceMaterial(name, null));
            mesh.userData.pieceCap = true;
            mesh.renderOrder = -5;
            group.add(mesh);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            cut.caps.push(mesh);
        }
    }

    /**
     * Scenery in the way (a tree, a prop: never a character) is cut off above its foot, and whole again when it
     * is not. Returns whether anything is coming or going.
     */
    View.refreshScenery = function(fight, frame) {
        const R = Reactor3D, S = openSubjects, stamp = cut.stamp;
        let moving = false;
        if (R.modelHolderFor && typeof THREE !== "undefined") {
            const base = R.PROP_EVENT_BASE || 10000;
            for (const event of $gameMap.events()) {
                if (!event || event._erased || event.eventId() < base) continue;
                const holder = R.modelHolderFor(event), object = holder && holder.object;
                if (!object || !object.parent || object.visible === false) continue;
                let box = cut.boxes.get(object);
                if (!box) {
                    const size = (cut.box3 || (cut.box3 = new THREE.Box3())).setFromObject(object);
                    if (!(size.max.y > size.min.y)) continue;
                    // A crown is rounder than its box: a little is taken off its sides.
                    const mx = (size.max.x - size.min.x) * 0.08, mz = (size.max.z - size.min.z) * 0.08;
                    box = { x0: size.min.x + mx, x1: size.max.x - mx, y0: size.min.y, y1: size.max.y, z0: size.min.z + mz, z1: size.max.z - mz };
                    cut.boxes.set(object, box);
                }
                const low = box.y0 + View.OPEN_STUMP;
                if (!(box.y1 > low + 1.2)) continue;
                let hides = false;
                for (let i = 0; i < S.n && !hides; i++) {
                    const sx = S.x[i], sy = S.h[i] + 1.5, sz = S.y[i], ex = cut.ex - sx, ey = cut.ey - sy, ez = cut.ez - sz, far = Math.hypot(ex, ey, ez);
                    if (!(far > 1)) continue;
                    hides = rayBox(sx, sy, sz, ex / far, ey / far, ez / far, box.x0, box.x1, low + 0.6, box.y1, box.z0, box.z1) < far;
                }
                let prop = cut.props.get(object);
                if (!hides) continue;
                if (!prop) {
                    prop = { uniforms: [], e: 0, goal: 1, last: frame, wanted: stamp, low, top: box.y1 + 0.3 };
                    object.traverse(node => {
                        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : EMPTY;
                        for (const material of materials) {
                            material.userData = material.userData || {};
                            prop.uniforms.push(material.userData.rrFightStump || (material.userData.rrFightStump = { value: 1e9 }));
                        }
                    });
                    cut.props.set(object, prop);
                }
                prop.goal = 1; prop.last = frame; prop.wanted = stamp; prop.asked = true;
            }
        }
        for (const [object, prop] of cut.props) {
            if (prop.wanted !== stamp && prop.goal) {
                if (prop.asked) { prop.asked = false; prop.last = frame; }
                if (!object.parent || frame - prop.last >= View.OPEN_HOLD || frame < prop.last) prop.goal = 0;
            }
            if (prop.e !== prop.goal) moving = true;
        }
        return moving;
    };

    /** Everything opened shuts (the view is somewhere else, the battle is over): over a few frames, or at once with `now`. */
    View.closeOpenings = function(scene, now) {
        if (!cut.open.length && !cut.props.size) return;
        for (const cluster of cut.open) { cluster.goal = 0; if (now) cluster.e = 0; }
        for (const prop of cut.props.values()) { prop.goal = 0; if (now) prop.e = 0; }
        cut.due = Infinity;
        if (!now) { cut.easing = true; return; }
        for (const cluster of cut.open) shutBuilding(cluster);
        cut.open.length = 0;
        layOpenings();
        cut.props.clear();
        layCaps(scene);
        cut.easing = false;
    };

    /**
     * Each frame the map's cutaway is asked for: `own`, the tactical camera looks and the openings follow what
     * must be seen; `keep`, a director's shot keeps them as they were; neither, they shut. `changed`: the marks
     * or the battle did.
     */
    View.updateOpenings = function(scene, camera, own, keep, changed) {
        const frame = frameNow();
        // Another map's scene: what the last one wore went with it.
        if (cut.scene !== scene) {
            for (const cluster of cut.open) { shutBuilding(cluster); cluster.e = 0; cluster.goal = 0; }
            for (const mesh of cut.caps) mesh.geometry.dispose();
            for (const prop of cut.props.values()) for (const uniform of prop.uniforms) uniform.value = 1e9;
            cut.open.length = 0; cut.caps.length = 0; cut.props.clear(); cut.memo.clear();
            cut.scene = scene; cut.ex = 1e9; cut.due = Infinity; cut.easing = false; cut.capsDue = false;
            cut.entryCluster.length = 0; cut.entryRun.length = 0;
            Reactor3D.cutawayUniforms().rrOpenCount.value = 0;
            Reactor3D.cutawayUniforms().rrOpenFeet.value = 0;
        }
        if (!keep) View.closeOpenings(scene, false);
        else if (own && camera) {
            const eye = camera.getWorldPosition(cut.eye || (cut.eye = new THREE.Vector3()));
            const moved = Math.abs(eye.x - cut.ex) + Math.abs(eye.y - cut.ey) + Math.abs(eye.z - cut.ez) > View.OPEN_EYE;
            // On the beat while units walk; at once when the marks change; when an opening's time is up; when the camera has moved.
            if (changed || frame >= cut.due || frame < cut.last || (moved && frame - cut.last >= 4) || (frame % 12 === 0 && !$gameFight.awaitsPlayer())) {
                if (moved) { cut.ex = eye.x; cut.ey = eye.y; cut.ez = eye.z; cut.memo.clear(); }
                View.refreshOpenings($gameFight, frame);
            }
        }
        if (cut.easing) stepOpenings(scene);
        else if (cut.capsDue) layCaps(scene);
    };

    if (typeof Reactor3D !== "undefined" && Reactor3D && Reactor3D.MapScene && Reactor3D.MapScene.prototype.updateCutaway) {
        const updateCutaway = Reactor3D.MapScene.prototype.updateCutaway;
        Reactor3D.MapScene.prototype.updateCutaway = function(camera, mapData, character, others) {
            const own = View.active();
            // A director moving in from the tactical view and back out keeps the region open (Director.keepsRegion).
            let keep = own;
            if (!own && View._suspended && $gameFight.isTactical() && $gameFight.isHere() && $gameFight._tac && $gameFight._tac.view && $gameFight._tac.view.own) {
                const director = F.Director;
                try { keep = !!(director && director.keepsRegion && director.keepsRegion()); } catch (error) { keep = false; }
            }
            const changed = keep || cut.rev !== -1 ? View.cutRegion($gameFight, keep) : false;
            if (keep || cut.open.length || cut.props.size || cut.scene !== this) View.updateOpenings(this, camera, own, keep, changed);
            if (!own) return updateCutaway.call(this, camera, mapData, character, others);
            // The battle's openings are the whole cut: the map's own corridor to the player and its see-through pass rest.
            const result = updateCutaway.call(this, camera, mapData, null, null);
            if (this._cutState && this._cutState !== "none") {
                this._cutState = "none";
                if (this.updateCutCaps) this.updateCutCaps(mapData, 1e9, null);
                if (Reactor3D.Shadows && Reactor3D.Shadows.invalidate) Reactor3D.Shadows.invalidate();
            }
            return result;
        };
    }

    /** How far the view's keys move it each frame, in tiles (more when the view stands further back). */
    View.SLIDE = 0.3;

    /**
     * Move where the view looks across the screen: `right` and `ahead` are -1, 0 or 1, as the screen shows them
     * at any turn of the view (`yaw`, degrees: the camera's own when not given, none on a 2D map).
     */
    View.slide = function(fight, right, ahead, amount, yaw) {
        const tac = fight.tac();
        if (!tac.focus || (!right && !ahead)) return false;
        const live = View.live(), C = camera3D();
        if (!Number.isFinite(yaw)) yaw = live && C ? (live.cameraCurrent && Number.isFinite(live.cameraCurrent.yaw) ? live.cameraCurrent.yaw : C.currentState().yaw || 0) : 0;
        const turn = yaw * Math.PI / 180, sin = Math.sin(turn), cos = Math.cos(turn), scale = amount / Math.hypot(right, ahead);
        tac.focus.x = clamp(tac.focus.x + (cos * right + sin * ahead) * scale, 0, $gameMap.width() - 1);
        tac.focus.y = clamp(tac.focus.y + (sin * right - cos * ahead) * scale, 0, $gameMap.height() - 1);
        return true;
    };

    /** Move where the view looks by a screen direction (2/4/6/8), a little each frame: the pointer at the screen's edge. */
    View.pan = function(fight, d, amount) {
        const tac = fight.tac(), step = View.cursorStep(d);
        if (!tac.focus) return;
        tac.focus.x = clamp(tac.focus.x + step.x * amount, 0, $gameMap.width() - 1);
        tac.focus.y = clamp(tac.focus.y + step.y * amount, 0, $gameMap.height() - 1);
    };

    // The display follows the battle, not the leader's steps.
    const updateScroll = Game_Player.prototype.updateScroll;
    Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isTactical() && $gameFight.isHere()) return;
        updateScroll.call(this, lastScrolledX, lastScrolledY);
    };

    // A Transfer Player to another spot of the battle's map gathers the followers on the leader:
    // each takes the nearest free cell instead, so no two units share one.
    const performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        const transferring = this.isTransferring();
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        // The party leaves the map of a battle kept for its return: whoever of it was walking a way there is
        // solid and at its own pace on the map it goes to.
        if (transferring && fight && fight.isTactical() && fight.isHere() && this.newMapId() !== $gameMap.mapId()) {
            for (const unit of fight._units) {
                const character = unit.party && !unit.gone ? fight.character(unit) : null;
                if (!character) continue;
                const act = fight._act, mover = fight.moverOf(unit);
                if (act && act.unitId === unit.id && act.path) { character.setThrough(act.through); character.setMoveSpeed(act.speed); }
                if (mover) { character.setThrough(mover.through); character.setMoveSpeed(mover.speed); }
            }
        }
        performTransfer.call(this);
        if (!transferring || !fight || !fight.isHere()) return;
        for (const unit of fight._units) {
            if (!unit.party || unit.gone) continue;
            const character = fight.character(unit);
            if (!character) continue;
            if (character !== this) {
                const spot = fight.freeSpotNear(this.x, this.y, 1);
                if (spot) Game_CharacterBase.prototype.locate.call(character, spot.x, spot.y);
            }
            fight._inside[String(unit.id)] = [character.x, character.y];
            // A way it was walking led on from where it stood before: the walk ends where it was put.
            const act = fight._act, mover = fight.moverOf(unit);
            if (act && act.unitId === unit.id && act.path) act.path.length = 0;
            if (mover) { mover.path.length = 0; mover.plan = null; }
        }
        if (fight._tac) {
            const active = fight.activeUnit(), character = fight.character(active) || this;
            fight.setCursor(character.x, character.y, G.heightOf(character));
            fight.focusOn(character.x, character.y);
            if (fight._act && fight._act.origin && active) fight._act.locked = true;
            fight.touch();
        }
    };

    //-------------------------------------------------------------------------
    // The player's keys, mouse and touch. OK picks and confirms, Cancel steps
    // back, the arrows move the cursor as the screen shows it, the mouse
    // moves it by hovering and confirms with a click (a touch: one tap to
    // point, a second on the same cell to confirm). Page Up / Page Down turn
    // the tactical camera (elsewhere they go to the next unit or target), the
    // wheel zooms, Shift goes to the next unit or target, T shows what every
    // enemy reaches.

    const In = F.Input = { _skip: -1, _ate: -1, _px: -1, _py: -1, _key: -1, _ray: null, _point: null };
    const picked = { x: 0, y: 0, h: NaN, unit: false };
    // How much narrower than its cell a one-cell unit is to the pointer (each side), so the ground beside it can be pointed at.
    In.BODY_INSET = 0.18;

    /** A command used this frame's press: the keys are not read again until the next. */
    In.used = function() { In._skip = frameNow(); };

    // The key that shows what every enemy reaches (the `threat` action), where nothing else gives that action a key
    // and the key does nothing else: T.
    In.THREAT_KEY = 84;
    In.bindThreat = function(on) {
        if (typeof Input === "undefined" || !Input || !Input.keyMapper) return;
        if (on) {
            if (In._threatBound) return;
            In._threatBound = true;
            let given = false;
            for (const code in Input.keyMapper) if (Input.keyMapper[code] === "threat") { given = true; break; }
            if (!given && Input.keyMapper[In.THREAT_KEY] === undefined) { Input.keyMapper[In.THREAT_KEY] = "threat"; In._threatOwn = true; }
        } else {
            if (In._threatOwn && Input.keyMapper[In.THREAT_KEY] === "threat") delete Input.keyMapper[In.THREAT_KEY];
            In._threatBound = false; In._threatOwn = false;
        }
    };

    /**
     * T while a command, skill or item list is up (the map's keys are not read then): every enemy's reach is shown
     * and hidden as at any other of the player's stages. Called once a frame by the battle's update.
     */
    In.updateThreatKey = function(fight) {
        if (typeof Input === "undefined" || !Input || !Input.isTriggered) return;
        const act = fight._act, frame = frameNow();
        if (!act || !act.player || In._threatAt === frame || In._skip === frame) return;
        if (act.stage !== "command" && act.stage !== "skill" && act.stage !== "item") return;
        // The battle menu up: its own keys only.
        if (F.Windows && F.Windows.isMenuOpen && F.Windows.isMenuOpen()) return;
        if (!fight.awaitsPlayer() || !Input.isTriggered(F.key("threat"))) return;
        In._threatAt = frame;
        fight.toggleThreat();
        sound("playCursor");
    };

    /**
     * The unit a ray meets first (origin and direction in tiles: x east, y up, z south): a unit of one cell is a box
     * as tall as it stands, a bigger one its hull (`rayHull`). A hull met low (its rim) gives way to whoever of one
     * cell stands on the ground the ray comes down on: their feet and the ring under them are theirs, not the
     * hull's they stand by. The cell of its body nearest where the ray meets it and the height it stands at are
     * left in `picked`. Null when the ray meets nobody.
     */
    In.unitOnRay = function(fight, ox, oy, oz, dx, dy, dz) {
        let found = null, nearest = Infinity, low = false, floor = 0;
        for (const unit of fight._units) {
            if (unit.gone) continue;
            const c = fight.character(unit);
            if (!c || !(unit.team === "neutral" || fight.isAlive(unit))) continue;
            const f = F.footprint(unit);
            const y0 = G.heightOf(c) + (Number(c._reactorAir) || 0), tall = clamp(F.unitHeight(unit), 1, 8);
            let enter = Infinity, rim = false;
            if (f.w === 1 && f.h === 1) {
                const inset = In.BODY_INSET;
                enter = rayBox(ox, oy, oz, dx, dy, dz, c._realX + inset, c._realX + 1 - inset, y0, y0 + tall, c._realY + inset, c._realY + 1 - inset);
            } else {
                // A big body is met where its hull is: the model's own box, turned as the model is (the cells under it
                // where there is no model), and in it the mesh's own outline. The ground beside a hull and whoever
                // stands behind its low end are not the hull.
                const entry = footOf(unit), hull = entry && entry.hulls ? entry.hulls[facingIndex(c.direction())] : null;
                let px = ox, pz = oz, vx = dx, vz = dz, mx = c._realX + f.ox + f.w / 2, mz = c._realY + f.oy + f.h / 2, hx = f.w / 2, hz = f.h / 2;
                if (hull) {
                    const rx = ox - (c._realX + 0.5), rz = oz - (c._realY + 0.5);
                    px = rx * hull.cos - rz * hull.sin; pz = rx * hull.sin + rz * hull.cos;
                    vx = dx * hull.cos - dz * hull.sin; vz = dx * hull.sin + dz * hull.cos;
                    mx = hull.mx; mz = hull.mz; hx = hull.hx; hz = hull.hz;
                }
                enter = rayHull(px, oy, pz, vx, dy, vz, mx, mz, hx, hz, y0, tall, hull ? hull.mask : null);
                rim = hullLow;
            }
            if (enter >= nearest) continue;
            nearest = enter; found = unit; low = rim; floor = y0;
        }
        if (!found) return null;
        if (low && dy < -1e-6) {
            const t = (floor - oy) / dy, gx = Math.floor(ox + dx * t), gy = Math.floor(oz + dz * t);
            const other = t > 0 ? fight.unitAt(gx, gy, found, floor) : null;
            if (other && !F.isBig(other) && Math.abs(G.heightOf(fight.character(other)) - floor) < LEVEL_GAP) { found = other; nearest = t; }
        }
        const c = fight.character(found);
        const cell = F.nearestCell(found, c.x, c.y, Math.floor(ox + dx * nearest), Math.floor(oz + dz * nearest));
        picked.x = cell.x; picked.y = cell.y; picked.h = G.heightOf(c); picked.unit = true;
        return found;
    };

    // A hull's top, from its middle outward (0) to the edge of its box (1): as tall as it stands out to CROWN, down
    // to its rim's height (`F.rimOf`) from EAVE on. STEP: how far apart a ray is looked at inside the box, in tiles.
    In.HULL_CROWN = 0.2;
    In.HULL_EAVE = 0.8;
    In.HULL_STEP = 0.12;
    let hullLow = false, rayLeave = 0;

    /**
     * How far along a ray it meets a hull, Infinity when it passes it by. The hull is a box round (`mx`, `mz`) with
     * half sides `hx`, `hz`, standing on `y0`, whose top falls from `tall` over its middle to its rim's height at its
     * edge (a turret over tracks, a back over legs); with a `mask` (the model's own outline, in the same frame) it
     * is only where the mesh is. `hullLow` says whether it was met no higher than its rim.
     */
    function rayHull(px, py, pz, vx, vy, vz, mx, mz, hx, hz, y0, tall, mask) {
        hullLow = false;
        const enter = rayBox(px, py, pz, vx, vy, vz, mx - hx, mx + hx, y0, y0 + tall, mz - hz, mz + hz);
        if (enter === Infinity) return Infinity;
        const span = rayLeave - enter, rim = F.rimOf(tall), crown = In.HULL_CROWN, slope = (tall - rim) / (In.HULL_EAVE - crown);
        const steps = clamp(Math.ceil(span / In.HULL_STEP), 1, 128);
        for (let i = 0; i <= steps; i++) {
            const t = enter + span * i / steps, x = px + vx * t, z = pz + vz * t, up = py + vy * t - y0;
            const out = Math.max(Math.abs(x - mx) / hx, Math.abs(z - mz) / hz);
            if (up > Math.max(rim, tall - Math.max(0, out - crown) * slope) + 1e-6) continue;
            if (mask && !mask.has(Math.floor(x * mask.sub), Math.floor(z * mask.sub))) continue;
            hullLow = up <= rim + 1e-6;
            return t;
        }
        return Infinity;
    }

    /** How far along a ray it enters a box (slabs), Infinity when it passes it by; where it leaves it is left in `rayLeave`. */
    function rayBox(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1) {
        let enter = 0, leave = Infinity;
        if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return Infinity; }
        else { const a = (x0 - ox) / dx, b = (x1 - ox) / dx; enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
        if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return Infinity; }
        else { const a = (y0 - oy) / dy, b = (y1 - oy) / dy; enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
        if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return Infinity; }
        else { const a = (z0 - oz) / dz, b = (z1 - oz) / dz; enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
        rayLeave = leave;
        return enter > leave ? Infinity : enter;
    }

    /** The cell under a screen point: through the 3D camera onto the ground on a 3D map, the tile on a 2D one. */
    In.pick = function(x, y) {
        const live = View.live();
        picked.unit = false;
        if (live && live.camera && typeof THREE !== "undefined" && Reactor3D.groundTileFromRay) {
            if (!In._ray) { In._ray = new THREE.Raycaster(); In._point = new THREE.Vector2(); }
            live.camera.updateMatrixWorld();
            In._ray.setFromCamera(In._point.set(x / Graphics.width * 2 - 1, 1 - y / Graphics.height * 2), live.camera);
            const origin = In._ray.ray.origin, direction = In._ray.ray.direction;
            // Whoever the pointer is on is what it points at, before any ground: a unit under a roof or beside a
            // canopy is picked, not the roof (choosing a unit, choosing a target).
            const pointing = $gameFight._act ? $gameFight._act.stage : "";
            if ((pointing === "pick" || pointing === "target") && In.unitOnRay($gameFight, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z)) return picked;
            const tile = Reactor3D.groundTileFromRay($dataMap, origin, direction);
            if (!tile) return null;
            picked.x = tile.x; picked.y = tile.y; picked.h = NaN;
            // While a move is chosen the pointer takes a place the unit can stop on: the first its ray crosses that is
            // in view (a roof the battle's cutaway has opened is looked through), else the first on any level.
            const moving = $gameFight, stage = moving._act;
            if (direction.y < -1e-6 && stage && stage.unitId && moving.playerStage("move")) {
                moving.ensureFlood(moving.unit(stage.unitId), stage.steps);
                const shared = Reactor3D.cutawayUniforms ? Reactor3D.cutawayUniforms() : null;
                const box = shared ? shared.rrFightBox.value : null, opened = shared && View.active() && box[2] > box[0] ? shared.rrFightLevel.value[1] : Infinity;
                let first = false, fx = 0, fy = 0, fh = 0, before = origin.y;
                for (let t = 0; t < 600; t += 0.15) {
                    const px = origin.x + direction.x * t, pz = origin.z + direction.z * t, py = origin.y + direction.y * t;
                    if (py < -80) break;
                    const cx = Math.floor(px), cy = Math.floor(pz);
                    if (cx >= 0 && cy >= 0 && cx < gw && cy < gh) {
                        const levels = G.reachedAt(cx, cy, reachedOut);
                        for (let i = 0; i < levels; i++) {
                            const level = reachedOut[i * 2];
                            // Over the level a moment ago and at or under it now: the ray crossed it here.
                            if (!(reachedOut[i * 2 + 1] <= stage.steps) || !(py <= level + 0.05 && before > level + 0.05)) continue;
                            if (!G.canStopAt(cx, cy, level)) continue;
                            // Over the battle's ground, what stands higher than the cut is not drawn: the pointer goes through it.
                            const cut = level > opened && cx + 0.5 >= box[0] && cx + 0.5 <= box[2] && cy + 0.5 >= box[1] && cy + 0.5 <= box[3];
                            if (!cut) { picked.x = cx; picked.y = cy; picked.h = level; return picked; }
                            if (!first) { first = true; fx = cx; fy = cy; fh = level; }
                        }
                    }
                    before = py;
                }
                if (first) { picked.x = fx; picked.y = fy; picked.h = fh; return picked; }
            }
            // The flat pick knows the cells' own levels. The ray is walked from the camera to the first ground it
            // meets: a hill, or a floor, a bridge or a step no higher than the floor the battle stands on. What
            // stands higher (walls, roofs, the storeys above) is looked through, as the view shows it.
            if (direction.y < -1e-6 && Reactor3D.terrainHeightAt && Reactor3D.elevationAt) {
                const fight = $gameFight, level = Reactor3D.cutawayUniforms ? Reactor3D.cutawayUniforms().rrFightLevel.value[1] : 0;
                const own = fight.character(fight.activeUnit());
                const near = View.active() && level ? level - 0.6 : G.heightOf(own || $gamePlayer) + 0.5;
                for (let t = Math.max(0, (near + 6 - origin.y) / direction.y); t < 600; t += 0.2) {
                    const px = origin.x + direction.x * t, pz = origin.z + direction.z * t, py = origin.y + direction.y * t;
                    if (py < near - 40) break;
                    const cx = Math.floor(px), cy = Math.floor(pz);
                    if (!$gameMap.isValid(cx, cy)) continue;
                    const land = (Reactor3D.elevationAt($dataMap, cx, cy) || 0) + (Reactor3D.terrainHeightAt($dataMap, px, pz) || 0);
                    let hit = py <= land + 0.02;
                    if (!hit && py <= near + 0.8) {
                        const top = Reactor3D.groundHeightAt($dataMap, px, pz, near) || 0;
                        hit = top <= near + 0.8 && py <= top + 0.02;
                    }
                    if (hit) { picked.x = cx; picked.y = cy; picked.h = py <= land + 0.02 ? land : Reactor3D.groundHeightAt($dataMap, px, pz, near) || 0; break; }
                }
            }
            return $gameMap.isValid(picked.x, picked.y) ? picked : null;
        }
        picked.x = Math.floor($gameMap.canvasToMapX(x)); picked.y = Math.floor($gameMap.canvasToMapY(y)); picked.h = NaN;
        return $gameMap.isValid(picked.x, picked.y) ? picked : null;
    };

    In.update = function(fight) {
        if (typeof Input === "undefined" || !fight.awaitsPlayer()) return;
        const frame = frameNow();
        if (In._skip === frame) return;
        const act = fight._act, cursor = fight.tac().cursor;
        const touch = typeof TouchInput !== "undefined" ? TouchInput : null;
        // A new stage starts from where the pointer already is: only a pointer that moves takes the cursor.
        const key = act.unitId * 16 + PLAYER_STAGES.indexOf(act.stage);
        if (key !== In._key) {
            In._key = key;
            if (touch) { In._px = touch.x; In._py = touch.y; }
        }
        if (Input.isTriggered(F.key("viewLeft"))) { if (!View.rotate(-1)) In.cycle(fight, -1); }
        else if (Input.isTriggered(F.key("viewRight"))) { if (!View.rotate(1)) In.cycle(fight, 1); }
        if (touch && touch.wheelY) View.zoom(touch.wheelY > 0 ? 1 : -1);
        // The view's own keys (W A S D) move it while they are held; the cursor stays where it is.
        const held = control => !!control && Input.isPressed(control);
        const slideX = (held(F.key("panRight")) ? 1 : 0) - (held(F.key("panLeft")) ? 1 : 0), slideY = (held(F.key("panUp")) ? 1 : 0) - (held(F.key("panDown")) ? 1 : 0);
        if (slideX || slideY) {
            const own = fight._tac && fight._tac.view;
            if (View.slide(fight, slideX, slideY, View.SLIDE * (View.active() && own && own.zoom > 1 ? own.zoom : 1))) View.endVisit();
        }
        const state3D = View.live() && camera3D() ? camera3D().currentState().mode : "";
        const locked = state3D === "thirdPerson" || state3D === "firstPerson"
            || (typeof document !== "undefined" && typeof Graphics !== "undefined" && !!document.pointerLockElement && document.pointerLockElement === Graphics._canvas);
        // T: what every enemy can reach next turn, shown and hidden.
        if (Input.isTriggered(F.key("threat"))) { In._threatAt = frame; fight.toggleThreat(); sound("playCursor"); }
        // Tab brings the cursor and the view back to the unit whose turn it is.
        if (Input.isTriggered(F.key("unit")) && act.unitId) {
            const own = fight.character(fight.unit(act.unitId));
            fight.setCursor(own.x, own.y, G.heightOf(own));
            fight.focusOn(own.x, own.y);
        }
        // A mouse resting at the screen's edge pans the view that way.
        if (touch && In._hover && !locked && typeof Graphics !== "undefined") {
            const edge = 28, width = Graphics.width, height = Graphics.height;
            if (touch.x >= 0 && touch.y >= 0 && touch.x <= width && touch.y <= height) {
                if (touch.x < edge) View.pan(fight, 4, 0.3); else if (touch.x > width - edge) View.pan(fight, 6, 0.3);
                if (touch.y < edge) View.pan(fight, 8, 0.3); else if (touch.y > height - edge) View.pan(fight, 2, 0.3);
            }
        }
        const d = Input.isRepeated("down") ? 2 : Input.isRepeated("left") ? 4 : Input.isRepeated("right") ? 6 : Input.isRepeated("up") ? 8 : 0;
        if (d && cursor.on) {
            const step = View.cursorStep(d);
            const x = cursor.x + step.x, y = cursor.y + step.y;
            if ($gameMap.isValid(x, y)) {
                fight.setCursor(x, y);
                fight.focusOn(x, y);
                View.endVisit();
                sound("playCursor");
            }
        }
        // A camera that holds the mouse (third and first person) leaves no pointer to hover with: the keys move the cursor.
        // A pointer over the HUD's turn strip or one of its unit panels is on that, not on the map behind it.
        const ui = root.ReactorUI;
        const onHud = !!touch && !!ui && ((!!ui.fightStripUnit && ui.fightStripUnit(touch.x, touch.y) !== 0) || (!!ui.fightPanelAt && !!ui.fightPanelAt(touch.x, touch.y)));
        if (touch && !locked && !onHud) {
            const wasOn = cursor.on, wasX = cursor.x, wasY = cursor.y;
            const pressed = touch.isTriggered();
            // A mouse was already over the point it presses; a finger lands on it.
            const mouse = pressed && Math.abs(touch.x - In._px) <= 2 && Math.abs(touch.y - In._py) <= 2;
            if (pressed) In._hover = mouse;
            else if (touch.x !== In._px || touch.y !== In._py) In._hover = true;
            if (pressed || touch.x !== In._px || touch.y !== In._py) {
                In._px = touch.x; In._py = touch.y;
                const cell = In.pick(touch.x, touch.y);
                if (cell) {
                    // A unit the pointer is on is pointed at where it stands (`cell.unit`: its own level, so the one meant
                    // of two on a cell); a unit on the ground cell met likewise; otherwise the level the ray met.
                    fight.setCursor(cell.x, cell.y, !cell.unit && fight.unitAt(cell.x, cell.y) && act.stage !== "move" ? undefined : cell.h);
                    // The player points somewhere: the view stops showing whoever it went to.
                    View.endVisit();
                    if (pressed && (mouse || (wasOn && wasX === cell.x && wasY === cell.y))) { In.confirm(fight); return; }
                }
            }
            if (touch.isCancelled()) { In.cancel(fight); return; }
        }
        // Control: the cursor to the cell's next level (the roof over a room, the bridge over a path).
        if (Input.isTriggered(F.key("level")) && cursor.on && fight.cycleCursorLevel(1)) { sound("playCursor"); return; }
        if (Input.isTriggered("ok")) In.confirm(fight);
        else if (Input.isTriggered("cancel")) In.cancel(fight);
        else if (Input.isTriggered(F.key("skip"))) {
            if (act.stage === "move") { if (fight.commandNextUnit) sound(fight.commandNextUnit() ? "playCursor" : "playBuzzer"); }
            else In.cycle(fight, 1);
        }
    };

    In.confirm = function(fight) {
        const act = fight._act, cursor = fight.tac().cursor;
        if (!cursor.on) return;
        let ok = false;
        if (act.stage === "pick") {
            const unit = fight.unitAt(cursor.x, cursor.y, null, cursor.h);
            ok = !!unit && fight.commandSelectUnit(unit.id);
        } else if (act.stage === "move") {
            const x = cursor.x, y = cursor.y;
            ok = fight.commandMoveTo(x, y, cursor.h);
            if (!ok && fight._turns === "team") {
                // Another of the player's units under the cursor: it is picked instead.
                const other = fight.unitAt(x, y, null, cursor.h);
                if (other && other.id !== act.unitId && fight.isPlayerUnit(other) && !fight.tac().acted[other.id] && fight.commandCancel()) ok = fight.commandSelectUnit(other.id);
            }
        } else if (act.stage === "target") {
            ok = fight.commandTarget(cursor.x, cursor.y);
        }
        sound(ok ? "playOk" : "playBuzzer");
    };

    In.cancel = function(fight) {
        if (!fight.commandCancel()) return;
        In._ate = frameNow();
        sound("playCancel");
    };

    /** The cursor to the next unit that can be picked, or the next target in range. */
    In.cycle = function(fight, step) {
        const act = fight._act, cursor = fight.tac().cursor;
        let cells = EMPTY;
        if (act.stage === "pick") {
            cells = fight.pendingUnits().map(unit => fight.character(unit));
        } else if (act.stage === "target") {
            const unit = fight.unit(act.unitId), character = fight.character(unit), action = fight.pendingAction();
            const tactics = F.tactics(action.subject(), action.item());
            cells = fight.rangeCells().filter(cell => collectTargets(fight, unit, action, tactics, character.x, character.y, cell.x, cell.y, scratchTargets).length > 0);
        }
        if (!cells.length) return;
        const at = cells.findIndex(cell => cell.x === cursor.x && cell.y === cursor.y);
        const next = cells[(((at < 0 ? (step > 0 ? -1 : 0) : at) + step) % cells.length + cells.length) % cells.length];
        fight.setCursor(next.x, next.y, Number.isFinite(next.h) ? next.h : act.stage === "pick" ? G.heightOf(next) : undefined);
        fight.focusOn(next.x, next.y);
        sound("playCursor");
    };

    //-------------------------------------------------------------------------
    // Marks on the ground: where the unit can move, the way there (squares
    // with what the move costs), what the action reaches and where it lands,
    // the cursor, and where the other side can come and strike next turn. On
    // a 2D map they are tile sprites under the characters, on a 3D map one
    // instanced mesh lying on the ground; both are built again only when
    // something changed.

    const M = F.Marks = { CAPACITY: 4096, rev: -1, serial: -1, over: false, deep: null, count: 0, layer: null, sprites: [], bitmaps: null, mesh: null, scene: null, spriteset: null };
    // `tread`: where an enemy can stand after its next move; `threat`: what it can strike from there.
    M.KINDS = { move: 1, range: 2, friend: 3, path: 4, area: 5, cursor: 6, tread: 7, threat: 8 };
    // Which mark shows where two fall on one cell: the higher; what the other side might do lies under everything of the player's own.
    M.STRENGTH = [0, 3, 4, 5, 6, 7, 8, 2, 1];
    M.COLORS = [0, 0x3c8cff, 0xff5548, 0x46d27a, 0xd8ecff, 0xffc840, 0xffffff, 0xc86bff, 0xff9a3c];
    M.CSS = ["", "rgba(60,140,255,0.5)", "rgba(255,70,60,0.5)", "rgba(70,210,122,0.5)", "rgba(216,236,255,0.72)", "rgba(255,200,64,0.75)", "rgba(255,255,255,0.0)",
        "rgba(200,107,255,0.42)", "rgba(255,154,60,0.34)"];
    M.RIM = ["", "rgba(150,200,255,0.95)", "rgba(255,150,140,0.95)", "rgba(160,255,190,0.95)", "rgba(255,255,255,0.95)", "rgba(255,235,150,1)", "", "rgba(228,180,255,0.9)", "rgba(255,200,140,0.8)"];
    const markX = M.x = new Int16Array(M.CAPACITY), markY = M.y = new Int16Array(M.CAPACITY), markKind = M.kind = new Uint8Array(M.CAPACITY);
    // The height a mark lies at (NaN: the ground the map finds there).
    const markH = M.h = new Float32Array(M.CAPACITY);
    // The way to the cursor, tile by tile from the unit's own, for the squares laid along it; and what the move costs.
    M.WAY_MAX = 64;
    M.wayCount = 0; M.wayCost = 0;
    const wayX = M.wayX = new Int16Array(M.WAY_MAX), wayY = M.wayY = new Int16Array(M.WAY_MAX), wayH = M.wayH = new Float32Array(M.WAY_MAX);

    /** A mark's place in the grid: its cell, and the level of it its height names (the first without one). */
    function markIndex(cell) {
        const base = (cell.y * gw + cell.x) * LEVELS;
        if (!Number.isFinite(cell.h) || !markLevels) return base;
        // The levels of the cells marked this time, in the order they came.
        const key = cell.y * gw + cell.x;
        let list = markLevels.get(key);
        if (!list) { list = []; markLevels.set(key, list); }
        for (let i = 0; i < list.length; i++) if (Math.abs(list[i] - cell.h) < LEVEL_GAP) return base + i;
        if (list.length >= LEVELS) return base + LEVELS - 1;
        list.push(cell.h);
        return base + list.length - 1;
    }
    let markLevels = null;

    function markCells(cells, kind) {
        for (const cell of cells) {
            if (cell.x < 0 || cell.y < 0 || cell.x >= gw || cell.y >= gh) continue;
            const index = markIndex(cell);
            if (M.STRENGTH[gMark[index]] < M.STRENGTH[kind]) gMark[index] = kind;
        }
    }

    function takeCells(cells) {
        for (const cell of cells) {
            if (cell.x < 0 || cell.y < 0 || cell.x >= gw || cell.y >= gh) continue;
            const index = markIndex(cell);
            if (!gMark[index] || M.count >= M.CAPACITY - 1) continue;
            markX[M.count] = cell.x; markY[M.count] = cell.y; markKind[M.count] = gMark[index]; markH[M.count] = Number.isFinite(cell.h) ? cell.h : NaN;
            M.count++;
            gMark[index] = 0;
        }
    }

    /** Every cell to mark and its kind, the strongest winning where two overlap; the cursor last. */
    M.collect = function(fight) {
        M.count = 0;
        M.wayCount = 0; M.wayCost = 0;
        if (!fight || !fight.isTactical() || !fight.isHere() || fight._ending || !fight._act || !fight._act.player) return;
        ensureGrid();
        const act = fight._act, K = M.KINDS;
        let move = EMPTY, path = EMPTY, range = EMPTY, area = EMPTY, rangeKind = K.range, tread = EMPTY, danger = EMPTY;
        // Where the other side can come and strike: the enemy under the cursor, or all of them when asked (their floods
        // are made first: the acting unit's own is made again below).
        if (act.stage === "pick" || act.stage === "move") {
            const pointed = fight.focusedUnit();
            if (fight.tac().threatAll) danger = fight.threatOfAll();
            else if (pointed && pointed.team === "enemy" && fight.isAlive(pointed)) { const known = fight.threatOf(pointed); tread = known.tread; danger = known.reach; }
        } else if (fight.tac().threatAll && (act.stage === "command" || act.stage === "skill" || act.stage === "item")) danger = fight.threatOfAll();
        if (act.stage === "pick") { const pending = fight.pendingUnits(); move = fight.withFootprints(pending.map(unit => fight.character(unit)), pending); }
        else if (act.stage === "move") { move = fight.moveCells(); path = fight.pathCells(); }
        else if (act.stage === "target") {
            range = fight.rangeCells(); area = fight.areaCells();
            const action = fight.pendingAction();
            if (action && !action.isForOpponent()) rangeKind = K.friend;
        }
        // Cells with a height (a 3D map's) are told apart by level; the area follows the range's level on its cells.
        markLevels = G.is3D() ? (M.levels || (M.levels = new Map())) : null;
        if (markLevels) markLevels.clear();
        if (markLevels && area.length && range.length) {
            for (const cell of area) {
                if (Number.isFinite(cell.h)) continue;
                for (const reach of range) if (reach.x === cell.x && reach.y === cell.y) { cell.h = reach.h; break; }
            }
        }
        markCells(danger, K.threat); markCells(tread, K.tread);
        markCells(move, K.move); markCells(range, rangeKind); markCells(area, K.area);
        takeCells(move); takeCells(range); takeCells(area); takeCells(tread); takeCells(danger);
        // The way to the cursor as a line of steps (M.wayX, M.wayY, M.wayH), and what it costs.
        if (path.length > 1) {
            M.wayCost = fight.pathCost();
            for (const step of path) {
                if (M.wayCount >= M.WAY_MAX) break;
                wayX[M.wayCount] = step.x; wayY[M.wayCount] = step.y; wayH[M.wayCount] = Number.isFinite(step.h) ? step.h : NaN;
                M.wayCount++;
            }
        }
        const cursor = fight.cursor();
        if (cursor && PLAYER_STAGES.includes(act.stage) && act.stage !== "command" && act.stage !== "skill" && act.stage !== "item") {
            markX[M.count] = cursor.x; markY[M.count] = cursor.y; markKind[M.count] = K.cursor; markH[M.count] = Number.isFinite(cursor.h) ? cursor.h : NaN;
            M.count++;
            // A big unit under the cursor, or one being moved there, shows every cell it covers.
            const active = act.unitId ? fight.unit(act.unitId) : null;
            const moving = act.stage === "move" && active && F.isBig(active);
            const body = moving ? active : fight.unitAt(cursor.x, cursor.y, null, cursor.h);
            if (body && F.isBig(body)) {
                // One being moved is shown as it would stand there: turned the way its last step turns it.
                let turned = 0;
                if (moving) { fight.ensureFlood(active, act.steps); turned = G.facingAt(cursor.x, cursor.y, cursor.h); }
                const at = moving ? cursor : fight.character(body), f = turned ? F.footprintFacing(body, turned) : F.footprint(body);
                for (let y = at.y + f.oy; y < at.y + f.oy + f.h; y++) {
                    for (let x = at.x + f.ox; x < at.x + f.ox + f.w; x++) {
                        if ((x === cursor.x && y === cursor.y) || !$gameMap.isValid(x, y) || M.count >= M.CAPACITY) continue;
                        markX[M.count] = x; markY[M.count] = y; markKind[M.count] = K.cursor; markH[M.count] = Number.isFinite(cursor.h) ? cursor.h : NaN;
                        M.count++;
                    }
                }
            }
        }
    };

    //-------------------------------------------------------------------------
    // Where the other side can come and strike. Pointing at an enemy shows
    // where it can stand after its next move and every cell it can strike
    // from there; `toggleThreat` (the T key, a battle menu) shows what all of
    // them reach together. Each is worked out when first shown and kept until
    // someone moves, falls or joins: nothing here runs per frame.

    const menace = { key: "", tread: [], reach: [], allKey: "", all: [] };
    // Steps from a source of a spreading reach, per cell (-1: not reached), and the cells still to spread from.
    let spread = null, spreadQueue = null;

    /** The longest reach of what a unit may strike the other side with: its attack and, for an enemy, the skills of its action patterns. */
    function strikeReach(battler) {
        let far = F.tactics(battler, $dataSkills[battler.attackSkillId()]).max;
        if (battler.isEnemy && battler.isEnemy()) {
            for (const pattern of battler.enemy().actions || EMPTY) {
                const skill = $dataSkills[pattern.skillId];
                if (skill && skill.scope >= 1 && skill.scope <= 6) far = Math.max(far, F.tactics(battler, skill).max);
            }
        } else if (battler.skills) {
            for (const skill of battler.skills()) if (skill && skill.scope >= 1 && skill.scope <= 6 && battler.canUse(skill)) far = Math.max(far, F.tactics(battler, skill).max);
        }
        return far;
    }

    /** Fills `tread` with where a unit can stop after its move and `reach` with every cell within its strike of one of those (walls left out). */
    function menaceOf(fight, unit, tread, reach) {
        tread.length = 0; reach.length = 0;
        const character = fight.character(unit), battler = fight.battler(unit);
        if (!character || !battler) return;
        ensureGrid();
        const size = gw * gh;
        if (!spread || spread.length !== size) { spread = new Int16Array(size); spreadQueue = new Int32Array(size); }
        spread.fill(-1);
        const move = battler.canMove() ? F.moveOf(unit) : 0, far = strikeReach(battler), span = Math.ceil(move);
        const deep = G.is3D(), ground = G.heightOf(character);
        fight.ensureFlood(unit, move);
        let tail = 0;
        const source = (x, y) => {
            if (x < 0 || y < 0 || x >= gw || y >= gh) return;
            const cell = y * gw + x;
            if (spread[cell] === 0) return;
            spread[cell] = 0; spreadQueue[tail++] = cell;
        };
        const facing = character.direction();
        for (let y = character.y - span; y <= character.y + span; y++) {
            for (let x = character.x - span; x <= character.x + span; x++) {
                const levels = G.reachedAt(x, y, reachedOut);
                for (let i = 0; i < levels; i++) {
                    const h = reachedOut[i * 2];
                    if (!(reachedOut[i * 2 + 1] <= move) || !(G.canStopAt(x, y, h) || (x === character.x && y === character.y))) continue;
                    tread.push({ x, y, h });
                    // It strikes from the nearest cell of its body, as it would stand there.
                    const f = F.footprintFacing(unit, G.facingAt(x, y, h) || facing), x0 = x + f.ox, y0 = y + f.oy, w = f.w, d = f.h;
                    for (let by = y0; by < y0 + d; by++) for (let bx = x0; bx < x0 + w; bx++) source(bx, by);
                }
            }
        }
        for (let head = 0; head < tail; head++) {
            const cell = spreadQueue[head], steps = spread[cell];
            if (steps >= far) continue;
            const x = cell % gw, y = (cell - x) / gw;
            for (let i = 0; i < 4; i++) {
                const nx = x + DX[DIRS[i]], ny = y + DY[DIRS[i]];
                if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                const next = ny * gw + nx;
                if (spread[next] >= 0 || G.blocksSight(nx, ny)) continue;
                spread[next] = steps + 1; spreadQueue[tail++] = next;
                // Marked only where someone could stand to be struck, on the floor the unit is on: not on a bench, a
                // rim or a post, nor on the roofs round it.
                if (deep) { const at = G.groundAt(nx, ny, ground); if (Math.abs(at - ground) >= LEVEL_GAP || !G.stands(nx, ny, at)) continue; }
                reach.push({ x: nx, y: ny });
            }
        }
    }

    /** Where a unit can stand after its next move and what it can strike from there: `{ tread: [{ x, y, h }], reach: [{ x, y }] }`, kept until anyone moves. */
    Game_Fight.prototype.threatOf = function(unit) {
        const key = this._serial + ":" + this._turn + ":" + this.positionsHash() + ":" + (unit ? unit.id : 0);
        if (menace.key !== key) { menace.key = key; if (unit) menaceOf(this, unit, menace.tread, menace.reach); else { menace.tread.length = 0; menace.reach.length = 0; } }
        return menace;
    };

    /** Every cell any enemy can stand on or strike next turn, as one list (kept until anyone moves). */
    Game_Fight.prototype.threatOfAll = function() {
        const key = this._serial + ":" + this._turn + ":" + this.positionsHash();
        if (menace.allKey === key) return menace.all;
        menace.allKey = key; menace.key = "";
        const all = menace.all, seen = menace.seen || (menace.seen = new Set());
        all.length = 0; seen.clear();
        for (const unit of this._units) {
            if (unit.gone || unit.team !== "enemy" || !this.isAlive(unit)) continue;
            menaceOf(this, unit, menace.tread, menace.reach);
            for (const list of [menace.tread, menace.reach]) for (const cell of list) {
                const id = cell.y * gw + cell.x;
                if (seen.has(id)) continue;
                seen.add(id);
                all.push({ x: cell.x, y: cell.y });
            }
        }
        menace.tread.length = 0; menace.reach.length = 0;
        return all;
    };

    /** Show (or stop showing) what every enemy reaches next turn; `on` sets it, nothing turns it over. Returns what it is now. */
    Game_Fight.prototype.toggleThreat = function(on) {
        if (!this.isTactical()) return false;
        const tac = this.tac();
        tac.threatAll = on === undefined ? !tac.threatAll : !!on;
        this.touch();
        return tac.threatAll;
    };
    Game_Fight.prototype.showsThreat = function() { return !!(this._tac && this._tac.threatAll); };

    //-------------------------------------------------------------------------
    // The way to the cursor and what the move costs. Each tile of the way
    // carries a quiet white square inset in it, dark-edged so it reads on
    // grass, stone and water, by day and at night. A brighter square travels
    // from the unit's tile to the destination, tile by tile, in about a
    // second however long the way is, and sets off again: it shows which way
    // the unit will go. The destination's square is larger, a frame round a
    // core, and the cost stands beside it. A tile someone stands on carries
    // none: that unit's ring is there. On a 3D map the squares are one
    // instanced mesh, each lying on its own tile's ground; on a 2D map tile
    // sprites. Laid when the way changes; a frame moves the travelling
    // square and nothing else.

    const WAY_EDGE = 0x0a1428, WAY_QUIET = 0xb4c4d4, WAY_BRIGHT = 0xffffff;
    // Sizes as parts of a tile: a square and the edge round it, the travelling square at its brightest, the destination's frame, its hole and its core.
    M.WAY_SQUARE = 0.4; M.WAY_RIM = 0.06; M.WAY_PULSE = 0.62; M.WAY_END = 0.74; M.WAY_END_HOLE = 0.5; M.WAY_END_CORE = 0.26;
    /** Frames the travelling square takes from the unit to the destination, and frames before it sets off again. */
    M.WAY_PASS = 48; M.WAY_REST = 12;
    const way = M.way = { mesh: null, scene: null, matrix: null, color: null, white: null, squares: 0, layer: null, sprites: [], pulses: [], bitmaps: null,
        label: null, labels: null, out: { x: 0, y: 0 }, born: 0, shown: -1, used: 0, moving: false };
    // Each tile of the way as it was laid: the ground it lies on, how that leans, and whether it carries a square.
    const wayG = new Float32Array(M.WAY_MAX), waySX = new Float32Array(M.WAY_MAX), waySZ = new Float32Array(M.WAY_MAX), wayOn = M.wayOn = new Uint8Array(M.WAY_MAX);

    /**
     * Where the travelling square is `frames` after the way was laid, as a place along the way in tiles (0: the
     * unit's own tile, `count - 1`: the destination, and on to `count`, where the destination has dimmed again).
     * NaN while it rests before the next pass.
     */
    M.wayPulse = function(frames, count) {
        if (!(count > 1)) return NaN;
        const whole = M.WAY_PASS + M.WAY_REST, t = ((frames % whole) + whole) % whole;
        return t >= M.WAY_PASS ? NaN : t / M.WAY_PASS * count;
    };
    /** How bright the travelling square makes tile `i` when it is at `place`: 1 on the tile, easing to 0 a tile away either side. */
    M.wayGlow = function(i, place) {
        const near = 1 - Math.abs(i - place);
        return near > 0 ? near * near * (3 - 2 * near) : 0;
    };

    function wayHeight(i) {
        const x = wayX[i], y = wayY[i];
        return (Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, Number.isFinite(wayH[i]) ? wayH[i] : undefined) || 0);
    }

    /** The way's tiles, read once as it is laid: `deep`, with the ground each lies on. The travelling square sets off from the unit. */
    function wayTiles(deep) {
        const fight = $gameFight;
        for (let i = 0; i < M.wayCount; i++) {
            const x = wayX[i], y = wayY[i];
            // The first is the unit's own; another's on the way is passed through.
            wayOn[i] = i > 0 && !fight.unitAt(x, y, null, Number.isFinite(wayH[i]) ? wayH[i] : undefined) ? 1 : 0;
            if (!deep) continue;
            const g = wayG[i] = wayHeight(i);
            // A square leans with the slope it lies on; a wall beside the tile does not tilt it.
            let sx = ((Reactor3D.groundHeightAt($dataMap, x + 0.9, y + 0.5, g) || 0) - (Reactor3D.groundHeightAt($dataMap, x + 0.1, y + 0.5, g) || 0)) / 0.8;
            let sz = ((Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.9, g) || 0) - (Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.1, g) || 0)) / 0.8;
            if (Math.abs(sx) > 1.2) sx = 0;
            if (Math.abs(sz) > 1.2) sz = 0;
            waySX[i] = sx; waySZ[i] = sz;
        }
        way.born = frameNow();
    }

    /** One square of the mesh on tile `i`, `size` of a tile across (0: none), `lift` over the ground. Returns the next free instance. */
    function waySquare(mesh, n, i, size, lift, color) {
        way.matrix.set(size, 0, 0, wayX[i] + 0.5, waySX[i] * size, 1, waySZ[i] * size, wayG[i] + lift, 0, 0, size, wayY[i] + 0.5, 0, 0, 0, 1);
        mesh.setMatrixAt(n, way.matrix);
        mesh.setColorAt(n, color);
        return n + 1;
    }

    M.drawWay3D = function(live) {
        const scene = live && live.scene;
        if (!scene || typeof THREE === "undefined" || !scene.belowGroup || M.wayCount < 2) { if (way.mesh) { way.mesh.count = 0; way.mesh.visible = false; } way.squares = 0; return; }
        // An edge and a square per tile, the destination's four, and the travelling pair with their edges: flat quads of one instanced mesh, as the marks are.
        const most = M.WAY_MAX * 2 + 4 + 4;
        if (!way.mesh || way.scene !== scene || !way.mesh.parent) {
            const geometry = new THREE.PlaneGeometry(1, 1);
            geometry.rotateX(-Math.PI / 2);
            // One-sided, as the marks are: every quad faces up, and the map holds a see-through two-sided material out
            // of the picture while it compiles it again and again.
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
            way.mesh = new THREE.InstancedMesh(geometry, material, most);
            way.mesh.frustumCulled = false;
            way.mesh.count = 0;
            way.mesh.renderOrder = 6;
            way.matrix = new THREE.Matrix4();
            way.color = new THREE.Color();
            way.white = new THREE.Color(WAY_BRIGHT);
            way.scene = scene;
            scene.belowGroup().add(way.mesh);
            if (scene._meshes) scene._meshes.push(way.mesh);
            if (scene._materials) scene._materials.push(material);
        }
        wayTiles(true);
        const mesh = way.mesh, last = M.wayCount - 1, color = way.color;
        let n = 0;
        // Every edge under every square: an instance drawn later lies over the ones before it.
        color.setHex(WAY_EDGE);
        for (let i = 1; i < last; i++) if (wayOn[i]) n = waySquare(mesh, n, i, M.WAY_SQUARE + M.WAY_RIM * 2, 0.1, color);
        n = waySquare(mesh, n, last, M.WAY_END + M.WAY_RIM * 2, 0.1, color);
        color.setHex(WAY_QUIET);
        for (let i = 1; i < last; i++) if (wayOn[i]) n = waySquare(mesh, n, i, M.WAY_SQUARE, 0.105, color);
        // The destination: a bright frame round a dark hole with a bright core.
        n = waySquare(mesh, n, last, M.WAY_END, 0.105, way.white);
        n = waySquare(mesh, n, last, M.WAY_END_HOLE, 0.11, color.setHex(WAY_EDGE));
        n = waySquare(mesh, n, last, M.WAY_END_CORE, 0.115, way.white);
        way.squares = n;
        mesh.count = n + 4;
        mesh.visible = !M.hidden;
        pulseWay3D(frameNow());
    };

    /** The travelling square where it is this frame: the last four instances, an edge and a square on each of the two tiles it is between. */
    function pulseWay3D(frame) {
        const mesh = way.mesh, count = M.wayCount;
        if (!mesh || count < 2 || !way.squares) return;
        const place = M.wayPulse(frame - way.born, count), first = Math.floor(place), color = way.color;
        let n = way.squares;
        for (let k = 0; k < 2; k++) {
            const i = first + k, glow = place === place && i >= 1 && i < count && wayOn[i] ? M.wayGlow(i, place) : 0, end = i === count - 1;
            if (!(glow > 0)) { n = waySquare(mesh, n, 0, 0, 0, way.white); n = waySquare(mesh, n, 0, 0, 0, way.white); continue; }
            // On the way it swells and brightens; at the destination it fills the frame's hole.
            const from = end ? M.WAY_END_CORE : M.WAY_SQUARE, to = end ? M.WAY_END_HOLE + 0.06 : M.WAY_PULSE, size = from + (to - from) * glow;
            n = waySquare(mesh, n, i, end ? 0 : size + M.WAY_RIM * 2, 0.12, color.setHex(WAY_EDGE));
            n = waySquare(mesh, n, i, size, 0.125, color.setHex(end ? WAY_BRIGHT : WAY_QUIET).lerp(way.white, glow));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    /** The pictures of a 2D map's way: a tile with its square, the destination's, and the travelling square (drawn at its brightest size). */
    function wayBitmaps() {
        if (way.bitmaps) return way.bitmaps;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight(), dark = "rgba(10,20,40,0.94)", quiet = "rgba(180,196,212,0.94)", bright = "rgba(255,255,255,0.97)";
        const square = (bitmap, part, color) => { const w = Math.round(tw * part), h = Math.round(th * part); bitmap.fillRect(Math.round((tw - w) / 2), Math.round((th - h) / 2), w, h, color); };
        const made = { square: new Bitmap(tw, th), end: new Bitmap(tw, th), pulse: new Bitmap(tw, th) };
        square(made.square, M.WAY_SQUARE + M.WAY_RIM * 2, dark); square(made.square, M.WAY_SQUARE, quiet);
        square(made.end, M.WAY_END + M.WAY_RIM * 2, dark); square(made.end, M.WAY_END, bright); square(made.end, M.WAY_END_HOLE, dark); square(made.end, M.WAY_END_CORE, bright);
        square(made.pulse, M.WAY_PULSE + M.WAY_RIM * 2, dark); square(made.pulse, M.WAY_PULSE, bright);
        way.bitmaps = made;
        return made;
    }

    M.drawWay2D = function(spriteset, on) {
        const tilemap = spriteset && spriteset._tilemap;
        const count = on && tilemap && typeof Sprite !== "undefined" && typeof Bitmap !== "undefined" && M.wayCount > 1 ? M.wayCount : 0;
        if (!count && !way.layer) return;
        if (count && (!way.layer || way.layer.parent !== tilemap)) {
            // Its own layer under the characters, made after the marks': it lies over them.
            way.layer = new Sprite();
            way.layer.z = 1;
            way.sprites = []; way.pulses = [];
            tilemap.addChild(way.layer);
        }
        let used = 0;
        if (count) {
            wayTiles(false);
            const bitmaps = wayBitmaps(), tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            for (let k = 0; k < 2; k++) {
                if (way.pulses[k]) continue;
                const sprite = way.pulses[k] = new Sprite(bitmaps.pulse);
                sprite.anchor.x = 0.5; sprite.anchor.y = 0.5;
                sprite.visible = false;
                way.layer.addChild(sprite);
            }
            for (let i = 1; i < count; i++) {
                if (!wayOn[i]) continue;
                let sprite = way.sprites[used];
                // Under the travelling squares, whenever it is made.
                if (!sprite) { sprite = way.sprites[used] = new Sprite(); way.layer.addChildAt(sprite, 0); }
                sprite.bitmap = i === count - 1 ? bitmaps.end : bitmaps.square;
                sprite.x = wayX[i] * tw; sprite.y = wayY[i] * th;
                sprite.visible = true;
                used++;
            }
        }
        for (let i = used; i < way.sprites.length; i++) way.sprites[i].visible = false;
        for (const sprite of way.pulses) if (sprite) sprite.visible = false;
        way.used = used;
        way.layer.visible = used > 0 && !M.hidden;
    };

    /** The travelling square of a 2D map where it is this frame: two sprites, each on one of the two tiles it is between. */
    function pulseWay2D(frame) {
        const count = M.wayCount, tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const place = M.wayPulse(frame - way.born, count), first = Math.floor(place);
        for (let k = 0; k < 2; k++) {
            const sprite = way.pulses[k];
            if (!sprite) continue;
            const i = first + k, glow = place === place && i >= 1 && i < count && wayOn[i] ? M.wayGlow(i, place) : 0, end = i === count - 1;
            if (!(glow > 0.02)) { sprite.visible = false; continue; }
            const from = end ? M.WAY_END_CORE : M.WAY_SQUARE, to = end ? M.WAY_END_HOLE + 0.06 : M.WAY_PULSE, size = (from + (to - from) * glow) / M.WAY_PULSE;
            sprite.x = (wayX[i] + 0.5) * tw; sprite.y = (wayY[i] + 0.5) * th;
            sprite.scale.x = size; sprite.scale.y = size;
            sprite.opacity = Math.round(255 * glow);
            sprite.visible = true;
        }
    }

    /** Each frame while a way shows: the travelling square moves on. Nothing is made; with no way it costs a comparison. */
    M.pulseWay = function(spriteset) {
        const on = !M.hidden && M.wayCount > 1;
        if (!on) {
            if (!way.moving) return;
            way.moving = false;
            for (const sprite of way.pulses) if (sprite) sprite.visible = false;
            if (way.layer) way.layer.visible = false;
            return;
        }
        way.moving = true;
        const frame = frameNow();
        if (spriteset && spriteset._reactor3d) { pulseWay3D(frame); return; }
        if (!way.layer || !way.used) return;
        // (Back in the picture after a close shot hid the marks.)
        way.layer.visible = true;
        way.layer.x = Math.round($gameMap.adjustX(0) * $gameMap.tileWidth());
        way.layer.y = Math.round($gameMap.adjustY(0) * $gameMap.tileHeight());
        pulseWay2D(frame);
    };

    /** The number beside the destination: what the move costs. A picture per number, made the first time it shows. */
    function costBitmap(cost) {
        if (!way.labels) way.labels = new Map();
        const text = String(Math.round(cost * 10) / 10);
        let bitmap = way.labels.get(text);
        if (bitmap) return bitmap;
        bitmap = new Bitmap(56, 34);
        if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem.mainFontFace) bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = 24; bitmap.fontBold = true;
        bitmap.textColor = "#ffffff"; bitmap.outlineColor = "rgba(6,14,32,0.95)"; bitmap.outlineWidth = 5;
        bitmap.drawText(text, 0, 0, 56, 34, "center");
        way.labels.set(text, bitmap);
        return bitmap;
    }

    /** Each frame: the travelling square moves on, and the cost stands by the destination, where the view shows it now. */
    M.placeCost = function(spriteset) {
        M.pulseWay(spriteset);
        const live = spriteset._reactor3d || null;
        const shown = !M.hidden && M.wayCount > 1 && M.wayCost > 0 && typeof Sprite !== "undefined" && typeof Bitmap !== "undefined";
        if (!shown) { if (way.label) way.label.visible = false; return; }
        if (!way.label || way.label.parent !== spriteset) {
            way.label = new Sprite();
            way.label.anchor.x = 0.5; way.label.anchor.y = 1;
            way.shown = -1;
            spriteset.addChild(way.label);
        }
        const label = way.label, last = M.wayCount - 1;
        if (way.shown !== M.wayCost) { way.shown = M.wayCost; label.bitmap = costBitmap(M.wayCost); }
        // Past the destination, the way the unit arrives: never over the square before it.
        const ox = wayX[last] - wayX[last - 1], oy = wayY[last] - wayY[last - 1];
        if (live && live.camera && Reactor3D.projectToScreen) {
            const at = Reactor3D.projectToScreen(live.camera, wayX[last] + 0.5 + ox * 0.9, wayG[last] + 0.3, wayY[last] + 0.5 + oy * 0.9, way.out);
            if (!at) { label.visible = false; return; }
            label.x = Math.round(at.x); label.y = Math.round(at.y) + 17;
        } else {
            // Inside the picture.
            const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            label.x = clamp(Math.round(($gameMap.adjustX(wayX[last]) + 0.5 + ox * 0.9) * tw), 28, Graphics.width - 28);
            label.y = clamp(Math.round(($gameMap.adjustY(wayY[last]) + 0.5 + oy * 0.9) * th) + 17, 34, Graphics.height);
        }
        label.visible = true;
    };

    //-------------------------------------------------------------------------
    // What is drawn on and over every unit, so sides and states read at a
    // glance by day and by night: a ring on the ground under it in its
    // side's color (grey once it has acted this turn, a second ring in
    // yellow while it keeps watch), and a small HP bar over its head (dim
    // once it has acted, with a yellow mark while it keeps watch). Rings are
    // one instanced mesh on a 3D map and pooled sprites on a 2D one; bars
    // are pooled sprites on both. Nothing is made per frame.

    const U = F.UnitMarks = { MAX: 256, count: 0, hash: 0, shown: false, rings: null, scene: null, layer: null, bars: [], ground: null, spots: [], bitmaps: null, out: { x: 0, y: 0 } };
    U.TEAMS = ["ally", "enemy", "neutral"];
    U.COLORS = [0x4c9dff, 0xff5a4a, 0xc9d2da];
    // (The fourth: a vehicle's bar.)
    U.CSS = ["#4c9dff", "#ff5a4a", "#c9d2da", "#f2b33d"];
    U.VEHICLE_TEAM = 3;
    /** A vehicle's bar is this far over its rider's, and this far over the ground when nobody rides it, in tiles. */
    U.VEHICLE_OVER = 0.32; U.VEHICLE_TALL = 1.5;
    U.extra = 0;
    U.ACTED = 0x6f7884;
    U.WATCH = 0xffd23c;
    U.BAR_W = 46; U.BAR_H = 7;
    const ux = U.x = new Float32Array(U.MAX), uy = U.y = new Float32Array(U.MAX), ug = U.ground = new Float32Array(U.MAX), ut = U.tall = new Float32Array(U.MAX);
    const uw = U.w = new Float32Array(U.MAX), ud = U.d = new Float32Array(U.MAX), uhp = U.hp = new Float32Array(U.MAX);
    const uteam = U.team = new Uint8Array(U.MAX), uflags = U.flags = new Uint8Array(U.MAX);
    U.ACTED_FLAG = 1; U.WATCH_FLAG = 2;

    // Who is marked, as last read: the character of each, the body's middle from it, and where a flat map's bar sits over its row.
    const uchar = [], uox = new Float32Array(U.MAX), uoy = new Float32Array(U.MAX), ubar = U.bar = new Float32Array(U.MAX);

    /**
     * Every unit to mark, into the arrays (`U.x`, `U.y`: the middle of its body in tiles; `U.ground`, `U.tall`; `U.w`,
     * `U.d`: its body; `U.team` as an index of `U.TEAMS`; `U.hp` 0 to 1; `U.flags`). Read when the battle's
     * revision moved (someone acted, fell, joined, was hurt): between those only where each stands is read
     * (`U.track`). Returns a number that changes when anything a ring shows changed.
     */
    U.collect = function(fight) {
        U.count = 0;
        U.extra = 0;
        uchar.length = 0;
        if (!fight || !fight.isTactical() || !fight.isHere() || fight._ending || !fight._tac) { U.hash = 0; return 0; }
        const tac = fight._tac, team = fight.currentTeam();
        for (const unit of fight._units) {
            if (unit.gone || U.count >= U.MAX) continue;
            const c = fight.character(unit);
            if (!c || !(unit.team === "neutral" || fight.isAlive(unit))) continue;
            const i = U.count++, f = F.footprint(unit), battler = fight.battler(unit);
            uchar.push(c);
            uox[i] = f.ox + f.w / 2; uoy[i] = f.oy + f.h / 2;
            ut[i] = F.unitHeight(unit);
            uw[i] = f.w; ud[i] = f.h;
            uteam[i] = unit.team === "ally" ? 0 : unit.team === "enemy" ? 1 : 2;
            uhp[i] = battler && unit.team !== "neutral" ? clamp(battler.hpRate(), 0, 1) : -1;
            // Acted: in a side's turn, one of that side that is done; watch: on overwatch.
            uflags[i] = (tac.acted[unit.id] && (team === "any" || unit.team === team) ? U.ACTED_FLAG : 0) | (tac.watch && tac.watch[unit.id] ? U.WATCH_FLAG : 0);
            // On a flat map the bar sits over the picture's top, counted from the unit's own row: a one-cell unit's
            // picture stands `tall` over its cell's bottom edge; a big one's rises over its body's far edge by what
            // its rim shows from the map's pitch, and over its own cell by its whole height.
            const big = f.w > 1 || f.h > 1, lift = ut[i] * F.FLAT_PITCH;
            ubar[i] = big ? Math.min(f.oy - lift * F.BODY_RIM, 0.5 - lift) : 1 - ut[i];
        }
        // The party's vehicles that stand: a bar each and no ring (`U.extra`, after the units), over its rider's when it is ridden.
        U.extra = 0;
        for (const unit of typeof fight.vehicleUnits === "function" ? fight.vehicleUnits() : EMPTY) {
            const i = U.count + U.extra;
            if (i >= U.MAX) break;
            const c = fight.character(unit), battler = fight.battler(unit);
            if (!c || !battler || battler.isDead()) continue;
            const rider = typeof fight.vehicleRider === "function" ? fight.vehicleRider(unit) : null;
            U.extra++;
            uchar.push(c);
            uox[i] = 0.5; uoy[i] = 0.5;
            ut[i] = rider ? F.unitHeight(rider) + U.VEHICLE_OVER : U.VEHICLE_TALL;
            uw[i] = 1; ud[i] = 1;
            uteam[i] = U.VEHICLE_TEAM;
            uhp[i] = clamp(battler.hpRate(), 0, 1);
            uflags[i] = 0;
            ubar[i] = 1 - ut[i];
        }
        return U.track();
    };

    /** Where each marked unit stands now (it may be walking): a few numbers a unit, every frame. Returns the number `collect` does. */
    U.track = function() {
        let hash = 7;
        for (let i = 0; i < U.count + (U.extra || 0); i++) {
            const c = uchar[i];
            ux[i] = c._realX + uox[i]; uy[i] = c._realY + uoy[i];
            ug[i] = G.heightOf(c) + (Number(c._reactorAir) || 0);
            hash = (Math.imul(hash, 31) + Math.round(ux[i] * 32) * 7 + Math.round(uy[i] * 32) * 13 + Math.round(ug[i] * 16) * 3 + uteam[i] * 5 + uflags[i] * 11 + uw[i] * 17) | 0;
        }
        U.hash = U.count ? hash + (U.count + (U.extra || 0)) * 977 : 0;
        return U.hash;
    };

    U.FRAME_MAX = 512;
    // How far inside its body's edge a big unit's frame lies, how wide its band is, and how far outside it the watch's.
    U.FRAME_INSET = 0.1; U.FRAME_BAND = 0.11; U.FRAME_WATCH = 0.16;

    function ringMesh(scene, geometry, capacity, order) {
        // One-sided: the rings face up (see the way's squares).
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.renderOrder = order;
        scene.belowGroup().add(mesh);
        if (scene._meshes) scene._meshes.push(mesh);
        if (scene._materials) scene._materials.push(material);
        return mesh;
    }

    U.drawRings3D = function(live) {
        const scene = live && live.scene;
        if (!scene || typeof THREE === "undefined" || !scene.belowGroup) { if (U.rings) U.rings.count = 0; if (U.frames) U.frames.count = 0; return; }
        if (!U.rings || U.scene !== scene || !U.rings.parent) {
            const geometry = new THREE.RingGeometry(0.36, 0.47, 32);
            geometry.rotateX(-Math.PI / 2);
            U.rings = ringMesh(scene, geometry, U.MAX * 2, 4);
            U.matrix = new THREE.Matrix4();
            U.color = new THREE.Color();
            U.scene = scene;
            U.frames = null;
        }
        const rings = U.rings;
        let n = 0, m = 0;
        for (let i = 0; i < U.count; i++) {
            const acted = (uflags[i] & U.ACTED_FLAG) !== 0, watch = (uflags[i] & U.WATCH_FLAG) !== 0, tint = acted ? U.ACTED : U.COLORS[uteam[i]];
            if (uw[i] > 1 || ud[i] > 1) {
                // A big body: a frame round its cells, its band as wide as a ring's whatever the body's size (made the first time one is drawn).
                if (!U.frames || !U.frames.parent) {
                    const geometry = new THREE.PlaneGeometry(1, 1);
                    geometry.rotateX(-Math.PI / 2);
                    U.frames = ringMesh(scene, geometry, U.FRAME_MAX, 4);
                }
                m = frame3D(U.frames, m, i, U.FRAME_INSET, U.FRAME_BAND, 0.06, tint);
                if (watch) m = frame3D(U.frames, m, i, -U.FRAME_WATCH, U.FRAME_BAND * 0.7, 0.07, U.WATCH);
                continue;
            }
            U.matrix.set(1, 0, 0, ux[i], 0, 1, 0, ug[i] + 0.06, 0, 0, 1, uy[i], 0, 0, 0, 1);
            rings.setMatrixAt(n, U.matrix);
            rings.setColorAt(n, U.color.setHex(tint));
            n++;
            if (!watch) continue;
            U.matrix.set(1.3, 0, 0, ux[i], 0, 1, 0, ug[i] + 0.07, 0, 0, 1.3, uy[i], 0, 0, 0, 1);
            rings.setMatrixAt(n, U.matrix);
            rings.setColorAt(n, U.color.setHex(U.WATCH));
            n++;
        }
        rings.count = n;
        rings.visible = !M.hidden;
        rings.instanceMatrix.needsUpdate = true;
        if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
        if (U.frames) {
            U.frames.count = m;
            U.frames.visible = !M.hidden && m > 0;
            U.frames.instanceMatrix.needsUpdate = true;
            if (U.frames.instanceColor) U.frames.instanceColor.needsUpdate = true;
        }
    };

    /** Four bands round unit `i`'s body, `inset` inside its edge, each leaning with the ground between the body's corners. Returns the next free instance. */
    function frame3D(mesh, m, i, inset, band, lift, tint) {
        if (m + 4 > U.FRAME_MAX) return m;
        const x0 = ux[i] - uw[i] / 2 + inset, x1 = ux[i] + uw[i] / 2 - inset, z0 = uy[i] - ud[i] / 2 + inset, z1 = uy[i] + ud[i] / 2 - inset;
        // The ground under the body's corner cells, from the height the unit stands at.
        const cx0 = Math.round(ux[i] - uw[i] / 2), cx1 = Math.round(ux[i] + uw[i] / 2) - 1, cz0 = Math.round(uy[i] - ud[i] / 2), cz1 = Math.round(uy[i] + ud[i] / 2) - 1;
        const nw = G.groundAt(cx0, cz0, ug[i]), ne = G.groundAt(cx1, cz0, ug[i]), sw = G.groundAt(cx0, cz1, ug[i]), se = G.groundAt(cx1, cz1, ug[i]);
        const half = band / 2;
        m = band3D(mesh, m, x0 - half, nw, z0, x1 + half, ne, z0, band, lift, tint);
        m = band3D(mesh, m, x0 - half, sw, z1, x1 + half, se, z1, band, lift, tint);
        m = band3D(mesh, m, x0, nw, z0 - half, x0, sw, z1 + half, band, lift, tint);
        m = band3D(mesh, m, x1, ne, z0 - half, x1, se, z1 + half, band, lift, tint);
        return m;
    }

    /** One flat band from a to b, `wide` across, as an instance of a mesh of unit quads lying on the ground. */
    function band3D(mesh, m, ax, ay, az, bx, by, bz, wide, lift, tint) {
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        U.matrix.set(dx, 0, -dz / len * wide, (ax + bx) / 2, by - ay, 1, 0, (ay + by) / 2 + lift, dz, 0, dx / len * wide, (az + bz) / 2, 0, 0, 0, 1);
        mesh.setMatrixAt(m, U.matrix);
        mesh.setColorAt(m, U.color.setHex(tint));
        return m + 1;
    }

    function unitBitmaps() {
        if (U.bitmaps) return U.bitmaps;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight(), W = U.BAR_W, H = U.BAR_H;
        const made = { rings: [], fills: [], back: new Bitmap(W, H), watch: new Bitmap(13, 13), ring: (team, acted, watch) => made.rings[team * 4 + (acted ? 1 : 0) + (watch ? 2 : 0)] };
        // The bar's bed: dark, with a light edge so it reads on a dark deck.
        made.back.fillRect(0, 0, W, H, "rgba(232,238,246,0.9)");
        made.back.fillRect(1, 1, W - 2, H - 2, "rgba(10,14,22,0.92)");
        for (const css of U.CSS) { const fill = new Bitmap(W - 2, H - 2); fill.fillRect(0, 0, W - 2, H - 2, css); made.fills.push(fill); }
        // A unit on watch: a yellow lozenge by its bar.
        for (let row = 0; row < 13; row++) { const half = 6 - Math.abs(6 - row); made.watch.fillRect(6 - half, row, half * 2 + 1, 1, "rgba(20,16,0,0.95)"); }
        for (let row = 2; row < 11; row++) { const half = 4 - Math.abs(6 - row); made.watch.fillRect(6 - half, row, half * 2 + 1, 1, "#ffd23c"); }
        // The ring under a unit on a 2D map: an ellipse at its feet, by side, greyed once it has acted, doubled in yellow on watch.
        for (let team = 0; team < 3; team++) for (let state = 0; state < 4; state++) {
            const bitmap = new Bitmap(tw, th), context = bitmap.context;
            if (context && context.ellipse) {
                const draw = (rx, ry, width, tint) => { context.beginPath(); context.ellipse(tw / 2, th * 0.74, rx, ry, 0, 0, Math.PI * 2); context.lineWidth = width; context.strokeStyle = tint; context.stroke(); };
                if (state & 2) draw(tw * 0.47, th * 0.24, 2, "#ffd23c");
                draw(tw * 0.4, th * 0.19, 5, "rgba(6,10,18,0.8)");
                draw(tw * 0.4, th * 0.19, 3, state & 1 ? "#6f7884" : U.CSS[team]);
                if (bitmap.baseTexture && bitmap.baseTexture.update) bitmap.baseTexture.update();
            }
            made.rings.push(bitmap);
        }
        U.bitmaps = made;
        return made;
    }

    /** The frame round a big body on a 2D map: its cells' outline, by side and state, one picture per size (made the first time it shows). */
    function frameBitmap(w, h, team, acted, watch) {
        const key = w + h * 64 + team * 4096 + (acted ? 16384 : 0) + (watch ? 32768 : 0);
        if (!U.frameBitmaps) U.frameBitmaps = new Map();
        let bitmap = U.frameBitmaps.get(key);
        if (bitmap) return bitmap;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        bitmap = new Bitmap(w * tw, h * th);
        const context = bitmap.context;
        if (context && context.strokeRect) {
            const draw = (inset, width, tint) => { context.lineWidth = width; context.strokeStyle = tint; context.strokeRect(inset, inset, w * tw - inset * 2, h * th - inset * 2); };
            if (watch) draw(2, 2, "#ffd23c");
            draw(6, 5, "rgba(6,10,18,0.8)");
            draw(6, 3, acted ? "#6f7884" : U.CSS[team]);
            if (bitmap.baseTexture && bitmap.baseTexture.update) bitmap.baseTexture.update();
        }
        U.frameBitmaps.set(key, bitmap);
        return bitmap;
    }

    /** The rings of a 2D map, pooled, in a layer under the characters. */
    U.drawRings2D = function(spriteset, on) {
        const tilemap = spriteset._tilemap;
        if (!tilemap || typeof Sprite === "undefined" || (!on && !U.groundLayer)) return;
        if (!U.groundLayer || U.groundLayer.parent !== tilemap) {
            U.groundLayer = new Sprite();
            U.groundLayer.z = 1;
            U.spots = [];
            tilemap.addChild(U.groundLayer);
        }
        const count = on ? U.count : 0, tw = $gameMap.tileWidth(), th = $gameMap.tileHeight(), bitmaps = on ? unitBitmaps() : null;
        for (let i = 0; i < count; i++) {
            let sprite = U.spots[i];
            if (!sprite) { sprite = U.spots[i] = new Sprite(); U.groundLayer.addChild(sprite); }
            sprite.bitmap = uw[i] > 1 || ud[i] > 1 ? frameBitmap(uw[i], ud[i], uteam[i], uflags[i] & U.ACTED_FLAG, uflags[i] & U.WATCH_FLAG)
                : bitmaps.ring(uteam[i], uflags[i] & U.ACTED_FLAG, uflags[i] & U.WATCH_FLAG);
            sprite.x = (ux[i] - uw[i] / 2) * tw; sprite.y = (uy[i] - ud[i] / 2) * th;
            sprite.visible = true;
        }
        for (let i = count; i < U.spots.length; i++) U.spots[i].visible = false;
        U.groundLayer.visible = count > 0 && !M.hidden;
    };

    /** The bars, placed over each unit's head where the view shows it now (every frame, from the pool). */
    U.placeBars = function(spriteset, on) {
        if (typeof Sprite === "undefined" || typeof Bitmap === "undefined") return;
        if (!on && !U.layer) return;
        if (!U.layer || U.layer.parent !== spriteset) {
            U.layer = new Sprite();
            U.bars = [];
            spriteset.addChild(U.layer);
        }
        const live = spriteset._reactor3d || null, camera = live && live.camera && Reactor3D.projectToScreen ? live.camera : null;
        const count = on && !M.hidden ? U.count + (U.extra || 0) : 0, bitmaps = count ? unitBitmaps() : null;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight(), W = U.BAR_W, H = U.BAR_H;
        let used = 0;
        for (let i = 0; i < count; i++) {
            if (uhp[i] < 0) continue;
            let x = 0, y = 0;
            if (camera) {
                const at = Reactor3D.projectToScreen(camera, ux[i], ug[i] + ut[i] + 0.35, uy[i], U.out);
                if (!at || at.x < -W || at.y < -H || at.x > Graphics.width + W || at.y > Graphics.height + H) continue;
                x = at.x; y = at.y;
            } else {
                x = $gameMap.adjustX(ux[i]) * tw; y = $gameMap.adjustY(uchar[i]._realY + ubar[i]) * th - 4;
                if (x < -W || y < -H || x > Graphics.width + W || y > Graphics.height + H) continue;
            }
            let bar = U.bars[used];
            if (!bar) {
                bar = U.bars[used] = new Sprite(bitmaps.back);
                bar.anchor.x = 0.5; bar.anchor.y = 1;
                bar._fill = new Sprite(); bar._fill.x = 1 - W / 2; bar._fill.y = 1 - H;
                bar._watch = new Sprite(bitmaps.watch); bar._watch.x = -W / 2 - 15; bar._watch.y = -H - 3;
                bar.addChild(bar._fill); bar.addChild(bar._watch);
                bar._team = -1; bar._shown = -1;
                U.layer.addChild(bar);
            }
            used++;
            const wide = Math.max(uhp[i] > 0 ? 1 : 0, Math.round((W - 2) * uhp[i]));
            if (bar._team !== uteam[i]) { bar._team = uteam[i]; bar._fill.bitmap = bitmaps.fills[uteam[i]]; bar._shown = -1; }
            if (bar._shown !== wide) { bar._shown = wide; bar._fill.setFrame(0, 0, wide, H - 2); }
            bar._watch.visible = (uflags[i] & U.WATCH_FLAG) !== 0;
            bar.opacity = uflags[i] & U.ACTED_FLAG ? 120 : 255;
            bar.x = Math.round(x); bar.y = Math.round(y);
            bar.visible = true;
        }
        for (let i = used; i < U.bars.length; i++) U.bars[i].visible = false;
        U.layer.visible = used > 0;
    };

    /** Each frame, after the marks: who is marked is read (no more than that), rings are laid again when it changed, bars are placed. */
    U.update = function(spriteset) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        const on = !!fight && fight.isTactical() && fight.isHere() && !fight._ending;
        if (!on && !U.shown) return;
        const live = spriteset._reactor3d || null;
        const was = U.hash, rev = on ? fight.tac().rev : -1, serial = on ? fight._serial : -1;
        let hash = was;
        if (rev !== U.rev || serial !== U.serial) { U.rev = rev; U.serial = serial; hash = U.collect(on ? fight : null); }
        else hash = U.track();
        if (hash !== was || U.spriteset !== spriteset || U.deep !== !!live || U.hidden !== !!M.hidden) {
            U.spriteset = spriteset; U.deep = !!live; U.hidden = !!M.hidden;
            if (live) { U.drawRings2D(spriteset, false); U.drawRings3D(live); }
            else { U.drawRings3D(null); U.drawRings2D(spriteset, on); }
        }
        if (U.groundLayer && U.groundLayer.visible) {
            U.groundLayer.x = Math.round($gameMap.adjustX(0) * $gameMap.tileWidth());
            U.groundLayer.y = Math.round($gameMap.adjustY(0) * $gameMap.tileHeight());
        }
        U.placeBars(spriteset, on);
        U.shown = on;
    };

    M.update = function(spriteset) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        const show = !!fight && fight.isTactical() && fight.isHere();
        // A close shot shows no marks (ReactorFight.Marks.hidden); they come back as they were.
        if (M.hidden !== M.wasHidden) {
            M.wasHidden = M.hidden;
            if (M.mesh) M.mesh.visible = !M.hidden;
            if (M.ghost) M.ghost.visible = !M.hidden;
            if (way.mesh) way.mesh.visible = !M.hidden && M.wayCount > 1;
            if (M.layer) M.layer.visible = !M.hidden && M.deep === false && M.count > 0;
        }
        if (M.hidden) return;
        if (!show && M.rev === -1 && M.spriteset === spriteset) return;
        const live = spriteset._reactor3d || null;
        // A battle that is over shows no marks from that moment (its last words are said over a clear field).
        const rev = show ? fight.tac().rev : -1, over = show && !!fight._ending;
        if (rev !== M.rev || over !== M.over || M.serial !== (show ? fight._serial : -1) || M.spriteset !== spriteset || M.deep !== !!live) {
            M.rev = rev; M.over = over; M.serial = show ? fight._serial : -1; M.spriteset = spriteset; M.deep = !!live;
            M.collect(show ? fight : null);
            // The region the map keeps in sight is made from these marks.
            if (cut.rev !== -1 || live) cut.rev = -2;
            if (live) { M.draw2D(spriteset, 0); M.drawWay2D(spriteset, false); M.draw3D(live); M.drawWay3D(live); }
            else { M.draw3D(null); M.drawWay3D(null); M.draw2D(spriteset, M.count); M.drawWay2D(spriteset, true); }
        }
        if (M.layer && M.layer.visible) {
            M.layer.x = Math.round($gameMap.adjustX(0) * $gameMap.tileWidth());
            M.layer.y = Math.round($gameMap.adjustY(0) * $gameMap.tileHeight());
        }
    };

    function markBitmaps() {
        if (M.bitmaps) return M.bitmaps;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        M.bitmaps = M.CSS.map((css, kind) => {
            if (!kind) return null;
            const bitmap = new Bitmap(tw, th);
            if (kind === M.KINDS.cursor) {
                for (const [x, y, w, h] of [[0, 0, tw, 3], [0, th - 3, tw, 3], [0, 0, 3, th], [tw - 3, 0, 3, th]]) bitmap.fillRect(x, y, w, h, "rgba(255,255,255,0.95)");
            } else {
                // A filled cell with a brighter rim, so the grid reads on a dark deck and in daylight alike.
                bitmap.fillRect(1, 1, tw - 2, th - 2, css);
                const rim = M.RIM[kind];
                for (const [x, y, w, h] of [[1, 1, tw - 2, 2], [1, th - 3, tw - 2, 2], [1, 3, 2, th - 6], [tw - 3, 3, 2, th - 6]]) bitmap.fillRect(x, y, w, h, rim);
            }
            return bitmap;
        });
        return M.bitmaps;
    }

    M.draw2D = function(spriteset, count) {
        if (!count && !M.layer) return;
        const tilemap = spriteset._tilemap;
        if (!tilemap || typeof Sprite === "undefined") return;
        if (!M.layer || M.layer.parent !== tilemap) {
            M.layer = new Sprite();
            M.layer.z = 1;
            M.sprites = [];
            tilemap.addChild(M.layer);
        }
        const bitmaps = markBitmaps(), tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        for (let i = 0; i < count; i++) {
            let sprite = M.sprites[i];
            if (!sprite) { sprite = M.sprites[i] = new Sprite(); M.layer.addChild(sprite); }
            sprite.bitmap = bitmaps[markKind[i]];
            sprite.x = markX[i] * tw; sprite.y = markY[i] * th;
            sprite.visible = true;
        }
        for (let i = count; i < M.sprites.length; i++) M.sprites[i].visible = false;
        M.layer.visible = count > 0;
    };

    M.draw3D = function(live) {
        const scene = live && live.scene;
        if (!scene || typeof THREE === "undefined" || !scene.belowGroup) {
            if (M.mesh) M.mesh.count = 0;
            if (M.ghost) M.ghost.count = 0;
            return;
        }
        if (!M.mesh || M.scene !== scene || !M.mesh.parent) {
            const geometry = new THREE.PlaneGeometry(0.94, 0.94);
            geometry.rotateX(-Math.PI / 2);
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
            M.mesh = new THREE.InstancedMesh(geometry, material, M.CAPACITY);
            M.mesh.frustumCulled = false;
            M.mesh.count = 0;
            M.matrix = new THREE.Matrix4();
            M.color = new THREE.Color();
            M.scene = scene;
            M.ghost = null;
            scene.belowGroup().add(M.mesh);
            // The map scene disposes what it lists when the map goes.
            if (scene._meshes) scene._meshes.push(M.mesh);
            if (scene._materials) scene._materials.push(material);
        }
        if (!M.ghost || !M.ghost.parent) {
            // Marks on a level the view's quarter hides (a pitch facing away or seen edge-on) show through what hides
            // them, laid flat at their height: a pitch seen edge-on would show nothing of marks lying on it.
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
            M.ghost = new THREE.InstancedMesh(M.mesh.geometry, material, 256);
            M.ghost.frustumCulled = false;
            M.ghost.count = 0;
            M.ghost.renderOrder = 5;
            scene.belowGroup().add(M.ghost);
            if (scene._meshes) scene._meshes.push(M.ghost);
            if (scene._materials) scene._materials.push(material);
        }
        const ghost = M.ghost, tacView = $gameFight._tac && $gameFight._tac.view, yawNow = tacView && tacView.own && View.active() ? tacView.yaw : null;
        let hiddenCount = 0;
        const mesh = M.mesh, near = typeof $gamePlayer !== "undefined" && $gamePlayer ? $gamePlayer._reactorGround : undefined;
        for (let i = 0; i < M.count; i++) {
            const x = markX[i], y = markY[i], kind = markKind[i];
            const unit = Number.isFinite(markH[i]) ? null : $gameFight.unitAt(x, y);
            const from = Number.isFinite(markH[i]) ? markH[i] : unit ? G.heightOf($gameFight.character(unit)) : near;
            const height = Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.5, from) || 0;
            // The mark leans with the slope it lies on; a wall beside the cell does not tilt it.
            let sx = ((Reactor3D.groundHeightAt($dataMap, x + 0.9, y + 0.5, height) || 0) - (Reactor3D.groundHeightAt($dataMap, x + 0.1, y + 0.5, height) || 0)) / 0.8;
            let sz = ((Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.9, height) || 0) - (Reactor3D.groundHeightAt($dataMap, x + 0.5, y + 0.1, height) || 0)) / 0.8;
            if (Math.abs(sx) > 1.2) sx = 0;
            if (Math.abs(sz) > 1.2) sz = 0;
            M.matrix.set(1, 0, 0, x + 0.5, sx, 1, sz, height + (kind === M.KINDS.cursor ? 0.07 : 0.04), 0, 0, 1, y + 0.5, 0, 0, 0, 1);
            mesh.setMatrixAt(i, M.matrix);
            mesh.setColorAt(i, M.color.setHex(M.COLORS[kind]));
            if (yawNow !== null && Number.isFinite(markH[i]) && hiddenCount < 256 && 1 + sx * Math.sin(yawNow * Math.PI / 180) * 1.414 - sz * Math.cos(yawNow * Math.PI / 180) * 1.414 <= 0.3
                && View.onRoof(x, y, height)) {
                M.matrix.set(1, 0, 0, x + 0.5, 0, 1, 0, height + 0.05, 0, 0, 1, y + 0.5, 0, 0, 0, 1);
                ghost.setMatrixAt(hiddenCount, M.matrix);
                ghost.setColorAt(hiddenCount, M.color.setHex(kind === M.KINDS.cursor ? 0xffffff : M.COLORS[kind]));
                hiddenCount++;
            }
        }
        ghost.count = hiddenCount;
        ghost.visible = !M.hidden;
        ghost.instanceMatrix.needsUpdate = true;
        if (ghost.instanceColor) ghost.instanceColor.needsUpdate = true;
        mesh.count = M.count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    if (typeof Spriteset_Map !== "undefined") {
        const updateSpriteset = Spriteset_Map.prototype.update;
        Spriteset_Map.prototype.update = function() {
            updateSpriteset.call(this);
            M.update(this);
            M.placeCost(this);
            U.update(this);
        };
    }

    //-------------------------------------------------------------------------
    // The stock windows: ordinary command and list windows on the map scene,
    // made the first time a tactical battle needs them.

    const W = F.Windows = {};

    if (typeof Window_Command !== "undefined" && typeof Window_SkillList !== "undefined" && typeof Window_ItemList !== "undefined") {
        function Window_FightCommand() { this.initialize(...arguments); }
        Window_FightCommand.prototype = Object.create(Window_Command.prototype);
        Window_FightCommand.prototype.constructor = Window_FightCommand;
        Window_FightCommand.prototype.initialize = function(rect) {
            Window_Command.prototype.initialize.call(this, rect);
            this.openness = 0;
            this.deactivate();
        };
        Window_FightCommand.prototype.makeCommandList = function() {
            const fight = $gameFight, battler = fight.battler(fight.activeUnit());
            if (!battler) return;
            const attack = battler.attackSkillId(), guard = battler.guardSkillId();
            // Attack with nobody in its reach from here is grayed; the hint line says why (commandReason).
            // (One who rides has its vehicle's attack and skills with its own: reactor_vehicles_mount.js.)
            const unit = fight.activeUnit(), vehicle = typeof fight.vehicleAttacker === "function" ? fight.vehicleAttacker(unit) : null;
            const ridden = F.mountBattler ? F.mountBattler(unit) : null;
            this.addCommand(TextManager.attack, "attack", (battler.canAttack() || !!vehicle) && !fight.commandReason("attack"));
            this.addCommand(TextManager.skill, "skill", battler.skills().some(skill => skill.id !== attack && skill.id !== guard)
                || (!!ridden && !ridden.isDead() && ridden.skills().some(skill => skill.id !== ridden.attackSkillId() && skill.id !== ridden.guardSkillId())));
            this.addCommand(TextManager.item, "item", $gameParty.items().some(item => battler.canUse(item)));
            // On a vehicle: getting off; beside one: getting on.
            for (const entry of typeof fight.mountCommands === "function" ? fight.mountCommands(unit) : []) this.addCommand(entry.name, entry.symbol, entry.enabled);
            if (fight.canOverwatch(fight.activeUnit())) this.addCommand(F.term("overwatch"), "overwatch");
            this.addCommand(F.term("wait"), "wait");
            if (fight._turns === "team") this.addCommand(F.term("endTurn"), "endTurn");
            // With a crowd to order, the rest of the turn can play itself.
            if (fight._turns === "team" && !fight._act.moved && fight.pendingUnits().length >= 3) this.addCommand(F.term("auto"), "auto");
        };
        // Left and Right turn the unit where it stands; it keeps that facing when its turn ends.
        const TURN = [8, 6, 2, 4];
        Window_FightCommand.prototype.turnUnit = function(step) {
            const fight = $gameFight, character = fight.character(fight.activeUnit());
            if (!character) return;
            const next = TURN[(TURN.indexOf(character.direction()) + step + 4) % 4];
            // As the screen shows it: the same quarter the cursor keys are turned by. A unit that cannot turn says so.
            sound(fight.commandFace(next) ? "playCursor" : "playBuzzer");
        };
        Window_FightCommand.prototype.cursorRight = function() { this.turnUnit(1); };
        Window_FightCommand.prototype.cursorLeft = function() { this.turnUnit(-1); };
        root.Window_FightCommand = Window_FightCommand;

        function Window_FightSkill() { this.initialize(...arguments); }
        Window_FightSkill.prototype = Object.create(Window_SkillList.prototype);
        Window_FightSkill.prototype.constructor = Window_FightSkill;
        Window_FightSkill.prototype.initialize = function(rect) {
            Window_SkillList.prototype.initialize.call(this, rect);
            this.openness = 0;
        };
        Window_FightSkill.prototype.maxCols = function() { return 1; };
        // With the battle's own keys in force Page Up and Page Down give the view's actions: the lists page on those.
        const pageOnViewKeys = Base => function() {
            Base.prototype.processCursorMove.call(this);
            if (!this.isCursorMovable() || F.key("viewLeft") === F.KEYS.viewLeft) return;
            if (Input.isTriggered("viewRight")) this.cursorPagedown();
            else if (Input.isTriggered("viewLeft")) this.cursorPageup();
        };
        Window_FightSkill.prototype.processCursorMove = pageOnViewKeys(Window_SkillList);
        Window_FightSkill.prototype.includes = function(item) {
            return !!item && !!this._actor && item.id !== this._actor.attackSkillId() && item.id !== this._actor.guardSkillId();
        };
        root.Window_FightSkill = Window_FightSkill;

        function Window_FightItem() { this.initialize(...arguments); }
        Window_FightItem.prototype = Object.create(Window_ItemList.prototype);
        Window_FightItem.prototype.constructor = Window_FightItem;
        Window_FightItem.prototype.initialize = function(rect) {
            Window_ItemList.prototype.initialize.call(this, rect);
            this.openness = 0;
        };
        Window_FightItem.prototype.maxCols = function() { return 1; };
        Window_FightItem.prototype.includes = function(item) { return DataManager.isItem(item) && $gameParty.canUse(item); };
        Window_FightItem.prototype.isEnabled = function(item) { return $gameParty.canUse(item); };
        Window_FightItem.prototype.processCursorMove = pageOnViewKeys(Window_ItemList);
        root.Window_FightItem = Window_FightItem;

        W.create = function(scene) {
            const height = scene.calcWindowHeight(7, true), y = Math.max(0, Math.round((Graphics.boxHeight - height) / 2));
            const command = scene._fightCommandWindow = new Window_FightCommand(new Rectangle(16, y, 200, height));
            const list = new Rectangle(16 + 200, y, Math.min(400, Graphics.boxWidth - 232), scene.calcWindowHeight(6, true));
            const skills = scene._fightSkillWindow = new Window_FightSkill(list);
            const items = scene._fightItemWindow = new Window_FightItem(list);
            const fight = () => $gameFight;
            const ate = () => { In._ate = frameNow(); };
            command.setHandler("attack", () => fight().commandAttack());
            command.setHandler("skill", () => fight().commandOpenSkills());
            command.setHandler("item", () => fight().commandOpenItems());
            command.setHandler("overwatch", () => fight().commandOverwatch());
            // The unit's menu is another once it is on or off a vehicle: it is listed afresh.
            const relist = done => { if (done) { command._fightShown = false; command._fightUnit = 0; } else command.activate(); };
            command.setHandler("mount", () => relist(fight().commandMount()));
            command.setHandler("dismount", () => relist(fight().commandDismount()));
            command.setHandler("wait", () => fight().commandWait());
            // End Turn asks first when units that could still act would lose their turn.
            command.setHandler("endTurn", () => W.askEndTurn(scene));
            // Auto hands every unit still to act to itself: asked first.
            command.setHandler("auto", () => W.openMenu(scene, "auto", "command"));
            command.setHandler("cancel", () => { ate(); fight().commandCancel(); });
            // (A row of the vehicle the unit rides is the vehicle's to use: the list says whose each is.)
            skills.setHandler("ok", () => {
                const item = skills.item(), via = skills._rrVias && skills._rrVias[skills.index()] === "vehicle" ? "vehicle" : undefined;
                if (!item) return;
                // (The two on an aimed cell: whose the action is to be.)
                if (fight()._act && fight()._act.pick === "whom") { if (!fight().commandWhom(via || "rider")) skills.activate(); }
                else fight().commandSkill(item.id, via);
            });
            skills.setHandler("cancel", () => { ate(); fight().commandCancel(); });
            items.setHandler("ok", () => { const item = items.item(); if (item) fight().commandItem(item.id); });
            items.setHandler("cancel", () => { ate(); fight().commandCancel(); });
            for (const window of [command, skills, items]) { window.hide(); scene.addWindow(window); }
        };

        function syncWindow(window, shown, active, setup) {
            if (shown) {
                if (!window._fightShown) {
                    window._fightShown = true;
                    setup();
                    window.show();
                    window.open();
                }
                if (active && !window.active) window.activate();
                else if (!active && window.active) window.deactivate();
            } else if (window._fightShown) {
                window._fightShown = false;
                window.deactivate();
                window.close();
            }
        }

        /** Each frame: the window of the stage the player is at is open and takes the keys; the others are shut. */
        W.update = function(scene) {
            const fight = $gameFight;
            // The battle menu (reactor_fight_menu.js) shuts itself and opens on Cancel.
            if (W.updateMenu) W.updateMenu(scene);
            // The battle menu up: the unit's own menu waits shut behind it.
            const on = fight.isTactical() && fight.isHere() && F.stockWindows !== false && fight.awaitsPlayer() && !(W.isMenuOpen && W.isMenuOpen());
            const stage = on ? fight._act.stage : "";
            const menu = stage === "command" || stage === "skill" || stage === "item";
            if (!scene._fightCommandWindow) {
                if (!menu) return;
                W.create(scene);
            }
            const command = scene._fightCommandWindow, skills = scene._fightSkillWindow, items = scene._fightItemWindow;
            const unitId = on ? fight._act.unitId : 0;
            syncWindow(command, menu, stage === "command", () => {
                command.refresh();
                if (command._fightUnit !== unitId || command.index() < 0 || command.index() >= command.maxItems()) command.select(0);
                command._fightUnit = unitId;
            });
            syncWindow(skills, stage === "skill", true, () => {
                const unit = fight.activeUnit();
                skills.setActor(fight.battler(unit));
                if (typeof fight.rideList === "function") fight.rideList(skills, unit);
                skills.refresh();
                skills.select(Math.max(0, Math.min(skills.index(), skills.maxItems() - 1)));
            });
            syncWindow(items, stage === "item", true, () => { items.refresh(); items.select(Math.max(0, Math.min(items.index(), items.maxItems() - 1))); });
        };
    }

    if (typeof Scene_Map !== "undefined") {
        const updateScene = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            updateScene.call(this);
            if (W.update && ($gameFight.isActive() || this._fightCommandWindow)) W.update(this);
            // The battle's own keys while a Tactical battle is on this map; the ordinary ones the moment it is not.
            const controls = root.ReactorControls;
            if (controls && controls.setTactical) controls.setTactical($gameFight.isTactical() && $gameFight.isHere() && !$gameFight._ending);
        };
        // Another scene (the menu, a Classic battle, the title) has its own use for those keys.
        const terminateScene = Scene_Map.prototype.terminate;
        Scene_Map.prototype.terminate = function() {
            const controls = root.ReactorControls;
            if (controls && controls.setTactical) controls.setTactical(false);
            terminateScene.call(this);
        };

        // The dash key held doubles the pace of whatever the battle plays by itself: the other side's turn, a walk, an action.
        const isFastForward = Scene_Map.prototype.isFastForward;
        Scene_Map.prototype.isFastForward = function() {
            const fight = $gameFight;
            // The pace "skip" hurries the same way without the key, but only the units that decide for themselves:
            // the player's own walks and actions keep their pace.
            if (fight.isTactical() && fight.isHere() && !fight._ending && !fight.awaitsPlayer() && !$gameMessage.isBusy()
                && !SceneManager.isSceneChanging() && (Input.isPressed(F.key("skip")) || (F.pace() === "skip" && fight.tacticalState() === "enemy"))) return true;
            return isFastForward.call(this);
        };
    }

    //-------------------------------------------------------------------------
    // Set Terrain Cost.

    /** What a step onto a region or a terrain tag costs in a battle from now on: 0 shuts it, 1 (or nothing) is the ordinary step. */
    Game_Fight.prototype.setTerrainCost = function(type, id, cost) {
        if (!this._costs) this._costs = { region: {}, terrain: {}, rev: 0 };
        const table = type === "terrain" ? this._costs.terrain : this._costs.region;
        id = Math.floor(Number(id) || 0);
        if (id < (type === "terrain" ? 0 : 1)) return;
        if (!Number.isFinite(cost) || cost === 1) delete table[id];
        else table[id] = clamp(cost, 0, 20);
        this._costs.rev++;
        if (this._tac) this.touch();
    };

    if (typeof PluginManager !== "undefined" && PluginManager.registerCommand) {
        PluginManager.registerCommand("RPGReactor", "SetTerrainCost", function(args) {
            args = args || {};
            $gameFight.setTerrainCost(args.type === "terrain" ? "terrain" : "region", args.id, Number(args.cost));
        });
    }
})(globalThis);
