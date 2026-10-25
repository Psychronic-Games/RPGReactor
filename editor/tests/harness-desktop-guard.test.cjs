'use strict';
// Harness windows open on a headless display, never the desktop the owner is working on
// (editor/tests/smoke/webdriver-client.cjs, desktopDisplay).
const test = require('node:test');
const assert = require('node:assert/strict');
const { desktopDisplay } = require('./smoke/webdriver-client.cjs');

test('a harness refuses the desktop session and accepts a headless display', () => {
    assert.match(desktopDisplay({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }, 'linux'), /WAYLAND_DISPLAY/);
    assert.match(desktopDisplay({ DISPLAY: ':0' }, 'linux'), /DISPLAY=:0/);
    assert.equal(desktopDisplay({ DISPLAY: ':1', XDG_SESSION_TYPE: 'x11' }, 'linux'), '');
    assert.equal(desktopDisplay({ DISPLAY: ':99' }, 'linux'), '', "CI's xvfb");
    assert.equal(desktopDisplay({ WAYLAND_DISPLAY: 'wayland-0', RR_HARNESS_ON_DESKTOP: '1' }, 'linux'), '');
    assert.equal(desktopDisplay({ DISPLAY: ':0' }, 'win32'), '');
});
