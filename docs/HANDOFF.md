# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-01)

- **Releases:** [0.99.4](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.4) is the regular Latest source release, with six screenshots and known issues. Native binaries remain a separate publication. [Release record](archive/evidence/release-0.99.4-20261102.json).
- **Verification:** the baseline CI failed; a [repair run](https://github.com/Psychronic-Games/RPGReactor/actions/runs/41397145405) is in progress. Character checks and the dependency audit remain open. The source release claims no green full-suite result. [Scope](OPEN-ITEMS.md).
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Visual acceptance remains open. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner is working on them in a separate session with another model, which may be editing the same tree. Leave the face code alone unless asked, and check `git status` before scripted edits. Other work today is outside the 3D systems.
- **Runtime:** **20261101.41**, PixiJS **8.22.0**, Three.js **0.187.0**. Tile layers and events share each rendered camera position; native Moletown drift drops from 6 px to zero. [Evidence](archive/evidence/event-camera-drift-20261101.json). Multi-frame sprites default on and preserve explicit off; re-export older sheets. [Guide](CHARACTER-BUILDER.md#sprite-sheets).
- **Border feedback:** fixed at capture entry. Reproduce with `smoke/nw-border-feedback.cjs --uncapped` (continue west through Forest Road); short edge trips miss it.
- **Remaining work:** [OPEN-ITEMS.md](OPEN-ITEMS.md), then [STATUS](STATUS.md#open-work). Keep gameplay timing fixed; render available refreshes without imposing a cadence cap.
- **Testing (2026-10-31):** use `npm run test:changed`; never run the whole suite locally. See the entry below.
