'use strict';
// Thrall's edits to VX's own windows (Window_Base's faces as 16 px strips, rarity colours in item names) and the
// menu windows built on them. It installs where the game's Window_Base is, before the ports that draw through it.
module.exports = () => ({
    key: 'thrallWindows', detect: /def draw_face\(face_name, face_index, x, y, size = 96\)[\s\S]{0,300}?face_index \/ 4 \* 16/, plugin: 'RR_ThrallWindows'
});
