const assert = require('node:assert/strict');
const fs = require('node:fs');
const nodePath = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = nodePath.resolve(__dirname, '..');
const scripts = ['build.js', 'build-worker.js'];

/**
 * Lifts isStagingExcluded (and the EXCLUDED set it closes over) out of a build
 * script so the shipped predicate is what gets tested, not a copy of it.
 */
function loadPredicate(scriptName) {
    const source = fs.readFileSync(nodePath.join(editorRoot, 'build-scripts', scriptName), 'utf8');
    const setAt = source.indexOf('const EXCLUDED = new Set([');
    assert.ok(setAt >= 0, `${scriptName} declares EXCLUDED`);
    const endAt = source.indexOf('\n}', source.indexOf('function isStagingExcluded'));
    assert.ok(endAt > setAt, `${scriptName} declares isStagingExcluded`);
    const slice = source.slice(setAt, endAt + 2);
    return vm.runInNewContext(`${slice}\nisStagingExcluded;`, { path: nodePath });
}

for (const scriptName of scripts) {
    const isStagingExcluded = loadPredicate(scriptName);

    test(`${scriptName}: battle-test database copies are not staged`, () => {
        // BattleTestConfigModal writes a Test_-prefixed copy of every database
        // file into data/ and never removes them. On a mature project that is
        // 13-15 MB of dead weight in every release.
        for (const name of ['Test_Actors.json', 'Test_System.json', 'Test_MapInfos.json',
            'Test_CommonEvents.json', 'Test_Quests.json']) {
            assert.equal(isStagingExcluded(nodePath.join('data', name)), true, name);
        }
    });

    test(`${scriptName}: real database files are still staged`, () => {
        for (const name of ['Actors.json', 'System.json', 'MapInfos.json', 'Map001.json',
            'CommonEvents.json', 'Tilesets.json']) {
            assert.equal(isStagingExcluded(nodePath.join('data', name)), false, name);
        }
    });

    test(`${scriptName}: editor-only database names are not staged`, () => {
        assert.equal(isStagingExcluded(nodePath.join('data', 'Database.names.json')), true);
        assert.equal(isStagingExcluded(nodePath.join('data', 'Database.r3d.json')), false,
            'runtime database sidecars remain deployable');
    });

    test(`${scriptName}: the Test_ rule does not reach outside data/`, () => {
        // A plugin or asset legitimately named Test_… must not be dropped.
        assert.equal(isStagingExcluded(nodePath.join('js', 'plugins', 'Test_Harness.json')), false);
        assert.equal(isStagingExcluded(nodePath.join('img', 'pictures', 'Test_Card.json')), false);
        assert.equal(isStagingExcluded('Test_Actors.json'), false, 'and not at the project root');
        assert.equal(isStagingExcluded(nodePath.join('data', 'Test_Actors.txt')), false,
            'only the .json copies the modal writes');
    });

    test(`${scriptName}: the pre-existing exclusions still apply`, () => {
        for (const relPath of ['Backup', 'save', 'Screenshots', 'project.rpgreactor',
            'game.rmmzproject', nodePath.join('data', 'nul')]) {
            assert.equal(isStagingExcluded(relPath), true, relPath);
        }
        assert.equal(isStagingExcluded('rpgmaker-runtime-backup.zip'), true);
        assert.equal(isStagingExcluded('rpgmaker-runtime-backup-2.zip'), true);
        assert.equal(isStagingExcluded('img'), false);
        assert.equal(isStagingExcluded('audio'), false);
    });
}

test('both build paths share the same staging rule', () => {
    // The modal build and the worker build stage independently; a project that
    // deploys cleanly from one must deploy cleanly from the other.
    const [a, b] = scripts.map(name => {
        const source = fs.readFileSync(nodePath.join(editorRoot, 'build-scripts', name), 'utf8');
        const at = source.indexOf('function isStagingExcluded');
        return source.slice(at, source.indexOf('\n}', at) + 2);
    });
    assert.equal(a, b, 'the two copies of isStagingExcluded have not drifted');
});

test('the filtered copy actually calls the predicate', () => {
    for (const scriptName of scripts) {
        const source = fs.readFileSync(nodePath.join(editorRoot, 'build-scripts', scriptName), 'utf8');
        assert.match(source, /if \(isStagingExcluded\(relPath\)\) \{/, scriptName);
        assert.doesNotMatch(source, /if \(EXCLUDED\.has\(relPath\) \|\|/,
            `${scriptName} no longer tests the set inline, which would bypass the Test_ rule`);
    }
});
