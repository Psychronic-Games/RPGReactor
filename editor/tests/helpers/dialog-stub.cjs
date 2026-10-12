/**
 * A stand-in for the editor's themed dialog (RRDialog, utils/Dialog.js) in a
 * vm context: it answers from the `alert`, `confirm` and `prompt` stand-ins a
 * test already passes as globals, so a test that records notices in `alert`
 * or answers questions with `confirm` keeps doing so for code that asks
 * through RRDialog. A question nobody answers is answered no.
 */
'use strict';

function themedDialogFrom(globals = {}) {
    return {
        alert: async message => { if (typeof globals.alert === 'function') globals.alert(message); },
        confirm: async message => (typeof globals.confirm === 'function' ? !!globals.confirm(message) : false),
        prompt: async (message, options = {}) => (typeof globals.prompt === 'function' ? globals.prompt(message, options.value) : null)
    };
}

module.exports = { themedDialogFrom };
