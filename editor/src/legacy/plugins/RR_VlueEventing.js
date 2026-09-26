/*:
 * @target MZ
 * @plugindesc Eventing: Fine Tuning (VX Ace), for imported games
 * @author Vlue; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VlueEventing.js
 *
 * Move-route Script commands that fine-tune a character's sprite and moves.
 * The import writes the game's Ruby as these calls (in a move route, `this`
 * is the character):
 *   this.rrVlueOffset(x, y)          shift the sprite by pixels
 *   this.rrVlueZoom(zoom)            scale (1 = normal)
 *   this.rrVlueRotate(angle)         turn by degrees
 *   this.rrVlueBlend([r, g, b, a])   blend colour
 *   this.rrVlueMirror()              toggle mirroring
 *   this.rrVlueFlash([r, g, b, a], frames)
 *   this.rrVlueSlide(x, y)           ease the sprite to an offset
 *   this.rrVlueWaypoint(x, y)        walk there; the route waits
 *   this.rrVlueFadeIn(frames = 10)   this.rrVlueFadeOut(frames = 10)
 *   this.rrVlueShake(frames = 30)
 *   this.rrVlueRandom(w, h)          this.rrVlueRandomRegion(id, w, h)
 *   this.rrVlueRandomWait(min, max)
 *   this.rrVlueJumpForward(n)        this.rrVlueJumpSide(n)   this.rrVlueJumpTo(x, y)
 *   this.rrVlueMemorize()            this.rrVlueRecall()      this.rrVlueRecallWalk()
 *   this.rrVlueMoveToPlayer(walk)    this.rrVlueMoveToEvent(id, walk)
 *   this.rrVlueSelfSwitch(letter, value)   this.rrVlueBalloon(id)
 *   this.rrVluePlayAnimation(eventId, animationId)
 *   this.rrVlueReset()
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const C = Game_CharacterBase.prototype;

    const details = (c) => {
        if (!c._rrVlue) {
            c._rrVlue = { ox: 0, oy: 0, offset: false, zoom: 1, angle: 0, mirror: false, blend: [0, 0, 0, 0], flash: null,
                fade: null, fadeTime: 0, shake: 0, shakeDir: 0, slide: null, memo: [-1, -1], waypoint: null };
        }
        return c._rrVlue;
    };
    // RGSS clamps a Color's channels to 0-255 (Color.new(0, 255, 255255) is cyan).
    const color = (v) => (Array.isArray(v) ? [0, 1, 2, 3].map(i => Math.min(Math.max(Number(v[i] ?? 255) || 0, 0), 255)) : [0, 0, 0, 0]);

    Object.assign(C, {
        rrVlueOffset(x, y) { const d = details(this); d.offset = true; d.ox = Number(x) || 0; d.oy = Number(y) || 0; },
        rrVlueZoom(zoom) { details(this).zoom = Number(zoom); },
        // The sprite shows the last angle set; the original keeps a running total only to undo it on reset.
        rrVlueRotate(angle) { details(this).angle = Number(angle) || 0; },
        rrVlueBlend(c) { details(this).blend = color(c); },
        rrVlueMirror() { const d = details(this); d.mirror = !d.mirror; },
        rrVlueFlash(c, frames) { details(this).flash = { color: color(c), frames: Number(frames) || 0, left: Number(frames) || 0, fresh: true }; },
        rrVlueSlide(x, y) { const d = details(this); d.slide = [Number(x) + d.ox, Number(y) + d.oy]; d.offset = true; this._stepAnime = true; },
        rrVlueFadeIn(frames = 10) { const d = details(this); d.fadeTime = Number(frames); d.fade = 255; },
        rrVlueFadeOut(frames = 10) { const d = details(this); d.fadeTime = Number(frames); d.fade = 0; },
        rrVlueShake(frames = 30) { const d = details(this); d.offset = true; d.shake = Number(frames); },
        rrVlueRandom(w = 250, h = 250) { const tiles = this.rrVlueTiles(w, h); if (tiles.length) this.locate(...tiles[Math.randomInt(tiles.length)]); },
        rrVlueRandomRegion(id, w = 250, h = 250) {
            const tiles = this.rrVlueTiles(w, h).filter(([x, y]) => $gameMap.regionId(x, y) === Number(id));
            if (tiles.length) this.locate(...tiles[Math.randomInt(tiles.length)]);
        },
        rrVlueRandomWait(min, max) { this._waitCount = Math.randomInt(Number(max) - Number(min)) + Number(min) - 1; },
        rrVlueTiles(w, h) {
            const out = [];
            for (let y = 0; y < $gameMap.height(); y++) for (let x = 0; x < $gameMap.width(); x++) {
                if ((x === $gamePlayer.x && y === $gamePlayer.y) || (x === this.x && y === this.y)) continue;
                if (Math.abs(x - this.x) > w || Math.abs(y - this.y) > h) continue;
                if (!$gameMap.checkPassage(x, y, 0x0f)) continue;
                out.push([x, y]);
            }
            return out;
        },
        rrVlueJumpForward(n) { const d = this.direction(); this.jump(d === 6 ? n : d === 4 ? -n : 0, d === 2 ? n : d === 8 ? -n : 0); },
        rrVlueJumpSide(n) { const d = this.direction(); this.jump(d === 2 ? n : d === 8 ? -n : 0, d === 6 ? n : d === 4 ? -n : 0); },
        rrVlueJumpTo(x, y) { this.jump(Number(x) - this.x, Number(y) - this.y); },
        rrVlueMemorize() { details(this).memo = [this.x, this.y]; },
        rrVlueRecall() { const m = details(this).memo; if (m[0] >= 0) this.locate(m[0], m[1]); },
        rrVlueRecallWalk() { const m = details(this).memo; if (m[0] >= 0) this.rrVlueWaypoint(m[0], m[1]); },
        rrVlueMoveToPlayer(walk = false) { walk ? this.rrVlueWaypoint($gamePlayer.x, $gamePlayer.y) : this.locate($gamePlayer.x, $gamePlayer.y); },
        rrVlueMoveToEvent(id, walk = false) {
            const e = $gameMap.event(Number(id));
            if (e) walk ? this.rrVlueWaypoint(e.x, e.y) : this.locate(e.x, e.y);
        },
        rrVlueSelfSwitch(letter, value) { if (this instanceof Game_Event) $gameSelfSwitches.setValue([$gameMap.mapId(), this.eventId(), String(letter)], !!value); },
        rrVlueBalloon(id) { $gameTemp.requestBalloon(this, Number(id)); },
        rrVluePlayAnimation(eventId, animationId) {
            const target = Number(eventId) === -1 ? $gamePlayer : Number(eventId) > 0 ? $gameMap.event(Number(eventId)) : null;
            if (target) $gameTemp.requestAnimation([target], Number(animationId));
        },
        rrVlueReset() { const memo = details(this).memo; this._rrVlue = null; details(this).memo = memo; },
        rrVlueWaypoint(x, y) { details(this).waypoint = [Number(x), Number(y)]; }
    });

    // Every character's first move of a Vlue route records where it stood, as the original's moveto does.
    const _locate = C.locate;
    C.locate = function(x, y) {
        _locate.call(this, x, y);
        const d = this._rrVlue;
        if (d && d.memo[0] < 0) d.memo = [this.x, this.y];
    };

    const _screenX = C.screenX;
    C.screenX = function() {
        const d = this._rrVlue;
        return _screenX.call(this) + (d && d.offset ? d.ox : 0);
    };
    const _screenY = C.screenY;
    C.screenY = function() {
        const d = this._rrVlue;
        return _screenY.call(this) + (d && d.offset ? d.oy : 0);
    };

    const _update = C.update;
    C.update = function() {
        _update.apply(this, arguments);
        const d = this._rrVlue;
        if (!d) return;
        if (d.slide) {
            // Half a pixel a frame toward the slide's offset.
            d.ox += Math.sign(d.slide[0] - d.ox) * Math.min(0.5, Math.abs(d.slide[0] - d.ox));
            d.oy += Math.sign(d.slide[1] - d.oy) * Math.min(0.5, Math.abs(d.slide[1] - d.oy));
            if (d.ox === d.slide[0] && d.oy === d.slide[1]) { d.slide = null; this._stepAnime = false; }
        }
        if (d.fade !== null && d.fadeTime > 0 && this._opacity !== d.fade) {
            const step = Math.floor(255 / d.fadeTime);
            this._opacity = Math.min(Math.max(this._opacity + (d.fade > this._opacity ? step : -step), 0), 255);
            if (this._opacity === 0 || this._opacity === 255) d.fadeTime = 0;
        }
        if (d.shake > 0) {
            d.shake--;
            d.oy += d.shakeDir === 0 ? 1 : -1;
            if (d.shake % 3 === 0) d.shakeDir = d.shakeDir ? 0 : 1;
        }
    };

    // A waypoint walks one step at a time toward the point; the route's next command waits for it.
    const _updateRoutineMove = Game_Character.prototype.updateRoutineMove;
    Game_Character.prototype.updateRoutineMove = function() {
        const d = this._rrVlue;
        if (!d || !d.waypoint || this._waitCount > 0) return _updateRoutineMove.call(this);
        const [wx, wy] = d.waypoint;
        const sx = this.deltaXFrom(wx), sy = this.deltaYFrom(wy);
        this.setMovementSuccess(true);
        if (Math.abs(sx) > Math.abs(sy)) {
            this.moveStraight(sx > 0 ? 4 : 6);
            if (!this.isMovementSucceeded() && sy !== 0) this.moveStraight(sy > 0 ? 8 : 2);
        } else if (sy !== 0) {
            this.moveStraight(sy > 0 ? 8 : 2);
            if (!this.isMovementSucceeded() && sx !== 0) this.moveStraight(sx > 0 ? 4 : 6);
        }
        if (!this.isMovementSucceeded() && this._moveRoute && this._moveRoute.skippable) d.waypoint = null;
        if (this.x === wx && this.y === wy) { d.waypoint = null; this.advanceMoveRouteIndex(); }
    };

    const _spriteUpdate = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _spriteUpdate.call(this);
        const d = this._character && this._character._rrVlue;
        if (!d) return;
        this.scale.x = d.zoom * (d.mirror ? -1 : 1);
        this.scale.y = d.zoom;
        this.rotation = (-d.angle * Math.PI) / 180;   // RGSS turns counter-clockwise
        const f = d.flash;
        if (f && f.left > 0) {
            // A flash starts at its colour's strength and fades out over its frames, as RGSS's Sprite#flash.
            const [r, g, b, a] = f.color;
            this.setBlendColor([r, g, b, (a * f.left) / f.frames]);
            f.left--;
        } else {
            if (f) d.flash = null;
            this.setBlendColor(d.blend);
        }
    };
})();
