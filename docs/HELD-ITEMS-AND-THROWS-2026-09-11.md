# Equipped items, ally throws and starter sequences — 2026-09-11

Reactor now renders equipped items at a selected battler's hand, and can throw the actual item/weapon icon or a chosen picture between battlers. The implementation shares attachment and flight math between the authoring preview, flat battles and 2D/3D battle rooms.

## Reference cases

Read the existing Victor notetags in the adjacent **Star Shift Rebellion** project, particularly Weapons #1/#3 (equipped icon placement during attacks), Items #2 (Med Kit thrown to a comrade), and actor movement/return phases. Those records combine Battle Motions icon operations with separate Throw Object notetags. Reactor's previous plain projectile marker did not cover that second behavior.

The new controls implement those behaviors as structured steps. They do not require Victor plugins or import/execute old notetag scripts.

## Authoring

- **Weapon Icon:** choose the equipped item, current skill/item icon, a specific icon, or an existing weapon-sheet frame. Attach to a right/left hand, center, or explicit offset. Equipment slot, optional model bone name, normalized image grip point, scale and rotation are available.
- **Projectile:** choose a colored marker, current action's icon, equipped item, specific icon or picture. Select recipients, launch/arrival heights, arc height, spin, duration and one-way/return flight. Multiple targets produce one visual per unique battler. Original action repeats remain under the normal impact policy.
- **Options:** choose the preview skill/item and 2D/3D projection. The preview uses an assigned skill/item when available and remembers the selected projection while switching sequences.
- **Animation Source:** explicitly selects the current action, weapon attack, or a chosen animation. An action whose animation is None stays silent instead of incorrectly substituting the weapon animation.

A 3D hand attachment uses a recognized hand bone or the supplied bone name and updates after model animation, including models rendered into flat battle sprites. Sprite sheets and models without a matching bone use a proportional hand point with adjustable offsets. Grip X/Y identify the point on the item image that belongs at the hand; rotation is an authored setting. This does not infer exact hand pixels separately for every sprite frame.

Humanoid rigs without an authored Item motion receive a small arm motion whose release is at frame 12, matching the item starters. An unassigned Attack motion can reuse the existing/generated Punch rule. Authored motions are preserved. Custom/non-humanoid rigs can supply their own animation and attachment bone/offset.

Flights capture the launch point, follow the recipient, arc/spin during travel, and disappear at arrival. The subsequent impact cue applies the ordinary game action. The Boomerang starter applies its effect on arrival, then sends the weapon back. Cleanup releases transient graphics and render callbacks on completion, cancellation and scene exit without destroying shared icon atlases.

## Real database records

All 13 bundled projects include 16 editable starter records. Their existing sequences and assignments remain in place. Newly generated blank and copied-template projects receive the same library. Existing projects can use **Add Starter Sequences** under the Action Sequences search field; repeated additions preserve existing records and avoid duplicates. Save the Database to persist additions.

Complete actions: Unarmed Punch, Melee Strike, Projectile Shot, Cast on Target, Heal, Self Buff, Use Item, Throw Item, Throw Weapon, Boomerang, and Punch.

Reusable routines: Run to Target, Return Home, Hold Equipped Item, Hold Action Item, and Clear Held Item. Call these from another sequence. Hold routines keep the visual until a clear step or the enclosing action's cleanup.

These use database equipment/action icons and animation settings, so they need no hard-coded Med Kit, weapon, sound or animation IDs from the reference project. Assign Throw Item to a healing item for the comrade case; assign Throw Weapon/Boomerang to the relevant skill or normal-attack override.

## Verification

- Full Node suite: **3,082 passed**. New checks cover starter validity/preservation, fresh project generation, hand following/mirroring, equipped icon selection, unique ally visuals with preserved impact repeats, arcs, return flights, private/shared bitmap cleanup, 3D hand bones and the fallback item motion.
- Native authoring regression: responsive preview, step dragging, per-target transforms, keyboard/clipboard, sound and animation pickers, completion waits, undo/redo and persistence.
- `nw-held-items.cjs` uses a disposable project, actual SV sheets/icons and the Fleagus model. It checks authoring projections and live flat-sprite, flat-model, orthographic-room and perspective-room battles. HP remains unchanged during the throw, the ally gains exactly 20 HP after arrival, and temporary graphics are removed. Evidence: [native report](held-items-native-2026-09-11.json), screenshots in `held-items-2026-09-11/`.
- Localization coverage passes for all supported locales; new Simplified Chinese terminology received a manual review.
- Runtime revision: **20260911.6**. Editor version remains **0.98.6**.
