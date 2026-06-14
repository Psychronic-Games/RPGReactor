/**
 * CharacterRenderer — composites all active parts into a single ImageData.
 *
 * Parts draw into a shared Uint8ClampedArray in layer order (body first,
 * accessories last). After all parts draw, a global outline pass runs so
 * every part shares one consistent pixel-art border rather than each part
 * outlining itself independently.
 */
class CharacterRenderer {
    // Back-to-front draw order. Parts not in this list draw after 'accessory'.
    static LAYER_ORDER = [
        'body', 'clothing', 'head', 'face', 'hair', 'hat', 'equipment', 'accessory'
    ];

    /**
     * Render a character into a new ImageData.
     *
     * @param {number}   W           Canvas width  (usually 144)
     * @param {number}   H           Canvas height (usually 144)
     * @param {number}   direction   0=front 1=left 2=right 3=back
     * @param {number}   frame       0-2 walk frame (1 = idle center)
     * @param {Array}    activeParts [{descriptor, params}, …]
     * @returns {ImageData}
     */
    static render(W, H, direction, frame, activeParts) {
        const imageData = new ImageData(W, H);
        const buf = imageData.data;

        // activeParts arrive in explicit user-controlled order from the editor's
        // Layers panel (first = bottom layer, last = top layer). We render in
        // that order. If callers pass parts without an explicit order they can
        // still rely on the legacy category sort by setting `_legacyOrder`.
        const sorted = activeParts.length && activeParts[0]?._legacyOrder
            ? [...activeParts].sort((a, b) => {
                const ai = CharacterRenderer.LAYER_ORDER.indexOf(a.descriptor.category);
                const bi = CharacterRenderer.LAYER_ORDER.indexOf(b.descriptor.category);
                return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
            })
            : [...activeParts];

        // New-format templates carry their own outline letters in the palette;
        // any draw that used one sets this flag so we skip the auto-outline.
        if (typeof window !== 'undefined') window._RR_CG_TEMPLATE_HAS_OUTLINE = false;

        // alignX/alignY moves the entire SILHOUETTE within the canvas. To keep
        // every part (hair, helmet, outfit) registered to the body, we compute
        // a single shift once from the body's content bbox and apply it to all
        // parts. Cell-based positioning inside each part keeps them aligned
        // relative to each other; the shift moves the whole stack together.
        const bodyDraw = sorted.find(p =>
            p.descriptor?.category === 'body' && p.descriptor?.template?.sheet
        );
        let globalShiftPxX = 0, globalShiftPxY = 0;
        if (bodyDraw) {
            const sheet = bodyDraw.descriptor.template.sheet;
            const bbox = (typeof RR_CG_sheetContentBbox === 'function')
                ? RR_CG_sheetContentBbox(sheet)
                : null;
            const dims = (typeof RR_CG_canonicalSheetDims === 'function')
                ? RR_CG_canonicalSheetDims(sheet)
                : { w: W, h: H };
            if (bbox && dims) {
                const scale = Math.min(1, W / dims.w, H / dims.h);
                const ox = Math.round((W - dims.w * scale) / 2);
                const oy = Math.round((H - dims.h * scale) / 2);
                // Body content's current canvas-pixel position (without shift).
                const curMinX = ox + bbox.minX * scale;
                const curMaxX = ox + bbox.maxX * scale;
                const curMinY = oy + bbox.minY * scale;
                const curMaxY = oy + bbox.maxY * scale;
                const alignX = bodyDraw.params.alignX || 'center';
                const alignY = bodyDraw.params.alignY || 'middle';
                // Where the body content SHOULD go in canvas pixels.
                const targetMinX = alignX === 'left' ? 0
                    : alignX === 'right' ? W - (curMaxX - curMinX)
                    : (W - (curMaxX - curMinX)) / 2;
                const targetMinY = alignY === 'top' ? 0
                    : alignY === 'bottom' ? H - (curMaxY - curMinY)
                    : (H - (curMaxY - curMinY)) / 2;
                globalShiftPxX = Math.round(targetMinX - curMinX);
                globalShiftPxY = Math.round(targetMinY - curMinY);
            }
        }

        for (const { descriptor, params } of sorted) {
            if (typeof descriptor.draw !== 'function') continue;
            params._globalShiftPxX = globalShiftPxX;
            params._globalShiftPxY = globalShiftPxY;
            try {
                descriptor.draw(buf, W, H, direction, frame, params);
            } catch (e) {
                console.warn('CharacterRenderer: draw error in', descriptor.id, e);
            }
        }

        const skipOutline = typeof window !== 'undefined' && window._RR_CG_TEMPLATE_HAS_OUTLINE === true;
        if (!skipOutline) {
            // Legacy unifying outline: warm near-black matches the late-SNES /
            // early-PS1 palette feel for templates that don't ship their own.
            pixOutlinePass(buf, W, H, 22, 14, 10);
        }

        return imageData;
    }

    /**
     * Resolve param defaults for a descriptor — fills in any key absent from
     * the user-supplied values object with the schema default.
     */
    static resolveParams(descriptor, userValues) {
        const out = { ...(userValues || {}) };
        for (const p of (descriptor.params || [])) {
            if (out[p.key] === undefined) out[p.key] = p.default;
        }
        return out;
    }

    /**
     * Build the activeParts list from a plain config object.
     * config: { partId: { param: value, … }, … }
     * Only parts whose id is listed in config (and present in the registry)
     * are included.
     */
    static buildActiveParts(config) {
        return Object.keys(config).map(partId => {
            const descriptor = RR_CHARACTER_REGISTRY.find(d => d.id === partId);
            if (!descriptor) return null;
            const params = CharacterRenderer.resolveParams(descriptor, config[partId]);
            return { descriptor, params };
        }).filter(Boolean);
    }
}
