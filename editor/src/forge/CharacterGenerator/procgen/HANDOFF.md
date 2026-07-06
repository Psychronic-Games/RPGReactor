# Procgen Outfit Generator - Handoff

This file captures everything a fresh session needs to continue the procgen outfit work without re-deriving the context.

## CURRENT STATE (2026-06-18 - READ THIS FIRST)

The "one blob" problem is solved for the current Looseleaf generator direction.
The generator was rebuilt around the headline insight from reading every artist
part: **each zone gets its own palette FAMILY, and the contrast between families
is what makes pieces read as separate armor.**

What exists now:
- `procgen/view_part.js`, a viewer that crops any part to its bbox, prints a
  column ruler + the palette sorted by luminance, and can overlay the body
  silhouette (`--overlay`). THIS is how you actually *see* parts, use it, don't
  read raw 144×144 JS. Usage: `node procgen/view_part.js <part.js> --all --overlay`
- `procgen/analysis/*.md`, per-category pattern analysis from 8 agents that ran
  the viewer on all 124 artist parts, synthesized into `PATTERN_LANGUAGE.md`.
  PATTERN_LANGUAGE.md is the spec the engine implements; read it before changing
  painters.
- `procgen/outfit_engine.js`, the engine (UMD: runs in Node AND the browser).
  FAMILIES (luminance ramps) + ACCENTS (off-ramp glows) + a palette BUILDER that
  assigns letters per family + role-based PAINTERS (head/torso/arms/belt/legs/
  boots) + EXTENSIONS (pauldron/armGauntlet/spikes). `generateOutfit(config, body)`
  returns `{ palette, sheet }`. Also exports `UI_SCHEMA` + `defaultConfig()` for
  the editor.
- `procgen/styles/looseleaf.js` and `procgen/styles/psychronic.js`, style
  adapters. Looseleaf uses the shared painters directly; Psychronic swaps in
  Psychronic-specific anatomy, classifiers, painters, and extensions.
- `procgen/outfits/nova_sentinel.js`, the shared Nova Sentinel recipe. It
  provides matching Outfit Forge part sets and default configs for both
  `looseleaf` and `psychronic`.
- `procgen/gen_outfit.js`, thin Node CLI: loads body templates, runs configured
  outfits through the engine, writes part `.js` files.
- `procgen/render_png.js` - Node smoke/render utility for generated outfits.
- `procgen/outfit_configs.js`, legacy/simple config entry point still present
  for direct CLI generation. The current editor default comes from
  `procgen/outfits/nova_sentinel.js`.
- **In-editor "Outfit Forge" tab** (CharacterGenerator.js, methods grouped under
  the `TAB - OUTFIT FORGE` banner). A third tab beside Procedural/Parts. Per-zone
  material+accent dropdowns and param toggles, extension enable+params, live 4-dir
  preview (CharacterRenderer), walk toggle, and "Generate & Save to Library" which
  writes the part `.js` into `styles/<style>/parts/full outfits/` and registers it.
- Generated Looseleaf full outfits currently exist under
  `styles/looseleaf/parts/full outfits/`, including `full-outfits-looseleaf-nova-sentinel.js`.
- The Psychronic style currently has a body base and Outfit Forge adapter path;
  full generated Psychronic outfit-library output still needs visual validation.

Resume points / polish ideas: visually validate Psychronic Nova Sentinel, tune
Psychronic-specific painter proportions, add more recipes beyond Nova Sentinel,
add more zone styles (cloth robe, open-face helmet), and add small Node tests for
palette/config/sheet generation. New zone styles slot in as new `style` entries
in PAINTERS/PSYCHRONIC_PAINTERS + UI_SCHEMA. The history below is kept for context.

## The goal

A procedural outfit generator for the Character Generator that:

1. Produces **endless outfits** as Character Generator parts (category `full outfits`), driven by a config object so adding a new outfit means adding a config, NOT new generator code.
2. Outputs follow the same conventions as the artist's hand-drawn parts under `src/forge/CharacterGenerator/styles/looseleaf/parts/{torso,headwear,shoulderwear,armwear,handwear,waistwear,legwear,footwear}/`.
3. Eventually exposes the config-object structure to the user as sliders/dropdowns in an in-editor UI so users can generate their own outfits.
4. Currently targets the **Nova Sentinel** outfit as the shared first recipe, used to validate that the system produces output that visually matches the artist's quality across Looseleaf and Psychronic styles.

## Where the code lives

- `src/forge/CharacterGenerator/procgen/outfit_engine.js`, browser/Node generator core
- `src/forge/CharacterGenerator/procgen/styles/`, style adapters (`looseleaf`, `psychronic`)
- `src/forge/CharacterGenerator/procgen/outfits/nova_sentinel.js`, current shared recipe
- `src/forge/CharacterGenerator/procgen/gen_outfit.js` - CLI generator wrapper
- `src/forge/CharacterGenerator/procgen/render_png.js` - CLI render/smoke utility
- `src/forge/CharacterGenerator/procgen/outfit_configs.js`, simple legacy config list for direct generation
- Output goes to `src/forge/CharacterGenerator/styles/<style>/parts/full outfits/full-outfits-<style>-<id>.js`
- Body reference: `src/forge/CharacterGenerator/styles/looseleaf/parts/body/male/body-looseleaf-looseleaf-male-body-01.js`
- Psychronic body reference: `src/forge/CharacterGenerator/styles/psychronic/parts/body/male/body-psychronic-psychronic-body-male-01.js`
- Run with: `node src/forge/CharacterGenerator/procgen/gen_outfit.js`

## Architectural history (what we've tried)

### Attempt 1: Silhouette tracing
- For every body pixel, classify by Y position into a zone (head/torso/legs/etc) and apply a zone-specific letter pattern.
- Result: matches body shape and walk-cycle bob automatically. But the patterns end up looking like "one blob" because everything uses the same palette, and hard-edged armor pieces don't read as separate.

### Attempt 2: Modular composition (rigid rectangles)
- Each "module" stamps an idealized rectangle at anchor coordinates (helmet box, chest rectangle, belt strip, leg rectangles).
- Result: pieces are clearly separate, but they DON'T match the body silhouette per-frame and look static when the character walks.

### Attempt 3 (current): Hybrid, painters + extensions
- **Painters** paint OVER body silhouette pixels (so legs match body's per-frame leg positions).
- **Extensions** stamp extra geometry beyond the silhouette (helmet crown above head, pauldrons beyond shoulders).
- Skin-letter + run-length detection separates arm/hand pixels from torso pixels.
- Result: pieces match body but still feel like a unified bodysuit, not distinct armor segments. User reports:
  - "Looks like one blob"
  - "Belt blends with pants because they're the same color"
  - "Helmet is silver pieces going over the eyes and a single horizontal line"

## Key insight that emerged from studying artist parts

1. **Each zone uses a different COLOR FAMILY.** Chest plates are silver/steel grays. Belts are leather/gold or bronze. Pants are dark blue/black. The CONTRAST between zones is what makes them read as separate pieces. Current procgen uses one palette for everything, that's the "blob" feeling.

2. **Patterns use letter triples symmetrically inward**: `DAAACCCBBBBBCCCAAADD`, outline, mid-dark, mid-light, highlight, mid-light, mid-dark, outline. Every 3rd row swaps the center to `DCCCAAAFFFFFAAACCCDD` (the FFFFF is the "quilted seam"). This is what makes armor read as plated.

3. **Helmets are SHAPED procedurally** with their own outline - NOT traced from the head silhouette. Look at `metal-helmet-04.js` for the pinched-top dome with brow ridge and chin strap.

4. **Existing parts already align with the body** because the ARTIST designed them at the right body coordinates per frame. They're not traced from the body, but their bbox sits at exactly the right anatomical position.

5. **Arms in walk frames swing**, the artist draws each frame's arm at the body's per-frame arm position. Need to detect arm centres per frame (already implemented in `findArmCentres` / per-row run analysis).

## Completed analysis work

The older "spin up agents for every part category" task is complete. The outputs
live in `procgen/analysis/*.md`, and `PATTERN_LANGUAGE.md` is the synthesis the
generator currently implements.

If the generated art starts drifting, re-run the same style of analysis against
the relevant source part category and update `PATTERN_LANGUAGE.md` before making
large painter changes.

## Recommended next work

1. Smoke-test `generateOutfit(engine.defaultConfig('looseleaf'), body.template)`
   and `generateOutfit(engine.defaultConfig('psychronic'), body.template)` after
   generator edits.
2. Visually validate Nova Sentinel in the editor's Outfit Forge tab for all 4
   directions and all 3 walk frames.
3. Tune Psychronic-specific zone masks/painters until the outfit reads as armor
   rather than a recolored body suit.
4. Add new recipes as recipe modules under `procgen/outfits/` instead of growing
   ad-hoc config branches in the editor.
5. Add small Node tests for palette building, recipe defaults, style selection,
   and generated sheet dimensions.

## Body geometry quick reference

- 144×144 cell, body content bbox: (48,36)–(93,107) - 46 wide × 72 tall, centred at col 70
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

## How to resume in a fresh session

1. Read this file.
2. Read `PATTERN_LANGUAGE.md`, `outfit_engine.js`, `procgen/styles/*.js`, and
   `procgen/outfits/nova_sentinel.js`.
3. Run `node src/forge/CharacterGenerator/procgen/gen_outfit.js` to see current
   generated output. Inspect the generated file to see what gets produced.
4. For UI behavior, open the editor, open Forge -> Character Generator -> Outfit
   Forge, and check Looseleaf/Psychronic style output across all directions and
   walk frames.
5. Make painter/recipe changes in the engine or recipe modules, not by editing
   generated `full outfits` output by hand unless the goal is a one-off asset.
