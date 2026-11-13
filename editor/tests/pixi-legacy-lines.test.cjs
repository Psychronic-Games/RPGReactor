/**
 * Lines drawn with the Graphics calls of PIXI 4 to 7, on the bundled PIXI 8.
 *
 * In the old API a line style made every later shape and path draw its outline. PIXI 8 draws a path only when
 * `fill()` or `stroke()` is called, so an MV plugin that set a line style and drew (BraverPost's ribbons, Hendrix's
 * highlight frame) drew nothing, and black or invisible lines came out white. This runs the real `pixi.js` and
 * `pixi_compat.js` and reads what each Graphics was told to draw. Nothing is put on a screen here.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const libs = path.resolve(__dirname, '..', '..', 'runtime', 'libs');

function pixi() {
    const win = {
        navigator: { userAgent: 'node', maxTouchPoints: 0 },
        document: { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, baseURI: 'file:///' },
        addEventListener() {}, removeEventListener() {}, location: { href: 'file:///' }, console, setTimeout, clearTimeout, performance,
        requestAnimationFrame: () => 0, cancelAnimationFrame() {}, URL,
        Image: function() {}, HTMLCanvasElement: function() {}, HTMLImageElement: function() {}, HTMLVideoElement: function() {}
    };
    win.window = win; win.self = win; win.globalThis = win;
    const context = vm.createContext(win);
    for (const file of ['pixi.js', 'pixi_compat.js']) vm.runInContext(fs.readFileSync(path.join(libs, file), 'utf8'), context, { filename: file });
    // What a Graphics was told to draw: each fill or stroke, its width, colour and alpha, and the pieces of its path.
    context.told = graphics => graphics.context.instructions.map(i =>
        [i.action, i.action === 'stroke' ? i.data.style.width : null, i.data.style.color, i.data.style.alpha, i.data.path.instructions.map(p => p.action).join(' ')]);
    return context;
}

const run = (context, code) => JSON.parse(vm.runInContext(`JSON.stringify((() => { const g = new PIXI.Graphics(); ${code}; return told(g); })())`, context));

test('a line style draws the lines and outlines that follow it, with no fill and no endFill', () => {
    const context = pixi();
    assert.deepEqual(run(context, 'g.lineStyle(2, 0xffffff, 0.5); g.moveTo(0, 0); g.bezierCurveTo(1, 1, 2, 2, 3, 3)'),
        [['stroke', 2, 0xffffff, 0.5, 'moveTo bezierCurveTo']], 'a curve');
    assert.deepEqual(run(context, 'g.lineStyle(2, 0xff0000, 1); g.drawRect(0, 0, 10, 10)'),
        [['stroke', 2, 0xff0000, 1, 'rect']], 'a frame');
    assert.deepEqual(run(context, 'g.lineStyle(3, 0x000000); g.moveTo(0, 0); g.lineTo(5, 0); g.lineTo(5, 5); g.lineTo(0, 5)'),
        [['stroke', 3, 0, 1, 'moveTo lineTo lineTo lineTo']], 'a line of three pieces is one stroke, so its corners join; black stays black');
    assert.deepEqual(run(context, 'g.lineStyle({ width: 4, color: 0x00ff00, alpha: 1 }); g.drawCircle(0, 0, 3)'),
        [['stroke', 4, 0x00ff00, 1, 'circle']], 'the style given as an object');
    assert.deepEqual(run(context, 'g.lineStyle(2, 1); g.moveTo(0, 0); g.lineTo(1, 1); g.moveTo(5, 5); g.lineTo(6, 6)').map(told => told[4]),
        ['moveTo lineTo', 'moveTo lineTo'], 'a new start is a new line');
});

test('black, an alpha of 0 and a width of 0 mean what they meant', () => {
    const context = pixi();
    assert.deepEqual(run(context, 'g.lineStyle(2, 0xff0000, 0); g.drawRect(0, 0, 4, 4)'), [['stroke', 2, 0xff0000, 0, 'rect']], 'alpha 0 is invisible, not solid');
    assert.deepEqual(run(context, 'g.lineStyle(0, 0x000000, 1); g.beginFill(0x00ff00, 1); g.drawRect(0, 0, 4, 4); g.endFill()'),
        [['fill', null, 0x00ff00, 1, 'rect']], 'width 0 is no line: MV\'s usual call before a fill');
    assert.deepEqual(run(context, 'g.lineStyle(1, 0xffffff, 1); g.beginFill(0x00ff00); g.drawCircle(0, 0, 4); g.endFill()').map(told => told[0]),
        ['fill', 'stroke'], 'a filled shape with a line: filled, then outlined (a white line of width 1 too, which is PIXI 8\'s default)');
});

test('what the old API did not draw is not drawn, and the new API is left alone', () => {
    const context = pixi();
    assert.deepEqual(run(context, 'g.lineStyle(0); g.drawRect(5, 5, 1, 1); g.endFill()'), [], 'a shape with no line and no fill');
    assert.deepEqual(run(context, 'g.lineStyle(2, 1); g.moveTo(0, 0); g.lineTo(1, 1); g.clear(); g.moveTo(0, 0); g.lineTo(2, 2)'), [], 'clear takes the line style with it');
    assert.deepEqual(run(context, 'g.moveTo(0, 0).lineTo(3, 3).stroke({ width: 1, color: 5 })'), [['stroke', 1, 5, 1, 'moveTo lineTo']], 'PIXI 8 calls with no old line style');
    assert.deepEqual(run(context, 'g.beginFill(0xff); g.drawRect(0, 0, 2, 2); g.endFill()'), [['fill', null, 0xff, 1, 'rect']], 'a plain fill');
    assert.deepEqual(run(context, 'g.rect(0, 0, 2, 2); g.endFill()').map(told => told[0]), ['fill'], 'endFill alone still fills, as PIXI\'s own does');
});
