/*:
 * @target MZ
 * @plugindesc Website Launch from Title (VX Ace), for imported games
 * @author modern algebra; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_WebsiteTitleCommand.js
 *
 * Title commands that open a web page in the player's browser and leave the
 * title as it was. Index is the command's place in the list (0 = top). The
 * command window is also kept inside the screen: one that would run off the
 * bottom is moved up to sit on it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commands
 * @text Website commands
 * @type multiline_string
 * @default []
 * @desc JSON: [{"name":"Website","index":2,"url":"https://…"}]
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
    const params = PluginManager.parameters('RR_WebsiteTitleCommand');
    let COMMANDS = [];
    try { COMMANDS = JSON.parse(params.commands || '[]'); } catch (_) { COMMANDS = []; }
    if (!Array.isArray(COMMANDS)) COMMANDS = [];
    const OPTIONS_INDEX = Number.isFinite(Number(params.optionsIndex)) && params.optionsIndex !== '' ? Number(params.optionsIndex) : -1;

    function openUrl(url) {
        if (!url) return;
        try {
            const shell = typeof nw !== 'undefined' && nw.Shell ? nw.Shell : null;
            if (shell) { shell.openExternal(url); return; }
        } catch (_) { /* fall through to the browser */ }
        try { window.open(url, '_blank', 'noopener'); } catch (_) { /* nothing opens */ }
    }

    const _makeCommandList = Window_TitleCommand.prototype.makeCommandList;
    Window_TitleCommand.prototype.makeCommandList = function() {
        _makeCommandList.call(this);
        // The Options command is held aside, so the places count as they did in the original list.
        const at = OPTIONS_INDEX >= 0 ? this._list.findIndex(c => c.symbol === 'options') : -1;
        const options = at >= 0 ? this._list.splice(at, 1)[0] : null;
        COMMANDS.forEach((command, i) => {
            if (!command) return;
            this.addCommand(String(command.name || ''), 'website_launch_' + i);
            this._list.splice(Math.max(0, Number(command.index) || 0), 0, this._list.pop());
        });
        if (options) this._list.splice(Math.min(OPTIONS_INDEX, this._list.length), 0, options);
    };

    const _initialize = Window_TitleCommand.prototype.initialize;
    Window_TitleCommand.prototype.initialize = function(rect) {
        _initialize.apply(this, arguments);
        if (this.y + this.height > Graphics.height) this.y = Graphics.height - this.height;
    };

    const _createCommandWindow = Scene_Title.prototype.createCommandWindow;
    Scene_Title.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        COMMANDS.forEach((command, i) => {
            if (!command) return;
            this._commandWindow.setHandler('website_launch_' + i, () => {
                openUrl(String(command.url || ''));
                this._commandWindow.activate();
            });
        });
    };
})();
