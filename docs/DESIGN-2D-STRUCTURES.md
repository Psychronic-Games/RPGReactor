# 2D structures

Status: **built, 2026-11-22** (runtime 20261122.3). Tests: `structure-2d`, `image-layers-place`, `map-passage-overrides`. A 2D structure is the 2D side of Database › Structures: a building (or any piece of a map) made once on a phantom map and placed on 2D maps as often as wanted, beside the 3D structures in the same list.

## What the owner asked for

- Built on a phantom map, as a 3D structure is: Database › Structures › Build opens it, the map's own tools paint it.
- Any mix of tilesets, and pictures, as layers on it.
- Passability set right there, cell by cell: **X** (blocked), **O** (open) or **\*** (the character passes underneath: the cell's art draws over them, as a ☆ tile does). A structure of A3 pieces whose back a character walks behind is the case in point.
- Passability set on the structure (on its phantom map, and on its page in the Database), and honoured wherever it is placed.
- Placed on a real map as an object that keeps following its structure: change the structure's passability (or its art) in the Database and every map it stands on follows.

## The structure

A record in Database › Structures with `dimension: "2d"`, in its file under `3d/Structures` beside the 3D ones:

| Field | What it holds |
|---|---|
| `dimension` | `"2d"` |
| `name`, `size` | Its name; `[width, height]` in tiles |
| `layers` | Its layers, bottom first. A tile layer: `{ kind: "tiles", name, tilesetId, tiles }`, `tiles` the six map layers of the plot (`width × height × 6`, as a map's `data`). A picture layer: `{ kind: "picture", name, picture, at: [x, y], opacity }`, `picture` in `img/pictures`, `at` in pixels from the plot's corner. |
| `passage` | `{ "x,y": "X" \| "O" \| "*" }`; a cell left out follows its tiles |
| `surfaces` | Media surfaces on the plot, as a 2D map holds them |
| `baked` | What a placement copies, written at each save: `{ below, over, cells }`: the names of the two pictures in `img/parallaxes/structures/` (one drawn below the characters, one above them), and every cell's passability worked out |

Saving bakes the layers into the two pictures. A cell marked **\*** goes, with everything on it, into the picture above the characters, and so does a tile its own tileset marks ☆. Every other cell goes below. The pictures' names carry a hash of what they show (`Inn-3f9a2c-below.png`): a changed structure writes new files, and the maps it stands on take them the next time the editor applies it.

Each cell's passability is worked out at the save: **X** blocked, **O** and **\*** open; a cell with no mark follows its tiles by their own tileset's flags (the top tile that decides, as `Game_Map.checkPassage` reads them). A cell with nothing on it leaves the map's own passability alone.

## The phantom map

The plot is a 2D map of the structure's size, never saved as a map. A **Layers** panel beside it lists the structure's layers:

- The layer being painted is the plot's own tiles, with its tileset in the palette. The other layers show as pictures under or over it.
- **+ Tile layer** uses the tileset chosen above it; **+ Picture layer** adds a picture from `img/pictures`, placed by its X and Y (pixels from the plot's corner) and opacity.
- A layer can be moved up and down, hidden while painting, renamed and removed.
- **Passability** turns the plot's clicks into marks: **X**, **O**, **\***, or none. The marks show over the plot as the Passage view does.

## On a map

**Use on the map** (Database › Structures) places it: a preview follows the pointer, and a click puts it with its top-left corner on that tile. A placed structure is an object of the map's own, `$dataMap.rrStructures2D = [{ id, file, at: [x, y] }]`: a right-click on it while placing removes it as one, and one undo takes a placement or a removal back.

What the game reads is made from that list and the structures as they are now (`RRStructure2D.apply`), when a structure is placed, moved or removed, when the map opens, and when a structure is saved:

- each placement's two pictures as image layers, `fit: "place"`, `at: [x, y]`, below the characters on `ground` and above them on `over`, tagged `structure2d: <id>`;
- its worked-out passability in `$dataMap.rrPassage`, offset to where it stands (a later placement over an earlier one wins);
- its media surfaces, moved the same way and tagged the same.

The map's own image layers and surfaces are left as they are. A game build needs nothing more: the map file holds what it draws and how it is walked.

## In the game

- **Image layers:** a layer with `fit: "place"` draws its picture at its own size with its top-left corner on tile `at`, moving with the map.
- **Passability:** `$dataMap.rrPassage` (`{ "x,y": 1 | 2 }`: 1 open, 2 blocked) is read before the tiles. An open cell can be entered and left in every direction; a blocked one in none. The editor's Passage view shows the same.

## Limits

- A plot is at most 64 × 64 tiles: it is drawn at 48 pixels a tile into two pictures (3,072 pixels a side).
- A cell without a mark is open or blocked as a whole: a tile that blocks only some directions (a fence) counts as open. Mark it **X** where that matters.
- Placed structures show on maps seen in 2D. A map shown in 3D does not draw image layers that lie on the map.
