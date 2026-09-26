'use strict';
// Plugin parameters for RR_GalvMusicPlayer from the game's copy of Galv's Basic Music Player (Galv_Music_Player::
// AUDIO_FOLDER, the switches, menu options, icons, OPTIONS_WIDTH and vocabulary), and which options its
// Window_Music_Options lists (games comment some out).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const VOCAB = ['PLAY_SELECTED', 'SET_BATTLE', 'SET_VEHICLE', 'SET_BOAT', 'SET_SHIP', 'SET_AIRSHIP', 'SET_ALL', 'RESTORE_DEFAULTS', 'STOP_MUSIC'];

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["Music_Player"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => (constants['Galv_Music_Player::' + name] === undefined ? d : constants['Galv_Music_Player::' + name]);
    const n = (name, d) => String(Number(k(name, d)) || 0);
    // The options, in the order make_command_list adds them, skipping lines commented out.
    const body = (/class Window_Music_Options\b[\s\S]*?def make_command_list([\s\S]*?)\n\s*end\b/.exec(source) || [, ''])[1];
    const commands = [];
    for (const line of body.split('\n')) {
        const m = /^\s*add_command\([^,]+,\s*:(\w+)/.exec(line);
        if (m) commands.push(m[1]);
    }
    const vocab = {};
    for (const key of VOCAB) if (constants['Galv_Music_Player::' + key] !== undefined) vocab[key] = String(constants['Galv_Music_Player::' + key]);
    return {
        fromFolder: String(String(k('AUDIO_FOLDER', 'Audio/BGM/')) !== ''),
        mapBgmSwitch: n('MAP_BGM_SWITCH', 0),
        addToMenu: String(k('ADD_TO_MENU', false) === true),
        menuVocab: String(k('MENU_VOCAB', 'Music')),
        enableMenuSwitch: n('ENABLE_MENU_SWITCH', 0),
        musicIcon: n('MUSIC_ICON', 0),
        battleBgmIcon: n('BATTLE_BGM_ICON', 0),
        vehicleBgmIcon: n('VEHICLE_BGM_ICON', 0),
        vehicleIcons: JSON.stringify(['BOAT_ICON', 'SHIP_ICON', 'AIRSHIP_ICON'].map(name => Number(k(name, 0)) || 0)),
        optionsWidth: n('OPTIONS_WIDTH', 280),
        commands: JSON.stringify(commands.length ? commands : ['play_track', 'set_battle_music', 'set_vehicle_music', 'restore_defaults', 'stop_music']),
        vocab: JSON.stringify(vocab)
    };
}

module.exports = { extract };
