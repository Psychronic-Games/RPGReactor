/**
 * The editor asks and tells through its own themed dialog (utils/Dialog.js),
 * never through the browser's alert / confirm / prompt: those ignore the
 * theme and name their buttons in the system's language.
 *
 * Three parts: the helper itself, run against the mini DOM (each answer, the
 * keys, the danger rule, the queue, the focus, a prompt's validation); the
 * converted questions, each on yes and on no; and a guard that scans every
 * editor source for a native dialog call (the scanner is
 * helpers/native-dialog-scan.cjs). The flows converted in the second stage
 * (projects, maps, Database records, the event tools) are run in
 * themed-dialogs-flows.test.cjs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nodeTest = require('node:test');
const vm = require('node:vm');
const dom = require('./helpers/mini-dom.cjs');
const { codeOnly, nativeDialogCalls, answersWaited } = require('./helpers/native-dialog-scan.cjs');

const editorRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(editorRoot, 'src');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
// A test that waits for an answer that never comes fails by name instead of holding the suite.
const test = (name, run) => nodeTest(name, { timeout: 120000 }, run);

const UNANSWERED = Symbol('unanswered');
/**
 * A dialog's answer. Answers come as soon as the dialog is closed, so one that has not come after a
 * turn of the event loop is not coming: say so at once.
 */
async function answerOf(promise) {
    const value = await Promise.race([promise, new Promise(resolve => setImmediate(() => resolve(UNANSWERED)))]);
    if (value === UNANSWERED) assert.fail('the dialog was not answered: it is still open, or its answer was lost');
    return value;
}

// ---------------------------------------------------------------------------
// The helper on the mini DOM
// ---------------------------------------------------------------------------

/** Keys that type a character: the browser follows their keydown with a keypress. */
const typesACharacter = key => key === 'Enter' || key === ' ' || String(key).length === 1;

/** A page with the keyboard helper and the dialog loaded, and a button that has the focus. */
function createPage({ keyboardHelper = true, translate = null } = {}) {
    const windowListeners = [];
    const logged = [];
    const context = dom.createContext({
        addEventListener(type, handler, capture) { windowListeners.push({ type, handler, capture: !!capture }); },
        removeEventListener(type, handler) {
            const at = windowListeners.findIndex(entry => entry.type === type && entry.handler === handler);
            if (at >= 0) windowListeners.splice(at, 1);
        },
        console: { log() {}, debug() {}, info() {}, warn() {}, error: (...args) => { logged.push(args.map(String).join(' ')); } }
    });
    const { document } = context;
    document.listeners = {};
    document.addEventListener = (type, handler) => { (document.listeners[type] ||= []).push(handler); };
    document.removeEventListener = (type, handler) => { document.listeners[type] = (document.listeners[type] || []).filter(fn => fn !== handler); };
    document.contains = element => document.body.contains(element);
    document.getElementById = id => document.body.querySelectorAll('div,button,input,label').find(element => element.id === id) || null;
    document.activeElement = document.body;
    // A text field can select its text.
    document.createElement = tag => {
        const element = dom.createElement(tag);
        if (element.tagName === 'INPUT') element.select = () => { element.selected = true; };
        return element;
    };
    if (translate) context.I18n = { tText: translate };
    vm.createContext(context);
    if (keyboardHelper) vm.runInContext(read('src/utils/KeyboardNavigation.js'), context);
    vm.runInContext(read('src/utils/Dialog.js'), context);

    const opener = dom.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();

    const byId = id => document.getElementById(id);
    /**
     * One event the way the page sees it: the window's capturing listeners in the order they were
     * added (one that stops it at once ends the round), then, unless stopped, the target and its ancestors.
     */
    const dispatch = (type, key, fields = {}) => {
        const event = {
            type, key, target: fields.target || document.activeElement,
            defaultPrevented: false, stopped: false, stoppedAtOnce: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.stopped = true; },
            stopImmediatePropagation() { this.stopped = true; this.stoppedAtOnce = true; },
            ...fields
        };
        for (const entry of windowListeners.slice()) {
            if (event.stoppedAtOnce) break;
            if (entry.type === type && entry.capture) entry.handler(event);
        }
        for (let node = event.target; node && !event.stopped; node = node.parentNode) {
            for (const handler of (node.listeners?.[type] || []).slice()) handler(event);
        }
        return event;
    };
    /**
     * One key press: keydown; then, unless that was prevented, the keypress of a key that types, at
     * whatever has the focus by then (Enter on a button there is the browser's click); then keyup,
     * unless the key is still held (`repeat`). Returns the keydown, with the other two beside it.
     */
    const press = (key, fields = {}) => {
        const down = dispatch('keydown', key, fields);
        if (!down.defaultPrevented && typesACharacter(key)) {
            const keypress = dispatch('keypress', key, fields);
            down.keypress = keypress;
            const target = keypress.target;
            if (!keypress.defaultPrevented && key === 'Enter' && target.tagName === 'BUTTON' && target.isConnected) target.fire('click');
        }
        if (!fields.repeat) down.keyup = dispatch('keyup', key, fields);
        return down;
    };
    const overlays = () => document.body.querySelectorAll('div').filter(element => element.id === 'rr-themed-dialog');
    /**
     * A full click (press, then click) on the dialog's backdrop, or on its box with `inside`; `detail`
     * is the click's place in a double or triple click. Says whether the press was prevented.
     */
    const clickAt = ({ inside = false, detail = 1, release = null } = {}) => {
        const overlay = byId('rr-themed-dialog');
        const at = where => (where === 'inside' ? overlay.children[0] : overlay);
        let pressPrevented = false;
        overlay.fire('mousedown', { target: at(inside ? 'inside' : 'beside'), detail, preventDefault() { pressPrevented = true; } });
        overlay.fire('click', { target: at(release || (inside ? 'inside' : 'beside')), detail, preventDefault() {} });
        return { pressPrevented };
    };
    return {
        context, document, opener, byId, press, windowListeners, logged, overlays, clickAt,
        RRDialog: context.RRDialog,
        overlay: () => byId('rr-themed-dialog'),
        // Plain values to assert on: a failed comparison of two elements prints the whole page.
        isOpen: () => overlays().length > 0,
        focus: () => document.activeElement.id || document.activeElement.tagName,
        click: id => byId(id).fire('click'),
        text: id => byId(id).textContent
    };
}

test('confirm answers true from its action button and false from Cancel, the close button and a click beside it', async () => {
    const page = createPage();
    const { RRDialog } = page;

    let answer = RRDialog.confirm('Install into js?', { title: 'Install Reactor Runtime', ok: 'Install' });
    assert.equal(page.overlay().className, 'rr-modal-overlay rr-dialog-overlay', 'the editor\'s modal overlay, above the other modals');
    assert.equal(page.text('rr-themed-dialog-title'), 'Install Reactor Runtime');
    assert.equal(page.text('rr-themed-dialog-message'), 'Install into js?');
    assert.equal(page.text('rr-themed-dialog-ok'), 'Install');
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-primary');
    assert.equal(page.byId('rr-themed-dialog-cancel').className, 'rr-btn-secondary');
    assert.equal(page.text('rr-themed-dialog-cancel'), 'Cancel');
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(answer), true);
    assert.equal(page.isOpen(), false, 'the dialog is gone once answered');

    answer = RRDialog.confirm('Install into js?');
    assert.equal(page.text('rr-themed-dialog-title'), 'Confirm');
    page.click('rr-themed-dialog-cancel');
    assert.equal(await answerOf(answer), false);

    answer = RRDialog.confirm('Install into js?');
    page.click('rr-themed-dialog-close');
    assert.equal(await answerOf(answer), false);

    answer = RRDialog.confirm('Install into js?');
    // Pressed inside (a drag that ends on the backdrop) is not a click beside the dialog.
    const drag = page.clickAt({ inside: true, release: 'beside' });
    assert.equal(page.isOpen(), true, 'a press that began inside does not close the dialog');
    assert.equal(drag.pressPrevented, false, 'a press inside is the browser\'s: it selects the message, focuses a field');
    const beside = page.clickAt();
    assert.equal(beside.pressPrevented, true, 'a press on the backdrop takes the focus from nothing and selects nothing');
    assert.equal(await answerOf(answer), false);
});

test('the second click of a double click on what asked is not a click beside the dialog', async () => {
    const page = createPage();
    const beside = detail => page.clickAt({ detail });

    // The first click opened the notice; the second and a third land on the backdrop.
    let done = page.RRDialog.alert('Cannot delete the last page.', { title: 'Delete Event Page' });
    assert.equal(beside(2).pressPrevented, true, 'and it leaves the focus on the notice\'s button');
    assert.equal(page.isOpen(), true, 'the notice stays to be read');
    beside(3);
    assert.equal(page.isOpen(), true);
    beside(1);
    assert.equal(page.isOpen(), false, 'a click of its own closes it');
    await answerOf(done);

    const answer = page.RRDialog.confirm('Are you sure you want to delete this page?', { ok: 'Delete Page', danger: true });
    beside(2);
    assert.equal(page.isOpen(), true, 'the question is not cancelled unseen');
    // A click sequence that began on the dialog counts from then on, however fast it goes.
    page.clickAt({ inside: true });
    beside(2);
    assert.equal(await answerOf(answer), false);
});

test('alert resolves with nothing, however it is closed, and names itself by kind', async () => {
    const page = createPage();
    const { RRDialog } = page;

    let done = RRDialog.alert('Open a project first.', { title: 'Build Game' });
    assert.equal(page.text('rr-themed-dialog-title'), 'Build Game');
    assert.equal(page.byId('rr-themed-dialog-cancel') === null, true, 'a notice has one button');
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-primary');
    assert.equal(page.text('rr-themed-dialog-ok'), 'OK');
    assert.equal(page.focus(), 'rr-themed-dialog-ok');
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(done), undefined);

    done = RRDialog.alert('The file could not be saved.', { kind: 'error' });
    assert.equal(page.text('rr-themed-dialog-title'), 'Error');
    assert.match(page.overlay().children[0].className, /\brr-dialog-error\b/);
    assert.equal(page.overlay().querySelectorAll('.rr-dialog-icon').length, 1, 'an error carries the mark');
    page.press('Escape');
    assert.equal(await answerOf(done), undefined);

    done = RRDialog.alert('Careful.', { kind: 'warning' });
    assert.equal(page.text('rr-themed-dialog-title'), 'Warning');
    page.click('rr-themed-dialog-close');
    assert.equal(await answerOf(done), undefined);

    done = RRDialog.alert('Saved.');
    assert.equal(page.text('rr-themed-dialog-title'), 'Notice');
    assert.equal(page.overlay().querySelectorAll('.rr-dialog-icon').length, 0, 'a plain notice has no mark');
    page.click('rr-themed-dialog-ok');
    await answerOf(done);

    // By its parts: with no Cancel it is a notice, and a notice destroys nothing.
    const told = RRDialog.open({ title: 'Plugin Manager', message: 'Plugins saved.', danger: true, focus: 'cancel' });
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-primary');
    assert.doesNotMatch(page.overlay().children[0].className, /rr-dialog-danger/);
    assert.equal(page.focus(), 'rr-themed-dialog-ok');
    page.press('Enter');
    assert.equal(await answerOf(told), true);
});

test('prompt answers the text, null when cancelled, and stays open while validate objects', async () => {
    const page = createPage();
    const { RRDialog } = page;

    let answer = RRDialog.prompt('Name', { title: 'Rename', value: 'Hero', placeholder: 'A name', ok: 'Rename' });
    const input = page.byId('rr-themed-dialog-input');
    assert.equal(input.value, 'Hero');
    assert.equal(input.placeholder, 'A name');
    assert.equal(page.focus(), 'rr-themed-dialog-input', 'the focus starts in the field');
    assert.equal(input.selected, true, 'with its text selected, so typing replaces it');
    assert.equal(page.text('rr-themed-dialog-ok'), 'Rename');
    input.value = 'Rhea';
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(answer), 'Rhea');

    answer = RRDialog.prompt('Name');
    page.click('rr-themed-dialog-cancel');
    assert.equal(await answerOf(answer), null);

    answer = RRDialog.prompt('Name', { value: 'kept' });
    page.press('Escape');
    assert.equal(await answerOf(answer), null);

    // A click beside a prompt keeps what was typed.
    answer = RRDialog.prompt('Name', { value: 'typed' });
    assert.equal(page.clickAt().pressPrevented, true, 'and the focus stays in the field');
    assert.equal(page.isOpen(), true, 'the prompt is still open');
    page.click('rr-themed-dialog-cancel');
    await answerOf(answer);

    const seen = [];
    answer = RRDialog.prompt('Maximum', {
        value: '0',
        validate: text => { seen.push(text); return Number(text) >= 1 ? '' : 'Enter a number from 1 to 5000.'; }
    });
    page.press('Enter');
    assert.equal(page.isOpen(), true, 'an unacceptable answer keeps the prompt open');
    assert.equal(page.text('rr-themed-dialog-error'), 'Enter a number from 1 to 5000.');
    assert.equal(page.byId('rr-themed-dialog-input').getAttribute('aria-invalid'), 'true');
    page.click('rr-themed-dialog-ok');
    assert.equal(page.isOpen(), true, 'the button validates too');
    // Typing clears the message.
    page.byId('rr-themed-dialog-input').value = '40';
    page.byId('rr-themed-dialog-input').fire('input');
    assert.equal(page.text('rr-themed-dialog-error'), '');
    page.press('Enter');
    assert.equal(await answerOf(answer), '40');
    assert.deepEqual(seen, ['0', '0', '40']);
});

test('Escape cancels and nothing behind the dialog hears it', async () => {
    const page = createPage();
    const answer = page.RRDialog.confirm('Stop the import?');
    const event = page.press('Escape');
    assert.equal(await answerOf(answer), false);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true, 'the Event Editor under the dialog does not close on the same key');
    assert.equal(page.isOpen(), false);

    // With no dialog up the keys are the editor's again.
    for (const key of ['Escape', 'Enter', 's', 'F5']) {
        const later = page.press(key, { target: page.document.body });
        assert.equal(later.stopped, false, `${key} reaches the editor`);
        assert.equal(later.defaultPrevented, false, `${key} keeps its own action`);
    }

    // The Escape that brought a question up, still held, does not answer it.
    const held = page.RRDialog.confirm('Discard the changes?', { ok: 'Discard', danger: true });
    const repeat = page.press('Escape', { repeat: true });
    assert.equal(page.isOpen(), true, 'a held Escape cancels nothing');
    assert.equal(repeat.stopped, true, 'and still reaches nothing behind the dialog');
    page.press('Escape');
    assert.equal(await answerOf(held), false);
});

test('Enter confirms a plain question and cancels a destructive one', async () => {
    const page = createPage();
    const { RRDialog } = page;

    let answer = RRDialog.confirm('Rebuild the manifest?', { ok: 'Rebuild' });
    assert.equal(page.focus(), 'rr-themed-dialog-ok', 'a plain question starts on its action');
    page.press('Enter');
    assert.equal(await answerOf(answer), true);

    answer = RRDialog.confirm('Are you sure you want to delete this page?', { title: 'Delete Event Page', ok: 'Delete Page', danger: true });
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-danger', 'the destructive action wears the danger style');
    assert.equal(page.text('rr-themed-dialog-ok'), 'Delete Page');
    assert.match(page.overlay().children[0].className, /\brr-dialog-danger\b/);
    assert.equal(page.focus(), 'rr-themed-dialog-cancel', 'a destructive question starts on Cancel');
    page.press('Enter');
    assert.equal(await answerOf(answer), false, 'Enter on a destructive question cancels');

    // The action takes a deliberate move to its button (Tab is the browser's own) and Enter.
    answer = RRDialog.confirm('Delete?', { ok: 'Delete', danger: true });
    page.byId('rr-themed-dialog-ok').focus();
    page.press('Enter');
    assert.equal(await answerOf(answer), true);

    // Focus that is on no control at all: the default answer of the dialog.
    answer = RRDialog.confirm('Delete?', { ok: 'Delete', danger: true });
    page.press('Enter', { target: page.document.body });
    assert.equal(await answerOf(answer), false);
    answer = RRDialog.confirm('Rebuild?', { ok: 'Rebuild' });
    page.press('Enter', { target: page.document.body });
    assert.equal(await answerOf(answer), true);
});

test('a held Enter and an Enter that ends an input-method composition answer nothing', async () => {
    const page = createPage();
    const { RRDialog } = page;

    let answer = RRDialog.confirm('Rebuild?', { ok: 'Rebuild' });
    const held = page.press('Enter', { repeat: true });
    assert.equal(held.defaultPrevented, true, 'the browser does not click the focused button');
    assert.equal(page.isOpen(), true, 'the key that opened the dialog, still down, does not answer it');
    page.click('rr-themed-dialog-cancel');
    assert.equal(await answerOf(answer), false);

    answer = RRDialog.prompt('Name', { value: 'に' });
    const composing = page.press('Enter', { isComposing: true });
    assert.equal(composing.defaultPrevented, false);
    assert.equal(page.isOpen(), true, 'the composition keeps its Enter');
    page.press('Enter');
    assert.equal(await answerOf(answer), 'に');
});

test('every other key stays in the dialog; Tab turns round inside it', async () => {
    const page = createPage();
    const answer = page.RRDialog.confirm('Delete?', { ok: 'Delete', danger: true });
    for (const key of ['Delete', 'z', 's', 'ArrowDown', ' ']) {
        const event = page.press(key);
        assert.equal(event.stopped, true, `${key} does not reach a shortcut behind the dialog`);
        assert.equal(event.defaultPrevented, false, `${key} keeps its own action inside the dialog`);
    }

    const ids = () => page.document.activeElement.id;
    assert.equal(ids(), 'rr-themed-dialog-cancel');
    // Cancel -> action (the browser's own move, emulated) -> wraps to the close button -> Cancel.
    page.byId('rr-themed-dialog-ok').focus();
    page.press('Tab');
    assert.equal(ids(), 'rr-themed-dialog-close', 'Tab from the last control wraps to the first');
    page.press('Tab', { shiftKey: true });
    assert.equal(ids(), 'rr-themed-dialog-ok', 'Shift+Tab from the first control wraps to the last');
    page.click('rr-themed-dialog-cancel');
    await answerOf(answer);
});

test('the application\'s shortcuts wait for the answer: nothing else on the window hears a key first', async () => {
    const page = createPage();
    // The editor's shortcut handler: on the window, capturing, added after the dialog's file loaded.
    const heard = [];
    page.context.addEventListener('keydown', event => { heard.push(event.key); }, true);

    const answer = page.RRDialog.confirm('Delete?', { ok: 'Delete', danger: true });
    const reload = page.press('F5');
    assert.equal(reload.stopped, true, 'Reload is not asked from under the question');
    assert.equal(reload.defaultPrevented, true, 'and the browser does not reload the page in its place');
    for (const key of ['s', 'n', 'o', 'r', 'S']) {
        const shortcut = page.press(key, { ctrlKey: true });
        assert.equal(shortcut.defaultPrevented, true, `Ctrl+${key}: the browser does not act in the editor's place`);
    }
    assert.equal(page.press('s', { metaKey: true }).defaultPrevented, true);
    assert.equal(page.press('c', { ctrlKey: true }).defaultPrevented, false, 'copying the message still works');
    assert.equal(page.press('F2').defaultPrevented, false);
    assert.deepEqual(heard, [], 'Reload, Save, New, Open and Playtest heard nothing');
    assert.equal(page.focus(), 'rr-themed-dialog-cancel', 'the focus stayed in the dialog');
    assert.equal(page.isOpen(), true);

    // Full screen and the developer tools stay available.
    for (const key of ['F11', 'F12']) assert.equal(page.press(key).stopped, false, key);
    assert.deepEqual(heard, ['F11', 'F12']);

    page.click('rr-themed-dialog-cancel');
    await answerOf(answer);
    page.press('F5');
    assert.deepEqual(heard, ['F11', 'F12', 'F5'], 'answered: the keys are the editor\'s again');
});

test('the key press that asked for the dialog does not answer it', async () => {
    const page = createPage();
    let pending = null;
    let ask = () => { pending = page.RRDialog.confirm('Search from the top?', { ok: 'Search' }); };
    // A control whose Enter asks without claiming the key: the dialog has the focus before the press is over.
    page.opener.addEventListener('keydown', event => { if (event.key === 'Enter') ask(); });

    let down = page.press('Enter');
    assert.equal(page.isOpen(), true, 'the question is still up after the key that asked');
    assert.equal(page.focus(), 'rr-themed-dialog-ok');
    assert.equal(down.keypress.defaultPrevented, true, 'the rest of that press clicks nothing');
    assert.equal(down.keyup.stopped, false, 'its release reaches whatever saw it go down');
    page.press('Enter');
    assert.equal(await answerOf(pending), true, 'a press of its own answers');
    assert.equal(page.focus(), 'opener');

    ask = () => { pending = page.RRDialog.alert('No events found.').then(() => 'read'); };
    page.press('Enter');
    assert.equal(page.isOpen(), true, 'a notice asked the same way can be read');
    page.press('Enter');
    assert.equal(await answerOf(pending), 'read');

    // The letter that asked is not typed over the field of a prompt.
    page.opener.addEventListener('keydown', event => { if (event.key === 'n') pending = page.RRDialog.prompt('Name', { value: 'Hero' }); });
    down = page.press('n');
    assert.equal(page.focus(), 'rr-themed-dialog-input');
    assert.equal(down.keypress.defaultPrevented, true);
    assert.equal(page.press('x').keypress.defaultPrevented, false, 'the next key types');
    page.press('Enter');
    assert.equal(await answerOf(pending), 'Hero');

    // Asked with the mouse: the first key press is already an answer.
    pending = page.RRDialog.confirm('Rebuild?', { ok: 'Rebuild' });
    page.press('Enter');
    assert.equal(await answerOf(pending), true);
});

test('a dialog that cannot be shown answers no and leaves nothing behind', async () => {
    // The page refuses the overlay.
    let page = createPage();
    const append = page.document.body.appendChild.bind(page.document.body);
    let refuse = true;
    page.document.body.appendChild = node => {
        if (refuse && node.id === 'rr-themed-dialog') { refuse = false; throw new Error('cannot append'); }
        return append(node);
    };
    assert.equal(await answerOf(page.RRDialog.confirm('Delete?', { ok: 'Delete', danger: true })), false);
    assert.equal(page.logged.length, 1, 'the failure is reported');
    assert.equal(page.isOpen(), false);
    assert.equal(page.RRDialog.busy, false);
    assert.equal(page.press('s', { ctrlKey: true }).stopped, false, 'the keys are not left dead');
    assert.equal(page.focus(), 'opener');
    const next = page.RRDialog.confirm('Again?');
    assert.equal(page.overlays().length, 1, 'the next one shows');
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(next), true);

    // The keyboard helper fails once the overlay is in the page.
    page = createPage();
    const modal = page.context.RRKeyboardNavigation.modal;
    let fail = true;
    page.context.RRKeyboardNavigation.modal = (...args) => {
        if (fail) { fail = false; throw new Error('helper broke'); }
        return modal(...args);
    };
    assert.equal(await answerOf(page.RRDialog.prompt('Name')), null);
    assert.equal(page.isOpen(), false, 'an answered dialog does not stay on screen');
    assert.equal(page.press('Enter', { target: page.document.body }).stopped, false);
    const second = page.RRDialog.alert('Second');
    assert.equal(page.overlays().length, 1, 'one dialog, not two with the same id');
    page.click('rr-themed-dialog-ok');
    await answerOf(second);
    assert.equal(page.isOpen(), false);
});

test('the keyboard trap leaves with the dialog', async () => {
    const page = createPage();
    const answer = page.RRDialog.confirm('Leave?');
    const overlay = page.overlay();
    assert.equal(typeof overlay._rrModalKeys, 'object', 'the keyboard helper holds the dialog while it is up');
    assert.equal(page.document.listeners.keydown.length, 1);
    page.click('rr-themed-dialog-ok');
    await answerOf(answer);
    assert.equal(overlay._rrModalKeys === undefined, true, 'and lets go of it');
    assert.equal(page.document.listeners.keydown.length, 0, 'with its listener for keys that reach no control');
    assert.equal(overlay.isConnected, false);
});

test('two dialogs asked for at once take turns and each gets its own answer', async () => {
    const page = createPage();
    const { RRDialog } = page;
    const order = [];
    const first = RRDialog.confirm('First?', { title: 'One' }).then(value => { order.push(['first', value]); return value; });
    const second = RRDialog.prompt('Second', { title: 'Two', value: 'b' }).then(value => { order.push(['second', value]); return value; });
    const third = RRDialog.alert('Third', { title: 'Three' }).then(() => { order.push(['third']); });

    assert.equal(RRDialog.busy, true);
    assert.equal(page.overlays().length, 1, 'only one is on screen');
    assert.equal(page.text('rr-themed-dialog-title'), 'One');
    page.click('rr-themed-dialog-cancel');
    assert.equal(page.overlays().length, 1);
    assert.equal(page.text('rr-themed-dialog-title'), 'Two', 'the second shows when the first is answered');
    page.click('rr-themed-dialog-ok');
    assert.equal(page.text('rr-themed-dialog-title'), 'Three');
    page.click('rr-themed-dialog-ok');
    assert.equal(page.overlays().length, 0);

    assert.equal(await answerOf(first), false);
    assert.equal(await answerOf(second), 'b');
    await answerOf(third);
    assert.deepEqual(order, [['first', false], ['second', 'b'], ['third']]);
    assert.equal(RRDialog.busy, false);
    assert.equal(page.focus(), 'opener', 'after the last one the focus is back where it was');
});

test('the focus goes back to what had it, with or without the keyboard helper', async () => {
    for (const keyboardHelper of [true, false]) {
        const page = createPage({ keyboardHelper });
        const answer = page.RRDialog.confirm('Leave?');
        assert.equal(page.focus(), 'rr-themed-dialog-ok', 'the focus is inside the dialog');
        page.click('rr-themed-dialog-ok');
        await answerOf(answer);
        assert.equal(page.focus(), 'opener', `keyboard helper ${keyboardHelper ? 'loaded' : 'absent'}`);
    }
});

test('the dialog words its own defaults through the editor\'s translations', async () => {
    const page = createPage({ translate: text => ({ OK: 'OK', Cancel: 'キャンセル', Confirm: '確認', Close: '閉じる' }[text] || text) });
    const answer = page.RRDialog.confirm('削除しますか？');
    assert.equal(page.text('rr-themed-dialog-title'), '確認');
    assert.equal(page.text('rr-themed-dialog-cancel'), 'キャンセル');
    page.click('rr-themed-dialog-cancel');
    await answerOf(answer);
});

test('a question asked from a native modal <dialog> is put inside it', async () => {
    const page = createPage();
    // showModal() puts the element above every z-index and makes the rest of the page inert.
    const native = dom.createElement('dialog');
    native.setAttribute('open', '');
    native.matches = selector => selector === ':modal';
    page.document.body.appendChild(native);
    const closed = dom.createElement('dialog');
    closed.matches = () => false;
    page.document.body.appendChild(closed);

    let answer = page.RRDialog.confirm('Rename the node?');
    assert.equal(page.overlay().parentNode.tagName, 'DIALOG', 'inside the open modal dialog, where it can be seen and clicked');
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(answer), true);

    native.matches = () => false;       // open, but not modal: an ordinary element
    answer = page.RRDialog.confirm('Rename the node?');
    assert.equal(page.overlay().parentNode.tagName, 'BODY');
    page.click('rr-themed-dialog-cancel');
    await answerOf(answer);
});

test('UIManager\'s alert and confirm are the same dialog', async () => {
    const page = createPage();
    page.context.nw = undefined;
    const UIManager = vm.runInContext(`${read('src/UIManager.js')}\nUIManager;`, page.context);
    const manager = new UIManager({});
    for (const name of ['openThemedDialog', 'showAlert', 'showConfirm']) {
        assert.doesNotMatch(String(UIManager.prototype[name]), /createElement/, `${name} builds no dialog of its own`);
    }

    const alertDone = manager.showAlert('Install Reactor Runtime', 'Open a project first.');
    assert.equal(page.overlay().className, 'rr-modal-overlay rr-dialog-overlay');
    assert.equal(page.text('rr-themed-dialog-title'), 'Install Reactor Runtime');
    assert.equal(page.text('rr-themed-dialog-message'), 'Open a project first.');
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-primary');
    assert.equal(page.byId('rr-themed-dialog-cancel') === null, true);
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(alertDone), true);
    assert.equal(page.isOpen(), false);

    const dismissed = manager.showAlert('Install Reactor Runtime', 'Open a project first.');
    page.press('Escape');
    assert.equal(await answerOf(dismissed), true, 'a notice resolves true however it is closed');

    const confirmDone = manager.showConfirm('Install Reactor Runtime', 'Install into js?', 'Install', 'Cancel');
    assert.equal(page.text('rr-themed-dialog-ok'), 'Install');
    assert.equal(page.byId('rr-themed-dialog-cancel').className, 'rr-btn-secondary');
    page.click('rr-themed-dialog-cancel');
    assert.equal(await answerOf(confirmDone), false);

    const acceptDone = manager.showConfirm('Plugin Manifest', 'Rebuild?', 'Rebuild', 'Keep Current');
    assert.equal(page.text('rr-themed-dialog-cancel'), 'Keep Current');
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(acceptDone), true);

    const escapeDone = manager.showConfirm('Install Reactor Runtime', 'Install?', 'Install', 'Cancel');
    page.press('Escape');
    assert.equal(await answerOf(escapeDone), false);

    const dangerDone = manager.showConfirm('Delete Resource', 'Delete hero.png?', 'Delete', 'Cancel', { danger: true });
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-danger');
    assert.equal(page.focus(), 'rr-themed-dialog-cancel');
    page.click('rr-themed-dialog-ok');
    assert.equal(await answerOf(dangerDone), true);
});

test('a question asked through UIManager starts on Cancel, so a stray Enter answers no', async () => {
    const page = createPage();
    page.context.nw = undefined;
    const UIManager = vm.runInContext(`${read('src/UIManager.js')}\nUIManager;`, page.context);
    const manager = new UIManager({});

    // The Database's Discard Changes, Install Reactor Runtime, Replace resource: none says danger.
    let answer = manager.showConfirm('Discard Changes', 'Discard the unsaved database changes?', 'Discard', 'Cancel');
    assert.equal(page.focus(), 'rr-themed-dialog-cancel', 'the focus starts on Cancel');
    assert.equal(page.byId('rr-themed-dialog-ok').className, 'rr-button-primary', 'without the danger style it was not asked for');
    page.press('Enter');
    assert.equal(await answerOf(answer), false, 'Enter keeps the changes');

    // Enter with the focus on no control at all.
    answer = manager.showConfirm('Discard Changes', 'Discard?', 'Discard', 'Cancel');
    page.press('Enter', { target: page.document.body });
    assert.equal(await answerOf(answer), false);

    // Escape, Tab, Enter: the keyboard's way to the action (Tab is the browser's own move from Cancel).
    answer = manager.showConfirm('Discard Changes', 'Discard?', 'Discard', 'Cancel');
    page.byId('rr-themed-dialog-ok').focus();
    page.press('Enter');
    assert.equal(await answerOf(answer), true);

    answer = manager.openThemedDialog({ title: 'Plugin Manifest', message: 'Rebuild?', okLabel: 'Rebuild', cancelLabel: 'Keep Current' });
    assert.equal(page.focus(), 'rr-themed-dialog-cancel');
    page.click('rr-themed-dialog-cancel');
    assert.equal(await answerOf(answer), false);

    // A caller that wants Enter to accept says so.
    answer = manager.showConfirm('Install Reactor Runtime', 'Install into js?', 'Install', 'Cancel', { focus: 'ok' });
    assert.equal(page.focus(), 'rr-themed-dialog-ok');
    page.press('Enter');
    assert.equal(await answerOf(answer), true);

    // A notice has no Cancel to start on.
    const told = manager.showAlert('Install Reactor Runtime', 'Open a project first.');
    assert.equal(page.focus(), 'rr-themed-dialog-ok');
    page.press('Enter');
    assert.equal(await answerOf(told), true);
});

// ---------------------------------------------------------------------------
// The reported case: an event's Delete Page and Clear Page
// ---------------------------------------------------------------------------

function loadEventEditor(answers) {
    const asked = [];
    const RRDialog = {
        confirm: async (message, options) => { asked.push({ type: 'confirm', message, options }); return answers.shift(); },
        alert: async (message, options) => { asked.push({ type: 'alert', message, options }); }
    };
    const EventEditor = vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        document: { querySelector() { return {}; } },
        RRDialog
    });
    const editor = Object.create(EventEditor.prototype);
    editor.currentEvent = { pages: [{ list: [{ code: 101 }], marker: 'one' }, { list: [{ code: 102 }], marker: 'two' }] };
    editor.pendingModels = ['model one', 'model two'];
    editor.currentPageIndex = 1;
    editor.renders = 0;
    editor.renderCurrentPage = () => { editor.renders++; };
    editor.showEventEditor = () => { editor.renders++; };
    return { editor, asked };
}

test('Delete Page asks through the themed dialog and deletes only on its button', async () => {
    let { editor, asked } = loadEventEditor([false]);
    await editor.deleteCurrentPage();
    assert.equal(asked.length, 1);
    assert.equal(asked[0].type, 'confirm');
    assert.equal(asked[0].message, 'event.deletePageConfirm');
    assert.equal(asked[0].options.title, 'event.deletePage');
    assert.equal(asked[0].options.ok, 'Delete Page', 'the button says what it does');
    assert.equal(asked[0].options.danger, true);
    assert.equal(editor.currentEvent.pages.length, 2, 'Cancel deletes nothing');
    assert.equal(editor.renders, 0);

    ({ editor, asked } = loadEventEditor([true]));
    await editor.deleteCurrentPage();
    assert.deepEqual(editor.currentEvent.pages.map(page => page.marker), ['one']);
    assert.deepEqual(editor.pendingModels, ['model one']);
    assert.equal(editor.currentPageIndex, 0);
    assert.equal(editor.renders, 1);

    // The last page: a notice, never a question.
    await editor.deleteCurrentPage();
    assert.equal(asked.at(-1).type, 'alert');
    assert.equal(asked.at(-1).message, 'event.cannotDeleteLastPage');
    assert.equal(editor.currentEvent.pages.length, 1);
});

test('Clear Page asks through the themed dialog and clears only on its button', async () => {
    let { editor, asked } = loadEventEditor([false]);
    await editor.clearCurrentPage();
    assert.equal(asked[0].message, 'event.clearPageConfirm');
    assert.equal(asked[0].options.title, 'event.clearPage');
    assert.equal(asked[0].options.ok, 'Clear Page');
    assert.equal(asked[0].options.danger, true);
    assert.equal(editor.currentEvent.pages[1].marker, 'two', 'Cancel clears nothing');
    assert.equal(editor.renders, 0);

    ({ editor, asked } = loadEventEditor([true]));
    await editor.clearCurrentPage();
    assert.equal(editor.currentEvent.pages.length, 2);
    assert.equal(editor.currentEvent.pages[1].marker, undefined, 'the page is a default page again');
    assert.equal(editor.currentEvent.pages[0].marker, 'one', 'the other page is untouched');
    assert.equal(editor.pendingModels[1], null);
    assert.equal(editor.renders, 1);
});

test('a page question answered after the editor moved on changes nothing', async () => {
    for (const ask of ['deleteCurrentPage', 'clearCurrentPage']) {
        let release;
        const answer = new Promise(resolve => { release = resolve; });
        const EventEditor = vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, {
            console: { log() {}, debug() {}, warn() {}, error() {} },
            document: { querySelector() { return null; } },
            RRDialog: { confirm: () => answer, alert: async () => {} }
        });
        const late = Object.create(EventEditor.prototype);
        late.currentEvent = { pages: [{ marker: 'one' }, { marker: 'two' }] };
        late.pendingModels = ['model one', 'model two'];
        late.currentPageIndex = 1;
        late.showEventEditor = () => {};
        late.renderCurrentPage = () => {};
        const pending = late[ask]();
        late.currentPageIndex = 0;          // another page came into view while the question was up
        release(true);
        await pending;
        assert.deepEqual(late.currentEvent.pages.map(page => page.marker), ['one', 'two'], ask);
        assert.deepEqual(late.pendingModels, ['model one', 'model two'], ask);
    }
});

// ---------------------------------------------------------------------------
// Converted call sites: what each does on yes and on no
// ---------------------------------------------------------------------------

/** A class file run with a stand-in RRDialog that answers from a list and records what it was asked. */
function loadWithDialog(relative, className, answers, extra = {}) {
    const asked = [];
    const RRDialog = {
        confirm: async (message, options) => { asked.push({ type: 'confirm', message, options }); return answers.shift(); },
        alert: async (message, options) => { asked.push({ type: 'alert', message, options }); },
        prompt: async (message, options) => { asked.push({ type: 'prompt', message, options }); return answers.shift(); }
    };
    const Class = vm.runInNewContext(`${read(relative)}\n${className};`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, RRDialog, ...extra
    });
    return { Class, asked };
}

test('Set Maximum asks in a prompt that refuses a number out of range, and changes nothing when cancelled', async () => {
    const make = answers => {
        const { Class, asked } = loadWithDialog('src/event/SwitchVariablePicker.js', 'SwitchVariablePicker', answers);
        const picker = Object.create(Class.prototype);
        picker.type = 'switch';
        picker.modal = {};
        picker.databaseManager = { getSystem: () => ({ switches: new Array(21).fill('') }) };
        picker.set = [];
        picker.setMaxCount = count => { picker.set.push(count); };
        return { picker, asked };
    };

    let { picker, asked } = make(['40']);
    await picker.showSetMaxDialog();
    assert.equal(asked[0].type, 'prompt');
    assert.equal(asked[0].message, 'Maximum number of switches', 'one phrase, so every language words it whole');
    assert.equal(asked[0].options.title, 'Set Maximum', 'the words of the button that asks');
    assert.equal(asked[0].options.value, '20', 'the field starts on the current maximum');
    assert.equal(asked[0].options.validate('abc'), 'Please enter a valid number between 1 and 5000.');
    assert.equal(asked[0].options.validate('0'), 'Please enter a valid number between 1 and 5000.');
    assert.equal(asked[0].options.validate('5001'), 'Please enter a valid number between 1 and 5000.');
    assert.equal(asked[0].options.validate('5000'), '');
    assert.deepEqual(picker.set, [40]);

    ({ picker, asked } = make([null]));
    picker.type = 'variable';
    picker.databaseManager = { getSystem: () => ({ variables: new Array(51).fill('') }) };
    await picker.showSetMaxDialog();
    assert.equal(asked[0].message, 'Maximum number of variables');
    assert.equal(asked[0].options.value, '50');
    assert.deepEqual(picker.set, [], 'cancelled: the maximum stays');

    // The picker was closed and opened again while the prompt was up.
    ({ picker, asked } = make(['40']));
    const pending = picker.showSetMaxDialog();
    picker.modal = {};
    await pending;
    assert.deepEqual(picker.set, []);
});

test('Remove Plugin is a danger question and removes only on its button', async () => {
    const make = answers => {
        const { Class, asked } = loadWithDialog('src/PluginManager.js', 'PluginManager', answers, {
            require, nw: {},
            RRPluginAnnotations: require(path.join(srcRoot, 'utils', 'PluginAnnotations.js')),
            RRPluginParamCodec: require(path.join(srcRoot, 'utils', 'PluginParamCodec.js'))
        });
        const manager = Object.create(Class.prototype);
        manager.plugins = [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }];
        manager.getSelectedPluginIndices = () => [1];
        manager.clearPluginSelection = () => {};
        manager.renderPluginList = () => {};
        manager.renderEmptyDetails = () => {};
        return { manager, asked };
    };

    let { manager, asked } = make([false]);
    await manager._removeSelectedPlugins();
    assert.equal(asked[0].message, 'Remove plugin "Beta"?');
    assert.equal(asked[0].options.title, 'Remove Plugin');
    assert.equal(asked[0].options.ok, 'Remove');
    assert.equal(asked[0].options.danger, true);
    assert.deepEqual(manager.plugins.map(plugin => plugin.name), ['Alpha', 'Beta', 'Gamma']);

    ({ manager, asked } = make([true]));
    await manager._removeSelectedPlugins();
    assert.deepEqual(manager.plugins.map(plugin => plugin.name), ['Alpha', 'Gamma']);

    // The list changed under the question: the plugin it named is no longer at that place.
    ({ manager, asked } = make([true]));
    const pending = manager._removeSelectedPlugins();
    manager.plugins.unshift({ name: 'Inserted' });
    await pending;
    assert.deepEqual(manager.plugins.map(plugin => plugin.name), ['Inserted', 'Alpha', 'Beta', 'Gamma']);
});

test('closing Deploy Game during a build asks first; Keep Building leaves it running', async () => {
    const make = answers => {
        const { Class, asked } = loadWithDialog('src/BuildManager.js', 'BuildManager', answers);
        const manager = Object.create(Class.prototype);
        manager.isBuilding = true;
        manager.cancelled = 0;
        manager.cancelBuild = () => { manager.cancelled++; manager.isBuilding = false; };
        manager.versionPicker = { close() {} };
        manager.modal = { style: { display: 'flex' } };
        return { manager, asked };
    };

    let { manager, asked } = make([false]);
    await manager.close();
    assert.equal(asked[0].options.title, 'Deploy Game');
    assert.equal(asked[0].options.ok, 'Cancel Build', 'the button says what closing does');
    assert.equal(asked[0].options.cancel, 'Keep Building');
    assert.equal(asked[0].options.danger, true);
    assert.equal(manager.cancelled, 0);
    assert.equal(manager.modal.style.display, 'flex');

    ({ manager, asked } = make([true]));
    await manager.close();
    assert.equal(manager.cancelled, 1);
    assert.equal(manager.modal.style.display, 'none');

    // The build finished while the question was up: nothing is left to cancel, the window still closes.
    ({ manager, asked } = make([true]));
    const pending = manager.close();
    manager.isBuilding = false;
    await pending;
    assert.equal(manager.cancelled, 0);
    assert.equal(manager.modal.style.display, 'none');

    // No build running: no question.
    ({ manager, asked } = make([]));
    manager.isBuilding = false;
    await manager.close();
    assert.equal(asked.length, 0);
    assert.equal(manager.modal.style.display, 'none');
});

test('a music starter replaces a list only after the themed question says yes', async () => {
    const make = answers => {
        const asked = [];
        const context = {
            console, module: undefined,
            RRDialog: { confirm: async (message, options) => { asked.push({ message, options }); return answers.shift(); } }
        };
        context.globalThis = context;
        vm.runInNewContext(`${read('src/utils/BgmSequenceEditor.js')}\n;globalThis.__E = RRBgmSequenceEditor;`, context);
        const edits = [];
        const editor = new context.__E({
            container: { innerHTML: '', addEventListener() {}, contains: () => true },
            tt: text => text, t: () => 'levels', listTracks: () => ['Town', 'Field'], onEdit: value => edits.push(value)
        });
        editor.load({ enabled: true, entries: [{ type: 'track', name: 'Town' }] });
        return { editor, asked, edits };
    };

    let { editor, asked, edits } = make([false]);
    assert.equal(await editor.applyStarter('playlist'), false);
    assert.equal(asked[0].message, 'Replace the entries in this list with the starter?');
    assert.equal(asked[0].options.ok, 'Replace');
    assert.equal(asked[0].options.danger, true);
    assert.equal(editor.value().entries[0].type, 'track', 'declined: the list is kept');
    assert.equal(edits.length, 0);

    ({ editor, asked, edits } = make([true]));
    assert.equal(await editor.applyStarter('playlist'), true);
    assert.equal(editor.value().entries[0].type, 'palette');
    assert.equal(edits.length, 1);

    // Another sequence was loaded while the question was up: the answer is not for it.
    ({ editor, asked, edits } = make([true]));
    const pending = editor.applyStarter('playlist');
    editor.load({ enabled: true, entries: [{ type: 'track', name: 'Field' }] });
    assert.equal(await pending, false);
    assert.equal(editor.value().entries[0].name, 'Field');
});

test('closing Deploy Editor during a build asks first; Keep Building leaves it running', async () => {
    const make = answers => {
        const { Class, asked } = loadWithDialog('src/DistEditorManager.js', 'DistEditorManager', answers);
        const manager = Object.create(Class.prototype);
        manager.isBuilding = true;
        manager.cancelled = 0;
        manager.cancelBuild = () => { manager.cancelled++; manager.isBuilding = false; };
        manager.versionPicker = { close() {} };
        manager.modal = { style: { display: 'flex' } };
        return { manager, asked };
    };

    let { manager, asked } = make([false]);
    await manager.close();
    assert.equal(asked[0].options.title, 'Deploy Editor');
    assert.equal(asked[0].options.ok, 'Cancel Build');
    assert.equal(asked[0].options.cancel, 'Keep Building');
    assert.equal(asked[0].options.danger, true);
    assert.equal(manager.cancelled, 0);
    assert.equal(manager.modal.style.display, 'flex');

    ({ manager, asked } = make([true]));
    await manager.close();
    assert.equal(manager.cancelled, 1);
    assert.equal(manager.modal.style.display, 'none');
});

test('leaving the Structure workshop with unsaved work asks first, and leaves only on Discard Changes', async () => {
    const make = (answers, dirty = true) => {
        const { Class, asked } = loadWithDialog('src/StructureWorkshop.js', 'StructureWorkshop', answers, {
            document: { querySelector() { return null; } }, setTimeout() {}
        });
        const workshop = Object.create(Class.prototype);
        workshop.session = { barWasUp: true, was3D: true, returnTo: 3, structureId: 1 };
        workshop.ended = 0;
        workshop.loaded = [];
        workshop.tilemap = () => ({ isMapDirty: () => dirty, currentMap: {} });
        workshop.reactor = () => ({});
        workshop._t = text => text;
        workshop.end = () => { workshop.ended++; workshop.session = null; };
        workshop.projectController = { loadMap: async id => { workshop.loaded.push(id); return true; } };
        return { workshop, asked };
    };

    let { workshop, asked } = make([false]);
    await workshop.close();
    assert.equal(asked[0].message, 'Leave the workshop without saving?');
    assert.equal(asked[0].options.title, 'Unsaved Changes');
    assert.equal(asked[0].options.ok, 'Discard Changes');
    assert.equal(asked[0].options.danger, true);
    assert.equal(workshop.ended, 0, 'Cancel stays in the workshop');
    assert.deepEqual(workshop.loaded, []);

    ({ workshop, asked } = make([true]));
    await workshop.close();
    assert.equal(workshop.ended, 1);
    assert.deepEqual(workshop.loaded, [3], 'the map it came from is back');

    // Left another way while the question was up.
    ({ workshop, asked } = make([true]));
    const pending = workshop.close();
    workshop.session = null;
    await pending;
    assert.equal(workshop.ended, 0);
    assert.deepEqual(workshop.loaded, []);

    // Nothing unsaved: no question.
    ({ workshop, asked } = make([], false));
    await workshop.close();
    assert.equal(asked.length, 0);
    assert.equal(workshop.ended, 1);
});

test('the Resource Manager deletes only on Delete, asked as a danger question', async () => {
    const ResourceManager = require(path.join(srcRoot, 'ResourceManager.js'));
    const deleteRecord = ResourceManager.deleteRecord;
    const deleted = [];
    ResourceManager.deleteRecord = options => { deleted.push(options.record.relativePath); };
    try {
        const make = answer => {
            const asked = [];
            const manager = Object.create(ResourceManager.prototype);
            const record = { relativePath: 'img/pictures/hero.png' };
            Object.assign(manager, {
                selected: record, records: [record], folder: { id: 'pictures' }, deleteButton: { disabled: false },
                projectController: { captureProjectOwnership: () => ({ projectPath: '/project' }), verifyProjectOwnership() {} },
                uiManager: { showConfirm: async (...args) => { asked.push(args); return answer; } },
                text: (value, params) => value.replace('{path}', params?.path ?? ''),
                refresh() {}, status: [], setStatus(message, failed) { this.status.push([message, !!failed]); }
            });
            return { manager, asked };
        };

        let { manager, asked } = make(false);
        await manager.deleteSelected();
        assert.equal(asked[0][0], 'Delete resource?');
        assert.match(asked[0][1], /img\/pictures\/hero\.png will be removed permanently/);
        assert.equal(asked[0][2], 'Delete', 'the button says what it does');
        assert.equal(asked[0][4]?.danger, true, 'in the danger style');
        assert.deepEqual(deleted, [], 'Cancel deletes nothing');

        ({ manager, asked } = make(true));
        await manager.deleteSelected();
        assert.deepEqual(deleted, ['img/pictures/hero.png']);
        assert.deepEqual(manager.status, [['Deleted img/pictures/hero.png.', false]]);

        // Replace on export is a danger question too.
        ({ manager, asked } = make(true));
        manager.countText = (count, one, many, params) => (count === 1 ? one : many).replace('{examples}', params.examples);
        await manager.confirmReplaceExports(['a.png']);
        assert.equal(asked[0][2], 'Replace');
        assert.equal(asked[0][4]?.danger, true);
    } finally {
        ResourceManager.deleteRecord = deleteRecord;
    }
});

test('importing over a resource of the same name replaces it only on Replace, asked as a danger question', async () => {
    const make = answer => {
        const inputs = [];
        const document = {
            body: dom.createElement('body'),
            createElement(tag) { const element = dom.createElement(tag); inputs.push(element); return element; }
        };
        const { Class } = loadWithDialog('src/ResourceManager.js', 'ResourceManager', [], { document, window: {}, module: undefined });
        const asked = [], imports = [];
        Class.importBytes = options => {
            imports.push(options.replaceRecords ? 'replace' : 'import');
            return options.replaceRecords ? {} : { collision: true, existing: [{ physicalRelativePath: 'img/pictures/Hero.png' }] };
        };
        const manager = Object.create(Class.prototype);
        Object.assign(manager, {
            importButton: { disabled: false }, operationGeneration: 0, folder: { id: 'pictures', extensions: ['.png'] },
            destination: { value: '' }, path: require('node:path'),
            projectController: { captureProjectOwnership: () => ({ projectPath: '/project' }), verifyProjectOwnership() {} },
            uiManager: { showConfirm: async (...args) => { asked.push(args); return answer; } },
            project: () => ({}), refresh() {}, text: value => value, countText: (count, one) => one,
            status: [], setStatus(message, failed) { this.status.push([message, !!failed]); },
            readImportFile: () => Buffer.alloc(0)
        });
        manager.importFiles();
        const input = inputs.find(element => element.tagName === 'INPUT');
        input.files = [{ name: 'hero.png', path: '/downloads/hero.png' }];
        return { manager, asked, imports, choose: () => Promise.all((input.listeners.change || []).map(handler => handler({ target: input }))) };
    };

    let { asked, imports, choose } = make(false);
    await choose();
    assert.equal(asked[0][0], 'Replace resource?');
    assert.equal(asked[0][2], 'Replace');
    assert.equal(asked[0][4]?.danger, true);
    assert.deepEqual(imports, ['import'], 'Cancel leaves the existing resource');

    ({ asked, imports, choose } = make(true));
    await choose();
    assert.deepEqual(imports, ['import', 'replace']);
});

test('importing a 3D model asks for its folder name in a prompt, and Cancel imports nothing', async () => {
    const make = answers => {
        const inputs = [];
        const document = {
            body: dom.createElement('body'),
            createElement(tag) { const element = dom.createElement(tag); inputs.push(element); return element; }
        };
        const { Class, asked } = loadWithDialog('src/ResourceManager.js', 'ResourceManager', answers, { document, window: {}, module: undefined });
        const manager = Object.create(Class.prototype);
        Object.assign(manager, {
            importButton: { disabled: false }, operationGeneration: 0, folder: { id: 'models', extensions: ['.glb'] },
            destination: { value: '' }, path: require('node:path'), read: [],
            projectController: { captureProjectOwnership: () => ({ projectPath: '/project' }), verifyProjectOwnership() {}, mapEditor3D: { ensureLibraries: async () => false, lastError: 'no 3D here' } },
            text: value => value, status: [], setStatus(message, failed) { this.status.push([message, !!failed]); },
            readImportFile(file) { this.read.push(file); return Buffer.alloc(0); }
        });
        manager.importFiles();
        const input = inputs.find(element => element.tagName === 'INPUT');
        input.files = [{ name: 'Knight.glb', path: '/downloads/Knight.glb' }];
        return { manager, asked, choose: () => Promise.all((input.listeners.change || []).map(handler => handler({ target: input }))) };
    };

    let { manager, asked, choose } = make([null]);
    await choose();
    assert.equal(asked[0].type, 'prompt');
    assert.equal(asked[0].message, 'Model folder name:');
    assert.equal(asked[0].options.title, 'Import 3D Model');
    assert.equal(asked[0].options.value, 'Knight', 'the file\'s own name to start from');
    assert.equal(asked[0].options.ok, 'Import');
    assert.deepEqual(manager.read, [], 'cancelled: the file is not even read');
    assert.deepEqual(manager.status, []);

    ({ manager, asked, choose } = make(['Knight']));
    await choose();
    assert.deepEqual(manager.read, ['/downloads/Knight.glb'], 'named: the import goes on');

    // Another operation began while the prompt was up: the name is for an import that is over.
    ({ manager, asked, choose } = make(['Knight']));
    const pending = choose();
    manager.operationGeneration++;
    await pending;
    assert.deepEqual(manager.read, []);
});

/** The Plugin Manager on the mini DOM, for the two places an array element is deleted from. */
function loadPluginManager(answers) {
    const context = dom.createContext();
    const { Class, asked } = loadWithDialog('src/PluginManager.js', 'PluginManager', answers, {
        require, nw: {}, document: context.document, window: context,
        RRPluginAnnotations: require(path.join(srcRoot, 'utils', 'PluginAnnotations.js')),
        RRPluginParamCodec: require(path.join(srcRoot, 'utils', 'PluginParamCodec.js'))
    });
    const manager = Object.create(Class.prototype);
    return { manager, asked, document: context.document };
}
const buttonsNamed = (root, label) => root.querySelectorAll('button').filter(button => button.textContent === label);

test('an array element of a plugin parameter is deleted only on Delete, from its row and from its editor', async () => {
    // The row's × in the table.
    const table = async (answers, during = () => {}) => {
        const { manager, asked, document } = loadPluginManager(answers);
        const list = ['alpha', 'beta', 'gamma'];
        const container = dom.createElement('div');
        document.body.appendChild(container);
        manager.renderArrayStructureEditor(container, list, { type: 'text[]' });
        const pending = Promise.all((buttonsNamed(container, '×')[1].listeners.click || []).map(handler => handler({})));
        during(list);
        await pending;
        return { list, asked };
    };
    let { list, asked } = await table([false]);
    assert.equal(asked[0].message, 'Delete this element?');
    assert.equal(asked[0].options.title, 'Delete Element');
    assert.equal(asked[0].options.ok, 'Delete');
    assert.equal(asked[0].options.danger, true);
    assert.deepEqual(list, ['alpha', 'beta', 'gamma'], 'Cancel deletes nothing');
    ({ list } = await table([true]));
    assert.deepEqual(list, ['alpha', 'gamma']);
    // The rows moved while the question was up: it was about beta, which is no longer second.
    ({ list } = await table([true], rows => rows.unshift('first')));
    assert.deepEqual(list, ['first', 'alpha', 'beta', 'gamma']);

    // Delete in the element's own editor.
    const editor = async (answers, during = () => {}) => {
        const { manager, asked, document } = loadPluginManager(answers);
        const list = ['alpha', 'beta', 'gamma'];
        let saved = 0;
        manager.showArrayElementEditor(list, 1, { type: 'text[]' }, null, {}, () => { saved++; });
        const overlay = document.body.children.at(-1);
        const pending = Promise.all((buttonsNamed(overlay, 'Delete')[0].listeners.click || []).map(handler => handler({})));
        during(list, overlay, document);
        await pending;
        return { list, asked, saved: () => saved, open: overlay.parentNode === document.body };
    };
    let result = await editor([false]);
    assert.equal(result.asked[0].options.title, 'Delete Element');
    assert.equal(result.asked[0].options.danger, true);
    assert.deepEqual(result.list, ['alpha', 'beta', 'gamma']);
    assert.equal(result.open, true, 'Cancel keeps the editor open');
    assert.equal(result.saved(), 0);
    result = await editor([true]);
    assert.deepEqual(result.list, ['alpha', 'gamma']);
    assert.equal(result.open, false);
    assert.equal(result.saved(), 1);
    // The editor was closed while the question was up.
    result = await editor([true], (rows, overlay, document) => { document.body.removeChild(overlay); });
    assert.deepEqual(result.list, ['alpha', 'beta', 'gamma']);
    assert.equal(result.saved(), 0);
});

test('Show Choices refuses fewer than two choices with a notice', () => {
    const { Class, asked } = loadWithDialog('src/event/commands/ShowChoicesCommandEditor.js', 'ShowChoicesCommandEditor', [], { window: {} });
    const editor = Object.create(Class.prototype);
    Object.assign(editor, { choices: ['Yes', '  ', ''], cancelType: -2, defaultType: 0, background: 0, positionType: 2 });
    assert.equal(editor.buildCommands(), null);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].type, 'alert');
    assert.equal(asked[0].message, 'You must have at least 2 choices.');
    assert.equal(asked[0].options.title, 'Show Choices');
    assert.equal(asked[0].options.kind, 'warning');

    editor.choices = ['Yes', 'No'];
    assert.equal(Array.isArray(editor.buildCommands()), true);
    assert.equal(asked.length, 1, 'two choices: nothing to say');
});

test('pasting event commands with nothing copied says so and leaves the list alone', async () => {
    const { Class, asked } = loadWithDialog('src/event/EventCommandList.js', 'EventCommandList', [], { window: {} });
    const list = Object.create(Class.prototype);
    const page = { list: [{ code: 101, indent: 0, parameters: [] }, { code: 0, indent: 0, parameters: [] }] };
    Object.assign(list, { currentPage: page, selectedIndices: [], clipboard: null });
    await list.pasteCommands(page, 0);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].type, 'alert');
    assert.equal(asked[0].message, 'No event commands in clipboard to paste.');
    assert.equal(asked[0].options.title, 'Paste');
    assert.equal(page.list.length, 2);
});

test('Save as structure over an existing name replaces it only on Replace', async () => {
    const make = answers => {
        // The dialog is written as markup; its controls are stood in for one by one.
        const parts = {};
        const part = selector => (parts[selector] ||= Object.assign(dom.createElement(/name|note|events|replace/.test(selector) ? 'input' : 'button'), { value: '', checked: false, select() {} }));
        const overlay = dom.createElement('div');
        overlay.querySelector = part;
        const { document } = dom.createContext();
        document.createElement = () => overlay;
        document.getElementById = () => null;
        document.addEventListener = () => {};
        document.removeEventListener = () => {};
        const { Class, asked } = loadWithDialog('src/BuildHotbar.js', 'BuildHotbar', answers, { document, window: {} });
        const saved = [];
        const manager = {
            selectionIds: () => [1], selectionPieces: () => [], eventsInSelection: () => 0, elevation: () => null, projectPath: () => '/project',
            captureSelection: () => ({ plan: { size: [2, 3], height: 1, storey: 5 }, box: {}, counts: { pieces: 4 } }),
            structureNamed: name => (name === 'Manor' ? { name: 'Manor' } : null),
            saveSelectionAsStructure: options => { saved.push(options); return { file: `${options.name}.json` }; }
        };
        const bar = Object.create(Class.prototype);
        Object.assign(bar, { manager: () => manager, currentMap: () => null, _tt: text => text, flash() {}, render() {} });
        bar.openSaveStructureDialog();
        part('#rr-save-structure-name').value = 'Manor';
        const save = () => Promise.all((part('.rr-save-structure-save').listeners.click || []).map(handler => handler({})));
        return { asked, saved, save, overlay, name: part('#rr-save-structure-name') };
    };

    let { asked, saved, save, overlay, name } = make([false]);
    assert.equal(overlay.isConnected, true);
    await save();
    assert.equal(asked[0].message, 'A structure named “Manor” already exists. Replace it?');
    assert.equal(asked[0].options.title, 'Save as structure');
    assert.equal(asked[0].options.ok, 'Replace');
    assert.equal(asked[0].options.danger, true);
    assert.deepEqual(saved, [], 'Cancel replaces nothing');
    assert.equal(overlay.isConnected, true, 'and goes back to the name');

    ({ asked, saved, save, overlay, name } = make([true]));
    await save();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'Manor');
    assert.equal(saved[0].overwrite, true);
    assert.equal(overlay.isConnected, false, 'saved: the dialog closes');

    // A new name: no question.
    ({ asked, saved, save, overlay, name } = make([]));
    name.value = 'Chapel';
    await save();
    assert.equal(asked.length, 0);
    assert.equal(saved[0].overwrite, false);

    // The dialog was closed while the question was up: nothing to save into.
    ({ asked, saved, save, overlay, name } = make([true]));
    const pending = save();
    overlay.remove();
    await pending;
    assert.deepEqual(saved, []);
});

test('the Plugin Manager and the Database say to load a project first', () => {
    const source = read('src/main.js');
    const classOnly = source.slice(0, source.indexOf('// Initialize the application'));
    assert.ok(classOnly.length > 1000 && classOnly.length < source.length, 'main.js still ends by starting the application');
    const asked = [];
    const RPGReactor = vm.runInNewContext(`${classOnly}\nRPGReactor;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, window: {},
        RRDialog: { alert: (message, options) => { asked.push({ type: 'alert', message, options }); return Promise.resolve(); } }
    });
    const app = Object.create(RPGReactor.prototype);
    let shown = 0;
    app.projectController = { isProjectLoaded: () => false };
    app.pluginManager = { show() { shown++; } };
    app.showPluginManager();
    app.openDatabase('actors');
    assert.equal(shown, 0);
    assert.deepEqual(asked.map(entry => [entry.type, entry.message, entry.options.title]), [
        ['alert', 'Please load a project first.', 'Plugins'],
        ['alert', 'Please load a project first.', 'Database']
    ]);
    app.projectController = { isProjectLoaded: () => true };
    app.showPluginManager();
    assert.equal(shown, 1);
    assert.equal(asked.length, 2, 'with a project open there is nothing to say');
});

/** The browser build's host in a sandbox: the bundle it ships, the copy the browser saved, and what it asks. */
function loadWebHost({ answers = [], stored = [], previousStamp = null } = {}) {
    const asked = [];
    const storage = new Map(previousStamp ? [['rrWebBundleStamp', previousStamp]] : []);
    const { document } = dom.createContext();
    const database = {
        transaction: () => ({ objectStore: () => ({
            getAll() { const request = {}; queueMicrotask(() => { request.result = stored; request.onsuccess(); }); return request; }
        }) })
    };
    const sandbox = {
        document, console: { log() {}, warn() {}, error() {} }, navigator: {}, URL, Blob, TextDecoder, TextEncoder, queueMicrotask,
        RRDialog: {
            confirm: async (message, options) => { asked.push({ type: 'confirm', message, options }); return answers.shift(); },
            alert: async (message, options) => { asked.push({ type: 'alert', message, options }); }
        },
        localStorage: { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => { storage.set(key, String(value)); } },
        fetch: async () => ({ ok: true, json: async () => ({ editorVersion: '0.98.9', files: [], mutable: {} }) }),
        indexedDB: { open() { const request = { result: database }; queueMicrotask(() => request.onsuccess()); return request; } }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(read('src/web/WebHost.js'), sandbox);
    const host = sandbox.RPGReactorWebHost;
    host.resets = 0;
    host.resetProject = async () => { host.resets++; };
    return { host, asked, storage, document };
}

test('the browser build resets only on Reset, and loads a new version over saved edits only when told to', async () => {
    // The Reset button of the "saved in this browser" banner.
    const reset = async answers => {
        const { host, asked, document } = loadWebHost({ answers });
        host.applyBrowserUi();
        const button = document.body.querySelectorAll('button').find(element => element.textContent === 'Reset');
        await button.onclick();
        return { host, asked };
    };
    let { host, asked } = await reset([false]);
    assert.equal(asked[0].message, 'Reset Reactor One and discard all browser-saved edits?');
    assert.equal(asked[0].options.ok, 'Reset');
    assert.equal(asked[0].options.danger, true);
    assert.equal(host.resets, 0, 'Cancel keeps the saved edits');
    ({ host, asked } = await reset([true]));
    assert.equal(host.resets, 1);

    // A newer bundle than the copy the browser saved. What follows the question needs a browser, so a
    // start that goes on is left to fail there: the question and the reset come before it.
    const edits = [{ path: 'data/System.json', data: '{}' }];
    const start = async options => {
        const loaded = loadWebHost(options);
        await loaded.host.initialize().catch(error => { loaded.error = error; });
        return loaded;
    };
    let run = await start({ answers: [false], stored: edits, previousStamp: 'an older bundle' });
    assert.equal(run.asked.length, 1, String(run.error && run.error.stack));
    assert.match(run.asked[0].message, /newer Reactor One than your browser-saved copy/);
    assert.equal(run.asked[0].options.ok, 'Load New Version');
    assert.equal(run.asked[0].options.cancel, 'Keep My Edits');
    assert.equal(run.asked[0].options.danger, true);
    assert.equal(run.host.resets, 0, 'Keep My Edits keeps them');
    const stamp = run.storage.get('rrWebBundleStamp');
    assert.notEqual(stamp, 'an older bundle', 'and the question is not asked again for this bundle');

    run = await start({ answers: [true], stored: edits, previousStamp: 'an older bundle' });
    assert.equal(run.host.resets, 1);

    // The same bundle, or nothing saved: no question.
    run = await start({ answers: [true], stored: edits, previousStamp: stamp });
    assert.equal(run.asked.length, 0);
    assert.equal(run.host.resets, 0);
    run = await start({ answers: [true], stored: [], previousStamp: 'an older bundle' });
    assert.equal(run.asked.length, 0);
    assert.equal(run.host.resets, 0);
});

// ---------------------------------------------------------------------------
// The page and the stylesheet
// ---------------------------------------------------------------------------

test('the dialog is loaded before every script that asks through it', () => {
    const html = read('index.html');
    const scripts = [...html.matchAll(/<script src="(src\/[^"]+)"><\/script>/g)].map(match => match[1]);
    const dialogAt = scripts.indexOf('src/utils/Dialog.js');
    assert.ok(dialogAt >= 0, 'index.html loads utils/Dialog.js');
    assert.ok(scripts.indexOf('src/utils/KeyboardNavigation.js') < dialogAt, 'after the keyboard helper it uses');
    assert.ok(dialogAt < scripts.indexOf('src/UIManager.js'), 'before UIManager, whose dialogs it is');
    const early = scripts.slice(0, dialogAt).filter(script => /\bRRDialog\s*\./.test(codeOnly(read(script))));
    // Loaded earlier is fine for code that only calls it later, from a handler; listed so a load-time use is noticed.
    assert.deepEqual(early, [], 'scripts ahead of Dialog.js that name RRDialog');
    // The dialog hears a key before the application's shortcuts only if its listeners are the first on
    // the window: nothing loaded ahead of it, as a file or written into the page, adds one there.
    const onWindow = /\b(?:window|globalThis|self)\s*\.\s*addEventListener\(\s*['"`]key(?:down|press|up)['"`]/;
    assert.deepEqual(scripts.slice(0, dialogAt).filter(script => onWindow.test(read(script))), [], 'scripts ahead of Dialog.js that listen for keys on the window');
    assert.doesNotMatch(html.slice(0, html.indexOf('src/utils/Dialog.js')), onWindow);
    assert.match(read('src/utils/Dialog.js'), /root\.addEventListener\(type, [^\n]*, true\);/, 'its own are added when the file loads, capturing');
});

test('the dialog sits above every other layer of the editor', () => {
    const styles = read('css/styles.css');
    const own = /\.rr-dialog-overlay\s*\{[^}]*z-index:\s*(\d+)/.exec(styles);
    assert.ok(own, '.rr-dialog-overlay sets a z-index');
    const dialogLayer = Number(own[1]);
    const sources = [styles, read('css/theme.css'), read('index.html')];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith('.js')) sources.push(fs.readFileSync(file, 'utf8'));
        }
    };
    walk(srcRoot);
    let highest = 0;
    for (const source of sources) {
        for (const match of source.matchAll(/z-?index["']?\s*[:=]\s*["'`]?\s*(\d+)/gi)) {
            const value = Number(match[1]);
            if (value !== dialogLayer && value > highest) highest = value;
        }
    }
    assert.ok(dialogLayer > highest, `the dialog (${dialogLayer}) is above the highest other layer (${highest})`);
    // Every rule of the block belongs to the dialog.
    const block = styles.slice(styles.indexOf('RRDialog: the editor\'s alert, confirm and prompt'), styles.indexOf('/* End of RRDialog. */'));
    const selectors = [...block.matchAll(/^([^{}\n/][^{}\n]*)\{/gm)].flatMap(match => match[1].split(',')).map(selector => selector.trim());
    assert.ok(selectors.length > 5);
    for (const selector of selectors) assert.match(selector, /^\.rr-dialog/, `"${selector}" is prefixed .rr-dialog`);
    assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'colors come from the theme\'s tokens');
    // A long pair of labels (another language, a long name) grows the dialog downward instead of spilling out of it.
    assert.match(block, /\.rr-dialog \.rr-modal-footer \{[^}]*flex-wrap:\s*wrap/, 'two long buttons take a row each');
    const buttons = /\.rr-dialog \.rr-modal-footer button \{([^}]*)\}/.exec(block);
    assert.ok(buttons, 'the footer buttons have a rule');
    assert.match(buttons[1], /max-width:\s*100%/, 'a button is never wider than the dialog');
    assert.match(buttons[1], /white-space:\s*normal/, 'and its label wraps when it must');
});

// ---------------------------------------------------------------------------
// The guard: no native dialog anywhere in the editor
// ---------------------------------------------------------------------------

test('the scanner reads code, not comments, strings or other objects\' methods', () => {
    const sample = [
        'if (confirm(text)) go();',                                   // 1: a call
        '// alert("in a comment")',
        'const a = "alert(1)"; const b = \'confirm(2)\';',
        '/* prompt("x") */ window.alert(message);',                   // 4: a call
        'this.confirm(x); RRDialog.confirm(x); ui.showConfirm(x); controller.prompt(y);',
        'const text = `alert(${prompt("inside a template expression")}) and confirm(`;',   // 6: the prompt inside ${}
        'const re = /alert\\(/; const q = a / b; globalThis.prompt (label, value);',       // 7: a call
        'class Box {',
        '    confirm(message) {',
        '        return typeof confirm === "function" ? window . confirm(message) : true;', // 10: a call
        '    }',
        '    async alert(message) { return message; }',
        '}',
        'const unconfirm = reconfirm(x); my_alert(1); $prompt(2);',
        'function picker() {',
        '    const confirm = () => { finish(); };',                    // the picker\'s own OK handler
        '    row.addEventListener("dblclick", () => { confirm(); });',
        '    if (window.confirm("really?")) confirm();',               // 18: the browser\'s, asked for by name
        '}',
        'function other() { return confirm("outside the picker"); }'  // 20: a call
    ].join('\n');
    assert.deepEqual(nativeDialogCalls(sample).map(call => `${call.line}:${call.name}`),
        ['1:confirm', '4:alert', '6:prompt', '7:prompt', '10:confirm', '18:confirm', '20:confirm']);
});

/**
 * The only native dialog calls allowed in editor/src, by file, with exact
 * counts: a call that must answer before its function returns, which the
 * themed dialog cannot do. A file not listed here must have none; a listed
 * file must have exactly its count.
 *
 * None is needed. Closing the window uses none: the window's close event is
 * held back and ProjectController.requestApplicationClose asks through
 * UIManager.promptUnsavedChanges (Save / Discard Changes / Cancel), then
 * closes the window itself. The page's beforeunload handler sets returnValue,
 * which is the browser's own leave question and not a call.
 */
const ALLOWED_NATIVE_DIALOGS = {
    // 'File.js': { count: 1, why: 'what has to answer at once there' }
};

/** Every editor source, as { relative path: text }. Game plugins shipped for imported projects are not editor UI. */
function editorSources() {
    const sources = {};
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            const relative = path.relative(srcRoot, file).split(path.sep).join('/');
            if (entry.isDirectory()) {
                if (relative !== 'legacy/plugins') walk(file);
            } else if (entry.name.endsWith('.js')) {
                sources[relative] = fs.readFileSync(file, 'utf8');
            }
        }
    };
    walk(srcRoot);
    return sources;
}

test('no editor source calls the browser\'s alert, confirm or prompt', () => {
    const sources = editorSources();
    assert.ok(Object.keys(sources).length > 200, `the editor sources were read (${Object.keys(sources).length})`);
    const offenders = [];
    const listed = new Set();
    for (const [file, source] of Object.entries(sources)) {
        const calls = nativeDialogCalls(source);
        if (!calls.length) continue;
        listed.add(file);
        const allowed = ALLOWED_NATIVE_DIALOGS[file];
        if (allowed && allowed.count === calls.length) continue;
        if (allowed) {
            offenders.push(`${file}: ${calls.length} native dialog call(s), the allow-list says ${allowed.count} (${allowed.why})`);
        } else {
            for (const call of calls) offenders.push(`${file}:${call.line}: ${call.text.slice(0, 120)}`);
        }
    }
    for (const [file, allowed] of Object.entries(ALLOWED_NATIVE_DIALOGS)) {
        if (!listed.has(file)) offenders.push(`${file}: no native dialog call is left; take it off the allow-list (${allowed.why})`);
        assert.ok(allowed.why && allowed.why.length > 20, `${file}: the allow-list says why the call must be synchronous`);
    }
    assert.deepEqual(offenders, [], 'use RRDialog.alert / confirm / prompt (utils/Dialog.js)');
});

test('no editor source names a function of its own after one of the browser\'s dialogs', () => {
    // A local `const confirm = ...` hides its calls from the scan above and reads as the browser's to the next person.
    const offenders = [];
    for (const [file, source] of Object.entries(editorSources())) {
        const all = nativeDialogCalls(source, { ownFunctions: 'count' });
        const native = new Set(nativeDialogCalls(source).map(call => call.line));
        for (const call of all) if (!native.has(call.line)) offenders.push(`${file}:${call.line}: ${call.text.slice(0, 120)}`);
    }
    assert.deepEqual(offenders, [], 'name it for what it does (accept, apply, finish)');
});

test('every question and prompt asked in editor/src has its answer waited for', () => {
    // An answer that is not awaited, returned or followed by .then is a promise, and a promise read as an answer is always yes.
    const sample = [
        'if (!(await RRDialog.confirm(text, { title }))) return;',
        'if (RRDialog.confirm(text, { title })) remove();',
        'this.confirm = options.confirm || (message => RRDialog.confirm(message, { title }));',
        'const typed = RRDialog.prompt(label, { title });'
    ].join('\n');
    assert.deepEqual(answersWaited(sample, /RRDialog\.(?:confirm|prompt)\(/g), { total: 4, dropped: [2, 4] });

    const dropped = [];
    let questions = 0;
    for (const [file, source] of Object.entries(editorSources())) {
        const asked = answersWaited(source, /RRDialog\.(?:confirm|prompt)\(/g);
        questions += asked.total;
        for (const line of asked.dropped) dropped.push(`${file}:${line}`);
    }
    assert.deepEqual(dropped, []);
    assert.ok(questions >= 40, `the questions were found (${questions})`);
});

// ---------------------------------------------------------------------------
// The second click of a double click that lands ON the dialog
// ---------------------------------------------------------------------------

/** A full click on one of the dialog's own controls: the press reaches the overlay, the click the control. */
function clickControl(page, id, detail) {
    const control = page.byId(id);
    let pressPrevented = false;
    page.overlay().fire('mousedown', { target: control, detail, preventDefault() { pressPrevented = true; } });
    control.fire('click', { target: control, detail, preventDefault() {} });
    if (page.isOpen()) page.overlay().fire('click', { target: control, detail, preventDefault() {} });
    return { pressPrevented };
}

test('the second click of a double click on what asked does not press a button the dialog put under the pointer', async () => {
    const page = createPage();
    const turn = () => new Promise(resolve => setImmediate(resolve));

    let answered = 'not yet';
    page.RRDialog.confirm('Remove frame 1?', { title: 'Remove Frame', ok: 'Remove Frame', danger: true }).then(value => { answered = value; });
    // The first click asked. The second lands where the action button now is.
    assert.equal(clickControl(page, 'rr-themed-dialog-ok', 2).pressPrevented, true, 'the focus stays where the dialog put it');
    await turn();
    assert.equal(answered, 'not yet', 'nothing is removed by a question nobody read');
    assert.equal(page.isOpen(), true);
    assert.equal(page.focus(), 'rr-themed-dialog-cancel');
    // Nor does it cancel unread, on Cancel or on the close button, as the second or the third click.
    clickControl(page, 'rr-themed-dialog-cancel', 2);
    clickControl(page, 'rr-themed-dialog-close', 3);
    await turn();
    assert.equal(answered, 'not yet');
    assert.equal(page.isOpen(), true);
    // A click of its own answers.
    assert.equal(clickControl(page, 'rr-themed-dialog-ok', 1).pressPrevented, false, 'a press of its own is the browser\'s');
    await turn();
    assert.equal(answered, true);

    // A notice that came up under the pointer stays to be read too.
    let closed = false;
    page.RRDialog.alert('Enter a name for the character sheet.', { title: 'Character Generator' }).then(() => { closed = true; });
    clickControl(page, 'rr-themed-dialog-ok', 2);
    await turn();
    assert.equal(closed, false);
    // A double click that began on the dialog is the user's own: its first click has answered already.
    clickControl(page, 'rr-themed-dialog-ok', 1);
    await turn();
    assert.equal(closed, true);
});

test('a button of the dialog pressed with a key answers whatever clicks came before', async () => {
    const page = createPage();
    const answer = page.RRDialog.confirm('Run this project tool?', { ok: 'Run Tool' });
    // The rest of the double click that asked.
    clickControl(page, 'rr-themed-dialog-cancel', 2);
    assert.equal(page.isOpen(), true);
    // Enter on the focused action button is the browser's click, with no click count.
    page.press('Enter');
    assert.equal(await answerOf(answer), true);
});

test('the rest of a double click that lands on the dialog\'s text selects nothing and keeps the focus', async () => {
    const page = createPage();
    const answer = page.RRDialog.confirm('Remove frame 3?', { title: 'Remove Frame', ok: 'Remove Frame', danger: true });
    assert.equal(page.clickAt({ inside: true, detail: 2 }).pressPrevented, true, 'the second press of the double click that asked');
    assert.equal(page.isOpen(), true);
    assert.equal(page.focus(), 'rr-themed-dialog-cancel');
    // From the first press of its own the dialog's text is the reader's to select and copy.
    assert.equal(page.clickAt({ inside: true }).pressPrevented, false);
    assert.equal(page.clickAt({ inside: true, detail: 2 }).pressPrevented, false, 'a double click of the reader\'s own selects a word');
    page.clickAt();
    assert.equal(await answerOf(answer), false);
});
