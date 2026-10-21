/*:
 * @target MZ
 * @plugindesc Dialog System 1.0 (VX), for imported games
 * @author Zeriab; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallDialog.js
 *
 * A small frame for modal dialogs: the screen dims (black at half opacity)
 * and the dialog's windows take the input until it closes; cancel closes
 * it. Nothing in the game's own scripts opens a dialog.
 *
 * For other ports: subclass Scene_RRDialog (createDialogWindows, update,
 * markToClose) and open it with RRDialog.show(Scene_X, onClose); onClose
 * gets the dialog's value.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    function Scene_RRDialog() { this.initialize(...arguments); }
    Scene_RRDialog.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRDialog.prototype.constructor = Scene_RRDialog;
    Scene_RRDialog.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this.value = null;
        this._markedToClose = false;
    };
    // The dimmed background: the scene under it, black at 128.
    Scene_RRDialog.prototype.createBackground = function() {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
        const dim = new Sprite(new Bitmap(Graphics.width, Graphics.height));
        dim.bitmap.fillAll('rgba(0,0,0,0.5)');
        this.addChild(dim);
    };
    Scene_RRDialog.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createDialogWindows();
    };
    Scene_RRDialog.prototype.createDialogWindows = function() {};
    Scene_RRDialog.prototype.markToClose = function() { this._markedToClose = true; };
    Scene_RRDialog.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (Input.isTriggered('cancel')) this.markToClose();
        if (this._markedToClose && !this._rrClosing) {
            this._rrClosing = true;
            const done = RRDialog._onClose;
            RRDialog._onClose = null;
            SceneManager.pop();
            if (done) done(this.value);
        }
    };
    const RRDialog = {
        _onClose: null,
        show(sceneClass, onClose) { this._onClose = onClose || null; SceneManager.push(sceneClass || Scene_RRDialog); }
    };
    window.Scene_RRDialog = Scene_RRDialog;
    window.RRDialog = RRDialog;
})();
