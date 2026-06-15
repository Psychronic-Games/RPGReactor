# RPG Reactor

Open-source, cross-platform RPG game engine and editor built on NW.js and PixiJS.

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
