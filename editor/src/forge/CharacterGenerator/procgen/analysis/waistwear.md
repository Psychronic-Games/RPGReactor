# Waistwear (looseleaf) — Belt & Waistguard Pattern Language

Source: `styles/looseleaf/parts/waistwear/`
Files analyzed (all 7): `belt-01`, `belt-02`, `neo-belt-01`, `neo-belt-02`, `waistguard-01`, `waistguard-02`, `waistguard-03`.

All sheets are 144×144, 4 dirs [Front, Left, Right, Back] × 3 walk-frames. Parts draw OVER a body; the waist center is x70–71.

---

## COMMON PATTERN LANGUAGE

### 1. Vertical placement (the band)
There are two sub-families with a shared anchor row:

- **Plain belts** (`belt-01`, `belt-02`, `neo-belt-01`, `neo-belt-02`): a thin strap **3–8 rows tall**, top edge at **y79–82**, the strap body at **y81–86**, and a small buckle tab that drops 1–3 rows lower (down to **y86–90**). They occupy the waist only.
- **Waistguards** (`waistguard-01/02/03`): the same belt band on top (**y79–84**) PLUS a hanging **tasset/skirt plate** below that extends to **y93–97** — i.e. ~14–17 rows total, roughly doubling the height of a plain belt. The hang is the defining difference.

Anchor rule: the belt's **top edge sits at y79–82 and bobs ±1 row per walk frame** (see §6). Center x ≈ 70–71.

### 2. Width vs waist
The band spans the full visible waist on Front/Back: roughly **x60–81** (≈ 18–22 columns wide), symmetric about x70. Side views (Left/Right) are narrower — the strap wraps around the hip and only ~10–14 columns are visible, with the buckle gone or only partially shown (see §4).

### 3. Palette structure — the load-bearing signature
Two palette idioms, distinguished by whether they carry a metallic ACCENT:

**(a) Leather strap + gold buckle** (`belt-01`, `belt-02`, plus the waistguards):
A 5-letter ramp split into TWO families:
- **Brown leather ramp** (the strap): dark→light `#502814` (very dark brown) → `#80472b` (mid brown) → `#966432` (tan/bronze-gold highlight).
- **Grey/steel ramp** (the buckle): `#9c9c9c` (mid grey) → `#bdbdbd` (light grey/silver). In belt-01/02 the buckle is the **C/E grey pair** — i.e. these belts use a **SILVER buckle**, not gold. `#966432` (letter D in belt-01, "D" tan) is the **bronze/gold leather highlight** used as the lit top edge and the recessed core, NOT the buckle.
- Role mapping (belt-01): `A`=dark-brown outline/shadow, `B`=mid-brown strap body, `D`=`#966432` bronze highlight/core, `C`=`#9c9c9c` buckle mid, `E`=`#bdbdbd` buckle highlight.
- Waistguards add steel-plate greys: `#393939 #5a5a5a #7b7b7b #9c9c9c #bdbdbd #dedede (#ffffff)` plus the brown ramp `#502814 #80472b #966432`. So a waistguard palette is **brown belt ramp + 5–7-step steel ramp** (waistguard-02 even reaches pure white `#ffffff` as the plate hot-spec; waistguard-03 drops brown entirely and is **all-steel**, 6 greys `#393939→#bdbdbd`).

**(b) Neon "neo" belts** (`neo-belt-01`, `neo-belt-02`): the leather/steel scheme is recolored into a saturated **mono-hue glow ramp**, 9 letters:
- neo-belt-01 = **acid green**: `#1b4500 #595900 #368700 #3b9500 #9d9d00 #4fc800 #95ff27 #eaea00 #aaff52` — a green ramp where the buckle core uses the brightest `#95ff27 / #aaff52`.
- neo-belt-02 = **cyan/teal**: `#484848 #515151 #666666 #777777 #919191 (greys) + #007e95 #00a3bf #00f2ff #64e8ff (teal)` — a **grey strap with a teal glowing buckle** (`#00f2ff` is the brightest, used as the buckle hot-core `I`).
- Takeaway: neo belts keep the SAME geometry as leather belts but swap the leather ramp for a single-hue ramp and the buckle metal for the ramp's brightest value (the "power core" glow).

**Generator rule for palette:** emit a **3-step strap ramp** (dark / mid / light-highlight) + a **2-to-3-step buckle ramp** in a CONTRASTING family. Contrast is mandatory — leather=brown strap vs grey/silver buckle; neo=grey/dark-hue strap vs bright-hue glow buckle. The contrast (color family + the buckle block) is what reads the belt as a separate piece from the pants.

### 4. The buckle — the #1 recognizable signature
**Front view, centered on x70–71.** The buckle is a small **bright rectangular block** sitting in the dead center of the strap, framed by the brightest pair of the buckle ramp:

- belt-01/02 buckle = a **2-wide highlight core `EE` flanked by `C`**, i.e. the 4-char token **`CEEC`** at x69–72. It appears on BOTH the strap rows (y81–84) AND as a **dangling tongue tab** 1–2 rows BELOW the strap (the `CEEC` repeats at y85–86 / y86–87). Real rows from belt-01 frame 0:
  - `  AABBBAAACEECAAABBB` (y81 — strap with centered buckle)
  - `         CEEC      ` (y85–86 — the buckle tongue hanging below)
- neo-belt-01 buckle = a **bright green diamond/lozenge**: `GG`→`GEEG`→`GEFFEG`→`DIHHID`→`DIID`→`DD`, a 6-wide tapering gem centered on x70 (rows y83–88), widest in the middle and pointing down. This is the "gem buckle" variant.
- neo-belt-02 buckle = a **teal vertical lozenge** `FF`/`FGGF`/`FGHHGF`/`FGHIGF` over rows y82–87 — same centered gem idea, cyan core `I`=`#00f2ff`.
- waistguard-01/02 buckle = a **steel plate medallion** in the center, e.g. waistguard-01 `EFFFFFFDD` / `EFFHEEEA` (a flat light-grey rounded plate, rows y85–90), waistguard-02 has a **bright `JJ`/`IJJI` white-cored plate**: `DEEIJJIEED` (y85). The medallion replaces the simple buckle as the centerpiece.

**Buckle geometry summary for the generator:**
- Width: **2 px hot core, 4 px with frame (`CEEC`)** for simple belts; **4–6 px tapering gem** for neo/medallion belts.
- It is the **brightest cluster in the whole part** and always **horizontally centered at x70–71**.
- Simple belts ALSO drop a **2-px buckle-colored tongue 1–2 rows below the strap** — a strong recognizability cue.

### 5. Stud / rivet repeats along the strap
The strap to either side of the buckle is broken into **repeating vertical leather segments** that read as stud/stitch spacing:
- belt-01 strap row: `AABBBAAACEECAAABBB` — pattern is **`AA` (gap) `BBB` (segment) `AAA` (gap)** mirrored around the buckle. So segments are **~3 px of mid-brown `B` separated by ~3 px of dark `A`** — a **~6 px repeat** of light-segment/dark-gap, which is the rivet/loop cadence.
- belt-02 same: `BBAAABBBCEECBBBAAA` — `AAA`/`BBB` 3-px alternation.
- The dark `A` columns act as both the recessed shadow groove AND the stud spacers; the mid-brown `B` blocks are the raised leather between studs.
- neo belts replace the studs with smooth ramp shading (`AAAAAAA` flat top), relying on the central gem rather than discrete studs.

**Generator rule:** along the strap, alternate **3-px raised segment (mid value) / ~2–3-px recessed groove (dark value)**, mirrored outward from the centered buckle, repeat ~every 5–6 px.

### 6. Top-highlight + bottom-recess (thickness)
Every belt gives the strap thickness with a **2–3 row vertical sandwich**:
- **Row 1 (top edge)**: a lighter/lit row — in belts the tan `D`=`#966432` highlight (`DCC`/`BDCC`), in waistguards `F`/`H` light-steel, in neo belts the second-brightest ramp value.
- **Rows 2–3 (core)**: mid value (`B` / mid-grey / mid-hue), often holding the recessed `DDD`/`AAAA` center band.
- **Bottom edge**: returns to the dark outline `A`/`B`. e.g. belt-01 y84 `AAABCCBDDDCCBAAA` — the `DDD` is the recessed center, capped by dark below.
The strap is therefore **never a flat single color**: top-light / mid / bottom-dark, 3 rows minimum.

### 7. Per-direction behavior
- **Front (dir 0):** buckle centered at x70–71, full symmetric strap, studs mirrored, buckle tongue hangs below. THE hero pose.
- **Left / Right (dir 1/2):** strap **wraps around the hip** — only ~10–14 cols visible, asymmetric (one end at the front hip, trailing off at the back). The centered buckle is **gone or only partially shown**; instead the buckle/medallion slides to the **forward hip edge** (e.g. neo-belt-01 Left shows the gem `DEEEEED`/`DEFFFED` pushed to the left x61–66 = the front-facing hip). Right is the mirror of Left. Waistguards show the **side tasset plate edge-on** as a tall vertical `CC...`/`AA...` slab.
- **Back (dir 3):** **no buckle** — a plain or slightly-plated strap. Belts show a long uninterrupted band with a faint center plate (belt-01 `DDDDD` core at y82–84). Waistguards show a **rear plate** mirroring the front skirt but flatter (waistguard-03 back is nearly identical to front minus the front medallion detail).

### 8. Per-frame (walk bob)
- The whole band **bobs vertically ±1 row** between frames and **shifts horizontally ±1–3 columns** to follow the hips. Frame 0 and frame 2 are roughly mirror-shifted (hip forward left vs right); frame 1 is the centered/level pass.
  - belt-01 Front f0 top at y79 left-justified, f1 spans full width centered, f2 shifted right — classic 3-frame hip sway.
- **Waistguard tassets sway**: the hanging plates swing as the legs move. In waistguard side views the tasset slab changes column extent per frame (e.g. waistguard-01 Left f0 vs f2 the plate jumps from right-hip x71–83 to left-hip x58–73), i.e. the skirt panels alternate which leg they cover. The buckle tongue on simple belts also lifts/drops with the bob.

### 9. Waistguard vs belt — the hanging plates (tassets)
- A waistguard = **belt band (§1–6) + a multi-plate skirt** below it.
- **Plate layout (Front):** a **center plate** flanked by **two side tassets**, separated by **transparent gaps** (the gaps show the body/legs between plates). waistguard-01 front: center plate at x66–73 (`EFFFFFFDD`) with the legs visible below in the `AAA` notch (y93 `AAA`). waistguard-03 makes this explicit: `ABBDCCCCCDBBBBBBDCCCD` then a **U-notch gap** `BBA······ABB` at y92–95 — i.e. **two tassets split by a central leg gap**.
- **Plate shading:** each plate is a steel panel with the SAME top-light/bottom-dark sandwich as the strap but taller — a light `F`/`H` highlight column down the lit side, mid `D`/`C` body, dark `A`/`B` outline, and on waistguard-02 a **white `J` hot-spec** vertical streak (`IJJI`) marking a polished bevel. Brown rivets (`B`/`G`/`H` from the leather ramp) pin the plates to the belt at the top.
- **Extent:** waistguards reach **y93 (wg-01), y96 (wg-02/03)** — about **10–14 rows of skirt below the belt band**.

---

## PER-FILE NOTES

### belt-01 (`waistwear-looseleaf-belt-01.js`)
- Palette 5: brown ramp `A #502814` / `B #80472b` / `D #966432`(tan highlight) + **silver buckle** `C #9c9c9c` / `E #bdbdbd`.
- Band: y81–84 strap (3 rows) + buckle tongue y85–86. ~3 rows tall, x60–81.
- Buckle: **`CEEC`** centered x69–72, repeated as a hanging tongue 1 row below the strap.
- Studs: `AABBBAAACEECAAABBB` — 3-px `BBB` segments / 3-px `AAA` gaps mirrored.
- Front f0 y81 `AABBBAAACEECAAABBB`, y84 `AAABCCBDDDCCBAAA` (recessed `DDD` center).
- Left f1 shows buckle `CEEC` slid to forward hip (x63–66). Back f0 plain band with center `DDDDD` plate (no buckle).
- Bob: f0 top-left, f1 centered full-width, f2 shifted right.

### belt-02 (`waistwear-looseleaf-belt-02.js`)
- Palette 5, same ramp, letters reassigned: `B #502814`(dark) / `A #80472b`(mid) / `D #966432` / silver `C`/`E`.
- Band sits 1 row lower than belt-01: strap y82–84, buckle tongue y86–87 (waist rows 80–88).
- Buckle: `CEEC` at x69–72; front f0 y82 `BBAAABBBCEECBBBAAA`.
- Studs: `AAA`/`BBB` 3-px alternation (`BBAAABBBCEECBBBAAA`).
- Back: plain band, center `DDDD` plate (y83 `BAAAAADDDDAAAAAAAAB`). Sides wrap with `CCECC` buckle nub on forward hip.

### neo-belt-01 (`waistwear-looseleaf-neo-belt-01.js`)
- Palette 9 = **acid-green glow ramp** `#1b4500 #595900 #368700 #3b9500 #9d9d00 #4fc800 #95ff27 #eaea00 #aaff52`.
- Band y82–88 with a **central green GEM buckle**, not a strap buckle: `GG`(y83)→`GEEG`(y84)→`GEFFEG`(y85)→`DIHHID`(y86)→`DIID`(y87)→`DD`(y88) — a 6-wide diamond pointing down, centered x70, core = brightest `F #95ff27`/`H #aaff52`.
- Strap = smooth ramp (`AAAAAAA` flat top), no discrete studs; relies on the gem.
- Sides: gem slides to forward hip (`DEEEEED`/`DEFFFED`). Back: plain green band, no gem (`BBBBBBAAAA...BBB`).

### neo-belt-02 (`waistwear-looseleaf-neo-belt-02.js`)
- Palette 9 = **grey strap + teal glow buckle**: greys `#484848 #515151 #666666 #777777 #919191` + teal `#007e95 #00a3bf #00f2ff #64e8ff` (`I #00f2ff` = hot core).
- Tallest plain belt: band y79–89 (~10 rows), the chunkiest strap, almost armor-like.
- Buckle: vertical teal lozenge `FF`/`FGGF`/`FGHHGF`/`FGHIGF` centered x70, rows y82–87, core `I` teal.
- Strap heavily shaded steel with brown? no — pure grey ramp; the contrast is grey-strap vs teal-buckle. Back is a long grey band, no buckle.

### waistguard-01 (`waistwear-looseleaf-waistguard-01.js`)
- Palette 9: brown belt ramp `I #502814 / B #80472b / G #966432` + steel `C #393939 / A #5a5a5a / D #7b7b7b / E #9c9c9c / F #bdbdbd / H #dedede`.
- Belt band y81–84 (brown, with `GGG`/`BBB` rivets) + **steel skirt y85–93**.
- Center plate: `EFFFFFFDD` (y85–86) over `AFFHEEEA` / `CEEHDDECC` — a rounded light-steel medallion with `H #dedede` hot-spec, tapering to a point at y93 (`AAA`).
- Sides show the side tasset as a tall vertical steel slab; back is a flatter rear plate (`DFFFFFFEEEDD`).
- Tassets sway: side-view plate jumps hips between f0/f2.

### waistguard-02 (`waistwear-looseleaf-waistguard-02.js`)
- Palette 11 (widest): adds `K #181818`(near-black) and `J #ffffff`(pure white) to the brown+steel set.
- **Three-panel skirt** to y93: center medallion + two side tassets, split by transparent gaps (`··` at x66–67 and x76–77 in front).
- Center medallion has a **white hot-spec core**: `DEEIJJIEED` (y85), `CEEIDDCCCC` (y87) — `IJJI` = `#dedede`+`#ffffff` polished bevel. Brown rivets `HHG`/`GGGFFF` pin the band (y82 `GGGFFFFFFFFG`).
- Side tassets are mirrored steel panels with their own bevel; back mirrors front minus the brightest white center.
- Frames: panels sway and the band bobs ±1 row (f0 top y81, f1 top y79–80).

### waistguard-03 (`waistwear-looseleaf-waistguard-03.js`)
- Palette 6 = **all-steel, NO brown**: `A #393939 / B #5a5a5a / D #7b7b7b / E #8c8c8c / C #9c9c9c / F #bdbdbd`. A plain plate skirt with no leather and no gold — pure grey armor tassets.
- Belt band y83–85 (grey) + **two large tasset plates** y86–97 split by a central leg gap (`BBA······ABB` notch at y92–95).
- Each tasset: dark `A` outline, `B` inner border, `C/D` body, `F #bdbdbd` highlight band across the top (`DBBBBBBDC` style with `FFF` accent rows: f0 y85 `CCCFFFCCCC`-ish, see Left f0 `CCCCFFFCEEA`).
- The center band has a recessed `BBBBBB`/`AAAAAA` core strip (y90–91 `DBBBBBBD`) reading as a stamped panel line.
- No buckle on any view — this is the pure plate-armor end of the family. Back is near-identical to front.
