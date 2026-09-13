# RPG Reactor Documentation

- [September 11 session closeout](SESSION-2026-09-11.md) — full day summary, final verification, retained earlier work and compatibility limits.
- [Equipped items and throws](HELD-ITEMS-AND-THROWS-2026-09-11.md) — hand attachments, ally throws and 16 editable starters.
- [Expanded action sequences and battler graphics](ACTION-SEQUENCE-EXPANSION-2026-09-11.md) — phases, states, commands and visual graphic selection.
- [Tiles and small pixel art](TILE-SIZES-AND-SMALL-PIXEL-ART-2026-09-11.md) — sheet dimensions, zoom and rendering/window settings.
- [September 12 keyboard menus and dialogs](KEYBOARD-MENUS-AND-DIALOGS-2026-09-12.md) — menubar, context menus, database categories and modal focus now answer to the keyboard; what is still uncertified.
- [September 11 keyboard audit](KEYBOARD-SUPPORT-AUDIT-2026-09-11.md) — verified support and remaining gaps, including Tab traversal.
- [PR #57, #58 and #59 integration](PR-INTEGRATION-2026-09-13.md) — repeat ranges, refused states and planned targets merged over the local September 11–12 work.
- [Menu/shop touch repair](TOUCH-BUTTON-FIX-2026-09-11.md) and [PR #56 integration](PR-INTEGRATION-2026-09-11.md).

- [Model inspection and richer light palettes](MODEL-PREVIEWS-AND-LIGHT-THEME-2026-09-11.md) — neutral preview lighting, dark cost-card styling, contrast and main editor scrollbars.

- [Database and editor UI quality audit](UI-QUALITY-AUDIT-2026-09-11.md) — responsive layouts, field symmetry, native coverage and fixes.


- [Editor event lighting and 48px icons](EVENT-LIGHTING-AND-ICONS-2026-09-11.md): live 2D model-event lighting and configured icon cells.

- [Sidebar Events and States layout](SIDEBAR-AND-STATES-2026-09-11.md): event-list keyboard navigation, Database focus appearance and compact Duration controls.

- [2D camera and 288px faces](CAMERA-AND-LARGE-FACES-2026-09-11.md): System 2 framing controls, large face sheets and verification.

- [September 10 PR integration](PR-INTEGRATION-2026-09-10.md): enemy Behaviour forecast, integration corrections, validation and preserved local work.
- [Keyboard/UI audit — issue #54](UI-KEYBOARD-AUDIT-2026-09-10.md): list focus, popup navigation, stable tabbed dialogs, readable tileset names and blank inactive event conditions.

- [0.98.5 release notes](posts/release-notes-0.98.5.md): consolidated features, fixes, compatibility boundaries and validation.
- [0.98.5 itch.io devlog](posts/itch-devlog-0.98.5.md): announcement text, with a [plain-text copy](posts/itch-devlog-0.98.5-plain.txt).

This folder contains release notes, audit history, and maintainer workflows that are not required for normal RPG Reactor editor use.

- [Media surfaces](MEDIA-SURFACES.md): image/video authoring, current implementation names and preserved project/API compatibility.
- [Battle Rooms and Action Sequences](BATTLE-PRESENTATION.md): authoring rooms, map cameras, visual sequences, equipment/unarmed assignments, compatibility and current limitations. See also the [design and remaining roadmap](DESIGN-BATTLE-ROOMS-AND-ACTION-SEQUENCES.md).
- [September 5 PR integration](PR-INTEGRATION-2026-09-05.md): PRs #44 and #45, combined-tree validation, and the Project Tools save/containment fixes and regression checks.
- [September 4 session closeout](SESSION-2026-09-04.md): the day's rendering, speech, database, language/theme, recovery and Demo changes, with validation and remaining work.
- [Model face points and speech](3D-FACE-AND-SPEECH.md): eye placement, mouth/lip authoring, spoken dialogue and per-prop animation speed.
- [UX and localization audit](UX-LOCALIZATION-AUDIT-2026-09-06.md): theme consistency, new-system translations, live language switching, layout and repeatable checks.
- [Editor audit](EDITOR_AUDIT.md): command/database authoring, nested dialogs, translation coverage and themes.
- [Database state audit](DATABASE_STATE_AUDIT.md): operation-order regressions, asynchronous ownership, save/cancel behavior and repeatable sequence checks.
- [Current status](STATUS.md): verified development version, runtime defaults, test results, open work, and the limits of recorded validation. Read this before the historical handoff.
- [Performance checks](PERFORMANCE.md): reproducible CPU/GPU profiling and image comparisons, measured spotlight savings, and remaining per-frame work candidates.
- [Handoff](HANDOFF.md): dated engineering notes, open threads, and manual release gates; older entries preserve superseded implementations and measurements.
- [Runtime events](RUNTIME-EVENTS.md): the `ReactorEvents` feed — a read-only, synchronous notification channel the runtime emits into at fixed points of a battle, so a plugin that only observes combat can subscribe to a fact instead of wrapping the method where it happens. Lists every event with its exact emit point and payload, the guarantees (additive, isolated from throwing listeners, free while idle), what deliberately does not fire, a worked migration of an observer plugin, and the limits — chiefly that a plugin which *replaces* rather than wraps an emitting method silences that event.
- [Deep Audit Backlog — 2026-07-25](AUDIT-BACKLOG-2026-07-25.md): three authored-data items from the 0.96.0 file-by-file correctness audit that need a project-owner decision rather than a code change (animation/tileset findings re-verified 2026-09-04; 403 remains a documented exception).
- [Demo: assets not on disk](demo-missing-se.md): SE names and character/battler art the bundled Demo references but no longer ships, kept current while stock assets are replaced.
- [Deep Audit Backlog — 2026-07-13](AUDIT-BACKLOG-2026-07-13.md): cleared historical record of the seven-subsystem audit findings and their 0.95.0 disposition.
- [Release Checklist](RELEASE-CHECKLIST.md): clean validation, signed candidate production, artifact inspection, GitHub/itch publication, rollback, and post-release checks.
- [Custom user interfaces](DESIGN-USER-INTERFACES.md): the authoritative current behavior and boundaries of the User Interfaces section. It covers Box/Image/Text/Button/Gauge/List nodes, typed named List contexts, actor bindings/tokens, expanded Gauges, capture as a visual draft, display-only overlays, seven stable baselines and role-safe replacements, functional Options and Save/Load, typography/nine-slice/state/focus styling, and transitions. The editor UX uses a compact toolbar with searchable Custom-default Use As, grouped Inspector settings, Back-to-Front reorder/reparent, explicit capture imports, and a responsive drawer/three-column layout. It also records what is not built: Container/flow/alignment guides and Item/Skill/Equip/Shop/Formation/Name Input/message-input/Battle workflow replacement. The standalone MZ plugin is deferred per owner direction.
- [Building 3D worlds from 2D tilesets](DESIGN-3D-WORLDS.md): replacing the 0.96.0 renderer's inference with an authored shape/material/structure model — why billboards fail for gates, where facing can be derived rather than authored, and a phased order of work. Phases 1–3 and 8 are built (faces from autotile shape, per-face materials and roof pairing, the Panel shape, and 3D lighting), phase 4 was built and dropped, Block shape and structure stamping remain planned, and model/event gizmos only partially cover the proposed direct manipulation; event and database models shipped separately as sidecars. It also records what was *tried and rejected* — five merge rules for where one structure ends, and why a point light per light does not survive a real map — so those are not re-fought.

Devlogs, posts, and released changelog sections describe their named release.
They retain historical counts and behavior; use the status and design documents
for current defaults.

Release progress for GitHub visitors is tracked in the root [`CHANGELOG.md`](../CHANGELOG.md). Detailed editor/runtime change history is tracked in [`editor/CHANGELOG.md`](../editor/CHANGELOG.md).

Published release explanations (one devlog per release):

- [RPG Reactor 0.98.4: Build the World, Not Just the Map](devlogs/2026-08-30-rpg-reactor-0.98.4.md)
- [RPG Reactor 0.98.3: Rig It Yourself](devlogs/2026-08-23-rpg-reactor-0.98.3.md)
- [3D objects on the map](devlogs/2026-08-02-3d-objects-on-the-map.md) (mid-cycle note, 0.97)
- [RPG Reactor 0.96.0: A Deep Correctness Audit](devlogs/2026-07-25-rpg-reactor-0.96.0.md)
- [RPG Reactor 0.95.0: A More Complete Editor](devlogs/2026-07-18-rpg-reactor-0.95.0.md)
- [RPG Reactor 0.94.8: Big Maps Without the Wait](devlogs/2026-07-13-rpg-reactor-0.94.8.md)
- [RPG Reactor 0.94.7: Map Editing You Can Trust](devlogs/2026-07-13-rpg-reactor-0.94.7.md)
- [RPG Reactor 0.94.5: The Performance Release](devlogs/2026-07-12-rpg-reactor-0.94.5.md)
- [RPG Reactor 0.94.4: Responsive Web Forge and Reliable Windows Playtests](devlogs/2026-07-11-rpg-reactor-0.94.4.md)
- [RPG Reactor 0.94.3: Web Editor and Reliable Downloads](devlogs/2026-07-10-rpg-reactor-0.94.3.md)
- [RPG Reactor 0.94.2: Safer Saves and Better Deployments](devlogs/2026-07-10-rpg-reactor-0.94.2.md)
- [RPG Reactor 0.94.1: Make Your Own Effects with the Forge](devlogs/2026-07-05-rpg-reactor-0.94.1.md)
