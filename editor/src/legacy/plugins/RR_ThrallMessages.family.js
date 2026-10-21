'use strict';
// STR22 MWEXT++ as Thrall carries it (its edit places the name window 133 px under a top message):
// $game_message.maxlineex and the script's other message settings in Script commands.
module.exports = () => ({
    key: 'thrallMessages', detect: /@name_d_window\.y = a \+ N_WINDOW_XY\[1\] \+ 133/, plugin: 'RR_ThrallMessages',
    members: {
        'message.maxlineex': ['($.rrMaxLines?.() ?? 4)', 'number'],
        'message.unlock': ['!!$._rrUnlock', 'bool'],
        'message.pos_autoset': ['($._rrPosAutoset ?? true)', 'bool'],
        'message.mes_move': ['!!$._rrMesMove', 'bool'],
        'message.mapstop': ['!!$._rrMapStop', 'bool'],
        'message.event_id': ['($._rrEventId ?? 0)', 'number'],
        'message.xywh': ['$', 'rrMessageRect']
    },
    objects: { rrMessageRect: { set: '$.rrSetXywh?.(%*)' } },
    setters: {
        'message.maxlineex': '$.rrSetMaxLineEx?.(%v)',
        'message.unlock': '$.rrSetUnlock?.(%v)',
        'message.pos_autoset': '$.rrSetPosAutoset?.(%v)'
    }
});
