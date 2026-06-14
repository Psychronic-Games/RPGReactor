/**
 * ThemeColors - resolve CSS custom properties to concrete color strings.
 *
 * Canvas 2D context (fillStyle/strokeStyle/addColorStop) does not parse
 * `var(--token)` because canvas is not in the CSS cascade. Use this helper
 * at the call site so theme tokens keep working when the theme swaps.
 */
(function () {
    'use strict';

    function resolve(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback || '#000000';
    }

    window.ThemeColors = { resolve };
})();
