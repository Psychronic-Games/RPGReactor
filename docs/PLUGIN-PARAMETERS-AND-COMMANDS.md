# Parameters & Plugin Commands

## Parameters

The Plugin Manager builds a plugin's settings from the annotations in its header. It understands the MZ types:

| Annotation | Field |
|---|---|
| `@type string` / `number` / `boolean` | Text, a number (`@min`, `@max`, `@decimals`) and on/off |
| `@type select` with `@option` / `@value` | A list to pick from |
| `@type combo` with `@option` | A list that also takes typed text |
| `@type multiline_string`, `@type note` | Text of several lines |
| `@type file` with `@dir` | A file picker; `file[]` for several |
| `@type struct<Name>` | A form of its own, described by a `/*~struct~Name:` block |
| `@type actor`, `switch`, `variable`, … | Pickers of the project's Database |
| `@type icon` | An icon from the icon sheet |

Read them when the plugin loads with `PluginManager.parameters("YourPluginName")`. Every value arrives as text, so turn numbers, on/off values and structures into what they are:

```js
const p = PluginManager.parameters("MyPlugin");
const speed   = Number(p.speed || 4);
const enabled = p.enabled === "true";
const config  = JSON.parse(p.config || "{}");   // struct<...>
const files   = JSON.parse(p.icons || "[]");    // file[]
```

## Plugin commands

Declare a command in the header and register what it does with `PluginManager.registerCommand`, as in MZ:

```js
/*:
 * @target Reactor
 * @plugindesc Shakes the screen with a custom strength.
 * @author Your Name
 *
 * @command Shake
 * @text Shake screen
 * @desc Shakes the screen.
 *
 * @arg power
 * @type number
 * @min 1
 * @max 9
 * @default 5
 *
 * @arg frames
 * @type number
 * @default 30
 */
(() => {
    PluginManager.registerCommand("MyShake", "Shake", args => {
        $gameScreen.startShake(Number(args.power), 5, Number(args.frames));
    });
})();
```

In the event editor, **Plugin Command** lists it with a form for its arguments. RPG Reactor keeps a command and its argument rows together as one block, so moving or copying it never splits them.

## RPG Reactor's own commands

RPG Reactor's event commands (lights, 3D models, quests, battles on the map, vehicles, media surfaces, Steam and more) are plugin commands of the plugin `RPGReactor`. A plugin runs one as an event would:

```js
PluginManager.callCommand(interpreter, "RPGReactor", "LightSwitch", { target: "#village", state: "on" });
```

The [Plugin API Reference](PLUGIN-API.md#rpg-reactors-plugin-commands) lists every one with its arguments.

## MV plugins

MV headers (no `@target`, MV parameter types) and MV plugin commands (`Game_Interpreter.prototype.pluginCommand`) work through the MV compatibility layer, so one project can mix MV and MZ plugins.
