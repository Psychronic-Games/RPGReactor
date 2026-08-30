# RPG Reactor Release Checklist

This checklist is ordered. Do not publish artifacts from a dirty checkout,
from a different commit than the release tag, or from an unsigned candidate
run. Public editor releases use NW.js 0.107.0 exactly.

## 1. Repository Configuration

Configure the GitHub `release` environment with required reviewers if desired.
Do not commit any of these values.

Local maintainer tools:

- Git, Node.js 22 or newer, npm, curl, and the GitHub CLI (`gh`).
- Run `gh auth status` before using the workflow or release commands below. If
  `gh` is unavailable, use the equivalent controls in the GitHub Actions and
  Releases web interfaces.

Repository variables:

- `ITCH_PROJECT`: itch target in `account/project` form, for example `psychronic/rpg-reactor`.
- `WINDOWS_TIMESTAMP_URL`: optional Authenticode RFC 3161 endpoint. The build defaults to `http://timestamp.digicert.com`.

Repository secrets used by the Release Candidate workflow:

- `WINDOWS_CERTIFICATE_BASE64`: base64-encoded code-signing PFX.
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX password.
- `MACOS_CERTIFICATE_BASE64`: base64-encoded Developer ID Application PKCS#12 file.
- `MACOS_CERTIFICATE_PASSWORD`: PKCS#12 password.
- `MACOS_KEYCHAIN_PASSWORD`: temporary CI keychain password.
- `MACOS_SIGNING_IDENTITY`: full Developer ID Application identity.
- `APPLE_ID`: Apple account used by `notarytool`.
- `APPLE_TEAM_ID`: Apple Developer team ID.
- `APPLE_APP_PASSWORD`: app-specific password for notarization.

`release` environment secret:

- `BUTLER_API_KEY`: required only when publishing to itch.io. It may instead be a repository secret.

For a local macOS publish build, `MACOS_NOTARY_PROFILE` may replace
`APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_PASSWORD` after creating a profile:

```bash
xcrun notarytool store-credentials rpg-reactor-notary \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD"
export MACOS_NOTARY_PROFILE=rpg-reactor-notary
```

For a local Windows publish build, set `WINDOWS_CERTIFICATE_PATH` to the PFX
file and `WINDOWS_CERTIFICATE_PASSWORD` to its password. `signtool.exe` must be
on `PATH` unless `WINDOWS_SIGNTOOL` names its full path.

## 2. NW.js Hash Verification

The release CLI hard-codes NW.js `0.107.0`, passes `nwVersionPolicy=exact` and
`releaseBuild=true`, and reads `editor/build-scripts/release-hashes.json`.
It disables bundled-runtime reuse, so release jobs can use only an archive
cache entry or upstream download that matches the trusted manifest digest.
The six populated SHA-256 values were copied from the upstream
<https://dl.nwjs.io/v0.107.0/SHASUMS256.txt>, not calculated from downloads
made by the release build:

```text
588e8bf6a64e8a63d95a77c9af77c0df68a2cd464efe0ee5317954e10f6f68c3  nwjs-v0.107.0-linux-x64.tar.gz
6492d21a1d38bc012de1f194712ab3a46c7d844b0943bb85e051682de7323253  nwjs-v0.107.0-osx-x64.zip
0db62fa39d4ccd1a6e4490539952426eb59baaa301dea56b25e730c4535bf123  nwjs-v0.107.0-win-x64.zip
454c1257445ed834dc126848aea5e72a72dfc2a910fd3eafed376bb4b8fbe9b7  nwjs-sdk-v0.107.0-linux-x64.tar.gz
e1344a94d52cdc5bcba9344dae6c57e7032b926dd806694962dd1c6efa966e9b  nwjs-sdk-v0.107.0-osx-x64.zip
926c5529a2714a05a3d2f5b9e1f66de64e8375f80a50fa7cbbeb620fcb77234e  nwjs-sdk-v0.107.0-win-x64.zip
```

Compare the file without modifying it:

```bash
git diff -- editor/build-scripts/release-hashes.json
curl --fail --location https://dl.nwjs.io/v0.107.0/SHASUMS256.txt
```

## 3. Clean-Checkout Validation

Validate the commit intended for `vX.Y.Z` from a clean checkout. Replace
`0.98.4` below with the exact `editor/package.json` version. This validation
does not create the tag; the source-release command in section 5 owns the
release commit and tag.

```bash
git status --short
git fetch origin
git merge-base --is-ancestor origin/main main
git switch --detach main
cd editor
npm ci --ignore-scripts
cd ..
node .github/scripts/check-syntax.cjs
cd editor
npm test
npm audit
cd ..
git diff --check
git diff --exit-code
test -z "$(git status --porcelain=v1 --untracked-files=all)"
node -e "const p=require('./editor/package.json'); if(p.version!=='0.98.4') process.exit(1)"
```

The test suite statically rejects hard dependencies on ignored local projects.
The distribution worker copies the tracked Reactor One project from
`template/Demo`, preserves its authored content and plugin configuration, and
refreshes its Reactor runtime files from the staged runtime.
The current 0.98.4 baseline is **1,954 Node tests**;
retain older counts only where a document clearly labels a historical release.

When the optional authored-project compatibility corpus is present locally,
also verify that every project carries the candidate runtime:

```bash
node editor/build-scripts/sync-runtime.cjs --check
```

Run the real editor smokes with matching browser and SDK drivers before the
candidate is cut. CI performs the persistence checks in its `gui-smokes` job;
the UI-layout smoke remains a local release gate:

```bash
cd editor
npm run smoke:web
npm run smoke:nw -- --nw-root="/path/to/nwjs-sdk-v0.107.0"
npm run smoke:nw-ui -- --nw-root="/path/to/nwjs-sdk-v0.107.0"
```

The Web smoke proves Save waits for IndexedDB and survives reload. The NW.js
smoke launches the actual editor and verifies a native project save without
initializing map rendering. The read-only NW.js UI smoke opens the tracked Demo
without saving, verifies the closed contained Inspector drawer at 1280x720, and
checks the three-column layouts at 1600x900, 1920x1080, and 2560x1440. The first
two smokes run in CI's `gui-smokes` job; `smoke:nw-ui` is currently a local
release gate.

For Haven (`template/Project3`), clear the playtest console, enter a battle that
uses its encounter Pixelate filter, and confirm battle-background capture
completes without a shader error. In particular, there must be no undeclared
`filterArea`, `Could not initialize shader`, or repeated
`useProgram: program not valid` messages. This manual corpus check supplements
the tracked filter-translation and snapshot regressions; release CI must not
depend on ignored project files being available.

Before that smoke test, open Haven through the candidate editor and confirm its
`project.rpgreactor` `engineVersion` and the version marker at the top of
`js/reactor_main.js` both advance to `0.98.4`, while `js/reactor_plugins.js`
remains unchanged. This verifies the project is executing the candidate runtime
rather than a stale copied corescript.

On a large Haven map, walk diagonally in both directions while watching the map
edges and layered structures. Confirm there is no blank or partial tilemap frame
or transient fold along the horizontal seams of tall objects, and that
`$reactorTilemapStats.backend` remains `mesh` with no fallback reason. This
supplements the tracked camera-order, atomic repaint, and single-preparation
tests.

## 4. Optional Unsigned Candidate

Unsigned candidates are for inspection only and cannot pass publication
verification:

```bash
gh workflow run release-candidate.yml \
  -f version=0.98.4 \
  -f publishable=false
gh run list --workflow release-candidate.yml --limit 5
```

The equivalent local command may only build the host platform:

```bash
node editor/build-scripts/release-editor.cjs \
  --target linux --mode candidate --version 0.98.4 \
  --output-root "$PWD/dist-editor/releases"
```

Use targets `linux`, `windows`, `macos`, and `web`. Desktop targets are rejected
on non-matching hosts. Each target gets a fresh
`dist-editor/releases/v0.98.4/<target>/` directory and an
`artifact-manifest-<target>.json` containing byte sizes and SHA-256 hashes.

## 5. Source Release And Publishable Candidate

Return to a clean `main` worktree at the validated commit. Do not create the tag
manually: `cut-release.cjs` is the canonical path and creates an annotated tag
after finalizing both changelogs and the other version surfaces.

```bash
git switch main
git pull --ff-only origin main
git status --short
node editor/build-scripts/cut-release.cjs 0.98.4 --dry-run
node editor/build-scripts/cut-release.cjs 0.98.4
```

The second command runs the full test suite again, finalizes the release date
and test count, creates a release commit when needed, creates `v0.98.4`, and
pushes the branch and tag. The tag starts **Publish Release**, which publishes
the source release from the matching root changelog section. Wait for that run
and verify the tag before starting signed builds:

```bash
gh run list --workflow publish-release.yml --limit 5
gh run watch SOURCE_RELEASE_RUN_ID
gh release view v0.98.4
test "$(git rev-parse v0.98.4^{commit})" = "$(git rev-parse origin/main)"
```

Run the signed candidate from that immutable tag:

```bash
gh workflow run release-candidate.yml \
  --ref v0.98.4 \
  -f version=0.98.4 \
  -f publishable=true
gh run list --workflow release-candidate.yml --limit 5
gh run watch RUN_ID
```

`publishable=true` makes the CLI use publish mode. It rejects tracked,
untracked, or ignored-status-visible source changes, requires the package
version to match, and enforces native signing credentials. The Windows build
sets app-owned product/file metadata, signs `RPG Reactor.exe`, and runs
`signtool verify /pa`. The macOS build sets
`games.psychronic.rpgreactor`, bundle display/version metadata, signs with the
hardened runtime, submits to Apple, staples, and verifies with `codesign`,
`stapler`, and `spctl` before the final ZIP is created.

## 6. Artifact Inspection

Download the candidate without changing it:

```bash
rm -rf /tmp/rpg-reactor-candidate
gh run download RUN_ID --dir /tmp/rpg-reactor-candidate
sha256sum /tmp/rpg-reactor-candidate/*/*
```

Inspect every `artifact-manifest-*.json` and confirm:

- `version` is `0.98.4`, `nwjsVersion` is `0.107.0`, and `sourceCommit` is the tag commit.
- `mode` is `publish`; Windows/macOS have `signed: true`.
- `releaseBuild` is true and `starter` is `bundled-demo`.
- Every listed size and SHA-256 matches the adjacent file.
- Archives include `THIRD_PARTY_NOTICES.md` with bundled component credits and license details.
- Every desktop archive built with native codecs contains `rpg-reactor-codec.json`, `RPG_REACTOR_CODEC_NOTICE.txt`, and the complete `FFmpeg-LGPL-2.1.txt`; verify the recorded NW.js version, archive/binary SHA-256 values, immutable `nwjs-ffmpeg-prebuilt` build revision, corresponding FFmpeg source revision, and patent notice. Build once with codecs disabled and confirm a clean official runtime is used with none of those overlay files present.
- Minimal and Web archives contain no native codec overlay or codec metadata.
- The Web archive contains the tracked bundled Reactor One Demo starter.

Platform inspection commands:

```powershell
signtool verify /pa /v "RPG Reactor.exe"
Get-AuthenticodeSignature "RPG Reactor.exe" | Format-List
```

```bash
codesign --verify --deep --strict --verbose=2 "RPG Reactor.app"
spctl --assess --type execute --verbose=2 "RPG Reactor.app"
xcrun stapler validate "RPG Reactor.app"
```

## 7. Smoke Tests

On each actual target OS, extract into a new directory and perform these tests:

1. Launch the editor without a console error or signing warning.
2. Confirm About/package version is `0.98.4`.
3. Open the bundled Reactor One Demo and verify its maps, database, plugins, music, images, and effects are present.
4. On Reactor One, check 3D, orbit the rendered map, uncheck 3D, confirm the 2D map is intact, then check 3D again. Repeat this on physical Windows and the other desktop targets; the process must remain alive throughout.
5. Create and save a new project outside the extracted application directory.
6. Playtest that project using the package's internal NW.js runtime.
7. Close and reopen the project, then make one desktop deployment.
8. Launch the packaged editor twice and confirm two independent editor processes open with different `nw.App.dataPath` values; closing either process must leave the other running.
9. Open the Web ZIP over HTTPS or localhost, edit Reactor One, toggle 3D off/on, reload, and confirm browser persistence and Playtest.
10. In Resource Manager, import a small valid model into a new nested name and confirm it creates only `source/<original-case filename>` plus empty `textures/`; retry the same destination and confirm the existing folder is untouched. Confirm `.blend` gives export guidance and existing 3D resources still cannot be deleted.
11. Load representative PNG, JPG/JPEG, WebP, SVG, and GIF images through converted battleback, parallax, enemy-detail, title, animation, event character/face, Change Actor/Vehicle Image, System 1 vehicle, Picture, and Reactor UI Picture paths, then playtest. Confirm explicit extensions persist, extensionless PNG resolves, and GIF animates. Do not infer support for tilesets, plugin fields, database actor/list thumbnails, Reactor UI character/face/party-face/System/Title/Icon sources, balloons, or fixed sheets such as IconSet; those retain PNG contracts.
12. Author Show/Transform/Stop Video Surface on 2D and 3D maps. Verify screen/map/event/player anchors and direct move. Verify PIXI projective corner warp with Z and Depth acting in 3D only (Z = elevation, Depth = toward the camera); verify the 3D-screen DOM preview reshapes/clips without claiming perspective-correct pixels; verify rectangular Three.js world placement, Z, and world-camera culling in preview. Confirm every editor preview draws the authored scanlines and PIXI/DOM previews omit culling, while playtest applies authored screen-pixel PIXI or world-distance Three.js culling. Confirm numeric synchronization, playback/audio/wait/stop, exact source navigation, and preview cleanup after cancel/map/project changes.
13. Repeatedly switch actor/model previews and close/reopen their modal. Confirm no blank stale preview, duplicate cold-render stall, resize loop, or accumulating WebGL contexts.
14. Inspect the SVG toolbar set in dark and light themes at normal desktop width and a narrow Web layout. Confirm Fill reads as a pouring bucket, Shadow Pen reads as applying darkness rather than sparks, Undo/Redo are an unmistakable mirrored pair, disabled states remain legible, every tool fits at supported desktop widths, and Web horizontal scrolling reaches every tool. Base desktop overflow remains unchanged and is not claimed to scroll.

Do not continue if Windows signature status, macOS notarization, starter
contents, save/reopen, or playtest fails.

## 8. GitHub And itch.io Publication

The Release workflow accepts the successful publishable candidate run ID. It
checks that the run is the `Release Candidate` workflow, downloads its four
artifacts and verifies all manifests against the checked-out tag. When the tag
workflow has already created the source release, it attaches those files with
`gh release upload --clobber` and preserves the changelog notes. If that release
is absent, it recovers with `gh release create --verify-tag`. It does not run
the build worker.

If recovery creates the release because **Publish Release** did not run, rerun
**Publish Release** with version `0.98.4` before announcing the release. That
replaces generated fallback notes with the authoritative changelog section.

```bash
gh workflow run release.yml \
  -f version=0.98.4 \
  -f candidate_run_id=RUN_ID \
  -f publish_itch=false
gh run watch RELEASE_RUN_ID
```

After checking the GitHub Release, itch publication can be included in the
same release run by setting `publish_itch=true`. The verified archive files
downloaded from the candidate run are passed directly to butler with these
explicit mappings:

| Candidate target | itch channel |
|---|---|
| Linux x64 | `linux-x64` |
| Windows x64 | `windows-x64` |
| macOS x64 | `macos-x64` |
| Web | `web` |

The destination is `${ITCH_PROJECT}:<channel>`, and `BUTLER_API_KEY` is read
only from the workflow environment. GitHub and itch receive the same verified
archive bytes; there is no rebuild between destinations. The workflow pins
butler 15.29.0 and verifies the downloaded archive against the recorded
SHA-256 before executing it.

## 9. Rollback

If publication is wrong but artifacts are not compromised, mark the GitHub
Release as a draft or delete it and use the itch dashboard to select the prior
build on each channel. Do not reuse the version or silently replace assets.

```bash
gh release delete v0.98.4 --yes
```

If the tag points to the wrong commit, delete the remote tag only after the
Release is removed and before announcing the version:

```bash
git push origin :refs/tags/v0.98.4
git tag -d v0.98.4
```

Correct the source, increment the version, rerun the complete checklist, and
produce a new candidate. Treat leaked signing/notarization/itch credentials as
compromised and rotate them immediately.

## 10. Post-Release Validation

1. Download every GitHub asset and compare its SHA-256 with the published target manifest.
2. Install/download every itch channel and repeat the minimum launch smoke test on its target.
3. Confirm the GitHub tag and all four manifests identify the same commit and version.
4. Confirm Windows still reports a valid timestamped signature after download.
5. Confirm macOS Gatekeeper accepts the downloaded app and the ticket is stapled.
6. Confirm the Web channel loads over HTTPS and service-worker persistence works.
7. Update release links and version statements only after these checks pass.
