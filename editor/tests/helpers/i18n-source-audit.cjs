const fs = require('node:fs');
const path = require('node:path');

// `t` and `text` count only where the file defines them over tText, and never
// after a member dot (I18n.t('key') is keyed, ui.text(...) is a widget).
const CALL_PATTERN = /(?:\b(?:window\.)?I18n(?:\?\.|\.)tText|(?:\bthis\.)?(_tt|tt|_tx|_t)|(?:(?<![\w$.])|\bthis\.)(t|text)|(?:\bthis\.)?_(?:createDialog|btn|checkbox|labeledInput|labeledSelect|labeledRange))\s*\(/g;
const TEXT_ALIASES = ['tt', '_tt', '_tx', '_t', 't', 'text'];
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

// Template interpolation is dynamic text, but it still has to be skipped
// while finding a method's closing brace. Returning early hid entire helpers.
function skipTemplate(source, start) {
    for (let i = start + 1; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '`') return i;
        if (source[i] === '$' && source[i + 1] === '{') {
            i = findMatchingBracket(source, i + 1, '{', '}');
            if (i < 0) return -1;
        }
    }
    return -1;
}

function findMatchingBracket(source, start, open = '[', close = ']') {
    let depth = 0;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        if (char === "'" || char === '"' || char === '`') {
            const literal = readStaticLiteral(source, index);
            if (!literal) {
                if (char !== '`') return -1;
                index = skipTemplate(source, index);
                if (index < 0) return -1;
            } else index = literal.end - 1;
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
        const open = method.lastIndex - 1;
        const close = findMatchingBracket(source, open, '{', '}');
        if (close !== -1 && /\bI18n(?:\?\.|\.)tText\s*\(/.test(source.slice(open + 1, close))) return true;
    }
    return false;
}

function enabledAliases(source) {
    return new Set(TEXT_ALIASES.filter(alias => aliasMapsToText(source, alias)));
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
    // Any editor file that translates `x.label` (or title, hint …) holds its
    // catalog of those properties; the importer's own data is not UI text.
    return (sourcePath.startsWith('src/') && !sourcePath.startsWith('src/legacy/')) ||
        sourcePath.startsWith('src/database/') ||
        sourcePath === 'src/DatabaseEditorUI.js' ||
        sourcePath === 'src/ResourceManager.js' ||
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
    if (sourcePath === 'src/database/ModelRigger.js') return ['label'];
    if (sourcePath.startsWith('src/forge/CharacterGenerator/styles/')) return ['name', 'category'];
    if (sourcePath === 'src/forge/CharacterGenerator/CharacterGenerator.js') return ['name'];
    if (sourcePath.startsWith('src/forge/CharacterGenerator/procgen/')) return ['name', 'category', 'label'];
    if (sourcePath.startsWith('src/forge/AnimationGenerator/')) return ['name', 'label', 'description'];
    if (sourcePath.startsWith('src/forge/EffekseerGenerator/recipes/')) return ['name', 'label', 'description'];
    return [];
}

// Labels a file translates through its own helper at render time: the
// Resource Manager's folder labels (image('id', 'Label', …)) and the fixed
// labels it localizes on show (data-rr-text / data-rr-aria).
const PATH_LABEL_PATTERNS = {
    'src/ResourceManager.js': [
        /\bimage\(\s*'[^']*'\s*,\s*/g, /\bdata-rr-(?:text|aria)="/g, /\bemptyNote\(\s*/g,
        /\[(?=\s*'[A-Z][A-Za-z ]+',\s*(?:record\.|ResourceManager\.|dimensions\]))\s*/g
    ]
};

// countText(count, 'one …', 'many …') phrases: both forms are text.
function addCountTextCalls(inventory, source, sourcePath) {
    const calls = /\bcountText\s*\(/g;
    let match;
    while ((match = calls.exec(source)) !== null) {
        const args = callArguments(source, calls.lastIndex);
        for (const arg of args.slice(1, 3)) {
            const literal = readStaticLiteral(source, arg[0]);
            if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
        }
    }
}

function addPathLabelPatterns(inventory, source, sourcePath) {
    for (const pattern of PATH_LABEL_PATTERNS[sourcePath] || []) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(source)) !== null) {
            if (match[0].endsWith('"')) {
                const end = source.indexOf('"', pattern.lastIndex);
                if (end !== -1) addOccurrence(inventory, source.slice(pattern.lastIndex, end), sourcePath, source, pattern.lastIndex);
                continue;
            }
            const literal = readStaticLiteral(source, pattern.lastIndex);
            if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
        }
    }
}

function addPathPropertyCatalogs(inventory, source, sourcePath) {
    addPathLabelPatterns(inventory, source, sourcePath);
    addCountTextCalls(inventory, source, sourcePath);
    const properties = pathCatalogProperties(sourcePath);
    if (properties.length === 0) return;
    const property = new RegExp(`(?:^|[,{]\\s*)(${properties.join('|')})\\s*:\\s*`, 'gm');
    let match;
    while ((match = property.exec(source)) !== null) {
        const literal = readStaticLiteral(source, property.lastIndex);
        if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
    }
}

// Shared battle widgets translate labels internally; do not mistake CSS classes,
// enum IDs or project-authored option names for UI text.
function callArguments(source, start) {
    const args=[];let begin=start;
    for(let i=start;i<source.length;i++){
        const c=source[i];
        if(c==='"'||c==="'"||c==='`'){const literal=readStaticLiteral(source,i);i=literal?literal.end-1:skipTemplate(source,i);if(i<0)break;}
        else if('([{'.includes(c)){i=findMatchingBracket(source,i,c,{'(':')','[':']','{':'}'}[c]);if(i<0)break;}
        else if(c===','||c===')'){args.push([begin,i]);begin=i+1;if(c===')')break;}
    }
    return args;
}
function addBattleWidgets(inventory, source, sourcePath) {
    const battle=/^src\/(?:battle\/BattlePresentationEditor|database\/(?:DatabaseActionSequenceEditor|ActionSequencePreview))\.js$/.test(sourcePath);
    const media=sourcePath==='src/MediaSurfaceManager.js';
    if(!battle&&!media)return;
    const calls=/\b(?:this(?:\.ui)?|U|e\.ui)\.(text|message|button|section|element|field|number|select|setText|t)\s*\(/g;
    let m;
    while((m=calls.exec(source))){
        const args=callArguments(source,calls.lastIndex),method=m[1];
        const index=method==='element'?2:['field','number','setText'].includes(method)?1:0;
        if(method==='select'){
            const range=args[0];if(!range)continue;
            const tuples=/\[\s*(?:'[^']*'|"[^"]*"|\d+)\s*,\s*/g;tuples.lastIndex=range[0];let tuple;
            while((tuple=tuples.exec(source))&&tuple.index<range[1]){const value=readStaticLiteral(source,tuples.lastIndex);if(value&&/^\s*(?:,\s*true\s*)?\]/.test(source.slice(value.end)))addOccurrence(inventory,value.value,sourcePath,source,value.start);}
        }else if(args[index]){const value=readStaticLiteral(source,args[index][0]);if(value)addOccurrence(inventory,value.value,sourcePath,source,value.start);}
    }
    // Locally declared presentation catalogs and conditional labels. Lowercase
    // storage IDs deliberately stay outside this inventory.
    const literals=/(['"`])/g;
    while((m=literals.exec(source))){const value=readStaticLiteral(source,m.index);if(!value)continue;literals.lastIndex=value.end;
        if(/^[A-Z][a-z]/.test(value.value)&&!value.value.includes(':')&&!value.value.includes('#')&&!value.value.includes('Missing ')&&!value.value.includes('Array')&&!value.value.includes('Button')&&!value.value.includes('Data')&&!value.value.includes('SequencePreview')&&!value.value.includes('Editor')&&!value.value.includes('Camera.MODES')){
            // Restrict indirect catalogs to their declaration, not diagnostics.
            const before=source.slice(Math.max(0,m.index-100),m.index);
            if(/(?:\?|:)\s*$/.test(before))addOccurrence(inventory,value.value,sourcePath,source,value.start);
        }
    }
}

// Helpers that hand one of their own parameters to a text alias
// (`_field(parent, label) { … this._t(label) … }`): a literal passed in that
// position is translated text. Returns Map(name -> Set(argument index)).
function forwardingHelpers(source, aliases) {
    const helpers = new Map();
    if (!aliases.size) return helpers;
    const aliasCall = aliasCallExpression(aliases);
    const definition = /(?:^|[\s;{}(,])(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*)?\(([^()]*)\)\s*(?:=>\s*)?\{|(?:static\s+|async\s+)?([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*\{)/g;
    let match;
    while ((match = definition.exec(source)) !== null) {
        const name = match[1] || match[3];
        if (!name || ['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with'].includes(name) || aliases.has(name)) continue;
        const params = (match[2] ?? match[4]).split(',').map(param => param.trim().replace(/\s*=.*$/, '')).filter(Boolean);
        if (!params.length || params.some(param => !/^[A-Za-z_$][\w$]*$/.test(param))) continue;
        const open = definition.lastIndex - 1;
        const close = findMatchingBracket(source, open, '{', '}');
        if (close === -1) continue;
        const body = source.slice(open + 1, close);
        params.forEach((param, index) => {
            if (new RegExp(`${aliasCall}\\(\\s*${param.replace(/\$/g, '\\$')}\\s*[),|?]`).test(body)) {
                if (!helpers.has(name)) helpers.set(name, new Set());
                helpers.get(name).add(index);
            }
        });
    }
    return helpers;
}

function addForwardedLiterals(inventory, source, sourcePath, helpers) {
    for (const [name, indexes] of helpers) {
        const call = new RegExp(`(?:(?<![\\w$.])|\\bthis\\.)${name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
        let match;
        while ((match = call.exec(source)) !== null) {
            // Skip the definition itself: `name(a, b) {`.
            const args = callArguments(source, call.lastIndex);
            const after = args.length ? source.slice(args[args.length - 1][1] + 1, args[args.length - 1][1] + 12) : '';
            if (/^\s*(?:\{|=>)/.test(after)) continue;
            for (const index of indexes) {
                if (!args[index]) continue;
                const literal = readStaticLiteral(source, args[index][0]);
                // A lone camelCase word is a key passed to a same-named static helper, not text.
                if (literal && /^[a-z][A-Za-z0-9]*$/.test(literal.value)) continue;
                if (literal && literal.end <= args[index][1] + 1 && /^\s*$/.test(source.slice(literal.end, args[index][1]))) {
                    addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
                }
            }
        }
    }
}

function inventoryLocalizationSource(source, sourcePath = '<source>', inheritedAliases = []) {
    const inventory = new Map();
    const aliases = new Set([...enabledAliases(source), ...inheritedAliases]);
    let match;
    CALL_PATTERN.lastIndex = 0;
    while ((match = CALL_PATTERN.exec(source)) !== null) {
        const alias = match[1] || match[2];
        if (alias && !aliases.has(alias)) continue;
        const literal = readStaticLiteral(source, CALL_PATTERN.lastIndex);
        if (literal) addOccurrence(inventory, literal.value, sourcePath, source, literal.start);
    }
    addBattleWidgets(inventory, source, sourcePath);
    addForwardedLiterals(inventory, source, sourcePath, forwardingHelpers(source, aliases));
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
    const files = editorSourceFiles(editorRoot).map(file => ({
        sourcePath: path.relative(editorRoot, file).split(path.sep).join('/'),
        source: fs.readFileSync(file, 'utf8')
    }));
    const classes = new Map();
    for (const file of files) {
        const match = file.source.match(/class\s+(\w+)\s+(?:extends\s+(?:\(\s*typeof\s+)?(\w+))?/);
        file.aliases = enabledAliases(file.source);
        if (match) { file.parent = match[2]; classes.set(match[1], file); }
    }
    for (let pass = 0; pass < classes.size; pass++) {
        let changed = false;
        for (const file of classes.values()) for (const alias of classes.get(file.parent)?.aliases || []) {
            const overrides = new RegExp(`(?:^|\\n)\\s*${alias}\\s*\\(`).test(file.source);
            if (!overrides && !file.aliases.has(alias)) { file.aliases.add(alias); changed = true; }
        }
        if (!changed) break;
    }
    for (const file of files) mergeInventory(inventory, inventoryLocalizationSource(file.source, file.sourcePath, file.aliases));
    // Runtime IDs stay English in saves, but templates and validation messages
    // are displayed through the editor's shared text helper.
    const battlePath=path.resolve(editorRoot,'../runtime/reactor_battle_data.js');
    if(fs.existsSync(battlePath)){
        const source=fs.readFileSync(battlePath,'utf8'),sourcePath='../runtime/reactor_battle_data.js';
        for(const match of source.matchAll(/B\.(?:templates|basicSteps)\s*=\s*\[/g)){
            const start=match.index+match[0].length-1,end=findMatchingBracket(source,start);
            addLiteralsInRange(inventory,source,sourcePath,start,end);
        }
        for(const match of source.matchAll(/errors\.push\(\s*/g)){const value=readStaticLiteral(source,match.index+match[0].length);if(value)addOccurrence(inventory,value.value,sourcePath,source,value.start);}
        // Step field labels, command names, phases, the priority chain and
        // battler states are shown through the battle widgets' text helper.
        for(const match of source.matchAll(/\b(?:n|text|pick|script|field)\('[^']*',\s*(?='[^']+')/g)){const value=readStaticLiteral(source,match.index+match[0].length);if(value)addOccurrence(inventory,value.value,sourcePath,source,value.start);}
        for(const match of source.matchAll(/\blabel:\s*(?=')/g)){const value=readStaticLiteral(source,match.index+match[0].length);if(value)addOccurrence(inventory,value.value,sourcePath,source,value.start);}
        for(const match of source.matchAll(/B\.(?:actionPhases|priorityChain|battlerStates)\s*=\s*\[/g)){
            const start=match.index+match[0].length-1,end=findMatchingBracket(source,start);
            for(const tuple of source.slice(start+1,end).matchAll(/\[\s*'[^']*'\s*,/g)){
                let at=start+1+tuple.index+tuple[0].length;
                for(let literal=readStaticLiteral(source,at);literal;literal=/^\s*,/.test(source.slice(literal.end))?readStaticLiteral(source,literal.end+source.slice(literal.end).indexOf(',')+1):null)addOccurrence(inventory,literal.value,sourcePath,source,literal.start);
            }
        }
        const unsupported=source.match(/return \['Unsupported action sequence format\.'/);
        if(unsupported)addOccurrence(inventory,'Unsupported action sequence format.',sourcePath,source,unsupported.index);
    }
    return Array.from(inventory, ([phrase, locations]) => ({
        phrase, sources: Array.from(locations).sort()
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
