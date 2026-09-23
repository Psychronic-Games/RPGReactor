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
    assert.match(animation, /selected: seNameInput\.value !== noneLabel \? seNameInput\.value : ''/);
    assert.match(animation, /seNameInput\.value = result\.name \|\| noneLabel/);
});

// A <span> inside a <label> is translated by nothing on its own. The generic
// applyText pass skips a label that has element children, and it never selects
// a bare span outside a modal, so the map toolbar's "Video" toggle stayed
// English in all 17 translated locales while its own tooltip was translated
// from the start. Anything left here has to be a code, not a word.
test('every word the map toolbar and the rest of index.html show carries a key', () => {
    const html = read('index.html');
    // Codes and shortcuts read the same in every language; placeholders are filled in at runtime.
    const notWords = /^(3D|A1|-- x --|&times;|&#\d+;|Ctrl\+[A-Z]|Alt\+[A-Z]|Shift\+[A-Z]|F\d{1,2}|[\d\s.,:%×x+/()-]*)$/;
    const offenders = [];
    for (const match of html.matchAll(/<span([^>]*)>([^<>]+)<\/span>/g)) {
        const [, attrs, textRaw] = match;
        const text = textRaw.trim();
        if (/data-i18n/.test(attrs)) continue;
        if (!/[A-Za-z]/.test(text) || notWords.test(text)) continue;
        offenders.push(text);
    }
    assert.deepEqual(offenders, [], 'spans showing an English word with no data-i18n key');
    assert.ok(html.includes('data-i18n="workspace.video"'), 'the media surface toggle is keyed');
});

test('every data-i18n key index.html names resolves in every locale', () => {
    const vm = require('node:vm');
    const context = vm.createContext({ window: {}, document: {}, navigator: { language: 'en' },
        localStorage: { getItem: () => null, setItem() {} }, console });
    for (const file of ['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    const { strings, reviewed, languages } = vm.runInContext(
        '({ strings: RR_I18N_STRINGS, reviewed: globalThis.RR_REVIEWED_TRANSLATIONS, languages: RR_LANGUAGES })', context);
    const html = read('index.html');
    const keys = [...new Set([...html.matchAll(/data-i18n(?:-title|-aria|-placeholder|-value)?="([^"]+)"/g)].map(m => m[1]))];
    assert.ok(keys.length > 50, `index.html names ${keys.length} keys`);
    const missing = [];
    for (const locale of Array.from(languages, lang => lang.id)) {
        for (const key of keys) {
            const has = (strings[locale] && strings[locale][key]) || (reviewed && reviewed[locale] && reviewed[locale][key]);
            if (!has) missing.push(`${locale}: ${key}`);
        }
    }
    assert.deepEqual(missing, [], 'keys with no translation');
});
