# Events navigation, Database focus and States layout

The map sidebar Events list had no keyboard-navigation binding or focus behavior. In Events mode, the global map shortcut handler received arrows and Enter first. The list now uses the existing shared list-navigation helper: Up/Down selects adjacent rows, Home/End selects the first/last row, and Enter edits the selected event. Sparse event IDs and list rebuilds are supported. Selection scrolling is immediate so rapid navigation reveals the selected row. Left/Right in the list no longer move the map cursor. Map canvas shortcuts remain available outside sidebar lists.

The bright line above a Database list was Chromium's automatic focus outline clipped by the list panel. Lists now suppress that outer outline and show a theme-colored inset outline on selected rows when using the keyboard. Events uses the same focus treatment.

States Duration now puts numeric/dropdown labels before their controls, keeps checkboxes eight pixels from their labels, with a compact label/control grid. The subsequent layout revision below replaces the initial 420px card cap with a shared Duration/Notes area. Dependent turn/damage/walking settings retain their show/hide behavior and field handlers. Checkbox text remains clickable.

## Verification

A native before-fix probe reproduced the missing event navigation, default list outline and 128px checkbox-to-label gaps. Screenshots are `/tmp/rr-sidebar-before-{focus,states}.png`; the probe result is `/tmp/rr-sidebar-before-result.json`.

The full Node suite passes **3,048 tests** (`/tmp/rr-sidebar-tests.log`). The native runner uses disposable Demo copies and real WebDriver mouse/key input. It checks focus, sparse IDs, bounds, scrolling, list rebuilds, Enter dispatch, prevention of map cursor movement, inset row focus, Duration layout, dependent fields, Tab between turn fields and numeric-input keyboard isolation. Enter dispatch is intercepted to verify the selected event and avoid changing fixture content.

```sh
node --test editor/tests/*.test.cjs
DISPLAY=:0 node editor/tests/smoke/nw-sidebar-states.cjs --size=1600x900 --evidence=/tmp/rr-sidebar-wide
DISPLAY=:0 node editor/tests/smoke/nw-sidebar-states.cjs --size=1280x720 --language=zh-Hans --theme=light --evidence=/tmp/rr-sidebar-compact
```

Run visible native tests sequentially. Editor remains 0.98.6; runtime remains 20260911.3. These fixes affect editor navigation and layout only.

**38 native checks passed** across 1600×900 English/dark and 1280×720 Simplified Chinese/light. [Recorded results](sidebar-states-native-2026-09-11.json). Screenshots are `/tmp/rr-sidebar-{wide,compact}-{focus,states}.png`.

## States layout revision

Following the wide-screen screenshot, States now has General and Traits in its first row, then Messages and a shared Duration/Notes area. Duration and Notes sit side by side when at least 576px is available; below that they wrap. At a detail-pane width of 760px or less, the main cards stack. Card spacing is consistent, Notes fills its available card height, and DOM order follows the visual reading order.

The States trait table's separate marker column is hidden, with hover/selection drawn inside the Type cell instead. The header and first visible body cell now share the same left edge, including a selected row. Existing trait selection and action handlers remain active.

The full suite passes **3,048 tests** (`/tmp/rr-states-layout-tests.log`). The native runner additionally checks card positions, wrapping, header/body alignment, trait selection, and a 1000px-wide Database window to exercise the single-column layout.

**54 native checks passed**, across 1920×1000 English/dark and 1280×720 Simplified Chinese/light, plus the narrower Database window in each run. [Results](states-layout-native-2026-09-11.json). Screenshots: `/tmp/rr-states-layout-{wide,compact}-{layout,narrow}.png`.

## Audio list focus follow-up

The Audio Player list had the same clipped automatic focus outline. Its outer outline is now suppressed; keyboard selection uses a theme-colored inset outline on the selected track. Shared audio-picker rows use the same inset outline. Playback and selection logic are unchanged.

**36 native checks passed** in dark and light themes: BGM/BGS/ME/SE navigation and focus, shared audio-picker focus, and no captured application errors. [Results](audio-focus-native-2026-09-11.json). The runner is `editor/tests/smoke/nw-audio-focus.cjs`; screenshots are `/tmp/rr-audio-focus-{dark,light}-{player,picker}.png`. This CSS-only fix was checked with native UI tests and patch hygiene; the full Node suite was not rerun.
