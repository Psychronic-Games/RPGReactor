//=============================================================================
// reactor_screen_fx.js - Screen texts, named sprites and particle effects
//=============================================================================
// Three script-driven screen features, all kept in $gameScreen so they save:
//
//   $gameScreen.rrWriteText(id, x, y, text, fixed, color, pictureId) and the
//   rrAppendLine / rrAppendText / rrChangeText / rrMoveText / rrRemoveText /
//   rrRemoveAllTexts family draw text at a screen position (or, fixed, a map
//   position) in the window font, in a text colour of the window skin, with
//   \V[n], \N[n], \P[n], \G and \C[n] codes. A text belongs to a picture:
//   it shows while that picture does, just above it and at its opacity.
//
//   $gameScreen.rrSpriteAdd(name, image, blend, layer, x, y, scale, angle, z)
//   and the rrSprite* family are pictures addressed by name instead of
//   number, on one of 2003 1.12's map layers as pictures are (1 over the
//   parallax, 2-6 among the tiles and characters, 7-8 with the pictures,
//   9 over the windows, 10 over those, none over all) with a z order within
//   it (lower in front), a map binding that scrolls with the map, eased moves,
//   scales, opacity, rotation and colour fades.
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
            // the text plugin's own: \i[n] / \I[n] an item's name / description (an imported 2003 item id lives in
            // one of the three tables), \t[n] / \T[n] a skill's, \x[id] another screen text's first line
            s = s.replace(/\\([iI])\[(\d+)\]/g, (_, c, n) => { const it = $dataItems[n] || $dataWeapons[n] || $dataArmors[n]; return it ? (c === "i" ? it.name : it.description) : ""; });
            s = s.replace(/\\([tT])\[(\d+)\]/g, (_, c, n) => { const sk = $dataSkills[n]; return sk ? (c === "t" ? sk.name : sk.description) : ""; });
            s = s.replace(/\\[xX]\[([^\]]*)\]/g, (_, id) => { const t = $gameScreen.rrText(id); return t ? String(t.lines[0] ?? "") : ""; });
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
        // A text belongs to a picture (the plugin's last argument): it shows while that picture is shown,
        // just above it and at its opacity, so fading the picture fades the text. 0 is no picture.
        const owner = t.layer > 0 ? $gameScreen.picture(t.layer) : null;
        if (t.layer > 0 && !owner) { this.visible = false; return; }
        this.visible = true;
        this.opacity = owner ? owner.opacity() : 255;
        const values = t.lines.map(expandCodes).join("\n") + "|" + t.color;
        if (t.rev !== this._rev || values !== this._values) { this._rev = t.rev; this.redraw(t); }
        // "center" puts the text's middle on x and "right" its end; the plugin's 2 px drop stays
        const shift = t.align === "center" ? Math.round(this.bitmap.width / 2) : t.align === "right" ? this.bitmap.width : 0;
        // "fixed" fixes the text to the map, so it scrolls with it; otherwise it stays on the screen.
        if (!t.fixed || !$gameMap || typeof $gameMap.displayX !== "function" || !(SceneManager._scene instanceof Scene_Map)) { this.x = t.x - shift; this.y = t.y + 2; }
        else { this.x = Math.round(t.x - $gameMap.displayX() * $gameMap.tileWidth()) - shift; this.y = Math.round(t.y - $gameMap.displayY() * $gameMap.tileHeight()) + 2; }
        this.z = this._rrZ !== undefined ? this._rrZ : t.layer;
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
        let n = String(image || "").replace(/\\/g, "/").replace(/\.(png|bmp|xyz|jpe?g|gif)$/i, "");
        n = n.replace(/^\/?Picture\//i, "");
        return n;
    }
    const BLEND = { mix: 0, normal: 0, add: 1, additive: 1, multiply: 2, screen: 3, sub: 2 };

    Game_Screen.prototype.rrSpriteAdd = function(name, image, blend, layer, x, y, scale, angle, z) {
        const id = this.rrSpriteId(name, true);
        if (!id) return;
        const s = scale === undefined || scale === null || scale === "" || isNaN(Number(scale)) ? 100 : Number(scale);   // 0 is a real start size: sprites grow in from it
        this.showPicture(id, pictureName(image), 1, Number(x) || 0, Number(y) || 0, s, s, 255, BLEND[String(blend || "mix").toLowerCase()] || 0);
        const picture = this.picture(id);
        picture._angle = Number(angle) || 0;
        const st = spriteState(picture);
        st.layer = Number(layer) || 0;
        st.z = Number(z) || 0;
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
    Game_Screen.prototype.rrSpriteZ = function(name, z) { const p = this.rrSpritePicture(name); if (p) spriteState(p).z = Number(z) || 0; };
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
    // The x and y moves run on their own clocks: a move on one axis (null, or an offset of 0) leaves the other
    // travelling, so Deep 8's rabbit hops (move by 0, -60) on its way across to the hero (move x to).
    const given = (v) => v !== null && v !== undefined;
    Game_Screen.prototype.rrSpriteMoveTo = function(name, x, y, ms, easing) { const p = this.rrSpritePicture(name); if (p) { if (given(x)) setTween(p, "x", Number(x) || 0, ms, easing); if (given(y)) setTween(p, "y", Number(y) || 0, ms, easing); } };
    Game_Screen.prototype.rrSpriteMoveBy = function(name, dx, dy, ms, easing) { const p = this.rrSpritePicture(name); if (p) { if (Number(dx)) setTween(p, "x", p._x + Number(dx), ms, easing); if (Number(dy)) setTween(p, "y", p._y + Number(dy), ms, easing); } };
    Game_Screen.prototype.rrSpriteScaleTo = function(name, sx, sy, ms, easing) { const p = this.rrSpritePicture(name); if (p) { if (sx !== null && sx !== undefined) setTween(p, "scaleX", Number(sx) || 0, ms, easing); if (sy !== null && sy !== undefined) setTween(p, "scaleY", Number(sy) || 0, ms, easing); } };
    // A sprite's angle turns clockwise, as a picture's does, but rotating *by* a positive amount turns it
    // counter-clockwise (settled against Deep 8's shipped player: its trees fall right at -90, and the
    // halves of a tree tilted by -50 are added at angle 50).
    Game_Screen.prototype.rrSpriteRotateBy = function(name, degrees, ms, easing) {
        const p = this.rrSpritePicture(name);
        if (!p) return;
        const state = p.reactorPictureState ? p.reactorPictureState() : null;
        const frames = msToFrames(ms);
        if (state) state.angleTween = { start: p._angle, target: p._angle - (Number(degrees) || 0), duration: frames, whole: frames, easing: easingType(easing) };
        else p._angle -= Number(degrees) || 0;
    };
    /** Turn to an absolute angle (clockwise, as rrSpriteAdd's), going "cw" or "ccw" the short way round the circle in that direction. */
    Game_Screen.prototype.rrSpriteRotateTo = function(name, direction, degrees, ms, easing) {
        const p = this.rrSpritePicture(name);
        if (!p) return;
        const ccw = /^cc/i.test(String(direction));
        let target = Number(degrees) || 0;
        const turn = ((target - p._angle) % 360 + 360) % 360;   // clockwise distance, 0-359
        target = p._angle + (ccw ? (turn === 0 ? 0 : turn - 360) : turn);
        const state = p.reactorPictureState ? p.reactorPictureState() : null;
        const frames = msToFrames(ms);
        if (state && frames > 1) state.angleTween = { start: p._angle, target, duration: frames, whole: frames, easing: easingType(easing) };
        else p._angle = target;
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
    /** Colour as the plugin gives it, a 2003 picture colour: r, g, b and sat in percent, 100 unchanged (most of Deep 8's calls reset with 100, 100, 100, 100) → an MZ tone. */
    function toneOf(r, g, b, sat) {
        const t = v => clamp(Math.round(((v === undefined || v === null || isNaN(Number(v)) ? 100 : Number(v)) - 100) * 2.55), -255, 255);
        const gray = sat === undefined || sat === null || isNaN(Number(sat)) ? 0 : clamp(Math.round((100 - Number(sat)) * 2.55), 0, 255);
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
        // Pixel art lands on whole pixels, as the old engines place it (EasyRPG centres with width / 2 in
        // integers): a centred picture of odd size otherwise sits half a pixel off and its rows double or
        // drop, which reads as blur next to window text (Deep 8's 320x77 "Shift: Info" bar).
        if (this.rotation === 0 && $dataSystem && $dataSystem.advanced && $dataSystem.advanced.pixelatedRendering === true) {
            const left = this.x - this.anchor.x * this.width, top = this.y - this.anchor.y * this.height;
            this.x += Math.round(left) - left;
            this.y += Math.round(top) - top;
        }
    };

    // Map layers of 2003 1.12, shared by pictures and named sprites (EasyRPG's GetPriorityForMapLayer, the
    // sprite plugin's settled against Deep 8's shipped player): 1 with the panorama, 2 over the lower tiles,
    // 3 under characters, 4 with the player, 5 over the upper tiles, 6 over flying characters, 7 the pictures,
    // 8 over them (animations), 9 over the windows, 10 over those (timers); 0 is not shown on the map.
    // A sprite never given a layer is over all of them (11). Within a layer a picture is ordered by id x 10
    // and a sprite by its z, a lower z in front: the title's letters (z 5) cover the glows behind them (z 13),
    // and patched to z 1 the glows cover the letters.
    function spriteLayer(layer) { const n = Math.floor(Number(layer) || 0); return n < 1 || n > 10 ? 11 : n; }
    const legacyPictureLayers = () => !!(typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.rrPictureLayers);
    /** The map layer a picture draws on, or null to leave it where MZ puts it. */
    function mapLayerOf(p) {
        if (p._rrSprite) return spriteLayer(p._rrSprite.layer);
        if (p._rrMapLayer !== undefined) return p._rrMapLayer;
        return legacyPictureLayers() ? 7 : null;
    }
    function layerZ(n) {
        if (n === 1) return "panorama";
        if (n >= 2 && n <= 6) return { 2: 0.5, 3: 1.5, 4: 3.5, 5: 4.5, 6: 5.5 }[n];
        if (n >= 9) return "top";
        return null;   // 7 and 8: the picture container
    }

    Game_Screen.prototype.rrPictureLayer = function(id, mapLayer, battleLayer) {
        const p = this.picture(id);
        if (!p) return;
        p._rrMapLayer = Math.max(0, Math.min(10, Number(mapLayer) || 0));
        p._rrBattleLayer = Math.max(0, Math.min(5, Number(battleLayer) || 0));
    };
    const _Game_Picture_show = Game_Picture.prototype.show;
    Game_Picture.prototype.show = function() {
        _Game_Picture_show.apply(this, arguments);
        this._rrMapLayer = undefined;
        this._rrBattleLayer = undefined;
    };
    /** Whether a picture is shown where the party is: 2003 1.12 keeps a picture without a battle layer out of battles. */
    function pictureShownHere(p) {
        if ($gameParty.inBattle()) return p._rrSprite ? true : p._rrBattleLayer !== undefined ? p._rrBattleLayer > 0 : !legacyPictureLayers();
        const layer = mapLayerOf(p);
        return layer === null || layer > 0;
    }
    const _Sprite_Picture_updateLayer = Sprite_Picture.prototype.update;
    Sprite_Picture.prototype.update = function() {
        _Sprite_Picture_updateLayer.apply(this, arguments);
        const p = this.picture();
        if (p && this.visible && !pictureShownHere(p)) this.visible = false;
    };

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

    /** A holder just over the parallax and under the tiles for layer 1, created on first use. */
    Spriteset_Map.prototype._rrUnderParallaxLayer = function() {
        if (!this._rrUnderParallax) {
            this._rrUnderParallax = new Sprite();
            const at = this._parallax && this._parallax.parent === this._baseSprite ? this._baseSprite.getChildIndex(this._parallax) + 1 : 0;
            this._baseSprite.addChildAt(this._rrUnderParallax, at);
        }
        return this._rrUnderParallax;
    };
    /** A holder over the scene's windows for layer 9 and sprites never given a layer. */
    Spriteset_Map.prototype._rrTopLayer = function() {
        // the spriteset's own scene, never SceneManager._scene: while the map hands over to a menu the
        // current scene is already the menu, and the map's pictures must not follow into it
        const scene = this.parent;
        this._rrTop = this._rrTop || new Sprite();
        if (!scene) return this._rrTop;
        const windows = scene._windowLayer && scene._windowLayer.parent === scene ? scene.getChildIndex(scene._windowLayer) : scene.children.length - 1;
        if (this._rrTop.parent !== scene) scene.addChildAt(this._rrTop, Math.min(scene.children.length, windows + 1));
        else if (scene.getChildIndex(this._rrTop) !== windows + 1 && scene.getChildIndex(this._rrTop) < windows) scene.setChildIndex(this._rrTop, windows);
        return this._rrTop;
    };
    Spriteset_Map.prototype._rrPlaceLayeredPictures = function() {
        if (!this._pictureContainer || !this._tilemap) return;
        const container = this._pictureContainer, tilemap = this._tilemap;
        const all = (this._rrPictureSprites || (this._rrPictureSprites = container.children.filter(c => c instanceof Sprite_Picture)));
        const byZ = (a, b) => ((a.z || 0) - (b.z || 0)) || ((a._pictureId || 0) - (b._pictureId || 0));
        const moved = new Set();
        for (const sprite of all) {
            const p = sprite.picture();
            if (!p || !p.name()) continue;
            const layer = mapLayerOf(p);
            if (layer === null || layer === 0) continue;
            const slot = layerZ(layer);
            const want = slot === "panorama" ? this._rrUnderParallaxLayer() : slot === "top" ? this._rrTopLayer() : typeof slot === "number" ? tilemap : container;
            // a picture is ordered by id x 10, a sprite by its own z (a lower z in front), both within their layer
            const order = p._rrSprite ? -(Number(p._rrSprite.z) || 0) : (sprite._pictureId || 0) * 10;
            const wantZ = typeof slot === "number" ? slot + order / 1e6 : layer * 1e6 + order;
            if (sprite.parent !== want) { if (sprite.parent) sprite.parent.removeChild(sprite); want.addChild(sprite); moved.add(want); }
            if (sprite.z !== wantZ) { sprite.z = wantZ; moved.add(want); }
        }
        for (const holder of moved) {
            if (holder === tilemap) { if (typeof tilemap._sortChildren === "function") tilemap._sortChildren(); }
            else holder.children.sort(byZ);
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
            if (!texts[id]) { const gone = this._rrTextSprites[id]; if (gone.parent) gone.parent.removeChild(gone); delete this._rrTextSprites[id]; }
        }
        // A text draws just over the picture it belongs to, wherever that picture's layer put it (EasyRPG leaves
        // room at each picture's priority for the text plugin): Deep 8's title pages would otherwise sit under
        // the layer-10 black they fade in from.
        const layered = legacyPictureLayers();
        const pictures = this._rrPictureSprites || (this._pictureContainer ? this._pictureContainer.children : []);
        const resort = new Set();
        for (const id of Object.keys(this._rrTextSprites)) {
            const sprite = this._rrTextSprites[id], t = texts[id];
            const owner = layered && t && t.layer > 0 ? pictures.find(p => p._pictureId === t.layer) : null;
            const parent = owner && owner.parent ? owner.parent : this._rrTextContainer;
            sprite._rrZ = parent === this._rrTextContainer ? undefined : owner.z + (parent === this._tilemap ? 1e-7 : 1);
            if (sprite.parent !== parent) { if (sprite.parent) sprite.parent.removeChild(sprite); parent.addChild(sprite); resort.add(parent); }
            if (sprite._rrZ !== undefined && sprite.z !== sprite._rrZ) { sprite.z = sprite._rrZ; resort.add(parent); }
        }
        this._rrTextContainer.children.sort((a, b) => ((a.z || 0) - (b.z || 0)) || (String(a._textId) < String(b._textId) ? -1 : 1));
        for (const parent of resort) {
            if (parent === this._rrTextContainer) continue;
            if (parent === this._tilemap) { if (typeof parent._sortChildren === "function") parent._sortChildren(); }
            else parent.children.sort((a, b) => ((a.z || 0) - (b.z || 0)) || ((a._pictureId || 0) - (b._pictureId || 0)));
        }
    };

    // ---- particle effects --------------------------------------------------------------------

    const PFX_DEFAULT = () => ({ type: "burst", texture: "", amount: 50, simul: 2, velocity: [30, 30], angle: [0, 360], color0: [100, 100, 100], color1: [100, 100, 100], growth: [1, 1], randomPos: [0, 0], timeout: [30, 0], layer: 0, gravity: null, acceleration: null, interval: 1, screenRelative: false, generating: "standard", radius: 30, randomRadius: 0, streams: {}, tick: 0 });
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
            case "growth": e.growth = [Number.isFinite(nums[0]) ? nums[0] : 1, Number.isFinite(nums[1]) ? nums[1] : 1]; break;   // 0 is a real size: Yavar-5's rocks and flames grow from nothing
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
        if (!this._rrParticleSprites) {
            this._rrParticleHolders = {};
            this._rrParticles = [];
            this._rrParticleSprites = [];
        }
        // A burst or stream point is on the screen when it fires; an effect that is not screen-relative then
        // stays where it was on the map while the view moves (so it is stored in map pixels).
        const onMap = SceneManager._scene instanceof Scene_Map && $gameMap;
        const dx = onMap ? Math.round($gameMap.displayX() * $gameMap.tileWidth()) : 0, dy = onMap ? Math.round($gameMap.displayY() * $gameMap.tileHeight()) : 0;
        const at = (e, x, y) => (e.screenRelative ? [x, y] : [x + dx, y + dy]);
        const bursts = $gameScreen._rrParticleBursts || [];
        while (bursts.length) {
            const b = bursts.shift();
            const e = $gameScreen.rrPfx(b.name);
            if (e && e.type === "burst") this._rrParticles.push(...spawn(e, ...at(e, b.x, b.y), e.layer));
        }
        for (const e of Object.values($gameScreen._rrParticles || {})) {
            if (e.type !== "stream") continue;
            e.tick = (e.tick || 0) + 1;
            if (e.tick % Math.max(1, e.interval || 1) !== 0) continue;
            for (const s of Object.values(e.streams)) { const one = Object.assign({}, e, { amount: Math.max(1, Math.round(e.amount)) }); this._rrParticles.push(...spawn(one, ...at(e, s.x, s.y), e.layer)); }
        }
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
            const wantParent = this._rrParticleHolder(p.layer);
            if (sprite.parent !== wantParent) { if (sprite.parent) sprite.parent.removeChild(sprite); wantParent.addChild(sprite); }
            sprite.visible = true;
            const e = p.effect;
            const bitmap = e.texture ? ImageManager.loadPicture(e.texture) : this._rrParticleDot();
            if (sprite.bitmap !== bitmap) sprite.bitmap = bitmap;
            const t = Math.max(0, Math.min(1, p.age / Math.max(1, p.life)));
            const size = e.growth[0] + (e.growth[1] - e.growth[0]) * t;
            sprite.scale.x = sprite.scale.y = size;
            const c = [0, 1, 2].map(k => Math.round(e.color0[k] + (e.color1[k] - e.color0[k]) * t));
            // colours are 0-255 multipliers of the texture, so 100 draws it at 39%: measured against the shipped
            // Deep 8 player, whose "RetardHorns" spore cloud (20 -> 100 over a particle's life) settles at 13% of
            // the texture's colour where a percent reading gave 37%. A tint only darkens; 255 draws unchanged.
            const tint = (v) => Math.round(clamp(v, 0, 255));
            sprite.tint = (tint(c[0]) << 16) | (tint(c[1]) << 8) | tint(c[2]);
            sprite.opacity = p.age <= p.delay ? 255 : Math.round(255 * (1 - (p.age - p.delay) / Math.max(1, e.timeout[0])));
            sprite.x = e.screenRelative ? p.x : p.x - dx;
            sprite.y = e.screenRelative ? p.y : p.y - dy;
        });
    };
    /**
     * The holder a particle layer draws in: the same map layers as sprites and pictures (EasyRPG's particle
     * plugin), with an unset layer (0) over everything, so Deep 8's engine exhaust shows over its ship and
     * the rocks of Yavar-5 fly over the planet. In battle every layer shares one holder over the pictures.
     */
    Spriteset_Base.prototype._rrParticleHolder = function(layer) {
        const n = this._tilemap ? spriteLayer(layer) : 0;
        let holder = this._rrParticleHolders[n];
        if (holder && holder.parent && (n < 9 || holder.parent === SceneManager._scene)) return holder;
        holder = holder || (this._rrParticleHolders[n] = new Sprite());
        if (!this._tilemap) { this.addChild(holder); return holder; }
        const slot = layerZ(n);
        const parent = slot === "panorama" ? this._rrUnderParallaxLayer() : slot === "top" ? this._rrTopLayer() : typeof slot === "number" ? this._tilemap : this._pictureContainer;
        holder.z = typeof slot === "number" ? slot + 0.9 : n * 1e6 + 9e5;   // over the sprites and pictures of its layer
        parent.addChild(holder);
        if (parent === this._tilemap) { if (typeof parent._sortChildren === "function") parent._sortChildren(); }
        else parent.children.sort((a, b) => ((a.z || 0) - (b.z || 0)) || ((a._pictureId || 0) - (b._pictureId || 0)));
        return holder;
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

    // RPG Maker 2003 1.12 spritesheet pictures: the image is cols × rows frames and the picture shows one,
    // counted row by row, or steps through them every `speed` frames (erasing itself after one pass when
    // `once`). A frame outside the sheet with no animation shows nothing. EasyRPG's rules.
    Game_Screen.prototype.rrPictureFrames = function(id, cols, rows, frame, speed, once) {
        const p = this.picture(Number(id));
        if (!p) return;
        p._rrSheet = { cols: Math.max(1, Number(cols) || 1), rows: Math.max(1, Number(rows) || 1), frame: Number(frame) || 0, speed: Math.max(0, Number(speed) || 0), once: !!once, frames: 0 };
    };

    const _Game_Picture_updateSheet = Game_Picture.prototype.update;
    Game_Picture.prototype.update = function() {
        _Game_Picture_updateSheet.call(this);
        const s = this._rrSheet;
        if (!s || s.speed <= 0 || ++s.frames <= s.speed) return;
        s.frames = 1;
        if (++s.frame >= s.cols * s.rows) {
            s.frame = 0;
            if (s.once) this._rrSheetDone = true;
        }
    };

    const _Game_Screen_updatePictures = Game_Screen.prototype.updatePictures;
    Game_Screen.prototype.updatePictures = function() {
        _Game_Screen_updatePictures.call(this);
        for (let i = 0; i < this._pictures.length; i++) if (this._pictures[i] && this._pictures[i]._rrSheetDone) this._pictures[i] = null;
    };

    const _Sprite_Picture_updateSheet = Sprite_Picture.prototype.update;
    Sprite_Picture.prototype.update = function() {
        _Sprite_Picture_updateSheet.call(this);
        const picture = this.picture(), s = picture && picture._rrSheet, bmp = this.bitmap;
        if (!bmp || !bmp.isReady()) return;
        if (s && s.cols * s.rows > 1) {
            if (s.speed === 0 && (s.frame < 0 || s.frame >= s.cols * s.rows)) { this.visible = false; return; }
            const sw = Math.floor(bmp.width / s.cols), sh = Math.floor(bmp.height / s.rows);
            this.setFrame(sw * (s.frame % s.cols), sh * (Math.floor(s.frame / s.cols) % s.rows), sw, sh);
            this._rrSheetFrame = true;
        } else if (this._rrSheetFrame) {
            this.setFrame(0, 0, bmp.width, bmp.height);
            this._rrSheetFrame = false;
        }
    };

    // RPG Maker 2000/2003 erase a picture when the party changes map, unless the Show Picture
    // said to keep it (2003's own flag). System.json rrPicturesEraseOnMapChange turns that on,
    // so MV and MZ pictures keep persisting. Named sprites are not pictures there: their slots
    // (advanced.rrNamedSpriteBase up) are left alone.
    Game_Screen.prototype.rrKeepPicture = function(id) {
        const p = this.picture(Number(id));
        if (p) p._rrKeep = true;
    };

    // The sprite plugin's named sprites go with the map too: Deep 8 never removes the ship it lands on
    // map 25, and the old player shows no trace of it on map 27.
    Game_Screen.prototype.rrEraseOnMapChange = function() {
        this.rrSpriteRemoveAll();
        const base = Number($dataSystem.advanced && $dataSystem.advanced.rrNamedSpriteBase) || Infinity;
        for (let id = 1; id < base && id <= this.maxPictures(); id++) {
            const p = this.picture(id);
            if (p && !p._rrKeep) this.erasePicture(id);
        }
    };

    // A 2000/2003 picture shown "fixed to the map" is placed on the screen like any other, then moves
    // with every map scroll after that, so it stays over the same ground (trees drawn as pictures).
    Game_Screen.prototype.rrPictureFixToMap = function(id) {
        const p = this.picture(Number(id));
        if (p) p._rrFixedToMap = true;
    };

    Game_Screen.prototype.rrScrollFixedPictures = function(dx, dy) {
        for (const p of this._pictures) {
            if (!p || !p._rrFixedToMap) continue;
            p._x -= dx; p._targetX -= dx;
            p._y -= dy; p._targetY -= dy;
        }
    };

    // The distance the view really moved, in pixels: a looping map wraps, an edge stops it.
    const scrolled = (before, after, size) => {
        let d = after - before;
        if (size > 0 && Math.abs(d) > size / 2) d -= Math.sign(d) * size;
        return d;
    };
    for (const name of ["scrollDown", "scrollUp", "scrollLeft", "scrollRight"]) {
        const base = Game_Map.prototype[name];
        Game_Map.prototype[name] = function(distance) {
            const x = this._displayX, y = this._displayY;
            base.call(this, distance);
            if (typeof $gameScreen === "undefined" || !$gameScreen) return;
            const dx = scrolled(x, this._displayX, this.isLoopHorizontal() ? this.width() : 0) * this.tileWidth();
            const dy = scrolled(y, this._displayY, this.isLoopVertical() ? this.height() : 0) * this.tileHeight();
            if (dx || dy) $gameScreen.rrScrollFixedPictures(dx, dy);
        };
    }

    // RPG Maker 2000/2003 panoramas that neither scroll nor loop move with the camera in proportion
    // (System.json rrLegacyParallax): across the map's scroll range the image slides from its left edge
    // to its right, so one as large as the map is fixed to it. MZ pins such a parallax to the screen.
    // EasyRPG's Parallax::ResetPositionX/Y.
    const legacyPanorama = (bitmapSize, screen, tiles, tile, display, loops) => {
        if (loops) return null;
        const perScreen = Math.ceil(screen / tile);
        if (tiles <= perScreen || bitmapSize <= screen) return 0;
        const range = (tiles - perScreen) * tile;
        return Math.floor(Math.min(range, bitmapSize - screen) * display * tile / range);
    };
    const _Spriteset_Map_updateParallax = Spriteset_Map.prototype.updateParallax;
    Spriteset_Map.prototype.updateParallax = function() {
        _Spriteset_Map_updateParallax.call(this);
        const bitmap = this._parallax && this._parallax.bitmap;
        if (!bitmap || !bitmap.isReady() || !$dataSystem || !$dataSystem.rrLegacyParallax || $gameMap._parallaxZero) return;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const ox = legacyPanorama(bitmap.width, Graphics.width, $gameMap.width(), tw, $gameMap.displayX(), $gameMap._parallaxLoopX || $gameMap.isLoopHorizontal());
        const oy = legacyPanorama(bitmap.height, Graphics.height, $gameMap.height(), th, $gameMap.displayY(), $gameMap._parallaxLoopY || $gameMap.isLoopVertical());
        if (ox !== null) this._parallax.origin.x = ox;
        if (oy !== null) this._parallax.origin.y = oy;
    };

    // A loaded save or a re-entered map scene brings the map data back as authored: re-apply the
    // 2000/2003 tile substitutions $gameMap keeps (Game_Map.rrTileSubstitute, reactor_objects.js).
    // RPG Maker 2000/2003 Erase Screen lasts through teleports but not through another scene: handing the map
    // to the save screen, the menu or a shop shows it again (EasyRPG's Scene_Map::TransitionOut clears
    // screen_erased_by_event for all but battle and debug). Deep 8 erases the screen for its menu map and
    // saves from there, so without this every save came back to black. System.json rrLegacyEraseScreen.
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        const next = SceneManager._nextScene;
        const keeps = !next || next instanceof Scene_Map || next instanceof Scene_Battle || (typeof Scene_Debug !== "undefined" && next instanceof Scene_Debug) || next instanceof Scene_Gameover || next instanceof Scene_Title;
        if (!keeps && $dataSystem && $dataSystem.rrLegacyEraseScreen && $gameScreen.brightness() < 255) {
            $gameScreen._brightness = 255;
            $gameScreen._fadeOutDuration = 0;
            $gameScreen._fadeInDuration = 0;
        }
        _Scene_Map_terminate.apply(this, arguments);
    };

    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);
        if ($gameMap._rrTileSub) $gameMap.rrApplyTileSub(false);
    };

    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        if (this.isTransferring() && $dataSystem && $dataSystem.rrPicturesEraseOnMapChange
            && this._newMapId !== $gameMap.mapId()) {
            $gameScreen.rrEraseOnMapChange();
        }
        _Game_Player_performTransfer.call(this);
    };
})();
