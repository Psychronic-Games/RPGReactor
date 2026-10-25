# 3D Prop Builder

Forge › 3D Prop Builder makes props and saves them to the project as 3D models. Pick a type in the left column: sections (Banners & Flags, From Picture, Weapons, Wearables, Tools & Gear, and more as kinds are added) hold short groups. Click a section's header, or press Enter or Space on it, to fold it; folds last for the session. A search shows every matching type, its section open.

**Randomize** rolls a new take on the current type; the list beside it picks what changes: **Everything**, or only the **Shape**, the **Colors**, or the **Design** or **Details**. Undo takes a roll back.

## Banners & Flags

- **Flag, Streamer, Banner:** a flag on a pole, a long pointed streamer, or a tall banner down the pole.
- **Pole:** a metal flagpole, a wooden staff, a wall bracket or a crossbar banner. Height, finial (ball, spearhead, eagle, none), the halyard rope on a metal pole, and colors. Wall brackets have a separate Placement height; their studio wall and saved placement follow it.
- **Cloth:** shape (1:2 to 1:1, streamer, pennant, swallowtail, the tall 3:2, 2:1 and pole banner, or Custom), width 0.15 to 6 m, height up to the pole, the fly end (square-cut, swallowtail, pointed) and fabric (cotton, silk, heavy wool, worn and tattered).
- **Design:** a background pattern and up to eight emblems over it.
  - Patterns: solid, bands (2 to 5 either way, each its own size), stripes, cross (its arm width, centered or toward the hoist), saltire, quartered, checkered, diagonal bend, canton (its size, corner and a grid of stars), hoist triangle, border, or a whole-flag picture. Each region has its color.
  - Emblems: star, circle, crescent, shield, sun, eagle, cross, crown, sword, laurel wreath, cogwheel, skull, tree, or a picture from `img/pictures` (its own colors or one color). Place one at a snap point or freely, then its size, turn, color and mirror; repeat it as a ring or a row. ▲ ▼ reorder the list, ✕ removes one.
  - Presets: made-up kingdoms, cities, guilds, houses, a republic and an order.
- **Wind:** calm to storm, gusts, and the direction.
- **Hanging banners:** banners on a pole, an iron rod, a rope or a wire, 1 to 8 tiles long. Its ends rest on wall brackets or posts, or run from wall to wall. A rope or wire sags in a catenary. Banners come as rectangles, swallowtails, points or bunting. Each banner can have its own place and length, and every other banner can carry the second design. The prop's origin is the middle of the span on the ground, and the span runs along x. Turn it 90° for a north–south street. The readout gives the size to place it at.

## From Picture

Choose a picture from `img/pictures`, then:

- **Cut-out:** the picture's outline as a solid board, from its transparency or with its border color taken away. Height, thickness, edge, back and stand. A picture in pieces sits on a backing plate.
- **Turned:** half an outline turned round: a pot, vase, bottle or column, from the picture's silhouette or points dragged over it. Height, segments, top, wall thickness and surface.
- **Framed:** a painting, poster, hanging banner, crate or book.
  - Frames: plain modern, ornate gilded (carved molding, rosettes and shells), rustic wood, thin metal, shadow box, clip frame, or none. Each has a width, depth, rounded or beveled edge, and material (gold leaf, silver, dark or light wood, painted, black metal).
  - A frame can have a mat and glass. It hangs from a wall hook or stands on an easel or a table stand.
  - Presets: museum gilded, gallery modern, rustic, poster in a clip frame.
  - A crate takes its wood, metal or rope banding, and its picture on all sides or the front only; a book takes its cover color, thickness and spine bands.

## Weapons

- **Swords & Blades:** longsword, katana, scimitar, rapier, greatsword, dagger, machete, falchion.
  - Blade: length, width, curve, taper, thickness, tip, single or double edge, fuller and serrations.
  - Hilt: crossguard, disc or basket guard with its size and the bend of its arms; the grip's length, wrap and color; the pommel.
  - Look: steel, damascus or bronze; steel, gilded, bronze or black iron trim; a glowing edge or blade.
- **Firearms:** pistol, revolver, rifle, shotgun, submachine gun, sniper rifle. **Sci-fi:** energy sword, blaster pistol and rifle, plasma cannon, laser rifle.
  - Parts: barrel, receiver, grip angle, magazine (box, drum, revolver cylinder, tube, energy cell, none), stock, sight, muzzle (plain, brake, suppressor, emitter), rails, forend, glowing coils and vents.
  - Finish: gunmetal, polymer, chrome or painted panels; wood or polymer furniture; the glow color.
- **Axes, Bows & Shields:** the Character Builder's axe, spear, staff, bow and round shield.

Every sword and gun saves a hand rig (`rig.template` blade or gun, with its markers) in `model.json`. A character holds it through Database › Weapons the same way it holds an imported weapon.

## Wearables and Tools & Gear

The 3D Character Builder's accessories, each a standalone model: hats, face, masks, jewelry and ties, capes and packs, nails and claws, bags, tools, instruments and sports. Swords, daggers and books are listed once, under Swords & Blades and Framed; saved recipes of the accessory versions still open.

Background-color outlines remove matching color inside enclosed openings too, so rings and letters keep their holes. Use transparency outlines when same-colored interior details should remain solid. Still props keep their authored color; preview and game lighting shade their surfaces as they turn.

- **Shape:** overall size, then what the accessory has: style, fit, height or length, and its own options. A choker has its band (leather, velvet, metal links, lace), width, thickness, charm and studs.
- **Look:** the colors it shows, and a material for each of its parts (original, metal, leather, plastic, fabric, velvet, glass).
- **Placement:** origin (bottom for a map, center, or the attachment point for a character), the side it is worn on, and rotation. Single-layer pieces such as lenses and bands are two-sided. Loose pairs such as earrings and bracelets have Pair spacing for standalone display; Attachment placement preserves their original body arrangement. Caps expose bill length, backpacks expose pocket count, and jetpacks expose vent count. Shared accessory refinements also appear in Character Builder.

## Containers

The Containers section offers wine and wooden barrels, oil and explosive drums, supply and ammunition crates, stacked crates, a treasure chest, cargo crates, fuel canisters, coolant cells and data crates.

**Shape** sets size and construction: barrel staves and hoops, drum ribs, crate braces and handles, chest lids and locks, and futuristic panels and bumpers. Round containers can lie on their sides; crates can stack. **Look** sets colors and wear. **Markings** adds text, symbols or a project picture. Futuristic containers also have **Lights**, with status lamps, glowing strips and text, numeric, progress or picture displays.

Randomize keeps the current container type. Its scope chooses **Shape**, **Colors**, **Details** or **Everything**. A Colors roll preserves geometry and light timing; a Details roll preserves the chosen palette and size.

## Furniture, appliances and electronics

Four catalog sections offer 16 original procedural room props:

- **Furniture:** Dining chair, Armchair, Sofa, Bench, Dining table, Desk, Bed, Cabinet and Bookshelf.
- **Appliances:** Refrigerator and Microwave.
- **Electronics:** Television and Desktop computer, including its monitor, tower, keyboard and mouse.
- **Sci-fi interiors:** Sci-fi wall panel, Computer console and Server rack.

**Shape** edits width, height and depth in meters. **Look** offers Modern, Rustic and Sci-fi styles plus separate upholstery/body, frame, trim and accent colors. **Details** controls small hardware, books, seams, keys and vents. Seating has cushion count/thickness, Plain/Tufted/Channel upholstery, back height and arm width where applicable; storage has shelf/door/drawer counts and book fill. Choose feet or a plinth on supported forms. Consoles expose keyboard angle, screen count, key rows and control knobs. Display props offer status, radar or landscape artwork, a Screen switch and editable **Screen text** (up to 32 uppercase characters in the stencil alphabet). Clear the field for no heading. This includes consoles, computers, televisions, wall panels and microwaves. Text is part of the saved recipe and baked into the exported screen image. Screen artwork is cached separately from frame colors. Frame material, roughness and edge rounding vary the finish. Randomize supports the same scoped changes and Undo as other props.

Construction includes rounded separate cushions and mattress/pillows, cabinet joinery, door seals and handles, recessed display bezels, support frames and ventilation. Repeating wood/fabric pictures and fabric relief retain their scale in the preview and saved GLB. Screens embed original procedural artwork. Whole-object framing accounts for the window aspect and wide furniture.

Data Crate status halos now keep their alpha after material updates. Plain cargo stencils use separate painted letter geometry for close-up clarity. Rebuild/re-save older generated props to apply these corrections.

## Vehicles

The Vehicles section offers **Compact car, Sports coupe, Utility truck, Armored rover, Motorcycle, Hover transport, Shuttle, Survey drone** and **Utility walker**. Preview47 replaces the damaged raster lettering with filled sans-serif outline geometry, rebuilds window surrounds/roof sections/tire profiles and filters fine coating grain before atlas baking. The coating controls and cabin interiors from preview46 remain. Local comparisons, including clay views, readable caption crops and downloadable GLBs: `scratchpad/vehicle-corrections-20261022/review.html`.

Road vehicles have distinct section profiles, rolled shoulders, pressed bonnet skins, separate door skins, curved glazing, formed arch flanges and layered radiator/headlamp assemblies. Three-axle bodies use a tandem rear bogie to retain an access bay; truck/rover doors and supported steps fit between actual wheel-clearance bounds. The coupe adds cooling inlets, a diffuser and an adjustable rear wing. Truck beds have floor ribs/tie-downs; rovers have armored window frames and a roof hatch. Doors remain static.

Motorcycles add formed nose/tail fairings, radiator fins, chain/final drive, brake calipers and hollow silencer tips. Flight models have pressure hulls, conformal service panels, closed airfoil wings, turbine intake/nozzle assemblies and braced landing struts; hover transports also have lift fans. Drones have twisted rotor blades, motor stators, a battery cartridge and camera gimbal. Walkers use tapered plated castings, joint bearings, a load-bearing waist/spine, hydraulics and segmented toes.

**Shape** edits meter dimensions and relevant proportions: wheel size, axle count/spacing, clearance, cabin height/length, engine size, wing span or stance. Shortened chassis constrain tire radius to retain axle clearance. **Look** separates body, secondary body, trim, accent and glass colors. Choose **Enamel, Powder coat, Brushed alloy** or **Woven composite**; edit **Wear**, **Grime**, **Surface variation**, **Paint scheme** and **Markings**. Paint schemes are Plain, Stripe, Rally and Service. Markings accept up to 22 letters, digits and supported punctuation; graphic artwork is projected onto actual curved panels with a transparent background. Text uses opaque filled outlines with natural letter spacing and proportions; it is not part of that alpha atlas. Very small generated maintenance sentences are omitted. The bundled outline subset derives from DejaVu Sans Bold and includes its license in `VehicleTypeface.js`. Road/flight cabins offer **Cabin interior**, **Window opacity** and **Seat upholstery**. Seats, headrests, dashboard instruments and steering hardware occupy a real interior opening. Turning the interior off restores opaque windows. Rubber, metal, molded trim and seat fabric use their own normal/roughness maps rather than the paint finish. **Details** offers relevant spokes, tread, racks, bumpers, cargo and tools, plus **Rear wing height** for cars/coupes, **Naked/Half/Full fairing** for motorcycles, **Transport/Interceptor/Cargo hauler** flight equipment, **Duct ring/Safety cage/Open rotor** drone protection and walker armor thickness. These options change actual assemblies, including with small surface Details disabled. Scoped randomization preserves type.

Technical verification covers finite/winding and wheel/rider contracts, open glyph counters, opaque exported captions, coating filtering, sampled controls and real UI history. Native views include full materials and clay; GLBs are independently reloaded and rendered. The label crop check runs OCR at 160/256/384 px. OCR reads both revisions. A separate rendered-pixel check requires the three expected openings in “RANGER 17”; it rejects the old merged glyphs and passes the new outlines at all three sizes. The native regression is `editor/tests/smoke/vehicle-lettering.cjs` (run through `codex-check` with DISPLAY/WAYLAND_DISPLAY empty). These are narrow regressions, not a visual-quality score. Preview46 passed technical checks while the owner rejected its visual quality; my earlier screenshot review missed visible problems. The new gallery records corrections and remaining limits separately. Visual acceptance remains open. [Resource measurements](PERFORMANCE.md#prop-construction-2026-10-22-preview-revision-47) distinguish first builds, cached revisits and drag resolution.

Saved ground models carry exact wheel part names, axle centers and radii in `model.json`. Motorcycles retain the existing rider seat, hand/foot targets and steering-bar marker. Use saved models in [Database vehicle authoring](AUTHORING.md#authoring-vehicles). Flight craft and walkers provide geometry; this pass adds no autonomous flight or animated gait. Reload/reselect presets and rebuild/re-save old GLBs to receive new geometry. Runtime remains 20261022.1.

## Reported visual corrections — preview44

The comparison at `scratchpad/quality-corrections-20261022/review.html` shows the upright suitcase grip with seated mounting feet, rover access bay, rounder wheel profiles, larger stacked barrel warning and editable console heading. Every vehicle default is recaptured. Screens accept text in all three artwork modes, preserve it through Undo/Redo and recipe serialization, and export it in their GLB image. Four display types also have native input/material/history/export checks; all five screen forms have model/cache checks.

Three-axle bodies use a tandem rear bogie. Door panels and hardware fit the largest cabin bay between actual tire-clearance bounds, including short cabins and large wheels. Rover/truck steps attach to supported brackets; rover radios mount to the roof. The geometry does not add door-opening animation. Barrel symbols and words have separate vertical space; stencil bridges and wear no longer erase so much of the lettering.

Sample models, source hashes, inspected views and validation logs are linked from that local review. Reload/reselect presets and rebuild/re-save existing GLBs; generated files do not change automatically. Preview47 supersedes the vehicle lettering/forms, preview46 the coatings and preview45 the bodies below; preview44 evidence remains available for the other corrections.

## Construction rules and quality coverage — 2026-10-22, preview 43

`ConstructionPatterns.js` is a deterministic pattern bank shared by props and character equipment. A rule declares recipe traits, optional compatibility conditions and the controls it consumes. Its assembly builds in a stable order using shared measured dimensions and attachment coordinates. A finite-anchor helper is available for explicit named mounts. `FurnitureConstruction`, `GunConstruction` and `VehicleConstruction` own family rules; `CharacterProps` uses the same bank for equipment. The returned construction trace makes selected rules inspectable. This is an extensible construction system, not automatic conversion of reference meshes or a replacement for the entire wardrobe generator.

Modern, Rustic and Sci-fi furniture now select actual joinery, rails or chassis even with Details off. Supported seats/beds offer Plain, Tufted and Channel upholstery with physical cushion deformation. Keyboards use fitted modifier widths, a space bar and engraved legends. Curved fillets, formed vehicle glazing, projector lamps, layered firearm receivers, a fluted revolver cylinder and helical sword grips add shape detail. Shared character equipment adds formed bags and zipper hardware, interlocking metal chokers/open lace, a hollow acoustic guitar, an open umbrella canopy/frame and folded bow ties.

`ConstructionSurface.js` supplies cached periodic normal and packed roughness/metalness maps for material roles; wood can also supply grayscale grain beneath the chosen palette. Preview and exported GLB use the same maps. Material choices refresh the shader/map layout even when geometry is unchanged; glass is transparent and cloth uses the cloth finish. Container atlases reserve complete regions, grow their height when necessary and rescale final UVs, preserving late cap/valve colors. Tall-banner cross positions and repeated emblem placement now affect the painted field; cloth height respects the recipe limit and slider steps. Turned pictures start at 64 segments and allow 128.

The final local evidence is in `scratchpad/prop-depth-20261022/review.html`: all 122 defaults against preview42,82 contrasting style/detail recipes, per-type control ledgers, character fittings and sample GLBs. The ledger samples every exposed control at minimum/interior/maximum or every choice, discovers dependent controls through parent choices, and records equivalent choices and symmetry witnesses. This is a complete default/type and individual-control audit, not every Cartesian combination. Actual UI/history checks and native material transitions supplement model checks. The earlier 37 prop-reference GLBs and 28 clothing-reference reviews remain linked; their meshes, UVs, textures and branding are not shipped.

Validation counts, source hashes and exact inspected views live in local `verification.json` and `prop-review.json`. Software renders establish visible construction, not hardware FPS. These remain stylized procedural assets; some simpler accessory silhouettes are retained. The wider wardrobe fitting limits and earlier bikini coverage failure remain open. Reload the editor for preview 43 and rebuild/re-save older generated props or characters to receive revised construction. Runtime stays 20261022.1.

## Saving

**Save to Project** writes `3d/Props/<name>/`:

- `source/<name>.glb`: the model with its pictures inside. Cloth is skinned to bones and carries its loop as the clip **Wave**. The loop lasts three seconds and is baked from the cloth simulated in the tool, so nothing is simulated in the game.
- `model.json`: the Wave clip playing always and the model's origin placed where the prop stands. Every prop rests on the floor except wall-hung ones (a painting on a hook, a bracket flag, a span on brackets), which keep their height. Weapons add their hand rig; hanging banners add `span` (length in tiles, axis, origin).
- `prop.json`: the recipe, for **Open…**. `thumbnail.png`: the picture Open shows.

The model shows in Database › 3D Models like an imported one.

Animated container lights and displays use a saved **Lights** clip and emissive materials. The game plays the clip; it runs no container simulation. Ordinary barrels, crates and chests remain still.

## In the game

The game lights each face by the way it turns. Still props also carry a soft form shading in their colors, so carving reads under any light. Glowing edges, coils and emitters glow (glTF emissive).
