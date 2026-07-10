# RPG Reactor 0.94.2: Safer Saves and Better Deployments

RPG Reactor 0.94.2 focuses on trust: projects save through one checked path, playtests stay isolated, and deployment gives you more control without changing your source assets.

## MV compatibility is now in every project

The RPG Maker MV compatibility layer developed during 0.94.1 now ships in the public runtime and loads before project plugins. It only fills APIs that are missing, so pure MZ projects are unaffected. This also fixes the Demo's New Game crash caused by an MV RenderTexture compatibility call passing an invalid resolution into PixiJS 8, and valid MZ Skip commands (`code 109`) now display correctly in Common and Troop Events.

## Safer projects and playtests

Save Project and Save All now share one checked path for the current map, database, project metadata, and map list. Write failures reach the UI instead of appearing successful, and moving between maps or projects offers save, discard, or cancel when work is pending.

Each project also receives a Reactor-managed NW.js playtest profile on Windows, macOS, and Linux. A deployed game or another project's running profile can no longer prevent Playtest from launching.

## Deployment you can control

Game and editor deployment now search packaged runtimes and every cache before downloading NW.js. You can choose the latest stable release, match the editor, or search validated exact versions by version or release date. Game and editor output paths are remembered separately.

Desktop game packages can retain only the Chromium runtime locales you select, with English always preserved as a fallback. This reduces package size without touching your project's translation files. Linux editor packages are now symlink-preserving ZIP archives, matching the Windows and macOS distribution convention.

Both Deploy Game and Deploy Editor can optionally add a portable Linux x86_64 AppImage while retaining the normal Linux game folder and editor ZIP. The option is available when building on Linux x86_64 and is off by default. RPG Reactor downloads immutable `appimagetool` and Type 2 runtime assets on first use, verifies their pinned SHA-256 hashes, caches them separately, preserves NW.js permissions and symlinks, and includes desktop metadata, icons, and the AppImage runtime license.

For projects that need H.264 or AAC playback, game and full editor deployments can optionally install an exact-version `nwjs-ffmpeg-prebuilt` codec. The codec is separately cached, checked against GitHub release SHA-256 metadata, constrained to the expected platform binary, and never enabled by default. Codec patent and royalty obligations vary by jurisdiction and distribution; RPG Reactor grants no patent license.

## Optional staged asset optimization

Deploy Game can losslessly recompress PNG images with Oxipng and can re-encode OGG Vorbis audio at a selected quality. Optimization runs only on temporary staged copies: source-project assets are never modified, and a result replaces the staged file only when it is valid and smaller. RPG Maker `LOOPSTART` and `LOOPLENGTH` comments are preserved.

OGG optimization uses a pinned, SHA-256-verified FFmpeg executable kept in a separate cache with its GPL license and provenance. Per-file logging and progress keep large projects visibly moving. The PNG path uses the single-thread Oxipng WASM codec supported by NW.js build workers.

## Editor workflow polish

- `F5` opens a themed warning before reloading the editor without cache, because unsaved changes will be lost.
- `F11` toggles native fullscreen.
- Effekseer Layers sit beside the preview when space allows and stack below it on narrow windows. Opacity now affects animated alpha curves, and keyframe selection, adding, deleting, frame edits, Start Frame, and layer timing stay synchronized.
- Outfit Forge options remain visible, Character Generator supports both current and legacy PNG-parts paths, and Forge save dialogs follow the active project.

## Release reliability

Clean source clones now generate a complete runtime-valid starter project without inheriting Demo plugins. GitHub Actions verifies syntax, runtime manifests, generated projects, save safety, deployment staging, NW.js acquisition, locales, codecs, asset optimization, shortcuts, playtest isolation, and web deployment.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
