'use strict';
// modern algebra's Change Party Order (as Thrall carries it, on its own Gamepad keys): the page keys turn the party on the map.
module.exports = () => ({
    key: 'thrallPartyOrder', detect: /ORDER_FREEZE_SWITCH_ID\s*=[\s\S]*Gamepad\.trigger\?\(Gamepad\.pgdn\)[\s\S]*actors\.unshift/, plugin: 'RR_ThrallPartyOrder'
});
