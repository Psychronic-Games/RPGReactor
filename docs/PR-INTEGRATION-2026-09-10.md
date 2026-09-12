# PR #55 integration — 2026-09-10

[PR #55](https://github.com/Psychronic-Games/RPGReactor/pull/55), “Say which enemy actions can actually be chosen, and when,” was already merged upstream. Local `main` fast-forwarded from `8bb3f5b` to `57321067eaabf668aaeff802230cc6fb3530a677`. The editor remains 0.98.6; no runtime behavior changed and revision remains `20260907.3`.

## Incoming behavior and integration

Enemies gain a collapsible Behaviour forecast showing adjustable battle conditions, eligible actions and their selection shares, and explanations for unreachable actions. The editor reads known VisuStella Battle AI settings from a cached project plugin manifest; the party-size lookup shares that reader. The PR supplies 17 new interface strings across 17 non-English locales, marked by its author as a first pass needing native-speaker review.

All existing tracked and untracked working files were backed up and stashed before the fast-forward. Restoring them produced one conflict in `editor/CHANGELOG.md`; the incoming feature description and the complete local 0.98.6 notes were retained. CSS, script loading and the enemy editor merged with the earlier work. Authored Demo data/assets and project-specific plugin manifests were not changed by this integration.

## Corrections found during verification

The incoming 14 forecast tests passed, but seven added behavioral cases failed against the incoming implementation:

- Random and casual styles still used classic rating filtering. They now give the modeled usable actions equal shares. Gambit selects the first usable row and explains priority blocking; non-rating modes omit the rating ceiling. This follows the documented [VisuStella selection styles](https://www.yanfly.moe/wiki/Battle_AI_VisuStella_MZ).
- Independent turn samples missed repeating conditions whose first intersection occurs later. A fixture usable on turn 57 was incorrectly labelled impossible. The audit now checks a complete joint cycle within its budget and reports uncertainty when that cannot be covered.
- An authored zero Max TP was replaced with the default 100. Forecasts now preserve zero.
- Rounding resource-rate endpoints could miss an integer value inside a narrow valid interval. The audit samples neighboring integer values around each boundary.

The UI also states the engine's strict rating window correctly. These are editor analysis corrections; they do not alter battle resolution. Plugin notetags, skill sealing and other unmodeled requirements remain outside the analysis. This pass is not a full compatibility certification for a VisuStella game.

## Verification

- Full combined automated suite after the [issue #54 work](UI-KEYBOARD-AUDIT-2026-09-10.md): **3,022 pass**, zero failures/skips/cancellations.
- Forecast regressions: **21 pass**. Running the same tests against the incoming module produces 14 passes and seven failures.
- `editor/tests/smoke/nw-pr55-integration.cjs`: **13 native checks pass**, covering the live pool, MP changes, random/gambit behavior, rapid revisits, Cancel cleanup, preserved action/skill records and no captured runtime errors. It uses generated in-memory database fixtures and an isolated profile.
- Existing native interaction audit: **47 checks pass** after the combined changes.
- JavaScript syntax checks and patch hygiene pass. The new keyboard CI job is configured but has not run on GitHub.

Logs: `/tmp/rr-pr55-forecast-before.log`, `/tmp/rr-pr55-forecast-after.log`, `/tmp/rr-pr55-native.log`, `/tmp/rr-pr55-issue54-tests.log`, `/tmp/rr-pr55-issue54-interactions.log`, `/tmp/rr-pr55-issue54-syntax.log`.

## Recovery and scope

The original working-file archive, patch, status and starting commit are in `/tmp/rr-pr55-integration-20260910-_qa75xmm/`. Stash `f4bbf4bcac6ade0ef7eab5514c44ebcab3555ce9` is retained as another recovery point. The temporary directory is local recovery material, not a permanent archive.

The earlier Dropbox reconciliation remains intact. Integration corrections and issue #54 changes remain local and uncommitted. No push, release, deployment, GitHub comment or issue closure was performed. Platform packaging and full game playthroughs were not repeated.
