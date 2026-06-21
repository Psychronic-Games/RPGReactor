const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadI18nForTest(savedSettings = null) {
    const store = new Map();
    if (savedSettings) store.set('rr-settings', JSON.stringify(savedSettings));

    const sandbox = {
        window: {
            dispatchEvent() {}
        },
        document: {
            readyState: 'complete',
            documentElement: {},
            addEventListener() {},
            querySelectorAll() { return []; }
        },
        localStorage: {
            getItem(key) { return store.has(key) ? store.get(key) : null; },
            setItem(key, value) { store.set(key, String(value)); }
        },
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.CustomEvent = sandbox.CustomEvent;

    const source = fs.readFileSync(path.join(repoRoot, 'src', 'I18nManager.js'), 'utf8');
    const result = vm.runInNewContext(`${source}\n({ RR_LANGUAGES, RR_I18N_STRINGS, manager: window.I18n, store: localStorage });`, sandbox);
    result.savedSettings = () => JSON.parse(store.get('rr-settings') || '{}');
    result.document = sandbox.document;
    return result;
}

test('i18n dictionaries expose every supported language for every English key', () => {
    const { RR_LANGUAGES, RR_I18N_STRINGS } = loadI18nForTest();
    assert.deepEqual(Array.from(RR_LANGUAGES, lang => lang.id), ['en', 'ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el']);

    const englishKeys = Array.from(Object.keys(RR_I18N_STRINGS.en)).sort();
    for (const lang of ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el']) {
        assert.deepEqual(Array.from(Object.keys(RR_I18N_STRINGS[lang])).sort(), englishKeys, `${lang} keys match English keys`);
    }
});

test('i18n manager reads, applies, and persists language preference', () => {
    const { manager, savedSettings, document } = loadI18nForTest({ language: 'ja' });

    assert.equal(manager.currentLanguage(), 'ja');
    assert.equal(manager.t('menu.file'), 'ファイル');
    assert.equal(document.documentElement.lang, 'ja');

    manager.setLanguage('es');

    assert.equal(manager.currentLanguage(), 'es');
    assert.equal(manager.t('menu.file'), 'Archivo');
    assert.equal(savedSettings().language, 'es');
});

test('localized UI key references exist in the English dictionary', () => {
    const { RR_I18N_STRINGS } = loadI18nForTest();
    const knownKeys = new Set(Object.keys(RR_I18N_STRINGS.en));
    const files = [
        path.join(repoRoot, 'index.html'),
        path.join(repoRoot, 'src', 'OptionsManager.js'),
        path.join(repoRoot, 'src', 'main.js'),
        path.join(repoRoot, 'src', 'forge', 'ForgeManager.js')
    ];
    const usedKeys = new Set();

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [regex, captureIndex] of [
            [/data-i18n(?:-[a-z]+)?="([^"]+)"/g, 1],
            [/I18n\.t\('([^']+)'/g, 1],
            [/(?:^|[^A-Za-z0-9_$])t\('([^']+)'/g, 1],
            [/nameKey:\s*'([^']+)'/g, 1],
            [/descriptionKey:\s*'([^']+)'/g, 1]
        ]) {
            let match;
            while ((match = regex.exec(source)) !== null) usedKeys.add(match[captureIndex]);
        }
    }

    const missing = Array.from(usedKeys).filter(key => !knownKeys.has(key)).sort();
    assert.deepEqual(missing, []);
});

test('high-visibility localized labels do not fall back to English', () => {
    const { RR_LANGUAGES, RR_I18N_STRINGS, manager } = loadI18nForTest();
    const nonEnglishLanguages = RR_LANGUAGES.map(lang => lang.id).filter(id => id !== 'en');
    const uiKeys = ['menu.plugins', 'menu.build'];
    const eventCommandNames = ['Script'];

    for (const lang of nonEnglishLanguages) {
        manager.setLanguage(lang, { persist: false });

        for (const key of uiKeys) {
            assert.notEqual(manager.t(key), RR_I18N_STRINGS.en[key], `${lang} translates ${key}`);
        }

        for (const name of eventCommandNames) {
            assert.notEqual(manager.tEventCommandName(name), name, `${lang} translates event command ${name}`);
        }
    }
});

test('generic exact-text pass preserves complex controls', () => {
    const { manager } = loadI18nForTest();

    class FakeElement {
        constructor(text, children = []) {
            this._textContent = text;
            this.children = children;
            this.attrs = new Map();
        }

        get textContent() { return this._textContent; }
        set textContent(value) {
            this._textContent = value;
            this.children = [];
        }

        hasAttribute(name) { return this.attrs.has(name); }
        getAttribute(name) { return this.attrs.get(name); }
        setAttribute(name, value) { this.attrs.set(name, String(value)); }
        closest() { return null; }
        querySelector() { return null; }
    }

    const complexButton = new FakeElement('Character Generator\nGenerate character sprites', [{}]);
    const simpleButton = new FakeElement('Plugins');
    const root = {
        querySelectorAll(selector) {
            return selector === '[placeholder]' ? [] : [complexButton, simpleButton];
        }
    };

    manager.applyText(root);

    assert.equal(complexButton.children.length, 1, 'complex button children remain intact');
    assert.equal(simpleButton.getAttribute('data-i18n-text-source'), 'Plugins');
});
