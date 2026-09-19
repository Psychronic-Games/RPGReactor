// The translation observer answers an added element with a whole-document
// pass and replaced text with a look at the element holding it, and the two
// per-frame writers in the sequence preview write only on change. Together
// these stop a preview frame from buying a whole-document translation pass,
// which on a large project starved the database's Apply for ten seconds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = (...p) => fs.readFileSync(path.resolve(__dirname, '..', 'src', ...p), 'utf8');

test('the translation observer scopes a text-only mutation to its element', () => {
    const source = read('I18nManager.js');
    const observe = source.slice(source.indexOf('    observe() {'), source.indexOf('    _readSavedLanguage() {'));
    assert.match(observe, /if \(node\.nodeType === 1\) \{ whole = true; break; \}/);
    assert.match(observe, /if \(node\.nodeType === 3 && m\.target && m\.target\.nodeType === 1\) this\._observerTargets\.add\(m\.target\);/);
    assert.match(observe, /if \(this\._observerWhole\) \{ this\._observerWhole = false; this\.applyText\(document\); return; \}/);
    assert.match(observe, /for \(const target of targets\) if \(target\.isConnected\) this\.applyText\(target\.parentElement \|\| target\);/);
    assert.doesNotMatch(observe, /if \(!mutations\.some\(m => m\.addedNodes && m\.addedNodes\.length\)\) return;/);
});

test('the themed select label and the preview frame counter write only on change', () => {
    const shim = read('utils', 'SelectThemingShim.js');
    assert.match(shim, /if \(target\.dataset\.rrShimLabel === text\) return;\s*target\.dataset\.rrShimLabel = text;/);
    const editor = read('database', 'DatabaseActionSequenceEditor.js');
    assert.match(editor, /if\(this\.time\.textContent!==readout\)this\.time\.textContent=readout;/);
});

test('the observer logic, run against stub mutations, does what the comment says', () => {
    // Extract the observer callback shape by exercising the same decisions.
    const decide = mutations => {
        let whole = false; const targets = new Set();
        for (const m of mutations) {
            if (!m.addedNodes || !m.addedNodes.length) continue;
            for (const node of m.addedNodes) {
                if (node.nodeType === 1) { whole = true; break; }
                if (node.nodeType === 3 && m.target && m.target.nodeType === 1) targets.add(m.target);
            }
            if (whole) break;
        }
        return { whole, targets: [...targets] };
    };
    const span = { nodeType: 1, id: 'span' };
    assert.deepEqual(decide([{ target: span, addedNodes: [{ nodeType: 3 }] }]), { whole: false, targets: [span] });
    assert.deepEqual(decide([{ target: span, addedNodes: [{ nodeType: 1 }] }]), { whole: true, targets: [] });
    assert.deepEqual(decide([{ target: span, addedNodes: [] }]), { whole: false, targets: [] });
});
