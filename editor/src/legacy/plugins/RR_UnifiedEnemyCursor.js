/*:
 * @target MZ
 * @plugindesc Unified Enemy Cursor + AoE + Cone (VX Ace), for imported games
 * @author unknown (Dreamwalker's script); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_UnifiedEnemyCursor.js
 *
 * While an enemy is being chosen, a cursor image (img/system) sits at the
 * feet of every enemy the action would hit, with the enemy's name and
 * "HP: hp / max" above it: the chosen enemy, every living enemy for an
 * All Enemies scope, or the enemies inside the area of an area-of-effect
 * skill. Cursors and names slide to their places and are removed as soon as
 * the choice ends.
 *
 * Cone skills, set in the note (use them with the One Enemy scope):
 *   <aoe cone: x>    the cone's angle in degrees (1-360)
 *   <aoe range: x>   how far it reaches, in pixels
 * hit the enemies inside the cone from the user towards the chosen enemy; a
 * white cone fading with distance is drawn from the user while choosing.
 *
 * Needs RR_YanflyAreaOfEffect.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param filename
 * @text Cursor image (img/system)
 * @default cursor
 *
 * @param offsetX
 * @type number
 * @min -9999
 * @default 0
 *
 * @param offsetY
 * @type number
 * @min -9999
 * @default 0
 *
 * @param textOffset
 * @type number
 * @min -9999
 * @default -50
 *
 * @param bob
 * @text Bob period (frames, 0 for none)
 * @type number
 * @default 0
 *
 * @param slideSpeed
 * @type number
 * @decimals 2
 * @default 0.5
 *
 * @param nameWidth
 * @type number
 * @default 200
 *
 * @param nameHeight
 * @type number
 * @default 64
 *
 * @param coneUserOffsetX
 * @type number
 * @min -9999
 * @default 0
 *
 * @param coneUserOffsetY
 * @type number
 * @min -9999
 * @default 0
 *
 * @param rgssFontSize
 * @text The game's Font.default_size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const AOE = window.RRYanflyAoe;
    if (!AOE) return;
    const params = PluginManager.parameters('RR_UnifiedEnemyCursor');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const FILENAME = String(params.filename ?? 'cursor');
    const OFFSET_X = num(params.offsetX, 0), OFFSET_Y = num(params.offsetY, 0), TEXT_OFFSET = num(params.textOffset, -50);
    const BOB = num(params.bob, 0), SLIDE_SPEED = num(params.slideSpeed, 0.5);
    const NAME_WIDTH = num(params.nameWidth, 200), NAME_HEIGHT = num(params.nameHeight, 64);
    const CONE_X = num(params.coneUserOffsetX, 0), CONE_Y = num(params.coneUserOffsetY, 0);
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    const px = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;

    const coneNotes = (item) => {
        if (!item) return { cone: 0, range: 0 };
        if (item._rrCone) return item._rrCone;
        const n = { cone: 0, range: 0 };
        for (const line of String(item.note || '').split(/[\r\n]+/)) {
            let m;
            if ((m = /<(?:AOE_CONE|aoe cone):[ ](\d+)>/i.exec(line))) n.cone = Math.min(Math.max(Number(m[1]), 1), 360);
            else if ((m = /<(?:AOE_RANGE|aoe range):[ ](\d+)>/i.exec(line))) n.range = Math.max(Number(m[1]), 1);
        }
        return (item._rrCone = n);
    };
    const hasCone = (item) => { const n = coneNotes(item); return n.cone > 0 && n.range > 0; };
    window.RRUnifiedEnemyCursor = { coneNotes };

    //-------------------------------------------------------------------------
    // Cone targets
    //-------------------------------------------------------------------------
    // The cone starts halfway up the user's image.
    const coneOrigin = (user) => {
        const sprite = AOE.spriteOf(user);
        const y = sprite ? AOE.screenY(user) - Math.floor(AOE.spriteSize(sprite).height / 2) : AOE.screenY(user);
        return [AOE.screenX(user) + CONE_X, y + CONE_Y];
    };
    const GA = Game_Action.prototype;
    GA.rrInsideAoeCone = function(user, main, target) {
        if (!user || !main || !target) return false;
        const n = coneNotes(this.item());
        const [ux, uy] = coneOrigin(user);
        const dirX = AOE.screenX(main) + main.rrHitboxXOffset() - ux, dirY = AOE.screenY(main) + main.rrHitboxYOffset() - uy;
        const tarX = AOE.screenX(target) + target.rrHitboxXOffset() - ux, tarY = AOE.screenY(target) + target.rrHitboxYOffset() - uy;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY), tarLen = Math.sqrt(tarX * tarX + tarY * tarY);
        if (dirLen <= 0 || tarLen <= 0) return false;
        if (tarLen > n.range) return false;
        const cos = Math.min(Math.max((dirX * tarX + dirY * tarY) / (dirLen * tarLen), -1), 1);
        return Math.acos(cos) <= (n.cone / 2) * Math.PI / 180;
    };
    const smoothTarget = (unit, index) => (window.RRTargetManager ? window.RRTargetManager.smoothTarget(unit, index) : unit.smoothTarget(index));
    GA.rrAoeConeTargets = function() {
        if (!this.item() || !hasCone(this.item())) return [];
        const group = this.isForFriend() ? this.friendsUnit() : this.opponentsUnit();
        const main = smoothTarget(group, this._targetIndex), user = this.subject();
        if (!main || !user) return [];
        return group.aliveMembers().filter(target => this.rrInsideAoeCone(user, main, target));
    };
    const _aoeTargets = GA.rrAoeTargets;
    GA.rrAoeTargets = function(targets) {
        for (const b of this.rrAoeConeTargets()) if (!targets.includes(b)) targets.push(b);
        return _aoeTargets.call(this, targets);
    };
    const _highlightAoe = Window_BattleEnemy.prototype.rrHighlightAoe;
    Window_BattleEnemy.prototype.rrHighlightAoe = function(enemy) {
        const actor = BattleManager.actor(), action = actor && actor.inputtingAction();
        const item = action && action.item(), target = this.enemy();
        if (item && target && hasCone(item) && action.rrInsideAoeCone(action.subject(), target, enemy)) return true;
        return _highlightAoe.call(this, enemy);
    };

    //-------------------------------------------------------------------------
    // The cone on the field
    //-------------------------------------------------------------------------
    /** The cone image: white, fading along its length and towards its edges, with a brighter centre line. */
    const coneBitmap = (range, angle) => {
        range = Math.max(Math.floor(range), 16);
        const half = Math.floor(Math.min(Math.max(Math.abs(Math.tan((angle / 2) * Math.PI / 180) * range), 8), Graphics.height));
        const width = range + 4, height = half * 2 + 4, cy = Math.floor(height / 2);
        const bitmap = new Bitmap(width, height);
        const image = bitmap.context.createImageData(width, height), data = image.data;
        const set = (x, y, alpha) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            const i = (y * width + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = 255;
            data[i + 3] = alpha;
        };
        for (let x = 0; x < range; x++) {
            const ratio = x / range, span = Math.floor(half * ratio);
            const y1 = cy - span, y2 = cy + span, h = Math.max(y2 - y1 + 1, 1);
            const mid = (y1 + y2) / 2, halfH = Math.max(h / 2, 1);
            const base = Math.floor(180 * Math.pow(1 - ratio, 1.8));
            for (let y = y1; y <= y2; y++) set(x, y, Math.min(Math.max(Math.floor(base * (1 - Math.abs(y - mid) / halfH)), 0), 255));
        }
        for (let x = 0; x < range; x++) set(x, cy, Math.floor(220 * Math.pow(1 - x / range, 1.4)));
        bitmap.context.putImageData(image, 0, 0);
        if (bitmap._baseTexture && bitmap._baseTexture.update) bitmap._baseTexture.update();
        return bitmap;
    };
    const battleScene = () => (SceneManager._scene instanceof Scene_Battle ? SceneManager._scene : null);
    const currentEnemy = () => {
        const w = battleScene() && battleScene()._enemyWindow;
        if (!w || w.index() < 0) return null;
        return w.enemy() || null;
    };

    class Sprite_RRAoeCone extends Sprite {
        initialize() {
            super.initialize();
            this._rrAction = null;
            this._rrKey = null;
            this._glowDir = -1;
            this._glow = 160;
            this.opacity = 160;
            this.z = 5;
            this.visible = false;
        }
        update() {
            super.update();
            if (!battleScene()) return;
            const actor = BattleManager.actor();
            this._rrAction = actor ? actor.inputtingAction() : null;
            const item = this._rrAction ? this._rrAction.item() : null;
            // Shown while the enemy window holds an enemy, whether or not it is choosing.
            this.visible = !!item && hasCone(item) && !!currentEnemy();
            if (!this.visible) return;
            const n = coneNotes(item), key = n.cone + ':' + n.range;
            if (this._rrKey !== key) {
                if (this.bitmap) this.bitmap.destroy();
                this.bitmap = coneBitmap(n.range, n.cone);
                this.anchor.set(0, Math.floor(this.bitmap.height / 2) / this.bitmap.height);
                this._rrKey = key;
            }
            const user = this._rrAction.subject(), target = currentEnemy();
            const [ux, uy] = user ? coneOrigin(user) : [0, 0];
            this.x = ux;
            this.y = uy;
            const tx = AOE.screenX(target) + target.rrHitboxXOffset(), ty = AOE.screenY(target) + target.rrHitboxYOffset();
            this.rotation = Math.atan2(ty - uy, tx - ux);
            this._glow = Math.min(Math.max(this._glow + this._glowDir * 4, 0), 255);
            this.opacity = this._glow;
            if (this._glow <= 100 || this._glow >= 180) this._glowDir *= -1;
        }
    }
    window.Sprite_RRAoeCone = Sprite_RRAoeCone;
    const _createLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        this._rrAoeCone = new Sprite_RRAoeCone();
        const at = this._battleField.children.indexOf(this._rrAoeCircle);
        this._battleField.addChildAt(this._rrAoeCone, at >= 0 ? at + 1 : 0);
    };

    //-------------------------------------------------------------------------
    // Cursors and names over the chosen enemies
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    SB.rrCursorCount = function() { return Math.max($gameTroop.members().length, 8); };
    SB.rrResetEnemyCursorState = function() {
        const count = this.rrCursorCount();
        this._rrCursorXs = new Array(count).fill(null);
        this._rrCursorYs = new Array(count).fill(null);
        this._rrCursorBob = new Array(count).fill(0);
        this._rrNameXs = new Array(count).fill(null);
        this._rrNameYs = new Array(count).fill(null);
        this._rrNameKeys = new Array(count).fill(null);
    };
    SB.rrClearEnemyCursorObjects = function() {
        for (const sprite of this._rrEnemyCursors || []) this.removeChild(sprite);
        for (const sprite of this._rrEnemyNames || []) {
            this.removeChild(sprite);
            if (sprite.bitmap) sprite.bitmap.destroy();
        }
        this._rrEnemyCursors = null;
        this._rrEnemyNames = null;
    };
    const _start = SB.start;
    SB.start = function() {
        _start.call(this);
        this.rrClearEnemyCursorObjects();
        this.rrResetEnemyCursorState();
    };
    const _update = SB.update;
    SB.update = function() {
        _update.call(this);
        this.rrUpdateEnemyCursorSystem();
    };
    const _terminate = SB.terminate;
    SB.terminate = function() {
        this.rrClearEnemyCursorObjects();
        _terminate.call(this);
    };

    // The enemy being chosen: the enemy window is shown, active and on an enemy.
    SB.rrCurrentEnemy = function() {
        const w = this._enemyWindow;
        if (!w || !w.visible || !w.active || w.index() < 0) return null;
        return (w._enemies || []).filter(Boolean)[w.index()] || null;
    };
    SB.rrSelectedEnemies = function() {
        const enemy = this.rrCurrentEnemy();
        if (!enemy) return [];
        const actor = BattleManager.actor(), action = actor && actor.inputtingAction(), item = action && action.item();
        if (!action || !item) return [enemy];
        if (item.scope === 2) return $gameTroop.aliveMembers();
        const area = AOE.itemNotes(item);
        if (!(area.radius > 0 || area.rectType > 0 || hasCone(item))) return [enemy];
        return $gameTroop.aliveMembers().filter(member => member.isAlive() && this._enemyWindow.rrHighlightAoe(member));
    };
    SB.rrUpdateEnemyCursorSystem = function() {
        if (!this._rrCursorXs) this.rrResetEnemyCursorState();
        if (this.rrCurrentEnemy()) {
            if (!this._rrEnemyCursors || !this._rrEnemyNames) this.rrCreateEnemyCursorObjects();
            this.rrUpdateEnemyCursors();
            this.rrUpdateEnemyNames();
        } else if (this._rrEnemyCursors || this._rrEnemyNames) {
            this.rrClearEnemyCursorObjects();
            this.rrResetEnemyCursorState();
        }
    };
    // Over the windows, as the original's viewport-less sprites were.
    SB.rrCreateEnemyCursorObjects = function() {
        const count = this.rrCursorCount();
        this._rrEnemyCursors = Array.from({ length: count }, () => {
            const sprite = new Sprite(ImageManager.loadSystem(FILENAME));
            sprite.anchor.set(0.5, 1);
            sprite.visible = false;
            this.addChild(sprite);
            return sprite;
        });
        this._rrEnemyNames = Array.from({ length: count }, () => {
            const sprite = new Sprite(new Bitmap(NAME_WIDTH, NAME_HEIGHT));
            sprite.anchor.set(0.5, 1);
            sprite.visible = false;
            this.addChild(sprite);
            return sprite;
        });
    };
    const slide = (current, target) => (current == null ? target : current + (target - current) * SLIDE_SPEED);
    SB.rrBobOffset = function(index) {
        if (Math.trunc(BOB) <= 0) return 0;
        this._rrCursorBob[index] = (this._rrCursorBob[index] + 1) % BOB;
        const half = BOB / 2, step = this._rrCursorBob[index];
        return (step <= half ? step : BOB - step) / 2;
    };
    // Enemy positions are the battle field's; the sprites here are on the scene.
    SB.rrFieldOffset = function() {
        const field = this._spriteset && this._spriteset._battleField;
        return field ? [field.x, field.y] : [0, 0];
    };
    SB.rrUpdateEnemyCursors = function() {
        const selected = this.rrSelectedEnemies(), troop = $gameTroop.members(), [fx, fy] = this.rrFieldOffset();
        this._rrEnemyCursors.forEach((sprite, i) => {
            const enemy = troop[i];
            if (enemy && enemy.isAlive() && selected.includes(enemy)) {
                this._rrCursorXs[i] = slide(this._rrCursorXs[i], enemy.screenX() + OFFSET_X);
                this._rrCursorYs[i] = slide(this._rrCursorYs[i], enemy.screenY() + OFFSET_Y);
                const bob = this.rrBobOffset(i);
                sprite.x = Math.trunc(this._rrCursorXs[i]) + fx;
                sprite.y = Math.trunc(this._rrCursorYs[i] - bob) + fy;
                sprite.visible = true;
            } else {
                sprite.visible = false;
            }
        });
    };
    SB.rrUpdateEnemyNames = function() {
        const selected = this.rrSelectedEnemies(), troop = $gameTroop.members(), [fx, fy] = this.rrFieldOffset();
        this._rrEnemyNames.forEach((sprite, i) => {
            const enemy = troop[i];
            if (enemy && enemy.isAlive() && selected.includes(enemy)) {
                this.rrRefreshEnemyName(sprite.bitmap, i, enemy);
                this._rrNameXs[i] = slide(this._rrNameXs[i], enemy.screenX() + OFFSET_X);
                this._rrNameYs[i] = slide(this._rrNameYs[i], enemy.screenY() + OFFSET_Y + TEXT_OFFSET);
                sprite.x = Math.trunc(this._rrNameXs[i]) + fx;
                sprite.y = Math.trunc(this._rrNameYs[i]) + fy;
                sprite.visible = true;
            } else {
                sprite.visible = false;
                this._rrNameKeys[i] = null;
            }
        });
    };
    SB.rrRefreshEnemyName = function(bitmap, index, enemy) {
        const key = [enemy.name(), enemy.hp, enemy.mhp].join('\u0000');
        if (this._rrNameKeys[index] === key) return;
        this._rrNameKeys[index] = key;
        bitmap.clear();
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = px(20);
        this.rrDrawOutlinedCenterText(bitmap, 0, 0, bitmap.width, 32, enemy.name());
        bitmap.fontSize = px(16);
        this.rrDrawOutlinedCenterText(bitmap, 0, 32, bitmap.width, 32, `HP: ${enemy.hp} / ${enemy.mhp}`);
    };
    // Black copies a pixel off on each diagonal, the white text over them.
    SB.rrDrawOutlinedCenterText = function(bitmap, x, y, w, h, text) {
        bitmap.textColor = '#000000';
        for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) bitmap.drawText(text, x + dx, y + dy, w, h, 'center');
        bitmap.textColor = '#ffffff';
        bitmap.drawText(text, x, y, w, h, 'center');
    };
})();
