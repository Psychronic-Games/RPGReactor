const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');

global.ReactorEventCommandCodec = require('../src/event/commands/ReactorEventCommandCodec.js');

const ShowPictureEditor = require('../src/event/commands/ShowPictureEditor.js');
const MovePictureEditor = require('../src/event/commands/MovePictureEditor.js');
const ErasePictureEditor = require('../src/event/commands/ErasePictureEditor.js');

function parsed(command) {
    return ReactorEventCommandCodec.parseCommand(command, 'picture');
}

test('pure stock picture editors preserve exact command shapes', () => {
    const show = new ShowPictureEditor();
    show.pictureId = 4;
    show.pictureName = 'Portrait';
    show.origin = 1;
    show.designationType = 1;
    show.x = 8;
    show.y = 9;
    show.scaleX = 80;
    show.scaleY = 90;
    show.opacity = 200;
    show.blendMode = 3;
    assert.deepEqual(show.buildCommand(), {
        code: 231,
        indent: 0,
        parameters: [4, 'Portrait', 1, 1, 8, 9, 80, 90, 200, 3]
    });

    const move = new MovePictureEditor();
    Object.assign(move, {
        pictureId: 4, origin: 1, designationType: 0, x: 20, y: 30,
        scaleX: 110, scaleY: 120, opacity: 180, blendMode: 2,
        duration: 45, wait: false, easing: 3
    });
    assert.deepEqual(move.buildCommand(), {
        code: 232,
        indent: 0,
        parameters: [4, 0, 1, 0, 20, 30, 110, 120, 180, 2, 45, false, 3]
    });

    const erase = new ErasePictureEditor();
    erase.pictureId = 4;
    assert.deepEqual(erase.buildCommand(), { code: 235, indent: 0, parameters: [4] });
});

test('Show and Move Picture validate variable positions against the database maximum', () => {
    const database = { getSystem: () => ({ variables: [null, 'X', 'Y', 'Spare'] }) };
    const show = new ShowPictureEditor(database);
    show.designationType = 0;
    show.x = -9999;
    show.y = 9999;
    assert.deepEqual(show.buildCommand().parameters.slice(3, 6), [0, -9999, 9999],
        'direct coordinates retain their negative/positive range');

    show.x = -20;
    show.y = 99;
    show.setDesignationType(1);
    assert.deepEqual([show.x, show.y], [1, 3]);
    show.x = 2.8;
    show.y = 0;
    assert.deepEqual(show.buildCommand().parameters.slice(3, 6), [1, 2, 1],
        'stock Show Picture stores variable IDs in X/Y parameter indexes 4 and 5');

    const move = new MovePictureEditor({ data: { system: { variables: [null, '', '', '', ''] } } });
    move.x = 2;
    move.y = 4;
    move.setDesignationType(1);
    assert.deepEqual([move.x, move.y], [2, 4], 'already-valid values survive a mode switch');
    move.x = 12;
    move.y = -3.7;
    assert.deepEqual(move.buildCommand().parameters.slice(3, 6), [1, 4, 1],
        'stock Move Picture stores bounded variable IDs in X/Y parameter indexes 4 and 5');
    move.setDesignationType(0);
    assert.deepEqual([move.x, move.y], [4, 1], 'switching back keeps the resolved values as valid coordinates');
});

test('extended picture commands reject out-of-range variable-coordinate references', () => {
    const database = { getSystem: () => ({ variables: [null, 'One', 'Two'] }) };
    const show = new ShowPictureEditor(database);
    const showData = {
        operation: 'show',
        pictureId: { source: 'direct', value: 1 },
        name: 'Card', origin: 0,
        position: { source: 'variable', x: 1, y: 3 },
        scaleX: 100, scaleY: 100, opacity: 255, blend: 0,
        angle: null, anchor: null, wave: null
    };
    assert.equal(show.isExtendedDataValid(showData), false);
    showData.position.y = 2;
    assert.equal(show.isExtendedDataValid(showData), true);

    const move = new MovePictureEditor(database);
    const moveData = {
        operation: 'move',
        pictureId: { source: 'direct', value: 1 },
        origin: 0, position: { source: 'variable', x: 0, y: 2 },
        scaleX: 100, scaleY: 100, opacity: 255, blend: 0,
        duration: { source: 'direct', value: 60 }, wait: true, easing: 0,
        angle: { mode: 'keep', value: 0 },
        anchor: { mode: 'keep', x: 0, y: 0 },
        wave: { mode: 'keep', amplitudeX: 0, amplitudeY: 0, period: 60, phase: 0 }
    };
    assert.equal(move.isExtendedDataValid(moveData), false);
    moveData.position.x = 1;
    assert.equal(move.isExtendedDataValid(moveData), true);
});

test('dynamic and advanced forms create one tagged script and reopen only in their editor', () => {
    const show = new ShowPictureEditor();
    Object.assign(show, {
        pictureIdSource: 'variable', pictureId: 7, pictureName: 'Card',
        initialAngleEnabled: true, initialAngle: 15,
        customAnchorEnabled: true, anchorX: 0.25, anchorY: 0.75,
        waveEnabled: true, waveAmplitudeX: 4, waveAmplitudeY: 8,
        wavePeriod: 90, wavePhase: 30, blendMode: 'overlay'
    });
    const showCommand = show.buildCommand();
    const showTag = parsed(showCommand);
    assert.equal(showCommand.code, 355);
    assert.equal(showCommand.parameters.length, 1);
    assert.equal(showTag.data.operation, 'show');
    assert.equal(showTag.data.blend, 'overlay');
    assert.doesNotThrow(() => new Function(showTag.body));
    assert.equal(showTag.body.includes('\n'), false);
    assert.match(showTag.body, /typeof this\.reactorPictureCommand/);
    assert.match(showTag.body, /\$gameScreen\.showPicture/);

    const reopenedShow = new ShowPictureEditor();
    assert.equal(reopenedShow.loadExtendedCommand(showCommand), true);
    assert.equal(reopenedShow.pictureIdSource, 'variable');
    assert.equal(reopenedShow.anchorX, 0.25);

    const move = new MovePictureEditor();
    Object.assign(move, {
        pictureIdSource: 'variable', pictureId: 3,
        durationSource: 'variable', duration: 8,
        angleMode: 'tween', angle: 180,
        anchorMode: 'replace', anchorX: 0.5, anchorY: 0.5,
        waveMode: 'off'
    });
    const moveCommand = move.buildCommand();
    assert.equal(parsed(moveCommand).data.operation, 'move');
    assert.equal(new ShowPictureEditor().acceptsCommand(moveCommand), false);
    assert.equal(new MovePictureEditor().acceptsCommand(moveCommand), true);

    const erase = new ErasePictureEditor();
    Object.assign(erase, {
        eraseMode: 'range', pictureIdSource: 'variable', pictureId: 10,
        endPictureIdSource: 'direct', endPictureId: 20
    });
    const eraseCommand = erase.buildCommand();
    assert.equal(parsed(eraseCommand).data.operation, 'erase');
    assert.equal(new ErasePictureEditor().acceptsCommand(eraseCommand), true);
    const invalid = { code: 355, indent: 0, parameters: [JSON.stringify({ kind: 'other', data: {} })] };
    assert.equal(new ErasePictureEditor().acceptsCommand(invalid), false);
    const alteredBody = ReactorEventCommandCodec.createScriptCommand('picture', showTag.data, 'void 0;');
    assert.equal(new ShowPictureEditor().acceptsCommand(alteredBody), false);

    const immediate = new MovePictureEditor();
    Object.assign(immediate, { duration: 0, angleMode: 'set', angle: 30 });
    const reopenedImmediate = new MovePictureEditor();
    assert.equal(reopenedImmediate.loadExtendedCommand(immediate.buildCommand()), true);
    assert.equal(reopenedImmediate.duration, 0, 'zero-frame extended moves reopen without changing duration');
});

test('Move previous-state resolution handles static tags and invalidates dynamic operations', () => {
    const show = new ShowPictureEditor();
    Object.assign(show, { pictureId: 2, pictureName: 'Static', initialAngleEnabled: true, initialAngle: 5, x: 10, y: 20 });
    const taggedShow = show.buildCommand();
    const move = new MovePictureEditor();
    Object.assign(move, { pictureId: 2, angleMode: 'set', angle: 20, x: 50, y: 60 });
    const taggedMove = move.buildCommand();
    const finder = new MovePictureEditor();
    assert.equal(finder.findPreviousPictureState([taggedShow, taggedMove], 2, 2).x, 50);

    const dynamicErase = new ErasePictureEditor();
    Object.assign(dynamicErase, { pictureIdSource: 'variable', pictureId: 4 });
    assert.equal(finder.findPreviousPictureState([taggedShow, dynamicErase.buildCommand()], 2, 2), null);
});

test('generated picture scripts fall back to stock MV/MZ screen APIs', () => {
    const calls = [];
    const screen = {
        maxPictures: () => 100,
        showPicture: (...args) => calls.push(['show', ...args]),
        movePicture: (...args) => calls.push(['move', ...args]),
        erasePicture: id => calls.push(['erase', id])
    };
    const variables = { value: id => ({ 3: 7, 8: 45 })[id] || 0 };
    const run = (command, interpreter = {}) => {
        const body = parsed(command).body;
        Function('$gameVariables', '$gameScreen', body).call(interpreter, variables, screen);
    };

    const show = new ShowPictureEditor();
    Object.assign(show, { pictureIdSource: 'variable', pictureId: 3, pictureName: 'Card' });
    run(show.buildCommand());
    assert.deepEqual(calls[0].slice(0, 3), ['show', 7, 'Card']);

    const move = new MovePictureEditor();
    Object.assign(move, { pictureIdSource: 'variable', pictureId: 3,
        durationSource: 'variable', duration: 8, wait: true });
    const interpreter = { wait: duration => calls.push(['wait', duration]) };
    run(move.buildCommand(), interpreter);
    assert.equal(calls.find(call => call[0] === 'move').at(-2), 45);
    assert.deepEqual(calls.find(call => call[0] === 'wait'), ['wait', 45]);

    const erase = new ErasePictureEditor();
    Object.assign(erase, { eraseMode: 'range', pictureId: 2, endPictureId: 4 });
    run(erase.buildCommand());
    assert.deepEqual(calls.filter(call => call[0] === 'erase'), [
        ['erase', 2], ['erase', 3], ['erase', 4]
    ]);
});

function runtimeHarness(blendModes = { NORMAL: 0, OVERLAY: 17 }, overlayEnabled = false) {
    function Game_Picture() { this.initialize(); }
    Game_Picture.prototype.initialize = function() {
        this._angle = 0;
        this._x = 0;
        this._y = 0;
        this._origin = 0;
        this._blendMode = 0;
        this._duration = 0;
    };
    Game_Picture.prototype.show = function(name, origin, x, y, sx, sy, opacity, blend) {
        Object.assign(this, { _name: name, _origin: origin, _x: x, _y: y, _scaleX: sx, _scaleY: sy, _opacity: opacity, _blendMode: blend });
    };
    Game_Picture.prototype.move = function(origin, x, y, sx, sy, opacity, blend, duration, easing) {
        Object.assign(this, { _origin: origin, _x: x, _y: y, _scaleX: sx, _scaleY: sy, _opacity: opacity, _blendMode: blend, _duration: duration, _easingType: easing });
    };
    Game_Picture.prototype.updateMove = function() { if (this._duration > 0) this._duration--; };
    Game_Picture.prototype.angle = function() { return this._angle; };
    Game_Picture.prototype.origin = function() { return this._origin; };
    Game_Picture.prototype.x = function() { return this._x; };
    Game_Picture.prototype.y = function() { return this._y; };
    Game_Picture.prototype.blendMode = function() { return this._blendMode; };

    function Game_Screen() { this.pictures = {}; this.erased = []; }
    Game_Screen.prototype.maxPictures = () => 3;
    Game_Screen.prototype.picture = function(id) { return this.pictures[id]; };
    Game_Screen.prototype.showPicture = function(id, ...args) {
        const picture = new Game_Picture();
        picture.show(...args);
        this.pictures[id] = picture;
    };
    Game_Screen.prototype.movePicture = function(id, ...args) { this.picture(id)?.move(...args); };
    Game_Screen.prototype.erasePicture = function(id) { this.erased.push(id); delete this.pictures[id]; };

    function Game_Interpreter() { this.initialize(); }
    Game_Interpreter.prototype.initialize = function() { this._waitCount = 0; };
    Game_Interpreter.prototype.wait = function(duration) { this._waitCount = duration; };

    function Sprite_Picture(picture) { this._picture = picture; this.anchor = {}; this.x = 0; this.y = 0; this.blendMode = 0; }
    Sprite_Picture.prototype.picture = function() { return this._picture; };
    Sprite_Picture.prototype.updateOrigin = function() { this.anchor.x = this._picture.origin() ? 0.5 : 0; this.anchor.y = this.anchor.x; };
    Sprite_Picture.prototype.updatePosition = function() { this.x = this._picture.x(); this.y = this._picture.y(); };
    Sprite_Picture.prototype.updateOther = function() { this.blendMode = this._picture.blendMode(); };

    const variableReads = {};
    const context = {
        console, Number, Math, Array, Object,
        Game_Picture, Game_Screen, Game_Interpreter, Sprite_Picture,
        PIXI: { BLEND_MODES: blendModes },
        Graphics: { app: { renderer: { backBuffer: { useBackBuffer: overlayEnabled } } } },
        $gameVariables: {
            values: { 1: 2, 2: 12 },
            value(id) { variableReads[id] = (variableReads[id] || 0) + 1; return this.values[id]; }
        }
    };
    context.$gameScreen = new Game_Screen();
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_picture_extensions.js'), 'utf8');
    vm.runInNewContext(source, context);
    return { ...context, variableReads };
}

test('runtime resolves dynamic values once, waits the resolved duration, and erases only logical bank IDs', () => {
    const runtime = runtimeHarness();
    runtime.$gameScreen.showPicture(2, 'P', 0, 0, 0, 100, 100, 255, 0);
    const interpreter = new runtime.Game_Interpreter();
    const moved = interpreter.reactorPictureCommand({
        operation: 'move',
        pictureId: { source: 'variable', value: 1 },
        origin: 0,
        position: { source: 'direct', x: 30, y: 40 },
        scaleX: 100, scaleY: 100, opacity: 255, blend: 0,
        duration: { source: 'variable', value: 2 },
        wait: true, easing: 0,
        angle: { mode: 'keep', value: 0 },
        anchor: { mode: 'keep', x: 0, y: 0 },
        wave: { mode: 'keep', amplitudeX: 0, amplitudeY: 0, period: 60, phase: 0 }
    });
    assert.equal(moved, true);
    assert.deepEqual(runtime.variableReads, { 1: 1, 2: 1 });
    assert.equal(interpreter._waitCount, 12);
    assert.equal(runtime.$gameScreen.picture(2)._x, 30);

    runtime.$gameScreen.erased.length = 0;
    interpreter.reactorPictureCommand({ operation: 'erase', mode: 'all' });
    assert.deepEqual(runtime.$gameScreen.erased, [1, 2, 3]);
});

test('Reactor and stock fallbacks both reject fractional dynamic references', () => {
    const runtime = runtimeHarness();
    runtime.$gameVariables.values[1] = 2.9;
    const interpreter = new runtime.Game_Interpreter();
    assert.equal(interpreter.reactorPictureCommand({
        operation: 'erase', mode: 'one',
        pictureId: { source: 'variable', value: 1 },
        endPictureId: { source: 'direct', value: 1 }
    }), false);
    assert.deepEqual(runtime.$gameScreen.erased, []);

    const erase = new ErasePictureEditor();
    Object.assign(erase, { pictureIdSource: 'variable', pictureId: 1 });
    const tag = parsed(erase.buildCommand());
    Function('$gameVariables', '$gameScreen', tag.body).call({}, runtime.$gameVariables, runtime.$gameScreen);
    assert.deepEqual(runtime.$gameScreen.erased, []);
});

test('runtime applies angle, anchor, wave, old-save defaults, and cautious overlay without stock pollution', () => {
    const runtime = runtimeHarness();
    const interpreter = new runtime.Game_Interpreter();
    assert.equal(interpreter.reactorPictureCommand({
        operation: 'show',
        pictureId: { source: 'direct', value: 1 },
        name: 'Wave', origin: 0,
        position: { source: 'direct', x: 100, y: 200 },
        scaleX: 100, scaleY: 100, opacity: 255, blend: 'overlay',
        angle: 45, anchor: { x: 0.25, y: 0.75 },
        wave: { amplitudeX: 10, amplitudeY: 5, period: 60, phase: 90 }
    }), true);
    const picture = runtime.$gameScreen.picture(1);
    assert.equal(picture.angle(), 45);
    assert.equal(picture.blendMode(), 0, 'overlay never enters the stock numeric blend field');

    const sprite = new runtime.Sprite_Picture(picture);
    sprite.updateOrigin();
    sprite.updatePosition();
    sprite.updateOther();
    assert.deepEqual(sprite.anchor, { x: 0.25, y: 0.75 });
    assert.equal(sprite.x, 110);
    assert.equal(sprite.y, 205);
    assert.equal(picture.x(), 100, 'wave does not change logical position');
    assert.equal(sprite.blendMode, 0, 'overlay degrades without renderer back-buffer support');

    const enabled = runtimeHarness({ NORMAL: 0, OVERLAY: 17 }, true);
    enabled.$gameScreen.showPicture(1, 'P', 0, 0, 0, 100, 100, 255, 0);
    enabled.$gameScreen.picture(1).reactorPictureState().overlay = 'overlay';
    const enabledSprite = new enabled.Sprite_Picture(enabled.$gameScreen.picture(1));
    enabledSprite.updateOther();
    assert.equal(enabledSprite.blendMode, 17);

    delete picture._reactorPictureExtensions;
    assert.deepEqual({ ...picture.reactorPictureState() }, {
        anchor: null, wave: null, overlay: null, angleTween: null, waveFrame: 0
    });

    interpreter.reactorPictureCommand({
        operation: 'move',
        pictureId: { source: 'direct', value: 1 },
        origin: 0,
        position: { source: 'direct', x: 100, y: 200 },
        scaleX: 100, scaleY: 100, opacity: 255, blend: 0,
        duration: { source: 'direct', value: 2 },
        wait: false, easing: 0,
        angle: { mode: 'tween', value: 90 },
        anchor: { mode: 'keep', x: 0, y: 0 },
        wave: { mode: 'keep', amplitudeX: 0, amplitudeY: 0, period: 60, phase: 0 }
    });
    picture.updateMove();
    assert.equal(picture.angle(), 67.5);
    picture.updateMove();
    assert.equal(picture.angle(), 90);

    const fallback = runtimeHarness({ NORMAL: 0 });
    fallback.$gameScreen.showPicture(1, 'P', 0, 0, 0, 100, 100, 255, 0);
    fallback.$gameScreen.picture(1).reactorPictureState().overlay = 'overlay';
    const fallbackSprite = new fallback.Sprite_Picture(fallback.$gameScreen.picture(1));
    fallbackSprite.updateOther();
    assert.equal(fallbackSprite.blendMode, 0);

    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_picture_extensions.js'), 'utf8');
    assert.doesNotMatch(source, /blend(?:Mode)?\s*[=:]\s*4\b/);
    const main = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_main.js'), 'utf8');
    assert.ok(main.indexOf('reactor_sprites.js') < main.indexOf('reactor_picture_extensions.js'));
    assert.ok(main.indexOf('reactor_picture_extensions.js') < main.indexOf('reactor_mv_compat.js'));
});
