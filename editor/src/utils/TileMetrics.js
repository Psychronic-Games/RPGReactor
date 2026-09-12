/**
 * How big a tile is, in pixels, for the project that is open.
 *
 * RPG Maker MZ lets a project choose 48, 32, 24 or 16 and records it in
 * `System.json` as `tileSize`; the Database's System 2 tab has always offered
 * the choice. The runtime honours it — `Game_Map.tileWidth` reads
 * `$dataSystem.tileSize` — but the editor's renderers were written when 48 was
 * the only answer and sampled every sheet in 48-pixel steps. Open a 32-pixel
 * project and each read lands one and a half tiles further along than it
 * should, drifting as it goes, so the map draws as a mosaic of the wrong art.
 *
 * The number 48 also appears throughout the tile-id arithmetic, where it means
 * "48 shapes per autotile kind" and is a property of the *format* rather than
 * of the art. That one is fixed forever and must not be routed through here.
 * Only sizes in pixels belong to this module.
 */
(function(root) {
    const DEFAULT = 48;
    // Reactor supports 8–64 pixel cells. An unrecognised value is more likely a
    // damaged file than a project nobody has seen before, and guessing wrong
    // silently is what this module exists to stop.
    const SUPPORTED = [64, 48, 32, 24, 16, 8];

    /** The tile size a System.json record asks for, or 48. */
    const tileSizeOf = system => {
        const size = Number(system && system.tileSize);
        return SUPPORTED.includes(size) ? size : DEFAULT;
    };

    /**
     * How much a sheet is scaled relative to the 48-pixel layout.
     *
     * A 32-pixel project's sheets are two thirds the size of MZ's standard
     * ones — 512x384 where 48 pixels would be 768x576 — because the grid is the
     * same and only the cell changed. Anything that has a 48-based measurement
     * to convert can multiply by this.
     */
    const sheetScaleOf = system => tileSizeOf(system) / DEFAULT;

    const api = { DEFAULT, SUPPORTED, tileSizeOf, sheetScaleOf };
    root.RRTileMetrics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
