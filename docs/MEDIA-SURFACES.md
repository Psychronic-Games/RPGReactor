# Media surfaces

Media surfaces display images or video on maps, 3D models, or the screen.
The **Media Surfaces** toolbar tool manages map-owned surfaces. Event commands
are displayed as **Show Media Surface**, **Transform Media Surface**, and
**Stop Media Surface**.

A model's media surface can show a different picture or movie per variant, or be off: Database › 3D Models › Variants, the variant's Effects tab.

Effects are placed on the model once; each variant chooses which it wears. On an effect's card, **Shown in** is All variants or the chosen ones. On a variant's card, the **Effects** tab lists every effect: tick to show it in this variant, pick the picture or movie this variant shows on a media surface, press **Place** to move it on the model with the variant still worn, press **+** to add a media surface only this variant wears. In `model.json` an effect's `variants` lists the variants that wear it (`""` is the model's own look); with no list every variant wears it. A media surface shows on its own only when Play when is not On demand.

Select an effect's row under Effects and its card opens at the preview's upper right with four tabs. Effect: type, media, what it follows, when it plays, sound. Offset: drag an arrow, or drag the surface itself across the model. Rotate: drag a ring. Scale: drag an edge for width or height, a corner for both; a light shows its reach as a ring; an animation has one handle. Each drag is one undo step. **Save effect** writes it.

Drag a corner freely to reshape/resize a surface; hold Shift to preserve its
proportions. Shift can be pressed or released during the drag. In the 3D panel,
**Keep Proportions** links width/height and scale controls independently of
that corner-drag shortcut. Newly selected media takes its actual image/video
aspect ratio, keeping the longest surface dimension at the current size.
Opening a saved surface preserves its authored dimensions. To refit an existing
surface to the source ratio, turn Keep Proportions off and back on. Uncheck it
for independent width/height or scale adjustments. Move arrows and rotation
rings edit the live pose.

A normal corner drag changes only that corner. Width/height and the standing
anchor stay fixed while editing a quad; they define the base surface frame.
Shift scales the shape around its opposite corner. In 3D, the edited quad is
saved and used by map rendering and Battle Room media, including scanlines.
Older surfaces retain their rectangular 3D appearance until a corner is edited.

## Implementation names

Use the media names in new editor/runtime code:

| Purpose | Current name | Legacy alias |
| --- | --- | --- |
| Shared editor | `editor/src/event/commands/MediaSurfaceEditor.js`, `MediaSurfaceEditor` | `VideoSurfaceEditor` and its CommonJS file path |
| Map/screen previews | `editor/src/MediaSurfacePreviewManager.js`, `MediaSurfacePreviewManager` | `VideoSurfacePreviewManager` and its CommonJS file path |
| Preview instance on reactor/controller | `mediaSurfacePreviewManager` | `videoSurfacePreviewManager` getter/setter |
| Pop-out panel | `editor/media-surface-panel.html` | Internal file path changed; not serialized |
| Runtime module | `runtime/reactor_media_surfaces.js` | Already used this module name |
| Runtime API | `RPGReactorMediaSurfaces` | `RPGReactorVideoSurfaces` |
| Runtime owner/manager classes on that API | `MediaSurfaceOwner`, `MediaSurfaceManager` | `VideoSurfaceOwner`, `VideoSurfaceManager` |

Aliases point to the same constructor, API or manager instance. They do not
create duplicate preview systems. The editor loads the canonical scripts;
legacy module files are small CommonJS forwarding wrappers, and canonical
scripts also expose the old browser globals. The map toolbar's editor-side
`MediaSurfaceManager` is distinct from the runtime manager on the runtime API.

## Existing project compatibility

The rename does not migrate saved project data. Continue accepting and writing
existing `RPGReactor` command IDs `ShowVideoSurface`, `TransformVideoSurface`,
and `StopVideoSurface`. These stable IDs are separate from the Media Surface
labels shown to users. Existing command encodings and sparse transforms keep
their original serialized shape.

The save key `_reactorVideoSurfaces`, interpreter wait mode/fields, existing
preview preference keys/events, DOM hooks and descriptor fields such as `movie`
also retain their existing names. The `movie` field can hold a supported image
path as well as a video path. Actual video-only playback objects remain named
`video`; they are HTML video elements, not generic surface owners.

Optional `worldCorners` stores the independently edited 3D quad as four
normalized local coordinates in TL, TR, BR, BL order. Omitting it keeps the
existing rectangle and does not reinterpret legacy 2D `corners`. Sparse
transforms preserve it; setting it to null resets the 3D shape. The runtime
validates the quad and copies it independently when applying transforms.

The Node suite covers the legacy import/API/command contracts, stationary
unselected corners, quad persistence and geometry
(`editor/tests/video-surface-*.test.cjs`, `map-media-surfaces.test.cjs`,
`media-surface-proportions.test.cjs`); `editor/tests/smoke/nw-media-surface-toolbar.cjs`
drives the toolbar in NW.js.
