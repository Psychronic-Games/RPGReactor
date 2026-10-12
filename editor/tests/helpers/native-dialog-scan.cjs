/**
 * Reading an editor source for its dialog calls: the browser's own alert /
 * confirm / prompt, the editor's RRDialog calls, and whether a question's
 * answer is waited for. Shared by themed-dialogs.test.cjs and
 * themed-dialogs-forge-db.test.cjs.
 */
'use strict';

const codeCache = new Map();

/** The source with comments, strings and regex literals blanked (same length, same lines); `${}` code in a template is kept. */
function codeOnly(source) {
    if (!codeCache.has(source)) codeCache.set(source, blankNonCode(source));
    return codeCache.get(source);
}

function blankNonCode(source) {
    const out = source.split('');
    const blank = (from, to) => { for (let i = from; i < to; i++) if (out[i] !== '\n') out[i] = ' '; };
    const length = source.length;
    const templates = [];       // brace depth to return to when the `${}` being read closes
    let depth = 0;
    let last = '';              // the last code character, for telling a regex from a division
    let i = 0;
    const readTemplate = start => {
        let j = start;
        while (j < length) {
            const c = source[j];
            if (c === '\\') { j += 2; continue; }
            if (c === '`') { blank(start, j); return { at: j + 1, open: false }; }
            if (c === '$' && source[j + 1] === '{') { blank(start, j); return { at: j + 2, open: true }; }
            j++;
        }
        blank(start, length);
        return { at: length, open: false };
    };
    while (i < length) {
        const c = source[i], next = source[i + 1];
        if (c === '/' && next === '/') { let j = i; while (j < length && source[j] !== '\n') j++; blank(i, j); i = j; continue; }
        if (c === '/' && next === '*') { let j = source.indexOf('*/', i + 2); j = j < 0 ? length : j + 2; blank(i, j); i = j; continue; }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < length && source[j] !== c && source[j] !== '\n') { if (source[j] === '\\') j++; j++; }
            blank(i + 1, j); i = j + 1; last = c; continue;
        }
        if (c === '`') {
            const template = readTemplate(i + 1);
            if (template.open) { templates.push(depth); depth = 0; }
            i = template.at; last = '`'; continue;
        }
        if (c === '{') { depth++; i++; last = c; continue; }
        if (c === '}') {
            if (depth === 0 && templates.length) {
                depth = templates.pop();
                const template = readTemplate(i + 1);
                if (template.open) { templates.push(depth); depth = 0; }
                i = template.at; last = '`'; continue;
            }
            depth = Math.max(0, depth - 1); i++; last = c; continue;
        }
        if (c === '/') {
            const before = source.slice(Math.max(0, i - 12), i);
            const afterValue = /[\w$)\]}`"']$/.test(last) && !/(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw|new|else|do)\s*$/.test(before);
            if (!afterValue) {
                let j = i + 1, inClass = false;
                while (j < length && source[j] !== '\n') {
                    const e = source[j];
                    if (e === '\\') { j += 2; continue; }
                    if (e === '[') inClass = true; else if (e === ']') inClass = false;
                    else if (e === '/' && !inClass) break;
                    j++;
                }
                if (source[j] === '/') { blank(i + 1, j); i = j + 1; last = '/'; continue; }
            }
        }
        if (!/\s/.test(c)) last = c;
        i++;
    }
    return out.join('');
}

const NATIVE_CALL = /(?:^|[^\w$.])((?:window|globalThis|self)\s*\.\s*)?(alert|confirm|prompt)\s*\(/g;

/**
 * Where a function of the file's own carries one of the names: `const confirm = () => {}` or
 * `function confirm() {}` is visible in the block that declares it, and a bare call there is that
 * function, not the browser's. [[start, end], ...] in the code.
 */
function ownBindings(code, name) {
    const ranges = [];
    const declaration = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=|\\bfunction\\s+${name}\\s*\\(`, 'g');
    let match;
    while ((match = declaration.exec(code))) {
        let start = 0, depth = 0;
        for (let i = match.index - 1; i >= 0; i--) {
            if (code[i] === '}') depth++;
            else if (code[i] === '{') { if (depth === 0) { start = i; break; } depth--; }
        }
        let end = code.length;
        depth = 0;
        for (let i = start; start > 0 && i < code.length; i++) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}' && --depth === 0) { end = i; break; }
        }
        ranges.push([start, end]);
    }
    return ranges;
}

/** The index of the parenthesis that closes the one at `open`. */
function closingParen(code, open) {
    let close = open, depth = 0;
    for (; close < code.length; close++) {
        if (code[close] === '(') depth++;
        else if (code[close] === ')' && --depth === 0) break;
    }
    return close;
}

/**
 * The browser's own dialog calls in one source: [{ line, name, text }]. A function DEFINED with one of
 * the names is not a call. A bare call inside a block that declares its own function of that name is that
 * function's, unless `ownFunctions` is 'count': then it is listed too, so a file can be held to not
 * borrowing the browser dialog's names at all.
 */
function nativeDialogCalls(source, { ownFunctions = 'skip' } = {}) {
    const code = codeOnly(source);
    const lines = source.split('\n');
    const found = [];
    const own = ownFunctions === 'count' ? null
        : { alert: ownBindings(code, 'alert'), confirm: ownBindings(code, 'confirm'), prompt: ownBindings(code, 'prompt') };
    NATIVE_CALL.lastIndex = 0;
    let match;
    while ((match = NATIVE_CALL.exec(code))) {
        const [, viaWindow, name] = match;
        const paren = match.index + match[0].length - 1;
        const line = code.slice(0, paren).split('\n').length;
        const head = code.slice(Math.max(0, match.index - 20), match.index + 1);
        if (/function\s*$/.test(head) || /(?:async|static|get|set)\s*$/.test(head)) continue;
        if (own && !viaWindow && own[name].some(([start, end]) => paren > start && paren < end)) continue;
        // `confirm(args) {` alone at the start of a line is a method.
        const close = closingParen(code, paren);
        const lineStart = code.lastIndexOf('\n', paren) + 1;
        const leading = code.slice(lineStart, paren - name.length);
        if (/^\s*$/.test(leading) && /^\s*\{/.test(code.slice(close + 1, close + 40))) continue;
        found.push({ line, name, text: lines[line - 1].trim() });
    }
    return found;
}

/** The text of every `RRDialog.<name>(...)` call in a source, from the name to its closing parenthesis. */
function dialogCalls(source, name) {
    const code = codeOnly(source);
    const calls = [];
    const pattern = new RegExp(`RRDialog\\.${name}\\(`, 'g');
    let match;
    while ((match = pattern.exec(code))) {
        const close = closingParen(code, match.index + match[0].length - 1);
        calls.push({ line: code.slice(0, match.index).split('\n').length, text: source.slice(match.index, close + 1) });
    }
    return calls;
}

/**
 * The calls matching `pattern` in a source: how many, and the lines of the
 * ones whose answer is dropped (not awaited, not returned to the caller by
 * `return` or as an arrow function's value, not followed by .then). A dropped
 * answer is a promise, and a promise read as an answer is always "yes".
 */
function answersWaited(source, pattern) {
    const code = codeOnly(source);
    const dropped = [];
    let total = 0, match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(code))) {
        total++;
        const close = closingParen(code, match.index + match[0].length - 1);
        // `window.RRDialog.confirm(...)` is the same call.
        const before = code.slice(Math.max(0, match.index - 40), match.index).replace(/(?:window|globalThis|self)\s*\.\s*$/, '');
        const after = code.slice(close + 1, close + 40);
        const waited = /\bawait\s*\(?\s*$/.test(before) || /\breturn\s+$/.test(before) || /=>\s*$/.test(before) || /^\s*\.then\(/.test(after);
        if (!waited) dropped.push(code.slice(0, match.index).split('\n').length);
    }
    return { total, dropped };
}

module.exports = { codeOnly, nativeDialogCalls, dialogCalls, answersWaited };
