# RPG Reactor 0.94.8: Big Maps Without the Wait

RPG Reactor 0.94.8 makes the editor fast where it hurt most: giant maps. Loading, painting regions, and previewing animations are all dramatically snappier, measured against the largest maps in our test corpus.

## Large maps load in a quarter of the time

A 256×256 compatibility-project map with roughly 131,000 placed tiles took around 10 seconds to finish loading. The visible viewport always appeared instantly — the time went to the background fill, which streamed the off-screen tiles straight into the live scene, so every frame re-rendered the ever-growing, uncached map (over a second per frame near the end) and starved its own loader. Off-screen tiles now build in detached containers the renderer never sees, then attach and cache layer by layer. The same map now fully loads in about 2.5 seconds, and the editor stays responsive the whole time.

## Full frame rate on maps with water

Animated water previously kept the entire ground layer "live" — on a big water map that meant a quarter-million sprites re-rendered every frame, forever, just to keep 2,000 water tiles animating. Water now renders in small dedicated overlay layers (stacking and shadow order unchanged), so every static layer caches as a texture. Measured editor frame time on Map 850 dropped from 24ms to 13ms — with all the water still animating.

## Region painting at full speed

Bucket-filling a region across a large map froze the editor for about 5 seconds — and every subsequent paint froze it again. The region overlay was rebuilding the whole map after each paint, rendering a fresh number label for every single cell. Region cells now share one pre-rendered image per region ID, and painting updates only the cells you touched. The freeze is gone.

The region area tools also preview properly now: dragging a rectangle shows the region color over the selection (it was outline-only), and the circle tool shows region-colored cells (it previously showed nothing at all).

## Animation previews that don't stutter

Animation playback in the database — the Animations page player, the Skills/Items/Weapons picker, and the event editor's picker — was paced by a timer that drifted and fired late whenever the editor was busy, so previews juddered and time-stretched. All three now step against the display clock at the exact MV 15fps cadence: a busy moment skips ahead instead of slowing the animation, and sound-effect cues stay in sync.

## And the little things

Repainting shadows no longer stacks invisible duplicates that darkened them a little more each time, switching maps mid-load can no longer leak the old map's tiles into the new one, and the playtest save-failure message is localized in all 18 editor languages.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
