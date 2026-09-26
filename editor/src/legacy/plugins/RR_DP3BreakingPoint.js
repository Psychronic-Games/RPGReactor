/*:
 * @target MZ
 * @plugindesc Breaking Point / Party Dying Battle BGM (VX Ace), for imported games
 * @author DiamondandPlatinum3; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_DP3BreakingPoint.js
 *
 * In battle, once the party's HP falls below a percentage of its max (or,
 * per actor, once any living actor's does), the battle music changes to the
 * dying music; when HP climbs back above it the battle music returns. Each
 * piece resumes where it was left, so switching back and forth does not
 * restart either. The party's max is taken as the battle starts. With no
 * dying music named, the battle music keeps playing at the dying volume and
 * pitch. Nothing changes once the battle has been won, lost or escaped.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param dyingBgm
 * @text Dying music
 * @default {"name":"","volume":100,"pitch":100}
 * @desc JSON {"name","volume","pitch"}; name null: the battle music at this volume and pitch.
 *
 * @param entireParty
 * @text Whole party HP
 * @type boolean
 * @default true
 * @desc On: the party's total HP. Off: any one living actor's HP.
 *
 * @param percentage
 * @text HP percentage
 * @type number
 * @default 50
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_DP3BreakingPoint');
    const json = (t, d) => { try { return JSON.parse(t); } catch (_) { return d; } };
    const DYING = json(params.dyingBgm, null) || { name: '', volume: 100, pitch: 100 };
    const ENTIRE_PARTY = params.entireParty !== 'false';
    const RATE = Number(params.percentage ?? 50) * 0.01;

    const members = () => $gameParty.battleMembers();
    const inDanger = (scene) => {
        if (ENTIRE_PARTY) return members().reduce((n, a) => n + a.hp, 0) < Math.trunc(scene._rrBpTotalHp * RATE);
        return members().some(a => a.hp < Math.trunc(a.mhp * RATE) && a.hp !== 0);
    };
    const bgm = (b, pos) => ({ name: b.name || '', volume: b.volume, pitch: b.pitch, pan: b.pan || 0, pos: pos || 0 });
    const same = (scene) => !DYING.name || scene._rrBpBattleBgm.name === scene._rrBpDyingBgm.name;

    const _start = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        _start.call(this);
        this._rrBpTotalHp = members().reduce((n, a) => n + a.mhp, 0);
        this._rrBpBattleBgm = AudioManager.saveBgm();
        this._rrBpDyingBgm = { name: DYING.name || '', volume: DYING.volume, pitch: DYING.pitch, pan: 0, pos: 0 };
        this._rrBpDying = false;
    };

    Scene_Battle.prototype.rrBpPlayDying = function() {
        if (this._rrBpDying) return;
        this._rrBpBattleBgm = AudioManager.saveBgm();
        this._rrBpDying = true;
        const battle = this._rrBpBattleBgm, dying = this._rrBpDyingBgm;
        if (same(this)) AudioManager.playBgm(bgm({ name: battle.name, volume: DYING.volume, pitch: DYING.pitch, pan: battle.pan }), battle.pos);
        else AudioManager.playBgm(bgm(dying), dying.pos);
    };
    Scene_Battle.prototype.rrBpReplayBattle = function() {
        if (!this._rrBpDying) return;
        this._rrBpDying = false;
        this._rrBpDyingBgm = AudioManager.saveBgm();
        const battle = this._rrBpBattleBgm;
        AudioManager.playBgm(bgm(battle), same(this) ? this._rrBpDyingBgm.pos : battle.pos);
    };

    const _update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        if (this._rrBpBattleBgm && BattleManager._phase !== 'battleEnd') {
            if (inDanger(this)) this.rrBpPlayDying();
            else this.rrBpReplayBattle();
        }
        _update.call(this);
    };
})();
