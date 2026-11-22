/*:
 * @target ReactorEditor
 * @plugindesc Map Statistics: a panel beside the map that counts what the open map holds. An example editor plugin.
 * @author Psychronic
 * @url https://psychronic.itch.io/rpg-reactor
 *
 * @param Count Hidden Events
 * @text Count events with no page shown
 * @type boolean
 * @on Count them
 * @off Leave them out
 * @default true
 *
 * @help
 * An example of an editor plugin: it changes RPG Reactor's editor for this
 * project, never the game. It adds a button with its own icon to the main
 * toolbar (icon.svg, in the RR_MapStats folder beside this file) and an entry under the Plugins
 * menu; either opens a panel over the map's corner that counts its events,
 * building pieces, 3D models, lights and media surfaces, and counts again
 * whenever a map is opened or the project is saved.
 *
 * To make it your own: change the SVG, the labels or what it counts, save
 * the file, and save the Editor Plugins list (or reopen the project).
 *
 * Editor plugins live in the project's js/editor-plugins folder, beside the
 * game's js/plugins, each one's own files in a folder named after it; they are
 * turned on in Plugin Manager › Editor Plugins. See docs/PLUGIN-DEVELOPMENT.md.
 */
(() => {
    'use strict';
    const plugin = ReactorEditor.plugin('RR_MapStats');
    const countBlank = plugin.parameters['Count Hidden Events'] !== 'false';

    function counts(map) {
        const r3d = map.reactor3d || {};
        const events = (map.events || []).filter(event => event && (countBlank || (event.pages || []).some(page => page.image && (page.image.characterName || page.image.tileId))));
        let lights = 0;
        try { lights = window.RRMapLights ? RRMapLights.fixtures(map).length : 0; } catch (_) { lights = 0; }
        return [
            ['Size', `${map.width} × ${map.height}`],
            ['3D', r3d.version ? 'On' : 'Off'],
            ['Events', events.length],
            ['Building pieces', (r3d.pieces || []).length],
            ['3D models', (r3d.props || []).length],
            ['Lights', lights],
            ['Media surfaces', (r3d.mediaSurfaces || []).length]
        ];
    }

    const icon = 'icon.svg';   // in this plugin's own folder, js/editor-plugins/RR_MapStats/
    let button = null;
    const panel = plugin.addPanel({
        id: 'stats',
        title: 'Map Statistics',
        icon,
        onToggle: open => button && button.setActive(open),
        render(body) {
            const map = ReactorEditor.currentMap();
            if (!map) { body.textContent = 'Open a map to count what it holds.'; return; }
            const table = document.createElement('div');
            table.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px 12px;';
            for (const [label, value] of counts(map)) {
                const name = document.createElement('span');
                name.textContent = label;
                name.style.color = 'var(--color-text-muted)';
                const number = document.createElement('b');
                number.textContent = String(value);
                number.style.cssText = 'color:var(--color-text-strong);text-align:right;';
                table.append(name, number);
            }
            body.append(table);
        }
    });

    button = plugin.addToolbarButton({ title: 'Map Statistics', icon, action: () => panel.toggle() });
    plugin.addMenuItem({ label: 'Map Statistics', action: () => panel.toggle() });
    plugin.on('mapLoaded', () => panel.refresh());
    plugin.on('saved', () => panel.refresh());
})();
