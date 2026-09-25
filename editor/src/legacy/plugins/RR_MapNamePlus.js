/*:
 * @target MZ
 * @plugindesc MapName Plus+ (VX Ace), for imported games
 * @author ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MapNamePlus.js
 *
 * The map name as MapName Plus+ showed it: a window across the top of the
 * screen whose frame and text fade in together, the name aligned and in a
 * font of its own.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param align
 * @text Alignment
 * @type select
 * @option left
 * @option center
 * @option right
 * @default center
 *
 * @param fontFace
 * @text Font (CSS family)
 * @default
 * @desc Blank uses the game's font.
 *
 * @param fontSize
 * @text Font size (px)
 * @type number
 * @decimals 1
 * @default 0
 * @desc 0 uses the game's size.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MapNamePlus');
    const ALIGN = ['left', 'center', 'right'].includes(params.align) ? params.align : 'center';
    const FONT_FACE = String(params.fontFace || '');
    const FONT_SIZE = Number(params.fontSize) || 0;

    Scene_Map.prototype.mapNameWindowRect = function() {
        return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(1, false));
    };

    const _resetFontSettings = Window_MapName.prototype.resetFontSettings;
    Window_MapName.prototype.resetFontSettings = function() {
        _resetFontSettings.call(this);
        if (FONT_FACE) this.contents.fontFace = FONT_FACE;
        if (FONT_SIZE > 0) this.contents.fontSize = FONT_SIZE;
    };

    // The frame fades with the text, faster in and slower out, and only for a map that has a name.
    Window_MapName.prototype.updateFadeIn = function() {
        if ($gameMap.displayName()) this.opacity += 32;
        this.contentsOpacity += 16;
    };
    Window_MapName.prototype.updateFadeOut = function() {
        if ($gameMap.displayName()) this.opacity -= 16;
        this.contentsOpacity -= 16;
    };

    Window_MapName.prototype.refresh = function() {
        this.contents.clear();
        this.resetFontSettings();
        if ($gameMap.displayName()) this.drawText($gameMap.displayName(), 0, 0, this.innerWidth, ALIGN);
    };
})();
