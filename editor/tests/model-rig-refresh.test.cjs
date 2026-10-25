const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Editor = require('../src/database/Database3DEditor.js');

// Saving or removing a rig changes which default motions the model plays (Breathe, Walk...): the preview's
// rules and the Animations list ("Rig defaults: ...") have to follow at once, not after the model is reselected.
function editor(calls) {
    const e = new Editor({}, {});
    e._detail = { querySelector: () => null };
    e._t = key => key;
    for (const method of ['saveRig', '_rebuildInstance', 'renderRigBar', '_refreshMotionsButton']) e[method] = () => {};
    e.rebuildPlayback = () => calls.push('playback');
    e.renderRuleList = () => calls.push('list');
    return e;
}

test('removing a rig rebuilds playback and the Animations list', () => {
    const calls = [], e = editor(calls);
    e.customRig = { template: 'humanoid', markers: {}, bones: [{}] };
    e.removeRig();
    assert.equal(e.customRig, null);
    assert.deepEqual(calls, ['playback', 'list']);
});

test('saving a markers-only rig rebuilds playback and the Animations list', () => {
    const calls = [], e = editor(calls);
    const hadRigger = 'ModelRigger' in global, hadReactor = 'Reactor3D' in global;
    global.ModelRigger = { TEMPLATES: { gun: { markersOnly: true } } };
    global.Reactor3D = {};
    try {
        e._template = {};
        e.customParts = [];
        e._rigTemplate = 'gun';
        e._rigMarkers = { muzzle: [0, 0, 1] };
        e.bindRig();
        assert.equal(e.customRig.template, 'gun');
        assert.deepEqual(calls, ['playback', 'list']);
    } finally {
        if (!hadRigger) delete global.ModelRigger;
        if (!hadReactor) delete global.Reactor3D;
    }
});

test('a bound skeleton rig refreshes the same way', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/database/Database3DEditor.js'), 'utf8');
    const bound = source.slice(source.indexOf('this.customRig.weightsBin = ModelRigger.decodeWeightsBinary'), source.indexOf("this._t('Rig bound"));
    assert.match(bound, /this\._rigChanged\(\);/);
});

test('switching a map to 3D in Map Properties re-renders an open Build bar', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/ProjectController.js'), 'utf8');
    assert.match(source, /if \(was3D !== wants3D && this\.buildHotbar\?\.visible\) this\.buildHotbar\.render\(\);/);
});
