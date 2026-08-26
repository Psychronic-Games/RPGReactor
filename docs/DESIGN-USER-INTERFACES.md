# Custom user interfaces

Written 2026-08-24; **phase 1 built the same day** (0.98.4 cycle), phases 2–5 open. Owner's ask: a **User
Interfaces** database section where a creator lays out boxes, text, images,
and buttons by dragging, wires each button to an event, plugin command, game
scene, or another interface, and calls the result from an event command on
the Reactor tab. Custom title screens, menus, HUDs, shops, and dialogs are the
most-requested thing in RPG Maker that RPG Maker never shipped.

## Positions taken

Decisions the rest of the design rests on. Each one is the answer to a
question the owner raised or that the codebase forces.

**1. Interfaces are database records in their own file, `data/UserInterfaces.json`.**
An MZ-shaped array (`null` at index 0, `{id, name, ...}` after) so the list,
clipboard, transactions, and record templates the other tabs use apply
unchanged. RPG Maker MZ only loads the files `DataManager._databaseFiles`
names and ignores everything else in `data/`, so the file is invisible to the
stock editor and runtime. The `.r3d.json` sidecars stay 3D-only: keying
interfaces into them would tie two unrelated features to one file and one
loader.

**2. Nothing new goes into `Map###.json` or the map sidecar.** The Reactor
event commands are not stored in `Map###.r3d.json` today either: `Play Model
Animation` is an ordinary code-357 Plugin Command (`RPGReactor` /
`PlayModelAnimation`) inside the map's normal command list, and the other
Reactor forms are code-355 scripts carrying a `/*@RPG_REACTOR_EVENT*/` header.
`Call User Interface` follows the 357 pattern. A stock MZ runtime that meets
an unregistered plugin command does nothing, so a project opened or played in
MZ neither crashes nor changes; it just skips the call.

**3. The runtime draws interfaces with the engine's own windows and sprites,
not the DOM.** A new `runtime/reactor_ui.js` (a sibling of
`reactor_picture_extensions.js`) builds every interface from `Window_Base`,
`Sprite`, and `Scene_Base`. That is what makes them inherit the window skin,
the game font, `Input`/`TouchInput`/gamepad, fullscreen scaling, screenshots,
the web build, and every plugin that restyles windows. A DOM overlay would
float over the canvas and fail on all of those at once.

**4. Two presentation modes, chosen per interface.** `scene`: pushed on
`SceneManager` like the stock menu, pauses the map, has focus and a cancel
key. `overlay`: a layer on `Scene_Map`'s spriteset, never takes focus, for
HUDs and status bars. The same node tree renders in both.

**5. Layout is anchored, not absolute.** Every node carries an anchor
(screen or parent edge/centre) plus an offset, so a layout authored at 816×624
still reads at 1280×720. Absolute pixels stay available for people who want
them.

**6. Data binding is declarative and limited.** Text uses the escape codes
`Window_Base.convertEscapeCharacters` already understands (`\V[n]`, `\N[n]`,
`\G`, plugin-added codes included). Lists bind to one of a fixed set of
sources (party, inventory with a category filter, skills of an actor, save
slots, a variable range, a literal list). No expression language beyond the
existing Script command; anything an escape code cannot say is a common event.

## The node set

A flat list of nodes with parent ids, drawn parents-first; the editor shows it
as a tree. A parent's opacity fades its whole subtree. Every node has `id, type, name, parent, anchor, x, y, width, height, visible
(always | switch | variable comparison), opacity`.

| Type | Draws | Notes |
|---|---|---|
| **Box** | window-skin panel, or flat/gradient fill with border, radius, padding | the container everyone reaches for first |
| **Image** | a file from `img/pictures` or `img/system`, or a face/character/icon by index; can parent other nodes | optional 9-slice for stretchable frames |
| **Text** | one run with alignment, font size, colour, outline, optional word wrap at the node width, optional fit-to-size (the font shrinks, to 8 px, until the text fits the node); escape codes resolved live | `drawTextEx` under the hood |
| **Button** | a Box or Image with `normal / hover / pressed / disabled` looks and an action | keyboard focus, gamepad, mouse and touch |
| **List** | rows from a data source, one row template, selection highlight colour | confirm runs the action with the row's id in a variable |
| **Gauge** | HP / MP / TP / variable against a max | reuses `Sprite_Gauge` colours |
| **Container** | nothing; groups children, optional flow layout (row/column, gap) | |

Styling knobs per node stay to the set above; "upload an image" covers what a
style panel never will.

## Actions and exits

A button, a list confirm, and the interface's cancel key each run one action:

- `callInterface(id)` — pushes another interface (sub-menu); back returns
- `close` / `closeAll`
- `commonEvent(id)` — runs on the map interpreter after the interface closes,
  or in-place for overlays
- `scene(name)` — item, skill, equip, status, save, load, options, gameEnd,
  shop (with the goods table), or a named plugin scene
- `pluginCommand(plugin, command, args)`
- `switch(id, on|off)`, `variable(id, value|+1|-1)`
- `playSe(...)` (usually chained onto the above via the button's confirm SE)

Focus order is derived from geometry (nearest node in the pressed direction)
with per-node overrides. Each interface names its first-focused node and what
cancel does (`close`, `back`, `nothing`, or an action).

## Editor

A **User Interfaces** tab in the database: the standard record list on the
left; on the right a canvas at the project's screen size with drag, resize,
snap-to-grid and alignment guides, a node tree, and a property panel that is
the same `db-form` grid as every other page. Preview inside the editor paints
window skins and text with a small port of `Window_Base`'s skin drawing (the
Character Generator already draws sheets on Canvas 2D; this is less). A
**Playtest Interface** button boots the game straight into the interface —
as a preview, not a game: the game objects are set up so escape codes and
actions have data, but no title or map opens, the interface sits over a black
screen whatever its background setting, and closing the last interface ends
the playtest. It is the only preview that is exactly right and it costs
almost nothing to build.

Every label is a locale key across all 17 non-English locales, hand-authored
(the translation generator is broken); budget for it.

## Seeing the interfaces a project already has

Creators want to see the menus their project *currently* shows, plugins and
all, and edit from there. Only the running game can answer what a plugin does
to a menu, so the tab reads from the game rather than guessing.

**1. Capture from game (built in the 0.98.4 cycle).** A **Capture from Game**
button launches the playtest process with `test&rrcapture=<scene>&rrcapturedir=<dir>`
on the launch line. The runtime boots, sets the game up, opens that scene
(title, menu, item, skill, equip, status, options, save, load, shop, gameEnd,
battle), waits for every window to finish opening, and writes to `<dir>`: a
screenshot, `capture.json` (the active plugin list and every `Window_Base` on
screen: class, rect, padding, opacities, openness, cursor rect), and each
window's contents bitmap as a PNG. Then it exits. Captures live in the
editor's per-machine cache, never in the project. The tab shows the
screenshot as a locked **reference layer** under the nodes (toggle and
opacity in the Layout header) and lists the captured windows; a row
highlights its rect on the canvas, and **Add Box** starts a node from it.

**2. Baseline stock interfaces (built in the 0.98.4 cycle).** MZ's stock
layouts are functions of screen size, UI area and font, so a project that
has never authored an interface opens the section on records generated from
its System.json by `editor/src/utils/StockInterfaces.js`: Title Screen, Main
Menu and Game End, Box nodes with the skin, Buttons named from Terms and
wired to the stock actions, Text for gold, the party area from party faces
(`partyFace` image source) and party codes (`\GOLD`, `\PLV[n]`, `\PCLASS[n]`,
`\PHP[n]`/`\PMHP[n]`, `\PMP[n]`/`\PMMP[n]`, `\PTP[n]`). They are written
with the next save and carry `stock: "<kind>"`. The game keeps its stock
scenes until a record is called or set as the boot interface. Item, skill,
equip, status, save/load and shop baselines wait for the List and Gauge
nodes (phase 2).

**3. Convert a capture to nodes.** With the draw primitives every window uses
(`drawText`, `drawIcon`, `drawFace`, `drawGauge`, `drawItemName`) logged during
capture, a captured window becomes Box + Text + Image + Gauge nodes at the
recorded positions: an editable copy of the *look* of even a plugin-modified
menu. The plugin's behaviour does not come with it; commands are re-wired as
actions.

Nothing changes for a project that does not opt in: stock scenes run as they
always did until a System setting binds an interface to one (phase 4), and a
plugin that replaces a scene keeps doing so until the creator binds their own.
The tab names the plugins a captured scene's windows came from, so that is
never a surprise.

## Compatibility

| Runtime | Result |
|---|---|
| RPG Reactor | full |
| RPG Maker MZ, project unchanged | `UserInterfaces.json` ignored; `Call User Interface` is a silent no-op; nothing else differs |
| RPG Maker MZ + `ReactorUI.js` plugin (phase 5) | interfaces run; the runtime file is written against MZ's API already, so packaging it as a plugin that loads the JSON itself is mostly a build step |
| RPG Maker MV | not an authoring target; MV-format projects on the Reactor runtime go through the existing compat layer |

Saves: an open `scene` interface is not saved (menus never are); an
`overlay` interface's visibility is a switch, which is.

## Phasing

| # | Work | Buys |
|---|---|---|
| 1 | `UserInterfaces.json`, `reactor_ui.js` scene mode with Box / Image / Text / Button and the action set, `Call User Interface` on the Reactor tab, the database tab with tree + property panel + drag/resize canvas | A working custom menu end to end. Everything after is depth. **Done.** |
| 1½ | Capture from game: the live scene as a reference layer plus its window list | Seeing the current menus, with plugins. **Done.** |
| 2 | List and Gauge with data sources, overlay mode, focus-order overrides | HUDs, inventories, party screens |
| 2½ | Stock baselines generated from the project's settings (Title, Main Menu, Game End) seed an empty section | Editable baselines. **Done.** |
| 2¾ | Convert a capture to nodes; baselines for the list-driven scenes once List exists | Editable copies of modded menus |
| 3 | Styling depth: gradients, 9-slice, per-node fonts, highlight colours, open/close transitions | The "make it mine" pass |
| 4 | System settings: use interface *n* as title screen / main menu / pause menu | The actual headline feature; wants 1–3 solid first |
| 5 | `ReactorUI.js` standalone plugin for stock MZ | Reach beyond Reactor projects |

Not attempted: HTML/CSS authoring, a scripting language, replacing the
battle scene, or theming stock windows (VisuStella's territory; ours composes
with it).
