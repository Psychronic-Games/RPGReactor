# RPG Reactor 0.94.3: Web Editor and Reliable Downloads

RPG Reactor 0.94.3 adds a browser-hosted edition of the editor and makes large deployment downloads visible and resilient from start to finish.

## Run the editor on the Web

Deploy Editor now includes a provider-neutral **Web** target. The generated root-level ZIP can be hosted on any HTTPS website, with `localhost` supported for development. It bundles the real RPG Reactor editor and Reactor One rather than a static demonstration or game-only export.

Reactor One opens automatically. Mutable maps, database records, project metadata, and plugin configuration are stored per site in IndexedDB, while normal project assets remain in the hosted package. Playtest opens inside the page and reads the latest browser-saved data through a service-worker overlay. A visible Reset control clears local edits and restores the bundled project.

Desktop-only project selection, deployment, process launching, and native-tool actions are hidden or disabled in the browser. Browser asset paths are translated to hosted URLs so map, database, event, audio, and secondary preview surfaces do not depend on desktop `file://` access.

## Downloads that stay alive and visible

Large NW.js SDK downloads now allow a three-minute socket-idle window, retry transient failures up to three times, and remove incomplete temporary files before another attempt. Build workers prefer the host's native curl transport when available, avoiding an NW.js worker-thread networking case where a valid HTTPS request opened but delivered no archive bytes. The verified Node HTTPS implementation remains the fallback.

Every runtime, codec, FFmpeg, and AppImage-tool download now has one live inline progress row. Known-size downloads show percentage and transferred/total MiB; chunked responses show transferred MiB with an activity bar. Retry, completion, and failure states update the same row instead of flooding the log or leaving a deployment window looking frozen.

## Packaging polish

The optional AppImage control now appears directly beneath Linux only when Linux output is selected. Existing Linux folders and ZIPs remain unchanged, and AppImage creation remains opt-in.

The Web editor package, persistence cycle, saved-data Playtest, hosted image/audio paths, service-worker scope, ZIP integrity, and SHA-256 output were exercised in Chromium. The complete Node suite also covers the native downloader's atomic output, progress reporting, retries, and cleanup behavior.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
