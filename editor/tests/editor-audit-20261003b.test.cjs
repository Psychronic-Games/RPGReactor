// Second hands-on editor audit of 2026-10-03: the Controls page's battle bindings, a light's own tag under a
// structure stamp, and the eraser going down when a paint tool is picked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');

global.document = global.document || { addEventListener() {}, removeEventListener() {} };
global.window = global.window || {};
const DatabaseControlsEditor = require('../src/database/DatabaseControlsEditor.js');
const controlsEditor = system => {
    const editor = new DatabaseControlsEditor({ data: { system }, getSystem: () => system }, null, null, null);
    editor.render = () => {};
    return editor;
};

test('the Controls page lists an Action battle\'s keys and buttons with the runtime\'s own names and defaults', () => {
    const runtime = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_controls.js'), 'utf8');
    const literal = name => {
        const found = runtime.match(new RegExp(`ReactorControls\\.${name} = (\\{[\\s\\S]*?\\});`));
        assert.ok(found, name);
        return new Function(`return ${found[1]};`)();
    };
    assert.deepEqual(DatabaseControlsEditor.DEFAULT_ACTION_KEYS, literal('DEFAULT_ACTION_KEYS'));
    assert.deepEqual(DatabaseControlsEditor.DEFAULT_ACTION_BUTTONS, literal('DEFAULT_ACTION_BUTTONS'));
    const names = new Function(`return ${runtime.match(/ReactorControls\.BATTLE_ACTIONS = (\[[\s\S]*?\]);/)[1]};`)();
    assert.deepEqual(DatabaseControlsEditor.BATTLE_ACTIONS.map(([name]) => name), names, 'one row per action the battle reads');
    // The game reads them from these two keys.
    assert.match(runtime, /own\.actionKeys && typeof own\.actionKeys === "object" \? own\.actionKeys : this\.DEFAULT_ACTION_KEYS/);
    assert.match(runtime, /own\.actionButtons && typeof own\.actionButtons === "object" \? own\.actionButtons : this\.DEFAULT_ACTION_BUTTONS/);
    // A Tactical battle has named actions of its own: the rows edit those, with the runtime's names and defaults.
    const tactical = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_fight_tactical.js'), 'utf8');
    for (const [name] of DatabaseControlsEditor.TACTICAL_ACTIONS) assert.ok(tactical.includes(`F.key("${name}")`), `${name} is read by the tactical driver`);
    assert.deepEqual(DatabaseControlsEditor.DEFAULT_TACTICAL_KEYS, literal('DEFAULT_TACTICAL_KEYS'));
    assert.deepEqual(DatabaseControlsEditor.DEFAULT_TACTICAL_BUTTONS, literal('DEFAULT_TACTICAL_BUTTONS'));
    assert.deepEqual(DatabaseControlsEditor.TACTICAL_SYMBOLS, literal('TACTICAL_SYMBOLS'));
    assert.deepEqual(DatabaseControlsEditor.TACTICAL_ACTIONS.map(([name]) => name), new Function(`return ${runtime.match(/ReactorControls\.TACTICAL_ACTIONS = (\[[\s\S]*?\]);/)[1]};`)());
    // The stock keys and buttons give the stock tactical ones, as the game works them out.
    assert.deepEqual(DatabaseControlsEditor.TACTICAL_VIEW_KEYS, literal('TACTICAL_VIEW_KEYS'));
    assert.deepEqual(DatabaseControlsEditor.TACTICAL_VIEW_STOCK, literal('TACTICAL_VIEW_STOCK'));
    assert.deepEqual(DatabaseControlsEditor.tacticalFrom(DatabaseControlsEditor.DEFAULT_KEYS, null, DatabaseControlsEditor.TACTICAL_VIEW_KEYS), DatabaseControlsEditor.DEFAULT_TACTICAL_KEYS);
    assert.deepEqual(DatabaseControlsEditor.tacticalFrom(DatabaseControlsEditor.DEFAULT_GAMEPAD, DatabaseControlsEditor.DEFAULT_TACTICAL_BUTTONS), DatabaseControlsEditor.DEFAULT_TACTICAL_BUTTONS);
    assert.match(runtime, /own\.tacticalKeys && typeof own\.tacticalKeys === "object" \? own\.tacticalKeys : this\.tacticalFrom\(Input\.keyMapper, null, this\.TACTICAL_VIEW_KEYS\)/);
    assert.match(runtime, /own\.tacticalButtons && typeof own\.tacticalButtons === "object" \? own\.tacticalButtons\s*: this\.tacticalFrom\(Input\.gamepadMapper, this\.DEFAULT_TACTICAL_BUTTONS\)/);
    const source = read('src/database/DatabaseControlsEditor.js');
    assert.match(source, /tt\('Action and First Person Battles'\)/);
    assert.match(source, /tt\('Tactical Battles'\)/);
    assert.match(source, /DatabaseControlsEditor\.TACTICAL_ACTIONS\.map\(tacticalKeyRow\)/, 'tactical rows bind the battle\'s own keys');
    assert.match(source, /DatabaseControlsEditor\.TACTICAL_ACTIONS\.map\(tacticalPadRow\)/);
});

test('an Action battle binding is stored only where it differs, and a key goes to one battle action', () => {
    const system = {};
    const editor = controlsEditor(system);
    assert.equal(editor.controls().actionKeys[70], 'attack');
    editor.assign('key-action', 'dodge', 70);
    assert.equal(system.reactorControls.actionKeys[70], 'dodge', 'F left Attack for Dodge');
    assert.equal(system.reactorControls.keys, undefined, 'the ordinary keys are still the stock ones, and unwritten');
    editor.assign('key-action', 'attack', 70);
    assert.equal(system.reactorControls, undefined, 'back to stock: nothing stored');
    editor.assign('pad-action', 'reload', 2);
    assert.equal(system.reactorControls.actionButtons[2], 'reload');
    editor.remove('pad-action', 2);
    assert.equal(system.reactorControls, undefined);
    editor.remove('key-action', 82);
    assert.equal(system.reactorControls.actionKeys[82], undefined, 'Reload has no key now');
    assert.equal(editor.controls().actionKeys[70], 'attack');
});

test('the Controls page keeps settings it has no field for, through a change and through Reset', () => {
    const system = { reactorControls: { lookSensitivity: 1.5, lookInvert: true, custom: { a: 1 } } };
    const editor = controlsEditor(system);
    editor.assign('key', 'shift', 70);
    assert.equal(system.reactorControls.lookSensitivity, 1.5);
    assert.equal(system.reactorControls.lookInvert, true);
    assert.deepEqual(system.reactorControls.custom, { a: 1 });
    assert.equal(system.reactorControls.keys[70], 'shift');
    // Reset, as the button does it.
    const source = read('src/database/DatabaseControlsEditor.js');
    const reset = source.match(/root\.querySelector\('\.rr-controls-reset'\)\.addEventListener\('click', \(\) => \{\n([\s\S]*?)\n            this\.databaseManager\.mutationGeneration/);
    assert.ok(reset, 'the Reset handler');
    new Function('DatabaseControlsEditor', `return function() {\n${reset[1]}\n}`)(DatabaseControlsEditor).call(editor);
    assert.deepEqual(system.reactorControls, { lookSensitivity: 1.5, lookInvert: true, custom: { a: 1 } }, 'the bindings went, the rest stayed');
    const plain = {};
    const second = controlsEditor(plain);
    second.assign('key', 'shift', 70);
    second.remove('key', 70);
    assert.equal(plain.reactorControls, undefined, 'a project with nothing else still returns to no entry');
});

test('a stamped building\'s light keeps its own tag: the building is recorded beside it, and removal still finds it', () => {
    const MapLights = require('../src/utils/MapLights.js');
    const previous = global.RRMapElevation;
    const SP = require('../src/utils/StructurePlan.js');
    const map = { id: 1, width: 20, height: 20, reactor3d: { version: 1, lights: [
        // A map stamped before lights carried the building's number: found by the tag, as it always was.
        { id: 'light1', type: 'point', x: 2, y: 2, tag: 'structure:7' },
        { id: 'light2', type: 'point', x: 3, y: 3, tag: 'porch' }
    ] } };
    const row = tag => ({ type: 'mapLight', at: [6, 6], z: 0, row: Object.assign({ type: 'point', x: 1, y: 1, radius: 4 }, tag ? { tag } : {}), shift: [5, 5] });
    SP.addEffects(map, [row('lantern'), row('')], 4);
    const lights = map.reactor3d.lights;
    const lantern = lights.find(light => light.tag === 'lantern');
    assert.ok(lantern, 'the plan\'s own tag was not overwritten by the building\'s');
    assert.equal(lantern.structure, 4);
    const plain = lights.find(light => light.tag === 'structure:4');
    assert.ok(plain && plain.structure === 4, 'a light with no tag of its own still answers to the building\'s');
    // The Lighting tool's normaliser keeps the mark, so a save does not orphan the light.
    assert.equal(MapLights.normalize ? MapLights.normalize(lantern, 'x').structure : MapLights.list(map).find(light => light.tag === 'lantern').structure, 4);
    // The author retags the untagged one in the Lighting tool; removing the building still takes both.
    plain.tag = 'windows';
    assert.equal(SP.removeGroupEffects(map, 4), true);
    assert.deepEqual(map.reactor3d.lights.map(light => light.id), ['light1', 'light2'], 'only the building\'s two went');
    assert.equal(SP.removeGroupEffects(map, 7), true, 'the older map\'s light is still found by its tag');
    assert.deepEqual(map.reactor3d.lights.map(light => light.tag), ['porch']);
    // Saving a selection as a structure keeps a light's own tag and drops the building's marks.
    for (const file of ['src/StructureWorkshop.js', 'src/utils/StructureFloors.js', 'src/utils/StructureCapture.js']) {
        const source = read(file);
        assert.match(source, /if \(!out\.tag \|\| \/\^structure:\\d\+\$\/\.test\(String\(out\.tag\)\)\) delete out\.tag; delete out\.structure;/, file);
        assert.doesNotMatch(source, /Object\.assign\(\{\}, row\); delete out\.tag;/, file);
    }
    // A light stamped before the mark existed takes it when its tag is changed in the Lighting tool.
    assert.match(read('src/LightingManager.js'), /const legacy = !light\.structure && \/\^structure:\(\\d\+\)\$\/\.exec\(String\(light\.tag \|\| ''\)\);/);
    global.RRMapElevation = previous;
});

test('picking the pencil puts the eraser down; a shape or the bucket keeps it to erase an area', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'UIManager.js'), 'utf8');
    const at = source.indexOf('    setDrawTool(tool) {'), end = source.indexOf('\n    }\n', at);
    assert.ok(at > 0 && end > at, 'setDrawTool is found');
    const setDrawTool = new Function('document', 'return function ' + source.slice(at, end + 6).trim() + ';')({ querySelectorAll: () => [], querySelector: () => null });
    const pick = (tool, state) => {
        const map = Object.assign({ eraserMode: false, shadowPenMode: false, currentTool: 'pencil',
            setEraserMode(on) { this.eraserMode = on; }, setShadowPenMode(on) { this.shadowPenMode = on; }, setTool(next) { this.currentTool = next; } }, state);
        setDrawTool.call({ callbacks: { getMapEditor: () => map } }, tool);
        return [map.currentTool, map.eraserMode, map.shadowPenMode];
    };
    assert.deepEqual(pick('pencil', { eraserMode: true, currentTool: 'rectangle' }), ['pencil', false, false]);
    assert.deepEqual(pick('pencil', { eraserMode: true }), ['pencil', false, false], 'the pencil again, with the eraser up');
    for (const tool of ['rectangle', 'circle', 'fill']) assert.deepEqual(pick(tool, { eraserMode: true }), [tool, true, false], tool + ' erases its area');
    assert.deepEqual(pick('fill', { shadowPenMode: true }), ['fill', false, false]);
});

test('Escape with a row menu open closes the menu, not the database', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'DatabaseEditorUI.js'), 'utf8');
    const at = source.indexOf('window.RRKeyboardNavigation.modal(viewer, {');
    const body = source.slice(at, source.indexOf('initialFocus', at));
    const onEscape = new Function('afterModels', 'cancelAndClose', 'document', 'return ({' + body.slice(body.indexOf('onEscape')).replace(/,\s*$/, '') + '}).onEscape;');
    const calls = [];
    let rowMenu = { remove() { calls.push('row menu'); rowMenu = null; } };
    const ui = { _databaseActionMenu: {}, closeDatabaseActionMenu() { calls.push('field menu'); this._databaseActionMenu = null; }, requestCloseDatabase() { calls.push('close'); } };
    const escape = onEscape.call(ui, then => then(), () => {}, { getElementById: id => (id === 'database-list-context-menu' ? rowMenu : null) });
    escape.call(ui);
    assert.deepEqual(calls, ['row menu'], 'the first Escape closes the row menu only');
    escape.call(ui);
    assert.deepEqual(calls, ['row menu', 'field menu'], 'the next the field menu');
    escape.call(ui);
    assert.deepEqual(calls, ['row menu', 'field menu', 'close'], 'and only then is closing the database asked');
});

test('a key taken from another action is said so: which key, what it was, what it is now', () => {
    const page = Object.create(DatabaseControlsEditor.prototype);
    page._t = text => text;
    const c = { keys: { 81: 'pageup' }, gamepad: { 0: 'ok' }, actionKeys: Object.assign({}, DatabaseControlsEditor.DEFAULT_ACTION_KEYS), actionButtons: {} };
    const aimKey = Number(Object.keys(c.actionKeys).find(code => c.actionKeys[code] === 'aim'));
    assert.deepEqual(page.moved(c, 'key-action', 'dodge', aimKey), { key: DatabaseControlsEditor.keyName(aimKey), from: 'Aim', to: 'Dodge' });
    assert.equal(page.moved(c, 'key-action', 'aim', aimKey), null, 'the same action again is no move');
    assert.equal(page.moved(c, 'key-action', 'dodge', 222), null, 'a free key is no move');
    assert.deepEqual(page.moved(c, 'key', 'pagedown', 81), { key: 'Q', from: 'Previous page', to: 'Next page' }, 'the ordinary keys say so too');
    assert.equal(page.moved(c, 'key-jump', 'jump', 32), null);
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseControlsEditor.js'), 'utf8');
    assert.match(source, /class="rr-controls-moved" role="status"/);
});

test('a Stock Layout that names an unnamed interface names its list row too', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
    const at = source.indexOf('    applyStockLayout(kind) {'), body = source.slice(at, source.indexOf('\n    }\n', at));
    assert.match(body, /if \(field\) \{ field\.value = label; field\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\); \}/);
    const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(ui, /nameField\.addEventListener\('input', syncName\);/, 'the list listens for that event');
});

test('Escape closes the Plugin Manager when the focus fell to the page, and leaves a parameter dialog its own', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'PluginManager.js'), 'utf8');
    const at = source.indexOf('this._keyHandler = (e) => {'), end = source.indexOf('const helpSearch = this._helpSearch;', at);
    const head = source.slice(at + 'this._keyHandler = (e) => {'.length, end);
    const run = (state, event) => {
        const calls = [];
        const handler = new Function('modal', 'document', 'e', head + ' return "on";');
        const out = handler.call({ hide() { calls.push('hide'); } }, { style: { display: state.shown ? 'block' : 'none' }, contains: target => target === 'inside' },
            { querySelector: () => (state.child ? {} : null) }, Object.assign({ key: 'Escape', defaultPrevented: false, preventDefault() {} }, event));
        return [calls.join(), out];
    };
    assert.deepEqual(run({ shown: true }, { target: 'body' }), ['hide', undefined]);
    assert.deepEqual(run({ shown: true }, { target: 'inside' }), ['', 'on'], 'inside the window the dialog trap answers');
    assert.deepEqual(run({ shown: true, child: true }, { target: 'body' }), ['', undefined], 'a parameter dialog takes its own Escape');
    assert.deepEqual(run({ shown: false }, { target: 'body' }), ['', undefined]);
    assert.deepEqual(run({ shown: true }, { target: 'body', key: 'a' }), ['', 'on']);
});

test('the command picker keeps the focus when a tab is picked, so Escape still closes it', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'event', 'EventCommandPicker.js'), 'utf8');
    const at = source.indexOf("tab.dataset.commandTab = String(index);");
    assert.ok(at > 0, 'each tab is marked with its index');
    const handler = source.slice(at, source.indexOf("tab.addEventListener('mouseenter'", at));
    assert.match(handler, /this\.renderContent\(\);[\s\S]*this\.modal\.querySelector\(`\[data-command-tab="\$\{index\}"\]`\)\?\.focus\(\{ preventScroll: true \}\);/);
});

test('a Tactical battle\'s keys follow the ordinary ones until one is changed on its card, and are stored only then', () => {
    const system = {};
    const editor = controlsEditor(system);
    assert.deepEqual(editor.controls().tacticalKeys, DatabaseControlsEditor.DEFAULT_TACTICAL_KEYS);
    assert.deepEqual(editor.controls().tacticalButtons, DatabaseControlsEditor.DEFAULT_TACTICAL_BUTTONS);
    // An ordinary key moved: the battle follows, and nothing tactical is written.
    editor.assign('key', 'pageup', 65);
    assert.equal(editor.controls().tacticalKeys[65], 'viewLeft');
    assert.equal(system.reactorControls.tacticalKeys, undefined);
    // A battle key of its own: stored, and no longer following.
    editor.assign('key-tactical', 'level', 76);
    assert.equal(system.reactorControls.tacticalKeys[76], 'level');
    assert.equal(system.reactorControls.tacticalKeys[65], 'viewLeft');
    editor.assign('key', 'pagedown', 66);
    assert.equal(editor.controls().tacticalKeys[66], undefined, 'own bindings stand as they are');
    editor.remove('key-tactical', 76);
    assert.equal(system.reactorControls.tacticalKeys[76], undefined);
    // A button, and the note that names what the key was.
    editor.assign('pad-tactical', 'unit', 4);
    assert.equal(system.reactorControls.tacticalButtons[4], 'unit');
    assert.ok(editor._moved && /view/i.test(editor._moved.from), 'the page says the button was the view\'s');
});
