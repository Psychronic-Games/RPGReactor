/**
 * SelectThemingShim - global custom-dropdown shim for every <select>.
 *
 * Why this exists
 * ---------------
 * On Linux desktops (KDE Plasma, GNOME, etc.) Chromium's native <select>
 * popup inherits the system's Qt/GTK color scheme, which we cannot fully
 * override via `color-scheme: dark` + `accent-color: gold` — those settings
 * style the trigger and the focus ring but not the actual option-row
 * highlight. The OS paints the highlight blue (or whatever the system accent
 * is) regardless of our CSS, which clashes with the gold theme.
 *
 * Rather than per-instance convert all 75 selects in the editor to custom
 * popups, this shim transparently replaces every <select>'s popup with a
 * div-based gold-themed dropdown. The original <select> element stays in the
 * DOM and remains the source of truth — change events dispatch normally, so
 * existing `.addEventListener('change', ...)` handlers keep working.
 *
 * How it works
 * ------------
 *  1. On DOMContentLoaded, walk the page for every <select> and wrap it.
 *  2. A MutationObserver watches for any future <select> elements added by
 *     editor code (dynamic option population is also covered — we re-read
 *     the options from the <select> each time the popup opens).
 *  3. For each wrapped <select>:
 *      - The <select> is positioned absolutely with opacity:0 (kept clickable
 *        in case some plugin programmatically calls .focus(), and so form
 *        data / aria roles still work) but visually hidden.
 *      - A sibling div (.rr-shim-trigger) is rendered on top with the gold
 *        theme: dark background, gold border, gold caret. It displays the
 *        currently-selected option's label.
 *      - Clicking the trigger opens .rr-shim-popup — a fixed-position div
 *        with one row per <option>. Hovering a row highlights gold; clicking
 *        sets select.value, dispatches a 'change' event, closes the popup,
 *        and updates the trigger label.
 *      - Escape / outside-click / scroll closes the popup.
 *
 * Opt-out
 * -------
 * Some places (e.g. the custom .anim-gold-dropdown div-based dropdown) don't
 * use <select> at all and are unaffected. To exclude a specific <select> from
 * the shim (e.g. for some reason it must remain native), add the attribute
 * `data-no-shim="1"` and it will be skipped.
 *
 * Theming
 * -------
 * All visual rules use CSS custom properties from theme.css. Switching themes
 * automatically repaints every shimmed dropdown.
 */
(function() {
    'use strict';

    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__rrSelectShimInstalled) return;
    window.__rrSelectShimInstalled = true;

    const WRAPPED = new WeakSet();
    let openPopup = null;
    let openPopupCleanup = null;

    const closeOpenPopup = () => {
        if (openPopupCleanup) {
            openPopupCleanup();
            openPopupCleanup = null;
        }
        if (openPopup) {
            openPopup.remove();
            openPopup = null;
        }
    };

    const getCurrentLabel = (selectEl) => {
        const opt = selectEl.options[selectEl.selectedIndex];
        return opt ? opt.textContent : '';
    };

    const openPopupFor = (selectEl, triggerEl) => {
        closeOpenPopup();
        if (selectEl.disabled) return;
        const rect = triggerEl.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'rr-shim-popup';
        // Fixed positioning, anchored to the trigger.
        popup.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.bottom + 2}px;
            min-width: ${rect.width}px;
            max-height: 280px;
            overflow-y: auto;
            background: var(--color-bg-panel);
            border: 1px solid var(--color-accent-border-strong);
            border-radius: var(--radius-md);
            z-index: 100000;
            box-shadow: var(--shadow-popup);
            font-family: inherit;
        `;

        // Render one row per option group/option.
        const renderOption = (opt) => {
            const item = document.createElement('div');
            const isActive = opt.value === selectEl.value;
            item.style.cssText = `
                padding: 6px 12px;
                cursor: ${opt.disabled ? 'not-allowed' : 'pointer'};
                font-size: var(--font-size-base);
                font-weight: 600;
                color: ${opt.disabled ? 'var(--color-text-dim)' : 'var(--color-text-strong)'};
                background: ${isActive ? 'var(--color-accent-tint-25)' : 'transparent'};
                transition: background var(--ease-fast);
                white-space: nowrap;
            `;
            item.textContent = opt.textContent;
            if (!opt.disabled) {
                item.addEventListener('mouseenter', () => {
                    if (!isActive) item.style.background = 'var(--color-accent-tint-15)';
                });
                item.addEventListener('mouseleave', () => {
                    if (!isActive) item.style.background = 'transparent';
                });
                item.addEventListener('click', () => {
                    selectEl.value = opt.value;
                    // Synthesize change + input events so existing listeners fire.
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
                    triggerEl.firstChild.nodeValue = opt.textContent;
                    closeOpenPopup();
                });
            }
            return item;
        };

        // Walk children: support <optgroup> too.
        Array.from(selectEl.children).forEach(child => {
            if (child.tagName === 'OPTGROUP') {
                const header = document.createElement('div');
                header.style.cssText = `
                    padding: 4px 12px;
                    font-size: var(--font-size-xs);
                    color: var(--color-text-muted);
                    background: var(--color-bg-base);
                    border-bottom: 1px solid var(--color-border);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                `;
                header.textContent = child.label;
                popup.appendChild(header);
                Array.from(child.children).forEach(opt => popup.appendChild(renderOption(opt)));
            } else if (child.tagName === 'OPTION') {
                popup.appendChild(renderOption(child));
            }
        });

        document.body.appendChild(popup);
        openPopup = popup;

        // Auto-scroll to the currently-selected option so the user lands on it.
        const activeItem = popup.querySelector('div[style*="accent-tint-25"]');
        if (activeItem && activeItem.scrollIntoView) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }

        const closeOnOutside = (ev) => {
            if (!popup.contains(ev.target) && ev.target !== triggerEl && !triggerEl.contains(ev.target)) {
                closeOpenPopup();
            }
        };
        const escClose = (ev) => {
            if (ev.key === 'Escape') closeOpenPopup();
        };
        const scrollClose = () => {
            // Popup is fixed-positioned; if the page scrolls, the popup would
            // detach from the trigger. Easier to just close.
            closeOpenPopup();
        };
        // Single source of truth for tearing down the document-level listeners.
        // closeOpenPopup() invokes this whether the popup is dismissed by an
        // option click, outside click, escape, or scroll — preventing the stale
        // listeners that previously stayed attached after an option click and
        // immediately closed the NEXT popup that opened.
        openPopupCleanup = () => {
            document.removeEventListener('mousedown', closeOnOutside, true);
            document.removeEventListener('keydown', escClose, true);
            window.removeEventListener('scroll', scrollClose, true);
        };
        setTimeout(() => {
            document.addEventListener('mousedown', closeOnOutside, true);
            document.addEventListener('keydown', escClose, true);
            window.addEventListener('scroll', scrollClose, true);
        }, 0);
    };

    const wrap = (selectEl) => {
        if (WRAPPED.has(selectEl)) return;
        if (selectEl.dataset.noShim === '1') return;
        WRAPPED.add(selectEl);

        // Wrap the <select> in a relative-positioned container so the
        // overlaid trigger is anchored to the original select's place in the
        // layout (preserves flex/grid sizing of the editor).
        const wrapper = document.createElement('div');
        wrapper.className = 'rr-shim-wrapper';
        wrapper.style.cssText = `
            position: relative;
            display: inline-block;
            min-width: 0;
        `;
        // If the select had width/flex set, mirror it to the wrapper.
        const computed = window.getComputedStyle(selectEl);
        if (computed.flex && computed.flex !== '0 1 auto') wrapper.style.flex = computed.flex;
        if (selectEl.style.width) wrapper.style.width = selectEl.style.width;
        if (selectEl.style.maxWidth) wrapper.style.maxWidth = selectEl.style.maxWidth;
        if (selectEl.style.minWidth) wrapper.style.minWidth = selectEl.style.minWidth;

        selectEl.parentNode.insertBefore(wrapper, selectEl);
        wrapper.appendChild(selectEl);

        // Hide the native <select> visually but keep it in the layout.
        selectEl.style.position = 'absolute';
        selectEl.style.left = '0';
        selectEl.style.top = '0';
        selectEl.style.width = '100%';
        selectEl.style.height = '100%';
        selectEl.style.opacity = '0';
        selectEl.style.pointerEvents = 'none';

        // Build the overlay trigger.
        const trigger = document.createElement('div');
        trigger.className = 'rr-shim-trigger';
        trigger.style.cssText = `
            position: relative;
            background: var(--color-bg-panel);
            border: 1px solid var(--color-accent-border);
            color: var(--color-text-strong);
            border-radius: var(--radius-md);
            padding: 4px 24px 4px 10px;
            font-size: var(--font-size-base);
            font-weight: 600;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: border-color var(--ease-base);
            min-width: 60px;
        `;
        trigger.appendChild(document.createTextNode(getCurrentLabel(selectEl)));

        // Gold caret
        const caret = document.createElement('span');
        caret.style.cssText = `
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 9px;
            color: var(--color-accent-bright);
            pointer-events: none;
        `;
        caret.textContent = '▼';
        trigger.appendChild(caret);

        trigger.addEventListener('mouseenter', () => {
            trigger.style.borderColor = 'var(--color-accent-border-strong)';
        });
        trigger.addEventListener('mouseleave', () => {
            trigger.style.borderColor = 'var(--color-accent-border)';
        });
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (openPopup) {
                closeOpenPopup();
            } else {
                openPopupFor(selectEl, trigger);
            }
        });

        wrapper.appendChild(trigger);

        // If editor code programmatically updates the <select>'s value or
        // re-populates options (e.g. project switch), refresh the trigger
        // label and re-open popup data on next open.
        const refreshLabel = () => {
            trigger.firstChild.nodeValue = getCurrentLabel(selectEl);
        };
        selectEl.addEventListener('change', refreshLabel);
        // Also observe direct .innerHTML changes to options.
        const obs = new MutationObserver(refreshLabel);
        obs.observe(selectEl, { childList: true, subtree: true });
    };

    const scan = (root) => {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('select').forEach(wrap);
    };

    // Initial scan after DOM ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => scan(document));
    } else {
        scan(document);
    }

    // Watch the document for any future <select>s.
    const mutObs = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.tagName === 'SELECT') wrap(n);
                else scan(n);
            });
        });
    });
    mutObs.observe(document.documentElement, { childList: true, subtree: true });
})();
