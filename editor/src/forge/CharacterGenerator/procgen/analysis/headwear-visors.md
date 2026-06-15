# Headwear — Visors / Bands / Goggles / Headset / Neo-Hats

Analysis of 13 looseleaf headwear parts (partial head coverings worn OVER the body).
All sheets are 144×144 per cell, 4 directions (Front/Left/Right/Back) × 3 walk-frames.
Letters index a `palette`; space/`.` = transparent.

## Anatomical reference (male body, Front frame 0)
Derived from `body/male/body-looseleaf-looseleaf-male-body-01.js`:
- **Head outline top** ≈ row 37 (hair starts), bare-skull crown ≈ row 40.
- **Forehead / brow band** ≈ rows **48–52**.
- **Eye-line** ≈ rows **54–58** (dark eye pixels JJJ/KKK sit rows 58–63).
- **Nose/cheek** ≈ rows 64–70; **jaw/chin** ≈ rows 70–80.
- **Head horizontal span** (Front): hair x≈48–93, face/skin x≈58–82, **face center column ≈ x70–71**.
- In **side** views the head shifts: face front faces toward the open side, so parts skew their bbox toward x≈54 (Left) / x≈89 (Right) and the "front" of the visor wraps to one edge.

The artist places every part relative to these landmarks, which is why bboxes cluster around the same rows.

---

# COMMON PATTERN LANGUAGE

These rules hold across all 13 parts (the band/goggles/headset/hat outliers are noted inline):

### 1. Palette structure
- **Letters are assigned by region, NOT sorted by brightness.** `A` is almost always the **darkest structural tone** (outline/dark-metal, lum ~36–59) or the mid base; the viewer's dark→light sort scrambles the authoring order. Do not assume `A`=lightest.
- Every part carries a **monochrome metal/plastic ramp of 5–8 steps** running dark→light. Canonical neutral ramp (appears verbatim in visor-02/04, neo-hats, others):
  `#181818 → #393939 → #5a5a5a → #7b7b7b → #9c9c9c → #bdbdbd → #dedede → #ffffff`
  (24, 57, 90, 123, 156, 189, 222, 255 luminance — even ~33-step spacing). Parts pick a contiguous slice of this ramp.
- **Roles within the ramp:** darkest = outline + cast-shadow; next = ambient/body; middle = base face of the metal; top 1–2 = highlight; brightest single value (`#ffffff`/`#dedede`) = **catchlight**, used sparingly on the top bevel edge and at the visor's central reflection.
- **Accent / glow** is a separate hue OUTSIDE the gray ramp, used only for the active "lens/eye" strip and tiny side LEDs:
  - Green `#00ff1b` + cyan `#00d7ff` (futuristic visors) — sci-fi.
  - Cyan-blue family `#00a0ff/#1085c9/#79ceff` (futuristic-visor-02 face plate).
  - Red `#ff0000`/`#700000` + pink `#ff5c7c` (metal-visor-05, futuristic back LEDs, goggles `#ff4458`).
  - Lime `#6abe30` (headset earcup dot).
  - Gold `#ffff7c/#f4d460` (head-band — the band itself is the "accent family", no gray ramp).
  - Purple `#21033c…#6d0ac8` (neo-hat-01 — an all-purple ramp, no neutral gray).
- **Color FAMILIES** found: (a) cool-neutral metal, (b) sci-fi green+cyan glow, (c) red/pink glow, (d) gold cloth, (e) purple cloth, (f) toned brushed-metal-with-reddish-tint (metal-visor-01 mixes `#653c3e/#945c60` warm browns into the gray — a rusted/bronze read).

### 2. Silhouette shape & placement
- **Two structural archetypes:**
  - **STRIP visors** (futuristic-01/02, metal-02/03/04/05, head-band, goggles): a horizontal band ~**8–14 rows tall** spanning the brow/eye region (rows ~48–63), leaving the crown, hair, and lower face/mouth OPEN. Width spans the full head (x≈55–87, ~30–32 px) or slightly past it.
  - **FULL helmet/cap visors** (metal-visor-01): wrap the whole head top with cheek-guards down to row ~71.
  - **HATS** (neo-hat-01/02/03): full crown caps covering rows ~36–58, sitting on top of the head, NOT a brow strip — different family, included for completeness.
- **Vertical anchor of the eye/brow strip is remarkably consistent:** the bright lens row lands at **rows 53–60**, i.e. directly on the eye-line. Front bboxes top out around rows 44–48 (brow) and bottom around 56–66.
- **Horizontal:** strips are **left-right symmetric about face-center x70–71** in Front and Back. The lens/glow is centered; bezels/end-caps mirror on both sides.

### 3. Internal pattern (the glowing strip / lenses)
- **The glow is a horizontal core line of the accent letter, 1–3 rows tall, flanked symmetrically by ramp steps that fade outward** (bright center → mid → dark bezel). E.g. futuristic-01 Front row 51 `…DDDFFFFFDDD…` (F=cyan core, D=light gray halo).
- **Bezel convention:** the lens core is wrapped by a 1px bright bevel (top), then the base metal, then a 1px dark outline (`A`/`B`) all around. Top edge gets the catchlight, bottom edge gets the dark line — classic top-lit bevel.
- **Repeating "rivet/segment" motif:** several parts tile a `BB…BB` / `JJ…JJ` 2-px dark pip at regular intervals to read as bolts or lens segments (metal-visor-02 row 59 `FBBFBBDBBEBBDBBGBB` = repeating bevel pips; metal-visor-04 has paired `GG` white catchlights at the two lens centers).
- **Goggles** are the exception: two discrete circular lenses (x≈60–66 and x≈72–78), each a 5-wide `CCCCC` red disc ringed by `A`, joined by a center bridge and a thin strap (`AA`) wrapping around the head sides (rows 46–57).

### 4. Per-direction differences
- **Front & Back are near-mirror-symmetric** in outline; the difference is internal:
  - **Back hides the lens/glow** or replaces it with a dim version. Futuristic-01 Back (rows 44–53) shows the bezel pattern but the bright green core becomes red `G` (rows 50: `CCCGGGGGCCC` → the GGGGG is the back LED). Futuristic-02 Back row 48 `EEEEJJJJJEEEE` (J=red) — a single rear indicator instead of the full face glow. Metal-visor-01/02/03/04/05 have **empty Back** entirely (`## Back: (empty)`), i.e. the visor only exists front+sides.
  - Back bbox is **shorter** (drops the cheek-guards / lower face plate) because nothing wraps the rear of the jaw.
- **Side (Left/Right) views:** the strip becomes a **diagonal wrap**. The visor's front face crowds to the facing edge and a thin temple-arm / strap trails back across the head. The bright lens shrinks to a small patch near the front edge (e.g. futuristic-01 Left rows 50–53, F=cyan only at x54–56). Left and Right are horizontal mirrors of each other (same bbox width, flipped).
- **Hats:** all 4 directions present and similar; Back loses the front brim detail; sides show the cap profile with an ear-flap/brim hint.

### 5. Per-frame differences (walk bob)
- **The part bobs vertically with the head, by ±1 row, on the 3-frame cycle.** Frame layout is **frame0 = neutral, frame1 = raised 1px (content shifted UP one row), frame2 = neutral/lowered**. Confirmed everywhere: e.g. futuristic-01 Front frame0 lens at row 53, frame1 lens at row 51–52 (up 2), frame2 back to 53. Metal-visor-02 frame0 row 56 = frame1 row 55. **No shape change between frames — pure vertical translation** (sometimes a 1px diagonal shift in side views, e.g. neo-hat side frames drift x by 1 as well as y).
- Generator rule: render the static art once, then offset Y by `[0, -1 or -2, 0]` (or `0/-1/-2` matching the body head-bob table) per frame; in side views add a matching ±1 X.

### 6. Extension-beyond-silhouette pixels
- **STRIP visors stay inside the head silhouette** — they do not stick out (the brow band is narrower than the hair outline).
- **Wrap-around straps DO extend** down the sides: goggles' `AA` strap runs to rows 54–57 at x55 and x86 (temple/ear level, at the silhouette edge). Headset has large **ear-cups that extend well past the face**, x51–53 and x89–91 (rows 51–60), plus a top headband arc above the crown (rows 36–48) and a boom-mic curving down-front (rows 60–66) — the most extension of any part.
- **Hats extend ABOVE the crown** (neo-hats top at rows 33–38, above the bare skull at row 40) and their brim flares slightly past the head width at the bottom rows (x56 / x85).
- Metal-visor-01 (full helmet) extends down the cheeks to row 71, past where a strip visor stops.

### Generator spec summary (strip-visor archetype)
```
palette: 6–8 step neutral metal ramp (#181818…#ffffff) + 1 accent glow hue (+optional 2nd)
silhouette: horizontal band, rows ~48–63, x55–87, symmetric about x70, leave crown+mouth open
structure (top→bottom): dark outline(1) / catchlight bevel(1) / light(1) / base(2) /
                         GLOW CORE(1–3, accent) / base(1) / light(1) / dark outline(1)
side view: skew front-face to facing edge, trail a temple arm back, shrink glow to a patch
back view: same outline, glow OFF or single rear LED — or omit Back entirely
frames: Y-offset [0,-1or-2,0] head-bob, no reshape (sides add matching ±1 X)
extensions: optional ear-cups / straps / antennae beyond silhouette at temple rows 51–60
```

---

# PER-FILE NOTES

## headwear-looseleaf-metal-visor-01  (full helmet, warm-tinted metal)
- **Palette (11):** outline `C #361c1c`, `G #4d2c2d`, dark base `A #393939`; **warm reddish browns** `B #653c3e`, `F #7c4c4f`, `J #945c60` (the bronze/rust read); cool grays `D/I/H/E`, catchlight `K #dedede`. Mixed cool-steel + warm-bronze family.
- **Not a strip — a full wrap helmet.** Front bbox **x55–86 y46–71**. Crown band rows 48–54, then **cheek-guards run down both sides** (rows 55–65, x57–59 and x82–84) framing an open face, then a chin/mouth-guard strip rows 66–71.
- **The eye-slit is the OPEN gap:** rows 55–63 the center (x64–84) is transparent (`·`) — the face shows through; row 51 `…IIIIHHHEEIDDDDD…` is the brow with the `HHH/EE` catchlight highlight band. Lower guard rows 67–69 `BBFFFIAAAAAAAAIFFFBB` re-close under the mouth.
- **Back: empty.** Sides wrap fully (Left bbox x55–81), the helmet profile with a vertical cheek bar `GBBG` repeating rows 55–62.
- **Frames:** bob ±1 row (frame1 raised, content row 46–69 vs frame0 48–71). No glow accent — purely structural metal.

## headwear-looseleaf-metal-visor-02  (clean strip, neutral metal, segmented)
- **Palette (8):** pure neutral ramp `#181818,#393939,#5a5a5a,#7b7b7b,#9c9c9c,#bdbdbd,#dedede,#ffffff`. `A`=dark base, `E #ffffff`=catchlight.
- **Classic STRIP.** Front bbox **x58–82 y53–65** — sits squarely on the eye-line, ~12 rows tall, ~24 wide, leaves crown and mouth open. End-caps `AAAA` at x58–61/79–82 rows 54–55.
- **Internal = repeating bevel-segment band.** Rows 57–62 tile `FBBFBBDBBEBBDBBGBB` — pairs of `BB` (dark `#181818`) pips between ramp steps `F/D/E/G`, reading as 6 lens segments / vents. The brightest segment center `E #ffffff` sits at face-center x70.
- **Back: empty.** Sides (Left x52–74) skew the band, front-face crowds left edge, `HHH` temple block trails at x70–73.
- **Frames:** frame0 rows 53–65, frame1 rows 53–64 (1px up), frame2 = frame0.

## headwear-looseleaf-metal-visor-03  (wide wrap-around band, neutral metal)
- **Palette (10):** all neutral grays, narrow ramp `#181818`(B,outline) … `#bdbdbd`(J,highlight). `A #8c8c8c` is the dominant mid base.
- **STRIP, wider/taller.** Front bbox **x58–83 y48–66** — top edge at brow row 48, runs to row 66. Top "vent" notches rows 49–50 `III··HHH` (two light tabs). The visor face rows 54–63 is a big `B`(near-black)→`C/E/J` gradient panel — a dark tinted glass look, brightest `JJ` vertical seam at x69–70 (center reflection).
- **Sides wrap dramatically:** Left/Right bbox **x51–87 y38–68** — the band sweeps UP over the temple to row 38 and the `A`-filled mass is the side of a wrap-around visor. The `G` vertical bar (Left x67, rows 57–66) is the temple hinge.
- **Back: empty.**
- **Frames:** ±1 row bob; sides also nudge 1px.

## headwear-looseleaf-metal-visor-04  (twin-lens strip, neutral metal, white catchlights)
- **Palette (8):** neutral ramp, `G #ffffff` catchlight, `H #181818` darkest, `A #393939` outline.
- **STRIP with two bright lens cores.** Front bbox **x57–84 y49–66**. Outline `ABB…BBA` end caps rows 51–53. Rows 54–56 carry two `GGGG` (white) lens centers at x66–69 — the twin highlights. Row 57 `HHHCBBEGGEBBCHHH` shows the `H`(black) lens recesses flanking the `GG` core. Open mouth below row 63.
- **Sides** (Left x54–77) skew; the white catchlight `GGG`/`G` persists as the front lens edge (Left x57).
- **Back: empty.**
- **Frames:** bob ±1 row.

## headwear-looseleaf-metal-visor-05  (RED-glow ornate strip)
- **Palette (11):** neutral grays + **red/pink accent family**: `K #700000` (dark red), `G #c3082c` (red), `J #ff5c7c` (pink hot). `H #181818` blacks, `I #ffffff`/`F #dedede` catchlights.
- **STRIP, jeweled.** Front bbox **x58–83 y48–65**. Two top "horn" tabs rows 49–53 (`B` at x63 and x82 — small antenna nubs ABOVE the brow). The center face rows 57–62 carries the glow: row 58 `BBGJJHAAFIIFAAHJJGBB` — **`JJ`(pink) + `G`(red) paired LEDs** symmetric about center, with `II #ffffff` catchlight at face-center x70. Row 60 `DDBGGKAAEFFEAAKGGBDD` repeats the red/pink motif lower.
- **Sides** (Left x54–77) carry the same `J/G/K` glow cluster near the front edge (Left rows 55–57 `IIIFFAHHJGG…KKGBB`).
- **Back: empty.**
- **Frames:** ±1 row bob; the top horn tab `B` at row 49/50 toggles.

## headwear-looseleaf-futuristic-visor-01  (green/cyan sci-fi strip, full 4-dir)
- **Palette (7):** `A #3b3b3b` (outline/structure), **glow: `E #00ff1b` green + `F #00d7ff` cyan**, `G #ff0000` red (back-only LED), grays `B/D/C` (`C #eeeeee` catchlight).
- **STRIP, V-shaped chin.** Front bbox **x56–86 y45–58**. Symmetric chevron tapering to a point at row 57–58 (x68–72). Rows 50–55 the center column carries `EEEEE`(green) core (row 50–51) transitioning to `FFFFF`(cyan, row 53) — a vertical green→cyan glow gradient down the visor centerline x68–72, haloed by `CCC`(white)→`DDD`→`AAA`.
- **HAS a Back (dir 3).** Back bbox x56–86 y44–53: same chevron outline but the glow center becomes **`GGGGG` red** (row 50 `CCCCGGGGGCCCC`) — a single rear red indicator. Bezel `BBBBBB…DDDDD` segments tile across.
- **Sides** (Left x54–86): visor skews to a diagonal wrap, green `E` and cyan `F` survive as 2-row patches at the front (Left x54, rows 50–53).
- **Frames:** ±1–2 row bob (frame1 raised ~2 rows).

## headwear-looseleaf-futuristic-visor-02  (green/cyan sci-fi, full FACE-PLATE helmet)
- **Palette (10):** green `G #00ff1b` + cyan `H #00d7ff` glow on the lens; **plus a blue tint family** `A #00a0ff`, `I #1085c9`, `D #79ceff` that fills the lower face shield. `J #ff0000` rear LED. `B #3b3b3b` outline, `E #eeeeee` catchlight.
- **Largest sci-fi part — full-face shield.** Front bbox **x56–86 y45–67**. Top rows 47–52 are the segmented brow band (same `BBB…CCC…GGGGG` pattern as visor-01, green core row 51). Below, rows 53–67 a **translucent blue face shield** fills the whole lower face: `D`(light blue) outline + `A`(blue) fill forming a rounded chin guard down to row 67 (`DDDDDDDD` chin). Center cyan lens `HHHHH` row 53.
- **HAS Back (dir 3):** bbox x56–86 y44–53, brow band only (no shield wraps the rear), rear LED `JJJJJ` red row 48.
- **Sides** (Left/Right x54–89): the blue shield `A`-mass wraps the whole side of the head, brow band glow at the front edge.
- **Frames:** ±1–2 row bob.

## headwear-looseleaf-goggles-01  (twin round red lenses + strap)
- **Palette (3):** `B #7d7d7d` (gray frame shadow), `A #b7c0bd` (light gray frame/strap), `C #ff4458` (red lens glass). Minimal — red-glow family.
- **Two discrete circular lenses, worn HIGH on the brow** (above the eyes, pushed-up-on-forehead look). Front bbox **x55–86 y39–57**. Each lens is a 5-wide `CCCCC` red disc (left x60–64, right x72–76) ringed by `A`, rows 40–45. Center bridge `AAAA` x65–68. Below, a thin `AA` **strap wraps around the head sides**, rows 46–57 at x55–57 and x84–86 — the only content in the lower rows (the temple band).
- **Back: empty.** Sides (Left x57–74) show one lens in profile (rows 36–42, `CCC` red) and the strap diagonal trailing down to row 54.
- **Frames:** ±1 row bob.
- **Extension:** strap reaches the silhouette edges (x55/x86) at temple level — sits right at the head outline.

## headwear-looseleaf-headset-01  (gaming headset — biggest extension)
- **Palette (6):** mostly **black** `A #000000` + dark reds `B/F/E #520000/#490000/#ad0000` (earcup shadow), `D #52340d` brown, and accent **`C #6abe30` lime-green** (the earcup LED ring). Red/green family.
- **NOT a visor — over-ear headset.** Front bbox **x51–91 y36–66** (widest of all parts). A **top headband arc** rows 36–48 (the `EBBBBBBE` band crowning the head, x66–80), then **two large ear-cups** at x51–53 and x89–91 (rows 51–60), each marked with the lime `CC` LED (rows 52–54: `ACCB…BCCA`). A **boom microphone** curves down-and-forward, rows 58–66, the `AAAA` arc descending from the right cup toward the mouth (x70–84).
- **HAS Back (dir 3):** bbox x51–91 y36–61, same band + cups, no boom mic visible from behind (mic arc absent below row 60).
- **Sides** (Left x63–81): one cup shown in profile as a rounded `A` block with the `FFDFF/DDCDD` lime-centered LED grid (rows 51–57), headband arcing over the top.
- **Frames:** ±1 row bob; cup LED stays put.
- **Extension:** ear-cups stick out past the face at x51/x91 (4–5 px beyond head outline) and the boom mic crosses in front of the cheek — the most beyond-silhouette pixels of any part.

## headwear-looseleaf-head-band-01  (cloth band, GOLD)
- **Palette (6):** all **gold/yellow cloth** — `D #654c00` (dark gold, knot shadow), `A #957900`, `E #ae9027`, `B #c5a60e`, `C #f4d460`, `F #ffff7c` (bright highlight). No gray ramp; gold IS the family.
- **Thin cloth STRIP across the forehead.** Front bbox **x55–86 y46–56** — the shortest band (~8 rows). Rows 52–53 the band face `AAACCCCCBBBBBBBBBBCCCCCAAA` (a `B`-fill with `CCCCC` light folds at the ends and `FFFF` bright center highlight row 54). Knots/tails `DD` stick out both ends (x55–57, x84–86, rows 46–51) — the tied-knot extension.
- **HAS Back (dir 3):** bbox x55–86 y48–57, the band wraps the rear of the head (rows 54–56 the `FFFF` highlight, same band continues — a headband is visible all the way around).
- **Sides** (Left x54–86): the band wraps diagonally, the knot/tail `DD` trailing behind at the far edge (Left x84–86, rows 46–48), bright `FFFFF` fold at the front (x60–64 rows 48–50).
- **Frames:** ±1 row bob.
- **Extension:** knot tails poke slightly past the head outline at the temples.

## headwear-looseleaf-neo-hat-01  (PURPLE cap — different family)
- **Palette (18):** an **entirely purple ramp**, no grays. Outline-ish `M #000000`, deep purples `R/O/H/P #21033c…#2a054d`, mids `B/G/Q/K/N/E/J/L #36–4f`, brighter `A/I/F/C/D #54–6d0ac8`. Single-hue (purple) cloth family with a faint magenta-pink shimmer.
- **FULL CROWN CAP, not a brow strip.** Front bbox **x56–85 y36–58** — covers the entire top of the head, rows 36–55, with a brim/fold at the bottom (rows 54–58 `BAB…BAB` scalloped edge). Top knot/peak detail rows 37–43 (`BABBBBAB` crown seam). The cap body is a noisy dithered purple field (lots of single-letter speckle = a textured/sequined cloth read). Center motif rows 53–54 `CECJJCEC` (the `JJ`=brightest purple highlight at the cap front center x70).
- **HAS Back (dir 3):** bbox x56–85 y34–56, full rear of the cap (it's a hat, covers all around).
- **Sides** (Left x53–79, Right x62–88): cap profile, same dither, brim at bottom.
- **Frames:** ±1 row vertical bob AND ±1 px horizontal drift in side views (frame2 shifted right 1).

## headwear-looseleaf-neo-hat-02  (GRAY/silver cap — neutral metal family)
- **Palette (30):** very large but it's the **full neutral gray ramp** finely subdivided (`F #000000` … `Q #ffffff`, ~30 steps of gray). This is the same metal ramp as the visors, just with many intermediate values for a smooth brushed-silver / chrome-sequin cap. No chroma accent.
- **FULL CROWN CAP.** Front bbox **x57–84 y38–54** — covers head top rows 38–52 with a 3-row dark brim/rim at the bottom (rows 51–53 `FFYURRR…UYFF` → `FVUUU…VF` → `FVVV…VF` → `FFFF…FF`, a `F #000000` outline framing a `U/V` dark-gray underbrim). The cap face rows 39–49 is a bright `A #e1e1e1` / `Q #ffffff` highlighted dome with `C/N/P` shading and `J/R` mid tones — reads as a metallic/satin cap. Symmetric `CC`/`QQ` motif at center x69–71.
- **HAS Back (dir 3):** bbox x57–84 y37–53, full rear.
- **Sides** (Left x54–81, Right x60–87): dome profile; side adds darker `D/L/W` shading toward the back, brim continues.
- **Frames:** ±1 row bob (+1px side drift).

## headwear-looseleaf-neo-hat-03  (RED cap — red family, identical structure to neo-hat-02)
- **Palette (31):** the **same cap structure as neo-hat-02 but recolored to a red ramp**: `F #000000`, dark reds `M/a/V/S/Z/K/D/R/c #62–ac`, mid pinks `C/U/G/e/X/d/I/O/E/b/H/L #8c…c3`, light pinks `Y/B/Q/J/N/W/T/A #c9…f0c7c7`, `P #ffffff`. Red/pink cloth family.
- **FULL CROWN CAP.** Front bbox **x57–84 y38–54** — pixel-for-pixel the same silhouette and shading layout as neo-hat-02 (same letter POSITIONS, different palette mapping): top dome rows 39–49 with `A`(light)/`P #ffffff` highlights, the `CC`/`PP` center motif, the dark-red `R/U/Z` underbrim rows 50–53. Confirms the artist **builds one cap template and re-palettes it** (gray→red→[purple uses a different, hand-dithered base]).
- **HAS Back (dir 3) and full sides** — mirrors neo-hat-02 exactly in layout.
- **Frames:** ±1 row bob (+1px side drift).
- **Cross-part insight:** neo-hat-02 and -03 are a **proven re-palette pair** — strong evidence that the generator can take ONE structural cap/visor template and swap palette families (neutral / red / green-cyan / gold / purple) to produce a whole matching set.
