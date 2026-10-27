const assert = require('node:assert/strict');
const test = require('node:test');
const Editor = require('../src/database/Database3DEditor.js');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
    const project = {};
    const e = new Editor({}, { currentProject: project });
    e.selectedName = 'Model'; e._modelSelection = 1;
    e._detail = { isConnected: true, querySelector: () => ({ focus() {} }) };
    e._t = e._k = text => text;
    e._modelRecordStatus = message => { e.status = message; };
    e.saveRules = () => { e.saved = (e.saved || 0) + 1; };
    e.selectEffect = index => { e.selectedEffect = index; e._effectWork = clone(e.rawEffects[index]); e._cardMode = 'effect'; };
    e.editRule = index => { e.selectedRule = index; e._editingRule = index; e._cardMode = 'part'; };
    return e;
}
function clipboard(t, overrides = {}) {
    const previous = global.ReactorClipboard;
    let data;
    global.ReactorClipboard = {
        write: async (type, payload) => { data = { type, payload: clone(payload) }; return true; },
        read: async type => data?.type === type ? clone(data) : null,
        ...overrides
    };
    t.after(() => { if (previous === undefined) delete global.ReactorClipboard; else global.ReactorClipboard = previous; });
}

test('effect copy captures working edits and paste creates independent, uniquely named records', async t => {
    clipboard(t);
    const e = fixture();
    e.rawEffects = [{ name: 'Lamp', type: 'light', light: { radius: 5 }, anchor: { part: 'Arm', offset: [1, 2, 3] } }];
    e.selectEffect(0); e._effectWork.light.radius = 9;
    assert.equal(await e.copyModelRecord('effect'), true);
    e._effectWork.light.radius = 12;
    assert.equal(await e.pasteModelRecord('effect'), true);
    assert.equal(await e.pasteModelRecord('effect'), true);
    assert.deepEqual(e.rawEffects.map(x => x.name), ['Lamp', 'Lamp (2)', 'Lamp (3)']);
    assert.equal(e.rawEffects[0].light.radius, 5, 'copying did not save working edits over the source');
    assert.equal(e.rawEffects[1].light.radius, 9, 'the clipboard is a snapshot of the visible edits');
    e.rawEffects[1].anchor.offset[0] = 100;
    assert.equal(e.rawEffects[2].anchor.offset[0], 1);
    assert.equal(e.selectedEffect, 2, 'the pasted entry opens for editing');
    assert.equal(e.saved, 2);
});

test('animation paste imports referenced effects and remaps collisions without changing other animations', async t => {
    clipboard(t);
    const from = fixture();
    from.rawEffects = [{ name: 'Glow', light: { radius: 3 } }, { name: 'Glow (2)', animation: 4 }];
    from.rawAnimations = [{ name: 'Open', type: 'pose', keys: [{ at: 0.5, rotate: [0, 90, 0] }],
        effects: [{ effect: 'Glow' }, { effect: 'Glow (2)' }, { se: { name: 'Click' } }] }];
    from.selectedRule = 0;
    await from.copyModelRecord('animation');
    const to = fixture();
    to.rawEffects = [{ name: 'Glow', light: { radius: 50 } }];
    to.rawAnimations = [{ name: 'Existing', effects: [{ effect: 'Glow' }] }];
    assert.equal(await to.pasteModelRecord('animation'), true);
    assert.deepEqual(to.rawEffects.map(x => x.name), ['Glow', 'Glow (2)', 'Glow (2) (2)']);
    assert.deepEqual(to.rawAnimations[1].effects.map(x => x.effect), ['Glow (2)', 'Glow (2) (2)', undefined]);
    assert.equal(to.rawAnimations[0].effects[0].effect, 'Glow');
    assert.deepEqual(to.rawAnimations[1].keys, from.rawAnimations[0].keys);
    assert.equal(to.selectedRule, 1);
    // A duplicate on the source reuses identical dependencies.
    assert.equal(await from.pasteModelRecord('animation'), true);
    assert.equal(from.rawEffects.length, 2);
});

test('animation copies include current pose edits and nested timed effects', () => {
    const e = fixture();
    e.rawAnimations = [{ name: 'Turn', type: 'pose', custom: 'keep' }];
    e.selectedRule = e._editingRule = 0; e.selectedPartName = 'Turret';
    e._work = { ...Editor.defaultWork(), name: 'Aim', rotate: [0, 40, 0], effects: [{ at: 0.5, animation: 2 }] };
    const payload = e._modelRecordPayload('animation');
    assert.equal(payload.record.name, 'Aim');
    assert.equal(payload.record.part, 'Turret');
    assert.equal(payload.record.custom, 'keep');
    assert.deepEqual(payload.record.rotate, [0, 40, 0]);
    e._work.effects[0].animation = 9;
    assert.equal(payload.record.effects[0].animation, 2);
});

test('wrong clipboard types are ignored and a delayed paste cannot follow a model switch', async t => {
    let finish;
    clipboard(t, { read: () => new Promise(resolve => { finish = resolve; }) });
    const e = fixture();
    assert.equal(e._pasteModelRecordPayload('effect', { version: 1, kind: 'animation', record: {} }), false);
    assert.equal(e.saved, undefined);
    const pending = e.pasteModelRecord('effect');
    await Promise.resolve();
    e._modelSelection++;
    finish({ payload: { version: 1, kind: 'effect', record: { name: 'Late' } } });
    assert.equal(await pending, false);
    assert.equal(e.rawEffects.length, 0);
});

test('list shortcuts support Ctrl/Cmd and leave text inputs and unrelated controls alone', () => {
    const e = fixture(), calls = [];
    e.copyModelRecord = kind => calls.push('copy ' + kind);
    e.pasteModelRecord = kind => calls.push('paste ' + kind);
    const target = (list, typing = false) => ({ closest: selector =>
        selector === '.r3d-effect-list' && list === 'effect' || selector === '.r3d-rule-list' && list === 'animation'
            || selector === 'input, textarea, [contenteditable]' && typing ? {} : null });
    function key(value, node, meta = false) {
        let consumed = false;
        e._onKeyDown({ key: value, target: node, ctrlKey: !meta, metaKey: meta,
            preventDefault() { consumed = true; }, stopPropagation() {} });
        return consumed;
    }
    assert.equal(key('c', target('effect')), true);
    assert.equal(key('v', target('animation'), true), true);
    assert.equal(key('c', target('effect', true)), false);
    assert.equal(key('v', target(null)), false);
    assert.deepEqual(calls, ['copy effect', 'paste animation']);
});

test('context menu preserves current edits, supports blank-list paste and rejects stale actions', t => {
    const before = global.window;
    let menu;
    global.window = { reactor: { databaseEditorUI: { showDatabaseActionMenu(x, y, items) { menu = items; } } } };
    t.after(() => { if (before === undefined) delete global.window; else global.window = before; });
    const e = fixture();
    e.rawEffects = [{ name: 'Lamp', light: { radius: 3 } }]; e.selectEffect(0);
    e._effectWork.light.radius = 7;
    e._showModelRecordMenu('effect', 0, 0, 0);
    assert.equal(e._effectWork.light.radius, 7);
    menu.find(x => x.label === 'Duplicate').action();
    assert.equal(e.rawEffects[1].light.radius, 7);
    e._showModelRecordMenu('effect', -1, 0, 0);
    assert.equal(menu.find(x => x.label === 'Copy').enabled, false);
    assert.equal(menu.find(x => x.label === 'Paste').enabled, true);
    let pasted = false;
    e.pasteModelRecord = () => { pasted = true; };
    const action = menu.find(x => x.label === 'Paste').action;
    e._modelSelection++;
    action(); assert.equal(pasted, false);
});

test('column context menus reach section whitespace without taking text controls or parts', () => {
    const e = fixture(), calls = [], nodes = {};
    for (const selector of ['.r3d-record-column', '.r3d-rule-list', '.r3d-effect-list']) {
        nodes[selector] = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
            focus() { this.focused = true; }, closest() { return null; } };
    }
    e._detail.querySelector = selector => nodes[selector];
    e._showModelRecordMenu = (...args) => calls.push(args);
    e._bindModelRecordLists();
    const column = nodes['.r3d-record-column'];
    const target = (kind, index, control = false) => ({ closest(selector) {
        if (selector === '[data-model-record-kind]') return kind ? { dataset: { modelRecordKind: kind } } : null;
        if (selector === '[data-model-record-index]') return index === undefined ? null : { dataset: { modelRecordIndex: String(index) } };
        return control ? {} : null;
    } });
    function click(node) {
        let consumed = false;
        column.listeners.contextmenu({ target: node, clientX: 100, clientY: 200,
            preventDefault() { consumed = true; }, stopPropagation() {} });
        return consumed;
    }
    assert.equal(click(target('effect')), true, 'effect header/form/footer padding');
    assert.equal(click(column), true, 'bare column whitespace');
    assert.equal(click(target('animation')), true, 'animation section whitespace');
    assert.equal(click(target('effect', 2)), true, 'a row retains its own index');
    assert.equal(click(target('effect', undefined, true)), false, 'native control menu');
    assert.equal(click(target(null)), false, 'parts are outside these menus');
    assert.deepEqual(calls.map(args => args.slice(0, 2)), [['effect', -1], ['effect', -1], ['animation', -1], ['effect', 2]]);
    assert.equal(nodes['.r3d-effect-list'].focused, true);
    assert.equal(nodes['.r3d-rule-list'].focused, true);
});

test('deleting an animation being edited removes that row even when deselection clears its index', () => {
    const e = fixture();
    e.rawAnimations = [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }];
    e.selectedRule = e._editingRule = 0;
    e._poses = { first: { editingRule: 0 }, second: { editingRule: 1 } };
    e.deselectPart = () => { e.selectedRule = e._editingRule = -1; };
    e.renderRuleList = () => {};
    e.deleteRule();
    assert.deepEqual(e.rawAnimations.map(r => r.name), ['Second', 'Third']);
    assert.equal(e._poses.first.editingRule, -1);
    assert.equal(e._poses.second.editingRule, 0);
});

test('copied triggered animations preview together, track working anchors, and release removed slots', () => {
    const e=fixture(); e._object={};e._sim={};
    e.rawEffects=[{name:'Core',animation:122,trigger:'always'}, {name:'Core (2)',animation:122,trigger:'always',anchor:{offset:[1,2,3]}}];
    let plays=0,disposed=0;
    e._playEffectPreview=function(raw){this._fxPreviewDef=raw; this._fxPreview={active:true,stop(){this.active=false;},dispose(){disposed++;}};plays++;};
    e._disposeEffectQuad=()=>{};e._stopVideoPreview=()=>{};e._stopLightPreview=()=>{};
    e._updateTriggeredEffectPreview();
    assert.equal(plays,2);assert.equal(e._additionalEffectPreviews.size,1);
    const second=e._additionalEffectPreviews.get(1);
    assert.notEqual(e._fxPreview,second._fxPreview);
    e.selectEffect(1);e._effectWork.anchor.offset[1]=4;
    e._updateTriggeredEffectPreview();
    assert.equal(plays,2);assert.equal(second._fxPreviewDef.anchor.offset[1],4);
    e._effectWork.trigger='walking';e._updateTriggeredEffectPreview();
    assert.equal(e._additionalEffectPreviews.size,0);assert.equal(disposed,1);
    e._sim.walking=true;e._updateTriggeredEffectPreview();assert.equal(plays,3);
    e._stopEffectPreview();assert.equal(e._additionalEffectPreviews.size,0);assert.equal(disposed,2);
});

test('a media surface played on demand shows in the preview beside the always-on movie, selected or not',()=>{
 // The Demo's monitor arm: its static movie always plays, its Psychronic logo is called by the map's model by name.
 const e=fixture();e._object={};e._sim={};e._stopLightPreview=()=>{};e._disposeEffectQuad=()=>{};
 e._stopVideoPreview=function(){this._fxVideo=null;};
 e._playEffectPreview=function(raw){this._fxPreviewDef=raw;this._fxVideo={raw,file:raw.video.file};};
 e.rawEffects=[{type:'video',trigger:'always',video:{file:'static.mp4'}},{type:'video',video:{file:'logo.png'}},{type:'video',trigger:'action',video:{file:'call.png'}}];
 const shown=()=>[e._fxVideo&&e._fxVideo.file,...[...e._additionalEffectPreviews.values()].map(p=>p._fxVideo&&p._fxVideo.file)].sort();
 e._updateTriggeredEffectPreview();assert.deepEqual(shown(),['call.png','logo.png','static.mp4']);
 e.selectEffect(1);e._updateTriggeredEffectPreview();e._updateTriggeredEffectPreview();assert.deepEqual(shown(),['call.png','logo.png','static.mp4'],'the one in hand stays shown');
});

test('additional image surfaces appear immediately, keep independent playback and follow live edits',()=>{
 const e=fixture();e._object={};e._sim={};e._stopLightPreview=()=>{};e._disposeEffectQuad=()=>{};
 e._stopVideoPreview=function(){this._fxVideo=null;};
 let plays=0;e._playEffectPreview=function(raw){this._fxPreviewDef=raw;this._fxVideo={raw,file:raw.video.file};plays++;};
 e.rawEffects=[{type:'video',trigger:'always',video:{file:'first.png'}}];e._updateTriggeredEffectPreview();assert.equal(plays,1);
 e.rawEffects.push({type:'video',trigger:'always',video:{file:'second.png'},anchor:{offset:[1,2,3]}});e._updateTriggeredEffectPreview();assert.equal(plays,2);
 const second=e._additionalEffectPreviews.get(1);assert.equal(second._fxVideo.file,'second.png');assert.notEqual(second._fxVideo,e._fxVideo);
 e.selectEffect(1);e._effectWork.anchor.offset[0]=4;e._updateTriggeredEffectPreview();assert.equal(second._fxVideo.raw.anchor.offset[0],4);assert.equal(plays,2);
 e._effectWork.video.file='replacement.png';e._updateTriggeredEffectPreview();assert.equal(second._fxVideo.file,'replacement.png');assert.equal(plays,3);
 e.rawEffects.pop();e.selectedEffect=-1;e._updateTriggeredEffectPreview();assert.equal(e._additionalEffectPreviews.size,0);assert.equal(second._fxVideo,null);assert.equal(e._fxVideo.file,'first.png');
});
