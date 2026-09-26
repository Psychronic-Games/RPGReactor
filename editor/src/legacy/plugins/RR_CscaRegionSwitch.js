/*:
 * @target MZ
 * @plugindesc CSCA RegionSwitch (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaRegionSwitch.js
 *
 * Switches that follow where the player stands, set from the map's note:
 *   <csca_r: 1,2>   <csca_s: 3,4>    switch 3 is ON while on region 1, OFF
 *                                    elsewhere; switch 4 likewise for region 2
 *   <csca_tt: 1,2>  <csca_ts: 3,4>   the same for terrain tags
 * Checked every map frame. Leaving the map leaves the switches as they were.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    // Ruby's `.` stops only at a newline; the first tag of each kind is read.
    const tag = (note, name) => {
        const m = new RegExp('<' + name + ': ([^\\n]*)>', 'i').exec(note);
        return m ? m[1] : null;
    };
    // String#to_i: leading blanks and digits, else 0.
    const toI = (s) => { const m = /^\s*([+-]?\d+)/.exec(s); return m ? Number(m[1]) : 0; };
    const ids = (text) => text.split(',').map(toI);

    let cachedNote = null, cached = null;
    const settings = (note) => {
        if (note === cachedNote) return cached;
        const get = (name) => { const t = tag(note, name); return t === null ? null : ids(t); };
        cachedNote = note;
        cached = { regions: get('csca_r'), switches: get('csca_s') || [], tags: get('csca_tt'), tagSwitches: get('csca_ts') || [] };
        return cached;
    };
    const toggle = (id, on) => {
        if (!id) return;
        if ($gameSwitches.value(id) !== on) $gameSwitches.setValue(id, on);
    };

    const _update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        const note = typeof $dataMap === 'object' && $dataMap && typeof $dataMap.note === 'string' ? $dataMap.note : '';
        if (note) {
            const s = settings(note);
            const x = $gamePlayer.x, y = $gamePlayer.y;
            if (s.regions) {
                const region = this.regionId(x, y);
                s.regions.forEach((r, i) => toggle(s.switches[i], region === r));
            }
            if (s.tags) {
                const terrain = this.terrainTag(x, y);
                s.tags.forEach((t, i) => toggle(s.tagSwitches[i], terrain === t));
            }
        }
        _update.call(this, sceneActive);
    };
})();
