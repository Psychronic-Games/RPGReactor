/**
 * Editor plugins: scripts that change RPG Reactor's editor for one project, without changing its source.
 *
 * Where they live: beside the game's own plugins, in the project's `js/`: one `js/editor-plugins/Name.js` each,
 * the files a plugin brings (its icon, pictures) in a folder of its own named after it (`js/editor-plugins/Name/`),
 * and the list that says which are on and with what parameters in `js/reactor_editor_plugins.js` (the same
 * `var $plugins = [...]` as the game's `js/reactor_plugins.js`, written by the Plugin Manager's Editor Plugins tab). A plugin's header is a game plugin's (`@plugindesc`,
 * `@author`, `@param`, `@help`), with `@target ReactorEditor`.
 *
 * When they run: when the project opens, in the list's order; when it closes, each is told (its `dispose` hooks
 * and everything it added through its context go). They run in the editor's window with the editor's own access
 * (Node, the file system): like a game plugin in a playtest, one is turned on only when it is trusted. A project
 * shared on the Steam Workshop carries none of them (WorkshopProjects.js keeps scripts to js/plugins), and a game
 * build never includes them (build-worker.js and build.js leave js/editor-plugins and js/reactor_editor_plugins.js out).
 *
 * In a plugin:
 *
 *   const plugin = ReactorEditor.plugin('RR_MapStats');     // its context, by its file name
 *   plugin.parameters                                         // its parameters, as the list holds them (strings)
 *   plugin.addMenuItem({ label, action })                     // under Plugins, below Manage Plugins
 *   plugin.addToolbarButton({ title, icon, action })          // on the main toolbar, in a Plugins group of its own
 *   plugin.file('icon.svg')                                   // a file of the plugin's own folder (js/editor-plugins/Name/), as a URL
 *   const panel = plugin.addPanel({ id, title, icon, render(body, panel), onToggle(open) })
 *   panel.open() / panel.close() / panel.toggle() / panel.refresh()   // over the map's corner, with the dock's header
 *   plugin.on('projectOpened' | 'mapLoaded' | 'beforeSave' | 'saved' | 'playtest' | 'projectClosing', fn)
 *   plugin.notify(text)                                       // a short message in the editor's own dialog
 *   plugin.onDispose(fn)                                      // when the project closes (or the plugins are reloaded)
 *   ReactorEditor.project                                     // { path, name } of the open project
 *   ReactorEditor.database                                    // the project's database as the editor holds it (read it; change it through the Database)
 *   ReactorEditor.currentMap()                                // the map open in the editor ($dataMap's shape)
 *   ReactorEditor.version                                     // the interface's version: 1
 */
(function(root) {
    'use strict';

    const VERSION = 1;
    // Beside the game's plugins: js/editor-plugins/ for the scripts (each one's files in a folder named after it),
    // js/reactor_editor_plugins.js for the list.
    const FOLDER = ['js', 'editor-plugins'];
    const LIST = ['js', 'reactor_editor_plugins.js'];
    const EVENTS = ['projectOpened', 'mapLoaded', 'beforeSave', 'saved', 'playtest', 'projectClosing'];

    const loaded = new Map();   // name -> context
    let projectPath = null;
    let loading = null;

    const fs = () => require('fs');
    const path = () => require('path');
    const tt = text => (root.I18n ? root.I18n.tText(text) : text);

    /** The list in js/reactor_editor_plugins.js, as data; [] when there is none or it is not plain data. */
    function readList(dir) {
        const file = path().join(dir, ...LIST);
        let text;
        try { text = fs().readFileSync(file, 'utf8'); } catch (_) { return []; }
        if (root.PluginManager && typeof root.PluginManager.parsePluginsManifest === 'function') {
            try { return root.PluginManager.parsePluginsManifest(text) || []; } catch (_) { return []; }
        }
        const match = /var\s+\$plugins\s*=\s*([\s\S]*?);?\s*$/.exec(text);
        try { return match ? JSON.parse(match[1]) : []; } catch (_) { return []; }
    }

    /** An icon given as a file of the plugin's own folder, a URL, or SVG markup, as an element for a button or a header. */
    function iconElement(icon, context) {
        if (!icon) return null;
        const text = String(icon).trim();
        if (text.startsWith('<svg')) {
            const box = document.createElement('span');
            box.className = 'rr-editor-plugin-icon';
            box.innerHTML = text;
            return box;
        }
        const img = document.createElement('img');
        img.alt = '';
        img.src = /^(?:[a-z]+:|\/|images\/)/i.test(text) ? text : context.file(text);
        return img;
    }

    function makeContext(name, parameters) {
        const own = { menu: [], panels: [], listeners: [], disposers: [], buttons: [] };
        const context = {
            name,
            parameters: Object.assign({}, parameters || {}),

            /** A file of the plugin's own folder, js/editor-plugins/<its name>/ (its icon, a picture), as a URL the editor can load. */
            file(relative) {
                const dir = projectPath ? path().join(projectPath, ...FOLDER, name) : '';
                if (!dir || /(^|[\\/])\.\.([\\/]|$)/.test(String(relative))) return '';
                return require('url').pathToFileURL(path().join(dir, String(relative))).href;
            },

            /**
             * A button on the main toolbar, in a group of the plugins' own before the Forge's: its icon (a file of
             * the plugin's own folder, a URL or SVG markup), its tooltip, what a click does. Answers the button;
             * button.setActive(on) lights it as the toolbar's own buttons are lit.
             */
            addToolbarButton({ title, icon, action } = {}) {
                if (typeof action !== 'function') return null;
                const toolbar = document.getElementById('toolbar');
                if (!toolbar) return null;
                let group = toolbar.querySelector('.rr-editor-plugin-tools');
                if (!group) {
                    group = document.createElement('span');
                    group.className = 'rr-editor-plugin-tools';
                    const sep = document.createElement('div');
                    sep.className = 'toolbar-separator';
                    const label = document.createElement('span');
                    label.className = 'toolbar-label';
                    label.textContent = tt('Plugins:');
                    group.append(sep, label);
                    const forge = toolbar.querySelector('[data-i18n="toolbar.forge"]');
                    const before = forge ? forge.previousElementSibling : null;
                    if (before && before.classList.contains('toolbar-separator')) toolbar.insertBefore(group, before);
                    else toolbar.appendChild(group);
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'tool-button rr-editor-plugin-button';
                button.title = String(title || name);
                button.setAttribute('aria-label', String(title || name));
                const face = iconElement(icon, context);
                if (face) button.appendChild(face); else button.textContent = String(title || name).slice(0, 2);
                button.addEventListener('click', () => { try { action(); } catch (error) { report(name, error); } });
                button.setActive = on => { button.classList.toggle('active', !!on); button.setAttribute('aria-pressed', String(!!on)); };
                group.appendChild(button);
                own.buttons.push(button);
                return button;
            },

            addMenuItem({ label, action } = {}) {
                if (!label || typeof action !== 'function') return null;
                const id = `editor-plugin:${name}:${own.menu.length}`;
                const submenu = document.getElementById('submenu-plugins');
                if (!submenu) return null;
                if (!submenu.querySelector('.rr-editor-plugin-sep')) {
                    const sep = document.createElement('div');
                    sep.className = 'rr-editor-plugin-sep';
                    sep.style.cssText = 'border-top: 1px solid var(--color-border); margin: 4px 0;';
                    submenu.appendChild(sep);
                }
                const item = document.createElement('div');
                item.className = 'html-menu-option rr-editor-plugin-item';
                item.setAttribute('data-action', id);
                item.style.cssText = 'padding: 8px 16px; cursor: pointer;';
                item.textContent = String(label);
                submenu.appendChild(item);
                own.menu.push({ id, item, action });
                return item;
            },

            addPanel({ id, title, icon, render, onToggle } = {}) {
                if (typeof render !== 'function') return null;
                let element = null;
                const panel = {
                    id: `${name}:${id || own.panels.length}`,
                    isOpen: () => !!(element && element.isConnected),
                    open() {
                        if (panel.isOpen()) return panel;
                        element = document.createElement('div');
                        element.className = 'lighting-panel rr-accent-scrollbar rr-editor-plugin-panel';
                        element.setAttribute('role', 'region');
                        const head = document.createElement('div');
                        head.className = 'rr-modal-header rr-dock-head';
                        const face = iconElement(icon, context);
                        if (face) { face.classList.add('rr-dock-head-icon'); head.appendChild(face); }
                        const heading = document.createElement('div');
                        heading.className = 'rr-modal-title rr-dock-head-title';
                        heading.textContent = String(title || name);
                        const close = document.createElement('button');
                        close.type = 'button';
                        close.className = 'rr-modal-close';
                        close.textContent = '×';
                        close.setAttribute('aria-label', tt('Close'));
                        close.addEventListener('click', () => panel.close());
                        head.append(heading, close);
                        const body = document.createElement('div');
                        body.className = 'rr-editor-plugin-body';
                        element.append(head, body);
                        // Over the map's corner, as the Build bar's panels stand: the side dock would narrow the map,
                        // which draws itself again at the new size (it went blank a moment; owner, 2026-11-22).
                        const canvas = document.getElementById('canvas-container');
                        if (canvas) { element.classList.add('rr-build-floating-dock'); canvas.appendChild(element); }
                        else { element.classList.add('is-floating'); document.body.appendChild(element); }
                        panel.refresh();
                        if (typeof onToggle === 'function') { try { onToggle(true); } catch (error) { report(name, error); } }
                        return panel;
                    },
                    close() {
                        if (!element) return;
                        element.remove();
                        element = null;
                        if (typeof onToggle === 'function') { try { onToggle(false); } catch (error) { report(name, error); } }
                    },
                    toggle() { return panel.isOpen() ? panel.close() : panel.open(); },
                    refresh() {
                        const body = element && element.querySelector('.rr-editor-plugin-body');
                        if (!body) return;
                        body.replaceChildren();
                        try { render(body, panel); } catch (error) { report(name, error); }
                    }
                };
                own.panels.push(panel);
                return panel;
            },

            on(event, handler) {
                if (!EVENTS.includes(event) || typeof handler !== 'function') return () => {};
                const entry = { event, handler };
                own.listeners.push(entry);
                return () => { const at = own.listeners.indexOf(entry); if (at >= 0) own.listeners.splice(at, 1); };
            },

            onDispose(fn) { if (typeof fn === 'function') own.disposers.push(fn); },

            notify(text) {
                if (root.RRDialog?.alert) root.RRDialog.alert(String(text), { title: name });
                else console.log(`[${name}]`, text);
            }
        };
        Object.defineProperty(context, '_own', { value: own });
        return context;
    }

    function report(name, error) {
        console.error(`[Editor plugin ${name}]`, error);
    }

    const ReactorEditor = {
        version: VERSION,
        events: EVENTS.slice(),

        /** A plugin's context: made the first time it is asked for, while the plugin's script runs. */
        plugin(name) {
            const key = String(name || '').trim();
            if (!key) throw new Error('ReactorEditor.plugin needs the plugin\'s name.');
            if (!loaded.has(key)) loaded.set(key, makeContext(key, ReactorEditor._parameters[key]));
            return loaded.get(key);
        },

        get project() {
            const project = root.reactor?.projectController?.currentProject;
            return project ? { path: project.path, name: project.name } : null;
        },
        get database() { return root.reactor?.projectController?.databaseManager?.data || null; },
        currentMap() { return root.reactor?.projectController?.getTilemapManager?.()?.currentMap || null; },

        _parameters: {}
    };

    /** Tell every plugin listening for `event` (the editor calls this at each moment the interface names). */
    function emit(event, detail) {
        for (const [name, context] of loaded) {
            for (const entry of context._own.listeners.slice()) {
                if (entry.event !== event) continue;
                try { entry.handler(detail || {}); } catch (error) { report(name, error); }
            }
        }
    }

    /** A Plugins menu entry an editor plugin added was chosen. */
    function runMenuAction(action) {
        for (const [name, context] of loaded) {
            const entry = context._own.menu.find(item => item.id === action);
            if (entry) { try { entry.action(); } catch (error) { report(name, error); } return true; }
        }
        return false;
    }

    function runScript(file) {
        return new Promise(resolve => {
            const script = document.createElement('script');
            script.src = require('url').pathToFileURL(file).href + `?v=${Date.now()}`;
            script.async = false;
            script.dataset.editorPlugin = path().basename(file, '.js');
            script.onload = () => { script.remove(); resolve(true); };
            script.onerror = () => { script.remove(); console.error('[Editor plugins] could not load', file); resolve(false); };
            document.head.appendChild(script);
        });
    }

    /** Every editor plugin of `dir` that its list turns on, in the list's order. Answers the names that ran. */
    async function loadForProject(dir) {
        await unloadAll();
        projectPath = dir || null;
        if (!projectPath || typeof require !== 'function' || typeof document === 'undefined') return [];
        const list = readList(projectPath).filter(entry => entry && entry.status && /^[\w.-]+$/.test(String(entry.name || '')));
        ReactorEditor._parameters = {};
        for (const entry of list) ReactorEditor._parameters[entry.name] = entry.parameters || {};
        const ran = [];
        loading = (async () => {
            for (const entry of list) {
                const file = path().join(projectPath, ...FOLDER, `${entry.name}.js`);
                if (!fs().existsSync(file)) { console.warn('[Editor plugins] missing', file); continue; }
                if (await runScript(file)) ran.push(entry.name);
            }
        })();
        await loading;
        loading = null;
        emit('projectOpened', { path: projectPath });
        return ran;
    }

    /** The project closes (or the list is loaded again): each plugin is told, and what it added goes. */
    async function unloadAll() {
        if (loading) await loading;
        if (loaded.size) emit('projectClosing', { path: projectPath });
        for (const [name, context] of loaded) {
            const own = context._own;
            for (const fn of own.disposers.splice(0)) { try { fn(); } catch (error) { report(name, error); } }
            for (const panel of own.panels.splice(0)) { try { panel.close(); } catch (_) {} }
            for (const entry of own.menu.splice(0)) entry.item.remove();
            for (const button of own.buttons.splice(0)) button.remove();
            own.listeners.length = 0;
        }
        loaded.clear();
        document.querySelector?.('#submenu-plugins .rr-editor-plugin-sep')?.remove();
        document.querySelector?.('#toolbar .rr-editor-plugin-tools')?.remove();
        projectPath = null;
    }

    const api = { FOLDER, LIST, EVENTS, readList, loadForProject, unloadAll, emit, runMenuAction, loaded: () => Array.from(loaded.keys()) };
    root.ReactorEditor = ReactorEditor;
    root.RREditorPlugins = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = { ReactorEditor, RREditorPlugins: api };
})(typeof window !== 'undefined' ? window : globalThis);
