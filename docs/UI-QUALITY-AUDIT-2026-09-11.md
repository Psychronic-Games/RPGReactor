# Database and editor UI quality audit — 2026-09-11

Follow-up: [model inspection, richer light panels and preserved dark cost-card styling](MODEL-PREVIEWS-AND-LIGHT-THEME-2026-09-11.md).

This pass checks layout, use of space, control alignment, and resizing across the main editor UI. It fixes recurring shared problems rather than adding a separate exception for each screen. Related fields now use equal-width controls, including generated number steppers and themed selects. When a three-field row must wrap, the remaining field fills the row; Actor Class and the two level fields use a full-width class selector followed by equal-width level fields.

## Changes

| Area | Problem | Result |
| --- | --- | --- |
| Light themes | Menu and toolbar used the same gray; icons were filtered to 62% brightness, and many selections and boundaries were faint. | All seven light palettes use a white menu, colored toolbar, distinct panel frames, vivid selections, consistent field fills, and stronger boundaries. Icons retain their source colors. Table headers use a surface color rather than a border color. |
| Shared Database forms | Forms used the whole detail pane's width to decide how many fields fit inside an individual card. Numeric controls could be much narrower than neighboring selectors. | A malformed CSS comment before the reusable form-grid rule is removed. Card-width queries regroup fields; paired controls have matching edges. Action buttons wrap when needed. |
| Actors | A tall Images card stretched Profile into a large empty textarea and delayed the Traits card. Extra preview frames consumed space. | Independent columns put Traits directly beneath General. Profile keeps its natural height. Image slots share the available width with less nested padding. |
| Database lists and categories | Selection fills touched the scrollbar; the category scrollbar was gray against gray in dark mode. | Both columns have symmetric 6px side insets and a small top/bottom inset. Categories use a vivid accent-colored scrollbar with a distinct track. Row content keeps its previous alignment and focus stays inside the row. |
| Trait tables | The separate marker column left headers and content visually offset. | Actors, Classes, Weapons, Armors, Enemies, and States use an inset marker in the Type cell. |
| System 1 | The base grid rule overrode the small-pane breakpoint. Starting Map/X/Y values had very little room beside spinner buttons. | Three/two/one-column layouts apply in the correct order; position values use aligned controls with Browse alongside when space permits. |
| System 2 | Three columns squeezed Advanced values at small widths. Pixelated Rendering inherited text-field sizing; the attack table had a bordered gap above its header. | Cards wrap to two or one column. The checkbox stays square and the table starts flush inside its border. |
| States | Message labels followed their inputs. | Labels precede the fields, with consistent label and field columns. |
| Tilesets | Empty A-tab image buttons extended into horizontal scrolling alongside reserved preview columns. | A1–A5 buttons wrap within the available area; unused preview columns do not consume empty-state space. Assigned sheets retain their zoom and scroll behavior. |
| Interface editor | The Layout heading could split in the middle of its word beside the tool strip. | The heading remains intact and the tools wrap onto another line. |
| 3D Models | Floating cards could cover the tool strip; narrow sidebars and longer translated buttons could overflow. | Preview cards stay within the viewport, browser/inspector widths adapt, and section actions fit or wrap. |
| Plugin Manager | A window sized or positioned on a larger viewport could reopen partly offscreen after resizing. | Opening, app-window resizing, dragging, and resizing keep the dialog within the viewport. |
| Generated number steppers | Hiding an input could leave its generated arrow buttons visible, including the Common Event switch field. | The generated wrapper follows its input's hidden state through CSS. Trigger changes still show and hide the complete control. |
| Sound slots / Effects | Random-pitch and Grow amounts lost most of their text area to stepper buttons. | These numeric fields have room for their values and controls. |

The earlier 48px icon and editor event-model lighting work is documented separately in [Event lighting and icons](EVENT-LIGHTING-AND-ICONS-2026-09-11.md). This UI pass does not change the runtime revision.

## Coverage and method

Native Linux NW.js runs use a disposable copy of Demo and isolated preferences. They open actual editor screens, select records, inspect rendered geometry, capture screenshots, and exercise conditional fields. No production project data is modified.

- **All 20 Database sections:** Actors, Classes, Skills, Items, Weapons, Armors, Enemies, Troops, States, Animations, Tilesets, 3D Models, Common Events, User Interfaces, Action Sequences, Quests, System 1, System 2, Types, Terms. A representative Quest fixture supplies a populated form.
- **22 dialog surfaces:** Plugin Manager with a selected plugin, Resource Manager, Options, About, event-command picker, switch picker, confirmation, audio picker, system sound, Database, Trait, Effect, Audio Player, Deploy, Map Properties, Event Editor, Show Text, Choices, Variables, Conditional Branch, Picture, and color picker.
- **15 additional tab views per size:** six Trait tabs, four Effect tabs, five Conditional Branch tabs.
- **Desktop sizes:** 1920×1080, 1366×768, 1280×720. A 1024×768 layout stress test temporarily lowers the minimum size only inside the disposable test session. The shipped desktop minimum remains 1280 pixels wide.
- The checks detect stretched checkboxes, visible fields narrower than 40 pixels, controls protruding from their parents, unexpected horizontal pane overflow, and dialogs extending outside the viewport. Paired-field widths are checked to within a pixel. Database rows retain at least 6px between their edges and the list scrollbar; the final English size matrix verifies entry gutters, and the theme run verifies both entry/category gutters in all 14 variants. Common Event trigger changes verify complete spinner visibility; Actor Profile and the System 2 checkbox receive explicit geometry checks.
- Screenshot review supplements geometry checks: a layout can technically fit while still wasting space or arranging controls poorly. Transparent native selects behind themed triggers are excluded from visible-control measurements.

Source review also covered shared form, modal, table, list, preview, and number-stepper styling, plus the principal Database and event-command renderers. Individual plugin-defined forms, every dynamic event-command branch, external Forge applications, operating-system file dialogs, browser/mobile builds, and screen-reader behavior are not certified by this pass. Existing keyboard gaps are tracked in the [keyboard audit](KEYBOARD-SUPPORT-AUDIT-2026-09-11.md); visual layout checks are not a keyboard accessibility certification.

## Verification

**3,050 Node tests pass.** Native layout runs cover **399 screen/tab cases** with **35 additional field-alignment and conditional-control checks**, and report no captured application errors:

| Locale / theme | Viewport sizes | Database / dialog / tab cases |
| --- | --- | --- |
| English / dark | 1920×1080, 1366×768, 1280×720, 1024×768 | 80 / 88 / 60 |
| Simplified Chinese / light | 1280×720, 1024×768 | 40 / 44 / 30 |
| German / dark | 1280×720 | 20 / 22 / 15 |

The theme run verifies 23 enabled toolbar icons in each of **14 theme variants**, checking both image and parent filters/opacity after transitions finish. The same run checks entry/category gutters, scrolling to the last category, and category scrollbar/track contrast of at least 3:1 in every theme. In all seven light palettes, **112 body/secondary-text color pairs** across menu, toolbar, panel, input, button, hover, pressed, and selection tokens exceed 4.5:1 (lowest measured ratio: **4.64:1**). Field-border/input contrast exceeds 3:1, primary-button text exceeds 4.5:1, and rendered menu/toolbar backgrounds are distinct. These checks cover the listed colors and surfaces, not every possible rendered text combination or a whole-app accessibility certification.

The disposable 16px-tile / 288px-face / 48px-icon regression passes **33 native checks**. All 13 bundled projects match `runtime/`. [Native results](ui-quality-native-2026-09-11.json) retain geometry, theme-color, and asset evidence.

Representative screenshots:

- Actors: [before](ui-quality-2026-09-11/actors-before.png) / [after](ui-quality-2026-09-11/actors-after.png).
- Skills field alignment: [before](ui-quality-2026-09-11/skills-before.png) / [after](ui-quality-2026-09-11/skills-after.png).
- Light theme: [workspace](ui-quality-2026-09-11/light-workspace.png), [States](ui-quality-2026-09-11/light-states.png), and [Ocean States](ui-quality-2026-09-11/ocean-light-states.png).
- Database category and record gutters: [dark States](ui-quality-2026-09-11/dark-states.png).

 The regression runner is [nw-ui-quality.cjs](../editor/tests/smoke/nw-ui-quality.cjs); normal mode asserts the geometry contract, while `--probe` records geometry findings for investigation.

```sh
node --test editor/tests/*.test.cjs
DISPLAY=:0 node editor/tests/smoke/nw-ui-quality.cjs --evidence=/tmp/rr-ui-final
DISPLAY=:0 node editor/tests/smoke/nw-ui-quality.cjs --sizes=1280x720,1024x768 --language=zh-Hans --theme=light --evidence=/tmp/rr-ui-zh-final
DISPLAY=:0 node editor/tests/smoke/nw-ui-quality.cjs --sizes=1280x720 --language=de --theme=dark --evidence=/tmp/rr-ui-de-aligned
DISPLAY=:0 node editor/tests/smoke/nw-small-tiles.cjs --tile-size=16 --face-size=288 --icon-size=48 --evidence=/tmp/rr-ui-art-regression
DISPLAY=:0 node editor/tests/smoke/nw-ui-quality.cjs --themes-only --evidence=/tmp/rr-light-quality
node editor/build-scripts/sync-runtime.cjs --check
```

Native runs should execute sequentially because they use real desktop windows.

## Database number-field appearance follow-up

Generated Database number fields used the generic spinner's grey surface and inherited larger text. Their wrappers now match Database field backgrounds and accent borders, with 13px text, 4px vertical/8px horizontal padding, and 20px themed arrow controls. Light variants use the same white field fill and border as adjacent selectors. Skills Invocation row spacing is reduced from 10px to 8px; labels and responsive column alignment are retained.

Eight native Skills/Items cases pass across 2048×1094 and 1280×720 in dark/light mode: number backgrounds and borders match adjacent selectors, controls are 27px high, panels do not overflow, and increment buttons update the field. Existing number-stepper and skill-message tests also pass. [Native measurements](database-number-fields-2026-09-11.json), [large dark view](ui-quality-2026-09-11/number-fields-dark.png), [small dark view](ui-quality-2026-09-11/number-fields-small-dark.png).

## Starting Positions and Database menu follow-up

Starting Positions keeps Map/X/Y labels attached to their fields and places Browse alongside them when space permits. The control groups wrap naturally in narrow cards. Native checks cover all four owners at card widths 720px, 400px and 280px with no control overflow; the three existing start-location picker tests pass.

The HTML Database menu now includes 3D Models, Quests, System 1 and System 2. The native menu also includes Action Sequences and Quests, and uses the 3D Models label. Both menus now expose all 20 sidebar sections in the same order. The HTML dropdown scrolls within shorter windows. Native checks confirm sidebar/menu parity, opening the five added or updated destinations, and scrolling the final Terms entry into view. [Position measurements](starting-position-layout-2026-09-11.json).

## Database table surfaces and hover feedback

Shared Database table cells now have a distinct neutral fill instead of matching their containing card. Hover and keyboard row focus use the theme's selection fill across the whole row. Existing trait/effect/action/learning selection handlers use that same fill, including the handlers that set inline colors; selected rows remain highlighted after the pointer leaves. Cell spacing and header styling are unchanged.

Verification: all 3,052 Node tests pass. Native dark/light checks cover Music, Sound, and tables in Actors, Classes, Skills, Items, Weapons, Armors, Enemies and States: distinct cell/card backgrounds, real pointer hover, restoration on leave, and persistent selection where available. [Measurements](database-table-hover-2026-09-11.json), [dark preview](ui-quality-2026-09-11/table-hover-dark.png), [light preview](ui-quality-2026-09-11/table-hover-light.png).
