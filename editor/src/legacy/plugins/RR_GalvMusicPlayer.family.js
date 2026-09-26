'use strict';
// Galv's Basic Music Player: its scene and the four event calls.
module.exports = {
    key: 'galvMusicPlayer', detect: /\$imported\["Music_Player"\]\s*=\s*true/, plugin: 'RR_GalvMusicPlayer',
    event: {
        add_music: 'this.rrAddMusic?.(%0)', 'know_music?': ['(this.rrKnowMusic?.(%0) ?? false)', 'bool'],
        play_last: 'this.rrPlayLast?.()', restore_bgm: 'this.rrRestoreBgm?.()'
    },
    classes: { Scene_MusicPlayer: 'Scene_RRMusicPlayer' }
};
