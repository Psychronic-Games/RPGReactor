# Editor changelog

- Opus music loops at its loop points (runtime 20261115.1). An Ogg Opus file plays as `.ogg`, but its `LOOPSTART`/`LOOPLENGTH` tags were never read, because the Ogg reader looked only for Vorbis headers, so every Opus track looped from the very start to the very end. The runtime now reads them from the `OpusTags` comments, converting at the source sample rate the file's header records (48 kHz when it records none), including comments that continue across pages, as they do behind cover art. `LOOP_START`/`LOOP_END`, an end sample in place of a length and the pair other tools and soundtrack rips write, is read too, from Opus and FLAC alike; `LOOPLENGTH` wins when a file has both.
- An Opus loop counted at 48 kHz under a header recording another rate now lands where it was tagged when the recorded rate cannot be right (runtime 20261115.3). Some taggers count in Opus's own 48 kHz samples whatever the header says, so once the whole track is decoded, a loop that would end past the track at the recorded rate but fits at 48 kHz is read at 48 kHz; when both fit, the recorded rate still holds. The Audio Player applies the same rule once the track's length is known. Found on a real `opusenc` file whose header records 44100 and whose loop is exactly the track's length at 48 kHz.
- Ogg Vorbis loop tags are read the way Opus and FLAC tags are (runtime 20261115.2): names in any case (`loopstart=` used to be ignored, so the track looped from its start), `LOOP_START`/`LOOP_END` as well as `LOOPSTART`/`LOOPLENGTH`, and comments behind a large embedded picture, which used to be missed past the first Ogg page. A file cut off partway through its comment header while still downloading no longer reads past the end of the buffer. In the Audio Player these tracks already looped at their tags; now the game does too, which changes how a game shipped with such tracks sounds. The older scan still runs on a comment header with no loop found, so files tagged in its other layout keep working. Across the 789 `.ogg` files in a large project and the Demo, 771 read exactly as before; every one that changed now matches the Audio Player.
- The Audio Player previews an Opus track looping where the game loops it, reading the same tags at the same rate. Deploy Game's audio compression leaves Opus files as they are instead of re-encoding them to Vorbis, which cost quality on a file already as compact and could move its loop: FFmpeg decodes Opus at 48 kHz but copied loop points counted at the source rate unchanged. A `LOOP_START`/`LOOP_END` pair on a Vorbis or FLAC file is written into the compressed OGG as `LOOPSTART`/`LOOPLENGTH`, and an encode that loses it is refused. New guide: [Audio formats and loop points](../docs/AUDIO-LOOP-POINTS.md), covering which files the game finds, each format's loop tags, making a looping Opus track with `opusenc`, and what changed for older games and tools.
pr/skill-costs-card
- Database › Skills has a **Costs** card when the project enables VisuStella Skills and States Core: one row for each skill cost type the plugin's Skill Cost Types parameter defines (HP, Gold, Potion, and any a project adds), with the amount, a value / % choice where the type reads both, and its Maximum and Minimum. Item costs are a list with Add and Delete, picked by name from Items, Weapons and Armors. Everything is kept in the Note as the notetag the plugin already reads (`<Gold Cost: 100>`, `<HP Cost: 5%>`, `<Item Cost: 3 Potion>`), changed where it stands; MP and TP as a value are the Invocation fields themselves, the same number in both places, and as a % they are a notetag the plugin adds on top of that field; the card says so under its table. A form is offered only when the cost type's own pattern reads the card's tag back, so a type written another way is listed with a count of its tags and no fields. Opening a skill writes nothing. Without the plugin there is no card.
=======
- A party member who leaves the battle line mid-fight, for example captured or banished by a state that hides them, disappears from the battlefield instead of standing there with their last pose (runtime 20261113.1). Clearing a sprite's bitmap assigned a new texture frame, which Pixi v8 never applies, so the sprite kept drawing the old image; it now returns to an empty texture of its own. Status window, target lists and turn order were already right.
main
- For plugin authors: two methods on `Game_Enemy` to replace instead of working around. `rrActionPatterns()` returns the action patterns an enemy chooses from, and the turn-based, Action and Tactical battle modes now all read them through it, so a plugin that gives an enemy other skills changes one method and every mode follows. `rrEquipSource()` returns the rows an enemy's equipment is first read from, so a plugin can equip an enemy from somewhere other than its database entry. Both return the database lists by default, so nothing changes for a project without such a plugin. (runtime 20261112.1)

The full technical list, one file per release or labeled development checkpoint, newest first. The short version of each release is in the [root changelog](../CHANGELOG.md).

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
