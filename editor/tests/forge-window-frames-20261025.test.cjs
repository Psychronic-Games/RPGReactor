'use strict';
// While a window of its own is the one worked in (the Forge turning a model), the 2D map behind it stops drawing,
// as the 3D view parks: a map with water or a video drew every frame, and on NVIDIA the two windows' frames took
// turns, so the Forge showed every other frame (101 of 260 frames at 33 ms; none with the map covered, 2026-10-25).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProjectController.js'), 'utf8');

test('the 2D map counts as covered while another window\'s preview is the one in use', () => {
    const scheduler = source.slice(source.indexOf('new MapRenderScheduler(this.app'), source.indexOf('}).install({ inputElement: container });'));
    assert.match(scheduler, /isCovered: \(\) =>[\s\S]*\|\| window\.RRDetachedWindow\?\.previewActive\?\.\(\) === false/);
});

test('a covered map draws nothing, and draws again on the first frame it is uncovered', () => {
    global.window = global.window || {};
    const { MapRenderScheduler } = (() => {
        const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'TilemapManager.js'), 'utf8');
        const body = code.slice(code.indexOf('class MapRenderScheduler'), code.indexOf('if (typeof window !== \'undefined\') window.MapRenderScheduler'));
        return { MapRenderScheduler: new Function(body + '\nreturn MapRenderScheduler;')() };
    })();
    let covered = true, drawn = 0;
    const app = { stage: {}, renderer: {}, render() { drawn++; } };
    const scheduler = new MapRenderScheduler(app, { isCovered: () => covered, now: () => 0 });
    scheduler._appRender = () => app.render();
    scheduler.animating.add('water');
    for (let i = 0; i < 10; i++) scheduler.tick();
    assert.equal(drawn, 0);
    covered = false;
    scheduler.tick();
    assert.equal(drawn, 1);
});
