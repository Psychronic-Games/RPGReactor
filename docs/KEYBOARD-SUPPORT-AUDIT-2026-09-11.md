# Editor keyboard support audit — 2026-09-11

> Superseded for menus, categories and dialog containment by the [September 12 follow-up](KEYBOARD-MENUS-AND-DIALOGS-2026-09-12.md). The tables below describe the state before that change.

Keyboard support is partial. The earlier work substantially improved lists and shared selectors, but it did not provide a consistent keyboard contract for menus, category navigation, or modal dialogs. Tab works on native fields/buttons, yet many dialogs let it reach the editor underneath. This pass records current behavior; it does not change production behavior.

## Evidence and scope

- Fresh run of `editor/tests/smoke/nw-issue54.cjs`: **117 checks passed**, no reported interaction errors or failures. Includes twelve database entry lists, map navigation, plugin/resource/audio lists, shared dropdowns, and real WebDriver arrows/Enter in small and searchable selects. Most other checks in that existing suite dispatch DOM keyboard events.
- New observational runner, `editor/tests/smoke/nw-keyboard-menu-audit.cjs`: real WebDriver key presses across **seven top menus, five context-menu families, twelve dialogs, two Options dropdowns**, representative database fields, and switch-picker/button activation. It records missing behavior rather than treating an existing gap as a regression failure.
- Related Node tests: **22 passed** (`issue54-keyboard`, `database-navigation`, `picker-arrow-keys`).
- Native Linux NW.js, Chromium 144, disposable Demo project and isolated preferences. Production project data was not edited. No Windows/macOS/browser-build or screen-reader claims.
- Raw observations: [keyboard-menu-audit-2026-09-11.json](keyboard-menu-audit-2026-09-11.json). Local screenshots/logs use `/tmp/rr-keyboard-menu-audit-20260911*`; existing-suite evidence uses `/tmp/rr-keyboard-audit-20260911-existing*`.
- Opening methods were invoked directly so each surface could be tested independently of mouse-only launchers. Dialog boundary checks focus the first/last visible enabled tab stop, then send Shift+Tab/Tab. They establish containment, not a complete accessibility certification or a guarantee for every dynamic form.

## Current support

### Menus and navigation

| Surface | Current behavior | Evidence |
| --- | --- | --- |
| File, Database, Plugins, Tools, Forge, Build, Help menu headings | Headings have `tabIndex=-1`. Down does not enter an open menu; Escape leaves it open. Most command rows are also unfocusable. Help contains one focusable control, but this does not provide menu navigation. | Live; `UIManager.js:47`, `index.html:59` |
| Database category sidebar (20 categories) | Plain clickable divs, skipped by Tab; no category arrow/Enter handling. This is distinct from the working entry lists. | DOM inspection; `DatabaseEditorUI.js:1649` |
| Map/Quick Access context menu family | No focusable command rows, arrow navigation, or Escape dismissal. | Live common renderer; `ProjectController.js:1658` |
| Event map context menu | No focusable command rows; Down does not enter; Escape does not close. Hover/click submenu construction has no equivalent keyboard navigation. | Live root, source submenu; `EventManager.js:765` |
| Database context menus | Escape closes. Native buttons support Tab and Enter once focused; disabled rows are skipped. Opening does not focus the menu; Down does not enter it. | Live; `DatabaseEditorUI.js:1310` |
| Plugin context menus | Escape closes; command rows are unfocusable divs with no arrow/Enter navigation. | Live paste-only popup plus common row source; `PluginManager.js:2649` |
| Text-field/text-code context menus | Escape closes; command rows are unfocusable divs. No keyboard route through commands/submenus. | Live safe fixture plus source; `utils/TextCodeMenu.js:218` |
| Database entry lists | Up/Down selects records while keeping focus in the list. Typing/arrow use inside detail inputs stays with those inputs. | Fresh existing suite, twelve sections |
| Map sidebar Events (subsequent fix) | Click or Tab focuses the list; Up/Down/Home/End select events, Enter edits the selected event. List keys no longer reach map cursor shortcuts. | [Native follow-up](SIDEBAR-AND-STATES-2026-09-11.md) |
| Map tree and Quick Access | Existing list navigation handles Up/Down/Home/End with map selection/load and focus preservation. | Existing suite/source; earlier detailed audit linked below |
| Plugin, resource, audio file lists | Shared keyboard selection works. Folder controls support native activation and Left/Right expansion where implemented. | Existing suite; `utils/PickerIndex.js` |
| Shared themed selects and SearchSelect | Arrows navigate enabled choices, Enter commits, Escape cancels/closes and returns focus. Nested resource selectors take priority over their parent. | Fresh existing suite, including real WebDriver keys |
| Options language/palette dropdowns | Enter opens the native trigger button. Down does not move focus into choices; Escape leaves the dropdown open. These are separate implementations from the working shared selects. | Live; `OptionsManager.js:350` |
| Switch/variable picker | Focus starts on the selected row. In the switch probe, Down stayed on #0001, Tab reached #0002, and Enter selected #0002. Variable mode shares the same implementation. | Live switch, source shared mode; `event/SwitchVariablePicker.js` |

### Dialog focus and Escape

“Contained” means both forward Tab from the last control and Shift+Tab from the first control remain inside the dialog. “Restores” refers to the tracked opener after Escape. A dash means Escape did not close the dialog, so restoration could not be assessed through that route.

| Dialog | Focus enters on open | Tab / Shift+Tab contained | Escape closes | Escape restores opener |
| --- | --- | --- | --- | --- |
| Resource Manager | Yes | Yes / Yes | Yes | Yes |
| Audio picker | Yes | Yes / Yes | Yes | Yes |
| System sound slot | Yes | Yes / Yes | Yes | Yes |
| Switch picker | Yes | No / No | Yes | Yes |
| Themed confirmation | Yes | No / No | Yes | Yes |
| Plugin Manager, first open in this run | No | No / No | No | — |
| Options | No | No / No | No | — |
| About | No | No / No | No | — |
| Event command picker | No | No / No | No | — |
| Database viewer | No | No / No | No | — |
| Trait editor | No | No / No | No | — |
| Effect editor | No | No / No | No | — |

The Plugin Manager source attempts to focus its list at the end of `show()`, but the initial-open probe retained the prior focus. Manually focusing that list enables the working list navigation covered by the existing suite. Child plugin dialogs have their own handlers; the main-window finding must not be applied to all children.

For common failing cases, forward Tab landed on the main language button; reverse Tab reached an underlying map option or the audit opener. A visible overlay therefore does not reliably keep keyboard interaction in the active dialog. About also uses a clickable span for its close control, which is skipped by Tab.

Relevant implementations: `OptionsManager.js:219`, `event/EventCommandPicker.js:331`, `event/SwitchVariablePicker.js:65`, `UIManager.js:1268`, `database/DatabaseTraitEditor.js:97`, `database/DatabaseEffectEditor.js:120`, `ResourceManager.js:1080`, `utils/AudioPickerModal.js`, `utils/SystemSoundSlotModal.js`.

### Fields, Tab, and specialized editors

- Native buttons and form fields participate in ordinary browser tab order. All eight sampled database controls (search, actor text/number fields, a textarea, and a checkbox) advanced with real Tab and returned to the original control with Shift+Tab. This is separate from the failed modal-boundary checks above.
- A database action-menu fixture confirmed that Tab skips a disabled button and Enter activates the next enabled button. This is not a guarantee that every custom disabled-looking element is correctly removed from tab order.
- **Script event-command editor traps both Tab and Shift+Tab.** `event/commands/ScriptEditor.js:146` unconditionally prevents Tab's default action and inserts four spaces, without checking Shift. Tab indentation is intentional for code; inserting indentation on Shift+Tab and offering no traversal through these keys is a keyboard accessibility gap. This finding is source-verified, not part of the native dialog matrix.
- Ordinary multiline text should retain Enter for line breaks; numeric controls should retain their own arrow behavior. Global Enter-to-accept and arrow interception would break normal editing.

## Additional source coverage and limits

| Surface | Source finding | Verification limit |
| --- | --- | --- |
| Event command list | Focusable list root; scoped copy/cut/paste/select-all/Delete handlers. No Up/Down/Enter command-selection handling found in this class. | `event/EventCommandList.js:519`, `:727`; not a live command-editing test |
| Trait/effect tab strips and command-picker pages | Clickable native tab buttons allow Tab/Enter; no arrow-key tab-strip handler found. | Source; live dialog boundary tests do not assert every tab |
| Complex plugin parameter dialog | Implements initial focus, Escape, and Tab/Shift+Tab wrap. | `PluginManager.js:622`; do not infer identical support in nested structure/array/add-plugin dialogs |
| NW.js version picker | Handles Up/Down/Enter; Escape and Tab close its popup. | `NwVersionPicker.js:162`; source only |
| Color picker | Escape closes; swatches are native buttons. No grid-arrow or modal Tab-boundary handling found. | `utils/ColorPickerModal.js:84`; source only |
| Icon picker | Escape closes; icon selection is canvas-based, with no keyboard grid-selection handler found. | `utils/IconPicker.js:154`; source only |
| Text-code reference panel | Has arrow selection and Enter insertion in its own handlers, unlike the text context popup. | Existing implementation; not a new live insertion test |

This pass does not individually certify every event-command form, 3D authoring panel, build/export dialog, Forge screen, or plugin-defined UI. Shared-control findings apply only where those controls are actually used. Earlier detail: [September 10 keyboard audit](UI-KEYBOARD-AUDIT-2026-09-10.md), [September 7 navigation audit](UI-NAVIGATION-AUDIT-2026-09-07.md).

## Recommended implementation order

1. Make top menus, database categories, and context commands keyboard reachable. Add a shared menu pattern for directional navigation, Enter/Space activation, Escape dismissal, submenu navigation, and disabled-item skipping.
2. Standardize modal opening focus, Tab/Shift+Tab containment, deepest-layer Escape handling, and opener restoration. Preserve existing Cancel/unsaved-change behavior instead of bypassing it.
3. Bring Options dropdowns and switch/variable rows onto the existing shared selector/list behavior; add keyboard navigation for tab strips and event commands.
4. Address the Script editor traversal trap and canvas picker navigation. Keep code indentation and ordinary text-editing semantics explicit.
5. Turn the accepted behavior into regression assertions, including nested menus, disabled controls, textareas, and focus restoration. Retain the current passing list/dropdown checks.
