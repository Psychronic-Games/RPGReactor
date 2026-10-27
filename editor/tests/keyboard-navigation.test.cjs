const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const dom = require('./helpers/mini-dom.cjs');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/KeyboardNavigation.js'), 'utf8');

/** Document-level listeners are what the helper uses; the stub document needs them. */
function createContext() {
    const context = dom.createContext();
    const { document } = context;
    document.listeners = {};
    document.addEventListener = (type, handler) => { (document.listeners[type] ||= []).push(handler); };
    document.removeEventListener = (type, handler) => { document.listeners[type] = (document.listeners[type] || []).filter(fn => fn !== handler); };
    document.contains = element => document.body.contains(element);
    document.activeElement = document.body;
    // The window's own listeners, which hear a key after the document's.
    context.listeners = {};
    context.addEventListener = (type, handler) => { (context.listeners[type] ||= []).push(handler); };
    vm.runInNewContext(source, context);
    return context;
}

function press(context, target, key, fields = {}) {
    let consumed = false;
    const event = { key, target, preventDefault() { consumed = true; }, stopPropagation() {}, ...fields };
    for (const handler of (context.document.listeners.keydown || []).slice()) handler(event);
    for (const handler of (context.listeners.keydown || []).slice()) handler(event);
    target.fire('keydown', event);
    return consumed;
}

function row(context, text, { disabled = false, tag = 'div' } = {}) {
    const element = dom.createElement(tag);
    element.textContent = text;
    element.dataset.disabled = String(disabled);
    element.classList = {
        set: new Set(),
        add(name) { this.set.add(name); element.className = [...this.set].join(' '); },
        remove(name) { this.set.delete(name); element.className = [...this.set].join(' '); },
        contains(name) { return this.set.has(name); }
    };
    return element;
}

function buildMenu(context, labels) {
    const menu = dom.createElement('div');
    context.document.body.appendChild(menu);
    const rows = labels.map(label => {
        if (label === '-') {
            const separator = dom.createElement('div');
            menu.appendChild(separator);
            return separator;
        }
        const disabled = label.startsWith('!');
        const element = row(context, label.replace(/^!/, ''), { disabled });
        element.activated = 0;
        element.addEventListener('click', () => { element.activated++; });
        menu.appendChild(element);
        return element;
    });
    return { menu, rows };
}

test('menu arrows skip separators and disabled rows, wrap, and Enter activates', () => {
    const context = createContext();
    const opener = dom.createElement('button');
    context.document.body.appendChild(opener);
    opener.focus();
    const { menu, rows } = buildMenu(context, ['Edit', '-', '!Load Sample', 'Copy', 'Delete']);
    let closed = 0;
    const controller = context.RRKeyboardNavigation.menu(menu, {
        items: () => menu.children,
        isDisabled: element => element.dataset.disabled === 'true',
        close: () => { closed++; menu.remove(); }
    });
    assert.equal(context.document.activeElement, menu, 'the menu takes focus so keys reach it');
    assert.equal(controller.active, null, 'a pointer-opened menu starts with no active row');
    assert.equal(press(context, menu, 'ArrowDown'), true);
    assert.equal(controller.active, rows[0]);
    assert.equal(context.document.activeElement, rows[0]);
    press(context, rows[0], 'ArrowDown');
    assert.equal(controller.active, rows[3], 'the separator and the disabled row are skipped');
    press(context, rows[3], 'ArrowDown');
    press(context, rows[4], 'ArrowDown');
    assert.equal(controller.active, rows[0], 'wraps at the end');
    press(context, rows[0], 'End');
    assert.equal(controller.active, rows[4]);
    press(context, rows[4], 'Home');
    assert.equal(controller.active, rows[0]);
    press(context, rows[0], 'ArrowUp');
    assert.equal(controller.active, rows[4], 'wraps at the start');
    press(context, rows[4], 'Enter');
    assert.equal(rows[4].activated, 1, 'Enter runs the active row');
    assert.equal(closed, 0, 'activation is the owner\'s to close');
    press(context, rows[4], 'Escape');
    assert.equal(closed, 1, 'Escape closes through the owner');
    assert.equal(context.document.activeElement, opener, 'focus returns to the opener');
    assert.equal(press(context, opener, 'ArrowDown'), false, 'a closed menu no longer answers');
});

test('a submenu takes the keys while open, and Left or Escape hands them back', () => {
    const context = createContext();
    const { menu, rows } = buildMenu(context, ['Edit', 'Quick Event', 'Delete']);
    const submenu = dom.createElement('div');
    submenu.style.display = 'none';
    rows[1].appendChild(submenu);
    const subRows = ['Transfer', 'Door'].map(label => {
        const element = row(context, label);
        element.activated = 0;
        element.addEventListener('click', () => { element.activated++; });
        submenu.appendChild(element);
        return element;
    });
    let submenuOpens = 0;
    const controller = context.RRKeyboardNavigation.menu(menu, {
        items: () => menu.children,
        isDisabled: element => element.dataset.disabled === 'true',
        submenu: element => {
            if (element !== rows[1]) return null;
            submenuOpens++;
            submenu.style.display = 'block';
            return { element: submenu, items: () => submenu.children, close: () => { submenu.style.display = 'none'; } };
        },
        close: () => menu.remove()
    });
    press(context, menu, 'ArrowDown');
    press(context, rows[0], 'ArrowDown');
    assert.equal(controller.active, rows[1]);
    press(context, rows[1], 'ArrowRight');
    assert.equal(submenuOpens, 1);
    assert.ok(controller.child, 'a child controller owns the submenu');
    assert.equal(controller.child.active, subRows[0], 'the first submenu row is active');
    press(context, subRows[0], 'ArrowDown');
    assert.equal(controller.child.active, subRows[1]);
    assert.equal(controller.active, rows[1], 'the parent row does not move while the child has the keys');
    press(context, subRows[1], 'ArrowLeft');
    assert.equal(controller.child, null, 'Left closes the submenu layer');
    assert.equal(submenu.style.display, 'none');
    assert.equal(context.document.activeElement, rows[1], 'focus returns to the parent row');
    press(context, rows[1], 'Enter');
    assert.equal(submenuOpens, 2, 'Enter on a submenu row opens it rather than activating');
    press(context, subRows[0], 'Enter');
    assert.equal(subRows[0].activated, 1);
    press(context, subRows[0], 'Escape');
    assert.equal(controller.child, null, 'Escape closes only the deepest layer');
    assert.ok(menu.isConnected, 'the parent menu stays open');
    press(context, rows[1], 'Escape');
    assert.equal(menu.isConnected, false);
});

test('disposing on hide returns focus to the opener unless an action moved it', () => {
    const context = createContext();
    const list = dom.createElement('div');
    context.document.body.appendChild(list);
    list.focus();
    const { menu, rows } = buildMenu(context, ['Open dialog', 'Copy']);
    const dialogInput = dom.createElement('input');
    context.document.body.appendChild(dialogInput);
    rows[0].addEventListener('click', () => dialogInput.focus());
    const hide = () => { menu._rrMenuKeys?.dispose(); menu.remove(); };
    context.RRKeyboardNavigation.menu(menu, { items: () => menu.children, close: hide });
    press(context, menu, 'ArrowDown');
    press(context, rows[0], 'ArrowDown');
    rows[1].click();
    hide();
    assert.equal(context.document.activeElement, list, 'the list that opened the menu gets focus back');

    list.focus();
    const second = buildMenu(context, ['Open dialog', 'Copy']);
    second.rows[0].addEventListener('click', () => dialogInput.focus());
    const hideSecond = () => { second.menu._rrMenuKeys?.dispose(); second.menu.remove(); };
    context.RRKeyboardNavigation.menu(second.menu, { items: () => second.menu.children, close: hideSecond });
    press(context, second.menu, 'ArrowDown');
    press(context, second.rows[0], 'Enter');
    hideSecond();
    assert.equal(context.document.activeElement, dialogInput, 'focus an action placed in a dialog is left alone');
});

test('modal traps Tab at both ends, enters on open and restores the opener on leave', () => {
    const context = createContext();
    const opener = dom.createElement('button');
    context.document.body.appendChild(opener);
    opener.focus();
    const overlay = dom.createElement('div');
    context.document.body.appendChild(overlay);
    const close = dom.createElement('button'); close.className = 'rr-modal-close';
    const first = dom.createElement('input');
    const last = dom.createElement('button');
    const hidden = dom.createElement('button'); hidden.style.display = 'none';
    overlay.appendChild(close); overlay.appendChild(first); overlay.appendChild(hidden); overlay.appendChild(last);
    let escapes = 0;
    const trap = context.RRKeyboardNavigation.modal(overlay, { onEscape: () => { escapes++; trap.leave(); } });
    assert.equal(context.RRKeyboardNavigation.modal(overlay), trap, 'installed once per overlay');
    assert.equal(trap.enter(), first, 'focus skips the close button for the first real control');
    assert.equal(context.document.activeElement, first);
    assert.equal(trap.opener, opener);
    last.focus();
    let consumed = false;
    overlay.fire('keydown', { key: 'Tab', shiftKey: false, target: last, preventDefault() { consumed = true; }, stopPropagation() {} });
    assert.equal(consumed, true);
    assert.equal(context.document.activeElement, close, 'Tab from the last control wraps to the first');
    consumed = false;
    overlay.fire('keydown', { key: 'Tab', shiftKey: true, target: close, preventDefault() { consumed = true; }, stopPropagation() {} });
    assert.equal(consumed, true);
    assert.equal(context.document.activeElement, last, 'Shift+Tab from the first control wraps to the last; hidden controls are skipped');
    overlay.fire('keydown', { key: 'Escape', target: last, preventDefault() {}, stopPropagation() {} });
    assert.equal(escapes, 1);
    assert.equal(context.document.activeElement, opener, 'leave() restores the opener');
});

test('a dialog whose focus was refused while hidden takes it once shown, its opener kept', () => {
    const context = createContext();
    const opener = dom.createElement('button');
    context.document.body.appendChild(opener);
    opener.focus();
    const overlay = dom.createElement('div');
    context.document.body.appendChild(overlay);
    const field = dom.createElement('input');
    overlay.appendChild(field);
    const trap = context.RRKeyboardNavigation.modal(overlay);
    // Shown in a window of its own still being made: the focus stays where it was.
    const focus = field.focus;
    field.focus = () => {};
    trap.enter();
    assert.equal(context.document.activeElement, opener);
    field.focus = focus;
    // Its window shows it, with the focus now somewhere in that window.
    context.document.activeElement = context.document.body;
    assert.equal(trap.refocus(), field);
    assert.equal(context.document.activeElement, field);
    assert.equal(trap.opener, opener, 'the opener is the one before it opened');
    trap.leave();
    assert.equal(context.document.activeElement, opener);
    // Entered with the focus given: nothing to give again.
    trap.enter();
    context.document.activeElement = context.document.body;
    assert.equal(trap.refocus(), null);
    assert.equal(context.document.activeElement, context.document.body);
});

test('roving list moves selection with arrows and keeps one Tab stop', () => {
    const context = createContext();
    const nav = dom.createElement('div');
    context.document.body.appendChild(nav);
    const items = ['Actors', 'Classes', 'Skills'].map(label => {
        const element = row(context, label);
        element.classList.add('database-nav-item');
        nav.appendChild(element);
        return element;
    });
    items[0].classList.add('active');
    const selected = [];
    context.RRKeyboardNavigation.roving(nav, {
        orientation: 'vertical',
        items: () => nav.children,
        isSelected: element => element.classList.contains('active'),
        select: element => {
            selected.push(element.textContent);
            items.forEach(item => item.classList.remove('active'));
            element.classList.add('active');
        }
    });
    assert.deepEqual(items.map(item => item.tabIndex), [0, -1, -1]);
    assert.equal(press(context, nav, 'ArrowDown', { target: items[0] }), true);
    assert.deepEqual(selected, ['Classes']);
    assert.equal(context.document.activeElement, items[1]);
    assert.deepEqual(items.map(item => item.tabIndex), [-1, 0, -1]);
    press(context, nav, 'End', { target: items[1] });
    assert.deepEqual(selected, ['Classes', 'Skills']);
    press(context, nav, 'ArrowDown', { target: items[2] });
    assert.deepEqual(selected, ['Classes', 'Skills', 'Skills'], 'the end does not wrap in a category list');
    assert.equal(press(context, nav, 'ArrowRight', { target: items[2] }), false, 'horizontal keys are left alone');
});

test('outdentLine removes one indentation level from the caret line only', () => {
    const context = createContext();
    const field = { value: 'if (a) {\n        b();\n}', selectionStart: 17, selectionEnd: 17 };
    assert.equal(context.RRKeyboardNavigation.outdentLine(field, 4), true);
    assert.equal(field.value, 'if (a) {\n    b();\n}');
    assert.equal(field.selectionStart, 13);
    const flush = { value: 'x', selectionStart: 1, selectionEnd: 1 };
    assert.equal(context.RRKeyboardNavigation.outdentLine(flush, 4), false, 'nothing to remove leaves Tab to the browser');
});

// A dialog that redraws the control holding the focus leaves the focus on <body>: the overlay's own
// listener hears nothing, so the helper answers from the document for the dialog on top.
function dialog(context, { onEscape, display } = {}) {
    const overlay = dom.createElement('div');
    if (display) overlay.style.display = display;
    context.document.body.appendChild(overlay);
    const first = dom.createElement('input'), last = dom.createElement('button');
    overlay.appendChild(first); overlay.appendChild(last);
    const state = { overlay, first, last, escapes: 0 };
    state.trap = context.RRKeyboardNavigation.modal(overlay, onEscape === false ? {} : { onEscape: () => { state.escapes++; } });
    return state;
}
const strayPress = (context, key, fields = {}) => press(context, context.document.body, key, fields);

test('a key that reaches no control goes to the dialog on top: Escape closes it, Tab goes back inside', () => {
    const context = createContext();
    const one = dialog(context);
    one.trap.enter();
    context.document.activeElement = context.document.body;   // the focused control was redrawn away
    assert.equal(strayPress(context, 'Tab'), true);
    assert.equal(context.document.activeElement, one.first, 'Tab from the page lands on the first control');
    context.document.activeElement = context.document.body;
    assert.equal(strayPress(context, 'Tab', { shiftKey: true }), true);
    assert.equal(context.document.activeElement, one.last, 'Shift+Tab on the last');
    context.document.activeElement = context.document.body;
    assert.equal(strayPress(context, 'Escape'), true);
    assert.equal(one.escapes, 1);
    // Other keys, and chords, are not the dialog's.
    assert.equal(strayPress(context, 'a'), false);
    assert.equal(strayPress(context, 'Escape', { ctrlKey: true }), false);
    assert.equal(one.escapes, 1);
    // A key somebody already took is left to them.
    const taken = { key: 'Escape', target: context.document.body, defaultPrevented: true, preventDefault() {}, stopPropagation() {} };
    for (const handler of context.document.listeners.keydown.slice()) handler(taken);
    assert.equal(one.escapes, 1, 'a key already handled is not handled twice');
});

test('nested dialogs answer innermost first, a hidden one not at all, and a disposed one stops listening', () => {
    const context = createContext();
    const outer = dialog(context), inner = dialog(context);
    outer.trap.enter(); inner.trap.enter();
    context.document.activeElement = context.document.body;
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [0, 1], 'the dialog entered last is on top');
    // Focus left behind in the dialog underneath still reaches the one on top.
    outer.first.focus();
    press(context, outer.first, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [0, 2]);
    // Inside the dialog on top its own listener answers, once.
    inner.first.focus();
    const inside = { key: 'Escape', target: inner.first, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    inner.overlay.fire('keydown', inside);                       // the overlay's own listener, as the key bubbles to it
    for (const handler of context.document.listeners.keydown.slice()) handler(inside);
    assert.deepEqual([outer.escapes, inner.escapes], [0, 3]);
    // Closed by hiding: the one underneath is on top again.
    inner.overlay.style.display = 'none';
    context.document.activeElement = context.document.body;
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [1, 3]);
    // Shown again without enter(): modal() puts it back on top.
    inner.overlay.style.display = '';
    context.RRKeyboardNavigation.modal(inner.overlay);
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [1, 4]);
    // An overlay removed without dispose() is forgotten; a disposed one stops listening.
    inner.overlay.remove();
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [2, 4]);
    const before = context.document.listeners.keydown.length;
    outer.trap.dispose();
    assert.equal(context.document.listeners.keydown.length, before - 1, 'no dialog left: the document listener goes');
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [2, 4]);
});

test('the page says which dialog is on top where it can, and something else on top keeps the key', () => {
    const context = createContext();
    const outer = dialog(context), inner = dialog(context);
    context.innerWidth = 800; context.innerHeight = 600;
    let under = outer.first;
    context.document.elementFromPoint = () => under;
    context.document.activeElement = context.document.body;
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [1, 0], 'the dialog under the middle of the window');
    under = inner.last;
    strayPress(context, 'Escape');
    assert.deepEqual([outer.escapes, inner.escapes], [1, 1]);
    const foreign = dom.createElement('div');
    context.document.body.appendChild(foreign);
    under = foreign;
    assert.equal(strayPress(context, 'Escape'), false, 'a layer that is not one of these dialogs is on top');
    assert.deepEqual([outer.escapes, inner.escapes], [1, 1]);
});

test('an open menu owns the keys, and a dialog whose owner listens on it hears a stray Escape replayed', () => {
    const context = createContext();
    const one = dialog(context);
    const { menu } = buildMenu(context, ['Copy', 'Paste']);
    let closed = 0;
    const keys = context.RRKeyboardNavigation.menu(menu, { items: () => menu.children, close: () => { closed++; } });
    context.document.activeElement = context.document.body;
    strayPress(context, 'Escape');
    assert.deepEqual([closed, one.escapes], [1, 0], 'the menu closes; the dialog stays');
    keys.dispose();
    one.trap.dispose();
    // No onEscape: the owner's own listener is on the dialog, so the key is pressed there again.
    const plain = dialog(context, { onEscape: false });
    const heard = [];
    context.KeyboardEvent = function (type, init) { Object.assign(this, init, { type, defaultPrevented: false }); this.preventDefault = () => { this.defaultPrevented = true; }; };
    plain.overlay.dispatchEvent = event => { heard.push(event.key); event.preventDefault(); };
    assert.equal(strayPress(context, 'Escape'), true, 'the owner took the replayed key');
    assert.deepEqual(heard, ['Escape']);
});

test('a dialog with no keyboard of its own on top closes on Escape through its close button', () => {
    const context = createContext();
    const under = dialog(context);                                  // the Event Editor, say
    const layer = dom.createElement('div'), box = dom.createElement('div'), close = dom.createElement('button'), field = dom.createElement('input');
    layer.className = 'change-items-editor-modal'; box.className = 'rr-modal'; close.className = 'rr-modal-close close-btn';
    box.appendChild(close); box.appendChild(field); layer.appendChild(box);
    context.document.body.appendChild(layer);
    let closed = 0;
    close.addEventListener('click', () => { closed++; });
    context.innerWidth = 800; context.innerHeight = 600;
    context.document.elementFromPoint = () => field;
    // The focus was left on the list underneath, on the page, or is in the dialog itself.
    const list = dom.createElement('div');                          // a list in an editor that registers no keys
    context.document.body.appendChild(list);
    assert.equal(press(context, under.first, 'Escape'), true);
    assert.equal(strayPress(context, 'Escape'), true);
    assert.equal(press(context, field, 'Escape'), true);
    assert.equal(press(context, list, 'Escape'), true);
    list.remove();
    closed--;
    assert.deepEqual([closed, under.escapes], [3, 0], 'the dialog on top closes; the one under it stays');
    // Tab, chords and a key somebody took are not its business.
    assert.equal(strayPress(context, 'Tab'), false);
    assert.equal(strayPress(context, 'Escape', { shiftKey: true }), false);
    const taken = { key: 'Escape', target: field, defaultPrevented: true, preventDefault() {}, stopPropagation() {} };
    for (const handler of context.listeners.keydown.slice()) handler(taken);
    // A control that went away with its own dialog had its answer already.
    const gone = dom.createElement('input');
    assert.equal(press(context, gone, 'Escape'), false);
    assert.equal(closed, 3);
    // An editor those dialogs open from is not closed this way, whatever it is named by.
    layer.className = 'rr-modal-overlay'; layer.id = 'event-editor-modal';
    assert.equal(strayPress(context, 'Escape'), false);
    layer.className = 'change-items-editor-modal';
    // A layer whose close button is not on screen keeps the key.
    close.style.display = 'none';
    assert.equal(strayPress(context, 'Escape'), false);
    assert.deepEqual([closed, under.escapes], [3, 0]);
});
