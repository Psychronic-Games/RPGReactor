# Armwear & Handwear — Looseleaf Pattern Language

Reverse-engineered from 11 parts so we can procedurally generate matching arm/hand gear.
All sheets are 144×144 uniform cells, 4 directions [Front, Left, Right, Back] × 3 walk-frames.
Parts draw OVER the body. The body's arms hang at the torso sides in front/back view and
swing dramatically in side view — these parts MUST translate with the arm per-frame.

---

## COMMON PATTERN LANGUAGE

### 0. Two part families by anatomical coverage

| Family | Members | Vertical extent (rows) | What it wraps |
|--------|---------|------------------------|---------------|
| **Forearm cuff** (armguard / gauntlet) | armguard-01, armguard-02, neo-gauntlet-01/02 | ~70–90 (≈18–20 rows) | elbow → wrist only; upper arm/shoulder bare |
| **Full sleeve** | sleeves-long-01, sleeves-long-02 | ~64–101 (≈33 rows) | shoulder → past the wrist, one continuous tube |
| **Hand / wrist band** (handwear) | gloves-01/02/03, bracelet-01, wristband-01 | ~78–92 (≈8–14 rows) | the hand + a wrist band, sitting at the very end of the arm |

The body anchors everything. In **front/back** view the two arms sit at the torso sides:
left arm ≈ **x 48–62**, right arm ≈ **x 79–93** (a mirrored pair flanking the ~x63–78 torso
gap, which prints as `·` overlay between them). In **side** view only ONE arm is the near
(drawn) arm and it swings forward/back across the 3 frames — this swing is the whole game.

### 1. Palette structure (dark→light ramp + accent)

Every part is a single hue FAMILY ramped dark→light, optionally plus ONE saturated accent.

| Part | #letters | FAMILY | Ramp (dark→light) | Accent |
|------|----------|--------|-------------------|--------|
| neo-gauntlet-01 | 12 | neutral gray | G#303030 … C#d5d5d5 | **cyan power strip** E#00edff, F#66f4ff |
| neo-gauntlet-02 | 11 | **dark red** | G#300000 … C#d50000 | **cyan power strip** E#00edff, F#66f4ff |
| armguard-01 | 12 | blue+gray | B#14247c … J#ffffff (steel highlights H/J=white) | blue body A#104897/D/F/I + gray rivets |
| armguard-02 | 12 | gray + **leather brown** | D#181818 … H#dedede + brown C/L/J/I (#4a3d30..#7c6751) | brown strap/buckle accent (I/J/C/L) |
| sleeves-long-01 | 10 | **olive/khaki green** | C#1a3b26 … H#cac88e | none (cuff ribbing in F/G/H lights) |
| sleeves-long-02 | 8 | olive green (darker) | B#1a3b26 … G#b0ad79 | none |
| gloves-01 | 8 | **burnt orange** | F#50231d … D#d07a1b | none |
| gloves-02 | 8 | neutral gray | H#181818 … G#ffffff | none |
| gloves-03 | 3 | near-black | A#131313 … C#1c1c1c | none (flat) |
| bracelet-01 | 11 | **gold/yellow** | H#161600 … C#eaea00 | bright yellow gem C#eaea00 |
| wristband-01 | 3 | slate blue-violet | A#323651 … C#485274 | none (flat) |

**Role mapping is consistent**: darkest 1–2 letters = the cylinder OUTLINE / cast-shadow
seam; mid letters = the tube body; lightest 1–2 = a highlight rim or rivet/knuckle plate;
a saturated letter (cyan / yellow) = the single decorative accent. The two priority gauntlets
(01,02) are PIXEL-IDENTICAL in shape and differ ONLY in the body ramp (gray vs dark-red) —
proof that the generator should treat shape and palette as fully orthogonal.

### 2. Shape & placement — the cylinder reads as separate from the torso

The tube is drawn with **explicit left AND right vertical edges** in the darkest letters so it
reads as its own cylinder even when fused against the torso. Cross-section (front view, one
arm) is consistently **8–11 px wide**: `[outline][shadow][body…body][highlight][outline]`.

- **Forearm cuff** top edge ≈ row 70–73, bottom (wrist) ≈ row 87–90. Segment seams run
  horizontally every ~3 rows (armguard-02 paints seam pairs: rows 73/74, 76/77, 79/80, 82/83,
  85/86 — repeated identical rows = a banded/segmented plate look).
- **Full sleeve** is one tube from shoulder (~row 64–67) to a flared/ribbed cuff at the wrist
  (~rows 84–98); the cuff uses the lightest letters (G/H/F) as ribbing.
- **Hand/wrist band** sits at rows ~78–87; it is a narrow band (~3 rows: e.g. bracelet rows
  79–81 front) PLUS a hand cap. The band is the wrist anchor; knuckle plates extend below it.

### 3. Internal pattern vocabulary

- **Cylinder outline**: darkest letter forms continuous left+right edges every row.
- **Vertical power strip** (gauntlets): a 1–2px column of the cyan accent (E/F) runs the
  length of the forearm — front view it sits just inside each arm's body (e.g. col ~63/65 left,
  ~81/83 right). It is the gauntlet's signature.
- **Wrist band accent**: a horizontal band of the accent/light letter at the wrist row
  (bracelet/​wristband ARE just this band + minimal hand).
- **Knuckle plates** (gloves): a cluster of light letters (D/E/G in gloves-01, D/E/F/G in
  gloves-02) at the back-of-hand rows ~81–87, distinct from the cuff. Gloves-01 paints
  `GGCGG`/`CCCCC` knuckle rows; gloves-02 paints `DEEEC`/`EGEEC` plates.
- **Segment seams**: doubled identical rows (the viewer shows the same letter row twice) =
  the artist's 2px-tall plate bands. Strong in armguard-01/02 and gloves.
- **Buckle/strap accent** (armguard-02): brown `CC…CCI`/`IIC` tabs poke out top corners
  (rows 69–72) and bottom (rows 84–90) — leather straps cinching the plate.

### 4. THE KEY THING — per-frame arm tracking (side view, dir 1 = Left)

In the side view the near arm swings forward (low frame index) → back. The part's content
bbox TRANSLATES with it; the artist redraws each frame at the arm's new column, NOT a fixed
sprite. Below, "near-arm cols" = the columns the drawn part actually occupies (from bbox /
first-and-last non-`·` letters of the wrist row). Frame 2 additionally shows the FAR arm
swinging fully forward — it appears as a second cluster at the far-left columns (often the
back-of-hand/cuff fragment near x53–62), so frame 2 prints content at BOTH ends.

| Part (Left/dir1) | Frame 0 (arm fwd-ish) near-arm cols | Frame 1 (mid/back) near-arm cols | Frame 2 (arm back, far arm fwd) cols |
|------------------|-------------------------------------|----------------------------------|---------------------------------------|
| neo-gauntlet-01/02 | x60–73 (wrist row ~89 cols 59–69) | x64–78 (shifted right ~+5) | near x65–80; **far-arm fragment x53–60** |
| armguard-01 | x61–73 | x66–82 (shifted right) | near x67–83; far-arm x55–60 |
| armguard-02 | x60–76 | x65–82 | near x66–84; far-arm x54–61 |
| sleeves-long-01 | x60–82 (long tube) | x64–84 | near x66–86; far-arm x52–60 |
| sleeves-long-02 | x60–82 | x64–84 | near x66–86; far-arm x52–60 |
| gloves-01 | hand x60–70 (rows 79–89) | hand x67–80 | near x73–81; far-hand x57–62 |
| gloves-02 | hand x60–70 | hand x66–80 | near x73–81; far-hand x55–62 |
| gloves-03 | hand x60–70 | hand x67–80 | near x73–80; far-hand x57–62 |
| bracelet-01 | band x62–74 (rows 84–88) | band x64–78 | near x71–80; far-band x53–62 |
| wristband-01 | band x60–72 (rows 81–87) | band x66–80 | near x73–80; far-band x57–62 |

**Net swing offset:** near arm moves right by roughly **+5 to +6 px from frame 0 → 1**, and
again **+5 to +7 px from 1 → 2** (so ~+11 px total fwd→back). The VERTICAL anchor also drops
slightly back-to-front (wrist row ~84 in frame 0 → ~87 in frame 2). The far arm reappears in
frame 2 ~10–13 px to the LEFT of where the near arm started. Generator rule: pick the near-arm
column per frame from this table, draw the cuff/band there; in frame 2 ALSO stamp a small
back-of-hand fragment at the far-arm column.

### 5. Per-direction

- **Front (dir 0)**: BOTH arms drawn, mirrored. Left arm ≈ cols 48–62, right ≈ 79–93, torso
  gap (`·`) cols ~63–78. Frame 0 = left arm forward/right arm back-ish; frame 1 = arms
  symmetric out to the sides (widest bbox, both arms fully shown x48–93); frame 2 = mirror of
  frame 0. The forearm tube and its power strip / knuckle plates are drawn on each arm.
- **Side (Left dir1 / Right dir2)**: ONE arm, big swing (section 4). Right (dir2) is the
  left view mirrored horizontally with the swing reversed; its near-arm cols live a few px
  RIGHT of the Left view (e.g. gauntlet right-view bbox x57–88 vs left x53–83).
- **Back (dir 3)**: like front, both arms at torso sides, but the wrist/cuff detail faces away
  — accents (power strip, knuckle plates) are muted or moved to the outer edge; armguard-02
  shows the strap buckles on the back. Bbox nearly matches the front per frame.

### 6. Left vs right symmetry

Front and Back views are internally L/R mirror-symmetric (the right-arm letter block is the
left block reflected across the torso gap). The Left(dir1) and Right(dir2) sheets are mirror
images of each other (same shapes, flipped horizontally, swing direction inverted). So the
generator only needs to author ONE side + ONE arm and reflect: build left-arm front, mirror
for right-arm front; build Left side, mirror for Right side. Accents reflect too (the cyan
strip and gold gem land on the mirrored column).

---

## PER-FILE NOTES (quoted rows)

### neo-gauntlet-01  (PRIORITY) — gray forearm gauntlet + cyan power strip
12 letters, neutral gray ramp G#303030→C#d5d5d5, accent E#00edff / F#66f4ff (cyan).
Forearm cuff rows ~70–90. Front frame 1 both arms, note the cyan strip and segment plates:
```
74 ACBBBCABDDHA ... AHDDBACBBBCA   ← C#d5d5d5 light rim, A/B body, D/H shadow
78 ACAFFFEFEAHA ... AHAEFEFFFACA   ← FFEFE = cyan power strip band across the plate
85 ACAEFFEFADHA ... AHDAFEFFEACA   ← second cyan band (segment seam)
```
Per-frame arm columns (Left/dir1 wrist row): f0 cols 59–69, f1 cols 64–78, f2 near 65–80 +
far-arm gray fragment cols 53–60 (`GIGGGG`/`GJIJKI` block — the OTHER arm swung forward).

### neo-gauntlet-02  (PRIORITY-adjacent) — dark-red gauntlet, SAME geometry
11 letters, dark RED ramp G#300000→C#d50000, SAME cyan accent E/F. Pixel layout is identical
to neo-gauntlet-01 (verified row-for-row); only the body ramp letters differ. This is the
clearest "shape ⟂ palette" pair: generator emits one shape, swaps the ramp hue, keeps cyan.

### armguard-02  (PRIORITY) — gray plate + brown leather straps, segmented
12 letters: gray D#181818…H#dedede PLUS brown strap family C#4a3d30 / L#514335 / J#665442 /
I#7c6751. Heavy 2px segment banding (doubled rows) and strap tabs at the corners:
```
70    AAAAJJJCC   ← top strap tab in brown J, left view
73 GGFHHFEEEAAC   ← H#dedede bright plate highlight + brown C edge
84 CCBDDDDDAAAA   ← bottom buckle, brown C tabs
```
Front view shows brown `CC…CCI`/`CIIC` strap ends poking from top (rows 69–72) and the plate
body in gray. Per-frame Left cols: f0 60–76, f1 65–82, f2 near 66–84 + far-arm 54–61.

### armguard-01 — blue steel plate, white highlights, gray rivets
12 letters incl. J#ffffff and H#dedede (specular hits) over blue A#104897/D#4e72bb/F/I and
B#14247c outline. Rivet pattern `JJ`/`IIII` down the forearm:
```
79 ADDFIIFJJA   ← JJ = white rivet/bolt highlight, II#8db6eb light blue
81 ACCDDDDKKB   ← banded segment
```
Forearm rows ~73–90. Left cols: f0 61–73, f1 66–82, f2 near 67–83 + far 55–60.

### sleeves-long-01 — full olive sleeve, ribbed cuff
10 letters, olive/khaki C#1a3b26→H#cac88e. ONE long tube shoulder→wrist, rows 66–98 front.
Lightest letters cluster at the wrist as cuff ribbing:
```
84 BBAAAEFFC ... CCHHHFDDDAABBB   ← H#cac88e ribbing at the cuff fold
87 BBBBBFEE  ... EE   GFFAAABCC   ← EE = dark ribbing notches
```
Both arms in front fully shaded as cylinders (left x48–62, right x79–93). Left side tube cols:
f0 60–82, f1 64–84, f2 near 66–86 + far 52–60.

### sleeves-long-02 — full olive sleeve, darker 8-tone variant
8 letters, same olive base B#1a3b26→G#b0ad79 but darker overall and adds mid E#546d5c.
Different SHAPE from -01 (bbox y 64–89 vs 66–98 — shorter flare, no light H highlight), so
these are two distinct sleeve designs, not a recolor. Same per-frame tracking as -01.

### gloves-01 — burnt-orange glove, knuckle plates + cuff
8 letters F#50231d→D#d07a1b. Hand at rows 79–90. Cuff band at the wrist (rows 79–81) then
knuckle plates below:
```
84 BBHAAAHHB ... BBAGGCGGAGGB   ← GG#a24206 knuckle plate caps
85   BAAABB  ... BBACCCCCGAAB   ← CCCCC = back-of-hand plate
```
Left hand cols: f0 60–70, f1 67–80, f2 near 73–81 + far-hand 57–62.

### gloves-02 — gray glove, white-highlit knuckles
8 letters H#181818→G#ffffff. Same glove archetype as -01, gray family, more pronounced
knuckle plate using D#bdbdbd/E#dedede/G#ffffff:
```
84 CCEEEDCCB ... AAFCCCFFECCB   ← EEE bright knuckle highlight
87 BBCDDFBB  ... BDDCEEGEECBB   ← G#ffffff specular on a knuckle
```
Hand rows 78–92. Left cols: f0 60–70, f1 66–80, f2 near 73–81 + far 55–62.

### gloves-03 — minimal near-black glove (= wristband geometry, flat)
Only 3 near-black letters A#131313/B#171717/C#1c1c1c. SHAPE matches wristband-01 almost
exactly (cuff band rows 81–84 + tiny hand), just flat black — a stealth/under-glove. Front:
```
81 AABBBAAA ... AABCC   ← BBB center band, plain
84 AAAAAA   ... BBBBAA  ← hand cap
```

### bracelet-01 — gold wrist bracelet with bright gem
11 letters, gold/yellow H#161600→C#eaea00, gem accent C#eaea00. PURE wrist band (rows 79–82
front) + nothing on the hand — sits right at the wrist:
```
79 AAAAAAAAA              ← A#595900 band outline (left arm)
80 ABBCCBBCA              ← CC#eaea00 = the bright gem/setting, centered
81  AAAAAAAA              ← band underside
```
Per-frame Left band cols: f0 62–74, f1 64–78, f2 near 71–80 + far-band 53–62. The gem (`CC`)
always lands at the band center — generator should center the accent on the band.

### wristband-01 — slate blue-violet flat band
3 letters A#323651/B#3d4463/C#485274, flat. Wrist band rows 79–82 (front) with a center
stripe:
```
79 AABBBAAA ... BBBBCCBAA   ← C#485274 center stripe of the band
82 ···AAAAAA ... AAAAAA···  ← band edges
```
Left band cols: f0 60–72, f1 66–80, f2 near 73–80 + far 57–62. Same band archetype as
bracelet-01/gloves-03 minus the gem — the canonical wrist-anchor shape.
