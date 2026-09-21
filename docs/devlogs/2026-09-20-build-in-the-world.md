# RPG Reactor devlog: Build the World With Your Hands

RPG Reactor is a free, open-source game engine and editor that runs your RPG Maker MZ and MV projects as-is, then adds what RPG Maker never had. Same data files, same plugins, no conversion.

The last release put 3D models on the map. This cycle puts a builder in your hands.

## Build in the map, not in a form

Press Build and a bar appears along the bottom of the 3D view: floor, wall, doorway, window, glass, stairs, ramp, roof, pillar, fence, block. Pick one, a ghost follows your cursor and snaps to what is already there, click to place. Drag for a row, hold Ctrl for a room. R turns the piece, Q and E take you up and down a level, the hammer knocks anything off, and Ctrl+Z takes it all back. Every piece wears a material you choose from swatches, and any tileable image you drop into the project is a material.

Press Select and anything you built is yours again: paint it, move it, turn it, delete it. Drag a box around a whole house and move the house.

## Shapes

Sixteen shapes join the pieces: boxes, wedges, prisms, hulls, spikes, cylinders, capsules, tubes, cones, domes, spheres, dishes, fins, arches, tunnels and rings. Each one has a size, a turn, a tilt and a roll, with arrows, rings and size handles right on the shape. Name a material Glass and it is translucent. End one with Glow and it lights itself. A starship corridor is a tunnel. A radar is a dish on a spike.

## Blueprints

A building you like is a blueprint. Database > Structures lists them as cards, and every one is a plain JSON file: rooms, doors, windows, stairs, roof, the people standing in it, the screens on its walls. Stamp a blueprint anywhere from the build bar and the whole thing arrives at once, people included. Blueprints can hold other blueprints, so a hamlet is a plan of cottages and the paths between them.

## Ground and water

Terrain brushes raise, lower, smooth and flatten rolling ground straight in the 3D view. Water is poured, not painted: point at a hollow, a ghost shows what will fill, click and the water rises to the rim. Two hollows are two ponds. The water has waves, a shore where the ground meets it, and shallows you can wade through.

## Walk inside

Step under a roof and it lifts away, along with any floor above you, and the sliced walls get a proper top. A wall between the camera and your party goes see-through, and it does the same for your followers and the people in the room, so nobody vanishes behind a partition. Climb the stairs and you are on the second floor, and the stairs only climb along their run, so you never drift up them by accident.

## Lights and screens where you build

Lighting and Media Surfaces now dock beside the map instead of floating over it, and the build bar opens them with its own Light and Screen slots. A new Sun light throws one set of long shadows over the whole map.

## Also this cycle

Four new ways for an enemy to die: Ash, Ember, Wisp and Shatter, with 3D battlers dissolving in a battle room. A held weapon can be drawn behind its holder. Class curves work to the level your party actually reaches, in the RPG Maker curve dialog. Enemy action conditions can name several states. Music sequences have a library. And a long list of fixes, two of them from the community: buff stack strength and a state's icon picker, and a group of identical enemies no longer freezes the game when they collapse together.

## Try it

All of this is in the source now at <https://github.com/Psychronic-Games/RPGReactor> and lands in the next release, 0.98.7. Download the current release free at <https://psychronic.itch.io/rpg-reactor>, or try the browser editor right on the page.

Open the demo, walk into the manor, and climb the stairs. Then build your own.
