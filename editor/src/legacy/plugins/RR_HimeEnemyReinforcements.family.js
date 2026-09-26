'use strict';
// Hime's Enemy Reinforcements: the calls that add and remove troops during a battle.
module.exports = {
    key: 'himeEnemyReinforcements', detect: /\$imported\[:TH_EnemyReinforcements\]\s*=\s*true/, plugin: 'RR_HimeEnemyReinforcements',
    event: {
        add_troop: 'this.rrAddTroop?.(%0)', add_enemy: 'this.rrAddEnemy?.(%0, %1)', remove_troop: 'this.rrRemoveTroop?.(%0)',
        'troop_exists?': ['this.rrTroopExists?.(%0)', 'bool']
    }
};
