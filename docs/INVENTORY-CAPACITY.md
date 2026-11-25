# Inventory capacity: chests and rewards that wait for room

A party can hold only so many of an item. `Game_Party.gainItem` cuts a gain off at the cap
(`runtime/reactor_objects_battlers.js`, `container[item.id] = newNumber.clamp(0, this.maxItems(item))`),
so a reward that does not fit is lost. For an ordinary chest, that means the
items are gone and the chest still counts as opened. **Can Receive** is how an event asks
first.

## The Can Receive condition

Conditional Branch › **Reactor** › **Can Receive** [Item / Weapon / Armor] [entry] × [amount].

- It is true when the party holds few enough that **the whole amount** fits:
  `numItems(entry) + amount <= maxItems(entry)`. A stack that would only partly fit fails.
- The cap is the one the game reports when the event runs (`$gameParty.maxItems`), so any plugin that
  sets it applies with no setup: VisuStella Items & Equips Core's defaults and its `<Max: x>`
  notetag, or Reactor's own 99 (9999 with higher limits on). A cap of 0 refuses everything, and a
  plugin with no cap lets everything through.
- Equipped copies do not count against the cap, which matches how `gainItem` itself counts.
- A deleted or missing entry makes the condition false: the branch's Else runs, and nothing is given.
- It is saved as an ordinary Script condition, so the game, RPG Maker MZ and old saves all run it
  unchanged. The editor recognises it and reopens it in the dialog; if you edit the script by hand, it
  stays your own Script condition from then on.

## Treasure chests

Quick Event › **Treasure** has **Check Inventory Space** (on by default) and a **Failure Message**.
With it on, an item, weapon or armor chest is built as:

```
◆If：Can Receive Item: #1 Potion × 5
  ◆Set Movement Route：This Event (open the lid)
  ◆Change Items：Potion + 5
  ◆Text：You found treasure!
  ◆Control Self Switch：A = ON
：Else
  ◆Text：You cannot carry all of this item. Make room and try again.
：End
```

When the party is full it gets the message and nothing else: the lid does not open, nothing is given,
Self Switch A stays off, and the chest can be opened again once there is room. Gold chests are
unchanged (gold has its own cap). Untick the box to build the chest exactly as before.

## Existing chests, conversations and plot items

Nothing already on a map changes. To protect an existing chest, or a reward given in a conversation,
put a Can Receive branch around the commands that open and give it, and put the self switch (or
whatever marks the reward as taken) **inside** the branch. If the switch is set before or outside the
branch, a blocked reward is lost for good.

Plot items get no special treatment: there is no plot-item category, and Key Items are not exempt.
Decide for each event. Put a story reward inside a Can Receive branch when it must not be lost, and
give the player another chance to collect it. Put it outside the branch when the scene must go on
regardless; then the reward is cut off at the cap, as it always was.

Shops, battle drops, quest rewards and plain Change Items commands keep their current behaviour,
including the cutoff at the cap.
