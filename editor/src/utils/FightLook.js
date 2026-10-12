/* What a battle unit on the map stands as: one rule for the game and the editor. No game globals. */
(function(root) {
    'use strict';

    /**
     * ReactorFightLook - the look of a unit of a battle on the map. A unit
     * is never invisible; the first of these that exists is what it stands
     * as:
     *
     *   1. the event's own picture or model                        'own'
     *   2. the model the Database binds to its record               'model'
     *   3. an actor's character graphic, or an enemy's
     *      `<unit character: Name, index>` note                     'character'
     *   4. an enemy's battler picture (the side-view one in a
     *      side-view game), standing on its tile                    'picture'
     *   5. a plain figure in its side's color                      'figure'
     *
     * The game asks through `ReactorFight.unitLook` and `eventLook`. The
     * editor loads this file byte for byte (editor/src/utils/FightLook.js),
     * so its map views, Battle Setup's tiles and an event's Image box show
     * what the game draws. Everything here answers from what it is handed:
     * records, a canvas context, pixels.
     */
    const L = {};

    L.KINDS = ['own', 'model', 'character', 'picture', 'figure'];
    L.TEAMS = ['ally', 'enemy', 'neutral'];
    L.COLORS = { ally: '#4aa8ff', enemy: '#ff5a4a', neutral: '#e6d15a' };
    // The tiles a battler picture or a plain figure takes on a unit one tile wide: it is fit inside them, feet on the tile.
    L.TILES_WIDE = 1;
    L.TILES_TALL = 1.5;
    // How much of its height a standing model shows from a flat map's pitch, and what its feet and head add, in tiles.
    L.FLAT_PITCH = 0.574;
    L.FLAT_MARGIN = 0.3;
    // A pixel at or under this opacity (0 to 255) is a picture's margin, not its art.
    L.TRIM_ALPHA = 8;

    const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const channel = (hex, at) => parseInt(hex.slice(at, at + 2), 16);

    /** A side's color: the project's own (`colors`, by side) where it gives one, else the stock one. An unknown side is a bystander. */
    L.color = function(team, colors) {
        const side = L.TEAMS.includes(team) ? team : 'neutral';
        return colors && isHex(colors[side]) ? colors[side] : L.COLORS[side];
    };

    /** `hex` moved toward white (`amount` above 0) or toward black (below 0), as an `rgb()` color. */
    L.shade = function(hex, amount) {
        const base = isHex(hex) ? hex : L.COLORS.neutral;
        const toward = amount > 0 ? 255 : 0, share = Math.min(1, Math.abs(Number(amount) || 0));
        const mix = at => Math.round(channel(base, at) + (toward - channel(base, at)) * share);
        return 'rgb(' + mix(1) + ', ' + mix(3) + ', ' + mix(5) + ')';
    };

    /** An enemy's `<unit character: Name, index>` note as { characterName, characterIndex } (no index: 0); null when the note has none. */
    L.unitCharacter = function(note) {
        const match = /<unit\s*character\s*:\s*([^,>]+?)\s*(?:,\s*(\d+)\s*)?>/i.exec(String(note || ''));
        const name = match ? match[1].trim() : '';
        return name ? { characterName: name, characterIndex: Math.min(7, Number(match[2]) || 0) } : null;
    };

    /** An enemy's `rrBattle.character` (`{ name, index }`, what the Database's card stores) as { characterName, characterIndex }; null when it has none. */
    L.ownCharacter = function(record) {
        const own = record && record.rrBattle && record.rrBattle.character;
        const name = own && typeof own === 'object' ? String(own.name || '').trim() : '';
        return name ? { characterName: name, characterIndex: Math.min(7, Math.max(0, Number(own.index) || 0)) } : null;
    };

    /** The character sheet a record gives its units: an actor's own; an enemy's own setting, else its note tag. Null when it gives none. */
    L.recordCharacter = function(unit, record) {
        if (!unit || !record) return null;
        if (unit.record === 'actor') {
            return record.characterName ? { characterName: String(record.characterName), characterIndex: Number(record.characterIndex) || 0 } : null;
        }
        return unit.record === 'enemy' ? L.ownCharacter(record) || L.unitCharacter(record.note) : null;
    };

    /** Whether an event page shows something of its own: a character picture, a tile, or a model (`model`: its spec). */
    L.hasOwn = function(image, model) {
        return !!((image && (image.tileId > 0 || image.characterName)) || (model && model.name));
    };

    /**
     * What a unit stands as. `unit` is { team, record: 'actor' | 'enemy' | '', id }.
     * `sources` holds what the caller knows:
     *   own       the event shows a picture or a model of its own (`hasOwn`)
     *   model     the model the Database binds to the record (its spec, with a name)
     *   record    the actor or enemy record
     *   sideView  the game's battles are side view
     *   colors    the sides' colors, where the project has its own
     *   exists    `exists(folder, name)`: false for a picture file that is not there
     *             ('characters', 'enemies', 'sv_enemies'); left out, a named picture is taken as there
     * Returns { kind, team, color } and, by kind: `spec` (model); `characterName`,
     * `characterIndex` (character); `folder`, `name`, `hue` (picture).
     */
    L.resolve = function(unit, sources) {
        const from = sources || {};
        const team = unit && L.TEAMS.includes(unit.team) ? unit.team : 'neutral';
        const color = L.color(team, from.colors);
        if (from.own) return { kind: 'own', team, color };
        if (from.model && from.model.name) return { kind: 'model', team, color, spec: from.model };
        const record = from.record || null;
        const there = (folder, name) => typeof from.exists !== 'function' || from.exists(folder, name) !== false;
        const sheet = L.recordCharacter(unit, record);
        if (sheet && there('characters', sheet.characterName)) {
            return { kind: 'character', team, color, characterName: sheet.characterName, characterIndex: sheet.characterIndex };
        }
        if (record && unit && unit.record === 'enemy' && record.battlerName) {
            const folder = from.sideView ? 'sv_enemies' : 'enemies', name = String(record.battlerName);
            if (there(folder, name)) return { kind: 'picture', team, color, folder, name, hue: (((Number(record.battlerHue) || 0) % 360) + 360) % 360 };
        }
        return { kind: 'figure', team, color };
    };

    /**
     * The size a picture of `width` by `height` pixels is drawn at to fit
     * the tiles a unit's picture takes: TILES_WIDE wide and TILES_TALL tall
     * on tiles of `tileWidth` by `tileHeight` pixels, times `size` for a unit
     * whose typed size is that many tiles wide. A small picture grows and a
     * large one shrinks; its proportions stay. { scale, width, height }, the
     * size in whole pixels.
     */
    L.fit = function(width, height, tileWidth, tileHeight, size) {
        const tiles = Math.max(1, Math.floor(Number(size) || 1));
        const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
        const scale = Math.min(L.TILES_WIDE * tiles * tileWidth / w, L.TILES_TALL * tiles * tileHeight / h);
        return { scale, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
    };

    /**
     * What a flat map's picture of a model `tall` tiles high is scaled by so
     * a unit one tile big stands no taller than a unit's picture (TILES_TALL
     * tiles, times `size` for a typed size): never enlarged, never under a fifth.
     */
    L.modelFit = function(tall, size) {
        const tiles = Math.max(1, Math.floor(Number(size) || 1));
        const shown = Math.max(0.25, Number(tall) || 0) * L.FLAT_PITCH + L.FLAT_MARGIN;
        return Math.max(0.2, Math.min(1, L.TILES_TALL * tiles / shown));
    };

    /** The box of a picture's art inside its margin (`data`: RGBA, `width` by `height`): { x, y, width, height }; null when all of it is clear. */
    L.trim = function(data, width, height) {
        let left = width, right = -1, top = height, bottom = -1;
        for (let y = 0; y < height; y++) {
            let at = y * width * 4 + 3;
            for (let x = 0; x < width; x++, at += 4) {
                if (data[at] <= L.TRIM_ALPHA) continue;
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                bottom = y;
            }
        }
        return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    };

    /** Turns the hue of RGBA pixels by `hue` degrees, in place: what a battler's hue does to its picture in a battle. */
    L.rotateHue = function(data, hue) {
        const turn = ((((Number(hue) || 0) % 360) + 360) % 360) / 360;
        if (!turn) return data;
        for (let i = 0; i < data.length; i += 4) {
            if (!data[i + 3]) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const low = Math.min(r, g, b), high = Math.max(r, g, b), spread = high - low;
            // A gray has no hue to turn.
            if (!spread) continue;
            const hueNow = r === high ? (((g - b) / spread) + 6) % 6 : g === high ? (b - r) / spread + 2 : (r - g) / spread + 4;
            const turned = ((hueNow / 6 + turn) % 1) * 6;
            const part = Math.round(spread * (1 - Math.abs(turned % 2 - 1)));
            const sector = Math.floor(turned) % 6;
            data[i] = low + (sector === 0 || sector === 5 ? spread : sector === 1 || sector === 4 ? part : 0);
            data[i + 1] = low + (sector === 1 || sector === 2 ? spread : sector === 0 || sector === 3 ? part : 0);
            data[i + 2] = low + (sector === 3 || sector === 4 ? spread : sector === 2 || sector === 5 ? part : 0);
        }
        return data;
    };

    /**
     * A plain figure in a side's color, on a 2D canvas `context`, inside the
     * box at (x, y) of `width` by `height` pixels: a head over a body that
     * widens to the ground, its feet on the middle of the box's bottom edge.
     * What a unit with no picture anywhere stands as.
     */
    L.drawFigure = function(context, x, y, width, height, color) {
        const hex = isHex(color) ? color : L.COLORS.neutral;
        // Its own proportions (TILES_WIDE by TILES_TALL) inside any box.
        const unit = Math.min(width / L.TILES_WIDE, height / L.TILES_TALL);
        const w = unit * L.TILES_WIDE, h = unit * L.TILES_TALL;
        const left = x + (width - w) / 2, top = y + height - h, middle = left + w / 2;
        const line = Math.max(1, w * 0.05), edge = line / 2;
        let paint = hex;
        if (typeof context.createLinearGradient === 'function') {
            paint = context.createLinearGradient(left, 0, left + w, 0);
            paint.addColorStop(0.1, L.shade(hex, 0.35));
            paint.addColorStop(0.55, hex);
            paint.addColorStop(0.95, L.shade(hex, -0.35));
        }
        context.save();
        context.lineJoin = 'round';
        context.lineWidth = line;
        context.strokeStyle = L.shade(hex, -0.6);
        context.fillStyle = paint;
        const head = w * 0.2, headY = top + edge + head;
        const shoulder = headY + head + w * 0.06, ground = top + h - edge;
        const half = w * 0.26, foot = w * 0.4, round = w * 0.16;
        context.beginPath();
        context.moveTo(middle - foot, ground);
        context.lineTo(middle - half, shoulder + round);
        context.quadraticCurveTo(middle - half, shoulder, middle - half + round, shoulder);
        context.lineTo(middle + half - round, shoulder);
        context.quadraticCurveTo(middle + half, shoulder, middle + half, shoulder + round);
        context.lineTo(middle + foot, ground);
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(middle, headY, head, 0, Math.PI * 2);
        context.closePath();
        context.fill();
        context.stroke();
        context.restore();
    };

    root.ReactorFightLook = L;
    if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
