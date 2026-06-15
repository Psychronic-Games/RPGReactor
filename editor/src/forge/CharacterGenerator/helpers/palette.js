/**
 * Color palette utilities for the Character Generator.
 *
 * Pixel art characters use a small, fixed set of tones per color region:
 *   highlight  — lightest, upper-left facing surfaces
 *   base       — mid-tone, the "flat fill" color
 *   shadow     — darker, right/lower surfaces
 *   deep       — darkest fill, deep creases/inner corners
 *   outline    — very dark, replaces border pixels via pixOutlinePass
 *
 * All palette-building functions return objects with {r,g,b} fields for each
 * tone so they can be passed directly to pixShadedSpan / pixSet etc.
 */

function _palHexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function _palRgbToHex(r, g, b) {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function _palRgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
    }
    return { h: h / 6, s, l };
}

function _palHslToRgb(h, s, l) {
    if (s === 0) {
        const v = Math.round(Math.max(0, Math.min(1, l)) * 255);
        return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2 = (t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };
    return {
        r: Math.round(hue2(h + 1/3) * 255),
        g: Math.round(hue2(h)       * 255),
        b: Math.round(hue2(h - 1/3) * 255)
    };
}

function _shift(hex, dL, dS = 0, dH = 0) {
    const { r, g, b } = _palHexToRgb(hex);
    const { h, s, l } = _palRgbToHsl(r, g, b);
    return _palHslToRgb(
        (h + dH + 1) % 1,
        Math.max(0, Math.min(1, s + dS)),
        Math.max(0, Math.min(1, l + dL))
    );
}

/**
 * Build a generic 5-tone palette from a base hex color.
 * Good for clothing, hair, metal, leather, etc.
 */
function buildPalette(baseHex) {
    return {
        highlight: _shift(baseHex, +0.18, -0.06),
        base:      _palHexToRgb(baseHex),
        shadow:    _shift(baseHex, -0.14, +0.06),
        deep:      _shift(baseHex, -0.26, +0.10),
        outline:   _shift(baseHex, -0.40, +0.06)
    };
}

/**
 * Build a skin-optimized 5-tone palette.
 * Highlight is slightly cool (pinkish-ivory), shadow is slightly warm (amber),
 * mimicking subsurface scattering on skin.
 */
function buildSkinPalette(baseHex) {
    return {
        highlight: _shift(baseHex, +0.16, -0.10, -0.008),
        base:      _palHexToRgb(baseHex),
        shadow:    _shift(baseHex, -0.12, +0.08, +0.010),
        deep:      _shift(baseHex, -0.22, +0.13, +0.015),
        outline:   _shift(baseHex, -0.38, +0.06, +0.008)
    };
}

/**
 * Build a hair-optimized palette: strong highlight sheen, rich shadow.
 * The highlight is narrow and bright (specular), the base is the hair color,
 * shadow is deep and saturated.
 */
function buildHairPalette(baseHex) {
    return {
        highlight: _shift(baseHex, +0.28, -0.20),
        base:      _palHexToRgb(baseHex),
        shadow:    _shift(baseHex, -0.16, +0.08),
        deep:      _shift(baseHex, -0.30, +0.12),
        outline:   _shift(baseHex, -0.42, +0.06)
    };
}

/** Parse a hex string to {r,g,b} — useful for passing to pixSet directly. */
function palParse(hex) {
    return _palHexToRgb(hex);
}
