/**
 * Opening another project over one with a tool up: the 3D box follows the
 * view the new project starts in, and the Build bar's model slots stop
 * offering the last project's files.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(editorRoot, rel), 'utf8');

test('the models picked in one project are not offered in the next', () => {
    const context = { console, JSON, Math, Number, String, Array, Object, RegExp, Map, Set };
    context.window = context;
    context.document = { addEventListener() {}, removeEventListener() {} };
    context.ModelPropsPreview2D = class { constructor() {} };
    vm.createContext(context);
    vm.runInContext(read('src/ModelPropsManager.js') + '\nwindow.ModelPropsManager = ModelPropsManager;', context);
    const props = new context.ModelPropsManager(null);
    props.props = () => [];
    props.recent = [{ name: 'Map-Objects/Tree-01', ext: '.glb', file: 'Map-Objects/Tree-01.glb' }];
    props.model = props.recent[0];
    assert.equal(props.libraryModels().length, 1);
    props.onProjectChanged();
    assert.equal(props.libraryModels().length, 0, 'no slot for a file of the last project');
    assert.equal(props.placing(), false, 'and nothing in hand to place');
    assert.match(read('src/ProjectController.js'), /_notifyProjectChanged\(\) \{[\s\S]{0,600}this\.modelPropsManager\?\.onProjectChanged\?\.\(\);/);
});

test('turning the view off for a project change unticks the 3D box', () => {
    assert.match(read('src/main.js'), /disableMap3DView = async \(\) => \{\s*const result = await this\.mapEditor3D\.setEnabled\(false\);\s*const checkbox = document\.getElementById\('map-3d-view'\);\s*if \(checkbox\) checkbox\.checked = false;/);
});
