# Keyboard menus, context menus and dialogs — 2026-09-12

Closes the gaps the [September 11 audit](KEYBOARD-SUPPORT-AUDIT-2026-09-11.md) left open: top menus, database categories, every context-menu family, modal focus containment, and the Script editor's Shift+Tab. One shared helper, `editor/src/utils/KeyboardNavigation.js`, supplies the behaviour; each menu owner keeps its own rendering and close path.

## Behaviour

- **Menubar.** Headings are Tab stops (F10 focuses the first). Enter, Space or Down opens a menu with its first row active; Up opens it at the last row. Up/Down/Home/End move, Enter runs the row, Left/Right carry an open menu to the neighbouring heading, Escape closes and returns focus to the heading. Pointer hover and the active row stay in sync.
- **Context menus** (map tree, Quick Access, map events with submenus, database lists, Types, plugin list, text-code fields). Up/Down/Home/End skip separators and disabled rows and wrap at the ends; Enter or Space runs the row; Right opens a submenu with its first row active and Left or Escape closes only that layer; Escape closes the menu and returns focus to the list that opened it. Rows carry `role="menuitem"` and the active row the `rr-menu-key-active` class.
- **Database categories.** One Tab stop on the active category; Up/Down/Home/End open the neighbouring section and keep focus on it; Enter or Space opens the focused one.
- **Dialogs.** Options, About, the event command picker, the switch/variable picker, Plugin Manager, the Database viewer, the Trait and Effect editors, and the themed confirmation/New Project/optimizer dialogs all take focus on open, keep Tab and Shift+Tab inside, close on Escape, and hand focus back to the opener. Nested dialogs own their own Escape; the parent never sees it.
- **Database Escape.** Escape is Cancel, as in the dialog it mirrors, but a changed database asks first (Discard / Cancel). An unchanged one closes at once.
- **Options dropdowns.** Down on the language or palette trigger opens the list with its first entry active; Escape closes the list and returns to the trigger.
- **Switch/variable picker.** Up/Down/Home/End move the highlighted row; Enter picks it. The list keeps one Tab stop.
- **Trait/Effect editors.** Left/Right/Home/End walk the tab strip.
- **Script editor.** Tab still indents; Shift+Tab removes one indentation level and, on an unindented line, leaves the field.
- **Plugin Manager.** The plugin list is focusable from the first open, so its existing list navigation works immediately.

## Verification

- `npm test` includes `tests/keyboard-navigation.test.cjs`: row movement, separators and disabled rows, submenu layering, opener focus return, Tab containment, roving lists, outdent.
- `npm run smoke:nw-menus` (`tests/smoke/nw-keyboard-menus.cjs`) presses real keys through WebDriver: F10, the menubar, map/event/text context menus, database categories, the Escape discard prompt, the Trait tab strip, Options dropdowns, Plugin Manager and About. It is a CI gate.
- The observational `tests/smoke/nw-keyboard-menu-audit.cjs` now records every menu entering on Down and closing on Escape, and every listed dialog containing Tab, closing on Escape and restoring its opener.
- Results and screenshots: `/tmp/rr-keyboard-menus-20260912-*`, `/tmp/rr-keyboard-menu-audit-20260912-*`.

## Limits

- Menus open from the keyboard through their headings or Enter on a selected row's editor; a Shift+F10/Menu-key route to context menus on list rows is not added.
- Not certified here: every event-command form, 3D authoring panel, build/export dialog, Forge screen and plugin-defined UI. The shared helper applies only where a dialog calls it.
- A dialog opened from inside another returns focus to that dialog, not to the editor beneath: the Trait and Effect editors hand focus back to the Database category that opened them. The observational audit, which opens them from a control outside the Database, records that as "opener not restored".
- No screen-reader claims. Roles are set on menus and rows; dialogs already declared `aria-modal` keep it.
