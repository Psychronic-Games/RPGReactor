/*:
 * @target MZ
 * @plugindesc Enemy Voices in Battle (VX Ace), for imported games
 * @author DiamondandPlatinum3; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_DP3EnemyVoices.js
 *
 * Enemies speak in battle: a sound from the sound effects folder, under the
 * voices folder and a folder named after the enemy (its database name), picked
 * at random from the enemy's list for the moment:
 *   ENEMY_ATTACKING      it uses its attack skill
 *   USING_SKILLS         it uses another skill with no voice of its own
 *   MISSED_ACTOR_TARGET  its hit on an actor missed or was evaded
 *   DODGED_ACTOR_ATTACK  an actor's hit on it missed or was evaded
 *   LITTLE/SIGNIFICANT/HEAVY/MASSIVE_DAMAGE, DEFAULT_DAMAGE
 *                        it took damage it survives: more than the ratio's
 *                        percent of its max HP picks that table (the largest
 *                        met, only that one); the rest take DEFAULT_DAMAGE
 *   HP_MP_RESTORE        an enemy's hit raised its HP or MP (itself only when
 *                        self_heal_speak is on)
 *   DEATH_VOICE          it falls
 * A skill's note can give an enemy its own lines, used in place of
 * USING_SKILLS:  ~EnemyVoice: id, "file"   or   ~EnemyVoice: id, "file",
 * volume, pitch, wait frames  (defaults 100, 100, 0).
 *
 * Every line, a note-tagged one included, is spoken only on the frequency
 * roll (VOICE_FREQUENCY percent) and not while the mute switch is on or the
 * enemy has a silencing state. A damage ratio table with no enemy lists
 * stays silent rather than falling back to DEFAULT_DAMAGE. A wait holds the
 * battle for that many frames after the line starts.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param folder
 * @text Voices folder
 * @default battle_chatter
 * @desc Folder in the sound effects folder holding one folder per enemy name.
 *
 * @param switchId
 * @text Mute switch
 * @type switch
 * @default 0
 *
 * @param silenceStates
 * @text Silencing states
 * @default []
 * @desc JSON list of state IDs.
 *
 * @param skillsWithoutVoice
 * @text Skills without a generic voice
 * @default []
 * @desc JSON list of skill IDs that never play USING_SKILLS.
 *
 * @param frequency
 * @text Voice frequency (%)
 * @type number
 * @default 100
 *
 * @param voices
 * @text Voice tables
 * @default {}
 * @desc JSON: table name → { enemy ID: ["file", volume, pitch, wait, …] }, plus ratio / self_heal_speak.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_DP3EnemyVoices');
    const json = (t, d) => { try { return JSON.parse(t); } catch (_) { return d; } };
    const FOLDER = String(params.folder ?? 'battle_chatter');
    const SWITCH_ID = Number(params.switchId) || 0;
    const SILENCE = json(params.silenceStates, []);
    const NO_VOICE = json(params.skillsWithoutVoice, []);
    const FREQUENCY = Number(params.frequency ?? 100);
    const V = json(params.voices, {}) || {};
    const table = (name) => V[name] || {};
    const ratio = (name) => Number(table(name).ratio) || 0;

    const inBattle = () => typeof Scene_Battle === 'function' && SceneManager._scene instanceof Scene_Battle;
    // The parent's method at call time, so wrappers other plugins add to Game_Battler still run.
    const inherited = (cls, name) => {
        const own = Object.prototype.hasOwnProperty.call(cls.prototype, name) ? cls.prototype[name] : null;
        return own || function(...args) { return Object.getPrototypeOf(cls.prototype)[name].apply(this, args); };
    };

    // A line's wait holds the battle (BattleManager is busy) while the scene keeps drawing.
    if (!BattleManager.rrDp3VoiceWait) {
        BattleManager.rrDp3VoiceWait = function(frames) { this._rrDp3VoiceWait = (this._rrDp3VoiceWait || 0) + frames; };
        const _isBusy = BattleManager.isBusy;
        BattleManager.isBusy = function() { return this._rrDp3VoiceWait > 0 || _isBusy.call(this); };
        const _setup = BattleManager.setup;
        BattleManager.setup = function() { this._rrDp3VoiceWait = 0; return _setup.apply(this, arguments); };
        const _sbUpdate = Scene_Battle.prototype.update;
        Scene_Battle.prototype.update = function() {
            if (BattleManager._rrDp3VoiceWait > 0) BattleManager._rrDp3VoiceWait--;
            _sbUpdate.call(this);
        };
    }

    /** One entry picked from a flat ["file", volume, pitch, wait, …] list; false when it is not a sound. */
    const playFrom = (list, folderName) => {
        if (!Array.isArray(list) || !list.length) return false;
        const n = Math.floor(list.length / 4);
        const i = n > 0 ? Math.randomInt(n) * 4 : Math.floor(Math.random() * 4);
        const [name, volume, pitch, wait] = list.slice(i, i + 4);
        if (typeof name !== 'string' || !Number.isInteger(volume) || !Number.isInteger(pitch)) return false;
        AudioManager.playSe({ name: [FOLDER, folderName, name].filter(s => s !== '').join('/'), volume, pitch, pan: 0 });
        if (Number.isInteger(wait) && wait > 0 && inBattle()) BattleManager.rrDp3VoiceWait(wait);
        return true;
    };

    const muted = (enemy) => (SWITCH_ID > 0 && $gameSwitches.value(SWITCH_ID)) || enemy.states().some(s => SILENCE.includes(s.id));
    /** True when the line was spoken or not allowed to be; false when the enemy has no line for it. */
    const play = (voices, enemy) => {
        if (muted(enemy) || Math.randomInt(100) >= FREQUENCY) return true;
        const list = Array.isArray(voices) ? voices : voices[enemy.enemyId()];
        return playFrom(list, enemy.enemy().name);
    };

    /** The skill note's lines for one enemy, as a flat list. */
    const noteVoices = (skill, enemyId) => {
        const out = [];
        const re = new RegExp('~EnemyVoice:\\s*' + enemyId + ',*\\s*"(.+?)",*\\s*(\\d*),*\\s*(\\d*),*\\s*(\\d*)', 'gis');
        for (const m of String((skill && skill.note) || '').matchAll(re)) {
            out.push(m[1], m[2] !== '' ? parseInt(m[2], 10) : 100, m[3] !== '' ? parseInt(m[3], 10) : 100, m[4] !== '' ? parseInt(m[4], 10) : 0);
        }
        return out;
    };
    const playSkill = (enemy, skillId) => {
        let voices = noteVoices($dataSkills[skillId], enemy.enemyId());
        if (!voices.length) {
            if (NO_VOICE.includes(skillId)) return true;
            voices = table('USING_SKILLS');
        }
        return play(voices, enemy);
    };

    const _useItem = inherited(Game_Enemy, 'useItem');
    Game_Enemy.prototype.useItem = function(item) {
        if (DataManager.isSkill(item)) {
            if (item.id === this.attackSkillId()) play(table('ENEMY_ATTACKING'), this);
            else playSkill(this, item.id);
        }
        return _useItem.call(this, item);
    };

    const _die = inherited(Game_Enemy, 'die');
    Game_Enemy.prototype.die = function() {
        play(table('DEATH_VOICE'), this);
        return _die.call(this);
    };

    // Damage the enemy survives (HP is already lowered here).
    const _onDamage = inherited(Game_Enemy, 'onDamage');
    Game_Enemy.prototype.onDamage = function(value) {
        if (value > 0 && this.hp > 0) {
            const mhp = this.mhp;
            const name = value > mhp * ratio('MASSIVE_DAMAGE') * 0.01 ? 'MASSIVE_DAMAGE'
                : value > mhp * ratio('HEAVY_DAMAGE') * 0.01 ? 'HEAVY_DAMAGE'
                : value > mhp * ratio('SIGNIFICANT_DAMAGE') * 0.01 ? 'SIGNIFICANT_DAMAGE'
                : value > mhp * ratio('LITTLE_DAMAGE') * 0.01 ? 'LITTLE_DAMAGE' : 'DEFAULT_DAMAGE';
            play(table(name), this);
        }
        return _onDamage.call(this, value);
    };

    // A hit from an enemy that raised this enemy's HP or MP.
    const _executeDamage = Game_Action.prototype.executeDamage;
    Game_Action.prototype.executeDamage = function(target, value) {
        const hp = target.hp, mp = target.mp;
        _executeDamage.call(this, target, value);
        const user = this.subject();
        if (!target.isEnemy() || !(hp < target.hp || mp < target.mp) || !user || !user.isEnemy()) return;
        if (user !== target || table('HP_MP_RESTORE').self_heal_speak) play(table('HP_MP_RESTORE'), target);
    };

    // Misses and evasions of a hit from the battle flow (a counter attack is not one).
    let applying = 0;
    for (const name of ['invokeNormalAction', 'invokeMagicReflection']) {
        const base = BattleManager[name];
        BattleManager[name] = function() {
            applying++;
            try { return base.apply(this, arguments); } finally { applying--; }
        };
    }
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _apply.call(this, target);
        const subject = this.subject();
        if (!applying || !subject || target.result().isHit()) return;
        if (!target.isEnemy() && subject.isEnemy()) play(table('MISSED_ACTOR_TARGET'), subject);
        else if (target.isEnemy() && !subject.isEnemy()) play(table('DODGED_ACTOR_ATTACK'), target);
    };
})();
