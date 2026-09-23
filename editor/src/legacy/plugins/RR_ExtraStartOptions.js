/*:
 * @target MZ
 * @plugindesc Extra Start Options (VX Ace), for imported games
 * @author Shadowmaster; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ExtraStartOptions.js
 *
 * Extra title commands that each start a new game on their own map and
 * tile instead of the player's starting position, optionally with the
 * player transparent. Order puts the command at that place in the list
 * (1 = top); 0 adds it at the bottom.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param options
 * @text Start options
 * @type multiline_string
 * @default []
 * @desc JSON: [{"name":"Credits","mapId":1,"x":0,"y":0,"order":0,"transparent":false}]
 *
 * @param optionsIndex
 * @text Options command place
 * @type number
 * @min -1
 * @default -1
 * @desc Where the Options command stays after these are added (0 = top); -1 leaves it where it falls.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ExtraStartOptions');
    let OPTIONS = [];
    try { OPTIONS = JSON.parse(params.options || '[]'); } catch (_) { OPTIONS = []; }
    if (!Array.isArray(OPTIONS)) OPTIONS = [];
    const OPTIONS_INDEX = Number.isFinite(Number(params.optionsIndex)) && params.optionsIndex !== '' ? Number(params.optionsIndex) : -1;

    const _makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function() {
        _makeCommandList.call(this);
        // The Options command is held aside, so the places count as they did in the original list.
        const at = OPTIONS_INDEX >= 0 ? this._list.findIndex(c => c.symbol === 'options') : -1;
        const options = at >= 0 ? this._list.splice(at, 1)[0] : null;
        for (const option of OPTIONS) {
            if (!option) continue;
            const order = Number(option.order) || 0;
            if (order > 0) this._list.splice(order - 1, 0, { name: String(option.name || ''), symbol: 'alt_start', enabled: true, ext: option });
            else this.addCommand(String(option.name || ''), 'alt_start', true, option);
        }
        if (options) this._list.splice(Math.min(OPTIONS_INDEX, this._list.length), 0, options);
    };

    const _createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        this._commandWindow.setHandler('alt_start', this.commandAltStart.bind(this));
    };

    /** A new game that starts on the option's map and tile. */
    Scene_Title.prototype.commandAltStart = function() {
        const option = this._commandWindow.currentExt() || {};
        DataManager.setupNewGame();
        $gamePlayer.reserveTransfer(Number(option.mapId) || 1, Number(option.x) || 0, Number(option.y) || 0);
        $gamePlayer.setTransparent(option.transparent === true);
        $gamePlayer.refresh();
        if (this.rrEndTitleCursor) this.rrEndTitleCursor();
        this._commandWindow.close();
        this.fadeOutAll();
        SceneManager.goto(Scene_Map);
    };
})();
