'use strict';
// Plugin parameters for RR_PinnacleWindows from the game's Scene_Menu (the common events its Story, Create army,
// Disband and Reinforce commands reserve, the rename length), Window_Base#draw_actor_skills (its icon) and
// Window_ShopBuy#price (what each kingdom's coin costs from each homeland).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

function extract({ scripts = [] } = {}) {
    const out = {};
    const menu = scripts.find(s => /class Scene_Menu < Scene_MenuBase[\s\S]*def command_story/.test(s));
    if (menu) {
        const events = {};
        const story = /def command_story\s*\n\s*\$game_temp\.reserve_common_event\((\d+)\)/.exec(menu);
        if (story) events.story = Number(story[1]);
        const create = /def command_create\s*\n\s*\$game_temp\.reserve_common_event\((\d+)\)/.exec(menu);
        if (create) events.create = Number(create[1]);
        for (const sym of ['disband', 'expand']) {
            const m = new RegExp(`when :${sym}[\\s\\S]*?reserve_common_event\\((\\d+)\\)`).exec(menu);
            if (m) events[sym] = Number(m[1]);
        }
        if (Object.keys(events).length) out.commonEvents = JSON.stringify(events);
        const rename = /SceneManager\.scene\.prepare\(@actor\.actor_id,\s*(\d+)\)/.exec(menu);
        if (rename) out.renameLength = rename[1];
    }
    const base = scripts.find(s => /def draw_actor_skills\(actor,x,y\)/.test(s));
    const icon = base && /def draw_actor_skills\(actor,x,y\)\s*\n\s*draw_icon\((\d+)/.exec(base);
    if (icon) out.troopIcon = icon[1];
    const shop = scripts.find(s => /class Window_ShopBuy < Window_Selectable[\s\S]*homeland/.test(s));
    if (shop) {
        const homes = /array\s*=\s*(\[[^\]]*\])/.exec(shop);
        const prices = {};
        const lists = {};
        for (const m of shop.matchAll(/(\w+)_prices\s*=\s*(\[[^\]]*\])/g)) lists[m[1]] = readLiteral(m[2], 0)[0];
        for (const m of shop.matchAll(/when \$data_items\[(\d+)\][^\n]*\n\s*(\w+)_prices\[home\]/g)) if (lists[m[2]]) prices[m[1]] = lists[m[2]];
        if (homes && Object.keys(prices).length) out.homelandPrices = JSON.stringify({ homelands: readLiteral(homes[1], 0)[0], coins: prices });
    }
    return out;
}

module.exports = { extract };
