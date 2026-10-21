/*:
 * @target MZ
 * @plugindesc GTBS sprites (VX Ace): units, cursor, ranges, banners and effects on the battle map, for imported games
 * @author GubiD (GTBS 1.5.1.4), Hime (Map Saver), NeonBlack (Large Sprite Fix) and the game's author; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 * @base RR_PinnacleGtbs
 * @orderAfter RR_PinnacleGtbsWindows
 *
 * @help RR_PinnacleGtbsSprites.js
 *
 * What the grid battle shows on the map: each unit as its battler sheet with
 * a health bar under its feet (a crown on bosses, the level on army units),
 * dimmed once it has acted, blinking in its team's colour while an action is
 * confirmed; the cursor and the terrain box in the corner (the tile, its name,
 * its defence and evasion); move, attack and skill tiles; the turn ribbons,
 * the battle's goal, Victory/Defeat/Escape, the items that drop; projectiles
 * (straight or arched, the view following an arch); the weapon swung at an
 * attack; the facing arrows; "Thinking" while the AI decides; the dissolve
 * into the battle.
 *
 * The terrain box and the minimap read an image of the whole map made as
 * the battle starts (Hime's Map Saver did this).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 */
(() => {
    'use strict';
    const R = window.RRGtbs;
    if (!R) return;
    const { text, rand, P } = R;
    const get = R.get, idiv = R.idiv;
    const TW = () => $gameMap.tileWidth(), TH = () => $gameMap.tileHeight();
    const css = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] === undefined ? 255 : c[3]) / 255})`;
    const scene = () => R.scene();

    // Window.png's text colours (GTBS read them off the skin, as the windows do).
    const skinColor = (n) => ColorManager.textColor(n);
    const skinReadyQ = () => !!(ColorManager._windowskin && ColorManager._windowskin.isReady());

    //=========================================================================
    // Hime's Map Saver: the whole map as one image (parallax, layers, shadows)
    //=========================================================================
    R._mapshot = null;
    R.makeMapshot = function(mapId) {
        const w = $gameMap.width(), h = $gameMap.height(), tw = TW(), th = TH();
        const bmp = new Bitmap(w * tw, h * th);
        R._mapshot = bmp;
        const tileset = $gameMap.tileset();
        if (!tileset) return bmp;
        const sheets = tileset.tilesetNames.map(n => (n ? ImageManager.loadTileset(n) : null));
        const parallax = $gameMap.parallaxName() ? ImageManager.loadParallax($gameMap.parallaxName()) : null;
        const draw = () => {
            bmp.clear();
            if (parallax && parallax.isReady()) bmp.blt(parallax, 0, 0, parallax.width, parallax.height, 0, 0);
            for (let z = 0; z < 3; z++) {
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const tileId = $gameMap.tileId(x, y, z);
                    if (tileId > 0) R.drawTile(bmp, sheets, tileId, x * tw, y * th);
                }
                if (z === 1) {
                    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                        const s = $gameMap.tileId(x, y, 4) & 0x0f;
                        if (!s) continue;
                        const hw = tw / 2, hh = th / 2;
                        const color = 'rgba(0,0,0,0.5)';
                        if (s & 1) bmp.fillRect(x * tw, y * th, hw, hh, color);
                        if (s & 2) bmp.fillRect(x * tw + hw, y * th, hw, hh, color);
                        if (s & 4) bmp.fillRect(x * tw, y * th + hh, hw, hh, color);
                        if (s & 8) bmp.fillRect(x * tw + hw, y * th + hh, hw, hh, color);
                    }
                }
            }
            // Events marked <screenshot: tile> are part of the picture.
            for (const event of $gameMap.events()) {
                const page = event.event().pages[0];
                if (!page || !page.list.some(c => c.code === 108 && /<screenshot:\s*tile\s*>/i.test(c.parameters[0]))) continue;
                if (page.image.tileId > 0) R.drawTile(bmp, sheets, page.image.tileId, event.x * tw, event.y * th);
            }
            bmp._rrMapshotReady = true;
            bmp._baseTexture && bmp._baseTexture.update && bmp._baseTexture.update();
        };
        const pending = sheets.filter(b => b).concat(parallax ? [parallax] : []);
        let left = pending.length;
        if (!left) draw();
        for (const b of pending) b.addLoadListener(() => { if (--left === 0) draw(); });
        return bmp;
    };
    R.clearMapshot = function() { if (R._mapshot) { R._mapshot.destroy(); R._mapshot = null; } };
    R.mapshot = () => R._mapshot;
    // One tile, autotiles included, drawn the way MZ's Tilemap draws it.
    R.drawTile = function(bmp, sheets, tileId, dx, dy) {
        const tw = TW(), th = TH();
        if (Tilemap.isAutotile(tileId)) {
            const kind = Tilemap.getAutotileKind(tileId), shape = Tilemap.getAutotileShape(tileId);
            const tx = kind % 8, ty = Math.floor(kind / 8);
            let bx = 0, by = 0, setNumber = 0, isTable = false, table = Tilemap.FLOOR_AUTOTILE_TABLE;
            if (Tilemap.isTileA1(tileId)) {
                setNumber = 0;
                if (kind === 0) { bx = 0; by = 0; }
                else if (kind === 1) { bx = 0; by = 3; }
                else if (kind === 2) { bx = 6; by = 0; }
                else if (kind === 3) { bx = 6; by = 3; }
                else {
                    bx = Math.floor(tx / 4) * 8; by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
                    if (kind % 2 === 0) { /* water */ } else { bx += 6; table = Tilemap.WATERFALL_AUTOTILE_TABLE; }
                }
            } else if (Tilemap.isTileA2(tileId)) {
                setNumber = 1; bx = tx * 2; by = (ty - 2) * 3; isTable = Tilemap.isTableTile && Tilemap.isTableTile(tileId);
            } else if (Tilemap.isTileA3(tileId)) {
                setNumber = 2; bx = tx * 2; by = (ty - 6) * 2; table = Tilemap.WALL_AUTOTILE_TABLE;
            } else if (Tilemap.isTileA4(tileId)) {
                setNumber = 3; bx = tx * 2; by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
                if (ty % 2 === 1) table = Tilemap.WALL_AUTOTILE_TABLE;
            }
            const source = sheets[setNumber];
            if (!source || !source.isReady()) return;
            const autotileTable = table[shape];
            const w1 = tw / 2, h1 = th / 2;
            for (let i = 0; i < 4; i++) {
                const qsx = autotileTable[i][0], qsy = autotileTable[i][1];
                const sx1 = (bx * 2 + qsx) * w1, sy1 = (by * 2 + qsy) * h1;
                const dx1 = dx + (i % 2) * w1, dy1 = dy + Math.floor(i / 2) * h1;
                if (isTable && (qsy === 1 || qsy === 5)) {
                    const qsx2 = qsy === 1 ? (4 - qsx) % 4 : qsx, qsy2 = 3;
                    const sx2 = (bx * 2 + qsx2) * w1, sy2 = (by * 2 + qsy2) * h1;
                    bmp.blt(source, sx2, sy2, w1, h1, dx1, dy1, w1, h1);
                    bmp.blt(source, sx1, sy1, w1, h1 / 2, dx1, dy1 + h1 / 2, w1, h1 / 2);
                } else {
                    bmp.blt(source, sx1, sy1, w1, h1, dx1, dy1, w1, h1);
                }
            }
        } else {
            const setNumber = Tilemap.isTileA5(tileId) ? 4 : 5 + Math.floor(tileId / 256);
            const source = sheets[setNumber];
            if (!source || !source.isReady()) return;
            const sx = ((Math.floor(tileId / 128) % 2) * 8 + (tileId % 8)) * tw;
            const sy = (Math.floor((tileId % 256) / 8) % 16) * th;
            bmp.blt(source, sx, sy, tw, th, dx, dy, tw, th);
        }
    };

    //=========================================================================
    // Graphics.transition with a pattern: the last frame of the map dissolves
    // where the pattern is dark first, a soft edge "vague" wide
    //=========================================================================
    class Sprite_TbsTransition extends Sprite {
        constructor(snapshot, patternName, duration, vague) {
            super();
            this._duration = duration;
            this._vague = vague;
            this._count = 0;
            this._done = !snapshot;
            if (!snapshot) return;
            this._snapshot = snapshot;
            this._pattern = ImageManager.loadSystem(patternName);
            this.bitmap = new Bitmap(Graphics.width, Graphics.height);
            this.bitmap.blt(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, Graphics.width, Graphics.height);
            this._source = null;
        }
        isDone() { return this._done; }
        updateTransition() {
            if (this._done) return;
            if (!this._pattern.isReady()) return;
            if (!this._source) {
                const w = Graphics.width, h = Graphics.height;
                const tmp = document.createElement('canvas');
                tmp.width = w; tmp.height = h;
                const tctx = tmp.getContext('2d');
                tctx.drawImage(this._pattern.canvas || this._pattern._image, 0, 0, w, h);
                const pd = tctx.getImageData(0, 0, w, h).data;
                this._mask = new Uint8Array(w * h);
                for (let i = 0; i < w * h; i++) this._mask[i] = pd[i * 4];
                this._source = this.bitmap.context.getImageData(0, 0, w, h);
            }
            this._count++;
            const t = (255 + this._vague) * this._count / this._duration;
            const out = this.bitmap.context.createImageData(this._source.width, this._source.height);
            const src = this._source.data, dst = out.data, mask = this._mask, vague = this._vague;
            for (let i = 0; i < mask.length; i++) {
                const a = Math.max(0, Math.min(1, (mask[i] - t + vague) / vague));
                const o = i * 4;
                dst[o] = src[o]; dst[o + 1] = src[o + 1]; dst[o + 2] = src[o + 2]; dst[o + 3] = src[o + 3] * a;
            }
            this.bitmap.context.putImageData(out, 0, 0);
            this.bitmap._baseTexture.update();
            if (this._count >= this._duration) this._done = true;
        }
    }
    window.Sprite_TbsTransition = Sprite_TbsTransition;

    //=========================================================================
    // Spriteset_TBS: the battle map, its units and effects
    //=========================================================================
    class Spriteset_TBS extends Spriteset_Map {
        constructor(scene) {
            super();
            this._scene = scene;
        }
        createCharacters() {
            this._characterSprites = [];
            this._tbsBattlerSprites = new Map();
            this._tbsEventSprites = new Map();
            this._tileSprites = [];
            this._projectiles = [];
            this._imageContainers = new Map();
            this._globalImages = new Map();
            this._imageInstructions = [];
            this._spotSprites = [];
            const sc = R.scene() || this._scene || SceneManager._nextScene || SceneManager._scene;
            const events = sc && sc.gtbsEvents ? sc.gtbsEvents() : [];
            for (const event of events) this.createCharacter(event);
            for (const actor of $gameParty.tbsExistingMembers().concat($gameParty.tbsNeutrals())) this.createCharacter(actor);
            for (const enemy of $gameTroop.tbsExistingMembers()) this.createCharacter(enemy);
            this.createCursor();
        }
        createCharacter(obj) {
            if (obj instanceof Game_Battler) {
                const sprite = new Sprite_Battler_GTBS(obj);
                this._tbsBattlerSprites.set(obj, sprite);
                this._tilemap.addChild(sprite);
                return sprite;
            }
            const sprite = new Sprite_Character(obj);
            this._tbsEventSprites.set(obj, sprite);
            this._characterSprites.push(sprite);
            this._tilemap.addChild(sprite);
            return sprite;
        }
        disposeCharacter(ch) {
            const sprite = this._tbsBattlerSprites.get(ch) || this._tbsEventSprites.get(ch);
            if (!sprite) return;
            this._tbsBattlerSprites.delete(ch);
            this._tbsEventSprites.delete(ch);
            this._characterSprites = this._characterSprites.filter(s => s !== sprite);
            if (sprite.parent) sprite.parent.removeChild(sprite);
            if (sprite.disposeGtbs) sprite.disposeGtbs();
        }
        createCursor() {
            this._cursorSprite = new Battle_Cursor(this);
            this._cursorSprite.visible = false;
            this._tilemap.addChild(this._cursorSprite);
        }
        cursor() { return this._cursorSprite; }
        // The terrain box and the extra cursor image: over the map, under the pictures.
        addOverMap(sprite) {
            const i = this.children.indexOf(this._pictureContainer);
            if (i >= 0) this.addChildAt(sprite, i); else this.addChild(sprite);
        }
        update() {
            super.update();
            if (!this._tbsBattlerSprites) return;
            this.updateProjectiles();
            this.updateImageQueues();
            this.updateSpots();
        }
        findTargetSprite(target) {
            if (!this._tbsBattlerSprites) return super.findTargetSprite(target);
            if (target instanceof Game_Battler) return this._tbsBattlerSprites.get(target);
            const spot = this._spotSprites.find(s => s._spot === target);
            if (spot) return spot;
            return this._tbsEventSprites.get(target) || super.findTargetSprite(target);
        }
        getBattlerSprite(ch) {
            if (ch instanceof TBS_Cursor) return this._cursorSprite;
            return this._tbsBattlerSprites.get(ch) || this._tbsEventSprites.get(ch) || null;
        }
        battlerSprites() { return [...this._tbsBattlerSprites.values()]; }
        drawRange(range, type) {
            for (const [x, y] of range || []) {
                const s = new Sprite_Range(type, x, y);
                this._tileSprites.push(s);
                this._tilemap.addChild(s);
            }
        }
        disposeTileSprites() {
            for (const s of this._tileSprites) { if (s.parent) s.parent.removeChild(s); s.destroy(); }
            this._tileSprites.length = 0;
        }
        isAnimationPlaying() {
            if (this._projectiles.length > 0) return true;
            return Spriteset_Base.prototype.isAnimationPlaying.call(this) || this.battlerSprites().some(s => s._animationQueue.length > 0);
        }
        isEffecting() { return this.battlerSprites().some(s => s.isEffecting()); }
        isMovement() { return this.battlerSprites().some(s => s.isActionMoving()); }
        createWaitCursor(battler) {
            const s = new Wait_Cursor(battler);
            this._tilemap.addChild(s);
            return s;
        }
        removeWaitCursor(s) { if (s) { if (s.parent) s.parent.removeChild(s); s.destroy(); } }
        addThinking(s) { this.addOverMap(s); }
        removeThinking(s) { if (s) { if (s.parent) s.parent.removeChild(s); s.destroy(); } }
        addProjectile(attacker, data, type, target) {
            const p = new Projectile(attacker, target || R.cursor(), data, type);
            if (!p.isDisposed()) { this._tilemap.addChild(p); this._projectiles.push(p); }
        }
        updateProjectiles() {
            for (const p of this._projectiles.slice()) {
                p.updateProjectile();
                if (p.isDisposed()) this._projectiles.splice(this._projectiles.indexOf(p), 1);
            }
        }
        // Anim_Miss: a map tile shows Miss (0), the summon animation (1) or a given one.
        playMapAnimation(x, y, type, animId = 0) {
            const id = type === 0 ? get('MISS_ANIMATION', 111) : type === 1 ? get('SUMMON_ANIMATION', 75) : animId;
            if (!id || !$dataAnimations[id]) return;
            const spot = { x, y, _rrSpot: true };
            const sprite = new Sprite_TbsSpot(spot);
            this._spotSprites.push(sprite);
            this._tilemap.addChild(sprite);
            $gameTemp.requestAnimation([spot], id);
            sprite._started = 2;
        }
        updateSpots() {
            for (const s of this._spotSprites.slice()) {
                s.updateSpot();
                if (s._started > 0) { s._started--; continue; }
                const playing = this._animationSprites.some(a => a.targetObjects && a.targetObjects.includes(s._spot));
                if (!playing) { this._spotSprites.splice(this._spotSprites.indexOf(s), 1); if (s.parent) s.parent.removeChild(s); s.destroy(); }
            }
        }
        // The weapon's swing (make_weapon_animation): its action list (the default: the icon appears, turns
        // a quarter, thrusts forward and goes) on the unit's weapon icon.
        makeWeaponAnimation(battler, wepIndex) {
            const sc = R.scene();
            const imp = sc.getDefaultImageParameters();
            imp.container = battler;
            imp.key = 'weapon' + (wepIndex + 1);
            imp.filename = 'weapon' + (wepIndex + 1);
            let weapon = null;
            if (battler.isActor()) weapon = battler.weapons()[wepIndex] || null;
            else {
                const ew = (R.G.Enemy_Weapon || {})[battler._enemyId];
                if (ew != null) weapon = $dataWeapons[Array.isArray(ew) ? ew[wepIndex] : ew] || null;
            }
            if (weapon) this.deliverWeaponAction(weapon, imp);
        }
        deliverWeaponAction(weapon, base) {
            const sc = R.scene();
            let aList = ((R.G.ACTION_WEAPONS || {})[weapon.id] || []).slice();
            if (!aList.length) {
                aList = [
                    ['create', 'icon', ['angle 0<>', 'center 3']],
                    ['wait', '', ['16']],
                    ['move', 'icon', ['angle 90<>', 'time 16']],
                    ['move', 'icon', ['user', 'forward 16', 'time 6']],
                    ['wait', '', ['32']],
                    ['delete', 'icon', ['.']]
                ];
            }
            while (aList.length) {
                const act = aList.shift();
                const imp = sc.setupImageMovement(act[2]);
                const kind = String(act[0]);
                if (/^create/i.test(kind)) imp.create = true;
                else if (/^delete/i.test(kind)) imp.delete = true;
                else if (/^move/i.test(kind)) { if (/^(user|self|target|enemy)/i.test(String(act[1]))) { sc.actionMovement(act); continue; } }
                else if (/^wait/i.test(kind)) sc.actionWait(act);
                else if (/^screen/i.test(kind)) sc.actionScreen(act);
                else if (/^cleanup/i.test(kind)) sc.actionCleanup();
                if (imp.filename == null && imp.key == null) {
                    imp.key = base.key;
                    imp.filename = base.filename;
                    imp.isIcon = true;
                    imp.container = base.container;
                }
                this.addImageInstruction(imp);
            }
        }
        addImageInstruction(imp) { this._imageInstructions.push(imp); }
        updateImageQueues() {
            for (const ins of this._imageInstructions) {
                const img = this.objectForManipulation(ins);
                if (img) img.addAction(ins);
            }
            this._imageInstructions.length = 0;
            for (const [cntKey, cnt] of this._imageContainers) {
                for (const [key, img] of [...cnt]) {
                    img.updateImage();
                    if (img.canDelete()) cnt.delete(key);
                }
                if (!cnt.size) this._imageContainers.delete(cntKey);
            }
            for (const [key, img] of [...this._globalImages]) {
                img.updateImage();
                if (img.canDelete()) this._globalImages.delete(key);
            }
        }
        objectForManipulation(ins) {
            const make = () => { const s = new Sprite_ActionImage(); this._scene.addInfoSprite(s); return s; };
            if (ins.container != null) {
                let cnt = this._imageContainers.get(ins.container);
                if (cnt) {
                    if (cnt.has(ins.key)) return cnt.get(ins.key);
                    if (ins.create) { const img = make(); cnt.set(ins.key, img); return img; }
                    return null;
                }
                if (ins.create) { cnt = new Map(); this._imageContainers.set(ins.container, cnt); const img = make(); cnt.set(ins.key, img); return img; }
                return null;
            }
            if (this._globalImages.has(ins.key)) return this._globalImages.get(ins.key);
            if (ins.create) { const img = make(); this._globalImages.set(ins.key, img); return img; }
            return null;
        }
        destroy(options) {
            if (this._cursorSprite) this._cursorSprite.disposeLocation();
            super.destroy(options);
        }
    }
    window.Spriteset_TBS = Spriteset_TBS;

    //=========================================================================
    // Sprite_Battler_GTBS: a unit on the map
    //=========================================================================
    class Sprite_Battler_GTBS extends Sprite {
        constructor(battler) {
            super();
            this._character = battler;
            this._animationQueue = [];
            this._effectType = null;
            this._effectDuration = 0;
            this._characterVisible = false;
            this._positions = { current: { x: 0, y: 0 }, target: { x: 0, y: 0, time: 10 }, jumppeak: 0 };
            this._characterName = null;
            this._damageGtbs = new RRVictorDamage.Game_Damage(null, battler, this);
            this.anchor.x = 0.5;
            this.anchor.y = 1;
            this.z = 3;
            this.updateGtbs();
        }
        get bat() { return this._character; }
        checkCharacter(ch) { return this._character === ch; }
        update() {
            super.update();
            this.updateGtbs();
        }
        updateGtbs() {
            if (!this._character) return;
            this.updateBitmap();
            this.updateSrcRect();
            this.updatePosition();
            this.updateOther();
            this.setupNewEffect();
            this._damageGtbs.update();
            this.updateShadow();
        }
        appendAnimQueue(anims) {
            if (typeof anims === 'number') anims = [anims];
            this._animationQueue = this._animationQueue.concat(anims || []);
        }
        isAnimationPlaying() {
            const ss = R.scene() && R.scene()._spriteset;
            if (!ss) return false;
            if ($gameTemp._animationQueue && $gameTemp._animationQueue.some(r => r.targets.includes(this._character))) return true;
            return ss._animationSprites.some(a => a.targetObjects && a.targetObjects.includes(this._character));
        }
        isActionMoving() {
            const p = this._positions;
            return p.target.x !== p.current.x || p.target.y !== p.current.y;
        }
        isEffecting() {
            if (this._damageGtbs.showing()) return true;
            return this._effectType != null || this.isActionMoving();
        }
        updateBitmap() {
            const name = this._character.tbsCharacterName();
            const hue = this._character.tbsCharacterHue();
            if (name === this._characterName && hue === this._hue) return;
            this._characterName = name;
            this._hue = hue;
            const source = ImageManager.loadEnemy(name, hue);
            this._source = source;
            this.bitmap = null;
            this._cellsDrawn = new Map();
            source.addLoadListener(() => {
                if (this._source !== source) return;
                const copy = new Bitmap(source.width, source.height);
                copy.blt(source, 0, 0, source.width, source.height, 0, 0);
                this.bitmap = copy;
                const sign = /^[!$]./.exec(name);
                if (sign && sign[0].includes('$')) { this._cw = source.width / 3; this._ch = source.height / 4; }
                else { this._cw = source.width / 12; this._ch = source.height / 8; }
                this._cellsDrawn = new Map();
            });
        }
        // norm_src_rect: the frame for the unit's index, pattern and facing, with its health bar (or, for an
        // army, its level) painted along the frame's bottom; a crown for bosses.
        updateSrcRect() {
            if (!this.bitmap || !this._cw) return;
            const ch = this._character;
            const index = ch.tbsCharacterIndex() || 0;
            const pattern = ch.tbsPattern() < 3 ? ch.tbsPattern() : 1;
            const cw = this._cw, chh = this._ch;
            const sx = (index % 4 * 3 + pattern) * cw;
            const sy = (Math.floor(index / 4) * 4 + (this.getDirection() - 2) / 2) * chh;
            this.setFrame(sx, sy, cw, chh);
            const army = ch.isArmy();
            const rate = army ? 0 : (ch.mhp > 0 ? ch.hp / ch.mhp : 0);
            const boss = ch.collapseType() === 1;
            const key = sx + ',' + sy;
            const skinReady = skinReadyQ();
            const sig = (army ? 'L' + ch.level : rate.toFixed(4) + (boss ? 'B' : '')) + (skinReady ? '' : '?');
            if (this._cellsDrawn.get(key) === sig) return;
            this._cellsDrawn.set(key, sig);
            const b = this.bitmap;
            b.clearRect(sx, sy, cw, chh);
            b.blt(this._source, sx, sy, cw, chh, sx, sy);
            if (army) {
                b.fontSize = R.fontPx(22);
                b.drawText(String(ch.level), sx, sy + chh - 22, cw, 24, 'center');
            } else {
                const width = Math.min(ch.tbsUnitSize() * 32, cw);
                const gx = sx + (cw / 2 - width / 2);
                b.fillRect(gx, sy + chh - 6, width, 6, skinColor(19));
                const fillW = Math.trunc((width - 2) * rate);
                const colors = rate < 0.40 ? [18, 10] : rate < 0.70 ? [14, 17] : [11, 3];
                if (fillW > 0) b.gradientFillRect(gx + 1, sy + chh - 5, fillW, 4, skinColor(colors[0]), skinColor(colors[1]));
                if (boss) {
                    const crown = ImageManager.loadSystem('Crown');
                    if (crown.isReady()) b.blt(crown, 0, 0, 9, 8, gx, sy + chh - 9);
                    else this._cellsDrawn.delete(key);
                }
            }
        }
        getDirection() { return this._dir || this._character.tbsDirection(); }
        updatePosition() {
            const ch = this._character;
            this.x = ch.tbsScreenX();
            this.y = ch.tbsScreenY();
            this.updateMovement();
            // Large units sit on their whole square; fliers float.
            this.x += 16 * (ch.tbsUnitSize() - 1);
            this.y += 32 * (ch.tbsUnitSize() - 1);
            this.y = ch.tbsApplyFloatEffect(this.y);
            const off = ch._tbsOffset || 0, d = this.getDirection();
            this.x += d === 8 ? off : d === 6 ? -off : 0;
            this.y += d === 6 ? off : d === 4 ? -off : 0;
            this.x += this._positions.current.x;
            this.y += this._positions.current.y - this.actionJumpHeight();
        }
        updateMovement() {
            const p = this._positions;
            if (!this.isActionMoving()) return;
            const tx = p.target.x - p.current.x, ty = p.target.y - p.current.y;
            if (p.target.time === 0) { p.current.x = p.target.x; p.current.y = p.target.y; }
            else {
                p.current.x += tx / p.target.time;
                p.current.y += ty / p.target.time;
                p.target.time--;
            }
        }
        actionJumpHeight() {
            const p = this._positions;
            if (p.jumppeak > 0) return (p.jumppeak * p.jumppeak - Math.pow(Math.abs(p.target.time - p.jumppeak), 2)) / 2;
            return 0;
        }
        prepareMoveAction(action) {
            const p = this._positions;
            p.target = { x: 0, y: 0, time: action.time };
            p.jumppeak = action.jumpPeak > 0 ? action.jumpPeak : 0;
            if (action.reset) return;
            if (action.xy) { p.target.x = action.xy.x; p.target.y = action.xy.y; }
            if (action.targets) {
                const tsprite = R.scene().getBattlerSprite(action.targets[0]);
                if (tsprite) {
                    let tx = tsprite.x - (this.x - p.current.x), ty = tsprite.y - (this.y - p.current.y);
                    const w = tsprite.width, h = tsprite.height;
                    if (action.position === 'head') { p.target.x = tx + w / 2; p.target.y = Math.trunc(ty - h * 0.75); }
                    else if (action.position === 'feet') { p.target.x = tx; p.target.y = ty + tsprite.height / 2; }
                    else { p.target.x = tx; p.target.y = ty; }
                    const d = this.getDirection(), ox = this.width / 2, oy = this.height;
                    if ([7, 4, 1].includes(d)) p.target.x += ox;
                    else if ([9, 6, 3].includes(d)) p.target.x -= ox;
                    else if (d === 8) p.target.y += oy / 3;
                    else p.target.y -= oy / 3;
                }
            }
            for (const [dir, amount] of action.offsetList) {
                if (dir === 'left') p.target.x -= amount;
                else if (dir === 'right') p.target.x += amount;
                else if (dir === 'up') p.target.y -= amount;
                else if (dir === 'down') p.target.y += amount;
            }
        }
        // Dimmed once acted (state 53 keeps it lit), blinking in its team's colour while an action is confirmed.
        updateOther() {
            this.updateEffect();
            const ch = this._character;
            if ($gameSystem.tbsActed().includes(ch) && !ch.isDead() && !ch._tbsNeutral) {
                this.opacity = ch.isStateAffected(53) ? 255 : get('DIM_OPACITY', 120);
            } else {
                this.opacity = 255;
                if (this._effectType == null) this.revertToNormal();
            }
            if (this._effectType == null) {
                const sc = R.scene();
                if (sc && sc.confirmVisible()) {
                    const count = idiv(Graphics.frameCount % 60, 10);
                    const c = ch.tbsTeam() === 'actor' ? [0, 0, 255] : [255, 0, 0];
                    this.setBlendColor([c[0], c[1], c[2], 128 - 16 * count]);
                } else {
                    this.setBlendColor([0, 0, 0, 0]);
                }
            }
            this.blendMode = ch._tbsBlendType || 0;
            this.visible = !ch._tbsTransparent;
            if (this.updateEffectOpacity) this.updateEffectOpacity();
        }
        revertToNormal() {
            this.blendMode = 0;
            this.setBlendColor([0, 0, 0, 0]);
        }
        startEffect(type) {
            this._effectType = type;
            switch (type) {
                case 'appear': this._effectDuration = 16; break;
                case 'disappear': this._effectDuration = 32; break;
                case 'whiten': this._effectDuration = 16; break;
                case 'blink': this._effectDuration = 20; break;
                case 'collapse': this._effectDuration = 48; this.checkBodies(); break;
                case 'boss_collapse': this._effectDuration = this._ch || 48; this.checkBodies(); break;
                case 'instant_collapse': this._effectDuration = 16; break;
                default: this._effectType = null; break;
            }
            this.revertToNormal();
        }
        checkBodies() {
            const b = this._character;
            if ((b.isActor() && $gameSystem.tbsActorsBodies()) || (!b.isActor() && $gameSystem.tbsEnemiesBodies())) { this._effectType = null; this._effectDuration = 0; }
        }
        updateEffect() {
            if (this._effectDuration <= 0) { this._effectOpacity = null; return; }
            this._effectDuration--;
            const d = this._effectDuration;
            switch (this._effectType) {
                case 'whiten': this.setBlendColor([255, 255, 255, Math.max(0, 128 - (16 - d) * 10)]); this._effectOpacity = null; break;
                case 'blink': this._effectOpacity = d % 10 < 5 ? 255 : 0; break;
                case 'appear': this._effectOpacity = (16 - d) * 16; break;
                case 'disappear': this._effectOpacity = 256 - (32 - d) * 10; break;
                case 'collapse': this.blendMode = 1; this.setBlendColor([255, 128, 128, 128]); this._effectOpacity = 256 - (48 - d) * 6; break;
                case 'boss_collapse': {
                    const alpha = Math.trunc(d * 120 / (this._ch || 48));
                    this.setBlendColor([255, 255, 255, 255 - alpha]);
                    this._effectOpacity = alpha;
                    if (d % 20 === 19) SoundManager.playBossCollapse2();
                    break;
                }
                case 'instant_collapse': this._effectOpacity = 0; break;
                default: break;
            }
            if (this._effectDuration === 0) { this._effectType = null; this._effectOpacity = null; }
        }
        updateEffectOpacity() {
            if (this._effectOpacity != null) this.opacity = Math.max(0, Math.min(255, this._effectOpacity));
            if (this._effectType === 'collapse') this.blendMode = 1;
        }
        // setup_new_effect: appear, effects the battler asks for, queued animations, move actions, popups.
        setupNewEffect() {
            const ch = this._character;
            if (!this._characterVisible && ch.isAlive()) { this.startEffect('appear'); this._characterVisible = true; }
            else if (this._characterVisible && ch.isHidden()) { this.startEffect('disappear'); this._characterVisible = false; }
            if (this._characterVisible && ch._spriteEffectType) { this.startEffect(ch._spriteEffectType); ch._spriteEffectType = null; }
            if (this._animationQueue.length > 0 && !this.isAnimationPlaying()) ch.animationId = this._animationQueue.shift();
            if (ch.animationId !== 0) {
                if (ch.animationId > 0 && $dataAnimations[ch.animationId]) $gameTemp.requestAnimation([ch], ch.animationId, !!ch._animationMirror);
                ch.animationId = 0;
            }
            if (!this.isActionMoving() && ch.tbsMoveActionWaiting()) this.prepareMoveAction(ch._tbsMoveActions.shift());
            if (ch._damaged || ch._missed) {
                this._damageGtbs.setDamage(ch);
                ch.tbsSetPose('pain');
                ch.clearDamageFlags();
            }
        }
        centerY() { return this.height / 2; }
        updateShadow() {
            const ch = this._character;
            if (!this._shadow && ch.tbsFloating()) {
                this._shadow = new Sprite(ImageManager.loadSystem('Shadow'));
                this._shadow.anchor.set(0.5, 0.5);
                this._shadow.z = 2;
                if (this.parent) this.parent.addChild(this._shadow);
            }
            if (this._shadow && !ch.tbsFloating()) { if (this._shadow.parent) this._shadow.parent.removeChild(this._shadow); this._shadow.destroy(); this._shadow = null; }
            if (this._shadow) {
                const ratios = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45];
                const fc = ch.tbsFloatCount() || 0;
                this._shadow.x = this.x;
                this._shadow.y = this.y - 7 + fc;
                this._shadow.scale.x = this._shadow.scale.y = ratios[fc] ?? 0;
                if (!this._shadow.parent && this.parent) this.parent.addChild(this._shadow);
            }
        }
        disposeGtbs() {
            this._damageGtbs.dispose();
            if (this._shadow) { if (this._shadow.parent) this._shadow.parent.removeChild(this._shadow); this._shadow.destroy(); this._shadow = null; }
            this.destroy();
        }
    }
    window.Sprite_Battler_GTBS = Sprite_Battler_GTBS;

    // GTBS's popups: experience and gold (as healing), and the doom count, before anything else.
    const GD = RRVictorDamage.Game_Damage.prototype;
    const _dv = GD.damageValue, _dt = GD.damageType;
    GD.damageValue = function() {
        const r = this.result();
        if (r.expGainAmt) return r.expGainAmt;
        if (r.doom) return r.doom;
        return _dv.call(this);
    };
    GD.damageType = function() {
        const r = this.result();
        if (r.expGainAmt) return 'hp_recover';
        if (r.doom) return 'crt_text';
        return _dt.call(this);
    };
    // The game's VE edit: an army's damage shows the levels it lost or regained.
    GD.customValue = function() {
        const r = this.result(), b = this._battler;
        if (r.hpDamage > 0 && b.isArmy()) return R.sprintf('%d(%d %s)', this.hpDamage(), $gameVariables.value(1001), text('[252'));
        if (r.hpDamage < 0 && b.isArmy() && !(r.mpDamage > 0) && !(r.tpDamage > 0)) return R.sprintf('%d(%d %s)', this.hpDamage(), $gameVariables.value(1002), text('[255'));
        return null;
    };

    // A map tile an animation plays on.
    class Sprite_TbsSpot extends Sprite {
        constructor(spot) {
            super();
            this._spot = spot;
            this.anchor.set(0.5, 1);
            this.bitmap = new Bitmap(TW(), TH());
            this.z = 3;
            this.updateSpot();
        }
        checkCharacter(ch) { return ch === this._spot; }
        updateSpot() {
            this.x = $gameMap.adjustX(this._spot.x) * TW() + TW() / 2;
            this.y = $gameMap.adjustY(this._spot.y) * TH() + TH();
        }
    }

    //=========================================================================
    // Battle_Cursor: the cursor, the tiles its action reaches, its targets,
    // and the terrain box
    //=========================================================================
    class Battle_Cursor extends Sprite {
        constructor(spriteset) {
            super();
            this._spriteset = spriteset;
            this.bitmap = ImageManager.loadPicture('GTBS/cursor');
            this.anchor.set(0.5, 1);
            this.z = 8;
            this._targetSprites = [];
            this._targetArrows = [];
            this.createCursorPositionInfo();
        }
        center(x, y) { $gamePlayer.center(x, y); }
        screenX() { return $gameMap.adjustX(this._mapX) * TW() + TW() / 2; }
        screenY() { return $gameMap.adjustY(this._mapY) * TH() + TH(); }
        moveto(x, y) {
            this._mapX = ((x % $gameMap.width()) + $gameMap.width()) % $gameMap.width();
            this._mapY = ((y % $gameMap.height()) + $gameMap.height()) % $gameMap.height();
            if (!$gameSystem._tbsScrollCursor && $gameSystem._tbsScrollCursor !== undefined) this.center(x, y);
        }
        updateVis() {
            const c = R.cursor();
            const vis = !!(c && (c.active || c.forceVisible)) && !!R.scene();
            this.visible = vis;
            if (this._curLocation) this._curLocation.visible = vis;
        }
        update() {
            super.update();
            const c = R.cursor();
            if (!c) return;
            this.moveto(c.x, c.y);
            this.updateLocation();
            this.updateVis();
            if (c.consumeTargetRefresh()) { this.clearTargetSprites(); this.drawTargetSprites(); }
            if (c.reselectTargets) { c.reselectTargets = false; this.refreshTargets(); }
            else for (const s of this._targetArrows) s.updateArrow();
            this.x = this.screenX();
            this.y = this.screenY();
            for (const s of this._targetSprites) s.updateRange();
        }
        createCursorPositionInfo() {
            if (get('HIDE_CURSOR_POSITION_INFO', false)) return;
            this._curLocation = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this._spriteset.addOverMap(this._curLocation);
        }
        // The terrain box: the tile under the cursor (from the map's image), its name, and whether it blocks
        // and what defence and evasion it gives; with a second cursor image over the cursor.
        updateLocation() {
            if (!this._curLocation) return;
            const c = R.cursor();
            if (!c.active) return;
            const region = $gameMap.regionId(this._mapX, this._mapY);
            const shot = R.mapshot();
            const key = [this._mapX, this._mapY, $gameMap.displayX(), $gameMap.displayY(), region, shot && shot._rrMapshotReady].join(',');
            if (key === this._locKey) return;
            const back = ImageManager.loadSystem('TerrainWindowBack');
            const cur = this.bitmap;
            if (!back.isReady() || !cur || !cur.isReady()) return;
            this._locKey = key;
            const b = this._curLocation.bitmap;
            b.clear();
            b.blt(cur, 0, 0, 32, 32, this.screenX() - 16, this.screenY() - 32);
            b.blt(back, 0, 0, 126, 100, 0, 0);
            if (shot) b.blt(shot, this._mapX * TW(), this._mapY * TH(), TW(), TH(), 86, 34);
            b.fontSize = R.fontPx(22);
            b.drawText(text(R.terrain.name(region) || ''), 0, 0, 130, 40, 'center');
            let i = 1;
            b.fontSize = R.fontPx(20);
            if ([1, 2, 3, 4, 5, 6, 7, 9, 11].includes(region)) {
                b.drawText(text([3, 4, 5, 6, 7, 9, 11].includes(region) ? '[97' : '[98'), 6, i * 18, 80, 40, 'left');
                i++;
            }
            const def = R.terrainValue('def', region), eva = R.terrainValue('eva', region);
            if (def !== 0) { b.drawText(text(R.sprintf('[254: %d', def)), 6, i * 18, 80, 40, 'left'); i++; }
            if (eva !== 0) b.drawText(text(R.sprintf('[253: %d', eva * 100)), 6, i * 18, 80, 40, 'left');
        }
        disposeLocation() {
            if (this._curLocation) { if (this._curLocation.parent) this._curLocation.parent.removeChild(this._curLocation); this._curLocation.destroy(); this._curLocation = null; }
        }
        clearTargetSprites() {
            for (const s of this._targetSprites) { if (s.parent) s.parent.removeChild(s); s.destroy(); }
            this._targetSprites.length = 0;
        }
        drawTargetSprites() {
            const c = R.cursor();
            const type = c.targetArea[0];
            if (!type) return;
            for (const [x, y] of c.targetPositions) {
                const s = new Sprite_Range(type, x, y);
                this._targetSprites.push(s);
                if (this.parent) this.parent.addChild(s);
            }
        }
        // Each target gets a bobbing cursor (they follow the cursor itself, as GTBS's did).
        refreshTargets() {
            for (const s of this._targetArrows) { if (s.parent) s.parent.removeChild(s); s.destroy(); }
            this._targetArrows.length = 0;
            const c = R.cursor();
            for (const t of R.uniqObjects(c.targets)) {
                if (!t) continue;
                const s = new TBS_Target_Cursor(this);
                this._targetArrows.push(s);
                if (this.parent) this.parent.addChild(s);
            }
        }
    }
    window.Battle_Cursor = Battle_Cursor;

    const TARGET_ANIM = (() => { const a = []; for (const dy of [0, 1, 1, 0, 1, 0, 1, 0, 0, 0]) { a.push(dy); a.unshift(-dy); } return a; })();
    class TBS_Target_Cursor extends Sprite {
        constructor(cursor) {
            super(ImageManager.loadPicture('GTBS/cursor'));
            this._cursor = cursor;
            this.anchor.set(0.5, 1);
            this.z = 8;
            this._phase = rand(TARGET_ANIM.length - 1);
            this.updateArrow();
        }
        updateArrow() {
            this.visible = this._cursor.visible;
            this.x = this._cursor.screenX();
            this.y = this._cursor.screenY();
            this._phase = (this._phase + 1) % TARGET_ANIM.length;
            this.y += TARGET_ANIM[this._phase];
        }
    }

    //=========================================================================
    // Sprite_Range: a coloured tile (move blue, attack red, help skills green)
    //=========================================================================
    const rangeBitmaps = new Map();
    class Sprite_Range extends Sprite {
        constructor(type, x, y) {
            super();
            this._type = type;
            this._mapX = x; this._mapY = y;
            const sys = $gameSystem;
            const kind = { 1: 'attack', 2: 'move', 3: 'help', 4: 'attackSkill', 5: 'attackSkill', 6: 'help', 7: 'attack' }[type] || 'attack';
            const color = sys.tbsColor(kind);
            let bmp = rangeBitmaps.get(color.name);
            if (!bmp || bmp._destroyed) {
                bmp = new Bitmap(32, 32);
                bmp.fillRect(1, 1, 30, 30, css(color.color));
                rangeBitmaps.set(color.name, bmp);
            }
            this.bitmap = bmp;
            this.opacity = [5, 6, 7].includes(type) ? 255 : 100;
            this.z = 2;
            this.updateRange();
        }
        updateRange() {
            this.x = $gameMap.adjustX(this._mapX) * TW();
            this.y = $gameMap.adjustY(this._mapY) * TH();
        }
        update() { super.update(); this.updateRange(); }
        destroy() { this.bitmap = null; super.destroy(); }
    }
    window.Sprite_Range = Sprite_Range;

    //=========================================================================
    // Wait_Cursor: the facing arrows over a unit ending its turn
    //=========================================================================
    class Wait_Cursor extends Sprite {
        constructor(actor) {
            super();
            this._actor = actor;
            this._initialDir = actor.tbsDirection();
            this._direction = 0;
            this.anchor.set(0.5, 1);
            this.z = 9;
            this.updateBitmapDir();
            this.place();
        }
        initialDir() { return this._initialDir; }
        place() {
            this.x = this._actor.tbsScreenX();
            this.y = this._actor.tbsScreenY() - 40 + (this._actor.tbsUnitSize() > 1 ? 16 * (this._actor.tbsUnitSize() - 1) : 0);
        }
        updateWait() {
            let d = 0;
            if (Input.isTriggered('down')) d = 2;
            else if (Input.isTriggered('left')) d = 4;
            else if (Input.isTriggered('right')) d = 6;
            else if (Input.isTriggered('up')) d = 8;
            if (d) { this._actor.tbsSetDirection(d); this.updateBitmapDir(); }
            this.place();
        }
        updateBitmapDir() {
            if (this._direction !== this._actor.tbsDirection()) {
                this._direction = this._actor.tbsDirection();
                this.bitmap = ImageManager.loadPicture('GTBS/wait' + this._direction);
            }
        }
    }

    //=========================================================================
    // Projectiles: an arrow or an axe flies to the target; an arched one lifts
    // the view along its arc
    //=========================================================================
    class Projectile extends Sprite {
        constructor(source, target, data, type) {
            super(ImageManager.loadPicture('GTBS/Projectiles/' + data.name));
            this._type = type;
            this._disposed = false;
            const sc = R.scene();
            this._srcSpr = sc.getBattlerSprite(source);
            this._trgSpr = sc.getBattlerSprite(target);
            if (!this._srcSpr || !this._trgSpr) { this._disposed = true; return; }
            this._source = source; this._target = target;
            this.z = 9;
            this._ready = false;
        }
        isDisposed() { return this._disposed; }
        setup() {
            const bw = this.bitmap.width, bh = this.bitmap.height;
            this._sx = this._srcSpr.x - bw / 2;
            this._sy = this._srcSpr.y - bh;
            this.x = this._sx; this.y = this._sy;
            this._tx = this._trgSpr.x;
            this._ty = this._trgSpr.y - bh;
            const dist = Math.abs(this._sx - this._tx) + Math.abs(this._sy - this._ty) * 4;
            if (dist < 129) { this._slice = 9; this._div = 3; } else { this._slice = 24; this._div = 8; }
            this._start = 25;
            this._started = false;
            this._speedX = (this._sx - this._tx) / this._slice;
            this._speedY = (this._sy - this._ty) / this._slice;
            this._index = 0;
            this._high = 4 * dist;
            this._baseY = $gameMap.displayY();
            this._ready = true;
        }
        updateProjectile() {
            if (this._disposed) return;
            if (!this._ready) { if (this.bitmap && this.bitmap.isReady()) this.setup(); else return; }
            if (!this._started) {
                this._start--;
                if (this._start <= 0) this._started = true;
            } else {
                this.x = this._sx - (this._index + 1) * this._speedX;
                this.y = this._sy - (this._index + 1) * this._speedY;
                if (this._type === 'arched') {
                    if (get('PROJECTILE_CAM', true)) $gameMap.setDisplayPos($gameMap.displayX(), this._baseY - Math.sin(this._index / this._div) * this._high / 2 / TH());
                    this.y -= Math.sin(this._index / this._div) * this._high / 8;
                }
                this._index++;
            }
            if (this._index >= this._slice) {
                if (this._type === 'arched') $gameMap.setDisplayPos($gameMap.displayX(), this._baseY);
                this._disposed = true;
                if (this.parent) this.parent.removeChild(this);
                this.destroy();
            }
        }
    }

    //=========================================================================
    // Sprite_ActionImage: icons and pictures moved by the action lists
    // (all of an image's instructions run at once, each for its own time)
    //=========================================================================
    class Sprite_ActionImage extends Sprite {
        constructor() {
            super();
            this._queue = [];
            this._repeats = new Map();
            this._cur = null;
            this.actualX = 0; this.actualY = 0; this.offsetX = 0; this.offsetY = 0;
            this._readyDelete = false;
            this._angleDeg = 0;
        }
        get(k) { return this._cur ? this._cur[k] : null; }
        set(k, v) { if (this._cur) this._cur[k] = v; }
        canDelete() {
            if (!this.inAction() && this._readyDelete) {
                if (this.parent) this.parent.removeChild(this);
                this.destroy();
                return true;
            }
            return false;
        }
        addAction(inst) {
            if (inst.create && inst.time > 1) inst.time = 1;
            if (inst.delete) { this._readyDelete = true; return; }
            this._queue.push(inst);
            if (inst.repeat > 0) this._repeats.set(inst, inst.time);
        }
        inAction() { return this._queue.some(i => !(i.repeat > 0)); }
        updateImage() {
            const done = [];
            for (const inst of this._queue) if (this.execute(inst)) done.push(inst);
            this._queue = this._queue.filter(i => !done.includes(i));
        }
        execute(inst) {
            this._cur = inst;
            const [offX, offY] = this.offsetData();
            const [icoIdx, filename] = this.filenameData();
            const rot = this.get('rotate') ? this.get('rotate') / this.get('time') : null;
            const opa = this.get('opacity') != null && this.opacity !== this.get('opacity') ? (this.get('opacity') - this.opacity) / this.get('time') : null;
            if (icoIdx != null) {
                this.bitmap = ImageManager.loadSystem('IconSet');
                this.setFrame(icoIdx % 16 * 24, Math.floor(icoIdx / 16) * 24, 24, 24);
            } else if (filename != null) {
                this.bitmap = ImageManager.loadPicture(filename);
                this.scale.x = this.get('mirror') ? -1 : 1;
                const b = this.bitmap;
                if (b.isReady()) {
                    const cs = b.width / this.get('colCount'), rs = b.height / this.get('rowCount');
                    this.setFrame(this.get('col') % this.get('colCount') * cs, Math.floor(this.get('row') / this.get('rowCount')) * rs, cs, rs);
                }
            }
            this.applyOrigin();
            const ang = this.angleData();
            const step = this.positionStep();
            if (step) { this.actualX += step[0]; this.actualY += step[1]; }
            if (offX != null) { this.offsetX += offX; this.offsetY += offY; }
            this.x = this.actualX + this.offsetX;
            this.y = this.actualY + this.offsetY;
            if (ang != null) this._angleDeg += ang;
            if (rot != null) this._angleDeg += rot;
            this.rotation = -this._angleDeg * Math.PI / 180;
            if (opa != null) this.opacity += opa;
            if (this.get('zoomX') != null && this.scale.x !== this.get('zoomX')) this.scale.x += (this.get('zoomX') - this.scale.x) / this.get('time');
            if (this.get('zoomY') != null && this.scale.y !== this.get('zoomY')) this.scale.y += (this.get('zoomY') - this.scale.y) / this.get('time');
            this.set('time', this.get('time') - 1);
            if (this.get('time') === 0) {
                if (this.get('repeat') > 0) { this.set('repeat', this.get('repeat') - 1); this.set('time', this._repeats.get(inst)); this._cur = null; return false; }
                this._cur = null;
                return true;
            }
            this._cur = null;
            return false;
        }
        frameW() { return this._frame ? this._frame.width : 24; }
        frameH() { return this._frame ? this._frame.height : 24; }
        weaponIndex(sym) { const m = /^weapon(\d)$/.exec(String(sym)); return m ? Number(m[1]) - 1 : null; }
        applyOrigin() {
            const c = this.get('center');
            if (c == null) return;
            let ox = 0, oy = 0, center = c;
            const container = this.get('container');
            if (typeof c === 'string') {
                if (['LL', 'LR'].includes(c)) oy = this.frameH();
                if (['UR', 'LR'].includes(c)) ox = this.frameW();
                const ind = this.weaponIndex(c);
                if (ind != null && container) {
                    if (container.isActor()) { const weps = container.weapons(); if (weps.length > ind) center = R.GT.anchorDirForWep(weps[ind].id); }
                    this.set('center', center);
                }
            } else if (typeof c === 'object') { ox = c.x; oy = c.y; }
            if (typeof center === 'number') {
                if ([1, 2, 3].includes(center)) oy = this.frameH(); else if ([4, 5, 6].includes(center)) oy = this.frameH() / 2;
                if ([8, 5, 2].includes(center)) ox = this.frameW() / 2; else if ([9, 6, 3].includes(center)) ox = this.frameW();
            }
            this.anchor.x = ox / this.frameW();
            this.anchor.y = oy / this.frameH();
        }
        offsetData() {
            const list = this.get('offsetList') || [];
            if (!list.length) return [null, null];
            let ox = 0, oy = 0;
            for (const [d, n] of list) { if (d === 'left') ox -= n; else if (d === 'right') ox += n; else if (d === 'up') oy -= n; else if (d === 'down') oy += n; }
            return [(ox - this.offsetX) / this.get('time'), (oy - this.offsetY) / this.get('time')];
        }
        angleData() {
            const a = this.get('angle');
            if (a == null) return null;
            if (!(this._angleDeg !== a || this.get('angleAdjusted') == null || this.get('mirrorA'))) return null;
            const sprite = R.scene().getBattlerSprite(this.get('container'));
            const dir = sprite ? sprite.getDirection() : 2;
            if (this.get('mirrorA') && dir === 6) {
                if (!this._mirrored) { this._mirrored = true; this.scale.x = -Math.abs(this.scale.x); }
                return (-a - this._angleDeg) / this.get('time');
            }
            if (this.get('angleAdjusted') == null) {
                const add = { 2: 90, 6: 180, 8: 270 }[dir] || 0;
                this.set('angle', a + add);
                this.set('angleAdjusted', true);
            }
            return (this.get('angle') - this._angleDeg) / this.get('time');
        }
        filenameData() {
            const f = this.get('filename');
            if (f == null) return [null, null];
            const index = this.weaponIndex(f), container = this.get('container');
            if (index != null && container) {
                if (container.isActor()) {
                    const weps = container.weapons();
                    if (weps.length > index) { let ico = weps[index].iconIndex; if (ico === 538) ico = 0; return [ico, null]; }
                } else {
                    const ew = (R.G.Enemy_Weapon || {})[container._enemyId];
                    // GTBS indexed $data_weapons with the whole entry; a single weapon id reads as that weapon.
                    const w = ew != null && !Array.isArray(ew) ? $dataWeapons[ew] : null;
                    if (w && index === 0) return [w.iconIndex, null];
                }
                return [null, null];
            }
            if (typeof f === 'number' && this.get('isIcon')) return [f, null];
            return [null, String(f)];
        }
        positionStep() {
            let xd = 0, yd = 0;
            const pos = this.get('pos');
            if (pos) { xd = pos.x - this.actualX; yd = pos.y - this.actualY; }
            else if (this.get('container')) {
                const sprite = R.scene().getBattlerSprite(this.get('container'));
                if (!sprite) return null;
                let tx = sprite.x, ty = sprite.y - this.frameH() / 2;
                const d = sprite.getDirection();
                if (d === 6) tx -= this.frameW() / 2; else if (d === 4) tx += this.frameW() / 2; else if (d === 2) ty -= this.frameH() / 2;
                const ss = R.scene()._spriteset;
                // The image is drawn over the windows, in screen coordinates.
                tx += ss._tilemap ? ss._tilemap.x || 0 : 0;
                xd = tx - this.actualX; yd = ty - this.actualY;
            }
            if (xd !== 0 || yd !== 0) return [xd / this.get('time'), yd / this.get('time')];
            return null;
        }
    }
    window.Sprite_ActionImage = Sprite_ActionImage;

    //=========================================================================
    // "Thinking..." while the AI decides
    //=========================================================================
    class Sprite_Thinking extends Sprite {
        constructor() {
            super(new Bitmap(250, 24));
            this._thinkTime = get('ENEMY_THINK_TIME', 1) * 60;
            this.resetText();
        }
        resetText() { this._thinkText = text(get('THINKING_TEXT', 'Thinking')); }
        updateThinking() {
            if (this._thinkTime % 6 === 0) {
                this.bitmap.clear();
                this._thinkText += '.';
                if (this.bitmap.measureTextWidth(this._thinkText) > this.bitmap.width) this.resetText();
                this.bitmap.drawText(this._thinkText, 0, 0, this.bitmap.width, this.bitmap.height, 'left');
            }
            if (this._thinkTime > 0) { this._thinkTime--; return true; }
            return false;
        }
    }
    window.Sprite_Thinking = Sprite_Thinking;

    //=========================================================================
    // Info sprites: the battle's goal, the turn ribbons, the end, the drops
    //=========================================================================
    const shadowText = (bmp, x, y, w, h, str, align) => {
        bmp.textColor = 'rgb(30,30,30)';
        bmp.drawText(str, x + 2, y + 2, w, h, align);
        bmp.textColor = '#ffffff';
        bmp.drawText(str, x, y, w, h, align);
    };
    const ALIGN = ['left', 'center', 'right'];
    class TBS_Sprite_Info extends Sprite {
        constructor() {
            super();
            this._wait = 0;
            this._disposed = false;
            this.createInfoBitmap();
        }
        createInfoBitmap() {}
        isDisposed() { return this._disposed; }
        updateInfo() {
            if (this._disposed) return;
            if (this.starting()) return;
            if (this.exiting()) return;
            if (!this._disposed) this.mainUpdate();
        }
        starting() { return false; }
        mainUpdate() { this._wait++; }
        exiting() { return false; }
        disposeInfo() {
            if (this._disposed) return;
            this._disposed = true;
            if (this.parent) this.parent.removeChild(this);
            this.destroy();
        }
        centerScreen(w, h) {
            this.x = (Graphics.width - w) / 2;
            this.y = (Graphics.height - h) / 2;
        }
    }
    // A picture copied (GTBS drew on the cached bitmap it loaded), set on the sprite once it has loaded.
    const loadCopyInto = (sprite, folder, name, then) => {
        const src = folder === 'system' ? ImageManager.loadSystem(name) : ImageManager.loadPicture(name);
        src.addLoadListener(() => {
            const copy = new Bitmap(src.width, src.height);
            copy.blt(src, 0, 0, src.width, src.height, 0, 0);
            if (then) then(copy);
            sprite.bitmap = copy;
        });
    };
    // The goal ($game_variables[5]'s text) under the "Battle start" picture.
    class TBS_Battle_Start_Sprite extends TBS_Sprite_Info {
        constructor(vicCondition, failCondition, vicVal, failVal, duringBattle) {
            super();
            this._pause = duringBattle;
            if (!duringBattle) this.createBattleStart();
        }
        createInfoBitmap() {
            const victoryText = text(String($gameVariables.value(5) ?? ''));
            const bmp = new Bitmap(Graphics.width, 48);
            bmp.fontFace = 'Tahoma, ' + $gameSystem.mainFontFace();
            bmp.fontSize = R.fontPx(35);
            shadowText(bmp, 0, 11, bmp.width, 36, victoryText, 'center');
            this.bitmap = bmp;
            this.x = 0;
            this.y = Graphics.height / 2;
            this.opacity = 0;
        }
        createBattleStart() {
            const s = this._battleStart = new Sprite();
            loadCopyInto(s, 'picture', 'GTBS/Battlestart' + R.langSuffix());
            s.opacity = 0;
            this.addChild(s);
            s.y = -Graphics.height / 2;
        }
        updateInfo() {
            super.updateInfo();
            if (this._battleStart && this._battleStart.bitmap) {
                const b = this._battleStart.bitmap;
                this._battleStart.x = (Graphics.width - b.width) / 2 - this.x;
                this._battleStart.y = (Graphics.height - b.height) / 2 - this.y;
                // A child is drawn at its parent's opacity times its own; RGSS drew them apart.
                this._battleStart.alpha = this.alpha > 0 ? Math.min(1, this._bsOpacity / 255 / this.alpha) : 0;
            }
        }
        starting() {
            if (this._started) return false;
            this._bsOpacity = Math.min(255, (this._bsOpacity || 0) + 15);
            this.opacity = Math.min(255, this.opacity + 10);
            if (this.opacity < 255) return true;
            this._started = true;
            return false;
        }
        mainUpdate() {
            if (!this._pause) this._wait++;
            if (Input.isTriggered('ok') || Input.isTriggered('cancel')) this._pause = false;
        }
        exiting() {
            if (this._wait < 30) return false;
            if (this.opacity > 0) {
                this._bsOpacity = Math.max(0, (this._bsOpacity || 0) - 15);
                this.opacity = Math.max(0, this.opacity - 20);
            } else this.disposeInfo();
            return true;
        }
    }
    window.TBS_Battle_Start_Sprite = TBS_Battle_Start_Sprite;
    // The turn ribbon: "Turn N" over the team's ribbon.
    function TBS_Phase(turn) {
        const s = new TBS_Sprite_Info();
        s._turn = turn;
        AudioManager.playSe({ name: 'Battle1', volume: 50, pitch: 100, pan: 0 });
        const red = turn !== 'player';
        const num = $gameTroop.turnCount() + 1;
        loadCopyInto(s, 'picture', 'GTBS/' + (red ? 'Red_Ribbon' : 'Blue_Ribbon') + R.langSuffix(), (b) => {
            // Javanese Text, size 60: RGSS sized fonts by their line, and this one's line is over twice its
            // letters, so they stand about a third of that tall. RGSS outlined text in half-black.
            b.fontFace = '"Javanese Text", "Times New Roman", "Liberation Serif", serif';
            b.fontSize = 30;
            b.outlineWidth = 2;
            b.outlineColor = 'rgba(0,0,0,0.5)';
            const str = R.sprintf('%s %d', text('[51'), num);
            b.textColor = '#ffffff';
            b.drawText(str, 0, 15, 377, 80, 'center');
            b.textColor = red ? 'rgb(180,50,50)' : 'rgb(60,60,180)';
            b.drawText(str, 0, 15, 377, 80, 'center');
            s.x = (Graphics.width - b.width) / 2;
            s.y = (Graphics.height - b.height) / 2;
        });
        s.opacity = 0;
        s.starting = function() { if (this._wait === 0 && this.opacity < 255) { this.opacity = Math.min(255, this.opacity + 10); return true; } return false; };
        s.exiting = function() {
            if (this._wait < 30) return false;
            this.opacity = Math.max(0, this.opacity - 10);
            if (this.opacity === 0) this.disposeInfo();
            return true;
        };
        return s;
    }
    window.TBS_Phase_Sprite = function(turn) { return TBS_Phase(turn); };
    // Victory, Defeat or Escape.
    function Congrat(result) {
        const s = new TBS_Sprite_Info();
        let img = 'Victory';
        if (result === 0) { BattleManager.playVictoryMe(); img = 'Victory'; }
        else if (result === 2) img = 'Defeat';
        else if (result === 1) img = 'Escape';
        loadCopyInto(s, 'picture', 'GTBS/' + img + R.langSuffix(), (b) => { s.x = (Graphics.width - b.width) / 2; s.y = (Graphics.height - b.height) / 2; });
        s.opacity = 0;
        const bat = new Sprite(new Bitmap(544, 180));
        bat.bitmap.fontSize = R.fontPx(55);
        shadowText(bat.bitmap, 0, 0, 544, 180, String(get('BATTLE_COMPLETE', '')), 'center');
        bat.opacity = 0;
        s._bat = bat;
        s.starting = function() { if (this._wait === 0 && this.opacity < 255) { this.opacity = Math.min(255, this.opacity + 10); bat.opacity = Math.min(255, bat.opacity + 10); return true; } return false; };
        s.exiting = function() {
            if (this._wait < 25) return false;
            this.opacity = Math.max(0, this.opacity - 10);
            if (this._wait > 45) bat.opacity = Math.max(0, bat.opacity - 10);
            if (bat.opacity === 0) { this.disposeInfo(); return true; }
            return false;
        };
        const _dispose = s.disposeInfo;
        s.disposeInfo = function() { if (bat.parent) bat.parent.removeChild(bat); _dispose.call(this); };
        const _upd = s.updateInfo;
        s.updateInfo = function() {
            if (!bat.parent && this.parent) { this.parent.addChild(bat); bat.x = (Graphics.width - 544) / 2; bat.y = (Graphics.height - 180) / 2 + 60; }
            _upd.call(this);
        };
        return s;
    }
    window.Congrat_Sprite = function(result) { return Congrat(result); };
    // The items an enemy dropped, one every 40 frames under "Items obtained".
    function Treasure(treasures) {
        const s = new TBS_Sprite_Info();
        s.bitmap = new Bitmap(Graphics.width, Graphics.height);
        s._treasures = treasures.slice(0, 6);
        s._step = 0;
        const title = new Sprite(new Bitmap(Graphics.width, 180));
        title.bitmap.fontSize = R.fontPx(70);
        shadowText(title.bitmap, 0, 0, Graphics.width, 180, text(get('ITEM_GAIN_TEXT', '')), 'center');
        title.opacity = 0;
        s.addChild(title);
        s.starting = function() { if (title.opacity < 255) { title.opacity = Math.min(255, title.opacity + 10); return true; } return false; };
        s.mainUpdate = function() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel')) this._forceQuit = true;
            if (this._wait < 40) this._wait++;
            else { this.drawTreasure(this._step); this._step++; this._wait = 0; }
            if (this._forceQuit) this._wait = 40;
        };
        s.exiting = function() {
            if (this._step < this._treasures.length) return false;
            if (this._wait < 20) return false;
            if (this.opacity === 0) this.disposeInfo();
            else { this.opacity = Math.max(0, this.opacity - 15); title.opacity = Math.max(0, title.opacity - 15); }
            return true;
        };
        s.drawTreasure = function(index) {
            const item = this._treasures[index];
            if (!item) return;
            const b = this.bitmap, x = 300, y = index * 32 + 200;
            const frame = ImageManager.loadSystem('ItemFrame'), icons = ImageManager.loadSystem('IconSet');
            if (frame.isReady()) b.blt(frame, 0, 0, frame.width, frame.height, x - 4, y - 2);
            if (icons.isReady()) b.blt(icons, item.iconIndex % 16 * 24, Math.floor(item.iconIndex / 16) * 24, 24, 24, x, y);
            b.textColor = '#ffffff';
            b.drawText(text(item.name), x + 28, y, 212, 32, 'left');
        };
        s.x = 0; s.y = 0;
        return s;
    }
    window.TBS_Treasure_Sprite = function(treasures) { return Treasure(treasures); };
    // `new` on these factory functions returns the sprite they build.
    window.TBS_Info = TBS_Sprite_Info;
})();
