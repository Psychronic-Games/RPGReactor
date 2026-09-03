# RPG Reactor Documentation

This folder contains release notes, audit history, and maintainer workflows that are not required for normal RPG Reactor editor use.

- [Handoff](HANDOFF.md): current cycle state, open threads, manual release gates, and the engineering notes behind recent work.
- [Runtime events](RUNTIME-EVENTS.md): the `ReactorEvents` feed — a read-only, synchronous notification channel the runtime emits into at fixed points of a battle, so a plugin that only observes combat can subscribe to a fact instead of wrapping the method where it happens. Lists every event with its exact emit point and payload, the guarantees (additive, isolated from throwing listeners, free while idle), what deliberately does not fire, a worked migration of an observer plugin, and the limits — chiefly that a plugin which *replaces* rather than wraps an emitting method silences that event.
- [Deep Audit Backlog — 2026-07-25](AUDIT-BACKLOG-2026-07-25.md): three authored-data items from the 0.96.0 file-by-file correctness audit that need a project-owner decision rather than a code change (re-verified 2026-08-24, all still open).
- [Demo: assets not on disk](demo-missing-se.md): SE names and character/battler art the bundled Demo references but no longer ships, kept current while stock assets are replaced.
- [Deep Audit Backlog — 2026-07-13](AUDIT-BACKLOG-2026-07-13.md): cleared historical record of the seven-subsystem audit findings and their 0.95.0 disposition.
- [Release Checklist](RELEASE-CHECKLIST.md): clean validation, signed candidate production, artifact inspection, GitHub/itch publication, rollback, and post-release checks.
- [Custom user interfaces](DESIGN-USER-INTERFACES.md): the authoritative current behavior and boundaries of the User Interfaces section. It covers Box/Image/Text/Button/Gauge/List nodes, typed named List contexts, actor bindings/tokens, expanded Gauges, capture as a visual draft, display-only overlays, seven stable baselines and role-safe replacements, functional Options and Save/Load, typography/nine-slice/state/focus styling, and transitions. The editor UX uses a compact toolbar with searchable Custom-default Use As, grouped Inspector settings, Back-to-Front reorder/reparent, explicit capture imports, and a responsive drawer/three-column layout. It also records what is not built: Container/flow/alignment guides and Item/Skill/Equip/Shop/Formation/Name Input/message-input/Battle workflow replacement. The standalone MZ plugin is deferred per owner direction.
- [Building 3D worlds from 2D tilesets](DESIGN-3D-WORLDS.md): replacing the 0.96.0 renderer's inference with an authored shape/material/structure model — why billboards fail for gates, where facing can be derived rather than authored, and a phased order of work. Phases 1–3 and 8 are built (faces from autotile shape, per-face materials and roof pairing, the Panel shape, and 3D lighting), phase 4 was built and dropped, and 5–7 (Block shape, structures, direct manipulation) are still a plan; event and database models shipped separately as sidecars. It also records what was *tried and rejected* — five merge rules for where one structure ends, and why a point light per light does not survive a real map — so those are not re-fought.

Release progress for GitHub visitors is tracked in the root [`CHANGELOG.md`](../CHANGELOG.md). Detailed editor/runtime change history is tracked in [`editor/CHANGELOG.md`](../editor/CHANGELOG.md).

Published release explanations (one devlog per release):

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
