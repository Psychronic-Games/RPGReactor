# Torso Part Pattern-Language Analysis (looseleaf, male)

Source: `styles/looseleaf/parts/torso/torso-looseleaf-*.js`
Tool: `node procgen/view_part.js <file> --all --overlay`
All sheets are 144×144, 4 dirs [Front, Left, Right, Back] × 3 walk-frames. Body center column ≈ x70–71.

## Anatomy reference (from the male body silhouette, dir 0 frame 0)

Grounds every row number below. Body bbox x:48–93, y:36–107.

- **Shoulder line**: rows **52–57**, shoulders span **x:56–85** (outer deltoid edge at x≈56 and x≈85).
- **Neck / collar dip**: rows 58–63, narrow neck column x:66–75.
- **Pec / chest core**: rows **66–78**, chest mass x:62–79 (center seam x70–71).
- **Waist taper**: begins ~row 80, narrows to x:62–82 by row 90.
- **Hip line**: ~row 90+.

Plate torsos occupy the chest box (rows ~67–84, x:61–80). Cloth torsos drape from the shoulder down past the waist (rows ~64–103, widening to x:48–94 for cloaks/wide robes).

---

# COMMON PATTERN LANGUAGE

These are the shared rules every torso part obeys. The breastplate exemplars (01 = 12-letter steel, 02 = 6-letter steel) are the canonical statement of the grammar; cloth parts are the same grammar with a softer ramp and a longer drape.

### 1. Palette = a single dark→light luminance RAMP + optional accent family

- Every part is built on ONE monochrome ramp sorted by luminance. The canonical "steel" ramp is the shared 6-stop greyscale baked into many files **verbatim**:
  `#393939 (57)  #5a5a5a (90)  #7b7b7b (123)  #9c9c9c (156)  #bdbdbd (189)  #dede​de (222)`
  (breastplate-02 letters A,B,C,D,E,F; also the spine of breastplate-04/06, shirt-medium-04/05, coat-long-04, apron-01, cloak-01).
- **Role assignment along the ramp** (5–6 stops):
  - darkest (lum ~33–57, e.g. `D`/`A`) = **outline + deep recess/seam shadow**
  - 2nd (lum ~90, e.g. `A`/`B`) = **base shadow / form shadow side**
  - mid (lum ~123, e.g. `F`/`C`) = **midtone base ("local color")**
  - upper-mid (lum ~156, e.g. `C`/`D`) = **lit base**
  - light (lum ~189, e.g. `I`/`E`) = **highlight**
  - lightest (lum ~222–255, e.g. `B`/`F`/white) = **catchlight / rim** (used sparingly: top pec edge, sternum ridge, shoulder cap)
- **Accent family**: when a part has a color (leather trim, gold filigree, gems, dyed cloth) it appends a SECOND small ramp in that hue, ALWAYS keeping the grey ramp underneath for the metal. Recurring accent ramps seen across many files:
  - **Leather brown**: `#502814 #80472b #966432` (breastplate-04, robe-01/02, coat-long-03, breastplate-06 trim).
  - **Gold filigree**: `#654c00 #7e620d #957900 #ae9027 #c5a60e #dabd30 #f4d460` (cloak-02, coat-long-01/02, robe-03 gold, shirt-medium-03).
  - **Blue steel/enamel**: `#14247c #104897 #4e72bb #7499cf #8db6eb` (breastplate-05, cloak-03, shirt-medium-06, neo's blue).
  - **Green**: olive `#1a3b26 #284733 #45614e` (vest-01, cloak-02 lining) or bright emerald (breastplate-03 emblem).
- **Letter count scales with ornateness**: plain steel 6–8 letters (bp-02, bp-06), trimmed steel 10–12 (bp-01, bp-04), ornate/multi-material 15–24 (bp-03=24, bp-05=15, robe-01=18, cloak-02=18, coat-01=21, shirt-medium-06=21). Letters are NOT assigned in ramp order — sort by hex luminance to recover the ramp.

### 2. THE KEY THING — horizontal triple symmetry + the every-3-rows seam swap (quilted plate)

The defining motif of plated torsos. Read breastplate-01 front frame 0, rows 71–82:

```
  71 ·DAAAAAFFFFFFAAAAAD·      <- A-flank  F-center  A-flank, D outline
  72 ·DAAAAAFFFFFFAAAAAD·      (row 72 == row 71 : 2-row pairing)
  73 ·DCCCBBBBBBBBBBCCCD·      <- SEAM ROW: center→B (catchlight), flank→C (lighter)
  74 ·DAAAFFFFFFFFFFAAAD·
  75 ·DAAAFFFFFFFFFFAAAD·
  76 ·DCCCCCBBBBBBBBCCCD·      <- SEAM ROW again, 3 rows later
  77 ·DAAAAAFFFFFFFFAAAD·
  78 ·DAAAAAFFFFFFFFAAAD·
  79 ·DCCCCCBBBBBBBBCCCD·      <- SEAM ROW, 3 rows later
  80 ·DAAAAAAFFFFFAAAAAD·
  81 ·DAAAAAAFFFFFAAAAAD·
  82 ·DCCCCCCBBBBBCCCCC··      <- SEAM ROW closing the bottom plate
```

The two formulas:

- **Letter-triple mirror (per row)**: `[D] [flank] [center] [flank] [D]`, palindromic about x70/71. Outline `D` brackets both ends; an inner band of one letter mirrors inward; the chest center is filled with the opposite-role letter. Canonical body row: `DAAAAAFFFFFFAAAAAD` (outline–shadow_flank–mid_center–shadow_flank–outline). The flank band WIDTH shrinks as you descend (5→4→3 cells) to taper toward the waist, and the center band correspondingly grows then shrinks — this is the pec curve encoded as run-lengths.
- **3-row seam repeat (the quilted look)**: rows come in **2 identical body rows + 1 "seam" row**, repeating every 3 rows (71,72 = body; 73 = seam; 74,75 = body; 76 = seam; …). On the seam row the center band swaps to the **catchlight** letter (`F`→`B`) and the flank swaps **lighter** (`A`→`C`), drawing a horizontal raised rib / quilt-stitch line. This is what reads as overlapping horizontal armor lames.
- **Sternum / center column**: many plates keep the exact center 1–2 columns one notch lighter or darker than the pec fill to suggest a central ridge (bp-02 uses a `CC`/`BB` vertical stripe down the middle at x70–71; bp-06 row 70 `...CCCCCC...` center groove).
- **Rivets / pec caps**: top corners get a bright `I`/`F` 2×2 cap on the shoulder of the pec (bp-01 rows 68–69 `IIDDD` / `IIDDD`; bp-05 `KKGGG`), reading as a polished pauldron edge or rivet.

### 3. Silhouette / shape rules

- **Plate** chest piece STARTS at the shoulder line (row 67–69) and ENDS at the waist (row 82–84). It is a rounded rectangle that **bulges out past the body silhouette by 1–2 px at the shoulders** (bp-01 frame1 rows 65–66 push to x61/x80, ~1px wider than the body deltoid) and tucks back in at the waist. Top edge is a shallow double-arc (the two pec/clavicle humps), bottom edge a single arc.
- **Cloth** (robe/cloak/coat/long-shirt) starts at the same shoulder line but **continues straight down past the waist to rows 100–104**, flaring slightly (drape). It does NOT taper hard at the waist — it widens. Cloaks/wide robes spread to x:48–94 (full body width + sleeve drape); the wizard robe-04 fans sleeves out to x:41–98.
- **Medium shirt / vest** ends around row 84–95, between plate and full robe length.
- Outline is always the darkest ramp letter, 1px, on every silhouette edge.

### 4. Per-direction rules

- **Front (dir 0)**: fully symmetric about x70/71. Both pecs identical, triple-mirror as above.
- **Left / Right (dir 1/2)**: a 3/4 profile. The rule is **catchlight on the FRONT (leading) edge, shadow on the BACK (trailing) edge**, and the near arm overlaps the chest:
  - On **Left** the front edge is screen-right of the piece; bp-01 Left puts the bright `B/I` band on the RIGHT side (`...AACBBD` trailing, `CBB...` leading) and the dark outline `D` on the back/left.
  - On **Right** it mirrors: bright leading band on the LEFT (`DBBC...`), dark `D` outline trailing right.
  - The chest fill compresses to a narrow vertical strip (the visible front plane) with a large transparent gutter where the upper arm sits in front (the `····` block mid-rows in bp-01/02 Left/Right). The 3-row seam swap still runs but is read as short horizontal ticks on the visible strip.
- **Back (dir 3)**: symmetric like front but with a **vertical SPINE line** down x70/71 (bp-01 Back uses the `EEEEE` center column every row as the spine groove) and **two shoulder-blade plates** flanking it — the triple becomes `[D][blade C/A][spine E][blade C/A][D]`. The 3-row seam repeat persists (bp-01 Back rows 71/74/77/80 are the `G…AAEEEEEA…G` seam rows). Top of back gets a horizontal collar band (`HHHHH…HHHH` rows 66–68).

### 5. Per-frame (walk) rules

- The torso **bobs vertically** across the 3 frames. Frame 0 and frame 2 sit ~1 row LOWER and are near-mirror images of each other (slight left vs right lean); frame 1 is the "up/centered" pose, ~1–2 rows HIGHER and the widest/most-symmetric (bp-01: f0 top at row67, f1 top at row65 and full width x61–80, f2 top at row67 shifted right).
- The **seam rows shift WITH the bob** — the 3-row repeat stays phase-locked to the plate, so as the plate moves up 1px in frame 1 every seam row moves up 1px too (no independent seam animation).
- The **arm overlap changes** in side views: across frames the transparent arm-gutter slides (frame 0 arm forward, frame 1 mid, frame 2 arm back), so the visible chest strip on Left/Right grows/shrinks frame to frame (bp-01 Left f0 vs f2: the lit band migrates from the right edge inward).
- Net translation per frame is ±1px vertical and ±1px horizontal lean; the internal letter pattern is otherwise reused.

### 6. Cloth vs plate contrast

| trait | PLATE (breastplate, neo) | CLOTH (robe, cloak, coat, shirt) |
|---|---|---|
| ramp use | hard steps, big jump base→catchlight (123→222 adjacent) | softer/denser ramp, more intermediate stops, smaller per-step jump |
| seams | crisp 3-row quilt rib, dead-straight horizontal | folds run as **diagonal/vertical** soft bands; no rigid 3-row beat |
| silhouette end | tapers to waist row ~83 | drapes straight/flaring to row ~100–104 |
| width | body width +1–2px shoulders | up to full-body / sleeve flare (cloaks x48–94, robe-04 x41–98) |
| outline | 1px hard dark | 1px dark but interrupted by fold shadows |
| symmetry | strict palindrome | left/right halves often **two-tone split** (shirt-long: left half all `A`, right half all `B`) rather than mirrored |
| accents | rivets, sternum ridge, pauldron caps | trim collar, button placket, hem band, gold filigree edges |

Cloth replaces the quilt-rib with **vertical drape columns**: e.g. robe-01/coat-long use repeating `…BB…CC…` vertical stripes that read as hanging fabric folds, with a central button/seam column and a contrasting hem band at the bottom (robe-01 rows 81–84 leather hem `DKKJJJ…`). Coats specifically encode an **open-front lapel**: a mirrored V of trim from the collar down the two front edges with the body/shirt showing in the center channel.

---

# PER-FILE NOTES

## Plated armor family

### breastplate-01 (REFERENCE) — 12-letter steel, riveted quilt
- Ramp D57(outline)→H,J,A,L,E,F123(mid)→K,G,C156→I189→B222(catchlight). Center=F, flank=A, seam center=B, seam flank=C.
- Front rows 71–82 are the canonical quilt (quoted above). Pec caps rows 68–69 `IIDDD`. Bottom apron rows 83–84 solid `FFFFFFFF`.
- Side views: lit `B/I` band on leading edge, `D` outline trailing, big arm gutter mid-rows. Back: `E`-spine column + `EEEEE` center every row, seam rows at 71/74/77/80, collar band rows 66–68.
- Walk: f1 raised & widest (x61–80, rows65–82), f0/f2 lowered & leaning opposite.

### breastplate-02 (REFERENCE) — 6-letter pure steel ramp
- Pure canonical ramp A57…F222, no accents. The cleanest statement of the grammar.
- Front uses a **wide shoulder yoke** rows 65–69 (`AABB…BAAAA` epaulettes past body to x59/x82) then a banded chest: row 73 `ADDFFFFFFFFEEEEEEEEEDD` is a single bright lame, row 75 `ACCDDDDDDDDCCCCCCCCCCC` the recess below it — the quilt expressed as alternating full-width light/recess bands rather than per-cell. Center vertical groove at x70–71 (`CC`/`BB`/`DD`).
- Back rows 69–80: shoulder-blade plates `CCDD…DDCC` flanking a `CCCCCC` spine field, hard `A` outline both sides.

### breastplate-03 — 24-letter ornate / painted crest
- Adds a full GREEN emerald ramp (`#073e09…#6bc26d`) for a central emblem and a BLUE gem ramp (`#25006f #3d00b9`) for set stones, over the steel `A/C/G/I/E/L/P` ramp. lum-0 black `A` is the hard outline.
- Front is a near-circular medallion (rows 68–86, x60–80) with a heraldic motif `DDHHH…HHHDD` in the green band rather than the quilt — ornamentation overrides the 3-row seam here. Still palindromic about x70.

### breastplate-04 — steel + brown leather trim, 10 letters
- Steel ramp B/D/C/A/F/J(222) + leather `#50231d #502814 #80472b #966432`.
- Classic quilt returns: front rows 70–77 triple-mirror `BBDCCA…ACCDBB`, seam swap rows 72/75. Leather appears as edge piping. Shoulder straps `BBB` epaulettes rows 67–68 past body.

### breastplate-05 — blue-enamel knightly plate, 15 letters
- Steel `A/C/F/D/K/G` + BLUE enamel ramp `#14247c #104897 #4e72bb #7499cf #8db6eb` + small tan `#4a3d30 #897159 #9b8065`.
- Front is a domed enamel breastplate: blue field `IIIIIII` (rows 73–75) ringed by steel, gold/white catchlight cross of `G`/white at center (rows 70–71 `KKGGGK`). Strong central boss. Seam beat softened by the enamel inlay but the 2+1 row grouping persists.

### breastplate-06 — steel + brown leather + orange accent, 8 letters
- Canonical steel A–H ramp (E/D/H map to 189/222) + leather `#966432` + bright orange `#d07a1b`.
- Wide yoke rows 67–69, banded chest rows 70–77 with a bright `HHHHH` lame at row 75 and a recess `CCC/AAA` band rows 76–77. Lower skirt rows 78–83 in shadow tones. Same band-quilt as bp-02 with leather/orange piping.

## Neo (segmented body-suit) family

### neo-torso-01 — dark crimson ribbed suit, 6 letters
- Ramp is entirely DARK red `#290000…#660000` (lum 12–30) — a near-black tight suit. No catchlight stop.
- Pattern is **diagonal muscle-segment striations**, NOT the plate quilt: rows 72–82 are dense per-pixel noise of A/B/C/D forming two mirrored muscle masses split by a transparent center gutter (the abdominal cleft). Side views nearly empty (the suit hugs and is occluded by arms).

### neo-torso-02 / neo-torso-03 — segmented suit, 9 letters (IDENTICAL geometry, hue only)
- 02 = grey `#161616…#828282`; 03 = brown/bronze `#1c1200…#a36400`. Same letter grid, swapped palette hues — confirms the artist re-skins one base mesh.
- Front rows 64–83: a **chevron/herringbone weave** — repeating `ABCBA…ABCBA` diagonal ribs forming a >---< pattern down a central seam, with abdominal segment rows 78–82 (`CBCBCBCB` interlock). This is the cloth analog of the quilt: a fixed small motif tiled, not pec-mirrored.

## Cloth — robes

### robe-01 — grey monk robe + leather belt, 18 letters
- Dense grey ramp (P33…F197) + leather belt ramp `R/K/J/O`. Drapes rows 65–103, x56–86.
- Vertical fold columns down the body (`BB…MM…` repeating), a **leather belt band rows 81–84** (`DKKJJJKKKNQQNKKKJJJD`) crossing the waist with a buckle highlight `NQQN` at center, then skirt folds below to row 103. No 3-row plate seam; folds are vertical.

### robe-02 — white/cream robe, gold trim, 9 letters
- Grey/white ramp up to `#ffffff` + gold `#80472b #966432 #b89147`. Wide collar shawl rows 66–72 (`CCDEEDCC` mirrored lapels), bright white chest field, gold trim band rows 84–86 (`HHHHHG`). Drapes to row 102, flaring x54–87.

### robe-03 — blue-and-gold ceremonial robe, 13 letters
- BLUE body ramp `#00274e…#004c99` + GOLD ramp `#402405…#dabd30`. Gold collar/shoulder filigree rows 66–72, blue drape body, gold belt rows 82–84 (`DJJLLLJJJ…`). Same drape architecture as robe-01 with the two-color (blue cloth / gold trim) split.

### robe-04 — wizard robe, wide sleeves, 5 letters (stylized)
- Tiny palette: black outline + two greens `#025e00 #038900` + magenta accents `#7600ee #ff00fc`. Stylized, high-contrast.
- Hugely WIDE: x41–98 — the sleeves fan out as nested chevrons `ACABACAB…` (concentric arcs) from each shoulder. Center body is a narrow `…EBE…` channel with magenta gems. The most non-naturalistic part; pure geometric repeat, mirror-symmetric about x70.

## Cloth — cloaks (widest, draped capes)

### cloak-01 — grey hooded cloak, 9 letters
- Grey ramp incl `#ffffff` catchlight + olive lining `#474026 #615b3a`. x48–93, rows 63–104+.
- Two cape panels hanging from the shoulders with a **vertical body-gap down the center** (the `····` channel rows 70–96 where the chest shows through). Each panel has soft vertical fold shading `BBCCCAAA…`. Clasp/collar rows 66–72.

### cloak-02 — blue+gold+green lined cloak, 18 letters
- Blue exterior ramp + gold trim ramp + green interior lining ramp. Ornate collar rows 63–73 (`KPPQLLL…` gold scallops), green lining `JNNNMMMN` shows at the inner edges. Heavy decorative top, plain drape below. Center body gap as in cloak-01.

### cloak-03 — flat blue cape, 4 letters
- Minimal `#000848 #14247c #104897 #4e72bb`. Clearly a BACK-worn cape: rows 75–101 are almost entirely the transparent body gutter with only the two blue cape edges `…BBA` framing it — confirms cloaks render as a perimeter drape with the body visible inside.

## Cloth — coats (open-front jackets)

### coat-long-01 — blue/gold brocade coat, 21 letters
- Blue body ramp + full gold ramp. x48–93, rows 64–104. **Open front**: mirrored lapels rows 67–77 (`CBBFBBB…` left lapel, `CCADDEFF` right) with a center channel, gold brocade pattern down each front panel. Vertical fold structure, hem flare at bottom.

### coat-long-02 — navy + heavy gold trim coat, 13 letters
- Navy ramp + gold ramp dominant. Densely gold-trimmed lapels and cuffs rows 66–85, button placket implied down center. Same open-front architecture as coat-01.

### coat-long-03 — tan/leather long coat, 6 letters
- Warm leather-only ramp `#604a39…#e5caa4`. Vertical panel folds `BDD…EEB`, a strong **center seam column** (`EEBEE` down x70–71 rows 76–92) = the buttoned front placket. Lapels rows 66–69. Drapes to row 102+.

### coat-long-04 — grey/white coat, 8 letters
- Canonical grey ramp + white. Same lapel + center-placket + fold-column structure as coat-03 but in monochrome steel-grey. Clean reference for "neutral coat."

## Cloth — shirts

### shirt-long-01 — gold/ochre long shirt, 7 letters
- Single ochre ramp `#594306…#b2860d`. Form-fitting, rows 61–102. **Two-tone vertical split**: left half `AAAAAAAA`, right half `BBBBBB` (x62–69 vs x70–78) — a center seam with the two body halves shaded as left-lit / right-shadow. Collar rows 64–69, sleeve caps at shoulders.

### shirt-long-02 — grey/white long shirt, 6 letters
- Grey ramp + white. Same exact silhouette and left(A)/right(B) two-tone split as shirt-long-01 — a re-skin. Collar `CDDC` rows 62–64.

### shirt-medium-01 — red shirt + grey collar/cuffs, 18 letters
- RED body ramp `#5c0a0b…#b11316` + grey ramp for collar/cuffs/buttons + brown. Ends ~row 93. Red chest with `AAAA…` fill, a grey **horizontal button/yoke band** rows 72–77 (`DDDDDDDD` center), grey collar rows 66–68. Two-tone red halves (`A` vs darker) about center.

### shirt-medium-02 — plain white tee, 4 letters
- Smallest cloth palette `#9c9c9c…#ffffff`. Compact chest box rows 66–84, x61–80 — overlaps the plate footprint exactly (it's the tight base shirt). Soft pec shading: bright `B` pec fills, `A/C` flanks, `D` outline, gentle collar `CAAB` rows 67–69. The cloth echo of the breastplate triple but with no hard seam.

### shirt-medium-03 — red+gold patterned shirt, 10 letters
- Red ramp + gold ramp. Patterned: alternating red/gold vertical motif columns rows 66–84. Collar `CAAAIIGDD` rows 67–68.

### shirt-medium-04 — grey shirt, 6 letters
- Canonical grey ramp. Wide form-fit rows 64–87, x48–93 (includes sleeves to elbow). Two-tone halves with center seam, sleeve shading `BBBB AAAA` per arm. Cleanest "neutral shirt."

### shirt-medium-05 — grey/white shirt, 7 letters
- Grey ramp + white. Like sm-04 but with extra highlight detail (white `A` catchlights on the pecs and sleeve caps). Rows 64–92.

### shirt-medium-06 — grey shirt + multicolor trim, 21 letters
- Grey base + blue ramp + orange + brown skin/trim accents. Trimmed collar and cuffs in blue/orange over a grey body. Most decorated medium shirt; same silhouette as sm-04.

## Cloth — other

### vest-01 — olive/tan leather vest, 9 letters
- Olive-green ramp `#1a3b26…#45614e` + tan `#7b764f…#cac88e`. Rows 66–95. **Open vest**: a bright tan **center lacing strip** down x69–73 (`EE`/`IEEI`/`FEEF` rows 70–87 = laced front with cross-ties `IEEI`), olive panels each side, leaving armholes (no sleeves — side gaps). The center-lacing motif is the vest signature.

### apron-01 — grey work apron, 7 letters
- Grey ramp + white. Rows 66–96, narrow (x60–81). **Bib-and-skirt**: shoulder straps `BGGB` rows 67–71 going up to neck, a bright `DDDD` bib panel rows 72–78, a waist band rows 79–81, then a textured `GGGG` skirt below. Strictly front-facing utility piece.

### underwear-01 — minimal briefs, 2 letters
- Only `#34334d #666d90`. Tiny patch rows 81–89, x61–80 — just the waistband/brief at the hip line. Two-stop shading (`B` outline, `A` fill). The base layer.

### pattern-stripe-01 — teal stripe overlay, 3 letters
- `#007e7e #00b4b4 #d3d3d3`. NOT a garment — a vertical STRIPE decal: three 2px teal columns (x66–67, x70–71, x74–75) running rows 67–101, with the upper rows brighter `B` and lower rows darker `A` (a top-lit fade). Designed to composite OVER another torso as a pattern, hence the sparse comb of vertical bars and transparent gaps.

---

## Generator-spec takeaways

1. Pick an archetype → fixes silhouette template (plate box rows 67–84 / cloth drape rows 64–104 / cape perimeter / vest with center lace / bib apron).
2. Build palette = canonical 6-stop grey steel ramp, optionally swap base hue, then append a 3–5 stop accent ramp (leather / gold / blue-enamel / green / dyed-cloth) for trim & emblems.
3. Front: emit palindromic rows `[outline][flank×n][center×m][flank×n][outline]` about x70/71; for PLATE run the 2-body+1-seam 3-row beat swapping center→catchlight & flank→lighter on seam rows, shrinking n toward the waist for the pec curve; for CLOTH emit vertical fold columns + a center placket/seam + a hem/belt band instead.
4. Back: same but with a center spine column and shoulder-blade flanks; add a collar band up top.
5. Left/Right: collapse to a narrow front-plane strip + transparent arm gutter; catchlight the leading edge, shadow+outline the trailing edge; mirror between Left and Right.
6. Walk frames: f1 = up 1–2px & widest/centered; f0/f2 = down 1px with opposite ±1px lean; keep the seam beat phase-locked to the bob; slide the side-view arm gutter across frames.
