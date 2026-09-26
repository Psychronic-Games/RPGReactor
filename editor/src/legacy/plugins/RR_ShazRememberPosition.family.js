'use strict';
// Shaz's Remember Event Position: save_pos/forget_pos in move routes (on the event itself) and in Script
// commands on an event ($game_map.events[@event_id].save_pos(...)).
module.exports = {
    key: 'shazRememberPosition', detect: /shaz_mem_position/, plugin: 'RR_ShazRememberPosition',
    route: { save_pos: 'this.rrShazSavePos?.(%*)', forget_pos: 'this.rrShazForgetPos?.()' },
    objects: { character: { save_pos: '$?.rrShazSavePos?.(%*)', forget_pos: '$?.rrShazForgetPos?.()' } }
};
