/*:
 * @target MZ
 * @plugindesc Picture Wrapper (VX Ace), for imported games
 * @author Hime (Tsukihime); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimePictures.js
 *
 * The picture calls of Hime's Picture Wrapper, which imported events make in
 * their Script commands: make_pic, show_pic, move_pic, shift_pic, zoom_pic,
 * rotate_pic, spin_pic, fade_pic, tone_pic, blend_pic, origin_pic,
 * grayscale_pic, mirror_pic, flip_pic, erase_pic and fix_pic.
 *
 * As in the original, a move, zoom or fade changes only its own target, and a
 * picture fixed to the map is placed in map pixels and scrolls with it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';

    const picture = (index) => {
        const id = Number(index) || 0;
        if (id <= 0) return null;
        const screen = $gameScreen;
        const real = screen.realPictureId(id);
        if (!screen._pictures[real]) {
            const p = new Game_Picture();
            p._name = '';
            screen._pictures[real] = p;
        }
        return screen._pictures[real];
    };
    // Ace draws any origin but 0 from the middle ("center" included).
    const origin = (o) => (o === 0 || o === '0' ? 0 : 1);
    const timed = (p, duration) => {
        const d = Math.max(0, Number(duration) || 0);
        p._duration = d;
        p._wholeDuration = d;
        p._easingType = 0;
        return d;
    };
    // As in Ace, a change of 0 frames never runs (its update returns while the duration is 0).

    Object.assign(Game_Interpreter.prototype, {
        rrMakePic(index, name, opacity = 255, x = 0, y = 0, org = 1, fixed = false) {
            const p = picture(index);
            if (!p) return;
            p._name = String(name || '');
            p._opacity = Number(opacity);
            p._x = Number(x); p._y = Number(y);
            p._origin = origin(org);
            p._blendMode = 0;
            p._rrHimeFixed = !!fixed;
        },
        rrShowPic(index, name) {
            const p = picture(index);
            if (p) { p._name = String(name || ''); p._origin = 1; }
        },
        rrMovePic(index, x, y, duration = 1, wait = false) {
            const p = picture(index);
            if (!p) return;
            p._targetX = Number(x); p._targetY = Number(y);
            this.rrPicWait(timed(p, duration), wait);
        },
        rrShiftPic(index, x, y, duration = 1, wait = false) {
            const p = picture(index);
            if (!p) return;
            p._targetX = p._x + Number(x); p._targetY = p._y + Number(y);
            this.rrPicWait(timed(p, duration), wait);
        },
        rrZoomPic(index, x, y, duration = 1, wait = false) {
            const p = picture(index);
            if (!p) return;
            p._targetScaleX = Number(x); p._targetScaleY = Number(y);
            this.rrPicWait(timed(p, duration), wait);
        },
        rrRotatePic(index, angle) {
            const p = picture(index);
            if (p) { p._angle = Number(angle) || 0; p._rotationSpeed = 0; }
        },
        rrSpinPic(index, speed, org = 1) {
            const p = picture(index);
            if (!p) return;
            p._origin = origin(org);
            p._rotationSpeed = p._rrSpin ? 0 : Number(speed) || 0;
            p._rrSpin = !p._rrSpin;
        },
        rrFadePic(index, opacity, duration = 1, wait = false) {
            const p = picture(index);
            if (!p) return;
            p._targetX = p._x; p._targetY = p._y;
            p._targetOpacity = Number(opacity);
            this.rrPicWait(timed(p, duration), wait);
        },
        rrTonePic(index, r, g, b, a, duration = 1, wait = false) {
            const p = picture(index);
            if (!p) return;
            p.tint([Number(r), Number(g), Number(b), Number(a)], Number(duration) || 0);
            this.rrPicWait(Number(duration) || 0, wait);
        },
        rrBlendPic(blend, index = 1) {
            const p = picture(index);
            if (p) p._blendMode = [0, 1, 2].includes(Number(blend)) ? Number(blend) : 0;
        },
        rrOriginPic(index, org) {
            const p = picture(index);
            if (p) p._origin = origin(org);
        },
        rrGrayscalePic(index, duration = 1) {
            const p = picture(index);
            if (!p) return;
            const tone = (p._tone || [0, 0, 0, 0]).slice();
            tone[3] = p._rrGray ? 0 : 255;
            p._rrGray = !p._rrGray;
            p.tint(tone, Number(duration) || 0);
        },
        rrMirrorPic(index = 1) {
            const p = picture(index);
            if (p) p._rrMirror = !p._rrMirror;
        },
        rrFlipPic(index = 1) {
            const p = picture(index);
            if (p) p._angle = (p._angle || 0) + 180;
        },
        rrErasePic(index = 1) {
            const p = picture(index);
            if (p) { p._name = ''; p._origin = 0; }
        },
        rrFixPic(index = 1, fixed = true) {
            const p = picture(index);
            if (p) p._rrHimeFixed = !!fixed;
        },
        rrPicWait(duration, wait) {
            // Ruby truth: only false and nil are false, so the 0 games pass for "no wait" waits.
            if (wait !== false && wait !== null && wait !== undefined && duration > 0) this.wait(duration);
        }
    });

    const _updatePosition = Sprite_Picture.prototype.updatePosition;
    Sprite_Picture.prototype.updatePosition = function() {
        _updatePosition.call(this);
        const p = this.picture();
        if (p && p._rrHimeFixed) {
            this.x = Math.round(p.x() - $gameMap.displayX() * $gameMap.tileWidth());
            this.y = Math.round(p.y() - $gameMap.displayY() * $gameMap.tileHeight());
        }
    };

    const _updateScale = Sprite_Picture.prototype.updateScale;
    Sprite_Picture.prototype.updateScale = function() {
        _updateScale.call(this);
        const p = this.picture();
        if (p && p._rrMirror) this.scale.x = -Math.abs(this.scale.x);
    };
})();
