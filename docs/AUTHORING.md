# Authoring a world in RPG Reactor, by hand or by generator

RPG Reactor is built so a person and an AI can work on the same project.
Every authoring surface below has three faces: a tool in the editor, a
plain file a person can read and a generator can write, and a check that
proves the data works with the engine's own rules. Hand edits are never
overwritten by generation.

This page is the contract. A generator should read it before touching a
project; a person can use it to find where anything lives.

## Where things live

| Surface | File (per map, beside `data/MapNNN.json`) | Editor tool | Check |
| --- | --- | --- | --- |
| 3D switch | `<3d>` in the map note | Map Properties › 3D | — |
| Tile elevation (terraces, cliffs) | `MapNNN.r3d.json` › `elevation` (one whole number per tile) | — (by hand or generator) | — |
| Terrain (rolling ground) | `MapNNN.r3d.json` › `terrain` ((w+1)×(h+1) corner heights), `terrainWidth` | Build bar › Terrain brushes | `editor/tests/terrain.test.cjs` rules |
| Room (floor, its `floorTint` and `floorScale`, walls, ceiling, sky) | `MapNNN.r3d.json` › `room` | Build bar › Terrain › Room and Sky | — |
| Steep ground (the material slopes turn to) | `MapNNN.r3d.json` › `room` › `cliff`, `cliffSlope`, `cliffTint` | Build bar › Terrain › Ground › Whole map › Steep Ground | `editor/tests/terrain-cliff.test.cjs` rules |
| Pieces (the 3D tileset) | `MapNNN.r3d.json` › `pieces` | **Build** bar over the 3D view (the Build button in the toolbar); drawn as a plan on the flat map too | `validate-map.cjs` |
| Buildings, built or described | `3d/Structures/*.json` (project-wide), placed as `MapNNN.r3d.json` › `structures` | Database › Structures › Build (the plot in the 3D view with the Build bar), Build bar › Blueprint or Use on the map stamps one | `build-structure.cjs --check`, and the page's own walk |
| Materials | `img/materials/*.png` (tileable) | swatches in the Build bar's specs panel | — |
| Ground types (sand, dirt, snow, alien grounds) | `MapNNN.r3d.json` › `ground.types` (a material, tint, scale and a level per cell each) | Build bar › Terrain › Ground | `paint-ground.cjs`, `validate-map.cjs` |
| The land past the border | `MapNNN.r3d.json` › `surround` | Build bar › Terrain › Beyond the Border | `editor/tests/map-surround.test.cjs` rules |
| Water | `MapNNN.r3d.json` › `water` (a hollow's box, its `level`, a `mask` of the wet cells) | Build bar › Terrain › Pour | `validate-map.cjs` |
| Rivers and waterfalls | `MapNNN.r3d.json` › `water` (a sheet with a `path` of heights downstream and a `flow`) | Build bar › Terrain › River | `carve-river.cjs`, `validate-map.cjs` |
| Foliage (grass, flowers, ferns, reeds, bushes) and wind | `MapNNN.r3d.json` › `foliage` (a density per cell per layer, bushes one by one) | Build bar › Foliage | `paint-foliage.cjs`, `validate-map.cjs` |
| Placed models | `MapNNN.r3d.json` › `props` | Build bar › Models (Select there, or Build › Select, picks a placed one up; Placement › Scatter lays many along a drag, each turned and sized its own way) | — |
| Physics (gravity, jump, fall damage, swimming; in battles `battleClimb`, `climbHeight`, `climbCost`, `battleFall`, `lethalFall`) | `System.json` › `reactorPhysics`; a map's own in `MapNNN.r3d.json` › `physics` | Database › System 2 › Physics (3D maps), Swimming (3D maps); Map Properties › Physics | — |
| Keys and gamepad buttons | `System.json` › `reactorControls` (absent while stock) | Database › Controls | — |
| Lights and time of day | `MapNNN.r3d.json` › `lights`, `lighting` (a sun follows the ambient unless `daylight: "fixed"`) | Lighting tool | — |
| Model variants (one model, several looks) | `3d/<model>/model.json` › `variants`; a use names one with `variant` in its model spec, or `variant(Name)` in an `<r3d>` note | Database › 3D Models › Variants; the Variant row wherever a model is chosen | `editor/tests/model-variants.test.cjs` |
| Events | `MapNNN.json` › `events` (RPG Maker data) | Event tool | — |
| Vehicles: placements, classes, equipment and motorcycle riding | `data/ReactorVehicles.json`; class/vehicle `traits`; model `model.json` › `vehicle` / `parts`; legacy event `rrVehicle` | Database → Vehicles → Starting Position; Classes → Traits; System 1 for native starts; Reactor commands | `validate-vehicles.cjs` |
| Equipment slots of a class (how many, of which types, in what order) | `data/Classes.json` › `rrEquipSlots` | Database › Classes › Equipment Slots | `editor/tests/trait-effect-choices.test.cjs` |
| Event size (footprint) | `MapNNN.r3d.json` › `eventSize[id] = [w, h]` with `eventSizeAnchor: "center"`; `eventSizeAuto[id]` is the editor's measured picture | Event Editor › Size (W, H, Auto) | `editor/tests/event-marker-centre.test.cjs` |
| A record's battle settings (reach, area, sight, Move range, Climb, how it fights, how a weapon fires, cooldown, an enemy's picture on the map) | `rrBattle` on the record, in `data/Skills.json`, `Items.json`, `Weapons.json`, `Armors.json`, `States.json`, `Actors.json`, `Classes.json`, `Enemies.json` ([BATTLE-MODES.md](BATTLE-MODES.md#a-records-battle-settings)); tags in its Note are also read | Database › the record's **Combat** section | `battle-tags-to-fields.cjs` (lists a project's tags, `--write` moves them into the records) |
| An armor's grapple (reach, highest edge, uses, cooldown, what it costs) | `rrGrapple` on the armor in `data/Armors.json`: `{ range, height, uses, cooldown, cost: "move" \| "action", moveCost }` (absent while off) | Database › Armors › **Grapple** | `editor/tests/battle-climb-fall-grapple.test.cjs` |

`MapNNN.json` stays ordinary RPG Maker data. Everything 3D is in the
sidecar `MapNNN.r3d.json`, so a project with no 3D maps has no sidecars.

The editor writes these files compactly: a sidecar or structure keeps one
grid row or one piece per line, and database files one record per line.
Any valid JSON reads the same; a generator may write whatever layout it
likes, and the editor rewrites it compactly on the next save.

In the editor, Database › Structures lists the structure files as cards.
A structure's page has a floor plan beside a 3D view of it: pick a floor,
paint rooms, floors, walls, doors, windows and stairs with the tools
(Select picks pieces up to move, nudge, turn or delete; right-drag erases;
Ctrl+Z undoes), and set **Floors** to stack more. The plan shows what the
3D view shows: the rooms, the structure's own pieces and shapes, and the
plans it is made of. **Roof** is Gable, Flat or Slanted (one slope, with
the side it rises to); the style and **Roof pitch** act at once, and
**Rebuild roof** lays the roof again over the top floor. The **Walls**,
**Floors** and roof tiles show the material in use; a click opens the
project's materials, the building wears each while the pointer is over it
and keeps it on a click (the selection only, when pieces are selected).
**Seen from above**, over the floor list, shows the whole building from
the top: its roof, and what stands above the top floor. **Build** opens the structure's plot in
the map's 3D view with the same Build bar the map uses, for anything the
plan cannot paint. The Build bar's Blueprint slot, or Use on the map,
stamps a structure; **Rebuild from plan** re-lays a stamped one from its
file. The Blueprint panel shows each plan as a picture with its size, a
Direction and a Size (×1 to ×4) to stamp it at, and **Move a building** (M)
picks one up on the map with buttons for what the keys do: Turn (R), Remove
(Delete), Nudge (the arrows; Shift for 5) and its Size.

The rules the engine applies to terrain, pieces and water (where the
ground is, what blocks a step, how deep the water stands) are in
`runtime/reactor_3d_world.js`, readable without three.js; the checks above
run the same code the game does.

An event's Size is its footprint, centered on the event: triggers, the action button and collision count every tile of it, and an even size's graphic stands on the tile edge at its middle. **Auto**, for an event that stands as a 3D model, takes the tiles the model's body covers at its model size and facing; typing a width or height sets it by hand (an event across a three-tile doorway). A map saved before 0.98.9 counts footprints from the event's tile right and down until it is saved in the editor.

## Units

A tile is one world unit. The bundled characters stand three tiles, so a
tile is about 0.6 m. A storey (`PIECE_STOREY`) is 5 tiles. Doorways default
to 3 cells wide (1.8 m); a front door is usually 4 to 6. Heights in the
sidecar are in tiles; positions are cells (integers) for pieces and
fractional tiles for models.

## Riding the Demo motorcycle

North Haven (Map005) has five rideable motorcycles parked near its
northwest corner, at **(20, 9)**, **(30, 9)**, **(21, 16)**, **(31, 17)**
and **(22, 23)**, facing south. The Motorcycle entrance in the Reactor Room
(Map001, event 24) transfers the player to **(25, 2)**, just north of them.
Start a new playtest after changing the project data.

Walk beside the bike and press **Enter** (Confirm) to mount. **Up**
accelerates, **Down** brakes and then reverses if held, and **Left/Right**
steer. Press **Escape** (Cancel) to dismount; while moving, the bike brakes
first and gets you off once it is slow enough and has room. **Enter**
while seated interacts with nearby characters and keeps you aboard.
Escape opens the menu normally once you are on foot; a separately bound
Menu button still opens it while riding. The existing Jump control
(**Space** by default) hops the bike.
These are the Demo's default keyboard bindings; custom Confirm, Cancel, movement
and Jump bindings also apply. The motorcycle uses the existing driving
physics, rolling wheels, rider pose and save persistence. North Haven
uses the supported third-person camera. The seat label and hint strip
are not implemented yet, so no on-screen Ride instruction appears.

The vehicle type names the Ninja model, sized to fit the starting party.
The model sidecar binds its wheels, seat, hands, feet and carved Steering
part. The Demo's bikes are Starting Positions of the Motorcycle on the
Vehicles page (the five at North Haven and one on Open Road: Forest); the
vehicle system supplies their model and boarding behavior. The old Reactor
Room event remains an entrance, separate from the rideable bike.

## Authoring vehicles

To author a vehicle, open **Database → Vehicles → + Add Vehicle**,
choose its kind and image. The image control starts in 2D; check **3D**
to choose a model with the shared model picker. Switching back retains
the previous assignments. Adjust movement and handling as needed. In
**Starting Position**, click the location button, choose a map and tile
with the shared map picker, then choose the facing. A 3D map stands in the
picker (drag to turn, right-drag to move, scroll to zoom, click the place);
**Top Down** is the flat view. The vehicle appears in both editor views
without adding an event to the map: its orange marker covers its Length along
the way it faces (one tile for a 2D vehicle), and the map's Events list shows
it below the map's own events under **Vehicles (Database)**, named by its
entry and row ("Vehicle 1 · Motorcycle · Unit 3"). Drag it on the map, in the
2D or the 3D view, to move where it starts: the Database is written when it is
dropped, and Undo puts it back. Double-click it, or its row, to open its
Vehicles entry. Vehicle starting coordinates follow anchored map resize offsets.

**Several of one vehicle.** Starting Position is a list: **+ Add Another** adds a copy of the vehicle with a starting
position and facing of its own, and **Delete** takes a row away (the first row's vehicle is replaced by the next
one's; with no other row it is left unplaced). Each copy is a vehicle of its own
in the game (its own place, condition and equipment) and is named in commands as "Motorcycle 2". In the file a
copy is an entry of the record's `copies` (`{ id, startMapId, startX, startY, startDirection }`); its identity is
`0:<vehicle ID + 10000 * (id - 1)>`, the first copy's `0:<vehicle ID>`.

**Where the rider sits.** In **Database → 3D Models**, choose **Vehicle rider** in the **Rig** tool's list: five dots,
Seat, Left and Right grip, Left and Right footrest. Drag them onto the model (a side's twin mirrors) and
**Save rider**. They are `model.json` › `vehicle` › `seats[0]` (`seat`, `handL`, `handR`, `footL`, `footR`, each
`{ "at": [x, y, z] }` in model space). A model with none is seated by its shape and kind.

**Followers ride too.** When the leader gets on a ground vehicle on a 3D map, each follower in the line takes the
nearest free vehicle within 20 tiles and rides behind in line, along the leader's own path; a follower with none
near rides unseen, as before. They go with the leader over borders and through transfers, and when the leader
gets off each vehicle is parked where it stands. A follower under an order, or hidden, takes none.

**Set Vehicle Location** lists Boat, Ship, Airship, every vehicle of the Vehicles page, copies included, and the
vehicle events of the map being edited (stored as `<mapId>:<eventId>`), and moves the one chosen to any map: on its
map it is put on the tile, and it leaves or appears as the command says. A vehicle event the game has not read yet
(its map not entered since the game began) can be moved on its own map only. A ridden vehicle is not moved.

Confirm boards nearby vehicles; Cancel brakes and dismounts. A ground vehicle is ridden into water: where the water is deeper than it wades (`handling.wade`, 0.45 tiles) the ride is over, its rider is left in the water on foot (swimming where it is deep) and the vehicle goes down to the bed and stays there, on that map, until someone moves it. The player gets it back by boarding it where it lies (wading to it, or diving down to it with Dash where it is deep) and walking it along the bed: under water it moves at a walk with its engine silent and cannot jump, and it runs again once the water is no deeper than it wades. Cancel under water leaves the rider in the water and the vehicle where it is. It comes out only where the bed leads out: a lake with cliff banks all round keeps it. `ReactorVehicles.sunk(vehicle)` asks, `setLocation` moves it, and `vehicleSink` is said on the runtime's event feed. Event commands
**Get On Reactor Vehicle** and **Get Off Reactor Vehicle** remain in the
**Reactor** tab; Get On chooses its vehicle from a list: the nearest one, this
event (when it is a vehicle), the Boat, the Ship or the Airship, a vehicle of
the Vehicles page that is placed or named, or a vehicle event of the map (stored as `nearest`, `this`,
`boat` / `ship` / `airship`, `0:<number>` or the event's number). Stock RPG Maker vehicle
commands retain their existing meanings.

**An event as a vehicle.** In the Event Editor's top band, **Vehicle** makes the event a vehicle of the Vehicles
page (`rrVehicle: { type, yaw }` on the event; **None** takes it away), and **Heading** sets the way it faces. The
event then stands on the map as that vehicle: a page that gives it no picture or model wears the vehicle's own
(the page's Image shows it, with 3D ticked), OK boards it, and an event that has commands of its own is boarded by
Get On Reactor Vehicle so its commands still run. Place one the way any event is placed, in the 2D or the 3D map
view. This and a Starting Position are the two ways a vehicle comes to be on a map; each event is a vehicle of its
own, so do not give one vehicle both.

A ridden vehicle travels with the player on a Transfer Player command.
Once parked, it stays on that map until the player returns. Its starting
placement stays absent while it is elsewhere, and its identity, position
and condition survive saving and returning. Legacy event self switches
keep their original identity. Transfers to
maps that do not support riding carry and park the vehicle at the arrival
position and put the player on foot. Vehicles support both 2D and 3D maps;
assign a character sprite for use in 2D. 2D looping maps are supported;
3D looping maps and first-person 3D maps remain unsupported. **Rideable**
and **Movement** determine whether and where a type can be ridden, rather
than a fixed scenery restriction on its kind.

A vehicle can optionally use an existing **Class**, initial level and
starting equipment. The class supplies parameter curves, learned skills,
traits and weapon/armor type permissions. Vehicles also have their own
traits and learnable skills. Equipment uses the same rules as Actors: the
class's **Equipment Slots** say which slots there are (see
[Class equipment slots](#class-equipment-slots)), and
**Traits → Equip Weapon / Equip Armor** allow item types. On a class with
no slot list, **Seal Equip** disables a slot and **Slot Type → Dual Wield**
supplies a second weapon slot. Configure class traits when a class is
assigned; without a class, configure the vehicle's own traits. Vehicle
traits also supplement its class permissions. **Types** supplies the shared equipment, weapon and
armor categories. Each placed vehicle has independent health, equipment and active
states; these use the existing battler rules and save data. There is no
in-game vehicle equipment menu.

**Rider.** **Automatic** draws the rider on the seat when the vehicle's model
places one (3D Models → Rig → Vehicle rider), else as the vehicle's type
keeps its rider (a tank, an airship and a shuttle keep theirs inside). **On
the seat** and **Inside the vehicle** decide it outright. Followers on
vehicles of their own are drawn whichever it is. A figure whose rig has no
hips, arms and legs by name stands in the seat instead of sitting.

**Fighting from a vehicle.** A Tactical battle keeps the party on its land
vehicles. A mounted unit moves the vehicle's range (the vehicle's or its
class's `<move: N>` note; else 0.4 tiles for each tile a second of top speed,
from 4 to 12), climbs nothing, and has **Dismount** in its menu; a unit on
foot beside a free vehicle has **Mount**. Getting on or off is the unit's
move for the turn. On the battle screen (Classic) the party stays aboard, and
in a Battle Room each rider sits on its vehicle. In both, a vehicle with a
class, traits, skills or equipment fights too: **Attack** asks whose attack
it is to be when the vehicle can attack, and the vehicle's skills are listed
after the rider's own under the vehicle's name, with its MP and TP. What the
vehicle does uses its own strength, MP and TP. A rider's own attack is made
with the weapon in hand; in a Battle Room one who goes up to the target
leaves the vehicle for the strike. When a Tactical battle ends the leader
rides on and anyone who got off takes the nearest vehicle again; if the
leader ends it on foot, every vehicle stays where it stands. Action and
First Person battles, and a boat or an aircraft in a Tactical battle, put the
party on foot.

**A vehicle in the line of fire.** A rider and its vehicle are two in one
place. An action for one target lands on one of them: the player is asked
which when it is theirs to aim (a heal, a revival), and the other side
strikes whichever has the lesser share of its HP left (the rider at a tie).
An action for an area lands on both. A rider kept **Inside the vehicle** is
behind it: the other side's actions land on the vehicle until it is wrecked.
A vehicle at 0 HP is a wreck: its rider is put on foot beside it, nobody
rides it, and a revival brings it back. After a battle that is won a wreck
stands again at 1 HP, unless System › Battles turns off **The fallen get up
after a win**; **Recover All** for the entire party mends the party's
vehicles on the map. A unit's panel shows its vehicle's HP under its own, and
on the map the vehicle's bar sits over its rider's.

**The fallen.** One of the party who falls in a battle goes to the ground
and lies there until brought back (out of the saddle, if riding); in a
Battle Room a fallen actor lies where it stood. An enemy on the map falls
and lies a moment before it fades; on the battle screen it goes as its
Collapse setting says.

The Vehicles page also edits the original **Boat, Ship and Airship** in
System.json. They retain native movement and RPG Maker event commands;
optional model, class, equipment, trait and skill settings use a Reactor
extension on each original record. Their native starting positions remain
in **System 1**, without duplicate position controls in Vehicles. Custom
vehicle positions use the Vehicles entries; no map selected leaves them
unplaced. Starting positions apply to new games; saved parked positions
continue to take precedence. Additional Reactor vehicle types
use an optional file, so projects without them need no extra catalog.
Database Cancel restores vehicle records and class trait edits together.

**Sound** groups optional Idle, Acceleration and Slowdown loops from
`audio/bgs` with the vehicle BGM. Engine loops use independent buffers and
BGS volume, so map ambience continues playing; missing acceleration or
slowdown clips use Idle. Their pitch and volume follow driving speed.
The existing `sounds.engine` SE remains a legacy idle fallback. Choosing
None for Idle clears that fallback. BGM with no selection leaves game
music alone. **Effects** folds away optional SEs; native Boat, Ship and
Airship support Start and Stop, while Reactor event vehicles also support
Impact, Landing, Scrape and Skid.

For model preparation, these tools use the runtime's own fit and standing
checks. `make-vehicle.cjs --fit` creates the type and fits the rider;
`carve-part.cjs` separates steering geometry when the model needs it;
run `make-vehicle.cjs --id N --reguess` after carving to attach the hands
and steering control to that part. `place-vehicle.cjs` places it on a map.
All support `--check` to inspect a proposed change before writing.

```sh
node editor/build-scripts/make-vehicle.cjs <project> --name Motorcycle --kind motorcycle --model Vehicles/kawashaki_ninja_h2 --fit
node editor/build-scripts/place-vehicle.cjs <project> <mapId> --vehicle 1 --at x,y --face e --key motorcycle
node editor/build-scripts/validate-vehicles.cjs <project>
```

The Demo already contains that type and placement; rerunning the placement
command would add another event. No map generator is needed to place a
vehicle, and North Haven's terrain, structures, foliage and residents
are preserved.

## Class equipment slots

```json
{ "id": 11, "name": "Motorcycle", "rrEquipSlots": [1, 6, 1, 1, 1] }
```

`rrEquipSlots` on a class is its slots: the equipment type id of each slot, in order (ids are places in `System.json` › `equipTypes`). A type listed twice is two slots of it, so `[1, 3, 3, 4]` is Weapon, Head, Head, Body. Actors and vehicles of the class have these slots, and their `equips` holds one item id per slot in the same order. Change Equipment fills the first slot of the type it names.

A class with no `rrEquipSlots` has one slot per equipment type, with a second weapon in place of the second slot under Dual Wield. A class with a list ignores Dual Wield: list Weapon twice.

In the editor: Database › Classes › **Equipment Slots**. Add a slot, pick its type from the dropdown, drag a slot by its grip (or use the arrow keys on the grip) to change the order, delete it with ×. A new class starts with Weapon, Shield, Head, Body and Accessory. An equipment type added under Types is a slot of no class until it is added there. Changing a class's slots moves the starting equipment of its actors and vehicles with each slot's type.

## 8-direction character sheets

A file in `img/characters` whose name has `[8D]` (`$Hero[8D].png`) is cut as eight blocks of 3 × 4 frames, whatever its `$` says. Block 0 walks down, left, right and up; block 1 holds its diagonals (rows down-left, down-right, up-left, up-right); block 2 is the dash, block 3 its diagonals. A character set to block 0 dashes on block 2, and shows the block to the right while it steps or faces diagonally; blocks 2 and 4 take their own diagonals the same way. Blocks 1, 3, 5, 6 and 7 show as picked in the event's graphic. The player, followers and events all follow it (the player steps diagonally with Database › System 1 › Options › Diagonal movement on). Sheets without the tag are cut as in MZ. Forge › 3D Character Builder › Export sprite sheet makes one.

## Pieces

```json
{ "id": 12, "kind": "wall", "x": 30, "y": 49, "z": 0, "rot": 0, "material": "Stone", "group": 2 }
```

- `kind`: `wall` (a storey tall), `block` (one tile cube), `floor` (a slab),
  `pillar`, `stair` (rises one tile across the cell, toward its `rot`;
  a wider stair is stairs side by side), `ramp` (same, a slope), `roof`
  (a one-cell gable), `doorway` (a lintel only: the opening is the whole
  cell, tile two side by side for a door), `window` (a sill and a header),
  `glass`, `fence`, `ladder` (one level of rails and rungs on one side
  of the cell; a stack of them at one cell is one ladder, climbed by
  walking into it, and nothing stands on it) and `door` (below). The shapes are `box`,
  `wedge`, `pyramid`, `prism`, `hull`, `spike`, `cylinder`, `capsule`,
  `tube`, `cone`, `dome`, `sphere`, `dish`, `fin`, `arch`, `tunnel` and
  `ring`: they carry `size: [w, h, d]` in tiles (the cell is the middle of
  the footprint), `angle` in degrees and optional `tilt` and `roll`, stand
  at any quarter tile, and some take settings (`sides`, `taper`, `sweep`,
  `thick`; see `Reactor3D.SHAPE_PARAMS`). A shape blocks every cell its
  footprint covers, as a wall of its height. `rock` is a shape drawn as
  rock: every rock on a map is one mass (neighbours melt together, a
  noise fixed to the world makes it craggy, its top stays nearly flat),
  with an optional `rough` from 0 to 1 (0.5 by default), `cap` (the
  material its tops and flat ledges wear, or `"ground"` for the map's own
  room floor, so a cliff top is the grass around it) and `tint`
  (`#rrggbb`, its sides only). Its image is laid from all three sides by
  world position. It is stood on and blocks where it is drawn (each cell
  reads the rock's surface over its middle; a raised rock is walked
  under), and one standing on the ground reaches a tile into it. Cliffs are rocks side by side and
  stacked: in the Build bar a drag lays a row and a Ctrl-drag fills an
  area, each rock varied a little unless Vary is off.
- `x, y`: the cell. `z`: the level the piece's foot stands at, in tiles
  above the ground, up to 240 (forty-eight storeys of five): a whole level,
  or any quarter tile for a `floor`, a `block` and a shape. `rot`: quarter
  turns clockwise seen from above; `0` rises or faces south.
- `height`: a `wall`, `glass`, `pillar`, `doorway`, `window` or `fence` of its own
  height, 0.5 to 40 tiles in quarters (a storey, 5, when absent; a fence 1.5): drawn,
  stood against and cut away at that height. A doorway's or window's
  opening keeps its size; the wall over it reaches the top. Setting the
  height of a whole selected building lifts each storey's floors, the
  storeys above and the roof with its walls.
- `material`: a name under `img/materials` without extension, or `""` for
  plain grey. Any material picker's last tile, **Your own picture…**, copies a
  picture from the computer into `img/materials` (with `<name>_normal` and
  `<name>_rough` beside it when they are there); the Resource Manager has the
  folder too.
- `thick`: a `pillar`'s thickness across, 0.1 (a pole) to 1 (a column a
  tile wide), 0.4 when absent. `rise`: a `roof`'s ridge over its eaves,
  0.25 to 6 tiles in quarters, 1 (a 45° gable) when absent; it is drawn,
  stood on and walked under at that pitch. Both are on the panel.
- `tint`: any piece's colour over its material (`#rrggbb`; white or none
  leaves it as it is): a red-painted wall without a red material. The
  panel's Tint sits under the material, for one piece, a part or a whole
  selection.
- `finish`: optional `mirror`, `chrome`, `polished`, `glossy` or `gold`,
  worn over the material; a `surface` (`reflect`, `gloss`, `metal`, `tint`,
  `texture`, as on a model) overrides it.
- `group`: pieces of one building share a number. Optional.

The Build bar's **Eraser** has its own Draw card (Brush, Line, Rectangle)
and an **Only** choice (Walls and openings, Floors and stairs, Roofs, Shapes,
Rocks): take the roof off a house, or the walls and keep the floor. A
selection's foot has **Duplicate** (Ctrl+D) beside Turn and Remove; a placed
shape's **Handles** card shows all its handles or only the arrows, the rings
or the size cubes; a shape in hand turns with Direction and steps Bigger or
Smaller (] and [). A door's Width is set before it is placed (it is the
opening it cuts), with a **Casing** material; a window frame takes a Frame
material. A floor's Size goes to 9×9.

In the Build bar a click lays a piece. The panel's **Draw** card says what
a drag does: **Brush** lays one on every cell it passes, **Line** a
straight run from where it began to where it ends, **Rectangle** the
rectangle between (Ctrl-drag draws one whatever is chosen): **Auto** fills
it with floors, blocks and roofs and lines its edge with the rest (a room of
walls), **Filled** and **Outline** say which. A wall, glass or block line
that runs off the grid's axes is one **Straight** wall from end to end (a
turned box, a tile thick, as tall as the wall in hand) or, **Stepped**, a
staircase of cells. The **Level** card (− and +, or Q and E) is where the
next piece goes; selected, it raises and lowers what is selected, as Q and
E do, and a placed piece's **Position** card moves it by typing. The
**Size** card sets a wall's, glass's or pillar's height, of one in hand, one
placed or every one in a selection. A **Window**, **Doorway**, **Glass** or
**Door** pointed at a wall goes into it, in place of the piece of wall
pointed at, keeping the wall's material, building and height: a window
where it is aimed (on a wall taller than a storey the wall below it stays),
a doorway from the wall's foot, a door with its doorway as wide as the door
along the wall. It looks out of the building, whichever side it is laid
from; dragged along a wall it goes into each piece passed. In a straight
(slanting) wall the wall is cut either side of the opening and the sill,
header and pane are turned as the wall is; a doorway there is two tiles
wide at least (one leaves no way through on the grid), and a door's leaf
hangs only in a wall along the grid. **Fences** join what is beside them:
a post in the middle and rails to each neighbouring fence, to a wall,
pane or pillar a run ends against, and to a fence on a diagonal when
neither cell between is fence, so a run turns its corners itself and a
Line of fence steps corner to corner. A fence laid by a drag turns to the
way it runs; only a fence standing alone shows the way it was laid. A **Wall**
pointed at a window, doorway or pane walls it up. Each slot shows its key
(1 to 0, the Eraser X). A right-click takes a piece off and a right-drag turns the view
(Shift-drag or the middle button moves it); R turns the piece in hand, and
Escape in Select with nothing selected leaves Build. A stair laid or turned
with its foot against a wall is said. The map bar's **Floors** list shows
the 3D view up to a floor (5 tiles each, counted from the ground), as the
game cuts away a roof over the player; it lists as many floors as the
map's tallest piece reaches, so a tower of 40 lists 40. While building,
the cut follows the level built at.

A material may have companions beside its image, each optional:
`<Name>_normal.png` (a normal map, OpenGL convention, green up),
`<Name>_rough.png` (roughness, white rough) and `<Name>.json`:

```json
{ "scale": 4.5, "gloss": 0.35, "reflect": 0.5, "normalStrength": 1.2 }
```

`scale` is the tiles one repeat of the image covers (absent: one a tile on
a piece, `5` on a rock); `gloss` (0-1) how smooth its smoothest parts are,
`reflect` (0-1) how much sky they mirror at a glancing angle, and
`normalStrength` (0-3) how deep the relief reads. Pieces, rocks and terrain
cliffs of that material take the relief from the map's sun (else a light
from above) and a sheen where the roughness map is dark. The pickers list
the material, not its companions.

### Doors and window frames

```json
{ "kind": "door", "x": 52, "y": 30, "z": 0, "rot": 0, "material": "Wood", "width": 3,
  "style": "plank", "hinge": "left", "swing": "away", "opens": "locked",
  "lock": { "item": 4 }, "message": "It's locked.",
  "sound": { "open": { "name": "door-open-02", "volume": 80, "pitch": 95 } },
  "frame": "Wood", "tag": "inn.front" }
```

A door hangs in a doorway (or a gap in a fence) across `width` cells (1-6),
starting at its own and running along its across: east when `rot` is 0,
south for 1, west for 2, north for 3. `rot` is the way its front faces.
`swing` `"away"` (the default) opens away from whoever opens it, so a door
pushed from inside swings out onto the street; `"in"` always opens away from
the front, `"out"` always toward it. An automatic door notices a walker early
enough (by their pace) to be clear of their way before they reach it, and a
leaf never sweeps through anyone: it stops short of a character in its way,
opens the other way when that side is clearer, and waits to close while
anyone stands between it and the doorway. `style`:
`plank` (boards, ledges, strap hinges, a ring), `panelled`, `arched` (an
arched head, the wall coming down over it), `double` (two panelled leaves)
or `gate` (fence high); a door three cells wide or more hangs two leaves.
`frame` is the casing's material (the door's own when absent). The wall comes
down to the door's head (an arched door's crown), so nothing crosses the
opening above an open leaf; `validate-map.cjs` reports anything that stands
in a doorway's opening (a rail, a sill, a shape) as "something crosses
doorway at x,y".

`opens`: `"auto"` opens for whoever walks up to it (the player, followers,
events) and shuts behind them; `"action"` opens and shuts with the OK button
facing it, and shuts itself a while after everyone has gone; `"locked"`
stays shut until its `lock` is met (`{ "switch": n }` on, or the party holding
`{ "item": n }`, which unlocks it for good), then behaves as `"auto"`. With no
`lock`, a script unlocks it. OK at a locked door, or walking into it, rattles
it; OK also shows its `message` (`"It's locked."` when absent, none when
`""`). Each of `sound.open`, `sound.close` and `sound.locked` is a sound
effect's `name`, `volume` and `pitch`; absent ones use `door-open-01`,
`door-close-01` and `door-locked-01` (a gate `gate-open-01` and
`door-close-02`), and an empty name is silence. Sounds fade with distance
from the player and pan with the camera. A shut door blocks like a wall;
an open one is its threshold. In the editor no door is ever shut against a
walker.

A script reaches a door on the player's map by piece id or tag:
`Reactor3D.Doors.open("inn.front")`, `close`, `lock`, `unlock`, `isOpen`,
`isLocked`. A lock or unlock is kept in the save; open and shut are not: a
map entered by a transfer or a loaded save has its doors shut, except one the
leader stands in. Back from the menu or a battle on the same map, each door is
as it was left. The runtime feed sends `doorOpened` and
`doorClosed` (docs/RUNTIME-EVENTS.md).

A window may wear a frame:

```json
{ "kind": "window", "x": 40, "y": 12, "z": 0, "rot": 2, "material": "Stone",
  "frame": { "style": "cottage", "material": "Wood", "shutters": "#3f5f3a", "closed": false, "flowerBox": true } }
```

`style`: `cottage` (six small panes a cell), `two` (a sash bar), `arched`
(an arched head) or `plain`. `rot` points its outside: the sill and lintel
band stand out on that face, open shutters fold back against the wall either
side, and the flower box hangs under the sill. Framed windows side by side at
one level and turn are one window: one sill, one pair of shutters, a mullion
between cells. In the Build bar the Door slot hangs a door in the doorway
clicked (a run of doorways gets one door across it), and the Door and Window
cards set all of the above.

Rules the engine applies, so a generator can predict them: a character
stands on the top of the lowest stack reachable from where it already is,
so a floor over a room is a ceiling from below and a floor from the stairs;
a step higher than 0.75 tile is blocked, which is what makes a wall a wall
and a stair a stair; a doorway is walked through at its own level; a stair
climbs one tile per cell, so a storey is five stair cells.

## Built structures

What Database › Structures › **Build** saves: the structure's plot and what
stands on it, built in the workshop with the map's own Build bar (the plot
opens in the 3D view; Save writes the file). Pieces are in the plot's own
cells and take the fields of a map piece (see Pieces) without `id` or
`group`; `lights` and `surfaces` are the map's light and media-surface rows,
at plot coordinates. A stamp moves all of it to the stamp's corner, turns it
with the stamp (cells and facings a quarter turn, shapes by `angle`, lights
and screens about the plot) and marks it as the building's.

```json
{
  "name": "Shed", "size": [10, 8], "storey": 5, "height": 2,
  "pieces": [
    { "kind": "floor", "x": 4, "y": 5, "material": "Wood" },
    { "kind": "wall", "x": 3, "y": 2, "z": 1, "rot": 1, "material": "Stone" },
    { "kind": "cylinder", "x": 6, "y": 2, "z": 0.5, "size": [2, 3, 2], "angle": 30 }
  ],
  "lights": [{ "type": "point", "x": 5.5, "y": 4.5, "height": 2.5, "radius": 4, "color": "#ffcc88" }]
}
```

`size` is the plot in tiles and `height` its floors (of `storey` levels
each); the workshop keeps building inside them. A described plan (below)
opened in the workshop is built out into pieces, and saving it keeps the
pieces.

### Saving what is on a map as a structure

Anything built on a map can be kept as a structure and stamped again
anywhere. In Build › Select, click a piece and **Select whole building**
(or double-click the piece): a stamped building takes its whole group, a
hand-built one every loose piece touching it, rocks aside (a rock is the ground's; clicking one takes the rocks touching it); a box dragged on the ground
selects everything in it. **Save as structure…** on the selection names
it and writes `3d/Structures/<Name>.json` (with a `.png` picture of it),
which Database › Structures and the Blueprint slot list at once. It holds
the selected pieces and what stands in the box they cover:

- `lights` and `surfaces` as above (not the sun or a light riding a character);
- `props`: placed models, in the plot's cells, as the map's `props` rows;
- `water`: sheets wholly inside the box (a fountain, a garden pond), the
  box and mask in plot cells and `level` above the ground it stood on;
- with **Bring the events inside as its people**, each event in the box as
  a template under `3d/Structures/events` and a spot (`spots`, `events`),
  so a stamp places them where they stood (People at spots, below);
- `description`, the note typed with it.

A stamp levels the ground under the plot, puts the water at its height
above that, and marks the models and water with the building's group, so
moving, turning or removing the building takes them along. **Make the
selection one building of it** turns the original into a stamp of the new
structure (one undo step); Rebuild from plan then follows later edits of
the file. A name already taken asks before replacing that structure.
Foliage is not saved with a structure.

From a shell, a box of a map:

```
node editor/build-scripts/save-structure.cjs <project> <mapId> <x0> <y0> <x1> <y1> <name> [--events] [--note "text"] [--force] [--check]
```

## Structure plans

A building as a person describes it. Everything else is derived.

```json
{
  "name": "Cottage", "size": [14, 10], "storey": 5,
  "materials": { "wall": "Stone", "inner": "Plaster", "floor": "Wood", "wet": "Stone", "roof": "RoofTile", "stair": "Wood" },
  "floors": [
    { "rooms": { "hall": [1, 1, 6, 8], "kitchen": [8, 1, 12, 8] },
      "doors": [["hall", "outside", 3], ["hall", "kitchen", 3]],
      "wet": ["kitchen"] },
    { "rooms": { "landing": [1, 1, 6, 8], "bedroom": [8, 1, 12, 8] },
      "doors": [["landing", "bedroom", 3]] }
  ],
  "stairs": [{ "floor": 0, "from": [5, 7], "dir": "north", "width": 1 }],
  "roof": { "pitch": 2 },
  "windows": { "every": 6, "width": 2 }
}
```

- `rooms`: `[x0, y0, x1, y1]`, inclusive, in the plan's own cells. Walls
  grow on the cells beside a room that no room claims, so leave one cell
  between rooms and one round the building; the rest of the plan's `size`
  is open ground, and a floor with no rooms builds nothing. Walls can be
  thicker; doors cut through whatever thickness.
- `doors`: `[roomA, roomB, width]`, centred on the wall the two rooms share,
  or `[roomA, roomB, width, at]` to put the door where the plan says: `at`
  is the position along the wall (the x of a wall that runs east to west,
  the y of one that runs north to south), clamped so the door stays in the
  wall. `"outside"` is the wall beside the room that faces open ground,
  south first, then north, east, west; a fifth entry names the side:
  `["hall", "outside", 3, 5, "east"]`.
- `windows` on a floor: `[[x, y], ...]` outer wall cells with a window
  each, beside whatever the plan's window rhythm places along the building. A rhythm of
  `every: 0` leaves only the windows placed by hand.
- `stairs`: `from` is the bottom step's cell, `dir` the way it climbs, one
  cell per tile of rise; the floor above is left open over the run.
- `roof`: ramps step up `pitch` rows from each eave, a flat top between,
  gables closed with blocks. `style: "flat"` is a flat top with a parapet;
  `style: "shed"` is one slope rising `pitch` levels to `high` (`north`
  unless said, or `south`, `east`, `west`), a wedge of wall under a slab
  of roof with eaves. `windows`: a pair every `every` cells along
  the outside, never beside a door.
- Floor is laid under every doorway and wall cell as well as every room,
  and a ceiling over every top-floor room under the roof.
- A door hangs in every doorway: outside doors `plank`, inner ones
  `panelled`, all `"auto"`, in `materials.door` (`Wood` when absent) with a
  `materials.frame` casing. `"door": { ... }` on the plan gives them all
  their settings, a door entry's own last element (an object) its own:
  `["hall", "outside", 3, 5, "south", { "opens": "locked", "lock": { "switch": 7 } }]`;
  `false` there, or `"doors": false` on the plan, leaves an open doorway.
- Windows wear a frame: `"windows": { "every": 6, "width": 2, "frame":
  "cottage", "shutters": "#3f5f3a", "flowerBox": true }` (`frame: false` for
  none; `flowerBox` on the ground floor, `"all"` on every floor), in
  `materials.frame`.
- A room may wear its own materials: `"materials": { "hall": { "floor":
  "Stone", "wall": "Wood" } }` on the floor. The floor is the room's; the
  wall applies to inner walls that touch the room (the first neighbouring
  room that says wins), never to the outer wall, which stays the building's.

### Plans of plans

A plan can be made of other plans, so a hamlet is one page and a city is
districts of hamlets:

```json
{
  "name": "Hamlet", "size": [64, 48], "storey": 5, "floors": [],
  "materials": { "path": "Sand" },
  "parts": [
    { "name": "north", "plan": "Cottage.json", "at": [4, 4], "rot": 0 },
    { "name": "east",  "plan": "Cottage.json", "at": [40, 6], "rot": 1 }
  ],
  "paths": [[9, 16, 10, 31], [9, 23, 45, 24]],
  "spots": { "start": [9, 20], "well": [27, 20] }
}
```

- `parts`: sibling files under `3d/Structures`, each at a corner `at` in
  the plan's cells, turned `rot` quarter turns, grown `scale`. A part may
  carry `materials` of its own, laid over the plan's, so one cottage file
  stands as stone here and timber there. A stamped
  plan of parts is one building: it moves and turns as one.
- `paths`: paved strips `[x0, y0, x1, y1]` (floor slabs of the `path`
  material, or a fifth entry naming one).
- `shapes`: `[{ kind, at: [x, y], z, size: [w, h, d], angle, tilt, roll,
  offset: [ox, oy], sides, taper, material }]`, the free pieces on a plan:
  `box`, `wedge`, `pyramid`, `prism`, `hull`, `spike`, `cylinder`, `capsule`,
  `tube`, `cone`, `dome`, `sphere`, `dish`, `fin`, `arch`, `tunnel`, `ring`.
  A `hull` and a `spike` are sided prisms fitted to their box (`sides` 3..32,
  four sides is a box) whose top is `taper` as wide as their bottom (0 a
  point, 1 straight; a hull wears 8 and 0.8, a spike 6 and 0); a `capsule` is
  a column with domed ends, a `dish` a shallow bowl, a `fin` a swept plate
  standing on its root with a tip `taper` as wide (0.4). A ship is hull
  segments end to end, capsules for engines, fins rolled flat for wings, a
  dish on a spike for a sensor. `at` is the cell under the shape's middle and `offset` a
  nudge of the middle within it (tiles, -0.5..0.5); `z` (quarter tiles) is
  where its bottom sits; `angle` turns it about the vertical, `tilt` and
  `roll` about its own middle, and a turned shape rests on its lowest corner,
  so a rolled cylinder lies on the ground. A tower is a `cylinder` five across
  and eight tall with a `dome` at `z` 8 on it; a tent is a `cone`; a corridor
  a `tunnel` with an `arch` at each end. A tube, a ring, an arch and a tunnel
  are hollow: only their walls block, so they are walked into and through.
  `material` falls back to the wall's. A quarter turn of the plan adds ninety
  degrees and turns the offset; tilt and roll are the shape's own and stay.
  A `cylinder`, `tube` or `ring` may go part way round: `sweep` in degrees,
  the arc centred on the shape's back so the opening faces forward (a tube
  swept 230 is a horseshoe deck, a thin tube segment a curved console); a
  `tube` or `ring` may have a `thick` wall (a fraction of its half width;
  a rail is 0.04). Steps of up to three quarters of a tile are walked, so a
  raised deck 0.7 tall is walked up onto with no stair.
- `effects`: `[{ name, type, at: [x, y], z, ... }]`, what the building
  shows, the way a model's effects are attached: a `screen` (a media surface
  on a wall: `facing` the room, `width` and `height` in tiles, `media` a
  movie under movies/ or a picture under img/pictures), a `light` (`color`,
  `radius`, `intensity`, a map light) or an `animation` (a database
  `animation` id, played over and over on a parallel event). A stamp writes
  them onto the map marked with the building's group; a re-stamp or a
  removal takes only its own. `roof: { pitch: null }` is a building with no
  roof at all. Materials named `Glass…` draw see-through and `…Glow` draw
  lit from within, with no image needed (without one a `…Glow` shines a colour
  read from its name: `LampGlow` warm, `ForgeGlow` orange, `ScreenGlow` cyan); every window gets a pane of
  `materials.glass` (`Glass` unless the plan says).
- `spots`: named cells. A stamped building keeps them in its record as
  map cells, prefixed by the part's name (`north.bed`), so a story can
  say "the innkeeper stands at `inn.counter`". A plan of parts is walked
  from its `start` spot.

### People at spots

```json
"spots": { "desk": [52, 25] },
"events": [{ "spot": "desk", "name": "Steward", "template": "villager", "direction": 2 }]
```

`template` names a file under `3d/Structures/events` holding an ordinary
RPG Maker event (its pages are used; id, x and y are not). Stamping puts
the event on the map at the spot with `<structure:N><spot:name>` in its
note. Move or turn the building and the event moves with it; edit its
pages by hand in the event editor and the edit stays through a re-stamp,
because the event is found by its tag, not made again. Remove the
building and its events go. A part's events keep the part's prefix
(`north.table`).

Stamp it from a shell, which levels the ground under it, moves placed
models off the footprint, and reports which rooms the engine can walk to
from the front door:

```
node editor/build-scripts/build-structure.cjs <project> <mapId> <plan.json> <x> <y> [--check]
```

`--check` writes nothing. To check a whole map at any time:

```
node editor/build-scripts/validate-map.cjs <project> <mapId>
```

which reports pieces off the map, materials with no image, models standing
inside a building, rooms that cannot be walked to, uneven ground under a
building, and the piece, triangle, model and light counts. A room reported `MISS` means the plan has a door
into a wall or a stair that lands nowhere; fix the plan, not the pieces.

In the editor the same plan is a card on Database › Structures and a
choice in the Build bar's Blueprint slot, which stamps it where you click;
Select picks pieces up again, and a box dragged round a building selects
all of it to move or turn. A building keeps its plan in
`structures: [{ group, plan, x, y, rot, scale }]`, and turning or scaling
builds it again from the plan. Models standing on the plot are moved off
it, and the bar says how many. **Editing a stamped building by hand
detaches it from its plan**: the hand edit stays, the building still moves
and turns as one, scale is off.

## Water

```json
{ "x0": 8, "y0": 30, "x1": 20, "y1": 40, "level": 0.4, "material": "Water" }
```

A sheet over the cells `x0..x1, y0..y1` (inclusive) at world height
`level`. The ground decides what it is: water up to the swim depth
(`reactorPhysics.swimDepth`, 2.2 tiles by default) is waded on its bottom;
deeper water is swum, entered from its bank or by a fall, and left onto a
bank no more than a step above the surface. With swimming off, water
deeper than 0.45 tile cannot be walked into. So a lake is terrain lowered under a sheet, a beach is the slope at
its rim, and a river is a long thin sheet over a trough. `material` is an
image under `img/materials`; the runtime waves it, tints it by depth and
fades it out at the shore. Optional `reflect` and `gloss` (0-1) and `tint` (`#rrggbb`) make it mirror the
world through its waves: `reflect: 1, gloss: 0.92, tint: "#d8dde3"` is mercury. Pour and River show the
liquid they lay (its kind, colour and image, any material) and set it; Look with no sheet selected sets it
too, and with one selected changes that sheet, its image included. River takes a Flow (0 still to 4), and
**Take off last point** (Backspace) steps back along the course. A pond selected in Look has a **Level**: lower it for
a shallow pond (it is filled again from its deepest cell, its look kept), or **Fill to the rim**, the highest it
holds before it spills.

### Rivers and waterfalls

```json
{ "x0": 20, "y0": 140, "x1": 120, "y1": 175, "mask": "…", "material": "Water",
  "path": [[25.5, 170.5, -4.91], [60.5, 172.5, -5.2], [110.3, 155.8, -5.6], [112.7, 154.2, -13.94]],
  "flow": 1, "level": -4.91 }
```

A sheet with a `path` is a river: its centre line, upstream first, in tiles
(a cell's middle is x + 0.5), with the surface's height at each point.
The surface follows those heights, smoothly round bends and changes of
slope, and the image runs downstream, faster where it drops, white where
it is fast; it is clear over the shallows and dark where it runs deep. A stretch dropping more than a tile per tile of run is a
waterfall: a falling curtain from its lip to its foot, foam, spray and mist where it lands.
`flow` (0-4, default 1) scales the current; 0 is still. `level` is the
path's highest point, for older readers. The mask says which cells are wet,
as for a pond.

In the game a river carries a swimmer downstream (and a wader where it runs
fast) while they take no step of their own, and a waterfall is gone down,
never swum up. Where a river runs into a lake the lake draws the water.

The Build bar's **River** slot lays one: click along the course, upstream
first, then double-click or press Enter (Esc drops the course). It carves
the channel (Width across, Depth under the surface), starts a little under
the ground at the first point or at the level of a lake it starts in,
follows the ground down and never up, falls where the ground drops, and
ends at the level of a lake it runs into. One undo takes the river and its
channel back. The same from a shell:

```
node editor/build-scripts/carve-river.cjs <project> <mapId> <course.json> [--width 3] [--depth 1] [--flow 1] [--material Water] [--check]
```

`course.json` is `[[x, y], ...]`; points that all carry a level
(`[[x, y, level], ...]`) keep those heights. The channel only ever lowers
the ground, so rocks and pieces in its way stay: lay the river first, or
clear its course. `validate-map.cjs` reports a course that leaves the map,
runs uphill or has no wet cell.

## Terrain and elevation

`terrain` is a height at every tile corner, bilinear between; `elevation`
is a whole number per tile that the tile builder turns into terraces with
cliff faces. Both add. A generator writing hills should write `terrain`
and keep slopes under 0.75 tile per tile where characters must walk;
`build-structure.cjs` levels a building's pad itself. The Lower brush digs
no bank steeper than 0.7 tile per tile, so what it digs is walked into; a
deeper hollow takes a wider brush, or untick **Keep banks walkable** for a
moat, a pit or a canyon with sheer sides. **Flatten** levels under the brush,
along a **Line** (a level bed as wide as the brush) or over a **Rectangle**
(a pad for a building), to the height where the drag began, or to a height
typed or taken from the ground with **Pick**. Radius goes to 32 and Strength
to 2.

On a shaped map the room floor is laid from the sides as well as from
above where the ground leans, so slopes do not streak, and past a slope it
turns to rock:

```json
"room": { "floor": "!Grass-01", "cliff": "Rock", "cliffSlope": 40, "cliffTint": "#a99f93" }
```

`cliff` is an image under `img/materials` (absent: `Rock` when the project
has it; `""`: off), `cliffSlope` the angle in degrees where the change
begins (10-80, default 40), `cliffTint` a colour multiplied in as a rock
piece's `tint`, so terrain cliffs match the rocks beside them. In the
editor: Build bar › Terrain › **Ground** › Whole map › Steep Ground (the material
tile, with None; Tint; Starts At). With None, Tint and Starts At are off.
A flat map has no steep ground.

The room around the map (`height` and the `floor`, `walls` and `ceiling`
pictures under `img/parallaxes`) and the sky over it (`sky`, drifting by
`skyScrollX` and `skyScrollY` pixels a frame) are set in Build bar ›
Terrain › **Room and Sky**, shown on the view as they change.

## Getting up high

A character walks a rise of up to 0.75 tile, jumps onto anything up to its jump height plus that (2 tiles by default), and mantles a ledge up to its jump height plus its reach (4.25 by default): Jump while walking into it. The top must be level, with three tiles of room over it and nothing over the climber. A railing, a ridge or a pillar is not a place to stand. A roof is a place to be: a gable's pitch (45 degrees) and a slanted roof are walked; steeper than 45 degrees is not stood on. An eave within reach is mantled: Jump while walking toward it, a step or two before it. A one-storey eave is within reach from level ground; a two-storey one needs a `ladder` (one piece per level, turned to the wall) or something to climb from. A party member walks off the edge of a roof, a wall top or a crate when the fall is no deeper than the safe fall (6 tiles by default); a deeper one, and a cliff of the ground itself, takes a Jump. An event with `<climb>` in its note hops or mantles a ledge in the way of its route. In third person the camera rides over the roof the player stands on and never sits inside a roof: it rises over the tiles. Events more than three tiles below the player are not shown through the floor or roof the player stands on. Two ramps in a row are a slope walked. A climber's hands stay on the edge it takes and its body against the wall; what it carries is put away for the climb and comes back to the hand on top. In first person nobody is shown through a wall. The map view's **Edges** tick labels each edge of the tile under the pointer in the 3D view: Walk, Hop, Mantle, Climb ladder, Drop or Blocked, with the height and, when blocked, why (Too high, No room to stand, Something overhead, Too steep, Map edge). `ReactorPhysics.edge(mapData, x, y, d, height)` answers what a body can do at any edge (`walk`, `ladder`, `hop`, `mantle`, `drop` or `blocked` with a reason). Database › System 2 › Physics: Climb onto ledges within reach, Reach above a jump. In a Tactical battle a mantle costs 2 move, a ladder 1 plus one per 2.5 tiles climbed.

## Ground types

```json
"ground": { "types": [ { "name": "Beach", "material": "Sand", "tint": "#e8866a", "scale": 4, "bare": true, "paint": "0x812 9x3 5" } ] }
```

The room's floor is the map's own ground; `ground.types` paints others over it, up to 64 (types of one material share its picture on the GPU, so tints and scales of one material cost almost nothing). A type is a `material` (an image under `img/materials`, with its `_normal`/`_rough` maps and `.json` when it has them), a `tint`, a `scale` (tiles to one repeat; absent: the material's own, else 4), `bare` (nothing grows on it) and `paint`: a level 0-9 per cell, row by row, as runs. A later type lies over an earlier one. Borders wander, and a half-strength paint reads as patches. On slopes a type turns to the room's cliff as the floor does. In the editor, a road or a path is Build bar › Terrain › **Path**: drag
along the way it goes (**Brush**) or from one end to the other (**Line**),
or click points and it bends through them (**Curve**: click the last point
again, press Enter or **Lay road** to lay it; Backspace or **Take off last
point** steps back, Esc or **Cancel** drops it), choose its **Surface** (any of the project's materials, with a tint and a
scale; Dirt road, Cobblestone, Gravel path, Sand path and Paving as quick
picks, and the map's own grounds to paint more of one: a look is a ground
type made, bare, the first time it is used, and roads already laid keep
theirs when the look in hand changes) and its
**Width** in tiles, with a soft or crisp edge. It follows the ground up and
down hills and is laid all along the drag however fast the pointer moves.
With **Level the ground under the road** (on by default) the ground under it
is smoothed along its length and made flat across, easing back into the
hills at its edges, and Ctrl+Z takes back the road and the levelling as one;
the Eraser slot takes it away and Ground changes its look. A road of floor
pieces instead: Build › Floor with a **Size** of 2×2 to 5×5 (a Line of
floor is that wide), or one slab of any size from Shape › Box. Build bar ›
Terrain › **Ground** (Paint or Erase, + Add a ground from any material or a preset, the material tile, Tint, Scale, Nothing grows here; Radius, Strength, Soft edge, Coverage; Fill the whole map, and **Fill where…** by height, slope, nearness to water and a patchy edge, as `paint-ground.cjs` does). Its **Draw** card paints under the brush, along a **Line**, or over a **Rectangle** filled or outlined (as wide as the brush), and **Level the ground under it** (off by default) flattens a filled rectangle at its own height or smooths a line or stroke as a road is, in the paint's undo step. A rock capped with `"ground"` wears the type painted under it, and bushes are not stood on bare ground by the brush. **Dunes** raises wind-shaped ridges (Wind direction, Ridge spacing, Height). **Biome** sets a map's ground, cliff tint, plant colors and water together (its switches leave the plants already planted, the water or the cliffs as they are); **Save this map's look as a biome…** keeps the map's grounds, cliff tint, plant and water colors in `data/Biomes.json` (`{ "biomes": [ { name, base, grounds, cliffTint, palette, water } ] }`), listed under Your biomes with a button to take each out. **Rock** is in the Terrain group. By rule:

```
node editor/build-scripts/paint-ground.cjs <project> <mapId> <spec.json> [--check]
node editor/build-scripts/make-ground-materials.cjs <project> [--force] [--only Name,Name] [--size 256]
```

`spec.json` names `types` and `fill` jobs (`type`, `level`, `where`: `rect`, `polygon` or `all`; `rules`: `maxSlope`, `minSlope`, `minHeight`, `maxHeight`, `nearWater`, `awayFromWater`, `nearPieces`, `awayFromPieces`, `noise`). A beach is `{ "type": "Beach", "where": { "all": true }, "rules": { "nearWater": 3 } }`. `make-ground-materials.cjs` also writes `<Name>_rough.png` for the grounds with a sheen (Alien-Crystal, Alien-Chitin).

## Beyond the border

`surround` in a map's sidecar is what is seen past its border; nobody walks there.

```json
"surround": { "style": "continue", "distance": 160, "rough": 0.5, "edges": { "south": "ocean" } }
```

`style`: `continue` (the border's heights carried out into hills), `ocean` (the land falls to a shore and water runs to the horizon), `mountains`, `plateau` (the edge drops to a far floor), `void` (a floating island with a rock underside) or `none`. `edges` names another style for `north`, `east`, `south` or `west`. `distance` is the reach in tiles (24-320; 160, or 96 on weak graphics, when absent), `rough` 0-1 how hilly, `seed` which hills, `level` the sea's surface (absent: the lowest water at the border, else just under the lowest ground), `height` the mountains', `drop` the plateau's fall and the void's depth, `haze` 0-1 how far the far land fades into the sky. The land wears the room floor and the ground painted at the border. In the editor: Build bar › Terrain › **Beyond the Border**, on a 3D map (the six styles as pictures; Distance, with Automatic; Hills; under Advanced a style per side, Seed and the numbers the chosen styles use). A style picked after Nothing keeps the distance, hills and numbers the map had. On weak graphics the panel says how far that computer shows when the distance is past it. A map with no floor shows nothing past its border. The Surroundings tick in the map view hides it; the panel then offers to show it.

### Neighboring maps

`neighbors` in the same `surround` names the map past a side:

```json
"surround": { "style": "continue", "neighbors": { "north": { "map": 7 }, "east": { "map": 9, "shift": 12 } } }
```

The neighbor is shown and entered without a break. As a map starts, the maps past its borders are read in the background and their worlds built beside it, in place of each side's style: ground and paint, pieces, rocks, water, plants and placed models; then the maps past those, so two maps out stand in every direction and nothing on the horizon changes as the party nears a border. Walking or driving over the border then goes on in that map with no fade: the party, a ridden vehicle, its speed and the camera carry over, what stood ahead and behind stays standing, and only a map more than two maps away is let go. Where two neighbors' lands past their other sides meet (the land north of each, say), each eases over 40 tiles into hills both maps share, whatever style either chose. `shift` is the tile of this map the neighbor's first tile lies against (0 when absent). A neighbor shorter than the side leaves this map's own land along the rest of it. Only the map being played runs its events: a neighbor's events that stand as models within 48 tiles of the shared side stand still past the border before it is crossed (a parked vehicle does not pop in), and its other events and its lights wait until it is entered, so maps of one world should share a sun and an ambient light. A border reached before its neighbor is ready (a teleport to the border, a map still being read) is crossed with a fade, onto the nearest tile along the border that can be stood on. With the mouse, click the border tile the player stands on, facing out. A side with no neighbor is a border as before, an event's Set Movement Route never leaves the map, and nothing leaves by a border during a battle on the map. `Reactor3D.Neighbors.enabled = false` crosses every border with a fade and shows each side's own style.

For borders that read as one world: give both maps the same height along the shared border (the terrain is a grid of corners, and each border corner belongs to both), carry roads and painted ground across, and keep trees, rocks and buildings a few tiles back from the border. The Demo's Open Road (maps 8 to 12) is five maps in a row built this way, joined to North Haven's east side: ride out of the village by the east lane, or enter from the Reactor Room.

In the editor: Build bar › Terrain › Beyond the Border › **Neighboring Maps**, one map per side, on a 3D or a 2D map; a neighbor's **Shift (tiles)** is under its map. The 3D view shows each neighbor standing past its border and moves it as Shift changes. A 2D map is entered and left by its borders with the usual fade; in the game its view goes half a screen past a side with a neighbor, and the neighbor's ground (not its events) is drawn there. The editor's 2D view does the same, dimmed: it pans as far past the edge and shows the neighbor's tiles as last saved; nothing there can be painted or picked, and the map bar's Surroundings tick hides it. Saving a map writes the way back into each neighbor whose facing side names no map; a neighbor that already names one is left alone, so a one-way border is made by clearing or changing the way back on the other map.

## Foliage

```json
"foliage": {
  "wind": { "dir": 30, "strength": 0.6, "gust": 1 },
  "layers": [
    { "kind": "grass", "density": "0x812 4x6 7x3", "height": 0.8, "colour": "#4a7a30", "tip": "#b9c862", "vary": 0.25, "seed": 1 }
  ],
  "bushes": [ { "x": 41.5, "y": 30.2, "size": 2, "colour": "#3f6b2b", "bloom": "#f3c6dc", "tall": 1.2, "seed": 7 } ]
}
```

A layer is one `kind` (`grass`, `flowers`, `fern`, `reeds`) painted over
the whole map: `density` is a level 0-9 per cell, row by row, written as
runs (`0x812` is 812 cells of none, `7` one cell at level 7, trailing none
left off). Blades are not stored; the runtime grows them from the density
by a seeded scatter, on the ground where it is drawn, so they follow the
terrain. Nothing grows where a piece or a rock stands on the ground, under
water (reeds stand in water up to about 0.9 tile deep), or on a slope the
room draws as cliff. `height` is in tiles, `colour` the root and `tip` the
tip (as they read in daylight), `vary` how much each clump differs, `seed`
which scatter, `width` how thick each blade is and `lean` how far it leans
(both 1 for the kind's own; height up to 12 tiles); `flowers` also takes
`colours`, the petals to pick from.
Leave a key out for the kind's own look. A bush is a seeded mass of leaves
at `x`, `y` (tiles), `size` wide (0.4-8); `tall` makes it taller than wide,
`bloom` gives it blossom. A bush 1.4 or more wide blocks the cells it
covers; smaller ones are walked through. `wind` blows toward `dir`
degrees (0 east, 90 south) at `strength` (0-2), with `gust` rolling over
it; whoever walks through the grass bends it.

Three kinds are not Earth's: `bulbs` (a lit globe on a stalk; takes `colours` as flowers do), `tendrils` (fronds that curl and uncurl) and `crystals` (shards no wind moves, the one kind that stands on bare ground; `colours` makes each shard one of the list, dark at its root and pale at its point). Any layer takes `glow` (0-1): its own color shows whatever the light, strongest at the tip.

Plants painted with another look are a layer of their own: what is already planted keeps its look. The Foliage panel's
**Color** card (Color, Tips, Glow, petals or mixed shards, and quick colors from the palettes) and **Shape** card
(Height, Thickness, Lean, Variety; a bush's Size and Tall or squat) are for what is painted next. **Recolor** brushes the
look in hand onto plants already growing (as dense as they were; bushes take the leaves and blossom), **Pick** takes the
look of the plants clicked into hand, and **Whole map** › Recolor everything recolors every plant on the map from a palette.

In the editor the Build bar's **Foliage** group paints a kind with a brush
(size, strength, density; Erase thins it), stands bushes by click or
scatters them by drag, and sets the map's wind; each stroke is one undo
step. To fill a map by rule:

```
node editor/build-scripts/paint-foliage.cjs <project> <mapId> <spec.json> [--check]
```

where `spec.json` names fills (`kind`, `level`, `where`: a `rect`,
`polygon` or `all`; `rules`: `maxSlope`, `awayFromPieces`, `nearPieces`,
`awayFromWater`, `nearWater`, `noise` for natural patches), scattered
bushes (`where`, `count`, `size` [min, max], `spacing`, `rules`) and the
wind; the script's header has the full shape. Density thins with distance
from the eye (`Reactor3D.FOLIAGE_LOD`, less on weak graphics) and the
blades stay out of reflections.

## Time of day

The map's ambient (`lighting.ambient`, `lighting.ambientColour`; the
Lighting tool's Day, Dusk and Night presets) says what time it is, and a
sun follows it: as authored by day, lower and amber at a warm dusk, a dim
pale-blue moon at night that still casts. On a map with a sky image the
sky and the reflections of shiny surfaces darken and tint with it. A sun
that should keep its authored light whatever the hour says
`"daylight": "fixed"` (Lighting tool › the sun's Follows time of day).
Lamps, fires and Glow materials keep their own light, so they stand out
at night. A map with no sun and no sky (indoors) is unchanged.

A sun is directional. Where it stands and its radius say how far its light
reaches; its `yaw` and `pitch` say where the light comes from, aimed as a
spotlight is (yaw 0 shines south, pitch -40 shines down at 40 degrees). A
sun left level (pitch 0, as the Sun preset makes it) stands 50 degrees up,
and one also left at yaw 0 shines mostly east, so shadows fall beside what
casts them in a view facing north or south. A sun that follows the time of
day sinks to 18 degrees at dusk; the moon stands as high as the sun. The
brightest sun casts through its own shadow map round the player (the view
in the editor); a point in its shadow also loses part of the ambient, so
shade reads clearly by day and never goes black.

## What is not here yet

Furniture inside rooms, hip roofs, and a per-transfer floor (a transfer always lands on the ground
floor). Add them to this page as they land.
