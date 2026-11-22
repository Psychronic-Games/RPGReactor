# Your First Plugin

A game plugin is a plain `.js` file in your project's `js/plugins/` folder. Its header is a comment block the Plugin Manager reads, the same kind RPG Maker MZ uses, and its code can reach everything RPG Reactor adds: the 3D world through `Reactor3D`, battle and world events through `ReactorEvents`, custom interfaces, quests, vehicles, online play and Steam. Existing MZ and MV plugins run too.

## 1. Create the file

Create `js/plugins/MyFirstPlugin.js`:

```js
/*:
 * @target Reactor
 * @plugindesc Doubles the gold dropped by every enemy.
 * @author Your Name
 *
 * @param multiplier
 * @text Gold multiplier
 * @type number
 * @decimals 1
 * @min 0
 * @default 2.0
 *
 * @help
 * Multiplies the gold the party earns from battles.
 * Set the multiplier in the plugin parameters.
 */
(() => {
    "use strict";
    const PLUGIN_NAME = "MyFirstPlugin";
    const params = PluginManager.parameters(PLUGIN_NAME);
    const multiplier = Number(params.multiplier || 2);

    const _Game_Troop_goldTotal = Game_Troop.prototype.goldTotal;
    Game_Troop.prototype.goldTotal = function() {
        return Math.round(_Game_Troop_goldTotal.call(this) * multiplier);
    };
})();
```

`@target Reactor` says the plugin is written for RPG Reactor. A plugin that should also run in RPG Maker MZ says `@target MZ Reactor`; one written for MZ alone says `@target MZ`. [Writing Plugins](PLUGIN-DEVELOPMENT.md) has the full list.

## 2. Turn it on

Open **Plugins › Plugin Manager**. It lists every plugin in `js/plugins/` on its **Game Plugins** tab: tick yours, set its parameters, and drag it into the load order you want. The details show what the plugin is written for, read from `@target`. **Save Changes** writes the list to `js/reactor_plugins.js`.

## 3. Playtest

Press **Ctrl+R** to playtest. In the game window, **F8** opens the developer tools: check the console for errors. Type `RPG_REACTOR_RUNTIME_REVISION` there to see which runtime build is running.

## Good habits

- Wrap the plugin in a function that runs at once (`(() => { ... })();`), so its variables stay its own.
- When you replace a method, call the one you replaced (`_original.call(this, ...)`), so other plugins that change the same method keep working.
- To know that something happened (damage dealt, a battle ending, a door opening), listen to [`ReactorEvents`](RUNTIME-EVENTS.md) instead of replacing engine methods.
- A plugin that should also run in RPG Maker checks for RPG Reactor first:

```js
if (Utils.REACTOR_NAME === "Reactor") {
    ReactorEvents.on("battleEnd", ({ result, escaped }) => {
        console.log("Battle finished:", result, escaped ? "(escaped)" : "");
    });
}
```

## Next

- [Parameters & Plugin Commands](PLUGIN-PARAMETERS-AND-COMMANDS.md): settings the Plugin Manager edits, and commands for events.
- [Reactor Globals](PLUGIN-GLOBALS.md): what RPG Reactor adds for plugins.
- [Plugin API Reference](PLUGIN-API.md): every function and command a plugin may use, generated from the engine's code.
