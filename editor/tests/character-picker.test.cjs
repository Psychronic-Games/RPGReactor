const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const dom = require('./helpers/mini-dom.cjs');

const editorRoot = path.resolve(__dirname, '..');
const pickerPath = path.join(editorRoot, 'src', 'event', 'CharacterGraphicPicker.js');
const pickerSource = fs.readFileSync(pickerPath, 'utf8');
const Picker = require(pickerPath);
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');

const STOCK = [576, 384];           // eight characters, 48x48 frames
const SINGLE = [144, 192];          // one character, 48x48 frames
const GENERATED = [1728, 1152];     // eight Character Generator characters, 144x144 frames
const SMALL_2000 = [288, 256];      // eight characters, 24x32 frames (RPG Maker 2000 and 2003)
const SMALL_VX = [384, 256];        // eight characters, 32x32 frames (VX and VX Ace)
// The room the sheet has inside its box, as measured in the editor: in a 1280x720 window, a 1600x1000 one, and
// the smallest the editor allows (1024x600).
const ROOM_720 = { width: 738, height: 438 };
const ROOM_1000 = { width: 1047, height: 689 };
const ROOM_600 = { width: 640, height: 330 };

// ---------------------------------------------------------------- the pure parts

test('a sheet is cut four characters across and two down, or one for a "$" sheet', () => {
    const stock = Picker.sheetLayout(...STOCK, false, 3);
    assert.deepEqual([stock.columns, stock.rows, stock.frameWidth, stock.frameHeight], [12, 8, 48, 48]);
    assert.deepEqual([stock.charactersAcross, stock.charactersDown], [4, 2]);
    const single = Picker.sheetLayout(...SINGLE, true, 3);
    assert.deepEqual([single.columns, single.rows, single.frameWidth, single.frameHeight], [3, 4, 48, 48]);
    assert.deepEqual([single.charactersAcross, single.charactersDown], [1, 1]);
    // A sheet with another frame count per direction ("Name[F4]" in a project that turns them on).
    const four = Picker.sheetLayout(768, 384, false, 4);
    assert.deepEqual([four.columns, four.rows, four.frameWidth], [16, 8, 48]);
    // A frame count that is no count falls back to the stock three.
    assert.equal(Picker.sheetLayout(...STOCK, false, undefined).frames, 3);
    assert.equal(Picker.sheetLayout(...STOCK, false, 0).frames, 3);
    // A picture that does not divide evenly keeps its fractions; nothing is rounded away here.
    assert.equal(Picker.sheetLayout(448, 390, true, 3).frameHeight, 97.5);
});

test('a frame of the sheet is the character, pattern and direction the game reads there', () => {
    for (const frames of [3, 4]) {
        const layout = Picker.sheetLayout(48 * frames * 4, 384, false, frames);
        const characterWidth = layout.width / 4, characterHeight = layout.height / 2;
        for (let index = 0; index < 8; index++) {
            for (let pattern = 0; pattern < frames; pattern++) {
                [2, 4, 6, 8].forEach((direction, directionRow) => {
                    const cell = Picker.cellOf(layout, index, pattern, direction);
                    const frame = Picker.frameAt(layout, cell.column, cell.row);
                    assert.deepEqual([frame.characterIndex, frame.pattern, frame.direction], [index, pattern, direction]);
                    // Where the game cuts it: the character's block, then the pattern across and the direction down.
                    assert.equal(frame.x, (index % 4) * characterWidth + pattern * layout.frameWidth);
                    assert.equal(frame.y, Math.floor(index / 4) * characterHeight + directionRow * layout.frameHeight);
                });
            }
        }
    }
    const single = Picker.sheetLayout(...SINGLE, true, 3);
    const seen = new Set();
    for (let row = 0; row < single.rows; row++) {
        for (let column = 0; column < single.columns; column++) {
            const frame = Picker.frameAt(single, column, row);
            assert.equal(frame.characterIndex, 0);
            seen.add(`${frame.pattern}/${frame.direction}`);
        }
    }
    assert.equal(seen.size, 12);
    assert.deepEqual(Picker.cellOf(single, 0, 2, 8), { column: 2, row: 3 });
    // Frames the sheet does not have.
    assert.equal(Picker.cellOf(single, 1, 0, 2), null);
    assert.equal(Picker.cellOf(Picker.sheetLayout(...STOCK, false, 3), 8, 0, 2), null);
    assert.equal(Picker.cellOf(Picker.sheetLayout(...STOCK, false, 3), 0, 3, 2), null);
    assert.equal(Picker.cellOf(Picker.sheetLayout(...STOCK, false, 3), 0, 0, 5), null);
});

test('the fitted zoom is the largest step at which the whole sheet fits its room', () => {
    const stock = Picker.sheetLayout(...STOCK, false, 3);
    const single = Picker.sheetLayout(...SINGLE, true, 3);
    const generated = Picker.sheetLayout(...GENERATED, false, 3);

    // The stock sheet is shown at its own size, not at the 64px frames that made it 768px wide.
    assert.equal(Picker.fitZoom(ROOM_720, stock), 1);
    // A larger window gives it the next step.
    assert.equal(Picker.fitZoom(ROOM_1000, stock), 1.5);
    // A small sheet is enlarged as far as the height allows.
    assert.equal(Picker.fitZoom(ROOM_720, single), 2);
    assert.equal(Picker.fitZoom(ROOM_1000, single), 3);
    // Sheets with small frames do not sit at 100% in a box with room for 150%.
    for (const size of [SMALL_2000, SMALL_VX]) {
        const small = Picker.sheetLayout(...size, false, 3);
        assert.equal(Picker.fitZoom(ROOM_720, small), 1.5, size.join('x'));
        assert.equal(Picker.fitZoom(ROOM_1000, small), 2, size.join('x'));
    }
    assert.deepEqual([Picker.displaySize(Picker.sheetLayout(...SMALL_2000, false, 3), 1.5).frameWidth,
        Picker.displaySize(Picker.sheetLayout(...SMALL_2000, false, 3), 1.5).frameHeight], [36, 48]);
    // A Character Generator sheet goes below the old 50% floor.
    assert.equal(Picker.fitZoom(ROOM_720, generated), 1 / 3);
    assert.equal(Picker.displaySize(generated, 1 / 3).frameWidth, 48);
    assert.equal(Picker.fitZoom(ROOM_1000, generated), 0.5);
    // A room too small for 100%.
    assert.equal(Picker.fitZoom(ROOM_600, stock), 0.75);
    assert.equal(Picker.fitZoom(ROOM_600, single), 1.5);
    assert.equal(Picker.fitZoom(ROOM_600, generated), 0.25);
    assert.equal(Picker.fitZoom({ width: 520, height: 330 }, stock), 0.75);
    assert.equal(Picker.fitZoom({ width: 340, height: 300 }, stock), 0.5);
    // A room too small for the smallest step: the exact ratio, so the sheet still fits.
    const tiny = { width: 300, height: 200 };
    const exact = Picker.fitZoom(tiny, generated);
    assert.ok(exact > 0 && exact < 0.25, String(exact));
    const shown = Picker.displaySize(generated, exact);
    assert.ok(shown.width <= tiny.width && shown.height <= tiny.height, JSON.stringify(shown));
    // A room that has no size yet (the dialog is not laid out): 100%.
    assert.equal(Picker.fitZoom({ width: 0, height: 0 }, stock), 1);
    assert.equal(Picker.fitZoom(null, stock), 1);
});

test('at the fitted zoom nothing scrolls, and the next step up would', () => {
    const steps = Picker.ZOOM_STEPS;
    const sheets = [[...STOCK, false, 3], [...SINGLE, true, 3], [...GENERATED, false, 3], [...SMALL_2000, false, 3], [...SMALL_VX, false, 3],
        [432, 576, true, 3], [448, 390, true, 3],
        [600, 400, true, 3], [24, 32, true, 3], [768, 384, false, 4], [1296, 1344, true, 3]];
    for (const [width, height, single, frames] of sheets) {
        const layout = Picker.sheetLayout(width, height, single, frames);
        for (let roomWidth = 180; roomWidth <= 1500; roomWidth += 55) {
            for (let roomHeight = 140; roomHeight <= 1100; roomHeight += 48) {
                const room = { width: roomWidth, height: roomHeight };
                const zoom = Picker.fitZoom(room, layout);
                const shown = Picker.displaySize(layout, zoom);
                const where = `${width}x${height} in ${roomWidth}x${roomHeight} at ${zoom}`;
                assert.ok(shown.width <= roomWidth && shown.height <= roomHeight, where);
                const larger = steps.find(step => step > zoom + 1e-9);
                if (steps.includes(zoom) && larger) {
                    const chrome = Picker.sheetChrome(layout);
                    assert.ok(width * larger + chrome.width > roomWidth || height * larger + chrome.height > roomHeight, where + ' could be ' + larger);
                }
            }
        }
    }
});

test('the zoom control offers Fit, then fixed steps from 25% to 800%', () => {
    const choices = Picker.zoomChoices();
    assert.equal(choices[0].value, 'fit');
    assert.deepEqual(choices.slice(1).map(choice => choice.label), ['25%', '33%', '50%', '75%', '100%', '150%', '200%', '300%', '400%', '600%', '800%']);
    const values = choices.slice(1).map(choice => Number(choice.value));
    assert.deepEqual(values, Picker.ZOOM_STEPS);
    assert.deepEqual(values, [...values].sort((a, b) => a - b));
});

// ---------------------------------------------------------------- the dialog

/** An element in a word or two, so that a failed comparison prints a line and not the page. */
const named = element => !element ? String(element)
    : element.dataset?.characterIndex !== undefined ? `frame ${element.dataset.characterIndex}/${element.dataset.pattern}/${element.dataset.direction}`
    : element.dataset?.fileName !== undefined ? `file ${element.dataset.fileName}`
    : element.id || element.className || element.tagName;

/** The picker in a small DOM: a project folder of (empty) sheets, pictures that "load" at the sizes given. */
function openPicker(t, { sizes, args, room = ROOM_720, system = null, keyboard = true, observe = false, animationFrames = false, i18n = null }) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-char-picker-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const folder = path.join(project, 'img', 'characters');
    fs.mkdirSync(folder, { recursive: true });
    for (const name of Object.keys(sizes)) fs.writeFileSync(path.join(folder, name + '.png'), '');

    const context = dom.createContext();
    const { document } = context;
    document.listeners = {};
    document.addEventListener = (type, handler) => { (document.listeners[type] ||= []).push(handler); };
    document.removeEventListener = (type, handler) => { document.listeners[type] = (document.listeners[type] || []).filter(fn => fn !== handler); };
    document.contains = element => document.body.contains(element);
    document.activeElement = document.body;
    const draws = [], surfaces = [];
    const createElement = document.createElement;
    document.createElement = tag => {
        const element = createElement(tag);
        if (String(tag).toLowerCase() === 'canvas') {
            element.getContext = () => {
                const surface = { imageSmoothingEnabled: true, drawImage(...call) { draws.push(call.slice(1)); } };
                surfaces.push(surface);
                return surface;
            };
        }
        return element;
    };
    const images = [];
    const observers = [];
    Object.assign(context, {
        require,
        Image: class {
            constructor() { images.push(this); }
            set src(value) {
                this._src = value;
                const name = Object.keys(sizes).find(key => decodeURIComponent(String(value)).endsWith('/' + key + '.png'));
                if (name) [this.width, this.height] = sizes[name];
                this._known = !!name;
            }
            get src() { return this._src; }
        },
        reactor: system ? { databaseManager: { data: { system } } } : undefined
    });
    if (observe) context.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } };
    // The page's frames: a refit asked for waits in `queued` until the test runs it.
    const queued = [], cancelled = [];
    if (animationFrames) {
        context.requestAnimationFrame = run => { queued.push(run); return queued.length; };
        context.cancelAnimationFrame = id => { cancelled.push(id); };
    }
    if (i18n) context.I18n = i18n;
    // The asset index reads the project's frame count through the page's globals, so it runs in the page too.
    vm.runInNewContext(read('src/utils/AssetFiles.js'), context);
    vm.runInNewContext(read('src/utils/PickerIndex.js'), context);
    if (keyboard) vm.runInNewContext(read('src/utils/KeyboardNavigation.js'), context);
    const PickerInContext = vm.runInNewContext(`${pickerSource}\nCharacterGraphicPicker;`, context);

    // What opened the picker holds the keyboard until the picker is up.
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();

    const results = [];
    const picker = new PickerInContext({ currentProject: { path: project } });
    let currentRoom = room;
    picker._measureRoom = () => currentRoom;
    picker.show(...args, result => results.push({ ...result }));

    const modal = () => document.body.children.find(child => child.id === 'character-picker-modal') || null;
    const one = selector => modal().querySelector(selector);
    const all = selector => modal().querySelectorAll(selector);
    /** Let the picture requested last finish loading (or fail, when the folder has no such file). */
    const load = () => { const image = images[images.length - 1]; if (image._known) image.onload(); else image.onerror(); };
    const frames = () => all('.rr-char-picker-frame');
    const frame = (index, pattern, direction) => frames().find(el => el.dataset.characterIndex === String(index)
        && el.dataset.pattern === String(pattern) && el.dataset.direction === String(direction));
    const key = (target, name, fields = {}) => {
        let consumed = false, stopped = false;
        const event = { key: name, target, preventDefault() { consumed = true; this.defaultPrevented = true; }, stopPropagation() { stopped = true; }, ...fields };
        // The way the page delivers it: the dialog's capturing listeners, then the target and its ancestors.
        const overlay = modal();
        overlay?.fire('keydown', event);
        for (let node = target; node && node !== overlay && !stopped; node = node.parentNode) node.fire('keydown', event);
        return consumed;
    };
    /** A mouse event the way the page delivers it: the dialog's capturing listeners, then the target and its ancestors. */
    const mouse = (type, target, fields = {}) => {
        const delivered = { stopped: false, prevented: false };
        const event = { type, target, detail: 1, preventDefault() { delivered.prevented = true; }, stopPropagation() { delivered.stopped = true; }, ...fields };
        const overlay = modal();
        overlay?.fire(type, event);
        for (let node = target; node && node !== overlay && !delivered.stopped; node = node.parentNode) node.fire(type, event);
        return delivered;
    };
    /** One press and release on a target, as the nth click of a run of clicks: the second ends in a dblclick. */
    const press = (target, nth = 1) => {
        for (const type of ['mousedown', 'mouseup', 'click'].concat(nth === 2 ? ['dblclick'] : [])) mouse(type, target, { detail: nth });
    };
    return {
        context, document, picker, results, draws, surfaces, observers, queued, cancelled, opener, modal, one, all, load, frames, frame, key, mouse, press,
        file: name => all('.rr-picker-file-item').find(item => item.dataset.fileName === name),
        /** The frames shown as picked, and the one frame Tab stops on, by name. */
        picked: () => frames().filter(el => el.classList.contains('selected')).map(named),
        tabStops: () => frames().filter(el => el.tabIndex === 0).map(named),
        focus: () => named(document.activeElement),
        sheet: () => one('.rr-char-picker-sheet'),
        status: () => one('.rr-char-picker-status').textContent,
        ok: () => all('button').find(button => button.id === 'char-picker-ok'),
        button: id => all('button').find(button => button.id === id),
        zoom: () => one('.character-preview-zoom'),
        setRoom: next => { currentRoom = next; }
    };
}

const SHEETS = { Vehicle: STOCK, People: STOCK, '$Hero': SINGLE, '!$Door': [144, 192], 'CG-People': GENERATED };

test('the picker opens on the caller\'s frame and hands the same four values back', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    assert.equal(ui.one('.rr-char-picker-preview').dataset.selectedFile, 'Vehicle');
    assert.equal(ui.frames().length, 96);
    const picked = ui.all('.rr-char-picker-frame').filter(el => el.classList.contains('selected'));
    assert.equal(picked.length, 1);
    assert.equal(named(picked[0]), 'frame 3/1/4');
    assert.equal(picked[0].getAttribute('aria-selected'), 'true');
    assert.equal(ui.status(), 'Character 4 · Left · Frame 2');
    assert.equal(ui.ok().disabled, false);
    ui.ok().click();
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 3, pattern: 1, direction: 4 }]);
    assert.equal(ui.modal(), null, 'OK closes the picker');
});

test('the sheet is drawn in its own arrangement, one frame per click target', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 0, 1, 2] });
    ui.load();
    const sheet = ui.sheet();
    const characters = sheet.children;
    assert.equal(characters.length, 8);
    assert.equal(sheet.style.gridTemplateColumns, 'repeat(4, auto)');
    for (const [index, block] of characters.entries()) {
        assert.equal(block.className, 'rr-char-picker-character');
        assert.equal(block.style.gridTemplateColumns, 'repeat(3, auto)');
        // Its frames in the sheet's order: three across, then the next direction down.
        assert.deepEqual(block.children.map(el => `${el.dataset.characterIndex}/${el.dataset.pattern}/${el.dataset.direction}`),
            [2, 4, 6, 8].flatMap(direction => [0, 1, 2].map(pattern => `${index}/${pattern}/${direction}`)));
    }
    // Every frame is cut from the place the game cuts it, at the picture's own size, pixel for pixel.
    assert.equal(ui.draws.length, 96);
    assert.equal(ui.surfaces.length, 96);
    assert.ok(ui.surfaces.every(surface => surface.imageSmoothingEnabled === false));
    // A frame says what it is to a screen reader.
    assert.equal(ui.frame(6, 2, 8).getAttribute('aria-label'), 'Character 7 · Up · Frame 3');
    const at = Array.from(ui.frame(6, 2, 8).parentNode.children).indexOf(ui.frame(6, 2, 8));
    assert.equal(at, 11);
    assert.deepEqual(ui.draws[6 * 12 + 11], [2 * 144 + 2 * 48, 192 + 3 * 48, 48, 48, 0, 0, 48, 48]);
    // No card, title and labelled rows per character: the words are in the one line under the sheet.
    assert.equal(sheet.textContent, '');
});

test('a click picks a frame, and the line under the sheet follows the pointer', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    const sheet = ui.sheet();
    sheet.fire('mouseover', { target: ui.frame(6, 0, 8) });
    assert.equal(ui.status(), 'Character 7 · Up · Frame 1');
    assert.equal(ui.one('.rr-char-picker-status').classList.contains('is-hover'), true);
    sheet.fire('mouseleave');
    assert.equal(ui.status(), 'Character 4 · Left · Frame 2');
    sheet.fire('click', { target: ui.frame(5, 2, 6).firstChild });
    assert.equal(ui.all('.rr-char-picker-frame').filter(el => el.classList.contains('selected')).length, 1);
    assert.equal(ui.frame(3, 1, 4).getAttribute('aria-selected'), 'false');
    assert.equal(ui.status(), 'Character 6 · Right · Frame 3');
    ui.ok().click();
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 5, pattern: 2, direction: 6 }]);
});

test('a double-click on a frame picks it and confirms', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 0, 1, 2] });
    ui.load();
    ui.press(ui.frame(2, 0, 4), 1);
    assert.deepEqual(ui.results, []);
    assert.equal(ui.frame(2, 0, 4).classList.contains('selected'), true);
    ui.press(ui.frame(2, 0, 4), 2);
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 2, pattern: 0, direction: 4 }]);
    assert.equal(ui.modal(), null);
});

test('a double-click whose two clicks are on different frames picks the second and does not confirm', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 0, 1, 2] });
    ui.load();
    ui.press(ui.frame(2, 0, 4), 1);
    ui.press(ui.frame(2, 1, 4), 2);
    assert.deepEqual(ui.results, []);
    assert.notEqual(ui.modal(), null);
    assert.deepEqual(ui.picked(), ['frame 2/1/4']);
});

test('the second press of a double-click on what opened the picker does nothing in it', t => {
    // The picker came up under the pointer between the two presses: the second lands on a frame nobody chose.
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 5, 0, 2] });
    ui.load();
    ui.press(ui.frame(1, 1, 8), 2);
    assert.deepEqual(ui.results, [], 'nothing is handed back');
    assert.notEqual(ui.modal(), null, 'the picker stays open');
    assert.deepEqual(ui.picked(), ['frame 5/0/2'], 'the caller\'s frame is still the picked one');
    // The press is kept from the page altogether, so it does not move the keyboard to that frame either.
    assert.deepEqual(ui.mouse('mousedown', ui.frame(1, 1, 8), { detail: 2 }), { stopped: true, prevented: true });

    // Or it lands on a button of the dialog: the picture is not cleared, nothing is confirmed, the picker stays.
    for (const id of ['char-picker-clear', 'char-picker-ok', 'char-picker-cancel', 'char-picker-close']) {
        const other = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 5, 0, 2] });
        other.load();
        other.press(other.button(id), 2);
        assert.deepEqual(other.results, [], id);
        assert.notEqual(other.modal(), null, id);
    }

    // From the first press made in the picker, clicks count: a double-click on a frame confirms it.
    ui.press(ui.frame(1, 1, 8), 1);
    ui.press(ui.frame(1, 1, 8), 2);
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 1, pattern: 1, direction: 8 }]);
    assert.equal(ui.modal(), null);
});

test('a double-click that began off the sheet picks nothing on it', t => {
    // The zoom's list lies over the sheet: its first click chose from the list, its second lands on a frame.
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 5, 0, 2] });
    ui.load();
    ui.press(ui.zoom(), 1);
    ui.press(ui.frame(1, 1, 8), 2);
    assert.deepEqual(ui.results, []);
    assert.notEqual(ui.modal(), null);
    assert.deepEqual(ui.picked(), ['frame 5/0/2']);

    // Nor does a press on one sheet count for the next: a frame was pressed, the keys brought up another file, and
    // the second click of the run lands on the new sheet.
    ui.press(ui.frame(5, 0, 2), 1);
    ui.file('People').click();
    ui.load();
    ui.press(ui.frame(1, 1, 8), 2);
    assert.deepEqual(ui.picked(), []);
    assert.deepEqual(ui.results, []);
});

test('a "$" sheet is one character, and a "!$" sheet too', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['$Hero', 0, 2, 8] });
    ui.load();
    assert.equal(ui.frames().length, 12);
    assert.equal(ui.sheet().children.length, 1);
    assert.equal(ui.sheet().style.gridTemplateColumns, 'repeat(1, auto)');
    assert.equal(ui.status(), 'Up · Frame 3');
    ui.file('!$Door').click();
    ui.load();
    assert.equal(ui.frames().length, 12);
    assert.ok(ui.frames().every(el => el.dataset.characterIndex === '0'));
    // Another file starts with nothing picked: OK waits for a frame.
    assert.equal(ui.ok().disabled, true);
    assert.equal(ui.status(), 'Click on the specific frame you want to use');
    ui.ok().click();
    assert.deepEqual(ui.results, []);
    ui.sheet().fire('click', { target: ui.frame(0, 1, 6) });
    ui.ok().click();
    assert.deepEqual(ui.results, [{ characterName: '!$Door', characterIndex: 0, pattern: 1, direction: 6 }]);
});

test('an index kept from an 8-character sheet picks nothing on a "$" sheet', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['$Hero', 3, 1, 2] });
    ui.load();
    assert.equal(ui.all('.rr-char-picker-frame').filter(el => el.classList.contains('selected')).length, 0);
    assert.equal(ui.ok().disabled, true);
});

test('a sheet with four frames per direction shows and returns all four', t => {
    const ui = openPicker(t, { sizes: { 'Walker[F4]': [768, 384] }, args: ['Walker[F4]', 1, 3, 6], system: { rrMultiFrames: true } });
    ui.load();
    assert.equal(ui.frames().length, 128);
    assert.equal(ui.status(), 'Character 2 · Right · Frame 4');
    ui.ok().click();
    assert.deepEqual(ui.results, [{ characterName: 'Walker[F4]', characterIndex: 1, pattern: 3, direction: 6 }]);
});

test('the sheet is fitted to its room, refitted for another file and another room, until the user picks a zoom', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 0, 1, 2], observe: true });
    assert.equal(ui.one('.rr-char-picker-zoom').hidden, true, 'no zoom while there is no sheet to zoom');
    ui.load();
    const shown = () => { const canvas = ui.frames()[0].firstChild; return [canvas.style.width, canvas.style.height, canvas.width, canvas.height]; };
    assert.equal(ui.zoom().value, 'fit');
    assert.equal(ui.one('.rr-char-picker-zoom').hidden, false, 'the zoom is offered once a sheet is on show');
    assert.deepEqual(ui.zoom().children.map(option => option.textContent), ['Fit to view', '25%', '33%', '50%', '75%', '100%', '150%', '200%', '300%', '400%', '600%', '800%']);
    assert.deepEqual(shown(), ['48px', '48px', 48, 48]);
    assert.equal(ui.sheet().classList.contains('is-smooth'), false);

    // A Character Generator sheet: shown smaller than it is drawn, and smoothed.
    ui.file('CG-People').click();
    ui.load();
    assert.deepEqual(shown(), ['48px', '48px', 144, 144]);
    assert.equal(ui.sheet().classList.contains('is-smooth'), true);
    // A small sheet: enlarged with sharp pixels.
    ui.file('$Hero').click();
    ui.load();
    assert.deepEqual(shown(), ['96px', '96px', 48, 48]);
    assert.equal(ui.sheet().classList.contains('is-smooth'), false);

    // The dialog's size changes: the fitted zoom follows the room.
    assert.equal(ui.observers.length, 1);
    assert.ok(ui.observers[0].target === ui.one('.rr-char-picker-sheet-box'), 'the room that is watched is the sheet\'s box');
    ui.setRoom(ROOM_1000);
    ui.observers[0].callback();
    assert.deepEqual(shown(), ['144px', '144px', 48, 48]);

    // The user's zoom holds for other files and other rooms.
    ui.zoom().value = '4';
    ui.zoom().fire('change');
    assert.deepEqual(shown(), ['192px', '192px', 48, 48]);
    ui.setRoom(ROOM_720);
    ui.observers[0].callback();
    assert.deepEqual(shown(), ['192px', '192px', 48, 48]);
    ui.file('Vehicle').click();
    ui.load();
    assert.equal(ui.zoom().value, '4');
    assert.deepEqual(shown(), ['192px', '192px', 48, 48]);
    // Fit again.
    ui.zoom().value = 'fit';
    ui.zoom().fire('change');
    assert.deepEqual(shown(), ['48px', '48px', 48, 48]);

    ui.button('char-picker-cancel').click();
    assert.equal(ui.observers[0].disconnected, true, 'the room is no longer watched once the picker has closed');
});

test('the file on show keeps its picked frame when it is clicked again', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    ui.sheet().fire('click', { target: ui.frame(7, 2, 8) });
    ui.file('Vehicle').click();
    assert.equal(ui.frame(7, 2, 8).classList.contains('selected'), true);
    ui.ok().click();
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 7, pattern: 2, direction: 8 }]);
});

test('Clear hands back no picture; Cancel, the close button and Escape hand back nothing', t => {
    const cleared = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    cleared.load();
    cleared.button('char-picker-clear').click();
    assert.deepEqual(cleared.results, [{ characterName: '', characterIndex: 0, pattern: 0, direction: 2 }]);
    assert.equal(cleared.modal(), null);

    for (const id of ['char-picker-cancel', 'char-picker-close']) {
        const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
        ui.load();
        ui.button(id).click();
        assert.deepEqual(ui.results, []);
        assert.equal(ui.modal(), null, id);
    }

    const escaped = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    escaped.load();
    assert.equal(escaped.key(escaped.frame(3, 1, 4), 'Escape'), true);
    assert.deepEqual(escaped.results, []);
    assert.equal(escaped.modal(), null);
});

test('the keyboard reaches the file list and the sheet, and Enter confirms', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    // The keyboard is on the file list from the moment the picker opens: one Tab stop there, not one per file.
    assert.equal(ui.focus(), 'file Vehicle');
    assert.deepEqual(ui.all('.rr-picker-file-item').filter(item => item.tabIndex === 0).map(item => item.dataset.fileName), ['Vehicle']);
    assert.ok(ui.all('.rr-picker-index-rail').length === 1 && ui.one('.rr-picker-index-rail').children.every(button => button.tabIndex === -1));
    ui.load();

    // One Tab stop in the sheet: the picked frame. Right and Left walk in reading order, Up and Down move a row.
    assert.deepEqual(ui.tabStops(), ['frame 3/1/4']);
    const revealed = [];
    for (const el of ui.frames()) el.scrollIntoView = () => { revealed.push(el); };
    ui.frame(3, 1, 4).focus();
    ui.key(ui.frame(3, 1, 4), 'ArrowRight');
    assert.equal(ui.status(), 'Character 4 · Left · Frame 3');
    assert.equal(ui.focus(), 'frame 3/2/4');
    ui.key(ui.frame(3, 2, 4), 'ArrowDown');
    assert.equal(ui.status(), 'Character 4 · Right · Frame 3');
    // A frame the keys move to is brought into view (a zoom larger than the box scrolls); a clicked one is in view.
    assert.deepEqual(revealed.map(named), ['frame 3/2/4', 'frame 3/2/6']);
    ui.sheet().fire('click', { target: ui.frame(3, 2, 6) });
    assert.equal(revealed.length, 2);
    ui.key(ui.frame(3, 2, 6), 'ArrowDown');
    ui.key(ui.frame(3, 2, 8), 'ArrowDown');
    assert.equal(ui.status(), 'Character 8 · Down · Frame 3', 'Down crosses from one character to the one under it');
    ui.key(ui.frame(7, 2, 2), 'ArrowUp');
    assert.equal(ui.status(), 'Character 4 · Up · Frame 3');
    ui.key(ui.frame(3, 2, 8), 'ArrowLeft');
    assert.equal(ui.status(), 'Character 4 · Up · Frame 2');
    ui.key(ui.frame(3, 1, 8), 'Home');
    assert.equal(ui.status(), 'Character 1 · Down · Frame 1');
    ui.key(ui.frame(0, 0, 2), 'ArrowUp');
    assert.equal(ui.status(), 'Character 1 · Down · Frame 1', 'the top row has nothing above it');
    assert.deepEqual(ui.tabStops(), ['frame 0/0/2']);
    assert.equal(ui.all('.rr-char-picker-frame').filter(el => el.classList.contains('selected')).length, 1);

    // Enter on the sheet confirms the frame the arrows reached.
    assert.equal(ui.key(ui.frame(0, 0, 2), 'Enter'), true);
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 0, pattern: 0, direction: 2 }]);
    assert.equal(ui.modal(), null);
});

test('with the pointer resting on the sheet, the line names the frame the keys pick', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    const sheet = ui.sheet(), line = () => ui.one('.rr-char-picker-status');
    // A click: the pointer enters the frame, presses it, and stays there.
    sheet.fire('mouseover', { target: ui.frame(1, 0, 4), screenX: 400, screenY: 300 });
    sheet.fire('click', { target: ui.frame(1, 0, 4) });
    assert.equal(ui.status(), 'Character 2 · Left · Frame 1');
    ui.key(ui.frame(1, 0, 4), 'ArrowRight');
    ui.key(ui.frame(1, 1, 4), 'ArrowRight');
    ui.key(ui.frame(1, 2, 4), 'ArrowDown');
    assert.equal(ui.frame(1, 2, 6).classList.contains('selected'), true);
    assert.equal(ui.status(), 'Character 2 · Right · Frame 3');
    assert.equal(line().classList.contains('is-hover'), false);

    // Bringing the picked frame into view slid another frame under the pointer, which has not moved: the page
    // reports the pointer entering it, and the line stays with the picked frame.
    sheet.fire('mouseover', { target: ui.frame(0, 2, 4), screenX: 400, screenY: 300 });
    sheet.fire('mousemove', { target: ui.frame(0, 2, 4), screenX: 400, screenY: 300 });
    assert.equal(ui.status(), 'Character 2 · Right · Frame 3');
    // The sheet scrolled out from under the pointer and back: it is reported to leave and to enter, in the one place.
    sheet.fire('mouseleave', { screenX: 400, screenY: 300 });
    sheet.fire('mouseover', { target: ui.frame(0, 0, 6), screenX: 400, screenY: 300 });
    assert.equal(ui.status(), 'Character 2 · Right · Frame 3');
    assert.equal(line().classList.contains('is-hover'), false);
    // The pointer moves, inside the frame it is on: the line follows the pointer again.
    sheet.fire('mousemove', { target: ui.frame(0, 2, 4), screenX: 403, screenY: 300 });
    assert.equal(ui.status(), 'Character 1 · Left · Frame 3');
    assert.equal(line().classList.contains('is-hover'), true);
    sheet.fire('mouseover', { target: ui.frame(0, 1, 4), screenX: 380, screenY: 300 });
    assert.equal(ui.status(), 'Character 1 · Left · Frame 2');
    // Off the sheet, the line is the picked frame's.
    ui.key(ui.frame(1, 2, 6), 'ArrowLeft');
    sheet.fire('mouseleave');
    sheet.fire('mouseover', { target: ui.frame(7, 0, 2), screenX: 380, screenY: 300 });
    assert.equal(ui.status(), 'Character 8 · Down · Frame 1', 'a pointer that left and came back is followed');

    // Another file while the keys lead: on its sheet the line follows the pointer from the first frame it enters.
    ui.key(ui.frame(1, 1, 6), 'ArrowRight');
    ui.file('People').click();
    ui.load();
    ui.sheet().fire('mouseover', { target: ui.frame(2, 0, 2), screenX: 380, screenY: 300 });
    assert.equal(ui.status(), 'Character 3 · Down · Frame 1');
});

test('a held Enter is one Enter', t => {
    // Enter opened the picker and is still down: its repeats land on the file list, where Enter would confirm.
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    for (const target of [ui.file('Vehicle'), ui.frame(3, 1, 4), ui.button('char-picker-clear'), ui.button('char-picker-cancel')]) {
        assert.equal(ui.key(target, 'Enter', { repeat: true }), true, 'the repeat is kept from the page');
        assert.deepEqual(ui.results, []);
        assert.notEqual(ui.modal(), null);
    }
    // Let go and pressed again, it confirms.
    assert.equal(ui.key(ui.file('Vehicle'), 'Enter'), true);
    assert.deepEqual(ui.results, [{ characterName: 'Vehicle', characterIndex: 3, pattern: 1, direction: 4 }]);
});

test('Enter on the file list confirms a picked frame, and moves on to the sheet when none is picked', t => {
    const picked = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    picked.load();
    assert.equal(picked.key(picked.file('Vehicle'), 'Enter'), true);
    assert.deepEqual(picked.results, [{ characterName: 'Vehicle', characterIndex: 3, pattern: 1, direction: 4 }]);

    const fresh = openPicker(t, { sizes: SHEETS, args: ['', 0, 0, 2] });
    assert.equal(fresh.ok().disabled, true);
    assert.equal(fresh.one('.rr-char-picker-message').textContent, 'Select a character file from the list');
    fresh.file('People').click();
    fresh.load();
    assert.equal(fresh.key(fresh.file('People'), 'Enter'), true);
    assert.deepEqual(fresh.results, []);
    assert.equal(fresh.focus(), 'frame 0/0/2', 'the first frame takes the keyboard');
    // Down from a frame that only holds the focus picks the one under it.
    fresh.key(fresh.frame(0, 0, 2), 'ArrowDown');
    assert.equal(fresh.status(), 'Character 1 · Left · Frame 1');
    assert.equal(fresh.key(fresh.frame(0, 0, 4), 'Enter'), true);
    assert.deepEqual(fresh.results, [{ characterName: 'People', characterIndex: 0, pattern: 0, direction: 4 }]);

    // Buttons, the zoom and the search field keep their own Enter.
    const other = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    other.load();
    assert.equal(other.key(other.button('char-picker-cancel'), 'Enter'), false);
    assert.equal(other.key(other.zoom(), 'Enter'), false);
    assert.equal(other.key(other.one('input'), 'Enter'), false);
    assert.deepEqual(other.results, []);
    assert.notEqual(other.modal(), null);

    // Enter on a file that is not the one on show opens that file: the frame picked on the old sheet is not confirmed.
    other.key(other.file('People'), 'Enter');
    assert.deepEqual(other.results, []);
    assert.equal(other.one('.rr-char-picker-preview').dataset.selectedFile, 'People');
    other.load();
    assert.equal(other.ok().disabled, true);
});

test('a picture that cannot be loaded says so in place of the sheet', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    fs.rmSync(path.join(ui.picker.currentProject.path, 'img', 'characters', 'People.png'));
    ui.file('People').click();
    ui.load();
    const message = ui.one('.rr-char-picker-message');
    assert.ok(message.classList.contains('is-error'));
    assert.match(message.textContent, /Failed to load image: People/);
    assert.equal(ui.ok().disabled, true);
    assert.equal(ui.frames().length, 0);
    assert.equal(ui.one('.rr-char-picker-zoom').hidden, true);
});

test('the room is measured from the sheet\'s box, less its padding and border', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    delete ui.picker._measureRoom;                       // the picker's own, not the helper's stand-in
    const box = ui.one('.rr-char-picker-sheet-box');
    box.offsetWidth = 500; box.offsetHeight = 300; box.clientWidth = 498; box.clientHeight = 298;
    ui.context.getComputedStyle = () => ({ paddingLeft: '8px', paddingRight: '8px', paddingTop: '8px', paddingBottom: '8px',
        borderLeftWidth: '1px', borderRightWidth: '1px', borderTopWidth: '1px', borderBottomWidth: '1px' });
    assert.deepEqual({ ...ui.picker._measureRoom() }, { width: 482, height: 282 });
    // The fitted zoom comes from that measure: 50% is the largest step at which the stock sheet fits 482x282.
    ui.picker._applyZoom();
    assert.equal(ui.frames()[0].firstChild.style.width, '24px');
    // A box that is not laid out yet has no room to measure.
    box.offsetWidth = 0; box.offsetHeight = 0; box.clientWidth = 0; box.clientHeight = 0;
    assert.deepEqual({ ...ui.picker._measureRoom() }, { width: 0, height: 0 });
});

test('a picker that is shown again keeps the zoom chosen in it', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 0, 1, 2] });
    ui.load();
    ui.zoom().value = '3';
    ui.zoom().fire('change');
    ui.button('char-picker-cancel').click();
    ui.picker.show('Vehicle', 0, 1, 2, () => {});
    ui.load();
    assert.equal(ui.zoom().value, '3', 'the control shows the zoom in force');
    assert.equal(ui.frames()[0].firstChild.style.width, '144px');
});

test('closing the picker lets go of everything it held', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4], observe: true, animationFrames: true });
    assert.ok(ui.modal().contains(ui.document.activeElement), 'the keyboard is in the dialog while it is open');
    ui.load();
    const modal = ui.modal(), sheet = ui.sheet();
    assert.ok(modal._rrModalKeys, 'the dialog has the keyboard helper');
    assert.ok(sheet._rrRovingKeys, 'the sheet has the roving keys');
    // The room reports twice before the next frame: one refit is asked for, and it is still waiting at the close.
    ui.observers[0].callback();
    ui.observers[0].callback();
    assert.equal(ui.queued.length, 1);
    ui.button('char-picker-cancel').click();
    assert.deepEqual(ui.cancelled, [1], 'the waiting refit is called off');
    assert.equal(ui.observers[0].disconnected, true);
    assert.equal(modal._rrModalKeys, undefined);
    assert.equal(sheet._rrRovingKeys, undefined);
    assert.equal(ui.focus(), 'opener', 'the keyboard goes back to what opened the picker');
});

test('a refit asked for by the room runs on the next frame', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['$Hero', 0, 1, 2], observe: true, animationFrames: true });
    ui.load();
    const width = () => ui.frames()[0].firstChild.style.width;
    assert.equal(width(), '96px');
    ui.setRoom(ROOM_1000);
    ui.observers[0].callback();
    assert.equal(width(), '96px', 'not inside the report itself');
    ui.queued.shift()();
    assert.equal(width(), '144px');
    ui.observers[0].callback();
    assert.equal(ui.queued.length, 1, 'the next report asks again');
});

test('a sheet still loading when the picker closes is not drawn', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.button('char-picker-cancel').click();
    ui.load();
    assert.equal(ui.draws.length, 0);
    assert.deepEqual(ui.results, []);
});

test('the dialog is in the editor\'s language, and file and frame names are kept from the page translator', t => {
    const words = { 'Select Character Graphic': 'Charaktergrafik wählen', 'Fit to view': 'Ganz zeigen', Left: 'Links',
        'Character {index} · {direction} · Frame {frame}': 'Charakter {index} · {direction} · Einzelbild {frame}' };
    const applied = [];
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4], i18n: { tText: text => words[text] || text, applyText: element => applied.push(element) } });
    ui.load();
    assert.equal(applied.length, 1);
    assert.ok(applied[0] === ui.modal(), 'the page translator runs over the dialog');
    assert.equal(ui.one('.rr-modal-title').textContent, 'Charaktergrafik wählen');
    assert.equal(ui.zoom().children[0].textContent, 'Ganz zeigen');
    assert.equal(ui.status(), 'Charakter 4 · Links · Einzelbild 2');
    assert.equal(ui.frame(3, 1, 4).getAttribute('aria-label'), 'Charakter 4 · Links · Einzelbild 2');
    // A file may be named like a word of the editor, and the line under the sheet is already in the language.
    for (const selector of ['.rr-char-picker-name', '.rr-char-picker-kind', '.rr-char-picker-status']) {
        assert.equal(ui.one(selector).getAttribute('data-rr-i18n-skip'), '1', selector);
    }
});

// ---------------------------------------------------------------- how it looks

/** The picker's own block of the stylesheet, between its header and its closing line. */
function pickerStyles() {
    const css = read('css/styles.css');
    const start = css.indexOf('Character sheet picker');
    const end = css.indexOf('/* End of the character sheet picker. */');
    assert.ok(start >= 0 && end > start, 'styles.css has the Character sheet picker block');
    return css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('the picker is styled by its own block of classes, in theme colors only', () => {
    // Nothing is styled inline but the sizes the code computes.
    assert.doesNotMatch(pickerSource, /style\.cssText/);
    assert.doesNotMatch(pickerSource, /var\(--/);
    assert.doesNotMatch(pickerSource, /#[0-9a-f]{3,8}\b|rgba?\(/i);

    const styles = pickerStyles();
    const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), body: match[2] }))
        .filter(rule => !rule.selector.startsWith('@'));
    assert.ok(rules.length > 20);
    for (const rule of rules) {
        for (const selector of rule.selector.split(',')) assert.match(selector.trim(), /^\.rr-char-picker/, rule.selector);
        // Colors are theme tokens: a literal would be right in one palette and one mode only.
        assert.doesNotMatch(rule.body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, rule.selector);
    }
    // One accent: the link blue is for links.
    assert.doesNotMatch(styles, /--color-link/);
    assert.match(styles, /\.rr-char-picker-frame\.selected::after\s*\{[^}]*border-color:\s*var\(--color-accent-bright\)/);
    assert.match(styles, /\.rr-char-picker-frame\.selected canvas\s*\{[^}]*color-mix\(in srgb, var\(--color-accent\) \d+%, transparent\)/);
    // The frame under the pointer is a fainter state of the same accent, in every palette.
    assert.match(styles, /\.rr-char-picker-frame:hover::after\s*\{[^}]*color-mix\(in srgb, var\(--color-accent-bright\) \d+%, transparent\)/);
    assert.match(styles, /\.rr-char-picker-frame:hover canvas\s*\{[^}]*color-mix\(in srgb, var\(--color-accent\) \d+%, transparent\)/);
    // No rule that cannot apply: the accent scrollbar class owns the bars, and the editor's window is never phone-narrow.
    assert.doesNotMatch(styles, /::-webkit-scrollbar/);
    assert.doesNotMatch(styles, /@media/);
    assert.equal(Picker.prototype.setupPickerEvents.length, 1);
    // The grid follows the picture in a right-to-left language too.
    assert.match(styles, /\.rr-char-picker-sheet\s*\{[^}]*direction:\s*ltr/);
    // Only the sheet's own box scrolls, and enlarged art keeps sharp pixels.
    assert.match(styles, /\.rr-char-picker-sheet-box\s*\{[^}]*overflow:\s*auto/);
    assert.match(styles, /\.rr-char-picker-preview\s*\{[^}]*overflow:\s*hidden/);
    assert.match(styles, /\.rr-char-picker-frame canvas\s*\{[^}]*image-rendering:\s*pixelated/);
});

/** The color tokens of every palette and mode in css/theme.css; a palette inherits what it does not set from the default. */
function themeTokens() {
    const themes = {};
    for (const [, name = 'dark', body] of read('css/theme.css').matchAll(/^:root(?:\[data-theme="([\w-]+)"\])?\s*\{([\s\S]*?)^\}/gm)) {
        const tokens = themes[name] ||= {};
        for (const [, token, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[token] = value.replace(/\/\*.*?\*\//g, '').trim();
    }
    for (const tokens of Object.values(themes)) if (tokens !== themes.dark) Object.setPrototypeOf(tokens, themes.dark);
    return themes;
}

/** WCAG contrast of two "#rrggbb" colors. */
function contrast(first, second) {
    const luminance = color => {
        const [r, g, b] = [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16) / 255)
            .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
}

test('the ring of the picked frame stands out from the frames in every palette, dark and light', () => {
    const styles = pickerStyles();
    const ring = /\.rr-char-picker-frame\.selected::after\s*\{[^}]*border-color:\s*var\((--[\w-]+)\)/.exec(styles)[1];
    const behind = /\.rr-char-picker-frame\s*\{[^}]*background:\s*var\((--[\w-]+)\)/.exec(styles)[1];
    const themes = themeTokens();
    assert.equal(Object.keys(themes).length, 14, 'seven palettes, dark and light');
    for (const [theme, tokens] of Object.entries(themes)) {
        assert.match(tokens[ring], /^#[0-9a-f]{6}$/i, `${theme} ${ring}`);
        assert.match(tokens[behind], /^#[0-9a-f]{6}$/i, `${theme} ${behind}`);
        const ratio = contrast(tokens[ring], tokens[behind]);
        // 3:1 is what a control's own outline needs against what is next to it.
        assert.ok(ratio >= 3, `${theme}: ${ring} on ${behind} is ${ratio.toFixed(2)}:1`);
    }
});

test('the dialog grows with the window, and the name and the kind share its bar', () => {
    const styles = pickerStyles();
    const rule = /\.rr-char-picker\.rr-modal\s*\{[^}]*width:\s*min\((\d+)vw, clamp\((\d+)px, (\d+)vh, (\d+)px\)\);[^}]*height:\s*min\((\d+)px, (\d+)vh\)/.exec(styles);
    assert.ok(rule, 'the dialog is sized from the window, both ways');
    const [ofWidth, least, ofHeight, most, tallest, heightOfHeight] = rule.slice(1).map(Number);
    const dialog = (width, height) => [Math.round(Math.min(width * ofWidth / 100, Math.max(least, Math.min(height * ofHeight / 100, most)))),
        Math.round(Math.min(tallest, height * heightOfHeight / 100))];
    assert.deepEqual(dialog(1280, 720), [1040, 648]);
    assert.deepEqual(dialog(1600, 1000), [1350, 900]);
    assert.deepEqual(dialog(1920, 1080), [1350, 900]);
    assert.deepEqual(dialog(1024, 600), [942, 540], 'never wider than the smallest window');
    // Each of the two grows to its own text and no further, the kind by the larger share: a long file name is cut
    // before the kind is, and a short one leaves the kind right after it.
    assert.match(styles, /\.rr-char-picker-name, \.rr-char-picker-kind\s*\{[^}]*flex:\s*1 1 0;[^}]*max-width:\s*max-content;[^}]*text-overflow:\s*ellipsis/);
    assert.match(styles, /\.rr-char-picker-kind\s*\{[^}]*flex-grow:\s*2;/);
    assert.doesNotMatch(styles, /\.rr-char-picker-name\s*\{[^}]*flex/);
    assert.match(styles, /\.rr-char-picker-zoom\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin-inline-start:\s*auto/);
});

test('the file list and the sheet scroll behind the editor\'s accent scrollbar', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    ui.load();
    for (const selector of ['.rr-picker-index-list', '.rr-picker-index-rail', '.rr-char-picker-sheet-box']) {
        assert.ok(ui.one(selector).classList.contains('rr-accent-scrollbar'), selector);
    }
    assert.match(read('css/styles.css'), /\.rr-accent-scrollbar\s*\{[^}]*scrollbar-color:\s*var\(--color-accent-muted\)/);
});

test('the dialog is one of the editor\'s dialogs', t => {
    const ui = openPicker(t, { sizes: SHEETS, args: ['Vehicle', 3, 1, 4] });
    const modal = ui.modal();
    // Escape on the map must not let go of a selection while the picker is up: main.js looks for this class.
    assert.ok(modal.classList.contains('rr-modal-overlay'));
    assert.equal(modal.getAttribute('role'), 'dialog');
    assert.equal(modal.getAttribute('aria-modal'), 'true');
    assert.ok(modal.children[0].classList.contains('rr-modal'));
    assert.deepEqual(modal.children[0].children.map(child => child.className.split(' ')[0]), ['rr-modal-header', 'rr-char-picker-body', 'rr-modal-footer']);
    assert.equal(ui.one('.rr-modal-title').textContent, 'Select Character Graphic');
    assert.deepEqual(ui.one('.rr-modal-footer').children.map(button => [button.textContent, button.className.split(' ')[0]]),
        [['Clear', 'rr-btn-secondary'], ['OK', 'rr-button-primary'], ['Cancel', 'rr-btn-secondary']]);
});
