# Steam achievements and Workshop

RPG Reactor's own achievements, and the Steam Workshop in the Forge. (Steam for games made with RPG Reactor, under their makers' own App IDs, is [STEAM-FOR-GAMES.md](../STEAM-FOR-GAMES.md).) The code is in `editor/src/steam/` and `editor/src/forge/Workshop/`; Steam is used only when Steam starts the editor (or `RR_STEAM=1` with the Steam client open).

## Achievements

Set up in Steamworks > App Admin > Stats & Achievements > Achievements, then published. The API name must match exactly; the editor unlocks it where the last column says.

| API name | Name | Description | Earned when |
|---|---|---|---|
| `NEW_PROJECT` | A Blank Page | Create a new project. | File > New Project succeeds |
| `FIRST_PLAYTEST` | It Runs! | Playtest your game. | a playtest window opens |
| `MAP_3D` | A New Dimension | Open a map in 3D. | the 3D view comes on |
| `PROJECT_IMPORT` | Welcome Home | Import a project made in another editor. | an import finishes |
| `FORGE_CHARACTER` | Character Smith | Add a character from the Forge to your project. | the Character Builder saves a model to the project |
| `FORGE_PROP` | Set Dresser | Add a prop from the Forge to your project. | the Prop Builder saves a model to the project |
| `FORGE_SOUND` | Sound Designer | Save a sound effect made in the Forge. | the Sound Effect Generator saves a file |
| `BUILD_GAME` | Ship It | Build your game for players. | a game build completes |
| `WORKSHOP_SHARE` | Show and Tell | Share a design on the Steam Workshop. | a design is uploaded from the Forge |
| `WORKSHOP_ADD` | Borrowed Brilliance | Add a design from the Steam Workshop to a project. | a subscribed design is added to a project |
| `RUNTIME_INSTALL` | Reactor Online | Install the Reactor Runtime in an existing project. | Build > Install Runtime finishes |
| `FIRST_EVENT` | Something Happens | Create an event on a map. | a new event is saved with OK |
| `BUILD_PIECE` | Groundbreaking | Place a building piece with the Builder. | a Builder stroke lays a piece |
| `SHAPE_TERRAIN` | Earthmover | Reshape the land with the Builder. | a Terrain brush stroke changes the ground |
| `PLACE_LIGHT` | Let There Be Light | Place a light on a map. | Lighting places a light |
| `MEDIA_SURFACE` | Now Showing | Put a media surface on a map. | a new media surface is saved |
| `BLUEPRINT` | Architect | Save a building as a blueprint. | the Builder saves a selection as a blueprint |

Each needs two icons (achieved and not yet, 256 × 256 JPG or PNG). Names and descriptions can be translated in Steamworks per language.

## Workshop

- Steamworks > Workshop > General: enable ISteamUGC for file transfer. Until the Workshop is made public there, only the developer accounts see it.
- A project item (`WorkshopProjects.js`, tag Project) is the project's data, assets and plugins, never its engine or saves; it opens as a new project with every plugin turned off.
- A design item is a Forge design as data, never code: `item.json` (format `rpg-reactor-forge-design`, the design record), `preview.png`, and a picture prop's picture. The Forge's Steam Workshop page shares the designs kept with Save Design (Character Builder, Prop Builder) and adds subscribed ones to the project in each builder's Workshop group.
- A project notes what it has shared in `forge/workshop.json`, so sharing again updates the same item.
- Valve asks that the Workshop terms be linked where items are submitted; the page does that, and says so when Steam reports they aren't accepted yet.
