# RPG Reactor Release Checklist

This checklist is ordered. Do not publish artifacts from a dirty checkout,
from a different commit than the release tag, or from an unsigned candidate
run. Public editor releases use NW.js 0.107.0 exactly.

## 1. Repository Configuration

Configure the GitHub `release` environment with required reviewers if desired.
Do not commit any of these values.

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

Start from the commit intended for `vX.Y.Z`. Replace `0.95.0` below with the
exact `editor/package.json` version.

```bash
git status --short
git fetch origin
git switch --detach origin/main
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
node -e "const p=require('./editor/package.json'); if(p.version!=='0.95.0') process.exit(1)"
```

The test suite statically rejects hard dependencies on ignored local projects.
The distribution worker copies the tracked Reactor One project from
`template/Demo`, preserves its authored content and plugin configuration, and
refreshes its Reactor runtime files from the staged runtime.

## 4. Optional Unsigned Candidate

Unsigned candidates are for inspection only and cannot pass publication
verification:

```bash
gh workflow run release-candidate.yml \
  -f version=0.95.0 \
  -f publishable=false
gh run list --workflow release-candidate.yml --limit 5
```

The equivalent local command may only build the host platform:

```bash
node editor/build-scripts/release-editor.cjs \
  --target linux --mode candidate --version 0.95.0 \
  --output-root "$PWD/dist-editor/releases"
```

Use targets `linux`, `windows`, `macos`, and `web`. Desktop targets are rejected
on non-matching hosts. Each target gets a fresh
`dist-editor/releases/v0.95.0/<target>/` directory and an
`artifact-manifest-<target>.json` containing byte sizes and SHA-256 hashes.

## 5. Publishable Candidate

Create the tag on the exact validated commit, then run the signed candidate:

```bash
git tag -s v0.95.0 -m "RPG Reactor 0.95.0"
git push origin v0.95.0
gh workflow run release-candidate.yml \
  --ref v0.95.0 \
  -f version=0.95.0 \
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

- `version` is `0.95.0`, `nwjsVersion` is `0.107.0`, and `sourceCommit` is the tag commit.
- `mode` is `publish`; Windows/macOS have `signed: true`.
- `releaseBuild` is true and `starter` is `bundled-demo`.
- Every listed size and SHA-256 matches the adjacent file.
- Archives include `THIRD_PARTY_NOTICES.md` with bundled component credits and license details.
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
2. Confirm About/package version is `0.95.0`.
3. Open the bundled Reactor One Demo and verify its maps, database, plugins, music, images, and effects are present.
4. Create and save a new project outside the extracted application directory.
5. Playtest that project using the package's internal NW.js runtime.
6. Close and reopen the project, then make one desktop deployment.
7. Open the Web ZIP over HTTPS or localhost, edit Reactor One, reload, and confirm browser persistence and Playtest.

Do not continue if Windows signature status, macOS notarization, starter
contents, save/reopen, or playtest fails.

## 8. GitHub And itch.io Publication

The Release workflow accepts the successful publishable candidate run ID. It
checks that the run is the `Release Candidate` workflow, downloads its four
artifacts, verifies all manifests against the checked-out tag, and calls
`gh release create --verify-tag`. It does not run the build worker.

```bash
gh workflow run release.yml \
  -f version=0.95.0 \
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
gh release delete v0.95.0 --yes
```

If the tag points to the wrong commit, delete the remote tag only after the
Release is removed and before announcing the version:

```bash
git push origin :refs/tags/v0.95.0
git tag -d v0.95.0
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
