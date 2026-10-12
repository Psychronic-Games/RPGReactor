/*:
 * @target MZ
 * @plugindesc Thomas Edison VX (lights), for imported games
 * @author BulletXt (after Kylock); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallLights.js
 *
 * An event whose page has a Comment reading exactly one of these glows,
 * img/pictures/le added onto the screen over the event:
 *
 *   GROUND   medium white          GROUND2  medium white, slight flicker
 *   GROUND3  small red             GROUND4  medium green
 *   GROUND5  medium blue           FIRE     large red, slight flicker
 *   LIGHT    small white           LIGHT2   extra large white
 *   LIGHT3   small white, flicker  TORCH    extra large red, heavy flicker
 *   TORCH2   extra large red, slight flicker
 *   TORCH3   large white, slight flicker
 *
 * Lights sit above the map, the fog and the pictures, under the windows.
 * The lights are found when the map's sprites are made (entering the map,
 * returning from a menu or battle), from each event's page at that moment.
 * A switch per family turns its lights off: FIRE; LIGHT, LIGHT2, LIGHT3;
 * GROUND to GROUND5; TORCH to TORCH3.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param fireSwitch
 * @text FIRE off switch
 * @type switch
 * @default 23
 *
 * @param lightSwitch
 * @text LIGHT off switch
 * @type switch
 * @default 24
 *
 * @param groundSwitch
 * @text GROUND off switch
 * @type switch
 * @default 25
 *
 * @param torchSwitch
 * @text TORCH off switch
 * @type switch
 * @default 26
 *
 * @param image
 * @text Light picture
 * @type file
 * @dir img/pictures/
 * @default le
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallLights');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const SWITCH = { FIRE: num(params.fireSwitch, 23), LIGHT: num(params.lightSwitch, 24), GROUND: num(params.groundSwitch, 25), TORCH: num(params.torchSwitch, 26) };
    const IMAGE = String(params.image || 'le').replace(/\.png$/i, '');

    // Each mode: zoom, opacity, tone, how it is placed (the original's offsets, in VX's 1/8-pixel units) and its flicker.
    const RED = [255, -100, -255, 0];
    const MODES = {
        FIRE: { zoom: 3, opacity: 100, tone: RED, place: 'fire', flicker: 10 },
        LIGHT: { zoom: 1, opacity: 150, place: 'tile' },
        LIGHT2: { zoom: 6, opacity: 150, place: 'large' },
        LIGHT3: { zoom: 1, opacity: 150, place: 'tile', flicker: 10 },
        TORCH: { zoom: 6, opacity: 150, tone: RED, place: 'large', flicker: 30, shake: true },
        TORCH2: { zoom: 6, opacity: 150, tone: RED, place: 'large', flicker: 10 },
        TORCH3: { zoom: 3, opacity: 100, place: 'fire', flicker: 10 },
        GROUND: { zoom: 2, opacity: 100, place: 'ground' },
        GROUND2: { zoom: 2, opacity: 100, place: 'ground', flicker: 10 },
        GROUND3: { zoom: 2, opacity: 100, tone: [255, -255, -255, 255], place: 'ground' },
        GROUND4: { zoom: 2, opacity: 100, tone: [-255, 255, -255, 100], place: 'ground' },
        GROUND5: { zoom: 2, opacity: 100, tone: [-255, 255, 255, 100], place: 'ground' }
    };
    const family = (type) => type.replace(/\d+$/, '');

    // Ruby's Integer#/ rounds down; a position that went fractional (a diagonal step) divides plainly.
    const div8 = (v) => { const r = Math.round(v * 1000) / 1000; return Number.isInteger(r) ? Math.floor(r / 8) : v / 8; };
    const vx = (tiles) => tiles * 256;   // VX kept positions in 1/256 of a tile

    function place(effect) {
        const e = effect.event, mode = MODES[effect.type], s = effect.sprite;
        const rx = vx(e._realX), ry = vx(e._realY), dx = vx($gameMap.displayX()), dy = vx($gameMap.displayY());
        const jitter = (n) => Math.randomInt(n) - n / 2;
        switch (mode.place) {
            case 'fire': s.x = div8(rx - 600 - dx) + jitter(6); s.y = div8(ry - 600 - dy) + jitter(6); break;
            case 'tile': s.x = (-0.25 / 2 * dx) + e.x * 32 - 15; s.y = (-0.25 / 2 * dy) + e.y * 32 - 15; break;
            case 'large':
                s.x = div8(rx - 1200 - dx) - 20 + (mode.shake ? jitter(20) : 0);
                s.y = div8(ry - 1200 - dy) + (mode.shake ? jitter(20) : 0);
                break;
            case 'ground': s.x = div8(rx - 400 - dx); s.y = div8(ry - 400 - dy); break;
        }
    }

    /** The light comments on an event's current page ("FIRE", "TORCH2", …), in order. */
    Game_Event.prototype.rrEdisonLights = function() {
        const list = this.page() ? this.list() || [] : [];   // an event with no page showing has no list
        return list.filter(c => c && c.code === 108 && c.parameters && c.parameters.length === 1 && MODES[c.parameters[0]]).map(c => c.parameters[0]);
    };

    // Sprite#tone as RGSS applied it: grey mixed in by luma, the colour added, each channel
    // clamped, before the light is added to the screen. Done once per tone on the picture itself.
    const toned = new Map();
    function tonedBitmap(base, tone) {
        if (!tone) return base;
        const key = tone.join(',');
        if (!toned.has(key) || toned.get(key)._rrSource !== base) {
            const out = new Bitmap(base.width, base.height);
            out.blt(base, 0, 0, base.width, base.height, 0, 0);
            const ctx = out.context, image = ctx.getImageData(0, 0, base.width, base.height), d = image.data;
            const [r, g, b, grey] = tone.map(Number);
            const k = grey / 255;
            for (let i = 0; i < d.length; i += 4) {
                const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                d[i] = Math.max(0, Math.min(255, d[i] + (luma - d[i]) * k + r));
                d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + (luma - d[i + 1]) * k + g));
                d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + (luma - d[i + 2]) * k + b));
            }
            ctx.putImageData(image, 0, 0);
            out._baseTexture.update();
            out._rrSource = base;
            toned.set(key, out);
        }
        return toned.get(key);
    }

    Spriteset_Map.prototype.rrCreateEdisonLights = function() {
        const layer = new Sprite();
        this.addChild(layer);
        this._rrEdisonLayer = layer;
        this._rrEdisonLights = [];
        this._rrEdisonBitmap = ImageManager.loadPicture(IMAGE);
        this._rrEdisonMade = false;
        this.rrMakeEdisonLights();
    };
    // The lights appear once their picture has loaded (the map waits for it before it shows).
    Spriteset_Map.prototype.rrMakeEdisonLights = function() {
        const base = this._rrEdisonBitmap;
        if (this._rrEdisonMade || !base || !base.isReady() || base.isError()) return;
        this._rrEdisonMade = true;
        for (const event of $gameMap.events()) {
            for (const type of event.rrEdisonLights()) {
                const mode = MODES[type];
                const sprite = new Sprite(tonedBitmap(base, mode.tone));
                sprite.scale.set(mode.zoom, mode.zoom);
                sprite.opacity = mode.opacity;
                sprite.blendMode = 1;
                const effect = { event, type, sprite };
                place(effect);
                this._rrEdisonLayer.addChild(sprite);
                this._rrEdisonLights.push(effect);
            }
        }
    };
    Spriteset_Map.prototype.rrUpdateEdisonLights = function() {
        this.rrMakeEdisonLights();
        for (const effect of this._rrEdisonLights || []) {
            const mode = MODES[effect.type];
            effect.sprite.visible = !(SWITCH[family(effect.type)] > 0 && $gameSwitches.value(SWITCH[family(effect.type)]));
            place(effect);
            if (mode.flicker) effect.sprite.opacity = Math.randomInt(mode.flicker) + (100 - mode.flicker);
        }
    };

    // Above everything the spriteset draws (the pictures and the timer included).
    const _createUpperLayer = Spriteset_Map.prototype.createUpperLayer;
    Spriteset_Map.prototype.createUpperLayer = function() {
        _createUpperLayer.call(this);
        this.rrCreateEdisonLights();
    };
    const _update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _update.call(this);
        this.rrUpdateEdisonLights();
    };
    const _start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _start.call(this);
        if (this._spriteset && this._spriteset.rrMakeEdisonLights) this._spriteset.rrMakeEdisonLights();
    };
})();
