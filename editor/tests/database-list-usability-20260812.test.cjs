const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const databaseDir = path.resolve(__dirname, '..', 'src', 'database');

function source(name) {
    return fs.readFileSync(path.join(databaseDir, name), 'utf8');
}

test('class learnable skills expose complete selectable CRUD controls', () => {
    const classEditor = source('DatabaseClassEditor.js');

    assert.match(classEditor, /class="learning-btn-add rr-btn-chip">\$\{tt\('Add'\)\}/);
    assert.match(classEditor, /class="learning-btn-edit rr-btn-chip" disabled>\$\{tt\('Edit'\)\}/);
    assert.match(classEditor, /class="learning-btn-delete rr-btn-chip" disabled>\$\{tt\('Delete'\)\}/);
    assert.match(classEditor, /class="learning-row" data-learning-index=/);
    assert.match(classEditor, /row\.addEventListener\('dblclick',[\s\S]*?this\.editLearning/);
    assert.match(classEditor, /event\.key !== 'Enter' && event\.key !== 'Delete'/);
    assert.match(classEditor, /learning-edit-level/);
    assert.match(classEditor, /learning-edit-skill/);
    assert.match(classEditor, /learning-edit-note/);
    assert.match(classEditor, /const draft = existing[\s\S]*?classEntry\.learnings\[learningIndex\] = draft/);
});

test('skill and item effect lists expose controls, double-click edit, and keyboard CRUD', () => {
    for (const name of ['DatabaseSkillEditor.js', 'DatabaseItemEditor.js']) {
        const editor = source(name);
        assert.match(editor, /class="effect-btn-add rr-btn-chip">\$\{tt\('Add'\)\}/, name);
        assert.match(editor, /class="effect-btn-edit rr-btn-chip" disabled>\$\{tt\('Edit'\)\}/, name);
        assert.match(editor, /class="effect-btn-delete rr-btn-chip" disabled>\$\{tt\('Delete'\)\}/, name);
        assert.match(editor, /row\.addEventListener\('dblclick',[\s\S]*?this\.editEffect/, name);
        assert.match(editor, /setupEffectKeyboardShortcuts[\s\S]*?event\.key !== 'Enter' && event\.key !== 'Delete'/, name);
        assert.match(editor, /this\.addEffect\(/, name);
        assert.match(editor, /this\.deleteEffect\(/, name);
    }
});

test('enemy action patterns expose controls and route all interactions through CRUD', () => {
    const enemyEditor = source('DatabaseEnemyEditor.js');

    assert.match(enemyEditor, /class="action-btn-add rr-btn-chip">\$\{tt\('Add'\)\}/);
    assert.match(enemyEditor, /class="action-btn-edit rr-btn-chip" disabled>\$\{tt\('Edit'\)\}/);
    assert.match(enemyEditor, /class="action-btn-delete rr-btn-chip" disabled>\$\{tt\('Delete'\)\}/);
    assert.match(enemyEditor, /row\.addEventListener\('dblclick',[\s\S]*?this\.editAction/);
    assert.match(enemyEditor, /setupActionKeyboardShortcuts[\s\S]*?event\.key !== 'Enter' && event\.key !== 'Delete'/);
    assert.match(enemyEditor, /showActionEditorModal\(enemy, -1, draft\)/);
    assert.doesNotMatch(enemyEditor, /addAction\(enemy\)[\s\S]{0,300}?enemy\.actions\.push/);
});
