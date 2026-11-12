/**
 * RPG Maker plugin annotation parsing shared by plugin configuration surfaces.
 */
(function(root) {
    const TAG_PATTERN = /@(param|text|desc|type|default|parent|on|off|min|max|dir|option|value|command|arg|plugindesc|author|help|url|target|base|decimals)\b/gi;
    const FREE_TEXT_TAGS = new Set(['text', 'desc', 'plugindesc', 'author', 'help', 'url']);

    const normalizeLine = line => String(line || '').trim().replace(/^\*\s?/, '');

    const cleanValue = value => String(value ?? '')
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
        .trim();

    const splitLine = line => {
        const source = String(line || '');
        const matches = [];
        TAG_PATTERN.lastIndex = 0;
        let match;
        while ((match = TAG_PATTERN.exec(source))) {
            matches.push({
                tag: match[1].toLowerCase(),
                index: match.index,
                end: match.index + match[0].length
            });
        }
        // Text-bearing annotations may legitimately mention strings such as
        // "@arg name". Inline schema forms begin with @param/@arg/@option, so
        // only those forms are split into multiple annotations on one line.
        if (matches.length && FREE_TEXT_TAGS.has(matches[0].tag)) matches.length = 1;
        return matches.map((item, index) => {
            const valueEnd = index + 1 < matches.length ? matches[index + 1].index : source.length;
            return {
                tag: item.tag,
                value: cleanValue(source.slice(item.end, valueEnd))
            };
        });
    };

    /**
     * The text of a line that carries on the description above it (` * @desc First line` / ` * second line`), or ''.
     * `lastTag` is the last tag applied to the parameter. A blank line, the end of the comment or a line that
     * begins with a tag this parser does not know (`@require 1`) ends the description.
     */
    const descContinuation = (line, lastTag) => {
        if (lastTag !== 'desc') return '';
        const text = cleanValue(line);
        return !text || text.startsWith('@') || text.startsWith('/') ? '' : text;
    };

    const applyToSchema = (schema, tag, value) => {
        if (!schema) return;
        switch (tag) {
            case 'text':
                schema.text = value;
                schema.textSpecified = true;
                break;
            case 'desc':
                schema.desc = schema.desc ? `${schema.desc} ${value}` : value;
                break;
            case 'type':
                schema.type = value;
                schema.typeSpecified = true;
                break;
            case 'parent':
                schema.parent = value;
                break;
            case 'default':
                schema.default = value;
                break;
            case 'on':
                schema.on = value;
                break;
            case 'off':
                schema.off = value;
                break;
            case 'min':
                schema.min = value.split(/\s+/, 1)[0] || value;
                break;
            case 'max':
                schema.max = value.split(/\s+/, 1)[0] || value;
                break;
            case 'decimals':
                schema.decimals = value.split(/\s+/, 1)[0] || value;
                break;
            case 'dir':
                schema.dir = value;
                break;
            case 'option':
                if (Array.isArray(schema.options)) schema.options.push(value);
                break;
            case 'value':
                if (Array.isArray(schema.options) && schema.options.length > 0) {
                    if (!Array.isArray(schema.values)) schema.values = [];
                    schema.values[schema.options.length - 1] = value;
                }
                break;
        }
    };

    const blankSchema = () => ({
        text: '',
        textSpecified: false,
        desc: '',
        type: 'string',
        typeSpecified: false,
        default: null,
        parent: null,
        on: null,
        off: null,
        min: null,
        max: null,
        decimals: null,
        dir: null,
        options: [],
        values: []
    });

    const parseStructDefinitions = source => {
        const structs = {};
        const structPattern = /\/\*~struct~([^:\r\n]+):([\s\S]*?)\*\//g;
        for (const match of String(source || '').matchAll(structPattern)) {
            const structName = cleanValue(match[1]);
            if (!structName) continue;
            const fields = {};
            structs[structName] = fields;
            let currentParam = null, lastTag = null;
            for (const line of match[2].split('\n')) {
                const text = normalizeLine(line), tokens = splitLine(text);
                if (!tokens.length) {
                    const more = currentParam && fields[currentParam] ? descContinuation(text, lastTag) : '';
                    if (more) applyToSchema(fields[currentParam], 'desc', more);
                    else lastTag = null;
                    continue;
                }
                for (const token of tokens) {
                    lastTag = token.tag;
                    if (token.tag === 'param') {
                        currentParam = token.value || null;
                        if (currentParam) fields[currentParam] = blankSchema();
                        continue;
                    }
                    if (currentParam && fields[currentParam]) {
                        applyToSchema(fields[currentParam], token.tag, token.value);
                    }
                }
            }
        }
        return structs;
    };

    const api = { applyToSchema, blankSchema, cleanValue, descContinuation, normalizeLine, parseStructDefinitions, splitLine };
    root.RRPluginAnnotations = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
