# Pull request integration — 2026-09-06

Local merge `b38ee87` combines development at `deb92e0` with GitHub
`origin/main` at `853734b`. The incoming changes are already merged on GitHub:

- [#47 — Plugin parameter controls](https://github.com/Psychronic-Games/RPGReactor/pull/47): array rows wrap their action buttons without obscuring Browse; text parameters gain the existing text-code menu and icon/color previews.
- [#48 — Trait explanations](https://github.com/Psychronic-Games/RPGReactor/pull/48): themed hover help and dropdown explanations, with notes naming enabled plugins found assigning relevant prototype methods.
- [#46 — Passive States](https://github.com/Psychronic-Games/RPGReactor/pull/46) still appears open, but its implementation commit `5961354` is already included in #48's merged history. The cards appear only with the required VisuStella plugin enabled and edit its notetags through normal database fields. No plugin or project configuration was enabled by this integration.

The only merge conflict was `editor/index.html`: preserve the local action
Element/Quest modules and add incoming TraitHelp. Incoming translations and
PluginManager changes merge with the working changes. Plugin detection is a
source-pattern scan, not an analysis of arbitrary plugin behavior; translations
arrived as a machine-assisted pass pending native review.

## Voice command follow-up

Runtime `20260906.3` and SpeakModel3DEditor now handle voice and lip animation
only. Speaker/text controls and runtime message queue/wait coupling are removed.
For simultaneous dialogue, turn off **Wait for voice to finish** and follow the
voice command with **Show Text**. Legacy text arguments are ignored and omitted
when saving that command; existing authored event files are not rewritten.
The tracked Demo runtime matches the canonical changed files.

## Verification

- Focused speech and incoming PR tests: **56 passed**.
- Full Node suite: **2,798 passed / 6 failed / 2,804 total**. Revision assertions were updated from the older runtime stamp to `20260906.3`.
- Native speech editor: all 14 themes, no text/speaker fields or duplicate audio controls, picker roundtrip/Cancel, actual mascot markers and mouth preview.
- Native PR integration: passive-state add/delete, narrow array controls and reorder, text-code preview, and real-pointer trait hover/help dismissal (`editor/tests/smoke/nw-pr-integration.cjs`).
- Native game speech: actual mascot, decoded pitched waveform, silence, completion/reset and interpreter wait release.

Remaining full-suite failures are the existing German/French lighting loanword
check, ignored local projects with older bundled runtimes, three authored Demo
stock-interface baseline mismatches, and a stale source-pattern assertion for
prop Delete ownership in `event-editing-3d.test.cjs`. The relevant Delete code
and its test are unchanged by this integration. This is not a fully green
release build.

Logs: `/tmp/rr-sept6-focused.log`, `/tmp/rr-sept6-full-final.log`,
`/tmp/rr-sept6-speech-editor.log`, `/tmp/rr-sept6-speech-runtime.log`,
`/tmp/rr-sept6-pr-native.log`.

## Preservation

The merge commit contains incoming PR changes and the script-list resolution;
existing working changes and the voice follow-up remain uncommitted. A safety
stash `dcaca60298305e8f833cbdb73d231155990187c6` retains the pre-merge tracked
working changes, including voice-only edits. An exact-byte backup of all 128
then-modified/untracked files is `/tmp/rr-before-pr-integration-20260906.tar`,
with its SHA-256 manifest alongside it. Git's line-ending normalization was
reversed for the three otherwise untouched CRLF files. No remote push was made.

## Six-failure cleanup and PR #46 diagnosis

The follow-up reproduced all six failures before changing anything: **36 passed /
6 failed** across the four affected test files (`/tmp/rr-six-before.log`).

- Stock-interface tests now use a fixed 1280×720 System fixture, independent of the editable Demo. The party layout lookup targets the current actor panel. The former requirement that authored Demo interfaces equal freshly generated defaults is replaced by a database-load regression: missing interfaces are seeded in memory, while existing authored names/layouts survive reload after a resolution change without rewriting their file.
- The German `Name` and French `Fluorescent` labels are recognized by the existing per-locale identical-word allowlist. Other missing translations still fail validation.
- The obsolete Delete-key source expression check is removed. Direct shortcut-handler tests continue to cover props and lights, Delete/Backspace, repeated keys, text inputs and modal ownership.
- The canonical runtime was synchronized to all 13 local template projects: 144 stale/missing files updated. All 21 existing plugin manifests remain byte-for-byte unchanged. Previous destination files are backed up at `/tmp/rr-runtime-sync-backup-20260906.tar`.

The final focused selection passes **50/50**, including runtime synchronization.
The final full Node suite passes **2,804/2,804, zero failures**
(`/tmp/rr-six-full-final.log`).
Logs: `/tmp/rr-six-focused-final.log` and `/tmp/rr-six-runtime-sync.log`.

PR #46's current head is `fefa9a629b4ef056810c5c1418ce07643a6c93ea`.
Its stable patch ID and the included `5961354` commit's patch ID are identical:
`ced2011eace322b98daec04ca3144dc8d7316cf2`. `git cherry origin/main origin/pr-46`
marks the commit as already applied. A read-only `git merge-tree --write-tree
origin/main origin/pr-46` reproduces exactly one conflict, in
`editor/CHANGELOG.md`; every other merged file equals `origin/main`.

Recommendation: close #46 as already included through #48. If reconciling its
branch instead, retain the current main changelog, including both its plugin
text-code and passive-state entries. There is no additional implementation to
merge. No PR comments, branch pushes or remote state changes were made.
