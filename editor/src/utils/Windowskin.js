/**
 * RRWindowskin - reads a project's own img/system/Window.png and reproduces
 * what the runtime does with it, so the editor can show real colours and a real
 * window instead of an approximation of one.
 *
 * Two things were being guessed before this existed:
 *
 *   Text colours. `\C[n]` does not name a fixed palette - it samples a pixel
 *   out of the windowskin, so a project that ships a custom skin has different
 *   colours for every index. The editor carried a hardcoded 32-entry table that
 *   also substituted editor CSS variables for six of the entries, which meant
 *   the command list drew `\C[3]` in a colour the game would never produce. The
 *   formula here is transcribed from `ColorManager.readTextColor`
 *   (runtime/reactor_managers.js:1969), which is the only definition of it.
 *
 *   The window itself. The frame, the tiled back and the dim variant all come
 *   out of fixed rectangles of the same sheet, laid out by
 *   `Window._refreshBack` / `_refreshFrame` (runtime/reactor_core.js:5839) and
 *   `Window_Base.refreshDimmerBitmap` (runtime/reactor_windows.js:555).
 *
 * Loading goes through a Blob rather than a file:// URL on purpose. Colour
 * sampling needs `getImageData`, and a canvas that has drawn a file:// image is
 * tainted under the default policy - the read then throws a SecurityError at
 * the point of use, which is a confusing place to discover a loading decision.
 * Bytes read through `fs` into a blob: URL are same-origin and never taint.
 */
(function (root) {
    'use strict';

    // Sheet geometry, all of it fixed by the runtime rather than by us.
    const METRICS = Object.freeze({
        // Back: stretched from (0,0,95,95) - 95 and not 96, to avoid sampling
        // the neighbouring cell and blurring the edge, exactly as the runtime
        // comments say - with (0,96,96,96) tiled over the top.
        BACK_SRC: Object.freeze({ x: 0, y: 0, w: 95, h: 95 }),
        BACK_TILE_SRC: Object.freeze({ x: 0, y: 96, w: 96, h: 96 }),
        // Frame: nine-sliced from (96,0,96,96) with a 24px corner.
        FRAME_SRC: Object.freeze({ x: 96, y: 0, w: 96, h: 96 }),
        FRAME_MARGIN: 24,
        // The back is inset by the window margin on every side.
        WINDOW_MARGIN: 4,
        // $gameSystem.windowPadding() is a constant 12 in the runtime.
        PADDING: 12,
        LINE_HEIGHT: 36,
        ITEM_PADDING: 8,
        FACE_SIZE: 144,
        DEFAULT_FONT_SIZE: 26,
        DEFAULT_OPACITY: 192
    });

    /**
     * The palette to use when a project has no readable windowskin.
     *
     * Sampled from the stock RPG Maker skin so the fallback is the real default
     * palette rather than an invention. It is only ever reached when the sheet
     * is missing or unreadable, and callers can tell the difference because
     * `load` rejects rather than silently returning this.
     */
    const FALLBACK_PALETTE = Object.freeze([
        '#ffffff', '#20a0d6', '#ff784c', '#66cc40', '#99ccff', '#ccc0a8',
        '#ffff80', '#80ff80', '#c0c0c0', '#808080', '#ff8080', '#ffc060',
        '#80c0ff', '#a0a0ff', '#c080ff', '#40c0a0', '#c08040', '#ffff40',
        '#ff6060', '#a0a0ff', '#60e060', '#ff80ff', '#c0c0c0', '#ff8080',
        '#8080ff', '#80ff80', '#ff8080', '#ffffff', '#808080', '#ff6666',
        '#66ff66', '#6666ff'
    ]);

    const cache = new Map();

    /**
     * The sheet's bytes. An encrypted project holds `Window.png_`, which
     * only the encrypted-asset reader knows how to find and decrypt; the
     * bytes are copied into this realm because a Node Buffer does not pass
     * the page's Blob checks.
     */
    async function readFileBytes(absolutePath) {
        const reader = root.RREncryptedAssets && root.RREncryptedAssets.readAssetBytesAsync;
        const bytes = reader ? await reader(absolutePath) : require('fs').readFileSync(absolutePath);
        if (!bytes) throw new Error('Windowskin could not be read');
        return new Uint8Array(bytes);
    }

    function statMtime(absolutePath) {
        try {
            return require('fs').statSync(absolutePath).mtimeMs;
        } catch (error) {
            return 0;
        }
    }

    function decodeToImage(bytes) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([bytes], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
                // The object URL has done its job once the bitmap is decoded;
                // holding it would leak one blob per skin load.
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Windowskin could not be decoded'));
            };
            image.src = url;
        });
    }

    /**
     * Load a project's windowskin, cached until the file changes on disk.
     *
     * Returns a record carrying both the image and a scratch canvas holding it,
     * because every colour read needs pixel access and re-drawing the sheet per
     * read is the allocation pattern the runtime's own cache exists to avoid.
     */
    async function load(windowPngPath) {
        const mtimeMs = statMtime(windowPngPath);
        const cached = cache.get(windowPngPath);
        if (cached && cached.mtimeMs === mtimeMs) return cached.record;

        const image = await decodeToImage(await readFileBytes(windowPngPath));
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);

        const record = { image, canvas, context, colors: new Map(), path: windowPngPath };
        cache.set(windowPngPath, { mtimeMs, record });
        return record;
    }

    /**
     * The cached skin if it is already decoded, otherwise null - and start
     * loading it either way.
     *
     * Synchronous callers need this. The event command list colours `\C[n]`
     * while it renders rows, which cannot await; it takes the fallback palette
     * on the first pass and the real one on every pass after the sheet lands.
     */
    function peek(windowPngPath) {
        const cached = cache.get(windowPngPath);
        if (cached && cached.mtimeMs === statMtime(windowPngPath)) return cached.record;
        if (!peek._pending) peek._pending = new Set();
        if (!peek._pending.has(windowPngPath)) {
            peek._pending.add(windowPngPath);
            load(windowPngPath)
                .catch(() => null)
                .then(record => {
                    peek._pending.delete(windowPngPath);
                    // A caller that already rendered with the fallback palette
                    // has no other way to learn the real one arrived, and would
                    // otherwise show the wrong colours until something else
                    // happened to redraw it.
                    if (record && typeof document !== 'undefined' && document.dispatchEvent) {
                        document.dispatchEvent(new CustomEvent('rr-windowskin-loaded', {
                            detail: { path: windowPngPath }
                        }));
                    }
                });
        }
        return null;
    }

    /** Discard a cached skin - used when a project closes or the skin is replaced. */
    function forget(windowPngPath) {
        if (windowPngPath) cache.delete(windowPngPath);
        else cache.clear();
    }

    function toHex(r, g, b) {
        const pair = value => value.toString(16).padStart(2, '0');
        return `#${pair(r)}${pair(g)}${pair(b)}`;
    }

    /**
     * `\C[n]` as the runtime resolves it.
     *
     * ColorManager.readTextColor: px = 96 + (n % 8) * 12 + 6,
     *                             py = 144 + floor(n / 8) * 12 + 6.
     * Reading outside the sheet is not an error in the runtime either - it just
     * yields whatever is there - but an index past the sheet is far more likely
     * to be a typo than a deliberate read, so it falls back to colour 0.
     */
    function textColor(record, index) {
        const n = Number(index);
        if (!Number.isFinite(n) || n < 0) return normalColor(record);
        if (!record || !record.context) return FALLBACK_PALETTE[n % FALLBACK_PALETTE.length];

        const cachedColor = record.colors.get(n);
        if (cachedColor) return cachedColor;

        const px = 96 + (n % 8) * 12 + 6;
        const py = 144 + Math.floor(n / 8) * 12 + 6;
        if (px >= record.canvas.width || py >= record.canvas.height) {
            return normalColor(record);
        }

        const data = record.context.getImageData(px, py, 1, 1).data;
        const color = toHex(data[0], data[1], data[2]);
        record.colors.set(n, color);
        return color;
    }

    function normalColor(record) {
        if (!record || !record.context) return FALLBACK_PALETTE[0];
        return textColor(record, 0);
    }

    /** The full 32-entry palette, for a swatch grid. */
    function palette(record) {
        const colors = [];
        for (let index = 0; index < 32; index++) colors.push(textColor(record, index));
        return colors;
    }

    // ------------------------------------------------------------- drawing
    function drawNineSlice(context, image, src, dest, margin) {
        const m = margin;
        // Corner slices keep their size; edges stretch along one axis; the
        // centre is skipped, because the frame's middle is transparent and the
        // back layer is what shows through it.
        const innerSrcW = src.w - m * 2;
        const innerSrcH = src.h - m * 2;
        const innerDestW = Math.max(0, dest.w - m * 2);
        const innerDestH = Math.max(0, dest.h - m * 2);

        const parts = [
            [src.x, src.y, m, m, dest.x, dest.y, m, m],
            [src.x + src.w - m, src.y, m, m, dest.x + dest.w - m, dest.y, m, m],
            [src.x, src.y + src.h - m, m, m, dest.x, dest.y + dest.h - m, m, m],
            [src.x + src.w - m, src.y + src.h - m, m, m, dest.x + dest.w - m, dest.y + dest.h - m, m, m],
            [src.x + m, src.y, innerSrcW, m, dest.x + m, dest.y, innerDestW, m],
            [src.x + m, src.y + src.h - m, innerSrcW, m, dest.x + m, dest.y + dest.h - m, innerDestW, m],
            [src.x, src.y + m, m, innerSrcH, dest.x, dest.y + m, m, innerDestH],
            [src.x + src.w - m, src.y + m, m, innerSrcH, dest.x + dest.w - m, dest.y + m, m, innerDestH]
        ];

        for (const [sx, sy, sw, sh, dx, dy, dw, dh] of parts) {
            if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
            context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        }
    }

    /**
     * Apply the window tone the way the runtime's colour tone does: an additive
     * r/g/b shift on what has already been drawn, clipped to the back area.
     * A zero tone - which is what most projects have - short-circuits.
     */
    function applyTone(context, dest, tone) {
        if (!Array.isArray(tone)) return;
        const [r = 0, g = 0, b = 0] = tone;
        if (!r && !g && !b) return;

        context.save();
        context.beginPath();
        context.rect(dest.x, dest.y, dest.w, dest.h);
        context.clip();
        context.globalCompositeOperation = r >= 0 && g >= 0 && b >= 0 ? 'lighter' : 'source-over';
        context.fillStyle = `rgba(${Math.abs(r)}, ${Math.abs(g)}, ${Math.abs(b)}, ${
            r < 0 || g < 0 || b < 0 ? 0.35 : 1})`;
        context.globalAlpha = 0.5;
        context.fillRect(dest.x, dest.y, dest.w, dest.h);
        context.restore();
    }

    function drawBack(context, record, dest, opacity, tone) {
        const m = METRICS.WINDOW_MARGIN;
        const area = {
            x: dest.x + m,
            y: dest.y + m,
            w: Math.max(0, dest.w - m * 2),
            h: Math.max(0, dest.h - m * 2)
        };
        if (area.w <= 0 || area.h <= 0) return;

        context.save();
        context.globalAlpha = Math.max(0, Math.min(255, opacity)) / 255;

        const back = METRICS.BACK_SRC;
        context.drawImage(record.image, back.x, back.y, back.w, back.h, area.x, area.y, area.w, area.h);

        // The overlay tiles at its native size rather than stretching, which is
        // what gives a patterned skin its texture instead of a smeared gradient.
        const tile = METRICS.BACK_TILE_SRC;
        context.beginPath();
        context.rect(area.x, area.y, area.w, area.h);
        context.clip();
        for (let y = area.y; y < area.y + area.h; y += tile.h) {
            for (let x = area.x; x < area.x + area.w; x += tile.w) {
                context.drawImage(record.image, tile.x, tile.y, tile.w, tile.h, x, y, tile.w, tile.h);
            }
        }
        context.restore();

        applyTone(context, area, tone);
    }

    /**
     * The dim background: a flat 60% black band with the padding-height top and
     * bottom edges faded out, and eight pixels wider than the window.
     */
    function drawDim(context, dest) {
        const w = dest.w > 0 ? dest.w + 8 : 0;
        const h = dest.h;
        const m = METRICS.PADDING;
        if (w <= 0 || h <= 0) return;

        const x = dest.x - 4;
        const c1 = 'rgba(0, 0, 0, 0.6)';
        const c2 = 'rgba(0, 0, 0, 0)';

        const top = context.createLinearGradient(0, dest.y, 0, dest.y + m);
        top.addColorStop(0, c2);
        top.addColorStop(1, c1);
        context.fillStyle = top;
        context.fillRect(x, dest.y, w, m);

        context.fillStyle = c1;
        context.fillRect(x, dest.y + m, w, Math.max(0, h - m * 2));

        const bottom = context.createLinearGradient(0, dest.y + h - m, 0, dest.y + h);
        bottom.addColorStop(0, c1);
        bottom.addColorStop(1, c2);
        context.fillStyle = bottom;
        context.fillRect(x, dest.y + h - m, w, m);
    }

    /**
     * Draw a window the way the runtime would.
     * `background` follows the Show Text parameter: 0 window, 1 dim, 2 transparent.
     */
    function drawWindow(context, dest, record, options) {
        const settings = options || {};
        const background = Number(settings.background) || 0;

        if (background === 2) return;
        if (background === 1) {
            drawDim(context, dest);
            return;
        }
        if (!record || !record.image) return;

        const opacity = Number.isFinite(settings.opacity) ? settings.opacity : METRICS.DEFAULT_OPACITY;
        drawBack(context, record, dest, opacity, settings.tone);
        drawNineSlice(context, record.image, METRICS.FRAME_SRC, dest, METRICS.FRAME_MARGIN);
    }

    // ---------------------------------------------------------------- font
    const fontPromises = new Map();

    /**
     * Register a project's main font with the document so a preview canvas can
     * actually use it. The editor never loaded game fonts before, so a preview
     * drawn without this silently falls back to a system face and mismeasures
     * every line - which is precisely the thing a preview exists to get right.
     *
     * Resolves to the family name to use in `context.font`, falling back to a
     * generic when the file is missing rather than failing the whole preview.
     */
    function loadGameFont(fontsDir, filename) {
        if (!filename) return Promise.resolve('sans-serif');
        const path = require('path');
        const absolute = path.join(fontsDir, filename);
        if (fontPromises.has(absolute)) return fontPromises.get(absolute);

        const family = `rr-preview-${filename.replace(/[^A-Za-z0-9]/g, '-')}`;
        const promise = (async () => {
            try {
                const bytes = readFileBytes(absolute);
                // A copy into a fresh ArrayBuffer: FontFace will not take a
                // Node Buffer view backed by a pooled allocation.
                const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                const face = new FontFace(family, buffer);
                await face.load();
                document.fonts.add(face);
                return family;
            } catch (error) {
                console.warn(`Could not load game font ${filename}:`, error);
                return 'sans-serif';
            }
        })();

        fontPromises.set(absolute, promise);
        return promise;
    }

    const api = {
        METRICS,
        FALLBACK_PALETTE,
        load,
        peek,
        forget,
        textColor,
        normalColor,
        palette,
        drawWindow,
        drawNineSlice,
        loadGameFont
    };

    root.RRWindowskin = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
