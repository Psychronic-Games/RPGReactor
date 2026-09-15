/**
 * RRDatabaseTextCodes - the text-code menu and reference panel on database
 * text fields.
 *
 * A description is drawn by Window_Help and a skill or state message by the
 * battle log, both through drawTextEx, so both take the escape codes a Show
 * Text message does - and nothing in the Database said so. Wiring is
 * declarative: a field carries `data-rr-textcodes="<scope>[:<formatArgs>]"`
 * (`help`, `battlelog:skillMessage`, `battlelog:stateMessage`), and an
 * element with `data-rr-textcodes-panel="<same spec>"` gets the collapsed
 * reference panel. Fields sharing a spec share one panel, which inserts into
 * whichever of them was focused last.
 *
 * A field that also carries `data-rr-textcodes-preview` gets a line under it
 * showing what the player reads - icons drawn, `\C[n]` colours applied, other
 * codes gone - the same preview a plugin parameter's text field has. The line
 * is hidden while the text carries no code, so a plain field looks as before.
 *
 * The database editors persist on `change`, and a script write to `.value`
 * fires none - an inserted code would show and then be lost at the next
 * selection. Real typing arrives as an InputEvent and the menu's insert as a
 * plain Event, which is what tells the two apart.
 */
(function (root) {
    'use strict';

    function parseSpec(spec) {
        const [scope, formatArgs] = String(spec || 'help').split(':');
        return { scope: scope || 'help', formatArgs: formatArgs || '' };
    }

    function menuOptions(spec, context) {
        const parsed = parseSpec(spec);
        const projectPath = () => (typeof context.projectPath === 'function' ? context.projectPath() : context.projectPath) || '';
        return {
            scope: parsed.scope,
            formatArgs: parsed.formatArgs,
            inBattle: parsed.scope === 'battlelog',
            plugins: () => {
                if (typeof context.plugins === 'function') return context.plugins() || [];
                const codes = root.RRTextCodes;
                return codes && codes.readManifest ? (codes.readManifest(projectPath()) || []) : [];
            },
            projectPath,
            // The sheet the database list draws its icons from; '' (no
            // project) leaves a preview drawing text only.
            iconSetUrl: () => (root.RRIconCodes ? root.RRIconCodes.iconSetUrl() : ''),
            skin: () => {
                const skins = root.RRWindowskin;
                const base = projectPath();
                if (!skins || !base) return null;
                const file = typeof require === 'function'
                    ? require('path').join(base, 'img', 'system', 'Window.png')
                    : `${base}/img/system/Window.png`;
                return skins.peek(file);
            },
            pickVariable: onPick => {
                if (typeof SwitchVariablePicker !== 'function' || !context.databaseManager) return;
                if (!context._variablePicker) {
                    context._variablePicker = new SwitchVariablePicker(context.databaseManager, context.projectController);
                }
                context._variablePicker.show('variable', 1, id => onPick(id));
            }
        };
    }

    /** The preview line under one field. Returns a function that removes it. */
    function attachPreview(field, options) {
        const menu = root.RRTextCodeMenu;
        const doc = field.ownerDocument;
        if (!menu || !menu.renderPreview || !menu.hasPreviewableCode || !doc) return () => {};
        const preview = doc.createElement('div');
        preview.className = 'rr-text-code-preview';
        preview.style.cssText = 'min-width:0;padding:1px 2px;font-size:12px;'
            + 'color:var(--color-text);white-space:pre-wrap;overflow-wrap:anywhere;';
        preview.hidden = true;
        field.insertAdjacentElement('afterend', preview);

        const refresh = () => {
            const value = String(field.value == null ? '' : field.value);
            const show = menu.hasPreviewableCode(value);
            preview.hidden = !show;
            if (show) menu.renderPreview(preview, value, options);
            else preview.textContent = '';
        };
        field.addEventListener('input', refresh);
        field.addEventListener('change', refresh);
        // The first paint can land before the windowskin has loaded, in the
        // fallback palette; repaint once the project's own colours arrive.
        const skinPending = !options.skin();
        if (skinPending) doc.addEventListener('rr-windowskin-loaded', refresh, { once: true });
        refresh();

        return () => {
            field.removeEventListener('input', refresh);
            field.removeEventListener('change', refresh);
            if (skinPending) doc.removeEventListener('rr-windowskin-loaded', refresh);
            preview.remove();
        };
    }

    /**
     * Decorate every marked field under `container`. Returns a function that
     * detaches what was attached.
     */
    function decorate(container, context) {
        if (!container || !container.querySelectorAll || !root.RRTextCodeMenu) return () => {};
        const settings = context || {};
        const fields = Array.from(container.querySelectorAll('[data-rr-textcodes]'));
        if (!fields.length) return () => {};
        const bySpec = new Map();
        const lastFocused = new Map();
        const detachers = [];

        for (const field of fields) {
            const spec = field.getAttribute('data-rr-textcodes');
            if (!bySpec.has(spec)) bySpec.set(spec, []);
            bySpec.get(spec).push(field);
            detachers.push(root.RRTextCodeMenu.attach(field, menuOptions(spec, settings)));
            const onFocus = () => lastFocused.set(spec, field);
            // A programmatic insert arrives as a plain Event; typing is an
            // InputEvent and already reaches the editor's own change handler.
            const onInput = event => {
                if (typeof InputEvent !== 'undefined' && event instanceof InputEvent) return;
                field.dispatchEvent(new Event('change', { bubbles: true }));
            };
            field.addEventListener('focus', onFocus);
            field.addEventListener('input', onInput);
            detachers.push(() => {
                field.removeEventListener('focus', onFocus);
                field.removeEventListener('input', onInput);
            });
            if (field.hasAttribute && field.hasAttribute('data-rr-textcodes-preview')) {
                detachers.push(attachPreview(field, menuOptions(spec, settings)));
            }
        }

        for (const anchor of Array.from(container.querySelectorAll('[data-rr-textcodes-panel]'))) {
            const spec = anchor.getAttribute('data-rr-textcodes-panel');
            const group = bySpec.get(spec);
            if (!group || !group.length) continue;
            const panel = root.RRTextCodeMenu.createReferencePanel(
                () => lastFocused.get(spec) || group[0],
                Object.assign(menuOptions(spec, settings), { collapsed: true })
            );
            anchor.innerHTML = '';
            anchor.appendChild(panel);
        }

        return () => { for (const detach of detachers) { try { detach(); } catch (error) { /* already gone */ } } };
    }

    const api = { decorate, parseSpec, menuOptions };
    root.RRDatabaseTextCodes = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
