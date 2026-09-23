# PR #64 integration — 2026-09-18

[PR #64](https://github.com/Psychronic-Games/RPGReactor/pull/64) "Feat/editor reads project param names" (Xehanort88, seven commits) was opened as a **draft**, approved and merged on GitHub, and brought into the local branch. It was reviewed more closely than a normal contribution for that reason; findings below.

## What it changes

- `editor/src/utils/ParamNames.js` (new, loaded from `index.html` at the top of the utils block, before every consumer): `rrParamNames(translate, terms)`, `rrParamTermName(slot, fallback, …)` and `rrHitEvasionNames(fallbacks, …)` read the open project's `terms.params` through `window.reactor.projectController.databaseManager.getSystem()`, falling back to the editor's translated English default for any slot the author has not actually renamed (`RR_STOCK_PARAM_TERMS` decides what counts as untouched, per slot, case-insensitively, covering both the Demo's and a new project's stock wording for Hit/Evasion).
- Fifteen call sites across ten files stop carrying their own copy of the English names: `DatabaseCommonUI`, `DatabaseTraitEditor`, `DatabaseEffectEditor`, `DatabaseClassEditor`, `DatabaseEnemyEditor`, `DatabaseWeaponEditor`, `DatabaseArmorEditor`, `BattleTestConfigModal`, `EventCommandList`, `ChangeParameterEditor`, `ControlVariablesEditor`.
- `editor/tests/editor-sources-parse.test.cjs` (new): every `<script src>` in `index.html` must parse as a classic script, with a self-check that the guard is looking at real files and rejects a genuine syntax error. It was written because a duplicate `const` had made `ChangeParameterEditor.js` unparseable while text-matching assertions about that file kept passing.
- `editor/tests/helpers/param-names.cjs` (new) installs the util into the vm contexts other suites use.

## Review of the draft

Verified, beyond the suite:

- **Load order.** `ParamNames.js` is line 890 of `index.html`; every consumer is line 1128 or later.
- **The API it depends on exists** (`DatabaseManager.getSystem`) and the util swallows its own errors, so a surface rendered before a project is open falls back rather than throwing.
- **Web build.** `dist-editor-worker.js` bundles whatever `index.html` lists, so the new file is included with no build change; all three new files are tracked.
- **Live, renamed project.** A Demo copy with `terms.params` set to MaxHP/MaxMP/Strength/Vitality/Will/Spirit/Dexterity/Faith shows all eight on the Classes curve grid, the Enemies table and the Weapons table. The only residual "Attack" on those pages is the enemy's *skill* of that name in its action pattern and behaviour forecast, which is correct.
- **Live, stock project.** The unmodified Demo, whose `System.json` literally contains the English names, opened in a Japanese editor shows 最大HP / 攻撃力 / 魔法防御 / 敏捷性 / 運 on the Classes grid with no English leak — the fallback the PR describes.
- **New UI strings** (`Ex-Parameter`, `Param`, `Max TP`, `Unknown`, `Level`, `EXP`, `HP`, `MP`, `Troop`) are present in all 17 non-English locales.
- **Two hardcoded parameter lists remain** in `DatabaseEditorUI.js` (the Terms page's own schema). Those are correct as they are: they label *which slot* each field edits, so reading `terms.params` there would make the page label every field with its own value.

No defects found. Nothing needed fixing.

## Integration

- No conflicts; merge commit `a4920cd`. The PR's changelog entries landed under the local `[Unreleased - 0.98.7]` heading.
- Editor-only: no `runtime/` or `template/` changes, so no runtime revision bump; `sync-runtime.cjs --check` is clean.

## Verification

- Complete Node suite after the merge: **3,258 passed** (3,256 before), zero failures.
- The contributor again reports "24 pre-existing failures" in their tree; none here or in CI's clean clone.

Not pushed. No release, deployment or GitHub message was performed.
