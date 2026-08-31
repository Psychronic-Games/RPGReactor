const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(editorRoot, '..');

const windowsSource = fs.readFileSync(
    path.join(workspaceRoot, 'runtime', 'reactor_windows.js'), 'utf8');

/**
 * The real damage-display half of Window_BattleLog, lifted out of the shipped
 * runtime rather than restated here, so this fails if the routing moves.
 */
function loadBattleLogPrototype() {
    const start = windowsSource.indexOf('Window_BattleLog.prototype.displayDamage = function(target) {');
    const end = windowsSource.indexOf('Window_BattleLog.prototype.displayAffectedStatus = function(target) {');
    assert.ok(start >= 0 && end > start, 'the damage display methods are still where the test expects');

    const context = {
        Window_BattleLog: { prototype: {} },
        TextManager: {
            actorNoHit: '%1 missed', enemyNoHit: '%1 missed',
            actorNoDamage: '%1', enemyNoDamage: '%1',
            evasion: '%1 evaded', magicEvasion: '%1 evaded'
        }
    };
    vm.runInNewContext(windowsSource.slice(start, end), context);
    return context.Window_BattleLog.prototype;
}

const battleLog = loadBattleLogPrototype();

/** A log that records the command names it queues. */
function makeLog(overrides = {}) {
    const log = Object.create(battleLog);
    log.queued = [];
    log.push = function (methodName) { this.queued.push(methodName); };
    log.makeHpDamageText = () => 'hp';
    log.makeMpDamageText = () => 'mp';
    log.makeTpDamageText = () => 'tp';
    return Object.assign(log, overrides);
}

function makeTarget(result = {}, alive = true) {
    const full = Object.assign({
        missed: false, evaded: false, physical: true, critical: false,
        hpAffected: false, hpDamage: 0, mpDamage: 0, tpDamage: 0, drain: false
    }, result);
    return {
        isAlive: () => alive,
        isActor: () => true,
        name: () => 'Target',
        result: () => full
    };
}

const countOf = (log, name) => log.queued.filter(entry => entry === name).length;

test('a shown MP line keeps its chime immediately before it', () => {
    // The chime must not drift to the end of the queue for projects that do
    // display the damage lines -- it belongs with the line it describes.
    const log = makeLog();
    log.displayDamage(makeTarget({ mpDamage: -50 }));
    assert.deepEqual(log.queued, ['performMpRecovery', 'addText']);
});

test('a suppressed MP or TP line still plays its chime', () => {
    // VisuMZ_1_BattleCore ships ShowMpDmg and ShowTpDmg false and returns
    // before the runtime's display method runs at all, which used to take the
    // recovery sound down with the text. displayDamage backstops it.
    const log = makeLog({ displayMpDamage() {}, displayTpDamage() {} });
    log.displayDamage(makeTarget({ mpDamage: -50, tpDamage: -10 }));
    assert.deepEqual(log.queued, ['performMpRecovery', 'performTpRecovery']);
});

test('the backstop never doubles a chime the line already queued', () => {
    const log = makeLog();
    log.displayDamage(makeTarget({ mpDamage: -50, tpDamage: -10 }));
    assert.equal(countOf(log, 'performMpRecovery'), 1);
    assert.equal(countOf(log, 'performTpRecovery'), 1);
    assert.deepEqual(log.queued,
        ['performMpRecovery', 'addText', 'performTpRecovery', 'addText']);
});

test('the HP chime is left alone, so a BattleCore-style replacement cannot double it', () => {
    // BattleCore replaces displayHpDamage outright and pushes performRecovery
    // itself, above its own ShowHpDmg gate. A backstop for HP would queue a
    // second chime against it, so there deliberately is not one.
    const log = makeLog({
        displayHpDamage(target) { this.push('performRecovery', target); }
    });
    log.displayDamage(makeTarget({ hpAffected: true, hpDamage: -100 }));
    assert.equal(countOf(log, 'performRecovery'), 1);
});

test('one target hit twice by one action chimes twice', () => {
    // The guard is per result display, not per battler, so a multi-hit heal is
    // not silenced after its first hit.
    const log = makeLog();
    const target = makeTarget({ mpDamage: -25 });
    log.displayDamage(target);
    log.displayDamage(target);
    assert.equal(countOf(log, 'performMpRecovery'), 2);
});

test('MP and TP damage, a dead target, and a miss queue no chime', () => {
    const damaged = makeLog();
    damaged.displayDamage(makeTarget({ mpDamage: 30, tpDamage: 5 }));
    assert.equal(countOf(damaged, 'performMpRecovery'), 0);
    assert.equal(countOf(damaged, 'performTpRecovery'), 0);

    const dead = makeLog();
    dead.displayDamage(makeTarget({ mpDamage: -30 }, false));
    assert.equal(countOf(dead, 'performMpRecovery'), 0);

    const missed = makeLog({ displayMiss() {} });
    missed.displayDamage(makeTarget({ missed: true, mpDamage: -30 }));
    assert.equal(countOf(missed, 'performMpRecovery'), 0);
});

test('a plugin that suppresses only the MP line leaves the TP line intact', () => {
    const log = makeLog({ displayMpDamage() {} });
    log.displayDamage(makeTarget({ mpDamage: -50, tpDamage: -10 }));
    assert.deepEqual(log.queued,
        ['performTpRecovery', 'addText', 'performMpRecovery']);
    assert.equal(countOf(log, 'performTpRecovery'), 1);
});
