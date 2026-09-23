/*:
 * @target MZ
 * @plugindesc TheoAllen Footstep Sound (VX Ace), for imported games
 * @author TheoAllen (edit by Valentine); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoFootsteps.js
 *
 * Footstep sounds for the player, and for events whose page has a <footstep>
 * comment, picked by the terrain tag of the tile underfoot (or its region
 * while the region switch is ON). Nothing plays while the master switch is
 * OFF.
 *
 * $gameSystem.rrFootsteps() returns the sound table, id → { name, volume,
 * pitch, pan }; change an entry to change that tile's sound. It is kept on
 * $gameSystem, so a save keeps the changes.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * @param masterSwitch
 * @text Master switch
 * @type switch
 * @default 46
 * @desc Footsteps play only while this switch is ON.
 *
 * @param regionSwitch
 * @text Region mode switch
 * @type switch
 * @default 120
 * @desc While ON the sound is picked by region id instead of terrain tag.
 *
 * @param walkDelay
 * @text Walking delay
 * @type number
 * @default 18
 * @desc Frames between footsteps while walking.
 *
 * @param dashDelay
 * @text Dashing delay
 * @type number
 * @default 16
 * @desc Frames between footsteps while dashing.
 *
 * @param sounds
 * @text Sounds
 * @type multiline_string
 * @default {}
 * @desc JSON: terrain tag / region id → {"name":"SE name","volume":90,"pitch":100}.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoFootsteps');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const MASTER_SWITCH = num(params.masterSwitch, 46);
    const REGION_SWITCH = num(params.regionSwitch, 120);
    const WALK_DELAY = num(params.walkDelay, 18);
    const DASH_DELAY = num(params.dashDelay, 16);
    let SOUNDS = {};
    try { SOUNDS = JSON.parse(params.sounds || '{}') || {}; } catch (_) { SOUNDS = {}; }

    // A copy per game, so a script call changing a sound never edits the defaults.
    Game_System.prototype.rrFootsteps = function() {
        if (!this._rrFootsteps) this._rrFootsteps = JSON.parse(JSON.stringify(SOUNDS));
        return this._rrFootsteps;
    };

    Game_CharacterBase.prototype.rrUpdateFootstep = function() {
        this._rrStepDelay = (this._rrStepDelay || 0) - 1;
        if (this._rrStepDelay > 0 || !this.isMoving()) return;
        const id = $gameSwitches.value(REGION_SWITCH) ? this.regionId() : this.terrainTag();
        const se = $gameSystem.rrFootsteps()[id];
        if (se && se.name) {
            AudioManager.playSe({ name: se.name, volume: num(se.volume, 100), pitch: num(se.pitch, 100), pan: num(se.pan, 0) });
        }
        this._rrStepDelay = this.isDashing() ? DASH_DELAY : WALK_DELAY;
    };

    const _rrFootstepPlayerUpdate = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        _rrFootstepPlayerUpdate.call(this, sceneActive);
        if ($gameSwitches.value(MASTER_SWITCH)) this.rrUpdateFootstep();
    };

    const _rrFootstepSetupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _rrFootstepSetupPageSettings.call(this);
        this._rrFootstep = (this.list() || []).some(command =>
            (command.code === 108 || command.code === 408) && /<footstep>/i.test(String(command.parameters[0])));
        this._rrStepDelay = 0;
    };

    const _rrFootstepEventUpdate = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _rrFootstepEventUpdate.call(this);
        if (this._rrFootstep && $gameSwitches.value(MASTER_SWITCH)) this.rrUpdateFootstep();
    };
})();
