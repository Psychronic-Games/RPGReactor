'use strict';
// CSCA Achievements: earn_achievement(:symbol), the achievements scene and $csca's totals. Also CSCA Core's
// shorter variable and switch reads (csca_v, csca_s), which need no plugin.
module.exports = [
    {
        key: 'cscaAchievements', detect: /\$imported\["CSCA-Achievements"\]\s*=\s*true/, plugin: 'RR_CscaAchievements',
        event: { earn_achievement: 'this.rrCscaEarnAchievement?.(%0)' },
        globals: { $csca: ['$gameSystem.rrCsca?.()', 'csca'] },
        objects: { csca: { achievements_earned: '($?.achievementsEarned ?? 0)', achievement_total_points: '($?.achievementTotalPoints ?? 0)' } },
        classes: { CSCA_Scene_Achievements: 'Scene_RRCscaAchievements' }
    },
    {
        key: 'cscaCore', detect: /\$imported\["CSCA-Core"\]\s*=\s*true/,
        event: { csca_v: ['$gameVariables.value(%0)', 'number'], csca_s: ['$gameSwitches.value(%0)', 'bool'] }
    }
];
