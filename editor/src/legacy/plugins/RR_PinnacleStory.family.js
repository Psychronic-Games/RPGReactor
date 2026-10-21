'use strict';
// Pinnacle - The Five Kingdoms: its message window, choice list, interpreter and character edits, and the
// story values its events keep on actors (affection, flags, homeland, gender). The calls its events make into
// them. The kingdom (DataManager's text lookup, total_production, the Troop table) and GTBS have families of
// their own.

const EVENT_LEVEL_DATA = '({ 1: [13, 14, 15, 16, 17, 18], 2: [13, 14, 15, 23, 22, 22], 3: [13, 13, 25, 16, 16, 24], 6: [13, 24, 24, 25, 36, 36] })';

module.exports = () => ({
    key: 'pinnacleStory', detect: /module Variable\b[\s\S]*def self\.reset_message_settings\b/, plugin: 'RR_PinnacleStory',
    requires: ['RR_YanflyMessage', 'RR_HimeChoices'],
    event: {
        check_flag: ['(this.rrCheckFlag?.(%0, %1) ?? false)', 'bool'],
        'in_room?': ['(this.rrInRoom?.() ?? false)', 'bool'],
        event_level_data: [EVENT_LEVEL_DATA, 'any'],
        need_loclines: ['false', 'bool']
    },
    modules: {
        Variable: {
            reset_message_settings: 'window.RRPinnacleStory?.resetMessageSettings()',
            message_rows: ['(window.RRPinnacleStory?.messageRows() ?? 5)', 'number'],
            message_width: ['(window.RRPinnacleStory?.messageWidth() ?? Graphics.width)', 'number']
        }
    },
    members: {
        'actor.flags': ['($.rrFlags?.() ?? [])', 'array'],
        'actor.affection': ['($.rrAffection?.() ?? 0)', 'number'],
        'actor.maxaffection': ['($.rrMaxAffection?.() ?? 100)', 'number'],
        'actor.homeland': ['($.rrHomeland?.() ?? "")', 'string'],
        'actor.gender': ['($.rrGender?.() ?? 3)', 'number'],
        'temp.last_choice': ['$gameTemp.rrLastChoice?.()', 'number']
    },
    objects: {
        actor: { set_gender: '$.rrSetGender?.(%0)' },
        character: {
            tile_in_front: '$.rrTileInFront?.()', tile_in_back: '$.rrTileInBack?.()', tile_to_right: '$.rrTileToRight?.()', tile_to_left: '$.rrTileToLeft?.()',
            clockwise_dir: '$.rrClockwiseDir?.(%0)', counterclockwise_dir: '$.rrCounterclockwiseDir?.(%0)', reverse_dir: '$.reverseDir(%0)',
            prominent_tile: '$.rrProminentTile?.()', can_reach: '$.rrCanReach?.(%0)', dir_distance: '$.rrDirDistance?.(%0)', 'event_clear?': '$.rrEventClear?.(%0, %1, %2)'
        }
    },
    setters: {
        'actor.flags': '$.rrSetFlags?.(%v)',
        'actor.affection': '$.rrSetAffection?.(%v)',
        'actor.maxaffection': '$.rrSetMaxAffection?.(%v)',
        'actor.homeland': '$.rrSetHomeland?.(%v)',
        'actor.gender': '$.rrSetGender?.(%v)',
        'temp.last_choice': '$gameTemp.rrSetLastChoice?.(%v)'
    }
});
