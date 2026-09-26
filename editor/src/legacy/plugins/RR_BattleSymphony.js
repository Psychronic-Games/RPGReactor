/*:
 * @target MZ
 * @plugindesc Battle Symphony (VX Ace), for imported games
 * @author Yami; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_BattleSymphony.js
 *
 * Yami's Battle Symphony: a side view where the party stands at the set
 * positions drawn with their walking sheets, facing the party direction, and
 * the enemies face them (as walking sheets when their note says
 * <battler set: name, index>). Every skill and item plays an action sequence:
 * the lists in its note between <setup action>, <whole action>,
 * <target action> (once per target), <follow action> and <finish action>,
 * or the default lists for magic, physical skills and items. The lines move
 * battlers (move, jump, teleport), show, swing, turn and throw icons of the
 * weapons and items, play animations, apply the skill's effect at the chosen
 * moment, wait, and nest if/unless ... end blocks. Criticals, misses,
 * evasion, damage, counterattacks and reflections play their own lists.
 *
 * Carried with it, when the game had them (the settings say which):
 *   Enemy Charset      <battler set: name, index>, <weapon 1: n>,
 *                      <weapon 2: n>, <shield: n> on enemies.
 *   Visual Effect      afterimage, effect (whiten, blink ...), screen
 *                      (flash, shake, tone, fade, darken, lighten), vanish,
 *                      movie; hide nonfocus / show nonfocus.
 *   Holder Battlers    <holders battler: name>: a 4 x 14 pose sheet; stance
 *                      lines choose its row.
 *   Fancy Death        <animation collapse: n> plays when the battler falls.
 *   Battler Orientation  face: target, left|right|up|down|1-9|reverse.
 *   Durability scale   damage change durability scale: n%, the damage change
 *                      scaled by the user's weapons' durability (the
 *                      durability port answers it).
 *
 * The sequences run a frame at a time while the action is taken; the effect
 * itself goes through the battle's own action flow, so popups, steals, costs,
 * states and durability behave as they do without the sequences. Other
 * plugins add their own lines with
 *   Scene_Battle.prototype.rrImportedSymphony(action, { values, targets,
 *     actionTargets, subject }) (answer true for a line taken).
 *
 * The original's slips are kept: a line such as "wait 60" with no colon does
 * nothing, "wait for animation" does not wait, an "icon ... fade out, wait"
 * does not wait, a nested if inside a false one ends the outer one early, an
 * <\setup action> closing tag leaves the block open. A condition the original
 * could not evaluate (it stopped the game) counts as false.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param emptyView
 * @type boolean
 * @default false
 *
 * @param partyDirection
 * @type number
 * @default 4
 *
 * @param actorsPosition
 * @type multiline_string
 * @default {"0":[480,224],"1":[428,244],"2":[472,264],"3":[422,284]}
 *
 * @param weaponIconNonCharset
 * @type boolean
 * @default false
 *
 * @param disableAutoMovePose
 * @type boolean
 * @default true
 *
 * @param battlerShadow
 * @type boolean
 * @default false
 *
 * @param enemyAttackAnimation
 * @type animation
 * @default 0
 *
 * @param autoImmortalOff
 * @type boolean
 * @default true
 *
 * @param alwaysCounter
 * @type boolean
 * @default false
 *
 * @param defaultActions
 * @type multiline_string
 * @default {}
 *
 * @param autoSymphony
 * @type multiline_string
 * @default {}
 *
 * @param enemyCharset
 * @type boolean
 * @default true
 *
 * @param visualEffect
 * @type boolean
 * @default true
 *
 * @param holdersBattler
 * @type boolean
 * @default true
 *
 * @param fancyDeath
 * @type boolean
 * @default true
 *
 * @param orientation
 * @type boolean
 * @default true
 *
 * @param durabilityScale
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_BattleSymphony');
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const json = (v, d) => { try { return v ? JSON.parse(v) || d : d; } catch (_) { return d; } };

    const EMPTY_VIEW = bool(params.emptyView, false);
    const PARTY_DIRECTION = num(params.partyDirection, 4);
    const ACTORS_POSITION = json(params.actorsPosition, { 0: [480, 224], 1: [428, 244], 2: [472, 264], 3: [422, 284] });
    const WEAPON_ICON_NON_CHARSET = bool(params.weaponIconNonCharset, false);
    const DISABLE_AUTO_MOVE_POSE = bool(params.disableAutoMovePose, true);
    const BATTLER_SHADOW = bool(params.battlerShadow, false);
    const ENEMY_ATTACK_ANIMATION = num(params.enemyAttackAnimation, 0);
    const AUTO_IMMORTAL_OFF = bool(params.autoImmortalOff, true);
    const ALWAYS_COUNTER = bool(params.alwaysCounter, false);
    const ADDON = {
        charset: bool(params.enemyCharset, true), visual: bool(params.visualEffect, true), holders: bool(params.holdersBattler, true),
        fancyDeath: bool(params.fancyDeath, true), orientation: bool(params.orientation, true), durability: bool(params.durabilityScale, true)
    };
    const L = (action, values) => (values === undefined ? [action] : [action, values]);
    const DEFAULTS = Object.assign({
        MAGIC_SETUP: [L('MESSAGE'), L('MOVE USER', ['FORWARD', 'WAIT'])],
        MAGIC_WHOLE: [L('IMMORTAL', ['TARGETS', 'TRUE']), L('AUTO SYMPHONY', ['SKILL FULL'])],
        MAGIC_TARGET: [], MAGIC_FOLLOW: [L('WAIT FOR MOVE')],
        MAGIC_FINISH: [L('IMMORTAL', ['TARGETS', 'FALSE']), L('AUTO SYMPHONY', ['RETURN ORIGIN']), L('WAIT FOR MOVE'), L('WAIT', ['12', 'SKIP'])],
        PHYSICAL_SETUP: [L('MESSAGE'), L('MOVE USER', ['FORWARD', 'WAIT'])],
        PHYSICAL_WHOLE: [],
        PHYSICAL_TARGET: [L('IMMORTAL', ['TARGETS', 'TRUE']), L('POSE', ['USER', 'FORWARD']), L('STANCE', ['USER', 'FORWARD']),
            L('MOVE USER', ['TARGET', 'BODY', 'WAIT']), L('AUTO SYMPHONY', ['SINGLE SWING']),
            L('AUTO SYMPHONY', ['SKILL FULL', 'unless attack']), L('AUTO SYMPHONY', ['ATTACK FULL', 'if attack'])],
        PHYSICAL_FOLLOW: [L('WAIT FOR MOVE')],
        PHYSICAL_FINISH: [L('IMMORTAL', ['TARGETS', 'FALSE']), L('ICON DELETE', ['USER', 'WEAPON']), L('AUTO SYMPHONY', ['RETURN ORIGIN']), L('WAIT FOR MOVE')],
        ITEM_SETUP: [L('MESSAGE'), L('MOVE USER', ['FORWARD', 'WAIT']), L('AUTO SYMPHONY', ['ITEM FLOAT'])],
        ITEM_WHOLE: [L('IMMORTAL', ['TARGETS', 'TRUE']), L('AUTO SYMPHONY', ['ITEM FULL'])],
        ITEM_TARGET: [], ITEM_FOLLOW: [L('WAIT FOR MOVE'), L('IMMORTAL', ['TARGETS', 'FALSE'])],
        ITEM_FINISH: [L('AUTO SYMPHONY', ['RETURN ORIGIN']), L('WAIT FOR MOVE'), L('WAIT', ['12', 'SKIP'])],
        CRITICAL_ACTIONS: [L('SCREEN', ['FLASH', '60', '255', '255', '255'])],
        MISS_ACTIONS: [L('POSE', ['TARGET', 'EVADE'])],
        EVADE_ACTIONS: [L('MOVE TARGET', ['BACKWARD', 'WAIT'])],
        FAIL_ACTIONS: [],
        DAMAGED_ACTION: [L('POSE', ['TARGET', 'DAMAGE']), L('STANCE', ['TARGET', 'STRUCK'])],
        COUNTER_ACTION: [L('ICON DELETE', ['TARGET', 'WEAPON']), L('AUTO SYMPHONY', ['SINGLE SWING COUNTER']), L('AUTO SYMPHONY', ['SKILL FULL COUNTER']), L('ICON DELETE', ['COUNTER SUBJECT', 'WEAPON'])],
        REFLECT_ACTION: [L('ICON DELETE', ['TARGET', 'WEAPON']), L('SKILL ANIMATION', ['TARGETS', 'WAIT', 'if attack']), L('SKILL ANIMATION', ['USER', 'WAIT', 'unless attack']), L('AUTO SYMPHONY', ['SKILL FULL COUNTER'])],
        SUBSTITUTE_ACTION: [L('TELEPORT SUBSTITUTE SUBJECT', ['TARGET', 'BODY', 'WAIT'])],
        SUBSTITUTE_END_ACTION: [L('TELEPORT SUBSTITUTE SUBJECT', ['ORIGIN', 'WAIT'])]
    }, json(params.defaultActions, {}));
    const AUTO = json(params.autoSymphony, {});
    const hasAuto = (key) => Object.prototype.hasOwnProperty.call(AUTO, key);

    const yea = PluginManager.parameters('RR_YanflyBattleEngine');
    const YEA_BLINK = String(yea.blink) !== 'false', YEA_FLASH_WHITE = String(yea.flashWhite) !== 'false';
    const core = PluginManager.parameters('RR_YanflyCore');
    // ANI WAIT counts animation frames: Yanfly's rate when the Core Engine came along, otherwise 4.
    const ANIMATION_RATE = Object.keys(core).length ? (Number(core.animationRate) || 4) : 4;

    const inBattle = () => SceneManager._scene instanceof Scene_Battle;
    const battleScene = () => (inBattle() ? SceneManager._scene : null);
    const spriteset = () => { const s = battleScene(); return s ? s._spriteset : null; };
    // The side view is drawn while a battle scene is up (its sprites are made before the party is marked in battle).
    const view = () => !EMPTY_VIEW && inBattle();
    const rubyTrue = (v) => v !== false && v !== null && v !== undefined;
    // Ruby's Integer#/ floors; a float on either side divides exactly.
    const div = (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b);
    const toI = (v) => { const m = /^\s*[-+]?\d+/.exec(String(v ?? '')); return m ? parseInt(m[0], 10) : 0; };
    const toF = (v) => { const m = /^\s*[-+]?\d+(\.\d+)?/.exec(String(v ?? '')); return m ? parseFloat(m[0]) : 0; };
    const up = (s) => String(s ?? '').toUpperCase();
    const uniq = (list) => Array.from(new Set(list));
    const compact = (list) => list.filter(b => b !== null && b !== undefined);

    //-------------------------------------------------------------------------
    // Directions and poses
    //-------------------------------------------------------------------------
    const Dir = {
        pose: (d) => ({ 4: 'left', 6: 'right', 8: 'up', 2: 'down', 7: 'left', 1: 'left', 9: 'right', 3: 'right' }[d] || null),
        direction: (p) => ({ left: 4, right: 6, up: 8, down: 2 }[p] || null),
        opposite: (d) => ({ 1: 9, 2: 8, 3: 7, 4: 6, 6: 4, 7: 3, 8: 2, 9: 1 }[d] ?? d),
        // The eight-way direction from one point toward another, in tenths of a degree; none for the same point.
        faceCoordinate(sx, sy, dx, dy) {
            const x1 = Math.trunc(sx), x2 = Math.trunc(dx);
            const y1 = Graphics.height - Math.trunc(sy), y2 = Graphics.height - Math.trunc(dy);
            if (x1 === x2 && y1 === y2) return null;
            const a = Math.trunc(Math.atan2(y2 - y1, x2 - x1) * 1800 / Math.PI);
            if (a >= -225 && a <= 225) return 6;
            if (a >= 226 && a <= 675) return 9;
            if (a >= 676 && a <= 1125) return 8;
            if (a >= 1126 && a <= 1575) return 7;
            if ((a >= 1576 && a <= 1800) || (a >= -1800 && a <= -1576)) return 4;
            if (a >= -1575 && a <= -1126) return 1;
            if (a >= -1125 && a <= -676) return 2;
            if (a >= -675 && a <= -226) return 3;
            return null;
        },
        // Holder battler rows: [row, frames between patterns].
        indexHb: (pose) => ({ idle: [0, 12], struck: [3, 10], woozy: [2, 12], victory: [10], defend: [1, 5], dead: [12],
            attack: [4, 4], skill: [6, 6], magic: [7, 6], item: [5, 6], advance: [8, 5], retreat: [9, 5] }[pose] || [0, 12]),
        autoPoseHb: (b) => (b.isDead() ? 'dead' : b.hp < div(b.mhp, 4) ? 'woozy' : 'idle')
    };
    window.RRBattleSymphony = { Dir };

    //-------------------------------------------------------------------------
    // Notes
    //-------------------------------------------------------------------------
    const noteLines = (obj) => String((obj && obj.note) || '').split(/[\r\n]+/);
    const cache = (obj, key, make) => {
        if (!obj) return make(null);
        if (!Object.prototype.hasOwnProperty.call(obj, key)) Object.defineProperty(obj, key, { value: make(obj), configurable: true, writable: true });
        return obj[key];
    };
    const PHASES = ['setup', 'whole', 'target', 'follow', 'finish'];
    const TAGS = {};
    for (const phase of PHASES) {
        const name = phase.toUpperCase() + '_ACTION|' + phase + ' action|' + phase;
        TAGS[phase] = [new RegExp('<(?:' + name + ')>', 'i'), new RegExp('<\\/(?:' + name + ')>', 'i')];
    }
    /** An item's five lists: the defaults for its kind, each replaced by its note block. Each block's flag stays up until
     * that block's own closing tag, and a line goes to the first open block in setup..finish order (an unclosed
     * block keeps taking lines). */
    function parseSymphony(obj) {
        const lists = { setup: [], whole: [], target: [], follow: [], finish: [], atk1: ENEMY_ATTACK_ANIMATION, atk2: 0 };
        if (!obj) return lists;
        for (const line of noteLines(obj)) {
            let m;
            if ((m = /<(?:ATK_ANI_1|atk ani 1):[ ]*(\d+)>/i.exec(line))) lists.atk1 = Number(m[1]);
            else if ((m = /<(?:ATK_ANI_2|atk ani 2):[ ]*(\d+)>/i.exec(line))) lists.atk2 = Number(m[1]);
        }
        const kind = DataManager.isSkill(obj) ? (obj.hitType === 1 ? 'PHYSICAL' : 'MAGIC') : DataManager.isItem(obj) ? 'ITEM' : null;
        if (kind) for (const phase of PHASES) lists[phase] = DEFAULTS[kind + '_' + phase.toUpperCase()] || [];
        const flags = {};
        let tag = false;
        outer: for (const line of noteLines(obj)) {
            for (const phase of PHASES) {
                if (TAGS[phase][0].test(line)) { tag = true; lists[phase] = []; flags[phase] = true; continue outer; }
                if (TAGS[phase][1].test(line)) { tag = false; flags[phase] = false; continue outer; }
            }
            if (!tag) continue;
            let action, values;
            const m = /[ ]*(.*):[ ]*(.*)/.exec(line);
            if (m) { action = m[1]; values = m[2].match(/[^, ]+[^,]*/g) || []; }
            else { action = /[ ]*(.*)/.exec(line)[1]; values = [null]; }
            const phase = PHASES.find(p => flags[p]);
            if (phase) lists[phase].push([action, values]);
        }
        return lists;
    }
    const symphonyOf = (obj) => cache(obj, '_rrSymphony', parseSymphony);
    const validActions = (obj, phase) => symphonyOf(obj)[phase].length > 0;

    const enemyNotes = (enemy) => cache(enemy, '_rrSymphonyEnemy', (e) => {
        const out = { charsetName: null, charsetIndex: null, weapon1: null, weapon2: null, shield: null, holders: null, collapse: null };
        for (const line of noteLines(e)) {
            let m;
            if (ADDON.charset && (m = /<(?:BATTLER_SET|battler set):[ ]*(.*)>/i.exec(line))) {
                const scan = m[1].match(/[^,]+/g) || [];
                out.charsetName = scan[0] ?? null;
                out.charsetIndex = toI(scan[1]);
            } else if (ADDON.charset && (m = /<(?:WEAPON_1|weapon 1):[ ]*(\d+)>/i.exec(line))) out.weapon1 = Number(m[1]);
            else if (ADDON.charset && (m = /<(?:WEAPON_2|weapon 2):[ ]*(\d+)>/i.exec(line))) out.weapon2 = Number(m[1]);
            else if (ADDON.charset && (m = /<(?:SHIELD):[ ]*(\d+)>/i.exec(line))) out.shield = Number(m[1]);
            if (ADDON.holders && (m = /<(?:HOLDERS_BATTLER|holders battler):[ ]*(.*)>/i.exec(line))) out.holders = m[1];
            if (ADDON.fancyDeath && (m = /<(?:ANIMATION_COLLAPSE|animation collapse):[ ]*(\d+)/i.exec(line))) out.collapse = Number(m[1]);
        }
        return out;
    });
    const holdersName = (obj) => (ADDON.holders ? cache(obj, '_rrHolders', (o) => {
        let name = null;
        for (const line of noteLines(o)) { const m = /<(?:HOLDERS_BATTLER|holders battler):[ ]*(.*)>/i.exec(line); if (m) name = m[1]; }
        return name;
    }) : null);
    const collapseAnimation = (obj) => (ADDON.fancyDeath ? cache(obj, '_rrCollapseAni', (o) => {
        let id = null;
        for (const line of noteLines(o)) { const m = /<(?:ANIMATION_COLLAPSE|animation collapse):[ ]*(\d+)/i.exec(line); if (m) id = Number(m[1]); }
        return id;
    }) : null);

    //-------------------------------------------------------------------------
    // Battler visuals: position, movement, pose, icons (kept off the save)
    //-------------------------------------------------------------------------
    const VIS = new WeakMap();
    const V = (b) => {
        let v = VIS.get(b);
        if (!v) {
            v = { ox: null, oy: null, dx: 0, dy: 0, mxr: 0, myr: 0, arc: 0, par: {}, arcY: 0, direction: null, pose: null, poseSerial: 0,
                forcePose: false, reversePose: false, immortal: false, icons: new Map(), afterimage: false, vanishing: false, mirror: false, magicReflection: false };
            VIS.set(b, v);
        }
        return v;
    };
    window.RRBattleSymphony.visual = V;

    const B = Game_Battler.prototype;
    Game_Actor.prototype.screenX = function() { return this._screenX || 0; };
    Game_Actor.prototype.screenY = function() { return this._screenY || 0; };
    B.rrSymScreenZ = function() { return 100; };
    B.rrSymUseHb = function() {
        return !!(this.isActor() ? holdersName(this.actor()) : holdersName(this.enemy()));
    };
    B.rrSymHoldersName = function() { return this.isActor() ? holdersName(this.actor()) : holdersName(this.enemy()); };
    B.rrSymUseCharset = function() { return false; };
    Game_Actor.prototype.rrSymUseCharset = function() { return !this.rrSymUseHb(); };
    Game_Enemy.prototype.rrSymUseCharset = function() {
        if (this.rrSymUseHb()) return false;
        return this._rrCharsetName !== null && this._rrCharsetName !== undefined;
    };
    // Only holder battlers are "custom" here (the eight-direction add-on is not part of these games).
    B.rrSymCustomCharset = function() { return this.rrSymUseHb(); };
    B.rrSymCharacterName = function() { return this.isActor() ? this.characterName() : this._rrCharsetName; };
    B.rrSymCharacterIndex = function() { return this.isActor() ? this.characterIndex() : this._rrCharsetIndex; };
    B.rrSymSprite = function() {
        const set = spriteset();
        return set && set.findTargetSprite ? set.findTargetSprite(this) || null : null;
    };
    const _enemySetup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _enemySetup.call(this, enemyId, x, y);
        const notes = enemyNotes($dataEnemies[enemyId]);
        this._rrCharsetName = notes.charsetName;
        this._rrCharsetIndex = notes.charsetName === null ? null : notes.charsetIndex;
    };
    // Enemy Charset's equipment: weapons from <weapon 1/2>, a shield from <shield> (no shield: nil, as the original).
    B.rrSymWeapons = function() { return this.isActor() ? this.weapons() : []; };
    B.rrSymEquips = function() { return this.isActor() ? this.equips() : []; };
    B.rrSymDualWield = function() { return this.isActor() ? this.isDualWield() : false; };
    Game_Enemy.prototype.rrSymWeapons = function() {
        const n = enemyNotes(this.enemy()), out = [];
        if (n.weapon1) out.push($dataWeapons[n.weapon1]);
        if (n.weapon2) out.push($dataWeapons[n.weapon2]);
        return out;
    };
    Game_Enemy.prototype.rrSymEquips = function() {
        const n = enemyNotes(this.enemy());
        return n.shield ? [$dataArmors[n.shield]] : null;
    };
    Game_Enemy.prototype.rrSymDualWield = function() { const n = enemyNotes(this.enemy()); return !!(n.weapon1 && n.weapon2); };
    Game_Enemy.prototype.attackAnimationId1 = function() { return symphonyOf(this.enemy()).atk1; };
    Game_Enemy.prototype.attackAnimationId2 = function() { return symphonyOf(this.enemy()).atk2; };

    // The battler's current action while a sequence runs: the one being taken (MZ has already taken it off the list).
    B.rrSymCurrentAction = function() {
        const S = battleScene() && battleScene()._rrSym;
        if (S && S.subject === this && S.act) return S.act;
        return this.currentAction() || null;
    };
    B.rrSymDualAttack = function() {
        const action = this.rrSymCurrentAction();
        return this.isActor() && !!action && action.isAttack() && this.rrSymDualWield() && this.weapons().length > 1;
    };

    // Pose writer: tells the sprite to restart its pattern.
    B.rrSymSetPose = function(pose) {
        const v = V(this);
        v.pose = pose;
        if (this.isActor() && !$gameParty.battleMembers().includes(this)) return;
        v.poseSerial++;
    };
    B.rrSymBreakPose = function() {
        const v = V(this);
        v.direction = this.isEnemy() ? Dir.opposite(PARTY_DIRECTION) : PARTY_DIRECTION;
        v.pose = Dir.pose(v.direction);
        v.forcePose = false;
        v.reversePose = false;
        if (this.rrSymUseHb()) {
            v.pose = Dir.autoPoseHb(this);
            if (!this.rrSymSprite()) return;
            v.direction = this.isEnemy() ? Dir.opposite(PARTY_DIRECTION) : PARTY_DIRECTION;
            v.mirror = [9, 6, 3].includes(v.direction);
        }
    };
    B.rrSymForcePoseHb = function(pose) {
        if (!this.rrSymUseHb() || !this.isAppeared()) return;
        this.rrSymBreakPose();
        this.rrSymSetPose(pose);
        V(this).forcePose = true;
    };
    // The default position: the move is ended where the battler stands (the original zeroed a misspelt rate, so a
    // battler still moving stops on the spot); an actor's home is set the first time.
    B.rrSymSetDefaultPosition = function() {
        const v = V(this);
        v.dx = this._screenX || 0;
        v.dy = this._screenY || 0;
        if (this.rrSymUseHb()) this.rrSymSetPose(Dir.autoPoseHb(this));
    };
    Game_Actor.prototype.rrSymSetDefaultPosition = function() {
        B.rrSymSetDefaultPosition.call(this);
        const v = V(this);
        if (v.ox !== null && v.oy !== null) return;
        if (!$gameParty.battleMembers().includes(this)) return;
        const home = ACTORS_POSITION[this.index()] || [0, 0];
        v.ox = this._screenX = v.dx = home[0];
        v.oy = this._screenY = v.dy = home[1];
    };
    B.rrSymResetPosition = function() { this.rrSymBreakPose(); };
    Game_Actor.prototype.rrSymResetPosition = function() {
        B.rrSymResetPosition.call(this);
        V(this).ox = V(this).oy = null;
    };
    B.rrSymCorrectOrigin = function() {
        const v = V(this);
        if (v.ox === null) v.ox = this._screenX;
        if (v.oy === null) v.oy = this._screenY;
    };
    Game_Actor.prototype.rrSymCorrectOrigin = function() {
        const v = V(this);
        if (v.ox !== null && v.oy !== null) return;
        const home = ACTORS_POSITION[this.index()] || [0, 0];
        v.ox = this._screenX = home[0];
        v.oy = this._screenY = home[1];
    };
    B.rrSymFaceCoordinate = function(x, y) {
        const v = V(this);
        const direction = Dir.faceCoordinate(this._screenX, this._screenY, x, y);
        v.direction = direction;
        if (this.rrSymUseHb()) return;
        if (DISABLE_AUTO_MOVE_POSE && this.rrSymCustomCharset()) return;
        v.pose = Dir.pose(direction);
    };
    B.rrSymFaceDirection = function(direction) {
        const v = V(this);
        v.direction = direction;
        if (this.rrSymCustomCharset()) v.mirror = [9, 6, 3].includes(direction);
        if (this.rrSymUseHb()) return;
        if (DISABLE_AUTO_MOVE_POSE && this.rrSymCustomCharset()) return;
        v.pose = Dir.pose(direction);
    };
    B.rrSymCreateMovement = function(x, y, frames = 12) {
        const v = V(this);
        if (this._screenX === x && this._screenY === y) return;
        v.dx = x;
        v.dy = y;
        frames = Math.max(frames, 1);
        v.mxr = Math.max(div(Math.abs(this._screenX - v.dx), frames), 2);
        v.myr = Math.max(div(Math.abs(this._screenY - v.dy), frames), 2);
    };
    B.rrSymCreateJump = function(arc) {
        const v = V(this);
        v.arc = arc;
        v.par = { x: 0, y0: 0, y1: v.dy - this._screenY, h: -(0 + arc * 5), d: Math.abs(this._screenX - v.dx) };
    };
    B.rrSymIsMoving = function() { const v = V(this); return v.mxr !== 0 || v.myr !== 0; };
    // A move's rates drop the frame after the battler arrives, so a wait for movement lasts one frame more.
    B.rrSymUpdateMovement = function() {
        if (!this.rrSymIsMoving()) return;
        const v = V(this);
        if (this._screenX === v.dx || v.mxr === null) v.mxr = 0;
        if (this._screenY === v.dy || v.myr === null) v.myr = 0;
        let value = Math.min(Math.abs(this._screenX - v.dx), v.mxr);
        this._screenX += v.dx > this._screenX ? value : -value;
        value = Math.min(Math.abs(this._screenY - v.dy), v.myr);
        this._screenY += v.dy > this._screenY ? value : -value;
    };
    B.rrSymUpdateJump = function() {
        if (!this.rrSymIsMoving()) return;
        const v = V(this), p = v.par;
        const value = Math.min(Math.abs(this._screenX - v.dx), v.mxr);
        this._screenX += v.dx > this._screenX ? value : -value;
        p.x += value;
        this._screenY -= v.arcY;
        if (v.dx === this._screenX) {
            this._screenY = v.dy;
            v.arcY = 0;
            v.arc = 0;
        } else {
            const a = (2.0 * (p.y0 + p.y1) - 4 * p.h) / (p.d * p.d);
            const b = (p.y1 - p.y0 - a * (p.d * p.d)) / p.d;
            v.arcY = a * p.x * p.x + b * p.x + p.y0;
        }
        this._screenY += v.arcY;
        if (this._screenX === v.dx) v.mxr = 0;
        if (this._screenY === v.dy) v.myr = 0;
    };
    B.rrSymUpdateVisual = function() {
        if (!inBattle() || !spriteset()) return;
        this.rrSymCorrectOrigin();
        if (V(this).arc === 0) this.rrSymUpdateMovement(); else this.rrSymUpdateJump();
        for (const icon of Array.from(V(this).icons.values())) icon.update();
    };

    // Icons
    B.rrSymCreateIcon = function(symbol, iconId = 0) {
        this.rrSymDeleteIcon(symbol);
        let object, id = iconId;
        const weapons = this.rrSymWeapons();
        switch (symbol) {
            case ':weapon1': object = weapons[0]; id = object ? object.iconIndex : null; break;
            case ':weapon2': object = this.rrSymDualWield() ? weapons[1] : null; id = object ? object.iconIndex : null; break;
            case ':shield': { const equips = this.rrSymEquips(); object = this.rrSymDualWield() ? null : equips ? equips[1] : null; id = object ? object.iconIndex : null; break; }
            case ':item': { const action = this.rrSymCurrentAction(); object = action ? action.item() : null; id = object ? object.iconIndex : null; break; }
        }
        if (id === null || id === undefined || id <= 0) return;
        const sprite = this.rrSymSprite();
        if (!sprite || !sprite.parent) return;
        const icon = new Sprite_RRSymObject();
        sprite.parent.addChild(icon);
        icon.setIcon(id);
        icon.setBattler(this);
        V(this).icons.set(symbol, icon);
    };
    B.rrSymDeleteIcon = function(symbol) {
        const icons = V(this).icons, icon = icons.get(symbol);
        if (!icon) return;
        icon.rrDispose();
        icons.delete(symbol);
    };
    B.rrSymClearIcons = function() {
        for (const key of Array.from(V(this).icons.keys())) this.rrSymDeleteIcon(key);
    };

    // Battle start: the pose breaks, and an actor in the party takes its home.
    const _onBattleStart = B.onBattleStart;
    B.onBattleStart = function(advantageous) {
        this.rrSymResetPosition();
        _onBattleStart.call(this, advantageous);
        if (this.isActor() && !$gameParty.battleMembers().includes(this)) return;
        this.rrSymSetDefaultPosition();
    };
    const _onBattleEnd = B.onBattleEnd;
    B.onBattleEnd = function() {
        _onBattleEnd.call(this);
        this.rrSymClearIcons();
    };
    // Falling breaks the pose.
    const _addState = B.addState;
    B.addState = function(stateId) {
        _addState.call(this, stateId);
        if (inBattle() && stateId === this.deathStateId()) this.rrSymBreakPose();
    };
    // An immortal battler resists death.
    const _stateResistSet = Game_BattlerBase.prototype.stateResistSet;
    Game_BattlerBase.prototype.stateResistSet = function() {
        const set = _stateResistSet.call(this);
        return VIS.has(this) && V(this).immortal ? set.concat([this.deathStateId()]) : set;
    };
    // Actors are drawn in the side view; they blink when hit (Ace Battle Engine) and fade out as they fall.
    const _actorSpriteVisible = Game_Actor.prototype.isSpriteVisible;
    Game_Actor.prototype.isSpriteVisible = function() { return view() ? true : _actorSpriteVisible.call(this); };
    const _actorPerformDamage = Game_Actor.prototype.performDamage;
    Game_Actor.prototype.performDamage = function() {
        _actorPerformDamage.call(this);
        if (view() && YEA_BLINK) this.requestEffect('blink');
    };
    const _actorPerformCollapse = Game_Actor.prototype.performCollapse;
    Game_Actor.prototype.performCollapse = function() {
        _actorPerformCollapse.call(this);
        if (!$gameParty.inBattle()) return;
        if (view() && !this.rrSymCustomCharset()) this.requestEffect('collapse');
        const id = [collapseAnimation(this.actor()), collapseAnimation(this.currentClass())].find(n => n !== null && n !== undefined);
        if (id) this.rrSymCollapseAnimation(id);
    };
    const _enemyPerformCollapse = Game_Enemy.prototype.performCollapse;
    Game_Enemy.prototype.performCollapse = function() {
        _enemyPerformCollapse.call(this);
        const id = collapseAnimation(this.enemy());
        if (id) this.rrSymCollapseAnimation(id);
    };
    // Fancy Death: the collapse animation, and the battle waits for it.
    B.rrSymCollapseAnimation = function(id) {
        if (!inBattle() || !$dataAnimations[id]) return;
        $gameTemp.requestAnimation([this], id, false);
        const scene = battleScene();
        if (scene._rrSym && scene._rrSym.running) scene._rrSym.waitAnimation = true;
        else if (BattleManager._logWindow && BattleManager._logWindow.rrWaitForAnimation) BattleManager._logWindow.rrWaitForAnimation();
    };
    // Can the battler's collapse start: dead, and for an enemy, shown and not collapsing already.
    B.rrSymCanCollapse = function() {
        if (!this.isDead()) return false;
        if (this.isActor()) return true;
        const sprite = this.rrSymSprite();
        if (!sprite || !sprite._appeared) return false;
        return !/collapse/i.test(String(sprite._effectType || ''));
    };

    // Holder battlers take their victory pose as the battle is won or lost.
    const _processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function() {
        for (const battler of $gameParty.aliveMembers()) battler.rrSymForcePoseHb('victory');
        return _processVictory.call(this);
    };
    const _processDefeat = BattleManager.processDefeat;
    BattleManager.processDefeat = function() {
        for (const battler of $gameTroop.aliveMembers()) battler.rrSymForcePoseHb('victory');
        return _processDefeat.call(this);
    };

    //-------------------------------------------------------------------------
    // Results: the effect is split into its calculation, its damage and its effects
    //-------------------------------------------------------------------------
    const R = Game_ActionResult.prototype;
    R.rrSymClearFlags = function() { this._rrSymPerfect = false; this._rrSymCalc = false; this._rrSymDmg = false; this._rrSymEffect = false; };
    R.rrSymSet = function(flag) {
        switch (flag) {
            case 'perfect': this._rrSymPerfect = true; return true;
            case 'calc': this._rrSymCalc = true; return true;
            case 'dmg': this._rrSymDmg = true; return true;
            case 'effect': this._rrSymEffect = true; return true;
            case 'counter': this._rrSymCheckCounter = true; return true;
            case 'reflection': this._rrSymCheckReflection = true; return true;
        }
        return false;
    };
    R.rrSymClearChangeTarget = function() { this._rrSymCheckCounter = false; this._rrSymCheckReflection = false; };
    R.rrSymDmg = function() { return !!this._rrSymDmg || !inBattle(); };
    R.rrSymEffect = function() { return !!this._rrSymEffect || !inBattle(); };
    // The hit flags (used, missed, evaded, critical, success) are kept through a clear unless the result is set to
    // calculate; a result never set to (outside battle, before its first action ends) keeps them too.
    const HIT_FLAGS = ['used', 'missed', 'evaded', 'critical', 'success'];
    const _resultClear = R.clear;
    R.clear = function() {
        if (!this._rrSymInit || this._rrSymCalc || !inBattle()) {
            this._rrSymInit = true;
            return _resultClear.call(this);
        }
        const kept = HIT_FLAGS.map(k => this[k]);
        _resultClear.call(this);
        HIT_FLAGS.forEach((k, i) => { this[k] = kept[i]; });
    };
    const _isHit = R.isHit;
    R.isHit = function() { return _isHit.call(this) || (!!this.used && !!this._rrSymPerfect); };
    const hasDamage = (r) => [r.hpDamage, r.mpDamage, r.tpDamage].some(x => x > 0);

    const A = Game_Action.prototype;
    const _itemCnt = A.itemCnt;
    A.itemCnt = function(target) {
        if (!target.canMove() && !ALWAYS_COUNTER) return 0;
        if (!target.result()._rrSymCheckCounter) return 0;
        return _itemCnt.call(this, target);
    };
    const _itemMrf = A.itemMrf;
    A.itemMrf = function(target) {
        if (!target.canMove() && !ALWAYS_COUNTER) return 0;
        if (!target.result()._rrSymCheckReflection) return 0;
        if (VIS.has(target) && V(target).magicReflection) return 0;
        return _itemMrf.call(this, target);
    };
    const _makeDamageValue = A.makeDamageValue;
    A.makeDamageValue = function(target, critical) {
        if (!target.result().rrSymDmg()) return 0;
        return _makeDamageValue.call(this, target, critical);
    };
    const _executeDamage = A.executeDamage;
    A.executeDamage = function(target, value) {
        if (!target.result().rrSymDmg()) return;
        _executeDamage.call(this, target, value);
    };
    const _applyItemEffect = A.applyItemEffect;
    A.applyItemEffect = function(target, effect) {
        if (!target.result().rrSymEffect()) return;
        _applyItemEffect.call(this, target, effect);
    };
    const _applyItemUserEffect = A.applyItemUserEffect;
    A.applyItemUserEffect = function(target) {
        if (!target.result().rrSymEffect()) return;
        _applyItemUserEffect.call(this, target);
    };
    // The Ace Battle Engine's miss popups see the stored damage when effects were held back.
    const _missPopups = Game_BattlerBase.prototype.rrMakeMissPopups;
    if (_missPopups) {
        Game_BattlerBase.prototype.rrMakeMissPopups = function(user, item) {
            const r = this.result();
            if (!r.rrSymEffect() && r.rrRestoreDamage) r.rrRestoreDamage();
            _missPopups.call(this, user, item);
            if (!r.rrSymEffect() && r.rrStoreDamage) { r.rrStoreDamage(); r.rrClearDamageValues(); }
        };
    }

    //-------------------------------------------------------------------------
    // Conditions: the small Ruby of "if user.actor? == true" and "unless skill.for_friend?"
    //-------------------------------------------------------------------------
    const Cond = (() => {
        function tokenize(src) {
            const out = [];
            const re = /\s*(?:(\d+\.\d+|\d+)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\$[a-z_]\w*|[a-z_]\w*[?!]?|[A-Z]\w*)|(:[a-z_]\w*[?!]?)|(==|!=|<=|>=|&&|\|\||[<>!+\-*\/%().,\[\]?:]))/gy;
            let m;
            re.lastIndex = 0;
            while (re.lastIndex < src.length) {
                const at = re.lastIndex;
                if (/^\s*$/.test(src.slice(at))) break;
                m = re.exec(src);
                if (!m) throw new Error('cannot read ' + src.slice(at));
                if (m[1]) out.push({ t: 'num', v: Number(m[1]) });
                else if (m[2]) out.push({ t: 'str', v: m[2].slice(1, -1) });
                else if (m[3]) out.push({ t: 'id', v: m[3] });
                else if (m[4]) out.push({ t: 'sym', v: m[4].slice(1) });
                else out.push({ t: 'op', v: m[5] });
            }
            return out;
        }
        function parse(src) {
            const tokens = tokenize(src);
            let i = 0;
            const peek = () => tokens[i], next = () => tokens[i++];
            const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
            const isWord = (v) => peek() && peek().t === 'id' && peek().v === v;
            const expect = (v) => { if (!isOp(v)) throw new Error('expected ' + v); i++; };
            const lowOr = () => { let l = lowNot(); while (isWord('and') || isWord('or')) { const op = next().v === 'and' ? '&&' : '||'; l = { op, l, r: lowNot() }; } return l; };
            const lowNot = () => (isWord('not') ? (next(), { op: '!', e: lowNot() }) : ternary());
            const ternary = () => {
                const c = orExpr();
                if (isOp('?')) { next(); const a = ternary(); expect(':'); const b = ternary(); return { op: '?:', c, a, b }; }
                return c;
            };
            const orExpr = () => { let l = andExpr(); while (isOp('||')) { next(); l = { op: '||', l, r: andExpr() }; } return l; };
            const andExpr = () => { let l = eq(); while (isOp('&&')) { next(); l = { op: '&&', l, r: eq() }; } return l; };
            const eq = () => { let l = cmp(); while (isOp('==') || isOp('!=')) { const op = next().v; l = { op, l, r: cmp() }; } return l; };
            const cmp = () => { let l = add(); while (['<', '>', '<=', '>='].some(isOp)) { const op = next().v; l = { op, l, r: add() }; } return l; };
            const add = () => { let l = mul(); while (isOp('+') || isOp('-')) { const op = next().v; l = { op, l, r: mul() }; } return l; };
            const mul = () => { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = next().v; l = { op, l, r: unary() }; } return l; };
            const unary = () => {
                if (isOp('!')) { next(); return { op: '!', e: unary() }; }
                if (isOp('-')) { next(); return { op: 'neg', e: unary() }; }
                return postfix();
            };
            const args = () => {
                const list = [];
                if (isOp('(')) {
                    next();
                    while (!isOp(')')) { list.push(lowOr()); if (isOp(',')) next(); else break; }
                    expect(')');
                }
                return list;
            };
            const postfix = () => {
                let e = primary();
                for (;;) {
                    if (isOp('.')) { next(); const name = next(); e = { op: 'call', recv: e, name: name.v, args: args() }; }
                    else if (isOp('[')) { next(); const index = lowOr(); expect(']'); e = { op: 'index', recv: e, index }; }
                    else return e;
                }
            };
            const primary = () => {
                const t = next();
                if (!t) throw new Error('unexpected end');
                if (t.t === 'num' || t.t === 'str' || t.t === 'sym') return { op: 'lit', v: t.v };
                if (t.t === 'op' && t.v === '(') { const e = lowOr(); expect(')'); return e; }
                if (t.t === 'id') {
                    if (t.v === 'true') return { op: 'lit', v: true };
                    if (t.v === 'false') return { op: 'lit', v: false };
                    if (t.v === 'nil') return { op: 'lit', v: null };
                    return { op: 'var', name: t.v, args: isOp('(') ? args() : null };
                }
                throw new Error('unexpected ' + t.v);
            };
            const tree = lowOr();
            if (i < tokens.length) throw new Error('unexpected ' + tokens[i].v);
            return tree;
        }
        const camel = (name) => name.replace(/[?!]$/, '').replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
        const scopeTests = {
            'for_opponent?': (o) => [1, 2, 3, 4, 5, 6].includes(o.scope), 'for_friend?': (o) => [7, 8, 9, 10, 11].includes(o.scope),
            'for_dead_friend?': (o) => [9, 10].includes(o.scope), 'for_user?': (o) => o.scope === 11, 'for_one?': (o) => [1, 3, 7, 9, 11].includes(o.scope),
            'for_random?': (o) => [3, 4, 5, 6].includes(o.scope), 'for_all?': (o) => [2, 8, 10].includes(o.scope),
            'need_selection?': (o) => [1, 7, 9].includes(o.scope), 'certain?': (o) => o.hitType === 0, 'physical?': (o) => o.hitType === 1,
            'magical?': (o) => o.hitType === 2
        };
        // A Ruby method on a JS object: the battler, item and list methods these notes use, else the snake_case name as
        // a property or method (name? also as isName()).
        function send(recv, name, argv) {
            if (recv === null || recv === undefined) {
                if (name === 'nil?') return true;
                throw new Error(`undefined method \`${name}' for nil`);
            }
            if (name === 'nil?') return false;
            if (Array.isArray(recv)) {
                switch (name) {
                    case 'size': case 'length': return recv.length;
                    case 'empty?': return recv.length === 0;
                    case 'first': return recv[0] ?? null;
                    case 'last': return recv[recv.length - 1] ?? null;
                    case 'include?': return recv.includes(argv[0]);
                    case 'compact': return compact(recv);
                }
            }
            if (recv instanceof Game_Battler) {
                switch (name) {
                    case 'actor?': return recv.isActor();
                    case 'enemy?': return recv.isEnemy();
                    case 'dead?': return recv.isDead();
                    case 'alive?': return recv.isAlive();
                    case 'exist?': return recv.isAppeared();
                    case 'hidden?': return recv.isHidden();
                    case 'state?': return recv.isStateAffected(argv[0]);
                    case 'equips': return recv.rrSymEquips();
                    case 'weapons': return recv.rrSymWeapons();
                    case 'dual_wield?': return recv.rrSymDualWield();
                    case 'current_action': return recv.rrSymCurrentAction();
                    case 'id': return recv.isActor() ? recv.actorId() : recv.enemyId();
                    case 'index': return recv.index();
                    case 'use_charset?': return recv.rrSymUseCharset();
                    case 'use_hb?': return recv.rrSymUseHb();
                }
            }
            if (recv instanceof Game_Action) {
                switch (name) {
                    case 'attack?': return recv.isAttack();
                    case 'guard?': return recv.isGuard();
                    case 'item': return recv.item();
                }
            }
            if (scopeTests[name] && typeof recv === 'object' && 'scope' in recv) return scopeTests[name](recv);
            if (typeof recv === 'object') {
                const key = camel(name);
                const pred = name.endsWith('?') ? 'is' + key.charAt(0).toUpperCase() + key.slice(1) : null;
                for (const k of [key, pred, name].filter(Boolean)) {
                    const v = recv[k];
                    if (typeof v === 'function') return v.apply(recv, argv);
                    if (v !== undefined) return v;
                }
            }
            throw new Error(`undefined method \`${name}'`);
        }
        const truthy = rubyTrue;
        const same = (a, b) => a === b || ((a === null || a === undefined) && (b === null || b === undefined));
        function index(recv, i) {
            if (recv instanceof Game_Variables) return recv.value(i);
            if (recv instanceof Game_Switches) return recv.value(i);
            if (recv === null || recv === undefined) throw new Error("undefined method `[]' for nil");
            if (Array.isArray(recv)) { const v = i < 0 ? recv[recv.length + i] : recv[i]; return v === undefined ? null : v; }
            return recv[i] ?? null;
        }
        const GLOBALS = {
            $game_variables: () => $gameVariables, $game_switches: () => $gameSwitches, $game_party: () => $gameParty,
            $game_troop: () => $gameTroop, $data_items: () => $dataItems, $data_skills: () => $dataSkills,
            $data_weapons: () => $dataWeapons, $data_armors: () => $dataArmors, $data_states: () => $dataStates
        };
        function run(node, env) {
            switch (node.op) {
                case 'lit': return node.v;
                case 'var': {
                    if (node.name.startsWith('$')) { const g = GLOBALS[node.name]; if (!g) throw new Error('unknown ' + node.name); return g(); }
                    if (Object.prototype.hasOwnProperty.call(env, node.name)) return env[node.name];
                    throw new Error(`undefined local variable or method \`${node.name}'`);
                }
                case 'call': return send(run(node.recv, env), node.name, node.args.map(a => run(a, env)));
                case 'index': return index(run(node.recv, env), run(node.index, env));
                case '!': return !truthy(run(node.e, env));
                case 'neg': return -run(node.e, env);
                case '&&': { const l = run(node.l, env); return truthy(l) ? run(node.r, env) : l; }
                case '||': { const l = run(node.l, env); return truthy(l) ? l : run(node.r, env); }
                case '?:': return truthy(run(node.c, env)) ? run(node.a, env) : run(node.b, env);
                case '==': return same(run(node.l, env), run(node.r, env));
                case '!=': return !same(run(node.l, env), run(node.r, env));
                case '<': return run(node.l, env) < run(node.r, env);
                case '>': return run(node.l, env) > run(node.r, env);
                case '<=': return run(node.l, env) <= run(node.r, env);
                case '>=': return run(node.l, env) >= run(node.r, env);
                case '+': return run(node.l, env) + run(node.r, env);
                case '-': return run(node.l, env) - run(node.r, env);
                case '*': return run(node.l, env) * run(node.r, env);
                case '/': return div(run(node.l, env), run(node.r, env));
                case '%': { const a = run(node.l, env), b = run(node.r, env); return ((a % b) + b) % b; }
            }
            throw new Error('cannot run ' + node.op);
        }
        const trees = new Map();
        const warned = new Set();
        return {
            parse,
            /** Ruby truth of the expression; one that fails to parse or run is false (the original stopped the game). */
            test(src, env) {
                try {
                    if (!trees.has(src)) trees.set(src, parse(src));
                    return truthy(run(trees.get(src), env));
                } catch (error) {
                    if (!warned.has(src)) { warned.add(src); console.warn('RR_BattleSymphony: condition "' + src + '" could not be evaluated (' + error.message + '); taken as false'); }
                    return false;
                }
            }
        };
    })();
    window.RRBattleSymphony.Cond = Cond;

    //-------------------------------------------------------------------------
    // Icon sprites (weapons, items, shields) held by battlers
    //-------------------------------------------------------------------------
    function Sprite_RRSymObject() { this.initialize(...arguments); }
    Sprite_RRSymObject.prototype = Object.create(Sprite.prototype);
    Sprite_RRSymObject.prototype.constructor = Sprite_RRSymObject;
    window.Sprite_RRSymObject = Sprite_RRSymObject;
    Sprite_RRSymObject.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this._rrZ = 0;
        // x, y and the origin in RGSS terms: whole pixels, the origin from the top-left of what is shown.
        this.rx = 0; this.ry = 0; this.rox = 0; this.roy = 0; this.rmirror = false; this.rangle = 0; this.ropacity = 255;
        this._destAngle = 0; this._destX = 0; this._destY = 0;
        this._angleRate = 0; this._moveXRate = 0; this._moveYRate = 0; this._fadeRate = 0;
        this._arc = 0; this._par = {}; this._arcY = 0;
        this._battler = null;
        this._offsetX = 0; this._offsetY = 0; this._offsetZ = 0; this._attachX = 0; this._attachY = 0;
        this._attachment = 'middle';
    };
    const SO = Sprite_RRSymObject.prototype;
    SO.rrDispose = function() {
        if (this.parent) this.parent.removeChild(this);
        this._rrDisposed = true;
        this.destroy();
    };
    SO.setBattler = function(battler) { this._battler = battler; this.update(); };
    SO.setAngle = function(angle) {
        this._destAngle = this.rangle = angle;
        if (this.mirrorBattler()) this._destAngle = this.rangle = -angle;
    };
    SO.setIcon = function(index) {
        if (index <= 0) return;
        if (!this.bitmap) this.bitmap = ImageManager.loadSystem('IconSet');
        this.setFrame(index % 16 * 24, Math.floor(index / 16) * 24, 24, 24);
        this.rox = this.roy = 12;
    };
    SO.battlerSprite = function() { return this._battler ? this._battler.rrSymSprite() : null; };
    const spriteW = (sprite) => (sprite ? Math.trunc(sprite._rrSymCw || sprite.width || 0) : 0);
    const spriteH = (sprite) => (sprite ? Math.trunc(sprite._rrSymCh || sprite.height || 0) : 0);
    SO.setOrigin = function(type) {
        const s = this.battlerSprite(), w = spriteW(s), h = spriteH(s);
        this._offsetZ = 2;
        this._attachment = type;
        switch (type) {
            case 'item': this.rox = 12; this.roy = 12; this._offsetY = -h; this._offsetX = -div(w, 2); break;
            case 'hand1': this.rox = 24; this.roy = 24; this._attachY = -div(h, 3); this._attachX = -div(w, 5); break;
            case 'hand2': this.rox = 24; this.roy = 24; this._attachY = -div(h, 3); this._attachX = div(w, 5); break;
            case 'middle': this.rox = 12; this.roy = 12; this._offsetY = -div(h, 2); break;
            case 'top': this.rox = 12; this.roy = 24; this._offsetY = -h; break;
            case 'base': this.rox = 12; this.roy = 24; break;
        }
        this.ry = Math.trunc(this._battler._screenY + this._attachY + this._offsetY + this._arcY);
    };
    SO.setFade = function(rate) { this._fadeRate = rate; };
    SO.createAngle = function(angle, frames = 8) {
        if (angle === this.rangle) return;
        this._destAngle = angle;
        if (this.mirrorBattler()) this._destAngle = -this._destAngle;
        frames = Math.max(frames, 1);
        this._angleRate = Math.max(div(Math.abs(this.rangle - this._destAngle), frames), 2);
    };
    SO.createArc = function(arc) {
        this._arc = arc;
        this._par = { x: 0, y0: 0, y1: this._destY - this.ry, h: -(0 + arc * 5), d: Math.abs(this.rx - this._destX) };
    };
    SO.createMovement = function(x, y, frames = 12) {
        if (this.rx === x && this.ry === y) return;
        this._arc = 0;
        this._destX = x;
        this._destY = y;
        frames = Math.max(frames, 1);
        this._moveXRate = Math.max(div(Math.abs(this.rx - this._destX), frames), 2);
        this._moveYRate = Math.max(div(Math.abs(this.ry - this._destY), frames), 2);
    };
    const DIR_STEP = { 1: [-0.5, 0.5], 2: [0, 1], 3: [-0.5, 0.5], 4: [-1, 0], 6: [1, 0], 7: [-0.5, -0.5], 8: [0, -1], 9: [0.5, -0.5] };
    // The step of a move in a numpad direction (the original's 1 and 3 both lean left).
    const dirStep = (direction, distance) => {
        const s = DIR_STEP[direction];
        if (!s) return null;
        const part = (f) => (f === 0 ? 0 : Math.abs(f) === 1 ? distance * f : div(distance, f < 0 ? -2 : 2));
        return [part(s[0]), part(s[1])];
    };
    SO.createMoveDirection = function(direction, distance, frames = 12) {
        const step = dirStep(direction, distance);
        if (!step) return;
        this.createMovement(step[0] + this.rx, step[1] + this.ry, frames);
    };
    SO.update = function() {
        Sprite.prototype.update.call(this);
        if (this._rrDisposed) return;
        this.updateAngle();
        if (this._arc === 0) this.updateMovement(); else this.updateArc();
        this.updatePosition();
        this.updateOpacity();
        this.refreshDisplay();
    };
    SO.updateAngle = function() {
        if (this._angleRate === 0) return;
        if (this.rangle === this._destAngle) this._angleRate = 0;
        const value = Math.min(Math.abs(this.rangle - this._destAngle), this._angleRate);
        this.rangle += this._destAngle > this.rangle ? value : -value;
    };
    SO.updateArc = function() {
        if (this._moveXRate === 0 && this._moveYRate === 0) return;
        const p = this._par;
        const value = Math.min(Math.abs(this.rx - this._destX), this._moveXRate);
        this._offsetX += this._destX > this.rx ? value : -value;
        p.x += value;
        if (this._destX === this.rx) this.ry = this._destY;
        else {
            const a = (2 * (p.y0 + p.y1) - 4 * p.h) / (p.d * p.d);
            const b = (p.y1 - p.y0 - a * (p.d * p.d)) / p.d;
            this._arcY = a * p.x * p.x + b * p.x + p.y0;
        }
        if (this.rx === this._destX) this._moveXRate = 0;
        if (this.ry === this._destY) this._moveYRate = 0;
    };
    SO.updateMovement = function() {
        if (this._moveXRate === 0 && this._moveYRate === 0) return;
        if (this.rx === this._destX) this._moveXRate = 0;
        if (this.ry === this._destY) this._moveYRate = 0;
        let value = Math.min(Math.abs(this.rx - this._destX), this._moveXRate);
        this._offsetX += this._destX > this.rx ? value : -value;
        value = Math.min(Math.abs(this.ry - this._destY), this._moveYRate);
        this._offsetY += this._destY > this.ry ? value : -value;
    };
    SO.updatePosition = function() {
        if (this._battler) {
            this.rmirror = this.mirrorBattler();
            this.updateAttachment(this.rmirror);
            const attachX = this.rmirror ? -this._attachX : this._attachX;
            this.rx = Math.trunc(this._battler._screenX + attachX + this._offsetX);
            this.ry = Math.trunc(this._battler._screenY + this._attachY + this._offsetY + this._arcY);
            this._rrZ = this._battler.rrSymScreenZ() + this._offsetZ;
        } else {
            this.rx = Math.trunc(this._offsetX);
            this.ry = Math.trunc(this._offsetY);
            this._rrZ = this._offsetZ;
        }
    };
    SO.updateAttachment = function(mirror) {
        const s = this.battlerSprite(), w = spriteW(s), h = spriteH(s);
        switch (this._attachment) {
            case 'hand1': this.rox = mirror ? 0 : 24; this.roy = 24; this._attachY = -div(h, 3); this._attachX = -div(w, 5); break;
            case 'hand2': this.rox = mirror ? 0 : 24; this.roy = 24; this._attachY = -div(h, 3); this._attachX = div(w, 5); break;
            default: this._attachX = 0; this._attachY = 0;
        }
    };
    SO.updateOpacity = function() {
        this.ropacity = Math.max(0, Math.min(255, Math.trunc(this.ropacity + this._fadeRate)));
    };
    SO.mirrorBattler = function() {
        if (!this._battler || !this.battlerSprite()) return false;
        const direction = Dir.direction(V(this._battler).pose);
        if ([9, 6, 3].includes(direction)) return true;
        return !!V(this._battler).mirror;
    };
    // A fade-in never ends, a fade-out ends at once: only positive rates count, as in the original.
    SO.isEffecting = function() { return [this._angleRate, this._moveYRate, this._moveXRate, this._fadeRate].some(x => x > 0); };
    SO.refreshDisplay = function() {
        this.x = this.rx;
        this.y = this.ry;
        const w = this._frame ? this._frame.width : 24, h = this._frame ? this._frame.height : 24;
        this.scale.x = this.rmirror ? -1 : 1;
        this.anchor.x = w ? (this.rmirror ? w - this.rox : this.rox) / w : 0;
        this.anchor.y = h ? this.roy / h : 0;
        this.rotation = -this.rangle * Math.PI / 180;
        this.opacity = this.ropacity;
    };
    SO.startIconAnimation = function(animation) {
        const set = spriteset();
        if (!set || !animation || !animation.frames) return;
        const sprite = new Sprite_AnimationMV();
        sprite.targetObjects = [];
        sprite.setup([this], animation, false, 0);
        set._effectsContainer.addChild(sprite);
        set._animationSprites.push(sprite);
    };

    // Afterimages: faded copies of the battler left behind as it moves.
    function Sprite_RRSymAfterImage() { this.initialize(...arguments); }
    Sprite_RRSymAfterImage.prototype = Object.create(Sprite.prototype);
    Sprite_RRSymAfterImage.prototype.constructor = Sprite_RRSymAfterImage;
    Sprite_RRSymAfterImage.prototype.initialize = function(battlerSprite) {
        Sprite.prototype.initialize.call(this);
        const main = battlerSprite.mainSprite();
        this._time = 12;
        this._fadeTimeStart = 6;
        this.x = battlerSprite.x;
        this.y = battlerSprite.y;
        this.bitmap = main.bitmap;
        if (main._frame) this.setFrame(main._frame.x, main._frame.y, main._frame.width, main._frame.height);
        this.anchor.x = main.anchor.x;
        this.anchor.y = main.anchor.y;
        this.scale.x = main.scale.x;
        this.scale.y = main.scale.y;
        this.opacity = Math.max(0, battlerSprite.opacity - 95);
        this._rOpacity = this.opacity;
        this.visible = battlerSprite.visible;
        this._opacityRate = this._rOpacity / (this._time - this._fadeTimeStart);
    };
    Sprite_RRSymAfterImage.prototype.update = function() {
        Sprite.prototype.update.call(this);
        this._time--;
        if (this._time < this._fadeTimeStart) {
            this._rOpacity = Math.max(0, Math.trunc(this._rOpacity - this._opacityRate));
            this.opacity = this._rOpacity;
        }
        if (this._rOpacity <= 0) this._rrDisposed = true;
    };

    //-------------------------------------------------------------------------
    // Battler sprites: walking sheets, holder sheets, positions and effects
    //-------------------------------------------------------------------------
    const symSprite = (sprite) => view() && !!sprite._battler;
    // What a battler sprite shows: 'hb', 'charset' or null (the battler image).
    const drawKind = (battler) => (!battler ? null : battler.rrSymUseHb() ? 'hb' : battler.rrSymUseCharset() ? 'charset' : null);

    const SymSprite = {
        correctChangePose() {
            const b = this._battler;
            if (b && b.rrSymUseHb()) {
                const array = Dir.indexHb(V(b).pose);
                this._rrPattern = V(b).reversePose ? 3 : 0;
                this._rrTimer = array[1] === undefined ? 15 : array[1];
                this._rrBackStep = false;
            } else {
                this._rrPattern = 1;
                this._rrTimer = 15;
                this._rrBackStep = false;
            }
            this._rrPoseSerial = b ? V(b).poseSerial : 0;
        },
        // The sheet's bitmap and cell size; the cell is chosen each frame from the pose.
        symUpdateBitmap(target) {
            const b = this._battler, kind = drawKind(b);
            if (this._rrTimer === undefined) SymSprite.correctChangePose.call(this);
            if (V(b).poseSerial !== this._rrPoseSerial) SymSprite.correctChangePose.call(this);
            if (!V(b).pose) b.rrSymSetDefaultPosition();
            const name = kind === 'hb' ? b.rrSymHoldersName() : b.rrSymCharacterName(), index = kind === 'hb' ? 0 : b.rrSymCharacterIndex();
            if (this._rrSymName !== name || this._rrSymIndex !== index || this._rrSymKind !== kind) {
                this._rrSymName = name;
                this._rrSymIndex = index;
                this._rrSymKind = kind;
                target.bitmap = ImageManager.loadCharacter(name);
            }
            const bitmap = target.bitmap;
            if (!bitmap || !bitmap.isReady() || !bitmap.width) { this._rrSymCw = this._rrSymCh = 0; return false; }
            if (kind === 'hb') { this._rrSymCw = div(bitmap.width, 4); this._rrSymCh = div(bitmap.height, 14); }
            else {
                const sign = /^[!$]./.exec(name || '');
                if (sign && sign[0].includes('$')) { this._rrSymCw = div(bitmap.width, 3); this._rrSymCh = div(bitmap.height, 4); }
                else { this._rrSymCw = div(bitmap.width, 12); this._rrSymCh = div(bitmap.height, 8); }
            }
            return true;
        },
        symUpdateSrcRect(target) {
            const b = this._battler, v = V(b), cw = this._rrSymCw, ch = this._rrSymCh;
            this._rrTimer--;
            if (this._rrSymKind === 'hb') {
                if (v.forcePose) {
                    if (this._rrTimer <= 0 && this._rrPattern < 3) {
                        const array = Dir.indexHb(v.pose);
                        this._rrPattern++;
                        this._rrTimer = array[1] === undefined ? 15 : array[1];
                    }
                } else if (this._rrTimer <= 0) {
                    this._rrPattern++;
                    if (this._rrPattern > 3) this._rrPattern = 0;
                    this._rrTimer = 15;
                }
                const row = Dir.indexHb(v.pose)[0];
                target.setFrame(this._rrPattern * cw, row * ch, cw, ch);
                return;
            }
            if (v.forcePose) {
                if (!v.reversePose && this._rrPattern < 2 && this._rrTimer <= 0) { this._rrPattern++; this._rrTimer = 15; }
                else if (v.reversePose && this._rrPattern > 0 && this._rrTimer <= 0) { this._rrPattern--; this._rrTimer = 15; }
            } else {
                if (this._rrPattern > 2) this._rrPattern = 2;
                if (this._rrPattern < 0) this._rrPattern = 0;
                if (this._rrTimer <= 0) {
                    this._rrPattern += this._rrBackStep ? -1 : 1;
                    if (this._rrPattern >= 2) this._rrBackStep = true;
                    if (this._rrPattern <= 0) this._rrBackStep = false;
                    this._rrTimer = 15;
                }
            }
            if (!v.pose) b.rrSymBreakPose();
            const direction = Dir.direction(v.pose) || 2;
            const index = this._rrSymIndex || 0;
            const sx = (index % 4 * 3 + this._rrPattern) * cw;
            const sy = (Math.floor(index / 4) * 4 + (direction - 2) / 2) * ch;
            target.setFrame(sx, sy, cw, ch);
        },
        // Walking and holder sheets stand on their feet at the middle.
        symOrigin(target) {
            const mirror = !!V(this._battler).mirror;
            target.anchor.x = 0.5;
            target.anchor.y = 1;
            target.scale.x = mirror ? -Math.abs(target.scale.x || 1) : Math.abs(target.scale.x || 1);
            this._rrMirror = mirror;
        },
        symUpdateAfterimage() {
            const list = this._rrAfterimages || (this._rrAfterimages = []);
            for (const sprite of list.slice()) {
                if (sprite._rrDisposed) {
                    list.splice(list.indexOf(sprite), 1);
                    if (sprite.parent) sprite.parent.removeChild(sprite);
                    sprite.destroy();
                    continue;
                }
                sprite.update();
            }
            if (!this._battler || !V(this._battler).afterimage || !this.parent) return;
            if (this._rrAfterimageTick === undefined) this._rrAfterimageTick = 2;
            if (list.length < 4) {
                this._rrAfterimageTick--;
                if (this._rrAfterimageTick > 0) return;
                const sprite = new Sprite_RRSymAfterImage(this);
                sprite._rrSymAfterimage = true;
                this.parent.addChild(sprite);
                list.push(sprite);
                this._rrAfterimageTick = 2;
            }
        },
        symClearAfterimages() {
            for (const sprite of this._rrAfterimages || []) { if (sprite.parent) sprite.parent.removeChild(sprite); sprite.destroy(); }
            this._rrAfterimages = [];
        }
    };

    // Enemies
    const SE = Sprite_Enemy.prototype;
    const _enemyUpdateBitmap = SE.updateBitmap;
    SE.updateBitmap = function() {
        if (!symSprite(this) || !drawKind(this._battler)) {
            this._rrSymKind = null;
            return _enemyUpdateBitmap.call(this);
        }
        this._rrSymReady = SymSprite.symUpdateBitmap.call(this, this);
    };
    const _enemyUpdateFrame = SE.updateFrame;
    SE.updateFrame = function() {
        if (!symSprite(this) || !this._rrSymKind) {
            this._rrSymCw = this._rrSymCh = 0;
            return _enemyUpdateFrame.call(this);
        }
        if (!this._rrSymReady) { this.setFrame(0, 0, 0, 0); return; }
        SymSprite.symUpdateSrcRect.call(this, this);
        SymSprite.symOrigin.call(this, this);
    };
    const _enemyUpdatePosition = SE.updatePosition;
    SE.updatePosition = function() {
        if (!symSprite(this)) return _enemyUpdatePosition.call(this);
        this._battler.rrSymUpdateVisual();
        this._homeX = this._battler._screenX;
        this._homeY = this._battler._screenY;
        this._offsetX = this._offsetY = 0;
        this.x = this._homeX + (this._shake || 0);
        this.y = this._homeY;
        SymSprite.symUpdateAfterimage.call(this);
    };
    // A vanished enemy stays hidden; the appear and disappear come before a requested effect.
    const _enemySetupEffect = SE.setupEffect;
    SE.setupEffect = function() {
        if (!symSprite(this)) return _enemySetupEffect.call(this);
        const enemy = this._enemy;
        if (!this._appeared && enemy.isAlive()) { if (!V(enemy).vanishing) this.startEffect('appear'); }
        else if (this._appeared && enemy.isHidden()) this.startEffect('disappear');
        if (this._appeared && enemy.isEffectRequested()) {
            this.startEffect(enemy.effectType());
            enemy.clearEffect();
        }
    };
    SE.rrSymStartEffect = function(effect) { this.startEffect(effect); };
    SE.rrSymSetEffectInstant = function() { if (this._effectType) this._effectDuration = 1; };
    SE.isMoving = function() { return symSprite(this) ? this._battler.rrSymIsMoving() : Sprite_Battler.prototype.isMoving.call(this); };
    // Enemies' own graphics come from the enemies folder even though the party stands in a side view.
    const _enemyLoadBitmap = SE.loadBitmap;
    SE.loadBitmap = function(name) {
        if (!view()) return _enemyLoadBitmap.call(this, name);
        this.bitmap = ImageManager.loadEnemy(name);
    };

    // Actors: the walking sheet in the main sprite, Ace's sprite effects on it
    const SA = Sprite_Actor.prototype;
    const _actorSetBattler = SA.setBattler;
    SA.setBattler = function(battler) {
        if (!view()) return _actorSetBattler.call(this, battler);
        Sprite_Battler.prototype.setBattler.call(this, battler);
        if (battler === this._actor) return;
        this._actor = battler;
        this._rrSymName = this._rrSymIndex = this._rrSymKind = undefined;
        this._rrTimer = undefined;
        SymSprite.symClearAfterimages.call(this);
        if (battler) {
            battler.rrSymResetPosition();
            battler.rrSymCorrectOrigin();
            if (battler.isDead()) battler.rrSymBreakPose();
            this.rrSymInitVisibility();
        } else {
            this._mainSprite.bitmap = null;
        }
        this._stateSprite.setup(battler);
    };
    SA.rrSymInitVisibility = function() {
        this._effectType = null;
        this._effectDuration = 0;
        if (this._actor.rrSymCustomCharset()) return;
        this._appeared = this._actor.isAlive();
        this.opacity = this._appeared ? 255 : 0;
    };
    const _actorUpdateMain = SA.updateMain;
    SA.updateMain = function() {
        if (!symSprite(this)) return _actorUpdateMain.call(this);
        Sprite_Battler.prototype.updateMain.call(this);
    };
    const _actorUpdateBitmap = SA.updateBitmap;
    SA.updateBitmap = function() {
        if (!symSprite(this)) return _actorUpdateBitmap.call(this);
        if (!drawKind(this._battler)) { this._rrSymKind = null; return _actorUpdateBitmap.call(this); }
        this._rrSymReady = SymSprite.symUpdateBitmap.call(this, this._mainSprite);
    };
    const _actorUpdateFrame = SA.updateFrame;
    SA.updateFrame = function() {
        if (!symSprite(this) || !this._rrSymKind) return _actorUpdateFrame.call(this);
        if (!this._rrSymReady) { this._mainSprite.setFrame(0, 0, 0, 0); this.setFrame(0, 0, 0, 0); return; }
        SymSprite.symUpdateSrcRect.call(this, this._mainSprite);
        SymSprite.symOrigin.call(this, this._mainSprite);
        this.setFrame(0, 0, this._rrSymCw, this._rrSymCh);
    };
    const _actorUpdatePosition = SA.updatePosition;
    SA.updatePosition = function() {
        if (!symSprite(this)) return _actorUpdatePosition.call(this);
        this._battler.rrSymUpdateVisual();
        this._homeX = this._battler._screenX;
        this._homeY = this._battler._screenY;
        this._offsetX = this._offsetY = 0;
        this.x = this._homeX;
        this.y = this._homeY;
        SymSprite.symUpdateAfterimage.call(this);
    };
    for (const name of ['startEntryMotion', 'moveToStartPosition', 'updateMotion']) {
        const base = SA[name];
        SA[name] = function(...args) { if (!view()) return base.apply(this, args); };
    }
    const _actorStartMove = SA.startMove;
    SA.startMove = function(x, y, duration) { if (!view()) return _actorStartMove.call(this, x, y, duration); };
    SA.isMoving = function() { return symSprite(this) ? this._battler.rrSymIsMoving() : Sprite_Battler.prototype.isMoving.call(this); };
    const _actorUpdate = SA.update;
    SA.update = function() {
        _actorUpdate.call(this);
        if (!view()) return;
        this._shadowSprite.visible = false;
        this._weaponSprite.visible = false;
        this._stateSprite.visible = false;
        if (!this._actor) { this._effectType = null; return; }
        this.rrSymSetupNewEffect();
        this.rrSymUpdateEffect();
    };
    // Ace's effects on an actor: appear, disappear, whiten, blink and the collapses.
    SA.rrSymSetupNewEffect = function() {
        const actor = this._actor;
        if (!this._appeared && actor.isAlive()) { if (!V(actor).vanishing) this.startEffect('appear'); }
        else if (this._appeared && actor.isHidden()) this.startEffect('disappear');
        if (this._appeared && actor.isEffectRequested()) {
            this.startEffect(actor.effectType());
            actor.clearEffect();
        }
    };
    const ACE_EFFECT = { boss_collapse: 'bossCollapse', instant_collapse: 'instantCollapse' };
    SA.rrSymStartEffect = function(effect) { this.startEffect(effect); };
    SA.startEffect = function(effect) {
        effect = ACE_EFFECT[effect] || effect;
        this._effectType = effect;
        switch (effect) {
            case 'appear': this._effectDuration = 16; this._appeared = true; break;
            case 'disappear': this._effectDuration = 32; this._appeared = false; break;
            case 'whiten': this._effectDuration = 16; this._appeared = true; break;
            case 'blink': this._effectDuration = 20; this._appeared = true; break;
            case 'collapse': this._effectDuration = 48; this._appeared = false; break;
            case 'bossCollapse': this._effectDuration = this._rrSymCh || 48; this._appeared = false; break;
            case 'instantCollapse': this._effectDuration = 16; this._appeared = false; break;
        }
        this.rrSymRevertToNormal();
    };
    SA.rrSymSetEffectInstant = function() { if (this._effectType) this._effectDuration = 1; };
    SA.rrSymRevertToNormal = function() {
        this._mainSprite.blendMode = 0;
        this._mainSprite.setBlendColor([0, 0, 0, 0]);
        this.opacity = 255;
    };
    SA.rrSymUpdateEffect = function() {
        if (!(this._effectDuration > 0)) return;
        this._effectDuration--;
        const d = this._effectDuration, main = this._mainSprite;
        switch (this._effectType) {
            case 'whiten': main.setBlendColor([255, 255, 255, Math.max(0, 128 - (16 - d) * 10)]); break;
            case 'blink': this.updateBlink(); break;
            case 'appear': this.opacity = (16 - d) * 16; break;
            case 'disappear': this.opacity = 256 - (32 - d) * 10; break;
            case 'collapse': main.blendMode = 1; main.setBlendColor([255, 128, 128, 128]); this.opacity = 256 - (48 - d) * 6; break;
            case 'bossCollapse': {
                const h = this._rrSymCh || 48, alpha = div(d * 120, h);
                main.blendMode = 1;
                main.setBlendColor([255, 255, 255, 255 - alpha]);
                this.opacity = alpha;
                if (d % 20 === 19) SoundManager.playBossCollapse2();
                break;
            }
            case 'instantCollapse': this.opacity = 0; break;
        }
        if (this._effectDuration === 0) this._effectType = null;
    };
    SA.updateBlink = function() { this.opacity = this._effectDuration % 10 < 5 ? 255 : 0; };
    const _actorIsEffecting = SA.isEffecting;
    SA.isEffecting = function() { return symSprite(this) ? !!this._effectType : _actorIsEffecting.call(this); };

    // The party's sprites, one per battle slot, even where the database has no side view.
    const _createActors = Spriteset_Battle.prototype.createActors;
    Spriteset_Battle.prototype.createActors = function() {
        if (!view()) return _createActors.call(this);
        this._actorSprites = [];
        for (let i = 0; i < $gameParty.maxBattleMembers(); i++) {
            const sprite = new Sprite_Actor();
            this._actorSprites.push(sprite);
            this._battleField.addChild(sprite);
        }
    };
    // Animations start at once and are never turned for actors: Ace played them as the flag said.
    const _animationBaseDelay = Spriteset_Battle.prototype.animationBaseDelay;
    Spriteset_Battle.prototype.animationBaseDelay = function() { return view() ? 0 : _animationBaseDelay.call(this); };
    const _animationNextDelay = Spriteset_Battle.prototype.animationNextDelay;
    Spriteset_Battle.prototype.animationNextDelay = function() { return view() ? 0 : _animationNextDelay.call(this); };
    const _animationShouldMirror = Spriteset_Battle.prototype.animationShouldMirror;
    Spriteset_Battle.prototype.animationShouldMirror = function(target) { return view() ? false : _animationShouldMirror.call(this, target); };
    Spriteset_Battle.prototype.rrSymIsMoving = function() { return this.battlerSprites().some(s => s._battler && s._battler.rrSymIsMoving()); };
    Spriteset_Battle.prototype.rrSymBattlerAnimating = function() { return this.isAnimationPlaying(); };

    // Drawing order as RGSS sorted its viewport: afterimages (z 0) under the battlers, battlers (z 100) and their
    // icons (z 102) each by their y, everything else (animations, state animations) over them in its own order.
    const orderKey = (child) => {
        if (child._rrSymAfterimage) return [0, 0];
        if (child instanceof Sprite_Battler && child._battler) return [1, 100, child.y];
        if (child instanceof Sprite_RRSymObject) return [1, child._rrZ, child.y];
        return null;
    };
    Spriteset_Battle.prototype.rrSymSortField = function() {
        const field = this._battleField;
        if (!field) return;
        const children = field.children;
        const below = [], sorted = [], rest = [];
        for (const child of children) {
            const key = orderKey(child);
            if (!key) rest.push(child);
            else if (key[0] === 0) below.push(child);
            else sorted.push({ child, z: key[1], y: key[2], i: sorted.length });
        }
        sorted.sort((a, b) => a.z - b.z || a.y - b.y || a.i - b.i);
        const order = below.concat(sorted.map(e => e.child), rest);
        if (order.every((c, i) => c === children[i])) return;
        children.length = 0;
        for (const c of order) children.push(c);
        if (field.sortDirty !== undefined) field.sortDirty = true;
    };
    const _spritesetUpdate = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _spritesetUpdate.call(this);
        if (!view()) return;
        this.rrSymSortField();
        // Visual Effect: darken and lighten tint the battle's background.
        if (ADDON.visual) {
            const alpha = $gameScreen.rrSymAlpha ? $gameScreen.rrSymAlpha() : 0;
            for (const sprite of [this._back1Sprite, this._back2Sprite, this._backgroundSprite]) if (sprite && sprite.setBlendColor) sprite.setBlendColor([0, 0, 0, alpha]);
        }
    };

    // Visual Effect's screen: the background darkens over 32 frames and lightens over 16.
    const GS = Game_Screen.prototype;
    GS.rrSymClearAlpha = function() { this._rrSymAlpha = 0; this._rrSymDarken = 0; this._rrSymLighten = 0; };
    GS.rrSymAlpha = function() { return this._rrSymAlpha || 0; };
    GS.rrSymStartDarken = function() { this._rrSymDarken = 32; };
    GS.rrSymStartLighten = function() { this._rrSymLighten = 16; };
    const _screenClear = GS.clear;
    GS.clear = function() { _screenClear.call(this); this.rrSymClearAlpha(); };
    const _screenUpdate = GS.update;
    GS.update = function() {
        _screenUpdate.call(this);
        if (this._rrSymDarken > 0) { this._rrSymAlpha = (32 - this._rrSymDarken) * 4; this._rrSymDarken--; }
        if (this._rrSymLighten > 0) { this._rrSymAlpha = this._rrSymLighten * 8; this._rrSymLighten--; }
    };

    //-------------------------------------------------------------------------
    // The action flow: the sequences run a step a frame while the action is taken
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    // Lines other plugins take: answer true for a line handled.
    SB.rrImportedSymphony = function() { return false; };

    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        const scene = battleScene(), subject = this._subject;
        const action = subject && subject.currentAction();
        // The sequences run with or without the side view drawn.
        if (!scene || !action) return _startAction.call(this);
        // The costs, the item's common events and the log's own sequence wait for the setup lines; the targets are
        // made without MZ's repeats (the sequence repeats the effect), attacks on one foe once per attack.
        const log = this._logWindow;
        subject.useItem = function() {};
        action.applyGlobal = function() {};
        log.startAction = function() {};
        action.repeatTargets = function(targets) { return targets.filter(Boolean); };
        try {
            _startAction.call(this);
        } finally {
            delete subject.useItem;
            delete action.applyGlobal;
            delete log.startAction;
            delete action.repeatTargets;
        }
        let targets = compact(this._targets || []);
        if (action.isAttack() && action.isForOpponent() && action.isForOne() && !subject.isConfused()) {
            const times = 1 + (subject.attackTimesAdd ? Math.max(0, Math.trunc(subject.attackTimesAdd())) : 0);
            if (times > 1) targets = targets.flatMap(t => Array(times).fill(t));
        }
        this._targets = [];
        this._rrSymphony = scene.rrSymUseItem(subject, action, targets);
    };
    const _initMembers = BattleManager.initMembers;
    BattleManager.initMembers = function() {
        _initMembers.call(this);
        this._rrSymphony = null;
    };
    const _update = BattleManager.update;
    BattleManager.update = function(timeActive) {
        if (this._rrSymphony) {
            const scene = battleScene();
            let done = true;
            if (scene && this._phase === 'action') {
                try { done = this._rrSymphony.next().done; }
                catch (error) { console.error('RR_BattleSymphony:', error); done = true; }
            }
            if (!done) return;
            this._rrSymphony = null;
            if (scene) scene.rrSymEndAction();
            this._targets = [];
        }
        _update.call(this, timeActive);
    };
    // A counter or a reflection plays its own list after the hit that caused it.
    const _invokeCounterAttack = BattleManager.invokeCounterAttack;
    BattleManager.invokeCounterAttack = function(subject, target) {
        const scene = battleScene();
        if (!scene || !scene._rrSym || !scene._rrSym.running) return _invokeCounterAttack.call(this, subject, target);
        scene._rrSym.pending = { kind: 'counter', target, item: this._action.item() };
    };
    const _invokeMagicReflection = BattleManager.invokeMagicReflection;
    BattleManager.invokeMagicReflection = function(subject, target) {
        const scene = battleScene();
        if (!scene || !scene._rrSym || !scene._rrSym.running) return _invokeMagicReflection.call(this, subject, target);
        scene._rrSym.pending = { kind: 'reflect', target, item: this._action.item() };
    };
    const _applySubstitute = BattleManager.applySubstitute;
    BattleManager.applySubstitute = function(target) {
        const substitute = _applySubstitute.call(this, target);
        const scene = battleScene();
        if (scene && scene._rrSym && substitute !== target) scene._rrSym.substituteSubject = substitute;
        return substitute;
    };

    // Waits (each a frame at a time)
    SB.rrSymWaitFrames = function* (frames) { for (let i = 0; i < frames; i++) yield; };
    SB.rrSymWait = function* (frames) {
        for (let i = 0; i < frames; i++) {
            if (i < div(frames, 2) || !(Input.isPressed('shift') || Input.isPressed('ok'))) yield;
        }
    };
    SB.rrSymWaitForAnimation = function* () {
        yield;
        while (this._spriteset.isAnimationPlaying() || $gameTemp._animationQueue.length > 0) yield;
    };
    SB.rrSymWaitForEffect = function* () {
        yield;
        while (this._spriteset.isEffecting()) yield;
    };
    SB.rrSymWaitForMove = function* () {
        yield;
        while (this._spriteset.rrSymIsMoving()) yield;
    };
    // The log's lines are shown at once, as the original's log drew them; only its waits take frames.
    SB.rrSymFlushLog = function() {
        const log = this._logWindow;
        for (let guard = 0; guard < 500; guard++) {
            if (!log._methods || !log._methods.length || log._waitCount > 0 || log._waitMode || BattleManager._rrDeathEvent) return;
            log.callNextMethod();
        }
    };
    SB.rrSymWaitForLog = function* () {
        this.rrSymFlushLog();
        while (this._logWindow.isBusy()) { yield; this.rrSymFlushLog(); }
        if (this._rrSym.waitAnimation) { this._rrSym.waitAnimation = false; yield* this.rrSymWaitForAnimation(); }
    };
    SB.rrSymRefreshStatus = function() { this._statusWindow.refresh(); };

    // One skill or item: setup (then the costs), whole, target (each target), follow and finish.
    SB.rrSymUseItem = function* (subject, action, targets) {
        const S = this._rrSym || (this._rrSym = { condition: [] });
        S.running = true;
        S.subject = subject;
        S.act = action;
        const item = action.item();
        S.sceneItem = item;
        if (YEA_FLASH_WHITE) subject.requestEffect('whiten');
        const attack = action.isAttack(), weapon = subject.rrSymWeapons()[0];
        const wAction = attack && weapon;
        if (attack && subject.rrSymDualAttack()) targets = targets.concat(targets);
        const listOf = (phase) => (wAction && validActions(weapon, phase) ? symphonyOf(weapon)[phase] : symphonyOf(item)[phase]);
        yield* this.rrSymPerform(listOf('setup'), targets);
        subject.useItem(item);
        action.applyGlobal();
        this.rrSymRefreshStatus();
        yield* this.rrSymPerform(listOf('whole'), targets);
        const targetList = listOf('target');
        for (const target of targets.slice()) {
            if (target.isDead()) continue;
            yield* this.rrSymPerform(targetList, [target]);
        }
        yield* this.rrSymPerform(listOf('follow'), targets);
        let finish = listOf('finish');
        const hasImmortalOff = finish.some(e => e[0] === 'IMMORTAL' && Array.isArray(e[1]) && e[1].length === 2 && e[1][0] === 'TARGETS' && e[1][1] === 'FALSE');
        if (!hasImmortalOff && AUTO_IMMORTAL_OFF) finish = [['IMMORTAL', ['TARGETS', 'FALSE']]].concat(finish);
        yield* this.rrSymPerform(finish, targets);
        for (const target of targets) if (target.isActor() && this.rrStatusRedrawTarget) this.rrStatusRedrawTarget(target);
        yield* this.rrSymWaitForLog();
    };
    // After the action: every battler's result, icons, position and pose are reset, and the darkening goes.
    SB.rrSymEndAction = function() {
        const S = this._rrSym;
        if (S) { S.running = false; S.subject = null; S.act = null; S.pending = null; }
        for (const battler of $gameParty.battleMembers().concat($gameTroop.members())) {
            const r = battler.result();
            r._rrSymCalc = true;
            r.clear();
            battler.rrSymClearIcons();
            battler.rrSymSetDefaultPosition();
            battler.rrSymBreakPose();
        }
        if (ADDON.visual) $gameScreen.rrSymClearAlpha();
        this._statusWindow.refresh();
    };

    SB.rrSymPerform = function* (actions, targets) {
        const S = this._rrSym;
        const former = { action: S.action, values: S.values ? S.values.slice() : S.values, targets: S.actionTargets ? S.actionTargets.slice() : S.actionTargets, item: S.sceneItem };
        S.actionTargets = targets;
        for (const entry of actions || []) {
            S.action = up(entry[0]);
            S.values = entry[1] === undefined ? null : entry[1];
            if (S.values) for (let i = 0; i < S.values.length; i++) if (typeof S.values[i] === 'string') S.values[i] = S.values[i].toUpperCase();
            if (!inBattle()) break;
            if (S.subject && S.subject.isDead()) break;
            if (!this.rrSymConditionMet()) continue;
            yield* this.rrSymDispatch();
        }
        S.action = former.action;
        S.values = former.values;
        S.actionTargets = former.targets;
        S.sceneItem = former.item;
    };
    const vals = (S) => S.values || [];

    SB.rrSymConditionEnv = function() {
        const S = this._rrSym, user = S.subject, action = user ? user.rrSymCurrentAction() : null;
        const env = {
            target: S.actionTargets[0] ?? null, targets: S.actionTargets, user, skill: S.sceneItem ?? null, item: S.sceneItem ?? null,
            attack: !!(S.counterSubject || (action && action.isAttack()))
        };
        if (user && user.isActor()) env.weapons = user.weapons();
        else env.weapons = null;
        return env;
    };
    SB.rrSymConditionMet = function() {
        const S = this._rrSym;
        if (S.action === 'END') S.condition.pop();
        let env = null;
        const getEnv = () => env || (env = this.rrSymConditionEnv());
        for (const line of S.condition) {
            const m = /(IF|UNLESS)[ ](.+)/i.exec(line);
            if (!m) continue;
            const value = Cond.test(m[2].toLowerCase(), getEnv());
            if (m[1].toUpperCase() === 'IF' ? !value : value) return false;
        }
        for (const value of vals(S)) {
            if (typeof value !== 'string') continue;
            let m;
            if ((m = /IF[ ](.*)/i.exec(value))) { if (!Cond.test(m[1].toLowerCase(), getEnv())) return false; }
            else if ((m = /UNLESS[ ](.*)/i.exec(value))) { if (Cond.test(m[1].toLowerCase(), getEnv())) return false; }
        }
        return true;
    };

    const WAIT_ACTIONS = ['WAIT', 'WAIT SKIP', 'WAIT FOR ANIMATION', 'WAIT FOR MOVE', 'WAIT FOR MOVEMENT', 'ANI WAIT'];
    SB.rrSymDispatch = function* () {
        const A = this._rrSym.action;
        if (/ANIMATION[ ](\d+)|SKILL ANIMATION|ATTACK ANIMATION|ANIMATION/i.test(A)) yield* this.rrSymActionAnimation();
        else if (/ATTACK EFFECT|SKILL EFFECT/i.test(A)) yield* this.rrSymActionSkillEffect();
        else if (/AUTO SYMPHONY|AUTOSYMPHONY/i.test(A)) yield* this.rrSymActionAutosymphony();
        else if (/ICON CREATE|CREATE ICON/i.test(A)) this.rrSymActionCreateIcon();
        else if (/ICON DELETE|DELETE ICON/i.test(A)) this.rrSymActionDeleteIcon();
        else if (A === 'ICON' || A === 'ICON EFFECT') yield* this.rrSymActionIconEffect();
        else if (/ICON THROW[ ](.*)/i.test(A)) yield* this.rrSymActionIconThrow();
        else if (/IF[ ](.+)/i.test(A)) this._rrSym.condition.push(A);
        else if (/JUMP[ ](.*)/i.test(A)) yield* this.rrSymActionMove();
        else if (/MESSAGE/i.test(A)) yield* this.rrSymActionMessage();
        else if (/MOVE[ ](.*)/i.test(A)) yield* this.rrSymActionMove();
        else if (/IMMORTAL/i.test(A)) yield* this.rrSymActionImmortal();
        else if (/POSE/i.test(A)) this.rrSymActionPose();
        else if (/STANCE/i.test(A)) this.rrSymActionStance();
        else if (/UNLESS[ ](.+)/i.test(A)) this._rrSym.condition.push(A);
        else if (/TELEPORT[ ](.*)/i.test(A)) yield* this.rrSymActionMove();
        else if (WAIT_ACTIONS.includes(A)) yield* this.rrSymActionWait();
        else yield* this.rrSymImported();
    };

    // The add-ons' lines (the last loaded answers first), then other plugins', then an AutoSymphony by its name.
    SB.rrSymImported = function* () {
        const S = this._rrSym, A = S.action;
        if (ADDON.durability && /DAMAGE CHANGE DURABILITY SCALE/i.test(A)) return this.rrSymActionDurabilityScale();
        if (ADDON.orientation && /FACE/i.test(A)) return this.rrSymActionFace();
        if (ADDON.visual) {
            if (/AFTERIMAGE|MIRAGE/i.test(A)) return this.rrSymActionAfterimage();
            if (/EFFECT/i.test(A)) return this.rrSymActionEffect();
            if (/MOVIE/i.test(A)) return yield* this.rrSymActionMovie();
            if (/SCREEN/i.test(A)) return this.rrSymActionScreen();
            if (/VANISH/i.test(A)) return this.rrSymActionVanish();
        }
        const scene = this;
        const context = {
            values: vals(S), actionTargets: S.actionTargets, subject: S.subject,
            get targets() { return scene.rrSymGetActionTargets(); }
        };
        if (this.rrImportedSymphony(A, context)) return;
        if (/SAMPLE SYMPHONY/i.test(A)) { console.log(A + ': ' + vals(S).join(' ') + ' '); return; }
        if (hasAuto(A)) {
            S.values = [A];
            S.action = 'AUTO SYMPHONY';
            yield* this.rrSymActionAutosymphony();
        }
    };

    //-------------------------------------------------------------------------
    // Target typing
    //-------------------------------------------------------------------------
    const alive = (unit) => unit.aliveMembers();
    const remove = (list, battler) => { if (!battler) return list; for (let i = list.length - 1; i >= 0; i--) if (list[i] === battler) list.splice(i, 1); return list; };
    // Who a word names. "targets" is the action's own list (a later "user" is pushed onto it, as the original did).
    SB.rrSymTyping = function(text, result, forMains) {
        const S = this._rrSym, subject = S.subject;
        let m;
        const t = String(text);
        if (/(?:USER)/i.test(t)) { if (subject) result.push(subject); return result; }
        if (/(?:TARGET|TARGETS)/i.test(t)) return S.actionTargets;
        if (/(?:COUNTER SUBJECT)/i.test(t)) return [S.counterSubject];
        if (/(?:REFLECT SUBJECT)/i.test(t)) return [S.reflectSubject];
        if (/(?:SUBSTITUTE SUBJECT)/i.test(t)) return [S.substituteSubject];
        if (/(?:ACTORS|PARTY|ACTORS LIVING)/i.test(t)) return alive($gameParty);
        if (/(?:ALL ACTORS|ACTORS ALL)/i.test(t)) return $gameParty.battleMembers();
        if (/(?:ACTORS NOT USER|PARTY NOT USER)/i.test(t)) return remove(alive($gameParty), subject);
        if (/(?:ENEMIES|TROOP|ENEMIES LIVING)/i.test(t)) return alive($gameTroop);
        if (/(?:ALL ENEMIES|ENEMIES ALL)/i.test(t)) return $gameTroop.members();
        if (/(?:ENEMIES NOT USER|ENEMIES NOT USER)/i.test(t)) return remove(alive($gameTroop), subject);
        if ((m = /ACTOR[ ](\d+)/i.exec(t))) { result.push($gameParty.battleMembers()[Number(m[1])]); return result; }
        if ((m = /ENEMY[ ](\d+)/i.exec(t))) { result.push($gameTroop.members()[Number(m[1])]); return result; }
        if (forMains) {
            if (/(?:EVERYTHING|EVERYBODY)/i.test(t)) return alive($gameParty).concat(alive($gameTroop));
            if (/(?:EVERYTHING NOT USER|EVERYBODY NOT USER)/i.test(t)) return remove(alive($gameParty).concat(alive($gameTroop)), subject);
            if (/(?:ALLIES|FRIENDS)/i.test(t)) return subject ? alive(subject.friendsUnit()) : result;
            if (/(?:OPPONENTS|RIVALS)/i.test(t)) return subject ? alive(subject.opponentsUnit()) : result;
            if (/(?:FRIENDS NOT USER)/i.test(t)) return subject ? remove(alive(subject.friendsUnit()), subject) : result;
            if (/(?:FOCUS)/i.test(t)) { const r = S.actionTargets; if (subject) r.push(subject); return r; }
            if (/(?:NOT FOCUS|NON FOCUS)/i.test(t)) return remove(alive($gameParty).concat(alive($gameTroop)).filter(b => !S.actionTargets.includes(b)), subject);
            return result;
        }
        if (/(?:EVERYTHING|EVERYBODY)/i.test(t)) return alive($gameParty).concat(alive($gameTroop));
        if (/(?:EVERYTHING NOT USER|EVERYBODY NOT USER)/i.test(t)) return remove(alive($gameParty).concat(alive($gameTroop)), subject);
        if (/(?:ALLIES|FRIENDS)/i.test(t)) return subject ? alive(subject.friendsUnit()) : result;
        if (/(?:OPPONENTS|RIVALS)/i.test(t)) return subject ? alive(subject.opponentsUnit()) : result;
        if (/(?:FRIENDS NOT USER)/i.test(t)) return subject ? remove(alive(subject.friendsUnit()), subject) : result;
        if (/(?:NOT FOCUS|NON FOCUS)/i.test(t)) return remove(alive($gameParty).concat(alive($gameTroop)).filter(b => !S.actionTargets.includes(b)), subject);
        if (/(?:FOCUS)/i.test(t)) { const r = S.actionTargets; if (subject) r.push(subject); return r; }
        return result;
    };
    // The battlers the action's name names (move user, icon throw user ...).
    SB.rrSymGetActionMains = function() { return compact(this.rrSymTyping(this._rrSym.action, [], true)); };
    // The battlers the values name, read from the last value to the first.
    SB.rrSymGetActionTargets = function() {
        let result = [];
        for (const value of vals(this._rrSym).slice().reverse()) {
            if (value === null || value === undefined) continue;
            result = this.rrSymTyping(up(value), result, false);
        }
        return compact(result);
    };

    //-------------------------------------------------------------------------
    // The lines
    //-------------------------------------------------------------------------
    SB.rrSymActionAnimation = function* () {
        const S = this._rrSym, A = S.action, v = vals(S), subject = S.subject;
        let targets = this.rrSymGetActionTargets();
        if (A === 'SKILL ANIMATION' || A === 'ATTACK ANIMATION') targets = S.actionTargets;
        if (targets.length === 0) return;
        let id, m;
        const action = subject.rrSymCurrentAction();
        if ((m = /ANIMATION[ ](\d+)/i.exec(A))) id = Number(m[1]);
        else if (A === 'SKILL ANIMATION' || A === 'ANIMATION') {
            if (!action || !action.item()) return;
            id = action.item().animationId;
        } else if (A === 'ATTACK ANIMATION') {
            id = subject.attackAnimationId1();
            if (subject.attackAnimationId2() > 0 && toI(v[1]) === 2) id = subject.attackAnimationId2();
        } else if (A === 'ATTACK ANIMATION2') id = subject.attackAnimationId2();
        else if (A === 'LAST ANIMATION') id = S.lastAnimationId;
        else if (A === 'WEAPON ANIMATION') id = subject.attackAnimationId1();
        else if (A === 'WEAPON ANIMATION2') id = subject.attackAnimationId2();
        const mirror = v.includes('MIRROR');
        if (id === -1) id = subject.attackAnimationId1();
        const animation = id === undefined || id === null ? null : $dataAnimations[id];
        if (!animation) return;
        const screen = animation.frames ? animation.position === 3 : animation.displayType === 2;
        $gameTemp.requestAnimation(screen ? [targets[0]] : targets, id, mirror);
        S.lastAnimationId = id;
        if (!v.includes('WAIT')) return;
        yield* this.rrSymWaitForAnimation();
    };

    SB.rrSymActionSkillEffect = function* () {
        const S = this._rrSym, subject = S.subject, v = vals(S);
        if (!subject || !subject.isAlive()) return;
        const action = subject.rrSymCurrentAction();
        if (!action || !action.item()) return;
        const targets = uniq(S.actionTargets);
        const substitutes = uniq(targets.map(t => t.friendsUnit().substituteBattler()));
        const item = action.item();
        if (v.includes('CLEAR')) {
            for (const t of targets) { t.result()._rrSymCalc = true; t.result().clear(); }
            return;
        }
        if (v.includes('COUNTER CHECK')) { for (const t of targets) t.result().rrSymSet('counter'); return; }
        if (v.includes('REFLECT CHECK')) { for (const t of targets) t.result().rrSymSet('reflection'); return; }
        let flags = [];
        if (v.includes('CALC')) flags.push('calc');
        if (v.includes('PERFECT')) flags = ['perfect'];
        for (const value of v) if (value !== 'PERFECT' && value !== 'CALC' && typeof value === 'string') flags.push(value.toLowerCase());
        if (v.includes('WHOLE') || v.length === 0) flags = ['calc', 'dmg', 'effect'];
        for (const sub of substitutes) {
            if (!sub) continue;
            sub.result().rrSymClearFlags();
            for (const f of flags) sub.result().rrSymSet(f);
        }
        const repeats = Math.max(0, item.repeats === undefined ? 1 : item.repeats);
        for (const target of targets) {
            target.result().rrSymClearFlags();
            for (const f of flags) target.result().rrSymSet(f);
            for (let i = 0; i < repeats; i++) yield* this.rrSymInvokeItem(target, item);
            target.result().rrSymClearChangeTarget();
            if (S.substituteSubject) S.substituteSubject.result().rrSymClearChangeTarget();
        }
    };
    // One hit, through the battle's own flow (counter, reflection, substitute, the log), then the lists for a
    // critical, a miss, an evasion, a failure and damage.
    const forDeadFriend = (item) => (window.RRYanflyBattleScope ? window.RRYanflyBattleScope.forDeadFriend(item) : !!item && [9, 10].includes(item.scope));
    SB.rrSymInvokeItem = function* (target, item) {
        const S = this._rrSym, subject = S.subject;
        // A target fallen (or risen) since the action began takes no hit and no collapse check.
        const applies = target.isDead() === forDeadFriend(item);
        const held = BattleManager._action;
        BattleManager._action = S.act;
        S.pending = null;
        try { BattleManager.invokeAction(subject, target); }
        finally { BattleManager._action = held; }
        yield* this.rrSymWaitForLog();
        const pending = S.pending;
        S.pending = null;
        if (pending && pending.kind === 'counter') yield* this.rrSymCounterAttack(pending.target, pending.item);
        else if (pending && pending.kind === 'reflect') yield* this.rrSymMagicReflection(pending.target, pending.item);
        else if (applies) yield* this.rrSymPerformCollapseCheck(target);
        const r = target.result();
        if (r.critical) yield* this.rrSymPerform(DEFAULTS.CRITICAL_ACTIONS, [target]);
        if (r.missed) yield* this.rrSymPerform(DEFAULTS.MISS_ACTIONS, [target]);
        if (r.evaded) yield* this.rrSymPerform(DEFAULTS.EVADE_ACTIONS, [target]);
        if (!r.success) yield* this.rrSymPerform(DEFAULTS.FAIL_ACTIONS, [target]);
        if (hasDamage(r)) yield* this.rrSymPerform(DEFAULTS.DAMAGED_ACTION, [target]);
    };
    SB.rrSymPerformCollapseCheck = function* (target) {
        if (target.rrSymCanCollapse()) target.performCollapse();
        if (this._rrSym.waitAnimation) { this._rrSym.waitAnimation = false; yield* this.rrSymWaitForAnimation(); }
        yield* this.rrSymWaitForLog();
        yield* this.rrSymWaitForEffect();
    };
    // The counter: the countering battler becomes the user with an attack, plays the counter list at the attacker.
    SB.rrSymCounterAttack = function* (target, item) {
        const S = this._rrSym, log = this._logWindow;
        log.displayCounter(target);
        yield* this.rrSymWaitForLog();
        const lastSubject = S.subject, lastAct = S.act, backup = target._actions.slice();
        S.counterSubject = target;
        S.subject = target;
        const counter = new Game_Action(target);
        counter.setAttack();
        target._actions = [counter];
        S.act = counter;
        yield* this.rrSymPerform(DEFAULTS.COUNTER_ACTION, [lastSubject]);
        target._actions = backup;
        S.subject = lastSubject;
        S.act = lastAct;
        S.counterSubject = null;
        log.displayActionResults(target, lastSubject);
        yield* this.rrSymWaitForLog();
        this.rrSymRefreshStatus();
        yield* this.rrSymPerformCollapseCheck(lastSubject);
        yield* this.rrSymPerformCollapseCheck(target);
    };
    // The reflection: the reflecting battler becomes the user of the same skill or item, back at the user.
    SB.rrSymMagicReflection = function* (target, item) {
        const S = this._rrSym, log = this._logWindow;
        V(S.subject).magicReflection = true;
        log.displayReflection(target);
        yield* this.rrSymWaitForLog();
        const lastSubject = S.subject, lastAct = S.act, backup = target._actions.slice();
        S.reflectSubject = target;
        S.subject = target;
        const reflected = new Game_Action(target);
        if (DataManager.isSkill(item)) reflected.setSkill(item.id); else reflected.setItem(item.id);
        target._actions = [reflected];
        S.act = reflected;
        yield* this.rrSymPerform(DEFAULTS.REFLECT_ACTION, [lastSubject]);
        target._actions = backup;
        S.subject = lastSubject;
        S.act = lastAct;
        S.reflectSubject = null;
        log.displayActionResults(target, lastSubject);
        yield* this.rrSymWaitForLog();
        this.rrSymRefreshStatus();
        yield* this.rrSymPerformCollapseCheck(lastSubject);
        yield* this.rrSymPerformCollapseCheck(target);
        V(lastSubject).magicReflection = false;
    };

    SB.rrSymActionAutosymphony = function* () {
        const S = this._rrSym;
        const key = up(vals(S)[0] ?? '');
        if (!hasAuto(key)) return;
        yield* this.rrSymPerform(AUTO[key], S.actionTargets);
    };

    const iconSymbol = (value) => {
        switch (value) {
            case 'WEAPON': case 'WEAPON1': return ':weapon1';
            case 'WEAPON2': return ':weapon2';
            case 'SHIELD': return ':shield';
            case 'ITEM': return ':item';
        }
        return value;
    };
    SB.rrSymActionCreateIcon = function() {
        const S = this._rrSym, v = vals(S);
        const targets = this.rrSymGetActionTargets();
        if (targets.length === 0 || EMPTY_VIEW) return;
        let symbol, attachment;
        switch (v[1]) {
            case 'WEAPON': case 'WEAPON1': symbol = ':weapon1'; attachment = 'hand1'; break;
            case 'WEAPON2': symbol = ':weapon2'; attachment = 'hand2'; break;
            case 'SHIELD': symbol = ':shield'; attachment = 'shield'; break;
            case 'ITEM': symbol = ':item'; attachment = 'middle'; break;
            default: symbol = v[1]; attachment = 'middle';
        }
        switch (v[2]) {
            case 'HAND': case 'HAND1': attachment = 'hand1'; break;
            case 'HAND2': case 'SHIELD': attachment = 'hand2'; break;
            case 'ITEM': attachment = 'item'; break;
            case 'MIDDLE': case 'BODY': attachment = 'middle'; break;
            case 'TOP': case 'HEAD': attachment = 'top'; break;
            case 'BOTTOM': case 'FEET': case 'BASE': attachment = 'base'; break;
        }
        for (const target of targets) {
            if (!target.rrSymSprite()) continue;
            if (!target.rrSymUseCharset() && !WEAPON_ICON_NON_CHARSET && (symbol === ':weapon1' || symbol === ':weapon2')) continue;
            target.rrSymCreateIcon(symbol, toI(v[3]));
            const icon = V(target).icons.get(symbol);
            if (!icon) continue;
            icon.setOrigin(attachment);
        }
    };
    SB.rrSymActionDeleteIcon = function() {
        const S = this._rrSym, targets = this.rrSymGetActionTargets();
        if (targets.length === 0) return;
        const symbol = iconSymbol(vals(S)[1]);
        for (const target of targets) target.rrSymDeleteIcon(symbol);
    };
    SB.rrSymActionIconEffect = function* () {
        const S = this._rrSym, v = vals(S), targets = this.rrSymGetActionTargets();
        if (targets.length === 0) return;
        const symbol = iconSymbol(v[1]);
        for (const target of targets) {
            const icon = V(target).icons.get(symbol);
            if (!icon) continue;
            let frames = 8, m;
            const kind = String(v[2] ?? '');
            if (kind === 'ANGLE') icon.setAngle(toI(v[3]));
            else if (kind === 'ROTATE' || kind === 'REROTATE') {
                let angle = toI(v[3]);
                if (kind === 'REROTATE') angle = -angle;
                frames = toI(v[4]) || 8;
                icon.createAngle(angle, frames);
            } else if ((m = /ANIMATION[ ](\d+)/i.exec(kind))) {
                const animation = $dataAnimations[Number(m[1])];
                if (!animation) return;
                icon.startIconAnimation(animation);
            } else if ((m = /MOVE_X[ ](\d+)/i.exec(kind))) icon.createMovement(Number(m[1]), icon.ry, toI(v[3]) || 8);
            else if ((m = /MOVE_Y[ ](\d+)/i.exec(kind))) icon.createMovement(icon.rx, Number(m[1]), toI(v[3]) || 8);
            else if ((m = /CUR_X[ ]([-]?\d+)/i.exec(kind))) icon.createMovement(icon.rx + Number(m[1]), icon.ry, toI(v[3]) || 8);
            else if ((m = /CUR_Y[ ]([-]?\d+)/i.exec(kind))) icon.createMovement(icon.rx, icon.ry + Number(m[1]), toI(v[3]) || 8);
            else if (kind === 'FADE IN') icon.setFade(Math.trunc(256.0 / (toI(v[3]) || 8)));
            else if (kind === 'FADE OUT') icon.setFade(-Math.trunc(256.0 / (toI(v[3]) || 8)));
            else if (kind === 'FLOAT') { frames = toI(v[3]) || 24; icon.createMoveDirection(8, frames, frames); }
            else if (kind === 'SWING') { icon.setAngle(0); icon.createAngle(90, 10); }
            else if (kind === 'UPSWING') { icon.setAngle(90); icon.createAngle(0, 10); }
            else if (kind === 'STAB' || kind === 'THRUST' || kind === 'CLAW') {
                let direction = Dir.direction(V(target).pose);
                const sprite = target.rrSymSprite();
                if (sprite && sprite._rrMirror) direction = Dir.opposite(direction);
                if (kind === 'CLAW') {
                    const table = { 8: [7, 3], 4: [1, 9], 6: [3, 7], 2: [9, 1] }[direction];
                    if (table) {
                        icon.createMoveDirection(table[1], 32, 1);
                        icon.update();
                        icon.createMoveDirection(table[0], 52, 8);
                    }
                } else {
                    const angle = { 8: -45, 4: 45, 6: -135, 2: 135 }[direction];
                    if (angle !== undefined) {
                        icon.setAngle(angle);
                        icon.createMoveDirection(Dir.opposite(direction), 40, 1);
                        icon.update();
                        icon.createMoveDirection(direction, 32, 8);
                    }
                }
            }
            if (v.includes('WAIT')) while (icon.isEffecting() && !icon._rrDisposed) yield;
        }
    };
    SB.rrSymActionIconThrow = function* () {
        const S = this._rrSym, v = vals(S);
        const mains = this.rrSymGetActionMains(), targets = this.rrSymGetActionTargets();
        if (mains.length === 0) return;
        const symbol = iconSymbol(v[1]);
        for (const main of mains) {
            const icon = V(main).icons.get(symbol);
            if (!icon) continue;
            let frames = toI(v[3]);
            if (frames <= 0) frames = 12;
            const arc = toF(v[2]);
            for (const target of targets) {
                const sprite = target.rrSymSprite();
                icon.createMovement(target._screenX, target._screenY - div(spriteH(sprite), 2), frames);
                icon.createArc(arc);
                if (v.includes('WAIT')) while (icon.isEffecting() && !icon._rrDisposed) yield;
            }
        }
    };
    SB.rrSymActionMessage = function* () {
        const S = this._rrSym, user = S.subject;
        if (!user) return;
        const action = user.rrSymCurrentAction();
        const item = action && action.item();
        if (!item) return;
        this._logWindow.displayAction(user, item);
        yield* this.rrSymWaitForLog();
    };

    // Moves, jumps and teleports.
    SB.rrSymActionMove = function* () {
        const S = this._rrSym, v = vals(S), A = S.action;
        const movers = this.rrSymGetActionMains();
        if (movers.length === 0 || EMPTY_VIEW) return;
        const jumpArc = () => { const m = /JUMP[ ](.*)/i.exec(A); if (!m) return null; const all = m[1].match(/(?:ARC)[ ](\d+)/gi); return all ? toI(/(\d+)$/.exec(all[all.length - 1])[1]) : 0; };
        const kind = v[0];
        if (kind === 'FORWARD' || kind === 'BACKWARD') {
            let distance = toI(v[1]);
            if (distance <= 0) distance = kind === 'FORWARD' ? 16 : 8;
            let frames = toI(v[2]);
            if (frames <= 0) frames = 8;
            for (const mover of movers) {
                if (!mover.isAppeared()) continue;
                const step = dirStep(V(mover).direction, distance);
                if (!step) return;
                let dx = mover._screenX, dy = mover._screenY;
                dx += kind === 'FORWARD' ? step[0] : -step[0];
                dy += kind === 'FORWARD' ? step[1] : -step[1];
                if (kind !== 'BACKWARD') mover.rrSymFaceCoordinate(dx, dy);
                mover.rrSymCreateMovement(dx, dy, frames);
                const arc = jumpArc();
                if (arc !== null) mover.rrSymCreateJump(arc);
            }
        } else if (kind === 'ORIGIN' || kind === 'RETURN') {
            let frames = toI(v[1]);
            if (frames <= 0) frames = 20;
            for (const mover of movers) {
                if (!mover.isAppeared()) continue;
                const vv = V(mover);
                if (vv.ox === mover._screenX && vv.oy === mover._screenY) continue;
                if (kind === 'ORIGIN') mover.rrSymFaceCoordinate(vv.ox, vv.oy);
                mover.rrSymCreateMovement(vv.ox, vv.oy, frames);
                const arc = jumpArc();
                if (arc !== null) mover.rrSymCreateJump(arc);
            }
        } else if (kind === 'TARGET' || kind === 'TARGETS' || kind === 'USER') {
            let frames = toI(v[2]);
            if (frames <= 0) frames = 20;
            const targets = kind === 'USER' ? [S.subject] : S.actionTargets;
            let dx = 0, dy = 0;
            const W = (b) => spriteW(b.rrSymSprite()), H = (b) => spriteH(b.rrSymSprite());
            const sides = (target, mover, back) => {
                const sideL = target._screenX - div(W(target), 2), sideR = target._screenX + div(W(target), 2);
                const sideU = target._screenY - H(target), sideD = target._screenY;
                const vv = V(mover);
                if (sideL > vv.ox) { dx += back ? div(W(target), 2) + div(W(mover), 2) : -div(W(target), 2) - div(W(mover), 2); }
                else if (sideR < vv.ox) { dx += back ? -div(W(target), 2) - div(W(mover), 2) : div(W(target), 2) + div(W(mover), 2); }
                else if (sideU > vv.oy - H(mover)) dy -= H(target);
                else if (sideD < vv.oy - H(mover)) dy += H(mover);
            };
            const place = v[1];
            for (const target of targets) {
                if (place === 'BASE' || place === 'FOOT' || place === 'FEET') {
                    dx += target._screenX; dy += target._screenY;
                    for (const mover of movers) { if (mover.isAppeared()) sides(target, mover, false); }
                } else if (place === 'BODY' || place === 'MIDDLE' || place === 'MID') {
                    dx += target._screenX; dy += target._screenY - div(H(target), 2);
                    for (const mover of movers) { if (!mover.isAppeared()) continue; sides(target, mover, false); dy += H(mover); dy -= div(H(mover), 2); }
                } else if (place === 'CENTER') {
                    dx += target._screenX; dy += target._screenY - div(H(target), 2);
                } else if (place === 'HEAD' || place === 'TOP') {
                    dx += target._screenX; dy += target._screenY - H(target);
                    for (const mover of movers) { if (!mover.isAppeared()) continue; sides(target, mover, false); dy += H(mover); dy -= div(H(mover), 2); }
                } else if (place === 'BACK') {
                    dx += target._screenX; dy += target._screenY - H(target);
                    for (const mover of movers) { if (!mover.isAppeared()) continue; sides(target, mover, true); dy += H(mover); dy -= div(H(mover), 2); }
                } else {
                    dx += target._screenX; dy += target._screenY;
                }
            }
            if (targets.length === 0) return;
            dx = div(dx, targets.length);
            dy = div(dy, targets.length);
            for (const mover of movers) {
                if (!mover.isAppeared()) continue;
                if (mover._screenX === dx && mover._screenY === dy) continue;
                if (/MOVE[ ](.*)/i.test(A)) {
                    mover.rrSymFaceCoordinate(dx, dy);
                    mover.rrSymCreateMovement(dx, dy, frames);
                } else if (/TELEPORT[ ](.*)/i.test(A)) {
                    mover._screenX = dx;
                    mover._screenY = dy;
                } else if (/JUMP[ ](.*)/i.test(A)) {
                    mover.rrSymFaceCoordinate(dx, dy);
                    mover.rrSymCreateMovement(dx, dy, frames);
                    mover.rrSymCreateJump(jumpArc() || 0);
                }
            }
        }
        if (!v.includes('WAIT')) return;
        yield* this.rrSymWaitForMove();
    };
    SB.rrSymActionImmortal = function* () {
        const S = this._rrSym, v = vals(S), targets = this.rrSymGetActionTargets();
        if (targets.length === 0) return;
        for (const target of targets) {
            if (!target.isAlive()) continue;
            const flag = up(v[1]);
            if (['TRUE', 'ON', 'ENABLE'].includes(flag)) V(target).immortal = true;
            else if (['OFF', 'FALSE', 'DISABLE'].includes(flag)) {
                V(target).immortal = false;
                target.refresh();
                yield* this.rrSymPerformCollapseCheck(target);
            }
        }
    };
    // Poses belong to the eight-direction add-on, which these games do not carry: the line changes nothing.
    SB.rrSymActionPose = function() {
        const S = this._rrSym, targets = this.rrSymGetActionTargets();
        if (targets.length === 0) return;
        if (['BREAK', 'CANCEL', 'RESET', 'NORMAL'].includes(vals(S)[1])) for (const t of targets) t.rrSymBreakPose();
    };
    const STANCES = {
        IDLE: 'idle', READY: 'idle', DAMAGE: 'struck', DMG: 'struck', STRUCK: 'struck', PIYORI: 'woozy', CRITICAL: 'woozy', DAZED: 'woozy',
        DAZE: 'woozy', DIZZY: 'woozy', WOOZY: 'woozy', VICTORY: 'victory', EVADE: 'defend', DODGE: 'defend', DEFEND: 'defend', DOWN: 'dead',
        DOWNED: 'dead', FALLEN: 'dead', DEAD: 'dead', SWING: 'attack', ATTACK: 'attack', SLASH: 'attack', CAST: 'magic', INVOKE: 'magic',
        MAGIC: 'magic', ITEM: 'item', SKILL: 'skill', PHYSICAL: 'skill', FORWARD: 'advance', MOVE: 'advance', TARGET: 'advance',
        ORIGIN: 'retreat', BACK: 'retreat', RETREAT: 'retreat'
    };
    SB.rrSymActionStance = function() {
        const S = this._rrSym, value = vals(S)[1], targets = this.rrSymGetActionTargets();
        if (targets.length === 0) return;
        if (['BREAK', 'CANCEL', 'RESET', 'NORMAL'].includes(value)) { for (const t of targets) t.rrSymBreakPose(); return; }
        if (!ADDON.holders) return;
        const pose = STANCES[value] || String(value ?? '').toLowerCase();
        for (const target of targets) {
            if (!target.isAppeared() || !target.rrSymUseHb()) continue;
            target.rrSymSetPose(pose);
            V(target).forcePose = true;
        }
    };
    SB.rrSymActionWait = function* () {
        const S = this._rrSym, A = S.action, v = vals(S);
        if (A === 'WAIT FOR ANIMATION') return yield* this.rrSymWaitForAnimation();
        if (A === 'WAIT FOR MOVE' || A === 'WAIT FOR MOVEMENT') return yield* this.rrSymWaitForMove();
        let frames = toI(v[0]);
        if (A === 'ANI WAIT') frames *= ANIMATION_RATE;
        const skip = v.includes('SKIP') || A === 'WAIT SKIP';
        yield* (skip ? this.rrSymWait(frames) : this.rrSymWaitFrames(frames));
    };

    // Add-on lines
    SB.rrSymActionDurabilityScale = function() {
        const S = this._rrSym, subject = S.subject, v = vals(S);
        if (!subject || !subject.isAlive() || v.length === 0) return;
        const base = toF(v[0]);
        const ratio = subject.rrDurabilityDamageRatio ? subject.rrDurabilityDamageRatio(base) : Math.trunc(base);
        for (const target of S.actionTargets) if (target.result().rrSetDamageRatio) target.result().rrSetDamageRatio(ratio);
    };
    SB.rrSymActionFace = function() {
        const S = this._rrSym, value = vals(S)[1], targets = uniq(this.rrSymGetActionTargets());
        if (targets.length === 0) return;
        let reverse = false, direction;
        if (value === 'REVERSE' || value === 'BACKWARD') reverse = true;
        else if (['1', '2', '3', '4', '6', '7', '8', '9'].includes(value)) direction = Number(value);
        else if (value === 'DOWN') direction = 2;
        else if (value === 'LEFT') direction = 4;
        else if (value === 'RIGHT') direction = 6;
        else if (value === 'UP') direction = 8;
        else return;
        for (const target of targets) target.rrSymFaceDirection(reverse ? Dir.opposite(V(target).direction) : direction);
    };
    SB.rrSymActionAfterimage = function() {
        const S = this._rrSym, targets = uniq(this.rrSymGetActionTargets());
        if (targets.length === 0) return;
        const value = up(vals(S)[1]);
        const flag = ['ON', 'TRUE', 'ENABLE'].includes(value) ? true : ['OFF', 'FALSE', 'DISABLE'].includes(value) ? false : null;
        for (const target of targets) if (target.isAppeared()) V(target).afterimage = flag;
    };
    SB.rrSymActionEffect = function() {
        const S = this._rrSym, targets = uniq(this.rrSymGetActionTargets());
        if (targets.length === 0) return;
        const effect = String(vals(S)[1] ?? '').toLowerCase();
        for (const target of targets) {
            if (!target.isAppeared()) continue;
            const sprite = target.rrSymSprite();
            if (sprite) sprite.rrSymStartEffect(ACE_EFFECT[effect] || effect);
        }
    };
    SB.rrSymActionMovie = function* () {
        const name = vals(this._rrSym)[0];
        if (!name || !String(name).length || typeof Video === 'undefined') return;
        Video.play('movies/' + String(name).toLowerCase());
        while (Video.isPlaying()) yield;
    };
    SB.rrSymActionScreen = function() {
        const v = vals(this._rrSym), screen = $gameScreen;
        const n = (i, d) => { const x = toI(v[i]); return x <= 0 ? d : x; };
        switch (v[0]) {
            case 'FADEOUT': case 'FADE OUT': screen.startFadeOut(n(1, 30)); break;
            case 'FADEIN': case 'FADE IN': screen.startFadeIn(n(1, 30)); break;
            case 'TONE': screen.startTint([toI(v[2]), toI(v[3]), toI(v[4]), toI(v[5])], n(1, 30)); break;
            case 'FLASH': screen.startFlash([toI(v[2]), toI(v[3]), toI(v[4]), n(5, 255)], n(1, 30)); break;
            case 'SHAKE': screen.startShake(n(2, 5), n(3, 5), n(1, 30)); break;
            // Weather: the battle screen drew none, so the line shows nothing (and must not carry to the map).
            case 'WEATHER': break;
            case 'DARKEN': screen.rrSymStartDarken(); break;
            case 'LIGHTEN': screen.rrSymStartLighten(); break;
        }
    };
    SB.rrSymActionVanish = function() {
        const S = this._rrSym, v = vals(S), targets = uniq(this.rrSymGetActionTargets());
        if (targets.length === 0) return;
        let code = ['ON', 'TRUE', 'ENABLE', 'HIDE'].includes(v[1]) ? 1 : ['OFF', 'FALSE', 'DISABLE', 'SHOW'].includes(v[1]) ? 0 : null;
        if (code === null) return;
        if (v.includes('INSTANT')) code += 2;
        for (const target of targets) {
            if (!target.isAppeared()) continue;
            const sprite = target.rrSymSprite();
            V(target).vanishing = code === 1 || code === 3;
            if (!sprite) continue;
            sprite.rrSymStartEffect(V(target).vanishing ? 'disappear' : 'appear');
            if (code >= 2) sprite.rrSymSetEffectInstant();
        }
    };
})();
