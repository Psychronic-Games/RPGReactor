# PR #56 integration — 2026-09-11

[PR #56](https://github.com/Psychronic-Games/RPGReactor/pull/56), “Stop assuming one way of counting battle turns,” was already merged upstream. Local `main` fast-forwarded from `57321067eaabf668aaeff802230cc6fb3530a677` to `ab75fc9d6b170d5cd60661edaa487bee7e3187a7`. The editor remains 0.98.6.

## Integration

The enemy behaviour forecast now includes turn 0 in its reachability search when the enabled VisuStella Battle AI manifest specifies on-the-spot counting. Its Turn control accepts and clamps to the appropriate minimum, and a translated note explains the uncertainty. The forecast does not assume that the project's battle system can be determined at edit time.

Restoring local work produced conflicts in the reviewed translation catalog, forecast module, and forecast tests. The merged result preserves both the incoming changes and the earlier integration corrections:

- The complete joint-cycle turn sweep now accepts the incoming minimum turn, preserving late repeating-condition intersections and audit-budget uncertainty.
- Random/casual/gambit selection, authored zero Max TP, and narrow resource-interval handling remain intact.
- All of today's Simplified Chinese corrections remain in the reviewed catalog, alongside the PR's new explanatory sentence in all 17 non-English locales.
- Incoming and local tests are retained, with two additional tests for their combined behavior.

The enemy editor and changelog merged automatically. All 100 pre-existing working files outside the PR's five changed paths were verified against their backup hashes; Git-normalized line endings in `docs/PERFORMANCE.md` were restored to the original bytes. Untracked feedback, tests, and Demo assets were preserved. No runtime or authored project data changes were introduced by this integration.

## Verification

- Complete automated suite: **3,029 passed**, zero failures, skips, or cancellations.
- Native editor smoke test `editor/tests/smoke/nw-pr56-integration.cjs`: **25 checks passed**, no captured runtime errors. Covers earlier forecast behavior, turn-zero eligibility, input clamping, the explanatory note in English and Simplified Chinese, preserved Chinese terminology, and unchanged authored actions/skills. Uses an isolated profile and disposable in-memory fixtures.
- JavaScript syntax and patch hygiene checks pass.

Logs: `/tmp/rr-pr56-full-tests.log`, `/tmp/rr-pr56-focused.log`, `/tmp/rr-pr56-native.log`.

## Recovery

The original working-file archive, hashes, patch, status, and starting commit are in `/tmp/rr-pr56-integration-20260911-w90806z1/`. Stash `f494294144c500e57aca832b1f05b955afa5e222` is retained as another recovery point.

Existing work and integration adjustments remain local and uncommitted. No push, release, deployment, or GitHub message was performed. These checks verify editor integration, not a full VisuStella game playthrough.
