//=============================================================================
// PSYCHRONIC_MovementDebug.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.0.0] Movement Debug Tool
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_MovementDebug.js
 *
 * Console-driven diagnostic tool for debugging event movement issues.
 * Open the developer console (F12) in the PLAYTEST window and use:
 *
 *   debugEvent(eventId)  - Full movement diagnostic for a specific event
 *   debugTile(x, y)      - Inspect what's at a specific tile
 *   debugStuck()         - Auto-find events that appear stuck
 *
 * No plugin parameters. No UI elements. Just console diagnostics.
 */

(function() {
    "use strict";

    // ── Constants ──────────────────────────────────────────────────────
    var PRIORITY_LABELS = {
        0: "Below Characters",
        1: "Same as Characters",
        2: "Above Characters"
    };

    var DIR_NAMES = { 2: "Down", 4: "Left", 6: "Right", 8: "Up" };
    var DIR_DX    = { 2: 0, 4: -1, 6: 1, 8: 0 };
    var DIR_DY    = { 2: 1, 4: 0,  6: 0, 8: -1 };

    var PASS_STYLE = "color: #4CAF50; font-weight: bold";
    var FAIL_STYLE = "color: #F44336; font-weight: bold";
    var WARN_STYLE = "color: #FF9800; font-weight: bold";
    var HEAD_STYLE = "color: #2196F3; font-weight: bold; font-size: 13px";
    var DIM_STYLE  = "color: #999";

    // ═══════════════════════════════════════════════════════════════════
    // debugEvent(eventId)
    // ═══════════════════════════════════════════════════════════════════
    window.debugEvent = function(eventId) {
        if (!$gameMap) {
            console.log("No map loaded.");
            return;
        }

        var event = $gameMap.event(eventId);
        if (!event) {
            console.log("Event " + eventId + " not found on this map.");
            return;
        }

        var name = event.event().name || "(unnamed)";
        var x = event.x;
        var y = event.y;
        var pType = event._priorityType;
        var pLabel = PRIORITY_LABELS[pType] || "Unknown";
        var through = event.isThrough();

        console.log(
            "%c=== Event " + eventId + ': "' + name + '" ===',
            HEAD_STYLE
        );
        console.log(
            "Position: (" + x + ", " + y + ")  |  " +
            'Priority: ' + pType + ' "' + pLabel + '"  |  ' +
            "Through: " + through
        );
        console.log(
            "Direction: " + (DIR_NAMES[event.direction()] || event.direction()) + "  |  " +
            "MoveType: " + event._moveType + "  |  " +
            "MoveSpeed: " + event.moveSpeed() + "  |  " +
            "MoveFreq: " + event.moveFrequency()
        );

        if (event._moveType === 0) {
            console.log(
                "%cNote: This event has moveType 0 (Fixed). It won't move autonomously, " +
                "but may receive move routes via event commands.",
                DIM_STYLE
            );
        }

        // Check each direction
        var dirResults = [];
        var directions = [8, 6, 2, 4]; // Up, Right, Down, Left
        for (var di = 0; di < directions.length; di++) {
            var d = directions[di];
            var tx = $gameMap.roundXWithDirection(x, d);
            var ty = $gameMap.roundYWithDirection(y, d);
            var dirName = DIR_NAMES[d];

            var canPass = event.canPass(x, y, d);
            var mapPassable = event.isMapPassable(x, y, d);
            var collidedEvents = event.isCollidedWithEvents(tx, ty);

            dirResults.push({
                Direction: dirName,
                Target: "(" + tx + ", " + ty + ")",
                canPass: canPass,
                "Map Passable": mapPassable,
                "Event Collision": collidedEvents
            });

            if (!canPass) {
                var reasons = [];
                if (!mapPassable) reasons.push("tileset impassable");
                if (collidedEvents) reasons.push("event collision");
                if (reasons.length === 0) reasons.push("other (possibly character collision)");

                console.log(
                    "  %c" + dirName + "%c → %cBLOCKED%c (" + reasons.join(", ") + ")  target: (" + tx + ", " + ty + ")",
                    "font-weight: bold", "", FAIL_STYLE, ""
                );

                // Detail blocking events
                if (collidedEvents) {
                    var blockers = $gameMap.eventsXyNt(tx, ty);
                    for (var bi = 0; bi < blockers.length; bi++) {
                        var blocker = blockers[bi];
                        var bName = blocker.event().name || "(unnamed)";
                        var bPType = blocker._priorityType;
                        var bPLabel = PRIORITY_LABELS[bPType] || "Unknown";
                        var bThrough = blocker.isThrough();

                        console.log(
                            '    → Event ' + blocker.eventId() + ' "' + bName + '" ' +
                            '(priority: ' + bPType + ' "' + bPLabel + '", through: ' + bThrough + ')'
                        );

                        if (bPType !== 1) {
                            console.log(
                                "    %c⚠ Event " + blocker.eventId() + ' "' + bName +
                                '" (priority: ' + bPType + ' "' + bPLabel + '") is blocking —\n' +
                                "      RMMZ BUG: Game_Event.isCollidedWithEvents blocks on ALL non-through events,\n" +
                                '      not just normal priority. This is fixed in the reactor corescript.\n' +
                                '      If still seeing this, the project may be using an older reactor_objects.js.',
                                WARN_STYLE
                            );
                        }
                    }
                }
            } else {
                console.log(
                    "  %c" + dirName + "%c → %cPASS%c  target: (" + tx + ", " + ty + ")",
                    "font-weight: bold", "", PASS_STYLE, ""
                );
            }
        }

        console.table(dirResults);
    };

    // ═══════════════════════════════════════════════════════════════════
    // debugTile(x, y)
    // ═══════════════════════════════════════════════════════════════════
    window.debugTile = function(x, y) {
        if (!$gameMap) {
            console.log("No map loaded.");
            return;
        }

        console.log("%c=== Tile (" + x + ", " + y + ") ===", HEAD_STYLE);

        // Region & Terrain
        var regionId = $gameMap.regionId(x, y);
        var terrainTag = $gameMap.terrainTag(x, y);
        console.log("Region ID: " + regionId + "  |  Terrain Tag: " + terrainTag);

        // Tileset passability per direction
        var passability = {};
        var dirs = [2, 4, 6, 8];
        for (var i = 0; i < dirs.length; i++) {
            passability[DIR_NAMES[dirs[i]]] = $gameMap.isPassable(x, y, dirs[i]);
        }
        console.log("Tileset Passability:");
        console.table(passability);

        // Raw tile flags
        var flags = $gameMap.tilesetFlags();
        var tiles = $gameMap.allTiles(x, y);
        if (tiles.length > 0) {
            console.log("%cRaw Tile Data:", DIM_STYLE);
            var tileData = [];
            for (var t = 0; t < tiles.length; t++) {
                var tileId = tiles[t];
                tileData.push({
                    Layer: t,
                    "Tile ID": tileId,
                    "Flags (hex)": tileId > 0 ? "0x" + (flags[tileId] || 0).toString(16).toUpperCase() : "—",
                    "Flags (dec)": tileId > 0 ? (flags[tileId] || 0) : "—"
                });
            }
            console.table(tileData);
        }

        // Events at this tile
        var allEvents = $gameMap.eventsXy(x, y);
        if (allEvents.length === 0) {
            console.log("No events at this tile.");
        } else {
            console.log("Events at tile (" + allEvents.length + "):");
            var eventRows = [];
            for (var e = 0; e < allEvents.length; e++) {
                var ev = allEvents[e];
                eventRows.push({
                    ID: ev.eventId(),
                    Name: ev.event().name || "(unnamed)",
                    Priority: ev._priorityType + ' "' + (PRIORITY_LABELS[ev._priorityType] || "?") + '"',
                    Through: ev.isThrough(),
                    Direction: DIR_NAMES[ev.direction()] || ev.direction(),
                    "Move Type": ev._moveType
                });
            }
            console.table(eventRows);

            // Non-through events (the ones that actually block)
            var ntBlockers = $gameMap.eventsXyNt(x, y);
            if (ntBlockers.length > 0) {
                console.log(
                    "%c" + ntBlockers.length + " non-through event(s) here — these will block other events via isCollidedWithEvents.",
                    WARN_STYLE
                );
                for (var b = 0; b < ntBlockers.length; b++) {
                    if (ntBlockers[b]._priorityType !== 1) {
                        console.log(
                            '  %c⚠ Event ' + ntBlockers[b].eventId() + ' "' + ntBlockers[b].event().name +
                            '" has priority ' + ntBlockers[b]._priorityType +
                            ' "' + (PRIORITY_LABELS[ntBlockers[b]._priorityType] || "?") +
                            '" but still blocks other events (RMMZ bug).',
                            WARN_STYLE
                        );
                    }
                }
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // debugStuck() — position tracking + auto-find
    // ═══════════════════════════════════════════════════════════════════

    var _positionHistory = {};
    var STUCK_THRESHOLD = 180; // frames (~3 seconds at 60fps)

    var _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _Game_Event_update.call(this);

        var id = this.eventId();
        if (!_positionHistory[id]) {
            _positionHistory[id] = { x: this.x, y: this.y, frames: 0 };
        }

        var hist = _positionHistory[id];
        if (hist.x === this.x && hist.y === this.y) {
            hist.frames++;
        } else {
            hist.x = this.x;
            hist.y = this.y;
            hist.frames = 0;
        }
    };

    var _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        for (var key in _positionHistory) {
            delete _positionHistory[key];
        }
    };

    window.debugStuck = function() {
        if (!$gameMap) {
            console.log("No map loaded.");
            return;
        }

        console.log("%c=== Stuck Event Scan ===", HEAD_STYLE);

        var events = $gameMap.events();
        var stuckEvents = [];

        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            if (!event) continue;
            var id = event.eventId();
            var hist = _positionHistory[id];

            if (event._moveType === 0) continue;

            var isStuck = hist && hist.frames >= STUCK_THRESHOLD;
            if (isStuck) {
                var name = event.event().name || "(unnamed)";
                var pType = event._priorityType;
                var seconds = (hist.frames / 60).toFixed(1);

                stuckEvents.push({
                    ID: id,
                    Name: name,
                    Position: "(" + event.x + ", " + event.y + ")",
                    Priority: pType + ' "' + (PRIORITY_LABELS[pType] || "?") + '"',
                    Through: event.isThrough(),
                    "Move Type": event._moveType,
                    "Stuck For": seconds + "s (" + hist.frames + " frames)"
                });
            }
        }

        if (stuckEvents.length === 0) {
            var movingCount = 0;
            for (var j = 0; j < events.length; j++) {
                if (events[j] && events[j]._moveType > 0) movingCount++;
            }
            console.log(
                "%cNo stuck events detected. (Tracking " + movingCount +
                " moving events, threshold: " + (STUCK_THRESHOLD / 60).toFixed(1) + "s)",
                PASS_STYLE
            );
        } else {
            console.log(
                "%c" + stuckEvents.length + " potentially stuck event(s) found:",
                WARN_STYLE
            );
            console.table(stuckEvents);
            console.log(
                "%cTip: Use debugEvent(id) on any of these for a full movement breakdown.",
                DIM_STYLE
            );
        }
    };

    // ── Load confirmation ──────────────────────────────────────────────
    console.log(
        "%c[MovementDebug]%c Loaded — use debugEvent(id), debugTile(x,y), or debugStuck() in console.",
        "color: #2196F3; font-weight: bold", ""
    );
})();
