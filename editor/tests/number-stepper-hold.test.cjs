/**
 * Holding a stepper's arrow keeps stepping.
 *
 * The themed stepper stands in for the browser's own spinner on every number
 * field in the editor, so whatever it does not do, no number field does. It
 * stepped on `click` alone, which meant an arrow held down moved the value once
 * and then sat there -- auto-repeat, which every native spinner has, was gone
 * editor-wide and nothing noticed.
 *
 * These run the shipped module against a stub document, so what is asserted is
 * the real `enhance` rather than a copy of it: the press steps, the hold
 * repeats, the release stops it, and a single click still moves the value
 * exactly one step.
 *
 * Every test that presses releases in a `finally`. A repeat left running holds
 * the event loop open, so a failed assertion would hang the runner rather than
 * report itself.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const steppers = require(path.join(__dirname, '..', 'src', 'utils', 'NumberSteppers.js'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The smallest document `enhance` can build a stepper in. Listeners are kept
 * rather than dispatched, so a test can call one directly and know exactly
 * which handler ran.
 */
function stubElement(tagName) {
    const element = {
        tagName,
        style: {},
        className: '',
        children: [],
        listeners: new Map(),
        classList: { contains: () => false, add() {} },
        setAttribute() {},
        addEventListener(type, handler) {
            if (!element.listeners.has(type)) element.listeners.set(type, []);
            element.listeners.get(type).push(handler);
        },
        appendChild(child) { element.children.push(child); return child; },
        querySelectorAll: () => []
    };
    return element;
}

function stubField() {
    const steps = [];
    const document = {
        listeners: new Map(),
        createElement: tag => { const el = stubElement(tag.toUpperCase()); el.ownerDocument = document; return el; },
        addEventListener(type, handler) {
            if (!document.listeners.has(type)) document.listeners.set(type, []);
            document.listeners.get(type).push(handler);
        }
    };
    const input = stubElement('INPUT');
    input.type = 'number';
    input.dataset = {};
    input.ownerDocument = document;
    input.offsetWidth = 72;
    input.value = '0';
    input.step = '1';
    input.stepUp = () => { steps.push(1); };
    input.stepDown = () => { steps.push(-1); };
    input.dispatchEvent = () => true;
    input.focus = () => {};
    input.parentNode = { insertBefore() {}, classList: { contains: () => false } };
    input.parentElement = input.parentNode;

    const wrapper = steppers.enhance(input);
    assert.ok(wrapper, 'the field was wrapped');
    const buttons = wrapper.children.find(child => child.className === 'rr-number-stepper-buttons');
    assert.ok(buttons, 'the wrapper carries a button column');
    const [up, down] = buttons.children;
    assert.equal(up.textContent, '▲');
    assert.equal(down.textContent, '▼');

    const fire = (element, type, event = {}) =>
        (element.listeners.get(type) || []).forEach(handler => handler({ preventDefault() {}, ...event }));
    return {
        steps,
        input,
        up,
        down,
        press: button => fire(button, 'mousedown', { button: 0 }),
        leave: button => fire(button, 'mouseleave'),
        click: (button, detail) => fire(button, 'click', { detail }),
        releaseAnywhere: () => {
            const handlers = document.listeners.get('mouseup') || [];
            document.listeners.set('mouseup', []);
            handlers.forEach(handler => handler({ preventDefault() {} }));
        }
    };
}

test('the press steps once, and holding keeps stepping', async () => {
    const field = stubField();
    try {
        field.press(field.up);
        assert.deepEqual(field.steps, [1], 'the press itself moves the value, so the hold has something to continue');

        // The repeat waits out a native spinner's pause (400ms) before running
        // at 60ms. 700ms is therefore five or so steps on an idle machine; the
        // assertion asks only that it is more than the one the press made,
        // because a loaded machine runs the timer late, not wrongly.
        await sleep(700);
        assert.ok(field.steps.length >= 3,
            `held for 700ms the arrow stepped ${field.steps.length} time(s)`);
        assert.ok(field.steps.every(direction => direction === 1), 'and every step went the way the arrow points');

        field.releaseAnywhere();
        const settled = field.steps.length;
        await sleep(200);
        assert.equal(field.steps.length, settled, 'releasing stops it');
    } finally {
        field.releaseAnywhere();
    }
});

test('the pointer leaving the button stops the repeat', async () => {
    const field = stubField();
    try {
        field.press(field.down);
        await sleep(700);
        const held = field.steps.length;
        assert.ok(held >= 3, `the hold was running (${held} steps)`);

        field.leave(field.down);
        await sleep(200);
        assert.equal(field.steps.length, held, 'and dragging off the arrow ends it');
        assert.ok(field.steps.every(direction => direction === -1), 'downward, all of them');
    } finally {
        field.releaseAnywhere();
    }
});

test('a click still steps exactly once', async () => {
    const field = stubField();
    try {
        // A real click arrives as mousedown, mouseup, then click. Stepping
        // moved to the press, so the click that follows must not step again.
        field.press(field.up);
        field.releaseAnywhere();
        field.click(field.up, 1);
        await sleep(120);
        assert.deepEqual(field.steps, [1], 'a pointer click is one step, not two');

        // Keyboard and scripted activation send no press at all, and report
        // detail 0; that is the case the click handler is still there for.
        field.click(field.up, 0);
        assert.deepEqual(field.steps, [1, 1], 'an activation with no press still steps');
    } finally {
        field.releaseAnywhere();
    }
});

test('a disabled or read-only field neither steps nor starts repeating', async () => {
    for (const flag of ['disabled', 'readOnly']) {
        const field = stubField();
        field.input[flag] = true;

        try {
            field.press(field.up);
            assert.deepEqual(field.steps, [], `the press did nothing while ${flag}`);

            await sleep(700);
            assert.deepEqual(field.steps, [], `and no repeat was armed while ${flag}`);
        } finally {
            field.releaseAnywhere();
        }
    }
});
