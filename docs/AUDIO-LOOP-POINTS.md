# Audio formats and loop points

How the game finds an audio file, where each format keeps the point a track loops back to, and how to make a looping Opus track. Everything here is what the runtime reads today; the editor's Audio Player reads the same tags the same way, so a preview loops where the game will, except for the two Vorbis cases under [Known gaps](#known-gaps).

## Which files the game finds

A sound is stored in the database by name only, without an extension. The game asks for `<name>.ogg` and, on desktop, looks on disk in this order before loading: `.ogg`, `.mp3`, `.wav`, `.flac`, `.m4a`, the requested one first (`Utils.AUDIO_EXTENSIONS` and `Utils.resolveAudioExtension` in `runtime/reactor_core.js`). In a web build a failed request walks the same list. The editor's audio pickers (event commands, Database tabs, animation sounds, and plugin parameters and commands with an `@dir audio/...` folder) list the same five extensions.

No other extension is found anywhere, including `.opus`. An Opus file plays as soon as it is renamed to `.ogg`: a `.opus` file already is an Ogg file, so the rename changes nothing inside it.

Every place the game plays audio goes through the same loader, so a format that plays as one kind of sound plays as all of them: BGM, BGS, ME and SE from events and the System tab, animation sound timings, battle-room effects, and plugins that call `AudioManager`, such as voice-line plugins.

## Where each format keeps its loop

The loop is two numbers counted in samples: where the loop starts, and how long it is. When playback reaches start + length it jumps back to start. A track with no loop tags loops from its very start to its very end.

| Format | Where the loop lives | Tag names | Sample rate the numbers are counted at |
| --- | --- | --- | --- |
| Ogg Vorbis | comment header | `LOOPSTART`, `LOOPLENGTH`, in capitals | the identification header |
| Ogg Opus | `OpusTags` comments | `LOOPSTART`/`LOOPLENGTH`, or `LOOP_START`/`LOOP_END`; any case | the original sample rate `OpusHead` records; 48000 when it records none |
| FLAC | `VORBIS_COMMENT` block | as Opus | `STREAMINFO` |
| MP3 | ID3v2 `TXXX` frames | `LOOPSTART`, `LOOPLENGTH`; any case | the first MPEG frame header |
| WAV | sampler (`smpl`) chunk, first loop | the loop's start and end | the format (`fmt `) chunk |
| M4A | no loop convention; the whole track loops | | |

`LOOP_END` is the sample the loop ends at, not a length, so the loop is end − start. When a file carries both pairs, `LOOPLENGTH` wins. The same rule holds for an Opus file and a FLAC file, which share one comment reader.

Only BGM and BGS loop. ME and SE play once, and their loop tags are ignored. A track inside a [music sequence](../editor/README.md#audio-player) also plays once, because the sequence decides what follows it; a sequence that is a single plain track is ordinary BGM and keeps its loop.

## Making a looping Opus track

1. Measure the loop in the file you are about to encode, in samples, not seconds. In Audacity, set the selection toolbar to samples; in a WAV editor that writes sampler loops, read the loop's start and end.
2. Encode with `opusenc` from [opus-tools](https://opus-codec.org/downloads/), naming the output `.ogg` and writing the two tags:

   ```bash
   opusenc --comment LOOPSTART=264600 --comment LOOPLENGTH=1323000 theme.wav theme.ogg
   ```

3. Check it with `opusinfo theme.ogg`. The comments list should show both tags, and `Original sample rate` should be the rate of the WAV you measured in. `opusenc` writes the source file's rate there, which is what makes the numbers line up.
4. Put `theme.ogg` in `audio/bgm/` (or `audio/bgs/`) and pick it as usual.

**The one thing that breaks an Opus loop** is numbers counted at one rate in a file whose header records another. Opus always decodes at 48 kHz, but the runtime converts the loop at the original rate the header records, because that is the rate a tool working from the source counted in. A file converted from an already-tagged file by a tool that resamples to 48 kHz and copies the old tags unchanged can end up recording 48000 while its numbers still count 44100 samples a second, and then the loop lands about 9% early. `opusinfo` shows both the tags and the recorded rate, so it is the check.

Opus files exported from another game or tool usually work as they are once renamed to `.ogg`, including those tagged `loop_start`/`loop_end`.

## Opus elsewhere in the engine

- **Desktop builds** decode Opus natively. A browser that cannot play Ogg at all uses the runtime's bundled fallback decoder, which only decodes Vorbis, so Opus does not play there; Vorbis does.
- **The Forge's Sound Effect Generator** saves its `.ogg` exports as Opus.
- **Deploy Game's audio compression** leaves Opus files as they are. Re-encoding them to Vorbis would cost quality on a file already as compact, and moved or dropped the loop: FFmpeg decodes Opus at 48 kHz but carried loop numbers counted at the original rate over unchanged, and `LOOP_START`/`LOOP_END` is not read from Vorbis. Vorbis, MP3 and M4A are still re-encoded; WAV and FLAC still become Vorbis, with a WAV's sampler loop and a FLAC's `LOOP_START`/`LOOP_END` pair written out as `LOOPSTART`/`LOOPLENGTH`, the tags the Vorbis reader takes.
- **Encrypted audio** is decrypted before its loop is read, so encryption changes nothing above.

## Known gaps

Both are in the runtime's Ogg Vorbis reader, which still scans a single page for the comment header; the Opus reader does not have either.

- **Vorbis tag names must be in capitals.** The game ignores `loopstart=`; the editor preview accepts it and loops where the game will not.
- **Vorbis tags behind a large embedded picture are missed.** Cover art big enough to push the comments past the first Ogg page (tens of kilobytes) hides the tags from the game, while the preview still finds them. Put the tags before the picture, or keep the art small.
