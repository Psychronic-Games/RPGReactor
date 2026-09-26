'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_CscaLevelUpRecovery.js'), 'utf8');

const SCRIPT = `# Script by CSCA
# Recovers all on level up #
# Plug n Play #
class Game_Actor < Game_Battler
  alias csca_snippets_lvlup level_up
  def level_up
    csca_snippets_lvlup
    recover_all
  end
end`;

test('CSCA Recovery on Level Up: detected; a level gained recovers the actor after it is gained', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('cscaLevelUpRecovery'));
    const log = [];
    function Game_Actor() {}
    Game_Actor.prototype.levelUp = function() { log.push('level'); };
    Game_Actor.prototype.recoverAll = function() { log.push('recover'); };
    vm.runInNewContext(source, { Game_Actor });
    new Game_Actor().levelUp();
    assert.deepEqual(log, ['level', 'recover']);
});
