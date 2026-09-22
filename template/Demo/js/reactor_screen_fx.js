//=============================================================================
// reactor_screen_fx.js - Screen texts, named sprites and particle effects
//=============================================================================
// Three script-driven screen features, all kept in $gameScreen so they save:
//
//   $gameScreen.rrWriteText(id, x, y, text, fixed, color, layer) and the
//   rrAppendLine / rrAppendText / rrChangeText / rrMoveText / rrRemoveText /
//   rrRemoveAllTexts family draw text at a screen or map position in the
//   window font, in a text colour of the window skin, with \V[n], \N[n],
//   \P[n], \G and \C[n] codes.
//
//   $gameScreen.rrSpriteAdd(name, image, blend, layer, x, y, scale, angle)
//   and the rrSprite* family are pictures addressed by name instead of
//   number, with a draw layer (1-2 behind the map tiles, 3-4 under the
//   characters, 5-7 over the characters and under the upper tiles, 8 and
//   above over everything), a map binding that scrolls with the map, eased
//   moves, scales, opacity, rotation and colour fades.
//
//   $gameScreen.rrPfxCreate(name, "burst" | "stream") and the rrPfx*
//   family define particle effects (texture, amount, velocity, angle,
//   colours, growth, timeout, gravity, layer) and burst or stream them at a
//   point. Live particles are not saved; the definitions are.
//
// The RPG Maker 2000/2003 importer targets these for the DynRPG text,
// sprite and particle-effect plugins, but they are ordinary engine features.

(function() {
    "use strict";

    const EASING = { linear: 0, in: 1, out: 2, inout: 3 };
    function easingType(name) {
        const n = String(name || "linear").toLowerCase().replace(/\s+/g, "");
        if (/in\/out|inout/.test(n)) return EASING.inout;
        if (/out$/.test(n)) return EASING.out;
        if (/in$/.test(n)) return EASING.in;
        return EASING.linear;
    }
    const msToFrames = ms => Math.max(1, Math.round((Number(ms) || 0) * 60 / 1000));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // ---- state on Game_Screen ---------------------------------------------------

    const _clear = Game_Screen.prototype.clear;
    Game_Screen.prototype.clear = function() {
        _clear.call(this);
        this._rrTexts = {};
        this._rrTextRev = 0;
        this._rrSpriteIds = {};
        this._rrSpriteNext = 101;
        this._rrParticles = {};
        this._rrParticleBursts = [];
    };

    Game_Screen.prototype.maxPictures = function() {
        const limit = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.advanced && $dataSystem.advanced.picturesUpperLimit;
        return Math.max(100, Number(limit) || 0);
    };

    // ---- screen texts ----------------------------------------------------------------

    Game_Screen.prototype.rrTexts = function() { return this._rrTexts || (this._rrTexts = {}); };
    Game_Screen.prototype.rrText = function(id) { return this.rrTexts()[String(id)] || null; };
    Game_Screen.prototype._rrTouchText = function(t) { t.rev = (this._rrTextRev = (this._rrTextRev || 0) + 1); };

    Game_Screen.prototype.rrWriteText = function(id, x, y, text, fixed, color, layer) {
        const t = { x: Number(x) || 0, y: Number(y) || 0, lines: [String(text ?? "")], fixed: fixed === true || fixed === "fixed", color: Number(color) || 0, layer: Number(layer) || 0, rev: 0 };
        this.rrTexts()[String(id)] = t;
        this._rrTouchText(t);
    };
    Game_Screen.prototype.rrAppendLine = function(id, text) { const t = this.rrText(id); if (t) { t.lines.push(String(text ?? "")); this._rrTouchText(t); } };
    Game_Screen.prototype.rrAppendText = function(id, text) { const t = this.rrText(id); if (t) { t.lines[t.lines.length - 1] = (t.lines[t.lines.length - 1] || "") + String(text ?? ""); this._rrTouchText(t); } };
    Game_Screen.prototype.rrChangeText = function(id, text, color) { const t = this.rrText(id); if (t) { t.lines = [String(text ?? "")]; if (color !== undefined && color !== null && color !== "end") t.color = Number(color) || 0; this._rrTouchText(t); } };
    Game_Screen.prototype.rrMoveText = function(id, x, y) { const t = this.rrText(id); if (t) { t.x = Number(x) || 0; t.y = Number(y) || 0; } };
    Game_Screen.prototype.rrRemoveText = function(id) { delete this.rrTexts()[String(id)]; this._rrTextRev = (this._rrTextRev || 0) + 1; };
    Game_Screen.prototype.rrRemoveAllTexts = function() { this._rrTexts = {}; this._rrTextRev = (this._rrTextRev || 0) + 1; };
    Game_Screen.prototype.rrTextAlign = function(id, align) { const t = this.rrText(id); if (t) { t.align = /center|right/i.test(String(align)) ? String(align).toLowerCase() : "left"; this._rrTouchText(t); } };

    /** The window text codes a screen text understands, with \C[n] left in place for the drawer. */
    function expandCodes(text) {
        let s = String(text || "");
        for (let i = 0; i < 4; i++) {
            const before = s;
            s = s.replace(/\\V\[(\d+)\]/gi, (_, n) => String($gameVariables.value(Number(n))));
            s = s.replace(/\\N\[(\d+)\]/gi, (_, n) => { const a = $gameActors.actor(Number(n)); return a ? a.name() : ""; });
            s = s.replace(/\\P\[(\d+)\]/gi, (_, n) => { const a = $gameParty.members()[Number(n) - 1]; return a ? a.name() : ""; });
            s = s.replace(/\\G/g, TextManager.currencyUnit);
            if (s === before) break;
        }
        return s.replace(/\\\\/g, "\\");
    }

    function Sprite_RRText() { this.initialize(...arguments); }
    Sprite_RRText.prototype = Object.create(Sprite.prototype);
    Sprite_RRText.prototype.constructor = Sprite_RRText;
    Sprite_RRText.prototype.initialize = function(id) {
        Sprite.prototype.initialize.call(this);
        this._textId = id;
        this._rev = -1;
        this._values = "";
    };
    Sprite_RRText.prototype.redraw = function(t) {
        const fontSize = $gameSystem.mainFontSize ? $gameSystem.mainFontSize() : 26;
        const lineHeight = fontSize + 2;   // the text plugin stacks lines at the glyph height plus 2
        const lines = t.lines.map(expandCodes);
        const fontFace = $gameSystem.mainFontFace ? $gameSystem.mainFontFace() : "sans-serif";
        const measure = new Bitmap(1, 1);
        measure.fontFace = fontFace;
        measure.fontSize = fontSize;
        let width = 1;
        for (const line of lines) width = Math.max(width, measure.measureTextWidth(line.replace(/\\C\[\d+\]/gi, "")) + 4);
        const bitmap = new Bitmap(Math.ceil(width), Math.max(1, lines.length * lineHeight));
        bitmap.fontFace = fontFace;
        bitmap.fontSize = fontSize;
        bitmap.outlineWidth = Math.min(2, bitmap.outlineWidth);
        lines.forEach((line, row) => {
            const plainWidth = measure.measureTextWidth(line.replace(/\\C\[\d+\]/gi, ""));
            let x = t.align === "center" ? Math.round((width - plainWidth) / 2) : t.align === "right" ? Math.round(width - plainWidth) : 0, color = t.color;   // lines line up inside the box
            for (const part of line.split(/(\\C\[\d+\])/i)) {
                const m = /^\\C\[(\d+)\]$/i.exec(part);
                if (m) { color = Number(m[1]); continue; }
                if (!part) continue;
                bitmap.textColor = ColorManager.textColor(clamp(color, 0, 31));
                const w = bitmap.measureTextWidth(part);
                bitmap.drawText(part, x, row * lineHeight, w + 4, lineHeight, "left");
                x += w;
            }
        });
        this.bitmap = bitmap;
        this._values = lines.join("\n") + "|" + t.color;
    };
    Sprite_RRText.prototype.update = function() {
        Sprite.prototype.update.call(this);
        const t = $gameScreen.rrText(this._textId);
        if (!t) { this.visible = false; return; }
        this.visible = true;
        const values = t.lines.map(expandCodes).join("\n") + "|" + t.color;
        if (t.rev !== this._rev || values !== this._values) { this._rev = t.rev; this.redraw(t); }
        // "center" puts the text's middle on x and "right" its end; the plugin's 2 px drop stays
        const shift = t.align === "center" ? Math.round(this.bitmap.width / 2) : t.align === "right" ? this.bitmap.width : 0;
        if (t.fixed || !$gameMap || typeof $gameMap.displayX !== "function" || !(SceneManager._scene instanceof Scene_Map)) { this.x = t.x - shift; this.y = t.y + 2; }
        else { this.x = Math.round(t.x - $gameMap.displayX() * $gameMap.tileWidth()) - shift; this.y = Math.round(t.y - $gameMap.displayY() * $gameMap.tileHeight()) + 2; }
        this.z = t.layer;
    };

    // ---- named sprites over pictures --------------------------------------------------

    function spriteState(picture) { return picture._rrSprite || (picture._rrSprite = { layer: 0, mapBound: false, colorTween: null, tone: null }); }

    Game_Screen.prototype.rrSpriteId = function(name, create) {
        const key = String(name);
        const ids = this._rrSpriteIds || (this._rrSpriteIds = {});
        if (ids[key]) return ids[key];
        if (!create) return 0;
        // Named sprites take the slots above the game's own pictures: 101 up when the project
        // has room (advanced.picturesUpperLimit), else the upper half of whatever there is.
        const max = this.maxPictures();
        const configured = typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.advanced && Number($dataSystem.advanced.rrNamedSpriteBase);
        const first = configured && configured < max ? configured : max > 200 ? 101 : Math.max(1, Math.floor(max / 2) + 1);
        let next = this._rrSpriteNext && this._rrSpriteNext >= first && this._rrSpriteNext <= max ? this._rrSpriteNext : first;
        const used = new Set(Object.values(ids));
        for (let tries = 0; tries <= max - first; tries++) {
            const id = next;
            next = next >= max ? first : next + 1;
            if (!used.has(id)) { ids[key] = id; this._rrSpriteNext = next; return id; }
        }
        // Every slot is taken: a game that names sprites by a counter leaves faded ones behind, so the
        // oldest one that is invisible and done moving gives up its slot.
        for (const [name, id] of Object.entries(ids)) {
            const p = this.picture(id);
            if (!p || (p.opacity() <= 0 && !p._rrTweening())) { this.erasePicture(id); delete ids[name]; ids[key] = id; return id; }
        }
        return 0;
    };
    Game_Screen.prototype.rrSpritePicture = function(name) { const id = this.rrSpriteId(name, false); return id ? this.picture(id) : null; };

    /** The picture file a sprite names: the plugin's "Picture/…" or "Picture 2/…" root folders are the pictures folder. */
    function pictureName(image) {
        let n = String(image || "").replace(/\\/g, "/").replace(/\.[^./]+$/, "");
        n = n.replace(/^\/?Picture\//i, "");
        return n;
    }
    const BLEND = { mix: 0, normal: 0, add: 1, additive: 1, multiply: 2, screen: 3, sub: 2 };

    Game_Screen.prototype.rrSpriteAdd = function(name, image, blend, layer, x, y, scale, angle) {
        const id = this.rrSpriteId(name, true);
        if (!id) return;
        const s = Number(scale) || 100;
        this.showPicture(id, pictureName(image), 1, Number(x) || 0, Number(y) || 0, s, s, 255, BLEND[String(blend || "mix").toLowerCase()] || 0);
        const picture = this.picture(id);
        picture._angle = Number(angle) || 0;
        const st = spriteState(picture);
        st.layer = Number(layer) || 0;
        st.mapBound = false;
        st.tone = null;
        st.colorTween = null;
    };
    Game_Screen.prototype.rrSpriteRemove = function(name) {
        const id = this.rrSpriteId(name, false);
        if (id) { this.erasePicture(id); delete this._rrSpriteIds[String(name)]; }
    };
    Game_Screen.prototype.rrSpriteRemoveAll = function() { for (const name of Object.keys(this._rrSpriteIds || {})) this.rrSpriteRemove(name); };
    Game_Screen.prototype.rrSpriteBind = function(name, target) {
        const p = this.rrSpritePicture(name);
        if (!p) return;
        const st = spriteState(p);
        st.mapBound = target === "map" || (typeof target === "number" && target > 0);
    };
    Game_Screen.prototype.rrSpriteLayer = function(name, layer) { const p = this.rrSpritePicture(name); if (p) spriteState(p).layer = Number(layer) || 0; };
    Game_Screen.prototype.rrSpriteImage = function(name, image) {
        const p = this.rrSpritePicture(name);
        if (p) p._name = pictureName(image);
    };
    // The plugin moves, scales and fades a sprite on separate clocks: a fade keeps running under a
    // later move. Each property tweens on its own, outside the picture's single MZ move.
    const TARGET = { x: "_targetX", y: "_targetY", scaleX: "_targetScaleX", scaleY: "_targetScaleY", opacity: "_targetOpacity" };
    function setTween(p, key, target, ms, easing) {
        const frames = msToFrames(ms);
        const tw = p._rrTweens || (p._rrTweens = {});
        if (!(frames > 0)) { p["_" + key] = target; p[TARGET[key]] = target; delete tw[key]; return; }
        tw[key] = { start: p["_" + key], target, whole: frames, left: frames, easing: easingType(easing) };
    }
    function ease(t, type) {   // MZ's calcEasing, exponent 2
        const easeIn = x => x * x, easeOut = x => 1 - (1 - x) * (1 - x);
        switch (type) { case 1: return easeIn(t); case 2: return easeOut(t); case 3: return t < 0.5 ? easeIn(t * 2) / 2 : easeOut(t * 2 - 1) / 2 + 0.5; default: return t; }
    }
    Game_Picture.prototype._rrStepTweens = function() {
        const tw = this._rrTweens;
        if (!tw) return;
        for (const key of Object.keys(tw)) {
            const t = tw[key];
            t.left--;
            this["_" + key] = t.left <= 0 ? t.target : t.start + (t.target - t.start) * ease(1 - t.left / t.whole, t.easing);
            this[TARGET[key]] = this["_" + key];
            if (t.left <= 0) delete tw[key];
        }
    };
    Game_Picture.prototype._rrTweening = function() { return !!this._rrTweens && Object.keys(this._rrTweens).length > 0; };
    Game_Screen.prototype.rrSpriteOpacity = function(name, opacity) { const p = this.rrSpritePicture(name); if (p) setTween(p, "opacity", clamp(Number(opacity) || 0, 0, 255), 0); };
    Game_Screen.prototype.rrSpriteOpacityTo = function(name, opacity, ms, easing) { const p = this.rrSpritePicture(name); if (p) setTween(p, "opacity", clamp(Number(opacity) || 0, 0, 255), ms, easing); };
    Game_Screen.prototype.rrSpriteMoveTo = function(name, x, y, ms, easing) { const p = this.rrSpritePicture(name); if (p) { setTween(p, "x", Number(x) || 0, ms, easing); setTween(p, "y", Number(y) || 0, ms, easing); } };
    Game_Screen.prototype.rrSpriteMoveBy = function(name, dx, dy, ms, easing) { const p = this.rrSpritePicture(name); if (p) { setTween(p, "x", p._x + (Number(dx) || 0), ms, easing); setTween(p, "y", p._y + (Number(dy) || 0), ms, easing); } };
    Game_Screen.prototype.rrSpriteScaleTo = function(name, sx, sy, ms, easing) { const p = this.rrSpritePicture(name); if (p) { if (sx !== null && sx !== undefined) setTween(p, "scaleX", Number(sx) || 0, ms, easing); if (sy !== null && sy !== undefined) setTween(p, "scaleY", Number(sy) || 0, ms, easing); } };
    Game_Screen.prototype.rrSpriteRotateBy = function(name, degrees, ms, easing) {
        const p = this.rrSpritePicture(name);
        if (!p) return;
        const state = p.reactorPictureState ? p.reactorPictureState() : null;
        const frames = msToFrames(ms);
        if (state) state.angleTween = { start: p._angle, target: p._angle + (Number(degrees) || 0), duration: frames, whole: frames, easing: easingType(easing) };
        else p._angle += Number(degrees) || 0;
    };
    Game_Screen.prototype.rrSpriteRotateTo = function(name, degrees, ms, easing) {
        const p = this.rrSpritePicture(name);
        if (!p) return;
        const state = p.reactorPictureState ? p.reactorPictureState() : null;
        const frames = msToFrames(ms);
        if (state && frames > 1) state.angleTween = { start: p._angle, target: Number(degrees) || 0, duration: frames, whole: frames, easing: easingType(easing) };
        else p._angle = Number(degrees) || 0;
    };
    Game_Screen.prototype.rrSpriteBlend = function(name, blend) { const p = this.rrSpritePicture(name); if (p) p._blendMode = BLEND[String(blend || "mix").toLowerCase()] || 0; };
    Game_Screen.prototype.rrSpriteRotateForever = function(name, direction, msPerTurn) {
        const id = this.rrSpriteId(name, false);
        if (!id) return;
        const frames = msToFrames(msPerTurn || 1000);
        const sign = /^c?cw?w$/i.test(String(direction)) && /^cc|cww/i.test(String(direction)) ? -1 : 1;
        this.rotatePicture(id, sign * (360 / frames) * 2);
    };
    Game_Screen.prototype.rrSpriteRotateStop = function(name) { const id = this.rrSpriteId(name, false); if (id) this.rotatePicture(id, 0); };
    /** Colour as the plugin gives it: r, g, b multiply 0-255 (255 unchanged), sat 0-100 (100 unchanged) → an MZ tone. */
    function toneOf(r, g, b, sat) {
        const t = v => clamp((Number(v) || 0) - 255, -255, 255);
        const gray = sat === undefined || sat === null ? 0 : clamp(Math.round((100 - (Number(sat) || 0)) * 2.55), 0, 255);
        return [t(r), t(g), t(b), gray];
    }
    Game_Screen.prototype.rrSpriteColor = function(name, r, g, b, sat) { const id = this.rrSpriteId(name, false); if (id) this.tintPicture(id, toneOf(r, g, b, sat), 1); };
    Game_Screen.prototype.rrSpriteColorTo = function(name, r, g, b, sat, ms) { const id = this.rrSpriteId(name, false); if (id) this.tintPicture(id, toneOf(r, g, b, sat), msToFrames(ms)); };
    Game_Screen.prototype.rrSpritePosition = function(name, variableX, variableY) {
        const p = this.rrSpritePicture(name);
        if (variableX) $gameVariables.setValue(Number(variableX), p ? Math.round(p.x()) : 0);
        if (variableY) $gameVariables.setValue(Number(variableY), p ? Math.round(p.y()) : 0);
    };

    // Sprite_Picture: map binding and layer placement.
    const _Sprite_Picture_updatePosition = Sprite_Picture.prototype.updatePosition;
    Sprite_Picture.prototype.updatePosition = function() {
        _Sprite_Picture_updatePosition.apply(this, arguments);
        const p = this.picture();
        const st = p && p._rrSprite;
        if (st && st.mapBound && $gameMap && SceneManager._scene instanceof Scene_Map) {
            this.x -= Math.round($gameMap.displayX() * $gameMap.tileWidth());
            this.y -= Math.round($gameMap.displayY() * $gameMap.tileHeight());
        }
    };

    /**
     * The plugin knows layers 0-9: 0-1 behind the map's parallax, 2 over the parallax and
     * under the tiles, 3 under the player, 4 over the player, 5-9 over the pictures.
     * Anything else is layer 0. Returns the tilemap z, "under" for the parallax's
     * underside, or null for the picture container.
     */
    function spriteLayer(layer) { const n = Math.floor(Number(layer) || 0); return n < 0 || n >= 10 ? 0 : n; }
    function layerZ(layer) {
        const n = spriteLayer(layer);
        if (n <= 1) return "under";
        if (n === 2) return -1;
        if (n === 3) return 2;
        if (n === 4) return 3.5;
        return null;
    }

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        this._rrPlaceLayeredPictures();
        this._rrUpdateTexts();
        this._rrUpdateParticles();
    };
    const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _Spriteset_Battle_update.call(this);
        this._rrUpdateTexts();
        this._rrUpdateParticles();
    };

    /** A holder just under the parallax for layers 0 and 1, created on first use. */
    Spriteset_Map.prototype._rrUnderParallaxLayer = function() {
        if (!this._rrUnderParallax) {
            this._rrUnderParallax = new Sprite();
            const at = this._parallax && this._parallax.parent === this._baseSprite ? this._baseSprite.getChildIndex(this._parallax) : 0;
            this._baseSprite.addChildAt(this._rrUnderParallax, at);
        }
        return this._rrUnderParallax;
    };
    Spriteset_Map.prototype._rrPlaceLayeredPictures = function() {
        if (!this._pictureContainer || !this._tilemap) return;
        const container = this._pictureContainer, tilemap = this._tilemap;
        const all = (this._rrPictureSprites || (this._rrPictureSprites = container.children.filter(c => c instanceof Sprite_Picture)));
        const byId = (a, b) => ((a.z || 0) - (b.z || 0)) || ((a._pictureId || 0) - (b._pictureId || 0));
        let resort = false, resortUnder = false;
        for (const sprite of all) {
            const p = sprite.picture();
            const named = !!(p && p._rrSprite);   // an ordinary picture stays in the picture container
            const layer = named ? p._rrSprite.layer : 0;
            const z = named ? layerZ(layer) : null;
            const want = z === "under" ? this._rrUnderParallaxLayer() : z !== null ? tilemap : container;
            if (sprite.parent !== want) { if (sprite.parent) sprite.parent.removeChild(sprite); want.addChild(sprite); resort = true; if (want === this._rrUnderParallax) resortUnder = true; }
            const wantZ = z === "under" ? spriteLayer(layer) : z !== null ? z : spriteLayer(layer);
            if (sprite.z !== wantZ) { sprite.z = wantZ; resort = true; if (want === this._rrUnderParallax) resortUnder = true; }
        }
        if (resort) {
            container.children.sort(byId);
            if (resortUnder && this._rrUnderParallax) this._rrUnderParallax.children.sort(byId);
            if (typeof tilemap._sortChildren === "function") tilemap._sortChildren();
        }
    };

    // Texts live in their own container above the pictures.
    Spriteset_Base.prototype._rrUpdateTexts = function() {
        if (!this._rrTextContainer) {
            this._rrTextContainer = new Sprite();
            this._rrTextSprites = {};
            const parent = this._pictureContainer ? this._pictureContainer.parent : this;
            parent.addChild(this._rrTextContainer);
            if (this._pictureContainer) parent.setChildIndex(this._rrTextContainer, parent.getChildIndex(this._pictureContainer) + 1);
        }
        const texts = $gameScreen.rrTexts();
        for (const id of Object.keys(texts)) {
            if (!this._rrTextSprites[id]) { const s = new Sprite_RRText(id); this._rrTextSprites[id] = s; this._rrTextContainer.addChild(s); }
        }
        for (const id of Object.keys(this._rrTextSprites)) {
            if (!texts[id]) { this._rrTextContainer.removeChild(this._rrTextSprites[id]); delete this._rrTextSprites[id]; }
        }
        this._rrTextContainer.children.sort((a, b) => ((a.z || 0) - (b.z || 0)) || (String(a._textId) < String(b._textId) ? -1 : 1));
    };

    // ---- particle effects --------------------------------------------------------------------

    const PFX_DEFAULT = () => ({ type: "burst", texture: "", amount: 50, simul: 2, velocity: [30, 30], angle: [0, 360], color0: [255, 255, 255], color1: [255, 255, 255], growth: [1, 1], randomPos: [0, 0], timeout: [30, 0], layer: 5, gravity: null, acceleration: null, interval: 1, screenRelative: false, generating: "standard", radius: 30, randomRadius: 0, streams: {}, tick: 0 });
    Game_Screen.prototype.rrPfx = function(name) { return (this._rrParticles || (this._rrParticles = {}))[String(name)] || null; };
    Game_Screen.prototype.rrPfxCreate = function(name, type) {
        const e = PFX_DEFAULT();
        e.type = String(type || "burst").toLowerCase() === "stream" ? "stream" : "burst";
        if (e.type === "stream") { e.amount = 10; e.simul = 1; }
        (this._rrParticles || (this._rrParticles = {}))[String(name)] = e;
    };
    Game_Screen.prototype.rrPfxDestroy = function(name) { if (this._rrParticles) delete this._rrParticles[String(name)]; };
    Game_Screen.prototype.rrPfxDestroyAll = function() { this._rrParticles = {}; };
    Game_Screen.prototype.rrPfxExists = function(name, switchId) { const has = !!this.rrPfx(name); if (switchId) $gameSwitches.setValue(Number(switchId), has); return has; };
    /** One setting: texture, amount, simul, velocity, angle, color0, color1, growth, randomPos, timeout, layer, gravity, screenRelative, generating, radius, randomRadius. */
    Game_Screen.prototype.rrPfxSet = function(name, key, ...values) {
        const e = this.rrPfx(name);
        if (!e) return;
        const nums = values.map(v => (typeof v === "number" ? v : Number(v)));
        switch (key) {
            case "texture": e.texture = pictureName(values[0]); break;
            case "amount": e.amount = Math.max(0, nums[0] || 0); break;
            case "simul": e.simul = Math.max(1, nums[0] || 1); break;
            case "velocity": e.velocity = [nums[0] || 0, nums[1] || 0]; break;
            case "angle": e.angle = [nums[0] || 0, nums[1] === undefined || isNaN(nums[1]) ? 360 : nums[1]]; break;
            case "color0": e.color0 = [nums[0] || 0, nums[1] || 0, nums[2] || 0]; break;
            case "color1": e.color1 = [nums[0] || 0, nums[1] || 0, nums[2] || 0]; break;
            case "growth": e.growth = [nums[0] || 1, nums[1] || 1]; break;
            case "randomPos": e.randomPos = [nums[0] || 0, nums[1] || 0]; break;
            case "timeout": e.timeout = [Math.max(1, nums[0] || 30), nums[1] || 0]; break;
            case "layer": e.layer = nums[0] || 0; break;
            case "gravity": e.gravity = [nums[0] || 0, nums[1] || 0]; break;
            case "acceleration": e.acceleration = [nums[0] || 0, nums[1] || 0, nums[2] || 0]; break;
            case "interval": e.interval = Math.max(1, nums[0] || 1); break;
            case "screenRelative": e.screenRelative = values[0] === true || String(values[0]).toLowerCase() === "true"; break;
            case "generating": e.generating = String(values[0]).toLowerCase() === "radial" ? "radial" : "standard"; break;
            case "radius": e.radius = nums[0] || 0; break;
            case "randomRadius": e.randomRadius = nums[0] || 0; break;
            default: break;
        }
    };
    Game_Screen.prototype.rrPfxBurst = function(name, x, y) { if (this.rrPfx(name)) (this._rrParticleBursts || (this._rrParticleBursts = [])).push({ name: String(name), x: Number(x) || 0, y: Number(y) || 0 }); };
    Game_Screen.prototype.rrPfxStart = function(name, stream, x, y) { const e = this.rrPfx(name); if (e) e.streams[String(stream)] = { x: Number(x) || 0, y: Number(y) || 0 }; };
    Game_Screen.prototype.rrPfxStop = function(name, stream) { const e = this.rrPfx(name); if (e) delete e.streams[String(stream)]; };
    Game_Screen.prototype.rrPfxStopAll = function(name) { const e = this.rrPfx(name); if (e) e.streams = {}; };
    Game_Screen.prototype.rrPfxSetPosition = function(name, stream, x, y) { const e = this.rrPfx(name); const s = e && e.streams[String(stream)]; if (s) { s.x = Number(x) || 0; s.y = Number(y) || 0; } };

    const rand = (spread) => (Math.random() * 2 - 1) * spread;
    function spawn(effect, ox, oy, layer) {
        const particles = [];
        for (let i = 0; i < effect.amount; i++) {
            let x = ox, y = oy, dir;
            if (effect.generating === "radial") {
                const a = (effect.angle[0] + rand(effect.angle[1] / 2)) * Math.PI / 180;
                const r = effect.radius + rand(effect.randomRadius);
                x += Math.cos(a) * r; y -= Math.sin(a) * r; dir = a;
            } else {
                x += rand(effect.randomPos[0]); y += rand(effect.randomPos[1]);
                dir = (effect.angle[0] + rand(effect.angle[1] / 2)) * Math.PI / 180;
            }
            const speed = (effect.velocity[0] + rand(effect.velocity[1])) / 60;
            particles.push({ x, y, vx: Math.cos(dir) * speed, vy: -Math.sin(dir) * speed, age: 0, life: effect.timeout[0] + effect.timeout[1], delay: effect.timeout[1], effect, layer });
        }
        return particles;
    }

    Spriteset_Base.prototype._rrUpdateParticles = function() {
        if (!this._rrParticleLayers) {
            this._rrParticleLayers = { low: new Sprite(), high: new Sprite() };
            this._rrParticleLayers.low.z = 2; this._rrParticleLayers.high.z = 3.5;
            this._rrParticles = [];
            this._rrParticleSprites = [];
            if (this._tilemap) { this._tilemap.addChild(this._rrParticleLayers.low); this._tilemap.addChild(this._rrParticleLayers.high); }
            else { this.addChild(this._rrParticleLayers.low); this.addChild(this._rrParticleLayers.high); }
        }
        const bursts = $gameScreen._rrParticleBursts || [];
        while (bursts.length) {
            const b = bursts.shift();
            const e = $gameScreen.rrPfx(b.name);
            if (e && e.type === "burst") this._rrParticles.push(...spawn(e, b.x, b.y, e.layer));
        }
        for (const e of Object.values($gameScreen._rrParticles || {})) {
            if (e.type !== "stream") continue;
            e.tick = (e.tick || 0) + 1;
            if (e.tick % Math.max(1, e.interval || 1) !== 0) continue;
            for (const s of Object.values(e.streams)) { const one = Object.assign({}, e, { amount: Math.max(1, Math.round(e.amount)) }); this._rrParticles.push(...spawn(one, s.x, s.y, e.layer)); }
        }
        const onMap = SceneManager._scene instanceof Scene_Map && $gameMap;
        const dx = onMap ? Math.round($gameMap.displayX() * $gameMap.tileWidth()) : 0, dy = onMap ? Math.round($gameMap.displayY() * $gameMap.tileHeight()) : 0;
        const live = [];
        for (const p of this._rrParticles) {
            p.age++;
            if (p.age > p.life) continue;
            if (p.effect.gravity) { const g = p.effect.gravity[0] * Math.PI / 180, s = p.effect.gravity[1] / 600; p.vx += Math.cos(g) * s; p.vy -= Math.sin(g) * s; }
            if (p.effect.acceleration) { const [ax, ay, str] = p.effect.acceleration; const ddx = ax - p.x, ddy = ay - p.y, d = Math.max(1, Math.hypot(ddx, ddy)); p.vx += ddx / d * str / 600; p.vy += ddy / d * str / 600; }
            p.x += p.vx; p.y += p.vy;
            live.push(p);
        }
        this._rrParticles = live.length > 6000 ? live.slice(live.length - 6000) : live;
        while (this._rrParticleSprites.length < this._rrParticles.length) { const s = new Sprite(); s.anchor.x = 0.5; s.anchor.y = 0.5; this._rrParticleSprites.push(s); }
        this._rrParticleSprites.forEach((sprite, i) => {
            const p = this._rrParticles[i];
            if (!p) { if (sprite.parent) sprite.parent.removeChild(sprite); sprite.visible = false; return; }
            const wantParent = p.layer <= 4 ? this._rrParticleLayers.low : this._rrParticleLayers.high;
            if (sprite.parent !== wantParent) { if (sprite.parent) sprite.parent.removeChild(sprite); wantParent.addChild(sprite); }
            sprite.visible = true;
            const e = p.effect;
            const bitmap = e.texture ? ImageManager.loadPicture(e.texture) : this._rrParticleDot();
            if (sprite.bitmap !== bitmap) sprite.bitmap = bitmap;
            const t = Math.max(0, Math.min(1, p.age / Math.max(1, p.life)));
            const size = e.growth[0] + (e.growth[1] - e.growth[0]) * t;
            sprite.scale.x = sprite.scale.y = size;
            const c = [0, 1, 2].map(k => Math.round(e.color0[k] + (e.color1[k] - e.color0[k]) * t));
            sprite.tint = (clamp(c[0], 0, 255) << 16) | (clamp(c[1], 0, 255) << 8) | clamp(c[2], 0, 255);
            sprite.opacity = p.age <= p.delay ? 255 : Math.round(255 * (1 - (p.age - p.delay) / Math.max(1, e.timeout[0])));
            sprite.x = e.screenRelative ? p.x : p.x - dx;
            sprite.y = e.screenRelative ? p.y : p.y - dy;
        });
    };
    Spriteset_Base.prototype._rrParticleDot = function() {
        if (!this._rrDot) { this._rrDot = new Bitmap(4, 4); this._rrDot.fillAll("#ffffff"); }
        return this._rrDot;
    };
})();

// ---- picture effects: rotation and wave, as RPG Maker 2003 had them ------------
// $gameScreen.rrPictureEffect(id, mode, power): mode 1 spins the picture by
// power/256 of a turn per frame; mode 2 ripples it, each scanline shifted
// sideways by 4·power·sin(phase + row·2π/32) with the phase advancing 8/256
// of a turn a frame (a 32 px wavelength in the picture's own pixels);
// mode 0 stops either and squares the picture up. The ripple is a WebGL
// filter, so on a renderer without PIXI's GlProgram the picture stays still.
(function() {
    function waveFilter() {
        if (!PIXI.GlProgram || !PIXI.Filter || !PIXI.defaultFilterVert) return null;
        const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uDepth;
uniform float uPhase;
uniform float uWavelength;
void main() {
    float row = vTextureCoord.y * uInputSize.y;
    float offset = 2.0 * uDepth * sin(uPhase + row * 6.2831853 / uWavelength);
    vec2 uv = vec2(vTextureCoord.x - offset / uInputSize.x, vTextureCoord.y);
    if (uv.x < uInputClamp.x || uv.x > uInputClamp.z) { finalColor = vec4(0.0); return; }
    finalColor = texture(uTexture, uv);
}`;
        try {
            const glProgram = PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment, name: "rr-picture-wave" });
            const filter = new PIXI.Filter({ glProgram, resources: { rrWave: { uDepth: { value: 0, type: "f32" }, uPhase: { value: 0, type: "f32" }, uWavelength: { value: 32, type: "f32" } } } });
            filter.padding = 4;
            return filter;
        } catch (e) { console.error("rrPictureEffect: wave filter unavailable", e); return null; }
    }

    Game_Screen.prototype.rrPictureEffect = function(id, mode, power) {
        const p = this.picture(Number(id));
        if (!p) return;
        mode = Number(mode) || 0; power = Number(power) || 0;
        p._rrEffect = mode === 1 || mode === 2 ? { mode, power, phase: 0 } : null;
        if (mode === 1) { p._rotationSpeed = power * 360 / 256 * 2; }
        else { p._rotationSpeed = 0; if (mode === 0) p._angle = 0; }
    };

    const _Game_Picture_update = Game_Picture.prototype.update;
    Game_Picture.prototype.update = function() {
        _Game_Picture_update.call(this);
        const e = this._rrEffect;
        if (e && e.mode === 2) e.phase = (e.phase + 8) % 256;
        this._rrStepTweens();
    };

    const _Sprite_Picture_updateOther = Sprite_Picture.prototype.updateOther;
    Sprite_Picture.prototype.updateOther = function() {
        _Sprite_Picture_updateOther.apply(this, arguments);
        const p = this.picture();
        const e = p && p._rrEffect;
        if (e && e.mode === 2 && e.power !== 0) {   // a negative power is the same wave, mirrored
            if (!this._rrWaveFilter) { this._rrWaveFilter = waveFilter(); if (!this._rrWaveFilter) return; }
            if (!this.filters || !this.filters.includes(this._rrWaveFilter)) this.filters = [...(this.filters || []), this._rrWaveFilter];
            const u = this._rrWaveFilter.resources.rrWave.uniforms;
            u.uDepth = 2 * e.power * (this.scale.x || 1);
            u.uPhase = e.phase * 2 * Math.PI / 256;
            u.uWavelength = 32 * Math.abs(this.scale.y || 1);
            this._rrWaveFilter.padding = Math.ceil(4 * Math.abs(e.power) * (this.scale.x || 1)) + 2;
        } else if (this._rrWaveFilter && this.filters && this.filters.includes(this._rrWaveFilter)) {
            this.filters = this.filters.filter(f => f !== this._rrWaveFilter);
        }
    };
})();
