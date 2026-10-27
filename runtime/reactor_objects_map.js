//=============================================================================
// reactor_objects_map.js v1.7.0
//=============================================================================
// Game_Map, Game_CommonEvent, Game_CharacterBase, Game_Character, Game_Player, Game_Follower, Game_Followers, Game_Vehicle and Game_Event.
// Part of reactor_objects.js; loads after reactor_objects_battlers.js.

//-----------------------------------------------------------------------------
// Game_Map
//
// The game object class for a map. It contains scrolling and passage
// determination functions.

function Game_Map() {
    this.initialize(...arguments);
}

Game_Map.prototype.initialize = function() {
    this._interpreter = new Game_Interpreter();
    this._mapId = 0;
    this._tilesetId = 0;
    this._events = [];
    this._commonEvents = [];
    this._vehicles = [];
    this._displayX = 0;
    this._displayY = 0;
    this._nameDisplay = true;
    this._scrollDirection = 2;
    this._scrollRest = 0;
    this._scrollSpeed = 4;
    this._parallaxName = "";
    this._parallaxZero = false;
    this._parallaxLoopX = false;
    this._parallaxLoopY = false;
    this._parallaxSx = 0;
    this._parallaxSy = 0;
    this._parallaxX = 0;
    this._parallaxY = 0;
    this._battleback1Name = null;
    this._battleback2Name = null;
    this.createVehicles();
};

Game_Map.prototype.setup = function(mapId) {
    if (!$dataMap) {
        throw new Error("The map data is not available");
    }
    this._mapId = mapId;
    this._tilesetId = $dataMap.tilesetId;
    this._displayX = 0;
    this._displayY = 0;
    this.refereshVehicles();
    this.setupEvents();
    this.setupScroll();
    this.setupParallax();
    this.setupBattleback();
    this._needsRefresh = false;
};

Game_Map.prototype.isEventRunning = function() {
    return this._interpreter.isRunning() || this.isAnyEventStarting();
};

Game_Map.prototype.tileWidth = function() {
    if ("tileSize" in $dataSystem) {
        return $dataSystem.tileSize;
    } else {
        return 48;
    }
};

Game_Map.prototype.tileHeight = function() {
    return this.tileWidth();
};

Game_Map.prototype.bushDepth = function() {
    return this.tileHeight() / 4;
};

Game_Map.prototype.mapId = function() {
    return this._mapId;
};

Game_Map.prototype.tilesetId = function() {
    return this._tilesetId;
};

Game_Map.prototype.displayX = function() {
    return this._displayX;
};

Game_Map.prototype.displayY = function() {
    return this._displayY;
};

Game_Map.prototype.parallaxName = function() {
    return this._parallaxName;
};

Game_Map.prototype.battleback1Name = function() {
    return this._battleback1Name;
};

Game_Map.prototype.battleback2Name = function() {
    return this._battleback2Name;
};

Game_Map.prototype.requestRefresh = function() {
    this._needsRefresh = true;
};

Game_Map.prototype.isNameDisplayEnabled = function() {
    return this._nameDisplay;
};

Game_Map.prototype.disableNameDisplay = function() {
    this._nameDisplay = false;
};

Game_Map.prototype.enableNameDisplay = function() {
    this._nameDisplay = true;
};

Game_Map.prototype.createVehicles = function() {
    this._vehicles = [];
    this._vehicles[0] = new Game_Vehicle("boat");
    this._vehicles[1] = new Game_Vehicle("ship");
    this._vehicles[2] = new Game_Vehicle("airship");
};

Game_Map.prototype.refereshVehicles = function() {
    for (const vehicle of this._vehicles) {
        vehicle.refresh();
    }
};

Game_Map.prototype.vehicles = function() {
    return this._vehicles;
};

Game_Map.prototype.vehicle = function(type) {
    if (type === 0 || type === "boat") {
        return this.boat();
    } else if (type === 1 || type === "ship") {
        return this.ship();
    } else if (type === 2 || type === "airship") {
        return this.airship();
    } else {
        return null;
    }
};

Game_Map.prototype.boat = function() {
    return this._vehicles[0];
};

Game_Map.prototype.ship = function() {
    return this._vehicles[1];
};

Game_Map.prototype.airship = function() {
    return this._vehicles[2];
};

Game_Map.prototype.setupEvents = function() {
    // An imported 2000/2003 game keeps its parallel common events running through a teleport, as the
    // old engines do (EasyRPG builds them once per game): Deep 8's victory event teleports home from
    // inside a parallel event that turns its own switch off afterwards, and a rebuilt one restarted the
    // whole victory screen on the world map. System.json rrLegacyEventOrder.
    const keep = $dataSystem && $dataSystem.rrLegacyEventOrder && this._commonEvents ? new Map(this._commonEvents.map(c => [c._commonEventId, c])) : null;
    this._events = [];
    this._commonEvents = [];
    this.refreshCommonEventTriggerCache();
    for (const event of $dataMap.events.filter(event => !!event)) {
        this._events[event.id] = new Game_Event(this._mapId, event.id);
    }
    for (const commonEvent of this.parallelCommonEvents()) {
        this._commonEvents.push((keep && keep.get(commonEvent.id)) || new Game_CommonEvent(commonEvent.id));
    }
    this.refreshTileEvents();
};

Game_Map.prototype.refreshCommonEventTriggerCache = function() {
    this._commonEventTriggerSource = $dataCommonEvents;
    this._autorunCommonEvents = [];
    this._parallelCommonEvents = [];
    for (const commonEvent of $dataCommonEvents) {
        if (!commonEvent) continue;
        if (commonEvent.trigger === 1) this._autorunCommonEvents.push(commonEvent);
        if (commonEvent.trigger === 2) this._parallelCommonEvents.push(commonEvent);
    }
};

// The live event list, rebuilt at most once a frame.
//
// `_events` is indexed by event id, and model props stand in the map as
// synthetic events from id 10000 up (Reactor3D.PROP_EVENT_BASE), so on a
// map with props the array is ten thousand slots long and almost entirely
// holes. Stock MZ filters it on every call — and `isEventRunning`,
// `isAnyEventStarting`, `canMove`, `setupStartingMapEvent`, the 3D sync
// and every plugin that asks call it hundreds of times a frame. On the
// Demo's start map that was 5 ms of the frame walking holes. The memo
// lives in a WeakMap rather than on the map object, so JsonEx never
// serializes a second copy of every event into a save. It is keyed on the
// array, its length and the frame counter: a spawner that assigns into an
// existing hole mid-frame is seen from the next frame on.
const reactorEventLists = new WeakMap();
Game_Map.prototype.events = function() {
    const events = this._events;
    if (!events) return [];
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : -1;
    const memo = reactorEventLists.get(events);
    if (memo && memo.length === events.length && memo.frame === frame) return memo.list;
    const list = [];
    if (events.length > 512) {
        // Sparse: visit the slots that exist, in index order, not the holes.
        const keys = Object.keys(events);
        for (let i = 0; i < keys.length; i++) {
            const event = events[keys[i]];
            if (event) list.push(event);
        }
    } else {
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (event) list.push(event);
        }
    }
    reactorEventLists.set(events, { length: events.length, frame, list });
    return list;
};

/**
 * The live event list is made again on the next call: for code that puts an event into `_events` (or takes one
 * out) and asks for the list in the same frame. Spawn Unit followed by Start Battle on Map runs in one frame.
 */
Game_Map.prototype.refreshEventList = function() {
    if (this._events) reactorEventLists.delete(this._events);
};

Game_Map.prototype.event = function(eventId) {
    return this._events[eventId];
};

Game_Map.prototype.eraseEvent = function(eventId) {
    this._events[eventId].erase();
};

Game_Map.prototype.autorunCommonEvents = function() {
    if (this._commonEventTriggerSource !== $dataCommonEvents || !this._autorunCommonEvents) {
        this.refreshCommonEventTriggerCache();
    }
    return this._autorunCommonEvents;
};

Game_Map.prototype.parallelCommonEvents = function() {
    if (this._commonEventTriggerSource !== $dataCommonEvents || !this._parallelCommonEvents) {
        this.refreshCommonEventTriggerCache();
    }
    return this._parallelCommonEvents;
};

Game_Map.prototype.setupScroll = function() {
    this._scrollDirection = 2;
    this._scrollRest = 0;
    this._scrollSpeed = 4;
};

Game_Map.prototype.setupParallax = function() {
    this._parallaxName = $dataMap.parallaxName || "";
    this._parallaxZero = ImageManager.isZeroParallax(this._parallaxName);
    this._parallaxLoopX = $dataMap.parallaxLoopX;
    this._parallaxLoopY = $dataMap.parallaxLoopY;
    this._parallaxSx = $dataMap.parallaxSx;
    this._parallaxSy = $dataMap.parallaxSy;
    this._parallaxX = 0;
    this._parallaxY = 0;
};

Game_Map.prototype.setupBattleback = function() {
    if ($dataMap.specifyBattleback) {
        this._battleback1Name = $dataMap.battleback1Name;
        this._battleback2Name = $dataMap.battleback2Name;
    } else {
        this._battleback1Name = null;
        this._battleback2Name = null;
    }
};

Game_Map.prototype.setDisplayPos = function(x, y) {
    if (this.isLoopHorizontal()) {
        this._displayX = x.mod(this.width());
        this._parallaxX = x;
    } else {
        const endX = this.width() - this.screenTileX();
        this._displayX = endX < 0 ? endX / 2 : x.clamp(0 - this.reactorEdgeReach("west"), endX + this.reactorEdgeReach("east"));
        this._parallaxX = this._displayX;
    }
    if (this.isLoopVertical()) {
        this._displayY = y.mod(this.height());
        this._parallaxY = y;
    } else {
        const endY = this.height() - this.screenTileY();
        this._displayY = endY < 0 ? endY / 2 : y.clamp(0 - this.reactorEdgeReach("north"), endY + this.reactorEdgeReach("south"));
        this._parallaxY = this._displayY;
    }
};

/**
 * How far the view of a 2D map may go past its edge on `side`, in tiles: half a screen where a neighboring map
 * lies past it (its ground is drawn there, Spriteset_Map.updateNeighborTilemaps), so the party keeps the middle of
 * the screen up to the border; none elsewhere, on a looping side, or on a 3D map (whose scene stands the neighbor).
 */
Game_Map.prototype.reactorEdgeReach = function(side) {
    // Worked out once a map (kept off the Game_Map, which is saved).
    const data = typeof $dataMap !== "undefined" ? $dataMap : null, known = Game_Map._rrEdgeSides || (Game_Map._rrEdgeSides = { map: undefined });
    if (known.map !== data) {
        known.map = data;
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null, infos = typeof $dataMapInfos !== "undefined" ? $dataMapInfos : null;
        const sides = data && R && R.Neighbors && R.neighborsOf && !(R.shouldRender3D && R.shouldRender3D(data)) ? R.neighborsOf(data) : {};
        for (const name of ["north", "east", "south", "west"]) known[name] = !!(sides[name] && infos && infos[sides[name].map]);
    }
    if (!known[side] || !(typeof Reactor3D !== "undefined" && Reactor3D.Neighbors && Reactor3D.Neighbors.enabled)) return 0;
    return Math.ceil((side === "west" || side === "east" ? this.screenTileX() : this.screenTileY()) / 2);
};

Game_Map.prototype.parallaxOx = function() {
    if (this._parallaxZero) {
        return this._parallaxX * this.tileWidth();
    } else if (this._parallaxLoopX) {
        return (this._parallaxX * this.tileWidth()) / 2;
    } else {
        return 0;
    }
};

Game_Map.prototype.parallaxOy = function() {
    if (this._parallaxZero) {
        return this._parallaxY * this.tileHeight();
    } else if (this._parallaxLoopY) {
        return (this._parallaxY * this.tileHeight()) / 2;
    } else {
        return 0;
    }
};

Game_Map.prototype.tileset = function() {
    return $dataTilesets[this._tilesetId];
};

Game_Map.prototype.tilesetFlags = function() {
    const tileset = this.tileset();
    if (tileset) {
        return tileset.flags;
    } else {
        return [];
    }
};

Game_Map.prototype.displayName = function() {
    return $dataMap.displayName;
};

Game_Map.prototype.width = function() {
    return $dataMap.width;
};

Game_Map.prototype.height = function() {
    return $dataMap.height;
};

Game_Map.prototype.data = function() {
    return $dataMap.data;
};

Game_Map.prototype.isLoopHorizontal = function() {
    return $dataMap.scrollType === 2 || $dataMap.scrollType === 3;
};

Game_Map.prototype.isLoopVertical = function() {
    return $dataMap.scrollType === 1 || $dataMap.scrollType === 3;
};

Game_Map.prototype.isDashDisabled = function() {
    return $dataMap.disableDashing;
};

Game_Map.prototype.encounterList = function() {
    return $dataMap.encounterList;
};

Game_Map.prototype.encounterStep = function() {
    return $dataMap.encounterStep;
};

Game_Map.prototype.isOverworld = function() {
    return this.tileset() && this.tileset().mode === 0;
};

// Default 2D camera framing is expressed in logical game pixels. A 3D map
// owns its projection and focus; these settings must not change its viewport.
Game_Map.prototype.reactorCameraZoom = function() {
    if (typeof Reactor3D !== "undefined" && Reactor3D.isMap3D?.($dataMap)) return 1;
    const zoom = Number($dataSystem?.advanced?.camera2DZoom);
    return Number.isFinite(zoom) ? Math.max(1, Math.min(8, zoom || 1)) : 1;
};

Game_Map.prototype.reactorCameraOffset = function(axis) {
    if (typeof Reactor3D !== "undefined" && Reactor3D.isMap3D?.($dataMap)) return 0;
    const value = Number($dataSystem?.advanced?.[axis === "x" ? "camera2DOffsetX" : "camera2DOffsetY"]);
    return Number.isFinite(value) ? value : 0;
};

// Undo the existing event screen zoom/shake before undoing the map camera.
// This is the inverse of Spriteset_Base + the map's _baseSprite transform.
Game_Map.prototype.reactorCanvasToWorld = function(value, axis) {
    const cameraZoom = this.reactorCameraZoom();
    // Leave the legacy input contract intact when this camera is off; some
    // imported projects already implement their own screen-zoom picking.
    if (cameraZoom === 1 && this.reactorCameraOffset("x") === 0 && this.reactorCameraOffset("y") === 0) return value;
    const screen = typeof $gameScreen !== "undefined" ? $gameScreen : null;
    const zoom = screen?.zoomScale() || 1;
    const pivot = screen ? (axis === "x" ? screen.zoomX() : screen.zoomY()) : 0;
    const shift = Math.round(-pivot * (zoom - 1))
        + (axis === "x" && screen ? Math.round(screen.shake()) : 0);
    return (value - shift) / zoom / cameraZoom;
};

Game_Map.prototype.screenTileX = function() {
    const zoom = this.reactorCameraZoom();
    return zoom === 1 ? Math.round((Graphics.width / this.tileWidth()) * 16) / 16
        : Graphics.width / this.tileWidth() / zoom;
};

Game_Map.prototype.screenTileY = function() {
    const zoom = this.reactorCameraZoom();
    return zoom === 1 ? Math.round((Graphics.height / this.tileHeight()) * 16) / 16
        : Graphics.height / this.tileHeight() / zoom;
};

Game_Map.prototype.adjustX = function(x) {
    if (
        this.isLoopHorizontal() &&
        x < this._displayX - (this.width() - this.screenTileX()) / 2
    ) {
        return x - this._displayX + $dataMap.width;
    } else {
        return x - this._displayX;
    }
};

Game_Map.prototype.adjustY = function(y) {
    if (
        this.isLoopVertical() &&
        y < this._displayY - (this.height() - this.screenTileY()) / 2
    ) {
        return y - this._displayY + $dataMap.height;
    } else {
        return y - this._displayY;
    }
};

Game_Map.prototype.roundX = function(x) {
    return this.isLoopHorizontal() ? x.mod(this.width()) : x;
};

Game_Map.prototype.roundY = function(y) {
    return this.isLoopVertical() ? y.mod(this.height()) : y;
};

Game_Map.prototype.xWithDirection = function(x, d) {
    return x + (d === 6 ? 1 : d === 4 ? -1 : 0);
};

Game_Map.prototype.yWithDirection = function(y, d) {
    return y + (d === 2 ? 1 : d === 8 ? -1 : 0);
};

Game_Map.prototype.roundXWithDirection = function(x, d) {
    return this.roundX(x + (d === 6 ? 1 : d === 4 ? -1 : 0));
};

Game_Map.prototype.roundYWithDirection = function(y, d) {
    return this.roundY(y + (d === 2 ? 1 : d === 8 ? -1 : 0));
};

Game_Map.prototype.deltaX = function(x1, x2) {
    let result = x1 - x2;
    if (this.isLoopHorizontal() && Math.abs(result) > this.width() / 2) {
        if (result < 0) {
            result += this.width();
        } else {
            result -= this.width();
        }
    }
    return result;
};

Game_Map.prototype.deltaY = function(y1, y2) {
    let result = y1 - y2;
    if (this.isLoopVertical() && Math.abs(result) > this.height() / 2) {
        if (result < 0) {
            result += this.height();
        } else {
            result -= this.height();
        }
    }
    return result;
};

Game_Map.prototype.distance = function(x1, y1, x2, y2) {
    return Math.abs(this.deltaX(x1, x2)) + Math.abs(this.deltaY(y1, y2));
};

Game_Map.prototype.canvasToMapX = function(x) {
    const tileWidth = this.tileWidth();
    const originX = this._displayX * tileWidth;
    const mapX = Math.floor((originX + this.reactorCanvasToWorld(x, "x")) / tileWidth);
    return this.roundX(mapX);
};

Game_Map.prototype.canvasToMapY = function(y) {
    const tileHeight = this.tileHeight();
    const originY = this._displayY * tileHeight;
    const mapY = Math.floor((originY + this.reactorCanvasToWorld(y, "y")) / tileHeight);
    return this.roundY(mapY);
};

Game_Map.prototype.autoplay = function() {
    if ($dataMap.autoplayBgm) {
        if ($gamePlayer.isInVehicle()) {
            $gameSystem.saveWalkingBgm2();
        } else {
            AudioManager.playBgm(AudioManager.mapBgmObject($dataMap, this.mapId()));
        }
    }
    if ($dataMap.autoplayBgs) {
        AudioManager.playBgs($dataMap.bgs);
    }
};

Game_Map.prototype.refreshIfNeeded = function() {
    if (this._needsRefresh) {
        this.refresh();
    }
};

Game_Map.prototype.refresh = function() {
    for (const event of this.events()) {
        event.refresh();
    }
    for (const commonEvent of this._commonEvents) {
        commonEvent.refresh();
    }
    this.refreshTileEvents();
    this._needsRefresh = false;
};

Game_Map.prototype.refreshTileEvents = function() {
    this._tileEvents = this.events().filter(event => event.isTile());
};

Game_Map.prototype.eventsXy = function(x, y) {
    return this.events().filter(event => event.pos(x, y));
};

Game_Map.prototype.eventsXyNt = function(x, y) {
    return this.events().filter(event => event.posNt(x, y));
};

Game_Map.prototype.tileEventsXy = function(x, y) {
    return this._tileEvents.filter(event => event.posNt(x, y));
};

Game_Map.prototype.eventIdXy = function(x, y) {
    const list = this.eventsXy(x, y);
    return list.length === 0 ? 0 : list[0].eventId();
};

Game_Map.prototype.scrollDown = function(distance) {
    if (this.isLoopVertical()) {
        this._displayY += distance;
        this._displayY %= $dataMap.height;
        if (this._parallaxLoopY) {
            this._parallaxY += distance;
        }
    } else if (this.height() >= this.screenTileY()) {
        const lastY = this._displayY;
        this._displayY = Math.min(
            this._displayY + distance,
            this.height() - this.screenTileY() + this.reactorEdgeReach("south")
        );
        this._parallaxY += this._displayY - lastY;
    }
};

Game_Map.prototype.scrollLeft = function(distance) {
    if (this.isLoopHorizontal()) {
        this._displayX += $dataMap.width - distance;
        this._displayX %= $dataMap.width;
        if (this._parallaxLoopX) {
            this._parallaxX -= distance;
        }
    } else if (this.width() >= this.screenTileX()) {
        const lastX = this._displayX;
        this._displayX = Math.max(this._displayX - distance, 0 - this.reactorEdgeReach("west"));
        this._parallaxX += this._displayX - lastX;
    }
};

Game_Map.prototype.scrollRight = function(distance) {
    if (this.isLoopHorizontal()) {
        this._displayX += distance;
        this._displayX %= $dataMap.width;
        if (this._parallaxLoopX) {
            this._parallaxX += distance;
        }
    } else if (this.width() >= this.screenTileX()) {
        const lastX = this._displayX;
        this._displayX = Math.min(
            this._displayX + distance,
            this.width() - this.screenTileX() + this.reactorEdgeReach("east")
        );
        this._parallaxX += this._displayX - lastX;
    }
};

Game_Map.prototype.scrollUp = function(distance) {
    if (this.isLoopVertical()) {
        this._displayY += $dataMap.height - distance;
        this._displayY %= $dataMap.height;
        if (this._parallaxLoopY) {
            this._parallaxY -= distance;
        }
    } else if (this.height() >= this.screenTileY()) {
        const lastY = this._displayY;
        this._displayY = Math.max(this._displayY - distance, 0 - this.reactorEdgeReach("north"));
        this._parallaxY += this._displayY - lastY;
    }
};

Game_Map.prototype.isValid = function(x, y) {
    return x >= 0 && x < this.width() && y >= 0 && y < this.height();
};

Game_Map.prototype.checkPassage = function(x, y, bit) {
    const flags = this.tilesetFlags();
    const tiles = this.allTiles(x, y);
    for (const tile of tiles) {
        // Tile 0 is no tile: it never decides passage, whatever a tileset written without the
        // star on it (flags[0] = 0) says. RPG Maker writes 16 there, which reads the same.
        if (tile === 0) continue;
        const flag = flags[tile];
        if ((flag & 0x10) !== 0) {
            // [*] No effect on passage
            continue;
        }
        if ((flag & bit) === 0) {
            // [o] Passable
            return true;
        }
        if ((flag & bit) === bit) {
            // [x] Impassable
            return false;
        }
    }
    return false;
};

Game_Map.prototype.tileId = function(x, y, z) {
    const width = $dataMap.width;
    const height = $dataMap.height;
    return $dataMap.data[(z * height + y) * width + x] || 0;
};

Game_Map.prototype.layeredTiles = function(x, y) {
    const tiles = [];
    for (let i = 0; i < 4; i++) {
        tiles.push(this.tileId(x, y, 3 - i));
    }
    return tiles;
};

Game_Map.prototype.allTiles = function(x, y) {
    const tiles = this.tileEventsXy(x, y).map(event => event.tileId());
    return tiles.concat(this.layeredTiles(x, y));
};

Game_Map.prototype.autotileType = function(x, y, z) {
    const tileId = this.tileId(x, y, z);
    return tileId >= 2048 ? Math.floor((tileId - 2048) / 48) : -1;
};

Game_Map.prototype.isPassable = function(x, y, d) {
    return this.checkPassage(x, y, (1 << (d / 2 - 1)) & 0x0f);
};

Game_Map.prototype.isBoatPassable = function(x, y) {
    return this.checkPassage(x, y, 0x0200);
};

Game_Map.prototype.isShipPassable = function(x, y) {
    return this.checkPassage(x, y, 0x0400);
};

Game_Map.prototype.isAirshipLandOk = function(x, y) {
    return this.checkPassage(x, y, 0x0800) && this.checkPassage(x, y, 0x0f);
};

Game_Map.prototype.checkLayeredTilesFlags = function(x, y, bit) {
    const flags = this.tilesetFlags();
    return this.layeredTiles(x, y).some(tileId => (flags[tileId] & bit) !== 0);
};

Game_Map.prototype.isLadder = function(x, y) {
    return this.isValid(x, y) && this.checkLayeredTilesFlags(x, y, 0x20);
};

Game_Map.prototype.isBush = function(x, y) {
    return this.isValid(x, y) && this.checkLayeredTilesFlags(x, y, 0x40);
};

Game_Map.prototype.isCounter = function(x, y) {
    return this.isValid(x, y) && this.checkLayeredTilesFlags(x, y, 0x80);
};

Game_Map.prototype.isDamageFloor = function(x, y) {
    return this.isValid(x, y) && this.checkLayeredTilesFlags(x, y, 0x100);
};

Game_Map.prototype.terrainTag = function(x, y) {
    if (this.isValid(x, y)) {
        const flags = this.tilesetFlags();
        const tiles = this.layeredTiles(x, y);
        for (const tile of tiles) {
            const tag = flags[tile] >> 12;
            if (tag > 0) {
                return tag;
            }
        }
    }
    return 0;
};

Game_Map.prototype.regionId = function(x, y) {
    return this.isValid(x, y) ? this.tileId(x, y, 5) : 0;
};

Game_Map.prototype.startScroll = function(direction, distance, speed) {
    this._scrollDirection = direction;
    this._scrollRest = distance;
    this._scrollSpeed = speed;
};

Game_Map.prototype.isScrolling = function() {
    return this._scrollRest > 0;
};

Game_Map.prototype.update = function(sceneActive) {
    this.refreshIfNeeded();
    if (sceneActive) {
        this.updateInterpreter();
    }
    this.updateScroll();
    this.updateEvents();
    this.updateVehicles();
    this.updateParallax();
};

Game_Map.prototype.updateScroll = function() {
    if (this.isScrolling()) {
        const lastX = this._displayX;
        const lastY = this._displayY;
        this.doScroll(this._scrollDirection, this.scrollDistance());
        if (this._displayX === lastX && this._displayY === lastY) {
            this._scrollRest = 0;
        } else {
            this._scrollRest -= this.scrollDistance();
        }
    }
};

Game_Map.prototype.scrollDistance = function() {
    return Math.pow(2, this._scrollSpeed) / 256;
};

Game_Map.prototype.doScroll = function(direction, distance) {
    switch (direction) {
        case 2:
            this.scrollDown(distance);
            break;
        case 4:
            this.scrollLeft(distance);
            break;
        case 6:
            this.scrollRight(distance);
            break;
        case 8:
            this.scrollUp(distance);
            break;
    }
};

// RPG Maker 2000/2003 run parallel common events before map events (System.json rrLegacyEventOrder,
// set by the importer): when both write the same screen text or picture, the map event's lands last.
Game_Map.prototype.updateEvents = function() {
    const commonFirst = $dataSystem && $dataSystem.rrLegacyEventOrder;
    if (commonFirst) for (const commonEvent of this._commonEvents) commonEvent.update();
    for (const event of this.events()) {
        event.update();
    }
    if (!commonFirst) for (const commonEvent of this._commonEvents) commonEvent.update();
};

Game_Map.prototype.updateVehicles = function() {
    for (const vehicle of this._vehicles) {
        vehicle.update();
    }
};

Game_Map.prototype.updateParallax = function() {
    if (this._parallaxLoopX) {
        this._parallaxX += this._parallaxSx / this.tileWidth() / 2;
    }
    if (this._parallaxLoopY) {
        this._parallaxY += this._parallaxSy / this.tileHeight() / 2;
    }
};

Game_Map.prototype.changeTileset = function(tilesetId) {
    this._tilesetId = tilesetId;
    this.refresh();
};

Game_Map.prototype.changeBattleback = function(
    battleback1Name,
    battleback2Name
) {
    this._battleback1Name = battleback1Name;
    this._battleback2Name = battleback2Name;
};

Game_Map.prototype.changeParallax = function(name, loopX, loopY, sx, sy) {
    this._parallaxName = name;
    this._parallaxZero = ImageManager.isZeroParallax(this._parallaxName);
    if (this._parallaxLoopX && !loopX) {
        this._parallaxX = 0;
    }
    if (this._parallaxLoopY && !loopY) {
        this._parallaxY = 0;
    }
    this._parallaxLoopX = loopX;
    this._parallaxLoopY = loopY;
    this._parallaxSx = sx;
    this._parallaxSy = sy;
};

Game_Map.prototype.updateInterpreter = function() {
    for (;;) {
        this._interpreter.update();
        if (this._interpreter.isRunning()) {
            return;
        }
        if (this._interpreter.eventId() > 0) {
            this.unlockEvent(this._interpreter.eventId());
            this._interpreter.clear();
        }
        if (!this.setupStartingEvent()) {
            return;
        }
    }
};

Game_Map.prototype.unlockEvent = function(eventId) {
    if (this._events[eventId]) {
        this._events[eventId].unlock();
    }
};

Game_Map.prototype.setupStartingEvent = function() {
    this.refreshIfNeeded();
    if (this._interpreter.setupReservedCommonEvent()) {
        return true;
    }
    if (this.setupTestEvent()) {
        return true;
    }
    if (this.setupStartingMapEvent()) {
        return true;
    }
    if (this.setupAutorunCommonEvent()) {
        return true;
    }
    return false;
};

Game_Map.prototype.setupTestEvent = function() {
    if (window.$testEvent) {
        this._interpreter.setup($testEvent, 0);
        $testEvent = null;
        return true;
    }
    return false;
};

Game_Map.prototype.setupStartingMapEvent = function() {
    for (const event of this.events()) {
        if (event.isStarting()) {
            event.clearStartingFlag();
            this._interpreter.setup(event.list(), event.eventId());
            return true;
        }
    }
    return false;
};

Game_Map.prototype.setupAutorunCommonEvent = function() {
    for (const commonEvent of this.autorunCommonEvents()) {
        if (commonEvent.switchId === 0 || $gameSwitches.value(commonEvent.switchId)) {
            this._interpreter.setup(commonEvent.list);
            return true;
        }
    }
    return false;
};

Game_Map.prototype.isAnyEventStarting = function() {
    return this.events().some(event => event.isStarting());
};

//-----------------------------------------------------------------------------
// Game_CommonEvent
//
// The game object class for a common event. It contains functionality for
// running parallel process events.

function Game_CommonEvent() {
    this.initialize(...arguments);
}

Game_CommonEvent.prototype.initialize = function(commonEventId) {
    this._commonEventId = commonEventId;
    this.refresh();
};

Game_CommonEvent.prototype.event = function() {
    return $dataCommonEvents[this._commonEventId];
};

Game_CommonEvent.prototype.list = function() {
    return this.event().list;
};

// An imported 2000/2003 parallel event pauses while its switch is off and carries on from the same
// command when it is on again (EasyRPG keeps one interpreter per common event); MZ discards it and
// starts over. Deep 8's menu cursor bobs +4 then -4 in a parallel event its menu switches off during
// each move: restarted, the +4 stuck and the cursor crept 4 px further off per step.
// System.json rrLegacyEventOrder.
Game_CommonEvent.prototype.refresh = function() {
    if (this.isActive()) {
        if (!this._interpreter) {
            this._interpreter = new Game_Interpreter();
        }
    } else if (!($dataSystem && $dataSystem.rrLegacyEventOrder)) {
        this._interpreter = null;
    }
};

// Switch 0 is no switch at all: an RPG Maker 2000/2003 common event can run in parallel (or
// automatically) with no condition, which only an import writes; the MZ editor always names one.
Game_CommonEvent.prototype.isActive = function() {
    const event = this.event();
    return event.trigger === 2 && (event.switchId === 0 || $gameSwitches.value(event.switchId));
};

Game_CommonEvent.prototype.update = function() {
    if (this._interpreter && this.isActive()) {
        if (!this._interpreter.isRunning()) {
            this._interpreter.setup(this.list());
        }
        this._interpreter.update();
    }
};

//-----------------------------------------------------------------------------
// Game_CharacterBase
//
// The superclass of Game_Character. It handles basic information, such as
// coordinates and images, shared by all characters.

function Game_CharacterBase() {
    this.initialize(...arguments);
}

Object.defineProperties(Game_CharacterBase.prototype, {
    x: {
        get: function() {
            return this._x;
        },
        configurable: true
    },
    y: {
        get: function() {
            return this._y;
        },
        configurable: true
    }
});

Game_CharacterBase.prototype.initialize = function() {
    this.initMembers();
};

Game_CharacterBase.prototype.initMembers = function() {
    this._x = 0;
    this._y = 0;
    this._realX = 0;
    this._realY = 0;
    this._moveSpeed = 4;
    this._moveFrequency = 6;
    this._opacity = 255;
    this._blendMode = 0;
    this._direction = 2;
    this._pattern = 1;
    this._priorityType = 1;
    this._tileId = 0;
    this._characterName = "";
    this._characterIndex = 0;
    this._isObjectCharacter = false;
    this._walkAnime = true;
    this._stepAnime = false;
    this._directionFix = false;
    this._through = false;
    this._transparent = false;
    this._bushDepth = 0;
    this._animationId = 0;
    this._balloonId = 0;
    this._animationPlaying = false;
    this._balloonPlaying = false;
    this._animationCount = 0;
    this._stopCount = 0;
    this._jumpCount = 0;
    this._jumpPeak = 0;
    this._movementSuccess = true;
    // The fields the engine gives a character later, declared now in one order (undefined, so a save does not hold them).
    // A name the character already answers, its own or from a prototype (a plugin's default), is left as it is.
    if (Game_CharacterBase.evenShapes) {
        const late = Game_CharacterBase.LATE_FIELDS;
        for (let i = 0; i < late.length; i++) if (!(late[i] in this)) this[late[i]] = undefined;
    }
};

/**
 * One shape per kind of character. Fields the engine adds as play goes on
 * (the physics' air and ground, a model's yaw, a staged unit's place)
 * arrived in a different order on each character, so the game's characters
 * stood in fifteen hidden classes, every read of `_realX` across them was a
 * lookup that made a new number, and a walk on North Haven made 100 KB more
 * garbage a frame. `LATE_FIELDS` are declared, undefined, when a character
 * is made; a game loaded from a save has its characters rebuilt in one
 * order per kind (`DataManager.extractSaveContents`). Undefined fields are
 * not written to a save: saves are as before. `evenShapes = false` leaves
 * the shapes as they come.
 */
Game_CharacterBase.evenShapes = true;
Game_CharacterBase.LATE_FIELDS = [
    "_interpreter",
    "_reactorGround", "_reactorAir", "_reactorVz", "_reactorAlt", "_reactorPeak", "_reactorSwim", "_reactorLeap", "_reactorClimb",
    "_reactorOnLadder", "_reactorDive", "_reactorFloat", "_reactorRiding", "_reactorMantle", "_reactorGrapple", "_reactorStepDown", "_reactorStepUp",
    "_reactorJumped", "_reactorDir8", "_reactorWalk", "_reactorTurnStamp", "_reactorModelYaw", "_reactorModelYawAt", "_reactorLift",
    "_reactorChaseLater", "_reactorPosePitch", "_reactorFallYaw", "_reactorPush", "_reactorPushAlso", "_reactorPushDir",
    "_reactorPushFrames", "_reactorDriftX", "_reactorDriftY", "_rrSpin", "_rrSpinCount", "_rrVehicle", "_rrHome", "_rrYaw",
    "_rrStage", "_rrFade", "_rrDrop", "_rrVehicleTransfer", "_borderArrival", "_destinationCheckCounter",
    "_reactorSpin", "_rrMirror", "_rrFlip", "_rrSpinPivot", "_rrPageImage"
];

/**
 * Characters restored from a save, rebuilt so each kind has one shape: the
 * fields in the order the fullest of its kind holds them, then the declared
 * ones none of them holds yet. Each keeps exactly its own fields (a plugin's
 * included, accessors and hidden ones through their descriptors) plus the
 * declared ones its prototype does not answer, as a new character has them.
 * Anything not a character, or not extensible, is left out. Returns a map
 * from each to its rebuilt self.
 */
Game_CharacterBase.evenOut = function(characters) {
    const kinds = new Map(), rebuilt = new Map(), taken = new Set();
    const own = Object.prototype.hasOwnProperty, late = new Set(this.LATE_FIELDS);
    for (const character of characters) {
        if (!(character instanceof Game_CharacterBase) || !Object.isExtensible(character) || taken.has(character)) continue;
        taken.add(character);
        const proto = Object.getPrototypeOf(character), list = kinds.get(proto);
        if (list) list.push(character); else kinds.set(proto, [character]);
    }
    // A name the prototype chain holds as an accessor or a read-only field is not assigned (that would call it or fail).
    const assignable = (proto, key) => {
        for (let p = proto; p; p = Object.getPrototypeOf(p)) {
            const d = Object.getOwnPropertyDescriptor(p, key);
            if (d) return "value" in d && d.writable;
        }
        return true;
    };
    for (const [proto, list] of kinds) {
        const order = [], seen = new Set();
        const fullest = list.slice().sort((a, b) => Object.keys(b).length - Object.keys(a).length);
        for (const character of fullest) for (const key of Object.keys(character)) if (!seen.has(key)) { seen.add(key); order.push(key); }
        for (const key of this.LATE_FIELDS) if (!seen.has(key)) { seen.add(key); order.push(key); }
        const plain = new Set(order.filter(key => assignable(proto, key)));
        for (const character of list) {
            const even = Object.create(proto);
            for (const key of order) {
                if (own.call(character, key)) {
                    const d = Object.getOwnPropertyDescriptor(character, key);
                    if (plain.has(key) && "value" in d && d.writable && d.enumerable && d.configurable) even[key] = d.value;
                    else Object.defineProperty(even, key, d);
                } else if (late.has(key) && !(key in proto)) {
                    even[key] = undefined;
                }
            }
            for (const key of Reflect.ownKeys(character)) {
                if (!own.call(even, key)) Object.defineProperty(even, key, Object.getOwnPropertyDescriptor(character, key));
            }
            rebuilt.set(character, even);
        }
    }
    return rebuilt;
};

Game_CharacterBase.prototype.pos = function(x, y) {
    return this._x === x && this._y === y;
};

Game_CharacterBase.prototype.posNt = function(x, y) {
    // No through
    return this.pos(x, y) && !this.isThrough();
};

Game_CharacterBase.prototype.moveSpeed = function() {
    return this._moveSpeed;
};

Game_CharacterBase.prototype.setMoveSpeed = function(moveSpeed) {
    this._moveSpeed = moveSpeed;
};

Game_CharacterBase.prototype.moveFrequency = function() {
    return this._moveFrequency;
};

Game_CharacterBase.prototype.setMoveFrequency = function(moveFrequency) {
    this._moveFrequency = moveFrequency;
};

Game_CharacterBase.prototype.opacity = function() {
    return this._opacity;
};

Game_CharacterBase.prototype.setOpacity = function(opacity) {
    this._opacity = opacity;
};

Game_CharacterBase.prototype.blendMode = function() {
    return this._blendMode;
};

Game_CharacterBase.prototype.setBlendMode = function(blendMode) {
    this._blendMode = blendMode;
};

/**
 * The drawn image's own turn, on top of the sheet: mirrored (it faces the
 * other way), flipped (upside down), and turned by any angle about its feet
 * or its middle. Held on the character, so a save keeps it; a field never
 * set stays undefined and is not written, so a plain MZ game saves as before.
 * Sprite_Character (and a 3D map's billboard) draws it; the sheet is untouched.
 * With Sprite Transforms off in Database > Reactor Features (a plugin turns
 * characters), none of these does anything: a route's Mirror, Flip and Rotate
 * steps and a page's Image options are passed over, as RPG Maker MZ would.
 */
Game_CharacterBase.rrTransformsOn = function() {
    return typeof ReactorFeatures === "undefined" || ReactorFeatures.on("spriteTransforms");
};
Game_CharacterBase.prototype.reactorMirror = function(on) {
    if (!Game_CharacterBase.rrTransformsOn()) return;
    this._rrMirror = on ? true : undefined;
};
Game_CharacterBase.prototype.reactorFlip = function(on) {
    if (!Game_CharacterBase.rrTransformsOn()) return;
    this._rrFlip = on ? true : undefined;
};
/** Turn the drawn character to `degrees` clockwise; 0 stands it straight. `pivot` "center" turns it in place about its middle, else about its feet. */
Game_CharacterBase.prototype.reactorRotate = function(degrees, pivot) {
    if (!Game_CharacterBase.rrTransformsOn()) return;
    this._reactorSpin = Number(degrees) || 0;
    this._rrSpinPivot = pivot === "center" ? "center" : undefined;
};
/** Turn the drawn character on by `degrees` from where it stands now (a relative Rotate). */
Game_CharacterBase.prototype.reactorRotateBy = function(degrees, pivot) {
    const angle = ((this._reactorSpin || 0) + (Number(degrees) || 0)) % 360;
    this.reactorRotate(Math.round(angle * 100) / 100, pivot);
};
/** The image's turn as `{ mirror, flip, angle, pivot }`. */
Game_CharacterBase.prototype.reactorImage = function() {
    return { mirror: !!this._rrMirror, flip: !!this._rrFlip, angle: this._reactorSpin || 0, pivot: this._rrSpinPivot === "center" ? "center" : "feet" };
};
/** Set the whole turn at once (an event page's Image options); a missing image straightens it. */
Game_CharacterBase.prototype.reactorSetImage = function(image) {
    const img = image || {};
    this.reactorMirror(img.mirror);
    this.reactorFlip(img.flip);
    this.reactorRotate(img.angle, img.pivot);
};
/** Reset Image: not mirrored, not flipped, standing straight up (a Face Ceiling / Face Ground pose too). */
Game_CharacterBase.prototype.reactorResetImage = function() {
    this.reactorSetImage(null);
    if (this._reactorPosePitch) this._reactorPosePitch = 0;
    if (this._reactorFallYaw != null) this._reactorFallYaw = null;
};

Game_CharacterBase.prototype.isNormalPriority = function() {
    return this._priorityType === 1;
};

Game_CharacterBase.prototype.setPriorityType = function(priorityType) {
    this._priorityType = priorityType;
};

Game_CharacterBase.prototype.isMoving = function() {
    return this._realX !== this._x || this._realY !== this._y;
};

Game_CharacterBase.prototype.isJumping = function() {
    return this._jumpCount > 0;
};

Game_CharacterBase.prototype.jumpHeight = function() {
    return (
        (this._jumpPeak * this._jumpPeak -
            Math.pow(Math.abs(this._jumpCount - this._jumpPeak), 2)) /
        2
    );
};

Game_CharacterBase.prototype.isStopping = function() {
    return !this.isMoving() && !this.isJumping();
};

Game_CharacterBase.prototype.checkStop = function(threshold) {
    return this._stopCount > threshold;
};

Game_CharacterBase.prototype.resetStopCount = function() {
    this._stopCount = 0;
};

Game_CharacterBase.prototype.realMoveSpeed = function() {
    return this._moveSpeed + (this.isDashing() ? 1 : 0);
};

Game_CharacterBase.prototype.distancePerFrame = function() {
    return Math.pow(2, this.realMoveSpeed()) / 256;
};

Game_CharacterBase.prototype.isDashing = function() {
    return false;
};

Game_CharacterBase.prototype.isDebugThrough = function() {
    return false;
};

Game_CharacterBase.prototype.straighten = function() {
    if (this.hasWalkAnime() || this.hasStepAnime()) {
        this._pattern = 1;
    }
    this._animationCount = 0;
};

Game_CharacterBase.prototype.reverseDir = function(d) {
    return 10 - d;
};

Game_CharacterBase.prototype.canPass = function(x, y, d) {
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);
    if (!$gameMap.isValid(x2, y2)) {
        return false;
    }
    if (this.isThrough() || this.isDebugThrough()) {
        return true;
    }
    if (!this.isMapPassable(x, y, d)) {
        return false;
    }
    if (this.isCollidedWithCharacters(x2, y2)) {
        return false;
    }
    return true;
};

Game_CharacterBase.prototype.canPassDiagonally = function(x, y, horz, vert) {
    const x2 = $gameMap.roundXWithDirection(x, horz);
    const y2 = $gameMap.roundYWithDirection(y, vert);
    // On a 3D map a body is as wide as its cell, so a diagonal step crosses
    // both cells beside it: both have to be open, and nothing at the corner
    // they share may stand over the walker. A corner cut past a wall, a post
    // or a crate walked through it. The straight steps are still there to
    // take, so the walk goes round.
    if (typeof ReactorPhysics !== "undefined" && ReactorPhysics.squareCorners && ReactorPhysics.squareCorners(this)) {
        return !ReactorPhysics.cornerBlocks(this, x, y, horz, vert)
            && this.canPass(x, y, vert) && this.canPass(x, y2, horz)
            && this.canPass(x, y, horz) && this.canPass(x2, y, vert);
    }
    if (this.canPass(x, y, vert) && this.canPass(x, y2, horz)) {
        return true;
    }
    if (this.canPass(x, y, horz) && this.canPass(x2, y, vert)) {
        return true;
    }
    return false;
};

Game_CharacterBase.prototype.isMapPassable = function(x, y, d) {
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);
    const d2 = this.reverseDir(d);
    if (!($gameMap.isPassable(x, y, d) && $gameMap.isPassable(x2, y2, d2))) return false;
    // A 3D map's terrain can be too steep to climb between two cells the
    // tiles would otherwise allow.
    if (typeof Reactor3D !== "undefined" && Reactor3D.terrainBlocks && typeof $dataMap !== "undefined"
        && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap) && Reactor3D.terrainBlocks($dataMap, x, y, x2, y2, this._reactorGround)) return false;
    return true;
};

Game_CharacterBase.prototype.isCollidedWithCharacters = function(x, y) {
    return this.isCollidedWithEvents(x, y) || this.isCollidedWithVehicles(x, y);
};

Game_CharacterBase.prototype.isCollidedWithEvents = function(x, y) {
    // An event is in the way on every tile its body covers (its own tile, its
    // typed size, or the footprint of the model it stands as), within this
    // character's height.
    if (typeof Reactor3D !== "undefined" && Reactor3D.bodyBlocksTile) {
        return Reactor3D.bodyBlocksTile(this, x, y);
    }
    const events = $gameMap.eventsXyNt(x, y);
    return events.some(event => event.isNormalPriority());
};

Game_CharacterBase.prototype.isCollidedWithVehicles = function(x, y) {
    return $gameMap.boat().posNt(x, y) || $gameMap.ship().posNt(x, y);
};

Game_CharacterBase.prototype.setPosition = function(x, y) {
    this._x = Math.round(x);
    this._y = Math.round(y);
    this._realX = x;
    this._realY = y;
};

Game_CharacterBase.prototype.copyPosition = function(character) {
    this._x = character._x;
    this._y = character._y;
    this._realX = character._realX;
    this._realY = character._realY;
    this._direction = character._direction;
    // The same floor of the house, too.
    this._reactorGround = character._reactorGround;
};

Game_CharacterBase.prototype.locate = function(x, y) {
    // A placed character starts on the ground floor of whatever stands here.
    this._reactorGround = undefined;
    this.setPosition(x, y);
    this.straighten();
    this.refreshBushDepth();
};

Game_CharacterBase.prototype.direction = function() {
    return this._direction;
};

Game_CharacterBase.prototype._reactorCanFace = function(d) {
    return typeof Reactor3D === "undefined"
        || !Reactor3D.eventModelCanFace
        || typeof this.eventId !== "function"
        || !Reactor3D.characterModelSpec(this)
        || Reactor3D.eventModelCanFace(this, d);
};

Game_CharacterBase.prototype.setDirection = function(d) {
    if (!this.isDirectionFixed() && d && this._reactorCanFace(d)) {
        // A 3D model's mesh eases into the new facing over several frames;
        // the stamp lets its footprint cover the swing while it plays out.
        if (d !== this._direction && typeof Graphics !== "undefined") {
            this._reactorTurnStamp = Graphics.frameCount;
        }
        this._direction = d;
        this._reactorDir8 = d;
    }
    this.resetStopCount();
};

Game_CharacterBase.prototype.isTile = function() {
    return this._tileId > 0 && this._priorityType === 0;
};

Game_CharacterBase.prototype.isObjectCharacter = function() {
    return this._isObjectCharacter;
};

// How far a character stands above its tile's bottom edge. MZ lifts it 6 px; an imported game keeps
// its engine's own (System.json rrCharacterShiftY: 0 for 2000/2003 and XP, 4 for VX and VX Ace).
Game_CharacterBase.prototype.shiftY = function() {
    if (this.isObjectCharacter()) return 0;
    const own = $dataSystem && $dataSystem.rrCharacterShiftY;
    return typeof own === "number" ? own : 6;
};

Game_CharacterBase.prototype.scrolledX = function() {
    return $gameMap.adjustX(this._realX);
};

Game_CharacterBase.prototype.scrolledY = function() {
    return $gameMap.adjustY(this._realY);
};

/**
 * Where this character actually appears, when the map is drawn in 3D.
 *
 * The scroll-based answer below is where it *would* be in 2D, which on a 3D
 * map is nowhere in particular: the ground is projected through a camera with
 * pitch and yaw, so a cell's place on screen has nothing to do with the scroll
 * offset. Reactor's own character sprites already project themselves; this is
 * for everything else that asks a character where it is — lighting plugins,
 * pop-ups, mini labels — which is why a light sat somewhere other than the
 * thing it belonged to.
 *
 * Returns null in 2D, and the stock answer is used.
 */
Game_CharacterBase.prototype.reactor3DScreenPoint = function() {
    if (typeof Reactor3D === "undefined") return null;
    const viewport = Reactor3D.viewport();
    const camera = viewport && viewport.camera();
    if (!camera || !Reactor3D.shouldRender3D($dataMap)) return null;
    // The ground, and the same ground the sprite is drawn on: this feeds
    // `screenX`/`screenY`, which plugins read to place their own overlays, and
    // the two have to agree.
    const ground = Reactor3D.characterGround($dataMap, this);
    // The middle of the cell, matching the foot of every standing prop in the
    // 3D scene. The 2D `screenY` below draws a sprite's feet on the cell's
    // bottom edge, which is a screen convention rather than a world position.
    return Reactor3D.projectToScreen(
        camera, this._realX + 0.5, ground, this._realY + 0.5);
};

Game_CharacterBase.prototype.screenX = function() {
    const point = this.reactor3DScreenPoint();
    if (point) return Math.round(point.x);
    const tw = $gameMap.tileWidth();
    return Math.floor(this.scrolledX() * tw + tw / 2);
};

Game_CharacterBase.prototype.screenY = function() {
    const point = this.reactor3DScreenPoint();
    // The jump still lifts it off the ground it is standing on; the projection
    // places that ground, not the character's height above it.
    if (point) return Math.round(point.y - this.jumpHeight());
    const th = $gameMap.tileHeight();
    return Math.floor(
        this.scrolledY() * th + th - this.shiftY() - this.jumpHeight()
    );
};

Game_CharacterBase.prototype.screenZ = function() {
    // Priority 3, "Above Characters (Sorted by Y)": drawn on the above layer
    // like priority 2, but ordinary characters standing in front of it are
    // lifted onto that layer too (Sprite_Character.reactorSortedZ), so the
    // tilemap's y-sort puts them over it and those behind stay under it.
    if (this._priorityType === 3) return 5;
    return this._priorityType * 2 + 1;
};

Game_CharacterBase.prototype.isSortedAbovePriority = function() {
    return this._priorityType === 3;
};

Game_CharacterBase.prototype.isNearTheScreen = function() {
    const gw = Graphics.width;
    const gh = Graphics.height;
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();
    const px = this.scrolledX() * tw + tw / 2 - gw / 2;
    const py = this.scrolledY() * th + th / 2 - gh / 2;
    return px >= -gw && px <= gw && py >= -gh && py <= gh;
};

Game_CharacterBase.prototype.update = function() {
    if (this.isStopping()) {
        this.updateStop();
    }
    if (this.isJumping()) {
        this.updateJump();
    } else if (this.isMoving()) {
        this.updateMove();
    }
    this.updateAnimation();
};

Game_CharacterBase.prototype.updateStop = function() {
    this._stopCount++;
};

Game_CharacterBase.prototype.updateJump = function() {
    this._jumpCount--;
    this._realX =
        (this._realX * this._jumpCount + this._x) / (this._jumpCount + 1.0);
    this._realY =
        (this._realY * this._jumpCount + this._y) / (this._jumpCount + 1.0);
    this.refreshBushDepth();
    if (this._jumpCount === 0) {
        this._realX = this._x = $gameMap.roundX(this._x);
        this._realY = this._y = $gameMap.roundY(this._y);
    }
};

Game_CharacterBase.prototype.updateMove = function() {
    if (this._x < this._realX) {
        this._realX = Math.max(this._realX - this.distancePerFrame(), this._x);
    }
    if (this._x > this._realX) {
        this._realX = Math.min(this._realX + this.distancePerFrame(), this._x);
    }
    if (this._y < this._realY) {
        this._realY = Math.max(this._realY - this.distancePerFrame(), this._y);
    }
    if (this._y > this._realY) {
        this._realY = Math.min(this._realY + this.distancePerFrame(), this._y);
    }
    if (!this.isMoving()) {
        this.refreshBushDepth();
    }
};

Game_CharacterBase.prototype.updateAnimation = function() {
    this.updateAnimationCount();
    if (this._animationCount >= this.animationWait()) {
        this.updatePattern();
        this._animationCount = 0;
    }
};

Game_CharacterBase.prototype.animationWait = function() {
    return (9 - this.realMoveSpeed()) * 3;
};

Game_CharacterBase.prototype.updateAnimationCount = function() {
    if (this.isMoving() && this.hasWalkAnime()) {
        this._animationCount += 1.5;
    } else if (this.hasStepAnime() || !this.isOriginalPattern()) {
        this._animationCount++;
    }
};

Game_CharacterBase.prototype.updatePattern = function() {
    if (!this.hasStepAnime() && this._stopCount > 0) {
        this.resetPattern();
    } else {
        this._pattern = (this._pattern + 1) % this.maxPattern();
    }
};

Game_CharacterBase.prototype.maxPattern = function() {
    return 4;
};

Game_CharacterBase.prototype.pattern = function() {
    return this._pattern < 3 ? this._pattern : 1;
};

Game_CharacterBase.prototype.setPattern = function(pattern) {
    this._pattern = pattern;
};

Game_CharacterBase.prototype.isOriginalPattern = function() {
    return this.pattern() === 1;
};

Game_CharacterBase.prototype.resetPattern = function() {
    this.setPattern(1);
};

Game_CharacterBase.prototype.refreshBushDepth = function() {
    if (
        this.isNormalPriority() &&
        !this.isObjectCharacter() &&
        this.isOnBush() &&
        !this.isJumping()
    ) {
        if (!this.isMoving()) {
            this._bushDepth = $gameMap.bushDepth();
        }
    } else {
        this._bushDepth = 0;
    }
};

Game_CharacterBase.prototype.isOnLadder = function() {
    return $gameMap.isLadder(this._x, this._y);
};

Game_CharacterBase.prototype.isOnBush = function() {
    return $gameMap.isBush(this._x, this._y);
};

Game_CharacterBase.prototype.terrainTag = function() {
    return $gameMap.terrainTag(this._x, this._y);
};

Game_CharacterBase.prototype.regionId = function() {
    return $gameMap.regionId(this._x, this._y);
};

Game_CharacterBase.prototype.increaseSteps = function() {
    if (this.isOnLadder()) {
        this.setDirection(8);
    }
    this.resetStopCount();
    this.refreshBushDepth();
};

Game_CharacterBase.prototype.tileId = function() {
    return this._tileId;
};

Game_CharacterBase.prototype.characterName = function() {
    return this._characterName;
};

Game_CharacterBase.prototype.characterIndex = function() {
    return this._characterIndex;
};

Game_CharacterBase.prototype.setImage = function(
    characterName,
    characterIndex
) {
    this._tileId = 0;
    this._characterName = characterName;
    this._characterIndex = characterIndex;
    this._isObjectCharacter = ImageManager.isObjectCharacter(characterName);
};

Game_CharacterBase.prototype.setTileImage = function(tileId) {
    this._tileId = tileId;
    this._characterName = "";
    this._characterIndex = 0;
    this._isObjectCharacter = true;
};

Game_CharacterBase.prototype.checkEventTriggerTouchFront = function(d) {
    const x2 = $gameMap.roundXWithDirection(this._x, d);
    const y2 = $gameMap.roundYWithDirection(this._y, d);
    this.checkEventTriggerTouch(x2, y2);
};

Game_CharacterBase.prototype.checkEventTriggerTouch = function(/*x, y*/) {
    return false;
};

Game_CharacterBase.prototype.isMovementSucceeded = function(/*x, y*/) {
    return this._movementSuccess;
};

Game_CharacterBase.prototype.setMovementSuccess = function(success) {
    this._movementSuccess = success;
};

Game_CharacterBase.prototype.moveStraight = function(d) {
    this.setMovementSuccess(this.canPass(this._x, this._y, d));
    if (this.isMovementSucceeded()) {
        this.setDirection(d);
        this._x = $gameMap.roundXWithDirection(this._x, d);
        this._y = $gameMap.roundYWithDirection(this._y, d);
        this._realX = $gameMap.xWithDirection(this._x, this.reverseDir(d));
        this._realY = $gameMap.yWithDirection(this._y, this.reverseDir(d));
        this.increaseSteps();
    } else {
        this.setDirection(d);
        this.checkEventTriggerTouchFront(d);
    }
};

Game_CharacterBase.prototype.moveDiagonally = function(horz, vert) {
    const d8 = { 42: 1, 62: 3, 48: 7, 68: 9 }[horz * 10 + vert];
    if (d8 && this._reactorCanFace(d8)) this._reactorDir8 = d8;
    this.setMovementSuccess(
        this.canPassDiagonally(this._x, this._y, horz, vert)
    );
    if (this.isMovementSucceeded()) {
        this._x = $gameMap.roundXWithDirection(this._x, horz);
        this._y = $gameMap.roundYWithDirection(this._y, vert);
        this._realX = $gameMap.xWithDirection(this._x, this.reverseDir(horz));
        this._realY = $gameMap.yWithDirection(this._y, this.reverseDir(vert));
        this.increaseSteps();
    }
    if (this._direction === this.reverseDir(horz)) {
        this.setDirection(horz);
    }
    if (this._direction === this.reverseDir(vert)) {
        this.setDirection(vert);
    }
    // The turn to a straight direction above keeps the diagonal as the way it faces among eight.
    if (d8 && this._reactorCanFace(d8)) this._reactorDir8 = d8;
};

Game_CharacterBase.prototype.jump = function(xPlus, yPlus) {
    if (Math.abs(xPlus) > Math.abs(yPlus)) {
        if (xPlus !== 0) {
            this.setDirection(xPlus < 0 ? 4 : 6);
        }
    } else {
        if (yPlus !== 0) {
            this.setDirection(yPlus < 0 ? 8 : 2);
        }
    }
    this._x += xPlus;
    this._y += yPlus;
    const distance = Math.round(Math.sqrt(xPlus * xPlus + yPlus * yPlus));
    this._jumpPeak = 10 + distance - this._moveSpeed;
    this._jumpCount = this._jumpPeak * 2;
    this.resetStopCount();
    this.straighten();
};

Game_CharacterBase.prototype.hasWalkAnime = function() {
    return this._walkAnime;
};

Game_CharacterBase.prototype.setWalkAnime = function(walkAnime) {
    this._walkAnime = walkAnime;
};

Game_CharacterBase.prototype.hasStepAnime = function() {
    return this._stepAnime;
};

Game_CharacterBase.prototype.setStepAnime = function(stepAnime) {
    this._stepAnime = stepAnime;
};

Game_CharacterBase.prototype.isDirectionFixed = function() {
    return this._directionFix;
};

Game_CharacterBase.prototype.setDirectionFix = function(directionFix) {
    this._directionFix = directionFix;
};

Game_CharacterBase.prototype.isThrough = function() {
    return this._through;
};

Game_CharacterBase.prototype.setThrough = function(through) {
    this._through = through;
};

Game_CharacterBase.prototype.isTransparent = function() {
    return this._transparent;
};

Game_CharacterBase.prototype.bushDepth = function() {
    return this._bushDepth;
};

Game_CharacterBase.prototype.setTransparent = function(transparent) {
    this._transparent = transparent;
};

Game_CharacterBase.prototype.startAnimation = function() {
    this._animationPlaying = true;
};

Game_CharacterBase.prototype.startBalloon = function() {
    this._balloonPlaying = true;
};

Game_CharacterBase.prototype.isAnimationPlaying = function() {
    return this._animationPlaying;
};

Game_CharacterBase.prototype.isBalloonPlaying = function() {
    return this._balloonPlaying;
};

Game_CharacterBase.prototype.endAnimation = function() {
    this._animationPlaying = false;
};

Game_CharacterBase.prototype.endBalloon = function() {
    this._balloonPlaying = false;
};

//-----------------------------------------------------------------------------
// Game_Character
//
// The superclass of Game_Player, Game_Follower, GameVehicle, and Game_Event.

function Game_Character() {
    this.initialize(...arguments);
}

Game_Character.prototype = Object.create(Game_CharacterBase.prototype);
Game_Character.prototype.constructor = Game_Character;

Game_Character.ROUTE_END = 0;
Game_Character.ROUTE_MOVE_DOWN = 1;
Game_Character.ROUTE_MOVE_LEFT = 2;
Game_Character.ROUTE_MOVE_RIGHT = 3;
Game_Character.ROUTE_MOVE_UP = 4;
Game_Character.ROUTE_MOVE_LOWER_L = 5;
Game_Character.ROUTE_MOVE_LOWER_R = 6;
Game_Character.ROUTE_MOVE_UPPER_L = 7;
Game_Character.ROUTE_MOVE_UPPER_R = 8;
Game_Character.ROUTE_MOVE_RANDOM = 9;
Game_Character.ROUTE_MOVE_TOWARD = 10;
Game_Character.ROUTE_MOVE_AWAY = 11;
Game_Character.ROUTE_MOVE_FORWARD = 12;
Game_Character.ROUTE_MOVE_BACKWARD = 13;
Game_Character.ROUTE_JUMP = 14;
Game_Character.ROUTE_WAIT = 15;
Game_Character.ROUTE_TURN_DOWN = 16;
Game_Character.ROUTE_TURN_LEFT = 17;
Game_Character.ROUTE_TURN_RIGHT = 18;
Game_Character.ROUTE_TURN_UP = 19;
Game_Character.ROUTE_TURN_90D_R = 20;
Game_Character.ROUTE_TURN_90D_L = 21;
Game_Character.ROUTE_TURN_180D = 22;
Game_Character.ROUTE_TURN_90D_R_L = 23;
Game_Character.ROUTE_TURN_RANDOM = 24;
Game_Character.ROUTE_TURN_TOWARD = 25;
Game_Character.ROUTE_TURN_AWAY = 26;
Game_Character.ROUTE_SWITCH_ON = 27;
Game_Character.ROUTE_SWITCH_OFF = 28;
Game_Character.ROUTE_CHANGE_SPEED = 29;
Game_Character.ROUTE_CHANGE_FREQ = 30;
Game_Character.ROUTE_WALK_ANIME_ON = 31;
Game_Character.ROUTE_WALK_ANIME_OFF = 32;
Game_Character.ROUTE_STEP_ANIME_ON = 33;
Game_Character.ROUTE_STEP_ANIME_OFF = 34;
Game_Character.ROUTE_DIR_FIX_ON = 35;
Game_Character.ROUTE_DIR_FIX_OFF = 36;
Game_Character.ROUTE_THROUGH_ON = 37;
Game_Character.ROUTE_THROUGH_OFF = 38;
Game_Character.ROUTE_TRANSPARENT_ON = 39;
Game_Character.ROUTE_TRANSPARENT_OFF = 40;
Game_Character.ROUTE_CHANGE_IMAGE = 41;
Game_Character.ROUTE_CHANGE_OPACITY = 42;
Game_Character.ROUTE_CHANGE_BLEND_MODE = 43;
Game_Character.ROUTE_PLAY_SE = 44;
Game_Character.ROUTE_SCRIPT = 45;

Game_Character.prototype.initialize = function() {
    Game_CharacterBase.prototype.initialize.call(this);
};

Game_Character.prototype.initMembers = function() {
    Game_CharacterBase.prototype.initMembers.call(this);
    this._moveRouteForcing = false;
    this._moveRoute = null;
    this._moveRouteIndex = 0;
    this._originalMoveRoute = null;
    this._originalMoveRouteIndex = 0;
    this._waitCount = 0;
};

Game_Character.prototype.memorizeMoveRoute = function() {
    this._originalMoveRoute = this._moveRoute;
    this._originalMoveRouteIndex = this._moveRouteIndex;
};

Game_Character.prototype.restoreMoveRoute = function() {
    this._moveRoute = this._originalMoveRoute;
    this._moveRouteIndex = this._originalMoveRouteIndex;
    this._originalMoveRoute = null;
};

Game_Character.prototype.isMoveRouteForcing = function() {
    return this._moveRouteForcing;
};

Game_Character.prototype.setMoveRoute = function(moveRoute) {
    if (this._moveRouteForcing) {
        this._originalMoveRoute = moveRoute;
        this._originalMoveRouteIndex = 0;
    } else {
        this._moveRoute = moveRoute;
        this._moveRouteIndex = 0;
        // A walk to a tile belongs to the step of the route that asked for it.
        this._reactorWalk = null;
    }
};

Game_Character.prototype.forceMoveRoute = function(moveRoute) {
    if (!this._originalMoveRoute) {
        this.memorizeMoveRoute();
    }
    this._moveRoute = moveRoute;
    this._moveRouteIndex = 0;
    this._moveRouteForcing = true;
    this._waitCount = 0;
    this._reactorWalk = null;
};

Game_Character.prototype.updateStop = function() {
    Game_CharacterBase.prototype.updateStop.call(this);
    if (this._moveRouteForcing) {
        this.updateRoutineMove();
    }
};

Game_Character.prototype.updateRoutineMove = function() {
    if (this._waitCount > 0) {
        this._waitCount--;
    } else if (this._reactorWalk) {
        // A Move to Tile step keeps the route until its walk ends.
        if (this.reactorUpdateWalk()) {
            this.advanceMoveRouteIndex();
        }
    } else {
        this.setMovementSuccess(true);
        const command = this._moveRoute.list[this._moveRouteIndex];
        if (command) {
            this.processMoveCommand(command);
            this.advanceMoveRouteIndex();
        }
    }
};

Game_Character.prototype.processMoveCommand = function(command) {
    const gc = Game_Character;
    const params = command.parameters;
    switch (command.code) {
        case gc.ROUTE_END:
            this.processRouteEnd();
            break;
        case gc.ROUTE_MOVE_DOWN:
            this.moveStraight(2);
            break;
        case gc.ROUTE_MOVE_LEFT:
            this.moveStraight(4);
            break;
        case gc.ROUTE_MOVE_RIGHT:
            this.moveStraight(6);
            break;
        case gc.ROUTE_MOVE_UP:
            this.moveStraight(8);
            break;
        case gc.ROUTE_MOVE_LOWER_L:
            this.moveDiagonally(4, 2);
            break;
        case gc.ROUTE_MOVE_LOWER_R:
            this.moveDiagonally(6, 2);
            break;
        case gc.ROUTE_MOVE_UPPER_L:
            this.moveDiagonally(4, 8);
            break;
        case gc.ROUTE_MOVE_UPPER_R:
            this.moveDiagonally(6, 8);
            break;
        case gc.ROUTE_MOVE_RANDOM:
            this.moveRandom();
            break;
        case gc.ROUTE_MOVE_TOWARD:
            this.moveTowardPlayer();
            break;
        case gc.ROUTE_MOVE_AWAY:
            this.moveAwayFromPlayer();
            break;
        case gc.ROUTE_MOVE_FORWARD:
            this.moveForward();
            break;
        case gc.ROUTE_MOVE_BACKWARD:
            this.moveBackward();
            break;
        case gc.ROUTE_JUMP:
            this.jump(params[0], params[1]);
            break;
        case gc.ROUTE_WAIT:
            this._waitCount = params[0] - 1;
            break;
        case gc.ROUTE_TURN_DOWN:
            this.setDirection(2);
            break;
        case gc.ROUTE_TURN_LEFT:
            this.setDirection(4);
            break;
        case gc.ROUTE_TURN_RIGHT:
            this.setDirection(6);
            break;
        case gc.ROUTE_TURN_UP:
            this.setDirection(8);
            break;
        case gc.ROUTE_TURN_90D_R:
            this.turnRight90();
            break;
        case gc.ROUTE_TURN_90D_L:
            this.turnLeft90();
            break;
        case gc.ROUTE_TURN_180D:
            this.turn180();
            break;
        case gc.ROUTE_TURN_90D_R_L:
            this.turnRightOrLeft90();
            break;
        case gc.ROUTE_TURN_RANDOM:
            this.turnRandom();
            break;
        case gc.ROUTE_TURN_TOWARD:
            this.turnTowardPlayer();
            break;
        case gc.ROUTE_TURN_AWAY:
            this.turnAwayFromPlayer();
            break;
        case gc.ROUTE_SWITCH_ON:
            $gameSwitches.setValue(params[0], true);
            break;
        case gc.ROUTE_SWITCH_OFF:
            $gameSwitches.setValue(params[0], false);
            break;
        case gc.ROUTE_CHANGE_SPEED:
            this.setMoveSpeed(params[0]);
            break;
        case gc.ROUTE_CHANGE_FREQ:
            this.setMoveFrequency(params[0]);
            break;
        case gc.ROUTE_WALK_ANIME_ON:
            this.setWalkAnime(true);
            break;
        case gc.ROUTE_WALK_ANIME_OFF:
            this.setWalkAnime(false);
            break;
        case gc.ROUTE_STEP_ANIME_ON:
            this.setStepAnime(true);
            break;
        case gc.ROUTE_STEP_ANIME_OFF:
            this.setStepAnime(false);
            break;
        case gc.ROUTE_DIR_FIX_ON:
            this.setDirectionFix(true);
            break;
        case gc.ROUTE_DIR_FIX_OFF:
            this.setDirectionFix(false);
            break;
        case gc.ROUTE_THROUGH_ON:
            this.setThrough(true);
            break;
        case gc.ROUTE_THROUGH_OFF:
            this.setThrough(false);
            break;
        case gc.ROUTE_TRANSPARENT_ON:
            this.setTransparent(true);
            break;
        case gc.ROUTE_TRANSPARENT_OFF:
            this.setTransparent(false);
            break;
        case gc.ROUTE_CHANGE_IMAGE:
            this.setImage(params[0], params[1]);
            break;
        case gc.ROUTE_CHANGE_OPACITY:
            this.setOpacity(params[0]);
            break;
        case gc.ROUTE_CHANGE_BLEND_MODE:
            this.setBlendMode(params[0]);
            break;
        case gc.ROUTE_PLAY_SE:
            AudioManager.playSe(params[0]);
            break;
        case gc.ROUTE_SCRIPT:
            eval(params[0]);
            break;
    }
};

Game_Character.prototype.deltaXFrom = function(x) {
    return $gameMap.deltaX(this.x, x);
};

Game_Character.prototype.deltaYFrom = function(y) {
    return $gameMap.deltaY(this.y, y);
};

Game_Character.prototype.moveRandom = function() {
    const d = 2 + Math.randomInt(4) * 2;
    if (this.canPass(this.x, this.y, d)) {
        this.moveStraight(d);
    }
};

Game_Character.prototype.moveTowardCharacter = function(character) {
    const sx = this.deltaXFrom(character.x);
    const sy = this.deltaYFrom(character.y);
    if (Math.abs(sx) > Math.abs(sy)) {
        this.moveStraight(sx > 0 ? 4 : 6);
        if (!this.isMovementSucceeded() && sy !== 0) {
            this.moveStraight(sy > 0 ? 8 : 2);
        }
    } else if (sy !== 0) {
        this.moveStraight(sy > 0 ? 8 : 2);
        if (!this.isMovementSucceeded() && sx !== 0) {
            this.moveStraight(sx > 0 ? 4 : 6);
        }
    }
};

Game_Character.prototype.moveAwayFromCharacter = function(character) {
    const sx = this.deltaXFrom(character.x);
    const sy = this.deltaYFrom(character.y);
    if (Math.abs(sx) > Math.abs(sy)) {
        this.moveStraight(sx > 0 ? 6 : 4);
        if (!this.isMovementSucceeded() && sy !== 0) {
            this.moveStraight(sy > 0 ? 2 : 8);
        }
    } else if (sy !== 0) {
        this.moveStraight(sy > 0 ? 2 : 8);
        if (!this.isMovementSucceeded() && sx !== 0) {
            this.moveStraight(sx > 0 ? 6 : 4);
        }
    }
};

Game_Character.prototype.turnTowardCharacter = function(character) {
    const sx = this.deltaXFrom(character.x);
    const sy = this.deltaYFrom(character.y);
    if (Math.abs(sx) > Math.abs(sy)) {
        this.setDirection(sx > 0 ? 4 : 6);
    } else if (sy !== 0) {
        this.setDirection(sy > 0 ? 8 : 2);
    }
};

Game_Character.prototype.turnAwayFromCharacter = function(character) {
    const sx = this.deltaXFrom(character.x);
    const sy = this.deltaYFrom(character.y);
    if (Math.abs(sx) > Math.abs(sy)) {
        this.setDirection(sx > 0 ? 6 : 4);
    } else if (sy !== 0) {
        this.setDirection(sy > 0 ? 2 : 8);
    }
};

Game_Character.prototype.turnTowardPlayer = function() {
    this.turnTowardCharacter($gamePlayer);
};

Game_Character.prototype.turnAwayFromPlayer = function() {
    this.turnAwayFromCharacter($gamePlayer);
};

Game_Character.prototype.moveTowardPlayer = function() {
    this.moveTowardCharacter($gamePlayer);
};

Game_Character.prototype.moveAwayFromPlayer = function() {
    this.moveAwayFromCharacter($gamePlayer);
};

Game_Character.prototype.moveForward = function() {
    this.moveStraight(this.direction());
};

Game_Character.prototype.moveBackward = function() {
    const lastDirectionFix = this.isDirectionFixed();
    this.setDirectionFix(true);
    this.moveStraight(this.reverseDir(this.direction()));
    this.setDirectionFix(lastDirectionFix);
};

Game_Character.prototype.processRouteEnd = function() {
    if (this._moveRoute.repeat) {
        this._moveRouteIndex = -1;
    } else if (this._moveRouteForcing) {
        this._moveRouteForcing = false;
        this.restoreMoveRoute();
        this.setMovementSuccess(false);
    }
};

Game_Character.prototype.advanceMoveRouteIndex = function() {
    const moveRoute = this._moveRoute;
    // The step that began a walk to a tile is passed when the walk ends.
    if (this._reactorWalk) {
        return;
    }
    if (moveRoute && (this.isMovementSucceeded() || moveRoute.skippable)) {
        let numCommands = moveRoute.list.length - 1;
        this._moveRouteIndex++;
        if (moveRoute.repeat && this._moveRouteIndex >= numCommands) {
            this._moveRouteIndex = 0;
        }
    }
};

Game_Character.prototype.turnRight90 = function() {
    switch (this.direction()) {
        case 2:
            this.setDirection(4);
            break;
        case 4:
            this.setDirection(8);
            break;
        case 6:
            this.setDirection(2);
            break;
        case 8:
            this.setDirection(6);
            break;
    }
};

Game_Character.prototype.turnLeft90 = function() {
    switch (this.direction()) {
        case 2:
            this.setDirection(6);
            break;
        case 4:
            this.setDirection(2);
            break;
        case 6:
            this.setDirection(8);
            break;
        case 8:
            this.setDirection(4);
            break;
    }
};

Game_Character.prototype.turn180 = function() {
    this.setDirection(this.reverseDir(this.direction()));
};

Game_Character.prototype.turnRightOrLeft90 = function() {
    switch (Math.randomInt(2)) {
        case 0:
            this.turnRight90();
            break;
        case 1:
            this.turnLeft90();
            break;
    }
};

Game_Character.prototype.turnRandom = function() {
    this.setDirection(2 + Math.randomInt(4) * 2);
};

Game_Character.prototype.swap = function(character) {
    const newX = character.x;
    const newY = character.y;
    character.locate(this.x, this.y);
    this.locate(newX, newY);
};

// Routes are transient: keeping them outside Game_Player avoids bloating saves.
Game_Character._touchRoutes = new WeakMap();
Game_Character.prototype.findDirectionTo = function(goalX, goalY) {
    const touchRoute = typeof $gamePlayer !== "undefined" && this === $gamePlayer && $gameTemp.isDestinationValid()
        && goalX === $gameTemp.destinationX() && goalY === $gameTemp.destinationY();
    const routeKey = touchRoute ? [$gameMap.mapId(), goalX, goalY, $gameTemp._destinationVersion || 0].join(':') : '';
    const cached = Game_Character._touchRoutes.get(this);
    if (touchRoute && cached && cached.key === routeKey) {
        // Accept the current or next step only. Teleports and plugin movement
        // invalidate the route; moving obstacles are checked before each step.
        if (cached.steps[cached.index + 1]?.x === this.x && cached.steps[cached.index + 1]?.y === this.y) cached.index++;
        const step = cached.steps[cached.index];
        if (step && step.x === this.x && step.y === this.y && this.canPass(this.x, this.y, step.direction)) return step.direction;
    }
    Game_Character._touchRoutes.delete(this);
    const searchLimit = touchRoute ? Math.max(32, this.searchLimit()) : this.searchLimit();
    const mapWidth = $gameMap.width();
    const nodeList = [];
    const openList = new Map();
    const closedList = new Set();
    const start = {};
    let best = start;

    if (this.x === goalX && this.y === goalY) {
        return 0;
    }

    start.parent = null;
    start.x = this.x;
    start.y = this.y;
    start.g = 0;
    start.f = $gameMap.distance(start.x, start.y, goalX, goalY);
    nodeList.push(start);
    openList.set(start.y * mapWidth + start.x, start);

    let expanded = 0;
    while (nodeList.length > 0 && (!touchRoute || expanded++ < 2048)) {
        let bestIndex = 0;
        for (let i = 0; i < nodeList.length; i++) {
            if (nodeList[i].f < nodeList[bestIndex].f) {
                bestIndex = i;
            }
        }

        const current = nodeList[bestIndex];
        const x1 = current.x;
        const y1 = current.y;
        const pos1 = y1 * mapWidth + x1;
        const g1 = current.g;

        nodeList.splice(bestIndex, 1);
        openList.delete(pos1);
        closedList.add(pos1);

        if (current.x === goalX && current.y === goalY) {
            best = current;
            break;
        }

        if (g1 >= searchLimit) {
            continue;
        }

        for (let j = 0; j < 4; j++) {
            const direction = 2 + j * 2;
            const x2 = $gameMap.roundXWithDirection(x1, direction);
            const y2 = $gameMap.roundYWithDirection(y1, direction);
            const pos2 = y2 * mapWidth + x2;

            if (closedList.has(pos2)) {
                continue;
            }
            if (!this.canPass(x1, y1, direction)) {
                continue;
            }

            const g2 = g1 + 1;
            const existing = openList.get(pos2);

            if (!existing || g2 < existing.g) {
                const neighbor = existing || {};
                if (!existing) {
                    nodeList.push(neighbor);
                    openList.set(pos2, neighbor);
                }
                neighbor.parent = current;
                neighbor.x = x2;
                neighbor.y = y2;
                neighbor.g = g2;
                neighbor.f = g2 + $gameMap.distance(x2, y2, goalX, goalY);
                if (!best || neighbor.f - neighbor.g < best.f - best.g) {
                    best = neighbor;
                }
            }
        }
    }

    if (touchRoute && best.x === goalX && best.y === goalY) {
        const steps = [];
        for (let step = best; step.parent; step = step.parent) {
            const parent = step.parent;
            const dx = $gameMap.deltaX(step.x, parent.x), dy = $gameMap.deltaY(step.y, parent.y);
            steps.push({ x: parent.x, y: parent.y, direction: dy > 0 ? 2 : dx < 0 ? 4 : dx > 0 ? 6 : 8 });
        }
        steps.reverse();
        Game_Character._touchRoutes.set(this, { key: routeKey, steps, index: 0 });
    }
    let node = best;
    while (node.parent && node.parent !== start) {
        node = node.parent;
    }

    const deltaX1 = $gameMap.deltaX(node.x, start.x);
    const deltaY1 = $gameMap.deltaY(node.y, start.y);
    if (deltaY1 > 0) {
        return 2;
    } else if (deltaX1 < 0) {
        return 4;
    } else if (deltaX1 > 0) {
        return 6;
    } else if (deltaY1 < 0) {
        return 8;
    }

    const deltaX2 = this.deltaXFrom(goalX);
    const deltaY2 = this.deltaYFrom(goalY);
    if (Math.abs(deltaX2) > Math.abs(deltaY2)) {
        return deltaX2 > 0 ? 4 : 6;
    } else if (deltaY2 !== 0) {
        return deltaY2 > 0 ? 8 : 2;
    }

    return 0;
};

Game_Character.prototype.searchLimit = function() {
    return 12;
};

//-----------------------------------------------------------------------------
// Walking to a tile by path finding: a route's Move to Tile step
// (`reactorMoveToTile`, the Script entry the editor writes) and the same walk
// asked for outside a route (`reactorWalkTo`: a script, Follower Orders).
// The goal is kept on the character and saved with it; the path is not, and
// is found again after a load.

/**
 * Tiles one search opens before it settles for the nearest tile it reached:
 * the walk goes that far and looks again from there, so a way longer than
 * one search finds is walked in legs.
 */
Game_Character.WALK_NODES = 3000;
/** Tiles a walk that takes no way but the whole way opens (a follower's own walk back to the line). */
Game_Character.WALK_NODES_NEAR = 600;
/** How far apart two heights are and still the same floor of a 3D map. */
Game_Character.WALK_FLOOR_REACH = 1.2;
/** What a tile on another floor than the goal's counts for in a search, in steps: the tile over the goal is not near it. */
Game_Character.WALK_FLOOR_STEPS = 6;
/**
 * A search runs a slice a frame: until this many milliseconds are spent, and
 * at least the fewest and at most the most tiles whatever the clock says
 * (a step test on a 3D map costs about 25 microseconds on a desktop).
 */
Game_Character.WALK_SLICE_MS = 1.5;
Game_Character.WALK_SLICE_FEWEST = 8;
Game_Character.WALK_SLICE_MOST = 96;
/** Frames a walker waits when a step of its path is blocked before it looks for another way. */
Game_Character.WALK_BLOCKED_WAIT = 12;
/** Frames before a goal that could not be reached is tried again: doubled each time, up to the longest. */
Game_Character.WALK_RETRY_WAIT = 30;
Game_Character.WALK_RETRY_LONGEST = 300;

// The path each walker follows, and the one search under way: neither is saved.
Game_Character._walkPaths = new WeakMap();
Game_Character._walkSearch = null;
Game_Character._walkScratch = null;

/** The arrays every search uses, made once: a tile opened is a row in each. */
Game_Character.walkScratch = function() {
    const capacity = Game_Character.WALK_NODES * 4 + 16;
    let scratch = Game_Character._walkScratch;
    if (!scratch || scratch.capacity < capacity) {
        scratch = Game_Character._walkScratch = {
            capacity,
            x: new Int32Array(capacity), y: new Int32Array(capacity), height: new Float32Array(capacity),
            cost: new Int32Array(capacity), rank: new Int32Array(capacity), left: new Int32Array(capacity),
            parent: new Int32Array(capacity), direction: new Uint8Array(capacity), closed: new Uint8Array(capacity),
            heap: new Int32Array(capacity * 2), seen: new Map()
        };
    }
    return scratch;
};

/**
 * A route's Move to Tile step: the character walks to the tile by path
 * finding and the route stays on this step until it stands there. Where the
 * tile cannot be reached it goes as near as it can; a route with Skip If
 * Cannot Move then goes on to its next step, and any other tries again at
 * intervals, as a blocked step does. A second call replaces the first.
 * `height` names the floor of a 3D map the tile is meant on (without it,
 * whichever floor of the tile is come to first); `whole` takes the whole way
 * or none: no walk to somewhere near (a number: nor a way of more steps
 * than that).
 */
Game_Character.prototype.reactorMoveToTile = function(x, y, height, whole) {
    x = Math.floor(Number(x));
    y = Math.floor(Number(y));
    Game_Character._walkPaths.delete(this);
    this._reactorWalk = null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !$gameMap.isValid(x, y)) {
        return;
    }
    this._reactorWalk = { x: x, y: y, wait: 0, retry: 0 };
    if (Number.isFinite(height)) {
        this._reactorWalk.h = height;
    }
    if (whole) {
        this._reactorWalk.whole = true;
        if (whole > 1) {
            this._reactorWalk.most = Math.floor(whole);
        }
    }
    if (this.reactorWalkArrived()) {
        this._reactorWalk = null;
        return;
    }
    // Its first step is taken in the frame the route reaches it.
    if (this.reactorUpdateWalk()) {
        this._reactorWalk = null;
    }
};

/**
 * The same walk from outside a route: a forced route of that one step, so
 * the character's own route waits for it and `isMoveRouteForcing` says
 * whether it is still on its way. `skippable` false keeps trying where the
 * tile cannot be reached.
 */
Game_Character.prototype.reactorWalkTo = function(x, y, skippable = true) {
    this.forceMoveRoute(Game_Character.walkRoute(x, y, skippable));
};

/**
 * A route's Teleport to Tile step: the character stands on the tile at once,
 * no walk and no path needed, and the route goes straight on. Any walk under
 * way ends; the player's camera and followers come along (Game_Player.locate).
 */
Game_Character.prototype.reactorTeleportTo = function(x, y) {
    x = Math.floor(Number(x));
    y = Math.floor(Number(y));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !$gameMap.isValid(x, y)) {
        return;
    }
    Game_Character._walkPaths.delete(this);
    this._reactorWalk = null;
    this.locate(x, y);
};

/** The one-step route that walks to a tile (`height` and `whole` as `reactorMoveToTile` takes them). */
Game_Character.walkRoute = function(x, y, skippable = true, height, whole) {
    const floor = Number.isFinite(height) ? String(Math.round(height * 1000) / 1000) : "undefined";
    const text = "this.reactorMoveToTile(" + Math.floor(Number(x) || 0) + ", " + Math.floor(Number(y) || 0)
        + (Number.isFinite(height) || whole ? ", " + floor + ", " + (whole > 1 ? Math.floor(whole) : !!whole) : "") + ");";
    return {
        list: [{ code: Game_Character.ROUTE_SCRIPT, parameters: [text] }, { code: Game_Character.ROUTE_END, parameters: [] }],
        repeat: false, skippable: !!skippable, wait: false
    };
};

/** Whether a walk to a tile is under way. */
Game_Character.prototype.reactorIsWalking = function() {
    return !!this._reactorWalk;
};

/** Whether the character stands on the tile its walk is to, on the floor meant where one is named. */
Game_Character.prototype.reactorWalkArrived = function() {
    const walk = this._reactorWalk;
    return !!walk && this.x === walk.x && this.y === walk.y
        && (walk.h === undefined || Math.abs(this.reactorWalkHeight() - walk.h) <= Game_Character.WALK_FLOOR_REACH);
};

/** Whether a walk may take the step from (x, y) toward `d`: the character's own step rule. */
Game_Character.prototype.reactorWalkAllows = function(x, y, d) {
    return this.canPass(x, y, d);
};

/**
 * One step of a walk from tile (x, y), standing at `height` there (the level
 * of a 3D map; 0 on a flat one): the height stood at on the next tile, or
 * NaN where the step cannot be taken. The character is asked as if it stood
 * on that tile at that height, so the slopes, ledges and floors of a 3D map
 * are judged by the rule its own steps are.
 */
Game_Character.prototype.reactorWalkStep = function(x, y, d, height) {
    const world = typeof Reactor3D !== "undefined" && typeof $dataMap !== "undefined" && $dataMap
        && Reactor3D.isMap3D && Reactor3D.isMap3D($dataMap) ? Reactor3D : null;
    const ground = this._reactorGround;
    const alt = this._reactorAlt;
    let allowed = false;
    if (world) {
        this._reactorGround = height;
        if (Number.isFinite(alt)) {
            this._reactorAlt = height;
        }
    }
    try {
        allowed = this.reactorWalkAllows(x, y, d);
    } finally {
        this._reactorGround = ground;
        this._reactorAlt = alt;
    }
    if (!allowed) {
        return NaN;
    }
    if (!world) {
        return 0;
    }
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);
    // As the terrain's own rule reads a step: the edge between the two tiles, then the middle of the next.
    const edgeX = x + (d === 6 ? 1 : d === 4 ? 0 : 0.5);
    const edgeY = y + (d === 2 ? 1 : d === 8 ? 0 : 0.5);
    const edge = world.groundHeightAt($dataMap, edgeX, edgeY, height);
    return world.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, edge);
};

/** The height a walk starts from: where the character stands on a 3D map (on a ladder, the height it holds), 0 on a flat one. */
Game_Character.prototype.reactorWalkHeight = function() {
    if (this._reactorOnLadder && Number.isFinite(this._reactorAlt)) {
        return this._reactorAlt;
    }
    if (Number.isFinite(this._reactorGround)) {
        return this._reactorGround;
    }
    return 0;
};

/**
 * One frame of a walk to a tile, asked while the character stands: the next
 * step of its path, or a slice of the search for one. True once the walk is
 * over (the character stands on the tile, or cannot get nearer and its route
 * skips what cannot be done), with the movement success set to whether it
 * arrived.
 */
Game_Character.prototype.reactorUpdateWalk = function() {
    const walk = this._reactorWalk;
    if (!walk) {
        return true;
    }
    if (this.reactorWalkArrived()) {
        return this.reactorEndWalk(true);
    }
    if (walk.wait > 0) {
        walk.wait--;
        return false;
    }
    // In the air or pulling itself up a ledge it takes no step and plans none.
    if (this._reactorMantle || this._reactorGrapple || (typeof ReactorPhysics !== "undefined" && ReactorPhysics.isAirborne(this))) {
        return false;
    }
    const paths = Game_Character._walkPaths;
    let path = paths.get(this);
    if (path && (path.mapId !== $gameMap.mapId() || path.goalX !== walk.x || path.goalY !== walk.y
        || path.x !== this.x || path.y !== this.y)) {
        path = null;
    }
    if (!path) {
        path = this.reactorSearchWalk(walk.x, walk.y, walk.h, walk.whole ? Game_Character.WALK_NODES_NEAR : Game_Character.WALK_NODES);
        if (!path) {
            return false;
        }
        // The whole way or none: a way that only comes near, or is longer than asked for, is not walked.
        if (walk.whole && (!path.reached || (walk.most > 0 && path.length > walk.most))) {
            return this.reactorEndWalk(false);
        }
        paths.set(this, path);
    }
    if (path.index >= path.length) {
        paths.delete(this);
        // One search went as far as it looks and got nearer: the next leg is looked for from here.
        if (!path.reached && !path.exhausted && path.length > 0) {
            return false;
        }
        if (path.taken) {
            // Beside the tile, and somebody stands on it: this is where the walk was to end, and the route goes
            // on whether or not it skips what cannot be done. A route that waited here for the tile to clear
            // would hold its event, and the player with it, for as long as the other one stood there. Where the
            // tile has cleared on the way, the last step is looked for.
            if (this.isCollidedWithCharacters(walk.x, walk.y)) {
                return this.reactorEndWalk(true);
            }
            return false;
        }
        // As near as it can come, and the tile is further.
        if (this._moveRoute && this._moveRoute.skippable) {
            return this.reactorEndWalk(false);
        }
        walk.retry = walk.retry ? Math.min(Game_Character.WALK_RETRY_LONGEST, walk.retry * 2) : Game_Character.WALK_RETRY_WAIT;
        walk.wait = walk.retry;
        return false;
    }
    const d = path.directions[path.index];
    if (!this.reactorWalkAllows(this.x, this.y, d)) {
        // Something has moved into the way: another way is looked for shortly.
        paths.delete(this);
        walk.wait = Game_Character.WALK_BLOCKED_WAIT;
        return false;
    }
    this.moveStraight(d);
    if (this.isMovementSucceeded()) {
        path.index++;
        path.x = this.x;
        path.y = this.y;
        walk.retry = 0;
    } else {
        paths.delete(this);
        walk.wait = Game_Character.WALK_BLOCKED_WAIT;
    }
    return false;
};

Game_Character.prototype.reactorEndWalk = function(arrived) {
    Game_Character._walkPaths.delete(this);
    this._reactorWalk = null;
    this.setMovementSuccess(arrived);
    return true;
};

/**
 * The path to a tile, or null while it is still being looked for: one search
 * runs at a time, a slice a frame, so a long way round never holds a frame.
 */
Game_Character.prototype.reactorSearchWalk = function(goalX, goalY, goalHeight, limit) {
    let search = Game_Character._walkSearch;
    const mapId = $gameMap.mapId();
    const frame = typeof Graphics !== "undefined" ? Graphics.frameCount : 0;
    const floor = Number.isFinite(goalHeight) ? goalHeight : null;
    if (search && search.owner !== this) {
        const other = search.owner._reactorWalk;
        // Another walker's search is under way: this one waits its turn. One left unfinished (its walker was
        // told something else, erased, left behind on another map) gives way.
        const alive = other && other.x === search.goalX && other.y === search.goalY && search.mapId === mapId
            && frame - search.frame <= 2;
        if (alive) {
            return null;
        }
        search = null;
    }
    if (!search || search.goalX !== goalX || search.goalY !== goalY || search.goalHeight !== floor || search.mapId !== mapId
        || search.startX !== this.x || search.startY !== this.y) {
        search = Game_Character._walkSearch = this.reactorBeginSearch(goalX, goalY, goalHeight, limit);
    }
    search.frame = frame;
    if (!this.reactorRunSearch(search, Game_Character.WALK_SLICE_MOST, Game_Character.WALK_SLICE_MS)) {
        return null;
    }
    Game_Character._walkSearch = null;
    return search.path;
};

/**
 * The path to a tile, found at once: `{ directions, length, reached,
 * exhausted, opened }`, to the nearest tile reached where `reached` is
 * false. For scripts and tests; a walk searches in slices.
 */
Game_Character.prototype.reactorFindPath = function(goalX, goalY, goalHeight) {
    // The arrays are shared: a search under way in slices begins again afterwards.
    Game_Character._walkSearch = null;
    const search = this.reactorBeginSearch(goalX, goalY, goalHeight);
    while (!this.reactorRunSearch(search, Game_Character.WALK_NODES, 0)) {
        // Until the goal is reached or the search has opened all it may.
    }
    return search.path;
};

Game_Character.prototype.reactorBeginSearch = function(goalX, goalY, goalHeight, limit) {
    const scratch = Game_Character.walkScratch();
    const height = this.reactorWalkHeight();
    const floor = Number.isFinite(goalHeight) ? goalHeight : null;
    scratch.seen.clear();
    scratch.x[0] = this.x;
    scratch.y[0] = this.y;
    scratch.height[0] = height;
    scratch.cost[0] = 0;
    scratch.left[0] = Game_Character.walkLeft(this.x, this.y, height, goalX, goalY, floor);
    scratch.rank[0] = scratch.left[0];
    scratch.parent[0] = -1;
    scratch.direction[0] = 0;
    scratch.closed[0] = 0;
    scratch.heap[0] = 0;
    scratch.seen.set(Game_Character.walkKey(this.x, this.y, height), 0);
    return {
        owner: this, mapId: $gameMap.mapId(), goalX: goalX, goalY: goalY, startX: this.x, startY: this.y,
        goalHeight: floor, limit: limit > 0 ? Math.min(limit, Game_Character.WALK_NODES) : Game_Character.WALK_NODES,
        count: 1, heapSize: 1, opened: 0, best: 0, reached: false, exhausted: false, frame: 0, path: null,
        taken: scratch.left[0] > 0 && !this.isThrough() && this.isCollidedWithCharacters(goalX, goalY)
    };
};

/** The steps left from a tile to the goal at least: on another floor than the one meant, further by a stair's worth. */
Game_Character.walkLeft = function(x, y, height, goalX, goalY, goalHeight) {
    const steps = $gameMap.distance(x, y, goalX, goalY);
    if (goalHeight === null || Math.abs(height - goalHeight) <= Game_Character.WALK_FLOOR_REACH) {
        return steps;
    }
    return steps + Game_Character.WALK_FLOOR_STEPS;
};

/** A tile on a floor: two floors over one tile (a bridge and the road under it) are two places. */
Game_Character.walkKey = function(x, y, height) {
    const level = Math.max(0, Math.min(255, Math.round(height * 2) + 128));
    return (y * $gameMap.width() + x) * 256 + level;
};

/**
 * Opens up to `budget` tiles of a search, or as many as `milliseconds`
 * allow (never fewer than `WALK_SLICE_FEWEST`). True once it is over:
 * `search.path` is then the way.
 */
Game_Character.prototype.reactorRunSearch = function(search, budget, milliseconds) {
    const scratch = Game_Character.walkScratch();
    const clock = milliseconds > 0 && typeof performance !== "undefined" && performance.now ? performance : null;
    const began = clock ? clock.now() : 0;
    let spent = 0;
    const xs = scratch.x, ys = scratch.y, heights = scratch.height, costs = scratch.cost, ranks = scratch.rank;
    const lefts = scratch.left, parents = scratch.parent, directions = scratch.direction, closed = scratch.closed;
    const heap = scratch.heap, seen = scratch.seen;
    while (budget > 0) {
        if (search.heapSize === 0) {
            // Everything that can be walked to has been opened: the goal cannot be reached.
            search.exhausted = true;
            return this.reactorFinishSearch(search);
        }
        if (search.opened >= search.limit) {
            return this.reactorFinishSearch(search);
        }
        if (clock && ++spent > Game_Character.WALK_SLICE_FEWEST && (spent & 3) === 0 && clock.now() - began >= milliseconds) {
            return false;
        }
        // The tile nearest the goal by the way walked plus the way left; of equals, the one with less left.
        const node = heap[0];
        const last = heap[--search.heapSize];
        let at = 0;
        for (;;) {
            let child = at * 2 + 1;
            if (child >= search.heapSize) {
                break;
            }
            const other = child + 1;
            if (other < search.heapSize && (ranks[heap[other]] < ranks[heap[child]]
                || (ranks[heap[other]] === ranks[heap[child]] && lefts[heap[other]] < lefts[heap[child]]))) {
                child = other;
            }
            if (ranks[heap[child]] < ranks[last] || (ranks[heap[child]] === ranks[last] && lefts[heap[child]] < lefts[last])) {
                heap[at] = heap[child];
                at = child;
            } else {
                break;
            }
        }
        heap[at] = last;
        if (closed[node]) {
            continue;
        }
        closed[node] = 1;
        search.opened++;
        budget--;
        const x = xs[node], y = ys[node];
        if (lefts[node] === 0) {
            search.best = node;
            search.reached = true;
            return this.reactorFinishSearch(search);
        }
        // Somebody stands on the goal: the tile beside it is as near as a walk comes.
        if (search.taken && lefts[node] === 1) {
            search.best = node;
            search.exhausted = true;
            return this.reactorFinishSearch(search);
        }
        for (let d = 2; d <= 8; d += 2) {
            const height = this.reactorWalkStep(x, y, d, heights[node]);
            if (height !== height) {
                continue;
            }
            const x2 = $gameMap.roundXWithDirection(x, d);
            const y2 = $gameMap.roundYWithDirection(y, d);
            const key = Game_Character.walkKey(x2, y2, height);
            const cost = costs[node] + 1;
            let next = seen.get(key);
            if (next === undefined) {
                if (search.count >= scratch.capacity || search.heapSize >= heap.length) {
                    continue;
                }
                next = search.count++;
                seen.set(key, next);
                xs[next] = x2;
                ys[next] = y2;
                heights[next] = height;
                closed[next] = 0;
                lefts[next] = Game_Character.walkLeft(x2, y2, height, search.goalX, search.goalY, search.goalHeight);
                if (lefts[next] < lefts[search.best] || (lefts[next] === lefts[search.best] && cost < costs[search.best])) {
                    search.best = next;
                }
            } else if (closed[next] || cost >= costs[next] || search.heapSize >= heap.length) {
                continue;
            } else if (lefts[next] === lefts[search.best] && cost < costs[search.best]) {
                search.best = next;
            }
            costs[next] = cost;
            ranks[next] = cost + lefts[next];
            parents[next] = node;
            directions[next] = d;
            let slot = search.heapSize++;
            while (slot > 0) {
                const up = (slot - 1) >> 1;
                if (ranks[heap[up]] < ranks[next] || (ranks[heap[up]] === ranks[next] && lefts[heap[up]] <= lefts[next])) {
                    break;
                }
                heap[slot] = heap[up];
                slot = up;
            }
            heap[slot] = next;
        }
    }
    return false;
};

/** The steps from the start to the goal, or to the nearest tile reached where the goal was not. */
Game_Character.prototype.reactorFinishSearch = function(search) {
    const scratch = Game_Character.walkScratch();
    const length = scratch.cost[search.best];
    const directions = new Uint8Array(length);
    for (let node = search.best, i = length - 1; i >= 0 && node > 0; node = scratch.parent[node], i--) {
        directions[i] = scratch.direction[node];
    }
    search.path = {
        mapId: search.mapId, goalX: search.goalX, goalY: search.goalY, x: search.startX, y: search.startY,
        directions: directions, length: length, index: 0, reached: search.reached, exhausted: search.exhausted,
        opened: search.opened,
        // The way ends beside the goal because somebody stands on it.
        taken: !search.reached && search.taken && scratch.left[search.best] === 1
    };
    scratch.seen.clear();
    return true;
};

//-----------------------------------------------------------------------------
// Game_Player
//
// The game object class for the player. It contains event starting
// determinants and map scrolling functions.

function Game_Player() {
    this.initialize(...arguments);
}

Game_Player.prototype = Object.create(Game_Character.prototype);
Game_Player.prototype.constructor = Game_Player;

Game_Player.prototype.initialize = function() {
    Game_Character.prototype.initialize.call(this);
    this.setTransparent($dataSystem.optTransparent);
};

Game_Player.prototype.initMembers = function() {
    Game_Character.prototype.initMembers.call(this);
    this._vehicleType = "walk";
    this._vehicleGettingOn = false;
    this._vehicleGettingOff = false;
    this._dashing = false;
    this._needsMapReload = false;
    this._transferring = false;
    this._newMapId = 0;
    this._newX = 0;
    this._newY = 0;
    this._newDirection = 0;
    this._fadeType = 0;
    this._followers = new Game_Followers();
    this._encounterCount = 0;
};

Game_Player.prototype.clearTransferInfo = function() {
    this._transferring = false;
    this._newMapId = 0;
    this._newX = 0;
    this._newY = 0;
    this._newDirection = 0;
};

Game_Player.prototype.followers = function() {
    return this._followers;
};

Game_Player.prototype.refresh = function() {
    const actor = $gameParty.leader();
    const characterName = actor ? actor.characterName() : "";
    const characterIndex = actor ? actor.characterIndex() : 0;
    this.setImage(characterName, characterIndex);
    this._followers.refresh();
};

Game_Player.prototype.isStopping = function() {
    if (this._vehicleGettingOn || this._vehicleGettingOff) {
        return false;
    }
    return Game_Character.prototype.isStopping.call(this);
};

Game_Player.prototype.reserveTransfer = function(mapId, x, y, d, fadeType) {
    this._transferring = true;
    this._newMapId = mapId;
    this._newX = x;
    this._newY = y;
    this._newDirection = d;
    this._fadeType = fadeType;
    this._borderArrival = null;
    // A transfer reserved over a border crossing is a transfer like any other.
    if (typeof Reactor3D !== "undefined" && Reactor3D.Neighbors) Reactor3D.Neighbors.crossing = null;
};

// A step off the map on a side with a neighboring map (the map's Beyond the
// Border) goes on into that map. The arrival tile is found once that map is
// loaded: only then is its size known.
Game_Player.prototype.leaveByBorder = function(d, reach) {
    if (this.isTransferring() || this.isMoveRouteForcing()) return false;
    if (typeof Reactor3D === "undefined" || !Reactor3D.neighborExit || typeof $dataMap === "undefined" || !$dataMap) return false;
    if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere && $gameFight.isHere()) return false;
    const exit = Reactor3D.neighborExit($dataMap, this.x, this.y, d, reach || 0);
    if (!exit || typeof $dataMapInfos === "undefined" || !$dataMapInfos || !$dataMapInfos[exit.mapId]) return false;
    if (typeof $gameTemp !== "undefined" && $gameTemp) $gameTemp.clearDestination();
    this.setDirection(d);
    // The map past the border stands built beside this one: it is walked into without a fade. Else as any transfer.
    const whole = !!(Reactor3D.Neighbors && Reactor3D.Neighbors.ready(exit.side));
    this.reserveTransfer(exit.mapId, 0, 0, d, whole ? 2 : 0);
    this._borderArrival = exit;
    exit.whole = whole && Reactor3D.Neighbors.begin(exit, $gameMap.mapId());
    // Where the player is, to the fraction of a tile, for a ride that crosses mid-tile.
    exit.realX = this._realX; exit.realY = this._realY;
    return true;
};

// Arrived over a border without a break: the party is where it was, in the entered map's own tiles. The
// leader stands on `tile` and comes to it from where it stood; nobody is gathered onto the leader.
// The tile over a border crossed without a break: the very place the leader was in, in the entered map's
// tiles, held to the map. No tile is found for it: there is no step aside.
Game_Player.prototype.borderCrossingTile = function(exit, width, height) {
    const cross = Reactor3D.Neighbors.crossing;
    return { x: Math.max(0, Math.min(width - 1, Math.round(exit.realX - cross.offset.x))),
        y: Math.max(0, Math.min(height - 1, Math.round(exit.realY - cross.offset.z))) };
};

Game_Player.prototype.arriveByBorder = function(exit, tile) {
    const cross = Reactor3D.Neighbors.crossing, ox = cross.offset.x, oy = cross.offset.z;
    const realX = exit.realX - ox, realY = exit.realY - oy;
    this.setPosition(tile.x, tile.y);
    this._realX = realX; this._realY = realY;
    this.center(realX, realY);
    this.makeEncounterCount();
    if (this.isInVehicle()) this.vehicle().refresh();
    this._followers.rrShift(-ox, -oy);
};

Game_Player.prototype.borderArrivalTile = function(exit) {
    const standable = (x, y) => [exit.d, 2, 4, 6, 8].some(d => this.isMapPassable(x, y, d));
    return Reactor3D.neighborArrival(exit, $gameMap.width(), $gameMap.height(), standable);
};

Game_Player.prototype.setupForNewGame = function() {
    const mapId = $dataSystem.startMapId;
    const x = $dataSystem.startX;
    const y = $dataSystem.startY;
    // The editor's "Player Facing" (System.json `startDirection`); a
    // project without one starts facing down, as always.
    const asked = Number($dataSystem.startDirection);
    const direction = [2, 4, 6, 8].indexOf(asked) >= 0 ? asked : 2;
    this.reserveTransfer(mapId, x, y, direction, 0);
};

Game_Player.prototype.requestMapReload = function() {
    this._needsMapReload = true;
};

Game_Player.prototype.isTransferring = function() {
    return this._transferring;
};

Game_Player.prototype.newMapId = function() {
    return this._newMapId;
};

Game_Player.prototype.fadeType = function() {
    return this._fadeType;
};

Game_Player.prototype.performTransfer = function() {
    if (this.isTransferring()) {
        this.setDirection(this._newDirection);
        const border = typeof Reactor3D !== "undefined" && Reactor3D.neighborArrival ? this._borderArrival : null;
        this._borderArrival = null;
        const whole = !!(border && border.whole && Reactor3D.Neighbors && Reactor3D.Neighbors.crossing);
        // Over a border: the tile arrived on, by the entered map's size (its data is loaded; the map is set up
        // below). A ridden vehicle is told the same tile before the map makes its events.
        let tile = null;
        if (border && $dataMap) {
            tile = whole ? this.borderCrossingTile(border, $dataMap.width, $dataMap.height) : Reactor3D.neighborArrival(border, $dataMap.width, $dataMap.height);
            if (tile) {
                this._newX = tile.x; this._newY = tile.y;
                if (this._rrVehicleTransfer) { this._rrVehicleTransfer.x = tile.x; this._rrVehicleTransfer.y = tile.y; }
            }
        }
        if (this._newMapId !== $gameMap.mapId() || this._needsMapReload) {
            $gameMap.setup(this._newMapId);
            this._needsMapReload = false;
        }
        // Entered with a fade and on foot: the nearest tile along the border that can be stood on.
        if (tile && !whole && !this._rrVehicleTransfer) {
            tile = this.borderArrivalTile(border) || tile;
            this._newX = tile.x; this._newY = tile.y;
        }
        if (tile && whole) this.arriveByBorder(border, tile);
        else this.locate(this._newX, this._newY);
        this.refresh();
        this.clearTransferInfo();
    }
};

Game_Player.prototype.isMapPassable = function(x, y, d) {
    const vehicle = this.vehicle();
    if (vehicle) {
        return vehicle.isMapPassable(x, y, d);
    } else {
        return Game_Character.prototype.isMapPassable.call(this, x, y, d);
    }
};

Game_Player.prototype.vehicle = function() {
    return $gameMap.vehicle(this._vehicleType);
};

Game_Player.prototype.isInBoat = function() {
    return this._vehicleType === "boat";
};

Game_Player.prototype.isInShip = function() {
    return this._vehicleType === "ship";
};

Game_Player.prototype.isInAirship = function() {
    return this._vehicleType === "airship";
};

Game_Player.prototype.isInVehicle = function() {
    return this.isInBoat() || this.isInShip() || this.isInAirship();
};

Game_Player.prototype.isNormal = function() {
    return this._vehicleType === "walk" && !this.isMoveRouteForcing();
};

Game_Player.prototype.isDashing = function() {
    return this._dashing;
};

Game_Player.prototype.isDebugThrough = function() {
    return Input.isPressed("control") && $gameTemp.isPlaytest();
};

Game_Player.prototype.isCollided = function(x, y) {
    if (this.isThrough()) {
        return false;
    } else {
        return this.pos(x, y) || this._followers.isSomeoneCollided(x, y);
    }
};

Game_Player.prototype.centerX = function() {
    const span = $gameMap.screenTileX() - 1;
    const offset = $gameMap.reactorCameraOffset("x") / $gameMap.tileWidth() / $gameMap.reactorCameraZoom();
    if (offset === 0) return span / 2;
    return Math.max(0, Math.min(Math.max(0, span), span / 2 + offset));
};

Game_Player.prototype.centerY = function() {
    const span = $gameMap.screenTileY() - 1;
    const offset = $gameMap.reactorCameraOffset("y") / $gameMap.tileHeight() / $gameMap.reactorCameraZoom();
    if (offset === 0) return span / 2;
    return Math.max(0, Math.min(Math.max(0, span), span / 2 + offset));
};

Game_Player.prototype.center = function(x, y) {
    return $gameMap.setDisplayPos(x - this.centerX(), y - this.centerY());
};

Game_Player.prototype.locate = function(x, y) {
    Game_Character.prototype.locate.call(this, x, y);
    this.center(x, y);
    this.makeEncounterCount();
    if (this.isInVehicle()) {
        this.vehicle().refresh();
    }
    this._followers.synchronize(x, y, this.direction());
};

Game_Player.prototype.increaseSteps = function() {
    Game_Character.prototype.increaseSteps.call(this);
    if (this.isNormal()) {
        $gameParty.increaseSteps();
    }
};

Game_Player.prototype.makeEncounterCount = function() {
    const n = $gameMap.encounterStep();
    this._encounterCount = Math.randomInt(n) + Math.randomInt(n) + 1;
};

Game_Player.prototype.makeEncounterTroopId = function() {
    const encounterList = [];
    let weightSum = 0;
    for (const encounter of $gameMap.encounterList()) {
        if (this.meetsEncounterConditions(encounter)) {
            encounterList.push(encounter);
            weightSum += encounter.weight;
        }
    }
    if (weightSum > 0) {
        let value = Math.randomInt(weightSum);
        for (const encounter of encounterList) {
            value -= encounter.weight;
            if (value < 0) {
                return encounter.troopId;
            }
        }
    }
    return 0;
};

Game_Player.prototype.meetsEncounterConditions = function(encounter) {
    // Region IDs run 1 to 255. A set of only 0 is how editor builds before
    // 0.99.1 stored "Whole Map", so it counts as the whole map.
    const regionSet = encounter.regionSet || [];
    return (
        regionSet.length === 0 ||
        (regionSet.length === 1 && regionSet[0] === 0) ||
        regionSet.includes(this.regionId())
    );
};

Game_Player.prototype.executeEncounter = function() {
    if (!$gameMap.isEventRunning() && this._encounterCount <= 0) {
        this.makeEncounterCount();
        const troopId = this.makeEncounterTroopId();
        if ($dataTroops[troopId]) {
            BattleManager.setup(troopId, true, false);
            BattleManager.onEncounter();
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
};

Game_Player.prototype.startMapEvent = function(x, y, triggers, normal) {
    if (!$gameMap.isEventRunning()) {
        for (const event of $gameMap.eventsXy(x, y)) {
            if (
                event.isTriggerIn(triggers) &&
                event.isNormalPriority() === normal
            ) {
                event.start();
            }
        }
    }
};

Game_Player.prototype.moveByInput = function() {
    if (!this.isMoving() && this.canMove()) {
        let direction = this.getInputDirection();
        if (direction > 0) {
            $gameTemp.clearDestination();
            this._walkedToDestination = false;
        } else if ($gameTemp.isDestinationValid()) {
            const x = $gameTemp.destinationX();
            const y = $gameTemp.destinationY();
            direction = this.findDirectionTo(x, y);
            // A click on the border tile the player already stands on, facing out, is the step across
            // the border; a walk that only ends there stops there.
            if (direction > 0) {
                this._walkedToDestination = true;
            } else if (x === this.x && y === this.y) {
                const walked = this._walkedToDestination;
                this._walkedToDestination = false;
                if (!walked && this.leaveByBorder(this.direction())) {
                    return;
                }
            }
        }
        if (direction > 0) {
            this.executeMove(direction);
        }
    }
};

Game_Player.prototype.canMove = function() {
    if ($gameMap.isEventRunning() || $gameMessage.isBusy()) {
        return false;
    }
    if (this.isMoveRouteForcing() || this.areFollowersGathering()) {
        return false;
    }
    if (this._vehicleGettingOn || this._vehicleGettingOff) {
        return false;
    }
    if (this.isInVehicle() && !this.vehicle().canMove()) {
        return false;
    }
    return true;
};

// Database › System 1 › Options › Diagonal movement (System.json "reactorDiagonalMove": true): two arrow
// keys held together walk diagonally. A project without the key walks in four directions, as it always did.
Game_Player.prototype.isDiagonalMoveOn = function() {
    return !!(typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.reactorDiagonalMove === true);
};

Game_Player.prototype.getInputDirection = function() {
    return this.isDiagonalMoveOn() ? Input.dir8 : Input.dir4;
};

Game_Player.prototype.executeMove = function(direction) {
    if (direction === 1 || direction === 3 || direction === 7 || direction === 9) {
        const horz = direction === 1 || direction === 7 ? 4 : 6;
        const vert = direction <= 3 ? 2 : 8;
        // Blocked on the diagonal: it slides along the wall, up or down first, then sideways.
        this.moveDiagonally(horz, vert);
        if (!this.isMovementSucceeded()) this.moveStraight(vert);
        if (!this.isMovementSucceeded()) this.moveStraight(horz);
        return;
    }
    this.moveStraight(direction);
};

Game_Player.prototype.update = function(sceneActive) {
    const lastScrolledX = this.scrolledX();
    const lastScrolledY = this.scrolledY();
    const wasMoving = this.isMoving();
    this.updateDashing();
    if (sceneActive) {
        this.moveByInput();
    }
    Game_Character.prototype.update.call(this);
    this.updateScroll(lastScrolledX, lastScrolledY);
    this.updateVehicle();
    if (!this.isMoving()) {
        this.updateNonmoving(wasMoving, sceneActive);
    }
    this._followers.update();
};

Game_Player.prototype.updateDashing = function() {
    if (this.isMoving()) {
        return;
    }
    if (this.canMove() && !this.isInVehicle() && !$gameMap.isDashDisabled()) {
        this._dashing =
            this.isDashButtonPressed() || $gameTemp.isDestinationValid();
    } else {
        this._dashing = false;
    }
};

Game_Player.prototype.isDashButtonPressed = function() {
    const shift = Input.isPressed("shift");
    if (ConfigManager.alwaysDash) {
        return !shift;
    } else {
        return shift;
    }
};

Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
    const x1 = lastScrolledX;
    const y1 = lastScrolledY;
    const x2 = this.scrolledX();
    const y2 = this.scrolledY();
    if (y2 > y1 && y2 > this.centerY()) {
        $gameMap.scrollDown(y2 - y1);
    }
    if (x2 < x1 && x2 < this.centerX()) {
        $gameMap.scrollLeft(x1 - x2);
    }
    if (x2 > x1 && x2 > this.centerX()) {
        $gameMap.scrollRight(x2 - x1);
    }
    if (y2 < y1 && y2 < this.centerY()) {
        $gameMap.scrollUp(y1 - y2);
    }
};

Game_Player.prototype.updateVehicle = function() {
    if (this.isInVehicle() && !this.areFollowersGathering()) {
        if (this._vehicleGettingOn) {
            this.updateVehicleGetOn();
        } else if (this._vehicleGettingOff) {
            this.updateVehicleGetOff();
        } else {
            this.vehicle().syncWithPlayer();
        }
    }
};

Game_Player.prototype.updateVehicleGetOn = function() {
    if (!this.areFollowersGathering() && !this.isMoving()) {
        this.setDirection(this.vehicle().direction());
        this.setMoveSpeed(this.vehicle().moveSpeed());
        this._vehicleGettingOn = false;
        this.setTransparent(true);
        if (this.isInAirship()) {
            this.setThrough(true);
        }
        this.vehicle().getOn();
    }
};

Game_Player.prototype.updateVehicleGetOff = function() {
    if (!this.areFollowersGathering() && this.vehicle().isLowest()) {
        this._vehicleGettingOff = false;
        this._vehicleType = "walk";
        this.setTransparent(false);
    }
};

Game_Player.prototype.updateNonmoving = function(wasMoving, sceneActive) {
    if (!$gameMap.isEventRunning()) {
        if (wasMoving) {
            $gameParty.onPlayerWalk();
            this.checkEventTriggerHere([1, 2]);
            if ($gameMap.setupStartingEvent()) {
                return;
            }
        }
        if (sceneActive && this.triggerAction()) {
            return;
        }
        if (wasMoving) {
            this.updateEncounterCount();
        } else {
            $gameTemp.clearDestination();
        }
    }
};

Game_Player.prototype.triggerAction = function() {
    if (this.canMove()) {
        if (this.triggerButtonAction()) {
            return true;
        }
        if (this.triggerTouchAction()) {
            return true;
        }
    }
    return false;
};

Game_Player.prototype.triggerButtonAction = function() {
    if (Input.isTriggered("ok")) {
        if (this.getOnOffVehicle()) {
            return true;
        }
        this.checkEventTriggerHere([0]);
        if ($gameMap.setupStartingEvent()) {
            return true;
        }
        this.checkEventTriggerThere([0, 1, 2]);
        if ($gameMap.setupStartingEvent()) {
            return true;
        }
    }
    return false;
};

Game_Player.prototype.triggerTouchAction = function() {
    if ($gameTemp.isDestinationValid()) {
        const direction = this.direction();
        const x1 = this.x;
        const y1 = this.y;
        const x2 = $gameMap.roundXWithDirection(x1, direction);
        const y2 = $gameMap.roundYWithDirection(y1, direction);
        const x3 = $gameMap.roundXWithDirection(x2, direction);
        const y3 = $gameMap.roundYWithDirection(y2, direction);
        const destX = $gameTemp.destinationX();
        const destY = $gameTemp.destinationY();
        if (destX === x1 && destY === y1) {
            return this.triggerTouchActionD1(x1, y1);
        } else if (destX === x2 && destY === y2) {
            return this.triggerTouchActionD2(x2, y2);
        } else if (destX === x3 && destY === y3) {
            return this.triggerTouchActionD3(x2, y2);
        }
    }
    return false;
};

Game_Player.prototype.triggerTouchActionD1 = function(x1, y1) {
    if ($gameMap.airship().pos(x1, y1)) {
        if (TouchInput.isTriggered() && this.getOnOffVehicle()) {
            return true;
        }
    }
    this.checkEventTriggerHere([0]);
    return $gameMap.setupStartingEvent();
};

Game_Player.prototype.triggerTouchActionD2 = function(x2, y2) {
    if ($gameMap.boat().pos(x2, y2) || $gameMap.ship().pos(x2, y2)) {
        if (TouchInput.isTriggered() && this.getOnVehicle()) {
            return true;
        }
    }
    if (this.isInBoat() || this.isInShip()) {
        if (TouchInput.isTriggered() && this.getOffVehicle()) {
            return true;
        }
    }
    this.checkEventTriggerThere([0, 1, 2]);
    return $gameMap.setupStartingEvent();
};

Game_Player.prototype.triggerTouchActionD3 = function(x2, y2) {
    if ($gameMap.isCounter(x2, y2)) {
        this.checkEventTriggerThere([0, 1, 2]);
    }
    return $gameMap.setupStartingEvent();
};

Game_Player.prototype.updateEncounterCount = function() {
    if (this.canEncounter()) {
        this._encounterCount -= this.encounterProgressValue();
    }
};

Game_Player.prototype.canEncounter = function() {
    return (
        !$gameParty.hasEncounterNone() &&
        $gameSystem.isEncounterEnabled() &&
        !this.isInAirship() &&
        !this.isMoveRouteForcing() &&
        !this.isDebugThrough()
    );
};

Game_Player.prototype.encounterProgressValue = function() {
    let value = $gameMap.isBush(this.x, this.y) ? 2 : 1;
    if ($gameParty.hasEncounterHalf()) {
        value *= 0.5;
    }
    if (this.isInShip()) {
        value *= 0.5;
    }
    return value;
};

Game_Player.prototype.checkEventTriggerHere = function(triggers) {
    if (this.canStartLocalEvents()) {
        this.startMapEvent(this.x, this.y, triggers, false);
    }
};

Game_Player.prototype.checkEventTriggerThere = function(triggers) {
    if (this.canStartLocalEvents()) {
        const direction = this.direction();
        const x1 = this.x;
        const y1 = this.y;
        const x2 = $gameMap.roundXWithDirection(x1, direction);
        const y2 = $gameMap.roundYWithDirection(y1, direction);
        this.startMapEvent(x2, y2, triggers, true);
        if (!$gameMap.isAnyEventStarting() && $gameMap.isCounter(x2, y2)) {
            const x3 = $gameMap.roundXWithDirection(x2, direction);
            const y3 = $gameMap.roundYWithDirection(y2, direction);
            this.startMapEvent(x3, y3, triggers, true);
        }
    }
};

Game_Player.prototype.checkEventTriggerTouch = function(x, y) {
    if (this.canStartLocalEvents()) {
        this.startMapEvent(x, y, [1, 2], true);
    }
};

Game_Player.prototype.canStartLocalEvents = function() {
    return !this.isInAirship();
};

Game_Player.prototype.getOnOffVehicle = function() {
    if (this.isInVehicle()) {
        return this.getOffVehicle();
    } else {
        return this.getOnVehicle();
    }
};

Game_Player.prototype.getOnVehicle = function() {
    const direction = this.direction();
    const x1 = this.x;
    const y1 = this.y;
    const x2 = $gameMap.roundXWithDirection(x1, direction);
    const y2 = $gameMap.roundYWithDirection(y1, direction);
    if ($gameMap.airship().pos(x1, y1)) {
        this._vehicleType = "airship";
    } else if ($gameMap.ship().pos(x2, y2)) {
        this._vehicleType = "ship";
    } else if ($gameMap.boat().pos(x2, y2)) {
        this._vehicleType = "boat";
    }
    if (this.isInVehicle()) {
        this._vehicleGettingOn = true;
        if (!this.isInAirship()) {
            this.forceMoveForward();
        }
        this.gatherFollowers();
    }
    return this._vehicleGettingOn;
};

Game_Player.prototype.getOffVehicle = function() {
    if (this.vehicle().isLandOk(this.x, this.y, this.direction())) {
        if (this.isInAirship()) {
            this.setDirection(2);
        }
        this._followers.synchronize(this.x, this.y, this.direction());
        this.vehicle().getOff();
        if (!this.isInAirship()) {
            this.forceMoveForward();
            this.setTransparent(false);
        }
        this._vehicleGettingOff = true;
        this.setMoveSpeed(4);
        this.setThrough(false);
        this.makeEncounterCount();
        this.gatherFollowers();
    }
    return this._vehicleGettingOff;
};

Game_Player.prototype.forceMoveForward = function() {
    this.setThrough(true);
    this.moveForward();
    this.setThrough(false);
};

Game_Player.prototype.isOnDamageFloor = function() {
    return $gameMap.isDamageFloor(this.x, this.y) && !this.isInAirship();
};

Game_Player.prototype.moveStraight = function(d) {
    if (this.leaveByBorder(d)) {
        this.setMovementSuccess(false);
        return;
    }
    if (this.canPass(this.x, this.y, d)) {
        this._followers.updateMove();
    }
    Game_Character.prototype.moveStraight.call(this, d);
};

Game_Player.prototype.moveDiagonally = function(horz, vert) {
    if (this.canPassDiagonally(this.x, this.y, horz, vert)) {
        this._followers.updateMove();
    }
    Game_Character.prototype.moveDiagonally.call(this, horz, vert);
};

Game_Player.prototype.jump = function(xPlus, yPlus) {
    Game_Character.prototype.jump.call(this, xPlus, yPlus);
    this._followers.jumpAll();
};

Game_Player.prototype.showFollowers = function() {
    this._followers.show();
};

Game_Player.prototype.hideFollowers = function() {
    this._followers.hide();
};

Game_Player.prototype.gatherFollowers = function() {
    this._followers.gather();
};

Game_Player.prototype.areFollowersGathering = function() {
    return this._followers.areGathering();
};

Game_Player.prototype.areFollowersGathered = function() {
    return this._followers.areGathered();
};

//-----------------------------------------------------------------------------
// Game_Follower
//
// The game object class for a follower. A follower is an allied character,
// other than the front character, displayed in the party.

function Game_Follower() {
    this.initialize(...arguments);
}

Game_Follower.prototype = Object.create(Game_Character.prototype);
Game_Follower.prototype.constructor = Game_Follower;

Game_Follower.prototype.initialize = function(memberIndex) {
    Game_Character.prototype.initialize.call(this);
    this._memberIndex = memberIndex;
    this.setTransparent($dataSystem.optTransparent);
    this.setThrough(true);
};

Game_Follower.prototype.refresh = function() {
    const characterName = this.isVisible() ? this.actor().characterName() : "";
    const characterIndex = this.isVisible() ? this.actor().characterIndex() : 0;
    this.setImage(characterName, characterIndex);
};

Game_Follower.prototype.actor = function() {
    return $gameParty.battleMembers()[this._memberIndex];
};

Game_Follower.prototype.isVisible = function() {
    return this.actor() && $gamePlayer.followers().isVisible();
};

Game_Follower.prototype.isGathered = function() {
    return !this.isMoving() && this.pos($gamePlayer.x, $gamePlayer.y);
};

Game_Follower.prototype.update = function() {
    Game_Character.prototype.update.call(this);
    this.setMoveSpeed($gamePlayer.realMoveSpeed());
    this.setOpacity($gamePlayer.opacity());
    this.setBlendMode($gamePlayer.blendMode());
    this.setWalkAnime($gamePlayer.hasWalkAnime());
    this.setStepAnime($gamePlayer.hasStepAnime());
    this.setDirectionFix($gamePlayer.isDirectionFixed());
    this.setTransparent($gamePlayer.isTransparent());
};

Game_Follower.prototype.chaseCharacter = function(character) {
    const sx = this.deltaXFrom(character.x);
    const sy = this.deltaYFrom(character.y);
    if (sx !== 0 && sy !== 0) {
        this.moveDiagonally(sx > 0 ? 4 : 6, sy > 0 ? 8 : 2);
    } else if (sx !== 0) {
        this.moveStraight(sx > 0 ? 4 : 6);
    } else if (sy !== 0) {
        this.moveStraight(sy > 0 ? 8 : 2);
    }
    this.setMoveSpeed($gamePlayer.realMoveSpeed());
};

//-----------------------------------------------------------------------------
// Game_Followers
//
// The wrapper class for a follower array.

function Game_Followers() {
    this.initialize(...arguments);
}

Game_Followers.prototype.initialize = function() {
    this._visible = $dataSystem.optFollowers;
    this._gathering = false;
    this._data = [];
    this.setup();
};

Game_Followers.prototype.setup = function() {
    this._data = [];
    for (let i = 1; i < $gameParty.maxBattleMembers(); i++) {
        this._data.push(new Game_Follower(i));
    }
};

/**
 * A follower as the character of Set Movement Route, Show Animation and
 * Show Balloon Icon: this number plus its place in the line (1 the first).
 * An event id no map has, so a runtime that knows no followers finds no
 * such event and leaves the command out.
 */
Game_Followers.CHARACTER_ID = 1000000;

/**
 * The place in the line (1 the first follower) a character id names, or 0
 * for any other: the editor's ids, and -2, -3, ... as plugins number them.
 */
Game_Followers.placeOfCharacterId = function(id) {
    id = Number(id);
    if (id <= -2) {
        return Math.floor(-id) - 1;
    }
    if (id > Game_Followers.CHARACTER_ID) {
        return Math.floor(id) - Game_Followers.CHARACTER_ID;
    }
    return 0;
};

Game_Followers.prototype.isVisible = function() {
    return this._visible;
};

Game_Followers.prototype.show = function() {
    this._visible = true;
};

Game_Followers.prototype.hide = function() {
    this._visible = false;
};

Game_Followers.prototype.data = function() {
    return this._data.clone();
};

Game_Followers.prototype.reverseData = function() {
    return this._data.clone().reverse();
};

Game_Followers.prototype.follower = function(index) {
    return this._data[index];
};

Game_Followers.prototype.refresh = function() {
    for (const follower of this._data) {
        follower.refresh();
    }
};

Game_Followers.prototype.update = function() {
    if (this.areGathering()) {
        if (!this.areMoving()) {
            this.updateMove();
        }
        if (this.areGathered()) {
            this._gathering = false;
        }
    }
    for (const follower of this._data) {
        follower.update();
    }
};

Game_Followers.prototype.updateMove = function() {
    for (let i = this._data.length - 1; i >= 0; i--) {
        const precedingCharacter = i > 0 ? this._data[i - 1] : $gamePlayer;
        this._data[i].chaseCharacter(precedingCharacter);
    }
};

Game_Followers.prototype.jumpAll = function() {
    if ($gamePlayer.isJumping()) {
        for (const follower of this._data) {
            const sx = $gamePlayer.deltaXFrom(follower.x);
            const sy = $gamePlayer.deltaYFrom(follower.y);
            follower.jump(sx, sy);
        }
    }
};

Game_Followers.prototype.synchronize = function(x, y, d) {
    for (const follower of this._data) {
        follower.locate(x, y);
        follower.setDirection(d);
    }
};

Game_Followers.prototype.gather = function() {
    this._gathering = true;
};

Game_Followers.prototype.areGathering = function() {
    return this._gathering;
};

Game_Followers.prototype.visibleFollowers = function() {
    return this._data.filter(follower => follower.isVisible());
};

Game_Followers.prototype.areMoving = function() {
    return this.visibleFollowers().some(follower => follower.isMoving());
};

Game_Followers.prototype.areGathered = function() {
    return this.visibleFollowers().every(follower => follower.isGathered());
};

Game_Followers.prototype.isSomeoneCollided = function(x, y) {
    return this.visibleFollowers().some(follower => follower.pos(x, y));
};

//-----------------------------------------------------------------------------
// Game_Vehicle
//
// The game object class for a vehicle.

function Game_Vehicle() {
    this.initialize(...arguments);
}

Game_Vehicle.prototype = Object.create(Game_Character.prototype);
Game_Vehicle.prototype.constructor = Game_Vehicle;

Game_Vehicle.prototype.initialize = function(type) {
    Game_Character.prototype.initialize.call(this);
    this._type = type;
    this.resetDirection();
    this.initMoveSpeed();
    this.loadSystemSettings();
};

Game_Vehicle.prototype.initMembers = function() {
    Game_Character.prototype.initMembers.call(this);
    this._type = "";
    this._mapId = 0;
    this._altitude = 0;
    this._driving = false;
    this._bgm = null;
};

Game_Vehicle.prototype.isBoat = function() {
    return this._type === "boat";
};

Game_Vehicle.prototype.isShip = function() {
    return this._type === "ship";
};

Game_Vehicle.prototype.isAirship = function() {
    return this._type === "airship";
};

Game_Vehicle.prototype.resetDirection = function() {
    this.setDirection(4);
};

Game_Vehicle.prototype.initMoveSpeed = function() {
    if (this.isBoat()) {
        this.setMoveSpeed(4);
    } else if (this.isShip()) {
        this.setMoveSpeed(5);
    } else if (this.isAirship()) {
        this.setMoveSpeed(6);
    }
};

Game_Vehicle.prototype.vehicle = function() {
    if (this.isBoat()) {
        return $dataSystem.boat;
    } else if (this.isShip()) {
        return $dataSystem.ship;
    } else if (this.isAirship()) {
        return $dataSystem.airship;
    } else {
        return null;
    }
};

Game_Vehicle.prototype.loadSystemSettings = function() {
    const vehicle = this.vehicle();
    this._mapId = vehicle.startMapId;
    this.setPosition(vehicle.startX, vehicle.startY);
    this.setImage(vehicle.characterName, vehicle.characterIndex);
};

Game_Vehicle.prototype.refresh = function() {
    if (this._driving) {
        this._mapId = $gameMap.mapId();
        this.syncWithPlayer();
    } else if (this._mapId === $gameMap.mapId()) {
        this.locate(this.x, this.y);
    }
    if (this.isAirship()) {
        this.setPriorityType(this._driving ? 2 : 0);
    } else {
        this.setPriorityType(1);
    }
    this.setWalkAnime(this._driving);
    this.setStepAnime(this._driving);
    this.setTransparent(this._mapId !== $gameMap.mapId());
};

Game_Vehicle.prototype.setLocation = function(mapId, x, y) {
    this._mapId = mapId;
    this.setPosition(x, y);
    this.refresh();
};

Game_Vehicle.prototype.pos = function(x, y) {
    if (this._mapId === $gameMap.mapId()) {
        return Game_Character.prototype.pos.call(this, x, y);
    } else {
        return false;
    }
};

Game_Vehicle.prototype.isMapPassable = function(x, y, d) {
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);
    if (this.isBoat()) {
        return $gameMap.isBoatPassable(x2, y2);
    } else if (this.isShip()) {
        return $gameMap.isShipPassable(x2, y2);
    } else if (this.isAirship()) {
        return true;
    } else {
        return false;
    }
};

Game_Vehicle.prototype.getOn = function() {
    this._driving = true;
    this.setWalkAnime(true);
    this.setStepAnime(true);
    const bgm=this._bgm || this.vehicle().bgm;
    this._rrVehicleBgm=!!bgm?.name;
    if (this._rrVehicleBgm) {
        $gameSystem.saveWalkingBgm();
        this.playBgm();
    }
};

Game_Vehicle.prototype.getOff = function() {
    this._driving = false;
    this.setWalkAnime(false);
    this.setStepAnime(false);
    this.resetDirection();
    if (this._rrVehicleBgm!==false) $gameSystem.replayWalkingBgm();
    delete this._rrVehicleBgm;
};

Game_Vehicle.prototype.setBgm = function(bgm) {
    this._bgm = bgm;
};

Game_Vehicle.prototype.playBgm = function() {
    AudioManager.playBgm(this._bgm || this.vehicle().bgm);
};

Game_Vehicle.prototype.syncWithPlayer = function() {
    this.copyPosition($gamePlayer);
    this.refreshBushDepth();
};

Game_Vehicle.prototype.screenY = function() {
    return Game_Character.prototype.screenY.call(this) - this._altitude;
};

Game_Vehicle.prototype.shadowX = function() {
    return this.screenX();
};

Game_Vehicle.prototype.shadowY = function() {
    return this.screenY() + this._altitude;
};

Game_Vehicle.prototype.shadowOpacity = function() {
    return (255 * this._altitude) / this.maxAltitude();
};

Game_Vehicle.prototype.canMove = function() {
    if (this.isAirship()) {
        return this.isHighest();
    } else {
        return true;
    }
};

Game_Vehicle.prototype.update = function() {
    Game_Character.prototype.update.call(this);
    if (this.isAirship()) {
        this.updateAirship();
    }
};

Game_Vehicle.prototype.updateAirship = function() {
    this.updateAirshipAltitude();
    this.setStepAnime(this.isHighest());
    this.setPriorityType(this.isLowest() ? 0 : 2);
};

Game_Vehicle.prototype.updateAirshipAltitude = function() {
    if (this._driving && !this.isHighest()) {
        this._altitude++;
    }
    if (!this._driving && !this.isLowest()) {
        this._altitude--;
    }
};

Game_Vehicle.prototype.maxAltitude = function() {
    return 48;
};

Game_Vehicle.prototype.isLowest = function() {
    return this._altitude <= 0;
};

Game_Vehicle.prototype.isHighest = function() {
    return this._altitude >= this.maxAltitude();
};

Game_Vehicle.prototype.isTakeoffOk = function() {
    return $gamePlayer.areFollowersGathered();
};

Game_Vehicle.prototype.isLandOk = function(x, y, d) {
    if (this.isAirship()) {
        if (!$gameMap.isAirshipLandOk(x, y)) {
            return false;
        }
        if ($gameMap.eventsXy(x, y).length > 0) {
            return false;
        }
    } else {
        const x2 = $gameMap.roundXWithDirection(x, d);
        const y2 = $gameMap.roundYWithDirection(y, d);
        if (!$gameMap.isValid(x2, y2)) {
            return false;
        }
        if (!$gameMap.isPassable(x2, y2, this.reverseDir(d))) {
            return false;
        }
        if (this.isCollidedWithCharacters(x2, y2)) {
            return false;
        }
    }
    return true;
};

//-----------------------------------------------------------------------------
// Game_Event
//
// The game object class for an event. It contains functionality for event page
// switching and running parallel process events.

function Game_Event() {
    this.initialize(...arguments);
}

Game_Event.prototype = Object.create(Game_Character.prototype);
Game_Event.prototype.constructor = Game_Event;

Game_Event.prototype.initialize = function(mapId, eventId) {
    Game_Character.prototype.initialize.call(this);
    this._mapId = mapId;
    this._eventId = eventId;
    this.locate(this.event().x, this.event().y);
    this.refresh();
};

Game_Event.prototype.initMembers = function() {
    Game_Character.prototype.initMembers.call(this);
    this._moveType = 0;
    this._trigger = 0;
    this._starting = false;
    this._erased = false;
    this._pageIndex = -2;
    this._originalPattern = 1;
    this._originalDirection = 2;
    this._prelockDirection = 0;
    this._locked = false;
};

Game_Event.prototype.eventId = function() {
    return this._eventId;
};

Game_Event.prototype.event = function() {
    return $dataMap.events[this._eventId];
};

Game_Event.prototype.page = function() {
    return this.event().pages[this._pageIndex];
};

Game_Event.prototype.list = function() {
    return this.page().list;
};

Game_Event.prototype.isCollidedWithCharacters = function(x, y) {
    return (
        Game_Character.prototype.isCollidedWithCharacters.call(this, x, y) ||
        this.isCollidedWithPlayerCharacters(x, y)
    );
};

Game_Event.prototype.isCollidedWithEvents = function(x, y) {
    if (typeof Reactor3D !== "undefined" && Reactor3D.bodyMeetsEvents) {
        // Body against body: every tile this event would cover, turned as the
        // step turns it, against every tile the others cover. A long vehicle
        // does not plow through anyone, and nobody walks into its side.
        return Reactor3D.bodyMeetsEvents(this, x, y, this._reactorMoveDirection(x, y));
    }
    const events = $gameMap.eventsXyNt(x, y);
    return events.some(event => event !== this && event.isNormalPriority());
};

/** The facing a step onto (x, y) implies, for footprint sweep tests. */
Game_Event.prototype._reactorMoveDirection = function(x, y) {
    const dx = $gameMap.deltaX(x, this._x);
    const dy = $gameMap.deltaY(y, this._y);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 6 : 4;
    if (Math.abs(dy) > 0) return dy > 0 ? 2 : 8;
    return 0;
};

Game_Event.prototype.isCollidedWithPlayerCharacters = function(x, y) {
    if (!this.isNormalPriority()) return false;
    if (typeof Reactor3D !== "undefined" && Reactor3D.bodyMeetsParty) {
        // The whole body, against the player and the followers who are not walked through.
        return Reactor3D.bodyMeetsParty(this, x, y, this._reactorMoveDirection(x, y));
    }
    return $gamePlayer.isCollided(x, y);
};

Game_Event.prototype.lock = function() {
    if (!this._locked) {
        this._prelockDirection = this.direction();
        this.turnTowardPlayer();
        this._locked = true;
    }
};

Game_Event.prototype.unlock = function() {
    if (this._locked) {
        this._locked = false;
        this.setDirection(this._prelockDirection);
    }
};

Game_Event.prototype.updateStop = function() {
    if (this._locked) {
        this.resetStopCount();
    }
    Game_Character.prototype.updateStop.call(this);
    if (!this.isMoveRouteForcing()) {
        this.updateSelfMovement();
    }
};

Game_Event.prototype.updateSelfMovement = function() {
    if (
        !this._locked &&
        this.isNearTheScreen() &&
        this.checkStop(this.stopCountThreshold())
    ) {
        switch (this._moveType) {
            case 1:
                this.moveTypeRandom();
                break;
            case 2:
                this.moveTypeTowardPlayer();
                break;
            case 3:
                this.moveTypeCustom();
                break;
        }
    }
};

Game_Event.prototype.stopCountThreshold = function() {
    return 30 * (5 - this.moveFrequency());
};

Game_Event.prototype.moveTypeRandom = function() {
    switch (Math.randomInt(6)) {
        case 0:
        case 1:
            this.moveRandom();
            break;
        case 2:
        case 3:
        case 4:
            this.moveForward();
            break;
        case 5:
            this.resetStopCount();
            break;
    }
};

Game_Event.prototype.moveTypeTowardPlayer = function() {
    if (this.isNearThePlayer()) {
        switch (Math.randomInt(6)) {
            case 0:
            case 1:
            case 2:
            case 3:
                this.moveTowardPlayer();
                break;
            case 4:
                this.moveRandom();
                break;
            case 5:
                this.moveForward();
                break;
        }
    } else {
        this.moveRandom();
    }
};

Game_Event.prototype.isNearThePlayer = function() {
    const sx = Math.abs(this.deltaXFrom($gamePlayer.x));
    const sy = Math.abs(this.deltaYFrom($gamePlayer.y));
    return sx + sy < 20;
};

Game_Event.prototype.moveTypeCustom = function() {
    this.updateRoutineMove();
};

Game_Event.prototype.isStarting = function() {
    return this._starting;
};

Game_Event.prototype.clearStartingFlag = function() {
    this._starting = false;
};

Game_Event.prototype.isTriggerIn = function(triggers) {
    return triggers.includes(this._trigger);
};

Game_Event.prototype.start = function() {
    const list = this.list();
    if (list && list.length > 1) {
        this._starting = true;
        if (this.isTriggerIn([0, 1, 2])) {
            this.lock();
        }
    }
};

Game_Event.prototype.erase = function() {
    this._erased = true;
    this.refresh();
};

Game_Event.prototype.refresh = function() {
    const newPageIndex = this._erased ? -1 : this.findProperPageIndex();
    if (this._pageIndex !== newPageIndex) {
        this._pageIndex = newPageIndex;
        this.setupPage();
    }
};

Game_Event.prototype.findProperPageIndex = function() {
    const pages = this.event().pages;
    for (let i = pages.length - 1; i >= 0; i--) {
        const page = pages[i];
        if (this.meetsConditions(page)) {
            return i;
        }
    }
    return -1;
};

/** Whether a page of this map waits on the timer (rrTimerSec); worked out once per map's data, never saved. */
Game_Map.prototype.rrHasTimerPages = function() {
    if (typeof $dataMap === "undefined" || !$dataMap) return false;
    if ($dataMap._rrTimerPages === undefined) {
        $dataMap._rrTimerPages = ($dataMap.events || []).some(e => e && (e.pages || []).some(p => p && p.conditions && p.conditions.rrTimerSec !== undefined));
    }
    return $dataMap._rrTimerPages;
};

Game_Event.prototype.meetsConditions = function(page) {
    const c = page.conditions;
    if (c.switch1Valid) {
        if (!$gameSwitches.value(c.switch1Id)) {
            return false;
        }
    }
    if (c.switch2Valid) {
        if (!$gameSwitches.value(c.switch2Id)) {
            return false;
        }
    }
    if (c.variableValid) {
        // an imported 2003 page may compare another way: rrVariableOp 0 ==, 1 >=, 2 <=, 3 >, 4 <, 5 !=
        const value = $gameVariables.value(c.variableId), n = c.variableValue;
        const met = c.rrVariableOp === undefined ? value >= n : [value === n, value >= n, value <= n, value > n, value < n, value !== n][c.rrVariableOp];
        if (!met) {
            return false;
        }
    }
    // an imported 2000/2003 page may wait on the timer (rrTimerSec): met at that many whole seconds left or
    // fewer, running or not, as EasyRPG's Game_Event::AreConditionsMet reads it
    if (c.rrTimerSec !== undefined && $gameTimer.seconds() > c.rrTimerSec) {
        return false;
    }
    if (c.selfSwitchValid) {
        const key = [this._mapId, this._eventId, c.selfSwitchCh];
        if ($gameSelfSwitches.value(key) !== true) {
            return false;
        }
    }
    if (c.itemValid) {
        const item = $dataItems[c.itemId];
        if (!$gameParty.hasItem(item)) {
            return false;
        }
    }
    if (c.actorValid) {
        const actor = $gameActors.actor(c.actorId);
        if (!$gameParty.members().includes(actor)) {
            return false;
        }
    }
    return true;
};

Game_Event.prototype.setupPage = function() {
    if (this._pageIndex >= 0) {
        this.setupPageSettings();
    } else {
        this.clearPageSettings();
    }
    this.refreshBushDepth();
    this.clearStartingFlag();
    this.checkEventTriggerAuto();
};

Game_Event.prototype.clearPageSettings = function() {
    this.setImage("", 0);
    this.reactorSetupPageImage(null);
    this._moveType = 0;
    this._trigger = null;
    this._interpreter = null;
    this.setThrough(true);
};

/**
 * A page's Image options (`page.rrImage = { mirror, flip, angle, pivot }`):
 * the page starts its picture turned that way. A page without them leaves a
 * turn a route gave the event as it is, unless the page before set one: that
 * turn was the page's and goes with it. Plain MZ pages never touch it.
 */
Game_Event.prototype.reactorSetupPageImage = function(page) {
    if (!Game_CharacterBase.rrTransformsOn()) return;
    const image = page && page.rrImage;
    if (image && typeof image === "object") {
        this.reactorSetImage(image);
        this._rrPageImage = true;
    } else if (this._rrPageImage) {
        this.reactorSetImage(null);
        this._rrPageImage = undefined;
    }
};

Game_Event.prototype.setupPageSettings = function() {
    const page = this.page();
    const image = page.image;
    if (image.tileId > 0) {
        this.setTileImage(image.tileId);
    } else {
        this.setImage(image.characterName, image.characterIndex);
    }
    if (this._originalDirection !== image.direction) {
        this._originalDirection = image.direction;
        this._prelockDirection = 0;
        this.setDirectionFix(false);
        this.setDirection(image.direction);
    }
    if (this._originalPattern !== image.pattern) {
        this._originalPattern = image.pattern;
        this.setPattern(image.pattern);
    }
    this.setMoveSpeed(page.moveSpeed);
    this.setMoveFrequency(page.moveFrequency);
    this.setPriorityType(page.priorityType);
    this.setWalkAnime(page.walkAnime);
    this.setStepAnime(page.stepAnime);
    this.setDirectionFix(page.directionFix);
    this.setThrough(page.through);
    this.setMoveRoute(page.moveRoute);
    this.reactorSetupPageImage(page);
    this._moveType = page.moveType;
    this._trigger = page.trigger;
    if (this._trigger === 4) {
        this._interpreter = new Game_Interpreter();
    } else {
        this._interpreter = null;
    }
};

Game_Event.prototype.isOriginalPattern = function() {
    return this.pattern() === this._originalPattern;
};

Game_Event.prototype.resetPattern = function() {
    this.setPattern(this._originalPattern);
};

Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
    if (!$gameMap.isEventRunning()) {
        // An event touches with its whole body: the step it was refused would have put a tile of it on the player.
        if (this._trigger === 2 && (typeof Reactor3D !== "undefined" && Reactor3D.bodyTouchesPlayer
            ? Reactor3D.bodyTouchesPlayer(this, x, y) : $gamePlayer.pos(x, y))) {
            if (!this.isJumping() && this.isNormalPriority()) {
                this.start();
            }
        }
    }
};

Game_Event.prototype.checkEventTriggerAuto = function() {
    if (this._trigger === 3) {
        this.start();
    }
};

Game_Event.prototype.update = function() {
    Game_Character.prototype.update.call(this);
    this.checkEventTriggerAuto();
    this.updateParallel();
};

Game_Event.prototype.updateParallel = function() {
    if (this._interpreter) {
        if (!this._interpreter.isRunning()) {
            this._interpreter.setup(this.list(), this._eventId);
        }
        this._interpreter.update();
    }
};

Game_Event.prototype.locate = function(x, y) {
    Game_Character.prototype.locate.call(this, x, y);
    this._prelockDirection = 0;
};

Game_Event.prototype.forceMoveRoute = function(moveRoute) {
    Game_Character.prototype.forceMoveRoute.call(this, moveRoute);
    this._prelockDirection = 0;
};

Game_Event.prototype.pos = function(x, y) {
    // An event is at every tile its body covers (Reactor3D.eventBody).
    if (typeof Reactor3D !== "undefined" && Reactor3D.eventBodyCovers) {
        return Reactor3D.eventBodyCovers(this, x, y);
    }
    return this._x === x && this._y === y;
};
