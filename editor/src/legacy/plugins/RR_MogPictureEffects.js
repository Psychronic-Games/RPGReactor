/*:
 * @target MZ
 * @plugindesc MOG Picture Effects (VX Ace), for imported games
 * @author Moghunter; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MogPictureEffects.js
 *
 * Script calls:
 *   $gameScreen.rrPictureEffectEx(id, type, power, speed)
 *     0 shake X, 1 shake X and Y, 2 breath (bottom-anchored), 3 auto zoom,
 *     4 fade loop, 5 swing, 6 wave, 7 frame animation (Name0, Name1, ... in
 *     img/pictures, shown in turn). power and speed may be left out for the
 *     original defaults. Effects combine.
 *   $gameScreen.rrPicturePosition(id, target)
 *     0 normal, -1 follow the player, 1..999 follow that event, -2 pinned
 *     to the map. Clears effects 0-6.
 *   $gameScreen.rrPictureEffectsClear(id)
 *   $gameSystem._rrPictureScreenZ = n
 *
 * Effects may be set before Show Picture: showing keeps them, Erase Picture
 * drops them. On a transfer to another map, pictures that follow an event or
 * were never positioned move 1000 px out of view, as in the original; call
 * rrPicturePosition(id, 0) to keep a picture in place across transfers.
 * The state is saved with the picture.
 *
 * The picture z base is kept for scripts that read it; pictures still draw
 * in id order above the map.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * @param screenZ
 * @text Picture z base
 * @type number
 * @min -9999
 * @default 100
 * @desc DEFAULT_SCREEN_Z in the original script.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MogPictureEffects');
    const SCREEN_Z = params.screenZ !== undefined && params.screenZ !== '' ? Number(params.screenZ) : 100;

    // Ruby's integer division floors; float operands divide normally.
    const idiv = (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b);
    // Kernel#rand: rand(0) is a float in [0, 1), a negative bound counts as its absolute value.
    function rubyRand(n) {
        n = Math.abs(Number(n) || 0);
        if (!n) return Math.random();
        return Number.isInteger(n) ? Math.floor(Math.random() * n) : Math.random() * n;
    }
    const inRange = (v, lo, hi) => v >= lo && v <= hi;

    Game_System.prototype.rrPictureScreenZ = function() {
        return typeof this._rrPictureScreenZ === 'number' ? this._rrPictureScreenZ : SCREEN_Z;
    };

    // ---- state: _rrFx (effect_ex), _rrAnime (anime_frames), _rrPos (position) ----------
    // _rrPos is [kind, target, offsetX, offsetY]; target is null only for a picture
    // that was never positioned (or was pushed away on transfer), 0 when there is
    // nothing to follow, otherwise the id followed (-1 for the player).

    const standardPower = type => (type === 2 ? 6 : type === 3 ? 30 : type === 4 ? 120 : 10);
    const standardSpeed = type => (type === 0 || type === 1 ? 3 : type === 5 ? 2 : type === 6 ? 10 : 0);

    /** The picture, created blank when missing: the original's picture slots always existed, so effects can precede Show Picture. */
    Game_Screen.prototype.rrMogPicture = function(id, create) {
        id = Number(id);
        if (!(id >= 1 && id <= this.maxPictures())) return null;
        let picture = this.picture(id);
        if (!picture && create) {
            picture = new Game_Picture();
            this._pictures[this.realPictureId(id)] = picture;
        }
        return picture || null;
    };

    Game_Screen.prototype.rrPictureEffectEx = function(id, type, power = null, speed = null) {
        type = Number(type);
        if (!Number.isInteger(type) || type < 0 || type > 7) return;
        const picture = this.rrMogPicture(id, true);
        if (!picture) return;
        power = power === null || power === undefined ? standardPower(type) : Number(power) || 0;
        if (type === 4 && power < 1) power = 1;
        speed = speed === null || speed === undefined ? standardSpeed(type) : Number(speed) || 0;
        const fx = picture._rrFx || (picture._rrFx = []);
        if (type === 1) fx[0] = null;
        if (type === 0) fx[1] = null;
        let entry = [power, speed, 0];
        if (type === 2 || type === 3) entry = [0, 0, 0, power * 0.00005, speed, 0, 0];
        else if (type === 4) entry = [255, 0, 0, idiv(255, power), power, speed, 0];
        else if (type === 5) entry = [0, 0, power, speed, 0];
        else if (type === 6) entry = [true, power * 10, speed * 100];
        fx[type] = entry;
        if (type === 7) picture._rrAnime = [true, [], power, 0, 0, speed, 0];
    };

    Game_Screen.prototype.rrPicturePosition = function(id, targetId) {
        const picture = this.rrMogPicture(id, true);
        if (!picture) return;
        targetId = Number(targetId) || 0;
        let pos = picture._rrPos || [0, null, 0, 0];
        // Offsets survive a change of target so the picture eases over from where it was.
        if (pos[0] === -2 || pos[0] === 0) pos = [0, null, 0, 0];
        if (picture._rrFx) for (let i = 0; i <= 6; i++) picture._rrFx[i] = null;
        let target = 0;
        if (targetId === -1) target = -1;
        else if (targetId > 0 && $gameMap.event(targetId)) target = targetId;
        pos[0] = targetId;
        pos[1] = target;
        picture._rrPos = pos;
    };

    Game_Screen.prototype.rrPictureEffectsClear = function(id) {
        const picture = this.rrMogPicture(id, false);
        if (!picture) return;
        delete picture._rrFx;
        delete picture._rrAnime;
        delete picture._rrPos;
    };

    // MZ's Show Picture builds a new Game_Picture; the original kept the effects through it.
    const _rrMogShowPicture = Game_Screen.prototype.showPicture;
    Game_Screen.prototype.showPicture = function(pictureId) {
        const before = this.picture(pictureId);
        _rrMogShowPicture.apply(this, arguments);
        const after = this.picture(pictureId);
        if (before && after && before !== after) {
            for (const key of ['_rrFx', '_rrAnime', '_rrPos']) if (before[key] !== undefined) after[key] = before[key];
        }
    };

    Game_Screen.prototype.rrPushPicturesAway = function() {
        for (let i = 1; i <= this.maxPictures(); i++) {
            const picture = this._pictures[i];
            if (!picture) continue;
            const pos = picture._rrPos;
            if (!pos || pos[0] > 0 || pos[1] === null || pos[1] === undefined) picture._rrPos = [-1000, null, 0, 0];
        }
    };

    const _rrMogMapSetup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        const changed = mapId !== this._mapId;
        _rrMogMapSetup.apply(this, arguments);
        if (changed && $gameScreen && SceneManager._scene instanceof Scene_Map) $gameScreen.rrPushPicturesAway();
    };

    // ---- helpers -----------------------------------------------------------------------

    const NEVER = [0, null, 0, 0];
    const fxOf = picture => picture._rrFx || [];
    const posOf = picture => picture._rrPos || NEVER;
    function hasState(picture) {
        if (!picture) return false;
        if (picture._rrPos && picture._rrPos[0] !== 0) return true;
        if (picture._rrAnime && picture._rrAnime.length) return true;
        return !!(picture._rrFx && picture._rrFx.some(e => e));
    }
    const forceCenter = (fx, pos) => pos[0] === -1 || pos[0] > 0 || !!fx[3] || !!fx[5];

    function offsetOf(pos, axis) {
        const kind = pos[0];
        if (kind > 0 || kind === -1) return Number(pos[2 + axis]) || 0;
        if (kind === -2) return axis ? $gameMap.displayY() * $gameMap.tileHeight() : $gameMap.displayX() * $gameMap.tileWidth();
        if (kind === -1000) return 1000;
        return 0;
    }

    function followed(pos) {
        if (!pos[1]) return null;
        if (pos[0] === -1) return $gamePlayer;
        return pos[0] > 0 ? $gameMap.event(pos[0]) || null : null;
    }

    // execute_move: close 5 px plus a fifth of the gap each frame.
    function ease(current, goal) {
        const step = 5 + idiv(Math.abs(current - goal), 5);
        if (current > goal) return Math.max(goal, current - step);
        if (current < goal) return Math.min(goal, current + step);
        return current;
    }

    function autoZoom(e, type) {
        if (e[6] === 0) {
            e[6] = 1;
            e[0] = Math.floor(Math.random() * 50);
        }
        if (e[5] < e[4]) {
            e[5] += 1;
            return e[1];
        }
        e[5] = 0;
        e[2] -= 1;
        if (e[2] > 0) return e[1];
        e[2] = 2;
        e[0] += 1;
        if (inRange(e[0], 0, 25)) e[1] += e[3];
        else if (inRange(e[0], 26, 60)) e[1] -= e[3];
        else { e[0] = 0; e[1] = 0; }
        if (e[1] < 0) e[1] = 0;
        if (type === 2 && e[1] > 0.25) e[1] = 0.25;
        return e[1];
    }

    // Name0, Name1, ... until one is missing. Answered at once where the build can
    // see its files (desktop, web builds with their file index), otherwise by
    // loading one frame at a time outside ImageManager so a missing one is no load error.
    function knownFile(url) {
        const suffix = Utils.hasEncryptedImages && Utils.hasEncryptedImages() ? '_' : '';
        try {
            if (Utils.isNwjs()) {
                const fs = require('fs'), path = require('path');
                const base = path.dirname(process.mainModule.filename);
                if (fs.existsSync(path.join(base, ...decodeURIComponent(url + suffix).split('/')))) return true;
                return !!(Utils.correctFileCase && Utils.correctFileCase(url + suffix));
            }
            if (Utils.loadWebFileIndex) Utils.loadWebFileIndex();
            const index = Utils._webFileIndex;
            if (index) return index.has(decodeURIComponent(url + suffix).toLowerCase());
        } catch (_) { /* fall back to probing */ }
        return null;
    }
    const frameUrl = (folder, name, i) => folder + Utils.encodeURI(name + i) + '.png';
    function startFrames(folder, name) {
        const set = { folder, name, frames: [], probe: null, next: 0, done: false };
        for (let i = 0; name && i < 1000; i++) {
            const known = knownFile(frameUrl(folder, name, i));
            if (known === null) {
                set.next = i;
                set.probe = Bitmap.load(frameUrl(folder, name, i));
                return set;
            }
            if (!known) break;
            set.frames.push(ImageManager.loadBitmap(folder, name + i));
        }
        set.done = true;
        return set;
    }
    /** True once every frame has loaded. */
    function framesReady(set) {
        if (set.probe) {
            if (set.probe.isError()) set.probe = null;
            else if (set.probe.isReady()) {
                set.frames.push(set.probe);
                set.next++;
                set.probe = set.next < 1000 ? Bitmap.load(frameUrl(set.folder, set.name, set.next)) : null;
                return false;
            } else return false;
            set.done = true;
        }
        if (!set.done) return false;
        const broken = set.frames.findIndex(b => b.isError());
        if (broken >= 0) set.frames.length = broken;
        return set.frames.every(b => b.isReady());
    }

    // ---- wave: rows shifted sideways by amp·sin(phase + 2π·row/length) ------------------
    function waveFilter() {
        if (!PIXI.GlProgram || !PIXI.Filter || !PIXI.defaultFilterVert) return null;
        const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform float uAmp;
uniform float uPhase;
uniform float uLength;
uniform float uTop;
uniform float uRowScale;
void main() {
    float row = (uOutputFrame.y + vTextureCoord.y * uInputSize.y - uTop) / uRowScale;
    float offset = uAmp * sin(uPhase + row * 6.2831853 / uLength);
    vec2 uv = vec2(vTextureCoord.x - offset * uInputSize.z, vTextureCoord.y);
    if (uv.x < uInputClamp.x || uv.x > uInputClamp.z) { finalColor = vec4(0.0); return; }
    finalColor = texture(uTexture, uv);
}`;
        try {
            const glProgram = PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment, name: 'rr-mog-picture-wave' });
            return new PIXI.Filter({ glProgram, resources: { rrWave: {
                uAmp: { value: 0, type: 'f32' }, uPhase: { value: 0, type: 'f32' }, uLength: { value: 1, type: 'f32' },
                uTop: { value: 0, type: 'f32' }, uRowScale: { value: 1, type: 'f32' } } } });
        } catch (e) {
            console.error('RR_MogPictureEffects: wave filter unavailable', e);
            return null;
        }
    }
    function removeWave(sprite) {
        if (sprite._rrWaveFilter && sprite.filters && sprite.filters.includes(sprite._rrWaveFilter)) {
            sprite.filters = sprite.filters.filter(f => f !== sprite._rrWaveFilter);
        }
    }
    /** amp and length in pixels of the bitmap as the original held it (vw × vh over the sprite's bitmap). */
    function applyWave(sprite, amp, length, phaseDegrees, vw, vh) {
        const bitmap = sprite.bitmap;
        if (!amp || !bitmap || !bitmap.width || !bitmap.height) return removeWave(sprite);
        if (!sprite._rrWaveFilter) {
            sprite._rrWaveFilter = waveFilter();
            if (!sprite._rrWaveFilter) return;
        }
        if (!sprite.filters || !sprite.filters.includes(sprite._rrWaveFilter)) sprite.filters = [...(sprite.filters || []), sprite._rrWaveFilter];
        // Last frame's transform: it only sets where the wave's first row falls.
        const wt = sprite.worldTransform;
        const lx = -sprite.anchor.x * bitmap.width, ly = -sprite.anchor.y * bitmap.height;
        const colPx = (wt.a * bitmap.width) / (vw || bitmap.width);
        const rowPx = (wt.d * bitmap.height) / (vh || bitmap.height);
        const u = sprite._rrWaveFilter.resources.rrWave.uniforms;
        u.uAmp = amp * colPx;
        u.uPhase = (phaseDegrees * Math.PI) / 180;
        u.uLength = length || 1;
        u.uTop = wt.b * lx + wt.d * ly + wt.ty;
        u.uRowScale = rowPx || 1;
        sprite._rrWaveFilter.padding = Math.ceil(Math.abs(amp * colPx)) + 2;
    }

    // ---- Sprite_Picture ----------------------------------------------------------------

    Sprite_Picture.prototype._rrDropFrames = function(restore) {
        const had = !!this._rrFrames;
        this._rrFrames = null;
        this._rrFrameSet = null;
        if (restore && had) this.loadBitmap();
    };

    // update_picture_animation
    Sprite_Picture.prototype._rrStepFrames = function(anime) {
        const frames = this._rrFrames;
        if (!frames) return;
        if (anime[6] > 0) {
            anime[6] -= 1;
            return;
        }
        anime[4] += 1;
        if (anime[4] < anime[2]) return;
        this.bitmap = frames[anime[3] % frames.length];
        anime[4] = 0;
        anime[3] += 1;
        if (anime[3] >= frames.length) {
            anime[3] = 0;
            anime[6] = anime[5];
        }
    };

    Sprite_Picture.prototype._rrUpdateFrames = function(picture, anime) {
        const name = picture.name();
        if (!name) return;   // set before Show Picture: wait for the image
        if (!this._rrFrameSet || this._rrFrameSet.name !== name) {
            this._rrFrames = null;
            this._rrFrameSet = startFrames('img/pictures/', name);
        }
        if (!this._rrFrames) {
            if (!framesReady(this._rrFrameSet)) return;
            const frames = this._rrFrameSet.frames;
            anime[0] = false;
            if (frames.length <= 1) {
                picture._rrAnime = [];
                if (picture._rrFx) picture._rrFx[7] = null;
                this._rrFrameSet = null;
                return;
            }
            this._rrFrames = frames;
            this.bitmap = frames[anime[3] % frames.length];
            this._rrStepFrames(anime);
        }
        this._rrStepFrames(anime);
    };

    const _rrMogUpdateBitmap = Sprite_Picture.prototype.updateBitmap;
    Sprite_Picture.prototype.updateBitmap = function() {
        _rrMogUpdateBitmap.call(this);
        const picture = this.picture();
        const name = picture ? picture.name() : '';
        if (this._rrFxName !== name) {
            // refresh_effect_ex: a new image drops the wave unless the picture still has one.
            this._rrFxName = name;
            if (!(picture && picture._rrFx && picture._rrFx[6])) this._rrWave = null;
            this._rrDropFrames(false);
        }
        if (!picture) return;
        const anime = picture._rrAnime;
        if (anime && anime.length) this._rrUpdateFrames(picture, anime);
        else if (this._rrFrames) this._rrDropFrames(true);
        const wave = picture._rrFx && picture._rrFx[6];
        const bitmap = this.bitmap;
        if (wave && (wave[0] || !this._rrWave) && bitmap && bitmap.isReady() && bitmap.width) {
            wave[0] = false;
            this._rrWave = { amp: wave[1], length: bitmap.width, speed: wave[2], phase: this._rrWave ? this._rrWave.phase : 0 };
        }
        // RGSS advances wave_phase by wave_speed/180 degrees each Sprite#update.
        if (this._rrWave) this._rrWave.phase += this._rrWave.speed / 180;
    };

    const _rrMogUpdateOrigin = Sprite_Picture.prototype.updateOrigin;
    Sprite_Picture.prototype.updateOrigin = function() {
        _rrMogUpdateOrigin.call(this);
        const picture = this.picture();
        if (!hasState(picture)) {
            this._rrOx = undefined;
            return;
        }
        const fx = fxOf(picture), pos = posOf(picture);
        const centered = forceCenter(fx, pos);
        if (!centered && !fx[2] && pos[0] === 0) {
            this._rrOx = undefined;
            return;
        }
        const bitmap = this.bitmap;
        if (!bitmap || !bitmap.width || !bitmap.height) return;
        const w = bitmap.width, h = bitmap.height;
        const nOx = offsetOf(pos, 0), nOy = offsetOf(pos, 1);
        let ox, oy;
        if (centered) {
            ox = fx[2] ? nOx : idiv(w, 2) + nOx;
            oy = idiv(h, 2) + nOy;
            const target = pos[0] > 0 || pos[0] === -1 ? followed(pos) : null;
            if (target) {
                pos[2] = ease(pos[2], -target.screenX());
                pos[3] = ease(pos[3], -target.screenY());
            }
        } else if (fx[2]) {
            // Breath anchors the bottom edge and leaves ox where it was.
            ox = this._rrOx !== undefined ? this._rrOx : this.anchor.x * w;
            oy = h + nOy;
        } else if (picture.origin() === 0) {
            ox = nOx;
            oy = nOy;
        } else {
            ox = idiv(w, 2) + nOx;
            oy = idiv(h, 2) + nOy;
        }
        this._rrOx = ox;
        this._rrOy = oy;
        this.anchor.x = ox / w;
        this.anchor.y = oy / h;
    };

    const _rrMogUpdatePosition = Sprite_Picture.prototype.updatePosition;
    Sprite_Picture.prototype.updatePosition = function() {
        _rrMogUpdatePosition.call(this);
        const picture = this.picture();
        if (!hasState(picture)) {
            this._rrShakeAt = null;
            return;
        }
        const fx = fxOf(picture), pos = posOf(picture);
        const type = fx[0] ? 0 : fx[1] ? 1 : -1;
        if (type >= 0) {
            // A shake only moves the picture on its ticks; between them it holds still.
            const e = fx[type];
            e[2] += 1;
            if (e[2] < e[1]) {
                if (this._rrShakeAt) {
                    this.x = this._rrShakeAt[0];
                    this.y = this._rrShakeAt[1];
                }
                return;
            }
            e[2] = 0;
            this.x += -idiv(e[0], 2) + rubyRand(e[0]);
            if (fx[1]) this.y += -idiv(e[0], 2) + rubyRand(e[0]);
        }
        // set_oxy_correction: centred effects keep the image's top-left at the picture's x, y.
        if (pos[0] !== -2 && this._rrOx !== undefined) {
            if (fx[3] || fx[5]) this.x += this._rrOx;
            if (fx[2] || fx[3] || fx[5]) this.y += this._rrOy;
        }
        this._rrShakeAt = type >= 0 ? [this.x, this.y] : null;
    };

    const _rrMogUpdateScale = Sprite_Picture.prototype.updateScale;
    Sprite_Picture.prototype.updateScale = function() {
        _rrMogUpdateScale.call(this);
        const picture = this.picture();
        const fx = picture && picture._rrFx;
        if (!fx) return;
        if (fx[2]) {
            // The original divides the height by 101: the picture breathes from just under full size.
            this.scale.x = picture.scaleX() / 100;
            this.scale.y = picture.scaleY() / 101 + autoZoom(fx[2], 2);
        } else if (fx[3]) {
            // Two steps a frame, one per axis, as the original ran it.
            this.scale.x = picture.scaleX() / 100 + autoZoom(fx[3], 3);
            this.scale.y = picture.scaleY() / 100 + autoZoom(fx[3], 3);
        }
    };

    const _rrMogUpdateOther = Sprite_Picture.prototype.updateOther;
    Sprite_Picture.prototype.updateOther = function() {
        _rrMogUpdateOther.call(this);
        const picture = this.picture();
        const fx = picture && picture._rrFx;
        if (fx && fx[4]) {
            const e = fx[4];
            e[6] += 1;
            if (e[6] >= e[5]) {
                e[6] = 0;
                e[2] += 1;
                if (inRange(e[2], 0, e[4])) e[0] -= e[3];
                else if (inRange(e[2], e[4], e[4] * 2 - 1)) e[0] += e[3];
                else { e[0] = 255; e[2] = 0; }
                this._rrOpacity = e[0];
            }
            if (this._rrOpacity !== undefined) this.opacity = this._rrOpacity;
        } else {
            this._rrOpacity = undefined;
        }
        if (fx && fx[5]) {
            const e = fx[5];
            e[4] += 1;
            if (e[4] >= e[3]) {
                e[4] = 0;
                e[1] += 1;
                if (inRange(e[1], 0, e[2])) e[0] += 1;
                else if (inRange(e[1], e[2], e[2] * 3)) e[0] -= 1;
                else if (inRange(e[1], e[2] * 3, e[2] * 4 - 1)) e[0] += 1;
                else { e[0] = 0; e[1] = 0; }
                // The original's degrees turn counter-clockwise, MZ's clockwise.
                this._rrAngle = picture.angle() - e[0];
            }
            if (this._rrAngle !== undefined) this.rotation = (this._rrAngle * Math.PI) / 180;
        } else {
            this._rrAngle = undefined;
        }
        if (this._rrWave) {
            const bitmap = this.bitmap;
            applyWave(this, this._rrWave.amp, this._rrWave.length, this._rrWave.phase, bitmap && bitmap.width, bitmap && bitmap.height);
        } else if (this._rrWaveFilter) {
            removeWave(this);
        }
    };
})();
