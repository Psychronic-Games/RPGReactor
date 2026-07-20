const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadEditor() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseSystem2Editor;`, { console });
}

test('System 2 stores Magic Skills as an ordered unique list of numeric Skill Type IDs', () => {
    const DatabaseSystem2Editor = loadEditor();
    const editor = Object.create(DatabaseSystem2Editor.prototype);
    const system = { magicSkills: [3, 1] };

    assert.equal(editor.setMagicSkillIds(system, ['3', '1', '3', '0', '', 'bad']), true);
    assert.deepEqual(Array.from(system.magicSkills), [3, 1]);
    assert.equal(editor.setMagicSkillIds(system, []), true);
    assert.deepEqual(Array.from(system.magicSkills), []);
    assert.equal(editor.setMagicSkillIds(null, [1]), false);
});

test('Magic Skills renders fillable Skill Type rows instead of checkboxes', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8');

    assert.match(source, /class="database-field-value sys2-magic-skill"/);
    assert.match(source, /class="sys2-magic-skills-list"/);
    assert.match(source, /rowHtml\(0, magicSkills\.length\)/);
    assert.doesNotMatch(source, /type="checkbox" class="system-checkbox sys2-magic-skill"/);
});

test('opening Magic Skills does not initialize a missing field', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem2Editor.js'), 'utf8');

    assert.match(source, /Array\.isArray\(system\.magicSkills\) \? system\.magicSkills : \[\]/);
    assert.doesNotMatch(source, /if \(!system\.magicSkills\) system\.magicSkills = \[\]/);
});
