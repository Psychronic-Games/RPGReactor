'use strict';
// Neon Black's Lockpicking: Lockpick.start(difficulty[, lock variable]) opens the lockpicking screen, and the
// event waits for it (the screen change stops the interpreter until the map returns).
module.exports = {
    key: 'neonLockpick', detect: /\$imported\["CP_LOCKPICK"\]|class Lockpick < Scene_MenuBase/, plugin: 'RR_NeonLockpick',
    modules: { Lockpick: { start: 'this.rrLockpickStart?.(%*)' } }
};
