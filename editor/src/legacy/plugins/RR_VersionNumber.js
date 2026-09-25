/*:
 * @target MZ
 * @plugindesc Version/Build Number on the title (VX Ace), for imported games
 * @author V.M of D.T (Vlue); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VersionNumber.js
 *
 * Draws the game's version, and its build number unless Version only is on,
 * in a frameless window on the title screen. The build number is the one the
 * game shipped with; it does not count up each time the game starts.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param flavor
 * @text Text before the version
 * @default
 *
 * @param version
 * @text Version
 * @default V1.0
 *
 * @param versionOnly
 * @text Version only
 * @type boolean
 * @default false
 *
 * @param build
 * @text Build number
 * @type number
 * @default 0
 *
 * @param fontSize
 * @text Font size (px)
 * @type number
 * @decimals 1
 * @default 10.7
 *
 * @param x
 * @type number
 * @min -9999
 * @default 10
 *
 * @param y
 * @type number
 * @min -9999
 * @default 440
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VersionNumber');
    const text = () => String(params.flavor || '') + String(params.version || '')
        + (String(params.versionOnly) === 'true' ? '' : ' Build: ' + (Number(params.build) || 0));

    function Window_RRVersion() { this.initialize(...arguments); }
    Window_RRVersion.prototype = Object.create(Window_Base.prototype);
    Window_RRVersion.prototype.constructor = Window_RRVersion;
    Window_RRVersion.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0;
        this.contents.fontSize = Number(params.fontSize) || 10.7;
        this.contents.drawText(text(), 0, 0, this.innerWidth, this.lineHeight());
    };
    Window_RRVersion.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        this.contents.fontSize = Number(params.fontSize) || 10.7;
    };

    const _create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function() {
        _create.call(this);
        const x = Number(params.x) || 0, y = Number(params.y) || 0;
        this._rrVersionWindow = new Window_RRVersion(new Rectangle(x, y, 200, this.calcWindowHeight(1, false)));
        this.addWindow(this._rrVersionWindow);
    };
})();
