const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
    auditTextTranslationCoverage,
    formatMissingPhrases,
    inventoryLocalizationSource
} = require('./helpers/i18n-source-audit.cjs');

const repoRoot = path.resolve(__dirname, '..');
const deepTranslationsPath = path.join(repoRoot, 'src', 'I18nDeepTranslations.js');
const reviewedTranslationsPath = path.join(repoRoot, 'src', 'I18nReviewedTranslations.js');

function i18nSource() {
    const deep = fs.existsSync(deepTranslationsPath) ? fs.readFileSync(deepTranslationsPath, 'utf8') : '';
    const reviewed = fs.existsSync(reviewedTranslationsPath) ? fs.readFileSync(reviewedTranslationsPath, 'utf8') : '';
    return `${deep}\n${reviewed}\n${fs.readFileSync(path.join(repoRoot, 'src', 'I18nManager.js'), 'utf8')}`;
}

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

    const source = i18nSource();
    const result = vm.runInNewContext(`${source}\n({
        RR_LANGUAGES,
        RR_I18N_STRINGS,
        reviewed: globalThis.RR_REVIEWED_TRANSLATIONS,
        catalogs: {
            text: RR_TEXT_TRANSLATIONS,
            keyed: RR_I18N_STRINGS,
            commands: RR_EVENT_COMMAND_NAMES,
            sections: RR_EVENT_SECTION_NAMES
        },
        manager: window.I18n,
        store: localStorage
    });`, sandbox);
    result.savedSettings = () => JSON.parse(store.get('rr-settings') || '{}');
    result.document = sandbox.document;
    return result;
}

test('i18n dictionaries expose every supported language for every English key', () => {
    const { RR_LANGUAGES, RR_I18N_STRINGS } = loadI18nForTest();
    assert.deepEqual(Array.from(RR_LANGUAGES, lang => lang.id), ['en', 'ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr']);
    const portuguese = Array.from(RR_LANGUAGES).find(lang => lang.id === 'pt');
    assert.equal(portuguese.name, 'Portuguese (Brazil)');
    assert.equal(portuguese.nativeName, 'Português (Brasil)');
    assert.equal(portuguese.flag, '🇧🇷');

    const englishKeys = Array.from(Object.keys(RR_I18N_STRINGS.en)).sort();
    for (const lang of ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr']) {
        assert.deepEqual(Array.from(Object.keys(RR_I18N_STRINGS[lang])).sort(), englishKeys, `${lang} keys match English keys`);
    }
});

test('i18n manager reads, applies, and persists language preference', () => {
    const { manager, savedSettings, document } = loadI18nForTest({ language: 'ja' });

    assert.equal(manager.currentLanguage(), 'ja');
    assert.equal(manager.t('menu.file'), 'ファイル');
    assert.equal(document.documentElement.lang, 'ja');
    assert.equal(document.documentElement.dir, 'ltr');

    manager.setLanguage('es');

    assert.equal(manager.currentLanguage(), 'es');
    assert.equal(manager.t('menu.file'), 'Archivo');
    assert.equal(savedSettings().language, 'es');

    manager.setLanguage('ar');
    assert.equal(document.documentElement.dir, 'rtl');
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
    const uiKeys = [
        'menu.plugins', 'menu.build',
        'options.animateAutotilesNote',
        'theme.gold.description',
        'theme.bubblegum.description',
        'theme.ocean.description',
        'theme.cascadia.description',
        'theme.underworld.description',
        'theme.creamsicle.description',
        'theme.royalty.description',
        'forge.characterGenerator.description',
        'forge.animationGenerator.description',
        'forge.soundEffectGenerator.description',
        'forge.effekseerGenerator.description'
    ];
    const eventCommandNames = ['Script'];
    const identicalCommandLoanwords = {
        fr: new Set(['Script']),
        it: new Set(['Script'])
    };
    const literalLabels = [
        'Clear Selected',
        'Last Action Data',
        'Last Used Skill ID',
        'Last Used Item ID',
        'Last Actor ID to Act',
        'Last Enemy Index to Act',
        'Last Target Actor ID',
        'Last Target Enemy Index',
        'Lower Layer:',
        'Upper Layer:'
    ];

    for (const lang of nonEnglishLanguages) {
        manager.setLanguage(lang, { persist: false });

        for (const key of uiKeys) {
            assert.notEqual(manager.t(key), RR_I18N_STRINGS.en[key], `${lang} translates ${key}`);
        }

        for (const name of eventCommandNames) {
            if (identicalCommandLoanwords[lang]?.has(name)) continue;
            assert.notEqual(manager.tEventCommandName(name), name, `${lang} translates event command ${name}`);
        }

        for (const label of literalLabels) {
            assert.notEqual(manager.tText(label), label, `${lang} translates literal label ${label}`);
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

test('literal-string translation tables have identical key sets in every locale', () => {
    // tText falls back to English silently, so a locale missing keys ships
    // a half-translated UI with no test failure — guard parity here.
    const source = i18nSource();
    const vmCtx = {};
    vm.createContext(vmCtx);
    vm.runInContext(
        source.slice(0, source.indexOf('class I18nManager')) +
        ';__tables = { text: RR_TEXT_TRANSLATIONS, commands: RR_EVENT_COMMAND_NAMES, sections: RR_EVENT_SECTION_NAMES };',
        vmCtx
    );
    const nonEnglish = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    for (const [name, table] of Object.entries(vmCtx.__tables)) {
        assert.deepEqual(Object.keys(table).sort(), [...nonEnglish].sort(), `${name} covers every non-English locale`);
        const refKeys = Array.from(Object.keys(table.ja)).sort();
        for (const lang of nonEnglish) {
            assert.deepEqual(Array.from(Object.keys(table[lang])).sort(), refKeys, `${name}[${lang}] keys match ja`);
        }
    }
});

test('localization source inventory recognizes static text calls and consumed schemas', () => {
    const source = `
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        class TextUI {
            _t(text) { return window.I18n.tText(text); }
            render() {
                tt('Single quoted');
                window.I18n.tText("Double quoted");
                this._t(\`Static template\`);
                this._t(\`Dynamic \${value}\`);
                window.I18n.t('menu.keyed');
                const fields = [{ label: 'Schema label', hint: 'Schema hint' }];
                fields.forEach(field => tt(field.label) + tt(field.hint));
            }
        }
    `;
    const phrases = Array.from(inventoryLocalizationSource(source, 'src/database/Fixture.js').keys()).sort();
    assert.deepEqual(phrases, ['Double quoted', 'Schema hint', 'Schema label', 'Single quoted', 'Static template']);

    const keyedSource = `class KeyedUI { _t(key) { return window.I18n.t(key); } render() { this._t('menu.file'); } }`;
    assert.deepEqual(Array.from(inventoryLocalizationSource(keyedSource).keys()), []);

    const mixedSource = `class MixedUI {
        _t(key) { return window.I18n.t(key); }
        _tx(text) { return window.I18n.tText(text); }
        render() { this._t('efk.durationShort'); this._tx('Duration'); }
    }`;
    assert.deepEqual(Array.from(inventoryLocalizationSource(mixedSource).keys()), ['Duration']);
});

test('all statically routed localization source phrases exist in RR_TEXT_TRANSLATIONS', () => {
    const source = i18nSource();
    const vmCtx = {};
    vm.createContext(vmCtx);
    vm.runInContext(
        source.slice(0, source.indexOf('class I18nManager')) + ';__text = RR_TEXT_TRANSLATIONS;',
        vmCtx
    );
    const sourceKeys = new Set(Object.keys(vmCtx.__text.ja));
    const audit = auditTextTranslationCoverage(repoRoot, sourceKeys);

    assert.equal(audit.missing.length, 0, formatMissingPhrases(audit.missing));
});

test('literal translations preserve interpolation placeholders', () => {
    const source = i18nSource();
    const vmCtx = {};
    vm.createContext(vmCtx);
    vm.runInContext(
        source.slice(0, source.indexOf('class I18nManager')) + ';__text = RR_TEXT_TRANSLATIONS;',
        vmCtx
    );
    const placeholderPattern = /\{[^{}]+\}|%[1-9](?!\d)/g;
    const referenceKeys = Object.keys(vmCtx.__text.ja);
    for (const locale of Object.keys(vmCtx.__text)) {
        for (const phrase of referenceKeys) {
            const expected = (phrase.match(placeholderPattern) || []).sort();
            const actual = (vmCtx.__text[locale][phrase].match(placeholderPattern) || []).sort();
            assert.deepEqual(actual, expected, `${locale} preserves placeholders in ${JSON.stringify(phrase)}`);
        }
    }
});

// Product names and terms that established localizations legitimately keep
// identical to English. Every other match is an untranslated key: locales built
// from RR_ADDITIONAL_LOCALES inherit the English table, so a key added without a
// translation renders in English instead of failing loudly.
const IDENTICAL_TO_ENGLISH_BY_DESIGN = [
    'app.title', 'about.version', 'about.steam', 'about.youtube',
    'about.rarelyTypicalPlayers', 'common.ok'
];

// Focused features may intentionally use I18nManager's English fallback until
// translated catalogs are available. Listing them keeps that fallback visible.
const ENGLISH_FALLBACK_KEYS = [
    'options.databaseListLabels',
    'options.databaseListLabelsEditorFirst',
    'options.databaseListLabelsGameFirst',
    'options.databaseListLabelsGameOnly',
    'options.databaseListLabelsNote'
];

const LOANWORDS_BY_LOCALE = {
    es: ['event.actor', 'event.dir', 'event.normal', 'event.tile', 'event.variable', 'forge.tab.procedural', 'mapProps.tileset', 'mapProps.vol', 'menu.tilesets', 'options.editor', 'theme.cascadia.name', 'toolbar.tileset', 'toolbar.title.plugins', 'workspace.zoom'],
    pt: ['audio.volume', 'event.item', 'event.normal', 'event.tile', 'forge.tab.procedural', 'mapProps.sizeRange', 'mapProps.tileset', 'menu.classes', 'menu.tilesets', 'options.editor', 'toolbar.tileset', 'workspace.zoom'],
    de: ['audio.me', 'audio.pause', 'db.system1', 'db.system2', 'efk.frame', 'efk.framesLabel', 'efk.pause', 'event.index', 'event.normal', 'event.parallel', 'event.position', 'event.variable', 'forge.frame', 'mapProps.pause', 'mapProps.tileset', 'menu.system', 'menu.tilesets', 'options.editor', 'options.palette', 'toolbar.tileset', 'workspace.zoom'],
    fr: ['audio.pause', 'audio.volume', 'efk.orientation', 'efk.pause', 'event.conditions', 'event.image', 'event.normal', 'event.options', 'event.page', 'mapProps.note', 'mapProps.pause', 'menu.animations', 'menu.classes', 'menu.forge', 'menu.tilesets', 'menu.types', 'options.mode', 'options.palette', 'options.title'],
    it: ['audio.volume', 'event.dir', 'event.pattern', 'event.tile', 'mapProps.loopX', 'mapProps.loopY', 'mapProps.tileset', 'mapProps.vol', 'menu.database', 'menu.file', 'options.editor', 'theme.cascadia.name', 'toolbar.tileset', 'toolbar.title.database', 'workspace.zoom'],
    pl: ['db.system1', 'db.system2', 'mapProps.tileset', 'menu.system', 'theme.cascadia.name', 'theme.ocean.name', 'toolbar.tileset'],
    id: ['audio.pan', 'audio.pitch', 'audio.volume', 'efk.frame', 'event.item', 'event.normal', 'event.tile', 'forge.frame', 'mapProps.loopX', 'mapProps.loopY', 'mapProps.pan', 'mapProps.pitch', 'mapProps.tileset', 'mapProps.vol', 'menu.database', 'menu.file', 'options.editor', 'options.mode', 'theme.cascadia.name', 'toolbar.tileset', 'toolbar.title.database', 'workspace.zoom'],
    vi: ['audio.pan', 'mapProps.pan', 'mapProps.tileset', 'theme.cascadia.name', 'toolbar.tileset'],
    tr: ['event.normal', 'theme.cascadia.name']
};

test('no locale silently renders an untranslated English string', () => {
    const { RR_LANGUAGES, RR_I18N_STRINGS } = loadI18nForTest();
    const english = RR_I18N_STRINGS.en;
    const englishKeys = Object.keys(english);
    const untranslated = [];

    for (const { id } of RR_LANGUAGES) {
        if (id === 'en') continue;
        const allowed = new Set([
            ...IDENTICAL_TO_ENGLISH_BY_DESIGN,
            ...ENGLISH_FALLBACK_KEYS,
            ...(LOANWORDS_BY_LOCALE[id] || [])
        ]);
        const table = RR_I18N_STRINGS[id] || {};
        for (const key of englishKeys) {
            // Digit- and symbol-only values carry no language to translate.
            if (!/[a-zA-Z]/.test(String(english[key]))) continue;
            if (table[key] === english[key] && !allowed.has(key)) {
                untranslated.push(`${id}: ${key} = ${JSON.stringify(english[key])}`);
            }
        }
    }

    assert.deepEqual(untranslated, [],
        `add translations, or list the key in LOANWORDS_BY_LOCALE if it is identical by design:\n${untranslated.join('\n')}`);
});

test('the English-fallback allowlist stays pruned', () => {
    const { RR_I18N_STRINGS } = loadI18nForTest();
    const english = RR_I18N_STRINGS.en;
    const stale = [];

    for (const [locale, keys] of Object.entries(LOANWORDS_BY_LOCALE)) {
        for (const key of keys) {
            if (RR_I18N_STRINGS[locale]?.[key] !== english[key]) stale.push(`${locale}: ${key}`);
        }
    }

    assert.deepEqual(stale, [],
        `these keys are now translated — remove them from LOANWORDS_BY_LOCALE:\n${stale.join('\n')}`);
});

test('Terms array labels are translated in every non-English locale', () => {
    const { RR_LANGUAGES, manager } = loadI18nForTest();
    const labels = [
        'Magic Attack', 'Magic Defense', 'Hit', 'Fight', 'Game End',
        'Optimize', 'New Game', 'Continue', 'Level (Abbreviation)',
        'HP (Abbreviation)', 'MP (Abbreviation)', 'EXP (Abbreviation)',
        'Buy', 'Sell'
    ];
    for (const { id } of RR_LANGUAGES) {
        if (id === 'en') continue;
        manager.setLanguage(id, { persist: false });
        for (const label of labels) {
            assert.notEqual(manager.tText(label), label, `${id} translates Terms label ${label}`);
        }
    }
});

const REVIEWED_CATALOG_NAMES = ['text', 'keyed', 'commands', 'sections'];
const sortedKeys = object => Array.from(Object.keys(object)).sort();

test('reviewed catalogs exactly cover every supported non-English locale', () => {
    const { RR_LANGUAGES, reviewed } = loadI18nForTest();
    const expectedLocales = Array.from(RR_LANGUAGES, ({ id }) => id)
        .filter(id => id !== 'en')
        .sort();

    assert.deepEqual(sortedKeys(reviewed), [...REVIEWED_CATALOG_NAMES].sort());
    for (const catalog of REVIEWED_CATALOG_NAMES) {
        assert.deepEqual(
            sortedKeys(reviewed[catalog]),
            expectedLocales,
            `${catalog} has exactly the supported non-English locales`
        );
    }
});

test('every reviewed translation wins over generated and legacy catalogs', () => {
    const { reviewed, catalogs } = loadI18nForTest();

    for (const catalog of REVIEWED_CATALOG_NAMES) {
        for (const [locale, translations] of Object.entries(reviewed[catalog])) {
            for (const [key, expected] of Object.entries(translations)) {
                assert.equal(
                    catalogs[catalog][locale][key],
                    expected,
                    `${catalog}[${locale}][${JSON.stringify(key)}] uses reviewed text`
                );
            }
        }
    }
});

test('reviewed translations preserve interpolation placeholders', () => {
    const { reviewed, catalogs } = loadI18nForTest();
    const placeholders = text =>
        (String(text).match(/\{[A-Za-z_][A-Za-z0-9_]*\}|%[1-9]\d*/g) || []).sort();

    for (const catalog of REVIEWED_CATALOG_NAMES) {
        for (const [locale, translations] of Object.entries(reviewed[catalog])) {
            for (const [key, translated] of Object.entries(translations)) {
                const source = catalog === 'keyed' ? catalogs.keyed.en[key] : key;
                assert.equal(typeof source, 'string', `${key} has an English source`);
                assert.deepEqual(
                    placeholders(translated),
                    placeholders(source),
                    `${catalog}[${locale}][${JSON.stringify(key)}] preserves placeholders`
                );
            }
        }
    }
});

test('known Greek fallback values do not leak into corrected locales', () => {
    const { catalogs } = loadI18nForTest();
    const affectedLocales = ['ko', 'it', 'pl', 'ar', 'tr', 'id', 'vi', 'th'];
    const badValues = {
        'toolbar.title.heightBrush': 'Πινέλο ύψους (ζωγραφίζει το υψόμετρο για χάρτες 3D)',
        'toolbar.height': 'Ύψος:',
        'toolbar.height.set': 'Ορισμός σε',
        'toolbar.height.raise': 'Ανύψωση',
        'toolbar.height.lower': 'Χαμήλωμα'
    };

    for (const locale of affectedLocales) {
        for (const [key, badValue] of Object.entries(badValues)) {
            assert.notEqual(
                catalogs.keyed[locale][key],
                badValue,
                `${locale} does not inherit Greek text for ${key}`
            );
        }
    }
});

test('reviewed Thai translations use normalized orthography', () => {
    const { reviewed } = loadI18nForTest();
    const decomposedSaraAm = '\u0E4D\u0E32';

    for (const catalog of REVIEWED_CATALOG_NAMES) {
        for (const [key, value] of Object.entries(reviewed[catalog].th)) {
            assert.equal(value.normalize('NFC'), value, `${catalog}.th[${JSON.stringify(key)}] is NFC`);
            assert.equal(
                value.includes(decomposedSaraAm),
                false,
                `${catalog}.th[${JSON.stringify(key)}] uses U+0E33 instead of U+0E4D U+0E32`
            );
        }
    }
});

test('reviewed Polish covers every event command and section', () => {
    const { reviewed, catalogs } = loadI18nForTest();
    const unionKeys = tables => Array.from(new Set(
        Object.values(tables).flatMap(table => Object.keys(table))
    )).sort();

    for (const catalog of ['commands', 'sections']) {
        assert.deepEqual(
            sortedKeys(reviewed[catalog].pl),
            unionKeys(catalogs[catalog]),
            `reviewed Polish ${catalog} covers the complete catalog`
        );
    }
});
