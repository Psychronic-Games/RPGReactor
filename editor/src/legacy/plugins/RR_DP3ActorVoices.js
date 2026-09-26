/*:
 * @target MZ
 * @plugindesc Actor Voices in Battle (VX Ace), for imported games
 * @author DiamondandPlatinum3; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_DP3ActorVoices.js
 *
 * Actors speak in battle: a sound from the sound effects folder, under the
 * voices folder and a folder named after the actor (the actor's current name,
 * or the folder set by the script call below), picked at random from the
 * actor's list for the moment.
 *
 * Battle start, one random living actor, the first that applies:
 *   PARTY_NEEDS_HEALING  party HP below the ratio's percent of max
 *   TOO_MANY_ENEMIES     more enemies than party members plus the ratio
 *   VERY_WEAK / WEAK / VERY_STRONG / STRONG / EQUAL_ENEMIES, comparing the
 *                        sums of the best ATK, DEF, MAT and MDF on each side
 * A table with no line for the chosen actor moves on to the next that
 * applies (the first two only; the strength tables end the choice).
 *
 * During battle: USING_ITEMS (an item, as it is used), ACTOR_ATTACKING and
 * USING_SKILLS (as the action's animation plays on an enemy: once, or per
 * target when multiple hits speak), MISSED_ENEMY, DODGED_ENEMY, the damage
 * tables (the largest ratio met with a line, down to DEFAULT_DAMAGE, for
 * damage the actor survives), HP_MP_RESTORE (healed by an ally's recovery
 * effect, once per hit; or healed by an enemy's hit), DEATH_VOICE,
 * REVIVED_VOICE, ESCAPE_ATTEMPT_VOICE then SUCCESSFUL_ / FAILED_ESCAPE.
 * Victory, one random living actor: BATTLE_TOOK_AGES (turns at least the
 * ratio), THAT_WAS_TOUGH (party HP below the ratio's percent of what it
 * began with), THAT_WAS_EASY (turns at most the ratio), else NORMAL_VICTORY;
 * LEVELUP_VICTORY for each actor that levels.
 *
 * A skill's or item's note can give an actor its own lines:
 *   ~ActorVoice: id, "file"   or   ~ActorVoice: id, "file", volume, pitch,
 *   wait frames  (defaults 80, 100, 0).
 * Attacks, generic skills and items, misses, dodges, damage and healing
 * speak on the frequency roll; nothing speaks while the mute switch is on,
 * the actor has a silencing state, or after the battle is lost. Actions whose
 * animation is played by an action sequence (Battle Symphony) never reach
 * the attack and skill lines. A wait holds the battle for that many frames.
 *
 * Script call:  set_actor_voice_name(id, "Folder") → this.rrSetActorVoiceName(id, "Folder")
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param folder
 * @text Voices folder
 * @default battle_chatter
 * @desc Folder in the sound effects folder holding one folder per actor name.
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
 * @param multipleHits
 * @text Speak for every target
 * @type boolean
 * @default true
 *
 * @param voices
 * @text Voice tables
 * @default {}
 * @desc JSON: table name → { actor ID: ["file", volume, pitch, wait, …] }, plus ratio / self_heal_speak.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_DP3ActorVoices');
    const json = (t, d) => { try { return JSON.parse(t); } catch (_) { return d; } };
    const FOLDER = String(params.folder ?? 'battle_chatter');
    const SWITCH_ID = Number(params.switchId) || 0;
    const SILENCE = json(params.silenceStates, []);
    const NO_VOICE = json(params.skillsWithoutVoice, []);
    const FREQUENCY = Number(params.frequency ?? 100);
    const MULTIPLE = params.multipleHits !== 'false';
    const V = json(params.voices, {}) || {};
    const table = (name) => V[name] || {};
    const ratio = (name) => Number(table(name).ratio) || 0;

    const inBattle = () => typeof Scene_Battle === 'function' && SceneManager._scene instanceof Scene_Battle;
    const inherited = (cls, name) => {
        const own = Object.prototype.hasOwnProperty.call(cls.prototype, name) ? cls.prototype[name] : null;
        return own || function(...args) { return Object.getPrototypeOf(cls.prototype)[name].apply(this, args); };
    };

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

    // Set once the battle is lost: the revival that follows says nothing.
    let lost = false;
    const muted = (actorId) => {
        if (lost || (SWITCH_ID > 0 && $gameSwitches.value(SWITCH_ID))) return true;
        const actor = $gameActors.actor(actorId);
        return !!actor && actor.states().some(s => SILENCE.includes(s.id));
    };
    const folderOf = (actorId) => {
        const names = $gameSystem._rrActorVoiceNames;
        const set = names && names[actorId];
        return typeof set === 'string' && set !== '' ? set : $gameActors.actor(actorId).name();
    };
    /** True when a line was spoken or the actor is muted; false when the list holds no sound. */
    const playVoice = (list, actorId) => {
        if (muted(actorId)) return true;
        if (!Array.isArray(list) || !list.length) return false;
        const n = Math.floor(list.length / 4);
        const i = n > 0 ? Math.randomInt(n) * 4 : Math.floor(Math.random() * 4);
        const [name, volume, pitch, wait] = list.slice(i, i + 4);
        if (typeof name !== 'string' || !Number.isInteger(volume) || !Number.isInteger(pitch)) return false;
        AudioManager.playSe({ name: [FOLDER, folderOf(actorId), name].filter(s => s !== '').join('/'), volume, pitch, pan: 0 });
        if (Number.isInteger(wait) && wait > 0 && inBattle()) BattleManager.rrDp3VoiceWait(wait);
        return true;
    };
    const speaks = () => Math.randomInt(100) < FREQUENCY;
    const randomActorId = () => {
        const ids = $gameParty.battleMembers().filter(a => a.isAlive()).map(a => a.actorId());
        return ids.length ? ids[Math.randomInt(ids.length)] : 0;
    };
    // Lines said by one random living actor.
    const partyLine = (name) => {
        if (!inBattle()) return true;
        const id = randomActorId();
        return id ? playVoice(table(name)[id], id) : false;
    };
    // Lines on the frequency roll.
    const frequentLine = (name, actorId) => (!inBattle() || !speaks() ? true : playVoice(table(name)[actorId], actorId));
    const line = (name, actorId) => (!inBattle() ? true : playVoice(table(name)[actorId], actorId));

    const noteVoices = (obj, actorId) => {
        const out = [];
        const re = new RegExp('~ActorVoice:\\s*' + actorId + ',*\\s*"(.+?)",*\\s*(\\d*),*\\s*(\\d*),*\\s*(\\d*)', 'gis');
        for (const m of String((obj && obj.note) || '').matchAll(re)) {
            out.push(m[1], m[2] !== '' ? parseInt(m[2], 10) : 80, m[3] !== '' ? parseInt(m[3], 10) : 100, m[4] !== '' ? parseInt(m[4], 10) : 0);
        }
        return out;
    };
    const skillLine = (actorId, skillId) => {
        if (!inBattle()) return true;
        let voices = noteVoices($dataSkills[skillId], actorId);
        if (!voices.length) {
            if (NO_VOICE.includes(skillId) || !speaks()) return true;
            voices = table('USING_SKILLS')[actorId];
        }
        return playVoice(voices, actorId);
    };
    const itemLine = (actorId, itemId) => {
        if (!inBattle()) return true;
        let voices = noteVoices($dataItems[itemId], actorId);
        if (!voices.length) {
            if (!speaks()) return true;
            voices = table('USING_ITEMS')[actorId];
        }
        return playVoice(voices, actorId);
    };
    // Skill 1 is the attack line whatever the actor's attack skill is.
    const skillOrItemLine = (actorId, item) => {
        if (DataManager.isSkill(item)) return item.id === 1 ? frequentLine('ACTOR_ATTACKING', actorId) : skillLine(actorId, item.id);
        if (item) return itemLine(actorId, item.id);
        return false;
    };

    Game_Interpreter.prototype.rrSetActorVoiceName = function(id, name) {
        if (!Number.isInteger(id) || typeof name !== 'string') return;
        if (!Array.isArray($gameSystem._rrActorVoiceNames)) $gameSystem._rrActorVoiceNames = [];
        $gameSystem._rrActorVoiceNames[id] = name;
    };

    // Battle start
    const sum = (list, f) => list.reduce((n, b) => n + f(b), 0);
    const best = (list, paramId) => list.reduce((n, b) => Math.max(n, b.param(paramId)), 0);
    const power = (list) => [2, 3, 4, 5].reduce((n, p) => n + best(list, p), 0);
    const battleStartLine = () => {
        const members = $gameParty.battleMembers();
        const total = sum(members, a => a.mhp);
        const current = total - sum(members, a => a.mhp - a.hp);
        if (current < total * ratio('PARTY_NEEDS_HEALING') * 0.01 && partyLine('PARTY_NEEDS_HEALING')) return;
        if ($gameTroop.members().length > $gameParty.members().length + ratio('TOO_MANY_ENEMIES') && partyLine('TOO_MANY_ENEMIES')) return;
        const enemy = power($gameTroop.members()), party = power(members);
        if (enemy < party * ratio('VERY_WEAK_ENEMIES') * 0.01) return partyLine('VERY_WEAK_ENEMIES');
        if (enemy < party * ratio('WEAK_ENEMIES') * 0.01) return partyLine('WEAK_ENEMIES');
        if (enemy > party * ratio('VERY_STRONG_ENEMIES') * 0.01) return partyLine('VERY_STRONG_ENEMIES');
        if (enemy > party * ratio('STRONG_ENEMIES') * 0.01) return partyLine('STRONG_ENEMIES');
        return partyLine('EQUAL_ENEMIES');
    };
    const _sbStart = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        battleStartLine();
        _sbStart.call(this);
    };

    // The party's HP as the battle is set up, for THAT_WAS_TOUGH.
    const _setup = BattleManager.setup;
    BattleManager.setup = function() {
        this._rrDp3StartHp = sum($gameParty.battleMembers(), a => a.hp);
        lost = false;
        return _setup.apply(this, arguments);
    };

    // Actions
    const _useItem = inherited(Game_Actor, 'useItem');
    Game_Actor.prototype.useItem = function(item) {
        if (DataManager.isItem(item)) itemLine(this.actorId(), item.id);
        return _useItem.call(this, item);
    };
    const _showNormalAnimation = Window_BattleLog.prototype.showNormalAnimation;
    Window_BattleLog.prototype.showNormalAnimation = function(targets, animationId, mirror) {
        const subject = BattleManager._subject;
        if ($dataAnimations[animationId] && subject && subject.isActor()) {
            let speak = true;
            for (const target of targets) {
                if (!speak || target.isActor()) continue;
                speak = MULTIPLE;
                const action = BattleManager._action || subject.currentAction();
                skillOrItemLine(subject.actorId(), action && action.item());
            }
        }
        return _showNormalAnimation.call(this, targets, animationId, mirror);
    };

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
        if (!applying || !subject) return;
        if (target.isActor()) target._rrDp3Thanked = false;
        if (target.result().isHit()) return;
        if (!target.isActor() && subject.isActor()) frequentLine('MISSED_ENEMY', subject.actorId());
        else if (target.isActor() && !subject.isActor()) frequentLine('DODGED_ENEMY', target.actorId());
    };

    // Healing: an ally's recovery effect (once until the actor is next hit in battle), or an enemy's hit.
    for (const name of ['itemEffectRecoverHp', 'itemEffectRecoverMp']) {
        const base = Game_Action.prototype[name];
        Game_Action.prototype[name] = function(target, effect) {
            if (target.isActor() && this.subject() !== target && !target._rrDp3Thanked) {
                frequentLine('HP_MP_RESTORE', target.actorId());
                target._rrDp3Thanked = true;
            }
            return base.call(this, target, effect);
        };
    }
    const _executeDamage = Game_Action.prototype.executeDamage;
    Game_Action.prototype.executeDamage = function(target, value) {
        const hp = target.hp, mp = target.mp;
        _executeDamage.call(this, target, value);
        const user = this.subject();
        if (!target.isActor() || !(hp < target.hp || mp < target.mp) || !user || !user.isEnemy()) return;
        if (user !== target || table('HP_MP_RESTORE').self_heal_speak) frequentLine('HP_MP_RESTORE', target.actorId());
    };

    // Damage the actor survives (HP is already lowered here): the largest ratio met that has a line.
    const _onDamage = inherited(Game_Actor, 'onDamage');
    Game_Actor.prototype.onDamage = function(value) {
        if (value > 0 && this.hp > 0) {
            const id = this.actorId(), mhp = this.mhp;
            const tables = ['MASSIVE_DAMAGE', 'HEAVY_DAMAGE', 'SIGNIFICANT_DAMAGE', 'LITTLE_DAMAGE'];
            if (!tables.some(name => value > mhp * ratio(name) * 0.01 && frequentLine(name, id))) frequentLine('DEFAULT_DAMAGE', id);
        }
        return _onDamage.call(this, value);
    };

    const _die = inherited(Game_Actor, 'die');
    Game_Actor.prototype.die = function() {
        line('DEATH_VOICE', this.actorId());
        return _die.call(this);
    };
    const _removeState = inherited(Game_Actor, 'removeState');
    Game_Actor.prototype.removeState = function(stateId) {
        const revived = stateId === this.deathStateId() && this.isStateAffected(stateId);
        const result = _removeState.call(this, stateId);
        if (revived) line('REVIVED_VOICE', this.actorId());
        return result;
    };
    // A level-up line holds the battle for its wait twice over (once as it plays, once after), so actors
    // levelling together speak in turn; a muted actor still holds it once.
    const levelUpLine = (actorId) => {
        const list = table('LEVELUP_VICTORY')[actorId];
        if (!inBattle() || !list) return;
        const n = Math.floor(list.length / 4);
        const i = n > 0 ? Math.randomInt(n) * 4 : Math.floor(Math.random() * 4);
        const voice = [list[i], list[i + 1], list[i + 2], list[i + 3]];
        if (playVoice(voice, actorId) && Number.isInteger(voice[3]) && voice[3] > 0) BattleManager.rrDp3VoiceWait(voice[3]);
    };
    const _changeExp = Game_Actor.prototype.changeExp;
    Game_Actor.prototype.changeExp = function(exp, show) {
        const last = this._level;
        _changeExp.call(this, exp, show);
        if (this._level > last) levelUpLine(this.actorId());
    };

    // Escape and the end of battle
    const _processEscape = BattleManager.processEscape;
    BattleManager.processEscape = function() {
        const id = randomActorId();
        line('ESCAPE_ATTEMPT_VOICE', id);
        const escaped = _processEscape.call(this);
        if (escaped) playVoice(table('SUCCESSFUL_ESCAPE')[id], id);
        else line('FAILED_ESCAPE', id);
        return escaped;
    };
    const victoryLine = () => {
        const turns = $gameTroop.turnCount();
        if (turns >= ratio('BATTLE_TOOK_AGES') && partyLine('BATTLE_TOOK_AGES')) return;
        const hp = sum($gameParty.battleMembers(), a => a.hp);
        if (hp < (BattleManager._rrDp3StartHp || 0) * ratio('THAT_WAS_TOUGH') * 0.01 && partyLine('THAT_WAS_TOUGH')) return;
        if (turns <= ratio('THAT_WAS_EASY') && partyLine('THAT_WAS_EASY')) return;
        partyLine('NORMAL_VICTORY');
    };
    const _processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function() {
        if (this._phase !== 'battleEnd') victoryLine();
        return _processVictory.apply(this, arguments);
    };
    const _processDefeat = BattleManager.processDefeat;
    BattleManager.processDefeat = function() {
        lost = true;
        return _processDefeat.apply(this, arguments);
    };
})();
