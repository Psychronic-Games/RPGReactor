'use strict';
// Plugin parameters for RR_FollowerEventTouch from the game's copy of the script (TH::Follower_Event_Touch::Disable_Switch).

function extract({ constants = {} } = {}) {
    const id = constants['TH::Follower_Event_Touch::Disable_Switch'];
    return { disableSwitch: String(Number.isInteger(id) ? id : 0) };
}

module.exports = { extract };
