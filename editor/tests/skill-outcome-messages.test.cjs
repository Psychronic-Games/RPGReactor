/**
 * Skill Message 3 and Message 4 - the outcome lines.
 *
 * Message 1 and 2 announce an action before it resolves. Message 3 and 4 report
 * what it did: 3 when the action connected and had an effect, 4 when it missed,
 * was evaded, or did nothing. Both were fields the Skill page had always drawn
 * and nothing had ever read.
 *
 * The behaviour is driven through the shipped runtime source rather than a copy
 * of it, so a change to reactor_windows.js that breaks the rule fails here
 * rather than in a playtest.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(editorRoot, '..');

const windowsSource = fs.readFileSync(
    path.join(workspaceRoot, 'runtime', 'reactor_windows.js'), 'utf8');
const managerSource = fs.readFileSync(
    path.join(workspaceRoot, 'runtime', 'reactor_managers.js'), 'utf8');
const coreSource = fs.readFileSync(
    path.join(workspaceRoot, 'runtime', 'reactor_core.js'), 'utf8');

// A primitive string carries no realm of its own: `fmt.format(...)` resolves
// against the String.prototype of whichever realm *reads* the property, and
// that is the vm context the runtime slice runs in. So the runtime's own
// String.prototype.format is installed there rather than here - installing it
// in this realm instead leaves every message unformatted.
function runtimeStringFormatSource() {
    const start = coreSource.indexOf('String.prototype.format = function');
    const end = coreSource.indexOf('};', start) + 2;
    assert.ok(start >= 0 && end > start, 'String.prototype.format is still where the test expects');
    return coreSource.slice(start, end);
}

const SKILLS = [];

/** The battle log's display methods, lifted out of the runtime. */
function loadRuntimeBattleLog() {
    const start = windowsSource.indexOf('Window_BattleLog.prototype.displayItemMessage = function');
    const end = windowsSource.indexOf('Window_BattleLog.prototype.displayCritical = function', start);
    assert.ok(start >= 0 && end > start, 'the battle log display methods are still where the test expects');

    const context = {
        Window_BattleLog: function () {},
        // The runtime's own definition is `$dataSkills.includes(item)`.
        DataManager: { isSkill: item => SKILLS.includes(item) },
        TextManager: { actionFailure: '%1 was unaffected!' }
    };
    vm.createContext(context);
    vm.runInContext(runtimeStringFormatSource(), context);
    vm.runInContext(windowsSource.slice(start, end), context);
    return context;
}

const runtime = loadRuntimeBattleLog();

function makeLog() {
    const log = Object.create(runtime.Window_BattleLog.prototype);
    log.pushed = [];
    log.push = (...args) => { log.pushed.push(args); };
    return log;
}

/** Text the log was asked to draw, in order. */
const textOf = log => log.pushed.filter(entry => entry[0] === 'addText').map(entry => entry[1]);

function makeSkill(message3, message4) {
    const skill = { name: 'Firebolt', message1: '', message2: '', message3, message4 };
    SKILLS.push(skill);
    return skill;
}

function makeTarget(overrides) {
    const result = Object.assign(
        { used: true, missed: false, evaded: false, success: true },
        overrides || {});
    result.isHit = () => result.used && !result.missed && !result.evaded;
    return { name: () => 'Slime', result: () => result };
}

const USER = { name: () => 'Reid' };

function outcomeOf(skill, targetOverrides) {
    const log = makeLog();
    log.setOutcomeItem(skill);
    log.displaySkillOutcome(USER, makeTarget(targetOverrides));
    return textOf(log);
}

// ------------------------------------------------------------------ runtime

test('Message 3 is shown when the action connects and has an effect', () => {
    const skill = makeSkill('The flames engulf %1!', 'It fizzles out.');
    assert.deepEqual(outcomeOf(skill, {}), ['The flames engulf Reid!']);
});

test('Message 4 covers every way an action fails to land', () => {
    const skill = makeSkill('Hit line', 'Miss line');
    // Missed, evaded, and hit-but-no-effect are three distinct results and all
    // three are failures as far as the author is concerned.
    assert.deepEqual(outcomeOf(skill, { missed: true }), ['Miss line']);
    assert.deepEqual(outcomeOf(skill, { evaded: true }), ['Miss line']);
    assert.deepEqual(outcomeOf(skill, { success: false }), ['Miss line']);
});

test('the placeholders are the same two Message 1 and 2 take', () => {
    // displayItemMessage formats every skill message identically:
    // fmt.format(subject.name(), item.name).
    const skill = makeSkill('%1 unleashes %2!', '%2 slips past %1.');
    assert.deepEqual(outcomeOf(skill, {}), ['Reid unleashes Firebolt!']);
    assert.deepEqual(outcomeOf(skill, { missed: true }), ['Firebolt slips past Reid.']);
});

test('a skill that sets neither message shows neither', () => {
    // Every skill authored before these fields did anything has them absent,
    // which has to stay silent rather than drawing an empty line.
    const absent = makeSkill(undefined, undefined);
    assert.deepEqual(outcomeOf(absent, {}), []);
    assert.deepEqual(outcomeOf(absent, { missed: true }), []);

    const blank = makeSkill('', '');
    assert.deepEqual(outcomeOf(blank, {}), []);
    assert.deepEqual(outcomeOf(blank, { missed: true }), []);

    // One of the two set is legal: only that side speaks.
    const hitOnly = makeSkill('Only on a hit', '');
    assert.deepEqual(outcomeOf(hitOnly, {}), ['Only on a hit']);
    assert.deepEqual(outcomeOf(hitOnly, { missed: true }), []);
});

test('nothing is shown unless BattleManager named the item', () => {
    const log = makeLog();
    // Never set: a counterattack or a reflection reaching displayActionResults.
    log.displaySkillOutcome(USER, makeTarget({}));
    assert.deepEqual(textOf(log), []);

    // Explicitly cleared, which is what invokeNormalAction does afterwards.
    log.setOutcomeItem(makeSkill('Hit line', 'Miss line'));
    log.setOutcomeItem(null);
    log.displaySkillOutcome(USER, makeTarget({}));
    assert.deepEqual(textOf(log), []);
});

test('an item is not a skill and has no outcome lines', () => {
    // Items go through displayAction's TextManager.useItem branch and have no
    // per-entry messages at all; message3 on one would be meaningless.
    const potion = { name: 'Potion', message3: 'Should never print', message4: 'Nor this' };
    const log = makeLog();
    log.setOutcomeItem(potion);
    log.displaySkillOutcome(USER, makeTarget({}));
    assert.deepEqual(textOf(log), []);
});

// ------------------------------------------------------------------- wiring

test('displayActionResults asks for the outcome line, after the failure line', () => {
    const start = windowsSource.indexOf('Window_BattleLog.prototype.displayActionResults = function');
    const body = windowsSource.slice(start, windowsSource.indexOf('};', start));
    assert.match(body, /this\.displaySkillOutcome\(subject, target\);/);
    assert.ok(body.indexOf('displayFailure') < body.indexOf('displaySkillOutcome'),
        'the outcome line reads as a summary, after the engine lines it summarises');
    assert.ok(body.indexOf('displaySkillOutcome') < body.indexOf('popBaseLine'),
        'it belongs inside the base-line group with the rest of the result');
});

test('only the normal action path names the item', () => {
    // A counterattack applies a Game_Action of its own and a reflection reverses
    // subject and target - both reach displayActionResults, and neither should
    // print the original skill's outcome line.
    // Comments are stripped first: the one above the new call names
    // displayActionResults, and an ordering check would find that instead.
    const region = name => {
        const start = managerSource.indexOf(`BattleManager.${name} = function`);
        assert.ok(start >= 0, `${name} is still where the test expects`);
        return managerSource.slice(start, managerSource.indexOf('\n};', start))
            .split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    };

    const normal = region('invokeNormalAction');
    assert.match(normal, /setOutcomeItem\(this\._action\.item\(\)\)/);
    assert.match(normal, /setOutcomeItem\(null\)/);
    assert.ok(normal.indexOf('setOutcomeItem(this._action.item())') < normal.indexOf('displayActionResults'),
        'the item is named before the results are displayed');
    assert.ok(normal.indexOf('displayActionResults') < normal.lastIndexOf('setOutcomeItem(null)'),
        'and cleared afterwards');

    for (const name of ['invokeCounterAttack', 'invokeMagicReflection']) {
        assert.doesNotMatch(region(name), /setOutcomeItem/,
            `${name} must not claim the original skill's outcome messages`);
    }
});

test('the item travels on the window, not as a third argument', () => {
    // displayActionResults is among the most-aliased methods in the engine and
    // the wrappers in the wild call through with exactly two parameters, so a
    // third would be dropped silently.
    const start = windowsSource.indexOf('Window_BattleLog.prototype.displayActionResults = function');
    assert.match(windowsSource.slice(start, start + 90),
        /displayActionResults = function\(subject, target\)/);
});

// -------------------------------------------------------------- the editor

const skillEditor = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseSkillEditor.js'), 'utf8');

test('all four skill message fields are authorable and carry the text codes', () => {
    for (const n of [1, 2, 3, 4]) {
        const field = skillEditor.match(new RegExp(`data-field="message${n}"[^>]*>`));
        assert.ok(field, `skill message${n} is on the page`);
        assert.match(field[0], /data-rr-textcodes="battlelog:skillMessage"/,
            `skill message${n} offers the battle-log codes and the %1/%2 placeholders`);
    }
});

test('the page says when each message fires', () => {
    // Four inputs labelled only by number cannot say that two announce and two
    // report; without this line the new behaviour is undiscoverable.
    assert.match(skillEditor,
        /Messages 1 and 2 are shown when the skill is used\. Message 3 is shown when it connects, Message 4 when it misses or has no effect\./);
});

test('a new skill still has the MZ-authored shape, not two invented fields', () => {
    // Deliberately NOT seeded into the template. No RPG Maker-authored skill
    // carries message3 or message4 - `database-record-templates.test.cjs` holds
    // the editor to that shape - and nothing needs them present: the runtime
    // guard is `if (fmt)`, so an absent field is silent. They appear on a record
    // only once an author writes one, which keeps a Reactor project readable by
    // the MZ editor unless the feature is actually used.
    const ui = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const template = ui.slice(ui.indexOf('skills: { name: '), ui.indexOf('skills: { name: ') + 600);
    assert.match(template, /message1: ''/);
    assert.match(template, /message2: ''/);
    assert.doesNotMatch(template, /message3/);
    assert.doesNotMatch(template, /message4/);
});
