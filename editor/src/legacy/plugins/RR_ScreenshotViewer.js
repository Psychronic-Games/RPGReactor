/*:
 * @target MZ
 * @plugindesc Screenshot viewer (VX Ace Scene_Custom), for imported games
 * @author The game's own script; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ScreenshotViewer.js
 *
 * A screen showing the pictures in the screenshots folder one at a time,
 * full screen under the game's vignette picture, with a window at the
 * bottom: "Press ← or → to view more photos". Left and right step through
 * them (wrapping round) with a click sound played at full volume, whatever
 * the sound effects volume; Cancel leaves. The folder is read each time the
 * screen opens, in the order Windows lists it, so new screenshots are there
 * the next time. In a browser build the pictures are the ones the game
 * shipped, then the session's own screenshots.
 *
 *   SceneManager.push(Scene_RRScreenshots)
 *
 * (the importer writes this for the game's SceneManager.call(Scene_Custom);
 * System Options' View Screenshots opens it).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 *
 * @param folder
 * @default img/Screenshots/
 *
 * @param vignette
 * @text Overlay picture
 * @default vignette
 * @desc From the pictures folder; drawn over the screenshot when it exists.
 *
 * @param clickSe
 * @text Click sound
 * @default GUI_click_03
 *
 * @param text
 * @default Press ← or → to view more photos
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ScreenshotViewer');
    const FOLDER = String(params.folder || 'img/Screenshots/').replace(/\/?$/, '/');
    const VIGNETTE = String(params.vignette ?? 'vignette');
    const CLICK = String(params.clickSe ?? 'GUI_click_03');
    const TEXT = String(params.text ?? 'Press ← or → to view more photos');

    // Windows lists a folder in upper-case order ("default" before "Screenshot (…)").
    const ntfsOrder = (a, b) => { const x = a.toUpperCase(), y = b.toUpperCase(); return x < y ? -1 : x > y ? 1 : 0; };
    /** The .png files in a project folder, without the extension (the original's check is case-sensitive). */
    function pngs(folder) {
        let names = [];
        try {
            if (Utils.isNwjs()) {
                const fs = require('fs'), path = require('path');
                const dir = path.join(path.dirname(process.mainModule.filename), ...folder.split('/').filter(Boolean));
                names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.png')) : [];
            } else {
                if (Utils.loadWebFileIndex) Utils.loadWebFileIndex();
                const index = Utils._webFileIndex, prefix = folder.toLowerCase();
                if (index) for (const [lower, file] of index) if (lower.startsWith(prefix) && !lower.slice(prefix.length).includes('/') && file.endsWith('.png')) names.push(file.slice(folder.length));
            }
        } catch (_) { names = []; }
        return names.sort(ntfsOrder).map(f => f.slice(0, -4));
    }
    const pictureExists = (name) => {
        try {
            if (Utils.isNwjs()) {
                const fs = require('fs'), path = require('path');
                return fs.existsSync(path.join(path.dirname(process.mainModule.filename), 'img', 'pictures', name + '.png'));
            }
            const index = Utils._webFileIndex;
            return index ? index.has(('img/pictures/' + name + '.png').toLowerCase()) : true;
        } catch (_) { return false; }
    };
    // Audio.se_play by path: the sound effects volume does not apply.
    const playRawSe = (name) => {
        if (!name) return;
        const volume = AudioManager._seVolume;
        AudioManager._seVolume = 100;
        try { AudioManager.playSe({ name, volume: 100, pitch: 100, pan: 0 }); } finally { AudioManager._seVolume = volume; }
    };

    function Scene_RRScreenshots() { this.initialize(...arguments); }
    Scene_RRScreenshots.prototype = Object.create(Scene_Base.prototype);
    Scene_RRScreenshots.prototype.constructor = Scene_RRScreenshots;
    window.Scene_RRScreenshots = Scene_RRScreenshots;

    Scene_RRScreenshots.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        this.loadBackgrounds();
        this._background = new Sprite();
        this.addChild(this._background);
        this.updateBackground();
        this._vignette = new Sprite(VIGNETTE && pictureExists(VIGNETTE) ? ImageManager.loadPicture(VIGNETTE) : new Bitmap(640, 480));
        this.addChild(this._vignette);
        this.createWindowLayer();
        this.createMessageWindow();
    };
    Scene_RRScreenshots.prototype.loadBackgrounds = function() {
        const shots = window.rrScreenshots;
        this._backgrounds = pngs(FOLDER).map(name => ({ name }));
        if (shots && shots.session && !Utils.isNwjs()) for (const s of shots.session) this._backgrounds.push(s);
        this._currentIndex = 0;
    };
    Scene_RRScreenshots.prototype.updateBackground = function() {
        const shot = this._backgrounds[this._currentIndex];
        if (!shot) return;
        this._background.bitmap = shot.url ? Bitmap.load(shot.url) : ImageManager.loadBitmap(FOLDER, shot.name);
    };
    Scene_RRScreenshots.prototype.createMessageWindow = function() {
        const width = 400, height = 60;
        const x = (640 - width) / 2, y = 480 - height - 10;
        this._messageWindow = new Window_Base(new Rectangle(x, y, width, height));
        this._messageWindow.contents.drawText(TEXT, 0, 0, width - 24, height - 24, 'center');
        this.addWindow(this._messageWindow);
    };
    Scene_RRScreenshots.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
        if (!this.isActive()) return;
        const n = this._backgrounds.length;
        if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
            this.popScene();
        } else if (Input.isTriggered('left') && n) {
            this._currentIndex = (this._currentIndex - 1 + n) % n;
            this.updateBackground();
            playRawSe(CLICK);
        } else if (Input.isTriggered('right') && n) {
            this._currentIndex = (this._currentIndex + 1) % n;
            this.updateBackground();
            playRawSe(CLICK);
        }
    };
})();
