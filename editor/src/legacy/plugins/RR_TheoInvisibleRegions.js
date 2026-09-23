/*:
 * @target MZ
 * @plugindesc TheoAllen - Invisible Regions (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoInvisibleRegions.js
 *
 * On a map whose note has <invisreg>, every tile outside the player's region
 * is covered in black and characters standing in other regions disappear.
 * Map notes:
 *   <visireg: n>        region n always stays visible (and its events)
 *   <visilink: a,b,...> regions a, b, ... show and hide together
 * An event whose current page has a <visible> comment is never hidden (the
 * mask still covers its tile). The player is never hidden; followers and
 * vehicles are hidden outside the player's region.
 *
 * $gameSystem.picture_front = true puts the mask above characters but below
 * pictures; false (the default) covers pictures too. Kept in the save.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * below. Turning the plugin off leaves those calls doing nothing.
 *
 *   $gameSystem._rrPictureFront = true / false
 */
(() => {
    'use strict';

    //-------------------------------------------------------------------------
    // Map data, rebuilt from $dataMap (not saved: it is derived from the map)
    //-------------------------------------------------------------------------

    let cache = null;
    function mapInfo() {
        const data = typeof $dataMap !== 'undefined' ? $dataMap : null;
        if (!data) return null;
        if (cache && cache.data === data) return cache;
        const note = String(data.note || '');
        const info = { data, enabled: /<invisreg>/i.test(note), visiregs: [], links: [], regions: null };
        for (const line of note.split(/[\r\n]+/)) {
            let m = /<visireg\s*:\s*(\d+)>/i.exec(line);
            if (m) info.visiregs.push(parseInt(m[1], 10));
            m = /<visilink\s*:\s*(.+)>/i.exec(line);
            if (m) info.links.push(m[1].split(',').map(s => parseInt(s, 10) || 0));
        }
        cache = info;
        return info;
    }

    // Tile indices per region, built on first use for the current map.
    function regionTiles(info) {
        if (!info.regions) {
            info.regions = new Map();
            const w = $gameMap.width(), h = $gameMap.height();
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const r = $gameMap.regionId(x, y);
                    if (!info.regions.has(r)) info.regions.set(r, []);
                    info.regions.get(r).push(y * w + x);
                }
            }
        }
        return info.regions;
    }

    Game_Map.prototype.rrInvisibleRegion = function() {
        const info = mapInfo();
        return !!(info && info.enabled);
    };

    Game_Map.prototype.rrVisiregs = function() {
        const info = mapInfo();
        return info ? info.visiregs : [];
    };

    Game_Map.prototype.rrVisiregLink = function(regionId) {
        const info = mapInfo();
        return (info && info.links.find(list => list.includes(regionId))) || [];
    };

    Game_Map.prototype.rrVisibleRegions = function(regionId) {
        const set = new Set(this.rrVisiregs());
        set.add(regionId);
        for (const r of this.rrVisiregLink(regionId)) set.add(r);
        return set;
    };

    //-------------------------------------------------------------------------
    // Characters
    //-------------------------------------------------------------------------

    Game_Character.prototype.rrInvisHidden = function() {
        return $gameMap.rrInvisibleRegion() && this.regionId() !== $gamePlayer.regionId();
    };

    Game_Player.prototype.rrInvisHidden = function() {
        return false;
    };

    Game_Event.prototype.rrStayVisible = function() {
        const list = this.list();
        if (this._rrVisibleList !== list) {
            this._rrVisibleList = list;
            this._rrStayVisible = !!list && list.some(c => (c.code === 108 || c.code === 408) && /<visible>/i.test(String(c.parameters[0])));
        }
        return this._rrStayVisible;
    };

    Game_Event.prototype.rrInvisHidden = function() {
        if (!$gameMap.rrInvisibleRegion() || this.rrStayVisible()) return false;
        const region = this.regionId(), playerRegion = $gamePlayer.regionId();
        if ($gameMap.rrVisiregs().includes(region) || region === playerRegion) return false;
        return !$gameMap.rrVisiregLink(playerRegion).includes(region);
    };

    // Wraps whatever opacity the character already reports; a subclass's own override still wins.
    const _rrInvisOpacity = Object.prototype.hasOwnProperty.call(Game_Character.prototype, 'opacity')
        ? Game_Character.prototype.opacity
        : function() { return Game_CharacterBase.prototype.opacity.call(this); };
    Game_Character.prototype.opacity = function() {
        return this.rrInvisHidden() ? 0 : _rrInvisOpacity.call(this);
    };

    // A <visible> event outside the player's region sinks under ordinary characters.
    const _rrInvisEventScreenZ = Game_Event.prototype.screenZ;
    Game_Event.prototype.screenZ = function() {
        if ($gameMap.rrInvisibleRegion() && this.rrStayVisible() && this.regionId() !== $gamePlayer.regionId()) return 2;
        return _rrInvisEventScreenZ.call(this);
    };

    //-------------------------------------------------------------------------
    // Mask: one pixel per tile, scaled up unsmoothed, redrawn on region change
    //-------------------------------------------------------------------------

    Spriteset_Map.prototype.rrUpdateInvisMask = function() {
        const info = mapInfo();
        const enabled = !!(info && info.enabled);
        if (!enabled && !this._rrInvisLayer) return;
        if (!this._rrInvisLayer) {
            this._rrInvisLayer = new Sprite();
        }
        const layer = this._rrInvisLayer;
        layer.visible = enabled;
        if (!enabled) return;
        this.rrPlaceInvisMask();
        const w = $gameMap.width(), h = $gameMap.height();
        const loops = $gameMap.isLoopHorizontal() || $gameMap.isLoopVertical();
        if (!this._rrInvisSprite || this._rrInvisSprite._rrData !== info.data || this._rrInvisSprite._rrLoops !== loops) {
            if (this._rrInvisSprite) {
                layer.removeChild(this._rrInvisSprite);
                this._rrInvisSprite.destroy();
            }
            const bitmap = new Bitmap(w, h);
            bitmap.smooth = false;
            const sprite = loops ? new TilingSprite(bitmap) : new Sprite(bitmap);
            sprite._rrData = info.data;
            sprite._rrLoops = loops;
            sprite._rrRegion = null;
            this._rrInvisSprite = sprite;
            layer.addChild(sprite);
        }
        const sprite = this._rrInvisSprite;
        const region = $gamePlayer.regionId();
        if (sprite._rrRegion !== region) {
            sprite._rrRegion = region;
            this.rrDrawInvisMask(sprite.bitmap, info, region);
        }
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const ox = Math.ceil($gameMap.displayX() * tw), oy = Math.ceil($gameMap.displayY() * th);
        if (loops) {
            sprite.move(0, 0, Graphics.width, Graphics.height);
            if (sprite.tileScale) sprite.tileScale.set(tw, th); else if (sprite.tileTransform) sprite.tileTransform.scale.set(tw, th);
            sprite.origin.x = ox;
            sprite.origin.y = oy;
        } else {
            sprite.scale.set(tw, th);
            sprite.x = -ox;
            sprite.y = -oy;
        }
    };

    Spriteset_Map.prototype.rrDrawInvisMask = function(bitmap, info, region) {
        const w = bitmap.width, h = bitmap.height;
        const image = bitmap.context.createImageData(w, h);
        const px = image.data;
        for (let i = 3; i < px.length; i += 4) px[i] = 255;
        const regions = regionTiles(info);
        for (const r of $gameMap.rrVisibleRegions(region)) {
            for (const t of regions.get(r) || []) px[t * 4 + 3] = 0;
        }
        bitmap.context.putImageData(image, 0, 0);
        bitmap._baseTexture.update();
    };

    // picture_front on: over the map and its characters, under weather and pictures.
    // Off: over everything in the spriteset, so it follows the map camera's zoom by hand.
    Spriteset_Map.prototype.rrPlaceInvisMask = function() {
        const layer = this._rrInvisLayer;
        const front = !!($gameSystem && $gameSystem._rrPictureFront);
        const parent = front ? this._baseSprite : this;
        if (layer.parent !== parent) {
            if (layer.parent) layer.parent.removeChild(layer);
            if (front) parent.addChildAt(layer, parent.children.indexOf(this._tilemap) + 1);
            else parent.addChild(layer);
        }
        if (front) {
            layer.scale.set(1, 1);
            layer.position.set(0, 0);
        } else {
            layer.scale.set(this._baseSprite.scale.x, this._baseSprite.scale.y);
            layer.position.set(this._baseSprite.x, this._baseSprite.y);
        }
    };

    const _rrInvisSpritesetUpdate = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _rrInvisSpritesetUpdate.call(this);
        this.rrUpdateInvisMask();
    };
})();
