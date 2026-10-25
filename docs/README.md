# RPG Reactor documentation

Guides for authoring with the engine, the current verified state, and maintainer workflows. Nothing here is required for ordinary editor use.

## Start here

- [Current status](STATUS.md): the verified state of the tree, runtime defaults that supersede older notes, and open work. Read this before the handoff.
- [Handoff](HANDOFF.md): dated notes for the cycle in progress: what is half-done, how to resume.
- [Waiting on the owner](OWNER-QUESTIONS.md): the one list of questions for the owner, each with a recommendation.
- [Authoring a world](AUTHORING.md): where every part of a 3D map lives, which tool edits it by hand, what a generator writes, and what checks it. The contract for people and AI working on the same project.

## Guides

- [Battle modes](BATTLE-MODES.md): Classic and the battles on the map (Tactical, Action, First Person): choosing the mode, units, commands, hooks. Its design and phases: [DESIGN-BATTLE-MODES.md](DESIGN-BATTLE-MODES.md).
- [Battle Rooms and Action Sequences](BATTLE-PRESENTATION.md): rooms, cameras, formations, visual sequences, assignment, plugin compatibility and current limits.
- [Vehicles](AUTHORING.md#authoring-vehicles): database types, event setup, classes and equipment, map travel and engine sound; [ride the Demo motorcycle](AUTHORING.md#riding-the-demo-motorcycle).
- [Rigging a 3D model](RIGGING-MODELS.md): templates, hand markers, placing markers precisely, what the runtime reads.
- [3D Character Builder](CHARACTER-BUILDER.md): shaping a human with sliders in the Forge and saving it as a rigged model.
- [Character quality coverage](CHARACTER-QUALITY.md) and [Claude continuation tracker](CLAUDE-QUALITY-TRACKER.md): catalog/slider sweeps, inherited agent issues, reproduced fixes, validation evidence and remaining appearance limits.
- [3D Prop Builder](PROP-BUILDER.md): flags and hanging banners in the wind, props made from a picture, frames, swords, firearms and wearables, saved as models.
- [Model face points and speech](3D-FACE-AND-SPEECH.md): eye placement, mouth and lip authoring, spoken dialogue, per-prop animation speed.
- [Media surfaces](MEDIA-SURFACES.md): image and video placement on maps, models and the screen; transforms and proportions.
- [Custom user interfaces](DESIGN-USER-INTERFACES.md): the User Interfaces database section, its node set, actor bindings, opt-in stock-scene replacement and explicit boundaries.
- [Building 3D worlds from 2D tilesets](DESIGN-3D-WORLDS.md): the tileset-class, facing and per-face model behind HD-2D maps, with the phasing table marked to what shipped.
- [Reactor plugin API](DESIGN-PLUGIN-API.md): proposal for `@target Reactor` headers, named and ordered hooks in place of raw aliasing, and a plugin reference generated from the runtime. Not built yet.
- [Runtime events](RUNTIME-EVENTS.md): the `ReactorEvents` feed a plugin can observe instead of wrapping battle methods; the test holds the page to the source.
- [HDR effect overlay](HDR-EFFECT-OVERLAY.md): opt-in HDR rendering for Effekseer effects: the sidecar file, the normally graded twin, tuning, and what it does not cover.
- [Performance checks](PERFORMANCE.md): reproducible CPU/GPU profiling and image comparisons, with measured results per pass.
- [Importing older RPG Maker projects](IMPORTING-LEGACY-PROJECTS.md): RPG Maker 2000, 2003, XP, VX and VX Ace games into a new project; the report, the import, what converts exactly, what the MZ format cannot hold, and what is still to come.
- [Demo: assets not on disk](demo-missing-se.md): art the bundled Demo references but does not ship, kept current while originals are authored.

## Maintainers

- [Release checklist](RELEASE-CHECKLIST.md): clean validation, signed candidates, GitHub and itch publication, rollback.
- Changelogs are one file per release: [`changelog/`](../changelog/) is the release body (keep it short), [`editor/changelog/`](../editor/changelog/) holds contributor detail. Each folder's `CHANGELOG.md` is the index. A new cycle adds `<version>.md` in both, titled `# RPG Reactor <version> (in development)`, and its line at the top of both indexes.

## Keeping STATUS and HANDOFF short

Each session writes notes, and nothing removes them unless a rule does. These are the rules; `editor/tests/docs-budget.test.cjs` fails when one is broken.

| Where | What goes there | Limit |
| --- | --- | --- |
| `editor/changelog/<version>.md` | What changed, in full. The record of the work. | none |
| Commit message, guides, code comments | How it works and why. | none |
| [STATUS.md](STATUS.md) | What is true now: one validation bullet per area, the one open-work list, decisions that stand. Replace; never append dated narrative. | 25,000 bytes |
| [HANDOFF.md](HANDOFF.md) › Where things stand | The state the next session starts from. Rewritten, not added to, each session. | 2,500 bytes |
| [HANDOFF.md](HANDOFF.md), one dated entry | What the next session needs and can't find elsewhere: half-done work, traps, owner questions, how to resume. Not a restatement of the changelog. | 4,000 bytes |
| [HANDOFF.md](HANDOFF.md), whole file | The cycle in progress only. | 40,000 bytes |
| [OWNER-QUESTIONS.md](OWNER-QUESTIONS.md) | Questions only the owner can answer, each with a recommendation. An answered item leaves. | none |

- **At a release,** `cut-release.cjs` moves every entry dated on or before the release into `archive/handoff/<version>.md` in the release commit. Entries older than the latest release fail the test.
- **Mid-cycle, over the limit:** `node editor/build-scripts/archive-handoff.cjs --fit` moves the oldest entries to the archive file of the version in development until the handoff is back to 30,000 bytes (`--through <YYYY-MM-DD>` picks the date by hand).
- **Never squeeze to fit.** Over a limit, cut what the changelog or a guide already holds, or archive; don't drop spaces or articles. The test fails on squeezed text ("first401", "tests,9 skipped,none").
- **Owner questions go in [OWNER-QUESTIONS.md](OWNER-QUESTIONS.md),** not in a dated entry or STATUS, so archiving never buries one.
- **When an open item is finished,** it leaves STATUS › Open work. When a check is repeated, its validation bullet is replaced.

## Release history

- [posts/](posts/): release notes and itch devlogs per release, 0.98.5 onward.
- [devlogs/](devlogs/): longer release stories, 0.94.1 onward, plus mid-cycle notes such as [3D objects on the map](devlogs/2026-08-02-3d-objects-on-the-map.md) and [Build in the world](devlogs/2026-09-20-build-in-the-world.md).

Devlogs, posts and released changelog sections describe their named release and keep their historical counts; use the status and guide pages for current defaults.

## Archive

[archive/](archive/README.md) holds dated audits, session reports, PR integration notes, screenshot and JSON evidence, older handoff cycles, superseded design proposals and user-submitted patches. They record what was true on their date and are not maintained.
