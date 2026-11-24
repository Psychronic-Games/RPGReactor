# Getting started: your first map, event and playtest

This short walkthrough takes you from a fresh editor to a scene you can play: a
small painted map, a character who says a line when you talk to them, and a
playtest. You do not need to write any code.

If the editor is not installed yet, get a pre-built copy from <https://psychronic.itch.io/rpg-reactor>,
or follow [Run From Source](../README.md#run-from-source) in the repository README.

## 1. Create a project

1. Choose **File > New Project** (`Ctrl+N`).
2. Pick **Reactor One** to start from the bundled sample, or a **blank project**
   to start empty. Reactor One is a starter and a compatibility showcase rather
   than a complete game, but it comes with maps, art and actors to look at while
   you learn. A blank project is fine too if you would rather build everything.
3. Choose where to save it and give it a name, then create it. The editor opens
   the new project on its first map.

Save as you go with **File > Save** (`Ctrl+S`).

## 2. Paint a small map

1. Open **Map 1** in the map tree on the left if it is not open already.
2. In the tile palette, pick a tileset (ground tiles are usually in the A/B
   sheets) and click one tile. If the palette is empty, open the map's
   **Properties** and choose a tileset first.
3. Select the **Single Tile Tool** (the pencil) in the toolbar and click or drag
   on the map to paint. The **Rectangular Area** and **Circular Area** tools fill
   shapes, **Fill** pours a tile over a whole area, and **Erase Tiles** takes
   tiles away. Four tile layers are available: put
   ground on the lowest and things that should draw above the player on a higher
   one.
4. Paint a small open area with room to walk around. That is all the art this
   tutorial needs.

`Ctrl+Z` and `Ctrl+Y` undo and redo a stroke.

## 3. Add a character who talks

1. Click **Event Manager** in the toolbar to switch to event mode, then double-click an empty tile where you
   want the character to stand. The event editor opens with a new event.
2. Name it something like `Guide`. Under **Character Graphic**, choose a character sprite
   from the project's character sets so you can see who is speaking.
3. In the command list, add a **Show Text** command (one of the message
   commands). Type the line the character should say, for example
   `Hello! Welcome to my little world.` Press **OK** to close the command.
4. Press **OK** on the event editor to place the character on the map, then press
   `Ctrl+S` to save.

Double-click the event again to edit it; `Delete` removes a selected event.

## 4. Set the starting position and playtest

1. Open **Database > System 1**. For the **Player** start location, click the
   location button and pick a tile on your map in the picker; the Map/X/Y fields
   work too. This is where the hero appears when a new game starts.
2. Press **Ctrl+R** to launch a playtest. A separate game window opens.
3. Walk up to your character and press **Enter** (or **Z**) to talk. The line you
   typed should appear. Close the message and stop the playtest when you are
   done.

Start a new playtest after changing project data; one that is already running
does not pick up edits made while it is open.

## Next

- [Editor README](../editor/README.md): shortcuts, project structure and the full feature list.
- [Authoring a world](AUTHORING.md): where maps, events and 3D parts live.
- [Documentation index](README.md): every guide in this folder.
