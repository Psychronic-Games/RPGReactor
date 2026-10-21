'use strict';
// Pinnacle's edits to VX Ace's windows and menus (Window_Base's drawing, the menu, status, help, item, skill,
// equipment, shop, gold and save windows). No calls of their own: the kingdom's family covers the shop's.
module.exports = {
    key: 'pinnacleWindows', detect: /def draw_actor_affection\(actor, x, y, width = 124\)[\s\S]*def draw_centered_actor_graphic\(actor,x,y\)|def draw_centered_actor_graphic\(actor,x,y\)[\s\S]*def draw_actor_affection\(/,
    plugin: 'RR_PinnacleWindows', requires: ['RR_PinnacleKingdom']
};
