# Editor audit — 2026-09-04

This pass covers event-command authoring, database editing, localization routing,
and editor themes. It changes editor behavior only; runtime revision remains
**20260904.17**. The machine-readable [coverage matrix](2026-09-04-editor-matrix.json)
lists every command, database section, and nested dialog exercised.

## Database state follow-up

The subsequent [database sequence audit](DATABASE_STATE_AUDIT.md) exercises
section/record transitions, delayed work, reused dialogs, and Apply/Cancel.
Its 405 live checks pass with no uncaught errors; see that report for the newer
full-suite result and the distinction between navigation and mutation coverage.

## Functional checks

The NW.js smoke opens the actual command picker and dispatches through
`EventCommandList.newCommand` and `editCommand`. All **123 picker items** were
exercised: **111 dialog create/reopen roundtrips** and **12 immediate inserts**.
The corpus includes 105 stock commands and 18 Reactor commands. Valid quest
records and a bundled image source are supplied in the disposable project for
commands that require them. Empty quest selection is tested separately.

All **19 database sections** rendered. The nested-dialog pass saved **24 trait
variants and 13 effect variants**, and checked Cancel preservation for **eight
parameter curves, EXP, class learning, seven enemy-action condition variants,
troop conditions, and animation-cell properties**: **56 cases** in total.

Fixed failures:

- Rejected Database OK/Apply saves now report failure, unlock controls, keep the
  database open, and retain edits for retry, including possible partial writes.
- Removing the final 3D binding no longer hides filesystem errors. Binding
  controls restore the saved selection after a failed write; unreadable binding
  data displays an inline error without interrupting the rest of the panel.
- Model optimization refuses malformed/non-object settings before changing model
  bytes. Animation/effect and face-point save failures display a translated
  error while retaining the draft and aborting the success path.
- Quest commands requiring a quest disable OK when none can be selected. The
  existing empty-database explanation stays visible; opening the quest log
  itself remains available.

The Demo currently references a missing `img/sv_actors/Actor2_2.png`. Its actor
panel displays **Image not found**. This is an asset diagnostic, not a dialog
failure; the audit does not replace or alter authored Demo content.

## Language checks

The expanded inventory follows inherited literal-translation helpers, helpers
with default object parameters, interpolated templates, and face-marker labels
consumed by other editors. It now finds **3,989 routed source phrases** with
**zero missing catalog entries**.

Added **88 phrases to all 17 non-English locales** (1,496 translations), covering
model cost/optimization, face points, speech, clipboard feedback, and browser
and persistence diagnostics. Existing checks verify consistent catalog keys,
placeholder preservation, command/section labels, and English fallback policy.
The previously unmapped 3D database navigation title now has translations in
all 18 locales, with a category-to-title regression check. Keyed interpolation
now inserts filenames/user text literally in one pass, so
`$&`, other replacement syntax, and embedded `{count}` text cannot corrupt it.

These are catalog/routing checks and a wording pass. They do not certify native
fluency in every locale or every long-text layout in the application.

## Themes

The desktop matrix opens all 123 command items and the 56 nested database cases
under **seven palettes in both light and dark modes**. Transitions are frozen
for computed-style sampling so intermediate colors are not mistaken for settled
palette failures. Disabled controls and decorative arrows are classified
separately from enabled text. Normal body text, warning text, and error text
meet **4.5:1** against nested input backgrounds in all 14 themes.

Fixed hardcoded hover backgrounds, script and parameter input text, selection
text, warning/error colors, class-curve panel backgrounds, and delete buttons.
The 3D record selection and plugin comparison panel now use defined accent
colors instead of falling back to unrelated blue colors. A regression check
rejects unresolved editor color tokens. Asset pixels, axis/channel colors, and
intentional game-preview backgrounds retain their meaning.

The shared database context menu also passes viewport containment, translated
labels, action dispatch, and dismissal in **32 cases**: all 14 themes and all
18 locales. English dark/light and Arabic light curve-dialog screenshots were
reviewed for the nested layout.

## Reproduction and limits

Final regression result: **2,628 passed, 3 failed** (2,631 tests). The three
failures are the existing `stock-interfaces.test.cjs` expectations for the
authored Demo title layout; no new failure remains. Targeted persistence,
localization, binding, quest-availability, and theme tests pass. The final
3D navigation-title correction passes the 22-test localization suite, which
adds one case beyond that full-suite run.

Run the regression suite from the repository root:

```sh
node --test editor/tests/*.test.cjs
```

For the interactive desktop audit, with a display and the bundled Linux NW.js
Chromedriver available:

```sh
node editor/tests/smoke/nw-command-database-audit.cjs
```

The smoke copies `template/Demo` to a temporary directory, removes only the
**copied** lock, uses an isolated profile, and cleans up that project/profile on
exit. JSON results and screenshots remain in the printed artifact directory.
`RR_AUDIT_SKIP_THEMES=1` skips only the lengthy command/subdialog palette matrix
when rerunning the remaining checks.

The editor corpus verifies default/sample command serialization and normal
nested save/cancel behavior. Existing runtime tests cover command execution,
battle events, quests, media, model animation, lighting, speech, and persistence.
This is not proof of every combination of event branches, target IDs, assets,
plugins, platforms, and runtime scene states. Asset-dependent pickers, native
file dialogs, and every auxiliary database form are not each covered by a
separate GUI roundtrip in this matrix. Model sidecars continue to save
immediately; Database Cancel is not a transaction over already-saved sidecars.
