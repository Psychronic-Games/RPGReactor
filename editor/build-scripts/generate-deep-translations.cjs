const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { auditTextTranslationCoverage } = require('../tests/helpers/i18n-source-audit.cjs');

const editorRoot = path.resolve(__dirname, '..');
const managerPath = path.join(editorRoot, 'src', 'I18nManager.js');
const outputPath = path.join(editorRoot, 'src', 'I18nDeepTranslations.js');
const locales = {
    ja: 'ja', es: 'es', 'zh-Hant': 'zh-Hant', 'zh-Hans': 'zh-Hans', ru: 'ru',
    pt: 'pt', de: 'de', fr: 'fr', el: 'el', ko: 'ko', ar: 'ar', it: 'it',
    pl: 'pl', id: 'id', vi: 'vi', th: 'th', tr: 'tr'
};

function loadBaseTranslations() {
    const source = fs.readFileSync(managerPath, 'utf8');
    const context = { globalThis: {} };
    vm.createContext(context);
    vm.runInContext(
        source.slice(0, source.indexOf('// The broad database/event/Forge pass')) +
        ';__text = RR_TEXT_TRANSLATIONS;',
        context
    );
    return context.__text;
}

function loadExistingTranslations() {
    if (!fs.existsSync(outputPath)) return {};
    const context = {};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(outputPath, 'utf8') + ';__deep = RR_DEEP_TEXT_TRANSLATIONS;', context);
    return context.__deep;
}

function protectPlaceholders(phrase) {
    const placeholders = [];
    const text = phrase.replace(/\{[^{}]+\}|%[1-9](?!\d)/g, token => {
        const marker = `__RRPH${placeholders.length}__`;
        placeholders.push([marker, token]);
        return marker;
    });
    return { text, placeholders };
}

function restorePlaceholders(text, placeholders) {
    let restored = text;
    for (const [marker, token] of placeholders) {
        const flexibleMarker = new RegExp(marker.split('').join('\\s*'), 'gi');
        restored = restored.replace(flexibleMarker, token);
    }
    return restored;
}

function chunks(items, maxCharacters = 40000, maxItems = 100) {
    const result = [];
    let chunk = [];
    let size = 0;
    for (const item of items) {
        const nextSize = item.text.length;
        if (chunk.length && (size + nextSize > maxCharacters || chunk.length >= maxItems)) {
            result.push(chunk);
            chunk = [];
            size = 0;
        }
        chunk.push(item);
        size += nextSize;
    }
    if (chunk.length) result.push(chunk);
    return result;
}

async function translateChunk(items, target, token, attempt = 1) {
    try {
        const endpoint = `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=${encodeURIComponent(target)}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify(items.map(item => ({ Text: item.text })))
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.length !== items.length) {
            throw new Error(`expected ${items.length} results, received ${data.length}`);
        }
        return data.map((result, index) => {
            const text = result.translations?.[0]?.text;
            if (typeof text !== 'string') throw new Error(`missing translation result ${index}`);
            return restorePlaceholders(text.trim(), items[index].placeholders);
        });
    } catch (error) {
        if (attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        return translateChunk(items, target, token, attempt + 1);
    }
}

function assertPlaceholders(source, translated, locale) {
    const pattern = /\{[^{}]+\}|%[1-9](?!\d)/g;
    const expected = (source.match(pattern) || []).sort();
    const actual = (translated.match(pattern) || []).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${locale} changed placeholders in ${JSON.stringify(source)}`);
    }
}

async function main() {
    const base = loadBaseTranslations();
    const audit = auditTextTranslationCoverage(editorRoot, new Set(Object.keys(base.ja)));
    const phrases = audit.missing.map(entry => entry.phrase);
    if (!phrases.length) {
        console.log('Deep translation catalog is already complete.');
        return;
    }

    const catalog = {};
    const existing = loadExistingTranslations();
    let token = null;
    for (const [locale, target] of Object.entries(locales)) {
        const newPhrases = phrases.filter(phrase => !Object.hasOwn(existing[locale] || {}, phrase));
        const protectedPhrases = newPhrases.map(protectPlaceholders);
        const translated = [];
        const batches = chunks(protectedPhrases);
        if (batches.length && !token) {
            const tokenResponse = await fetch('https://edge.microsoft.com/translate/auth');
            if (!tokenResponse.ok) throw new Error(`translation authentication failed: HTTP ${tokenResponse.status}`);
            token = await tokenResponse.text();
        }
        for (let index = 0; index < batches.length; index++) {
            process.stdout.write(`${locale}: ${index + 1}/${batches.length}\r`);
            translated.push(...await translateChunk(batches[index], target, token));
        }
        process.stdout.write(`${locale}: ${batches.length}/${batches.length} (${newPhrases.length} new)\n`);
        const generated = {};
        newPhrases.forEach((phrase, index) => {
            assertPlaceholders(phrase, translated[index], locale);
            generated[phrase] = translated[index];
        });
        catalog[locale] = {};
        phrases.forEach(phrase => {
            catalog[locale][phrase] = existing[locale]?.[phrase] ?? generated[phrase];
        });
    }

    const output = `// Generated by build-scripts/generate-deep-translations.cjs.\n` +
        `// Machine-assisted first pass; source phrases are enforced by tests.\n` +
        `globalThis.RR_DEEP_TEXT_TRANSLATIONS = ${JSON.stringify(catalog, null, 2)};\n`;
    fs.writeFileSync(outputPath, output);
    console.log(`Wrote ${phrases.length} phrases x ${Object.keys(locales).length} locales to ${path.relative(editorRoot, outputPath)}.`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
