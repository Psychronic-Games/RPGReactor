/*:
 * @target MZ
 * @plugindesc Document Reader (VX Ace), for imported games
 * @author ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_DocumentReader.js
 *
 * Shows pictures as pages on their own screen over the blurred, dimmed map:
 * Q and W turn the page with a slide, the arrow keys move a page larger than
 * the screen, D and A zoom, X or Escape closes. A bar of key hints at the
 * bottom fades once no key has been pressed for a while.
 *
 * Script calls (the import writes them from the game's Ruby):
 *   this.rrDocReader(name)             one picture from img/pictures
 *   this.rrDocReaderPages(name, …)     several, in order
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param settings
 * @type multiline_string
 * @default {}
 * @desc JSON: moveSpeed, zoomStep, minZoom, maxZoom, slideFrames, blurPasses, dimOpacity, hud, hudWidth, hudHeight, hudY, hudBackOpacity, hudIdleFrames, hudFadeStep, hudMinAlpha, hudLines [[[icon, label], …]].
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_DocumentReader');
    let settings = {};
    try { settings = JSON.parse(params.settings || '{}') || {}; } catch (_) { settings = {}; }
    const S = Object.assign({
        moveSpeed: 8, zoomStep: 0.1, minZoom: 0.5, maxZoom: 3, slideFrames: 14, blurPasses: 2, dimOpacity: 120,
        hud: true, hudWidth: 560, hudHeight: 60, hudY: 18, hudBackOpacity: 160, hudIdleFrames: 180, hudFadeStep: 6, hudMinAlpha: 0, hudLines: []
    }, settings);

    Game_Interpreter.prototype.rrDocReader = function(name) {
        this.rrDocReaderPages(name);
    };
    Game_Interpreter.prototype.rrDocReaderPages = function(...names) {
        SceneManager.push(Scene_RRDocumentReader);
        SceneManager.prepareNextScene(names.flat().map(String), 0);
    };

    function Window_RRDocumentHud() { this.initialize(...arguments); }
    Window_RRDocumentHud.prototype = Object.create(Window_Base.prototype);
    Window_RRDocumentHud.prototype.constructor = Window_RRDocumentHud;
    Window_RRDocumentHud.prototype.initialize = function() {
        const w = S.hudWidth, h = S.hudHeight;
        Window_Base.prototype.initialize.call(this, new Rectangle((Graphics.boxWidth - w) / 2, Graphics.boxHeight - h - S.hudY, w, h));
        this.opacity = 0;
        this.backOpacity = 0;
        this._hudAlpha = 255;
        this.refresh();
    };
    Window_RRDocumentHud.prototype.wake = function() {
        this._hudAlpha = 255;
        this.visible = true;
        this.refresh();
    };
    Window_RRDocumentHud.prototype.fade = function() {
        if (!this.visible) return;
        this._hudAlpha = Math.max(this._hudAlpha - S.hudFadeStep, S.hudMinAlpha);
        this.visible = this._hudAlpha > 0;
        if (this.visible) this.refresh();
    };
    Window_RRDocumentHud.prototype.lineWidth = function(line) {
        return line.reduce((w, [, label]) => w + ImageManager.iconWidth + 6 + this.textWidth(String(label)) + 18, 0);
    };
    Window_RRDocumentHud.prototype.refresh = function() {
        if (!this.visible) return;
        const c = this.contents;
        c.clear();
        c.paintOpacity = 255;
        c.fillRect(0, 0, c.width, c.height, `rgba(0,0,0,${(S.hudBackOpacity * this._hudAlpha / 255) / 255})`);
        let y = 0;
        for (const line of S.hudLines) {
            let x = Math.max(Math.floor((c.width - this.lineWidth(line)) / 2), 0);
            for (const [icon, label] of line) {
                c.paintOpacity = this._hudAlpha;
                this.drawIcon(Number(icon), x, y + (this.lineHeight() - ImageManager.iconHeight) / 2);
                x += ImageManager.iconWidth + 6;
                this.resetTextColor();
                this.drawText(String(label), x, y, 200);
                x += this.textWidth(String(label)) + 18;
            }
            y += this.lineHeight();
        }
        c.paintOpacity = 255;
    };

    function Scene_RRDocumentReader() { this.initialize(...arguments); }
    Scene_RRDocumentReader.prototype = Object.create(Scene_Base.prototype);
    Scene_RRDocumentReader.prototype.constructor = Scene_RRDocumentReader;
    window.Scene_RRDocumentReader = Scene_RRDocumentReader;

    Scene_RRDocumentReader.prototype.prepare = function(pages, index) {
        this._pages = pages.length ? pages : [''];
        this._index = Math.min(Math.max(index || 0, 0), this._pages.length - 1);
    };
    Scene_RRDocumentReader.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        if (!this._pages) this.prepare([''], 0);
        this._zoom = 1;
        this._slide = null;
        this._hudIdle = 0;
        this.createBackground();
        this._page = this.makePage(this._pages[this._index]);
        this.addChild(this._page);
        this.createWindowLayer();
        if (S.hud) {
            this._hud = new Window_RRDocumentHud();
            this.addWindow(this._hud);
        }
    };
    Scene_RRDocumentReader.prototype.createBackground = function() {
        this._background = new Sprite(SceneManager.backgroundBitmap());
        if (S.blurPasses > 0) {
            const blur = new PIXI.BlurFilter();
            blur.blur = S.blurPasses;
            this._background.filters = [blur];
        }
        this.addChild(this._background);
        if (S.dimOpacity > 0) {
            this._dim = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this._dim.bitmap.fillAll(`rgba(0,0,0,${S.dimOpacity / 255})`);
            this.addChild(this._dim);
        }
    };
    Scene_RRDocumentReader.prototype.makePage = function(name) {
        const sprite = new Sprite(ImageManager.loadPicture(name));
        sprite.anchor.set(0.5, 0.5);
        sprite.x = Graphics.width / 2;
        sprite.y = Graphics.height / 2;
        sprite.scale.set(this._zoom, this._zoom);
        return sprite;
    };
    Scene_RRDocumentReader.prototype.isReady = function() {
        return Scene_Base.prototype.isReady.call(this) && this._page.bitmap.isReady();
    };
    Scene_RRDocumentReader.prototype.update = function() {
        Scene_Base.prototype.update.call(this);
        this.updateHud();
        if (this._slide) return this.updateSlide();
        this.updatePageChange();
        if (this._slide) return;
        this.updateZoom();
        this.updatePan();
        this.clamp(this._page);
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.popScene();
        }
    };
    Scene_RRDocumentReader.prototype.updateHud = function() {
        if (!this._hud) return;
        const active = ['pageup', 'pagedown', 'rgssZ', 'rgssX', 'cancel'].some(b => Input.isTriggered(b))
            || ['left', 'right', 'up', 'down'].some(b => Input.isPressed(b));
        if (active) {
            this._hudIdle = 0;
            this._hud.wake();
        } else if (++this._hudIdle >= S.hudIdleFrames) {
            this._hud.fade();
        }
    };
    Scene_RRDocumentReader.prototype.updatePageChange = function() {
        if (this._pages.length <= 1) return;
        if (Input.isTriggered('pagedown') && this._index < this._pages.length - 1) this.startSlide(this._index + 1, 1);
        else if (Input.isTriggered('pageup') && this._index > 0) this.startSlide(this._index - 1, -1);
    };
    Scene_RRDocumentReader.prototype.updateZoom = function() {
        if (Input.isTriggered('rgssZ')) this._zoom = Math.min(this._zoom + S.zoomStep, S.maxZoom);
        else if (Input.isTriggered('rgssX')) this._zoom = Math.max(this._zoom - S.zoomStep, S.minZoom);
        this._page.scale.set(this._zoom, this._zoom);
    };
    Scene_RRDocumentReader.prototype.updatePan = function() {
        const s = S.moveSpeed, p = this._page;
        if (Input.isPressed('left')) p.x += s;
        if (Input.isPressed('right')) p.x -= s;
        if (Input.isPressed('up')) p.y += s;
        if (Input.isPressed('down')) p.y -= s;
    };
    // A page no larger than the screen stays centred; a larger one cannot be moved past its edges.
    Scene_RRDocumentReader.prototype.clamp = function(p) {
        if (!p.bitmap || !p.bitmap.isReady()) return;
        const sw = p.bitmap.width * this._zoom, sh = p.bitmap.height * this._zoom;
        p.x = sw <= Graphics.width ? Graphics.width / 2 : Math.min(Math.max(p.x, Graphics.width - sw / 2), sw / 2);
        p.y = sh <= Graphics.height ? Graphics.height / 2 : Math.min(Math.max(p.y, Graphics.height - sh / 2), sh / 2);
    };
    Scene_RRDocumentReader.prototype.startSlide = function(index, dir) {
        const old = this._page;
        const incoming = this.makePage(this._pages[index]);
        incoming.y = old.y;
        this.addChildAt(incoming, this.children.indexOf(old) + 1);
        if (this._hud) this._hud.visible = false;
        this._slide = { old, incoming, index, dir, frames: Math.max(S.slideFrames, 1), started: false };
    };
    Scene_RRDocumentReader.prototype.updateSlide = function() {
        const sl = this._slide;
        const { old, incoming } = sl;
        if (!sl.started) {
            if (!incoming.bitmap.isReady()) return;
            // The incoming page starts beyond the edge it comes from; each travels its distance evenly.
            const halfIn = incoming.bitmap.width * this._zoom / 2, halfOut = old.bitmap.width * this._zoom / 2;
            incoming.x = sl.dir > 0 ? Graphics.width + halfIn : -halfIn;
            const outTarget = sl.dir > 0 ? -halfOut : Graphics.width + halfOut;
            sl.dxOld = (outTarget - old.x) / sl.frames;
            sl.dxNew = (old.x - incoming.x) / sl.frames;
            sl.left = sl.frames;
            sl.started = true;
        }
        old.x += sl.dxOld;
        incoming.x += sl.dxNew;
        if (--sl.left > 0) return;
        this.removeChild(old);
        this._page = incoming;
        this._index = sl.index;
        this.clamp(incoming);
        if (this._hud) this._hud.visible = true;
        this._slide = null;
    };
})();
