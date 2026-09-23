// Settings for RR_SkillShop from the game's SKILL_SHOP module: PRICE, SKILL_BUY and the texts.
'use strict';
function extract({ scripts }) {
    const text = scripts.find(s => /module SKILL_SHOP/.test(s)) || '';
    const hash = (name) => { const m = new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(text); return m ? m[1] : ''; };
    const prices = {};
    let defaultPrice = null;
    for (const m of hash('PRICE').matchAll(/(\d+)\s*=>\s*(\d+)/g)) { if (m[1] === '0') defaultPrice = m[2]; else prices[m[1]] = Number(m[2]); }
    const learners = {};
    for (const m of hash('SKILL_BUY').matchAll(/(\d+)\s*=>\s*\[([^\]]*)\]/g)) learners[m[1]] = Array.from(new Set(m[2].split(',').map(Number).filter(n => n > 0)));
    const say = (name) => { const m = new RegExp(name + '\\s*=\\s*"([^"]*)"').exec(text); return m ? m[1] : undefined; };
    const out = { prices: JSON.stringify(prices), learners: JSON.stringify(learners) };
    if (defaultPrice !== null) out.defaultPrice = defaultPrice;
    for (const [key, name] of [['partyLabel', 'How_Learn'], ['canLearn', 'Can_Learn'], ['cannotLearn', 'Cant_Learn'], ['learned', 'Learnt'], ['teach', 'Teach'], ['cancel', 'Cancel']]) if (say(name) !== undefined) out[key] = say(name);
    return out;
}
module.exports = { extract };
