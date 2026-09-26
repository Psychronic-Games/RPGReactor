'use strict';
// Vlue's Sleek Item Popup: popup(type, id, amount, …) in Script commands, and $PU_AUTOMATIC_POPUP.
module.exports = {
    key: 'vlueItemPopup', detect: /\$imported\[:Vlue_SleekPopup\]\s*=\s*true/, plugin: 'RR_VlueItemPopup',
    event: { popup: 'this.rrPopup?.(%*)' },
    globals: { $PU_AUTOMATIC_POPUP: ['window.rrPuAutomaticPopup', 'any'] },
    setters: { $PU_AUTOMATIC_POPUP: 'window.rrPuAutomaticPopup = %v' }
};
