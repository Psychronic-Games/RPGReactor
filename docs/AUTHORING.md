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
| Tile elevation (terraces, cliffs) | `MapNNN.r3d.json` › `elevation` (one whole number per tile) | Map Properties, height brush | — |
| Terrain (rolling ground) | `MapNNN.r3d.json` › `terrain` ((w+1)×(h+1) corner heights), `terrainWidth` | **3D-T** tab brushes | `editor/tests/terrain.test.cjs` rules |
| Room (floor, walls, ceiling, sky) | `MapNNN.r3d.json` › `room` | Map Properties › 3D | — |
| Pieces (the 3D tileset) | `MapNNN.r3d.json` › `pieces` | **Build** bar over the 3D view (the Build button in the toolbar); drawn as a plan on the flat map too | `validate-map.cjs` |
| Buildings from a plan | `3d/Structures/*.json` (project-wide), placed as `MapNNN.r3d.json` › `structures` | Database › Structures (a card per plan), Build bar › Blueprint stamps one | `build-structure.cjs --check`, and the page's own walk |
| Materials | `img/materials/*.png` (tileable) | swatches in the Build bar's specs panel | — |
| Water | `MapNNN.r3d.json` › `water` (a hollow's box, its `level`, a `mask` of the wet cells) | **3D-T** › Pour | `validate-map.cjs` |
| Placed models | `MapNNN.r3d.json` › `props` | **3D-M** tab | — |
| Lights | `MapNNN.r3d.json` › `lights`, `lighting` | Lighting tool | — |
| Events | `MapNNN.json` › `events` (RPG Maker data) | Event tool | — |

`MapNNN.json` stays ordinary RPG Maker data. Everything 3D is in the
sidecar `MapNNN.r3d.json`, so a project with no 3D maps has no sidecars.

In the editor, Database › Structures is a builder over these files: a new
plan is an empty page. Draw rooms on it, click walls for doors and windows,
put stairs and people down, pick a shape from the picker and click it down
(one placed on another sits on top), drag any of them, undo, pick a style,
and Apply writes the file back the way it was read. The Effect tool puts a screen on a wall,
a light or an animation on any cell; the preview plays the screens' media.
The eye button on the 3D view looks inside (the ceiling and roof left off),
on by itself for a building with no roof. A selected shape wears
handles in the 3D view: arrows move it (a face dragged near another shape's
face clicks onto it), rings turn, tilt and roll it, cubes size it (with the
lock, in proportion); the same numbers sit in the line under the plan, and a
click on a shape in the 3D view selects it.

The rules the engine applies to terrain, pieces and water (where the
ground is, what blocks a step, how deep the water stands) are in
`runtime/reactor_3d_world.js`, readable without three.js; the checks above
run the same code the game does.

## Units

A tile is one world unit. The bundled characters stand three tiles, so a
tile is about 0.6 m. A storey (`PIECE_STOREY`) is 5 tiles. Doorways default
to 3 cells wide (1.8 m); a front door is usually 4 to 6. Heights in the
sidecar are in tiles; positions are cells (integers) for pieces and
fractional tiles for models.

## Pieces

```json
{ "id": 12, "kind": "wall", "x": 30, "y": 49, "z": 0, "rot": 0, "material": "Stone", "group": 2 }
```

- `kind`: `wall` (a storey tall), `block` (one tile cube), `floor` (a slab),
  `pillar`, `stair` (rises one tile across the cell, toward its `rot`),
  `ramp` (same, a slope), `roof` (a one-cell gable), `doorway` (a lintel
  only: the opening is the whole cell, tile two side by side for a door),
  `window` (a sill and a header), `fence`; and the round pieces `dome`,
  `cylinder` and `cone`, which also carry `size: [w, h, d]` in tiles (the
  cell is the middle of the footprint) and `angle` in degrees. A round piece
  blocks every cell its footprint covers, as a wall of its height; nothing
  walks on it.
- `x, y`: the cell. `z`: the level the piece's foot stands at, in tiles
  above the ground, up to 120 (twenty-four storeys of five). `rot`: quarter turns clockwise seen from above; `0`
  rises or faces south.
- `material`: a name under `img/materials` without extension, or `""` for
  plain grey.
- `group`: pieces of one building share a number. Optional.

Rules the engine applies, so a generator can predict them: a character
stands on the top of the lowest stack reachable from where it already is,
so a floor over a room is a ceiling from below and a floor from the stairs;
a step higher than 0.75 tile is blocked, which is what makes a wall a wall
and a stair a stair; a doorway is walked through at its own level; a stair
climbs one tile per cell, so a storey is five stair cells.

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
  gables closed with blocks. `windows`: a pair every `every` cells along
  the outside, never beside a door.
- Floor is laid under every doorway and wall cell as well as every room,
  and a ceiling over every top-floor room under the roof.
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
  lit from within, with no image needed; every window gets a pane of
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
builds it again from the plan. **Editing a stamped building by hand
detaches it from its plan**: the hand edit stays, the building still moves
and turns as one, scale is off.

## Water

```json
{ "x0": 8, "y0": 30, "x1": 20, "y1": 40, "level": 0.4, "material": "Water" }
```

A sheet over the cells `x0..x1, y0..y1` (inclusive) at world height
`level`. The ground decides what it is: a cell whose ground is more than
0.45 tile under the level is deep and cannot be walked into; shallower is
waded. So a lake is terrain lowered under a sheet, a beach is the slope at
its rim, and a river is a long thin sheet over a trough. `material` is an
image under `img/materials`; the runtime waves it, tints it by depth and
fades it out at the shore.

## Terrain and elevation

`terrain` is a height at every tile corner, bilinear between; `elevation`
is a whole number per tile that the tile builder turns into terraces with
cliff faces. Both add. A generator writing hills should write `terrain`
and keep slopes under 0.75 tile per tile where characters must walk;
`build-structure.cjs` levels a building's pad itself.

## What is not here yet

Furniture inside rooms, rivers
that flow (a sheet has waves but no current), hip roofs, and a per-transfer floor (a transfer always lands on the ground
floor). Add them to this page as they land.
