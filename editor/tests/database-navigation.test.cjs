const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadBrowserClass(filePath, className) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: { log: () => {}, warn: () => {}, error: () => {} },
        alert: () => {}
    });
}

test('Database top menu routes to System 1 and System 2 sections', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'UIManager.js'), 'utf8');

    assert.match(source, /openDatabase\('system1'\)/);
    assert.match(source, /openDatabase\('system2'\)/);
    assert.doesNotMatch(source, /openDatabase\('system'\)/);
});

test('legacy system database type opens System 1 instead of unknown type', () => {
    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const ui = Object.create(DatabaseEditorUI.prototype);
    let preparedType = null;
    let showedSystem1 = false;

    ui.currentProject = {};
    ui.animationEditor = null;
    ui.cleanupDatabaseListChrome = () => {};
    ui._dbTitle = (_type, fallback) => fallback;
    ui.prepareDatabaseSection = (type) => {
        preparedType = type;
        return { detailEl: {} };
    };
    ui.system1Editor = {
        showSystem1Detail: () => {
            showedSystem1 = true;
        }
    };

    ui.openDatabase('system');

    assert.equal(preparedType, 'system1');
    assert.equal(showedSystem1, true);
});
