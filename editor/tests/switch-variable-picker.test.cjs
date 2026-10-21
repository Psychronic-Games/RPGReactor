'use strict';
// The switch and variable window (editor/src/event/SwitchVariablePicker.js): what its rows read, the field that
// finds a row by number or name, the keys, where the window stands, and the look its rules give it. How it is
// opened and what it hands back are the same for every caller: show(type, id, callback) and callback(id, name).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const Picker = require('../src/event/SwitchVariablePicker.js');
const mini = require('./helpers/mini-dom.cjs');

const switches = [''].concat(Array.from({ length: 100 }, (_, i) => ({ 1: 'Raid on North Haven', 2: 'North Haven defended', 3: 'Militia gear issued', 5: 'Chapter 12 begun', 12: 'Bridge down', 40: 'Épée drawn' }[i + 1] || '')));
const variables = [''].concat(Array.from({ length: 20 }, (_, i) => ({ 1: 'Battle result', 2: 'Season' }[i + 1] || '')));

// A page small enough to run the window in, and an opener that had the keyboard before it opened.
function makePage(options = {}) {
    const document = mini.createElement('document');
    document.body = mini.createElement('body');
    document.appendChild(document.body);
    document.createElement = mini.createElement;
    const opener = mini.createElement('button');
    const host = mini.createElement('div');
    // What the field is in: a docked panel, the shared dialog overlay, or (`host`) a root with a class, id or role of the test's own.
    host.className = options.inDialog ? 'rr-modal-overlay' : 'lighting-panel';
    if (options.host) { host.className = options.host.className || ''; if (options.host.id) host.id = options.host.id; if (options.host.role) host.setAttribute('role', options.host.role); }
    host.appendChild(opener);
    document.body.appendChild(host);
    opener.getBoundingClientRect = () => options.openerRect || { left: 1320, top: 600, right: 1560, bottom: 626, width: 240, height: 26 };
    // The panel the field is in: docked at the right of a 1600 px window unless a test says otherwise.
    host.getBoundingClientRect = () => options.panelRect || { left: 1280, top: 128, right: 1600, bottom: 999, width: 320, height: 871 };
    document.body.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1600, bottom: 1000, width: 1600, height: 1000 });
    opener.focus();
    global.document = document;
    global.window = { innerWidth: 1600, innerHeight: 1000 };
    const picked = [];
    const picker = new Picker({ getSystem: () => ({ switches, variables }) }, {});
    const open = (type, id) => {
        picker.show(type, id, (chosen, name) => picked.push([chosen, name]));
        clearTimeout(picker.scrollTimer);
        return picker.modal;
    };
    const rows = () => picker.modal.querySelectorAll('.rr-picker-item');
    const shown = () => rows().filter(row => !row.hidden).map(row => row.dataset.id);
    const find = () => picker.modal.querySelector('.rr-picker-find-input');
    const type = text => { find().value = text; find().fire('input'); };
    const key = (target, name, more = {}) => { let stopped = false; target.fire('keydown', Object.assign({ key: name, preventDefault() { stopped = true; } }, more)); return stopped; };
    return { document, opener, picker, open, picked, rows, shown, find, type, key };
}

test('a row reads its number and its name, in the words the panel\'s fields use', () => {
    const { open, rows, picker } = makePage();
    const modal = open('switch', 3);
    assert.equal(modal.querySelector('.rr-modal-title').textContent, 'Select Switch');
    assert.equal(rows().length, 100);
    const text = row => row.children.map(child => child.textContent);
    assert.deepEqual(text(rows()[2]), ['0003', 'Militia gear issued']);
    assert.deepEqual(text(rows()[5]), ['0006', 'Switch 0006'], 'an unnamed switch goes by its number');
    assert.deepEqual(rows().filter(row => row.classList.contains('is-selected')).map(row => row.dataset.id), ['3']);
    assert.ok(rows().every(row => row.tagName === 'BUTTON'), 'a row is a button: Enter and Space pick it');
    // The ranges of fifty beside the list, and the editor's own scrollbar on both.
    assert.deepEqual(modal.querySelectorAll('.rr-picker-range-tab').map(tab => tab.textContent), ['1-50', '51-100']);
    for (const part of ['.rr-picker-list', '.rr-picker-tabs']) assert.ok(modal.querySelector(part).classList.contains('rr-accent-scrollbar'), part);
    assert.equal(modal.querySelector('.rr-picker-workspace').classList.contains('is-single-range'), false);
    assert.equal(modal.querySelector('.rr-picker-workspace').classList.contains('is-wide'), false);
    assert.equal(modal.querySelector('.rr-picker-footer-status').textContent, 'Number of switches: 100');
    picker.close();
    // Twenty variables are one range: the rail has nothing to offer and is not shown.
    const few = makePage();
    const small = few.open('variable', 2);
    assert.equal(small.querySelector('.rr-modal-title').textContent, 'Select Variable');
    assert.equal(small.querySelector('.rr-picker-footer-status').textContent, 'Number of variables: 20');
    assert.equal(few.rows().length, 20);
    assert.ok(small.querySelector('.rr-picker-workspace').classList.contains('is-single-range'));
    few.picker.close();
});

test('the title and the count are whole phrases, written for each of the 17 languages; no sentence is put together from single words', () => {
    const source = read('src/event/SwitchVariablePicker.js');
    assert.doesNotMatch(source, /tt\('Select'\)|tt\(pluralLabel\)|tt\('Current max:'\)/);
    const context = {};
    new Function('globalThis', read('src/I18nDeepTranslations.js'))(context);
    const words = context.RR_DEEP_TEXT_TRANSLATIONS;
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const phrases = ['Select Switch', 'Select Variable', 'Number of switches: {count}', 'Number of variables: {count}'];
    for (const locale of locales) for (const phrase of phrases) {
        const text = words[locale][phrase];
        assert.ok(text && text !== phrase, `${locale}: ${phrase}`);
        assert.equal(text.includes('{count}'), phrase.includes('{count}'), `${locale}: ${phrase}`);
    }
    // The window in German: the words in German order, the count after its noun, nothing left in English.
    const page = makePage();
    try {
        global.window.I18n = { tText: text => words.de[text] || text };
        const modal = page.open('switch', 3);
        assert.equal(modal.querySelector('.rr-modal-title').textContent, 'Schalter auswählen');
        assert.equal(modal.querySelector('.rr-picker-footer-status').textContent, 'Anzahl der Schalter: 100');
        page.picker.close();
        const other = page.open('variable', 2);
        assert.equal(other.querySelector('.rr-modal-title').textContent, 'Variable auswählen');
        assert.equal(other.querySelector('.rr-picker-footer-status').textContent, 'Anzahl der Variablen: 20');
        page.picker.close();
    } finally { delete global.window.I18n; }
});

test('opened: the chosen row is brought to the middle and has the keyboard, the rail shows its range; with none chosen the field has the keyboard', async () => {
    const page = makePage();
    const calls = [];
    const watch = modal => {
        for (const row of modal.querySelectorAll('.rr-picker-item')) { row.offsetHeight = 26; row.scrollIntoView = options => calls.push(['row', row.dataset.id, options.block]); }
        for (const tab of modal.querySelectorAll('.rr-picker-range-tab')) tab.scrollIntoView = options => calls.push(['range', tab.textContent, options.block]);
    };
    const opened = () => new Promise(resolve => setTimeout(resolve, 70));
    // Switch 73 of 100: its row in the middle of the list, the keyboard on it, and its range, 51-100, in view on the rail.
    page.picker.show('switch', 73, () => {});
    watch(page.picker.modal);
    await opened();
    assert.deepEqual(calls, [['row', '73', 'center'], ['range', '51-100', 'nearest']]);
    assert.equal(page.document.activeElement, page.rows()[72]);
    assert.equal(page.picker.scrollTimer, null);
    // The list scrolled into another range: that range is lit and brought into view on the rail.
    calls.length = 0;
    const list = page.picker.modal.querySelector('.rr-picker-list');
    list.scrollTop = 0;
    page.picker.updateActiveTabFromScroll(list);
    assert.deepEqual(calls, [['range', '1-50', 'nearest']]);
    page.picker.updateActiveTabFromScroll(list);
    assert.equal(calls.length, 1, 'only when the range changes');
    page.picker.close();
    // Nothing chosen yet: the first range from its top, and the keyboard in the field.
    calls.length = 0;
    page.opener.focus();
    page.picker.show('switch', 0, () => {});
    watch(page.picker.modal);
    await opened();
    assert.deepEqual(calls, [['row', '1', 'start'], ['range', '1-50', 'nearest']]);
    assert.equal(page.document.activeElement, page.find());
    page.picker.close();
});

test('Page Up and Page Down move the mark and the keyboard by the rows that fit, among the rows the field left', () => {
    const { open, rows, key, type, document, picker } = makePage();
    const modal = open('switch', 3);
    const list = modal.querySelector('.rr-picker-list');
    const seen = [];
    for (const row of rows()) { row.offsetHeight = 26; row.scrollIntoView = options => seen.push([row.dataset.id, options.block]); }
    list.clientHeight = 26 * 10 + 8;
    const marked = () => rows().filter(row => row.classList.contains('is-selected')).map(row => row.dataset.id);
    rows()[2].focus();
    assert.equal(key(list, 'PageDown'), true, 'the list does not also scroll by itself');
    assert.deepEqual([document.activeElement.dataset.id, marked(), seen.pop()], ['12', ['12'], ['12', 'nearest']], 'ten rows fit: nine down, one stays in view');
    key(list, 'PageDown');
    assert.equal(document.activeElement.dataset.id, '21');
    key(list, 'PageUp');
    key(list, 'PageUp');
    key(list, 'PageUp');
    assert.deepEqual([document.activeElement.dataset.id, marked()], ['1', ['1']], 'stops at the first row');
    for (let i = 0; i < 20; i++) key(list, 'PageDown');
    assert.equal(document.activeElement.dataset.id, '100', 'and at the last');
    // With the field leaving only some rows, a page is counted in those.
    type('5');
    const left = rows().filter(row => !row.hidden).map(row => row.dataset.id);
    rows()[4].focus();
    key(list, 'PageDown');
    assert.equal(document.activeElement.dataset.id, left[9]);
    key(list, 'PageDown', { ctrlKey: true });
    assert.equal(document.activeElement.dataset.id, left[9], 'a shortcut is left alone');
    // A list not yet measured still moves a row.
    list.clientHeight = 0;
    key(list, 'PageUp');
    assert.equal(document.activeElement.dataset.id, left[8]);
    picker.close();
});

test('Set Maximum draws the window again with every row, whatever the field held', () => {
    const { open, type, shown, find, picker } = makePage();
    open('switch', 3);
    type('haven');
    assert.deepEqual([shown(), picker.found], [['1', '2'], [1, 2]]);
    picker.updateModalContent(1);
    clearTimeout(picker.scrollTimer);
    assert.deepEqual([shown().length, picker.found, find().value || ''], [100, null, '']);
    picker.close();
});

test('the field finds a row: a number jumps to that ID, words find a name, Enter picks what is marked', () => {
    assert.deepEqual([Picker.matches(12, 'Chapter', '12'), Picker.matches(120, 'x', '12'), Picker.matches(3, 'Year 12', '12'), Picker.matches(13, 'x', '12')], [true, true, true, false]);
    assert.deepEqual([Picker.matches(40, 'Épée drawn', 'epee'), Picker.matches(3, 'Militia gear issued', 'GEAR'), Picker.matches(3, 'abc', ''), Picker.matches(3, 'abc', '  '), Picker.matches(3, 'abc', 'zz')], [true, true, true, true, false]);
    const { open, shown, type, find, key, picked, picker, document, opener, rows } = makePage();
    const modal = open('switch', 3);
    const marked = () => rows().filter(row => row.classList.contains('is-selected')).map(row => row.dataset.id);
    assert.equal(find().getAttribute('aria-label'), 'Type a number or a name');
    type('12');
    assert.deepEqual(shown(), ['5', '12'], 'the ID the digits are written in, 0012, and a name that holds them');
    assert.deepEqual(marked(), ['12'], 'the ID typed whole is the one Enter picks, though another row stands before it');
    assert.equal(modal.querySelector('.rr-picker-find-clear').hidden, false);
    type('1');
    assert.deepEqual(shown().slice(0, 4), ['1', '5', '10', '11']);
    assert.deepEqual(marked(), ['1']);
    type('haven');
    assert.deepEqual(shown(), ['1', '2']);
    assert.deepEqual(marked(), ['1'], 'words: the first row left');
    type('epee');
    assert.deepEqual(shown(), ['40'], 'found without its accents');
    // Nothing matches: the list says so and Enter picks nothing.
    type('zzz');
    assert.deepEqual([shown(), modal.querySelector('.rr-picker-empty').hidden, modal.querySelector('.rr-picker-empty').textContent], [[], false, 'No matches']);
    assert.equal(key(find(), 'Enter'), true);
    assert.deepEqual(picked, []);
    assert.ok(picker.modal, 'still open');
    // Cleared: every row again, the mark back on the switch it was opened with.
    modal.querySelector('.rr-picker-find-clear').click();
    assert.deepEqual([shown().length, marked(), find().value, modal.querySelector('.rr-picker-empty').hidden, document.activeElement === find()], [100, ['3'], '', true, true]);
    // A number and Enter: picked, closed, and the keyboard back on the field that opened the window.
    type('40');
    key(find(), 'Enter');
    assert.deepEqual(picked, [[40, 'Épée drawn']]);
    assert.equal(picker.modal, null);
    assert.equal(document.activeElement, opener);
});

test('keys: a letter or a digit typed on the list goes to the field, an arrow in the field goes to the marked row, Escape closes', () => {
    const { open, find, key, type, document, picker, rows, opener, picked } = makePage();
    const modal = open('switch', 3);
    const list = modal.querySelector('.rr-picker-list');
    rows()[2].focus();
    key(list, ' ');
    assert.equal(document.activeElement, rows()[2], 'Space is the row\'s own key');
    key(list, 'a', { ctrlKey: true });
    assert.equal(document.activeElement, rows()[2], 'a shortcut is not typing');
    key(list, 'ArrowDown');
    assert.equal(document.activeElement, rows()[2], 'the arrows stay with the list');
    key(list, 'Backspace');
    assert.equal(document.activeElement, rows()[2], 'nothing to delete in an empty field');
    key(list, '4');
    assert.equal(document.activeElement, find(), 'the field has the keyboard before the digit is written');
    type('4');
    assert.equal(key(find(), 'ArrowDown'), true);
    assert.equal(document.activeElement, rows()[3], 'down from the field: the row Enter would pick');
    key(list, 'Backspace');
    assert.equal(document.activeElement, find(), 'Backspace on the list edits what was typed');
    // A row's own click picks it, with its name, as before.
    rows()[3].click();
    assert.deepEqual(picked, [[4, 'Switch 0004']]);
    assert.equal(document.activeElement, opener);
    // Escape closes without a choice.
    const again = open('variable', 2);
    again.fire('keydown', { key: 'Escape' });
    assert.equal(picker.modal, null);
    assert.equal(picked.length, 1);
});

test('a choice that draws the opener again leaves the keyboard on the control in its place', () => {
    // A dialog whose field is rebuilt by what is picked, as the event commands do it.
    const stage = (rebuild) => {
        const page = makePage({ inDialog: true });
        const dialog = page.opener.parentNode;
        const draw = (label) => {
            dialog.replaceChildren();
            const row = mini.createElement('div'), other = mini.createElement('button'), field = mini.createElement('button');
            other.className = 'rr-btn-secondary';
            field.className = 'rr-variable-reference';
            field.textContent = label;
            row.append(other, field);
            dialog.append(mini.createElement('div'), row);
            return field;
        };
        const field = draw('0001');
        field.focus();
        page.picker.show('variable', 1, (id) => rebuild(draw, id, page));
        clearTimeout(page.picker.scrollTimer);
        return Object.assign(page, { dialog });
    };
    // Drawn again with the same controls: the new field has the keyboard.
    let made = null;
    let page = stage((draw, id) => { made = draw(String(id).padStart(4, '0')); });
    page.rows()[4].click();
    assert.equal(page.document.activeElement, made);
    assert.equal(made.textContent, '0005');
    // The caller gave the keyboard to a control of its own while it drew: it stays there.
    let own = null;
    page = stage((draw, id, p) => { draw('x'); own = p.dialog.querySelector('.rr-btn-secondary'); own.focus(); });
    page.rows()[1].click();
    assert.equal(page.document.activeElement, own);
    // Drawn again as something else in that place: the keyboard is not put on a control of another kind.
    page = stage((draw, id, p) => { p.dialog.replaceChildren(); const text = mini.createElement('div'), input = mini.createElement('input'); text.append(mini.createElement('span'), input); p.dialog.append(mini.createElement('div'), text); p.document.activeElement = p.document.body; });
    page.rows()[1].click();
    assert.equal(page.document.activeElement, page.document.body);
    // Not drawn again: the opener itself, as ever.
    const plain = makePage({ inDialog: true });
    plain.open('switch', 1);
    plain.rows()[2].click();
    assert.equal(plain.document.activeElement, plain.opener);
    assert.equal(Picker.addressOf(null), null);
    assert.equal(Picker.controlAt(null), null);
    // In a command editor that wears no shared class the address still starts at the dialog, not at the page.
    const bare = makePage({ host: { className: 'change-gold-editor-modal' } });
    assert.equal(Picker.dialogOf(bare.opener), bare.opener.parentNode);
    assert.equal(Picker.addressOf(bare.opener).root, bare.opener.parentNode);
    assert.equal(Picker.dialogOf(makePage().opener), null, 'a docked panel is no dialog');
    assert.equal(Picker.dialogOf(null), null);
});

test('where it stands: beside the field of a docked panel, in the middle over a dialog, and never off the window', () => {
    const size = container => { container.getBoundingClientRect = () => ({ left: 580, top: 210, width: 440, height: 580 }); };
    const place = (options) => {
        const page = makePage(options);
        page.picker.createModal();
        const container = page.picker.modal.querySelector('.picker-container');
        size(container);
        page.picker.updateModalContent(1);
        page.picker.place(page.opener);
        clearTimeout(page.picker.scrollTimer);
        const out = [container.style.position || '', container.style.left || '', container.style.top || '', page.picker.modal.classList.contains('is-beside')];
        page.picker.close();
        return out;
    };
    // A field of the panel docked at the right: the window stands left of the PANEL (12 px clear of it, so no
    // label of the panel is covered), level with the field, inside the window.
    assert.deepEqual(place({ openerRect: { left: 1320, top: 600, right: 1560, bottom: 626, width: 240, height: 26 } }), ['absolute', '828px', '323px', true]);
    assert.deepEqual(place({ openerRect: { left: 1320, top: 940, right: 1560, bottom: 966, width: 240, height: 26 } }), ['absolute', '828px', '404px', true], 'low in the window: it ends 16 px above the edge');
    assert.deepEqual(place({ openerRect: { left: 1320, top: 40, right: 1560, bottom: 66, width: 240, height: 26 } }), ['absolute', '828px', '16px', true]);
    // A field in a column at the left (a sidebar, a card of a database page): right of that column.
    assert.deepEqual(place({ openerRect: { left: 40, top: 300, right: 280, bottom: 326, width: 240, height: 26 }, panelRect: { left: 0, top: 100, right: 320, bottom: 900, width: 320, height: 800 } }), ['absolute', '332px', '23px', true]);
    // A field straight on a wide page: beside the field itself.
    assert.deepEqual(place({ openerRect: { left: 40, top: 300, right: 280, bottom: 326, width: 240, height: 26 }, panelRect: { left: 0, top: 0, right: 1600, bottom: 1000, width: 1600, height: 1000 } }), ['absolute', '292px', '23px', true]);
    // A column with room on both sides: the side with more of it.
    const column = (left, right) => ({ openerRect: { left: left + 10, top: 300, right: right - 10, bottom: 326, width: right - left - 20, height: 26 }, panelRect: { left, top: 100, right, bottom: 900, width: right - left, height: 800 } });
    assert.deepEqual(place(column(500, 700)), ['absolute', '712px', '23px', true], '500 px at the left, 900 at the right: right of the column');
    assert.deepEqual(place(column(900, 1100)), ['absolute', '448px', '23px', true], '900 px at the left, 500 at the right: left of it');
    // A field as wide as the window leaves no side: the middle.
    assert.deepEqual(place({ openerRect: { left: 200, top: 300, right: 1400, bottom: 326, width: 1200, height: 26 }, panelRect: { left: 0, top: 0, right: 1600, bottom: 1000, width: 1600, height: 1000 } }), ['', '', '', false]);
    // A field inside a dialog (an event command, the event editor): the middle, over that dialog. A dialog is
    // told by the shared overlay, by the dialog role, or by a root named "…-modal": every command editor has
    // one, and many wear nothing else. Its columns are narrow, and the window must not stand beside one of
    // them, over the rest of the dialog.
    assert.deepEqual(place({ inDialog: true }), ['', '', '', false]);
    const narrow = { openerRect: { left: 650, top: 300, right: 830, bottom: 326, width: 180, height: 26 }, panelRect: { left: 640, top: 200, right: 840, bottom: 700, width: 200, height: 500 } };
    assert.deepEqual(place(narrow), ['absolute', '852px', '23px', true], 'the same column on a page: beside it');
    for (const host of [{ className: 'set-movement-route-editor-modal' }, { className: 'get-location-info-editor-modal extra' }, { className: 'change-gold-container rr-modal' }, { id: 'plugin-manager-modal' }, { role: 'dialog' }]) {
        assert.deepEqual(place(Object.assign({ host }, narrow)), ['', '', '', false], JSON.stringify(host));
    }
    assert.deepEqual(place(Object.assign({ host: { className: 'database-window modal-like' } }, narrow)), ['absolute', '852px', '23px', true], 'a page of the editor is no dialog');
    // A field that is not on the page (nothing had the keyboard): the middle.
    assert.deepEqual(place({ openerRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } }), ['', '', '', false]);
});

test('the ranges follow the list: the row at the top names the range, also while the field leaves only some rows', () => {
    const { open, picker, type } = makePage();
    const modal = open('switch', 3);
    const list = modal.querySelector('.rr-picker-list');
    for (const row of modal.querySelectorAll('.rr-picker-item')) row.offsetHeight = 26;
    const active = () => modal.querySelectorAll('.rr-picker-range-tab').filter(tab => tab.classList.contains('is-active')).map(tab => tab.textContent);
    assert.deepEqual(active(), ['1-50']);
    list.scrollTop = 26 * 49;
    picker.updateActiveTabFromScroll(list);
    assert.deepEqual(active(), ['1-50'], 'row 50 at the top');
    list.scrollTop = 26 * 50;
    picker.updateActiveTabFromScroll(list);
    assert.deepEqual(active(), ['51-100']);
    // The field leaves 5, 15, 25, 35, 45, then 50 to 59 and on: the seventh row left is 51, in the second range.
    type('5');
    list.scrollTop = 0;
    picker.updateActiveTabFromScroll(list);
    assert.deepEqual(active(), ['1-50']);
    assert.deepEqual(picker.found.slice(0, 7), [5, 15, 25, 35, 45, 50, 51]);
    list.scrollTop = 26 * 5;
    picker.updateActiveTabFromScroll(list);
    assert.deepEqual(active(), ['1-50'], '50 at the top');
    list.scrollTop = 26 * 6;
    picker.updateActiveTabFromScroll(list);
    assert.deepEqual(active(), ['51-100']);
    // A range's button goes to the first row left at or after its start: with 7, 17 ... 47, 57 left, that is 57.
    type('7');
    const seen = [];
    for (const row of modal.querySelectorAll('.rr-picker-item')) row.scrollIntoView = () => seen.push(row.dataset.id);
    picker.scrollToTab(1);
    assert.deepEqual(seen, ['57']);
    type('');
    seen.length = 0;
    picker.scrollToTab(1);
    assert.deepEqual(seen.slice(-1), ['51']);
    picker.close();
});

test('its look is the editor\'s: theme tokens, one row height, the UI font, a chosen row apart from a hovered one', () => {
    const css = read('css/theme.css');
    const rule = selector => {
        const at = css.indexOf(`\n${selector} {`);
        assert.ok(at >= 0, `no rule for ${selector}`);
        return css.slice(at, css.indexOf('}', at));
    };
    // A short list to pick from, not a page: smaller than a dialog, with a light backdrop of its own.
    assert.match(rule('.rr-switch-variable-picker'), /width: min\(440px, calc\(100vw - 32px\)\);\s*height: min\(580px, 84vh\);/);
    assert.match(rule('.switch-variable-picker-modal'), /background: rgba\(0, 0, 0, 0\.5\);/);
    assert.doesNotMatch(read('src/event/SwitchVariablePicker.js'), /this\.modal\.addEventListener\('click'/, 'a click on the backdrop is not listened for');
    // It still covers the dialog it was opened from.
    const layer = name => Number(css.match(new RegExp(`\\.${name}\\s*\\{[\\s\\S]*?z-index:\\s*(\\d+)`))[1]);
    assert.ok(layer('rr-nested-picker-modal') > layer('rr-event-command-modal'));
    // Rows: one height (the range in view is worked out from the scroll), hidden when the field leaves them out.
    assert.match(rule('.rr-picker-item'), /height: 26px;/);
    assert.match(rule('.rr-picker-item[hidden]'), /display: none;/);
    // The number is in the UI font with even digits, as the panel's fields write "0012: Name"; no typewriter face.
    assert.match(rule('.rr-picker-id'), /font-variant-numeric: tabular-nums;/);
    assert.doesNotMatch(rule('.rr-picker-id'), /font-family|--font-mono/);
    assert.doesNotMatch(read('src/event/SwitchVariablePicker.js'), /`#\$\{|'#'/);
    // The chosen row is the editor's selected row; the row under the pointer is a quieter tone of its own.
    assert.match(rule('.rr-picker-item.is-selected'), /background: var\(--color-bg-selected\);\s*border-color: var\(--color-accent\);/);
    assert.match(rule('.rr-picker-item:hover'), /background: color-mix\(in srgb, var\(--color-bg-hover\) 45%, var\(--color-bg-surface\)\);/);
    assert.match(rule('.rr-picker-item:focus-visible'), /outline: 2px solid var\(--color-accent-bright\);/);
    // The ranges are quiet buttons on the rail's ground; the one in view wears the selected row's look.
    assert.match(rule('.rr-picker-range-tab'), /background: transparent;/);
    assert.match(rule('.rr-picker-range-tab.is-active'), /background: var\(--color-bg-selected\);/);
    assert.match(rule('.rr-picker-workspace.is-single-range > .rr-picker-tabs'), /display: none;/);
    // A range stands on one line; with four digits a side the rail is wider for it.
    assert.match(rule('.rr-picker-range-tab'), /white-space: nowrap;/);
    assert.match(rule('.rr-picker-workspace.is-wide'), /grid-template-columns: 94px minmax\(0, 1fr\);/);
    const many = makePage();
    many.picker.databaseManager = { getSystem: () => ({ switches: [''].concat(Array.from({ length: 1000 }, () => '')), variables: [''].concat(Array.from({ length: 999 }, () => '')) }) };
    assert.equal(many.open('switch', 1).querySelector('.rr-picker-workspace').classList.contains('is-wide'), true, '1000 switches: the last range is 951-1000');
    many.picker.close();
    assert.equal(many.open('variable', 1).querySelector('.rr-picker-workspace').classList.contains('is-wide'), false, '999 variables: 951-999 fits the narrow rail');
    many.picker.close();
    // No color is written out in the window's own rules but the backdrop's: every other one is a theme token.
    const block = css.slice(css.indexOf('\n.rr-switch-variable-picker {'), css.indexOf('\n.rr-picker-footer-status {'));
    assert.deepEqual(block.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [], []);
});
