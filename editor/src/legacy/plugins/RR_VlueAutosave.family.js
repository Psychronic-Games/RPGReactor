'use strict';
// Vlue's Basic Autosave: saves to file 0 after transfers (and battles). $auto_save turns it off for the session;
// DataManager.save_game(n), the call the script makes, saves from an event too.
module.exports = {
    key: 'vlueAutosave', detect: /AUTOSAVE_ON_MAP\s*=[\s\S]*def post_transfer\b/, plugin: 'RR_VlueAutosave',
    globals: { $auto_save: ['("rrAutoSave" in window ? window.rrAutoSave : true)', 'bool'] },
    setters: { $auto_save: 'window.rrAutoSave = %v' },
    modules: {
        DataManager: {
            save_game: ['(window.rrSaveGame?.(%0) ?? false)', 'bool'],
            'save_file_exists?': ['DataManager.isAnySavefileExists()', 'bool']
        }
    }
};
