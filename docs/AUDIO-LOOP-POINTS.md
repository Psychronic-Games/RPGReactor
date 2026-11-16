# Audio formats and loop points

How the game finds an audio file, where each format keeps the point a track loops back to, and how to make a looping Opus track. Everything here is what the runtime reads today; the editor's previews (the Audio Player, the audio file picker and the Resource Manager) read the same tags the same way and, where Web Audio is available, loop the decoded track the same way, so a preview loops where, and as cleanly as, the game will.

## Which files the game finds

A sound is stored in the database by name only, without an extension. The game asks for `<name>.ogg` and, on desktop, looks on disk in this order before loading: `.ogg`, `.mp3`, `.wav`, `.flac`, `.m4a`, the requested one first (`Utils.AUDIO_EXTENSIONS` and `Utils.resolveAudioExtension` in `runtime/reactor_core.js`). In a web build a failed request walks the same list. The editor's audio pickers (event commands, Database tabs, animation sounds, and plugin parameters and commands with an `@dir audio/...` folder) list the same five extensions.

No other extension is found anywhere, including `.opus`. An Opus file plays as soon as it is renamed to `.ogg`: a `.opus` file already is an Ogg file, so the rename changes nothing inside it.

Every place the game plays audio goes through the same loader, so a format that plays as one kind of sound plays as all of them: BGM, BGS, ME and SE from events and the System tab, animation sound timings, battle-room effects, and plugins that call `AudioManager`, such as voice-line plugins.

## Where each format keeps its loop

The loop is two numbers counted in samples: where the loop starts, and how long it is. When playback reaches start + length it jumps back to start. A track with no loop tags loops from its very start to its very end.

| Format | Where the loop lives | Tag names | Sample rate the numbers are counted at |
| --- | --- | --- | --- |
| Ogg Vorbis | comment header | `LOOPSTART`/`LOOPLENGTH`, or `LOOP_START`/`LOOP_END`; any case | the identification header |
| Ogg Opus | `OpusTags` comments | as Vorbis | the original sample rate `OpusHead` records; 48000 when it records none, or when the loop only fits the track at 48000 (see [below](#when-an-opus-loop-is-counted-at-48-khz)) |
| FLAC | `VORBIS_COMMENT` block | as Vorbis | `STREAMINFO` |
| MP3 | ID3v2 `TXXX` frames | `LOOPSTART`, `LOOPLENGTH`; any case | the first MPEG frame header |
| WAV | sampler (`smpl`) chunk, first loop | the loop's start and end | the format (`fmt `) chunk |
| M4A | no loop convention; the whole track loops | | |

`LOOP_END` is the sample the loop ends at, not a length, so the loop is end − start. When a file carries both pairs, `LOOPLENGTH` wins. Vorbis, Opus and FLAC share one comment reader, so the same rules hold for all three, and the comments are read whole even when a large embedded picture pushes them across several Ogg pages.

Only BGM and BGS loop. ME and SE play once, and their loop tags are ignored. A track inside a [music sequence](../editor/README.md#audio-player) also plays once, because the sequence decides what follows it; a sequence that is a single plain track is ordinary BGM and keeps its loop.

## Making a looping Opus track

1. Measure the loop in the file you are about to encode, in samples, not seconds. In Audacity, set the selection toolbar to samples; in a WAV editor that writes sampler loops, read the loop's start and end.
2. Encode with `opusenc` from [opus-tools](https://opus-codec.org/downloads/), naming the output `.ogg` and writing the two tags:

   ```bash
   opusenc --comment LOOPSTART=264600 --comment LOOPLENGTH=1323000 theme.wav theme.ogg
   ```

3. Check it with `opusinfo theme.ogg`. The comments list should show both tags, and `Original sample rate` should be the rate of the WAV you measured in. `opusenc` writes the source file's rate there, which is what makes the numbers line up.
4. Put `theme.ogg` in `audio/bgm/` (or `audio/bgs/`) and pick it as usual.

Opus files exported from another game or tool usually work as they are once renamed to `.ogg`, including those tagged `loop_start`/`loop_end`.

### When an Opus loop is counted at 48 kHz

Opus always decodes at 48 kHz, and some taggers count the loop in those samples whatever the header records; a loop finder working on the decoded audio does. So an Opus file whose header says 44100 can hold numbers counted at either rate, and the file alone does not say which.

The runtime reads them at the recorded rate unless that is impossible. Once the whole track is decoded and its length is known, a loop that would end past the end of the track at the recorded rate, but ends within it at 48 kHz, is read at 48 kHz. For example, a 163.09 s track tagged `LOOPLENGTH=7828363` under a 44100 header would end at 177.5 s, so it is read at 48 kHz and ends at the track's end. The editor's Audio Player applies the same rule once the track's length is known.

What it cannot catch is a loop that fits the track at both rates. That is read at the recorded rate, and if it was counted at 48 kHz it lands about 9% late; if a file counted at 44100 has a header recording 48000, it lands about 9% early. `opusinfo` shows both the tags and the recorded rate: when they disagree, re-encode from the WAV with `opusenc`, which records the rate you measured in.

## Opus elsewhere in the engine

- **Desktop builds** decode Opus natively. A browser that cannot play Ogg at all uses the runtime's bundled fallback decoder, which only decodes Vorbis, so Opus does not play there; Vorbis does.
- **The Forge's Sound Effect Generator** saves its `.ogg` exports as Opus.
- **Deploy Game's audio compression** leaves Opus files as they are. Re-encoding them to Vorbis would cost quality on a file already as compact, and could move the loop: FFmpeg decodes Opus at 48 kHz but carries loop numbers counted at the original rate over unchanged. Vorbis, MP3 and M4A are still re-encoded; WAV and FLAC still become Vorbis. A WAV's sampler loop, and a `LOOP_START`/`LOOP_END` pair on Vorbis or FLAC, are written into the output as `LOOPSTART`/`LOOPLENGTH`, and an encode that loses the loop is refused, leaving that file uncompressed.
- **Encrypted audio** is decrypted before its loop is read, so encryption changes nothing above.

## Older games and tools

Before runtime 20261115.2 the game read Ogg Vorbis loops with a narrower scan: tag names only in capitals, no `LOOP_START`/`LOOP_END`, and only comments on the first Ogg page, so a large picture ahead of them hid them. A track that relied on any of those looped from its start, or not where it was tagged, while the editor preview already looped it correctly. Such tracks now loop where they are tagged, which can change how a game that shipped with them sounds. The older scan is still tried on a comment header the new reader finds no loop in, so a file tagged in the older layout it accepted, a name with its number 16 bytes after it, keeps working.

RPG Maker MZ's own corescript (checked against 1.9.0) and older RPG Reactor versions use that narrower scan: capitalised `LOOPSTART`/`LOOPLENGTH` from Ogg Vorbis, and nothing from Opus. For a file that has to loop the same everywhere, use Ogg Vorbis with those two names in capitals, ahead of any embedded picture.
