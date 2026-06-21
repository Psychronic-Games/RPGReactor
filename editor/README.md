# RPG Reactor

RPG Reactor 0.93.1 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects, built on NW.js and PixiJS v8. RPG Reactor provides its own modern PIXI 8 runtime while preserving compatibility with RPG Maker project data and targeting backwards compatibility with RPG Maker MZ plugins. Create 2D RPG games with a complete development environment featuring map editing, event scripting, database management, and game testing capabilities.

## Features

### Map Editor
- **Multiple drawing tools**: Pencil, rectangle, circle area, fill bucket, and eraser
- **Layer-aware erasing**: Eraser works as a modifier across pencil, rectangle, circle, and fill tools, targets the topmost real tile in auto mode, and supports imported RPG Maker maps with existing layer-0 base/autotile data
- **Layer system**: Four tile layers (0-3) with auto-layer mode for intelligent placement
- **Shadow pen mode**: Special layer effects for depth and atmosphere
- **Undo/redo**: Full history support (up to 50 steps)
- **Autotile support**: Automatic tile connection with animated water/waterfall tiles
- **Region painting**: 256 distinct regions for gameplay triggers and restrictions
- **Map management**: Copy, paste, delete, and export whole maps from the map tree, including map data, `MapInfos.json` entries, compatible tileset database references, and full-size PNG image output
- **Map audio preview**: Preview autoplay BGM/BGS directly from Map Properties with Play/Pause/Stop controls and volume/pitch/pan settings
- **Performance optimized**: Viewport culling and lazy-loading for large maps

### Event System
- **Visual event editor**: Create interactive objects, NPCs, and triggers
- **Multi-page events**: Conditional pages that change based on game state
- **100+ event commands** with dedicated editor UIs including:
  - Message display, choices, scrolling text, and input
  - Variable, switch, and self-switch control
  - Party, inventory, gold, and equipment management
  - Actor stats (HP/MP/TP/EXP/Level), skills, states, and parameters
  - Character movement, transfers, and vehicle control
  - Screen effects (tint, flash, shake, weather)
  - Picture commands (show, move, rotate, tint, erase)
  - Audio playback (BGM, BGS, ME, SE) and system audio settings
  - Battle processing, shop processing, and enemy manipulation
  - Map settings (tileset, parallax, battle background)
  - Conditional branches, loops, labels, and common events
  - Custom script and plugin command execution
- **Copy/paste support**: Duplicate events, pages, and command selections, including cross-window clipboard support between RPG Reactor instances
- **Find/search**: Locate events across your project

### Database Editors
Comprehensive editors for all game data with right-click context menu clipboard operations (Copy, Cut, Paste, Duplicate), keyboard shortcuts (Ctrl+C/X/V/D, Delete, Ctrl+Z undo) on list entries, and shortcut isolation so database tools do not conflict with map or event editing:

| Editor | Purpose |
|--------|---------|
| **Actors** | Create player characters with stats, equipment, traits, and clickable character/face sheet cell selection |
| **Classes** | Define jobs with parameter curves, learnable skills, and EXP formulas |
| **Skills** | Design abilities with damage formulas, MP/TP costs, effects CRUD, and invocation settings |
| **Items** | Create consumables with damage formulas, effects CRUD, and usage restrictions |
| **Weapons** | Configure weapons with parameters, elements, and traits |
| **Armors** | Set up defensive equipment with parameters, resistances, and full trait editing |
| **Enemies** | Build enemies with visual battler preview (charset-aware), hue slider with live preview, parameters, drop items, action patterns, and traits |
| **Troops** | Compose enemy groups with visual replace picker, visibility toggles, and event page scripting |
| **States** | Define status effects with auto-removal and parameter changes |
| **Animations** | Create battle animations with sprite frames or Effekseer effects |
| **Tilesets** | Configure tile passage, terrain tags, special flags, Change Maximum, and Ctrl+C/Ctrl+V slot copy/paste |
| **Common Events** | Script reusable event sequences with trigger conditions |
| **System 1** | Game-wide settings including title, party, audio, battleback, title screen, and vehicle options |
| **System 2** | Menu commands, item categories, magic skills, attack motions, editor settings, asset sizes, and advanced options |

### Audio Player
- **Multi-channel playback**: BGM, BGS, ME, and SE tracks
- **Playback controls**: Volume, pitch, pan, and seek
- **Loop configuration**: Set custom loop points
- **Real-time preview**: Test audio while editing events, system audio, and map autoplay BGM/BGS settings

### Multi-Instance Editing
- **Multiple project windows**: Launch separate RPG Reactor windows for different projects
- **Same-project protection**: Per-project lock files prevent opening the same project twice at the same time
- **Cross-instance clipboard**: Typed clipboard support for events, event pages, event command selections, maps, and plugin JSON/settings

### Plugin System
- **Plugin discovery**: Automatically finds plugins in your project
- **Enable/disable toggle**: Control which plugins are active
- **Load order management**: Arrange plugin execution order
- **Parameter configuration**: Edit plugin settings through the UI
- **Multi-select actions**: Shift-click and Ctrl/Cmd-click plugins to copy, cut, paste, duplicate, or remove groups across windows
- **RPG Maker-safe saves**: Existing MV/MZ projects keep `js/plugins.js` in RPG Maker's standard `name`/`status`/`description`/`parameters` format; Reactor-only parsed help, author, and URL metadata stays editor-only

### Playtest
- **One-click testing**: Launch your game instantly from the editor
- **Debug mode**: Test with development features enabled
- **Process management**: Start and stop playtests easily
- **Start-map validation**: Repairs invalid player and vehicle start-map references before launch when maps have been deleted
- **Packaged editor support**: Final editor builds launch playtests through a clean NW.js runtime on Windows, macOS, and Linux so the editor package is not accidentally relaunched as the game

### Build & Deploy (Games)
- **Cross-platform builds**: Package games for Windows, macOS, Linux, and Web (HTML5)
- **Standalone executables**: No runtime dependencies for players
- **Custom icons**: Game builds embed your project's `icon/icon.png` into Windows `.exe` and macOS `.app`; Linux uses runtime icon. Falls back to NW.js default if no icon is found
- **Asset bundling**: Game files copied into `package.nw` alongside NW.js runtime
- **NW.js runtime options**: Use bundled runtime (includes proprietary codecs) or download from dl.nwjs.io
- **Web export**: HTML5 builds for browser deployment (itch.io, web hosting)
- Access from **Build → Create Deployment Package...**

### Editor Distribution Builder
Package the RPG Reactor editor itself for distribution on itch.io, GitHub Releases, etc.

- **3 package types**:
  - **Platform-Specific**: One archive per OS with bundled NW.js runtime (Linux → `.tar.gz`, Windows/macOS → `.zip`)
  - **Universal**: Single `.zip` containing all 3 platform runtimes
  - **Minimal**: Editor-only package — bootstrap launchers auto-download NW.js on first run
- **NW.js editions**: Normal or SDK (includes DevTools for development/debugging)
- **3-tier runtime acquisition**: Checks bundled local → `.nw-cache/` → downloads from `dl.nwjs.io`
- **SHA256 checksums**: Automatically generated for all output archives
- **Playtest-safe runtime layout**: Windows/Linux platform packages append the editor payload to the branded executable while leaving `nw.exe`/`nw` clean for playtest; macOS packages as a self-contained `.app` with an internal clean playtest runtime that symlinks to the bundled NW.js framework
- **Windows compatibility mode**: Windows editor packages use frameless RPG Reactor title controls, centered startup, and manual maximize/restore behavior so running the Windows build under Proton/Wine on Linux avoids native-frame white bars and click offsets
- Access from **Build → Package Editor for Distribution...**

### Forge — In-editor Asset Generators

Suite of in-editor tools for generating game assets without leaving RPG Reactor. Open from the **Forge** menu.

#### Animation Generator
Procedural sprite-sheet generator for visual effects and projectile animations.

- **Layered composition**: Stack multiple animations as layers; per-layer visibility, opacity, and blend mode (`source-over`, `add`, `multiply`, `screen`, etc.)
- **Keyframe timeline per layer**: Drop keyframes at any frame; sliders and colors interpolate linearly between them and textures cross-fade smoothly so a single layer can morph through several looks in one loop
- **Animation library** across four categories:
  - **Geometric**: Cube, Pyramid, Cylinder, Cone, Sphere, Torus, Möbius Strip, Double Helix, Dodecahedron, Hypercube, Pentachoron (4D), Circular Saw Blade
  - **Energy**: Fire, Portal (Stargate-style water-simulation shimmer), Energy Field, Energy Wisps, Teleport Column
  - **Object**: Sword, Knife, Hammer, Arrow, Bullet, Rock, Egg, Coin, Crown, Scythe
  - **Effect**: Hypnotize (seamless Archimedean spiral), Acid Trip (kaleidoscopic mandala)
- **3D pipeline**: Every shape supports static tilts + per-axis rotation cycles, glow halo, textured faces with backface culling, and depth-sorted edges
- **Texture sources**:
  - PNG / JPG / WebP / BMP static images
  - **Animated GIFs** — frames are decoded and played in sync with the animation's loop
  - **Video files** (MP4, WebM, MOV, M4V, OGV, OGG) — seek-decoded to per-frame canvases on first load, also synced to the animation loop
- **Export**: Save bake-ready PNG sprite sheets for use in MZ animations *and* save a transparent animated GIF of the live preview for documentation / sharing

#### Character Generator
Composable character sprite generator for actor walking sprites and generated outfit parts.

- **Style selector**: Built-in `Looseleaf` and `Psychronic` styles share the same part format while allowing style-specific anatomy and painter adapters
- **Procedural tab**: Renders layered ASCII/template parts from the part registry, with configurable frame size, alignment, palette overrides, and 3x4 walking-sheet export
- **Outfit Forge tab**: Generates full-outfit Character Generator parts from recipe data. The current shared recipe is `Nova Sentinel`, available for both Looseleaf and Psychronic styles through `procgen/outfits/nova_sentinel.js`
- **Outfit engine**: Browser/Node-compatible generator in `src/forge/CharacterGenerator/procgen/outfit_engine.js`, with per-zone palette families, role-based painters, extensions such as pauldrons/gauntlets, live 4-direction preview, walk preview, zone debug overlays, and save-to-library output under `styles/<style>/parts/full outfits/`
- **Hair Forge tab**: Generates 4-direction walking hair parts with live walk preview, save-to-library output, expanded palettes (`auburn`, `platinum`, `rose`, `violet`, `navy`, `emerald`), front-view Eye Zone controls, and Hair Pattern sliders for lower-hair banding/scraggle or Short Spiky triangular texture.
- **Hair Forge styles**: Includes `Layered Bob`, `Long Layered`, `Short Shag`, `Short Spiky`, and `Center Part Long`. Short Spiky uses style-specific spike silhouettes, spiky side bangs, connected rear spikes, and length-aware back/nape behavior; Center Part Long uses symmetrical straight strands, a visible middle part, smooth side bangs, face-framing long curtains, and subtle walk-frame sway.
- **Template analyzer**: Imports PNG/JPEG/WebP sprite sheets, classifies pixels into material letters, supports material-paint correction, and emits style-specific `RR_CG_BODY_TEMPLATE_SHEETS[style][variant]` snippets for body-template work
- **Parts (PNG) tab**: Layers user-supplied PNG sprite-sheet parts from the active project's `forge/character_generator/styles/<style>/parts/` folder with draggable ordering

#### Sound Effect Generator
Procedural SFX generator for impacts, UI clicks, and stingers.

### Theming

Switch the editor's look from **File → Options**:

- **Palettes**: Default (gold), Bubblegum (pink), Ocean (blue), Cascadia (forest green), Underworld (red), Orange Creamsicle (orange/cream), Royalty (purple with gold trim)
- **Modes**: Dark and Light for every palette
- **Palette picker**: Compact swatch dropdown with high-contrast themed rows and selected/hover highlights
- Map editor canvas stays dark in every theme (cinematic feel)
- Theme choice persists across sessions in `localStorage`
- All themes built on a single CSS custom-property system (`css/theme.css`); adding a palette is a copy-paste block plus one line in the picker registry

### Localization

Switch the editor language from **File → Options** or the top-menu language button. Language changes apply immediately and persist across sessions in `localStorage`.

- **Languages**: English, Japanese, Spanish, Traditional Chinese, Simplified Chinese, Russian, Portuguese, German, French, and Greek
- **Current coverage**: editor shell, menu bar, toolbar titles/labels, welcome screen, Options modal, Forge launcher, Audio Player shell labels, About dialog, database/event editor chrome, many fixed event-command forms, high-visibility Forge tools, and common status/alert text
- **Architecture**: `src/I18nManager.js` provides dictionaries, `I18n.t(key)`, `data-i18n`/`data-i18n-title`/`data-i18n-aria` DOM binding, exact-text fallback for generated editor chrome, mutation observation for dynamic UI, and a `rr-language-changed` event for dynamic UI rerenders
- Project-authored content such as actor/item/switch/map/event/audio names remains untranslated so RPG project data is not modified by editor language changes

## Installation

### From a Release Archive
Download a platform-specific archive from the releases page, extract it, and run the launcher:

#### Linux
```bash
tar xzf RPGReactor-v*.tar.gz
cd RPGReactor
chmod +x RPGReactor.sh
./RPGReactor.sh
```
The launcher automatically installs a desktop entry and icon on first run.

#### Windows
Extract the `.zip` and double-click `RPG Reactor.exe`.

#### macOS
Extract the `.zip` and double-click `RPGReactor.command` (or run from Terminal).

### From Source
RPG Reactor runs on NW.js (not system Node.js). You need the NW.js runtime for your platform.

```bash
# Clone the repository
git clone https://github.com/Psychronic-Games/RPGReactor.git
cd RPGReactor/editor

# Install editor dependencies
npm install

# Download NW.js for your platform and place it in:
#   nwjs-linux/   (Linux)
#   nwjs-win/     (Windows)
#   nwjs-mac/     (macOS)

# Launch with the NW.js binary
./nwjs-linux/nw .          # Linux
nwjs-win\nw.exe .          # Windows
```

## Project Structure

```
RPG Reactor/
├── README.md                    # Repository overview
├── LICENSE                      # MIT license
├── RPGReactor.sh                # Linux source-checkout launcher
├── RPGReactor.bat               # Windows source-checkout launcher
├── RPGReactor.command           # macOS source-checkout launcher
├── runtime/                     # Player-facing corescript copied into projects
│   ├── reactor_core.js
│   ├── reactor_main.js
│   ├── reactor_managers.js
│   ├── reactor_objects.js
│   ├── reactor_plugins.js
│   ├── reactor_scenes.js
│   ├── reactor_sprites.js
│   ├── reactor_windows.js
│   └── libs/                    # PixiJS, Effekseer, storage/compression libs
└── editor/                      # Editor app source
    ├── src/                     # Editor JavaScript source
    ├── build-scripts/           # Game/editor distribution workers
    ├── css/                     # Editor stylesheets
    ├── images/                  # Editor icons and assets
    ├── libs/                    # Editor libraries
    ├── tests/                   # Node test suite
    ├── index.html               # Main UI layout + script tags
    ├── package.json             # NW.js app config + npm scripts
    ├── package-lock.json
    ├── RPGReactor.sh            # Linux launcher when NW.js is present
    ├── RPGReactor.bat           # Windows launcher when NW.js is present
    ├── RPGReactor.command       # macOS launcher when NW.js is present
    ├── CHANGELOG.md
    └── README.md                # This file
```

## Game Project Structure

Projects created with RPG Reactor follow this structure:

```
MyGame/
├── index.html           # Game entry point
├── package.json         # Project configuration
├── project.rpgreactor   # Editor metadata
├── js/
│   ├── reactor_core.js     # Core engine
│   ├── reactor_managers.js # Game managers
│   ├── reactor_objects.js  # Game objects
│   ├── reactor_scenes.js   # Scene system
│   ├── reactor_sprites.js  # Sprite rendering
│   ├── reactor_windows.js  # UI windows
│   ├── reactor_plugins.js  # Plugin loader
│   └── libs/               # PixiJS, Effekseer
├── data/                # JSON database files
│   ├── Actors.json
│   ├── Classes.json
│   ├── Skills.json
│   ├── Items.json
│   ├── Map*.json
│   └── ...
├── img/                 # Graphics assets
│   ├── characters/
│   ├── tilesets/
│   ├── battlebacks/
│   └── ...
└── audio/              # Sound files
    ├── bgm/
    ├── bgs/
    ├── me/
    └── se/
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Project |
| `Ctrl+O` | Open Project |
| `Ctrl+S` | Save Project |
| `Ctrl+Z` | Undo (map editor and database list) |
| `Ctrl+Y` | Redo |
| `Ctrl+Shift+Z` | Redo (alternate) |
| `Ctrl+C` | Copy selected database entry |
| `Ctrl+X` | Cut selected database entry |
| `Ctrl+V` | Paste database entry to selected slot |
| `Ctrl+D` | Duplicate selected database entry |
| `Delete` | Delete selected event, delete selected map, or blank selected database entry |

Database shortcuts are scoped to the active database section. Plugin Manager also supports Ctrl+C/X/V and Delete for selected plugin groups. Map tree shortcuts support Ctrl+C/Ctrl+V and Delete for whole-map clipboard/delete actions. Map and event global shortcuts are suppressed while database and editor modals are open.

## Technical Details

- **Runtime**: NW.js 0.92.0 (Chromium + Node.js)
- **Rendering**: PixiJS 8.0.0 runtime, with compatibility shims and bundled PIXI 7-era library support for imported RPG Maker projects/plugins
- **Animation Effects**: Effekseer
- **Data Format**: RPG Maker MZ compatible JSON; RPG Maker MV projects are also compatible in most cases depending on corescripts and plugins
- **Tile Size**: 48x48 pixels
- **Supported Platforms**: Windows (x64), macOS (x64), Linux (x64)

### Tests

The current automated test suite is intentionally small but covers project scaffold/import behavior, runtime file presence, local Markdown links, i18n dictionary/key consistency, and core Outfit Forge generation invariants:

```bash
cd editor
npm test
```

### Build Architecture
Both game builds and editor distribution builds use `worker_threads` to run in background threads without blocking the UI. Workers communicate via `postMessage` with `{ type: 'log', message, color }` for build log output and `{ type: 'progress', percent, status }` for progress bar updates. ESM `import()` hangs silently in NW.js worker threads, so all build workers use CommonJS exclusively.

## License

MIT

## Author

Psychronic

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
