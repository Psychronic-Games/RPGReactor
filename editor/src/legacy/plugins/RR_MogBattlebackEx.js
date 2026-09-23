/*:
 * @target MZ
 * @plugindesc MOG Battleback EX (VX Ace), for imported games
 * @author Moghunter; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MogBattlebackEx.js
 *
 * Script calls:
 *   $gameSystem.rrBb(layer, type, p1, p2, blend, screenZ, fade)
 *     layer 1 is the floor battleback, 2 the wall, 3 and up extra layers.
 *     type 0 slide (tiles, scrolls p1 px across and p2 down each frame),
 *     1 wave (p1 0-20 sets the width, p2 the speed), 2 frame animation
 *     (Name0, Name1, ... from img/battlebacks1 for layer 1, else
 *     img/battlebacks2; a new frame every p1 frames), 3 perspective (the layer
 *     follows the screen's shake by p1 % across and p2 % down).
 *     blend 0 normal, 1 add, 2 subtract. screenZ over 100 draws the layer
 *     over the battlers. fade > 0 pulses an extra layer's opacity.
 *     A negative or null type clears the layer's effect.
 *   $gameSystem.rrBbName(layer, name)
 *     Layers 1 and 2 change the map's battlebacks as Change Battle Back
 *     does; 3 and up show img/battlebacks2/name as an extra layer.
 *   $gameSystem.rrBbClear()
 *   $gameSystem._rrBbScreenZ = n
 *
 * Settings are saved and last across battles until cleared. Called during a
 * battle, rrBb, rrBbName(1|2) and Change Battle Back fade the battlebacks out
 * and back in with the change.
 *
 * MZ has no subtractive blend: blend 2 uses multiply, the nearest it has.
 * Extra layers under z 100 draw over both stock battlebacks and under the
 * battlers; a layer's z does not reorder it against the stock battlebacks.
 * File names load as the game wrote them; the runtime corrects letter case on
 * the desktop and in web builds with a file index, elsewhere (a plain web
 * server on Linux) the case has to match the file.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 *
 * @param screenZ
 * @text Battleback z base
 * @type number
 * @min -9999
 * @default 0
 * @desc SCREEN_Z in the original script, added to every layer's z.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MogBattlebackEx');
    const SCREEN_Z = params.screenZ !== undefined && params.screenZ !== '' ? Number(params.screenZ) : 0;
    const BATTLER_Z = 100;   // the original's battler sprites sat at z 100
    const PAD = 64;          // slide planes overhang the screen so a shake shows no edge

    const idiv = (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b);
    const inRange = (v, lo, hi) => v >= lo && v <= hi;
    const inBattle = () => SceneManager._scene instanceof Scene_Battle;
    // 2 was subtract in the original; MZ has no subtract, multiply (2) is the nearest.
    const blendOf = type => (type === 1 ? 1 : type === 2 ? 2 : 0);
    function fadeState() {
        if (!$gameTemp._rrBbFade) $gameTemp._rrBbFade = [0, true];
        return $gameTemp._rrBbFade;
    }

    // ---- Game_System -------------------------------------------------------------------
    // _rrBbData[i] is the original's bb_data array: [type, p1, p2, blend, z, 5..9 working
    // values, fade]; index 0 is layer 1, 1 is layer 2, 3 and up the extra layers.

    Game_System.prototype.rrBbData = function() {
        return this._rrBbData || (this._rrBbData = []);
    };
    Game_System.prototype.rrBbNames = function() {
        return this._rrBbName || (this._rrBbName = []);
    };
    Game_System.prototype.rrBbScreenZ = function() {
        return typeof this._rrBbScreenZ === 'number' ? this._rrBbScreenZ : SCREEN_Z;
    };

    Game_System.prototype.rrBb = function(id, type = 0, power = 0, power2 = 0, blendType = 0, screenZ = 0, aFade = 0) {
        id = Number(id);
        if (!(id > 0)) return;
        if (id === 1 || id === 2) id -= 1;
        const data = this.rrBbData();
        if (type === null || type === undefined || Number(type) < 0) {
            if (data[id]) data[id].length = 0;
            else data[id] = [];
        } else {
            const n = v => Number(v) || 0;
            data[id] = [n(type), n(power), n(power2), n(blendType), n(screenZ), 0, 0, 0, 0, 0, n(aFade)];
        }
        if (inBattle()) fadeState()[0] = 256;
    };

    Game_System.prototype.rrBbName = function(id, name = '') {
        id = Number(id);
        const names = this.rrBbNames();
        if (name === null || name === undefined) {
            if (names[id]) names[id] = '';
            return;
        }
        if (!(id > 0)) return;
        if (id === 1 || id === 2) {
            $gameMap.rrChangeBattlebackName(id, String(name));
            return;
        }
        names[id] = String(name);
    };

    Game_System.prototype.rrBbClear = function() {
        if (this._rrBbData) this._rrBbData.length = 0;
        if (this._rrBbName) this._rrBbName.length = 0;
    };

    Game_Map.prototype.rrChangeBattlebackName = function(type, name) {
        if (type === 1) this._battleback1Name = name;
        if (type === 2) this._battleback2Name = name;
        if (inBattle()) $gameTemp._rrBbFade = [256, false];
    };

    const _rrBbChangeBattleback = Game_Map.prototype.changeBattleback;
    Game_Map.prototype.changeBattleback = function() {
        _rrBbChangeBattleback.apply(this, arguments);
        if (inBattle()) $gameTemp._rrBbFade = [256, false];
    };

    function inUse() {
        const s = $gameSystem;
        return !!((s._rrBbData && s._rrBbData.some(d => d && d.length)) || (s._rrBbName && s._rrBbName.some(n => n)));
    }

    // ---- frame lists (Name0, Name1, ...) ---------------------------------------------------
    // Answered at once where the build can see its files (desktop, web builds with their
    // file index), otherwise by loading one frame at a time outside ImageManager so a
    // missing one is no load error.
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
            const glProgram = PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment, name: 'rr-mog-battleback-wave' });
            return new PIXI.Filter({ glProgram, resources: { rrWave: {
                uAmp: { value: 0, type: 'f32' }, uPhase: { value: 0, type: 'f32' }, uLength: { value: 1, type: 'f32' },
                uTop: { value: 0, type: 'f32' }, uRowScale: { value: 1, type: 'f32' } } } });
        } catch (e) {
            console.error('RR_MogBattlebackEx: wave filter unavailable', e);
            return null;
        }
    }
    /** amp and length in pixels of the stretched bitmap the original waved (vw × vh over the sprite's bitmap). */
    function applyWave(sprite, amp, length, phaseDegrees, vw, vh) {
        const bitmap = sprite.bitmap;
        if (!amp || !bitmap || !bitmap.width || !bitmap.height) return;
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

    // ---- Spriteset_Battle ----------------------------------------------------------------

    const _rrBbCreateLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _rrBbCreateLowerLayer.call(this);
        $gameTemp._rrBbFade = [0, false];
        this._rrBbLayers = [];
        if (inUse()) this._rrBbRefresh();
    };

    /** The sprite showing layer 1 (index 0) or 2 (index 1): the effect layer, else the stock battleback. */
    Spriteset_Battle.prototype._rrBbBack = function(index) {
        const layer = this._rrBbLayers.find(l => l.index === index);
        if (layer) return layer.sprite;
        return index ? this._back2Sprite : this._back1Sprite;
    };

    Spriteset_Battle.prototype._rrBbDispose = function() {
        for (const layer of this._rrBbLayers || []) {
            const sprite = layer.sprite;
            if (sprite.parent) sprite.parent.removeChild(sprite);
            if (sprite._rrWaveFilter) sprite._rrWaveFilter.destroy();
            sprite.destroy();
        }
        this._rrBbLayers = [];
    };

    // refresh_bb_ex: rebuild every layer from the saved settings.
    Spriteset_Battle.prototype._rrBbRefresh = function() {
        this._rrBbDispose();
        const data = $gameSystem.rrBbData(), names = $gameSystem.rrBbNames();
        [this._back1Sprite, this._back2Sprite].forEach((stock, i) => {
            if (!stock) return;
            const name = i ? stock.battleback2Name() : stock.battleback1Name();
            // The name may have changed since the battle began (same name: the cached bitmap, no change).
            const bitmap = i ? stock.battleback2Bitmap() : stock.battleback1Bitmap();
            if (stock.bitmap !== bitmap) {
                stock.bitmap = bitmap;
                bitmap.addLoadListener(() => { if (!stock.destroyed) stock.adjustPosition(); });
            }
            if (stock._rrBbHidden) {
                stock._rrBbHidden = false;
                stock.visible = true;
            }
            const d = data[i];
            // No name: the original fell back to its plain background too.
            if (!d || !d.length || !name) return;
            const source = i ? ImageManager.loadBattleback2(name) : ImageManager.loadBattleback1(name);
            this._rrBbMakeLayer(i, d, source, i ? 'img/battlebacks2/' : 'img/battlebacks1/', name);
            stock._rrBbHidden = true;
            stock.visible = false;
        });
        names.forEach((name, i) => {
            if (!name || i < 2) return;
            if (!data[i] || !data[i].length) data[i] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            this._rrBbMakeLayer(i, data[i], ImageManager.loadBattleback2(name), 'img/battlebacks2/', name);
        });
        this._rrBbPlace();
    };

    Spriteset_Battle.prototype._rrBbMakeLayer = function(index, d, source, folder, name) {
        // clear_base_bb_ex
        for (let k = 0; k < 11; k++) if (typeof d[k] !== 'number') d[k] = 0;
        if (d[0] > 3) d[0] = 0;
        const W = Graphics.width, H = Graphics.height;
        const type = d[0];
        const layer = { index, data: d, type, sprite: null };
        let sprite;
        if (type === 0) {
            sprite = new TilingSprite(source);
            sprite.move(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
        } else {
            sprite = new Sprite(source);
            sprite.anchor.x = 0.5;
            sprite.anchor.y = 0.5;
            sprite.x = W / 2;
            sprite.y = H / 2;
        }
        if (type === 1) {
            // set_bb_wave: the image stretched to the screen plus the swing on each side.
            const range = Math.min((d[1] + 1) * 5, 500);
            layer.wave = { amp: range, length: W, speed: Math.min((d[2] + 1) * 100, 1000), phase: 0, vw: W + range * 2, vh: H };
            source.addLoadListener(() => {
                sprite.scale.x = layer.wave.vw / source.width;
                sprite.scale.y = H / source.height;
            });
        } else if (type === 2) {
            layer.frameSet = startFrames(index === 0 ? 'img/battlebacks1/' : 'img/battlebacks2/', name);
            layer.anim = [0, 0, d[1]];
        } else if (type === 3) {
            // set_bitmap_background: stretched to at least the screen.
            source.addLoadListener(() => {
                sprite.scale.x = Math.max(source.width, W) / source.width;
                sprite.scale.y = Math.max(source.height, H) / source.height;
            });
        }
        // set_data_misc works on the saved array itself, as the original did.
        d[5] = 0;
        d[6] = 0;
        d[7] = idiv(255, d[10] > 0 ? d[10] : 1);
        d[8] = 0;
        d[9] = 255;
        const base = $gameSystem.rrBbScreenZ() + d[4];
        layer.z = index === 0 ? base : index === 1 ? 1 + base : index + base;
        sprite.blendMode = blendOf(d[3]);
        layer.sprite = sprite;
        this._rrBbLayers.push(layer);
        return layer;
    };

    Spriteset_Battle.prototype._rrBbPlace = function() {
        const base = this._baseSprite, field = this._battleField;
        if (!this._rrBbBelow) {
            this._rrBbBelow = new Sprite();
            this._rrBbAbove = new Sprite();
        }
        for (const holder of [this._rrBbBelow, this._rrBbAbove]) if (holder.parent) holder.parent.removeChild(holder);
        const at = field && field.parent === base ? base.getChildIndex(field) : base.children.length;
        base.addChildAt(this._rrBbBelow, at);
        base.addChildAt(this._rrBbAbove, at + 2 <= base.children.length ? at + 2 : base.children.length);
        const below = [], above = [];
        for (const layer of this._rrBbLayers) {
            // Battlers sat at z 100; extra layers were made after them, so a tie puts them on top.
            const over = layer.index < 2 ? layer.z > BATTLER_Z : layer.z >= BATTLER_Z;
            if (over) above.push(layer);
            else if (layer.index < 2) {
                const stock = layer.index ? this._back2Sprite : this._back1Sprite;
                const parent = stock.parent || base;
                parent.addChildAt(layer.sprite, stock.parent ? parent.getChildIndex(stock) + 1 : 0);
            } else below.push(layer);
        }
        const order = (a, b) => a.z - b.z || a.index - b.index;
        below.sort(order).forEach(l => this._rrBbBelow.addChild(l.sprite));
        above.sort(order).forEach(l => this._rrBbAbove.addChild(l.sprite));
    };

    const _rrBbUpdate = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        const active = this._rrBbLayers && (this._rrBbLayers.length || fadeState()[0] !== 0);
        if (active) this._rrBbTransition();
        _rrBbUpdate.call(this);
        if (active) for (const layer of this._rrBbLayers) if (layer.index < 2) this._rrBbUpdateLayer(layer);
        if (this._rrBbBelow) this._rrBbBelow.visible = this._rrBbAbove.visible = !this._reactorRoom;
    };

    // update_battleback_transition: extra layers take layer 1's opacity, then the change fades through.
    Spriteset_Battle.prototype._rrBbTransition = function() {
        let back1 = this._rrBbBack(0);
        for (const layer of this._rrBbLayers) {
            if (layer.index < 2) continue;
            const d = layer.data;
            if (d[10] > 0 && fadeState()[0] === 0) this._rrBbPulse(d, layer.sprite);
            else if (back1) layer.sprite.opacity = back1.opacity;
            this._rrBbUpdateLayer(layer);
        }
        const fade = fadeState();
        if (fade[0] === 0) return;
        if (fade[1]) {
            $gameTemp._rrBbFade = [0, false];
            this._rrBbRefresh();
            back1 = this._rrBbBack(0);
            if (back1) back1.opacity = 255;
        }
        const now = fadeState();
        now[0] -= 1;
        if (inRange(now[0], 129, 300)) {
            if (back1) back1.opacity -= 2;
        } else if (inRange(now[0], 1, 128)) {
            if (now[0] === 128) {
                this._rrBbRefresh();
                back1 = this._rrBbBack(0);
                if (back1) back1.opacity = 0;
            }
            if (back1) back1.opacity += 2;
        } else if (back1) {
            back1.opacity = 255;
        }
        const back2 = this._rrBbBack(1);
        if (back1 && back2) back2.opacity = back1.opacity;
    };

    // update_bb_opacity. Shares slots 5 and 6 with the slide's scroll, as the original did.
    Spriteset_Battle.prototype._rrBbPulse = function(d, sprite) {
        d[6] += 1;
        if (d[6] < d[5]) return;
        d[6] = 0;
        d[8] += 1;
        if (inRange(d[8], 0, d[10])) d[9] -= d[7];
        else if (inRange(d[8], d[10], d[10] * 2 - 1)) d[9] += d[7];
        else { d[9] = 255; d[8] = 0; }
        sprite.opacity = d[9];
    };

    Spriteset_Battle.prototype._rrBbUpdateLayer = function(layer) {
        const d = layer.data, sprite = layer.sprite;
        const type = d.length ? d[0] : -1;
        if (type === 0 && sprite.origin) {
            d[5] += d[1];
            d[6] += d[2];
            if (d[5] >= 99999999) d[5] = 0;
            if (d[6] >= 99999999) d[6] = 0;
            sprite.origin.x = d[5] - PAD;
            sprite.origin.y = d[6] - PAD;
        } else if (type === 2 && layer.frameSet) {
            this._rrBbAnimate(layer);
        } else if (type === 3) {
            // bb_camera_effect: the layer follows p1/p2 % of the screen's own offset (shake).
            const bx = Math.max(-100, Math.min(100, d[1])), by = Math.max(-100, Math.min(100, d[2]));
            sprite.x = Graphics.width / 2 - this.x * (1 - bx / 100);
            sprite.y = Graphics.height / 2 - this.y * (1 - by / 100);
        } else if (layer.wave) {
            // RGSS advances wave_phase by wave_speed/180 degrees each Sprite#update.
            const wave = layer.wave;
            wave.phase += wave.speed / 180;
            applyWave(sprite, wave.amp, wave.length, wave.phase, wave.vw, wave.vh);
        }
    };

    // set_animated_bb / update_background_an / refresh_bb_anime
    Spriteset_Battle.prototype._rrBbAnimate = function(layer) {
        const anim = layer.anim;
        if (!layer.frames) {
            if (!framesReady(layer.frameSet)) return;
            if (layer.frameSet.frames.length <= 1) {
                layer.frameSet = null;
                return;
            }
            layer.frames = layer.frameSet.frames;
            this._rrBbNextFrame(layer);
            return;
        }
        anim[1] += 1;
        if (anim[1] >= anim[2]) this._rrBbNextFrame(layer);
    };
    Spriteset_Battle.prototype._rrBbNextFrame = function(layer) {
        const anim = layer.anim, frames = layer.frames;
        layer.sprite.bitmap = frames[anim[0] % frames.length];
        anim[0] += 1;
        anim[1] = 0;
        if (anim[0] >= frames.length) anim[0] = 0;
    };
})();
