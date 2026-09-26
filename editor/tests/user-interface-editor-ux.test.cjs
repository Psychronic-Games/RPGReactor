'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'editor', 'css', 'styles.css'), 'utf8');
const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');

function editorWith(system = {}) {
    const manager = {
        data: { system: Object.assign({ advanced: { screenWidth: 800, screenHeight: 600 } }, system) },
        getSystem() { return this.data.system; }, getUserInterfaces() { return []; }, getCommonEvents() { return []; }, mutationGeneration: 0
    };
    const editor = new Editor(manager);
    editor._t = value => value;
    return editor;
}

function silenceRendering(editor) {
    editor.renderTree = () => {};
    editor.renderProperties = () => {};
    editor.refreshFirstFocus = () => {};
    editor.scheduleRender = () => {};
}

test('Use As derives Custom from System pointers and preserves compatibility roles', () => {
    const editor = editorWith();
    editor.current = { id: 7, mode: 'scene', roles: ['status'], nodes: [] };
    let markup = editor.replacementRoleMarkup();
    assert.match(markup, /role="combobox"/);
    assert.match(markup, /role="listbox" aria-multiselectable="true"/);
    assert.match(markup, /rr-ui-role-value[^>]*>Custom</);
    assert.doesNotMatch(markup, /rr-ui-role-badge/);

    const system = editor.replacementSystem();
    system.reactorStatusInterfaceId = 7;
    system.reactorMenuInterfaceId = 9;
    assert.deepEqual(editor.assignedReplacementRoles(), ['status']);
    assert.equal(editor.clearReplacementRoles(), true);
    assert.equal(system.reactorStatusInterfaceId, 0);
    assert.equal(system.reactorMenuInterfaceId, 9, 'Custom clears only pointers to this interface');
    assert.deepEqual(editor.current.roles, ['status'], 'Custom and unchecking preserve compatibility');
    assert.equal(editor.setReplacementRole('menu', true), true);
    assert.equal(system.reactorMenuInterfaceId, 7, 'checking reassigns the System field');
    assert.deepEqual(editor.current.roles, ['status', 'menu']);

    editor.current.mode = 'overlay';
    markup = editor.replacementRoleMarkup();
    assert.match(markup, /Custom \/ Overlay/);
    assert.match(markup, /aria-disabled="true"[^>]*data-replacement-role="status"/);
    system.reactorStatusInterfaceId = 7;
    markup = editor.replacementRoleMarkup();
    assert.doesNotMatch(markup.match(/data-replacement-role="status"[^>]*/)[0], /aria-disabled/, 'a stale assignment remains clearable');
});

test('role search is localized-case-insensitive and keyboard/outside cleanup is wired', () => {
    const editor = editorWith();
    const makeOption = (id, label) => ({ id, dataset: { roleLabel: label }, hidden: false,
        classList: { active: new Set(), add(value) { this.active.add(value); }, remove(value) { this.active.delete(value); } } });
    const options = [makeOption('custom', 'Personalizado'), makeOption('menu', 'MENÚ principal'), makeOption('save', 'Guardar')];
    const attributes = {};
    const search = { setAttribute(key, value) { attributes[key] = value; }, removeAttribute(key) { delete attributes[key]; } };
    const popup = { querySelectorAll: () => options, querySelector: () => search };
    editor.wrapper = { querySelector: () => popup };
    const visible = editor.filterReplacementRoles('menú');
    assert.deepEqual(visible.map(option => option.id), ['menu']);
    assert.equal(attributes['aria-activedescendant'], 'menu');
    assert.match(source, /\['ArrowDown', 'ArrowUp', 'Enter', ' '\]/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /document\.addEventListener\('pointerdown', this\._onRoleOutside/);
    assert.match(source, /document\.removeEventListener\('pointerdown', this\._onRoleOutside\)/);
});

test('layer endpoint operations carry subtrees and use one undo step', () => {
    const editor = editorWith();
    editor.current = editor.normalizeInterface({ coordinateSpace: 'screen', firstFocus: 0, nodes: [
        { id: 1, type: 'box', parent: 0, x: 100, y: 80, width: 160, height: 120 },
        { id: 2, type: 'box', parent: 1, x: 12, y: 16, width: 30, height: 20 },
        { id: 3, type: 'image', parent: 0, x: 420, y: 100, width: 200, height: 160 },
        { id: 4, type: 'box', parent: 3, x: 8, y: 8, width: 20, height: 20 }
    ] });
    editor.selectedId = 1;
    silenceRendering(editor);
    assert.equal(editor.moveNode(1, Infinity), true);
    assert.deepEqual(editor.current.nodes.map(node => node.id), [3, 4, 1, 2]);
    assert.equal(editor.undoStack.length, 1);
    editor.undo();
    assert.deepEqual(editor.current.nodes.map(node => node.id), [1, 2, 3, 4]);
});

test('drag-style reparent preserves screen position, descendant locals, selection, cycle safety, and undo', () => {
    const editor = editorWith();
    editor.current = editor.normalizeInterface({ coordinateSpace: 'screen', firstFocus: 0, nodes: [
        { id: 1, type: 'box', parent: 0, x: 100, y: 80, width: 160, height: 120 },
        { id: 2, type: 'box', parent: 1, x: 12, y: 16, width: 30, height: 20 },
        { id: 3, type: 'image', parent: 0, x: 420, y: 100, width: 200, height: 160 },
        { id: 4, type: 'box', parent: 3, x: 8, y: 8, width: 20, height: 20 }
    ] });
    editor.selectedId = 1;
    silenceRendering(editor);
    const before = editor.rects().get(1);
    assert.equal(editor.moveNodeTo(1, 3, 'inside'), true);
    assert.deepEqual(editor.current.nodes.map(node => node.id), [3, 4, 1, 2], 'inside appends as the frontmost child');
    assert.deepEqual(editor.rects().get(1), before);
    assert.deepEqual([editor.node(2).x, editor.node(2).y], [12, 16], 'descendant local coordinates remain untouched');
    assert.equal(editor.selectedId, 1);
    assert.equal(editor.undoStack.length, 1);
    assert.equal(editor.moveNodeTo(3, 1, 'inside'), false, 'a descendant cycle is rejected');
    assert.equal(editor.moveNodeTo(1, 3, 'inside'), false, 'an already-frontmost inside drop is a no-op');
    assert.equal(editor.undoStack.length, 1, 'rejected drops add no undo step');
    editor.undo();
    assert.deepEqual(editor.current.nodes.map(node => [node.id, node.parent]), [[1, 0], [2, 1], [3, 0], [4, 3]]);
});

test('canonical ordering is consumed defensively and parent changes canonicalize immediately', () => {
    const raw = [{ id: 2, parent: 1 }, { id: 1, parent: 0 }, { id: 4, parent: 3 }, { id: 3, parent: 0 }];
    assert.deepEqual(Editor.orderNodes(raw).map(node => node.id), [1, 2, 3, 4]);
    assert.match(source, /nodeAt\(rects, point\)[\s\S]*?DatabaseUserInterfaceEditor\.orderNodes\(this\.current\.nodes\)/);
    assert.match(source, /render\(\)[\s\S]*?for \(const node of DatabaseUserInterfaceEditor\.orderNodes\(this\.current\.nodes\)\)/);
    assert.match(source, /if \(reparent\) this\.canonicalizeNodes\(\)/);
    const runtime = fs.readFileSync(path.join(root, 'runtime', 'reactor_ui.js'), 'utf8');
    assert.match(runtime, /nodes: this\.orderNodes\(unique\)/);
    assert.match(runtime, /for \(const node of ReactorUI\.orderNodes\(this\._interface\.nodes\)\)/);
});

test('responsive editor uses one bounded workspace with a contained intermediate drawer', () => {
    assert.doesNotMatch(source, /rr-ui-props-panel is-open/, 'the narrow Inspector drawer starts closed');
    assert.doesNotMatch(source, /rr-ui-general|rr-ui-more|Select a node on the canvas or in the list\./);
    assert.match(source, /<div class="rr-ui-toolbar"[\s\S]*?rr-ui-toolbar-name[\s\S]*?rr-ui-toolbar-presentation[\s\S]*?rr-ui-replacements[\s\S]*?rr-ui-interface-settings[\s\S]*?rr-ui-playtest[\s\S]*?<\/div>\s*<div class="rr-ui-workspace">/);
    assert.match(css, /@container database-detail \(max-width: 1050px\)[\s\S]*?grid-template-columns: minmax\(240px, 300px\) minmax\(0, 1fr\)/);
    assert.match(css, /\.rr-ui-workspace > \.database-section\.rr-ui-props-panel \{[\s\S]*?display: none;[\s\S]*?position: absolute;[\s\S]*?bottom: 0/);
    assert.match(css, /\.rr-ui-workspace > \.database-section\.rr-ui-props-panel\.is-open \{[\s\S]*?display: flex/);
    assert.match(css, /@container database-detail \(max-width: 620px\)/);
    assert.doesNotMatch(css, /max-width: 1450px|grid-template-rows: minmax\(380px, auto\)|--rr-ui-fit: width/);
    assert.doesNotMatch(css, /\.rr-ui-general|\.rr-ui-more/);
    assert.match(css, /\.rr-ui-editor \{[\s\S]*?overflow: hidden/);
    assert.match(css, /\.rr-ui-workspace \{[\s\S]*?--rr-ui-fit: both/);
    assert.match(css, /\.rr-ui-canvas-tools \{[\s\S]*?flex-wrap: wrap/);
    assert.match(css, /\.rr-ui-workspace > \.database-section > \.database-section-content\.rr-ui-props[\s\S]*?overflow-y: auto/);
    for (const label of ['To Back', 'Back 1', 'Forward 1', 'To Front']) assert.ok(source.includes(`tt('${label}')`), label);
    for (const label of ['Send to Back', 'Move Backward', 'Move Forward', 'Bring to Front']) assert.ok(source.includes(`aria-label="\${tt('${label}')}"`), label);
    assert.match(source, /aria-label="\$\{tt\('Game scene'\)\}"/);
    assert.match(source, /aria-live="polite"/);
});

test('Interface Settings renders initially and applies existing record semantics through Inspector listeners', () => {
    const editor = editorWith();
    editor.current = editor.normalizeInterface({ id: 4, coordinateSpace: 'screen', mode: 'scene', background: 'blur', nodes: [] });
    const markup = editor.interfacePropertiesMarkup();
    assert.match(markup, /Interface Settings/);
    for (const group of ['Behavior', 'Transitions', 'Notes']) assert.match(markup, new RegExp(`rr-ui-group[^>]*>${group}<`));
    for (const cls of ['rr-ui-background', 'rr-ui-first-focus', 'cancel-type', 'overlay-visible-type', 'rr-ui-open-transition', 'rr-ui-close-transition', 'rr-ui-transition-duration', 'rr-ui-interface-note']) assert.match(markup, new RegExp(cls));
    assert.doesNotMatch(source, /Select a node on the canvas or in the list\./);

    const controls = new Map([
        ['.rr-ui-background', { value: 'dim' }], ['.rr-ui-first-focus', { value: '3' }],
        ['.rr-ui-open-transition', { value: 'fade' }], ['.rr-ui-close-transition', { value: 'slideLeft' }],
        ['.rr-ui-transition-duration', { value: '24' }], ['.rr-ui-interface-note', { value: 'Inspector note' }],
        ['.rr-ui-action[data-prefix="cancel"]', {}], ['.rr-ui-condition[data-prefix="overlay-visible"]', {}]
    ]);
    const panel = { querySelector: selector => controls.get(selector) || null };
    editor.wrapper = { querySelector: selector => selector === '.rr-ui-props' ? panel : null };
    editor.readAction = (_root, prefix, action) => { assert.equal(prefix, 'cancel'); action.type = 'closeAll'; };
    editor.readCondition = (_root, prefix, visible) => { assert.equal(prefix, 'overlay-visible'); visible.type = 'switch'; };
    editor.scheduleRender = () => {};
    editor.applyInterfaceProperties();
    assert.deepEqual({ background: editor.current.background, firstFocus: editor.current.firstFocus,
        open: editor.current.openTransition, close: editor.current.closeTransition, duration: editor.current.transitionDuration,
        note: editor.current.note, cancel: editor.current.cancel.type, visible: editor.current.visible.type },
    { background: 'dim', firstFocus: 3, open: 'fade', close: 'slideLeft', duration: 24,
        note: 'Inspector note', cancel: 'closeAll', visible: 'switch' });
    assert.match(source, /if \(this\.selected\(\)\) this\.applyProperties\(event\.target\);\s*else this\.applyInterfaceProperties\(\);/);
    assert.match(source, /rr-ui-interface-settings[^\n]*[\s\S]*?addEventListener\('click', \(\) => this\.select\(0\)\)/);
});

test('all redesign labels are hand-authored in every non-English locale', () => {
    const translations = fs.readFileSync(path.join(root, 'editor', 'src', 'I18nDeepTranslations.js'), 'utf8');
    const context = {};
    require('node:vm').runInNewContext(translations + '\nthis.deep = globalThis.RR_DEEP_TEXT_TRANSLATIONS;', context);
    const phrases = ['Interface', 'Use As', 'Playtest', 'On Cancel', 'Layers', '+ Add Node', 'Add Node', 'Back', 'Front',
        'Send to Back', 'Move Backward', 'Move Forward', 'Bring to Front', 'Parents draw before their children. Later rows draw on top.',
        'Game Reference', 'Game scene', 'Inspector', 'roles', 'Search roles', 'Overlay',
        'Interface Settings', 'Close Inspector', 'Initial Focus', 'Behavior', 'Transitions', 'Notes', 'To Back', 'Back 1', 'Forward 1', 'To Front',
        'Overlays cannot replace System scenes. Existing assignments can be cleared.', 'Custom clears this interface from System replacements.',
        'Layers, Back to Front', 'Pinned / locked', 'Add a node or use a captured layout to start.', 'Captured layers',
        'Add All to Front', 'Use as Starting Layout', 'Add to Front', 'Window', 'nodes added to front'];
    assert.equal(Object.keys(context.deep).length, 17);
    for (const [locale, entries] of Object.entries(context.deep)) for (const phrase of phrases) {
        assert.ok(entries[phrase], `${locale}: ${phrase}`);
    }
});

test('multi-selection toggles and ranges in layer order; movement carries selected descendants only once', () => {
    const editor = editorWith();
    silenceRendering(editor);
    editor.current = { nodes: [
        {...Editor.defaultNode('box', 1), x: 100, y: 80},
        {...Editor.defaultNode('text', 2), parent: 1, x: 10, y: 12},
        {...Editor.defaultNode('button', 3), x: 400, y: 90},
        {...Editor.defaultNode('text', 4), x: 500, y: 120}
    ], firstFocus: 3 };
    editor.select(1);
    editor.select(3, {range:true});
    assert.deepEqual(editor.selectedNodes().map(n=>n.id), [1,2,3]);
    assert.deepEqual(editor.selectionRoots().map(n=>n.id), [1,3]);
    const before = editor.snapshot();
    editor.pushUndo();
    editor.translateSelection(17, -9);
    assert.deepEqual(editor.current.nodes.map(n=>[n.x,n.y]), [[117,71],[10,12],[417,81],[500,120]]);
    editor.undo();
    assert.equal(editor.snapshot(), before);
    editor.redo();
    assert.equal(editor.node(2).x, 10);
    editor.select(2, {toggle:true});
    assert.deepEqual(editor.selectedNodes().map(n=>n.id), [1,3]);
    editor.select(4, {toggle:true});
    assert.deepEqual(editor.selectedNodes().map(n=>n.id), [1,3,4]);
});

test('group reparent, reorder, duplicate and delete preserve subtree links and undo atomically', () => {
    const editor = editorWith();
    silenceRendering(editor);
    editor.current = {nodes:[
        {...Editor.defaultNode('box',1),x:80,y:40},
        {...Editor.defaultNode('text',2),parent:1,x:8,y:12},
        {...Editor.defaultNode('button',3),x:300,y:20,focusRight:4},
        {...Editor.defaultNode('button',4),x:420,y:30,focusLeft:3},
        {...Editor.defaultNode('box',5),x:500,y:100}
    ],firstFocus:3};
    editor.select(1); editor.select(3,{toggle:true});
    const before=editor.snapshot(), rects=editor.rects();
    assert.equal(editor.moveNodeTo(1,2,'inside'),false,'cannot drop a group into its descendant');
    assert.equal(editor.moveNodeTo(1,5,'inside'),true);
    for (const id of [1,2,3]) assert.deepEqual(editor.rects().get(id),rects.get(id));
    assert.equal(editor.undoStack.length,1);
    editor.undo(); assert.equal(editor.snapshot(),before);
    editor.select(3); editor.select(4,{toggle:true});
    editor.moveNode(3,-Infinity);
    assert.deepEqual(editor.current.nodes.map(n=>n.id),[3,4,1,2,5]);
    editor.duplicateNode(3);
    const copies=editor.selectedNodes();
    assert.equal(copies.length,2);
    assert.equal(copies[0].focusRight,copies[1].id);
    assert.equal(copies[1].focusLeft,copies[0].id);
    editor.deleteNode(copies[0].id);
    assert.equal(editor.current.nodes.length,5);
    editor.undo(); assert.equal(editor.current.nodes.length,7);
    editor.select(1); editor.select(2,{toggle:true}); editor.deleteNode(1);
    assert.equal(editor.node(1),null); assert.equal(editor.node(2),null);
    editor.undo(); assert.equal(editor.node(2).parent,1);
});

test('text preview accepts lowercase and uppercase icon and color escape codes', () => {
    const editor=editorWith();
    const node={...Editor.defaultNode('text',1),text:'\\i[305] Knowledge \\I[4] \\c[2]Color'};
    const runs=editor.parseText(node)[0].runs;
    assert.deepEqual(runs.filter(run=>run.icon!==undefined).map(run=>run.icon),[305,4]);
    assert.equal(runs.at(-1).text,'Color');
});

test('a Battle HUD previews as the battle shows it: the whole party, no focus, the first actor\'s commands; the troop preview draws the bound HUD', () => {
    const actors = [null,
        { id: 1, name: 'Hero', classId: 1, traits: [] }, { id: 2, name: 'Mage', classId: 1, traits: [{ code: 41, dataId: 1 }] }, { id: 3, name: 'Rogue', classId: 1, traits: [] }];
    const data = { actors, classes: [null, { id: 1, traits: [{ code: 41, dataId: 2 }] }],
        system: { partyMembers: [1, 2, 3], testBattlers: [{ actorId: 3 }, { actorId: 1 }], skillTypes: ['', 'Magic', 'Special'], terms: { commands: ['', '', 'Attack', 'Guard', 'Item'] } } };
    const editor = new Editor({ data, getUserInterfaces: () => [] }, null, null, null);
    editor.current = { mode: 'scene', nodes: [], firstFocus: 0 };
    assert.deepStrictEqual(editor.previewPartyActors().map(actor => actor.name), ['Hero', 'Mage', 'Rogue'], 'a scene shows the starting party');
    editor.current = { mode: 'battle', nodes: [{ id: 1, type: 'list', focusable: true, enabled: { type: 'always' } }], firstFocus: 0 };
    assert.deepStrictEqual(editor.previewPartyActors().map(actor => actor.name), ['Rogue', 'Hero'], 'a battle HUD shows the battle-test party');
    assert.strictEqual(editor.previewControl(editor.current.nodes[0]).state, 'base', 'a battle HUD takes no focus');
    assert.deepStrictEqual(editor.previewActorCommands(), ['Attack', 'Special', 'Guard', 'Item'], 'the first actor\'s class adds Special');
    editor.current.previewPartySize = 3;
    assert.deepStrictEqual(editor.previewPartyActors().map(actor => actor.name), ['Rogue', 'Hero', 'Mage'], 'Preview party fills with the other actors in ID order');
    editor.current.previewPartySize = 1;
    assert.deepStrictEqual(editor.previewPartyActors().map(actor => actor.name), ['Rogue']);
    delete editor.current.previewPartySize;
    editor._previewParty = [actors[2]];
    assert.deepStrictEqual(editor.previewActorCommands(), ['Attack', 'Magic', 'Special', 'Guard', 'Item'], 'a caller\'s party wins; the actor adds Magic');
    const troop = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    assert.match(troop, /drawRecordInto\(ctx, hud, \{ party: setup\.party\.map\(entry => entry\.actor\) \}\)/, 'Show Battle UI draws the bound HUD with the battle-test party');
});
