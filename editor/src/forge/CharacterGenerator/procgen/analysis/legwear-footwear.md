# Legwear & Footwear — Pattern Language Analysis

Source: `styles/looseleaf/parts/legwear/*` and `styles/looseleaf/parts/footwear/*`
Body reference: `styles/looseleaf/parts/body/male/body-looseleaf-looseleaf-male-body-01.js`
All sheets are 144×144, 4 dirs [Front, Left, Right, Back] × 3 walk-frames.
Letter grids; space / `.` = transparent. Columns/rows below are absolute grid coordinates
(the viewer prints an absolute column ruler). Character is centered on column ~70.

---

# COMMON PATTERN LANGUAGE

## 1. The walk cycle (this governs everything)

Three frames, and the SAME convention holds for every legwear and footwear part:

- **Frame 0 = LEFT leg forward.** On the FRONT view the whole leg mass slides LEFT
  (toward lower column numbers); the part's bbox starts at the left edge (~col 60) and the
  right leg is dropped/trailing. On the SIDE view the forward (lead) leg sits to the LEFT
  and the trailing leg is behind/right, partially occluded.
- **Frame 1 = NEUTRAL / passing pose.** Both legs are apart and roughly symmetric about
  the centerline (col ~70). FRONT view is left-right mirror-symmetric; the inner gap is two
  columns wide at the centerline (cols 70–71). This is the "stand" frame — both feet planted.
- **Frame 2 = RIGHT leg forward.** Exact mirror of frame 0: mass slides RIGHT (toward higher
  columns), bbox ends at the right edge (~col 81), left leg trailing. On SIDE view the lead
  leg is to the LEFT but the pose is the "other" stride (trailing leg now forward-occluded
  differently than f0).

So the generator's per-frame job is: **frame 0 → shift the left leg-tube forward/left and
drop the right; frame 1 → both legs symmetric about col 70–71; frame 2 → mirror of frame 0.**

## 2. Per-frame leg-tube COLUMN table

### FRONT view (dir 0) — two leg-tubes side by side

Centerline is col 70–71. Each leg-tube is ~6–7 px wide. "Inner seam" = the dark shadow
columns between the two legs. Measured from `pants-01`, `pants-02`, `pants-04` (all agree):

| Frame | Left-leg tube cols | Inner seam (gap/shadow) cols | Right-leg tube cols | Bbox X |
|-------|--------------------|------------------------------|---------------------|--------|
| 0 (L fwd) | 60–69 (full, forward) | ~70–71 | 72–78 (narrow, trailing, set back) | 60–81 |
| 1 (neutral) | 60–69 | 70–71 (2-col dark seam `F`/`E`/`G`) | 72–81 | 60–81 |
| 2 (R fwd)   | 60–66 (narrow, trailing) | ~67–69 | 70–81 (full, forward) | 60–81 |

Key marker: in frame 1 the seam between the legs is a literal vertical line of the DARKEST
ramp letter running rows ~88–101 (e.g. pants-01 `FF`/`GG` at cols 70–71; pants-02 `EE`;
pants-04 `CC`/`DD`). In frames 0 and 2 that dark seam is offset toward the trailing leg.

The hem/cuff (where pants end and boot begins, FRONT) is rows ~102–104, drawn as two short
dark blocks under each leg with a transparent notch between them (the ankle gap), e.g.
pants-01 f1 row 103–104: `···FFFFFF····FFFFFF···`.

### SIDE view (dir 1) — legs overlap fore/aft (stride is along the column axis)

Side view shifts the whole bbox to ~cols 58–84 and the lead leg is the LEFT cluster, trailing
leg the RIGHT cluster, separated by a diagonal occlusion gap. The body's foot/boot row pushes
the lead leg forward (lower cols) in f0, splits them in f1, and the trailing leg swings forward
in f2. Representative lead/trail leg column bands (pants-01, pants-04):

| Frame | Lead leg cols | Gap (occlusion) | Trailing leg cols |
|-------|---------------|------------------|-------------------|
| 0 | ~66–77 (forward, low cols) | ~78–80 | ~80–86 (behind, set back & up) |
| 1 | ~63–73 (both nearly stacked, passing) | ~73–75 | ~73–84 |
| 2 | ~58–70 (trailing leg now swung forward) | ~70–73 | ~73–84 |

The diagonal "leg behind body" shadow is the most reliable side-view marker: a wedge of the
darkest ramp letter cutting from upper-right to lower-left between the two leg clusters
(pants-01 uses `D`; pants-04 uses `D`).

## 3. Boot toe direction (THE footwear rule)

Boots occupy rows ~94–107 (ankle to toe), about 13–14 rows tall, sitting at the very bottom of
the leg-tubes. Universal behavior across boots-01..05 and neo-boots-01:

- **FRONT view:** both boots are short oval blobs, ~6–8 cols wide, centered under each leg-tube.
  Toe = the lower 2–3 rows (105–107) which are the flat sole, drawn in the DARKEST ramp letter.
  Boots flatten to a sole line (uniform dark row) at rows 106–107.
- **SIDE view: the toe points in the STRIDE (forward) direction.** The lead boot is the LEFT
  cluster and its toe EXTENDS LEFT (lower columns) — the boot's widest horizontal run is at the
  toe rows (102–105) reaching toward low cols. The trailing boot is the right cluster, toe also
  pointing left but set back/up and partly occluded. In every side frame the long axis of the
  forward boot points left = forward.
  - boots-01 f0 side: lead boot toe sole at rows 102–105 reaches cols ~54–58 (far left).
  - boots-04 f0 side: lead boot rows 102–105 reach cols 54–58; trailing boot toe at cols ~75–80.
- **Sole line:** the bottom 2 rows of every boot, every direction, are a solid run of the single
  darkest ramp letter (boots-01 `A`, boots-04 `B`, boots-05 `C`) = the rubber sole shadow.
- **Cuff at top:** rows 94–96 are a distinct band (often a lighter or contrasting ramp value)
  = the boot collar where it meets the pant hem (e.g. boots-01 top band `BBBBBB` of `B`;
  boots-03 cuff `EHHIIIHEE`; boots-05 `BBEEEB`).

## 4. Palette structure (shared conventions)

- **Letter count:** simple parts 6–8 letters; ornamented parts 10–20 (shorts-02 = 18,
  neo-boots-01 = 20). Letters are NOT brightness-ordered in the source — the artist assigns them
  arbitrarily; the dark→light role comes from luminance, not letter name.
- **Ramp = dark→light shading of one color family.** Pants are a tight low-luminance ramp:
  - pants-01: grey-blue, lum 30→89 (`G`#1e1e1e … `E`#595959), with `F`#34344c the bluish
    mid used for the inner seam — a cool accent inside a neutral ramp.
  - pants-02: near-black grey, lum 17→89.
  - pants-03: WHITE/silver ramp, lum 57→255 (`A`#ffffff brightest) — a light-trousers variant.
  - pants-04: indigo/navy, lum 43→110 — the canonical "denim/blue pants distinct from metal above".
- **Role mapping (typical 8-letter pants ramp):** darkest 1–2 letters = outline + inner-seam
  shadow + hem; mid letters = leg-tube body and the rounded shading down the tube; lightest 1–2 =
  the highlight stripe running down the FRONT/outer edge of each leg-tube.
- **Color FAMILY for pants vs metal:** pants choose a cool dark family (blue/navy/black/grey),
  deliberately darker and less saturated than armor metal above the waist. Confirmed by
  pants-01/02/04 all sitting under lum 110.
- **Boots: warm leather family** (boots-01 browns #402405→#cc7036; boots-02 oxblood reds with a
  gold accent `I`#ffb619/`E`#ffc955) OR neutral grey (boots-04/05 share the same 8-step grey ramp
  #181818→#ffffff). neo-boots-01 = dark-red ramp + single cyan glow accent `C`#00fff3 (sci-fi).
- **Accents are a SEPARATE bright sub-ramp grafted onto the part palette:**
  - knee-pads-01: yellow plate, lum 96→255, drawn ONLY as a ring at the knee.
  - leg-stripes-01: yellow calf stripe, lum 0→207, drawn ONLY as a horizontal band on the shin.
  - shorts-02: red+gold heraldic — a red ramp (`N`..`C`) plus a gold ramp (`H`..`Q`) for a crest.

## 5. Internal pattern rules

- **Leg-tube outline:** every leg-tube has a 1-px outline of the darkest ramp letter on its outer
  edges so the two legs read separately even when adjacent (pants-01 `F`/`G` borders).
- **Inner-seam shadow:** the 1–2 columns between the legs are the darkest ramp value — this is the
  single most important readability cue and it MOVES with the stride (see table §2).
- **Vertical highlight:** the lightest ramp letter runs as a thin vertical stripe down the front
  of each tube (pants-01 `E` column; pants-02 `D`) — simulates a rounded cylinder lit from front.
- **Hem / cuff at ankle:** rows ~102–104, a darker horizontal cap on each tube with a transparent
  notch between the two ankles.
- **Knee accent:** when present (knee-pads, leg-stripes), it is a small motif (oval plate / band)
  duplicated once PER LEG and placed at the per-frame leg position — it strides with its leg.

## 6. Per-direction summary

- **Front (dir 0):** two tubes side by side, mirror-symmetric in f1; stride = horizontal slide.
- **Left (dir 1) / Right (dir 2):** legs overlap fore/aft; stride = along the column (fore/aft)
  axis; diagonal occlusion shadow between lead and trailing leg; boot toe points forward (lead =
  left for Left-facing, would be right for Right-facing — mirrored).
- **Back (dir 3):** like front but no front highlight stripe; the lit stripe disappears and the
  tubes are flatter/darker (back of leg). (Not separately tabled; mirror the front rules,
  remove the front highlight column.)

## 7. Per-frame bob

Tops of the parts shift vertically by ~1 row between frames (the passing frame f1 sits ~1px
higher, the contact frames f0/f2 ~1px lower) — a subtle body bob. The waistband row (~81–82) is
nearly constant; the variation is mostly at the hem/foot end.

---

# PER-FILE NOTES (with quoted rows)

## pants-01 (`legwear/legwear-looseleaf-pants-01.js`) — STUDY FILE
8 letters, cool grey-blue ramp lum 30→89; `F`#34344c is the cool inner-seam accent.
Front f1 is the clean reference for neutral stride — note the two-col dark seam `FF`/`GG` at the
center and the symmetric tubes:
```
 88 FCCEEECAAFFFFAACEEECCF      (rows 88-89: inner FFFF block at cols 70-73)
 99 GBBBBBBBBBGGBBBBBBBBBG      (seam GG at 70-71)
103 ···FFFFFF····FFFFFF···      (hem: two cuffs + ankle notch)
```
Front f0 (left fwd) bbox shifts to start at col 60 with the right tube narrowed (cols 72-78);
f2 mirrors. Side f0: lead leg cols ~66-77 forward, trailing wedge of `D` cuts cols 78-86.

## pants-02 (`legwear/legwear-looseleaf-pants-02.js`)
8 letters, near-black grey lum 17→89. Same stride/seam structure as pants-01, darker. The hem
is a bright run `FFFFFFFF` (lightest `F`/`D`) at row 102: `FFFFFFFFE  EFFFFFFFF` (f1) — a light
cuff trim. Inner seam `EE` at cols 70-71.

## pants-03 (`legwear/legwear-looseleaf-pants-03.js`)
7 letters, WHITE/silver ramp lum 57→255 (`A`=#ffffff is the body, `E`#393939 the outline). Light
trousers. Wider bbox (cols 58-83) and taller (rows 78-101) — these are baggier. f1 is fully
mirror-symmetric with seam `EE` at center. Same per-frame slide.

## pants-04 (`legwear/legwear-looseleaf-pants-04.js`)
6 letters, indigo/navy lum 43→110 — the canonical "blue jeans distinct from metal". `D`#282840
outline/seam, `F`#5e6e97 highlight. Front f1 seam is `CC`/`DD` at cols 70-71:
```
 90 DDBEEFFFBAAACCAAABEEBBBBDD   (CC seam at 70-71, EEF highlight stripes flank it)
102 DDCAABAABBBADDABBBAABAACDD   (hem with DD ankle notch)
```

## shorts-01 (`legwear/legwear-looseleaf-shorts-01.js`)
8 letters, olive/khaki lum 35→141 with a gold core (`G`#ad8400,`H`#977200). SHORT: bbox rows
78-96 only — stops mid-thigh, no ankle/hem, leaves the lower leg bare. Still strides: f0 mass
left, f1 symmetric, f2 right. The gold `GGGGG` core at rows 82-84 is a belt/fly detail.

## shorts-02 (`legwear/legwear-looseleaf-shorts-02.js`)
18 letters — red ramp (`N`..`C` #600003→#ff0b0f) + gold ramp (`H`..`Q` up to #ffff7c). Even
shorter (rows 81-95), a single wide trunk rather than two separate tubes — a heraldic skirt/trunks
with a gold crest (`LQQK` column at center). f1 is mirror-symmetric; minimal stride (it's a
skirt-like piece so legs aren't individually outlined).

## knee-pads-01 (`legwear/legwear-looseleaf-knee-pads-01.js`)
12 letters, YELLOW plate ramp lum 96→255 (`G`#ffffff specular, `D`#fffb00 face). ACCESSORY:
tiny — bbox rows 87-96, just two small armored ovals, ONE PER KNEE. They track the per-frame leg
position exactly: f0 both pads left, f1 split symmetric (`AFHHFFA` motif duplicated at cols ~62
and ~73), f2 both right:
```
 88 ·AFHHFFA····AFHHFFA·   (f1: two knee plates, one per leg, symmetric)
```
This is the model for "duplicate accent per leg, place at per-frame leg column."

## leg-stripes-01 (`legwear/legwear-looseleaf-leg-stripes-01.js`)
8 letters, yellow lum 0→207. ACCESSORY: a thin horizontal calf band, rows 90-94 only. f1 shows
the band duplicated per leg with the centerline gap:
```
 91 ABBBBBBBBBAABBBBBBBBBA   (two stripes, gap at cols 70-71)
```
Again strides per leg (f0 both left, f2 both right). A stripe = a single bright row-band drawn
across each leg-tube at the shin.

## boots-01 (`footwear/footwear-looseleaf-boots-01.js`) — STUDY FILE
7 letters, brown leather lum 41→133. Rows 94-107. FRONT f1 = two symmetric boots, sole line
`AABBBBBBA  ABBBBBBAA` at rows 106-107 (darkest `A` sole, mid `B` flat), ankle notch between.
Cuff band `B` at rows 94-95. SIDE f0: lead boot toe sole rows 102-105 reaches far LEFT (cols
~54-58) = toe points forward; trailing boot at cols ~75-82 set back. Clear demonstration of the
toe-forward rule.

## boots-02 (`footwear/footwear-looseleaf-boots-02.js`)
10 letters, oxblood red ramp + GOLD accent (`I`#ffb619,`E`#ffc955). Same geometry as boots-01;
the gold appears as horizontal trim stripes across the boot (rows 99-101 `IIIIIIIIII`/`GGGGGGGGGG`)
— a buckle/strap band. Sole `AAAAAAAAA`, cuff at 94-95.

## boots-03 (`footwear/footwear-looseleaf-boots-03.js`)
10 letters, blends a grey ramp with the pants-04 indigo letters (`G`#282840,`C`#323651,`F`#3d4463)
— designed to pair with navy pants. Top cuff is a wide patterned band `EHHIIIHEE` (rows 94-96).
Sole `J`#... run at row 105 `DDDJJJJDD`. Same stride/toe rules.

## boots-04 (`footwear/footwear-looseleaf-boots-04.js`)
8 letters, neutral grey ramp lum 24→255 (shared with boots-05). Rows 93-107. FRONT f1 symmetric;
SIDE f0 lead boot toe reaches cols 54-58 (rows 102-105), trailing boot cols ~75-80 — textbook
toe-forward. Sole `BBBBBBBA` rows 106-107.

## boots-05 (`footwear/footwear-looseleaf-boots-05.js`)
8 letters, SAME grey ramp as boots-04 (#181818→#ffffff), different lacing pattern (taller, rows
91-107, a higher shaft). Cuff `BBEEEB` rows 91-92 sits higher up the shin = knee-high boot. Sole
`AAACCCCCC`/`AADDDDDDA`. Same stride/toe behavior.

## neo-boots-01 (`footwear/footwear-looseleaf-neo-boots-01.js`)
20 letters — dark-red multi-step ramp (`K`#410000 … `G`#d90000) + single CYAN glow `C`#00fff3 +
grey `T`#414141. Sci-fi boot. The cyan `C` is a glowing seam/LED line running vertically down the
boot center (cols ~70-73): `··ACCCCCCCCKKKIIIII` (f0). Otherwise same rows 94-107, sole at
106-107, per-frame stride and toe-forward rule hold. The cyan accent is the neo signature, drawn
as a thin vertical light strip — analogous to the pants highlight stripe but emissive.
