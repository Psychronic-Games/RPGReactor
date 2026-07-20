//=============================================================================
// reactor_picture_extensions.js - Extended picture event commands
//=============================================================================

(function() {
    "use strict";

    const STATE_KEY = "_reactorPictureExtensions";

    function finite(value, min, max) {
        return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
    }

    function integer(value, min, max) {
        return finite(value, min, max) && Math.floor(value) === value;
    }

    function reference(value, allowDirectZero) {
        if (!value || (value.source !== "direct" && value.source !== "variable")) return null;
        const minimum = allowDirectZero && value.source === "direct" ? 0 : 1;
        if (!integer(value.value, minimum, 999999)) return null;
        return { source: value.source, value: value.value };
    }

    function resolveReference(value, allowDirectZero) {
        const ref = reference(value, allowDirectZero);
        if (!ref) return null;
        const result = ref.source === "variable" ? $gameVariables.value(ref.value) : ref.value;
        const number = Number(result);
        if (!Number.isFinite(number) || Math.floor(number) !== number) return null;
        return number;
    }

    function validBlend(value) {
        return value === "overlay" || integer(value, 0, 3);
    }

    function validPosition(value) {
        return value
            && (value.source === "direct" || value.source === "variable")
            && integer(value.x, -999999, 999999)
            && integer(value.y, -999999, 999999);
    }

    function resolvePosition(value) {
        if (!validPosition(value)) return null;
        if (value.source === "direct") return { x: value.x, y: value.y };
        const x = $gameVariables.value(value.x);
        const y = $gameVariables.value(value.y);
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
        return { x: Number(x), y: Number(y) };
    }

    function validAnchor(value) {
        return value && finite(value.x, -100, 100) && finite(value.y, -100, 100);
    }

    function validWave(value) {
        return value
            && finite(value.amplitudeX, -999999, 999999)
            && finite(value.amplitudeY, -999999, 999999)
            && finite(value.period, 1, 999999)
            && finite(value.phase, -360000, 360000);
    }

    function ensureState(picture) {
        let state = picture[STATE_KEY];
        if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
        state.anchor = validAnchor(state.anchor) ? state.anchor : null;
        state.wave = validWave(state.wave) ? state.wave : null;
        state.overlay = state.overlay === "overlay" ? "overlay" : null;
        state.angleTween = state.angleTween && typeof state.angleTween === "object"
            ? state.angleTween : null;
        state.waveFrame = finite(state.waveFrame, 0, Number.MAX_SAFE_INTEGER) ? state.waveFrame : 0;
        picture[STATE_KEY] = state;
        return state;
    }

    function clearState(picture) {
        picture[STATE_KEY] = {
            anchor: null,
            wave: null,
            overlay: null,
            angleTween: null,
            waveFrame: 0
        };
        return picture[STATE_KEY];
    }

    function normalizeShow(payload) {
        const id = reference(payload.pictureId);
        if (!id || typeof payload.name !== "string" || payload.name.length > 1000) return null;
        if (!integer(payload.origin, 0, 1) || !validPosition(payload.position)) return null;
        if (!finite(payload.scaleX, -10000, 10000) || !finite(payload.scaleY, -10000, 10000)) return null;
        if (!finite(payload.opacity, 0, 255) || !validBlend(payload.blend)) return null;
        if (payload.angle !== null && !finite(payload.angle, -360000, 360000)) return null;
        if (payload.anchor !== null && !validAnchor(payload.anchor)) return null;
        if (payload.wave !== null && !validWave(payload.wave)) return null;
        return payload;
    }

    function validModeObject(value, modes) {
        return value && modes.indexOf(value.mode) >= 0;
    }

    function normalizeMove(payload) {
        const id = reference(payload.pictureId);
        const duration = reference(payload.duration, true);
        if (!id || !duration || !integer(payload.origin, 0, 1) || !validPosition(payload.position)) return null;
        if (!finite(payload.scaleX, -10000, 10000) || !finite(payload.scaleY, -10000, 10000)) return null;
        if (!finite(payload.opacity, 0, 255) || !validBlend(payload.blend)) return null;
        if (typeof payload.wait !== "boolean" || !integer(payload.easing, 0, 3)) return null;
        if (!validModeObject(payload.angle, ["keep", "set", "tween"])) return null;
        if (!finite(payload.angle.value, -360000, 360000)) return null;
        if (!validModeObject(payload.anchor, ["keep", "off", "replace"])) return null;
        if (payload.anchor.mode === "replace" && !validAnchor(payload.anchor)) return null;
        if (!validModeObject(payload.wave, ["keep", "off", "replace"])) return null;
        if (payload.wave.mode === "replace" && !validWave(payload.wave)) return null;
        return payload;
    }

    function normalizeErase(payload) {
        if (["one", "range", "all"].indexOf(payload.mode) < 0) return null;
        if (payload.mode !== "all" && !reference(payload.pictureId)) return null;
        if (payload.mode === "range" && !reference(payload.endPictureId)) return null;
        return payload;
    }

    function easing(t, type) {
        if (type === 1) return t * t;
        if (type === 2) return 1 - (1 - t) * (1 - t);
        if (type === 3) return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
        return t;
    }

    const _Game_Interpreter_initialize = Game_Interpreter.prototype.initialize;
    Game_Interpreter.prototype.initialize = function() {
        _Game_Interpreter_initialize.apply(this, arguments);
    };

    Game_Interpreter.prototype.reactorPictureCommand = function(payload) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
        if (payload.operation === "show") return this.reactorShowPicture(normalizeShow(payload));
        if (payload.operation === "move") return this.reactorMovePicture(normalizeMove(payload));
        if (payload.operation === "erase") return this.reactorErasePicture(normalizeErase(payload));
        return false;
    };

    Game_Interpreter.prototype.reactorShowPicture = function(show) {
        if (!show) return false;
        const id = resolveReference(show.pictureId);
        const point = resolvePosition(show.position);
        const max = $gameScreen.maxPictures();
        if (!integer(id, 1, max) || !point) return false;
        const stockBlend = show.blend === "overlay" ? 0 : show.blend;
        $gameScreen.showPicture(
            id, show.name, show.origin, point.x, point.y,
            show.scaleX, show.scaleY, show.opacity, stockBlend
        );
        const picture = $gameScreen.picture(id);
        if (!picture) return false;
        const state = ensureState(picture);
        state.overlay = show.blend === "overlay" ? "overlay" : null;
        state.anchor = show.anchor ? { x: show.anchor.x, y: show.anchor.y } : null;
        state.wave = show.wave ? {
            amplitudeX: show.wave.amplitudeX,
            amplitudeY: show.wave.amplitudeY,
            period: show.wave.period,
            phase: show.wave.phase
        } : null;
        state.waveFrame = 0;
        state.angleTween = null;
        if (show.angle !== null) picture._angle = show.angle;
        return true;
    };

    Game_Interpreter.prototype.reactorMovePicture = function(move) {
        if (!move) return false;
        const id = resolveReference(move.pictureId);
        const duration = resolveReference(move.duration, true);
        const point = resolvePosition(move.position);
        const max = $gameScreen.maxPictures();
        if (!integer(id, 1, max) || !integer(duration, 0, 999999) || !point) return false;
        const stockBlend = move.blend === "overlay" ? 0 : move.blend;
        $gameScreen.movePicture(
            id, move.origin, point.x, point.y, move.scaleX, move.scaleY,
            move.opacity, stockBlend, duration, move.easing
        );
        const picture = $gameScreen.picture(id);
        if (picture) {
            const state = ensureState(picture);
            state.overlay = move.blend === "overlay" ? "overlay" : null;
            if (move.angle.mode === "set") {
                picture._angle = move.angle.value;
                state.angleTween = null;
            } else if (move.angle.mode === "tween") {
                state.angleTween = duration > 0 ? {
                    start: picture.angle(), target: move.angle.value,
                    duration: duration, whole: duration, easing: move.easing
                } : null;
                if (duration === 0) picture._angle = move.angle.value;
            }
            if (move.anchor.mode === "off") state.anchor = null;
            if (move.anchor.mode === "replace") state.anchor = { x: move.anchor.x, y: move.anchor.y };
            if (move.wave.mode === "off") state.wave = null;
            if (move.wave.mode === "replace") {
                state.wave = {
                    amplitudeX: move.wave.amplitudeX,
                    amplitudeY: move.wave.amplitudeY,
                    period: move.wave.period,
                    phase: move.wave.phase
                };
                state.waveFrame = 0;
            }
        }
        if (move.wait) this.wait(duration);
        return true;
    };

    Game_Interpreter.prototype.reactorErasePicture = function(erase) {
        if (!erase) return false;
        const max = $gameScreen.maxPictures();
        if (erase.mode === "all") {
            for (let id = 1; id <= max; id++) $gameScreen.erasePicture(id);
            return true;
        }
        const start = resolveReference(erase.pictureId);
        if (!integer(start, 1, max)) return false;
        if (erase.mode === "one") {
            $gameScreen.erasePicture(start);
            return true;
        }
        const end = resolveReference(erase.endPictureId);
        if (!integer(end, 1, max)) return false;
        const low = Math.min(start, end);
        const high = Math.max(start, end);
        for (let id = low; id <= high; id++) $gameScreen.erasePicture(id);
        return true;
    };

    const _Game_Screen_showPicture = Game_Screen.prototype.showPicture;
    Game_Screen.prototype.showPicture = function() {
        _Game_Screen_showPicture.apply(this, arguments);
        const picture = this.picture(arguments[0]);
        if (picture) clearState(picture);
    };

    const _Game_Screen_movePicture = Game_Screen.prototype.movePicture;
    Game_Screen.prototype.movePicture = function() {
        _Game_Screen_movePicture.apply(this, arguments);
    };

    const _Game_Screen_erasePicture = Game_Screen.prototype.erasePicture;
    Game_Screen.prototype.erasePicture = function() {
        _Game_Screen_erasePicture.apply(this, arguments);
    };

    const _Game_Picture_initialize = Game_Picture.prototype.initialize;
    Game_Picture.prototype.initialize = function() {
        _Game_Picture_initialize.apply(this, arguments);
        clearState(this);
    };

    Game_Picture.prototype.reactorPictureState = function() {
        return ensureState(this);
    };

    const _Game_Picture_show = Game_Picture.prototype.show;
    Game_Picture.prototype.show = function() {
        _Game_Picture_show.apply(this, arguments);
        clearState(this);
    };

    const _Game_Picture_move = Game_Picture.prototype.move;
    Game_Picture.prototype.move = function() {
        _Game_Picture_move.apply(this, arguments);
        const state = ensureState(this);
        state.overlay = null;
    };

    const _Game_Picture_updateMove = Game_Picture.prototype.updateMove;
    Game_Picture.prototype.updateMove = function() {
        _Game_Picture_updateMove.apply(this, arguments);
        const state = ensureState(this);
        const tween = state.angleTween;
        if (tween && integer(tween.duration, 1, 999999) && integer(tween.whole, 1, 999999)
            && finite(tween.start, -360000, 360000) && finite(tween.target, -360000, 360000)) {
            const progress = (tween.whole - tween.duration + 1) / tween.whole;
            const t = easing(Math.max(0, Math.min(1, progress)), tween.easing);
            this._angle = tween.start + (tween.target - tween.start) * t;
            tween.duration--;
            if (tween.duration <= 0) {
                this._angle = tween.target;
                state.angleTween = null;
            }
        } else if (tween) {
            state.angleTween = null;
        }
        if (state.wave) state.waveFrame++;
    };

    const _Sprite_Picture_updateOrigin = Sprite_Picture.prototype.updateOrigin;
    Sprite_Picture.prototype.updateOrigin = function() {
        _Sprite_Picture_updateOrigin.apply(this, arguments);
        const picture = this.picture();
        if (!picture) return;
        const anchor = ensureState(picture).anchor;
        if (anchor) {
            this.anchor.x = anchor.x;
            this.anchor.y = anchor.y;
        }
    };

    const _Sprite_Picture_updatePosition = Sprite_Picture.prototype.updatePosition;
    Sprite_Picture.prototype.updatePosition = function() {
        _Sprite_Picture_updatePosition.apply(this, arguments);
        const picture = this.picture();
        if (!picture) return;
        const state = ensureState(picture);
        if (state.wave) {
            const radians = Math.PI * 2 * state.waveFrame / state.wave.period
                + state.wave.phase * Math.PI / 180;
            const wave = Math.sin(radians);
            this.x += state.wave.amplitudeX * wave;
            this.y += state.wave.amplitudeY * wave;
        }
    };

    function pixiBlendMode(name) {
        const modes = typeof PIXI !== "undefined" && PIXI.BLEND_MODES;
        if (!modes) return name === "normal" ? 0 : null;
        const upper = modes[name.toUpperCase()];
        if (upper !== undefined) return upper;
        if (modes[name] !== undefined) return modes[name];
        return name === "normal" ? 0 : null;
    }

    function overlayBlendSupported() {
        if (typeof Graphics === "undefined") return false;
        const backBuffer = Graphics.app && Graphics.app.renderer && Graphics.app.renderer.backBuffer;
        return !!(backBuffer && backBuffer.useBackBuffer);
    }

    const _Sprite_Picture_updateOther = Sprite_Picture.prototype.updateOther;
    Sprite_Picture.prototype.updateOther = function() {
        _Sprite_Picture_updateOther.apply(this, arguments);
        const picture = this.picture();
        if (!picture || ensureState(picture).overlay !== "overlay") return;
        const overlay = overlayBlendSupported() ? pixiBlendMode("overlay") : null;
        this.blendMode = overlay !== null ? overlay : pixiBlendMode("normal");
    };
})();
