'use strict';
// Marc's Message Queue: $game_map.queue is the banner's list of notes.
module.exports = () => ({
    key: 'thrallMessageQueue', detect: /class Marc_Queue < Sprite_Base/, plugin: 'RR_ThrallMessageQueue',
    members: { 'map.queue': ['($.rrMessageQueue?.() ?? [])', 'array'] }
});
