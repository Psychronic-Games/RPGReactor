/**
 * Save-flow dialogs are the editor's own, never the browser's: the unsaved
 * prompt and every save-failure message go through the themed modals.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const controller = fs.readFileSync(
    path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');

test('unsaved changes prompt through the themed modal first', () => {
    assert.match(controller, /this\.uiManager\?\.promptUnsavedChanges/);
    // Without UIManager's three-button prompt the same is asked through RRDialog.
    const at = controller.indexOf('async confirmUnsavedChanges');
    const body = controller.slice(at, controller.indexOf('\n    }', at));
    assert.match(body, /else if \(await RRDialog\.confirm\(/, 'the fallback asks through the themed dialog');
    assert.doesNotMatch(body, /[^.\w]confirm\(/, 'no native confirm is left');
});

test('save failures speak through the themed alert', () => {
    assert.match(controller, /_alertSaveProblem\(message\) \{/);
    assert.match(controller, /this\.uiManager\?\.showAlert/);
    for (const message of [
        'The map could not be saved. The current view will remain open.',
        'The current map could not be saved.',
        'One or more database files could not be saved.',
        'The project metadata or map list could not be saved.',
        'The project could not be saved to browser storage.'
    ]) {
        assert.ok(controller.includes(`_alertSaveProblem('${message}')`),
            'themed: ' + message);
        assert.ok(!controller.includes(`alert(this._tt('${message}'))`),
            'no native alert left for: ' + message);
    }
});
