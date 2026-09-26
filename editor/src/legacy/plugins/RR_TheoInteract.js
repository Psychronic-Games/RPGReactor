/*:
 * @target MZ
 * @plugindesc Interact Hover Notification (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoInteract.js
 *
 * A label fades in over an event the player can use: one they face (or stand
 * on, for an event below or above characters) whose page starts with the
 * action button and has commands. The comment <interact: text> on the page
 * sets the label; without it the default is shown. Hidden while an event is
 * running.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param defaultText
 * @default ...
 *
 * @param fadeSpeed
 * @type number
 * @default 20
 *
 * @param displacement
 * @type number
 * @default 15
 *
 * @param width
 * @type number
 * @default 300
 *
 * @param fontFace
 * @text Font (CSS family)
 * @default
 *
 * @param fontSize
 * @text Font size (px)
 * @type number
 * @decimals 1
 * @default 0
 *
 * @param lineHeight
 * @type number
 * @default 18
 *
 * @param bold
 * @type boolean
 * @default true
 *
 * @param italic
 * @type boolean
 * @default false
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoInteract');
    const P = {
        text: String(params.defaultText ?? '...'), fade: Number(params.fadeSpeed) || 20, displacement: Number(params.displacement ?? 15),
        width: Number(params.width) || 300, face: String(params.fontFace || ''), size: Number(params.fontSize) || 0,
        lineHeight: Number(params.lineHeight) || 18, bold: String(params.bold) !== 'false', italic: String(params.italic) === 'true'
    };

    const _setupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _setupPageSettings.call(this);
        this._rrHoverNotif = P.text;
        for (const command of this.list()) {
            if (command.code !== 108 && command.code !== 408) continue;
            const m = /<(?:INTERACT|interact): (.*)>/i.exec(command.parameters[0]);
            if (m) this._rrHoverNotif = m[1];
        }
    };
    const _clearPageSettings = Game_Event.prototype.clearPageSettings;
    Game_Event.prototype.clearPageSettings = function() {
        _clearPageSettings.call(this);
        this._rrHoverNotif = '';
    };
    Game_Event.prototype.rrShowsHoverNotif = function() {
        if (!this._rrHoverNotif || this._erased || $gameMap.isEventRunning()) return false;
        const list = this.page() ? this.list() : null;
        if (!list || list.every(c => [0, 108, 408, 118].includes(c.code))) return false;
        if (this._trigger !== 0) return false;
        const p = $gamePlayer;
        if (this.isNormalPriority()) {
            const d = p.direction();
            return this.x === $gameMap.roundXWithDirection(p.x, d) && this.y === $gameMap.roundYWithDirection(p.y, d);
        }
        return this.x === p.x && this.y === p.y;
    };

    function Window_RRInteractNotif() { this.initialize(...arguments); }
    Window_RRInteractNotif.prototype = Object.create(Window_Base.prototype);
    Window_RRInteractNotif.prototype.constructor = Window_RRInteractNotif;
    Window_RRInteractNotif.prototype.initialize = function(event) {
        this._event = event;
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, P.width, P.lineHeight + $gameSystem.windowPadding() * 2));
        this.opacity = 0;
        this.contentsOpacity = 0;
        this.updatePlacement();
        this.refresh();
    };
    Window_RRInteractNotif.prototype.lineHeight = function() { return P.lineHeight; };
    Window_RRInteractNotif.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        if (P.face) this.contents.fontFace = P.face;
        if (P.size) this.contents.fontSize = P.size;
        this.contents.fontBold = P.bold;
        this.contents.fontItalic = P.italic;
    };
    Window_RRInteractNotif.prototype.refresh = function() {
        this.contents.clear();
        this.resetFontSettings();
        this._text = this._event._rrHoverNotif || '';
        this.drawText(this._text, 0, 0, this.innerWidth, 'center');
    };
    Window_RRInteractNotif.prototype.updatePlacement = function() {
        this.x = this._event.screenX() - this.width / 2;
        this.y = this._event.screenY() - this.height - P.displacement;
    };
    Window_RRInteractNotif.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        this.updatePlacement();
        this.contentsOpacity += this._event.rrShowsHoverNotif() ? P.fade : -P.fade;
        if (this._text !== (this._event._rrHoverNotif || '')) this.refresh();
    };

    const _createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _createAllWindows.call(this);
        this._rrNotifs = new Map();
    };
    const _update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _update.call(this);
        this.rrUpdateNotifs();
    };
    // A label's window exists while its event shows one or it is still fading out.
    Scene_Map.prototype.rrUpdateNotifs = function() {
        if (!this._rrNotifs || !this._windowLayer) return;
        for (const event of $gameMap.events()) {
            if (!this._rrNotifs.has(event) && event.rrShowsHoverNotif()) {
                const w = new Window_RRInteractNotif(event);
                this._rrNotifs.set(event, w);
                this._windowLayer.addChildAt(w, 0);
            }
        }
        for (const [event, w] of this._rrNotifs) {
            if (w.contentsOpacity > 0 || event.rrShowsHoverNotif()) continue;
            this._windowLayer.removeChild(w);
            w.destroy();
            this._rrNotifs.delete(event);
        }
    };
    // Windows update with the window layer; a transfer drops them with the map.
    const _terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        _terminate.call(this);
        if (this._rrNotifs) this._rrNotifs.clear();
    };
})();
