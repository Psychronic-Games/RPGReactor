# PR #60 integration — 2026-09-15

[PR #60](https://github.com/Psychronic-Games/RPGReactor/pull/60) "Music sequence library and battle music; Quests tab fixes and a choice of quest log" (Xehanort88, eight commits) was merged on GitHub into `main` after the 0.98.6 tag and brought into the local branch, which already carried the 0.98.7 cycle bump.

## What it changes

- **Music sequences:** a library on `System.json` (`reactorMusicSequences`), chosen by maps, map battle music, troop Battle Music and Change Battle BGM; battle music resolves troop → Change Battle BGM → map → System; Map Properties uses the battle-music picker; Move to library; Starters…; ▶ Preview through the game's own audio code; Fade-out on Track entries. New files: `DatabaseMusicSequenceEditor.js`, `utils/BattleMusic.js`, `utils/SequencePreview.js`.
- **Quests:** icon picker fixed; text-code previews under every field and in the list (`DatabaseTextCodes.js`); multi-line objective and reward rows; imports take a leading `\I[n]` as the icon; **Quest log in game** chooses Reactor's log or VisuStella's, saving the database applying the plugin switch; Reactor's Quests menu command survives VisuStella MainMenuCore.
- Runtime: `reactor_managers.js`, `reactor_objects.js`, `reactor_quests.js`.

## Integration

- **One conflict**, in `editor/CHANGELOG.md`: the PR added its entries under a fresh `## [Unreleased]` heading while the local branch had already opened `## [Unreleased - 0.98.7]` with empty Added and Fixed sections. Resolved by keeping the local heading and filing the PR's write-ups under it, the icon-picker fix under Fixed and the rest under Added.
- Everything else merged automatically, including `index.html` (the About box bump beside the PR's new script tags) and `I18nManager.js` (the app version constant beside the PR's translation blocks).
- The runtime revision is bumped to **20260915.1** and `sync-runtime.cjs` refreshed every bundled project; `--check` is clean. The root `CHANGELOG.md` carries short entries; `editor/CHANGELOG.md` keeps the contributor's full write-ups.

## Verification

- Complete Node suite after the merge: **3,232 passed**, zero failures (3,181 before, plus the PR's tests in bgm-sequence-preview, bgm-sequence-starters, music-sequence-library, database-text-codes, select-shim-popup-edge and the extended quests, bgm-sequence-editor and bgm-sequence-runtime suites).
- `node --check` on the three merged runtime files.

Not pushed. No release, deployment or GitHub message was performed.
