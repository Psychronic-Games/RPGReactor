# Headwear — "Soft" Cloth & Jeweled Archetypes (LooseLeaf)

Analysis of 19 parts: 4 bandanas, 4 hats, 4 hoods, 4 crowns, + bishop-hat-01, turban-01, head-band-01.
All sheets are 144×144, 4 directions [Front, Left, Right, Back] × 3 walk-frames. Viewer cropped to bbox; `·` = body overlay underneath.

The head anatomy these parts sit on: the cranium spans roughly **x 57–84** (≈28px wide), the forehead/hairline is around **y 46–51**, the crown-top of the skull is around **y 42–44**, and the chin is near **y 60**. Parts are authored against this.

---

## COMMON PATTERN LANGUAGE

### 0. Two production tiers (CRITICAL for the generator)
The set splits into two completely different authoring styles:

- **Tier A — "Ramp" parts (15 of 19): the procedural-friendly majority.** Small indexed palettes (**5–11 letters**), a clean dark→light luminance ramp, symmetric left/right mirroring, hard 2-px outlines, flat fills with banded shading. These are what a generator can reproduce. ALL bandanas, ALL hats (except hat-04), ALL hoods, crown-01/02/04, turban, head-band.
- **Tier B — "Full-render" parts (4 of 19): hand-painted outliers.** `bishop-hat-01` (89 colors), `crown-03` (89 colors), and `hat-04` (15 near-black colors, photographic). These are noise-dithered, near-grayscale, NOT mirror-symmetric, and sit much higher on the head (bishop y11, crown-03 y15) than any ramp part. **A ramp-based generator should NOT attempt these** — treat them as imported art assets, not generated.

Everything below describes **Tier A** unless stated.

### 1. Palette structure
- **Letter count by archetype:** bandana 5 (one bandana=7), head-band 6, hood 6–7, hat 6–8 (hat-03=11, hat-04=15 noise), crown 9 (crown-02=11). More letters ⇒ richer material (metal/gold gets more shades than flat cloth).
- **Sorting:** the viewer already sorts dark→light by luminance; the artist's raw letter assignment is arbitrary (e.g. crown-04 `A` is mid, not darkest). **Generator should work in luminance order, not letter order.**
- **The ramp is a single hue held constant, value-stepped.** Cloth bandanas (01) ramp #380000→#700000→#a30000→#c3082c→#db263d — pure red, 5 evenly-spaced values. Gold hats (hat-01) ramp #402900→…→#c39700 — pure amber. The darkest 1–2 entries double as the **outline**; the lightest 1–2 entries are **speculars/highlights**.
- **COLOR FAMILY per archetype (the strongest "language" signal):**
  - **Cloth/soft (bandana, hood, turban, head-band):** desaturated or single-hue ramps. Red `#a30000` family (bandanas 01/03/04, crown-02 base), grey `#5a5a5a→#fff` (bandana-02, hat-02 brim), tan/khaki `#bcaa7d…#463c24` (hoods 02/03, hat-02), purple `#493357→#b696bc` (hoods 01/04). Greys/browns dominate.
  - **Gold/metal (crowns, hat-01, hat-03 band, head-band):** warm amber→pale-yellow ramps, e.g. `#836d26→#fee483→#ffffa2` (crown-01), `#654c00→#f4d460→#ffff7c` (head-band). Always a wide value range with a near-white specular at the top.
  - **Accent letters break the ramp's hue.** Crown-02 base is red but carries a **pink/magenta gem** `#ff8796` (`J`) and a steel-grey rivet set `#393939/#5a5a5a/#7b7b7b` (`H/I/G`). Crown-04 base is gold but the hanging pendant is **red** `#a30000/#c3082c/#ff4458` (`E/F/I`). Hood-01/04 add **near-black** `#1e1e1e/#393939` (`G/F`) for deep interior shadow/face-frame creases. Turban adds a navy `#333b4f` (`D`) outline and a brown knot `#36260a` (`H`).

### 2. Silhouette shape (rows/cols)
- **head-band / bandana (forehead wrap):** thinnest. Occupies only **y 48–56** front (≈8 rows), a horizontal band across the forehead `x 57–84`. Does NOT cover the top of the skull. Ends in side **knots/tails** that extend past the head outline (see §6).
- **bandana-03/04 (skull-cap variant):** the exception — these cover the WHOLE crown of the head, doming up to **y 36** and wrapping down to y 57, a full rounded skull cap, not just a forehead band.
- **hat (brimmed):** dome rises ABOVE the skull to **y 36** (crown of hat ≈10 rows above the head-top) and flares out to a **brim** wider than the head — front brim spans `x 53–90` (hat-01) vs head's `x57–84`, overhanging ~4px each side. The brim is the widest row, near y 50–56.
- **hood (drape):** rises to **y 36–37** over the head AND drapes DOWN far past the chin onto shoulders. Front bbox runs **y 36–78** (hood-01) — i.e. ~18 rows below the chin. The face-opening is a cut-out hole (transparent) around `x 65–77, y 57–63`. Hoods 02/03 are simpler (drape to y66, two front lappets framing the face); hoods 01/04 are elaborate (full shoulder-cape with knot detail at y64–78).
- **crown (peaks above):** a band at the brow `y 46–51` with **points/peaks rising ABOVE** to y42–45 and a central tall spike. Crown-01 front: center spike `BHHB` at y43–45, two side merlons. Crown-04: open frame with tall side prongs y45–50 and a center arch + **hanging gem pendant below the band** (y54–60). Crowns sit lowest of all (band ~y48) but spike highest locally.
- **turban (wrapped dome):** full dome y37–53 like a hat but no brim; characteristic **diagonal wrap folds** crossing the dome, plus a tail draping down one side (left view drapes to y66).
- **bishop-hat (mitre, Tier B):** tallest of all, a pointed mitre `y 11–53` — ~25 rows above the head, narrowing to a point at top.

### 3. Internal pattern (cloth-soft vs metal-hard)
- **Cloth = soft value gradients, few hard seams.** Bandana/hood fills use long runs of one value with gentle 1-step transitions (`AAAAAA…BBBB…CCCC`). Fold lines are short diagonal/vertical streaks of one darker step (e.g. hood-01 front rows 48–53 show `EEEDDDDDDDCCC` soft bands; bandana knot folds are `DDEEEEDD` soft V's). Edges are rounded, anti-aliased with the 2nd-darkest value.
- **Metal/gold = harder seams, more contrast, rivets & facets.** Crowns and gold hats juxtapose the brightest and darkest values directly (specular hotspots `HH`/`DD` next to outline `B/A`), giving a shiny metal read. Hat-01 has a clear **horizontal banded gradient** per row (dark rim → bright center → dark rim) repeated, simulating a smooth domed felt-but-stiff hat. The gold band on hat-03 (`HHJHHI` at row 51) is a discrete jeweled strip embedded in a grey felt hat.
- **Gem/jewel accents (crowns only):** a small 2×2 to 3×3 bright cluster of an off-ramp hue. Crown-01 center `HFFH`/`DDDD` (pale-gold cabochon). Crown-02 carries multiple `JJ`/`KK` pink gems set in the band (`BBCEECBB` settings around them) AND grey rivets. Crown-04 a red `IIE` faceted drop pendant. **Pattern: gem = brightest-2 ramp values + 1 accent hue, framed by the 2 darkest values as a bezel.**
- **Brim shadow line (hats):** under the brim, hats place a row of the 1–2 darkest values as a cast shadow (hat-01 rows 54–56 `AAA…AAA` flat dark underside).

### 4. Per-direction conventions
- **Front/Back are mirror-symmetric** about the vertical centerline; left/right halves of each row are palindromic. Generator can author one half and mirror.
- **Left and Right are horizontal mirrors of each other** (same pixels, flipped). The viewer confirms identical bboxes mirrored.
- **Side views reveal the tail/drape.** Bandanas show the knot+tails trailing off the BACK of the head in side view (bandana-01 left, tails at x84–92, y52–62). Crowns show **fewer points** in side view (the front-facing peaks collapse to a profile band). Turban shows its wrap tail.
- **Back view:** hoods fully cover the head (no face hole) and show the full cape drape + a knot/seam pattern down the center back (hood-01 back rows 64–77 are a structured knot). Crowns in back are just the band+merlons, no central spike detail. Bandanas in back show the knot and dangling tail ends (bandana-01 back rows 60–69 are two hanging tails `ADDB…` / `DDDDD`).

### 5. Per-frame (walk bob)
- **All 3 frames are the SAME art, vertically shifted by the walk bob.** Frame 0 and frame 2 are identical; frame 1 is shifted UP by ~1px (the up-step of the gait). The bbox top moves up one row in frame 1 (e.g. bandana-01 front frame0 starts y45, frame1 starts y43). **The part bobs in lockstep with the head** — no independent sway in the cloth (even hood drapes bob rigidly). Generator: author frame 0, copy to frame 2, shift frame 1 up 1–2px.

### 6. Extension-beyond-silhouette (overlay pixels with no `·` underneath)
These are the pixels that prove the part extends past the head and define its identity:
- **Hat brim** overhangs the head outline left & right by ~3–5px (hat-01 front row 50 reaches x49 & x92; head only spans x57–84).
- **Hat/turban/hood dome** rises ~6–10px above the head-top (filled rows at y36–40 with no body under them).
- **Bandana/turban/head-band tails & knots** trail off the back-side of the head in side views (bandana-01 left x84–92; turban-01 left drape x84–90 down to y66) and hang as twin tails in back view.
- **Crown peaks/spikes** project above the band into empty space (crown-01 center `BHHB` y43–45; crown-04 prongs y45–50 with nothing beneath) and crown-04's **gem pendant hangs below** the band in front of the face.
- **Hood shoulder-cape** drapes far below the chin onto the shoulders (hood y61–78), the single largest extension in the set.

---

## PER-FILE NOTES

### Bandanas (forehead-wrap cloth — RED family, 5-color ramp)

**bandana-01** (red, 5: #380000→#db263d). Pure forehead band, **y45–57 front** (no skull coverage). Center has a bright knot/highlight band: row 51 `DDDDDDDEEEEEEDDDDD` (bright `E` center). Side view (left) shows the knot and **two trailing tails off the back** (x84–92, y52–62: `CBBA`/`CADDA`). Back view rows 60–69 = the dangling double tail. Outline = darkest `C`. Soft cloth: short soft folds `DDEEEEDD`.

**bandana-02** (GREY, 7: #393939→#ffffff). Same forehead-band silhouette as 01 but a near-grayscale ramp (a white/grey patterned cloth) — front y45–54. Internal pattern is a busy **woven/print texture** alternating mid and light greys (`EAAEFFFGGGBBB`) rather than a smooth gradient — this is the only "patterned fabric" read. Side tail drapes (left x84–93, y54–62). Back shows a structured knot (rows 54–69 with `FFF`/`EEE` light folds).

**bandana-03** (red, 5: #700000→#ff4458). **Skull-cap variant** — covers the WHOLE top of the head, dome y36→57 front, wrapping down. A tied bandana worn over the crown. Front is a full rounded red dome with a soft radial gradient (bright `A` center #ff4458, darkening to `E` rim). Back view extends to y75 with hanging knot-tails (rows 64–75). No brim.

**bandana-04** (red, 5: #700000→#ff4458). Same palette as 03; **skull-cap + long side tail**. Full dome front (y36–53) like 03, but the LEFT view shows a long knotted tail draping down the side/back to **y69** (x84–89). Combines 03's cap with 01's trailing tail.

### Hats (brimmed — domed crown + flared brim)

**hat-01** (GOLD/amber, 6: #402900→#c39700). The cleanest generator template. Symmetric domed felt hat, dome y36→53, **brim flares to x49–92** (overhangs head ~5px/side). Every row is a **horizontal value-gradient band**: dark rim `A/B` → `C/E` → bright center `D/F` → back to rim, e.g. row 50 `AABCCCCCEEEEFFFF…FFFFEEEECCCCCBAA`. Brim underside (rows 54–56) is flat darkest `A` (cast shadow). No accents — pure value modeling.

**hat-02** (BLUE+grey, 8: #14247c→#8db6eb). Domed cap with a **patterned crown** (rows 40–47 carry a regular `CCACCACC` dot/check motif — a fabric weave) over a grey under-brim band (`GG…GG`, `EEFFF…`, `HHHH` light grey center row 52). Two-material: blue patterned cloth body + grey trim/brim. Brim spans full width with grey shadow row.

**hat-03** (GREY felt + GOLD band, 11: #393939→#ffffff +gold #957900→#dabd30). A grey domed hat with a **jeweled gold hatband**: front rows 51–56 embed `HHJHHI`/`GIIE`/`HHJHHI` — discrete gold-with-bright-`J` studs in the grey felt. Demonstrates the "metal strip on cloth" combo. Right/Back views are taller (y36–71) showing a back flap/tail (rows 57–71 grey drape).

**hat-04** (BLACK, 15 near-black noise — **Tier B outlier**). A photographic black top-hat/cap rendered with 15 values all luminance 0–77, heavy dither (`AHHHH…ANNBBCCEEEEC…`). Not mirror-symmetric, no clean ramp. Do NOT generate; import as art.

### Hoods (drape cloth — cover head + cape onto shoulders)

**hood-01** (PURPLE, 7: #1e1e1e→#b696bc, +near-black G/F). Elaborate hood. Front y36→78: dome over head, **face-opening hole** x65–77 y57–63 (transparent, framed by `BB`/`CC`), then a **full shoulder-cape with a structured knot** below (rows 64–78 show `GGG…FFFF…GGG` dark creases forming a draped collar). Soft purple value gradient inside the hood (`EEEEEDDDDDDCCC`). Back view fully encloses the head (no hole) and shows the cape spreading wide (x54–87) with center-back seam knot (rows 64–77).

**hood-02** (TAN, 6: #463c24→#bcaa7d). Simpler hood. Front y36→66: rounded tan hood, face framed by **two front lappets** (rows 55–66 show twin vertical `BB……BB` drapes flanking the open face). Smooth tan gradient, dark `B` outline. Back (y36→68) is a closed rounded drape with a scalloped bottom hem (rows 61–68 `CCCC…EEEE`).

**hood-03** (TAN, 6: identical palette to hood-02). Same hood as 02 but a **wider scooped face-opening** (front rows 52–56 `BBBBBBBB` lintel then a broad hole) — a more open cowl. Back view is pixel-identical to hood-02. Effectively a face-opening variant.

**hood-04** (PURPLE, 7: identical palette to hood-01, letters relabeled D↔E). Same elaborate shoulder-cape hood as hood-01 (the front/back drape, face hole, knot are the same geometry). Differs only in palette letter assignment / minor interior shading. Treat 01 & 04 as one archetype with a value-tweak.

### Crowns (gold/metal band + peaks + GEMS)

**crown-01** (GOLD, 9: #532e29→#ffffa2). Classic jeweled crown. Brow band y46–51 with **5 merlons/peaks**: tall center spike `BHHB`/`BADDAB` (y43–45) and side prongs. Center carries a **pale-gold cabochon** `HFFH`/`DDDD` (rows 46–49). Hard metal shading: bright `D/H` speculars against `A/B` outline. Back (y46–53) is just the band+low merlons, no center spike — fewer points in profile/back.

**crown-02** (RED velvet + GOLD/pink-GEM + steel, 11: #380000→#ff8796). A red cap-crown with a **studded gold rim**. Front rows 51–53 alternate gold `DDF…FFD` with **pink gems** `JJ` (#ff8796) and steel rivets `IIG`/`GII` (#5a5a5a/#7b7b7b). The richest accent vocabulary: 3 hues (red base + gold + pink gem + grey rivet). Side views show the rim wrapping with gems spaced around it.

**crown-03** (89-color full-render — **Tier B outlier**). A photographic jeweled gold crown, sits very high (y15–52), full sub-pixel detail with blue gems (`~ : | *` blue letters) and gold filigree. Not a ramp; do NOT generate.

**crown-04** (GOLD open-frame + RED gem pendant, 9: #a30000→#f4d460). A delicate **open circlet**: thin gold prongs (front rows 45–53, two side spikes `BB…BB` + center arch `ABBCDDCBBA` y54–56) with mostly-empty interior (head shows through), and a **hanging red faceted gem pendant** below the band in front of the brow: rows 57–60 `EFFE`/`EIIE`/`EIIE`/`EE` (#c3082c/#ff4458 drop). Best example of "gold frame + colored gem drop".

### Singletons

**bishop-hat-01** (89-color full-render mitre — **Tier B outlier**). Tall pointed white/grey mitre, y11–53 (tallest part), photographic grayscale dither. Not generable from a ramp; import as art.

**turban-01** (wrapped cloth, 8: #000000→#ffffff, +navy #333b4f outline, +brown #36260a knot). Full dome y37–59 front with characteristic **diagonal wrap-fold bands** crossing the dome (alternating light `FFF`/`EEE` and mid `CCC`/`AAA` diagonal stripes = the wound cloth). Navy `D` outline, white `F` highlights on the folds. Brown `H` knot at the front-base (rows 54–59 `HH`). Left/Right views show a **tail draping down the side to y66**. Cloth-soft but with explicit wrap-seam stripes (more structured than a bandana).

**head-band-01** (GOLD, 6: #654c00→#ffff7c). Thinnest gold part. A simple forehead circlet y48–56 front (band across brow `AAACCCCCBBBBBBBBBBCCCCCAAA` with a bright center jewel-bump `CCCFFFFCCC` row 54, #ffff7c specular). Ends in small side knots that trail off in side view (left x82–86, y48–53). Metal ramp, single center highlight — like a minimal crown with no peaks.
