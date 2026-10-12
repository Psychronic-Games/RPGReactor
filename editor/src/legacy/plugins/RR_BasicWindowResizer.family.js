'use strict';
// V.M.'s Basic Window Resizer (VX/Ace): Resolution.resize(w, h) sets the game window's size through Win32.
module.exports = {
    key: 'basicWindowResizer', detect: /class Resolution\b[\s\S]{0,800}?SetWindowPos[\s\S]{0,800}?def self\.resize\b/, plugin: 'RR_BasicWindowResizer',
    modules: { Resolution: { resize: 'Graphics.rrResolutionResize?.(%0, %1)' } }
};
