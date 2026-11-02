# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-02)

- **Development:** 0.99.5 is open, runtime revision **20261102.1**. Changes stay local until the owner asks to push `main`.
- **Published:** [0.99.4](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.4) is the regular Latest source release; the [itch.io devlog](https://psychronic.itch.io/rpg-reactor/devlog/1746509/rpg-reactor-0994-released) is live. Signed native binaries remain a separate pipeline.
- **Verification:** CI is green on branch `ci/0.99.5-check` (run 41513263959: 9,328 passed, 35 skipped); `main` is that branch plus a documentation commit and is not pushed. Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org runs this cycle's Demo, and a playtest of the Demo joins it. It still holds test accounts, sleepers and chat.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering.

## 2026-11-02 — Character creation as game windows, sign-in, CI

The owner's New Game error was the worker missing from playtests: only deploys wrote `reactor-builder/`, and a game's page (a `chrome-extension://` origin under NW.js) cannot start a worker from the editor's folder. `stagePlaytestCharacterBuilder` now copies the Forge in when a playtest starts.

The creator and sign-in are now menu scenes, so they take the project's window skin, font and window plugins. `ReactorCharacterStudio` holds the recipe, worker and view and outlives its scene so `Scene_Name` can be visited. How it fits together, and the event command's options, are in [Online worlds](DESIGN-ONLINE.md#after-an-intro).

Traps:

- A temp Demo copy has the Demo's old `js/`: overlay `runtime/` or you test the previous runtime. On the headless display the game runs at about 2 FPS, under 1 with the creator's view, so hold keys until `Graphics.frameCount` advances.
- The Demo's two settings files are tracked, and a new project deletes them (`updateCopiedTemplateProject`), or it would join the demo server.
- `System.json` `versionId` and `project.rpgreactor` churn in the Demo whenever the editor saves. They were left out of these commits.
- `limitLegs` now runs on floor, squat and exercise poses. The kneeling stretches skip it on purpose: bringing them into range moved the approved hold's feet up to 17 cm.

Not done: a real `nwbuild` on the overridden `glob` and `minimatch`, a User Interfaces role for the creator (the same skin and font reach custom menus, their layout does not), translating the creator's in-game labels, and password reset by email (accounts have no email; the owner resets on the admin page). Two owner questions are new: B2 and B3.

## 2026-11-02 — Start 0.99.5 development

The 0.99.4 source release is published as GitHub's regular Latest release and was verified in the repository's Releases sidebar. The owner reports the announcement and pictures uploaded; the live itch.io listing confirms the 0.99.4 devlog. The concise Markdown post now embeds all six versioned screenshots, and its plain-text companion marks each image upload. These prepared copies are included in this checkpoint. Their publication does not establish native-binary validation.

The current development version is 0.99.5 across the package/lock, About/localized version, web host, import skeleton, bundled Demo metadata and runtime headers. Both changelog indexes open a new 0.99.5 file; the released 0.99.4 notes, pictures and tags remain historical. Next feature/fix entries belong under 0.99.5. There are no new user-facing features in the new cycle yet.

Runtime revision 20261101.41 and character/prop preview revisions are unchanged because this checkpoint changes version and documentation metadata. Restart the editor to see 0.99.5. Existing characters do not need regeneration solely for this bump; the 0.99.4 geometry/material/motion changes still require re-saving older generated assets where applicable.

The release CI still fails, including unresolved character checks and five moderate dependency-audit advisories. The exact under-chin shadow report, overall face/body appearance and online real-world testing remain open. Full suites stay deferred locally; version, documentation and runtime-copy checks are the closeout scope. [Checkpoint record](archive/evidence/start-0.99.5-20261102.json). Earlier work and measurements are in [the 0.99.4 handoff archive](archive/handoff/0.99.4.md).

Closeout passes eight documentation/runtime-copy checks, explicit version consistency and changed JavaScript syntax checks, plus whitespace validation. All 20 local bundled projects match the canonical runtime. No full suite, browser sweep or asset regeneration was run for this metadata checkpoint.
