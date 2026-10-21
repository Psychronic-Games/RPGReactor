'use strict';
// Plugin parameters for RR_CpPassiveSkills: CP Passive Skills v1.1 reads an enemy's passives from its skills,
// which only exist when another script gave enemies a skill list (Victor Engine's Basic Module: the skills of
// their actions). Without one the original stopped with an error, so enemies keep none.

function extract({ scripts = [] } = {}) {
    const enemyPassives = scripts.some(s => /class Game_Enemy\b[\s\S]*def passives\b/.test(s));
    const enemySkills = scripts.some(s => /class Game_Enemy\b[\s\S]*def skills\b[\s\S]*?enemy\.actions\.collect/.test(s));
    return { enemySkills: enemyPassives && enemySkills ? 'actions' : 'none' };
}

module.exports = { extract };
