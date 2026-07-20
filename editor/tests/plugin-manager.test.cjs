const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadBrowserClass(filePath, className) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console,
        require,
        nw: {},
        alert: () => {}
    });
}

function parsePluginsFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const match = text.match(/var\s+\$plugins\s*=\s*(\[[\s\S]*\]);/);
    assert.ok(match, 'plugins.js contains a $plugins array');
    return JSON.parse(match[1]);
}

test('PluginManager writes MZ-compatible plugins.js without Reactor-only metadata', async () => {
    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-plugin-test-'));
    const projectPath = path.join(tempRoot, 'MZ Project');
    const jsPath = path.join(projectPath, 'js');
    fs.mkdirSync(jsPath, { recursive: true });

    try {
        const manager = new PluginManager({
            getCurrentProject: () => ({ path: projectPath })
        });
        manager.fs = fs;
        manager.path = path;
        manager._pluginsFilePath = path.join(jsPath, 'plugins.js');
        manager.plugins = [{
            name: 'ExamplePlugin',
            status: true,
            description: 'Example plugin.',
            author: 'Reactor UI only',
            url: 'https://example.com',
            help: 'Long parsed help text for the Reactor details panel.',
            parameters: {
                NumberValue: 10,
                BooleanValue: true,
                NullValue: null
            }
        }];

        await manager.savePlugins();

        const savedPlugins = parsePluginsFile(manager._pluginsFilePath);
        assert.deepEqual(Object.keys(savedPlugins[0]), ['name', 'status', 'description', 'parameters']);
        assert.equal(savedPlugins[0].name, 'ExamplePlugin');
        assert.equal(savedPlugins[0].status, true);
        assert.equal(savedPlugins[0].description, 'Example plugin.');
        assert.deepEqual(savedPlugins[0].parameters, {
            NumberValue: '10',
            BooleanValue: 'true',
            NullValue: ''
        });
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('Plugin Help search finds literal case-insensitive matches and wraps navigation', () => {
    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = Object.create(PluginManager.prototype);
    const help = 'Alpha setup\n[Setup] uses a.b\nALPHA and a+b\na.b again';

    assert.deepEqual(
        Array.from(manager.findPluginHelpMatches(help, 'alpha'), match => ({ ...match })),
        [{ index: 0, length: 5 }, { index: 29, length: 5 }]
    );
    assert.deepEqual(
        Array.from(manager.findPluginHelpMatches(help, 'a.b'), match => ({ ...match })),
        [{ index: 25, length: 3 }, { index: 43, length: 3 }]
    );
    assert.equal(manager.findPluginHelpMatches(help, '[Setup]').length, 1);
    assert.equal(manager.findPluginHelpMatches(help, '').length, 0);

    assert.equal(manager.nextPluginHelpMatchIndex(0, 3, 1), 1);
    assert.equal(manager.nextPluginHelpMatchIndex(2, 3, 1), 0);
    assert.equal(manager.nextPluginHelpMatchIndex(0, 3, -1), 2);
    assert.equal(manager.nextPluginHelpMatchIndex(-1, 3, -1), 2);
    assert.equal(manager.nextPluginHelpMatchIndex(0, 0, 1), -1);
});

test('Plugin Help exposes highlighted next/previous search controls and shortcuts', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'PluginManager.js'), 'utf8');
    const styles = fs.readFileSync(path.join(repoRoot, 'css', 'styles.css'), 'utf8');

    assert.match(source, /className = 'plugin-help-search-input'/);
    assert.match(source, /classList\.add\('plugin-help-previous'\)/);
    assert.match(source, /classList\.add\('plugin-help-next'\)/);
    assert.match(source, /background-color: var\(--color-bg-deep\);[\s\S]*border: 1px solid var\(--color-border\)/);
    assert.match(source, /searchInput\.addEventListener\('focus'[\s\S]*var\(--color-accent-bright\)/);
    assert.match(source, /searchInput\.addEventListener\('blur'[\s\S]*var\(--color-border-input\)/);
    assert.match(source, /background:var\(--color-bg-button\).*border:1px solid var\(--color-accent-border-strong\)/);
    assert.match(source, /button\.style\.background = 'var\(--color-accent-tint-25\)'/);
    assert.match(source, /previousBtn\.style\.opacity = matches\.length \? '1' : '0\.48'/);
    assert.match(source, /renderPluginHelpMatches\(helpContent, plugin\.help, matches, activeMatch\)/);
    assert.match(source, /move\(event\.shiftKey \? -1 : 1\)/);
    assert.match(source, /e\.key === 'F3'/);
    assert.match(source, /e\.key\.toLowerCase\(\) === 'f'/);
    assert.match(source, /querySelector\('\.plugin-manager-child-modal'\)/);
    assert.match(source, /if \(this\.detailsContainer\) this\.renderEmptyDetails\(\)/);
    assert.match(source, /matchCount\.setAttribute\('aria-live', 'polite'\)/);
    assert.match(source, /searchInput\.setAttribute\('aria-label'/);
    assert.match(source, /className = 'plugin-details-container'/);
    assert.match(source, /overflow-y: auto;[\s\S]*scrollbar-gutter: stable/);
    assert.match(source, /className = 'plugin-help-section'/);
    assert.match(source, /height: clamp\(180px, 42vh, 420px\)/);
    assert.match(source, /min-height: 120px;[\s\S]*resize: vertical/);
    assert.match(source, /className = 'plugin-parameters-container'/);
    assert.match(source, /flex: 0 0 auto;[\s\S]*overflow: visible/);
    assert.doesNotMatch(source, /marks\[activeMatch\]\.scrollIntoView/);
    assert.match(styles, /\.plugin-help-content::\-webkit-resizer\s*\{[^}]*var\(--color-accent-deep\)[^}]*var\(--color-accent-bright\)/s);
});

test('MV nested struct arrays parse and serialize without flattening RPG Maker JSON strings', () => {
    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = Object.create(PluginManager.prototype);
    const source = `/*:
 * @param OptionsCategories
 * @text Options Categories
 * @type struct<Categories>[]
 * @default []
 */
/* unrelated source comment between definitions */
/*~struct~Categories:
 * @param Name
 * @default Category
 *
 * @param ---Settings---
 *
 * @param HelpDesc
 * @parent ---Settings---
 * @type note
 * @default "Help"
 *
 * @param OptionsList
 * @parent ---Settings---
 * @type struct<Options>[]
 * @default []
 */
const betweenStructs = true;
/*~struct~Options:
 * @param Name
 * @default Option
 *
 * @param Symbol
 * @default option
 */
const pluginBodyContinuesAfterStructs = true;
`;
    const definitions = manager.parseStructDefinitions(source);
    const metadata = manager.parsePluginParameterMetadata(source);

    assert.deepEqual(Object.keys(definitions), ['Categories', 'Options']);
    assert.equal(definitions.Categories.OptionsList.type, 'struct<Options>[]');
    assert.equal(definitions.Categories.HelpDesc.parent, '---Settings---');
    assert.equal(definitions.Categories['---Settings---'].default, null);

    const option = { Name: 'Always Dash', Symbol: 'true' };
    const category = {
        Name: 'General',
        '---Settings---': '',
        HelpDesc: JSON.stringify('{"section":1}'),
        OptionsList: JSON.stringify([JSON.stringify(option)])
    };
    const raw = JSON.stringify([JSON.stringify(category)]);
    const decoded = manager.deserializeComplexPluginParameter(raw, metadata.OptionsCategories, definitions);

    assert.equal(decoded[0].Name, 'General');
    assert.equal(decoded[0].OptionsList[0].Name, 'Always Dash');
    assert.equal(decoded[0].OptionsList[0].Symbol, 'true');
    assert.equal(decoded[0].HelpDesc, '{"section":1}');
    assert.equal(
        manager.serializeComplexPluginParameter(decoded, metadata.OptionsCategories, definitions),
        raw
    );

    const stringArray = '["1","true","null","{\\"a\\":1}"]';
    const decodedStrings = manager.deserializeComplexPluginParameter(stringArray, { type: 'string[]' }, definitions);
    assert.deepEqual(Array.from(decodedStrings), ['1', 'true', 'null', '{"a":1}']);
    assert.equal(manager.serializeComplexPluginParameter(decodedStrings, { type: 'string[]' }, definitions), stringArray);

    manager.setSimpleArrayElement(decodedStrings, 0, 'true');
    manager.setSimpleArrayElement(decodedStrings, 1, 'null');
    manager.setSimpleArrayElement(decodedStrings, 2, '{"edited":true}');
    assert.deepEqual(Array.from(decodedStrings.slice(0, 3)), ['true', 'null', '{"edited":true}']);

    const missingNoteSchema = {
        Note: { type: 'note', default: JSON.stringify('{"default":true}') }
    };
    assert.deepEqual(
        { ...manager.serializeStructValue({}, missingNoteSchema, {}) },
        { Note: JSON.stringify('{"default":true}') }
    );
    assert.equal(
        manager.deserializeStructFieldValue(missingNoteSchema.Note.default, missingNoteSchema.Note, {}),
        '{"default":true}'
    );
});

test('complex plugin lists use themed draggable rows and aligned parameter grids', () => {
    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = Object.create(PluginManager.prototype);
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'PluginManager.js'), 'utf8');
    const values = ['Alpha', 'Beta', 'Gamma'];
    manager.plugins = [
        { name: 'AlphaCore', description: 'Battle systems', author: 'First' },
        { name: 'VisualPack', description: 'Alpha effects', author: 'Second' },
        { name: 'Utility', description: '', author: 'ALPHA Team' }
    ];
    manager.selectedPluginIndices = new Set([1]);
    manager._removePluginBtn = { disabled: true, style: {} };

    assert.equal(manager.moveArrayElement(values, 0, 2), true);
    assert.deepEqual(values, ['Beta', 'Gamma', 'Alpha']);
    assert.equal(manager.moveArrayElement(values, 2, 2), false);
    assert.equal(manager.moveArrayElement(values, -1, 0), false);
    assert.deepEqual(
        Array.from(manager.getFilteredPluginEntries('alpha'), entry => entry.index),
        [0, 1, 2]
    );
    assert.deepEqual(
        Array.from(manager.getFilteredPluginEntries('visual'), entry => entry.index),
        [1]
    );
    manager.updatePluginActionFooter();
    assert.equal(manager._removePluginBtn.disabled, false);
    manager.selectedPluginIndices.clear();
    manager.updatePluginActionFooter();
    assert.equal(manager._removePluginBtn.disabled, true);

    assert.match(source, /grid-template-columns: 40px minmax\(0, 1fr\) auto/);
    assert.match(source, /indexHeader\.style\.cssText = '[^']*text-align:center/);
    assert.match(source, /preferredKey = \['Name', 'name', 'Text', 'text', 'Title', 'title'\]/);
    assert.match(source, /arrayData\.splice\(index, 1\)/);
    assert.match(source, /row\.draggable = true/);
    assert.match(source, /row\.addEventListener\('dblclick'/);
    assert.doesNotMatch(source, /indexCell\.textContent = `⋮⋮/);
    assert.match(source, /data-array-drop-position/);
    assert.match(source, /this\.moveArrayElement\(arrayData, fromIndex, toIndex\)/);
    assert.match(source, /var\(--color-bg-list-item-alt\)/);
    assert.match(source, /background-color: var\(--color-bg-toolbar\)/);
    assert.doesNotMatch(source, /#2a3a4a|#262626|#7cb8e4/);
    assert.match(source, /className = 'plugin-list-search-input'/);
    assert.match(source, /className = 'plugin-add-search-input'/);
    assert.match(source, /getFilteredPluginEntries\(this\._pluginFilterQuery\)/);
    assert.match(source, /okBtn\.textContent = this\._tt\('OK'\)/);
    assert.match(source, /className = 'plugin-manager-action-footer'/);
    assert.match(source, /actionFooter\.appendChild\(removePluginBtn\);[\s\S]*actionFooter\.appendChild\(saveChangesBtn\)/);
    assert.match(source, /grid-template-columns: minmax\(180px, 38%\) minmax\(0, 500px\)/);
    assert.match(source, /const isComplexType = isStruct \|\| isArray/);
    assert.match(source, /metadata\.type === 'note'/);
    assert.match(source, /showNestedStructEditor\(fieldName, value, fieldSchema, onSave, suppliedStructDefinitions = \{\}\)/);
    assert.match(source, /this\.renderArrayStructureEditor\(content, parsedValue, fieldSchema, structDefinitions, structDefinitions\)/);
    assert.match(source, /const parsedValue = this\.clonePluginValue/);
    assert.match(source, /const isGroup = Boolean\(groupMatch\)/);
    assert.match(source, /const decodedValue = typeof value === 'string'/);
    assert.match(source, /const applyTextValue = \(\) =>/);
    assert.match(source, /renderStructureView\(\)/);
    assert.match(source, /type\.includes\('struct<'\) \|\| type\.includes\('\[\]'\)/);
    assert.match(source, /!structName && !isArray/);
});
