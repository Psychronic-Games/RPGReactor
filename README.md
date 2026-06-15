# RPG Reactor

RPG Reactor 0.9 is an open-source, cross-platform RPG game editor and runtime for RPG Maker MV/MZ-compatible projects. RPG Reactor provides its own modern PIXI 8-based runtime while preserving compatibility with RPG Maker project data and targeting backwards compatibility with RPG Maker MZ plugins.

Use RPG Reactor to create, edit, playtest, and package 2D RPGs with familiar RPG Maker-style maps, events, database records, plugins, and deployment workflows, without depending on the original RPG Maker runtime.

## Repository Layout

```text
RPGReactor/
├── editor/   # RPG Reactor editor app source
├── runtime/  # Game runtime corescript copied into new projects
├── RPGReactor.sh / .bat / .command
├── LICENSE
└── README.md
```

## Development

```bash
cd editor
npm install
npm start
```

RPG Reactor runs on NW.js. Source checkouts do not include NW.js platform binaries, `node_modules/`, build output, saves, or local project templates.

## Runtime

The `runtime/` folder contains the player-facing corescript (`reactor_*.js`) and runtime libraries. The editor copies this folder into newly created game projects under `js/`.

## License

MIT
