/*:
 * @target MZ
 * @plugindesc Khas Awesome Light Effects (VX Ace), for imported games
 * @author Khas Arcthunder; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_KhasLights.js
 *
 * A darkness surface over the map with lights cut out of it: static lights
 * from event comments and a lantern that follows a character.
 *
 * Event comment "[light N]" on the active page puts effect N (see Effects)
 * where the event stood when the page came up.
 *
 * Script calls:
 *   const s = $gameMap.rrEffectSurface();
 *   s.setColor(r, g, b)            darkness colour, instantly
 *   s.setAlpha(a)                  darkness strength 0-255, instantly
 *   s.changeColor(time, r, g, b)   over time frames (a 5th argument fades
 *                                  the strength too)
 *   s.changeAlpha(time, a)
 *   const l = $gameMap.rrLantern();
 *   l.setGraphic(name)             image in the lights folder
 *   l.setMultipleGraphics({2: down, 4: left, 6: right, 8: up})
 *   l.setOpacity(opacity, flicker)
 *   l.changeOwner(character)       $gamePlayer or an event
 *   l.show()   l.hide()
 *
 * The surface starts invisible (strength 0). Surface and lantern are kept on
 * $gameMap, so they survive transfers and saves.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * Not ported: light cutting by wall/roof/block terrain tags (the original's
 * tags 58-60 cannot be set on a VX Ace tileset, so it never cut anything),
 * and the "Screen Tone drives the surface" option.
 *
 * @param effects
 * @text Effects
 * @type multiline_string
 * @default {"0":["light",255,0,true],"1":["torch",200,20,true],"2":["torch_m",180,30,true],"3":["light_s",255,0,true]}
 * @desc JSON: effect id → [image, opacity, flicker, cut]. Opacity each frame is opacity + random(flicker).
 *
 * @param surfaceZ
 * @text Surface Z
 * @type number
 * @min -9999
 * @default 310
 * @desc The original's Surface_Z. 50 or more draws the surface over pictures; below 50, under them.
 *
 * @param underPictureSwitch
 * @text Under-picture switch
 * @type switch
 * @default 0
 * @desc While this switch is ON the surface draws under weather and pictures.
 *
 * @param folder
 * @text Light image folder
 * @default img/Lights/
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_KhasLights');
    const EFFECTS = (() => {
        try {
            let value = JSON.parse(params.effects || '{}');
            if (typeof value === 'string') value = JSON.parse(value);
            return value && typeof value === 'object' ? value : {};
        } catch (_) { return {}; }
    })();
    const SURFACE_Z = Number(params.surfaceZ || 310);
    const UNDER_SWITCH = Number(params.underPictureSwitch || 0);
    const FOLDER = (params.folder || 'img/Lights/').replace(/\/?$/, '/');

    const clamp = v => Math.max(0, Math.min(255, Number(v) || 0));
    const lightBitmap = name => ImageManager.loadBitmap(FOLDER, String(name));

    //-------------------------------------------------------------------------
    // The surface: colour kept inverted (255 - x), as the original subtracts it.

    function Game_RRKhasSurface() { this.initialize(...arguments); }
    window.Game_RRKhasSurface = Game_RRKhasSurface;

    Game_RRKhasSurface.prototype.initialize = function() {
        this._a = this._ta = 0;
        this._r = this._g = this._b = 255;
        this._tr = this._tg = this._tb = 255;
        this._va = this._vr = this._vg = this._vb = 0;
        this._timer = 0;
    };

    Game_RRKhasSurface.prototype.refresh = function() {
        if (this._timer <= 0) return;
        this._a += this._va;
        this._r += this._vr;
        this._g += this._vg;
        this._b += this._vb;
        this._timer--;
    };

    Game_RRKhasSurface.prototype.changeColor = function(time, r, g, b, a) {
        time = Number(time) || 0;
        if (time <= 0) return;
        this._timer = time;
        this._tr = 255 - clamp(r);
        this._tg = 255 - clamp(g);
        this._tb = 255 - clamp(b);
        this._va = a === undefined || a === null ? 0 : (clamp(a) - this._a) / time;
        this._vr = (this._tr - this._r) / time;
        this._vg = (this._tg - this._g) / time;
        this._vb = (this._tb - this._b) / time;
    };

    Game_RRKhasSurface.prototype.changeAlpha = function(time, a) {
        time = Number(time) || 0;
        if (time <= 0) return;
        this._timer = time;
        this._ta = clamp(a);
        this._vr = this._vg = this._vb = 0;
        this._va = (this._ta - this._a) / time;
    };

    Game_RRKhasSurface.prototype.setColor = function(r, g, b) {
        this._tr = this._r = 255 - clamp(r);
        this._tg = this._g = 255 - clamp(g);
        this._tb = this._b = 255 - clamp(b);
        this._va = this._vr = this._vg = this._vb = 0;
        this._timer = 0;
    };

    Game_RRKhasSurface.prototype.setAlpha = function(a) {
        this._ta = this._a = clamp(a);
        this._va = this._vr = this._vg = this._vb = 0;
        this._timer = 0;
    };

    Game_RRKhasSurface.prototype.alpha = function() { return clamp(this._a); };
    Game_RRKhasSurface.prototype.color = function() { return [this._r, this._g, this._b].map(v => Math.round(clamp(v))); };

    //-------------------------------------------------------------------------
    // The lantern. Its owner is stored by reference ({player} or map+event)
    // so a save keeps it; an event owner on another map hides it.

    function Game_RRKhasLantern() { this.initialize(...arguments); }
    window.Game_RRKhasLantern = Game_RRKhasLantern;

    Game_RRKhasLantern.prototype.initialize = function() {
        this._graphics = null;
        this._opacity = 255;
        this._plus = 0;
        this._owner = { player: true };
        this._visible = false;
    };

    Game_RRKhasLantern.prototype.setOpacity = function(opacity, flicker) {
        this._opacity = Number(opacity) || 0;
        this._plus = Number(flicker) || 0;
    };

    Game_RRKhasLantern.prototype.setGraphic = function(name) {
        this.setMultipleGraphics({ 2: name, 4: name, 6: name, 8: name });
    };

    Game_RRKhasLantern.prototype.setMultipleGraphics = function(graphics) {
        if (!graphics) return;
        const get = d => graphics instanceof Map ? graphics.get(d) : graphics[d];
        const fallback = get(2) || get(4) || get(6) || get(8);
        if (!fallback) return;
        this._graphics = {};
        for (const d of [2, 4, 6, 8]) {
            this._graphics[d] = String(get(d) || fallback);
            lightBitmap(this._graphics[d]);
        }
    };

    Game_RRKhasLantern.prototype.changeOwner = function(character) {
        if (character instanceof Game_Player) this._owner = { player: true };
        else if (character instanceof Game_Event) this._owner = { mapId: character._mapId, eventId: character._eventId };
    };

    Game_RRKhasLantern.prototype.show = function() {
        if (this._graphics) this._visible = true;
    };

    Game_RRKhasLantern.prototype.hide = function() { this._visible = false; };

    Game_RRKhasLantern.prototype.character = function() {
        const owner = this._owner || {};
        if (owner.player) return $gamePlayer;
        return $gameMap.mapId() === owner.mapId ? $gameMap.event(owner.eventId) : null;
    };

    Game_RRKhasLantern.prototype.isVisible = function() {
        return !!(this._visible && this._graphics && this.character());
    };

    Game_RRKhasLantern.prototype.opacity = function() {
        return this._plus > 0 ? this._opacity + Math.randomInt(this._plus) : this._opacity;
    };

    //-------------------------------------------------------------------------
    // Game_Map

    Game_Map.prototype.rrEffectSurface = function() {
        if (!this._rrKhasSurface) this._rrKhasSurface = new Game_RRKhasSurface();
        return this._rrKhasSurface;
    };

    Game_Map.prototype.rrLantern = function() {
        if (!this._rrKhasLantern) this._rrKhasLantern = new Game_RRKhasLantern();
        return this._rrKhasLantern;
    };

    const _rrKhasMapUpdate = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        if (sceneActive && this._rrKhasSurface) this._rrKhasSurface.refresh();
        _rrKhasMapUpdate.call(this, sceneActive);
    };

    //-------------------------------------------------------------------------
    // Game_Event: "[light N]" in the first line of a comment on the active page.

    const lightIdIn = list => {
        for (const command of list || []) {
            if (command.code !== 108) continue;
            const text = String(command.parameters[0] || '');
            if (!text.includes('[light')) continue;
            // The original read the last [light N] on the line, and 0 when the tag was malformed.
            const matches = [...text.matchAll(/\[light ([0-9.]+)\]/g)];
            return matches.length ? parseInt(matches[matches.length - 1][1], 10) || 0 : 0;
        }
        return null;
    };

    const _rrKhasSetupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _rrKhasSetupPage.call(this);
        const page = this._pageIndex >= 0 ? this.page() : null;
        const id = page ? lightIdIn(page.list) : null;
        const effect = id === null ? null : EFFECTS[id];
        if (effect) {
            // Where the event stands now; the light does not follow it.
            this._rrLight = { id, x: this._realX, y: this._realY };
            lightBitmap(effect[0]);
        } else if (this._rrLight) {
            this._rrLight = null;
        }
    };

    //-------------------------------------------------------------------------
    // Spriteset_Map. The original subtracts (colour x alpha) from the screen.
    // Here the overlay is drawn as that colour with lights composited over it,
    // inverted, and multiplied onto the map: screen x (1 - overlay x alpha).
    // Multiply is native in PIXI v8; never register it as a blend extension.

    const _rrKhasCreateUpperLayer = Spriteset_Map.prototype.createUpperLayer;
    Spriteset_Map.prototype.createUpperLayer = function() {
        _rrKhasCreateUpperLayer.call(this);
        const sprite = new Sprite();
        sprite.blendMode = 2;
        sprite.visible = false;
        const destroy = sprite.destroy;
        sprite.destroy = function(options) {
            const bitmap = this.bitmap;
            destroy.call(this, options);
            if (bitmap && bitmap.destroy) bitmap.destroy();
        };
        this._rrKhasLightSprite = sprite;
        this._rrKhasKey = '';
        this.rrKhasPlaceLights(this.rrKhasUnderPictures());
    };

    Spriteset_Map.prototype.rrKhasUnderPictures = function() {
        return SURFACE_Z < 50 || (UNDER_SWITCH > 0 && $gameSwitches.value(UNDER_SWITCH));
    };

    Spriteset_Map.prototype.rrKhasPlaceLights = function(under) {
        const sprite = this._rrKhasLightSprite;
        if (sprite.parent === this && sprite._rrUnder === under) return;
        if (sprite.parent) sprite.parent.removeChild(sprite);
        sprite._rrUnder = under;
        if (!under) return this.addChild(sprite);
        const anchor = [this._weather, this._pictureContainer].find(child => child && child.parent === this);
        this.addChildAt(sprite, anchor ? this.children.indexOf(anchor) : this.children.length);
    };

    const _rrKhasSpritesetUpdate = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _rrKhasSpritesetUpdate.call(this);
        if (this._rrKhasLightSprite) this.rrKhasUpdateLights();
    };

    Spriteset_Map.prototype.rrKhasUpdateLights = function() {
        const sprite = this._rrKhasLightSprite;
        const surface = $gameMap._rrKhasSurface;
        const alpha = surface ? surface.alpha() : 0;
        if (alpha <= 0) {
            sprite.visible = false;
            return;
        }
        this.rrKhasPlaceLights(this.rrKhasUnderPictures());
        const width = Graphics.width, height = Graphics.height;
        if (!sprite.bitmap || sprite.bitmap.width !== width || sprite.bitmap.height !== height) {
            if (sprite.bitmap) sprite.bitmap.destroy();
            sprite.bitmap = new Bitmap(width, height);
            this._rrKhasKey = '';
        }
        sprite.visible = true;
        sprite.opacity = alpha;

        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const draws = [];
        const add = (bitmap, x, y, size, opacity) => {
            if (!bitmap.isReady() || x > width || y > height || x + size < 0 || y + size < 0) return;
            draws.push([bitmap, x, y, size, Math.min(255, opacity) / 255]);
        };
        for (const event of $gameMap.events()) {
            const light = event._rrLight;
            const effect = light && EFFECTS[light.id];
            if (!effect) continue;
            const bitmap = lightBitmap(effect[0]);
            if (!bitmap.isReady()) continue;
            const w = bitmap.width;
            // Top-left = tile * 32 + 16 - width / 2, on both axes (the images are square).
            const flicker = Number(effect[2]) || 0;
            add(bitmap, $gameMap.adjustX(light.x) * tw + tw / 2 - w / 2, $gameMap.adjustY(light.y) * th + th / 2 - w / 2, w,
                (Number(effect[1]) || 0) + (flicker > 0 ? Math.randomInt(flicker) : 0));
        }
        const lantern = $gameMap._rrKhasLantern;
        if (lantern && lantern.isVisible()) {
            const character = lantern.character();
            const base = lightBitmap(lantern._graphics[2]);
            const bitmap = lightBitmap(lantern._graphics[character.direction()] || lantern._graphics[2]);
            if (base.isReady()) {
                const size = base.width;
                add(bitmap, character.scrolledX() * tw + tw / 2 - size / 2, character.scrolledY() * th + th / 2 - size / 2, size, lantern.opacity());
            }
        }

        // Nothing moved and nothing flickered: keep last frame's texture.
        const color = surface.color();
        const key = color.join(',') + '|' + draws.map(d => [d[0]._url, d[1], d[2], d[4]].join(',')).join('|');
        if (key === this._rrKhasKey) return;
        this._rrKhasKey = key;

        const context = sprite.bitmap.context;
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1;
        context.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        context.fillRect(0, 0, width, height);
        for (const [bitmap, x, y, size, opacity] of draws) {
            const image = bitmap._canvas || bitmap._image;
            if (!image) continue;
            const sw = Math.min(size, bitmap.width), sh = Math.min(size, bitmap.height);
            context.globalAlpha = opacity;
            context.drawImage(image, 0, 0, sw, sh, x, y, sw, sh);
        }
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'difference';
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.restore();
        sprite.bitmap._baseTexture.update();
    };
})();
