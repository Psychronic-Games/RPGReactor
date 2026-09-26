/*:
 * @target MZ
 * @plugindesc Screenshot taker (VX Ace), for imported games
 * @author cremno; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ScreenshotTaker.js
 *
 * The screenshot key (F5 unless the game chose another) saves the screen as
 * a picture in the screenshots folder, named with the moment it was taken
 * ("Screenshot (1774661520.646533).png"), and plays the camera sound. It
 * works anywhere in the game. With it, F5 no longer reloads the game.
 *
 * In a browser build nothing can be written to the game's folder: the
 * shots are kept for the session, and the screenshot viewer lists them
 * after the ones the game shipped.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param key
 * @text Key
 * @default F5
 * @desc F5–F9, or an MZ button name (shift, rgssX …).
 *
 * @param se
 * @text Sound
 * @default photo
 * @desc Played from the sound effects folder once the picture is saved.
 *
 * @param format
 * @type select
 * @option png
 * @option jpg
 * @default png
 *
 * @param folder
 * @default img/Screenshots/
 *
 * @param filename
 * @default Screenshot
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ScreenshotTaker');
    const KEY = String(params.key || 'F5');
    const KEY_CODE = { F5: 116, F6: 117, F7: 118, F8: 119, F9: 120 }[KEY.toUpperCase()] || 0;
    const SE = String(params.se ?? 'photo');
    const JPG = /^jpe?g$/i.test(String(params.format || 'png'));
    const FOLDER = String(params.folder || 'img/Screenshots/').replace(/\/?$/, '/');
    const FILENAME = String(params.filename || 'Screenshot');

    const shots = window.rrScreenshots = { folder: FOLDER, session: [] };
    // '%f' in Ruby's sprintf: seconds with six decimals.
    const name = () => `${FILENAME} (${(Date.now() / 1000).toFixed(6)})`;

    function take() {
        const scene = SceneManager._scene;
        if (!scene) return false;
        const bitmap = Bitmap.snap(scene);
        const url = bitmap.canvas.toDataURL(JPG ? 'image/jpeg' : 'image/png');
        const file = name();
        if (Utils.isNwjs()) {
            try {
                const fs = require('fs'), path = require('path');
                const dir = path.join(path.dirname(process.mainModule.filename), ...FOLDER.split('/').filter(Boolean));
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, file + (JPG ? '.jpg' : '.png')), Buffer.from(url.split(',')[1], 'base64'));
            } catch (error) {
                console.warn('Screenshot not saved:', error);
                return false;
            }
        } else {
            shots.session.push({ name: file, url });
        }
        return true;
    }
    const playSe = () => { if (SE) AudioManager.playSe({ name: SE, volume: 100, pitch: 100, pan: 0 }); };

    // Checked once a frame, wherever the game is, as the original did in Graphics.update.
    let pressed = false;
    document.addEventListener('keydown', (event) => {
        if (KEY_CODE && event.keyCode === KEY_CODE && !event.ctrlKey && !event.altKey && !event.repeat) pressed = true;
    });
    const _onKeyDown = SceneManager.onKeyDown;
    SceneManager.onKeyDown = function(event) {
        if (KEY_CODE && event.keyCode === KEY_CODE && !event.ctrlKey && !event.altKey) return;
        _onKeyDown.call(this, event);
    };
    const _updateMain = SceneManager.updateMain;
    SceneManager.updateMain = function() {
        const trigger = KEY_CODE ? pressed : Input.isTriggered(KEY);
        pressed = false;
        if (trigger && take()) playSe();
        _updateMain.call(this);
    };
})();
