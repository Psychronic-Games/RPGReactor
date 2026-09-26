/*:
 * @target MZ
 * @plugindesc TheoAllen Character Shadow (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoCharacterShadow.js
 *
 * A shadow picture (img/system/Shadow) under the player, followers and
 * events, centred on the character and resting its bottom edge on the
 * bottom of the character's tile. It stays on the ground while the character
 * jumps, takes the character's opacity, and is drawn above characters set
 * "Below Characters" and below everything else.
 *
 * No shadow for vehicles, erased events, a character with no image or a tile
 * image, a character whose file name starts with "!", or a transparent one.
 * No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 *
 * @param image
 * @text Shadow image
 * @type file
 * @dir img/system/
 * @default Shadow
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoCharacterShadow');
    const IMAGE = params.image || 'Shadow';
    // Tilemap order: 1 below-characters priority, 3 normal, 4 upper tiles.
    const SHADOW_Z = 2;

    Game_CharacterBase.prototype.rrShadowExists = function() {
        return !!this._characterName && !this._transparent && !this.isObjectCharacter();
    };
    Game_Event.prototype.rrShadowExists = function() {
        return !this._erased && Game_CharacterBase.prototype.rrShadowExists.call(this);
    };
    Game_Vehicle.prototype.rrShadowExists = function() {
        return false;
    };

    function Sprite_RRCharShadow() { this.initialize(...arguments); }
    Sprite_RRCharShadow.prototype = Object.create(Sprite.prototype);
    Sprite_RRCharShadow.prototype.constructor = Sprite_RRCharShadow;
    Sprite_RRCharShadow.prototype.initialize = function(character) {
        Sprite.prototype.initialize.call(this, ImageManager.loadSystem(IMAGE));
        this.anchor.x = 0.5;
        this.anchor.y = 1;
        this.z = SHADOW_Z;
        this._character = character;
        this.update();
    };
    Sprite_RRCharShadow.prototype.update = function() {
        Sprite.prototype.update.call(this);
        const c = this._character;
        if (!c) {
            this.visible = false;
            return;
        }
        // The tile's bottom edge: no shift_y and no jump height, so the shadow stays on the ground.
        const th = $gameMap.tileHeight();
        this.x = c.screenX();
        this.y = Math.floor($gameMap.adjustY(c._realY) * th + th);
        this.opacity = c.opacity();
        this.visible = c.rrShadowExists();
    };
    window.Sprite_RRCharShadow = Sprite_RRCharShadow;

    const _createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _createCharacters.call(this);
        this._rrCharShadows = this._characterSprites.map(sprite => {
            const shadow = new Sprite_RRCharShadow(sprite._character);
            shadow._rrOwner = sprite;
            this._tilemap.addChild(shadow);
            return shadow;
        });
    };

    // A shadow leaves the display tree with its character when the map culls that character off screen,
    // and comes back with it; the tilemap is re-sorted so it returns under the characters.
    const _update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _update.call(this);
        let resort = false;
        for (const shadow of this._rrCharShadows || []) {
            const culled = !!(shadow._rrOwner && shadow._rrOwner._rrCulled);
            if (culled && shadow.parent === this._tilemap) {
                this._tilemap.removeChild(shadow);
            } else if (!culled && !shadow.parent) {
                shadow.update();
                this._tilemap.addChild(shadow);
                resort = true;
            }
        }
        if (resort && this._tilemap._sortChildren) this._tilemap._sortChildren();
    };

    const _destroy = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function(options) {
        // Detached shadows are outside the tree the destroy cascades through.
        for (const shadow of this._rrCharShadows || []) if (!shadow.parent) shadow.destroy();
        this._rrCharShadows = null;
        _destroy.call(this, options);
    };
})();
