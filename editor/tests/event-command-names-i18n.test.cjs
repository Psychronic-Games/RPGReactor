// Every command and section the event picker offers must translate in every
// locale. The Reactor tab's commands are named in the picker's own table, not
// through tText, so the general i18n gate never saw them: a Chinese user found
// six quest and media surface commands still in English after 0.98.6. The
// reviewed tables load before the manager and are merged over the base tables
// at startup, so this loads them in the app's order.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');

function tables() {
    const context = vm.createContext({ window: {}, document: {}, navigator: { language: 'en' }, localStorage: { getItem: () => null, setItem() {} }, console });
    for (const file of ['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    return vm.runInContext('({ commands: RR_EVENT_COMMAND_NAMES, sections: RR_EVENT_SECTION_NAMES, text: RR_TEXT_TRANSLATIONS, languages: RR_LANGUAGES })', context);
}

test('every picker command and section title translates in every locale', () => {
    const picker = read('src/event/EventCommandPicker.js');
    const names = [...picker.matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*code:\s*(\d+)/g)].map(m => m[1]);
    const sections = [...new Set([...picker.matchAll(/(?:title|name):\s*'([^']+)'/g)].map(m => m[1]).filter(s => !names.includes(s)))];
    assert.ok(names.length > 100 && sections.includes('Reactor') && sections.includes('Lighting'), `the picker was read (${names.length} commands, ${sections.length} sections)`);
    const { commands, sections: sectionNames, text, languages } = tables();
    const locales = languages.map(l => l.id).filter(id => id !== 'en');
    const missing = [];
    for (const locale of locales) {
        const resolves = (table, key) => (table[locale] && table[locale][key]) || (text[locale] && text[locale][key]);
        for (const name of names) if (!resolves(commands, name)) missing.push(`${locale}: command "${name}"`);
        for (const section of sections) if (!resolves(sectionNames, section)) missing.push(`${locale}: section "${section}"`);
    }
    assert.deepEqual(missing, [], 'untranslated picker entries');
});

test('the six commands the user reported are named in every locale', () => {
    const { commands, languages } = tables();
    for (const locale of languages.map(l => l.id).filter(id => id !== 'en')) {
        for (const name of ['Quest Objective', 'Quest Reward', 'Open Quest Log', 'Show Media Surface', 'Transform Media Surface', 'Stop Media Surface']) {
            assert.ok(commands[locale][name] && commands[locale][name] !== name, `${locale}: ${name}`);
        }
    }
    assert.equal(commands['zh-Hans']['Show Media Surface'], '显示媒体表面', "the Simplified Chinese wording is the user's");
});

test("the Reactor tab keeps the engine's name, qualified where a Latin word would stand alone", () => {
    const { sections, text } = tables();
    for (const locale of ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'th', 'ar', 'ru', 'el']) {
        assert.ok(sections[locale].Reactor.includes('Reactor') && sections[locale].Reactor !== 'Reactor', `${locale} qualifies the tab`);
        assert.equal(text[locale].Reactor, sections[locale].Reactor, `${locale}: the Conditional Branch tab says the same`);
    }
    assert.equal(sections['zh-Hans'].Reactor, 'Reactor 扩展', "the Simplified Chinese wording is the user's");
    for (const locale of ['de', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'id', 'vi']) assert.equal(sections[locale].Reactor, 'Reactor', `${locale} keeps the name alone`);
});
