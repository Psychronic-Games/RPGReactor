'use strict';
// Plugin parameters for RR_ZeusFullscreen: the virtual key the game's copy of Fullscreen++ polls
// (GetAsyncKeyState(116) is F5; the script's notes say F11).

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /\[:Zeus_Fullscreen\]\s*=\s*__FILE__/.test(s));
    const m = text && /def update_fullscreen[\s\S]*?GetAsyncKeyState\((\d+)\)/.exec(text);
    return m ? { keyCode: m[1] } : {};
}

module.exports = { extract };
