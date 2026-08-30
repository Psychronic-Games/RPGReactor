const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
const animEditor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');
const pma = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'event', 'commands', 'PlayModelAnimationEditor.js'), 'utf8');

test('Effekseer animations flash the screen and hide the target too', () => {
    assert.doesNotMatch(animEditor, /radio\.disabled = true;/, 'no flash choice is greyed out any more');
    assert.match(animEditor, /if \(timing\.flashScope === 2 \|\| timing\.flashScope === 3\) entry\.scope = timing\.flashScope;/, 'the scope rides the saved timing');
    assert.match(animEditor, /flashScope = ft\.scope === 2 \|\| ft\.scope === 3 \? ft\.scope : 1;/, 'and rides back into the modal');
    assert.match(sprites, /\$gameScreen\.startFlash\(timing\.color\.slice\(\), timing\.duration\);/, 'scope 2 is a real screen flash');
    assert.match(sprites, /this\._reactorHideDuration = Math\.max/, 'scope 3 hides the target for the duration');
    assert.match(sprites, /!\(this\._reactorHideDuration > 0\) &&/, 'the animation is not over while a target is hidden');
});

test('plays queue: a row of commands runs one after another, hostage-free', () => {
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const character = { eventId: () => 9 };
    R._modelActions = {};
    try {
        R.playModelAnimation(character, 'Aim');
        R.playModelAnimation(character, 'Fire Canon');
        assert.deepEqual(R._modelActions.e9.map(entry => entry.name), ['Aim', 'Fire Canon'], 'both wait their turn');
        R.playModelAnimation(character, '');
        assert.equal(R._modelActions.e9.length, 1, 'a stop drops the queue');
        assert.equal(R._modelActions.e9[0].name, '', 'and is itself the only thing left');
    } finally {
        R._modelActions = {};
    }
    assert.match(three, /unless something is\n\s*\/\/ queued behind it, which takes the stage after this cycle\./, 'a repeat yields to the queue');
    assert.match(three, /\} else if \(!holder\.action\) \{\n\s*queue\.shift\(\);/, 'the next play starts when the stage is free');
});

test('a second interaction parks the waiting script instead of queueing behind it', () => {
    assert.match(three, /Reactor3D\.BACKGROUND_WAIT_MODES = \["reactorScopedWait", "reactorModelAnimation"\];/, 'one list names the background waits');
    assert.match(three, /this\._reactorParked\.push\(this\._interpreter\);\n\s*this\._interpreter = new Game_Interpreter\(\);/, 'the waiting script moves to its own runner');
    assert.match(three, /parked\.update\(\);\n\s*if \(!parked\.isRunning\(\)\) \{/, 'and keeps ticking there until done');
    assert.match(three, /this\.unlockEvent\(parked\.eventId\(\)\);/, 'its event unlocks when it finishes');
    assert.match(three, /map\._reactorParked\.some\(parked => parked\.eventId && parked\.eventId\(\) === this\.eventId\(\)\)/, 'a parked event cannot be re-triggered either');
});

test('Scoped Wait is a background wait: the player walks on while it holds', () => {
    assert.match(three, /Game_Map\.prototype\.isEventRunning\.__reactorScopedWait = true;/, 'the lock is lifted for a scoped wait');
    assert.match(three, /Reactor3D\.BACKGROUND_WAIT_MODES\.indexOf\(interpreter\._waitMode\) >= 0/, 'every background wait mode is exempt, from one list');
    assert.match(three, /&& !this\.isAnyEventStarting\(\)/, 'but never while another event is starting');
    assert.match(three, /Game_Event\.prototype\.start\.__reactorBackgroundWait = true;/, 'a running event cannot be re-armed by the walking player');
    assert.match(three, /interpreter\.eventId\(\) === this\.eventId\(\)/, 'the guard is scoped to the event whose script is running');
    assert.match(three, /if \(owner && owner\.unlock\) owner\.unlock\(\);/, 'the waiting event resumes its own route');
    assert.match(three, /String\(args && args\.resume\) !== "false"/, 'and that resume is a choice, on by default');
    assert.match(three, /const waiting = Reactor3D\.scopedWaitHolding\(this\._reactorScopedWait\);/, 'one function decides every mode');
    assert.match(three, /PluginManager\.registerCommand\("RPGReactor", "ScopedWait", reactorScopedWait\);/);
    assert.match(three, /PluginManager\.registerCommand\("RPGReactor", "WaitForModelAnimation", reactorScopedWait\);/, 'the first shipping name keeps working');
    const picker = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'event', 'EventCommandPicker.js'), 'utf8');
    assert.match(picker, /title: 'Game Flow',\n\s*commands: \[\n\s*\{ name: 'Scoped Wait', code: 357, reactor: 'ScopedWait' \}/, 'Scoped Wait lives under Game Flow');
    const dialog = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'event', 'commands', 'WaitForModel3DEditor.js'), 'utf8');
    assert.match(dialog, /new SwitchVariablePicker\(window\.reactor\?\.databaseManager/, 'switches and variables are picked by name');
    assert.match(dialog, /grid-template-columns:120px 1fr/, 'the rows share one aligned grid');
    const i18n = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'I18nManager.js'), 'utf8');
    assert.match(i18n, /'Game Flow': 'ゲームフロー'/, 'the section name is translated');

    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    R._modelActions = {};
    R.modelHolderFor = () => null;
    global.SceneManager = { _scene: null };
    try {
        const walker = { eventId: () => 5, isMoveRouteForcing: () => true };
        assert.equal(R.scopedActionsBusy(walker), true, 'a forced route is a last action too');
        walker.isMoveRouteForcing = () => false;
        assert.equal(R.scopedActionsBusy(walker), false);
    } finally {
        delete R.modelHolderFor;
        delete global.SceneManager;
    }
});

test('a scoped wait can watch a switch or a variable', () => {
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    global.Graphics = { frameCount: 10 };
    global.$gameSwitches = { value: id => id === 5 };
    global.$gameVariables = { value: () => 42 };
    try {
        assert.equal(R.scopedWaitHolding({ mode: 'switch', switchId: 7, switchValue: true, deadline: Infinity }), true, 'off switch: still waiting');
        assert.equal(R.scopedWaitHolding({ mode: 'switch', switchId: 5, switchValue: true, deadline: Infinity }), false, 'flipped: released');
        assert.equal(R.scopedWaitHolding({ mode: 'variable', variableId: 1, op: '>=', value: 50, deadline: Infinity }), true, '42 is not yet 50');
        assert.equal(R.scopedWaitHolding({ mode: 'variable', variableId: 1, op: '>=', value: 40, deadline: Infinity }), false, 'reached: released');
        assert.equal(R.scopedWaitHolding({ mode: 'variable', variableId: 1, op: '=', value: 42, deadline: Infinity }), false, 'equality too');
        assert.equal(R.scopedWaitHolding({ mode: 'duration', until: 20, deadline: Infinity }), true, 'time still to serve');
        assert.equal(R.scopedWaitHolding({ mode: 'duration', until: 5, deadline: Infinity }), false, 'served');
    } finally {
        delete global.Graphics;
        delete global.$gameSwitches;
        delete global.$gameVariables;
    }
    assert.match(three, /deadline: mode === "actions" \? frame \+ 3600 : Infinity,/, 'a switch wait may hold for as long as the story needs');
});

test('Wait for 3D holds on one character or the whole map', () => {
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const character = { eventId: () => 4 };
    R._modelActions = {};
    R.modelHolderFor = () => null;
    global.SceneManager = { _scene: null };
    try {
        assert.equal(R.modelAnimationsBusy(character), false, 'quiet character');
        assert.equal(R.modelAnimationsBusy(null), false, 'quiet map');
        R._modelActions = { e4: [{ name: 'Aim', frame: 1 }] };
        assert.equal(R.modelAnimationsBusy(character), true, 'a queued play holds');
        assert.equal(R.modelAnimationsBusy(null), true, 'and holds the whole-map scope too');
        R._modelActions = {};
        R.modelHolderFor = () => ({ action: { name: 'Aim', frame: 1 } });
        assert.equal(R.modelAnimationsBusy(character), true, 'a playing action holds');
    } finally {
        R._modelActions = {};
        delete R.modelHolderFor;
        delete global.SceneManager;
    }
    assert.match(three, /this\.setWaitMode\("reactorScopedWait"\);/, 'the command holds the interpreter');
    assert.match(three, /raw !== "all"/, 'and Everything is a real scope');
});

test('Play Model Animation can wait for completion', () => {
    assert.match(pma, /class="pma-wait"/, 'the checkbox exists');
    assert.match(pma, /wait: q\('\.pma-wait'\)\.checked \? 'true' : 'false'/, 'and lands in the args');
    assert.match(three, /this\.setWaitMode\("reactorModelAnimation"\);/, 'the command holds the interpreter');
    assert.match(three, /Reactor3D\.modelAnimationWaiting = function\(wait\)/, 'one function decides');
    assert.match(three, /return action\.frame === wait\.startedFrame;/, 'a repeat releases after its first full cycle');
    assert.match(three, /if \(frame >= wait\.deadline\) return false;/, 'and a missing animation cannot hang the game');

    // The wait logic itself, driven directly.
    global.Graphics = { frameCount: 100 };
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    try {
        const character = { eventId: () => 7 };
        const wait = { character, name: 'Fire', started: false, startedFrame: null, deadline: 700 };
        R._modelActions = { e7: [{ name: 'Fire', frame: 100 }] };
        R.modelHolderFor = () => null;
        assert.equal(R.modelAnimationWaiting(wait), true, 'queued: still waiting');
        R._modelActions = {};
        R.modelHolderFor = () => ({ action: { name: 'Fire', frame: 120 } });
        assert.equal(R.modelAnimationWaiting(wait), true, 'playing: still waiting');
        assert.equal(wait.started, true);
        R.modelHolderFor = () => ({ action: { name: 'Fire', frame: 300 } });
        assert.equal(R.modelAnimationWaiting(wait), false, 'a repeat restart ends the wait');
        R.modelHolderFor = () => ({ action: null });
        assert.equal(R.modelAnimationWaiting({ character, name: 'Fire', started: true, startedFrame: 120, deadline: 700 }), false, 'finished: released');
        global.Graphics.frameCount = 800;
        assert.equal(R.modelAnimationWaiting({ character, name: 'Fire', started: false, startedFrame: null, deadline: 700 }), false, 'the deadline releases');
    } finally {
        delete global.Graphics;
        delete R.modelHolderFor;
        R._modelActions = {};
    }
});
