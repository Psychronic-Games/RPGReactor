'use strict';
// A 2000/2003 choice cursor as the old engines drew it (EasyRPG's Window::RefreshCursor and
// Window_Message::UpdateCursorRect): 8 px corners and only the span between them stretched, the box
// starting 10 px left of the choice text. Sunset over Imdahl's cursor is a pointing hand in the cell's
// two left corners; cut with MZ's 4 px corners it ran across the whole choice as two lines.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const display = runtimeSource('reactor_core_display.js'), windows = runtimeSource('reactor_windows.js');
const slice = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); };
const part = () => ({ frame: null, at: null, scale: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } }, setFrame(...f) { this.frame = f; }, move(...p) { this.at = p; } });

function cursor(system) {
    function Window() {}
    const box = { Window, $dataSystem: system };
    vm.runInNewContext(slice(display, 'Window.prototype._refreshCursor = function', 'Window.prototype._refreshArrows = function'), box);
    const w = Object.create(Window.prototype);
    w._cursorSprite = Object.assign(part(), { children: Array.from({ length: 9 }, part) });
    w._windowskin = {};
    w._clampedCursorRect = () => ({ x: 2, y: 0, width: 300, height: 16 });
    w._refreshCursor();
    return w._cursorSprite.children;
}

test('2000/2003 cursors keep 8 px corners from the 1.5x skin cell; MZ keeps its 4 px', () => {
    const legacy = cursor({ rrLegacyWindows: 2000 });
    assert.deepEqual(legacy[0].frame, [96, 96, 12, 12], 'the corner is the old 8 px corner at 1.5x');
    assert.deepEqual([legacy[0].scale.x, legacy[0].scale.y], [8 / 12, 8 / 12], 'drawn back at 8 px');
    assert.deepEqual(legacy[3].at, [292, 8]);
    assert.deepEqual(legacy[4].at, [8, 0]);
    assert.deepEqual([legacy[4].scale.x, legacy[4].scale.y], [284 / 24, 8 / 12]);
    assert.deepEqual(legacy[8].at, [8, 8]);
    const mz = cursor({});
    assert.deepEqual(mz[0].frame, [96, 96, 4, 4]);
    assert.deepEqual([mz[0].scale.x, mz[4].scale.y], [1, 1]);
    assert.deepEqual(mz[3].at, [296, 12]);
});

test('choices in the message span its width, the text 12 px in and the cursor 2 px in', () => {
    class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
    function Selectable() {}
    Object.assign(Selectable.prototype, {
        itemHeight() { return 16; }, rowSpacing() { return 4; }, lineHeight() { return 16; }, index() { return 0; }, cursorAll() { return false; },
        itemRect(i) { return new Rectangle(0, i * 16, this.innerWidth, 16); },
        itemLineRect(i) { const r = this.itemRect(i); return new Rectangle(r.x + 4, r.y, r.width - 8, r.height); },
        refreshCursor() { const r = this.itemRect(this.index()); this.setCursorRect(r.x, r.y, r.width, r.height); },
        setCursorRect(x, y, width, height) { this._cursorRect = { x, y, width, height }; },
        updatePlacement() {}, drawItemBackground() {}, updateBackground() {}, fittingHeight(rows) { return rows * 16 + 16; }
    });
    function Window_ChoiceList() {}
    Window_ChoiceList.prototype = Object.create(Selectable.prototype);
    const $gameMessage = { hasText: () => true, _texts: ['Will you go?'], choices: () => ['Yes', 'No'], background: () => 0 };
    const box = { Window_ChoiceList, $gameMessage, $dataSystem: { rrChoicesInMessage: true, rrLegacyWindows: 2000 } };
    vm.runInNewContext(slice(windows, '(function() {\n    const _updatePlacement = Window_ChoiceList.prototype.updatePlacement;', '// ---- the 2000/2003 save screen'), box);
    const mw = { x: 0, y: 160, width: 320, height: 80, padding: 8, innerWidth: 304, lineHeight: () => 16, updatePlacement() {} };
    const w = Object.assign(new Window_ChoiceList(), { _messageWindow: mw, padding: 8 });
    w.updatePlacement();
    Object.defineProperty(w, 'innerWidth', { get() { return this.width - 16; } });
    assert.deepEqual([w.x, w.width], [0, 320]);
    assert.equal(w.itemLineRect(0).x, 16, 'the choice text 12 px past the message text (and the 4 px item padding)');
    w.refreshCursor();
    assert.deepEqual(w._cursorRect, { x: 6, y: 0, width: 296, height: 16 }, 'from 10 px left of the text to 2 px inside the contents');
});
