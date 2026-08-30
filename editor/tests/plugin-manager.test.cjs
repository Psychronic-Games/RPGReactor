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
        alert: () => {},
        RRPluginAnnotations: require(path.join(repoRoot, 'src', 'utils', 'PluginAnnotations.js')),
        RRPluginParamCodec: require(path.join(repoRoot, 'src', 'utils', 'PluginParamCodec.js'))
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

test('Plugin Manager opens plugin URLs externally and themes its scroll regions', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'PluginManager.js'), 'utf8');
    const uiSource = fs.readFileSync(path.join(repoRoot, 'src', 'UIManager.js'), 'utf8');
    const styles = fs.readFileSync(path.join(repoRoot, 'css', 'styles.css'), 'utf8');

    assert.match(source, /urlLink\.className = 'external-link'/);
    assert.match(source, /urlLink\.rel = 'noreferrer'/);
    assert.match(uiSource, /closest\('a\.external-link'\)/);
    assert.match(uiSource, /nw\.Shell\.openExternal\(href\)/);
    assert.match(source, /pluginListContainer\.className = 'rr-accent-scrollbar'/);
    assert.match(source, /detailsContainer\.classList\.add\('rr-accent-scrollbar'\)/);
    assert.match(source, /helpContent\.classList\.add\('rr-accent-scrollbar'\)/);
    assert.match(styles, /\.rr-accent-scrollbar\s*\{[^}]*scrollbar-color:[^}]*var\(--color-accent-muted\)[^}]*var\(--color-bg-deep\)/s);
    assert.match(styles, /\.rr-accent-scrollbar::\-webkit-scrollbar-thumb\s*\{[^}]*var\(--color-accent\)[^}]*var\(--color-accent-muted\)/s);
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
    assert.match(source, /isPluginParameterGroupHeader\(/);
    assert.match(source, /const decodedValue = typeof value === 'string'/);
    assert.match(source, /const applyTextValue = \(\) =>/);
    assert.match(source, /renderStructureView\(\)/);
    assert.match(source, /type\.includes\('struct<'\) \|\| type\.includes\('\[\]'\)/);
    assert.match(source, /!structName && !isArray/);
});

/*
 * A plugin whose annotations have been stripped out.
 *
 * A plugin's parameter schema exists only in the `/*:` comment block at the
 * top of its file. Obfuscated releases ship without it: of the 46 VisuStella
 * plugins in a real protected distribution, not one still has an @param, an
 * @plugindesc, or a `/*:` block at all. There is nothing to parse — the same
 * is true in RPG Maker's own Plugin Manager — so the plugins carrying the most
 * configuration are exactly the ones that appear to have none.
 *
 * The values survive in plugins.js under their own names, so they can still be
 * listed and edited. Only the labels, help and typed pickers are gone.
 */
test('a plugin with no annotations still shows its saved parameters', () => {
    const PluginManager = loadBrowserClass(
        path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = new PluginManager({ getCurrentProject: () => ({ path: '/nowhere' }) });

    // A stripped VisuStella file: section banners, no annotations.
    const stripped = [
        '//=====================================',
        '// VisuStella MZ - Core Engine',
        '//=====================================',
        'var Imported = Imported || {};',
        '/* ------------------------------------',
        ' * Quality of Life Settings',
        ' * ------------------------------------',
        ' */'
    ].join('\n');
    assert.equal(Object.keys(manager.parsePluginParameterMetadata(stripped)).length, 0,
        'nothing to parse, and the parser does not pretend otherwise');

    const structs = {};
    const metadata = manager.parameterMetadataFromSavedValues({
        'QoL:struct': '{"AutoLoad:eval":"false","Rate:num":"120","Note:json":"\\"hi\\""}',
        ScreenShake: 'true',
        'MenuBg:arraystruct': JSON.stringify(
            [1, 2, 3].map(n => `{"Name:str":"Layer ${n}","Opacity:num":"192"}`))
    }, structs);

    assert.deepEqual(Object.keys(metadata), ['QoL:struct', 'ScreenShake', 'MenuBg:arraystruct']);

    // The shape of the value says what the missing annotation would have: an
    // object is a struct, a list of objects is a list of them.
    assert.equal(metadata['QoL:struct'].type, 'struct<QoL_struct>');
    assert.equal(metadata['MenuBg:arraystruct'].type, 'struct<MenuBg_arraystruct>[]');
    assert.equal(metadata.ScreenShake.type, 'boolean');

    // And each struct's own fields are read the same way, one level down.
    const qol = structs.QoL_struct;
    assert.deepEqual(Object.keys(qol), ['AutoLoad:eval', 'Rate:num', 'Note:json']);
    assert.equal(qol['AutoLoad:eval'].type, 'boolean');
    assert.equal(qol['Rate:num'].type, 'number');
    // Stored JSON-encoded, so it must be written back JSON-encoded.
    assert.equal(qol['Note:json'].type, 'note');

    // A list's entries are unioned rather than sampled: RPG Maker omits a
    // field left at its default, and a field missing from the definition is
    // one no entry could be given.
    assert.deepEqual(Object.keys(structs.MenuBg_arraystruct), ['Name:str', 'Opacity:num']);

    // VisuStella writes each parameter's type into its own key, for its own
    // loader. That is not a label, so the name without it is used instead.
    assert.equal(metadata['QoL:struct'].text, 'QoL');
    assert.equal(qol['Rate:num'].text, 'Rate');
    assert.equal(metadata.ScreenShake.text, '', 'a key not written that way keeps its own name');

    // No @default was seen, so nothing may be presented as one.
    assert.equal(metadata['QoL:struct'].default, null);
    assert.equal(metadata['QoL:struct'].parent, null);
    assert.equal(metadata['QoL:struct'].options.length, 0);
});

test('a value is only offered as structured if editing it would give it back', () => {
    /*
     * The type is read off the value's shape rather than stated by the plugin,
     * so it is a reading and can be a misreading. An `:eval` parameter holding
     * the source text `[255, 255, 0, 160]` looks exactly like a list and is an
     * expression; RPG Maker's own `__collapsed` bookkeeping is a bare array
     * inside a struct whose every real field is a string. Both display fine
     * and neither comes back byte for byte.
     *
     * So every reading is checked by performing it, and one that does not
     * reproduce the stored text falls back to a text box — which is what it
     * would have had anyway. Nothing is quietly rewritten by being looked at.
     */
    const PluginManager = loadBrowserClass(
        path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = new PluginManager({ getCurrentProject: () => ({ path: '/nowhere' }) });

    const structs = {};
    const metadata = manager.parameterMetadataFromSavedValues({
        'CriticalColor:eval': '[255, 255, 0, 160]',
        'Layout:struct': '{"Style:str":"list","__collapsed":["XPStyle"]}',
        'Clean:struct': '{"Style:str":"list"}'
    }, structs);

    assert.equal(metadata['CriticalColor:eval'].type, 'string',
        'an expression that reads as a list is left as its own source text');
    assert.equal(metadata['Layout:struct'].type, 'string',
        'a struct carrying RPG Maker\'s own bare-array bookkeeping is left as text');
    assert.equal(metadata['Clean:struct'].type, 'struct<Clean_struct>',
        'and a struct that does round-trip is still offered as one');

    // A rejected reading takes its struct definitions with it, so nothing is
    // left behind referring to a type no parameter has.
    assert.deepEqual(Object.keys(structs), ['Clean_struct']);
});

test('every parameter offered as structured survives being saved', () => {
    // Against the real thing: a project whose plugins were shipped with their
    // annotations stripped, which is the only reason any of this exists.
    const pluginsFile = path.join(repoRoot, '..', 'template', 'Project3', 'js', 'reactor_plugins.js');
    if (!fs.existsSync(pluginsFile)) return;

    const PluginManager = loadBrowserClass(
        path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = new PluginManager({ getCurrentProject: () => ({ path: '/nowhere' }) });

    const text = fs.readFileSync(pluginsFile, 'utf8');
    const plugins = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));

    let structured = 0;
    for (const plugin of plugins) {
        if (!plugin.parameters || Object.keys(plugin.parameters).length === 0) continue;
        const definitions = {};
        const metadata = manager.parameterMetadataFromSavedValues(plugin.parameters, definitions);
        for (const key of Object.keys(metadata)) {
            const type = metadata[key].type;
            if (!type.includes('struct<') && !type.includes('[]')) continue;
            structured++;
            const stored = plugin.parameters[key];
            const parsed = manager.deserializeComplexPluginParameter(stored, metadata[key], definitions);
            assert.equal(
                manager.serializeComplexPluginParameter(parsed, metadata[key], definitions),
                stored,
                `${plugin.name} / ${key} came back changed`);
        }
    }
    assert.ok(structured > 100, `expected the corpus to exercise this; saw ${structured}`);
});

test('nothing is invented for a plugin that genuinely has no parameters', () => {
    const PluginManager = loadBrowserClass(
        path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = new PluginManager({ getCurrentProject: () => ({ path: '/nowhere' }) });

    for (const empty of [{}, null, undefined, 'not an object']) {
        assert.equal(Object.keys(manager.parameterMetadataFromSavedValues(empty)).length, 0);
    }

    // And the fallback is reached only when the file itself described none:
    // a parsed schema always wins, so an annotated plugin keeps its labels,
    // help text and pickers.
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'PluginManager.js'), 'utf8');
    assert.match(source,
        /if \(Object\.keys\(metadata\)\.length === 0 && pluginFileExists\) \{\s*\n\s*const fromValues = this\.parameterMetadataFromSavedValues\(plugin\.parameters, \{\}\)/);
    assert.match(source, /let metadata = paramMetadata;/);
});

test('one-line @param @text @desc annotations keep the real parameter name', () => {
    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = Object.create(PluginManager.prototype);
    const source = `/*:
@param Foo @default 3
@param spacer|graphics @text\u200f\u200f\u200e \u200e@desc ===============================================
@param graphics
@text Graphics
*/`;

    const defaults = manager.parsePluginParameters(source);
    const metadata = manager.parsePluginParameterMetadata(source);

    assert.equal(defaults.Foo, '3');
    assert.ok(!Object.keys(defaults).some(key => key.includes('@text')));
    assert.deepEqual(Object.keys(metadata), ['Foo', 'spacer|graphics', 'graphics']);
    assert.equal(metadata['spacer|graphics'].text, '');
    assert.equal(metadata['spacer|graphics'].textSpecified, true);
    assert.equal(metadata['spacer|graphics'].desc, '===============================================');
    assert.equal(metadata.graphics.text, 'Graphics');
    assert.equal(metadata.Foo.default, '3');
    assert.equal(manager.isPluginParameterSeparator('spacer|graphics', metadata['spacer|graphics']), true);
    assert.equal(manager.isPluginParameterSeparator('graphics', metadata.graphics), false);
    assert.equal(manager.isPluginParameterSeparator('Foo', metadata.Foo), false);
    assert.equal(manager.isPluginParameterGroupHeader('graphics', metadata.graphics, true), true);
    assert.equal(manager.isPluginParameterGroupHeader('Foo', metadata.Foo, false), false);
});

test('MZ3D spacer lines parse as spacer|section instead of a glued @text @desc name', () => {
    const pluginPath = path.join(repoRoot, '..', 'template', 'MZ3D', 'js', 'plugins', 'mz3d.js');
    if (!fs.existsSync(pluginPath)) return;

    const PluginManager = loadBrowserClass(path.join(repoRoot, 'src', 'PluginManager.js'), 'PluginManager');
    const manager = Object.create(PluginManager.prototype);
    const metadata = manager.parsePluginParameterMetadata(fs.readFileSync(pluginPath, 'utf8'));

    assert.ok(metadata['spacer|graphics']);
    assert.ok(metadata.graphics);
    assert.equal(metadata.graphics.text, 'Graphics');
    assert.ok(!Object.keys(metadata).some(key => key.includes('@text') || key.includes('@desc')));
    assert.equal(manager.isPluginParameterGroupHeader('map', metadata.map, true), true);
    assert.equal(manager.isPluginParameterGroupHeader('input', metadata.input, true), true);
    assert.equal(manager.isPluginParameterGroupHeader('renderDistOptionName', metadata.renderDistOptionName, true), false);
    assert.equal(manager.isPluginParameterGroupHeader('cellSize', metadata.cellSize, false), false);
});
