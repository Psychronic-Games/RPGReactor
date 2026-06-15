# Procgen Outfit Generator — Handoff

This file captures everything a fresh Claude session needs to continue the procgen outfit work without re-deriving the context.

## ⭐ CURRENT STATE (2026-06-13 redesign — READ THIS FIRST)

The "one blob" problem is SOLVED. The generator was rebuilt around the headline
insight from reading every artist part: **each zone gets its own palette FAMILY,
and the contrast between families is what makes pieces read as separate armor.**

What exists now:
- `procgen/view_part.js` — a viewer that crops any part to its bbox, prints a
  column ruler + the palette sorted by luminance, and can overlay the body
  silhouette (`--overlay`). THIS is how you actually *see* parts — use it, don't
  read raw 144×144 JS. Usage: `node procgen/view_part.js <part.js> --all --overlay`
- `procgen/analysis/*.md` — per-category pattern analysis from 8 agents that ran
  the viewer on all 124 artist parts, synthesized into `PATTERN_LANGUAGE.md`.
  PATTERN_LANGUAGE.md is the spec the engine implements; read it before changing
  painters.
- `procgen/outfit_engine.js` — the engine (UMD: runs in Node AND the browser).
  FAMILIES (luminance ramps) + ACCENTS (off-ramp glows) + a palette BUILDER that
  assigns letters per family + role-based PAINTERS (head/torso/arms/belt/legs/
  boots) + EXTENSIONS (helmetCrown/pauldron/spikes). `generateOutfit(config,body)`
  → `{palette, sheet}`. Also exports `UI_SCHEMA` + `defaultConfig()` for the editor.
- `procgen/gen_outfit.js` — thin Node CLI: loads body, runs `outfit_configs.js`
  through the engine, writes part .js files. `node procgen/gen_outfit.js`
- `procgen/outfit_configs.js` — NEW per-zone schema (zones: {style,family,accent,
  params}; extensions:[…]). Space Warrior = steel helmet+chest, gunmetal arms,
  leather+gold belt, navy legs, iron boots, steel cyan-rim pauldrons.
- **In-editor "Outfit Forge" tab** (CharacterGenerator.js, methods grouped under
  the `TAB — OUTFIT FORGE` banner). A third tab beside Procedural/Parts. Per-zone
  material+accent dropdowns and param toggles, extension enable+params, live 4-dir
  preview (CharacterRenderer), walk toggle, and "Generate & Save to Library" which
  writes the part .js into `styles/looseleaf/parts/full outfits/` and registers it.

Resume points / polish ideas: side-view pauldron is subtle; reactor shows on the
back too; could add more zone styles (cloth robe, open-face helmet) — they slot in
as new `style` entries in PAINTERS + UI_SCHEMA. The history below is kept for context.

## The goal

A procedural outfit generator for the Character Generator that:

1. Produces **endless outfits** as Character Generator parts (category `full outfits`), driven by a config object so adding a new outfit means adding a config, NOT new generator code.
2. Outputs follow the same conventions as the artist's hand-drawn parts under `src/forge/CharacterGenerator/styles/looseleaf/parts/{torso,headwear,shoulderwear,armwear,handwear,waistwear,legwear,footwear}/`.
3. Eventually exposes the config-object structure to the user as sliders/dropdowns in an in-editor UI so users can generate their own outfits.
4. Currently targets the **Space Warrior** outfit as the first config, used to validate that the system produces output that visually matches the artist's quality.

## Where the code lives

- `src/forge/CharacterGenerator/procgen/gen_outfit.js` — generator framework + modules
- `src/forge/CharacterGenerator/procgen/outfit_configs.js` — outfit configurations
- Output goes to `src/forge/CharacterGenerator/styles/looseleaf/parts/full outfits/full-outfits-looseleaf-<id>.js`
- Body reference: `src/forge/CharacterGenerator/styles/looseleaf/parts/body/male/body-looseleaf-looseleaf-male-body-01.js`
- Run with: `node src/forge/CharacterGenerator/procgen/gen_outfit.js`

## Architectural history (what we've tried)

### Attempt 1: Silhouette tracing
- For every body pixel, classify by Y position into a zone (head/torso/legs/etc) and apply a zone-specific letter pattern.
- Result: matches body shape and walk-cycle bob automatically. But the patterns end up looking like "one blob" because everything uses the same palette, and hard-edged armor pieces don't read as separate.

### Attempt 2: Modular composition (rigid rectangles)
- Each "module" stamps an idealized rectangle at anchor coordinates (helmet box, chest rectangle, belt strip, leg rectangles).
- Result: pieces are clearly separate, but they DON'T match the body silhouette per-frame and look static when the character walks.

### Attempt 3 (current): Hybrid — painters + extensions
- **Painters** paint OVER body silhouette pixels (so legs match body's per-frame leg positions).
- **Extensions** stamp extra geometry beyond the silhouette (helmet crown above head, pauldrons beyond shoulders).
- Skin-letter + run-length detection separates arm/hand pixels from torso pixels.
- Result: pieces match body but still feel like a unified bodysuit, not distinct armor segments. User reports:
  - "Looks like one blob"
  - "Belt blends with pants because they're the same color"
  - "Helmet is silver pieces going over the eyes and a single horizontal line"

## Key insight that emerged from studying artist parts

1. **Each zone uses a different COLOR FAMILY.** Chest plates are silver/steel grays. Belts are leather/gold or bronze. Pants are dark blue/black. The CONTRAST between zones is what makes them read as separate pieces. Current procgen uses one palette for everything — that's the "blob" feeling.

2. **Patterns use letter triples symmetrically inward**: `DAAACCCBBBBBCCCAAADD` — outline, mid-dark, mid-light, highlight, mid-light, mid-dark, outline. Every 3rd row swaps the center to `DCCCAAAFFFFFAAACCCDD` (the FFFFF is the "quilted seam"). This is what makes armor read as plated.

3. **Helmets are SHAPED procedurally** with their own outline — NOT traced from the head silhouette. Look at `metal-helmet-04.js` for the pinched-top dome with brow ridge and chin strap.

4. **Existing parts already align with the body** because the ARTIST designed them at the right body coordinates per frame. They're not traced from the body, but their bbox sits at exactly the right anatomical position.

5. **Arms in walk frames swing** — the artist draws each frame's arm at the body's per-frame arm position. Need to detect arm centres per frame (already implemented in `findArmCentres` / per-row run analysis).

## What the user wants done NEXT

The user explicitly asked for **parallel subagent analysis** of every part category. OpenCode's agent tool failed in this session. Switching to Claude (which has working Task tool for subagents) to:

1. **Spin up 6 parallel agents**, one per category:
   - `headwear/` (52 files) — helmet/visor/crown/hood/bandana shape and pattern conventions
   - `torso/` (32 files) — breastplate/cloak/coat/vest shape and pattern conventions
   - `shoulderwear/` (8 files) — pauldron shapes that extend beyond the body
   - `armwear/` + `handwear/` (6 + 5 files) — gauntlet/bracelet/glove conventions
   - `waistwear/` (7 files) — belt shape, buckle, contrast color
   - `legwear/` + `footwear/` (8 + 6 files) — pants leg-tubes, walk-cycle handling, boot shapes

   Each agent should report:
   - Palette structure (letter count, role mapping, hex gradient)
   - Silhouette shape conventions (where it starts, tapers, ends)
   - Pattern conventions inside (letter triples, vertical bands, horizontal seam rows, rivets, accent columns)
   - Per-direction differences (front vs side vs back)
   - Per-frame variations (walk-cycle bob/limb-swing)
   - Color family typically used

2. **Synthesize agent findings** into a documented "pattern language" for each zone.

3. **Redesign `gen_outfit.js`** based on the pattern language so output matches artist quality. Key changes likely needed:
   - **Per-zone palettes** instead of one outfit-wide palette. Each zone (head/torso/arms/belt/legs/boots) gets its own color family.
   - **Letter-triple row patterns** with 3-row segment seams (the quilted look).
   - **Helmet as extension**, not painter — stamps its own pinched-dome shape.
   - **Chest plate shape** with pec curves at top and narrowing taper to belt.
   - **Pauldrons** as extensions extending beyond the shoulder silhouette.
   - **Arm tubes** with their own outline so they're visible even when fused with the chest in side view.

4. **Validate** by regenerating the Space Warrior outfit and visually confirming each zone reads as a distinct armor piece.

## Reading the agent reports

Each agent should read 10–15 files from their assigned category and look for COMMON patterns vs per-file variations. The agent's output will be the spec for the corresponding module rewrite.

## Body geometry quick reference

- 144×144 cell, body content bbox: (48,36)–(93,107) — 46 wide × 72 tall, centred at col 70
- Skin-letter detection in body palette: A, C, D, E, I (warm peach hues)
- Anatomical Y bands (as fractions of body height, used in `analyzeFrame`):
  - Head: 0.00 → 0.42 (rows 36–66)
  - Torso: 0.42 → 0.65 (rows 66–82)
  - Belt: 0.65 → 0.72 (rows 82–87)
  - Legs: 0.72 → 0.96 (rows 87–105)
  - Boots: 0.96 → 1.00 (rows 105–107)

## Existing parts to use as visual references (open and look at the ASCII)

- Best helmets: `metal-helmet-04.js` (pinched dome with chinstrap), `futuristic-helmet-01.js` (sci-fi with visor)
- Best breastplates: `torso-looseleaf-breastplate-01.js` (clean quilted pattern), `torso-looseleaf-breastplate-02.js` (pec curves)
- Best pauldrons: `shoulderwear-looseleaf-neo-shoulders-01.js`, `neo-shoulders-02.js`
- Best gauntlets: `armwear-looseleaf-neo-gauntlet-01.js`, `armwear-looseleaf-armguard-02.js`
- Best belts: any `waistwear-looseleaf-belt-*.js`
- Best pants: `legwear-looseleaf-pants-01.js`
- Best boots: `footwear-looseleaf-boots-01.js`

## Critical user feedback to NEVER violate

- **NEVER offer to pause, split work, or check in mid-task.** This has been raised twice as a major friction point. See `~/.claude/projects/-mnt-sda1-Dropbox-Family-Room-SharedProduction-RPG-Reactor/memory/feedback_dont_pressure_stop.md`. Just do the work until it's done or blocked by a real error.
- The user wants the system to keep building over time toward user-facing sliders. Code can be long; that's fine. Don't truncate or oversimplify.

## How to resume in fresh Claude session

1. Read this file.
2. Read `gen_outfit.js` and `outfit_configs.js` to understand current state.
3. Run `node src/forge/CharacterGenerator/procgen/gen_outfit.js` to see current output. Inspect the generated file to see what gets produced.
4. Open 6 parallel Task subagents using the prompts described in "What the user wants done NEXT" section above.
5. After all agents return, synthesize and rewrite gen_outfit.js with per-zone palettes + letter-triple patterns + helmet/pauldron extensions + per-frame arm/leg adaptation.
6. Iterate with the user from there.
