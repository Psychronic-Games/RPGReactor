/**
 * Palette resolution for template parts: turns a part's letter→hex map plus
 * the user's runtime palette parameters into a letter→rgb lookup that the
 * renderer consumes once per pixel.
 *
 * Material tags ('skin', 'eye', 'hair', etc.) drive HSL group shifts when the
 * user picks a non-default skin/hair/eye colour; per-letter overrides take
 * precedence over group tints, which take precedence over the "Tint All"
 * shift, which falls back to the authored base hex.
 */

function RR_CG_resolveTemplatePalette(palette, params) {
    const materialOverrides = {
        skin:      params.skinColor,
        eye:       params.eyeColor,
        hair:      params.hairColor,
        brow:      params.eyebrowColor,
        eyebrow:   params.eyebrowColor,
        cloth:     params.underwearColor,
        clothing:  params.underwearColor,
        underwear: params.underwearColor
    };

    const groups = {};
    for (const [, entry] of Object.entries(palette)) {
        const hex = typeof entry === 'string' ? entry : (entry && entry.hex);
        const material = typeof entry === 'object' && entry ? entry.material : null;
        if (!hex || !material) continue;
        if (!groups[material]) groups[material] = [];
        groups[material].push(hex);
    }
    const groupBases = {};
    for (const [material, hexes] of Object.entries(groups)) {
        groupBases[material] = RR_CG_avgHex(hexes);
    }

    const perLetter = (params && params.paletteOverrides) || {};
    const tintAll = params && params.tintAll;
    let paletteAvg = null;
    if (tintAll) {
        const hexes = Object.values(palette)
            .map(e => typeof e === 'string' ? e : (e && e.hex))
            .filter(Boolean);
        if (hexes.length) paletteAvg = RR_CG_avgHex(hexes);
    }

    const resolved = {};
    for (const [letter, entry] of Object.entries(palette)) {
        const hex = typeof entry === 'string' ? entry : (entry && entry.hex);
        const material = typeof entry === 'object' && entry ? entry.material : null;
        if (!hex) continue;
        let finalHex = hex;
        if (perLetter[letter]) {
            finalHex = perLetter[letter];
        } else {
            const override = material ? materialOverrides[material] : null;
            if (override && groupBases[material]) {
                finalHex = RR_CG_shiftColorHsl(hex, groupBases[material], override);
            } else if (tintAll && paletteAvg) {
                finalHex = RR_CG_shiftColorHsl(hex, paletteAvg, tintAll);
            }
        }
        resolved[letter] = RR_CG_hexToRgb(finalHex);
    }
    return resolved;
}

function RR_CG_hexToRgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function RR_CG_avgHex(hexes) {
    if (!hexes.length) return '#000000';
    let r = 0, g = 0, b = 0;
    for (const h of hexes) {
        const c = RR_CG_hexToRgb(h);
        r += c.r; g += c.g; b += c.b;
    }
    r = Math.round(r / hexes.length);
    g = Math.round(g / hexes.length);
    b = Math.round(b / hexes.length);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function RR_CG_shiftColorHsl(hex, fromHex, toHex) {
    const from = RR_CG_hexToRgb(fromHex);
    const to = RR_CG_hexToRgb(toHex);
    const cur = RR_CG_hexToRgb(hex);
    const fromHsl = _palRgbToHsl(from.r, from.g, from.b);
    const toHsl = _palRgbToHsl(to.r, to.g, to.b);
    const curHsl = _palRgbToHsl(cur.r, cur.g, cur.b);
    const dH = toHsl.h - fromHsl.h;
    const dS = toHsl.s - fromHsl.s;
    const dL = toHsl.l - fromHsl.l;
    const finalHsl = {
        h: ((curHsl.h + dH) % 1 + 1) % 1,
        s: Math.max(0, Math.min(1, curHsl.s + dS)),
        l: Math.max(0, Math.min(1, curHsl.l + dL))
    };
    const out = _palHslToRgb(finalHsl.h, finalHsl.s, finalHsl.l);
    return '#' + ((1 << 24) | (out.r << 16) | (out.g << 8) | out.b).toString(16).slice(1);
}

// Legacy ASCII material map (uppercase A-Z primary slots + lowercase extended
// shade slots). Used by the editor's swatch legend (_runtimeMaterialColors)
// for parts that don't ship their own palette.
function RR_CG_buildAsciiMaterialColors(skin, eye, cloth, brow, hair, female) {
    const lip = buildPalette(female ? '#e06977' : '#cc5f59');
    const shadow = { r: 7, g: 10, b: 21 };

    return {
        A: skin.deep,
        B: skin.base,
        C: skin.highlight,
        D: skin.outline,
        E: cloth.base,
        F: cloth.highlight,
        G: shadow,
        H: skin.highlight,
        I: eye.base,
        J: eye.shadow,
        K: eye.deep,
        L: skin.base,
        N: { r: 12, g: 8, b: 6 },
        O: skin.outline,
        P: cloth.deep,
        Q: cloth.shadow,
        R: lip.base,
        S: skin.deep,
        T: skin.shadow,
        U: eye.highlight,
        V: eye.outline,
        W: { r: 255, g: 244, b: 232 },
        X: hair.base,
        Y: { r: 235, g: 226, b: 204 },
        Z: { r: 12, g: 8, b: 6 },
        n: { r: 12, g: 8, b: 6 },
        k: eye.deep,
        m: skin.shadow,
        x: hair.base,
        o: skin.outline,
        d: skin.outline,
        a: skin.deep,
        s: skin.deep,
        t: skin.shadow,
        b: skin.base,
        l: skin.base,
        h: skin.highlight,
        c: skin.highlight,
        p: cloth.deep,
        q: cloth.shadow,
        e: cloth.base,
        f: cloth.highlight,
        v: eye.outline,
        j: eye.shadow,
        i: eye.base,
        u: eye.highlight,
        y: { r: 235, g: 226, b: 204 },
        w: { r: 255, g: 244, b: 232 },
        r: lip.base,
        g: shadow
    };
}
