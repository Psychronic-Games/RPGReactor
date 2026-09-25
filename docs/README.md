# RPG Reactor documentation

Guides for authoring with the engine, the current verified state, and maintainer workflows. Nothing here is required for ordinary editor use.

## Start here

- [Current status](STATUS.md): the verified state of the tree, runtime defaults that supersede older notes, and open work. Read this before the handoff.
- [Handoff](HANDOFF.md): dated engineering notes for the cycle in progress and the one just shipped, with how to try the newest work.
- [Authoring a world](AUTHORING.md): where every part of a 3D map lives, which tool edits it by hand, what a generator writes, and what checks it. The contract for people and AI working on the same project.

## Guides

- [Battle Rooms and Action Sequences](BATTLE-PRESENTATION.md): rooms, cameras, formations, visual sequences, assignment, plugin compatibility and current limits.
- [Rigging a 3D model](RIGGING-MODELS.md): templates, hand markers, placing markers precisely, what the runtime reads.
- [Model face points and speech](3D-FACE-AND-SPEECH.md): eye placement, mouth and lip authoring, spoken dialogue, per-prop animation speed.
- [Media surfaces](MEDIA-SURFACES.md): image and video placement on maps, models and the screen; transforms and proportions.
- [Custom user interfaces](DESIGN-USER-INTERFACES.md): the User Interfaces database section, its node set, actor bindings, opt-in stock-scene replacement and explicit boundaries.
- [Building 3D worlds from 2D tilesets](DESIGN-3D-WORLDS.md): the tileset-class, facing and per-face model behind HD-2D maps, with the phasing table marked to what shipped.
- [Runtime events](RUNTIME-EVENTS.md): the `ReactorEvents` feed a plugin can observe instead of wrapping battle methods; the test holds the page to the source.
- [Performance checks](PERFORMANCE.md): reproducible CPU/GPU profiling and image comparisons, with measured results per pass.
- [Importing an RPG Maker 2000/2003 project](IMPORTING-LEGACY-PROJECTS.md): the report, the import, what converts exactly, what the MZ format cannot hold, and what is still to come.
- [Demo: assets not on disk](demo-missing-se.md): art the bundled Demo references but does not ship, kept current while originals are authored.

## Maintainers

- [Release checklist](RELEASE-CHECKLIST.md): clean validation, signed candidates, GitHub and itch publication, rollback.
- Changelogs are one file per release: [`changelog/`](../changelog/) is the release body (keep it short), [`editor/changelog/`](../editor/changelog/) holds contributor detail. Each folder's `CHANGELOG.md` is the index. A new cycle adds `<version>.md` in both, titled `# RPG Reactor <version> (in development)`, and its line at the top of both indexes.

## Release history

- [posts/](posts/): release notes and itch devlogs per release, 0.98.5 onward.
- [devlogs/](devlogs/): the longer story of each release, 0.94.1 onward, plus mid-cycle notes such as [3D objects on the map](devlogs/2026-08-02-3d-objects-on-the-map.md) and [Build in the world](devlogs/2026-09-20-build-in-the-world.md).

Devlogs, posts and released changelog sections describe their named release and keep their historical counts; use the status and guide pages for current defaults.

## Archive

[archive/](archive/README.md) holds dated audits, session reports, PR integration notes, screenshot and JSON evidence, older handoff cycles, superseded design proposals and user-submitted patches. They record what was true on their date and are not maintained.
