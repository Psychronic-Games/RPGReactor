# Reactor Globals for Plugins

Besides RPG Maker MZ's own (`$gameParty`, `Game_Actor`, `Scene_Map`, `PluginManager` and the rest), the RPG Reactor runtime gives its systems names a plugin can reach. The [Plugin API Reference](PLUGIN-API.md) lists the functions meant for plugins, one by one; the [Engine API Reference](https://rpgreactor.org/docs/api) lists everything in the runtime.

## Which engine is this

| Name | Value |
|---|---|
| `Utils.REACTOR_NAME` | `"Reactor"`: check it before using anything of RPG Reactor's in a plugin that also runs in RPG Maker |
| `Utils.RPGMAKER_NAME` | Always `"MZ"`, so plugins written for several RPG Maker versions take their MZ path |
| `RPG_REACTOR_RUNTIME_REVISION` | The runtime's build stamp, for example `"20261122.1"` |

## RPG Reactor's systems

| Name | Defined in | What it is |
|---|---|---|
| `ReactorEvents` | `reactor_core.js` | A feed of what happens in battles, on doors and in vehicles, to listen to instead of replacing methods. See [Runtime Events](RUNTIME-EVENTS.md). |
| `Reactor3D` | `reactor_3d.js` | 3D maps: the view, models, lighting, effects, elevation |
| `ReactorUI` | `reactor_ui.js` | Custom user interfaces made in Database › User Interfaces |
| `ReactorQuests` | `reactor_quests.js` | Quests and their progress |
| `ReactorVehicles` | `reactor_vehicles.js` | Vehicles and driving |
| `ReactorOnline` | `reactor_online.js` | Online worlds: the connection, the players, what they share |
| `ReactorSteam` | `reactor_steam.js` | Steam achievements and stats for a game on Steam. See [Steam for games](STEAM-FOR-GAMES.md). |
| `ReactorFeatures` | `reactor_features.js` | Which of RPG Reactor's own versions of plugin features a project has on. See [Reactor Features](REACTOR-FEATURES.md). |

## Staying compatible

- A plugin written for RPG Reactor says `@target Reactor`. One that should also run in RPG Maker says `@target MZ Reactor` and checks `Utils.REACTOR_NAME === "Reactor"` before using these.
- Functions whose names start with `_` are the engine's own and can change between releases. The functions in the [Plugin API Reference](PLUGIN-API.md) are the ones meant for plugins.
- Named, ordered hooks in place of replacing methods, and version requirements, are planned: see the [Plugin API Roadmap](DESIGN-PLUGIN-API.md).
