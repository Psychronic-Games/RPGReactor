'use strict';
// Plugin parameters for RR_CscaGameoverOptions from the game's copy of CSCA Game Over Options!
// (CSCA_GAMEOVER_OPTIONS: the command texts and the music and picture variable IDs).

function extract({ constants = {} } = {}) {
    const k = (name, d) => (constants['CSCA_GAMEOVER_OPTIONS::' + name] === undefined ? d : constants['CSCA_GAMEOVER_OPTIONS::' + name]);
    return {
        titleText: String(k('TITLE', 'Main Menu')), loadText: String(k('LOAD', 'Load')), quitText: String(k('QUIT', 'Quit')),
        musicVariable: String(Number(k('GAMEOVER_MUSIC', 0)) || 0), imageVariable: String(Number(k('GAMEOVER_IMAGE', 0)) || 0)
    };
}

module.exports = { extract };
