/*:
 * @target MZ
 * @plugindesc Area of Effect (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyAreaOfEffect.js
 *
 * Skills and items that also hit the battlers around their target, set in
 * their notes:
 *   <aoe radius: x>       an ellipse x pixels wide around the target (at
 *                         least 3), <aoe height: x%> tall (33% unless set)
 *   <aoe column: x>       a column x pixels wide through the target
 *   <aoe row: x>          a row x pixels tall through the target
 *   <aoe map>             the whole screen
 *   <aoe image: name>, <aoe blend: n>, <rect image: name>, <rect blend: n>
 * While the target is chosen the area is drawn on the field from the
 * picture (additive unless set), fading in and out. A battler is inside
 * when its hitbox reaches the area. The area is centred on the chosen enemy
 * even when the item aims at allies, as the script did.
 *
 * Enemy notes: <hitbox width: x>, <hitbox height: x> (the battler's image
 * size unless set), <offset x: +x>, <offset y: -x> (where the area centres
 * on the enemy).
 *
 * The script's white flash on the enemies inside the area never ran (its
 * update returned early), so none is drawn.
 *
 * Needs RR_YanflyTargetManager.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param circleImage
 * @default circle
 *
 * @param circleBlend
 * @type number
 * @default 1
 * @desc 0 normal, 1 additive, 2 subtractive.
 *
 * @param defaultHeight
 * @type number
 * @decimals 2
 * @default 0.33
 *
 * @param enemyOffsetX
 * @type number
 * @min -9999
 * @default 0
 *
 * @param enemyOffsetY
 * @type number
 * @min -9999
 * @default -8
 *
 * @param squareImage
 * @default square
 *
 * @param squareBlend
 * @type number
 * @default 1
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyAreaOfEffect');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const CIRCLE = String(params.circleImage ?? 'circle'), CIRCLE_BLEND = num(params.circleBlend, 1);
    const HEIGHT = num(params.defaultHeight, 0.33);
    const OFFSET_X = num(params.enemyOffsetX, 0), OFFSET_Y = num(params.enemyOffsetY, -8);
    const SQUARE = String(params.squareImage ?? 'square'), SQUARE_BLEND = num(params.squareBlend, 1);

    const lines = (obj) => String((obj && obj.note) || '').split(/[\r\n]+/);
    const itemNotes = (item) => {
        if (!item) return null;
        if (item._rrAoe) return item._rrAoe;
        const n = { image: CIRCLE, blend: CIRCLE_BLEND, height: HEIGHT, radius: 0, rectImage: SQUARE, rectBlend: SQUARE_BLEND, rectValue: 0, rectType: 0 };
        for (const line of lines(item)) {
            let m;
            if ((m = /<(?:AOE_IMAGE|aoe image):[ ](.*)>/i.exec(line))) n.image = m[1];
            else if ((m = /<(?:AOE_BLEND|aoe blend):[ ](\d+)>/i.exec(line))) n.blend = Math.min(Math.max(Number(m[1]), 0), 2);
            else if ((m = /<(?:AOE_HEIGHT|aoe height):[ ](\d+)([%％])>/i.exec(line))) n.height = Math.max(Number(m[1]) * 0.01, 0.1);
            else if ((m = /<(?:AOE_RADIUS|aoe radius):[ ](\d+)>/i.exec(line))) n.radius = Math.max(Number(m[1]), 3);
            else if ((m = /<(?:RECT_IMAGE|rect image):[ ](.*)>/i.exec(line))) n.rectImage = m[1];
            else if ((m = /<(?:RECT_BLEND|rect blend):[ ](\d+)>/i.exec(line))) n.rectBlend = Number(m[1]);
            else if ((m = /<(?:AOE_COLUMN|aoe column):[ ](\d+)>/i.exec(line))) { n.rectType = 1; n.rectValue = Math.max(Number(m[1]), 3); }
            else if ((m = /<(?:AOE_ROW|aoe row):[ ](\d+)>/i.exec(line))) { n.rectType = 2; n.rectValue = Math.max(Number(m[1]), 3); }
            else if (/<(?:AOE_MAP|aoe map)>/i.test(line)) n.rectType = 3;
        }
        return (item._rrAoe = n);
    };
    const enemyNotes = (enemy) => {
        if (!enemy) return null;
        if (enemy._rrAoe) return enemy._rrAoe;
        const n = { offsetX: OFFSET_X, offsetY: OFFSET_Y, width: null, height: null };
        for (const line of lines(enemy)) {
            let m;
            if ((m = /<(?:OFFSET_X|offset x):[ ]([+-]\d+)>/i.exec(line))) n.offsetX = Number(m[1]);
            else if ((m = /<(?:OFFSET_Y|offset y):[ ]([+-]\d+)>/i.exec(line))) n.offsetY = Number(m[1]);
            else if ((m = /<(?:HITBOX_WIDTH|hitbox width):[ ](\d+)>/i.exec(line))) n.width = Math.max(Number(m[1]), 1);
            else if ((m = /<(?:HITBOX_HEIGHT|hitbox height):[ ](\d+)>/i.exec(line))) n.height = Math.max(Number(m[1]), 1);
        }
        return (enemy._rrAoe = n);
    };

    //-------------------------------------------------------------------------
    // Battlers on the screen
    //-------------------------------------------------------------------------
    const battleScene = () => (SceneManager._scene instanceof Scene_Battle ? SceneManager._scene : null);
    const screenX = (b) => {
        if (typeof b.screenX === 'function') return b.screenX();
        if (typeof b.rrScreenX === 'function') return b.rrScreenX();
        const dw = Math.floor(Graphics.width / $gameParty.maxBattleMembers());
        return b.index() * dw + Math.floor(dw / 2);
    };
    const screenY = (b) => {
        if (typeof b.screenY === 'function') return b.screenY();
        if (typeof b.rrScreenY === 'function') return b.rrScreenY();
        return Graphics.height - 120;
    };
    const spriteOf = (b) => {
        const set = battleScene() && battleScene()._spriteset;
        if (!set || !b) return null;
        return (b.isActor() ? set._actorSprites : set._enemySprites || []).find(s => s._battler === b) || null;
    };
    // The size a sprite shows its battler at, read each time (an image may change to a character set):
    // its own frame, or its main sprite's when it draws through one.
    const spriteSize = (sprite) => {
        if (!sprite) return { width: 0, height: 0 };
        const own = sprite.bitmap && sprite._frame && sprite._frame.width > 0 ? sprite._frame : null;
        const main = !own && sprite._mainSprite && sprite._mainSprite._frame ? sprite._mainSprite._frame : null;
        const frame = own || main;
        return frame ? { width: frame.width, height: frame.height } : { width: 0, height: 0 };
    };
    const GB = Game_Battler.prototype;
    GB.rrScreenPos = function() { return [screenX(this), screenY(this)]; };
    GB.rrBattleSprite = function() { return spriteOf(this); };
    GB.rrHitboxXOffset = function() { return this.isEnemy() ? enemyNotes(this.enemy()).offsetX : 0; };
    GB.rrHitboxYOffset = function() { return this.isEnemy() ? enemyNotes(this.enemy()).offsetY : -4; };
    GB.rrHitboxWidth = function() {
        const w = this.isEnemy() ? enemyNotes(this.enemy()).width : null;
        return w != null ? w : spriteSize(spriteOf(this)).width;
    };
    GB.rrHitboxHeight = function() {
        const h = this.isEnemy() ? enemyNotes(this.enemy()).height : null;
        return h != null ? h : spriteSize(spriteOf(this)).height;
    };
    GB.rrHitbox = function() {
        const w = this.rrHitboxWidth(), h = this.rrHitboxHeight();
        return { x: screenX(this) - Math.floor(w / 2) + this.rrHitboxXOffset(), y: screenY(this) - h + this.rrHitboxYOffset(), width: w, height: h };
    };
    window.RRYanflyAoe = { itemNotes, enemyNotes, screenX, screenY, spriteOf, spriteSize };

    //-------------------------------------------------------------------------
    // Who is inside
    //-------------------------------------------------------------------------
    // The point of the target's hitbox nearest the area's centre.
    const nearest = (mainX, mainY, target) => {
        const box = target.rrHitbox(), tx0 = screenX(target), ty0 = screenY(target);
        let x = tx0, y = ty0;
        if (mainX > tx0) x = Math.min(box.x + box.width, mainX);
        else if (mainX < tx0) x = Math.max(box.x, mainX);
        if (mainY > ty0) y = Math.min(box.y + box.height, mainY);
        else if (mainY < ty0) y = Math.max(box.y, mainY);
        return [x, y];
    };
    const GA = Game_Action.prototype;
    GA.rrInsideAoeCircle = function(main, target) {
        if (!main || !target) return false;
        const n = itemNotes(this.item()), radius = n.radius + 1;
        const mainX = screenX(main) + main.rrHitboxXOffset(), mainY = screenY(main) + main.rrHitboxYOffset();
        const [tx, ty] = nearest(mainX, mainY, target);
        const x = tx - mainX, y = ty - mainY;
        const a = radius * 1.125, b = radius * (n.height + 0.01);
        return (x * x) / (a * a) + (y * y) / (b * b) <= 1;
    };
    GA.rrInsideAoeSquare = function(main, target) {
        if (!main || !target) return false;
        const n = itemNotes(this.item());
        const mainX = screenX(main) + main.rrHitboxXOffset(), mainY = screenY(main) + main.rrHitboxYOffset();
        const [tx, ty] = nearest(mainX, mainY, target);
        const half = Math.floor(n.rectValue / 2);
        let x1 = 0, x2 = Graphics.width, y1 = 0, y2 = Graphics.height;
        if (n.rectType === 1) { x1 = mainX - half; x2 = mainX + half; }
        else if (n.rectType === 2) { y1 = mainY - half; y2 = mainY + half; }
        return tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2;
    };
    const smoothTarget = (unit, index) => (window.RRTargetManager ? window.RRTargetManager.smoothTarget(unit, index) : unit.smoothTarget(index));
    const areaTargets = function(test) {
        const group = this.isForFriend() ? this.friendsUnit() : this.opponentsUnit();
        const main = smoothTarget(this.opponentsUnit(), this._targetIndex);
        return group.aliveMembers().filter(target => test.call(this, main, target));
    };
    GA.rrAoeCircleTargets = function() {
        const n = itemNotes(this.item());
        return n && n.radius > 0 ? areaTargets.call(this, GA.rrInsideAoeCircle) : [];
    };
    GA.rrAoeSquareTargets = function() {
        const n = itemNotes(this.item());
        return n && n.rectType > 0 ? areaTargets.call(this, GA.rrInsideAoeSquare) : [];
    };
    // The Target Manager adds these to the scope's targets.
    GA.rrAoeTargets = function(targets) {
        const result = this.rrAoeCircleTargets();
        for (const b of this.rrAoeSquareTargets()) if (!result.includes(b)) result.push(b);
        for (const b of result) if (!targets.includes(b)) targets.push(b);
        return targets;
    };

    // The enemies inside the area around the chosen one (the target window's current enemy).
    Window_BattleEnemy.prototype.rrHighlightAoe = function(enemy) {
        const actor = BattleManager.actor(), action = actor && actor.inputtingAction();
        const n = action && itemNotes(action.item());
        if (!n) return false;
        const target = this.enemy();
        if (n.radius > 0 && action.rrInsideAoeCircle(target, enemy)) return true;
        if (n.rectType > 0 && action.rrInsideAoeSquare(target, enemy)) return true;
        return false;
    };

    //-------------------------------------------------------------------------
    // The area on the field
    //-------------------------------------------------------------------------
    const blendMode = (blend) => (blend === 1 ? PIXI.BLEND_MODES.ADD : blend === 2 && PIXI.BLEND_MODES.SUBTRACT !== undefined ? PIXI.BLEND_MODES.SUBTRACT : PIXI.BLEND_MODES.NORMAL);

    class Sprite_RRAoeCircle extends Sprite {
        initialize() {
            super.initialize();
            this._rrItem = null;
            this._glowRate = -8;
            this._glow = 255;
            this.anchor.set(0.5, 0.5);
            this.z = 2;
            this.visible = false;
        }
        notes() { return itemNotes(this._rrItem); }
        noAoe() { return this.notes().radius <= 0; }
        imageName() { return this.notes().image; }
        blend() { return this.notes().blend; }
        setItem(item) {
            if (this._rrItem === item) return;
            this._rrItem = item;
            if (!item || this.noAoe()) return;
            this.bitmap = ImageManager.loadPicture(this.imageName());
            this.blendMode = blendMode(this.blend());
        }
        // Sized to the area once the picture is in: the ellipse's width, a hair over its diameter.
        updateZoom() {
            if (!this.bitmap || !this.bitmap.isReady() || !this.bitmap.width) return;
            const n = this.notes();
            this.scale.x = ((n.radius * 2 + 1) * 1.125) / this.bitmap.width;
            this.scale.y = this.scale.x * n.height;
        }
        windows() {
            const scene = battleScene();
            return scene ? [scene._enemyWindow, scene._actorWindow] : [null, null];
        }
        update() {
            super.update();
            const [enemyWindow, actorWindow] = this.windows();
            if (!enemyWindow) return;
            const actor = BattleManager.actor();
            if (actor && (enemyWindow.visible || (actorWindow && actorWindow.visible))) {
                const action = actor.inputtingAction();
                this.setItem(action ? action.item() : null);
            }
            this.visible = !!this._rrItem && !this.noAoe() && (enemyWindow.visible || !!(actorWindow && actorWindow.visible));
            if (this._rrItem && !this.noAoe()) {
                this.updateZoom();
                this.x = this.targetX();
                this.y = this.targetY();
            }
            this.updateGlow();
        }
        target() {
            const [enemyWindow, actorWindow] = this.windows();
            if (enemyWindow.visible) return enemyWindow.enemy();
            if (actorWindow && actorWindow.visible) return $gameParty.battleMembers()[actorWindow.index()];
            return null;
        }
        targetX() { const t = this.target(); return t ? screenX(t) + t.rrHitboxXOffset() : 0; }
        targetY() { const t = this.target(); return t ? screenY(t) + t.rrHitboxYOffset() : 0; }
        // Opacity steps by 8 down to 0 and back up to 255, as the RGSS sprite clamped it.
        updateGlow() {
            if (!this.visible) return;
            this._glow = Math.min(Math.max(this._glow + this._glowRate, 0), 255);
            this.opacity = this._glow;
            if (this._glow <= 0 || this._glow >= 255) this._glowRate *= -1;
        }
    }
    class Sprite_RRAoeSquare extends Sprite_RRAoeCircle {
        initialize() {
            super.initialize();
            this.z = 1;
        }
        noAoe() { return this.notes().rectType <= 0; }
        imageName() { return this.notes().rectImage; }
        blend() { return this.notes().rectBlend; }
        updateZoom() {
            if (!this.bitmap || !this.bitmap.isReady() || !this.bitmap.width) return;
            const n = this.notes(), w = this.bitmap.width, h = this.bitmap.height;
            this.scale.x = (n.rectType === 1 ? n.rectValue : Graphics.width) / w;
            this.scale.y = (n.rectType === 2 ? n.rectValue : Graphics.height) / h;
        }
        targetX() { return [2, 3].includes(this.notes().rectType) ? Math.floor(Graphics.width / 2) : super.targetX(); }
        targetY() { return [1, 3].includes(this.notes().rectType) ? Math.floor(Graphics.height / 2) : super.targetY(); }
    }
    window.Sprite_RRAoeCircle = Sprite_RRAoeCircle;
    window.Sprite_RRAoeSquare = Sprite_RRAoeSquare;

    // Under the battlers, over the battle backs: the column or row first, the circle over it.
    const _createLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        this._rrAoeCircle = new Sprite_RRAoeCircle();
        this._rrAoeSquare = new Sprite_RRAoeSquare();
        this._battleField.addChildAt(this._rrAoeCircle, 0);
        this._battleField.addChildAt(this._rrAoeSquare, 0);
    };
})();
