# Changelog

All notable changes to RPG Reactor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Forge — Character Generator

#### Changed

- **ASCII gap fill now closes 2-cell and 2x2 dimples reliably** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — `RR_CG_fillAsciiPinholes` now runs three passes instead of one and relaxes the 2-3 cell crack rule so each blank cell only needs solid support on one side (above or below for horizontal cracks, left or right for vertical). Added an explicit 2x2 dimple pass that fills small square holes with 7+ surrounding solid pixels. Filling is now on by default for registered style sheets too, only disabled when callers pass `repairAscii: false`.
- **Letter `Z` is now the character outline, not eyebrow** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`, `src/forge/CharacterGenerator/CharacterGenerator.js`) — analyzed body sheets quantize the dark silhouette border to `Z`. The renderer now maps `Z` to a near-black outline color (matching `N`) instead of `brow.deep`, so the entire character silhouette no longer renders in the eyebrow color. Eyebrow material moved to `M`, and the importer brow heuristic now retags `T/D` above eye clusters to `M`.
- **Looseleaf male body template replaced with full Z-outline sheet** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`) — switched to the new ASCII sheet that uses `Z` as the explicit body outline throughout, `M` for hair/eyebrow material, `W` for eye whites, `I/J/U` for iris tones, and `E/Q` for underwear. This is the first body sheet that takes advantage of the expanded A-Z material slots end-to-end.

#### Changed (other)

- **Procedural humanoid base restyle** (`src/forge/CharacterGenerator/parts/body/`) — replaced the front-only anatomical mannequin bodies with a shared 144×144 anime/pixel-art humanoid base that renders all 4 walking directions and 3 walk frames. The new proportions keep the larger frame for future hair, hats, weapons, and oversized equipment while using a more RPG-sprite-readable head, eyes, limbs, feet, and ground shadow.
- **Procedural male running-template reset** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — threw out the first scaled-grid mannequin attempt and restarted from a single hand-authored forward-idle pixel template. The new square-one pass isolates a bald/body-only chibi sprite using explicit 48×48 logical-pixel spans so the base silhouette can be judged before walking frames, side/back views, clothing, or hair are reintroduced.
- **Default procedural preview temporarily isolates the body layer** — the adventurer outfit and shaggy hair parts remain registered, but `_buildActiveParts()` now renders only the active body while the base sprite is being rebuilt from the template.

#### Added

- **Template PNG → ASCII analyzer** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — added an `Analyze Template PNG...` utility to the procedural Character Generator. It loads an original sprite PNG/JPEG/WebP, auto-crops the first cell of a 3×4 character sheet when possible, preserves the source cell dimensions when they fit inside the 144×144 frame, classifies pixels into the body template's ASCII palette letters, and shows copyable rows for `human_base_shared.js`. This gives us a real pixel-analysis workflow for rebuilding the procedural base from reference art instead of eyeballing screenshots.
- **Full 3×4 ASCII sheet templates** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — the analyzer now emits a paste-ready `RR_CG_BODY_TEMPLATE_SHEET[direction][frame]` table when it detects a full walking sheet, and the procedural body renderer selects the correct ASCII cell by current direction/frame.
- **Safer ASCII sheet paste format** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — analyzer output now uses `window.RR_CG_BODY_TEMPLATE_SHEET = [...]` instead of a top-level `const`, avoiding redeclaration mistakes and making the paste location less fragile. The renderer accepts both the older const style and the new window assignment.
- **ASCII templates render at native size** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — body templates now stay at their source ASCII-pixel dimensions inside the configured frame instead of scaling up to fill the frame. Oversized templates still scale down to fit.
- **Configurable procedural frame size** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — the Procedural tab now exposes frame width/height controls and uses the configured size for preview, template analysis fit checks, and 3×4 sheet export. Frame size persists through the shared Character Generator config.
- **ASCII template alignment controls** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — the Procedural tab now has Align X (Left/Center/Right) and Align Y (Top/Middle/Bottom) controls for positioning native-size ASCII sprites inside the configured frame. Alignment persists in Character Generator config.
- **Character Style selector** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — added a shared style selector with `Looseleaf` as the first style. Built-in procedural parts are tagged as `looseleaf`, and PNG parts now load from style-specific folders under `forge/character_generator/styles/<style>/parts/`.
- **Drag/drop layer ordering for PNG parts** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — Parts (PNG) category rows are now draggable layers in addition to the existing up/down buttons. Layer order persists per character style.
- **Looseleaf body sheet split + ASCII gap cleanup** (`src/forge/CharacterGenerator/parts/body/`) — moved the large Looseleaf male ASCII sheet into `looseleaf_male.js` so `human_base_shared.js` remains the shared renderer. Added conservative cleanup for isolated pinholes plus short 2-3 cell blank runs with solid support above/below or left/right, reducing tiny analysis gaps without closing intentional limb spaces.
- **Looseleaf male ASCII source gaps filled** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`) — applied the gap cleanup directly to the stored ASCII sheet, replacing short internal blank cracks with neighboring shade letters so the source template itself no longer carries those visible pinholes.
- **ASCII analyzer background masking improved** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — replaced per-pixel background removal with an edge-connected flood-fill background mask so dark outline pixels on opaque-background source sheets are not mistaken for transparent holes. Expanded the analyzer/render letter palette with additional dark, tan, and cream shade buckets for better Looseleaf-style fidelity.
- **Looseleaf ASCII material palette split** (`src/forge/CharacterGenerator/CharacterGenerator.js`, `src/forge/CharacterGenerator/parts/body/`) — separated ASCII letters into skin, underwear/cloth, and iris material buckets. Skin letters now follow `skinColor`, underwear uses its own new `underwearColor` parameter, and future analyzer output uses `I` for iris pixels instead of overloading `E`.
- **Procedural walking preview** — the Character Generator preview now has Play Walk / Stop Walk controls plus direct frame buttons, so generated characters can be judged in motion before exporting the 3×4 sheet.

#### Fixed

- **Procedural saved sheets had blank side/back rows** because the male/female body parts returned early for every direction except front. Side, back, and walking-frame previews now render for both base body types.
- **ASCII template alignment controls had no effect** (`src/forge/CharacterGenerator/CharacterRenderer.js`) — `CharacterRenderer.resolveParams()` discarded non-schema params, so internal renderer values like `style`, `alignX`, and `alignY` never reached the body renderer. It now preserves user-supplied extra params while still filling schema defaults.
- **Underwear color changed eye whites and eye color changed nothing** (`src/forge/CharacterGenerator/parts/body/`) — remapped `Y` to fixed eye-white/cream instead of underwear highlight, kept `E` as underwear/cloth, and converted Looseleaf male iris clusters from `K` to the new `I` eye-color letter.
- **Looseleaf iris now has bright and shadow tones** (`src/forge/CharacterGenerator/parts/body/`) — added `J` as a darker eye-color shade and converted lower iris clusters in `looseleaf_male.js` so changing `eyeColor` affects both the bright/top and darker/bottom eye pixels.
- **ASCII body interpreter now uses expanded material letters** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — added A-Z semantic color slots for skin, underwear, iris, eye whites, mouth/blush, shadows, and eyebrow-ready letters instead of reusing the same few symbols for unrelated materials.
- **Looseleaf male eye and underwear colors no longer collide** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`) — moved lower-torso `I/J` pixels to cloth letters (`E/Q`) so eye color only affects head eye detail, and underwear color affects the body underwear region.
- **Looseleaf sheets now register only by style/variant** (`src/forge/CharacterGenerator/parts/body/`) — removed the legacy global `RR_CG_BODY_TEMPLATE_SHEET` fallback path so reloads cannot accidentally pick up stale global template data.
- **Template analyzer now emits style-specific sheet JS** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — generated full-sheet ASCII targets `window.RR_CG_BODY_TEMPLATE_SHEETS[style][variant]` and uses the expanded material palette for quantizing imports.
- **Looseleaf eyebrow pixels are now separate from the eye cluster** (`src/forge/CharacterGenerator/parts/body/looseleaf_male.js`) — restored the full `Y/K/J` eye cluster so `eyeColor` affects both upper and lower eye pixels, and retagged the dark brow-line pixels above the front eyes as `Z`.
- **ASCII importer now applies safer Looseleaf semantic cleanup** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — after raw color quantizing, analyzed body sheets retag lower-body eye-like letters to underwear and infer brow candidates from dark `T/D` pixels across the rows above detected eye clusters, never from the eye cluster itself.
- **ASCII analyzer now has a material-paint editor** (`src/forge/CharacterGenerator/CharacterGenerator.js`) — analyzer results include a zoomed pixel grid, A-Z material palette, full-sheet direction/frame selectors, and live regenerated ASCII/JS so imported sprites can be corrected by painting material letters directly onto pixels.
- **Eyebrow material now uses the picked eyebrow color directly** (`src/forge/CharacterGenerator/parts/body/human_base_shared.js`) — remapped `Z` from a very dark derived brow shade to `brow.base`, making eyebrow pixels visibly follow `eyebrowColor` instead of resembling skin/outline colors.

### Theming system

Major theme expansion building on the token foundation shipped in 0.9.0.

#### Added

- **`File → Options...`** menu and OptionsManager modal (`src/OptionsManager.js`) for editor preferences. First section is Appearance (theme picker); future settings categories plug in here.
- **Multi-theme system** with 7 palettes × Dark/Light modes = 14 themes total. Each palette is a self-contained `:root[data-theme="<name>"]` block in `css/theme.css`:
  - **Default** (Gold) — original gold-on-black; Light variant uses yellow `#ffe97a` interactive accents on neutral light gray
  - **Bubblegum** — vivid hot-pink (`#ff6fa8` dark / `#c2185b` light) cute palette on pink-tinted surfaces
  - **Ocean** — cool sky-blue (`#5dade2` dark / `#2e86c1` light) on blue-tinted surfaces
  - **Cascadia** — Pacific NW evergreen (`#51cf66` dark / `#2e7d32` light) on green-tinted surfaces
  - **Underworld** — blood-red crimson (`#e74c3c` dark / `#c62828` light) on red-tinted surfaces
  - **Orange Creamsicle** — bright tangerine (`#ff9f43` dark / `#d35400` light); Light variant uses warm cream-white with orange dropdowns matching the namesake
  - **Royalty** — royal purple primary (`#af7ac5` dark / `#8e44ad` light) with deliberate gold trim — borders/dividers stay gold even on purple, hitting the crown-jewel aesthetic
- **`.rr-dark-surface` utility class** (`css/theme.css`) — drop-in CSS island that re-declares the dark-theme tokens for any element subtree. Applied to the main map editor canvas (`<div id="canvas-container">`) and the animation editor preview canvas so they stay dark/cinematic regardless of which light theme the user picks.
- **`--color-bg-toolbar` token** — dedicated value for the top menu bar, submenus, and modal header strips (was previously hardcoded `#111111`). Stays `#111` in dark themes, light grays in light themes, themable per palette.
- **Themed textarea resize handle** — `::-webkit-resizer` styled with a gold-on-dark-gold diagonal stripe on `.database-field-value` textareas. No more harsh white system square in the bottom-right corner.

#### Changed

- **Light theme palette refined** — surfaces are now neutral light grays (`#e0e0e0` page, `#ededed` panels, `#ffffff` content), with the brand accent color appearing only on interactive elements (inputs, dropdowns, buttons, hover/selected rows). Visual hierarchy reads gray-chrome → white-content → colored-accent.
- **Notes textareas** (database actor/weapon/armor/item/skill notes) — `resize: vertical` + `box-sizing: border-box; max-width: 100%` so they can't be stretched past the parent card. `white-space: pre; overflow-x: auto` on the note field specifically so plugin notetags stay aligned and scroll horizontally instead of wrapping. Description/profile fields keep normal word-wrap (narrative text).
- **Top menu bar / submenus / modal header strips** migrated from hardcoded `#111111` to `var(--color-bg-toolbar)`. Theme-switchable while staying near-black in dark mode.
- **Map Tree / Quick Access tabs** migrated initial inline styling from hardcoded `#1e1e1e`/`#252526` to theme tokens.
- **`select` element global rule** (`css/theme.css`) now uses `--color-bg-input` instead of `--color-bg-panel` semantically (a select IS an input). Side benefit: dropdowns now have more contrast against panels in dark mode (`#2d2d2d` vs `#111`).
- **Tool button `.active` state** got a stronger visual treatment in light themes (deeper accent fill + accent-deep border + inset shadow) so toggled toolbar buttons like Event Manager read unmistakably as "on". Dark mode behavior unchanged.
- **Theme picker UX** — switched from a flat radio list to Palette dropdown + Mode toggle. Picker stays compact regardless of how many palettes get added; new palettes only need a `THEME_PALETTES` registry entry in `src/OptionsManager.js`.

#### Fixed

- **SelectThemingShim popup couldn't open twice in succession** (`src/utils/SelectThemingShim.js`) — `closeOpenPopup()` removed the popup DOM but left document-level `closeOnOutside`/`escClose`/`scrollClose` listeners attached. After picking an option, the next mousedown event triggered the stale listener which then immediately closed the newly-opened popup. Fix: store the cleanup function on a module-level `openPopupCleanup` ref and call it from `closeOpenPopup()` so listeners always tear down whether the popup closes via option-click, outside-click, escape, or scroll.
- **Hue slider rainbow gradient disappeared in dark mode** — the new global `input[type="range"]` styling for the parameter-curve sliders overrode `.hue-slider` due to higher selector specificity (`input[type="range"]::-webkit-slider-runnable-track` = 0,1,2 vs `.hue-slider::-webkit-…` = 0,1,1). Re-scoped the hue slider rules under `input[type="range"].hue-slider` so they match specificity and source-order win, and explicitly styled `::-webkit-slider-runnable-track` and `::-moz-range-track` with the rainbow gradient.
- **Top menu bar / modal headers were darker** in dark mode after the inline `#111111` migration changed to `--color-bg-menubar` (`#2d2d30`). New `--color-bg-toolbar` token preserves the original `#111` in dark while still being themable for light themes.
- **Toolbar button active state** had no visual difference from hover in light mode (both used bg-deep white + dark border). Light themes now apply a deeper accent fill, accent-deep border, and inset shadow only under `:root[data-theme="<palette>-light"]` scope.
- **Various hardcoded color regressions in About dialog and Audio Player** — `color: #ccc` text was unreadable on light theme bg. Migrated all `color: #ccc;`, `color: #999;`, `color: #aaaaaa`, `color: #cccccc`, `background-color: #1e1e1e/#252526/#3c3c3c/#3e3e42/#2d2d30/#111111`, `border: 1px solid #555/#3e3e42/#2a2a2a` instances in `index.html` to theme tokens.

#### Notes

- **Pattern:** dark-theme defaults stay in the base `:root` block untouched. Every light-mode tweak (sidebar header strip, database section header gold, tool button active treatment, OS popup color-scheme) lives under `:root[data-theme="<palette>-light"]` multi-selectors. Adding a new light palette is: (a) copy a theme block in `theme.css`, (b) append palette to `THEME_PALETTES` registry in `OptionsManager.js`, (c) add the `<palette>-light` name to the four multi-selector lists. See the in-file comments for the canonical pattern.

### Forge — Animation Generator

Major expansion of the in-editor Animation Generator: per-layer keyframes, animated GIF + MP4 textures as input, animated GIF export, three new animations, and a sweep of texture-correctness bugs across the existing 3D shapes.

#### Added

- **Keyframe system per layer** (`src/forge/AnimationGenerator/AnimationGenerator.js`) — every animation layer now keeps a `keyframes[]` array with per-frame snapshots of all slider/color/texture params, and `layer.params` is a live reference to the active keyframe. Linear interpolation runs over sliders and RGB colors between keyframes; the params object stays the same shape so existing animation renderers don't need changes. Add / remove / select via the layer panel; legacy single-params layers auto-migrate on load.
- **Smooth texture cross-fade between keyframes** — when two adjacent keyframes use different texture files, the renderer dual-renders the segment (once with the "from" texture, once with the "to" texture on an offscreen) and alpha-blends with `u` = segment progress. Pure linear cross-fade across the keyframe interval.
- **Per-keyframe layer opacity** — the layer-panel opacity slider now writes to the active keyframe instead of the layer as a whole, so opacity can animate alongside the rest of the params. Linear interpolation, same shape as slider params.
- **Layer duplication** — clone the active layer (including its keyframes) via the layer panel.
- **Animated GIF textures** (`src/forge/AnimationGenerator/helpers/texture.js`) — texture picker now accepts `.gif` files. Loader parses via `gifuct-js`, composites every frame (handling disposal types 1/2/3) into per-frame canvases, and decorates each canvas with `complete`/`naturalWidth`/`naturalHeight` so existing animation renderers treat each frame as a regular image. `gifFrameAt(gif, tFrac)` picks the frame that should be visible at the current loop fraction; any animation that consumes `_textureImage` animates the texture automatically without per-animation changes.
- **Video textures (MP4/WebM/MOV/M4V/OGV/OGG)** — texture picker now accepts video files too. `_loadVideoTexture` seeks a hidden `<video>` frame-by-frame at 24 FPS (capped at 240 frames / 10 seconds) and captures each frame to its own canvas, returning the same shape as the GIF object. New `animatedFrameAt(tex, tFrac)` is a generic frame picker that handles either format. Decode is async — the cache holds the stub immediately so subsequent lookups don't re-trigger decode; preview/sheet redraw once frames are ready.
- **Save preview as animated GIF** — new "Save GIF" button in the footer renders every preview frame via `gif.js`, writes through an NW.js Save As dialog (defaults to `img/animations/`), and shows encoding progress on the button label. Background transparency preserved via chroma-keying: pixels with alpha < 128 stamp to magenta (`0xFE00FE`), and the encoder is told to mark that exact palette entry transparent.
- **Bullet animation** (`src/forge/AnimationGenerator/animations/Bullet.js`, category Object) — proper 14-sided cylindrical body capped by an 8-ring ogive nose (`r(t) = R·√(1 − t²)`). Brass default color, full 3D rotation + texturing.
- **Portal animation** (`src/forge/AnimationGenerator/animations/Portal.js`, category Energy) — Stargate-style shimmering portal driven by an Almeros-style discrete wave-equation water simulation (`new = ((L+R+U+D)/2 − prev) · damping`). Pre-computed depth maps cached per `(gridSize, frameCount, rainCount, damping, rainSeed, dropSpread)`; `SETTLE_LOOPS = 3` convergence runs give a stable periodic state. `dropSpread = 0` drops every wave source at the centre so the surface reads as concentric rings instead of scattered raindrops. Per-pixel refraction uses `|strength|` so wave troughs brighten symmetrically to crests — no more black-pocket pin-pricks where the wave goes negative. Randomize keeps `cycX/Y/Z`, `pulse`, `gridSize`, `rainSeed`, `dropSpread`, `centerX/Y`, and `opacity` at their current values so each roll shows a different portal flavour without flipping orientation.
- **Effect animation category** (`src/forge/AnimationGenerator/registry.js`) — new category added to `RR_CATEGORY_NAMES` alongside Geometric / Energy / Object.
- **Hypnotize animation** (`src/forge/AnimationGenerator/animations/Hypnotize.js`, category Effect) — per-pixel Archimedean spiral `u = (r/R)·stripeCount − (θ/τ)·twist`. `twist` is consolidated from a separate arm-count + spirality pair into a single integer-step-2 parameter — the seam-safety constraint (twist must be even for the spiral to wrap cleanly at θ = ±π) is now enforced by the param schema so the user can't accidentally produce a mismatched stripe at the discontinuity.
- **Acid Trip animation** (`src/forge/AnimationGenerator/animations/AcidTrip.js`, category Effect) — N-fold mirror-symmetry kaleidoscope with three-harmonic sinusoidal noise for organic flow and HSL colour cycling for psychedelic palette. Integer cycle counts keep the loop seamless. `rotationSpeed` parameter lets the mandala spin.

#### Fixed

- **GIF texture animation didn't pick up keyframe frame index** (`_renderParamsFor`) — when a texture param resolves to an animated GIF, the renderer now passes the current `frameIdx` to `gifFrameAt(tex, fIdx / frameCount)` so the GIF's playback timeline tracks the animation's loop fraction. Same path now handles video textures via `animatedFrameAt`.
- **Hypnotize cyan blob in the centre** (`Hypnotize.js`) — local variables for the parsed RGB components of `color2` were named `r2`/`g2`/`b2`, shadowing the `r2 = dx² + dy²` squared-distance accumulator used later in the same loop. The shadow turned the spiral colour expression into garbage near the origin, producing a cyan splat. Renamed to `cr1/cg1/cb1` and `cr2/cg2/cb2`.
- **Bullet texture rendering** (`animations/Bullet.js`) — three bugs at once. Side quad winding (`[a, b, c, d]`) and tip-fan winding (`[a, b, tip]`) were CW from outside, so backface culling kept the rear of the bullet and dropped the front. Side UVs were `[[0,0],[1,0],[1,1],[0,1]]` on every quad — every segment stretched the entire texture instead of a `1/SIDES` slice. Now `[a, d, c, b]` / `[a, tip, b]`, per-segment U around the cylinder, V along the full bullet length, and the base cap uses radial disc projection.
- **Backface-cull threshold conflated face area with angle** (`src/forge/AnimationGenerator/helpers/shape3D.js`) — the cull compared the *unnormalised* cross-product `n_z` against `0.01`. Tiny faces (e.g. the bullet's tip-apex triangles, where `n_z ≈ 0.003` even when facing the camera dead-on) got culled even at proper outward orientation. Now normalises before comparison: `n_z / |n| <= 0.01` is a true ≈cos(89.4°) angular cutoff that ignores face size. Fixes the tip-cap rendering as a side effect.
- **Egg "inverted poles" texture bug** (`animations/Egg.js`) — middle-band quad winding `[rs+nxt, rs+lon, rn+lon, rn+nxt]` was CW from outside, so the front half got culled and the rear half rendered (with the UVs reading in the reflected direction). The poles' caps wound correctly, so the eye saw "front-facing poles plus a mirrored body" — the visual signature of "inverted poles". Flipped to `[rn+lon, rs+lon, rs+nxt, rn+nxt]`.
- **Egg horizontal texture mirroring** (`animations/Egg.js`) — same issue as `Sphere.js`'s `u = 1 - i / meshLon` fix from 0.9.0: the CCW winding wraps U clockwise around the equator, so equirectangular textures (text especially) render reversed. Added `u(lon) = 1 - lon / LON` for all three face groups (top cap, middle, bottom cap).
- **Torus side-quad winding** (`animations/Torus.js`) — `[idx(i, j), idx(ni, j), idx(ni, nj), idx(i, nj)]` was CW from outside. Flipped to `[idx(i, j), idx(i, nj), idx(ni, nj), idx(ni, j)]` so the tube's outward normal points radially out and the camera-facing half stays visible.
- **Coin and Crown side-band winding + UVs** (`animations/Coin.js`, `animations/Crown.js`) — both inherited the same CW-from-outside side-quad winding (`[i, SIDES+i, SIDES+n, n]`), and both stamped the full texture on every segment via `stripUV = [[0,0],[1,0],[1,1],[0,1]]`. Now `[i, n, SIDES+n, SIDES+i]` with per-segment `u0..u1 = i/SIDES..(i+1)/SIDES` so a texture wraps once around the rim. Cap UVs upgraded from a flat per-triangle slice to a proper radial disc projection so circular textures (a coin face, a crown gem) render as a disc instead of a tiled wedge fan.
- **Rock middle-ring triangle winding** (`animations/Rock.js`) — the two triangles per quad (`[rs+nxt, rs+lon, rn+lon]` and `[rs+nxt, rn+lon, rn+nxt]`) shared the same CW-from-outside winding as the buggy Egg quad, so the rock's front faces were culled and the back rendered. Now fanned CCW from the lower-left vertex: `[rn+lon, rs+lon, rs+nxt]` / `[rn+lon, rs+nxt, rn+nxt]`. (Cap fans were already correct — same convention as the egg's caps.)

#### Notes

- **Animated texture object shape** is now uniform across GIF and video: `{ isGif|isVideo: true, ready: bool, frames: HTMLCanvasElement[], delays: ms[], totalDuration: ms, width, height }`. Frame canvases are decorated with `complete: true`, `naturalWidth`, `naturalHeight` so any animation that checks `tex.complete && tex.naturalWidth > 0` keeps working — the per-frame canvas *is* the texture image for that frame. Frame selection goes through `animatedFrameAt(tex, tFrac)`; the original `gifFrameAt` is preserved for callers that explicitly want the GIF path.
- **Texture-mapping convention for 3D shapes** is documented inline at the top of `helpers/shape3D.js`: face vertex order is CCW from outside; render3DShape builds `n = (vs[1] - vs[0]) × (vs[2] - vs[0])`, normalises, and backface-culls anything with `n_z / |n| <= 0.01`. New shapes should match this. Verified-clean shapes from the audit pass: Cube, Pyramid, Cone, Saw Blade, Dodecahedron (auto-oriented at build time), Mobius / Double Helix / Scythe (`doubleSided: true`, cull bypassed), Sword / Knife / Hammer / Arrow (all composed from the verified `makeBox` / `makeTaperedPrism` / `makeOctahedron` helpers).

## [0.9.0] - 2026-05-31

Editor polish + completion of the PIXI v5→v8 migration. Theme tokens shipped across the entire UI; new Parameter Curve and Terms.Messages editors; actor equipment dynamically filtered by class traits; map editor parallax bleed eliminated via canvas crop; v8 migration functionally complete (Tilemap, UltraMode7, Effekseer, video, cursors).

### Added

- **Theme token system** (`css/theme.css`) — single source of truth for colors, spacing, radii, fonts. Every editor and `src/**/*.js` migrated to `var(--token)` references; ~5500 token usages across the codebase. Foundation for future theme switching.
- **`src/utils/ThemeColors.js`** — `ThemeColors.resolve(name, fallback)` helper for canvas 2D contexts (which can't parse `var(--…)`). Used by class parameter curves, animation editor placeholders, icon-picker highlight, troop selection highlight, transfer-player map thumbnails.
- **`src/utils/SelectThemingShim.js`** — global custom-dropdown shim. Wraps every native `<select>` with a div-based gold-themed popup to defeat KDE Plasma's pale-blue option highlight. `MutationObserver` catches dynamically-added selects. Opt-out via `data-no-shim="1"`.
- **Range slider theme rules** (`css/theme.css`) — dark track + gold-accent thumb across `-webkit-` and `-moz-` variants. Applied globally to `input[type="range"]`.
- **Parameter Curve editor** (`src/database/DatabaseClassEditor.js`) — click any of the 8 parameter mini-curves in the class editor → modal with Lv1/Lv99 sliders + curve shape exponent (0.30 fast → 3.00 slow) + live preview canvas + reverse-fit so slider opens at the existing curve's shape. Apply writes to `classEntry.params[paramIdx]` and refreshes both the mini-curve and the Lv1→Lv99 readout.
- **Terms → Messages editor** (`src/DatabaseEditorUI.js`) — fourth Terms category covering all 53 MZ message strings (Options menu, Audio Volume, Save/Load, Battle Flow, Battle Damage, Battle Effects), each with a per-field placeholder hint explaining what each `%N` becomes in plain English (e.g. Actor Damage shows `%1 = actor name, %2 = damage amount`).
- **Animation editor polish** (`src/database/DatabaseAnimationEditor.js`) — frame multi-select + clipboard + Delete; SE & Flash Timings selection/clipboard with max-height; custom gold dropdowns for Position/Background/Target; hue slider with real-time sprite-sheet preview; cell properties modal restyle; Display Type dropdown with correct MZ semantics.
- **Database editor polish** — Types and Terms editor complete redesign (`src/DatabaseEditorUI.js`); Items general section tight grid layout (`src/database/DatabaseItemEditor.js`); System2 Game ID editable; "No effects/No traits" rows now align with table headers in Items, Skills, Weapons, Armor, Enemies, States.
- **Actor equipment slot filtering** (`src/database/DatabaseActorEditor.js`) — equipment slots and dropdown options now derived from `TRAIT_EQUIP_WTYPE` (51), `TRAIT_EQUIP_ATYPE` (52), and `TRAIT_EQUIP_SEAL` (54) on the actor + class union. Unnamed `equipTypes` slots are hidden; stale equipped items surface as `(incompatible)`; section header shows the source class.
- **Chip-style button utility classes** (`css/theme.css`) — `.rr-btn-chip` (black with gray text, gold hover) and `.rr-btn-chip-danger` (red hover) for the safe-vs-destructive convention used across the app.

### Fixed

- **Effekseer animation 3D rotation sphere not rendering** (`src/database/DatabaseAnimationEditor.js`) — Canvas 2D's `fillStyle`/`strokeStyle`/`addColorStop` silently reject `var(--token)` strings. The bulk theme migration had replaced hex literals with `var(--…)` even inside canvas calls. Sphere now resolves tokens via `ThemeColors.resolve(...)`. Same bug fixed in 7 other files (animation preview placeholders, class graph fill+stroke, troop+icon-picker highlight, transfer-player map thumbnails, event command list face placeholder).
- **Class editor parameter curves only rendering 3 of 8** (`src/database/DatabaseClassEditor.js`) — Defense's entry in `paramColors` used `'var(--color-accent-bright)'`. `gradient.addColorStop(0, color + '80')` threw `SYNTAX_ERR`, the `forEach` aborted, and curves 4-7 never drew. Replaced with hex literal; all 8 curves render.
- **Map editor parallax bleed around small maps** (`src/TilemapManager.js`) — when the map was smaller than `#canvas-container` on either axis, the parallax sprite filled the leftover area. New `applyViewportCrop()` resizes the PIXI renderer to `min(containerSize, mapScaledSize)` after every scale change (load, wheel zoom, resize). Scale floor stays at contain-fit so zoom-out still reaches whole-map view.
- **Map editor zoom didn't reset on map switch** (`src/TilemapManager.js`) — loading a new map created a fresh container at scale 1.0 but no fit-to-viewport logic kicked in, leaving small maps with empty space around them. Added `applyMinScaleClamp()` to `loadMap` (and reused by the resize handler).
- **MOG_TreasurePopup pickup icons invisible on PIXI v8** (`template/Complex/js/libs/pixi_compat.js`) — plugin uses `this._cx/_sx/_cy/_sy` as screen-coordinate instance data, colliding with v8's internal cos/sin transform cache. Override of `Container.prototype.updateLocalTransform` computes cos/sin fresh from rotation+skew per call instead of reading the cache fields. Same root cause as the `_position` MOG_BattleCursor bug.
- **`Function.name` was "wrapped" for every MZ class** (`template/Complex/js/libs/pixi_compat.js`) — `MZGlobalUpgrade`'s wrapper function was named `wrapped`, and the property-copy loop explicitly skipped `name`. Plugins doing `instance.constructor.name === "Scene_Map"` got false. Now `Object.defineProperty(wrapped, "name", {value: orig.name, configurable: true})` after the `__origName` tag.
- **"Will be implemented" alert for 11 no-args event commands** (`src/event/EventCommandList.js`) — `editCommand`'s fall-through case fired for Exit Event, Get on/off Vehicle, Erase Event, Gather Followers, Save BGM, Replay BGM, Abort Battle, Open Menu Screen, Open Save Screen, Game Over, Return to Title Screen. New `NO_PARAM_EVENT_CODES` set short-circuits with a silent return — these commands have no editable parameters.
- **MZ animation additive blending rendered as normal blend** (`reactor_core.js`) — see "PIXI v8 visual-fidelity fixes" section below.

### PIXI v8 visual-fidelity fixes (2026-05-30 session 5)

Three v8 regressions uncovered during gameplay testing, all with different root causes:

#### Fixed

- **RaveLighting hole-punching with positive (white) tint** (`PSYCHRONIC_RaveLighting.js`): when tint is full-white (no darkening), lights would cut light-shaped windows in the wall of white, exposing the scene through them. Logically wrong: hole-punching only makes sense as a darkness-piercing effect. Now gated on `hasNegativeChannel || hasGrayDarkening` — overlay still draws for positive tints (color tint visible) but the `destination-out` punch-out is skipped. Lights still brighten via their own ADD-blend sprites.
- **MZ animation additive blending rendered as normal blend** (`reactor_core.js` Sprite.blendMode setter): MZ data files (animations, plugins) store v5-style numeric blend modes (0=normal, 1=add, 2=multiply, 3=screen). v8 expects strings ('add', 'multiply', 'screen', 'normal'). Our setter forwarded numbers directly to v8's blendMode setter, which silently falls back to normal blending — killing the additive-glow look (visually reads as "no transparency" because additive blends naturally fade-edge into the scene whereas normal blends look solid). Added a `_MZ_BLEND_NUM_TO_STR` mapping in the setter so numbers are converted to strings before forwarding.
- **Window backgrounds rendering near-transparent** (`reactor_core.js` `_createBackSprite`): earlier migration changed `_backSprite` from `new Sprite()` to `new PIXI.Container()` to dodge v8's "Sprite can't have children" deprecation. But Container has no texture rendering of its own — so the windowskin's solid 95×95 corner-piece background was invisible, leaving only the (mostly transparent) TilingSprite tile pattern showing. Reverted to `new Sprite()` now that the pixi_compat `Sprite.allowChildren=true` shim makes Sprite-as-parent render its children correctly.
- **Windows didn't clip overflowing content (KEY FIX)** (`reactor_core.js` Window/Tilemap/TilingSprite `updateTransform`): the actual root cause was a **silent throw**. v8 repurposed `PIXI.Container.prototype.updateTransform` from a per-frame transform-cascade method into a property-setter that takes an `opts` object — and reads `opts.x` etc. unconditionally, so calling it with no args throws `TypeError: Cannot read properties of undefined (reading 'x')`. MZ corescript's `Window.prototype.updateTransform` does `PIXI.Container.prototype.updateTransform.call(this)` near the end, RIGHT BEFORE `this._updateFilterArea()`. On v8 the super call throws, the throw bubbles up through the onRender wrapper's try/catch, and `_updateFilterArea` is never reached — meaning the window's filterArea is never sized to the visible client rect, and no clipping happens. Fix: skip the super updateTransform on v8 (v8's render pipeline computes worldTransform automatically). Same pattern fixed in `Tilemap.prototype.updateTransform` and `TilingSprite.prototype.updateTransform`.

#### Note

The window-clipping bug is the worst kind: v8 silently changed the SEMANTICS of a method that still exists on the prototype. Stack traces don't surface it because our `onRender` bridge catches the throw. The fix took several wrong turns (filterArea coord-space, boundsArea, Sprite/Graphics mask experiments) before diagnostic logging proved that `_updateFilterArea` was never running.

### PIXI v8 runtime compatibility (2026-05-30 session 4)

Deprecation cleanup + several v8 robustness issues uncovered through gameplay testing.

#### Fixed — deprecation warnings (real fixes, not suppression)

- **`PIXI.SCALE_MODES` / `PIXI.WRAP_MODES` / `PIXI.DRAW_MODES` deprecation spam** — v8 ships these as `Proxy` objects that log on every read (and the message text is itself buggy: v8's SCALE_MODES proxy says "DRAW_MODES.X is deprecated"). Shim now force-overrides them with plain objects holding the same string values on v8. Not just suppression — when v9 removes the proxies, our shim continues providing the constants so corescript and plugins keep working.
- **`Graphics#beginFill` / `Graphics#drawRect` deprecation in `ScreenSprite.setColor`** (reactor_core.js:3796) — Switched to v8's chained `graphics.rect(...).fill({color, alpha})` API with polymorphic fallback to the v5/v6/v7 imperative form.
- **`renderer.render(stage, renderTexture)` second-arg deprecation in `Bitmap.snap`** (reactor_core.js:1457) — Switched to v8's `renderer.render({container, target})` options-object with polymorphic fallback.
- **`WindowLayer.render` throwing `renderer.framebuffer.forceStencil is not a function`** (reactor_core.js:4636) — v8 removed `forceStencil` (stencil buffer is always allocated now via `stencil: true` in ContextSystem init) and removed the global `renderer.batch` flushable batcher (replaced by per-render-pipe deferred batchers). Raw GL stencil ops interleaved with v8's deferred pipeline don't honor draw order. On v8 the method now short-circuits and lets v8's render pipe iterate children naturally; the only thing lost is window-occlusion stenciling (lower-window pixels under a higher window get drawn but are immediately overdrawn — no visible regression for normal MZ usage). v5/v6/v7 keep the stock stencil-occlusion behavior.

#### Added — `template/*/js/libs/pixi_compat.js`

- **`PIXI.Sprite.prototype.destroy` idempotency patch** — v8 Sprite.destroy has a bug: `super.destroy(options)` short-circuits on already-destroyed but the code BELOW super still runs `this._texture.destroy(...)`, which throws because `_texture` was nulled on the first destroy. This crashes cascading destroys whenever a sprite was already destroyed by a plugin (e.g. `PSYCHRONIC_GifAnimationMZ.stopGifAnimation`) but somehow remained in a parent's children array. Shim early-returns if `this.destroyed` is true.
- **`PIXI.VideoSource.prototype.isValid` null-safe patch** — v8 VideoSource.load() has a race: `const source = this.resource; ...; this.alphaMode = await detectVideoAlphaMode(); this._load = new Promise((r) => { if (this.isValid) ... })`. If `Scene_Map.terminate -> VideoOverlayManager.clearAll` destroys the source during the await, `this.resource` is null when isValid resumes, and `this.resource.videoWidth` throws an uncaught Promise rejection that the MZ SceneManager surfaces as fatal. Shim makes isValid return false when resource is null.
- **`SpritePipe.{addRenderable, updateRenderable, validateRenderable}` destroyed-sprite guards** — when a destroyed Sprite (`_gpuData == null`) is still referenced by some parent's children array, v8 crashes at `_getGpuSprite` reading `null[uid]`. Shim catches and skips, logging once per offending class with parent-chain trace ("class=Sprite, parents=Tilemap < Container < Spriteset_Map < Scene_Map").
- **`Container._getGlobalBoundsRecursive` destroyed-display guard** — same pattern hit via FilterSystem._calculateFilterArea → getFastGlobalBounds, where it reads `this.effects.length` on a destroyed container (effects is null after destroy). Shim returns early.
- **`MZGlobalUpgrade` now tags wrapped classes with `__origName`** so the destroyed-sprite warnings can identify which MZ class an instance came from (instead of every wrapped instance showing as `wrapped` in `constructor.name`).

#### Fixed — `UltraMode7V8Compat` composite Sprite cascade-destroy

- **Mode7 → Mode7 scene transition left the new map without its tileset layer.** When the previous Spriteset_Map's tilemap is destroyed (with `{children: true}` cascading), our UM7V8 composite Sprite (living as `tilemap.children[0]`) is destroyed too. The lazy init only ran once per session, so on the new tilemap `ensureCompositeSprite` re-attached the already-destroyed Sprite instead of creating a new one — leading to no Mode7 ground rendering and per-frame destroyed-sprite warnings. Shim now detects `compositeSprite.destroyed` / `pixiTexture.destroyed` and re-creates both.

### PIXI v8 runtime compatibility (2026-05-30 session 3)

Fixed `PSYCHRONIC_VideoOverlay` and `PSYCHRONIC_VideoParallaxMZ` not playing video on v8. Both plugins use `PIXI.Texture.from(htmlVideoElement)` and apply post-construction property writes (`.scaleMode`, `.mipmap`, `.autoUpdate`, `.wrapMode`) on `.baseTexture` — the read-only proxy from session 1 silently dropped those writes, and v8's Sprite never re-evaluated `width`/`height` when the video metadata arrived (texture orig 1×1 → 1280×720).

#### Added — `template/*/js/libs/pixi_compat.js`

- **`PIXI.MIPMAP_MODES` shim** — maps v5 numeric enum to v8 boolean (`OFF: false`, `POW2/ON/ON_MANUAL: true`). Pairs with the new mipmap setter on the baseTexture proxy so legacy `videoTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF` actually disables `source.autoGenerateMipmaps`.
- **Setters on the `baseTexture` proxy** — added `set scaleMode`, `set mipmap` (→ `autoGenerateMipmaps`), `get/set wrapMode`, `get/set autoUpdate` that forward to the underlying v8 `TextureSource`. Previously the proxy was read-only, so plugin lines like `videoTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST` and `videoTexture.baseTexture.autoUpdate = false` landed on a disposable object and were lost — the underlying VideoSource kept defaults.
- **`PIXI.Texture.from(HTMLVideoElement)` override** — intercepts HTMLVideoElement specifically and constructs `VideoSource` explicitly with `autoLoad: true, autoPlay: false, updateFPS: 0`, then wraps in `new Texture({source: videoSource, dynamic: true})`. Two reasons:
  - **`autoPlay: false`** — prevents VideoSource from racing the plugin's own `video.play()` call (default `autoPlay: true` produced "play() interrupted by load()" patterns).
  - **`dynamic: true`** — without this flag, v8's Sprite `set texture` does NOT attach an `"update"` listener on the texture, so the sprite never reacts to texture changes (including the eventual video resize). Set explicitly because `Texture.from`'s default path leaves `dynamic: false`.
- **Sprite dynamic-texture resize re-apply (KEY FIX)** — wraps `Sprite.prototype.set texture` to attach a per-sprite `"update"` listener that re-runs `_setWidth(_width, texture.orig.width)` / `_setHeight(_height, texture.orig.height)` whenever the underlying source resizes.
  - v8 Sprite's stock texture setter re-applies `_width`/`_height` ONCE at assignment time. When the texture object stays the same but its `orig.width` later changes (VideoSource learning `videoWidth`/`videoHeight` from metadata), the stock setter does nothing — only invalidates bounds.
  - Plugins that do `const sprite = new Sprite(videoTexture); sprite.width = Graphics.width;` bake `scale.x = 816/1 = 816` while the video texture is still 1×1. When VideoSource later resizes to 1280×720, the sprite renders at `816 × 1280 = ~1,000,000` px wide — essentially invisible (one corner pixel fills the screen, looks like a solid black/blank fill).
  - Shim attaches a tracked listener only on `dynamic: true` textures, so static image sprites pay nothing. Listener detaches cleanly when the texture is replaced.

### Fixed

- **`PSYCHRONIC_VideoOverlay` videos invisible on v8** — video element loads and plays correctly, but sprite scale was baked to 1×1 texture causing the rendered video to extend far off-screen. Sprite re-apply patch + dynamic texture flag resolves it.
- **`PSYCHRONIC_VideoParallaxMZ` videos invisible on v8** — same root cause.

### PIXI v8 runtime compatibility (2026-05-30 session 2)

Continued v8 work after the Effekseer + cursor fixes earlier in the day: fixed UltraMode7 perspective rendering, fixed tile-edge seams on regular maps.

#### Added — `template/*/js/libs/pixi_compat.js`

- **`UltraMode7V8Compat` module (~330 lines)** — full v8 compat for UltraMode7's Mode7 perspective tilemap rendering. v8 removed the renderer-plugin system that UM7 depended on; this module sidesteps that by mirroring the Effekseer overlay pattern (offscreen `<canvas>` with its own WebGL1 context):
  - Lazy-initializes when first Mode7 layer renders. Creates a hidden offscreen canvas matching game canvas size, gets `webgl` context with `{premultipliedAlpha: false, alpha: true}`.
  - Compiles UM7's vertex + fragment shaders (`Tilemap.ULTRA_MODE_7_VERTEX_SHADER` + `UltraMode7.generateFragmentShader(...)`) against that context. Prepends `precision mediump float; precision mediump int;` to satisfy WebGL1's mandatory precision declaration (PIXI used to auto-prefix).
  - Creates 4 × 2048×2048 GL atlas textures with `LINEAR` filtering (matches UM7's `TILEMAP_PIXELATED=false` default). Tile-edge bleed prevented by UM7's fragment shader `clamp` against `vFrame`.
  - Enables `OES_element_index_uint` extension. Required because Mode7 maps with `LOOP_MAPS_EXTEND_TILES` commonly have 40k+ tiles (160k+ vertices) — without 32-bit indices, indices wrap at 65535 and `drawElements` renders garbage.
  - Replicates UM7's per-segment vertex/index buffer pipeline; raw GL `bufferData` / `vertexAttribPointer` / `drawElements`.
  - Hooks `Tilemap.Layer.prototype.render` after UM7 installs its own override: when `UltraMode7.isActive()` is true, queues the layer for offscreen rendering. Otherwise falls through to base render (the per-tile-Sprite path).
  - Patches `Tilemap.Layer.prototype.initialize` to install per-instance `onRender` callbacks. `MZGlobalUpgrade`'s window-scan misses `Tilemap.Layer` because it's a sub-property of `Tilemap` — without an `onRender`, v8 never calls `render()` on Layer instances per-frame and our hook never fires.
  - `findTilemap(layer)` walks up the parent chain to find the actual `Tilemap` (skipping intermediate `Tilemap.CombinedLayer` etc.) so the composite Sprite attaches to the right level — adding to an intermediate container caused parent-transform distortion.
  - Composite Sprite (wrapping the offscreen canvas) added as `tilemap.children[0]`. Set to `scale.y = -1, position.y = canvas.height` to flip the WebGL1-bottom-left-origin perspective right-side-up.
  - Per-frame flush clears the offscreen canvas to transparent, drains the layer queue, calls `pixiTexture.source.update()` to invalidate v8's GPU upload cache.
  - Debug surface at `window.__UM7V8` (getCanvas, getGL, getAtlases, getPendingLayers, getCompositeSprite, snapshot, isInitialized) for diagnostic work.

#### Changed — `template/*/js/reactor_core.js`

- **`Tilemap.Layer._addV8Tile` tile source `scaleMode: "nearest"`** — previously defaulted to LINEAR, causing visible vertical seam artifacts between adjacent tiles on certain tilesets (sub-texel interpolation across tileset image boundaries pulled in adjacent tile pixels). Original MZ `Tilemap.Renderer._createInternalTextures` hardcoded NEAREST for the same reason.

### Fixed

- **UltraMode7 perspective tilemap not rendering on v8** — fully resolved via `UltraMode7V8Compat`. Mode7 maps now render correctly with proper perspective, characters layer on top, atlas textures sample correctly, no distortion.
- **Visible vertical seams between tiles on regular (non-Mode7) maps** — caused by LINEAR sampling on tile textures. Switched to NEAREST.

### PIXI v8 runtime compatibility (2026-05-30 session)

Continued v7→v8 migration: fixed Effekseer animations not rendering in battle, and fixed MOG_BattleCursor not displaying. Both came down to v8 internals that legacy code paths quietly corrupted in ways that produced no errors but no pixels either.

#### Added — `template/*/js/libs/pixi_compat.js`

- **`PIXI.Container.prototype._position` accessor (KEY FIX)** — v8 stores its internal position `ObservablePoint` in `this._position` (pixi8.js line 7129). Some MZ plugins (notably MOG_BattleCursor's `BattleCursorSprite` constructor: `this._position = {}; this._position.x = 0; ...`) use `_position` as a custom data-struct field name, REPLACING v8's observable with a plain object. After that, `sprite.x = N` writes to a plain field instead of the ObservablePoint, so v8's transform-dirty notification never fires and the sprite's `localTransform` stays `NaN`. v8's renderer culls anything with NaN transforms, so the entire subtree silently disappears.
  - Shim installs an accessor on `Container.prototype._position`. The setter captures the `ObservablePoint` when v8's ctor assigns one (stashed as `__pixiPositionObservable`). When a plain object is later assigned, x/y values are copied into the saved observable and `_onUpdate` is triggered. Subsequent reads return the observable. Plugin-side `this._position.xOffset = 5` etc. still works — extra keys are added as own properties on the observable.
  - Backwards-compatible with any plugin using the same `_position` clobber pattern, not just MOG_BattleCursor. **No plugin file edits required.**
- **`PIXI.Sprite.prototype.allowChildren` getter** — always returns `true`, swallows the constructor's `this.allowChildren = false` assignment. Suppresses v8's "addChild on a Sprite" deprecation warning spam. (v8 still iterates Sprite children in `collectRenderablesSimple` regardless of `allowChildren`, so this is purely a warning fix.)

#### Changed — `template/*/js/reactor_core.js` (Effekseer overlay canvas)

- **Dedicated Effekseer overlay canvas with its own WebGL1 context.** Effekseer's `drawHandle` was silently producing zero pixels on v8's WebGL2 context — verified empirically via full-canvas `gl.readPixels` diff (zero pixels changed across 921600 samples) with no GL errors. The proven-good editor pattern (`src/event/AnimationPicker.js`) creates a fresh canvas with `getContext('webgl', { premultipliedAlpha: false, alpha: true/false })` and inits Effekseer against THAT context.
  - `Graphics._createCanvas` now creates an `effekseerOverlay` `<canvas>` alongside `gameCanvas`. Transparent, `pointer-events: none`, z-index 2 (above game canvas at z-index 1).
  - `Graphics._updateCanvas` keeps both canvases sized and centered identically via `_centerElement`.
  - `Graphics._createEffekseerContext` obtains a WebGL1 context on the overlay (`premultipliedAlpha: false, alpha: true`) and inits Effekseer against it. `setRestorationOfStatesFlag(false)` — Effekseer owns the overlay context, no state to restore.
  - The browser compositor naturally layers the overlay over the game canvas. No PIXI integration needed.

#### Changed — `template/*/js/reactor_sprites.js` (Sprite_Animation positioning)

- **`Sprite_Animation.setProjectionMatrix`** rewritten to use AnimationPicker's recipe (`p = -1.2`) instead of MZ's `p = -(viewportSize / canvas.height) = -5.69`. The MZ original combined a 4096×4096 offset viewport with the steep perspective to position effects on screen — that approach silently produced zero pixels through Effekseer's WebGL1 wrapper on the overlay context.
- **`Sprite_Animation.setViewport` / `resetViewport`** use the full canvas viewport now (instead of a 4096×4096 viewport offset by target position).
- **`Sprite_Animation.updateEffectGeometry`** positions effects via `handle.setLocation(wx, wy, 0)` using a canvas-pixel-to-world conversion (`wFactor = 13` = `1 - 10 × p`). Mirror flag flips `wx` sign.
- **`Sprite_Animation` 180° x-axis flip** — `rx = (180 - rotation.x) * π/180` compensates for the projection's y-flip (matches AnimationPicker). Without it, particles designed to fly "up" appeared to fly "down" on screen.
- **`Sprite_Animation.targetSpritePosition`** anchors unconditionally to sprite ORIGIN (`point.y = 0`) instead of center (`-h/2`). MZ vanilla center-anchor put effects approximately `h/2` pixels too high through the AnimationPicker projection.
- **`Sprite_Animation.renderActive`** clears the Effekseer overlay canvas EVERY frame (transparent black) regardless of whether animations are queued. Otherwise leftover Effekseer pixels persist between animations and block view of game-canvas content underneath (e.g., MOG_BattleCursor).

### Fixed

- **Effekseer battle animations not rendering** — fully resolved via the overlay canvas + AnimationPicker recipe described above. Animations now appear at the target battler, fire in the correct direction, and don't bleed into UI between plays.
- **MOG_BattleCursor target arrow + battler name not displaying** — root cause was the `_position` clobber documented above. Cursors are now visible during target selection.
- **Massive console log spam from PSYCHRONIC_* plugins** — silenced per-action repeaters (~109 lines across `PSYCHRONIC_BattleEngineMZ.js`, `PSYCHRONIC_MegaOptionsMZ.js`, `PSYCHRONIC_CoreCustomizerMZ.js`, `PSYCHRONIC_MegaEquipMZ.js`, `PSYCHRONIC_SubclassMZ.js`, `PSYCHRONIC_MenuManagerMZ.js`, `PSYCHRONIC_EventCustomizerMZ.js`). All silenced lines marked with `// [silenced]` prefix for easy restoration. Per-action logs that remain useful for debugging (`🎬 UnifiedAnimationHandler`, `✅ Playing animation`, `🎯 execute: Invoking action.`) were preserved.

### PIXI v8 runtime compatibility (2026-05-25 session)

Follow-up runtime work on the v7→v8 migration: with the bundle and corescript already converted, the focus was making actual gameplay (battles, menus, lighting plugin, in-game scenes) render correctly against v8.

#### Added — `template/*/js/libs/pixi_compat.js`

- **`baseTexture` getter on `PIXI.Texture.prototype`** — force-overrides v8's deprecation getter (which returned the v8 `TextureSource` directly, making `texture.baseTexture.resource.source` resolve to `undefined`). Returns a v5/v6/v7-shaped shim with `.resource.source` pointing at the raw canvas/image.
- **`valid` getter on `PIXI.Texture.prototype`** — v8 removed `Texture.valid`. Plugins like `PSYCHRONIC_RaveLighting` use it as the "did my texture build correctly?" gate; without it every legitimate texture was silently swapped for `PIXI.Texture.WHITE`.
- **Container `name` deprecation accessor deletion** — v8's `set name(value)` on `Container.prototype` was intercepting MZ corescript prototype assignments (`Sprite_Name.prototype.name = function() {...}`) and rerouting them into `label`, silently losing the method. Deleted the accessor before corescript loads.
- **`PIXI.Buffer` constructor wrapper** — v8 switched from positional `(data, isStatic, isIndex)` to `{data, size, usage, ...}` options object. UltraMode7's `Tilemap.Layer._createVao` calls `new PIXI.Buffer(null, true, true)` and crashed on `destructure of null`. Wrapper detects legacy positional signature and converts to v8 options with `BufferUsage.INDEX|VERTEX|COPY_DST|STATIC` flags.
- **`PIXI.Geometry.addIndex/addAttribute` chain wrappers** — v8 dropped `return this` from both methods, breaking the `geometry.addIndex(idx).addAttribute(...).addAttribute(...)` chain pattern. Wrappers restore chaining. `addAttribute` also accepts the v5/v6/v7 8-positional form `(name, buffer, size, normalized, type, stride, start, instance)` and converts to v8's options object with size+type → format-string mapping (e.g. `FLOAT × 4 → "float32x4"`).
- **`window.installLegacyRendererStubs(renderer)`** — augments v8's `WebGLRenderer` instance (called from `reactor_core.js` after `await app.init()`) with the legacy `renderer.batch / .geometry / .state / .shader / .framebuffer / .projection / .view` subsystems as no-op stubs. `batch.flush()` is the exception — it bridges to v8's `renderTarget.finishRenderPass()` so pending v8 batches are committed before plugins like Sprite_Animation start raw GL drawing.
- **MZGlobalUpgrade label-shadow delete** — after `Reflect.construct(pixiBase, [], wrapped)`, walks the v8 instance's own keys and deletes any whose name corresponds to a prototype method on the MZ subclass. v8's `Sprite` ctor hardcodes `this.label = "Sprite"` as an own data property, which was shadowing `Sprite_Gauge.prototype.label()` and breaking battle status windows with `this.label is not a function`.
- **MZGlobalUpgrade onRender bridge** — for any wrapped MZ class whose prototype defines its own `_render` or `render` (and the latter differs from the PIXI base), installs a per-instance `onRender(renderer)` callback that v8 invokes per-frame. Bridges the legacy v5/v6/v7 dispatch pattern to v8's render pipe. Errors are logged once-per-class instead of silently swallowed.
- **Advanced blend mode registration** — registered `multiply`, `screen`, and `overlay` via `PIXI.BlendModeFilter` + `PIXI.extensions.add` so MZ plugins that set `sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY` don't silently fall through to `'normal'`. Uses the official PIXI v8 advanced-blend-modes formulas. (Eventually deprecated in favor of the alpha-composited tone overlay — see below.)

#### Added — `template/*/js/reactor_core.js`

- **Post-`_app.render()` Effekseer flush hook** — calls `Sprite_Animation.renderActive(renderer)` right after `_app.render()` returns, so legacy Effekseer draws happen on top of v8's already-rendered scene instead of being clobbered by v8's batched output.

#### Added — `template/*/js/reactor_sprites.js`

- **`Sprite_Animation._pendingRenders` queue** — on v8, `_render` queues the instance instead of drawing inline. `Sprite_Animation.renderActive(renderer)` drains the queue after v8 finishes its render pass.

### Fixed

- **`PSYCHRONIC_RaveLighting` lighting plugin** — completely reworked for v8:
  - Tone overlay switched from `MULTIPLY` blend (incompatible with v8's advanced blend mode filter chain inside the spriteset's color filter) to plain alpha-composited overlay. Tint color and alpha are now derived directly from `$gameScreen.tone()` magnitude: `[0,0,0,0]` → transparent, `[-255,-255,-255,0]` → opaque black, `[255,0,0,0]` → opaque red, etc.
  - `updateBaseFilters` now zeroes the spriteset's `_baseColorFilter` (`setColorTone([0,0,0,0])`) on every frame so the spriteset filter doesn't double-tint on top of the new overlay.
  - Texture-cache self-heal: `_isCachedTextureAlive(texture)` validates the cached radial/beam/flashlight texture's source is still a real `HTMLCanvasElement` before reusing it. After v8 destroys a `TextureSource`, its `.resource` becomes `null` and `drawImage` throws — the cache now silently rebuilds stale entries on next access.
  - `Spriteset_Map.destroy` clears `PsychronicRaveLighting.textureCache` so cross-scene destroys don't leak stale Texture references into the next map.
- **Battle scene crash** — `this.name is not a function` in `Sprite_Name.updateBitmap` and the follow-up `this.label is not a function` in `Sprite_Gauge.drawLabel`. Two distinct v8 prototype-pollution bugs (setter interception during prototype definition vs. instance own-property shadowing) — see the two corresponding compat-layer items above.
- **UltraMode7 scene crash on map load** — `Cannot destructure property 'data' of 'options' as it is null` in `new Buffer(null, true, true)`, then `Cannot read properties of undefined (reading 'addAttribute')` from the broken `addIndex().addAttribute()` chain. Both fixed by the new PIXI.Buffer and PIXI.Geometry compat wrappers.
- **`Sprite_Name` `this.name is not a function`** in load-game menus — v8's `Container.prototype.name` setter was intercepting `Sprite_Name.prototype.name = function() {...}` and routing the function into `label` instead.
- **Window-layer GL state corruption** — removing the early `framebuffer.forceStencil` stub lets `WindowLayer.render` naturally throw early (caught by the onRender bridge) before its raw GL stencil-test calls corrupt v8's batched state. Window backgrounds, ATB bars, and other layered windows render correctly again.
- **`Texture.baseTexture.resource.source` returning `undefined`** in `RaveLighting`'s flashlight/beam draw paths — fixed by the new force-override `baseTexture` getter.

### Known issues

- **Parallax tile-edge fringing in some intro scenes** — separate UV/scaleMode issue.

## [0.8.0] - 2026-05-24

### Added
- **Multi-instance workflow**: The Linux launcher now starts each RPG Reactor window with its own NW.js user-data profile, allowing multiple projects to be open at the same time while a per-project `.rpgreactor.lock` prevents opening the same project twice.
- **Cross-instance clipboard**: Added shared typed clipboard support for events, event pages, event command selections, maps, and plugin JSON/settings so copy/paste works across RPG Reactor windows.
- **Map copy/paste**: Map context menu now supports Copy Map and Paste Map, creating a new `Map###.json`, updating `MapInfos.json`, and importing the source tileset database entry when possible.
- **Map deletion**: Map tree and quick-access selections can now be deleted from the context menu or Delete key, including child-map handling, `Map###.json` removal, `MapInfos.json` updates, current-map fallback loading, and protection against deleting the final remaining map.
- **Save Map As Image**: Map context menu can export a full-size PNG render of a map, including tiles, parallax, shadows, and A1 autotile overlap handling while omitting editor-only event marker boxes.
- **Map audio preview controls**: Map Properties autoplay BGM/BGS sections now include Play, Pause, Stop, and status controls powered by the shared AudioPlayer backend, honoring volume, pitch, pan, and loop settings.
- **Actor sheet cell selection**: Actor Character Sprite and Face Graphic pickers now use clickable highlighted sheet cells instead of prompting for numeric indexes.
- **Tileset database copy/paste**: Tilesets now support Ctrl+C/Ctrl+V in the Tilesets database list, pasting into the selected slot while preserving the slot ID.
- **Plugin Manager multi-select**: Plugins now support Shift-click range selection and Ctrl/Cmd-click toggle selection, with group copy, cut, paste, duplicate, and remove actions.
- **Project manager tests**: Added a `node:test` test harness covering version metadata sync, template metadata, new project creation, and RPG Maker import metadata.
- **Trait action buttons**: All trait editors (Actors, Classes, Weapons, Armors, States, Enemies) now have visible Add, Edit, Copy, Paste, and Delete buttons below the traits table — no longer relies solely on right-click context menu discovery
- **Trait keyboard shortcuts**: When a trait row is selected, Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste), Delete (remove), and Enter (edit) operate on the selected trait instead of the parent database entry
- **Image picker "Open in Folder" button**: When selecting face graphics, character sprites, or SV battlers, a new "Open in Folder" button next to "Select This Image" opens the file in the system file manager (e.g. Dolphin) for quick access to external editing tools
- **Editor Distribution Builder** (`Build → Package Editor for Distribution...`): New in-editor tool for packaging RPG Reactor itself for release on itch.io / GitHub Releases. Uses the same worker_threads architecture as the game build system.
  - **3 package types**:
    - *Platform-Specific*: One archive per OS with bundled NW.js runtime (Linux → `.tar.gz`, Windows/macOS → `.zip`)
    - *Universal*: Single `.zip` with all 3 platform runtimes included
    - *Minimal*: Editor only — bootstrap launchers auto-download NW.js on first run
  - **NW.js edition selection**: Normal or SDK (includes DevTools)
  - **3-tier runtime acquisition**: Checks bundled local dirs (`nwjs-linux/`, `nwjs-win/`, `nwjs-mac/`) → `.nw-cache/` → downloads from `dl.nwjs.io`
  - **Partial download protection**: Uses `.part` suffix during download to prevent corrupt cached files
  - **SHA256SUMS.txt** generated for all output archives
  - **Whitelist-based staging**: Only includes editor files needed for distribution (`src/`, `css/`, `images/`, `libs/`, `build-scripts/`, player-facing `template/Demo/`, launcher scripts, docs, cherry-picked `pixi.min.js`); excludes dev artifacts (`.git/`, `node_modules/`, `save/`, template dev dirs like `REACTOR_CORE_DUMP_MIDDEV/`, `RMMZ_Corescript/`, `PIXI5/`, `PIXI8/`, `Backup/`, `Screenshots/`)
  - **Bootstrap launchers** (minimal packages): Platform-specific scripts that download + extract NW.js on first run (bash for Linux/macOS, batch + PowerShell for Windows)
  - Worker: `build-scripts/dist-editor-worker.js`, Manager: `src/DistEditorManager.js`
- **Custom icons for built executables**: Game and editor builds now embed custom icons instead of the default NW.js compass icon
  - **Windows**: Embeds icon into `.exe` via PE resource section editing; uses project's `icon/icon.ico` if available, otherwise generates ICO from `icon/icon.png`
  - **macOS**: Replaces `app.icns` in `.app` bundle with ICNS generated from PNG
  - **Linux**: No change needed (runtime `window.icon` already handles this)
  - Editor distribution builds use `images/icon.png` / `images/icon.ico`
  - Graceful fallback: builds succeed even if icon files are missing or replacement fails
  - Helper module: `build-scripts/icon-helpers.js` (pure CommonJS, no npm dependencies)
- **Enemy editor: Hue slider with live preview**: Battler Hue field is now a slider + number input combo; dragging the slider applies a real-time `hue-rotate` CSS filter to the battler preview image

### Changed
- **Version metadata source**: Project creation and RPG Maker import now use root `package.json` as the single source of truth for RPG Reactor engine version metadata.
- **Project templates**: New project creation now copies the player-facing `template/Demo` directly instead of copying the whole `template/` directory; Barebones and Complex remain development/testing templates.
- **Event audio command editor**: Play BGM/BGS/ME/SE command editing now defaults empty commands from the current loaded/playing AudioPlayer channel and uses a richer inline preview UI.
- **Map tileset editing**: Editing map dimensions or tileset from Map Properties now saves the map file and reloads the map when needed, with tileset dropdowns using actual tileset IDs.
- **Map edit undo transactions**: Tile editing now records undo entries only when map data actually changes, keeping undo/redo history cleaner and more reliable across pencil, shape, fill, eraser, shadow, and region operations.
- **Actor editor layout**: Redesigned to use space more efficiently — General Settings and Images display side-by-side in the top row, Traits and Equipment side-by-side in the middle row, with Note full-width at the bottom
- **Enemy editor layout**: Traits and Note sections now display side-by-side in a row (matching the actor editor layout) instead of stacked full-width; Note textarea stretches to fill available height

### Fixed
- **Database section shortcut isolation**: Database section switching now clears stale search bars, button bars, Change Maximum buttons, and keyboard handlers so functionality from one section no longer bleeds into another.
- **Global shortcut bleed**: Map/event global shortcuts no longer fire while database and editor modals are open, preventing database Ctrl+V from triggering event/map paste actions.
- **Tilesets Change Maximum**: Tilesets now has its own Change Maximum behavior instead of reusing a stale handler from Actors or the previously visited database section.
- **Enemy battler selection refresh**: Changing an enemy battler now refreshes the real database detail panel and highlights the current battler in the picker.
- **System 1 sound effect selection**: Sound rows now select reliably by clicking the whole row, support `(None)`, and double-click confirms immediately.
- **Control Self Switch display**: Event command list now displays self-switch command values correctly (`0 = ON`, `1 = OFF`).
- **Map rendering after tileset changes**: Tilemap loading clears stale tileset textures and falls back to the first available tileset when a referenced tileset is missing.
- **Map data persistence**: Map property edits now write existing map changes to `Map###.json` and save `MapInfos.json`.
- **Map editor tool state**: Returning from event mode now updates the real active tool to pencil instead of only changing the toolbar highlight, preventing the Single Tile button from accidentally continuing to use Fill.
- **Map editor input handling**: Right-click, middle-click, Shift-pan, and out-of-bounds clicks no longer create map edits or stale undo entries; fill operations also cleanly reset drawing state and resume lazy loading.
- **Current-map parallax refresh**: Saving Map Properties with a changed parallax now immediately clears/replaces the visible parallax layer on the loaded map.
- **New-game map references after deletion**: Deleting maps now repairs invalid player and vehicle start-map references in `System.json`, and playtest validates/repairs those references before launch.
- **Tilesets list refresh**: Saving a Tilesets database name now immediately refreshes and reselects the visible Tilesets list entry.
- **Stale plugin entries**: Plugin Manager now detects and removes stale missing-plugin entries, including old `A1_AutotileMapper` references.

## [0.7.0] - 2026-02-15

### Added
- **Database list clipboard operations**: Right-click context menu on list entries with Copy, Cut, Paste, and Duplicate — matches RPG Maker behavior (cut blanks slot, paste overwrites selected entry)
- **Database list keyboard shortcuts**: Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste), Ctrl+D (duplicate), Delete (blank entry), Ctrl+Z (undo)
- **Database list undo system**: Ctrl+Z reverts destructive list operations (cut, paste, duplicate, delete, new, remove) with full snapshot/restore
- **Troop editor: Replace Enemy picker**: Visual modal with search bar, scrollable list with battler thumbnails, large preview panel with stats, and double-click to confirm
- **Troop editor: Visibility toggle**: Replaced hidden checkbox with eyeball icon button (open/slashed eye) for clearer member visibility control
- **Enemy editor: Battler preview**: Visual preview of the enemy battler image in the General section, with automatic charset frame extraction for `!`/`$` prefix filenames (standard 12x8 and big character 3x4 spritesheets)
- **Enemy editor: Multi-directory battler selection**: Battler image picker now searches `enemies`, `sv_enemies`, and `characters` directories

### Changed
- **Enemy editor layout**: General, Parameters, and Drop Items sections now display in a 3-column row for better use of horizontal space; Action Patterns, Traits, and Note remain full-width below

## [0.6.0] - 2026-02-14

### Added
- **Common Events editor**: Full editor with name, trigger (None/Autorun/Parallel), switch selection, and interactive command list with EventCommandPicker integration
- **Effects editor**: New DatabaseEffectEditor modal for RMMZ effects (Recovery, State, Buff/Debuff, Special) used by Skills and Items editors
- **Add/Delete entries**: New/Delete buttons in the database list panel for all data types with per-type default templates

### Changed
- **Skills editor**: Full rewrite — all fields now editable including skill type, scope, occasion, MP/TP costs, speed, success rate, repeats, hit type, animation, messages, damage formula section (type, element, formula, variance, critical), and interactive effects CRUD with context menu
- **Items editor**: Full rewrite — all fields now editable including item type, price, consumable toggle, scope, occasion, invocation parameters, damage formula section, and interactive effects CRUD with context menu
- **Enemies editor**: Full rewrite — editable general stats (name, battler image picker, hue, EXP, gold), 8 editable parameter inputs, 3 drop item slots with dynamic Kind/DataId/Denominator controls, action pattern table with add/edit/delete modal, and full trait CRUD via context menu
- **Armors editor**: Full rewrite to WeaponEditor parity — armor type and equip type dropdowns from system data, editable price, 8 editable parameter inputs, and full trait CRUD with context menu (Add/Edit/Cut/Copy/Paste/Delete)

## [0.5.0] - 2026-02-14

### Added
- 53 new event command editor UIs, bringing total from 29 to 82 supported commands
- **Flow Control & Messages**: Input Number (103), Select Item (104), Show Scrolling Text (105), Common Event (117), Label (118), Jump to Label (119), Play Movie (261), Name Input Processing (303)
- **Toggle Commands**: Change Save Access (134), Change Menu Access (135), Change Encounter (136), Change Formation Access (137), Change Player Followers (216), Change Map Name Display (281) — all use shared ToggleCommandEditor
- **Actor Commands**: Change HP (311), Change MP (312), Change TP (326), Change State (313), Recover All (314), Change EXP (315), Change Level (316), Change Parameter (317), Change Skill (318), Change Equipment (319), Change Name (320), Change Class (321), Change Nickname (324), Change Profile (325)
- **Screen Effects**: Tint Screen (223), Flash Screen (224), Shake Screen (225), Move Picture (232), Rotate Picture (233), Tint Picture (234), Set Weather Effect (236)
- **System & Map**: Change Battle BGM (132), Change Victory ME (133), Change Window Color (138), Change Defeat ME (139), Change Vehicle BGM (140), Set Vehicle Location (202), Change Tileset (282), Change Battle Background (283), Change Parallax (284), Get Location Info (285)
- **Scene Commands**: Battle Processing (301), Shop Processing (302), Change Actor Images (322), Change Vehicle Image (323)
- **Battle Commands**: Change Enemy HP (331), Change Enemy MP (332), Change Enemy TP (342), Change Enemy State (333), Enemy Recover All (334), Enemy Appear (335), Enemy Transform (336), Show Battle Animation (337), Force Action (339)
- **No-Editor Commands** (direct insert): Exit Event Processing (115), Get on/off Vehicle (206), Erase Event (214), Gather Followers (217), Save BGM (243), Replay BGM (244), Abort Battle (340), Open Menu Screen (351), Open Save Screen (352), Game Over (353), Return to Title Screen (354)
- Display text in event list for all 69 new command codes
- Continuation line support for Show Scrolling Text (405) and Shop Processing (605)

### Fixed
- Corrected command codes 131-140 to match RMMZ standard: Save Access (134), Menu Access (135), Encounter (136), Formation (137), Window Color (138), Defeat ME (139), Vehicle BGM (140)
- Added missing Show Animation (212) to command names map
- Added display text for Show Choices (102), Control Timer (124), Change Transparency (211), Show Animation (212), Show Picture (231), Erase Picture (235)
- Added Battle Processing branch display: If Win (601), If Escape (602), If Lose (603), End (604)

## [0.4.5] - 2026-02-14

### Changed
- License changed from CC0-1.0 to MIT
- Version bumped to 0.4.5 to reflect engine completeness

### Added
- Linux launcher script with desktop integration (`RPGReactor.sh`)
- Desktop entry and icon auto-installation on first run
- Set Movement Route editor: full two-panel editor with 45-command button grid, inline parameter dialogs, multi-select, cut/copy/paste, reorder
- Orphaned 505 (movement route) command repair on load
- Audio player: SVG transport buttons, hover tooltips, yellowjacket theme

### Fixed
- Made NW.js binaries executable for Linux
- Movement route display: human-readable command text instead of raw JSON
- Movement route 505 continuation entries properly managed on insert/edit
- Character ID 0 ("This Event") no longer incorrectly mapped to Player
- End markers no longer displayed as visible 505 entries

## [0.1.0] - 2024-11-18

### Added

#### Core Application
- NW.js-based cross-platform application framework
- Dark theme UI optimized for long editing sessions
- Resizable sidebar panels with size persistence
- Welcome screen with project creation and opening

#### Map Editor
- Pencil, rectangle, circle area, fill bucket, and eraser tools
- Four-layer tile system with auto-layer mode
- Shadow pen mode for depth effects
- Undo/redo system (50 step history)
- Autotile support with animated water and waterfall tiles
- Region painting with 256 distinct regions
- Viewport culling and lazy-loading for performance

#### Event System
- Visual event editor with multi-page support
- Page-based conditional system (switches, variables, items, actors)
- Event commands for game logic
- Event copy/paste/cut operations
- Find/search functionality across project
- Drag-and-drop event repositioning
- Starting position markers

#### Database Editors
- Actor editor with stats, equipment, and traits
- Class editor with parameter curves and skill learning
- Skill editor with damage formulas and effects
- Item editor with consumable effects
- Weapon editor with parameters and traits
- Armor editor with resistances and bonuses
- Enemy editor with AI patterns and drops
- Troop editor for enemy group composition
- State editor for status effects
- Animation editor with Effekseer support
- Tileset editor with passage and terrain configuration
- System editor for game-wide settings

#### Audio System
- Multi-channel audio player (BGM, BGS, ME, SE)
- Volume, pitch, and pan controls
- Seek slider with real-time updates
- Loop configuration

#### Plugin System
- Plugin discovery and management
- Enable/disable toggle
- Load order configuration
- Parameter editing interface

#### Playtest
- One-click game testing
- Debug mode support
- Process management

#### Build System
- Cross-platform game builds (Windows, macOS, Linux, Web)
- NW.js runtime packaging via worker_threads (bundled or downloaded)
- Asset bundling into `package.nw`

#### Templates
- Demo template used for new projects created by players
- Barebones and Complex templates retained for engine development/testing
- Project structure compatible with RPG Maker MZ format
