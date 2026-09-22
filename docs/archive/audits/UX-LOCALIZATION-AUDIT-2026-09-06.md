# UX and localization audit — 2026-09-06

The pass covers database and event authoring, nested pickers, theme consistency, and the newer Battle Room, Action Sequence and map Media Surface tools. It uses disposable Demo copies and isolated editor profiles. Authored project data and runtime/plugin behavior are outside these editor-only changes.

## Findings and fixes

| Finding | Correction | Verification |
| --- | --- | --- |
| New battle widgets translate internally, but the source inventory did not recognize their labels. | Inventory shared text, message, field, number, section, button, element and option helpers; include runtime template names and validation messages displayed by the editor. | Inventory regressions and per-language catalog coverage. |
| Action steps, playback controls, templates, camera settings, assignments and help still contain English. | Add/correct 114 source phrases across the 17 non-English languages (1,908 changed catalog entries). Route sequence validation through translation too. | Native coverage of 142 displayed phrases; every captured phrase has a translation in all 17 languages. |
| Labels assembled with actor names, target numbers or camera enums cannot translate reliably. | Parameterized labels insert authored values literally once. Friendly motion/camera/axis labels replace raw enum/property display. | Placeholder tests, native step forms and room setup; saved enum IDs remain unchanged. |
| Already translated labels retain the wrong language when switching while a panel is open. | Retain original source/parameters on shared labels; update dynamic inspectors, references and room camera hints. Preserve authored option names through an explicit raw option path. | Native German → Arabic → English switches preserve the record, selected step and editor instance. |
| Arabic transform controls and headings inherit inconsistent direction. | Use logical text alignment/header borders; keep spatial numeric and timeline controls left-to-right. Bound translated button/header widths. | 36 sequence layouts at 1280×720 and 1920×1080, no database overflow, preview height at least 120px; Arabic and German screenshots inspected. |
| Selected action buttons use the link-blue token regardless of theme. | Item/weapon/armor operations, party changes, self switches, event location and map scroll use paired accent foreground/background colors. Animation Change uses the same pair. Selected rows follow the palette instead of inherited blue. | Native event/nested-dialog theme matrix; explicit off-palette button check. |
| Some theme states have poor contrast. | Darken standard-light picker arrows; correct Creamsicle Dark primary foreground; pair three older dialog actions with accent foregrounds; improve primary normal/hover contrast and inactive condition labels. | Contrast regression covers all 14 palettes; native computed-style sampling. |
| Redrawing controls can leave detached selects in a MutationObserver record and crash the theming shim. | Skip disconnected selects before marking/wrapping them; allow wrapping after reattachment. | Reproduced during native language audit; regression covers removed nodes, detached subtrees, reattachment and preserved selection. |

## Repeatable checks

Run from the repository root:

```sh
node --test editor/tests/*.test.cjs
node editor/tests/smoke/nw-ux-localization.cjs
node editor/tests/smoke/nw-command-database-audit.cjs
```

The language smoke test exercises every step type, model transform and formation controls, 36 sequence layouts, 18 Battle Room inspectors and 18 Media Surface panels. It checks live switching, authored-name preservation, source-to-display routing, catalog coverage and uncaught errors. Screenshots and JSON are written to a printed temporary artifact directory.

The broader native audit covers 123 event-command entries, 19 database sections, 56 nested dialogs, and 32 menu/theme/language cases. Its default matrix repeats command/nested-dialog checks across all 14 themes. `RR_AUDIT_PALETTES=gold,creamsicle,royalty` narrows a diagnostic rerun; the default remains the full matrix.

## Evidence and coverage limits

- Automated suite: 2,924 tests passing, `/tmp/rr-ux-full-final2.log`.
- Native localization/layout pass: `/tmp/rr-ux-localization-report-yb1Mgu/audit.json`, screenshots in the same directory, `/tmp/rr-ux-native-final3.log`.
- Final native matrix: all 14 themes pass, with zero sampled contrast below 3:1, off-palette buttons, missing color tokens or captured errors. Primary normal/hover contrast tests enforce 4.5:1. `/tmp/rr-command-database-audit-Vsdi3N`, `/tmp/rr-ux-themes-certified.log`.
- Theme matrix and computed-style evidence are linked in the companion [summary JSON](2026-09-06-ux-localization-summary.json).
- Runtime remains **20260906.19**. No runtime sync, authored project edits, commits or publication.

Catalog and layout checks are not a native-speaker review of every older translation. Project-authored names, filenames, plugin-provided prose and game dialogue retain their authored language. The native pass samples the listed editor flows; it is not certification of every OS, zoom setting, plugin or game playthrough. Before release, use these checks together with human review of the target locales and the existing release checklist.

## Conventions for further construction

- Put static UI labels through a recognized translation helper. Use complete parameterized sentences for dynamic labels; do not concatenate English prefixes with names.
- Keep authored content and stored enum IDs separate from display labels.
- Pair action backgrounds with `--color-accent-on`; use palette selection tokens for selected rows. Reserve link colors for links.
- Exercise normal, hover, selected and disabled states. Check long translations and Arabic at the minimum window size with an open inspector, not just the English screen.
- Preserve selection, uncommitted data, focus and scroll when redrawing. Test both attaching and disposing asynchronously populated controls.
