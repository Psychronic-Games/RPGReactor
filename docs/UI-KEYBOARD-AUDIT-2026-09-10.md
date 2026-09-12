# Keyboard and UI audit — issue #54

This addresses the seven reports in [GitHub issue #54](https://github.com/Psychronic-Games/RPGReactor/issues/54), on the tree containing [PR #55](PR-INTEGRATION-2026-09-10.md) and the earlier local 0.98.6 work. Runtime revision remains `20260907.3`.

## Changes

| Report | Result |
| --- | --- |
| Map-tree arrow selection | Up/Down and Home/End navigate visible maps in Map Tree and Quick Access. Selection uses the existing map-load/unsaved-change path. A pending keyboard position supports rapid navigation, and old completions cannot clear a later request. The global Event-tool shortcut handler yields when focus is in a map list. |
| Small assigned tileset names | The A1–A5/B–G layer rows use 13px filename text with normal text contrast and a tooltip containing the full name. |
| Trait window changes size across tabs | Shared Trait and Effect editors use a fixed 500px frame capped at 88vh. Their bodies scroll while tabs, header and footer retain their space. This covers traits on all database record types and the analogous item/skill effect dialogs. |
| Audio, plugin and resource list navigation | A shared list binding handles Up/Down and Home/End, skips hidden rows, retires old listeners on rebinding, and retains list focus after details rebuild. Resource Manager opens with focus in its file browser and adds folder-list navigation. |
| Focus leaves Database/Resource entries | Database keyboard selection explicitly retains entry-list focus. Native checks cover deferred rendering and switching into a detail input. Resource previews retain file-browser focus. File-picker Home now selects the first row even when no previous selection exists. |
| Unchecked event conditions show defaults | Switch 1, Switch 2, Variable (including its threshold) and Self Switch display blank while disabled, matching Item and Actor. Checking them restores stored values; toggling does not erase IDs, thresholds or letters. |
| Arrow keys dismiss popups | The shared themed dropdown now takes focus, consumes navigation keys, skips disabled options and scrolls within its own list. Enter commits; Escape restores focus without committing. SearchSelect also supports highlighted keyboard choices. Deferred popup setup cannot attach listeners after retirement; Resource Manager yields Escape to its nested dropdown. |

Opening a short themed dropdown previously left keyboard focus behind. Native arrow scrolling could then reach the underlying window, whose scroll event dismissed the popup. Giving the popup keyboard ownership removes that path. No blanket interception of all application arrow keys was added: editable fields retain normal keyboard behavior.

## Reproduction and checks

`editor/tests/smoke/nw-issue54.cjs` uses a disposable Demo copy, two generated flat maps, an isolated NW.js profile and `issue54-setup.js`. Its initial comparison against a separate pre-fix application reproduced **23 failures among 113 UI checks**. The final runner adds four checks using real WebDriver key input in short and searchable themed dropdowns.

- **117 checks pass** at 1600×900 in English/dark and 1280×720 in Simplified Chinese/light; no captured uncaught errors or unhandled rejections. The final map test runs with Events active.
- The matrix covers 12 Database entry sections, keyboard focus after deferred rendering, detail-input ownership, every Trait/Effect tab, inactive condition round trips, filename sizing/tooltips, Audio Player, Plugins, Resource Manager and shared dropdowns.
- Four new automated tests verify list rebinding/focus, hidden rows, editable-control isolation, dropdown navigation/disabled choices, Enter and Escape cleanup. Existing DOM test helpers now implement the attributes and focus operations these widgets use.
- Full suite: **3,022 pass**, zero failures/skips/cancellations. Existing **47 native interaction checks** also pass. JavaScript syntax and patch hygiene pass.

Run from `editor`:

```bash
npm test
npm run smoke:nw-keyboard -- --size=1600x900
npm run smoke:nw-keyboard -- --size=1280x720 --theme=light --language=zh-CN
npm run smoke:nw-interactions
```

The keyboard runner accepts `--nw-root`, `--app-root`, `--evidence` and `--probe`. The new CI step uses the pinned NW.js SDK and uploads the result JSON and screenshot; the workflow has only been exercised locally, not on GitHub.

Local evidence: `/tmp/rr-issue54-before.log`, `/tmp/rr-issue54-final.log`, `/tmp/rr-issue54-small.log`, `/tmp/rr-issue54-final-result.json`, `/tmp/rr-issue54-small-result.json`, `/tmp/rr-issue54-final-after.png`, `/tmp/rr-issue54-small-after.png`, `/tmp/rr-issue54-keyboard-tests.log`. Pre-fix source backup: `/tmp/rr-issue54-source-e0o6hmjm/`.

This is sampled native Linux/NW.js verification, not a claim that every widget, input device, theme, locale or platform has been tested. The popup and tabbed-dialog fixes apply through shared implementations; unrelated custom controls retain their own interaction contracts. No authored user-project data was saved, and the GitHub issue remains open pending publication/review.
