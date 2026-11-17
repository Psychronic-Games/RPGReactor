# Editor changelog

- **Audio: `.opus` files play without being renamed (runtime 20261117.1).** The game, the editor and Deploy Game take Ogg Opus under the `.opus` extension that `opusenc` and FFmpeg write, beside `.ogg .mp3 .wav .flac .m4a`. The runtime tries it last (`Utils.AUDIO_EXTENSIONS`), so a folder holding both `Theme.ogg` and `Theme.opus` still plays `Theme.ogg`, and a web build's failed request reaches it after `.m4a`. Every audio picker, the Audio Player, the Resource Manager and the music sequence preview list it, and the vehicle sound checks find it. The Resource Manager imports it, as `.opus_` in a project with encrypted audio, and an encrypted `.opus_` previews in the editor as `audio/ogg`. Web builds serve it as `audio/ogg`. Deploy Game encrypts it to `.opus_` with the other sounds and never re-encodes it: like Opus named `.ogg`, it ships as it is. Audio command names also lose a `.flac` or `.opus` extension now, and the Pinnacle GTBS scene's sound check finds `.flac` and `.opus`. Tested in `tests/opus-extension.test.cjs`. RPG Maker MZ asks for `.ogg` only, so a project that must also play there should keep its Opus files named `.ogg` ([guide](../docs/AUDIO-LOOP-POINTS.md)).
- The Audio Player shows a folder's subfolders the way the audio file picker and the Resource Manager do: as collapsible sections above the folder's own tracks, each with its file count, and its tracks listed by their own names. It used to list every file from a subfolder among the root tracks as `Folder/Name`, filed under the folder's initial. The rail jumps to a folder as well as to a letter, the folder holding the loaded track starts open, and folders stay as they were left when switching between BGM, BGS, ME and SE.

The full technical list, one file per release or labeled development checkpoint, newest first. The short version of each release is in the [root changelog](../CHANGELOG.md).

- [0.99.6](changelog/0.99.6.md) - 2026-11-16
- [0.99.5](changelog/0.99.5.md) - 2026-11-12
- [0.99.4](changelog/0.99.4.md) - 2026-11-02
- [0.99.3](changelog/0.99.3.md) - 2026-10-29
- [0.99.2](changelog/0.99.2.md) - 2026-10-25
- [0.99.1](changelog/0.99.1.md) - 2026-10-24
- [0.99.0](changelog/0.99.0.md) - 2026-10-12
- [0.98.9](changelog/0.98.9.md) (unreleased checkpoint; continued in 0.99.0)
- [0.98.8](changelog/0.98.8.md) - 2026-09-28
- [0.98.7](changelog/0.98.7.md) - 2026-09-21
- [0.98.6](changelog/0.98.6.md) - 2026-09-14
- [0.98.5](changelog/0.98.5.md) - 2026-09-07
- [0.98.4](changelog/0.98.4.md) - 2026-08-31
- [0.98.3](changelog/0.98.3.md) - 2026-08-24
- [0.98.2](changelog/0.98.2.md) - 2026-08-16
- [0.98.1](changelog/0.98.1.md) - 2026-08-11
- [0.98.0](changelog/0.98.0.md) - 2026-08-10
- [0.97.0](changelog/0.97.0.md) - 2026-08-03
- [0.96.0](changelog/0.96.0.md) - 2026-07-27
- [0.95.0](changelog/0.95.0.md) - 2026-07-20
- [0.94.8](changelog/0.94.8.md) - 2026-07-13
- [0.94.7](changelog/0.94.7.md) - 2026-07-13
- [0.94.5](changelog/0.94.5.md) - 2026-07-12
- [0.94.4](changelog/0.94.4.md) - 2026-07-11
- [0.94.3](changelog/0.94.3.md) - 2026-07-10
- [0.94.2](changelog/0.94.2.md) - 2026-07-10
- [0.94.1](changelog/0.94.1.md) - 2026-07-05
- [0.94](changelog/0.94.md) - 2026-06-27
- [0.93.1](changelog/0.93.1.md) - 2026-06-21
- [0.93.0](changelog/0.93.0.md) - 2026-06-21
- [0.91](changelog/0.91.md) - 2026-06-18
- [0.9.0](changelog/0.9.0.md) - 2026-05-31
- [0.8.0](changelog/0.8.0.md) - 2026-05-24
- [0.7.0](changelog/0.7.0.md) - 2026-02-15
- [0.6.0](changelog/0.6.0.md) - 2026-02-14
- [0.5.0](changelog/0.5.0.md) - 2026-02-14
- [0.4.5](changelog/0.4.5.md) - 2026-02-14
- [0.1.0](changelog/0.1.0.md) - 2024-11-18
