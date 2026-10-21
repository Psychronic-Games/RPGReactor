/*:
 * @target MZ
 * @plugindesc Window Background by Theo (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoWindowBackground.js
 *
 * A picture from img/system behind a window of a given kind, at its top-left
 * corner, as opaque as the window is open and shown while the window is. A
 * save file's picture appears two frames after its window, as it did. Only a
 * window of that very kind gets it (not a kind built on it).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param windows
 * @text Windows
 * @desc JSON: { "Window_Class": "image" }.
 * @default {}
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_TheoWindowBackground');
    let LIST = {};
    try { LIST = JSON.parse(P.windows || '{}'); } catch (_) { LIST = {}; }
    // The ported save screen draws its files in windows of its own kind.
    const ALIASES = { Window_SaveFile: ['Window_RRPinnacleSaveFile', 'Window_SaveFile'] };
    const imageFor = (win) => {
        const name = win && win.constructor ? win.constructor.name : '';
        for (const [kind, image] of Object.entries(LIST)) if ((ALIASES[kind] || [kind]).includes(name)) return { kind, image };
        return null;
    };

    const W = Window_Base.prototype;
    const _initialize = W.initialize;
    W.initialize = function(...args) {
        _initialize.apply(this, args);
        const found = imageFor(this);
        if (found) {
            this._rrTheoBack = new Sprite(ImageManager.loadSystem(found.image));
            this._rrTheoBack.visible = false;
            this._rrTheoSaveFile = found.kind === 'Window_SaveFile';
            this.addChildAt(this._rrTheoBack, 0);
        }
        this.rrTheoUpdateBack();
    };
    const _update = W.update;
    W.update = function() {
        _update.call(this);
        this.rrTheoUpdateBack();
    };
    W.rrTheoUpdateBack = function() {
        const back = this._rrTheoBack;
        if (!back) return;
        if (this._rrTheoSaveFile) {
            if (this._rrTheoCountdown === undefined) this._rrTheoCountdown = 1;
            this._rrTheoCountdown -= 1;
            if (this._rrTheoCountdown >= 0) return;
        }
        back.opacity = this.openness;
        back.visible = this.visible;
    };
})();
