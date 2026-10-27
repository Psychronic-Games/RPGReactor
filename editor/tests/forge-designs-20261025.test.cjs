'use strict';
// Designs kept in the Forge (RRForgeDesigns): a builder's settings and picture under the project's forge/ folder,
// in groups of the author's own, moved (not copied) when saved into another group. The Prop Builder keeps them
// as the Character Builder does, and shows its pages as the Character Builder's raised tabs, side by side.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

global.rrEscapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const answers = [];
global.RRDialog = { confirm: async () => answers.length ? answers.shift() : true, prompt: async () => 'Props of Old' };
const D = require('../src/forge/ForgeDesigns.js');
const t = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] !== undefined ? v[k] : _));

test('save, group, move, read and delete designs', async () => {
    const base = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rr-designs-'));
    try {
        const recipe = { kind: 'furniture', style: 'scifi' };
        assert.equal(await D.save(base, '', 'Chair', { builder: 'prop3d', version: 1, recipe }, Buffer.from([1, 2]), null, t), true);
        assert.deepEqual(D.names(base), ['Chair']);
        assert.ok(fs.existsSync(path.join(base, 'Chair.png')));
        // Saved again under its own name it is no question; another design of that name is.
        assert.equal(await D.save(base, '', 'Chair', { recipe }, null, { group: '', name: 'Chair' }, t), true);
        answers.push(false);
        assert.equal(await D.save(base, '', 'Chair', { recipe }, null, null, t), false, 'the author keeps the one already there');
        // Into another group, it moves.
        assert.equal(await D.save(base, 'Bridge', 'Chair', { recipe }, null, { group: '', name: 'Chair' }, t), true);
        assert.deepEqual(D.groups(base), ['Bridge']);
        assert.deepEqual(D.names(base), []);
        assert.deepEqual(D.names(base, 'Bridge'), ['Chair']);
        assert.deepEqual(D.read(base, 'Bridge', 'Chair').recipe, recipe);
        assert.equal(await D.chooseGroup(D.NEW, 'Bridge', t), 'Props of Old');
        assert.equal(await D.chooseGroup('', 'Bridge', t), '');
        const html = D.gallery(base, '', { noDesigns: 'none', noModels: 'no models' }, t);
        assert.match(html, /Bridge/); assert.match(html, /data-kind="design"/); assert.match(html, /data-delete="Chair"/); assert.match(html, /no models/);
        assert.equal(await D.remove(base, 'Bridge', 'Chair', t), true);
        assert.deepEqual(D.names(base, 'Bridge'), []);
        assert.match(D.gallery(base, '', { noDesigns: 'none yet', noModels: '' }, t), /none yet/);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('the Prop Builder keeps designs and shows its pages as raised tabs side by side', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/forge/Props/PropBuilder.js'), 'utf8');
    assert.match(src, /rr-c3d-groups[\s\S]{0,200}rr-c3d-group-tab/, 'the tabs are the raised group tabs');
    assert.match(src, /rr-prop-keep[\s\S]{0,200}Save Design/);
    assert.match(src, /RRForgeDesigns\.save\(this\._designsDir\(\)/);
    assert.match(src, /'forge', 'prop_3d', 'props'/);
    const page = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.ok(page.indexOf('src/forge/ForgeDesigns.js') > 0 && page.indexOf('src/forge/ForgeDesigns.js') < page.indexOf('src/forge/Props/PropBuilder.js'));
    // A bare button in the column-stacked tab strip was one tab per row.
    const css = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');
    assert.match(css, /\.rr-c3d-groups \{ display: flex;/);
});

test('the Prop Builder\'s design strings are translated in every language', () => {
    const sandbox = { window: { dispatchEvent() {} }, document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } }, localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class {} };
    sandbox.window.document = sandbox.document; sandbox.window.localStorage = sandbox.localStorage;
    const source = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'].map(f => path.join(__dirname, '../src', f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const text = vm.runInNewContext(`${source}\nRR_TEXT_TRANSLATIONS;`, sandbox);
    const phrases = ['Where Save Design keeps this prop', "Keep this prop's settings in the Forge to open and change later. No model is made.", 'No designs yet. Save Design keeps a prop here without making a model.', 'No props exported from this project yet. Export Model To Project puts one here.', 'Name this prop:', 'Save Design', 'Group', 'No Group', 'New Group'];
    const missing = [];
    for (const locale of ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'])
        for (const phrase of phrases) if (!text[locale] || !text[locale][phrase] || text[locale][phrase] === phrase) missing.push(locale + ': ' + phrase);
    assert.deepEqual(missing, []);
});
