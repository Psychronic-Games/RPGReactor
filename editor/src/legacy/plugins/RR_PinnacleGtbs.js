/*:
 * @target MZ
 * @plugindesc GubiD's Tactical Battle System (VX Ace) as Pinnacle uses it: the battle rules, for imported games
 * @author GubiD (GTBS 1.5.1.4), Gallade, Zoro and the game's author; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_PinnacleGtbs.js
 *
 * The rules of the game's grid battles. Battles happen on the map the party
 * stands on: units stand on the map, move a number of tiles a turn (forest
 * and rubble cost more, fliers cross walls and water on the regions they
 * fly over), attack what their weapon reaches and use skills and items by
 * their ranges, the enemies and allied AI units deciding where to go and what
 * to do. Hits from behind do half again more, from the side a fifth more;
 * the terrain a unit stands on adds to its defence and evasion. Army units
 * (Preserve TP) count their size in levels: damage takes levels off, healing
 * gives them back, and their damage is multiplied by their level.
 *
 * The game's own changes to the battle rules come with it: its parameter
 * formula (base + growth + equipment + buffs, no multipliers), buffs as
 * points that fade one a turn, hit and evasion from the two units' luck and
 * agility, criticals that triple, levels every 100 experience with random
 * growth, progressive states (57, 62, 86), death common events, the
 * affection gauge, actor flags and gender.
 *
 * Settings come from the GTBS setup sections and the notes of the database
 * (range=, move=, view=, large=, fly = true, projectile=, tactic=, level=,
 * attack_skill=, knockback, prevent_wander …), read as GTBS read them.
 *
 * Script calls the events make (translated by the import):
 *   tbs_victory(type, value, common_event) / tbs_failure(...)
 *   tbs_override_map(id), force_player_turn, force_enemy_turn
 *   enable_tbs / disable_tbs, foe_team(team1, team2)
 *   switch_to_main_party / switch_to_troops_party   (Zoro's Army Switcher)
 *   SceneManager.scene.cursor_move(x, y), .update_screen, .set_character(...),
 *   .end_battle(result), .dispose_character(battler), .cursor_moveto(battler)
 *   battler.knock_back(dir), battler.can_occupy?([x, y]), battler.x / .y
 *
 * Kept as the game had them: a debuff of 2 or more on an enemy at turn end,
 * which stopped the original with an error, only fades by one; enemies have
 * no weapons for their range ("weapons" returned nothing), w_range notes
 * are not read (GTBS read "range="), and a skill's Ruby damage formula uses
 * these battler methods.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param config
 * @text Settings
 * @desc The GTBS settings, as JSON (read from the game's scripts by the import).
 * @default {}
 */
(() => {
    'use strict';
    const PARAMS = PluginManager.parameters('RR_PinnacleGtbs');
    let CONFIG = {};
    try { CONFIG = JSON.parse(PARAMS.config || '{}') || {}; } catch (_) { CONFIG = {}; }
    const G = CONFIG.gtbs || {};
    const V = CONFIG.vocab || {};
    const get = (name, fallback) => (G[name] === undefined || G[name] === null ? fallback : G[name]);
    const table = (name) => { if (!G[name] || typeof G[name] !== 'object') G[name] = {}; return G[name]; };
    const list = (name) => { if (!Array.isArray(G[name])) G[name] = []; return G[name]; };
    const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, String(key));

    //=========================================================================
    // Shared helpers (window.RRGtbs)
    //=========================================================================
    const text = (s) => (typeof s === 'string' && window.RRKeyedText ? window.RRKeyedText.resolve(s) : s);
    const sprintf = (format, ...args) => {
        let i = 0;
        return String(format).replace(/%(\d+\$)?([0-9]*)([sd%])/g, (m, pos, width, type) => {
            if (type === '%') return '%';
            const v = pos ? args[parseInt(pos, 10) - 1] : args[i++];
            let s = type === 'd' ? String(Math.trunc(Number(v) || 0)) : String(v);
            if (width) s = s.padStart(parseInt(width, 10), ' ');
            return s;
        });
    };
    const rand = (n) => (n === undefined ? Math.random() : Math.floor(Math.random() * n));
    const idiv = (a, b) => Math.floor(a / b);

    // H87's $game_settings (:anim, :statusmode, :language), read from the options port when it publishes
    // $gameSettings, else kept with the player's options.
    const SETTINGS_DEFAULTS = { anim: 0, statusmode: 0 };
    const setting = (key) => {
        const s = window.$gameSettings;
        if (s) {
            const v = typeof s.get === 'function' ? s.get(key) : s[key];
            if (v !== undefined && v !== null) return v;
        }
        if (key === 'language') return window.RRKeyedText && window.RRKeyedText.language && window.RRKeyedText.language() === 'Ita' ? 0 : 1;
        const own = ConfigManager['rrGtbs_' + key];
        return own === undefined ? SETTINGS_DEFAULTS[key] : own;
    };
    const setSetting = (key, value) => {
        const s = window.$gameSettings;
        if (s) {
            if (typeof s.set === 'function') s.set(key, value); else s[key] = value;
        }
        ConfigManager['rrGtbs_' + key] = value;
    };
    const _makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _makeData.call(this);
        config.rrGtbs_anim = this.rrGtbs_anim;
        config.rrGtbs_statusmode = this.rrGtbs_statusmode;
        return config;
    };
    const _applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _applyData.call(this, config);
        this.rrGtbs_anim = Number(config.rrGtbs_anim) || 0;
        this.rrGtbs_statusmode = Number(config.rrGtbs_statusmode) || 0;
    };
    const langSuffix = () => (setting('language') === 0 ? '-Ita' : '-Eng');
    // RGSS sized a font by its line: the project's font size stands for the game's Font.default_size.
    const fontPx = (size) => size * $gameSystem.mainFontSize() / (Number(CONFIG.fontDefaultSize) || 24);

    // RPG::UsableItem's scope and damage questions, on MZ records.
    const U = {
        isSkill: (it) => !!it && DataManager.isSkill(it),
        isItem: (it) => !!it && DataManager.isItem(it),
        isWeapon: (it) => !!it && DataManager.isWeapon(it),
        isArmor: (it) => !!it && DataManager.isArmor(it),
        forOpponent: (it) => [1, 2, 3, 4, 5, 6].includes(it.scope),
        forFriend: (it) => [7, 8, 9, 10, 11].includes(it.scope),
        forDeadFriend: (it) => [9, 10].includes(it.scope),
        forUser: (it) => it.scope === 11,
        forOne: (it) => [1, 3, 7, 9, 11].includes(it.scope),
        forRandom: (it) => [3, 4, 5, 6].includes(it.scope),
        forAll: (it) => [2, 8, 10].includes(it.scope) || it.scope === 12,
        physical: (it) => it.hitType === 1,
        magical: (it) => it.hitType === 2,
        none: (it) => !it.damage || it.damage.type === 0,
        toHp: (it) => [1, 3, 5].includes(it.damage.type),
        toMp: (it) => [2, 4, 6].includes(it.damage.type),
        recover: (it) => [3, 4].includes(it.damage.type),
        drain: (it) => [5, 6].includes(it.damage.type),
        battleOk: (it) => it.occasion === 0 || it.occasion === 1,
        // RPG::UsableItem::Damage#eval: [formula, 0].max * sign, 0 when it raises.
        evalDamage(item, a, b) {
            try {
                const v = $gameVariables._data; // eslint-disable-line no-unused-vars
                const sign = U.recover(item) ? -1 : 1;
                const value = Math.max(eval(item.damage.formula), 0) * sign;
                return Number.isFinite(value) ? value : 0;
            } catch (_) { return 0; }
        }
    };

    /** The current GTBS battle scene, or null. Matched by name: scenes are wrapped at startup. */
    const tbsScene = () => {
        const s = SceneManager._scene;
        return s && s.constructor && s.constructor.name === 'Scene_Battle_TBS' ? s : null;
    };
    const inTbs = () => !!tbsScene();

    const RRGtbs = window.RRGtbs = Object.assign(window.RRGtbs || {}, {
        config: CONFIG, G, V, U, text, sprintf, rand, setting, setSetting, langSuffix, fontPx, scene: tbsScene, inBattle: inTbs,
        get: get
    });

    //=========================================================================
    // GTBS module (setup section lookups)
    //=========================================================================
    /** GTBS's lookups pad the stored array in place and return it: what callers change, stays. */
    const padded = (range, defaults) => { for (let i = range.length; i < defaults.length; i++) range.push(defaults[i]); return range; };
    const GT = RRGtbs.GT = {
        moveRange: (classId) => table('CLASS_MOVE_RANGE')[classId] ?? get('DEFAULT_CLASS_Move', 4),
        enemyMove: (enemyId) => table('Enemy_Move')[enemyId] ?? get('Default_Enemy_Move', 4),
        weaponRange(id) {
            const t = table('WEAPON_RANGE');
            return t[id] ? padded(t[id], list('DEFAULT_Weapon_Range')) : list('DEFAULT_Weapon_Range');
        },
        monsterRange(id) {
            const t = table('Enemy_Weapon_Range');
            return t[id] ? padded(t[id], list('DEFAULT_Monster_Range')) : list('DEFAULT_Monster_Range');
        },
        skillRange(id) {
            const t = table('SKILL_RANGE');
            return t[id] ? padded(t[id], list('DEFAULT_Skill_Range')) : list('DEFAULT_Skill_Range');
        },
        itemRange(id) {
            const t = table('ITEM_RANGE');
            return t[id] ? padded(t[id], list('DEFAULT_Item_Range')) : list('DEFAULT_Item_Range');
        },
        equipSkillRangeModification(id, type = 0) {
            const t = table(type === 0 ? 'Equip_Skill_Range' : 'Weapon_Skill_Range');
            return t[id] ? padded(t[id], list('DEFAULT_Skill_Range_Mod')) : list('DEFAULT_Skill_Range_Mod');
        },
        stateSkillRangeModification(id) {
            const t = table('STATE_SKILL_RANGE');
            return t[id] ? padded(t[id], list('DEFAULT_Skill_Range_Mod')) : list('DEFAULT_Skill_Range_Mod');
        },
        equipMoveInfo: (id) => table('EQUIP_Move_Info')[id] ?? 0,
        weaponMoveInfo: (id) => table('WEAPON_Move_Info')[id] ?? 0,
        stateMoveInfo: (id) => table('STATE_Move_Info')[id] ?? 0,
        skillWait: (id) => table('SKILL_WAIT_TIME')[id] ?? list('DEFAULT_Skill_Wait'),
        skillUseAction: (id) => table('SKILL_USE_ACTION')[id] || get('DEFAULT_Skill_Usage', true),
        skillRating: (id) => table('SKILL_AI_RATING')[id] ?? get('DEFAULT_Skill_Rating', 1),
        isSummon(skillId, forActor) {
            if (!$dataSkills[skillId]) return 0;
            const s = table(forActor ? 'SKILL_TO_ACTOR_SUMMON' : 'SKILL_TO_ENEMY_SUMMON')[skillId];
            return s || 0;
        },
        summonInstanceCount: (id) => table('SUMMON_INSTANCES_ALLOWED')[id] ?? 1,
        skillHasProjectile(id) { const t = table('SKILL_PROJECTILE'); return has(t, id) ? (t[id] === 'arched' ? 'arched' : 'normal') : null; },
        weaponHasProjectile(id) { const t = table('WEAPON_PROJECTILE'); return has(t, id) ? (t[id] === 'arched' ? 'arched' : 'normal') : null; },
        enemyHasProjectile(id) { const t = table('En_Atk_Projectile'); return has(t, id) ? (t[id] === 'arched' ? 'arched' : 'normal') : null; },
        skillIgnoreDmgDir: (id) => list('Skill_Ignore_DirectionalDmg').includes(id),
        stateTactic: (id) => table('State_Modify_Tactic')[id] || '',
        anchorDirForWep: (id) => table('WEAPON_ANCHOR_DIR')[id] || 3,
        deathAnimActor: (id) => table('DEATH_ANIMATION_ACTOR')[id] ?? 0,
        deathAnimEnemy: (id) => table('DEATH_ANIMATION_ENEMY')[id] ?? 0,
        actTraverse: (id) => table('ActorTraverseType')[id] || 0,
        enTraverse: (id) => table('EnemyTraverseType')[id] || 0,
        viewRange(id, isActor = false) {
            return isActor ? (table('CLASS_VIEW_RANGE')[id] ?? get('DEFAULT_VIEW_RANGE', 8)) : (table('ENEMY_VIEW_RANGE')[id] ?? get('DEFAULT_VIEW_RANGE', 8));
        },
        doomTurn: (actorId) => table('DOOM_SUMMON_TURN')[actorId] ?? Math.max(2, rand(8)),
        captureToActor: (id) => table('CAPTURE_TO_ACTOR')[id] ?? 0,
        skillHasCapture: (id) => list('Capture_Skill_List').includes(id),
        skillHasCharm: (id) => has(table('Charm_Skill_List'), id),
        charmTurns: (id) => table('Charm_Skill_List')[id] || get('DEFAULT_CHARM_TIME', 2),
        skillHasInvite: (id) => list('Invite_Skill_List').includes(id),
        preventInvite: (id, isEnemy) => (isEnemy ? list('Cannot_Invite_Enemies') : list('Cannot_Invite_Actors')).includes(id),
        skillHasSecretHunt: (id) => list('Secret_Hunt_Skill_List').includes(id),
        secretHuntResult: (id) => table('Secret_Hunt_Results')[id] ?? list('DEFAULT_Secret_Hunt_Result'),
        actionSkills: (id) => (G.ACTION_SKILLS || {})[id] || [],
        animeAnimationData(skillId) {
            let actList = this.actionSkills(skillId);
            if (!actList.length) {
                const skill = $dataSkills[skillId];
                actList = (table('SKILL_CATEGORY_DEFAULT_ACTION_LIST')[skill ? skill.stypeId : 0]) || list('DEFAULT_ACTION_LIST_SKILL');
            }
            return actList;
        },
        animeItemData: () => table('SKILL_CATEGORY_DEFAULT_ACTION_LIST')[2] || [],
        actorPhaseMusic() {
            const battleBgm = $gameSystem.battleBgm();
            return (battleBgm && battleBgm.name) || table('ACTOR_TURN_MUSIC')[$gameMap.mapId()] || get('DEF_ACTOR_MUSIC', '');
        },
        enemyPhaseMusic: () => table('ENEMY_TURN_MUSIC')[$gameMap.mapId()] || get('DEF_ENEMY_MUSIC', ''),
        placingMusic: () => CONFIG.placingMusic || '',
        sideMusic(mapId) {
            return { name: table('Map_SideView_Music')[mapId] || '', volume: table('Map_SideView_Music_Vol')[mapId] || 100, pitch: 100, pan: 0 };
        },
        battleMap: (mapId) => table('CALL_ALTERNATE_MAP')[mapId] || mapId,
        battleExitInfo: (mapId) => table('MAP_EXIT_INFO')[mapId] || false,
        checkDeathAction: () => null
    };

    //=========================================================================
    // Easy Config: settings written in the database notes (as GTBS read them:
    // spaces and tabs taken out, one setting a line, the first rule that
    // matches the line wins)
    //=========================================================================
    const rubyEval = (s) => {
        // The settings are arrays of numbers and true/false, or single numbers.
        try { return JSON.parse(String(s).replace(/\s+/g, '')); } catch (_) { const n = Number(s); return Number.isFinite(n) ? n : s; }
    };
    function easyConfig(records, rules) {
        for (let i = 1; i < records.length; i++) {
            const r = records[i];
            if (!r || !r.note) continue;
            const note = String(r.note).replace(/[ \t\r\f]/g, '');
            for (const line of note.split('\n')) {
                for (const [name, re, kind] of rules) {
                    const m = re.exec(line);
                    if (!m) continue;
                    const v = m[1];
                    if (kind === 2) { const t = list(name); if (!t.includes(i)) { t.push(i); t.sort((a, b) => a - b); } }
                    else if (kind === 1) table(name)[i] = v;
                    else if (kind === 8) table(name)[i] = rubyEval('[' + v + ']');
                    else if (kind === 0) table(name)[i] = true;
                    else table(name)[i] = rubyEval(v);
                    break;
                }
            }
        }
    }
    const EASY = {
        skills: [
            ['SKILL_RANGE', /^range\s*=(\[\s*\d+\s*,\s*\d+\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*\d+\s*(,\s*\d+\s*,\s*\d+)?\s*\])/i],
            ['SKILL_AI_RATING', /^ai_rating\s*=\s*(\d+)/i], ['SKILL_USE_ACTION', /^use_action\s*=\s*(true|false)/i],
            ['SKILL_WAIT_TIME', /^skill_wait\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*(true|false)\s*\])/i],
            ['SKILL_TO_ACTOR_SUMMON', /^actor\s*=\s*(\d+)/i], ['SKILL_TO_ENEMY_SUMMON', /^enemy\s*=\s*(\d+)/i],
            ['Secret_Hunt_Skill_List', /(^secret_hunt)/i, 2], ['Capture_Skill_List', /(^capture)/i, 2], ['Charm_Skill_List', /^charm_turns\s*=\s*(\d+)/i],
            ['Invite_Skill_List', /(^invite)/i, 2], ['CHAIN_LIGHTNING_SKILLS', /(^chain_lighting)/i, 2], ['SKILL_PROJECTILE', /^projectile\s*=\s*(.+)/i, 1],
            ['PREVENT_SKILL_FRIENDLY_DMG', /(^prevent_friendly_dmg)/i, 2], ['TARGET_FIENDLY_ONLY_SKILLS', /(^friendly_only)/i, 2],
            ['Prevent_Skill_Range_Mod', /(^prevent_range_mod)/i, 2], ['Skill_Ignore_DirectionalDmg', /(^ignore_dir)/i, 2],
            ['Reset_Action_Flag_Skills', /(^reset_action)/i, 2], ['Reset_Move_Flag_Skills', /(^reset_move)/i, 2]
        ],
        items: [['ITEM_RANGE', /^range\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*\d+\s*,\s*\d+\s*)?\])/i]],
        weapons: [
            ['WEAPON_RANGE', /^range\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*\d+\s*(,\s*\d+\s*,\s*\d+\s*)?\])/i],
            ['WEAPON_Move_Info', /^move\s*=\s*([\s*-*\d\s*]+)/i], ['Weapon_Skill_Range', /^skill_range\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*\d+\s*,\s*\d+\s*)?\])/i],
            ['CHAIN_LIGHTNING_WEAPONS', /(^chain_lighting)/i, 2], ['WEAPON_PROJECTILE', /^projectile\s*=\s*(.+)/i, 1],
            ['WeaponCausesFlight', /^fly\s*=\s*(true)/i, 2], ['WalkOnWater_Weapons', /(^walk_on_water)/i, 2],
            ['WEAPON_ANCHOR_DIR', /^(?:anchor|origin)\s*=\s*(\d)/i], ['WEAPON_ATTACK_SKILL_ID', /^attack_skill\s*=\s*(\d+)/i]
        ],
        armors: [
            ['EQUIP_Move_Info', /^move\s*=\s*(-*\d+)/i], ['Equip_Skill_Range', /^skill_range\s*=\s*(\[\s*\d+\s*,\s*\d+v,\s*\d+\s*(,\s*\d+\s*,\s*\d+\s*)?\])/i],
            ['EquipCausesFlight', /^fly\s*=\s*(true)/i, 2], ['WalkOnWater_Armors', /(^walk_on_water)/i, 2]
        ],
        enemies: [
            ['Enemy_Move', /^move\s*=\s*(\d+)/i], ['Enemy_Classes', /^class*\s*=\s*(.+)/i, 1], ['Enemy_Levels', /^le*ve*l\s*=\s*(\d+)/i],
            ['Enemy_State_Add', /^state_add\s*=\s*(\[\s*[\s*\d\s*,\s*]\s*\])/i], ['En_large_units', /^large\s*=\s*(\d+)/i],
            ['Enemy_Weapon_Range', /^range\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*\d+\s*(,\s*\d+\s*,\s*\d+\s*)?\])/i],
            ['Unknown_HP_MP', /(^unknown_hp)/i, 2], ['Enemy_Face', /^face_name\s*=\s*(.+)/i, 1], ['Enemy_Face_Index', /^face_index=(\d)/i],
            ['EN_Descriptions', /^description\s*=\s*(.+)/i, 1], ['AI_Tactic', /^tactic\s*=\s*(.+)/i, 1],
            ['Secret_Hunt_Results', /^hunt_results\s*=\s*(\[\s*(\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*],?)+\])/i],
            ['SUMMON_ENID', /(^summon)/i, 2], ['CAPTURE_TO_ACTOR', /^actor\s*=\s*(\d+)/i], ['DEATH_ANIMATION_ENEMY', /^death_anim\s*=\s*(\d+)/i],
            ['ENEMY_VIEW_RANGE', /^view\s*=\s*(\d+)/i], ['En_Atk_Projectile', /^projectile\s*=\s*(.+)/i, 1], ['PREVENT_EN_WANDER', /(^prevent_wander)/i, 2],
            ['Enemy_Weapon', /^weapons\s*=\s*((\d+,?)+)/i, 8], ['EnemyTraverseType', /^traverse\s*=\s*(\d+)/i], ['Cannot_Invite_Enemies', /(^no_invite)/i, 2],
            ['EnemiesWhoFly', /^fly\s*=\s*(true)/i, 2], ['EnemiesWithWalkOnWater', /(^walk_on_water)/i, 2], ['Prevent_Enemy_Mini', /(^no_mini)/i, 2]
        ],
        states: [
            ['STATE_Move_Info', /^move\s*=\s*(-*\d+)/i], ['STATE_SKILL_RANGE', /^skill_range\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*\d+\s*,\s*\d+\s*)?\])/i],
            ['STATE_RATE_EFFECT', /^effect\s*=\s*(-*\d+)/i], ['KNOCK_BACK_STATES', /(^knockback)/i, 2], ['STATE_PUSH_INFO', /^knock_move\s*=\s*(-*\d+)/i],
            ['STATE_VIEW_INFO', /^view\s*=\s*(-*\d+)/i], ['State_Modify_Tactic', /^tactic\s*=\s*(.+)/i, 1], ['StateCausesFlight', /^fly\s*=\s*(true)/i, 2],
            ['WalkOnWater_States', /(^walk_on_water)/i, 2]
        ],
        actors: [
            ['CONTROLABLE_SUMMONS', /(^controllable)/i, 2], ['ACTOR_SUMMONS', /(^summon)/i, 2], ['SUMMON_INSTANCES_ALLOWED', /^allowed\s*=\s*(\d+)/i],
            ['Act_large_units', /^large\s*=\s*(\d+)/i], ['DOOM_SUMMON_TURN', /^doom_turn\s*=\s*(\d+)/i], ['DEATH_ANIMATION_ACTOR', /^death_anim\s*=\s*(\d+)/i],
            ['Actor_AI', /^tactic\s*=\s*(.+)/i, 1], ['PREVENT_ACT_WANDER', /(^prevent_wander)/i, 2], ['ActorTraverseType', /^traverse\s*=\s*(\d+)/i],
            ['Cannot_Invite_Actors', /(^no_invite)/i, 2], ['Prevent_Actor_Leave_List', /(^prevent_leave)/i, 2], ['Prevent_Actor_Mini', /(^no_mini)/i, 2]
        ],
        classes: [['CLASS_MOVE_RANGE', /^move\s*=\s*(\d+)/i], ['CLASS_VIEW_RANGE', /^view\s*=\s*(\d+)/i]]
    };
    // STATE_RATE_EFFECT is a hash GTBS creates inside the rule itself.
    table('STATE_RATE_EFFECT');
    function readActionLists(records, name) {
        const out = G[name] = G[name] && typeof G[name] === 'object' ? G[name] : {};
        for (let i = 1; i < records.length; i++) {
            out[i] = [];
            const r = records[i];
            if (!r || !r.note) continue;
            let defining = false;
            for (const line of String(r.note).replace(/[\t\r\f]/g, '').split('\n')) {
                if (/^<ACTION_LIST>/i.test(line)) { defining = true; continue; }
                if (/^<\/ACTION_LIST>/i.test(line)) { defining = false; continue; }
                if (!defining) continue;
                let m = /^\s*([A-Z]*)\s*([A-Z]*):\s*(.+)/i.exec(line);
                if (m) { out[i].push([m[1], m[2], m[3].match(/[^, ]+[^,]*/gi) || []]); continue; }
                m = /^\s([A-Z]*)\s*:\s*(.+)/i.exec(line);
                if (m) out[i].push([m[1], m[2], []]);
            }
        }
    }
    let _configRead = false;
    function readDatabaseConfig() {
        if (_configRead || !$dataSkills || !$dataItems || !$dataWeapons || !$dataArmors || !$dataEnemies || !$dataStates || !$dataActors || !$dataClasses || !$dataTroops) return;
        _configRead = true;
        readActionLists($dataSkills, 'ACTION_SKILLS');
        readActionLists($dataItems, 'ACTION_ITEMS');
        readActionLists($dataWeapons, 'ACTION_WEAPONS');
        easyConfig($dataSkills, EASY.skills);
        easyConfig($dataItems, EASY.items);
        easyConfig($dataWeapons, EASY.weapons);
        easyConfig($dataArmors, EASY.armors);
        easyConfig($dataEnemies, EASY.enemies);
        easyConfig($dataStates, EASY.states);
        easyConfig($dataActors, EASY.actors);
        easyConfig($dataClasses, EASY.classes);
        // Troops: their pages' comments are the note.
        for (let i = 1; i < $dataTroops.length; i++) {
            const t = $dataTroops[i];
            if (!t) continue;
            const note = [];
            for (const page of t.pages || []) for (const c of page.list || []) if (c.code === 108 || c.code === 408) note.push(c.parameters[0]);
            const m = /^extra_enemies\s*=\s*(\[((\s*\d+\s*),?)+\])/im.exec(note.join('\n').replace(/[ \t\r\f]/g, ''));
            if (m) table('Extra_Troops')[i] = rubyEval(m[1]);
        }
    }
    const MAP_EASY = [
        ['CALL_ALTERNATE_MAP', /^battle_on\s*=\s*(\d+)/i], ['MAP_EXIT_INFO', /^exit_info\s*=\s*(\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\])/i],
        ['MAP_Region_Transfer', /^bat_region\s*(\d+)\s*=\s*(\d+)/i, 6], ['Battleback_Region', /^backdrop\[\s*(\d+)\s*\]\s*=\s*(.+)/i, 5],
        ['BackDrop_MAP_Default', /^default_back\s*=\s*(.+)/i, 1], ['Map_SideView_Music', /^side_music\s*=\s*(.+)/i, 1],
        ['Map_SideView_Music_Vol', /^side_vol\s*=\s*(\d+)/i], ['ACTOR_TURN_MUSIC', /^act_music\s*=\s*(.+)/i, 1], ['ENEMY_TURN_MUSIC', /^en_music\s*=\s*(.+)/i, 1]
    ];
    function readMapConfig(mapId, map) {
        if (!map || !map.note) return;
        const note = String(map.note).replace(/[ \t\r\f]/g, '');
        for (const line of note.split('\n')) {
            for (const [name, re, kind] of MAP_EASY) {
                const m = re.exec(line);
                if (!m) continue;
                if (kind === 6) { (table(name)[mapId] = table(name)[mapId] || {})[Number(m[1])] = Number(m[2]); }
                else if (kind === 5) { (table(name)[mapId] = table(name)[mapId] || {})[Number(m[1])] = m[2]; }
                else if (kind === 1) table(name)[mapId] = m[1];
                else table(name)[mapId] = rubyEval(m[1]);
                break;
            }
        }
    }
    let _loadingMapId = 0;
    const _loadMapData = DataManager.loadMapData;
    DataManager.loadMapData = function(mapId) {
        _loadingMapId = mapId;
        _loadMapData.call(this, mapId);
    };
    const _onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _onLoad.call(this, object);
        if (object === window.$dataMap && _loadingMapId > 0) readMapConfig(_loadingMapId, object);
        else readDatabaseConfig();
    };

    //=========================================================================
    // The game's Troop module and Gallade's Terrain Effects
    //=========================================================================
    const TROOP = CONFIG.troop || { data: {}, nameflag: [], factions: {} };
    if (!window.RRPinnacleTroop) {
        window.RRPinnacleTroop = {
            troopData: () => TROOP.data || {},
            troopNameflag: () => TROOP.nameflag || [],
            factionNames: () => TROOP.factions || {}
        };
    }
    const TERRAIN = CONFIG.terrain || { names: {}, def: {}, eva: {} };
    RRGtbs.terrain = {
        name: (region) => (TERRAIN.names || {})[region],
        def: (region) => (TERRAIN.def || {})[region],
        eva: (region) => (TERRAIN.eva || {})[region]
    };
    // "rescue 0": a region with no entry is nil, and nil * mult raised.
    const terrainValue = (kind, region) => { const v = (TERRAIN[kind] || {})[region]; return typeof v === 'number' ? v : 0; };

    //=========================================================================
    // Game_Temp / Game_System / Game_Party / Game_Troop additions
    //=========================================================================
    const _tempInit = Game_Temp.prototype.initialize;
    Game_Temp.prototype.initialize = function() {
        _tempInit.call(this);
        this.rrGtbsReset();
    };
    Game_Temp.prototype.rrGtbsReset = function() {
        this._tbsVictory = { condition: null, val: null, common: null };
        this._tbsFailure = { condition: null, val: null, common: null };
        this._tbsMapId = null;
        this._tbsTurnStart = null;
        this._tbsFoeData = null;
        this._tbsOpenSceneEventId = null;
        this.pathfinderLocations = [];
    };
    Object.defineProperty(Game_Temp.prototype, 'pathfinderLocations', {
        get() { return this._rrPathfinder || (this._rrPathfinder = []); },
        set(v) { this._rrPathfinder = v; },
        configurable: true
    });
    const pathfinderIncludes = (x, y) => $gameTemp.pathfinderLocations.some(p => p && p[0] === x && p[1] === y);

    const _sysInit = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        this.rrResetGtbsConfig();
        this._tbsActed = [];
        this._tbsBattleEvents = {};
        this._tbsEnabled = true;
        _sysInit.call(this);
    };
    Game_System.prototype.rrResetGtbsConfig = function() {
        if (!($gameParty && $gameParty.inBattle())) this._tbsCustBattle = get('MODE', 1) === 0 ? 'ATB' : 'TEAM';
        this._tbsScrollCursor = true;
        this._tbsMoveColor = 'BLUE';
        this._tbsHelpSkillColor = 'GREEN';
        this._tbsAttackSkillColor = 'RED';
        this._tbsAttackColor = 'RED';
    };
    Game_System.prototype.tbsEnabled = function() { return this._tbsEnabled !== false; };
    Game_System.prototype.tbsCustBattle = function() { return this._tbsCustBattle || 'TEAM'; };
    Game_System.prototype.tbsTeamMode = function() { return this.tbsCustBattle() === 'TEAM'; };
    Game_System.prototype.tbsActed = function() { return this._tbsActed || (this._tbsActed = []); };
    Game_System.prototype.tbsBattleEvents = function() { return this._tbsBattleEvents || (this._tbsBattleEvents = {}); };
    Game_System.prototype.tbsClearBattlers = function() { this.tbsActed().length = 0; this._tbsBattleEvents = {}; };
    Game_System.prototype.tbsTacticalEvents = function() {
        const scene = tbsScene();
        return (scene ? scene.tacticsAlive() : []).concat(Object.values(this.tbsBattleEvents()));
    };
    Game_System.prototype.tbsActorsBodies = function() { return get('REMOVE_DEAD', 2) !== 2; };
    Game_System.prototype.tbsNeutralsBodies = function() { return get('REMOVE_DEAD', 2) !== 2; };
    Game_System.prototype.tbsEnemiesBodies = function() { return get('REMOVE_DEAD', 2) === 0; };
    Game_System.prototype.tbsColor = function(kind) {
        const name = { move: this._tbsMoveColor, help: this._tbsHelpSkillColor, attackSkill: this._tbsAttackSkillColor, attack: this._tbsAttackColor }[kind] || 'RED';
        return { name, color: (CONFIG.colors || {})[name] || [255, 0, 0, 255] };
    };

    // Game_Unit: summoned units, dead units still in battle.
    const _unitInit = Game_Unit.prototype.initialize;
    Game_Unit.prototype.initialize = function() {
        _unitInit.call(this);
        this._tbsSummoned = [];
    };
    Game_Unit.prototype.tbsSummoned = function() { return this._tbsSummoned || (this._tbsSummoned = []); };
    Game_Unit.prototype.tbsClearSummons = function() { this.tbsSummoned().length = 0; };
    Game_Unit.prototype.tbsCleanUpSummoned = function() { this._tbsSummoned = this.tbsSummoned().filter(m => !m.isDeathStateAffected()); };
    /** GTBS existing_members: everyone shown, from all members (not only the battle members), and the summoned. */
    Game_Unit.prototype.tbsExistingMembers = function() {
        this.tbsCleanUpSummoned();
        return this.tbsAllMembers().filter(m => m.isAppeared()).concat(this.tbsSummoned());
    };
    Game_Unit.prototype.tbsDeadMembers = function() {
        return this.tbsAllMembers().filter(m => m.isDeathStateAffected() && m._tbsBattler);
    };
    Game_Troop.prototype.tbsAllMembers = function() { return this.members(); };
    Game_Party.prototype.tbsAllMembers = function() { return this.allMembers(); };

    // Game_Troop: GTBS extra enemies, members added in battle, map battle events through the troop interpreter.
    const _troopSetup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _troopSetup.call(this, troopId);
        for (const enemyId of (table('Extra_Troops')[troopId] || [])) {
            if ($dataEnemies[enemyId]) this._enemies.push(new Game_Enemy(enemyId, 0, 0));
        }
    };
    Game_Troop.prototype.troopId = function() { return this._troopId; };
    Game_Troop.prototype.tbsAddSummon = function(enemyId) {
        if (!$dataEnemies[enemyId]) return null;
        const summon = new Game_Enemy(enemyId, 0, 0);
        summon.appear();
        this.tbsSummoned().push(summon);
        return summon;
    };
    Game_Troop.prototype.tbsAddMember = function(enemyId) {
        if (!$dataEnemies[enemyId]) return null;
        const en = new Game_Enemy(enemyId, 0, 0);
        en.appear();
        this._enemies.push(en);
        return en;
    };
    const _setupBattleEvent = Game_Troop.prototype.setupBattleEvent;
    Game_Troop.prototype.setupBattleEvent = function() {
        _setupBattleEvent.call(this);
        if (!inTbs()) return;
        const event = Object.values($gameSystem.tbsBattleEvents()).find(e => e._starting);
        if (event) {
            event.clearStartingFlag();
            this._interpreter.setup(event.list(), event.eventId());
        }
    };
    // Game_Troop#on_battle_end (the game's): the battle's score in variables 6–9.
    const _troopBattleEnd = Game_Troop.prototype.onBattleEnd;
    Game_Troop.prototype.onBattleEnd = function() {
        if (_troopBattleEnd) _troopBattleEnd.call(this);
        if (!($gameVariables.value(10) > 0)) return;
        const actors = $gameVariables.value(11);
        let maxmp = 0, totmp = 0;
        const remainingGold = Math.max(this.goldTotal() - RRGtbs.party.consumed(), $gameVariables.value(10) * 25);
        const goldPar = Math.max(this.goldTotal(), 1);
        for (const actor of (Array.isArray(actors) ? actors : [])) { maxmp += actor.mmp; totmp += actor.mp; }
        $gameVariables.setValue(6, idiv(Math.min(idiv(totmp * 120, maxmp), 100) + Math.min(idiv(remainingGold * 100, goldPar), 100), 2));
        $gameVariables.setValue(7, Math.max(100 - $gameParty.deadMembers().length * 20, 0));
        $gameVariables.setValue(8, Math.min(idiv(this.deadMembers().length * 50, this.turnCount() + 1), 100));
        $gameVariables.setValue(9, idiv($gameVariables.value(6) + $gameVariables.value(7) + $gameVariables.value(8), 3));
    };
    Game_Troop.prototype.onBattleStart = function() {
        for (const m of this.members()) m.onBattleStart();
    };

    // Game_Party: neutrals, placement limit, the game's battle-side edits.
    Game_Party.prototype.tbsNeutrals = function() { return this._tbsNeutrals || (this._tbsNeutrals = []); };
    Game_Party.prototype.tbsClearNeutrals = function() { this.tbsNeutrals().length = 0; };
    Game_Party.prototype.tbsAddNeutral = function(actorId) {
        const actor = $gameActors.actor(actorId);
        if (actor) {
            actor._tbsNeutral = true;
            actor._tbsOriginallyNeutral = true;
            this.tbsNeutrals().push(actor);
        }
        return actor;
    };
    Game_Party.prototype.tbsAddSummon = function(actorId) {
        if (!$dataActors[actorId]) return null;
        const summon = get('SUMMON_GAIN_EXP', true) ? $gameActors.actor(actorId) : new Game_Actor(actorId);
        summon.appear();
        this.tbsSummoned().push(summon);
        return summon;
    };
    Game_Party.prototype.tbsPlacable = function() {
        if (this._tbsMaxPlace != null) return this._tbsMaxPlace;
        return this.allMembers().filter(m => !m.isDead()).length;
    };
    Game_Party.prototype.tbsClearPositions = function() { for (const actor of this.allMembers()) actor.tbsClearTbsPos(); };
    // The army's mode and the members set aside (Zoro's Army Switcher): kept by the kingdom port when it is
    // on (rrPartyMode / rrSavedParty / rrSavedTroops), else here.
    const party = RRGtbs.party = {
        mode: () => ($gameParty.rrPartyMode ? $gameParty.rrPartyMode() : ($gameParty._tbsPartyMode ?? null)),
        setMode: (v) => ($gameParty.rrSetPartyMode ? $gameParty.rrSetPartyMode(v) : ($gameParty._tbsPartyMode = v)),
        saved: () => ($gameParty.rrSavedParty ? $gameParty.rrSavedParty() : ($gameParty._tbsSavedParty || ($gameParty._tbsSavedParty = []))),
        setSaved: (ids) => ($gameParty.rrSetSavedParty ? $gameParty.rrSetSavedParty(ids) : ($gameParty._tbsSavedParty = ids.slice())),
        troops: () => ($gameParty.rrSavedTroops ? $gameParty.rrSavedTroops() : ($gameParty._tbsSavedTroops || ($gameParty._tbsSavedTroops = []))),
        setTroops: (ids) => ($gameParty.rrSetSavedTroops ? $gameParty.rrSetSavedTroops(ids) : ($gameParty._tbsSavedTroops = ids.slice())),
        consumed: () => ($gameParty.rrConsumedItemValue ? $gameParty.rrConsumedItemValue() : ($gameParty._tbsConsumed || 0)),
        setConsumed: (v) => ($gameParty.rrSetConsumedItemValue ? $gameParty.rrSetConsumedItemValue(v) : ($gameParty._tbsConsumed = v)),
        flag: () => ($gameParty.rrFlag ? $gameParty.rrFlag() : 'Player1'),
        troopTable: () => window.RRPinnacleKingdom || window.RRPinnacleTroop
    };
    const _gainItem = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
        if (typeof item === 'number') item = $dataItems[item];
        if (item == null) return;
        _gainItem.call(this, item, amount, includeEquip);
    };
    // Game_Unit#on_battle_start (the game's): the battle's tally of item prices starts over.
    const _partyBattleStart = Game_Party.prototype.onBattleStart;
    Game_Party.prototype.onBattleStart = function(advantageous) {
        _partyBattleStart.call(this, advantageous);
        party.setConsumed(0);
    };

    //=========================================================================
    // Game_ActionResult: GTBS/VE additions
    //=========================================================================
    const _resultClear = Game_ActionResult.prototype.clear;
    Game_ActionResult.prototype.clear = function() {
        _resultClear.call(this);
        this.expGainAmt = '';
        this.doom = '';
        // Ace's drains (MZ's hpDrain/mpDrain mean something else here).
        this.rrHpDrain = 0;
        this.rrMpDrain = 0;
        this.resist = null;
        this.tpDrain = 0;
    };
    // Game_ActionResult#make_damage (Ace).
    const makeDamage = (result, battler, value, item) => {
        if (value === 0) result.critical = false;
        if (U.toHp(item)) result.hpDamage = value;
        if (U.toMp(item)) result.mpDamage = value;
        result.mpDamage = Math.min(battler.mp, result.mpDamage);
        if (U.drain(item)) { result.rrHpDrain = result.hpDamage; result.rrMpDrain = result.mpDamage; }
        result.rrHpDrain = Math.min(battler.hp, result.rrHpDrain);
        if (U.toHp(item) || result.mpDamage !== 0) result.success = true;
    };
    RRGtbs.makeDamage = makeDamage;

    //=========================================================================
    // Game_BattlerBase: the game's edits (parameters, buffs, usability)
    //=========================================================================
    Game_BattlerBase.ICON_BUFF_START = 64;
    Game_BattlerBase.ICON_DEBUFF_START = 80;
    const _clearBuffs = Game_BattlerBase.prototype.clearBuffs;
    Game_BattlerBase.prototype.clearBuffs = function() {
        _clearBuffs.call(this);
        this._permabuffs = [0, 0, 0, 0, 0, 0, 0, 0];
    };
    Game_BattlerBase.prototype.buffIconIndex = function(buffLevel, paramId) {
        if (buffLevel > 0) return Game_BattlerBase.ICON_BUFF_START + paramId;
        if (buffLevel < 0) return Game_BattlerBase.ICON_DEBUFF_START + paramId;
        return 0;
    };
    Game_BattlerBase.prototype.stateTurnNumbers = function() {
        return this.states().filter(s => s.iconIndex !== 0).map(s => this._stateTurns[s.id]);
    };
    Game_BattlerBase.prototype.paramEquips = function() { return 0; };
    Game_BattlerBase.prototype.paramBuffRate = function(paramId) { return this._buffs[paramId]; };
    // Ace's minimums: MMP 0, everything else 1.
    Game_BattlerBase.prototype.paramMin = function(paramId) { return paramId === 1 ? 0 : 1; };
    Game_BattlerBase.prototype.paramMax = function(paramId) { return paramId === 0 ? 999999 : paramId === 1 ? 9999 : 999; };
    Game_BattlerBase.prototype.paramCap = function(paramId) {
        if (this.isActor()) {
            let bonus = 0;
            if (this.hasSkill(paramId + 51)) bonus += 8;
            if (this.hasSkill(paramId + 59)) bonus -= 8;
            return 5 + Math.trunc(this.currentClass().params[paramId][1] / 2) + bonus;
        }
        return 1000;
    };
    Game_BattlerBase.prototype.param = function(paramId) {
        let value = this.paramBase(paramId) + this.paramPlus(paramId) + this.paramEquips(paramId) + this.paramBuffRate(paramId);
        value += this.paramRate(paramId) * 10 - 10;
        return Math.trunc(Math.max(Math.min(value, this.paramMax(paramId)), this.paramMin(paramId)));
    };
    // Element rates add their excess over 1 instead of multiplying.
    Game_BattlerBase.prototype.elementRate = function(elementId) {
        let num = 1.0;
        for (const t of this.traitsWithId(Game_BattlerBase.TRAIT_ELEMENT_RATE, elementId)) num += t.value - 1;
        return num;
    };
    Game_BattlerBase.prototype.isArmy = function() { return this.specialFlag(Game_BattlerBase.FLAG_ID_PRESERVE_TP); };
    // Growth stops at the cap; it counts on HP and MP at once.
    Game_BattlerBase.prototype.addParam = function(paramId, value) {
        if (this._paramPlus[paramId] < this.paramCap(paramId)) {
            this._paramPlus[paramId] += value;
            if (paramId === 0) this._hp += value;
            if (paramId === 1) this._mp += value;
        }
        this.refresh();
    };
    // State 8 seals every skill and item.
    const _canUse = Game_BattlerBase.prototype.canUse;
    Game_BattlerBase.prototype.canUse = function(item) {
        if (this.isStateAffected(8)) return false;
        return _canUse.call(this, item);
    };
    Game_BattlerBase.prototype.guardSkillId = function() {
        if (this.hasSkill(146)) return 147;
        if (this.hasSkill(155)) return 156;
        if (this.hasSkill(160)) return 161;
        return 7;
    };
    Game_BattlerBase.prototype.isMaxBuffAffected = function(paramId) { return this._buffs[paramId] === this.buffMax(paramId); };
    Game_BattlerBase.prototype.isMaxDebuffAffected = function(paramId) { return this._buffs[paramId] === -idiv(this.buffMax(paramId), 2); };
    Game_BattlerBase.prototype.buffMax = function(paramId) { return this.paramBase(paramId) + this.paramPlus(paramId) + this.paramEquips(paramId); };
    /** skills.include?($data_skills[id]), for actors and (VE Basic) enemies alike. */
    // Asked for every tile a route or a range looks at: the list is kept for the frame.
    Game_BattlerBase.prototype.hasSkill = function(skillId) {
        const skill = $dataSkills[skillId];
        if (!skill) return false;
        if (this._rrSkillsFrame !== Graphics.frameCount || !this._rrSkillsCache) {
            this._rrSkillsCache = this.tbsSkills();
            this._rrSkillsFrame = Graphics.frameCount;
        }
        return this._rrSkillsCache.includes(skill);
    };
    Game_BattlerBase.prototype.tbsSkills = function() { return []; };
    // Ace's restriction and movability, as GTBS names them.
    Game_BattlerBase.prototype.tbsParalyzed = function() { return this.isStateAffected(get('PARALYZED_ID', 7)); };
    Game_BattlerBase.prototype.tbsSleeping = function() { return this.isStateAffected(get('SLEEPING_ID', 6)); };
    Game_BattlerBase.prototype.tbsKnockedOut = function() { return this.isStateAffected(this.deathStateId()); };
    Game_BattlerBase.prototype.tbsMuted = function() { return this.restriction() === 1; };
    RRGtbs.terrainValue = terrainValue;
    RRGtbs.has = has;
    RRGtbs.idiv = idiv;
    RRGtbs.padded = padded;
    RRGtbs.pathfinderIncludes = pathfinderIncludes;
    RRGtbs.tableOf = table;
    RRGtbs.listOf = list;
})();
