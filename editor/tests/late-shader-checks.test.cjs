/**
 * A playtest leaves three's per-program shader checks off (three round trips to the GPU process each, about a
 * quarter of a map's arrival on the Iris Xe laptop) and asks each new program once, later, whether it linked.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a playtest builds without three\'s checks, the editor and a script keep them, a release has none', () => {
    const savedUtils = global.Utils, savedWindow = global.window, savedFlag = Reactor3D.checkShaderErrors;
    try {
        const renderer = () => ({ debug: { checkShaderErrors: true } });
        global.Utils = { isOptionValid: name => name === 'test' };
        let r = renderer(); Reactor3D.setShaderErrorChecks(r);
        assert.equal(r.debug.checkShaderErrors, false, 'a playtest: no per-program checks');
        assert.equal(r.__rrLateShaderChecks, true, 'but each program is asked later');
        Reactor3D.checkShaderErrors = true;
        r = renderer(); Reactor3D.setShaderErrorChecks(r);
        assert.equal(r.debug.checkShaderErrors, true, 'asked for: three\'s own checks');
        assert.equal(r.__rrLateShaderChecks, false);
        Reactor3D.checkShaderErrors = undefined;
        Reactor3D.LateShaderChecks.enabled = false;
        r = renderer(); Reactor3D.setShaderErrorChecks(r);
        assert.equal(r.debug.checkShaderErrors, true, 'the kill switch: a playtest checks as before');
        Reactor3D.LateShaderChecks.enabled = true;
        global.window = { reactor: { projectController: {} } };
        r = renderer(); Reactor3D.setShaderErrorChecks(r);
        assert.equal(r.debug.checkShaderErrors, true, 'the editor keeps them');
        assert.equal(r.__rrLateShaderChecks, false);
        delete global.window;
        global.Utils = { isOptionValid: () => false };
        r = renderer(); Reactor3D.setShaderErrorChecks(r);
        assert.equal(r.debug.checkShaderErrors, false, 'a released game');
        assert.equal(r.__rrLateShaderChecks, false);
    } finally {
        Reactor3D.LateShaderChecks.enabled = true; Reactor3D.checkShaderErrors = savedFlag;
        if (savedUtils === undefined) delete global.Utils; else global.Utils = savedUtils;
        if (savedWindow === undefined) delete global.window; else global.window = savedWindow;
    }
});

test('each new program is asked once, DELAY_MS after it appeared, and one that did not link is reported', () => {
    const L = Reactor3D.LateShaderChecks, savedGraphics = global.Graphics, savedError = console.error;
    const asked = [], errors = [];
    const gl = { LINK_STATUS: 0x8b82, getProgramParameter: (p, what) => { asked.push(p.id); return p.id !== 'broken'; }, getProgramInfoLog: () => 'ERROR: 0:1: oops ', isContextLost: () => false };
    const programs = [{ program: { id: 'good' }, name: 'Body' }, { program: { id: 'broken' }, name: 'Hair' }];
    const renderer = { __rrLateShaderChecks: true, info: { programs }, getContext: () => gl };
    global.Graphics = { frameCount: 1 };
    console.error = message => errors.push(message);
    const realNow = performance.now.bind(performance);
    let now = 1000;
    performance.now = () => now;
    try {
        L.tick(renderer);
        assert.deepEqual(asked, [], 'not on the spot: their first use reads them first');
        now += L.DELAY_MS; Graphics.frameCount++;
        L.tick(renderer);
        assert.deepEqual(asked, ['good', 'broken']);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /Material: Hair[\s\S]*oops/);
        Graphics.frameCount++; now += L.DELAY_MS;
        L.tick(renderer);
        assert.equal(asked.length, 2, 'asked once each');
        L.tick({ info: { programs }, getContext: () => gl });
        assert.equal(asked.length, 2, 'a renderer without the mark (the editor, a release) is never asked');
    } finally {
        performance.now = realNow; console.error = savedError;
        if (savedGraphics === undefined) delete global.Graphics; else global.Graphics = savedGraphics;
    }
});
