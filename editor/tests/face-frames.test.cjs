/**
 * Face sets with frames ("Name[3F]"): each of the eight faces is that many frames wide. The game cuts them in
 * one place and the message window talks with them while its text appears; the editor's pickers and Reactor's own
 * screens show the first frame. Runs the runtime's and the editor's own code on stand-ins; nothing is drawn.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const between = (source, from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a + 1); assert.ok(a >= 0 && b > a, from); return source.slice(a, b); };

function game(system = {}) {
    const blits = [], cleared = [];
    const context = vm.createContext({
        $dataSystem: system, blits, cleared,
        ImageManager: { faceWidth: 144, faceHeight: 144, loadFace: name => ({ name }) },
        Window_Base: function() {}, Window_Message: function() {},
        $gameMessage: { name: 'Reid[4F]', index: 5, play: 'talk', faceName() { return this.name; }, faceIndex() { return this.index; }, facePlay() { return this.play; }, isRTL: () => false }
    });
    vm.runInContext(between(read('runtime/reactor_managers.js'), 'ImageManager.faceFrames = function', 'ImageManager.loadFace = function'), context);
    const windows = read('runtime/reactor_windows.js');
    vm.runInContext('// prettier-ignore\n' + between(windows, 'Window_Base.prototype.drawFace = function(', '// prettier-ignore\nWindow_Base.prototype.drawCharacter'), context);
    vm.runInContext('Window_Message.prototype = Object.create(Window_Base.prototype);' + between(windows, 'Window_Message.prototype.drawMessageFace = function', 'Window_Message.prototype.processControlCharacter = function'), context);
    return context;
}

/** A message window on the game's own code, saying `text`; `drawn` collects each frame it draws of face 5. */
function speaker(g, text) {
    const drawn = [];
    const window = Object.assign(new g.Window_Message(), {
        innerHeight: 144, innerWidth: 800, pause: false, _textState: { text, index: 0 }, _faceBitmap: null, open: true,
        isOpen() { return this.open; }, isClosed() { return !this.open; },
        contents: { clearRect: (...r) => g.cleared.push(r), blt: (bitmap, sx) => drawn.push(sx / 144 - 4) }
    });
    return { window, drawn };
}

test('a face set says its frames in its name, and the game cuts a face and its frames from where they are', () => {
    const g = game();
    const frames = name => g.ImageManager.faceFrames(name);
    assert.deepEqual([frames('Reid[3F]'), frames('Reid[F4]'), frames('People/Reid[8f]'), frames('Reid'), frames('Reid[1F]'), frames('Reid[8D]'), frames('')], [3, 4, 8, 0, 0, 0, 0]);
    g.$dataSystem.rrMultiFrames = false;
    assert.equal(frames('Reid[3F]'), 0, 'with multi-frame sheets switched off the name means nothing');
    g.$dataSystem.rrMultiFrames = true;
    assert.deepEqual(Array.from(g.ImageManager.FACE_PLAYS), ['talk', 'once', 'loop', 'still']);
    const window = Object.assign(new g.Window_Base(), { contents: { blt: (bitmap, sx, sy, sw, sh, dx, dy) => g.blits.push([bitmap.name, sx, sy, sw, sh, dx, dy]) } });
    // Face 5 of a plain set: second row, second column. Of a three-frame set: second row, columns 3, 4 and 5.
    window.drawFace('Reid', 5, 0, 0);
    window.drawFace('Reid[3F]', 5, 0, 0);
    window.drawFace('Reid[3F]', 5, 0, 0, 144, 144, 2);
    window.drawFace('Reid[3F]', 5, 0, 0, 144, 144, 9);
    window.drawFace('Reid[3F]', 0, 0, 0, 144, 144, 1);
    assert.deepEqual(g.blits.map(b => [b[1], b[2]]), [[144, 144], [432, 144], [720, 144], [720, 144], [144, 0]], 'the first frame unless another is named; a frame past the last is the last');
});

test('talking, the mouth follows the letters as the text appears and rests while the message waits', () => {
    const g = game(), W = g.Window_Message;
    // How far a mouth opens for a letter, and the frame of four for it.
    assert.deepEqual(['a', 'o', 'e', 'm', 'b', ' ', '.', 't', '', 'あ'].map(c => W.faceMouth(c) > 0), [true, true, true, false, false, false, false, true, false, true]);
    assert.ok(W.faceMouth('a') > W.faceMouth('o') && W.faceMouth('o') > W.faceMouth('e') && W.faceMouth('e') > W.faceMouth('t'));
    assert.deepEqual([W.faceTalkFrame(0, 4), W.faceTalkFrame(1, 4), W.faceTalkFrame(0.3, 4), W.faceTalkFrame(0.8, 4), W.faceTalkFrame(1, 1), W.faceTalkFrame(1, 2)], [0, 3, 1, 2, 0, 1]);
    // A line printed all at once is still said at the pace of speech: a letter every four updates, the mouth
    // drawn only when it changes. m (shut), a (widest), . and the space (shut), t (a little), o (wide), then rest.
    const { window, drawn } = speaker(g, 'ma. to');
    window.drawMessageFace();
    assert.deepEqual(drawn, [0], 'first drawn at rest');
    window._textState.index = 6;
    for (let i = 0; i < 8; i++) window.updateFaceFrames();
    assert.deepEqual(drawn, [0, 3], 'm, then a');
    assert.deepEqual(g.cleared[0], [4, 0, 144, 144], 'only the face is cleared and drawn again');
    // The message goes on to wait for the player; the face says the rest, then rests.
    window._textState = null; window.pause = true;
    for (let i = 0; i < 40; i++) window.updateFaceFrames();
    assert.deepEqual(drawn, [0, 3, 0, 1, 2, 0], JSON.stringify(drawn));
    // Never ahead of what has been printed: with one letter out, one letter is said.
    const slow = speaker(game(), 'aaaa');
    slow.window.drawMessageFace();
    slow.window._textState.index = 1;
    for (let i = 0; i < 20; i++) slow.window.updateFaceFrames();
    assert.deepEqual(slow.drawn, [0, 3, 0]);
    slow.window._textState.index = 4;
    for (let i = 0; i < 6; i++) slow.window.updateFaceFrames();
    assert.equal(slow.drawn.at(-1), 3, 'and it speaks again as more is printed');
    // Text codes are not said: a colour change and an icon between two letters.
    const coded = speaker(game(), 'm\x1bC[2]\x1bI[64]a');
    coded.window.drawMessageFace();
    coded.window._textState.index = coded.window._textState.text.length;
    for (let i = 0; i < 12; i++) coded.window.updateFaceFrames();
    assert.deepEqual(coded.drawn, [0, 3, 0]);
    // A new message with the same face starts over from its own first letter.
    window._textState = { text: 'o', index: 1 }; window.pause = false;
    window.drawMessageFace();
    for (let i = 0; i < 3; i++) window.updateFaceFrames();
    assert.equal(drawn.at(-1), 2);
    for (let i = 0; i < 9; i++) window.updateFaceFrames();
    assert.equal(drawn.at(-1), 0);
    // A plain face set is never drawn again; a face this window did not draw is left alone.
    const before = drawn.length;
    g.$gameMessage.name = 'Reid';
    window._textState = { text: 'aaaa', index: 2 };
    window.drawMessageFace();
    for (let i = 0; i < 30; i++) window.updateFaceFrames();
    assert.equal(drawn.length, before + 1);
    const other = Object.assign(new W(), { isOpen: () => true, isClosed: () => false, _textState: { text: 'a', index: 1 }, contents: { clearRect() { throw new Error('cleared'); }, blt() { throw new Error('drawn'); } } });
    g.$gameMessage.name = 'Reid[4F]';
    assert.doesNotThrow(() => { for (let i = 0; i < 30; i++) other.updateFaceFrames(); });
    assert.match(read('runtime/reactor_windows.js'), /this\.synchronizeNameBox\(\);\n\s*this\.updateFaceFrames\(\);/);
});

test('a message can play the frames once and hold the last (a sweep), loop them, or hold the first', () => {
    const run = (play, updates, change) => { const g = game(); g.$gameMessage.play = play; const { window, drawn } = speaker(g, 'some text'); window.drawMessageFace(); for (let i = 0; i < updates; i++) { if (change) change(window, i); window.updateFaceFrames(); } return { g, window, drawn }; };
    // Once: through the four frames, five updates each, and the last held, whatever the text is doing.
    const once = run('once', 60, (window, i) => { if (i === 30) window.pause = true; });
    assert.deepEqual(once.drawn, [0, 1, 2, 3]);
    // The same face shown again by the next message stays where it is; another face starts over.
    once.window.drawMessageFace();
    assert.equal(once.drawn.at(-1), 3);
    once.g.$gameMessage.index = 6;
    once.window.drawMessageFace();
    for (let i = 0; i < 11; i++) once.window.updateFaceFrames();
    assert.deepEqual(once.drawn.slice(-3).map(n => n + 5 * 4 - 6 * 4 + (once.drawn.length ? 0 : 0)).length, 3);
    assert.equal(once.window._rrFace.frame, 2, 'the new face is two frames into its own sweep');
    // Loop: round and round while the face is shown.
    assert.deepEqual(run('loop', 46).drawn, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
    // Still: the first frame and nothing more.
    assert.deepEqual(run('still', 60).drawn, [0]);
    // The command says which, beside its parameters; anything else is talking.
    const objects = read('runtime/reactor_objects.js');
    const g = game();
    const message = vm.runInContext('(function() { function Game_Message() {} ' + between(objects, '/** How this message plays a face set with frames', 'Game_Message.prototype.setBackground = function') + ' return new Game_Message(); })()', g);
    assert.equal(message.facePlay(), 'talk');
    message.setFacePlay('once'); assert.equal(message.facePlay(), 'once');
    message.setFacePlay('sideways'); assert.equal(message.facePlay(), 'talk');
    assert.match(objects, /this\._rrFacePlay = "";/, 'cleared with the message');
    assert.match(read('runtime/reactor_objects_interpreter.js'), /const shown = this\.currentCommand\(\);\n\s*\$gameMessage\.setFacePlay\(shown && shown\.code === 101 \? shown\.reactorFacePlay : ""\);/);
});

test('the editor and Reactor\'s own screens show the first frame of such a set, and Show Text keeps how it is played', () => {
    const Assets = require(path.join(root, 'editor/src/utils/AssetFiles.js'));
    const F = globalThis.RRFaceSheet;
    assert.ok(F && Assets);
    const picture = name => ({ naturalHeight: 288, src: 'file:///project/img/faces/' + encodeURIComponent(name) + '.png?v=3' });
    assert.deepEqual([F.framesOf('Reid[3F]'), F.framesOf(picture('Reid[3F]')), F.framesOf('img/faces/Reid.png'), F.framesOf(picture('Reid')), F.framesOf(null)], [3, 3, 1, 1, 1]);
    const system = { faceSize: 144 };
    assert.deepEqual(F.sourceRect(5, picture('Reid'), system), { x: 144, y: 144, width: 144, height: 144 });
    assert.deepEqual(F.sourceRect(5, picture('Reid[3F]'), system), { x: 432, y: 144, width: 144, height: 144 });
    assert.equal(F.sourceRect(5, picture('Reid[3F]'), system, 2).x, 720);
    assert.deepEqual(F.sourceRect(5, 288, system), { x: 144, y: 144, width: 144, height: 144 }, 'a height alone names no frames');
    assert.equal(F.metrics(picture('Reid[3F]'), system).count, 8, 'still eight faces');
    assert.deepEqual([F.columnOf(5, 'Reid[3F]'), F.columnOf(5, 'Reid'), F.columnOf(2, picture('Reid[4F]'))], [3, 1, 8]);
    // The places that cut a face on their own go by the same rule.
    assert.match(read('editor/src/event/EventCommandList.js'), /const col = RRFaceSheet\.columnOf\(faceIndex, src\);/);
    assert.match(read('editor/src/database/DatabaseUserInterfaceEditor.js'), /sx = RRFaceSheet\.columnOf\(faceIndex, image\) \* sw;/);
    const ui = read('runtime/reactor_ui.js');
    assert.match(ui, /const wide = \(ImageManager\.faceFrames && ImageManager\.faceFrames\(member \? member\.faceName\(\) : node\.file\)\) \|\| 1;\n\s*sx = \(index % 4\) \* wide \* pw;/);
    assert.match(ui, /fx = \(index % 4\) \* \(\(ImageManager\.faceFrames && ImageManager\.faceFrames\(actor\.faceName\(\)\)\) \|\| 1\) \* fw;/);
    // The battle HUD's drawing is one file in two places.
    assert.equal(read('runtime/reactor_ui_fight.js'), read('editor/src/utils/FightHud.js'));
    assert.match(read('runtime/reactor_ui_fight.js'), /ctx\.drawImage\(picture, \(view\.faceIndex % 4\) \* wide \* cell,/);
    // Show Text: how the frames are played is read from the command and written back, and talking is not written.
    const Boxes = require(path.join(root, 'editor/src/utils/MessageBoxes.js'));
    assert.deepEqual([Boxes.PLAY_FIELD, Boxes.FACE_PLAYS], ['reactorFacePlay', ['talk', 'once', 'loop', 'still']]);
    const source = read('editor/src/utils/MessageBoxes.js');
    assert.match(source, /if \(command && typeof command\[PLAY_FIELD\] === 'string'\) header\.facePlay = command\[PLAY_FIELD\];/);
    assert.match(source, /if \(typeof header\.facePlay === 'string' && header\.facePlay && header\.facePlay !== 'talk'\) command\[PLAY_FIELD\] = header\.facePlay;/);
    assert.match(source, /&& \(a\.facePlay \|\| ''\) === \(b\.facePlay \|\| ''\);/);
    const dialog = read('editor/src/event/commands/MessageCommandEditor.js');
    assert.match(dialog, /const framed = mode === 'picture' && typeof RRFaceSheet !== 'undefined' && typeof RRFaceSheet\.framesOf === 'function' && RRFaceSheet\.framesOf\(header\.faceName\) > 1;/, 'offered only for a picture that has frames');
});
