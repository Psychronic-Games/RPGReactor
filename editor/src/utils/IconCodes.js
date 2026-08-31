/**
 * IconCodes - draw `\I[n]` message codes as icons in the editor's own chrome.
 *
 * Element and skill-type names carry their icon inside the name itself:
 * `\I[78]Special`, `\I[64]Fire`. There is nowhere else to put it - the
 * System type lists are plain string arrays with no icon field - so the
 * convention is to write the icon into the name and let `drawTextEx` expand
 * `\I[n]` into cell n of img/system/IconSet.png.
 *
 * Whether that expansion happens in game is per-window, not per-name: a window
 * drawing with `drawTextEx` renders the icon, one drawing with `drawText`
 * prints the code. The stock `Window_Command` and `Window_EquipSlot` paths use
 * `drawText`; plugins that expect the convention (VisuStella's SkillsStatesCore
 * for the skill-type list, ItemsEquipsCore for the type rows in the item status
 * window) replace them with `drawTextEx` versions that sniff for `\I[n]`.
 * Either way it is the name the author wrote, and the editor should show what
 * it means rather than its markup.
 *
 * The editor showed the stored string verbatim, so every dropdown, trait row
 * and summary that named an element or a skill type read as markup:
 * "Add Skill Type / \I[78]Special". This module is the display half of that
 * convention - it turns one stored name into "icon + text" wherever the editor
 * is *showing* a name rather than *editing* one.
 *
 * Editing surfaces deliberately keep the raw string: the Types tab and the
 * Terms tab are where the code is authored, and hiding it there would leave no
 * way to type one. The stored data is never touched by anything here.
 *
 * Related: RRPluginDataRefs owns the same two regexes for plugin-parameter
 * pickers, which resolve an id to a name rather than rendering a stored string.
 * The two are pinned to each other by tests/icon-codes.test.cjs.
 */
(function(root) {
    'use strict';

    /** `\I[64]` - the icon code, the only one that renders as anything. */
    const ICON_CODE = /\\I\[(\d+)\]/i;
    /** Every other bracketed code (`\C[3]`, `\V[7]`, `\N[1]`) and the bare ones. */
    const OTHER_CODES = /\\[A-Za-z]{1,4}\[[^\]]*\]/g;
    const BARE_CODES = /\\[{}|.^!><$]/g;

    // The IconSet is 16 cells wide by convention and any number of rows deep.
    // 20px matches .database-list-icon, so the same sheet reads at one size
    // whichever panel it appears in.
    const COLUMNS = 16;
    const SIZE = 20;

    let cachedKey = '';
    let cachedUrl = '';

    const asText = value => String(value == null ? '' : value);

    /**
     * The IconSet index the first `\I[n]` in a name asks for, or 0.
     * 0 is IconSet's blank cell, so it doubles as "nothing to draw".
     */
    function iconIndex(text) {
        const match = ICON_CODE.exec(asText(text));
        return match ? Number(match[1]) : 0;
    }

    /** The name with every message code removed, ready to read as text. */
    function strip(text) {
        return asText(text)
            .replace(OTHER_CODES, '')
            .replace(BARE_CODES, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Does this string carry anything this module would render? */
    const hasCode = text => new RegExp(ICON_CODE.source, 'i').test(asText(text));

    /**
     * The project's IconSet.png as a URL the CSS `url()` parser accepts, or ''.
     *
     * '' is returned for a closed project and for any host that cannot build
     * the URL, and every caller treats that as "no icons" rather than as an
     * error - a label with names and no icons is the previous behaviour, which
     * was already usable.
     *
     * Cached, because for an encrypted project RPGReactorAssetUrl inlines the
     * whole sheet as a data: URL and this runs once per icon on screen. Keyed
     * on the sheet's mtime as well as the project, so replacing IconSet.png -
     * which authors do constantly - shows up without restarting the editor.
     * An unstattable sheet (the encrypted case, where only IconSet.png_ is on
     * disk) keys on the path alone, as it did before.
     */
    function iconSetUrl() {
        const project = root.reactor
            && root.reactor.projectController
            && typeof root.reactor.projectController.getCurrentProject === 'function'
            ? root.reactor.projectController.getCurrentProject()
            : null;
        const projectPath = (project && project.path) || '';
        if (!projectPath) return '';
        try {
            const path = require('path');
            const sheet = path.join(projectPath, 'img', 'system', 'IconSet.png');
            let stamp = '';
            try {
                stamp = String(require('fs').statSync(sheet).mtimeMs);
            } catch (error) {
                stamp = '';
            }
            const key = `${sheet}|${stamp}`;
            if (key === cachedKey) return cachedUrl;
            // RRAssetFiles.toUrl, not encodeURI('file://' + p): the latter
            // percent-encodes a Windows path's backslashes and Chromium then
            // rejects the whole url(). Same builder the database list uses.
            cachedUrl = root.RRAssetFiles ? root.RRAssetFiles.toUrl(sheet) : '';
            cachedKey = key;
        } catch (error) {
            cachedKey = '';
            cachedUrl = '';
        }
        return cachedUrl;
    }

    /**
     * Inline style for one icon cell, cropped out of the sheet by index.
     *
     * `vertical-align` is emitted rather than left to the stylesheet because a
     * caller may ask for a smaller cell - a dense list sizes its icons to its
     * own row height - and a fixed offset would sit the small ones too low.
     * At the default size it resolves to the same -5px the class carries.
     */
    function cellCss(index, url, size) {
        const cell = Number(size) > 0 ? Number(size) : SIZE;
        const idx = Number(index) || 0;
        return `background-image: url("${url}");`
            + `background-size: ${COLUMNS * cell}px auto;`
            + `background-position: -${(idx % COLUMNS) * cell}px -${Math.floor(idx / COLUMNS) * cell}px;`
            + `width: ${cell}px; height: ${cell}px;`
            + `vertical-align: -${Math.round(cell / 4)}px;`;
    }

    /** One icon cell as a detached span, or null when there is nothing to draw. */
    function cell(index, options) {
        const settings = options || {};
        const url = settings.url === undefined ? iconSetUrl() : settings.url;
        const idx = Number(index) || 0;
        if (idx <= 0 || !url) return null;
        const span = document.createElement('span');
        span.className = 'rr-icon-code';
        span.style.cssText = cellCss(idx, url, settings.size);
        return span;
    }

    /**
     * A name split into what to draw: `{icon}` markers and `{text}` runs, in
     * order. Codes can sit anywhere in a name, so the split is positional
     * rather than "icon, then the rest".
     *
     * Non-icon codes are dropped from the text runs, whitespace inside a run is
     * collapsed, and only the outer ends are trimmed - trimming each run would
     * weld "Add " onto the icon that follows it.
     */
    function segments(text) {
        const raw = asText(text);
        const pattern = new RegExp(ICON_CODE.source, 'gi');
        const parts = [];
        let last = 0;
        let match;
        while ((match = pattern.exec(raw)) !== null) {
            parts.push({ text: raw.slice(last, match.index) });
            parts.push({ icon: Number(match[1]) });
            last = pattern.lastIndex;
        }
        parts.push({ text: raw.slice(last) });

        const cleaned = parts.map(part => part.icon === undefined
            ? { text: asText(part.text).replace(OTHER_CODES, '').replace(BARE_CODES, '').replace(/\s+/g, ' ') }
            : part);
        const firstText = cleaned.find(part => part.icon === undefined && part.text !== '');
        const lastText = [...cleaned].reverse().find(part => part.icon === undefined && part.text !== '');
        if (firstText) firstText.text = firstText.text.replace(/^\s+/, '');
        if (lastText) lastText.text = lastText.text.replace(/\s+$/, '');
        return cleaned.filter(part => part.icon !== undefined || part.text !== '');
    }

    /**
     * Replace `element`'s contents with the name drawn as icons and text.
     * Used by surfaces that build DOM; `html()` is the same thing for the
     * template-literal surfaces.
     */
    function paint(element, text, options) {
        if (!element) return element;
        const settings = options || {};
        const url = settings.url === undefined ? iconSetUrl() : settings.url;
        element.textContent = '';
        for (const part of segments(text)) {
            if (part.icon === undefined) {
                element.appendChild(document.createTextNode(part.text));
                continue;
            }
            const span = cell(part.icon, { url, size: settings.size });
            if (span) element.appendChild(span);
        }
        return element;
    }

    /**
     * The name as escaped HTML with its icons drawn, for the editors that
     * build their markup as template literals. Escapes exactly as
     * rrEscapeHtml does, so it is a drop-in for it at those call sites.
     */
    function html(text, options) {
        const settings = options || {};
        const url = settings.url === undefined ? iconSetUrl() : settings.url;
        const escape = root.rrEscapeHtml || (value => String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
        return segments(text).map(part => {
            if (part.icon === undefined) return escape(part.text);
            if (!(part.icon > 0) || !url) return '';
            return `<span class="rr-icon-code" style="${escape(cellCss(part.icon, url, settings.size))}"></span>`;
        }).join('');
    }

    const api = {
        ICON_CODE,
        OTHER_CODES,
        BARE_CODES,
        COLUMNS,
        SIZE,
        iconIndex,
        strip,
        hasCode,
        iconSetUrl,
        cellCss,
        cell,
        segments,
        paint,
        html
    };

    root.RRIconCodes = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
