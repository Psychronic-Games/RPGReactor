# Headwear Helmets — Pattern Language Analysis

Scope: 12 metal helmets, 6 futuristic helmets, 3 horn pieces (21 files), all in
`styles/looseleaf/parts/headwear/`. Grid is 144×144; sheet = 4 dirs [Front, Left,
Right, Back] × 3 walk frames. Letters map to a `palette` of hex colors. `.`/space =
transparent. Drawn OVER the body; body silhouette shown as `·` in overlays.

All row/column numbers below are absolute grid coordinates (the viewer crops to bbox
but keeps the original numbering on its rulers).

---

## COMMON PATTERN LANGUAGE (rules shared across helmets)

### 1. Anatomy anchors (where the head is)
From the body overlay, the male head silhouette occupies roughly:
- **Head top** ≈ row 37–38 (first `·` row in Front).
- **Crown band** rows ≈ 38–52, **face/jaw** rows ≈ 53–68, head bottom ≈ row 68–70.
- **Head width** ≈ cols 66–78 (interior), full silhouette ≈ cols 64–80.
- Helmets are built to **enclose this silhouette and add 2–4 px of shell on every
  side**, so a typical metal helmet front spans cols ~57–85 (width ~29) and rows
  ~36–70. The shell sits ~1–3 px proud of the skull all around (you can see exactly
  one band of `·` showing through at the temples in most front views, e.g. helmet-04
  rows 40, 42–43).

### 2. Palette structure — two distinct families

**METAL family (all 12 metal helmets):** small grayscale ramp, 6–11 letters, evenly
spaced neutral grays from a near-black outline to a near-white highlight. Canonical
ramp (helmet-02/03/06 etc.):

```
B #393939 lum57  (outline / darkest shadow)
C/E #5a5a5a lum90 (shadow)
D/A #7b7b7b lum123 (mid-base)
A/C #9c9c9c lum156 (base — the dominant fill)
E/F #bdbdbd lum189 (highlight)
F/G #dedede lum222 (specular / catchlight)
```
Some add `#181818` (lum24, F or G or D) as a true-black drop-shadow at the very
bottom rim, and a few add `#ffffff` (helmet-05 'H', the rivet sparkle). Letter→role
is by LUMINANCE, not by letter name — letter assignment is arbitrary per file.

Role mapping for metal:
- **Outline** = darkest letter (lum 24–57), 2-px thick on the left/right edges
  (`BB...BB`), 1-px on top.
- **Shadow** = lum ~57–90, sits just inside the outline.
- **Base** = lum ~123–156, the large interior fill.
- **Highlight** = lum ~189, on the upper-left dome and ridge tops.
- **Catchlight/specular** = lum ~222–255, a thin vertical/horizontal sparkle line,
  often the helmet's centerline or a brow gem.

**FUTURISTIC family (6 futuristic helmets):** LARGE palettes (19–82 letters!)
because they include a smooth anti-aliased neutral ramp PLUS a saturated ACCENT
color for the visor/lights:
- futuristic-01: 30 letters; accent = greens (`#00ff00`, `#00f6a8`) + cyans
  (`#00f2ff`) + reds (`#ff0000`/`#be0000`) — multi-color tech lights.
- futuristic-02: 82 letters; accent = green-cyan gradient (`#00eeff`…`#10de7a`) +
  warm tan band (`#c58a58`/`#ffdbbb`).
- futuristic-03: 66 letters; accent = deep-RED ramp (almost the whole low end is
  `#xx0000`) + cyan visor (`#00edff`).
- futuristic-04: 24 letters; single accent `#00c7ff` (cyan visor), rest neutral.
- futuristic-05: 19 letters; accent `#00c7ff`, rest a near-black RED ramp
  (`#xx0000`).
- futuristic-06: 52 letters; accent `#ff7801` (orange), rest near-black neutrals.

So the futuristic recipe = **(neutral metal ramp) + (1–3 saturated accent hues used
only in the visor strip and small light pips)**. The accent is always the visually
brightest thing on the helmet even when its luminance is mid-range.

**HORNS family (3 horn pieces):** very DARK, low-contrast palette (13–17 letters,
almost all lum < 60, e.g. `#27292b`, `#383a3d`, top highlight only `#54575a`
lum86). These are matte black/charcoal horns. No light grays at all.

### 3. Silhouette shape rules
- **Dome top:** starts 1–2 px ABOVE the head silhouette (rows 36–38), as a narrow
  cap (`BBEEEEEEEBB`, ~9–11 px wide centered on the skull) that fans outward each row
  down to full width by row ~44–47.
- **Widest point** is the temple band, rows ~45–50, where the shell bulges to
  outline-to-outline ~29 px (Front) and wider in side views (~31–34).
- **Taper / jawline:** below row ~53 the shape narrows back in toward the chin, and
  the bottom rim closes at rows 66–70 with a `BBBBBBB` arc.
- **Open-face vs full-face:**
  - Metal helmets are mostly **open-face**: the lower-center (the actual face,
    rows ~57–65, cols ~64–78) is left TRANSPARENT (you see `·` body through it),
    framed by cheek guards on each side (helmet-04, -06, -07, -08, -09, -10, -12 all
    leave a face hole; -01, -02, -03, -05, -11 are closed domes/skullcaps).
  - Futuristic helmets are **full-face**: the visor (accent color) covers the whole
    face region; nothing transparent there. They also extend DOWN past the jaw into a
    neck/gorget (rows to 90–107 in futuristic-02/03) — far below the normal head.
- **Extension beyond silhouette:** the parts that sit OUTSIDE the body head (no `·`
  underneath) are: (a) the 1–2 px proud shell all around, (b) the crown cap rows
  36–38 above the head, (c) for horns, everything (see Horns section — they live at
  rows 20–46, entirely above/around the skull), (d) futuristic neck guards rows
  70–107.

### 4. Internal pattern conventions
- **Mirror symmetry (Front & Back):** every Front/Back row is left-right palindromic
  about the vertical centerline. Quote (helmet-04 Front row 53):
  `BBCEEDFFFAAAAAAAAAAAFFFDEECBB` — read inward from each edge the triples match:
  `B B | C E E D | F F F | A...A | F F F | D E E C | B B`.
- **Letter-triple banding:** the artist works in runs of 2–3 identical letters that
  step the ramp inward. A canonical brow/seam row (helmet-04 Front row 54):
  `BBCCCEDDDFFFFFFFFFFFDDDECCCBB` — `CCC` `DDD` `FFF…FFF` `DDD` `CCC`. This 3-wide
  stepping is the signature texture.
- **Horizontal seam rows:** a brighter or darker full-width band marks a structural
  seam, typically once near the brow (~row 53–56) and once at the bottom rim. In
  helmet-02 row 50–52 is the brow seam `BBCCCC…CCCCBB` then `BBAAAA…AAAABB`. These
  seams are 2 rows tall (because the sheet doubles many rows — see §6).
- **Brow ridge:** a darker V or bar across the forehead at rows ~52–56, e.g.
  helmet-05 rows 51–62 carry a faceted brow with `DD`/`FF`/`GG`/`HH` vertical facets.
- **Visor strip (futuristic only):** a single horizontal accent-color band across the
  eyes. futuristic-04 Front rows 53–62 are almost solid `A` (`#00c7ff`); futuristic-01
  uses `B`(`#00f2ff`) for the lower face rows 56–65 and green `L/S/V` for an upper
  eye band rows 44–47.
- **Rivets / pips:** small isolated bright or dark 2×2 dots. helmet-05 has `H`
  (white) rivets at rows 48–62 forming a studded crest; futuristic helmets pepper
  accent pips (`U`/`a` reds at the temples of futuristic-01 rows 56–59).
- **Vertical facet bands:** helmet-09/-11/-12 have a scaled/segmented look from
  repeating `AACC`/`CCBB` vertical columns (helmet-09 Left rows 55–64
  `BCCACCACCACCABB` repeated — chainmail/scale texture).

### 5. Per-direction differences
- **Front vs Back:** nearly identical silhouette and width; Back swaps the FACE for
  full shell coverage (no transparent face hole) and uses a flatter, more uniform
  shading (back of dome lit evenly — helmet-04 Back rows 54–61 are big `DDDD` fields
  vs Front's structured brow). Back is also mirror-symmetric.
- **Left vs Right:** the two are the SAME drawing mirrored horizontally (compare
  helmet-04 Left vs Right — Right is Left flipped, with column offset). Side views are
  NOT left-right symmetric internally; they show the helmet in profile: a big rounded
  shell with the cheek/ear guard on the front-facing side and a tapered occiput on the
  back side. Side views are typically 1–3 px wider than front/back (helmet-04 Left
  bbox cols 56–86 = width 31 vs Front width 29).
- Side views place the strongest highlight on the FRONT (face) edge and shadow toward
  the back.

### 6. Per-frame (walk) differences — IMPORTANT
The helmet **bobs with the head**. The shape is IDENTICAL across the 3 frames; only
its VERTICAL POSITION shifts by 1 px:
- **Frame 0** = neutral. **Frame 1** = head up ~1px (helmet shifts up; in helmet-04
  Front the crown cap appears one row higher, rows 36–37 fill in, and the bottom rim
  retreats from rows 69–70). **Frame 2** = same as frame 0 (down/neutral) — frames
  0 and 2 are byte-identical in every metal helmet checked (helmet-04 F0 == F2).
- Mechanically this is done by **duplicating rows**: each helmet stores most rows
  TWICE (note the doubled identical lines, e.g. helmet-04 rows 42–43, 45–46 are equal
  pairs). Frame 1 simply shifts which doubled row pair is "collapsed", moving the
  whole sprite up one pixel. Generator rule: **render once, then frame1 = sprite
  translated up 1px, frame2 = frame0.**

### 7. Bottom-rim drop shadow
Most metal helmets terminate with a 1-px true-black (`#181818`) outline at the very
bottom corners (helmet-01 `FF` at row 63 cols 55–56 & 85–86; helmet-08/-10/-12 `FF`
bookends at the rim rows). This reads as the helmet casting shadow on the neck.

---

## PER-FILE NOTES

### Reference exemplar — metal-helmet-04 (studied front/side/back)
7-letter gray ramp: G`#181818`(24, outline-dark) B`#393939`(57, outline) E`#5a5a5a`(90)
D`#7b7b7b`(123) C`#8b8b8b`(139) A`#9c9c9c`(156, base) F`#bdbdbd`(189, highlight).
- **Front:** open-face is NOT cut — this one is a closed faceted dome with a strong
  faceted brow. Crown cap row 38 `BBEEEEEEEBB` (cols 67–77). Fans to full width
  (cols 58–85) by row 47. Brow seam rows 53–58 step `CCC EDDD FFF…` then a dark
  `GGGG` facet band rows 60–62 (the `G`=#181818 black inset, a recessed visor slit):
  row 60 `BBCEEGGGGEEEEEEEEEEEGGGGDDCBB`. Bottom rim closes rows 66–70.
  - Extends above silhouette: rows 36–37 (crown). Proud shell at temples: row 42
    `·BEEDFFF…` the leading `·` is body showing past the shell on the left.
- **Left:** wider (cols 56–86). Profile dome; a dark `G` ear/visor block fills the
  front-lower quadrant rows 57–62 (`BGGGGGGGGGGGGCCC…`). Mirror of Right.
- **Right:** Left flipped; `G` block on the right (occiput) side rows 57–62.
- **Back:** same outline as Front, but face region replaced by uniform `DDDD…`
  shell rows 56–62; symmetric `EEDDD` chevrons at the nape rows 65–68.
- **Walk:** F0==F2; F1 shifts up 1px (crown reaches row 36, rim leaves rows 69–70).

### Reference exemplar — futuristic-helmet-01 (studied front/side/back)
30-letter palette = neutral ramp (`A`#000 outline … `C`#fff catchlight) + GREEN accent
(`L`#009a00, `S`#00ff00, `V`#006500, `Q`#c0ffc0), CYAN accent (`B`#00f2ff, `W`#8bf9ff,
`I`#00929a, `Z`#00f6a8), RED accent (`U`#ff0000, `a`#be0000, `b`#790000).
- **Front:** FULL-FACE. Top crown rows 37–43 neutral `GGGG`/`HHHH`. A GREEN eye-brow
  band rows 44–47 (`AASLLLLLLLLSAA`, `AAQSSVVVVSSQAA`). The whole lower face rows
  56–65 is a CYAN visor (`B`#00f2ff) — e.g. row 59 `…AABBBBBBBBBBBBBBBBBBBBBBAA…`.
  RED temple pips at rows 56–59 (`AAUNNA…` / `AAaNND…`, the `U`/`a` reds). Below the
  jaw it grows a neck/chin guard rows 66–73 tapering to `AAAA` at row 72–73 (extends
  well past the head silhouette).
- **Left/Right:** profile; cyan visor wraps the front, green pips and a small red
  detail (`b`/`U`) near the cheek (rows 56–59). Right = Left mirrored.
- **Back:** neutral dome with CYAN (`I`/`B`/`W`) vertical vent lines rows 44–63 and a
  green/teal nape detail; a long segmented neck guard rows 70–107.
- **Walk:** F0==F2, F1 up 1px (crown fills row 36).

### metal-helmet-01
7 grays (F`#181818` outline-black, C`#393939`, D`#5a5a5a`, A`#7b7b7b`, B`#9c9c9c`,
E`#bdbdbd`, G`#dedede`). Open-face skull-cap with cheek guards. Face hole rows 57–63
(transparent center cols 62–73). Brow gem highlight `EEEGGG` cluster rows 40–52 upper
left. Distinct asymmetric internal shading (the `B`/`E` light pools to upper-left).
FF black drop-shadow at rim corners row 63. Back is fully closed with a big radial
`DDDDDD…CCCC` nape fan rows 59–66.

### metal-helmet-02
6 grays (B`#393939`…F`#dedede`). SHALLOW closed cap — shortest of all (Front rows
36–55 only, no jaw/face). Pure dome: crown row 38, full width by row 44, flat brim
rows 50–55 (`BBAAAACCCC…CCCCAAAABB` / `BBBB…BBBB`). Classic palindrome banding. The
quintessential "simple bowl helm" — a good generator baseline.

### metal-helmet-03
6 grays. Tall ROUNDED full helm covering to row 69. Open at the very bottom only
(rim arc rows 66–69). Mostly uniform `A` base with `E` highlight ring rows 45–53 and
a `BCC…CCB` outline. Back rows 52–63 add concentric `DDDD` rings (domed occiput).

### metal-helmet-05
8 grays incl. H`#ffffff`(255) and D`#181818`(24). STUDDED / faceted war-helm. The
signature is a grid of white-pip rivets: rows 51–62 carry repeating
`DDFDDGDDHDDGDDFDD` facet columns (H=white catchlight centered, G/F stepping out).
Open-face cheek guards rows 57–67 with transparent face. Very busy — highest texture
density of the metal set. Back rows 51–62 keep the facet grid across the occiput.

### metal-helmet-06
6 grays. NEARLY identical geometry to helmet-04 (same crown cap, same brow seam rows
53–59) but the lower face is CUT OPEN (transparent rows 60–64, cols 62–72 in Front:
row 60 `BBCEE····EEEEEEEEEEE····DDCBB`). So helmet-06 = helmet-04's shell with an
open visor slit. Confirms 04 and 06 share a template; 06 just subtracts the visor.

### metal-helmet-07
6 grays but UNUSUALLY DARK ramp (D`#454545`…F`#bebebe`, no near-white). Open-face
with very wide cheek guards; transparent face rows 57–67 (cols ~62–76). Internal
look is "brushed" — long `BBBBB` shadow runs on the left dome (rows 41–62) vs `AAAA`
base on the right, giving a strong directional light. Back is closed, split
left-dark/right-light down the centerline (rows 50–64 `BBB…AAA`).

### metal-helmet-08
7 grays incl. F`#181818`. Open-face with a distinctive **brow visor bar**: row 55–57
a solid horizontal `EEEEEEEE`/`DDDDDDDD` band then `BBBBBBB` slot, and the face hole
rows 58–60 is a clean rectangle (cols 63–77). Two-tone dome: left half `CCC`
(lighter base) vs right half `AAA` split at the centerline col ~70 (`E` seam). FF
drop-shadow rim. Back fully closed, same left/right two-tone split full height.

### metal-helmet-09
6 grays. SCALE/SEGMENTED helm. Below the brow (rows 53–65) the cheeks become a
repeating scale texture: `BCCACCACCACCABB` columns (Left rows 55–64; Back rows 56–66
`CCACCACCACCA…` full width). Open face. The scale motif tiles in 3-px units
(`CCA`/`AAC` alternating) — a clear procedural pattern. Brow seam rows 50–53 is a
bright `EEEE…BBB` double band.

### metal-helmet-10
7 grays incl. F`#181818`. Close cousin of helmet-01 (same upper dome `EEBBB GGG`
gem cluster rows 40–55, same FF rim). Open-face cheek guards, transparent face rows
56–63. Back is FULLY closed with vertical `BBBB`(left)/`AAAA`(center)/`DDDD`(right)
panels rows 43–61 — a 3-panel segmented occiput.

### metal-helmet-11
11 grays (adds J`#6e6e6e`, H`#818181`, A`#8c8c8c`, K`#a5a5a5`, I`#dedede`) — the
richest gray ramp. Faceted GREAT-HELM, fully closed (no face hole). Strong vertical
facet seams: Front cols ~68–69 carry an `II`/`GG` bright centerline rib rows 41–63;
flanked by `CCC`(left)/`BBB`(right) two-tone faces split at center. A bold horizontal
`FFFFFF` black brow slot rows 54–57 (the eye slit). Back rows 40–61 are a tall
two-tone panel `CCCCCC AA BBBBBB` repeated every row (uniform vertical ribbing).

### metal-helmet-12
8 grays incl. F`#181818`, G`#8c8c8c`, H`#dedede`. Closed great-helm like -11 but with
a central vertical RIB: Front cols 69–70 hold a fixed `HH`/`EE`/`GG` bright stripe
rows 41–63 (`…CCEEAA…` centerline) splitting a `CCC` left face from an `AAA` right
face. Big black eye-slot `BBBBB…BBBBB` rows 56–63 (transparent slit cols 62–78).
Back rows 40–61 = uniform `ACCCCCCCCCCCCGGAAAAAAAAAAAD` ribbed panel every row.

### futuristic-helmet-02
82-letter palette: full smooth neutral ramp + GREEN→CYAN gradient accent
(`#00eeff`…`#10de7a`, letters `%3MGgw@!{`etc.) + warm TAN trim
(`#a9644d`,`#c58a58`,`#ecbf93`,`#ffdbbb`). Tall full helm with a large faceted
GREEN-CYAN crystal visor filling the face center rows 47–63 (the `GGGG`/`MMM`/`qqq`
clusters are the gem facets). Big neck/shoulder gorget rows 66–107 (extends massively
below the head). Tan accents trim the brow and jaw. Side views ~cols 43–98, very wide.

### futuristic-helmet-03
66-letter palette: dominated by a near-black RED ramp (`#xx0000`, letters
`9stnb6gTkYrmcyMQWLZjXGCKJPh E`) + CYAN visor (`#00edff`,`#3be9ef`, letters `7HNxe`)
+ tan trim. Same silhouette/template as futuristic-02 (identical bboxes and neck
guard) but recolored: the crystal facets rows 47–63 are CYAN (`HHH`/`NNN`) over a
DARK-RED shell. So 02 and 03 are one mesh, two color schemes (green vs red shell).

### futuristic-helmet-04
24-letter palette: clean neutral ramp (S`#141414`…Q`#b7b7b7`) + ONE accent
A`#00c7ff` (cyan). Sleek modern visor helm. Crown rows 33–52 neutral with a faceted
brow (`DDD NN PPP`, `LLL`, `IIIII` facet rows 44–51). The visor is a clean CYAN sheet
rows 53–66 (Front rows 58–62 `…GAAAAAAAA…AAAAGG…`) with two transparent eye-slit gaps
(rows 63–66 split `AAAA······AAAA`). Symmetric. The cleanest futuristic template —
good generator baseline for "neutral shell + single-color visor".

### futuristic-helmet-05
19-letter palette: near-black RED ramp (P`#140000`…O`#b70000`) + accent A`#00c7ff`.
EXACT geometric twin of futuristic-04 (identical bboxes, identical facet rows) but
the shell is dark RED instead of gray. Confirms 04/05 are one mesh, two schemes
(gray vs red). Visor cyan, same eye-slit cutouts rows 63–66.

### futuristic-helmet-06
52-letter palette: near-black neutral + RED-tinted darks + accent D`#ff7801`
(orange). Full-face helm, mostly very DARK (reads near-black). Orange accent is a thin
vertical centerline strip (`DDDD`) rows 37–66 (the visor seam) plus the brow. The
face center rows 58–66 has a transparent slot (`···`) flanked by orange/dark detail.
Side views taper to a pointed back. Darkest, most "stealth" of the futuristic set.

### Horns — hemet-horns-01 / -02 / -03
These are NOT helmets — they are a pair of curved HORNS that attach at the temples,
sitting almost entirely ABOVE and OUTSIDE the head silhouette (rows ~20–46, the body
overlay `·` only appears low-center rows 37–45 where the head crown peeks between
them). Intended to layer OVER a helmet or hair.
- **Palette:** very dark, low-contrast charcoal ramp, 13–17 letters, all lum < 60
  except one mid-gray top (`#54575a`/`#575757` lum86). Many near-pure-black letters
  (`#000`,`#050506`,`#070708`) used for the horn's hard outline and inner ridges.
- **Shape:** two horns curving up-and-outward from temples (cols ~49–56 left,
  ~84–91 right) to tips at row ~22–25. Each horn is a tapering cone drawn with a
  textured `H C G E B` ridge pattern down its length (e.g. Front row 35
  `ADCGEJDA …mirror… ADJEGCDA`). The center (cols ~64–78, rows 37–46) is TRANSPARENT
  — that is where the head/helmet shows through.
- **Symmetry:** Front & Back are mirror-symmetric pairs of horns. Left view shows
  only the LEFT horn (cols 55–69), Right view only the RIGHT horn (cols 74–89) —
  i.e. in profile you see a single horn. -01 has both-horn front/back; -02 and -03
  are the same horns shifted (02 leans the pair one way, 03 the other — likely a
  left-curving vs right-curving variant set).
- **No walk bob detected** in the data shown (single frame examined); horns are rigid
  decorative attachments. Generator should treat horns as an overlay layer keyed to
  temple anchor points (cols ~52 & ~86 at row ~37), drawn in a dark matte ramp,
  extending up to ~15 px above the head top.

---

## GENERATOR SPEC SUMMARY (actionable)

1. **Pick a family:** metal (6–8 gray ramp), futuristic (neutral ramp + 1–3 accent
   hues), or horns (dark charcoal ramp).
2. **Build the dome:** crown cap ~9–11px wide at row 37, fan to full width
   (~29px front) by row 46–47, centered on col ~71. 2px outline sides, 1px top.
3. **Choose closure:** closed dome | open-face (cut transparent rows 57–65 cols
   ~62–78, keep cheek guards) | full-face visor (futuristic; fill face with accent
   color, optionally cut 2 eye slits).
4. **Add brow seam** at rows ~53–56 (full-width stepped band) and optional rim
   drop-shadow (`#181818`) at the bottom corners rows ~63–70.
5. **Texture interior** with 2–3px letter-triple stepping, mirror-symmetric about
   col 71 (Front/Back). Optional motifs: scale tiles (`CCA` repeat), vertical center
   rib, rivet pips, faceted brow.
6. **Sides:** draw a profile (front-lit, back-shadowed), ~31px wide; Right = Left
   mirrored.
7. **Back:** same outline as Front, face replaced by uniform/ribbed shell.
8. **Frames:** frame0 = base, frame1 = whole sprite up 1px, frame2 = frame0.
9. **Accents (futuristic):** apply the saturated hue ONLY to the visor band and small
   light pips; keep the shell neutral.
