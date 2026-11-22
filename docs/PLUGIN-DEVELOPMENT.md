# Writing plugins for RPG Reactor

New to plugins? Start with [Your First Plugin](PLUGIN-FIRST-PLUGIN.md); then [Parameters & Plugin Commands](PLUGIN-PARAMETERS-AND-COMMANDS.md), [Reactor Globals](PLUGIN-GLOBALS.md) and the [Plugin API Reference](PLUGIN-API.md).

RPG Reactor runs two kinds of plugin, and the Plugin Manager has a tab for each:

| | Game plugins | Editor plugins |
|---|---|---|
| What they change | The game the player plays | RPG Reactor's editor, for one project |
| Where they live | `js/plugins/Name.js` | `js/editor-plugins/Name.js`, and its own files (icon, pictures) in `js/editor-plugins/Name/` |
| Their list | `js/reactor_plugins.js` (Plugin Manager › Game Plugins) | `js/reactor_editor_plugins.js` (Plugin Manager › Editor Plugins) |
| When they run | Each time the game boots, and in playtests | Each time the project opens in the editor, and again when the list is saved |
| In a game build | Yes | Never |

Both kinds are plain JavaScript files with the same header (`@plugindesc`, `@author`, `@param`, `@command`, `@help`), so the Plugin Manager shows their descriptions, help and parameters the same way. There is no build step and no second language.

## Game plugins

### RPG Maker plugins

MZ plugins run unchanged, and MV plugins run through Reactor's MV layer. A plugin from either can be dropped into `js/plugins` and turned on in the Plugin Manager. `Utils.RPGMAKER_NAME` stays `"MZ"`, so multi-engine plugins keep choosing the right code.

### Plugins written for RPG Reactor

A plugin's `@target` line says what it is written for. The Plugin Manager shows it beside the author, and says so when a plugin is in the wrong tab:

| `@target` | What it is |
|---|---|
| `Reactor` | A game plugin written for RPG Reactor itself. It uses what RPG Maker does not have (3D maps and lighting, models, Battle Rooms, tactical and action battles, vehicles, online play, Steam) and Reactor's own ways of doing things, with no RPG Maker version in mind. `RPGReactor` means the same. |
| `MZ` | An RPG Maker MZ plugin. RPG Reactor runs it unchanged. |
| `MZ Reactor` | Written for both: MZ's way, and Reactor's features where it finds them. |
| `MV` | An RPG Maker MV plugin, run through Reactor's MV layer. |
| `ReactorEditor` | An editor plugin (below). |

A plugin written for RPG Reactor:

```js
/*:
 * @target Reactor
 * @plugindesc What it does.
 */
(() => {
    // Copied into an RPG Maker project by mistake, it says so instead of failing halfway.
    if (typeof Reactor3D === 'undefined') {
        console.warn('MyPlugin is written for RPG Reactor.');
        return;
    }
    // ...
})();
```

`globalThis.RPG_REACTOR_RUNTIME_REVISION` names the runtime build (for example `"20261122.1"`).

What a game plugin may call today (the [Plugin API Reference](PLUGIN-API.md) has each one's parameters and RPG Reactor's plugin commands with their arguments, written from the code):

| Area | Functions |
|---|---|
| Lighting on a 3D map | `Reactor3D.setMapAmbient({ intensity, color }, frames)`, `Reactor3D.setMapAmbient(null)` to go back to the map's own; `Reactor3D.switchLight(target, 'on' \| 'off' \| 'toggle')`; `Reactor3D.transformLight(target, values, frames)`. `target` is a light's id or `#tag` (a light named `lamp #village` has the tag `village`). |
| Models | `Reactor3D.transformModel(character, { offset, rotate, scale }, frames)`, `Reactor3D.playModelAnimation(character, name, options)` |
| Ground | `Reactor3D.deriveElevation(mapData, flags, options)`, `Reactor3D.stairAt(mapData, x, y)` |
| Characters | `character.reactorIsWalking()` |
| Vehicles | `ReactorVehicles.Drive.state()` |
| Battles on the map | `$gameFight.commandVehicleAttack()` |
| Steam | `ReactorSteam.available()`, `ReactorSteam.unlock(apiName)`, `ReactorSteam.stat(name)`, `ReactorSteam.setStat(name, value)` ([STEAM-FOR-GAMES.md](STEAM-FOR-GAMES.md)) |
| Watching a battle | `ReactorEvents` ([RUNTIME-EVENTS.md](RUNTIME-EVENTS.md)) |

Reactor's own event commands are plugin commands of the plugin `RPGReactor` (for example `AmbientLight`, `LightSwitch`, `QuestSet`, `SteamAchievement`), so a plugin can run one as an event would: `PluginManager.callCommand(interpreter, 'RPGReactor', 'LightSwitch', { target: '#village', state: 'on' })`.

`@target` is the first part of a fuller API designed in [DESIGN-PLUGIN-API.md](DESIGN-PLUGIN-API.md); the rest (a `Reactor` namespace, named and ordered hooks instead of aliasing, `@reactorVersion`, `@orderAfter`) is not built yet.

### The example: RR_DayNight

`template/Demo/js/plugins/RR_DayNight.js` (`@target Reactor`) is in the Demo, turned off. It runs an in-game clock that moves a 3D map's ambient light from night to dawn, day and dusk, and turns lamps of one tag on at night. Its clock is saved with the game, an event can read and set the hour through a variable, and it has three plugin commands: Set Hour, Pause Clock and Resume Clock. Copied into an RPG Maker project it says it needs RPG Reactor and does nothing. To try it, turn it on in Plugin Manager › Game Plugins and playtest a 3D map: North Haven's lamps are tagged `village`.

## Editor plugins

An editor plugin adds to the editor without changing its source: a menu entry, a panel beside the map, something done when a map opens or the project is saved. It belongs to its project, in `js/editor-plugins/` beside the game's plugins, and runs when that project opens. What a plugin brings with it (an icon, pictures) goes in a folder named after it, `js/editor-plugins/Name/`, so the plugins folder holds one script per plugin and nothing else.

### The header

```js
/*:
 * @target ReactorEditor
 * @plugindesc What it adds to the editor.
 * @author You
 *
 * @param Some Setting
 * @type boolean
 * @default true
 *
 * @help
 * How to use it.
 */
```

### The interface: `ReactorEditor`

```js
const plugin = ReactorEditor.plugin('MyPlugin');   // its context; the name is the file's
plugin.parameters                                  // as the Plugin Manager saved them (strings)

plugin.addMenuItem({ label: 'Do Something', action: () => { /* ... */ } });   // under the Plugins menu

const button = plugin.addToolbarButton({           // on the main toolbar, in a Plugins group before the Forge's
    title: 'My Tool', icon: 'icon.svg',            // an SVG (or PNG) in js/editor-plugins/MyPlugin/, a URL, or SVG markup
    action: () => panel.toggle()
});
button.setActive(true);                            // lit as the toolbar's own buttons are

const panel = plugin.addPanel({                    // a panel over the map's corner, with the editor's panel header
    id: 'main', title: 'My Panel', icon: 'icon.svg',
    render(body, panel) { body.textContent = 'Hello'; },
    onToggle: open => button.setActive(open)
});
plugin.file('picture.png')                         // any file of js/editor-plugins/MyPlugin/, as a URL the editor can load
panel.open(); panel.close(); panel.toggle(); panel.refresh();

plugin.on('projectOpened', detail => {});          // also: mapLoaded, beforeSave, saved, playtest, projectClosing
plugin.onDispose(() => {});                        // the project closes, or the list is saved again
plugin.notify('Done.');                            // a short message in the editor's own dialog

ReactorEditor.project        // { path, name }
ReactorEditor.database       // the database as the editor holds it: read it; change it through the Database
ReactorEditor.currentMap()   // the map open in the editor
ReactorEditor.version        // 1
```

Whatever a plugin adds through its context (menu entries, panels, listeners) goes when the project closes. Anything else it changes is its own to undo in `onDispose`. Its errors are caught and written to the editor's console (Help › Developer Tools), so they do not stop the editor.

### The example: RR_MapStats

`template/Demo/js/editor-plugins/RR_MapStats.js` is in the Demo's Editor Plugins list (turn it on there to see it). It puts a button with its own icon (`RR_MapStats/icon.svg`) on the main toolbar and an entry under Plugins; either opens a panel over the map's corner that counts its events, building pieces, 3D models, lights and media surfaces, and counts again when a map opens or the project is saved. Change the SVG, a label or what it counts, save, and save the Editor Plugins list: the editor shows the change without being rebuilt.

### Still to come

Version 1 is a start. Next on the list: event commands of a plugin's own in the event editor; pages in the Database; Forge tools; and a folder of editor plugins for every project, beside the per-project one.

## Safety

Plugins of both kinds are code with full access: a game plugin in a playtest, an editor plugin in the editor. Turn on only plugins you trust.

- A project opened from the Steam Workshop has its game plugins turned off, and it never carries editor plugins (`WorkshopProjects.js` keeps scripts to `js/plugins`).
- A game build never includes `js/editor-plugins/` or `js/reactor_editor_plugins.js`.

## Testing

- **Game plugins:** playtest and open the console with F8. A change to a plugin file shows at the next playtest.
- **Editor plugins:** open the editor's console with Help › Developer Tools. Saving the Editor Plugins list runs the plugins again, so there's no need to reopen the project.
