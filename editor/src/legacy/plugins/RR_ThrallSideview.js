/*:
 * @target MZ
 * @plugindesc Sideview Battle System 3.3 (VX, STR33 edition), for imported games
 * @author Enu (Sideview Battle System); translated by Kylock and Mr. Bubble; Thrall's edits; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallSideview.js
 *
 * Enu's Sideview Battle System 3.3 as Thrall set it up: the party stands on
 * the right, the enemies on the left, every battler drawn from its walking
 * sheet (actors' character graphics, enemies' battler names under
 * img/characters). A battler acts through action sequences of single
 * actions: steps and jumps toward its target, weapon swings with the
 * weapon's icon, thrown weapons and bombs, flying animations, after-images,
 * spins, zooms, cut-ins, balloons. Damage numbers bounce out of the hit
 * battler from the Number+ (damage) and Number- (recovery) images; added
 * states pop their names in a small window. Enemies' sheets that come in
 * numbered variants ($ThrallA1…15, $VampireA1…10, $Pirate1…21) each take a
 * different variant, and some carry random weapons and elements.
 *
 * The battlers stand, wait, fall and burn by their states; Thrall's own
 * colours mark Stalking, Aura, Shield, Rage, Drunk/Oil, Water and Copper.
 * Enemies fade out, explode (Explosive elites hurt the party) or crumble
 * (bosses) as the game sets them.
 *
 * The battle background is the map the battle started on at half
 * brightness with the map's battle floor (img/system/Floors) over it.
 *
 * Event commands Change HP and Change Enemy HP pop their numbers in battle
 * as the script did.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param anime
 * @text Single actions
 * @type note
 * @default ""
 *
 * @param action
 * @text Action sequences
 * @type note
 * @default ""
 *
 * @param tables
 * @text Per-battler settings
 * @type note
 * @default ""
 *
 * @param actorPosition
 * @default [[408,208],[444,232],[480,256],[508,232]]
 * @param altPosition
 * @default [[304,232],[240,256],[368,256],[304,256]]
 * @param floor
 * @default [14,170,255]
 * @param twoSwordsStyle
 * @default [50,100]
 * @param backAttackSwitch
 * @default [2]
 * @param maxMember
 * @default 4
 * @param actionWait
 * @default 0
 * @param collapseWait
 * @default 0
 * @param winWait
 * @default 40
 * @param noWeapon
 * @default 1
 * @param resurrection
 * @default 38
 * @param numInterval
 * @default -4
 * @param numDuration
 * @default 56
 * @param animePattern
 * @default 3
 * @param animeKind
 * @default 4
 * @param damageGraphics
 * @default Number+
 * @param recoverGraphics
 * @default Number-
 * @param popDamage0
 * @default
 * @param popMiss
 * @default
 * @param popEva
 * @default
 * @param popCri
 * @default
 * @param popMpDam
 * @default MP DAMAGE
 * @param popMpRec
 * @default
 * @param nonDamageWindow
 * @default false
 * @param shadow
 * @default true
 * @param walkAnime
 * @default true
 * @param backAttack
 * @default true
 */
(() => {
    'use strict';
    // A class other code may build by its global name is published as a plain MZ-style constructor: the engine
    // re-wraps every display class on window and calls the original without `new`, which a class cannot take.
    const mzGlobal = (name, Cls) => {
        const F = { [name]: function(...args) { this.initialize(...args); } }[name];
        F.prototype = Cls.prototype;
        Object.setPrototypeOf(F, Cls);
        window[name] = F;
        return F;
    };
    const PLUGIN = 'RR_ThrallSideview';
    const P = PluginManager.parameters(PLUGIN);
    const VX = (window.RRThrallVx = window.RRThrallVx || {});
    const { idiv, imod, rand, vars, sw } = VX;
    const json = (s, d) => { try { const v = JSON.parse(s); return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return d; } };
    const num = (s, d) => (s === undefined || s === '' || isNaN(Number(s)) ? d : Number(s));
    const bool = (s, d) => (s === undefined || s === '' ? d : s === 'true');

    const N01 = (VX.N01 = {
        ACTOR_POSITION: json(P.actorPosition, [[408, 208], [444, 232], [480, 256], [508, 232]]),
        ALT_POSITION: json(P.altPosition, [[304, 232], [240, 256], [368, 256], [304, 256]]),
        MAX_MEMBER: num(P.maxMember, 4), ACTION_WAIT: num(P.actionWait, 0), COLLAPSE_WAIT: num(P.collapseWait, 0), WIN_WAIT: num(P.winWait, 40),
        FLOOR: json(P.floor, [14, 170, 255]), NO_WEAPON: num(P.noWeapon, 1), TWO_SWORDS_STYLE: json(P.twoSwordsStyle, [50, 100]), RESURRECTION: num(P.resurrection, 38),
        DAMAGE_GRAPHICS: P.damageGraphics || 'Number+', RECOVER_GRAPHICS: P.recoverGraphics || 'Number-', NUM_INTERBAL: num(P.numInterval, -4), NUM_DURATION: num(P.numDuration, 56),
        NON_DAMAGE_WINDOW: bool(P.nonDamageWindow, false), POP_DAMAGE0: P.popDamage0 || '', POP_MISS: P.popMiss || '', POP_EVA: P.popEva || '', POP_CRI: P.popCri || '',
        POP_MP_DAM: P.popMpDam === undefined ? 'MP DAMAGE' : P.popMpDam, POP_MP_REC: P.popMpRec || '',
        SHADOW: bool(P.shadow, true), WALK_ANIME: bool(P.walkAnime, true), ANIME_PATTERN: num(P.animePattern, 3), ANIME_KIND: num(P.animeKind, 4),
        BACK_ATTACK: bool(P.backAttack, true), BACK_ATTACK_SWITCH: json(P.backAttackSwitch, [2]),
        ANIME: json(P.anime, {}), ACTION: json(P.action, {}), TABLES: json(P.tables, {})
    });
    VX.TWO_SWORDS_STYLE = N01.TWO_SWORDS_STYLE;
    if (!N01.ACTION.End) N01.ACTION.End = ['End'];
    /** A table the configuration's case statements make: table[method] → value for key, else the default. */
    const lookup = (kind, method, key, fallback) => {
        const t = N01.TABLES[kind] && N01.TABLES[kind][method];
        if (!t) return fallback;
        const k = String(key);
        if (Object.prototype.hasOwnProperty.call(t.table, k)) return t.table[k];
        return t.default !== undefined ? t.default : fallback;
    };
    VX.sbsLookup = lookup;
    const toI = (s) => { const m = /^\s*[-+]?\d+/.exec(String(s)); return m ? parseInt(m[0], 10) : 0; };
    const clone = (v) => (Array.isArray(v) ? v.slice() : v);

    // ---- per-record settings: State, Weapon, Skill, Item ---------------------------------
    const registerRecordSettings = () => {
        const proto = VX.VxBase.prototype;
        proto.extension = function() {
            if (this._rrExt) return this._rrExt;
            if (this._rrType === 'state') return (this._rrExt = clone(lookup('state', 'extension', this.id, ['NONE'])));
            if (this._rrType === 'skill') return (this._rrExt = clone(lookup('skill', 'extension', this.id, ['NONE'])));
            if (this._rrType === 'item') return (this._rrExt = clone(lookup('item', 'extension', this.name, ['NONE'])));
            return ['NONE'];
        };
        proto.slipExtension = function() { return this._rrType === 'state' ? lookup('state', 'slip_extension', this.id, []) : []; };
        proto.graphic = function() { return this._rrType === 'weapon' ? lookup('weapon', 'graphic', this.id, '') : ''; };
        proto.flyingGraphic = function() {
            if (this._rrType === 'weapon') return lookup('weapon', 'flying_graphic', this.id, '');
            if (this._rrType === 'skill') return lookup('skill', 'flying_graphic', this.id, '');
            return '';
        };
        proto.baseAction = function() {
            if (this._rrType === 'state') {
                // State 1 is the incapacitated sequence; others wait, burn, freeze…
                return lookup('state', 'base_action', this.id, 'WAIT');
            }
            if (this._rrType === 'skill') return lookup('skill', 'base_action', this.id, 'SKILL_USE');
            if (this._rrType === 'item') return lookup('item', 'base_action', this.name, 'ITEM_USE');
            if (this._rrType === 'weapon') {
                // RPG::Weapon#base_action: by the weapon's type elements (16 Double, 17 Cosmo, 1-5 the weapon kind).
                const e = this.element_set;
                if (e.includes(16)) {
                    if (e.includes(1)) return 'FLURRY';
                    if (e.includes(2)) return 'DOUBLE_AXE';
                    if (e.includes(3)) return 'DOUBLE_MACE';
                    if (e.includes(4)) return 'DOUBLE_SPEAR';
                    if (e.includes(5)) return 'TWIN_KNIFE';
                    return 'NORMAL_ATTACK';
                }
                if (e.includes(17)) return 'SKILL_ALL';
                if (e.includes(1)) return 'NORMAL_ATTACK';
                if (e.includes(2)) return 'CLEAVE';
                if (e.includes(3)) return 'POWER_ATTACK';
                if (e.includes(4)) return 'PIERCE';
                if (e.includes(5)) return 'KNIFE';
                return 'NORMAL_ATTACK';
            }
            return 'NORMAL_ATTACK';
        };
    };
    if (VX.VxBase) registerRecordSettings(); else (VX.databaseHooks = VX.databaseHooks || []).push(registerRecordSettings);

    // ---- battler fields and settings (Game_Battler, Game_Actor, Game_Enemy) ---------------------
    const _initMembers = Game_BattlerBase.prototype.initMembers;
    Game_BattlerBase.prototype.initMembers = function() {
        _initMembers.call(this);
        this.rrSbsReset();
    };
    Game_BattlerBase.prototype.rrSbsReset = function() {
        this._rrMoveX = 0; this._rrMoveY = 0; this._rrMoveZ = 0; this._rrJump = 0;
        this._rrDerivation = 0; this._rrPlay = 0; this._rrForceAction = 0; this._rrForceTarget = 0;
        this._rrBasePositionX = 0; this._rrBasePositionY = 0; this._rrAbsorb = 0; this._rrActTime = 0; this._rrForceDamage = 0;
        this._rrActive = false; this._rrNonDead = false; this._rrIndividual = false; this._rrSlipDamage = false; this._rrRevival = false;
        this._rrDoubleDamage = false; this._rrDying = false; this._rrReflex = null;
    };
    const sbsField = (name, field) => Object.defineProperty(Game_BattlerBase.prototype, name, {
        get() { return this[field]; }, set(v) { this[field] = v; }, configurable: true
    });
    for (const [n, f] of [['rrMoveX', '_rrMoveX'], ['rrMoveY', '_rrMoveY'], ['rrMoveZ', '_rrMoveZ'], ['rrJump', '_rrJump'], ['rrPlay', '_rrPlay'],
        ['rrForceAction', '_rrForceAction'], ['rrForceTarget', '_rrForceTarget'], ['rrActive', '_rrActive'], ['rrNonDead', '_rrNonDead'],
        ['rrIndividual', '_rrIndividual'], ['rrDying', '_rrDying'], ['rrRevival', '_rrRevival'], ['rrDoubleDamage', '_rrDoubleDamage'],
        ['rrForceDamage', '_rrForceDamage'], ['rrDerivation', '_rrDerivation']]) sbsField(n, f);

    Game_BattlerBase.prototype.rrStateId = function() { return this._states[this._states.length - 1]; };
    Game_BattlerBase.prototype.rrChangeBasePosition = function(x, y) { this._rrBasePositionX = x; this._rrBasePositionY = y; };
    Game_BattlerBase.prototype.rrResetCoordinate = function() {
        this._rrMoveX = this._rrMoveY = this._rrMoveZ = this._rrJump = this._rrDerivation = 0;
        this._rrActive = this._rrNonDead = this._rrIndividual = false;
    };
    /** damage_num: an event's HP change pops as a number in battle; the sprite applies it. */
    Game_BattlerBase.prototype.rrDamageNum = function(n) {
        if (this.isDead() || !$gameParty.inBattle() || n === 0 || n == null) return;
        this._rrForceDamage = n;
    };

    // Game_Actor (SBS settings).
    const actorSeq = (method) => function() { return lookup('actor', method, this._actorId, 'WAIT'); };
    for (const m of ['non_weapon', 'normal', 'pinch', 'defence', 'damage_hit', 'command_b', 'command_a', 'run_success', 'run_ng', 'win', 'first_action', 'recover_action']) {
        Game_Actor.prototype['rrSbs_' + m] = actorSeq(m);
    }
    Game_Actor.prototype.rrSbs_evasion = function() {
        // Thrall's four heroes parry with their shield half the time.
        const shield = { 1: 'SHIELD_L', 2: 'SHIELD_M', 3: 'SHIELD_D', 4: 'SHIELD_B' }[this._actorId];
        const armor1 = this._equips[1] && this._equips[1].itemId();
        if (shield && rand(2) === 1 && armor1 !== 0 && armor1) return shield;
        return 'EVADE_ATTACK';
    };
    Game_Actor.prototype.rrSbs_shadow = function() { return lookup('actor', 'shadow', this._actorId, 'shadow00'); };
    Game_Actor.prototype.rrSbs_shadow_plus = function() { return lookup('actor', 'shadow_plus', this._actorId, [0, 10]); };
    Game_Actor.prototype.rrSbsAnimeOn = function() { return true; };
    Game_Actor.prototype.rrSbsCharacterName = function() { return this._characterName; };
    Game_Actor.prototype.rrGraphicChange = function(name) { this._characterName = name; };
    Game_Actor.prototype.rrSbsBasePosition = function() {
        const i = this.rrVxIndex();
        const table = sw(62) ? N01.ALT_POSITION : N01.ACTOR_POSITION;
        const base = table[i] || [0, 0];
        this._rrBasePositionX = base[0];
        this._rrBasePositionY = base[1];
    };
    Game_Actor.prototype.rrPositionX = function() { return this.rrVxIndex() == null ? 0 : this._rrBasePositionX + this._rrMoveX; };
    Game_Actor.prototype.rrPositionY = function() { return this.rrVxIndex() == null ? 0 : this._rrBasePositionY + this._rrMoveY + this._rrJump; };
    Game_Actor.prototype.rrPositionZ = function() { const i = this.rrVxIndex(); return i == null ? 0 : i + this._rrBasePositionY + this._rrMoveY + this._rrMoveZ - this._rrJump + 200; };
    Game_Actor.prototype.rrSkillIdLearn = function(id) { return this._skills.includes(id); };
    /** SBS's actor collapse: overkill spent, chant gauge cleared, the collapse sound. */
    Game_Actor.prototype.rrVxPerformCollapse = function() {
        if ($gameParty.inBattle() && this.isDead()) {
            if (this.rrVxSetOverkill) this.rrVxSetOverkill(0);
            if (this.rrAwGaugeClear) this.rrAwGaugeClear();
            SoundManager.playActorCollapse();
        }
    };

    // Game_Enemy (SBS settings, Thrall's lists).
    const enemySeq = (method, d) => function() { return lookup('enemy', method, this._enemyId, d); };
    for (const m of ['normal', 'pinch', 'defence', 'damage_hit', 'evasion', 'run_success', 'first_action', 'recover_action']) Game_Enemy.prototype['rrSbs_' + m] = enemySeq(m, 'WAIT');
    Game_Enemy.prototype.rrSbs_base_action = enemySeq('base_action', 'ENEMY_UNARMED_ATK');
    Game_Enemy.prototype.rrSbs_shadow = enemySeq('shadow', '');
    Game_Enemy.prototype.rrSbs_shadow_plus = enemySeq('shadow_plus', [0, 0]);
    Game_Enemy.prototype.rrSbsPositionPlus = enemySeq('position_plus', [0, 32]);
    Game_Enemy.prototype.rrSbsActionTime = enemySeq('action_time', [1, 100, 100]);
    Game_Enemy.prototype.rrSbsAnimeOn = enemySeq('anime_on', true);
    Game_Enemy.prototype.rrSbsActionMirror = enemySeq('action_mirror', true);
    const UNCOMMON = [31, 32, 33, 34, 35, 41, 46, 48, 79, 80, 81, 82, 83, 98, 127, 132, 134, 135, 136, 137];
    const RARE = [61, 62, 69, 84, 97, 99, 120, 146, 147, 158];
    const EPIC = [85, 119];
    VX.SBS_WEAPON_LISTS = { UNCOMMON, RARE, EPIC };
    /** Game_Enemy#weapon: by enemy kind a bludgeon (512), pierce (511), bite (513), claw (510) or a random weapon. */
    Game_Enemy.prototype.rrSbsWeapon = function() {
        if (this._rrWeapon == null) this._rrWeapon = 0;
        const id = this._enemyId;
        if ([1, 89, 101, 107, 121].includes(id)) { if (this._rrWeapon === 0) this._rrWeapon = 512; }
        else if ([6, 16, 90, 92, 108, 113, 122, 124, 133].includes(id)) { if (this._rrWeapon === 0) this._rrWeapon = 511; }
        else if ([11, 51, 56, 91, 94, 123, 130].includes(id)) { if (this._rrWeapon === 0) this._rrWeapon = 513; }
        else if ([21, 26, 93, 96, 125, 126].includes(id)) { if (this._rrWeapon === 0) this._rrWeapon = 510; }
        else if (UNCOMMON.includes(id)) { if (this._rrWeapon === 0) { this._rrWeapon = rand(158) + 339; this._rrElement = rand(40) + 1; } }
        else if (RARE.includes(id)) { if (this._rrWeapon === 0) { this._rrWeapon = rand(95) + 244; this._rrElement = rand(16) + 1; } }
        else if (EPIC.includes(id)) { if (this._rrWeapon === 0) this._rrWeapon = rand(21) + 170; }
        return this._rrWeapon;
    };
    Game_Enemy.prototype.rrVxWeaponNo = function() { return this.rrSbsWeapon(); };
    /** collapse_type: 1 stays, 2 fades, 3 boss crumble. Bosses stay unless the boss switch or an Explosive elite. */
    Game_Enemy.prototype.rrSbsCollapseType = function() {
        const id = this._enemyId;
        if ([116, 117, 118].includes(id)) return 3;
        if (sw(38) || vars(91) === 5 || vars(92) === 5) return [48, 56, 57, 58, 59, 60, 62, 86, 87, 88, 97, 119, 120].includes(id) ? 1 : 2;
        return 1;
    };
    Game_Enemy.prototype.rrSbsBattlerName = function() { return this.battlerName(); };
    Game_Enemy.prototype.rrSbsCharacterName = function() { return this.rrVxCharacterName(); };
    Game_Enemy.prototype.rrSbsBasePosition = function() {
        if (this.rrVxIndex() == null) return;
        const name = this.battlerName();
        const anime = this.rrSbsAnimeOn();
        const bitmap = anime ? (N01.WALK_ANIME ? VX.loadCharacter(name) : VX.loadCharacter(name + '_1')) : VX.loadBattler(name, this.battlerHue());
        const height = bitmap.height;
        const plus = this.rrSbsPositionPlus();
        this._rrBasePositionX = this.screenX() + 32 + plus[0];
        this._rrBasePositionY = this.screenY() + plus[1] - idiv(height, 3);
    };
    Game_Enemy.prototype.rrPositionX = function() { return this._rrBasePositionX - this._rrMoveX; };
    Game_Enemy.prototype.rrPositionY = function() { return this._rrBasePositionY + this._rrMoveY + this._rrJump; };
    Game_Enemy.prototype.rrPositionZ = function() { return this.rrPositionY() + this._rrMoveZ - this._rrJump + 200; };
    Game_Enemy.prototype.rrSkillIdLearn = function() { return false; };
    Game_Enemy.prototype.rrMakeActionSpeed2 = function(adj) {
        if (this._rrAdjSpeed == null) this._rrAdjSpeed = this.rrVxAction().speed;
        this._rrAdjSpeed = this._rrAdjSpeed * adj / 100;
    };
    /** SBS's enemy collapse: the challenges count the kill, the sprite collapses. */
    Game_Enemy.prototype.rrVxPerformCollapse = function() {
        if ($gameParty.inBattle() && this.isDead()) {
            if ([63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 78, 84, 106, 114].includes(this._enemyId)) $gameVariables.setValue(175, vars(175) + 1);
            $gameVariables.setValue(181, vars(181) + 1);
            this._rrForceAction = ['N01collapse'];
        }
    };
    Game_BattlerBase.prototype.rrVxPerformCollapse = function() {};
    // An event's Collapse / perform_collapse calls (the translator writes performCollapse) collapse the VX way in battle.
    const _performCollapse = Game_Battler.prototype.performCollapse;
    Game_Battler.prototype.performCollapse = function() {
        if (VX.battleActive && VX.battleActive()) { this.rrVxPerformCollapse(); return; }
        if (_performCollapse) _performCollapse.call(this);
    };
    for (const cls of [Game_Actor, Game_Enemy]) {
        if (Object.prototype.hasOwnProperty.call(cls.prototype, 'performCollapse')) {
            const own = cls.prototype.performCollapse;
            cls.prototype.performCollapse = function() {
                if (VX.battleActive && VX.battleActive()) { this.rrVxPerformCollapse(); return; }
                own.call(this);
            };
        }
    }

    // Party changes of Brutus (actor 4) rebuild the actor sprites.
    const _addActor = Game_Party.prototype.addActor;
    Game_Party.prototype.addActor = function(actorId) { _addActor.call(this, actorId); if (actorId === 4) VX.partyChange = true; };
    const _removeActor = Game_Party.prototype.removeActor;
    Game_Party.prototype.removeActor = function(actorId) { _removeActor.call(this, actorId); if (actorId === 4) VX.partyChange = true; };

    // Change HP / Change Enemy HP in battle pop their numbers (SBS's command_311 and command_331).
    const _command311 = Game_Interpreter.prototype.command311;
    Game_Interpreter.prototype.command311 = function(params) {
        if (!(VX.battleActive && VX.battleActive())) return _command311.call(this, params);
        const value = this.operateValue(params[2], params[3], params[4]);
        this.iterateActorEx(params[0], params[1], actor => {
            if (actor.isDead()) return;
            if (params[5] === false && actor.hp + value <= 0) actor.rrDamageNum(actor.hp - 1);
            else actor.rrDamageNum(-value);
        });
        return true;
    };
    const _command331 = Game_Interpreter.prototype.command331;
    Game_Interpreter.prototype.command331 = function(params) {
        if (!(VX.battleActive && VX.battleActive())) return _command331.call(this, params);
        const value = this.operateValue(params[1], params[2], params[3]);
        this.iterateEnemyIndex(params[0], enemy => {
            if (enemy._hp > 0) {
                if (params[4] === false && enemy.hp + value <= 0) enemy.rrDamageNum(enemy.hp - 1);
                else enemy.rrDamageNum(-value);
            }
        });
        return true;
    };

    // ---- bitmaps ----------------------------------------------------------------------
    // The game ships some system pictures with an upper-case extension (Cursor.PNG).
    const loadWithCase = (folder, name, nearest) => {
        if (!name) return ImageManager._emptyBitmap || new Bitmap(1, 1);
        const url = folder + Utils.encodeURI(name) + '.png';
        const bitmap = ImageManager.loadBitmapFromUrl(url, [folder + Utils.encodeURI(name) + '.PNG']);
        if (nearest) bitmap.addLoadListener(b => { try { const bt = b._baseTexture; if (bt) bt.scaleMode = 'nearest'; const s = bt && (bt.source || bt._textureSource); if (s) s.scaleMode = 'nearest'; } catch (_) {} });
        return bitmap;
    };
    VX.loadSystem = (name) => loadWithCase('img/system/', name, true);
    VX.loadCharacter = (name) => (name ? loadWithCase('img/characters/', name, true) : new Bitmap(32, 32));
    VX.loadBattler = (name, hue) => {
        const b = ImageManager.loadEnemy(name);
        return b;
    };
    VX.loadPicture = (name) => loadWithCase('img/pictures/', name, false);
    VX.rubyFont = (size) => size * $gameSystem.mainFontSize() / ($gameSystem.rrVxDefaultFontSize ? $gameSystem.rrVxDefaultFontSize() : 20);
    /** Bitmap.new: RGSS bitmaps draw in the game's default font (Font.default_name and size). */
    VX.newBitmap = (w, h) => {
        const b = new Bitmap(w, h);
        b.fontFace = $gameSystem.mainFontFace();
        b.fontSize = $gameSystem.mainFontSize();
        return b;
    };
    const color = (r, g, b, a = 255) => `rgba(${r},${g},${b},${a / 255})`;
    VX.rgba = color;

    // ---- an RGSS sprite --------------------------------------------------------------------
    // x/y/z, an origin (ox, oy) in pixels of what is shown, zoom, angle (degrees, counter-clockwise),
    // mirror (flips the picture, the origin stays), src_rect, colour, tone, flash and blend type.
    let SEQ = 0;
    const BLEND = () => [PIXI.BLEND_MODES.NORMAL, PIXI.BLEND_MODES.ADD, PIXI.BLEND_MODES.SUBTRACT || PIXI.BLEND_MODES.MULTIPLY];
    class Sprite_RrVx extends Sprite {
        initialize(bitmap) {
            super.initialize(bitmap);
            this.z = 0;
            this._rrSeq = ++SEQ;
            this.ox = 0; this.oy = 0; this.zoomX = 1; this.zoomY = 1; this.angle = 0; this.mirror = false;
            this.blendType = 0;
            this.rrColor = [0, 0, 0, 0];
            this.rrTone = [0, 0, 0, 0];
            this._rrFlashColor = null; this._rrFlashDuration = 0; this._rrFlashTotal = 0; this._rrFlashHide = false;
            this.disposed = false;
        }
        srcRect(x, y, w, h) { this.setFrame(x, y, w, h); }
        get srcX() { return this._frame.x; }
        get srcY() { return this._frame.y; }
        get srcW() { return this._frame.width; }
        get srcH() { return this._frame.height; }
        setSrcX(x) { this.setFrame(x, this._frame.y, this._frame.width, this._frame.height); }
        setSrcY(y) { this.setFrame(this._frame.x, y, this._frame.width, this._frame.height); }
        setSrcW(w) { this.setFrame(this._frame.x, this._frame.y, Math.max(0, w), this._frame.height); }
        flash(c, duration) {
            this._rrFlashColor = c ? c.slice() : null;
            this._rrFlashHide = !c;
            this._rrFlashDuration = this._rrFlashTotal = duration;
        }
        update() {
            super.update();
            if (this._rrFlashDuration > 0) this._rrFlashDuration--;
            this.rrApply();
        }
        rrApply() {
            const w = this._frame.width, h = this._frame.height;
            this.anchor.x = w ? (this.mirror ? w - this.ox : this.ox) / w : 0;
            this.anchor.y = h ? this.oy / h : 0;
            this.scale.x = (this.mirror ? -1 : 1) * this.zoomX;
            this.scale.y = this.zoomY;
            this.rotation = -this.angle * Math.PI / 180;
            const mode = BLEND()[this.blendType] || PIXI.BLEND_MODES.NORMAL;
            if (this.blendMode !== mode) this.blendMode = mode;
            let c = this.rrColor;
            if (this._rrFlashDuration > 0 && this._rrFlashColor) {
                const f = this._rrFlashColor, k = this._rrFlashDuration / this._rrFlashTotal;
                const a = f[3] * k;
                c = a > c[3] ? [f[0], f[1], f[2], a] : c;
            }
            this.setBlendColor([c[0], c[1], c[2], Math.max(0, Math.min(255, c[3]))]);
            this.setColorTone(this.rrTone);
            this.renderable = !(this._rrFlashHide && this._rrFlashDuration > 0);
        }
        rrDispose() {
            if (this.disposed) return;
            this.disposed = true;
            if (this.parent) this.parent.removeChild(this);
        }
    }
    mzGlobal('Sprite_RrVx', Sprite_RrVx);
    VX.Sprite_RrVx = Sprite_RrVx;

    /** A layer whose children draw in z order (then creation order), as an RGSS viewport. */
    class Sprite_RrZLayer extends Sprite {
        initialize() { super.initialize(); this.z = 0; this._rrSeq = ++SEQ; }
        update() {
            super.update();
            this.children.sort((a, b) => ((a.z || 0) - (b.z || 0)) || ((a._rrSeq || 0) - (b._rrSeq || 0)));
        }
    }
    mzGlobal('Sprite_RrZLayer', Sprite_RrZLayer);
    VX.Sprite_RrZLayer = Sprite_RrZLayer;

    // ---- Sprite_Battler (SBS 3.3, with VX's effects and Sprite_Base's animations) -------------------------
    const WHITEN = 1, BLINK = 2, APPEAR = 3, DISAPPEAR = 4, COLLAPSE = 5;
    const BLEND_STATES = [7, 13, 20, 25], COLOR_STATES = [26, 34, 43, 44, 49, 50, 51];
    const DEAD_FLAT = [1, 2, 3, 4, 5, 63, 89, 121];
    const DEAD_FLY = [16, 17, 18, 19, 20, 51, 52, 53, 54, 55, 66, 72, 92, 94, 108, 109, 110, 111, 112, 113, 114, 124, 130, 133];
    const VARIANTS = { $ThrallA: 15, $ThrallB: 15, $ThrallC: 15, $ThrallD: 15, $VampireC: 15, $VampireD: 15, $VampireA: 10, $Pirate: 21 };

    class Sprite_RrSbsBattler extends Sprite_RrVx {
        initialize(battler, layer) {
            super.initialize();
            this.battler = battler || null;
            this._layer = layer;
            this._battlerVisible = false;
            this._enemyId = 0;
            this._effectType = 0; this._effectDuration = 0;
            this._moveX = this._moveY = this._moveZ = 0;
            this._distanseX = this._distanseY = 0;
            this._movingX = this._movingY = 0;
            this._moveSpeedX = this._moveSpeedY = 0;
            this._moveSpeedPlusX = this._moveSpeedPlusY = 0;
            this._moveBoostX = this._moveBoostY = 0;
            this._jumpTime = this._jumpTimePlus = this._jumpUp = this._jumpDown = this._jumpSize = 0;
            this._floatTime = this._floatUp = 0;
            this._jumpPlus = 0;
            this._angle = 0; this._angling = 0; this._angleTime = 0; this._angleReset = false;
            this._zoomX = 0; this._zoomY = 0; this._zoomingX = 0; this._zoomingY = 0; this._zoomTime = 0; this._zoomReset = false;
            this._targetBattler = [];
            this._nowTargets = [];
            this._pattern = 0; this._patternBack = false;
            this._wait = 0; this._unloopWait = 0;
            this._action = [];
            this._animeKind = 0; this._animeSpeed = 0; this._frameCount = 0; this._animeLoop = 0;
            this._animeEnd = false; this._animeFreeze = false; this._animeMoving = false;
            this._baseWidth = N01.ANIME_PATTERN; this._baseHeight = N01.ANIME_KIND;
            this._width = 0; this._height = 0;
            this._pictureTime = 0;
            this._individualTargets = [];
            this._balloonDuration = 65;
            this._battlerStatus = [0, 0];
            this._reverse = false;
            this._repeatAction = 'WAIT';
            this._nonRepeat = false;
            this._animationDuration = 0;
            this._animation = null;
            this._animationSprites = null;
            if (!this.battler) { this._battlerVisible = false; return; }
            this._animeFlug = this.battler.isActor() || this.battler.rrSbsAnimeOn();
        }
        // ---- creation -------------------------------------------------------------------
        layerAdd(sprite) { if (this._layer) this._layer.addChild(sprite); return sprite; }
        changeName(name, number) {
            this._battlerName = name + String(rand(number) + 1);
            for (const m of $gameTroop.members().filter(x => x.isAlive())) {
                if (m === this.battler) continue;
                if (this._battlerName === m.rrVxCharacterName()) { this._battlerName = name; break; }
            }
        }
        makeBattler() {
            const b = this.battler;
            b.rrSbsBasePosition();
            this._battlerHue = b.battlerHue ? b.battlerHue() : 0;
            if (!b.isActor()) this._enemyId = b.enemyId();
            if (this._animeFlug) {
                this._weaponR = this.layerAdd(new Sprite_RrSbsWeapon(b));
                this._battlerName = b.isActor() ? b.characterName() : b.battlerName();
                if (!b.isActor() && b.rrSbsActionMirror()) this.mirror = true;
                let guard = 0;
                while (VARIANTS[this._battlerName] !== undefined && guard++ < 1000) this.changeName(this._battlerName, VARIANTS[this._battlerName]);
                if (!b.isActor() && b.rrVxCharacterName() !== this._battlerName) b.rrVxSetCharacterName(this._battlerName);
                if (!b.isActor()) {
                    const id = this._enemyId;
                    if (UNCOMMON.includes(id)) { b._rrWeapon = rand(158) + 339; b._rrElement = rand(40) + 1; }
                    else if (RARE.includes(id)) { b._rrWeapon = rand(95) + 244; b._rrElement = rand(16) + 1; }
                    else if (EPIC.includes(id)) b._rrWeapon = rand(21) + 170;
                }
                this.bitmap = N01.WALK_ANIME ? VX.loadCharacter(this._battlerName) : VX.loadCharacter(this._battlerName + '_1');
                this._width = idiv(this.bitmap.width, this._baseWidth);
                this._height = idiv(this.bitmap.height, this._baseHeight);
                this._sx = this._pattern * this._width;
                this._sy = this._animeKind * this._height;
                this.srcRect(this._sx, this._sy, this._width, this._height);
            } else {
                this._battlerName = b.battlerName();
                this.bitmap = VX.loadBattler(this._battlerName, this._battlerHue);
                this._width = this.bitmap.width;
                this._height = this.bitmap.height;
                this.setHue(this._battlerHue || 0);
            }
            this.mirror = !b.isActor() && b.rrSbsActionMirror();
            if (this.mirror && this._weaponR) this._weaponR.mirroring();
            b.rrResetCoordinate();
            this.ox = idiv(this._width, 2);
            this.oy = idiv(this._height * 2, 3);
            this.updateMove();
            this._moveAnime = this.layerAdd(new Sprite_RrSbsMoveAnime(b));
            this._picture = new Sprite_RrVx();
            this._picture.visible = false;
            if (Sprite_RrSbsBattler.globalLayer) Sprite_RrSbsBattler.globalLayer.addChild(this._picture);
            this._damage = new Sprite_RrSbsDamage(b, this._layer);
            this._made = true;
        }
        makeShadow() {
            if (this._shadow) this._shadow.rrDispose();
            this._battlerHue = this.battler.battlerHue ? this.battler.battlerHue() : 0;
            this._shadow = this.layerAdd(new Sprite_RrVx());
            this._shadow.z = this.z - 4;
            this._shadow.visible = false;
            this._shadow.bitmap = VX.loadCharacter(this.battler.rrSbs_shadow());
            this._shadowHeight = this._shadow.bitmap.height;
            const plus = this.battler.rrSbs_shadow_plus();
            this._shadowPlusX = plus[0] - idiv(this._width, 2);
            this._shadowPlusY = plus[1];
            const sbw = this._shadow.bitmap.width || 32;
            this._shadow.zoomX = this._width * 1.0 / sbw;
            this.updateShadow();
        }
        rrDispose() {
            for (const s of [this._weaponR, this._moveAnime, this._picture, this._shadow, this._balloon, this._statusCount]) if (s) s.rrDispose();
            if (this._damage) this._damage.dispose();
            this.mirageOff();
            this.disposeAnimation();
            if (this._beforeGraphic != null && this.battler && this.battler.rrGraphicChange) this.battler.rrGraphicChange(this._beforeGraphic);
            if (typeof this.rrDisposeExtras === 'function') this.rrDisposeExtras();
            super.rrDispose();
        }
        // ---- damage, actions ----------------------------------------------------------------
        damageAction(action) {
            const b = this.battler;
            const r = b.rrVxResult();
            let damage = r.hpDamage;
            if (r.mpDamage !== 0) damage = r.mpDamage;
            if (r.hpDamage !== 0 && r.mpDamage !== 0) { b.rrDoubleDamage = true; damage = r.hpDamage; }
            let absorb = false;
            if (action[0] === 'absorb') { absorb = true; action[0] = null; }
            if (!(r.evaded || r.missed || action[0] == null)) b.rrSetAnimationId(action[0], action[1]);
            if (damage > 0 && action[2]) this.startAction(b.rrSbs_damage_hit());
            if (r.evaded || r.missed) {
                if (action[2]) this.startAction(b.rrSbs_evasion());
                SoundManager.playEvasion();
            }
            if (!(absorb || action[3] != null)) this._damage.damagePop();
        }
        damagePop(damage) { this._damage.damagePop(damage); }
        firstAction() {
            const b = this.battler;
            let action;
            if (b.restriction() < 4) action = b.rrSbs_first_action();
            if (b._states[0] != null && b.restriction() >= 4) action = VX.state(b.rrStateId()).baseAction();
            this.startAction(action);
            if (N01.SHADOW) this.makeShadow();
        }
        startAction(kind) {
            this.reset();
            this.standBy();
            const seq = N01.ACTION[kind];
            this._action = seq ? seq.slice() : [];
            const active = this._action.shift();
            this._action.push('End');
            this._activeAction = N01.ANIME[active] || null;
            if (!this._activeAction) this._wait = toI(active);
            this.doAction();
        }
        startOneAction(kind, back) {
            this.reset();
            this.standBy();
            this._action = [back, 'End'];
            this._activeAction = N01.ANIME[kind] || null;
            this.doAction();
        }
        nextAction() {
            if (this._wait > 0) { this._wait -= 1; return; }
            if (this._animeEnd === false) return;
            if (this._unloopWait > 0) { this._unloopWait -= 1; return; }
            const active = this._action.shift();
            this._activeAction = N01.ANIME[active] || null;
            if (!this._activeAction) this._wait = toI(active);
            this.doAction();
        }
        /** The stand-by sequence: pinch, a state's wait, or the combined elemental waits; dead enemies lie flat or fly. */
        standByAction() {
            const b = this.battler;
            const data = [];
            let dead = false;
            let action = null;
            for (const state of b.rrVxStates().slice().reverse()) {
                if (state.extension().includes('NOSTATEANIME')) continue;
                if (b.isEnemy() && state.extension().includes('EXCEPTENEMY')) continue;
                if (b.isEnemy() && state.baseAction() === 'DEAD' && b.rrSbsCollapseType() !== 1) {
                    if (this.zoomX > 1) this.zoomX = 1;
                    if (this.zoomY > 1) this.zoomY = 1;
                    continue;
                }
                action = state.baseAction();
                if (action === 'DEAD') {
                    dead = true;
                    if (DEAD_FLAT.includes(this._enemyId)) action = 'DEAD_FLAT';
                    else if (DEAD_FLY.includes(this._enemyId)) action = 'DEAD_FLY';
                }
                data.push(action);
            }
            return { data, dead, action };
        }
        combined(data) {
            const has = (n) => data.includes('WAIT-' + n);
            const [B, F, S, W] = [has('BURN'), has('FREEZE'), has('SHOCK'), has('WEAK')];
            if (B && F && S && W) return 'WAIT-BFSW';
            if (B && F && S) return 'WAIT-BFS';
            if (B && F && W) return 'WAIT-BFW';
            if (B && S && W) return 'WAIT-BSW';
            if (F && S && W) return 'WAIT-FSW';
            if (B && F) return 'WAIT-BF';
            if (B && S) return 'WAIT-BS';
            if (B && W) return 'WAIT-BW';
            if (F && S) return 'WAIT-FS';
            if (F && W) return 'WAIT-FW';
            if (S && W) return 'WAIT-SW';
            if (B) return 'WAIT-BURN';
            if (F) return 'WAIT-FREEZE';
            if (S) return 'WAIT-SHOCK';
            if (W) return 'WAIT-WEAK';
            return 'WAIT';
        }
        standBy() {
            const b = this.battler;
            if (b._hp <= idiv(b.mhp, 4)) this._repeatAction = b.rrSbs_pinch();
            else if (b.rrStateId() == null) { this._repeatAction = b.rrSbs_normal(); return; }
            const { data, dead, action } = this.standByAction();
            if (action) this._repeatAction = action;
            if (dead) {
                if (DEAD_FLAT.includes(this._enemyId)) this._repeatAction = 'DEAD_FLAT';
                else if (DEAD_FLY.includes(this._enemyId)) this._repeatAction = 'DEAD_FLY';
            } else this._repeatAction = this.combined(data);
        }
        pushStandBy() {
            const b = this.battler;
            let action = b._hp <= idiv(b.mhp, 4) ? b.rrSbs_pinch() : b.rrSbs_normal();
            const sb = this.standByAction();
            if (sb.action) action = sb.action;
            if (sb.dead) {
                if (DEAD_FLAT.includes(this._enemyId)) action = 'DEAD_FLAT';
                else if (DEAD_FLY.includes(this._enemyId)) action = 'DEAD_FLY';
            } else action = this.combined(sb.data);
            this._repeatAction = action;
            const at = this._action.indexOf('End');
            this._action = this._action.filter(a => a !== 'End');
            if (at < 0) { /* nothing to drop */ }
            for (const a of N01.ACTION[action] || []) this._action.push(a);
            this._action.push('End');
            this._animeEnd = true;
        }
        reset() {
            const b = this.battler;
            if (b.isActor() && !b.isStateAffected(16)) this.zoomX = this.zoomY = 1;
            this.oy = idiv(this._height * 2, 3);
            this._angle = this.angle = 0;
            this._animeEnd = true;
            this._nonRepeat = false;
            this._animeFreeze = false;
            this._unloopWait = 0;
        }
        jumpReset() {
            this.battler.rrJump = this._jumpTime = this._jumpTimePlus = this._jumpUp = this._jumpDown = 0;
            this._jumpSize = this._jumpPlus = this._floatTime = this._floatUp = 0;
        }
        getTarget(target) {
            if (this.battler.rrIndividual) return;
            this._targetBattler = target;
        }
        sendAction(action) {
            this.battler.rrPlay = 0;
            if (this.battler.rrActive) this.battler.rrPlay = action;
        }
        battlerJoin() {
            const b = this.battler;
            if (b.isAlive() && !this._battlerVisible) {
                if (b.rrRevival && this._animeFlug) { b.rrRevival = false; return; }
                if (b.rrRevival && !this._animeFlug) { b.rrRevival = false; this.visible = true; return; }
                this._animeFlug = b.isActor() || b.rrSbsAnimeOn();
                this.makeBattler();
                this.firstAction();
            }
        }
        // ---- frame update -------------------------------------------------------------------
        update() {
            this.updateAnimation();
            Sprite.prototype.update.call(this);
            if (this._rrFlashDuration > 0) this._rrFlashDuration--;
            const b = this.battler;
            if (!b) { this.bitmap = null; this.rrApply(); return; }
            if (b.isDead()) { this.blendType = 0; this.rrTone = [-16, -16, -16, 192]; }
            else if (b.isStateAffected(7) || b.isStateAffected(13)) { this.blendType = 2; this.rrTone = [0, 0, 0, 0]; }
            else if (b.isStateAffected(20) || b.isStateAffected(25)) { this.blendType = 1; this.rrTone = [64, 64, 64, 0]; }
            else { this.blendType = 0; this.rrTone = [0, 0, 0, 0]; }
            if (b.isStateAffected(44)) this.rrColor = [0, 255, 255, 96];
            else if (b.isStateAffected(26) || b.isStateAffected(43)) this.rrColor = [255, 0, 0, 96];
            else if (b.isStateAffected(34) || b.isStateAffected(49)) this.rrColor = [255, 255, 0, 96];
            else if (b.isStateAffected(50)) this.rrColor = [128, 128, 255, 96];
            else if (b.isStateAffected(51)) this.rrColor = [255, 128, 0, 96];
            else this.rrColor = [0, 0, 0, 0];
            this.battlerJoin();
            if (this._made) {
                this.nextAction();
                this.updateAnimePattern();
                this.updateTarget();
                this.updateForceAction();
                this.updateMove();
                if (this._shadow) this.updateShadow();
                if (this._weaponAction && this._weaponR) this._weaponR.update();
                if (this._floatTime > 0) this.updateFloat();
                if (this._angleTime > 0) this.updateAngle();
                if (this._zoomTime > 0) this.updateZoom();
                if (this._mirageFlug) this.updateMirage();
                if (this._pictureTime > 0) this.updatePicture();
                if (this._animeMoving) this.updateMoveAnime();
                if (this._balloonDuration <= 64) this.updateBalloon();
                if (this._damage) this._damage.update();
            }
            this.setupNewEffect();
            this.updateEffect();
            if (this._made) this.updateBattlerBitmap();
            this.rrApply();
        }
        updateAnimePattern() {
            if (this._frameCount !== 0) { this._frameCount -= 1; return; }
            if (this._weaponAction && this._weaponR) this._weaponR.action();
            if (this._patternBack) {
                if (this._animeLoop === 0) {
                    if (this._reverse) {
                        this._pattern += 1;
                        if (this._pattern === this._baseWidth - 1) { this._patternBack = false; this._animeEnd = true; }
                    } else {
                        this._pattern -= 1;
                        if (this._pattern === 0) { this._patternBack = false; this._animeEnd = true; }
                    }
                } else {
                    this._animeEnd = true;
                    if (this._animeLoop === 1) {
                        this._pattern = this._reverse ? this._baseWidth - 1 : 0;
                        this._patternBack = false;
                    }
                }
            } else if (this._reverse) {
                this._pattern -= 1;
                if (this._pattern === 0) this._patternBack = true;
            } else {
                this._pattern += 1;
                if (this._pattern === this._baseWidth - 1) this._patternBack = true;
            }
            this._frameCount = this._animeSpeed;
            if (this._animeFreeze) return;
            if (!this._animeFlug) return;
            this._sx = this._pattern * this._width;
            this._sy = this._animeKind * this._height;
            this.srcRect(this._sx, this._sy, this._width, this._height);
        }
        updateTarget() {
            const b = this.battler;
            if (b.rrForceTarget === 0) return;
            if (b.rrIndividual) return;
            this._targetBattler = b.rrForceTarget[1];
            b.rrForceTarget = 0;
        }
        updateForceAction() {
            const b = this.battler;
            const action = b.rrForceAction;
            if (action === 0) return;
            b.rrForceAction = 0;
            if (b.rrActive) return;
            if (action[0] === 'N01collapse') { this.collapseAction(); return; }
            if (action[0] === 'SINGLE') { this.startOneAction(action[2], action[1]); return; }
            this.startAction(action[2]);
            if (action[1] === '') return;
            this._action = this._action.filter(a => a !== 'End');
            this._action.push(action[1]);
            this._action.push('End');
        }
        updateMove() {
            const b = this.battler;
            if (this._moveSpeedPlusX > 0) { this._moveX += this._movingX; b.rrMoveX = this._moveX; this._moveSpeedPlusX -= 1; }
            else if (this._moveSpeedX > 0) {
                if (this._moveBoostX !== 0) this._movingX += this._moveBoostX;
                this._moveX += this._movingX; b.rrMoveX = this._moveX; this._moveSpeedX -= 1;
            }
            if (this._moveSpeedPlusY > 0) { this._moveY += this._movingY; b.rrMoveY = this._moveY; this._moveSpeedPlusY -= 1; }
            else if (this._moveSpeedY > 0) {
                if (this._moveBoostY !== 0) this._movingY += this._moveBoostY;
                this._moveY += this._movingY; b.rrMoveY = this._moveY; this._moveSpeedY -= 1;
            }
            if (this._jumpUp !== 0) {
                this._jumpPlus += this._jumpUp;
                b.rrJump = this._jumpPlus;
                this._jumpUp = this._jumpFloat ? this._jumpUp / 2 : idiv(this._jumpUp, 2);
                this._jumpTime -= 1;
                if (this._jumpTime === 0 || this._jumpUp === this._jumpSign) {
                    this._jumpDown = this._jumpUp * 2 * this._jumpSign * this._jumpSign2;
                    this._jumpTimePlus += this._jumpTime * 2;
                    this._jumpUp = 0;
                    return;
                }
            }
            if (this._jumpDown !== 0) {
                if (this._jumpTimePlus !== 0) this._jumpTimePlus -= 1;
                else if (this._jumpDown !== this._jumpSize) {
                    this._jumpPlus += this._jumpDown;
                    b.rrJump = this._jumpPlus;
                    this._jumpDown = this._jumpDown * 2;
                    if (this._jumpDown === this._jumpSize) {
                        if (this._jumpFlug) this._jumpFlug = false;
                        else {
                            this._jumpPlus += this._jumpDown;
                            b.rrJump = this._jumpPlus;
                            this._jumpDown = this._jumpSize = 0;
                        }
                    }
                }
            }
            this.x = b.rrPositionX();
            this.y = b.rrPositionY();
            this.z = b.rrPositionZ();
            if (["Vanheart's Ship", 'Dark God'].includes(b.name())) this.z = b.rrPositionZ() - 450;
        }
        updateShadow() {
            const b = this.battler;
            this._shadow.opacity = this.opacity;
            this._shadow.x = b.rrPositionX() + this._shadowPlusX;
            this._shadow.y = b.rrPositionY() + this._shadowPlusY - this._jumpPlus;
            this._shadow.z = b.rrPositionZ() - 4;
            this._shadow.rrApply();
        }
        updateFloat() {
            this._floatTime -= 1;
            this._jumpPlus += this._floatUp;
            this.battler.rrJump = this._jumpPlus;
        }
        updateAngle() {
            this._angle += this._angling;
            this.angle = this._angle;
            this._angleTime -= 1;
            if (this._angleTime === 0) { this._angle = 0; return; }
            if (this._angleReset) this.angle = 0;
        }
        updateZoom() {
            this._zoomX += this._zoomingX;
            this._zoomY += this._zoomingY;
            this.zoomX = this._zoomX;
            this.zoomY = this._zoomY;
            this._zoomTime -= 1;
            if (this._zoomTime !== 0) return;
            this._zoomX = this._zoomY = 0;
            this.oy = idiv(this._height * 2, 3);
            if (this._zoomReset) this.zoomX = this.zoomY = 1;
        }
        updateMirage() {
            if (this._mirageCount === 1) this.mirage(this._mirage0);
            if (this._mirageCount === 3) this.mirage(this._mirage1);
            if (this._mirageCount === 5) this.mirage(this._mirage2);
            this._mirageCount += 1;
            if (this._mirageCount === 6) this._mirageCount = 0;
        }
        updatePicture() {
            this._pictureTime -= 1;
            this._picture.x += this._movingPicX;
            this._picture.y += this._movingPicY;
        }
        updateMoveAnime() {
            this._moveAnime.update();
            if (this._moveAnime.finish()) { this._animeMoving = false; this._moveAnime.actionReset(); }
        }
        updateCollapse() {
            if (this._collapseType === 2) this.normalCollapse();
            if (this._collapseType === 3) this.bossCollapse1();
        }
        updateBalloon() {
            if (this._balloonDuration > 0 && !this._balloonBack) this._balloonDuration -= 1;
            if (this._balloonBack) this._balloonDuration += 1;
            if (this._balloonDuration === 64) { this._balloonBack = false; this._balloon.visible = false; }
            else if (this._balloonDuration === 0) {
                if (this._balloonLoop === 0) this._balloon.visible = false;
                if (this._balloonLoop === 1) this._balloonBack = true;
            }
            this._balloon.x = this.x - 12;
            this._balloon.y = this.y + 24;
            this._balloon.z = 10;
            this._balloon.opacity = this.opacity;
            const sx = this._balloonDuration < 12 ? 7 * 32 : (7 - idiv(this._balloonDuration - 12, 8)) * 32;
            this._balloon.srcRect(sx, this._balloonId * 32, 32, 32);
            this._balloon.rrApply();
            const mod = this.battler.rrStatusMod();
            this._battlerStatus[0] = mod[0];
            this._battlerStatus[1] = mod[1];
            this._statusCount.srcRect(this._battlerStatus[1] * 32, this._battlerStatus[0] * 32, 32, 32);
            this._statusCount.x = this.x - 14;
            this._statusCount.y = this.y + 26;
            this._statusCount.z = 11;
            this._statusCount.opacity = this.opacity;
            this._statusCount.rrApply();
        }
        updateBattlerBitmap() {
            const b = this.battler;
            if (b.isActor()) {
                if (b.characterName() !== this._battlerName || (b.battlerHue ? b.battlerHue() : 0) !== this._battlerHue) {
                    this._battlerName = b.characterName();
                    this._battlerHue = b.battlerHue ? b.battlerHue() : 0;
                }
            } else {
                if (b.isStateAffected(15) && this._battlerName !== '$Boulder') { this._battlerName = '$Boulder'; b.rrVxSetCharacterName(this._battlerName); }
                else if (!b.isStateAffected(15) && this._battlerName === '$Boulder') { this._battlerName = b.battlerName(); b.rrVxSetCharacterName(this._battlerName); }
                else if (b.isStateAffected(37) && this._battlerName !== '$Fog') { this._battlerName = '$Fog'; b.rrVxSetCharacterName(this._battlerName); }
                else if (!b.isStateAffected(37) && this._battlerName === '$Fog') { this._battlerName = b.battlerName(); b.rrVxSetCharacterName(this._battlerName); }
                else if (this._enemyId !== b.enemyId()) {
                    this._battlerName = b.battlerName();
                    b.rrVxSetCharacterName(this._battlerName);
                    this._enemyId = b.enemyId();
                }
                if (!b.isAlive()) {
                    if (this._effectDuration === 0 && b.rrSbsCollapseType() !== 1) this.opacity = 0;
                } else if (DEAD_FLAT.includes(this._enemyId) && b._hp <= 0) {
                    this.zoomX = 1;
                    this.zoomY = 0.3;
                }
            }
        }
        // ---- single actions ----------------------------------------------------------------
        doAction() {
            const a = this._activeAction;
            if (!a) return;
            const k = a[0];
            if (k === 'Invert') return this.mirroring();
            if (k === 'angle') return this.angling();
            if (k === 'zoom') return this.zooming();
            if (k === 'Afterimage ON') return this.mirageOn();
            if (k === 'Afterimage OFF') return this.mirageOff();
            if (k === 'pic') return this.picture();
            if (k === 'Clear image') { this._picture.visible = false; return; }
            if (k === 'change') return this.graphicsChange();
            if (k === 'anime') return this.battleAnime();
            if (k === 'balloon') return this.balloonAnime();
            if (k === 'sound') return this.sound();
            if (k === 'switch') { $gameSwitches.setValue(a[1], !!a[2]); return; }
            if (k === 'variable') return this.variable();
            if (k === 'Two Wpn Only') return this.twoSwords();
            if (k === 'One Wpn Only') return this.nonTwoSwords();
            if (k === 'nece') return this.necessary();
            if (k === 'der') return this.derivating();
            if (k === 'Process Skill') return this.individualAction();
            if (k === 'Process Skill End') return this.individualActionEnd();
            if (k === "Don't Wait") return this.nonRepeat();
            if (k === 'Start Pos Change') { this.battler.rrChangeBasePosition(this.x, this.y); return; }
            if (k === 'Start Pos Return') { this.battler.rrSbsBasePosition(); return; }
            if (k === 'target') return this.changeTarget();
            if (k === 'Can Collapse') return this.sendAction(k);
            if (k === 'Cancel Action') return this.sendAction(k);
            if (k === 'sta+') return this.stateOn();
            if (k === 'sta-') return this.stateOff();
            if (k === 'fps') return; // The frame-rate change is not carried (the game's sequences never use it).
            if (k === 'float') return this.floating();
            if (k === 'script') return this.script(a[1]);
            if (a.length === 4) return this.forceActionOut();
            if (a.length === 5) return this.reseting();
            if (a.length === 7) return this.moving();
            if (a.length === 9) return this.battlerAnime();
            if (a.length === 11) return this.movingAnime();
            if (k === 'End') return this.animeFinish();
        }
        script(code) {
            const m = /Graphics\.(fadeout|fadein)\((\d+)\)/.exec(String(code));
            if (m) { if (m[1] === 'fadeout') $gameScreen.startFadeOut(Number(m[2])); else $gameScreen.startFadeIn(Number(m[2])); }
        }
        mirroring() {
            this.mirror = !this.mirror;
            if (this._animeFlug && this._weaponR) this._weaponR.mirroring();
        }
        angling() {
            this.jumpReset();
            const a = this._activeAction;
            this._angleTime = a[1];
            let start = a[2], end = a[3];
            this._angleReset = a[4];
            if (this.battler.isEnemy()) { start *= -1; end *= -1; }
            if (this._angleTime <= 0) { this.angle = end; this._angleTime = 0; return; }
            this._angling = idiv(end - start, this._angleTime);
            this._angle = imod(end - start, this._angleTime) + start;
        }
        zooming() {
            this.jumpReset();
            const a = this._activeAction;
            this._zoomTime = a[1];
            const zx = a[2] - 1, zy = a[3] - 1;
            this._zoomReset = a[4];
            this._zoomX = this._zoomY = 1;
            if (this._zoomTime <= 0) { this._zoomTime = 0; return; }
            this._zoomingX = zx / this._zoomTime;
            this._zoomingY = zy / this._zoomTime;
        }
        mirageOn() {
            if (this.battler.isDead()) return;
            this._mirage0 = this.layerAdd(new Sprite_RrVx());
            this._mirage1 = this.layerAdd(new Sprite_RrVx());
            this._mirage2 = this.layerAdd(new Sprite_RrVx());
            this._mirageFlug = true;
            this._mirageCount = 0;
        }
        mirage(body) {
            body.bitmap = this.bitmap;
            body.x = this.x; body.y = this.y; body.ox = this.ox; body.oy = this.oy; body.z = this.z;
            body.mirror = this.mirror; body.angle = this._angle; body.zoomX = this.zoomX; body.zoomY = this.zoomY;
            if (this._animeFlug) body.srcRect(this._sx, this._sy, this._width, this._height);
            else body.srcRect(0, 0, this._width, this._height);
            body.rrApply();
        }
        mirageOff() {
            this._mirageFlug = false;
            for (const m of [this._mirage0, this._mirage1, this._mirage2]) if (m) m.rrDispose();
            this._mirage0 = this._mirage1 = this._mirage2 = null;
        }
        picture() {
            const a = this._activeAction;
            const b = this.battler;
            const picX = a[8] ? a[1] : b.rrPositionX() + a[1];
            const picY = b.rrPositionY() + a[2];
            const endX = a[8] ? b.rrPositionX() + a[3] : a[3];
            const endY = b.rrPositionY() + a[4];
            this._pictureTime = a[5];
            this._movingPicX = idiv(endX - picX, this._pictureTime);
            this._movingPicY = idiv(endY - picY, this._pictureTime);
            const plusX = imod(endX - picX, this._pictureTime), plusY = imod(endY - picY, this._pictureTime);
            this._picture.bitmap = VX.loadPicture(a[7]);
            this._picture.x = picX + plusX;
            this._picture.y = picY + plusY;
            this._picture.z = a[6] ? 1000 : b.rrPositionZ() - 442;
            this._picture.visible = true;
        }
        graphicsChange() {
            if (this.battler.isEnemy()) return;
            const a = this._activeAction;
            this._battlerName = a[2];
            this.bitmap = N01.WALK_ANIME ? VX.loadCharacter(this._battlerName) : VX.loadCharacter(this._battlerName + '_1');
            this._width = idiv(this.bitmap.width, this._baseWidth);
            this._height = idiv(this.bitmap.height, this._baseHeight);
            if (a[1]) this._beforeGraphic = this.battler.characterName();
            this.battler.rrGraphicChange(a[2]);
        }
        battleAnime() {
            const a = this._activeAction;
            const b = this.battler;
            if (a[5] && !b.isActor()) return;
            if (a[5] && !b.rrVxWeapons()[1]) return;
            if (b.isActor() && !a[5] && !b.rrVxWeapons()[0] && b.rrVxWeapons()[1]) return;
            let animeId = a[1];
            let waitflug = false;
            const mirror = false;
            const act = b.rrVxAction();
            if (animeId < 0) {
                if (act.isSkill() && animeId !== -2) {
                    if (animeId === -1) {
                        animeId = act.skill().animation_id;
                        if (!b.isActor()) {
                            const weapon = VX.weapon(b.rrSbsWeapon());
                            const elements = weapon ? weapon.element_set : [];
                            const table = { 204: [8, 18, 2, 14, 22], 205: [9, 19, 3, 15, 23], 206: [10, 20, 4, 16, 24], 207: [95, 96, 97, 98, 99] }[act.skill().id];
                            if (table) for (let e = 1; e <= 5; e++) if (elements.includes(e)) animeId = table[e - 1];
                        }
                    } else animeId = animeId + 198;
                } else if (act.isItem() && animeId !== -2) {
                    animeId = act.item().animation_id;
                } else {
                    animeId = N01.NO_WEAPON;
                    if (b.isActor()) {
                        if (b.rrVxWeaponId() !== 0) animeId = b.rrVxAtkAnimationId();
                        if (a[5]) animeId = b.rrVxAtkAnimationId2();
                    } else {
                        const wid = b.rrSbsWeapon();
                        if (wid !== 0 && VX.weapon(wid)) animeId = VX.weapon(wid).animation_id;
                    }
                }
                const anim = VX.animation(animeId);
                if (anim && a[4]) this._wait = anim.frame_max * 4;
                waitflug = true;
                const damageAction = [animeId, mirror, true];
                if (b.rrActive) { b.rrPlay = ['OBJ_ANIM', damageAction]; return; }
            }
            const anim = VX.animation(animeId);
            if (a[2] === 0 && anim) b.rrSetAnimationId(animeId, mirror);
            else if (anim) for (const t of this._targetBattler) if (t) t.rrSetAnimationId(animeId, mirror);
            if (anim && a[4] && !waitflug) this._wait = anim.frame_max * 4;
        }
        balloonAnime() {
            if (this.opacity === 0) return;
            const a = this._activeAction;
            if (!this._balloon) {
                this._balloon = new Sprite_RrVx(VX.loadSystem('Balloon'));
                this._balloon.ox = idiv(this._width, 16);
                this._balloon.oy = idiv(this._balloon.bitmap.height || 960, 15) + idiv(this._height, 3);
                if (Sprite_RrSbsBattler.globalLayer) Sprite_RrSbsBattler.globalLayer.addChild(this._balloon);
            }
            this._balloonId = a[1];
            this._balloonLoop = a[2];
            this._balloonDuration = 64;
            this._balloonBack = false;
            if (!this._statusCount) {
                this._statusCount = new Sprite_RrVx(VX.loadSystem('Counter'));
                this._statusCount.ox = idiv(this._width, 16);
                this._statusCount.oy = idiv(this._balloon.bitmap.height || 960, 15) + idiv(this._height, 3);
                if (Sprite_RrSbsBattler.globalLayer) Sprite_RrSbsBattler.globalLayer.addChild(this._statusCount);
            }
            this.updateBalloon();
            this._balloon.visible = true;
            this._statusCount.visible = true;
        }
        sound() {
            const a = this._activeAction;
            const pitch = a[2], vol = a[3];
            let name = a[4];
            if (a[1] === 'se') AudioManager.playSe({ name, volume: vol, pitch, pan: 0 });
            else if (a[1] === 'bgm') {
                if (name === '' && AudioManager._currentBgm) name = AudioManager._currentBgm.name;
                AudioManager.playBgm({ name, volume: vol, pitch, pan: 0 });
            } else if (a[1] === 'bgs') {
                if (name === '' && AudioManager._currentBgs) name = AudioManager._currentBgs.name;
                AudioManager.playBgs({ name, volume: vol, pitch, pan: 0 });
            }
        }
        variable() {
            const a = this._activeAction;
            const v = $gameVariables.value(a[1]), x = a[3];
            const out = [x, v + x, v - x, v * x, x ? idiv(v, x) : v, x ? imod(v, x) : v][a[2]];
            if (out !== undefined) $gameVariables.setValue(a[1], out);
        }
        twoSwords() {
            const b = this.battler;
            if (!b.isActor()) { this._action.shift(); return; }
            if (!b.rrVxWeapons()[1]) { this._action.shift(); return; }
            const active = this._action.shift();
            this._activeAction = N01.ANIME[active] || null;
            if (!this._activeAction) this._wait = toI(active);
            this.doAction();
        }
        nonTwoSwords() {
            const b = this.battler;
            if (!b.isActor()) return;
            if (b.rrVxWeapons()[1]) { this._action.shift(); return; }
            const active = this._action.shift();
            this._activeAction = N01.ANIME[active] || null;
            if (!this._activeAction) this._wait = toI(active);
            this.doAction();
        }
        necessary() {
            const a = this._activeAction;
            const b = this.battler;
            const nece1 = a[3], nece2 = a[4];
            let target;
            switch (a[1]) {
                case 0: target = [b.isActor() ? $gameParty.members()[b.rrVxIndex()] : $gameTroop.members()[b.rrVxIndex()]]; break;
                case 1: target = this._targetBattler; break;
                case 2: target = $gameTroop.members(); break;
                case 3: target = $gameParty.members(); break;
                default: target = [];
            }
            if (!target || target.length === 0) { this.startAction(b.rrSbs_recover_action()); return; }
            switch (a[2]) {
                case 0: {
                    const stateOn = nece2 > 0 ? true : null;
                    let stateMember = Math.abs(nece2);
                    if (nece2 === 0) stateMember = b.isActor() ? $gameParty.members().length : $gameTroop.members().length;
                    for (const m of target) if (m && m.isStateAffected(nece1)) stateMember -= 1;
                    if (stateMember === 0 && stateOn) return;
                    if (stateMember === Math.abs(nece2) && stateOn == null) return;
                    break;
                }
                case 1: {
                    const numOver = nece2 > 0 ? true : null;
                    let n = 0;
                    for (const m of target) {
                        if (!m) continue;
                        n += [m._hp, m._mp, m.atk, m.def, m.mat, m.agi][nece1] || 0;
                    }
                    n = idiv(n, target.length);
                    if (n > Math.abs(nece2) && numOver) return;
                    if (n < Math.abs(nece2) && numOver == null) return;
                    break;
                }
                case 2:
                    if ($gameSwitches.value(nece1)) { if (nece2) return; } else if (!nece2) return;
                    break;
                case 3:
                    if (nece2 > 0) { if ($gameVariables.value(nece1) > nece2) return; }
                    else if (!($gameVariables.value(nece1) > Math.abs(nece2))) return;
                    break;
                case 4: {
                    let need = Math.abs(nece2);
                    for (const m of target) { if (m && m.rrVxSkillLearn(nece1)) need -= 1; if (need === 0) return; }
                    break;
                }
            }
            if (this._nonRepeat) { this._action = ['End']; return; }
            this.startAction(b.rrSbs_recover_action());
        }
        derivating() {
            const a = this._activeAction;
            const b = this.battler;
            if (!a[2] && !b.rrSkillIdLearn(a[3])) return;
            if (rand(100) > a[1]) return;
            b.rrDerivation = a[3];
            this._action = ['End'];
        }
        individualAction() {
            this.battler.rrIndividual = true;
            this._individualAct = this._action.slice();
            this.sendAction(['個別処理']);
            this._individualTargets = this._targetBattler.slice();
            this._targetBattler = [this._individualTargets.shift()];
        }
        individualActionEnd() {
            if (this._individualTargets.length === 0) { this.battler.rrIndividual = false; return; }
            this._action = this._individualAct.slice();
            this._targetBattler = [this._individualTargets.shift()];
        }
        nonRepeat() {
            this._repeatAction = [];
            this._nonRepeat = true;
            this.animeFinish();
        }
        changeTarget() {
            const a = this._activeAction;
            const b = this.battler;
            if (a[2] === 3) { this._targetBattler = this._nowTargets.slice(); return; }
            const target = a[2] === 0 ? [b] : this._targetBattler.slice();
            if (a[2] === 2) { this._nowTargets = this._targetBattler.slice(); this._targetBattler = []; }
            let change = false;
            if (a[1] >= 1000) {
                const members = b.isActor() ? $gameParty.members() : $gameTroop.members();
                const index = a[1] - 1000;
                if (index < members.length) {
                    if (members[index].isAlive() && b.rrVxIndex() !== index) {
                        members[index].rrForceTarget = ['N01target_change', target];
                        if (a[2] === 2) this._targetBattler = [members[index]];
                        change = true;
                    } else {
                        for (const m of members) {
                            if (b.rrVxIndex() === m.rrVxIndex()) continue;
                            if (!m.isAlive()) continue;
                            m.rrForceTarget = ['N01target_change', target];
                            if (a[2] === 2) this._targetBattler = [m];
                            change = true;
                            break;
                        }
                    }
                }
            } else if (a[1] > 0) {
                for (const m of $gameParty.members().concat($gameTroop.members())) {
                    if (m.isStateAffected(a[1])) { m.rrForceTarget = ['N01target_change', target]; if (a[2] === 2) this._targetBattler.push(m); change = true; }
                }
            } else if (a[1] < 0) {
                const skillId = Math.abs(a[1]);
                for (const actor of $gameParty.members()) {
                    if (actor.rrSkillIdLearn(skillId)) { actor.rrForceTarget = ['N01target_change', target]; if (a[2] === 2) this._targetBattler.push(target); change = true; }
                }
            } else {
                for (const m of this._targetBattler.slice()) {
                    m.rrForceTarget = ['N01target_change', target];
                    if (a[2] === 2) this._targetBattler.push(m);
                    change = true;
                }
            }
            if (change) return;
            if (this._nonRepeat) { this._action = ['End']; return; }
            this.startAction(b.rrSbs_recover_action());
        }
        stateOn() {
            const a = this._activeAction;
            const b = this.battler;
            const id = a[2];
            const tryAdd = (t) => { if (rand(100) < t.rrVxStateProbability(id)) t.addState(id); };
            switch (a[1]) {
                case 0: tryAdd(b); break;
                case 1: for (const t of this._targetBattler || []) if (t) tryAdd(t); break;
                case 2: for (const t of $gameTroop.members()) tryAdd(t); break;
                case 3: for (const t of $gameParty.members()) tryAdd(t); break;
                case 4: for (const t of $gameParty.members()) if (t.rrVxIndex() !== b.rrVxIndex()) tryAdd(t); break;
            }
        }
        stateOff() {
            const a = this._activeAction;
            const b = this.battler;
            const id = a[2];
            switch (a[1]) {
                case 0: b.removeState(id); break;
                case 1: for (const t of this._targetBattler || []) if (t) t.removeState(id); break;
                case 2: for (const t of $gameTroop.members()) t.removeState(id); break;
                case 3: for (const t of $gameParty.members()) t.removeState(id); break;
                case 4: for (const t of $gameParty.members()) if (t.rrVxIndex() !== b.rrVxIndex()) t.removeState(id); break;
            }
        }
        floating() {
            this.jumpReset();
            const a = this._activeAction;
            this._jumpPlus = a[1];
            const end = a[2];
            this._floatTime = a[3];
            this._floatUp = idiv(end - this._jumpPlus, this._floatTime);
            this._wait = this._floatTime;
            if (this._animeFlug) {
                const moveAnime = N01.ANIME[a[4]];
                if (moveAnime) { this._activeAction = moveAnime; this.battlerAnime(); this._animeEnd = true; }
            }
            this.battler.rrJump = this._jumpPlus;
        }
        forceActionOut() {
            const a = this._activeAction;
            const b = this.battler;
            const action = [a[0], a[2], a[3]];
            if (a[1] >= 1000) {
                const members = b.isActor() ? $gameParty.members() : $gameTroop.members();
                const index = a[1] - 1000;
                let force = false;
                if (index < members.length) {
                    if (members[index].isAlive() && b.rrVxIndex() !== index) { members[index].rrForceAction = action; return; }
                    for (const t of members) {
                        if (b.rrVxIndex() === t.rrVxIndex()) continue;
                        if (!t.isAlive()) continue;
                        force = true;
                        t.rrForceAction = action;
                        break;
                    }
                }
                if (force) return;
                if (this._nonRepeat) { this._action = ['End']; return; }
                this.startAction(b.rrSbs_recover_action());
            } else if (a[1] === 0) {
                for (const t of this._targetBattler) if (t) t.rrForceAction = action;
            } else if (a[1] > 0) {
                for (const t of $gameParty.members().concat($gameTroop.members())) if (t.isStateAffected(a[1])) t.rrForceAction = action;
            } else if (a[1] < 0) {
                if (b.isEnemy()) return;
                for (const actor of $gameParty.members()) if (actor !== b && actor.rrSkillIdLearn(Math.abs(a[1]))) actor.rrForceAction = action;
            }
        }
        reseting() {
            this.jumpReset();
            this.angle = 0;
            const a = this._activeAction;
            this._distanseX = this._moveX * -1;
            this._distanseY = this._moveY * -1;
            this._moveSpeedX = a[1];
            this._moveSpeedY = this._moveSpeedX;
            this._moveBoostX = a[2];
            this._moveBoostY = this._moveBoostX;
            this._jump = a[3];
            this.moveDistance();
            if (this._animeFlug) {
                const moveAnime = N01.ANIME[a[4]];
                if (moveAnime) { this._activeAction = moveAnime; this.battlerAnime(); }
                this._animeEnd = true;
            }
        }
        moving() {
            this.jumpReset();
            const a = this._activeAction;
            const b = this.battler;
            let xx = a[1], yy = a[2];
            const fixed = a[6] === 'WAIT(FIXED)';
            const front = sw(62);
            switch (a[0]) {
                case 0:
                    if (front && Math.abs(xx) > Math.abs(yy)) { yy = idiv(xx * 3, 4); xx = 0; }
                    this._distanseX = xx; this._distanseY = yy;
                    break;
                case 1: {
                    const targets = (this._targetBattler || []).filter(Boolean);
                    if (!this._targetBattler || targets.length === 0) {
                        this._distanseX = xx; this._distanseY = yy;
                        if (front && !fixed && Math.abs(this._distanseX) > Math.abs(this._distanseY)) { this._distanseY = idiv(this._distanseX * 3, 4); this._distanseX = 0; }
                    } else {
                        let tx = 0, ty = 0;
                        for (const t of targets) { tx += t.rrPositionX(); ty += t.rrPositionY(); }
                        tx = idiv(tx, targets.length); ty = idiv(ty, targets.length);
                        if (front && Math.abs(xx) > Math.abs(yy) && !fixed) { yy = idiv(xx * 3, 4); xx = 0; }
                        this._distanseY = ty - this.y + yy;
                        this._distanseX = b.isActor() ? tx - this.x + xx : this.x - tx + xx;
                    }
                    break;
                }
                case 2:
                    if (front && !fixed) xx = 308;
                    this._distanseX = b.isActor() ? xx - this.x : this.x - xx;
                    this._distanseY = a[2] - this.y;
                    break;
                case 3:
                    if (front && Math.abs(xx) > Math.abs(yy)) { yy = idiv(xx * 3, 4); xx = 0; }
                    this._distanseX = b.isActor() ? xx + b._rrBasePositionX - this.x : xx + this.x - b._rrBasePositionX;
                    this._distanseY = yy + b._rrBasePositionY - b.rrPositionY();
                    break;
            }
            this._moveSpeedX = a[3];
            this._moveSpeedY = a[3];
            this._moveBoostX = a[4];
            this._moveBoostY = a[4];
            this._jump = a[5];
            this._jumpPlus = 0;
            this.moveDistance();
            if (this._animeFlug) {
                const moveAnime = N01.ANIME[a[6]];
                if (moveAnime) { this._activeAction = moveAnime; this.battlerAnime(); }
                this._animeEnd = true;
            }
        }
        /** move_distance: per-frame steps, the remainders, acceleration and the jump arc (Ruby's integer maths). */
        moveDistance() {
            const b = this.battler;
            if (this._moveSpeedX === 0) { this._movingX = 0; this._movingY = 0; }
            else {
                this._movingX = idiv(this._distanseX, this._moveSpeedX);
                this._movingY = idiv(this._distanseY, this._moveSpeedY);
                const overX = imod(this._distanseX, this._moveSpeedX), overY = imod(this._distanseY, this._moveSpeedY);
                this._moveX += overX; this._moveY += overY;
                b.rrMoveX = this._moveX; b.rrMoveY = this._moveY;
                this._distanseX -= overX; this._distanseY -= overY;
            }
            if (this._distanseX === 0) this._moveSpeedX = 0;
            if (this._distanseY === 0) this._moveSpeedY = 0;
            const axis = (d, speedKey, plusKey, boostKey, movingKey, moveKey, set) => {
                let boost = this[movingKey];
                let move = 0;
                let before = 0;
                if (this[boostKey] > 0 && this[d] !== 0) {
                    if (this[d] < 0) this[boostKey] *= -1;
                    let over = 0;
                    for (let i = 0; i < this[speedKey]; i++) {
                        boost += this[boostKey];
                        move += boost;
                        over = this[d] - move;
                        if ((this[d] > 0 && over < 0) || (this[d] < 0 && over > 0)) { this[speedKey] = i; break; }
                    }
                    before = over + boost;
                    this[plusKey] = this[movingKey] ? Math.abs(idiv(before, this[movingKey])) : 0;
                    this[moveKey] += this[movingKey] ? imod(before, this[movingKey]) : before;
                    set(this[moveKey]);
                } else if (this[boostKey] < 0 && this[d] !== 0) {
                    if (this[d] < 0) this[boostKey] *= -1;
                    const xAxis = speedKey === '_moveSpeedX';
                    for (let i = 0; i < this[speedKey]; i++) {
                        boost += this[boostKey];
                        move += boost;
                        const lost = this[d] - move;
                        before = lost;
                        if ((this[d] > 0 && boost < 0) || (this[d] < 0 && boost > 0)) {
                            // SBS counts one frame fewer on the x axis than on the y axis here.
                            this[speedKey] = xAxis ? i - 1 : i;
                            before = lost + boost;
                            break;
                        }
                    }
                    this[plusKey] = this[movingKey] ? Math.abs(idiv(before, this[movingKey])) : 0;
                    this[moveKey] += this[movingKey] ? imod(before, this[movingKey]) : before;
                    set(this[moveKey]);
                }
            };
            axis('_distanseX', '_moveSpeedX', '_moveSpeedPlusX', '_moveBoostX', '_movingX', '_moveX', v => { b.rrMoveX = v; });
            axis('_distanseY', '_moveSpeedY', '_moveSpeedPlusY', '_moveBoostY', '_movingY', '_moveY', v => { b.rrMoveY = v; });
            const x = this._moveSpeedPlusX + this._moveSpeedX, y = this._moveSpeedPlusY + this._moveSpeedY;
            const endTime = x > y ? x : y;
            this._wait = endTime;
            if (this._jump !== 0) {
                if (this._wait === 0) this._wait = this._activeAction[3];
                this._jumpTime = idiv(this._wait, 2);
                this._jumpTimePlus = imod(this._wait, 2);
                this._jumpSign = 0; this._jumpSign2 = 0;
                if (this._jump < 0) { this._jumpSign = -1; this._jumpSign2 = 1; this._jump = this._jump * -1; }
                else { this._jumpSign = 1; this._jumpSign2 = -1; }
                this._jumpFloat = !Number.isInteger(this._jump);
                this._jumpUp = Math.pow(2, this._jump) * this._jumpSign;
                if (this._jumpTime === 0) this._jumpUp = 0;
                else if (this._jumpTime !== 1) this._jumpSize = this._jumpUp * this._jumpSign * this._jumpSign2;
                else { this._jumpSize = this._jumpUp * 2 * this._jumpSign * this._jumpSign2; this._jumpFlug = true; }
            }
        }
        battlerAnime() {
            const a = this._activeAction;
            const b = this.battler;
            this._animeKind = a[1];
            if (sw(62)) { if (this._animeKind === 1) this._animeKind = 3; else if (this._animeKind === 2) this._animeKind = 0; }
            this._animeSpeed = a[2];
            this._animeLoop = a[3];
            this._unloopWait = a[4];
            this._animeEnd = true;
            this._reverse = false;
            if (this._weaponR && a[8] !== '') {
                const weaponKind = N01.ANIME[a[8]];
                const twoSwordsFlug = weaponKind ? weaponKind[11] : false;
                if (twoSwordsFlug && !b.isActor()) return;
                if (twoSwordsFlug && !b.rrVxWeapons()[1] && b.isActor()) return;
                const w = b.isActor() ? b.rrVxWeapons() : null;
                if (b.isActor() && !w[0] && !twoSwordsFlug) this._weaponR.actionReset();
                else if (b.isActor() && !w[1] && twoSwordsFlug) this._weaponR.actionReset();
                else if (!b.isActor() && b.rrSbsWeapon() === 0) this._weaponR.actionReset();
                else {
                    this._weaponR.actionReset();
                    if (a[5] !== -1) this._weaponR.freeze(a[5]);
                    this._weaponR.weaponGraphics(!!twoSwordsFlug);
                    this._weaponR.weaponAction(a[8], this._animeLoop);
                    this._weaponAction = true;
                    this._weaponR.action();
                }
            } else if (this._weaponR) this._weaponR.actionReset();
            this._animeEnd = false;
            if (a[5] !== -1 && a[5] !== -2) {
                this._animeFreeze = true;
                this._animeEnd = true;
            } else if (a[5] === -2) {
                this._animeFreeze = false;
                this._reverse = true;
                this._pattern = this._baseWidth - 1;
                if (this._weaponAction && this._weaponR) { this._weaponR.action(); this._weaponR.update(); }
            } else {
                this._animeFreeze = false;
                this._pattern = 0;
                if (this._weaponAction && this._weaponR) { this._weaponR.action(); this._weaponR.update(); }
            }
            this._patternBack = false;
            this._frameCount = this._animeSpeed;
            b.rrMoveZ = a[6];
            if (this._shadow) this._shadow.visible = !!a[7];
            const fileName = a[0] === 0 ? this._battlerName : this._battlerName + '_' + a[0];
            if (!this._animeFlug) return;
            this.bitmap = VX.loadCharacter(fileName);
            this._sx = this._pattern * this._width;
            this._sy = this._animeKind * this._height;
            if (this._animeFreeze) this._sx = a[5] * this._width;
            this.srcRect(this._sx, this._sy, this._width, this._height);
        }
        movingAnime() {
            if (this._animeMoving) this._moveAnime.actionReset();
            this._animeMoving = true;
            const a = this._activeAction;
            const b = this.battler;
            const mirror = false;
            const id = a[1];
            const target = a[2];
            let x = 0, y = 0;
            if (target === 0) {
                const t = this._targetBattler && this._targetBattler[0];
                if (!t) { x = this.x; y = this.y; } else { x = t.rrPositionX(); y = t.rrPositionY(); }
            } else if (target === 1) {
                const xa = (b.isActor() ? $gameTroop.members() : $gameParty.members()).map(t => t.rrPositionX());
                const xb = Math.min(...xa), xc = Math.max(...xa);
                x = xb + idiv(xc - xb, 2) + 64;
                y = 232;
            } else if (target === 2) {
                const ms = b.isActor() ? $gameParty.members() : $gameTroop.members();
                for (const t of ms) { x += t.rrPositionX(); y += t.rrPositionY(); }
                x = idiv(x, ms.length || 1); y = idiv(y, ms.length || 1);
            } else { x = this.x; y = this.y; }
            let plusX, plusY;
            if (a[10] !== '' && sw(62)) { plusX = a[6] + 16; plusY = a[7] - 48; }
            else { plusX = a[6]; plusY = a[7]; }
            if (b.isEnemy()) plusX *= -1;
            let dx = x - this.x - plusX, dy = y - this.y - plusY;
            const type = a[3], speed = a[4], orbit = a[5];
            if (a[8] === 0) { this._moveAnime.baseX = this.x + plusX; this._moveAnime.baseY = this.y + plusY; }
            else if (a[8] === 1) { this._moveAnime.baseX = x + plusX; this._moveAnime.baseY = y + plusY; dy *= -1; dx *= -1; }
            else { this._moveAnime.baseX = x; this._moveAnime.baseY = y; dx = dy = 0; }
            let weapon = '', weaponName = null, iconWeapon = false;
            if (a[10] === '' || this._animeFlug !== true) weapon = '';
            else {
                const battler = b.isActor() ? $gameParty.members()[b.rrVxIndex()] : $gameTroop.members()[b.rrVxIndex()];
                const weaponId = b.isActor() ? battler.rrVxWeaponId() : battler.rrSbsWeapon();
                const weaponAct = N01.ANIME[a[10]];
                const w = VX.weapon(weaponId);
                if (weaponId !== 0 && weaponAct && weaponAct.length === 3 && w) {
                    const file = w.flyingGraphic();
                    if (file === '') {
                        weaponName = w.graphic();
                        iconWeapon = false;
                        if (weaponName === '') { weaponName = w.icon_index; iconWeapon = true; }
                    } else { iconWeapon = false; weaponName = file; }
                    weapon = a[10];
                } else if (weaponAct && weaponAct.length === 3) weapon = '';
                else if (weaponAct && b.rrVxAction().skill()) {
                    iconWeapon = false;
                    weaponName = b.rrVxAction().skill().flyingGraphic();
                    weapon = a[10];
                }
            }
            this._moveAnime.z = a[9] ? 1000 : -100;
            this._moveAnime.animeAction(id, mirror, dx, dy, type, speed, orbit, weapon, weaponName, iconWeapon);
        }
        animeFinish() {
            if (this._individualTargets.length !== 0) { this.individualActionEnd(); return; }
            if (this.battler.rrActive) this.sendAction(this._activeAction[0]);
            if (this._mirageFlug) this.mirageOff();
            if (!this._nonRepeat) this.startAction(this._repeatAction);
        }
        collapseAction() {
            const b = this.battler;
            this._nonRepeat = true;
            this._effectType = COLLAPSE;
            if (!b.isActor()) this._collapseType = b.rrSbsCollapseType();
            if (!b.isActor()) this._battlerVisible = false;
            switch (this._collapseType) {
                case 1: SoundManager.playActorCollapse(); break;
                case 2: this._effectDuration = N01.COLLAPSE_WAIT + 48; break;
                case 3: this._effectDuration = 401; break;
            }
        }
        normalCollapse() {
            if (vars(91) === 5 || vars(92) === 5) {
                if (this._effectDuration === 47) {
                    AudioManager.playSe({ name: 'Explosion2', volume: 100, pitch: 100, pan: 0 });
                    if (Sprite_RrSbsBattler.viewportFlash) Sprite_RrSbsBattler.viewportFlash([255, 255, 255, 255], 30);
                    this.blendType = 1;
                    this.rrColor = [255, 128, 128, 128];
                    if ($gameTroop.members().some(m => m.isAlive())) {
                        for (const m of $gameParty.members()) {
                            let x = 0;
                            if (vars(91) === 5) x += idiv(m.mhp, 10);
                            if (vars(92) === 5) x += idiv(m.mhp, 10);
                            m.setHp(m.hp - x);
                        }
                    }
                }
            } else if (this._effectDuration === 47) {
                SoundManager.playEnemyCollapse();
                this.blendType = 1;
                this.rrColor = [255, 128, 128, 128];
            }
            if (this._effectDuration <= 47) this.opacity = Math.max(0, Math.min(255, 256 - (48 - this._effectDuration) * 6));
        }
        bossCollapse1() {
            const d = this._effectDuration;
            if (d === 320 || d === 280) {
                AudioManager.playSe({ name: 'Absorb1', volume: 100, pitch: 80, pan: 0 });
                this.flash([255, 255, 255, 255], 60);
                if (Sprite_RrSbsBattler.viewportFlash) Sprite_RrSbsBattler.viewportFlash([255, 255, 255, 255], 20);
            }
            if (d === 220) {
                AudioManager.playSe({ name: 'Earth4', volume: 100, pitch: 80, pan: 0 });
                this.reset();
                this.blendType = 1;
                this.rrColor = [255, 128, 128, 128];
                // wave_amp has no MZ counterpart: the boss crumbles without its wave.
            }
            if (d < 220) {
                this.srcRect(0, idiv(d, 2) - 110, this._width, this._height);
                if (d % 4 === 0) this.x += 8;
                if (d % 4 === 2) this.x -= 8;
                this.opacity = Math.max(0, Math.min(255, d));
                if (d < 50) return;
                if (d % 50 === 0) AudioManager.playSe({ name: 'Earth4', volume: 100, pitch: 50, pan: 0 });
            }
        }
        // ---- VX's effects (white flash, blink, appear, disappear, collapse) -------------------------
        setupNewEffect() {
            const b = this.battler;
            if (b._rrWhiteFlash) { this._effectType = WHITEN; this._effectDuration = 16; b._rrWhiteFlash = false; }
            if (b._rrBlink) { this._effectType = BLINK; this._effectDuration = 20; b._rrBlink = false; }
            if (!this._battlerVisible && b.isAlive()) { this._effectType = APPEAR; this._effectDuration = 16; this._battlerVisible = true; }
            if (this._battlerVisible && b._hidden) { this._effectType = DISAPPEAR; this._effectDuration = 32; this._battlerVisible = false; }
            if (b._rrCollapse) { this._effectType = COLLAPSE; this._effectDuration = 48; b._rrCollapse = false; this._battlerVisible = false; }
            if (b._rrAnimationId) {
                this.startAnimation(VX.animation(b._rrAnimationId), b._rrAnimationMirror);
                b._rrAnimationId = 0;
            }
        }
        updateEffect() {
            if (this._effectDuration > 0) {
                this._effectDuration -= 1;
                switch (this._effectType) {
                    case WHITEN: this.updateWhiten(); break;
                    case BLINK: this.updateBlink(); break;
                    case APPEAR: this.updateAppear(); break;
                    case DISAPPEAR: this.updateDisappear(); break;
                    case COLLAPSE: this.updateCollapse(); break;
                }
            }
        }
        stateChecks() {
            const b = this.battler;
            return { blend: BLEND_STATES.some(s => b.isStateAffected(s)), color: COLOR_STATES.some(s => b.isStateAffected(s)) };
        }
        updateWhiten() {
            const c = this.stateChecks();
            if (!c.blend) this.blendType = 0;
            if (!c.color) this.rrColor = [255, 255, 255, Math.max(0, 128 - (16 - this._effectDuration) * 10)];
            this.opacity = 255;
        }
        updateBlink() {
            const c = this.stateChecks();
            if (!c.blend) this.blendType = 0;
            if (!c.color) this.rrColor = [0, 0, 0, 0];
            this.opacity = 255;
            this.visible = this._effectDuration % 10 < 5;
        }
        updateAppear() {
            const c = this.stateChecks();
            if (!c.blend) this.blendType = 0;
            if (!c.color) this.rrColor = [0, 0, 0, 0];
            this.opacity = Math.min(255, (16 - this._effectDuration) * 16);
        }
        updateDisappear() {
            const c = this.stateChecks();
            if (!c.blend) this.blendType = 0;
            if (!c.color) this.rrColor = [0, 0, 0, 0];
            this.opacity = Math.max(0, Math.min(255, 256 - (32 - this._effectDuration) * 10));
        }
        // ---- Sprite_Base: VX animations, drawn as RGSS did (16 cells, a frame every 4 updates) ---------------------
        isAnimationPlaying() { return this._animation != null; }
        startAnimation(animation, mirror) {
            this.disposeAnimation();
            this._animation = animation;
            if (!animation) return;
            this._animationMirror = !!mirror;
            this._animationDuration = animation.frame_max * 4 + 1;
            const d = animation.data;
            this._animBitmap1 = ImageManager.loadAnimation(d.animation1Name || '');
            this._animBitmap2 = ImageManager.loadAnimation(d.animation2Name || '');
            this._animationSprites = [];
            const shared = Sprite_RrSbsBattler._screenAnimations;
            if (animation.position !== 3 || !shared.includes(animation.id)) {
                for (let i = 0; i < 16; i++) {
                    const s = this.layerAdd(new Sprite_RrVx());
                    s.visible = false;
                    this._animationSprites.push(s);
                }
                if (!shared.includes(animation.id)) shared.push(animation.id);
            }
            if (animation.position === 3) {
                this._animationOx = idiv(Graphics.width, 2);
                this._animationOy = idiv(Graphics.height, 2);
            } else this.updateAnimationOrigin();
        }
        updateAnimationOrigin() {
            const a = this._animation;
            if (!a || a.position === 3) return;
            // SBS: the animation follows the sprite (its centre, top or bottom).
            this._animationOx = this.x - this.ox + idiv(this.srcW, 2);
            this._animationOy = this.y - this.oy + idiv(this.srcH, 2);
            if (a.position === 0) this._animationOy -= idiv(this.srcH, 2);
            else if (a.position === 2) this._animationOy += idiv(this.srcH, 2);
        }
        updateAnimation() {
            if (!this._animation) return;
            this._animationDuration -= 1;
            if (this._animationDuration % 4 !== 0) return;
            this.updateAnimationOrigin();
            if (this._animationDuration > 0) {
                const a = this._animation;
                const frameIndex = a.frame_max - idiv(this._animationDuration + 3, 4);
                this.animationSetSprites(a.data.frames[frameIndex] || []);
                for (const t of a.data.timings || []) if (t.frame === frameIndex) this.animationProcessTiming(t);
            } else this.disposeAnimation();
        }
        animationSetSprites(cells) {
            const a = this._animation;
            for (let i = 0; i < 16; i++) {
                const s = this._animationSprites && this._animationSprites[i];
                if (!s) continue;
                const cell = cells[i] ? cells[i].slice() : null;
                if (cell && a.data.animation1Name === 'Shields' && [176, 177, 178, 179].includes(a.id)) {
                    const actorId = a.id - 175;
                    let icon = 0;
                    for (const m of $gameParty.members()) if (m.actorId() === actorId) { const sh = m._equips[1] && m._equips[1].object(); if (sh && DataManager.isArmor(sh)) icon = sh.iconIndex; }
                    if (icon !== 0) cell[0] = icon <= 511 ? icon - 480 : icon <= 607 ? icon - 560 : icon === 720 ? icon - 672 : icon - 677;
                }
                const pattern = cell ? cell[0] : -1;
                if (pattern == null || pattern === -1 || pattern < 0) { s.visible = false; continue; }
                s.bitmap = pattern < 100 ? this._animBitmap1 : this._animBitmap2;
                if (a.data.animation1Hue && pattern < 100) s.setHue(a.data.animation1Hue);
                if (a.data.animation2Hue && pattern >= 100) s.setHue(a.data.animation2Hue);
                s.visible = true;
                s.srcRect(pattern % 5 * 192, idiv(pattern % 100, 5) * 192, 192, 192);
                if (this._animationMirror) {
                    s.x = this._animationOx - cell[1]; s.y = this._animationOy + cell[2];
                    s.angle = 360 - cell[4]; s.mirror = cell[5] === 0;
                } else {
                    s.x = this._animationOx + cell[1]; s.y = this._animationOy + cell[2];
                    s.angle = cell[4]; s.mirror = cell[5] === 1;
                }
                s.z = this.z + 300 + i;
                s.ox = 96; s.oy = 96;
                s.zoomX = s.zoomY = cell[3] / 100.0;
                s.opacity = cell[6] * this.opacity / 255.0;
                s.blendType = cell[7];
                s.rrApply();
            }
        }
        animationProcessTiming(t) {
            if (t.se && t.se.name) AudioManager.playSe(t.se);
            const dur = t.flashDuration * 4;
            switch (t.flashScope) {
                case 1: this.flash(t.flashColor, dur); break;
                case 2: if (Sprite_RrSbsBattler.viewportFlash) Sprite_RrSbsBattler.viewportFlash(t.flashColor, dur); break;
                case 3: this.flash(null, dur); break;
            }
        }
        disposeAnimation() {
            if (this._animationSprites) {
                for (const s of this._animationSprites) s.rrDispose();
                this._animationSprites = null;
                this._animation = null;
            }
            this._animBitmap1 = this._animBitmap2 = null;
        }
    }
    Sprite_RrSbsBattler._screenAnimations = [];
    Sprite_RrSbsBattler.globalLayer = null;
    mzGlobal('Sprite_RrSbsBattler', Sprite_RrSbsBattler);
    VX.Sprite_RrSbsBattler = Sprite_RrSbsBattler;

    // ---- Sprite_MoveAnime: flying animations, thrown weapons and bombs ----------------------------------
    class Sprite_RrSbsMoveAnime extends Sprite_RrVx {
        initialize(battler) {
            super.initialize();
            this.battler = battler;
            this.visible = false;
            this.baseX = 0; this.baseY = 0;
            this._moveX = this._moveY = 0;
            this._movingX = this._movingY = 0;
            this._orbit = 0; this._orbitPlus = 0; this._orbitTime = 0;
            this._through = false; this._finish = false; this._time = 0;
            this._angle = 0; this._angling = 0;
            this._anim = null;
        }
        animeAction(id, mirror, dx, dy, type, speed, orbit, weapon, iconIndex, iconWeapon) {
            this._time = speed;
            this._movingX = idiv(dx, speed);
            this._movingY = idiv(dy, speed);
            if (type === 1) this._through = true;
            this._orbitPlus = orbit;
            this._orbitTime = this._time;
            if (weapon !== '') {
                const action = (N01.ANIME[weapon] || [0, 0, 1]).slice();
                let end;
                if (this.battler.isActor()) { this._angle = action[0]; end = action[1]; }
                else { this._angle = action[0] + 270; end = action[1] + 270; }
                const time = action[2];
                this._angling = idiv(end - this._angle, time);
                this.angle = this._angle;
                this.mirror = mirror;
                if (iconWeapon) {
                    this.bitmap = VX.loadSystem('IconSet');
                    const ICONS = { 1: 154, 2: 155, 3: 156, 4: 157, 5: 789, 6: 169, 7: 170, 8: 171 };
                    const icon = ICONS[id] !== undefined ? ICONS[id] : iconIndex;
                    this.srcRect(icon % 16 * 24, idiv(icon, 16) * 24, 24, 24);
                    this.ox = 12; this.oy = 12;
                    this.mirror = !this.battler.isActor();
                } else {
                    this.bitmap = VX.loadCharacter(iconIndex);
                    this.ox = idiv(this.bitmap.width, 2);
                    this.oy = idiv(this.bitmap.height, 2);
                }
                this.visible = true;
                this.z = 1000;
            }
            this.x = this.baseX + this._moveX;
            this.y = this.baseY + this._moveY + this._orbit;
            if (weapon === '' && id !== 0) {
                const anim = VX.animation(id);
                if (anim && this._host) this._host.startAnimationAt(this, anim, mirror);
                else this._pendingAnimation = anim ? [anim, mirror] : null;
            }
            this.rrApply();
        }
        actionReset() {
            this._movingX = this._movingY = this._moveX = this._moveY = this.baseX = this.baseY = this._orbit = 0;
            this._orbitTime = this._angling = this._angle = 0;
            this._through = this.visible = this._finish = false;
            this.disposeAnimation();
        }
        finish() { return this._finish; }
        update() {
            this.updateAnimation();
            Sprite.prototype.update.call(this);
            this._time -= 1;
            if (this._time >= 0) {
                this._moveX += this._movingX;
                this._moveY += this._movingY;
                const half = idiv(this._orbitTime, 2);
                if (this._time < half) this._orbitPlus = idiv(this._orbitPlus * 5, 4);
                else if (this._time === half) this._orbitPlus *= -1;
                else this._orbitPlus = idiv(this._orbitPlus * 2, 3);
                this._orbit += this._orbitPlus;
            }
            if (this._time < 0 && this._through) this._time = 100;
            if (this._time < 0 && !this._through) this._finish = true;
            this.x = this.baseX + this._moveX;
            this.y = this.baseY + this._moveY + this._orbit;
            if (this.x < -200 || this.x > 840 || this.y < -200 || this.y > 680) this._finish = true;
            if (this.visible) { this._angle += this._angling; this.angle = this._angle; }
            this.rrApply();
        }
    }
    // The flying sprite plays its animation with the battler sprites' VX animation code.
    for (const name of ['startAnimation', 'updateAnimationOrigin', 'updateAnimation', 'animationSetSprites', 'animationProcessTiming', 'disposeAnimation', 'isAnimationPlaying', 'layerAdd']) {
        Sprite_RrSbsMoveAnime.prototype[name] = Sprite_RrSbsBattler.prototype[name];
    }
    Sprite_RrSbsMoveAnime.prototype.updateAnimationOrigin = function() {
        const a = this._animation;
        if (!a || a.position === 3) return;
        this._animationOx = this.x - this.ox + idiv(this.srcW, 2);
        this._animationOy = this.y - this.oy + idiv(this.srcH, 2);
        if (a.position === 0) this._animationOy -= idiv(this.srcH, 2);
        else if (a.position === 2) this._animationOy += idiv(this.srcH, 2);
    };
    const _moveAnimeAction = Sprite_RrSbsMoveAnime.prototype.animeAction;
    Sprite_RrSbsMoveAnime.prototype.animeAction = function(id, mirror, dx, dy, type, speed, orbit, weapon, iconIndex, iconWeapon) {
        _moveAnimeAction.call(this, id, mirror, dx, dy, type, speed, orbit, weapon, iconIndex, iconWeapon);
        if (this._pendingAnimation) { this.startAnimation(this._pendingAnimation[0], this._pendingAnimation[1]); this._pendingAnimation = null; }
    };
    mzGlobal('Sprite_RrSbsMoveAnime', Sprite_RrSbsMoveAnime);

    // ---- Sprite_Weapon: the weapon icon swung with the battler's pose --------------------------------------
    class Sprite_RrSbsWeapon extends Sprite_RrVx {
        initialize(battler) {
            super.initialize();
            this.battler = battler;
            this._actionData = [];
            this._moveX = this._moveY = this._moveZ = 0;
            this._plusX = this._plusY = 0;
            this._angle = 0;
            this._zoomXv = 1; this._zoomYv = 1;
            this._movingX = this._movingY = 0;
            this._angling = 0;
            this._zoomingX = 1; this._zoomingY = 1;
            this._freeze = -1;
            this._mirroring = false;
            this._time = N01.ANIME_PATTERN + 1;
            this._loop = false;
            this.visible = false;
            this.weaponGraphics();
        }
        weaponGraphics(left = false) {
            const b = this.battler;
            const weapon = b.isActor() ? b.rrVxWeapons()[left ? 1 : 0] : VX.weapon(b.rrSbsWeapon());
            if (!weapon) return;
            if (weapon.graphic() === '') {
                const icon = weapon.icon_index;
                this.bitmap = VX.loadSystem('IconSet');
                this.srcRect(icon % 16 * 24, idiv(icon, 16) * 24, 24, 24);
                this._weaponWidth = this._weaponHeight = 24;
            } else {
                this.bitmap = VX.loadCharacter(weapon.graphic());
                this._weaponWidth = this.bitmap.width;
                this._weaponHeight = this.bitmap.height;
            }
        }
        freeze(action) { this._freeze = action; }
        weaponAction(action, loop) {
            if (action === '') { this.visible = false; return; }
            const data = N01.ANIME[action];
            if (!data) { this.visible = false; return; }
            this._actionData = data;
            let [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10] = data;
            if (sw(62)) { a3 -= 90; a4 -= 90; }
            if (this._mirroring) { a0 *= -1; a3 *= -1; a4 *= -1; a9 *= -1; }
            const time = N01.ANIME_PATTERN;
            this.z = a2 ? this.battler.rrPositionZ() + 1 : this.battler.rrPositionZ() - 1;
            if (a6) this.mirror = !this.mirror;
            if (this._mirroring) this.mirror = !this.mirror;
            const div = (p, q) => (Number.isInteger(p) && Number.isInteger(q) ? idiv(p, q) : p / q);
            this._movingX = div(a0, time);
            this._movingY = div(a1, time);
            this._angle = a3;
            this.angle = this._angle;
            this._angling = div(a4 - a3, time);
            this._angle += Number.isInteger(a4 - a3) ? imod(a4 - a3, time) : (a4 - a3) % time;
            this._zoomingX = div(1 - a7, time);
            this._zoomingY = div(1 - a8, time);
            if (this.mirror) a5 = ({ 1: 2, 2: 1, 3: 4, 4: 3 })[a5] || a5;
            const w = this._weaponWidth || 24, h = this._weaponHeight || 24;
            switch (a5) {
                case 0: this.ox = idiv(w, 2); this.oy = idiv(h, 2); break;
                case 1: this.ox = 0; this.oy = 0; break;
                case 2: this.ox = w; this.oy = 0; break;
                case 3: this.ox = 0; this.oy = h; break;
                case 4: this.ox = w; this.oy = h; break;
            }
            this._plusX = a9;
            this._plusY = a10;
            if (loop === 0) this._loop = true;
            this._angle -= this._angling;
            this._zoomXv -= this._zoomingX;
            this._zoomYv -= this._zoomingY;
            this._moveX -= this._movingX;
            this._moveY -= this._movingY;
            if (a2) this._moveZ = 1000;
            if (this._freeze !== -1) {
                for (let i = 0; i <= this._freeze + 1; i++) {
                    this._angle += this._angling;
                    this._zoomXv += this._zoomingX;
                    this._zoomYv += this._zoomingY;
                    this._moveX += this._movingX;
                    this._moveY += this._movingY;
                }
                this._angling = 0; this._zoomingX = 0; this._zoomingY = 0; this._movingX = 0; this._movingY = 0;
            }
            this.visible = true;
        }
        actionReset() {
            this._movingX = this._movingY = this._moveX = this._moveY = this._plusX = this._plusY = 0;
            this._angling = this._zoomingX = this._zoomingY = this._angle = this.angle = this._moveZ = 0;
            this._zoomXv = this._zoomYv = this.zoomX = this.zoomY = 1;
            this.mirror = this.visible = this._loop = false;
            this._freeze = -1;
            this._actionData = [];
            this._time = N01.ANIME_PATTERN + 1;
        }
        actionLoop() {
            this._angling *= -1; this._zoomingX *= -1; this._zoomingY *= -1; this._movingX *= -1; this._movingY *= -1;
        }
        mirroring() { this._mirroring = !this._mirroring; }
        action() {
            if (this._time <= 0) return;
            this._time -= 1;
            this._angle += this._angling;
            this._zoomXv += this._zoomingX;
            this._zoomYv += this._zoomingY;
            this._moveX += this._movingX;
            this._moveY += this._movingY;
            if (this._loop && this._time === 0) { this._time = N01.ANIME_PATTERN + 1; this.actionLoop(); }
        }
        update() {
            Sprite.prototype.update.call(this);
            this.angle = this._angle;
            this.zoomX = this._zoomXv;
            this.zoomY = this._zoomYv;
            this.x = this.battler.rrPositionX() + this._moveX + this._plusX;
            this.y = this.battler.rrPositionY() + this._moveY + this._plusY;
            this.z = this.battler.rrPositionZ() + this._moveZ - 1;
            this.rrApply();
        }
    }
    mzGlobal('Sprite_RrSbsWeapon', Sprite_RrSbsWeapon);

    // ---- Sprite_Damage: bouncing numbers, state names in a small window ------------------------------------
    class Window_RrSbsDamage extends Window_Base {
        initialize(x, y) {
            super.initialize(new Rectangle(x, y, 160, 46));
            this.z = 100;
            if (N01.NON_DAMAGE_WINDOW) this.opacity = 0;
        }
        updatePadding() { this.padding = 16; }
        popText(text) {
            this.contents.fontSize = VX.rubyFont(16);
            const w = this.contents.measureTextWidth(text) + 36;
            this.width = w;
            this.createContents();
            this.contents.fontSize = VX.rubyFont(16);
            this.changeTextColor(ColorManager.normalColor());
            this.contents.drawText(text, 0, -8, this.width - 32, 32, 'center');
        }
    }
    mzGlobal('Window_RrSbsDamage', Window_RrSbsDamage);
    class Sprite_RrSbsDamage {
        constructor(battler, layer) {
            this.battler = battler;
            this._layer = layer;
            this._duration = 0;
            this._x = 0; this._y = 0;
            this._minus = false;
            this._nums = [];
            for (let i = 0; i < 7; i++) {
                const s = new Sprite_RrVx();
                s.visible = false;
                if (layer) layer.addChild(s);
                this._nums.push(s);
            }
            this._window = null;
            this._popTime = 0;
        }
        update() {
            this.forceDamage();
            for (let i = 6; i >= 0; i--) if (this._nums[i].visible) this.moveDamage(this._nums[i], this._popTime - 2 * (6 - i));
            if (this._window) this.moveWindow();
            if (this._duration > 0) this._duration -= 1;
        }
        forceDamage() {
            const b = this.battler;
            if (b.rrForceDamage !== 0) {
                this.damagePop(b.rrForceDamage);
                b.setHp(b.hp - b.rrForceDamage);
                this._forceDamage = true;
                b.rrForceDamage = 0;
                VX.statusWindowRefresh = true;
            }
        }
        moveDamage(num, min) {
            const d = this._duration;
            const inRange = (lo, hi) => d >= lo && d <= hi;
            if (inRange(min - 1, min)) { num.x -= 1; num.y -= 4; }
            else if (inRange(min - 3, min - 2)) { num.x -= 1; num.y -= 3; }
            else if (inRange(min - 6, min - 4)) num.y -= 2;
            else if (inRange(min - 14, min - 7)) num.y += 2;
            else if (inRange(min - 17, min - 15)) num.y -= 2;
            else if (inRange(min - 23, min - 18)) num.y += 1;
            else if (inRange(min - 27, min - 24)) num.y -= 1;
            else if (inRange(min - 30, min - 28)) num.y += 1;
            else if (inRange(min - 33, min - 31)) num.y -= 1;
            else if (inRange(min - 36, min - 34)) num.y += 1;
            if (this.battler.rrDoubleDamage && d === min - 34) this.nextDamage();
            num.opacity = Math.max(0, Math.min(255, 256 - (12 - d) * 32));
            if (d === 0) num.visible = false;
            num.rrApply();
            if (this._forceDamage && d === 0) {
                this._forceDamage = false;
                this.battler.performCollapse();
            }
        }
        moveWindow() {
            if (this._windowTime > 0 && this._window.x > 0) this._window.x -= 6;
            this._windowTime -= 1;
            if (this._duration === 0) { this.disposeWindow(); }
        }
        disposeWindow() {
            if (this._window) { if (this._window.parent) this._window.parent.removeChild(this._window); this._window.destroy(); this._window = null; }
        }
        nextDamage() {
            this.battler.rrVxResult().hpDamage = 0;
            this.battler.rrDoubleDamage = false;
            this.damagePop();
        }
        damagePop(n) {
            this.reset();
            const b = this.battler;
            const r = b.rrVxResult();
            let damage = r.hpDamage;
            const states = b.rrVxAddedStates();
            let text = '';
            if (!b.rrDoubleDamage && r.mpDamage !== 0) {
                if (r.mpDamage > 0) text = N01.POP_MP_DAM;
                if (r.mpDamage < 0) text = N01.POP_MP_REC;
                damage = r.mpDamage;
            }
            if (n == null) {
                if (damage === 0 && states.length === 0 && !b.rrRevival) text = N01.POP_DAMAGE0;
                for (const state of states) {
                    if (!state.extension().includes('NOPOP')) {
                        if (text !== '') text += ' ';
                        text += state.name;
                    }
                }
            } else damage = n;
            this._minus = damage < 0;
            damage = Math.abs(damage);
            this._x = b.rrPositionX();
            this._y = b.rrPositionY();
            if (text !== '') this.window(text);
            this._popTime = N01.NUM_DURATION;
            if (r.critical && Sprite_RrSbsBattler.viewportFlash) Sprite_RrSbsBattler.viewportFlash([255, 255, 255, 128], 15);
            if (damage === 0) { this._duration = this._popTime; return; }
            this._numTime = -1;
            const pt = this._popTime;
            const digits = [[0, 1, -11], [1, 10, -9], [2, 100, -7], [3, 1000, -5], [4, 10000, -3], [5, 100000, -1], [6, 1000000, 1]];
            for (const [i, p, off] of digits) if (damage >= (p === 1 ? 0 : p)) this.damageFile(this._nums[i], idiv(damage % (p * 10), p), pt + off);
        }
        window(text) {
            this._window = new Window_RrSbsDamage(this._x - 64, this._y - 22);
            this._window.popText(text);
            this._windowTime = 5;
            if (Sprite_RrSbsBattler.globalLayer) Sprite_RrSbsBattler.globalLayer.addChild(this._window);
        }
        damageFile(num, cw, dur) {
            num.visible = true;
            num.bitmap = VX.loadSystem(this._minus ? N01.RECOVER_GRAPHICS : N01.DAMAGE_GRAPHICS);
            this._numTime += 1;
            const apply = () => {
                const sx = idiv(num.bitmap.width, 10);
                num.srcRect(cw * sx, 0, sx, num.bitmap.height);
                num.x = this._x - (sx + N01.NUM_INTERBAL) * num._rrNumTime;
                num.rrApply();
            };
            num._rrNumTime = this._numTime;
            num.y = this._y;
            num.z = 2000 - this._numTime;
            if (num.bitmap.isReady()) apply(); else num.bitmap.addLoadListener(apply);
            this._duration = dur;
            if (this._window) {
                const sx = idiv(num.bitmap.width || 180, 10);
                const x = this._x - (sx + N01.NUM_INTERBAL) * this._numTime;
                this._window.x = N01.NON_DAMAGE_WINDOW ? x - this._window.width + 64 : x - this._window.width + 26;
                if (this._window.x < 0) this._window.x = 0;
            }
        }
        reset() {
            for (const s of this._nums) s.visible = false;
            this.disposeWindow();
        }
        dispose() {
            for (const s of this._nums) s.rrDispose();
            this.disposeWindow();
        }
    }
    mzGlobal('Sprite_RrSbsDamage', Sprite_RrSbsDamage);

    // ---- Spriteset_Battle (VX 040 with SBS) ------------------------------------------------------------
    const active = () => !!(VX.battleActive && VX.battleActive());
    const _battleFieldOffsetY = Spriteset_Battle.prototype.battleFieldOffsetY;
    Spriteset_Battle.prototype.battleFieldOffsetY = function() { return active() ? 0 : _battleFieldOffsetY.call(this); };
    const _createBattleField = Spriteset_Battle.prototype.createBattleField;
    Spriteset_Battle.prototype.createBattleField = function() {
        if (!active()) { _createBattleField.call(this); return; }
        this._battleField = new Sprite_RrZLayer();
        this._battleField.x = 0;
        this._battleField.y = 0;
        this._baseSprite.addChild(this._battleField);
        this._effectsContainer = this._battleField;
        // The battleback made before the field joins it, under everything (z -100) as VX's viewport held it.
        for (const s of [this._rrVxBack, this._rrVxFloor]) if (s) this._battleField.addChild(s);
    };
    const _createBackground = Spriteset_Battle.prototype.createBackground;
    Spriteset_Battle.prototype.createBackground = function() {
        if (!active()) { _createBackground.call(this); return; }
        this._backgroundSprite = new Sprite();
        this._baseSprite.addChild(this._backgroundSprite);
    };
    /** The map behind the battle at half brightness (Thrall's create_battleback) and the map's floor. */
    const FLOORS = { 1: 'Dirt', 2: 'Cave', 3: 'Cave', 7: 'Cave', 5: 'Tavern', 11: 'Carpet', 12: 'Carpet', 13: 'Cobblestone', 26: 'Road', 27: 'Road', 33: 'Church',
        50: 'Forest', 52: 'Forest', 68: 'Forest', 73: 'Dock', 4: 'Mountain', 75: 'Mountain', 76: 'Mountain', 10: 'Dark' };
    VX.FLOORS = FLOORS;
    const _createBattleback = Spriteset_Battle.prototype.createBattleback;
    Spriteset_Battle.prototype.createBattleback = function() {
        if (!active()) { _createBattleback.call(this); return; }
        const snap = SceneManager.backgroundBitmap();
        const back = new Sprite_RrVx(snap || null);
        back.opacity = 128;
        back.z = -100;
        if (snap) back.scale.set(Graphics.width / Math.max(1, snap.width), Graphics.height / Math.max(1, snap.height));
        // Scene_Base#snapshot_for_background blurs the snap once; the radial blur at angle 0 adds nothing.
        try { const blur = new PIXI.BlurFilter(); blur.blur = 1; back.filters = [blur]; } catch (_) {}
        back.update = function() { Sprite.prototype.update.call(this); };
        this._rrVxBack = back;
        const img = FLOORS[$gameMap.mapId()] || 'BattleFloor';
        const floor = new Sprite_RrVx(VX.loadSystem('Floors/' + img));
        floor.x = N01.FLOOR[0]; floor.y = N01.FLOOR[1]; floor.opacity = N01.FLOOR[2];
        floor.z = 1;
        // The floor takes the map's tint (the battle runs on a screen of its own: RR_VxCompat).
        const mapScreen = ($gameTemp && $gameTemp._rrMapScreen) || $gameScreen;
        const tone = $gameMap && mapScreen ? mapScreen.tone() : [0, 0, 0, 0];
        floor.rrTone = tone.slice();
        floor.update = function() { Sprite.prototype.update.call(this); this.rrApply(); };
        floor.rrApply();
        this._rrVxFloor = floor;
        this._back1Sprite = new Sprite();
        this._back2Sprite = new Sprite();
        // back attack: switch 2 (or a surprise) sets the troop's surprise; switch 58 a preemptive strike.
        VX.backAttack = N01.BACK_ATTACK_SWITCH.some(s => sw(s)) || (!!$gameTroop._rrSurprise && N01.BACK_ATTACK);
        if (VX.backAttack) { $gameTroop._rrSurprise = true; $gameTroop._rrPreemptive = false; }
        else if (sw(58)) { $gameTroop._rrSurprise = false; $gameTroop._rrPreemptive = true; }
        else { $gameTroop._rrSurprise = false; $gameTroop._rrPreemptive = false; }
    };
    const _updateBattleback = Spriteset_Battle.prototype.updateBattleback;
    Spriteset_Battle.prototype.updateBattleback = function() { if (!active()) _updateBattleback.call(this); };
    const _createEnemies = Spriteset_Battle.prototype.createEnemies;
    Spriteset_Battle.prototype.createEnemies = function() {
        if (!active()) { _createEnemies.call(this); return; }
        Sprite_RrSbsBattler._screenAnimations = [];
        this._enemySprites = [];
        $gameTroop.members().forEach((enemy, i) => {
            const s = new Sprite_RrSbsBattler(enemy, this._battleField);
            if (enemy.isHidden()) s.opacity = 0;
            this._battleField.addChild(s);
            this._enemySprites[i] = s;
        });
    };
    const _createActors = Spriteset_Battle.prototype.createActors;
    Spriteset_Battle.prototype.createActors = function() {
        if (!active()) { _createActors.call(this); return; }
        this._actorSprites = [];
        for (let i = 0; i < N01.MAX_MEMBER; i++) {
            const actor = $gameParty.members()[i] || null;
            const s = new Sprite_RrSbsBattler(actor, this._battleField);
            this._battleField.addChild(s);
            this._actorSprites.push(s);
            if (actor) { s.makeBattler(); s.firstAction(); }
        }
    };
    Spriteset_Battle.prototype.rrDisposeActors = function() {
        for (const s of this._actorSprites || []) s.rrDispose();
        this._actorSprites = [];
    };
    const _updateActors = Spriteset_Battle.prototype.updateActors;
    Spriteset_Battle.prototype.updateActors = function() {
        if (!active()) { _updateActors.call(this); return; }
        const members = $gameParty.members();
        for (let i = 0; i < this._actorSprites.length; i++) {
            if (VX.partyChange) { VX.partyChange = false; this.rrDisposeActors(); this.createActors(); return; }
            const s = this._actorSprites[i];
            const id = (b) => (b ? b.actorId() : 'nil');
            if (id(s.battler) !== id(members[i])) { this.rrDisposeActors(); this.createActors(); return; }
        }
    };
    // MZ's battle sprites update as children; the enemy sprites are created with their battlers.
    Spriteset_Battle.prototype.rrSprite = function(actor, index) { return actor ? this._actorSprites[index] : this._enemySprites[index]; };
    Spriteset_Battle.prototype.rrSetDamageAction = function(actor, index, action) { const s = this.rrSprite(actor, index); if (s) s.damageAction(action); };
    Spriteset_Battle.prototype.rrSetDamagePop = function(actor, index, damage) { const s = this.rrSprite(actor, index); if (s && s._damage) s.damagePop(damage); };
    Spriteset_Battle.prototype.rrStandby = function(actor, index) { const s = this.rrSprite(actor, index); if (s && s._made) s.pushStandBy(); };
    Spriteset_Battle.prototype.rrSetTarget = function(actor, index, target) { const s = this.rrSprite(actor, index); if (s) s.getTarget(target); };
    Spriteset_Battle.prototype.rrSetAction = function(actor, index, kind) { const s = this.rrSprite(actor, index); if (s && s._made) s.startAction(kind); };
    Spriteset_Battle.prototype.rrSetStandByAction = function(actor, index) { const s = this.rrSprite(actor, index); if (s && s._made) s.pushStandBy(); };
    Spriteset_Battle.prototype.rrSetCursor = function(actor, index) { const s = this.rrSprite(actor, index); return s ? [s.x, s.y] : [0, 0]; };
    Spriteset_Battle.prototype.rrAnimation = function() {
        return this._enemySprites.concat(this._actorSprites).some(s => s && s.isAnimationPlaying && s.isAnimationPlaying());
    };
    const _findTargetSprite = Spriteset_Battle.prototype.findTargetSprite;
    Spriteset_Battle.prototype.findTargetSprite = function(target) {
        if (!active()) return _findTargetSprite.call(this, target);
        return this._enemySprites.concat(this._actorSprites).find(s => s && s.battler === target);
    };
    const _isBusy = Spriteset_Battle.prototype.isBusy;
    Spriteset_Battle.prototype.isBusy = function() { return active() ? this.rrAnimation() : _isBusy.call(this); };
    const _isEffecting = Spriteset_Battle.prototype.isEffecting;
    Spriteset_Battle.prototype.isEffecting = function() { return active() ? false : _isEffecting.call(this); };
    const _isAnyoneMoving = Spriteset_Battle.prototype.isAnyoneMoving;
    Spriteset_Battle.prototype.isAnyoneMoving = function() { return active() ? false : _isAnyoneMoving.call(this); };
    const _battlerSprites = Spriteset_Battle.prototype.battlerSprites;
    Spriteset_Battle.prototype.battlerSprites = function() { return active() ? [] : _battlerSprites.call(this); };

    // Show Battle Animation and other MZ requests reach the VX animation of the battler they name.
    const _requestAnimation = Game_Temp.prototype.requestAnimation;
    Game_Temp.prototype.requestAnimation = function(targets, animationId, mirror = false) {
        if (active() && Array.isArray(targets) && targets.every(t => t instanceof Game_Battler)) {
            for (const t of targets) t.rrSetAnimationId(animationId, mirror);
            return;
        }
        _requestAnimation.call(this, targets, animationId, mirror);
    };
})();
