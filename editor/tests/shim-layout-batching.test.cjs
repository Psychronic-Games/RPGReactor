// The select and number-field shims wrap every matching control the editor
// adds. Reading layout for one control after mutating the DOM for the last
// forces a full style recalculation per control, which on a database page
// beside a 250-row list was half a second per click. Both shims read every
// control first and mutate afterwards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = name => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', name), 'utf8');

test('SelectThemingShim measures every select before wrapping the first', () => {
    const source = read('SelectThemingShim.js');
    const wrapAll = source.slice(source.indexOf('const wrapAll = '), source.indexOf('const scan = '));
    // One loop reads, a second loop writes; the writer takes the measured flex.
    assert.match(wrapAll, /pending\.push\(\[selectEl, window\.getComputedStyle\(selectEl\)\.flex\]\)/);
    assert.match(wrapAll, /for \(const \[selectEl, flex\] of pending\) wrap\(selectEl, flex\);/);
    assert.match(source, /const computedFlex = flex !== undefined \? flex : window\.getComputedStyle\(selectEl\)\.flex;/);
    // The observer gathers every select across all records into one batch.
    const observer = source.slice(source.indexOf('const mutObs = new MutationObserver'));
    assert.match(observer, /if \(found\.length\) wrapAll\(found\);/);
    assert.doesNotMatch(observer, /\bwrap\(n\)/);
    assert.doesNotMatch(observer, /\bscan\(n\)/);
});

test('NumberSteppers measures every input before wrapping the first', () => {
    const source = read('NumberSteppers.js');
    const list = source.slice(source.indexOf('function enhanceList('), source.indexOf('function enhanceAll('));
    assert.match(list, /pending\.push\(\[input, needsMeasure \? input\.offsetWidth : null\]\)/);
    assert.match(list, /for \(const \[input, width\] of pending\) \{\s*if \(enhance\(input, width\)\) count\+\+;/);
    const observer = source.slice(source.indexOf('observer = new MutationObserver'), source.indexOf('observer.observe('));
    assert.match(observer, /if \(inputs\.length\) enhanceList\(inputs\);/);
    assert.doesNotMatch(observer, /enhance\(node\)/);
    assert.doesNotMatch(observer, /enhanceAll\(node\)/);
});

test('NumberSteppers wraps through the batch exactly as it did one at a time', () => {
    // A tiny DOM: enough for enhanceList to run without a browser.
    const makeEl = (tag, type) => {
        const el = { tagName: tag, type, style: {}, dataset: {}, children: [], _classes: new Set(),
            classList: { contains: c => el._classes.has(c), add: c => el._classes.add(c) },
            ownerDocument: null, parentElement: null, parentNode: null, offsetWidth: 120,
            appendChild(child) { child.parentElement = child.parentNode = el; el.children.push(child); return child; },
            insertBefore(node, ref) { const i = el.children.indexOf(ref); el.children.splice(i < 0 ? el.children.length : i, 0, node); node.parentElement = node.parentNode = el; return node; },
            setAttribute() {}, addEventListener() {}, querySelectorAll: () => [] };
        return el;
    };
    const doc = { createElement: tag => makeEl(tag.toUpperCase()), body: null, addEventListener() {} };
    const root = { document: doc, RR_NUMBER_STEPPERS_MANUAL: true };
    const source = read('NumberSteppers.js');
    new Function('globalThis', 'window', 'module', source)(root, root, {});
    const api = root.RRNumberSteppers;
    const form = makeEl('DIV');
    const inputs = [makeEl('INPUT', 'number'), makeEl('INPUT', 'number'), makeEl('INPUT', 'text')];
    inputs.forEach(input => { input.ownerDocument = doc; form.appendChild(input); });
    inputs[1].style.width = '64px';
    assert.equal(api.enhanceList(inputs), 2, 'two number inputs wrapped, the text input left alone');
    const wrappers = form.children.filter(child => child.className && child.className.includes(api.CLASS));
    assert.equal(wrappers.length, 2);
    assert.equal(wrappers[0].style.width, '120px', 'a measured width lands on the wrapper');
    assert.equal(wrappers[1].style.width, '64px', 'an explicit width is carried instead');
    assert.equal(api.enhanceList(inputs), 0, 'a second pass wraps nothing twice');
});
