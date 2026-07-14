# RPG Reactor 0.94.9: Instant Fills

RPG Reactor 0.94.9 continues the editor performance push from 0.94.8, driven directly by user reports on very large maps.

## Whole-map bucket fills in a blink

Bucket-filling a huge area on a 256×256 map painted correctly — after 30 to 40 seconds of frozen editor. The flood fill itself was never the problem (it finishes in under 0.2s); the time went to applying 131,000 tile updates one at a time, each one re-walking the water-animation bookkeeping list. Massive updates now take the same streaming path as map loading: the visible viewport repaints instantly, the rest fills in quietly in the background, and the bookkeeping is batched. Measured on the same map, the same fill now blocks the editor for about a quarter of a second.

## Your scroll position stays put

Undo, redo, and giant fills used to snap the view back to the map's top-left corner after re-rendering. The editor now preserves your scroll position through all of them, so you stay exactly where you were working.

## About those undo reports

We chased the "paint bucket doesn't undo" reports to their root: on 0.94.5–0.94.7, pressing undo while a large map was still streaming in let the in-flight background fill repaint pre-undo tiles over the restored map — the undo genuinely applied to your map data, but the screen showed stale tiles until the map was reloaded. The 0.94.8 loading rework already eliminated this; if you're seeing it, update from 0.94.5 and it's gone. This release adds a related safeguard so full re-renders always rebuild their layer caches from scratch.

## A deep audit, top to bottom

We also ran a full audit across the editor, runtime, and compatibility layers — seven subsystems, every finding verified against the actual code before it was touched — and fixed the ~25 most serious results in this release. Highlights: project files are now written atomically so a crash mid-save can never destroy your data; deploying a game saves first (it could silently ship stale builds); autotile passability edits in the Tileset database actually take effect in game (they were landing on the wrong flag slots since the feature shipped); If/Else and Show Choices authored in Reactor route correctly at runtime (branch markers carried the wrong indents); database Cancel really cancels; two unbounded texture leaks that grew forever during long play sessions are closed; and MZ battles no longer hide battlers behind the battleback when MV plugin compatibility is active. The remaining verified findings are tracked in the repository's audit backlog.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
