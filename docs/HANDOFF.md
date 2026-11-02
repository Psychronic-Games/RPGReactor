# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-02)

- **Development:** 0.99.5 is open. Desktop/web manifests, About text, import scaffolding and the Demo metadata are updated. Runtime revision **20261101.41** is unchanged; all bundled runtime headers identify engine 0.99.5. Next changes go under 0.99.5 and stay local until the owner asks to push.
- **Published:** [0.99.4](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.4) is the regular Latest source release. The [itch.io devlog](https://psychronic.itch.io/rpg-reactor/devlog/1746509/rpg-reactor-0994-released) is live, with prepared Markdown/plain-text copies in `docs/posts/` and six JPGs in `docs/media/releases/0.99.4/`.
- **Release preference:** publish regular Latest source releases when the owner asks for a release; use a prerelease only when explicitly requested. Signed native binaries remain a separate pipeline.
- **Verification:** the [0.99.4 release CI](https://github.com/Psychronic-Games/RPGReactor/actions/runs/41398393353) failed: 24 character tests and the dependency audit remain open. No green full-suite result is claimed. [Working list](OPEN-ITEMS.md).
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner is working on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering. Full local suites remain deferred; substantial checks go through `codex-check`.

## 2026-11-02 — Start 0.99.5 development

The 0.99.4 source release is published as GitHub's regular Latest release and was verified in the repository's Releases sidebar. The owner reports the announcement and pictures uploaded; the live itch.io listing confirms the 0.99.4 devlog. The concise Markdown post now embeds all six versioned screenshots, and its plain-text companion marks each image upload. These prepared copies are included in this checkpoint. Their publication does not establish native-binary validation.

The current development version is 0.99.5 across the package/lock, About/localized version, web host, import skeleton, bundled Demo metadata and runtime headers. Both changelog indexes open a new 0.99.5 file; the released 0.99.4 notes, pictures and tags remain historical. Next feature/fix entries belong under 0.99.5. There are no new user-facing features in the new cycle yet.

Runtime revision 20261101.41 and character/prop preview revisions are unchanged because this checkpoint changes version and documentation metadata. Restart the editor to see 0.99.5. Existing characters do not need regeneration solely for this bump; the 0.99.4 geometry/material/motion changes still require re-saving older generated assets where applicable.

The release CI still fails, including unresolved character checks and five moderate dependency-audit advisories. The exact under-chin shadow report, overall face/body appearance and online real-world testing remain open. Full suites stay deferred locally; version, documentation and runtime-copy checks are the closeout scope. [Checkpoint record](archive/evidence/start-0.99.5-20261102.json). Earlier work and measurements are in [the 0.99.4 handoff archive](archive/handoff/0.99.4.md).

Closeout passes eight documentation/runtime-copy checks, explicit version consistency and changed JavaScript syntax checks, plus whitespace validation. All 20 local bundled projects match the canonical runtime. No full suite, browser sweep or asset regeneration was run for this metadata checkpoint.
