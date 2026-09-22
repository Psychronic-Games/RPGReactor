# Pull request integration — 2026-09-05

Integrated GitHub `origin/main` at `f6150b2` with local development at
`32e127c`. The histories contained 8 remote-only and 43 local-only commits.
Both pull requests were already merged on GitHub, and both PR heads had
passing clean-checkout and GUI-smoke jobs:

- [#44 — State descriptions and UI gauge fix](https://github.com/Psychronic-Games/RPGReactor/pull/44)
- [#45 — Forge Project Tools](https://github.com/Psychronic-Games/RPGReactor/pull/45)

The only textual merge conflict was in `editor/src/I18nManager.js`; both the
local BGM-sequence translations and incoming Project Tools keys were retained.
The merge preserves the local development history and does not change the
owner's uncommitted Fleagus model, System settings, or project metadata.

## Verification

The combined tree's full Node suite reports **2,655 passed, 3 failed**. All
three failures are the previously recorded `stock-interfaces.test.cjs` Demo
resolution/baseline mismatches; no additional failures appeared. Syntax checks
passed for 1,077 source JavaScript files, and patch whitespace checks passed.
The full suite includes the incoming state-description, Project Tools, and
gauge regressions, plus canonical/bundled runtime consistency.

The native NW.js save smoke passed on Chromium 144.0.7559.59. The Web
persistence smoke passed on retry, including IndexedDB persistence and reload;
its first attempt timed out in a WebDriver request. The retry only added
request tracing to the harness, without changing application code.

Local logs: `/tmp/rr-pr-integration-full.log`,
`/tmp/rr-pr-integration-nw.log`, `/tmp/rr-pr-integration-web.log`, and
`/tmp/rr-pr-integration-web-retry.log`.
This remains a development tree with known failures, not a release candidate.

## Project Tools findings — fixed in the September 5 follow-up

These were reproduced against a disposable filesystem fixture and left open
by the initial integration. The subsequent bug-fix pass resolves both:

1. **A subsequent editor save can overwrite a tool's saved changes.**
   The original bridge replaced JSON on disk without updating the loaded
   database. The bridge now starts tools from working data and saves through
   `DatabaseManager.saveJSON`, updating the loaded record, invalidating stale
   callbacks, and retaining normal atomic writes and `System.versionId`
   updates. A subsequent editor save preserves the tool result. Other database
   drafts remain intact; the normal writer also saves System settings when
   advancing the version.
2. **Image path containment follows symlinks outside the image tree.**
   The original bridge returned the contents of an `img/linked.png` symlink
   pointing outside `img/`. Host reads now reject symlinks in files and parent
   folders, verify canonical containment, and check opened file identity.
   Database access and HTML discovery/opening use the same checks. The iframe
   remains `sandbox="allow-scripts"`; host filesystem checks enforce the
   separate host-side boundary.

Saving requires an initialized tool and unchanged target/System data, both in
memory and on disk. Ownership is checked before and after confirmation. The
Database dialog must be closed before a tool save, preserving its Cancel and
undo contract. Failures retain tool edits as dirty work for retry or ordinary
Save. Each database file is replaced atomically; a failure while updating
System can follow a successful target-file write, so this is not a multi-file
transaction. Browser completion waits for persistence; obsolete completions
cannot mark another project's data clean or reply to a replacement frame.

The follow-up has **27 passing focused regressions**, including the original
overwrite, linked files/directories, a link swap during open, stale drafts,
project/lock changes, partial write failures, retries, and browser flushes.
Real NW.js and browser smokes exercise a synthetic tool in an actual sandboxed
iframe. NW.js also checks database display, Cancel, and a normal Save; the
browser checks virtual image bytes, normal Save, and reload. No downloaded
project tool was executed.

Final full suite: **2,677 passed, 3 failed, 2,680 total**. The three failures
remain the pre-existing Demo interface-layout mismatches. Source syntax,
Markdown links, and patch whitespace checks pass. The owner's three original
Demo edits remain byte-for-byte unchanged.

Reproduce from the repository root:

```sh
node --test editor/tests/project-tools.test.cjs
node editor/tests/smoke/nw-project-tools.cjs
node editor/tests/smoke/web-editor-persistence.cjs --project-tools
```

Follow-up logs: `/tmp/rr-project-tools-focused.log`,
`/tmp/rr-project-tools-fix-tests.log`, `/tmp/rr-project-tools-fix-nw.log`, and
`/tmp/rr-project-tools-fix-web.log`.
