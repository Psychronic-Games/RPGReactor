const fs = require('node:fs');
const path = require('node:path');

const CALL_PATTERN = /(?:\b(?:window\.)?I18n(?:\?\.|\.)tText|(?:\bthis\.)?(_tt|tt|_tx|_t)|(?:\bthis\.)?_(?:createDialog|btn|checkbox|labeledInput|labeledSelect|labeledRange))\s*\(/g;
const CATALOG_PROPERTIES = ['label', 'title', 'hint', 'name', 'description'];

function skipSpaceAndComments(source, start) {
    let index = start;
    while (index < source.length) {
        if (/\s/.test(source[index])) {
            index++;
        } else if (source.startsWith('//', index)) {
            index = source.indexOf('\n', index + 2);
            if (index === -1) return source.length;
        } else if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            return end === -1 ? source.length : skipSpaceAndComments(source, end + 2);
        } else {
            break;
        }
    }
    return index;
}

function decodeEscape(source, index) {
    const char = source[index];
    const simple = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '0': '\0' };
    if (Object.hasOwn(simple, char)) return { value: simple[char], end: index + 1 };
    if (char === '\n') return { value: '', end: index + 1 };
    if (char === '\r') return { value: '', end: source[index + 1] === '\n' ? index + 2 : index + 1 };
    if (char === 'x' && /^[0-9a-fA-F]{2}$/.test(source.slice(index + 1, index + 3))) {
        return { value: String.fromCharCode(parseInt(source.slice(index + 1, index + 3), 16)), end: index + 3 };
    }
    if (char === 'u' && source[index + 1] === '{') {
        const close = source.indexOf('}', index + 2);
        const code = close === -1 ? '' : source.slice(index + 2, close);
        if (/^[0-9a-fA-F]{1,6}$/.test(code)) return { value: String.fromCodePoint(parseInt(code, 16)), end: close + 1 };
    }
    if (char === 'u' && /^[0-9a-fA-F]{4}$/.test(source.slice(index + 1, index + 5))) {
        return { value: String.fromCharCode(parseInt(source.slice(index + 1, index + 5), 16)), end: index + 5 };
    }
    return { value: char, end: index + 1 };
}

function readStaticLiteral(source, start) {
    const index = skipSpaceAndComments(source, start);
    const quote = source[index];
    if (quote !== "'" && quote !== '"' && quote !== '`') return null;

    let value = '';
    let cursor = index + 1;
    while (cursor < source.length) {
        const char = source[cursor];
        if (char === quote) return { value, start: index, end: cursor + 1 };
        if (quote === '`' && char === '$' && source[cursor + 1] === '{') return null;
        if (char === '\\') {
            if (cursor + 1 >= source.length) return null;
            const decoded = decodeEscape(source, cursor + 1);
            value += decoded.value;
            cursor = decoded.end;
        } else {
            value += char;
            cursor++;
        }
    }
    return null;
}

function lineNumberAt(source, index) {
    let line = 1;
    for (let cursor = source.indexOf('\n'); cursor !== -1 && cursor < index; cursor = source.indexOf('\n', cursor + 1)) line++;
    return line;
}

function isEnglishPhrase(value) {
    return value.trim().length > 0 && /[A-Za-z]/.test(value);
}

function addOccurrence(inventory, phrase, sourcePath, source, index) {
    if (!isEnglishPhrase(phrase)) return;
    if (!inventory.has(phrase)) inventory.set(phrase, new Set());
    inventory.get(phrase).add(`${sourcePath}:${lineNumberAt(source, index)}`);
}

function findMatchingBracket(source, start, open = '[', close = ']') {
    let depth = 0;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        if (char === "'" || char === '"' || char === '`') {
            const literal = readStaticLiteral(source, index);
            if (!literal) return -1;
            index = literal.end - 1;
        } else if (source.startsWith('//', index)) {
            const end = source.indexOf('\n', index + 2);
            if (end === -1) return -1;
            index = end;
        } else if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            if (end === -1) return -1;
            index = end + 1;
        } else if (char === open) {
            depth++;
        } else if (char === close && --depth === 0) {
            return index;
        }
    }
    return -1;
}

function aliasMapsToText(source, alias) {
    const name = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const declaration = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`, 'g');
    let match;
    while ((match = declaration.exec(source)) !== null) {
        const end = source.indexOf(';', declaration.lastIndex);
        const body = source.slice(declaration.lastIndex, end === -1 ? declaration.lastIndex + 1000 : end);
        if (/\bI18n(?:\?\.|\.)tText\s*\(/.test(body)) return true;
    }

    const method = new RegExp(`(?:\\bfunction\\s+)?\\b${name}\\s*\\([^)]*\\)\\s*\\{`, 'g');
    while ((match = method.exec(source)) !== null) {
        const open = source.indexOf('{', match.index);
        const close = findMatchingBracket(source, open, '{', '}');
        if (close !== -1 && /\bI18n(?:\?\.|\.)tText\s*\(/.test(source.slice(open + 1, close))) return true;
    }
    return false;
}

function enabledAliases(source) {
    return new Set(['tt', '_tt', '_tx', '_t'].filter(alias => aliasMapsToText(source, alias)));
}

function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function addLiteralsInRange(inventory, source, sourcePath, start, end) {
    for (let index = start; index < end; index++) {
        if (source[index] !== "'" && source[index] !== '"' && source[index] !== '`') continue;
        const literal = readStaticLiteral(source, index);
        if (!literal) continue;
        addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
        index = literal.end - 1;
    }
}

function aliasCallExpression(aliases) {
    const names = Array.from(aliases, name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return names.length ? `(?:this\\.)?(?:${names.join('|')})` : '(?!)';
}

function addNamedArrayCatalogs(inventory, source, sourcePath, aliases) {
    const aliasCall = aliasCallExpression(aliases);
    const catalogNames = new Set();

    for (const regex of [
        new RegExp(`${aliasCall}\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\[`, 'g'),
        new RegExp(`([A-Za-z_$][\\w$]*)\\.(?:forEach|map)\\(\\s*\\(?\\s*([A-Za-z_$][\\w$]*)[\\s\\S]{0,1200}?${aliasCall}\\(\\s*\\2\\s*\\)`, 'g')
    ]) {
        let match;
        while ((match = regex.exec(source)) !== null) catalogNames.add(match[1]);
    }

    const declaration = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
    let match;
    while ((match = declaration.exec(source)) !== null) {
        const open = source.indexOf('[', match.index);
        const close = findMatchingBracket(source, open);
        if (close === -1) continue;
        const suffix = source.slice(close + 1, close + 500);
        const mapsThroughAlias = new RegExp(`^\\s*\\.map\\(\\s*(?:${aliasCall}\\b|(?:\\(?\\s*([A-Za-z_$][\\w$]*)[^=]*=>[\\s\\S]{0,300}?${aliasCall}\\(\\s*\\1\\s*\\)))`).test(suffix);
        if (catalogNames.has(match[1]) || mapsThroughAlias) addLiteralsInRange(inventory, source, sourcePath, open + 1, close);
        declaration.lastIndex = close + 1;
    }

    const literalArray = /\[\s*['"`]/g;
    while ((match = literalArray.exec(source)) !== null) {
        const open = match.index;
        const close = findMatchingBracket(source, open);
        if (close === -1) continue;
        const suffix = source.slice(close + 1, close + 500);
        const mapsThroughAlias = new RegExp(`^\\s*\\.map\\(\\s*(?:${aliasCall}\\b|\\(?\\s*([A-Za-z_$][\\w$]*)[^=]*=>[\\s\\S]{0,300}?${aliasCall}\\(\\s*\\1\\s*\\))`).test(suffix);
        if (mapsThroughAlias) addLiteralsInRange(inventory, source, sourcePath, open + 1, close);
        literalArray.lastIndex = close + 1;
    }
}

function addNamedObjectCatalogs(inventory, source, sourcePath, aliases) {
    const aliasCall = aliasCallExpression(aliases);
    const catalogNames = new Set();
    const consumption = new RegExp(`${aliasCall}\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\[`, 'g');
    let match;
    while ((match = consumption.exec(source)) !== null) catalogNames.add(match[1]);
    if (catalogNames.size === 0) return;

    const declaration = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
    while ((match = declaration.exec(source)) !== null) {
        if (!catalogNames.has(match[1])) continue;
        const open = source.indexOf('{', match.index);
        const close = findMatchingBracket(source, open, '{', '}');
        if (close === -1) continue;
        addLiteralsInRange(inventory, source, sourcePath, open + 1, close);
        declaration.lastIndex = close + 1;
    }
}

function isCatalogSource(sourcePath) {
    return sourcePath.startsWith('src/database/') ||
        sourcePath === 'src/DatabaseEditorUI.js' ||
        sourcePath === 'src/forge/SoundEffectGenerator/SoundEffectGenerator.js';
}

function addConsumedPropertyCatalogs(inventory, source, sourcePath, aliases) {
    if (!isCatalogSource(sourcePath)) return;
    const aliasCall = aliasCallExpression(aliases);
    const consumed = new Set();
    const consumption = new RegExp(`${aliasCall}\\(\\s*[A-Za-z_$][\\w$]*\\.(label|title|hint|name|description)\\b`, 'g');
    let match;
    while ((match = consumption.exec(source)) !== null) consumed.add(match[1]);

    // Archetype categories are assigned to a local before translation at render time.
    if (sourcePath.endsWith('/SoundEffectGenerator.js')) consumed.add('category');
    if (consumed.size === 0) return;

    const property = new RegExp(`(?:^|[,{]\\s*)(${[...CATALOG_PROPERTIES, 'category'].join('|')})\\s*:\\s*`, 'gm');
    while ((match = property.exec(source)) !== null) {
        if (!consumed.has(match[1])) continue;
        const literal = readStaticLiteral(source, property.lastIndex);
        if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
    }
}

function pathCatalogProperties(sourcePath) {
    if (sourcePath.startsWith('src/forge/CharacterGenerator/styles/')) return ['name', 'category'];
    if (sourcePath === 'src/forge/CharacterGenerator/CharacterGenerator.js') return ['name'];
    if (sourcePath.startsWith('src/forge/CharacterGenerator/procgen/')) return ['name', 'category', 'label'];
    if (sourcePath.startsWith('src/forge/AnimationGenerator/')) return ['name', 'label', 'description'];
    if (sourcePath.startsWith('src/forge/EffekseerGenerator/recipes/')) return ['name', 'label', 'description'];
    return [];
}

function addPathPropertyCatalogs(inventory, source, sourcePath) {
    const properties = pathCatalogProperties(sourcePath);
    if (properties.length === 0) return;
    const property = new RegExp(`(?:^|[,{]\\s*)(${properties.join('|')})\\s*:\\s*`, 'gm');
    let match;
    while ((match = property.exec(source)) !== null) {
        const literal = readStaticLiteral(source, property.lastIndex);
        if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
    }
}

function inventoryLocalizationSource(source, sourcePath = '<source>') {
    const inventory = new Map();
    const aliases = enabledAliases(source);
    let match;
    CALL_PATTERN.lastIndex = 0;
    while ((match = CALL_PATTERN.exec(source)) !== null) {
        if (match[1] && !aliases.has(match[1])) continue;
        const literal = readStaticLiteral(source, CALL_PATTERN.lastIndex);
        if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
    }
    addNamedArrayCatalogs(inventory, source, sourcePath, aliases);
    addNamedObjectCatalogs(inventory, source, sourcePath, aliases);
    addConsumedPropertyCatalogs(inventory, source, sourcePath, aliases);
    addPathPropertyCatalogs(inventory, source, sourcePath);
    return inventory;
}

function mergeInventory(target, source) {
    for (const [phrase, locations] of source) {
        if (!target.has(phrase)) target.set(phrase, new Set());
        for (const location of locations) target.get(phrase).add(location);
    }
}

function editorSourceFiles(editorRoot) {
    const files = [path.join(editorRoot, 'index.html')];
    const sourceRoot = path.join(editorRoot, 'src');
    const excludedDirectories = new Set(['build', 'dist', 'node_modules', 'vendor']);

    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name))) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory() && !excludedDirectories.has(entry.name)) visit(fullPath);
            if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'I18nManager.js') files.push(fullPath);
        }
    }
    visit(sourceRoot);
    return files;
}

function inventoryEditorLocalization(editorRoot) {
    const inventory = new Map();
    for (const file of editorSourceFiles(editorRoot)) {
        const sourcePath = path.relative(editorRoot, file).split(path.sep).join('/');
        mergeInventory(inventory, inventoryLocalizationSource(fs.readFileSync(file, 'utf8'), sourcePath));
    }
    return Array.from(inventory, ([phrase, locations]) => ({
        phrase,
        sources: Array.from(locations).sort()
    })).sort((a, b) => compareText(a.phrase, b.phrase));
}

function auditTextTranslationCoverage(editorRoot, translationKeys) {
    const inventory = inventoryEditorLocalization(editorRoot);
    const known = translationKeys instanceof Set ? translationKeys : new Set(translationKeys);
    return {
        inventory,
        inventoryCount: inventory.length,
        missing: inventory.filter(entry => !known.has(entry.phrase))
    };
}

function formatMissingPhrases(missing) {
    if (missing.length === 0) return '';
    return `Missing RR_TEXT_TRANSLATIONS source phrases (${missing.length}):\n` + missing.map(entry =>
        `${JSON.stringify(entry.phrase)}\n${entry.sources.map(source => `  ${source}`).join('\n')}`
    ).join('\n');
}

module.exports = {
    auditTextTranslationCoverage,
    editorSourceFiles,
    formatMissingPhrases,
    inventoryEditorLocalization,
    inventoryLocalizationSource
};
