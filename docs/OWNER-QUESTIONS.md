# Waiting on the owner

The one list of questions only the owner can answer. Each item has a recommendation. Remove an item once it is answered; record the work in the changelog.

Answer by number: "A: go", "B: all recommended except B4 and B13", "C2 done".

## A. Defects: fixed as described unless the owner objects

None open.

## B. Decisions (recommendation in bold)

1. Height reach "no limit": Most extra reach is 0–10 tiles (0 = off), and you asked for no limit. Either add a No limit checkbox, or **raise the maximum to 30, the reach cap, which behaves the same with no new control.**

## C. Only the owner can do these

The owner reviews North Haven, playtests battles and tries weaker hardware on their own schedule; these are listed only when a specific question needs an answer.

1. Look at the weak-GPU picture on the UHD 630: edges, beams, and the `"cas"` against the `"crisp"` upscale (later).
2. Look at the Preview 62 vehicles and props (`scratchpad/prop-audit-wasteland-20261030/comparison.html`) for visual acceptance (later). This replaces the Preview 47 vehicle review, whose gallery is gone.
3. By hand, in third person on a 3D map: ride a vehicle and press Escape once. It should get off, not open the menu (fixed at runtime 20261024.3, checked in Node only).
4. Name the house and location of the wall/roof flicker, and whether it shows in the game, the editor or both. It has not been reproduced without them.
5. Share the recipe or preset behind the pointy under-chin shadows. The default recipe does not reproduce them.
6. Turn on WebSockets for Engine mode on the demo server, as root: `a2enmod proxy_wstunnel && systemctl reload apache2`, then rebuild once. Until then games use polling. If `reactor-online` starts answering 500 afterwards, its folder needs `Options +FollowSymLinks` or `+SymLinksIfOwnerMatch`. [Details](DESIGN-ONLINE.md#engine-mode).
