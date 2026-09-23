# RPG Reactor 0.98.7: Build the World by Hand

A quieter update than the last two, and a big one under the surface: 0.98.7 puts a world builder in the map view. Walls, floors, stairs, shapes and whole buildings go down with a snapping ghost, water pours into the hollows you dig, and the party walks inside what you built.

RPG Reactor is a free, open-source RPG editor and runtime for RPG Maker MV and MZ projects. Same data files, same plugins, no conversion. Everything here is optional: a 2D project stays a 2D project until you switch a map to 3D.

## A build bar over the 3D view

Press Build and a bar of pieces appears: floor, wall, doorway, window, glass, stairs, ramp, roof, pillar, fence, block. A ghost follows your cursor and snaps to what is there. Click to place, drag for a row, Ctrl-drag for a room, R to turn, Q and E for the next level up or down, the hammer to remove, Ctrl+Z to undo. Every piece wears a material, and any tileable image in the project is one.

Select picks anything up again: paint it, move it, turn it, delete it. Box-select a whole house and move the house.

## Shapes and blueprints

Sixteen shapes, from wedges and domes to hulls, dishes, arches and rings, each with a size, a turn, a tilt and a roll and handles on the shape itself. A material called Glass is see-through and one ending in Glow lights itself.

A building you like is a blueprint: a card in the database and a plain JSON file with its rooms, doors, stairs, roof, people and screens. Stamp it anywhere from the bar. Blueprints can hold other blueprints.

## Ground and water

Terrain brushes raise, lower, smooth and flatten the ground in the 3D view. Water is poured: point at a hollow, see what will fill, click, and it rises to the rim. Waves, a shore, and shallows you can wade.

## Walking inside

Under a roof, everything above your floor is cut away and the sliced walls get a proper top. A wall between the camera and anyone in your party goes see-through. Stairs take you to the second floor and only climb along their run.

## Also

- Lighting and Media Surfaces dock beside the map, and the build bar opens them.
- A Sun light with long shadows across the whole map.
- Enemies can die as Ash, Ember, Wisp or Shatter, and 3D battlers dissolve in a battle room.
- Class curves work to the level your party reaches, in the RPG Maker curve dialog.
- Two community fixes: buff stack strength, and identical enemies collapsing together no longer freeze the game.

## Try it

Download free at https://psychronic.itch.io/rpg-reactor or try the browser editor on the page. Source at https://github.com/Psychronic-Games/RPGReactor. Open the demo, walk into the manor, and build something next to it.
