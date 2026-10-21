'use strict';
// Plugin parameters for RR_PinnacleStory from Pinnacle's own edits: Variable.reset_message_settings, the
// message window's line height and slide, the choice list's height limit and the fast-text setting.

function extract({ scripts = [] } = {}) {
    const find = (re) => scripts.find(s => re.test(s)) || '';
    const yea = find(/def self\.reset_message_settings\b/);
    const resetBody = (/def self\.reset_message_settings\b([\s\S]*?)\n\s*end\b/.exec(yea) || [, ''])[1];
    const reset = [...resetBody.matchAll(/\$game_variables\[(\d+)\]\s*=\s*(-?\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    const fiber = (/def fiber_main\b([\s\S]*?)\n  end\b/.exec(yea) || [, ''])[1];
    const slide = Number((/self\.offset\s*=\s*(\d+)/.exec(fiber) || [, 0])[1]);
    const step = Number((/self\.offset\s*-=\s*(\d+)/.exec(fiber) || [, 6])[1]);
    const message = find(/class Window_Message < Window_Base[\s\S]*def line_height\s*\n\s*return\s+\d+/);
    const lineHeight = Number((/def line_height\s*\n\s*return\s+(\d+)/.exec(message) || [, 0])[1]);
    const typing = find(/Fiber\.yield unless[^\n]*\$game_settings\[:\w+\]\s*==\s*1/);
    const fast = (/Fiber\.yield unless[^\n]*\$game_settings\[:(\w+)\]\s*==\s*1/.exec(typing) || [, ''])[1];
    const choices = find(/class Window_ChoiceList < Window_Command[\s\S]*def update_placement/);
    // The last update_placement in script order is the one the game runs (Choice Options' copy).
    const placements = scripts.filter(s => /class Window_ChoiceList\b[\s\S]*def update_placement/.test(s));
    const placement = placements.length ? placements[placements.length - 1] : choices;
    const choiceVariable = Number((/Graphics\.height\s*-\s*\(?\s*\$game_variables\[(\d+)\]\s*\*\s*24/.exec(placement) || [, 0])[1]);
    return {
        resetVariables: JSON.stringify(reset),
        slide: String(slide),
        slideStep: String(step),
        lineHeight: String(lineHeight),
        fastTextSetting: fast,
        choiceRowsVariable: String(choiceVariable)
    };
}

module.exports = { extract };
