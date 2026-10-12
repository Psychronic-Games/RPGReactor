'use strict';
// The SideMV sidescroller (MV, Galv/DK/MRP plugins) against MV itself: layer
// graphics that scroll, speech bubbles that shrink to their text, choices
// that answer once, MV window geometry and the action indicator's icon.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtime = path.join(__dirname, '..', '..', 'runtime');
const read = file => fs.readFileSync(path.join(runtime, file), 'utf8');
const compat = read('reactor_mv_compat.js');
const pixiCompat = read(path.join('libs', 'pixi_compat.js'));
const display = read('reactor_core_display.js');
const windows = read('reactor_windows.js');

function slice(source, startText, endText) {
    const start = source.indexOf(startText);
    const end = source.indexOf(endText, start + startText.length);
    assert.ok(start >= 0 && end > start, `locatable: ${startText.trim().slice(0, 60)}`);
    return source.slice(start, end);
}

test('a sprite built through PIXISuper reports anchor and tile changes as its own', () => {
    const start = pixiCompat.indexOf('    window.PIXISuper = function(PixiClass, instance, args) {');
    const end = pixiCompat.indexOf('\n    };\n', start) + '\n    };\n'.length;
    const window = {};
    vm.runInNewContext(pixiCompat.slice(start, end), { window, Reflect, WeakSet, TypeError, Object });
    class ObservablePoint { constructor(observer) { this._observer = observer; this._x = 0; } set x(v) { this._x = v; this._observer._onUpdate(this); } }
    class TilingSprite {
        constructor() {
            this._anchor = new ObservablePoint({ _onUpdate: () => this.onViewUpdate() });
            this._tileTransform = { observer: { _onUpdate: () => this.onViewUpdate() } };
            this._tileTransform.position = new ObservablePoint(this._tileTransform);
            this._tileTransform._onUpdate = () => this._tileTransform.observer._onUpdate();
        }
        onViewUpdate() { this.updates = (this.updates || 0) + 1; }
    }
    const Real = new Proxy(TilingSprite, {
        apply() { throw new TypeError("Class constructor TilingSprite cannot be invoked without 'new'"); }
    });
    const layer = Object.create(TilingSprite.prototype);
    window.PIXISuper(Real, layer, []);
    layer._tileTransform.position.x = -485;
    layer._anchor.x = 0.5;
    assert.equal(layer.updates, 2, 'both changes reach the sprite that draws');
});

test('a tiling sprite that changes size asks to be drawn again, once per change', () => {
    const context = { TilingSprite: function() {} };
    vm.runInNewContext(slice(display, 'TilingSprite.prototype.move = function', '\n/**') , context);
    const sprite = Object.create(context.TilingSprite.prototype);
    sprite.updates = 0;
    sprite.onViewUpdate = function() { this.updates++; };
    sprite.move(4, 4, 1096, 616);
    sprite.move(4, 4, 304, 52);
    sprite.move(4, 4, 304, 52);
    assert.deepEqual([sprite._width, sprite._height, sprite.updates], [304, 52, 2]);
    const legacy = Object.create(context.TilingSprite.prototype);
    legacy.move(0, 0, 10, 10);
    assert.equal(legacy._width, 10, 'a renderer without onViewUpdate still takes the size');
});

test('the choice list follows row metrics installed after it loads', () => {
    function Window_Command() {}
    Window_Command.prototype.itemHeight = function() { return 44; };
    Window_Command.prototype.rowSpacing = function() { return 4; };
    Window_Command.prototype.drawItemBackground = function() { this.backs = (this.backs || 0) + 1; };
    Window_Command.prototype.updatePlacement = function() {};
    Window_Command.prototype.updateBackground = function() {};
    function Window_ChoiceList() {}
    Window_ChoiceList.prototype = Object.create(Window_Command.prototype);
    const block = slice(windows, '    const _updatePlacement = Window_ChoiceList.prototype.updatePlacement;', '})();');
    const context = { Window_ChoiceList, $dataSystem: {}, $gameMessage: {} };
    vm.runInNewContext(`(function() {\n${block}})();`, context);
    Window_Command.prototype.itemHeight = function() { return 36; };
    Window_Command.prototype.rowSpacing = function() { return 0; };
    Window_Command.prototype.drawItemBackground = function() {};
    const list = new Window_ChoiceList();
    list.drawItemBackground(0);
    assert.deepEqual([list.itemHeight(), list.rowSpacing(), list.backs], [36, 0, undefined]);
});

function installMvMetrics(advanced) {
    class Bitmap {
        constructor(w, h) { this.width = w; this.height = h; this.blts = []; }
        blt(...args) { this.blts.push(args); }
        clear() { this.blts = []; }
        destroy() { this.destroyed = true; }
    }
    function Window_Base() {}
    function Window_Selectable() {}
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    function Window_Command() {}
    Window_Command.prototype = Object.create(Window_Selectable.prototype);
    Window_Command.prototype.itemTextAlign = () => 'center';
    function Window_HorzCommand() {}
    Window_HorzCommand.prototype = Object.create(Window_Command.prototype);
    function Window() {}
    Window.prototype._refreshBack = function() {};
    Window.prototype.destroy = function() { this.windowDestroyed = true; };
    const context = { Bitmap, Window_Base, Window_Selectable, Window_Command, Window_HorzCommand, Window, Rectangle: class {}, $dataSystem: { advanced } };
    context.global = context;
    const fn = slice(compat, '    function installWindowMetricsCompatibility() {', '    function installSceneCompatibility() {');
    vm.runInNewContext(fn + '\ninstallWindowMetricsCompatibility();', context);
    return context;
}

test('MV games pad windows by 18 unless System 2 says otherwise, and list commands from the left', () => {
    const mv = installMvMetrics(undefined);
    assert.equal(new mv.Window_Base().standardPadding(), 18);
    assert.equal(new mv.Window_Command().itemTextAlign(), 'left');
    assert.equal(new mv.Window_HorzCommand().itemTextAlign(), 'center');
    assert.equal(new (installMvMetrics({ windowPadding: 10 }).Window_Base)().standardPadding(), 10);
});

test('an MV window back is the stretched back and the tiled pattern in one bitmap', () => {
    const mv = installMvMetrics(undefined);
    const tiling = { visible: true };
    const sprite = {
        children: [tiling], scale: { x: 3, y: 3 }, visible: false,
        move(x, y) { this.at = [x, y]; },
        setFrame(x, y, w, h) { this.frame = [x, y, w, h]; },
        setColorTone(tone) { this.tone = tone; }
    };
    const win = Object.assign(new mv.Window(), {
        _backSprite: sprite, _margin: 4, _width: 312, _height: 60, _colorTone: [0, 0, 0, 0],
        _windowskin: { isReady: () => true }
    });
    win._refreshBack();
    const bitmap = sprite.bitmap;
    assert.equal(tiling.visible, false, 'the separate pattern layer is not drawn');
    assert.deepEqual([bitmap.width, bitmap.height, sprite.at, sprite.frame, sprite.scale.x], [304, 52, [4, 4], [0, 0, 304, 52], 1]);
    assert.deepEqual(bitmap.blts[0].slice(1), [0, 0, 96, 96, 0, 0, 304, 52], 'the back first, stretched');
    assert.equal(bitmap.blts.length, 1 + 4, 'then the 96 px pattern tiled across');
    win._refreshBack();
    assert.equal(sprite.bitmap, bitmap, 'the same size reuses its bitmap');
    win._width = 120;
    win._refreshBack();
    assert.equal(bitmap.destroyed, true);
    assert.equal(sprite.bitmap.width, 112);
    const last = sprite.bitmap;
    win.destroy();
    assert.equal(last.destroyed, true, 'the window takes its back picture with it');
    assert.equal(win.windowDestroyed, true);
});

test('MV message commands step past what they ran, so a wrapper that drops the result still advances', () => {
    function Game_Interpreter() { this._index = 0; }
    Game_Interpreter.prototype.command101 = function() { this._index = 2; return true; };
    Game_Interpreter.prototype.command102 = function() { return false; };
    Game_Interpreter.prototype.executeCommand = function() {
        if (!this['command' + this.code]([])) return false;
        this._index++;
        return true;
    };
    const context = { Game_Interpreter };
    context.global = context;
    const fn = slice(compat, '    function installMessageCommandStepCompatibility() {', '    function installEventCollisionCompatibility() {');
    vm.runInNewContext(fn + '\ninstallMessageCommandStepCompatibility();', context);
    const stepped = Game_Interpreter.prototype.command101;
    Game_Interpreter.prototype.command101 = function(params) { stepped.call(this, params); };
    const interpreter = new Game_Interpreter();
    interpreter.code = 101;
    interpreter.executeCommand();
    assert.equal(interpreter._index, 3, 'past the Show Choices that Show Text consumed');
    interpreter.code = 102;
    interpreter.executeCommand();
    assert.equal(interpreter._index, 3, 'a busy message waits in place');
});

test('MV icon and face size statics exist for plugins that size bitmaps from them', () => {
    const context = {
        ImageManager: { iconWidth: 32, iconHeight: 32, faceWidth: 144, faceHeight: 144 },
        Window_Base: { _faceWidth: 150 }, Sprite_StateIcon: {}
    };
    context.global = context;
    vm.runInNewContext(slice(compat, '        // MV keeps icon and face sizes as statics;', '        // ---- Game_Map.tileEvents'), context);
    assert.deepEqual([context.Window_Base._iconWidth, context.Window_Base._iconHeight, context.Window_Base._faceHeight], [32, 32, 144]);
    assert.equal(context.Window_Base._faceWidth, 150, 'a value a plugin set first is kept');
    assert.equal(context.Sprite_StateIcon._iconWidth, 32);
});
