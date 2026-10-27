// Events and maps, as the owner settled them on 2026-10-23: Show Choices written the way RPG Maker writes it,
// one label for an unnamed switch or common event, the Circle tool fitting the drag, new maps (their tileset,
// no 3D sidecar for a 2D map), a blank project's party, Save As, a missing tileset said on the map bar, and
// Escape closing the Event Editor and the Forge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const quiet = { log() {}, debug() {}, warn() {}, error() {}, info() {} };
const cmd = (code, indent, parameters = []) => ({ code, indent, parameters });
const plain = value => JSON.parse(JSON.stringify(value));

global.window = global.window || {};
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
const ShowChoicesCommandEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'ShowChoicesCommandEditor.js'));

function choices(values, cancelType, defaultType = 0) {
    const editor = new ShowChoicesCommandEditor(null, null);
    editor.resetToDefaults();
    if (values) editor.choices = values.slice();
    if (cancelType !== undefined) editor.cancelType = cancelType;
    editor.defaultType = defaultType;
    return editor;
}

//-----------------------------------------------------------------------------
// Show Choices

test('a new Show Choices defaults to Choice 1, cancels as Choice 2, and writes an empty body under every branch', () => {
    const editor = choices();
    assert.equal(editor.defaultType, 0);
    assert.equal(editor.cancelType, 1);
    assert.deepEqual(plain(editor.buildCommands()), [
        cmd(102, 0, [['Choice 1', 'Choice 2'], 1, 0, 2, 0]),
        cmd(402, 0, [0, 'Choice 1']), cmd(0, 1),
        cmd(402, 0, [1, 'Choice 2']), cmd(0, 1),
        cmd(404, 0)
    ]);
});

test('Branch is -2 and writes When Cancel; Disallow is -1 and writes none, as the interpreter reads them', () => {
    // Window_ChoiceList.isCancelEnabled: cancelType !== -1; command403 runs on a negative branch.
    const runtime = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_windows.js'), 'utf8');
    assert.match(runtime, /choiceCancelType\(\) !== -1/);
    const branch = plain(choices(['Yes', 'No'], -2).buildCommands());
    assert.deepEqual(branch.slice(-3), [cmd(403, 0, [6, null]), cmd(0, 1), cmd(404, 0)]);
    assert.equal(branch[0].parameters[1], -2);
    const disallow = plain(choices(['Yes', 'No'], -1).buildCommands());
    assert.equal(disallow.some(command => command.code === 403), false);
    assert.equal(disallow[0].parameters[1], -1);
    const source = read('src/event/commands/ShowChoicesCommandEditor.js');
    assert.match(source, /<option value="-2">\$\{t\('Branch'\)\}<\/option>\s*<option value="-1">\$\{t\('Disallow'\)\}<\/option>/);
    assert.match(source, /<option value="-1">\$\{t\('None'\)\}<\/option>/, 'Default offers None, as stored by -1');
});

test('a blank choice before the last keeps its place and its branch; blanks after it are dropped', () => {
    const commands = plain(choices(['Go', '', 'Stay', '', '', ''], 2, 2).buildCommands());
    assert.deepEqual(commands[0].parameters, [['Go', '', 'Stay'], 2, 2, 2, 0]);
    assert.deepEqual(commands.filter(command => command.code === 402).map(command => command.parameters), [[0, 'Go'], [1, ''], [2, 'Stay']]);
    // A cancel or default naming a dropped choice: Disallow and Choice 1, never the interpreter's Branch.
    const past = plain(choices(['Go', 'Stay', '', ''], 3, 3).buildCommands());
    assert.deepEqual(past[0].parameters.slice(1, 3), [-1, 0]);
});

test('editing a choice keeps each body and its own end row, adding one where a body had none', () => {
    const authored = [
        cmd(102, 0, [['A', 'B'], -2, 0, 2, 0]),
        cmd(402, 0, [0, 'A']), cmd(101, 1, ['', 0, 0, 2]), cmd(401, 1, ['Hi']), cmd(0, 1),
        cmd(402, 0, [1, 'B']), cmd(0, 1),
        cmd(403, 0, [6, null]), cmd(250, 1, [{}]), cmd(0, 1),
        cmd(404, 0), cmd(0, 0)
    ];
    const list = plain(authored);
    EventCommandList.replaceChoiceStructure(list, 0, plain(choices(['A', 'B', 'C'], -2).buildCommands()));
    assert.deepEqual(list, [
        cmd(102, 0, [['A', 'B', 'C'], -2, 0, 2, 0]),
        cmd(402, 0, [0, 'A']), cmd(101, 1, ['', 0, 0, 2]), cmd(401, 1, ['Hi']), cmd(0, 1),
        cmd(402, 0, [1, 'B']), cmd(0, 1),
        cmd(402, 0, [2, 'C']), cmd(0, 1),
        cmd(403, 0, [6, null]), cmd(250, 1, [{}]), cmd(0, 1),
        cmd(404, 0), cmd(0, 0)
    ]);
    // A choice an older editor wrote with no end rows gains them, its commands kept.
    const older = [cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]), cmd(402, 0, [0]), cmd(230, 1, [30]), cmd(402, 0, [1]), cmd(404, 0), cmd(0, 0)];
    EventCommandList.replaceChoiceStructure(older, 0, plain(choices(['A', 'B'], 1).buildCommands()));
    assert.deepEqual(older, [
        cmd(102, 0, [['A', 'B'], 1, 0, 2, 0]),
        cmd(402, 0, [0, 'A']), cmd(230, 1, [30]), cmd(0, 1),
        cmd(402, 0, [1, 'B']), cmd(0, 1),
        cmd(404, 0), cmd(0, 0)
    ]);
    // Nested under another branch, the rows follow its indent.
    const nested = [cmd(111, 0, [0, 1, 0]), cmd(102, 1, [['X', 'Y'], 1, 0, 2, 0]), cmd(402, 1, [0, 'X']), cmd(0, 2), cmd(402, 1, [1, 'Y']), cmd(0, 2), cmd(404, 1), cmd(0, 1), cmd(412, 0), cmd(0, 0)];
    EventCommandList.replaceChoiceStructure(nested, 1, plain(choices(['X', 'Y'], 1).buildCommands()));
    assert.deepEqual(nested.map(command => [command.code, command.indent]), [[111, 0], [102, 1], [402, 1], [0, 2], [402, 1], [0, 2], [404, 1], [0, 1], [412, 0], [0, 0]]);
    // The Database's common events take the same path.
    assert.match(read('src/database/DatabaseCommonEventEditor.js'), /ECL\.replaceChoiceStructure\(event\.list, idx, commands\)/);
});

//-----------------------------------------------------------------------------
// One label for an unnamed switch, variable or common event

test('an unnamed switch, variable or common event reads the same in every place', () => {
    const list = Object.create(EventCommandList.prototype);
    const system = { switches: ['', 'Door open', ''], variables: ['', '', 'Gold'] };
    list.eventEditor = { databaseManager: { getSystem: () => system, data: { commonEvents: [null, { id: 1, name: '' }, { id: 2, name: 'Heal' }] } } };
    assert.equal(list._fmtSwitch(2), '#0002 Switch 0002');
    assert.equal(list._fmtSwitch(1), '#0001 Door open');
    assert.equal(list._fmtVar(1), '#0001 Variable 0001');
    assert.equal(list.getCommandInfo(cmd(117, 0, [1])).description, '#0001: Common Event 0001');
    assert.equal(list.getCommandInfo(cmd(117, 0, [2])).description, '#0002: Heal');

    const sources = {
        page: read('src/event/EventPageEditor.js'),
        picker: read('src/event/SwitchVariablePicker.js'),
        controlSwitches: read('src/event/commands/ControlSwitchesEditor.js'),
        controlVariables: read('src/event/commands/ControlVariablesEditor.js'),
        branch: read('src/event/commands/ConditionalBranchEditor.js'),
        route: read('src/event/commands/SetMovementRouteEditor.js'),
        commonEvent: read('src/event/commands/CommonEventEditor.js')
    };
    assert.match(sources.page, /name: name \|\| `\$\{tt\('Switch'\)\} \$\{String\(index\)\.padStart\(4, '0'\)\}`/);
    assert.match(sources.picker, /`\$\{tt\(label\)\} \$\{String\(i\)\.padStart\(4, '0'\)\}`/);
    assert.match(sources.controlSwitches, /switchName \|\| `\$\{tt\('Switch'\)\} \$\{String\(this\.startId\)\.padStart\(4, '0'\)\}`/);
    assert.match(sources.controlVariables, /variableName \|\| `\$\{tt\('Variable'\)\} \$\{String\(value\)\.padStart\(4, '0'\)\}`/);
    assert.match(sources.branch, /this\._tt\('Variable'\)\} \$\{String\(id\)\.padStart\(4, '0'\)\}`/);
    assert.match(sources.route, /this\._switchName\(p\[0\]\) \|\| `\$\{this\._t\('Switch'\)\} \$\{String\(p\[0\]\)\.padStart\(4, '0'\)\}`/);
    assert.match(sources.commonEvent, /commonEvent\.name \|\| `\$\{tt\('Common Event'\)\} \$\{String\(id\)\.padStart\(4, '0'\)\}`/);
    for (const [name, source] of Object.entries(sources)) assert.doesNotMatch(source, /\(unnamed\)/, name);
});

//-----------------------------------------------------------------------------
// The Circle tool

function circleCells(start, end, fromCenter) {
    const source = read('src/MapEditor.js');
    const at = source.indexOf('    circleShape(start, end, fromCenter = !!this.circleFromCenter) {');
    const body = source.slice(at, source.indexOf('\n    }\n', at) + 6);
    const Probe = vm.runInNewContext(`(class { ${body} })`);
    const shape = new Probe().circleShape(start, end, fromCenter);
    const rows = [];
    for (let y = shape.minY; y <= shape.maxY; y++) {
        let row = '';
        for (let x = shape.minX; x <= shape.maxX; x++) row += shape.contains(x, y) ? '#' : '.';
        rows.push(row);
    }
    return { rows, box: [shape.minX, shape.minY, shape.maxX, shape.maxY] };
}

test('the Circle tool fills the ellipse that fits the drag; with Alt it grows from where the drag began', () => {
    // Dragged from either corner, the same rectangle.
    const forward = circleCells({ x: 2, y: 3 }, { x: 8, y: 6 }, false);
    const back = circleCells({ x: 8, y: 6 }, { x: 2, y: 3 }, false);
    assert.deepEqual(forward, back);
    assert.deepEqual(forward.box, [2, 3, 8, 6]);
    assert.deepEqual(forward.rows, ['..###..', '#######', '#######', '..###..']);
    assert.deepEqual(circleCells({ x: 0, y: 0 }, { x: 2, y: 2 }, false).rows, ['.#.', '###', '.#.']);
    assert.deepEqual(circleCells({ x: 4, y: 4 }, { x: 4, y: 4 }, false).rows, ['#'], 'a click paints its cell');
    assert.deepEqual(circleCells({ x: 0, y: 0 }, { x: 4, y: 0 }, false).rows, ['#####'], 'one row is a line');
    // Alt: centered on the first cell, reaching the pointer's row and column on both sides.
    const centered = circleCells({ x: 5, y: 5 }, { x: 7, y: 6 }, true);
    assert.deepEqual(centered.box, [3, 4, 7, 6]);
    assert.deepEqual(centered.rows, ['.###.', '#####', '.###.']);
    const editor = read('src/MapEditor.js');
    assert.equal((editor.match(/this\.circleFromCenter = Boolean\(event\.data\.originalEvent\.altKey\);/g) || []).length, 2, 'read on move and on release');
    assert.doesNotMatch(editor.slice(editor.indexOf('    paintCircle(start, end) {'), editor.indexOf('    paintCircle(start, end) {') + 4000), /radius/);
});

//-----------------------------------------------------------------------------
// New maps

function controllerWith(fields = {}) {
    const element = id => fields[id] || (fields[id] = { value: '', checked: false });
    const context = { console: quiet, process, require, nw: {}, document: { getElementById: element, querySelectorAll: () => [] } };
    context.window = context;
    vm.runInNewContext(read('src/utils/MapElevation.js'), context);
    const ProjectController = vm.runInNewContext(`${read('src/ProjectController.js')}\nProjectController;`, context);
    const controller = Object.create(ProjectController.prototype);
    controller.mapElevation = () => context.RRMapElevation;
    return { controller, fields };
}

test('a new 2D map gets no 3D sidecar; a new 3D map, or one made 3D, starts in daylight', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-new-map-sidecar-'));
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        const { controller, fields } = controllerWith({ 'map-3d-height-input': { value: '4' }, 'map-3d-camera-select': { value: 'fixed' } });
        controller.currentProject = { path: dir };
        controller.isCreatingNewMap = true;
        const flat = { id: 5, width: 17, height: 13, note: '', data: [], events: [] };
        controller.currentEditingMap = flat;
        assert.equal(controller.saveMap3DSettings({ id: 5, width: 17, height: 13 }, controller.readMap3DForm(), false, false), false);
        assert.equal(flat.reactor3d, undefined);
        assert.deepEqual(fs.readdirSync(path.join(dir, 'data')), [], 'nothing written for a 2D map');

        const raised = { id: 6, width: 17, height: 13, note: '<3d>', data: [], events: [] };
        controller.currentEditingMap = raised;
        assert.equal(controller.saveMap3DSettings({ id: 6, width: 17, height: 13 }, controller.readMap3DForm(), true, false), true);
        assert.deepEqual(plain(raised.reactor3d.lighting), { ambient: 1, ambientColour: '#ffffff' });
        assert.deepEqual(fs.readdirSync(path.join(dir, 'data')), ['Map006.r3d.json']);

        // An existing 2D map ticked 3D in Map Properties starts in daylight too; one already 3D keeps its light.
        controller.isCreatingNewMap = false;
        const ticked = { id: 7, width: 8, height: 8, note: '<3d>', data: [], events: [] };
        controller.currentEditingMap = ticked;
        controller.saveMap3DSettings({ id: 7, width: 8, height: 8 }, controller.readMap3DForm(), true, false);
        assert.deepEqual(plain(ticked.reactor3d.lighting), { ambient: 1, ambientColour: '#ffffff' });
        const night = { id: 8, width: 8, height: 8, note: '<3d>', data: [], events: [], reactor3d: { version: 1, mode: '3d', lighting: { ambient: 0.2, ambientColour: '#3040a0' } } };
        controller.currentEditingMap = night;
        controller.saveMap3DSettings({ id: 8, width: 8, height: 8 }, controller.readMap3DForm(), true, true);
        assert.deepEqual(plain(night.reactor3d.lighting), { ambient: 0.2, ambientColour: '#3040a0' });
        void fields;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('OK on a new map opens it', () => {
    const source = read('src/ProjectController.js');
    assert.match(source, /const createdMapId = this\.isCreatingNewMap \? this\.currentEditingMap\?\.id : null;\s*if \(!await this\.saveMapProperties\(\)\) return;\s*closeModal\(\);[\s\S]{0,80}if \(createdMapId\) await this\.loadMap\(createdMapId\);/);
});

//-----------------------------------------------------------------------------
// Projects

function projectManager() {
    const context = { console: quiet, require, process, Buffer, nw: {}, RRJson: require(path.join(editorRoot, 'src', 'utils', 'JsonFiles.js')) };
    context.window = context;
    const ProjectManager = vm.runInNewContext(`${read('src/ProjectManager.js')}\nProjectManager;`, context);
    return new ProjectManager();
}

test('a blank project starts with one actor in the party, whose class can level and hit', () => {
    const data = plain(projectManager().getStarterData('Starter'));
    const actor = data['Actors.json'][1];
    const heroClass = data['Classes.json'][actor.classId];
    assert.deepEqual(data['System.json'].partyMembers, [1]);
    assert.equal(actor.id, 1);
    assert.equal(heroClass.id, 1);
    assert.equal(heroClass.params.length, 8);
    for (const curve of heroClass.params) {
        assert.equal(curve.length, 100, 'a value for every level to 99');
        assert.ok(curve.every(value => Number.isFinite(value) && value > 0));
        assert.ok(curve[99] >= curve[1]);
    }
    const xparam = id => heroClass.traits.filter(trait => trait.code === 22 && trait.dataId === id).reduce((sum, trait) => sum + trait.value, 0);
    assert.ok(xparam(0) > 0.9, 'attacks land');
    assert.deepEqual(data['System.json'].testBattlers.map(battler => battler.actorId), [1]);
    assert.equal(data['Map001.r3d.json'], undefined, 'the starter map is 2D and carries no sidecar');
});

test('Save As copies the project under a new name, leaves its lock behind, and refuses a place inside it or one already there', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-save-as-'));
    try {
        const source = path.join(root, 'Quest');
        fs.mkdirSync(path.join(source, 'data'), { recursive: true });
        fs.mkdirSync(path.join(source, 'img', 'faces'), { recursive: true });
        fs.writeFileSync(path.join(source, 'project.rpgreactor'), JSON.stringify({ name: 'Quest', version: '0.99.1', engine: 'RPG Reactor' }));
        fs.writeFileSync(path.join(source, 'data', 'Map001.json'), '{"id":1}');
        fs.writeFileSync(path.join(source, 'img', 'faces', 'Hero.png'), Buffer.from([137, 80, 78, 71]));
        fs.writeFileSync(path.join(source, '.rpgreactor.lock'), '{"pid":1}');
        const manager = projectManager();
        const target = path.join(root, 'Quest Copy');
        assert.equal(await manager.copyProjectTo(source, target, 'Quest Copy'), path.resolve(target));
        assert.equal(fs.readFileSync(path.join(target, 'data', 'Map001.json'), 'utf8'), '{"id":1}');
        assert.deepEqual([...fs.readFileSync(path.join(target, 'img', 'faces', 'Hero.png'))], [137, 80, 78, 71]);
        assert.equal(fs.existsSync(path.join(target, '.rpgreactor.lock')), false, 'the lock stays with the original');
        assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'project.rpgreactor'), 'utf8')).name, 'Quest Copy');
        assert.equal(JSON.parse(fs.readFileSync(path.join(source, 'project.rpgreactor'), 'utf8')).name, 'Quest', 'the original is untouched');
        assert.ok(fs.existsSync(path.join(source, '.rpgreactor.lock')));
        await assert.rejects(manager.copyProjectTo(source, target, 'Quest Copy'), /already exists/);
        await assert.rejects(manager.copyProjectTo(source, path.join(source, 'Inner'), 'Inner'), /inside the project/);
        await assert.rejects(manager.copyProjectTo(source, source, 'Quest'), /inside the project/);
        assert.deepEqual(fs.readdirSync(root).sort(), ['Quest', 'Quest Copy'], 'no half-made copy is left');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    const controller = read('src/ProjectController.js');
    assert.match(controller, /async saveProjectAs\(\) \{[\s\S]{0,300}if \(!await this\.confirmUnsavedChanges\(\)\) return;/);
    assert.match(controller, /await this\.projectManager\.copyProjectTo\(sourcePath, targetPath, choice\.name\);[\s\S]{0,500}await this\.openProjectAtPath\(targetPath\);/);
    assert.match(read('index.html'), /data-action="save-project-as"[^>]*><span data-i18n-text-source="Save Project As…">Save Project As…<\/span>/);
    assert.match(read('src/UIManager.js'), /case 'save-project-as':\s*if \(this\.callbacks\.saveProjectAs\) this\.callbacks\.saveProjectAs\(\);/);
});

//-----------------------------------------------------------------------------
// A map naming a tileset that is not there

test('the map bar warns of a missing tileset, and the warning goes once the map has one', () => {
    const elements = {};
    const left = { children: [], appendChild(child) { this.children.push(child); elements[child.id] = child; } };
    const document = {
        getElementById: id => (id === 'map-info-left' ? left : elements[id] || null),
        createElement: () => ({ hidden: false, title: '', textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } })
    };
    const source = read('src/main.js');
    const at = source.indexOf('    updateMissingTilesetNotice(map, tilemapManager) {');
    const body = source.slice(at, source.indexOf('\n    }\n', at) + 6);
    const Probe = vm.runInNewContext(`(class { ${body} })`, { document, window: {} });
    const tilesets = [null, { id: 1 }];
    const tilemap = { databaseManager: { getTileset: id => tilesets[id] || null } };
    new Probe().updateMissingTilesetNotice({ tilesetId: 10 }, tilemap);
    const notice = elements['map-missing-tileset'];
    assert.equal(notice.textContent, 'Tileset 10 is missing');
    assert.match(notice.title, /Map Properties/);
    assert.equal(notice.hidden, false);
    new Probe().updateMissingTilesetNotice({ tilesetId: 1 }, tilemap);
    assert.equal(notice.hidden, true);
    assert.equal(left.children.length, 1);
    assert.match(source, /this\.updateMissingTilesetNotice\(map, tilemapManager\);/);
});

//-----------------------------------------------------------------------------
// Escape

test('Escape, the × and Cancel close the Event Editor through the asking close', async () => {
    const EventEditor = vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, { console: quiet, document: { getElementById: () => null, querySelector: () => null } });
    const editor = Object.create(EventEditor.prototype);
    let open = true, answer = false, cancelled = 0;
    editor.isOpen = () => open;
    editor.resolvePendingChanges = async ({ closing }) => { assert.equal(closing, true); return answer; };
    editor.cancelChanges = () => { cancelled++; open = false; };
    assert.equal(await editor.requestClose(), false, 'kept open when the question is cancelled');
    assert.equal(cancelled, 0);
    answer = true;
    assert.equal(await editor.requestClose(), true);
    assert.equal(cancelled, 1);
    assert.equal(await editor.requestClose(), false, 'nothing to close');

    const manager = read('src/EventManager.js');
    assert.match(manager, /window\.RRKeyboardNavigation\.modal\(modal, \{ onEscape: requestClose \}\);/);
    assert.match(manager, /if \(closeBtn\) closeBtn\.addEventListener\('click', requestClose\);/);
    assert.match(read('src/event/EventEditorWindow.js'), /if \(editor && editor\.requestClose\) await editor\.requestClose\(\);/);
    // Cancel asks too: a button wired the way _bindModalChrome wires it closes through requestClose.
    const buttons = {};
    const wired = Object.create(EventEditor.prototype);
    let asked = 0;
    wired.requestClose = () => { asked++; };
    wired.cancelChanges = () => { throw new Error('Cancel asks first'); };
    const Wiring = vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, { console: quiet, document: { getElementById: id => (buttons[id] = buttons[id] || {}), querySelector: () => null } });
    Wiring.prototype._bindModalChrome.call(wired);
    buttons['event-editor-cancel-btn'].onclick();
    assert.equal(asked, 1);
});

test('Escape and the × close the Forge, asking first when a tool holds work', async () => {
    const asked = [];
    const context = { console: quiet, window: { addEventListener() {}, I18n: null }, document: {}, RRDialog: { confirm: async (message, options) => { asked.push([message, options.ok]); return context.answer; } } };
    const ForgeManager = vm.runInNewContext(`${read('src/forge/ForgeManager.js').replace(/^[\s\S]*?(class ForgeManager)/m, (whole, head) => whole.slice(0, whole.indexOf(head)).replace(/new [A-Za-z0-9]+\(\)/g, 'null') + head)}\nForgeManager;`, context);
    const forge = Object.create(ForgeManager.prototype);
    forge._t = key => key;
    let closed = 0;
    forge.close = () => { closed++; forge.workspaceModal.style.display = 'none'; };
    forge.workspaceModal = { style: { display: 'flex' } };
    forge.activeToolId = 'project-tools';
    forge.projectTools = { holdsWork: () => true };
    context.answer = false;
    assert.equal(await forge.requestClose(), false);
    assert.equal(closed, 0);
    assert.equal(asked.length, 1);
    context.answer = true;
    assert.equal(await forge.requestClose(), true);
    assert.equal(closed, 1);
    forge.workspaceModal.style.display = 'flex';
    forge.projectTools = { holdsWork: () => false };
    assert.equal(await forge.requestClose(), true, 'nothing held: it closes without asking');
    assert.equal(asked.length, 2);
    const source = read('src/forge/ForgeManager.js');
    assert.match(source, /RRKeyboardNavigation\?\.modal\(this\.workspaceModal, \{ onEscape: \(\) => this\.requestClose\(\) \}\);/);
    assert.match(source, /\.rr-forge-close'\)\.addEventListener\('click', \(\) => this\.requestClose\(\)\);/);
});

test('the Event Editor keeps Options, Priority and Trigger out of the scrolling settings; an empty Image box is small', () => {
    const { createDocument } = require('./helpers/card-dom.cjs');
    const { document } = createDocument();
    const previous = global.document;
    global.document = document;
    try {
        const Page = require('../src/event/EventPageEditor.js');
        const view = Object.create(Page.prototype);
        view.parentEditor = { currentEvent: { pages: [{}] } };
        for (const name of ['Conditions', 'Image', 'Movement', 'Options', 'Priority', 'Trigger']) {
            view['create' + name + 'Section'] = () => {
                const section = document.createElement('div');
                section.textContent = name;
                if (name === 'Image') { const box = document.createElement('div'); box.className = 'image-preview-box'; section.appendChild(box); }
                return section;
            };
        }
        const container = document.createElement('div');
        view.renderPageConfiguration(container, {}, 0);
        const settings = container.querySelector('.event-page-settings');
        assert.match(settings.style.cssText, /overflow-y: auto/);
        assert.equal(container.style.overflow, 'hidden');
        assert.deepEqual(['Conditions', 'Image', 'Movement'].map(name => settings.textContent.includes(name)), [true, true, true]);
        const fixed = container.querySelector('.event-priority-trigger');
        assert.ok(fixed && !settings.contains(fixed), 'Priority and Trigger sit below the scrolling part');
        assert.ok(fixed.textContent.includes('Priority') && fixed.textContent.includes('Trigger'));
        // A page with no picture keeps the full box too (2026-10-25): no short strip with a gap below it.
        const picture = settings.children[1];
        assert.equal(picture.style.flex, '1 0 140px');
        assert.equal(picture.style.minHeight, '140px');
        assert.equal(picture.querySelector('.image-preview-box').style.minHeight, '88px');
    } finally {
        global.document = previous;
    }
});
