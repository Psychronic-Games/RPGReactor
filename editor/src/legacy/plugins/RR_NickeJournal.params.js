// Settings for RR_NickeJournal from the game's Simple Journal script.
'use strict';
function extract({ constants }) {
    const n = (key) => (typeof constants[key] === 'number' ? String(constants[key]) : '0');
    return {
        completeVariable: n('NICKE::JOURNAL_SYSTEM::COMPLETE_QUEST_VAR') !== '0' ? n('NICKE::JOURNAL_SYSTEM::COMPLETE_QUEST_VAR') : n('COMPLETE_QUEST_VAR'),
        failVariable: n('NICKE::JOURNAL_SYSTEM::FAILED_QUEST_VAR') !== '0' ? n('NICKE::JOURNAL_SYSTEM::FAILED_QUEST_VAR') : n('FAILED_QUEST_VAR')
    };
}
module.exports = { extract };
