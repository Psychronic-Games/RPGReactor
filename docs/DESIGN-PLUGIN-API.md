# Reactor plugin API (design)

Status: **proposal, 2026-09-29.** Nothing here is built yet. It answers the need behind [PR #72](https://github.com/Psychronic-Games/RPGReactor/pull/72) (a reliable API reference for plugin authors and AI assistants) without adding a second language or a build step.

## Goals

1. A plugin says it is written for Reactor and which engine version it needs.
2. A plugin changes engine behavior through named, ordered, removable hooks, and the editor and the runtime can say which plugin changed what.
3. Plugin authors and AI assistants get a reference that cannot drift from the code.
4. Everything stays plain JavaScript loaded by script tags. MZ and MV plugins run unchanged.

## Non-goals

- A TypeScript toolchain, a compile step or a bundler. Plugins are `.js` files a user can open and edit.
- Changing `Utils.RPGMAKER_NAME`. It stays `"MZ"`: multi-engine plugins branch on it to pick engine internals.
- Sandboxing. Plugins are trusted code with full access, as in MZ.
- Replacing the MZ plugin API. Aliasing keeps working; hooks are an additional, better-behaved way.

## Where things stand

- **Headers.** `PluginAnnotations.js` recognizes `@target` and `@base` only to split annotation lines; nothing reads their values. `@orderAfter` / `@orderBefore` are not parsed, although our own `RR_WoraFog.js` port uses `@orderAfter`.
- **Engine identity.** `Utils.REACTOR_NAME` is `"Reactor"`. A comment in `reactor_core.js` names `REACTOR_VERSION`, but no such constant exists; the version lives only in `reactor_main.js`'s header and the `RPG_REACTOR_RUNTIME_REVISION` global.
- **Changing engine behavior** means replacing a prototype method, usually as an alias. The Demo's plugins make 1,824 such assignments, with no declared order between plugins that touch the same method. `PluginOverrides.js` can name which plugin replaced a method (by scanning for `.prototype.<method> =`), but not what it changed or in what order.
- **Observing** already has a clean answer: [`ReactorEvents`](RUNTIME-EVENTS.md), an additive, isolated, synchronous feed at fixed points of a battle. Hooks follow its guarantees.

## 1. Plugin header

```js
/*:
 * @target MZ Reactor
 * @reactorVersion 0.99.2
 * @base RR_ShazMultiFog
 * @orderAfter RR_ShazMultiFog
 * @plugindesc Fog layers that follow the camera.
 * @author Someone
 */
```

| Annotation | Meaning |
| --- | --- |
| `@target` | Space-separated list of `MZ`, `MV`, `Reactor`. `Reactor` means the plugin uses Reactor APIs. Keep `MZ` in the list if the plugin also runs on RPG Maker MZ. No `@target` behaves as today. |
| `@reactorVersion` | The oldest Reactor engine version the plugin works on. |
| `@base` | A plugin that must be installed and enabled. |
| `@orderAfter` / `@orderBefore` | Load order relative to another plugin. |

The editor's Plugin Manager:

- shows a Reactor badge on plugins that target Reactor;
- warns when `@reactorVersion` is newer than the editor's engine, a `@base` plugin is missing or off, or the list breaks an `@orderAfter`/`@orderBefore`; and offers to reorder;
- keeps all of this advisory: nothing blocks a project from running.

The runtime gains `Utils.REACTOR_VERSION` (the engine version, bumped with the others at each cycle) and `Reactor.requires(version, pluginName)`. A plugin calls it at load; on an older engine it reports one clear error naming the plugin and both versions, instead of failing later on a missing method.

## 2. The `Reactor` namespace

One global, defined in `reactor_core.js` (it loads before every plugin):

```js
Reactor.version        // "0.99.2"
Reactor.revision       // "20260930.12"
Reactor.requires(version, pluginName)
Reactor.events         // the existing ReactorEvents
Reactor.hooks          // section 3
Reactor.plugin(name)   // this plugin's parameters and header, as the Plugin Manager saved them
```

Existing globals (`ReactorEvents`, `Reactor3D`, `ReactorUI`, `ReactorQuests`) stay where they are. The namespace points at them rather than moving them, so nothing that uses them today changes.

## 3. Hooks

```js
// Change what a method does.
const hook = Reactor.hooks.around("Game_Actor.prototype.gainExp", function(original, exp) {
    return original.call(this, Math.round(exp * 1.5));
}, { plugin: "DoubleXP" });

// Run code before or after it, without touching its result.
Reactor.hooks.before("Scene_Map.prototype.start", function() { /* ... */ }, { plugin: "MapIntro" });
Reactor.hooks.after("Game_Party.prototype.gainGold", function(result, amount) { /* ... */ }, { plugin: "GoldLog" });

hook.remove();
Reactor.hooks.list("Game_Actor.prototype.gainExp");   // [{ plugin, kind, priority }]
Reactor.hooks.report();                              // every hooked method, for the F12 console
```

### Behavior

- **Target.** A string, `"Class.prototype.method"` or `"Namespace.method"`, resolved from the globals when the hook is installed. An unknown target throws at install, naming the plugin.
- **One dispatcher per method.** The first hook on a method replaces it with a dispatcher. Whatever the method was at that moment (the engine's, or another plugin's alias) becomes the chain's base.
- **Order.** Hooks run by `priority` (default 0), then in plugin load order. `around` hooks nest in that order; `before` hooks run before the chain, and `after` hooks after it.
- **Results.** `before` and `after` return values are ignored, as `ReactorEvents` listeners' are. Only `around` can change arguments or the result.
- **Errors.** A `before` or `after` hook that throws is reported with its plugin's name and skipped; the call continues. An `around` hook is in the call path, so its error propagates, reported with its plugin's name.
- **Cost.** A method nobody hooks is untouched and costs nothing. A hooked method costs one dispatcher call and a loop over its hooks.
- **Removal.** `remove()` takes one hook out. When the last one goes, the method becomes its base again.

### Living with aliases

Hooks and classic aliases compose in load order, so no existing plugin breaks:

- A plugin loaded **before** the first hook aliased the method. Its alias becomes the dispatcher's base and runs inside the chain.
- A plugin loaded **after** aliases the dispatcher. It wraps the whole chain, as it would wrap any method.
- A plugin that **replaces** the dispatcher without calling it bypasses every hook. In playtest, `Reactor.hooks` checks each hooked method once per scene start and warns when the dispatcher is gone, naming the hooks that stopped running.

### Limits

- **Statics on display classes.** `pixi_compat.js` replaces every MZ display class (scenes, windows, sprites) with a wrapper that shares its prototype. Prototype hooks therefore reach every instance. A static set through the global lands on the wrapper and not on the original class, so hooks on statics of those classes are not supported in the first version; `hooks.around` rejects them with a clear message.
- **Not a sandbox.** A hook can do anything the plugin could do already.

### Editor side

A hook target is a string literal, so `PluginOverrides.js` can list hooks exactly: the method, the plugin and the kind. Help text that today says "VisuMZ_1_ElementStatusCore replaces this" can also say "DoubleXP wraps this (around)".

## 4. Registries

Some extension points are better served by registering something than by hooking a method. Each gets its own `Reactor.register(kind, id, definition)` entry, built only when a real plugin needs it:

| Kind | Replaces today's |
| --- | --- |
| `textCode` (`\X[n]` message and description codes) | aliasing `Window_Base.prototype.processEscapeCharacter` / `convertEscapeCharacters` |
| `uiNode` (User Interfaces node types) | no plugin path today |
| `sequenceStep` (Action Sequence step types) | no plugin path today |

`PluginManager.registerCommand` stays the way to add plugin commands.

## 5. A reference that cannot drift

- **JSDoc on the public surface.** The `Reactor` namespace, `ReactorEvents`, and the MZ classes carry JSDoc in the runtime source (much of `reactor_core.js` does already). VS Code reads it in plain `.js` plugins, including type checking with an optional `// @ts-check` line. There is no build step and nothing to install.
- **Generated reference.** `editor/build-scripts/plugin-api-reference.cjs` writes `docs/PLUGIN-API.md` from the runtime source: the classes, their methods and JSDoc, the `Reactor` API, and the `ReactorEvents` names. A test regenerates it and fails when the checked-in copy differs, as `sync-runtime.cjs --check` does for project runtimes. If editor type hints beyond JSDoc are ever wanted, a `.d.ts` is generated the same way and checked the same way, never written by hand.
- **Plugin checker.** `node editor/build-scripts/check-plugin.cjs <plugin.js>` reports:
  - the header (targets, version, base and order);
  - the hooks the plugin installs;
  - the methods it replaces (the `PluginOverrides` scan);
  - engine members it calls that do not exist in the runtime.

  The Plugin Manager shows the same report for a selected plugin.

This keeps the project's rule: a hand tool (the Plugin Manager), a readable format (the header), and a validator (the checker).

## Compatibility

- MZ and MV plugins are untouched. Nothing is routed through hooks unless a plugin installs one.
- `Utils.RPGMAKER_NAME` stays `"MZ"`.
- A plugin that targets `MZ Reactor` and checks for `window.Reactor` before using it runs on both engines.

## Phases

1. **Header.** Parse `@target`, `@reactorVersion`, `@base`, `@orderAfter` and `@orderBefore`; add the Plugin Manager badge and warnings; add `Utils.REACTOR_VERSION` and `Reactor.requires`.
2. **Hooks.** Add the `Reactor` namespace, `hooks` with `list`/`report`, the playtest check, and tests. Rewrite one of our own `RR_*` ports on hooks as the proof.
3. **Reference.** Build the generated `PLUGIN-API.md`, its drift test, and the plugin checker in the CLI and the Plugin Manager.
4. **Registries**, one at a time, as plugins ask for them.

## Open decisions

- The namespace and target name: `Reactor` (matches `Utils.REACTOR_NAME`) or `RPGReactor`.
- Whether an `after` hook may replace the result, or that stays with `around`.
- Whether hooks cover the MV compatibility layer's classes in the first version.
- Whether to generate a `.d.ts` at all, or stop at JSDoc and the generated reference.
