# PR #61 integration — 2026-09-16

[PR #61](https://github.com/Psychronic-Games/RPGReactor/pull/61) "Let a passive state answer both sides of an enemy state condition" (Xehanort88, two commits) was merged on GitHub into `main` and brought into the local branch.

## What it changes

- **Target State sees passive states.** `Game_Enemy.meetsTargetStateCondition` asks each candidate its own `meetsStateCondition` instead of reading `_states`, so SkillsStatesCore's replacement on enemies and Battle AI's on actors govern both the User State and Target State rows. The base check tests membership of `states()` by object, guarded against a pushed id for a deleted state.
- **Several states per condition row.** Each of the four state rows on an action pattern is a chip list with an Add state picker; any-of for a State row, none-of for a Lacks row. Stored as `params` beside `param1` (a one-state row stores no list). `Game_Battler.actionConditionStateIds` resolves it; dispatch composes per state id so `meetsTargetStateCondition` stays a one-state question.
- **Forecast:** every listed state is its own what-if toggle; a Target State row over a scope with no candidates reports `no-target`; `<Target: …>` notetags and string scopes are left alone; Lacks rows are not flagged.
- Files: `DatabaseEnemyEditor.js`, `utils/EnemyActionForecast.js`, `I18nReviewedTranslations.js`, runtime `reactor_objects.js`, two test suites.

## Integration

- No conflicts; the merge commit is `61bc77f`. PR #61's changelog entries landed under the local `[Unreleased - 0.98.7]` heading.
- Runtime revision **20260916.1**, every bundled project synced, `--check` clean.

## Verification

- Complete Node suite after the merge: **3,244 passed**, zero failures (3,233 before).
- The contributor reports "24 environmental failures" in their tree; none reproduce here or in CI's clean clone (see the 2026-09-15 handoff entry on tests that read gitignored projects).

Not pushed. No release, deployment or GitHub message was performed.
