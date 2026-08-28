# Custom user interfaces

Written 2026-08-24 and implemented through the 0.98.4 cycle. The current
system covers scene and map-overlay records, live visual capture, generated
stock baselines, typed Lists and actor bindings, Gauges, styling and focus
overrides, transitions, and opt-in replacement of seven supported stock scene
roles.

The owner's ask was a **User Interfaces** database section where a creator
lays out boxes, images, text, buttons, gauges, and lists by dragging, wires
controls to game actions, and calls the result from an event command on the
Reactor tab. The result deliberately remains compatible with ordinary MV/MZ
project data.

## Positions taken

**1. Interfaces are database records in `data/UserInterfaces.json`.** The file
is an MZ-shaped array (`null` at index 0) so the standard database list,
clipboard, and transaction paths apply. Stock RPG Maker does not load the file.
It does not belong in a 3D sidecar, and no custom fields are added to stock map
or database records.

**2. `Call User Interface` is a normal plugin command.** Event calls are stored
as code 357 for `RPGReactor` / `CallUserInterface`. Stock MZ ignores the
unregistered command rather than failing. A project played in stock MZ also
ignores `UserInterfaces.json`.

**3. The runtime uses engine windows and sprites, not HTML.**
`runtime/reactor_ui.js` builds interfaces from `Window_Base`,
`Window_Selectable`, `Sprite_Gauge`, and `Scene_MenuBase`. Interfaces therefore
share the game font, window skin, escape-code processing, keyboard/gamepad/touch
input, fullscreen scaling, screenshots, and compatible window plugins.

**4. Presentation mode is explicit.** A `scene` interface is interactive,
pauses the map, owns focus, and supports cancel. An `overlay` attaches only to
`Scene_Map`, reevaluates its visibility condition, and is display-only and
input-transparent: buttons and Lists cannot focus or run actions. Overlays are
HUDs, not modal menus.

**5. Layout is anchored.** Every node has a screen- or parent-relative anchor
and pixel offset. Box and Image nodes can parent other nodes, and parent opacity
affects the subtree. There is no Container node, general row/column flow
layout, or general alignment-guide system yet. The editor provides an optional
grid and snap-to-grid.

**6. Data binding is declarative and typed.** Text retains stock and
plugin-added escape codes. Lists use fixed row sources rather than arbitrary
queries, and actor-aware nodes use one of five explicit actor binding modes.
Scripts and common events remain the escape hatch for project-specific logic.

## Node set

Records contain a flat parent-linked node list, displayed as a tree and drawn
parents-first.

| Type | Current behavior |
|---|---|
| **Box** | Window-skin, solid, gradient, or transparent surface; opacity, border, radius, and nesting |
| **Image** | Picture, System image, face, character, icon, party face, or title layer; actual-size, stretch, or contain fit |
| **Text** | Escape codes, actor and named-context tokens, alignment, wrapping, fit-to-size, and authored typography |
| **Button** | Focusable surface and label with an action, enabled condition, sound, visual states, and directional focus overrides |
| **List** | Typed rows in a real `Window_Selectable`, with scrolling, disabled rows, a named context, row template, selection styling, and an action |
| **Gauge** | Actor HP/MP/TP/EXP/stat or game-variable progress with configurable label, value format, colors, back color, and bar height |

There is no Container node. Box and Image nodes provide the current grouping
and parenting mechanism.

## Lists and contexts

List sources are fixed and typed:

- `party`: actor rows.
- `inventory`: all, regular item, key item, weapon, or armor rows.
- `skills`: skills for the bound actor, optionally filtered by skill type.
- `actorParameters`: MHP, MMP, ATK, DEF, MAT, MDF, AGI, and LUK rows.
- `actorEquipment`: one row per equipment slot, including empty slots.
- `actorStates`: the bound actor's active states.
- `options`: the running game's supported configuration rows.
- `saveSlots`: autosave/manual slot metadata and availability.
- `variableRange`: a bounded range of game variables.
- `literal`: authored `id`, `value`, text, and enabled state.

Every row has a stable source-qualified `key`, a `kind`, `id`, `value`, display
fields, enabled state, and its backing runtime object where applicable. Row
templates can use fields including `{kind}`, `{id}`, `{value}`, `{name}`,
`{description}`, `{icon}`, `{count}`, `{paramName}`, `{paramValue}`, `{price}`,
`{level}`, `{symbol}`, `{valueText}`, `{title}`, `{playtime}`, `{date}`,
`{partyCharacters}`, `{partyFaces}`, `{existing}`, `{enabled}`, and `{index}`.

A List publishes its selected typed row immediately under its authored context
name, such as `selectedActor` or `selectedSave`. Text nodes can bind to that
context with `{context.name}`, `{context.value}`, `{context.title}`,
`{context.playtime}`, and the other supported context fields. Actor-aware nodes
and semantic actor actions can bind to an actor row in the same named context.
On confirmation, a List may also write the row's `id` or `value` to a game
variable before its action runs.

## Actor data and gauges

Text, party-face Image, Gauge, and actor-specific List nodes share these actor
binding modes:

- fixed party slot;
- fixed database actor ID;
- current menu actor;
- actor ID read from a game variable;
- actor selected in a named List context.

Actor text tokens cover identity and profile (`{actor.name}`,
`{actor.nickname}`, `{actor.class}`, `{actor.level}`, `{actor.profile}`), current
and maximum resources (`hp`, `mp`, `tp`, `mhp`/`maxHp`, `mmp`/`maxMp`,
`maxTp`), EXP (`currentExp`, `totalExp`, `nextExp`, `nextRequiredExp`), and the
six combat parameters (`atk`, `def`, `mat`, `mdf`, `agi`, `luk`). Slot-based
party escape codes remain available: `\GOLD`, `\PLV[n]`, `\PCLASS[n]`,
`\PHP[n]`, `\PMHP[n]`, `\PMP[n]`, `\PMMP[n]`, and `\PTP[n]`.

Gauges support HP, MP, TP, level-relative EXP, MHP, MMP, ATK, DEF, MAT, MDF,
AGI, LUK, and a game variable. Stat gauges use an authored maximum. Variable
gauges use either an authored maximum or a second variable. Values can display
as current, current/maximum, percent, or hidden. Labels are optional, and the
bar's two colors, background color, and height can use engine defaults or
custom values.

## Actions and workflow adapters

General actions can close one/all interfaces, call another interface, reserve a
common event, open one of the supported stock scenes, call a plugin command,
set a switch, change a variable, run a script, or set the menu actor. Semantic
actions cover title commands, Game End to-title, actor selection and paging,
Options mutation, and Save/Load slots.

The generic stock-scene action is limited to Title, Main Menu, Item, Skill,
Equip, Status, Options, Save, Load, and Game End. It does not accept arbitrary
named plugin scenes and it does not provide Shop goods or transaction behavior.
Opening a stock scene is not the same as replacing that workflow.

The generated Main Menu publishes `selectedActor`. Its Skill and Equip commands
set that actor and launch the stock Skill or Equip scene; Status sets the actor
and opens the configured Status replacement when valid, otherwise stock Status.

The `options` List is functional rather than decorative. It exposes Always
Dash, Command Remember, Touch UI where supported, and BGM/BGS/ME/SE volume.
Left/right clamps volumes in stock 20-point steps, confirmation wraps values
like MZ, booleans toggle, labels refresh immediately, and `ConfigManager` is
saved when the interface terminates.

Save/Load Lists expose slot name, game title, playtime, date, party character
and face metadata, and existing/enabled state. Save excludes autosave and allows
empty manual slots; Load can include autosave and enables only existing slots.
Both operations are asynchronous, lock duplicate activation while pending, and
reactivate with a buzzer on failure. A successful save runs the stock before-save
lifecycle and returns after persistence. A successful load clears interface
resume state, applies map-reload handling when required, enters `Scene_Map`, and
runs the stock after-load lifecycle.

## Styling, focus, and transitions

Text, Button labels, and List rows can set a font face (blank means the game
font), size, bold, italic, text color, outline color/width, and letter spacing.
Text also supports wrapping and fit-to-size down to 8 px.

Nine-slice drawing preserves authored image borders only for **Picture** and
**System** image sources. It is intentionally unavailable for faces,
characters, icons, party faces, and title layers; destination borders clamp
safely when a node is smaller than the insets.

Buttons and Lists can override focused fill/text/border/opacity, pressed X/Y
offset and opacity, and disabled fill/text/opacity. Blank overrides inherit the
base appearance. Focus defaults to nearest-in-direction geometric navigation
with wraparound; per-control Up/Down/Left/Right targets override it when the
target is a visible focusable control, and invalid targets safely fall back to
geometry.

Scene interfaces support `none`, `fade`, and `slide-left` opening and closing
transitions over an authored duration. Input remains locked while opening, and
the close action completes only after its transition. Overlay visibility can
fade; slide motion is not applied to map overlays.

## Editor and capture

The User Interfaces tab keeps the canvas primary. One compact toolbar contains
Name, Presentation, the searchable **Use As** combobox, **Interface Settings**,
and **Playtest**. Background, initial focus, cancel behavior, overlay visibility,
transitions, duration, and Note live in the Inspector under **Behavior**,
**Transitions**, and **Notes**. At the default 1280x720 window the Inspector is
a closed contained drawer whose current state is Interface Settings; selecting
a layer or pressing Interface Settings opens it. Detail panes wider than 1050px
show **Layers**, **Layout**, and **Inspector** in one row. Intermediate panes
keep Layers beside Layout and use the contained drawer; one-column reflow begins
at 620px. Layers are listed **Back -> Front**. A
parent always draws before its children and later rows draw on top. Four sibling
operations move a whole subtree to either endpoint or by one step, and safe
drag-and-drop can reorder siblings or put a subtree inside a Box/Image while
preserving its screen rectangle. The canvas supports drag/resize, anchors,
parenting, grid/snap, undo/redo, and **Playtest Interface**. That preview sets up
game objects, opens no title or map, draws over black, and exits when the root
interface closes. It is the authoritative runtime preview.

**Use As** is one searchable multi-select combobox. Its default is **Custom**,
which means no System replacement field points to the record. Checking a role
adds compatibility and assigns that System field; unchecking clears the field
without deleting compatibility. Custom clears only System fields that point to
the current record and is not serialized in `roles`. Overlays cannot gain new
replacement assignments, but a stale assignment remains visible and clearable.

The collapsible **Game Reference** tray can capture title, menu, item, skill,
equip, status, options, save, load, shop, game end, and battle with the project's plugins loaded. It
returns a screenshot, window geometry and draw logs, and per-window content
images. A capture is a visual draft: it can create Box, Text, Image, Button, and
Gauge nodes from recognized engine draws, or preserve canvas-painted content as
a Picture. It cannot infer every plugin override, command workflow, transaction,
touch control, item highlight, direct canvas draw, or other behavior. Captured
commands must be reviewed and behavior that was not recognized must be wired by
the author. Capture itself only updates the editor cache/reference and never
imports automatically. Node imports remain unsaved database edits; the explicit
Picture fallback immediately copies a new PNG asset into `img/pictures`.
**Use as Starting Layout**, **Add All to Front**, per-layer **Add to Front**, and
the Picture fallback make every import explicit. The reference is a pinned,
locked layer behind authored layers. Current capture files retain the stable
legacy ordering of scene elements first and windows second (both Back -> Front);
the editor also accepts a future unified `layers` array, but runtime capture does
not claim true mixed sprite/window order because collecting it safely across
plugin-owned scene trees remains unresolved.

## Generated baselines and opt-in replacement

A project that has no `data/UserInterfaces.json` is offered seven generated,
editable records with stable IDs. New kinds append rather than renumbering old
ones:

| ID | Baseline | Role |
|---:|---|---|
| 1 | Title Screen | Title |
| 2 | Main Menu | Main Menu |
| 3 | Game End | Game End |
| 4 | Status | Status |
| 5 | Options | Options |
| 6 | Save | Save |
| 7 | Load | Load |

Generation uses the project's screen/UI area, terms, title art, menu settings,
starting party, and stock scene geometry. Existing projects that already have a
`UserInterfaces.json` file are not regenerated or rewritten. The tracked Demo
contains the seven generated records, but has no replacement IDs bound in
`System.json`; it remains stock by default.

Replacement is opt-in and role-gated. The exact replaceable roles are **Title,
Main Menu, Status, Game End, Options, Save, and Load**. System 1 selects Title;
System 2 selects the other six. A record may advertise one or more matching
roles, but it must be a valid scene record at the selected ID. Zero, missing or
malformed records, overlays, ID mismatches, and role mismatches all route to the
stock scene. Routing wraps the latest `SceneManager.goto`/`push` after project
plugins load, so plugin-provided routing remains in the call chain and fallback
does not recurse.

## Explicit boundaries

Item, Skill, Equip, Shop, Formation, Name Input and message-input workflows,
and Battle remain stock and unreplaceable until dedicated workflow adapters
exist. They may be launched where a stock-scene action exists, and they may be
captured as visual references, but a custom record cannot assume their selection,
targeting, transaction, quantity, naming, or battle lifecycles.

No general flow layout, alignment guides, Container node, arbitrary Shop/named
plugin-scene replacement, or interactive overlay behavior is claimed. The
standalone MZ plugin is deferred per owner direction, not queued as the next
active phase.

## Compatibility and validation

| Runtime | Result |
|---|---|
| RPG Reactor | Full current system |
| Stock RPG Maker MZ | Ignores `UserInterfaces.json`; `Call User Interface` is a no-op |
| RPG Maker MV project on Reactor | Uses the existing MV compatibility layer |
| Standalone MZ plugin | Deferred, not shipped |

The full tracked validation is **1,785 passing Node tests with no failures**.
Focused coverage includes schemas, typed rows and named contexts, actor bindings
and tokens, generated baselines, functional Options and Save/Load semantics,
role-safe post-plugin routing and fallback, styling, focus, nine-slice behavior,
transitions, and the responsive editor UX. Node coverage verifies that authored
`UserInterfaces.json` participates in database saves. The real Chromium Web and
Linux NW.js GUI save smokes exercise project-metadata durability, not an
end-to-end interface edit/save/reload. The read-only NW.js UI-layout smoke passes
at 1280x720, 1600x900, 1920x1080, and 2560x1440. No manual visual playtest is
claimed for this documentation update.
