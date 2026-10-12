// The translation observer answers an added element with a pass over that
// element and what it holds, replaced text with a look at the element holding
// it, and in English it does not watch at all; the two per-frame writers in
// the sequence preview write only on change. Together these stop a preview
// frame, or a database tab filling in, from buying a whole-document
// translation pass, which on a large project starved the database's Apply for
// ten seconds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = (...p) => fs.readFileSync(path.resolve(__dirname, '..', 'src', ...p), 'utf8');

test('the translation observer scopes its passes to what was added', () => {
    const source = read('I18nManager.js');
    const observe = source.slice(source.indexOf('    observe() {'), source.indexOf('    _readSavedLanguage() {'));
    assert.match(observe, /if \(node\.nodeType === 1\) this\._observerAdded\.add\(node\);/);
    assert.match(observe, /else if \(node\.nodeType === 3 && m\.target && m\.target\.nodeType === 1\) this\._observerTargets\.add\(m\.target\);/);
    assert.match(observe, /if \(this\.language === 'en'\) return;/);
    assert.doesNotMatch(observe, /applyText\(document\)/, 'no whole-document pass from the observer');
    assert.doesNotMatch(observe, /if \(!mutations\.some\(m => m\.addedNodes && m\.addedNodes\.length\)\) return;/);
});

test('the themed select label and the preview frame counter write only on change', () => {
    const shim = read('utils', 'SelectThemingShim.js');
    assert.match(shim, /if \(target\.dataset\.rrShimLabel === text\) return;\s*target\.dataset\.rrShimLabel = text;/);
    const editor = read('database', 'DatabaseActionSequenceEditor.js');
    assert.match(editor, /if\(this\.time\.textContent!==readout\)this\.time\.textContent=readout;/);
});

// Just enough DOM to run the observer: elements with tags, attributes, text,
// children, `matches` on a tag list and `querySelectorAll` over descendants.
function element(tag, text = '') {
    const el = {
        nodeType: 1, tagName: tag.toUpperCase(), attrs: {}, children: [], parentElement: null, text,
        isConnected: true,
        get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this.text; },
        set textContent(value) { this.text = String(value); this.children = []; el.writes = (el.writes || 0) + 1; },
        getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        hasAttribute(k) { return Object.hasOwn(this.attrs, k); },
        closest() { return null; },
        querySelector() { return null; },
        matches(selectors) { return selectors.split(',').some(s => s.trim().toUpperCase() === this.tagName); },
        querySelectorAll(selectors) {
            const out = [];
            const walk = node => { for (const c of node.children) { if (c.matches(selectors) || (selectors === '[placeholder]' && c.hasAttribute('placeholder'))) out.push(c); walk(c); } };
            walk(this);
            return out;
        },
        append(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } }
    };
    return el;
}

function loadI18n(language) {
    const observers = [];
    const timers = [];
    const body = element('body');
    const store = new Map([['rr-settings', JSON.stringify({ language })]]);
    const document = {
        readyState: 'complete', documentElement: {}, body,
        addEventListener() {},
        querySelectorAll(selectors) { return body.querySelectorAll(selectors); }
    };
    const sandbox = {
        window: { dispatchEvent() {}, document },
        document,
        localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
        CustomEvent: class { constructor(type) { this.type = type; } },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.live = false; observers.push(this); }
            observe() { this.live = true; }
            disconnect() { this.live = false; }
        },
        setTimeout: fn => { timers.push(fn); return timers.length; }
    };
    const source = [read('I18nDeepTranslations.js'), read('I18nReviewedTranslations.js'), read('I18nManager.js')].join('\n');
    const manager = vm.runInNewContext(`${source}\nwindow.I18n`, sandbox);
    const live = () => observers.filter(o => o.live);
    const flush = () => { while (timers.length) timers.shift()(); };
    return { manager, body, live, flush };
}

test('in English the observer does not watch, and a switch away starts it after a full pass', () => {
    const { manager, body, live } = loadI18n('en');
    assert.equal(live().length, 0, 'English labels need no watching');
    const button = element('button', 'Cancel');
    body.append(button);
    manager.setLanguage('ja', { persist: false });
    assert.equal(live().length, 1, 'the observer starts with a translated language');
    assert.equal(button.getAttribute('data-i18n-text-source'), 'Cancel', 'the switch read the unstamped English label');
    assert.notEqual(button.textContent, 'Cancel');
    manager.setLanguage('en', { persist: false });
    assert.equal(live().length, 0, 'back in English the observer stops');
    assert.equal(button.textContent, 'Cancel');
});

test('an added element is translated by a pass over itself, not the document', () => {
    const { manager, body, live, flush } = loadI18n('ja');
    const observer = live()[0];
    assert.ok(observer);
    const bystander = element('button', 'Cancel');
    body.append(bystander);
    manager.applyText(body);
    const writesBefore = bystander.writes || 0;
    // A panel with a label inside, and the label added again separately in
    // the same batch: one pass over the panel covers both.
    const panel = element('div');
    const label = element('button', 'Cancel');
    panel.append(label);
    body.append(panel);
    const lone = element('button', 'Cancel');
    body.append(lone);
    let passes = 0;
    const applyText = manager.applyText.bind(manager);
    manager.applyText = (root, includeRoot) => { passes++; assert.notEqual(root, body, 'no whole-document pass'); return applyText(root, includeRoot); };
    observer.callback([{ target: body, addedNodes: [panel, lone] }, { target: panel, addedNodes: [label] }]);
    flush();
    assert.equal(passes, 2, 'the panel and the lone button, the nested label covered by its panel');
    assert.notEqual(label.textContent, 'Cancel');
    assert.notEqual(lone.textContent, 'Cancel', 'the added element itself is translated, not only what it holds');
    assert.equal(bystander.writes || 0, writesBefore, 'labels elsewhere are not rewritten');
});
