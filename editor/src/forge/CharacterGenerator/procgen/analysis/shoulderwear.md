# Shoulderwear Part Pattern-Language Analysis (looseleaf, male)

Source: `styles/looseleaf/parts/shoulderwear/shoulderwear-looseleaf-*.js`
Tool: `node procgen/view_part.js <file> --all --overlay`
All sheets are 144×144, 4 dirs [Front, Left, Right, Back] × 3 walk-frames. Body center column ≈ x70–71.

This category is the canonical reference for **EXTENSION** geometry: shoulder pieces deliberately jut **past** the body silhouette (the overlay `·` shows body pixels; the part's letters spill outside them). The whole point of a pauldron generator is "how far past the deltoid, and in what shape."

## Anatomy reference (male body, dir 0 frame 0)

Grounds every row/column below. Body bbox x:48–93, y:36–107.

- **Shoulder line (deltoid tops)**: rows **52–57**.
- **Deltoid outer edges**: at the shoulder line the body caps are `BGGC … CGGB`, **left deltoid edge x≈56, right deltoid edge x≈85**. Center seam x70–71.
- The shoulder line is roughly **mirror-symmetric about x70.5**: left deltoid 56, right deltoid 85 (56+85 = 141 = 2×70.5).
- Side views (dir 1/2): the single visible (near) shoulder mass is centered around x68–72.

The 8 files split into THREE archetypes:
1. **Caps that sit ON the shoulder** (neo-01, neo-02, pads-01, pads-02) — the true pauldron reference. Bbox roughly **y:62–78** (i.e. starting ~8–10 rows *below* the deltoid top, draping down the upper arm, with the rounded crown reaching back up to the shoulder line). These extend OUTWARD in x past the deltoid.
2. **Spikes that project UP/OUTWARD above the shoulder** (spikes-01, spikes-02 — byte-identical files). Bbox **y:81–95**, sitting LOW (over the upper arm/bicep) and throwing diagonal blade-spikes outward and downward.
3. **Horns as a 2-layer z-sandwich** (horns-01-above, horns-01-below) — a curved horn that rises ABOVE the shoulder line (up to y:46–51, well above the deltoid) and is drawn in two passes so the body occludes its middle.

---

# COMMON PATTERN LANGUAGE

These are the shared rules every shoulderwear part obeys. **neo-shoulders-01 and -02 are the canonical pauldron statement of the grammar** (the spec below is anchored on them; pads-01/02 are the same grammar with a flatter, layered-lame crown).

### 0. The EXTENSION rectangle (the one number the generator needs)

Measured from the overlay, a single pauldron CAP occupies, per direction:

| Dir | Left cap bbox (x / y) | Right cap bbox (x / y) | Extension past deltoid |
|-----|------------------------|-------------------------|------------------------|
| **Front (0)** | x **42–63**, y 62–77 | x **76–97**, y 62–77 | reaches out to x≈42 (left) / x≈97 (right) → **~14 px past** the deltoid edge (56→42, 85→97) |
| **Left side (1)** | — (far cap hidden) | near cap x **55–84**, y 60–80 | the near cap balloons to ~30 px wide, center ~x69 |
| **Right side (2)** | near cap x **57–86**, y 61–81 | — (far cap hidden) | mirror of Left |
| **Back (3)** | x 44–63 | x 76–96 | same outward reach as Front, drawn from behind |

**Canonical EXTENSION offsets for the generator (front/back, per cap):**
- **Outward (x)**: cap outer edge = deltoid edge **±14 px** (left cap min ≈ deltoid−14, right cap max ≈ deltoid+14). Cap inner edge stops a few px shy of the deltoid (a transparent gap of ~10–14 px down the centerline between the two caps — neo-01 front rows 65–73 show a wide `·····` channel at x66–86, never bridged).
- **Vertical**: cap **crown top ≈ row 62–64** (≈ 8–10 px BELOW the deltoid top at 52–57 — the looseleaf pauldron does NOT cap the very top of the shoulder; it wraps the outer/front face of the deltoid and upper arm). Cap **bottom ≈ row 75–78** (drapes ~20 px below the deltoid top, onto the bicep).
- Net cap footprint front/back ≈ **22 px wide × 16 px tall** per side.
- The taller variants (pads-02) push the crown to row 63 and the skirt to row 78; spikes push their LOW mass to rows 81–95.

### 1. Palette = one dark→light luminance RAMP + (optional) bright accent rim

Every file is built on ONE monochrome ramp sorted by luminance, exactly as in torso. Two ramp families recur:

- **Steel/grey ramp** (neo-01, pads-01, spikes-01/02, horns): the shared greyscale, e.g. spikes use
  `#292929 #383838 #4d4d4d #555555 #5e5e5e #656565 #6f6f6f #797979 #848484 #b3b3b3`.
- **Bronze/brown ramp** (neo-02, pads-02): a warm single-hue ramp,
  neo-02 = `#492e00 #6d4500 #965f00 #b67300` (only 4 stops — the leanest part), pads-02 = a 15-stop dark-bronze ramp `#120b00 … #a26200`.

Role assignment along the ramp (same as torso):
- **darkest** = outline + deep seam/recess shadow,
- **2nd** = form-shadow side / underside of the cap,
- **mid** = base local color,
- **upper-mid / light** = lit crown,
- **lightest** = catchlight + rim.

**Accent rim** — the defining flourish of the "Neo" pauldrons:
- neo-01 carries a **cyan accent family** layered over the steel: `#266a76 #388fa0 #55b4c5 #6ee8ff (lum198)` PLUS a **green family** `#00a002 #41a04d #00ff22 #7bff8c`. These are the bright tech-rim colors. The `A`=`#6ee8ff` (lum 198, the brightest non-white) is used as the **continuous 1-px OUTLINE/rim** that traces the entire cap silhouette (look at neo-01 front: every cap edge is `A`), giving the "neon-trimmed pauldron" read. `C`=`#55b4c5` is the inner rim/bevel.
- spikes-01/02 carry a single green accent `L`=`#329d00` used ONLY as a thin lit edge on the spike's leading face.
- The horns are pure grey, no accent.

### 2. Cap SHAPE: rounded dome with a layered/beveled crown, NOT a flat plate

- **Outline**: a closed 1-px ring (neo: cyan `A`; others: darkest grey) around a **rounded-triangular dome** — wider at the bottom (the deltoid wrap) tapering toward a crown.
- **neo-01 internal pattern** = concentric bevel: outer cyan rim `A` → light steel band (`J/B`) → a **catchlight of green** `E/F` (`#7bff8c`/`#00ff22`) on the upper-outer face → mid grey `I/H` → a `D` (lum206) **specular streak** running diagonally → darker `G/C/Q` shadow pooling on the lower-inner underside. So: **light on top-outer, shadow under-inner** (classic spherical-cap shading), with the bright accent acting as the catchlight band rather than pure white.
- **neo-02 / pads-02 internal pattern** = same dome but rendered as **stacked lames/scales**: short horizontal `C`(lightest bronze) runs separated by `A/D`(dark) seam lines, reading as 2–4 overlapping plates. Look at neo-02 front rows 66–71: each row is a band `…BBCCCBB…` then a darker seam — a layered-lame pauldron rather than one smooth dome.
- **pads-01** = a **two-tier riveted plate**: top tier rows 66–68 (`BBDDDB` cores), bottom tier rows 70–74 (`EEEEE` lit band), `J`(lum24) rivet/bolt dots at the corners (e.g. front `JHHE…HHJ`), `K/M`(blue `#8db6eb`/`#a6d2f3`) catchlight studs in the crown center. So the pad reads as a bolted blue-steel rectangle with rounded corners, NOT a smooth dome.

### 3. Left vs right cap symmetry

**Yes — the two caps are mirror images about x70/71 on Front and Back.** Read neo-01 front frame 0: the left cap (x42–63) and right cap (x76–97) are reflections, the same letter sequence reversed. The pattern reverses too (rim, catchlight, shadow all flip). The mirror is near-exact but **hand-touched, not pixel-perfect** — the right cap is occasionally 1 px wider or carries one extra rim pixel (artist drew each rather than transform-mirroring). neo-02/pads-01/pads-02 all obey the same mirror.

### 4. Per-direction behavior

- **Front (0)**: BOTH caps visible, mirrored, with the wide transparent center channel (x66–86) where the chest shows through. Crown rows 62–64, skirt 75–78.
- **Left (1) / Right (2)**: only the NEAR cap is drawn, and it is **larger / fuller** (≈30 px wide vs 22 front) because we see its full outer face edge-on. The far cap is omitted (or, for the bulkiest like neo-01 frame 2, a thin sliver of the far cap peeks at the far edge). Right is the mirror of Left.
- **Back (3)**: BOTH caps again, mirrored, same outward reach as front but the shading flips (the catchlight that was on the front-outer face now reads as the back-outer face). Back bbox sits 1–2 rows higher than front (e.g. neo-01 front y62–77 vs back y60–75) because the figure's back shoulder line is drawn slightly higher.

### 5. The 2-layer z-order (horns-01 "above" / "below")

The horn is ONE physical object split across TWO part files so the body silhouette can occlude its midsection (you cannot do per-pixel z within a single part — the engine draws a whole part either over or under the body):

- **`-below`** = the portion of the horn that passes **BEHIND** the body. It is drawn UNDER the body layer. Its content is the **lower/inner** root of the horn and the segment that tucks behind the shoulder/neck. Note: `-below` has **Front and side content but its Back is empty**, and `-above` has its **Front empty** — they are complementary masks of the same horn across directions.
- **`-above`** = the portion drawn **OVER** the body — the horn tip and outer curve that should occlude the shoulder.
- Together they render a long curved horn rising from the deltoid (root ~row 70) UP and outward to a tip at **row 46–51** (front) — i.e. the tip reaches ~6–11 px ABOVE the deltoid top, the only piece in this set that goes above the shoulder line. The two horns mirror about x70/71 (left horn curls left, right horn curls right). Internal pattern is a gnarled dark-grey ridged horn: alternating `B/H/D`(light ridges) and `I/J/K/M`(near-black grooves) giving a twisted-bone texture; `D`(lum122) is the top-lit ridge highlight.
- **Generator implication**: any part that must both rise above AND be occluded by the body needs the same split — emit an `-above` file (pixels over the body) and a `-below` file (pixels behind it), each carrying only the directions where that layer is non-empty.

### 6. Per-frame (walk) behavior

The caps **bob with the shoulders as a near-rigid translation**, not a redraw:
- **Front/Back**: across frames 0→1→2 the whole cap shifts up/down by ~1 row and the silhouette swells slightly on the "forward" frame. neo-01 front: frame 0 crown at row 64, frame 1 the caps lift and fatten (crown row 63, bbox widens to x42–97 full), frame 2 the left cap drops and the right rises (counter-bob, simulating the alternating arm swing). It is the SAME letter art translated, with minor edge cleanup — not a new pose.
- **Side**: frame-to-frame the near cap slides forward/back ~3–5 px with the arm swing (Left frame 0 x55–84 → frame 2 the cap shifts and the far arm's cap edge appears at far left). Spikes show the clearest rigid translation: the blade cluster simply re-anchors to the new arm x each frame.
- Vertical bob amplitude ≈ **±1 px**, horizontal arm-swing slide ≈ **±3–5 px** on side views. The generator should drive frames by **rigid (dx,dy) offset of the cap stamp keyed to the body's shoulder position per frame**, plus the mirror flip between caps — no per-frame reshaping needed.

---

# Per-file notes

## neo-shoulders-01  (REFERENCE pauldron — neon-trimmed dome)
- **Palette**: 20 letters. Steel ramp `T/S/O/R/I/G/P/B/Q/J/D/H` (67→231) + **cyan family** `N/K/C/A` (`#266a76`→`#6ee8ff`) + **green family** `L/M/F/E` (`#00a002`→`#7bff8c`). `A`(cyan, lum198) = continuous outline rim; `H/D`(lum231/206) = steel catchlight; `E/F`(green) = accent catchlight band.
- **Front shape**: two mirrored domes. Left cap x **42–63**, right x **76–97**, both y **62–77**. Outline traced entirely in cyan `A`. Quote (frame 0, left cap):
  - `64  AAAAAAA` (crown, x46–52)
  - `66  AAJJFEJBBBFFEIA` (rim→steel→green catchlight)
  - `70  JFEBIHHHHHDDDDCC` (mid + `D` specular streak)
  - `74  AJBBIAHDDGCCC` (skirt fading to `C` cyan inner-rim, underside shadow)
- Wide transparent center channel x66–86 (chest shows). Caps reach **14 px past** deltoid (56→42, 85→97).
- **Side (dir 1)**: single fuller cap x55–84, crown row 62, skirt row 80 (drapes lower than front).
- **Symmetry**: left/right mirror about x70.5, hand-touched.
- **Frames**: rigid bob; frame 1 lifts+fattens both caps, frame 2 counter-bobs (left down/right up).

## neo-shoulders-02  (layered-lame bronze pauldron — leanest palette)
- **Palette**: only **4 letters** `D/A/B/C` = bronze ramp `#492e00 #6d4500 #965f00 #b67300`. `D`=outline/seam, `A`=base, `B`=lit, `C`=catchlight. No accent.
- **Front shape**: two mirrored caps, x **49–67** and **73–91**, y 62–76. Built as **stacked lames**: each row a `…BBCBB…` lit band over an `A`/`D` seam. Quote (frame 0):
  - `63  DDDDDDD … DAAAAAAAD` (top lame, dark outline `D` capping a bronze plate)
  - `68  DAAAAAABBBBBBCCCBCBCCCCCCCBBBBBB…` (middle lame, `C` catchlight pooled center)
  - `72  ABBCCB··BBBBBBBB···BBB····ABBBBB` (lower lame breaking up, transparent gaps = scallop edge)
- The caps nearly meet at center (gap only ~x67–72) — fuller coverage than neo-01.
- **Symmetry**: mirror about x70.5.

## shoulder-pads-01  (bolted blue-steel rounded plate)
- **Palette**: 13 letters. Steel `J/C/F/G/H/L/E` + **blue family** `I/A/B/D/K/M` (`#14247c`→`#a6d2f3`). `J`(lum24)=rivets, `E`(lum222)=catchlight band, `K/M`(blue) = stud highlights.
- **Front shape**: two mirrored pads, left x **49–70**, right x **72–92**, y 64–75 (shorter/flatter than neo). Two-tier construction:
  - rows 66–68 top tier `AAABBDDDBAAG` (blue cores),
  - rows 69–71 `HAABBBBBBBAAHCC` (lit blue band),
  - rows 72–74 `JJJEEEEEFCC` (white-steel catchlight skirt),
  - `J` rivet dots at outer corners.
- Reach: out to x≈49/92 → **~7 px past** deltoid (less extension than neo's 14).
- **Side/Back**: same plate; back rows 63–72, shows the bolted backplate.

## shoulder-pads-02  (heavy bronze scale/lame pad — busiest)
- **Palette**: 15 letters, ALL bronze (`#120b00`→`#a26200`), a deep dark-bronze ramp. Densely textured.
- **Front shape**: two big caps x **47–67** and **73–93**, y 63–78 — the **tallest** front cap (skirt to row 78). Crown studs `AAAKAA` (rows 63), then dense lame rows of mixed `B/C/E/G/H` scales with `A/D` seams. Quote (frame 0):
  - `63  AAAKAA … AAKAAA` (twin stud crowns)
  - `71  ABBBBBGCCCBBIGGEBBBDHHFAAA·AHHCCCHHJBIBBHHHHAA` (full-width scale band)
  - `75  AAAAAAAAA··AAAAAAAFEBECCCEEEEFFECCCCEEAAMA` (dark skirt outline)
- Reads as a thick studded leather-and-bronze scale pauldron. Mirror about x70.5.

## shoulder-spikes-01  (steel blade-spikes, LOW mount)
- **Palette**: 16 letters, steel ramp + single green `L`=`#329d00` (lit spike edge). spikes-02 is a **byte-identical duplicate** of this file.
- **Shape**: NOT a dome — a cluster of **angular blade-spikes** mounted LOW over the upper arm. Bbox **y:81–95** (sits ~24 px below deltoid top). Each spike is a long diamond: dark core `I/M`, `B/A` body, `E`(lum179) bright leading edge, `L` green tip-glow. Quote (front frame 0, right cluster):
  - `85  LDEBCCCCCFG`
  - `87  DEAHHBBBFG`
  - `89  DEAHBIIAAFFG` (stacked spike blades fanning out)
- **Front/Back frame 0**: spikes only on the figure's-LEFT/forward arm; frame 1 puts a full mirrored cluster on BOTH arms (the walk swings both forward); frame 2 shifts to the other arm. Clear **rigid translation per frame keyed to arm x**.
- Extension: spikes throw out to x45 and x95 → far the widest x-extent of any file (~11 px past deltoid AND projecting down the arm).

## shoulder-spikes-02
- **Identical** to shoulder-spikes-01 (same palette, same pixels in all 12 frames). Treat as one design; the generator only needs the one spike grammar.

## shoulder-horns-01-above  (over-body horn layer)
- **Palette**: 13-letter near-black grey ramp (`#090908`→`#7b7b72`), twisted-bone texture (alternating light ridges `D/B/H` and black grooves `I/J/K/M`).
- **Front: EMPTY** (the over-body part of the horn happens to be hidden from the front). Content in **Left/Right/Back**.
- **Right (dir 2)**: a curved horn from root ~row 58 (x59) rising to a tip at **row 51** (x57) — tip ~6 px above deltoid — then the body of the horn sweeping down-right to row 74. The `-above` layer is the part that should occlude the shoulder.
- **Back**: BOTH horns, mirrored about x70.5, tips at rows 46–48.

## shoulder-horns-01-below  (behind-body horn layer)
- Same palette/texture as `-above`.
- **Back: EMPTY**; content in **Front/Left/Right** — the complementary mask.
- **Front (dir 0)**: BOTH horns, mirrored, root row ~70 rising to tips at **row 53–55**, x reaching out to **x41 and x100** (the single widest x-extent in the set — the horn tips flare well past the body). This is the portion drawn UNDER the body so the torso occludes the horn's inner root.
- Confirms the **2-file z-sandwich**: `-above` carries the directions/pixels that go over the body, `-below` carries those that go behind it; their empties are complementary (above:Front empty, below:Back empty).
