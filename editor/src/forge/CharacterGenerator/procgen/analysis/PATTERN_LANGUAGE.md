# Looseleaf Part Pattern Language — Synthesis

Derived by running the part viewer across **every** file in all 8 categories
(124 files). This is the spec the generator implements. Per-category detail
lives in the sibling `*.md` files.

## Universal rules (true in every category)

1. **Palette = one luminance RAMP of a single hue FAMILY (+ optional accent).**
   6 roles along the ramp, by luminance (letter assignment in source is arbitrary —
   always sort by hex luminance to recover roles):
   `outline(darkest) · shadow · base · lit · highlight · catchlight(brightest)`.
   Accents (cyan glow, gold buckle, gem) are a SEPARATE saturated hue outside the ramp,
   used only on a small motif.

2. **Different zones use different FAMILIES. The contrast between families is what makes
   pieces read as separate.** A steel breastplate + leather/gold belt + navy pants +
   gunmetal boots read as 4 pieces precisely because the families differ. One palette for
   the whole body = the "blob". → THE central fix: per-zone palettes.

3. **Outline everything.** Every piece has a 1px darkest-letter outline on every edge so it
   reads as its own object even when fused to a neighbour (critical for arm tubes vs torso
   in side view, and the two leg tubes).

4. **Front & Back are mirror-symmetric about the body centre column (x≈70–71).
   Left & Right are horizontal mirrors of each other.** Author one half / one side, reflect.

5. **Walk frames track the BODY rigidly — never reshape.** Rigid parts: frame0==frame2,
   frame1 raised ~1px. Limb parts (arms/legs): the part follows the limb to its per-frame
   column. Because the procgen paints OVER the body silhouette, this tracking is automatic.

6. **Side-view shading rule:** catchlight/highlight on the FRONT (leading) edge, shadow +
   outline on the BACK (trailing) edge.

## Per-zone shape + pattern specs

### HEAD (helmets/visors/crowns/hoods)
- Steel helmet: dome starts ~1–2px ABOVE head top (an EXTENSION), full width at the temple
  band (rows ~45–50), tapers to a closed rim ~row 68. Open-face variants leave a face hole
  (skin rows ~57–65) with cheek guards; futuristic variants cover the face with an accent
  VISOR strip across the eye-line (rows ~53–60).
- Texture: faceted vertical bands, a brow/seam band, bottom-rim dark drop-shadow, white-pip
  rivets. Crown/horn points are EXTENSIONS rising above the skull.
- Cloth (hood/bandana/turban): soft ramp, few seams; hoods drape onto the shoulders.

### TORSO (the most important zone) — the "quilt" formula
- Plate shape: rounded box, starts at the shoulder line (~row 67), bulges 1–2px past the
  deltoid, double-arc pec top, tapers to the waist, ends ~row 83.
- **Letter-triple per row, palindromic about cx:** `[outline][flank…][center…][flank…][outline]`.
  Canonical body row `D A A A A A F F F F F F A A A A A D` (flank=base, center=lit).
- **3-row seam beat (the quilted/plated look):** 2 normal rows then 1 SEAM row that swaps
  flank→highlight and center→catchlight (a raised horizontal lame catching light). Repeat.
  Canonical seam row `D C C C B B B B B B B B B B C C C D`.
- Sternum ridge: centre 1–2 columns held one notch brighter (front); spine column on back.
- Cloth (robe/coat/cloak): softer ramp, drapes straight down past the waist to rows ~100,
  vertical/diagonal fold columns instead of the rigid quilt, open-front lapel V on coats.

### SHOULDERS (pauldron EXTENSION geometry)
- Two caps, mirrored about cx, **outer edge = deltoid edge ±~14px**, with a transparent
  centre channel (caps never bridge). Front/back cap ≈ 22w × 16h, crown top ~row 62, skirt
  bottom ~row 78 (wraps the outer/front deltoid + bicep). Side view: only the near cap,
  drawn larger.
- Shading: rounded dome — light on top-outer, shadow under-inner. Neo signature = an accent
  rim tracing the whole cap silhouette. Horns/spikes project further out/up and need an
  `above`/`below` z-split when they must both rise above and be occluded by the body.

### ARMS / HANDS
- Forearm cuff (rows ~70–90) or full sleeve (shoulder→wrist). Drawn as a CYLINDER with
  explicit L+R outline edges (8–11px wide) so it reads separate from the torso. Gauntlet
  signature = a vertical accent (cyan) power strip down the forearm; gloves add knuckle
  plates; wristband/bracelet = just the wrist band.
- Per-frame: the part translates to the arm's swing column (handled by painting over body
  arm pixels — already detected via skin-letter + short run-length).

### WAIST (belt — contrast is the whole point)
- Thin strap rows ~79–86 (waistguards hang tassets to ~row 95). Width x60–81.
- **Buckle** centred at cx: the brightest cluster, in a CONTRASTING family (gold/bronze/teal
  glow). Simple `[buckleFrame][buckleCore][buckleCore][buckleFrame]` + a 2px tongue 1–2 rows
  below the strap. Stud/segment repeat ~6px along the strap.
- Thickness sandwich: top-light row / mid core / bottom-dark outline (≥3 rows).

### LEGS / BOOTS (per-frame stride)
- Two leg-tubes, each 1px-outlined, with a dark inner-seam between them that MOVES with the
  stride. f0=left fwd (mass slides left), f1=neutral symmetric, f2=right fwd. Lit vertical
  highlight stripe down the front of each tube. Hem/cuff rows ~102–104 with a transparent
  ankle notch. Pants pick a COOL DARK family (navy/indigo/near-black), deliberately darker
  than the metal above.
- Boots: rows ~94–107, cuff band at top, flat darkest sole line at the very bottom. Side
  view: the toe points in the stride (forward) direction.

## What this changes in the generator
1. **Per-zone palette families** (was: one outfit palette). A palette BUILDER assembles the
   combined letter→hex table from each zone's family + accents and hands each painter a
   role→letter map for ITS family.
2. **Role-based painters** pulling `outline/shadow/base/lit/highlight/catchlight/accent` from
   the zone palette, implementing the triple+seam quilt, cylinder arms, contrasting belt
   buckle, navy striding legs, etc.
3. **Extensions** (pauldron, helmet crown) carry their own family too.
