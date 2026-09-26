/*:
 * @target MZ
 * @plugindesc State Animations (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyStateAnimations.js
 *
 * A state with <state ani: n> in its note plays battle animation n over the
 * battler again and again while the battler has it; of several such states
 * the one with the highest priority plays. The animation follows the battler
 * sprite, draws over the battlers, and never holds up the battle.
 *
 * Its flashes play (a flash of the target, a hiding of the target, and, when
 * the setting allows, a flash of the screen); its sounds only when the
 * setting allows. On actors it plays only when the setting allows, and at the
 * actor zoom, and only where the actors have battle sprites.
 *
 * As the original did, the animation is chosen when the battler's states
 * last changed: a battler recovered in full by an event keeps its animation
 * until its states next change; each loop shows the last frame twice.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param playSound
 * @type boolean
 * @default false
 *
 * @param playFlash
 * @text Play screen flashes
 * @type boolean
 * @default true
 *
 * @param playActor
 * @text Play on actors
 * @type boolean
 * @default true
 *
 * @param actorZoom
 * @type number
 * @decimals 2
 * @default 0.5
 *
 * @param rate
 * @text Frames per animation cell
 * @type number
 * @min 1
 * @default 4
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyStateAnimations');
    const PLAY_SOUND = String(params.playSound) === 'true';
    const PLAY_FLASH = String(params.playFlash) !== 'false';
    const PLAY_ACTOR = String(params.playActor) !== 'false';
    const ACTOR_ZOOM = params.actorZoom === undefined || params.actorZoom === '' ? 0.5 : Number(params.actorZoom);
    const RATE = Math.max(1, Math.trunc(Number(params.rate) || 4));

    const RE = /<(?:STATE_ANIMATION|state ani|animation|ani):[ ](\d+)>/i;
    // The last matching line wins, as each line overwrote the one before.
    const stateAnimation = (state) => {
        if (!state) return 0;
        if (state._rrStateAni === undefined) {
            let id = 0;
            for (const line of String(state.note || '').split(/[\r\n]+/)) {
                const m = RE.exec(line);
                if (m) id = Number(m[1]);
            }
            Object.defineProperty(state, '_rrStateAni', { value: id, configurable: true });
        }
        return state._rrStateAni;
    };

    //-------------------------------------------------------------------------
    // The battler's animation, chosen when its states change (refresh)
    //-------------------------------------------------------------------------
    const _refresh = Game_BattlerBase.prototype.refresh;
    Game_BattlerBase.prototype.refresh = function() {
        _refresh.call(this);
        this.rrReloadStateAnimation();
    };
    Game_BattlerBase.prototype.rrReloadStateAnimation = function() {
        this._rrStateAnimationId = 0;
        if (this.isActor() && !PLAY_ACTOR) return;
        for (const state of this.states()) {
            const id = stateAnimation(state);
            if (id > 0) { this._rrStateAnimationId = id; break; }
        }
    };
    Game_BattlerBase.prototype.rrStateAnimationId = function() { return this._rrStateAnimationId; };

    //-------------------------------------------------------------------------
    // The looping animation on the battler sprite
    //-------------------------------------------------------------------------
    // Screen-position animations started this frame, so the same one flashes the screen once.
    let screenFrame = -1, screenStarted = [];

    const S = Sprite_Battler.prototype;
    S.rrUpdateStateAnimation = function() {
        if (!this._battler) return;
        const id = this._battler.rrStateAnimationId ? this._battler.rrStateAnimationId() : undefined;
        if (id !== undefined && id !== null) {
            if (id === 0) this.rrDisposeStateAnimation();
            else if ($dataAnimations[id] && $dataAnimations[id].frames) this.rrStartStateAnimation($dataAnimations[id]);
        }
        this.rrStepStateAnimation();
        this.rrStepStateFlash();
    };
    S.rrStartStateAnimation = function(animation) {
        if (this._rrStateAni && this._rrStateAni.id === animation.id) return;
        this.rrDisposeStateAnimation();
        this._rrStateAni = animation;
        this._rrStateAniDuration = animation.frames.length * RATE + 1;
        this._rrStateAniBitmaps = [ImageManager.loadAnimation(animation.animation1Name), ImageManager.loadAnimation(animation.animation2Name)];
        this._rrStateAniHues = [animation.animation1Hue, animation.animation2Hue];
        const layer = new Sprite();
        layer.rrOwner = this;
        // The layer lives beside the battler (drawn over the battlers); it goes when the battler sprite does.
        layer.update = function() {
            Sprite.prototype.update.call(this);
            if (!this.rrOwner || this.rrOwner.parent !== this.parent || this.rrOwner._rrStateAniLayer !== this) {
                if (this.parent) this.parent.removeChild(this);
            }
        };
        layer.rrCells = [];
        for (let i = 0; i < 16; i++) {
            const cell = new Sprite();
            cell.anchor.x = 0.5;
            cell.anchor.y = 0.5;
            cell.visible = false;
            layer.rrCells.push(cell);
            layer.addChild(cell);
        }
        this._rrStateAniLayer = layer;
        if (animation.position === 3) {
            if (screenFrame !== Graphics.frameCount) { screenFrame = Graphics.frameCount; screenStarted = []; }
            this._rrStateAniDuplicated = screenStarted.includes(animation.id);
            if (!this._rrStateAniDuplicated) screenStarted.push(animation.id);
        } else {
            this._rrStateAniDuplicated = false;
        }
    };
    S.rrDisposeStateAnimation = function() {
        const layer = this._rrStateAniLayer;
        if (layer && layer.parent) layer.parent.removeChild(layer);
        this._rrStateAniLayer = null;
        this._rrStateAni = null;
        if (this._rrStateHide > 0) {
            this._rrStateHide = 0;
            this.mainSprite().show();
        }
    };
    // Where the animation sits: the battler sprite's centre, head (position 0) or feet (2), or the screen's centre (3).
    S.rrStateAnimationOrigin = function() {
        const animation = this._rrStateAni;
        if (animation.position === 3) return [Graphics.boxWidth / 2, Graphics.boxHeight / 2];
        const main = this.mainSprite();
        const height = main.height * Math.abs(main.scale.y);
        const x = this.x + (main === this ? 0 : main.x);
        const bottom = this.y + (main === this ? 0 : main.y);
        const y = animation.position === 0 ? bottom - height : animation.position === 2 ? bottom : bottom - height / 2;
        return [x, y];
    };
    S.rrStepStateAnimation = function() {
        const animation = this._rrStateAni, layer = this._rrStateAniLayer;
        if (!animation || !layer) return;
        if (!layer.parent && this.parent) this.parent.addChild(layer);
        const frames = animation.frames;
        this._rrStateAniDuration--;
        if (this._rrStateAniDuration % RATE === 0) {
            if (this._rrStateAniDuration > 0) {
                this._rrStateFrameIndex = frames.length - Math.floor((this._rrStateAniDuration + RATE - 1) / RATE);
                for (const timing of animation.timings || []) {
                    if (timing.frame === this._rrStateFrameIndex) this.rrStateAnimationTiming(timing);
                }
            } else {
                this._rrStateAniDuration = frames.length * RATE + 1;
            }
        }
        if (this._rrStateFrameIndex === undefined || this._rrStateFrameIndex === null) return;
        const frame = frames[this._rrStateFrameIndex];
        if (!frame) return;
        const [ox, oy] = this.rrStateAnimationOrigin();
        const zoom = this._battler.isActor() ? ACTOR_ZOOM : 1;
        layer.rrCells.forEach((sprite, i) => {
            const cell = frame[i];
            const pattern = cell ? cell[0] : -1;
            if (!cell || pattern < 0) { sprite.visible = false; return; }
            const second = pattern >= 100;
            sprite.bitmap = this._rrStateAniBitmaps[second ? 1 : 0];
            sprite.setHue(this._rrStateAniHues[second ? 1 : 0]);
            sprite.setFrame((pattern % 5) * 192, Math.floor((pattern % 100) / 5) * 192, 192, 192);
            sprite.x = ox + cell[1];
            sprite.y = oy + cell[2];
            sprite.rotation = (cell[4] * Math.PI) / 180;
            sprite.scale.x = (cell[3] / 100) * zoom * (cell[5] ? -1 : 1);
            sprite.scale.y = (cell[3] / 100) * zoom;
            sprite.opacity = cell[6] * this.opacity / 255;
            sprite.blendMode = cell[7];
            sprite.visible = true;
        });
    };
    S.rrStateAnimationTiming = function(timing) {
        if (PLAY_SOUND && timing.se && timing.se.name) AudioManager.playSe(timing.se);
        const duration = timing.flashDuration * RATE;
        switch (timing.flashScope) {
            case 1:
                this._rrStateFlash = timing.flashColor.slice();
                this._rrStateFlashDuration = duration;
                break;
            case 2:
                if (PLAY_FLASH && !this._rrStateAniDuplicated) $gameScreen.startFlash(timing.flashColor.slice(), duration);
                break;
            case 3:
                this._rrStateHide = duration;
                this.mainSprite().hide();
                break;
        }
    };
    S.rrStepStateFlash = function() {
        if (this._rrStateFlashDuration > 0) {
            const d = this._rrStateFlashDuration--;
            this._rrStateFlash[3] *= (d - 1) / d;
            this.mainSprite().setBlendColor(this._rrStateFlash);
        }
        if (this._rrStateHide > 0 && --this._rrStateHide === 0) this.mainSprite().show();
    };

    for (const Sprite_Class of [Sprite_Enemy, Sprite_Actor]) {
        const _update = Sprite_Class.prototype.update;
        Sprite_Class.prototype.update = function() {
            _update.call(this);
            this.rrUpdateStateAnimation();
        };
    }
})();
