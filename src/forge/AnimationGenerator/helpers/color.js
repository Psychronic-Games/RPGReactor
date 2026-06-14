/**
 * Color utility helpers used across animation renderers.
 *
 * Globals exposed (script-tag loaded — no module system):
 *   hexWithAlpha(hexColor, alpha)
 *   mixHexColors(hex1, hex2, t)
 */

/**
 * Convert a "#rrggbb" hex string to "rgba(r, g, b, alpha)" for canvas fillStyle/
 * strokeStyle. Alpha is a 0..1 float.
 */
function hexWithAlpha(hexColor, alpha) {
    const h = hexColor.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Linearly interpolate between two "#rrggbb" hex colors. t=0 returns hex1,
 * t=1 returns hex2. Returns "#rrggbb".
 */
function mixHexColors(hex1, hex2, t) {
    const h1 = hex1.replace('#', '');
    const h2 = hex2.replace('#', '');
    const r1 = parseInt(h1.substring(0, 2), 16);
    const g1 = parseInt(h1.substring(2, 4), 16);
    const b1 = parseInt(h1.substring(4, 6), 16);
    const r2 = parseInt(h2.substring(0, 2), 16);
    const g2 = parseInt(h2.substring(2, 4), 16);
    const b2 = parseInt(h2.substring(4, 6), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
