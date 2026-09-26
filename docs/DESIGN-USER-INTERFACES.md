# Custom user interfaces

Written 2026-08-24, implemented through the 0.98.4 cycle, checked against
the 0.98.5 source on 2026-09-04, and extended on 2026-09-26 with the Items,
Skills, Equipment, Shop and Name Input workflows and the Text Input node. The
current system covers scene and map-overlay records, live visual capture,
generated stock baselines, typed Lists that follow one another, actor
bindings, Gauges, text input, styling and focus overrides, transitions, and
opt-in replacement of twelve stock scene roles.

The owner's ask was a **User Interfaces** database section where a creator
lays out boxes, images, text, buttons, gauges, and lists by dragging, wires
controls to game actions, and calls the result from an event command on the
Reactor tab. The result deliberately remains compatible with ordinary MV/MZ
project data.

## Positions taken

**1. Interfaces are database records in `data/UserInterfaces.json`.** The file
is an MZ-shaped array (`null` at index 0) so the standard database list,
clipboard, and transaction paths apply. Stock RPG Maker does not load the file.
Node data does not belong in a 3D sidecar or stock actor/item/map records.
Opt-in replacement assignments are stored separately in `System.json`.

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
| **Text Input** | A field that edits a variable or an actor's name or nickname: typing, optional stock character grid, placeholder, maximum length, password dots, an action after Enter |

There is no Container node. Box and Image nodes provide the current grouping
and parenting mechanism.

## Lists and contexts

List sources are fixed and typed:

- `party`: actor rows.
- `inventory`: all, regular item, key item, weapon, or armor rows.
- `skills`: skills for the bound actor, optionally filtered by skill type.
- `actorParameters`: MHP, MMP, ATK, DEF, MAT, MDF, AGI, and LUK rows.
- `actorEquipment`: one row per equipment slot, including empty slots.
- `actorStates`: the bound actor's active states; `{description}` is the state's
  Description field, falling back to its persist or afflicted message.
- `options`: the running game's supported configuration rows.
- `saveSlots`: autosave/manual slot metadata and availability.
- `variableRange`: a bounded range of game variables.
- `literal`: authored `id`, `value`, text, and enabled state.
- `itemCategories`: Items, Weapons, Armors and Key Items as System enables them.
- `skillTypes`: the bound actor's skill types.
- `equipCandidates`: what the bound actor can wear in a slot, and an empty row that takes it off.
- `shopGoods`: Shop Processing's goods at their price, enabled when affordable.
- `shopSell`: party items at half price, enabled when they have a price.

**Follows list** (`filterContext`) names another list's context: an inventory
or sell list shows the category chosen there, a skill list the skill type, a
candidate list the equipment slot. A list that follows nothing chosen shows no
rows. **Compare with** (`compareContext`) on a parameter list names a candidate
list: while that list has focus, rows carry `{newValue}` (coloured up or down)
and `{change}`. **Columns** lays rows side by side, and a list with **Can be
focused** off only displays.

Every row has a stable source-qualified `key`, a `kind`, `id`, `value`, display
fields, enabled state, and its backing runtime object where applicable. Row
templates can use fields including `{kind}`, `{id}`, `{value}`, `{name}`,
`{description}`, `{icon}`, `{count}`, `{paramName}`, `{paramValue}`, `{price}`,
`{level}`, `{symbol}`, `{valueText}`, `{title}`, `{playtime}`, `{date}`,
`{partyCharacters}`, `{partyFaces}`, `{existing}`, `{enabled}`, `{index}`,
`{cost}` (a skill's TP or MP cost in its colour), `{slot}`, `{newValue}`, and
`{change}`.

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
named plugin scenes; **Open plugin scene** is a separate action for that purpose.
Opening a stock scene is not the same as replacing that workflow.

The stock screens' workflows are actions on list rows:

- **Use item or skill**: the user is the skill list's actor, or for an item the
  party member with the best PHA, as Scene_Item picks. An ally-scope item or
  skill moves focus to a party List (an Actor Panel first) under the action's
  context: one actor, the whole party (a cursor over every row) or the user
  alone, by scope. Confirm applies it as Scene_ItemBase does and stays for
  another use; cancel returns. Other scopes are used at once. A common event it
  reserves runs on the map. A panel with the visibility condition
  `scene.isSelectingTarget()` appears only while choosing.
- **Equip** puts the candidate in its slot (the empty row takes it off) and
  moves focus to the action's control, else the list's Back target.
  **Optimize equipment** and **Remove all equipment** act on the action's
  context actor, else the menu actor.
- **Buy** and **Sell** ask how many in the stock `Window_ShopNumber` over the
  list, then trade gold and items with the shop sound.
- **Focus another control** moves focus to a node and selects a list's first
  row.

**Back goes to** (`backFocus`) makes Cancel on a control move focus to another
instead of running the interface's Cancel action, so a list screen steps back
the way the stock ones do. In the Skills, Equipment and Status roles, Q and W
(page up/down) change the menu actor.

A **Text Input** starts editing on OK or a click, or at once when it has first
focus and **Start typing when opened** is on. Typing goes through a hidden
HTML input, so keyboard layouts, IME and paste work, and the game's input
never sees those keys. Enter stores the text in the variable, actor name or
nickname and runs the node's action; Escape leaves the value as it was.
**Character grid** also shows the stock `Window_NameInput` under the field for
gamepad and touch; arrows, OK, Cancel and Shift then drive the grid as on the
stock screen. The Name Input role reads Name Input Processing's actor and
maximum length; the actor source **Actor being named** binds to that actor.

The generated Main Menu publishes `selectedActor` through an **Actor Panel**.
This is a party List with `rowLayout: "actorPanel"`: each selectable row contains
the actual actor's portrait, name, class, level and enabled gauges. Add Node
includes Actor Panel; the Inspector edits row height, portrait size, visible
fields (portrait/name/class/level/HP/MP/TP/EXP/States), text styling and selection styles.
**Panel elements → Edit element** selects the portrait, name, class, level, or
an individual gauge bar, label, or value. Each part has its own X/Y, width,
height and visibility. Text parts have font size, alignment and color; bars
have gradient/background colors, Rectangle, Rounded, Cut Corners and Circular shapes. Circular gauges expose
ring thickness; other shapes expose corner size where applicable. A larger
style preview makes the result visible even when a bar is thin. Values can show current, current/maximum, or percent. A dashed outline
identifies the selected part in the first preview row. Coordinates are relative
to each actor row, so one edit applies to the whole party. **Reset Element** removes
only that part's overrides. Padding and spacing control the automatic layout.
Bars and text occupy separate rectangles by default, and text/icon rendering
respects the element's font and bounds. Legacy 192-pixel rows upgrade once to
256 pixels for readable defaults; version 2 and later preserve subsequent manual
row-height choices. `actorLayoutVersion: 3` adds States once to existing panels
and preserves later decisions to turn it off. `actorElements` stores sparse overrides by part name, such
as `hp`, `hpLabel`, and `hpValue`.

The **Custom Element / Custom Label / Custom Value / Custom Gauge** picker adds
parts with independent placement and styling. Custom Element draws a decorative
shape; labels support actor tokens and text codes; values and gauges bind to
actor stats or a game variable. A variable gauge uses a fixed maximum or a second
variable. Game variables are shared across actors. Editor variable previews use
sample values; playtests use the live values. Custom parts use `custom_N` keys in
`actorElements`, with a validated kind, source and variable IDs. Remove deletes a
custom part; Reset Element restores its layout/style while retaining its source.

**States** shows the actor's active state and buff icons. Adjust its position,
size, icon size and spacing like other parts. The editor shows example database
icons; the runtime only shows active effects. State, stat and referenced-variable
changes refresh visible rows without requiring a selection change.

Behavior script and condition fields resize vertically. **Expand Script** opens
a larger multiline editor with Apply and Cancel; Apply participates in undo.

The normal windowskin cursor covers the entire actor row. Portraits honor
runtime 3D face bindings. Labels render escape codes, including `\i[n]` and
`\I[n]`; the editor preview accepts both cases too.

Item, Skill, Equip and Status buttons transfer focus to the panel before opening
the requested scene. Confirm sets the menu actor; cancel returns to the command.
No second list or popup is created. A custom party List bound to the action's
context can also be used. The **Select Actor** action checkbox controls this
step; turn it off to open directly from an already selected actor context.
Personal actions on List rows execute directly. Item still uses the stock shared
party inventory and recipient-selection workflow after the actor choice.
Status respects its configured replacement.

**Formation** focuses the same Actor Panel. Confirm one actor, then another to
swap them; a pending highlight marks the first actor. Cancel clears a pending
choice, then returns to the command. Party size, formation enablement and each
actor's formation lock are respected. Generated menus include Formation when
System enables it. Existing baseline command groups upgrade once, tracked by
`menuCommandVersion: 2`, so subsequently deleting Formation remains intentional.

Custom commands are Button nodes. Visible and Enabled accept script expressions
or explicit return bodies. An optional Label expression supplies dynamic text;
the Text field is the editor preview and runtime fallback. **Open plugin scene**
takes an exported scene class name and an optional array expression of arguments.
For the Demo's skill-tree plugin, use `Scene_SkillTree` and `[actor.actorId()]`.
**Select actor first** also works for Plugin command and Run script actions.
Scripts receive `scene` and `actor`; plugin-command arguments can use `{actor.id}`
and `{actor.name}`. Scene pushes preserve the interface and command focus on
return, including synchronous pushes made by a script or plugin command.

Older stock Main Menus upgrade their named Party box and generated single-actor
details to the integrated panel when normalized, retaining the party section's
outer geometry and unrelated authored nodes. Existing projects need no manual
JSON edits. Actor contexts initialize from the current menu actor so older
context-based enable conditions work before the player makes a selection.

Script conditions accept either an expression (`$gameParty.exists()`) or a
function body with an explicit `return`. Action scripts keep statement semantics.
One input event is consumed once, including when a List confirmation or cancel
changes focus during the window update.

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
preserving its screen rectangle. Ctrl/Cmd-click toggles layers, Shift-click
selects a range, and Ctrl/Cmd+A selects all. Selected roots move together on the
canvas or with arrow-key nudges (Shift for larger steps); selected descendants
follow their parents once. The Inspector exposes group X/Y. Reordering,
reparenting, duplication and deletion operate on the selection with one undo
step. Duplicating a parent carries its subtree and remaps internal parent/focus
links. Layers have a wider column and contrasting selection handles. The canvas
supports drag/resize, anchors,
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

A project that has no `data/UserInterfaces.json` is offered twelve generated,
editable records with stable IDs. New kinds append rather than renumbering old
ones, and **Stock Layout** in the Layers panel replaces any record's layers
with one of them (undoable):

| ID | Baseline | Role |
|---:|---|---|
| 1 | Title Screen | Title |
| 2 | Main Menu | Main Menu |
| 3 | Game End | Game End |
| 4 | Status | Status |
| 5 | Options | Options |
| 6 | Save | Save |
| 7 | Load | Load |
| 8 | Items | Items |
| 9 | Skills | Skills |
| 10 | Equipment | Equipment |
| 11 | Shop | Shop |
| 12 | Name Input | Name Input |

Generation uses the project's screen/UI area, terms, title art, menu settings,
starting party, and stock scene geometry. Existing projects that already have a
`UserInterfaces.json` file are not regenerated or rewritten; they gain the
newer screens through Stock Layout.

Replacement is opt-in and role-gated. The replaceable roles are **Title, Main
Menu, Status, Game End, Options, Save, Load, Items, Skills, Equipment, Shop, and
Name Input**. System 1 selects Title; System 2 selects the others. Shop
Processing and Name Input Processing prepare the routed scene a second time
with their goods or actor, which the interface keeps. A record may advertise one or more matching
roles, but it must be a valid scene record at the selected ID. Zero, missing or
malformed records, overlays, ID mismatches, and role mismatches all route to the
stock scene. Routing wraps the latest `SceneManager.goto`/`push` after project
plugins load, so plugin-provided routing remains in the call chain and fallback
does not recurse.

## Explicit boundaries

Battle and the message inputs (Input Number, Select Item) remain stock and
unreplaceable. The quantity window is the stock one, not an authored node. An
interface opened by script over another open interface does not restore the
one beneath when it closes; the Call User Interface command and interface
actions do.

No general flow layout, alignment guides, Container node, named plugin-scene
replacement, or interactive overlay behavior is claimed. The
standalone MZ plugin is deferred per owner direction, not queued as the next
active phase.

## Compatibility and validation

| Runtime | Result |
|---|---|
| RPG Reactor | Full current system |
| Stock RPG Maker MZ | Ignores `UserInterfaces.json`; `Call User Interface` is a no-op |
| RPG Maker MV project on Reactor | Uses the existing MV compatibility layer |
| Standalone MZ plugin | Deferred, not shipped |

The current full-suite result is recorded in [Current project status](STATUS.md).
Focused coverage includes schemas, typed rows and named contexts, actor bindings
and tokens, generated baselines, functional Options and Save/Load semantics,
role-safe post-plugin routing and fallback, styling, focus, nine-slice behavior,
transitions, and the responsive editor UX. Node coverage verifies that authored
`UserInterfaces.json` participates in database saves. The real Chromium Web and
Linux NW.js GUI save smokes exercise project-metadata durability, not an
end-to-end interface edit/save/reload. The previously recorded read-only NW.js UI-layout smoke passed
at 1280x720, 1600x900, 1920x1080, and 2560x1440. No manual visual playtest is
claimed for this documentation update.
