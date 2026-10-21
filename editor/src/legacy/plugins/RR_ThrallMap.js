/*:
 * @target MZ
 * @plugindesc Thrall's map rules: Game_Map, Game_Character, Game_Event, Game_Player, Sprite_Character, Scene_Map and Cache (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallMap.js
 *
 * What Thrall changed in RPG Maker VX's own map scripts, with the VX rules
 * they were written against:
 *
 * - Map music plays on entering a map only while the music switch is on.
 * - A map-sized parallax (the painted ground of most maps) scrolls with the
 *   map, as VX scrolled a parallax that does not loop.
 * - While the passage switch is on, the passage of the upper tile layer
 *   (tiles B to E) is reversed: blocked tiles can be walked on and open
 *   ones block.
 * - A character is blocked only by the tile it moves onto (VX never looked
 *   at the tile it left). An event set above characters passes through
 *   everything.
 * - Characters move diagonally at three quarters of their speed. A
 *   diagonal step that is blocked slides along whichever side is open.
 *   Random movement goes in eight directions; an event moving toward the
 *   player steps diagonally when the player is exactly diagonal to it.
 *   Random-moving events walk, step forward and pause in VX's proportions,
 *   and one that bumps into the player starts its touch trigger.
 * - Events above characters start from the player's touch and action
 *   button, and an event-touch event the player stands on starts by itself.
 * - Balloons draw above the map's overlays, from 32-pixel frames.
 * - Battle music replaces the map's only while the battle music switch is
 *   on; otherwise the map's music plays on through the battle. The map
 *   wipes to black through img/system/BattleStart in 20 frames.
 *
 * Script calls (the importer translates the game's events into these):
 *   $gamePlayer.rrChangeMove(fix, speed, dir)   change_move: direction fix,
 *                                               speed, and a direction to face
 *   Bitmap#rrVxBlt(x, y, src, rect, opacity)    the game's bitmap drawing
 *   Bitmap#rrVxClearRect(x, y, w, h | rect)     (Cache.character(…).blt …)
 *   Bitmap#rrVxClear()
 *   ImageManager.rrThrallCacheClear()           Cache.clear
 * A character sheet an event drew into (the "Cache Graphics" common event
 * puts each actor's outfit onto $Name and their heads onto Expressions)
 * keeps what was drawn while the game runs, through map changes, until a
 * dungeon floor clears the cache as the original did.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param bgmSwitch
 * @text Map music switch
 * @type switch
 * @default 21
 *
 * @param passageSwitch
 * @text Reversed passage switch
 * @type switch
 * @default 36
 *
 * @param battleBgmSwitch
 * @text Battle music switch
 * @type switch
 * @default 29
 *
 * @param transitionDuration
 * @text Battle wipe frames
 * @type number
 * @default 20
 *
 * @param transitionVague
 * @text Battle wipe softness
 * @type number
 * @default 20
 *
 * @param transitionImage
 * @text Battle wipe image
 * @type file
 * @dir img/system/
 * @default BattleStart
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallMap');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const BGM_SWITCH = num(params.bgmSwitch, 21);
    const PASSAGE_SWITCH = num(params.passageSwitch, 36);
    const BATTLE_BGM_SWITCH = num(params.battleBgmSwitch, 29);
    const WIPE_DURATION = Math.max(1, num(params.transitionDuration, 20));
    const WIPE_VAGUE = Math.max(1, num(params.transitionVague, 20));
    const WIPE_IMAGE = params.transitionImage === undefined ? 'BattleStart' : String(params.transitionImage);
    const switchOn = (id) => id > 0 && !!$gameSwitches && $gameSwitches.value(id);

    //=========================================================================
    // Cache: bitmaps the game's scripts and events draw into
    //=========================================================================
    // RGSS's Cache hands out one bitmap per file and keeps it for the whole
    // run, so a sheet an event drew into stays drawn until Cache.clear. MZ
    // empties its cache on every transfer; a drawn-into bitmap is kept aside
    // (pinned) and put back after each clear.
    const pinned = new Map();   // url -> Bitmap
    const urlOf = (bitmap) => {
        for (const cache of [ImageManager._cache, ImageManager._system]) {
            if (!cache) continue;
            for (const url in cache) if (cache[url] === bitmap) return url;
        }
        return null;
    };
    const pin = (bitmap) => {
        const url = urlOf(bitmap);
        if (url && !url.includes('/system/')) pinned.set(url, bitmap);
    };
    const _clear = ImageManager.clear;
    ImageManager.clear = function() {
        const keep = [];
        for (const [url, bitmap] of pinned) {
            if (this._cache[url] === bitmap) { keep.push([url, bitmap]); delete this._cache[url]; }
            else pinned.delete(url);
        }
        _clear.apply(this, arguments);
        for (const [url, bitmap] of keep) this._cache[url] = bitmap;
    };
    /** Cache.clear: drawn-into sheets go back to their files the next time they are loaded. */
    ImageManager.rrThrallCacheClear = function() {
        for (const [url, bitmap] of pinned) if (this._cache[url] === bitmap) delete this._cache[url];
        pinned.clear();
    };
    ImageManager.rrThrallPinned = () => pinned;

    // A sprite showing a bitmap that becomes a canvas keeps the image's
    // texture until its frame changes; point every such sprite at the new one.
    const refreshSprites = (bitmap) => {
        const visit = (node) => {
            if (!node) return;
            if (node._bitmap === bitmap && typeof node._refresh === 'function') node._refresh();
            for (const child of node.children || []) visit(child);
        };
        visit(SceneManager._scene);
    };
    const toCanvas = (bitmap) => {
        if (bitmap._canvas) return;
        bitmap._ensureCanvas();
        refreshSprites(bitmap);
    };
    // Drawing waits for every bitmap it reads and writes to load, in the order
    // the script asked for it (Ruby loaded files at once; MZ loads them later).
    const ready = (b) => !b || (typeof b.isReady === 'function' ? b.isReady() : true);
    function queue(dest, needs, run) {
        dest._rrVxOps = dest._rrVxOps || [];
        dest._rrVxOps.push({ needs, run });
        drain(dest);
    }
    function drain(dest) {
        const ops = dest._rrVxOps;
        while (ops && ops.length) {
            const op = ops[0];
            const waiting = op.needs.find(b => !ready(b));
            if (waiting) {
                if (waiting._rrVxWaitingFor !== dest) {
                    waiting._rrVxWaitingFor = dest;
                    waiting.addLoadListener(() => { waiting._rrVxWaitingFor = null; drain(dest); });
                }
                return;
            }
            ops.shift();
            if (op.needs.some(b => b && b.isError && b.isError())) continue;
            try { op.run(); } catch (e) { console.warn('RR_ThrallMap: drawing failed', e); }
        }
    }
    const rectArgs = (a) => (a.length === 1 && a[0] && typeof a[0] === 'object' ? [a[0].x, a[0].y, a[0].width, a[0].height] : a.slice(0, 4).map(Number));

    /** RGSS Bitmap#blt(x, y, src_bitmap, src_rect, opacity = 255). */
    Bitmap.prototype.rrVxBlt = function(x, y, src, rect, opacity = 255) {
        if (!src) return;
        queue(this, [this, src], () => {
            toCanvas(this);
            const r = rect || new Rectangle(0, 0, src.width, src.height);
            const sw = Math.min(r.width, src.width - r.x), sh = Math.min(r.height, src.height - r.y);
            if (sw <= 0 || sh <= 0) return;
            const was = this.paintOpacity;
            this.paintOpacity = Math.max(0, Math.min(255, Number(opacity)));
            if (src === this) {
                // Drawing a bitmap onto itself reads what was there before the draw.
                const copy = new Bitmap(sw, sh);
                copy.blt(this, r.x, r.y, sw, sh, 0, 0);
                this.blt(copy, 0, 0, sw, sh, x, y);
                copy.destroy();
            } else {
                this.blt(src, r.x, r.y, sw, sh, x, y);
            }
            this.paintOpacity = was;
            pin(this);
        });
    };
    /** RGSS Bitmap#clear_rect(x, y, width, height) or clear_rect(rect). */
    Bitmap.prototype.rrVxClearRect = function(...args) {
        const [x, y, w, h] = rectArgs(args);
        queue(this, [this], () => { toCanvas(this); this.clearRect(x, y, w, h); pin(this); });
    };
    Bitmap.prototype.rrVxClear = function() {
        queue(this, [this], () => { toCanvas(this); this.clear(); pin(this); });
    };

    // Cache.head and Cache.rooms: Thrall's own folders.
    ImageManager.rrThrallHead = (name) => ImageManager.loadBitmap('img/characters/Heads/', name);
    ImageManager.rrThrallRoom = (name) => ImageManager.loadBitmap('img/Rooms/', name);

    //=========================================================================
    // Game_Map
    //=========================================================================
    Game_Map.prototype.autoplay = function() {
        if ($dataMap.autoplayBgm && switchOn(BGM_SWITCH)) {
            if ($gamePlayer.isInVehicle()) $gameSystem.saveWalkingBgm2();
            else AudioManager.playBgm(AudioManager.mapBgmObject ? AudioManager.mapBgmObject($dataMap, this.mapId()) : $dataMap.bgm);
        }
        if ($dataMap.autoplayBgs && switchOn(BGM_SWITCH)) AudioManager.playBgs($dataMap.bgs);
    };

    // VX's parallax that does not loop slides across the map in proportion:
    // (bitmap - screen) / (map - screen) of the scroll. A map-sized picture
    // is locked to the map. A looping map leaves it still.
    const vxParallaxOffset = (display, tile, bitmapSize, mapTiles, screen) => {
        const b = bitmapSize - screen, m = mapTiles * tile - screen;
        if (b <= 0 || m <= 0) return 0;
        return display * tile * b / m;
    };
    const _updateParallax = Spriteset_Map.prototype.updateParallax;
    Spriteset_Map.prototype.updateParallax = function() {
        _updateParallax.call(this);
        const bitmap = this._parallax && this._parallax.bitmap;
        if (!bitmap || !bitmap.isReady() || $gameMap._parallaxZero) return;
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        if (!$gameMap._parallaxLoopX) {
            this._parallax.origin.x = $gameMap.isLoopHorizontal() ? 0
                : Math.floor(vxParallaxOffset($gameMap.displayX(), tw, bitmap.width, $gameMap.width(), Graphics.width));
        }
        if (!$gameMap._parallaxLoopY) {
            this._parallax.origin.y = $gameMap.isLoopVertical() ? 0
                : Math.floor(vxParallaxOffset($gameMap.displayY(), th, bitmap.height, $gameMap.height(), Graphics.height));
        }
    };

    // The passage switch reverses the upper tile layer (VX's layer 2: tiles B–E): a blocked tile
    // opens to walking, and an open tile (to walking or to a boat or ship) blocks.
    Game_Map.prototype.checkPassage = function(x, y, bit) {
        const flags = this.tilesetFlags();
        const events = this.tileEventsXy(x, y).map(event => event.tileId());
        const reversed = switchOn(PASSAGE_SWITCH);
        const walking = (bit & 0x0f) !== 0;
        const layers = [3, 2, 1, 0];
        const tiles = events.map(t => [t, -1]).concat(layers.map(z => [this.tileId(x, y, z), z]));
        for (const [tile, z] of tiles) {
            const flag = flags[tile];
            if ((flag & 0x10) !== 0) continue;   // [*] no effect on passage
            if (z === 2) {
                if (walking && (flag & bit) === bit) return reversed;
                if ((flag & bit) === 0) return !reversed;
            }
            if ((flag & bit) === 0) return true;
            if ((flag & bit) === bit) return false;
        }
        return false;
    };

    //=========================================================================
    // Game_Character
    //=========================================================================
    // VX checks the tile a character moves onto, not the one it leaves.
    Game_CharacterBase.prototype.isMapPassable = function(x, y, d) {
        const x2 = $gameMap.roundXWithDirection(x, d);
        const y2 = $gameMap.roundYWithDirection(y, d);
        return $gameMap.isPassable(x2, y2, this.reverseDir(d));
    };

    // An event above characters passes through everything.
    const _canPass = Game_CharacterBase.prototype.canPass;
    Game_CharacterBase.prototype.canPass = function(x, y, d) {
        if (this._priorityType === 2) {
            return $gameMap.isValid($gameMap.roundXWithDirection(x, d), $gameMap.roundYWithDirection(y, d));
        }
        return _canPass.call(this, x, y, d);
    };

    /** VX's passable?(x, y): the cell a character would step onto. */
    Game_CharacterBase.prototype.rrVxPassable = function(x, y) {
        x = $gameMap.roundX(x);
        y = $gameMap.roundY(y);
        if (!$gameMap.isValid(x, y)) return false;
        if (this._priorityType === 2) return true;
        if (this.isThrough() || this.isDebugThrough()) return true;
        if (!$gameMap.isPassable(x, y, 2)) return false;
        return !this.isCollidedWithCharacters(x, y);
    };

    // Diagonal steps are three quarters as fast.
    Game_CharacterBase.prototype.updateMove = function() {
        let distance = this.distancePerFrame();
        if (this._x !== this._realX && this._y !== this._realY) distance *= 0.75;
        if (this._x < this._realX) this._realX = Math.max(this._realX - distance, this._x);
        if (this._x > this._realX) this._realX = Math.min(this._realX + distance, this._x);
        if (this._y < this._realY) this._realY = Math.max(this._realY - distance, this._y);
        if (this._y > this._realY) this._realY = Math.min(this._realY + distance, this._y);
        if (!this.isMoving()) this.refreshBushDepth();
    };

    /** VX's move_down(turn_ok) and its kin: a blocked step turns only when turn_ok. */
    Game_Character.prototype.rrVxMoveStraight = function(d, turnOk = true) {
        if (turnOk || this.canPass(this._x, this._y, d)) {
            this.moveStraight(d);
            return;
        }
        this.setMovementSuccess(false);
        this.checkEventTriggerTouchFront(d);
    };

    // A diagonal step needs both sides and the corner open; otherwise it slides
    // along an open side, the one the character faces across first.
    Game_Character.prototype.moveDiagonally = function(horz, vert) {
        if (this._direction === this.reverseDir(horz)) this.setDirection(horz);
        if (this._direction === this.reverseDir(vert)) this.setDirection(vert);
        const x = this._x, y = this._y;
        const dx = horz === 6 ? 1 : -1, dy = vert === 2 ? 1 : -1;
        const side = this.rrVxPassable(x + dx, y), down = this.rrVxPassable(x, y + dy);
        if (side && down && this.rrVxPassable(x + dx, y + dy)) {
            this._x = $gameMap.roundX(x + dx);
            this._y = $gameMap.roundY(y + dy);
            this._realX = this._x - dx;
            this._realY = this._y - dy;
            this.increaseSteps();
            this.setMovementSuccess(true);
        } else if (down && this._direction === horz) {
            this.moveStraight(vert);
        } else if (side && this._direction === vert) {
            this.moveStraight(horz);
        } else if (down) {
            this.moveStraight(vert);
        } else if (side) {
            this.moveStraight(horz);
        } else {
            this.setMovementSuccess(false);
        }
    };

    Game_Character.prototype.moveRandom = function() {
        switch (Math.randomInt(8)) {
            case 0: this.rrVxMoveStraight(2, false); break;
            case 1: this.rrVxMoveStraight(4, false); break;
            case 2: this.rrVxMoveStraight(6, false); break;
            case 3: this.rrVxMoveStraight(8, false); break;
            case 4: this.moveDiagonally(4, 2); break;
            case 5: this.moveDiagonally(6, 2); break;
            case 6: this.moveDiagonally(4, 8); break;
            case 7: this.moveDiagonally(6, 8); break;
        }
    };

    Game_Character.prototype.moveTowardPlayer = function() {
        const sx = this.deltaXFrom($gamePlayer.x);
        const sy = this.deltaYFrom($gamePlayer.y);
        if (sx === 0 && sy === 0) return;
        if (Math.abs(sx) === Math.abs(sy)) {
            this.moveDiagonally(sx > 0 ? 4 : 6, sy > 0 ? 8 : 2);
        } else if (Math.abs(sx) > Math.abs(sy)) {
            this.moveStraight(sx > 0 ? 4 : 6);
            if (!this.isMovementSucceeded() && sy !== 0) this.moveStraight(sy > 0 ? 8 : 2);
        } else {
            this.moveStraight(sy > 0 ? 8 : 2);
            if (!this.isMovementSucceeded() && sx !== 0) this.moveStraight(sx > 0 ? 4 : 6);
        }
    };

    //=========================================================================
    // Game_Event
    //=========================================================================
    // VX's random movement: four in six a random step, one a step forward, one a pause.
    Game_Event.prototype.moveTypeRandom = function() {
        const r = Math.randomInt(6);
        if (r < 4) this.moveRandom();
        else if (r === 4) this.moveForward();
        else this.resetStopCount();
    };

    const startable = (event) => event._priorityType === 1 || event._priorityType === 2;
    Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
        if ($gameMap.isEventRunning()) return;
        if (this._trigger === 2 && $gamePlayer.pos(x, y) && !this.isJumping() && startable(this)) this.start();
    };
    /** check_event_trigger_here: an event-touch event the player stands on starts. */
    Game_Event.prototype.rrCheckEventTriggerHere = function() {
        if ($gameMap.isEventRunning()) return;
        if (!$gamePlayer.pos(this.x, this.y)) return;
        if (this._trigger === 2 && startable(this) && !this.isJumping()) this.start();
    };
    const _eventUpdate = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _eventUpdate.call(this);
        this.rrCheckEventTriggerHere();
    };

    //=========================================================================
    // Game_Player
    //=========================================================================
    // The action button and touch start events above characters too.
    const _startMapEvent = Game_Player.prototype.startMapEvent;
    Game_Player.prototype.startMapEvent = function(x, y, triggers, normal) {
        if (!normal) return _startMapEvent.call(this, x, y, triggers, normal);
        if ($gameMap.isEventRunning()) return;
        for (const event of $gameMap.eventsXy(x, y)) {
            if (event.isTriggerIn(triggers) && startable(event)) event.start();
        }
    };

    /** change_move(fix, speed, dir = nil) */
    Game_Player.prototype.rrChangeMove = function(fix, speed, dir) {
        this._directionFix = fix !== false && fix !== null && fix !== undefined;
        if (dir !== null && dir !== undefined) this._direction = Number(dir);
        this._moveSpeed = Number(speed);
    };

    //=========================================================================
    // Sprite_Character: balloons above the overlays
    //=========================================================================
    const _updateFrame = Sprite_Balloon.prototype.updateFrame;
    Sprite_Balloon.prototype.updateFrame = function() {
        if ($dataSystem && Number($dataSystem.rrBalloonSize)) { _updateFrame.call(this); return; }
        const sx = this.frameIndex() * 32, sy = (this._balloonId - 1) * 32;
        this.setFrame(sx, sy, 32, 32);
    };
    // The balloon layer sits right above whatever the map put over its
    // characters (RR_ThrallOverlays' layer, when installed).
    Spriteset_Map.prototype.rrThrallBalloonLayer = function() {
        if (!this._rrThrallBalloons) {
            const layer = new Sprite();
            const anchor = this._rrUomLayer || this._baseSprite;
            this.addChildAt(layer, Math.max(0, this.children.indexOf(anchor) + 1));
            this._rrThrallBalloons = layer;
        }
        return this._rrThrallBalloons;
    };
    const _createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        this.rrThrallBalloonLayer();
    };
    const _createBalloon = Spriteset_Map.prototype.createBalloon;
    Spriteset_Map.prototype.createBalloon = function(request) {
        const container = this._effectsContainer;
        this._effectsContainer = this.rrThrallBalloonLayer();
        try { _createBalloon.call(this, request); } finally { this._effectsContainer = container; }
    };
    const _removeBalloon = Spriteset_Map.prototype.removeBalloon;
    Spriteset_Map.prototype.removeBalloon = function(sprite) {
        const container = this._effectsContainer;
        if (sprite.parent === this._rrThrallBalloons) this._effectsContainer = this._rrThrallBalloons;
        try { _removeBalloon.call(this, sprite); } finally { this._effectsContainer = container; }
    };

    //=========================================================================
    // Scene_Map: battle music and the battle wipe
    //=========================================================================
    const _stopAudio = Scene_Map.prototype.stopAudioOnBattleStart;
    Scene_Map.prototype.stopAudioOnBattleStart = function() {
        BattleManager._rrThrallKeepMapBgm = !switchOn(BATTLE_BGM_SWITCH);
        if (!BattleManager._rrThrallKeepMapBgm) _stopAudio.call(this);
    };
    const _playBattleBgm = BattleManager.playBattleBgm;
    BattleManager.playBattleBgm = function() {
        if (this._rrThrallKeepMapBgm && !this.isBattleTest()) return;
        _playBattleBgm.call(this);
    };

    // Graphics.transition(20, "Graphics/System/BattleStart", 20): the map as it
    // stood goes black where the image is darkest first. The battle's
    // background is the map without its characters, as VX snapped it.
    function WipeSprite() { this.initialize(...arguments); }
    WipeSprite.prototype = Object.create(Sprite.prototype);
    WipeSprite.prototype.constructor = WipeSprite;
    WipeSprite.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this, new Bitmap(Graphics.width, Graphics.height));
        this._rule = ImageManager.loadSystem(WIPE_IMAGE);
        this._levels = null;
        this._frame = 0;
    };
    WipeSprite.prototype.levels = function() {
        if (this._levels || !this._rule.isReady() || !this._rule.width) return this._levels;
        const w = Graphics.width, h = Graphics.height;
        const scaled = new Bitmap(w, h);
        scaled.blt(this._rule, 0, 0, this._rule.width, this._rule.height, 0, 0, w, h);
        const data = scaled.context.getImageData(0, 0, w, h).data;
        scaled.destroy();
        this._levels = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) this._levels[i] = data[i * 4] / 255;
        return this._levels;
    };
    /** Draws the wipe at a progress 0..1 (1: all black). */
    WipeSprite.prototype.draw = function(progress) {
        const w = Graphics.width, h = Graphics.height, ctx = this.bitmap.context;
        const levels = this.levels();
        if (!levels) {
            this.bitmap.clear();
            this.bitmap.paintOpacity = Math.round(255 * progress);
            this.bitmap.fillAll('black');
            this.bitmap.paintOpacity = 255;
            return;
        }
        const image = ctx.createImageData(w, h), out = image.data, vague = WIPE_VAGUE / 256;
        for (let i = 0; i < levels.length; i++) {
            const a = 1 - Math.min(1, Math.max(0, (levels[i] - progress) / vague));
            out[i * 4 + 3] = Math.round(a * 255);
        }
        ctx.putImageData(image, 0, 0);
        this.bitmap._baseTexture.update();
    };

    Scene_Map.prototype.startEncounterEffect = function() {
        // The battle's background leaves the characters out; the wipe starts
        // from the screen as it stood, characters and all.
        const shown = (this._spriteset._characterSprites || []).filter(sprite => sprite.visible);
        for (const sprite of shown) sprite.visible = false;
        this.snapForBattleBackground();
        for (const sprite of shown) sprite.visible = true;
        this._rrThrallWipe = new WipeSprite();
        this.addChild(this._rrThrallWipe);
        this._rrThrallWipe.draw(0);
        this._encounterEffectDuration = WIPE_DURATION;
    };
    Scene_Map.prototype.updateEncounterEffect = function() {
        if (this._encounterEffectDuration > 0) {
            this._encounterEffectDuration--;
            const progress = (WIPE_DURATION - this._encounterEffectDuration) / WIPE_DURATION;
            if (this._rrThrallWipe) this._rrThrallWipe.draw(progress);
        }
    };
})();
