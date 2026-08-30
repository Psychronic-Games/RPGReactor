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
