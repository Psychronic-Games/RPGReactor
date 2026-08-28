const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('confirmed user-visible English bypasses route through literal text translation calls', () => {
    const picker = read('src/utils/PickerIndex.js');
    assert.match(picker, /searchInput\.placeholder = options\.searchPlaceholder \|\| tt\('Search files\.\.\.'\)/);
    assert.match(picker, /clearSearch\.title = tt\('Clear search'\)/);
    assert.match(picker, /clearSearch\.setAttribute\('aria-label', tt\('Clear search'\)\)/);

    const playtest = read('src/PlaytestManager.js');
    assert.match(playtest, /window\.alert\(`\$\{tt\('Cannot start playtest\.'\)\}\\n\\n\$\{packageResult\.error\}`\)/);

    const project = read('src/ProjectController.js');
    assert.match(project, /this\._tt\('The project lock could not be verified\. The project was not opened\.'\)/);
    assert.match(project, /this\._tt\('Could not verify project lock'\)/);

    const event = read('src/EventManager.js');
    for (const label of ['Character Graphic:', 'Destination:', 'Player Direction:', 'Reward Type:', 'Reward:']) {
        assert.ok(event.includes(`row(tt('${label}')`), label);
    }
    assert.match(event, /tt\('Map \{id\}: \(\{x\}, \{y\}\)', \{\s*id: d\.mapId, x: d\.x, y: d\.y\s*\}\)/);
    assert.match(event, /tt\('Price \(\{currency\}\):', \{ currency: config\.currency \}\)/);
});

test('project diagnostics, dynamic statuses, and map chrome route through localization', () => {
    const projectManager = read('src/ProjectManager.js');
    for (const phrase of [
        'Could not read {file}: {error}',
        'Project target must be an ordinary directory.',
        'Project target already exists and is not empty.',
        'The current Reactor runtime could not be found.',
        'Cannot use {packagePath}: expected package.json to contain a JSON object.',
        'Cannot use {packagePath}: {error}',
        'project.rpgreactor must contain a JSON object',
        'No project.rpgreactor, game.rmmzproject, or Game.rpgproject file was found.',
        'MapInfos.json must contain a JSON array'
    ]) {
        assert.ok(projectManager.includes(`this._t('${phrase}'`), phrase);
    }

    const modelEditor = read('src/database/Database3DEditor.js');
    assert.match(modelEditor, /this\._t\('Rig bound — \{bones\} bones, \{vertices\} vertices', \{/);

    const main = read('src/main.js');
    assert.match(main, /window\.I18n\.tText\('Unnamed Map'\)/);

    const interfaceEditor = read('src/database/DatabaseUserInterfaceEditor.js');
    assert.match(interfaceEditor, /this\._t\(value \? 'ON' : 'OFF'\)/);

    const html = read('index.html');
    for (const key of [
        'workspace.grid',
        'mapProps.anchorTopLeft', 'mapProps.anchorTop', 'mapProps.anchorTopRight',
        'mapProps.anchorLeft', 'mapProps.anchorCenter', 'mapProps.anchorRight',
        'mapProps.anchorBottomLeft', 'mapProps.anchorBottom', 'mapProps.anchorBottomRight',
        'mapProps.sizeRange', 'mapProps.parallaxBrowseHint', 'mapProps.parallaxPreviewHint'
    ]) {
        assert.ok(html.includes(`\"${key}\"`), key);
    }
});

test('localized animation None label is display-only, not a stored sound filename', () => {
    const animation = read('src/database/DatabaseAnimationEditor.js');
    assert.match(animation, /const noneLabel = tt\('None'\)/);
    assert.doesNotMatch(animation, /seName[^\n]*(?:===|!==) 'None'/);
    assert.match(animation, /se: seName && seName !== noneLabel \? \{/);
    assert.match(animation, /let selectedFile = seNameInput\.value !== noneLabel \? seNameInput\.value : null/);
});
