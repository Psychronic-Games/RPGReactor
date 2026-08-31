/**
 * ThemeColors - resolve CSS custom properties to concrete color strings.
 *
 * Canvas 2D context (fillStyle/strokeStyle/addColorStop) does not parse
 * `var(--token)` because canvas is not in the CSS cascade. Use this helper
 * at the call site so theme tokens keep working when the theme swaps.
 */
(function (root) {
    'use strict';

    function resolve(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback || '#000000';
    }

    root.ThemeColors = { resolve };
})(typeof window !== 'undefined' ? window : globalThis);

/** Shared, persisted backdrop choice for standalone animation previews. */
(function (root) {
    'use strict';

    const SETTINGS_KEY = 'rr-settings';
    const SETTING = 'animationPreviewBackdrop';
    // `color` is the value to use when the token cannot be read; only the light
    // swatch has one, because it is the only one the stylesheet has an opinion
    // about. Mid and Dark are fixed points chosen for being neutral.
    const CHOICES = Object.freeze([
        Object.freeze({ id: 'light', color: '#c8c8c8', token: '--color-preview-backdrop' }),
        Object.freeze({ id: 'mid', color: '#6b6b6b' }),
        Object.freeze({ id: 'dark', color: '#000000' })
    ]);

    /**
     * A swatch's colour, read from the stylesheet where it has a token there.
     *
     * Falls back to the literal whenever there is no cascade to read - a test
     * requiring this file in Node, a theme that never defined the token - and
     * whenever what comes back is not a six-digit hex, because `rgb01` slices
     * the string by position to get its WebGL channels.
     */
    function colorOf(entry) {
        if (!entry || !entry.token) return entry ? entry.color : '#000000';
        try {
            const resolved = root.ThemeColors && root.ThemeColors.resolve(entry.token, entry.color);
            return /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : entry.color;
        } catch (error) {
            return entry.color;
        }
    }

    function storage() {
        if (typeof window === 'undefined') return null;
        try {
            return root.localStorage;
        } catch (error) {
            return null;
        }
    }

    function readSettings() {
        try {
            const parsed = JSON.parse(storage()?.getItem(SETTINGS_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    // Black by default: effects are drawn to be seen over a game, and a
    // pale card washes out their glow and additive blending.
    function choice(id = readSettings()[SETTING]) {
        return CHOICES.find(entry => entry.id === id) || CHOICES[2];
    }

    function set(id) {
        const next = choice(id);
        try {
            storage()?.setItem(SETTINGS_KEY, JSON.stringify({
                ...readSettings(),
                [SETTING]: next.id
            }));
        } catch (error) {
            // Storage can be unavailable in private or restricted contexts.
        }
        return next;
    }

    function color() {
        return colorOf(choice());
    }

    function rgb01() {
        const value = color();
        return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
    }

    function createSwitcher(onChange) {
        const tt = text => root.I18n ? root.I18n.tText(text) : text;
        const group = root.document.createElement('div');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', tt('Background'));
        group.style.cssText = 'display:flex;align-items:center;gap:6px;';
        const buttons = [];
        const refresh = () => {
            const active = choice().id;
            for (const button of buttons) {
                const selected = button.dataset.value === active;
                button.setAttribute('aria-pressed', String(selected));
                button.style.borderColor = selected
                    ? 'var(--color-accent-bright)'
                    : 'var(--color-border-input)';
                button.style.boxShadow = selected ? '0 0 0 1px var(--color-accent-bright)' : 'none';
            }
        };
        for (const entry of CHOICES) {
            const button = root.document.createElement('button');
            button.type = 'button';
            button.dataset.value = entry.id;
            const swatch = colorOf(entry);
            button.title = `${tt('Background')}: ${swatch}`;
            button.setAttribute('aria-label', button.title);
            button.style.cssText = `width:24px;height:18px;padding:0;border:1px solid var(--color-border-input);border-radius:3px;background:${swatch};cursor:pointer;`;
            button.addEventListener('click', () => {
                set(entry.id);
                refresh();
                if (onChange) onChange(entry);
            });
            buttons.push(button);
            group.appendChild(button);
        }
        refresh();
        return group;
    }

    const api = { CHOICES, choice, colorOf, set, color, rgb01, createSwitcher };
    root.RRPreviewBackdrop = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
