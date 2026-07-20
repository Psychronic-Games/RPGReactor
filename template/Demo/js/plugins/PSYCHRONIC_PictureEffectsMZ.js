//=============================================================================
// PSYCHRONIC_PictureEffectsMZ.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v1.0 Play database animations on pictures
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_PictureEffectsMZ.js
 *
 * Plays MZ database animations (MV-style or Effekseer) on pictures.
 * Drop-in replacement for Galv_PicAnimMV — all existing Galv.PIC.anim()
 * script calls work without modification.
 *
 * ============================================================================
 * Script Calls
 * ============================================================================
 *
 *   PSYCHRONIC.PictureEffects.anim(picId, animId, xOffset, yOffset);
 *   PSYCHRONIC.PictureEffects.stopAnim(picId);
 *
 * Galv compatibility aliases (used by existing events):
 *
 *   Galv.PIC.anim(picId, animId, xOffset, yOffset);
 *   Galv.PIC.stopAnim(picId);
 *
 * If animId <= 0, Galv.PIC.anim stops the animation instead of playing one.
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 *   Play Animation on Picture — plays a database animation on a picture
 *   Stop Animation on Picture — removes all animations from a picture
 *
 * @command playAnimation
 * @text Play Animation on Picture
 * @desc Plays a database animation on the specified picture.
 *
 * @arg pictureId
 * @type number
 * @text Picture ID
 * @desc The picture number (1-100).
 * @default 1
 * @min 1
 * @max 100
 *
 * @arg animationId
 * @type animation
 * @text Animation
 * @desc The database animation to play.
 * @default 1
 *
 * @arg xOffset
 * @type number
 * @text X Offset
 * @desc Horizontal offset from the picture's position.
 * @default 0
 * @min -9999
 * @max 9999
 *
 * @arg yOffset
 * @type number
 * @text Y Offset
 * @desc Vertical offset from the picture's position.
 * @default 0
 * @min -9999
 * @max 9999
 *
 * @command stopAnimation
 * @text Stop Animation on Picture
 * @desc Stops and removes all animations from the specified picture.
 *
 * @arg pictureId
 * @type number
 * @text Picture ID
 * @desc The picture number (1-100).
 * @default 1
 * @min 1
 * @max 100
 */

(function() {
    'use strict';

    // ========================================================================
    // Namespace Setup
    // ========================================================================

    var PSYCHRONIC = window.PSYCHRONIC || {};
    window.PSYCHRONIC = PSYCHRONIC;
    PSYCHRONIC.PictureEffects = PSYCHRONIC.PictureEffects || {};

    var Galv = window.Galv || {};
    window.Galv = Galv;
    Galv.PIC = Galv.PIC || {};

    // ========================================================================
    // Plugin Command Registration
    // ========================================================================

    var pluginName = 'PSYCHRONIC_PictureEffectsMZ';

    PluginManager.registerCommand(pluginName, 'playAnimation', function(args) {
        var picId = Number(args.pictureId);
        var animId = Number(args.animationId);
        var xOff = Number(args.xOffset);
        var yOff = Number(args.yOffset);
        PSYCHRONIC.PictureEffects.anim(picId, animId, xOff, yOff);
    });

    PluginManager.registerCommand(pluginName, 'stopAnimation', function(args) {
        var picId = Number(args.pictureId);
        PSYCHRONIC.PictureEffects.stopAnim(picId);
    });

    // ========================================================================
    // API — PSYCHRONIC.PictureEffects
    // ========================================================================

    PSYCHRONIC.PictureEffects.anim = function(picId, animId, xOffset, yOffset) {
        var pic = $gameScreen.picture(picId);
        if (pic) {
            pic._picAnimRequest = {
                animId: animId,
                xOffset: xOffset || 0,
                yOffset: yOffset || 0
            };
        }
    };

    PSYCHRONIC.PictureEffects.stopAnim = function(picId) {
        var pic = $gameScreen.picture(picId);
        if (pic) {
            pic._picAnimStopRequest = true;
        }
    };

    // ========================================================================
    // API — Galv Compatibility
    // ========================================================================

    Galv.PIC.anim = function(picId, animId, xOffset, yOffset) {
        if (animId <= 0) {
            PSYCHRONIC.PictureEffects.stopAnim(picId);
        } else {
            PSYCHRONIC.PictureEffects.anim(picId, animId, xOffset, yOffset);
        }
    };

    Galv.PIC.stopAnim = function(picId) {
        PSYCHRONIC.PictureEffects.stopAnim(picId);
    };

    // ========================================================================
    // Sprite_Picture — Animation Management
    // ========================================================================

    var _Sprite_Picture_update = Sprite_Picture.prototype.update;
    Sprite_Picture.prototype.update = function() {
        _Sprite_Picture_update.call(this);
        this.updatePicAnimations();
    };

    Sprite_Picture.prototype.updatePicAnimations = function() {
        if (!this._picAnimSprites) {
            this._picAnimSprites = [];
        }

        var pic = this.picture();

        // Auto-cleanup when picture is erased
        if (!pic) {
            this.removeAllPicAnimations();
            return;
        }

        // Process play request
        if (pic._picAnimRequest) {
            this.startPicAnimation(pic._picAnimRequest);
            pic._picAnimRequest = null;
        }

        // Process stop request
        if (pic._picAnimStopRequest) {
            this.removeAllPicAnimations();
            pic._picAnimStopRequest = false;
        }

        // Remove finished animations
        for (var i = this._picAnimSprites.length - 1; i >= 0; i--) {
            var animSprite = this._picAnimSprites[i];
            if (!animSprite.isPlaying()) {
                if (animSprite.parent) {
                    animSprite.parent.removeChild(animSprite);
                }
                animSprite.destroy();
                this._picAnimSprites.splice(i, 1);
            }
        }
    };

    Sprite_Picture.prototype.startPicAnimation = function(request) {
        var animation = $dataAnimations[request.animId];
        if (!animation) return;

        var isMVAnim = !!animation.frames;
        var animSprite;

        if (isMVAnim) {
            animSprite = new Sprite_AnimationMV();
            animSprite._isPicAnim = true;
            animSprite._picAnimXOffset = request.xOffset;
            animSprite._picAnimYOffset = request.yOffset;
            animSprite.setup([this], animation, false, 0);
        } else {
            animSprite = new Sprite_Animation();
            animSprite._isPicAnim = true;
            animSprite._picAnimXOffset = request.xOffset;
            animSprite._picAnimYOffset = request.yOffset;
            animSprite.setup([this], animation, false, 0, null);
        }

        // Add to the picture's parent container so it renders at the
        // same z-level as the picture itself.
        if (this.parent) {
            this.parent.addChild(animSprite);
        }

        this._picAnimSprites.push(animSprite);
    };

    Sprite_Picture.prototype.removeAllPicAnimations = function() {
        if (!this._picAnimSprites) return;
        for (var i = 0; i < this._picAnimSprites.length; i++) {
            var animSprite = this._picAnimSprites[i];
            if (animSprite.parent) {
                animSprite.parent.removeChild(animSprite);
            }
            animSprite.destroy();
        }
        this._picAnimSprites = [];
    };

    // ========================================================================
    // Sprite_AnimationMV — Position Override for Picture Animations
    // ========================================================================

    var _Sprite_AnimationMV_updatePosition =
        Sprite_AnimationMV.prototype.updatePosition;

    Sprite_AnimationMV.prototype.updatePosition = function() {
        if (this._isPicAnim) {
            if (this._animation.position === 3) {
                // Screen-type: center of parent container
                this.x = this.parent.width / 2;
                this.y = this.parent.height / 2;
            } else if (this._targets.length > 0) {
                var target = this._targets[0];
                var ax = target.anchor ? target.anchor.x : 0;
                var ay = target.anchor ? target.anchor.y : 0;
                // Horizontal center accounts for anchor
                var cx = target.x + target.width * (0.5 - ax) + this._picAnimXOffset;
                var cy;
                if (this._animation.position === 0) {
                    // Head — top edge of picture
                    cy = target.y - target.height * ay + this._picAnimYOffset;
                } else if (this._animation.position === 2) {
                    // Feet — bottom edge of picture
                    cy = target.y + target.height * (1 - ay) + this._picAnimYOffset;
                } else {
                    // Center (position 1 or default)
                    cy = target.y + target.height * (0.5 - ay) + this._picAnimYOffset;
                }
                this.x = cx;
                this.y = cy;
            }
        } else {
            _Sprite_AnimationMV_updatePosition.call(this);
        }
    };

    // ========================================================================
    // Sprite_AnimationMV — onEnd Safeguard
    // ========================================================================
    // Sprite_AnimationMV.onEnd calls target.setBlendColor and target.show,
    // which Sprite_Picture may not implement the way Sprite_Battler does.
    // Skip those calls for picture animations.

    var _Sprite_AnimationMV_onEnd = Sprite_AnimationMV.prototype.onEnd;

    Sprite_AnimationMV.prototype.onEnd = function() {
        if (this._isPicAnim) {
            this._flashDuration = 0;
            this._screenFlashDuration = 0;
            this._hidingDuration = 0;
            // Intentionally skip setBlendColor / show on targets
        } else {
            _Sprite_AnimationMV_onEnd.call(this);
        }
    };

    // ========================================================================
    // Sprite_Animation (Effekseer) — Position Override for Picture Animations
    // ========================================================================

    var _Sprite_Animation_targetSpritePosition =
        Sprite_Animation.prototype.targetSpritePosition;

    Sprite_Animation.prototype.targetSpritePosition = function(sprite) {
        if (this._isPicAnim) {
            // Use unscaled bitmap dimensions to avoid double-scaling
            // (worldTransform.apply already includes scale)
            var bw = sprite.bitmap ? sprite.bitmap.width : 0;
            var bh = sprite.bitmap ? sprite.bitmap.height : 0;
            var ax = sprite.anchor ? sprite.anchor.x : 0;
            var ay = sprite.anchor ? sprite.anchor.y : 0;
            var point = new Point(
                bw * (0.5 - ax) + (this._picAnimXOffset || 0),
                bh * (0.5 - ay) + (this._picAnimYOffset || 0)
            );
            if (this._animation.alignBottom) {
                point.y = bh * (1 - ay) + (this._picAnimYOffset || 0);
            }
            sprite.updateTransform();
            return sprite.worldTransform.apply(point);
        }
        return _Sprite_Animation_targetSpritePosition.call(this, sprite);
    };

})();
