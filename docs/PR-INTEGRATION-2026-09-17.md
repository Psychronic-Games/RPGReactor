# PR #62 and #63 integration — 2026-09-17

[PR #62](https://github.com/Psychronic-Games/RPGReactor/pull/62) "Add Ash and Ember collapse effects" and [PR #63](https://github.com/Psychronic-Games/RPGReactor/pull/63) "Class curve target level" (Xehanort88) were merged on GitHub and brought into the local branch, which already carried this week's local work (palette fit, translations, lighting guide, CI skips).

## What they change

- **Ash and Ember (Collapse Effect trait values 4 and 5).** `Sprite_Enemy` cuts the art sprite's frame into a grid of `PIXI.Particle` cells in a `ParticleContainer` (the real v8 class via `PIXI.__v8ParticleContainer`, since pixi_compat replaces the public name for MZ-era plugins), releases them on a wave from the feet, and for Ember tints towards fire with an additive spark layer. `particleCollapseArtSprite` walks to the sprite that holds a ready bitmap (Battle Core parents the art under a distortion sprite); transparent cells are dropped from the alpha map read through the texture source's resource. Runtime: `reactor_sprites.js` (+472), `reactor_objects.js` (the trait's new values).
- **Class curves to a target level.** `DatabaseClassEditor` anchors curves and the EXP table at the highest Max Level among actors using the class; curves stay stored over 1..999; the exponent fit solves at t = (level−1)/(target−1); the EXP graph box fits the dialog. Trait help and common UI strings updated, with translations in `I18nDeepTranslations.js` and `I18nManager.js`.

## Integration

- No conflicts; merge commit `35bfc24`. The PRs' changelog entries landed under the local `[Unreleased - 0.98.7]` heading.
- Runtime revision **20260917.1**, every bundled project synced, `--check` clean.
- **Room battlers:** `P.installRoomAnchors` wraps `Sprite_Enemy.prototype.startParticleCollapse` so a sprite with `_reactorRoomKey` takes the standard collapse. Without it, a 3D enemy that also has a battler image would shred that hidden 2D image on screen while `updateParticleCollapse` set the sprite's opacity to 0 and the model, mirroring it, vanished at once; a 3D enemy without an image already fell back (nothing opaque to cut). Test beside the boss-collapse duration test in `battle-presentation.test.cjs`.

## Verification

- Complete Node suite after the merge: **3,255 passed** (3,247 before), zero failures, the room guard included in the same test.
- The contributor again reports "24 pre-existing environmental failures" in their tree; none here or in CI's clean clone.

Not pushed. No release, deployment or GitHub message was performed.
