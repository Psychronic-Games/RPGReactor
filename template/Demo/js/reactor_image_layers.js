//=============================================================================
// reactor_image_layers.js
//=============================================================================
// Map image layers: pictures drawn with a map. A painted map (parallax
// mapping), fog, clouds, rain, a far background, a screen overlay; on maps
// shown in 2D and in 3D. `$dataMap.rrImageLayers` lists them in drawing order
// (within a position, a later layer is on top). Every field but `name` and
// `layer` is left out of the file at its default:
//
//   name       picture in img/parallaxes, no extension
//   layer      "back"   behind the map: under the tiles, over the map's parallax
//              "ground" below characters: over the lower tiles (default)
//              "same"   same as characters: sorted with them row by row, and
//                       its solid tiles stop movement (fit "map" only)
//              "over"   above characters and the upper tiles
//   fit        "map"    locked to the map, one picture the size of the map (default)
//              "repeat" tiled without end across the view
//              "fill"   stretched to the screen and fixed to it
//   repeat     the directions a repeating layer repeats in: left out for
//              across and down, "x" across only (a far mountain strip), "y"
//              down only (streaks of rain). In the other direction the picture
//              keeps its own size, lies once, and moves with the map by `follow`
//   drift      [x, y] pixels per second a repeating layer scrolls by itself,
//              right and down (negative: left and up); it scrolls only in a
//              direction it repeats in
//   follow     how much a repeating layer moves with the map: 1 lies on the
//              map (default), 0 stays on the screen, 0.5 looks far away
//   opacity    0..255 (default 255)
//   blendMode  0 normal, 1 add, 2 multiply, 3 screen
//   switch     ID of a switch: shown only while it is ON
//   when       { variable, op: "=" | ">=" | "<=", value }: shown only while
//              that variable passes the test
//   fade       seconds to appear and disappear when its conditions change
//   variable   ID of a variable that changes the picture
//   versions   { "1": "Town_night", "2": "Town_winter" }: the picture shown
//              while that variable holds each value; any other value shows `name`
//   variantName  what an import writes instead of a list: while the variable
//              is not 0 and has no entry in `versions`, the layer shows this
//              name with %1 replaced by the value ("43-%1_Ground" shows
//              "43-2_Ground" at 2)
//              A picture whose file is missing shows `name`.
//   z          a number that replaces the position's depth
//
// A map shown in 3D draws the screen layers only: "over" with fit "fill" or
// "repeat" (repeating on the screen, follow counting as 0).
//
// The first half of this file is pure: it reads no game global, so the editor
// loads the same file and names, places, tests and blocks by the same rules.
// The second half hooks the running game, each hook behind a test for the
// class it wraps.
//=============================================================================

(function(root) {
    "use strict";

    const POSITIONS = Object.freeze(["back", "ground", "same", "over"]);
    const FITS = Object.freeze(["map", "repeat", "fill"]);
    const REPEATS = Object.freeze(["both", "x", "y"]);
    const BLENDS = Object.freeze(["normal", "add", "multiply", "screen"]);
    const OPS = Object.freeze(["=", ">=", "<="]);

    // Among the tilemap's children: lower tiles 0, characters 3, upper tiles 4,
    // the destination marker 9.
    const DEPTH = Object.freeze({ back: -1, ground: 0.5, same: 3, over: 9 });

    const DEFAULTS = Object.freeze({
        layer: "ground", fit: "map", drift: Object.freeze([0, 0]), follow: 1, opacity: 255, blendMode: 0,
        switch: 0, when: null, fade: 0, variable: 0, variantName: "", versions: null, repeat: "both", z: null
    });

    // A tile is blocked when at least `count` of its `samples` x `samples`
    // points are solid, a point being solid at `alpha` or more: an eighth of
    // the points under paint that is two-thirds opaque. Sixteen points across
    // a 48 pixel tile is every third pixel, so a line three pixels thick is
    // counted wherever it is drawn; a fence must not stop a walk in one place
    // and let it through a pixel higher.
    const SOLID = Object.freeze({ samples: 16, alpha: 170, count: 32 });

    // Stored order is stacking order within a position: each layer sits this
    // far above the one before it.
    const DEPTH_STEP = 0.0001;

    const KNOWN = ["name", "layer", "variable", "variantName", "versions", "switch", "opacity", "blendMode", "fit", "repeat", "drift", "follow", "when", "fade", "z"];

    function finite(value, fallback) {
        if (value === null || value === undefined || value === "") return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function idOf(value) {
        const number = Math.floor(finite(value, 0));
        return number > 0 ? number : 0;
    }

    function normalizeWhen(when) {
        if (!when || typeof when !== "object") return null;
        const variable = idOf(when.variable);
        if (!variable) return null;
        return { variable, op: OPS.includes(when.op) ? when.op : "=", value: finite(when.value, 0) };
    }

    /** The pictures listed by value: whole numbers as keys, names as values. Null when none is listed. */
    function normalizeVersions(versions) {
        if (!versions || typeof versions !== "object" || Array.isArray(versions)) return null;
        let listed = null;
        for (const key of Object.keys(versions)) {
            const value = Number(key), name = versions[key];
            if (key.trim() === "" || !Number.isInteger(value) || typeof name !== "string" || !name) continue;
            if (!listed) listed = {};
            listed[String(value)] = name;
        }
        return listed;
    }

    /** A layer with every field, defaults filled in. The stored object is not changed. */
    function normalize(spec) {
        const source = spec && typeof spec === "object" ? spec : {};
        const record = {};
        record.name = typeof source.name === "string" ? source.name : "";
        record.layer = POSITIONS.includes(source.layer) ? source.layer : DEFAULTS.layer;
        // Rows sorted with the characters only mean something for a picture that lies on the map.
        record.fit = record.layer === "same" ? "map" : (FITS.includes(source.fit) ? source.fit : DEFAULTS.fit);
        const drift = Array.isArray(source.drift) ? source.drift : DEFAULTS.drift;
        record.drift = [finite(drift[0], 0), finite(drift[1], 0)];
        record.follow = finite(source.follow, DEFAULTS.follow);
        record.opacity = Math.max(0, Math.min(255, Math.round(finite(source.opacity, DEFAULTS.opacity))));
        const blend = finite(source.blendMode, 0);
        record.blendMode = blend === 1 || blend === 2 || blend === 3 ? blend : 0;
        record.switch = idOf(source.switch);
        record.when = normalizeWhen(source.when);
        record.fade = Math.max(0, finite(source.fade, 0));
        record.variable = idOf(source.variable);
        record.variantName = typeof source.variantName === "string" ? source.variantName : "";
        record.versions = normalizeVersions(source.versions);
        // One direction only means something for a picture that repeats.
        record.repeat = record.fit === "repeat" && (source.repeat === "x" || source.repeat === "y") ? source.repeat : DEFAULTS.repeat;
        record.z = finite(source.z, null);
        for (const key of Object.keys(source)) {
            if (!KNOWN.includes(key)) record[key] = source[key];
        }
        return record;
    }

    /**
     * The stored form of a layer. `name` and `layer` are always written, as
     * imports and earlier editors wrote them; every other field only when it
     * is not at its default, so a layer nobody changed is stored as it was.
     */
    function write(record) {
        const layer = normalize(record);
        const out = { name: layer.name, layer: layer.layer };
        if (layer.variable) {
            out.variable = layer.variable;
            if (layer.variantName) out.variantName = layer.variantName;
            if (layer.versions) out.versions = Object.assign({}, layer.versions);
        }
        if (layer.switch) out.switch = layer.switch;
        if (layer.opacity !== DEFAULTS.opacity) out.opacity = layer.opacity;
        if (layer.blendMode) out.blendMode = layer.blendMode;
        if (layer.fit !== DEFAULTS.fit) out.fit = layer.fit;
        if (layer.repeat !== DEFAULTS.repeat) out.repeat = layer.repeat;
        if (layer.drift[0] || layer.drift[1]) out.drift = [layer.drift[0], layer.drift[1]];
        if (layer.follow !== DEFAULTS.follow) out.follow = layer.follow;
        if (layer.when) out.when = { variable: layer.when.variable, op: layer.when.op, value: layer.when.value };
        if (layer.fade) out.fade = layer.fade;
        if (layer.z !== null) out.z = layer.z;
        for (const key of Object.keys(layer)) {
            if (!KNOWN.includes(key)) out[key] = layer[key];
        }
        return out;
    }

    /** Every layer of a map that names a picture, normalized, in stored order. */
    function list(mapData) {
        const stored = mapData && Array.isArray(mapData.rrImageLayers) ? mapData.rrImageLayers : [];
        const layers = [];
        for (const spec of stored) {
            if (spec && spec.name) layers.push(normalize(spec));
        }
        return layers;
    }

    /**
     * The picture a layer shows while its variable holds `value`: the one
     * listed for that value, else (an imported layer, at a value other than 0)
     * the import's name pattern with the value put in, else the layer's own.
     * Whether the file exists is not asked here; the game falls back to the
     * layer's own picture when it does not.
     */
    function pictureName(spec, value) {
        const name = spec && spec.name ? String(spec.name) : "";
        if (!spec || value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return name;
        const versions = spec.versions;
        if (versions && typeof versions === "object") {
            const key = String(value);
            const listed = Object.prototype.hasOwnProperty.call(versions, key) ? versions[key] : "";
            if (listed && typeof listed === "string") return listed;
        }
        if (!value || !spec.variantName) return name;
        // The value is put in as it is written, wherever the pattern asks for it.
        return String(spec.variantName).split("%1").join(String(value));
    }

    /** Whether a `when` test passes for the value of its variable. No test passes. */
    function passes(when, value) {
        if (!when || !when.variable) return true;
        const held = Number(value) || 0;
        const wanted = Number(when.value) || 0;
        if (when.op === ">=") return held >= wanted;
        if (when.op === "<=") return held <= wanted;
        return held === wanted;
    }

    /**
     * Whether a layer's conditions hold: its switch (if any) is ON and its
     * `when` test (if any) passes, as an event page needs all of its conditions.
     */
    function shown(spec, switchValue, variableValue) {
        if (!spec) return false;
        if (spec.switch && !switchValue) return false;
        return passes(spec.when, variableValue);
    }

    /** A map shown in 3D draws the layers that lie on the screen, over the view. */
    function drawnOn3D(spec) {
        return !!spec && spec.layer === "over" && (spec.fit === "fill" || spec.fit === "repeat");
    }

    function drawn(spec, is3D) {
        return is3D ? drawnOn3D(spec) : !!spec;
    }

    /** The z of a layer among the tilemap's children; `index` is its place in the stored list. */
    function depth(spec, index) {
        const position = spec && POSITIONS.includes(spec.layer) ? spec.layer : DEFAULTS.layer;
        const own = spec ? finite(spec.z, null) : null;
        const base = own === null ? DEPTH[position] : own;
        // Strips tie with the characters' z so the tilemap orders the two by their feet.
        if (position === "same") return base;
        return base + (index > 0 ? index * DEPTH_STEP : 0);
    }

    function wrap(value, size) {
        if (!(size > 0)) return value;
        const rest = value % size;
        return rest < 0 ? rest + size : rest;
    }

    /**
     * Where a repeating layer's tiling starts: the picture pixel at the view's
     * top left. The map's scroll counts by `follow`, the drift moves the picture
     * right and down over time, the sum lands on whole pixels the way the tiles
     * do, and it wraps by the picture's size so it never grows.
     *
     * A layer that repeats in one direction only lies once in the other: there
     * nothing drifts and nothing wraps, and the number is how far the view's
     * edge is past the picture's (for "x" the picture's top is `y` pixels above
     * the view's top, for "y" its left is `x` pixels left of the view's left).
     */
    function origin(spec, seconds, displayX, displayY, tileWidth, tileHeight, pictureWidth, pictureHeight, out) {
        const result = out || { x: 0, y: 0 };
        const follow = spec ? finite(spec.follow, DEFAULTS.follow) : DEFAULTS.follow;
        const drift = spec && Array.isArray(spec.drift) ? spec.drift : DEFAULTS.drift;
        const repeat = spec ? spec.repeat : "";
        const time = Number(seconds) || 0;
        const driftX = repeat === "y" ? 0 : Number(drift[0]) || 0;
        const driftY = repeat === "x" ? 0 : Number(drift[1]) || 0;
        const x = Math.ceil((Number(displayX) || 0) * tileWidth * follow - driftX * time);
        const y = Math.ceil((Number(displayY) || 0) * tileHeight * follow - driftY * time);
        // Adding zero turns a negative zero into zero.
        result.x = (repeat === "y" ? x : wrap(x, pictureWidth)) + 0;
        result.y = (repeat === "x" ? y : wrap(y, pictureHeight)) + 0;
        return result;
    }

    /** Whether a repeating layer scrolls by itself: it has a speed in a direction it repeats in. */
    function scrolls(spec) {
        if (!spec || spec.fit !== "repeat" || !Array.isArray(spec.drift)) return false;
        return (spec.repeat !== "y" && !!Number(spec.drift[0])) || (spec.repeat !== "x" && !!Number(spec.drift[1]));
    }

    /** The screen y of the top of map row `row`: where the tilemap draws that row of tiles. */
    function stripY(row, displayY, tileHeight) {
        return row * tileHeight - Math.ceil(displayY * tileHeight);
    }

    /**
     * The y a "same" strip sorts by: just past the bottom of its row. A
     * character's sprite sorts by its feet, so one standing on the strip's row
     * or north of it is drawn behind the strip, and one on a row south of it in front.
     */
    function stripSortY(row, displayY, tileHeight) {
        return stripY(row, displayY, tileHeight) + tileHeight + 0.5;
    }

    /** One sixtieth of a second of a fade from `level` toward `target` (both 0..1). */
    function fadeStep(level, target, seconds) {
        if (!(seconds > 0)) return target;
        const step = 1 / (seconds * 60);
        const next = target > level ? level + step : level - step;
        // Thirty steps of a thirtieth do not add up to exactly one: the last step lands on the target.
        return Math.abs(next - target) < step / 2 || (target > level) !== (target > next) ? target : next;
    }

    /** The opacity factor drawn at a fade level: slow at both ends. */
    function ease(level) {
        const t = level <= 0 ? 0 : level >= 1 ? 1 : level;
        return t * t * (3 - 2 * t);
    }

    /**
     * The blocked tiles of a picture from alpha samples: `columns * samples`
     * by `rows * samples` values, row by row (`stride` and `offset` step
     * through RGBA data). 1 marks a tile with enough solid points.
     */
    function solidTiles(alpha, columns, rows, stride, offset, into, intoRow) {
        const samples = SOLID.samples, step = stride || 1, first = offset || 0;
        const grid = into || new Uint8Array(columns * rows);
        const base = (intoRow || 0) * columns;
        const width = columns * samples;
        for (let ty = 0; ty < rows; ty++) {
            for (let tx = 0; tx < columns; tx++) {
                let count = 0;
                for (let j = 0; j < samples && count < SOLID.count; j++) {
                    let at = ((ty * samples + j) * width + tx * samples) * step + first;
                    for (let i = 0; i < samples; i++, at += step) {
                        if (alpha[at] >= SOLID.alpha) count++;
                    }
                }
                grid[base + ty * columns + tx] = count >= SOLID.count ? 1 : 0;
            }
        }
        return grid;
    }

    // The most samples read from a picture at once: 2.5 million points is 10 MB
    // of pixel data. A larger map is read in bands of whole tile rows.
    const SAMPLE_BUDGET = 2560000;

    /**
     * The blocked tiles of a picture lying on a map of `columns` by `rows`
     * tiles, its top left on the map's. The picture is drawn once, without
     * smoothing, into a canvas of `samples` x `samples` pixels per tile and
     * that small canvas is read: every point is one real pixel of the picture,
     * so soft paint stays soft, and the full-size picture is never read back.
     * Null without a document or when the picture cannot be read.
     */
    function solidGrid(image, columns, rows, tileWidth, tileHeight) {
        if (typeof document === "undefined" || !image || !(columns > 0) || !(rows > 0)) return null;
        const samples = SOLID.samples;
        const pictureWidth = image.naturalWidth || image.width || 0;
        const pictureHeight = image.naturalHeight || image.height || 0;
        if (!(pictureWidth > 0) || !(pictureHeight > 0)) return null;
        try {
            const grid = new Uint8Array(columns * rows);
            const band = Math.max(1, Math.min(rows, Math.floor(SAMPLE_BUDGET / (columns * samples * samples))));
            const canvas = document.createElement("canvas");
            canvas.width = columns * samples;
            canvas.height = band * samples;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            // The whole picture at the small canvas's scale. It is always drawn whole, moved up
            // for each band and cut by the canvas: asked for a part of a large picture, the
            // browser first copies that part out, which for a 9600 pixel picture is the slow step.
            const targetWidth = pictureWidth / tileWidth * samples;
            const targetHeight = pictureHeight / tileHeight * samples;
            // A point on the line between two pixels would be read as either of them, as the
            // browser rounds: such a grid is read half a pixel over, in the middle of a pixel.
            const left = 0 - (Number.isInteger(tileWidth / samples / 2) ? 0.5 : 0) * samples / tileWidth;
            const top = 0 - (Number.isInteger(tileHeight / samples / 2) ? 0.5 : 0) * samples / tileHeight;
            for (let row = 0; row < rows; row += band) {
                const count = Math.min(band, rows - row);
                if (row * tileHeight >= pictureHeight) break;
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.imageSmoothingEnabled = false;
                context.drawImage(image, left, top - row * samples, targetWidth, targetHeight);
                const data = context.getImageData(0, 0, canvas.width, count * samples).data;
                solidTiles(data, columns, count, 4, 3, grid, row);
            }
            canvas.width = 0;
            canvas.height = 0;
            return grid;
        } catch (error) {
            return null;
        }
    }

    function isSolidAt(grid, columns, rows, x, y) {
        if (!grid || !(x >= 0) || !(y >= 0) || x >= columns || y >= rows) return false;
        return grid[Math.floor(y) * columns + Math.floor(x)] === 1;
    }

    const api = {
        POSITIONS, FITS, REPEATS, BLENDS, OPS, DEPTH, DEFAULTS, SOLID,
        normalize, write, list,
        pictureName,
        passes, shown,
        drawnOn3D, drawn, depth, origin, scrolls, stripY, stripSortY, fadeStep, ease,
        solidTiles, solidGrid, isSolidAt
    };

    //-------------------------------------------------------------------------
    // The running game
    //-------------------------------------------------------------------------

    const state = {
        // Raised whenever the map is asked to refresh: a switch, a variable, a
        // self switch or the party changed, the signal event pages go by. A
        // map's layers read their conditions again when they see a new stamp,
        // so a frame on which nothing changed costs one comparison.
        stamp: 1,
        // The pictures of the map being played, by name. Loaded outside
        // ImageManager's cache: a picture that fails there stops the game at
        // the next scene with a load error, and a numbered version is allowed
        // to be missing.
        pictures: new Map(),
        // Names that had no file. Kept while the map is played, so coming back from the menu
        // does not ask the disk for them again; a variable that changes clears its name.
        gone: new Set(),
        // Layers whose own picture is missing, already said so for the map being played.
        warned: new Set(),
        // Pictures nobody waits for any more that had not loaded yet: a layer
        // moved on to another version, or the map was left for the menu or a
        // battle. They are looked at until they have loaded or failed, so one
        // that failed is let go at once and the engine never tries or reports
        // it again.
        orphans: [],
        // Solid tiles of the "same" layers shown now, and the map they lie on.
        solids: null,
        solidMap: null,
        columns: 0,
        rows: 0,
        owner: null,
        // The tile a character is being asked to step off (see the passability hooks).
        leaving: false,
        leaveX: 0,
        leaveY: 0,
        // What a map keeps while the game stays on it, through the menu, a
        // battle and a transfer inside it: how long its layers have drifted, so
        // fog goes on from where it was, and how many times the view has gone
        // round a looping map, so a layer that follows the map at another rate
        // does not jump at the seam.
        played: { mapId: 0, frames: 0, lapsX: 0, lapsY: 0 }
    };

    function loadBitmap(name) {
        const encoded = "img/parallaxes/" + Utils.encodeURI(name);
        const lower = encoded.toLowerCase();
        const extensions = ImageManager._imageExtensions || [".png"];
        const explicit = extensions.some(extension => lower.endsWith(extension));
        const url = explicit ? encoded : encoded + ".png";
        return Bitmap.load(url, explicit ? [url + ".png"] : []);
    }

    function picture(name) {
        let entry = state.pictures.get(name);
        if (!entry) {
            entry = { name, bitmap: loadBitmap(name), loaded: false, failed: false, dropped: false, grid: null, gridColumns: 0, gridRows: 0 };
            state.pictures.set(name, entry);
            entry.bitmap.addLoadListener(bitmap => {
                // A project that skips missing images hands back a blank instead of an error.
                if (bitmap._degradedToBlank) entry.failed = true;
                else entry.loaded = true;
            });
        }
        return entry;
    }

    /**
     * Let a bitmap go. It leaves the engine's load watch first: a failed load
     * left there is tried again every ten seconds and reported, and a destroyed
     * bitmap must not come back to life.
     */
    function drop(bitmap) {
        const watched = Bitmap._loadWatchList;
        const at = watched ? watched.indexOf(bitmap) : -1;
        if (at >= 0) watched.splice(at, 1);
        if (bitmap._loadingState === "loading" && bitmap._image) {
            bitmap._image.onload = null;
            bitmap._image.onerror = null;
        }
        bitmap.destroy();
    }

    /** Forget a picture that did not load, so the engine never sees it and a later request tries the file again. */
    function discard(entry) {
        if (entry.dropped) return;
        entry.dropped = true;
        entry.failed = true;
        if (state.pictures.get(entry.name) === entry) state.pictures.delete(entry.name);
        drop(entry.bitmap);
    }

    function clearPictures() {
        for (const entry of state.pictures.values()) {
            entry.dropped = true;
            drop(entry.bitmap);
        }
        state.pictures.clear();
        state.gone.clear();
        state.warned.clear();
        state.orphans.length = 0;
    }

    /** Settle the pictures no layer waits for any more. Runs only while there are some. */
    function sweep() {
        const orphans = state.orphans;
        for (let i = orphans.length - 1; i >= 0; i--) {
            const entry = orphans[i];
            if (entry.loaded || entry.dropped) {
                orphans.splice(i, 1);
            } else if (entry.failed || entry.bitmap.isError()) {
                orphans.splice(i, 1);
                discard(entry);
                state.gone.add(entry.name);
            }
        }
    }

    function gridOf(set, entry) {
        if (!entry.grid || entry.gridColumns !== set.columns || entry.gridRows !== set.rows) {
            const bitmap = entry.bitmap;
            entry.grid = api.solidGrid(bitmap._image || bitmap._canvas, set.columns, set.rows, set.tileWidth, set.tileHeight);
            entry.gridColumns = set.columns;
            entry.gridRows = set.rows;
        }
        return entry.grid;
    }

    /** The grids that block now: the "same" layers whose conditions hold, on a map shown in 2D. */
    function registerSolids(set) {
        const solids = set.solids;
        solids.length = 0;
        if (!set.is3D) {
            for (let i = 0; i < set.layers.length; i++) {
                const layer = set.layers[i];
                if (layer.grid && layer.wanted) solids.push(layer.grid);
            }
        }
        if (!solids.length && state.owner !== set) return;
        state.owner = set;
        state.solids = solids.length ? solids : null;
        state.solidMap = set.map;
        state.columns = set.columns;
        state.rows = set.rows;
    }

    /** Whether an image layer has solid paint on a tile of the map being played. */
    function isTileBlocked(x, y) {
        const solids = state.solids;
        if (!solids || state.solidMap !== $dataMap) return false;
        if (!(x >= 0) || !(y >= 0) || x >= state.columns || y >= state.rows) return false;
        const index = Math.floor(y) * state.columns + Math.floor(x);
        for (let i = 0; i < solids.length; i++) {
            if (solids[i][index]) return true;
        }
        return false;
    }

    function pixiBlend(mode) {
        // PIXI 8 names blend modes, earlier versions number them as the data does.
        return typeof PIXI !== "undefined" && PIXI.TextureSource ? BLENDS[mode] : mode;
    }

    function createSet(spriteset) {
        const records = list($dataMap);
        if (!records.length) return null;
        const mapId = $gameMap.mapId();
        const played = state.played;
        if (played.mapId !== mapId) {
            played.mapId = mapId;
            played.frames = 0;
            played.lapsX = 0;
            played.lapsY = 0;
        }
        const tileWidth = $gameMap.tileWidth(), tileHeight = $gameMap.tileHeight();
        const columns = $gameMap.width(), rows = $gameMap.height();
        const loopX = $gameMap.isLoopHorizontal(), loopY = $gameMap.isLoopVertical();
        const set = {
            map: $dataMap,
            tilemap: spriteset._tilemap,
            layers: [],
            solids: [],
            stamp: 0,
            is3D: null,
            started: false,
            held: false,
            waited: 0,
            tileWidth, tileHeight, columns, rows, loopX, loopY,
            // One lap of a looping map in pixels, how far past the screen's
            // edge a picture drawn lap by lap reaches (a shake moves the map
            // by less), and the laps that many pixels can show.
            spanX: columns * tileWidth,
            spanY: rows * tileHeight,
            margin: tileWidth,
            copiesX: loopX ? Math.ceil((Graphics.width + 2 * tileWidth) / (columns * tileWidth)) + 1 : 1,
            copiesY: loopY ? Math.ceil((Graphics.height + 2 * tileWidth) / (rows * tileHeight)) + 1 : 1,
            lastX: $gameMap.displayX(),
            lastY: $gameMap.displayY(),
            // The screen in the map's own space, and a count raised when it changes.
            screens: 0,
            view: 0,
            viewLeft: NaN,
            viewTop: NaN,
            viewWidth: NaN,
            viewHeight: NaN
        };
        for (let i = 0; i < records.length; i++) {
            set.layers.push({
                spec: records[i],
                index: i,
                kind: "",           // "map", "tile", "fill", "strips" or "laps" once its sprites exist
                one: "",            // "x" or "y" for a "tile" that repeats in that direction only
                sprite: null,       // one sprite: "map", "tile", "fill"
                strips: null,       // one per row of the screen: "strips"
                copies: null,       // one per lap of a looping map in view: "laps"
                drawn: false,       // this view of the map (2D or 3D) draws it
                wanted: false,      // its conditions hold
                live: false,        // drawn, and shown or still fading out
                level: 0,           // fade level, 0..1
                paint: -1,          // the fade level its opacity was last set from
                value: null,        // its versions variable's value
                name: "",           // the picture that value asks for
                entry: null,        // the picture it shows
                pending: null,      // the picture it waits for
                grid: null,         // solid tiles of the picture it shows
                pictureWidth: 0,
                pictureHeight: 0,
                frameWidth: 0,
                frameHeight: 0,
                fitted: 0           // the count of the view it was last fitted to
            });
        }
        return set;
    }

    function plainSprite(set, z, blendMode) {
        const sprite = new Sprite();
        sprite.z = z;
        sprite.blendMode = blendMode;
        sprite.visible = false;
        set.tilemap.addChild(sprite);
        return sprite;
    }

    function buildSprites(set, layer) {
        const spec = layer.spec;
        const z = depth(spec, layer.index);
        if (spec.layer === "same") {
            // One sprite per row of the screen, each a frame of the one
            // picture; a map that loops sideways shows a row once per lap in view.
            layer.kind = "strips";
            layer.strips = [];
            const count = (Math.ceil(Graphics.height / set.tileHeight) + 1) * set.copiesX;
            for (let i = 0; i < count; i++) {
                const strip = plainSprite(set, z, spec.blendMode);
                strip._rrRow = -1;
                layer.strips.push(strip);
            }
            return;
        }
        if (spec.fit === "map" && (set.loopX || set.loopY)) {
            // A picture locked to a map that loops is drawn once per lap in
            // view, a lap being the map's size whatever the picture's.
            layer.kind = "laps";
            layer.copies = [];
            for (let i = 0; i < set.copiesX * set.copiesY; i++) layer.copies.push(plainSprite(set, z, spec.blendMode));
            return;
        }
        if (spec.fit === "map") {
            layer.kind = "map";
            layer.sprite = plainSprite(set, z, spec.blendMode);
            return;
        }
        // The two kinds that are fitted to the screen each frame.
        set.screens++;
        if (spec.fit === "fill") {
            layer.kind = "fill";
            layer.sprite = plainSprite(set, z, spec.blendMode);
            return;
        }
        layer.kind = "tile";
        layer.one = spec.repeat === "x" || spec.repeat === "y" ? spec.repeat : "";
        const sprite = new TilingSprite();
        sprite.move(0, 0, Graphics.width, Graphics.height);
        sprite.blendMode = pixiBlend(spec.blendMode);
        sprite.z = z;
        sprite.visible = false;
        set.tilemap.addChild(sprite);
        layer.sprite = sprite;
    }

    /**
     * A layer's sprites are drawn while it is live and has a picture. Strips
     * are switched on row by row as they are placed, so here they only go off.
     */
    function reveal(layer) {
        const on = layer.live && !!layer.entry;
        if (layer.sprite) {
            layer.sprite.visible = on;
        } else if (layer.copies) {
            for (let i = 0; i < layer.copies.length; i++) layer.copies[i].visible = on;
        } else if (layer.strips && !on) {
            for (let i = 0; i < layer.strips.length; i++) layer.strips[i].visible = false;
        }
    }

    function paint(layer) {
        const opacity = layer.spec.opacity * ease(layer.level);
        const parts = layer.strips || layer.copies;
        layer.paint = layer.level;
        if (layer.sprite) {
            layer.sprite.opacity = opacity;
        } else if (parts) {
            for (let i = 0; i < parts.length; i++) parts[i].opacity = opacity;
        }
    }

    function show(set, layer, entry) {
        const bitmap = entry.bitmap;
        layer.entry = entry;
        layer.pictureWidth = bitmap.width;
        layer.pictureHeight = bitmap.height;
        // One lap of a looping map shows no more of a picture than the map is large.
        layer.frameWidth = set.loopX ? Math.min(bitmap.width, set.spanX) : bitmap.width;
        layer.frameHeight = set.loopY ? Math.min(bitmap.height, set.spanY) : bitmap.height;
        layer.fitted = 0;
        if (layer.strips) {
            for (let i = 0; i < layer.strips.length; i++) {
                layer.strips[i].bitmap = bitmap;
                layer.strips[i]._rrRow = -1;
            }
            layer.grid = gridOf(set, entry);
            registerSolids(set);
        } else if (layer.copies) {
            for (let i = 0; i < layer.copies.length; i++) {
                layer.copies[i].bitmap = bitmap;
                layer.copies[i].setFrame(0, 0, layer.frameWidth, layer.frameHeight);
            }
        } else if (layer.sprite) {
            layer.sprite.bitmap = bitmap;
        }
        reveal(layer);
    }

    /** A layer whose own picture has no file draws nothing and blocks nothing, whatever it showed before. */
    function missing(set, layer) {
        if (layer.entry) {
            layer.entry = null;
            layer.pictureWidth = 0;
            layer.pictureHeight = 0;
            reveal(layer);
            if (layer.grid) {
                layer.grid = null;
                registerSolids(set);
            }
        }
        const name = layer.spec.name;
        if (!state.warned.has(name)) {
            state.warned.add(name);
            console.warn("Image layer: img/parallaxes/" + name + " is missing; the layer draws nothing.");
        }
    }

    /** Change the picture a layer waits for. One it stops waiting for unloaded is watched until it has loaded or failed. */
    function expect(layer, entry) {
        const was = layer.pending;
        layer.pending = entry;
        if (was && was !== entry && !was.loaded && !was.dropped && state.orphans.indexOf(was) < 0) state.orphans.push(was);
    }

    function request(set, layer, name) {
        if (state.gone.has(name)) {
            // Known to have no file: the base picture instead, or nothing, without loading again.
            if (name !== layer.spec.name) {
                request(set, layer, layer.spec.name);
            } else {
                layer.name = name;
                expect(layer, null);
                missing(set, layer);
            }
            return;
        }
        layer.name = name;
        const entry = picture(name);
        if (entry === layer.entry) {
            expect(layer, null);
        } else if (entry.loaded) {
            expect(layer, null);
            show(set, layer, entry);
        } else {
            // The picture shown stays until the new one has arrived.
            expect(layer, entry);
        }
    }

    /** A layer's awaited picture has loaded, or is known to be missing. */
    function settle(set, layer) {
        const entry = layer.pending;
        if (entry.loaded) {
            layer.pending = null;
            show(set, layer, entry);
        } else if (entry.failed || entry.bitmap.isError()) {
            layer.pending = null;
            discard(entry);
            state.gone.add(entry.name);
            if (entry.name !== layer.spec.name) {
                // A version with no file shows the base picture. The value is
                // kept, so the file is asked for again only when the variable changes.
                request(set, layer, layer.spec.name);
            } else {
                missing(set, layer);
            }
        }
    }

    /** Read every layer's conditions and version again. Runs when something they may depend on changed. */
    function refresh(set) {
        const is3D = set.is3D;
        for (let i = 0; i < set.layers.length; i++) {
            const layer = set.layers[i];
            const spec = layer.spec;
            layer.drawn = drawn(spec, is3D);
            if (!layer.drawn) {
                // Not drawn in this view: no sprite, no picture, no blocking.
                layer.wanted = false;
                if (layer.live) {
                    layer.live = false;
                    reveal(layer);
                }
                layer.level = 0;
                continue;
            }
            if (!layer.kind) buildSprites(set, layer);
            layer.wanted = shown(spec,
                spec.switch ? $gameSwitches.value(spec.switch) : true,
                spec.when ? $gameVariables.value(spec.when.variable) : 0);
            // A map opens with its layers as their conditions have them: nothing fades in from a load.
            if (!set.started) layer.level = layer.wanted ? 1 : 0;
            const live = layer.wanted || layer.level > 0;
            if (live !== layer.live) {
                layer.live = live;
                layer.paint = -1;
                reveal(layer);
            }
            const value = spec.variable ? $gameVariables.value(spec.variable) : 0;
            if (value !== layer.value) {
                const changed = layer.value !== null;
                layer.value = value;
                const name = pictureName(spec, value);
                // The variable changed: its picture is asked for afresh, even if it had no file before.
                if (changed) state.gone.delete(name);
                if (name !== layer.name) request(set, layer, name);
            }
        }
        set.started = true;
        registerSolids(set);
    }

    /**
     * Where the first lap of a looping map starts: the lap's left (or top)
     * edge at or before the view's, a margin further out so that a shaken
     * screen shows no gap.
     */
    function lapStart(scroll, span, margin) {
        return 0 - margin - wrap(scroll - margin, span);
    }

    function placeStrips(set, layer, displayX, displayY) {
        const strips = layer.strips;
        const th = set.tileHeight;
        const copies = set.copiesX;
        const ox = Math.ceil(displayX * set.tileWidth);
        const first = Math.floor(Math.ceil(displayY * th) / th);
        const pictureRows = Math.ceil(layer.pictureHeight / th);
        const left = set.loopX ? lapStart(ox, set.spanX, set.margin) : 0 - ox;
        for (let i = 0; i < strips.length; i++) {
            const strip = strips[i];
            const across = first + (copies > 1 ? Math.floor(i / copies) : i);
            const row = set.loopY ? wrap(across, set.rows) : across;
            if (row < 0 || row >= pictureRows || row >= set.rows) {
                strip.visible = false;
                continue;
            }
            if (strip._rrRow !== row) {
                strip._rrRow = row;
                strip.setFrame(0, row * th, layer.frameWidth, th);
            }
            strip.x = copies > 1 ? left + (i % copies) * set.spanX : left;
            strip.y = stripY(across, displayY, th);
            strip._reactorSortY = stripSortY(across, displayY, th);
            strip.visible = true;
        }
    }

    function placeCopies(set, layer, ox, oy) {
        const copies = layer.copies;
        const left = set.loopX ? lapStart(ox, set.spanX, set.margin) : 0 - ox;
        const top = set.loopY ? lapStart(oy, set.spanY, set.margin) : 0 - oy;
        for (let i = 0; i < copies.length; i++) {
            copies[i].x = left + (i % set.copiesX) * set.spanX;
            copies[i].y = top + Math.floor(i / set.copiesX) * set.spanY;
        }
    }

    /**
     * The part of a frame that runs before the spriteset's own update:
     * conditions, pictures, fades, and the layers that lie on the map. The
     * tilemap sorts its children inside that update, and the strips must
     * already be on this frame's rows.
     */
    function update(spriteset) {
        const set = spriteset._rrImageLayers;
        if (!set) return;
        // A spriteset serves the map it was built for; once the game has moved on it holds still.
        set.held = !!(spriteset._reactorBuiltForMapId && $gameMap.mapId() !== spriteset._reactorBuiltForMapId);
        if (set.held) return;
        if (state.orphans.length) sweep();
        const is3D = !!(spriteset._reactor3d || (spriteset._reactor3dPending && !spriteset._reactor3dFailed));
        if (set.stamp !== state.stamp || set.is3D !== is3D) {
            set.stamp = state.stamp;
            set.is3D = is3D;
            refresh(set);
        }
        const played = state.played;
        played.frames++;
        const displayX = $gameMap.displayX();
        const displayY = $gameMap.displayY();
        if (set.loopX) {
            const moved = displayX - set.lastX;
            if (moved > set.columns / 2) played.lapsX--;
            else if (moved < -set.columns / 2) played.lapsX++;
            set.lastX = displayX;
        }
        if (set.loopY) {
            const moved = displayY - set.lastY;
            if (moved > set.rows / 2) played.lapsY--;
            else if (moved < -set.rows / 2) played.lapsY++;
            set.lastY = displayY;
        }
        // The same whole pixels the tilemap scrolls its tiles by.
        const ox = Math.ceil(displayX * set.tileWidth);
        const oy = Math.ceil(displayY * set.tileHeight);
        const layers = set.layers;
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (layer.pending) settle(set, layer);
            if (!layer.live) continue;
            const target = layer.wanted ? 1 : 0;
            if (layer.level !== target) {
                layer.level = fadeStep(layer.level, target, layer.spec.fade);
                if (layer.level <= 0 && !layer.wanted) {
                    layer.live = false;
                    reveal(layer);
                    continue;
                }
            }
            if (layer.paint !== layer.level) paint(layer);
            if (!layer.entry) continue;
            if (layer.kind === "map") {
                layer.sprite.x = 0 - ox;
                layer.sprite.y = 0 - oy;
            } else if (layer.kind === "strips") {
                placeStrips(set, layer, displayX, displayY);
            } else if (layer.kind === "laps") {
                placeCopies(set, layer, ox, oy);
            }
        }
    }

    /**
     * The part of a frame that runs after the spriteset's own update: the
     * layers fitted to the screen. That update moves the spriteset for a
     * shake and scales it for a screen zoom, and the map inside it is scaled
     * by the 2D camera zoom; a layer that fills the screen is put back over
     * exactly the screen, and a repeating one covers it and keeps its picture
     * on the map by as much as it follows the map.
     */
    function fit(spriteset) {
        const set = spriteset._rrImageLayers;
        if (!set || !set.screens || set.held) return;
        const base = spriteset._baseSprite;
        const outer = (spriteset.scale && spriteset.scale.x) || 1;
        const scale = outer * ((base && base.scale && base.scale.x) || 1);
        // The screen's rectangle in the tilemap's own space.
        const left = (0 - (spriteset.x || 0) - outer * ((base && base.x) || 0)) / scale;
        const top = (0 - (spriteset.y || 0) - outer * ((base && base.y) || 0)) / scale;
        const width = Graphics.width / scale;
        const height = Graphics.height / scale;
        if (set.viewLeft !== left || set.viewTop !== top || set.viewWidth !== width || set.viewHeight !== height) {
            set.viewLeft = left;
            set.viewTop = top;
            set.viewWidth = width;
            set.viewHeight = height;
            set.view++;
        }
        const tw = set.tileWidth, th = set.tileHeight;
        const seconds = state.played.frames / 60;
        // On a map shown in 3D a repeating layer lies on the screen: the scroll does not count.
        const viewX = set.is3D ? 0 : $gameMap.displayX() + left / tw;
        const viewY = set.is3D ? 0 : $gameMap.displayY() + top / th;
        const scrollX = set.is3D ? 0 : viewX + state.played.lapsX * set.columns;
        const scrollY = set.is3D ? 0 : viewY + state.played.lapsY * set.rows;
        const layers = set.layers;
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (!layer.live || !layer.entry) continue;
            const sprite = layer.sprite;
            if (layer.kind === "tile") {
                const one = layer.one;
                if (layer.fitted !== set.view) {
                    layer.fitted = set.view;
                    // In the direction it does not repeat in, the sprite is as large as the picture: it shows it once.
                    sprite.move(left, top, one === "y" ? layer.pictureWidth : width, one === "x" ? layer.pictureHeight : height);
                }
                // The laps of a looping map count only where the picture repeats: lying once, it stays in the lap in view.
                const start = origin(layer.spec, seconds, one === "y" ? viewX : scrollX, one === "x" ? viewY : scrollY,
                    tw, th, layer.pictureWidth, layer.pictureHeight, sprite.origin);
                if (one === "x") {
                    sprite.y = top - start.y;
                    start.y = 0;
                } else if (one === "y") {
                    sprite.x = left - start.x;
                    start.x = 0;
                }
            } else if (layer.kind === "fill" && layer.fitted !== set.view && layer.pictureWidth > 0 && layer.pictureHeight > 0) {
                layer.fitted = set.view;
                sprite.x = left;
                sprite.y = top;
                sprite.scale.x = width / layer.pictureWidth;
                sprite.scale.y = height / layer.pictureHeight;
            }
        }
    }

    /** Whether every picture a map's layers wait for has loaded or is known to be missing. */
    function settled(set) {
        let waiting = false;
        for (let i = 0; i < set.layers.length; i++) {
            const layer = set.layers[i];
            if (layer.pending) settle(set, layer);
            if (layer.pending) waiting = true;
        }
        // A file that neither loads nor fails must not hold the map: after ten seconds it opens without it.
        return !waiting || ++set.waited > 600;
    }

    function release(spriteset) {
        const set = spriteset._rrImageLayers;
        spriteset._rrImageLayers = null;
        if (set && state.owner === set) {
            state.owner = null;
            state.solids = null;
            state.solidMap = null;
        }
        // No map is updated until the next one opens, so the pictures this one
        // still waited for are waited for by nobody: what has failed is let go
        // now, the rest when the engine next looks at its loads.
        if (set) {
            for (let i = 0; i < set.layers.length; i++) expect(set.layers[i], null);
        }
        if (state.orphans.length) sweep();
        // The sprites are children of the tilemap and are destroyed with it.
    }

    /** Build the running map's layers again from $dataMap.rrImageLayers. */
    function rebuild() {
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const spriteset = scene && scene._spriteset;
        if (!spriteset || !spriteset._tilemap || typeof spriteset.updateRrImageLayers !== "function") return;
        const old = spriteset._rrImageLayers;
        if (old) {
            for (const layer of old.layers) {
                for (const sprite of layer.strips || layer.copies || (layer.sprite ? [layer.sprite] : [])) {
                    if (sprite.parent) sprite.parent.removeChild(sprite);
                    sprite.destroy();
                }
            }
            release(spriteset);
        }
        spriteset._rrImageLayers = createSet(spriteset);
        update(spriteset);
        fit(spriteset);
    }

    function installHooks() {
        if (typeof Spriteset_Map !== "undefined" && Spriteset_Map.prototype.createTilemap
            && !Spriteset_Map.prototype.createTilemap.__rrImageLayers) {
            const baseCreateTilemap = Spriteset_Map.prototype.createTilemap;
            Spriteset_Map.prototype.createTilemap = function() {
                baseCreateTilemap.apply(this, arguments);
                // A map without layers gets nothing but this null.
                this._rrImageLayers = typeof $dataMap !== "undefined" && $dataMap && Array.isArray($dataMap.rrImageLayers)
                    && $dataMap.rrImageLayers.length ? createSet(this) : null;
                if (this._rrImageLayers) {
                    update(this);
                    fit(this);
                }
            };
            Spriteset_Map.prototype.createTilemap.__rrImageLayers = true;

            Spriteset_Map.prototype.updateRrImageLayers = function() {
                update(this);
            };

            Spriteset_Map.prototype.fitRrImageLayers = function() {
                fit(this);
            };

            // Around the spriteset's own update: the layers on the map before
            // it (see update), the layers on the screen after it (see fit).
            const baseUpdate = Spriteset_Map.prototype.update;
            Spriteset_Map.prototype.update = function() {
                if (!this._rrImageLayers) return baseUpdate.apply(this, arguments);
                this.updateRrImageLayers();
                const result = baseUpdate.apply(this, arguments);
                this.fitRrImageLayers();
                return result;
            };

            const baseDestroy = Spriteset_Map.prototype.destroy;
            Spriteset_Map.prototype.destroy = function() {
                if (this._rrImageLayers) release(this);
                return baseDestroy.apply(this, arguments);
            };
        }

        // The map opens with its layers' pictures in place, as it does with its tiles and characters.
        if (typeof Scene_Map !== "undefined" && Scene_Map.prototype.isReady && !Scene_Map.prototype.isReady.__rrImageLayers) {
            const baseIsReady = Scene_Map.prototype.isReady;
            Scene_Map.prototype.isReady = function() {
                if (!baseIsReady.apply(this, arguments)) return false;
                const set = this._spriteset && this._spriteset._rrImageLayers;
                return !set || settled(set);
            };
            Scene_Map.prototype.isReady.__rrImageLayers = true;
        }

        // The pictures are let go where the engine lets go of a map's images.
        if (typeof ImageManager !== "undefined" && ImageManager.clear && !ImageManager.clear.__rrImageLayers) {
            const baseClear = ImageManager.clear;
            ImageManager.clear = function() {
                clearPictures();
                return baseClear.apply(this, arguments);
            };
            ImageManager.clear.__rrImageLayers = true;
        }

        // The engine looks at the pictures it is loading about once a second,
        // whatever scene is up; one it finds failed is tried again after ten
        // seconds and reported after a few tries. A picture nobody waits for
        // that failed while the menu or a battle was open is let go first.
        if (typeof Bitmap !== "undefined" && typeof Bitmap._sweepStalledLoads === "function" && !Bitmap._sweepStalledLoads.__rrImageLayers) {
            const baseSweepStalledLoads = Bitmap._sweepStalledLoads;
            Bitmap._sweepStalledLoads = function() {
                if (state.orphans.length) sweep();
                return baseSweepStalledLoads.apply(this, arguments);
            };
            Bitmap._sweepStalledLoads.__rrImageLayers = true;
        }

        if (typeof Game_Map !== "undefined" && Game_Map.prototype.requestRefresh && !Game_Map.prototype.requestRefresh.__rrImageLayers) {
            const baseRequestRefresh = Game_Map.prototype.requestRefresh;
            Game_Map.prototype.requestRefresh = function() {
                state.stamp++;
                return baseRequestRefresh.apply(this, arguments);
            };
            Game_Map.prototype.requestRefresh.__rrImageLayers = true;
        }

        // Every question about walking, boats, ships and landing ends in
        // checkPassage: a tile under solid paint answers no to all of them, as
        // a tile marked impassable does. Characters set to Through and the
        // airship in flight never ask. The one tile a character is stepping
        // off (noted below) is answered by the map's own tiles.
        if (typeof Game_Map !== "undefined" && Game_Map.prototype.checkPassage && !Game_Map.prototype.checkPassage.__rrImageLayers) {
            const baseCheckPassage = Game_Map.prototype.checkPassage;
            Game_Map.prototype.checkPassage = function(x, y, bit) {
                if (state.solids && !(state.leaving && x === state.leaveX && y === state.leaveY) && isTileBlocked(x, y)) return false;
                return baseCheckPassage.call(this, x, y, bit);
            };
            Game_Map.prototype.checkPassage.__rrImageLayers = true;
        }

        // A layer can turn solid under someone: its switch turns on, its
        // version changes, a transfer lands on paint. A step is asked of the
        // tile left and of the tile entered; solid paint closes only the tile
        // entered, so a body is never held where it stands and never walks
        // onto paint. A boat or a ship is asked about the tile ahead only.
        if (typeof Game_CharacterBase !== "undefined" && Game_CharacterBase.prototype.isMapPassable
            && !Game_CharacterBase.prototype.isMapPassable.__rrImageLayers) {
            const baseIsMapPassable = Game_CharacterBase.prototype.isMapPassable;
            Game_CharacterBase.prototype.isMapPassable = function(x, y, d) {
                if (!state.solids || state.leaving) return baseIsMapPassable.apply(this, arguments);
                state.leaving = true;
                state.leaveX = x;
                state.leaveY = y;
                try {
                    return baseIsMapPassable.apply(this, arguments);
                } finally {
                    state.leaving = false;
                }
            };
            Game_CharacterBase.prototype.isMapPassable.__rrImageLayers = true;
        }
    }

    api.isTileBlocked = isTileBlocked;
    api.refresh = rebuild;
    api.installHooks = installHooks;
    // What the tests read; nothing in a game should depend on it.
    api._state = state;

    root.ReactorImageLayers = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    installHooks();
})(typeof globalThis !== "undefined" ? globalThis : this);
