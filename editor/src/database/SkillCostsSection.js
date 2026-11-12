/**
 * SkillCostsSection - a Costs card for Database > Skills, listing the skill
 * cost types the project defines in VisuStella's Skills and States Core.
 *
 * VisuMZ_1_SkillsStatesCore keeps its cost types in the `Costs:arraystruct`
 * parameter (HP, MP, TP, Gold, Potion, Item Cost, and whatever a project
 * adds). Each type's `CalcJS` reads the skill's Note with its own patterns:
 * `<Gold Cost: 100>`, `<HP Cost: 5%>`, `<Gold Cost Max: 500>`, a
 * `<JS Gold Cost>` block, `<Item Cost: 3 Potion>`. A cost with no field in
 * the Database is otherwise typed into the Note by hand.
 *
 * This card is a structured view of those tags. It appears only when the
 * project's `js/reactor_plugins.js` enables Skills and States Core and that
 * entry defines at least one cost type the card can read, and it stores
 * nothing but the notetag the plugin already parses. MP and TP keep their
 * own fields: their "value" here is the Invocation field itself.
 *
 * How a type's tags are found: every pattern in its `CalcJS` that starts
 * with `<` is compiled, and each tag the card could write is tried against
 * them. A form is offered only when the type's own pattern reads the card's
 * tag back with the number it was given, so the card never writes a tag the
 * plugin would not read. A type whose patterns fit none of the known shapes
 * is listed with a count of its tags and no fields.
 *
 * The pure half (tagLiterals, classify, costTypes, read, setValue, convert,
 * item entries) has no DOM and is what the tests drive; createSection builds
 * the card.
 */
(function(root) {
    'use strict';

    const PLUGIN = 'VisuMZ_1_SkillsStatesCore';
    const PARAM = 'Costs:arraystruct';

    // A flat <MP Cost: x> or <TP Cost: x> is not read by CalcJS: the plugin
    // copies it over the record's own field when the database loads
    // (VisuMZ.SkillsStatesCore.Parse_Notetags_Skill_Cost).
    const NATIVE_TAGS = { mpCost: /<MP COST:[ ](\d+)>/i, tpCost: /<TP COST:[ ](\d+)>/i };
    const NATIVE_POOLS = { mpCost: 'mp', tpCost: 'tp' };

    // Item costs name a record of one of three lists.
    const ITEM_KINDS = [
        { kind: 'item', word: 'Item', data: '$dataItems', list: 'items' },
        { kind: 'weapon', word: 'Weapon', data: '$dataWeapons', list: 'weapons' },
        { kind: 'armor', word: 'Armor', data: '$dataArmors', list: 'armors' }
    ];

    const asText = value => String(value == null ? '' : value);

    // ----------------------------------------------------------- manifest

    /** The enabled manifest entry named `name`, or null. Disabled is absent. */
    function enabledPlugin(manifest, name) {
        if (!Array.isArray(manifest)) return null;
        return manifest.find(plugin => plugin && plugin.name === name && plugin.status === true) || null;
    }

    /** A VisuStella `:arraystruct` parameter as its structs; [] when absent or malformed. */
    function structList(raw) {
        let list = raw;
        if (typeof raw === 'string') {
            try { list = raw.trim() ? JSON.parse(raw) : []; } catch (error) { return []; }
        }
        if (!Array.isArray(list)) return [];
        return list.map(entry => {
            if (entry && typeof entry === 'object') return entry;
            try { const parsed = JSON.parse(entry); return parsed && typeof parsed === 'object' ? parsed : null; } catch (error) { return null; }
        });
    }

    // ----------------------------------------------------------- patterns

    /**
     * The note-tag patterns in a piece of plugin code: every regex literal
     * that starts with `<`, compiled. Only those are looked for, so a
     * division sign elsewhere in the code is never taken for a pattern.
     * `onNote` says the literal is the argument of `note.match(`, the way a
     * skill's own tag is read (a pattern matched on `obj.note` belongs to
     * the battler's traits).
     */
    function tagLiterals(code) {
        const text = asText(code), found = [];
        for (let at = text.indexOf('/<'); at >= 0; at = text.indexOf('/<', at + 1)) {
            const before = text[at - 1];
            if (before === '/' || before === '<' || before === '\\' || before === '*') continue;
            let i = at + 1, inClass = false, closed = false;
            for (; i < text.length; i++) {
                const c = text[i];
                if (c === '\n' || c === '\r') break;
                if (c === '\\') { i++; continue; }
                if (inClass) { if (c === ']') inClass = false; continue; }
                if (c === '[') { inClass = true; continue; }
                if (c === '/') { closed = true; break; }
            }
            if (!closed) continue;
            const source = text.slice(at + 1, i);
            const flags = (/^[dgimsuy]*/.exec(text.slice(i + 1)) || [''])[0];
            let regex = null;
            try { regex = new RegExp(source, flags.replace(/[gyd]/g, '')); } catch (error) { regex = null; }
            if (regex) {
                found.push({
                    source, flags, regex, global: flags.includes('g'),
                    onNote: /(^|[^.\w$])note\s*\.\s*match\s*\(\s*$/.test(text.slice(Math.max(0, at - 40), at))
                });
            }
            at = i;
        }
        return found;
    }

    /** The plain word a pattern's tag starts with (`<HP COST:` gives HP), or ''. */
    function wordOf(literal) {
        const found = /^<(?:JS )?([A-Za-z0-9][A-Za-z0-9 _-]*?) COST\b/i.exec(literal.source);
        return found ? found[1] : '';
    }

    /** The tag the card writes for one form of a cost. */
    function formatTag(word, kind, value) {
        if (kind === 'percent') return `<${word} Cost: ${value}%>`;
        if (kind === 'max') return `<${word} Cost Max: ${value}>`;
        if (kind === 'min') return `<${word} Cost Min: ${value}>`;
        return `<${word} Cost: ${value}>`;
    }

    /** The tag for one item cost; the plugin finds the record by its name. */
    function formatItemTag(word, amount, name) {
        return `<${word} Cost: ${amount} ${name}>`;
    }

    const wholeMatch = (regex, probe) => { const found = regex.exec(probe); return found && found[0] === probe ? found : null; };

    /** The forms of `word`'s tag that these patterns read back as written. */
    function scalarForms(word, literals) {
        const forms = {};
        const one = kind => literals.find(literal => {
            const found = wholeMatch(literal.regex, formatTag(word, kind, 7));
            return !!found && found.length === 2 && found[1] === '7' && !literal.global;
        });
        const flat = one('flat');
        if (flat && !flat.regex.test(formatTag(word, 'flat', '+7'))) forms.flat = flat;
        // The skill's own percent takes whole numbers; the battler's rate tag takes decimals too.
        const percent = literals.find(literal => {
            if (!literal.onNote || literal.global) return false;
            const found = wholeMatch(literal.regex, formatTag(word, 'percent', 7));
            return !!found && found.length <= 3 && found[1] === '7' && !literal.regex.test(formatTag(word, 'percent', '7.5'));
        });
        if (percent) forms.percent = percent;
        const max = one('max'), min = one('min');
        if (max) forms.max = max;
        if (min) forms.min = min;
        const js = literals.find(literal => literal.regex.test(`<JS ${word} Cost>\ncost = 7;\n</JS ${word} Cost>`));
        if (js) forms.js = js;
        return forms;
    }

    /** The record lists this code takes a name-and-amount cost from. */
    function itemForms(code, literals) {
        const text = asText(code);
        if (!/\.name\b/.test(text)) return [];
        return ITEM_KINDS.map(each => {
            if (!text.includes(each.data)) return null;
            const probe = formatItemTag(each.word, 7, 'Probe Name');
            const literal = literals.find(candidate => {
                const found = wholeMatch(candidate.regex, probe);
                return !!found && found.length === 3 && found[1] === '7' && found[2] === 'Probe Name';
            });
            return literal ? Object.assign({ regex: literal.regex }, each) : null;
        }).filter(Boolean);
    }

    /**
     * One entry of `Costs:arraystruct` as the card sees it, or null when its
     * code reads nothing from the Note the card could show.
     *   type 'scalar': a number (flat, percent or the record's own field)
     *   type 'items':  a list of record-and-amount tags
     *   type 'other':  tags the card counts and does not edit
     */
    function classify(struct, index) {
        if (!struct || typeof struct !== 'object') return null;
        const name = asText(struct['Name:str']).trim();
        let code = struct['CalcJS:func'];
        if (typeof code === 'string') {
            try { const parsed = JSON.parse(code); if (typeof parsed === 'string') code = parsed; } catch (error) { /* already code */ }
        }
        code = asText(code);
        const literals = tagLiterals(code);
        const words = [];
        for (const word of [name].concat(literals.map(wordOf))) {
            if (word && !words.some(other => other.toLowerCase() === word.toLowerCase())) words.push(word);
        }
        let word = name, forms = {};
        for (const candidate of words) {
            const found = scalarForms(candidate, literals);
            if (found.flat || found.percent) { word = candidate; forms = found; break; }
        }
        const nativeField = /\bskill\s*\.\s*(mpCost|tpCost)\b/.exec(code);
        const native = !forms.flat && nativeField ? nativeField[1] : '';
        const items = forms.flat || forms.percent || native ? [] : itemForms(code, literals);
        const type = forms.flat || forms.percent || native ? 'scalar' : items.length ? 'items' : literals.length ? 'other' : '';
        if (!type) return null;
        return { index, name: name || word, icon: Number(struct['Icon:num']) || 0, word, forms, native, items, literals, type };
    }

    /** The cost types of an enabled Skills and States Core, in its order; [] without one. */
    function costTypes(manifest) {
        const core = enabledPlugin(manifest, PLUGIN);
        if (!core || !core.parameters) return [];
        return structList(core.parameters[PARAM]).map((struct, index) => classify(struct, index)).filter(Boolean);
    }

    // ------------------------------------------------------------ reading

    /** Every match of a pattern in a note, in order: `{ index, text, groups }`. */
    function matchesOf(regex, note) {
        const all = new RegExp(regex.source, regex.flags.replace(/[gy]/g, '') + 'g'), found = [], text = asText(note);
        for (let match = all.exec(text); match; match = all.exec(text)) {
            found.push({ index: match.index, text: match[0], groups: Array.from(match).slice(1) });
            if (match[0] === '') all.lastIndex++;
        }
        return found;
    }

    /**
     * What a skill sets for one scalar cost. Each form is null or `{ value,
     * count }`: the plugin reads the first tag of a form and no other, so
     * `count` above 1 means later ones are ignored.
     */
    function read(entry, note, record) {
        const text = asText(note);
        const form = kind => {
            const pattern = entry.forms[kind];
            if (!pattern) return null;
            const found = matchesOf(pattern.regex, text);
            return found.length ? { value: Number(found[0].groups[0]) || 0, count: found.length } : null;
        };
        const state = { flat: form('flat'), percent: form('percent'), max: form('max'), min: form('min') };
        state.js = !!entry.forms.js && entry.forms.js.regex.test(text);
        state.native = entry.native ? Number(record && record[entry.native]) || 0 : 0;
        state.override = entry.native ? NATIVE_TAGS[entry.native].test(text) : false;
        return state;
    }

    /** How many tags of an entry stand in a note (each place counted once). */
    function tagCount(entry, note) {
        const places = new Set();
        for (const literal of entry.literals) for (const found of matchesOf(literal.regex, note)) places.add(found.index);
        return places.size;
    }

    /** The item costs of a note, in the note's order: `{ kind, word, amount, name, at }`. */
    function readItems(entry, note) {
        const found = [];
        for (const each of entry.items) {
            for (const match of matchesOf(each.regex, note)) {
                found.push({ kind: each.kind, word: each.word, list: each.list, amount: Number(match.groups[0]) || 0, name: asText(match.groups[1]).trim(), at: match.index, text: match.text });
            }
        }
        return found.sort((a, b) => a.at - b.at);
    }

    /**
     * The record an item cost names, the way the plugin finds it: the first
     * of the list whose name is the same, upper-cased and trimmed.
     * Gives `{ record, twins }`; `twins` counts the records of that name.
     */
    function resolveItem(name, records) {
        const wanted = asText(name).toUpperCase().trim();
        const same = (Array.isArray(records) ? records : []).filter(record => record && asText(record.name).toUpperCase().trim() === wanted);
        return { record: same[0] || null, twins: same.length };
    }

    // ------------------------------------------------------------ writing

    const lineEnd = note => (/\r\n/.test(note) ? '\r\n' : '\n');

    /** The note with a tag added on a line of its own, using the note's line ends. */
    function appendTag(note, tag) {
        const text = asText(note);
        if (!text.trim()) return tag;
        return /[\r\n]$/.test(text) ? text + tag + lineEnd(text) : text + lineEnd(text) + tag;
    }

    /** The note without `[start, end)`; a tag alone on its line goes with the line. */
    function cut(note, start, end) {
        const text = asText(note);
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        let lineStop = text.indexOf('\n', end);
        if (lineStop === -1) lineStop = text.length;
        const alone = !text.slice(lineStart, start).trim() && !text.slice(end, lineStop).trim();
        if (!alone) return text.slice(0, start) + text.slice(end);
        if (lineStop < text.length) return text.slice(0, lineStart) + text.slice(lineStop + 1);
        let from = lineStart;
        if (from > 0) { from--; if (from > 0 && text[from - 1] === '\r') from--; }
        return text.slice(0, from);
    }

    /** The note without any tag a pattern reads. */
    function removeAll(note, regex) {
        let text = asText(note);
        const found = matchesOf(regex, text);
        for (let i = found.length - 1; i >= 0; i--) text = cut(text, found[i].index, found[i].index + found[i].text.length);
        return text;
    }

    const toCount = value => Math.max(0, Math.floor(Number(value) || 0));

    /**
     * The note with one form of a cost set to `value`: the number inside the
     * first tag replaced where it stands, a tag added when there was none,
     * every tag of the form removed for 0. A note that already says so comes
     * back as it was.
     */
    function setValue(note, entry, kind, value) {
        const text = asText(note), pattern = entry.forms[kind];
        if (!pattern) return text;
        const amount = toCount(value);
        if (amount <= 0) return removeAll(text, pattern.regex);
        const found = matchesOf(pattern.regex, text);
        if (!found.length) return appendTag(text, formatTag(entry.word, kind, amount));
        const first = found[0], digits = first.groups[0];
        if (digits === String(amount)) return text;
        const colon = first.text.indexOf(':');
        const at = first.text.indexOf(digits, colon < 0 ? 0 : colon);
        if (at < 0) return text;
        return text.slice(0, first.index + at) + amount + text.slice(first.index + at + digits.length);
    }

    /**
     * The note with a cost moved from one unit to the other (flat and
     * percent): the first tag of the old form becomes the new one where it
     * stood, and no tag of the old form is left.
     */
    function convert(note, entry, from, to, value) {
        const text = asText(note), old = entry.forms[from], next = entry.forms[to];
        if (!next) return text;
        const amount = toCount(value);
        if (!old) return setValue(text, entry, to, amount);
        const found = matchesOf(old.regex, text);
        if (!found.length || amount <= 0 || matchesOf(next.regex, text).length) return setValue(removeAll(text, old.regex), entry, to, amount);
        const first = found[0];
        const swapped = text.slice(0, first.index) + formatTag(entry.word, to, amount) + text.slice(first.index + first.text.length);
        return removeAll(swapped, old.regex);
    }

    /** The note with an item cost added, or the amount of the one it already has for that name changed. */
    function setItem(note, entry, kind, name, amount) {
        const text = asText(note), each = entry.items.find(item => item.kind === kind);
        const wanted = asText(name).trim(), count = toCount(amount);
        if (!each || !wanted || /[<>\r\n]/.test(wanted)) return text;
        const same = readItems(entry, text).filter(item => item.kind === kind && item.name.toUpperCase() === wanted.toUpperCase());
        if (count <= 0) {
            let out = text;
            for (let i = same.length - 1; i >= 0; i--) out = cut(out, same[i].at, same[i].at + same[i].text.length);
            return out;
        }
        if (!same.length) return appendTag(text, formatItemTag(each.word, count, wanted));
        // The plugin keeps the last tag of a name: that is the one to change.
        const last = same[same.length - 1], digits = String(last.amount);
        if (last.amount === count) return text;
        const colon = last.text.indexOf(':'), at = last.text.indexOf(digits, colon < 0 ? 0 : colon);
        if (at < 0) return text;
        return text.slice(0, last.at + at) + count + text.slice(last.at + at + digits.length);
    }

    /** The note without the item cost tag that stands at `at`. */
    function removeItemAt(note, entry, at) {
        const text = asText(note), found = readItems(entry, text).find(item => item.at === at);
        return found ? cut(text, found.at, found.at + found.text.length) : text;
    }

    /** The note with the amount of the item cost tag at `at` changed; 0 removes the tag. */
    function setItemAmountAt(note, entry, at, amount) {
        const text = asText(note), found = readItems(entry, text).find(item => item.at === at), count = toCount(amount);
        if (!found) return text;
        if (count <= 0) return cut(text, found.at, found.at + found.text.length);
        const digits = (/:\D*(\d+)/.exec(found.text) || [])[1];
        if (!digits || digits === String(count)) return text;
        const place = found.text.indexOf(digits, found.text.indexOf(':'));
        return text.slice(0, found.at + place) + count + text.slice(found.at + place + digits.length);
    }

    /** The names an item cost can be written for: each name once, the way the plugin finds it, none that a tag cannot hold. */
    function itemNames(records) {
        const seen = new Set(), names = [];
        for (const record of Array.isArray(records) ? records : []) {
            const name = record ? asText(record.name).trim() : '';
            if (!name || /[<>\r\n]/.test(name) || seen.has(name.toUpperCase())) continue;
            seen.add(name.toUpperCase());
            names.push({ name, icon: Number(record.iconIndex) || 0 });
        }
        return names;
    }

    // ---------------------------------------------------------------- DOM

    const tt = text => (root.I18n ? root.I18n.tText(text) : text);
    const escape = text => (typeof root.rrEscapeHtml === 'function'
        ? root.rrEscapeHtml(text)
        : asText(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const fire = (element, type) => element.dispatchEvent(typeof window !== 'undefined' && typeof window.Event === 'function' ? new window.Event(type, { bubbles: true }) : { type, bubbles: true });

    function readManifest(projectManager) {
        const project = projectManager && typeof projectManager.getCurrentProject === 'function' ? projectManager.getCurrentProject() : null;
        const reader = root.RRTextCodes && root.RRTextCodes.readManifest;
        if (!project || !project.path || typeof reader !== 'function') return null;
        const plugins = reader(project.path);
        return Array.isArray(plugins) ? plugins : null;
    }

    function iconHtml(index) {
        const icons = root.RRIconCodes;
        if (!icons || !(index > 0)) return '';
        return `<span class="rr-icon-code" style="${escape(icons.cellCss(index, icons.iconSetUrl()))}"></span> `;
    }

    const WARN = 'var(--color-warning, #d9a400)';
    const MISSING = 'var(--color-danger-bright)';
    const BLANK = '<td style="width: 3px; padding: 0; border: none; background: transparent;"></td>';

    /**
     * The rows of the card for a note: one per scalar cost (two when the
     * note sets both its flat and its percent tag), one per item cost, one
     * per type the card only counts.
     */
    function rowsFor(types, note, record, options) {
        const settings = options || {}, rows = [];
        for (const entry of types) {
            if (entry.type === 'other') {
                rows.push({ key: `${entry.index}:other`, entry, type: 'other', count: tagCount(entry, note) });
                continue;
            }
            if (entry.type === 'items') {
                const items = readItems(entry, note);
                items.forEach((item, at) => {
                    const found = resolveItem(item.name, settings.records ? settings.records(item.list) : []);
                    // The plugin keeps one amount for a record: the last tag that names it.
                    const replaced = items.slice(at + 1).some(later => later.kind === item.kind && later.name.toUpperCase() === item.name.toUpperCase());
                    rows.push({ key: `${entry.index}:item:${at}:${item.kind}:${item.name}`, entry, type: 'item', item, found, replaced });
                });
                rows.push({ key: `${entry.index}:items`, entry, type: 'items', count: items.length });
                continue;
            }
            const state = read(entry, note, record);
            const canFlat = !!entry.forms.flat || !!entry.native, canPercent = !!entry.forms.percent;
            const flatValue = entry.forms.flat ? (state.flat ? state.flat.value : 0) : state.native;
            const hasFlat = entry.forms.flat ? !!state.flat : state.native > 0, hasPercent = !!state.percent;
            // A pool the project turned off shows no field of its own; nor does the card, unless the note still sets it.
            if (entry.native && settings.poolOff && settings.poolOff(NATIVE_POOLS[entry.native]) && !hasFlat && !hasPercent && !state.max && !state.min && !state.js) continue;
            const base = { entry, type: 'scalar', state, canFlat, canPercent };
            if (hasFlat && hasPercent) {
                rows.push(Object.assign({ key: `${entry.index}:flat`, unit: 'flat', value: flatValue, fixed: true, limits: true }, base));
                rows.push(Object.assign({ key: `${entry.index}:percent`, unit: 'percent', value: state.percent.value, fixed: true, limits: false }, base));
                continue;
            }
            const chosen = settings.units ? settings.units[entry.index] : '';
            const unit = hasPercent ? 'percent' : hasFlat ? 'flat' : (chosen === 'percent' && canPercent) || !canFlat ? 'percent' : 'flat';
            rows.push(Object.assign({ key: `${entry.index}:one`, unit, value: unit === 'percent' ? (state.percent ? state.percent.value : 0) : flatValue, fixed: !(canFlat && canPercent), limits: true }, base));
        }
        return rows;
    }

    /** What a scalar row has to say beside its fields. */
    function rowFlags(row) {
        const flags = [], state = row.state;
        if (!state) return flags;
        if (row.limits && state.js) flags.push(tt('A JS block in the Note also sets this cost'));
        if (row.limits && state.override) flags.push(tt('A tag in the Note replaces the field above'));
        const form = row.unit === 'percent' ? state.percent : state.flat;
        const repeated = (form && form.count > 1) || (row.limits && ((state.max && state.max.count > 1) || (state.min && state.min.count > 1)));
        if (repeated) flags.push(tt('Only the first tag is read'));
        return flags;
    }

    /**
     * The Costs card for one skill, or null when the project does not enable
     * Skills and States Core or it defines no cost type the card can read.
     *
     *   RRSkillCosts.createSection({ record: skill, databaseManager, projectManager })
     *
     * The card edits the skill's Note through the page's own textarea and a
     * record field through the page's own input, firing `change` on each, so
     * the page keeps them the way it keeps what is typed there. Nothing is
     * written until one of the card's fields is changed, and a change that
     * leaves the note as it was writes nothing.
     */
    function createSection(options) {
        if (typeof document === 'undefined' || !options || !options.record) return null;
        const { record, databaseManager, projectManager } = options;
        const manifest = options.manifest !== undefined ? options.manifest : readManifest(projectManager);
        const types = costTypes(manifest);
        if (!types.length) return null;

        const section = document.createElement('div');
        section.className = 'database-section skill-costs-section';
        section.innerHTML = `
            <div class="database-section-header" data-section-key="skill-costs">${tt('Skill Costs')}</div>
            <div class="database-section-content">
                <table class="traits-table skill-costs-table" style="table-layout: fixed; width: 100%;">
                    <thead>
                        <tr>
                            ${BLANK.replace('<td', '<th').replace('</td>', '</th>')}
                            <th style="width: 20%;">${tt('Cost')}</th>
                            <th style="width: 40%;">${tt('Amount')}</th>
                            <th style="width: 20%; overflow: hidden; text-overflow: ellipsis;" title="${escape(tt('Maximum'))}">${tt('Maximum')}</th>
                            <th style="width: 20%; overflow: hidden; text-overflow: ellipsis;" title="${escape(tt('Minimum'))}">${tt('Minimum')}</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <div style="margin-top: 6px; font-size: 11px; color: var(--color-text-muted);">${tt('Stored in the Note as notetags.')}</div>
                ${types.some(type => type.native) ? `<div class="rr-cost-native-note" style="margin-top: 2px; font-size: 11px; color: var(--color-text-muted);">${tt('MP and TP: Value is the cost field under Invocation, the same number in both places. % is a notetag the plugin adds on top of that field.')}</div>` : ''}
            </div>
        `;
        const tbody = section.querySelector('tbody');
        const units = {};
        let noteField = null, writing = false, drawn = '';

        const host = () => (section.parentElement && section.parentElement.closest ? section.parentElement.closest('#database-detail') : null) || document;
        const kept = () => (databaseManager && typeof databaseManager.getSkill === 'function' && databaseManager.getSkill(record.id)) || record;
        const findNote = () => {
            if (noteField && noteField.isConnected) return noteField;
            noteField = host().querySelector(`textarea[data-field="note"][data-skill-id="${record.id}"]`);
            return noteField;
        };
        const nativeInput = field => host().querySelector(`input[data-field="${field}"][data-skill-id="${record.id}"]`);
        // The Note's field shows every line end as a line feed: while it shows what the record holds, the record's text is the Note.
        const currentNote = () => {
            const field = findNote(), held = asText(kept().note);
            if (!field) return held;
            const shown = asText(field.value);
            return shown === held || shown === held.replace(/\r\n?/g, '\n') ? held : shown;
        };
        const live = () => {
            const held = kept(), copy = { id: record.id };
            for (const field of Object.keys(NATIVE_TAGS)) {
                const input = nativeInput(field);
                copy[field] = input ? Number(input.value) || 0 : Number(held[field]) || 0;
            }
            return copy;
        };
        const poolOff = key => {
            const system = databaseManager && typeof databaseManager.getSystem === 'function' ? databaseManager.getSystem() : null;
            return !!(root.ResourcePools && system && root.ResourcePools.isOff(system, key));
        };

        const commitNote = next => {
            if (next === currentNote()) return;
            const field = findNote();
            record.note = next;
            if (field) {
                field.value = next;
                writing = true;
                try { fire(field, 'change'); } finally { writing = false; }
            }
            const held = kept();
            if (held.note !== next) {
                held.note = next;
                if (!field && databaseManager && typeof databaseManager.updateSkill === 'function') databaseManager.updateSkill(record.id, held);
            }
        };
        const commitNative = (field, value) => {
            const input = nativeInput(field), amount = toCount(value);
            if (input) {
                if ((Number(input.value) || 0) === amount) return;
                input.value = String(amount);
                writing = true;
                try { fire(input, 'change'); } finally { writing = false; }
                return;
            }
            const held = kept();
            if ((Number(held[field]) || 0) === amount) return;
            held[field] = amount;
            record[field] = amount;
            if (databaseManager && typeof databaseManager.updateSkill === 'function') databaseManager.updateSkill(record.id, held);
        };

        const numberCell = (name, value, shown) => (shown
            ? `<input type="number" min="0" class="database-field-value" style="flex: 1 1 0; width: 100%; min-width: 0;" data-cost-field="${name}" value="${escape(value)}">`
            : '');
        // Each row is followed by a line of its own for what it has to say, shown only when it says something.
        const rowHtml = (row, at) => {
            const name = `<td data-rr-i18n-skip style="overflow-wrap: anywhere;">${iconHtml(row.entry.icon)}${escape(row.entry.name)}</td>`;
            const flags = `<tr class="rr-cost-flags" data-flags-at="${at}" hidden style="display: none;">${BLANK}<td colspan="4" class="rr-cost-notes" style="font-size: 11px; color: ${WARN}; padding-top: 0;"></td></tr>`;
            const line = cells => `<tr data-at="${at}">${BLANK}${cells}</tr>${flags}`;
            if (row.type === 'items') {
                const kinds = row.entry.items.map(each => `<option value="${each.kind}">${escape(tt(each.word))}</option>`).join('');
                return line(`${name}<td colspan="3"><span style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <select class="database-field-value" data-cost-field="add-kind" style="flex: 0 0 auto;">${kinds}</select>
                    <select class="database-field-value" data-cost-field="add-name" data-rr-i18n-skip style="flex: 1 1 90px; min-width: 0;"></select>
                    <input type="number" min="1" value="1" class="database-field-value" data-cost-field="add-amount" style="flex: 0 0 56px; width: 56px;">
                    <button type="button" class="rr-btn-chip" data-cost-field="add">${tt('Add')}</button></span></td>`);
            }
            if (row.type === 'other') {
                return line(`${name}<td colspan="3" class="rr-cost-count" style="color: var(--color-text-muted); font-style: italic;"></td>`);
            }
            if (row.type === 'item') {
                const icon = row.found.record ? iconHtml(Number(row.found.record.iconIndex) || 0) : '';
                return line(`<td data-rr-i18n-skip style="overflow-wrap: anywhere; padding-left: 18px;${row.found.record ? '' : ` color: ${MISSING};`}">${icon}${escape(row.item.name)}</td>
                    <td>${numberCell('item', row.item.amount, true)}</td>
                    <td colspan="2"><span style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;"><span style="color: var(--color-text-muted);">${escape(tt(row.item.word))}</span><button type="button" class="rr-btn-chip" data-cost-field="remove">${tt('Delete')}</button></span></td>`);
            }
            const unit = row.fixed
                ? (row.unit === 'percent' ? '<span data-rr-i18n-skip>%</span>' : '')
                : `<select class="database-field-value" data-cost-field="unit" style="flex: 0 0 auto;"><option value="flat">${tt('Value')}</option><option value="percent" data-rr-i18n-skip>%</option></select>`;
            return line(`${name}
                <td><span style="display: flex; align-items: center; gap: 4px;">${numberCell('amount', row.value, true)}${unit}</span></td>
                <td>${numberCell('max', '', row.limits && !!row.entry.forms.max)}</td>
                <td>${numberCell('min', '', row.limits && !!row.entry.forms.min)}</td>`);
        };
        const records = list => {
            const getter = { items: 'getItems', weapons: 'getWeapons', armors: 'getArmors' }[list];
            const found = databaseManager && typeof databaseManager[getter] === 'function' ? databaseManager[getter]() : null;
            return Array.isArray(found) ? found : [];
        };
        // The names the Add row offers for the kind chosen there.
        const listNames = (line, kind) => {
            const select = line.querySelector('[data-cost-field="add-name"]');
            const each = ITEM_KINDS.find(item => item.kind === kind);
            if (!select || !each) return;
            select.innerHTML = itemNames(records(each.list)).map(item => `<option value="${escape(item.name)}">${escape(item.name)}</option>`).join('');
        };
        const setField = (line, name, value) => {
            const field = line.querySelector(`[data-cost-field="${name}"]`);
            if (field && asText(field.value) !== asText(value)) field.value = asText(value);
        };
        const say = (flagLine, flags) => {
            if (!flagLine) return;
            const notes = flagLine.querySelector('.rr-cost-notes'), text = flags.join(' · ');
            if (notes && notes.textContent !== text) notes.textContent = text;
            flagLine.hidden = !text;
            flagLine.style.display = text ? '' : 'none';
        };
        const fill = (line, row, flagLine) => {
            if (row.type === 'other') {
                const count = line.querySelector('.rr-cost-count');
                if (count) count.textContent = row.count ? `${tt('Set in the Note')} (${row.count})` : '';
                return;
            }
            if (row.type === 'items') {
                const kind = line.querySelector('[data-cost-field="add-kind"]');
                if (kind && !line.querySelector('[data-cost-field="add-name"] option')) listNames(line, kind.value);
                return;
            }
            if (row.type === 'item') {
                setField(line, 'item', row.item.amount);
                const flags = [];
                if (!row.found.record) flags.push(tt('No record has this name'));
                else if (row.found.twins > 1) flags.push(tt('Several records have this name: the first is used'));
                if (row.replaced) flags.push(tt('A later tag replaces this one'));
                say(flagLine, flags);
                return;
            }
            setField(line, 'amount', row.value);
            setField(line, 'unit', row.unit);
            if (row.limits) {
                setField(line, 'max', row.state.max ? row.state.max.value : '');
                setField(line, 'min', row.state.min ? row.state.min.value : '');
            }
            say(flagLine, rowFlags(row));
        };

        let rows = [];
        const render = () => {
            rows = rowsFor(types, currentNote(), live(), { units, poolOff, records });
            const shape = rows.map(row => `${row.key}:${row.fixed ? 1 : 0}:${row.unit && row.fixed ? row.unit : ''}`).join('|');
            if (shape !== drawn) {
                tbody.innerHTML = rows.map(rowHtml).join('');
                drawn = shape;
            }
            const lines = tbody.querySelectorAll('tr[data-at]'), flagLines = tbody.querySelectorAll('tr[data-flags-at]');
            rows.forEach((row, at) => { if (lines[at]) fill(lines[at], row, flagLines[at]); });
        };
        const rowOf = line => (line && line.dataset && line.dataset.at !== undefined ? rows[Number(line.dataset.at)] : null);

        const change = event => {
            const target = event.target, name = target && target.dataset ? target.dataset.costField : '';
            const line = name && target.closest ? target.closest('tr') : null;
            const row = rowOf(line);
            if (!row) return;
            const entry = row.entry, note = currentNote();
            if (row.type === 'items') {
                if (name === 'add-kind') listNames(line, target.value);
                return;
            }
            if (row.type === 'item') {
                if (name === 'item') { commitNote(setItemAmountAt(note, entry, row.item.at, target.value)); render(); }
                return;
            }
            if (row.type !== 'scalar') return;
            if (name === 'max' || name === 'min') {
                commitNote(setValue(note, entry, name, target.value));
            } else if (name === 'amount') {
                if (row.unit === 'percent') commitNote(setValue(note, entry, 'percent', target.value));
                else if (entry.forms.flat) commitNote(setValue(note, entry, 'flat', target.value));
                else commitNative(entry.native, target.value);
            } else if (name === 'unit' && !row.fixed && target.value !== row.unit) {
                const next = target.value === 'percent' ? 'percent' : 'flat';
                units[entry.index] = next;
                if (row.value > 0) {
                    if (entry.forms.flat) {
                        commitNote(convert(note, entry, row.unit, next, row.value));
                    } else if (next === 'percent') {
                        commitNote(setValue(note, entry, 'percent', row.value));
                        commitNative(entry.native, 0);
                    } else {
                        commitNote(setValue(note, entry, 'percent', 0));
                        commitNative(entry.native, row.value);
                    }
                }
            }
            render();
        };
        tbody.addEventListener('change', change);
        tbody.addEventListener('click', event => {
            const target = event.target, name = target && target.dataset ? target.dataset.costField : '';
            if (name !== 'add' && name !== 'remove') return;
            const line = target.closest('tr'), row = rowOf(line);
            if (!row) return;
            const note = currentNote();
            if (name === 'remove' && row.type === 'item') {
                commitNote(removeItemAt(note, row.entry, row.item.at));
            } else if (name === 'add' && row.type === 'items') {
                const pick = field => { const found = line.querySelector(`[data-cost-field="${field}"]`); return found ? found.value : ''; };
                if (!pick('add-name')) return;
                commitNote(setItem(note, row.entry, pick('add-kind'), pick('add-name'), Math.max(1, toCount(pick('add-amount')))));
            }
            render();
        });

        // The page attaches the Note and its own fields in the same pass: listen once the card stands among them.
        setTimeout(() => {
            const field = findNote();
            let timer = null;
            // The Database may stand in a window of its own: its timers keep time while the editor's main window is behind it.
            const view = (field && field.ownerDocument && field.ownerDocument.defaultView) || root;
            const later = () => { if (writing) return; view.clearTimeout(timer); timer = view.setTimeout(render, 150); };
            if (field) {
                field.addEventListener('input', later);
                field.addEventListener('change', () => { if (!writing) render(); });
            }
            for (const name of Object.keys(NATIVE_TAGS)) {
                const input = nativeInput(name);
                if (input) input.addEventListener('change', () => { if (!writing) render(); });
            }
            render();
        }, 0);
        render();
        return section;
    }

    const api = {
        PLUGIN, PARAM, enabledPlugin, structList,
        tagLiterals, wordOf, formatTag, formatItemTag, scalarForms, itemForms, classify, costTypes,
        matchesOf, read, tagCount, readItems, resolveItem,
        appendTag, cut, removeAll, setValue, convert, setItem, removeItemAt, setItemAmountAt, itemNames,
        rowsFor, rowFlags, readManifest, createSection
    };

    root.RRSkillCosts = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
